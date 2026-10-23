/**
 * 구조 트리의 **놓을 자리 판정**(`src/edit/structure-drop.ts`). 카탈로그(`catalog-setup`)가 자식을 받는지 가른다 — `Card` · `Page`는
 * 받고 `Text` · `Divider`는 안 받는다.
 */
import { describe, expect, it } from 'vitest'
import { applyOps, lockConflictOfOps, type NodeLock, type PageDocument, type PatchOp } from '@wirebound/schema'
import '../../src/catalog-setup'
import { insertNodeOps, moveNodeOps } from '../../src/edit/ops'
import { dropOps, pageEndTarget, sameDrop, structureDropTarget, type Placing } from '../../src/edit/structure-drop'

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

/** 옮길 노드 · 넣을 새 타입. */
const moving = (id: string): Placing => ({ kind: 'node', id })
const adding = (type: string): Placing => ({ kind: 'new', type })

/** 남(보라)이 `nodeId`를 잡은 판 — 스토어의 `editBlockedBy`와 같은 판정(`lockConflictOfOps`)을 `document`에 묻는다. */
function lockOn(nodeId: string, document: PageDocument = doc()): (ops: readonly PatchOp[]) => NodeLock | null {
  return (ops) =>
    lockConflictOfOps({
      document,
      locks: [{ nodeId, userId: 'u-bora', userName: '보라' }],
      ops,
      viewerUserId: 'u-me',
    })
}

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
    const target = structureDropTarget(doc(), moving('n-a'), 'n-box', 'inside', free)
    expect(target).toEqual({ parentId: 'n-box', index: 2, placement: 'inside' })
    expect(childrenAfter('n-a', target!)).toEqual(['n-in1', 'n-inner', 'n-a'])
  })

  it('다른 부모의 형제 앞 · 뒤', () => {
    const before = structureDropTarget(doc(), moving('n-c'), 'n-in1', 'before', free)
    expect(before).toEqual({ parentId: 'n-box', index: 0, placement: 'before' })
    expect(childrenAfter('n-c', before!)).toEqual(['n-c', 'n-in1', 'n-inner'])
    const after = structureDropTarget(doc(), moving('n-deep'), 'n-a', 'after', free)
    expect(after).toEqual({ parentId: 'n-root', index: 1, placement: 'after' })
    expect(childrenAfter('n-deep', after!)).toEqual(['n-a', 'n-deep', 'n-box', 'n-c'])
  })

  it('같은 부모 안 뒤로 → 옮긴 뒤 차례(자기 몫을 당긴다)', () => {
    // [a box c] 에서 a 를 c 뒤로 → [box c a], a 의 자리 2.
    const target = structureDropTarget(doc(), moving('n-a'), 'n-c', 'after', free)
    expect(target).toEqual({ parentId: 'n-root', index: 2, placement: 'after' })
    expect(childrenAfter('n-a', target!)).toEqual(['n-box', 'n-c', 'n-a'])
  })

  it('제자리 → null', () => {
    expect(structureDropTarget(doc(), moving('n-a'), 'n-box', 'before', free)).toBeNull()
    expect(structureDropTarget(doc(), moving('n-box'), 'n-a', 'after', free)).toBeNull()
    expect(structureDropTarget(doc(), moving('n-inner'), 'n-box', 'inside', free)).toBeNull()
  })
})

