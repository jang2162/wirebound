/**
 * 메뉴·페이지의 자리 옮기기(P2b-4 Task 7~9) — 위/아래·들여/내어쓰기·소속 메뉴 고르기.
 *
 * **`<App />`을 라우트째 렌더한다**(`menu-crud.test.tsx`와 같은 근거). 나가는 본문이 이
 * 태스크들의 하중이므로 거의 모든 케이스가 `updateMenu`/`updatePage`의 인자를 직접 센다.
 *
 * **목적지 계산의 근거는 잰 값이다(계획서 "계획이 재지 않은 것" #1·#2·#5).** api 하네스로
 * 재고 그 값을 `tree/use-tree-commands.tsx`의 이동 함수 주석에 옮겨 적었다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { MenuNode, PageDetail, ProjectDetail, SessionUser, TreeMenuNode } from '../../src/api/types'
import { App } from '../../src/app'
import { fakeApi, renderWithProviders } from '../helpers'

const USER: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }
const PROJECT_NAME = '설계서'
const PROJECT: ProjectDetail = { id: 'p-1', name: PROJECT_NAME, slug: 'proj', description: null, role: 'owner' }

/**
 * 트리 한 벌.
 *
 * ```
 * 회원관리 (m-member)  sortOrder 0
 * ├ 회원 목록 (pg-list)   0
 * ├ 회원 상세 (pg-detail) 1
 * ├ 회원 이력 (pg-log)    2
 * ├ 권한 (m-auth)         0   ← 자식 메뉴 셋
 * ├ 등급 (m-grade)        1
 * └ 이력 (m-hist)         2
 * 주문관리 (m-order)   sortOrder 1
 * ```
 *
 * **형제가 셋인 자리를 둘 만든 것은 "가운데"가 필요하기 때문이다** — 첫째·막내만으로는
 * 위/아래 둘 다 활성인 상태를 못 만든다.
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
        { id: 'pg-log', title: '회원 이력', sortOrder: 2 },
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

function menuNode(id: string): MenuNode {
  return { id, projectId: 'p-1', parentId: null, title: 'x', sortOrder: 0 }
}

function stubs(overrides: Partial<ApiClient> = {}, treeOf: () => TreeMenuNode[] = tree) {
  const getTree = vi.fn(async () => treeOf())
  const updateMenu = vi.fn(async () => menuNode('m-auth'))
  const updatePage = vi.fn(async () => pageDetail('pg-list', '회원 목록'))

  const client = fakeApi({
    me: async () => USER,
    getProject: async () => PROJECT,
    getPage: async (_p, pageId) => pageDetail(pageId, `페이지 ${pageId}`),
    listMyRevisions: async () => [],
    getTree,
    updateMenu,
    updatePage,
    ...overrides,
  })
  return { client, getTree, updateMenu, updatePage }
}

async function open(
  overrides: Partial<ApiClient> = {},
  route = '/projects/p-1',
  treeOf: () => TreeMenuNode[] = tree,
): Promise<ReturnType<typeof stubs>> {
  const harness = stubs(overrides, treeOf)
  renderWithProviders(<App />, { client: harness.client, route })
  await screen.findByRole('heading', { name: PROJECT_NAME })
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

describe('위/아래 순서 이동', () => {
  it('가운데 메뉴를 위로 올리면 앞자리 인덱스가 나간다', async () => {
    // **목적지가 `index - 1`인 것은 서버가 결과 배열 기준이기 때문이다** — `[A,B,C]`에서
    // A에 `sortOrder: 2`를 주면 `[B,C,A]`다(api 하네스 실측). 방향에 따라 보정이 갈리지 않는다.
    const api = await open()

    fireEvent.click(menuButton('등급'))
    fireEvent.click(tool('위로'))

    await waitFor(() => expect(api.updateMenu).toHaveBeenCalledTimes(1))
    expect(api.updateMenu).toHaveBeenCalledWith('p-1', 'm-grade', { sortOrder: 0 })
    await waitFor(() => expect(api.getTree).toHaveBeenCalledTimes(2))
  })

  it('가운데 메뉴를 아래로 내리면 뒷자리 인덱스가 나간다', async () => {
    const api = await open()

    fireEvent.click(menuButton('등급'))
    fireEvent.click(tool('아래로'))

    await waitFor(() => expect(api.updateMenu).toHaveBeenCalledTimes(1))
    expect(api.updateMenu).toHaveBeenCalledWith('p-1', 'm-grade', { sortOrder: 2 })
  })

  it('페이지의 위/아래는 updatePage를 부르고 소속 메뉴를 싣지 않는다', async () => {
    // **`menuNodeId`가 섞여 나가면 사용자가 옮기지 않은 소속까지 덮어쓴다.** 서버의
    // `UpdatePageBody`가 그 키를 받으므로 실수가 조용히 통과한다.
    const api = await open({}, '/projects/p-1/pages/pg-detail')

    fireEvent.click(tool('위로'))

    await waitFor(() => expect(api.updatePage).toHaveBeenCalledTimes(1))
    expect(api.updatePage).toHaveBeenCalledWith('p-1', 'pg-detail', { sortOrder: 0 })
    expect(api.updateMenu).not.toHaveBeenCalled()
  })

  it('첫째의 위로와 막내의 아래로가 비활성이다', async () => {
    await open()

    fireEvent.click(menuButton('권한'))
    expect(tool('위로').disabled).toBe(true)
    expect(tool('아래로').disabled).toBe(false)

    fireEvent.click(menuButton('이력'))
    expect(tool('위로').disabled).toBe(false)
    expect(tool('아래로').disabled).toBe(true)
  })

  it('선택은 그대로다', async () => {
    // id가 바뀌지 않으므로 저절로 따라간다 — 옮긴 뒤 사용자가 다시 골라야 하면 연속으로
    // 두 칸 옮길 수 없다.
    const api = await open()

    fireEvent.click(menuButton('등급'))
    fireEvent.click(tool('위로'))
    await waitFor(() => expect(api.getTree).toHaveBeenCalledTimes(2))

    const pressed = treeRegion().querySelectorAll<HTMLElement>('[aria-pressed="true"]')
    expect([...pressed].map((row) => row.textContent)).toEqual(['등급'])
  })

  it('sortOrder가 0부터 연속이 아닌 트리에서도 목적지가 맞는다', async () => {
    // **오프바이원 방벽이다.** 목적지는 `node.sortOrder ± 1`이 아니라 `treeSpot.index ± 1`이다 —
    // 연속은 서버가 지키는 불변식이지 이 화면이 지킬 수 있는 것이 아니다(웨이브 1이 잰 값).
    const sparse = (): TreeMenuNode[] => [
      {
        id: 'm-member',
        title: '회원관리',
        sortOrder: 0,
        pages: [],
        children: [
          { id: 'm-auth', title: '권한', sortOrder: 5, pages: [], children: [] },
          { id: 'm-grade', title: '등급', sortOrder: 40, pages: [], children: [] },
          { id: 'm-hist', title: '이력', sortOrder: 900, pages: [], children: [] },
        ],
      },
    ]
    const api = await open({}, '/projects/p-1', sparse)

    fireEvent.click(menuButton('등급'))
    fireEvent.click(tool('위로'))

    await waitFor(() => expect(api.updateMenu).toHaveBeenCalledTimes(1))
    // `sortOrder`를 그대로 썼다면 39가 나갔을 것이다.
    expect(api.updateMenu).toHaveBeenCalledWith('p-1', 'm-grade', { sortOrder: 0 })
  })

  it('실패하면 이유가 남고 트리를 다시 받지 않는다', async () => {
    const api = await open({
      updateMenu: vi.fn(async () => {
        throw new ApiError(403, 'forbidden', '편집 권한이 없습니다')
      }),
    })

    fireEvent.click(menuButton('등급'))
    fireEvent.click(tool('위로'))

    await within(treeRegion()).findByText('편집 권한이 없습니다')
    expect(api.getTree).toHaveBeenCalledTimes(1)
  })
})

describe('메뉴 들여쓰기·내어쓰기', () => {
  it('들여쓰기는 앞 형제 메뉴의 자식이 된다', async () => {
    // **`sortOrder`를 주지 않는다 — 잰 값이다**(계획서 재라 #2). `PATCH {parentId}`만 주면
    // 새 부모의 **맨 뒤**로 간다: `M1`(자식 둘)에 `M2`를 그렇게 옮기니
    // `자식1:0 자식2:1 M2:2`였다. 들여쓰기의 정의가 *"앞 형제의 마지막 자식"*이므로 그대로 맞다.
    const api = await open()

    fireEvent.click(menuButton('등급'))
    fireEvent.click(tool('들여쓰기'))

    await waitFor(() => expect(api.updateMenu).toHaveBeenCalledTimes(1))
    expect(api.updateMenu).toHaveBeenCalledWith('p-1', 'm-grade', { parentId: 'm-auth' })
    await waitFor(() => expect(api.getTree).toHaveBeenCalledTimes(2))
  })

  it('첫 형제는 들여쓰기가 비활성이다', async () => {
    await open()

    fireEvent.click(menuButton('권한'))

    expect(tool('들여쓰기').disabled).toBe(true)
  })

  it('내어쓰기는 부모의 다음 형제가 된다', async () => {
    // **여기는 `sortOrder`를 함께 준다.** `parentId`만 주면 맨 뒤로 가는데(위 실측) 내어쓰기의
    // 정의는 *"부모의 **다음** 형제"*라 자리를 지목해야 한다. 둘을 함께 주면 그 값이 **새
    // 부모의 형제 배열 기준**으로 삽입된다 — 잰 값이다: `M1`(자식 둘)에
    // `{parentId, sortOrder: 1}`을 주니 `자식1:0 M3:1 자식2:2`가 됐다.
    const api = await open()

    fireEvent.click(menuButton('등급'))
    fireEvent.click(tool('내어쓰기'))

    await waitFor(() => expect(api.updateMenu).toHaveBeenCalledTimes(1))
    // 부모(`회원관리`)는 루트 배열의 0번이므로 그 다음 자리는 1이다.
    expect(api.updateMenu).toHaveBeenCalledWith('p-1', 'm-grade', { parentId: null, sortOrder: 1 })
  })

  it('루트 메뉴는 내어쓰기가 비활성이다', async () => {
    await open()

    fireEvent.click(menuButton('주문관리'))

    expect(tool('내어쓰기').disabled).toBe(true)
  })

  it('두 층 아래에서 내어쓰면 조부모의 자식이 된다', async () => {
    // 부모가 루트가 아닌 경우 — `parentId`가 `null`이 아니라 조부모 id다.
    const deep = (): TreeMenuNode[] => [
      {
        id: 'm-member',
        title: '회원관리',
        sortOrder: 0,
        pages: [],
        children: [
          {
            id: 'm-auth',
            title: '권한',
            sortOrder: 0,
            pages: [],
            children: [{ id: 'm-role', title: '역할', sortOrder: 0, pages: [], children: [] }],
          },
          { id: 'm-grade', title: '등급', sortOrder: 1, pages: [], children: [] },
        ],
      },
    ]
    const api = await open({}, '/projects/p-1', deep)

    fireEvent.click(menuButton('역할'))
    fireEvent.click(tool('내어쓰기'))

    await waitFor(() => expect(api.updateMenu).toHaveBeenCalledTimes(1))
    // 부모(`권한`)는 `회원관리`의 0번 자식이므로 다음 자리는 1이다.
    expect(api.updateMenu).toHaveBeenCalledWith('p-1', 'm-role', { parentId: 'm-member', sortOrder: 1 })
  })

  it('페이지 선택에서는 둘 다 비활성이다', async () => {
    // D5 — 트리가 페이지를 먼저 그리므로 페이지의 앞 형제는 항상 페이지이고, 페이지는
    // 자식을 갖지 못한다.
    await open({}, '/projects/p-1/pages/pg-detail')

    expect(tool('들여쓰기').disabled).toBe(true)
    expect(tool('내어쓰기').disabled).toBe(true)
  })

  it('내어쓴 뒤 들여쓰면 제자리가 아니다', async () => {
    // **P2b-3에서 구조 트리가 같은 성질을 못박았고 여기서도 재서 확인했다.** 들여쓰기가
    // 언제나 앞 형제의 **마지막** 자식으로 가기 때문이다 — 원래 자리가 마지막이 아니었으면
    // 돌아오지 않는다.
    //
    // `등급`은 `권한`(0) 다음 1번이고 뒤에 `이력`(2)이 있다. 내어썼다가 다시 들여쓰면
    // `권한`의 **마지막** 자식이 되는데, 원래는 `권한`의 형제였다.
    const api = await open()

    fireEvent.click(menuButton('등급'))
    fireEvent.click(tool('내어쓰기'))
    await waitFor(() => expect(api.updateMenu).toHaveBeenCalledTimes(1))
    expect(api.updateMenu).toHaveBeenCalledWith('p-1', 'm-grade', { parentId: null, sortOrder: 1 })

    // 되돌리는 조작(들여쓰기)이 내는 본문은 그 역이 아니다 — 자리를 지목하지 않는다.
    fireEvent.click(tool('들여쓰기'))
    await waitFor(() => expect(api.updateMenu).toHaveBeenCalledTimes(2))
    // 되돌리는 조작의 본문에는 `sortOrder`가 없다 — 자리를 지목하지 않고 맨 뒤로 간다.
    expect(api.updateMenu).toHaveBeenLastCalledWith('p-1', 'm-grade', { parentId: 'm-auth' })
  })
})
