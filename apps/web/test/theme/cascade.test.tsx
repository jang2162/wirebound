/**
 * **이 파일이 렌더러·테마 계약의 판정이다.**
 *
 * 다른 테마 테스트가 전부 초록이어도 여기가 실패하면 구조가 inline style을 방출해 테마가
 * 캐스케이드에서 지는 결함이 살아 있는 것이다. 같은 페이지 문서를 **테마 둘**로
 * 그려 계산된 스타일이 갈리는지 본다.
 *
 * **두 번째 테마는 여기서 손으로 만든다**(`LOUD_THEME` — 왜 리터럴로 적는지는 그 머리말).
 *
 * ---
 *
 * **jsdom이 `var()`를 치환하지 못한다**(`packages/renderer/test/css-probe.ts`의 표).
 * 그래서 값이 토큰에서 오는 자리는 **두 조각으로 나눠 잰다** — `:root`의 커스텀 프로퍼티
 * 값이 테마마다 다른 것과, 컴포넌트 규칙이 그 이름을 가리키는 것. 리터럴로 적은 자리는
 * 한 조각으로 그대로 잰다. 마지막 치환 한 걸음은 실제 브라우저의 몫이다 — 자동 회귀에는
 * 브라우저가 없어 이 파일이 재지 못한다.
 */
import {
  NODE_VAR_PREFIX,
  TREE_INDENT_VAR,
  installStructures,
  renderNode,
  structureBaseCss,
} from '@wirebound/renderer'
import { installCatalog } from '@wirebound/schema'
import {
  STYLE_PROPERTIES,
  STYLE_PROPERTIES_BEYOND_SPEC,
  compileTheme,
  resolveTheme,
  systemTheme,
  type Theme,
} from '@wirebound/themes'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'

beforeAll(() => {
  installCatalog()
  installStructures()
})

/** 네 컴포넌트를 담은 페이지 문서. **두 테마가 똑같이 이것을 그린다.** */
const DOC = {
  id: 'n_000000000001',
  type: 'Page',
  children: [
    { id: 'n_000000000002', type: 'Flex', props: { direction: 'row' } },
    { id: 'n_000000000003', type: 'Grid', props: { columns: 3 } },
    { id: 'n_000000000004', type: 'Card', props: { title: '카드' } },
    { id: 'n_000000000005', type: 'Text', props: { content: '제목', role: 'h1' } },
    // `--wb-tree-indent` 손잡이를 재는 자리다(아래 `커스텀 프로퍼티 채널` 절).
    { id: 'n_000000000006', type: 'Tree', props: { depth: 2 } },
  ],
}

/**
 * **두 번째 테마.** `admin`과 **같은 자리에 다른 값**을 넣는다. 값을 리터럴로 적은 것은
 * jsdom이 `var()`를 치환하지 못해 토큰으로 적으면 계산값이 두 테마에서 같은 문자열이
 * 되기 때문이다 — 리터럴이면 계산값이 그대로 갈린다.
 */
const LOUD_THEME: Theme = {
  meta: { id: 'loud', name: '대조군', version: '1.0.0' },
  tokens: { semantic: { surface: '#00ff00' } },
  components: {
    // 구조 기본 CSS의 `display: flex`와 `flex-direction: var(…)`을 둘 다 덮는다.
    //
    // **`base`로 감싸야 한다.** 스타일 프로퍼티를 바로 쓰는 축약은 `variants`·`states`·
    // `responsive`의 층 안에서만 받는다(`LayerSchema`) — 컴포넌트 루트는 `strictObject`라
    // `structure`·`base`·`parts`·`variants`·`states`·`responsive` 밖의 키를 이슈로 낸다 —
    // 여기에 축약으로 적으면 `Unrecognized keys: "direction", "display"`가 난다.
    // 설계서 「components — 구조 + 스킨」의 예시도 루트에서는 `base`를 쓴다.
    Flex: { structure: 'default', base: { direction: 'column', display: 'grid' } },
    // 구조 기본 CSS의 `display: grid`를 덮는다.
    Grid: { structure: 'default', base: { display: 'flex' } },
    Card: { structure: 'plain', base: { bg: 'semantic.surface' } },
    // `Text.role`이 싣는 `data-wb-variant` 채널로 h1만 겨냥한다.
    Text: { structure: 'default', variants: { h1: { fontSize: '99px' } } },
  },
}

