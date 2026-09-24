/**
 * **이 패키지는 조립을 하지 않는다 — 그것을 세 층으로 지킨다.**
 *
 * ---
 *
 * # 왜 자가 필요한가
 *
 * 설계서 「MCP 도구」의 도구와 「CLI」의 명령이 **같은 함수**를 부르는 것이 이 패키지의 존재
 * 이유다.
 * 오늘 자리가 하나여도 **유지하는 장치가 0이면 다음 사람이 조용히 두 벌로 만든다** —
 * 그리고 두 벌은 **오늘 같은 값을 내므로** 값을 재는 케이스가 그것을 못 본다.
 *
 * # 층 하나 — 의존 목록
 *
 * 이 패키지의 런타임 의존이 `@wirebound/cli`와 MCP SDK 둘뿐이면 `@wirebound/schema`를
 * import하는 줄이 **애초에 해석되지 않는다.** 조립을 여기서 하려면 먼저 의존을 더해야 하고,
 * 그 한 줄이 이 케이스에서 걸린다.
 *
 * # 층 둘 — 순수 패키지의 원시를 직접 부르는 자리
 *
 * 의존이 없어도 값을 넘겨받아 **여기서 다시 엮는** 길은 남는다. 그래서 소스도 훑는다.
 *
 * # 층 셋 — **`embed`가 내주는 이름의 허용 목록**
 *
 * **층 둘은 이것을 못 본다.** 층 둘의 분모(`ASSEMBLY`)가 `@wirebound/schema`·
 * `@wirebound/themes`의 이름 열 개뿐이라, **읽기 층이 값으로 내주는 이름들**(`orderedPages`·
 * `projectPaths`·`countErrors`·`prepareCatalog`)이 거기 하나도 없다 — `handlers.ts`가
 * `orderedPages`로 목록을 다시 엮어도 층 둘은 초록이다.
 *
 * **그래서 분모를 손으로 안 적는다.** `import * as embed`로 **런타임 export 전부**를 받아
 * 그중 아래 허용 목록 밖의 이름이 소스에 나타나면 죽는다. `embed`에 이름이 늘어도 분모가
 * 저절로 는다.
 *
 * **분모는 `packages/mcp` 하나다.** `packages/cli` 쪽은 그 패키지의 케이스가 자기 뿌리를
 * 훑는다 — 한 파일이 두 뿌리를 훑으면 한쪽 패키지의 케이스가 남의 소스를 읽게 된다.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as embed from '@wirebound/cli/embed'
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

/**
 * **`packages/mcp/src`가 `@wirebound/cli/embed`에서 불러도 되는 이름.** 그 밖의 export를
 * 부르면 조립을 여기서 다시 엮는다는 뜻이다.
 *
 * **줄마다 왜 허용하는지가 있어야 한다** — 이유 없이 늘리면 층 셋이 다시 무너진다.
 */
const ALLOWED_EMBED: readonly { name: string; why: string }[] = [
  { name: 'createNodeIo', why: 'bin.ts 가 진짜 io 를 조립한다' },
  { name: 'CliError', why: 'outcome.ts 가 wireb 갈래를 가른다' },
  { name: 'EXIT', why: '〃 — 설정 갈래에만 찾은 자리를 덧붙인다' },
  { name: 'requireProject', why: 'session.ts 의 첫 걸음' },
  { name: 'fetchSnapshot', why: 'session.ts 의 둘째 걸음' },
  { name: 'readLintConfig', why: 'LintConfig 는 .wirebound.json 에서만 온다' },
  { name: 'listProject', why: '읽기 층의 진입점 — list_pages' },
  { name: 'lookupPage', why: '〃 — get_page' },
  { name: 'lintReport', why: '〃 — validate' },
  { name: 'callApi', why: '쓰기 둘이 REST 를 직접 부른다. wireb 에 명령을 안 만든다(설계서 「CLI」의 명령 목록에 그 줄이 없다)' },
  { name: 'parseJson', why: '〃 — 응답 본문을 읽는 자리도 packages/cli 의 것을 쓴다' },
  { name: 'CliError', why: '409·423 을 status 로 가른다. 문장에서 숫자를 되파면 서버가 문장을 바꾸는 날 조용히 틀린다' },
]

describe('조립이 두 벌이 되는 길을 막는다', () => {
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

/**
 * **층 셋** — 읽기 층을 여기서 다시 엮는 길을 막는다.
 *
 * 층 둘은 *"순수 패키지의 원시를 직접 부르는가"*를 보고, 여기서는 *"`embed`가 값으로 내주는
 * 재료를 부르는가"*를 본다. `orderedPages`로 목록을 다시 엮는 변이가 층 둘을 그대로 통과하는
 * 자리다.
 */
describe('`embed`의 면 중 부르는 것이 허용 목록뿐이다', () => {
  const allowed = ALLOWED_EMBED.map((entry) => entry.name)
  /** **분모를 손으로 안 적는다** — 런타임 export 전부다. */
  const exported = Object.keys(embed).sort()

  it('`embed`의 면을 실제로 읽는다', () => {
    // 분모가 비면 아래가 조용히 통과한다.
    expect(exported.length).toBeGreaterThan(15)
    expect(exported).toContain('lookupPage')
    // 읽기 층의 **재료**도 실제로 나가 있다 — 그것이 이 층이 막는 대상이다.
    expect(exported).toContain('orderedPages')
    expect(exported).toContain('countErrors')
  })

  it('허용 목록이 `embed`에 실재하는 이름만 든다 — 낡은 줄이 남지 않는다', () => {
    expect(allowed.filter((name) => !exported.includes(name))).toEqual([])
    for (const entry of ALLOWED_EMBED) expect(entry.why.length, entry.name).toBeGreaterThan(5)
  })

  it('허용 목록 밖의 이름이 소스에 없다', () => {
    const forbidden = exported.filter((name) => !allowed.includes(name))
    // 분모가 0이면 아래가 공허하다 — 막을 것이 실제로 있는가.
    expect(forbidden.length).toBeGreaterThan(0)

    const found: string[] = []
    for (const file of sourceFiles()) {
      const source = stripComments(readFileSync(join(SRC, file), 'utf8'))
      for (const name of forbidden) {
        if (new RegExp(`(?:^|[^\\w$])${name}(?:[^\\w$]|$)`).test(source)) found.push(`${file}: ${name}`)
      }
    }
    expect(found).toEqual([])
  })

  it('허용 목록의 이름은 실제로 쓰인다 — 죽은 허가가 남지 않는다', () => {
    const sources = sourceFiles().map((file) => stripComments(readFileSync(join(SRC, file), 'utf8'))).join('\n')
    const unused = allowed.filter((name) => !new RegExp(`(?:^|[^\\w$])${name}(?:[^\\w$]|$)`).test(sources))
    expect(unused).toEqual([])
  })
})