describe('못 놓는 자리', () => {
  it('자기 · 자손 → null', () => {
    for (const band of ['before', 'inside', 'after'] as const) {
      expect(structureDropTarget(doc(), moving('n-box'), 'n-box', band, free)).toBeNull()
      expect(structureDropTarget(doc(), moving('n-box'), 'n-inner', band, free)).toBeNull()
      expect(structureDropTarget(doc(), moving('n-box'), 'n-deep', band, free)).toBeNull()
    }
  })

  it('자식을 안 받는 컴포넌트 안 → null(앞 · 뒤는 된다)', () => {
    expect(structureDropTarget(doc(), moving('n-a'), 'n-c', 'inside', free)).toBeNull()
    expect(structureDropTarget(doc(), moving('n-c'), 'n-in1', 'inside', free)).toBeNull()
    expect(structureDropTarget(doc(), moving('n-c'), 'n-in1', 'after', free)).not.toBeNull()
  })

  it('자식을 안 받는 부모의 자식 앞 · 뒤 → null — 형제 자리가 그 부모 «안» 이다(검증 전 문서)', () => {
    const odd: PageDocument = {
      version: 1,
      root: {
        id: 'n-root',
        type: 'Page',
        children: [
          { id: 'n-x', type: 'Text' },
          { id: 'n-btn', type: 'Button', children: [{ id: 'n-bt', type: 'Text' }] },
        ],
      },
    }
    for (const band of ['before', 'after'] as const) {
      expect(structureDropTarget(odd, moving('n-x'), 'n-bt', band, free)).toBeNull()
      expect(structureDropTarget(odd, adding('Divider'), 'n-bt', band, free)).toBeNull()
    }
    // 그 단추 자신의 앞 · 뒤는 뿌리 안이라 된다.
    expect(structureDropTarget(odd, adding('Divider'), 'n-btn', 'after', free)).toEqual({
      parentId: 'n-root',
      index: 2,
      placement: 'after',
    })
  })

  it('뿌리 앞 · 뒤 → null(뿌리는 형제가 없다) · 뿌리 안은 된다', () => {
    expect(structureDropTarget(doc(), moving('n-deep'), 'n-root', 'before', free)).toBeNull()
    expect(structureDropTarget(doc(), moving('n-deep'), 'n-root', 'after', free)).toBeNull()
    expect(structureDropTarget(doc(), moving('n-deep'), 'n-root', 'inside', free)).toEqual({
      parentId: 'n-root',
      index: 3,
      placement: 'inside',
    })
  })

  it('뿌리는 끌지 않는다 · 문서에 없는 노드 → null', () => {
    expect(structureDropTarget(doc(), moving('n-root'), 'n-a', 'after', free)).toBeNull()
    expect(structureDropTarget(doc(), moving('n-gone'), 'n-a', 'after', free)).toBeNull()
    expect(structureDropTarget(doc(), moving('n-a'), 'n-gone', 'after', free)).toBeNull()
  })
})

describe('받는 타입 · 설 자리 — 탭 몸통은 `TabPanel` 만, `TabPanel` 은 탭 몸통에만', () => {
  /** 뿌리 밑에 탭 하나(패널 둘 · 첫 패널 안에 글)와 글 하나. */
  function tabsDoc(): PageDocument {
    return {
      version: 3,
      root: {
        id: 'n-root',
        type: 'Page',
        children: [
          {
            id: 'n-tabs',
            type: 'Tabs',
            children: [
              { id: 'n-p1', type: 'TabPanel', children: [{ id: 'n-in', type: 'Text' }] },
              { id: 'n-p2', type: 'TabPanel' },
            ],
          },
          { id: 'n-t', type: 'Text' },
        ],
      },
    }
  }

  it('탭 «안» · 패널 곁에 글을 놓거나 옮기면 null — 패널 «안» 은 된다', () => {
    const d = tabsDoc()
    expect(structureDropTarget(d, moving('n-t'), 'n-tabs', 'inside', free)).toBeNull()
    expect(structureDropTarget(d, moving('n-t'), 'n-p1', 'after', free)).toBeNull()
    expect(structureDropTarget(d, adding('Text'), 'n-p2', 'before', free)).toBeNull()
    expect(structureDropTarget(d, moving('n-t'), 'n-p2', 'inside', free)).toEqual({ parentId: 'n-p2', index: 0, placement: 'inside' })
  })

  it('패널을 탭 밖(뿌리 · 패널 안 · 글 곁)에 놓거나 옮기면 null — 탭 «안» · 패널 곁은 된다', () => {
    const d = tabsDoc()
    expect(structureDropTarget(d, adding('TabPanel'), 'n-root', 'inside', free)).toBeNull()
    expect(structureDropTarget(d, adding('TabPanel'), 'n-p1', 'inside', free)).toBeNull()
    expect(structureDropTarget(d, moving('n-p2'), 'n-t', 'after', free)).toBeNull()
    expect(structureDropTarget(d, adding('TabPanel'), 'n-tabs', 'inside', free)).toEqual({
      parentId: 'n-tabs',
      index: 2,
      placement: 'inside',
    })
    expect(structureDropTarget(d, moving('n-p2'), 'n-p1', 'before', free)).toEqual({ parentId: 'n-tabs', index: 0, placement: 'before' })
  })

  it('모듈 묶음은 맨 위 노드 전부를 본다 — 하나라도 못 서면 null', () => {
    const d = tabsDoc()
    const module = (types: string[]): Placing => ({
      kind: 'module',
      key: 'project:m',
      nodes: types.map((type, i) => ({ id: `m${i}`, type })),
    })
    expect(structureDropTarget(d, module(['Text', 'Button']), 'n-p1', 'inside', free)).not.toBeNull()
    expect(structureDropTarget(d, module(['TabPanel', 'Text']), 'n-tabs', 'inside', free)).toBeNull()
  })
})

