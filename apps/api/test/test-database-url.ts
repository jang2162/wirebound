import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

/**
 * 테스트가 붙을 DB를 정한다 — **워크트리마다 다를 수 있어야 한다.**
 *
 * 왜 여기가 따로 필요한가: `pnpm test`는 **루트에서 도는 vitest**라 `apps/api`의
 * `--env-file-if-exists=.env`를 지나지 않는다. 그 플래그는 `dev`·`start`·`migrate`
 * 스크립트에만 붙어 있다. 그래서 `apps/api/.env`에 `TEST_DATABASE_URL`을 적어도
 * 오늘은 아무 일도 일어나지 않는다 — 이 모듈이 그 한 칸을 잇는다.
 *
 * **파일에서 가져오는 키는 `TEST_DATABASE_URL` 하나뿐이다.** `apps/api/.env`를 통째로
 * `process.env`에 얹으면 운영 `DATABASE_URL`이 테스트 프로세스에 들어간다. api 테스트
 * 열넷이 `projects`·`users`를 **범위 없이** 지우므로(`helpers.ts`의 `resetRealData`)
 * 그때 무엇이 지워지는지는 적을 필요도 없다.
 *
 * 순서는 `--env-file-if-exists`와 같다: **셸이 파일을 이긴다.**
 * (같은 규칙을 에디터 쪽에서 재는 자는 `apps/web/config/api-proxy-target.ts`다.
 * 두 앱이 서로를 import할 수 없어 규칙은 두 자리에 있고, **그 순서가 같다는 것**을
 * 양쪽 케이스가 각각 잰다.)
 */
export const DEFAULT_TEST_DATABASE_URL = 'postgres://wirebound:wirebound@127.0.0.1:5433/wirebound_test'

/**
 * `apps/api/.env` — 이 앱의 값이 사는 한 자리.
 *
 * **내보내는 이유는 자를 대기 위해서다.** 이 상대 경로가 틀어지면 파일이 안 읽히고
 * 스위트가 **말없이 공용 `wirebound_test`로 돌아간다** — 이 슬라이스가 없애려던
 * *"공유 자원으로 조용히 떨어지는 것"* 그 자체다. 그런데 **파일이 없는 것 자체는
 * 정상이므로**(D6 — `.env`를 안 만든 사람이 깨지면 안 된다) 런타임에서 시끄럽게 할 수는
 * 없다. 가를 수 있는 것은 **가리키는 자리**다: 파일은 없어도 되지만 **디렉터리는
 * `apps/api` 여야 한다.** `test-database-url.test.ts`가 그것을 잰다.
 */
export const API_ENV_URL = new URL('../.env', import.meta.url)

export interface TestDatabaseUrlSources {
  /** 셸 환경변수. **파일을 이긴다.** */
  shellEnv?: Record<string, string | undefined>
  /** `apps/api/.env`를 파싱한 것. 파일이 없으면 빈 객체다. */
  fileEnv?: Record<string, string | undefined>
}

/** 빈 문자열은 "안 줬다"와 같은 뜻이다. */
function pick(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value
}

export function resolveTestDatabaseUrl(sources: TestDatabaseUrlSources = {}): string {
  return (
    pick(sources.shellEnv?.TEST_DATABASE_URL) ??
    pick(sources.fileEnv?.TEST_DATABASE_URL) ??
    DEFAULT_TEST_DATABASE_URL
  )
}

/**
 * `apps/api/.env`를 읽는다. **없으면 빈 객체다** — 안 만든 사람은 오늘과 같이 돈다.
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
 * **읽기와 순서를 합친 자리.** `helpers.ts`가 부르는 것이 이것 하나다.
 *
 * 왜 따로 있나: 앞 판은 `helpers.ts`가 `resolveTestDatabaseUrl({shellEnv, fileEnv: readApiEnvFile()})`를
 * **직접 조립**했고, 그 조립 한 줄에는 자가 없었다. 리뷰가 그 자리에 변이를 심어
 * (`fileEnv` 인자 제거) **게이트 넷이 전부 초록인 채로** 스위트가 조용히
 * `wirebound_test`를 먹게 만들었다 — 이 슬라이스가 산 *"워크트리마다 테스트 DB가
 * 갈린다"*가 통째로 사라지는데 아무도 안 죽었다(귀속: 리뷰 §9 R4).
 *
 * **그래서 조립을 함수로 내렸다.** 이제 그 변이는 이 함수 안에서만 표현되고
 * `test-database-url.test.ts`의 임시 파일 케이스가 그것을 문다. `helpers.ts`에 남은
 * 한 줄은 인구조사가 못박는다.
 */
export function resolveTestDatabaseUrlFrom(
  shellEnv: Record<string, string | undefined>,
  envFileUrl: URL | string = API_ENV_URL,
): string {
  return resolveTestDatabaseUrl({ shellEnv, fileEnv: readApiEnvFile(envFileUrl) })
}
