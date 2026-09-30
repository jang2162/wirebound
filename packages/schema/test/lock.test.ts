/**
 * 소프트 잠금의 **판정 한 벌**(설계서 「소프트 잠금」).
 *
 * 「소프트 잠금」은 방어를 둘로 나눴다 — 화면이 선택을 막는 1차와 서버가 patch를 거절하는 2차.
 * **판정이 두 벌이면 갈린다:** 화면이 막지 않는 것을 서버가 거절하면 사용자는 눌렀는데
 * 아무 일도 안 나는 것을 보고, 반대면 잠금이 뚫린다. 그래서 *"이 자리가 남의 잠금 안인가"*를
 * 정하는 것은 `findLockConflict` 하나이고, 화면과 서버가 **그것을 부른다.**
 *
 * **이 파일이 그 함수를 문서 없이 잰다.** 서버와 화면이 각자 그것을 부르는지는
 * `apps/api/test/lock-census.test.ts`(서버)와 `apps/web/test/lock/one-verdict.test.ts`(양쪽을
 * 소스에서 센다)가 잰다.
 */
import { describe, expect, it } from 'vitest'
import { findLockConflict, lockConflictOfOps, locksAgainst, type NodeLock } from '../src/lock'
import type { PatchOp } from '../src/patch/types'
import { findNodePath } from '../src/tree'
import type { WbNode } from '../src/node'

/**
 * ```
 * n_root
 *   n_a      n_a1
 *   n_b      n_b1  n_b2
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

function conflict(pointers: string[], locks: readonly NodeLock[] = [BORA], viewerUserId = ME): NodeLock | null {
  return findLockConflict({ root, locks, pointers, viewerUserId })
}

/** 노드 하나를 고르는 것 — 화면의 1차 방어가 묻는 것이 이 모양이다. */
function selecting(nodeId: string): string[] {
  const path = findNodePath(root, nodeId)
  return path === undefined ? [] : [path]
}

describe('잠긴 서브트리 안인가 — 경로 하나로 판정한다', () => {
  it('잠긴 노드 자신을 건드리면 충돌이다', () => {
    expect(conflict(['/root/children/1/props/title'])).toEqual(BORA)
  })

  it('잠긴 노드의 자손을 건드리면 충돌이다 — 소프트 잠금이 잠그는 것은 서브트리다', () => {
    expect(conflict(['/root/children/1/children/0/props/text'])).toEqual(BORA)
    expect(conflict(['/root/children/1/children/-'])).toEqual(BORA)
  })

  it('잠긴 노드 자신을 지우는 것도 충돌이다', () => {
    expect(conflict(['/root/children/1'])).toEqual(BORA)
  })

  it('잠긴 노드의 **조상**을 갈아 끼우는 것도 충돌이다 — 그것이 잠긴 것을 없앤다', () => {
    // `PUT .../schema`가 내는 ops가 정확히 이 모양이다(`routes/pages.ts`).
    expect(conflict(['/root'])).toEqual(BORA)
  })

  it('남의 서브트리는 충돌이 아니다', () => {
    expect(conflict(['/root/children/0/props/title'])).toBeNull()
    expect(conflict(['/root/children/2/children/-'])).toBeNull()
  })

  it('루트에 형제를 더하는 것은 충돌이 아니다 — 잠긴 서브트리의 안이 아니다', () => {
    expect(conflict(['/root/children/-'])).toBeNull()
  })

  it('`/version`은 어느 잠금과도 부딪치지 않는다', () => {
    expect(conflict(['/version'])).toBeNull()
  })

  it('세그먼트 경계를 지킨다 — `children/10`은 `children/1`의 안이 아니다', () => {
    // 문자열 접두사로 재면 여기서 틀린다: `'/root/children/10'.startsWith('/root/children/1')`이
    // 참이다. 열 번째 형제를 고친 사람이 **두 번째 형제의 잠금에** 막힌다.
    expect(conflict(['/root/children/10/props/title'])).toBeNull()
  })

  it('읽을 수 없는 포인터는 아무것도 막지 않는다 — 그 편집은 파이프라인이 거절한다', () => {
    // `parsePointer`가 막는 토큰이다(`patch/pointer.ts`). 같은 파서가 `applyOps`에도 서 있으므로
    // 이 편집은 어차피 `patch-failed`가 된다 — 여기서 던져 500을 내지 않는 것이 요점이다.
    expect(conflict(['/root/__proto__/x'])).toBeNull()
    expect(conflict(['상대경로'])).toBeNull()
  })
})

