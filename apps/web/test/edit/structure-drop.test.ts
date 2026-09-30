/**
 * 구조 트리의 **놓을 자리 판정**(`src/edit/structure-drop.ts`). 카탈로그(`catalog-setup`)가 자식을 받는지 가른다 — `Card` · `Page`는
 * 받고 `Text` · `Divider`는 안 받는다.
 */
import { describe, expect, it } from 'vitest'
import { applyOps, findLockConflict, lockPointers, type NodeLock, type PageDocument, type PatchOp } from '@wirebound/schema'
import '../../src/catalog-setup'
import { moveNodeOps } from '../../src/edit/ops'
import { structureDropTarget } from '../../src/edit/structure-drop'

/**
 * ```
 * n-root (Page)
 * ├ n-a   (Text)
 * ├ n-box (Card)
 * │  ├ n-in1 (Text)
 * │  └ n-inner (Card)
 * │     └ n-deep (Text)
 * └ n-c   (Divider)
 * ```
 */
function doc(): PageDocument {
  return {
    version: 1,
    root: {
      id: 'n-root',
      type: 'Page',
      children: [
        { id: 'n-a', type: 'Text' },
        {
          id: 'n-box',
          type: 'Card',
          children: [
            { id: 'n-in1', type: 'Text' },
            { id: 'n-inner', type: 'Card', children: [{ id: 'n-deep', type: 'Text' }] },
          ],
        },
        { id: 'n-c', type: 'Divider' },
      ],
    },
  }
}

const free = (): NodeLock | null => null

/** 판정이 준 자리로 실제로 옮긴 뒤 그 부모의 자식 id 차례 — «옮긴 뒤 차례»가 참인지 문서로 확인한다. */
function childrenAfter(draggedId: string, target: { parentId: string; index: number }): string[] {
  const document = doc()
  const ops = moveNodeOps(document, draggedId, target.parentId, target.index)
  if (ops === null) throw new Error('ops 가 없다')
  const next = applyOps(document, ops)
  const find = (node: { id: string; children?: unknown }): { id: string; children?: unknown } | null => {
    if (node.id === target.parentId) return node
    for (const child of (node.children as { id: string }[] | undefined) ?? []) {
      const hit = find(child)
      if (hit !== null) return hit
    }
    return null
  }
  const parent = find(next.root as never)
  return ((parent?.children as { id: string }[] | undefined) ?? []).map((child) => child.id)
}

describe('자식을 받는 컴포넌트 안 · 형제 앞뒤', () => {
  it('Card 안 → 마지막 자식', () => {
    const target = structureDropTarget(doc(), 'n-a', 'n-box', 'inside', free)
    expect(target).toEqual({ parentId: 'n-box', index: 2, placement: 'inside' })
    expect(childrenAfter('n-a', target!)).toEqual(['n-in1', 'n-inner', 'n-a'])
  })

  it('다른 부모의 형제 앞 · 뒤', () => {
    const before = structureDropTarget(doc(), 'n-c', 'n-in1', 'before', free)
    expect(before).toEqual({ parentId: 'n-box', index: 0, placement: 'before' })
    expect(childrenAfter('n-c', before!)).toEqual(['n-c', 'n-in1', 'n-inner'])
    const after = structureDropTarget(doc(), 'n-deep', 'n-a', 'after', free)
    expect(after).toEqual({ parentId: 'n-root', index: 1, placement: 'after' })
    expect(childrenAfter('n-deep', after!)).toEqual(['n-a', 'n-deep', 'n-box', 'n-c'])
  })

  it('같은 부모 안 뒤로 → 옮긴 뒤 차례(자기 몫을 당긴다)', () => {
    // [a box c] 에서 a 를 c 뒤로 → [box c a], a 의 자리 2.
    const target = structureDropTarget(doc(), 'n-a', 'n-c', 'after', free)
    expect(target).toEqual({ parentId: 'n-root', index: 2, placement: 'after' })
    expect(childrenAfter('n-a', target!)).toEqual(['n-box', 'n-c', 'n-a'])
  })

  it('제자리 → null', () => {
    expect(structureDropTarget(doc(), 'n-a', 'n-box', 'before', free)).toBeNull()
    expect(structureDropTarget(doc(), 'n-box', 'n-a', 'after', free)).toBeNull()
    expect(structureDropTarget(doc(), 'n-inner', 'n-box', 'inside', free)).toBeNull()
  })
})

