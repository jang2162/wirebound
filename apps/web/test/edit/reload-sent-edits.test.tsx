/**
 * **판을 다시 싣는 조회와 나가 있는 편집 · 겹친 조회.** 셸째 띄운다 — 다시 싣는 입구는 `routes/editor.tsx`의 `CanvasFrame`에, 편집을
 * 내는 루프는 `edit/use-edit-commit.tsx`에 있고, 둘이 스토어(`EditorStore`의 `wasSent` · `beginPageLoad` · `settlePageLoad`)에서 만난다.
 *
 * | 축 | 장치 | 케이스 |
 * |---|---|---|
 * | 단추는 보낸 편집의 답을 받은 뒤 읽는다 | `editsAnswered` | «보낸 편집의 답을 받은 뒤에 읽는다» · «답이 한도 안에 안 오면 …» |
 * | 판째 버린 나간 편집은 «모름»이다 | `resyncNotice`의 `sent` · `wasSent` | «읽는 동안 낸 편집은 …» |
 * | 그 편집의 늦은 답 | `#orphanAck` · 전송 루프의 `wasAbandoned` | «늦은 ack …» 둘 · «늦은 거절 …» |
 * | 편집은 큐의 주인 페이지로 나간다 | 전송 루프의 `queuePageId` | «페이지를 옮기면 …» |
 * | 늦게 온 옛 판이 새 판을 덮지 않는다 | 세대(`beginPageLoad` · `settlePageLoad`) | «겹친 두 조회» 묶음 |
 * | 다시 읽기가 실패해 판을 비우며 버린 편집 | 복원 재조회의 실패 갈래 `tellLost` | «다시 읽기가 실패하면 …» |
 * | 수습이 되돌리기 전의 화면은 «판이 같다»가 아니다 | `holdsServerPage`의 «바탕 + 큐 = 화면» | «편집 실패 수습이 판을 되돌리기 전에 …» 묶음 |
 * | 수습은 그 편집이 나간 큐만 비운다 | `recover`의 첫 가드 · `sentFromOpenQueue` | «편집 실패 수습은 그 편집이 나간 큐만 …» 묶음 |
 * | 창 안에 온 revision(내 ack · 남의 프레임)을 옛 답이 지우지 않는다 — 실린 판 뒤에 얹는다 | `loadPage`의 `ticket` · `#windowChanges` · `#replayWindow` | «다시 읽는 창 안에 온 revision» 묶음 |
 *
 * jsdom 의 `fireEvent.click`은 포커스를 안 옮겨 blur 커밋이 안 난다 — 실브라우저에서 단추의 클릭이 blur 로 내는 편집은 여기서 **먼저
 * 낸 편집**으로 세운다. 겨룸의 앞섬(ms)과 뒤집힘은 실브라우저로만 잰다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { PageDocument } from '@wirebound/schema'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { PageDetail, RestoreResult, SnapshotSummary } from '../../src/api/types'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { createConnectionIdHolder, type RealtimeSetup } from '../../src/realtime/context'
import { createEditChannel } from '../../src/realtime/edit-channel'
import {
  HEAD_SEQ,
  OTHER_PAGE_ID,
  OTHER_PAGE_TITLE,
  PAGE_ID,
  PROJECT_ID,
  chooseFromShellMenu,
  openPage,
  pageDetail,
  pageDoc,
  structureTypes,
} from '../editor-harness'
import { treeTool, structureRowName } from '../panels/tree-row'

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

/** 밥이 끝에 `Heading`을 넣은 revision 의 프레임. */
const BOB_ADDS = (seq: number, pageId: string = PAGE_ID) =>
  ({
    type: 'page-changed',
    projectId: PROJECT_ID,
    pageId,
    seq,
    ops: [{ op: 'add', path: '/root/children/-', value: { id: 'n-bob', type: 'Heading', props: {} } }],
    warnings: [],
    actor: { type: 'user', label: '밥' },
  }) as const
/** 서버가 밥의 `Heading`을 커밋한 판. */
const withHeading = (): PageDocument =>
  pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-a', type: 'Text', props: {} },
      { id: 'n-b', type: 'Divider', props: {} },
      { id: 'n-bob', type: 'Heading', props: {} },
    ],
  })

const CONFLICT = { status: 409, code: 'conflict', message: '페이지가 이미 변경되었습니다' }
/** 서버 판이 그대로인 거절 — 수습이 판을 다시 읽어도 바탕은 서버 것 그대로다. */
const LOCKED = { status: 423, code: 'locked', message: '밥님이 편집 중인 노드입니다' }

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

