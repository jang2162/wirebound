/**
 * **복원 배너가 풀리는 때**(`EditorStore`의 `markRestored` · `beginRestoreReread`). 복원은 프로젝트 전체(메뉴 · 페이지 · 코멘트 · 설명 ·
 * 테마 선택)를 바꾸므로 배너를 거두는 조건은 «다시 읽은 조회가 복원이 바꾸는 것을 전부 읽었나»다 — 무엇을 어느 자리가 읽는지는
 * `routes/editor.tsx`의 `restoredToken` 표가 소유한다.
 *
 * | 판 | 배너 | 까닭 |
 * |---|---|---|
 * | 신호 뒤 페이지만 읽는 조회(재연결 재조회 · 다른 페이지 열기) | 남는다 | 메뉴 · 코멘트 · 테마는 다시 안 읽었다 |
 * | 다시 읽기를 시작한 뒤 새 복원 신호 | 남는다 | 다시 읽기의 몇 조회는 그 복원 앞을 읽었을 수 있다 |
 * | 내 복원의 신호가 내 다시 읽기 뒤에 옴(연결 id 없이 나간 복원) | 안 선다 | 안전망 스냅샷 id 로 내 복원을 알아본다 |
 * | 다른 복원 · id 를 안 싣는 서버 | 선다 | 내 복원이라는 것을 모른다 |
 *
 * 단추를 눌러 다시 읽으면 풀리는 판은 `remote-restore-reload.test.tsx`가 든다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { PageDocument } from '@wirebound/schema'
import { describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { PageDetail, RestoreResult, TreeMenuNode } from '../../src/api/types'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { createConnectionIdHolder, type RealtimeSetup } from '../../src/realtime/context'
import { createEditChannel } from '../../src/realtime/edit-channel'
import {
  OTHER_PAGE_ID,
  OTHER_PAGE_TITLE,
  PAGE_ID,
  PROJECT_ID,
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
  readonly sent: string[] = []
  send(data: string): void {
    this.sent.push(data)
  }
  close(): void {
    this.onclose?.()
  }
}

const pair = (root = 'n-root'): PageDocument =>
  pageDoc({
    id: root,
    type: 'Page',
    children: [
      { id: 'n-a', type: 'Text', props: {} },
      { id: 'n-b', type: 'Divider', props: {} },
    ],
  })

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

/** 남의 복원 프레임. `safety`를 주면 안전망 스냅샷 id 를 싣는다. */
const restoredFrame = (safety?: string) => ({
  type: 'restored',
  projectId: PROJECT_ID,
  snapshotId: 's1',
  actor: { type: 'user', label: '밥' },
  ...(safety === undefined ? {} : { safetySnapshotId: safety }),
})

const OTHER_RESTORE = /다른 사람이 스냅샷을 복원했습니다/

function restoreResult(safety: string): RestoreResult {
  return {
    summary: {
      menu: { created: 0, updated: 0, deleted: 0 },
      pages: { created: 0, metaUpdated: 0, schemaChanged: 1, schemaUnchanged: 0, deleted: 0 },
      comments: { created: 0, updated: 0, deleted: 0 },
      layouts: { themeRefChanged: 0 },
    },
    safetySnapshot: { id: safety, tag: '복원 전' },
    themes: [],
  }
}

interface Held {
  pageId: string
  resolve: (page: PageDetail) => void
}

/** 셸을 열고 소켓을 붙인다. `getPage`의 첫 부름(여는 조회)과 `immediate`가 고르는 부름만 곧바로 답하고 나머지는 붙잡는다. */
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
    return new Promise<PageDetail>((resolve) => held.push({ pageId, resolve }))
  })
  const getTree = vi.fn(async () => TREE)
  await openPage(pair(), { realtime: setup, apiOverrides: { getTree, ...options.api, getPage } })
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
  /** 구조 트리에서 첫 줄(Text)을 골라 «아래로»를 낸다 — WS 로 나가 답을 기다린다. */
  const moveDown = async (): Promise<{ clientOpId: string; pageId: string }> => {
    const tree = screen.getByRole('region', { name: '구조 트리' })
    fireEvent.click(within(tree).getByRole('button', { name: 'Text' }))
    fireEvent.click(within(within(tree).getByRole('group', { name: '구조 편집' })).getByRole('button', { name: '아래로' }))
    await act(async () => {})
    const sent = sockets.flatMap((socket) => socket.sent.filter((raw) => raw.includes('"patch"')))
    return JSON.parse(sent[sent.length - 1]!) as { clientOpId: string; pageId: string }
  }
  return { getPage, getTree, held, push, reconnect, moveDown }
}

