/**
 * 상호작용 런타임의 «화면 상태 바꾸기»(`setViewState`) — 런타임은 상태를 들지 않고 요청으로 낸다. 대상 판정은 스키마의 `checkViewStateAction`
 * (저장 게이트와 같은 함수)이고, 렌더가 문서의 상태 목록을 그 판정에 넘긴다. 같은 누름의 뒤 액션은 그대로 돌아 겹layer에 얹힌다.
 */
import { installCatalog, type Interaction, type PageDocument, type WbNode } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { EMPTY_OVERLAY, runInteraction } from '../src/interaction/runtime'
import { renderDocument, type InteractionEvent } from '../src/render'

beforeAll(() => {
  installCatalog()
})

const STATES = [{ id: 's_detail', name: '상세 열림' }]

/** 목록 · [등록] 단추 · 상세 폼(상세 열림 상태에서만). */
function page(interactions: Interaction[], viewStates = STATES): PageDocument {
  return {
    version: 1,
    viewStates,
    root: {
      id: 'n_root',
      type: 'Page',
      children: [
        { id: 'n_add', type: 'Button', props: { label: '등록' }, interactions },
        { id: 'n_form', type: 'EntryForm', props: { title: '상세' }, visibility: { mode: 'only', states: ['s_detail'] } },
      ],
    } as WbNode,
  }
}

describe('runInteraction — 요청으로 낸다', () => {
  it('목록의 상태 · 기본은 요청이고 겹layer는 그대로다', () => {
    for (const target of ['s_detail', 'default']) {
      const doc = page([{ on: 'click', actions: [{ type: 'setViewState', target }] }])
      const result = runInteraction(doc.root, 'n_add', 'click', EMPTY_OVERLAY, doc.viewStates)
      expect(result.requests).toEqual([{ type: 'setViewState', target, sourceNodeId: 'n_add' }])
      expect(result.issues).toEqual([])
      expect(result.overlay).toBe(EMPTY_OVERLAY)
    }
  })

  it('지운 상태는 요청 대신 이슈 — 저장 게이트와 같은 문장', () => {
    const doc = page([{ on: 'click', actions: [{ type: 'setViewState', target: 's_gone' }] }])
    const result = runInteraction(doc.root, 'n_add', 'click', EMPTY_OVERLAY, doc.viewStates)
    expect(result.requests).toEqual([])
    expect(result.issues).toEqual([
      {
        nodeId: 'n_add',
        index: 0,
        actionIndex: 0,
        code: 'view-state-missing',
        message: 'setViewState의 대상 상태가 페이지의 상태 목록에 없습니다: s_gone',
      },
    ])
  })

  it('뒤 액션은 같은 누름에서 돈다 — 지금 숨은 노드를 겨눈 값도 겹layer에 얹힌다', () => {
    const doc = page([
      {
        on: 'click',
        actions: [
          { type: 'setViewState', target: 's_detail' },
          { type: 'setProp', target: 'n_form', prop: 'title', value: '신규 등록' },
        ],
      },
    ])
    const result = runInteraction(doc.root, 'n_add', 'click', EMPTY_OVERLAY, doc.viewStates)
    expect(result.requests.map((request) => request.type)).toEqual(['setViewState'])
    expect(result.overlay).toEqual({ n_form: { title: '신규 등록' } })
  })
})

describe('렌더가 문서의 상태 목록을 판정에 넘긴다', () => {
  it('눌린 단추의 요청에 그 문서의 상태가 실린다', () => {
    const doc = page([{ on: 'click', actions: [{ type: 'setViewState', target: 's_detail' }] }])
    const events: InteractionEvent[] = []
    const tree = renderDocument(doc, { interaction: { onEvent: (event) => events.push(event) } })
    const handler = findHandler(tree, 'n_add')
    expect(handler).toBeInstanceOf(Function)
    handler!({ preventDefault: () => {} })
    expect(events.map((event) => [event.requests, event.issues])).toEqual([
      [[{ type: 'setViewState', target: 's_detail', sourceNodeId: 'n_add' }], []],
    ])
  })
})

/** 노드의 `ViewHost` 가 뷰에 넘기는 `onClick`(`interaction-runtime.test.tsx` 의 `attrsOf` 와 같은 길). */
function findHandler(tree: unknown, nodeId: string): ((event: unknown) => void) | undefined {
  if (typeof tree !== 'object' || tree === null) return undefined
  const props = (tree as { props?: Record<string, unknown> }).props
  const attrs = (props?.['binding'] as { attrs?: Record<string, unknown> } | undefined)?.attrs
  if (attrs?.['data-wb-id'] === nodeId) return attrs['onClick'] as (event: unknown) => void
  const viewProps = props?.['viewProps'] as { children?: unknown } | undefined
  const children = viewProps !== undefined ? viewProps.children : props?.['children']
  for (const child of Array.isArray(children) ? children : [children]) {
    const hit = findHandler(child, nodeId)
    if (hit !== undefined) return hit
  }
  return undefined
}
