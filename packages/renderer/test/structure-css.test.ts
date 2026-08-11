import { installCatalog, requireComponent } from '@wirebound/schema'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { renderNode } from '../src/render'
import { NODE_VAR_PREFIX, TREE_INDENT_VAR, nodeVar, structureBaseCss } from '../src/structure-css'
import { installStructures } from '../src/structures/index'
import { listStructureKeys } from '../src/structures/registry'
import { probe } from './css-probe'

beforeAll(() => {
  installCatalog()
  installStructures()
})

/** 테마 CSS가 낼 셀렉터 모양. `compileTheme`의 `pushComponent`가 이 꼴을 만든다. */
function themeRule(type: string, structure: string, body: string): string {
  return `[data-wb-component="${type}"][data-wb-structure="${structure}"] { ${body} }`
}

/** 노드 하나를 실제로 그려 구조 기본 CSS 아래에 넣는다. */
async function renderedProbe(type: string, props: Record<string, unknown>, extraSheets: string[] = []) {
  const html = renderToStaticMarkup(renderNode({ id: 'n_000000000001', type, props }))
  return probe([structureBaseCss(), ...extraSheets], html)
}

describe('Task 1 — 캐스케이드 층을 무엇으로 할지 잰 결과', () => {
  /**
   * **(A) `@layer`를 고르지 않은 이유가 이 케이스다.**
   *
   * jsdom 25의 CSS 파서는 `@layer`를 모른다. 모르는 것에서 끝나지 않고 **그 규칙이 든
   * 시트를 통째로 버린다** — 아래에서 `@layer` 밖에 있는 `.plain`까지 함께 죽고
   * `style.sheet`가 `null`이 된다. 즉 `@layer`로 가면 이 저장소의 자동 테스트는
   * 층 순서를 재기는커녕 **CSS가 먹히는지조차 잴 수 없다.**
   *
   * 나중에 누가 (A)로 바꾸려 하면 이 케이스가 근거다. 바꾸려면 먼저 이것을 반증해야 한다
   * (jsdom이 `@layer`를 지원하게 되거나, 실제 브라우저로 재는 수단이 생기거나).
   */
  it('jsdom은 @layer가 든 시트를 통째로 버린다 — 그래서 층이 아니라 순서로 간다', async () => {
    const withLayer = await probe(
      ['.plain { display: flex; }\n@layer a { .x { display: grid; } }'],
      '<div class="plain"></div>',
    )
    expect(withLayer.ruleCount()).toBe('sheet-missing')
    // `@layer` 밖의 규칙도 함께 죽는다 — 초기값이 그대로 남는다.
    expect(withLayer.computed('.plain', 'display')).toBe('block')

    // 대조군: 같은 규칙만 두면 산다. 위가 "jsdom이 원래 아무것도 못 잰다"가 아님을 못박는다.
    const withoutLayer = await probe(['.plain { display: flex; }'], '<div class="plain"></div>')
    expect(withoutLayer.ruleCount()).toBe(1)
    expect(withoutLayer.computed('.plain', 'display')).toBe('flex')
  })

  it('같은 특이도에서는 나중에 온 규칙이 이긴다 — 한 시트 안', async () => {
    const forward = await probe(['.x { display: flex; }\n.x { display: grid; }'], '<div class="x"></div>')
    const backward = await probe(['.x { display: grid; }\n.x { display: flex; }'], '<div class="x"></div>')
    expect(forward.computed('.x', 'display')).toBe('grid')
    expect(backward.computed('.x', 'display')).toBe('flex')
  })

  /** D5의 전제. 시트를 둘로 나눠도 한 문자열 안의 순서와 결과가 같아야 한다. */
  it('시트를 둘로 나눠도 순서의 결과가 같다', async () => {
    const forward = await probe(['.x { display: flex; }', '.x { display: grid; }'], '<div class="x"></div>')
    const backward = await probe(['.x { display: grid; }', '.x { display: flex; }'], '<div class="x"></div>')
    expect(forward.computed('.x', 'display')).toBe('grid')
    expect(backward.computed('.x', 'display')).toBe('flex')
  })

  /**
   * **P0 이월 #7이 화면에서 어떻게 나타나는지.** 지금 `FlexDefault`가 내는 것과 같은
   * inline 선언을 두면 테마가 진다 — `!important` 없이는 이길 수 없다는 그 문장의 실측이다.
   * Task 2가 이 inline 선언을 걷어내면 아래 "테마가 이긴다" 케이스가 성립한다.
   */
  it('inline 일반 선언은 테마를 이긴다 — 걷어내야 하는 이유', async () => {
    const dom = await probe(
      [themeRule('Flex', 'default', 'display: grid;')],
      '<div data-wb-component="Flex" data-wb-structure="default" style="display:flex"></div>',
    )
    expect(dom.computed('[data-wb-component="Flex"]', 'display')).toBe('flex')
  })

  /**
   * **D2의 근거.** 커스텀 프로퍼티만 실린 inline style은 캐스케이드에서 이길 것이 없다 —
   * 그 자체로는 아무것도 그리지 않기 때문이다. 위 케이스와 같은 자리에서 결과가 뒤집힌다.
   */
  it('커스텀 프로퍼티만 실린 inline style은 테마를 이기지 않는다', async () => {
    const dom = await probe(
      [themeRule('Flex', 'default', 'display: grid;')],
      '<div data-wb-component="Flex" data-wb-structure="default" style="--wb-node-flex-direction:column"></div>',
    )
    expect(dom.computed('[data-wb-component="Flex"]', 'display')).toBe('grid')
    // 값은 그대로 실려 있다 — 지운 것이 아니라 통로로 바꾼 것이다.
    expect(dom.computed('[data-wb-component="Flex"]', '--wb-node-flex-direction')).toBe('column')
  })
})

