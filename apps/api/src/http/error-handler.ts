import type { FastifyInstance, FastifyReply } from 'fastify'
import { DbConnectionLostError } from '../db/connection-loss'
import { NulByteError } from '../db/nul-guard'
import { ProjectGoneError } from '../repos/projects'
import { ApiError, ERROR_STATUS, type ApiErrorIssue } from '../errors'

interface ErrorBody {
  code: string
  message: string
  issues?: ApiErrorIssue[]
}

/** issues가 없으면 응답 객체에 그 키 자체를 만들지 않는다(빈 배열이 아니다). */
function send(reply: FastifyReply, status: number, body: ErrorBody): void {
  reply.status(status).send({ error: body })
}

/**
 * 본문이 상한을 넘었을 때 Fastify가 붙이는 상태 코드.
 *
 * **`errors.ts`의 `ERROR_STATUS`에 두지 않는다** — 그 표는 **우리가 던지는** 코드의 표이고
 * 413에 대응하는 `ApiErrorCode`가 없다. 여기 있는 것은 *"남이 던진 상태를 알아보는"* 값이다.
 */
const ERROR_STATUS_PAYLOAD_TOO_LARGE = 413

/**
 * **DB 가 답하지 않은 실패의 상태 코드** — 그 요청이 반영됐는지 모른다(`db/connection-loss.ts`).
 *
 * **500 이 아닌 것이 요점이다.** 웹은 봉투 있는 500 을 «그 요청은 커밋 전»으로 읽어 코멘트 게시를 «확정 안
 * 달림»으로 판정한다(`apps/web`의 `comment-panel.tsx`의 `knownRejection` 표) — COMMIT 응답만 잃은 판이 그 모양으로
 * 나가면 사용자가 고쳐 달아 **두 행**이 된다. 503 은 그 표가 이미 «모른다»로 읽는 줄이다(웹을 고치지 않는다).
 *
 * **`code`는 `internal` 그대로다.** 413 과 같은 자리다 — `ERROR_STATUS`는 **우리가 던지는** 코드의 표이고, 코드를
 * 새로 세우면 웹의 계약 표(`API_ERROR_CODES`)에도 한 줄이 늘어야 한다. 화면이 이 실패를 코드로 가를 일은 없다 —
 * 가르는 것은 숫자다.
 */
const ERROR_STATUS_DB_UNREACHABLE = 503

/** Fastify 내부 오류(잘못된 JSON 등)가 갖는 `statusCode`를 안전하게 읽는다. */
function statusCodeOf(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('statusCode' in error)) return undefined
  const value = (error as { statusCode: unknown }).statusCode
  return typeof value === 'number' ? value : undefined
}

/**
 * 전역 에러 처리와 404 처리를 앱에 등록한다.
 *
 * - `ApiError`는 자신의 status·code·message(있으면 issues)를 그대로 응답한다.
 * - Fastify가 자체적으로 던지는 4xx 오류(깨진 JSON 본문 등)는 `bad-request`로 묶는다.
 * - **DB 가 답하지 않은 실패**(`DbConnectionLostError`)는 **503** — 결과를 모른다(`ERROR_STATUS_DB_UNREACHABLE`).
 * - **글자의 NUL**(`NulByteError`)은 400 `bad-request` — 쓰기 전에 거절했다.
 * - **트리 쓰기가 기다리는 사이 지워진 프로젝트**(`ProjectGoneError`)는 404 `not-found`.
 * - 그 외 예상 못 한 예외는 500 `internal` 고정 메시지로 응답하고, 원본은 로그에만 남긴다.
 *   응답 본문에 원본 메시지를 실으면 내부 정보가 새어 나갈 수 있어 절대 쓰지 않는다.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: unknown, request, reply) => {
    if (error instanceof ApiError) {
      send(reply, error.status, {
        code: error.code,
        message: error.message,
        ...(error.issues ? { issues: error.issues } : {}),
      })
      return
    }

    const statusCode = statusCodeOf(error)
    if (statusCode !== undefined && statusCode >= 400 && statusCode < 500) {
      // **413만 문장을 갈라 적는다(P7-3).** 나머지 4xx는 *"형식이 올바르지 않다"*가 참인데
      // 본문이 너무 큰 것은 **형식이 멀쩡한데 크기가 넘은 것**이라 그 문장이 거짓이다.
      //
      // **가져오기가 그 갈래를 흔한 것으로 만든다** — 파일 크기를 사용자가 정하기 때문이고
      // (P7-2 이월 §8이 지목한 축), 실측한 경계는 Fastify의 기본 본문 상한 1MiB다:
      // 노드 1000개(657KB)는 201, 5000개(3.3MB)는 413이다. 우리 상한을 새로 두지 않는 것은
      // 이미 상한이 하나 있고 그것이 **우리 코드에 닿기 전에** 끊기 때문이다 — 두 벌이 되면
      // 어느 쪽이 끊었는지가 응답에서 갈리지 않는다.
      const message =
        statusCode === ERROR_STATUS_PAYLOAD_TOO_LARGE
          ? '요청 본문이 너무 큽니다'
          : '요청 형식이 올바르지 않습니다'
      send(reply, statusCode, { code: 'bad-request', message })
      return
    }

    // **DB 가 답하지 않았다 — 결과를 모른다**(위 상수). 아래 500 보다 먼저다.
    if (error instanceof DbConnectionLostError) {
      request.log.error(error, 'DB 연결을 잃었다 — 요청의 결과를 모른다')
      send(reply, ERROR_STATUS_DB_UNREACHABLE, {
        code: 'internal',
        message: '데이터베이스와의 연결이 끊겨 요청이 반영됐는지 알 수 없습니다',
      })
      return
    }

    // **사용자가 보낸 글자에 NUL 이 있다**(`db/nul-guard.ts`의 `NulByteError`) — 쓰기 전에 거절했다.
    if (error instanceof NulByteError) {
      send(reply, ERROR_STATUS['bad-request'], { code: 'bad-request', message: error.message })
      return
    }

    // **트리 쓰기가 기다리는 사이 프로젝트가 지워졌다**(`repos/projects.ts`의 `lockProjectTree`) — 가드가 지워진 프로젝트에
    // 내는 것과 같은 404 다(`auth/roles.ts`).
    if (error instanceof ProjectGoneError) {
      send(reply, ERROR_STATUS['not-found'], { code: 'not-found', message: error.message })
      return
    }

    request.log.error(error, '처리되지 않은 예외')
    send(reply, ERROR_STATUS.internal, { code: 'internal', message: '서버 오류가 발생했습니다' })
  })

  app.setNotFoundHandler((_request, reply) => {
    send(reply, ERROR_STATUS['not-found'], { code: 'not-found', message: '대상을 찾을 수 없습니다' })
  })
}
