/**
 * 메뉴 트리의 키보드 단축키와 통합(P2b-4 Task 10).
 *
 * **단축키는 버튼을 지나지 않는다** — `disabled`가 막던 것을 여기서는 **판정과 잠금**이
 * 막아야 한다(D2·D8). 그것이 이 파일의 하중이다.
 *
 * `structure-keyboard.test.tsx`가 선례지만 **표는 따로 둔다** — 두 트리가 한 화면에 있고
 * 조작이 다르다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../../src/api/client'
import type { MenuNode, PageDetail, ProjectDetail, SessionUser, TreeMenuNode } from '../../src/api/types'
import { App } from '../../src/app'
import { fakeApi, renderWithProviders } from '../helpers'

const USER: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }
const PROJECT: ProjectDetail = { id: 'p-1', name: '설계서', slug: 'proj', description: null, role: 'owner' }

/** `menu-move.test.tsx`와 같은 모양 — 형제 셋이 있어야 가운데를 고를 수 있다. */
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
      children: [
        { id: 'm-auth', title: '권한', sortOrder: 0, pages: [], children: [] },
        { id: 'm-grade', title: '등급', sortOrder: 1, pages: [], children: [] },
        { id: 'm-hist', title: '이력', sortOrder: 2, pages: [], children: [] },
      ],
    },
    { id: 'm-order', title: '주문관리', sortOrder: 1, pages: [], children: [] },
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

function stubs(overrides: Partial<ApiClient> = {}) {
  const getTree = vi.fn(async () => tree())
  const updateMenu = vi.fn(async (): Promise<MenuNode> => ({ id: 'm-grade', projectId: 'p-1', parentId: null, title: 'x', sortOrder: 0 }))
  const updatePage = vi.fn(async () => pageDetail('pg-list', '회원 목록'))
  const deleteMenu = vi.fn(async () => undefined)
  const createMenu = vi.fn(async (): Promise<MenuNode> => ({ id: 'm-new', projectId: 'p-1', parentId: 'm-member', title: '새', sortOrder: 0 }))

  const client = fakeApi({
    me: async () => USER,
    getProject: async () => PROJECT,
    getPage: async (_p, pageId) => pageDetail(pageId, `페이지 ${pageId}`),
    listMyRevisions: async () => [],
    getTree,
    updateMenu,
    updatePage,
    deleteMenu,
    createMenu,
    ...overrides,
  })

  // **덮어쓴 것이 있으면 그것을 돌려준다.** 자기가 만든 스텁을 그대로 내면 케이스가
  // 부르지도 않은 함수의 호출 수를 세게 된다(실제로 그렇게 두 케이스가 0회를 봤다).
  return {
    client,
    getTree: (overrides.getTree ?? getTree) as typeof getTree,
    updateMenu: (overrides.updateMenu ?? updateMenu) as typeof updateMenu,
    updatePage: (overrides.updatePage ?? updatePage) as typeof updatePage,
    deleteMenu: (overrides.deleteMenu ?? deleteMenu) as typeof deleteMenu,
    createMenu: (overrides.createMenu ?? createMenu) as typeof createMenu,
  }
}

async function open(overrides: Partial<ApiClient> = {}, route = '/projects/p-1') {
  const harness = stubs(overrides)
  renderWithProviders(<App />, { client: harness.client, route })
  await screen.findByRole('heading', { name: '설계서' })
  await screen.findByText('회원관리')
  return harness
}

function treeRegion(): HTMLElement {
  return screen.getByRole('region', { name: '메뉴·페이지 트리' })
}
function toolbar(): HTMLElement {
  return within(treeRegion()).getByRole('group', { name: '메뉴 편집' })
}
function tool(name: string): HTMLButtonElement {
  return within(toolbar()).getByRole('button', { name }) as HTMLButtonElement
}
function menuButton(title: string): HTMLElement {
  return within(treeRegion()).getByRole('button', { name: title })
}