describe('Task 1 — structureBaseCss', () => {
  it('테마와 같은 모양의 셀렉터를 쓴다', () => {
    // 같은 특이도여야 순서가 우선순위가 된다. 구조 기본 CSS가 더 구체적인 셀렉터를 쓰면
    // 나중에 온 테마가 져서 이 계획 전체가 무너진다.
    expect(structureBaseCss()).toContain('[data-wb-component="Flex"][data-wb-structure="default"]')
  })

  it('!important를 쓰지 않는다', () => {
    expect(structureBaseCss()).not.toContain('!important')
  })

  /**
   * 재라 #5. 노드가 나르는 값의 이름은 전부 `--wb-node-` 아래에 있어야 한다 —
   * 테마가 `cssVarName`으로 만드는 이름(`--wb-grid-columns` 등)과 겹치지 않게 하는 것이
   * 이 접두어의 전부다. **두 이름 집합이 실제로 겹치지 않는 것은 두 패키지를 함께 볼 수
   * 있는 `apps/web/test/theme/system-theme.test.ts`의 `재라 #5` 절이 대조한다** —
   * `renderer`는 `themes`를 보지 않는다(§3.3).
   *
   * > **2026-08-11(P4c-1 수정 웨이브, 전수 훑기): 여기가 `var-names.test.ts`를 가리키고
   * > 있었고 그런 파일은 저장소에 없다.** F4(`themes-warning-routes.test.ts`)와 **같은
   * > 부류**이고, 이쪽은 **P4c-1이 만든 것이 아니라 `05bfd1a`부터 있던 것**이다(내가
   * > 이력으로 확인했다). 대조 자체는 살아 있었다 — **이름만 어긋나 있었다.**
   */
  it('노드가 나르는 커스텀 프로퍼티는 전부 --wb-node- 아래에 있다', () => {
    // 노드가 나르지 **않는** 이름은 여기 적어 둔다. 이름이 있으므로 썩지 않는다 —
    // 새 이름이 생기면 이 케이스가 깨지고, 여기 적힌 것이 사라져도 깨진다.
    const NOT_NODE_CARRIED = [TREE_INDENT_VAR]

    const names = [...structureBaseCss().matchAll(/--[\w-]+/g)].map((match) => match[0])
    expect(names.length).toBeGreaterThan(0)
    const offenders = names.filter(
      (name) => !name.startsWith(NODE_VAR_PREFIX) && !NOT_NODE_CARRIED.includes(name),
    )
    expect(offenders).toEqual([])
    // 목록이 실제로 쓰이는지 — 비어 버리면 위 필터가 아무것도 안 걸러도 초록이다.
    expect(names).toContain(TREE_INDENT_VAR)
  })

  it('jsdom이 파싱할 수 있는 CSS다', async () => {
    const dom = await probe([structureBaseCss()], '<div></div>')
    expect(dom.ruleCount()).not.toBe('sheet-missing')
    expect(dom.ruleCount()).toBeGreaterThan(0)
  })

  it('Flex 노드에 display:flex를 준다', async () => {
    const dom = await probe(
      [structureBaseCss()],
      '<div data-wb-component="Flex" data-wb-structure="default"></div>',
    )
    expect(dom.computed('[data-wb-component="Flex"]', 'display')).toBe('flex')
  })

  /**
   * **이 케이스가 이 계획 전체의 성공 판정이다.** 구조 기본 CSS가 낸 `display:flex`를
   * 테마 CSS의 `display:grid`가 `!important` 없이 덮는다. §6.0의 약속(*"같은 페이지
   * 스키마가 테마에 따라 데이터 테이블로도, 카드 그리드로도"*)이 여기에 걸려 있다.
   */
  it('테마 CSS가 구조 기본 CSS를 덮는다 — !important 없이', async () => {
    const html = '<div data-wb-id="n_000000000001" data-wb-component="Flex" data-wb-structure="default"></div>'

    // **덮는 것을 재려면 먼저 덮일 것이 있어야 한다.** 이 줄이 없으면 구조 기본 CSS가
    // 아예 안 맞을 때도 케이스가 초록이 된다 — 셀렉터에 `[data-wb-id]`를 더해 특이도를
    // 올려 봤더니 실제로 그랬다(기본 CSS가 안 맞으니 테마가 거저 이겼다).
    const baseOnly = await probe([structureBaseCss()], html)
    expect(baseOnly.computed('[data-wb-component="Flex"]', 'display')).toBe('flex')

    const both = await probe([structureBaseCss(), themeRule('Flex', 'default', 'display: grid;')], html)
    expect(both.computed('[data-wb-component="Flex"]', 'display')).toBe('grid')
  })
})