/** 서 있는 `status` 전부의 글 — 내 복원이면 스냅샷 팝오버의 결과 문장도 `status`다. */
function banner(): string {
  return screen
    .queryAllByRole('status')
    .map((element) => element.textContent ?? '')
    .join(' | ')
}

describe('남의 복원 배너 — 페이지만 읽는 조회는 풀지 않는다', () => {
  it('신호 뒤 재연결 재조회가 새 판을 실어도 배너가 남는다 — 메뉴는 다시 안 읽었다', async () => {
    const view = await mount({ immediate: (pageId) => pageDetail(pageId, pair('n-after')) })
    expect(view.getTree).toHaveBeenCalledTimes(1)

    view.push(restoredFrame('s-bob'))
    expect(banner()).toMatch(OTHER_RESTORE)

    view.reconnect()
    await waitForNode('n-after')

    expect(view.getTree).toHaveBeenCalledTimes(1)
    expect(banner()).toMatch(OTHER_RESTORE)
  })

  it('신호 뒤 다른 페이지를 열어도 배너가 남는다', async () => {
    const view = await mount({ immediate: (pageId) => (pageId === OTHER_PAGE_ID ? pageDetail(pageId, pair('n-other')) : undefined) })

    view.push(restoredFrame('s-bob'))
    fireEvent.click(screen.getByText(OTHER_PAGE_TITLE))
    await waitForNode('n-other')

    expect(view.getTree).toHaveBeenCalledTimes(1)
    expect(banner()).toMatch(OTHER_RESTORE)
  })
})

describe('남의 복원 배너 — 다시 읽기를 시작한 뒤 온 신호', () => {
  /**
   * 단추의 다시 읽기는 메뉴 · 코멘트 · 테마를 곧바로 읽고, 페이지는 보낸 편집의 답을 받은 뒤에 읽는다(`editsAnswered`). 그 사이 새 복원
   * 신호가 오면 페이지 조회는 신호 뒤에 시작하지만 메뉴 조회는 신호 앞이다 — 페이지 조회만 보고 풀면 메뉴가 복원 앞 판인 채 배너가 사라진다.
   */
  it('편집의 답을 기다리는 사이 새 복원 신호가 오면 다시 읽은 뒤에도 배너가 남는다', async () => {
    const view = await mount({ immediate: (pageId) => pageDetail(pageId, pair('n-after')) })
    const edit = await view.moveDown()

    view.push(restoredFrame('s-first'))
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))
    await waitFor(() => expect(view.getTree).toHaveBeenCalledTimes(2))
    view.push(restoredFrame('s-second'))
    // 보낸 편집의 답 — 이제 페이지 조회가 나간다(신호 뒤).
    view.push({ type: 'patch-ack', projectId: PROJECT_ID, pageId: edit.pageId, clientOpId: edit.clientOpId, seq: 8, revisionId: 'rev-8', inverse: [], warnings: [] })
    await waitForNode('n-after')

    expect(banner()).toMatch(OTHER_RESTORE)
  })
})

describe('내 복원 — 연결 id 없이 나가 내 신호가 되돌아온 판', () => {
  async function restoreMine(view: Awaited<ReturnType<typeof mount>>): Promise<void> {
    fireEvent.click(screen.getByRole('button', { name: '스냅샷' }))
    await screen.findByText('v1')
    fireEvent.click(screen.getByRole('button', { name: '이 상태로 되돌리기' }))
    fireEvent.click(screen.getByRole('button', { name: '되돌린다' }))
    // 내 다시 읽기의 페이지 조회가 나갔다 — 붙잡혀 있다.
    await waitFor(() => expect(view.held).toHaveLength(1))
  }

  const snapshotApi: Partial<ApiClient> = {
    listSnapshots: async () => [
      {
        id: 's1',
        tag: 'v1',
        description: null,
        createdBy: 'u1',
        createdByName: '홍길동',
        createdAt: '2026-08-12T09:00:00.000Z',
        payloadBytes: 10,
      },
    ],
    restoreSnapshot: async () => restoreResult('s-mine'),
  }

  it('내 다시 읽기가 시작된 뒤 내 복원의 신호가 와도 남의 복원 배너가 서지 않는다', async () => {
    const view = await mount({ api: snapshotApi })
    await restoreMine(view)

    view.push(restoredFrame('s-mine'))
    await act(async () => {
      view.held[0]!.resolve(pageDetail(PAGE_ID, pair('n-after')))
    })
    await waitForNode('n-after')

    expect(banner()).not.toMatch(OTHER_RESTORE)
  })

  it('다른 복원의 신호면 배너가 선다', async () => {
    const view = await mount({ api: snapshotApi })
    await restoreMine(view)

    view.push(restoredFrame('s-someone'))
    await act(async () => {
      view.held[0]!.resolve(pageDetail(PAGE_ID, pair('n-after')))
    })
    await waitForNode('n-after')

    expect(banner()).toMatch(OTHER_RESTORE)
  })

  it('안전망 스냅샷 id 를 안 싣는 신호면 배너가 선다 — 내 복원인지 모른다', async () => {
    const view = await mount({ api: snapshotApi })
    await restoreMine(view)

    view.push(restoredFrame())
    await act(async () => {
      view.held[0]!.resolve(pageDetail(PAGE_ID, pair('n-after')))
    })
    await waitForNode('n-after')

    expect(banner()).toMatch(OTHER_RESTORE)
  })
})

