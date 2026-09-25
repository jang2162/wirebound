/**
 * **떠난 페이지를 다시 연 뒤 온 그 편집의 거절**(`leftBehindNotice` · `EditorStore.abandonedPagesReopened`). 떠나며 버린 나간 편집의 거절은
 * «그 페이지를 다시 열어 확인하세요»로 말한다 — 이 화면은 그 페이지를 안 들고 있다. 그런데 거절이 오기 전에 그 페이지를 다시 열었으면 그
 * 문장은 이미 한 일을 하라고 한다: 서버가 커밋 전에 거절했으니 다시 연 판(언제 읽었든)이 곧 서버 상태다. 결과를 모르는 답이면 다시 연 판이
 * 뒤늦은 커밋 앞을 읽었을 수 있다 — 그때는 그대로 둔다.
 */
import { act, fireEvent, screen, within } from '@testing-library/react'
import type { PageDocument } from '@wirebound/schema'
import { describe, expect, it, vi } from 'vitest'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { createConnectionIdHolder, type RealtimeSetup } from '../../src/realtime/context'
import { createEditChannel } from '../../src/realtime/edit-channel'
import { OTHER_PAGE_TITLE, PAGE_ID, PROJECT_ID, openPage, pageDetail, pageDoc, structureTypes } from '../editor-harness'

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

const CONFLICT = { status: 409, code: 'conflict', message: '페이지가 이미 변경되었습니다' }

interface SentPatch {
  clientOpId: string
  pageId: string
  baseSeq: number
}

/** 셸을 열고 소켓을 붙인다. */
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
      schedule: () => 0,
      cancel: () => {},
    },
  }
  // 페이지를 여는 조회는 곧바로 답한다 — 이 파일의 판은 페이지를 옮겨 다니며 선다.
  const getPage = vi.fn((_projectId: string, pageId: string) => Promise.resolve(pageDetail(pageId, pair())))
  await openPage(pair(), { realtime: setup, apiOverrides: { getPage } })
  act(() => {
    sockets[0]?.onopen?.()
  })
  const push = (frame: object): void => {
    act(() => {
      sockets[sockets.length - 1]!.onmessage?.({ data: JSON.stringify(frame) })
    })
  }
  const patches = (): SentPatch[] =>
    sockets.flatMap((socket) => socket.sent.filter((raw) => raw.includes('"patch"')).map((raw) => JSON.parse(raw) as SentPatch))
  const tool = async (node: string, label: string): Promise<void> => {
    const tree = screen.getByRole('region', { name: '구조 트리' })
    fireEvent.click(within(tree).getByRole('button', { name: node }))
    fireEvent.click(within(within(tree).getByRole('group', { name: '구조 편집' })).getByRole('button', { name: label }))
    await act(async () => {})
  }
  const refuse = (patch: SentPatch): void =>
    push({ type: 'patch-error', projectId: PROJECT_ID, pageId: patch.pageId, clientOpId: patch.clientOpId, ...CONFLICT, issues: [] })
  /** 답을 못 받은 채 소켓이 닫힌다 — 나간 편집은 결과를 모른다. */
  const drop = (): void => {
    act(() => {
      sockets[sockets.length - 1]!.onclose?.()
    })
  }
  return { getPage, push, patches, tool, refuse, drop }
}

const alertText = (): string =>
  screen
    .queryAllByRole('alert')
    .map((node) => node.textContent)
    .join(' | ')

const REOPEN = /다시 열어 확인하세요/

/** 1쪽에서 «아래로»를 내고(답 전) 2쪽으로 옮긴다. `back`이면 1쪽으로 돌아온다. */
async function leaveWithSent(back: boolean) {
  const view = await mount()
  await view.tool('Text', '아래로')
  const sent = view.patches()[0]!
  fireEvent.click(screen.getByRole('link', { name: OTHER_PAGE_TITLE }))
  await act(async () => {})
  expect(view.getPage).toHaveBeenCalledTimes(2)
  if (back) {
    fireEvent.click(screen.getByRole('link', { name: '회원 목록' }))
    await act(async () => {})
    expect(view.getPage).toHaveBeenCalledTimes(3)
    expect(structureTypes()).toEqual(['Page', 'Text', 'Divider'])
  }
  return { view, sent }
}

describe('떠난 페이지의 거절 — 다시 연 뒤에 왔다', () => {
  it('서버가 거절했으면 저장되지 않았다고만 말한다 — 다시 열라고 하지 않는다', async () => {
    const { view, sent } = await leaveWithSent(true)

    view.refuse(sent)
    await act(async () => {})

    expect(alertText()).toBe('페이지가 이미 변경되었습니다 — 떠난 페이지에서 보낸 편집 1개가 저장되지 않았습니다.')
  })

  it('아직 다시 안 열었으면 다시 열라고 한다', async () => {
    const { view, sent } = await leaveWithSent(false)

    view.refuse(sent)
    await act(async () => {})

    expect(alertText()).toMatch(REOPEN)
  })

  it('답을 못 받았으면 다시 열었어도 다시 열라고 한다 — 다시 연 판이 뒤늦은 커밋 앞일 수 있다', async () => {
    const { view } = await leaveWithSent(true)

    view.drop()
    await act(async () => {})

    expect(alertText()).toMatch(/반영됐는지 알 수 없습니다/)
    expect(alertText()).toMatch(REOPEN)
    // 그 통지는 가리키는 페이지를 다시 열면 풀린다(`EditorStore.setLeaveNotice`의 `pages`) — 다시 열라고 했으니 가리킬 페이지를 든다.
    fireEvent.click(screen.getByRole('link', { name: OTHER_PAGE_TITLE }))
    await act(async () => {})
    fireEvent.click(screen.getByRole('link', { name: '회원 목록' }))
    await act(async () => {})
    expect(alertText()).not.toMatch(REOPEN)
  })
})
