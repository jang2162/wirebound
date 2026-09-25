/**
 * **COMMIT 답을 잃은 편집을 그 자리에서 확인한다.**
 *
 * 편집 트랜잭션의 COMMIT 이 Postgres 에서 커밋됐는데 그 답만 잃으면(`db/connection-loss.ts`의 `DbConnectionLostError`)
 * 핸들러는 결과를 모른다. 모른 채 503 으로 끝내면 **방송도 빠진다** — 그 revision 프레임은 아무 연결에도 안 가고, 남의
 * 화면은 다음 변경의 `seq`가 건너뛸 때 «연결이 끊긴 사이…»를 띄운다(원인이 틀린 문장). 편집을 내는 쪽은 다시 보내지
 * 않는다 — 웹은 «모름»이면 페이지를 다시 읽고(`apps/web/src/edit/use-edit-commit.tsx`의 `recover`) MCP 는 재시도하지
 * 않는다(`packages/mcp/src/handlers.ts`의 `patchPage`). 그래서 다시 보낸 것을 알아보는 재생 키로는 닫히지 않고,
 * **서버가 그 자리에서 새 연결로 확인한다.**
 *
 * | 확인 | 답 | 방송 |
 * |---|---|---|
 * | 그 revision 이 보이고 그것이 지금 머리다 | 성공(원래 결과 그대로) | 한다 |
 * | 보이는데 머리가 더 나아갔다 | 성공 | **안 한다** — 룸은 뒤의 `seq`에서 이미 이것을 놓친 줄 안다(`gap`). 늦게 온 옛 번호를 웹은 «다음 번호»로 얹어 뒤 revision 이 빠진 화면을 최신으로 둔다(`routes/comments.ts`의 `rebroadcastPostRevision`과 같은 조건) |
 * | 안 보인다 · 확인이 실패했다 · `LOST_COMMIT_PROBE_MS` 안에 안 끝났다 | 원래 오류(503 «모름») | 안 한다 |
 *
 * **«안 보인다»는 «커밋 안 됨»이 아니다** — 끊긴 연결의 COMMIT 이 서버에서 아직 도는 중일 수 있다. 그래서 거기서는
 * 성공도 확정 실패도 말하지 않고 원래의 «모름»을 낸다. 확인은 «보인다»일 때만 답을 바꾼다.
 *
 * **한 번 더 본다.** «안 보인다»면 `LOST_COMMIT_RECHECK_MS` 뒤에 한 번 더 보고 그래도 안 보이면 «모름»이다(`probeCommit`). 잰 값
 * (api 하네스 · COMMIT 을 서버에 넘기자마자 api 쪽 연결만 끊음(`halfCutOnQuery`) · 그 COMMIT 을 제약 트리거의 `pg_sleep`으로
 * 늦춤 · 판마다 30번 · 전부 실제로 커밋됨): 한 번만 보면 지연 0 은 30/30 확인, 5ms 는 13/30, 20ms · 100ms 는 0/30 — 확인이
 * 그 COMMIT 보다 먼저 닿는다. 한 번 더 보면 0 · 5 · 20 · 40ms 가 30/30, 100ms 는 0/30. 대가는 커밋 안 된 판의 503 이 그만큼(과
 * 질의 하나) 늦는 것이다. 더 기다리지 않는 것은 확인이 답을 바꿀 기회일 뿐이라서다 — COMMIT 이 그보다 오래 걸리는 판은 «모름»으로
 * 둔다.
 *
 * **확인의 시간 한도.** 진짜 분할이면 새 연결도 닿지 않아 풀의 대기(`poolWaitMs`)만큼 503 이 늦어진다 — 확인은 답을
 * 바꿀 기회일 뿐이라 그만큼 붙잡지 않는다. 한도를 넘긴 확인은 **그 연결째 버리고**(`db/client.ts`의 `readWithin`) 원래 오류를
 * 낸다 — 기다리기만 멈추면 그 연결이 응답 뒤에도 풀 칸을 쥐고, 되풀이되면 풀이 차서 모든 요청이 503 이다.
 *
 * **편집 밖의 쓰기도 같은 표를 쓴다** — revision 을 남기는 `PUT .../schema` · 코멘트 삭제 · 재번호는 `runRevisionTransaction`,
 * 복원은 안전망 스냅샷을 찾는 `runConfirmedTransaction`(`restored` 프레임은 `seq`를 안 실어 머리를 보지 않는다). **게시는 여기를
 * 안 지난다** — 웹이 같은 멱등 키로 다시 보내고 재생이 번호 프레임을 다시 보낸다(`routes/comments.ts`의 `runWrite`).
 *
 * 잰 값은 `test/edit-lost-commit.test.ts` · `test/lost-commit-writes.test.ts`(TCP 프록시가 COMMIT 답을 끊는다).
 */
import { DbConnectionLostError } from '../db/connection-loss'
import { withTransaction, type DbHandle } from '../db/tx'
import { findRevisionCommitWithin } from '../repos/revisions'
import type { EditOutcome } from './edit-pipeline'

/** 확인을 기다리는 한도 — 머리말 «확인의 시간 한도». */
export const LOST_COMMIT_PROBE_MS = 1_000

