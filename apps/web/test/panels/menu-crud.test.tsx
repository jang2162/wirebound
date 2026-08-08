/**
 * 메뉴·페이지 만들기·이름 변경·삭제(P2b-4 Task 4~6).
 *
 * **`<App />`을 라우트째 렌더한다**(`menu-tree.test.tsx` 머리말과 같은 근거). 툴바만 떼어
 * 내면 "고른 것이 트리를 지나는지", "성공 뒤 트리를 다시 받는지", "주소가 옮겨지는지"를
 * 재지 못하는데 이 태스크들의 하중이 정확히 그 셋이다.
 *
 * **낙관 적용이 없다(D1).** 화면이 갱신되는 유일한 길이 재조회이므로, 거의 모든 케이스가
 * `getTree` 호출 수를 함께 센다 — 그 수가 곧 "수렴했는가"다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { MenuNode, PageDetail, ProjectDetail, SessionUser, TreeMenuNode } from '../../src/api/types'
import { App } from '../../src/app'
import { currentPath, fakeApi, renderWithProviders } from '../helpers'

const USER: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }
const PROJECT_NAME = '설계서'
const PROJECT: ProjectDetail = {
  id: 'p-1',
  name: PROJECT_NAME,
  slug: 'proj',
  description: null,
  role: 'owner',
}

/**
 * 트리 한 벌.
 *
 * ```
 * 회원관리 (m-member)   페이지 둘 + 자식 메뉴 하나 — 삭제가 막히는 자리
 * ├ 회원 목록 (pg-list)
 * ├ 회원 상세 (pg-detail)
 * └ 권한 (m-auth)       비었다 — 삭제가 열리는 자리
 * 주문관리 (m-order)     비었다
 * ```
 *
 * 호출마다 새로 만든다 — 구현이 응답 배열을 제자리에서 정렬해도 다음 케이스가 흔들리지 않는다.
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

function menuNode(id: string, title: string): MenuNode {
  return { id, projectId: 'p-1', parentId: 'm-member', title, sortOrder: 0 }
}

/** 스텁 묶음. 케이스가 호출 수와 인자를 직접 센다. */
function stubs(overrides: Partial<ApiClient> = {}) {
  const getTree = vi.fn(async () => tree())
  const createMenu = vi.fn(async () => menuNode('m-new', '새 메뉴'))
  const createPage = vi.fn(async () => pageDetail('pg-new', '새 페이지'))
  const updateMenu = vi.fn(async () => menuNode('m-member', '바뀐 이름'))
  const updatePage = vi.fn(async () => pageDetail('pg-list', '바뀐 이름'))
  const deleteMenu = vi.fn(async () => undefined)
  const deletePage = vi.fn(async () => undefined)

  const client = fakeApi({
    me: async () => USER,
    getProject: async () => PROJECT,
    getPage: async (_projectId, pageId) => pageDetail(pageId, `페이지 ${pageId}`),
    listMyRevisions: async () => [],
    getTree,
    createMenu,
    createPage,
    updateMenu,
    updatePage,
    deleteMenu,
    deletePage,
    ...overrides,
  })

  return { client, getTree, createMenu, createPage, updateMenu, updatePage, deleteMenu, deletePage }
}

