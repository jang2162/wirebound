// @vitest-environment node
/**
 * **남의 변경이 도착했을 때 스토어가 하는 일**(P3-1 D6). `editor-store.test.ts`와 같은
 * 이유로 DOM 없는 환경에서 돈다 — 이 판정에는 화면이 필요 없다.
 *
 * D6이 남긴 물음은 하나였다: *"내 낙관적 편집이 pending인 상태에서 남의 ops가 오면
 * 무엇을 하나."* §7.1의 답(*"자기 pending 위에 리베이스 적용"*)은 P3-2이고, 이 슬라이스의
 * 판정은 **미루고 말한다**이다. 아래가 그 판정을 갈래마다 고정한다.
 */
import { CURRENT_DOCUMENT_VERSION, type PageDocument, type PatchOp, type ValidationIssue } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { EditorStore } from '../../src/store/editor-store'

function doc(children: { id: string }[] = []): PageDocument {
  return {
    version: CURRENT_DOCUMENT_VERSION,
    root: { id: 'n_root', type: 'Container', children: children.map((c) => ({ id: c.id, type: 'Container' })) },
  }
}

const ADD_ONE: PatchOp[] = [{ op: 'add', path: '/root/children/-', value: { id: 'n_remote', type: 'Container' } }]

const NO_WARNINGS: ValidationIssue[] = []

function warning(nodeId: string): ValidationIssue {
  return { code: 'ignored-variant', severity: 'warning', nodeId, path: '/root', message: '버려집니다' }
}

/** 페이지 하나를 열어 둔 스토어. */
function opened(): EditorStore {
  const store = new EditorStore({ nextOpId: () => 'op_1' })
  store.loadPage('page_1', doc(), 4)
  return store
}

