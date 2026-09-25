/**
 * **남의 복원 배너의 «다시 불러오기»**(`shell/remote-alert.tsx`). 단추는 내 복원이 다시 읽는 길을 그대로 탄다 — 무엇을 어느
 * 자리가 읽는지는 `routes/editor.tsx`의 `restoredToken` 표가 소유하고, 그 줄마다의 케이스는 `snapshots-panel.test.tsx`
 * 「복원 뒤 재동기화」가 든다. 여기는 **단추가 그 길에 닿는가**와 남의 복원이라서 갈리는 것(앞머리 · 배너가 풀리는 때)을 잰다.
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import type { PageDocument } from '@wirebound/schema'
import { systemTheme } from '@wirebound/themes'
import { describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { PageDetail } from '../../src/api/types'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { createConnectionIdHolder, type RealtimeSetup } from '../../src/realtime/context'
import { createEditChannel } from '../../src/realtime/edit-channel'
import {
  PAGE_ID,
  PROJECT_ID,
  PROJECT_NAME,
  PROJECT_ROUTE,
  canvasRootId,
  nodeElement,
  openPage,
  pageDetail,
  pageDoc,
  renderEditor,
  waitForNode,
} from '../editor-harness'

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

function doc(childId: string): PageDocument {
  return pageDoc({ id: 'n-root', type: 'Page', children: [{ id: childId, type: 'Text', props: {} }] })
}

const RESTORED_FRAME = {
  type: 'restored',
  projectId: PROJECT_ID,
  snapshotId: 's1',
  actor: { type: 'user', label: '밥' },
} as const

function wiring(): { setup: RealtimeSetup; sockets: FakeSocket[] } {
  const sockets: FakeSocket[] = []
  return {
    sockets,
    setup: {
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
    },
  }
}

function pushTo(sockets: FakeSocket[]): (frame: object) => void {
  return (frame) => {
    act(() => {
      sockets[0]?.onmessage?.({ data: JSON.stringify(frame) })
    })
  }
}

/** 셸을 열고 소켓을 붙인다. `getPage`의 첫 부름은 여는 조회이고, 그 뒤는 `after`가 낸다. */
async function mount(options: { after: () => Promise<PageDetail>; api?: Partial<ApiClient> }): Promise<{
  push: (frame: object) => void
  getPage: ReturnType<typeof vi.fn>
}> {
  const { setup, sockets } = wiring()
  let calls = 0
  const getPage = vi.fn(async (_projectId: string, pageId: string) => {
    calls += 1
    return calls === 1 ? pageDetail(pageId, doc('n-before')) : options.after()
  })
  await openPage(doc('n-before'), { realtime: setup, apiOverrides: { getPage, ...options.api } })
  act(() => {
    sockets[0]?.onopen?.()
  })
  return { getPage, push: pushTo(sockets) }
}

function reloadButton(): HTMLElement {
  return screen.getByRole('button', { name: '다시 불러오기' })
}

