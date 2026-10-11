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
 * **먼저 그 트랜잭션이 커밋됐는지 본다 — `pg_xact_status(xid)`.** 본문이 끝난 자리에서 그 트랜잭션의 xid 를 받아 두고
 * (`pg_current_xact_id_if_assigned()` — 이 파일을 지나는 쓰기 트랜잭션마다 왕복 하나가 는다: 같은 기계의 api 하네스로 편집 300번을
 * 잇달아 내면 한 번에 0.3–1ms), 답을 잃으면 **다른 연결**에서 그 xid 의 결말을 묻는다. 끊긴 연결에는 물을 수 없고, 묻는 연결은 풀에서
 * 새로 빌린다.
 *
 * | 확인 | 답 | 방송 |
 * |---|---|---|
 * | 커밋됐고 그 revision 이 지금 머리다 | 성공(원래 결과 그대로) | 한다 |
 * | 커밋됐는데 머리가 더 나아갔다 | 성공 | **안 한다** — 룸은 뒤의 `seq`에서 이미 이것을 놓친 줄 안다(`gap`). 늦게 온 옛 번호를 웹은 «다음 번호»로 얹어 뒤 revision 이 빠진 화면을 최신으로 둔다(`routes/comments.ts`의 `rebroadcastPostRevision`과 같은 조건) |
 * | **커밋 안 됐다**(`aborted`) | 봉투 있는 500 «반영되지 않았다»(`DB_WRITE_NOT_APPLIED_MESSAGE`) — 웹은 그것을 «커밋 전»으로 읽는다(`apps/web`의 `refusedBeforeCommit`) | 안 한다 |
 * | 한도(`LOST_COMMIT_PROBE_MS`) 안에 결말이 안 났다 | 원래 오류(503 «모름») | 번호 프레임은 **안 한다**. 그 뒤 `LOST_COMMIT_LATE_MS` 안에 커밋되면 **번호 없는 `page-stale`**(아래 «늦게 커밋된 편집 · 게시») |
 * | 확인이 실패했다 · 커밋됐는데 머리를 못 읽었다 | 원래 오류(503 «모름») | 안 한다 |
 *
 * **커밋이 끝날 때까지 본다.** 끊긴 연결의 COMMIT 이 서버에서 아직 돌면 `in progress`다 — 간격을 `LOST_COMMIT_POLL_MS`에서
 * `LOST_COMMIT_POLL_MAX_MS`까지 늘려 가며 다시 묻고 한도에서 멈춘다(잃은 COMMIT 여럿이 한꺼번에 돌 때 묻는 질의가 풀을 덜 채운다 —
 * 한도를 넘겨 도는 COMMIT 하나에 25–26 번, 10ms 고정이면 82–86 번 · `test/edit-lost-commit.test.ts` «결말을 묻는 간격은 늘어난다»).
 * 연결이 끊겨 COMMIT 이 서버에 못 닿았으면 백엔드가 그 끊김을 보고 트랜잭션을 되돌려 `aborted`가 된다. 끊김이 한쪽만이라 백엔드가
 * 상대가 떠난 줄 모르면(트랜잭션 안에서 쉰다) 한도까지 `in progress`라 «모름»이다 — 참이다. 잰 값(`test/edit-lost-commit.test.ts` ·
 * COMMIT 을 서버에 넘기자마자 api 쪽 연결만 끊음(`halfCutOnQuery`) · 그 COMMIT 을 제약 트리거의 `pg_sleep`으로 늦춤 · 전부 실제로 커밋됨):
 * 늦춤이 한도 안(0 · 20 · 100 · 500ms)이면 성공, 3s 면 «모름». **revision 행이 보이는지로 커밋을 가르지 않는 까닭** — «안 보인다»는
 * «아직 도는 중»과 «안 됨»을 못 가른다. 행을 두 번 보는 판(50ms 간격)을 같은 자로 재면 늦춤 100ms 부터 전부 «모름»이다.
 *
 * **xid 가 없으면**(본문이 아무것도 안 쓰고 안 잠갔다) 커밋할 것이 없으므로 본문의 결과가 그대로 답이다 — 방송할 것도 없다.
 *
 * **확인의 시간 한도.** 진짜 분할이면 새 연결도 닿지 않아 풀의 대기(`poolWaitMs`)만큼 503 이 늦어진다 — 확인은 답을
 * 바꿀 기회일 뿐이라 그만큼 붙잡지 않는다. 한도는 확인 전체의 것이다 — 결말을 묻는 것과 머리를 읽는 것이 한 마감을 나눠 쓴다(결말을
 * 한도 끝에서 알면 머리를 읽을 몫은 남은 만큼이다). 한도를 넘긴 확인은 **그 연결째 버리고**(`db/client.ts`의 `readWithin`) 원래 오류를
 * 낸다 — 기다리기만 멈추면 그 연결이 응답 뒤에도 풀 칸을 쥐고, 되풀이되면 풀이 차서 모든 요청이 503 이다.
 *
 * **편집 밖의 쓰기도 같은 표를 쓴다** — revision 을 남기는 `PUT .../schema` · 코멘트 삭제 · 재번호는 `runRevisionTransaction`,
 * 복원은 `runConfirmedTransaction`(`restored` 프레임은 `seq`를 안 실어 머리를 보지 않는다 — 커밋이면 방송한다). **게시는 커밋돼도
 * «모름»을 낸다** — 웹이 같은 멱등 키로 다시 보내고 재생이 번호 프레임을 다시 보낸다(`routes/comments.ts`의 `runWrite`). 두 길이 한
 * 게시의 성공을 저마다 판정하지 않게 한다. 커밋 안 됐으면(`aborted`) 게시도 봉투 500 이다 — 웹이 «확정 안 달림»으로 읽는 것이 참이다.
 * 첫 보내기의 말이다 — 같은 키로 다시 보낸 것은 재생 갈래에서 이 500 이 날 수 있고(앞 게시는 달려 있다), 웹은 그 칸을 «모름»으로
 * 읽는다(`apps/web`의 `knownRejection`).
 *
 * **늦게 커밋된 편집 · 게시** — 한도 안에 결말이 안 난 판은 응답 뒤에도 `LOST_COMMIT_LATE_MS`까지 지켜본다(`LateCommitWatch`). 커밋되면 **번호를
 * 안 싣는 `page-stale { pageId }`**를 룸 전체에(낸 연결도) 보낸다(`ws/notify.ts`의 `pageStaleOnLateCommit`). **그 revision 의 `page-changed`를
 * 늦게 내지 않는다** — 그 사이 더 나아간 머리가 있으면 받는 쪽이 옛 `seq`를 «다음 번호»로 얹어 뒤 revision 이 빠진 화면을 최신으로 둔다. 받는
 * 쪽(`apps/web`)은 얹을 것 없이 «그 페이지를 다시 읽어라»만 안다. 트리 쓰기(`services/tree-write.ts`)는 번호가 `menu-changed`의 `rev`라 지금 번호를
 * 읽어 그대로 늦게 낸다 — 이 둘은 신호의 성질이 다르다.
 *
 * 잰 값은 `test/edit-lost-commit.test.ts` · `test/lost-commit-writes.test.ts`(TCP 프록시가 COMMIT 답을 끊는다) · `test/late-commit-stale.test.ts`(늦은 커밋).
 */
