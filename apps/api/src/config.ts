import { createRequire } from 'node:module'
import { isIP } from 'node:net'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { getKoreanErrorMap } from '@wirebound/schema'
import { DEFAULT_DB_TIME_LIMITS, type DbTimeLimits } from './db/client'
import { portAgreementError } from './db/port-agreement'
import { EXPORT_RENDER_LIMIT } from './services/export-worker'

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
  /** 풀과 연결의 시간 제한 — 뜻과 기본값의 근거는 `db/client.ts`의 `createPool` 머리말 «네트워크 분할». */
  dbTimeLimits: DbTimeLimits
  /**
   * **믿는 앞단의 주소**(IP · CIDR). 비면 아무도 안 믿는다 — 요청의 주소(`request.ip`)는 소켓 주소다. 차 있으면 그 주소에서 온 요청은
   * `X-Forwarded-For` 가 적은 주소를 쓴다(Fastify 의 `trustProxy`). 읽는 자는 로그인 제한의 주소 키다(`auth/login-limit.ts` 머리말).
   */
  trustProxy: string[]
  /**
   * **동시에 뜨는 화면 그리기 브라우저 수** — 내보내기 풀의 그리기 칸(`services/export-worker.ts` 의 «칸이 둘이다»). 브라우저 하나가
   * 수백 MB 를 먹어 이 수가 곧 그리기의 메모리 상한이다 — 값을 고르는 법은 docs/guides/development.md 「배포하려면」의 「화면 그리기 상한」.
   */
  exportRenderLimit: number
  /**
   * 시스템 테마 산출물(`<이 디렉터리>/*\/dist/*.wbtheme` — `package.json` 이 있는 테마 디렉터리만)을 찾는 곳 — 기동 시딩
   * (`services/system-themes.ts`)이 읽는다. 기본은 저장소의 `system-themes` 다(`DEFAULT_SYSTEM_THEMES_DIR`).
   */
  systemThemesDir: string
  /** 관리자가 내려받는 스타터 템플릿 zip(`routes/admin-themes.ts`). 기본은 kit 이 짓는 자리다(`DEFAULT_THEME_TEMPLATE_ZIP`). */
  themeTemplateZip: string
  /** 그림 한도(바이트) — 파일 하나 · 프로젝트 전체 · 사람 하나(`routes/assets.ts`). 기본값은 `DEFAULT_ASSET_LIMITS`. */
  assetLimits: AssetLimits
}

export interface AssetLimits {
  fileBytes: number
  projectBytes: number
  personalBytes: number
}

const MB = 1024 * 1024

/**
 * 그림 한도의 기본값 — 파일 5 MB · 프로젝트 200 MB · 사람 100 MB(설계 spec `2026-10-24-compose-input-design.md` «한도»). 파일 하나는 테마 패키지
 * 상한(10 MB)보다 작게 둔다. 그림은 DB 에 산다 — 이 셋이 DB 볼륨 · 백업이 그림 때문에 자라는 폭을 묶는다.
 */
export const DEFAULT_ASSET_LIMITS: AssetLimits = { fileBytes: 5 * MB, projectBytes: 200 * MB, personalBytes: 100 * MB }

/** 저장소의 `system-themes` — 이 파일(`apps/api/src/config.ts`)에서 세 단계 위. 운영 이미지도 저장소를 통째로 싣는다(`Dockerfile`). */
export const DEFAULT_SYSTEM_THEMES_DIR = fileURLToPath(new URL('../../../system-themes', import.meta.url))

/** 저장소 빌드(`pnpm build:template`)가 짓는 템플릿 zip — kit 의 `pack-template` 기본 출력이다. */
export const DEFAULT_THEME_TEMPLATE_ZIP = fileURLToPath(
  new URL('../../../packages/theme-kit/dist/wirebound-theme-starter.zip', import.meta.url),
)

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

/** 그림 한도 env — 비면 기본값 · 1 이상(0 은 올리기를 끄는 값이 아니다). */
function assetLimitEnv(fieldName: string, fallback: number) {
  return z.preprocess(
    (value) => (value === '' ? undefined : value),
    numericEnv(fieldName)
      .refine((limit) => limit >= 1, `${fieldName}은 1 이상이어야 합니다`)
      .default(fallback),
  )
}

