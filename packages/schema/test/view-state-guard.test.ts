/**
 * **상태 목록의 있는 자리를 고치는 묶음은 그 자리의 id 를 `test`로 싣는다**(`src/view-state-guard.ts`) — 연산 `test`의 적용 · 역 · 잠금
 * 판정, 가드 표의 칸마다, 묶음을 짓는 함수 · 서버 역연산(`invertOps`)이 싣는지, 그리고 무작위 겹친 판(남이 먼저 고친 목록에 내 묶음을 경로
 * 그대로 얹음)에서 내 상태 밖을 안 고치는지. 실서버의 겹친 판은 `apps/api/test/view-states-anchor.test.ts`, 웹 리베이스가 상태 id 로 다시
 * 짚는 판은 `apps/web/test/store/anchored-ops.test.ts` «상태 목록».
 */
import { describe, expect, it } from 'vitest'
import { lockConflictOfOps, type NodeLock } from '../src/lock'
import type { PageDocument, ViewState } from '../src/node'
import { applyOps } from '../src/patch/apply'
import { invertOps } from '../src/patch/inverse'
import { PatchError, type PatchOp } from '../src/patch/types'
import { guardViewStateOps } from '../src/view-state-guard'
import { addViewStateOps, moveViewStateOps, removeViewStateOps, renameViewStateOps } from '../src/view-state-ops'

const A = { id: 's_a', name: '가' }
const B = { id: 's_b', name: '나' }
const C = { id: 's_c', name: '다' }

function doc(viewStates?: ViewState[]): PageDocument {
  const base: PageDocument = {
    version: 2,
    root: { id: 'n_root', type: 'Page', children: [{ id: 'n_x', type: 'Text', props: { content: 'x' } }] },
  }
  return viewStates === undefined ? base : { ...base, viewStates }
}

describe('연산 `test`', () => {
  it('값이 같으면 문서를 안 바꾸고 지나간다 — 객체는 키 차례를 안 본다', () => {
    const before = doc([A, B])
    expect(applyOps(before, [{ op: 'test', path: '/viewStates/1', value: { name: '나', id: 's_b' } }])).toEqual(before)
    expect(applyOps(before, [{ op: 'test', path: '/viewStates', value: [A, B] }])).toEqual(before)
  })

  it.each<[string, PatchOp]>([
    ['다른 값', { op: 'test', path: '/viewStates/0/id', value: 's_b' }],
    ['배열의 차례가 다름', { op: 'test', path: '/viewStates', value: [B, A] }],
    ['키가 하나 더 있음', { op: 'test', path: '/viewStates/0', value: { ...A, extra: 1 } }],
    ['없는 자리', { op: 'test', path: '/viewStates/2/id', value: 's_c' }],
    ['없는 키', { op: 'test', path: '/nope', value: null }],
    ['`null`과 없는 자리는 다르다', { op: 'test', path: '/viewStates/0/missing', value: null }],
  ])('맞지 않으면 묶음째 던진다 — %s', (_name, op) => {
    expect(() => applyOps(doc([A, B]), [{ op: 'replace', path: '/viewStates/0/name', value: '바뀜' }, op])).toThrow(PatchError)
  })

  it('뿌리(`""`)는 다른 연산처럼 받지 않는다', () => {
    expect(() => applyOps(doc([A]), [{ op: 'test', path: '', value: doc([A]) }])).toThrow('문서 루트')
  })

  it('역은 없다 — 역 묶음에 안 실리고, 맞지 않으면 역도 던진다', () => {
    const before = doc([A])
    const ops: PatchOp[] = [
      { op: 'test', path: '/root/children/0/id', value: 'n_x' },
      { op: 'remove', path: '/root/children/0' },
    ]
    const inverse = invertOps(before, ops)
    expect(inverse).toEqual([{ op: 'add', path: '/root/children/0', value: before.root.children![0] }])
    expect(applyOps(applyOps(before, ops), inverse)).toEqual(before)
    expect(() => invertOps(before, [{ op: 'test', path: '/root/children/0/id', value: 'n_y' }])).toThrow(PatchError)
  })

  it('잠금 판정 — 잠긴 노드를 재는 `test`는 그 노드를 건드리지 않는다 · 맞지 않는 `test`는 판정하지 않는다(적용이 거절한다)', () => {
    const locks: NodeLock[] = [{ nodeId: 'n_x', userId: 'u_other', userName: '다혜' }]
    const ask = (ops: PatchOp[]) => lockConflictOfOps({ document: doc([A]), locks, ops, viewerUserId: 'u_me' })?.nodeId ?? null
    expect(ask([{ op: 'test', path: '/root/children/0/props/content', value: 'x' }])).toBeNull()
    expect(
      ask([
        { op: 'test', path: '/root/children/0/id', value: 'n_x' },
        { op: 'remove', path: '/root/children/0' },
      ]),
    ).toBe('n_x')
    expect(
      ask([
        { op: 'test', path: '/root/children/0/id', value: 'n_y' },
        { op: 'remove', path: '/root/children/0' },
      ]),
    ).toBeNull()
  })
})