/**
 * **값이 실제로 노드까지 흘러가는지.** 계획서가 *"계산된 스타일까지 간다"*를 요구하는데,
 * jsdom은 `var()`를 치환하지 못한다(`css-probe.ts`의 표) — 그래서 **두 조각으로 나눠 잰다.**
 *
 * 1. 노드에 커스텀 프로퍼티가 그 값으로 실렸는가 (계산된 스타일로 읽는다 — jsdom이 한다)
 * 2. 구조 기본 CSS의 선언이 그 이름을 가리키는가 (계산된 스타일이 `var(…)` 문자열로 나온다)
 *
 * 마지막 치환 한 걸음(브라우저가 1을 2에 꽂는 것)은 **이 저장소의 자동 테스트가 재지
 * 못한다.** 실제 브라우저로 따로 쟀고 그 결과는 이월 문서에 적는다.
 */
describe('Task 2 — Flex·Grid의 값이 커스텀 프로퍼티로 흘러간다', () => {
  it('Flex의 네 prop이 전부 노드에 실린다', async () => {
    const dom = await renderedProbe('Flex', {
      direction: 'column',
      align: 'center',
      justify: 'between',
      wrap: true,
    })
    const flex = '[data-wb-component="Flex"]'
    expect(dom.computed(flex, nodeVar('flex', 'direction'))).toBe('column')
    expect(dom.computed(flex, nodeVar('flex', 'align'))).toBe('center')
    // `between`은 CSS 키워드가 아니다 — 대응이 없는 유일한 값이라 렌더러가 바꾼다.
    expect(dom.computed(flex, nodeVar('flex', 'justify'))).toBe('space-between')
    expect(dom.computed(flex, nodeVar('flex', 'wrap'))).toBe('wrap')
  })

  it('구조 기본 CSS가 그 이름들을 읽는다', async () => {
    const dom = await renderedProbe('Flex', { direction: 'column' })
    const flex = '[data-wb-component="Flex"]'
    expect(dom.computed(flex, 'display')).toBe('flex')
    expect(dom.computed(flex, 'flex-direction')).toBe(`var(${nodeVar('flex', 'direction')}, row)`)
    expect(dom.computed(flex, 'align-items')).toBe(`var(${nodeVar('flex', 'align')}, stretch)`)
    expect(dom.computed(flex, 'justify-content')).toBe(`var(${nodeVar('flex', 'justify')}, start)`)
    expect(dom.computed(flex, 'flex-wrap')).toBe(`var(${nodeVar('flex', 'wrap')}, nowrap)`)
  })

  it('Flex의 정렬 값은 flex-start가 아니라 start로 나간다', async () => {
    // §6.0이 약속한 것 — 테마가 `display`를 grid로 덮을 수 있다. `flex-start`는 flexbox
    // 밖에서 뜻이 흐려지고 `start`는 상자 정렬 어느 문맥에서나 같다.
    const dom = await renderedProbe('Flex', { align: 'start', justify: 'start' })
    const flex = '[data-wb-component="Flex"]'
    expect(dom.computed(flex, nodeVar('flex', 'align'))).toBe('start')
    expect(dom.computed(flex, nodeVar('flex', 'justify'))).toBe('start')
  })

  it('Grid의 열 수가 노드에 실리고 기본 CSS가 그것으로 트랙을 만든다', async () => {
    const dom = await renderedProbe('Grid', { columns: 3 })
    const grid = '[data-wb-component="Grid"]'
    expect(dom.computed(grid, nodeVar('grid', 'columns'))).toBe('3')
    expect(dom.computed(grid, 'display')).toBe('grid')
    expect(dom.computed(grid, 'grid-template-columns')).toBe(
      `repeat(var(${nodeVar('grid', 'columns')}, 1), 1fr)`,
    )
  })

  it('테마가 Flex의 display를 grid로 덮어도 노드의 값은 그대로 있다', async () => {
    const dom = await renderedProbe('Flex', { direction: 'column' }, [
      themeRule('Flex', 'default', 'display: grid;'),
    ])
    const flex = '[data-wb-component="Flex"]'
    expect(dom.computed(flex, 'display')).toBe('grid')
    expect(dom.computed(flex, nodeVar('flex', 'direction'))).toBe('column')
  })
})

