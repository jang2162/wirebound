/**
 * **이 패키지는 조립을 하지 않는다 (P9-4 D1) — 그것을 두 층으로 지킨다.**
 *
 * ---
 *
 * # 왜 자가 필요한가
 *
 * §12.2의 도구와 §12.3의 명령이 **같은 함수**를 부르는 것이 이 슬라이스의 존재 이유다.
 * 오늘 자리가 하나여도 **유지하는 장치가 0이면 다음 사람이 조용히 두 벌로 만든다** —
 * 그리고 두 벌은 **오늘 같은 값을 내므로** 값을 재는 케이스가 그것을 못 본다.
 *
 * # 층 하나 — 의존 목록
 *
 * 이 패키지의 런타임 의존이 `@wirebound/cli`와 MCP SDK 둘뿐이면 `@wirebound/schema`를
 * import하는 줄이 **애초에 해석되지 않는다.** 조립을 여기서 하려면 먼저 의존을 더해야 하고,
 * 그 한 줄이 이 케이스에서 걸린다.
 *
 * # 층 둘 — 부르는 자리
 *
 * 의존이 없어도 `@wirebound/cli/embed`가 타입을 재수출하므로 값을 넘겨받아 **여기서 다시
 * 엮는** 길은 남는다. 그래서 소스도 훑는다.
 *
 * **분모는 `packages/mcp` 하나다.** `packages/cli` 쪽은 그 패키지의 케이스가 자기 뿌리를
 * 훑는다(P3-3 이월 §6.9: *"뿌리가 여럿인 검사는 그 파일을 못 쓴다"*).
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import manifest from '../package.json?raw'

const SRC = fileURLToPath(new URL('../src', import.meta.url))

/** `packages/cli/test/assembly-census.test.ts`와 **같은 목록**이다. 뿌리만 다르다. */
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

const CALLS = new RegExp(`(?:^|[^\\w$.])(?:${ASSEMBLY.join('|')})\\s*\\(`)

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

function assembles(relative: string): boolean {
  return CALLS.test(stripComments(readFileSync(join(SRC, relative), 'utf8')))
}

describe('조립이 두 벌이 되는 길을 막는다 (D1)', () => {
  it('런타임 의존이 둘뿐이다 — 순수 패키지를 직접 의존하지 않는다', () => {
    const parsed = JSON.parse(manifest) as { dependencies: Record<string, string> }
    expect(Object.keys(parsed.dependencies).sort()).toEqual(['@modelcontextprotocol/sdk', '@wirebound/cli'])
  })

  it('훑을 소스를 실제로 읽는다', () => {
    const files = sourceFiles()
    expect(files.length).toBeGreaterThan(4)
    expect(files).toContain('handlers.ts')
    expect(files).toContain('session.ts')
  })

  it('조립을 부르는 자리가 하나도 없다 — 부르는 것은 `@wirebound/cli`의 읽기 층이다', () => {
    expect(sourceFiles().filter(assembles)).toEqual([])
  })

  /**
   * **술어를 보정한다.** 이 패키지의 소스가 전부 `false`라 술어가 늘 `false`인 판과
   * 구별되지 않는다 — 형태를 직접 먹여 본다.
   */
  it('술어가 실제로 가른다', () => {
    for (const line of ['const view = pageView({ id })', 'installCatalog()', 'lintProject(plan.input)']) {
      expect(line, line).toMatch(CALLS)
    }
    for (const line of ["import { listProject } from '@wirebound/cli/embed'", 'listProject(payload)']) {
      expect(line, line).not.toMatch(CALLS)
    }
  })
})
