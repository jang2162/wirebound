/**
 * **편집이 어느 길로 나가는가**(설계서 「정방향 흐름」). 소켓은 가짜다 — 이 파일이 재는 것은
 * 네트워크가 아니라 **배선**이고, 진짜 프레임을 서버가 받는 것은 `apps/api`의
 * `ws-patch.test.ts`가 잰다.
 *
 * # 두 경로가 함께 서 있다
 *
 * WS가 붙어 있으면 그리로, 없으면 REST로 나간다. **REST를 지우지 않는 것은 설계서 「LLM 편집 경로」 때문이다** —
 * MCP의 `patch_page`는 REST로 들어오고, `RealtimeProvider` 없이 도는 화면도 그쪽을 지난다.
 * 그래서 **두 판을 나란히 잰다**: 한쪽만 재면 *"항상 그 길로 간다"*와 구분되지 않는다.
 */
import { act, render } from '@testing-library/react'
import { CURRENT_DOCUMENT_VERSION, type PageDocument, type PatchOp } from '@wirebound/schema'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import { ApiProvider } from '../../src/api/context'
import { useEditCommit } from '../../src/edit/use-edit-commit'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { RealtimeProvider, createConnectionIdHolder } from '../../src/realtime/context'
import { createEditChannel, EditNotSentError } from '../../src/realtime/edit-channel'
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
    // 서버가 준 `inverse`가 undo 스택에 그대로 실린다(설계서 「정방향 흐름」).
    expect(board.store.getState().undoStack).toEqual([
      { revisionId: `rev_${HEAD_SEQ + 1}`, inverse: contentOps('옛 내용') },
    ])
  })

  /**
   * **둘째 편집이 첫 ack의 `seq` 위에 선다**(`apps/api/README.md` 「편집 파이프라인」 절). 하나짜리로 재면 `baseSeq`를
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
    // 수습의 다시 받기는 떠나면 끊을 신호를 싣는다(`use-edit-commit.tsx`의 `recover`).
    expect(board.getPage).toHaveBeenCalledWith(PROJECT_ID, PAGE_ID, { cancel: expect.any(AbortSignal) })
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
 * **리베이스가 서버에 닿는 길.** 스토어 안의 리베이스는
 * `test/store/remote-change.test.ts`가 재고, 여기는 그것이 **전송까지 살아남는지**를 잰다.
 *
 * **이 판이 없으면 리베이스는 이름뿐이다.** 서버는 `baseSeq`가 `head_seq`와
 * 정확히 같을 때만 받으므로, 내 편집이 떠 있는 동안 남의 편집이 기록되면 내 것은 **반드시**
 * 409를 받는다. 그 409를 곧바로 재조회로 넘기면 큐가 통째로 비므로 **방금 리베이스한 편집도
 * 함께 사라진다.**
 *
 * # 두 순서를 다 잰다
 *
 * 재전송의 조건 셋 중 하나가 *"그 사이 `headSeq`가 움직였다"*이므로, **남의 `page-changed`가
 * 내 `patch-error`보다 먼저 오는지**에 따라 갈래가 갈린다. 진짜 서버로 재면 거의 늘 프레임이 먼저다(동시에 내도).
 * 실패가 먼저 오는 판은 좁지만 구조상 막히지 않는다 — 간격별 값 · 기전 · 다시 재는 법은 `src/edit/use-edit-commit.tsx`의
 * 재전송 주석(«이 갈래는 프레임이 실패보다 먼저 올 때만 돈다»)이 갖는다.
 *
 * | 순서 | 무엇이 도나 |
 * |---|---|
 * | 프레임 먼저 | 재전송 |
 * | 실패 먼저 | 재조회(다른 실패와 같은 수렴) |
 *
 * 아래에 둘 다 둔다. **한쪽만 재면 그 갈래가 안 도는 것을 아무도 모른다.**
 */
