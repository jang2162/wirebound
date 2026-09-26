// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { focusElement, markerPoint } from '@wirebound/renderer'

function box(el: Element, left: number, top: number, width: number, height: number) {
  el.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON() {} }) as DOMRect
}

function node(html: string): Element {
  const host = document.createElement('div')
  host.innerHTML = html
  return host.firstElementChild!
}

describe('markerPoint', () => {
  const cases: [string, [number, number]][] = [
    ['top-start', [10, 20]], ['top-end', [110, 20]], ['bottom-start', [10, 70]],
    ['bottom-end', [110, 70]], ['start', [10, 45]], ['end', [110, 45]],
  ]
  for (const [placement, [x, y]] of cases) {
    it(placement, () => {
      const root = node(`<div data-wb-id="n" data-wb-marker="${placement}"></div>`)
      box(root, 10, 20, 100, 50)
      expect(markerPoint(root)).toEqual({ x, y })
    })
  }

  it('속성이 없으면 top-start · offset 0 — 지금 캔버스의 자리', () => {
    const root = node('<div data-wb-id="n"></div>')
    box(root, 10, 20, 100, 50)
    expect(markerPoint(root)).toEqual({ x: 10, y: 20 })
  })

  it('offset 을 더한다', () => {
    const root = node('<div data-wb-id="n" data-wb-marker="top-end" data-wb-marker-offset="4,-8"></div>')
    box(root, 10, 20, 100, 50)
    expect(markerPoint(root)).toEqual({ x: 114, y: 12 })
  })

  it('망가진 offset · placement 는 무시하고 기본값으로', () => {
    const root = node('<div data-wb-id="n" data-wb-marker="middle" data-wb-marker-offset="a,b"></div>')
    box(root, 10, 20, 100, 50)
    expect(markerPoint(root)).toEqual({ x: 10, y: 20 })
  })

  it('focus 요소가 있으면 그 상자가 기준이다', () => {
    const root = node('<div data-wb-id="n" data-wb-marker="bottom-end"><header></header><table data-wb-focus=""></table></div>')
    box(root, 0, 0, 300, 300)
    box(root.querySelector('table')!, 50, 60, 100, 40)
    expect(focusElement(root).tagName).toBe('TABLE')
    expect(markerPoint(root)).toEqual({ x: 150, y: 100 })
  })

  it('자식 노드 안의 focus 는 이 노드의 것이 아니다', () => {
    const root = node('<div data-wb-id="p"><div data-wb-id="c"><span data-wb-focus=""></span></div></div>')
    expect(focusElement(root)).toBe(root)
  })
})
