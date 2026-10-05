/**
 * 상태 목록의 문서 경로(`/viewStates/…`) — 적용 · 역연산 · 잠금 판정. 목록은 노드 밖이라 남의 노드 잠금(뿌리 포함)과 겹치지 않고, 같은
 * 묶음의 노드 연산은 그대로 판정된다(설계 spec 「상태 목록」 · 계획 Review Focus 1). 서버가 그 길을 여는지는
 * `apps/api/test/view-states-path.test.ts` 가 잰다.
 */
import { describe, expect, it } from 'vitest'
import { findLockConflict, lockConflictOfOps, selectionConflicts, type NodeLock } from '../src/lock'
import type { PageDocument } from '../src/node'
import { applyOps } from '../src/patch/apply'
import { invertOps } from '../src/patch/inverse'
import type { PatchOp } from '../src/patch/types'

const ADMIN = { id: 's_admin', name: '관리자' }
const GUEST = { id: 's_guest', name: '비로그인' }

function doc(viewStates?: PageDocument['viewStates']): PageDocument {
  const base: PageDocument = {
    version: 1,
    root: {
      id: 'n_root',
      type: 'Page',
      children: [
        { id: 'n_a', type: 'Section', children: [] },
        { id: 'n_b', type: 'Section', children: [{ id: 'n_b1', type: 'Text' }] },
      ],
    },
  }
  return viewStates === undefined ? base : { ...base, viewStates }
}

const lock = (nodeId: string): NodeLock => ({ nodeId, userId: 'u_other', userName: '다혜' })
const conflict = (document: PageDocument, ops: PatchOp[], locks: NodeLock[]) =>
  lockConflictOfOps({ document, locks, ops, viewerUserId: 'u_me' })?.nodeId ?? null

describe('/viewStates 편집 — 적용과 역연산', () => {
  it.each<[string, PageDocument, PatchOp[], PageDocument['viewStates'] | undefined]>([
    ['목록을 만든다', doc(), [{ op: 'add', path: '/viewStates', value: [ADMIN] }], [ADMIN]],
    ['끝에 더한다', doc([ADMIN]), [{ op: 'add', path: '/viewStates/-', value: GUEST }], [ADMIN, GUEST]],
    ['이름을 바꾼다', doc([ADMIN]), [{ op: 'replace', path: '/viewStates/0/name', value: '운영자' }], [{ id: 's_admin', name: '운영자' }]],
    ['옮긴다', doc([ADMIN, GUEST]), [{ op: 'move', from: '/viewStates/1', path: '/viewStates/0' }], [GUEST, ADMIN]],
    ['뺀다', doc([ADMIN, GUEST]), [{ op: 'remove', path: '/viewStates/0' }], [GUEST]],
    ['목록째 지운다', doc([ADMIN]), [{ op: 'remove', path: '/viewStates' }], undefined],
  ])('%s — 역연산이 원래 문서로 돌린다', (_label, before, ops, expected) => {
    const inverse = invertOps(before, ops)
    const after = applyOps(before, ops)
    expect(after.viewStates).toEqual(expected)
    expect(after.root).toEqual(before.root)
    expect(applyOps(after, inverse)).toEqual(before)
  })
})

describe('/viewStates 편집 — 잠금 판정(고치기 전에도 초록인 성질)', () => {
  const STATE_OPS: [string, PatchOp[]][] = [
    ['만들기', [{ op: 'add', path: '/viewStates', value: [ADMIN] }]],
    ['이름 바꾸기', [{ op: 'replace', path: '/viewStates/0/name', value: '운영자' }]],
    ['옮기기', [{ op: 'move', from: '/viewStates/0', path: '/viewStates/-' }]],
    ['빼기', [{ op: 'remove', path: '/viewStates/0' }]],
  ]

  it.each(STATE_OPS)('남이 뿌리 · 노드를 잡고 있어도 %s 는 막히지 않는다', (_label, ops) => {
    const before = ops[0]!.path === '/viewStates' ? doc() : doc([ADMIN])
    for (const held of ['n_root', 'n_b', 'n_b1']) expect(conflict(before, ops, [lock(held)]), held).toBeNull()
  })

  it('카나리아 — 같은 잠금이 노드 편집은 막는다', () => {
    expect(conflict(doc(), [{ op: 'add', path: '/root/children/0/alias', value: '머리' }], [lock('n_root')])).toBe('n_root')
  })

  it('같은 묶음 안의 노드 연산은 그대로 판정한다', () => {
    const ops: PatchOp[] = [
      { op: 'add', path: '/viewStates', value: [ADMIN] },
      { op: 'remove', path: '/root/children/1' },
    ]
    expect(conflict(doc(), ops, [lock('n_b1')])).toBe('n_b1')
    expect(conflict(doc(), ops, [lock('n_a')])).toBeNull()
  })

  it('잠긴 노드를 목록 자리로 옮기는 연산은 그 노드를 뺀다 — 막힌다', () => {
    const ops: PatchOp[] = [{ op: 'move', from: '/root/children/1', path: '/viewStates/-' }]
    expect(conflict(doc([ADMIN]), ops, [lock('n_b')])).toBe('n_b')
  })

  it('포인터 판정 · 고르기 판정도 목록 경로를 노드와 겹치지 않게 본다', () => {
    expect(
      findLockConflict({ root: doc().root, locks: [lock('n_root')], pointers: ['/viewStates/0'], viewerUserId: 'u_me' }),
    ).toBeNull()
    expect(findLockConflict({ root: doc().root, locks: [lock('n_root')], pointers: ['/root'], viewerUserId: 'u_me' })?.nodeId).toBe(
      'n_root',
    )
    expect(selectionConflicts({ root: doc().root, locks: [lock('n_b')], nodeIds: ['n_a', 'n_b1'], viewerUserId: 'u_me' })).toEqual([
      null,
      lock('n_b'),
    ])
  })
})