describe('남의 복원 배너의 «다시 불러오기»', () => {
  it('누르면 복원된 판을 다시 읽고 배너가 풀린다 — 테마 선택도 다시 읽는다', async () => {
    const admin = systemTheme('admin')
    const portal = systemTheme('portal')
    if (admin === undefined || portal === undefined) throw new Error('시스템 테마가 없다')
    let restored = false
    const view = await mount({
      after: async () => pageDetail(PAGE_ID, doc('n-after')),
      api: {
        listProjectThemes: async () => [
          { id: 'th-admin', system: true, theme: admin },
          { id: 'th-portal', system: true, theme: portal },
        ],
        getProjectTheme: async () =>
          restored ? { themeId: 'th-portal', theme: portal, issues: [] } : { themeId: 'th-admin', theme: admin, issues: [] },
      },
    })
    const select = screen.getByRole<HTMLSelectElement>('combobox', { name: '테마' })
    await waitFor(() => expect(select.value).toBe('th-admin'))
    // 고르개는 문서 신호로도 다시 읽는다 — 캔버스의 테마는 테마 신호로만 다시 읽으므로 그쪽을 따로 본다.
    const sheet = (): string => document.head.querySelector('style[data-wb-style="theme"]')?.textContent ?? ''
    await waitFor(() => expect(sheet()).not.toBe(''))
    const before = sheet()

    restored = true
    view.push(RESTORED_FRAME)
    expect(screen.getByRole('status').textContent).toContain('다른 사람이 스냅샷을 복원했습니다')
    // 누르기 전에는 다시 읽지 않는다 — 배너가 서는 것만으로 판을 갈지 않는다(보내지 않은 편집이 있을 수 있다).
    expect(view.getPage).toHaveBeenCalledTimes(1)

    fireEvent.click(reloadButton())

    await waitForNode('n-after')
    expect(nodeElement('n-before')).toBeNull()
    await waitFor(() => expect(select.value).toBe('th-portal'))
    await waitFor(() => expect(sheet()).not.toBe(before))
    expect(screen.queryByRole('button', { name: '다시 불러오기' })).toBeNull()
    expect(screen.queryByText(/다른 사람이 스냅샷을 복원했습니다/)).toBeNull()
  })

  it('다시 읽으며 되돌리기 이력을 잃으면 남의 복원이라고 말한다 — «스냅샷을 복원해»가 아니다', async () => {
    const view = await mount({
      after: async () => pageDetail(PAGE_ID, doc('n-after')),
      api: {
        listMyRevisions: async () => [
          {
            id: 'rev-1',
            // 연 판(`HEAD_SEQ` 7)에서 이어지는 내 revision 이라야 스택에 실린다(`EditorStore.restoreUndoStack`).
            seq: 7,
            actorType: 'user',
            actorId: 'u1',
            actorLabel: '홍길동',
            ops: [],
            createdAt: '2026-08-12T09:00:00.000Z',
            inverse: [{ op: 'replace', path: '/root/children/0/props', value: {} }],
          },
        ],
      },
    })
    await waitFor(() => expect(screen.getByRole('button', { name: '되돌리기' })).toHaveProperty('disabled', false))

    view.push(RESTORED_FRAME)
    fireEvent.click(reloadButton())

    await waitForNode('n-after')
    expect(await screen.findByText('다른 사람이 복원한 상태로 페이지를 다시 불러왔습니다. 되돌리기 이력이 초기화됐습니다.')).toBeTruthy()
    expect(screen.getByRole('button', { name: '되돌리기' })).toHaveProperty('disabled', true)
  })

  /**
   * **혼자 죽는 변조가 없다** — 실패 갈래는 내 복원과 같은 코드이고, 그 축은 `snapshots-panel.test.tsx`의 «보고 있던 페이지가
   * 사라지면 …»이 소유한다. 이 케이스는 남의 복원 배너가 그 갈래에서 **풀린다**는 것(`clearPage`)을 본다.
   */
  it('다시 읽기가 실패하면 캔버스가 그 실패를 말하고 배너는 풀린다 — 옛 노드가 남지 않는다', async () => {
    const view = await mount({
      after: async () => {
        throw new ApiError(404, 'not-found', '페이지를 찾을 수 없습니다', [], true)
      },
    })

    view.push(RESTORED_FRAME)
    fireEvent.click(reloadButton())

    expect(await screen.findByText('페이지를 찾을 수 없습니다')).toBeTruthy()
    expect(canvasRootId()).toBeNull()
    expect(screen.queryByText(/다른 사람이 스냅샷을 복원했습니다/)).toBeNull()
  })

  /** 배너는 페이지를 안 연 화면에도 선다 — 다시 실을 판이 없어도 풀려야 한다(`CanvasFrame`의 복원 재조회가 판을 비운 것으로 놓는다). */
  it('페이지를 안 연 화면에서도 누르면 배너가 풀린다', async () => {
    const { setup, sockets } = wiring()
    const getPage = vi.fn(async (_projectId: string, pageId: string) => pageDetail(pageId, doc('n-before')))
    renderEditor({ route: PROJECT_ROUTE, realtime: setup, apiOverrides: { getPage } })
    await screen.findByRole('heading', { name: PROJECT_NAME })
    act(() => {
      sockets[0]?.onopen?.()
    })

    pushTo(sockets)(RESTORED_FRAME)
    fireEvent.click(reloadButton())

    await waitFor(() => expect(screen.queryByText(/다른 사람이 스냅샷을 복원했습니다/)).toBeNull())
    expect(getPage).not.toHaveBeenCalled()
  })

  /**
   * **혼자 죽는 변조가 없다** — 복원 낡음이 뒤의 갭보다 세다는 축은 `use-realtime.test.tsx`의 «복원 뒤 첫 편집 프레임이 와도
   * 복원했다고 말한다»가 소유한다. 이 케이스는 다시 읽는 창 안에서도 그렇고, 판이 실린 뒤에야 풀린다는 것을 본다.
   */
  it('다시 읽는 동안에는 배너가 그대로다 — 그 사이 온 편집 프레임이 «끊겼다»로 덮지 않는다', async () => {
    let answer = (_page: PageDetail): void => {}
    const view = await mount({
      after: () =>
        new Promise<PageDetail>((resolve) => {
          answer = resolve
        }),
    })

    view.push(RESTORED_FRAME)
    fireEvent.click(reloadButton())
    await waitFor(() => expect(view.getPage).toHaveBeenCalledTimes(2))
    view.push({
      type: 'page-changed',
      projectId: PROJECT_ID,
      pageId: PAGE_ID,
      seq: 40,
      ops: [],
      warnings: [],
      actor: { type: 'user', label: '밥' },
    })
    expect(screen.getByRole('status').textContent).toContain('다른 사람이 스냅샷을 복원했습니다')

    await act(async () => {
      answer({ ...pageDetail(PAGE_ID, doc('n-after')), headSeq: 40 })
    })

    await waitForNode('n-after')
    expect(screen.queryByRole('status')).toBeNull()
  })
})
