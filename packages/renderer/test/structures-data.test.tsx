/**
 * **데이터 그룹의 구조 구현체** — `List`·`Tree`·`KeyValue`.
 *
 * **파일이 따로인 이유:** 그룹마다 구조를 병렬로 만들 때 `structures.test.tsx` 하나에 절을
 * 더하면 모두가 같은 파일에 줄을 더해 병합에서 부딪힌다 — 소스를 그룹 모듈로 가른 것과
 * 같은 이유로 케이스도 가른다.
 *
 * **여기가 재지 않는 것:** 계약 밖 `data-*`·`style`의 일반 선언·선언되지 않은 part 이름은
 * `structures.test.tsx`의 **전수 가드 셋**이 등록된 모든 구조에 대해 이미 잰다. 그러니
 * 여기서는 **이 여섯 구조가 무엇을 그리는가**만 못박는다.
 */
import { installCatalog, requireComponent } from '@wirebound/schema'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { renderNode } from '../src/render'
import { structureBaseCss } from '../src/structure-css'
import { nodeVar } from '../src/structure-css-tools'
import { installStructures } from '../src/structures/index'
import { probe } from './css-probe'

beforeAll(() => {
  installCatalog()
  installStructures()
})

/** 노드 하나를 **그 구조로** 그린다. 테마가 구조를 고르는 경로(`options.structures`)와 같다. */
function render(type: string, structure: string, props: Record<string, unknown> = {}): string {
  return renderToStaticMarkup(
    renderNode({ id: 'n_000000000001', type, props }, { structures: { [type]: structure } }),
  )
}

/**
 * 렌더된 HTML을 실제로 파싱해 셀렉터에 맞는 요소 수를 센다.
 *
 * **문자열 검사로는 중첩을 잴 수 없다** — `media`가 `body` **안**에 있는지 **옆**에 있는지가
 * `mediaList`의 요점인데, 정규식은 등장 순서만 본다. `jsdom`은 저장소 루트의
 * devDependency이고 테스트에서 동적 import로만 쓴다(`css-probe.ts`가 세운 관례).
 */
