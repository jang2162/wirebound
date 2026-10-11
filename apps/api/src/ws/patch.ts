/**
 * `patch` 프레임 하나를 처리한다 — 설계서 「정방향 흐름」의 서버 쪽 절반이 WebSocket으로 들어오는 자리다.
 *
 * # 두 진입점이 같은 것을 쓴다 (설계서 「LLM 편집 경로」)
 *
 * 「LLM 편집 경로」가 *"MCP의 `patch_page`는 WebSocket 대신 REST로 들어오지만, 그 뒤 파이프라인은 완전히
 * 같다"*고 적었다. 그래서 이 파일에는 **규칙이 없다.** 하는 일은 셋뿐이다:
 *
 * | 하는 일 | 어디에 있는 규칙인가 |
 * |---|---|
 * | 검증·적용·이력 기록 | `services/edit-pipeline.ts`의 `applyEdit` — `routes/pages.ts`가 부르는 그 함수다 |
 * | 실패 → 봉투 | `http/edit-outcome.ts`의 `editOutcomeToApiError` — REST가 상태 코드를 만드는 그 표다 |
 * | 알림 | `ws/notify.ts`의 `notifyPageChanged` — REST가 부르는 그 함수다 |
 *
 * **`applyEdit`을 여기서 부르므로 `test/broadcast-census.test.ts`가 먼저 죽는다.** 브로드캐스트가
 * 파이프라인 밖에 있으니 호출자가 빠뜨릴 수 있다(`ws/notify.ts`의 「왜 파이프라인 밖인가」). 인구조사가
 * `routes/`만이 아니라 `src/` 전체를 훑는 이유가 **정확히 이 파일**이다 — `routes/`만 훑으면 이 호출자를
 * 조용히 못 본다.
 *
 * # 발신자 제외는 헤더가 아니라 연결이다
 *
 * REST로 편집이 들어올 때는 서버가 *"이 요청이 어느 WS 연결의 것인가"*를 알 수 없어
 * `x-wb-connection-id` 헤더로 알린다. **여기서는 그 연결이 곧 발신자다** — 헤더가 필요 없다.
 * 헤더 자체는 지우지 않는다(「LLM 편집 경로」의 MCP가 REST로 들어온다).
 *
 * # 알림이 ack를 늦추지 않는다
 *
 * `notifyPageChanged`는 fire-and-forget이다(`ws/notify.ts`) — 룸의 연결마다 도는 조회
 * 두 건은 이 함수가 ack 프레임을 돌려준 **뒤에** 이어진다. 그래서 낸 사람의 pending 큐가
 * 룸 크기에 비례해 늦게 비지 않는다. 그 큐가 비어야 다음 편집의 `baseSeq`가 정해진다
 * (`apps/api/README.md` 「편집 파이프라인 (`PATCH .../ops`)」 절의 4단계).
 */
import type { FastifyInstance } from 'fastify'
import { recheckAtCommit } from '../auth/roles'
import { ApiError } from '../errors'
import { editOutcomeToApiError } from '../http/edit-outcome'
import { lockConflictError } from '../lock/check'
import { applyEdit } from '../services/edit-pipeline'
import { runEditTransaction } from '../services/lost-commit'
import { notifyPageChanged, pageStaleOnLateCommit } from './notify'
import { MIN_ROLE_FOR_FRAME, type ClientFrame, type ServerFrame } from './protocol'
import type { RoomConnection } from './rooms'

export type PatchFrame = Extract<ClientFrame, { type: 'patch' }>

/**
 * 실패 하나를 낸 사람에게 되돌려 줄 프레임으로. **`ApiError`를 그대로 펼친다** — 상태·코드·
 * 문장·이슈가 REST 봉투와 같은 값이라 받는 쪽이 접속 방식을 몰라도 된다.
 */