describe('남이 잡은 자리 — 낼 편집이 부딪치는 잠금', () => {
  it('편집이 부딪치면 null — 끄는 노드가 잠긴 자리 안이거나 놓을 자리가 잠겼다', () => {
    // n-inner(= /root/children/1/children/1)가 잠겼다.
    const blocked = lockOn('n-inner')
    // 잠긴 노드의 자식을 끈다 — 뽑는 자리가 부딪친다.
    expect(structureDropTarget(doc(), moving('n-deep'), 'n-a', 'after', blocked)).toBeNull()
    // 잠긴 노드 안으로 넣는다 — 꽂는 자리가 부딪친다. **앞쪽 노드(n-a)를 뒤쪽 형제의 서브트리로** 옮기는 판이라 편집의 `path`는
    // 뺀 뒤 좌표(`/root/children/0/…`)다 — 판정이 연산마다 좌표를 맞춰 막는다(`lockConflictOfOps`).
    expect(structureDropTarget(doc(), moving('n-a'), 'n-inner', 'inside', blocked)).toBeNull()
    // 뒤쪽 노드(n-c)를 넣는 판 — 두 좌표가 같다.
    expect(structureDropTarget(doc(), moving('n-c'), 'n-inner', 'inside', blocked)).toBeNull()
  })

  it('잠긴 노드 **뒤** 형제 앞으로 옮기는 것은 선다 — 뺀 뒤 좌표가 잠긴 노드의 지금 경로와 같아도 잠긴 서브트리를 안 건드린다', () => {
    // n-box(= /root/children/1)가 잠겼다. n-a 를 n-c 앞으로 → 옮긴 뒤 [box a c] 이고 편집의 `path`는 뺀 뒤 좌표 `/root/children/1`
    // 이다. 그 포인터를 **편집 전 문서**의 잠금 경로와 글자로 견주면 n-box 와 겹쳐 막힌다 — 판정이 연산마다 좌표를 맞추므로 선다
    // (C2 리뷰 발견 1 의 «막힌다» 쪽).
    const blocked = lockOn('n-box')
    expect(blocked(moveNodeOps(doc(), 'n-a', 'n-root', 1)!)).toBeNull()
    expect(structureDropTarget(doc(), moving('n-a'), 'n-c', 'before', blocked)).toEqual({
      parentId: 'n-root',
      index: 1,
      placement: 'before',
    })
  })

  it('편집이 부딪치지 않으면 선다 — 잠긴 노드의 옆 부모에 넣는 것은 된다', () => {
    const blocked = lockOn('n-inner')
    expect(structureDropTarget(doc(), moving('n-a'), 'n-c', 'after', blocked)).toEqual({
      parentId: 'n-root',
      index: 2,
      placement: 'after',
    })
  })
})

describe("새 타입을 놓는다(`kind: 'new'`)", () => {
  it('컨테이너 안 → 마지막 자식 · 잎 앞 · 뒤 → 그 형제 자리(자기 몫을 당기지 않는다)', () => {
    expect(structureDropTarget(doc(), adding('Text'), 'n-box', 'inside', free)).toEqual({
      parentId: 'n-box',
      index: 2,
      placement: 'inside',
    })
    expect(structureDropTarget(doc(), adding('Text'), 'n-in1', 'before', free)).toEqual({
      parentId: 'n-box',
      index: 0,
      placement: 'before',
    })
    // 옮기기의 «제자리 → null» · «같은 부모 뒤로 → 하나 당김» 이 없다 — 새 노드는 문서에 아직 없다.
    expect(structureDropTarget(doc(), adding('Text'), 'n-a', 'after', free)).toEqual({
      parentId: 'n-root',
      index: 1,
      placement: 'after',
    })
    expect(structureDropTarget(doc(), adding('Card'), 'n-c', 'after', free)).toEqual({
      parentId: 'n-root',
      index: 3,
      placement: 'after',
    })
  })

  it('뿌리 앞 · 뒤 → null · 자식을 안 받는 대상 안 → null · 문서에 없는 대상 · 카탈로그에 없는 타입 → null', () => {
    expect(structureDropTarget(doc(), adding('Text'), 'n-root', 'before', free)).toBeNull()
    expect(structureDropTarget(doc(), adding('Text'), 'n-root', 'after', free)).toBeNull()
    expect(structureDropTarget(doc(), adding('Card'), 'n-c', 'inside', free)).toBeNull()
    expect(structureDropTarget(doc(), adding('Card'), 'n-a', 'inside', free)).toBeNull()
    expect(structureDropTarget(doc(), adding('Text'), 'n-gone', 'after', free)).toBeNull()
    expect(structureDropTarget(doc(), adding('NoSuchType'), 'n-box', 'inside', free)).toBeNull()
  })

  it('넣는 편집이 남의 잠금에 부딪치면 null — 잠긴 노드 안 · 그 자식 곁 · 잠긴 노드 앞, 잠긴 노드 뒤는 된다', () => {
    const blocked = lockOn('n-inner')
    expect(structureDropTarget(doc(), adding('Text'), 'n-inner', 'inside', blocked)).toBeNull()
    expect(structureDropTarget(doc(), adding('Text'), 'n-deep', 'before', blocked)).toBeNull()
    expect(structureDropTarget(doc(), adding('Text'), 'n-deep', 'after', blocked)).toBeNull()
    // 잠긴 노드 **앞**은 그 노드의 지금 자리(`…/children/1`)에 넣는 `add` 라 서버 판정이 겹침으로 센다 — 같은 물음이라 여기도 null.
    expect(structureDropTarget(doc(), adding('Text'), 'n-inner', 'before', blocked)).toBeNull()
    // 잠긴 노드 **뒤**(부모 n-box 의 다음 자리)는 잠긴 서브트리를 안 건드린다.
    expect(structureDropTarget(doc(), adding('Text'), 'n-inner', 'after', blocked)).toEqual({
      parentId: 'n-box',
      index: 2,
      placement: 'after',
    })
  })
})

