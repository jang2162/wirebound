import { z } from 'zod'
import { getKoreanErrorMap } from '@wirebound/schema'

/**
 * API 서버 설정. env에서 읽어 검증한 값만 이 형태로 존재한다 —
 * 이후 코드는 문자열 env를 다시 파싱할 필요가 없다.
 */
export interface ApiConfig {
  nodeEnv: 'development' | 'test' | 'production'
  host: string
  port: number
  databaseUrl: string
  sessionCookieName: string
  sessionTtlHours: number
  passwordScryptN: number
  logLevel: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent'
}

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const

/**
 * 숫자 문자열 env를 검증하며 숫자로 바꾸는 zod 스키마.
 * `z.coerce.number()`는 빈 문자열이나 "포트" 같은 비숫자도 NaN 없이 통과시키므로 쓰지 않는다.
 */
function numericEnv(fieldName: string) {
  return z
    .string()
    .regex(/^\d+$/, `${fieldName}은 숫자여야 합니다`)
    .transform((value) => Number.parseInt(value, 10))
}

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: numericEnv('PORT').default(3001),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL이 필요합니다'),
  SESSION_COOKIE_NAME: z.string().default('wb_session'),
  SESSION_TTL_HOURS: numericEnv('SESSION_TTL_HOURS').default(720),
  PASSWORD_SCRYPT_N: numericEnv('PASSWORD_SCRYPT_N').default(32768),
  LOG_LEVEL: z.enum(LOG_LEVELS).optional(),
})

/**
 * 환경변수를 검증해 `ApiConfig`로 만든다.
 * 실패하면 zod 이슈를 한 줄씩 붙인 한국어 메시지로 `Error`를 던진다.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const parsed = EnvSchema.safeParse(env, { error: getKoreanErrorMap() })
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('\n')
    throw new Error(`설정을 읽을 수 없습니다:\n${detail}`)
  }

  const data = parsed.data
  // LOG_LEVEL 기본값은 NODE_ENV에 따라 달라지므로 zod 기본값이 아니라 여기서 채운다.
  const logLevel = data.LOG_LEVEL ?? (data.NODE_ENV === 'test' ? 'silent' : 'info')

  return {
    nodeEnv: data.NODE_ENV,
    host: data.HOST,
    port: data.PORT,
    databaseUrl: data.DATABASE_URL,
    sessionCookieName: data.SESSION_COOKIE_NAME,
    sessionTtlHours: data.SESSION_TTL_HOURS,
    passwordScryptN: data.PASSWORD_SCRYPT_N,
    logLevel,
  }
}
