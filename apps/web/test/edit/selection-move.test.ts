/**
 * `edit/selection-move.ts` — 화살표로 고를 다음 노드. 차례는 구조 트리의 줄 차례(전위 순회)이고 남이 잡은 노드는 건너뛴다.
 */
import { describe, expect, it } from 'vitest'
import type { WbNode } from '@wirebound/schema'
import { moveSelection, visibleNodeOrder } from '../../src/edit/selection-move'

/**
 * ```
 * root
 * ├ a
 * ├ box
 * │ ├ b1
 * │ └ b2
 * └ c
 * ```
 */
const ROOT: WbNode = {
  id: 'root',
  type: 'Page',
  children: [
    { id: 'a', type: 'Text' },
    {
      id: 'box',
      type: 'Card',
      children: [
        { id: 'b1', type: 'Text' },
        { id: 'b2', type: 'Text' },
      ],
    },
    { id: 'c', type: 'Divider' },
  ],
}

const FREE = (): boolean => false

describe('visibleNodeOrder', () => {
  it('전위 순회 — 구조 트리의 줄 차례', () => {
    expect(visibleNodeOrder(ROOT)).toEqual(['root', 'a', 'box', 'b1', 'b2', 'c'])
  })

  it('노드가 아닌 원소 · id 없는 노드는 줄이 아니다 — 트리처럼 건너뛴다', () => {
    const broken = { id: 'root', type: 'Page', children: [null, { id: '', type: 'Text' }, { id: 'x', type: 'Text' }] }
    expect(visibleNodeOrder(broken)).toEqual(['root', 'x'])
    expect(visibleNodeOrder(null)).toEqual([])
  })
})

describe('moveSelection', () => {
  it('↓ · ↑ 는 다음 · 이전 줄 — 자식 안으로도 들어간다', () => {
    expect(moveSelection(ROOT, 'box', 'selectNext', FREE)).toBe('b1')
    expect(moveSelection(ROOT, 'b2', 'selectNext', FREE)).toBe('c')
    expect(moveSelection(ROOT, 'c', 'selectPrev', FREE)).toBe('b2')
    expect(moveSelection(ROOT, 'a', 'selectPrev', FREE)).toBe('root')
  })

  it('끝에서는 움직이지 않는다', () => {
    expect(moveSelection(ROOT, 'c', 'selectNext', FREE)).toBeNull()
    expect(moveSelection(ROOT, 'root', 'selectPrev', FREE)).toBeNull()
  })

  it('고른 것이 없거나 문서에 없으면 ↓ 는 첫 줄 · ↑ 는 마지막 줄 · ← → 는 없음', () => {
    expect(moveSelection(ROOT, null, 'selectNext', FREE)).toBe('root')
    expect(moveSelection(ROOT, null, 'selectPrev', FREE)).toBe('c')
    expect(moveSelection(ROOT, 'gone', 'selectNext', FREE)).toBe('root')
    expect(moveSelection(ROOT, null, 'selectParent', FREE)).toBeNull()
    expect(moveSelection(ROOT, 'gone', 'selectFirstChild', FREE)).toBeNull()
  })

  it('← 는 부모 · → 는 첫 자식 — 루트의 부모 · 잎의 자식은 없다', () => {
    expect(moveSelection(ROOT, 'b2', 'selectParent', FREE)).toBe('box')
    expect(moveSelection(ROOT, 'box', 'selectFirstChild', FREE)).toBe('b1')
    expect(moveSelection(ROOT, 'root', 'selectParent', FREE)).toBeNull()
    expect(moveSelection(ROOT, 'a', 'selectFirstChild', FREE)).toBeNull()
  })

  it('남이 잡은 줄은 건너뛴다 — ↓ ↑ 는 다음 고를 수 있는 줄로, → 는 고를 수 있는 첫 자식으로', () => {
    const blocked = (id: string): boolean => id === 'box' || id === 'b1'
    expect(moveSelection(ROOT, 'a', 'selectNext', blocked)).toBe('b2')
    expect(moveSelection(ROOT, 'b2', 'selectPrev', blocked)).toBe('a')
    expect(moveSelection(ROOT, 'box', 'selectFirstChild', (id) => id === 'b1')).toBe('b2')
  })

  it('부모가 막혔으면 ← 는 움직이지 않는다 — 그 위도 막혀 있다', () => {
    expect(moveSelection(ROOT, 'b1', 'selectParent', (id) => id === 'box' || id === 'root')).toBeNull()
  })

  it('전부 막혔으면 움직이지 않는다', () => {
    expect(moveSelection(ROOT, 'a', 'selectNext', () => true)).toBeNull()
  })
})