describe('가드 표 — 연산마다 싣는 `test`', () => {
  const T = (path: string, value: unknown): PatchOp => ({ op: 'test', path, value })
  it.each<[string, PageDocument, PatchOp[], PatchOp[]]>([
    [
      '항목 빼기',
      doc([A, B]),
      [{ op: 'remove', path: '/viewStates/1' }],
      [T('/viewStates/1/id', 's_b'), { op: 'remove', path: '/viewStates/1' }],
    ],
    [
      '항목 바꾸기',
      doc([A]),
      [{ op: 'replace', path: '/viewStates/0', value: C }],
      [T('/viewStates/0/id', 's_a'), { op: 'replace', path: '/viewStates/0', value: C }],
    ],
    [
      '항목 안 바꾸기',
      doc([A]),
      [{ op: 'replace', path: '/viewStates/0/name', value: '라' }],
      [T('/viewStates/0/id', 's_a'), { op: 'replace', path: '/viewStates/0/name', value: '라' }],
    ],
    [
      '항목 안 넣기(키)',
      doc([A]),
      [{ op: 'add', path: '/viewStates/0/name', value: '라' }],
      [T('/viewStates/0/id', 's_a'), { op: 'add', path: '/viewStates/0/name', value: '라' }],
    ],
    [
      '번호는 적용과 같은 규칙으로 읽는다(`01`)',
      doc([A, B]),
      [{ op: 'remove', path: '/viewStates/01' }],
      [T('/viewStates/1/id', 's_b'), { op: 'remove', path: '/viewStates/01' }],
    ],
    [
      '옮기기(순서)',
      doc([A, B]),
      [{ op: 'move', from: '/viewStates/1', path: '/viewStates/0' }],
      [T('/viewStates/1/id', 's_b'), { op: 'move', from: '/viewStates/1', path: '/viewStates/0' }],
    ],
    [
      '항목 안으로 옮겨 넣기 — 옮긴 뒤 문서의 번호로 그 move 뒤에',
      doc([A, B, C]),
      [{ op: 'move', from: '/viewStates/0/name', path: '/viewStates/2/name' }],
      [T('/viewStates/0/id', 's_a'), { op: 'move', from: '/viewStates/0/name', path: '/viewStates/2/name' }, T('/viewStates/2/id', 's_c')],
    ],
    ['끝에 넣기', doc([A]), [{ op: 'add', path: '/viewStates/-', value: B }], [{ op: 'add', path: '/viewStates/-', value: B }]],
    ['번호 자리에 넣기', doc([A]), [{ op: 'add', path: '/viewStates/0', value: B }], [{ op: 'add', path: '/viewStates/0', value: B }]],
    ['없는 목록 만들기', doc(), [{ op: 'add', path: '/viewStates', value: [A] }], [{ op: 'add', path: '/viewStates', value: [A] }]],
    [
      '있는 목록 위 `add`(덮기)',
      doc([A]),
      [{ op: 'add', path: '/viewStates', value: [B] }],
      [T('/viewStates', [A]), { op: 'add', path: '/viewStates', value: [B] }],
    ],
    [
      '목록째 빼기',
      doc([A, B]),
      [{ op: 'remove', path: '/viewStates' }],
      [T('/viewStates', [A, B]), { op: 'remove', path: '/viewStates' }],
    ],
    [
      '목록째 덮어 옮겨 넣기',
      doc([A]),
      [{ op: 'move', from: '/root/children/0', path: '/viewStates' }],
      [T('/viewStates', [A]), { op: 'move', from: '/root/children/0', path: '/viewStates' }],
    ],
    [
      '뒤 연산의 `test`는 앞 연산을 얹은 문서에서 읽는다',
      doc([A, B]),
      [
        { op: 'remove', path: '/viewStates/0' },
        { op: 'replace', path: '/viewStates/0/name', value: '라' },
      ],
      [
        T('/viewStates/0/id', 's_a'),
        { op: 'remove', path: '/viewStates/0' },
        T('/viewStates/0/id', 's_b'),
        { op: 'replace', path: '/viewStates/0/name', value: '라' },
      ],
    ],
    [
      '이미 실은 같은 `test`는 다시 싣지 않는다',
      doc([A]),
      [T('/viewStates/0/id', 's_a'), { op: 'remove', path: '/viewStates/0' }],
      [T('/viewStates/0/id', 's_a'), { op: 'remove', path: '/viewStates/0' }],
    ],
    ['목록 밖', doc([A]), [{ op: 'remove', path: '/root/children/0' }], [{ op: 'remove', path: '/root/children/0' }]],
  ])('%s', (_name, before, ops, guarded) => {
    expect(guardViewStateOps(before, ops)).toEqual(guarded)
    // 실은 `test`는 그 묶음이 선 문서에서 늘 맞는다.
    expect(applyOps(before, guarded)).toEqual(applyOps(before, ops))
  })

  it('적용이 실패하는 연산을 만나면 그 뒤는 그대로 둔다', () => {
    const ops: PatchOp[] = [
      { op: 'remove', path: '/viewStates/5' },
      { op: 'remove', path: '/viewStates/0' },
    ]
    expect(guardViewStateOps(doc([A]), ops)).toEqual(ops)
  })
})

