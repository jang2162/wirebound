/**
 * **바깥 세계를 만지는 자리가 몇 개인가 — `packages/mcp` 쪽.**
 *
 * ---
 *
 * # 왜 여기 또 있나 — 저쪽 자의 분모가 `packages/cli`만 본다
 *
 * `packages/cli/test/io-boundary.test.ts`의 `SRC`가 `new URL('../src', …)`다. **그 하나뿐이다.**
 * 그러므로 이 패키지가 `node:fs`를 직접 불러도 그 자는 **아무것도 안 죽는다.**
 *
 * **술어와 형태 목록을 저쪽에서 그대로 가져온다.** 두 벌이 되지만 **분모가 다르다** —
 * 같은 파일이 두 뿌리를 훑게 만들면 한쪽 패키지의 케이스가 남의 소스를 읽게 된다.
 *
 * # 왜 이 패키지가 그 규칙을 물려받나
 *
 * 도구가 `node:fs`를 직접 부르면 케이스가 **진짜 홈 디렉터리와 진짜 서버**를 건드린다.
 * `packages/cli`가 `io.ts`로 막은 것과 정확히 같은 사고이고, MCP 쪽이 더 나쁘다 — 도구를
 * 부르는 것이 사람이 아니라 에이전트다.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { stripComments } from '@wirebound/test-support'

const SRC = fileURLToPath(new URL('../src', import.meta.url))

/**
 * **술어를 보정하는 표본 하나.** 이 패키지의 소스는 전부 `false`라(아래) 술어가 늘 `false`인
 * 판과 구별되지 않는다 — `packages/cli/src/node-io.ts`는 **정의상 `true`**여야 하는 파일이므로
 * 그것을 반대편 표본으로 쓴다. **분모가 아니라 보정이다** — 훑는 것은 `SRC` 하나다.
 */
const CLI_SRC = fileURLToPath(new URL('../../cli/src', import.meta.url))

/**
 * **효과가 있는 것만 센다.** `node:util`처럼 순수한 것은 안 센다(술어가 *"바깥 세계를 만지는가"*다).
 *
 * **`console.`이 `EFFECTFUL`에 있다.** 없으면 `console.log`를 `packages/mcp/src`에 심어도
 * `pnpm test`는 초록이고 `test:build`만 잡는다 — **stdout을 더럽히는 가장 흔한 한 줄이
 * `pnpm test`에서 안 보인다.** MCP에서 표준출력은 프로토콜 그 자체이므로 그 자리를
 * `pnpm test`로 당긴다.
 *
 * 술어가 모양 하나(모듈 지정자)만 전제하면 우회가 실재한다 — 그래서 `EFFECTFUL`이 전역을
 * 직접 만지는 형태를 따로 든다.
 */
const EFFECTFUL_MODULES = [
  'fs/promises',
  'fs',
  'os',
  'path',
  'readline',
  'readline/promises',
  'child_process',
  'http',
  'https',
  'http2',
  'net',
  'dns',
  'dns/promises',
  'tls',
  'dgram',
  'worker_threads',
  'cluster',
  'inspector',
  // `createRequire`가 여기서 온다 — 그것으로 위의 무엇이든 우회해 부를 수 있다.
  'module',
]

/** **모듈 지정자 자리만 본다.** 따옴표 두 종 · `node:` 접두 유무 · 부수효과 import · 동적 import. */
const EFFECTFUL_SPECIFIER = new RegExp(
  `(?:^|[^\\w$])(?:from|import|require)\\s*\\(?\\s*['"](?:node:)?(?:${EFFECTFUL_MODULES.join('|')})['"]`,
)

const EFFECTFUL = [EFFECTFUL_SPECIFIER, /\bprocess\s*\./, /(?<!\bio\s*\.\s*)\bfetch\s*\(/, /\bconsole\s*\./]

function sourceFiles(dir: string = SRC, prefix = ''): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) found.push(...sourceFiles(join(dir, entry.name), relative))
    else if (entry.name.endsWith('.ts')) found.push(relative)
  }
  return found
}

function touchesWorld(relative: string, root: string = SRC): boolean {
  const source = stripComments(readFileSync(join(root, relative), 'utf8'))
  return EFFECTFUL.some((pattern) => pattern.test(source))
}

