/**
 * **메뉴 트리가 남의 변경을 받는다**(`src/tree/use-tree-commands.tsx`의 `remoteRev` · `refresh` · `settles` · `reconcile` · `onPageGone`).
 *
 * 셸이 `menu-changed`의 번호를 트리에 넘기고(`routes/editor.tsx`의 `menuRev`), 트리는 제 판보다 크면 다시 받는다. 가짜 소켓으로 프레임을
 * 밀어 넣고 `readTree`의 답을 손으로 놓아 겹친 조회의 차례 · 판 번호를 정한다. 실브라우저 판은 `apps/web/build-test/menu-realtime.test.ts`다.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { PageDocument } from '@wirebound/schema'
import { describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { TreeMenuNode, TreeRead } from '../../src/api/types'
import { CASCADE_CHANGED, MENU_DELETE_TITLE } from '../../src/panels/menu-delete-dialog'
import type { RealtimeSocket } from '../../src/realtime/connection'
import { createConnectionIdHolder, type RealtimeSetup } from '../../src/realtime/context'
import { createEditChannel } from '../../src/realtime/edit-channel'
import { TREE_DRAFT_DROPPED, cascadeClosedNotice } from '../../src/tree/use-tree-commands'
import { OTHER_PAGE_ID, PAGE_ID, PROJECT_ID, PROJECT_ROUTE, openPage, pageDetail, pageDoc, renderEditor } from '../editor-harness'
import { currentPath } from '../helpers'
import { treeTool } from './tree-row'

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

const DOC: PageDocument = pageDoc({ id: 'n-root', type: 'Page', children: [] })

/**
 * ```
 * 회원관리(mn-1)   pages: 회원 목록(pg-1) · 회원 상세(pg-2)
 * └ 권한(mn-2)     (비었다)
 * 주문관리(mn-3)   (비었다)
 * ```
 */
function tree(change: (menu: TreeMenuNode[]) => void = () => {}): TreeMenuNode[] {
  const menu: TreeMenuNode[] = [
    {
      id: 'mn-1',
      title: '회원관리',
      sortOrder: 0,
      pages: [
        { id: PAGE_ID, title: '회원 목록', sortOrder: 0 },
        { id: OTHER_PAGE_ID, title: '회원 상세', sortOrder: 1 },
      ],
      children: [{ id: 'mn-2', title: '권한', sortOrder: 0, pages: [], children: [] }],
    },
    { id: 'mn-3', title: '주문관리', sortOrder: 1, pages: [], children: [] },
  ]
  change(menu)
  return menu
}

interface Pending {
  resolve: (read: TreeRead) => void
  reject: (error: unknown) => void
}

/** 셸을 열고 소켓을 붙인다. 첫 트리 조회는 판 1 로 곧바로 답하고, 그 뒤 조회는 붙잡는다(`answer`). */
async function mount(api: Partial<ApiClient> = {}) {
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
  const pending: Pending[] = []
  let first = true
  const readTree = vi.fn(() => {
    if (first) {
      first = false
      return Promise.resolve({ menu: tree(), rev: 1 })
    }
    return new Promise<TreeRead>((resolve, reject) => pending.push({ resolve, reject }))
  })
  await openPage(DOC, { realtime: setup, apiOverrides: { readTree, ...api } })
  await screen.findByText('회원관리')
  act(() => {
    sockets[0]?.onopen?.()
  })
  const last = (): FakeSocket => sockets[sockets.length - 1]!
  return {
    readTree,
    pending,
    /** `menu-changed` 하나를 밀어 넣는다. */
    frame(rev: number): void {
      act(() => {
        last().onmessage?.({
          data: JSON.stringify({ type: 'menu-changed', projectId: PROJECT_ID, rev, actor: { type: 'user', label: '밥' } }),
        })
      })
    },
    /** 붙잡힌 `index` 번째 조회에 답한다. */
    async answer(index: number, read: TreeRead): Promise<void> {
      await act(async () => {
        pending[index]!.resolve(read)
      })
    },
    async fail(index: number): Promise<void> {
      await act(async () => {
        pending[index]!.reject(new Error('끊겼다'))
      })
    },
    reconnect(): void {
      act(() => {
        last().onclose?.()
      })
      act(() => {
        scheduled.pop()?.()
      })
      act(() => {
        last().onopen?.()
      })
    },
  }
}

