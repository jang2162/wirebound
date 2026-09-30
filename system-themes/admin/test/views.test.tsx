// @vitest-environment jsdom
/**
 * system-admin 이 낸 뷰(`List` · `KeyValue`)의 DOM. 두 뷰는 SDK 기본 뷰가 안 읽는 props 만 더 그린다 — 그 props 가 꺼져 있으면 기본 뷰와 DOM 이
 * 같아야 `theme.css` 가 기본 뷰 판과 같은 자리에 닿는다. 외곽선 · 번호 마커의 자리는 렌더러의 `focusElement` · `markerPoint` 가 DOM 에서 읽는다.
 */
import { installCatalog, type PageDocument, type WbNode } from '@wirebound/schema'
import { focusElement, renderDocument } from '@wirebound/renderer'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { ADMIN_V0 } from '@wirebound/system-theme-admin'

beforeAll(() => {
  installCatalog()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

let unmount: (() => void) | null = null
afterEach(() => {
  unmount?.()
  unmount = null
  document.body.innerHTML = ''
})

/**
 * 노드 하나를 `Page` 안에 그리고 그 노드의 루트 요소를 준다. `base` 면 같은 manifest 에 뷰만 비운 테마로 그린다 — 렌더러가 SDK 기본 뷰로
 * 그리고, variant 판정(`data-wb-variant`)은 테마 판과 같다.
 */
function draw(node: WbNode, base = false): Element {
  const doc: PageDocument = { version: 1, root: { id: 'page', type: 'Page', children: [node] } }
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => root.render(renderDocument(doc, { theme: base ? { ...ADMIN_V0, views: {} } : ADMIN_V0 })))
  unmount = () => act(() => root.unmount())
  const el = host.querySelector(`[data-wb-id="${node.id}"]`)
  if (el === null) throw new Error(`${node.id} 가 안 그려졌다`)
  return el
}

/** 기본 뷰로 그린 같은 노드의 HTML. */
function baseHtml(node: WbNode): string {
  const html = draw(node, true).outerHTML
  unmount?.()
  unmount = null
  document.body.innerHTML = ''
  return html
}

const parts = (el: Element, part: string) => Array.from(el.querySelectorAll(`[data-wb-part="${part}"]`))

describe('List 뷰', () => {
  const plain: WbNode = { id: 'list', type: 'List', props: { items: 3, columns: ['이름', '상태'], pagination: true } }

  it('선택 · 빈 · 로딩이 꺼져 있으면 기본 뷰와 DOM 이 같다', () => {
    const base = baseHtml(plain)
    expect(draw(plain).outerHTML).toBe(base)
  })

  it('selectable — 머리와 행마다 맨 앞에 체크 칸', () => {
    const el = draw({ ...plain, props: { ...plain.props, selectable: true } })
    const rows = Array.from(el.querySelectorAll('tr'))
    // 머리 1 · 행 3 · 쪽 번호 1 — 쪽 번호 칸은 체크 칸을 안 갖고 한 칸이 전부를 덮는다.
    expect(rows.map((tr) => tr.firstElementChild?.getAttribute('data-wb-cell') ?? null)).toEqual(['check', 'check', 'check', 'check', null])
    expect(parts(el, 'checkbox')).toHaveLength(4)
    expect(parts(el, 'pagination')[0]!.getAttribute('colspan')).toBe('3')
  })

  it('empty — 행 대신 «데이터가 없습니다» 한 줄이 모든 칸을 덮는다', () => {
    const el = draw({ ...plain, props: { ...plain.props, empty: true, selectable: true } })
    expect(el.querySelectorAll('tbody tr')).toHaveLength(1)
    const empty = parts(el, 'empty')
    expect(empty.map((cell) => [cell.textContent, cell.getAttribute('colspan')])).toEqual([['데이터가 없습니다', '3']])
    expect(el.getAttribute('data-wb-state')).toContain('empty')
  })

  it('loading — 칸마다 — 대신 막대', () => {
    const el = draw({ ...plain, props: { ...plain.props, loading: true } })
    expect(parts(el, 'skeleton')).toHaveLength(3 * 2)
    expect(el.querySelector('tbody')!.textContent).toBe('')
  })

  it('루트가 표 전체 — 외곽선 · 마커의 기준 상자가 루트다(기본 뷰와 같은 자리)', () => {
    const el = draw({ ...plain, props: { ...plain.props, selectable: true } })
    expect(el.tagName).toBe('TABLE')
    expect(focusElement(el)).toBe(el)
    expect(el.hasAttribute('data-wb-marker')).toBe(false)
  })
})

describe('KeyValue 뷰', () => {
  const pairs = [
    { key: '이름', value: '홍' },
    { key: '나이', value: '3' },
    { key: '부서', value: '개발' },
  ]

  it('columns 1 이면 기본 뷰와 DOM 이 같다', () => {
    const node: WbNode = { id: 'kv', type: 'KeyValue', props: { pairs, columns: 1 } }
    const base = baseHtml(node)
    expect(draw(node).outerHTML).toBe(base)
  })

  it('columns 쌍씩 한 행 — 모자란 마지막 행은 빈 칸 하나가 나머지 폭을 덮는다', () => {
    const el = draw({ id: 'kv', type: 'KeyValue', props: { pairs, columns: 2 } })
    const rows = Array.from(el.querySelectorAll('tr'))
    expect(rows.map((tr) => Array.from(tr.children).map((cell) => `${cell.getAttribute('data-wb-part')}:${cell.textContent}:${cell.getAttribute('colspan') ?? 1}`))).toEqual([
      ['key:이름:1', 'value:홍:1', 'key:나이:1', 'value:3:1'],
      ['key:부서:1', 'value:개발:1', 'filler::2'],
    ])
    expect(rows.every((tr) => tr.getAttribute('data-wb-part') === 'row')).toBe(true)
  })

  it('루트가 표 전체 — 외곽선 · 마커의 기준 상자가 루트다', () => {
    const el = draw({ id: 'kv', type: 'KeyValue', props: { pairs, columns: 3 } })
    expect(el.tagName).toBe('TABLE')
    expect(focusElement(el)).toBe(el)
    expect(el.hasAttribute('data-wb-marker')).toBe(false)
  })
})

it('테마가 내는 뷰는 List · KeyValue 둘 — 나머지는 SDK 기본 뷰', () => {
  expect(Object.keys(ADMIN_V0.views).sort()).toEqual(['KeyValue', 'List'])
})