describe('applyRemoteChange — 얹는 갈래', () => {
  it('pending이 비어 있으면 얹고 headSeq를 올린다', () => {
    const store = opened()

    const result = store.applyRemoteChange('page_1', { seq: 5, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(result).toBe('applied')
    expect(store.getState().headSeq).toBe(5)
    expect(store.getState().document?.root.children?.map((node) => node.id)).toEqual(['n_remote'])
    expect(store.getState().remoteStale).toBeNull()
  })

  it('경고를 함께 갈아 끼운다 — 남이 만든 경고를 낸 사람만 보지 않는다', () => {
    const store = opened()

    store.applyRemoteChange('page_1', { seq: 5, ops: ADD_ONE, warnings: [warning('n_remote')] })

    expect(store.getState().editWarnings.map((issue) => issue.nodeId)).toEqual(['n_remote'])
  })

  it('경고가 없어졌으면 빈 배열이 되어 화면에서 사라진다', () => {
    const store = opened()
    store.applyRemoteChange('page_1', { seq: 5, ops: ADD_ONE, warnings: [warning('n_remote')] })

    store.applyRemoteChange('page_1', {
      seq: 6,
      ops: [{ op: 'remove', path: '/root/children/0' }],
      warnings: NO_WARNINGS,
    })

    expect(store.getState().editWarnings).toEqual([])
  })
})

describe('applyRemoteChange — 안 얹는 갈래', () => {
  it('다른 페이지의 변경은 건너뛴다 — headSeq도 안 건드린다', () => {
    const store = opened()

    const result = store.applyRemoteChange('page_2', { seq: 5, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(result).toBe('skipped')
    expect(store.getState().headSeq).toBe(4)
    expect(store.getState().remoteStale).toBeNull()
  })

  it('문서가 없으면 건너뛴다', () => {
    const store = new EditorStore()

    expect(store.applyRemoteChange('page_1', { seq: 5, ops: ADD_ONE, warnings: NO_WARNINGS })).toBe('skipped')
  })

  /**
   * **자기 편집이 되돌아온 경우다.** 연결 id 헤더를 안 싣는 클라이언트는 서버가 자기를
   * 제외하지 못해 자기 ops를 되받는다 — 그때 그것을 또 얹으면 문서가 두 번 바뀐다.
   */
  it('이미 아는 seq는 건너뛴다 — 두 번 얹지 않는다', () => {
    const store = opened()

    const result = store.applyRemoteChange('page_1', { seq: 4, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(result).toBe('skipped')
    expect(store.getState().document?.root.children ?? []).toEqual([])
  })

  it('보내지 않은 편집이 있으면 미루고 낡았다고 말한다 (D6)', () => {
    const store = opened()
    store.applyEdit([{ op: 'add', path: '/root/children/-', value: { id: 'n_mine', type: 'Container' } }])

    const result = store.applyRemoteChange('page_1', { seq: 5, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(result).toBe('deferred')
    expect(store.getState().remoteStale).toEqual({ reason: 'pending' })
    // **문서도 `headSeq`도 안 움직인다** — 둘 중 하나만 움직이면 조용히 갈라진다.
    expect(store.getState().headSeq).toBe(4)
    expect(store.getState().document?.root.children?.map((node) => node.id)).toEqual(['n_mine'])
  })

  it('얹을 수 없는 ops면 갈라졌다고 말한다', () => {
    const store = opened()

    const result = store.applyRemoteChange('page_1', {
      seq: 5,
      ops: [{ op: 'replace', path: '/root/children/9/type', value: 'Text' }],
      warnings: NO_WARNINGS,
    })

    expect(result).toBe('diverged')
    expect(store.getState().remoteStale).toEqual({ reason: 'diverged' })
    expect(store.getState().headSeq).toBe(4)
  })
})

/**
 * **리뷰가 뚫은 자리(B1).** 앞 판은 `seq > headSeq`이기만 하면 얹었다 — 그래서 프레임을
 * 하나라도 놓치면 문서가 **조용히** 갈라지고, `headSeq`가 서버와 같아져 그 뒤 편집이
 * `stale` 409조차 안 받았다. **재연결이 있는 이상 프레임 유실은 설계상 일어난다.**
 */
describe('applyRemoteChange — 프레임을 놓친 갈래 (B1)', () => {
  it('seq가 내 다음 번호가 아니면 얹지 않는다', () => {
    const store = opened()

    const result = store.applyRemoteChange('page_1', { seq: 6, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(result).toBe('gap')
    expect(store.getState().document?.root.children ?? []).toEqual([])
  })

  /**
   * **이것이 그 사고의 심장이다.** `headSeq`를 올리면 서버와 값이 같아져 다음 편집이
   * `stale` 409를 못 받고, **틀린 문서 위에서 만든 ops가 서버의 옳은 문서에 적용된다.**
   * 안 올리면 그 409가 살아 있고 복구 경로가 페이지를 다시 받는다.
   */
  it('headSeq를 안 올린다 — 다음 편집이 409를 받아 저절로 수렴한다', () => {
    const store = opened()

    store.applyRemoteChange('page_1', { seq: 6, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(store.getState().headSeq).toBe(4)
  })

  it('낡았다고 말한다 — 조용히 두지 않는다', () => {
    const store = opened()

    store.applyRemoteChange('page_1', { seq: 6, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(store.getState().remoteStale).toEqual({ reason: 'gap' })
  })

  /**
   * **`'gap'`과 `'diverged'`를 접지 않는다.** 둘 다 *"못 얹었다"*지만 원인이 정반대다 —
   * 못 받은 것이 있는 것과, 받은 것을 내 문서가 못 받아들이는 것.
   */
  it('갈라진 것과 놓친 것을 다른 이유로 말한다', () => {
    const missed = opened()
    const conflicted = opened()

    missed.applyRemoteChange('page_1', { seq: 6, ops: ADD_ONE, warnings: NO_WARNINGS })
    conflicted.applyRemoteChange('page_1', {
      seq: 5,
      ops: [{ op: 'replace', path: '/root/children/9/type', value: 'Text' }],
      warnings: NO_WARNINGS,
    })

    expect(missed.getState().remoteStale).toEqual({ reason: 'gap' })
    expect(conflicted.getState().remoteStale).toEqual({ reason: 'diverged' })
  })

  it('바로 다음 번호는 그대로 얹는다 — 음성 대조', () => {
    const store = opened()

    const result = store.applyRemoteChange('page_1', { seq: 5, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(result).toBe('applied')
    expect(store.getState().headSeq).toBe(5)
    expect(store.getState().remoteStale).toBeNull()
  })

  /**
   * **놓친 것이 뒤늦게 와도 소용없다** — 그때는 `seq <= headSeq`가 아니라 여전히 갭이다.
   * 갭 뒤에 이어지는 프레임을 얹어 버리면 **빠진 revision을 건너뛴 채 번호만 맞춰진다.**
   */
  it('갭 뒤에 이어지는 프레임도 안 얹는다 — 번호만 맞추지 않는다', () => {
    const store = opened()
    store.applyRemoteChange('page_1', { seq: 6, ops: ADD_ONE, warnings: NO_WARNINGS })

    const next = store.applyRemoteChange('page_1', { seq: 7, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(next).toBe('gap')
    expect(store.getState().headSeq).toBe(4)
    expect(store.getState().document?.root.children ?? []).toEqual([])
  })

  /**
   * **놓친 seq가 뒤늦게 도착하면 그것은 얹힌다.** 서버가 순서를 뒤바꿔 보낸 경우다 —
   * `headSeq + 1`이므로 갭이 아니고, 얹고 나면 낡음이 풀린다.
   *
   * **그리고 그 순간 조용해지는데 revision 하나는 여전히 없다**(델타 리뷰 O1). 앞 판의
   * 이월이 그 상태를 *"시끄럽다"*고 적었는데 **거짓이었다** — 이 케이스가 그것을 잰다.
   * 이월 §4.6이 이 케이스를 가리킨다.
   *
   * **해가 작은 이유도 함께 잰다:** 남은 문서가 서버 문서의 **온전한 앞부분**이고
   * `headSeq`가 그 문서에 대해 정직하므로, 편집을 내면 409가 나고 수렴한다.
   */
  it('놓쳤던 번호가 뒤늦게 오면 얹고 낡음을 푼다 — 그런데 하나는 여전히 없다', () => {
    const store = opened()
    store.applyRemoteChange('page_1', {
      seq: 6,
      ops: [{ op: 'add', path: '/root/children/-', value: { id: 'n_six', type: 'Container' } }],
      warnings: NO_WARNINGS,
    })

    const late = store.applyRemoteChange('page_1', {
      seq: 5,
      ops: [{ op: 'add', path: '/root/children/-', value: { id: 'n_five', type: 'Container' } }],
      warnings: NO_WARNINGS,
    })

    expect(late).toBe('applied')
    expect(store.getState().headSeq).toBe(5)
    // **조용해진다** — 화면은 더 이상 아무 말도 안 한다.
    expect(store.getState().remoteStale).toBeNull()
    // **그런데 seq 6이 없다.** 서버 문서는 ['n_five','n_six']이고 내 것은 앞부분뿐이다.
    expect(store.getState().document?.root.children?.map((node) => node.id)).toEqual(['n_five'])
  })

  /**
   * **pending이 먼저다.** 갭이면서 pending도 있으면 `'pending'`이 더 좁고 정확한 진단이다 —
   * 내가 낸 편집이 끝나면 409가 나고 복구가 돈다.
   */
  it('pending이 있으면 갭이어도 pending으로 말한다', () => {
    const store = opened()
    store.applyEdit([{ op: 'add', path: '/root/children/-', value: { id: 'n_mine', type: 'Container' } }])

    const result = store.applyRemoteChange('page_1', { seq: 9, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(result).toBe('deferred')
    expect(store.getState().remoteStale).toEqual({ reason: 'pending' })
  })
})

/**
 * **약한 진단이 센 진단을 덮지 않는다**(델타 리뷰 O3). 앞 판은 `#markStale`이 같은 이유일
 * 때만 건너뛰었고 이유 사이에 순위가 없었다 — 그래서 복원 뒤 첫 편집 프레임이
 * `'restored'`를 `'gap'`으로 덮어 **끊긴 적이 없는데 끊겼다고 말했다.**
 */
describe('낡음 이유에는 세기가 있다 (O3)', () => {
  it('복원 뒤 첫 편집 프레임이 복원 진단을 덮지 않는다', () => {
    const store = opened()
    store.markRestored()

    // 복원이 `head_seq`를 밀어 올렸으므로 이 `seq`는 내 `headSeq + 1`이 아니다 — 갭이다.
    const result = store.applyRemoteChange('page_1', { seq: 9, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(result).toBe('gap')
    expect(store.getState().remoteStale).toEqual({ reason: 'restored' })
  })

  /**
   * **음성 대조.** 복원이 안 서 있으면 같은 프레임이 `'gap'`을 세운다 — 위 케이스가
   * *"갭이 원래 안 선다"*로 통과하지 않는다.
   */
  it('복원이 안 서 있으면 같은 프레임이 갭을 세운다 — 음성 대조', () => {
    const store = opened()

    store.applyRemoteChange('page_1', { seq: 9, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(store.getState().remoteStale).toEqual({ reason: 'gap' })
  })

  /**
   * **경계는 *"할 일이 있다"*와 *"할 일이 없다"* 사이다.** `'pending'`만 기다리라고 말하고
   * 나머지 셋은 새로고침을 말한다. 약한 쪽이 덮으면 화면이 요구를 거둬들인다.
   */
  it('미룸이 갭을 덮지 않는다 — 화면이 새로고침 요구를 거둬들이지 않는다', () => {
    const store = opened()
    store.applyRemoteChange('page_1', { seq: 9, ops: ADD_ONE, warnings: NO_WARNINGS })
    expect(store.getState().remoteStale).toEqual({ reason: 'gap' })

    store.applyEdit([{ op: 'add', path: '/root/children/-', value: { id: 'n_mine', type: 'Container' } }])
    const result = store.applyRemoteChange('page_1', { seq: 10, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(result).toBe('deferred')
    expect(store.getState().remoteStale).toEqual({ reason: 'gap' })
  })

  it('갈라짐은 갭을 덮는다 — 더 좁고 구체적인 실패다', () => {
    const store = opened()
    store.applyRemoteChange('page_1', { seq: 9, ops: ADD_ONE, warnings: NO_WARNINGS })

    store.applyRemoteChange('page_1', {
      seq: 5,
      ops: [{ op: 'replace', path: '/root/children/9/type', value: 'Text' }],
      warnings: NO_WARNINGS,
    })

    expect(store.getState().remoteStale).toEqual({ reason: 'diverged' })
  })

  it('복원은 무엇이든 덮는다 — 판이 통째로 갈린 것이 가장 넓다', () => {
    const store = opened()
    store.applyRemoteChange('page_1', {
      seq: 5,
      ops: [{ op: 'replace', path: '/root/children/9/type', value: 'Text' }],
      warnings: NO_WARNINGS,
    })
    expect(store.getState().remoteStale).toEqual({ reason: 'diverged' })

    store.markRestored()

    expect(store.getState().remoteStale).toEqual({ reason: 'restored' })
  })

  /**
   * **복원은 얹었다고 풀리지 않는다.** 복원은 프로젝트 사건이라 이 페이지의 프레임 하나를
   * 잘 얹은 것이 그것을 해결하지 않는다 — 다섯 자원이 한꺼번에 갈렸다.
   */
  it('복원 뒤 프레임을 잘 얹어도 복원 진단이 남는다', () => {
    const store = opened()
    store.markRestored()

    const result = store.applyRemoteChange('page_1', { seq: 5, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(result).toBe('applied')
    expect(store.getState().headSeq).toBe(5)
    expect(store.getState().remoteStale).toEqual({ reason: 'restored' })
  })

  it('복원이 아닌 낡음은 얹으면 풀린다 — 음성 대조', () => {
    const store = opened()
    store.applyRemoteChange('page_1', { seq: 9, ops: ADD_ONE, warnings: NO_WARNINGS })

    store.applyRemoteChange('page_1', { seq: 5, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(store.getState().remoteStale).toBeNull()
  })

  it('같은 이유가 이어지면 구독자를 다시 부르지 않는다 — 세기 비교가 그것도 한다', () => {
    const store = opened()
    store.applyRemoteChange('page_1', { seq: 9, ops: ADD_ONE, warnings: NO_WARNINGS })
    let notified = 0
    store.subscribe(() => {
      notified += 1
    })

    store.applyRemoteChange('page_1', { seq: 11, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(notified).toBe(0)
  })
})

describe('낡음은 풀린다', () => {
  it('페이지를 다시 받으면 풀린다 — 새로고침한 뒤에도 남지 않는다', () => {
    const store = opened()
    store.markRestored()
    expect(store.getState().remoteStale).not.toBeNull()

    store.loadPage('page_1', doc(), 9)

    expect(store.getState().remoteStale).toBeNull()
  })

  it('미룬 뒤 pending이 비고 다음 변경이 오면 그때 얹히며 풀린다', () => {
    const store = opened()
    const opId = store.applyEdit([
      { op: 'add', path: '/root/children/-', value: { id: 'n_mine', type: 'Container' } },
    ])
    store.applyRemoteChange('page_1', { seq: 5, ops: ADD_ONE, warnings: NO_WARNINGS })
    expect(store.getState().remoteStale).toEqual({ reason: 'pending' })

    store.ackEdit(opId!, { seq: 5, revisionId: 'rev_1', inverse: [] })
    const result = store.applyRemoteChange('page_1', { seq: 6, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(result).toBe('applied')
    expect(store.getState().remoteStale).toBeNull()
  })

  it('페이지를 닫으면 풀린다', () => {
    const store = opened()
    store.markRestored()

    store.clearPage()

    expect(store.getState().remoteStale).toBeNull()
  })
})

describe('markRestored', () => {
  it('판이 갈렸다고 말한다 — 얹을 ops가 없다', () => {
    const store = opened()

    store.markRestored()

    expect(store.getState().remoteStale).toEqual({ reason: 'restored' })
    expect(store.getState().headSeq).toBe(4)
  })

  it('같은 이유가 이어지면 구독자를 다시 부르지 않는다', () => {
    const store = opened()
    let notified = 0
    store.subscribe(() => {
      notified += 1
    })

    store.markRestored()
    const afterFirst = notified
    store.markRestored()

    expect(notified).toBe(afterFirst)
  })
})
