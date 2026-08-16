/**
 * §7.2의 **2차 방어** — *"서버는 patch 수신 시 잠금 소유자를 재확인한다."*
 *
 * # 왜 `applyEdit` 안이 아닌가 (P3-2 이월 §2.1 · P3-3 D2)
 *
 * `services/edit-pipeline.ts`가 *"`services/`는 SQL을 직접 쓰지 않고 HTTP도 모른다"*를
 * 계약으로 못박았다. 잠금 저장소는 §7.2가 **서버 인메모리**로 정했고 전송 계층(`ws/`)에
 * 걸려 있으므로, 파이프라인이 그것을 알면 P3-1 D3이 지킨 경계가 깨진다.
 *
 * **그래서 호출자가 부르고, 호출자가 빠뜨릴 수 있다.** 그 대가를 갚는 것은
 * `test/lock-census.test.ts`다 — `applyEdit`을 부르는 자리를 소스에서 세고, 그 자리마다
 * *"잠금을 보는가"*를 판정과 함께 표에 적는다. 새 호출자가 생기면 그 파일이 **먼저 죽는다.**
 * (`test/broadcast-census.test.ts`가 알림에 대해 하는 것과 같은 형태이고, 같은 분모를 쓴다.)
 *
 * # §7.1의 순서 — 그리고 `baseSeq`가 그 순서를 실제로 지킨다
 *
 * §7.1은 *"권한 확인(editor+) → **잠금 확인** → 적용"*이다. 이 함수는 `applyEdit` **밖**에서
 * 도므로 문서를 따로 읽고, 그 사이 다른 편집이 커밋될 수 있다 — 즉 잠금을 **낡은 문서**로
 * 판정할 창이 있어 보인다.
 *
 * **그 창은 `baseSeq`가 닫는다.** 아래는 읽은 페이지의 `headSeq`가 요청의 `baseSeq`와 다르면
 * **판정하지 않고 지나간다.** 그러면 남는 판은 `headSeq === baseSeq`뿐이고, 파이프라인
 * 3단계는 자기가 잠근 행의 `head_seq`가 `baseSeq`와 **정확히 같을 때만** 적용한다. 한 페이지의
 * 어떤 seq에 대응하는 문서는 하나이므로, **적용되는 편집은 언제나 이 함수가 본 그 문서 위에서
 * 적용된다.** 다르면 파이프라인이 `stale`로 답하고 이 함수의 판정은 쓰이지 않는다.
 *
 * # 비용 — 잠금이 없으면 조회도 없다
 *
 * 편집 하나당 페이지 조회가 하나 는다. **다만 그 페이지에 (나 아닌 사람의) 잠금이 하나라도
 * 있을 때만이다** — 혼자 편집하는 흔한 판에서는 조회가 늘지 않는다. *"누구의 잠금이 뜻이
 * 있는가"*는 여기서 다시 쓰지 않고 `@wirebound/schema`의 `locksAgainst`를 부른다(D7).
 */
import { findLockConflict, locksAgainst, lockPointers, migrateDocument, type PatchOp } from '@wirebound/schema'
import type { FastifyInstance } from 'fastify'
import { locked, type ApiError } from '../errors'
import { findPageById } from '../repos/pages'

export interface LockCheckInput {
  projectId: string
  pageId: string
  /** 요청이 선 revision. 이 값이 페이지의 현재 `headSeq`와 다르면 판정하지 않는다(위 머리말). */
  baseSeq: number
  ops: PatchOp[]
  /** 편집을 내는 **사람**. 연결이 아니다(D3) — 같은 사람의 다른 탭에 막히지 않는다. */
  userId: string
}

/**
 * 남의 잠금과 부딪치면 그 실패를 낸다. 아니면 `null`이다.
 *
 * **던지지 않고 값을 낸다** — `editOutcomeToApiError`가 파이프라인의 실패에 대해 하는 것과
 * 같은 모양이라, 두 진입점이 그것을 각자의 방식으로(REST는 `throw`, WS는 프레임) 옮긴다.
 */
export async function lockConflictError(app: FastifyInstance, input: LockCheckInput): Promise<ApiError | null> {
  const onPage = app.realtime.locks.liveIn(input.projectId).filter((lock) => lock.pageId === input.pageId)
  if (locksAgainst(onPage, input.userId).length === 0) return null

  const page = await findPageById(app.db, input.projectId, input.pageId)
  // **없는 페이지·낡은 요청·읽을 수 없는 버전은 여기서 판정하지 않는다.** 셋 다 파이프라인이
  // 자기 이름으로 답한다(`not-found`·`stale`·`unsupported-version`) — 여기서 그것을 잠금
  // 충돌로 덮으면 사용자가 **겪지 않은 실패**를 듣는다.
  if (page === null || page.headSeq !== input.baseSeq) return null

  let root
  try {
    // 파이프라인 2단계와 같은 기준으로 올린다 — 안 올리면 경로가 저장된 문서의 것이라
    // 클라이언트가 만든 `ops`의 경로와 어긋날 수 있다.
    root = migrateDocument(page.schema).root
  } catch {
    return null
  }

  const conflict = findLockConflict({
    root,
    locks: onPage,
    pointers: lockPointers(input.ops),
    viewerUserId: input.userId,
  })
  if (conflict === null) return null

  // **누가 잡고 있는지를 문장에 싣는다.** 화면은 배지로 그것을 이미 아는 것이 보통이지만,
  // 이 실패에 닿는 것은 **배지를 못 본 클라이언트**다(§7.4의 MCP·다른 도구) — 그쪽에는
  // 이 문장이 유일한 설명이다.
  return locked(`${conflict.userName}님이 편집 중인 영역입니다`)
}
