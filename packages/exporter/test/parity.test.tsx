// @vitest-environment jsdom
/**
 * **D6 — *"같다"*를 실측한다. 이 슬라이스의 핵심이다.**
 *
 * §11.3이 적은 *"렌더러가 하나뿐이라 결과가 어긋날 수 없다"*는 **설계의 주장**이다. 여기서
 * 잰다: 같은 문서 · 같은 테마 · 같은 카탈로그로 두 경로를 돌려 DOM을 견준다.
 *
 * | 경로 | 무엇 |
 * |---|---|
 * | 화면 | jsdom에서 `renderDocument`를 React 클라이언트로 그린다(오늘 캔버스가 하는 것) |
 * | 번들 | `exportPage`의 `html`을 `DOMParser`로 판다 |
 *
 * ---
 *
 * ## 견주는 단위 — 문장으로 못박는다
 *
 * `describeTree`가 두 DOM을 각각 **줄의 목록**으로 편다. 한 줄이 노드 하나이고, 다음
 * 넷을 든다:
 *
 * 1. **자리** — 뿌리에서부터의 자식 인덱스 사슬(`0.2.1`). **순서가 여기 들어간다.**
 * 2. **태그 이름**(소문자). 원소가 아니면 `#text`다.
 * 3. **속성 전부** — 이름과 값을 짝으로, **이름으로 정렬해서.** §6.11의 여섯 속성이
 *    여기 포함된다(아래 census가 여섯이 실제로 나오는지 따로 센다). 정렬하는 것은
 *    **속성의 출력 순서까지 계약으로 삼지 않기 위해서다** — HTML에서 속성 순서는 뜻이
 *    없고, SSR과 클라이언트가 그 순서를 다르게 낼 이유가 있다.
 * 4. **텍스트** — **이어 붙은 텍스트 노드는 한 덩이로 본다.**
 *
 * **정규화가 둘 있고 둘 다 재서 넣었다.** 그냥 넣은 것이 아니라 **두 경로가 실제로
 * 갈렸고, 갈린 원인을 판정한 결과**다. `style` 속성의 적는 꼴(`normalizeStyle`)과 위 4의
 * 텍스트 노드 경계(`childItems`)이고, 각각 아래 *"갈렸던 자리"* 절이 원문을 값으로 든다.
 * **조용히 맞추지 않았다는 근거가 그 절이다** — 정규화를 지우면 본론이 죽고, 정규화가
 * 지나치면 구분력 케이스가 죽는다.
 *
 * 보지 않는 것: 계산된 스타일(시트를 안 걸었다) · 이벤트 핸들러(상호작용은 P8-3이다).
 *
 * **`<head>`는 견주지 않는다 — 화면 쪽에 견줄 것이 없다.** 그래도 파서가 그것을 무엇으로
 * 읽는지는 여기서 잰다(아래 *"번들의 머리"* 절). 문자열 단언은 `page.test.ts`가 들고,
 * 그것만으로는 *"브라우저가 이대로 읽는다"*가 안 되기 때문이다.
 *
 * ## 이 파일이 무엇을 재고 무엇을 못 재는가
 *
 * **두 경로가 같은 `renderDocument`·같은 `themeStructures`를 부른다.** 그래서 그 둘을
 * 망가뜨리는 변이는 **양쪽을 함께 움직여** 여기서 안 죽는다(P7-3 이월 §9의 M14 쪽).
 * 그것이 결함이 아니라 **이 파일이 재려는 것 자체**다 — *"한 벌인가"*를 재는 것이지
 * *"렌더러가 옳은가"*를 재는 것이 아니고, 렌더러의 옳음은 `packages/renderer/test`가 든다.
 *
 * **여기서 죽는 것은 `exportPage`가 렌더 경로에 더하거나 뺀 것이다** — 구조 선택을
 * 안 넘기거나, 트리를 감싸거나, 카탈로그를 안 설치하는 것.
 *
 * **견주는 자(`describeTree`) 자신이 무디면 이 파일이 공허하게 통과한다.** 그래서 자를
 * 먼저 잰다 — 알려진 차이 아홉을 실제로 갈라내는지 본다.
 */
