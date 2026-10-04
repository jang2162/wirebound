/**
 * `edit/selection-move.ts` 의 접힘 — 접힌 줄 안은 보이는 차례에 안 들고, ← → 는 접고 편 뒤에 고른다(설계서 「설계서 화면 구조」 «트리 줄마다 접기»).
 */
import { describe, expect, it } from 'vitest'
import type { WbNode } from '@wirebound/schema'
import { ancestorIds, foldStep, moveSelection, visibleNodeOrder } from '../../src/edit/selection-move'

/**
 * ```
 * root
 * ├ a
 * ├ box
 * │ ├ b1
 * │ └ inner
 * │   └ deep
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
        { id: 'inner', type: 'Flex', children: [{ id: 'deep', type: 'Text' }] },
      ],
    },
    { id: 'c', type: 'Divider' },
  ],
}

const FREE = (): boolean => false
const NONE: ReadonlySet<string> = new Set()

describe('보이는 차례 — 접힌 줄 안은 건너뛴다', () => {
  it('접힌 줄은 남고 그 안이 빠진다', () => {
    expect(visibleNodeOrder(ROOT, new Set(['box']))).toEqual(['root', 'a', 'box', 'c'])
    expect(visibleNodeOrder(ROOT, new Set(['inner']))).toEqual(['root', 'a', 'box', 'b1', 'inner', 'c'])
    // 접힌 줄 안의 접힘은 바깥이 펴질 때까지 아무 뜻이 없다.
    expect(visibleNodeOrder(ROOT, new Set(['box', 'inner']))).toEqual(['root', 'a', 'box', 'c'])
    expect(visibleNodeOrder(ROOT, NONE)).toEqual(['root', 'a', 'box', 'b1', 'inner', 'deep', 'c'])
  })

  it('↓ · ↑ 는 접힌 줄 안을 건너뛴다', () => {
    const collapsed = new Set(['box'])
    expect(moveSelection(ROOT, 'box', 'selectNext', FREE, collapsed)).toBe('c')
    expect(moveSelection(ROOT, 'c', 'selectPrev', FREE, collapsed)).toBe('box')
  })

  it('고른 노드가 접힌 줄 안에 숨었으면 보이는 조상에서 움직인다', () => {
    const collapsed = new Set(['box'])
    expect(moveSelection(ROOT, 'deep', 'selectNext', FREE, collapsed)).toBe('c')
    expect(moveSelection(ROOT, 'deep', 'selectPrev', FREE, collapsed)).toBe('a')
  })
})

describe('← → — 접고 펴기', () => {
  it('→ 는 접힌 줄을 편다 · 펴진 줄은 첫 자식으로(움직임은 `moveSelection`)', () => {
    expect(foldStep(ROOT, 'box', 'selectFirstChild', new Set(['box']))).toEqual({ fold: 'expand', id: 'box' })
    expect(foldStep(ROOT, 'box', 'selectFirstChild', NONE)).toBeNull()
  })

  it('← 는 펴진 줄을 접는다 · 접힌 줄은 부모로', () => {
    expect(foldStep(ROOT, 'box', 'selectParent', NONE)).toEqual({ fold: 'collapse', id: 'box' })
    expect(foldStep(ROOT, 'box', 'selectParent', new Set(['box']))).toBeNull()
  })

  it('자식이 없는 줄은 접고 펼 것이 없다 — 부모 · 첫 자식 그대로', () => {
    expect(foldStep(ROOT, 'a', 'selectParent', NONE)).toBeNull()
    expect(foldStep(ROOT, 'a', 'selectFirstChild', NONE)).toBeNull()
    // 노드가 아닌 원소만 든 `children` 도 줄이 없다.
    const broken = { id: 'root', type: 'Page', children: [{ id: 'x', type: 'Card', children: [null] }] } as unknown as WbNode
    expect(foldStep(broken, 'x', 'selectParent', NONE)).toBeNull()
  })

  it('↑ ↓ 는 접고 펴지 않는다 · 고른 것이 없으면 없다', () => {
    expect(foldStep(ROOT, 'box', 'selectNext', NONE)).toBeNull()
    expect(foldStep(ROOT, null, 'selectParent', NONE)).toBeNull()
    expect(foldStep(ROOT, 'gone', 'selectParent', NONE)).toBeNull()
  })
})

describe('ancestorIds — 저절로 펼 줄', () => {
  it('루트부터 부모까지', () => {
    expect(ancestorIds(ROOT, 'deep')).toEqual(['root', 'box', 'inner'])
    expect(ancestorIds(ROOT, 'root')).toEqual([])
    expect(ancestorIds(ROOT, 'gone')).toEqual([])
  })
})
