/**
 * 설계서 「소프트 잠금」의 **2차 방어** — *"서버는 patch 수신 시 잠금 소유자를 재확인한다."*
 *
 * # 왜 `applyEdit` 안이 아닌가
 *
 * `services/edit-pipeline.ts`가 *"`services/`는 SQL을 직접 쓰지 않고 HTTP도 모른다"*를
 * 계약으로 못박았다. 잠금 저장소는 「소프트 잠금」이 **서버 인메모리**로 정했고 전송 계층(`ws/`)에
 * 걸려 있으므로, 파이프라인이 그것을 알면 `services/`와 전송 계층 사이의 경계가 깨진다.
 *
 * **그래서 호출자가 부르고, 호출자가 빠뜨릴 수 있다.** 그 대가를 갚는 것은
 * `test/lock-census.test.ts`다 — `applyEdit`을 부르는 자리를 소스에서 세고, 그 자리마다
 * *"잠금을 보는가"*를 판정과 함께 표에 적는다. 새 호출자가 생기면 그 파일이 **먼저 죽는다.**
 * (`test/broadcast-census.test.ts`가 알림에 대해 하는 것과 같은 형태이고, 같은 분모를 쓴다.)
 *
 * # 설계서 「정방향 흐름」의 순서 — 판정은 페이지 행 안에서 한다
 *
 * 「정방향 흐름」은 *"권한 확인(editor+) → **잠금 확인** → 적용"*이다. **이 함수는 편집의 트랜잭션 안에서, 파이프라인이 쥘 그 페이지 행을
 * 먼저 잡고 판정한다**(`trx` — 부르는 쪽이 이어서 같은 트랜잭션에서 `applyEdit`을 부른다). **트랜잭션 밖에서 판정하면 겹친
 * 잠금이 조용히 선다** — 들여쓰기(`move`)가 판정을 지난 뒤 다른 사람의 `lock`이 커밋 **전** 문서로 판정되어 서고, 이어 커밋이 옮긴
 * 노드를 그 잠금 안에 넣는다. 한쪽만 고쳐서는 안 닫힌다 — `lock`이 문서를 다시 읽어도 판정 뒤 커밋 전에 선 잠금은 편집이 못 보고,
 * 편집이 행 안에서 판정해도 `lock`이 행 없이 읽으면 커밋 전 문서를 본다. **그래서 둘을 한 점에 줄 세운다: 페이지 행.** 재는
 * 자리: `test/ws-lock.test.ts` 「편집 커밋과 잠금 획득은 페이지 행에 줄 선다」(두 케이스가 한 쪽씩 소유한다).
 *
 * | 쪽 | 행을 잡는 자리 | 행 안에서 하는 것 |
 * |---|---|---|
 * | 편집(`lockConflictError` — WS `patch` · REST `PATCH …/ops` · `PUT …/schema`) | 이 함수의 첫 줄(`lockPageRow` — `FOR UPDATE`, 문서 안 읽음) | 판정 → (부르는 쪽) `applyEdit` → 커밋 |
 * | 선택(`ws/lock.ts` — **모든** `lock` 프레임) | 그 트랜잭션의 첫 줄(`lockPageShared` — `FOR KEY SHARE`) | (남의 잠금이 있으면 `readSelectionRoot`로 머리 문서) → 판정 → `hold` → 커밋 |
 *
 * `KEY SHARE`는 편집의 `FOR UPDATE`와 부딪히므로 둘이 한 행에 줄 선다. 그러면 잠금은 언제나 **커밋된 머리 문서** 위에 서고,
 * 편집의 판정은 그 행을 쥔 동안 선 잠금을 전부 본다 — «판정은 지났는데 커밋 전에 잠금이 선다»가 없다. 겹침만이 아니다: 남의 잠금이
 * 없는 페이지에서 행 없이 잡으면 **이미 판정을 지난 편집이 새 잠금 아래로 커밋된다**(«배지가 선 뒤 몇 ms 에 커밋» — 남의 편집이
 * 내 잠금 안의 노드를 바꾼다). 재는 자리: `test/ws-lock.test.ts` 「편집 커밋과 잠금 획득은 페이지 행에 줄 선다」.
 *
 * **선택끼리는 줄 서지 않는다** — `KEY SHARE`끼리는 부딪히지 않는다. 판정과 `hold`는 동기라(`selectionVerdict`) 같은 틱에 붙어,
 * 둘이 함께 행을 쥐어도 먼저 판정한 쪽이 잡고 뒤는 그것을 본다. **`FOR UPDATE`로 올리지 않는다** — 둘이 `KEY SHARE`를 쥔 채
 * 서로 올리려 하면 교착이다. 그래서 문서도 행을 쥔 채 잠금 없이 읽는다(`readSelectionRoot`).
 *
 * **잠금 순서.** 편집: 페이지 행(`FOR UPDATE` — 여기) → (`applyEdit`이 같은 행을 다시 — 이미 쥐었다) → 멤버 행(`FOR SHARE` —
 * 커밋 순간 재확인). 선택: 페이지 행 **하나뿐이다**(`FOR KEY SHARE`) — 쥔 채 기다리는 것이 없다. 메모리의 잠금 목록(`lock/store.ts`)은
 * 기다리는 자원이 아니다(동기 읽기 · 쓰기) — **DB 행 ↔ 메모리 사이에 고리가 설 수 없다.** `repos/projects.ts`가 정한 잠금 순서(프로젝트 행 →
 * 페이지 행 → 멤버 행)와 맞는다 — 둘 다 프로젝트 행을 안 잡는다.
 *
 * **`baseSeq`도 본다.** 읽은 페이지의 `headSeq`가 요청의 `baseSeq`와 다르면 판정하지 않고 지나간다 — 파이프라인이 같은
 * 행을 쥔 채 `stale`로 답한다. 그 둘은 같은 행 잠금 안이라 같은 `headSeq`를 본다.
 *
 * # 비용 — 잠금이 없으면 조회도 없다
 *
 * 편집 하나당 페이지 조회가 하나 는다. **다만 그 페이지에 (나 아닌 사람의) 잠금이 하나라도
 * 있을 때만이다** — 혼자 편집하는 흔한 판에서는 조회가 늘지 않는다. *"누구의 잠금이 뜻이
 * 있는가"*는 여기서 다시 쓰지 않고 `@wirebound/schema`의 `locksAgainst`를 부른다.
 *
 * # 획득의 판정도 이 파일이다
 *
 * 서버는 `lock`을 거절하므로(`ws/lock.ts`의 머리말) 서버의 잠금 판정이 둘이다 — 편집(`lockConflictError`)과
 * 선택(`selectionVerdict`). **둘을 한 파일에 둔다:** 살아 있는 목록을 읽고(`liveIn`) 사람으로 좁히고(`locksAgainst`)
 * 판정 함수(`lockConflictOfOps` · `findLockConflict`)를 부르는 자리가 `apps/api`에 이 파일 하나라는 것을 `apps/web`의 `test/lock/one-verdict.test.ts`가 센다.
 * 편집은 `lockConflictOfOps(ops)` — 연산마다 좌표를 맞춘다 — 이고, 선택은 `findLockConflict`에 `findNodePath(root, nodeId)` 하나다(「소프트 잠금」).
 * 둘은 같은 겹침(한쪽이 다른 쪽의 조상)으로 잰다(`@wirebound/schema`의 `lock.ts`).
 */
