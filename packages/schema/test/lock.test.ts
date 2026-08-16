/**
 * 소프트 잠금의 **판정 한 벌**(설계 §7.2 · P3-3 D7).
 *
 * §7.2는 방어를 둘로 나눴다 — 화면이 선택을 막는 1차와 서버가 patch를 거절하는 2차.
 * **판정이 두 벌이면 갈린다:** 화면이 막지 않는 것을 서버가 거절하면 사용자는 눌렀는데
 * 아무 일도 안 나는 것을 보고, 반대면 잠금이 뚫린다. 그래서 *"이 자리가 남의 잠금 안인가"*를
 * 정하는 것은 `findLockConflict` 하나이고, 화면과 서버가 **그것을 부른다.**
 *
 * **이 파일이 그 함수를 문서 없이 잰다.** 서버와 화면이 각자 그것을 부르는지는
 * `apps/api/test/lock-census.test.ts`(서버)와 `apps/web/test/lock/one-verdict.test.ts`(양쪽을
 * 소스에서 센다)가 잰다.
 */
import { describe, expect, it } from 'vitest'
import { findLockConflict, lockPointers, type NodeLock } from '../src/lock'
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

  it('잠긴 노드의 자손을 건드리면 충돌이다 — §7.2가 잠그는 것은 서브트리다', () => {
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

describe('소유자는 사람이다 — 자기 잠금에 막히지 않는다 (D3)', () => {
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

describe('선택도 같은 함수로 묻는다 — 1차 방어와 2차 방어가 한 벌이다 (D7)', () => {
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

describe('lockPointers — ops가 건드리는 자리 전부', () => {
  it('경로 하나짜리 연산은 그 경로다', () => {
    expect(
      lockPointers([
        { op: 'add', path: '/root/children/-', value: null },
        { op: 'remove', path: '/root/children/0' },
        { op: 'replace', path: '/root/children/1/props/x', value: 1 },
      ]),
    ).toEqual(['/root/children/-', '/root/children/0', '/root/children/1/props/x'])
  })

  it('`move`는 둘을 낸다 — 뽑는 자리도 꽂는 자리도 남의 잠금 안일 수 있다', () => {
    expect(lockPointers([{ op: 'move', from: '/root/children/1/children/0', path: '/root/children/0/children/-' }])).toEqual([
      '/root/children/1/children/0',
      '/root/children/0/children/-',
    ])
  })

  it('뽑는 자리만 잠금 안이어도 충돌이다', () => {
    const ops = lockPointers([{ op: 'move', from: '/root/children/1/children/0', path: '/root/children/0/children/-' }])
    expect(conflict(ops)).toEqual(BORA)
  })

  it('꽂는 자리만 잠금 안이어도 충돌이다', () => {
    const ops = lockPointers([{ op: 'move', from: '/root/children/0/children/0', path: '/root/children/1/children/-' }])
    expect(conflict(ops)).toEqual(BORA)
  })

  it('빈 ops는 아무 자리도 안 낸다', () => {
    expect(lockPointers([])).toEqual([])
  })
})