/** 셸과 트리가 **둘 다 성공 대역으로** 그려질 때까지 기다린다. */
async function open(
  overrides: Partial<ApiClient> = {},
  route = '/projects/p-1',
): Promise<ReturnType<typeof stubs>> {
  const harness = stubs(overrides)
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

/** 인라인 입력. 용도가 셋이지만 라벨은 하나다(D6). */
function input(): HTMLInputElement {
  return within(toolbar()).getByRole('textbox', { name: '이름' }) as HTMLInputElement
}

/** 값을 넣고 Enter. `fireEvent`만 쓰는 이 저장소의 관례를 따른다. */
function typeAndEnter(value: string): void {
  const box = input()
  fireEvent.change(box, { target: { value } })
  fireEvent.keyDown(box, { key: 'Enter' })
}

describe('메뉴·페이지 만들기', () => {
  it('하위 메뉴를 만들면 고른 메뉴 아래로 들어가고 트리를 다시 받는다', async () => {
    const api = await open()

    fireEvent.click(menuButton('회원관리'))
    fireEvent.click(tool('하위 메뉴'))

    // **포커스가 입력으로 간다.** 누른 뒤 손이 키보드에 있는데 커서가 딴 데 있으면
    // 사용자가 한 번 더 눌러야 한다.
    expect(document.activeElement).toBe(input())

    typeAndEnter('사용자')

    await waitFor(() => expect(api.createMenu).toHaveBeenCalledTimes(1))
    expect(api.createMenu).toHaveBeenCalledWith('p-1', { parentId: 'm-member', title: '사용자' })
    // **재조회가 수렴이다(D1)** — 낙관 적용이 없으므로 이것이 화면이 갱신되는 유일한 길이다.
    await waitFor(() => expect(api.getTree).toHaveBeenCalledTimes(2))
  })

  it('확정하면 입력이 닫힌다', async () => {
    const api = await open()

    fireEvent.click(menuButton('회원관리'))
    fireEvent.click(tool('하위 메뉴'))
    typeAndEnter('사용자')

    await waitFor(() => expect(api.createMenu).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(within(toolbar()).queryByRole('textbox', { name: '이름' })).toBeNull(),
    )
  })

  it('Esc는 취소다', async () => {
    const api = await open()

    fireEvent.click(menuButton('회원관리'))
    fireEvent.click(tool('하위 메뉴'))
    fireEvent.change(input(), { target: { value: '사용자' } })
    fireEvent.keyDown(input(), { key: 'Escape' })

    expect(within(toolbar()).queryByRole('textbox', { name: '이름' })).toBeNull()
    expect(api.createMenu).not.toHaveBeenCalled()
  })

  it('blur는 취소다', async () => {
    // **P2b-2의 속성 편집과 다른 점이다**(D6). 그쪽은 blur에도 커밋했지만 undo가 받쳐
    // 줬다. 여기는 undo가 없어 "취소하려고 다른 곳을 눌렀는데 만들어졌다"가 복구 불가다.
    const api = await open()

    fireEvent.click(menuButton('회원관리'))
    fireEvent.click(tool('하위 메뉴'))
    fireEvent.change(input(), { target: { value: '사용자' } })
    fireEvent.blur(input())

    expect(within(toolbar()).queryByRole('textbox', { name: '이름' })).toBeNull()
    expect(api.createMenu).not.toHaveBeenCalled()
  })

  it('빈 문자열로 Enter를 누르면 나가지 않고 입력이 열린 채다', async () => {
    // 서버의 `Title`이 `z.string().min(1)`이라 400이 되는데 그 왕복을 만들지 않는다(D6).
    const api = await open()

    fireEvent.click(menuButton('회원관리'))
    fireEvent.click(tool('하위 메뉴'))
    typeAndEnter('')

    expect(api.createMenu).not.toHaveBeenCalled()
    // **닫지 않는 것이 요점이다** — 닫으면 사용자가 무엇이 잘못됐는지 모른 채 입력을 잃는다.
    expect(input()).toBeDefined()
  })

  it('페이지 추가는 createPage를 내고 만든 페이지로 이동한다', async () => {
    // D8 — 응답의 `id`가 주소에 들어간다. 빈 문자열은 `SHAPES.pageDetail`이 이미 막는다.
    const api = await open()

    fireEvent.click(menuButton('회원관리'))
    fireEvent.click(tool('페이지 추가'))
    typeAndEnter('신규')

    await waitFor(() => expect(api.createPage).toHaveBeenCalledTimes(1))
    expect(api.createPage).toHaveBeenCalledWith('p-1', { menuNodeId: 'm-member', title: '신규' })
    await waitFor(() => expect(currentPath()).toBe('/projects/p-1/pages/pg-new'))
  })

  it('실패하면 서버 문장이 트리 안에 남고 트리를 다시 받지 않는다', async () => {
    const api = await open({
      createMenu: vi.fn(async () => {
        throw new ApiError(409, 'conflict', '이미 있는 이름입니다')
      }),
    })

    fireEvent.click(menuButton('회원관리'))
    fireEvent.click(tool('하위 메뉴'))
    typeAndEnter('사용자')

    await within(treeRegion()).findByText('이미 있는 이름입니다')
    // 서버가 거절했다는 것은 트리가 그대로라는 뜻이다 — 재조회하면 방금 본 실패가 덮인다.
    expect(api.getTree).toHaveBeenCalledTimes(1)
  })

  it('요청이 나가 있는 동안 툴바가 전부 비활성이다', async () => {
    // D2 — 큐가 아니라 잠금이다. 막아야 하는 것은 같은 버튼 연타와 "재조회 중에 또 조작"이다.
    const gate: { release: (() => void) | null } = { release: null }
    const api = await open({
      createMenu: vi.fn(
        () =>
          new Promise<MenuNode>((resolve) => {
            gate.release = () => resolve(menuNode('m-new', '새 메뉴'))
          }),
      ),
    })

    fireEvent.click(menuButton('회원관리'))
    fireEvent.click(tool('하위 메뉴'))
    typeAndEnter('사용자')

    await waitFor(() => expect(tool('하위 메뉴').disabled).toBe(true))
    expect(tool('이름 변경').disabled).toBe(true)
    expect(tool('삭제').disabled).toBe(true)

    gate.release?.()
    await waitFor(() => expect(api.getTree).toHaveBeenCalledTimes(2))
    // 끝나면 다시 살아난다 — 잠금이지 영구 비활성이 아니다.
    await waitFor(() => expect(tool('하위 메뉴').disabled).toBe(false))
  })

  it('페이지를 선택한 상태에서는 하위 메뉴·페이지 추가가 비활성이다', async () => {
    // D5 — 페이지는 컨테이너가 아니다.
    await open({}, '/projects/p-1/pages/pg-list')

    expect(tool('하위 메뉴').disabled).toBe(true)
    expect(tool('페이지 추가').disabled).toBe(true)
  })
})

describe('이름 변경', () => {
  it('지금 제목이 입력에 들어 있다', async () => {
    // 새로 만들기와 다른 점이다 — 바꾸려는 것을 지우고 다시 치게 하면 안 된다.
    await open()

    fireEvent.click(menuButton('회원관리'))
    fireEvent.click(tool('이름 변경'))

    expect(input().value).toBe('회원관리')
  })

  it('메뉴를 고르면 updateMenu가 제목만 싣고 나간다', async () => {
    // **다른 키가 본문에 없다**(웨이브 1의 `updateBody` 계약). `parentId`나 `sortOrder`가
    // 섞여 나가면 사용자가 건드리지 않은 값을 덮어쓴다.
    const api = await open()

    fireEvent.click(menuButton('회원관리'))
    fireEvent.click(tool('이름 변경'))
    typeAndEnter('회원')

    await waitFor(() => expect(api.updateMenu).toHaveBeenCalledTimes(1))
    expect(api.updateMenu).toHaveBeenCalledWith('p-1', 'm-member', { title: '회원' })
    expect(api.updatePage).not.toHaveBeenCalled()
    await waitFor(() => expect(api.getTree).toHaveBeenCalledTimes(2))
  })

  it('페이지를 고르면 updatePage가 나간다', async () => {
    const api = await open({}, '/projects/p-1/pages/pg-list')

    fireEvent.click(tool('이름 변경'))
    typeAndEnter('목록')

    await waitFor(() => expect(api.updatePage).toHaveBeenCalledTimes(1))
    expect(api.updatePage).toHaveBeenCalledWith('p-1', 'pg-list', { title: '목록' })
    expect(api.updateMenu).not.toHaveBeenCalled()
  })

  it('열린 페이지의 제목이 입력에 들어 있다', async () => {
    // 선택이 주소에서 온 경우다(D3) — 그때도 초기값을 찾아야 한다.
    await open({}, '/projects/p-1/pages/pg-list')

    fireEvent.click(tool('이름 변경'))

    expect(input().value).toBe('회원 목록')
  })

  it('Esc는 취소다', async () => {
    const api = await open()

    fireEvent.click(menuButton('회원관리'))
    fireEvent.click(tool('이름 변경'))
    fireEvent.keyDown(input(), { key: 'Escape' })

    expect(within(toolbar()).queryByRole('textbox', { name: '이름' })).toBeNull()
    expect(api.updateMenu).not.toHaveBeenCalled()
  })

  it('바꾸지 않고 Enter를 눌러도 요청이 나간다', async () => {
    // **값이 같은지 비교하지 않는다.** 비교를 넣으면 "공백만 다른 제목"에서 갈리는데,
    // 서버가 제목을 정규화하지 않는다는 것을 쟀다(`menu-toolbar.tsx`의 이름 변경 주석).
    // 즉 `' 회원관리'`와 `'회원관리'`는 서버에서 다른 값이고, 클라이언트가 같다고 판정해
    // 막으면 사용자가 그 공백을 지울 방법이 없어진다.
    const api = await open()

    fireEvent.click(menuButton('회원관리'))
    fireEvent.click(tool('이름 변경'))
    typeAndEnter('회원관리')

    await waitFor(() => expect(api.updateMenu).toHaveBeenCalledTimes(1))
    expect(api.updateMenu).toHaveBeenCalledWith('p-1', 'm-member', { title: '회원관리' })
  })

  it('빈 문자열이면 나가지 않는다', async () => {
    // 만들기와 같은 규칙이다(D6) — 서버의 `Title`이 `z.string().min(1)`이다.
    const api = await open()

    fireEvent.click(menuButton('회원관리'))
    fireEvent.click(tool('이름 변경'))
    typeAndEnter('')

    expect(api.updateMenu).not.toHaveBeenCalled()
    expect(input()).toBeDefined()
  })

  it('실패하면 이유가 남고 트리를 다시 받지 않는다', async () => {
    const api = await open({
      updateMenu: vi.fn(async () => {
        throw new ApiError(403, 'forbidden', '편집 권한이 없습니다')
      }),
    })

    fireEvent.click(menuButton('회원관리'))
    fireEvent.click(tool('이름 변경'))
    typeAndEnter('회원')

    await within(treeRegion()).findByText('편집 권한이 없습니다')
    expect(api.getTree).toHaveBeenCalledTimes(1)
  })
})

describe('삭제', () => {
  /** 확인이 걸린 삭제 버튼. 이름이 바뀌므로 조회도 바뀐다(D7). */
  function confirmButton(): HTMLButtonElement {
    return within(toolbar()).getByRole('button', { name: '정말 삭제합니까?' }) as HTMLButtonElement
  }

  it('한 번 누르면 요청이 나가지 않고 버튼 이름이 바뀐다', async () => {
    // **모달을 쓰지 않는 근거(D7):** 확인이 같은 버튼 안에서 끝나므로 포커스가 움직이지
    // 않는다. 앱에 모달 선례가 0건이라 포커스 가두기·Esc·반환 포커스를 이 단계가 처음부터
    // 만들게 되는데, 그것을 재는 케이스가 이 단계의 나머지보다 커진다.
    const api = await open()

    fireEvent.click(menuButton('권한'))
    fireEvent.click(tool('삭제'))

    expect(api.deleteMenu).not.toHaveBeenCalled()
    expect(confirmButton()).toBeDefined()
    expect(within(toolbar()).queryByRole('button', { name: '삭제' })).toBeNull()
  })

  it('한 번 더 누르면 나간다', async () => {
    const api = await open()

    fireEvent.click(menuButton('권한'))
    fireEvent.click(tool('삭제'))
    fireEvent.click(confirmButton())

    await waitFor(() => expect(api.deleteMenu).toHaveBeenCalledTimes(1))
    expect(api.deleteMenu).toHaveBeenCalledWith('p-1', 'm-auth')
    await waitFor(() => expect(api.getTree).toHaveBeenCalledTimes(2))
  })

  it('Esc로 확인이 풀린다', async () => {
    const api = await open()

    fireEvent.click(menuButton('권한'))
    fireEvent.click(tool('삭제'))
    fireEvent.keyDown(confirmButton(), { key: 'Escape' })

    expect(tool('삭제')).toBeDefined()
    expect(api.deleteMenu).not.toHaveBeenCalled()
  })

  it('선택을 바꾸면 확인이 풀린다', async () => {
    // 다른 항목에 대고 두 번째 클릭이 되는 것을 막는다 — 그러면 사용자가 확인한 것과
    // 지워지는 것이 달라진다.
    const api = await open()

    fireEvent.click(menuButton('권한'))
    fireEvent.click(tool('삭제'))
    fireEvent.click(menuButton('주문관리'))

    expect(tool('삭제')).toBeDefined()
    expect(api.deleteMenu).not.toHaveBeenCalled()
  })

  it('다른 조작을 시작하면 확인이 풀린다', async () => {
    const api = await open()

    fireEvent.click(menuButton('권한'))
    fireEvent.click(tool('삭제'))
    fireEvent.click(tool('이름 변경'))

    expect(tool('삭제')).toBeDefined()
    expect(api.deleteMenu).not.toHaveBeenCalled()
  })

  it('메뉴를 지우면 선택이 부모 메뉴로 간다', async () => {
    // 지운 것을 계속 가리키면 툴바가 사라진 항목에 작동하는 상태가 된다.
    const api = await open()

    fireEvent.click(menuButton('권한'))
    fireEvent.click(tool('삭제'))
    fireEvent.click(confirmButton())

    await waitFor(() => expect(api.deleteMenu).toHaveBeenCalledTimes(1))
    // 부모(`회원관리`)가 눌린 것으로 표시된다.
    await waitFor(() => {
      const pressed = treeRegion().querySelectorAll<HTMLElement>('[aria-pressed="true"]')
      expect([...pressed].map((row) => row.textContent)).toEqual(['회원관리'])
    })
  })

  it('루트 메뉴를 지우면 선택이 비워진다', async () => {
    const api = await open()

    fireEvent.click(menuButton('주문관리'))
    fireEvent.click(tool('삭제'))
    fireEvent.click(confirmButton())

    await waitFor(() => expect(api.deleteMenu).toHaveBeenCalledTimes(1))
    await waitFor(() => {
      const pressed = treeRegion().querySelectorAll<HTMLElement>('[aria-pressed="true"]')
      expect([...pressed]).toHaveLength(0)
    })
  })

  it('연 페이지를 지우면 프로젝트 루트로 간다', async () => {
    // D8 — `replace`인 것은 뒤로 가기가 지워진 페이지로 돌아가면 404를 만나기 때문이다.
    const api = await open({}, '/projects/p-1/pages/pg-list')

    fireEvent.click(tool('삭제'))
    fireEvent.click(confirmButton())

    await waitFor(() => expect(api.deletePage).toHaveBeenCalledTimes(1))
    expect(api.deletePage).toHaveBeenCalledWith('p-1', 'pg-list')
    await waitFor(() => expect(currentPath()).toBe('/projects/p-1'))
  })

  it('열지 않은 페이지를 지우면 주소가 그대로다', async () => {
    const api = await open({}, '/projects/p-1/pages/pg-detail')

    // 열려 있는 것은 `pg-detail`인데 트리에서 `회원 목록`을 골라 지운다.
    fireEvent.click(within(treeRegion()).getByRole('link', { name: '회원 목록' }))
    await waitFor(() => expect(currentPath()).toBe('/projects/p-1/pages/pg-list'))
    // 다시 `pg-detail`로 돌아가 그것을 연 채로 `회원 목록`을 고른다 — 주소와 선택을 가른다.
    fireEvent.click(within(treeRegion()).getByRole('link', { name: '회원 상세' }))
    await waitFor(() => expect(currentPath()).toBe('/projects/p-1/pages/pg-detail'))

    fireEvent.click(tool('삭제'))
    fireEvent.click(confirmButton())

    await waitFor(() => expect(api.deletePage).toHaveBeenCalledTimes(1))
    expect(api.deletePage).toHaveBeenCalledWith('p-1', 'pg-detail')
    // 연 페이지를 지웠으니 루트로 간다.
    await waitFor(() => expect(currentPath()).toBe('/projects/p-1'))
  })

  it('409를 받으면 그 문장이 남는다', async () => {
    const api = await open({
      deleteMenu: vi.fn(async () => {
        throw new ApiError(409, 'conflict', '하위 메뉴나 페이지가 있어 삭제할 수 없습니다')
      }),
    })

    fireEvent.click(menuButton('권한'))
    fireEvent.click(tool('삭제'))
    fireEvent.click(confirmButton())

    await within(treeRegion()).findByText('하위 메뉴나 페이지가 있어 삭제할 수 없습니다')
    expect(api.getTree).toHaveBeenCalledTimes(1)
  })

  it('자식이 있는 메뉴는 삭제가 비활성이다', async () => {
    // D5의 판정이 화면에 닿는 자리다. 서버도 409로 막지만(웨이브 1 실측: 자식 메뉴만·
    // 페이지만·둘 다 전부 409), 눌러 봐야 실패할 버튼을 활성으로 두지 않는다.
    await open()

    fireEvent.click(menuButton('회원관리'))

    expect(tool('삭제').disabled).toBe(true)
  })
})
