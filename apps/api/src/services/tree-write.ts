/**
 * **트리 쓰기의 트랜잭션** — 메뉴 · 페이지 트리를 바꾸는 라우트(`routes/menu.ts` · `routes/pages.ts`)가 `withTransaction` 대신 부른다.
 *
 * **COMMIT 답을 잃어도 커밋됐으면 성공으로 답하고 `menu-changed`를 낸다.** 라우트는 트랜잭션이 정상 반환한 뒤에만 방송한다 — 답을 잃은 쓰기가
 * 503 «모름»으로 끝나면 그 커밋의 신호가 아무 연결에도 안 가고, 남의 트리는 다음 신호 · 재연결까지 낡는다. 낸 탭도 «실패»를 말한다.
 *
 * 확인은 복원과 같은 길이다(`services/lost-commit.ts`의 `runConfirmedTransaction` — 그 xid 의 결말을 새 연결로 묻는다):
 *
 * | 결말 | 답 | 신호 |
 * |---|---|---|
 * | 커밋됐다 | **본문의 결과 그대로 — 답을 안 잃은 판과 같다** | 새 연결로 읽은 지금 번호로 여기서 낸다(라우트도 제 번호로 한 번 더 낸다 — 신호는 멱등이다) |
 * | 커밋 안 됐다(`aborted`) | 봉투 있는 500 «반영되지 않았습니다» | 안 낸다 |
 * | 한도 안에 결말을 모른다 | 503 «모름» | **그 뒤에 커밋되면 낸다**(아래) |
 *
 * **본문이 끝까지 돌았으면 그 결과가 곧 커밋된 결과다** — 라우트는 번호 · 만든 행을 결과나 바깥 변수에 **커밋 앞에서** 적으므로(`bumpMenuRev` 가
 * 맨 끝 문장) 커밋을 확인하면 그대로 성공으로 돌려줄 수 있다.
 *
 * **한도 뒤에 커밋된 것.** 확인 한도(`LOST_COMMIT_PROBE_MS`)를 넘겨도 끊긴 연결의 COMMIT 이 서버에서 아직 돌 수 있다(트리거 · 잠금 대기). 응답은 503 으로
 * 보내되 그 xid 의 결말을 `LOST_COMMIT_LATE_MS` 까지 응답 뒤에도 지켜보다 커밋되면 신호를 낸다(`runConfirmedTransaction` 의 `late` — 앱의 `lateCommits`). **편집 ·
 * 게시의 늦은 커밋은 번호 없는 `page-stale` 로 알린다**(`ws/notify.ts` 의 `pageStaleOnLateCommit`) — 그 방송은 번호 프레임(`seq` 의 이음)이라 늦게 내면 순서가 틀어진다.
 * **복원의 늦은 커밋은 제때와 같은 꼬리를 그대로 늦게 낸다**(`routes/snapshots.ts` 의 `announceRestore` — `restored` 는 번호를 안 싣고 `menu-changed` 는 이 파일과 같은 멱등 번호다).
 *
 * **지운 페이지의 잠금 놓기도 같은 자리에서 잇는다**(`goneOf`). 페이지 삭제 · 메뉴 연쇄 삭제는 커밋 뒤에 그 페이지들의 잠금을 놓는데(`ws/lock.ts` 의
 * `releaseLocksOnPages`), 응답이 503 «모름»이면 라우트의 그 줄은 안 돈다 — 늦은 커밋 지켜보기가 신호만 내고 놓기를 안 이으면 잠금이 룸의 목록에 TTL 이나 쥔
 * 화면이 놓을 때까지 남는다. 그래서 **놓기도 신호처럼 여기서 한 번만 쓴다**(제때 커밋된 판도 같은 자리를 지난다 — 라우트가 따로 부르지 않는다).
 *
 * **지금 번호로 낸다 — 이 쓰기가 올린 번호가 아니라.** 그 번호가 이 쓰기의 것 이상이면 받는 쪽은 그 판까지 받고, 그 사이 더 나아갔으면
 * 받는 쪽이 이미 가진 번호라 넘긴다(신호는 멱등이다 — 번호가 화면의 판보다 클 때만 다시 받는다).
 *
 * 잰 값은 `test/menu-changed.test.ts` «답을 잃은 쓰기»(`pg-fault-proxy`가 번호 문장 뒤의 COMMIT 답을 끊는다).
 */
import type { FastifyInstance } from 'fastify'
import type { DbHandle } from '../db/tx'
import { readMenuRevWithin } from '../repos/menu'
import { releaseLocksOnPages } from '../ws/lock'
import { notifyMenuChanged } from '../ws/notify'
import { LOST_COMMIT_PROBE_MS, runConfirmedTransaction } from './lost-commit'

export async function runTreeTransaction<T>(
  app: FastifyInstance,
  projectId: string,
  fn: (trx: DbHandle) => Promise<T>,
  /** 이 쓰기가 지운 페이지 id — 커밋이 확인된 뒤(제때든 늦게든) 그 잠금을 놓는다. 안 지웠으면 빈 목록. 안 주면 놓을 것이 없는 쓰기다. */
  goneOf?: (result: T) => readonly string[],
): Promise<T> {
  const releaseGone = (result: T): void => {
    const gone = goneOf?.(result) ?? []
    if (gone.length > 0) releaseLocksOnPages(app, projectId, gone)
  }
  const signal = async (ms: number): Promise<void> => {
    const rev = await readMenuRevWithin(app.db, projectId, ms)
    if (rev !== null) notifyMenuChanged(app, { projectId, rev })
  }
  const { result } = await runConfirmedTransaction(
    app.db,
    fn,
    async (_result, deadline) => {
      await signal(deadline - Date.now())
      // 커밋을 확인했다 — 본문의 결과가 성공이다(머리말). 지금 번호를 못 읽었어도 커밋은 확인됐다.
      return true
    },
    // 한도 안에 결말이 안 났다 — 503 «모름» 뒤에 커밋되면 신호를 내고 지운 페이지의 잠금을 놓는다(머리말의 «한도 뒤에 커밋된 것»).
    {
      watch: app.lateCommits,
      onCommit: async (body) => {
        releaseGone(body)
        await signal(LOST_COMMIT_PROBE_MS)
      },
    },
  )
  releaseGone(result)
  return result
}
