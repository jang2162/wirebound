/**
 * **`themes`의 첫 `warning` 채널** (P4c-1 T2·T3·T4).
 *
 * `issue.ts`의 재라 #3이 이 날을 예고해 두었다 — *"`themes`에 첫 `warning`이 생기는 날
 * 그 규칙(`resolveTheme`의 '이슈가 있으면 `theme`은 `null`')을 `partitionIssues` 기준으로
 * 고쳐야 한다."* 이 파일이 그 채널의 계약을 못박는다.
 *
 * **세 가지가 함께 성립해야 채널이다:**
 * 1. `warning`인 코드가 실제로 있다 (`suspicious-literal`·`node-handle-overwrite`)
 * 2. `resolveTheme`이 그 이슈 때문에 `theme: null`을 내지 **않는다**
 * 3. 그런데도 이슈가 **`issues`에 실려 나온다** — 삼키면 severity를 만든 이유가 사라진다
 *
 * 저장 경계(`apps/api`의 `assertResolvable`)가 같은 기준을 쓰는지는 `apps/api`의
 * `routes-themes.test.ts`·`themes-warning-routes.test.ts`가 본다. **둘을 함께 고쳐야
 * 한다** — 하나만 고쳤을 때 무엇이 죽는지는 P4c-1 보고에 실측으로 있다.
 */
import { installCatalog } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { compileTheme } from '../src/emit/index'
import { THEME_ISSUE_SEVERITY } from '../src/issue'
import { resolveTheme } from '../src/resolve/index'
import { styleDeclarations } from '../src/resolve/style'
import type { TokenTable } from '../src/resolve/tokens'
import { SYSTEM_THEME_IDS, systemTheme } from '../src/system/index'

beforeAll(() => {
  installCatalog()
})

const TOKENS: TokenTable = new Map([
  ['space.4', '16px'],
  ['semantic.surface', '#ffffff'],
])
const decl = (prop: string, value: unknown) =>
  styleDeclarations(prop, value, TOKENS, prop, new Set(['container.maxWidth']))

const theme = (components: Record<string, unknown>) => ({
  meta: { id: 'probe', name: '프로브', version: '1.0.0' },
  tokens: { scale: { space: { unit: '4px' } } },
  components,
})

describe('T3 — suspicious-literal', () => {
  it('이름공간이 목록 밖이면 경고이고, 값은 적힌 그대로 실린다', () => {
    const { css, issues } = decl('gap', 'spce.4')
    // **값을 버리지 않는다.** 경고의 정의가 그것이다 — 테마는 서고 브라우저가 그 선언
    // 하나를 버릴 뿐이다.
    expect(css).toEqual([['gap', 'spce.4']])
    expect(issues.map((entry) => [entry.code, entry.severity])).toEqual([
      ['suspicious-literal', 'warning'],
    ])
    expect(issues[0]!.message).toContain('spce.4')
  })

  /**
   * **거짓 양성 목록.** 멀쩡한 CSS 리터럴이 판정식에 걸리면 안 된다 — 그것이 이 코드가
   * `error`가 아닌 이유이기도 하다. **다섯 테마와 저장소 전체 테스트로 전수를 쟀고
   * 그 수는 P4c-1 보고에 있다**(다섯 테마 0건, 전체 스위트 1건이며 그 1건은
   * `style.test.ts`가 일부러 만든 `'my-space.6'`이다).
   */
  it.each([
    ['aspectRatio', '16/9'],
    // 함수가 든 그림자는 토큰에서 오므로(스타일 층은 `rgba()`를 안 받는다) 리터럴 꼴로 쓴다.
    ['shadow', '0 1px 2px #0f172a1a'],
    ['fontFamily', 'Pretendard, sans-serif'],
    ['fontFamily', 'ui-monospace, SFMono-Regular, monospace'],
    ['borderWidth', '0 0 1px'],
    ['radius', '0.5rem'],
    ['letterSpacing', '-0.01em'],
    ['transition', 'all 150ms ease'],
    ['bgImage', 'url(/img/hero.png)'],
    ['maxWidth', '68ch'],
    ['display', 'grid'],
    ['gap', 'space.4'],
    ['maxWidth', 'container.maxWidth'],
  ])('경고 아님: %s = %s', (prop, value) => {
    expect(decl(prop, value).issues).toEqual([])
  })

  /**
   * **이름공간이 목록 *안*인데 경로가 없는 것은 경고가 아니라 오류다.**
   * `'container.maxwidth'`(오타)가 그것이다 — 계획서 D3의 괄호 예시가 이것을
   * `suspicious-literal`로 적었는데, **T1이 `container`를 목록에 넣은 뒤로는 그 분류가
   * 성립하지 않는다.** 참조라는 것이 모호하지 않으므로 `space.999`가 `unknown-token`인
   * 것과 같은 부류다. **계획서의 그 한 줄이 오늘 거짓이 됐고, 여기가 그 판정이다.**
   */
  it('container.maxwidth(오타)는 경고가 아니라 unknown-primitive 오류다', () => {
    const { css, issues } = decl('maxWidth', 'container.maxwidth')
    expect(css).toEqual([])
    expect(issues.map((entry) => [entry.code, entry.severity])).toEqual([
      ['unknown-primitive', 'error'],
    ])
  })
})

