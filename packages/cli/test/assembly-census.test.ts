/**
 * **조립을 부르는 자리가 몇 개인가.**
 *
 * ---
 *
 * # 무엇을 지키나
 *
 * 설계서 「MCP 도구」의 도구와 「CLI」의 명령이 **같은 함수**를 부른다. 그 자리는
 * `src/read/` 셋이고 `wireb page get`·`wireb lint`·MCP의 도구 셋이 전부 그것을
 * 부른다. **지금 하나여도 유지하는 장치가 0이면 다음 사람이 조용히 두 벌로 만든다** —
 * 명령 파일에서 `pageView(`를 한 번 부르는 것은 다섯 줄이고, 그 다섯 줄이 갈리기 시작하면
 * 같은 프로젝트를 사람과 에이전트가 다르게 읽는다.
 *
 * # 왜 케이스로 확인할 수 없나
 *
 * 두 벌은 **처음에는 같은 값을 낸다.** 값을 재는 케이스로는 복제를 못 본다 — 복제가 값을
 * 바꾸는 것은 한쪽만 고쳐진 뒤이고 그때는 이미 늦었다. **소스를 세는 것이 유일한 방법이다**
 * (`test/io-boundary.test.ts`가 같은 부류다).
 *
 * # 분모는 `packages/cli/src` 하나다
 *
 * `packages/mcp` 쪽은 그 패키지의 케이스가 자기 뿌리를 훑는다
 * (`packages/mcp/test/assembly-census.test.ts`). **뿌리가 여럿인 검사를 한 파일에 두지
 * 않는다** — 한 파일이 두 뿌리를 훑으면 한쪽 패키지의 케이스가 남의 소스를 읽게 된다.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { stripComments } from '@wirebound/test-support'

const SRC = fileURLToPath(new URL('../src', import.meta.url))

/**
 * **읽기 조립의 원시들.** `packages/schema`·`packages/themes`가 내는 순수 함수이고,
 * 이것들을 **어느 순서로 어떻게 엮는가**가 곧 조립이다.
 *
 * `pageTargetPath`·`duplicateTargets`도 넣는다 — 접두를 벗기는 자리와 겹치는 타겟을 세는
 * 자리가 갈리면 사람이 읽는 경로와 에이전트가 받는 경로가 달라진다.
 */
const ASSEMBLY = [
  'installCatalog',
  'targetedPages',
  'matchPageTargets',
  'pageTargetPath',
  'duplicateTargets',
  'pageView',
  'migrateDocument',
  'snapshotToLintInput',
  'lintProject',
  'filterLintIssues',
]

/** **부르는 자리만 본다.** 이름을 언급하는 주석은 아래에서 먼저 걷힌다. */
const CALLS = new RegExp(`(?:^|[^\\w$.])(?:${ASSEMBLY.join('|')})\\s*\\(`)

function sourceFiles(dir: string = SRC, prefix = ''): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) found.push(...sourceFiles(join(dir, entry.name), relative))
    else if (entry.name.endsWith('.ts')) found.push(relative)
  }
  return found
}

/** 소스 글자 하나가 조립을 부르는가. 주석은 파서가 걷는다(`@wirebound/test-support` 의 `stripComments`). */
function callsAssembly(source: string): boolean {
  return CALLS.test(stripComments(source))
}

function assembles(relative: string): boolean {
  return callsAssembly(readFileSync(join(SRC, relative), 'utf8'))
}

describe('조립을 부르는 자리', () => {
  it('훑을 소스를 실제로 읽는다', () => {
    // 글롭이 어긋나면 **빈 집합에서 아래가 조용히 통과한다.**
    const files = sourceFiles()
    expect(files.length).toBeGreaterThan(10)
    expect(files).toContain('read/page.ts')
    expect(files).toContain('commands/lint.ts')
    expect(files).toContain('commands/page-get.ts')
  })

  it('목록이 `read/` 셋으로 고정돼 있다 — 명령이 다시 조립하면 여기가 먼저 죽는다', () => {
    expect(sourceFiles().filter(assembles)).toEqual(['read/catalog.ts', 'read/lint.ts', 'read/page.ts'])
  })

  it('술어가 실제로 가른다 — 반대편', () => {
    // 술어가 늘 `false`면 위 케이스가 *"아무것도 안 세고 통과"*한다.
    expect(assembles('read/page.ts')).toBe(true)
    expect(assembles('commands/page-get.ts')).toBe(false)
    expect(assembles('commands/lint.ts')).toBe(false)
  })

  /** **자를 케이스 안에서 재 둔다.** 정규식이 조용히 좁아지면 위가 아무것도 안 잡고 통과한다. */
  it('부르는 형태를 잡는다 — 이 정규식의 구분력', () => {
    const caught = [
      'const view = pageView({ id })',
      'installCatalog()',
      'return targetedPages({ menu, pages })',
      '\tconst all = lintProject(plan.input)',
      'issues = filterLintIssues(all, { pageIds })',
      'ordered.map((page) => pageTargetPath(page.target))',
    ]
    for (const line of caught) expect(line, line).toMatch(CALLS)
  })

  /**
   * **주석은 세지 않는다 — 두 쪽 다.** 줄 끝 주석에 이름을 적었다고 부르는 자리가 되면 거짓 빨강이고,
   * 줄 주석 속 `/*`가 뒤의 JSDoc 까지 코드를 삼키면 진짜 호출이 사라져 거짓 초록이다.
   */
  it('주석에 흔들리지 않는다 — 줄 끝 주석은 안 세고, 주석 속 `/*`가 호출을 삼키지 않는다', () => {
    expect(callsAssembly('const note = 1 // pageView( 는 read/ 가 부른다')).toBe(false)
    expect(callsAssembly('// 글롭 예: src/*\nconst view = pageView(input)\n/** 문서 */\nconst after = 2')).toBe(true)
  })

  it('언급과 남의 메서드는 안 잡는다 — 반대편', () => {
    const ignored = [
      // 이름만 나오는 자리(타입 import·주석은 걷히기 전이어도 부르는 자리가 아니다).
      "import type { PageView } from '@wirebound/schema'",
      '/** `pageView`가 무엇을 실을지 정한다 */',
      'const pageViewer = 1',
      // 점 뒤의 같은 이름 — 남의 객체 메서드다.
      'reader.pageView(input)',
    ]
    for (const line of ignored) expect(line, line).not.toMatch(CALLS)
  })
})
