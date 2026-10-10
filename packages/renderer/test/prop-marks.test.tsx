// @vitest-environment jsdom
/**
 * **카탈로그 × prop 인구조사 — prop 마다 SDK 기본 뷰의 DOM 에 닿는 길이 있는가**(SDK `packages/theme-sdk/src/marks.ts` 의 표지 규칙).
 *
 * 표(`CENSUS`)는 카탈로그의 prop 전부를 한 칸씩 적는다 — 새 prop 이 표 없이 생기면 «표와 카탈로그가 같다» 가 죽는다. 칸마다 그 prop 이
 * 화면에 닿는 길(`route`)과, 기본값에서 바꿔 볼 값(`alt`)을 적는다.
 *
 * | route | 뜻 | 재는 것 |
 * |---|---|---|
 * | `mark` | SDK 표지 `data-wb-<prop>` | 루트의 그 속성 값 · `MARKED_PROPS` 와 표가 같다 |
 * | `state` | 렌더러의 `data-wb-state` | 상태 목록에 들고, `STATE_ARIA` 에 있으면 그 접근성 속성이 `true` |
 * | `variant` | 렌더러의 `data-wb-variant`(`variantFrom`) | 그 값 |
 * | `var` | 노드 변수(`--wb-node-*`) | DOM 이 바뀐다 |
 * | `text` | 글자 | DOM 이 바뀐다 |
 * | `markup` | 마크업의 모양(행 수 · 칸 · 속성) | DOM 이 바뀐다 |
 *
 * **규칙:** 불리언 · enum prop 은 `mark` · `state` · `variant` 셋 가운데 하나여야 한다 — 테마 CSS 가 셀렉터로 겨냥할 길이다. 그 밖의 꼴
 * (수 · 글자 · 목록)은 셋이 아니어야 한다. 모든 칸에서 «바꾸면 기본 뷰의 DOM 이 바뀐다» 를 함께 잰다 — 화면에 안 닿는 prop 이 없다.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { CATALOG_TYPES, THEMELESS_TYPES, installCatalog, requireComponent, type PageDocument } from '@wirebound/schema'
import { MARKED_PROPS, STATE_ARIA, markAttr } from '@wirebound/theme-sdk'
import { renderDocument } from '@wirebound/renderer'

beforeAll(() => {
  installCatalog()
})

// 이 저장소는 vitest `globals` 를 켜지 않아 RTL 이 cleanup 을 스스로 걸지 못한다.
afterEach(() => {
  cleanup()
})

type Route = 'mark' | 'state' | 'variant' | 'var' | 'text' | 'markup'

interface Cell {
  route: Route
  /** 기본값과 다른 값 — 이것으로 바꿔 그린 DOM 을 기본값 판과 견준다. */
  alt: unknown
}

const CENSUS: Record<string, Record<string, Cell>> = {
  Page: {},
  Slot: {},
  Section: { compact: { route: 'mark', alt: true } },
  Flex: {
    direction: { route: 'mark', alt: 'column' },
    align: { route: 'mark', alt: 'center' },
    justify: { route: 'mark', alt: 'between' },
    wrap: { route: 'mark', alt: true },
  },
  Grid: { columns: { route: 'var', alt: 3 } },
  Card: { title: { route: 'text', alt: '제목' }, subtitle: { route: 'text', alt: '부제' } },
  Tabs: { tabs: { route: 'text', alt: ['가', '나', '다'] }, active: { route: 'markup', alt: 1 } },
  List: {
    items: { route: 'markup', alt: 2 },
    columns: { route: 'text', alt: ['이름'] },
    pagination: { route: 'mark', alt: false },
    selectable: { route: 'mark', alt: true },
    selected: { route: 'state', alt: true },
    disabled: { route: 'state', alt: true },
    loading: { route: 'state', alt: true },
    empty: { route: 'state', alt: true },
  },
  Tree: {
    items: { route: 'text', alt: ['가'] },
    depth: { route: 'var', alt: 1 },
    selected: { route: 'state', alt: true },
    disabled: { route: 'state', alt: true },
  },
  KeyValue: {
    pairs: { route: 'text', alt: [{ key: '이름', value: '홍' }] },
    columns: { route: 'markup', alt: 2 },
  },
  SearchForm: { collapsed: { route: 'mark', alt: true } },
  EntryForm: { title: { route: 'text', alt: '제목' } },
  Field: {
    label: { route: 'text', alt: '이름' },
    control: { route: 'variant', alt: 'select' },
    placeholder: { route: 'text', alt: '입력' },
    required: { route: 'state', alt: true },
    disabled: { route: 'state', alt: true },
    invalid: { route: 'state', alt: true },
  },
  Button: {
    label: { route: 'text', alt: '저장' },
    disabled: { route: 'state', alt: true },
    loading: { route: 'state', alt: true },
  },
  Link: {
    label: { route: 'text', alt: '이동' },
    target: { route: 'markup', alt: 'detail' },
    disabled: { route: 'state', alt: true },
  },
  Text: { content: { route: 'text', alt: '안녕' }, role: { route: 'variant', alt: 'h1' } },
  Media: {
    kind: { route: 'mark', alt: 'video' },
    caption: { route: 'text', alt: '설명' },
    ratio: { route: 'mark', alt: '1/1' },
  },
  Divider: { direction: { route: 'variant', alt: 'vertical' } },
  Placeholder: { label: { route: 'text', alt: '자리' }, height: { route: 'var', alt: 200 } },
}

