// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Focus, NodeContext, Root, ThemeProvider, useToken, useWindow } from '@wirebound/theme-sdk'

// 이 저장소는 vitest `globals` 를 켜지 않아 RTL 이 cleanup 을 스스로 걸지 못한다.
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function bind(extra: Record<string, unknown> = {}) {
  const markRootRendered = vi.fn()
  const attrs = { 'data-wb-id': 'n1', 'data-wb-component': 'List', 'data-wb-variant': 'table', ...extra }
  return { value: { attrs, markRootRendered }, markRootRendered }
}

describe('Root', () => {
  it('as 태그로 그리고 노드 속성을 편다', () => {
    const { value, markRootRendered } = bind()
    const { container } = render(
      <NodeContext.Provider value={value}><Root as="table" className="t" /></NodeContext.Provider>,
    )
    const el = container.firstElementChild!
    expect(el.tagName).toBe('TABLE')
    expect(el.getAttribute('data-wb-id')).toBe('n1')
    expect(el.getAttribute('data-wb-variant')).toBe('table')
    expect(el.getAttribute('class')).toBe('t')
    expect(markRootRendered).toHaveBeenCalledTimes(1)
  })

  it('테마가 넘긴 data-wb-id 는 노드 것에 진다', () => {
    const { value } = bind()
    const { container } = render(
      <NodeContext.Provider value={value}><Root data-wb-id="가짜" /></NodeContext.Provider>,
    )
    expect(container.firstElementChild!.getAttribute('data-wb-id')).toBe('n1')
  })

  it('marker 를 속성 둘로 싣는다', () => {
    const { value } = bind()
    const { container } = render(
      <NodeContext.Provider value={value}>
        <Root marker={{ placement: 'top-end', offset: [4, -8] }} />
      </NodeContext.Provider>,
    )
    const el = container.firstElementChild!
    expect(el.getAttribute('data-wb-marker')).toBe('top-end')
    expect(el.getAttribute('data-wb-marker-offset')).toBe('4,-8')
  })

  it('marker 가 없으면 두 속성 다 없다', () => {
    const { value } = bind()
    const { container } = render(<NodeContext.Provider value={value}><Root /></NodeContext.Provider>)
    expect(container.firstElementChild!.hasAttribute('data-wb-marker')).toBe(false)
    expect(container.firstElementChild!.hasAttribute('data-wb-marker-offset')).toBe(false)
  })

  it('노드 바깥에서 쓰면 던진다', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Root />)).toThrow('Root 는 뷰 안에서만')
  })
})

describe('Focus', () => {
  it('자식을 감싸지 않고 data-wb-focus 를 더한다', () => {
    const { container } = render(<Focus><table className="x" /></Focus>)
    const el = container.firstElementChild!
    expect(el.tagName).toBe('TABLE')
    expect(el.hasAttribute('data-wb-focus')).toBe(true)
    expect(container.children).toHaveLength(1)
  })

  it('자식이 엘리먼트 하나가 아니면 던진다', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Focus>{'글자' as never}</Focus>)).toThrow('Focus 는 엘리먼트 하나')
  })
})

describe('useToken · useWindow', () => {
  it('프로바이더의 값을 읽는다', () => {
    const seen: unknown[] = []
    function Probe() { seen.push(useToken('density'), useToken('없음'), useWindow()); return null }
    const fake = {} as Window
    render(<ThemeProvider value={{ tokens: { density: 'compact' }, window: fake }}><Probe /></ThemeProvider>)
    expect(seen).toEqual(['compact', undefined, fake])
  })

  it('프로바이더가 없으면 토큰은 없고 창은 전역 창이다', () => {
    const seen: unknown[] = []
    function Probe() { seen.push(useToken('density'), useWindow()); return null }
    render(<Probe />)
    expect(seen).toEqual([undefined, window])
  })
})
