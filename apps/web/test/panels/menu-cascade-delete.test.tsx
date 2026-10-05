/**
 * **메뉴 연쇄 삭제 — 확인 상자**(`src/panels/menu-delete-dialog.tsx` · `src/tree/use-tree-commands.tsx`의 `askRemove` · `confirmCascade`).
 *
 * 하위(메뉴 · 페이지)가 있는 메뉴의 «삭제»는 확인 상자를 열고, 상자가 보인 id 집합을 싣고 연쇄 삭제를 보낸다. 하위가 없는 메뉴는 줄 아래의
 * 두 번 누르기 그대로다(`./menu-crud.test.tsx` «삭제»).
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiClient, type MenuCascadeResult } from '../../src/api/client'
import type { PageDetail, ProjectView, SessionUser, TreeMenuNode, TreePage } from '../../src/api/types'
import { App } from '../../src/app'
import {
  CASCADE_CHANGED,
  CASCADE_GONE,
  CASCADE_SAFETY_NOTE,
  MENU_DELETE_CONFIRM,
  MENU_DELETE_TITLE,
  PAGE_PREVIEW_LIMIT,
} from '../../src/panels/menu-delete-dialog'
import { currentPath, fakeApi, renderWithProviders } from '../helpers'
import { rowNamed, treeTool } from './tree-row'

const USER: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }
const PROJECT_NAME = '설계서'
const PROJECT: ProjectView = { id: 'p-1', name: PROJECT_NAME, slug: 'proj', description: null, role: 'owner', themeRev: 0 }

afterEach(() => {
  vi.restoreAllMocks()
})

function pages(count: number, prefix = '회원', key = 'm'): TreePage[] {
  return Array.from({ length: count }, (_, index) => ({ id: `pg-${key}-${index}`, title: `${prefix} 화면 ${index + 1}`, sortOrder: index }))
}

/**
 * ```
 * 회원관리(m-member)   pages: 회원 화면 1 · 2
 * └ 권한(m-auth)       pages: 권한 화면 1
 * 주문관리(m-order)    (비었다)
 * ```
 */
function tree(memberPages = pages(2)): TreeMenuNode[] {
  return [
    {
      id: 'm-member',
      title: '회원관리',
      sortOrder: 0,
      pages: memberPages,
      children: [{ id: 'm-auth', title: '권한', sortOrder: 0, pages: pages(1, '권한', 'a'), children: [] }],
    },
    { id: 'm-order', title: '주문관리', sortOrder: 1, pages: [], children: [] },
  ]
}

function pageDetail(id: string): PageDetail {
  return {
    id,
    menuNodeId: 'm-member',
    title: id,
    description: null,
    sortOrder: 0,
    schemaVersion: 1,
    headSeq: 1,
    schema: { version: 1, root: { id: 'n_00000000000a', type: 'Page', children: [] } },
  }
}

const DONE: MenuCascadeResult = { deleted: { menus: 1, pages: 3 }, safetySnapshot: { id: 's-1', tag: '메뉴 "회원관리" 삭제 전 …' } }

async function open(overrides: Partial<ApiClient> = {}, route = '/projects/p-1') {
  const getTree = vi.fn(async () => tree())
  const deleteMenu = vi.fn(async () => undefined)
  const deleteMenuCascade = vi.fn(async () => DONE)
  const client = fakeApi({
    me: async () => USER,
    getProject: async () => PROJECT,
    getPage: async (_projectId, pageId) => pageDetail(pageId),
    listMyRevisions: async () => [],
    getTree,
    deleteMenu,
    deleteMenuCascade,
    ...overrides,
  })
  renderWithProviders(<App />, { client, route })
  await screen.findByRole('heading', { name: PROJECT_NAME })
  await screen.findByText('회원관리')
  return { client, getTree: (overrides.getTree as typeof getTree | undefined) ?? getTree, deleteMenu, deleteMenuCascade: (overrides.deleteMenuCascade as typeof deleteMenuCascade | undefined) ?? deleteMenuCascade }
}

function region(): HTMLElement {
  return screen.getByRole('region', { name: '메뉴·페이지 트리' })
}

function pickMenu(title: string): void {
  fireEvent.click(within(region()).getByRole('button', { name: title }))
}

function askDelete(title: string): void {
  pickMenu(title)
  fireEvent.click(treeTool(region(), '삭제'))
}

