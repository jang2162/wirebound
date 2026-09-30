/**
 * 메뉴 트리의 **놓을 자리 판정**(`src/tree/tree-drop.ts`). 돌려주는 `index` 는 «옮긴 뒤 그 부모 안 차례»다 — 서버가 부모를 바꾸는 판과
 * 같은 부모 판에서 그 값을 같은 뜻으로 읽는다(`apps/api/test/tree-drop-order.test.ts`).
 */
import { describe, expect, it } from 'vitest'
import type { TreeMenuNode } from '../../src/api/types'
import { dropZone, menuDropTarget } from '../../src/tree/tree-drop'

/**
 * ```
 * m-a 가      pages: p-1 p-2 p-3
 * │ └ m-a1 가1   pages: p-a1
 * │    └ m-a11 가11
 * m-b 나      pages: p-b1
 * m-c 다
 * ```
 */
function tree(): TreeMenuNode[] {
  return [
    {
      id: 'm-a',
      title: '가',
      sortOrder: 0,
      pages: [
        { id: 'p-1', title: '일', sortOrder: 0 },
        { id: 'p-2', title: '이', sortOrder: 1 },
        { id: 'p-3', title: '삼', sortOrder: 2 },
      ],
      children: [
        {
          id: 'm-a1',
          title: '가1',
          sortOrder: 0,
          pages: [{ id: 'p-a1', title: '가1의', sortOrder: 0 }],
          children: [{ id: 'm-a11', title: '가11', sortOrder: 0, pages: [], children: [] }],
        },
      ],
    },
    { id: 'm-b', title: '나', sortOrder: 1, pages: [{ id: 'p-b1', title: '나의', sortOrder: 0 }], children: [] },
    { id: 'm-c', title: '다', sortOrder: 2, pages: [], children: [] },
  ]
}

const menu = (id: string) => ({ kind: 'menu', id }) as const
const page = (id: string) => ({ kind: 'page', id }) as const

describe('메뉴를 끈다', () => {
  it('다른 메뉴의 위 · 아래 → 그 메뉴의 형제, 차례는 옮긴 뒤의 것', () => {
    // 뿌리 [가 나 다] 에서 다를 가 앞으로 → [다 가 나], 다의 자리 0.
    expect(menuDropTarget(tree(), menu('m-c'), menu('m-a'), 'before')).toEqual({ parentId: null, index: 0, placement: 'before' })
    // 가를 나 뒤로 → [나 가 다], 가의 자리 1(가가 빠져 나의 자리가 하나 당겨진다).
    expect(menuDropTarget(tree(), menu('m-a'), menu('m-b'), 'after')).toEqual({ parentId: null, index: 1, placement: 'after' })
    // 가1(가의 자식)을 다 뒤로 → 뿌리 [가 나 다 가1], 자리 3.
    expect(menuDropTarget(tree(), menu('m-a1'), menu('m-c'), 'after')).toEqual({ parentId: null, index: 3, placement: 'after' })
  })

  it('다른 메뉴 안 → 그 메뉴의 마지막 자식', () => {
    expect(menuDropTarget(tree(), menu('m-c'), menu('m-a'), 'inside')).toEqual({ parentId: 'm-a', index: 1, placement: 'inside' })
    expect(menuDropTarget(tree(), menu('m-a1'), menu('m-b'), 'inside')).toEqual({ parentId: 'm-b', index: 0, placement: 'inside' })
  })

  it('자기 · 자기 자손 위 → null', () => {
    for (const zone of ['before', 'inside', 'after'] as const) {
      expect(menuDropTarget(tree(), menu('m-a'), menu('m-a'), zone)).toBeNull()
      expect(menuDropTarget(tree(), menu('m-a'), menu('m-a1'), zone)).toBeNull()
      expect(menuDropTarget(tree(), menu('m-a'), menu('m-a11'), zone)).toBeNull()
    }
  })

  it('페이지 위 → null — 메뉴는 페이지 안에도, 페이지의 형제로도 못 간다', () => {
    for (const zone of ['before', 'inside', 'after'] as const) {
      expect(menuDropTarget(tree(), menu('m-c'), page('p-1'), zone)).toBeNull()
    }
  })

  it('제자리 → null(요청할 것이 없다) — 바로 뒤 형제의 위 · 이미 부모인 메뉴 안의 끝', () => {
    expect(menuDropTarget(tree(), menu('m-a'), menu('m-b'), 'before')).toBeNull()
    expect(menuDropTarget(tree(), menu('m-b'), menu('m-a'), 'after')).toBeNull()
    expect(menuDropTarget(tree(), menu('m-a1'), menu('m-a'), 'inside')).toBeNull()
  })
})

