/**
 * **내 편집의 ack 가 닿기 전에 누른 되돌리기 · 다시 실행은 ack 까지 미뤘다가 그 편집에 한다**(`edit/use-edit-commit.tsx` 의 `afterAck` ·
 * `EditorStore.awaitsStackAck`). 스택은 ack 가 쌓으므로 미루지 않으면 누른 것이 그 앞 항목을 되돌린다 — 실브라우저 판은
 * `build-test/editor-undo-before-ack.test.ts`(페이지가 통째로 비었다).
 *
 * | 입구 | 끝 |
 * |---|---|
 * | ack 전 누름 | ack 가 닿으면 스택 맨 위가 바뀐 것을 보고 한 번 되돌린다 |
 * | 미루는 동안 같은 키를 또 누름 | 버린다 — 되돌림은 한 단계만 나간다 |
 * | 답이 거절(`patch-error`) | 미룬 것은 버린다 · 앞 항목을 되돌리지 않는다 |
 * | 한도(3s) 지남 | 말하고 안 한다 · ack 가 그 뒤에 오면 그 문장을 거둔다 · 되돌리지 않는다 |
 * | 미루는 동안 페이지를 옮김 | 버린다 — 새 판에 아무것도 안 나간다 |
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { PageDocument, PatchOp } from '@wirebound/schema'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RevisionSummary } from '../../src/api/types'
import { UNDO_ACK_WAIT_MS } from '../../src/edit/use-edit-commit'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { createConnectionIdHolder } from '../../src/realtime/context'
import { createEditChannel } from '../../src/realtime/edit-channel'
import { HEAD_SEQ, OTHER_PAGE_TITLE, PAGE_ID, PROJECT_ID, canvasQueryAll, openPage, pageDoc, waitForNode } from '../editor-harness'
import '../../src/catalog-setup'
import { structureRowName } from '../panels/tree-row'

class FakeSocket implements RealtimeSocket {
  onopen: (() => void) | null = null
  onmessage: ((event: { data: unknown }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  readonly sent: unknown[] = []
  send(data: string): void {
    this.sent.push(JSON.parse(data))
  }
  close(): void {
    this.onclose?.()
  }
}

const text = (id: string, content: string) => ({ id, type: 'Text', props: { content, role: 'body' } })
const doc = (): PageDocument => pageDoc({ id: 'n-root', type: 'Page', children: [text('n-ga', '가'), text('n-na', '나')] })
const OLD_ENTRY: RevisionSummary = {
  id: `rev-${HEAD_SEQ}`,
  seq: HEAD_SEQ,
  actorType: 'user',
  actorId: 'u-1',
  actorLabel: 'u-1',
  ops: [],
  inverse: [{ op: 'replace', path: '/root/children/1/props/content', value: '옛 나' }],
  createdAt: '2026-09-25T09:00:00.000Z',
}
const INVERSE: PatchOp[] = [{ op: 'replace', path: '/root/children/0/props/content', value: '가' }]

const undoButton = () => within(screen.getByRole('group', { name: '편집 이력' })).getByRole<HTMLButtonElement>('button', { name: '되돌리기' })
const contents = () =>
  canvasQueryAll('[data-wb-id^="n-"]')
    .filter((node) => node.getAttribute('data-wb-id') !== 'n-root')
    .map((node) => node.textContent ?? '')

/** 판 — 새로고침으로 채운 옛 항목(나) 위에서 «가» 를 고쳐 보낸다(ack 는 아직). */
async function stage(): Promise<{
  patches: () => { ops: PatchOp[]; clientOpId: string }[]
  frame: (data: Record<string, unknown>) => void
  ackFirst: () => void
  failFirst: () => void
}> {
  const sockets: FakeSocket[] = []
  await openPage(doc(), {
    realtime: {
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
    },
    apiOverrides: { listMyRevisions: async () => [OLD_ENTRY], listRevisionsBefore: async () => [] },
    docs: { 'pg-2': pageDoc({ id: 'n-root2', type: 'Page', children: [text('n-other', '다른 페이지')] }) },
  })
  act(() => sockets[0]?.onopen?.())
  await waitFor(() => expect(undoButton().disabled).toBe(false))
  const patches = () => (sockets[0]?.sent ?? []).filter((f) => (f as { type?: string }).type === 'patch') as { ops: PatchOp[]; clientOpId: string }[]
  const frame = (data: Record<string, unknown>) => act(() => sockets[0]?.onmessage?.({ data: JSON.stringify({ projectId: PROJECT_ID, pageId: PAGE_ID, warnings: [], ...data }) }))
  fireEvent.click(within(screen.getByRole('region', { name: '구조 트리' })).getAllByRole('button', { name: structureRowName('Text') })[0]!)
  const box = within(screen.getByRole('complementary', { name: '우측 패널' })).getByLabelText<HTMLTextAreaElement>('내용')
  fireEvent.change(box, { target: { value: '가 고침' } })
  fireEvent.blur(box)
  await waitFor(() => expect(patches()).toHaveLength(1))
  return {
    patches,
    frame,
    ackFirst: () => frame({ type: 'patch-ack', clientOpId: patches()[0]?.clientOpId, seq: HEAD_SEQ + 1, revisionId: 'rev-mine', inverse: INVERSE }),
    failFirst: () => frame({ type: 'patch-error', clientOpId: patches()[0]?.clientOpId, status: 409, code: 'conflict', message: '페이지가 이미 변경되었습니다', issues: [] }),
  }
}

