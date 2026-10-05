// @vitest-environment jsdom
/**
 * system-admin 은 뷰를 내지 않는다 — 표 · 격자 표가 SDK 기본 뷰의 DOM 이고, 그 DOM 이 props(`selectable` · `empty` · `loading` · `columns`)로
 * 바뀌는 것은 `packages/renderer/test/default-view-props.test.tsx` 가 잰다. 여기서는 관리자 판에서 외곽선 · 번호 마커의 기준 상자(렌더러의
 * `focusElement` · `markerPoint` 가 DOM 에서 읽는다)가 표 전체인지만 본다.
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

/** 노드 하나를 `Page` 안에 그리고 그 노드의 루트 요소를 준다. */
function draw(node: WbNode): Element {
  const doc: PageDocument = { version: 1, root: { id: 'page', type: 'Page', children: [node] } }
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => root.render(renderDocument(doc, { theme: ADMIN_V0 })))
  unmount = () => act(() => root.unmount())
  const el = host.querySelector(`[data-wb-id="${node.id}"]`)
  if (el === null) throw new Error(`${node.id} 가 안 그려졌다`)
  return el
}

describe('표의 기준 상자', () => {
  it('List — 루트가 표 전체 — 외곽선 · 마커의 기준 상자가 루트다', () => {
    const el = draw({ id: 'list', type: 'List', props: { items: 3, columns: ['이름', '상태'], selectable: true } })
    expect(el.tagName).toBe('TABLE')
    expect(focusElement(el)).toBe(el)
    expect(el.hasAttribute('data-wb-marker')).toBe(false)
  })

  it('KeyValue — 루트가 표 전체 — 외곽선 · 마커의 기준 상자가 루트다', () => {
    const el = draw({ id: 'kv', type: 'KeyValue', props: { pairs: [{ key: '이름', value: '홍' }], columns: 3 } })
    expect(el.tagName).toBe('TABLE')
    expect(focusElement(el)).toBe(el)
    expect(el.hasAttribute('data-wb-marker')).toBe(false)
  })
})

it('테마가 내는 뷰가 없다 — 전부 SDK 기본 뷰', () => {
  expect(Object.keys(ADMIN_V0.views)).toEqual([])
})
