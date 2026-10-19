import { describeDatabaseTarget } from './describe-target'

/**
 * **포트가 두 자리에 있고, 어긋나면 조용하다** — 이 파일이 그것을 시끄럽게 만든다.
 *
 * 워크트리마다 자기 Postgres 컨테이너를 띄우므로 호스트 포트가 **두 곳**에 산다:
 * `docker compose` 가 여는 포트(`POSTGRES_PORT`)와 접속 문자열 안에 박힌 포트다.
 * **두 자리가 서로를 읽을 수는 없다** — Node 의 `--env-file` 도 `util.parseEnv`
 * 도 `${...}` 를 펴지 않으므로 `DATABASE_URL` 안에서 `POSTGRES_PORT`
 * 를 참조할 수 없고, compose 는 URL 에서 포트를 뽑아낼 수 없다.
 *
 * **한 자리를 *없애는* 길은 있다 — 고르지 않았을 뿐이다**.
 * `.env` 가 포트와 DB 이름만 들고 `DATABASE_URL` 을 이 패키지가 조립하면 어긋날 자리가
 * 애초에 안 생긴다. 안 고른 이유는 **`DATABASE_URL` 을 직접 적는 사람**(자기 Postgres·원격
 * DB)에게는 이 검사가 여전히 필요하고, 그 키를 필수에서 선택으로 바꾸는 것이 기존 사용자의
 * 계약을 건드리기 때문이다.
 *
 * **어긋나면 연결이 실패하는 것이 아니라 성공한다.** 그 포트는 대개 비어 있지 않고
 * *옆 워크트리의 컨테이너*가 잡고 있다 — 에디터의 프록시가 옆 워크트리 API 에 붙어도 아무도
 * 안 우는 것과 같은 부류이고, 여기서는 DB 다.
 *
 * 그래서 **값이 있으면 서버가 아예 안 뜬다.** 조용히 물러나면 남의 DB 를 열어 놓고
 * "잘 떴다"고 읽게 된다.
 */

/**
 * 개발 compose(`docker/dev/compose.yaml`)의 `${POSTGRES_PORT:-5433}` 이 쓰는 기본값.
 *
 * **`.env.example` 의 접속 문자열도 이 수를 든다** — 아무것도 안 바꾼 사람의 서버가 그대로
 * 도는 것은 그 둘이 같기 때문이다. 셋 중 하나가 움직이면 `port-agreement.test.ts`
 * 의 인구조사가 죽는다.
 */
export const COMPOSE_DEFAULT_POSTGRES_PORT = '5433'

/** 접속 문자열에 포트가 없을 때 Postgres 가 쓰는 포트. */
const POSTGRES_IMPLICIT_PORT = '5432'

/**
 * **이 기계의 루프백일 때만 잰다.** `POSTGRES_PORT` 는 compose 가 *이 기계에* 여는
 * 포트라, 접속 문자열이 다른 호스트를 가리키면 둘 사이에 아무 관계가 없다.
 */
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', '0.0.0.0'])

export interface PortAgreementSources {
  /** `apps/api/.env` 의 `POSTGRES_PORT`. **없으면 아무것도 재지 않는다.** */
  postgresPort?: string | undefined
  /** 이름 → 접속 문자열. `undefined` 인 것은 안 잰다. */
  urls: Record<string, string | undefined>
}

/** 빈 문자열은 **"안 줬다"와 같은 뜻이다** — 이 저장소가 `PORT`·`SCREEN_CHROMIUM_PATH` 에 쓰는 규칙과 같다. */
function pick(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value
}

/**
 * 접속 문자열이 실제로 붙을 포트. **해석할 수 없거나 다른 호스트면 `undefined`** —
 * 그때는 잴 것이 없다. 테스트 DB 가 최상위 컨테이너를 가리키는지 보는 자리(`test/test-database-url.ts`)도 이것을 쓴다.
 */
export function loopbackPortOf(databaseUrl: string): string | undefined {
  let url: URL
  try {
    url = new URL(databaseUrl)
  } catch {
    // 해석 못 하는 값은 `config.ts` 의 zod 와 `describeDatabaseTarget` 이 맡는다.
    return undefined
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    return undefined
  }
  return url.port === '' ? POSTGRES_IMPLICIT_PORT : url.port
}

/**
 * 어긋난 자리가 있으면 **사람이 고칠 수 있는 문장**을, 없으면 `undefined` 를 낸다.
 *
 * **나가는 값에 자격 문자열이 없다** — `describeDatabaseTarget` 을 지나 `호스트:포트/이름`
 * 만 싣는다(이 규칙을 `missing-database-hint.ts` 한 곳만 지키면 여기서 원문을 싣는 변조를
 * 아무 케이스도 못 잡는다).
 */
export function portAgreementError(sources: PortAgreementSources): string | undefined {
  const postgresPort = pick(sources.postgresPort)
  if (postgresPort === undefined) {
    return undefined
  }
  if (!/^\d+$/.test(postgresPort)) {
    return [
      `POSTGRES_PORT 가 숫자가 아닙니다: ${JSON.stringify(postgresPort)}`,
      'docker compose 도 같은 값을 거부하므로 서버만 뜨게 두지 않는다.',
    ].join('\n')
  }

  const mismatched = Object.entries(sources.urls)
    .map(([name, url]) => ({ name, url: pick(url) }))
    .filter((entry): entry is { name: string; url: string } => entry.url !== undefined)
    .map((entry) => ({ ...entry, port: loopbackPortOf(entry.url) }))
    .filter((entry) => entry.port !== undefined && entry.port !== postgresPort)

  if (mismatched.length === 0) {
    return undefined
  }

  return [
    'POSTGRES_PORT 와 접속 문자열의 포트가 어긋납니다 — 이대로 두면 이 워크트리의 컨테이너가',
    '아니라 옆 워크트리의 컨테이너에 붙습니다(붙는 데 성공하므로 아무 에러도 안 납니다).',
    `  POSTGRES_PORT=${postgresPort}  ← docker compose 가 이 포트를 연다`,
    ...mismatched.map((entry) => `  ${entry.name} → ${describeDatabaseTarget(entry.url)}`),
    'apps/api/.env 에서 포트를 한 수로 맞춘다. 자기 Postgres 를 쓰면 POSTGRES_PORT 줄을 지운다.',
  ].join('\n')
}
