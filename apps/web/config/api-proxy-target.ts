/**
 * 에디터가 `/api`를 어디로 보내나 — **값은 한 자리에서 온다.**
 *
 * 출처는 `apps/api/.env`의 `PORT` 하나이고 **셸 환경변수가 그것을 이긴다.** 그 순서는
 * api 서버가 쓰는 `--env-file-if-exists`와 **같아야 한다.** 두 실행자가 다른 답을 내면
 * 에디터가 옆 워크트리의 API에 붙는데 **아무도 그것을 말해 주지 않는다** — 증상은
 * 자기 계정이 401이고 옆 워크트리 계정이 200인 것이다.
 *
 * **파일을 읽는 자는 여기 없다.** `vite.config.ts`가 `node:fs`·`node:util`로 읽어
 * 넘긴다. 이 모듈이 순수해야 브라우저 tsconfig(`types: ["vite/client"]`) 안에 살면서
 * 자를 받는다 — `node:` 임포트가 하나라도 들어오면 그 프로그램이 통째로 Node 타입을
 * 요구하게 되고, 그러면 브라우저 코드가 `process`를 보게 된다.
 */

/** `apps/api/src/config.ts`의 `EnvSchema`가 정한 `PORT` 기본값과 같은 값이어야 한다. */
export const DEFAULT_API_PORT = '3001'

/**
 * 프록시 대상 호스트. **`apps/api`의 `HOST`를 따라가지 않는다.**
 * 그 값은 서버가 *바인딩*할 주소이고(기본 `127.0.0.1`), `0.0.0.0`이 흔한 값인데
 * 그것을 클라이언트 대상으로 그대로 쓰면 플랫폼마다 답이 갈린다. 프록시는 같은 기계의
 * 루프백으로만 붙는다.
 */
const PROXY_HOST = '127.0.0.1'

export interface ApiProxySources {
  /** 셸 환경변수(`process.env`). **파일을 이긴다.** */
  shellEnv?: Record<string, string | undefined>
  /** `apps/api/.env`를 파싱한 것. 파일이 없으면 빈 객체다. */
  fileEnv?: Record<string, string | undefined>
}

/** 빈 문자열은 **"안 줬다"와 같은 뜻이다** — `apps/api/src/config.ts`가 `SCREEN_CHROMIUM_PATH`에 쓰는 규칙과 같다. */
function pick(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value
}

/**
 * 프록시가 붙을 포트를 정한다. 셸 → `apps/api/.env` → 기본값(3001) 순서다.
 *
 * **값이 있는데 숫자가 아니면 던진다.** 조용히 기본값으로 물러나면 api 서버는
 * (zod가 같은 값을 거부해서) 안 뜨는데 에디터만 3001로 떠서, 이 파일이 없애려는
 * *"둘이 다른 답을 낸다"*를 정확히 다시 만든다.
 */
export function resolveApiPort(sources: ApiProxySources = {}): string {
  const fromShell = pick(sources.shellEnv?.PORT)
  const fromFile = pick(sources.fileEnv?.PORT)
  const chosen = fromShell ?? fromFile
  if (chosen === undefined) {
    return DEFAULT_API_PORT
  }
  if (!/^\d+$/.test(chosen)) {
    const where = fromShell === undefined ? 'apps/api/.env의 PORT' : '셸 환경변수 PORT'
    throw new Error(
      `${where}이 숫자가 아닙니다: ${JSON.stringify(chosen)}\n` +
        'apps/api도 같은 값을 거부하므로 에디터만 기본값으로 뜨게 두지 않는다.',
    )
  }
  return chosen
}

/** `resolveApiPort`가 정한 포트로 프록시 대상 URL을 만든다. */
export function resolveApiProxyTarget(sources: ApiProxySources = {}): string {
  return `http://${PROXY_HOST}:${resolveApiPort(sources)}`
}
