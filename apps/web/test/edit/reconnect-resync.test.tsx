/**
 * **연결이 다시 붙으면 페이지를 다시 읽는다.**
 *
 * # 왜 이것이 필요한가
 *
 * 끊긴 동안 남이 낸 편집의 프레임은 사라진다. 다시 붙어도 서버는 지난 것을 다시 보내지
 * 않으므로, 다시 읽지 않으면 그 사실을 알아채는 길은 **다음 프레임의 `seq`가 내 다음 번호가
 * 아닌 것**(갭) 하나뿐이다. 그리고 갭이 수렴하려면 **누군가 편집을 내야 한다** — 아무것도 안 내고 보고만
 * 있는 사람의 화면은 스스로 맞춰지지 않는다.
 *
 * # 셸째로 띄운다
 *
 * 재조회는 `routes/editor.tsx`가 한다 — 페이지 상태를 서버 것으로 **놓는** 자리가
 * `loadPage` 하나여야 하기 때문이다. 그래서 스토어를 직접 쥐지 않고 `<App />`을
 * 라우트째 띄운다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { PageDocument } from '@wirebound/schema'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../src/api/client'
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
  PAGE_ROUTE,
  PROJECT_ID,
  PROJECT_NAME,
  PROJECT_ROUTE,
  canvasFrame,
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
 * 소켓·재연결 예약 배선만. **`board()`와 따로 두는 것은 셸을 `PAGE_ROUTE`가 아닌 데서 띄우는
 * 케이스가 있기 때문이다**(아래 *"페이지를 안 연 채로…"*) — 그쪽은 `openPage()`를 못 쓴다.
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

describe('다시 붙으면 다시 읽는다', () => {
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

    // 떠날 때 끊을 신호를 싣는다(`api/http-client.ts`의 «떠난 조회는 끊는다»).
    await waitFor(() => expect(view.getPage).toHaveBeenCalledWith(PROJECT_ID, PAGE_ID, { cancel: expect.any(AbortSignal) }))
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
   * **신호가 오를 때만 돈다 — 페이지를 옮길 때가 아니다.**
   *
   * 이펙트의 의존 배열에 `pageId`가 있으므로 막지 않으면 **재연결을 한 번이라도 한 뒤에는
   * 페이지를 옮길 때마다 같은 페이지를 두 번 읽는다** — 위 이펙트가 한 번, 재조회가 또 한 번.
   * 재연결 재조회라는 수렴 장치가 평상시 비용을 내는 형태다.
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
   * **열린 페이지가 없을 때도 신호를 소비한다.**
   *
   * `if (resyncToken === 0 || pageId === undefined) return`으로 **소비하지 않고** 빠지면,
   * 페이지 없는 주소에서 재연결했을 때 신호가 남아 있다가, 나중에 페이지를 열
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
    // 열린 페이지가 없으니 다시 읽을 것도 없다 — 여기까지는 신호를 안 소비하는 구현도 같다.
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
   * **늦게 온 재조회 응답이 지금 안 열린 페이지를 스토어에 놓지 않는다.**
   *
   * 페이지를 여는 이펙트의 같은 가드는 `panels/menu-tree.test.tsx`의 `앞 페이지의 응답이 늦게 와도…`가
   * 재고, 이 케이스는 재조회 쪽을 잰다. 가드가 없으면 그 응답이 **앞 페이지의 `openPageId`째로** 스토어에 실려,
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
   * **되돌리기 이력이 사라졌으면 말한다.**
   *
   * *"리베이스가 서면 이 경로가 드물어진다"*에 기대 말을 안 하는 것은 **성립하지 않는다** —
   * 리베이스는 갭을 고치지 못하고(바탕이 서버 문서와 같아야 한다), 재조회는 오히려
   * 재연결마다 돈다. 그래서 문장을 낸다.
   */
  /**
   * 되돌리기 이력을 채운 채 연결을 한 번 끊었다 다시 붙인다. 재조회가 돌려주는 판은 `resyncSeq` · `resyncDoc`이다 — 처음
   * 여는 조회는 `HEAD_SEQ` · `n-first`다.
   */
  async function reconnectWithUndo(resyncSeq: number, resyncDoc = doc('n-first')): Promise<ReturnType<typeof vi.fn>> {
    const sockets: FakeSocket[] = []
    const scheduled: (() => void)[] = []
    let calls = 0
    const getPage = vi.fn(async (_projectId: string, pageId: string) => {
      calls += 1
      return calls === 1
        ? { ...pageDetail(pageId, doc('n-first')), headSeq: HEAD_SEQ }
        : { ...pageDetail(pageId, resyncDoc), headSeq: resyncSeq }
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

    await openPage(doc('n-first'), {
      realtime: setup,
      apiOverrides: {
        getPage,
        // 페이지를 열 때 스택이 채워진다 — 재조회가 그것을 비운다.
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
    await waitFor(() => expect(getPage).toHaveBeenCalledTimes(2))
    return getPage
  }

  it('되돌리기 이력이 있었으면 초기화됐다고 말한다 — 끊긴 동안 서버 판이 움직였다', async () => {
    await reconnectWithUndo(HEAD_SEQ + 1)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('되돌리기 이력이 초기화됐습니다')
    expect(alert.textContent).toContain('연결이 다시 붙어')
  })

  /**
   * **서버 판이 그대로면 되돌리기 이력을 지킨다.** 같은 `headSeq`에 보내지 않은 편집이 없으면 내 문서가 곧 서버 문서라
   * 스택의 `inverse`가 남의 편집을 덮을 길이 없다. 다시 붙기만 한 판이 흔하다 — 같은 사람이 다른 탭에서 다시 로그인하면
   * 여기 온다(Chrome: 싣던 판은 «되돌리기 이력이 초기화됐습니다» · 되돌리기 꺼짐).
   */
  it('서버 판이 그대로면 되돌리기 이력을 지키고 아무 말도 안 한다', async () => {
    await reconnectWithUndo(HEAD_SEQ)

    // 재조회가 끝난 뒤의 판이다(`reconnectWithUndo`가 둘째 조회를 기다렸다) — 응답을 싣는 마이크로태스크까지 흘린다.
    await act(async () => {})
    expect(screen.getByRole('button', { name: '되돌리기' }).hasAttribute('disabled')).toBe(false)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  /**
   * **번호가 같아도 문서가 다르면 싣는다.** 끊긴 사이 페이지가 지워졌다가 스냅샷 복원으로 같은 id 로 되살아나면 `head_seq`가
   * 0 부터 다시 세고, 남이 편집해 번호가 내 것과 같아질 수 있다 — 복원 방송은 끊긴 동안 와서 못 받았다. 번호만 보고 안
   * 싣으면 옛 문서가 남고, 자리(index) 기반인 다음 편집이 남의 노드를 덮는다(Chrome — `store/editor-store.ts`의
   * `holdsServerPage` 머리말). 위 케이스와 **번호가 같고 문서만 다르다.**
   */
  it('번호가 같아도 문서가 다르면 싣는다 — 끊긴 사이 지워졌다 되살아난 페이지', async () => {
    await reconnectWithUndo(HEAD_SEQ, doc('n-revived'))

    await waitForNode('n-revived')
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('되돌리기 이력이 초기화됐습니다')
  })
})

/**
 * ## 여는 조회가 실패한 캔버스 — 다시 붙어 읽으면 되살아난다
 *
 * 여는 조회가 실패하면 캔버스는 실패 문장을 그린다. 그 뒤 재연결 재조회가 성공하면 스토어에 판이 실려 구조 트리 · 속성
 * 패널은 문서를 그리는데, 캔버스만 실패 문장 그대로면 세 자리가 다른 사실을 말한다(Chrome: 여는 `GET` 에 503 을 심고 WS 를
 * 끊었다 — 다시 붙은 뒤 트리에 Text 줄 1 · 캔버스는 실패 문장).
 */
describe('여는 조회가 실패한 캔버스', () => {
  it('다시 붙어 읽으면 캔버스가 문서를 그린다', async () => {
    let calls = 0
    const getPage = vi.fn(async (_projectId: string, pageId: string) => {
      calls += 1
      if (calls === 1) throw new ApiError(503, 'internal', '잠깐 실패했습니다')
      return pageDetail(pageId, doc('n-back'))
    })
    const wired = wiring()
    renderEditor({ route: PAGE_ROUTE, realtime: wired.setup, apiOverrides: { getPage } })
    await screen.findByRole('heading', { name: PROJECT_NAME })
    await within(screen.getByRole('main', { name: '캔버스' })).findByText('잠깐 실패했습니다')

    wired.open(0)
    wired.drop(0)
    wired.open(1)
    // 다시 읽기가 돌았다 — 아래가 «재조회가 안 돌았다»로 빨강이 되지 않게 먼저 본다.
    await waitFor(() => expect(getPage).toHaveBeenCalledTimes(2))

    await waitFor(() => expect(canvasFrame().querySelector('[data-wb-id="n-back"]')).not.toBeNull())
  })
})

/**
 * ## 다른 탭이 같은 사람으로 다시 들어오면 — 새 쿠키로 다시 붙는다
 *
 * 다른 탭이 **같은 사람으로 다시 로그인하면**(옛 세션은 산다) 쿠키는 새 세션인데 이 탭의 WS 는 옛 세션이다. 서버의
 * 방송은 요청과 같은 세션의 연결만 빼므로 **이 탭이 자기 방송을 되받는다** — 복원이면 본인에게 «다른 사람이 스냅샷을
 * 복원했습니다»(Chrome 에서 잰 고장 방식). 소식을 받으면 옛 소켓을 버리고 곧바로 다시 붙는다(`realtime/connection.ts`의
 * `reconnect`) — 핸드셰이크가 새 쿠키를 싣는다. **다시 붙은 것이므로 다시 읽는다** — 버린 소켓과 새 소켓 사이에
 * 온 남의 프레임은 사라진다.
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 실시간 훅이 갱신을 안 듣는다(`useSessionRenewal`을 안 단다) | *"… 새 쿠키로 다시 붙는다 …"* **혼자** |
 * | 세션이 갱신을 알아도 단 것을 안 부른다 | 같은 것 **혼자** |
 */
describe('다른 탭이 같은 사람으로 다시 들어오면', () => {
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

/**
 * ## 스스로 버린 소켓으로 답을 기다리던 편집 — «취소됐다» 고 말하지 않는다
 *
 * 위의 `reconnect()`는 **이 탭이 스스로** 옛 소켓을 버린다. 그 소켓은 열려 있었으므로 답을 기다리던 편집은 **이미
 * 서버에 닿았다** — 결과를 모를 뿐이다. 그것을 «편집을 저장하지 못했습니다 — … 편집 1개가
 * 취소됐습니다» 로 말하면, 서버는 그 편집을 커밋하고 새 연결이 그것을 방송해 화면에도 선다(Chrome 에서 잰 고장 방식 —
 * 행 잠금 5s). 사용자가 그 문장을 믿고 다시 하면 **두 번 선다.** 문장은 `edit/use-edit-commit.tsx`의
 * `unknownNotice`가 갖는다.
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 스스로 버릴 때도 끊김과 같게 끝낸다(실시간 훅이 `abandonInFlight`를 안 부른다) | 셋 다 — **축의 주인은 첫째** |
 * | 취소한 수가 0 이어도 취소 문장을 붙인다 | 첫째 **혼자** |
 * | 아직 안 보낸 편집의 취소를 말하지 않는다 | 둘째 **혼자** |
 * | 다시 불러오지도 못한 판이 «저장되지 않았습니다» 로 끝난다 | 셋째 **혼자** |
 * | 실시간이 다시 열려 있어도 «새로고침해 확인하세요»(`unknownNotice`의 `live`를 늘 거짓으로) | 첫째 **혼자** |
 */
describe('스스로 버린 소켓으로 답을 기다리던 편집', () => {
  /** «아래로»·«위로»가 설 형제 둘. 트리의 줄 이름이 타입이라 둘의 타입이 달라야 한다. */
  const pair = (): PageDocument =>
    pageDoc({
      id: 'n-root',
      type: 'Page',
      children: [
        { id: 'n-a', type: 'Text', props: {} },
        { id: 'n-b', type: 'Divider', props: {} },
      ],
    })

  const tool = (name: string): HTMLElement =>
    within(within(screen.getByRole('region', { name: '구조 트리' })).getByRole('group', { name: '구조 편집' })).getByRole(
      'button',
      { name },
    )

  /**
   * 페이지를 열고 WS 로 편집 하나를 낸다 — 답(ack)은 안 온다(서버가 행 잠금에 쥔 판). `reload`가 재조회의 답이다.
   * 서버는 아직 커밋 전이라 **편집 전의 문서**를 낸다(GET 은 행 잠금에 안 막힌다).
   */
  async function inFlight(reload: () => Promise<ReturnType<typeof pageDetail>>): Promise<{
    wired: Wiring
    hub: ReturnType<typeof tabHub>
  }> {
    const wired = wiring()
    const hub = tabHub()
    let calls = 0
    const getPage = vi.fn(async (_projectId: string, pageId: string) => {
      calls += 1
      return calls === 1 ? pageDetail(pageId, pair()) : reload()
    })
    await openPage(pair(), { realtime: wired.setup, apiOverrides: { getPage }, tabChannel: hub.channel })
    wired.open(0)

    fireEvent.click(within(screen.getByRole('region', { name: '구조 트리' })).getByRole('button', { name: 'Text' }))
    fireEvent.click(tool('아래로'))
    await act(async () => {})
    // WS 로 나갔다 — 답을 기다린다.
    expect(wired.sockets[0]?.sent.filter((raw) => raw.includes('"patch"'))).toHaveLength(1)
    return { wired, hub }
  }

  const sameUser = { kind: 'signed-in' as const, user: { id: 'u-1', email: 'me@example.com', name: '테스터' } }

  /**
   * 새 소켓이 **다시 불러오기가 끝나기 전에** 열린다 — 그러면 뒤늦은 커밋은 방송으로 화면에 서므로 «곧 화면에 나타납니다»가
   * 참이다. 뒤늦은 커밋이 안 오는 채 내는 문장(닫힌 소켓 · REST · 열린 채 받은 5xx 프레임)은 `test/edit/ws-transport.test.tsx`의
   * «결과를 모르는 실패» 표가 잰다.
   */
  it('답을 기다리던 편집은 반영됐는지 모른다고 말한다 — 취소됐다고 하지 않는다', async () => {
    let release = (): void => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const { wired, hub } = await inFlight(async () => {
      await held
      return pageDetail(PAGE_ID, pair())
    })

    await hub.fromOtherTab(sameUser)
    expect(wired.sockets[0]?.closed).toBe(true)
    wired.open(1)
    await act(async () => {
      release()
    })

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(
      '다른 탭에서 다시 로그인해 실시간 연결을 새로 붙이느라 보낸 편집의 답을 받지 못했습니다 — 서버에 반영됐는지 알 수 ' +
        '없습니다. 페이지를 서버 상태로 다시 불러왔고, 반영됐다면 곧 화면에 나타납니다.',
    )
  })

  it('아직 안 보낸 편집은 취소됐다고 따로 센다 — 그것은 서버에 닿지 않았다', async () => {
    const { hub } = await inFlight(async () => pageDetail(PAGE_ID, pair()))
    // 앞 편집이 답을 기다리는 동안 낸 것은 큐에 선다(한 번에 하나).
    fireEvent.click(tool('위로'))
    await act(async () => {})

    await hub.fromOtherTab(sameUser)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('서버에 반영됐는지 알 수 없습니다')
    expect(alert.textContent).toContain('아직 보내지 않은 편집 1개는 취소됐습니다.')
  })

  it('다시 불러오지도 못하면 모른다고 말하고 새로고침을 권한다 — «저장되지 않았습니다» 가 아니다', async () => {
    const { hub } = await inFlight(async () => {
      throw new Error('네트워크')
    })

    await hub.fromOtherTab(sameUser)

    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe(
      '다른 탭에서 다시 로그인해 실시간 연결을 새로 붙이느라 보낸 편집의 답을 받지 못했습니다 — 서버에 반영됐는지 알 수 ' +
        '없습니다. 페이지를 다시 불러오지도 못했습니다 — 새로고침해 서버 상태를 확인하세요.',
    )
  })
})
