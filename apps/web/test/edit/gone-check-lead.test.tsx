/**
 * **사라짐에서 서버 판을 싣는 갈래의 앞머리**(L-318 — `routes/editor.tsx` 의 `goneCheck` · `PAGE_CHECK_LEAD`).
 *
 * 트리가 열린 페이지를 잃어 서버에 물었더니 페이지가 있고 판이 달랐다 — 서버 판을 싣는다. 그때 보낸 편집의 답을 못 받은 채라면(기다림 한도 3s 뒤) 그 편집은
 * 버려지고, 통지는 **이 갈래의 앞머리**로 시작한다. 이 문장은 재연결 길(`loss-notice-merge.test.tsx` 의 `연결이 다시 붙어 …`)과 앞머리만 다르다 —
 * 사라짐 갈래가 재연결의 앞머리(`RESYNC_LEAD`)나 «지워졌습니다»(`PAGE_GONE_LEAD`)를 쓰면 사람은 다른 사건을 읽는다. 실브라우저 판
 * (`build-test/n38-l141-cells.test.ts` «사라짐에서 서버 판을 싣는 갈래»)은 갈래(서버 판을 얹음)만 재고 문장은 안 잰다.
 *
 * jsdom 으로 선다 — 가짜 소켓의 `menu-changed` 프레임 · 붙잡은 `readTree` 답 · 가짜 타이머(`setTimeout` 만)로 «트리가 페이지를 잃음 → 3s 기다림 → 서버 판»
 * 을 그대로 지난다(`test/panels/menu-realtime.test.tsx` 의 «열린 페이지가 트리에서 사라지면» 과 같은 판). 실브라우저가 더 줄 값이 없다 — 재는 것은
 * 문장이고 레이아웃이 아니다.
 *
 * `PAGE_CHECK_LEAD` 는 `routes/editor.tsx` 안의 비공개 상수라 값(문장 전체)을 이 파일에 박았다 — 상수만 바꾸면 그 상수끼리 견주는 단언은 못 죽는다.
 */
import { act, fireEvent, screen, within } from '@testing-library/react'
import type { PageDocument } from '@wirebound/schema'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TreeMenuNode, TreeRead } from '../../src/api/types'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { createConnectionIdHolder, type RealtimeSetup } from '../../src/realtime/context'
import { createEditChannel } from '../../src/realtime/edit-channel'
import { HEAD_SEQ, OTHER_PAGE_ID, PAGE_ID, PROJECT_ID, openPage, pageDetail, pageDoc, structureTypes } from '../editor-harness'
import { structureRowName, treeTool } from '../panels/tree-row'

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

const pair = (): PageDocument =>
  pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-a', type: 'Text', props: {} },
      { id: 'n-b', type: 'Divider', props: {} },
    ],
  })
/** 서버 판 — 남이 고친 판(자식 하나 더). 열린 판과 다르다(`holdsServerPage` 가 거짓). */
const server = (): PageDocument =>
  pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-a', type: 'Text', props: {} },
      { id: 'n-b', type: 'Divider', props: {} },
      { id: 'n-bob', type: 'Button', props: {} },
    ],
  })

const treeOf = (withPage: boolean): TreeMenuNode[] => [
  {
    id: 'mn-1',
    title: '회원관리',
    sortOrder: 0,
    pages: withPage
      ? [
          { id: PAGE_ID, title: '회원 목록', sortOrder: 0 },
          { id: OTHER_PAGE_ID, title: '회원 상세', sortOrder: 1 },
        ]
      : [{ id: OTHER_PAGE_ID, title: '회원 상세', sortOrder: 0 }],
    children: [],
  },
]

/** 이 갈래의 앞머리 — `routes/editor.tsx` 의 `PAGE_CHECK_LEAD` 와 글자가 같다. */
const PAGE_CHECK_LEAD = '페이지를 서버 상태로 다시 불러왔습니다.'
/** 나간 편집을 버렸을 때 앞머리 뒤에 붙는 조각 — `resyncNotice` 의 «보낸 편집» 문장. */
const SENT_LOST = '보낸 편집 1개는 답을 받기 전이라 서버에 반영됐는지 알 수 없습니다 — 새로고침해 서버 상태를 확인하세요.'