import { installStructures, renderDocument, resetStructures } from '@wirebound/renderer'
import {
  CATALOG_TYPES,
  installCatalog,
  resetRegistry,
  validatePage,
  walkNodes,
  type PageDocument,
} from '@wirebound/schema'
import {
  SYSTEM_THEME_IDS,
  THEME_ISSUE_SEVERITY,
  resolveTheme,
  systemTheme,
  themeStructures,
  type ResolvedTheme,
} from '@wirebound/themes'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeAll, describe, expect, it } from 'vitest'
import { exportPage } from '../src/page'

beforeAll(() => {
  installCatalog()
  installStructures()
  // React 19의 `act`가 이 전역을 본다. RTL이 없는 패키지라 직접 켠다.
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

/* ------------------------------------------------------------------ 견주는 자 */

/**
 * **`style` 속성의 적는 꼴을 접는다 — 선언은 접지 않는다.**
 *
 * 실측(이 파일이 처음 돌 때 잡은 갈림 ㉠):
 *
 * | 경로 | `Grid`의 `style` 원문 |
 * |---|---|
 * | 화면 | `--wb-node-grid-columns: 3;` |
 * | 번들 | `--wb-node-grid-columns:3` |
 *
 * **원인은 렌더러도 exporter도 아니다.** 화면 쪽은 React 클라이언트가 `style` 객체를
 * CSSOM에 하나씩 얹으므로 `getAttribute('style')`이 **CSSOM이 다시 적은 문자열**을 낸다.
 * 번들 쪽은 HTML 파서가 속성 값을 **원문 그대로** 보관한다. 실브라우저도 같은 갈래를
 * 갖는다 — 같은 선언을 다르게 적은 것이지 다른 스타일이 아니다. `font` 같은 단축 속성은
 * 화면 쪽에서 낱개로 펼쳐지기까지 한다(`font-style: normal; …`).
 *
 * 그래서 **양쪽을 같은 CSSOM에 넣어 되읽는다.** 접히는 것은 적는 꼴뿐이고, 선언이
 * 하나라도 늘거나 줄거나 값이 바뀌면 그대로 갈린다(아래 구분력 케이스 넷이 그것을 든다).
 */
const STYLE_PROBE = window.document.createElement('div')

function normalizeStyle(value: string): string {
  STYLE_PROBE.setAttribute('style', value)
  const text = STYLE_PROBE.style.cssText
  STYLE_PROBE.removeAttribute('style')
  return text
}

type Item =
  | { kind: 'element'; element: Element }
  | { kind: 'text'; text: string }
  | { kind: 'other'; label: string }

/**
 * 자식을 견줄 단위로 편다. **이어 붙은 텍스트 노드를 한 덩이로 합친다.**
 *
 * 실측(갈림 ㉡ — 다섯 테마 중 `portal` 하나에서만 났다. `EntryForm:sectioned`를 그 테마만
 * 고른다):
 *
 * | 경로 | `sectionTitle`의 자식 |
 * |---|---|
 * | 화면 | 텍스트 노드 **둘** — `"구획 "`, `"1"` |
 * | 번들 | 텍스트 노드 **하나** — `"구획 1"` |
 *
 * **원인은 HTML이 텍스트 노드 경계를 적을 수 없다는 것이다.** 화면 쪽 둘은 JSX가 자식
 * 둘로 만든 것이고, `renderToStaticMarkup`은 그것을 이어 붙여 낸다(하이드레이션용
 * `<!-- -->` 구분자를 넣는 것은 `renderToString`이고 정적 마크업은 넣지 않는다 — 아래
 * 케이스가 그것도 값으로 든다). 어떤 직렬화→파싱 왕복도 그 경계를 잃는다.
 *
 * **보이는 글자는 같다**(아래 절이 `textContent`로 그것을 잰다). 그리고 그 경계에 기대는
 * 것이 없다 — 셀렉터도 CSS도 텍스트 노드를 겨냥하지 못한다.
 *
 * 주석 노드는 합치지 않고 그대로 남긴다. 오늘 두 경로 다 내지 않지만 생기면 갈리는 편이
 * 낫다 — 이 정규화가 덮는 것은 **경계**이지 **노드의 종류**가 아니다.
 */
function childItems(node: Node): Item[] {
  const items: Item[] = []
  for (const child of [...node.childNodes]) {
    if (child.nodeType === child.TEXT_NODE) {
      const last = items.at(-1)
      if (last?.kind === 'text') last.text += child.nodeValue ?? ''
      else items.push({ kind: 'text', text: child.nodeValue ?? '' })
      continue
    }
    if (child.nodeType === child.ELEMENT_NODE) {
      items.push({ kind: 'element', element: child as Element })
      continue
    }
    items.push({ kind: 'other', label: `#node${child.nodeType} ${child.nodeValue ?? ''}` })
  }
  return items
}

/** 원소 하나를 한 줄로. 자리·태그·속성을 든다. */
function describeElement(element: Element, path: string): string {
  const attrs = [...element.attributes]
    .map((attr) => {
      const value = attr.name === 'style' ? normalizeStyle(attr.value) : attr.value
      return `${attr.name}=${JSON.stringify(value)}`
    })
    .sort()
    .join(' ')
  return `${path} <${element.tagName.toLowerCase()}> ${attrs}`
}

function describeItems(items: Item[], path: string, lines: string[]): void {
  items.forEach((item, index) => {
    const here = `${path}.${index}`
    if (item.kind === 'text') {
      lines.push(`${here} #text ${item.text}`)
      return
    }
    if (item.kind === 'other') {
      lines.push(`${here} ${item.label}`)
      return
    }
    lines.push(describeElement(item.element, here))
    describeItems(childItems(item.element), here, lines)
  })
}

function describeTree(root: Element): string[] {
  const lines = [describeElement(root, '0')]
  describeItems(childItems(root), '0', lines)
  return lines
}

/* ------------------------------------------------------------------ 두 경로 */

/** 화면 경로 — 오늘 캔버스가 하는 것과 같다(`apps/web/src/canvas/canvas.tsx`). */
function screenTree(document_: PageDocument, theme: ResolvedTheme | null): Element {
  const container = window.document.createElement('div')
  window.document.body.append(container)
  const root = createRoot(container)
  act(() => {
    root.render(renderDocument(document_, { structures: themeStructures(theme) }))
  })
  const rendered = container.firstElementChild
  expect(rendered, '화면 경로가 아무것도 그리지 않았다').not.toBeNull()
  return rendered!
}

/** 번들 경로 — `exportPage`가 낸 HTML을 판다. */
function bundleTree(document_: PageDocument, theme: ResolvedTheme | null): Element {
  const { html } = exportPage({ document: document_, title: '견주기', theme })
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const rendered = parsed.body.firstElementChild
  expect(rendered, '번들 경로가 아무것도 그리지 않았다').not.toBeNull()
  return rendered!
}

/* ------------------------------------------------------------------ 픽스처 */

let nextId = 0
function id(): string {
  nextId += 1
  return `n_${String(nextId).padStart(12, '0')}`
}

/**
 * **카탈로그를 넓게 덮는 문서**(D6: *"문서 하나로 재지 마라"*). 아래 census가 이 문서가
 * 무엇을 덮었는지 세어 `CATALOG_TYPES`와 맞댄다 — **분모는 카탈로그이고 이 문서가 실제
 * 값이다.** 카탈로그에 타입이 늘면 여기 안 더한 날 census가 죽는다.
 *
 * **`Slot`만 빠져 있고 그것은 강제된 것이다** — §4.4가 `Slot`을 레이아웃의 것으로 두었고
 * `validatePage`가 페이지에 있는 `Slot`을 `error`로 막는다(아래 두 케이스가 그 값을 든다).
 * 그래서 `Slot`의 견주기는 `slotFixture()`가 따로 든다.
 *
 * props를 기본값으로 두지 않는 것은 §6.11의 여섯 속성 중 `data-wb-variant`·`data-wb-state`가
 * **기본 props에서는 안 나오기** 때문이다(재라 #3).
 */
function fixture(): PageDocument {
  nextId = 0
  return {
    version: 1,
    root: {
      id: id(),
      type: 'Page',
      children: [
        {
          id: id(),
          type: 'Section',
          variant: 'hero',
          children: [
            { id: id(), type: 'Text', props: { content: '회원 <목록> & "관리"', role: 'h2' } },
            { id: id(), type: 'Text', props: { content: '본문 텍스트' } },
            { id: id(), type: 'Divider', props: { direction: 'vertical' } },
            { id: id(), type: 'Media', props: { caption: '스크린샷', kind: 'chart' } },
            { id: id(), type: 'Placeholder', props: { label: '미정', height: 200 } },
          ],
        },
        {
          id: id(),
          type: 'Flex',
          props: { direction: 'column', wrap: true },
          children: [
            { id: id(), type: 'Button', variant: 'primary', props: { label: '저장', loading: true } },
            { id: id(), type: 'Button', variant: 'danger', props: { label: '삭제', disabled: true } },
            { id: id(), type: 'Link', variant: 'muted', props: { label: '도움말', disabled: true } },
          ],
        },
        {
          id: id(),
          type: 'Grid',
          props: { columns: 3 },
          children: [
            {
              id: id(),
              type: 'Card',
              props: { title: '요약', subtitle: '부제' },
              children: [{ id: id(), type: 'KeyValue', props: { columns: 2 } }],
            },
            {
              id: id(),
              type: 'Tabs',
              props: { tabs: ['개요', '상세'], active: 1 },
              children: [{ id: id(), type: 'Tree', props: { selected: true } }],
            },
          ],
        },
        {
          id: id(),
          type: 'SearchForm',
          children: [
            { id: id(), type: 'Field', props: { control: 'select', required: true, label: '등급' } },
          ],
        },
        {
          id: id(),
          type: 'EntryForm',
          props: { title: '등록' },
          children: [
            {
              id: id(),
              type: 'Field',
              props: { control: 'checkbox', disabled: true, invalid: true, label: '동의' },
            },
          ],
        },
        { id: id(), type: 'List', variant: 'compact', props: { items: 3, selected: true } },
      ],
    },
  }
}

/**
 * `Slot` 하나만 든 문서. **유효한 페이지가 아니다**(아래 케이스가 그 이슈를 값으로 든다).
 *
 * 그래도 견주는 이유: 렌더 경로는 검증을 지나지 않으므로 이 노드를 그리고, **P8-2가
 * 레이아웃을 번들에 넣을지 판정하는 자리**(P7-3 이월 §5)에서 이것이 첫 손님이 된다.
 * 카탈로그 19종 중 하나만 안 재고 넘기면 그 판정이 잴 것 없이 시작된다.
 */
function slotFixture(): PageDocument {
  nextId = 100
  return {
    version: 1,
    root: { id: id(), type: 'Page', children: [{ id: id(), type: 'Slot' }] },
  }
}

/** 문서가 실제로 쓰는 컴포넌트 타입. 케이스가 세게 한다 — 산문에 적지 않는다. */
function typesIn(document_: PageDocument): string[] {
  const seen = new Set<string>()
  for (const visit of walkNodes(document_.root)) seen.add(visit.node.type)
  return [...seen].sort()
}

function resolvedSystemTheme(themeId: string): ResolvedTheme {
  const { theme, issues } = resolveTheme(systemTheme(themeId)!)
  const errors = issues.filter((issue) => THEME_ISSUE_SEVERITY[issue.code] === 'error')
  expect(errors.map((issue) => `${issue.path}: ${issue.message}`), themeId).toEqual([])
  return theme!
}

/* ------------------------------------------------------------------ 견주는 자를 먼저 잰다 */

describe('견주는 자가 실제로 갈라낸다', () => {
  function parse(html: string): Element {
    return new DOMParser().parseFromString(html, 'text/html').body.firstElementChild!
  }

  const BASE = '<div data-wb-id="a" data-wb-component="List"><span>가</span><b>나</b></div>'

  it('같은 것을 같다고 한다', () => {
    expect(describeTree(parse(BASE))).toEqual(describeTree(parse(BASE)))
  })

  /**
   * **알려진 차이 아홉.** 하나라도 못 갈라내면 이 파일 전체가 그만큼 공허해진다.
   * 분모를 손으로 드는 것이 요점이다 — `describeElement`에서 끌어오면 그 함수가 무엇을
   * 빠뜨려도 기대값이 함께 줄어든다(P7-3 이월 §9).
   */
  const DIFFERENT: [name: string, html: string][] = [
    ['속성 값이 다르다', '<div data-wb-id="b" data-wb-component="List"><span>가</span><b>나</b></div>'],
    ['속성이 하나 없다', '<div data-wb-id="a"><span>가</span><b>나</b></div>'],
    [
      '속성이 하나 더 있다',
      '<div data-wb-id="a" data-wb-component="List" data-wb-state="selected"><span>가</span><b>나</b></div>',
    ],
    ['자식 순서가 다르다', '<div data-wb-id="a" data-wb-component="List"><b>나</b><span>가</span></div>'],
    ['태그가 다르다', '<div data-wb-id="a" data-wb-component="List"><span>가</span><i>나</i></div>'],
    ['텍스트가 다르다', '<div data-wb-id="a" data-wb-component="List"><span>다</span><b>나</b></div>'],
    [
      '자식이 하나 더 있다',
      '<div data-wb-id="a" data-wb-component="List"><span>가</span><b>나</b><i>다</i></div>',
    ],
    ['깊이가 다르다', '<div data-wb-id="a" data-wb-component="List"><span><b>가</b></span><b>나</b></div>'],
    ['텍스트가 사라졌다', '<div data-wb-id="a" data-wb-component="List"><span></span><b>나</b></div>'],
  ]

  it.each(DIFFERENT)('%s', (_name, html) => {
    expect(describeTree(parse(html))).not.toEqual(describeTree(parse(BASE)))
  })

  /**
   * 정규화 둘이 **접는 축만** 접는지 양방향으로 잰다. 첫 케이스가 없으면 정규화가
   * 지나쳐도 알 수 없고, 나머지가 없으면 정규화가 갈림을 삼켜도 알 수 없다.
   */
  const STYLED = (style: string): string => `<div style="${style}"></div>`

  it('스타일은 적는 꼴만 다르면 같다고 한다', () => {
    expect(describeTree(parse(STYLED('--wb-node-grid-columns:2')))).toEqual(
      describeTree(parse(STYLED('--wb-node-grid-columns: 2;'))),
    )
  })

  it.each([
    ['값이 다르다', '--wb-node-grid-columns:3'],
    ['선언이 하나 더 있다', '--wb-node-grid-columns:2;color:red'],
    ['선언이 없다', ''],
    ['이름이 다르다', '--wb-node-grid-rows:2'],
  ])('스타일 선언이 다르면 갈라낸다 — %s', (_name, style) => {
    expect(describeTree(parse(STYLED(style)))).not.toEqual(
      describeTree(parse(STYLED('--wb-node-grid-columns:2'))),
    )
  })

  it('텍스트 노드 경계는 접는다', () => {
    const one = window.document.createElement('p')
    one.append('구획 1')
    const two = window.document.createElement('p')
    two.append('구획 ', '1')

    expect([...two.childNodes].length).toBe(2)
    expect(describeTree(two)).toEqual(describeTree(one))
  })

  it('경계를 접어도 글자가 다르면 갈라낸다', () => {
    const one = window.document.createElement('p')
    one.append('구획 ', '1')
    const other = window.document.createElement('p')
    other.append('구획 ', '2')

    expect(describeTree(other)).not.toEqual(describeTree(one))
  })
})

/* ------------------------------------------- 갈렸던 자리를 값으로 남긴다 */

describe('갈렸던 자리 ㉠ — style 속성의 적는 꼴', () => {
  function rawStyleOf(root: Element, componentType: string): string {
    const found = root.querySelector(`[data-wb-component="${componentType}"]`)
    expect(found, componentType).not.toBeNull()
    return found!.getAttribute('style') ?? ''
  }

  it('Grid의 style 원문이 두 경로에서 다르다', () => {
    const screen = rawStyleOf(screenTree(fixture(), null), 'Grid')
    const bundle = rawStyleOf(bundleTree(fixture(), null), 'Grid')

    expect(screen).toBe('--wb-node-grid-columns: 3;')
    expect(bundle).toBe('--wb-node-grid-columns:3')
    expect(screen).not.toBe(bundle)
  })

  it('같은 CSSOM에 넣으면 같아진다 — 선언이 같기 때문이다', () => {
    const screen = rawStyleOf(screenTree(fixture(), null), 'Grid')
    const bundle = rawStyleOf(bundleTree(fixture(), null), 'Grid')

    expect(normalizeStyle(bundle)).toBe(normalizeStyle(screen))
  })
})

describe('갈렸던 자리 ㉡ — 텍스트 노드 경계', () => {
  /**
   * **다섯 테마 중 `portal` 하나에서만 났다.** 그 테마만 `EntryForm:sectioned`를 고르고,
   * 그 구조만 머리글을 자식 둘로 만든다. **문서 하나·테마 하나로 쟀으면 못 봤을 갈림이다**
   * (D6이 *"넓게 덮어라"*를 적은 이유가 이것이다).
   */
  function sectionTitleOf(root: Element): ChildNode[] {
    const found = root.querySelector('[data-wb-part="sectionTitle"]')
    expect(found, 'sectionTitle').not.toBeNull()
    return [...found!.childNodes]
  }

  it('화면은 텍스트 노드 둘, 번들은 하나다', () => {
    const theme = resolvedSystemTheme('portal')
    const screen = sectionTitleOf(screenTree(fixture(), theme))
    const bundle = sectionTitleOf(bundleTree(fixture(), theme))

    expect(screen.map((node) => node.nodeValue)).toEqual(['구획 ', '1'])
    expect(bundle.map((node) => node.nodeValue)).toEqual(['구획 1'])
  })

  it('보이는 글자는 같다', () => {
    const theme = resolvedSystemTheme('portal')
    const screen = screenTree(fixture(), theme).querySelector('[data-wb-part="sectionTitle"]')
    const bundle = bundleTree(fixture(), theme).querySelector('[data-wb-part="sectionTitle"]')

    expect(bundle?.textContent).toBe(screen?.textContent)
    expect(bundle?.textContent).toBe('구획 1')
  })

  /** **하이드레이션용 구분자가 없다** — `renderToString`이 넣는 `<!-- -->`가 그것이다. */
  it('번들에 주석 노드가 없다', () => {
    const { html } = exportPage({
      document: fixture(),
      title: '견주기',
      theme: resolvedSystemTheme('portal'),
    })
    expect(html).not.toContain('<!--')
  })
})

/* ------------------------------------------------------------------ 번들의 머리 */

describe('번들의 머리를 파서가 무엇으로 읽나 (D7)', () => {
  function parsed(): Document {
    const { html } = exportPage({ document: fixture(), title: '회원 <목록>', lang: 'ko' })
    return new DOMParser().parseFromString(html, 'text/html')
  }

  /**
   * **원문은 `<meta charSet="utf-8"/>`이다** — React가 JSX prop 이름을 그대로 낸다
   * (`page.test.ts`가 그 문자열을 든다). HTML의 속성 이름은 대소문자를 가리지 않으므로
   * 파서가 `charset`으로 읽는다. **그 왕복을 여기서 잰다** — 원문만 보고 *"인코딩이
   * 선언돼 있다"*고 말하면 그것은 단언이지 측정이 아니다.
   */
  it('charSet이 charset으로 읽힌다', () => {
    const meta = parsed().querySelector('meta')
    expect([...meta!.attributes].map((attr) => attr.name)).toEqual(['charset'])
    expect(meta!.getAttribute('charset')).toBe('utf-8')
    expect(parsed().querySelector('meta[charset]')).not.toBeNull()
  })

  it('lang과 title이 문서의 것으로 읽힌다', () => {
    expect(parsed().documentElement.lang).toBe('ko')
    expect(parsed().title).toBe('회원 <목록>')
  })

  /** 머리에 셸이 없다(D7) — 스타일도 스크립트도 P8-2·P8-3의 것이다. */
  it('머리에 style도 script도 link도 없다', () => {
    const head = parsed().head
    expect(head.querySelectorAll('style, script, link')).toHaveLength(0)
  })
})

/* ------------------------------------------------------------------ 무엇을 덮었나 */

describe('무엇을 덮었나 (D6: 문서 하나로 재지 마라)', () => {
  it('픽스처 둘이 합쳐 카탈로그의 컴포넌트를 전부 쓴다', () => {
    const covered = new Set([...typesIn(fixture()), ...typesIn(slotFixture())])
    expect([...covered].sort()).toEqual([...CATALOG_TYPES].sort())
  })

  it('본 픽스처가 유효한 페이지 문서다', () => {
    const errors = validatePage(fixture()).filter((issue) => issue.severity === 'error')
    expect(errors.map((issue) => `${issue.path}: ${issue.message}`)).toEqual([])
  })

  /**
   * **`Slot`을 가른 것이 편의가 아니라 강제라는 근거다.** 이 이슈가 사라지면(§4.4가
   * 바뀌면) 픽스처를 하나로 합쳐야 하고, 그때 이 케이스가 먼저 죽어 알려 준다.
   */
  it('Slot은 페이지 문서에 둘 수 없다 — 그래서 픽스처가 둘이다', () => {
    const errors = validatePage(slotFixture()).filter((issue) => issue.severity === 'error')
    expect(errors.map((issue) => `${issue.path}: ${issue.message}`)).toEqual([
      '/root: 페이지에는 Slot을 둘 수 없습니다 (1개 발견)',
    ])
  })

  /**
   * **§6.11의 여섯 속성이 실제로 나오는지 센다**(사실 6 · 재라 #3). 분모는 §6.11의 표에서
   * 손으로 옮긴 여섯이다 — 렌더러의 `WbAttrs`에서 끌어오면 그쪽이 줄 때 기대값도 준다.
   */
  const CONTRACT_ATTRS = [
    'data-wb-id',
    'data-wb-component',
    'data-wb-structure',
    'data-wb-variant',
    'data-wb-part',
    'data-wb-state',
  ]

  it.each([['화면', screenTree], ['번들', bundleTree]] as const)(
    '%s 경로에 여섯 속성이 다 나온다',
    (_name, path) => {
      const lines = describeTree(path(fixture(), resolvedSystemTheme('admin'))).join('\n')
      for (const attr of CONTRACT_ATTRS) {
        expect(lines, attr).toContain(`${attr}=`)
      }
    },
  )
})

/* ------------------------------------------------------------------ 본론 */

describe('화면과 번들이 같은 DOM을 낸다 (D6)', () => {
  it('테마 없이', () => {
    expect(describeTree(bundleTree(fixture(), null))).toEqual(
      describeTree(screenTree(fixture(), null)),
    )
  })

  it.each(SYSTEM_THEME_IDS.map((themeId) => [themeId] as const))('시스템 테마 %s', (themeId) => {
    const theme = resolvedSystemTheme(themeId)
    expect(describeTree(bundleTree(fixture(), theme))).toEqual(
      describeTree(screenTree(fixture(), theme)),
    )
  })

  it('Slot을 든 문서도 같다', () => {
    expect(describeTree(bundleTree(slotFixture(), null))).toEqual(
      describeTree(screenTree(slotFixture(), null)),
    )
  })

  /**
   * **테마마다 실제로 다른 DOM이 나오는지도 본다.** 전부 같은 DOM이면 위 반복이
   * 테마 하나를 다섯 번 재는 것과 다르지 않다.
   */
  it('테마가 다르면 DOM도 다르다 — 위 반복이 같은 것을 다섯 번 재지 않는다', () => {
    const shapes = new Set(
      SYSTEM_THEME_IDS.map((themeId) =>
        describeTree(bundleTree(fixture(), resolvedSystemTheme(themeId))).join('\n'),
      ),
    )
    expect(shapes.size).toBe(SYSTEM_THEME_IDS.length)
  })

  /**
   * **카탈로그가 안 설치된 자리에서도 같은가.** 화면은 `catalog-setup`이 import만으로
   * 설치하고 번들은 `exportPage`가 설치한다(D4) — 출발이 다르므로 여기서 갈릴 수 있다.
   * 번들을 **먼저** 부르는 순서로 재는 것이 요점이다: `exportPage`가 설치하지 않으면
   * 화면 쪽이 빈 레지스트리를 만나 폴백을 그린다.
   */
  it('둘 다 빈 레지스트리에서 출발해도 같다', () => {
    resetRegistry()
    resetStructures()

    const bundle = describeTree(bundleTree(fixture(), null))
    const screen = describeTree(screenTree(fixture(), null))

    expect(bundle).toEqual(screen)
    expect(bundle.join('\n')).toContain('data-wb-component=')
    expect(bundle.join('\n')).not.toContain('data-wb-error=')
  })
})