/**
 * **DB 시간 제한 env**(`db/client.ts`의 `DbTimeLimits`).
 *
 * - **빈 값(`KEY=`)은 기본값이다** — `.env.example`이 «비우면 기본값»이라 적었고 사람이 주석만 풀고 값을 비우는 자리다.
 *   그것을 `…은 숫자여야 합니다`로 기동 거절하면 문서와 동작이 갈린다.
 * - **0 은 싣지 않는다** — 서버·DB 설정(idle) · pg 기본(풀 대기는 끝없음 · keepalive 는 OS 기본)을 따른다.
 * - **상한을 넘으면 기동 거절**이다 — 넘긴 값이 조용히 다른 뜻이 된다: 풀 대기는 Node 타이머가 2^31−1 을 넘으면 1ms 로 걸어
 *   **모든 연결이 1ms 에 시간 제한**(«연결을 잃었습니다»로 죽어 설정 탓이라는 말이 없다), idle 은 서버가
 *   `22023 … exceeds integer range`로 모든 연결을 거절한다.
 * - keepalive 는 Node 가 **초로 내려** 건다(`setKeepAlive` → `~~(ms / 1000)`) — 1–999 는 0초라 첫 탐침이 조용히 OS 기본으로
 *   간다(코드 읽기). 리눅스 `TCP_KEEPIDLE` 상한은 32767초다.
 */
const DB_TIME_LIMIT_MAX_MS = 2_147_483_647
const DB_KEEPALIVE_IDLE_MIN_MS = 1_000
const DB_KEEPALIVE_IDLE_MAX_MS = 32_767_000

function dbTimeLimitEnv(fieldName: string, fallback: number, min: number, max: number) {
  const range = min === 1 ? `${max} 이하` : `${min} 이상 ${max} 이하`
  return z.preprocess(
    (value) => (value === '' ? undefined : value),
    numericEnv(fieldName)
      .refine((ms) => ms === 0 || (ms >= min && ms <= max), `${fieldName}은 0(싣지 않음) 또는 ${range}의 ms 여야 합니다`)
      .default(fallback),
  )
}

/**
 * `TRUST_PROXY` — 쉼표로 가른 IP 또는 CIDR. **빈 값은 «안 믿는다»다.** 받는 것을 주소 · CIDR 로 묶은 까닭: Fastify 는 `true`(모두 믿음) ·
 * 홉 수도 받는데, 둘 다 api 에 바로 닿는 사람이 `X-Forwarded-For` 를 지어 적으면 그 주소가 된다 — 로그인 제한의 주소 키를 아무 주소로나
 * 바꿔 비켜 간다. 앞단이 어디서 오는지를 적게 해야 그 앞단이 적은 것만 믿는다.
 *
 * 같은 까닭으로 **모두를 믿는 대역도 거절한다**(`trustProxyItemError`) — 접두 0, 그리고 IPv4 클라이언트 전부를 믿는 IPv6 대역.
 * Fastify 는 IPv4 클라이언트를 매핑 꼴(`::ffff:a.b.c.d`)로 바꿔 IPv6 대역과 견주므로 그 매핑 대역(`::ffff:0:0/96`)을 덮는 IPv6 대역은
 * IPv4 전부를 믿는다 — `::ffff:10.0.0.0/8` 은 10/8 이 아니라 `::/8` 이고, 글자 `::0.0.0.0/96` 은 Fastify 가 매핑 꼴로 읽어 IPv4 전부다
 * (값이 같은 `0:0:0:0:0:0:0.0.0.0/96` 은 IPv6 대역이다). 글자마다 읽는 법이 갈려 **그 판독기로 잰다**(`fastifyTrust` · `trustsAllIPv4`).
 * **항목 하나하나는 좁아도 합이 IPv4 전부인 목록**(`0.0.0.0/1,128.0.0.0/1`)도 거절한다 — 목록째 그 판독기에 물려 잰다.
 * «거의 전부»(빈 칸이 주소 하나)는 받는다 — 문턱을 둘 근거가 없다. `.env.example` 의 `TRUST_PROXY` 줄이 «클라이언트가 닿는 대역을 적지 않는다»로
 * 사람에게 맡긴다.
 */
const TrustProxyEnv = z.preprocess(
  (value) => (value === undefined ? '' : value),
  z
    .string()
    .transform((value) =>
      value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item !== ''),
    )
    .superRefine((items, ctx) => {
      let refused = 0
      for (const item of items) {
        const message = trustProxyItemError(item)
        if (message === undefined) continue
        refused += 1
        ctx.addIssue({ code: 'custom', message })
      }
      // 합은 항목이 다 받는 값일 때만 잰다 — 못 읽는 항목이 있으면 판독기가 목록째 던진다.
      if (refused === 0 && items.length > 1 && trustsAllIPv4(items)) {
        ctx.addIssue({
          code: 'custom',
          message: `"${items.join(',')}"은 항목을 합치면 모든 IPv4 주소를 믿습니다 — 앞단의 주소만 적어야 합니다`,
        })
      }
    }),
)