async function count(html: string, selector: string): Promise<number> {
  const { JSDOM } = await import('jsdom')
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`)
  return dom.window.document.querySelectorAll(selector).length
}

/** 렌더된 HTML에 나온 조각 이름 전부(순서대로, 중복 포함). */
function parts(html: string): string[] {
  return [...html.matchAll(/data-wb-part="([^"]*)"/g)].map((match) => match[1]!)
}

function countOf(html: string, part: string): number {
  return parts(html).filter((name) => name === part).length
}

/**
 * 이 구조가 쓰는 조각 이름이 **카탈로그에 선언돼 있는가.** 없으면 전수 가드가 죽는다.
 *
 * 조각을 하나도 못 찾으면 `['조각 0개']`를 돌려준다 — 빈 배열을 돌려주면 폴백이 그려진
 * 자리에서도 통과해 아무것도 지키지 않는다.
 */
function undeclared(type: string, html: string): string[] {
  const found = [...new Set(parts(html))]
  if (found.length === 0) return ['조각 0개']
  const declared = new Set(requireComponent(type).parts)
  return found.filter((name) => !declared.has(name))
}

describe('List:cardGrid', () => {
  it('items 수만큼 item 조각을 내고 각 카드가 media·title·meta를 갖는다', () => {
    const html = render('List', 'cardGrid', { items: 3 })
    expect(html).toContain('data-wb-structure="cardGrid"')
    expect(countOf(html, 'item')).toBe(3)
    expect(countOf(html, 'media')).toBe(3)
    expect(countOf(html, 'title')).toBe(3)
    expect(countOf(html, 'meta')).toBe(3)
  })

  it('items가 0이면 카드가 하나도 없다 — 수 prop의 렌더 갈래', () => {
    const html = render('List', 'cardGrid', { items: 0 })
    expect(countOf(html, 'item')).toBe(0)
    expect(html).toContain('data-wb-component="List"')
  })

  it('pagination이 켜졌을 때만 pagination 조각이 나온다 — 조건부 조각', () => {
    expect(countOf(render('List', 'cardGrid', { pagination: true }), 'pagination')).toBe(1)
    expect(countOf(render('List', 'cardGrid', { pagination: false }), 'pagination')).toBe(0)
  })

  it('table의 조각(header·row·cell)을 쓰지 않는다 — 두 구조가 실제로 다르다', () => {
    const cardGrid = new Set(parts(render('List', 'cardGrid')))
    // 조각이 하나도 없으면 아래 셋이 전부 거저 통과한다(폴백이 그려져도 그렇다).
    expect(cardGrid.size).toBeGreaterThan(0)
    expect(cardGrid.has('header')).toBe(false)
    expect(cardGrid.has('row')).toBe(false)
    expect(cardGrid.has('cell')).toBe(false)

    // 대조군 — 같은 노드를 table로 그리면 그 셋이 나온다. 없으면 위 셋이 "아무것도
    // 안 그린다"로도 설명된다.
    const table = new Set(parts(render('List', 'table')))
    expect([...table].sort()).toContain('cell')
  })

  it('쓰는 조각 이름이 전부 카탈로그에 선언돼 있다', () => {
    expect(undeclared('List', render('List', 'cardGrid'))).toEqual([])
  })

  /**
   * **`List:cardGrid`의 열 수를 무엇이 정하는가.**
   *
   * 답: **테마다.** 노드에는 열 수를 담을 prop이 없다 — `List.columns`는
   * `visibleWhen:{structure:'table'}`인 **컬럼 이름 목록**(`string[]`)이라 카드 그리드에서는
   * 패널에 보이지도 않고 뜻도 다르다. 그래서 구조 기본 CSS는
   * **grid를 세우고 최소한의 트랙만** 주고, 실제 열 수는 테마의 `gridColumns` 어휘가 정한다
   * (그 어휘는 설계서 「스타일 프로퍼티 화이트리스트」 밖이다 — 근거는
   * `packages/themes/src/resolve/style.ts`의 `STYLE_PROPERTIES_BEYOND_SPEC`에 있다).
   *
   * **아래 두 케이스가 그 답의 실행 가능한 형태다.**
   */
  it('기본 CSS가 grid를 세운다 — 열 수는 기본값 2다', async () => {
    const dom = await probe([structureBaseCss()], render('List', 'cardGrid', { items: 2 }))
    const list = '[data-wb-component="List"]'
    expect(dom.computed(list, 'display')).toBe('grid')
    expect(dom.computed(list, 'grid-template-columns')).toBe('repeat(2, 1fr)')
  })

  it('테마의 gridColumns가 그 열 수를 덮는다 — !important 없이', async () => {
    // `compileTheme`의 `pushComponent`가 내는 셀렉터 모양이다(특이도가 같아야 순서가
    // 우선순위가 된다). `gridColumns: 4`가 이 문자열로 펼쳐진다.
    const themeRule =
      '[data-wb-component="List"][data-wb-structure="cardGrid"]' +
      ' { grid-template-columns: repeat(4, 1fr); }'
    const html = render('List', 'cardGrid', { items: 2 })

    // 덮을 것이 실제로 있는지 먼저 못박는다 — 없으면 아래가 거저 통과한다.
    const baseOnly = await probe([structureBaseCss()], html)
    expect(baseOnly.computed('[data-wb-component="List"]', 'grid-template-columns')).toBe(
      'repeat(2, 1fr)',
    )

    const both = await probe([structureBaseCss(), themeRule], html)
    expect(both.computed('[data-wb-component="List"]', 'grid-template-columns')).toBe(
      'repeat(4, 1fr)',
    )
  })

  it('노드는 열 수를 나르지 않는다 — 손잡이를 새로 만들지 않았다', async () => {
    // **이것이 "테마가 정한다"의 음성 대조다.** 노드 변수를 만들어 두고 아무도 값을 안
    // 실으면 `Media.kind`와 같은 "조용히 죽은 손잡이"가 하나 더 생긴다.
    const html = render('List', 'cardGrid', { items: 2, columns: ['가', '나', '다'] })
    expect(html).not.toContain(nodeVar('list', 'columns'))

    const dom = await probe([structureBaseCss()], html)
    // 트랙에 `var()`가 끼어 있지 않다 — 읽을 노드 변수가 없다는 것의 다른 표현이다.
    expect(dom.computed('[data-wb-component="List"]', 'grid-template-columns')).not.toContain('var(')
  })
})

describe('List:stackedList', () => {
  it('items 수만큼 item 조각을 내고 각 줄이 title·meta를 갖는다', () => {
    const html = render('List', 'stackedList', { items: 3 })
    expect(html).toContain('data-wb-structure="stackedList"')
    expect(countOf(html, 'item')).toBe(3)
    expect(countOf(html, 'title')).toBe(3)
    expect(countOf(html, 'meta')).toBe(3)
  })

  it('media 조각을 내지 않는다 — cardGrid와 갈리는 지점이다', () => {
    const stacked = parts(render('List', 'stackedList', { items: 2 }))
    expect(stacked.length).toBeGreaterThan(0)
    expect(stacked).not.toContain('media')

    // 대조군. 없으면 위가 "아무것도 안 그린다"로도 설명된다.
    expect(parts(render('List', 'cardGrid', { items: 2 }))).toContain('media')
  })

  it('목록 마크업으로 그린다 — cardGrid는 그렇지 않다', () => {
    // **DOM의 차이가 구조의 차이다.** 줄 목록은 `<ul>/<li>`가 그 뜻을 그대로 나르고
    // (읽는 도구도 그렇게 읽는다), 카드 그리드는 트랙을 CSS가 정하므로 `<div>`다.
    expect(render('List', 'stackedList', { items: 2 })).toContain('<ul ')
    expect(render('List', 'cardGrid', { items: 2 })).not.toContain('<ul ')
  })

  it('pagination이 켜졌을 때만 pagination 조각이 나온다 — 조건부 조각', () => {
    expect(countOf(render('List', 'stackedList', { pagination: true }), 'pagination')).toBe(1)
    expect(countOf(render('List', 'stackedList', { pagination: false }), 'pagination')).toBe(0)
  })

  it('items가 0이면 줄이 하나도 없다', () => {
    const html = render('List', 'stackedList', { items: 0 })
    // 폴백이 그려져도 `item`은 0이다 — 구조가 실제로 그려졌다는 것을 먼저 못박는다.
    expect(html).toContain('data-wb-structure="stackedList"')
    expect(countOf(html, 'item')).toBe(0)
  })

  it('쓰는 조각 이름이 전부 카탈로그에 선언돼 있다', () => {
    expect(undeclared('List', render('List', 'stackedList'))).toEqual([])
  })

  /**
   * **이름 있는 판정 — 이 구조는 기본 CSS를 갖지 않는다.**
   *
   * 기본 CSS의 몫은 *"구조가 서기 위한 최소 선언"*이다. `cardGrid`는 `display:grid`가
   * 없으면 그리드가 아니라 세로 목록이 되어 **다른 구조와 구별되지 않으므로** 규칙이 필요하다.
   * 줄 목록은 반대다 — `<ul>/<li>`의 기본 흐름이 이미 그 구조이고, 여기서 여백·구분선을
   * 정하면 그것은 외형이라 테마의 몫이다.
   *
   * 누가 여기에 규칙을 더하면 이 케이스가 깨지고 그때 위 판정을 다시 읽게 된다.
   */
  it('구조 기본 CSS에 stackedList를 겨냥하는 규칙이 없다', () => {
    expect(structureBaseCss()).not.toContain('[data-wb-structure="stackedList"]')
    // 대조군 — 같은 그룹의 `cardGrid`는 갖는다. 문자열이 안 맞아 못 찾는 것이 아니다.
    expect(structureBaseCss()).toContain('[data-wb-structure="cardGrid"]')
  })
})

describe('List:mediaList', () => {
  it('줄마다 media와 body를 내고 body 안에 title·meta가 들어간다', async () => {
    const html = render('List', 'mediaList', { items: 3 })
    expect(html).toContain('data-wb-structure="mediaList"')
    expect(countOf(html, 'item')).toBe(3)
    expect(countOf(html, 'media')).toBe(3)
    expect(countOf(html, 'body')).toBe(3)
    expect(await count(html, '[data-wb-part="body"] [data-wb-part="title"]')).toBe(3)
    expect(await count(html, '[data-wb-part="body"] [data-wb-part="meta"]')).toBe(3)
  })

  /**
   * **`body`를 새로 선언한 이유가 이 케이스다.**
   *
   * `media`가 `body` **밖**에 있어야 *"미디어 옆에 글묶음"*을 테마가 표현할 수 있다.
   * 감싸는 것이 없으면 `media`·`title`·`meta`가 셋 다 형제라, item에 flex든 grid든
   * 무엇을 걸어도 **셋이 한 축을 나눠 갖는다** — 글 두 줄만 세로로 쌓을 방법이 없다.
   *
   * 구조가 지는 몫은 *"그 배치를 표현 가능하게 만드는 것"*까지이고 실제 배치는 테마다
   * (계약: *"구조는 와이어프레임이다 … 외형은 테마가 준다"*).
   */
  it('media는 body 밖에 있다 — item의 직계 자식 둘이 media와 body다', async () => {
    const html = render('List', 'mediaList', { items: 2 })
    expect(await count(html, '[data-wb-part="item"] > [data-wb-part="media"]')).toBe(2)
    expect(await count(html, '[data-wb-part="item"] > [data-wb-part="body"]')).toBe(2)
    // 안에 있으면 위 두 줄이 다 참이어도 배치가 안 되므로 여기서 못박는다.
    expect(await count(html, '[data-wb-part="body"] [data-wb-part="media"]')).toBe(0)
  })

  it('cardGrid는 body를 쓰지 않는다 — 감싸개가 필요한 것은 가로 분할뿐이다', async () => {
    const html = render('List', 'cardGrid', { items: 2 })
    expect(countOf(html, 'body')).toBe(0)
    // 세로로 흐르는 카드에서는 media·title·meta가 형제인 채로 충분하다.
    expect(await count(html, '[data-wb-part="item"] > [data-wb-part="title"]')).toBe(2)
  })

  it('body가 카탈로그에 선언돼 있다 — 쓰는 조각 전부가 그렇다', () => {
    expect(requireComponent('List').parts).toContain('body')
    expect(undeclared('List', render('List', 'mediaList'))).toEqual([])
  })

  it('pagination이 켜졌을 때만 pagination 조각이 나온다 — 조건부 조각', () => {
    expect(countOf(render('List', 'mediaList', { pagination: true }), 'pagination')).toBe(1)
    expect(countOf(render('List', 'mediaList', { pagination: false }), 'pagination')).toBe(0)
  })

  it('items가 0이면 줄이 하나도 없다', () => {
    const html = render('List', 'mediaList', { items: 0 })
    expect(html).toContain('data-wb-structure="mediaList"')
    expect(countOf(html, 'item')).toBe(0)
  })

  /**
   * **`mediaList`는 구조 기본 CSS를 갖는다 — `:where()`로 좁혀서.**
   *
   * 조각 규칙에 구조 이름을 맨 셀렉터로 넣으면 (0,3,0)이 되어 `compileTheme`의 조각
   * 규칙(0,2,0)을 이기고 **그 컴포넌트에서만 테마가 진다.** 구조 없이 걸면
   * `cardGrid`·`stackedList`의 `item`까지 받아 카드 안이 가로로 눕는다.
   *
   * `partRule`의 넷째 인자가 `:where()`로 구조를 가린다. `:where()`는 특이도가 0이라
   * **(0,2,0)을 지키면서** 구조를 좁힌다.
   *
   * **아래 셋을 함께 본다.** 규칙이 생겼다는 것만 보면 좁히기가 풀려도 초록이다.
   */
  it('구조 기본 CSS가 mediaList를 :where()로 좁혀 겨냥한다', () => {
    const css = structureBaseCss()
    const targeting = css
      .split('\n')
      .filter((line) => line.endsWith('{') && line.includes('[data-wb-structure="mediaList"]'))
      .map((line) => line.slice(0, -1).trim())

    // (1) `item`(가로 분할)과 `media`(빈 상자의 크기) 둘이다.
    expect(targeting).toEqual([
      '[data-wb-component="List"]:where([data-wb-structure="mediaList"]) [data-wb-part="item"]',
      '[data-wb-component="List"]:where([data-wb-structure="mediaList"]) [data-wb-part="media"]',
    ])
    // (2) 구조 이름이 **`:where()` 안에만** 나온다 — 맨 셀렉터로 새면 테마가 진다.
    expect(css).not.toContain('] [data-wb-structure="mediaList"]')
    for (const selector of targeting) {
      expect(selector.replace(/:where\([^)]*\)/g, '').match(/\[[^\]]+\]/g)).toHaveLength(2)
    }
    // (3) `cardGrid`를 겨냥하는 규칙도 그대로 있다.
    expect(css).toContain('[data-wb-structure="cardGrid"]')
  })

  /**
   * **모양이 아니라 효과를 잰다.** 위 케이스는 셀렉터 문자열을 보고, 여기는 **테마 없이**
   * 구조 기본 CSS만 깐 화면에서 계산된 값을 본다 — *"테마가 없어도 구조가 선다"*가
   * 이 규칙들의 존재 이유이므로 그것을 직접 확인하는 자리가 있어야 한다.
   *
   * **대조군이 `stackedList`다.** `mediaList`가 그것과 갈리는 지점이 정확히 가로 분할이라,
   * 좁히기가 풀리면 여기서 `stackedList`의 줄까지 flex가 되어 죽는다.
   */
  it('테마 없이도 mediaList의 줄이 가로로 선다 — stackedList는 그대로다', async () => {
    const styled = async (structure: string, selector: string, prop: string) => {
      const html = render('List', structure, { items: 2 })
      const { JSDOM } = await import('jsdom')
      const dom = new JSDOM(
        `<!doctype html><html><head><style>${structureBaseCss()}</style></head>` +
          `<body>${html}</body></html>`,
      )
      const el = dom.window.document.querySelector(selector)!
      return dom.window.getComputedStyle(el).getPropertyValue(prop)
    }

    expect(await styled('mediaList', '[data-wb-part="item"]', 'display')).toBe('flex')
    expect(await styled('mediaList', '[data-wb-part="media"]', 'width')).toBe('25%')
    expect(await styled('mediaList', '[data-wb-part="media"]', 'aspect-ratio')).toBe('1 / 1')

    // 대조군 — 같은 이름의 조각을 내지만 이 선언을 받으면 안 된다.
    expect(await styled('stackedList', '[data-wb-part="item"]', 'display')).not.toBe('flex')
    expect(await styled('cardGrid', '[data-wb-part="item"]', 'display')).not.toBe('flex')
    expect(await styled('cardGrid', '[data-wb-part="media"]', 'width')).not.toBe('25%')
  })
})

describe('Tree:accordion', () => {
  const TREE = '[data-wb-component="Tree"]'

  it('items마다 최상위 마디를 내고 마디마다 toggle·label이 있다', async () => {
    const html = render('Tree', 'accordion', { items: ['가', '나', '다'], depth: 1 })
    expect(html).toContain('data-wb-structure="accordion"')
    expect(await count(html, `${TREE} > [data-wb-part="node"]`)).toBe(3)
    expect(countOf(html, 'toggle')).toBe(3)
    expect(countOf(html, 'label')).toBe(3)
  })

  /**
   * **`panel`을 새로 선언한 이유.** 아코디언의 본체는 *"머리줄을 눌러 접었다 펴는 묶음"*
   * 이고, 그 묶음이 DOM에 없으면 `indent`와 구별되는 것이 화살표 글자 하나뿐이다.
   * 이름은 `Tabs`의 `panel`과 같다 — 조각 어휘를 컴포넌트마다 새로 만들지 않는다.
   */
  it('첫 마디만 펴져 있고 그 안에 panel이 있다 — 조건부 조각', async () => {
    const html = render('Tree', 'accordion', { items: ['가', '나', '다'], depth: 2 })
    expect(countOf(html, 'panel')).toBe(1)
    expect(await count(html, `${TREE} > [data-wb-part="node"] > [data-wb-part="panel"]`)).toBe(1)
    // 접힌 마디에는 없다 — 첫째에만 붙었다는 것의 다른 표현이다.
    expect(await count(html, `${TREE} > [data-wb-part="node"]:nth-of-type(2) [data-wb-part="panel"]`))
      .toBe(0)
  })

  it('depth가 1이면 panel이 하나도 없다 — 펼 것이 없다', () => {
    const html = render('Tree', 'accordion', { items: ['가', '나'], depth: 1 })
    expect(html).toContain('data-wb-structure="accordion"')
    expect(countOf(html, 'panel')).toBe(0)
  })

  it('depth가 깊어지면 panel이 그만큼 중첩된다', async () => {
    const html = render('Tree', 'accordion', { items: ['가'], depth: 3 })
    expect(countOf(html, 'panel')).toBe(2)
    // 중첩이다 — 형제로 나열된 것이 아니다.
    expect(await count(html, '[data-wb-part="panel"] [data-wb-part="panel"]')).toBe(1)
    expect(await count(html, '[data-wb-part="panel"] > [data-wb-part="node"]')).toBe(2)
  })

  /**
   * **`indent`와 갈리는 지점은 깊이를 무엇이 나르는가다.**
   *
   * `indent`는 단계를 `--wb-node-tree-level`로 실어 보내고 구조 기본 CSS가 그것에
   * 들여쓰기 폭을 곱한다. 아코디언은 **DOM 중첩이 깊이 그 자체**이므로 그 값을 싣지
   * 않는다 — 실으면 중첩과 곱셈이 겹쳐 두 번 들여쓴다.
   *
   * `partRule('Tree','node', …)`은 구조를 가리지 않으므로 아코디언의 마디에도 걸리지만,
   * 값을 안 실으면 `var()`의 기본값 0이 되어 **0px가 된다.** `structure-css-tools`의
   * `partRule` 주석이 예고한 그 자리이고, 여기가 그 예고의 실측이다.
   */
  it('아코디언은 단계 변수를 싣지 않는다 — indent는 싣는다', () => {
    const accordion = render('Tree', 'accordion', { items: ['가', '나'], depth: 3 })
    // 폴백에는 어차피 변수가 없다 — 구조가 실제로 그려졌다는 것을 먼저 못박는다.
    expect(accordion).toContain('data-wb-structure="accordion"')
    expect(accordion).not.toContain(nodeVar('tree', 'level'))

    // 대조군. 없으면 위가 "Tree가 원래 아무 변수도 안 싣는다"로도 설명된다.
    expect(render('Tree', 'indent', { items: ['가', '나'], depth: 3 })).toContain(
      nodeVar('tree', 'level'),
    )
  })

  it('panel이 카탈로그에 선언돼 있다 — 쓰는 조각 전부가 그렇다', () => {
    expect(requireComponent('Tree').parts).toContain('panel')
    expect(undeclared('Tree', render('Tree', 'accordion', { items: ['가'], depth: 3 }))).toEqual([])
  })

  it('items가 비면 마디가 하나도 없다', async () => {
    const html = render('Tree', 'accordion', { items: [] })
    expect(html).toContain('data-wb-structure="accordion"')
    expect(await count(html, '[data-wb-part="node"]')).toBe(0)
  })
})

const PAIRS = [
  { key: '이름', value: '홍길동' },
  { key: '부서', value: '기획' },
  { key: '직급', value: '팀장' },
]

describe('KeyValue:definitionList', () => {
  it('pairs마다 row를 내고 그 안에 key·value가 들어간다', async () => {
    const html = render('KeyValue', 'definitionList', { pairs: PAIRS })
    expect(html).toContain('data-wb-structure="definitionList"')
    expect(countOf(html, 'row')).toBe(3)
    expect(await count(html, '[data-wb-part="row"] > [data-wb-part="key"]')).toBe(3)
    expect(await count(html, '[data-wb-part="row"] > [data-wb-part="value"]')).toBe(3)
    expect(html).toContain('홍길동')
  })

  /**
   * **`table`과 갈리는 지점은 마크업의 뜻이다.**
   *
   * 둘 다 조각 이름이 `row`·`key`·`value`로 같다 — 재는 것이 같기 때문이다. 다른 것은
   * 그 뜻을 무엇이 나르느냐다: `table`은 행렬의 한 칸(`<th>`/`<td>`), 정의 목록은
   * **용어와 그 뜻**(`<dt>`/`<dd>`)이다. 읽는 도구에도 그렇게 전달된다.
   *
   * `<dl>` 안에서 `<div>`로 쌍을 감싸는 것은 HTML이 허용한다 — `row` 조각을 유지하면서
   * `<dt>`/`<dd>` 짝을 묶는 유일한 방법이다.
   */
  it('dl·dt·dd로 그린다 — table은 table·th·td다', () => {
    const definitionList = render('KeyValue', 'definitionList', { pairs: PAIRS })
    expect(definitionList).toContain('<dl ')
    expect(definitionList).toContain('<dt ')
    expect(definitionList).toContain('<dd ')

    // 대조군. 같은 노드를 table로 그리면 표 마크업이 나온다.
    const table = render('KeyValue', 'table', { pairs: PAIRS })
    expect(table).toContain('<table ')
    expect(table).not.toContain('<dt ')
  })

  it('pairs가 비면 row가 하나도 없다', () => {
    const html = render('KeyValue', 'definitionList', { pairs: [] })
    expect(html).toContain('data-wb-structure="definitionList"')
    expect(countOf(html, 'row')).toBe(0)
  })

  it('쓰는 조각 이름이 전부 카탈로그에 선언돼 있다 — 새 이름을 만들지 않았다', () => {
    const html = render('KeyValue', 'definitionList', { pairs: PAIRS })
    expect(undeclared('KeyValue', html)).toEqual([])
    expect([...new Set(parts(html))].sort()).toEqual(['key', 'row', 'value'])
  })

  it('구조 기본 CSS에 definitionList를 겨냥하는 규칙이 없다', () => {
    // `<dl>/<dt>/<dd>`의 기본 흐름이 이미 이 구조다. 여백·정렬은 외형이라 테마의 몫이다.
    expect(structureBaseCss()).not.toContain('[data-wb-structure="definitionList"]')
    expect(structureBaseCss()).toContain('[data-wb-structure="cardGrid"]')
  })
})

describe('KeyValue:cardGrid', () => {
  const KV = '[data-wb-component="KeyValue"]'

  it('pairs마다 row를 내고 그 안에 key·value가 들어간다', async () => {
    const html = render('KeyValue', 'cardGrid', { pairs: PAIRS })
    expect(html).toContain('data-wb-structure="cardGrid"')
    expect(countOf(html, 'row')).toBe(3)
    expect(await count(html, '[data-wb-part="row"] > [data-wb-part="key"]')).toBe(3)
    expect(await count(html, '[data-wb-part="row"] > [data-wb-part="value"]')).toBe(3)
  })

  it('쓰는 조각 이름이 전부 카탈로그에 선언돼 있다 — 새 이름을 만들지 않았다', () => {
    const html = render('KeyValue', 'cardGrid', { pairs: PAIRS })
    expect(undeclared('KeyValue', html)).toEqual([])
    expect([...new Set(parts(html))].sort()).toEqual(['key', 'row', 'value'])
  })

  /**
   * **같은 이름의 구조인데 열 수의 답이 `List:cardGrid`와 다르다. 그것이 요점이다.**
   *
   * `KeyValue.columns`는 **수**(`1..4`)이고 `visibleWhen`이 없어 패널에서 늘 닿는다.
   * 즉 여기서는 **노드가 열 수를 정할 수 있다** — `List.columns`(컬럼 **이름** 목록,
   * `table`에서만 보임)와 정반대다.
   *
   * 그래서 여기에만 손잡이를 만든다: `--wb-node-keyvalue-columns`.
   */
  it('노드가 열 수를 커스텀 프로퍼티로 싣고 기본 CSS가 그것으로 트랙을 만든다', async () => {
    const dom = await probe([structureBaseCss()], render('KeyValue', 'cardGrid', { columns: 3 }))
    expect(dom.computed(KV, nodeVar('keyvalue', 'columns'))).toBe('3')
    expect(dom.computed(KV, 'display')).toBe('grid')
    expect(dom.computed(KV, 'grid-template-columns')).toBe(
      `repeat(var(${nodeVar('keyvalue', 'columns')}, 1), 1fr)`,
    )
  })

  it('style에는 커스텀 프로퍼티만 싣는다', () => {
    const declarations = [
      ...render('KeyValue', 'cardGrid', { columns: 4 }).matchAll(/\sstyle="([^"]*)"/g),
    ]
      .flatMap((match) => match[1]!.split(';'))
      .map((declaration) => declaration.trim())
      .filter((declaration) => declaration !== '')

    expect(declarations.length).toBeGreaterThan(0)
    expect(declarations.filter((declaration) => !declaration.startsWith('--'))).toEqual([])
  })

  it('table·definitionList는 그 변수를 싣지 않는다 — 열 수는 이 구조만의 것이다', () => {
    for (const structure of ['table', 'definitionList']) {
      const html = render('KeyValue', structure, { pairs: PAIRS, columns: 3 })
      expect(html, structure).toContain(`data-wb-structure="${structure}"`)
      expect(html, structure).not.toContain(nodeVar('keyvalue', 'columns'))
    }
    // 대조군 — 같은 노드를 cardGrid로 그리면 실린다.
    expect(render('KeyValue', 'cardGrid', { columns: 3 })).toContain(nodeVar('keyvalue', 'columns'))
  })

  /**
   * **테마가 노드 손잡이를 덮으면 테마가 이긴다.**
   *
   * `STYLE_PROPERTIES`에 **컴포넌트 범위 개념이 없어** `gridColumns`가 `List:cardGrid`·
   * `Grid`·`KeyValue` 어디에나 열린다. 아래가 그 결과다: 노드는 `3`을 실었는데 **화면에는
   * 7열이 그려진다.** 테마가 이기는 것은 설계서 「components — 구조 + 스킨」대로 옳고,
   * **조용하지는 않다** — 테마 검증이 `node-handle-overwrite`(warning)로 알린다. 그 표는
   * `packages/themes/src/spec/handles.ts`의 `NODE_HANDLES`가 갖는다(`KeyValue`의
   * `grid-template-columns`가 들어 있다). 이 케이스는 렌더러 쪽 사실만 잰다.
   */
  it('테마가 노드의 열 수를 덮는다 — 노드의 값은 실려 있고 읽히지 않는다', async () => {
    const html = render('KeyValue', 'cardGrid', { columns: 3 })
    const themeRule =
      '[data-wb-component="KeyValue"][data-wb-structure="cardGrid"]' +
      ' { grid-template-columns: repeat(7, 1fr); }'

    const dom = await probe([structureBaseCss(), themeRule], html)
    // 노드의 값은 그대로 실려 있다 — 지워진 것이 아니라 **읽히지 않는다.**
    expect(dom.computed(KV, nodeVar('keyvalue', 'columns'))).toBe('3')
    expect(dom.computed(KV, 'grid-template-columns')).toBe('repeat(7, 1fr)')
  })

  it('pairs가 비면 row가 하나도 없다', () => {
    const html = render('KeyValue', 'cardGrid', { pairs: [] })
    expect(html).toContain('data-wb-structure="cardGrid"')
    expect(countOf(html, 'row')).toBe(0)
  })
})
