/**
 * **메뉴 트리의 줄 행동과 끌어 놓기**(`src/panels/tree-row-actions.tsx` · `src/panels/menu-tree.tsx` · `src/tree/tree-drop.ts`) —
 * jsdom 판. 옛 툴바 케이스를 줄 행동으로 옮긴 판은 `./menu-crud.test.tsx` 등이 갖고, 여기는 줄 행동에서 새로 생긴 성질을 잰다:
 * 항목의 차례 · 여는 줄이 먼저 골라진다 · 열리지 않은 페이지를 줄로 고른다 · 뿌리 `+` · 끌어 놓기가 보내는 요청.
 *
 * **끌기는 줄 상자를 가짜 자리로 잰다** — jsdom 에는 배치가 없어 `getBoundingClientRect`가 0 이다. 줄(`[data-tree-row]`)마다 문서
 * 차례로 높이 20px 자리를 준다. 실브라우저의 끌기(캡처 · iframe 위 · 끝 스크롤)는 `build-test/tree-drag.test.ts`가 잰다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../../src/api/client'
import type { MenuNode, PageDetail, ProjectView, SessionUser, TreeMenuNode } from '../../src/api/types'
import { App } from '../../src/app'
import { currentPath, fakeApi, renderWithProviders } from '../helpers'
import { installPointerEvents } from '../pointer-events'
import { isOff, pickedRow, rowAction, rowNamed, rowToggle } from './tree-row'

beforeAll(installPointerEvents)

const USER: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }
const PROJECT: ProjectView = { id: 'p-1', name: '설계서', slug: 'proj', description: null, role: 'owner', themeRev: 0 }

/**
 * ```
 * 회원관리   pages: 회원 목록 · 회원 상세
 * └ 권한
 * 주문관리   pages: 주문 목록
 * ```
 */
function tree(): TreeMenuNode[] {
  return [
    {
      id: 'm-member',
      title: '회원관리',
      sortOrder: 0,
      pages: [
        { id: 'pg-list', title: '회원 목록', sortOrder: 0 },
        { id: 'pg-detail', title: '회원 상세', sortOrder: 1 },
      ],
      children: [{ id: 'm-auth', title: '권한', sortOrder: 0, pages: [], children: [] }],
    },
    {
      id: 'm-order',
      title: '주문관리',
      sortOrder: 1,
      pages: [{ id: 'pg-order', title: '주문 목록', sortOrder: 0 }],
      children: [],
    },
  ]
}

function pageDetail(id: string, title: string): PageDetail {
  return {
    id,
    menuNodeId: 'm-member',
    title,
    description: null,
    sortOrder: 0,
    schemaVersion: 1,
    headSeq: 1,
    schema: { version: 1, root: { id: 'n_00000000000a', type: 'Page', children: [] } },
  }
}

function menuNode(id: string, title: string): MenuNode {
  return { id, projectId: 'p-1', parentId: null, title, sortOrder: 0 }
}

async function open(route = '/projects/p-1', overrides: Partial<ApiClient> = {}) {
  const api = {
    getTree: vi.fn(async () => tree()),
    createMenu: vi.fn(async () => menuNode('m-new', '새 메뉴')),
    updateMenu: vi.fn(async () => menuNode('m-member', '회원관리')),
    updatePage: vi.fn(async () => pageDetail('pg-list', '회원 목록')),
    deletePage: vi.fn(async () => undefined),
  }
  const client = fakeApi({
    me: async () => USER,
    getProject: async () => PROJECT,
    getPage: async (_projectId, pageId) => pageDetail(pageId, `페이지 ${pageId}`),
    listMyRevisions: async () => [],
    ...api,
    ...overrides,
  })
  renderWithProviders(<App />, { client, route })
  await screen.findByRole('heading', { name: PROJECT.name })
  await screen.findByText('회원관리')
  return api
}

function treeRegion(): HTMLElement {
  return screen.getByRole('region', { name: '메뉴·페이지 트리' })
}

