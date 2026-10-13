import { installCatalog } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import packageJson from '../package.json?raw'
import tsconfigJson from '../tsconfig.json?raw'
import tsconfigTestJson from '../tsconfig.test.json?raw'
import * as api from '../src/index'

/**
 * `src/`의 모든 파일. **이 파일이 `test/`에 사는 것이 중요하다** — 소스를 훑는 검사를
 * `src/`에 두면 그 검사가 자기 자신을 훑는다(`apps/web/test/api-consumers.test.ts`도
 * 같은 이유로 `test/`에 산다).
 */
const sources = import.meta.glob('../src/**/*.ts', { query: '?raw', eager: true, import: 'default' })

describe('경계 — themes가 무엇을 보지 않는가', () => {
  it('훑을 소스를 실제로 읽는다', () => {
    // 글롭이 어긋나면 빈 집합에서 아래 검사가 조용히 통과한다.
    expect(Object.keys(sources).length).toBeGreaterThan(0)
    expect(Object.keys(sources)).toContain('../src/index.ts')
    expect(sources['../src/index.ts']).toContain('PACKAGE_NAME')
  })

  it('renderer도 react도 import하지 않는다', () => {
    // 카탈로그의 선언은 `schema`에 있다 — 렌더러의 레지스트리는 그것을 구현할 뿐이다.
    // 렌더러를 보면 설계서 「각 패키지의 책임과 의존」의 의존 방향이 깨지고 exporter·apps/web이 둘 다 가져오는 구조가 된다.
    for (const [path, source] of Object.entries(sources)) {
      expect(source, path).not.toMatch(/from '(@wirebound\/renderer|react)/)
    }
  })

  it('package.json이 schema · theme-sdk · fflate · zod만 의존한다', () => {
    const manifest = JSON.parse(packageJson) as { dependencies: Record<string, string> }
    expect(Object.keys(manifest.dependencies).sort()).toEqual(['@wirebound/schema', '@wirebound/theme-sdk', 'fflate', 'zod'])
  })

  it('theme-sdk 는 타입으로만 읽는다', () => {
    // theme-sdk 의 런타임은 react 를 싣는다 — api(Node)가 부르는 manifest 검증 · `.wbtheme` 읽기가 그것을 끌어오면
    // 테마 코드를 싣지 않는 서버 프로세스에 react 가 들어온다(spec 「내보내기와 PPTX」).
    // 절(`import … from`)은 따옴표를 못 넘게 잡는다 — 앞 import 의 경로 글자를 지나 다음 줄의 theme-sdk 에 닿지 않게.
    const clauses = Object.entries(sources).flatMap(([path, source]) =>
      [...source.matchAll(/import\s+([^'"]*?)\s*from\s*'@wirebound\/theme-sdk'/g)].map((m) => [path, m[1]!] as const),
    )
    expect(clauses.length).toBeGreaterThan(0)
    for (const [path, clause] of clauses) expect(clause, path).toMatch(/^type\s/)
  })

  it('tsconfig가 DOM을 들이지 않는다', () => {
    // 이 설정이 실제로 막는 것은 양방향으로 잰다 — `src`에 `document`를 심으면 `pnpm typecheck`가
    // TS2584이고 `lib`에 DOM을 되넣으면 같은 줄이 통과한다. 여기서는 그 설정이 그대로인지만 본다.
    for (const [name, raw] of [
      ['tsconfig.json', tsconfigJson],
      ['tsconfig.test.json', tsconfigTestJson],
    ] as const) {
      const parsed = JSON.parse(raw) as { compilerOptions: { lib: string[]; types: string[] } }
      expect(parsed.compilerOptions.lib, name).toEqual(['ES2022'])
      expect(parsed.compilerOptions.types, name).toEqual([])
    }
  })
})

describe('공개 표면이 계약이다', () => {
  /**
   * `src/index.ts`가 내는 것 전부. **여기 손으로 적은 목록이 계약이고, 이것을 고치는 것은
   * 밖으로 나가는 약속을 고치는 것이다.** 새 이름이 실수로 새면 이 케이스가 죽는다.
   */
  const CONTRACT = [
    'PACKAGE_NAME',
    // 패턴(설계서 「patterns — 테마가 소유한 구성 레시피」). 규격 · 검증 · 전개. `apps/web`의 패턴 고르개와 삽입 경로가 부른다 —
    // CLI·MCP가 부르려면 패키지에 있어야 한다(설계서 「LLM 연계 (P9)」).
    'PatternSchema',
    'PatternsSchema',
    'PatternNodeSchema',
    'PATTERN_CATEGORIES',
    'SLOT_TYPES',
    'checkPatterns',
    'expandPattern',
    // 설계서 「lint 규칙」의 lint. 웹·CLI·MCP 셋이 이 이름을 부른다.
    'lintProject',
    // 스냅샷 payload 규격과 lint 입력 변환. **`apps/api`가 아니라 여기 둔다** — api·CLI(`wireb pull`·`wireb lint`)·MCP가
    // 같은 모양을 읽는다. `wireb lint`와 MCP `validate`가 같은 변환을 부른다.
    'SNAPSHOT_PAYLOAD_VERSION',
    'SNAPSHOT_RESOURCES',
    'SnapshotPayloadSchema',
    'snapshotToLintInput',
    // 테마 manifest 규격 · 검증 · semver 부분집합. 빌드(`wb-theme build`) · 업로드 · 호스트가 같은 함수를 부른다.
    'ManifestSchema',
    'validateManifest',
    'compareVersions',
    'satisfiesSdk',
    'VERSION_PATTERN',
    'SDK_RANGE_PATTERN',
    // `.wbtheme` 읽기 · 쓰기. 빌드 · 업로드 · 시딩 · 호스트가 같은 읽기로 검증한다.
    'readWbtheme',
    // 새로 들이는 입구(업로드 · `wb-theme build`)의 읽기 — 다시 읽기에는 없는 검사(`Page` 가 든 패턴)를 더한다.
    'readNewWbtheme',
    'packWbtheme',
    'WBTHEME_LIMITS',
    // 토큰 → CSS 변수 · 푼 값. 갤러리 · 캔버스 · 내보내기가 같은 함수로 짓는다.
    'tokensCss',
    'tokenValues',
    'tokenVar',
    // 테마를 바꿀 때 토큰 잇기. 설정 화면의 본문과 api 의 impact 수가 같은 함수를 부른다.
    'migrateTokens',
  ].sort()

  it('공개 표면이 계약과 정확히 같다', () => {
    expect(Object.keys(api).sort()).toEqual(CONTRACT)
  })

  it('내부 헬퍼가 새어 나가지 않는다', () => {
    // 이슈 팩토리와 severity 표는 패턴 검증 안의 일이다 — 바깥에서 테마 이슈를 만드는 자리가 없다.
    for (const name of ['issue', 'themeIssue', 'THEME_ISSUE_SEVERITY']) {
      expect(Object.keys(api), name).not.toContain(name)
    }
  })

  it('패턴 검증과 전개가 공개 표면만으로 이어진다', () => {
    installCatalog()
    const pattern = api.PatternSchema.parse({
      name: '제목 하나',
      slots: { title: 'text' },
      schema: { type: 'Text', slot: 'title', props: { content: '안녕' } },
    })
    expect(api.checkPatterns({ 'hero.basic': pattern }).issues).toEqual([])
    const { expanded, issues } = api.expandPattern(pattern, () => 'n_000000000001')
    expect(issues).toEqual([])
    expect([...expanded!.slots]).toEqual([['title', 'n_000000000001']])
  })
})
