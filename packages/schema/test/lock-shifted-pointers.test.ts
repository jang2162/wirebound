/**
 * **편집의 포인터는 그 연산 직전 문서의 좌표다 — 잠금의 경로는 편집 전 문서의 좌표다**(C2 리뷰 · `docs/superpowers/plans/2026-09-30-c2-review.md` 발견 1).
 *
 * 판정은 `lockConflictOfOps`다. **연산마다 적힌 포인터를 그대로 모아 편집 전 문서의 잠금 경로와 견주면 어긋난다** —
 * RFC 6902 의 포인터는 **앞 연산을 적용한 뒤 문서**의 좌표이고, `move`의 `path`는 `from`을 **뺀 뒤** 문서의 좌표다
 * (`../src/patch/apply.ts`의 `move` — `addAt(doc, op.path, removeAt(doc, op.from))`). 앞쪽 형제를 빼거나 더하면 뒤쪽 좌표가 한 칸
 * 밀려, 잠긴 서브트리를 건드리는 편집이 안 겹치는 포인터로 지나가고(아래 «지나간다») 안 건드리는 편집이 겹치는 포인터로 막힌다
 * (아래 «막힌다»).
 *
 * 판은 `./lock.test.ts`와 같은 문서다(보라가 `n_b`를 잡았다). **단언은 «그 편집이 잠긴 서브트리를 건드리는가»** 로 쓴다 — 적용한 뒤
 * 문서에서 `n_b`가 어디 있고 무엇을 품는지를 함께 적어, 판정이 아니라 결과로 읽히게 한다.
 */
import { describe, expect, it } from 'vitest'
import { lockConflictOfOps, type NodeLock } from '../src/lock'
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
  return lockConflictOfOps({ document: { version: 1, root } as { root: WbNode }, locks: [BORA], ops, viewerUserId: ME })
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

/**
 * **리뷰의 판 14 개**(`docs/superpowers/plans/2026-09-30-c2-review.md` 항목 1 «고칠 방향») — «참»은 적용하면 `n_b`의 서브트리가 바뀌거나
 * `n_b` 자신이 옮겨지거나 사라지는가다. 표를 이 판정 하나에 대고 잰다(C11 은 아래 따로 — 좌표 문제가 아니라 지금 설계다).
 */
const Y: WbNode = { id: 'n_y', type: 'Text', props: {} }
const CASES: { name: string; ops: PatchOp[]; touches: boolean }[] = [
  { name: 'C1 앞 n_a 를 뒤 n_b 안으로(뺀 뒤 좌표)', touches: true, ops: [{ op: 'move', from: '/root/children/0', path: '/root/children/0/children/-' }] },
  { name: 'C2 앞 n_a 를 n_b 뒤로', touches: false, ops: [{ op: 'move', from: '/root/children/0', path: '/root/children/1' }] },
  { name: 'C3 뒤 n_c 를 앞 n_b 안으로', touches: true, ops: [{ op: 'move', from: '/root/children/2', path: '/root/children/1/children/-' }] },
  { name: 'C4 앞 n_a 를 끝으로', touches: false, ops: [{ op: 'move', from: '/root/children/0', path: '/root/children/-' }] },
  {
    name: 'C5 add 0 + n_b1(밀린 2/0) replace',
    touches: true,
    ops: [
      { op: 'add', path: '/root/children/0', value: X },
      { op: 'replace', path: '/root/children/2/children/0/props', value: { text: '남의 것' } },
    ],
  },
  {
    name: 'C6 remove n_a + n_b1(당겨진 0/0) replace',
    touches: true,
    ops: [
      { op: 'remove', path: '/root/children/0' },
      { op: 'replace', path: '/root/children/0/children/0/props', value: { text: '남의 것' } },
    ],
  },
  {
    name: 'C7 add 0 + add 1(= n_a 앞)',
    touches: false,
    ops: [
      { op: 'add', path: '/root/children/0', value: X },
      { op: 'add', path: '/root/children/1', value: Y },
    ],
  },
  { name: 'C8 n_b1 을 밖으로', touches: true, ops: [{ op: 'move', from: '/root/children/1/children/0', path: '/root/children/-' }] },
  { name: 'C9 n_a1 을 n_b 안으로(다른 부모)', touches: true, ops: [{ op: 'move', from: '/root/children/0/children/0', path: '/root/children/1/children/-' }] },
  { name: 'C10 앞 n_a 를 n_c 안으로(뺀 뒤 n_c 는 1)', touches: false, ops: [{ op: 'move', from: '/root/children/0', path: '/root/children/1/children/-' }] },
  {
    name: 'C12 remove n_a + remove 0(= n_b)',
    touches: true,
    ops: [
      { op: 'remove', path: '/root/children/0' },
      { op: 'remove', path: '/root/children/0' },
    ],
  },
  { name: 'C13 n_b 자신을 뒤로', touches: true, ops: [{ op: 'move', from: '/root/children/1', path: '/root/children/2' }] },
  {
    name: 'C14 remove n_a + move 0(= n_b) 끝으로',
    touches: true,
    ops: [
      { op: 'remove', path: '/root/children/0' },
      { op: 'move', from: '/root/children/0', path: '/root/children/-' },
    ],
  },
  {
    name: '다른 노드의 id 를 잠긴 id 로 바꾼 뒤 진짜 n_b 를 지움',
    touches: true,
    ops: [
      { op: 'replace', path: '/root/children/0/id', value: 'n_b' },
      { op: 'remove', path: '/root/children/1' },
    ],
  },
  { name: '배열 번호를 글자로 달리 씀(`01`) — 적용은 1 로 읽는다', touches: true, ops: [{ op: 'remove', path: '/root/children/01' }] },
  { name: '배열 번호를 글자로 달리 씀(`1.0`) — 안쪽 번호', touches: true, ops: [{ op: 'replace', path: '/root/children/1.0/children/0/props', value: {} }] },
  {
    name: '끝에 넣기(`-`)는 잠긴 자리를 안 민다',
    touches: false,
    ops: [
      { op: 'add', path: '/root/children/-', value: X },
      { op: 'remove', path: '/root/children/3' },
    ],
  },
]

