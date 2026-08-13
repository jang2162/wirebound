import { describe, expect, it } from 'vitest'
import packageJson from '../package.json?raw'
import tsconfigJson from '../tsconfig.json?raw'
import tsconfigTestJson from '../tsconfig.test.json?raw'
import * as api from '../src/index'

/**
 * `src/`의 모든 파일. **이 파일이 `test/`에 사는 것이 중요하다** — 소스를 훑는 검사를
 * `src/`에 두면 그 검사가 자기 자신을 훑는다. 이 저장소에서 같은 사고가 두 번 났고
 * 배치로 닫혔다(`apps/web/test/api-consumers.test.ts`가 선례다).
 */
const sources = import.meta.glob('../src/**/*.ts', { query: '?raw', eager: true, import: 'default' })

describe('경계 — themes가 무엇을 보지 않는가', () => {
  it('훑을 소스를 실제로 읽는다', () => {
    // 글롭이 어긋나면 빈 집합에서 아래 검사가 조용히 통과한다.
    expect(Object.keys(sources).length).toBeGreaterThan(0)
    expect(Object.keys(sources)).toContain('../src/index.ts')
    expect(sources['../src/index.ts']).toContain('PACKAGE_NAME')
  })

  it('renderer도 react도 import하지 않는다 (D1)', () => {
    // 카탈로그의 선언은 `schema`에 있다 — 렌더러의 레지스트리는 그것을 구현할 뿐이다.
    // 렌더러를 보면 §3.3의 의존 방향이 깨지고 exporter·apps/web이 둘 다 가져오는 구조가 된다.
    for (const [path, source] of Object.entries(sources)) {
      expect(source, path).not.toMatch(/from '(@wirebound\/renderer|react)/)
    }
  })

  it('package.json이 schema와 zod만 의존한다', () => {
    const manifest = JSON.parse(packageJson) as { dependencies: Record<string, string> }
    expect(Object.keys(manifest.dependencies).sort()).toEqual(['@wirebound/schema', 'zod'])
  })

  it('tsconfig가 DOM을 들이지 않는다', () => {
    // 이 설정이 실제로 막는 것은 웨이브 1에서 양방향으로 쟀다 — `document`를 심으면 TS2584이고
    // `lib`에 DOM을 되넣으면 같은 줄이 통과했다. 여기서는 그 설정이 그대로인지만 본다.
    for (const [name, raw] of [['tsconfig.json', tsconfigJson], ['tsconfig.test.json', tsconfigTestJson]] as const) {
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
    // 규격
    'ThemeSchema', 'ThemePatchSchema', 'MetaSchema', 'AssetsSchema', 'TokensSchema',
    'PrimitivesSchema', 'ComponentSchema', 'ComponentsSchema',
    'PatternSchema', 'PatternsSchema', 'PatternNodeSchema',
    // 상수
    'ICON_SETS', 'PLACEHOLDER_STYLES', 'PATTERN_CATEGORIES', 'SLOT_TYPES',
    'SPACE_MAX', 'TOKEN_NAMESPACES', 'STYLE_PROPERTIES',
    // §6.8 밖의 어휘 목록. **`apps/web`이 쓴다** — `treeIndent`가 내는 CSS 이름과
    // `renderer`의 `TREE_INDENT_VAR`를 대조하는 자리가 거기뿐이다(§3.3).
    'STYLE_PROPERTIES_BEYOND_SPEC',
    'THEME_ID_PATTERN', 'EXTENDS_PATTERN',
    // 해석과 방출
    'resolveTheme', 'compileTheme', 'mergeTheme',
    'resolveTokens', 'checkPrimitives', 'checkThemeComponents', 'checkPatterns',
    // 값 헬퍼 — 규격을 쓰는 쪽이 같은 규칙으로 값을 다뤄야 해서 낸다
    'styleDeclarations', 'resolveStyleValue', 'isTokenReference', 'cssVarName',
    // 내장 시스템 테마 (P4a-2 Task 7). `ADMIN_THEME`을 따로 내는 것은 파생 테마의 base가
    // 될 값이 이름으로 필요하기 때문이다 — P4a-3의 병합이 그것을 쓴다.
    'SYSTEM_THEME_IDS', 'systemTheme', 'ADMIN_THEME',
    // 이슈 severity 표와 팩토리 (P4a-3 Task 1). 저장 경계가 "막을 이슈"와 "알릴 이슈"를
    // 갈라야 하고, 이 패키지 밖에서 테마 이슈를 만드는 자리도 표를 지나야 한다.
    'THEME_ISSUE_SEVERITY', 'themeIssue',
    // P4c-1 T1 — 스타일이 `primitives`를 가리키는 문법. 이름공간 목록을 내는 것은
    // 저작 UI(P4c-2)의 값 편집기가 드롭다운으로 낼 목록이 이것이기 때문이다.
    'STYLE_PRIMITIVE_NAMESPACES', 'isPrimitiveReference',
    // P4c-1 T4 — 노드 손잡이 표. **`apps/web`이 렌더러의 구조 기본 CSS와 대조한다**
    // (§3.3 — `themes`는 `renderer`를 볼 수 없다). `STYLE_PROPERTIES_BEYOND_SPEC`과 같은 부류다.
    'NODE_HANDLES', 'coveredProperties', 'overwrittenHandles',
    // P7-1 T1 — 패턴 전개(§6.6). `apps/web`의 삽입 경로가 부르고, P8·P9도 같은 이름을 쓴다.
    'expandPattern',
  ].sort()

  it('공개 표면이 계약과 정확히 같다', () => {
    expect(Object.keys(api).sort()).toEqual(CONTRACT)
  })

  it('내부 헬퍼가 새어 나가지 않는다', () => {
    for (const name of ['own', 'scanFunctions', 'rejectFunctions', 'rejectDangerousCharacters', 'urlSpans']) {
      expect(Object.keys(api), name).not.toContain(name)
    }
  })

  it('해석과 방출이 실제로 이어진다', () => {
    // 공개 표면만으로 테마 하나를 CSS까지 가져갈 수 있어야 한다.
    const { theme, issues } = api.resolveTheme({
      meta: { id: 'a', name: '가', version: '1.0.0' },
      tokens: { semantic: { primary: '#2563eb' } },
    })
    expect(issues).toEqual([])
    expect(api.compileTheme(theme!)).toContain('--wb-semantic-primary: #2563eb;')
  })
})
