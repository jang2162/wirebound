/**
 * **판을 다시 싣는 조회와 나가 있는 편집 · 겹친 조회.** 셸째 띄운다 — 다시 싣는 입구는 `routes/editor.tsx`의 `CanvasFrame`에, 편집을
 * 내는 루프는 `edit/use-edit-commit.tsx`에 있고, 둘이 스토어(`EditorStore`의 `wasSent` · `beginPageLoad` · `settlePageLoad`)에서 만난다.
 *
 * | 축 | 장치 | 케이스 |
 * |---|---|---|
 * | 단추는 보낸 편집의 답을 받은 뒤 읽는다 | `editsAnswered` | «보낸 편집의 답을 받은 뒤에 읽는다» · «답이 한도 안에 안 오면 …» |
 * | 판째 버린 나간 편집은 «모름»이다 | `resyncNotice`의 `sent` · `wasSent` | «읽는 동안 낸 편집은 …» |
 * | 그 편집의 늦은 답 | `#orphanAck` · 전송 루프의 `wasAbandoned` | «늦은 ack …» · «늦은 거절 …» |
 * | 편집은 큐의 주인 페이지로 나간다 | 전송 루프의 `queuePageId` | «페이지를 옮기면 …» |
 * | 늦게 온 옛 판이 새 판을 덮지 않는다 | 세대(`beginPageLoad` · `settlePageLoad`) | «겹친 두 조회» 묶음 |
 * | 다시 읽기가 실패해 판을 비우며 버린 편집 | 복원 재조회의 실패 갈래 `tellLost` | «다시 읽기가 실패하면 …» |
 *
 * jsdom 의 `fireEvent.click`은 포커스를 안 옮겨 blur 커밋이 안 난다 — 실브라우저에서 단추의 클릭이 blur 로 내는 편집은 여기서 **먼저
 * 낸 편집**으로 세운다. 겨룸의 앞섬(ms)과 뒤집힘은 실브라우저로만 잰다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { PageDocument } from '@wirebound/schema'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../src/api/client'
import type { PageDetail } from '../../src/api/types'
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
  pageDetail,
  pageDoc,
  structureTypes,
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

/** 형제 둘 — «아래로»로 순서를 바꾸는 편집을 낸다. 구조 트리의 줄 이름이 타입이라 둘의 타입이 달라야 한다. */
const pair = (): PageDocument =>
  pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-a', type: 'Text', props: {} },
      { id: 'n-b', type: 'Divider', props: {} },
    ],
  })
/** 서버가 «아래로»를 커밋한 판. */
const swapped = (): PageDocument =>
  pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-b', type: 'Divider', props: {} },
      { id: 'n-a', type: 'Text', props: {} },
    ],
  })

const RESTORED = { type: 'restored', projectId: PROJECT_ID, snapshotId: 's1', actor: { type: 'user', label: '밥' } } as const

interface SentPatch {
  clientOpId: string
  pageId: string
  baseSeq: number
}

/** `getPage`의 답을 손으로 낸다. 첫 부름(페이지를 여는 조회)과 `immediate`가 고르는 부름만 곧바로 답한다. */
interface Held {
  pageId: string
  resolve: (page: PageDetail) => void
  reject: (error: unknown) => void
}