describe('못 놓는 자리', () => {
  it('자기 · 자손 → null', () => {
    for (const zone of ['before', 'inside', 'after'] as const) {
      expect(structureDropTarget(doc(), 'n-box', 'n-box', zone, free)).toBeNull()
      expect(structureDropTarget(doc(), 'n-box', 'n-inner', zone, free)).toBeNull()
      expect(structureDropTarget(doc(), 'n-box', 'n-deep', zone, free)).toBeNull()
    }
  })

  it('자식을 안 받는 컴포넌트 안 → null(앞 · 뒤는 된다)', () => {
    expect(structureDropTarget(doc(), 'n-a', 'n-c', 'inside', free)).toBeNull()
    expect(structureDropTarget(doc(), 'n-c', 'n-in1', 'inside', free)).toBeNull()
    expect(structureDropTarget(doc(), 'n-c', 'n-in1', 'after', free)).not.toBeNull()
  })

  it('뿌리 앞 · 뒤 → null(뿌리는 형제가 없다) · 뿌리 안은 된다', () => {
    expect(structureDropTarget(doc(), 'n-deep', 'n-root', 'before', free)).toBeNull()
    expect(structureDropTarget(doc(), 'n-deep', 'n-root', 'after', free)).toBeNull()
    expect(structureDropTarget(doc(), 'n-deep', 'n-root', 'inside', free)).toEqual({
      parentId: 'n-root',
      index: 3,
      placement: 'inside',
    })
  })

  it('뿌리는 끌지 않는다 · 문서에 없는 노드 → null', () => {
    expect(structureDropTarget(doc(), 'n-root', 'n-a', 'after', free)).toBeNull()
    expect(structureDropTarget(doc(), 'n-gone', 'n-a', 'after', free)).toBeNull()
    expect(structureDropTarget(doc(), 'n-a', 'n-gone', 'after', free)).toBeNull()
  })
})

describe('남이 잡은 자리 — 낼 편집이 부딪치는 잠금', () => {
  /** 남(보라)이 `nodeId`를 잡은 판 — 스토어의 `editBlockedBy`와 같은 판정(`findLockConflict` · `lockPointers`)을 지금 문서에 묻는다. */
  function lockOn(nodeId: string): (ops: readonly PatchOp[]) => NodeLock | null {
    return (ops) =>
      findLockConflict({
        root: doc().root,
        locks: [{ nodeId, userId: 'u-bora', userName: '보라' }],
        pointers: lockPointers(ops),
        viewerUserId: 'u-me',
      })
  }

  it('편집이 부딪치면 null — 끄는 노드가 잠긴 자리 안이거나 놓을 자리가 잠겼다', () => {
    // n-inner(= /root/children/1/children/1)가 잠겼다.
    const blocked = lockOn('n-inner')
    // 잠긴 노드의 자식을 끈다 — 뽑는 자리가 부딪친다.
    expect(structureDropTarget(doc(), 'n-deep', 'n-a', 'after', blocked)).toBeNull()
    // 잠긴 노드 안으로 넣는다 — 꽂는 자리가 부딪친다. **앞쪽 노드(n-a)를 뒤쪽 형제의 서브트리로** 옮기는 판이라 편집의 `path`는
    // 뺀 뒤 좌표(`/root/children/0/…`)다 — 옮기기 전 좌표로도 물어야 막힌다(`structure-drop.ts` 머리말).
    expect(structureDropTarget(doc(), 'n-a', 'n-inner', 'inside', blocked)).toBeNull()
    // 뒤쪽 노드(n-c)를 넣는 판 — 두 좌표가 같아 편집의 포인터만으로도 막힌다.
    expect(structureDropTarget(doc(), 'n-c', 'n-inner', 'inside', blocked)).toBeNull()
  })

  it('편집의 포인터가 잠긴 자리의 지금 경로에 닿으면 null — 서버의 2차 방어가 읽는 그대로다', () => {
    // n-box(= /root/children/1)가 잠겼다. n-a 를 n-c 앞으로 → 옮긴 뒤 [box a c] 이고 편집의 `path`는 뺀 뒤 좌표 `/root/children/1`
    // 이다. 서버는 그 포인터를 **지금 문서**의 잠금 경로와 견주므로(`lockPointers` · `findLockConflict`) n-box 와 겹쳐 423 을 낸다 —
    // 옮기기 전 좌표(`/root/children/2`)만 물으면 지나가 놓은 뒤 거절된다.
    const blocked = lockOn('n-box')
    expect(structureDropTarget(doc(), 'n-a', 'n-c', 'before', blocked)).toBeNull()
    expect(blocked(moveNodeOps(doc(), 'n-a', 'n-root', 1)!)).not.toBeNull()
  })

  it('편집이 부딪치지 않으면 선다 — 잠긴 노드의 옆 부모에 넣는 것은 된다', () => {
    const blocked = lockOn('n-inner')
    expect(structureDropTarget(doc(), 'n-a', 'n-c', 'after', blocked)).toEqual({
      parentId: 'n-root',
      index: 2,
      placement: 'after',
    })
  })
})