/** 편집 통지 자리(`shell/edit-alert.tsx`)의 글 — 캔버스의 렌더 오류 같은 다른 `alert` 은 섞지 않는다. */
const alertText = (): string =>
  screen
    .queryAllByRole('alert')
    .filter((node) => node.classList.contains('wb-shell-edit-alert'))
    .map((node) => node.textContent)
    .join(' | ')

afterEach(() => {
  vi.useRealTimers()
})

async function mount() {
  const sockets: FakeSocket[] = []
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
      schedule: () => 1,
      cancel: () => {},
    },
  }
  const pending: ((read: TreeRead) => void)[] = []
  let treeCalls = 0
  const readTree = vi.fn(() => {
    treeCalls += 1
    if (treeCalls === 1) return Promise.resolve({ menu: treeOf(true), rev: 1 })
    return new Promise<TreeRead>((resolve) => pending.push(resolve))
  })
  let pageCalls = 0
  const getPage = vi.fn(async (_projectId: string, pageId: string) => {
    pageCalls += 1
    // 첫 부름은 여는 조회(열린 판), 그 뒤(사라짐의 확인)는 남이 고친 서버 판.
    return pageCalls === 1 ? pageDetail(pageId, pair()) : { ...pageDetail(pageId, server()), headSeq: HEAD_SEQ + 1 }
  })
  await openPage(pair(), { realtime: setup, apiOverrides: { readTree, getPage } })
  await screen.findByText('회원관리')
  act(() => {
    sockets[0]?.onopen?.()
  })
  const last = (): FakeSocket => sockets[sockets.length - 1]!
  return {
    readTree,
    getPage,
    patches: (): string[] => sockets.flatMap((socket) => socket.sent.filter((raw) => raw.includes('"patch"'))),
    /** 구조 트리에서 «Text» 를 아래로 — 편집 하나가 나가고 답(ack)이 안 온다. */
    async editWithoutAck(): Promise<void> {
      const tree = screen.getByRole('region', { name: '구조 트리' })
      fireEvent.click(within(tree).getByRole('button', { name: structureRowName('Text') }))
      fireEvent.click(treeTool(tree, '아래로'))
      await act(async () => {})
    },
    frame(rev: number): void {
      act(() => {
        last().onmessage?.({ data: JSON.stringify({ type: 'menu-changed', projectId: PROJECT_ID, rev }) })
      })
    },
    async answerTree(withPage: boolean, rev: number): Promise<void> {
      await act(async () => {
        pending[0]!({ menu: treeOf(withPage), rev })
      })
    },
  }
}

describe('사라짐에서 서버 판을 싣는 갈래의 앞머리', () => {
  it('보낸 편집이 답 없이 버려지면 통지는 이 갈래의 앞머리로 시작한다 — 재연결의 앞머리도 «지워졌습니다» 도 아니다', async () => {
    const view = await mount()
    await view.editWithoutAck()
    // 판 카나리아 — 편집이 나갔고(답 없음) 화면이 그 편집을 반영했다 · 지금 통지는 없다.
    expect(view.patches()).toHaveLength(1)
    expect(structureTypes()).toEqual(['Page', 'Divider', 'Text'])
    expect(alertText()).toBe('')
    const opened = view.getPage.mock.calls.length

    view.frame(2)
    // 판 카나리아 — 신호가 트리를 다시 받게 했다.
    expect(view.readTree).toHaveBeenCalledTimes(2)
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    // 사라짐 — 새 트리에 열린 페이지가 없다.
    await view.answerTree(false, 2)
    // 보낸 편집의 답을 기다리는 한도(3s)가 지난다.
    await act(async () => {
      vi.advanceTimersByTime(3_000)
    })
    await act(async () => {})
    await act(async () => {})
    vi.useRealTimers()

    // 판 카나리아 — 사라짐 확인이 서버에 물었고(`getPage` 하나 더) 서버 판이 실렸다(남의 Button) · 잃은 편집이 있었다(나간 편집 1개).
    expect(view.getPage.mock.calls.length).toBe(opened + 1)
    expect(structureTypes()).toEqual(['Page', 'Text', 'Divider', 'Button'])
    expect(view.patches()).toHaveLength(1)

    expect(alertText()).toBe(`${PAGE_CHECK_LEAD} ${SENT_LOST}`)
  })
})
