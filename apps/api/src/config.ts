import { z } from 'zod'
import { getKoreanErrorMap } from '@wirebound/schema'
import { portAgreementError } from './db/port-agreement'

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
  /**
   * PPTX 화면 이미지를 그릴 브라우저 실행 파일. **비면 `undefined`다** —
   * 그때 `playwright-core`가 자기 캐시(`~/.cache/ms-playwright` 부류)에서 찾는다.
   *
   * **이 값이 있어야 기계에 이미 있는 브라우저를 쓸 수 있다.** `playwright-core`는
   * 실행 파일을 가리키는 환경변수를 **안 낸다**(1.62.1에서 쟀다 — `PLAYWRIGHT_BROWSERS_PATH`는
   * *캐시 디렉터리*라 그 안이 playwright의 `chromium_headless_shell-<리비전>/…` 배치여야
   * 한다). 그래서 배포판 chromium(`/usr/bin/chromium` 부류)을 쓰는 길이 이것뿐이다.
   */
  screenChromiumPath: string | undefined
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

const DATABASE_URL_MESSAGE = 'DATABASE_URL이 필요합니다'

/**
 * DATABASE_URL은 필수다. `z.string().min(1, ...)`만 쓰면 값이 아예 없을 때(undefined)
 * `.min()`이 아니라 base 타입 체크(invalid_type)가 먼저 걸려 로케일의 일반 메시지가 나가고,
 * 우리가 원하는 메시지는 빈 문자열("")을 넣었을 때만 나온다 — 실제 운영 실수(키 자체가 없는
 * 경우)에서는 정작 이 메시지를 보지 못하는 상황이었다. undefined를 빈 문자열로 미리
 * 치환해 두 경우 모두 같은 `.min()` 검사 하나로 수렴시킨다.
 */
const RequiredDatabaseUrl = z.preprocess(
  (value) => (value === undefined ? '' : value),
  z.string().min(1, DATABASE_URL_MESSAGE),
)

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().default('127.0.0.1'),
  PORT: numericEnv('PORT').default(3001),
  DATABASE_URL: RequiredDatabaseUrl,
  SESSION_COOKIE_NAME: z.string().default('wb_session'),
  SESSION_TTL_HOURS: numericEnv('SESSION_TTL_HOURS').default(720),
  PASSWORD_SCRYPT_N: numericEnv('PASSWORD_SCRYPT_N').default(32768),
  LOG_LEVEL: z.enum(LOG_LEVELS).optional(),
  SCREEN_CHROMIUM_PATH: z.string().optional(),
  /**
   * **`docker compose` 가 여는 호스트 포트.** 이 서버가 쓰는 값이 아니라 **`DATABASE_URL`
   * 안의 포트와 맞는지 재기 위해서만** 읽는다 — 그래서 `ApiConfig` 에 안 실린다.
   * 어긋나면 서버가 남의 컨테이너에 붙는데 붙는 데는 성공한다(`db/port-agreement.ts`).
   * **없으면 아무것도 안 잰다** — 자기 Postgres 를 쓰는 사람이 깨지면 안 된다.
   */
  POSTGRES_PORT: z.string().optional(),
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

  // **포트가 어긋나면 여기서 멈춘다.** 조용히 뜨면 옆 워크트리의 DB 를 열어 놓고
  // "잘 떴다"고 읽게 된다 — `db/port-agreement.ts` 의 머리말이 그 실측을 든다.
  // **`TEST_DATABASE_URL` 은 여기서 안 잰다** — 그 값은 `pnpm test` 만 쓰므로
  // 재는 자리도 거기다(`test/test-database-url.ts`). 테스트 값 하나 때문에 도는
  // 서버가 안 뜨면 그것대로 잘못이다.
  const disagreement = portAgreementError({
    postgresPort: data.POSTGRES_PORT,
    urls: { DATABASE_URL: data.DATABASE_URL },
  })
  if (disagreement !== undefined) {
    throw new Error(disagreement)
  }

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
    // **빈 문자열은 "안 줬다"와 같은 뜻이다.** `.env.example`이 주석으로 든 줄을 사람이
    // 주석만 풀고 값을 안 채우는 자리이고, 그대로 넘기면 `executablePath: ''`가 되어
    // *"Executable doesn't exist at "*라는 끝이 잘린 문장이 나온다.
    screenChromiumPath:
      data.SCREEN_CHROMIUM_PATH === undefined || data.SCREEN_CHROMIUM_PATH === ''
        ? undefined
        : data.SCREEN_CHROMIUM_PATH,
  }
}
