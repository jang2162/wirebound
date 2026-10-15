/**
 * **늦게 커밋된 변경의 경보**(`page-stale` 프레임 → `EditorStore.markPageStale` → `RemoteAlert`의 «다시 불러오기»). 서버가 답을 잃은 편집 · 게시의 COMMIT 이 확인 한도를
 * 넘겨 커밋됐다고 번호 없이 알린다(`apps/api/test/late-commit-stale.test.ts`). 받는 쪽은 얹을 것이 없고 그 페이지가 낡았다고 말한다.
 *
 * | 판 | 경보 |
 * |---|---|
 * | 열린 페이지의 프레임 | 선다 — 누르기 전에는 다시 읽지 않는다 |
 * | 다른 페이지의 프레임 | 안 선다 |
 * | 단추 | **그 페이지만** 다시 읽는다(메뉴 트리 · 코멘트는 안 읽는다) · 판이 실리면 풀린다 |
 * | 단추의 조회가 같은 판을 받음 | 판을 안 싣고(되돌리기 이력을 지킨다) 경보만 푼다 |
 * | 단추의 조회가 실패 | 한 줄로 말한다(`routes/editor.tsx`의 `lateReloadFailedNotice` — 복원 뒤 다시 읽기의 실패 문장과 같은 꼴 · 누가 썼는지 안 말함) · 경보는 그대로 선다 · 다시 눌러 판이 실리면 그 줄은 걷힌다 |
 * | 신호 앞에 시작한 재연결 재조회가 신호 뒤에 답함 | 경보가 남는다 — 그 조회는 늦은 커밋 앞을 읽었을 수 있다 |
 * | 신호 뒤 재연결 재조회가 같은 판을 받음 | 경보가 풀린다 |
 * | 복원 낡음이 서 있음 | 늦은 경보가 덮지 않는다 — 복원 단추는 전부 다시 읽는다 |
 * | 신호의 `seq` 힌트가 지금 판(`HEAD_SEQ`) 이하 | 안 선다 — 다시 읽지도 않는다 |
 * | 힌트가 지금 판보다 앞섬 · 힌트 없음 | 선다 — 힌트는 번호를 안 얹으므로 판은 그대로다 |
 */
import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import type { PageDocument } from '@wirebound/schema'
import { describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { PageDetail, TreeMenuNode } from '../../src/api/types'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { createConnectionIdHolder, type RealtimeSetup } from '../../src/realtime/context'
import { createEditChannel } from '../../src/realtime/edit-channel'
import {
  OTHER_PAGE_ID,
  OTHER_PAGE_TITLE,
  HEAD_SEQ,
  PAGE_ID,
  PROJECT_ID,
  nodeElement,
  openPage,
  pageDetail,
  pageDoc,
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

const doc = (childId: string): PageDocument => pageDoc({ id: 'n-root', type: 'Page', children: [{ id: childId, type: 'Text', props: {} }] })

const TREE: TreeMenuNode[] = [
  {
    id: 'mn-1',
    title: '회원관리',
    sortOrder: 1,
    pages: [
      { id: PAGE_ID, title: '회원 목록', sortOrder: 1 },
      { id: OTHER_PAGE_ID, title: OTHER_PAGE_TITLE, sortOrder: 2 },
    ],
    children: [],
  },
]

const staleFrame = (pageId: string = PAGE_ID, seq?: number) => ({
  type: 'page-stale',
  projectId: PROJECT_ID,
  pageId,
  ...(seq === undefined ? {} : { seq }),
})
const RESTORED_FRAME = { type: 'restored', projectId: PROJECT_ID, snapshotId: 's1' }

const LATE_ALERT = /늦게 반영된 변경/
const RESTORED_ALERT = /스냅샷이 복원됐습니다/

interface Held {
  pageId: string
  resolve: (page: PageDetail) => void
  reject: (error: unknown) => void
}

/**
 * 셸을 열고 소켓을 붙인다. `getPage`의 첫 부름(여는 조회)만 곧바로 답한다. 그 뒤는 `after`가 있으면 그 값으로 곧바로, 없으면 붙잡아 둔다(`held`).
 */
async function mount(options: { after?: (pageId: string) => Promise<PageDetail> } = {}) {
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
    if (calls === 1) return Promise.resolve(pageDetail(pageId, doc('n-before')))
    if (options.after !== undefined) return options.after(pageId)
    return new Promise<PageDetail>((resolve, reject) => held.push({ pageId, resolve, reject }))
  })
  const getTree = vi.fn(async () => TREE)
  await openPage(doc('n-before'), { realtime: setup, apiOverrides: { getTree, getPage } as Partial<ApiClient> })
  act(() => {
    sockets[0]?.onopen?.()
  })
  const last = (): FakeSocket => sockets[sockets.length - 1]!
  const push = (frame: object): void => {
    act(() => {
      last().onmessage?.({ data: JSON.stringify(frame) })
    })
  }
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
  return { getPage, getTree, held, push, reconnect }
}

