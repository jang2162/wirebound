/**
 * **프레임이 스토어에 닿는가.** 소켓은 가짜다 — 이 파일이 재는 것은 네트워크가
 * 아니라 **배선**이고, jsdom에서 진짜 `WebSocket`을 열면 재연결 타이머만 남는다.
 *
 * 여기가 재지 않는 것: 서버가 그 프레임을 실제로 보낸다는 사실(`apps/api`의
 * `ws-broadcast.test.ts`가 잰다)과, 얹기·미루기의 갈래(`test/store/remote-change.test.ts`).
 * 이 파일은 **그 둘 사이를 잇는 줄**만 본다.
 */
import { act, render, screen } from '@testing-library/react'
import { CURRENT_DOCUMENT_VERSION, type PageDocument } from '@wirebound/schema'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { RealtimeProvider, createConnectionIdHolder, type ConnectionIdHolder } from '../../src/realtime/context'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { useRealtime } from '../../src/realtime/use-realtime'
import { RemoteAlert } from '../../src/shell/remote-alert'
import { EditorStore } from '../../src/store/editor-store'
import { EditorStoreProvider } from '../../src/store/use-editor-store'

class FakeSocket implements RealtimeSocket {
  onopen: (() => void) | null = null

  onmessage: ((event: { data: unknown }) => void) | null = null

  onclose: (() => void) | null = null

  onerror: (() => void) | null = null

  readonly sent: string[] = []

  closed = false

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.closed = true
    this.onclose?.()
  }
}

function doc(): PageDocument {
  return { version: CURRENT_DOCUMENT_VERSION, root: { id: 'n_root', type: 'Container', children: [] } }
}

interface Board {
  store: EditorStore
  holder: ConnectionIdHolder
  sockets: FakeSocket[]
  unmount: () => void
  push: (frame: unknown) => void
}

function mount(options?: { projectId?: string; withProvider?: boolean }): Board {
  const store = new EditorStore()
  store.loadPage('page_1', doc(), 4)
  const holder = createConnectionIdHolder()
  const sockets: FakeSocket[] = []

  function Screen(): ReactElement {
    useRealtime(options?.projectId ?? 'project_1')
    return <RemoteAlert />
  }

  const tree = (
    <EditorStoreProvider store={store}>
      <Screen />
    </EditorStoreProvider>
  )

  const { unmount } = render(
    options?.withProvider === false ? (
      tree
    ) : (
      <RealtimeProvider
        setup={{
          holder,
          origin: 'http://localhost:5173',
          connection: {
            createSocket: () => {
              const socket = new FakeSocket()
              sockets.push(socket)
              return socket
            },
            // 타이머를 아예 안 걸리게 한다 — 이 파일은 하트비트를 재지 않는다
            // (`connection.test.ts`가 잰다). 걸리면 테스트가 끝난 뒤 타이머가 남는다.
            schedule: () => 0,
            cancel: () => {},
          },
        }}
      >
        {tree}
      </RealtimeProvider>
    ),
  )

  // **`act`로 감싼다.** 프레임은 React 밖에서 오므로, 감싸지 않으면 스토어는 바뀌었는데
  // 화면이 아직 그 커밋을 안 한 상태에서 단언하게 된다(실측: `role="status"`를 못 찾는다).
  const push = (frame: unknown): void => {
    act(() => {
      sockets[0]?.onmessage?.({ data: JSON.stringify(frame) })
    })
  }

  return { store, holder, sockets, unmount, push }
}

const PAGE_CHANGED = {
  type: 'page-changed',
  projectId: 'project_1',
  pageId: 'page_1',
  seq: 5,
  ops: [{ op: 'add', path: '/root/children/-', value: { id: 'n_remote', type: 'Container' } }],
  warnings: [],
  actor: { type: 'user', label: '홍길동' },
}

describe('붙는 자리', () => {
  it('Provider가 있으면 룸에 붙는다 — 주소가 프로젝트를 가리킨다', () => {
    const board = mount()

    expect(board.sockets).toHaveLength(1)
  })

  it('Provider가 없으면 아무것도 안 붙는다 — 기존 화면 테스트가 소켓을 열지 않는 이유다', () => {
    const board = mount({ withProvider: false })

    expect(board.sockets).toHaveLength(0)
  })

  it('화면을 떠나면 닫는다 — 프로젝트를 옮길 때마다 쌓이지 않는다', () => {
    const board = mount()

    board.unmount()

    expect(board.sockets[0]?.closed).toBe(true)
  })
})

