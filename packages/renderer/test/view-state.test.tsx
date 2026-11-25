// @vitest-environment jsdom
/**
 * 화면 상태 — 렌더러가 지금 상태에서 숨은 노드(`isVisibleIn` — 노드 보임 · 물려받기)를 그 자손째 그리지 않는다(설계 spec
 * `docs/superpowers/specs/2026-10-18-modules-states-layout-design.md` 「C5」 · 계획 V3 Task 2 Step 4). 숨은 노드는 DOM 요소가 없어 마커 ·
 * 선택 외곽선을 걸 자리가 없다.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, type NodeVisibility, type PageDocument, type ViewState, type WbNode } from '@wirebound/schema'
import { renderDocument, renderNode, type NodeRenderError } from '@wirebound/renderer'

beforeAll(() => {
  installCatalog()
})

afterEach(() => {
  cleanup()
})

const text = (id: string, visibility?: NodeVisibility, extra: Partial<WbNode> = {}): WbNode => ({
  id,
  type: 'Text',
  props: { content: id },
  ...(visibility === undefined ? {} : { visibility }),
  ...extra,
})

const STATES: ViewState[] = [
  { id: 's_login', name: '로그인' },
  { id: 's_admin', name: '관리자', parent: 's_login' },
  { id: 's_guest', name: '비로그인' },
]

function doc(children: WbNode[], viewStates: ViewState[] = STATES): PageDocument {
  return { version: 2, root: { id: 'n_root', type: 'Page', children }, viewStates }
}

/** 늘 보이는 글 · 기본에서만 · 로그인(과 관리자)에서만 · 관리자에서 숨김 · 로그인 카드 안 글. */
const TREE: WbNode[] = [
  text('n_out'),
  text('n_base', { mode: 'only', states: ['default'] }),
  text('n_login', { mode: 'only', states: ['s_login'] }),
  text('n_noadmin', { mode: 'except', states: ['s_admin'] }),
  { id: 'n_card', type: 'Card', visibility: { mode: 'only', states: ['s_login'] }, children: [text('n_in')] },
]

function drawn(element: ReturnType<typeof renderDocument>): { ids: string[]; container: HTMLElement } {
  const { container } = render(<>{element}</>)
  const ids = [...container.querySelectorAll('[data-wb-id]')].map((el) => el.getAttribute('data-wb-id')!)
  return { ids, container }
}

describe('상태마다 숨은 노드를 안 그린다', () => {
  it('상태를 안 주면 기본 — only [default] · except 는 보이고 로그인 것은 안 보인다', () => {
    expect(drawn(renderDocument(doc(TREE))).ids).toEqual(['n_root', 'n_out', 'n_base', 'n_noadmin'])
  })

  it('로그인 — 그 상태의 노드 · 카드와 그 안이 선다', () => {
    expect(drawn(renderDocument(doc(TREE), { viewState: 's_login' })).ids).toEqual([
      'n_root',
      'n_out',
      'n_login',
      'n_noadmin',
      'n_card',
      'n_in',
    ])
  })

  it('관리자 — 부모 상태(로그인)의 것을 물려받고 except [관리자] 는 숨는다', () => {
    expect(drawn(renderDocument(doc(TREE), { viewState: 's_admin' })).ids).toEqual(['n_root', 'n_out', 'n_login', 'n_card', 'n_in'])
  })

  it('목록에 없는 상태를 고르면 기본이다', () => {
    expect(drawn(renderDocument(doc(TREE), { viewState: 's_nope' })).ids).toEqual(drawn(renderDocument(doc(TREE))).ids)
  })

  it('부모가 숨으면 자손도 숨는다 — 자식의 only 가 되살리지 않는다', () => {
    const tree = [
      {
        id: 'n_card',
        type: 'Card',
        visibility: { mode: 'only', states: ['s_guest'] },
        children: [text('n_kid', { mode: 'only', states: ['default'] })],
      } as WbNode,
    ]
    expect(drawn(renderDocument(doc(tree))).ids).toEqual(['n_root'])
  })

  it('숨은 노드는 DOM 에 없다 — 마커를 든 숨은 노드의 요소도 없다', () => {
    const { container } = drawn(renderDocument(doc([text('n_m', { mode: 'only', states: ['s_admin'] }, { marker: 3 })])))
    expect(container.querySelector('[data-wb-id="n_m"]')).toBeNull()
  })

  it('숨은 서브트리의 폴백은 알리지 않는다 — 화면에 없는 노드 때문에 배너가 서지 않는다', () => {
    const errors: NodeRenderError[] = []
    const broken = doc([{ id: 'n_bad', type: '없는타입', visibility: { mode: 'only', states: ['s_admin'] } } as WbNode])
    drawn(renderDocument(broken, { onNodeError: (error) => errors.push(error) }))
    expect(errors).toEqual([])
    drawn(renderDocument(broken, { viewState: 's_admin', onNodeError: (error) => errors.push(error) }))
    expect(errors.map((error) => error.nodeId)).toEqual(['n_bad'])
  })

  it('renderNode 는 받은 목록으로 판정한다 — 목록을 안 주면 기본이다', () => {
    const card = TREE[4]!
    const ids = (element: ReturnType<typeof renderNode>) => drawn(element).ids
    expect(ids(renderNode({ id: 'n_wrap', type: 'Section', children: [card] }, { viewState: 's_admin', viewStates: STATES }))).toEqual([
      'n_wrap',
      'n_card',
      'n_in',
    ])
    expect(ids(renderNode({ id: 'n_wrap', type: 'Section', children: [card] }, { viewState: 's_admin' }))).toEqual(['n_wrap'])
  })
})
