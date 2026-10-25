// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Focus, NodeContext, Root, ThemeProvider, useToken, useWindow, view, type ViewProps } from '@wirebound/theme-sdk'

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
      <NodeContext.Provider value={value}>
        <Root as="table" className="t" />
      </NodeContext.Provider>,
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
      <NodeContext.Provider value={value}>
        <Root data-wb-id="가짜" />
      </NodeContext.Provider>,
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
    const { container } = render(
      <NodeContext.Provider value={value}>
        <Root />
      </NodeContext.Provider>,
    )
    expect(container.firstElementChild!.hasAttribute('data-wb-marker')).toBe(false)
    expect(container.firstElementChild!.hasAttribute('data-wb-marker-offset')).toBe(false)
  })

  it('노드 바깥에서 쓰면 던진다', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Root />)).toThrow('Root 는 뷰 안에서만')
  })
})

describe('prop 표지 · 상태의 접근성 속성(view → Root)', () => {
  /** 노드 `n1` 의 바인딩 아래 `view()` 로 짠 뷰를 그린다. */
  function drawView(V: ReturnType<typeof view>, props: Partial<ViewProps>, nodeId = 'n1') {
    const { value } = bind({ 'data-wb-id': nodeId, 'data-wb-component': props.type ?? 'Section' })
    const full: ViewProps = {
      nodeId: 'n1',
      type: 'Section',
      props: {},
      states: [],
      variant: undefined,
      children: null,
      zones: {},
      zoneItems: {},
      items: [],
      slot: null,
      ...props,
    }
    return render(
      <NodeContext.Provider value={value}>
        <V {...full} />
      </NodeContext.Provider>,
    ).container.firstElementChild!
  }

  it('view 로 짠 뷰의 Root 가 표지 · 접근성 속성을 편다', () => {
    const V = view(() => <Root as="section" />)
    const el = drawView(V, { type: 'Section', props: { compact: true } })
    expect(el.getAttribute('data-wb-compact')).toBe('')
    const field = drawView(
      view(() => <Root />),
      { type: 'Field', props: {}, states: ['required', 'invalid'] },
    )
    expect([field.getAttribute('aria-required'), field.getAttribute('aria-invalid'), field.hasAttribute('aria-disabled')]).toEqual([
      'true',
      'true',
      false,
    ])
  })

  it('표지는 테마가 넘긴 같은 이름을 이긴다 · 접근성 속성은 테마가 덮는다', () => {
    const V = view(() => <Root data-wb-compact="테마" aria-busy={undefined} />)
    const el = drawView(V, { type: 'Section', props: { compact: true }, states: ['loading'] })
    expect(el.getAttribute('data-wb-compact')).toBe('')
    expect(el.hasAttribute('aria-busy')).toBe(false)
  })

  it('노드 id 가 다른 문맥은 안 편다 — view 를 거치지 않은 안쪽 뷰가 부모의 표지를 읽지 않게', () => {
    // 부모 뷰(`view` — 문맥을 낸다) 안에서 다른 노드(`n2`)의 바인딩으로 맨 함수 뷰가 `Root` 를 그린 판.
    const Inner = () => <Root as="span" />
    const { value } = bind({ 'data-wb-id': 'n2' })
    const Outer = view(() => (
      <Root as="section">
        <NodeContext.Provider value={value}>
          <Inner />
        </NodeContext.Provider>
      </Root>
    ))
    const outer = drawView(Outer, { type: 'Section', props: { compact: true }, states: ['disabled'] })
    const inner = outer.querySelector('span')!
    expect(outer.getAttribute('data-wb-compact')).toBe('')
    expect([inner.hasAttribute('data-wb-compact'), inner.hasAttribute('aria-disabled')]).toEqual([false, false])
  })
})

describe('Focus', () => {
  it('자식을 감싸지 않고 data-wb-focus 를 더한다', () => {
    const { container } = render(
      <Focus>
        <table className="x" />
      </Focus>,
    )
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
    function Probe() {
      seen.push(useToken('density'), useToken('없음'), useWindow())
      return null
    }
    const fake = {} as Window
    render(
      <ThemeProvider value={{ tokens: { density: 'compact' }, window: fake }}>
        <Probe />
      </ThemeProvider>,
    )
    expect(seen).toEqual(['compact', undefined, fake])
  })

  it('프로바이더가 없으면 토큰은 없고 창은 전역 창이다', () => {
    const seen: unknown[] = []
    function Probe() {
      seen.push(useToken('density'), useWindow())
      return null
    }
    render(<Probe />)
    expect(seen).toEqual([undefined, window])
  })
})