function dialog(): HTMLElement {
  return screen.getByRole('dialog', { name: MENU_DELETE_TITLE })
}

/** `aria-describedby`가 가리키는 요소들의 글 — 상자가 열릴 때 함께 읽히는 것. */
function description(element: HTMLElement): string {
  const ids = (element.getAttribute('aria-describedby') ?? '').split(/\s+/).filter((id) => id !== '')
  return ids.map((id) => document.getElementById(id)?.textContent ?? `<없는 id ${id}>`).join(' / ')
}

describe('하위가 있는 메뉴의 삭제 — 확인 상자', () => {
  it('«삭제»는 요청 없이 상자를 연다 — 문장 · 경고 상자 · 지워질 페이지 이름 · 안전망 안내', async () => {
    const api = await open()
    askDelete('회원관리')

    const box = dialog()
    expect(api.deleteMenu).not.toHaveBeenCalled()
    expect(api.deleteMenuCascade).not.toHaveBeenCalled()
    expect(within(box).getByText('"회원관리" 메뉴와 하위 메뉴 1개 · 페이지 3개가 함께 삭제됩니다')).toBeDefined()
    expect(within(box).getByText('페이지 3개와 그 안의 설계가 모두 삭제됩니다')).toBeDefined()
    // 트리가 그리는 차례 — 메뉴마다 페이지 먼저, 그다음 하위 메뉴.
    expect(within(box).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['회원 화면 1', '회원 화면 2', '권한 화면 1'])
    expect(within(box).getByText(CASCADE_SAFETY_NOTE)).toBeDefined()
    // 줄 아래의 두 번 누르기 확인은 서지 않는다.
    expect(within(region()).queryByRole('button', { name: '정말 삭제합니까?' })).toBeNull()
  })

  it('상자의 설명이 문장과 경고 상자를 함께 품는다(aria-describedby)', async () => {
    await open()
    askDelete('회원관리')
    expect(description(dialog())).toBe(
      '"회원관리" 메뉴와 하위 메뉴 1개 · 페이지 3개가 함께 삭제됩니다 / 페이지 3개와 그 안의 설계가 모두 삭제됩니다회원 화면 1회원 화면 2권한 화면 1',
    )
  })

  it('경고 상자는 경고 아이콘과 위험 색 칸이다 · 확인 단추는 아이콘 없는 글이다', async () => {
    await open()
    askDelete('회원관리')
    const warning = dialog().querySelector('.wb-shell-menu-delete-warning')
    expect(warning).not.toBeNull()
    expect(warning!.querySelector('svg.wb-shell-menu-delete-warning-icon[aria-hidden="true"]')).not.toBeNull()
    const confirm = within(dialog()).getByRole('button', { name: MENU_DELETE_CONFIRM })
    expect(confirm.className).toBe('wb-shell-menu-delete-confirm')
    expect(confirm.querySelector('svg')).toBeNull()
  })

  it(`페이지가 ${PAGE_PREVIEW_LIMIT}개를 넘으면 앞 ${PAGE_PREVIEW_LIMIT}개와 «외 N개»`, async () => {
    await open({ getTree: vi.fn(async () => tree(pages(8))) })
    askDelete('회원관리')
    const items = within(dialog()).getAllByRole('listitem').map((item) => item.textContent)
    expect(items).toEqual(['회원 화면 1', '회원 화면 2', '회원 화면 3', '회원 화면 4', '회원 화면 5', '외 4개'])
  })

  it('«모두 삭제»가 상자가 보인 id 집합을 싣고 연쇄 삭제를 보낸다 — 트리를 다시 받는다', async () => {
    const api = await open()
    askDelete('회원관리')
    fireEvent.click(within(dialog()).getByRole('button', { name: MENU_DELETE_CONFIRM }))
    await waitFor(() => expect(api.deleteMenuCascade).toHaveBeenCalledTimes(1))
    expect(api.deleteMenuCascade).toHaveBeenCalledWith('p-1', 'm-member', {
      menuIds: ['m-auth'],
      pageIds: ['pg-m-0', 'pg-m-1', 'pg-a-0'],
    })
    expect(api.deleteMenu).not.toHaveBeenCalled()
    await waitFor(() => expect(api.getTree).toHaveBeenCalledTimes(2))
    expect(screen.queryByRole('dialog', { name: MENU_DELETE_TITLE })).toBeNull()
  })

  it('«취소» · Escape 는 아무것도 안 보낸다', async () => {
    const api = await open()
    askDelete('회원관리')
    fireEvent.click(within(dialog()).getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('dialog', { name: MENU_DELETE_TITLE })).toBeNull()
    askDelete('회원관리')
    fireEvent.keyDown(dialog(), { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: MENU_DELETE_TITLE })).toBeNull()
    expect(api.deleteMenuCascade).not.toHaveBeenCalled()
  })

  it('Delete 키로도 같은 상자가 선다 · 상자 안의 Delete 는 뒤 트리에 닿지 않는다', async () => {
    const api = await open()
    pickMenu('회원관리')
    fireEvent.keyDown(rowNamed(region(), '회원관리'), { key: 'Delete' })
    const box = dialog()
    fireEvent.keyDown(within(box).getByRole('button', { name: '취소' }), { key: 'Delete' })
    expect(screen.getAllByRole('dialog', { name: MENU_DELETE_TITLE })).toHaveLength(1)
    expect(api.deleteMenu).not.toHaveBeenCalled()
    expect(api.deleteMenuCascade).not.toHaveBeenCalled()
  })

  /** 서버가 «목록이 바뀌었다»로 돌려보낸 409 — `subtree`가 지금 목록이다(apps/api README «메뉴 연쇄 삭제»). */
  function changed(subtree: unknown): ApiError {
    return new ApiError(409, 'conflict', '그 사이 하위 메뉴나 페이지가 바뀌었습니다', [
      { path: 'expect', code: 'menu-subtree-changed', message: '바뀜', subtree },
    ], true)
  }

  /** 남이 «회원 화면 2»를 빼고 «새 결제 화면(bob)»을 넣은 판 — 수(메뉴 1 · 페이지 3)는 처음과 같다. */
  const NOW = {
    title: '회원관리',
    menus: [{ id: 'm-auth', title: '권한' }],
    pages: [
      { id: 'pg-m-0', title: '회원 화면 1' },
      { id: 'pg-bob', title: '새 결제 화면(bob)' },
      { id: 'pg-a-0', title: '권한 화면 1' },
    ],
  }

  it('서버가 «목록이 바뀌었다»(409)면 그 409 의 목록으로 상자를 다시 열고 · 다시 누르면 그 목록의 id 를 싣는다', async () => {
    let reads = 0
    const getTree = vi.fn(async () => {
      reads += 1
      // 다시 받은 트리는 409 뒤의 조회다 — 409 목록과 또 다를 수 있다. 상자는 409 목록을 보인다(`cascadeShown`).
      return reads === 1 ? tree() : tree(pages(3))
    })
    let calls = 0
    const deleteMenuCascade = vi.fn(async (): Promise<MenuCascadeResult> => {
      calls += 1
      if (calls === 1) throw changed(NOW)
      return DONE
    })
    await open({ getTree, deleteMenuCascade })
    askDelete('회원관리')
    fireEvent.click(within(dialog()).getByRole('button', { name: MENU_DELETE_CONFIRM }))
    await waitFor(() => expect(getTree).toHaveBeenCalledTimes(2))
    const box = await screen.findByRole('dialog', { name: MENU_DELETE_TITLE })
    expect(within(box).getByText(CASCADE_CHANGED)).toBeDefined()
    expect(within(box).getByText('"회원관리" 메뉴와 하위 메뉴 1개 · 페이지 3개가 함께 삭제됩니다')).toBeDefined()
    expect(within(box).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['회원 화면 1', '새 결제 화면(bob)', '권한 화면 1'])
    // 트리의 실패 줄에는 서지 않는다 — 상자가 그 말을 한다.
    expect(within(region()).queryByRole('alert')).toBeNull()

    fireEvent.click(within(box).getByRole('button', { name: MENU_DELETE_CONFIRM }))
    await waitFor(() => expect(deleteMenuCascade).toHaveBeenCalledTimes(2))
    expect(deleteMenuCascade).toHaveBeenNthCalledWith(1, 'p-1', 'm-member', { menuIds: ['m-auth'], pageIds: ['pg-m-0', 'pg-m-1', 'pg-a-0'] })
    expect(deleteMenuCascade).toHaveBeenNthCalledWith(2, 'p-1', 'm-member', { menuIds: ['m-auth'], pageIds: ['pg-m-0', 'pg-bob', 'pg-a-0'] })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: MENU_DELETE_TITLE })).toBeNull())
  })

  it('409 의 목록에 열린 페이지가 들었으면(낡은 트리에서는 밖이었다) 지운 뒤 프로젝트 루트로 옮긴다', async () => {
    let calls = 0
    const deleteMenuCascade = vi.fn(async (): Promise<MenuCascadeResult> => {
      calls += 1
      if (calls === 1) throw changed({ ...NOW, pages: [...NOW.pages, { id: 'pg-moved', title: '옮겨 온 화면' }] })
      return DONE
    })
    await open({ deleteMenuCascade }, '/projects/p-1/pages/pg-moved')
    askDelete('회원관리')
    fireEvent.click(within(dialog()).getByRole('button', { name: MENU_DELETE_CONFIRM }))
    const box = await screen.findByRole('dialog', { name: MENU_DELETE_TITLE })
    await within(box).findByText(CASCADE_CHANGED)
    expect(currentPath()).toBe('/projects/p-1/pages/pg-moved')
    fireEvent.click(within(box).getByRole('button', { name: MENU_DELETE_CONFIRM }))
    await waitFor(() => expect(currentPath()).toBe('/projects/p-1'))
  })

  it('그 밖의 실패는 트리의 실패 줄로 간다', async () => {
    const deleteMenuCascade = vi.fn(async (): Promise<MenuCascadeResult> => {
      throw new ApiError(403, 'forbidden', '편집 권한이 없습니다', [], true)
    })
    await open({ deleteMenuCascade })
    askDelete('회원관리')
    fireEvent.click(within(dialog()).getByRole('button', { name: MENU_DELETE_CONFIRM }))
    await within(region()).findByText('편집 권한이 없습니다')
    expect(screen.queryByRole('dialog', { name: MENU_DELETE_TITLE })).toBeNull()
  })

  it('열린 페이지가 지운 서브트리 안이면 프로젝트 루트로 옮긴다', async () => {
    await open({}, '/projects/p-1/pages/pg-a-0')
    askDelete('회원관리')
    fireEvent.click(within(dialog()).getByRole('button', { name: MENU_DELETE_CONFIRM }))
    await waitFor(() => expect(currentPath()).toBe('/projects/p-1'))
  })

  it('409 의 목록이 꼴이 틀리면 다시 받은 트리로 센다 — 그 메뉴가 트리에서 사라졌으면 그렇게 말하고 확인을 끈다(까닭은 title · aria-description)', async () => {
    let reads = 0
    const getTree = vi.fn(async () => {
      reads += 1
      return reads === 1 ? tree() : tree().slice(1)
    })
    const deleteMenuCascade = vi.fn(async (): Promise<MenuCascadeResult> => {
      throw changed({ menus: 0, pages: 0 })
    })
    await open({ getTree, deleteMenuCascade })
    askDelete('회원관리')
    fireEvent.click(within(dialog()).getByRole('button', { name: MENU_DELETE_CONFIRM }))
    const box = await screen.findByRole('dialog', { name: MENU_DELETE_TITLE })
    await within(box).findByText(CASCADE_GONE)
    const confirm = within(box).getByRole('button', { name: MENU_DELETE_CONFIRM }) as HTMLButtonElement
    // 꺼진 동안도 포커스는 받는다(`aria-disabled` — 이유에 키보드로 닿는다) · 눌러도 안 보낸다.
    expect(confirm.getAttribute('aria-disabled')).toBe('true')
    expect(confirm.disabled).toBe(false)
    expect(confirm.title).toBe(CASCADE_GONE)
    expect(confirm.getAttribute('aria-description')).toBe(CASCADE_GONE)
    fireEvent.click(confirm)
    expect(deleteMenuCascade).toHaveBeenCalledTimes(1)
  })
})

describe('하위가 없는 메뉴의 삭제 — 지금 그대로', () => {
  it('줄 아래의 두 번 누르기 확인이고 본문 없는 삭제를 보낸다', async () => {
    const api = await open()
    askDelete('주문관리')
    expect(screen.queryByRole('dialog', { name: MENU_DELETE_TITLE })).toBeNull()
    fireEvent.click(within(region()).getByRole('button', { name: '정말 삭제합니까?' }))
    await waitFor(() => expect(api.deleteMenu).toHaveBeenCalledWith('p-1', 'm-order'))
    expect(api.deleteMenuCascade).not.toHaveBeenCalled()
  })
})
