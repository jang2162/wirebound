/**
 * 화면 상태 목록의 편집 연산(`view-state-ops.ts`) — 함수마다: 적용한 문서의 검증 오류 0 · 편집 전 문서로 지은 역연산이 원래 문서로 돌린다 ·
 * `null`인 판. 계획 Review Focus 4(상태 삭제가 말하는 id 집합 = 실제로 바뀐 노드 집합)는 따로 묶는다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '../src/component/catalog/index'
import { lockConflictOfOps } from '../src/lock'
import type { NodeVisibility, PageDocument, ViewState, WbNode } from '../src/node'
import { applyOps } from '../src/patch/apply'
import { invertOps } from '../src/patch/inverse'
import type { PatchOp } from '../src/patch/types'
import { collectNodeIds, findNode, walkNodes } from '../src/tree'
import { partitionIssues, validatePage } from '../src/validate'
import { VIEW_STATE_DESCRIPTION_MAX } from '../src/node'
import {
  addViewStateOps,
  describeViewStateOps,
  moveViewStateOps,
  removeViewStateOps,
  renameViewStateOps,
  tidyViewStateDescription,
} from '../src/view-state-ops'

beforeAll(() => {
  installCatalog()
})

const LOGIN: ViewState = { id: 's_login', name: '로그인' }
const ADMIN: ViewState = { id: 's_admin', name: '관리자', parent: 's_login' }
const MEMBER: ViewState = { id: 's_member', name: '회원', parent: 's_login' }
const GUEST: ViewState = { id: 's_guest', name: '손님' }

function ids(prefix = 'n_new'): () => string {
  let n = 0
  return () => `${prefix}${(n += 1)}`
}

const text = (id: string, visibility?: NodeVisibility, extra: Partial<WbNode> = {}): WbNode => ({
  id,
  type: 'Text',
  props: { content: id },
  ...(visibility === undefined ? {} : { visibility }),
  ...extra,
})

/**
 * ```
 * n_root
 *   n_head
 *   n_a    only [로그인]          — 로그인 · 관리자 · 회원
 *   n_b    only [관리자]           — 관리자에서만
 *   n_c    only [관리자, 손님]
 *   n_d    except [관리자]
 *   n_box  only [회원] ─ n_in · n_in2 only [default]
 *   n_e    except [로그인, 손님]
 * ```
 */
