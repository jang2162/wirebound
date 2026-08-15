/**
 * `patch` 프레임 하나를 처리한다 — §7.1의 서버 쪽 절반이 WebSocket으로 들어오는 자리다.
 *
 * # 두 진입점이 같은 것을 쓴다 (P3-2 D5 · §7.4)
 *
 * §7.4가 *"MCP의 `patch_page`는 WebSocket 대신 REST로 들어오지만, 그 뒤 파이프라인은 완전히
 * 같다"*고 적었다. 그래서 이 파일에는 **규칙이 없다.** 하는 일은 셋뿐이다:
 *
 * | 하는 일 | 어디에 있는 규칙인가 |
 * |---|---|
 * | 검증·적용·이력 기록 | `services/edit-pipeline.ts`의 `applyEdit` — `routes/pages.ts`가 부르는 그 함수다 |
 * | 실패 → 봉투 | `http/edit-outcome.ts`의 `editOutcomeToApiError` — REST가 상태 코드를 만드는 그 표다 |
 * | 알림 | `ws/notify.ts`의 `notifyPageChanged` — REST가 부르는 그 함수다 |
 *
 * **`applyEdit`을 여기서 부르므로 `test/broadcast-census.test.ts`가 먼저 죽는다.** 그것이
 * P3-1 D3의 설계다(브로드캐스트가 파이프라인 밖에 있으니 호출자가 빠뜨릴 수 있다). 앞
 * 슬라이스의 리뷰가 인구조사의 훑는 범위를 `src/` 전체로 넓힌 이유가 **정확히 이 파일**이다.
 *
 * # 발신자 제외는 헤더가 아니라 연결이다 (이월 §2.1)
 *
 * REST로 편집이 들어올 때는 서버가 *"이 요청이 어느 WS 연결의 것인가"*를 알 수 없어
 * `x-wb-connection-id` 헤더로 알렸다. **여기서는 그 연결이 곧 발신자다** — 헤더가 필요 없다.
 * 헤더 자체는 지우지 않는다(§7.4의 MCP가 REST로 들어온다).
 *
 * # 알림이 ack를 늦추지 않는다
 *
 * `notifyPageChanged`는 fire-and-forget이다(`ws/notify.ts`) — 룸의 연결마다 도는 조회
 * 두 건은 이 함수가 ack 프레임을 돌려준 **뒤에** 이어진다. 그래서 낸 사람의 pending 큐가
 * 룸 크기에 비례해 늦게 비지 않는다. 그 큐가 비어야 다음 편집의 `baseSeq`가 정해진다
 * (README 4단계).
 */
import type { FastifyInstance } from 'fastify'
import type { ApiError } from '../errors'
import { editOutcomeToApiError } from '../http/edit-outcome'
import { applyEdit } from '../services/edit-pipeline'
import { notifyPageChanged } from './notify'
import type { ClientFrame, ServerFrame } from './protocol'
import type { RoomConnection } from './rooms'

export type PatchFrame = Extract<ClientFrame, { type: 'patch' }>

/**
 * 실패 하나를 낸 사람에게 되돌려 줄 프레임으로. **`ApiError`를 그대로 펼친다** — 상태·코드·
 * 문장·이슈가 REST 봉투와 같은 값이라 받는 쪽이 접속 방식을 몰라도 된다.
 */
export function patchErrorFrame(projectId: string, frame: PatchFrame, error: ApiError): ServerFrame {
  return {
    type: 'patch-error',
    projectId,
    pageId: frame.pageId,
    clientOpId: frame.clientOpId,
    status: error.status,
    code: error.code,
    // 봉투의 `issues`는 optional이지만 프레임에서는 항상 배열이다 — 받는 쪽이 그냥 순회할 수
    // 있어야 한다(`apps/web`의 `ApiError`가 같은 관례를 쓴다).
    issues: error.issues ?? [],
    message: error.message,
  }
}

/** `patch` 하나를 처리하고 **낸 사람에게 돌려줄 프레임**을 낸다. */
export async function handlePatchFrame(
  app: FastifyInstance,
  connection: RoomConnection,
  frame: PatchFrame,
): Promise<ServerFrame> {
  const outcome = await applyEdit(app.db, {
    projectId: connection.projectId,
    pageId: frame.pageId,
    baseSeq: frame.baseSeq,
    ops: frame.ops,
    // **actor는 연결이 든다.** 핸드셰이크가 세션 쿠키로 정한 값이고(§10 — REST와 WS의 인증
    // 경로가 하나다), 프레임이 실어 온 값이 아니다.
    actor: { type: 'user', id: connection.userId, label: connection.userName },
  })

  if (!outcome.ok) {
    return patchErrorFrame(connection.projectId, frame, editOutcomeToApiError(outcome, frame.baseSeq))
  }

  notifyPageChanged(app, {
    projectId: connection.projectId,
    pageId: frame.pageId,
    seq: outcome.seq,
    ops: frame.ops,
    warnings: outcome.warnings,
    actor: { type: 'user', label: connection.userName },
    originConnectionId: connection.id,
  })

  return {
    type: 'patch-ack',
    projectId: connection.projectId,
    pageId: frame.pageId,
    clientOpId: frame.clientOpId,
    seq: outcome.seq,
    revisionId: outcome.revisionId,
    inverse: outcome.inverse,
    // **경고를 반드시 싣는다**(P4a-3). REST 응답만 나르면 사용자가 보는 것이 접속 방식에
    // 따라 갈린다 — `edit-pipeline.ts`의 성공 갈래가 그것을 계약으로 적었다.
    warnings: outcome.warnings,
  }
}