function region(): HTMLElement {
  return screen.getByRole('region', { name: '메뉴·페이지 트리' })
}

const alerts = (): (string | null)[] => screen.queryAllByRole('alert').map((element) => element.textContent)

describe('신호와 판 번호', () => {
  it('제 판보다 큰 번호면 다시 받고, 같거나 작으면 안 받는다', async () => {
    const view = await mount()
    expect(view.readTree).toHaveBeenCalledTimes(1)

    view.frame(1)
    expect(view.readTree).toHaveBeenCalledTimes(1)

    view.frame(2)
    expect(view.readTree).toHaveBeenCalledTimes(2)
    await view.answer(0, {
      menu: tree((menu) => menu.push({ id: 'mn-4', title: '배송관리', sortOrder: 2, pages: [], children: [] })),
      rev: 2,
    })
    await within(region()).findByText('배송관리')

    // 받은 판(2)과 같거나 작은 번호 — 거꾸로 닿은 앞 프레임 · 내 쓰기의 신호.
    view.frame(2)
    view.frame(1)
    expect(view.readTree).toHaveBeenCalledTimes(2)
  })

  it('받는 중에 온 신호는 합친다 — 떠 있는 조회가 끝나면 한 번만 더 받는다', async () => {
    const view = await mount()
    view.frame(2)
    view.frame(3)
    view.frame(4)
    expect(view.readTree).toHaveBeenCalledTimes(2)
    await view.answer(0, { menu: tree(), rev: 2 })
    await waitFor(() => expect(view.readTree).toHaveBeenCalledTimes(3))
    await view.answer(1, { menu: tree(), rev: 4 })
    await act(async () => {})
    expect(view.readTree).toHaveBeenCalledTimes(3)
  })

  /**
   * 겹친 조회 둘 — 신호의 다시 받기(먼저 냄)와 내 조작 뒤의 다시 받기(나중 냄). 서버에서 차례가 뒤집히면 먼저 낸 쪽이 큰 번호를 답한다. 판
   * 번호가 이긴다 — «늦게 낸 조회의 답만»이었으면 나중 낸 작은 번호의 답이 새 트리를 덮는다.
   */
  it('겹친 조회 — 늦게 낸 조회가 작은 번호를 답하면 그 답을 버린다(먼저 온 큰 번호의 트리가 남는다)', async () => {
    const view = await mount({ deleteMenu: vi.fn(async () => undefined) })
    view.frame(5)
    expect(view.pending).toHaveLength(1)
    // 내 조작 — 빈 메뉴 «주문관리» 지우기(두 번 누르기) → 그 뒤의 다시 받기가 둘째 조회다.
    fireEvent.click(within(region()).getByRole('button', { name: '주문관리' }))
    fireEvent.click(treeTool(region(), '삭제'))
    fireEvent.click(within(region()).getByRole('button', { name: '정말 삭제합니까?' }))
    await waitFor(() => expect(view.pending).toHaveLength(2))

    // 먼저 낸 조회가 큰 번호(5)로 먼저 닿는다 — 남이 «배송관리»를 더한 판.
    await view.answer(0, {
      menu: tree((menu) => {
        menu.pop()
        menu.push({ id: 'mn-4', title: '배송관리', sortOrder: 1, pages: [], children: [] })
      }),
      rev: 5,
    })
    await within(region()).findByText('배송관리')
    // 나중 낸 조회가 작은 번호(4 — 내 지움만 든 판)로 늦게 닿는다.
    await view.answer(1, { menu: tree((menu) => menu.pop()), rev: 4 })
    await act(async () => {})
    expect(within(region()).queryByText('배송관리')).not.toBeNull()
  })

  it('겹친 조회 — 먼저 낸 조회가 큰 번호를 늦게 답해도 그 답이 선다', async () => {
    const view = await mount({ deleteMenu: vi.fn(async () => undefined) })
    view.frame(5)
    fireEvent.click(within(region()).getByRole('button', { name: '주문관리' }))
    fireEvent.click(treeTool(region(), '삭제'))
    fireEvent.click(within(region()).getByRole('button', { name: '정말 삭제합니까?' }))
    await waitFor(() => expect(view.pending).toHaveLength(2))

    await view.answer(1, { menu: tree((menu) => menu.pop()), rev: 4 })
    await waitFor(() => expect(within(region()).queryByText('주문관리')).toBeNull())
    await view.answer(0, {
      menu: tree((menu) => {
        menu.pop()
        menu.push({ id: 'mn-4', title: '배송관리', sortOrder: 1, pages: [], children: [] })
      }),
      rev: 5,
    })
    await within(region()).findByText('배송관리')
  })

  it('신호로 낸 조회가 실패하면 앞 트리를 그대로 두고 실패를 안 그린다', async () => {
    const view = await mount()
    view.frame(2)
    await view.fail(0)
    await act(async () => {})
    expect(within(region()).queryByText('회원관리')).not.toBeNull()
    expect(within(region()).queryByRole('alert')).toBeNull()
  })

  it('다시 붙으면 트리를 한 번 다시 받는다 — 끊긴 동안의 신호는 다시 안 온다', async () => {
    const view = await mount()
    view.reconnect()
    await waitFor(() => expect(view.readTree).toHaveBeenCalledTimes(2))
  })
})

