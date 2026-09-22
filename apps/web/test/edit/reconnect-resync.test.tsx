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
import type { TabChannel } from '../../src/session/tab-channel'
import { tabHub } from '../helpers'
import {
  HEAD_SEQ,
  OTHER_PAGE_ID,
  OTHER_PAGE_TITLE,
  PAGE_ID,
  PROJECT_ID,
  PROJECT_NAME,
  PROJECT_ROUTE,
  openPage,
  pageDoc,
  pageDetail,
  renderEditor,
  waitForNode,
} from '../editor-harness'

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
/**
 * 소켓·재연결 예약 배선만. **`board()`에서 뽑아낸 것은 셸을 `PAGE_ROUTE`가 아닌 데서 띄우는
 * 케이스가 생겼기 때문이다**(아래 *"페이지를 안 연 채로…"*) — 그쪽은 `openPage()`를 못 쓴다.
 */
interface Wiring {
  setup: RealtimeSetup
  sockets: FakeSocket[]
  /** 소켓이 열렸다고 알린다. 첫 번째는 최초 접속, 두 번째부터가 재연결이다. */
  open: (index: number) => void
  drop: (index: number) => void
}

function wiring(): Wiring {
  const sockets: FakeSocket[] = []
  const scheduled: (() => void)[] = []

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

  return {
    setup,
    sockets,
    open: (index) => {
      act(() => {
        sockets[index]?.onopen?.()
      })
    },
    drop: (index) => {
      act(() => {
        sockets[index]?.onclose?.()
      })
      // 재연결 예약을 손으로 돌려 다음 소켓을 만든다.
      act(() => {
        scheduled.pop()?.()
      })
    },
  }
}

async function board(options?: {
  serverDoc?: PageDocument
  holdResync?: boolean
  tabChannel?: TabChannel
}): Promise<Board> {
  const wired = wiring()
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

  await openPage(doc('n-first'), {
    realtime: wired.setup,
    apiOverrides: { getPage },
    ...(options?.tabChannel === undefined ? {} : { tabChannel: options.tabChannel }),
  })
  // 첫 조회는 셸이 페이지를 여는 경로다 — 아래 단언은 그 뒤의 호출만 센다.
  getPage.mockClear()

  return { sockets: wired.sockets, getPage, release, open: wired.open, drop: wired.drop }
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
   * **열린 페이지가 없을 때도 신호를 소비한다**(리뷰 (다)4).
   *
   * 앞 판은 `if (resyncToken === 0 || pageId === undefined) return`으로 **소비하지 않고**
   * 빠졌다. 그래서 페이지 없는 주소에서 재연결하면 신호가 남아 있다가, 나중에 페이지를 열
   * 때 이 이펙트가 그 페이지에 대해 한 번 더 돈다 — `getPage`가 **두 번** 간다.
   *
   * **무해한 낭비가 아니다.** 두 번째 응답이 여는 경로의 `restoreUndo`보다 늦게 오면
   * `loadPage`가 방금 복원한 undo 스택을 비우고, 그냥 페이지를 연 사용자에게
   * *"되돌리기 이력이 초기화됐습니다"*가 뜬다.
   *
   * **`board()`를 못 쓴다** — 그쪽은 `openPage()`로 페이지가 열린 주소에서 시작한다.
   */
  it('페이지를 안 연 채로 다시 붙어도, 그 뒤에 연 페이지는 한 번만 읽는다', async () => {
    const getPage = vi.fn(async (_projectId: string, pageId: string) =>
      pageDetail(pageId, doc(pageId === PAGE_ID ? 'n-first' : 'n-other')),
    )
    const wired = wiring()
    renderEditor({ route: PROJECT_ROUTE, realtime: wired.setup, apiOverrides: { getPage } })
    await screen.findByRole('heading', { name: PROJECT_NAME })

    wired.open(0)
    wired.drop(0)
    wired.open(1)
    await act(async () => {})
    // 열린 페이지가 없으니 다시 읽을 것도 없다 — 여기까지는 앞 판도 같다.
    expect(readPages(getPage)).toEqual([])

    fireEvent.click(screen.getByRole('link', { name: OTHER_PAGE_TITLE }))
    await waitForNode('n-other')
    await act(async () => {})

    // **두 번이면 신호를 안 소비한 것이다.**
    expect(readPages(getPage)).toEqual([OTHER_PAGE_ID])
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

/**
 * ## 다른 탭이 같은 사람으로 다시 들어오면 — 새 쿠키로 다시 붙는다 (이월 Z)
 *
 * 다른 탭이 **같은 사람으로 다시 로그인하면**(옛 세션은 산다) 쿠키는 새 세션인데 이 탭의 WS 는 옛 세션이다. 서버의
 * 방송은 요청과 같은 세션의 연결만 빼므로 **이 탭이 자기 방송을 되받는다** — 복원이면 본인에게 «다른 사람이 스냅샷을
 * 복원했습니다»(4차 리뷰 b-3 · Chrome). 소식을 받으면 옛 소켓을 버리고 곧바로 다시 붙는다(`realtime/connection.ts`의
 * `reconnect`) — 핸드셰이크가 새 쿠키를 싣는다. **다시 붙은 것이므로 다시 읽는다**(D6) — 버린 소켓과 새 소켓 사이에
 * 온 남의 프레임은 사라졌다.
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 실시간 훅이 갱신을 안 듣는다(`useSessionRenewal`을 안 단다) | *"… 새 쿠키로 다시 붙는다 …"* **혼자** |
 * | 세션이 갱신을 알아도 단 것을 안 부른다 | 같은 것 **혼자** |
 */
describe('다른 탭이 같은 사람으로 다시 들어오면 (이월 Z)', () => {
  it('옛 소켓을 버리고 곧바로 새 쿠키로 다시 붙는다 — 다시 붙었으니 다시 읽는다', async () => {
    const hub = tabHub()
    const view = await board({ serverDoc: doc('n-after-renewal'), tabChannel: hub.channel })
    view.open(0)

    // 하네스의 사람(`editor-harness.tsx`의 `USER`)과 같은 id 다.
    await hub.fromOtherTab({ kind: 'signed-in', user: { id: 'u-1', email: 'me@example.com', name: '테스터' } })

    expect(view.sockets[0]?.closed).toBe(true)
    expect(view.sockets).toHaveLength(2)
    view.open(1)
    await waitForNode('n-after-renewal')
    expect(readPages(view.getPage)).toEqual([PAGE_ID])
  })
})