import { sql } from 'kysely'
import { readWithin } from '../db/client'
import { DbConnectionLostError } from '../db/connection-loss'
import { withTransaction, type DbHandle } from '../db/tx'
import { internal } from '../errors'
import { findRevisionCommitWithin } from '../repos/revisions'
import type { EditOutcome } from './edit-pipeline'

/** 확인을 기다리는 한도 — 머리말 «확인의 시간 한도». */
export const LOST_COMMIT_PROBE_MS = 1_000

/**
 * 그 트랜잭션이 아직 돌면 이만큼 뒤에 다시 묻는다 — 머리말 «커밋이 끝날 때까지 본다». 물을 때마다 두 배로 늘려
 * `LOST_COMMIT_POLL_MAX_MS`에서 멈춘다.
 */
export const LOST_COMMIT_POLL_MS = 10

/** 다시 묻는 간격의 상한 — 결말을 늦게 알게 되는 몫이 이것까지다. */
export const LOST_COMMIT_POLL_MAX_MS = 40

/**
 * 한도(`LOST_COMMIT_PROBE_MS`) 안에 결말이 안 난 잃은 COMMIT 을 **응답 뒤에도** 지켜보는 시간 — 넘기면 지켜보기를 그만둔다. 끊긴 연결의 COMMIT 은
 * 서버에서 아직 돌 수 있고(트리거 · 잠금 대기) 커밋되면 방송이 빠진다. 트랜잭션 유휴 한도(`db/client.ts` 의 `idle_in_transaction_session_timeout`)보다
 * 길게 두지 않는다 — 그 뒤에는 백엔드가 트랜잭션을 되돌려 `aborted` 다.
 */
