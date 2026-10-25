/**
 * **클립보드 봉투와 화면 상태** — 봉투가 출처 페이지의 상태 목록을 실어 붙이는 쪽이 보임의 상태를 이름으로 맞추고 못 맞춘 것을 이름으로 말할
 * 수 있게 한다. 판 1 봉투(상태 영역)는 그 목록을 실은 채 판 2 로 옮긴다(계획 Review Focus 3 «옛 클립보드 봉투»).
 *
 * 붙이는 쪽의 이름 맞춤 · 통지는 `apps/web/test/edit/paste-view-states.test.tsx` 가 잰다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { prepareNodesForPaste, readNodesEnvelope, writeNodesEnvelope } from '../src/clipboard'
import { installCatalog } from '../src/component/catalog/index'
import { MIGRATIONS } from '../src/migrate'
import type { ViewState, WbNode } from '../src/node'

beforeAll(() => {
  installCatalog()
})

const ADMIN: ViewState = { id: 's_admin', name: '관리자' }

/** 판 1 의 상태 영역 — 기본 «보기» · 관리자 «승인». */
const area: WbNode = {
  id: 'sw',
  type: 'StateSwitch',
  children: [
    { id: 'c_d', type: 'StateCase', props: { state: 'default' }, children: [{ id: 'b_d', type: 'Button', props: { label: '보기' } }] },
    { id: 'c_a', type: 'StateCase', props: { state: 's_admin' }, children: [{ id: 'b_a', type: 'Button', props: { label: '승인' } }] },
  ],
}

const keepAll = { node: () => true, page: () => true }

describe('봉투의 상태 목록', () => {
  it('상태 목록이 없거나 비면 봉투는 그 키가 없다', () => {
    const nodes: WbNode[] = [{ id: 'n_t', type: 'Text', props: { content: '글' } }]
    const plain = JSON.stringify({ wirebound: 'nodes', version: 5, nodes })
    expect(writeNodesEnvelope(nodes, 5)).toBe(plain)
    expect(writeNodesEnvelope(nodes, 5, [])).toBe(plain)
    expect(readNodesEnvelope(plain)).toEqual({ nodes })
  })

  it('출처의 상태 목록(parent 포함)과 보임을 싣고 그대로 읽는다', () => {
    const states: ViewState[] = [ADMIN, { id: 's_top', name: '최고', parent: 's_admin' }]
    const nodes: WbNode[] = [{ id: 'b', type: 'Button', props: { label: '승인' }, visibility: { mode: 'only', states: ['s_top'] } }]
    const read = readNodesEnvelope(writeNodesEnvelope(nodes, 5, states))
    expect(read).toEqual({ nodes, viewStates: states })
  })

  it('모양이 틀린 목록 · 틀린 보임을 든 봉투는 읽지 않는다', () => {
    const badList = JSON.stringify({
      wirebound: 'nodes',
      version: 5,
      nodes: [{ id: 'b', type: 'Text' }],
      viewStates: [{ id: 's_admin', name: '' }],
    })
    expect(readNodesEnvelope(badList)).toBeNull()
    const badVisibility = JSON.stringify({
      wirebound: 'nodes',
      version: 5,
      nodes: [{ id: 'b', type: 'Text', visibility: { mode: 'only', states: [] } }],
    })
    expect(readNodesEnvelope(badVisibility)).toBeNull()
  })
})

/** 판 1 → 2 단계까지만 — 판 2 → 3 은 런타임 사슬에 없어 판 1 봉투는 운영에서 거절된다(`clipboard.test.ts`). 얼린 판 1 → 2 의 뜻을 이음매로 잰다. */
const readToV2 = (text: string) => readNodesEnvelope(text, MIGRATIONS, 2)

