// @vitest-environment node
/**
 * **남의 변경이 도착했을 때 스토어가 하는 일**(§7.1의 *"[타인] ops 수신 → 자기 pending 위에
 * 리베이스 적용"*). `editor-store.test.ts`와 같은 이유로 DOM 없는 환경에서 돈다 — 이 판정에는
 * 화면이 필요 없다.
 *
 * **P3-1의 답은 *"미루고 말한다"*였고 P3-2가 그것을 리베이스로 갈아 끼웠다**(D3). 그래서
 * `'deferred'` 갈래의 케이스들이 죽었다 — **지우지 않고 명제를 바꿨다.** 무엇이 어떻게
 * 바뀌었는지는 각 판의 머리말에 적는다.
 *
 * # 하나짜리로 재지 않는다 (D7의 첫 자리)
 *
 * **리베이스는 pending이 여럿이고 남의 ops도 여럿일 때만 뜻이 있다.** 하나씩이면 순서를
 * 잃어도 결과가 같아 *"자리 0"*이 된다 — 낙관 문서 위에 그냥 얹는 구현도 통과한다. 아래
 * 리베이스 판은 **pending 둘 × 남의 ops 둘**이고, 그 넷의 **순서**를 단언한다.
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

/** 배열 끝에 노드 하나를 더하는 편집. **`-`이므로 순서가 곧 결과다.** */
function append(id: string): PatchOp[] {
  return [{ op: 'add', path: '/root/children/-', value: { id, type: 'Container' } }]
}

const ADD_ONE = append('n_remote')

const NO_WARNINGS: ValidationIssue[] = []

function warning(nodeId: string): ValidationIssue {
  return { code: 'ignored-variant', severity: 'warning', nodeId, path: '/root', message: '버려집니다' }
}

/** 페이지 하나를 열어 둔 스토어. */
function opened(): EditorStore {
  const store = new EditorStore({ nextOpId: (() => {
    let issued = 0
    return () => {
      issued += 1
      return `op_${issued}`
    }
  })() })
  store.loadPage('page_1', doc(), 4)
  return store
}

/** 지금 문서의 자식 id 순서. 이 파일의 단언 대부분이 이 값이다. */
function ids(store: EditorStore): string[] {
  return store.getState().document?.root.children?.map((node) => node.id) ?? []
}

