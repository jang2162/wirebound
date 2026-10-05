// @vitest-environment jsdom
/**
 * 화면 상태 — 렌더러가 상태 영역(`StateSwitch`)에서 지금 상태의 가지 하나를 고르고, 가지(`StateCase`)는 자식만 그린다. 둘 다 DOM 요소를
 * 남기지 않는다(테마 뷰가 없는 투명 노드 — `THEMELESS_TYPES`). 설계 spec `docs/superpowers/specs/2026-10-05-page-states-design.md`
 * 「상태 영역 노드」의 «그리기».
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, type LayoutDocument, type PageDocument, type WbNode } from '@wirebound/schema'
import { renderComposed, renderDocument, renderNode, type NodeRenderError } from '@wirebound/renderer'

beforeAll(() => {
  installCatalog()
})

afterEach(() => {
  cleanup()
})

const text = (id: string): WbNode => ({ id, type: 'Text', props: { content: id } })
const caseOf = (id: string, state: string, children: WbNode[]): WbNode => ({ id, type: 'StateCase', props: { state }, children })

function doc(children: WbNode[], viewStates = [{ id: 's_admin', name: '관리자' }, { id: 's_guest', name: '비로그인' }]): PageDocument {
  return { version: 1, root: { id: 'n_root', type: 'Page', children }, viewStates }
}

/** 기본 · 관리자 가지를 가진 영역 하나와 영역 밖 글 하나. 비로그인은 가지가 없다. */
const REGION: WbNode[] = [
  text('n_out'),
  {
    id: 'n_sw',
    type: 'StateSwitch',
    children: [caseOf('n_c0', 'default', [text('n_base')]), caseOf('n_c1', 's_admin', [text('n_admin'), text('n_admin2')])],
  },
]

function drawn(element: ReturnType<typeof renderDocument>): { ids: string[]; container: HTMLElement } {
  const { container } = render(<>{element}</>)
  const ids = [...container.querySelectorAll('[data-wb-id]')].map((el) => el.getAttribute('data-wb-id')!)
  return { ids, container }
}