/** `TRUST_PROXY` 의 항목 하나를 잰다 — 받으면 `undefined`, 아니면 사람에게 보일 문장. */
function trustProxyItemError(item: string): string | undefined {
  const invalid = 'TRUST_PROXY는 쉼표로 가른 IP 또는 CIDR(예: 10.0.0.2,172.16.0.0/12)이어야 합니다'
  const [address, prefixText, extra] = item.split('/')
  if (extra !== undefined || address === undefined) return invalid
  const version = isIP(address)
  if (version === 0) return invalid
  if (prefixText !== undefined && !/^\d+$/.test(prefixText)) return invalid
  const prefix = prefixText === undefined ? undefined : Number(prefixText)
  if (prefix !== undefined && prefix > (version === 4 ? 32 : 128)) return invalid
  if (prefix === 0) return `"${item}"은 접두 0 이라 모든 주소를 믿습니다 — 앞단의 주소만 적어야 합니다`
  // 판독기가 못 읽는 항목은 여기서 거절한다 — 받은 항목은 목록째 물려도(`trustsAllIPv4`) 판독기가 던지지 않는다.
  try {
    fastifyTrust([item])
  } catch {
    return invalid
  }
  if (prefix !== undefined && trustsAllIPv4([item])) {
    return `"${item}"은 모든 IPv4 주소를 믿습니다 — IPv4 대역은 IPv4 꼴(예: 10.0.0.0/8)로, IPv4 매핑 IPv6 은 접두 97 이상으로 적어야 합니다`
  }
  return undefined
}

/**
 * 받은 목록이 **IPv4 전부**를 믿는가 — 목록째 Fastify 의 판독기(`fastifyTrust`)에 물려 잰다. 판독기가 믿는 IPv4 는 항목마다 이어진 구간의
 * 합이라, 합에 빈 칸이 있으면 가장 작은 빈 칸은 `0` 이거나 어느 구간의 끝 + 1 이다 — 그 점들만 물어도 빈 칸을 놓치지 않는다. 구간의 끝은
 * 판독기가 쓰는 ipaddr.js 로 읽는다(`ipv4Span`).
 *
 * **실패 방향이 한쪽이다.** 판정은 판독기의 답이라, 모든 점을 믿는 목록만 거절한다 — IPv4 전부를 믿는 목록은 끝을 잘못 읽어도 모든 점을
 * 믿으므로 늘 거절된다(거짓 초록이 없다). 끝을 잘못 읽으면 빈 칸이 있는 목록을 거절할 수 있다(거짓 빨강 — 기동이 문장으로 멈춘다).
 * IPv4 클라이언트는 두 꼴로 오지만(`a.b.c.d` · 이중 스택 소켓의 `::ffff:a.b.c.d`) 판독기가 둘을 같은 IPv4 로 바꿔 견주므로 한 꼴만 묻는다 —
 * 받은 목록의 빈 칸이 두 꼴 모두 제 주소인지는 `test/login-limit.test.ts` «항목의 합에 빈 칸이 있으면 …»이 실물 Fastify 로 잰다.
 */