/** 줄의 `+` · `…`를 열어 그 목록의 항목 이름을 차례대로. */
function itemsOf(row: HTMLElement, which: '+' | '…'): string[] {
  const toggle = rowToggle(row, which)
  if (toggle === null) throw new Error(`${which} 가 없다`)
  if (toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle)
  const list = document.getElementById(toggle.getAttribute('aria-controls') ?? '')
  if (list === null) throw new Error('목록이 없다')
  return within(list)
    .getAllByRole('menuitem')
    .map((item) => item.textContent ?? '')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('줄 행동의 항목 — spec 「트리」 표', () => {
  it('메뉴 줄: `+` 하위 메뉴 · 페이지 추가 · 팝업 페이지 추가 · JSON 에서 가져오기…, `…` 이름 변경 · 위로 · 아래로 · 들여쓰기 · 내어쓰기 · 삭제', async () => {
    await open()
    const row = rowNamed(treeRegion(), '회원관리')

    expect(itemsOf(row, '+')).toEqual(['하위 메뉴', '페이지 추가', '팝업 페이지 추가', 'JSON 에서 가져오기…'])
    expect(itemsOf(row, '…')).toEqual(['이름 변경', '위로', '아래로', '들여쓰기', '내어쓰기', '삭제'])
  })

  it('페이지 줄: `+` 없음, `…` 이름 변경 · 옮기기 · 위로 · 아래로 · JSON 내보내기 · 삭제 — 상태를 다루는 입구는 «페이지 정보» 탭이다', async () => {
    await open()
    const row = rowNamed(treeRegion(), '회원 상세')

    expect(rowToggle(row, '+')).toBeNull()
    expect(itemsOf(row, '…')).toEqual(['이름 변경', '옮기기', '위로', '아래로', 'JSON 내보내기', '삭제'])
  })

  it('접근 이름이 줄마다 갈린다 — «회원관리 추가» · «회원관리 더 보기»', async () => {
    await open()
    const row = rowNamed(treeRegion(), '회원관리')

    expect(rowToggle(row, '+')?.getAttribute('aria-label')).toBe('회원관리 추가')
    expect(rowToggle(row, '…')?.getAttribute('aria-label')).toBe('회원관리 더 보기')
  })
})

describe('줄 행동을 열면 그 줄이 먼저 골라진다', () => {
  it('다른 줄을 고른 채 열어도 항목은 여는 줄의 판정이다', async () => {
    // 회원관리는 하위가 있어 삭제가 꺼지고, 주문관리는 페이지가 있어 역시 꺼진다 — 권한(비었다)은 켜진다.
    await open()
    fireEvent.click(within(treeRegion()).getByRole('button', { name: '회원관리' }))

    const auth = rowNamed(treeRegion(), '권한')
    rowAction(treeRegion(), '삭제', auth)

    expect(pickedRow(treeRegion())).toBe(auth)
    expect(within(treeRegion()).getByRole('button', { name: '권한' }).getAttribute('aria-pressed')).toBe('true')
    expect(isOff(rowAction(treeRegion(), '삭제', auth))).toBe(false)
  })

  it('열리지 않은 페이지를 줄로 고르고 이름을 바꾸면 그 페이지에 나간다 — 주소는 그대로', async () => {
    const api = await open('/projects/p-1/pages/pg-list')
    const detail = rowNamed(treeRegion(), '회원 상세')

    fireEvent.click(rowAction(treeRegion(), '이름 변경', detail))
    const input = within(treeRegion()).getByRole('textbox', { name: '이름' }) as HTMLInputElement
    // 초기값이 그 페이지의 제목이다(열린 페이지의 것이 아니다).
    expect(input.value).toBe('회원 상세')
    fireEvent.change(input, { target: { value: '회원 정보' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(api.updatePage).toHaveBeenCalled())
    // 바탕(`base`)도 그 페이지의 제목이다 — 열린 페이지의 것이면 서버가 «남이 바꿨다»로 거절한다(`api/page-meta.ts`).
    expect(api.updatePage).toHaveBeenCalledWith('p-1', 'pg-detail', { title: '회원 정보', base: { title: '회원 상세' } }, expect.anything())
    expect(currentPath()).toBe('/projects/p-1/pages/pg-list')
  })

  it('열리지 않은 페이지를 줄로 지우면 그 페이지가 지워지고 주소는 그대로다', async () => {
    const api = await open('/projects/p-1/pages/pg-list')
    const detail = rowNamed(treeRegion(), '회원 상세')

    fireEvent.click(rowAction(treeRegion(), '삭제', detail))
    fireEvent.click(within(treeRegion()).getByRole('button', { name: '정말 삭제합니까?' }))

    await waitFor(() => expect(api.deletePage).toHaveBeenCalledTimes(1))
    expect(api.deletePage).toHaveBeenCalledWith('p-1', 'pg-detail')
    await waitFor(() => expect(api.getTree).toHaveBeenCalledTimes(2))
    expect(currentPath()).toBe('/projects/p-1/pages/pg-list')
  })

  it('삭제 확인이 걸린 줄의 `…`를 다시 열어도 확인이 풀리지 않는다 — 이미 고른 줄은 다시 고르지 않는다', async () => {
    await open()
    const auth = rowNamed(treeRegion(), '권한')
    fireEvent.click(rowAction(treeRegion(), '삭제', auth))
    const confirm = within(treeRegion()).getByRole('button', { name: '정말 삭제합니까?' })
    // 확인 단추가 포커스를 받는다 — Enter 가 두 번째 누름이고 Escape 가 그 자리의 취소다.
    expect(document.activeElement).toBe(confirm)

    fireEvent.click(rowToggle(auth, '…') as HTMLElement)

    expect(within(treeRegion()).queryByRole('button', { name: '정말 삭제합니까?' })).not.toBeNull()
  })
})

describe('뿌리 `+` — 트리 제목 줄', () => {
  it('«최상위 메뉴 추가» → 트리 아래 입력 → parentId null 로 나간다', async () => {
    const api = await open()
    const root = within(treeRegion()).getByRole('button', { name: '메뉴 트리에 추가' })
    // 제목 줄에 선다 — 제목(`<h2>`)과 한 상자.
    expect(root.closest('.wb-shell-region-head')).not.toBeNull()

    fireEvent.click(root)
    fireEvent.click(screen.getByRole('menuitem', { name: '최상위 메뉴 추가' }))
    const input = within(treeRegion()).getByRole('textbox', { name: '이름' }) as HTMLInputElement
    // 줄 아래가 아니라 트리 아래에 선다 — 붙을 줄이 없다.
    expect(input.closest('.wb-shell-tree-row')).toBeNull()
    expect(input.closest('li')).toBeNull()
    fireEvent.change(input, { target: { value: '설정' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(api.createMenu).toHaveBeenCalledTimes(1))
    expect(api.createMenu).toHaveBeenCalledWith('p-1', { parentId: null, title: '설정' })
  })

  it('고른 줄이 있어도 최상위 메뉴 입력은 트리 아래 하나다', async () => {
    await open('/projects/p-1/pages/pg-list')
    fireEvent.click(within(treeRegion()).getByRole('button', { name: '메뉴 트리에 추가' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '최상위 메뉴 추가' }))

    const inputs = within(treeRegion()).getAllByRole('textbox', { name: '이름' })
    expect(inputs).toHaveLength(1)
    expect(inputs[0]?.closest('li')).toBeNull()
  })
})

/**
 * 줄(`[data-tree-row]`)마다 문서 차례로 20px 자리를 준다 — 줄 i 는 `top = i × 20`. 끌기가 자리를 묻는 것은 줄 상자뿐이다
 * (`drag/use-pointer-drag.ts`의 `elementAt`). 그 밖의 요소는 0 이다.
 */
function layRows(): string[] {
  const rows = [...treeRegion().querySelectorAll<HTMLElement>('[data-tree-row]')]
  const titles = rows.map((row) => row.firstElementChild?.textContent ?? '')
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const at = [...treeRegion().querySelectorAll<HTMLElement>('[data-tree-row]')].indexOf(this)
    if (at === -1) return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) }
    const top = at * 20
    return { left: 0, top, right: 200, bottom: top + 20, width: 200, height: 20, x: 0, y: top, toJSON: () => ({}) }
  })
  return titles
}

/** `title` 줄의 세로 가운데 · 위 끝 근처 · 아래 끝 근처. */
function yOf(titles: string[], title: string, zone: 'top' | 'middle' | 'bottom'): number {
  const at = titles.indexOf(title)
  if (at === -1) throw new Error(`${title} 줄이 없다`)
  return at * 20 + (zone === 'top' ? 2 : zone === 'middle' ? 10 : 18)
}

/** `from` 줄을 눌러 끌고 `to` 자리에서 뗀다. */
function dragRow(titles: string[], from: string, to: { title: string; zone: 'top' | 'middle' | 'bottom' }): void {
  const handle = rowNamed(treeRegion(), from).firstElementChild as HTMLElement
  const startY = yOf(titles, from, 'middle')
  fireEvent.pointerDown(handle, { button: 0, clientX: 50, clientY: startY, pointerId: 1 })
  fireEvent.pointerMove(window, { clientX: 50, clientY: startY + 8, pointerId: 1 })
  const y = yOf(titles, to.title, to.zone)
  fireEvent.pointerMove(window, { clientX: 50, clientY: y, pointerId: 1 })
  fireEvent.pointerUp(window, { clientX: 50, clientY: y, pointerId: 1 })
}

describe('끌어 놓기 — 보내는 요청(jsdom · 가짜 자리)', () => {
  it('줄 차례가 트리 차례다 — 가짜 자리의 전제', async () => {
    await open()
    expect(layRows()).toEqual(['회원관리', '회원 목록', '회원 상세', '권한', '주문관리', '주문 목록'])
  })

  it('페이지를 다른 메뉴 페이지 아래로 → menuNodeId · sortOrder(그 메뉴 안 차례)', async () => {
    const api = await open()
    const titles = layRows()

    dragRow(titles, '회원 상세', { title: '주문 목록', zone: 'bottom' })

    await waitFor(() => expect(api.updatePage).toHaveBeenCalledTimes(1))
    expect(api.updatePage).toHaveBeenCalledWith('p-1', 'pg-detail', { menuNodeId: 'm-order', sortOrder: 1 })
    await waitFor(() => expect(api.getTree).toHaveBeenCalledTimes(2))
  })

  it('페이지를 같은 메뉴 안에서 → sortOrder 하나만(옮긴 뒤 차례)', async () => {
    const api = await open()
    const titles = layRows()

    dragRow(titles, '회원 목록', { title: '회원 상세', zone: 'bottom' })

    await waitFor(() => expect(api.updatePage).toHaveBeenCalledTimes(1))
    expect(api.updatePage).toHaveBeenCalledWith('p-1', 'pg-list', { sortOrder: 1 })
  })

  it('메뉴를 다른 메뉴 안으로 → parentId · sortOrder(마지막 자식)', async () => {
    const api = await open()
    const titles = layRows()

    dragRow(titles, '주문관리', { title: '회원관리', zone: 'middle' })

    await waitFor(() => expect(api.updateMenu).toHaveBeenCalledTimes(1))
    expect(api.updateMenu).toHaveBeenCalledWith('p-1', 'm-order', { parentId: 'm-member', sortOrder: 1 })
  })

  it('메뉴를 자기 자손 위에 놓으면 요청이 없다 · 표시도 없다', async () => {
    const api = await open()
    const titles = layRows()

    const handle = rowNamed(treeRegion(), '회원관리').firstElementChild as HTMLElement
    fireEvent.pointerDown(handle, { button: 0, clientX: 50, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 50, clientY: 30, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 50, clientY: yOf(titles, '권한', 'middle'), pointerId: 1 })
    expect(document.querySelector('.wb-shell-drop-indicator')).toBeNull()
    fireEvent.pointerUp(window, { clientX: 50, clientY: yOf(titles, '권한', 'middle'), pointerId: 1 })

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(api.updateMenu).not.toHaveBeenCalled()
  })

  it('끄는 동안 선 · 강조가 선다 — 형제는 선, 안은 강조', async () => {
    await open()
    const titles = layRows()
    const handle = rowNamed(treeRegion(), '주문관리').firstElementChild as HTMLElement
    fireEvent.pointerDown(handle, { button: 0, clientX: 50, clientY: yOf(titles, '주문관리', 'middle'), pointerId: 1 })

    fireEvent.pointerMove(window, { clientX: 50, clientY: yOf(titles, '회원관리', 'top'), pointerId: 1 })
    expect(document.querySelector<HTMLElement>('.wb-shell-drop-indicator')?.dataset['placement']).toBe('before')
    fireEvent.pointerMove(window, { clientX: 50, clientY: yOf(titles, '회원관리', 'middle'), pointerId: 1 })
    expect(document.querySelector<HTMLElement>('.wb-shell-drop-indicator')?.dataset['placement']).toBe('inside')
    // 끄는 줄은 흐려진다.
    expect(rowNamed(treeRegion(), '주문관리').classList.contains('wb-shell-tree-row-dragging')).toBe(true)

    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.querySelector('.wb-shell-drop-indicator')).toBeNull()
  })

  it('끌어 놓은 페이지 링크는 열리지 않는다 — 끈 뒤의 클릭을 삼킨다', async () => {
    const api = await open('/projects/p-1/pages/pg-list')
    const titles = layRows()

    dragRow(titles, '주문 목록', { title: '회원 목록', zone: 'top' })
    // 브라우저가 뗀 뒤 누른 요소에 내는 click.
    fireEvent.click(within(treeRegion()).getByRole('link', { name: '주문 목록' }))

    await waitFor(() => expect(api.updatePage).toHaveBeenCalledTimes(1))
    expect(currentPath()).toBe('/projects/p-1/pages/pg-list')
  })

  it('뷰 모드에서는 끌리지 않는다', async () => {
    const api = await open()
    const titles = layRows()
    fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))

    dragRow(titles, '회원 상세', { title: '주문 목록', zone: 'bottom' })

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(api.updatePage).not.toHaveBeenCalled()
  })
})