describe('페이지를 끈다', () => {
  it('메뉴 위 → 그 메뉴 안의 마지막 페이지(띠와 무관하게 안이다)', () => {
    for (const zone of ['before', 'inside', 'after'] as const) {
      expect(menuDropTarget(tree(), page('p-1'), menu('m-b'), zone)).toEqual({ parentId: 'm-b', index: 1, placement: 'inside' })
    }
    // 이미 그 메뉴에 있으면 끝은 자기를 뺀 수다 — 가의 [일 이 삼] 에서 일을 끝으로 → 자리 2.
    expect(menuDropTarget(tree(), page('p-1'), menu('m-a'), 'inside')).toEqual({ parentId: 'm-a', index: 2, placement: 'inside' })
  })

  it('다른 메뉴 페이지의 위 · 아래 → 그 메뉴의 그 자리', () => {
    expect(menuDropTarget(tree(), page('p-b1'), page('p-2'), 'before')).toEqual({ parentId: 'm-a', index: 1, placement: 'before' })
    expect(menuDropTarget(tree(), page('p-b1'), page('p-2'), 'after')).toEqual({ parentId: 'm-a', index: 2, placement: 'after' })
    expect(menuDropTarget(tree(), page('p-2'), page('p-a1'), 'before')).toEqual({ parentId: 'm-a1', index: 0, placement: 'before' })
  })

  it('같은 메뉴 안 → 옮긴 뒤의 차례', () => {
    // [일 이 삼] 에서 일을 삼 뒤로 → [이 삼 일], 자리 2.
    expect(menuDropTarget(tree(), page('p-1'), page('p-3'), 'after')).toEqual({ parentId: 'm-a', index: 2, placement: 'after' })
    // 삼을 일 앞으로 → [삼 일 이], 자리 0.
    expect(menuDropTarget(tree(), page('p-3'), page('p-1'), 'before')).toEqual({ parentId: 'm-a', index: 0, placement: 'before' })
  })

  it('자기 · 제자리 · 페이지 안 → null', () => {
    expect(menuDropTarget(tree(), page('p-2'), page('p-2'), 'before')).toBeNull()
    expect(menuDropTarget(tree(), page('p-2'), page('p-3'), 'before')).toBeNull()
    expect(menuDropTarget(tree(), page('p-2'), page('p-1'), 'after')).toBeNull()
    expect(menuDropTarget(tree(), page('p-b1'), page('p-1'), 'inside')).toBeNull()
  })
})

it('트리에 없는 것 → null(남이 지운 뒤 다시 받기 전의 창) · 던지지 않는다', () => {
  expect(menuDropTarget(tree(), menu('m-gone'), menu('m-a'), 'inside')).toBeNull()
  expect(menuDropTarget(tree(), page('p-1'), menu('m-gone'), 'inside')).toBeNull()
  expect(menuDropTarget(tree(), page('p-1'), page('p-gone'), 'after')).toBeNull()
  expect(menuDropTarget([{ id: 'm-x', title: '깨짐', sortOrder: 0, pages: null, children: null } as unknown as TreeMenuNode], page('p-1'), menu('m-x'), 'inside')).toBeNull()
})

describe('띠(dropZone)', () => {
  it('안을 받는 줄은 위 25% · 가운데 · 아래 25%', () => {
    expect(dropZone(4, 20, true)).toBe('before')
    expect(dropZone(5, 20, true)).toBe('inside')
    expect(dropZone(15, 20, true)).toBe('inside')
    expect(dropZone(15.1, 20, true)).toBe('after')
  })

  it('안을 안 받는 줄은 반으로 가른다', () => {
    expect(dropZone(9.9, 20, false)).toBe('before')
    expect(dropZone(10, 20, false)).toBe('after')
  })
})