export const LOST_COMMIT_LATE_MS = 30_000

/** 응답 뒤 지켜보는 동안 결말을 묻는 간격 — 응답을 붙잡지 않으므로 조밀하게 안 묻는다(풀 칸을 덜 쓴다). 한 번 묻기의 한도는 `LOST_COMMIT_PROBE_MS`다. */
export const LOST_COMMIT_LATE_POLL_MS = 500

/** 커밋 안 된 것을 확인한 쓰기의 문장 — 봉투 있는 500 에 싣는다(머리말의 표). */
export const DB_WRITE_NOT_APPLIED_MESSAGE = '데이터베이스와의 연결이 끊겨 요청이 반영되지 않았습니다 — 다시 시도하세요'

/**
 * 그 xid 의 결말 — 마감(`deadline`, `Date.now()`의 값) 안에서, `in progress`면 `LOST_COMMIT_POLL_MS`부터 늘려 가며 다시
 * 묻는다. 결말이 안 났거나 묻지 못했으면 `null`이다. 묻는 연결은 풀에서 새로 빌린다(`readWithin` — 한도를 넘기면 그 연결째 버린다).
 */
export async function settleTransaction(db: DbHandle, xid: string, deadline: number): Promise<'committed' | 'aborted' | null> {
  const query = sql<{ status: string | null }>`select pg_xact_status(${xid}::xid8) as status`.compile(db)
  let pause = LOST_COMMIT_POLL_MS
  for (;;) {
    const left = deadline - Date.now()
    if (left <= 0) return null
    const status = (await readWithin(db, query, left))?.[0]?.status
    if (status === 'committed' || status === 'aborted') return status
    // 못 물었다(`undefined`) · xid 가 너무 옛것이다(`null`) — 결말을 모른다.
    if (status !== 'in progress') return null
    await new Promise((resolve) => setTimeout(resolve, Math.min(pause, Math.max(0, deadline - Date.now()))))
    pause = Math.min(pause * 2, LOST_COMMIT_POLL_MAX_MS)
  }
}

