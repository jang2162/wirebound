/**
 * 경로 다루기. **`node:path`를 안 쓴다** — `src/`에서 `node:*`를 부르는 자리는
 * `node-io.ts` 하나여야 하고, 여기서 필요한 것은 POSIX 문자열 조작뿐이다.
 *
 * **Windows를 다루지 않는다.** `engines`가 Node ≥ 22.9일 뿐 플랫폼을 좁히지는
 * 않지만, 재 본 것은 macOS·Linux다. 역슬래시 구분자를 다루는 판정은 Windows에서 잴
 * 근거가 설 때 한다 — 그 전에 Windows에서 돌리면 상대 경로 풀이가 조용히 틀릴 수 있다.
 */

export const SEPARATOR = '/'

export function isAbsolute(path: string): boolean {
  return path.startsWith(SEPARATOR)
}

/** `a/b` + `c` → `a/b/c`. 조각의 앞뒤 구분자를 눌러 준다. */
export function join(...parts: string[]): string {
  const joined = parts
    .filter((part) => part.length > 0)
    .map((part, index) => (index === 0 ? part.replace(/\/+$/, '') : part.replace(/^\/+|\/+$/g, '')))
    .filter((part) => part.length > 0)
    .join(SEPARATOR)
  // 첫 조각이 `/`뿐이었으면 위에서 빈 문자열이 되어 앞의 구분자가 사라진다.
  return parts[0]?.startsWith(SEPARATOR) && !joined.startsWith(SEPARATOR) ? `${SEPARATOR}${joined}` : joined
}

/** 부모 디렉터리. 뿌리(`/`)의 부모는 자기 자신이다 — 위로 올라가는 순회의 종료 조건이다. */
export function parent(path: string): string {
  const trimmed = path.replace(/\/+$/, '')
  const index = trimmed.lastIndexOf(SEPARATOR)
  if (index <= 0) return SEPARATOR
  return trimmed.slice(0, index)
}

/** 상대 경로면 `base` 기준으로 푼다. 이미 절대면 그대로. */
export function resolveFrom(base: string, path: string): string {
  return isAbsolute(path) ? path : join(base, path)
}