describe('리베이스한 편집을 다시 낸다', () => {
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

  /**
   * **잠금 충돌은 다시 내지 않는다 — 잠금 충돌의 상태 코드를 409와 가르는 이유가 이것이다.**
   *
   * 판은 위 케이스와 **글자 하나만 다르다**: 남의 프레임이 먼저 오고 그 뒤에 내 실패가
   * 온다. 그 순서가 흔한 쪽이다(`use-edit-commit.tsx` 재전송 주석의 값). 잠금 충돌이 **409**라면 재전송 조건 셋이
   * 다 참이 되어 **한 번 더 나가고**, 그 사이 잠금이 풀렸다면 성공한다 — **사용자는 자기가
   * 막혔다는 것을 모른 채 남의 잠금 구역을 편집한 것**이 된다.
   *
   * `423`이면(설계서 「소프트 잠금」의 `locked`) 조건의 첫째(`status === 409`)에서 갈라져
   * 재조회로 간다.
   */
  it('잠금 충돌은 조건이 다 맞아도 다시 내지 않는다 (D1)', async () => {
    const board = mount()
    board.commit('내 값')

    // 조건 둘째·셋째를 참으로 만든다 — 큐의 머리가 여전히 이 편집이고 headSeq가 움직였다.
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
      status: 423,
      code: 'locked',
      message: '보라님이 편집 중인 영역입니다',
      issues: [],
    })

    await act(async () => {})
    // **한 번만 나갔다.** 409라면 여기 둘이 있다(바로 위 케이스가 그것을 잰다).
    expect(board.patchFrames().map((frame) => [frame.clientOpId, frame.baseSeq])).toEqual([['op_1', HEAD_SEQ]])
    // 재조회로 수렴하고, 사용자는 서버가 준 이유를 그대로 듣는다.
    expect(board.getPage).toHaveBeenCalled()
    expect(board.store.getState().editFailure?.kind).toBe('message')
    expect(
      board.store.getState().editFailure?.kind === 'message' ? board.store.getState().editFailure : null,
    ).toMatchObject({ message: expect.stringContaining('보라님이 편집 중인 영역입니다') })
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
   * **드문 순서다 — 실패가 먼저 온다.**
   *
   * 진 쪽의 요청이 이긴 쪽의 커밋 뒤 · 방송 전에 닿으면(방송은 룸 연결마다 조회를 `await`한다) 실패가 먼저 온다
   * (재 보면 좁은 판이다 — `use-edit-commit.tsx` 재전송 주석의 값). 그때는 409를 처리하는 시점에 `headSeq`가
   * 아직 안 움직였으므로 재전송의 조건 셋째가 거짓이고, **다른 실패와 같은 재조회로
   * 떨어진다.**
   *
   * **덜 좋아질 뿐 틀리지 않는다** — 문서는 서버 것으로 놓이고 사용자는 취소 사실을 듣는다.
   * 이 케이스가 그 사실을 고정한다: **재전송이 두 순서 중 하나에서만 돈다는 것을 아무도 모른
   * 채로 두지 않는다.**
   */
  it('실패가 먼저 오면 재조회로 간다 — 드문 순서도 틀리지 않는다', async () => {
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
    // 수습의 다시 받기는 떠나면 끊을 신호를 싣는다(`use-edit-commit.tsx`의 `recover`).
    expect(board.getPage).toHaveBeenCalledWith(PROJECT_ID, PAGE_ID, { cancel: expect.any(AbortSignal) })
    const failure = board.store.getState().editFailure
    expect(failure?.kind === 'message' ? failure.message : '').toContain('편집 1개가 취소됐습니다')
  })

  /**
   * **버려진 편집의 실패가 뒤에 선 편집으로 넘어가지 않는다.**
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
    // 수습의 다시 받기는 떠나면 끊을 신호를 싣는다(`use-edit-commit.tsx`의 `recover`).
    expect(board.getPage).toHaveBeenCalledWith(PROJECT_ID, PAGE_ID, { cancel: expect.any(AbortSignal) })
  })
})

describe('WS가 없으면 REST로 나간다', () => {
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

/**
 * **결과를 모르는 실패는 «취소됐다»고 하지 않는다**(`edit/use-edit-commit.tsx`의 `unknownNotice`). 판정은 쓰기 장부의
 * «모름»과 같은 함수 하나다(`api/failure.tsx`의 `refusedBeforeCommit`). Chrome 에서 잰 고장 방식: 행 잠금으로 편집을
 * 서버에 붙잡은 채 소켓만 RST 로 끊으면 서버는 그것을 커밋하는데 화면은 «편집 1개가 취소됐습니다» 였다.
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 판정을 지운다(늘 «취소») | 끊김 둘 · REST 표의 «모름» 넷 |
 * | 판정을 뒤집는다(늘 «모름») | REST 표의 «안 됨» 둘 · 나가지 못한 편집 · 409 를 재는 앞 케이스 셋 |
 * | `EditNotSentError`를 «모름»으로 | 나가지 못한 편집 **혼자** |
 * | 안 보낸 편집이 0 이어도 꼬리를 붙인다 | 첫 끊김 · REST 표의 «모름» 넷 |
 * | 안 보낸 편집이 1 이면 꼬리를 안 붙인다 | 둘째 끊김 **혼자** |
 * | 끊김을 «답을 못 받았다»가 아닌 실패로 끝낸다(`edit-channel.ts`의 `failAll`) | 끊김 둘 · `test/realtime/edit-channel.test.ts`의 둘 |
 * | 실시간이 닫혀 있어도 «곧 화면에 나타납니다»(`unknownNotice`의 `live`를 늘 참으로) | 끊김 둘 · REST 표의 «모름» 넷 |
 */
describe('결과를 모르는 실패는 «취소됐다»고 하지 않는다', () => {
  /**
   * 이 표의 판은 전부 **실시간이 열려 있지 않은 채** 문장을 낸다 — 끊김은 소켓이 닫힌 채고, REST 는 Provider 가 없다. 그때
   * 뒤늦은 커밋은 화면에 저절로 서지 않으므로 «곧 화면에 나타납니다»가 거짓이다(`unknownNotice`의 `live`). 열려 있는 판의
   * 문장은 `test/edit/reconnect-resync.test.tsx`의 «답을 기다리던 편집은 반영됐는지 모른다고 말한다»가 잰다.
   */
  const RELOADED =
    '페이지를 서버 상태로 다시 불러왔지만 실시간 연결이 열려 있지 않아, 그 뒤에 반영되면 화면에 나타나지 않을 수 있습니다. ' +
    '새로고침해 서버 상태를 확인하세요.'

  it('답을 기다리던 편집의 연결이 끊기면 «반영됐는지 모른다» — 안 보낸 것이 없으면 «취소»가 없다', async () => {
    const board = mount()
    board.commit('새 내용')

    act(() => {
      board.sockets[0]?.onclose?.()
    })
    await act(async () => {})

    expect(board.store.getState().editFailure).toEqual({
      kind: 'message',
      message: `실시간 연결이 끊겨 보낸 편집의 답을 받지 못했습니다 — 서버에 반영됐는지 알 수 없습니다. ${RELOADED}`,
    })
  })

  it('안 보낸 편집은 따로 세어 «취소됐다»고 말한다 — 그것만 이 탭이 버렸다', async () => {
    const board = mount()
    board.commit('새 내용')
    // 둘째는 첫째의 답을 기다리며 큐에 선다(in-flight 는 하나) — 서버에 안 닿았다.
    board.commitOther('둘째 값')
    expect(board.patchFrames()).toHaveLength(1)

    act(() => {
      board.sockets[0]?.onclose?.()
    })
    await act(async () => {})

    expect(board.store.getState().editFailure).toEqual({
      kind: 'message',
      message:
        `실시간 연결이 끊겨 보낸 편집의 답을 받지 못했습니다 — 서버에 반영됐는지 알 수 없습니다. ${RELOADED}` +
        ' 아직 보내지 않은 편집 1개는 취소됐습니다.',
    })
  })

  /**
   * REST 의 실패를 판정의 줄마다 — «안 됨»(4xx · api 가 낸 500)과 «모름»(연결 실패 · 봉투 없는 500 · 502 · 503)이 갈린다.
   * 줄의 까닭은 `panels/comment-panel.tsx`의 `knownRejection` 표(첫 보내기 칸)가 소유한다.
   */
  it.each([
    { label: '연결 실패', error: new ApiError(0, 'internal', '서버에 연결하지 못했습니다'), unknown: true },
    { label: '봉투 없는 500(개발 프록시)', error: new ApiError(500, 'internal', '서버 오류'), unknown: true },
    { label: '502', error: new ApiError(502, 'internal', '서버 오류'), unknown: true },
    {
      label: '봉투 503(DB 유실)',
      error: new ApiError(503, 'internal', '데이터베이스와의 연결이 끊겨 요청이 반영됐는지 알 수 없습니다', [], true),
      unknown: true,
    },
    { label: '봉투 500', error: new ApiError(500, 'internal', '서버 오류가 발생했습니다', [], true), unknown: false },
    { label: '409', error: new ApiError(409, 'conflict', '페이지가 이미 변경되었습니다', [], true), unknown: false },
  ])('REST $label — «모름» $unknown', async ({ error, unknown }) => {
    const board = mount({ realtime: false })
    board.patchOps.mockRejectedValueOnce(error)

    board.commit('새 내용')
    await act(async () => {})

    const failure = board.store.getState().editFailure
    const message = failure?.kind === 'message' ? failure.message : ''
    if (unknown) {
      expect(message).toBe(`보낸 편집의 답을 받지 못했습니다 — 서버에 반영됐는지 알 수 없습니다. ${RELOADED}`)
    } else {
      expect(message).toBe(`${error.message} — 페이지를 서버 상태로 다시 불러왔고, 편집 1개가 취소됐습니다.`)
    }
  })

  /**
   * **나가지 못한 편집은 «안 됐다»다** — 프레임이 서버로 안 갔다(`EditNotSentError`). 전송이 이것을 내는 것은 `ready()`를 본
   * 뒤 소켓이 닫힌 좁은 창이라, 여기서는 그 값을 전송이 곧바로 내게 해 판정만 잰다.
   */
  it('나가지 못한 편집은 «취소됐다»가 참이다', async () => {
    const board = mount({ realtime: false })
    board.patchOps.mockRejectedValueOnce(new EditNotSentError())

    board.commit('새 내용')
    await act(async () => {})

    expect(board.store.getState().editFailure).toEqual({
      kind: 'message',
      message: '편집을 저장하지 못했습니다 — 페이지를 서버 상태로 다시 불러왔고, 편집 1개가 취소됐습니다.',
    })
  })
})