describe('다시 받은 트리가 열린 것의 대상을 지우면', () => {
  it('이름 입력은 닫히고, 친 글이 있었으면 하단 바가 말한다', async () => {
    const view = await mount()
    fireEvent.click(within(region()).getByRole('button', { name: '주문관리' }))
    fireEvent.click(treeTool(region(), '이름 변경'))
    fireEvent.change(within(region()).getByRole('textbox', { name: '이름' }), { target: { value: '주문 · 결제' } })

    view.frame(2)
    await view.answer(0, { menu: tree((menu) => menu.pop()), rev: 2 })
    await waitFor(() => expect(within(region()).queryByRole('textbox', { name: '이름' })).toBeNull())
    expect(alerts()).toContain(TREE_DRAFT_DROPPED)
  })

  it('친 글이 없으면 닫기만 하고 말하지 않는다', async () => {
    const view = await mount()
    fireEvent.click(within(region()).getByRole('button', { name: '주문관리' }))
    fireEvent.click(treeTool(region(), '이름 변경'))

    view.frame(2)
    await view.answer(0, { menu: tree((menu) => menu.pop()), rev: 2 })
    await waitFor(() => expect(within(region()).queryByRole('textbox', { name: '이름' })).toBeNull())
    expect(alerts()).not.toContain(TREE_DRAFT_DROPPED)
  })

  it('대상이 남았으면(옮겨졌다) 입력은 친 글째 남는다', async () => {
    const view = await mount()
    fireEvent.click(within(region()).getByRole('button', { name: '주문관리' }))
    fireEvent.click(treeTool(region(), '이름 변경'))
    fireEvent.change(within(region()).getByRole('textbox', { name: '이름' }), { target: { value: '주문 · 결제' } })

    view.frame(2)
    await view.answer(0, {
      menu: tree((menu) => {
        const order = menu.pop()!
        menu.unshift({ ...order, sortOrder: 0 })
      }),
      rev: 2,
    })
    await act(async () => {})
    expect((within(region()).getByRole('textbox', { name: '이름' }) as HTMLInputElement).value).toBe('주문 · 결제')
  })

  it('연쇄 삭제 상자 — 서브트리가 바뀌면 «목록이 바뀌었습니다»와 새 목록으로 다시 선다', async () => {
    const view = await mount()
    fireEvent.click(within(region()).getByRole('button', { name: '회원관리' }))
    fireEvent.click(treeTool(region(), '삭제'))
    const box = screen.getByRole('dialog', { name: MENU_DELETE_TITLE })
    expect(within(box).queryByText(CASCADE_CHANGED)).toBeNull()

    view.frame(2)
    await view.answer(0, { menu: tree((menu) => menu[0]!.pages.push({ id: 'pg-new', title: '회원 등급', sortOrder: 2 })), rev: 2 })
    await within(box).findByText(CASCADE_CHANGED)
    expect(
      within(box)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['회원 목록', '회원 상세', '회원 등급'])
  })

  it('연쇄 삭제 상자 — 이름만 바뀌면 같은 행이라 다시 세우지 않는다', async () => {
    const view = await mount()
    fireEvent.click(within(region()).getByRole('button', { name: '회원관리' }))
    fireEvent.click(treeTool(region(), '삭제'))
    const box = screen.getByRole('dialog', { name: MENU_DELETE_TITLE })

    view.frame(2)
    await view.answer(0, { menu: tree((menu) => (menu[0]!.pages[0]!.title = '회원 전체')), rev: 2 })
    await act(async () => {})
    expect(within(box).queryByText(CASCADE_CHANGED)).toBeNull()
  })

  it('연쇄 삭제 상자 — 그 메뉴가 사라지면 닫고 하단 바가 말한다', async () => {
    const view = await mount()
    fireEvent.click(within(region()).getByRole('button', { name: '회원관리' }))
    fireEvent.click(treeTool(region(), '삭제'))

    view.frame(2)
    await view.answer(0, { menu: tree((menu) => menu.shift()), rev: 2 })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: MENU_DELETE_TITLE })).toBeNull())
    expect(alerts()).toContain(cascadeClosedNotice('회원관리'))
  })
})

