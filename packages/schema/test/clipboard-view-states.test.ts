/**
 * **클립보드 봉투와 화면 상태** — 봉투가 출처 페이지의 상태 목록을 실어 붙이는 쪽이 뺀 가지를 이름으로 말할 수 있게 하고, 영역 없이 가지만
 * 고른 복사도 읽는다(가지는 영역 밖에 못 서지만 붙이기가 그 내용으로 푼다 — `prepareNodesForPaste`).
 *
 * 붙이는 쪽의 가지 빼기 · 통지는 `apps/web/test/edit/paste-view-states.test.tsx` 가 잰다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { readNodesEnvelope, writeNodesEnvelope, prepareNodesForPaste } from '../src/clipboard'
import { installCatalog } from '../src/component/catalog/index'
import type { ViewState, WbNode } from '../src/node'

beforeAll(() => {
  installCatalog()
})

const ADMIN: ViewState = { id: 's_admin', name: '관리자' }
const adminCase: WbNode = { id: 'c_a', type: 'StateCase', props: { state: 's_admin' }, children: [{ id: 'b_a', type: 'Button', props: { label: '승인' } }] }
const area: WbNode = {
  id: 'sw',
  type: 'StateSwitch',
  children: [{ id: 'c_d', type: 'StateCase', props: { state: 'default' }, children: [{ id: 'b_d', type: 'Button', props: { label: '보기' } }] }, adminCase],
}

describe('봉투의 상태 목록', () => {
  it('상태 목록이 없거나 비면 봉투는 옛 글자 그대로다', () => {
    const nodes: WbNode[] = [{ id: 'n_t', type: 'Text', props: { content: '글' } }]
    const old = JSON.stringify({ wirebound: 'nodes', version: 1, nodes })
    expect(writeNodesEnvelope(nodes, 1)).toBe(old)
    expect(writeNodesEnvelope(nodes, 1, [])).toBe(old)
    expect(readNodesEnvelope(old)).toEqual({ nodes })
  })

  it('출처의 상태 목록을 싣고 그대로 읽는다', () => {
    const read = readNodesEnvelope(writeNodesEnvelope([area], 1, [ADMIN]))
    expect(read?.viewStates).toEqual([ADMIN])
    expect(read?.nodes).toEqual([area])
  })

  it('모양이 틀린 목록을 든 봉투는 읽지 않는다', () => {
    const text = JSON.stringify({ wirebound: 'nodes', version: 1, nodes: [area], viewStates: [{ id: 's_admin', name: '' }] })
    expect(readNodesEnvelope(text)).toBeNull()
  })
})

describe('가지만 고른 복사', () => {
  it('맨 위에 선 가지를 읽고, 붙이기가 그 내용으로 푼다', () => {
    const read = readNodesEnvelope(writeNodesEnvelope([adminCase], 1, [ADMIN]))
    expect(read?.nodes).toEqual([adminCase])
    const prepared = prepareNodesForPaste(read!.nodes, { node: () => true, page: () => true, state: () => false })
    expect(prepared.nodes.map((node) => node.type)).toEqual(['Button'])
    expect(prepared.droppedCases).toEqual([])
  })

  it('카나리아 — 맨 위가 아닌 자리의 영역 밖 가지는 여전히 읽지 않는다', () => {
    const wrapped: WbNode = { id: 'sec', type: 'Section', children: [adminCase] }
    expect(readNodesEnvelope(writeNodesEnvelope([wrapped], 1, [ADMIN]))).toBeNull()
  })
})
