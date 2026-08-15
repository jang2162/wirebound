/**
 * **연결이 다시 붙으면 페이지를 다시 읽는다**(P3-2 D6 · P3-1 이월 §2.4).
 *
 * # 왜 이것이 필요한가
 *
 * 끊긴 동안 남이 낸 편집의 프레임은 사라진다. 다시 붙어도 서버는 지난 것을 다시 보내지
 * 않으므로, 그 사실을 알아채는 길은 **다음 프레임의 `seq`가 내 다음 번호가 아닌 것**(갭)
 * 하나였다. 그리고 갭이 수렴하려면 **누군가 편집을 내야 한다** — 아무것도 안 내고 보고만
 * 있는 사람의 화면은 스스로 맞춰지지 않는다.
 *
 * # 셸째로 띄운다
 *
 * 재조회는 `routes/editor.tsx`가 한다 — 페이지 상태를 서버 것으로 **놓는** 자리가
 * `loadPage` 하나여야 하기 때문이다(D6). 그래서 스토어를 직접 쥐지 않고 `<App />`을
 * 라우트째 띄운다.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import type { PageDocument } from '@wirebound/schema'
import { describe, expect, it, vi } from 'vitest'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { createConnectionIdHolder, type RealtimeSetup } from '../../src/realtime/context'
import { createEditChannel } from '../../src/realtime/edit-channel'
import {
  HEAD_SEQ,
  OTHER_PAGE_ID,
  OTHER_PAGE_TITLE,
  PAGE_ID,
  PROJECT_ID,
  openPage,
  pageDoc,
  pageDetail,
  waitForNode,
} from '../editor-harness'

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

function doc(childId: string): PageDocument {
  return pageDoc({ id: 'n-root', type: 'Page', children: [{ id: childId, type: 'Text', props: {} }] })
}

interface Board {
  sockets: FakeSocket[]
  getPage: ReturnType<typeof vi.fn>
  /** 소켓이 열렸다고 알린다. 첫 번째는 최초 접속, 두 번째부터가 재연결이다. */
  open: (index: number) => void
  drop: (index: number) => void
  /** 붙잡아 둔 재조회를 흘려 준다. `holdResync`를 준 판에서만 뜻이 있다. */
  release: () => void
}

/**
 * 셸을 열고 소켓을 붙인다. **`schedule`을 진짜로 두지 않는다** — 재연결 예약이 실제
 * 타이머로 걸리면 테스트가 끝난 뒤에도 남는다. 대신 예약된 함수를 손으로 돌린다.
 */
async function board(options?: { serverDoc?: PageDocument; holdResync?: boolean }): Promise<Board> {
  const sockets: FakeSocket[] = []
  const scheduled: (() => void)[] = []
  let release = (): void => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let calls = 0
  // **페이지마다 다른 문서를 낸다** — 같은 것을 내면 "어느 페이지가 실렸나"를 잴 수 없다.
  const getPage = vi.fn(async (_projectId: string, pageId: string) => {
    calls += 1
    // 첫 조회는 페이지를 여는 경로다. 붙잡는 것은 **그 페이지의** 재조회뿐이다 — 다른
    // 페이지를 여는 조회까지 붙잡으면 옮겨 갈 수가 없다.
    if (options?.holdResync === true && calls > 1 && pageId === PAGE_ID) await held
    return pageDetail(pageId, pageId === PAGE_ID ? (options?.serverDoc ?? doc('n-first')) : doc('n-other'))
  })

  const setup: RealtimeSetup = {
    holder: createConnectionIdHolder(),
    channel: createEditChannel(),
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
  }

  await openPage(doc('n-first'), { realtime: setup, apiOverrides: { getPage } })
  // 첫 조회는 셸이 페이지를 여는 경로다 — 아래 단언은 그 뒤의 호출만 센다.
  getPage.mockClear()

  return {
    sockets,
    getPage,
    release,
    open: (index) => {
      act(() => {
        sockets[index]?.onopen?.()
      })
    },
    drop: (index) => {
      act(() => {
        sockets[index]?.onclose?.()
      })
      // 재연결 예약을 손으로 돌려 두 번째 소켓을 만든다.
      act(() => {
        scheduled.pop()?.()
      })
    },
  }
}

/** 지금까지 `getPage`가 읽은 페이지들. 같은 페이지가 두 번 나오면 잉여 왕복이다. */
function readPages(getPage: ReturnType<typeof vi.fn>): string[] {
  return getPage.mock.calls.map((call) => String(call[1]))
}

