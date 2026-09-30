// @vitest-environment jsdom
/**
 * system-portal 의 뷰 — variant 마다 그 DOM 의 표지와, 코멘트 번호 마커 · 선택 외곽선의 자리.
 *
 * 뷰를 쓴 것은 옛 구조가 기본 뷰와 DOM 이 달랐던 다섯이다(`List:stackedList` · `Tree:accordion` · `KeyValue:definitionList` ·
 * `SearchForm:collapsible` · `EntryForm:sectioned`). 곁의 variant(admin 의 구조)는 SDK 기본 뷰를 그대로 부른다. `Card:bordered` ·
 * `Tabs:enclosed` 는 옛 구현체가 기본 구조와 DOM 이 같았다 — 뷰 없이 시트로만 갈린다.
 *
 * DOM 의 값은 jsdom 의 값이다. 좌표(마커 · 외곽선)는 jsdom 이 계산하지 않아 상자를 손으로 주고 `markerPoint` 가 어느 요소를 재는지만 본다.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, type WbNode } from '@wirebound/schema'
import { DEFAULT_VIEWS, ThemeProvider } from '@wirebound/theme-sdk'
import { focusElement, markerPoint, renderDocument } from '@wirebound/renderer'
import { PORTAL_THEME } from '@wirebound/system-theme-portal'

beforeAll(() => installCatalog())
// 이 저장소는 vitest `globals` 를 켜지 않아 RTL 이 cleanup 을 스스로 걸지 못한다.
afterEach(() => cleanup())

const field = (id: string, label: string): WbNode => ({ id, type: 'Field', props: { label } })

/** 노드 하나를 Page 아래 그리고 그 노드의 루트를 돌려준다. 뷰가 던지면 폴백이 서므로 `data-wb-error` 도 함께 본다. */
function draw(node: WbNode): Element {
  const doc = { version: 1, root: { id: 'page', type: 'Page', props: {}, children: [node] } } as never
  const { container } = render(
    <ThemeProvider value={{ tokens: {}, window }}>{renderDocument(doc, { theme: PORTAL_THEME })}</ThemeProvider>,
  )
  expect(container.querySelector('[data-wb-error]')).toBeNull()
  const root = container.querySelector(`[data-wb-id="${node.id}"]`)
  if (root === null) throw new Error(`노드가 안 그려졌다: ${node.id}`)
  return root
}

const parts = (root: Element, part: string) => [...root.querySelectorAll(`[data-wb-part="${part}"]`)]

describe('뷰를 쓴 컴포넌트는 옛 구조의 DOM 으로 그린다', () => {
  it.each(['stackedList', 'featured', 'compact'])('List:%s — 제목 · 날짜 줄(ul/li)', (variant) => {
    const root = draw({ id: 'l', type: 'List', variant, props: { items: 3, pagination: true } })
    expect(root.tagName).toBe('UL')
    expect(root.getAttribute('data-wb-structure')).toBe('stackedList')
    expect(root.getAttribute('data-wb-variant')).toBe(variant)
    expect(parts(root, 'item').map((li) => li.tagName)).toEqual(['LI', 'LI', 'LI'])
    for (const li of parts(root, 'item')) expect([...li.children].map((c) => c.getAttribute('data-wb-part'))).toEqual(['title', 'meta'])
    expect(parts(root, 'pagination')).toHaveLength(1)
  })

  it('List:stackedList — 페이지네이션을 끄면 그 줄이 없다', () => {
    expect(parts(draw({ id: 'l', type: 'List', props: { items: 2, pagination: false } }), 'pagination')).toHaveLength(0)
  })

  it('Tree:accordion — 첫 마디만 펴지고 깊이를 중첩이 나른다', () => {
    const root = draw({ id: 't', type: 'Tree', props: { items: ['뿌리', '가지', '잎'], depth: 3 } })
    expect(root.getAttribute('data-wb-structure')).toBe('accordion')
    const top = [...root.children]
    expect(top.map((li) => li.getAttribute('data-wb-part'))).toEqual(['node', 'node', 'node'])
    // 첫 마디 아래 panel 이 depth − 1 단 중첩된다. 나머지 마디는 접혀 있다.
    expect(top[0]!.querySelectorAll('[data-wb-part="panel"]')).toHaveLength(2)
    expect(top[1]!.querySelector('[data-wb-part="panel"]')).toBeNull()
    expect(top[0]!.querySelector('[data-wb-part="toggle"]')!.textContent).toBe('▾')
    expect(top[1]!.querySelector('[data-wb-part="toggle"]')!.textContent).toBe('▸')
    // 들여쓰기 단계를 노드 변수로 싣지 않는다 — 실으면 중첩과 곱셈이 겹쳐 두 번 들여쓴다.
    expect(root.outerHTML).not.toContain('--wb-node-tree-level')
  })

  it('KeyValue:definitionList — dl 안의 dt/dd 짝', () => {
    const root = draw({ id: 'k', type: 'KeyValue', props: { pairs: [{ key: '작성일', value: '오늘' }, { key: '부서', value: '총무' }] } })
    expect(root.tagName).toBe('DL')
    expect(root.getAttribute('data-wb-structure')).toBe('definitionList')
    expect(parts(root, 'row').map((row) => [...row.children].map((c) => c.tagName))).toEqual([['DT', 'DD'], ['DT', 'DD']])
  })

  it('SearchForm:collapsible — 펴지면 머리줄 · 필드 · 동작, 접히면 머리줄만', () => {
    const open = draw({ id: 's', type: 'SearchForm', props: { collapsed: false }, children: [field('s-a', '검색어')] })
    expect(open.getAttribute('data-wb-structure')).toBe('collapsible')
    expect([...open.children].map((c) => c.getAttribute('data-wb-part'))).toEqual(['toggle', 'fields', 'actions'])
    expect(open.querySelector('[data-wb-id="s-a"]')).not.toBeNull()
    cleanup()
    const closed = draw({ id: 's', type: 'SearchForm', props: { collapsed: true }, children: [field('s-a', '검색어')] })
    expect([...closed.children].map((c) => c.getAttribute('data-wb-part'))).toEqual(['toggle'])
    // 접히면 자식도 사라진다 — 감추기(display:none)가 아니라 DOM 이라 시트가 되살릴 수 없다.
    expect(closed.querySelector('[data-wb-id="s-a"]')).toBeNull()
  })

  it('EntryForm:sectioned — 최상위 자식 하나가 구획 하나', () => {
    const root = draw({ id: 'e', type: 'EntryForm', props: { title: '민원 신청' }, children: [field('e-a', '이름'), field('e-b', '내용')] })
    expect(root.getAttribute('data-wb-structure')).toBe('sectioned')
    expect(parts(root, 'label').filter((el) => el.closest('[data-wb-id]') === root).map((el) => el.textContent)).toEqual(['민원 신청'])
    const sections = parts(root, 'section')
    expect(sections).toHaveLength(2)
    expect(sections.map((s) => s.querySelector('[data-wb-part="sectionTitle"]')!.textContent)).toEqual(['구획 1', '구획 2'])
    expect(sections.map((s) => s.querySelector('[data-wb-part="row"] > [data-wb-id]')!.getAttribute('data-wb-id'))).toEqual(['e-a', 'e-b'])
  })

  it('EntryForm:sectioned — 제목이 비면 label 조각이 없다', () => {
    const root = draw({ id: 'e', type: 'EntryForm', props: {}, children: [field('e-a', '이름')] })
    expect([...root.children].map((c) => c.getAttribute('data-wb-part'))).toEqual(['section', 'actions'])
  })
})

