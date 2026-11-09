/**
 * **소켓이 코멘트 목록의 다시 읽기 신호를 내는가**(`realtime/use-realtime.ts` → `realtime/comment-signals.ts`). 소켓은 가짜다 — 이 파일은 배선만
 * 본다. 신호를 받은 목록이 실제로 다시 읽어 서는지는 실브라우저 판(`build-test/comment-live.test.ts`)이 잰다.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | `comments-changed` | 그 프레임이 그 페이지의 신호를 안 낸다 · 페이지가 없는 프레임이 신호를 낸다 |
 * | `page-stale` | 늦게 커밋된 쓰기의 신호가 목록에 안 간다 |
 * | 다시 붙음 | 끊겼다 다시 붙은 연결이 «어느 페이지든» 신호를 안 낸다 · 첫 연결이 낸다 |
 */
import { act, render } from '@testing-library/react'
import { CURRENT_DOCUMENT_VERSION } from '@wirebound/schema'
import type { ReactElement } from 'react'
import { describe, expect, it } from 'vitest'
import { createCommentSignals } from '../../src/realtime/comment-signals'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { RealtimeProvider, createConnectionIdHolder } from '../../src/realtime/context'
import { useRealtime } from '../../src/realtime/use-realtime'
import { EditorStore } from '../../src/store/editor-store'
import { EditorStoreProvider } from '../../src/store/use-editor-store'

class FakeSocket implements RealtimeSocket {
  onopen: (() => void) | null = null

  onmessage: ((event: { data: unknown }) => void) | null = null

  onclose: (() => void) | null = null

  onerror: (() => void) | null = null

  send(): void {}

  close(): void {
    this.onclose?.()
  }
}

interface Board {
  /** 받은 신호의 `pageId` 차례 — «어느 페이지든» 은 `'*'`. */
  heard: string[]
  sockets: FakeSocket[]
  push(frame: unknown): void
  open(index: number): void
  /** 그 소켓을 끊고 재연결 예약을 돌려 다음 소켓을 만든다. */
  drop(index: number): void
}

function mount(): Board {
  const store = new EditorStore()
  store.loadPage('page_1', { version: CURRENT_DOCUMENT_VERSION, root: { id: 'n_root', type: 'Container', children: [] } }, 4)
  const sockets: FakeSocket[] = []
  const scheduled: (() => void)[] = []
  const comments = createCommentSignals()
  const heard: string[] = []
  comments.subscribe((pageId) => heard.push(pageId ?? '*'))

  function Screen(): ReactElement | null {
    useRealtime('project_1')
    return null
  }

  render(
    <RealtimeProvider
      setup={{
        holder: createConnectionIdHolder(),
        comments,
        origin: 'http://localhost:5173',
        connection: {
          createSocket: () => {
            const socket = new FakeSocket()
            sockets.push(socket)
            return socket
          },
          schedule: (run) => {
            scheduled.push(run)
            return scheduled.length
          },
          cancel: () => {},
        },
      }}
    >
      <EditorStoreProvider store={store}>
        <Screen />
      </EditorStoreProvider>
    </RealtimeProvider>,
  )

  return {
    heard,
    sockets,
    push: (frame) =>
      act(() => {
        sockets.at(-1)?.onmessage?.({ data: JSON.stringify(frame) })
      }),
    open: (index) =>
      act(() => {
        sockets[index]?.onopen?.()
      }),
    drop: (index) => {
      act(() => {
        sockets[index]?.onclose?.()
      })
      act(() => {
        scheduled.pop()?.()
      })
    },
  }
}

describe('코멘트 목록의 다시 읽기 신호', () => {
  it('`comments-changed` 는 그 페이지의 신호를 낸다 — 페이지가 없는 프레임은 버린다', () => {
    const board = mount()
    board.open(0)
    board.push({ type: 'comments-changed', projectId: 'project_1', pageId: 'page_2' })
    board.push({ type: 'comments-changed', projectId: 'project_1' })
    expect(board.heard).toEqual(['page_2'])
  })

  it('`page-stale` 도 그 페이지의 신호를 낸다 — 늦게 커밋된 쓰기가 코멘트였을 수 있다', () => {
    const board = mount()
    board.open(0)
    board.push({ type: 'page-stale', projectId: 'project_1', pageId: 'page_1' })
    expect(board.heard).toEqual(['page_1'])
  })

  it('다시 붙으면 «어느 페이지든» 신호를 낸다 — 첫 연결은 안 낸다', () => {
    const board = mount()
    board.open(0)
    const first = [...board.heard]
    board.drop(0)
    board.open(1)
    expect({ first, after: board.heard }).toEqual({ first: [], after: ['*'] })
  })
})