/** 단축키가 붙은 상자. 트리와 툴바를 함께 감싼다. */
function keyTarget(): HTMLElement {
  const box = treeRegion().querySelector('.wb-shell-tree-keys')
  if (box === null) throw new Error('단축키 상자를 찾지 못했습니다')
  return box as HTMLElement
}

describe('메뉴 트리 단축키', () => {
  it('Delete와 Backspace가 삭제 확인을 건다', async () => {
    // **바로 지우지 않는다 — D7이 단축키에도 걸린다.** 키 하나로 사라지면 되돌릴 길이 없다.
    for (const key of ['Delete', 'Backspace']) {
      const api = await open()
      fireEvent.click(menuButton('권한'))
      fireEvent.keyDown(keyTarget(), { key })

      expect(api.deleteMenu, key).not.toHaveBeenCalled()
      expect(within(toolbar()).getByRole('button', { name: '정말 삭제합니까?' })).toBeDefined()
      screen.getByRole('heading', { name: '설계서' }).ownerDocument.body.replaceChildren()
    }
  })

  it('Alt+화살표가 위/아래로 옮긴다', async () => {
    const api = await open()

    fireEvent.click(menuButton('등급'))
    fireEvent.keyDown(keyTarget(), { key: 'ArrowUp', altKey: true })

    await waitFor(() => expect(api.updateMenu).toHaveBeenCalledTimes(1))
    expect(api.updateMenu).toHaveBeenCalledWith('p-1', 'm-grade', { sortOrder: 0 })
  })

  it('Alt+Shift+화살표가 들여/내어쓴다', async () => {
    const api = await open()

    fireEvent.click(menuButton('등급'))
    fireEvent.keyDown(keyTarget(), { key: 'ArrowRight', altKey: true, shiftKey: true })

    await waitFor(() => expect(api.updateMenu).toHaveBeenCalledTimes(1))
    expect(api.updateMenu).toHaveBeenCalledWith('p-1', 'm-grade', { parentId: 'm-auth' })
  })

  it('비활성인 조작은 단축키로도 실행되지 않는다', async () => {
    // **여기가 판정의 하중이다.** 키 이벤트는 `disabled`를 지나지 않으므로, 판정을 다시
    // 보지 않으면 비활성인 조작이 단축키로만 실행된다.
    const api = await open()

    // `권한`은 첫 형제라 `위로`·`들여쓰기`가 비활성이다.
    fireEvent.click(menuButton('권한'))
    expect(tool('위로').disabled).toBe(true)
    expect(tool('들여쓰기').disabled).toBe(true)

    fireEvent.keyDown(keyTarget(), { key: 'ArrowUp', altKey: true })
    fireEvent.keyDown(keyTarget(), { key: 'ArrowRight', altKey: true, shiftKey: true })

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(api.updateMenu).not.toHaveBeenCalled()
  })

  it('입력이 열려 있는 동안에는 단축키가 걸리지 않는다', async () => {
    // **제목에 `Backspace`를 치는 것이 삭제가 되면 안 된다.** `structure-tree.tsx`는 상자에
    // 핸들러를 붙이는데 그쪽에는 인라인 입력이 없다 — 여기서는 그 방법만으로는 입력에서 친
    // 키가 버블되어 상자로 온다(재 봤다). 그래서 열려 있는 동안 아예 지나가게 한다.
    const api = await open()

    fireEvent.click(menuButton('권한'))
    fireEvent.click(tool('이름 변경'))
    const box = within(toolbar()).getByRole('textbox', { name: '이름' })

    fireEvent.keyDown(box, { key: 'Backspace' })
    fireEvent.keyDown(box, { key: 'Delete' })
    fireEvent.keyDown(box, { key: 'ArrowUp', altKey: true })

    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(api.deleteMenu).not.toHaveBeenCalled()
    expect(api.updateMenu).not.toHaveBeenCalled()
    // 확인도 걸리지 않았다.
    expect(within(toolbar()).queryByRole('button', { name: '정말 삭제합니까?' })).toBeNull()
  })

  it('busy인 동안 단축키가 걸리지 않는다', async () => {
    // D2 — 잠금은 `ref`이고 단축키는 버튼을 지나지 않는다.
    const gate: { release: (() => void) | null } = { release: null }
    const api = await open({
      updateMenu: vi.fn(
        () =>
          new Promise<MenuNode>((resolve) => {
            gate.release = () => resolve({ id: 'm-grade', projectId: 'p-1', parentId: null, title: 'x', sortOrder: 0 })
          }),
      ),
    })

    fireEvent.click(menuButton('등급'))
    fireEvent.keyDown(keyTarget(), { key: 'ArrowUp', altKey: true })
    await waitFor(() => expect(api.updateMenu).toHaveBeenCalledTimes(1))

    // 아직 응답이 오지 않았는데 또 누른다.
    fireEvent.keyDown(keyTarget(), { key: 'ArrowDown', altKey: true })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(api.updateMenu).toHaveBeenCalledTimes(1)

    gate.release?.()
    await waitFor(() => expect(api.getTree).toHaveBeenCalledTimes(2))
  })

  it('busy인 동안 Delete가 삭제 확인을 걸지 않는다', async () => {
    // **D7의 두 번 누르기가 사실상 한 번이 되는 자리다.** 잠금 중에 확인이 걸리면 그 확인이
    // **잠금이 풀린 뒤까지 살아남아** 클릭 한 번에 삭제가 나간다(재현했다: `deleteMenu` 1회).
    // undo가 없으므로 복구 불가다.
    //
    // `askRemove`만 `run`을 지나지 않아 가드가 없었다 — `openInput`·`openReparent`는 갖고
    // 있었다. "여는" 셋이 같은 가드를 갖는 것이 D2의 잠금이다.
    const gate: { release: (() => void) | null } = { release: null }
    const api = await open({
      updateMenu: vi.fn(
        () =>
          new Promise<MenuNode>((resolve) => {
            gate.release = () => resolve({ id: 'm-grade', projectId: 'p-1', parentId: null, title: 'x', sortOrder: 0 })
          }),
      ),
    })

    // 조작 하나를 붙잡아 둔다.
    fireEvent.click(menuButton('등급'))
    fireEvent.keyDown(keyTarget(), { key: 'ArrowUp', altKey: true })
    await waitFor(() => expect(api.updateMenu).toHaveBeenCalledTimes(1))

    // **잠금 중 Delete** — 확인이 걸리면 안 된다.
    fireEvent.keyDown(keyTarget(), { key: 'Delete' })
    expect(within(toolbar()).queryByRole('button', { name: '정말 삭제합니까?' })).toBeNull()

    // 잠금이 풀린 뒤에도 살아남은 확인이 없어야 한다 — 클릭 한 번에 지워지지 않는다.
    gate.release?.()
    await waitFor(() => expect(api.getTree).toHaveBeenCalledTimes(2))
    expect(within(toolbar()).queryByRole('button', { name: '정말 삭제합니까?' })).toBeNull()
    expect(api.deleteMenu).not.toHaveBeenCalled()

    // 잠금이 풀렸으니 이제는 걸린다 — 영구 차단이 아니다.
    fireEvent.keyDown(keyTarget(), { key: 'Delete' })
    expect(within(toolbar()).getByRole('button', { name: '정말 삭제합니까?' })).toBeDefined()
  })

  it('단축키와 버튼이 같은 요청을 만든다', async () => {
    // 두 경로가 같은 함수를 부르는 것이 계약이다 — 각자 구현을 가지면 한쪽만 고쳐지는
    // 자리가 생긴다(`structure-keyboard.test.tsx`의 같은 이름 케이스가 선례다).
    const byKey = await open()
    fireEvent.click(menuButton('등급'))
    fireEvent.keyDown(keyTarget(), { key: 'ArrowDown', altKey: true })
    await waitFor(() => expect(byKey.updateMenu).toHaveBeenCalledTimes(1))
    const fromKey = byKey.updateMenu.mock.calls[0]
    screen.getByRole('heading', { name: '설계서' }).ownerDocument.body.replaceChildren()

    const byButton = await open()
    fireEvent.click(menuButton('등급'))
    fireEvent.click(tool('아래로'))
    await waitFor(() => expect(byButton.updateMenu).toHaveBeenCalledTimes(1))

    expect(byButton.updateMenu.mock.calls[0]).toEqual(fromKey)
  })

  it('Tab은 빼앗지 않는다', async () => {
    // 그러면 키보드 사용자가 트리를 빠져나갈 수 없다(계획서 Task 8 케이스 4와 같은 근거).
    const api = await open()

    fireEvent.click(menuButton('등급'))
    const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    keyTarget().dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
    expect(api.updateMenu).not.toHaveBeenCalled()
  })
})