describe('바깥 세계를 만지는 자리 — packages/mcp', () => {
  it('훑을 소스를 실제로 읽는다', () => {
    // 글롭이 어긋나면 **빈 집합에서 아래가 조용히 통과한다.**
    const files = sourceFiles()
    expect(files.length).toBeGreaterThan(3)
    expect(files).toContain('bin.ts')
    expect(files).toContain('server.ts')
    expect(files).toContain('tools.ts')
  })

  /**
   * **목록이 비어 있다.** `bin.ts`조차 `node:*`를 직접 안 부른다 — `createNodeIo`가 그것을
   * 이미 감싸고 있고(`packages/cli`의 `io.ts`), 전송은 SDK가 표준입출력을 만진다. 그러므로 이
   * 패키지에는 *"바깥 세계를 만지는 허용 목록"*이 아예 없다.
   *
   * **비어 있는 기대값이 조용히 통과하지 않는다** — 위 케이스가 훑은 파일 수를 먼저 재고,
   * 아래 케이스가 술어를 반대편 표본으로 보정한다.
   */
  it('목록이 비어 있다 — 새 자리가 생기면 여기가 먼저 죽는다', () => {
    expect(sourceFiles().filter((file) => touchesWorld(file))).toEqual([])
  })

  it('술어가 실제로 가른다 — 반대편 표본으로 보정한다', () => {
    // 술어가 늘 `false`면 위 케이스가 *"아무것도 안 세고 통과"*한다.
    expect(touchesWorld('node-io.ts', CLI_SRC)).toBe(true)
    expect(touchesWorld('server.ts')).toBe(false)
  })

  /** **자를 케이스 안에서 재 둔다.** 정규식이 조용히 좁아지면 위가 아무것도 안 잡고 통과한다. */
  it('우회 형태를 전부 잡는다 — 이 정규식의 구분력', () => {
    const caught = [
      "import { readFile } from 'node:fs/promises'",
      "import { readFile } from 'fs/promises'",
      'import { readFile } from "node:fs/promises"',
      "import 'node:fs'",
      'import "child_process"',
      "const fs = await import('node:fs')",
      "require('os')",
      "import { createRequire } from 'node:module'",
    ]
    for (const line of caught) {
      expect(line, line).toMatch(EFFECTFUL_SPECIFIER)
    }
  })

  /**
   * 지정자 밖의 셋. **`io.fetch`는 안 잡는다** — 그것이 이 규칙이 허용하는 길이다.
   *
   * **`console.`이 여기 있다.** MCP에서 표준출력은 프로토콜 그 자체라 `console.log` 한 줄이
   * 프레임을 깬다 — `EFFECTFUL_MODULES`의 머리말.
   */
  it('전역을 직접 만지는 형태도 잡는다', () => {
    const caught = [
      'process.cwd()',
      'process.env.HOME',
      'await fetch(url)',
      'console.log("ready")',
      'console.error(error)',
      '  console.warn(`${name} 이 없다`)',
    ]
    for (const line of caught) {
      expect(EFFECTFUL.some((pattern) => pattern.test(line)), line).toBe(true)
    }
    // **반대편.** 그물이 넓어지면 이름이 겹치는 것까지 잡는다.
    for (const line of ['await io.fetch(url, init)', 'const processed = 1', 'const consoleWidth = 80']) {
      expect(EFFECTFUL.some((pattern) => pattern.test(line)), line).toBe(false)
    }
  })

  /** **반대편.** 그물이 넓어지면 순수한 것까지 잡아 술어가 *"node를 쓰는가"*로 바뀐다. */
  it('순수한 것과 이 패키지의 모듈은 안 잡는다 — 반대편', () => {
    const ignored = [
      "import { parseArgs } from 'node:util'",
      'import { parseArgs } from "util"',
      "import { createServer } from './server'",
      "import { Server } from '@modelcontextprotocol/sdk/server/index.js'",
      "// `node:fs`를 부르는 자리는 하나여야 한다",
      "/** `node:path`를 안 쓴다 */",
    ]
    for (const line of ignored) {
      expect(line, line).not.toMatch(EFFECTFUL_SPECIFIER)
    }
  })
})