describe('묶음을 짓는 함수 · 서버 역연산이 싣는다', () => {
  const base = doc([A, B])
  it.each<[string, PatchOp[]]>([
    ['이름 바꾸기', renameViewStateOps(base, 's_b', '라')!],
    ['순서 바꾸기', moveViewStateOps(base, 's_b', 0)!],
    ['상태 삭제', removeViewStateOps(base, 's_b')!.ops],
  ])('%s — 목록의 고칠 자리 앞에 그 id', (_name, ops) => {
    const at = ops.findIndex(
      (op) => op.op !== 'test' && (op.path.startsWith('/viewStates/1') || (op.op === 'move' && op.from === '/viewStates/1')),
    )
    expect(ops[at - 1]).toEqual({ op: 'test', path: '/viewStates/1/id', value: 's_b' })
  })

  it('상태 추가는 싣지 않는다 — 넣는 자리는 남의 것을 안 가리킨다', () => {
    expect(addViewStateOps(base, '라', null, () => 's_d')).toEqual([{ op: 'add', path: '/viewStates/-', value: { id: 's_d', name: '라' } }])
  })

  it.each<[string, PatchOp[], PatchOp]>([
    ['상태 추가', addViewStateOps(base, '라', null, () => 's_d')!, { op: 'test', path: '/viewStates/2/id', value: 's_d' }],
    ['이름 바꾸기', renameViewStateOps(base, 's_b', '라')!, { op: 'test', path: '/viewStates/1/id', value: 's_b' }],
    ['순서 바꾸기', moveViewStateOps(base, 's_b', 0)!, { op: 'test', path: '/viewStates/0/id', value: 's_b' }],
    ['목록 만들기', addViewStateOps(doc(), '가', null, () => 's_a')!, { op: 'test', path: '/viewStates', value: [A] }],
  ])('%s의 역연산 — 첫 연산이 그 자리의 test · 왕복하면 원래 문서', (_name, ops, guard) => {
    const before = ops[0]!.path === '/viewStates' ? doc() : base
    const inverse = invertOps(before, ops)
    expect(inverse[0]).toEqual(guard)
    expect(applyOps(applyOps(before, ops), inverse)).toEqual(before)
  })
})