async function mount(options: { immediate?: (pageId: string) => PageDetail | undefined; api?: Partial<ApiClient> } = {}) {
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
  await openPage(pair(), { realtime: setup, apiOverrides: { ...options.api, getPage } })
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
    fireEvent.click(within(tree).getByRole('button', { name: structureRowName('Text') }))
    fireEvent.click(treeTool(tree, '아래로'))
    await act(async () => {})
    const sent = patches()
    return sent[sent.length - 1]!
  }
  const ack = (patch: SentPatch, seq: number): void =>
    push({ type: 'patch-ack', projectId: PROJECT_ID, pageId: patch.pageId, clientOpId: patch.clientOpId, seq, revisionId: `rev-${seq}`, inverse: [], warnings: [] })
  /** 거절한다 — 기본은 낡음(409). 서버 판이 그대로인 거절(423 잠금 등)은 `reason`으로 준다. */
  const refuse = (patch: SentPatch, reason: { status: number; code: string; message: string } = CONFLICT): void =>
    push({ type: 'patch-error', projectId: PROJECT_ID, pageId: patch.pageId, clientOpId: patch.clientOpId, ...reason, issues: [] })
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
    await waitFor(() => expect(screen.queryByText(/스냅샷이 복원됐습니다/)).toBeNull())
    expect(structureTypes()).toEqual(['Page', 'Divider', 'Text'])
    expect(alertText()).toBe('복원된 상태로 페이지를 다시 불러왔습니다. 되돌리기 이력이 초기화됐습니다.')
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
      '복원된 상태로 페이지를 다시 불러왔습니다. 보낸 편집 1개는 답을 받기 전이라 서버에 반영됐는지 알 수 없습니다 — ' +
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
      '복원된 상태로 페이지를 다시 불러왔습니다. 보낸 편집 1개는 답을 받기 전이라 서버에 반영됐는지 알 수 없습니다 — ' +
        '새로고침해 서버 상태를 확인하세요.',
    )
  })

  /** 서버가 그 번호로 기록한 것은 보낸 ops 그대로이고, 그 번호 바로 앞의 판이 지금 판이다 — «반영됐다면 곧 나타납니다»가 참이 된다. */
  it('늦은 ack 가 그 판 바로 뒤의 번호면 그 편집을 얹는다', async () => {
    const { view, sent } = await abandoned()

    view.ack(sent, HEAD_SEQ + 1)
    await act(async () => {})

    expect(structureTypes()).toEqual(['Page', 'Divider', 'Text'])
    expect(statusText()).not.toContain('받지 못한 변경')
    // 다음 편집(Text 를 위로)은 그 번호 위에서 나간다.
    const tree = screen.getByRole('region', { name: '구조 트리' })
    fireEvent.click(within(tree).getByRole('button', { name: structureRowName('Text') }))
    fireEvent.click(treeTool(tree, '위로'))
    await act(async () => {})
    expect(view.patches()).toHaveLength(2)
    expect(view.patches()[1]?.baseSeq).toBe(HEAD_SEQ + 1)
  })

  it('늦은 ack 가 번호를 건너뛰면 얹지 않고 화면이 최신이 아니라고 말한다', async () => {
    const { view, sent } = await abandoned()

    view.ack(sent, HEAD_SEQ + 2)
    await act(async () => {})

    expect(statusText()).toContain('받지 못한 변경이 있어 화면이 최신이 아닙니다')
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

  /** 떠나기 전 화면에는 그 편집이 서 있었다 — 그 거절을 말없이 넘기면 사용자는 저장된 줄 안다(Chrome: 서버 1쪽에 지운 글이 남음). */
  it('떠난 페이지에서 보낸 편집이 거절되면 말한다 — 수습은 하지 않고 새 페이지의 편집은 나간다', async () => {
    const view = await mount({ immediate: (pageId) => (pageId === OTHER_PAGE_ID ? pageDetail(pageId, pair()) : undefined) })
    const first = await view.moveDown()
    fireEvent.click(screen.getByRole('link', { name: OTHER_PAGE_TITLE }))
    await waitFor(() => expect(structureTypes()).toEqual(['Page', 'Text', 'Divider']))
    await view.moveDown()

    view.refuse(first)
    await act(async () => {})

    expect(alertText()).toBe(
      '페이지가 이미 변경되었습니다 — 떠난 페이지에서 보낸 편집 1개가 저장되지 않았습니다. 그 페이지를 다시 열어 확인하세요.',
    )
    expect(view.getPage).toHaveBeenCalledTimes(2)
    expect(view.patches().map((patch) => patch.pageId)).toEqual([PAGE_ID, OTHER_PAGE_ID])
  })
})

/**
 * **떠나며 버린 편집은 전부 센다**(`EditorStore.clearPage`의 반환 · `abandonedUnsent`). 답을 기다리는 편집 뒤에 쌓인 편집은 서버에 한 번도
 * 안 갔다 — 떠나는 순간 말하고(`leftUnsentNotice`), 기다리던 편집이 거절되거나 답을 못 받으면 둘을 합쳐 말한다(`leftBehindNotice`).
 */