describe('통합', () => {
  it('만들기 → 이름 변경 → 옮기기 → 삭제를 이어서 한다', async () => {
    const api = await open()

    // 만들기
    fireEvent.click(menuButton('회원관리'))
    fireEvent.click(tool('하위 메뉴'))
    const input = within(toolbar()).getByRole('textbox', { name: '이름' })
    fireEvent.change(input, { target: { value: '새 메뉴' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(api.createMenu).toHaveBeenCalledTimes(1))

    // 이름 변경
    fireEvent.click(menuButton('등급'))
    fireEvent.click(tool('이름 변경'))
    const rename = within(toolbar()).getByRole('textbox', { name: '이름' })
    fireEvent.change(rename, { target: { value: '등급 정책' } })
    fireEvent.keyDown(rename, { key: 'Enter' })
    await waitFor(() => expect(api.updateMenu).toHaveBeenCalledTimes(1))
    expect(api.updateMenu).toHaveBeenCalledWith('p-1', 'm-grade', { title: '등급 정책' })

    // 옮기기(순서)
    fireEvent.click(tool('위로'))
    await waitFor(() => expect(api.updateMenu).toHaveBeenCalledTimes(2))

    // 삭제
    fireEvent.click(menuButton('권한'))
    fireEvent.click(tool('삭제'))
    fireEvent.click(within(toolbar()).getByRole('button', { name: '정말 삭제합니까?' }))
    await waitFor(() => expect(api.deleteMenu).toHaveBeenCalledTimes(1))

    // 네 조작이 각각 재조회를 냈다 — 초기 1 + 4.
    await waitFor(() => expect(api.getTree).toHaveBeenCalledTimes(5))
  })

  it('구조 편집과 섞어도 서로를 방해하지 않는다', async () => {
    // **두 경로가 독립인지 재는 자리다.** 메뉴 CRUD는 `useTreeCommands`의 `inFlight`를,
    // 구조 편집은 스토어의 `#pumping`을 본다 — 공유 상태가 없다(소스로 확인했고 여기서
    // 실제로 섞어서 잰다).
    const gate: { release: (() => void) | null } = { release: null }
    const api = await open(
      {
        updateMenu: vi.fn(
          () =>
            new Promise<MenuNode>((resolve) => {
              gate.release = () => resolve({ id: 'm-grade', projectId: 'p-1', parentId: null, title: 'x', sortOrder: 0 })
            }),
        ),
      },
      '/projects/p-1/pages/pg-list',
    )

    // 메뉴 조작을 붙잡아 둔다.
    fireEvent.click(menuButton('등급'))
    fireEvent.click(tool('위로'))
    await waitFor(() => expect(api.updateMenu).toHaveBeenCalledTimes(1))
    // 메뉴 툴바는 잠겼다.
    expect(tool('아래로').disabled).toBe(true)

    // **그동안 구조 편집 쪽은 살아 있다** — 같은 화면의 다른 region이다.
    const structure = screen.getByRole('region', { name: '구조 트리' })
    expect(within(structure).getByRole('group', { name: '구조 편집' })).toBeDefined()

    gate.release?.()
    await waitFor(() => expect(tool('아래로').disabled).toBe(false))
  })
})
