/**
 * **D9의 인구조사: 바깥 세계를 만지는 자리가 몇 개인가.**
 *
 * 계획서가 *"`io`를 안 거치고 `node:fs`를 직접 부르는 자리가 남으면 그 케이스는 개발자
 * 기계에서만 통과한다"*고 적은 자리다. 케이스로 확인할 수 없는 명제이므로 — 그런 호출은
 * 진짜 홈 디렉터리를 건드리고, 건드린 케이스는 **초록으로 통과한다** — **소스를 세는 것이
 * 유일한 방법이다.**
 *
 * **분모를 손으로 적지 않는다.** `src/` 아래 전부를 재귀로 훑는다.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('../src', import.meta.url))

/**
 * **효과가 있는 것만 센다.** `node:util`의 `parseArgs`는 순수 함수라(문자열 배열을 받아
 * 객체를 낸다) `io`를 거칠 이유가 없다 — 그것까지 세면 술어가 *"node를 쓰는가"*가 되어
 * 지키려는 명제(*"바깥 세계를 만지는가"*)와 어긋난다.
 */
const EFFECTFUL = [
  /from '(node:fs|node:fs\/promises|node:os|node:path|node:readline|node:child_process|node:http|node:https|node:net)'/,
  /\bprocess\./,
  /(?<!io\.)\bfetch\(/,
]

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

function sourceFiles(dir: string = SRC, prefix = ''): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) found.push(...sourceFiles(join(dir, entry.name), relative))
    else if (entry.name.endsWith('.ts')) found.push(relative)
  }
  return found
}

function touchesWorld(relative: string): boolean {
  const source = stripComments(readFileSync(join(SRC, relative), 'utf8'))
  return EFFECTFUL.some((pattern) => pattern.test(source))
}

describe('바깥 세계를 만지는 자리 (D9)', () => {
  it('훑을 소스를 실제로 읽는다', () => {
    // 글롭이 어긋나면 **빈 집합에서 아래가 조용히 통과한다**(이 저장소가 여러 번 겪은 사고다).
    const files = sourceFiles()
    expect(files.length).toBeGreaterThan(6)
    expect(files).toContain('node-io.ts')
    expect(files).toContain('commands/pull.ts')
  })

  it('목록이 둘로 고정돼 있다 — 새 자리가 생기면 여기가 먼저 죽는다', () => {
    expect(sourceFiles().filter(touchesWorld)).toEqual([
      // 진짜 `io` 하나를 조립하는 자리. 판단이 없다.
      'bin.ts',
      // `node:*`를 부르는 자리. `bin.ts`가 이것을 부른다.
      'node-io.ts',
    ])
  })

  it('명령은 `io`만 본다 — 술어가 실제로 가르는지', () => {
    // 술어가 늘 `false`면 위 케이스가 *"아무것도 안 세고 통과"*한다. 반대편을 확인한다.
    expect(touchesWorld('commands/login.ts')).toBe(false)
    expect(touchesWorld('node-io.ts')).toBe(true)
  })

  it('심으면 잡는다 — 구분력', () => {
    const planted = "import { readFile } from 'node:fs/promises'\nexport const x = readFile"
    expect(EFFECTFUL.some((pattern) => pattern.test(planted))).toBe(true)
    // 순수한 것은 안 잡힌다 — `run.ts`가 `node:util`을 쓰고도 위 목록에 없는 근거다.
    expect(EFFECTFUL.some((pattern) => pattern.test("import { parseArgs } from 'node:util'"))).toBe(false)
  })
})