/** SDK 와 렌더러가 이미 쓰는 `data-wb-*` 이름 — 표지가 이것과 겹치면 셀렉터의 뜻이 갈린다. */
const RESERVED = [
  'data-wb-id', 'data-wb-component', 'data-wb-variant', 'data-wb-state', 'data-wb-structure', 'data-wb-part',
  'data-wb-focus', 'data-wb-marker', 'data-wb-marker-offset', 'data-wb-error', 'data-wb-cell',
]

interface ZodNode {
  def?: { type?: string; innerType?: ZodNode }
}

/** 감싼 것(`.default()` · `.optional()`)을 벗긴 prop 의 꼴 — `boolean` · `enum` · `number` · `string` · `array`. */
function leafType(type: string, prop: string): string {
  const shape = (requireComponent(type).props as unknown as { shape: Record<string, ZodNode> }).shape
  let cursor: ZodNode | undefined = shape[prop]
  while (cursor?.def?.innerType !== undefined) cursor = cursor.def.innerType
  const leaf = cursor?.def?.type
  if (leaf === undefined) throw new Error(`${type}.${prop} 의 꼴을 못 읽었다`)
  return leaf
}

function catalogProps(type: string): string[] {
  return Object.keys((requireComponent(type).props as unknown as { shape: Record<string, unknown> }).shape)
}

/** 노드 하나를 기본 뷰(테마 없음)로 그리고 그 루트를 준다. */
function root(type: string, props: Record<string, unknown>): Element {
  const doc = { version: 1, root: { id: 'page', type: 'Page', children: [{ id: 'n', type, props }] } } as unknown as PageDocument
  const { container } = render(<>{renderDocument(doc)}</>)
  const el = container.querySelector('[data-wb-id="n"]')
  if (el === null) throw new Error(`${type} 가 안 그려졌다`)
  return el
}

// `name` 은 케이스 이름 — vitest 의 `$type` 꼴은 이름에 안 풀려 `undefined` 로 찍힌다.
const CELLS = Object.entries(CENSUS).flatMap(([type, props]) => Object.entries(props).map(([prop, cell]) => ({ name: `${type}.${prop}`, type, prop, ...cell })))

