/**
 * **셸이 공통코드 표를 읽어 캔버스에 싣는다**(`codes/project-codes.tsx` → `canvas/canvas.tsx` 의 `codes`) — 열 때 읽기 · `codes-changed` 로 다시
 * 읽어 지운 항목이 끊김 표지로 바뀜(Review Focus 2) · 다시 붙으면 다시 읽기 · 조회 실패면 prop 글 + 한 줄. jsdom 값이다 — 표지의 그림은
 * 셸 CSS 가 그린다(실브라우저는 `apps/web/build-test/code-binding.test.ts`).
 */
import { act, screen, waitFor } from '@testing-library/react'
import type { CodeGroup, PageDocument } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { createConnectionIdHolder } from '../../src/realtime/context'
import { createEditChannel } from '../../src/realtime/edit-channel'
import { CODES_UNREAD } from '../../src/codes/project-codes'
import { PROJECT_ID, openPage, pageDoc, requireNode } from '../editor-harness'
import '../../src/catalog-setup'

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

const GROUP: CodeGroup = {
  key: 'ORDER_STATUS',
  name: '주문 상태',
  items: [
    { value: 'WAIT', name: '결제 대기', active: true },
    { value: 'DONE', name: '완료', active: true },
  ],
}

const doc = (): PageDocument =>
  pageDoc({
    id: 'n-root',
    type: 'Page',
    children: [{ id: 'n-affix', type: 'Affix', props: { text: '옛 이름' }, code: { group: 'ORDER_STATUS', item: 'WAIT' } }],
  })

async function stage(tables: (CodeGroup[] | Error)[]) {
  const sockets: FakeSocket[] = []
  let calls = 0
  const listCodes = async (): Promise<CodeGroup[]> => {
    const answer = tables[Math.min(calls, tables.length - 1)]!
    calls += 1
    if (answer instanceof Error) throw answer
    return answer
  }
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
        schedule: (run) => {
          queueMicrotask(run)
          return 1
        },
        cancel: () => {},
      },
    },
    apiOverrides: { listCodes },
  })
  act(() => sockets[0]?.onopen?.())
  return {
    calls: () => calls,
    frame: (data: Record<string, unknown>) =>
      act(() => sockets.at(-1)?.onmessage?.({ data: JSON.stringify({ projectId: PROJECT_ID, ...data }) })),
    reconnect: async () => {
      act(() => sockets.at(-1)?.close())
      await waitFor(() => expect(sockets.length).toBe(2))
      act(() => sockets.at(-1)?.onopen?.())
    },
  }
}

describe('셸의 공통코드 표', () => {
  it('열면 표를 읽어 묶인 Affix 를 표의 이름으로 그린다', async () => {
    await stage([[GROUP]])
    await waitFor(() => expect(requireNode('n-affix').textContent).toBe('결제 대기'))
    expect(requireNode('n-affix').hasAttribute('data-wb-code-broken')).toBe(false)
  })

  it('codes-changed 를 받으면 다시 읽고, 지워진 항목의 노드는 끊김 표지로 바뀐다', async () => {
    const board = await stage([[GROUP], [{ ...GROUP, items: GROUP.items.filter((item) => item.value !== 'WAIT') }]])
    await waitFor(() => expect(requireNode('n-affix').textContent).toBe('결제 대기'))
    board.frame({ type: 'codes-changed' })
    await waitFor(() => expect(requireNode('n-affix').getAttribute('data-wb-code-broken')).toBe(''))
    expect(requireNode('n-affix').textContent).toBe('옛 이름')
    expect(board.calls()).toBe(2)
  })

  it('다시 붙으면 다시 읽는다 — 끊긴 동안의 신호는 사라졌다', async () => {
    const board = await stage([[GROUP], [{ ...GROUP, items: [{ value: 'WAIT', name: '새 이름', active: true }] }]])
    await waitFor(() => expect(requireNode('n-affix').textContent).toBe('결제 대기'))
    await board.reconnect()
    await waitFor(() => expect(requireNode('n-affix').textContent).toBe('새 이름'))
  })

  it('표 조회가 실패해도 prop 글로 그리고 한 줄을 세운다 — 끊김 표지는 안 단다', async () => {
    await stage([new Error('네트워크')])
    expect(await screen.findByText(CODES_UNREAD)).toBeTruthy()
    expect(requireNode('n-affix').textContent).toBe('옛 이름')
    expect(requireNode('n-affix').hasAttribute('data-wb-code-broken')).toBe(false)
  })
})
