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
 *
 * **`node:` 접두사는 선택이다.** `'fs/promises'`와 `'node:fs/promises'`는 같은 것을 준다.
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

/**
 * **모듈 지정자 자리만 본다** — 인용부호에 감싸인 채 `from`·`import`·`require` 뒤에 오는 것.
 *
 * **앞 판은 `/from '(node:fs|…)'/`였고 형태 둘이 그대로 빠져나갔다**(리뷰 N4 — 리뷰어가
 * 변이로 쟀다: `'fs/promises'`(접두사 없음)와 `"node:fs/promises"`(큰따옴표)가 각각
 * **71건 중 0건**을 죽였다). **이 저장소에는 린터도 포매터도 없으므로**(리뷰어가
 * `eslint`·`biome`·`oxlint`·`prettier` 설정이 하나도 없는 것을 확인했다) 홑따옴표와
 * `node:` 접두사를 강제하는 것이 아무것도 없다 — 그 전제 위에 선 자는 서 있는 것이 아니다.
 *
 * **P9-1이 정확히 같은 부류로 당했고 같은 방식으로 닫았다**(`packages/schema/test/boundary.test.ts`
 * 의 `FORBIDDEN_SPECIFIER` — 그쪽은 쌍따옴표·부수효과 import·동적 import 셋이 빠져나갔고
 * 그중 부수효과 import는 `pnpm typecheck`도 통과했다). 그 모양을 그대로 가져온다.
 *
 * 이름을 그냥 언급하는 **주석은 잡지 않는다** — `paths.ts`가 *"`node:path`를 안 쓴다"*라고
 * 적기 때문이다. 아래 `stripComments`가 먼저 걷고, 그래도 남는 문자열 언급은 지정자
 * 자리가 아니라 안 걸린다.
 */
const EFFECTFUL_SPECIFIER = new RegExp(
  `(?:^|[^\\w$])(?:from|import|require)\\s*\\(?\\s*['"](?:node:)?(?:${EFFECTFUL_MODULES.join('|')})['"]`,
)

const EFFECTFUL = [
  EFFECTFUL_SPECIFIER,
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

  /**
   * **자를 케이스 안에서 재 둔다**(전역 제약: 자를 구현 파일에 두지 마라). 정규식이 조용히
   * 좁아지면 위 케이스가 아무것도 안 잡는 채로 통과하므로 형태를 직접 먹여 본다.
   *
   * **아래 여덟 줄 중 둘은 리뷰어가 실제로 소스에 심어 0 사망을 얻은 것이다**(N4).
   */
  it('우회 형태를 전부 잡는다 — 이 정규식의 구분력', () => {
    const caught = [
      "import { readFile } from 'node:fs/promises'",
      // 리뷰어가 심어 0 사망을 얻은 둘.
      "import { readFile } from 'fs/promises'",
      'import { readFile } from "node:fs/promises"',
      // P9-1이 당한 셋과 같은 형태.
      "import 'node:fs'",
      'import "child_process"',
      "const fs = await import('node:fs')",
      "require('os')",
      // `createRequire`로 우회하는 길의 입구.
      "import { createRequire } from 'node:module'",
    ]
    for (const line of caught) {
      expect(line, line).toMatch(EFFECTFUL_SPECIFIER)
    }
  })

  /**
   * **반대편.** 그물이 넓어지면 순수한 것까지 잡아 술어가 *"node를 쓰는가"*로 바뀐다 —
   * 그러면 `run.ts`가 목록에 들어와 케이스가 문서와 어긋난다.
   */
  it('순수한 것과 이 패키지의 모듈은 안 잡는다 — 반대편', () => {
    const ignored = [
      // `parseArgs`는 순수 함수다. `run.ts`가 이것을 쓰고도 목록에 없는 근거.
      "import { parseArgs } from 'node:util'",
      'import { parseArgs } from "util"',
      // 이름이 겹치는 이 패키지의 모듈. `paths`는 `path`가 아니다.
      "import { join } from '../paths'",
      "import { runInit } from './commands/init'",
      // 주석의 언급(걷히기 전이어도 지정자 자리가 아니다).
      "// `node:path`를 안 쓴다",
      "/** `node:fs`를 부르는 자리는 하나여야 한다 */",
    ]
    for (const line of ignored) {
      expect(line, line).not.toMatch(EFFECTFUL_SPECIFIER)
    }
  })
})