/** 이 트랜잭션의 xid — 아무것도 안 쓰고 안 잠갔으면 `null`이다(xid 를 새로 받지 않는다). */
async function currentXid(trx: DbHandle): Promise<string | null> {
  const { rows } = await sql<{ xid: string | null }>`select pg_current_xact_id_if_assigned()::text as xid`.execute(trx)
  return rows[0]?.xid ?? null
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
 * `confirm`은 본문의 결과(끝까지 돈 것)와 확인의 마감(결말을 묻고 남은 몫)을 받아 **방송해도 되는가**를 낸다. `null`이면 «모름»이다
 * — 원래 오류를 그대로 던진다.
 * 확인할 것이 없는 결과(문서를 안 바꾼 쓰기)도 `null`이다 — 그 쓰기는 방송할 것이 없고, 커밋됐는지 가를 행도 없다.
 *
 * **`late`** — 한도 안에 결말이 안 난 판(503 «모름»)을 **응답 뒤에도** `late.watch` 로 지켜보다 커밋됐으면 `late.onCommit` 을 부른다(응답은
 * 붙잡지 않는다 — `createLateCommitWatch`). 안 주면 한도 뒤에 커밋된 쓰기는 방송이 빠진다.
 */
export async function runConfirmedTransaction<T>(
  db: DbHandle,
  fn: (trx: DbHandle) => Promise<T>,
  confirm: (result: T, deadline: number) => Promise<boolean | null>,
  late?: { watch: LateCommitWatch; onCommit: (result: T) => Promise<void> | void },
): Promise<Settled<T>> {
  // 본문이 끝까지 돌았으면 그 결과와 xid 를 든다 — 그 뒤에 난 `DbConnectionLostError`는 COMMIT(과 뒤따른 ROLLBACK)의 것이다.
  const finished: { body?: { result: T; xid: string | null } } = {}
  try {
    const result = await withTransaction(db, async (trx) => {
      const value = await fn(trx)
      finished.body = { result: value, xid: await currentXid(trx) }
      return value
    })
    return { result, broadcast: true, confirmedAfterLoss: false }
  } catch (error) {
    const body = finished.body
    if (!(error instanceof DbConnectionLostError) || body === undefined) throw error
    if (body.xid === null) return { result: body.result, broadcast: false, confirmedAfterLoss: true }
    // 결말과 `confirm`이 한 마감을 나눠 쓴다 — 머리말 «확인의 시간 한도».
    const deadline = Date.now() + LOST_COMMIT_PROBE_MS
    const settled = await settleTransaction(db, body.xid, deadline)
    if (settled === 'aborted') throw internal(DB_WRITE_NOT_APPLIED_MESSAGE)
    if (settled === null) {
      if (late !== undefined) late.watch.add(body.xid, () => late.onCommit(body.result))
      throw error
    }
    const broadcast = await confirm(body.result, deadline)
    if (broadcast === null) throw error
    return { result: body.result, broadcast, confirmedAfterLoss: true }
  }
}

/**
 * **응답 뒤 늦은 커밋 지켜보기** — 앱마다 하나다(`app.ts`가 만들어 `app.lateCommits`에 두고 닫을 때 `stop`한다). 지켜볼 xid 를 모아
 * **한 연결 · 한 질의로** 묻는다(`unnest`).
 *
 * **xid 마다 따로 묻지 않는 까닭.** 확인 질의가 답을 못 받는 판(분할 · 죽은 연결)에서는 묻기 하나가 칸 하나를 제 한도까지 쥔다 — 잃음 N 개를
 * 따로 지켜보면 칸 N 개가 쥐여 풀이 차고 남의 프로젝트 요청까지 503 이다(잃음은 바로 그런 DB 장애 판에서 몰린다). 묶으면 지켜보기가 쥐는 칸은
 * 언제나 하나까지다. 동시 수에 상한을 두는 길(넘치면 안 지켜본다)은 넘친 쓰기의 신호를 버린다.
 *
 * **한 번 묻기의 한도는 `LOST_COMMIT_PROBE_MS`다 — 마감(`LOST_COMMIT_LATE_MS`)까지 남은 몫이 아니라.** 남은 몫을 주면 조건이 풀린 뒤에도 그
 * 묻기가 칸을 마감까지 쥐고, 답을 못 받은 채 마감에 닿아 신호가 빠진다. 못 물었으면 쉰 뒤(`LOST_COMMIT_LATE_POLL_MS`) 다시 묻는다 — xid
 * 마다 제 마감까지.
 *
 * **`stop`은 답을 기다리는 묻기까지 걷는다**(그 연결째 버린다 — `readWithin`의 `signal`). `pool.end()`는 빌려 간 연결이 돌아올 때까지
 * 기다려, 안 걷으면 종료가 묻기의 한도만큼 붙잡힌다. 신호를 내는 중의 읽기(`then` — 지금 번호)는 못 걷는다 — 그 읽기의 한도까지다.
 *
 * 잰 값은 `test/late-commit-watch.test.ts`(확인 질의 무응답 · 잃은 트리 쓰기 10).
 */
export interface LateCommitWatch {
  /** 그 xid 가 `LOST_COMMIT_LATE_MS` 안에 커밋되면 `then`을 부른다. 기다리지 않고 돌아가며 던지지 않는다(실패는 삼킨다 — 응답은 이미 나갔다). */
  add(xid: string, then: () => Promise<void> | void): void
  /** 지켜보기를 걷는다 — 그 뒤의 `add`는 아무것도 안 한다. */
  stop(): void
}

export function createLateCommitWatch(db: DbHandle): LateCommitWatch {
  const pending = new Map<string, { deadline: number; then: () => Promise<void> | void }>()
  const stopped = new AbortController()
  let running = false
  const drain = async (): Promise<void> => {
    try {
      for (;;) {
        const now = Date.now()
        for (const [xid, entry] of pending) if (entry.deadline <= now) pending.delete(xid)
        if (pending.size === 0 || stopped.signal.aborted) return
        const xids = [...pending.keys()]
        const query = sql<{ xid: string; status: string | null }>`
          select x::text as xid, pg_xact_status(x) as status from unnest(${xids}::xid8[]) as x
        `.compile(db)
        for (const row of (await readWithin(db, query, LOST_COMMIT_PROBE_MS, stopped.signal)) ?? []) {
          // 아직 돈다 — 다음 묻기로. 결말이 났거나 xid 가 너무 옛것이면(`null`) 그만 본다.
          if (row.status === 'in progress') continue
          const entry = pending.get(row.xid)
          pending.delete(row.xid)
          // 차례로 낸다 — 신호의 읽기도 칸 하나를 쓴다.
          if (row.status === 'committed' && entry !== undefined && !stopped.signal.aborted) {
            await Promise.resolve()
              .then(entry.then)
              .catch(() => {})
          }
        }
        await pause(LOST_COMMIT_LATE_POLL_MS, stopped.signal)
      }
    } finally {
      // `return`과 같은 차례에 선다 — 그 사이에 든 `add`가 지켜보기 없이 남지 않는다.
      running = false
    }
  }
  return {
    add(xid, then) {
      if (stopped.signal.aborted) return
      pending.set(xid, { deadline: Date.now() + LOST_COMMIT_LATE_MS, then })
      if (running) return
      running = true
      drain().catch(() => {})
    },
    stop() {
      stopped.abort()
      pending.clear()
    },
  }
}

/** `ms` 쉰다 — `signal`이 서면 곧바로 깬다. 타이머가 프로세스를 붙잡지 않는다. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const wake = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', wake)
      resolve()
    }
    const timer = setTimeout(wake, ms)
    timer.unref()
    signal.addEventListener('abort', wake, { once: true })
  })
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
  /**
   * 한도 뒤에 커밋되면 부른다(`pageStaleOnLateCommit`). **필수다** — 새 호출자가 빠뜨리면 컴파일이 막는다(빠뜨린 입구는 늦은 커밋에 남의 화면이 조용히 낡는다).
   * 일부러 안 내는 입구면 `null`을 넘기고 그 까닭을 호출 자리에 적는다.
   */
  late: LateCommitSignal | null,
): Promise<Settled<T>> {
  return runConfirmedTransaction(
    db,
    fn,
    async (result, deadline) => {
      const revision = revisionOf(result)
      if (revision === null) return null
      const left = deadline - Date.now()
      if (left <= 0) return null
      const seen = await findRevisionCommitWithin(db, pageId, revision.revisionId, left)
      if (seen === null || !seen.committed) return null
      return seen.headSeq === revision.seq
    },
    late === null ? undefined : { watch: late.watch, onCommit: late.onCommit },
  )
}