describe('페이지 끝(`pageEndTarget`)', () => {
  it('빈 문서 → 뿌리의 0 · 자식 셋 → 3', () => {
    const empty: PageDocument = { version: 1, root: { id: 'n-root', type: 'Page' } }
    expect(pageEndTarget(empty, adding('Text'), free)).toEqual({ parentId: 'n-root', index: 0, placement: 'inside' })
    expect(pageEndTarget(doc(), adding('Text'), free)).toEqual({ parentId: 'n-root', index: 3, placement: 'inside' })
  })

  it('옮기는 노드는 «옮긴 뒤 차례» — 뿌리의 자식이면 마지막 자리 · 이미 끝이면 null · 깊은 노드는 3', () => {
    expect(pageEndTarget(doc(), moving('n-a'), free)).toEqual({ parentId: 'n-root', index: 2, placement: 'inside' })
    expect(pageEndTarget(doc(), moving('n-c'), free)).toBeNull()
    expect(pageEndTarget(doc(), moving('n-deep'), free)).toEqual({ parentId: 'n-root', index: 3, placement: 'inside' })
  })

  it('뿌리가 잠겼으면 null', () => {
    expect(pageEndTarget(doc(), adding('Text'), lockOn('n-root'))).toBeNull()
    expect(pageEndTarget(doc(), moving('n-deep'), lockOn('n-root'))).toBeNull()
  })
})

describe('놓는 편집(`dropOps`)', () => {
  it('새 타입 + 노드 → `insertNodeOps` 와 같은 연산 · 노드가 없으면 null', () => {
    const node = { id: 'n-new', type: 'Text' }
    const target = structureDropTarget(doc(), adding('Text'), 'n-in1', 'after', free)!
    expect(dropOps(doc(), adding('Text'), target, node)).toEqual(insertNodeOps(doc(), 'n-box', 1, node))
    expect(dropOps(doc(), adding('Text'), target)).toBeNull()
  })

  it('옮길 노드 → `moveNodeOps` 와 같은 연산', () => {
    const target = structureDropTarget(doc(), moving('n-c'), 'n-in1', 'before', free)!
    expect(dropOps(doc(), moving('n-c'), target)).toEqual(moveNodeOps(doc(), 'n-c', 'n-box', 0))
  })

  it('새 타입 · 노드의 타입이 다르면 null — 판정한 것과 다른 것을 넣지 않는다', () => {
    const target = structureDropTarget(doc(), adding('Text'), 'n-box', 'inside', free)!
    expect(dropOps(doc(), adding('Text'), target, { id: 'n-new', type: 'Card' })).toBeNull()
  })
})

describe('같은 자리인가(`sameDrop`)', () => {
  it('부모만 본다 — 띠 · 차례는 안 본다(차례는 놓을 때 지금 문서로 다시 판정한다)', () => {
    for (const placement of ['before', 'after', 'inside'] as const) {
      const shown = { parentId: 'p', index: 2, placement }
      expect([
        sameDrop(shown, { ...shown }),
        sameDrop(shown, { ...shown, index: 1 }),
        sameDrop(shown, { ...shown, index: 3 }),
        sameDrop(shown, { parentId: 'p', index: 2, placement: placement === 'inside' ? 'after' : 'inside' }),
        sameDrop(shown, { ...shown, parentId: 'q' }),
      ]).toEqual([true, true, true, true, false])
    }
  })
})
