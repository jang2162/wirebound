/**
 * **편집이 어느 길로 나가는가**(P3-2 T3 · §7.1). 소켓은 가짜다 — 이 파일이 재는 것은
 * 네트워크가 아니라 **배선**이고, 진짜 프레임을 서버가 받는 것은 `apps/api`의
 * `ws-patch.test.ts`가 잰다.
 *
 * # 두 경로가 함께 서 있다 (D5)
 *
 * WS가 붙어 있으면 그리로, 없으면 REST로 나간다. **REST를 지우지 않는 것은 §7.4 때문이다** —
 * MCP의 `patch_page`는 REST로 들어오고, `RealtimeProvider` 없이 도는 화면도 그쪽을 지난다.
 * 그래서 **두 판을 나란히 잰다**: 한쪽만 재면 *"항상 그 길로 간다"*와 구분되지 않는다.
 */
import { act, render } from '@testing-library/react'
import { CURRENT_DOCUMENT_VERSION, type PageDocument, type PatchOp } from '@wirebound/schema'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../../src/api/client'
import { ApiProvider } from '../../src/api/context'
import { useEditCommit } from '../../src/edit/use-edit-commit'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { RealtimeProvider, createConnectionIdHolder } from '../../src/realtime/context'
import { createEditChannel } from '../../src/realtime/edit-channel'
import { useRealtime } from '../../src/realtime/use-realtime'
import { EditorStore } from '../../src/store/editor-store'
import { EditorStoreProvider } from '../../src/store/use-editor-store'

const PROJECT_ID = 'project_1'
const PAGE_ID = 'page_1'
const HEAD_SEQ = 4

class FakeSocket implements RealtimeSocket {
  onopen: (() => void) | null = null

  onmessage: ((event: { data: unknown }) => void) | null = null

  onclose: (() => void) | null = null

  onerror: (() => void) | null = null

  readonly sent: string[] = []

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.onclose?.()
  }
}

/**
 * 노드 **둘**을 둔다. 둘째가 있어야 *"남의 편집이 내 pending 하나만 버린다"*는 판을 만들 수
 * 있다 — 하나뿐이면 큐가 통째로 비어 그 갈래가 관측되지 않는다.
 */
function doc(content = '옛 내용'): PageDocument {
  return {
    version: CURRENT_DOCUMENT_VERSION,
    root: {
      id: 'n_root',
      type: 'Page',
      children: [
        { id: 'n_text', type: 'Text', props: { content } },
        { id: 'n_other', type: 'Text', props: { content: '둘째' } },
      ],
    },
  }
}

/** 첫째 노드를 고치는 편집. 값만 다르다. */
function contentOps(value: string): PatchOp[] {
  return [{ op: 'replace', path: '/root/children/0/props/content', value }]
}

/** 둘째 노드를 고치는 편집. **경로가 다르다** — 남이 그 자리를 지우면 이쪽만 버려진다. */
function otherOps(value: string): PatchOp[] {
  return [{ op: 'replace', path: '/root/children/1/props/content', value }]
}

interface Board {
  store: EditorStore
  sockets: FakeSocket[]
  patchOps: ReturnType<typeof vi.fn>
  getPage: ReturnType<typeof vi.fn>
  commit: (value: string) => void
  /** 둘째 노드를 고친다. `commit`과 **경로가 다르다.** */
  commitOther: (value: string) => void
  /** 소켓으로 프레임 하나를 흘려 넣는다. */
  push: (frame: unknown) => void
  /** 지금 소켓이 보낸 `patch` 프레임들. */
  patchFrames: () => Record<string, unknown>[]
}