function trustsAllIPv4(items: string[]): boolean {
  const trusts = fastifyTrust(items)
  const probes = [0]
  for (const item of items) {
    const end = ipv4Span(item)?.[1]
    if (end !== undefined && end < IPV4_LAST) probes.push(end + 1)
  }
  const dotted = probes.map((n) => [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.'))
  return dotted.every((address) => trusts(address, 0))
}

const IPV4_LAST = 0xffffffff

/**
 * 항목 하나가 판독기에서 덮는 IPv4 구간(`[처음, 끝]` — 32비트 수) — 없으면 `undefined`. 판독기(`@fastify/proxy-addr` 의 `parseipNotation`)와
 * 같게 읽는다: 접두 없는 IPv4 매핑 IPv6 은 IPv4 주소 하나고, 그 밖의 IPv6 대역은 IPv4 매핑 대역(`::ffff:0:0/96`)과 겹치는 만큼 IPv4 를 덮는다
 * (IPv4 클라이언트를 매핑 꼴로 바꿔 견준다). 이 읽기가 틀려도 거짓 빨강 쪽으로만 틀린다(`trustsAllIPv4`).
 */
function ipv4Span(item: string): [number, number] | undefined {
  const slash = item.lastIndexOf('/')
  let ip = ipaddr.parse(slash === -1 ? item : item.slice(0, slash))
  if (slash === -1 && ip.kind() === 'ipv6' && ip.isIPv4MappedAddress()) ip = ip.toIPv4Address()
  const bits = slash === -1 ? (ip.kind() === 'ipv4' ? 32 : 128) : Number(item.slice(slash + 1))
  if (ip.kind() === 'ipv4') {
    const [a = 0, b = 0, c = 0, d = 0] = ip.toByteArray()
    return ipv4Block(((a << 24) | (b << 16) | (c << 8) | d) >>> 0, bits)
  }
  if (bits <= 96) return IPV4_MAPPED.match(ip, bits) ? [0, IPV4_LAST] : undefined
  if (!ip.match(IPV4_MAPPED, 96)) return undefined
  const [, , , , , , high = 0, low = 0] = ip.parts
  return ipv4Block(((high << 16) | low) >>> 0, bits - 96)
}

function ipv4Block(address: number, bits: number): [number, number] {
  const mask = bits === 0 ? 0 : (IPV4_LAST << (32 - bits)) >>> 0
  const start = (address & mask) >>> 0
  return [start, (start | (~mask >>> 0)) >>> 0]
}

/**
 * Fastify 가 `trustProxy` 배열로 믿을 주소를 가르는 함수를 짓는다 — Fastify 가 부르는 바로 그 모듈(`@fastify/proxy-addr` 의
 * `compile`)이다. 이 저장소의 의존이 아니라 Fastify 의 의존이라 Fastify 의 자리에서 찾는다(판이 갈리지 않게). 그 모듈이 주소를 읽는
 * ipaddr.js 도 그 모듈의 자리에서 찾는다 — 설치 배치에 따라 다른 판(1.x)이 이 저장소 쪽에 올라와 있을 수 있다.
 */
const fastifyRequire = createRequire(createRequire(import.meta.url).resolve('fastify'))
const fastifyTrust = fastifyRequire('@fastify/proxy-addr').compile as (value: string[]) => (address: string, hop: number) => boolean

/** 판독기가 쓰는 ipaddr.js 에서 여기서 부르는 것만. */
interface IpAddress {
  kind(): 'ipv4' | 'ipv6'
  match(range: IpAddress, bits: number): boolean
  isIPv4MappedAddress(): boolean
  toIPv4Address(): IpAddress
  toByteArray(): number[]
  parts: number[]
}
const ipaddr = createRequire(fastifyRequire.resolve('@fastify/proxy-addr'))('ipaddr.js') as { parse(text: string): IpAddress }
const IPV4_MAPPED = ipaddr.parse('::ffff:0:0')

const DATABASE_URL_MESSAGE = 'DATABASE_URL이 필요합니다'

/**
 * DATABASE_URL은 필수다. `z.string().min(1, ...)`만 쓰면 값이 아예 없을 때(undefined)
 * `.min()`이 아니라 base 타입 체크(invalid_type)가 먼저 걸려 로케일의 일반 메시지가 나가고,
 * 우리가 원하는 메시지는 빈 문자열("")을 넣었을 때만 나온다 — 실제 운영 실수(키 자체가 없는
 * 경우)에서는 정작 이 메시지를 보지 못한다. undefined를 빈 문자열로 미리
 * 치환해 두 경우 모두 같은 `.min()` 검사 하나로 수렴시킨다.
 */
const RequiredDatabaseUrl = z.preprocess((value) => (value === undefined ? '' : value), z.string().min(1, DATABASE_URL_MESSAGE))

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
  /** 믿는 앞단 — `ApiConfig.trustProxy` · `TrustProxyEnv`. */
  TRUST_PROXY: TrustProxyEnv,
  /** 그림 한도(바이트) — `ApiConfig.assetLimits`. 비면 기본값이다. 0 은 거절한다(올리기를 끄는 값이 아니다). */
  ASSET_FILE_MAX_BYTES: assetLimitEnv('ASSET_FILE_MAX_BYTES', DEFAULT_ASSET_LIMITS.fileBytes),
  ASSET_PROJECT_MAX_BYTES: assetLimitEnv('ASSET_PROJECT_MAX_BYTES', DEFAULT_ASSET_LIMITS.projectBytes),
  ASSET_PERSONAL_MAX_BYTES: assetLimitEnv('ASSET_PERSONAL_MAX_BYTES', DEFAULT_ASSET_LIMITS.personalBytes),
  /** 그리기 칸 수 — `ApiConfig.exportRenderLimit`. 비면 기본값이다(`dbTimeLimitEnv`와 같은 까닭). 0 은 거절한다 — 그리기를 끄는 값이 아니고, 받으면 풀이 1 로 올려 읽어(`ExportWorkerPool`) 적은 값과 다른 수로 돈다. */
  EXPORT_RENDER_LIMIT: z.preprocess(
    (value) => (value === '' ? undefined : value),
    numericEnv('EXPORT_RENDER_LIMIT')
      .refine((limit) => limit >= 1, 'EXPORT_RENDER_LIMIT은 1 이상이어야 합니다')
      .default(EXPORT_RENDER_LIMIT),
  ),
  /**
   * **`docker compose` 가 여는 호스트 포트.** 이 서버가 쓰는 값이 아니라 **`DATABASE_URL`
   * 안의 포트와 맞는지 재기 위해서만** 읽는다 — 그래서 `ApiConfig` 에 안 실린다.
   * 어긋나면 서버가 남의 컨테이너에 붙는데 붙는 데는 성공한다(`db/port-agreement.ts`).
   * **없으면 아무것도 안 잰다** — 자기 Postgres 를 쓰는 사람이 깨지면 안 된다.
   */
  POSTGRES_PORT: z.string().optional(),
  /** `ApiConfig.systemThemesDir`. 비면 기본값이다. */
  SYSTEM_THEMES_DIR: z.string().optional(),
  /** `ApiConfig.themeTemplateZip`. 비면 기본값이다. */
  THEME_TEMPLATE_ZIP: z.string().optional(),
  /**
   * `db/client.ts`의 `DbTimeLimits` — 없거나 비면 `DEFAULT_DB_TIME_LIMITS`. **0 은 싣지 않는다 — 서버·DB 설정을 따른다.**
   * 범위는 `dbTimeLimitEnv`의 머리말.
   */
  DB_IDLE_IN_TRANSACTION_TIMEOUT_MS: dbTimeLimitEnv(
    'DB_IDLE_IN_TRANSACTION_TIMEOUT_MS',
    DEFAULT_DB_TIME_LIMITS.idleInTransactionMs,
    1,
    DB_TIME_LIMIT_MAX_MS,
  ),
  DB_POOL_WAIT_TIMEOUT_MS: dbTimeLimitEnv('DB_POOL_WAIT_TIMEOUT_MS', DEFAULT_DB_TIME_LIMITS.poolWaitMs, 1, DB_TIME_LIMIT_MAX_MS),
  DB_KEEPALIVE_IDLE_MS: dbTimeLimitEnv(
    'DB_KEEPALIVE_IDLE_MS',
    DEFAULT_DB_TIME_LIMITS.keepAliveIdleMs,
    DB_KEEPALIVE_IDLE_MIN_MS,
    DB_KEEPALIVE_IDLE_MAX_MS,
  ),
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
  // "잘 떴다"고 읽게 된다 — `db/port-agreement.ts` 의 머리말이 그 고장 방식을 든다.
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
    screenChromiumPath: data.SCREEN_CHROMIUM_PATH === undefined || data.SCREEN_CHROMIUM_PATH === '' ? undefined : data.SCREEN_CHROMIUM_PATH,
    dbTimeLimits: {
      idleInTransactionMs: data.DB_IDLE_IN_TRANSACTION_TIMEOUT_MS,
      poolWaitMs: data.DB_POOL_WAIT_TIMEOUT_MS,
      keepAliveIdleMs: data.DB_KEEPALIVE_IDLE_MS,
    },
    trustProxy: data.TRUST_PROXY,
    exportRenderLimit: data.EXPORT_RENDER_LIMIT,
    systemThemesDir:
      data.SYSTEM_THEMES_DIR === undefined || data.SYSTEM_THEMES_DIR === '' ? DEFAULT_SYSTEM_THEMES_DIR : data.SYSTEM_THEMES_DIR,
    themeTemplateZip:
      data.THEME_TEMPLATE_ZIP === undefined || data.THEME_TEMPLATE_ZIP === '' ? DEFAULT_THEME_TEMPLATE_ZIP : data.THEME_TEMPLATE_ZIP,
    assetLimits: {
      fileBytes: data.ASSET_FILE_MAX_BYTES,
      projectBytes: data.ASSET_PROJECT_MAX_BYTES,
      personalBytes: data.ASSET_PERSONAL_MAX_BYTES,
    },
  }
}
