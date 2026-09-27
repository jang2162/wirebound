// @vitest-environment jsdom
/**
 * **화면과 번들이 *"같다"*를 실측한다.** 이 파일이 exporter의 핵심 자다.
 *
 * 설계서 「HTML 정적 번들」이 적은 *"렌더러가 하나뿐이라 결과가 어긋날 수 없다"*는 **설계의 주장**이다. 여기서
 * 잰다: 같은 문서 · 같은 테마 · 같은 카탈로그로 두 경로를 돌려 DOM을 견준다.
 *
 * | 경로 | 무엇 |
 * |---|---|
 * | 화면 | jsdom에서 `renderDocument(doc, { theme })`를 React 클라이언트로 그린다(캔버스가 하는 것) |
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
 * 3. **속성 전부** — 이름과 값을 짝으로, **이름으로 정렬해서.** 「컴파일」의 여섯 속성이
 *    여기 포함된다(아래 census가 여섯이 실제로 나오는지 따로 센다). 정렬하는 것은
 *    **속성의 출력 순서까지 계약으로 삼지 않기 위해서다** — HTML에서 속성 순서는 뜻이
 *    없고, SSR과 클라이언트가 그 순서를 다르게 낼 이유가 있다.
 * 4. **텍스트** — **이어 붙은 텍스트 노드는 한 덩이로 본다.**
 *
 * **정규화가 셋 있고 셋 다 재서 넣었다.** 그냥 넣은 것이 아니라 **두 경로가 실제로
 * 갈렸고, 갈린 원인을 판정한 결과**다. `style` 속성의 적는 꼴(`normalizeStyle`) · 위 4의
 * 텍스트 노드 경계(`childItems`) · 선언 없는 `style` 속성(`attributeLine`)이다. ㉠·㉡ 은 아래
 * *"갈렸던 자리"* 절이 원문을 값으로 든다. ㉢ 은 React 가 같은 원소를 다시 쓰며 `style` 선언을 걷을 때 남는 빈 속성이다 —
 * 뷰는 테마가 바뀌면 컴포넌트가 달라 원소를 새로 세우므로 이 파일에는 그 판을 세울 길이 없고, 접어도 무해해 남긴다
 * (자 케이스 *"선언 없는 style 속성은 없는 것과 같다"*가 잰다).
 * **조용히 맞추지 않았다는 근거가 그 절이다** — 정규화를 지우면 본론이 죽고, 정규화가
 * 지나치면 구분력 케이스가 죽는다.
 *
 * 보지 않는 것: 계산된 스타일(시트를 안 걸었다) · 이벤트 핸들러(상호작용 런타임은
 * `runtime-bundle.test.ts`가 잰다).
 *
 * **`<head>`는 견주지 않는다 — 화면 쪽에 견줄 것이 없다.** 그래도 파서가 그것을 무엇으로
 * 읽는지는 여기서 잰다(아래 *"번들의 머리"* 절). 문자열 단언은 `page.test.ts`가 들고,
 * 그것만으로는 *"브라우저가 이대로 읽는다"*가 안 되기 때문이다.
 *
 * **여기의 화면 경로는 `renderDocument`를 직접 부른다 — 진짜 캔버스가 아니다.**
 * `packages/exporter`는 `apps/web`을 볼 수 없다(설계서 「각 패키지의 책임과 의존」의 방향이
 * 아니라 앱이라서다).
 * **캔버스에 묶는 견주기는 `apps/web/test/canvas/bundle-parity.test.tsx`가 든다** —
 * 거기서만 진짜 `<App/>`을 렌더할 수 있고, **견주는 자와 픽스처는 이 파일과 같은 것**
 * (`@wirebound/exporter/test-support`)을 쓴다. 이 파일이 재는 것은 *"exporter가 렌더
 * 경로에 무엇을 더하거나 뺐는가"*이고, 그 파일이 재는 것은 *"캔버스가 그 경로에서
 * 벗어났는가"*다.
 *
 * ## 이 파일이 무엇을 재고 무엇을 못 재는가
 *
 * **두 경로가 같은 `renderDocument`에 같은 테마를 넘긴다.** 그래서 렌더러를
 * 망가뜨리는 변이는 **양쪽을 함께 움직여** 여기서 안 죽는다.
 * 그것이 결함이 아니라 **이 파일이 재려는 것 자체**다 — *"한 벌인가"*를 재는 것이지
 * *"렌더러가 옳은가"*를 재는 것이 아니고, 렌더러의 옳음은 `packages/renderer/test`가 든다.
 *
 * **여기서 죽는 것은 `exportPage`가 렌더 경로에 더하거나 뺀 것이다** — 테마를
 * 안 넘기거나, 트리를 감싸거나, 카탈로그를 안 설치하는 것.
 *
 * **견주는 자(`describeTree`) 자신이 무디면 이 파일이 공허하게 통과한다.** 그래서 자를
 * 먼저 잰다 — 알려진 차이 아홉을 실제로 갈라내는지 본다.
 */