/** 늦은 커밋 지켜보기에 넘기는 신호 — 결과를 안 읽는다(번호가 없는 신호다). */
export interface LateCommitSignal {
  watch: LateCommitWatch
  onCommit: () => Promise<void> | void
}

/**
 * 편집 트랜잭션을 돌린다. `fn`은 `applyEdit`을 부르고 그 결과를 돌려주는 트랜잭션 본문이다(잠금 판정 · 커밋 순간의
 * 재확인을 함께 든다). COMMIT 답을 잃었으면 머리말의 표대로 확인한다.
 */
export async function runEditTransaction(
  db: DbHandle,
  pageId: string,
  fn: (trx: DbHandle) => Promise<EditOutcome>,
  /** 한도 뒤에 커밋되면 부른다 — 필수다(`runRevisionTransaction`의 `late`). 입구마다 넘기는지는 `test/late-commit-stale.test.ts`가 잰다. */
  late: LateCommitSignal | null,
): Promise<SettledEdit> {
  const settled = await runRevisionTransaction(
    db,
    pageId,
    fn,
    (outcome) => (outcome.ok ? { revisionId: outcome.revisionId, seq: outcome.seq } : null),
    late,
  )
  return { outcome: settled.result, broadcast: settled.broadcast, confirmedAfterLoss: settled.confirmedAfterLoss }
}
