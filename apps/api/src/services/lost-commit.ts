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
 * **확인의 시간 한도.** 진짜 분할이면 새 연결도 닿지 않아 풀의 대기(`poolWaitMs`)만큼 503 이 늦어진다 — 확인은 답을
 * 바꿀 기회일 뿐이라 그만큼 붙잡지 않는다. 한도를 넘긴 확인 질의는 버려 두고(읽기뿐이다) 원래 오류를 낸다.
 *
 * 잰 값은 `test/edit-lost-commit.test.ts`(TCP 프록시가 COMMIT 답을 끊는다).
 */
import { DbConnectionLostError } from '../db/connection-loss'
import { withTransaction, type DbHandle } from '../db/tx'
import { findRevisionCommit, type RevisionCommit } from '../repos/revisions'
import type { EditOutcome } from './edit-pipeline'

/** 확인을 기다리는 한도 — 머리말 «확인의 시간 한도». */
export const LOST_COMMIT_PROBE_MS = 1_000

export interface SettledEdit {
  outcome: EditOutcome
  /** 방송해도 되는가 — 보통 커밋이면 참, COMMIT 답을 잃고 확인한 판이면 그 revision 이 머리일 때만 참. */
  broadcast: boolean
  /** COMMIT 답을 잃었고 새 연결로 커밋을 확인했다. 로그에 남길 자리다. */
  confirmedAfterLoss: boolean
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
  // 본문이 끝까지 돌았으면 그 결과를 든다 — 그 뒤에 난 `DbConnectionLostError`는 COMMIT(과 뒤따른 ROLLBACK)의 것이다.
  const finished: { outcome?: EditOutcome } = {}
  try {
    const outcome = await withTransaction(db, async (trx) => {
      const result = await fn(trx)
      finished.outcome = result
      return result
    })
    return { outcome, broadcast: true, confirmedAfterLoss: false }
  } catch (error) {
    const outcome = finished.outcome
    if (!(error instanceof DbConnectionLostError) || outcome === undefined || !outcome.ok) throw error
    const seen = await probeWithin(db, pageId, outcome.revisionId)
    if (seen === null || !seen.committed) throw error
    return { outcome, broadcast: seen.headSeq === outcome.seq, confirmedAfterLoss: true }
  }
}

/** 확인 하나를 `LOST_COMMIT_PROBE_MS` 안에서 한다. 실패하거나 한도를 넘기면 `null`이다. */
async function probeWithin(db: DbHandle, pageId: string, revisionId: string): Promise<RevisionCommit | null> {
  let timer: NodeJS.Timeout | undefined
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), LOST_COMMIT_PROBE_MS)
    timer.unref()
  })
  try {
    return await Promise.race([findRevisionCommit(db, pageId, revisionId).catch(() => null), late])
  } finally {
    clearTimeout(timer)
  }
}
