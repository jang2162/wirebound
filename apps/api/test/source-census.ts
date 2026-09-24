/**
 * **인구조사가 분모를 만드는 자리.** 손으로 적은 목록이 아니라 소스에서 센다.
 *
 * `broadcast-census.test.ts`가 *"`applyEdit`을 부르는 자리는 알리는가"*를 세고,
 * `lock-census.test.ts`가 같은 분모로 *"그 자리는 잠금을 보는가"*를 센다. **훑는 방식이
 * 두 벌이면 한쪽만 넓어진다** — `routes`·`services`만 비재귀로 훑으면 `src/ws/`의
 * 호출자를 조용히 못 본다. 범위를 넓히는 고침이 파일 하나에만 있으면 다음 census가 좁은
 * 채로 태어난다.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stripComments } from '@wirebound/test-support'

/**
 * 훑을 뿌리. **`src/` 전체이고 재귀한다.**
 *
 * **디렉터리 목록을 손으로 적지 않는 것이 요점이다.** 적으면 다음 디렉터리가 생길 때 그
 * 아래의 호출자가 조용히 안 보인다.
 */
export const SRC_ROOT = fileURLToPath(new URL('../src', import.meta.url))

/** 주석을 걷는 자리는 워크스페이스에 하나다 — 이 파일을 지나는 자들이 그것을 쓰게 여기서 내준다. */
export { stripComments }

/**
 * YAML 의 주석(`#`)을 걷는다. **`docker-compose.yml` 을 재는 자가 쓴다.**
 *
 * 왜 필요한가: 인구조사가 주석을 안 걷으면 **옳은 줄을 주석에 남기고 아래에서 뒤집는
 * 우회**가 통째로 지나간다. compose 파일은 주석이 길어서 그 함정이 더 크다.
 *
 * **작은따옴표 안의 `#` 은 안 걷는다.** compose 의 포트 줄이 따옴표로 싸여 있고
 * (`- '${POSTGRES_PORT:-5433}:5432'`) 값 안에 `#` 이 들어올 수 있다.
 */
export function stripYamlComments(source: string): string {
  return source
    .split('\n')
    .map((line) => {
      let quoted = false
      for (let index = 0; index < line.length; index += 1) {
        const character = line[index]
        if (character === "'" || character === '"') {
          quoted = !quoted
        } else if (character === '#' && !quoted) {
          return line.slice(0, index)
        }
      }
      return line
    })
    .join('\n')
}

/** `SRC_ROOT` 아래의 `.ts` 전부를 뿌리 기준 상대 경로로 낸다. */
export function sourceFiles(dir: string = SRC_ROOT, prefix = ''): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) {
      found.push(...sourceFiles(join(dir, entry.name), relative))
    } else if (entry.name.endsWith('.ts')) {
      found.push(relative)
    }
  }
  return found
}

/**
 * 소스에 있는 그 함수의 **호출** 자리를 파일별로 센다.
 *
 * 선언(`function 이름(`)을 먼저 지운 뒤에 센다 — `await 이름(`만 찾으면 `void 이름(…)`이나
 * `return 이름(…)`으로 부르는 새 호출자를 **조용히 놓친다.**
 */
export function callSitesByFile(name: string): Map<string, number> {
  const declaration = new RegExp(`function\\s+${name}\\(`, 'g')
  const call = new RegExp(`\\b${name}\\(`, 'g')
  const found = new Map<string, number>()
  for (const relative of sourceFiles()) {
    const source = stripComments(readFileSync(join(SRC_ROOT, relative), 'utf8')).replace(declaration, '')
    const count = [...source.matchAll(call)].length
    if (count > 0) {
      found.set(relative, count)
    }
  }
  return found
}
