/**
 * **리베이스가 버린 나간 편집의 거절은 수습하지 않는다**(`EditorStore.wasRebaseDropped`). 남의 프레임이 내 나가 있던 편집의 자리를 지우면
 * 리베이스가 그 편집을 버리고 «버렸습니다»를 말한다 — 그 편집은 서버에서 반드시 거절된다(`baseSeq`가 남의 번호 앞이다). 그 거절을 편집
 * 실패 수습(`recover`)으로 보내면 판을 한 번 더 읽고, 큐를 비워 그 뒤에 낸 멀쩡한 편집을 버리고, «편집 0개가 취소됐습니다»로 앞 문장을
 * 덮는다(jsdom — 고치기 전 값: 조회 2 · 삭제가 한 번도 안 나감 · 통지 «…편집 1개가 취소됐습니다»).
 */
import { act, fireEvent, screen, within } from '@testing-library/react'
import type { PageDocument } from '@wirebound/schema'
import { describe, expect, it, vi } from 'vitest'
import type { PageDetail } from '../../src/api/types'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { createConnectionIdHolder, type RealtimeSetup } from '../../src/realtime/context'
import { createEditChannel } from '../../src/realtime/edit-channel'
import { HEAD_SEQ, PAGE_ID, PROJECT_ID, openPage, pageDetail, pageDoc, structureTypes } from '../editor-harness'

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

/** 셸을 열고 소켓을 붙인다. 여는 조회 뒤의 `getPage`는 붙잡는다 — 수습이 판을 다시 읽으면 부른 수로 보인다. */
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
  let calls = 0
  const getPage = vi.fn((_projectId: string, pageId: string) => {
    calls += 1
    return calls === 1 ? Promise.resolve(pageDetail(pageId, pair())) : new Promise<PageDetail>(() => {})
  })
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
  return { getPage, push, patches, tool, refuse }
}

const alertText = (): string =>
  screen
    .queryAllByRole('alert')
    .map((node) => node.textContent)
    .join(' | ')

/** «아래로»를 WS 로 내고, 답 전에 밥이 그 노드(Text)를 지운 프레임이 온다 — 리베이스가 나가 있던 편집을 버린다. */
async function rebaseDropped() {
  const view = await mount()
  await view.tool('Text', '아래로')
  const first = view.patches()[0]!
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
  expect(alertText()).toContain('편집 1개를 버렸습니다')
  return { view, first }
}

describe('리베이스가 버린 나간 편집의 거절', () => {
  it('판을 다시 읽지 않고 버렸다는 통지를 그대로 둔다', async () => {
    const { view, first } = await rebaseDropped()

    view.refuse(first)
    await act(async () => {})

    expect(view.getPage).toHaveBeenCalledTimes(1)
    expect(alertText()).toContain('편집 1개를 버렸습니다')
    expect(alertText()).not.toContain('취소됐습니다')
    expect(structureTypes()).toEqual(['Page', 'Divider'])
  })

  it('버린 뒤 낸 편집은 버리지 않고 남의 번호 위로 낸다', async () => {
    const { view, first } = await rebaseDropped()
    await view.tool('Divider', '삭제')
    expect(view.patches()).toHaveLength(1)

    view.refuse(first)
    await act(async () => {})

    expect(view.patches().map((patch) => [patch.pageId, patch.baseSeq])).toEqual([
      [PAGE_ID, HEAD_SEQ],
      [PAGE_ID, HEAD_SEQ + 1],
    ])
    expect(structureTypes()).toEqual(['Page'])
    expect(view.getPage).toHaveBeenCalledTimes(1)
  })
})
