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

/** `apps/api/.env` — 이 앱의 값이 사는 한 자리. */
const API_ENV_URL = new URL('../.env', import.meta.url)

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

/** `apps/api/.env`를 읽는다. **없으면 빈 객체다** — 안 만든 사람은 오늘과 같이 돈다. */
export function readApiEnvFile(): Record<string, string | undefined> {
  try {
    return parseEnv(readFileSync(API_ENV_URL, 'utf8')) as Record<string, string | undefined>
  } catch {
    return {}
  }
}