/** 결정적 난수(mulberry32). */
function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('무작위 겹친 판 — 남이 먼저 고친 목록에 내 묶음을 경로 그대로 얹어도 내 상태 밖을 안 고친다', () => {
  it('묶음 · 역연산 일곱 꼴 × 남의 편집 넷 — 4000 판', () => {
    const tally = { boards: 0, applied: 0, rejected: 0, shifted: 0, mineGone: 0 }
    const broken: string[] = []
    for (let seed = 1; seed <= 4000; seed += 1) {
      const rand = random(seed)
      const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!
      const size = 2 + Math.floor(rand() * 5)
      const states: ViewState[] = Array.from({ length: size }, (_, i) => ({ id: `s_${i}`, name: `상태${i}` }))
      const target = pick(states).id
      let base = doc(states)
      // 내 묶음 — 짓는 함수 그대로, 또는 서버가 지은 역연산(앞 편집 하나를 커밋한 문서 위에 선다).
      const kind = pick(['rename', 'move', 'remove', 'undo-add', 'undo-rename', 'undo-move', 'undo-remove'] as const)
      let mine: PatchOp[]
      let mineId = target
      if (kind === 'rename') mine = renameViewStateOps(base, target, '바꾼 이름')!
      else if (kind === 'move') mine = moveViewStateOps(base, target, (states.findIndex((s) => s.id === target) + 1) % size)!
      else if (kind === 'remove') mine = removeViewStateOps(base, target)!.ops
      else {
        const forward =
          kind === 'undo-add'
            ? addViewStateOps(base, '더한 상태', null, () => 's_new')!
            : kind === 'undo-rename'
              ? renameViewStateOps(base, target, '바꾼 이름')!
              : kind === 'undo-move'
                ? moveViewStateOps(base, target, (states.findIndex((s) => s.id === target) + 1) % size)!
                : removeViewStateOps(base, target)!.ops
        if (kind === 'undo-add') mineId = 's_new'
        mine = invertOps(base, forward)
        base = applyOps(base, forward)
      }
      // 남의 편집 — 내 묶음이 선 문서 위에 먼저 커밋된다.
      const list = base.viewStates!
      const other = pick(list)
      const otherIndex = list.indexOf(other)
      const theirs: PatchOp[] = pick([
        [{ op: 'move', from: `/viewStates/${otherIndex}`, path: `/viewStates/${Math.floor(rand() * list.length)}` }],
        [{ op: 'remove', path: `/viewStates/${otherIndex}` }],
        [{ op: 'add', path: `/viewStates/${Math.floor(rand() * (list.length + 1))}`, value: { id: 's_theirs', name: '남의 상태' } }],
        [{ op: 'replace', path: `/viewStates/${otherIndex}/name`, value: '남이 바꾼 이름' }],
      ])
      const now = applyOps(base, theirs)
      tally.boards += 1
      const indexOf = (d: PageDocument, id: string) => (d.viewStates ?? []).findIndex((s) => s.id === id)
      if (indexOf(base, mineId) !== indexOf(now, mineId)) tally.shifted += 1
      if (indexOf(base, mineId) !== -1 && indexOf(now, mineId) === -1) tally.mineGone += 1
      let after: PageDocument
      try {
        after = applyOps(now, mine)
      } catch {
        tally.rejected += 1
        continue
      }
      tally.applied += 1
      // 내 상태 밖의 상태는 남의 편집 뒤 그대로 — 빠지지도, 이름이 바뀌지도, 새로 서지도, 서로의 차례가 바뀌지도 않는다.
      const others = (d: PageDocument) => (d.viewStates ?? []).filter((s) => s.id !== mineId).map((s) => `${s.id}=${s.name}`)
      if (others(after).join() !== others(now).join()) {
        if (broken.length < 5)
          broken.push(`seed ${seed} ${kind}: ${JSON.stringify(mine)} 남 ${JSON.stringify(theirs)} → ${others(after)} ≠ ${others(now)}`)
        else broken.push('…')
      }
    }
    console.log(`상태 목록 겹친 판 ${JSON.stringify(tally)}`)
    expect(broken).toEqual([])
    // 카나리아 — 판이 겹친 판(내 자리가 밀림 · 내 상태가 사라짐)을 넉넉히 세우고, 얹힘 · 거절이 둘 다 선다.
    expect(tally.boards).toBe(4000)
    expect(tally.shifted).toBeGreaterThan(800)
    expect(tally.mineGone).toBeGreaterThan(150)
    expect(tally.applied).toBeGreaterThan(1500)
    expect(tally.rejected).toBeGreaterThan(500)
  }, 60_000)
})