async function mount(options: { immediate?: (pageId: string) => PageDetail | undefined } = {}) {
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
  const held: Held[] = []
  let calls = 0
  const getPage = vi.fn((_projectId: string, pageId: string) => {
    calls += 1
    if (calls === 1) return Promise.resolve(pageDetail(pageId, pair()))
    const now = options.immediate?.(pageId)
    if (now !== undefined) return Promise.resolve(now)
    return new Promise<PageDetail>((resolve, reject) => held.push({ pageId, resolve, reject }))
  })
  await openPage(pair(), { realtime: setup, apiOverrides: { getPage } })
  act(() => {
    sockets[0]?.onopen?.()
  })
  const last = (): FakeSocket => sockets[sockets.length - 1]!
  const push = (frame: object): void => {
    act(() => {
      last().onmessage?.({ data: JSON.stringify(frame) })
    })
  }
  const patches = (): SentPatch[] =>
    sockets.flatMap((socket) => socket.sent.filter((raw) => raw.includes('"patch"')).map((raw) => JSON.parse(raw) as SentPatch))
  /** 구조 트리에서 첫 줄(Text)을 골라 «아래로»를 낸다 — WS 로 나가 답을 기다린다. */
  const moveDown = async (): Promise<SentPatch> => {
    const tree = screen.getByRole('region', { name: '구조 트리' })
    fireEvent.click(within(tree).getByRole('button', { name: 'Text' }))
    fireEvent.click(within(within(tree).getByRole('group', { name: '구조 편집' })).getByRole('button', { name: '아래로' }))
    await act(async () => {})
    const sent = patches()
    return sent[sent.length - 1]!
  }
  const ack = (patch: SentPatch, seq: number): void =>
    push({ type: 'patch-ack', projectId: PROJECT_ID, pageId: patch.pageId, clientOpId: patch.clientOpId, seq, revisionId: `rev-${seq}`, inverse: [], warnings: [] })
  const refuse = (patch: SentPatch): void =>
    push({
      type: 'patch-error',
      projectId: PROJECT_ID,
      pageId: patch.pageId,
      clientOpId: patch.clientOpId,
      status: 409,
      code: 'conflict',
      message: '페이지가 이미 변경되었습니다',
      issues: [],
    })
  /** 소켓을 끊고 다시 붙인다 — 재연결 재조회가 돈다. */
  const reconnect = (): void => {
    act(() => {
      last().onclose?.()
    })
    act(() => {
      scheduled.pop()?.()
    })
    act(() => {
      last().onopen?.()
    })
  }
  return { getPage, held, push, patches, moveDown, ack, refuse, reconnect }
}

const reloadButton = (): HTMLElement => screen.getByRole('button', { name: '다시 불러오기' })
const alertText = (): string =>
  screen
    .queryAllByRole('alert')
    .map((node) => node.textContent)
    .join(' | ')
const statusText = (): string => screen.queryAllByRole('status').map((node) => node.textContent).join(' | ')

afterEach(() => {
  vi.useRealTimers()
})

describe('배너의 «다시 불러오기»와 나가 있는 편집', () => {
  it('보낸 편집의 답을 받은 뒤에 읽는다 — 판이 그 편집을 품고 «취소»도 «모름»도 없다', async () => {
    let acked = false
    const view = await mount({
      immediate: () => (acked ? { ...pageDetail(PAGE_ID, swapped()), headSeq: HEAD_SEQ + 1 } : pageDetail(PAGE_ID, pair())),
    })
    const sent = await view.moveDown()
    view.push(RESTORED)

    fireEvent.click(reloadButton())
    await act(async () => {})
    // 답이 오기 전에는 읽지 않는다 — 읽으면 그 커밋 앞의 판이 실린다.
    expect(view.getPage).toHaveBeenCalledTimes(1)

    acked = true
    view.ack(sent, HEAD_SEQ + 1)

    await waitFor(() => expect(view.getPage).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText(/다른 사람이 스냅샷을 복원했습니다/)).toBeNull())
    expect(structureTypes()).toEqual(['Page', 'Divider', 'Text'])
    expect(alertText()).toBe('다른 사람이 복원한 상태로 페이지를 다시 불러왔습니다. 되돌리기 이력이 초기화됐습니다.')
  })

  it('답이 한도 안에 안 오면 읽고, 그 편집은 반영됐는지 모른다고 말한다', async () => {
    const view = await mount({ immediate: () => pageDetail(PAGE_ID, pair()) })
    await view.moveDown()
    view.push(RESTORED)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    fireEvent.click(reloadButton())
    await act(async () => {})
    expect(view.getPage).toHaveBeenCalledTimes(1)
    await act(async () => {
      vi.advanceTimersByTime(2_999)
    })
    expect(view.getPage).toHaveBeenCalledTimes(1)
    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    await act(async () => {})

    expect(view.getPage).toHaveBeenCalledTimes(2)
    expect(alertText()).toBe(
      '다른 사람이 복원한 상태로 페이지를 다시 불러왔습니다. 보낸 편집 1개는 답을 받기 전이라 서버에 반영됐는지 알 수 없습니다 — ' +
        '새로고침해 서버 상태를 확인하세요.',
    )
  })
})