describe('T2 — 경고가 해석을 막지 않는다', () => {
  it('경고만 있으면 theme이 나오고 issues에 경고가 실린다', () => {
    const { theme: resolved, issues } = resolveTheme(theme({ Grid: { base: { gap: 'spce.4' } } }))

    expect(resolved).not.toBeNull()
    expect(issues.map((entry) => entry.code)).toEqual(['suspicious-literal'])
    // **삼키지 않는다.** `theme`이 `null`이 아니어도 `issues`가 비지 않는다.
    expect(issues).toHaveLength(1)
    // 그리고 그 값이 실제로 CSS에 나간다.
    expect(compileTheme(resolved!)).toContain('gap: spce.4;')
  })

  it('error가 하나라도 섞이면 theme은 null이고 경고도 함께 실린다', () => {
    const { theme: resolved, issues } = resolveTheme(
      theme({ Grid: { base: { gap: 'spce.4', bg: 'space.999' } } }),
    )

    expect(resolved).toBeNull()
    expect(issues.map((entry) => entry.code).sort()).toEqual([
      'suspicious-literal',
      'unknown-token',
    ])
  })

  it('severity 표가 이슈에 그대로 실린다', () => {
    const { issues } = resolveTheme(theme({ Grid: { base: { gap: 'spce.4' } } }))
    for (const entry of issues) {
      expect(entry.severity).toBe(THEME_ISSUE_SEVERITY[entry.code])
    }
  })
})