function fixture(): PageDocument {
  return {
    version: 2,
    viewStates: [LOGIN, ADMIN, GUEST, MEMBER],
    root: {
      id: 'n_root',
      type: 'Page',
      children: [
        text('n_head'),
        text('n_a', { mode: 'only', states: ['s_login'] }),
        text('n_b', { mode: 'only', states: ['s_admin'] }),
        text('n_c', { mode: 'only', states: ['s_admin', 's_guest'] }),
        text('n_d', { mode: 'except', states: ['s_admin'] }),
        {
          id: 'n_box',
          type: 'Card',
          visibility: { mode: 'only', states: ['s_member'] },
          children: [text('n_in'), text('n_in2', { mode: 'only', states: ['default'] })],
        },
        text('n_e', { mode: 'except', states: ['s_login', 's_guest'] }),
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

describe('상태 목록 편집 — 추가 · 이름 · 순서', () => {
  it('추가 — 목록이 없으면 만들고, 있으면 끝에 더한다 · 이름은 앞뒤 공백을 걷는다', () => {
    const empty: PageDocument = { version: 2, root: { id: 'n_root', type: 'Page', children: [] } }
    expect(applied(empty, addViewStateOps(empty, '  관리자 ', null, ids('s_'))!).viewStates).toEqual([{ id: 's_1', name: '관리자' }])
    expect(applied(fixture(), addViewStateOps(fixture(), '편집자', null, ids('s_'))!).viewStates).toEqual([
      LOGIN,
      ADMIN,
      GUEST,
      MEMBER,
      { id: 's_1', name: '편집자' },
    ])
  })

  it('하위 상태 추가 — 부모를 싣고 부모의 id 를 test 로 싣는다', () => {
    const ops = addViewStateOps(fixture(), '최고', 's_admin', ids('s_'))!
    expect(ops).toEqual([
      { op: 'test', path: '/viewStates/1/id', value: 's_admin' },
      { op: 'add', path: '/viewStates/-', value: { id: 's_1', name: '최고', parent: 's_admin' } },
    ])
    expect(applied(fixture(), ops).viewStates!.at(-1)).toEqual({ id: 's_1', name: '최고', parent: 's_admin' })
    // 남이 그 사이 부모를 지우면 test 가 묶음째 막는다.
    const gone = fixture()
    gone.viewStates = [LOGIN, GUEST]
    expect(() => applyOps(gone, ops)).toThrow()
  })

  it('하위 상태 추가 — 없는 부모 · 깊이 3 을 넘음이면 null', () => {
    expect(addViewStateOps(fixture(), '최고', 's_nope', ids('s_'))).toBeNull()
    const deep = fixture()
    deep.viewStates!.push({ id: 's_top', name: '최고', parent: 's_admin' })
    expect(addViewStateOps(deep, '넷째', 's_top', ids('s_'))).toBeNull()
    expect(applied(deep, addViewStateOps(deep, '셋째', 's_admin', ids('s_'))!).viewStates).toHaveLength(6)
  })

  it.each([
    ['빈 이름', ''],
    ['공백뿐', '   '],
    ['31자', '가'.repeat(31)],
    ['줄바꿈', '관리\n자'],
    ['겹치는 이름', '관리자'],
  ])('추가 — %s 이면 null', (_label, name) => {
    expect(addViewStateOps(fixture(), name, null, ids('s_'))).toBeNull()
  })

  it('추가 — 20개면 null', () => {
    const full = fixture()
    full.viewStates = Array.from({ length: 20 }, (_, i) => ({ id: `s_${i}`, name: `상태 ${i}` }))
    full.root.children = []
    expect(addViewStateOps(full, '하나 더', null, ids('s_x'))).toBeNull()
    full.viewStates.pop()
    expect(applied(full, addViewStateOps(full, '하나 더', null, ids('s_x'))!).viewStates).toHaveLength(20)
  })

  it('이름 바꾸기 — id · 부모는 그대로다', () => {
    expect(applied(fixture(), renameViewStateOps(fixture(), 's_admin', ' 운영자 ')!).viewStates![1]).toEqual({
      id: 's_admin',
      name: '운영자',
      parent: 's_login',
    })
  })

  it.each([
    ['없는 상태', 's_nope', '손님2'],
    ['다른 상태와 겹침', 's_guest', '관리자'],
    ['그대로', 's_guest', '손님'],
    ['31자', 's_guest', '가'.repeat(31)],
  ])('이름 바꾸기 — %s 이면 null', (_label, id, name) => {
    expect(renameViewStateOps(fixture(), id, name)).toBeNull()
  })

  it('순서 바꾸기 — 형제 안에서만 · 자리는 형제 차례', () => {
    // 뿌리 형제: 로그인 · 손님. 로그인 > 형제: 관리자 · 회원(목록에서는 손님을 사이에 둔다).
    expect(applied(fixture(), moveViewStateOps(fixture(), 's_guest', 0)!).viewStates!.map((state) => state.id)).toEqual([
      's_guest',
      's_login',
      's_admin',
      's_member',
    ])
    expect(applied(fixture(), moveViewStateOps(fixture(), 's_admin', 1)!).viewStates!.map((state) => state.id)).toEqual([
      's_login',
      's_guest',
      's_member',
      's_admin',
    ])
    expect(applied(fixture(), moveViewStateOps(fixture(), 's_member', 0)!).viewStates!.map((state) => state.id)).toEqual([
      's_login',
      's_member',
      's_admin',
      's_guest',
    ])
  })

  it.each<[string, string, number]>([
    ['없는 상태', 's_nope', 0],
    ['그대로', 's_admin', 0],
    ['형제 범위 밖', 's_admin', 2],
    ['음수', 's_admin', -1],
    ['정수 아님', 's_admin', 0.5],
  ])('순서 바꾸기 — %s 이면 null', (_label, id, to) => {
    expect(moveViewStateOps(fixture(), id, to)).toBeNull()
  })
})

describe('describeViewStateOps — 상태 설명', () => {
  it('없는 설명을 쓰면 칸을 더하고 · 있으면 바꾸고 · 앞뒤 공백을 걷는다 · 줄바꿈은 그대로', () => {
    const added = applied(fixture(), describeViewStateOps(fixture(), 's_admin', '  운영자만 보는 화면\n둘째 줄  ', null)!)
    expect(added.viewStates![1]).toEqual({ ...ADMIN, description: '운영자만 보는 화면\n둘째 줄' })
    const replaced = applied(added, describeViewStateOps(added, 's_admin', '바꾼 설명', '운영자만 보는 화면\n둘째 줄')!)
    expect(replaced.viewStates![1]).toEqual({ ...ADMIN, description: '바꾼 설명' })
    // 다른 상태는 그대로다.
    expect(replaced.viewStates!.filter((state) => state.id !== 's_admin')).toEqual([LOGIN, GUEST, MEMBER])
  })

  it('빈 글 · 공백뿐인 글은 칸을 지운다', () => {
    const added = applyOps(fixture(), describeViewStateOps(fixture(), 's_guest', '손님 화면', null)!)
    for (const blank of ['', ' \n ', '\u200b']) {
      const ops = describeViewStateOps(added, 's_guest', blank, '손님 화면')!
      expect(ops.some((op) => op.op === 'remove' && op.path === '/viewStates/2/description')).toBe(true)
      expect(applied(added, ops).viewStates![2]).toEqual(GUEST)
    }
  })

  it('있는 자리를 고치므로 그 자리의 id 를 test 로 싣는다 — 남이 순서를 바꿨으면 묶음째 실패한다', () => {
    const ops = describeViewStateOps(fixture(), 's_admin', '운영자', null)!
    expect(ops[0]).toEqual({ op: 'test', path: '/viewStates/1/id', value: 's_admin' })
    const moved = applyOps(fixture(), moveViewStateOps(fixture(), 's_admin', 1)!)
    expect(() => applyOps(moved, ops)).toThrow()
  })

  it.each([
    ['없는 상태', 's_nope', '설명'],
    ['없는 설명을 비움', 's_guest', '  '],
    ['상한 + 1', 's_guest', '가'.repeat(VIEW_STATE_DESCRIPTION_MAX + 1)],
    ['짝 없는 서로게이트', 's_guest', '앞\ud800뒤'],
  ])('%s 이면 null', (_label, id, text) => {
    expect(describeViewStateOps(fixture(), id, text, null)).toBeNull()
  })

  it('글이 바탕 그대로면 null — 앞뒤 공백만 다른 글도 같다', () => {
    const added = applyOps(fixture(), describeViewStateOps(fixture(), 's_guest', '손님 화면', null)!)
    expect(describeViewStateOps(added, 's_guest', ' 손님 화면 \n', '손님 화면')).toBeNull()
  })

  // RV-PI H3 — 남이 그 사이 같은 상태의 설명을 쓰면 묶음째 실패한다(조용히 덮지 않는다).
  it('바탕이 있으면 그 설명을 test 로 싣는다 — 남이 바꿨거나 지웠으면 묶음째 실패한다', () => {
    const added = applyOps(fixture(), describeViewStateOps(fixture(), 's_guest', '처음 설명', null)!)
    for (const ops of [
      describeViewStateOps(added, 's_guest', '내 설명', '처음 설명')!,
      describeViewStateOps(added, 's_guest', '', '처음 설명')!,
    ]) {
      expect(ops).toContainEqual({ op: 'test', path: '/viewStates/2/description', value: '처음 설명' })
      const theirs = applyOps(added, [{ op: 'replace', path: '/viewStates/2/description', value: '남의 설명' }])
      expect(() => applyOps(theirs, ops)).toThrow()
      const cleared = applyOps(added, [{ op: 'remove', path: '/viewStates/2/description' }])
      expect(() => applyOps(cleared, ops)).toThrow()
      // 남이 안 건드렸으면 선다.
      expect(() => applyOps(added, ops)).not.toThrow()
    }
  })

  it('바탕이 «없음»이면 설명을 뺀 항목째를 test 로 싣는다 — 남이 칸을 만들었으면 묶음째 실패한다', () => {
    const ops = describeViewStateOps(fixture(), 's_guest', '내 설명', null)!
    expect(ops).toContainEqual({ op: 'test', path: '/viewStates/2', value: GUEST })
    const theirs = applyOps(fixture(), [{ op: 'add', path: '/viewStates/2/description', value: '남의 설명' }])
    expect(() => applyOps(theirs, ops)).toThrow()
    expect(applied(fixture(), ops).viewStates![2]).toEqual({ ...GUEST, description: '내 설명' })
  })

  it('지금 문서의 설명이 바탕과 달라도 바탕으로 짓는다 — 그 문서에서는 적용이 실패한다(부르는 쪽이 먼저 견준다)', () => {
    const theirs = applyOps(fixture(), [{ op: 'add', path: '/viewStates/2/description', value: '남의 설명' }])
    const ops = describeViewStateOps(theirs, 's_guest', '내 설명', null)!
    expect(ops).toContainEqual({ op: 'test', path: '/viewStates/2', value: GUEST })
    expect(() => applyOps(theirs, ops)).toThrow()
  })

  it('다듬기 — 상한까지는 그대로 · 넘으면 null · 보이는 글자가 없으면 빈 글', () => {
    expect(tidyViewStateDescription(' 가 ')).toBe('가')
    expect(tidyViewStateDescription('가'.repeat(VIEW_STATE_DESCRIPTION_MAX))).toBe('가'.repeat(VIEW_STATE_DESCRIPTION_MAX))
    expect(tidyViewStateDescription('가'.repeat(VIEW_STATE_DESCRIPTION_MAX + 1))).toBeNull()
    expect(tidyViewStateDescription('\u200b \n')).toBe('')
  })
})

describe('removeViewStateOps — 상태 삭제(Review Focus 4)', () => {
  /** 적용 전후의 차 — 사라진 노드 · 보임이 걷힌 노드 · 보임이 줄어든 노드. 함수가 말한 집합과 견줄 오라클. */
  function changed(before: PageDocument, after: PageDocument) {
    const left = new Map([...walkNodes(after.root)].map(({ node }) => [node.id, node]))
    const removed: string[] = []
    const cleared: string[] = []
    const trimmed: string[] = []
    for (const { node } of walkNodes(before.root)) {
      const now = left.get(node.id)
      if (now === undefined) removed.push(node.id)
      else if (node.visibility !== undefined && now.visibility === undefined) cleared.push(node.id)
      else if (JSON.stringify(node.visibility) !== JSON.stringify(now.visibility)) trimmed.push(node.id)
    }
    return { removed: removed.sort(), cleared: cleared.sort(), trimmed: trimmed.sort() }
  }
  const told = (result: { removedNodeIds: string[]; clearedNodeIds: string[]; trimmedNodeIds: string[] }) => ({
    removed: [...result.removedNodeIds].sort(),
    cleared: [...result.clearedNodeIds].sort(),
    trimmed: [...result.trimmedNodeIds].sort(),
  })

  it('하위 상태째 — only 가 비면 노드를 지우고 · except 가 비면 보임을 걷고 · 남으면 줄인다 · 말한 집합 = 바뀐 집합', () => {
    const before = fixture()
    const result = removeViewStateOps(before, 's_login')!
    const after = applied(before, result.ops)
    expect(result.removedStateIds).toEqual(['s_login', 's_admin', 's_member'])
    expect(after.viewStates).toEqual([GUEST])
    expect(told(result)).toEqual(changed(before, after))
    expect(told(result)).toEqual({
      removed: ['n_a', 'n_b', 'n_box', 'n_in', 'n_in2'],
      cleared: ['n_d'],
      trimmed: ['n_c', 'n_e'],
    })
    expect(findNode(after.root, 'n_c')!.visibility).toEqual({ mode: 'only', states: ['s_guest'] })
    expect(findNode(after.root, 'n_e')!.visibility).toEqual({ mode: 'except', states: ['s_guest'] })
  })

  it('잎 상태 — 그 상태만 · 부모는 남는다', () => {
    const before = fixture()
    const result = removeViewStateOps(before, 's_admin')!
    const after = applied(before, result.ops)
    expect(result.removedStateIds).toEqual(['s_admin'])
    expect(after.viewStates).toEqual([LOGIN, GUEST, MEMBER])
    expect(told(result)).toEqual(changed(before, after))
    expect(told(result)).toEqual({ removed: ['n_b'], cleared: ['n_d'], trimmed: ['n_c'] })
  })

  it('아무 보임도 안 가리키는 상태는 목록에서만 뺀다', () => {
    const before = fixture()
    before.viewStates!.push({ id: 's_free', name: '자유' })
    const result = removeViewStateOps(before, 's_free')!
    expect(result).toMatchObject({ removedStateIds: ['s_free'], removedNodeIds: [], clearedNodeIds: [], trimmedNodeIds: [] })
    expect(applied(before, result.ops).viewStates).toEqual(fixture().viewStates)
  })

  it('없는 상태면 null', () => {
    expect(removeViewStateOps(fixture(), 's_nope')).toBeNull()
  })

  it('지우거나 고칠 노드가 남에게 잠겼으면 묶음째 막힌다 · 무관한 노드의 잠금은 막지 않는다', () => {
    const before = fixture()
    const { ops } = removeViewStateOps(before, 's_admin')!
    const lock = (nodeId: string) => [{ nodeId, userId: 'u_other', userName: '다혜' }]
    expect(lockConflictOfOps({ document: before, locks: lock('n_b'), ops, viewerUserId: 'u_me' })?.nodeId).toBe('n_b')
    expect(lockConflictOfOps({ document: before, locks: lock('n_c'), ops, viewerUserId: 'u_me' })?.nodeId).toBe('n_c')
    expect(lockConflictOfOps({ document: before, locks: lock('n_d'), ops, viewerUserId: 'u_me' })?.nodeId).toBe('n_d')
    expect(lockConflictOfOps({ document: before, locks: lock('n_head'), ops, viewerUserId: 'u_me' })).toBeNull()
    expect(lockConflictOfOps({ document: before, locks: lock('n_a'), ops, viewerUserId: 'u_me' })).toBeNull()
  })

  it('무작위 문서 — 상태마다 지운 뒤 검증 오류 0 · 역연산 왕복 · 말한 집합 = 바뀐 집합', () => {
    let seed = 7
    const random = (): number => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
    const STATES: ViewState[] = [
      { id: 's_1', name: '하나' },
      { id: 's_2', name: '둘', parent: 's_1' },
      { id: 's_3', name: '셋' },
      { id: 's_4', name: '넷', parent: 's_2' },
    ]
    const POOL = ['default', ...STATES.map((state) => state.id)]
    let boards = 0
    let removedNested = 0
    let cleared = 0
    let trimmed = 0
    for (let round = 0; round < 300; round += 1) {
      let next = 0
      const id = (): string => `n_${round}_${(next += 1)}`
      const visibility = (): NodeVisibility | undefined => {
        if (random() < 0.4) return undefined
        const states = POOL.filter(() => random() < 0.35)
        return states.length === 0 ? undefined : { mode: random() < 0.5 ? 'only' : 'except', states }
      }
      const grow = (depth: number): WbNode[] =>
        Array.from({ length: 1 + Math.floor(random() * 3) }, () => {
          const v = visibility()
          return depth < 3 && random() < 0.4
            ? { id: id(), type: 'Card', ...(v === undefined ? {} : { visibility: v }), children: grow(depth + 1) }
            : text(id(), v)
        })
      const before: PageDocument = { version: 2, viewStates: STATES, root: { id: 'n_root', type: 'Page', children: grow(0) } }
      expect(partitionIssues(validatePage(before)).errors).toEqual([])
      for (const state of STATES) {
        const result = removeViewStateOps(before, state.id)!
        const after = applied(before, result.ops)
        expect(told(result)).toEqual(changed(before, after))
        expect(collectNodeIds(after.root).some((nodeId) => result.removedNodeIds.includes(nodeId))).toBe(false)
        boards += 1
        // 지운 노드 안에 보임이 걸린 노드가 든 판(경로가 함께 사라지는 판).
        if (result.removedNodeIds.some((nodeId) => findNode(before.root, nodeId)?.children?.some((child) => child.visibility)))
          removedNested += 1
        if (result.clearedNodeIds.length > 0) cleared += 1
        if (result.trimmedNodeIds.length > 0) trimmed += 1
      }
    }
    // 카나리아 — 판 수 · 세 갈래가 실제로 선 판의 하한.
    expect(boards).toBe(1200)
    expect(removedNested).toBeGreaterThan(50)
    expect(cleared).toBeGreaterThan(200)
    expect(trimmed).toBeGreaterThan(200)
  })
})