describe('소유자는 사람이다 — 자기 잠금에 막히지 않는다', () => {
  it('같은 사용자의 잠금은 충돌이 아니다 — 같은 사람의 다른 탭이 여기 온다', () => {
    const mine: NodeLock = { nodeId: 'n_b', userId: ME, userName: '나' }
    expect(conflict(['/root/children/1/props/title'], [mine])).toBeNull()
  })

  it('남의 잠금과 내 잠금이 함께 있으면 남의 것만 낸다', () => {
    const mine: NodeLock = { nodeId: 'n_a', userId: ME, userName: '나' }
    expect(conflict(['/root/children/0/props/title'], [mine, BORA])).toBeNull()
    expect(conflict(['/root/children/1/props/title'], [mine, BORA])).toEqual(BORA)
  })

  it('부딪친 잠금을 그대로 낸다 — 배지가 이름을 그린다', () => {
    const found = conflict(['/root/children/1/props/title'])
    expect(found?.userName).toBe('보라')
  })
})

describe('문서에 없는 잠금', () => {
  it('가리키는 노드가 문서에 없으면 아무것도 막지 못한다', () => {
    const ghost: NodeLock = { nodeId: 'n_gone', userId: 'u_bora', userName: '보라' }
    expect(conflict(['/root/children/1/props/title'], [ghost])).toBeNull()
    expect(conflict(['/root'], [ghost])).toBeNull()
  })
})

describe('선택도 같은 함수로 묻는다 — 1차 방어와 2차 방어가 한 벌이다', () => {
  it('잠긴 노드를 고르는 것은 충돌이다', () => {
    expect(conflict(selecting('n_b'))).toEqual(BORA)
  })

  it('잠긴 노드의 자손을 고르는 것도 충돌이다', () => {
    expect(conflict(selecting('n_b1'))).toEqual(BORA)
  })

  it('잠긴 노드를 **품는** 노드를 고르는 것도 충돌이다 — 그 선택이 잠긴 것을 함께 잡는다', () => {
    expect(conflict(selecting('n_root'))).toEqual(BORA)
  })

  it('남의 서브트리 밖을 고르는 것은 막히지 않는다', () => {
    expect(conflict(selecting('n_a'))).toBeNull()
    expect(conflict(selecting('n_a1'))).toBeNull()
    expect(conflict(selecting('n_c'))).toBeNull()
  })

  it('문서에 없는 노드를 고르는 것은 막을 것이 없다', () => {
    expect(selecting('n_gone')).toEqual([])
    expect(conflict(selecting('n_gone'))).toBeNull()
  })
})

/** 편집이 부딪치는 잠금 — 서버의 2차 방어와 화면의 편집 물음이 부르는 그것(`lockConflictOfOps`). */
function editConflict(ops: PatchOp[], locks: readonly NodeLock[] = [BORA]): NodeLock | null {
  return lockConflictOfOps({ document: { root }, locks, ops, viewerUserId: ME })
}

describe('lockConflictOfOps — 편집이 건드리는 자리 전부', () => {
  it('경로 하나짜리 연산은 그 경로로 잰다', () => {
    expect(editConflict([{ op: 'replace', path: '/root/children/1/props', value: {} }])).toEqual(BORA)
    expect(editConflict([{ op: 'remove', path: '/root/children/1/children/0' }])).toEqual(BORA)
    expect(editConflict([{ op: 'add', path: '/root/children/1/children/-', value: { id: 'n_x', type: 'Text', props: {} } }])).toEqual(BORA)
    expect(editConflict([{ op: 'replace', path: '/root/children/0/props', value: {} }])).toBeNull()
  })

  it('`move`는 둘을 잰다 — 뽑는 자리만 잠금 안이어도 충돌이다', () => {
    expect(editConflict([{ op: 'move', from: '/root/children/1/children/0', path: '/root/children/0/children/-' }])).toEqual(BORA)
  })

  it('꽂는 자리만 잠금 안이어도 충돌이다', () => {
    expect(editConflict([{ op: 'move', from: '/root/children/0/children/0', path: '/root/children/1/children/-' }])).toEqual(BORA)
  })

  it('빈 ops · 남의 잠금이 없으면 아무것도 막지 않는다', () => {
    expect(editConflict([])).toBeNull()
    expect(editConflict([{ op: 'remove', path: '/root/children/1' }], [{ ...BORA, userId: ME }])).toBeNull()
  })

  it('입력 문서를 바꾸지 않는다', () => {
    const before = JSON.stringify(root)
    editConflict([
      { op: 'remove', path: '/root/children/0' },
      { op: 'move', from: '/root/children/1', path: '/root/children/0/children/-' },
    ])
    expect(JSON.stringify(root)).toBe(before)
  })
})

