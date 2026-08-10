/**
 * **이 파일이 P4a-2 전체의 판정이다.**
 *
 * 앞의 아홉 태스크가 전부 초록이어도 여기가 실패하면 P0 이월 #7(구조가 inline style을
 * 방출해 테마가 캐스케이드에서 진다)은 닫히지 않은 것이다. 같은 페이지 문서를 **테마 둘**로
 * 그려 계산된 스타일이 갈리는지 본다.
 *
 * **두 번째 테마는 여기서 손으로 만든다.** 내장 테마를 둘 만들지 않는다(D7) — 시스템 테마
 * 다섯 종 제작은 P4b다.
 *
 * ---
 *
 * **jsdom이 `var()`를 치환하지 못한다**(`packages/renderer/test/css-probe.ts`의 표).
 * 그래서 값이 토큰에서 오는 자리는 **두 조각으로 나눠 잰다** — `:root`의 커스텀 프로퍼티
 * 값이 테마마다 다른 것과, 컴포넌트 규칙이 그 이름을 가리키는 것. 리터럴로 적은 자리는
 * 한 조각으로 그대로 잰다. 마지막 치환 한 걸음은 실제 브라우저의 몫이고, 그 측정은
 * 보고서에 적었다.
 */
import { installStructures, renderNode, structureBaseCss } from '@wirebound/renderer'
import { installCatalog } from '@wirebound/schema'
import { compileTheme, resolveTheme, systemTheme, type Theme } from '@wirebound/themes'
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
    // `structure`·`base`·`parts`·`variants`·`states`·`responsive` 밖의 키를 이슈로 낸다.
    // 처음에 축약으로 적었다가 `Unrecognized keys: "direction", "display"`를 받고 알았다.
    // §6.5의 예시도 루트에서는 `base`를 쓴다.
    Flex: { structure: 'default', base: { direction: 'column', display: 'grid' } },
    // 구조 기본 CSS의 `display: grid`를 덮는다.
    Grid: { structure: 'default', base: { display: 'flex' } },
    Card: { structure: 'plain', base: { bg: 'semantic.surface' } },
    // D4가 만든 채널로 h1만 겨냥한다.
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
 * **시트 순서가 D5 그대로다** — 구조 기본 CSS가 먼저, 테마 CSS가 나중.
 */
function measure(theme: Theme, readings: readonly Reading[]): { values: string[]; themeCss: string } {
  const { theme: resolved, issues } = resolveTheme(theme)
  expect(issues.map((issue) => `${issue.path}: ${issue.message}`)).toEqual([])

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
   * **P4a-2가 여기 *"트랙 목록을 적을 어휘가 없다"*고 적었다 — P4b-1이 그것을 열었다.**
   * `gridColumns`(§6.8 밖, `STYLE_PROPERTIES_BEYOND_SPEC`)가 `repeat(N, 1fr)`을 낸다.
   *
   * **이 케이스는 그대로 둔다.** `LOUD_THEME`이 그 어휘를 쓰지 않으므로 여기서 재는 것은
   * 여전히 *"테마가 `display`를 덮는다"*이고, 그것이 P0 이월 #7이 막고 있던 자리다
   * (전에는 inline `display:grid`가 모든 테마 규칙을 이겼다). **트랙을 선언했을 때
   * 무엇이 이기는지는 아래 `재라 #9` 절이 따로 잰다** — 두 성질을 한 케이스에 묶으면
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
   * **D4가 만든 채널이 실제로 쓰인다.** `Text.role`이 `data-wb-variant`가 되므로 테마가
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
   * **D8 — `!important`가 어디에도 없다.**
   *
   * 이것이 이 계획의 성공 판정 그 자체다. `!important`로 덮으면 "테마가 이긴다"는 판정이
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
   * **시트 순서를 뒤집으면 진다.** D5가 "순서가 계약"이라고 적은 것의 실측이다 —
   * 이 케이스가 없으면 위의 전부가 "특이도 덕에 이겼다"로도 설명된다.
   */
  /**
   * **재라 #9 — 새 어휘가 구조 기본 CSS와 다투는 자리.**
   *
   * `Grid:default`의 기본 CSS가 `grid-template-columns: repeat(var(--wb-node-grid-columns, 1), 1fr)`
   * 이고 노드가 그 변수를 인라인으로 나른다. 테마가 `gridColumns`를 선언하면 **같은
   * 프로퍼티를 두고 둘이 다툰다.**
   *
   * **잰 결과: 테마가 이기고 노드가 나른 열 수는 무시된다.** 인라인으로 실리는 것은
   * `--wb-node-grid-columns`라는 **변수 값**이지 `grid-template-columns` 선언이 아니므로,
   * 테마가 그 프로퍼티를 직접 선언하면 변수를 읽는 규칙 자체가 지고 값이 안 읽힌다.
   * (P4a-2의 계약 그대로다 — 같은 특이도, 테마 시트가 나중.)
   *
   * **그것을 알고 어휘를 열었다.** D1이 닫으려는 구멍은 `List:cardGrid`처럼 **노드가 열 수를
   * 정할 길이 아예 없는** 자리이고, `Grid`는 노드 prop이 이미 있어 테마가 그것을 덮을
   * 이유가 없다. 덮는 것은 테마 작성자의 선택이고 §6.5가 이미 인정하는 층이다.
   *
   * > **P4b-2가 알아야 할 것:** `Grid`에서 이 조합은 **침묵**이다 — 사용자가 캔버스에서
   * > 정한 열 수가 화면에 안 나타나는데 이슈가 하나도 나지 않는다. 컴파일 시점에 노드를
   * > 모르므로 `ignored-variant` 같은 신호를 낼 자리가 없다. 시스템 테마 다섯이
   * > `Grid.base.gridColumns`를 쓰지 않는 것으로 피하는 것이 오늘의 답이다.
   */
  describe('재라 #9 — 테마의 트랙 선언 vs 노드가 나르는 열 수', () => {
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