import {
  findLockConflict,
  findNodePath,
  lockConflictOfOps,
  locksAgainst,
  migrateDocument,
  type PatchOp,
  type WbNode,
} from '@wirebound/schema'
import type { FastifyInstance } from 'fastify'
import type { DbHandle } from '../db/tx'
import { locked, type ApiError } from '../errors'
import { findPageById, lockPageRow } from '../repos/pages'

export interface LockCheckInput {
  projectId: string
  pageId: string
  /** 요청이 선 revision. 이 값이 페이지의 현재 `headSeq`와 다르면 판정하지 않는다(위 머리말). */
  baseSeq: number
  ops: PatchOp[]
  /** 편집을 내는 **사람**. 연결이 아니다 — 같은 사람의 다른 탭에 막히지 않는다. */
  userId: string
}

/** 그 페이지의 살아 있는 잠금 — 부를 때마다 지금 것을 읽는다. */
function onPageOf(app: FastifyInstance, input: { projectId: string; pageId: string }) {
  return app.realtime.locks.liveIn(input.projectId).filter((lock) => lock.pageId === input.pageId)
}

/**
 * 남의 잠금과 부딪치면 그 실패를 낸다. 아니면 `null`이다.
 *
 * **`trx`는 부르는 쪽의 편집 트랜잭션이다** — 이 함수가 그 안에서 페이지 행을 잡고, 부르는 쪽은 같은 트랜잭션에서 `applyEdit`을
 * 불러 커밋한다(위 «판정은 페이지 행 안에서»). 트랜잭션 밖 핸들이면 `lockPageRow`가 던진다.
 *
 * **던지지 않고 값을 낸다** — `editOutcomeToApiError`가 파이프라인의 실패에 대해 하는 것과
 * 같은 모양이라, 두 진입점이 그것을 각자의 방식으로(REST는 `throw`, WS는 프레임) 옮긴다.
 */
