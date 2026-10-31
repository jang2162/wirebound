/**
 * **초대 · 재설정 링크 원문을 로그에서 가린다.**
 *
 * 링크 원문은 경로에 든다(`/api/auth/invites/<원문>` · `/api/auth/invites/<원문>/signup` · `/api/auth/resets/<원문>`). DB 에는 해시만 두는데,
 * 요청 로그가 경로를 그대로 적으면 로그를 읽는 사람이 만료 · 거둠 전까지 그 링크로 가입하거나 남의 비밀번호를 바꾼다. 원문을 본문으로
 * 옮기는 길은 API 계약(경로 넷)과 웹이 짓는 링크 주소 꼴을 바꿔 고르지 않았다.
 *
 * **경로가 로그에 닿는 칸은 셋이고 셋 다 이 파일의 `maskLinkTokens` 하나를 지난다**(`buildLoggerOptions` 가 pino 시리얼라이저로 건다):
 * - `req` 시리얼라이저 — Fastify 의 «incoming request» 줄과 기본 오류 처리기의 5xx 줄이 `{ req: request }` 로 싣는다.
 * - `err` 시리얼라이저 — Fastify 가 `FST_ERR_REP_ALREADY_SENT`(이미 보낸 답) 오류의 문장에 경로를 넣는다.
 * - `msg` 시리얼라이저 — 문장 칸. `%s` 를 채운 뒤의 글자이고, 문장 없이 오류만 실은 줄에 pino 가 옮겨 적는 오류 문장도 여기를 지난다
 *   (`FST_ERR_REP_ALREADY_SENT` 의 줄 · Fastify 의 «Reply was already sent … in the "<경로>"» 경고 · 기본 404 처리기의 «Route …:<경로> not
 *   found» — 이 앱은 `setNotFoundHandler` 로 갈아 끼워 마지막 것은 지금 안 찍는다). 그래서 글자 인자를 고치는 `hooks.logMethod` 는 안 쓴다 —
 *   오류에서 옮겨 온 문장을 못 본다.
 *
 * 앱 코드에는 경로 · `params` 를 싣는 로그 호출이 없다(`request.log.*` 는 `http/error-handler.ts` 의 둘 — 오류 객체만 싣는다).
 * 재는 곳은 `test/rv-ac-link-exposure.test.ts` 다.
 */
import { stdSerializers } from 'pino'

/** 가린 자리에 남기는 글자. 헤더 `redact` 의 `censor` 와 같은 값이다. */
export const LOG_MASK = '[REDACTED]'

/**
 * 링크 경로의 머리와 그 뒤 꼬리(원문 · `/signup` · 쿼리). 꼬리는 공백 · 따옴표 · 꺾쇠에서 끊는다 — 경로만이 아니라 경로를 인용한
 * 문장에도 같은 식을 쓰기 때문이다. 원문만이 아니라 꼬리째 가리는 까닭: 링크 원문은 경로 조각 하나지만 `%2F` 따위로 나뉘어 들어온
 * 판에서도 한 조각이 남지 않게 한다 — 꼬리에 남는 것은 `/signup` 뿐이고 메서드가 그 둘을 가른다(GET 은 확인, POST 는 가입).
 *
 * **대소문자 · 겹친 빗금을 받는다** — 라우터는 그 꼴을 404 로 끝내지만 원문은 진짜 링크일 수 있다(그 404 의 «incoming request» 줄).
 */
const LINK_PATH = /(\/auth\/+(?:invites|resets)\/)[^\s"'<>]*/gi

/**
 * **퍼센트 인코딩을 풀고 견준다** — Fastify 의 라우터는 `/api/auth/%69nvites/<원문>` 을 `/api/auth/invites/:token` 으로 받아 그 원문을
 * 쓴다(잰 값: 200 · `params.token` 이 원문). 풀지 않고 견주면 그 판이 그대로 남는다. 잇단 이스케이프를 한 덩이로 풀고(여러 바이트 UTF-8),
 * 못 푸는 덩이는 그대로 둔다.
 */
function decodeEscapes(text: string): string {
  return text.replace(/(?:%[0-9a-f]{2})+/gi, (run) => {
    try {
      return decodeURIComponent(run)
    } catch {
      return run
    }
  })
}

/**
 * 글자 속 링크 경로의 원문을 가린다. 링크 경로가 없으면 받은 글자를 그대로 낸다 — 다른 요청의 로그는 인코딩된 꼴 그대로 남는다.
 * 있으면 이스케이프를 푼 글자에서 가린 값을 낸다.
 */
export function maskLinkTokens(text: string): string {
  const decoded = decodeEscapes(text)
  const masked = decoded.replace(LINK_PATH, `$1${LOG_MASK}`)
  return masked === decoded ? text : masked
}

/** `req` 시리얼라이저가 읽는 칸. Fastify 요청이 오고, 누가 `request.raw` 를 실어도 죽지 않게 칸마다 없을 수 있다. */
interface LoggedRequest {
  method?: string
  url?: string
  headers?: Record<string, string | string[] | undefined>
  host?: string
  ip?: string
  socket?: { remotePort?: number }
}

/**
 * **Fastify 기본 `req` 시리얼라이저(`fastify/lib/logger-pino.js`)와 같은 칸만 낸다 — `url` 만 가린다.** `headers` · 본문을 싣지 않는 것이
 * 쿠키 · 인증 헤더 · 비밀번호가 로그에 안 남는 실제 까닭이다(`buildLoggerOptions` 머리말 · `test/logging.test.ts`). 칸을 더하면 그
 * 전제가 바뀐다.
 */
export function serializeRequest(request: LoggedRequest): Record<string, unknown> {
  return {
    method: request.method,
    url: typeof request.url === 'string' ? maskLinkTokens(request.url) : request.url,
    version: request.headers?.['accept-version'],
    host: request.host,
    remoteAddress: request.ip,
    remotePort: request.socket?.remotePort,
  }
}

/** pino 의 오류 시리얼라이저 위에 문장 · 스택만 가린다. */
export function serializeError(error: Error): ReturnType<typeof stdSerializers.err> {
  const serialized = stdSerializers.err(error)
  if (typeof serialized.message === 'string') serialized.message = maskLinkTokens(serialized.message)
  if (typeof serialized.stack === 'string') serialized.stack = maskLinkTokens(serialized.stack)
  return serialized
}
