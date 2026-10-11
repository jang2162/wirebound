// @vitest-environment node
/**
 * **남의 변경이 도착했을 때 스토어가 하는 일**(설계서 「정방향 흐름」의 *"[타인] ops 수신 →
 * 자기 pending 위에 리베이스 적용"*). `editor-store.test.ts`와 같은 이유로 DOM 없는 환경에서 돈다 — 이 판정에는
 * 화면이 필요 없다.
 *
 * **남의 변경은 미루지 않고 리베이스한다** — 보내지 않은 편집이 있어도 남의 것을 바탕에
 * 얹고 내 것을 그 위에 다시 올린다.
 *
 * # 하나짜리로 재지 않는다
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
  const store = new EditorStore({
    nextOpId: (() => {
      let issued = 0
      return () => {
        issued += 1
        return `op_${issued}`
      }
    })(),
  })
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
 * 명제는 *"남의 것을 바탕에 얹고 내 것을 그 위에 다시 올린다"*이다(설계서 「정방향 흐름」).
 * *"보내지 않은 편집이 있으면 미루고 낡았다고 말한다"*가 아니다.
 */
describe('applyRemoteChange — 리베이스', () => {
  /**
   * **이 판이 이 파일의 중심이다.** 넷의 순서가 서버와 같아야 한다 — 서버는 남의 것을
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
   * **얹히지 않는 pending은 버린다 — 에러가 아니다**(설계서 「개인 undo/redo」의 *"적용 불가"*와 같은 성질).
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

/**
 * **리베이스 · 되돌리기는 노드 id 로 경로를 다시 짓는다**(`src/store/anchored-ops.ts`). 판은 `[n_a, n_b, n_c]`에서 내 편집이 `n_b`(자리 1)를
 * 겨누는 사이 남이 맨 앞에 넣는 것이다 — 경로 그대로 얹으면 던지지 않고 `n_a`에 얹히고, 409 뒤 다시 내기가 그 경로를 서버에 보낸다(Chrome · api:
 * 서버에서 «가»가 지워졌다).
 */
describe('리베이스는 내 편집을 제 노드로 옮긴다', () => {
  function three(): EditorStore {
    const store = opened()
    store.applyRemoteChange('page_1', { seq: 5, ops: [...append('n_a'), ...append('n_b'), ...append('n_c')], warnings: NO_WARNINGS })
    return store
  }
  const FRONT: PatchOp[] = [{ op: 'add', path: '/root/children/0', value: { id: 'n_x', type: 'Container' } }]

  it('나간 삭제는 남이 앞에 넣은 판에서 그 노드를 지우는 경로로 다시 나간다', () => {
    const store = three()
    store.applyEdit([{ op: 'remove', path: '/root/children/1' }])

    const change = store.applyRemoteChange('page_1', { seq: 6, ops: FRONT, warnings: NO_WARNINGS })

    expect(change.dropped).toEqual([])
    expect(ids(store)).toEqual(['n_x', 'n_a', 'n_c'])
    expect(store.nextRequest()).toMatchObject({ baseSeq: 6, ops: [{ op: 'remove', path: '/root/children/2' }] })
  })

  it('남이 그 노드를 지웠으면 버리고 돌려준다 — 옆 노드에 얹지 않는다', () => {
    const store = three()
    store.applyEdit([{ op: 'replace', path: '/root/children/1/type', value: 'Text' }])

    const change = store.applyRemoteChange('page_1', { seq: 6, ops: [{ op: 'remove', path: '/root/children/1' }], warnings: NO_WARNINGS })

    expect(change.dropped.map((edit) => edit.clientOpId)).toEqual(['op_1'])
    expect(store.getState().document?.root.children?.map((node) => node.type)).toEqual(['Container', 'Container'])
  })

  it('되돌리기는 ack 뒤 남이 앞에 넣은 판에서 그 노드를 되돌린다', () => {
    const store = three()
    const opId = store.applyEdit([{ op: 'replace', path: '/root/children/1/type', value: 'Text' }])
    store.ackEdit(opId!, { seq: 6, revisionId: 'rev_6', inverse: [{ op: 'replace', path: '/root/children/1/type', value: 'Container' }] })
    store.applyRemoteChange('page_1', { seq: 7, ops: FRONT, warnings: NO_WARNINGS })

    const attempt = store.startUndo()

    expect(attempt).toMatchObject({ skipped: 0, blocked: null })
    expect(store.nextRequest()?.ops).toEqual([{ op: 'replace', path: '/root/children/2/type', value: 'Container' }])
    expect(store.getState().document?.root.children?.map((node) => node.type)).toEqual(['Container', 'Container', 'Container', 'Container'])
  })

  it('되돌리기의 잠금 판정도 다시 지은 경로로 묻는다 — 남이 잡은 제 노드면 막힌다', () => {
    const store = three()
    const opId = store.applyEdit([{ op: 'replace', path: '/root/children/1/type', value: 'Text' }])
    store.ackEdit(opId!, { seq: 6, revisionId: 'rev_6', inverse: [{ op: 'replace', path: '/root/children/1/type', value: 'Container' }] })
    store.applyRemoteChange('page_1', { seq: 7, ops: FRONT, warnings: NO_WARNINGS })
    store.setViewer('me')
    store.setLocks([{ pageId: 'page_1', nodeId: 'n_b', userId: 'bob', userName: '밥' }])

    expect(store.startUndo()).toMatchObject({ clientOpId: null, blocked: { userName: '밥' } })
    expect(store.getState().undoStack).toHaveLength(1)
  })

  it('되돌릴 노드를 남이 지웠으면 건너뛴다 — 옆 노드를 되돌리지 않는다', () => {
    const store = three()
    const opId = store.applyEdit([{ op: 'replace', path: '/root/children/1/type', value: 'Text' }])
    store.ackEdit(opId!, { seq: 6, revisionId: 'rev_6', inverse: [{ op: 'replace', path: '/root/children/1/type', value: 'Container' }] })
    store.applyRemoteChange('page_1', { seq: 7, ops: [{ op: 'remove', path: '/root/children/1' }], warnings: NO_WARNINGS })

    const attempt = store.startUndo()

    expect(attempt).toEqual({ clientOpId: null, skipped: 1, blocked: null })
    expect(store.getState().pending).toEqual([])
  })
})

/**
 * **판을 다시 싣는 창 안에 온 revision 은 실린 판 뒤에 제 차례로 얹힌다**(`EditorStore`의 `#windowChanges` · `#replayWindow`). 판은 늘 «조회를
 * 시작 → 그 사이 revision 이 옴 → 조회의 답이 그 revision 앞의 판»이다. 셸째 재는 케이스는 `test/edit/reload-sent-edits.test.tsx`의 «다시
 * 읽는 창 안에 온 revision» 묶음이 갖는다 — 여기는 셸로 세우기 어려운 입구(번호 응답 · 판째 버린 편집의 늦은 ack · 선택)다.
 */
describe('다시 읽는 창 안에 온 revision', () => {
  it('번호 응답도 실린 판 뒤에 얹는다', () => {
    const store = opened()
    store.applyRemoteChange('page_1', { seq: 5, ops: append('n_a'), warnings: NO_WARNINGS })
    const ticket = store.beginPageLoad('page_1')
    const marker: PatchOp[] = [{ op: 'add', path: '/root/children/0/marker', value: 1 }]
    expect(store.applyMarkerChange('page_1', { seq: 6, markerOps: marker })).toBe('applied')

    expect(store.settlePageLoad(ticket)).toBe(true)
    store.loadPage('page_1', doc([{ id: 'n_a' }]), 5, ticket)

    expect(store.getState().headSeq).toBe(6)
    expect(store.getState().document?.root.children?.[0]?.marker).toBe(1)
    expect(store.getState().remoteStale).toBeNull()
  })

  it('판째 버린 편집의 늦은 ack 가 다른 조회의 창 안에 오면 그 조회의 판 뒤에도 얹는다', () => {
    const store = opened()
    const opId = store.applyEdit(append('n_mine'))!
    store.markSent(opId)
    const first = store.beginPageLoad('page_1')
    store.settlePageLoad(first)
    store.loadPage('page_1', doc(), 4, first)
    const second = store.beginPageLoad('page_1')

    store.ackEdit(opId, { seq: 5, revisionId: 'rev_5', inverse: [] })
    expect(ids(store)).toEqual(['n_mine'])
    store.settlePageLoad(second)
    store.loadPage('page_1', doc(), 4, second)

    expect(ids(store)).toEqual(['n_mine'])
    expect(store.getState().headSeq).toBe(5)
  })

  it('얹은 revision 이 고른 노드를 지웠으면 선택을 놓는다', () => {
    const store = opened()
    store.applyRemoteChange('page_1', { seq: 5, ops: append('n_a'), warnings: NO_WARNINGS })
    store.selectNode('n_a')
    const ticket = store.beginPageLoad('page_1')
    store.applyRemoteChange('page_1', { seq: 6, ops: [{ op: 'remove', path: '/root/children/0' }], warnings: NO_WARNINGS })

    store.settlePageLoad(ticket)
    store.loadPage('page_1', doc([{ id: 'n_a' }]), 5, ticket)

    expect(ids(store)).toEqual([])
    expect(store.getState().selectedNodeId).toBeNull()
  })
})

/**
 * **번호 응답이 보낼 편집을 다시 못 얹으면 아무것도 안 움직인다**(`EditorStore`의 `#applyMarkerOps` — «하나라도 다시 못 얹으면»). 번호 ops 는
 * `marker` 칸만 바꾸므로 판은 좁다 — 되돌리기 스택에 번호를 지우는 `inverse`가 있고(서버 이력으로 채운 스택) 그것을 되돌리는 편집이 큐에 선
 * 사이, 같은 번호를 지우는 응답(코멘트 삭제)이 온다.
 */
describe('번호 응답이 보낼 편집을 다시 못 얹는 판', () => {
  it('갈라졌다고 말하고 문서 · 바탕 · headSeq · 큐를 안 움직인다', () => {
    const store = opened()
    store.applyRemoteChange('page_1', {
      seq: 5,
      ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_a', type: 'Container', marker: 1 } }],
      warnings: NO_WARNINGS,
    })
    const removeMarker: PatchOp[] = [{ op: 'remove', path: '/root/children/0/marker' }]
    store.restoreUndoStack([{ revisionId: 'rev_marker', seq: 5, inverse: removeMarker }])
    expect(store.startUndo().clientOpId).not.toBeNull()
    const before = store.getState()

    const result = store.applyMarkerChange('page_1', { seq: 6, markerOps: removeMarker })

    expect(result).toBe('diverged')
    expect(store.getState().headSeq).toBe(5)
    expect(store.getState().baseDocument).toBe(before.baseDocument)
    expect(store.getState().document).toBe(before.document)
    expect(store.getState().pending).toBe(before.pending)
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
 * **`seq > headSeq`이기만 하면 얹으면** 프레임을 하나라도 놓칠 때 문서가 **조용히** 갈라지고,
 * `headSeq`가 서버와 같아져 그 뒤 편집이 `stale` 409조차 안 받는다. **재연결이 있는 이상
 * 프레임 유실은 설계상 일어난다.**
 *
 * 리베이스는 *"내 바탕이 서버 문서와 같다"*를 전제하는데 그 전제를 지키는 것이 바로 이
 * 검사다 — 갭이 난 바탕 위에 내 pending을 다시
 * 얹으면 **서버와 다른 문서가 조용히 만들어진다.**
 */
describe('applyRemoteChange — 프레임을 놓친 갈래', () => {
  it('seq가 내 다음 번호가 아니면 얹지 않는다', () => {
    const store = opened()

    const change = store.applyRemoteChange('page_1', { seq: 6, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(change.result).toBe('gap')
    expect(ids(store)).toEqual([])
  })

  /**
   * **이것이 이 갈래의 심장이다.** `headSeq`를 올리면 서버와 값이 같아져 다음 편집이
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
   * **갭 검사가 pending보다 먼저다.** 갭이면 내 바탕이 서버 문서가 아니고, 그 위에 pending을
   * 다시 얹으면 서버와 다른 문서가 나온다.
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
   * **놓친 seq가 뒤늦게 도착하면 그것은 얹힌다 — 그런데 낡음은 남는다.** 서버가 순서를 뒤바꿔 보냈거나, 커밋 답을 잃은
   * 편집을 다시 낸 재방송이 남의 revision 뒤에 온 판이다. `headSeq + 1`이므로 갭이 아니고, 바탕 + 그 ops 는 서버의 그
   * revision 문서와 같다(리베이스의 등식은 낡음이 아니라 번호를 본다).
   *
   * **seq 6 은 여전히 없다** — 서버는 버린 프레임을 다시 보내지 않는다. 여기서 낡음을 풀면 화면이 조용해지는데 revision
   * 하나가 빠져 있다(`#rebaseOnto` 앞 주석). 낡음을 푸는 것은 `loadPage`뿐이다(아래 «낡음은 풀린다»).
   */
  it('놓쳤던 번호가 뒤늦게 오면 얹되 낡음은 남는다 — 하나가 여전히 없다', () => {
    const store = opened()
    store.applyRemoteChange('page_1', { seq: 6, ops: append('n_six'), warnings: NO_WARNINGS })

    const late = store.applyRemoteChange('page_1', { seq: 5, ops: append('n_five'), warnings: NO_WARNINGS })

    expect(late.result).toBe('applied')
    expect(store.getState().headSeq).toBe(5)
    // **말을 거두지 않는다** — 서버 문서는 ['n_five','n_six']이고 내 것은 앞부분뿐이다.
    expect(store.getState().remoteStale).toEqual({ reason: 'gap' })
    expect(ids(store)).toEqual(['n_five'])
  })
})

/**
 * **약한 진단이 센 진단을 덮지 않는다.** `#markStale`이 같은 이유일 때만 건너뛰고 이유
 * 사이에 순위가 없으면, 복원 뒤 첫 편집 프레임이 `'restored'`를 `'gap'`으로 덮어 **끊긴 적이
 * 없는데 끊겼다고 말한다.**
 *
 * 세기는 셋이다 — `'gap'` < `'diverged'` < `'restored'`.
 */
describe('낡음 이유에는 세기가 있다', () => {
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
   *
   * 프레임이 어떤 낡음도 풀지 않는 규칙의 복원 몫이다 — 갭 몫은 위 «놓쳤던 번호가 뒤늦게 오면 얹되 낡음은 남는다»가
   * 잰다. 둘이 따로 서는 것은 변조가 한쪽만 풀 수 있어서다 — «복원만 남기고 나머지는 푼다»는 갭 몫이, «복원만 푼다»는
   * 이 케이스가 혼자 잡는다.
   */
  it('복원 뒤 프레임을 잘 얹어도 복원 진단이 남는다', () => {
    const store = opened()
    store.markRestored()

    const change = store.applyRemoteChange('page_1', { seq: 5, ops: ADD_ONE, warnings: NO_WARNINGS })

    expect(change.result).toBe('applied')
    expect(store.getState().headSeq).toBe(5)
    expect(store.getState().remoteStale).toEqual({ reason: 'restored' })
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
    store.applyRemoteChange('page_1', { seq: 9, ops: ADD_ONE, warnings: NO_WARNINGS })
    expect(store.getState().remoteStale).toEqual({ reason: 'gap' })

    store.loadPage('page_1', doc(), 9)

    expect(store.getState().remoteStale).toBeNull()
  })

  it('복원 낡음은 복원 뒤 다시 읽기의 판이 푼다', () => {
    const store = opened()
    store.markRestored()
    expect(store.getState().remoteStale).not.toBeNull()

    store.beginRestoreReread()
    store.loadPage('page_1', doc(), 9, undefined, { restoreReread: true })

    expect(store.getState().remoteStale).toBeNull()
  })

  /** 복원은 메뉴 · 코멘트 · 테마도 바꿨다 — 페이지만 다시 받은 판은 그것들을 안 읽었다(`EditorStore.beginRestoreReread`). */
  it('복원 낡음은 페이지만 다시 받은 판으로 안 풀린다', () => {
    const store = opened()
    store.markRestored()

    store.loadPage('page_1', doc(), 9)

    expect(store.getState().remoteStale).toEqual({ reason: 'restored' })
  })

  /**
   * **미루는 일 자체가 없다** — 그래서 pending이 있어도 첫 프레임에서 이미 얹히고 낡음이
   * 서지 않는다.
   *
   * 그러므로 *"자기 편집을 되받아 선 낡음이 `ackEdit`으로 안 풀린다"*는 결함도 설 자리가
   * 없다 — **풀 낡음이 애초에 안 선다.**
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
    store.applyRemoteChange('page_1', { seq: 9, ops: ADD_ONE, warnings: NO_WARNINGS })

    store.clearPage()

    expect(store.getState().remoteStale).toBeNull()
  })

  it('복원 낡음은 페이지를 닫아도 남고, 복원 뒤 다시 읽기가 비운 판이면 풀린다', () => {
    const store = opened()
    store.markRestored()

    store.clearPage()
    expect(store.getState().remoteStale).toEqual({ reason: 'restored' })

    store.beginRestoreReread()
    store.clearPage({ restoreReread: true })
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

/**
 * **내 바탕이 곧 이 서버 판인가**(`holdsServerPage`). 재연결 재조회가 이것으로 «다시 싣지 않아도 되나»를 묻는다 —
 * 판을 번호째 · 문서째 보는 까닭은 그 머리말, 번호가 같고 문서가 다른 판은 `test/edit/reconnect-resync.test.tsx`의
 * «번호가 같아도 문서가 다르면 싣는다»가 잰다. 여기 셋은 **같은 판을 «다르다»고 읽지 않는가**다 — 그러면 재조회가 늘
 * 싣어 되돌리기 이력을 이유 없이 잃는다.
 */
describe('holdsServerPage', () => {
  /** 서버가 돌려주는 모양 — JSONB 는 키 순서를 제 규칙으로 바꾼다. 값은 `doc()`과 같다. */
  function reordered(children: { id: string }[] = []): PageDocument {
    return JSON.parse(
      JSON.stringify({
        root: { children: children.map((c) => ({ type: 'Container', id: c.id })), type: 'Container', id: 'n_root' },
        version: CURRENT_DOCUMENT_VERSION,
      }),
    ) as PageDocument
  }

  it('키 순서만 다른 같은 문서는 같은 판이다', () => {
    const store = opened()

    expect(store.holdsServerPage('page_1', 4, reordered())).toBe(true)
  })

  /** 값이 `undefined`인 키는 직렬화하면 사라진다 — 서버 판에는 없는 키다. */
  it('값이 undefined 인 키는 없는 키로 본다', () => {
    const store = new EditorStore()
    const mine = doc([{ id: 'n_a' }])
    ;(mine.root.children![0] as unknown as Record<string, unknown>)['props'] = undefined
    store.loadPage('page_1', mine, 4)

    // 서버 판은 키 순서가 내 것과 같게 둔다 — 이 케이스는 `undefined` 키 하나만 잰다(키 순서는 위 케이스).
    const server = JSON.parse(JSON.stringify(doc([{ id: 'n_a' }]))) as PageDocument

    expect(store.holdsServerPage('page_1', 4, server)).toBe(true)
  })

  /** 견주는 것은 바탕이다 — 보내지 않은 내 편집만큼 앞선 `document`가 아니다. */
  it('보내지 않은 편집이 있어도 바탕이 서버 판이면 같은 판이다', () => {
    const store = opened()
    store.applyEdit(append('n_mine'))

    // 키 순서는 내 것과 같게 둔다 — 이 케이스는 바탕인가 낙관 문서인가만 잰다.
    expect(store.holdsServerPage('page_1', 4, doc())).toBe(true)
  })

  /**
   * 음성 대조 — 위 셋이 «늘 참»으로 통과하지 않는다. **문서가 다른 판은 여기서 재지 않는다** — 그 축은 재조회째 여는
   * `test/edit/reconnect-resync.test.tsx`의 «번호가 같아도 문서가 다르면 싣는다»가 갖는다(여기서도 재면 대조를 뗀 변조에
   * 둘이 함께 죽는다).
   */
  it('번호나 페이지가 다르면 다른 판이다 — 음성 대조', () => {
    const store = opened()

    expect(store.holdsServerPage('page_1', 5, reordered())).toBe(false)
    expect(store.holdsServerPage('page_2', 4, reordered())).toBe(false)
  })
})

/**
 * **여는 조회의 창**(`EditorStore`의 `#openingPageId`) — 열린 페이지가 아닌 페이지를 읽는 동안 온 그 페이지의 revision 도 적어, 실린 판 뒤에
 * 얹는다. 셸째 재는 판은 `test/edit/reload-sent-edits.test.tsx`의 «입구마다» 묶음이, 실브라우저 판은 `build-test/editor-open-window.test.ts`가
 * 갖는다 — 여기는 두 길(판을 비운 뒤 · 다른 페이지가 열린 채)과 판째 버린 편집의 늦은 ack 를 스토어로 가른다.
 */
describe('여는 조회의 창', () => {
  it('판을 비우고 연 조회의 창에 온 프레임을 실린 판 뒤에 얹는다', () => {
    const store = opened()
    store.clearPage()
    const ticket = store.beginPageLoad('page_1')
    expect(store.applyRemoteChange('page_1', { seq: 5, ops: append('n_bob'), warnings: NO_WARNINGS }).result).toBe('skipped')

    store.settlePageLoad(ticket)
    store.loadPage('page_1', doc(), 4, ticket)

    expect(ids(store)).toEqual(['n_bob'])
    expect(store.getState().headSeq).toBe(5)
    expect(store.getState().remoteStale).toBeNull()
  })

  it('다른 페이지가 열린 채 읽는 조회의 창도 적는다', () => {
    const store = opened()
    store.loadPage('page_2', doc([{ id: 'n_q' }]), 9)
    const ticket = store.beginPageLoad('page_1')
    store.applyRemoteChange('page_1', { seq: 5, ops: append('n_bob'), warnings: NO_WARNINGS })

    store.settlePageLoad(ticket)
    store.loadPage('page_1', doc(), 4, ticket)

    expect(ids(store)).toEqual(['n_bob'])
    expect(store.getState().headSeq).toBe(5)
  })

  it('떠났다 다시 여는 조회의 창에 온 판째 버린 편집의 ack 를 얹는다', () => {
    const store = opened()
    const opId = store.applyEdit(append('n_mine'))!
    store.markSent(opId)
    store.clearPage()
    store.loadPage('page_2', doc(), 9)
    store.clearPage()
    const ticket = store.beginPageLoad('page_1')
    store.ackEdit(opId, { seq: 5, revisionId: 'rev_5', inverse: [] })

    store.settlePageLoad(ticket)
    store.loadPage('page_1', doc(), 4, ticket)

    expect(ids(store)).toEqual(['n_mine'])
    expect(store.getState().headSeq).toBe(5)
  })

  it('열린 페이지의 창에 적힌 것은 다른 페이지의 판에 얹지 않는다', () => {
    const store = opened()
    const ticket = store.beginPageLoad('page_2')
    // 열린 페이지(page_1)의 프레임 — 그 페이지의 창에 적힌다.
    store.applyRemoteChange('page_1', { seq: 5, ops: append('n_one'), warnings: NO_WARNINGS })

    store.settlePageLoad(ticket)
    store.loadPage('page_2', doc(), 4, ticket)

    expect(ids(store)).toEqual([])
    expect(store.getState().headSeq).toBe(4)
  })

  /** 게시의 방송은 낸 연결을 뺀다 — 번호 응답이 그 revision 이 이 탭에 오는 유일한 길이다(Chrome 판은 `build-test/editor-open-window.test.ts`). */
  it('떠났다 다시 여는 조회의 창에 온 번호 응답을 실린 판 뒤에 얹는다', () => {
    const store = opened()
    store.clearPage()
    const ticket = store.beginPageLoad('page_1')
    expect(store.applyMarkerChange('page_1', { seq: 5, markerOps: [{ op: 'add', path: '/root/marker', value: 1 }] })).toBe('skipped')

    store.settlePageLoad(ticket)
    store.loadPage('page_1', doc(), 4, ticket)

    expect(store.getState().document?.root.marker).toBe(1)
    expect(store.getState().headSeq).toBe(5)
    expect(store.getState().remoteStale).toBeNull()
  })

  /** 문서가 안 바뀐 번호 응답의 `seq`는 서버가 요청을 받은 때의 번호다 — 그 revision 의 ops 가 아니다(`applyMarkerChange`의 «`markerOps`가 비면»). */
  it('문서가 안 바뀐 번호 응답은 여는 창에 적지 않는다', () => {
    const store = opened()
    store.clearPage()
    const ticket = store.beginPageLoad('page_1')
    store.applyMarkerChange('page_1', { seq: 5, markerOps: [] })

    store.settlePageLoad(ticket)
    store.loadPage('page_1', doc(), 4, ticket)

    expect(store.getState().headSeq).toBe(4)
  })

  it('그 ack 가 다른 페이지를 여는 창에 오면 적지 않는다', () => {
    const store = opened()
    const opId = store.applyEdit(append('n_mine'))!
    store.markSent(opId)
    store.clearPage()
    const ticket = store.beginPageLoad('page_2')
    store.ackEdit(opId, { seq: 5, revisionId: 'rev_5', inverse: [] })

    store.settlePageLoad(ticket)
    store.loadPage('page_2', doc(), 4, ticket)

    expect(ids(store)).toEqual([])
    expect(store.getState().headSeq).toBe(4)
  })
})

/**
 * **복원 신호보다 앞에 시작한 조회의 답은 복원 배너를 풀지 않는다**(`EditorStore`의 `#restoredAt`). 그 조회는 복원 앞을 읽었을 수 있다 — 풀면
 * 옛 판본이 최신처럼 서고, 남의 복원은 자동으로 다시 읽지 않으므로(배너 단추) 다음 편집까지 조용하다.
 */
describe('창 안의 복원 신호', () => {
  it('신호 앞에 시작한 조회의 답을 실어도 복원 낡음을 둔다', () => {
    const store = opened()
    const ticket = store.beginPageLoad('page_1')
    store.markRestored()

    store.settlePageLoad(ticket)
    store.loadPage('page_1', doc([{ id: 'n_old' }]), 4, ticket)

    expect(ids(store)).toEqual(['n_old'])
    expect(store.getState().remoteStale).toEqual({ reason: 'restored' })
  })

  it('신호 뒤에 시작한 복원 뒤 다시 읽기의 답은 복원 낡음을 푼다', () => {
    const store = opened()
    store.markRestored()
    store.beginRestoreReread()
    const ticket = store.beginPageLoad('page_1')

    store.settlePageLoad(ticket)
    store.loadPage('page_1', doc(), 1, ticket, { restoreReread: true })

    expect(store.getState().remoteStale).toBeNull()
  })

  /** 다시 읽기의 다른 조회(메뉴 · 코멘트 · 테마)는 페이지 조회보다 앞에 시작해 그 복원 앞을 읽었을 수 있다(`#rereadMark`). */
  it('복원 뒤 다시 읽기가 시작된 뒤 온 신호는 그 다시 읽기의 답이 안 푼다 — 페이지 조회가 신호 뒤에 시작했어도', () => {
    const store = opened()
    store.markRestored()
    store.beginRestoreReread()
    store.markRestored()
    const ticket = store.beginPageLoad('page_1')

    store.settlePageLoad(ticket)
    store.loadPage('page_1', doc(), 1, ticket, { restoreReread: true })

    expect(store.getState().remoteStale).toEqual({ reason: 'restored' })
  })

  it('답을 받은 내 복원의 안전망 스냅샷 id 를 실은 신호는 낡음을 안 세운다 — 다른 id 면 세운다', () => {
    const store = opened()
    store.beginOwnRestore('r-mine')
    store.ownRestoreAnswered('r-mine', 's-mine')
    store.beginRestoreReread()

    store.markRestored({ safetySnapshotId: 's-mine', clientRestoreId: 'r-mine' })
    expect(store.getState().remoteStale).toBeNull()

    store.markRestored({ safetySnapshotId: 's-other' })
    expect(store.getState().remoteStale).toEqual({ reason: 'restored' })
  })

  /**
   * **다시 읽기가 시작된 뒤에 시작한 페이지 조회의 판도 푼다**(`#rereadBegun`) — 다시 읽기는 메뉴 · 코멘트 · 테마를 곧바로 다시 읽기 시작했고,
   * 그 조회는 복원 뒤를 읽었다. 다시 읽기가 도는 사이 다른 페이지로 옮긴 판이다(`apps/web/build-test/editor-banner-reload.test.ts`).
   */
  it('복원 뒤 다시 읽기가 시작된 뒤에 시작한 다른 조회의 판도 복원 낡음을 푼다', () => {
    const store = opened()
    store.markRestored()
    store.beginRestoreReread()
    store.clearPage()
    const ticket = store.beginPageLoad('page_2')

    store.settlePageLoad(ticket)
    store.loadPage('page_2', doc(), 1, ticket)

    expect(store.getState().remoteStale).toBeNull()
  })

  /** 다시 읽기 **앞에** 시작한 조회(재연결 재조회 · 여는 조회)는 나머지가 다시 읽혔는지 모른다 — 신호 뒤에 시작했어도. */
  it('복원 뒤 다시 읽기보다 앞에 시작한 조회의 판은 복원 낡음을 안 푼다', () => {
    const store = opened()
    store.markRestored()
    const ticket = store.beginPageLoad('page_1')
    store.beginRestoreReread()

    store.settlePageLoad(ticket)
    store.loadPage('page_1', doc(), 1, ticket)

    expect(store.getState().remoteStale).toEqual({ reason: 'restored' })
  })

  /** 다시 읽기가 시작된 뒤 온 신호는 그 다시 읽기가 못 읽었다 — 그 신호 뒤에 시작한 조회도 페이지만 읽었다(`#rereadMark`). */
  it('복원 뒤 다시 읽기가 시작된 뒤 신호가 또 오면 그 뒤에 시작한 다른 조회의 판도 안 푼다', () => {
    const store = opened()
    store.markRestored()
    store.beginRestoreReread()
    store.markRestored()
    const ticket = store.beginPageLoad('page_1')

    store.settlePageLoad(ticket)
    store.loadPage('page_1', doc(), 1, ticket)

    expect(store.getState().remoteStale).toEqual({ reason: 'restored' })
  })

  // 서버에서는 이 판이 안 선다 — 되살린 페이지는 옛 판본이 쓴 번호 뒤에서 센다(`apps/api/test/restore.test.ts`의 «되살린 페이지의 번호»).
  // 이 케이스는 복원 앞일 수 있는 판에 신호 뒤 revision 을 얹지 않는 장치를 잠근다 — 번호가 겹치지 않아도 그 판 뒤의 번호가 아니다.
  it('신호 앞에 시작한 조회의 판에는 신호 뒤에 온 revision 을 얹지 않는다 — 되살린 판본의 번호다', () => {
    const store = opened()
    const ticket = store.beginPageLoad('page_1')
    store.markRestored()
    store.applyRemoteChange('page_1', { seq: 5, ops: [{ op: 'remove', path: '/root/children/0' }], warnings: NO_WARNINGS })

    store.settlePageLoad(ticket)
    store.loadPage('page_1', doc([{ id: 'n_old' }]), 4, ticket)

    expect(ids(store)).toEqual(['n_old'])
    expect(store.getState().headSeq).toBe(4)
  })
})

/**
 * **떠나며 버린 편집의 수와 그 통지**(`EditorStore.clearPage`의 반환 · `abandonedUnsent` · `setLeaveNotice`). 문장은 셸이 짓는다 —
 * `test/edit/reload-sent-edits.test.tsx`의 «떠나며 버린 편집의 수».
 */
describe('떠나며 버린 편집', () => {
  it('판을 비우며 버린 편집을 돌려주고, 나간 편집과 함께 버린 안 보낸 편집의 수를 든다', () => {
    const store = opened()
    const sent = store.applyEdit(append('n_a'))!
    store.markSent(sent)
    store.applyEdit(append('n_b'))
    store.applyEdit(append('n_c'))

    const dropped = store.clearPage()

    expect(dropped.map((edit) => store.wasSent(edit))).toEqual([true, false, false])
    expect(store.abandonedOnLeave(sent)).toBe(true)
    expect(store.abandonedUnsent()).toBe(2)
  })

  it('같은 페이지를 다시 실으며 버린 것은 떠남으로 세지 않는다', () => {
    const store = opened()
    const sent = store.applyEdit(append('n_a'))!
    store.markSent(sent)
    store.applyEdit(append('n_b'))

    store.loadPage('page_1', doc(), 4)

    expect(store.abandonedOnLeave(sent)).toBe(false)
    expect(store.abandonedUnsent()).toBe(0)
  })

  /** 둘째 떠남에서 버린 것은 그 답 뒤에 줄 서 한 번도 안 나갔다(Chrome 판은 `build-test/editor-leave-unsent.test.ts`). */
  it('나간 편집의 답을 기다리는 동안 또 떠나며 버린 안 보낸 편집도 세고, 그 페이지를 더한다', () => {
    const store = opened()
    const sent = store.applyEdit(append('n_a'))!
    store.markSent(sent)
    store.applyEdit(append('n_b'))
    store.clearPage()
    store.loadPage('page_2', doc(), 9)
    store.applyEdit(append('n_c'))

    const dropped = store.clearPage()

    expect(dropped.map((edit) => store.wasSent(edit))).toEqual([false])
    expect(store.abandonedOnLeave(sent)).toBe(true)
    expect(store.abandonedUnsent()).toBe(2)
    expect(store.abandonedPages()).toEqual(['page_1', 'page_2'])
  })

  /** 그 편집이 아닌 편집이 답을 기다리는 판 — 실패 수습이 다시 읽는 동안 쌓인 편집이다. 떠난 편집의 수는 이미 말해졌다. */
  it('마지막으로 나간 것이 떠나며 버린 편집이 아니면 그 수에 더하지 않는다', () => {
    const store = opened()
    const sent = store.applyEdit(append('n_a'))!
    store.markSent(sent)
    store.clearPage()
    store.loadPage('page_2', doc(), 9)
    const next = store.applyEdit(append('n_b'))!
    store.markSent(next)
    store.failEdits()
    store.applyEdit(append('n_c'))

    store.clearPage()

    expect(store.abandonedUnsent()).toBe(0)
    expect(store.abandonedPages()).toEqual(['page_1'])
  })

  it('떠남의 통지는 가리키는 페이지를 다 다시 열면 풀린다', () => {
    const store = opened()
    store.setLeaveNotice('떠남', ['page_1', 'page_2'])
    store.clearPage()

    store.loadPage('page_1', doc(), 4)
    expect(store.getState().editFailure).toEqual({ kind: 'message', message: '떠남' })

    store.clearPage()
    store.loadPage('page_2', doc(), 9)
    expect(store.getState().editFailure).toBeNull()
  })

  it('다른 통지가 서 있으면 그 페이지를 다시 열어도 그 통지는 그대로다', () => {
    const store = opened()
    store.setLeaveNotice('떠남', ['page_1'])
    store.setEditFailure({ kind: 'message', message: '다른 실패' })

    store.loadPage('page_1', doc(), 4)

    expect(store.getState().editFailure).toEqual({ kind: 'message', message: '다른 실패' })
  })

  it('떠남의 통지는 닫을 수 있고, 다른 통지는 닫지 않는다', () => {
    const store = opened()
    store.setLeaveNotice('떠남', ['page_1'])
    expect(store.isLeaveNotice(store.getState().editFailure)).toBe(true)
    store.closeLeaveNotice()
    expect(store.getState().editFailure).toBeNull()

    store.setEditFailure({ kind: 'message', message: '다른 실패' })
    expect(store.isLeaveNotice(store.getState().editFailure)).toBe(false)
    store.closeLeaveNotice()
    expect(store.getState().editFailure).toEqual({ kind: 'message', message: '다른 실패' })
  })

  it('떠남의 통지는 판을 비우거나 프로젝트를 옮겨도 남고, 다른 통지는 지워진다', () => {
    const store = opened()
    store.setLeaveNotice('떠남', [])
    store.clearPage()
    store.reset('prj_2')
    expect(store.getState().editFailure).toEqual({ kind: 'message', message: '떠남' })

    store.setEditFailure({ kind: 'message', message: '다른 실패' })
    store.clearPage()
    expect(store.getState().editFailure).toBeNull()
  })
})