describe('상태 영역 그리기', () => {
  it('상태를 안 주면 기본 가지를 그린다', () => {
    expect(drawn(renderDocument(doc(REGION))).ids).toEqual(['n_root', 'n_out', 'n_base'])
  })

  it('그 상태의 가지를 그리고 기본 가지는 안 그린다', () => {
    expect(drawn(renderDocument(doc(REGION), { viewState: 's_admin' })).ids).toEqual(['n_root', 'n_out', 'n_admin', 'n_admin2'])
  })

  it('그 상태의 가지가 없으면 기본 가지를 그린다', () => {
    expect(drawn(renderDocument(doc(REGION), { viewState: 's_guest' })).ids).toEqual(['n_root', 'n_out', 'n_base'])
  })

  it('목록에 없는 상태를 고르면 기본이다 — 그 상태의 가지가 문서에 있어도', () => {
    const stale = doc(REGION, [{ id: 's_guest', name: '비로그인' }])
    expect(drawn(renderDocument(stale, { viewState: 's_admin' })).ids).toEqual(['n_root', 'n_out', 'n_base'])
    expect(drawn(renderDocument(doc(REGION), { viewState: 's_nope' })).ids).toEqual(['n_root', 'n_out', 'n_base'])
  })

  it('목록이 없는 문서는 늘 기본이다', () => {
    const plain: PageDocument = { version: 1, root: { id: 'n_root', type: 'Page', children: REGION } }
    expect(drawn(renderDocument(plain, { viewState: 's_admin' })).ids).toEqual(['n_root', 'n_out', 'n_base'])
  })

  it('영역 · 가지는 DOM 요소를 남기지 않는다 — 가지 안 노드가 부모 뷰의 자리에 바로 선다', () => {
    const { container } = drawn(renderDocument(doc(REGION), { viewState: 's_admin' }))
    expect(container.querySelector('[data-wb-component="StateSwitch"], [data-wb-component="StateCase"]')).toBeNull()
    const admin = container.querySelector('[data-wb-id="n_admin"]')!
    expect(admin.parentElement?.closest('[data-wb-id]')?.getAttribute('data-wb-id')).toBe('n_root')
  })

  it('상태 영역 안의 상태 영역도 같은 상태로 고른다', () => {
    const inner: WbNode = {
      id: 'n_in',
      type: 'StateSwitch',
      children: [caseOf('n_ic0', 'default', [text('n_inner_base')]), caseOf('n_ic1', 's_admin', [text('n_inner_admin')])],
    }
    const nested = doc([{ id: 'n_sw', type: 'StateSwitch', children: [caseOf('n_c0', 'default', [inner])] }])
    expect(drawn(renderDocument(nested, { viewState: 's_admin' })).ids).toEqual(['n_root', 'n_inner_admin'])
    expect(drawn(renderDocument(nested)).ids).toEqual(['n_root', 'n_inner_base'])
  })

  it('가지 안 노드에 마커 · 선택 표지가 그대로 선다', () => {
    const marked = doc([
      { id: 'n_sw', type: 'StateSwitch', children: [caseOf('n_c0', 'default', [{ ...text('n_base'), marker: 3 }])] },
    ])
    const { container } = drawn(renderDocument(marked))
    const el = container.querySelector('[data-wb-id="n_base"]')!
    expect(el.getAttribute('data-wb-component')).toBe('Text')
    // 번호는 문서의 노드가 들고 화면(캔버스 · 뷰어)이 `data-wb-id`로 그 노드의 요소를 찾아 단다 — 요소가 서면 마커가 선다.
    expect(container.querySelectorAll('[data-wb-id="n_base"]')).toHaveLength(1)
  })

  it('그릴 가지가 없는 영역은 아무것도 안 그리고 오류를 알린다 — 던지지 않는다', () => {
    const errors: NodeRenderError[] = []
    const broken = doc([{ id: 'n_sw', type: 'StateSwitch', children: [caseOf('n_c1', 's_admin', [text('n_admin')]), text('n_stray')] }])
    const { ids } = drawn(renderDocument(broken, { onNodeError: (error) => errors.push(error) }))
    expect(ids).toEqual(['n_root'])
    expect(errors).toEqual([{ nodeId: 'n_sw', type: 'StateSwitch', message: '상태 영역에 그릴 기본 가지가 없습니다' }])
  })

  it('영역 밖에 선 가지는 자식만 그린다', () => {
    expect(drawn(renderDocument(doc([caseOf('n_c0', 'default', [text('n_t')])]))).ids).toEqual(['n_root', 'n_t'])
  })

  it('renderNode 는 받은 상태를 그대로 쓴다 — 목록이 없다', () => {
    const sw = REGION[1]!
    const { container } = render(<>{renderNode(sw, { viewState: 's_admin' })}</>)
    expect([...container.querySelectorAll('[data-wb-id]')].map((el) => el.getAttribute('data-wb-id'))).toEqual(['n_admin', 'n_admin2'])
  })

  it('레이아웃의 영역은 페이지의 상태를 따르지 않는다 — 레이아웃에는 상태 목록이 없다', () => {
    const layout: LayoutDocument = {
      version: 1,
      root: {
        id: 'l_root',
        type: 'Page',
        children: [
          { id: 'l_sw', type: 'StateSwitch', children: [caseOf('l_c0', 'default', [text('l_base')]), caseOf('l_c1', 's_admin', [text('l_admin')])] },
          { id: 'l_slot', type: 'Slot' },
        ],
      },
    }
    const ids = drawn(renderComposed(layout, doc(REGION), { viewState: 's_admin' })).ids
    expect(ids).toEqual(['l_root', 'l_base', 'l_slot', 'n_root', 'n_out', 'n_admin', 'n_admin2'])
  })
})