const alerts = (): string =>
  screen
    .queryAllByRole('alert')
    .filter((node) => node.classList.contains('wb-shell-edit-alert'))
    .map((node) => node.textContent)
    .join(' | ')

afterEach(() => {
  vi.useRealTimers()
})

describe('ack 전의 되돌리기', () => {
  it('ack 전에 누르면 앞 항목이 아니라 그 편집을 ack 뒤에 되돌린다', async () => {
    const s = await stage()
    fireEvent.click(undoButton())
    await act(async () => {})
    // 미룸 — 앞 항목(나)의 inverse 가 나가지 않았다.
    expect(s.patches()).toHaveLength(1)
    s.ackFirst()
    await waitFor(() => expect(s.patches()).toHaveLength(2))
    expect({ sent: s.patches()[1]?.ops, contents: contents() }).toEqual({ sent: INVERSE, contents: ['가', '나'] })
  })

  it('미루는 동안 또 누른 것은 버린다 — 한 단계만 나간다', async () => {
    const s = await stage()
    fireEvent.click(undoButton())
    fireEvent.click(undoButton())
    s.ackFirst()
    await waitFor(() => expect(s.patches()).toHaveLength(2))
    // 되돌림의 ack 까지 받아야 둘째 누름이 있었다면 그 되돌림이 큐에서 나온다.
    s.frame({ type: 'patch-ack', clientOpId: s.patches()[1]?.clientOpId, seq: HEAD_SEQ + 2, revisionId: 'rev-undo', inverse: [{ op: 'replace', path: '/root/children/0/props/content', value: '가 고침' }] })
    await act(async () => {})
    await act(async () => {})
    expect(s.patches()).toHaveLength(2)
  })

  it('답이 거절이면 미룬 것을 버리고 앞 항목을 되돌리지 않는다', async () => {
    const s = await stage()
    fireEvent.click(undoButton())
    s.failFirst()
    await act(async () => {})
    await act(async () => {})
    // 앞 항목(나)의 inverse 가 나가지 않았다 — 거절 뒤 수습이 페이지를 다시 불러와 스택을 비운다(그래서 «맨 위가 바뀌었을 때만» 가드는 이 입구로는 안 재진다 — 보고의 표).
    // 거절은 페이지를 다시 불러와 스택을 비운다 — 되돌리기 단추도 꺼진다.
    expect(undoButton().disabled).toBe(true)
    expect(s.patches()).toHaveLength(1)
  })

  it('한도가 지나면 말하고 안 한다 — ack 가 그 뒤에 오면 그 문장을 거두고 되돌리지도 않는다', async () => {
    const s = await stage()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fireEvent.click(undoButton())
    await act(async () => {
      vi.advanceTimersByTime(UNDO_ACK_WAIT_MS + 1)
    })
    expect(alerts()).toContain('아직 서버에 닿지 않아')
    s.ackFirst()
    await act(async () => {})
    await act(async () => {})
    expect({ alert: alerts(), sent: s.patches().length }).toEqual({ alert: '', sent: 1 })
  })

  it('미루는 동안 페이지를 옮기면 버린다 — 새 판에 아무것도 안 나간다', async () => {
    const s = await stage()
    fireEvent.click(undoButton())
    fireEvent.click(within(screen.getByRole('region', { name: '메뉴·페이지 트리' })).getByRole('link', { name: OTHER_PAGE_TITLE }))
    await waitForNode('n-other')
    s.ackFirst()
    await act(async () => {})
    await act(async () => {})
    expect({ sent: s.patches().length, contents: [...new Set(contents())] }).toEqual({ sent: 1, contents: ['다른 페이지'] })
  })
})
