/**
 * 화면 상태의 편집 연산(`view-state-ops.ts`) — 함수마다: 적용한 문서의 검증 오류 0 · 편집 전 문서로 지은 역연산이 원래 문서로 돌린다 ·
 * `null`인 판. 계획 Review Focus 2(복사 + 편집이 기본 가지를 안 건드림)와 4(상태 삭제가 말하는 id 집합 = 실제로 지운 집합)는 따로
 * 묶는다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '../src/component/catalog/index'
import { lockConflictOfOps } from '../src/lock'
import type { PageDocument, WbNode } from '../src/node'
import { applyOps } from '../src/patch/apply'
import { invertOps } from '../src/patch/inverse'
import type { PatchOp } from '../src/patch/types'
import { collectNodeIds, findNode } from '../src/tree'
import { partitionIssues, validatePage } from '../src/validate'
import {
  addViewStateOps,
  editInForkOps,
  forkCaseOps,
  moveViewStateOps,
  removeViewStateOps,
  renameViewStateOps,
  splitIntoStatesOps,
  unsplitStatesOps,
} from '../src/view-state-ops'

beforeAll(() => {
  installCatalog()
})

const ADMIN = { id: 's_admin', name: '관리자' }
const GUEST = { id: 's_guest', name: '비로그인' }

function ids(prefix = 'n_new'): () => string {
  let n = 0
  return () => `${prefix}${(n += 1)}`
}

const text = (id: string, extra: Partial<WbNode> = {}): WbNode => ({ id, type: 'Text', props: { content: id }, ...extra })
const caseOf = (id: string, state: string, children: WbNode[]): WbNode => ({ id, type: 'StateCase', props: { state }, children })

/**
 * ```
 * n_root
 *   n_head
 *   n_a (marker 1 · 누르면 n_b 를 숨김)
 *   n_b
 *   n_c
 *   n_sw ─ n_c0(default) ─ n_d · n_e(setVisible n_d)
 *        └ n_c1(s_admin) ─ n_f
 * ```
 */