/** 곁의 variant 는 admin 의 구조 — SDK 기본 뷰의 DOM 과 글자까지 같다(`data-wb-variant` 만 다르다). */
describe('곁의 variant 는 기본 뷰로 그린다', () => {
  const defaults = { theme: { manifest: PORTAL_THEME.manifest, views: DEFAULT_VIEWS } }

  it.each([
    ['List', 'table', { items: 2, columns: ['제목', '날짜'], pagination: true }, []],
    ['Tree', 'indent', { items: ['뿌리', '가지'], depth: 2 }, []],
    ['KeyValue', 'table', { pairs: [{ key: '작성일', value: '오늘' }] }, []],
    ['SearchForm', 'inline', {}, [field('x-a', '검색어')]],
    ['EntryForm', 'labelLeft', { title: '가입' }, [field('x-a', '이름')]],
  ] as const)('%s:%s', (type, variant, props, children) => {
    const node = { id: 'x', type, variant, props, children: [...children] } as WbNode
    const mine = draw(node).outerHTML
    cleanup()
    const doc = { version: 1, root: { id: 'page', type: 'Page', props: {}, children: [node] } } as never
    const { container } = render(<ThemeProvider value={{ tokens: {}, window }}>{renderDocument(doc, defaults)}</ThemeProvider>)
    expect(mine).toBe(container.querySelector('[data-wb-id="x"]')!.outerHTML)
    expect(mine).toContain(`data-wb-variant="${variant}"`)
  })
})

/**
 * 선택 외곽선 · 번호 마커는 뷰의 루트를 잰다 — 다섯 뷰 모두 루트가 곧 보이는 상자다(목록의 위쪽 굵은 선 · 폼의 테두리가 루트에
 * 걸린다). 그래서 `<Focus>` 도 `marker` 도 두지 않는다. 자식 노드(`Field`)의 자리가 부모의 외곽선으로 새지 않는지도 본다.
 */
describe('마커 · 외곽선은 뷰의 루트를 따른다', () => {
  it.each([
    { id: 'n', type: 'List', props: { items: 2 } },
    { id: 'n', type: 'Tree', props: { items: ['뿌리', '가지'], depth: 3 } },
    { id: 'n', type: 'KeyValue', props: {} },
    { id: 'n', type: 'SearchForm', props: {}, children: [field('n-a', '검색어')] },
    { id: 'n', type: 'SearchForm', props: { collapsed: true }, children: [field('n-a', '검색어')] },
    { id: 'n', type: 'EntryForm', props: { title: '신청' }, children: [field('n-a', '이름')] },
  ] as WbNode[])('$type $props', (node) => {
    const root = draw(node)
    expect(focusElement(root)).toBe(root)
    expect(root.hasAttribute('data-wb-marker')).toBe(false)
    root.getBoundingClientRect = () => ({ left: 10, top: 20, width: 300, height: 40, right: 310, bottom: 60, x: 10, y: 20, toJSON() {} }) as DOMRect
    expect(markerPoint(root)).toEqual({ x: 10, y: 20 })
  })
})