describe('카탈로그 × prop 인구조사', () => {
  it('표와 카탈로그가 같다 — 타입 · prop 이 하나도 안 빠지고 더 없다', () => {
    // 카나리아 — 카탈로그가 비면(설치 전) 아래가 빈 것끼리 견준다.
    expect(CATALOG_TYPES.length).toBeGreaterThan(15)
    // 상태 영역 둘(`THEMELESS_TYPES`)은 기본 뷰가 없다 — 렌더러가 가지를 고르고 자식만 그린다. `StateCase.state`가 화면에 닿는 길(어느
    // 가지가 서는가)은 `view-state.test.tsx`가 잰다.
    const viewed = CATALOG_TYPES.filter((type) => !THEMELESS_TYPES.includes(type))
    expect(viewed.length).toBe(CATALOG_TYPES.length - 2)
    expect(Object.keys(CENSUS).sort()).toEqual([...viewed].sort())
    for (const type of viewed) expect(Object.keys(CENSUS[type]!).sort(), type).toEqual(catalogProps(type).sort())
  })

  it('불리언 · enum 은 표지 · 상태 · 변형 가운데 하나로 싣고, 그 밖의 꼴은 셋이 아니다', () => {
    const problems: string[] = []
    for (const { type, prop, route } of CELLS) {
      const def = requireComponent(type)
      const leaf = leafType(type, prop)
      const selectable = leaf === 'boolean' || leaf === 'enum'
      const expected = def.states.includes(prop) ? 'state' : def.variantFrom === prop ? 'variant' : selectable ? 'mark' : null
      if (expected !== null && route !== expected) problems.push(`${type}.${prop}(${leaf}) — 표 ${route} · 규칙 ${expected}`)
      if (expected === null && (route === 'mark' || route === 'state' || route === 'variant')) problems.push(`${type}.${prop}(${leaf}) — 표 ${route}`)
    }
    expect(problems).toEqual([])
  })

  it('SDK 의 표지 표(MARKED_PROPS)가 인구조사의 mark 칸과 같고 꼴이 맞다(불리언 flag · enum value)', () => {
    const fromCensus = CELLS.filter((c) => c.route === 'mark').map((c) => `${c.type}.${c.prop}:${leafType(c.type, c.prop) === 'boolean' ? 'flag' : 'value'}`)
    const fromSdk = Object.entries(MARKED_PROPS).flatMap(([type, props]) => Object.entries(props).map(([prop, kind]) => `${type}.${prop}:${kind}`))
    expect(fromSdk.sort()).toEqual(fromCensus.sort())
  })

  it('표지 이름은 이미 쓰는 data-wb-* 와 겹치지 않는다', () => {
    const names = Object.values(MARKED_PROPS).flatMap((props) => Object.keys(props).map(markAttr))
    expect(names.filter((name) => RESERVED.includes(name))).toEqual([])
  })

  it.each(CELLS)('$name($route) — 바꾸면 기본 뷰의 DOM 이 바뀐다', ({ type, prop, alt }) => {
    const before = root(type, {}).outerHTML
    cleanup()
    const after = root(type, { [prop]: alt }).outerHTML
    expect(after).not.toBe(before)
  })

  it.each(CELLS.filter((c) => c.route === 'mark'))('$name — 표지 $alt', ({ type, prop, alt }) => {
    const el = root(type, { [prop]: alt })
    const attr = markAttr(prop)
    if (typeof alt === 'boolean') expect(el.getAttribute(attr)).toBe(alt ? '' : null)
    else expect(el.getAttribute(attr)).toBe(alt)
  })

  it.each(CELLS.filter((c) => c.route === 'mark' && typeof c.alt === 'boolean'))('$name — 반대 값이면 표지가 없다/있다', ({ type, prop, alt }) => {
    // 불리언 표지는 참일 때만 선다 — 기본값 판에서 그 반대인지 본다(기본 참인 `pagination` 은 기본 판에 선다).
    expect(root(type, { [prop]: !alt }).getAttribute(markAttr(prop))).toBe(alt ? null : '')
  })

  // `Field` 의 `aria-required` · `aria-invalid` 는 역할 없는 루트가 아니라 `control` 조각에 선다(`default-views/input.tsx`).
  const ariaHolder = (type: string, el: Element, prop: string): Element =>
    type === 'Field' && (prop === 'required' || prop === 'invalid') ? el.querySelector('[data-wb-part="control"]')! : el

  it.each(CELLS.filter((c) => c.route === 'state'))('$name — 상태와 접근성 속성', ({ type, prop }) => {
    const el = root(type, { [prop]: true })
    expect((el.getAttribute('data-wb-state') ?? '').split(' ')).toContain(prop)
    const aria = STATE_ARIA[prop]
    if (aria !== undefined) expect(ariaHolder(type, el, prop).getAttribute(aria)).toBe('true')
    cleanup()
    // 꺼진 판에는 접근성 속성이 없다 — 늘 다는 변조를 잡는다.
    if (aria !== undefined) {
      const off = root(type, { [prop]: false })
      expect(ariaHolder(type, off, prop).hasAttribute(aria)).toBe(false)
    }
  })

  it.each(CELLS.filter((c) => c.route === 'variant'))('$name — data-wb-variant', ({ type, prop, alt }) => {
    expect(root(type, { [prop]: alt }).getAttribute('data-wb-variant')).toBe(alt)
  })
})