export async function lockConflictError(app: FastifyInstance, trx: DbHandle, input: LockCheckInput): Promise<ApiError | null> {
  // **페이지 행을 먼저 잡는다**(위 «판정은 페이지 행 안에서»). 문서는 안 읽는다 — 남의 잠금이 없으면 필요 없다. 없는 페이지는
  // 판정하지 않는다(파이프라인이 `not-found`로 답한다).
  if (!(await lockPageRow(trx, input.projectId, input.pageId))) return null
  if (locksAgainst(onPageOf(app, input), input.userId).length === 0) return null

  // 행을 쥐었으므로 이 조회는 머리 문서다.
  const page = await findPageById(trx, input.projectId, input.pageId)
  // **없는 페이지·낡은 요청·읽을 수 없는 버전은 여기서 판정하지 않는다.** 셋 다 파이프라인이
  // 자기 이름으로 답한다(`not-found`·`stale`·`unsupported-version`) — 여기서 그것을 잠금
  // 충돌로 덮으면 사용자가 **겪지 않은 실패**를 듣는다.
  if (page === null || page.headSeq !== input.baseSeq) return null

  let document
  try {
    // 파이프라인 2단계와 같은 기준으로 올린다 — 안 올리면 경로가 저장된 문서의 것이라
    // 클라이언트가 만든 `ops`의 경로와 어긋날 수 있다.
    document = migrateDocument(page.schema)
  } catch {
    return null
  }

  // **목록은 문서를 읽은 뒤 다시 읽는다** — 행을 쥔 뒤라 그 사이 설 잠금은 없지만, 판정은 늘 지금 목록으로 한다. 판정 뒤는 동기로 `applyEdit`에 이어진다.
  // **편집은 `lockConflictOfOps`로 묻는다** — 연산마다 그 연산이 선 문서의 좌표로 잠긴 자리를 따라간다(그 함수의 머리말 «좌표는
  // 연산마다 다르다»). 적용이 실패하는 묶음은 판정하지 않는다 — 파이프라인이 `patch-failed`로 답한다(위 «여기서 판정하지 않는다»와 같은 자세).
  const conflict = lockConflictOfOps({
    document,
    locks: onPageOf(app, input),
    ops: input.ops,
    viewerUserId: input.userId,
  })
  if (conflict === null) return null

  // **누가 잡고 있는지를 문장에 싣는다.** 화면은 배지로 그것을 이미 아는 것이 보통이지만,
  // 이 실패에 닿는 것은 **배지를 못 본 클라이언트**다(설계서 「LLM 편집 경로」의 MCP·다른 도구) — 그쪽에는
  // 이 문장이 유일한 설명이다.
  return locked(`${conflict.userName}님이 편집 중인 영역입니다`)
}

export interface SelectionCheckInput {
  projectId: string
  pageId: string
  /** 잡으려는 노드. **선택은 그 서브트리를 통째로 claim 한다**(설계서 「소프트 잠금」) — 포인터는 그 노드의 경로 하나다. */
  nodeId: string
  /** 잡으려는 **사람** — 같은 사람의 다른 탭이 쥔 것에는 막히지 않는다. */
  userId: string
}