/** «안 보인다»면 이만큼 뒤에 한 번 더 본다 — 머리말 «한 번 더 본다». */
export const LOST_COMMIT_RECHECK_MS = 50

/**
 * 커밋을 본다 — 한도(`LOST_COMMIT_PROBE_MS`) 안에서, «안 보인다»면 `LOST_COMMIT_RECHECK_MS` 뒤에 한 번 더(머리말 «한 번 더 본다»).
 * `look(ms)`는 그 한도 안에 못 끝나면 `null`이다. 둘째가 못 보면(`null`) 첫째의 «안 보인다»를 낸다.
 */
export async function probeCommit<T extends { committed: boolean }>(look: (ms: number) => Promise<T | null>): Promise<T | null> {
  const deadline = Date.now() + LOST_COMMIT_PROBE_MS
  const first = await look(LOST_COMMIT_PROBE_MS)
  if (first === null || first.committed) return first
  const left = deadline - Date.now() - LOST_COMMIT_RECHECK_MS
  if (left <= 0) return first
  await new Promise((resolve) => setTimeout(resolve, LOST_COMMIT_RECHECK_MS))
  return (await look(left)) ?? first
}

export interface SettledEdit {
  outcome: EditOutcome
  /** 방송해도 되는가 — 보통 커밋이면 참, COMMIT 답을 잃고 확인한 판이면 그 revision 이 머리일 때만 참. */
  broadcast: boolean
  /** COMMIT 답을 잃었고 새 연결로 커밋을 확인했다. 로그에 남길 자리다. */
  confirmedAfterLoss: boolean
}

/** `runConfirmedTransaction`의 답 — `SettledEdit`과 같은 두 칸에 본문의 결과를 든다. */
export interface Settled<T> {
  result: T
  broadcast: boolean
  confirmedAfterLoss: boolean
}

/**
 * 트랜잭션을 돌리고, COMMIT 답을 잃었으면 `confirm`으로 확인한다 — 머리말의 표를 쓰기의 모양과 떼어 둔 것이다.
 *
 * `confirm`은 본문의 결과(끝까지 돈 것)를 받아 **방송해도 되는가**를 낸다. `null`이면 «모름»이다 — 원래 오류를 그대로 던진다.
 * 확인할 것이 없는 결과(문서를 안 바꾼 쓰기)도 `null`이다 — 그 쓰기는 방송할 것이 없고, 커밋됐는지 가를 행도 없다.
 */
export async function runConfirmedTransaction<T>(
  db: DbHandle,
  fn: (trx: DbHandle) => Promise<T>,
  confirm: (result: T) => Promise<boolean | null>,
): Promise<Settled<T>> {
  // 본문이 끝까지 돌았으면 그 결과를 든다 — 그 뒤에 난 `DbConnectionLostError`는 COMMIT(과 뒤따른 ROLLBACK)의 것이다.
  const finished: { body?: { result: T } } = {}
  try {
    const result = await withTransaction(db, async (trx) => {
      const value = await fn(trx)
      finished.body = { result: value }
      return value
    })
    return { result, broadcast: true, confirmedAfterLoss: false }
  } catch (error) {
    const body = finished.body
    if (!(error instanceof DbConnectionLostError) || body === undefined) throw error
    const broadcast = await confirm(body.result)
    if (broadcast === null) throw error
    return { result: body.result, broadcast, confirmedAfterLoss: true }
  }
}

/** revision 하나를 남긴 쓰기의 그 revision — 확인이 찾는 행이다. */
export interface WrittenRevision {
  revisionId: string
  seq: number
}

/**
 * revision 을 남기는 쓰기의 확인 — 그 revision 이 보이면 커밋됐다. 방송은 그것이 지금 머리일 때만이다(머리말의 표).
 * `revisionOf`가 `null`을 내면(revision 을 안 남긴 결과) «모름» 그대로다.
 */
export async function runRevisionTransaction<T>(
  db: DbHandle,
  pageId: string,
  fn: (trx: DbHandle) => Promise<T>,
  revisionOf: (result: T) => WrittenRevision | null,
): Promise<Settled<T>> {
  return runConfirmedTransaction(db, fn, async (result) => {
    const revision = revisionOf(result)
    if (revision === null) return null
    const seen = await probeCommit((ms) => findRevisionCommitWithin(db, pageId, revision.revisionId, ms))
    if (seen === null || !seen.committed) return null
    return seen.headSeq === revision.seq
  })
}

/**
 * 편집 트랜잭션을 돌린다. `fn`은 `applyEdit`을 부르고 그 결과를 돌려주는 트랜잭션 본문이다(잠금 판정 · 커밋 순간의
 * 재확인을 함께 든다). COMMIT 답을 잃었으면 머리말의 표대로 확인한다.
 */
export async function runEditTransaction(
  db: DbHandle,
  pageId: string,
  fn: (trx: DbHandle) => Promise<EditOutcome>,
): Promise<SettledEdit> {
  const settled = await runRevisionTransaction(db, pageId, fn, (outcome) =>
    outcome.ok ? { revisionId: outcome.revisionId, seq: outcome.seq } : null,
  )
  return { outcome: settled.result, broadcast: settled.broadcast, confirmedAfterLoss: settled.confirmedAfterLoss }
}
