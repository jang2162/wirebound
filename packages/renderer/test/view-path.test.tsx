// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { installCatalog, type PageDocument } from '@wirebound/schema'
import { Root, view, type ThemeDefinition, type ThemeManifest } from '@wirebound/theme-sdk'
import { renderDocument, type NodeRenderError } from '@wirebound/renderer'

beforeAll(() => {
  installCatalog()
})

// 이 저장소는 vitest `globals` 를 켜지 않아 RTL 이 cleanup 을 스스로 걸지 못한다.
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const base: ThemeManifest = { id: 't', name: 't', version: '0.0.0', sdk: '^1.0.0', tokens: { items: {} } }
const page = (children: unknown[]): PageDocument => ({ root: { id: 'root', type: 'Page', props: {}, children } }) as never

function draw(doc: PageDocument, theme: ThemeDefinition, errors: NodeRenderError[] = []) {
  return render(<>{renderDocument(doc, { theme, onNodeError: (e) => errors.push(e) })}</>)
}

describe('뷰 경로', () => {
  it('테마 뷰가 있으면 그것으로, 없으면 기본 뷰로 그린다', () => {
    const Button = view(({ props }) => (
      <Root as="button" className="mine">
        {String(props.label)}
      </Root>
    ))
    const { container } = draw(
      page([
        { id: 'b', type: 'Button', props: { label: '저장' } },
        { id: 't', type: 'Text', props: { content: '안녕' } },
      ]),
      { manifest: base, views: { Button } },
    )
    expect(container.querySelector('[data-wb-id="b"]')!.className).toBe('mine')
    expect(container.querySelector('[data-wb-id="t"]')!.getAttribute('data-wb-structure')).toBe('default')
  })

  it('뷰는 props · states · variant · children 을 받는다', () => {
    const seen: unknown[] = []
    const List = view((p) => {
      seen.push(p)
      return <Root />
    })
    draw(page([{ id: 'l', type: 'DataGrid', props: { loading: true }, variant: 'cards' }]), {
      manifest: { ...base, components: { DataGrid: { variants: [{ id: 'cards', label: '카드' }], defaultVariant: 'cards' } } },
      views: { DataGrid: List },
    })
    const p = seen[0] as { nodeId: string; states: string[]; variant: string; props: Record<string, unknown> }
    expect(p.nodeId).toBe('l')
    expect(p.states).toContain('loading')
    expect(p.variant).toBe('cards')
    expect(p.props.loading).toBe(true)
  })

  it('노드 속성: data-wb-structure 는 없고 variant · state 는 있다', () => {
    const List = view(() => <Root />)
    const { container } = draw(page([{ id: 'l', type: 'DataGrid', props: { loading: true }, variant: 'x' }]), {
      manifest: base,
      views: { DataGrid: List },
    })
    const el = container.querySelector('[data-wb-id="l"]')!
    expect(el.hasAttribute('data-wb-structure')).toBe(false)
    expect(el.getAttribute('data-wb-variant')).toBe('x')
    expect(el.getAttribute('data-wb-state')).toContain('loading')
  })

  it('manifest 에 없는 variant 는 defaultVariant 로 Root 에 실린다', () => {
    const List = view(() => <Root />)
    const manifest = { ...base, components: { DataGrid: { variants: [{ id: 'table', label: '표' }], defaultVariant: 'table' } } }
    const { container } = draw(page([{ id: 'l', type: 'DataGrid', props: {}, variant: 'featured' }]), {
      manifest,
      views: { DataGrid: List },
    })
    expect(container.querySelector('[data-wb-id="l"]')!.getAttribute('data-wb-variant')).toBe('table')
  })

  it('뷰가 던지면 그 노드만 폴백이 서고 형제는 산다', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const Button = view(() => {
      throw new Error('테마 버그')
    })
    const { container } = draw(
      page([
        { id: 'b', type: 'Button', props: { label: 'x' } },
        { id: 't', type: 'Text', props: { content: '산다' } },
      ]),
      { manifest: base, views: { Button } },
    )
    const fb = container.querySelector('[data-wb-id="b"]')!
    expect(fb.getAttribute('data-wb-error')).toContain('테마 버그')
    expect(screen.getByText('산다')).toBeTruthy()
  })

  it('뷰가 던진 뒤 문서가 바뀌면 다시 그려 본다 — 고친 노드가 폴백에 갇히지 않는다', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const Button = view(({ props }) => {
      if (props.label === '깨짐') throw new Error('테마 버그')
      return <Root as="button">{String(props.label)}</Root>
    })
    const theme = { manifest: base, views: { Button } }
    const doc = (label: string) => page([{ id: 'b', type: 'Button', props: { label } }])
    const { container, rerender } = render(<>{renderDocument(doc('깨짐'), { theme })}</>)
    expect(container.querySelector('[data-wb-id="b"]')!.hasAttribute('data-wb-error')).toBe(true)
    rerender(<>{renderDocument(doc('고침'), { theme })}</>)
    const el = container.querySelector('[data-wb-id="b"]')!
    expect(el.hasAttribute('data-wb-error')).toBe(false)
    expect(el.textContent).toBe('고침')
  })

  it('Root 를 안 그린 뷰는 기본 뷰로 다시 그리고 console.error 로 말한다', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Button = view(() => <button>Root 없음</button>)
    // 레이아웃 이펙트의 다시 그리기는 RTL `render` 의 act 안에서 끝난다 — 기다리지 않고 값으로 본다.
    const { container } = draw(page([{ id: 'b', type: 'Button', props: { label: '기본' } }]), { manifest: base, views: { Button } })
    expect(container.textContent).toBe('기본')
    expect(container.querySelector('[data-wb-id="b"]')!.getAttribute('data-wb-structure')).toBe('solid')
    expect(err.mock.calls.some((c) => String(c[0]).includes('Root'))).toBe(true)
  })

  // spec 「뷰 계약」: «`<Root>` 없이 **반환하면** … 기본 뷰로 대신 그린다» — 판정은 반환마다다. 한 번 빠뜨린 노드가 편집으로 Root 를
  // 그리게 되어도 기본 뷰에 갇히면 테마 모습이 그 노드에서 영영 사라진다(`ViewHost` 의 `missing` 이 되돌아오지 않는다). 뷰가 던진
  // 판은 «뷰가 던진 뒤 문서가 바뀌면 다시 그려 본다» 가 잰다 — 이 케이스는 Root 누락 쪽의 짝이다.
  it('Root 를 빠뜨렸던 뷰가 편집으로 Root 를 그리게 되면 테마 뷰로 돌아온다', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const Button = view(({ props }) =>
      props.label === '빠짐' ? (
        <button>Root 없음</button>
      ) : (
        <Root as="button" className="mine">
          {String(props.label)}
        </Root>
      ),
    )
    const theme = { manifest: base, views: { Button } }
    const doc = (label: string) => page([{ id: 'b', type: 'Button', props: { label } }])
    const { container, rerender } = render(<>{renderDocument(doc('빠짐'), { theme })}</>)
    const read = () => {
      const el = container.querySelector('[data-wb-id="b"]')!
      return { className: el.className, structure: el.getAttribute('data-wb-structure'), text: el.textContent }
    }
    const missing = read()
    rerender(<>{renderDocument(doc('고침'), { theme })}</>)
    expect({ missing, fixed: read() }).toEqual({
      missing: { className: '', structure: 'solid', text: '빠짐' },
      fixed: { className: 'mine', structure: null, text: '고침' },
    })
  })

  it('누락 판정이 선 노드의 형제만 고치면 경고가 되풀이되지 않는다 — 판정도 그대로다', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Button = view(() => <button>Root 없음</button>)
    const theme = { manifest: base, views: { Button } }
    const doc = (sibling: string) =>
      page([
        { id: 'b', type: 'Button', props: { label: '기본' } },
        { id: 't', type: 'Text', props: { content: sibling } },
      ])
    const warnings = () => err.mock.calls.filter((c) => String(c[0]).includes('Root')).length
    const { container, rerender } = render(<>{renderDocument(doc('하나'), { theme })}</>)
    const first = warnings()
    rerender(<>{renderDocument(doc('둘'), { theme })}</>)
    rerender(<>{renderDocument(doc('셋'), { theme })}</>)
    expect({
      first,
      afterSiblingEdits: warnings(),
      structure: container.querySelector('[data-wb-id="b"]')!.getAttribute('data-wb-structure'),
      sibling: container.querySelector('[data-wb-id="t"]')!.textContent,
    }).toEqual({ first: 1, afterSiblingEdits: 1, structure: 'solid', sibling: '셋' })
  })

  it('누락 판정이 선 노드를 고쳤는데도 Root 가 없으면 다시 말한다', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Button = view(() => <button>Root 없음</button>)
    const theme = { manifest: base, views: { Button } }
    const doc = (label: string) => page([{ id: 'b', type: 'Button', props: { label } }])
    const { container, rerender } = render(<>{renderDocument(doc('하나'), { theme })}</>)
    rerender(<>{renderDocument(doc('둘'), { theme })}</>)
    expect({
      warnings: err.mock.calls.filter((c) => String(c[0]).includes('Root')).length,
      text: container.querySelector('[data-wb-id="b"]')!.textContent,
    }).toEqual({ warnings: 2, text: '둘' })
  })

  it('props 검증 실패는 지금처럼 동기로 onNodeError 에 모인다', () => {
    const errors: NodeRenderError[] = []
    draw(page([{ id: 'b', type: 'Button', props: { label: 3 } }]), { manifest: base, views: {} }, errors)
    expect(errors.map((e) => e.nodeId)).toEqual(['b'])
  })

  it('theme 을 안 주면 기본 뷰로 그린다(NO_THEME)', () => {
    const { container } = render(<>{renderDocument(page([{ id: 'b', type: 'Button', props: { label: 'x' } }]))}</>)
    expect(container.querySelector('[data-wb-id="b"]')!.getAttribute('data-wb-structure')).toBe('solid')
  })
})