function mount(options?: { realtime?: boolean }): Board {
  const store = new EditorStore({ nextOpId: (() => {
    let issued = 0
    return () => {
      issued += 1
      return `op_${issued}`
    }
  })() })
  store.loadPage(PAGE_ID, doc(), HEAD_SEQ)

  const sockets: FakeSocket[] = []
  const patchOps = vi.fn()
  const getPage = vi.fn(async () => ({ schema: doc('서버 값'), headSeq: 9 }))
  const client = { patchOps, getPage } as unknown as ApiClient

  const commitRef: { current: ((nodeId: string, value: string) => void) | null } = { current: null }

  function Driver(): ReactElement {
    // **채널을 붙이는 것은 이 훅이다.** 편집 경로가 직접 소켓을 알지 않는다.
    useRealtime(PROJECT_ID)
    const { commitProp } = useEditCommit({ projectId: PROJECT_ID, pageId: PAGE_ID })
    commitRef.current = (nodeId, value) => commitProp(nodeId, 'content', value)
    return <span />
  }

  const tree = (
    <ApiProvider client={client}>
      <EditorStoreProvider store={store}>
        <Driver />
      </EditorStoreProvider>
    </ApiProvider>
  )

  render(
    options?.realtime === false ? (
      tree
    ) : (
      <RealtimeProvider
        setup={{
          holder: createConnectionIdHolder(),
          channel: createEditChannel(),
          origin: 'http://localhost:5173',
          connection: {
            createSocket: () => {
              const socket = new FakeSocket()
              sockets.push(socket)
              return socket
            },
            // 하트비트를 안 건다 — 이 파일은 그것을 재지 않는다(`connection.test.ts`가 잰다).
            schedule: () => 0,
            cancel: () => {},
          },
        }}
      >
        {tree}
      </RealtimeProvider>
    ),
  )

  // 핸드셰이크가 끝나야 채널이 열린다.
  act(() => {
    sockets[0]?.onopen?.()
  })

  return {
    store,
    sockets,
    patchOps,
    getPage,
    commit: (value) => {
      act(() => {
        commitRef.current?.('n_text', value)
      })
    },
    commitOther: (value) => {
      act(() => {
        commitRef.current?.('n_other', value)
      })
    },
    push: (frame) => {
      act(() => {
        sockets.at(-1)?.onmessage?.({ data: JSON.stringify(frame) })
      })
    },
    patchFrames: () =>
      (sockets.at(-1)?.sent ?? [])
        .map((raw) => JSON.parse(raw) as Record<string, unknown>)
        .filter((frame) => frame.type === 'patch'),
  }
}

function ackFrame(clientOpId: string, seq: number): unknown {
  return {
    type: 'patch-ack',
    projectId: PROJECT_ID,
    pageId: PAGE_ID,
    clientOpId,
    seq,
    revisionId: `rev_${seq}`,
    inverse: contentOps('옛 내용'),
    warnings: [],
  }
}

describe('WS가 붙어 있으면 편집이 그리로 나간다', () => {
  it('patch 프레임을 내고 REST는 안 부른다', () => {
    const board = mount()

    board.commit('새 내용')

    expect(board.patchFrames()).toEqual([
      { type: 'patch', pageId: PAGE_ID, baseSeq: HEAD_SEQ, ops: contentOps('새 내용'), clientOpId: 'op_1' },
    ])
    expect(board.patchOps).not.toHaveBeenCalled()
  })

  it('ack를 받으면 pending이 비고 headSeq가 오른다', async () => {
    const board = mount()
    board.commit('새 내용')
    expect(board.store.getState().pending).toHaveLength(1)

    board.push(ackFrame('op_1', HEAD_SEQ + 1))

    await act(async () => {})
    expect(board.store.getState().pending).toEqual([])
    expect(board.store.getState().headSeq).toBe(HEAD_SEQ + 1)
    // 서버가 준 `inverse`가 undo 스택에 그대로 실린다(§7.1).
    expect(board.store.getState().undoStack).toEqual([
      { revisionId: `rev_${HEAD_SEQ + 1}`, inverse: contentOps('옛 내용') },
    ])
  })

  /**
   * **둘째 편집이 첫 ack의 `seq` 위에 선다**(README 4단계). 하나짜리로 재면 `baseSeq`를
   * 고정으로 만들어도 안 죽는다.
   */
  it('다음 편집의 baseSeq가 앞 ack의 seq다', async () => {
    const board = mount()
    board.commit('첫 번째')
    board.push(ackFrame('op_1', HEAD_SEQ + 1))
    await act(async () => {})

    board.commit('두 번째')

    await act(async () => {})
    expect(board.patchFrames().map((frame) => [frame.clientOpId, frame.baseSeq])).toEqual([
      ['op_1', HEAD_SEQ],
      ['op_2', HEAD_SEQ + 1],
    ])
  })

  it('실패 프레임을 받으면 복구 경로가 돈다 — REST와 같은 수습이다', async () => {
    const board = mount()
    board.commit('새 내용')

    board.push({
      type: 'patch-error',
      projectId: PROJECT_ID,
      pageId: PAGE_ID,
      clientOpId: 'op_1',
      status: 409,
      code: 'conflict',
      message: '페이지가 이미 변경되었습니다 (요청 baseSeq 4, 현재 7)',
      issues: [],
    })

    await act(async () => {})
    expect(board.getPage).toHaveBeenCalledWith(PROJECT_ID, PAGE_ID)
    expect(board.store.getState().headSeq).toBe(9)
    expect(board.store.getState().editFailure).toEqual({
      kind: 'message',
      message: '페이지가 이미 변경되었습니다 (요청 baseSeq 4, 현재 7) — 페이지를 서버 상태로 다시 불러왔고, 편집 1개가 취소됐습니다.',
    })
  })

  /**
   * **매달아 두지 않는다.** 연결이 끊기면 그 ack는 영영 안 오므로, 그 자리에서 실패로
   * 끝내야 복구가 돈다 — 안 그러면 펌프가 매달려 **다음 편집도 안 나간다.**
   */
  it('연결이 끊기면 기다리던 편집이 실패로 끝난다', async () => {
    const board = mount()
    board.commit('새 내용')

    act(() => {
      board.sockets[0]?.onclose?.()
    })

    await act(async () => {})
    expect(board.getPage).toHaveBeenCalled()
    expect(board.store.getState().pending).toEqual([])
  })
})