describe('판째 버린 나간 편집', () => {
  /** 단추의 조회를 붙잡은 채 편집을 내고(나간다) 옛 판으로 답한다 — `loadPage`가 나간 편집을 버린다. */
  async function abandoned() {
    const view = await mount()
    view.push(RESTORED)
    fireEvent.click(reloadButton())
    await waitFor(() => expect(view.held).toHaveLength(1))
    const sent = await view.moveDown()
    await act(async () => {
      view.held[0]!.resolve(pageDetail(PAGE_ID, pair()))
    })
    return { view, sent }
  }

  it('읽는 동안 낸 편집은 «취소»가 아니라 «모름»이다 — 서버에 닿았을 수 있다', async () => {
    await abandoned()

    expect(structureTypes()).toEqual(['Page', 'Text', 'Divider'])
    expect(alertText()).toBe(
      '다른 사람이 복원한 상태로 페이지를 다시 불러왔습니다. 보낸 편집 1개는 답을 받기 전이라 서버에 반영됐는지 알 수 없습니다 — ' +
        '새로고침해 서버 상태를 확인하세요.',
    )
  })

  it('늦은 ack 가 그 판 뒤의 번호면 화면이 최신이 아니라고 말한다', async () => {
    const { view, sent } = await abandoned()
    expect(statusText()).not.toContain('받지 못한 변경')

    view.ack(sent, HEAD_SEQ + 1)
    await act(async () => {})

    expect(statusText()).toContain('받지 못한 변경이 있어 화면이 최신이 아닙니다')
    // 얹지는 않는다 — 그 편집은 이 판이 아닌 판 위에서 만들어졌다.
    expect(structureTypes()).toEqual(['Page', 'Text', 'Divider'])
  })

  it('늦은 거절은 수습하지 않는다 — 다시 읽지 않고 «모름» 문장을 덮지 않으며, 그 뒤에 낸 편집이 나간다', async () => {
    const { view, sent } = await abandoned()
    // 새 편집은 앞 통지를 치운다(`commitOps`) — 그 자리를 수습의 문장이 채우는지 본다.
    await view.moveDown()
    expect(view.patches()).toHaveLength(1)
    expect(alertText()).toBe('')

    view.refuse(sent)
    await act(async () => {})

    expect(view.getPage).toHaveBeenCalledTimes(2)
    expect(alertText()).toBe('')
    // 뒤에 낸 편집이 그 거절을 타고 버려지지 않고 나간다(지금 판의 번호로).
    expect(view.patches()).toHaveLength(2)
    expect(view.patches()[1]?.clientOpId).not.toBe(sent.clientOpId)
    expect(view.patches()[1]?.baseSeq).toBe(HEAD_SEQ)
  })
})

describe('편집은 큐의 주인 페이지로 나간다', () => {
  /**
   * 앞 페이지의 편집이 답을 기다리는 동안 옮겨 간 페이지에서 편집하면, 앞 편집의 늦은 ack 뒤 전송 루프가 그 편집을 **새 페이지
   * 경로로** 낸다(Chrome: 앞 페이지 경로로 나가 번호가 맞자 서버가 앞 페이지에 받았다).
   */
  it('페이지를 옮기면 그 페이지에서 낸 편집은 그 페이지로 나간다 — 앞 편집의 늦은 ack 뒤에도', async () => {
    const view = await mount({ immediate: (pageId) => (pageId === OTHER_PAGE_ID ? pageDetail(pageId, pair()) : undefined) })
    const first = await view.moveDown()
    fireEvent.click(screen.getByRole('link', { name: OTHER_PAGE_TITLE }))
    await waitFor(() => expect(view.getPage).toHaveBeenCalledWith(PROJECT_ID, OTHER_PAGE_ID, expect.anything()))
    await waitFor(() => expect(structureTypes()).toEqual(['Page', 'Text', 'Divider']))
    await view.moveDown()
    expect(view.patches()).toHaveLength(1)

    view.ack(first, HEAD_SEQ + 1)
    await act(async () => {})

    expect(view.patches().map((patch) => patch.pageId)).toEqual([PAGE_ID, OTHER_PAGE_ID])
  })
})