describe('열린 페이지가 트리에서 사라지면', () => {
  it('캔버스가 서버에 묻고, 서버에도 없으면 «대상을 찾을 수 없습니다»로 간다', async () => {
    let gone = false
    const getPage = vi.fn(async (_projectId: string, pageId: string) => {
      if (gone) throw new ApiError(404, 'not-found', '대상을 찾을 수 없습니다')
      return pageDetail(pageId, DOC)
    })
    const view = await mount({ getPage })
    const before = getPage.mock.calls.length

    gone = true
    view.frame(2)
    await view.answer(0, { menu: tree((menu) => menu[0]!.pages.shift()), rev: 2 })
    await screen.findByText('대상을 찾을 수 없습니다')
    expect(getPage.mock.calls.length).toBe(before + 1)
    expect(currentPath()).toBe(`/projects/${PROJECT_ID}/pages/${PAGE_ID}`)
  })

  // 내 지움의 신호(낸 연결도 받는다)가 그 답보다 먼저 와 트리가 먼저 바뀐 판 — 물으면 캔버스가 404 를 그렸다가 뿌리로 옮겨 간다.
  it('내가 지운 열린 페이지는 묻지 않는다 — 내 지움의 신호가 그 답보다 먼저 와도', async () => {
    let release: () => void = () => {}
    const deletePage = vi.fn(() => new Promise<void>((resolve) => (release = resolve)))
    const getPage = vi.fn(async (_projectId: string, pageId: string) => pageDetail(pageId, DOC))
    const view = await mount({ deletePage, getPage })
    const before = getPage.mock.calls.length
    fireEvent.click(treeTool(region(), '삭제'))
    fireEvent.click(within(region()).getByRole('button', { name: '정말 삭제합니까?' }))
    await waitFor(() => expect(deletePage).toHaveBeenCalledTimes(1))

    view.frame(2)
    await view.answer(0, { menu: tree((menu) => menu[0]!.pages.shift()), rev: 2 })
    await act(async () => {})
    expect(getPage.mock.calls.length).toBe(before)

    await act(async () => release())
    await waitFor(() => expect(view.pending).toHaveLength(2))
    await view.answer(1, { menu: tree((menu) => menu[0]!.pages.shift()), rev: 2 })
    await waitFor(() => expect(currentPath()).toBe(`/projects/${PROJECT_ID}`))
    expect(getPage.mock.calls.length).toBe(before)
  })

  // 첫 트리에 주소의 페이지가 없는 판(지워진 페이지의 주소 · 다른 프로젝트의 주소) — 캔버스의 여는 조회가 이미 404 를 말했다. 앞 트리가 없으니
  // «사라졌다»가 아니다.
  it('첫 트리에 없던 주소의 페이지는 묻지 않는다 — 여는 조회가 이미 말했다', async () => {
    const getPage = vi.fn(async () => {
      throw new ApiError(404, 'not-found', '대상을 찾을 수 없습니다')
    })
    renderEditor({
      route: `${PROJECT_ROUTE}/pages/pg-ghost`,
      apiOverrides: { getPage, readTree: async () => ({ menu: tree(), rev: 1 }) },
    })
    await screen.findByText('대상을 찾을 수 없습니다')
    await within(region()).findByText('회원관리')
    await act(async () => {})
    expect(getPage).toHaveBeenCalledTimes(1)
  })

  it('다른 페이지가 사라진 것은 묻지 않는다', async () => {
    const getPage = vi.fn(async (_projectId: string, pageId: string) => pageDetail(pageId, DOC))
    const view = await mount({ getPage })
    const before = getPage.mock.calls.length
    view.frame(2)
    await view.answer(0, { menu: tree((menu) => menu[0]!.pages.pop()), rev: 2 })
    await act(async () => {})
    expect(getPage.mock.calls.length).toBe(before)
  })
})