/**
 * **리베이스가 서버에 닿는 길**(P3-2 D3). 스토어 안의 리베이스는
 * `test/store/remote-change.test.ts`가 재고, 여기는 그것이 **전송까지 살아남는지**를 잰다.
 *
 * **이 판이 없으면 리베이스는 이름뿐이다 — 재서 알았다.** 서버는 `baseSeq`가 `head_seq`와
 * 정확히 같을 때만 받으므로, 내 편집이 떠 있는 동안 남의 편집이 기록되면 내 것은 **반드시**
 * 409를 받는다. 그 409를 곧바로 재조회로 넘기면 큐가 통째로 비므로 **방금 리베이스한 편집도
 * 함께 사라진다.**
 *
 * # 두 순서를 다 잰다 (리뷰 F1)
 *
 * 재전송의 조건 셋 중 하나가 *"그 사이 `headSeq`가 움직였다"*이므로, **남의 `page-changed`가
 * 내 `patch-error`보다 먼저 오는지**에 따라 갈래가 갈린다. 앞 판은 **프레임이 먼저 오는
 * 순서만** 밀어 넣었고, 리뷰가 진짜 서버로 재서 **동시에 낸 판에서는 실패가 먼저 온다**는
 * 것을 실증했다(기전: 진 쪽의 실패는 파이프라인 3단계에서 곧바로 나는데, 브로드캐스트는
 * fire-and-forget이고 룸 연결마다 조회 둘을 `await`한다).
 *
 * **두 순서 다 실재하고, 가르는 것은 두 편집 사이의 간격이다.**
 *
 * | 순서 | 언제 | 무엇이 도나 |
 * |---|---|---|
 * | 프레임 먼저 | 간격이 **벌어졌다** — 사람 둘이 편집하는 흔한 판 | 재전송 |
 * | 실패 먼저 | **거의 같은 순간**에 냈다 — 좁은 경합 | 재조회(앞 슬라이스와 같은 수렴) |
 *
 * 아래에 둘 다 둔다. **한쪽만 재면 그 갈래가 안 도는 것을 아무도 모른다.**
 * (간격을 변수로 둔 값은 이월 §2.2에 있다 — 리뷰가 진짜 서버로 쟀다.)
 */
