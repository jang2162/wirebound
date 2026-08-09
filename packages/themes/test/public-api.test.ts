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
    'THEME_ID_PATTERN', 'EXTENDS_PATTERN',
    // 해석과 방출
    'resolveTheme', 'compileTheme', 'mergeTheme',
    'resolveTokens', 'checkPrimitives', 'checkThemeComponents', 'checkPatterns',
    // 값 헬퍼 — 규격을 쓰는 쪽이 같은 규칙으로 값을 다뤄야 해서 낸다
    'styleDeclarations', 'resolveStyleValue', 'isTokenReference', 'cssVarName',
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