describe('T4 — node-handle-overwrite', () => {
  it('Flex의 direction 손잡이를 덮으면 경고다', () => {
    const { theme: resolved, issues } = resolveTheme(
      theme({ Flex: { base: { direction: 'column' } } }),
    )

    expect(resolved).not.toBeNull()
    expect(issues.map((entry) => [entry.code, entry.severity, entry.path])).toEqual([
      ['node-handle-overwrite', 'warning', 'components.Flex.base.direction'],
    ])
    // 문장이 **무엇이 사라지는지**를 말해야 한다.
    expect(issues[0]!.message).toContain('flex-direction')
    expect(issues[0]!.message).toContain('direction prop')
  })

  it('같은 컴포넌트의 다른 프로퍼티는 경고가 아니다', () => {
    expect(resolveTheme(theme({ Flex: { base: { gap: 'space.4' } } })).issues).toEqual([])
  })

  /**
   * **범위가 갈린다.** 손잡이가 조각(`Tree.node`)에 있으면 컴포넌트 루트에 같은
   * 프로퍼티를 적어도 셀렉터가 달라 덮지 않는다 — 반대도 같다.
   */
  it('범위(base ↔ 조각)가 다르면 경고가 아니다', () => {
    expect(resolveTheme(theme({ Tree: { base: { paddingX: 'space.4' } } })).issues).toEqual([])
    expect(
      resolveTheme(theme({ Tree: { parts: { node: { paddingX: 'space.4' } } } })).issues.map(
        (entry) => entry.code,
      ),
    ).toEqual(['node-handle-overwrite'])
  })

  /**
   * **축약도 덮는다.** `padding` 한 줄이 `Tree.node`의 `padding-left`를 지운다 —
   * `paddingX`만 보면 이 자리가 침묵으로 남는다(`SHORTHAND_COVERS`).
   */
  it('축약 프로퍼티(padding)도 잡는다', () => {
    expect(
      resolveTheme(theme({ Tree: { parts: { node: { padding: 'space.4' } } } })).issues.map(
        (entry) => entry.code,
      ),
    ).toEqual(['node-handle-overwrite'])
  })

  /**
   * **구조를 보지 않는다 — 덫은 한 칸 거리다.** `Tree:accordion`을 골라 오늘 손잡이가
   * 0개 적중해도 경고를 낸다. 근거는 `spec/handles.ts`의 머리말에 있다.
   */
  it('구조를 accordion으로 골라도 경고가 붙는다', () => {
    const { issues } = resolveTheme(
      theme({ Tree: { structure: 'accordion', parts: { node: { paddingX: 'space.4' } } } }),
    )
    expect(issues.map((entry) => entry.code)).toEqual(['node-handle-overwrite'])
  })

  /**
   * **변형·상태·반응형에서도 낸다.** 그 층의 셀렉터도 특이도가 같고 테마 시트가 뒤에
   * 오므로 층이 켜지는 순간 똑같이 이긴다. 층을 빼면 *"기본에는 안 적고 `hover`에만
   * 적었다"*가 침묵으로 남는다.
   */
  it('states 안에서도 낸다', () => {
    const { issues } = resolveTheme(
      theme({ Tree: { states: { selected: { parts: { node: { paddingX: 'space.4' } } } } } }),
    )
    expect(issues.map((entry) => [entry.code, entry.path])).toEqual([
      ['node-handle-overwrite', 'components.Tree.states.selected.parts.node.paddingX'],
    ])
  })

  it('responsive 안에서도 낸다', () => {
    const { issues } = resolveTheme({
      meta: { id: 'probe', name: '프로브', version: '1.0.0' },
      tokens: { scale: { space: { unit: '4px' } } },
      primitives: { breakpoints: { md: 768 } },
      components: { Flex: { responsive: { md: { direction: 'column' } } } },
    })
    expect(issues.map((entry) => [entry.code, entry.path])).toEqual([
      ['node-handle-overwrite', 'components.Flex.responsive.md.direction'],
    ])
  })
})

describe('T3·T4 — 다섯 시스템 테마의 전수', () => {
  /**
   * **다섯이 전부 선다.** 경고가 생겨도 `theme`이 `null`이 되지 않는 것이 T2의 요점이고,
   * 그것이 깨지면 시스템 테마가 통째로 못 쓰게 된다.
   */
  it('다섯 다 theme이 나오고 error는 0건이다', () => {
    for (const id of SYSTEM_THEME_IDS) {
      const { theme: resolved, issues } = resolveTheme(systemTheme(id)!)
      expect(resolved, id).not.toBeNull()
      expect(
        issues.filter((entry) => entry.severity === 'error'),
        id,
      ).toEqual([])
    }
  })

  /**
   * **경고는 정확히 둘이고 둘 다 `Tree.parts.node.paddingX`다** — P4b-3의 ③이 잰 값과
   * 같다(*"`portal`·`docs`가 손잡이와 셀렉터가 정확히 같다"*). 그 판의 넷은
   * *"넷 다 다른 셀렉터를 쓴다"*고 보고했고 그것이 거짓이었다.
   *
   * **`suspicious-literal`은 0건이다** — T1이 `admin`의 2건을 없앤 뒤이므로 0이 정상이다.
   */
  it('경고 전수 — portal·docs의 손잡이 둘, suspicious-literal 0건', () => {
    const found: Record<string, string[]> = {}
    for (const id of SYSTEM_THEME_IDS) {
      const { issues } = resolveTheme(systemTheme(id)!)
      if (issues.length > 0) found[id] = issues.map((entry) => `${entry.code} @ ${entry.path}`)
    }

    expect(found).toEqual({
      portal: ['node-handle-overwrite @ components.Tree.parts.node.paddingX'],
      docs: ['node-handle-overwrite @ components.Tree.parts.node.paddingX'],
    })
  })
})