describe('다시 붙으면 다시 읽는다 (D6)', () => {
  it('첫 연결에서는 다시 읽지 않는다 — 방금 서버 문서를 놓았다', async () => {
    const view = await board()

    view.open(0)

    await act(async () => {})
    expect(view.getPage).not.toHaveBeenCalled()
  })

  it('끊겼다 다시 붙으면 페이지를 다시 읽는다', async () => {
    const view = await board({ serverDoc: doc('n-after-reconnect') })
    view.open(0)

    view.drop(0)
    view.open(1)

    await waitFor(() => expect(view.getPage).toHaveBeenCalledWith(PROJECT_ID, PAGE_ID))
    // **화면이 새 문서로 갈린다** — 조회를 셌다는 것만으로는 그것이 스토어에 닿았는지 모른다.
    await waitForNode('n-after-reconnect')
  })

  /**
   * **아무것도 안 잃었으면 아무 말도 안 한다.** 사용자는 아무것도 안 했고 문서도 그대로다 —
   * 그때 뜨는 통지는 하지도 않은 일에 대한 경고가 된다.
   */
  it('잃은 것이 없으면 통지가 없다', async () => {
    const view = await board()
    view.open(0)

    view.drop(0)
    view.open(1)

    await waitFor(() => expect(view.getPage).toHaveBeenCalled())
    expect(screen.queryByRole('alert')).toBeNull()
  })

  /**
   * **신호가 오를 때만 돈다 — 페이지를 옮길 때가 아니다**(리뷰 F5).
   *
   * 이펙트의 의존 배열에 `pageId`가 있으므로 막지 않으면 **재연결을 한 번이라도 한 뒤에는
   * 페이지를 옮길 때마다 같은 페이지를 두 번 읽는다** — 위 이펙트가 한 번, 재조회가 또 한 번.
   * D6이 세운 수렴 장치가 평상시 비용을 내는 형태다.
   */
  it('재연결 뒤 페이지를 옮겨도 그 페이지를 한 번만 읽는다', async () => {
    const view = await board()
    view.open(0)
    view.drop(0)
    view.open(1)
    await waitFor(() => expect(view.getPage).toHaveBeenCalled())
    view.getPage.mockClear()

    fireEvent.click(screen.getByRole('link', { name: OTHER_PAGE_TITLE }))

    await waitForNode('n-other')
    await act(async () => {})
    expect(readPages(view.getPage)).toEqual([OTHER_PAGE_ID])
  })

  /**
   * **음성 대조.** 옮긴 **뒤에** 다시 붙으면 그 페이지를 다시 읽는다 — 위 케이스가
   * *"재연결 뒤에는 재조회가 아예 안 돈다"*로 통과하지 않는다.
   */
  it('페이지를 옮긴 뒤 다시 붙으면 그 페이지를 다시 읽는다 — 음성 대조', async () => {
    const view = await board()
    view.open(0)
    view.drop(0)
    view.open(1)
    await waitFor(() => expect(view.getPage).toHaveBeenCalled())
    fireEvent.click(screen.getByRole('link', { name: OTHER_PAGE_TITLE }))
    await waitForNode('n-other')
    view.getPage.mockClear()

    view.drop(1)
    view.open(2)

    await waitFor(() => expect(readPages(view.getPage)).toEqual([OTHER_PAGE_ID]))
  })

  /**
   * **늦게 온 재조회 응답이 지금 안 열린 페이지를 스토어에 놓지 않는다**(리뷰 변이 N4).
   *
   * 페이지를 여는 이펙트에는 같은 가드를 재는 케이스가 있는데(`앞 페이지의 응답이 늦게 와도…`)
   * 재조회 쪽에는 없었다. 없으면 그 응답이 **앞 페이지의 `openPageId`째로** 스토어에 실려,
   * 주소는 새 페이지인데 스토어는 앞 페이지를 들고 있다고 말한다 — 그러면 캔버스가 아무것도
   * 안 그린다(읽는 쪽이 주소와 대조하기 때문이다).
   */
  it('늦게 온 재조회 응답이 다른 페이지를 덮지 않는다', async () => {
    const view = await board({ holdResync: true })
    view.open(0)
    view.drop(0)
    view.open(1)
    // `board`가 첫 조회를 세지 않게 지웠으므로 여기 하나가 재조회다.
    await waitFor(() => expect(readPages(view.getPage)).toEqual([PAGE_ID]))

    // 재조회가 붙잡혀 있는 동안 페이지를 옮긴다.
    fireEvent.click(screen.getByRole('link', { name: OTHER_PAGE_TITLE }))
    await waitForNode('n-other')
    await act(async () => {
      view.release()
    })

    // 새 페이지가 그대로 그려져 있다 — 늦은 응답이 앞 페이지를 놓지 않았다.
    await act(async () => {})
    await waitForNode('n-other')
  })

  /**
   * **되돌리기 이력이 사라졌으면 말한다**(P3-1 이월 §2.5의 갈래 2).
   *
   * 그쪽은 갈래 1(*"리베이스가 서면 이 경로가 드물어진다"*)도 뒀는데 **성립하지 않는다** —
   * 리베이스는 갭을 고치지 못하고(바탕이 서버 문서와 같아야 한다), 이 슬라이스는 오히려
   * 재연결마다 재조회를 **더한다.** 그래서 문장을 더하는 쪽이다.
   */
  it('되돌리기 이력이 있었으면 초기화됐다고 말한다', async () => {
    const sockets: FakeSocket[] = []
    const scheduled: (() => void)[] = []
    const getPage = vi.fn(async (_projectId: string, pageId: string) => pageDetail(pageId, doc('n-first')))
    const setup: RealtimeSetup = {
      holder: createConnectionIdHolder(),
      channel: createEditChannel(),
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
    }

    await openPage(doc('n-first'), {
      realtime: setup,
      apiOverrides: {
        getPage,
        // 페이지를 열 때 스택이 채워진다(D10) — 재조회가 그것을 비운다.
        listMyRevisions: async () => [
          {
            id: 'rev-1',
            seq: HEAD_SEQ,
            actorType: 'user' as const,
            actorId: 'u-1',
            actorLabel: '나',
            ops: [],
            inverse: [{ op: 'remove' as const, path: '/root/children/0' }],
            createdAt: '2026-08-16T00:00:00.000Z',
          },
        ],
      },
    })
    // 스택이 채워지면 버튼이 살아난다. jest-dom을 안 쓰므로 속성을 직접 본다.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '되돌리기' }).hasAttribute('disabled')).toBe(false),
    )

    act(() => {
      sockets[0]?.onopen?.()
    })
    act(() => {
      sockets[0]?.onclose?.()
    })
    act(() => {
      scheduled.pop()?.()
    })
    act(() => {
      sockets[1]?.onopen?.()
    })

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('되돌리기 이력이 초기화됐습니다')
    expect(alert.textContent).toContain('연결이 다시 붙어')
  })
})