describe('applyRemoteChange — 얹는 갈래', () => {
  it('pending이 비어 있으면 얹고 headSeq를 올린다', () => {
    const store = opened()

    const change = store.applyRemoteChange('page_1', { seq: 5, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(change.result).toBe('applied')
    expect(store.getState().headSeq).toBe(5)
    expect(ids(store)).toEqual(['n_remote'])
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

/**
 * **P3-1의 `'deferred'` 케이스들이 있던 자리다.** 그때의 명제는 *"보내지 않은 편집이 있으면
 * 미루고 낡았다고 말한다"*였고, 지금의 명제는 *"남의 것을 바탕에 얹고 내 것을 그 위에 다시
 * 올린다"*이다(§7.1 · D3).
 */
describe('applyRemoteChange — 리베이스 (D3)', () => {
  /**
   * **이 판이 이 슬라이스의 중심이다.** 넷의 순서가 서버와 같아야 한다 — 서버는 남의 것을
   * **먼저** 기록하고 내 pending을 그 위에 적용하므로, 결과는 `[남1, 남2, 내1, 내2]`다.
   *
   * **낙관 문서 위에 그냥 얹으면 `[내1, 내2, 남1, 남2]`가 된다** — 둘 다 배열 끝에 더하므로
   * 던지지도 않고, 그 갈라짐은 **조용하다.** pending이나 남의 ops가 하나뿐이면 이 두 결과가
   * 구분되지 않는다.
   */
  it('남의 것을 바탕에 얹고 내 pending을 그 위에 다시 올린다 — 서버와 같은 순서로', () => {
    const store = opened()
    store.applyEdit(append('n_mine_1'))
    store.applyEdit(append('n_mine_2'))

    const change = store.applyRemoteChange('page_1', {
      seq: 5,
      ops: [...append('n_theirs_1'), ...append('n_theirs_2')],
      warnings: NO_WARNINGS,
    })

    expect(change.result).toBe('rebased')
    expect(ids(store)).toEqual(['n_theirs_1', 'n_theirs_2', 'n_mine_1', 'n_mine_2'])
  })

  it('리베이스해도 내 편집은 큐에 그대로 남는다 — 아직 안 보냈다', () => {
    const store = opened()
    store.applyEdit(append('n_mine_1'))
    store.applyEdit(append('n_mine_2'))

    const change = store.applyRemoteChange('page_1', {
      seq: 5,
      ops: [...append('n_theirs_1'), ...append('n_theirs_2')],
      warnings: NO_WARNINGS,
    })

    expect(store.getState().pending.map((edit) => edit.clientOpId)).toEqual(['op_1', 'op_2'])
    expect(change.dropped).toEqual([])
  })

  it('headSeq가 오르고 낡음이 안 선다 — 미루지 않았으므로 말할 것이 없다', () => {
    const store = opened()
    store.applyEdit(append('n_mine'))

    store.applyRemoteChange('page_1', { seq: 5, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(store.getState().headSeq).toBe(5)
    expect(store.getState().remoteStale).toBeNull()
  })

  /**
   * **다음 편집이 리베이스된 바탕 위에 선다.** `nextRequest()`가 붙이는 `baseSeq`가 새
   * `headSeq`이므로, 그 요청은 서버에서 `stale`을 받지 않는다 — 리베이스가 실제로 서버에
   * 닿는 길이 이것이다.
   */
  it('리베이스 뒤 요청의 baseSeq가 새 headSeq다', () => {
    const store = opened()
    store.applyEdit(append('n_mine'))
    expect(store.nextRequest()?.baseSeq).toBe(4)

    store.applyRemoteChange('page_1', { seq: 5, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(store.nextRequest()).toMatchObject({ clientOpId: 'op_1', baseSeq: 5 })
  })

  /**
   * **얹히지 않는 pending은 버린다 — 에러가 아니다**(§7.3의 *"적용 불가"*와 같은 성질).
   * **여럿 중 하나만 버리는 판이어야** *"하나라도 실패하면 전부 버린다"*와 구분된다.
   */
  it('남이 지운 자리를 가리키는 편집만 버리고 나머지는 얹는다', () => {
    const store = opened()
    store.applyRemoteChange('page_1', {
      seq: 5,
      ops: [...append('n_a'), ...append('n_b')],
      warnings: NO_WARNINGS,
    })
    store.applyEdit([{ op: 'replace', path: '/root/children/1/type', value: 'Text' }])
    store.applyEdit(append('n_mine'))

    const change = store.applyRemoteChange('page_1', {
      seq: 6,
      ops: [{ op: 'remove', path: '/root/children/1' }],
      warnings: NO_WARNINGS,
    })

    expect(change.result).toBe('rebased')
    expect(change.dropped.map((edit) => edit.clientOpId)).toEqual(['op_1'])
    expect(store.getState().pending.map((edit) => edit.clientOpId)).toEqual(['op_2'])
    expect(ids(store)).toEqual(['n_a', 'n_mine'])
  })

  it('버린 것이 없으면 큐 배열의 참조를 그대로 둔다 — 구독자가 헛일하지 않는다', () => {
    const store = opened()
    store.applyEdit(append('n_mine'))
    const before = store.getState().pending

    store.applyRemoteChange('page_1', { seq: 5, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(store.getState().pending).toBe(before)
  })

  /**
   * **ack가 그 편집을 바탕에 접어 넣는다.** 안 접으면 바탕이 `headSeq`보다 뒤처지고,
   * **다음 리베이스가 그 낡은 바탕 위에서 만들어진다** — 그때 내 편집이 사라진다.
   */
  it('ack된 편집이 바탕에 남아 다음 리베이스에 실린다', () => {
    const store = opened()
    const opId = store.applyEdit(append('n_mine'))
    store.ackEdit(opId!, { seq: 5, revisionId: 'rev_5', inverse: [] })

    store.applyRemoteChange('page_1', { seq: 6, ops: append('n_theirs'), warnings: NO_WARNINGS })

    expect(ids(store)).toEqual(['n_mine', 'n_theirs'])
    expect(store.getState().headSeq).toBe(6)
  })

  /**
   * **얹지 못한 것은 바탕에도 없어야 한다.** 바탕에 던지면 아무것도 안 움직인다 — 셋(문서·
   * 바탕·`headSeq`)이 함께 가는 자리다.
   */
  it('얹을 수 없는 ops면 갈라졌다고 말하고 아무것도 안 움직인다', () => {
    const store = opened()
    store.applyEdit(append('n_mine'))

    const change = store.applyRemoteChange('page_1', {
      seq: 5,
      ops: [{ op: 'replace', path: '/root/children/9/type', value: 'Text' }],
      warnings: NO_WARNINGS,
    })

    expect(change.result).toBe('diverged')
    expect(store.getState().remoteStale).toEqual({ reason: 'diverged' })
    expect(store.getState().headSeq).toBe(4)
    expect(ids(store)).toEqual(['n_mine'])
  })
})

describe('applyRemoteChange — 안 얹는 갈래', () => {
  it('다른 페이지의 변경은 건너뛴다 — headSeq도 안 건드린다', () => {
    const store = opened()

    const change = store.applyRemoteChange('page_2', { seq: 5, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(change.result).toBe('skipped')
    expect(store.getState().headSeq).toBe(4)
    expect(store.getState().remoteStale).toBeNull()
  })

  it('문서가 없으면 건너뛴다', () => {
    const store = new EditorStore()

    expect(store.applyRemoteChange('page_1', { seq: 5, ops: ADD_ONE, warnings: NO_WARNINGS }).result).toBe('skipped')
  })

  /**
   * **자기 편집이 되돌아온 경우다.** 연결 id 헤더를 안 싣는 클라이언트는 서버가 자기를
   * 제외하지 못해 자기 ops를 되받는다 — 그때 그것을 또 얹으면 문서가 두 번 바뀐다.
   */
  it('이미 아는 seq는 건너뛴다 — 두 번 얹지 않는다', () => {
    const store = opened()

    const change = store.applyRemoteChange('page_1', { seq: 4, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(change.result).toBe('skipped')
    expect(ids(store)).toEqual([])
  })

  /**
   * **아직 ack 안 된 내 편집이 되돌아온 판이다.** 서버가 발신자를 제외하지 못하는 창이
   * 있다 — 편집이 REST로 나가는 동안 소켓이 열려 룸에 들어오면 뒤이은 브로드캐스트를 낸
   * 사람이 받는다.
   *
   * **`seq <= headSeq`로는 못 막는다** — 아직 ack를 못 받아 `headSeq`가 안 올랐다. 얹으면
   * 바탕과 문서에 같은 편집이 **두 번** 들어가고 그것은 조용하다.
   */
  it('아직 ack 안 된 내 편집이 되돌아오면 건너뛴다 — 두 번 얹지 않는다', () => {
    const store = opened()
    const opId = store.applyEdit(append('n_mine'))

    const change = store.applyRemoteChange('page_1', {
      seq: 5,
      ops: append('n_mine'),
      warnings: NO_WARNINGS,
      clientOpId: opId!,
    })

    expect(change.result).toBe('skipped')
    expect(ids(store)).toEqual(['n_mine'])
    expect(store.getState().headSeq).toBe(4)
    // 큐도 그대로다 — REST 응답이 아직 오지 않았고 그것이 ack를 한다.
    expect(store.getState().pending).toHaveLength(1)
  })

  /**
   * **음성 대조.** 남이 낸 편집은 `clientOpId`가 실려 있어도 그대로 리베이스된다 — 위
   * 케이스가 *"`clientOpId`가 있으면 다 건너뛴다"*로 통과하지 않는다.
   */
  it('남의 clientOpId가 실린 프레임은 그대로 얹는다 — 음성 대조', () => {
    const store = opened()
    store.applyEdit(append('n_mine'))

    const change = store.applyRemoteChange('page_1', {
      seq: 5,
      ops: append('n_theirs'),
      warnings: NO_WARNINGS,
      clientOpId: 'op_남의것',
    })

    expect(change.result).toBe('rebased')
    expect(ids(store)).toEqual(['n_theirs', 'n_mine'])
  })

  /**
   * **ack가 지나간 뒤에는 같은 id가 와도 앞의 검사가 잡는다** — 두 갈래가 겹치지 않는다.
   */
  it('ack 뒤에 되돌아온 것은 seq가 잡는다', () => {
    const store = opened()
    const opId = store.applyEdit(append('n_mine'))
    store.ackEdit(opId!, { seq: 5, revisionId: 'rev_5', inverse: [] })

    const change = store.applyRemoteChange('page_1', {
      seq: 5,
      ops: append('n_mine'),
      warnings: NO_WARNINGS,
      clientOpId: opId!,
    })

    expect(change.result).toBe('skipped')
    expect(ids(store)).toEqual(['n_mine'])
  })
})

/**
 * **리뷰가 뚫은 자리(P3-1 B1).** 앞 판은 `seq > headSeq`이기만 하면 얹었다 — 그래서 프레임을
 * 하나라도 놓치면 문서가 **조용히** 갈라지고, `headSeq`가 서버와 같아져 그 뒤 편집이
 * `stale` 409조차 안 받았다. **재연결이 있는 이상 프레임 유실은 설계상 일어난다.**
 *
 * **P3-2에서 이 갈래의 무게가 달라졌다.** 리베이스는 *"내 바탕이 서버 문서와 같다"*를
 * 전제하는데 그 전제를 지키는 것이 바로 이 검사다 — 갭이 난 바탕 위에 내 pending을 다시
 * 얹으면 **서버와 다른 문서가 조용히 만들어진다.**
 */
describe('applyRemoteChange — 프레임을 놓친 갈래 (B1)', () => {
  it('seq가 내 다음 번호가 아니면 얹지 않는다', () => {
    const store = opened()

    const change = store.applyRemoteChange('page_1', { seq: 6, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(change.result).toBe('gap')
    expect(ids(store)).toEqual([])
  })

  /**
   * **이것이 그 사고의 심장이다.** `headSeq`를 올리면 서버와 값이 같아져 다음 편집이
   * `stale` 409를 못 받고, **틀린 문서 위에서 만든 ops가 서버의 옳은 문서에 적용된다.**
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
   * **P3-1은 여기서 `'pending'`이 이겼다.** 그때는 pending이 차 있으면 어차피 안 얹으므로
   * 갭인지가 뜻이 없었다. **리베이스는 다르다** — 갭이면 내 바탕이 서버 문서가 아니고, 그
   * 위에 pending을 다시 얹으면 서버와 다른 문서가 나온다. 그래서 **갭 검사가 먼저다.**
   *
   * 이 케이스가 *"빠짐없이 받았다"*와 *"미룰 것이 있다"*가 같은 값이 아니라는 것을 든다.
   */
  it('pending이 있어도 갭이면 갭이다 — 리베이스의 전제가 pending보다 앞선다', () => {
    const store = opened()
    store.applyEdit(append('n_mine'))

    const change = store.applyRemoteChange('page_1', { seq: 9, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(change.result).toBe('gap')
    expect(store.getState().remoteStale).toEqual({ reason: 'gap' })
    // 바탕도 문서도 안 움직였다 — 내 편집만 얹힌 그대로다.
    expect(ids(store)).toEqual(['n_mine'])
    expect(store.getState().headSeq).toBe(4)
  })

  /**
   * **`'gap'`과 `'diverged'`를 접지 않는다.** 둘 다 *"못 얹었다"*지만 원인이 정반대다 —
   * 못 받은 것이 있는 것과, 받은 것을 내 바탕이 못 받아들이는 것.
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

    const change = store.applyRemoteChange('page_1', { seq: 5, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(change.result).toBe('applied')
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

    expect(next.result).toBe('gap')
    expect(store.getState().headSeq).toBe(4)
    expect(ids(store)).toEqual([])
  })

  /**
   * **놓친 seq가 뒤늦게 도착하면 그것은 얹힌다.** 서버가 순서를 뒤바꿔 보낸 경우다 —
   * `headSeq + 1`이므로 갭이 아니고, 얹고 나면 낡음이 풀린다.
   *
   * **그리고 그 순간 조용해지는데 revision 하나는 여전히 없다**(P3-1 델타 리뷰 O1).
   *
   * **P3-2가 여기에 더하는 것:** 이 상태에서 낡음이 풀렸다고 해서 *"서버가 가진 것을 다
   * 받았다"*가 되지는 않는다. **그래서 리베이스가 검사하는 것은 낡음이 아니라 프레임의
   * 번호다** — 이 판에서도 바탕은 **내 문서와 같은 앞부분**이므로 리베이스의 등식은 지켜진다.
   */
  it('놓쳤던 번호가 뒤늦게 오면 얹고 낡음을 푼다 — 그런데 하나는 여전히 없다', () => {
    const store = opened()
    store.applyRemoteChange('page_1', { seq: 6, ops: append('n_six'), warnings: NO_WARNINGS })

    const late = store.applyRemoteChange('page_1', { seq: 5, ops: append('n_five'), warnings: NO_WARNINGS })

    expect(late.result).toBe('applied')
    expect(store.getState().headSeq).toBe(5)
    // **조용해진다** — 화면은 더 이상 아무 말도 안 한다.
    expect(store.getState().remoteStale).toBeNull()
    // **그런데 seq 6이 없다.** 서버 문서는 ['n_five','n_six']이고 내 것은 앞부분뿐이다.
    expect(ids(store)).toEqual(['n_five'])
  })
})

/**
 * **약한 진단이 센 진단을 덮지 않는다**(P3-1 델타 리뷰 O3). 앞 판은 `#markStale`이 같은
 * 이유일 때만 건너뛰었고 이유 사이에 순위가 없었다 — 그래서 복원 뒤 첫 편집 프레임이
 * `'restored'`를 `'gap'`으로 덮어 **끊긴 적이 없는데 끊겼다고 말했다.**
 *
 * **P3-2가 `'pending'`을 지웠으므로 세기 표가 셋이 됐다.** 그 갈래를 재던
 * `미룸이 갭을 덮지 않는다`는 명제 자체가 없어져 지웠다.
 */
describe('낡음 이유에는 세기가 있다 (O3)', () => {
  it('복원 뒤 첫 편집 프레임이 복원 진단을 덮지 않는다', () => {
    const store = opened()
    store.markRestored()

    // 복원이 `head_seq`를 밀어 올렸으므로 이 `seq`는 내 `headSeq + 1`이 아니다 — 갭이다.
    const change = store.applyRemoteChange('page_1', { seq: 9, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(change.result).toBe('gap')
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

    const change = store.applyRemoteChange('page_1', { seq: 5, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(change.result).toBe('applied')
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

  /**
   * **P3-1의 `미룬 뒤 pending이 비고 다음 변경이 오면 그때 얹히며 풀린다`가 있던 자리다.**
   * 그 명제는 *"미뤘다가 나중에 얹힌다"*였고, 지금은 **미루는 일 자체가 없다** — 그래서
   * 첫 프레임에서 이미 얹히고 낡음이 서지 않는다.
   *
   * **이것이 P3-1 이월 §4.5(사실 9)를 닫는 방식이다.** 그때의 자리는 *"자기 편집을 되받아
   * 선 `'pending'` 낡음이 `ackEdit`으로 안 풀린다"*였는데, **풀 낡음이 애초에 안 선다.**
   */
  it('pending이 있어도 첫 프레임에서 얹히므로 낡음이 서지 않는다', () => {
    const store = opened()
    const opId = store.applyEdit(append('n_mine'))
    store.applyRemoteChange('page_1', { seq: 5, ops: ADD_ONE, warnings: NO_WARNINGS })
    expect(store.getState().remoteStale).toBeNull()

    store.ackEdit(opId!, { seq: 6, revisionId: 'rev_6', inverse: [] })

    expect(store.getState().remoteStale).toBeNull()
    expect(store.getState().headSeq).toBe(6)
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
