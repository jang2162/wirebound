/**
 * **트리 쓰기의 트랜잭션** — 메뉴 · 페이지 트리를 바꾸는 라우트(`routes/menu.ts` · `routes/pages.ts`)가 `withTransaction` 대신 부른다.
 *
 * **COMMIT 답을 잃어도 커밋됐으면 `menu-changed`를 낸다.** 라우트는 트랜잭션이 정상 반환한 뒤에만 방송한다 — 답을 잃은 쓰기는
 * 503 «모름»으로 끝나 그 커밋의 신호가 아무 연결에도 안 가고, 남의 트리는 다음 신호 · 재연결까지 낡는다. 낸 탭도 그 503 을 실패로
 * 말하고 다시 받지 않는다(`apps/web`의 `tree/use-tree-commands.tsx` — 트리 조작의 실패는 404 만 다시 받는다).
 *
 * 확인은 복원과 같은 길이다(`services/lost-commit.ts`의 `runConfirmedTransaction` — 그 xid 의 결말을 새 연결로 묻는다):
 *
 * | 결말 | 답 | 신호 |
 * |---|---|---|
 * | 커밋됐다 | 원래 오류(503 «모름») 그대로 | **새 연결로 읽은 지금 번호로 낸다** |
 * | 커밋 안 됐다(`aborted`) | 봉투 있는 500 «반영되지 않았습니다» | 안 낸다 |
 * | 한도 안에 결말을 모른다 | 503 «모름» | 안 낸다 |
 *
 * **답은 503 그대로 둔다** — 라우트마다 결과의 꼴(번호를 결과에 싣는가 · 바깥 변수에 적는가)이 달라 커밋된 결과를 성공으로 되돌려
 * 줄 자리가 하나가 아니다. 신호만 있으면 낸 탭도 그 신호로 트리를 다시 받는다(낸 연결도 받는다 — `ws/notify.ts`의 `notifyMenuChanged`).
 *
 * **지금 번호로 낸다 — 이 쓰기가 올린 번호가 아니라.** 그 번호가 이 쓰기의 것 이상이면 받는 쪽은 그 판까지 받고, 그 사이 더 나아갔으면
 * 받는 쪽이 이미 가진 번호라 넘긴다(신호는 멱등이다 — 번호가 화면의 판보다 클 때만 다시 받는다).
 *
 * 잰 값은 `test/menu-changed.test.ts` «답을 잃은 쓰기»(`pg-fault-proxy`가 번호 문장 뒤의 COMMIT 답을 끊는다).
 */
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { requestEventActor } from '../auth/actor'
import type { DbHandle } from '../db/tx'
import { readMenuRevWithin } from '../repos/menu'
import { notifyMenuChanged } from '../ws/notify'
import { runConfirmedTransaction } from './lost-commit'

export async function runTreeTransaction<T>(
  app: FastifyInstance,
  projectId: string,
  request: FastifyRequest,
  fn: (trx: DbHandle) => Promise<T>,
): Promise<T> {
  const { result } = await runConfirmedTransaction(app.db, fn, async (_result, deadline) => {
    const rev = await readMenuRevWithin(app.db, projectId, deadline - Date.now())
    if (rev !== null) notifyMenuChanged(app, { projectId, rev, actor: requestEventActor(request) })
    // 답은 «모름» 그대로다(머리말).
    return null
  })
  return result
}