describe('판 1 봉투 — 출처의 목록으로 판 2 로 옮긴다', () => {
  it('상태 영역이 보임이 된다 — 목록을 실은 봉투는 상태 가지가 살아남는다', () => {
    const read = readToV2(JSON.stringify({ wirebound: 'nodes', version: 1, nodes: [area], viewStates: [ADMIN] }))
    expect(read?.viewStates).toEqual([ADMIN])
    expect(read?.nodes).toEqual([
      { id: 'b_d', type: 'Button', props: { label: '보기' }, visibility: { mode: 'except', states: ['s_admin'] } },
      { id: 'b_a', type: 'Button', props: { label: '승인' }, visibility: { mode: 'only', states: ['s_admin'] } },
    ])
  })

  it('목록 없는 판 1 봉투는 기본 가지만 남는다', () => {
    const read = readToV2(JSON.stringify({ wirebound: 'nodes', version: 1, nodes: [area] }))
    expect(read?.nodes).toEqual([{ id: 'b_d', type: 'Button', props: { label: '보기' } }])
  })

  it('영역 없이 가지만 고른 판 1 복사 — 그 가지의 내용을 읽는다', () => {
    const read = readToV2(JSON.stringify({ wirebound: 'nodes', version: 1, nodes: [area.children![1]], viewStates: [ADMIN] }))
    expect(read?.nodes.map((node) => node.id)).toEqual(['b_a'])
  })
})

describe('prepareNodesForPaste — 보임 거름', () => {
  const nodes: WbNode[] = [
    { id: 'a', type: 'Button', props: { label: '둘' }, visibility: { mode: 'only', states: ['s_admin', 's_guest'] } },
    { id: 'b', type: 'Button', props: { label: '관리자만' }, visibility: { mode: 'only', states: ['s_admin'] } },
    { id: 'c', type: 'Button', props: { label: '손님 숨김' }, visibility: { mode: 'except', states: ['s_guest'] } },
    { id: 'd', type: 'Button', props: { label: '기본만' }, visibility: { mode: 'only', states: ['default'] } },
    {
      id: 'e',
      type: 'Card',
      children: [{ id: 'e1', type: 'Button', props: { label: '안' }, visibility: { mode: 'only', states: ['s_admin'] } }],
    },
  ]

  it('붙일 페이지에 없는 상태를 빼고 상태마다 센다 — only 가 비면 보임째 걷고 따로 센다 · 기본은 늘 남는다', () => {
    const prepared = prepareNodesForPaste(nodes, { ...keepAll, state: (id) => id === 's_admin' })
    expect(prepared.nodes.map((node) => node.visibility)).toEqual([
      { mode: 'only', states: ['s_admin'] },
      { mode: 'only', states: ['s_admin'] },
      undefined,
      { mode: 'only', states: ['default'] },
      undefined,
    ])
    expect(prepared.droppedStates).toEqual([{ state: 's_guest', count: 2 }])
    expect(prepared.clearedOnly).toBe(0)

    const none = prepareNodesForPaste(nodes, { ...keepAll, state: () => false })
    expect(none.nodes.map((node) => node.visibility)).toEqual([
      undefined,
      undefined,
      undefined,
      { mode: 'only', states: ['default'] },
      undefined,
    ])
    expect(none.nodes[4]!.children![0]!.visibility).toBeUndefined()
    expect(none.droppedStates).toEqual([
      { state: 's_admin', count: 3 },
      { state: 's_guest', count: 2 },
    ])
    // a · b · e1 — except 가 빈 c 는 원래 보이던 곳에서 그대로라 세지 않는다.
    expect(none.clearedOnly).toBe(3)
  })

  it('state 를 안 주면 모든 상태를 남긴다 · 입력을 고치지 않는다', () => {
    const before = structuredClone(nodes)
    const prepared = prepareNodesForPaste(nodes, keepAll)
    expect(prepared.nodes.map((node) => node.visibility)).toEqual(nodes.map((node) => node.visibility))
    expect(prepared.droppedStates).toEqual([])
    expect(nodes).toEqual(before)
  })
})