import { NO_THEME, renderDocument } from '@wirebound/renderer'
import {
  CATALOG_TYPES,
  installCatalog,
  resetRegistry,
  validatePage,
  type PageDocument,
} from '@wirebound/schema'
import { defineTheme, Root, view, type ThemeDefinition } from '@wirebound/theme-sdk'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { beforeAll, describe, expect, it } from 'vitest'
import { exportPage } from '../src/page'
import { describeTree, normalizeStyle } from '../test-support/dom-compare'
import {
  brokenFixture,
  broadFixture,
  EMPTY_MANIFEST,
  markedTheme,
  slotFixture,
  typesIn,
} from '../test-support/fixtures'

installCatalog()

beforeAll(() => {
  // React 19의 `act`가 이 전역을 본다. RTL이 없는 패키지라 직접 켠다.
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

/* ------------------------------------------------------------------ 두 경로 */

/**
 * 화면 경로 — 캔버스가 하는 것과 같다(`apps/web/src/canvas/canvas.tsx`). 테마를 안 받은 판은 `NO_THEME` 으로 그린다 —
 * 번들이 테마 없이 불렸을 때 쓰는 값이다(`page.tsx` 의 `renderPageTree`).
 */
function screenTree(document_: PageDocument, theme: ThemeDefinition | undefined): Element {
  const container = window.document.createElement('div')
  window.document.body.append(container)
  const root = createRoot(container)
  act(() => {
    root.render(renderDocument(document_, { theme: theme ?? NO_THEME }))
  })
  const rendered = container.firstElementChild
  expect(rendered, '화면 경로가 아무것도 그리지 않았다').not.toBeNull()
  return rendered!
}

/** 번들 경로 — `exportPage`가 낸 HTML을 판다. */
function bundleTree(document_: PageDocument, theme: ThemeDefinition | undefined): Element {
  const { html } = exportPage({ document: document_, title: '견주기', ...(theme === undefined ? {} : { theme }) })
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  const rendered = parsed.body.firstElementChild
  expect(rendered, '번들 경로가 아무것도 그리지 않았다').not.toBeNull()
  return rendered!
}

/** 이 파일이 견주는 문서 전부. 픽스처마다 성질이 다르다 — 근거는 각 함수의 머리말에 있다. */
const FIXTURES = {
  넓게: broadFixture,
  Slot: slotFixture,
  폴백: brokenFixture,
} as const

/** 견줄 테마. 테마 없음(api 의 판)과 기본 뷰와 다른 DOM 을 내는 테마(`markedTheme`). */
const THEMES: [label: string, theme: ThemeDefinition | undefined][] = [
  ['테마 없이', undefined],
  ['marked', markedTheme()],
]

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
   * 빠뜨려도 기대값이 함께 줄어든다.
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

  it('선언 없는 style 속성은 없는 것과 같다', () => {
    expect(describeTree(parse(STYLED('')))).toEqual(describeTree(parse('<div></div>')))
  })

  it('선언이 하나라도 있으면 없는 것과 갈린다', () => {
    expect(describeTree(parse(STYLED('color:red')))).not.toEqual(
      describeTree(parse('<div></div>')),
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
    const screen = rawStyleOf(screenTree(broadFixture(), undefined), 'Grid')
    const bundle = rawStyleOf(bundleTree(broadFixture(), undefined), 'Grid')

    expect(screen).toBe('--wb-node-grid-columns: 3;')
    expect(bundle).toBe('--wb-node-grid-columns:3')
    expect(screen).not.toBe(bundle)
  })

  it('같은 CSSOM에 넣으면 같아진다 — 선언이 같기 때문이다', () => {
    const screen = rawStyleOf(screenTree(broadFixture(), undefined), 'Grid')
    const bundle = rawStyleOf(bundleTree(broadFixture(), undefined), 'Grid')
    const probe = window.document.createElement('div')

    expect(normalizeStyle(bundle, probe)).toBe(normalizeStyle(screen, probe))
  })
})

describe('갈렸던 자리 ㉡ — 텍스트 노드 경계', () => {
  /**
   * **JSX 의 글자와 식이 이웃하면 클라이언트는 텍스트 노드 둘, 정적 마크업은 하나를 낸다.** 테마 뷰가 흔히 쓰는 꼴이라
   * (`구획 {n}`) 뷰 하나로 판을 세운다.
   */
  const SECTIONED: ThemeDefinition = defineTheme({
    manifest: EMPTY_MANIFEST,
    views: {
      Section: view(({ children }) =>
        createElement(Root, { as: 'section' }, createElement('h2', { 'data-probe': 'title' }, '구획 ', 1), children),
      ),
    },
  })

  function sectionTitleOf(root: Element): ChildNode[] {
    const found = root.querySelector('[data-probe="title"]')
    expect(found, 'title').not.toBeNull()
    return [...found!.childNodes]
  }

  it('화면은 텍스트 노드 둘, 번들은 하나다', () => {
    const screen = sectionTitleOf(screenTree(broadFixture(), SECTIONED))
    const bundle = sectionTitleOf(bundleTree(broadFixture(), SECTIONED))

    expect(screen.map((node) => node.nodeValue)).toEqual(['구획 ', '1'])
    expect(bundle.map((node) => node.nodeValue)).toEqual(['구획 1'])
  })

  it('보이는 글자는 같다', () => {
    const screen = screenTree(broadFixture(), SECTIONED).querySelector('[data-probe="title"]')
    const bundle = bundleTree(broadFixture(), SECTIONED).querySelector('[data-probe="title"]')

    expect(bundle?.textContent).toBe(screen?.textContent)
    expect(bundle?.textContent).toBe('구획 1')
  })

  /** **하이드레이션용 구분자가 없다** — `renderToString`이 넣는 `<!-- -->`가 그것이다. */
  it('번들에 주석 노드가 없다', () => {
    const { html } = exportPage({ document: broadFixture(), title: '견주기', theme: SECTIONED })
    expect(html).not.toContain('<!--')
  })
})

/* ------------------------------------------------------------------ 번들의 머리 */

describe('번들의 머리를 파서가 무엇으로 읽나', () => {
  function parsed(): Document {
    const { html } = exportPage({ document: broadFixture(), title: '회원 <목록>', lang: 'ko' })
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

  /** 머리에 셸이 없다 — 스타일도 스크립트도 번들(`exportBundle`)이 건다. */
  it('머리에 style도 script도 link도 없다', () => {
    const head = parsed().head
    expect(head.querySelectorAll('style, script, link')).toHaveLength(0)
  })
})

/* ------------------------------------------------------------------ 무엇을 덮었나 */

describe('무엇을 덮었나 (문서 하나로 재지 마라)', () => {
  it('픽스처가 합쳐 카탈로그의 컴포넌트를 전부 쓴다', () => {
    const covered = new Set(Object.values(FIXTURES).flatMap((make) => typesIn(make())))
    expect([...CATALOG_TYPES].filter((type) => !covered.has(type))).toEqual([])
  })

  /**
   * **카탈로그 밖의 타입이 하나 있고 일부러 넣은 것이다** — 폴백 픽스처가 *"알 수 없는
   * 컴포넌트 타입"* 갈래를 그리게 하는 노드다. 위 census를 `toEqual`로 못 쓰는 이유이므로
   * 그 예외를 여기서 값으로 든다. 손이 미끄러져 오타 난 타입이 픽스처에 들어오면 죽는다.
   */
  it('카탈로그 밖의 타입은 폴백 픽스처의 하나뿐이다', () => {
    const outside = new Set(
      Object.values(FIXTURES)
        .flatMap((make) => typesIn(make()))
        .filter((type) => !CATALOG_TYPES.includes(type)),
    )
    expect([...outside]).toEqual(['없는타입'])
  })

  it('본 픽스처가 유효한 페이지 문서다', () => {
    const errors = validatePage(broadFixture()).filter((issue) => issue.severity === 'error')
    expect(errors.map((issue) => `${issue.path}: ${issue.message}`)).toEqual([])
  })

  /**
   * **`Slot`을 가른 것이 편의가 아니라 강제라는 근거다.** 이 이슈가 사라지면(설계서
   * 「레이아웃」이 바뀌면) 픽스처를 하나로 합쳐야 하고, 그때 이 케이스가 먼저 죽어 알려 준다.
   */
  it('Slot은 페이지 문서에 둘 수 없다 — 그래서 픽스처가 갈려 있다', () => {
    const errors = validatePage(slotFixture()).filter((issue) => issue.severity === 'error')
    expect(errors.map((issue) => `${issue.path}: ${issue.message}`)).toEqual([
      '/root: 페이지에는 Slot을 둘 수 없습니다 (1개 발견)',
    ])
  })

  /** 폴백 픽스처가 실제로 폴백을 그리는지. 안 그리면 아래 견주기가 그 상자를 안 재는 것이다. */
  it('폴백 픽스처가 폴백 상자를 그린다', () => {
    const { errors } = exportPage({ document: brokenFixture(), title: '깨진 문서' })
    expect(errors.map((error) => error.message)).toEqual([
      '알 수 없는 컴포넌트 타입: 없는타입',
      'List의 props가 올바르지 않습니다:  인식할 수 없는 키: "없는프롭"',
      '노드가 객체가 아닙니다: null',
      '노드의 id가 문자열이 아닙니다',
    ])
  })

  /**
   * **「컴파일」의 여섯 속성이 실제로 나오는지 센다.** 분모는 그 절의 표에서
   * 손으로 옮긴 여섯이다 — 렌더러의 `WbAttrs`에서 끌어오면 그쪽이 줄 때 기대값도 준다. `structure` · `part` 는 SDK 기본 뷰가
   * 다는 마크업 훅이다.
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
      const lines = describeTree(path(broadFixture(), undefined)).join('\n')
      for (const attr of CONTRACT_ATTRS) {
        expect(lines, attr).toContain(`${attr}=`)
      }
    },
  )
})

/* ------------------------------------------------------------------ 본론 */

/** 견줄 판 전부 — 픽스처 셋 × 테마 둘. */
function boards(): [label: string, document_: PageDocument, theme: ThemeDefinition | undefined][] {
  return THEMES.flatMap(([themeLabel, theme]) =>
    Object.entries(FIXTURES).map(
      ([fixtureLabel, make]) =>
        [`${themeLabel} · ${fixtureLabel}`, make(), theme] as [string, PageDocument, ThemeDefinition | undefined],
    ),
  )
}

describe('화면과 번들이 같은 DOM을 낸다', () => {
  it.each(boards().map((board) => [board[0], board[1], board[2]] as const))(
    '%s',
    (_label, document_, theme) => {
      expect(describeTree(bundleTree(document_, theme))).toEqual(
        describeTree(screenTree(document_, theme)),
      )
    },
  )

  /**
   * **판이 실제로 서로 다른 DOM을 내는지 센다.** 전부 같으면 위 반복이 한 판을 여러 번
   * 재는 것과 다르지 않다 — 번들이 테마를 안 넘겨도 산다.
   *
   * **기대값을 손으로 든다** — 분모를 구현에서 끌어오지 않는다. 값의 뜻:
   *
   * | 픽스처 | 서로 다른 DOM | 왜 |
   * |---|---|---|
   * | 넓게 | 둘 | `marked` 의 뷰(`Button` · `Card`)와 `Section` 의 variant 선언이 문서에 닿는다 |
   * | Slot | 하나 | `Page` · `Slot` 뿐이라 `marked` 가 바꾸는 것이 없다 |
   * | 폴백 | 하나 | 폴백 상자는 테마를 안 탄다 — 렌더러가 뷰를 고르기 전에 멈춘 자리다 |
   */
  const DISTINCT_SHAPES: [fixture: keyof typeof FIXTURES, count: number][] = [
    ['넓게', 2],
    ['Slot', 1],
    ['폴백', 1],
  ]

  it.each(DISTINCT_SHAPES)('%s 픽스처가 서로 다른 DOM을 내는 수', (fixture, count) => {
    const shapes = new Set(
      THEMES.map(([, theme]) => describeTree(bundleTree(FIXTURES[fixture](), theme)).join('\n')),
    )
    expect(shapes.size).toBe(count)
  })

  /**
   * **카탈로그가 안 설치된 자리에서도 같은가.** 화면은 `catalog-setup`이 import만으로
   * 설치하고 번들은 `exportPage`가 설치한다 — 출발이 다르므로 여기서 갈릴 수 있다.
   * 번들을 **먼저** 부르는 순서로 재는 것이 요점이다: `exportPage`가 설치하지 않으면
   * 화면 쪽이 빈 레지스트리를 만나 폴백을 그린다.
   */
  it('둘 다 빈 레지스트리에서 출발해도 같다', () => {
    resetRegistry()

    const bundle = describeTree(bundleTree(broadFixture(), undefined))
    const screen = describeTree(screenTree(broadFixture(), undefined))

    expect(bundle).toEqual(screen)
    expect(bundle.join('\n')).toContain('data-wb-component=')
    expect(bundle.join('\n')).not.toContain('data-wb-error=')
  })
})