export function patchErrorFrame(
  projectId: string,
  frame: PatchFrame,
  error: Pick<ApiError, 'status' | 'code' | 'message' | 'issues'>,
): ServerFrame {
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
export async function handlePatchFrame(app: FastifyInstance, connection: RoomConnection, frame: PatchFrame): Promise<ServerFrame> {
  let settled
  try {
    // **COMMIT 답을 잃으면 그 자리에서 확인한다** — REST 와 같은 함수다(`services/lost-commit.ts`).
    settled = await runEditTransaction(
      app.db,
      frame.pageId,
      async (trx) => {
        // **설계서 「정방향 흐름」의 순서다** — 권한 확인(`ws/routes.ts`)이 이미 지났고, 적용 전에 잠금을 본다. **판정은 이 트랜잭션 안에서
        // 페이지 행을 잡고 한다** — 커밋까지 그 행을 쥐므로 판정 뒤 커밋 전에 겹치는 잠금이 서지 못한다(`lock/check.ts`의
        // «판정은 페이지 행 안에서»). 소유자는 **사람**이므로 같은 사람의 다른 탭이 잡은 것에는 막히지 않는다.
        // 막히면 던진다 — 아직 아무것도 안 썼고, 아래 `catch`가 423 프레임으로 옮긴다.
        const blocked = await lockConflictError(app, trx, {
          projectId: connection.projectId,
          pageId: frame.pageId,
          baseSeq: frame.baseSeq,
          ops: frame.ops,
          userId: connection.userId,
        })
        if (blocked !== null) throw blocked
        const edited = await applyEdit(trx, {
          projectId: connection.projectId,
          pageId: frame.pageId,
          baseSeq: frame.baseSeq,
          ops: frame.ops,
          // **actor는 연결이 든다.** 핸드셰이크가 세션 쿠키로 정한 값이고(설계서 「권한 모델」 — REST와 WS의 인증
          // 경로가 하나다), 프레임이 실어 온 값이 아니다.
          //
          // **`auth/actor.ts`의 `requestActor`를 안 쓴다 — 여기에는 요청이 없다.** 그리고 쓸
          // 이유도 없다: **WS는 쿠키만이다**(「권한 모델」 · `ws/routes.ts`의 `requireSessionAuth`가 토큰이
          // 실린 핸드셰이크를 401로 끊는다). 토큰이 이 자리에 닿을 수 없으므로 언제나 `'user'`가
          // 맞고, `test/actor-census.test.ts`가 그 판정을 표에 한 줄로 든다.
          actor: { type: 'user', id: connection.userId, label: connection.userName },
        })
        // **커밋 순간의 권한 · 자격** — REST 와 같은 함수다(`auth/roles.ts`의 `recheckAtCommit`). 프레임을 받을 때의
        // 확인(`ws/routes.ts`의 `stillAllowed`)은 잠금 **밖**이다 — `applyEdit`이 페이지 잠금에 선 동안 강등되거나
        // 로그아웃하면 그 확인은 낡는다. 최소 역할은 프레임 수신과 같은 표의 값, 스코프는 없고 자격은 연결이 든 세션이다
        // (WS 는 쿠키만이다).
        if (edited.ok) {
          await recheckAtCommit(trx, {
            projectId: connection.projectId,
            userId: connection.userId,
            min: MIN_ROLE_FOR_FRAME.patch,
            scopeProjectId: null,
            credential: { kind: 'session', id: connection.sessionId },
          })
        }
        return edited
      },
      pageStaleOnLateCommit(app, connection.projectId, frame.pageId),
    )
  } catch (error) {
    // 잠금 충돌(423)과 재확인의 거절은 REST 봉투와 같은 값으로 낸 사람에게 돌려준다. 그 밖의 예외는 그대로 던진다 —
    // `ws/routes.ts`의 `catch`가 500 프레임으로 답한다.
    if (error instanceof ApiError) return patchErrorFrame(connection.projectId, frame, error)
    throw error
  }

  const outcome = settled.outcome
  if (!outcome.ok) {
    return patchErrorFrame(connection.projectId, frame, editOutcomeToApiError(outcome, frame.baseSeq))
  }
  if (settled.confirmedAfterLoss) {
    app.log.warn({ pageId: frame.pageId, seq: outcome.seq, broadcast: settled.broadcast }, 'COMMIT 답을 잃었지만 새 연결로 커밋을 확인했다')
  }

  if (settled.broadcast)
    notifyPageChanged(app, {
      projectId: connection.projectId,
      pageId: frame.pageId,
      seq: outcome.seq,
      ops: frame.ops,
      warnings: outcome.warnings,
      actor: { type: 'user', label: connection.userName },
      origin: { connectionId: connection.id, sessionId: connection.sessionId },
      // 이 경로에서는 연결이 곧 발신자라 제외가 언제나 성립한다. 그래도 싣는 것은 **프레임의
      // 모양을 진입점에 따라 가르지 않기 위해서**다 — 받는 쪽이 어느 경로로 만들어진
      // 프레임인지 알 필요가 없어야 한다.
      //
      // **그래서 이 줄을 지워도 죽는 케이스가 없다.** 이 값을 관측할 연결이 없다 — 되받는
      // 사람이 없으므로 아무도 그것을 읽지 않는다. **지워도 되는 신호로 읽지 마라:** 발신자
      // 제외가 성립하지 않는 경로(`routes/pages.ts`의 REST)는 같은 값을 싣고 그쪽은 케이스가
      // 있다. 두 진입점이 같은 프레임을 내는 것이 이 줄의 이유다.
      clientOpId: frame.clientOpId,
    })

  return {
    type: 'patch-ack',
    projectId: connection.projectId,
    pageId: frame.pageId,
    clientOpId: frame.clientOpId,
    seq: outcome.seq,
    revisionId: outcome.revisionId,
    inverse: outcome.inverse,
    // **경고를 반드시 싣는다.** REST 응답만 나르면 사용자가 보는 것이 접속 방식에
    // 따라 갈린다 — `edit-pipeline.ts`의 성공 갈래가 그것을 계약으로 적었다.
    warnings: outcome.warnings,
  }
}