/**
 * `selectionVerdict`의 답. **`needs-document`는 판정이 아니라 부탁이다** — 같은 페이지에 남의 잠금이 있는데 문서를 아직 안
 * 읽었다. 부르는 쪽이 `readSelectionRoot`로 읽고 **다시 묻는다**(`ws/lock.ts`).
 */
export type SelectionVerdict = 'free' | 'held' | 'needs-document'

/**
 * **이 자리를 잡아도 되는가** — 서버가 획득을 판정하는 자리(`ws/lock.ts`의 머리말). **동기다.**
 *
 * 판정은 화면의 1차 방어와 **같은 함수에 같은 포인터**를 넣는다 — `findLockConflict`에 `findNodePath(root, nodeId)` 하나
 * (`apps/web`의 `store/editor-store.ts`의 `lockedBy`가 넣는 그것이다 · `packages/schema`의 `LockConflictInput.pointers`).
 * 그래서 «화면이 고르게 둔 자리를 서버가 거절한다»는 **목록이 낡은 창**에서만 난다.
 *
 * **목록은 부를 때마다 지금 것을 읽는다.** 동기인 것이 요점이다: 부르는 쪽은 이 답과 `hold`를 **같은 틱에** 이어 붙여, 둘
 * 사이에 다른 연결의 `hold`가 끼지 못하게 한다. 문서를 읽는 await 는 이 함수 **밖**에 있다 — 읽고 돌아와 다시 물으면 그 사이
 * 선 잠금까지 본다.
 *
 * **남의 잠금이 그 페이지에 없으면 문서를 안 읽는다** — 혼자 고르는 흔한 판은 조회가 없다(`lockConflictError`와 같은
 * 자세). **문서가 없거나 읽을 수 없으면(`root === null`) 막지 않는다** — 부딪칠 경로가 없다(`findLockConflict`의 «가리키는
 * 노드가 문서에 없는 잠금은 아무것도 막지 못한다»와 같은 방향이다).
 */
export function selectionVerdict(
  app: FastifyInstance,
  input: SelectionCheckInput,
  root: WbNode | null | undefined,
): SelectionVerdict {
  const onPage = onPageOf(app, input)
  if (locksAgainst(onPage, input.userId).length === 0) return 'free'
  if (root === undefined) return 'needs-document'
  if (root === null) return 'free'

  const path = findNodePath(root, input.nodeId)
  if (path === undefined) return 'free'
  return findLockConflict({ root, locks: onPage, pointers: [path], viewerUserId: input.userId }) === null ? 'free' : 'held'
}

/**
 * `selectionVerdict`가 부탁한 문서 — **부르는 쪽이 이미 쥔 페이지 행 아래서 잠금 없이 읽는다**. 부르는 쪽(`ws/lock.ts`)은 이 함수
 * 앞에 그 행을 `KEY SHARE`로 잡고(`lockPageShared`) 같은 트랜잭션에서 판정하고 `hold`한다 — 편집은 그 행을 `FOR UPDATE`로 잡아야
 * 쓰므로 이 문서는 **커밋된 머리**이고, 판정 뒤 커밋 전에 편집이 끼지 못한다(위 «판정은 페이지 행 안에서»). **여기서 행을 다시
 * 잡지 않는다** — `FOR UPDATE`로 올리면 같은 행을 `KEY SHARE`로 쥔 두 선택이 서로를 기다린다(`test/ws-lock.test.ts`의
 * «두 사람이 같은 자리를 함께 요청해도 하나만 선다»가 그 교착으로 죽는다).
 *
 * **없거나 읽을 수 없으면 `null`** — 그때 판정은 «막지 않는다»다(위). 올리는 기준은 `lockConflictError`와 같다(`migrateDocument`)
 * — 경로가 화면이 보는 문서의 것이어야 한다.
 */
export async function readSelectionRoot(trx: DbHandle, projectId: string, pageId: string): Promise<WbNode | null> {
  const page = await findPageById(trx, projectId, pageId)
  if (page === null) return null
  try {
    return migrateDocument(page.schema).root
  } catch {
    return null
  }
}