/** 서 있는 `status` 전부의 글. */
function banner(): string {
  return screen
    .queryAllByRole('status')
    .map((element) => element.textContent ?? '')
    .join(' | ')
}

const reloadButton = (): HTMLElement => screen.getByRole('button', { name: '다시 불러오기' })

describe('늦은 변경 경보', () => {
  it('열린 페이지의 프레임이 경보를 세운다 — 누르기 전에는 다시 읽지 않는다', async () => {
    const view = await mount({ after: async (pageId) => pageDetail(pageId, doc('n-after')) })

    view.push(staleFrame())

    expect(banner()).toMatch(LATE_ALERT)
    expect(reloadButton()).toBeTruthy()
    expect(view.getPage).toHaveBeenCalledTimes(1)
    // 누가 썼는지 말하지 않는다 — 신호가 모른다.
    expect(banner()).not.toMatch(/다른 사람|내가/)
  })

  it('다른 페이지의 프레임은 경보를 세우지 않는다', async () => {
    const view = await mount()

    view.push(staleFrame(OTHER_PAGE_ID))

    expect(banner()).not.toMatch(LATE_ALERT)
    expect(screen.queryByRole('button', { name: '다시 불러오기' })).toBeNull()
  })

  it('단추는 그 페이지만 다시 읽고 서버 판이 실리면 풀린다 — 메뉴 트리는 안 읽는다', async () => {
    const view = await mount({ after: async (pageId) => pageDetail(pageId, doc('n-after')) })
    expect(view.getTree).toHaveBeenCalledTimes(1)

    view.push(staleFrame())
    fireEvent.click(reloadButton())

    await waitForNode('n-after')
    expect(nodeElement('n-before')).toBeNull()
    expect(view.getPage).toHaveBeenCalledTimes(2)
    expect(view.getTree).toHaveBeenCalledTimes(1)
    expect(banner()).not.toMatch(LATE_ALERT)
    expect(screen.queryByRole('button', { name: '다시 불러오기' })).toBeNull()
  })

  it('프레임이 여러 번 와도 경보는 하나이고 단추 한 번에 조회 한 번이다', async () => {
    const view = await mount({ after: async (pageId) => pageDetail(pageId, doc('n-after')) })

    view.push(staleFrame())
    view.push(staleFrame())
    view.push(staleFrame())
    expect(screen.getAllByRole('button', { name: '다시 불러오기' })).toHaveLength(1)

    fireEvent.click(reloadButton())
    await waitForNode('n-after')

    expect(view.getPage).toHaveBeenCalledTimes(2)
  })

  it('단추의 조회가 같은 판을 받으면 판을 안 싣고 경보만 푼다 — 거짓 경보를 걷는다', async () => {
    const view = await mount({ after: async (pageId) => pageDetail(pageId, doc('n-before')) })
    const node = nodeElement('n-before')

    view.push(staleFrame())
    fireEvent.click(reloadButton())

    await waitFor(() => expect(banner()).not.toMatch(LATE_ALERT))
    expect(view.getPage).toHaveBeenCalledTimes(2)
    // 판을 안 실었다 — 같은 DOM 노드가 그대로 있다.
    expect(nodeElement('n-before')).toBe(node)
  })

  it('단추의 조회가 실패하면 경보가 그대로 서 있다 — 다시 누르면 다시 읽는다', async () => {
    let attempt = 0
    const view = await mount({
      after: async (pageId) => {
        attempt += 1
        if (attempt === 1) throw new ApiError(503, 'internal', '서버에 닿지 못했습니다', [], true)
        return pageDetail(pageId, doc('n-after'))
      },
    })

    view.push(staleFrame())
    fireEvent.click(reloadButton())
    await waitFor(() => expect(view.getPage).toHaveBeenCalledTimes(2))
    await act(async () => {})

    expect(banner()).toMatch(LATE_ALERT)
    expect(nodeElement('n-before')).not.toBeNull()

    fireEvent.click(reloadButton())
    await waitForNode('n-after')
    expect(banner()).not.toMatch(LATE_ALERT)
  })

  it('단추의 조회가 실패하면 한 줄로 말한다 — 경보는 그대로 남고, 다시 눌러 판이 실리면 그 줄은 걷힌다', async () => {
    let attempt = 0
    const view = await mount({
      after: async (pageId) => {
        attempt += 1
        if (attempt === 1) throw new ApiError(503, 'internal', '서버에 닿지 못했습니다', [], true)
        return pageDetail(pageId, doc('n-after'))
      },
    })

    view.push(staleFrame())
    fireEvent.click(reloadButton())
    await waitFor(() => expect(view.getPage).toHaveBeenCalledTimes(2))
    await act(async () => {})

    // 사람이 누른 조회라 말한다 — 복원 뒤 다시 읽기의 실패 문장과 같은 앞머리 · 까닭 · 다시 누르라는 말. 누가 썼는지는 없다.
    expect(screen.queryByRole('alert')?.textContent ?? null).toBe(
      '페이지를 다시 불러오지 못했습니다. 서버에 닿지 못했습니다 — 화면은 아직 최신이 아닙니다. «다시 불러오기»를 다시 누르세요.',
    )
    expect(banner()).toMatch(LATE_ALERT)
    expect(nodeElement('n-before')).not.toBeNull()

    fireEvent.click(reloadButton())
    await waitForNode('n-after')
    // 판이 실리면 그 줄은 거짓이라 걷힌다(`untilLoad`).
    expect(screen.queryByRole('alert')).toBeNull()
    expect(banner()).not.toMatch(LATE_ALERT)
  })
})

