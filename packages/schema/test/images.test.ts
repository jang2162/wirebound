/** 노드가 든 그림(`src/images.ts`) — 몸통 · 구역의 자손까지 · 꼴 밖은 그림이 아니다 · 비운 사본은 원본을 안 바꾼다. */
import { describe, expect, it } from 'vitest'
import { clearImages, imageIdsIn, type WbNode } from '../src'

const A = 'a'.repeat(64)
const B = 'b'.repeat(64)

const tree: WbNode[] = [
  {
    id: 'card',
    type: 'Card',
    children: [{ id: 'p1', type: 'Placeholder', props: { label: '하나', image: A } }],
    zones: { footer: [{ id: 'p2', type: 'Placeholder', props: { label: '둘', image: B } }] },
  },
  { id: 'p3', type: 'Placeholder', props: { label: '셋', image: A } },
  { id: 'p4', type: 'Placeholder', props: { label: '꼴 밖', image: 'A'.repeat(64) } },
  { id: 'p5', type: 'Placeholder', props: { label: '빈 그림', image: '' } },
  { id: 'm1', type: 'Media', props: { image: B } } as unknown as WbNode,
]

describe('imageIdsIn', () => {
  it('몸통 · 구역의 자손까지 · 문서 차례 · 겹침 없이 — 꼴 밖 · 빈 값 · 자리표시자 밖은 안 센다', () => {
    expect(imageIdsIn(tree)).toEqual([A, B])
  })

  it('검증 전 값에서 던지지 않는다', () => {
    expect(imageIdsIn([null, 3, { type: 'Placeholder', props: null }, { children: 'x' }])).toEqual([])
  })
})

describe('clearImages', () => {
  it('고른 id 의 image 키만 걷고 비운 노드 수를 센다 · 원본은 그대로', () => {
    const before = structuredClone(tree)
    const { nodes, cleared } = clearImages(tree, new Set([A]))
    expect(cleared).toBe(2)
    expect(imageIdsIn(nodes)).toEqual([B])
    expect('image' in (nodes[1]!.props as object)).toBe(false)
    expect((nodes[1]!.props as { label: string }).label).toBe('셋')
    expect(tree).toEqual(before)
  })
})