describe('겹친 두 조회 — 늦게 온 옛 판이 새 판을 덮지 않는다', () => {
  /** 단추의 조회(앞)를 붙잡은 채 연결이 끊겼다 붙어 재연결 재조회(뒤)가 나간다. */
  async function overlapped() {
    const view = await mount()
    view.push(RESTORED)
    fireEvent.click(reloadButton())
    await waitFor(() => expect(view.held).toHaveLength(1))
    view.reconnect()
    await waitFor(() => expect(view.held).toHaveLength(2))
    return view
  }

  it('뒤 조회의 새 판이 먼저 실리면 앞 조회의 옛 답은 버린다', async () => {
    const view = await overlapped()
    await act(async () => {
      view.held[1]!.resolve({ ...pageDetail(PAGE_ID, swapped()), headSeq: HEAD_SEQ + 2 })
    })
    await waitFor(() => expect(structureTypes()).toEqual(['Page', 'Divider', 'Text']))

    await act(async () => {
      view.held[0]!.resolve({ ...pageDetail(PAGE_ID, pair()), headSeq: HEAD_SEQ + 1 })
    })
    await act(async () => {})

    expect(structureTypes()).toEqual(['Page', 'Divider', 'Text'])
  })

  /** 뒤 조회가 판이 같다고 보고 넘어가도 판을 정한 것이다 — 창 안에 얹힌 남의 프레임을 앞 조회의 옛 답이 지우지 않는다. */
  it('뒤 조회가 싣지 않고 넘어가도 — 판이 같다 — 그 사이 얹힌 남의 프레임을 앞 조회의 옛 답이 지우지 않는다', async () => {
    const view = await overlapped()
    // 남이 순서를 바꿨다 — 프레임으로 얹힌다.
    view.push({
      type: 'page-changed',
      projectId: PROJECT_ID,
      pageId: PAGE_ID,
      seq: HEAD_SEQ + 1,
      ops: [{ op: 'move', from: '/root/children/0', path: '/root/children/1' }],
      warnings: [],
      actor: { type: 'user', label: '밥' },
    })
    expect(structureTypes()).toEqual(['Page', 'Divider', 'Text'])
    await act(async () => {
      view.held[1]!.resolve({ ...pageDetail(PAGE_ID, swapped()), headSeq: HEAD_SEQ + 1 })
    })

    await act(async () => {
      view.held[0]!.resolve(pageDetail(PAGE_ID, pair()))
    })
    await act(async () => {})

    expect(structureTypes()).toEqual(['Page', 'Divider', 'Text'])
  })

  /** 페이지를 여는 조회도 입구다 — 그 답이 붙잡힌 사이 재연결 재조회가 먼저 실은 새 판을 덮지 않는다. */
  it('여는 조회의 늦은 답이 재연결 재조회가 먼저 실은 판을 덮지 않는다', async () => {
    let otherCalls = 0
    const view = await mount({
      immediate: (pageId) => {
        if (pageId !== OTHER_PAGE_ID) return undefined
        otherCalls += 1
        return otherCalls === 1 ? undefined : { ...pageDetail(pageId, swapped()), headSeq: HEAD_SEQ + 1 }
      },
    })
    fireEvent.click(screen.getByRole('link', { name: OTHER_PAGE_TITLE }))
    await waitFor(() => expect(view.held).toHaveLength(1))
    view.reconnect()
    await waitFor(() => expect(structureTypes()).toEqual(['Page', 'Divider', 'Text']))

    await act(async () => {
      view.held[0]!.resolve(pageDetail(OTHER_PAGE_ID, pair()))
    })
    await act(async () => {})

    expect(structureTypes()).toEqual(['Page', 'Divider', 'Text'])
  })

  /** 뒤 조회가 실패하면(재연결 재조회는 실패를 조용히 둔다) 앞 조회의 답이 실린다 — «뒤에 시작한 조회가 있으면 버린다»가 아니다. */
  it('뒤 조회가 실패하면 앞 조회의 답을 싣는다', async () => {
    const view = await overlapped()
    await act(async () => {
      view.held[1]!.reject(new Error('네트워크'))
    })

    await act(async () => {
      view.held[0]!.resolve({ ...pageDetail(PAGE_ID, swapped()), headSeq: HEAD_SEQ + 1 })
    })

    await waitFor(() => expect(structureTypes()).toEqual(['Page', 'Divider', 'Text']))
    expect(screen.queryByText(/다른 사람이 스냅샷을 복원했습니다/)).toBeNull()
  })
})

describe('재연결 재조회와 편집 실패 수습', () => {
  /**
   * 연결이 끊기면 답을 기다리던 편집은 «모름»으로 끝나 수습이 판을 다시 읽는다. 다시 붙은 연결의 재조회는 그 수습이 판을 실은 뒤에
   * 읽는다(`editsAnswered` — `'recovering'`도 기다린다). 먼저 읽으면 두 조회가 겹쳐 순서를 세대에 맡기게 된다.
   */
  it('재연결 재조회는 수습이 판을 싣기를 기다린 뒤 읽는다', async () => {
    const view = await mount()
    await view.moveDown()
    view.reconnect()
    await waitFor(() => expect(view.held).toHaveLength(1))
    await act(async () => {})
    expect(view.getPage).toHaveBeenCalledTimes(2)

    await act(async () => {
      view.held[0]!.resolve(pageDetail(PAGE_ID, pair()))
    })

    await waitFor(() => expect(view.getPage).toHaveBeenCalledTimes(3))
  })
})