describe('Task 3 — Tree·Media·Placeholder', () => {
  /**
   * **Tree가 다르다.** inline style이 노드가 아니라 `part('node')`인 `<li>`마다 붙는다.
   * 그래서 커스텀 프로퍼티도 그 `<li>`에 실리고, 기본 CSS는 조각 셀렉터로 읽는다.
   *
   * 조각 규칙의 셀렉터에 `[data-wb-structure]`를 넣지 **않는다** — `compileTheme`의
   * 조각 규칙이 `[data-wb-component="X"] [data-wb-part="p"]`(특이도 0,2,0)이므로, 여기에
   * 구조를 더하면 0,3,0이 되어 테마가 진다. 대가는 P4b의 `Tree:accordion`이 같은 규칙을
   * 받는다는 것이고, 그때 `--wb-node-tree-level`을 안 실으면 기본값 0이 적용된다.
   */
  it('Tree의 들여쓰기 단계가 li마다 실린다', async () => {
    const dom = await renderedProbe('Tree', { items: ['가', '나', '다', '라'], depth: 3 })
    // (index % depth) — 0,1,2,0
    const levels = ['0', '1', '2', '0']
    for (const [index, level] of levels.entries()) {
      expect(dom.computed(`li:nth-of-type(${index + 1})`, nodeVar('tree', 'level')), `li ${index}`).toBe(level)
    }
  })

  it('기본 CSS가 단계와 들여쓰기 폭을 곱해 padding-left를 만든다', async () => {
    const dom = await renderedProbe('Tree', {})
    expect(dom.computed('li', 'padding-left')).toBe(
      `calc(var(${nodeVar('tree', 'level')}, 0) * var(--wb-tree-indent, 16px))`,
    )
  })

  it('Media의 비율이 frame 조각에 실리고 기본 CSS가 그것을 읽는다', async () => {
    const dom = await renderedProbe('Media', { ratio: '4/3' })
    const frame = '[data-wb-part="frame"]'
    expect(dom.computed(frame, nodeVar('media', 'ratio'))).toBe('4/3')
    expect(dom.computed(frame, 'aspect-ratio')).toBe(`var(${nodeVar('media', 'ratio')}, 16/9)`)
  })

  it('Placeholder의 높이가 노드에 실리고 기본 CSS가 그것을 읽는다', async () => {
    const dom = await renderedProbe('Placeholder', { height: 240 })
    const placeholder = '[data-wb-component="Placeholder"]'
    // 길이 단위까지 렌더러가 붙인다 — 기본 CSS가 `calc(var(…) * 1px)`을 쓰면 그 곱셈이
    // 테마가 값을 덮을 때도 남아 `height: 300px`을 준 테마가 무효한 값을 만든다.
    expect(dom.computed(placeholder, nodeVar('placeholder', 'height'))).toBe('240px')
    expect(dom.computed(placeholder, 'height')).toBe(`var(${nodeVar('placeholder', 'height')}, 120px)`)
  })

  it('테마가 Placeholder의 높이를 덮는다', async () => {
    const dom = await renderedProbe('Placeholder', { height: 240 }, [
      themeRule('Placeholder', 'default', 'height: 400px;'),
    ])
    expect(dom.computed('[data-wb-component="Placeholder"]', 'height')).toBe('400px')
  })
})