function fixture(): PageDocument {
  return {
    version: 1,
    viewStates: [ADMIN, GUEST],
    root: {
      id: 'n_root',
      type: 'Page',
      children: [
        text('n_head'),
        text('n_a', { marker: 1, interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_b', value: false }] }] }),
        { id: 'n_b', type: 'Button', props: { label: '저장' } },
        text('n_c'),
        {
          id: 'n_sw',
          type: 'StateSwitch',
          children: [
            caseOf('n_c0', 'default', [
              text('n_d', { marker: 2 }),
              text('n_e', { interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_d', value: true }] }] }),
            ]),
            caseOf('n_c1', 's_admin', [text('n_f')]),
          ],
        },
      ],
    },
  }
}

/** 적용 · 검증 오류 0 · 역연산 왕복. 적용한 문서를 돌려준다. */
function applied(before: PageDocument, ops: PatchOp[]): PageDocument {
  const after = applyOps(before, ops)
  expect(partitionIssues(validatePage(after)).errors).toEqual([])
  expect(applyOps(after, invertOps(before, ops))).toEqual(before)
  return after
}

const childIds = (node: WbNode | undefined): string[] => (node?.children ?? []).map((child) => child.id)

describe('splitIntoStatesOps — 상태별로 나누기', () => {
  it('기본 상태 — 이어진 형제를 영역 > 기본 가지로 감싼다 · 노드 id 는 그대로', () => {
    const before = fixture()
    const after = applied(before, splitIntoStatesOps(before, ['n_b', 'n_a'], null, ids())!)
    expect(childIds(after.root)).toEqual(['n_head', 'n_new1', 'n_c', 'n_sw'])
    const sw = findNode(after.root, 'n_new1')!
    expect(sw.type).toBe('StateSwitch')
    expect(sw.children).toHaveLength(1)
    expect(sw.children![0]).toMatchObject({ id: 'n_new2', type: 'StateCase', props: { state: 'default' } })
    expect(childIds(sw.children![0])).toEqual(['n_a', 'n_b'])
    expect(findNode(after.root, 'n_a')).toEqual(findNode(before.root, 'n_a'))
  })

  it('기본이 아닌 상태 — 그 상태의 가지를 기본 가지의 복사로 함께 만든다(새 id · 번호 없음 · 복사 안 대상은 복사로)', () => {
    const before = fixture()
    const after = applied(before, splitIntoStatesOps(before, ['n_a', 'n_b'], 's_admin', ids())!)
    const sw = findNode(after.root, 'n_new1')!
    expect(sw.children!.map((child) => child.props?.state)).toEqual(['default', 's_admin'])
    const copy = sw.children![1]!
    expect(collectNodeIds(copy).some((id) => ['n_a', 'n_b'].includes(id))).toBe(false)
    const [copiedA, copiedB] = copy.children!
    expect(copiedA).toMatchObject({ type: 'Text', props: { content: 'n_a' } })
    expect(copiedA).not.toHaveProperty('marker')
    expect(copiedA!.interactions![0]!.actions[0]).toMatchObject({ target: copiedB!.id })
    // 원본은 그대로 기본 가지에 있다 — 번호 · 대상도 그대로.
    expect(findNode(after.root, 'n_a')).toEqual(findNode(before.root, 'n_a'))
  })

  it('영역 하나를 감싸 영역 안의 영역을 만든다', () => {
    const before = fixture()
    const after = applied(before, splitIntoStatesOps(before, ['n_sw'], 's_admin', ids())!)
    const outer = findNode(after.root, 'n_new1')!
    expect(childIds(outer.children![0])).toEqual(['n_sw'])
    expect(outer.children![1]!.children![0]!.type).toBe('StateSwitch')
  })

  it.each<[string, string[], string | null]>([
    ['빈 목록', [], null],
    ['없는 노드', ['n_nope'], null],
    ['뿌리', ['n_root'], null],
    ['이어지지 않은 형제', ['n_a', 'n_c'], null],
    ['부모가 다름', ['n_a', 'n_d'], null],
    ['상태 가지', ['n_c0'], null],
    ['겹친 id', ['n_a', 'n_a'], null],
    ['목록에 없는 상태', ['n_a'], 's_gone'],
  ])('%s 이면 null', (_label, nodeIds, viewState) => {
    expect(splitIntoStatesOps(fixture(), nodeIds, viewState, ids())).toBeNull()
  })

  it('남이 잡은 노드를 감싸면 묶음째 막힌다 — 옮기는 연산이 그 자리와 겹친다', () => {
    const before = fixture()
    const ops = splitIntoStatesOps(before, ['n_a', 'n_b'], null, ids())!
    const locks = [{ nodeId: 'n_b', userId: 'u_other', userName: '다혜' }]
    expect(lockConflictOfOps({ document: before, locks, ops, viewerUserId: 'u_me' })?.nodeId).toBe('n_b')
    const elsewhere = [{ nodeId: 'n_c', userId: 'u_other', userName: '다혜' }]
    expect(lockConflictOfOps({ document: before, locks: elsewhere, ops, viewerUserId: 'u_me' })).toBeNull()
  })
})

describe('unsplitStatesOps — 상태 나누기 풀기', () => {
  it('기본 가지의 내용을 영역 자리에 차례로 꺼내고 다른 가지째 영역을 지운다', () => {
    const before = fixture()
    const after = applied(before, unsplitStatesOps(before, 'n_sw')!)
    expect(childIds(after.root)).toEqual(['n_head', 'n_a', 'n_b', 'n_c', 'n_d', 'n_e'])
    expect(findNode(after.root, 'n_f')).toBeUndefined()
    expect(findNode(after.root, 'n_d')).toEqual(findNode(before.root, 'n_d'))
  })

  it('나눈 뒤 풀면 원래 문서다', () => {
    const before = fixture()
    const split = applied(before, splitIntoStatesOps(before, ['n_b', 'n_c'], 's_guest', ids())!)
    expect(applied(split, unsplitStatesOps(split, 'n_new1')!)).toEqual(before)
  })

  it('빈 기본 가지면 영역만 지운다', () => {
    const before = fixture()
    before.root.children![4]!.children![0]!.children = []
    expect(childIds(applied(before, unsplitStatesOps(before, 'n_sw')!).root)).toEqual(['n_head', 'n_a', 'n_b', 'n_c'])
  })

  it.each([
    ['없는 영역', 'n_nope'],
    ['영역이 아님', 'n_a'],
    ['가지', 'n_c0'],
  ])('%s 이면 null', (_label, id) => {
    expect(unsplitStatesOps(fixture(), id)).toBeNull()
  })

  it('기본 가지가 하나가 아닌 영역은 null', () => {
    const broken = fixture()
    broken.root.children![4]!.children!.shift()
    expect(unsplitStatesOps(broken, 'n_sw')).toBeNull()
  })
})

describe('forkCaseOps · editInForkOps — 복사 + 편집(Review Focus 2)', () => {
  it('그 상태의 가지를 기본 가지의 복사로 영역 끝에 더하고, remap 이 기본 가지의 노드를 전부 덮는다', () => {
    const before = fixture()
    const fork = forkCaseOps(before, 'n_sw', 's_guest', ids())!
    const after = applied(before, fork.ops)
    const sw = findNode(after.root, 'n_sw')!
    expect(sw.children!.map((child) => child.props?.state)).toEqual(['default', 's_admin', 's_guest'])
    expect([...fork.remap.keys()].sort()).toEqual(['n_c0', 'n_d', 'n_e'])
    const copy = sw.children![2]!
    expect(fork.remap.get('n_c0')).toBe(copy.id)
    expect(childIds(copy)).toEqual([fork.remap.get('n_d'), fork.remap.get('n_e')])
    // 복사 안의 대상은 복사를 가리키고 번호는 걷혔다.
    expect(copy.children![1]!.interactions![0]!.actions[0]).toMatchObject({ target: fork.remap.get('n_d') })
    expect(copy.children![0]).not.toHaveProperty('marker')
  })

  it.each<[string, string, string]>([
    ['이미 그 상태의 가지가 있다', 'n_sw', 's_admin'],
    ['기본', 'n_sw', 'default'],
    ['목록에 없는 상태', 'n_sw', 's_gone'],
    ['영역이 아님', 'n_a', 's_guest'],
  ])('%s 이면 null', (_label, switchId, state) => {
    expect(forkCaseOps(fixture(), switchId, state, ids())).toBeNull()
  })

  /** 흐린 기본 가지 안에 내려던 편집들 — 편집 전 문서의 좌표. */
  const EDITS: [string, PatchOp[]][] = [
    ['props 바꾸기', [{ op: 'replace', path: '/root/children/4/children/0/children/0/props/content', value: '손님 안내' }]],
    ['노드 넣기', [{ op: 'add', path: '/root/children/4/children/0/children/-', value: text('n_x') }]],
    ['노드 빼기', [{ op: 'remove', path: '/root/children/4/children/0/children/1' }]],
    ['순서 바꾸기', [{ op: 'move', from: '/root/children/4/children/0/children/1', path: '/root/children/4/children/0/children/0' }]],
    [
      '상호작용 대상을 가지 안 노드로',
      [
        {
          op: 'replace',
          path: '/root/children/4/children/0/children/1/interactions/0/actions/0',
          value: { type: 'setVisible', target: 'n_e', value: false },
        },
      ],
    ],
    // 값 안의 노드 id · 번호(K1 리뷰 R3) — 안 옮기면 복사 가지에 기본 가지와 같은 id 가 서서 `duplicate-id`, 번호가 둘.
    [
      '노드 통째 바꾸기 — 같은 id · 번호 든 값',
      [{ op: 'replace', path: '/root/children/4/children/0/children/0', value: text('n_d', { marker: 2, props: { content: '바꿈' } }) }],
    ],
    [
      '노드 통째 바꾸기 — 새 id · 복사된 노드를 가리키는 값',
      [
        {
          op: 'replace',
          path: '/root/children/4/children/0/children/1',
          value: text('n_z', { interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_d', value: true }] }] }),
        },
      ],
    ],
    [
      '상호작용 대상 글자 하나 바꾸기',
      [{ op: 'replace', path: '/root/children/4/children/0/children/1/interactions/0/actions/0/target', value: 'n_e' }],
    ],
  ]

  it.each(EDITS)('%s — 기본 가지는 그대로이고 새 가지에 편집이 선다 · 되돌리기 한 번', (_label, edit) => {
    const before = fixture()
    const base = structuredClone(findNode(before.root, 'n_c0')!)
    const result = editInForkOps(before, 'n_sw', 's_guest', edit, ids())!
    const after = applied(before, result.ops)
    expect(findNode(after.root, 'n_c0')).toEqual(base)

    // 대조 — 같은 편집을 기본 가지에 바로 낸 문서의 기본 가지가 새 가지와 같은 모양이다(id 를 옮겨 견준다).
    const direct = findNode(applyOps(before, edit).root, 'n_c0')!
    const copy = findNode(after.root, 'n_sw')!.children![2]!
    const back = new Map([...result.remap].map(([from, to]) => [to, from]))
    const restored = JSON.parse(JSON.stringify(copy), (key, value) =>
      typeof value === 'string' && (key === 'id' || key === 'target') ? (back.get(value) ?? value) : value,
    )
    expect({ ...restored, props: direct.props }).toEqual(stripMarkersDeep(direct))
  })

  it('값 안의 상호작용 대상이 복사된 노드면 복사를 가리킨다 — 기본 가지의 노드를 가리키지 않는다', () => {
    const edit: PatchOp[] = [
      {
        op: 'replace',
        path: '/root/children/4/children/0/children/1/interactions/0/actions/0',
        value: { type: 'setVisible', target: 'n_e', value: false },
      },
      {
        op: 'add',
        path: '/root/children/4/children/0/children/-',
        value: {
          ...text('n_y'),
          interactions: [
            {
              on: 'click',
              actions: [
                { type: 'setVisible', target: 'n_d', value: true },
                { type: 'setVisible', target: 'n_head', value: true },
              ],
            },
          ],
        },
      },
    ]
    const result = editInForkOps(fixture(), 'n_sw', 's_guest', edit, ids())!
    const copy = findNode(applyOps(fixture(), result.ops).root, 'n_sw')!.children![2]!
    expect(copy.children![1]!.interactions![0]!.actions[0]).toMatchObject({ target: result.remap.get('n_e') })
    // 복사 밖(영역 밖의 머리)을 가리키는 대상은 그대로다.
    expect(copy.children![2]!.interactions![0]!.actions.map((action) => action.target)).toEqual([result.remap.get('n_d'), 'n_head'])
  })

  it('글자 하나짜리 대상 값(`replace …/target`)도 복사를 가리킨다 — 그 자리의 열쇠로 가른다', () => {
    const edit: PatchOp[] = [
      { op: 'replace', path: '/root/children/4/children/0/children/1/interactions/0/actions/0/target', value: 'n_d' },
    ]
    const result = editInForkOps(fixture(), 'n_sw', 's_guest', edit, ids())!
    expect(result.ops.at(-1)).toEqual({
      op: 'replace',
      path: '/root/children/4/children/2/children/1/interactions/0/actions/0/target',
      value: result.remap.get('n_d'),
    })
  })

  it('`children` 키 없는 기본 가지의 첫 자식 넣기(`add …/children [노드]`)도 가지 안이다 — 새 가지에 선다', () => {
    const before = fixture()
    const sw = findNode(before.root, 'n_sw')!
    sw.children![0] = { id: 'n_c0', type: 'StateCase', props: { state: 'default' } }
    expect(partitionIssues(validatePage(before)).errors).toEqual([])
    const edit: PatchOp[] = [{ op: 'add', path: '/root/children/4/children/0/children', value: [text('n_first')] }]
    const result = editInForkOps(before, 'n_sw', 's_guest', edit, ids())!
    const after = applied(before, result.ops)
    expect(findNode(after.root, 'n_c0')).toEqual({ id: 'n_c0', type: 'StateCase', props: { state: 'default' } })
    expect(childIds(findNode(after.root, 'n_sw')!.children![2]!)).toEqual(['n_first'])
  })

  it('편집이 기본 가지 밖을 가리키면 null — 모든 상태에 반영되는 평범한 편집이다', () => {
    const outside: PatchOp[] = [{ op: 'replace', path: '/root/children/0/props/content', value: '머리' }]
    expect(editInForkOps(fixture(), 'n_sw', 's_guest', outside, ids())).toBeNull()
    const mixed: PatchOp[] = [EDITS[0]![1][0]!, outside[0]!]
    expect(editInForkOps(fixture(), 'n_sw', 's_guest', mixed, ids())).toBeNull()
    // 가지 자신의 필드는 그 가지의 정체다 — 옮기지 않는다(길이로는 가지 안 노드와 같은 깊이다).
    const caseItself: PatchOp[] = [{ op: 'replace', path: '/root/children/4/children/0/props/state', value: 's_guest' }]
    expect(editInForkOps(fixture(), 'n_sw', 's_guest', caseItself, ids())).toBeNull()
    const fromOutside: PatchOp[] = [{ op: 'move', from: '/root/children/0', path: '/root/children/4/children/0/children/0' }]
    expect(editInForkOps(fixture(), 'n_sw', 's_guest', fromOutside, ids())).toBeNull()
  })
})

function stripMarkersDeep(node: WbNode): WbNode {
  const { marker: _marker, ...rest } = node
  return { ...rest, ...(node.children ? { children: node.children.map(stripMarkersDeep) } : {}) } as WbNode
}

describe('상태 목록 편집 — 추가 · 이름 · 순서', () => {
  it('추가 — 목록이 없으면 만들고, 있으면 끝에 더한다 · 이름은 앞뒤 공백을 걷는다', () => {
    const empty: PageDocument = { version: 1, root: { id: 'n_root', type: 'Page', children: [] } }
    expect(applied(empty, addViewStateOps(empty, '  관리자 ', ids('s_'))!).viewStates).toEqual([{ id: 's_1', name: '관리자' }])
    expect(applied(fixture(), addViewStateOps(fixture(), '편집자', ids('s_'))!).viewStates).toEqual([
      ADMIN,
      GUEST,
      { id: 's_1', name: '편집자' },
    ])
  })

  it.each([
    ['빈 이름', ''],
    ['공백뿐', '   '],
    ['31자', '가'.repeat(31)],
    ['줄바꿈', '관리\n자'],
    ['겹치는 이름', '관리자'],
  ])('추가 — %s 이면 null', (_label, name) => {
    expect(addViewStateOps(fixture(), name, ids('s_'))).toBeNull()
  })

  it('추가 — 20개면 null', () => {
    const full = fixture()
    full.viewStates = Array.from({ length: 20 }, (_, i) => ({ id: `s_${i}`, name: `상태 ${i}` }))
    expect(addViewStateOps(full, '하나 더', ids('s_x'))).toBeNull()
    full.viewStates.pop()
    expect(applied(full, addViewStateOps(full, '하나 더', ids('s_x'))!).viewStates).toHaveLength(20)
  })

  it('이름 바꾸기 — id 는 그대로다', () => {
    expect(applied(fixture(), renameViewStateOps(fixture(), 's_guest', ' 손님 ')!).viewStates).toEqual([
      ADMIN,
      { id: 's_guest', name: '손님' },
    ])
  })

  it.each([
    ['없는 상태', 's_nope', '손님'],
    ['다른 상태와 겹침', 's_guest', '관리자'],
    ['그대로', 's_guest', '비로그인'],
    ['31자', 's_guest', '가'.repeat(31)],
  ])('이름 바꾸기 — %s 이면 null', (_label, id, name) => {
    expect(renameViewStateOps(fixture(), id, name)).toBeNull()
  })

  it('순서 바꾸기', () => {
    expect(applied(fixture(), moveViewStateOps(fixture(), 's_guest', 0)!).viewStates).toEqual([GUEST, ADMIN])
    expect(applied(fixture(), moveViewStateOps(fixture(), 's_admin', 1)!).viewStates).toEqual([GUEST, ADMIN])
  })

  it.each<[string, string, number]>([
    ['없는 상태', 's_nope', 0],
    ['그대로', 's_admin', 0],
    ['범위 밖', 's_admin', 2],
    ['음수', 's_admin', -1],
    ['정수 아님', 's_admin', 0.5],
  ])('순서 바꾸기 — %s 이면 null', (_label, id, to) => {
    expect(moveViewStateOps(fixture(), id, to)).toBeNull()
  })
})

describe('removeViewStateOps — 상태 삭제(Review Focus 4)', () => {
  /** 지운 뒤 문서에서 사라진 id 집합 — 함수가 말한 집합과 견줄 오라클. */
  function vanished(before: PageDocument, after: PageDocument): string[] {
    const left = new Set(collectNodeIds(after.root))
    return collectNodeIds(before.root)
      .filter((id) => !left.has(id))
      .sort()
  }

  it('그 상태의 가지를 모두 지우고 목록에서 뺀다 — 말한 id 집합 = 실제로 사라진 집합', () => {
    const before = fixture()
    const result = removeViewStateOps(before, 's_admin')!
    const after = applied(before, result.ops)
    expect(after.viewStates).toEqual([GUEST])
    expect(result.removedCaseIds).toEqual(['n_c1'])
    expect([...result.removedNodeIds].sort()).toEqual(vanished(before, after))
    expect(vanished(before, after)).toEqual(['n_c1', 'n_f'])
  })

  it('여러 영역 · 영역 안의 영역 — 같은 상태의 가지가 가지 안에 든 판까지', () => {
    const before = fixture()
    const inner: WbNode = {
      id: 'n_in',
      type: 'StateSwitch',
      children: [caseOf('n_ic0', 'default', [text('n_g')]), caseOf('n_ic1', 's_admin', [text('n_h')])],
    }
    before.root.children![4]!.children![1]!.children!.push(inner)
    before.root.children!.push({
      id: 'n_sw2',
      type: 'StateSwitch',
      children: [
        caseOf('n_k0', 'default', [
          { ...inner, id: 'n_in2', children: [caseOf('n_m0', 'default', []), caseOf('n_m1', 's_admin', [text('n_m')])] },
        ]),
        caseOf('n_k1', 's_guest', []),
      ],
    })
    const result = removeViewStateOps(before, 's_admin')!
    const after = applied(before, result.ops)
    expect([...result.removedCaseIds].sort()).toEqual(['n_c1', 'n_ic1', 'n_m1'])
    expect([...result.removedNodeIds].sort()).toEqual(vanished(before, after))
    expect(findNode(after.root, 'n_k0')).toBeDefined()
    expect(findNode(after.root, 'n_m0')).toBeDefined()
  })

  it('가지가 하나도 없는 상태는 목록에서만 뺀다', () => {
    const before = fixture()
    const result = removeViewStateOps(before, 's_guest')!
    expect(result).toMatchObject({ removedCaseIds: [], removedNodeIds: [] })
    expect(applied(before, result.ops).viewStates).toEqual([ADMIN])
  })

  it('없는 상태면 null', () => {
    expect(removeViewStateOps(fixture(), 's_nope')).toBeNull()
  })

  it('지우는 가지 안 노드가 남에게 잠겼으면 묶음째 막힌다 · 다른 가지의 잠금은 막지 않는다', () => {
    const before = fixture()
    const { ops } = removeViewStateOps(before, 's_admin')!
    const lock = (nodeId: string) => [{ nodeId, userId: 'u_other', userName: '다혜' }]
    expect(lockConflictOfOps({ document: before, locks: lock('n_f'), ops, viewerUserId: 'u_me' })?.nodeId).toBe('n_f')
    expect(lockConflictOfOps({ document: before, locks: lock('n_d'), ops, viewerUserId: 'u_me' })).toBeNull()
    expect(lockConflictOfOps({ document: before, locks: lock('n_root'), ops, viewerUserId: 'u_me' })?.nodeId).toBe('n_root')
  })

  it('무작위 문서 — 상태마다 지운 뒤 검증 오류 0 · 역연산 왕복 · 말한 집합 = 사라진 집합', () => {
    let seed = 7
    const random = (): number => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
    const STATES = ['s_1', 's_2', 's_3']
    let boards = 0
    let nested = 0
    let removedSomething = 0
    for (let round = 0; round < 300; round += 1) {
      let next = 0
      const id = (): string => `n_${round}_${(next += 1)}`
      const grow = (depth: number): WbNode[] =>
        Array.from({ length: 1 + Math.floor(random() * 3) }, () => {
          if (depth < 3 && random() < 0.45) {
            const states = STATES.filter(() => random() < 0.5)
            return {
              id: id(),
              type: 'StateSwitch',
              children: [caseOf(id(), 'default', grow(depth + 1)), ...states.map((state) => caseOf(id(), state, grow(depth + 1)))],
            }
          }
          return text(id())
        })
      const before: PageDocument = {
        version: 1,
        viewStates: STATES.map((state) => ({ id: state, name: state })),
        root: { id: 'n_root', type: 'Page', children: grow(0) },
      }
      expect(partitionIssues(validatePage(before)).errors).toEqual([])
      for (const state of STATES) {
        const result = removeViewStateOps(before, state)!
        const after = applied(before, result.ops)
        expect([...result.removedNodeIds].sort()).toEqual(vanished(before, after))
        expect(collectNodeIds(after.root).some((nodeId) => result.removedCaseIds.includes(nodeId))).toBe(false)
        boards += 1
        if (result.removedCaseIds.length > result.ops.length - 1) nested += 1
        if (result.removedCaseIds.length > 0) removedSomething += 1
      }
    }
    // 카나리아 — 판 수 · 가지를 실제로 지운 판 · 같은 상태의 가지가 지우는 가지 안에 든 판(경로가 밀리는 판)의 하한.
    expect(boards).toBe(900)
    expect(removedSomething).toBeGreaterThan(300)
    expect(nested).toBeGreaterThan(20)
  })
})