describe('떠나며 버린 편집의 수', () => {
  const LEFT_UNSENT = '떠난 페이지에서 아직 보내지 않은 편집 1개는 저장되지 않았습니다 — 그 페이지를 다시 열어 확인하세요.'

  /** «아래로»를 보내 답을 기다리는 채 «위로»를 큐에 세우고 다른 페이지로 옮긴다. */
  async function leaveWithQueue() {
    const view = await mount({ immediate: (pageId) => (pageId === OTHER_PAGE_ID ? pageDetail(pageId, pair()) : undefined) })
    const sent = await view.moveDown()
    const tree = screen.getByRole('region', { name: '구조 트리' })
    fireEvent.click(within(tree).getByRole('button', { name: structureRowName('Text') }))
    fireEvent.click(treeTool(tree, '위로'))
    await act(async () => {})
    expect(view.patches()).toHaveLength(1)
    fireEvent.click(screen.getByRole('link', { name: OTHER_PAGE_TITLE }))
    await waitFor(() => expect(structureTypes()).toEqual(['Page', 'Text', 'Divider']))
    return { view, sent }
  }

  it('안 보낸 편집은 떠나는 순간 말한다 — 답을 기다리던 편집이 저장돼도 그대로다', async () => {
    const { view, sent } = await leaveWithQueue()
    expect(alertText()).toBe(LEFT_UNSENT)

    view.ack(sent, HEAD_SEQ + 1)
    await act(async () => {})

    expect(alertText()).toBe(LEFT_UNSENT)
    expect(view.patches()).toHaveLength(1)
  })

  it('답을 기다리던 편집이 거절되면 보낸 것과 안 보낸 것을 합쳐 말한다', async () => {
    const { view, sent } = await leaveWithQueue()

    view.refuse(sent)
    await act(async () => {})

    expect(alertText()).toBe(
      '페이지가 이미 변경되었습니다 — 떠난 페이지에서 보낸 편집 1개와 보내지 않은 편집 1개가 저장되지 않았습니다. 그 페이지를 다시 열어 확인하세요.',
    )
  })

  it('답을 기다리던 편집의 답을 못 받으면 모른다고 말하고 안 보낸 것을 함께 센다', async () => {
    const { view } = await leaveWithQueue()

    // 연결이 끊기면 채널이 답을 기다리던 편집을 실패시킨다 — 서버에 닿았는지 모른다.
    view.reconnect()
    await act(async () => {})

    expect(alertText()).toBe(
      '떠난 페이지에서 보낸 편집 1개는 답을 받지 못해 서버에 반영됐는지 알 수 없고, 보내지 않은 편집 1개는 저장되지 않았습니다 — ' +
        '그 페이지를 다시 열어 확인하세요.',
    )
  })

  it('떠남의 통지는 또 옮겨도 남는다 — 판을 비우는 자리가 지우지 않는다', async () => {
    const { view } = await leaveWithQueue()
    expect(alertText()).toBe(LEFT_UNSENT)

    fireEvent.click(screen.getByRole('link', { name: '회원 목록' }))
    await waitFor(() => expect(view.held).toHaveLength(1))

    expect(alertText()).toBe(LEFT_UNSENT)
  })

  /** 답을 기다리는 동안 옮겨 간 페이지에서 친 편집도 그 답 뒤에 줄 서 한 번도 안 나간다 — 거절의 문장이 두 떠남을 합쳐 센다. */
  it('답을 기다리는 동안 두 번 떠나면 거절의 문장이 두 페이지의 것을 합쳐 센다', async () => {
    const { view, sent } = await leaveWithQueue()
    await view.moveDown()
    expect(view.patches()).toHaveLength(1)
    fireEvent.click(screen.getByRole('link', { name: '회원 목록' }))
    await waitFor(() => expect(view.held).toHaveLength(1))

    view.refuse(sent)
    await act(async () => {})

    expect(alertText()).toBe(
      '페이지가 이미 변경되었습니다 — 떠난 페이지 2곳에서 보낸 편집 1개와 보내지 않은 편집 2개가 저장되지 않았습니다. ' +
        '그 페이지들을 다시 열어 확인하세요.',
    )
  })

  it('떠난 페이지를 다시 열면 떠남의 통지가 풀린다', async () => {
    const { view } = await leaveWithQueue()
    expect(alertText()).toBe(LEFT_UNSENT)

    fireEvent.click(screen.getByRole('link', { name: '회원 목록' }))
    await waitFor(() => expect(view.held).toHaveLength(1))
    await act(async () => {
      view.held[0]!.resolve(pageDetail(PAGE_ID, pair()))
    })
    await waitFor(() => expect(structureTypes()).toEqual(['Page', 'Text', 'Divider']))

    expect(alertText()).toBe('')
  })

  it('떠남의 통지는 닫는 단추로 닫는다', async () => {
    await leaveWithQueue()
    expect(alertText()).toBe(LEFT_UNSENT)

    fireEvent.click(screen.getByRole('button', { name: '통지 닫기' }))

    expect(alertText()).toBe('')
    expect(screen.queryByRole('button', { name: '통지 닫기' })).toBeNull()
  })

  /** 닫는 단추는 떠남의 통지에만 있다 — 다른 통지는 페이지를 옮기면 판을 비우며 지워진다. */
  it('다른 통지에는 닫는 단추가 없다', async () => {
    const view = await mount({ immediate: () => pageDetail(PAGE_ID, pair()) })
    const sent = await view.moveDown()
    view.refuse(sent)
    await waitFor(() => expect(alertText()).toContain('편집 1개가 취소됐습니다'))

    expect(screen.queryByRole('button', { name: '통지 닫기' })).toBeNull()
  })

  it('떠난 뒤 온 거절의 통지도 또 옮겨도 남는다', async () => {
    const { view, sent } = await leaveWithQueue()
    view.refuse(sent)
    await act(async () => {})
    const refused = alertText()
    expect(refused).toContain('보낸 편집 1개와 보내지 않은 편집 1개가 저장되지 않았습니다')

    fireEvent.click(screen.getByRole('link', { name: '회원 목록' }))
    await waitFor(() => expect(view.held).toHaveLength(1))

    expect(alertText()).toBe(refused)
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
    expect(screen.queryByText(/스냅샷이 복원됐습니다/)).toBeNull()
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
    fireEvent.click(within(tree).getByRole('button', { name: structureRowName('Divider') }))
    fireEvent.click(treeTool(tree, '아래로'))
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
    fireEvent.click(treeTool(tree, '위로'))
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

describe('편집 실패 수습이 판을 되돌리기 전에 재연결 재조회가 판을 정하면', () => {
  /**
   * 수습은 큐만 비우고(`failEdits`) 화면은 그 조회의 답이 되돌린다. 그 답이 한도(3s)를 넘겨 붙잡힌 사이 다시 붙은 연결의 재조회가
   * 서버 판을 읽는다 — 바탕만 견주면 «같다»로 판을 정해 수습의 답이 세대에 밀리고, 거절된 편집이 화면에 남는다.
   */
  it('수습의 답이 붙잡혀도 재연결 재조회가 거절된 편집을 걷는다 — 통지가 말하는 대로 화면이 서버 판이다', async () => {
    let calls = 0
    const view = await mount({
      immediate: () => {
        calls += 1
        // 첫째(수습)는 붙잡고, 둘째(재연결)는 서버 판 그대로 곧바로 답한다.
        return calls === 1 ? undefined : pageDetail(PAGE_ID, pair())
      },
    })
    const sent = await view.moveDown()
    view.refuse(sent, LOCKED)
    await waitFor(() => expect(view.held).toHaveLength(1))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    view.reconnect()
    await act(async () => {
      vi.advanceTimersByTime(3_000)
    })
    await act(async () => {})
    vi.useRealTimers()
    await waitFor(() => expect(view.getPage).toHaveBeenCalledTimes(3))
    await waitFor(() => expect(structureTypes()).toEqual(['Page', 'Text', 'Divider']))

    await act(async () => {
      view.held[0]!.resolve(pageDetail(PAGE_ID, pair()))
    })
    await act(async () => {})

    expect(structureTypes()).toEqual(['Page', 'Text', 'Divider'])
    expect(alertText()).toBe('밥님이 편집 중인 노드입니다 — 페이지를 서버 상태로 다시 불러왔고, 편집 1개가 취소됐습니다.')
  })

  /** 수습의 재조회까지 실패하면 화면에 저장 안 된 편집이 남은 채 수습이 끝난다(«새로고침해 …»). 다시 붙으면 그 판을 싣는다. */
  it('수습의 재조회까지 실패해 거절된 편집이 화면에 남았으면 다시 붙을 때 싣는다', async () => {
    const view = await mount()
    const sent = await view.moveDown()
    view.refuse(sent, LOCKED)
    await waitFor(() => expect(view.held).toHaveLength(1))
    await act(async () => {
      view.held[0]!.reject(new ApiError(503, 'internal', '데이터베이스에 연결할 수 없습니다', [], true))
    })
    await waitFor(() => expect(alertText()).toContain('화면에 남아 있는 편집은 저장되지 않았습니다'))
    expect(structureTypes()).toEqual(['Page', 'Divider', 'Text'])

    view.reconnect()
    await waitFor(() => expect(view.held).toHaveLength(2))
    await act(async () => {
      view.held[1]!.resolve(pageDetail(PAGE_ID, pair()))
    })

    await waitFor(() => expect(structureTypes()).toEqual(['Page', 'Text', 'Divider']))
  })
})

describe('편집 실패 수습은 그 편집이 나간 큐만 비운다', () => {
  /**
   * 1쪽의 나간 편집(«아래로»)을 남의 변경이 리베이스에서 버린다 — 그 편집은 큐에 없고 답(409)은 아직 안 왔다. 남은 **옮기는 노드(Text)를**
   * 지운다 — 리베이스는 노드 id 로 경로를 다시 지으므로(`store/anchored-ops.ts`) 옮길 노드가 사라져야 버린다.
   */
  async function rebaseDropped(immediate: (pageId: string) => PageDetail | undefined) {
    const view = await mount({ immediate })
    const first = await view.moveDown()
    view.push({
      type: 'page-changed',
      projectId: PROJECT_ID,
      pageId: PAGE_ID,
      seq: HEAD_SEQ + 1,
      ops: [{ op: 'remove', path: '/root/children/0' }],
      warnings: [],
      actor: { type: 'user', label: '밥' },
    })
    await act(async () => {})
    expect(alertText()).toBe('다른 사람의 변경과 겹쳐 아직 저장되지 않은 편집 1개를 버렸습니다.')
    return { view, first }
  }

  const openLink = async (title: string, view: Awaited<ReturnType<typeof mount>>, calls: number): Promise<void> => {
    fireEvent.click(screen.getByRole('link', { name: title }))
    await waitFor(() => expect(view.getPage).toHaveBeenCalledTimes(calls))
    await waitFor(() => expect(structureTypes()).toEqual(['Page', 'Text', 'Divider']))
  }

  it('페이지를 옮긴 뒤 온 거절은 새 페이지의 큐를 비우지 않는다 — 새 페이지의 편집이 나간다', async () => {
    const { view, first } = await rebaseDropped((pageId) => (pageId === OTHER_PAGE_ID ? pageDetail(pageId, pair()) : undefined))
    await openLink(OTHER_PAGE_TITLE, view, 2)
    await view.moveDown()
    expect(view.patches()).toHaveLength(1)

    view.refuse(first)
    await act(async () => {})

    expect(view.patches().map((patch) => [patch.pageId, patch.baseSeq])).toEqual([
      [PAGE_ID, HEAD_SEQ],
      [OTHER_PAGE_ID, HEAD_SEQ],
    ])
    expect(view.getPage).toHaveBeenCalledTimes(2)
    expect(structureTypes()).toEqual(['Page', 'Divider', 'Text'])
    expect(alertText()).toBe('')
  })

  /** 떠났다 돌아오면 페이지 id 는 같지만 큐는 다시 연 판 위의 것이다 — 그 편집도 나간다. */
  it('1쪽 → 2쪽 → 1쪽으로 돌아와도 다시 연 판의 큐를 비우지 않는다', async () => {
    const { view, first } = await rebaseDropped((pageId) =>
      pageId === OTHER_PAGE_ID ? pageDetail(pageId, pair()) : { ...pageDetail(pageId, pair()), headSeq: HEAD_SEQ + 1 },
    )
    await openLink(OTHER_PAGE_TITLE, view, 2)
    await openLink('회원 목록', view, 3)
    await view.moveDown()
    expect(view.patches()).toHaveLength(1)

    view.refuse(first)
    await act(async () => {})

    expect(view.patches().map((patch) => [patch.pageId, patch.baseSeq])).toEqual([
      [PAGE_ID, HEAD_SEQ],
      [PAGE_ID, HEAD_SEQ + 1],
    ])
    expect(view.getPage).toHaveBeenCalledTimes(3)
    expect(alertText()).toBe('')
  })
})

describe('다시 읽는 창 안에 온 revision', () => {
  it('실린 판이 내 편집의 커밋 앞을 읽었으면 그 편집을 판 뒤에 얹는다', async () => {
    const view = await mount()
    const sent = await view.moveDown()
    view.push(RESTORED)
    fireEvent.click(reloadButton())
    await act(async () => {})
    view.ack(sent, HEAD_SEQ + 1)
    await waitFor(() => expect(view.held).toHaveLength(1))
    // 읽는 동안 낸 편집(Text 를 위로) — 나가서 ack 된다.
    const tree = screen.getByRole('region', { name: '구조 트리' })
    fireEvent.click(within(tree).getByRole('button', { name: structureRowName('Text') }))
    fireEvent.click(treeTool(tree, '위로'))
    await act(async () => {})
    view.ack(view.patches()[1]!, HEAD_SEQ + 2)
    await act(async () => {})

    // 조회는 둘째 편집의 커밋 앞을 읽었다.
    await act(async () => {
      view.held[0]!.resolve({ ...pageDetail(PAGE_ID, swapped()), headSeq: HEAD_SEQ + 1 })
    })
    await act(async () => {})

    expect(structureTypes()).toEqual(['Page', 'Text', 'Divider'])
    expect(statusText()).not.toContain('받지 못한 변경')
    await view.moveDown()
    expect(view.patches()).toHaveLength(3)
    expect(view.patches()[2]?.baseSeq).toBe(HEAD_SEQ + 2)
  })

  /** 재연결 재조회는 사람이 누르지 않고 돈다 — 치는 중에 이 창이 열린다. */
  it('재연결 재조회의 판에도 창 안에서 ack 된 편집을 얹는다', async () => {
    const view = await mount()
    view.reconnect()
    await waitFor(() => expect(view.held).toHaveLength(1))
    const sent = await view.moveDown()
    view.ack(sent, HEAD_SEQ + 1)
    await act(async () => {})

    await act(async () => {
      view.held[0]!.resolve(pageDetail(PAGE_ID, pair()))
    })
    await act(async () => {})

    expect(structureTypes()).toEqual(['Page', 'Divider', 'Text'])
    expect(statusText()).not.toContain('받지 못한 변경')
  })

  it('창 안에 얹힌 남의 프레임이 옛 답에 지워지지 않는다', async () => {
    const view = await mount()
    view.reconnect()
    await waitFor(() => expect(view.held).toHaveLength(1))
    view.push(BOB_ADDS(HEAD_SEQ + 1))
    expect(structureTypes()).toEqual(['Page', 'Text', 'Divider', 'Heading'])

    await act(async () => {
      view.held[0]!.resolve(pageDetail(PAGE_ID, pair()))
    })
    await act(async () => {})

    expect(structureTypes()).toEqual(['Page', 'Text', 'Divider', 'Heading'])
    expect(statusText()).not.toContain('받지 못한 변경')
  })

  /** 판 뒤의 번호가 이어지지 않으면(사이 revision 을 못 받았다) 얹지 않고 말한다. */
  it('창 안의 번호가 실린 판에 이어지지 않으면 화면이 최신이 아니라고 말한다', async () => {
    const view = await mount()
    // 단추의 다시 읽기는 늘 싣는다(재연결은 «판이 같다»로 넘어갈 수 있다).
    view.push(RESTORED)
    fireEvent.click(reloadButton())
    await waitFor(() => expect(view.held).toHaveLength(1))
    view.push(BOB_ADDS(HEAD_SEQ + 2))

    await act(async () => {
      view.held[0]!.resolve(pageDetail(PAGE_ID, pair()))
    })
    await act(async () => {})

    expect(structureTypes()).toEqual(['Page', 'Text', 'Divider'])
    expect(statusText()).toContain('받지 못한 변경이 있어 화면이 최신이 아닙니다')
  })

  /**
   * 뒤에 시작한 조회가 먼저 읽힌 판(두 연결의 순서가 뒤집혔다) — 뒤 조회의 답이 판을 정해 앞 조회의 새 답은 세대에 밀린다. 그 사이의
   * 커밋은 뒤 조회가 시작된 뒤 프레임으로 왔으므로 뒤 조회의 판 뒤에 얹힌다.
   */
  it('뒤에 시작한 조회가 먼저 읽혀도 그 뒤의 커밋이 판에 남는다', async () => {
    const view = await mount()
    view.reconnect()
    await waitFor(() => expect(view.held).toHaveLength(1))
    view.push(RESTORED)
    fireEvent.click(reloadButton())
    await waitFor(() => expect(view.held).toHaveLength(2))
    view.push(BOB_ADDS(HEAD_SEQ + 1))

    // 뒤 조회(단추)는 그 커밋 앞을 읽었다.
    await act(async () => {
      view.held[1]!.resolve(pageDetail(PAGE_ID, pair()))
    })
    // 앞 조회(재연결)는 그 뒤를 읽었지만 세대에 밀린다.
    await act(async () => {
      view.held[0]!.resolve({ ...pageDetail(PAGE_ID, withHeading()), headSeq: HEAD_SEQ + 1 })
    })
    await act(async () => {})

    expect(structureTypes()).toEqual(['Page', 'Text', 'Divider', 'Heading'])
    expect(statusText()).not.toContain('받지 못한 변경')
  })

  /**
   * 복원 앞의 번호를 복원 뒤 판과 견주지 않는다. 답의 번호(1)가 창의 번호보다 작은 판이다 — 서버는 되살린 페이지를 옛 판본이 쓴 번호
   * 뒤에서 세므로 서버에서는 안 서지만, 창을 버리는 장치(`markRestored`)는 번호와 무관하게 선다.
   */
  it('창 안에서 복원이 알려지면 그 앞의 번호를 버린다 — 되살린 판에 거짓 낡음을 세우지 않는다', async () => {
    const view = await mount()
    view.push(RESTORED)
    fireEvent.click(reloadButton())
    await waitFor(() => expect(view.held).toHaveLength(1))
    const sent = await view.moveDown()
    view.ack(sent, HEAD_SEQ + 1)
    await act(async () => {})
    view.push(RESTORED)

    await act(async () => {
      view.held[0]!.resolve({ ...pageDetail(PAGE_ID, pair()), headSeq: 1 })
    })
    await act(async () => {})

    expect(statusText()).not.toContain('받지 못한 변경')
  })
})

/** 내 복원이 부르는 스냅샷 하나와 그 결과 — 팝오버가 그리는 데 쓰는 값만 맞춘다(`test/shell/snapshots-panel.test.tsx`). */
const SNAPSHOT: SnapshotSummary = {
  id: 's1',
  tag: 'v1',
  description: null,
  createdBy: 'u1',
  createdByName: '홍길동',
  createdAt: '2026-08-12T09:00:00.000Z',
  payloadBytes: 10,
}
const RESTORE_RESULT: RestoreResult = {
  summary: {
    menu: { created: 0, updated: 0, deleted: 0 },
    pages: { created: 0, metaUpdated: 0, schemaChanged: 1, schemaUnchanged: 0, deleted: 0 },
    comments: { created: 0, updated: 0, deleted: 0 },
  },
  safetySnapshot: { id: 's9', tag: '복원 전' },
}

/**
 * **판을 싣는 입구마다 창 안의 남의 프레임 · 내 ack 가 옛 답 뒤에 남는다**(`EditorStore.beginPageLoad`의 표). 판은 늘 «입구가 조회를 시작
 * → 그 사이 revision 이 옴 → 조회의 답이 그 revision 앞의 판»이다.
 *
 * | 입구 | 남의 프레임 | 내 ack |
 * |---|---|---|
 * | 페이지 열기 | «열기 — …남의 프레임» | «열기 — 떠났다 돌아오는 …» |
 * | 재연결 재조회 | «창 안에 얹힌 남의 프레임이 옛 답에 지워지지 않는다»(위 묶음) | «재연결 재조회의 판에도 …»(위 묶음) |
 * | 배너 «다시 불러오기» | «배너 — …» | «실린 판이 내 편집의 커밋 앞을 읽었으면 …»(위 묶음) |
 * | 편집 실패 수습 | «수습 — …» | **서지 않는다** — 전송 루프가 수습을 기다리는 동안(`await recover`) 편집을 안 낸다 |
 * | 내 복원 | «내 복원 — …» 둘 | |
 *
 * 열기가 따로 걸리는 입구다 — 여는 길은 조회 전에 판을 비우므로 그 페이지의 revision 이 «열린 페이지 아님»으로 빠지기 쉽다
 * (`EditorStore`의 `#openingPageId`가 그 창을 적는다). 나머지는 같은 페이지를 다시 싣는 입구다.
 *
 * 복원 신호가 조회 도중에 오는 판도 입구마다 다르게 아프다 — 여는 조회의 답을 버리면 캔버스가 «불러오는 중»에 머물고, 수습의 답을 버리면
 * 거절된 편집이 화면에 남는다. 그래서 답은 싣고 복원 배너만 둔다(«…복원이 알려지면 …» 둘).
 */
describe('입구마다 — 창 안의 revision 이 옛 답 뒤에 남는다', () => {
  it('열기 — 여는 조회가 읽은 뒤 온 그 페이지의 남의 프레임이 실린 판에 남는다', async () => {
    const view = await mount()
    fireEvent.click(screen.getByRole('link', { name: OTHER_PAGE_TITLE }))
    await waitFor(() => expect(view.held).toHaveLength(1))
    view.push(BOB_ADDS(HEAD_SEQ + 1, OTHER_PAGE_ID))

    await act(async () => {
      view.held[0]!.resolve(pageDetail(OTHER_PAGE_ID, pair()))
    })
    await act(async () => {})

    expect(structureTypes()).toEqual(['Page', 'Text', 'Divider', 'Heading'])
    expect(statusText()).not.toContain('받지 못한 변경')
    // 다음 편집은 그 번호 위에서 나간다 — 옛 번호로 나가 409 로 취소되지 않는다.
    const next = await view.moveDown()
    expect(next).toMatchObject({ pageId: OTHER_PAGE_ID, baseSeq: HEAD_SEQ + 1 })
  })

  it('열기 — 다른 페이지의 프레임은 여는 페이지의 판에 얹지 않는다', async () => {
    const view = await mount()
    fireEvent.click(screen.getByRole('link', { name: OTHER_PAGE_TITLE }))
    await waitFor(() => expect(view.held).toHaveLength(1))
    view.push(BOB_ADDS(HEAD_SEQ + 1, PAGE_ID))

    await act(async () => {
      view.held[0]!.resolve(pageDetail(OTHER_PAGE_ID, pair()))
    })
    await act(async () => {})

    expect(structureTypes()).toEqual(['Page', 'Text', 'Divider'])
  })

  it('열기 — 떠났다 돌아오는 여는 조회의 창에 온 내 편집의 ack 가 실린 판에 남는다', async () => {
    const view = await mount({ immediate: (pageId) => (pageId === OTHER_PAGE_ID ? pageDetail(pageId, pair()) : undefined) })
    const sent = await view.moveDown()
    fireEvent.click(screen.getByRole('link', { name: OTHER_PAGE_TITLE }))
    await waitFor(() => expect(structureTypes()).toEqual(['Page', 'Text', 'Divider']))
    fireEvent.click(screen.getByRole('link', { name: '회원 목록' }))
    await waitFor(() => expect(view.held).toHaveLength(1))
    view.ack(sent, HEAD_SEQ + 1)
    await act(async () => {})

    await act(async () => {
      view.held[0]!.resolve(pageDetail(PAGE_ID, pair()))
    })
    await act(async () => {})

    expect(structureTypes()).toEqual(['Page', 'Divider', 'Text'])
    expect(statusText()).not.toContain('받지 못한 변경')
  })

  it('배너 — 단추의 조회가 읽은 뒤 온 남의 프레임이 실린 판에 남는다', async () => {
    const view = await mount()
    view.push(RESTORED)
    fireEvent.click(reloadButton())
    await waitFor(() => expect(view.held).toHaveLength(1))
    view.push(BOB_ADDS(HEAD_SEQ + 1))

    await act(async () => {
      view.held[0]!.resolve(pageDetail(PAGE_ID, pair()))
    })
    await act(async () => {})

    expect(structureTypes()).toEqual(['Page', 'Text', 'Divider', 'Heading'])
    expect(statusText()).not.toContain('받지 못한 변경')
  })

  it('수습 — 수습의 조회가 읽은 뒤 온 남의 프레임이 실린 판에 남는다', async () => {
    const view = await mount()
    const sent = await view.moveDown()
    view.refuse(sent, LOCKED)
    await waitFor(() => expect(view.held).toHaveLength(1))
    view.push(BOB_ADDS(HEAD_SEQ + 1))

    await act(async () => {
      view.held[0]!.resolve(pageDetail(PAGE_ID, pair()))
    })
    await act(async () => {})

    expect(structureTypes()).toEqual(['Page', 'Text', 'Divider', 'Heading'])
    expect(statusText()).not.toContain('받지 못한 변경')
  })

  /**
   * 복원 신호보다 앞에 시작한 조회의 답은 복원 앞을 읽었을 수 있다 — 싣되(여는 조회면 캔버스가 서야 하고, 수습이면 거절된 편집을 걷는 유일한
   * 답이다) 복원 배너를 걷지 않는다(`EditorStore`의 `#restoredAt`).
   */
  it('열기 — 여는 조회가 도는 중에 복원이 알려지면 판을 싣고 복원 배너를 둔다', async () => {
    const view = await mount()
    fireEvent.click(screen.getByRole('link', { name: OTHER_PAGE_TITLE }))
    await waitFor(() => expect(view.held).toHaveLength(1))
    view.push(RESTORED)

    await act(async () => {
      view.held[0]!.resolve(pageDetail(OTHER_PAGE_ID, pair()))
    })
    await act(async () => {})

    expect(structureTypes()).toEqual(['Page', 'Text', 'Divider'])
    expect(reloadButton()).toBeTruthy()
  })

  it('수습 — 수습의 조회가 도는 중에 복원이 알려지면 거절된 편집을 걷고 복원 배너를 둔다', async () => {
    const view = await mount()
    const sent = await view.moveDown()
    view.refuse(sent, LOCKED)
    await waitFor(() => expect(view.held).toHaveLength(1))
    view.push(RESTORED)

    await act(async () => {
      view.held[0]!.resolve(pageDetail(PAGE_ID, pair()))
    })
    await act(async () => {})

    expect(structureTypes()).toEqual(['Page', 'Text', 'Divider'])
    expect(reloadButton()).toBeTruthy()
  })

  describe('내 복원', () => {
    /** 스냅샷 팝오버에서 되돌린다 — 복원 재조회(`restoredToken`)가 붙잡힌 채 선다. */
    async function restoring() {
      const view = await mount({ api: { listSnapshots: async () => [SNAPSHOT], restoreSnapshot: async () => RESTORE_RESULT } })
      chooseFromShellMenu('스냅샷')
      await screen.findByText('v1')
      fireEvent.click(screen.getByRole('button', { name: '이 상태로 되돌리기' }))
      fireEvent.click(screen.getByRole('button', { name: '되돌린다' }))
      await waitFor(() => expect(view.held).toHaveLength(1))
      return view
    }

    it('복원 재조회가 읽은 뒤 온 남의 프레임이 실린 판에 남는다', async () => {
      const view = await restoring()
      view.push(BOB_ADDS(HEAD_SEQ + 1))

      await act(async () => {
        view.held[0]!.resolve(pageDetail(PAGE_ID, pair()))
      })
      await act(async () => {})

      expect(structureTypes()).toEqual(['Page', 'Text', 'Divider', 'Heading'])
      expect(statusText()).not.toContain('받지 못한 변경')
    })

    it('복원 재조회가 읽은 뒤 ack 된 내 편집이 실린 판에 남는다', async () => {
      const view = await restoring()
      const sent = await view.moveDown()
      view.ack(sent, HEAD_SEQ + 1)
      await act(async () => {})

      await act(async () => {
        view.held[0]!.resolve(pageDetail(PAGE_ID, pair()))
      })
      await act(async () => {})

      expect(structureTypes()).toEqual(['Page', 'Divider', 'Text'])
      expect(statusText()).not.toContain('받지 못한 변경')
    })
  })
})
