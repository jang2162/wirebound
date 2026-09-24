import { existsSync, lstatSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import { describeDatabaseTarget } from '../src/db/describe-target'
import { COMPOSE_DEFAULT_POSTGRES_PORT, loopbackPortOf, portAgreementError } from '../src/db/port-agreement'

/**
 * 테스트가 붙을 DB를 정한다 — **워크트리마다 다를 수 있어야 한다.**
 *
 * 왜 여기가 따로 필요한가: `pnpm test`는 **루트에서 도는 vitest**라 `apps/api`의
 * `--env-file-if-exists=.env`를 지나지 않는다. 그 플래그는 `dev`·`start`·`migrate`
 * 스크립트에만 붙어 있다. 그래서 `apps/api/.env`에 `TEST_DATABASE_URL`을 적어도
 * 그것만으로는 아무 일도 일어나지 않는다 — 이 모듈이 그 한 칸을 잇는다.
 *
 * **파일에서 가져오는 키는 둘뿐이다** — `TEST_DATABASE_URL` 과 `POSTGRES_PORT` 다.
 * `apps/api/.env`를 통째로 `process.env`에 얹으면 운영 `DATABASE_URL`이 테스트 프로세스에
 * 들어간다. api 테스트 열넷이 `projects`·`users`를 **범위 없이** 지우므로
 * (`helpers.ts`의 `resetRealData`) 그때 무엇이 지워지는지는 적을 필요도 없다.
 * **`POSTGRES_PORT` 를 더한 것은 그 반대 방향이다** — 그 값은 자격이 아니라 *어느
 * 컨테이너인가*이고, 안 보면 기본값이 남의 컨테이너를 가리킨다(아래 `defaultTestDatabaseUrl`).
 *
 * 순서는 `--env-file-if-exists`와 같다: **셸이 파일을 이긴다.**
 * (같은 규칙을 에디터 쪽에서 재는 자는 `apps/web/config/api-proxy-target.ts`다.
 * 두 앱이 서로를 import할 수 없어 규칙은 두 자리에 있고, **그 순서가 같다는 것**을
 * 양쪽 케이스가 각각 잰다.)
 */
export const DEFAULT_TEST_DATABASE_URL = defaultTestDatabaseUrl()

/**
 * 아무것도 안 적었을 때 붙을 곳. **포트가 `POSTGRES_PORT` 를 따라간다.**
 *
 * 워크트리마다 컨테이너를 띄우므로 기본값이 포트를 박으면 위험하다 — 기본값이 5433 을
 * 박고 있으면, 자기 컨테이너를 5443 에 띄운 사람이 `TEST_DATABASE_URL` 을 안 적을 때
 * 스위트가 **5433**, 즉 **남의 컨테이너**의 `wirebound_test` 를 지우며 돈다. 그 자리를 값
 * 하나로 없앤다 —
 * 안 적은 사람은 **자기 컨테이너의** `wirebound_test` 를 본다(볼륨을 처음 만들 때
 * `docker/postgres-init/01-test-db.sql` 이 만들어 둔다).
 *
 * **적은 사람의 어긋남은 `portAgreementError` 가 잡는다** — 기본값은 어긋날 수가 없다.
 */
export function defaultTestDatabaseUrl(postgresPort: string = COMPOSE_DEFAULT_POSTGRES_PORT): string {
  return `postgres://wirebound:wirebound@127.0.0.1:${postgresPort}/wirebound_test`
}

/**
 * `apps/api/.env` — 이 앱의 값이 사는 한 자리.
 *
 * **내보내는 이유는 자를 대기 위해서다.** 이 상대 경로가 틀어지면 파일이 안 읽히고
 * 스위트가 **말없이 공용 `wirebound_test`로 돌아간다** — 이 모듈이 막으려는
 * *"공유 자원으로 조용히 떨어지는 것"* 그 자체다. **최상위 체크아웃에서는 파일이 없는 것이
 * 정상이므로**(`.env`를 안 만든 사람이 깨지면 안 된다) 거기서는 시끄럽게 할 수 없다 — 가를 수
 * 있는 것은 **가리키는 자리**다: 파일은 없어도 되지만 **디렉터리는 `apps/api` 여야 한다.**
 * `test-database-url.test.ts`가 그것을 잰다. **워크트리에서는 없는 것이 사고다** — 아래
 * `worktreeEnvError`.
 */
export const API_ENV_URL = new URL('../.env', import.meta.url)

export interface TestDatabaseUrlSources {
  /** 셸 환경변수. **파일을 이긴다.** */
  shellEnv?: Record<string, string | undefined>
  /** `apps/api/.env`를 파싱한 것. 파일이 없으면 빈 객체다. */
  fileEnv?: Record<string, string | undefined>
}

/** `POSTGRES_PORT` 도 셸이 파일을 이긴다 — 같은 순서를 두 값이 함께 쓴다. */
export function resolvePostgresPort(sources: TestDatabaseUrlSources = {}): string | undefined {
  return pick(sources.shellEnv?.POSTGRES_PORT) ?? pick(sources.fileEnv?.POSTGRES_PORT)
}

/** 빈 문자열은 "안 줬다"와 같은 뜻이다. */
function pick(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value
}

export function resolveTestDatabaseUrl(sources: TestDatabaseUrlSources = {}): string {
  return (
    pick(sources.shellEnv?.TEST_DATABASE_URL) ??
    pick(sources.fileEnv?.TEST_DATABASE_URL) ??
    defaultTestDatabaseUrl(resolvePostgresPort(sources))
  )
}

/**
 * `apps/api/.env`를 읽는다. **없으면 빈 객체다** — 안 만든 사람은 기본값으로 돈다.
 *
 * **경로를 인자로 받는다.** 기본값이 진짜 자리이고, 케이스는 임시 파일을 준다 —
 * 그래야 *"읽어서 순서대로 고른다"*는 **합쳐진 동작**에 자를 댈 수 있다.
 */
export function readApiEnvFile(envFileUrl: URL | string = API_ENV_URL): Record<string, string | undefined> {
  try {
    return parseEnv(readFileSync(envFileUrl, 'utf8')) as Record<string, string | undefined>
  } catch {
    return {}
  }
}

/**
 * `dir` 에서 위로 올라가며 처음 만나는 `.git` 이 **파일**이면 git 워크트리다.
 *
 * `git worktree add` 가 만든 체크아웃의 뿌리에는 `gitdir: …` 한 줄짜리 `.git` **파일**이 서고, 최상위 체크아웃 ·
 * CI 의 클론에는 `.git` **디렉터리**가 선다. 워크트리를 어디에 만들었는지(`.worktrees/` · `.claude/worktrees/` ·
 * 형제 디렉터리 · 대소문자)는 가르지 않는다 — 경로 조각으로 가르면 그 밖에서 만든 워크트리가 최상위로 읽힌다.
 * git 서브모듈의 뿌리도 `.git` 파일이라 워크트리로 읽힌다(멈추는 쪽이다 — 셸의 `TEST_DATABASE_URL` 이 지나가게 한다).
 * `.git` 을 못 찾으면(압축본으로 푼 소스) 워크트리가 아니다.
 */
export function isInsideGitWorktree(dir: string): boolean {
  for (let current = dir; ; current = dirname(current)) {
    try {
      return lstatSync(join(current, '.git')).isFile()
    } catch {
      // 이 자리에는 `.git` 이 없다 — 한 칸 올라간다.
    }
    if (dirname(current) === current) return false
  }
}

/**
 * **워크트리 안인데 테스트가 최상위 체크아웃의 컨테이너로 떨어지면 무엇을 하라고 말한다.** 문제가 없으면 `undefined`.
 *
 * 왜 멈추나: 워크트리는 저마다 자기 컨테이너를 띄우는데(README 「워크트리를 여럿 띄울 때」) 그 포트는 `.env` 의
 * `POSTGRES_PORT` 에만 있다. compose 기본 포트(`COMPOSE_DEFAULT_POSTGRES_PORT`)에 떠 있는 것은 **최상위 체크아웃의
 * 컨테이너**다 — 스위트가 그 `wirebound_test` 를 지우며 돈다(`resetRealData`). 붙는 데 성공하므로 아무 에러도 안 난다.
 * 그렇게 떨어지는 길이 둘이다.
 *
 * - **`apps/api/.env` 가 없다** — 기본값이 compose 기본 포트를 가리킨다.
 * - **있는데 테스트 DB 가 compose 기본 포트다** — 최상위 `.env` 를 값을 안 바꾸고 복사한 판(`POSTGRES_PORT=5433` ·
 *   `POSTGRES_PORT` 도 `TEST_DATABASE_URL` 도 없음 · 5433 을 적은 URL). 포트만 보고 DB 이름은 안 본다 — 그 컨테이너를
 *   일부러 함께 쓰는 사람은 셸로 준다(아래).
 *
 * - **워크트리인가**는 `isInsideGitWorktree` 가 본다. 그 밖의 체크아웃(최상위 · CI)은 이 검사를 안 지난다.
 * - **셸이 `TEST_DATABASE_URL` 을 주면 지나간다** — 붙을 곳을 사람이 골랐다(CI 가 이 길이다).
 */
export function worktreeEnvError(envFilePath: string, shellEnv: Record<string, string | undefined>): string | undefined {
  if (pick(shellEnv.TEST_DATABASE_URL) !== undefined) return undefined
  if (!isInsideGitWorktree(dirname(envFilePath))) return undefined
  const escape = [
    'README.md 「워크트리를 여럿 띄울 때」 절대로 이 워크트리의 컨테이너를 띄우고 apps/api/.env 에 그 값(POSTGRES_PORT · TEST_DATABASE_URL · …)을 적는다.',
    "DB 가 필요 없으면 api 프로젝트를 빼고 돌린다: pnpm test --project '!api'",
  ]
  if (!existsSync(envFilePath)) {
    return [
      '이 워크트리에 apps/api/.env 가 없습니다 — 이대로 돌면 테스트가 compose 기본 포트' +
        `(${COMPOSE_DEFAULT_POSTGRES_PORT})의 컨테이너, 곧 최상위 체크아웃의 wirebound_test 를 지웁니다.`,
      `  찾은 자리: ${envFilePath}`,
      ...escape,
    ].join('\n')
  }
  const testDatabaseUrl = resolveTestDatabaseUrl({ shellEnv, fileEnv: readApiEnvFile(envFilePath) })
  if (loopbackPortOf(testDatabaseUrl) !== COMPOSE_DEFAULT_POSTGRES_PORT) return undefined
  return [
    `이 워크트리의 테스트 DB 가 compose 기본 포트(${COMPOSE_DEFAULT_POSTGRES_PORT})를 가리킵니다 — 최상위 체크아웃의 컨테이너라,` +
      ' 이대로 돌면 그 판을 지웁니다. 최상위의 apps/api/.env 를 값을 안 바꾸고 복사한 판이 이렇다.',
    `  찾은 자리: ${envFilePath}`,
    `  TEST_DATABASE_URL → ${describeDatabaseTarget(testDatabaseUrl)}`,
    ...escape,
    '그 컨테이너를 일부러 함께 쓰면 셸로 준다: TEST_DATABASE_URL=… pnpm test',
  ].join('\n')
}

/**
 * **읽기와 순서를 합친 자리.** `helpers.ts`가 부르는 것이 이것 하나다.
 *
 * 왜 따로 있나: `helpers.ts`가 `resolveTestDatabaseUrl({shellEnv, fileEnv: readApiEnvFile()})`를
 * **직접 조립**하면 그 조립 한 줄에는 자가 없다. 그 자리에서 `fileEnv` 인자를 빼도
 * **게이트 넷이 전부 초록인 채로** 스위트가 조용히 `wirebound_test`를 먹는다 —
 * *"워크트리마다 테스트 DB가 갈린다"*가 통째로 사라지는데 아무도 안 죽는다.
 *
 * **그래서 조립이 함수에 있다.** 그 변이는 이 함수 안에서만 표현되고
 * `test-database-url.test.ts`의 임시 파일 케이스가 그것을 문다. `helpers.ts`에 남은
 * 한 줄은 인구조사가 못박는다.
 */
export function resolveTestDatabaseUrlFrom(
  shellEnv: Record<string, string | undefined>,
  envFileUrl: URL | string = API_ENV_URL,
): string {
  const sources: TestDatabaseUrlSources = { shellEnv, fileEnv: readApiEnvFile(envFileUrl) }
  const testDatabaseUrl = resolveTestDatabaseUrl(sources)
  // **여기서 멈추는 것이 요점이다.** 어긋난 채로 돌면 스위트가 *남의 컨테이너*의 판을
  // 지운다 — `helpers.ts` 의 `resetRealData` 가 `projects`·`users` 를 범위 없이 지운다.
  // 서버 쪽의 같은 검사는 `src/config.ts` 가 `DATABASE_URL` 에 건다. 포트가 어긋난 판은 이 문장이 먼저 말한다 —
  // 워크트리 검사는 그다음이다(어긋난 값이 5433 이어도 «어긋났다»가 고칠 자리를 더 좁게 가리킨다).
  const disagreement = portAgreementError({
    postgresPort: resolvePostgresPort(sources),
    urls: { TEST_DATABASE_URL: testDatabaseUrl },
  })
  if (disagreement !== undefined) {
    throw new Error(disagreement)
  }
  const worktreeError = worktreeEnvError(typeof envFileUrl === 'string' ? envFileUrl : fileURLToPath(envFileUrl), shellEnv)
  if (worktreeError !== undefined) {
    throw new Error(worktreeError)
  }
  return testDatabaseUrl
}