describe('리베이스한 편집을 다시 낸다 (D3)', () => {
  it('프레임이 먼저 오면 새 baseSeq로 다시 낸다', async () => {
    const board = mount()
    board.commit('내 값')

    // 남의 편집이 먼저 기록됐다 — 내 pending이 그 위로 옮겨 앉는다.
    board.push({
      type: 'page-changed',
      projectId: PROJECT_ID,
      pageId: PAGE_ID,
      seq: HEAD_SEQ + 1,
      ops: [{ op: 'add', path: '/root/children/-', value: { id: 'n_theirs', type: 'Text', props: {} } }],
      warnings: [],
      actor: { type: 'user', label: '남' },
    })
    // 그 사이 떠 있던 내 프레임은 낡은 `baseSeq`로 갔으므로 409다.
    board.push({
      type: 'patch-error',
      projectId: PROJECT_ID,
      pageId: PAGE_ID,
      clientOpId: 'op_1',
      status: 409,
      code: 'conflict',
      message: '페이지가 이미 변경되었습니다 (요청 baseSeq 4, 현재 5)',
      issues: [],
    })

    await act(async () => {})
    expect(board.patchFrames().map((frame) => [frame.clientOpId, frame.baseSeq])).toEqual([
      ['op_1', HEAD_SEQ],
      ['op_1', HEAD_SEQ + 1],
    ])
    // **재조회로 가지 않았다** — 그쪽으로 가면 이 편집이 버려진다.
    expect(board.getPage).not.toHaveBeenCalled()
  })

  it('다시 낸 것이 ack되면 내 편집이 남의 편집 위에 저장된다', async () => {
    const board = mount()
    board.commit('내 값')
    board.push({
      type: 'page-changed',
      projectId: PROJECT_ID,
      pageId: PAGE_ID,
      seq: HEAD_SEQ + 1,
      ops: [{ op: 'add', path: '/root/children/-', value: { id: 'n_theirs', type: 'Text', props: {} } }],
      warnings: [],
      actor: { type: 'user', label: '남' },
    })
    board.push({
      type: 'patch-error',
      projectId: PROJECT_ID,
      pageId: PAGE_ID,
      clientOpId: 'op_1',
      status: 409,
      code: 'conflict',
      message: '페이지가 이미 변경되었습니다 (요청 baseSeq 4, 현재 5)',
      issues: [],
    })
    await act(async () => {})

    board.push(ackFrame('op_1', HEAD_SEQ + 2))

    await act(async () => {})
    expect(board.store.getState().pending).toEqual([])
    expect(board.store.getState().headSeq).toBe(HEAD_SEQ + 2)
    expect(board.store.getState().editFailure).toBeNull()
    // 남의 노드와 내 값이 함께 남는다.
    const children = board.store.getState().document?.root.children ?? []
    expect(children.map((node) => node.id)).toEqual(['n_text', 'n_other', 'n_theirs'])
    expect(children[0]?.props).toEqual({ content: '내 값' })
  })

  /**
   * **음성 대조.** 그 사이 아무 revision도 기록되지 않았으면 다시 내도 같은 `baseSeq`다 —
   * 그때는 재조회로 간다. 이것이 없으면 위 판이 *"409는 항상 다시 낸다"*로도 통과하고,
   * 그 구현은 **고쳐지지 않는 실패에 무한히 왕복한다.**
   */
  it('headSeq가 안 움직였으면 다시 내지 않고 재조회로 간다', async () => {
    const board = mount()
    board.commit('내 값')

    board.push({
      type: 'patch-error',
      projectId: PROJECT_ID,
      pageId: PAGE_ID,
      clientOpId: 'op_1',
      status: 409,
      code: 'conflict',
      message: '편집을 적용할 수 없습니다: 바꿀 값을 찾을 수 없습니다: /root/children/0',
      issues: [],
    })

    await act(async () => {})
    expect(board.patchFrames()).toHaveLength(1)
    expect(board.getPage).toHaveBeenCalledTimes(1)
  })

  /**
   * **실제 서버에서 흔한 순서다 — 실패가 먼저 온다**(리뷰 F1이 진짜 서버로 실증했다).
   *
   * 둘이 **거의 같은 순간에** 내면 진 쪽의 실패는 파이프라인 3단계에서 곧바로 나오는데,
   * 이긴 쪽의 브로드캐스트는 fire-and-forget이고 룸 연결마다 조회 둘을 `await`한다. 즉
   * 그 좁은 창에서는 **구조적으로 실패가 먼저다.** 그때는 409를 처리하는 시점에 `headSeq`가
   * 아직 안 움직였으므로 재전송의 조건 셋째가 거짓이고, **앞 슬라이스와 같은 재조회로
   * 떨어진다.**
   *
   * **덜 좋아질 뿐 틀리지 않는다** — 문서는 서버 것으로 놓이고 사용자는 취소 사실을 듣는다.
   * 이 케이스가 그 사실을 고정한다: **재전송이 두 순서 중 하나에서만 돈다는 것을 아무도 모른
   * 채로 두지 않는다.**
   */
  it('실패가 먼저 오면 재조회로 간다 — 동시에 낸 판의 순서다', async () => {
    const board = mount()
    board.commit('내 값')

    // 실패가 먼저다. 이 시점에 `headSeq`는 아직 안 움직였다.
    board.push({
      type: 'patch-error',
      projectId: PROJECT_ID,
      pageId: PAGE_ID,
      clientOpId: 'op_1',
      status: 409,
      code: 'conflict',
      message: '페이지가 이미 변경되었습니다 (요청 baseSeq 4, 현재 5)',
      issues: [],
    })
    await act(async () => {})
    // 남의 프레임은 그 뒤에 온다 — 큐는 이미 비었다.
    board.push({
      type: 'page-changed',
      projectId: PROJECT_ID,
      pageId: PAGE_ID,
      seq: HEAD_SEQ + 1,
      ops: [{ op: 'add', path: '/root/children/-', value: { id: 'n_theirs', type: 'Text', props: {} } }],
      warnings: [],
      actor: { type: 'user', label: '남' },
    })

    await act(async () => {})
    // **다시 내지 않았다.** 프레임은 처음 하나뿐이다.
    expect(board.patchFrames()).toHaveLength(1)
    expect(board.getPage).toHaveBeenCalledWith(PROJECT_ID, PAGE_ID)
    const failure = board.store.getState().editFailure
    expect(failure?.kind === 'message' ? failure.message : '').toContain('편집 1개가 취소됐습니다')
  })

  /**
   * **버려진 편집의 실패가 뒤에 선 편집으로 넘어가지 않는다**(리뷰 변이 N3).
   *
   * 재전송 조건에 *"큐의 머리가 여전히 이 편집"*이 있는 이유다. 리베이스가 머리를 버리면
   * 그 자리에 **다른 편집**이 올라오는데, 그때 앞 편집의 409로 재전송하면 **버려진 편집의
   * 실패가 조용히 삼켜지고 엉뚱한 편집이 대신 나간다.**
   *
   * 판을 만들려면 pending이 둘이고 **남이 그중 하나의 자리만 지워야** 한다 — 하나뿐이면
   * 큐가 통째로 비어 그 조건이 관측되지 않는다.
   */
  it('리베이스가 버린 편집의 409로 뒤에 선 편집을 내지 않는다', async () => {
    const board = mount()
    // op_1은 둘째 노드를, op_2는 첫째 노드를 고친다.
    board.commitOther('버려질 값')
    board.commit('살아남을 값')
    expect(board.store.getState().pending.map((edit) => edit.clientOpId)).toEqual(['op_1', 'op_2'])

    // 남이 둘째 노드를 지운다 — op_1만 얹히지 않는다.
    board.push({
      type: 'page-changed',
      projectId: PROJECT_ID,
      pageId: PAGE_ID,
      seq: HEAD_SEQ + 1,
      ops: [{ op: 'remove', path: '/root/children/1' }],
      warnings: [],
      actor: { type: 'user', label: '남' },
    })
    expect(board.store.getState().pending.map((edit) => edit.clientOpId)).toEqual(['op_2'])

    // 그 뒤 op_1의 409가 온다. 큐의 머리는 이제 op_2다.
    board.push({
      type: 'patch-error',
      projectId: PROJECT_ID,
      pageId: PAGE_ID,
      clientOpId: 'op_1',
      status: 409,
      code: 'conflict',
      message: '페이지가 이미 변경되었습니다 (요청 baseSeq 4, 현재 5)',
      issues: [],
    })

    await act(async () => {})
    // op_2가 그 실패를 타고 나가지 않았다 — 프레임은 처음 하나뿐이다.
    expect(board.patchFrames()).toHaveLength(1)
    // 실패는 삼켜지지 않고 복구 경로로 갔다.
    expect(board.getPage).toHaveBeenCalledWith(PROJECT_ID, PAGE_ID)
  })
})

describe('WS가 없으면 REST로 나간다 (D5)', () => {
  it('Provider가 없으면 patchOps를 부른다 — 음성 대조', () => {
    const board = mount({ realtime: false })

    board.commit('새 내용')

    expect(board.patchOps).toHaveBeenCalledWith(PROJECT_ID, PAGE_ID, {
      clientOpId: 'op_1',
      ops: contentOps('새 내용'),
      baseSeq: HEAD_SEQ,
    })
  })

  it('연결이 끊겨 있으면 REST로 돌아간다 — 편집이 멈추지 않는다', async () => {
    const board = mount()
    act(() => {
      board.sockets[0]?.onclose?.()
    })

    board.commit('새 내용')

    expect(board.patchOps).toHaveBeenCalledTimes(1)
    expect(board.patchFrames()).toEqual([])
  })
})