/** 잴 자리 하나 — 셀렉터와 프로퍼티. 커스텀 프로퍼티 이름도 그대로 받는다. */
type Reading = readonly [selector: string, property: string]

/**
 * 테마 하나로 문서를 그려 계산된 스타일을 읽는다. **읽고 나서 걷어낸다** — 두 테마의
 * 시트가 한 문서에 함께 있으면 나중에 붙은 쪽이 이겨 비교 자체가 무의미해진다.
 *
 * `apps/web`의 테스트 환경이 이미 jsdom이라(루트 `vitest.config.ts`) 여기서는 `jsdom`
 * 패키지를 따로 들이지 않고 그 문서를 그대로 쓴다.
 *
 * **시트 순서가 계약 그대로다** — 구조 기본 CSS가 먼저, 테마 CSS가 나중.
 */
function measure(theme: Theme, readings: readonly Reading[]): { values: string[]; themeCss: string } {
  const { theme: resolved, issues } = resolveTheme(theme)
  // **오류만 본다.** 이 파일의 `LOUD_THEME`은 `Flex.base.direction`으로 **일부러**
  // 노드 손잡이를 덮는다 — 아래 `Flex의 flex-direction을 테마가 덮는다`가 그것을 재는
  // 케이스다. 그러므로 `node-handle-overwrite` 경고가 나는 것이 **이 파일의 취지 그대로**이고,
  // 경고 때문에 여기서 멈추면 그 케이스를 잴 수 없다.
  const errors = issues.filter((issue) => issue.severity === 'error')
  expect(errors.map((issue) => `${issue.path}: ${issue.message}`)).toEqual([])

  const themeCss = compileTheme(resolved!)

  const structureTag = document.createElement('style')
  structureTag.textContent = structureBaseCss()
  const themeTag = document.createElement('style')
  themeTag.textContent = themeCss
  document.head.append(structureTag, themeTag)

  const host = document.createElement('div')
  host.innerHTML = renderToStaticMarkup(renderNode(DOC))
  document.body.append(host)

  try {
    const values = readings.map(([selector, property]) => {
      const element = document.querySelector(selector)
      if (element === null) throw new Error(`요소를 찾지 못했습니다: ${selector}`)
      return getComputedStyle(element).getPropertyValue(property)
    })
    return { values, themeCss }
  } finally {
    structureTag.remove()
    themeTag.remove()
    host.remove()
  }
}

/** 같은 자리를 두 테마로 재서 나란히 놓는다. */
function compare(readings: readonly Reading[]): {
  admin: string[]
  loud: string[]
  adminCss: string
  loudCss: string
} {
  const adminResult = measure(systemTheme('admin')!, readings)
  const loudResult = measure(LOUD_THEME, readings)
  return {
    admin: adminResult.values,
    loud: loudResult.values,
    adminCss: adminResult.themeCss,
    loudCss: loudResult.themeCss,
  }
}