describe('프레임이 스토어에 닿는다', () => {
  it('joined의 연결 id를 홀더에 넣는다 — 편집 요청이 그것을 싣는다', () => {
    const board = mount()

    board.push({ type: 'joined', projectId: 'project_1', connectionId: 'wsc_9', userId: 'u1', role: 'owner' })

    expect(board.holder.get()).toBe('wsc_9')
  })

  it('연결이 끊기면 홀더를 비운다 — 낡은 id를 계속 싣지 않는다', () => {
    const board = mount()
    board.push({ type: 'joined', projectId: 'project_1', connectionId: 'wsc_9', userId: 'u1', role: 'owner' })

    act(() => {
      board.sockets[0]!.onclose?.()
    })

    expect(board.holder.get()).toBeUndefined()
  })

  it('page-changed를 문서에 얹는다', () => {
    const board = mount()

    board.push(PAGE_CHANGED)

    expect(board.store.getState().headSeq).toBe(5)
    expect(board.store.getState().document?.root.children?.map((node) => node.id)).toEqual(['n_remote'])
  })

  it('restored는 판이 갈렸다고 말한다 — 얹지 않는다', () => {
    const board = mount()

    board.push({
      type: 'restored',
      projectId: 'project_1',
      snapshotId: 's1',
      actor: { type: 'user', label: '홍길동' },
    })

    expect(board.store.getState().headSeq).toBe(4)
    expect(screen.getByRole('status').textContent).toContain('스냅샷을 복원')
  })

  /**
   * ***"보내지 않은 편집이 있으면 미루고 낡았다고 말한다"*가 아니다** — 남의 편집 위로 내
   * pending을 리베이스하므로 **미루지 않고, 말할 낡음이 없다.** 갈래 자체는 `test/store/remote-change.test.ts`가
   * 재고, 여기는 그것이 **화면까지** 닿는 것을 잰다.
   */
  it('pending이 있어도 얹고 아무 말도 안 한다 — 미루던 자리다', () => {
    const board = mount()
    act(() => {
      board.store.applyEdit([{ op: 'add', path: '/root/children/-', value: { id: 'n_mine', type: 'Container' } }])
    })

    board.push(PAGE_CHANGED)

    expect(board.store.getState().document?.root.children?.map((node) => node.id)).toEqual(['n_remote', 'n_mine'])
    expect(screen.queryByRole('status')).toBeNull()
  })

  /**
   * **버린 편집은 말한다**(설계서 「개인 undo/redo」의 *"적용 불가"*와 같은 성질 — 스토어는 무엇이 버려졌는지만
   * 돌려주고 문안은 이 훅이 만든다). 조용히 버리면 사용자가 친 값이 말없이 사라진다.
   */
  it('리베이스가 버린 편집을 통지에 싣는다', () => {
    const board = mount()
    act(() => {
      board.store.applyEdit([{ op: 'add', path: '/root/children/-', value: { id: 'n_mine', type: 'Container' } }])
    })
    // 내 편집이 선 자리를 남이 지운 판을 만든다 — 먼저 노드 하나를 두고, 그것을 가리키는
    // 내 편집을 낸 뒤, 남이 그것을 지운다.
    act(() => {
      board.store.loadPage(
        'page_1',
        { version: CURRENT_DOCUMENT_VERSION, root: { id: 'n_root', type: 'Container', children: [{ id: 'n_a', type: 'Container' }] } },
        4,
      )
      board.store.applyEdit([{ op: 'replace', path: '/root/children/0/type', value: 'Text' }])
    })

    board.push({ ...PAGE_CHANGED, ops: [{ op: 'remove', path: '/root/children/0' }] })

    expect(board.store.getState().editFailure).toEqual({
      kind: 'message',
      message: '다른 사람의 변경과 겹쳐 아직 저장되지 않은 편집 1개를 버렸습니다.',
    })
  })

  /**
   * **자기 편집이 되돌아온 판이다.** 편집이 REST로 나가는 동안 소켓이 열려 룸에 들어오면
   * 서버가 발신자를 제외하지 못해 그 프레임을 낸 사람이 받는다. **리베이스는 그것을 바탕에
   * 얹고 내 pending을 그 위에 다시 올리므로 같은 편집이 두 번 들어간다.**
   */
  it('내 pending의 clientOpId가 실린 프레임은 두 번 얹지 않는다', () => {
    const board = mount()
    let opId: string | null = null
    act(() => {
      opId = board.store.applyEdit([
        { op: 'add', path: '/root/children/-', value: { id: 'n_mine', type: 'Container' } },
      ])
    })

    board.push({
      ...PAGE_CHANGED,
      ops: [{ op: 'add', path: '/root/children/-', value: { id: 'n_mine', type: 'Container' } }],
      clientOpId: opId,
    })

    expect(board.store.getState().document?.root.children?.map((node) => node.id)).toEqual(['n_mine'])
    expect(board.store.getState().headSeq).toBe(4)
  })

  it('버릴 것이 없으면 통지도 없다 — 음성 대조', () => {
    const board = mount()
    act(() => {
      board.store.applyEdit([{ op: 'add', path: '/root/children/-', value: { id: 'n_mine', type: 'Container' } }])
    })

    board.push(PAGE_CHANGED)

    expect(board.store.getState().editFailure).toBeNull()
  })

  /**
   * **프레임을 놓친 갈래가 화면까지 닿는지 본다.** 스토어 갈래는
   * `test/store/remote-change.test.ts`가 재고, 여기는 그 갈래가 **문장이 되는 것**을 잰다 —
   * `RemoteAlert`의 `NOTICE`에 갈래를 안 더하면 컴파일이 막히지만, **엉뚱한 문장을 붙이는
   * 것은 컴파일이 안 막는다.**
   */
  it('프레임을 놓치면 놓쳤다고 말한다 — 갈라진 것과 다른 문장이다', () => {
    const board = mount()

    board.push({ ...PAGE_CHANGED, seq: 7 })

    expect(board.store.getState().headSeq).toBe(4)
    expect(screen.getByRole('status').textContent).toContain('놓쳐')
  })

  /**
   * **끊긴 적이 없는데 끊겼다고 말하지 않는다.** 복원 프레임 뒤에 오는 첫
   * 편집 프레임은 복원이 `head_seq`를 밀어 올렸으므로 **당연히** 내 다음 번호가 아니다 —
   * 그것을 갭으로 읽으면 화면이 *"연결이 끊긴 사이의 변경을 놓쳐"*라고 말한다. 화면이
   * 겪지 않은 실패를 말하는 부류다.
   */
  it('복원 뒤 첫 편집 프레임이 와도 복원했다고 말한다 — 끊겼다고 말하지 않는다', () => {
    const board = mount()

    board.push({
      type: 'restored',
      projectId: 'project_1',
      snapshotId: 's1',
      actor: { type: 'user', label: '홍길동' },
    })
    board.push({ ...PAGE_CHANGED, seq: 9 })

    const notice = screen.getByRole('status').textContent
    expect(notice).toContain('스냅샷을 복원')
    expect(notice).not.toContain('끊긴')
  })

  it('얹히면 아무 말도 안 한다 — 음성 대조', () => {
    const board = mount()

    board.push(PAGE_CHANGED)

    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('RemoteAlert', () => {
  it('낡지 않았으면 아무것도 안 그린다', () => {
    const store = new EditorStore()
    render(
      <EditorStoreProvider store={store}>
        <RemoteAlert />
      </EditorStoreProvider>,
    )

    expect(screen.queryByRole('status')).toBeNull()
  })

  it('갈래마다 다른 문장을 낸다 — 사용자가 할 일이 다르다', () => {
    const store = new EditorStore()
    store.loadPage('page_1', doc(), 4)
    render(
      <EditorStoreProvider store={store}>
        <RemoteAlert />
      </EditorStoreProvider>,
    )

    act(() => {
      store.applyRemoteChange('page_1', {
        seq: 5,
        ops: [{ op: 'replace', path: '/root/children/9/type', value: 'Text' }],
        warnings: [],
      })
    })

    expect(screen.getByRole('status').textContent).toContain('새로고침하면 맞춰집니다')
  })
})