/**
 * **조각 규칙을 누가 받는가 — 수신자 표.** P4b-2 ③이 만들었다.
 *
 * **왜 이 표가 있어야 하는가.** 조각 규칙은 셀렉터에 구조가 안 들어가는 것이 기본이므로
 * (특이도 (0,2,0)을 지켜야 테마가 이긴다) **그 조각을 내는 다른 구조도 규칙을 받는다.**
 * 그 자체는 대가로 받아들인 것인데, **누가 받는지가 코드 어디에도 안 적혀 있었다.**
 * 그래서 구조가 하나 늘어 남의 규칙을 받기 시작해도 **아무 케이스도 안 죽는다.**
 *
 * **P4b-2 ②가 그 부류를 실제로 만들었다.** `List:cardGrid`를 만들며 더한
 * `pagination` 규칙이 `table`·`stackedList`·`mediaList`까지 갔고(③이 Chromium으로
 * 재서 무해함까지 확인했다), `Tree:accordion`은 `indent`의 들여쓰기 규칙을 받았다.
 *
 * **③이 그 둘을 `:where()`로 좁혔고, 이 표가 그것이 되돌아가는 것을 막는다.**
 * 표를 안 고치고 구조를 더하면 여기서 죽는다 — *"발견된 것만 닫으면 매번 하나가
 * 남는다"*(P4a-3)에 대한 이 자리의 답이다.
 *
 * **재는 방법:** 실제로 그린 HTML에 실제 셀렉터를 걸어 본다. 조각 이름을 눈으로 세지
 * 않는 것은 **자식이 있어야만 나오는 조각**이 있어서다(그래서 자식을 단다).
 */