/**
 * **내 복원의 답을 잃은 판**(`EditorStore.markRestoreUnanswered`). 복원 요청은 연결 id 를 실어 그 신호가 이 탭에 안 온다 — 답을 잃으면 서버가
 * 복원했는지 이 탭은 모른다. 커밋 전에 거절된 실패(4xx · 봉투 있는 500)는 복원이 안 된 것이라 배너를 세우지 않는다. 실브라우저 판은
 * `apps/web/build-test/editor-restore-unanswered.test.ts`가 든다.
 */
describe('내 복원 — 답을 잃은 판', () => {
  const UNANSWERED = /스냅샷 복원의 답을 받지 못해 복원됐는지 알 수 없습니다/

  function snapshotApi(restoreSnapshot: ApiClient['restoreSnapshot']): Partial<ApiClient> {
    return {
      listSnapshots: async () => [
        {
          id: 's1',
          tag: 'v1',
          description: null,
          createdBy: 'u1',
          createdByName: '홍길동',
          createdAt: '2026-08-12T09:00:00.000Z',
          payloadBytes: 10,
        },
      ],
      restoreSnapshot,
    }
  }

  async function pressRestore(): Promise<void> {
    fireEvent.click(screen.getByRole('button', { name: '스냅샷' }))
    await screen.findByText('v1')
    fireEvent.click(screen.getByRole('button', { name: '이 상태로 되돌리기' }))
    fireEvent.click(screen.getByRole('button', { name: '되돌린다' }))
    await act(async () => {})
  }

  it('연결이 끊겨 답을 잃으면 «복원됐는지 모릅니다»와 다시 불러오기 단추를 세운다', async () => {
    const view = await mount({ api: snapshotApi(async () => Promise.reject(new TypeError('Failed to fetch'))) })

    await pressRestore()

    expect(banner()).toMatch(UNANSWERED)
    expect(banner()).not.toMatch(OTHER_RESTORE)
    // 팝오버도 그렇다고 말한다.
    expect(screen.getAllByRole('alert').map((node) => node.textContent).join(' | ')).toMatch(/복원됐는지 알 수 없습니다/)
    // 스스로 다시 읽지 않는다 — 여는 조회 하나뿐이다.
    expect(view.getPage).toHaveBeenCalledTimes(1)
  })

  it('봉투 없는 5xx 도 모른다', async () => {
    await mount({ api: snapshotApi(async () => Promise.reject(new ApiError(502, 'internal', 'Bad Gateway', [], false))) })

    await pressRestore()

    expect(banner()).toMatch(UNANSWERED)
  })

  it('커밋 전에 거절됐으면 배너를 세우지 않는다 — 복원이 안 됐다', async () => {
    await mount({ api: snapshotApi(async () => Promise.reject(new ApiError(409, 'conflict', '복원할 수 없습니다', [], true))) })

    await pressRestore()

    // 판 카나리아 — 실패는 팝오버가 말했다.
    expect(await screen.findByText(/복원할 수 없습니다/)).toBeTruthy()
    expect(banner()).not.toMatch(UNANSWERED)
  })

  it('그 단추는 복원 뒤 다시 읽기를 타고, 그 판이 배너를 푼다', async () => {
    const view = await mount({ api: snapshotApi(async () => Promise.reject(new TypeError('Failed to fetch'))) })
    await pressRestore()
    expect(banner()).toMatch(UNANSWERED)

    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))
    await waitFor(() => expect(view.held).toHaveLength(1))
    // 메뉴도 다시 읽는다 — 복원이 바꾸는 것을 전부 다시 읽는 길이다.
    await waitFor(() => expect(view.getTree).toHaveBeenCalledTimes(2))
    await act(async () => {
      view.held[0]!.resolve(pageDetail(PAGE_ID, pair('n-after')))
    })
    await waitForNode('n-after')

    expect(banner()).not.toMatch(UNANSWERED)
  })
})
