/**
 * **인구조사가 분모를 만드는 자리.** 손으로 적은 목록이 아니라 소스에서 센다.
 *
 * `broadcast-census.test.ts`가 *"`applyEdit`을 부르는 자리는 알리는가"*를 세고,
 * `lock-census.test.ts`가 같은 분모로 *"그 자리는 잠금을 보는가"*를 센다. **훑는 방식이
 * 두 벌이면 한쪽만 넓어진다** — 앞 판이 `routes`·`services`만 비재귀로 훑어 `src/ws/`의
 * 호출자를 못 봤고, 리뷰가 그것을 실증하며 범위를 `src/` 전체로 넓혔다. 그 고침이 파일
 * 하나에만 있으면 다음 census가 좁은 채로 태어난다.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 훑을 뿌리. **`src/` 전체이고 재귀한다.**
 *
 * **디렉터리 목록을 손으로 적지 않는 것이 요점이다.** 적으면 다음 디렉터리가 생길 때 그
 * 아래의 호출자가 조용히 안 보인다.
 */
export const SRC_ROOT = fileURLToPath(new URL('../src', import.meta.url))

export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
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