describe('테마를 바꾸면 외형이 바뀐다', () => {
  const FLEX = '[data-wb-component="Flex"]'
  const GRID = '[data-wb-component="Grid"]'
  const CARD = '[data-wb-component="Card"]'
  const TEXT = '[data-wb-component="Text"]'

  it('Flex의 flex-direction을 테마가 덮는다 — inline 선언이 이기던 자리', () => {
    const { admin, loud } = compare([
      [FLEX, 'flex-direction'],
      [FLEX, 'display'],
    ])

    // **`loud`를 먼저 단언한다.** 이 줄이 이 케이스가 지키는 것("테마가 이긴다")이고,
    // `admin` 줄은 대조군이다. 순서를 바꾸면 결함을 복원했을 때 터지는 것이 대조군이라
    // 실패 메시지가 "테마가 졌다"가 아니라 "계산값 문자열이 달라졌다"를 가리킨다.
    expect(loud).toEqual(['column', 'grid'])
    // 대조군 — `admin`은 방향을 정하지 않으므로 노드가 나른 값을 기본 CSS가 읽는다.
    expect(admin).toEqual(['var(--wb-node-flex-direction, row)', 'flex'])
  })

  /**
   * 트랙 목록은 `gridColumns`(설계서 「스타일 프로퍼티 화이트리스트」 밖,
   * `STYLE_PROPERTIES_BEYOND_SPEC`)로 적고 `repeat(N, 1fr)`이 된다.
   *
   * **이 케이스는 그 어휘를 쓰지 않는다.** `LOUD_THEME`이 트랙을 선언하지 않으므로 여기서 재는 것은
   * *"테마가 `display`를 덮는다"*이고, 구조가 inline `display:grid`를 내면 모든 테마 규칙을
   * 이겨 이 케이스가 죽는다. **트랙을 선언했을 때 무엇이 이기는지는 아래
   * `테마의 트랙 선언 vs 노드가 나르는 열 수` 절이 따로 잰다** — 두 성질을 한 케이스에 묶으면
   * 어느 쪽이 깨졌는지 실패 메시지가 말하지 않는다.
   */
  it('Grid의 display를 테마가 덮는다 — 트랙을 선언하지 않은 테마', () => {
    const { admin, loud } = compare([
      [GRID, 'display'],
      [GRID, 'grid-template-columns'],
      [GRID, '--wb-node-grid-columns'],
    ])

    // 테마가 이기는 줄이 먼저다(위 케이스와 같은 이유).
    // 노드가 나르는 열 수는 테마가 바뀌어도 그대로다 — 문서의 값이지 테마의 값이 아니다.
    expect(loud).toEqual(['flex', 'repeat(var(--wb-node-grid-columns, 1), 1fr)', '3'])
    expect(admin).toEqual(['grid', 'repeat(var(--wb-node-grid-columns, 1), 1fr)', '3'])
  })

  it('Card의 background가 테마마다 다르다 — 평범한 스킨 경로', () => {
    const { admin, loud } = compare([
      [CARD, 'background'],
      [':root', '--wb-semantic-surface'],
    ])

    // 규칙은 둘 다 같은 이름을 가리키고 `:root`의 값이 갈린다 — jsdom이 잴 수 있는 두 조각이다.
    expect(admin[0]).toBe('var(--wb-semantic-surface)')
    expect(loud[0]).toBe('var(--wb-semantic-surface)')
    expect(admin[1]).toBe('#ffffff')
    expect(loud[1]).toBe('#00ff00')
  })

  /**
   * **`data-wb-variant` 채널이 실제로 쓰인다.** `Text.role`이 `data-wb-variant`가 되므로 테마가
   * 역할별 타이포를 걸 수 있다. 이 채널이 없었다면 계약 밖 속성(`data-wb-role`)이 필요했다.
   */
  it('Text[data-wb-variant="h1"]의 font-size가 테마마다 다르다', () => {
    const { admin, loud } = compare([
      [TEXT, 'font-size'],
      [':root', '--wb-typography-h1-fontSize'],
    ])

    expect(admin[0]).toBe('var(--wb-typography-h1-fontSize)')
    expect(admin[1]).toBe('24px')
    // `loud`는 리터럴이라 계산값이 그대로 나온다 — 두 테마의 값이 실제로 갈린다.
    expect(loud[0]).toBe('99px')
    expect(admin[0]).not.toBe(loud[0])
  })

  it('변형 규칙이 실제로 그 노드에 걸린다', () => {
    // 위 케이스가 "규칙이 아무 데도 안 맞아서 기본값이 같다"로 통과하지 않게 못을 박는다.
    expect(renderToStaticMarkup(renderNode(DOC))).toContain('data-wb-variant="h1"')

    const { adminCss, loudCss } = compare([[TEXT, 'font-size']])
    expect(loudCss).toContain('[data-wb-component="Text"][data-wb-variant="h1"]')
    expect(adminCss).toContain('[data-wb-component="Text"][data-wb-variant="h1"]')
  })

  /**
   * **`!important`가 어디에도 없다.**
   *
   * 이것이 이 파일의 판정 그 자체다. `!important`로 덮으면 "테마가 이긴다"는 판정이
   * 사라진다 — 이기는지 아닌지를 더 이상 알 수 없게 되기 때문이다.
   */
  it('컴파일된 CSS와 구조 기본 CSS 어디에도 !important가 없다', () => {
    const { adminCss, loudCss } = compare([[FLEX, 'display']])

    expect(structureBaseCss()).not.toContain('!important')
    expect(adminCss).not.toContain('!important')
    expect(loudCss).not.toContain('!important')

    // 그런데도 위 케이스들에서 테마가 이겼다 — 순서와 특이도만으로 이긴다는 뜻이다.
    expect(adminCss.length).toBeGreaterThan(0)
    expect(loudCss.length).toBeGreaterThan(0)
  })

  /**
   * **새 어휘가 구조 기본 CSS와 다투는 자리.**
   *
   * `Grid:default`의 기본 CSS가 `grid-template-columns: repeat(var(--wb-node-grid-columns, 1), 1fr)`
   * 이고 노드가 그 변수를 인라인으로 나른다. 테마가 `gridColumns`를 선언하면 **같은
   * 프로퍼티를 두고 둘이 다툰다.**
   *
   * **잰 결과: 테마가 이기고 노드가 나른 열 수는 무시된다.** 인라인으로 실리는 것은
   * `--wb-node-grid-columns`라는 **변수 값**이지 `grid-template-columns` 선언이 아니므로,
   * 테마가 그 프로퍼티를 직접 선언하면 변수를 읽는 규칙 자체가 지고 값이 안 읽힌다.
   * (시트 순서 계약 그대로다 — 같은 특이도, 테마 시트가 나중.)
   *
   * **그것을 알고 어휘를 연다.** 이 어휘가 닫는 구멍은 `List:cardGrid`처럼 **노드가 열 수를
   * 정할 길이 아예 없는** 자리이고, `Grid`는 노드 prop이 이미 있어 테마가 그것을 덮을
   * 이유가 없다. 덮는 것은 테마 작성자의 선택이고 설계서 「components — 구조 + 스킨」이
   * 인정하는 층이다.
   *
   * > **이것은 사례가 아니라 부류다.** 구조 기본 CSS의 손잡이 여럿이 설계서 「스타일 프로퍼티
   * > 화이트리스트」 **안의** 어휘로도 같은 식으로 덮인다(`direction`·`align`·`justify`·
   * > `wrap`·`aspectRatio`·`height`·`paddingX`). **원인은 어휘 선택이 아니라
   * > `STYLE_PROPERTIES`에 컴포넌트 범위 개념이 없는 것이다** — `checkStyleMap`이 전역
   * > 화이트리스트 하나를 모든 컴포넌트에 똑같이 적용하므로 `List:cardGrid`를 위해 연 어휘가
   * > `Grid`에도 자동으로 열린다.
   * >
   * > 테마가 이기는 것은 옳고, **그것이 조용하지 않게** `resolveTheme`이 손잡이를 덮는
   * > 선언마다 `node-handle-overwrite` 경고를 낸다(손잡이 표는 `packages/themes/src/spec/handles.ts`).
   * > 경고가 없으면 사용자가 정한 열 수가 화면에 안 나타나는데 이슈가 0건인 침묵이 된다.
   */
  describe('테마의 트랙 선언 vs 노드가 나르는 열 수', () => {
    /** `Grid`에만 트랙을 선언한 테마. 문서의 `Grid` 노드는 `columns: 3`이다. */
    const TRACK_THEME: Theme = {
      meta: { id: 'track', name: '트랙', version: '1.0.0' },
      components: { Grid: { structure: 'default', base: { gridColumns: 5 } } },
    }

    it('테마가 이기고 노드가 나른 열 수는 무시된다', () => {
      const { values } = measure(TRACK_THEME, [
        [GRID, 'grid-template-columns'],
        [GRID, '--wb-node-grid-columns'],
      ])

      // 테마의 5가 이긴다. 노드의 3은 변수에 그대로 살아 있는데 **읽는 규칙이 졌다.**
      expect(values).toEqual(['repeat(5, 1fr)', '3'])
    })

    it('대조군 — 트랙을 선언하지 않으면 노드의 열 수가 쓰인다', () => {
      // 이것이 없으면 위 케이스가 "테마가 이겼다"인지 "원래 그 값이었다"인지 갈리지 않는다.
      const { values } = measure(
        { meta: { id: 'bare', name: '민', version: '1.0.0' }, components: { Grid: { structure: 'default' } } },
        [[GRID, 'grid-template-columns'], [GRID, '--wb-node-grid-columns']],
      )

      expect(values).toEqual(['repeat(var(--wb-node-grid-columns, 1), 1fr)', '3'])
    })

    it('컴파일된 규칙이 구조 기본 CSS와 같은 셀렉터다 — 특이도가 갈리지 않는다', () => {
      const { themeCss } = measure(TRACK_THEME, [[GRID, 'display']])

      expect(themeCss).toContain(
        '[data-wb-component="Grid"][data-wb-structure="default"] {\n  grid-template-columns: repeat(5, 1fr);\n}',
      )
    })
  })

  /**
   * **`--wb-tree-indent` 손잡이가 테마에서 산다.**
   *
   * 그 이름에 값을 넣는 길은 `treeIndent` 어휘다 — 이 어휘가 없으면 테마가 손잡이를 건드릴
   * 수 없어 늘 기본값 `16px`이 쓰인다.
   *
   * **jsdom이 마지막 한 걸음을 재지 못한다.** 실측: 테마가 낸 `--wb-tree-indent`를
   * `Tree` **루트**에서는 읽지만 조각(`[data-wb-part="node"]`)에서는 빈 문자열이고
   * (**커스텀 프로퍼티 상속을 계산하지 않는다**), `padding-left`도 `calc(var(…) * var(…))`
   * 문자열 그대로 남는다. 그래서 **두 조각으로 나눠 잰다** — 테마가 그 이름에 값을 내는
   * 것과, 구조 기본 CSS가 그 이름을 읽는 것. (파일 머리의 `var()` 치환과 같은 배치다.)
   *
   * **마지막 한 걸음은 Chromium에서 잰다** — 위 두 조각으로 만든 정적 HTML을 열어
   * `getComputedStyle(node).paddingLeft`를 읽으면:
   *
   * | 테마 | level 0 | level 1 | level 2 |
   * |---|---|---|---|
   * | `Tree.base.treeIndent: '40px'` | `0px` | **`40px`** | **`80px`** |
   * | 그 어휘를 안 씀(대조군) | `0px` | `16px` | `32px` |
   *
   * **그 측정은 자동 회귀에서 돌지 않는다**(자동 회귀에 브라우저가 없다).
   */
  describe('커스텀 프로퍼티 채널', () => {
    const TREE = '[data-wb-component="Tree"]'
    const NODE_PART = '[data-wb-part="node"]'

    /** `Tree`의 들여쓰기만 바꾼 테마. 값은 리터럴이다 — jsdom이 `var()`를 치환하지 못한다. */
    const INDENT_THEME: Theme = {
      meta: { id: 'indent', name: '들여쓰기', version: '1.0.0' },
      components: { Tree: { structure: 'indent', base: { treeIndent: '40px' } } },
    }

    it('테마가 손잡이 이름에 값을 낸다', () => {
      const { values } = measure(INDENT_THEME, [[TREE, TREE_INDENT_VAR]])

      expect(values).toEqual(['40px'])
    })

    it('대조군 — 그 어휘를 안 쓰는 테마에서는 값이 없다', () => {
      // 이것이 없으면 위 케이스가 "테마가 넣었다"인지 "원래 거기 있었다"인지 갈리지 않는다.
      const { values } = measure(systemTheme('admin')!, [[TREE, TREE_INDENT_VAR]])

      expect(values).toEqual([''])
    })

    it('구조 기본 CSS가 그 이름을 읽는다', () => {
      // 둘째 조각. 값이 나가도 읽는 규칙이 다른 이름을 보면 손잡이는 여전히 죽어 있다.
      const { values } = measure(INDENT_THEME, [[NODE_PART, 'padding-left']])

      expect(values[0]).toContain(`var(${TREE_INDENT_VAR}`)
    })

    /**
     * **소유 규칙의 대조.** 어휘가 내는 CSS 이름은 `themes`가 갖고, 그것을 읽는 규칙은
     * `renderer`가 갖는다. **`themes`는 `renderer`를 볼 수 없으므로**(설계서 「각 패키지의 책임과 의존」) 두 문자열이
     * 같은지 볼 수 있는 자리가 여기뿐이다 — 어긋나면 손잡이가 조용히 죽는다.
     */
    it('어휘가 내는 이름과 렌더러가 읽는 이름이 같다', () => {
      expect(STYLE_PROPERTIES['treeIndent']).toEqual([TREE_INDENT_VAR])
    })

    it('손잡이 이름이 노드 변수·토큰 이름과 겹치지 않는다', () => {
      // 겹치면 한 이름이 토큰과 노드 값 양쪽에서 만들어져 뜻이 둘이 된다.
      expect(TREE_INDENT_VAR.startsWith(NODE_VAR_PREFIX)).toBe(false)

      const { themeCss } = measure(systemTheme('admin')!, [[TREE, 'display']])
      const rootBlock = themeCss.slice(themeCss.indexOf(':root {'), themeCss.indexOf('}'))
      expect(rootBlock).not.toContain(TREE_INDENT_VAR)
    })

    it('설계서 「스타일 프로퍼티 화이트리스트」 밖의 어휘가 등록된 것뿐이다 — 목록이 여기서도 보인다', () => {
      // `themes`의 대조가 이미 있지만(그쪽 `설계서 「스타일 프로퍼티 화이트리스트」 대조`), 이 목록이 **두 패키지를 잇는
      // 계약**이 됐으므로 소비자 쪽에서도 이름을 못박는다.
      expect([...STYLE_PROPERTIES_BEYOND_SPEC].sort()).toEqual([
        'fontFamily',
        'gridColumns',
        'treeIndent',
      ])
    })
  })

  /**
   * **시트 순서를 뒤집으면 진다.** *"순서가 계약"*의 실측이다 —
   * 이 케이스가 없으면 위의 전부가 "특이도 덕에 이겼다"로도 설명된다.
   */
  it('시트 순서를 뒤집으면 테마가 진다', () => {
    const { theme: resolved } = resolveTheme(LOUD_THEME)
    const themeTag = document.createElement('style')
    themeTag.textContent = compileTheme(resolved!)
    const structureTag = document.createElement('style')
    structureTag.textContent = structureBaseCss()

    // 테마를 **먼저**, 구조 기본 CSS를 나중에.
    document.head.append(themeTag, structureTag)
    const host = document.createElement('div')
    host.innerHTML = renderToStaticMarkup(renderNode(DOC))
    document.body.append(host)

    try {
      expect(getComputedStyle(document.querySelector(FLEX)!).display).toBe('flex')
    } finally {
      themeTag.remove()
      structureTag.remove()
      host.remove()
    }
  })
})