describe('편집 실패 수습보다 뒤에 시작한 조회가 먼저 실으면', () => {
  /**
   * 수습의 조회가 붙잡힌 채 단추가 한도를 넘겨 읽고 먼저 싣는다. 수습의 옛 답은 버리고, 그 사이 새 판 위에서 낸 편집은 수습이 끝난
   * 뒤 전송 루프가 낸다(루프는 수습을 기다리며 쥐여 있다 — 끝내면 다음 편집이 깨울 때까지 줄 선다).
   */
  it('수습의 옛 답은 싣지 않고, 그 판 위에서 낸 편집은 수습이 끝나면 나간다', async () => {
    let calls = 0
    const view = await mount({
      immediate: () => {
        calls += 1
        // 둘째 부름(수습)은 붙잡고, 셋째(단추)는 새 판으로 곧바로 답한다.
        return calls === 1 ? undefined : { ...pageDetail(PAGE_ID, swapped()), headSeq: HEAD_SEQ + 2 }
      },
    })
    const sent = await view.moveDown()
    view.refuse(sent)
    await waitFor(() => expect(view.held).toHaveLength(1))
    view.push(RESTORED)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fireEvent.click(reloadButton())
    await act(async () => {
      vi.advanceTimersByTime(3_000)
    })
    await act(async () => {})
    vi.useRealTimers()
    await waitFor(() => expect(structureTypes()).toEqual(['Page', 'Divider', 'Text']))
    // 새 판 위에서 편집한다(Divider 를 아래로) — 루프는 수습에 쥐여 있어 아직 안 나간다.
    const tree = screen.getByRole('region', { name: '구조 트리' })
    fireEvent.click(within(tree).getByRole('button', { name: 'Divider' }))
    fireEvent.click(within(within(tree).getByRole('group', { name: '구조 편집' })).getByRole('button', { name: '아래로' }))
    await act(async () => {})
    expect(view.patches()).toHaveLength(1)

    // 수습의 답은 옛 판이다(그 뒤 남이 Divider 를 넣었다) — 실리면 트리가 Text 하나가 된다.
    await act(async () => {
      view.held[0]!.resolve(pageDetail(PAGE_ID, pageDoc({ id: 'n-root', type: 'Page', children: [{ id: 'n-a', type: 'Text', props: {} }] })))
    })
    await act(async () => {})

    expect(structureTypes()).toEqual(['Page', 'Text', 'Divider'])
    expect(view.patches()).toHaveLength(2)
    expect(view.patches()[1]?.baseSeq).toBe(HEAD_SEQ + 2)
    expect(alertText()).toContain('페이지가 이미 변경되었습니다 — 페이지를 서버 상태로 다시 불러왔고, 편집 1개가 취소됐습니다.')
  })
})

describe('다시 읽기가 실패하면', () => {
  it('판을 비우며 버린 편집을 말한다 — 말없이 버리지 않는다', async () => {
    const view = await mount()
    view.push(RESTORED)
    fireEvent.click(reloadButton())
    await waitFor(() => expect(view.held).toHaveLength(1))
    // 읽는 동안 낸 편집 둘 — 머리는 나갔고 뒤는 줄 섰다.
    await view.moveDown()
    const tree = screen.getByRole('region', { name: '구조 트리' })
    fireEvent.click(within(within(tree).getByRole('group', { name: '구조 편집' })).getByRole('button', { name: '위로' }))
    await act(async () => {})

    await act(async () => {
      view.held[0]!.reject(new ApiError(404, 'not-found', '페이지를 찾을 수 없습니다', [], true))
    })

    expect(await screen.findByText('페이지를 찾을 수 없습니다')).toBeTruthy()
    expect(alertText()).toContain(
      '페이지를 다시 불러오지 못했습니다. 보낸 편집 1개는 답을 받기 전이라 서버에 반영됐는지 알 수 없습니다 — ' +
        '새로고침해 서버 상태를 확인하세요. 아직 저장되지 않은 편집 1개가 취소됐습니다.',
    )
  })
})
