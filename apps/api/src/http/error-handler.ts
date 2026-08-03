import type { FastifyInstance, FastifyReply } from 'fastify'
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
      send(reply, statusCode, { code: 'bad-request', message: '요청 형식이 올바르지 않습니다' })
      return
    }

    request.log.error(error, '처리되지 않은 예외')
    send(reply, ERROR_STATUS.internal, { code: 'internal', message: '서버 오류가 발생했습니다' })
  })

  app.setNotFoundHandler((_request, reply) => {
    send(reply, ERROR_STATUS['not-found'], { code: 'not-found', message: '대상을 찾을 수 없습니다' })
  })
}