describe('늦은 변경 경보 — seq 힌트', () => {
  /**
   * 신호가 revision 의 `seq` 를 힌트로 실으면 받는 쪽은 **이미 그 번호 이상의 판을 읽었을 때** 경보를 안 세운다. 이 셸은 `HEAD_SEQ` 판을 읽어 열렸다(`pageDetail`).
   * 힌트는 비교에만 쓴다 — 판을 안 바꾸고 다시 읽지도 않는다. 이 케이스가 프레임 → 소켓 → 스토어의 이음(`use-realtime`)을 함께 잠근다.
   */
  it('힌트가 지금 판의 번호 이하면 경보가 안 선다 — 다시 읽지도 않는다', async () => {
    const view = await mount({ after: async (pageId) => pageDetail(pageId, doc('n-after')) })
    const node = nodeElement('n-before')

    view.push(staleFrame(PAGE_ID, HEAD_SEQ))
    view.push(staleFrame(PAGE_ID, HEAD_SEQ - 1))

    expect(banner()).not.toMatch(LATE_ALERT)
    expect(screen.queryByRole('button', { name: '다시 불러오기' })).toBeNull()
    expect(view.getPage).toHaveBeenCalledTimes(1)
    expect(nodeElement('n-before')).toBe(node)
  })

  it('힌트가 지금 판보다 앞서면 경보가 선다 — 번호를 얹지 않으므로 판은 그대로다', async () => {
    const view = await mount({ after: async (pageId) => pageDetail(pageId, doc('n-after')) })
    const node = nodeElement('n-before')

    view.push(staleFrame(PAGE_ID, HEAD_SEQ + 1))

    expect(banner()).toMatch(LATE_ALERT)
    expect(view.getPage).toHaveBeenCalledTimes(1)
    expect(nodeElement('n-before')).toBe(node)
  })

  it('힌트 없는 신호(번호를 모르는 게시)는 지금처럼 경보를 세운다', async () => {
    const view = await mount()

    view.push(staleFrame())

    expect(banner()).toMatch(LATE_ALERT)
  })
})