describe('리뷰의 판 — 판정이 «잠긴 서브트리를 건드리는가»와 같다', () => {
  it.each(CASES)('$name', ({ ops, touches }) => {
    // 적용이 되는 판인지 먼저 — 실패하는 묶음은 판정하지 않으므로(`lockConflictOfOps`의 «판정하지 않는 것») 이 표에 싣지 않는다.
    expect(() => applyOps({ version: 1, root }, ops)).not.toThrow()

    expect(verdict(ops)).toEqual(touches ? BORA : null)
  })

  it('C11 잠긴 노드 자리에 형제를 끼우면 부딪친다 — 좌표 문제가 아니라 지금 설계다', () => {
    // 끼우는 포인터가 잠긴 노드의 지금 경로와 같다(`apps/web`의 `edit/structure-actions.ts` 머리말 표의 423 줄).
    expect(verdict([{ op: 'add', path: '/root/children/1', value: X }])).toEqual(BORA)
  })
})

describe('적용이 실패하는 묶음은 판정하지 않는다 — 파이프라인이 `patch-failed`로 거절한다', () => {
  it('없는 자리를 지우는 연산 하나는 `null`', () => {
    expect(() => applyOps({ version: 1, root }, [{ op: 'remove', path: '/root/children/9' }])).toThrow()
    expect(verdict([{ op: 'remove', path: '/root/children/9' }])).toBeNull()
  })

  it('실패하는 연산 뒤의 연산은 재지 않는다 — 그 편집은 통째로 거절된다', () => {
    expect(
      verdict([
        { op: 'remove', path: '/root/children/9' },
        { op: 'remove', path: '/root/children/1' },
      ]),
    ).toBeNull()
  })

  it('실패하는 연산 자체가 잠긴 자리와 겹치면 적용 전에 낸다', () => {
    expect(verdict([{ op: 'remove', path: '/root/children/1/children/5' }])).toEqual(BORA)
  })

  it('뿌리 자체 · 읽을 수 없는 포인터도 던지지 않는다', () => {
    expect(verdict([{ op: 'replace', path: '', value: {} }])).toEqual(BORA)
    expect(verdict([{ op: 'remove', path: 'root/children/1' }])).toBeNull()
    expect(verdict([{ op: 'remove', path: '/__proto__/x' }])).toBeNull()
  })

  it('검증 전 문서(`children` 안의 `null`)에서도 던지지 않는다', () => {
    const broken = { root: { ...root, children: [null, ...(root.children ?? [])] } } as unknown as { root: WbNode }
    expect(() =>
      lockConflictOfOps({ document: broken, locks: [BORA], ops: [{ op: 'remove', path: '/root/children/2' }], viewerUserId: ME }),
    ).not.toThrow()
  })
})
