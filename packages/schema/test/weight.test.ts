/**
 * 노드 몫(`weight`)의 봉투 계약과, 노드를 옮기는 길(id 재발급 · 클립보드 봉투 · 프리셋/붙여넣기 복사)이 몫을 함께 옮기는가.
 * 몫이 화면에서 무엇을 하는지(Flex · Grid 안의 폭)는 실브라우저 판 `apps/web/build-test/layout-weight.test.ts` 가 잰다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, resetRegistry } from '../src/index'
import { WEIGHT_MAX, WEIGHT_MIN, type WbNode } from '../src/node'
import { WbNodeSchema } from '../src/envelope'
import { prepareNodesForPaste, readNodesEnvelope, writeNodesEnvelope } from '../src/clipboard'
import { stripMarkers } from '../src/preset/builtin'
import { remapNodeIds } from '../src/tree'

beforeAll(() => {
  resetRegistry()
  installCatalog()
})

const node = (weight: unknown) => ({ id: 'n_000000000001', type: 'Button', weight })

describe('WbNodeSchema — weight', () => {
  it('범위는 1 ~ 12 다', () => {
    expect([WEIGHT_MIN, WEIGHT_MAX]).toEqual([1, 12])
  })

  it.each([1, 2, 12])('%s 를 받는다', (weight) => {
    expect(WbNodeSchema.safeParse(node(weight)).success).toBe(true)
  })

  it('몫이 없는 노드를 그대로 받는다 — 옛 문서는 마이그레이션 없이 읽힌다', () => {
    expect(WbNodeSchema.safeParse({ id: 'n_000000000001', type: 'Button' }).success).toBe(true)
  })

  it.each([
    ['0', 0],
    ['13', 13],
    ['1.5', 1.5],
    ['음수', -1],
    ['글자 "2"', '2'],
    ['null', null],
    ['NaN', Number.NaN],
  ])('%s 를 거부한다', (_label, weight) => {
    expect(WbNodeSchema.safeParse(node(weight)).success).toBe(false)
  })
})

describe('몫은 노드와 함께 간다', () => {
  const tree = (): WbNode => ({
    id: 'root',
    type: 'Page',
    children: [
      { id: 'a', type: 'Button', weight: 2, marker: 3, props: { label: '저장' } },
      { id: 'b', type: 'Flex', weight: 5, children: [{ id: 'c', type: 'Text', weight: 12 }] },
    ],
  })

  it('id 재발급(`remapNodeIds`)이 옮긴다 — 가져오기 · 프리셋 적용', () => {
    let n = 0
    const { root } = remapNodeIds(tree(), () => `n_${String(n++).padStart(12, '0')}`)
    expect(root.children!.map((child) => child.weight)).toEqual([2, 5])
    expect(root.children![1]!.children![0]!.weight).toBe(12)
  })

  it('번호를 걷는 복사(`stripMarkers`)가 옮긴다 — 붙여넣기 · 복제 · 프리셋 저장', () => {
    const [button, flex] = stripMarkers(tree().children!)
    expect(button!.weight).toBe(2)
    expect(button!.marker).toBeUndefined()
    expect(flex!.weight).toBe(5)
    expect(flex!.children![0]!.weight).toBe(12)
  })

  it('번호를 걷는 복사는 몫이 없는 노드에 키를 만들지 않는다', () => {
    const [text] = stripMarkers([{ id: 'a', type: 'Text' }])
    expect(Object.keys(text!)).toEqual(['id', 'type'])
  })

  it('클립보드 봉투를 오가며 남는다', () => {
    const read = readNodesEnvelope(writeNodesEnvelope(tree().children!, 1))
    expect(read).not.toBeNull()
    expect(read!.nodes.map((item) => item.weight)).toEqual([2, 5])
  })

  it('붙일 노드를 짓는 길(`prepareNodesForPaste`)이 옮긴다', () => {
    const keep = { node: () => true, page: () => true }
    const { nodes } = prepareNodesForPaste(tree().children!, keep)
    expect(nodes[0]!.weight).toBe(2)
    expect(nodes[1]!.children![0]!.weight).toBe(12)
  })

  it('클립보드 봉투는 범위 밖 몫을 받지 않는다', () => {
    const text = JSON.stringify({ wirebound: 'nodes', version: 1, nodes: [{ id: 'a', type: 'Button', weight: 13 }] })
    expect(readNodesEnvelope(text)).toBeNull()
  })
})