describe('1차 방어가 통과시킨 것을 2차 방어가 뒤집지 않는다', () => {
  /**
   * 「소프트 잠금」이 나눈 둘이 **같은 함수**를 쓰므로 성립하는 성질이다.
   *
   * **한 방향만 참이다.** *"고를 수 있으면 그 안의 편집도 지나간다"*는 참이고,
   * 그 역은 거짓이다: **선택이 편집보다 엄격하다.** 선택은 그 서브트리를 통째로 claim하는
   * 것이라 남의 잠금을 **품기만 해도** 부딪치는데, 편집은 자기가 건드리는 자리만 본다.
   * 그래서 *"못 고르는 노드"* 안에도 아무의 잠금과도 안 겹치는 편집이 있다 — 아래
   * `선택이 편집보다 엄격하다`가 그 자리를 이름과 함께 고정한다.
   *
   * **위험한 방향은 그 반대쪽이다:** 고를 수 있는데 편집이 막히면 사용자는 눌러서 값을
   * 쳤는데 저장이 안 되고 **왜인지 화면에 없다.** 그쪽이 비어 있는 것이 이 표의 값이다.
   *
   * 표의 잠금은 **셋**이다(서로 다른 사람 · 서로 다른 깊이) — 하나면 *"어느 잠금과 부딪쳤나"*가
   * 언제나 그 하나라 고르는 코드가 없어도 통과한다.
   */
  const CROWD: NodeLock[] = [
    { nodeId: 'n_b', userId: 'u_bora', userName: '보라' },
    { nodeId: 'n_a1', userId: 'u_dahye', userName: '다혜' },
    { nodeId: 'n_mine', userId: ME, userName: '나' },
  ]

  /** 문서의 모든 노드. 표를 손으로 적으면 노드를 더할 때 낡는다. */
  const EVERY_NODE = ['n_root', 'n_a', 'n_a1', 'n_b', 'n_b1', 'n_b2', 'n_c']

  function canSelect(nodeId: string): boolean {
    const path = findNodePath(root, nodeId)
    return path !== undefined && findLockConflict({ root, locks: CROWD, pointers: [path], viewerUserId: ME }) === null
  }

  /** 그 서브트리 **안**을 건드리는 편집이 지나가는가. */
  function canEditInside(nodeId: string): boolean {
    const path = findNodePath(root, nodeId)
    if (path === undefined) return false
    // 모든 노드가 가진 키라 적용이 실패하지 않는다 — 적용이 실패하는 연산은 판정하지 않는다(`lockConflictOfOps`의 «판정하지 않는 것»).
    const ops: PatchOp[] = [{ op: 'replace', path: `${path}/type`, value: 'Section' }]
    return lockConflictOfOps({ document: { root }, locks: CROWD, ops, viewerUserId: ME }) === null
  }

  it('표가 두 갈래를 다 태운다 — 한쪽으로 쏠리면 아래가 공허해진다', () => {
    expect(EVERY_NODE.filter(canSelect).length).toBeGreaterThan(0)
    expect(EVERY_NODE.filter((nodeId) => !canSelect(nodeId)).length).toBeGreaterThan(0)
  })

  it('고를 수 있는 노드의 서브트리 안 편집은 하나도 안 막힌다', () => {
    const betrayed = EVERY_NODE.filter((nodeId) => canSelect(nodeId) && !canEditInside(nodeId))

    expect(betrayed).toEqual([])
  })

  it('선택이 편집보다 엄격하다 — 남의 잠금을 **품는** 노드가 그 자리다', () => {
    const stricter = EVERY_NODE.filter((nodeId) => !canSelect(nodeId) && canEditInside(nodeId))

    // `n_root`는 잠긴 `n_b`·`n_a1`을 품고 `n_a`는 잠긴 `n_a1`을 품는다. 둘 다 **고를 수는
    // 없지만**, 그 아래에 형제를 하나 더하는 편집은 아무의 잠긴 서브트리도 건드리지 않는다.
    //
    // **이것은 구멍이 아니라 대가다.** 화면에서 그 자리를 고칠 길이 없어진다(툴바도 우측
    // 패널도 — 속성·상호작용 탭까지 — 선택을 요구한다) — 남이 섹션 하나를 잡고 있는 동안
    // 아무도 페이지 루트를 못 고른다는 뜻이다.
    // 반대 설계(품는 것은 안 막는다)는 더 나쁘다: 누가 무심코 루트를 고르면 **모두가 멈춘다.**
    expect(stricter.sort()).toEqual(['n_a', 'n_root'])
  })

  it('내 잠금은 양쪽 다 안 막는다 — 소유자 판정도 한 벌이다', () => {
    // 문서에 없는 `n_mine`은 아무것도 막지 못하지만, 그 사실이 소유자 판정을 덮지 않게
    // **문서 안의 노드**로 다시 잰다.
    const mineOnRoot: NodeLock[] = [{ nodeId: 'n_c', userId: ME, userName: '나' }]
    const path = findNodePath(root, 'n_c')!

    expect(locksAgainst(mineOnRoot, ME)).toEqual([])
    expect(findLockConflict({ root, locks: mineOnRoot, pointers: [path], viewerUserId: ME })).toBeNull()
  })
})