describe('늦은 변경 경보 — 신호의 시점', () => {
  /**
   * 신호가 닿는 사이 시작한 조회는 늦은 커밋 앞을 읽었을 수 있다. 재연결 재조회가 신호 앞에 시작해 신호 뒤에 답하면 그 판을 싣되(서버 판이다) 경보는
   * 남긴다 — 풀리는 것은 신호 뒤에 시작한 조회다.
   */
  it('신호 앞에 시작한 재연결 재조회가 신호 뒤에 답하면 판은 실리지만 경보가 남는다', async () => {
    const view = await mount()

    view.reconnect()
    await waitFor(() => expect(view.held).toHaveLength(1))
    view.push(staleFrame())
    await act(async () => {
      view.held[0]!.resolve(pageDetail(PAGE_ID, doc('n-after')))
    })
    await waitForNode('n-after')

    expect(banner()).toMatch(LATE_ALERT)
  })

  it('신호 뒤 재연결 재조회가 같은 판을 받으면 경보가 풀린다', async () => {
    const view = await mount({ after: async (pageId) => pageDetail(pageId, doc('n-before')) })

    view.push(staleFrame())
    expect(banner()).toMatch(LATE_ALERT)
    view.reconnect()

    await waitFor(() => expect(banner()).not.toMatch(LATE_ALERT))
    expect(view.getPage).toHaveBeenCalledTimes(2)
  })

  it('신호 뒤 재연결 재조회가 서버 판을 실으면 경보가 풀린다', async () => {
    const view = await mount({ after: async (pageId) => pageDetail(pageId, doc('n-after')) })

    view.push(staleFrame())
    view.reconnect()

    await waitForNode('n-after')
    expect(banner()).not.toMatch(LATE_ALERT)
  })

  it('경보가 서 있는 동안 다음 번호가 건너뛴 프레임이 와도 문장이 바뀌지 않는다 — 갭은 늦은 변경의 결과다', async () => {
    const view = await mount()

    view.push(staleFrame())
    view.push({
      type: 'page-changed',
      projectId: PROJECT_ID,
      pageId: PAGE_ID,
      seq: 99,
      ops: [],
      warnings: [],
    })

    expect(banner()).toMatch(LATE_ALERT)
    expect(banner()).not.toMatch(/받지 못한 변경/)
  })

  it('복원 낡음이 서 있으면 늦은 경보가 덮지 않는다 — 단추는 복원 뒤 다시 읽기를 탄다(메뉴 트리도 다시 읽는다)', async () => {
    const view = await mount({ after: async (pageId) => pageDetail(pageId, doc('n-after')) })

    view.push(RESTORED_FRAME)
    view.push(staleFrame())

    expect(banner()).toMatch(RESTORED_ALERT)
    expect(banner()).not.toMatch(LATE_ALERT)
    fireEvent.click(reloadButton())
    await waitFor(() => expect(view.getTree).toHaveBeenCalledTimes(2))
    await waitForNode('n-after')
  })
})
