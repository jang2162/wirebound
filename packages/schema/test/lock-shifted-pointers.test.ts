/**
 * **편집의 포인터는 그 연산 직전 문서의 좌표다 — 잠금의 경로는 편집 전 문서의 좌표다**(C2 리뷰 · `docs/superpowers/plans/2026-09-30-c2-review.md` 발견 1).
 *
 * ⚠️ **이 파일은 빨강으로 커밋했다** — 결함을 값으로 잠근 것이고 고치지 않았다. 고치면 초록이 된다.
 *
 * `lockPointers(ops)`는 연산마다 적힌 포인터를 그대로 싣고 `findLockConflict`는 그것을 **편집 전 문서**에서 찾은 잠금 경로와 견준다.
 * 그런데 RFC 6902 의 포인터는 **앞 연산을 적용한 뒤 문서**의 좌표이고, `move`의 `path`는 `from`을 **뺀 뒤** 문서의 좌표다
 * (`../src/patch/apply.ts`의 `move` — `addAt(doc, op.path, removeAt(doc, op.from))`). 앞쪽 형제를 빼거나 더하면 뒤쪽 좌표가 한 칸
 * 밀려, 잠긴 서브트리를 건드리는 편집이 안 겹치는 포인터로 지나가고(아래 «지나간다») 안 건드리는 편집이 겹치는 포인터로 막힌다
 * (아래 «막힌다»).
 *
 * 판은 `./lock.test.ts`와 같은 문서다(보라가 `n_b`를 잡았다). **단언은 «그 편집이 잠긴 서브트리를 건드리는가»** 로 쓴다 — 적용한 뒤
 * 문서에서 `n_b`가 어디 있고 무엇을 품는지를 함께 적어, 판정이 아니라 결과로 읽히게 한다.
 */
import { describe, expect, it } from 'vitest'
import { findLockConflict, lockPointers, type NodeLock } from '../src/lock'
import { applyOps } from '../src/patch/apply'
import type { PatchOp } from '../src/patch/types'
import { findNode } from '../src/tree'
import type { WbNode } from '../src/node'

/**
 * ```
 * n_root
 *   n_a      n_a1
 *   n_b      n_b1  n_b2     ← 보라가 잡았다
 *   n_c
 * ```
 */
const root: WbNode = {
  id: 'n_root',
  type: 'Page',
  children: [
    { id: 'n_a', type: 'Section', children: [{ id: 'n_a1', type: 'Text', props: {} }] },
    {
      id: 'n_b',
      type: 'Section',
      children: [
        { id: 'n_b1', type: 'Text', props: {} },
        { id: 'n_b2', type: 'Text', props: {} },
      ],
    },
    { id: 'n_c', type: 'Section', children: [] },
  ],
}

const BORA: NodeLock = { nodeId: 'n_b', userId: 'u_bora', userName: '보라' }
const ME = 'u_me'

/** 서버의 2차 방어가 묻는 것 그대로(`apps/api/src/lock/check.ts`의 `lockConflictError`). */
function verdict(ops: PatchOp[]): NodeLock | null {
  return findLockConflict({ root, locks: [BORA], pointers: lockPointers(ops), viewerUserId: ME })
}

/** 적용한 뒤 `n_b`의 자식 id — `null`이면 `n_b`가 없어졌다. */
function childrenOfBAfter(ops: PatchOp[]): string[] | null {
  const after = applyOps({ version: 1, root }, ops).root as WbNode
  const b = findNode(after, 'n_b')
  return b === undefined ? null : (b.children ?? []).map((child) => (child as WbNode).id)
}

const X: WbNode = { id: 'n_x', type: 'Text', props: {} }

describe('잠긴 서브트리를 건드리는 편집이 지나간다 — 앞 연산이 좌표를 민다', () => {
  it('`move` — 앞쪽 형제를 뒤쪽의 잠긴 노드 안으로 옮기면(뺀 뒤 좌표) 부딪친다', () => {
    // 뺀 뒤 문서에서 `n_b`는 `/root/children/0`이다 — 편집 전 문서에서 그 자리는 `n_a`다.
    const ops: PatchOp[] = [{ op: 'move', from: '/root/children/0', path: '/root/children/0/children/-' }]
    expect(childrenOfBAfter(ops)).toEqual(['n_b1', 'n_b2', 'n_a'])

    expect(verdict(ops)).toEqual(BORA)
  })

  it('`add` 뒤 `replace` — 앞에 형제를 넣고 밀린 좌표로 잠긴 노드의 자식을 고치면 부딪친다', () => {
    const ops: PatchOp[] = [
      { op: 'add', path: '/root/children/0', value: X },
      { op: 'replace', path: '/root/children/2/children/0/props', value: { text: '남의 것' } },
    ]
    expect(findNode(applyOps({ version: 1, root }, ops).root as WbNode, 'n_b1')?.props).toEqual({ text: '남의 것' })

    expect(verdict(ops)).toEqual(BORA)
  })

  it('`remove` 뒤 `remove` — 앞 형제를 지우고 당겨진 좌표로 잠긴 노드 자신을 지우면 부딪친다', () => {
    const ops: PatchOp[] = [
      { op: 'remove', path: '/root/children/0' },
      { op: 'remove', path: '/root/children/0' },
    ]
    expect(childrenOfBAfter(ops)).toBeNull()

    expect(verdict(ops)).toEqual(BORA)
  })
})

describe('잠긴 서브트리를 안 건드리는 편집이 막힌다 — 같은 어긋남의 반대쪽', () => {
  it('`move` — 앞쪽 형제를 잠긴 노드 **뒤**로 옮기면(뺀 뒤 좌표가 잠긴 노드의 지금 경로) 안 부딪친다', () => {
    const ops: PatchOp[] = [{ op: 'move', from: '/root/children/0', path: '/root/children/1' }]
    expect(childrenOfBAfter(ops)).toEqual(['n_b1', 'n_b2'])

    expect(verdict(ops)).toBeNull()
  })

  it('`move` — 앞쪽 형제를 잠긴 노드 뒤의 다른 컨테이너 안으로 옮기면 안 부딪친다', () => {
    // 뺀 뒤 문서에서 `/root/children/1`은 `n_c`다.
    const ops: PatchOp[] = [{ op: 'move', from: '/root/children/0', path: '/root/children/1/children/-' }]
    expect(childrenOfBAfter(ops)).toEqual(['n_b1', 'n_b2'])
    expect(findNode(applyOps({ version: 1, root }, ops).root as WbNode, 'n_c')?.children?.map((c) => (c as WbNode).id)).toEqual(['n_a'])

    expect(verdict(ops)).toBeNull()
  })
})