describe('P4b-2 ③ — 조각 규칙의 수신자', () => {
  /**
   * `컴포넌트 [조각]` → 그 규칙을 **실제로 받는 구조 전부**.
   *
   * 늘리려면 근거가 있어야 한다: 받는 구조 전부가 그 선언을 원하는가?
   * 아니면 `partRule`의 넷째 인자로 좁혀라.
   */
  const RECEIVERS: Record<string, string[]> = {
    // 둘 다 미디어 상자를 원한다 — 좁히지 않는다.
    'Card [media]': ['mediaTop', 'horizontal'],
    // `:where(cardGrid)`로 좁혔다. 페이지네이션 조각 자체는 네 구조가 다 낸다.
    'List [pagination]': ['cardGrid'],
    // P4b-3 ②(commerce)가 더했다. `:where(mediaList)`로 좁혔다 — `item`은 네 구조 중
    // 셋이 내고(`table`만 안 낸다) `media`는 `cardGrid`도 낸다. 가로 분할과 썸네일 크기를
    // 원하는 것은 `mediaList` 하나뿐이라 좁혔다.
    'List [item]': ['mediaList'],
    'List [media]': ['mediaList'],
    // `:where(indent)`로 좁혔다. `accordion`은 중첩으로 들여쓰므로 단계 변수를 안 싣는다.
    'Tree [node]': ['indent'],
    // 넷 다 비율을 싣는다 — 좁히지 않는다. 하나라도 안 실으면 조용히 기본값으로 굳으므로
    // 규칙이 넷에 다 걸려 있는 편이 그 어긋남을 만들 자리를 없앤다.
    'Media [frame]': ['image', 'video', 'illustration', 'chart'],
  }

  it('구조 기본 CSS의 조각 규칙은 이 넷뿐이다', () => {
    const selectors = structureBaseCss()
      .split('\n')
      .filter((line) => line.endsWith('{') && line.includes('[data-wb-part='))
      .map((line) => line.slice(0, -1).trim())

    const names = selectors.map((selector) => {
      const type = /data-wb-component="(\w+)"/.exec(selector)![1]!
      const part = /data-wb-part="(\w+)"/.exec(selector)![1]!
      return `${type} [${part}]`
    })
    // 규칙이 새로 생기면 여기서 먼저 죽는다 — 수신자를 적으라는 뜻이다.
    expect([...names].sort()).toEqual([...Object.keys(RECEIVERS)].sort())
  })

  it('각 조각 규칙을 받는 구조가 표와 같다', async () => {
    const { JSDOM } = await import('jsdom')
    const selectors = structureBaseCss()
      .split('\n')
      .filter((line) => line.endsWith('{') && line.includes('[data-wb-part='))
      .map((line) => line.slice(0, -1).trim())

    const measured: Record<string, string[]> = {}
    for (const selector of selectors) {
      const type = /data-wb-component="(\w+)"/.exec(selector)![1]!
      const part = /data-wb-part="(\w+)"/.exec(selector)![1]!
      const hits: string[] = []

      for (const key of listStructureKeys().filter((k) => k.startsWith(`${type}:`))) {
        const structure = key.slice(type.length + 1)
        // **자식을 단다** — 자식을 감싸며 생기는 조각은 자식 없이는 안 나온다.
        const children =
          requireComponent(type).children === 'none'
            ? undefined
            : [
                { id: 'n_00000000000c', type: 'Text' },
                { id: 'n_00000000000d', type: 'Text' },
              ]
        const html = renderToStaticMarkup(
          renderNode({ id: 'n_000000000001', type, ...(children ? { children } : {}) } as never, {
            structures: { [type]: structure },
          }),
        )
        const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`)
        if (dom.window.document.querySelector(selector) !== null) hits.push(structure)
      }
      measured[`${type} [${part}]`] = hits
    }

    expect(measured).toEqual(RECEIVERS)
  })
})

/**
 * **특이도를 문자열로 잰다 — jsdom이 못 재는 것을 여기서 대신 막는다.** P4b-2 ③.
 *
 * **왜 필요한가.** 이 저장소가 캐스케이드를 두고 실측했다고 적은 모든 케이스는 계산된
 * 스타일을 jsdom으로 읽는데, **jsdom 25는 특이도를 아예 계산하지 않고 순서만 따른다.**
 * ③이 쟀다: `#v`(1,0,0)가 뒤에 온 `[data-wb-part]`(0,1,0)에게 진다. 대조 다섯(id vs 속성 ·
 * 속성 셋 vs 둘 · class vs 태그, 한 시트/두 시트)이 **전부 순서대로만** 갈렸다.
 *
 * **그래서 이런 일이 난다 — 실측이다.** `componentRule`의 셀렉터를
 * `[data-wb-component="X"][data-wb-component="X"][data-wb-structure="Y"]`로 바꾸면
 * (매칭은 한 글자도 안 변하고 특이도만 (0,2,0) → (0,3,0)) **실제 브라우저에서는 테마가
 * 진다**(Chromium 151: 테마의 `display: grid`가 구조의 `flex`에게 짐 — P4a-2 계획 전체가
 * 무너지는 그 고장이다). 그런데 **`--project unit`·`--project web` 1723건이 전부 초록이었다.**
 *
 * **이 케이스가 그 변이를 잡는다.** 브라우저 없이, 셀렉터 문자열만으로 잰다 — 우리가
 * 내는 셀렉터는 속성 선택자와 `:where()`뿐이라 특이도가 **셀 수 있다.**
 *
 * **`:where()`는 0으로 센다** — 그것이 `partRule`의 구조 범위가 성립하는 근거다.
 */
describe('P4b-2 ③ — 구조 기본 CSS의 특이도가 테마와 같다', () => {
  /** `:where(…)`를 걷어낸 뒤 남는 속성 선택자 수. 그것이 곧 특이도의 b 자리다. */
  function specificityB(selector: string): number {
    // `:where()` 안은 특이도 0이다 — 통째로 지운다.
    const bare = selector.replace(/:where\([^)]*\)/g, '')
    return (bare.match(/\[[^\]]+\]/g) ?? []).length
  }

  const selectors = (): string[] =>
    structureBaseCss()
      .split('\n')
      .filter((line) => line.endsWith('{'))
      .map((line) => line.slice(0, -1).trim())

  it('모든 규칙이 정확히 (0,2,0)이다 — 테마의 두 꼴과 같은 값', () => {
    // 테마가 내는 것은 `[c][s]`(루트)와 `[c] [part]`(조각) 둘뿐이고 **둘 다 속성 두 개**다.
    // 하나라도 다르면 그 컴포넌트에서 순서가 우선순위가 아니게 된다.
    const offenders = selectors()
      .map((selector) => [selector, specificityB(selector)] as const)
      .filter(([, b]) => b !== 2)
    expect(selectors().length).toBeGreaterThan(0)
    expect(offenders).toEqual([])
  })

  it('id·class·태그 선택자를 쓰지 않는다 — b 자리만 세면 되는 근거', () => {
    // 위 케이스가 속성 수만 세므로, 다른 종류가 섞이면 그 셈이 뜻을 잃는다.
    const bare = selectors().map((s) => s.replace(/:where\([^)]*\)/g, '').replace(/\[[^\]]+\]/g, ''))
    expect(bare.filter((rest) => rest.trim() !== '')).toEqual([])
  })

  it('그 셈이 진짜로 잰다 — :where()는 0이고 속성은 1이다', () => {
    // 이 케이스가 없으면 위 둘이 `specificityB`가 늘 2를 돌려줘도 초록이다.
    expect(specificityB('[a="1"][b="2"]')).toBe(2)
    expect(specificityB('[a="1"] [b="2"]')).toBe(2)
    expect(specificityB('[a="1"]:where([b="2"]) [c="3"]')).toBe(2)
    expect(specificityB('[a="1"][b="2"][c="3"]')).toBe(3)
  })
})
