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
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import { ApiProvider } from '../../src/api/context'
import { useTreeCommands, type TreeCommands } from '../../src/tree/use-tree-commands'
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
    // 서버가 제목을 정규화하지 않는다는 것을 쟀다(`tree/use-tree-commands.tsx`의
    // `submitInput` 주석에 잰 값이 있다).
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

  it('버튼에 포커스가 있을 때 Esc로 확인이 풀린다', async () => {
    // **이름에 전제를 적어 둔다.** 핸들러가 그 버튼에 붙어 있으므로 키가 거기로 와야 한다.
    //
    // **`fireEvent.click`은 포커스를 옮기지 않는다 — 재 봤다.** 클릭 뒤
    // `document.activeElement`가 그 버튼이 아니고, 포커스를 밖에 둔 채 문서에 Escape를
    // 보내면 확인이 풀리지 않는다. 이 저장소는 `userEvent`를 0건 쓰므로 **"실제 클릭이 그
    // 버튼에 포커스를 준다"는 전제는 여기서 검증되지 않는다**(브라우저·OS에 따라 갈린다고
    // 알려져 있지만 그것도 잰 것이 아니다).
    //
    // 그래서 이 케이스가 지키는 것은 **"포커스가 그 버튼에 있으면 Esc가 확인을 푼다"**까지다.
    // 아래 `포커스가 버튼 밖이면 Esc가 닿지 않는다`가 그 반대편을 값으로 고정한다.
    const api = await open()

    fireEvent.click(menuButton('권한'))
    fireEvent.click(tool('삭제'))
    confirmButton().focus()
    fireEvent.keyDown(confirmButton(), { key: 'Escape' })

    expect(tool('삭제')).toBeDefined()
    expect(api.deleteMenu).not.toHaveBeenCalled()
  })

  it('포커스가 버튼 밖이면 Esc가 닿지 않는다', async () => {
    // **D7의 취소 조건 셋 중 Esc만 전제를 갖는다**(선택 변경·다른 조작은 갖지 않는다).
    // 그 전제가 깨지는 모습을 값으로 적어 둔다 — 전역 리스너로 옮기고 싶어지는 날, 무엇이
    // 달라지는지를 이 케이스가 말한다. 전역으로 두지 않은 근거는 그것이 다른 패널의 Esc까지
    // 가로채기 때문이다.
    await open()

    fireEvent.click(menuButton('권한'))
    fireEvent.click(tool('삭제'))
    fireEvent.keyDown(document.body, { key: 'Escape' })

    // 확인이 그대로 걸려 있다.
    expect(within(toolbar()).queryByRole('button', { name: '정말 삭제합니까?' })).not.toBeNull()
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

  it('페이지를 옮겨 다녀도 지워지는 것은 언제나 열려 있는 페이지다', async () => {
    // **D3의 귀결을 못박는 자리다.** 앞 판의 이 케이스는 이름이
    // `열지 않은 페이지를 지우면 주소가 그대로다`였는데 **본문은 열려 있던 페이지를
    // 지우고 있었다**(리뷰가 잡았다 — 이 프로젝트가 반복해 겪은 "산문과 케이스가
    // 어긋난다"의 테스트판이다).
    //
    // 그런 상태를 만들 수 없다는 것이 요점이다: 페이지 링크를 누르면 주소가 바뀌면서
    // `select(null)`이 함께 나가므로(D3) **선택된 페이지와 열린 페이지가 갈리지 않는다.**
    // 그래서 삭제에 `wasOpen` 조건이 없다.
    const api = await open({}, '/projects/p-1/pages/pg-list')

    // 여러 번 옮겨 다녀도 마지막에 연 것이 지워진다.
    fireEvent.click(within(treeRegion()).getByRole('link', { name: '회원 상세' }))
    await waitFor(() => expect(currentPath()).toBe('/projects/p-1/pages/pg-detail'))
    fireEvent.click(within(treeRegion()).getByRole('link', { name: '회원 목록' }))
    await waitFor(() => expect(currentPath()).toBe('/projects/p-1/pages/pg-list'))

    fireEvent.click(tool('삭제'))
    fireEvent.click(confirmButton())

    await waitFor(() => expect(api.deletePage).toHaveBeenCalledTimes(1))
    expect(api.deletePage).toHaveBeenCalledWith('p-1', 'pg-list')
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

/**
 * D2의 잠금이 **동기 재진입**을 막는가.
 *
 * **화면 버튼으로는 이 경로를 만들 수 없다** — `disabled`가 먼저 막고, 입력은 제출 즉시
 * 언마운트된다. 그래서 훅을 직접 태운다. 여기가 그 잠금의 **유일한** 하중이다: 다음
 * 웨이브의 키보드 단축키는 버튼을 지나지 않으므로(계획서 Task 10 케이스 4·6) 같은 tick에
 * 두 번 들어올 수 있다.
 */
describe('조작 잠금', () => {
  function Probe(props: { sink: { latest: TreeCommands | null }; pageId?: string }): ReactElement {
    props.sink.latest = useTreeCommands({ projectId: 'p-1', pageId: props.pageId })
    return <div />
  }

  /** 훅만 태운다. 화면이 없으므로 `disabled`가 덮지 못한다. */
  async function mountHook(
    overrides: Partial<ApiClient> = {},
    pageId?: string,
  ): Promise<{ sink: { latest: TreeCommands | null }; api: ReturnType<typeof stubs> }> {
    const api = stubs(overrides)
    const sink: { latest: TreeCommands | null } = { latest: null }
    render(
      <ApiProvider client={api.client}>
        <MemoryRouter initialEntries={['/projects/p-1']}>
          <Probe sink={sink} pageId={pageId} />
        </MemoryRouter>
      </ApiProvider>,
    )
    await waitFor(() => expect(sink.latest?.state.status).toBe('ready'))
    // **페이지를 열면 선택이 주소에서 온다**(D3) — 따로 고르지 않는다.
    if (pageId === undefined) {
      sink.latest?.select({ kind: 'menu', id: 'm-member' })
      await waitFor(() => expect(sink.latest?.selection?.id).toBe('m-member'))
    }
    return { sink, api }
  }

  it('같은 tick에 두 번 확정해도 요청은 한 번이다', async () => {
    // **`useState`로는 이것을 막지 못한다 — 재 봤다.** `run`이 매 렌더 새로 만들어지고
    // `busy`를 그 렌더 값으로 닫으므로, 같은 클로저의 두 번째 호출은 여전히 `false`를
    // 본다(`setBusy(true)`는 다음 렌더에야 보인다). 잠금이 `ref`여야 하는 이유다.
    const { sink, api } = await mountHook()

    sink.latest?.openInput('new-menu')
    await waitFor(() => expect(sink.latest?.editing).not.toBeNull())

    // 한 렌더의 객체를 붙잡고 연속 두 번.
    const held = sink.latest
    held?.submitInput('가')
    held?.submitInput('나')

    await waitFor(() => expect(api.createMenu).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(api.createMenu).toHaveBeenCalledTimes(1)
    expect(api.createMenu).toHaveBeenCalledWith('p-1', { parentId: 'm-member', title: '가' })
  })

  it('앞 요청이 끝나면 다음 조작이 다시 나간다', async () => {
    // 잠금이지 영구 차단이 아니다 — 이 케이스가 없으면 "아무것도 안 보낸다"도 위 케이스를
    // 통과한다.
    const { sink, api } = await mountHook()

    sink.latest?.openInput('new-menu')
    await waitFor(() => expect(sink.latest?.editing).not.toBeNull())
    sink.latest?.submitInput('가')
    await waitFor(() => expect(api.getTree).toHaveBeenCalledTimes(2))

    sink.latest?.openInput('new-menu')
    await waitFor(() => expect(sink.latest?.editing).not.toBeNull())
    sink.latest?.submitInput('나')

    await waitFor(() => expect(api.createMenu).toHaveBeenCalledTimes(2))
  })

  it('판정을 지나지 않고 불러도 범위 밖으로는 옮기지 않는다', async () => {
    // **화면·단축키는 둘 다 판정을 지나므로 오늘 이 자리에 닿지 않는다.** 훅 API로는 닿고,
    // 그때 `sortOrder: -1`이 나가면 서버가 400을 낸다(`SortOrder`가 `z.int().min(0)`).
    // `indent`·`outdent`는 목적지가 없을 때 되돌아오는데 `move`만 그 가드가 없었다.
    const { sink, api } = await mountHook()

    // `m-member`는 루트의 첫째이자 막내다(트리에 루트가 둘이지만 `m-order`가 뒤).
    sink.latest?.select({ kind: 'menu', id: 'm-member' })
    await waitFor(() => expect(sink.latest?.selection?.id).toBe('m-member'))
    expect(sink.latest?.abilities.moveUp).toBe(false)

    sink.latest?.move(-1)
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(api.updateMenu).not.toHaveBeenCalled()

    // 양성 대조: 뒤 형제가 있으므로 아래로는 나간다.
    sink.latest?.move(1)
    await waitFor(() => expect(api.updateMenu).toHaveBeenCalledTimes(1))
    expect(api.updateMenu).toHaveBeenCalledWith('p-1', 'm-member', { sortOrder: 1 })
  })

  it('조작이 나가 있는 동안에는 소속 메뉴 목록도 열리지 않는다', async () => {
    // **입력과 같은 가드다.** 화면에서는 툴바가 비활성이라 이 경로가 없지만 훅 API로는
    // 열리고, 그 상태에서 고르면 요청이 나가지 않은 채 목록만 닫힌다 — `openInput`과 같은
    // 손해다. 그 자리를 재는 케이스가 없어 **가드가 0 사망이었고**, 이 케이스가 그것을 닫는다.
    const gate: { release: (() => void) | null } = { release: null }
    const { sink } = await mountHook(
      {
        updatePage: vi.fn(
          () =>
            new Promise<PageDetail>((resolve) => {
              gate.release = () => resolve(pageDetail('pg-list', '회원 목록'))
            }),
        ),
      },
      'pg-list',
    )

    // 페이지를 고른 상태에서 이름 변경을 내 잠금을 세운다.
    sink.latest?.openInput('rename')
    await waitFor(() => expect(sink.latest?.editing).not.toBeNull())
    sink.latest?.submitInput('바꾼 이름')
    await waitFor(() => expect(sink.latest?.busy).toBe(true))

    sink.latest?.openReparent()
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(sink.latest?.reparenting).toBeNull()

    gate.release?.()
    await waitFor(() => expect(sink.latest?.busy).toBe(false))
    // 끝나면 다시 열린다.
    sink.latest?.openReparent()
    await waitFor(() => expect(sink.latest?.reparenting).not.toBeNull())
  })

  it('조작이 나가 있는 동안에는 입력이 열리지 않는다', async () => {
    // **화면에서는 툴바가 비활성이라 이 경로가 없다.** 훅 API로는 열리는데, 그때 친 제목이
    // **요청도 못 나가고 조용히 사라진다** — 앞 판은 그 상태를 입력의 `disabled`로 막으려
    // 했지만 그것으로는 "이미 친 제목이 사라지는 것"을 막지 못한다.
    //
    // 다음 웨이브의 키보드 단축키가 버튼을 지나지 않으므로(계획서 Task 10 케이스 6) 이
    // 자리가 그 방벽이다.
    const gate: { release: (() => void) | null } = { release: null }
    const { sink } = await mountHook({
      createMenu: vi.fn(
        () =>
          new Promise<MenuNode>((resolve) => {
            gate.release = () => resolve(menuNode('m-new', '새 메뉴'))
          }),
      ),
    })

    sink.latest?.openInput('new-menu')
    await waitFor(() => expect(sink.latest?.editing).not.toBeNull())
    sink.latest?.submitInput('가')
    await waitFor(() => expect(sink.latest?.busy).toBe(true))

    sink.latest?.openInput('new-menu')
    // **리렌더를 기다린 뒤에 본다.** 부른 직후 읽으면 아직 앞 렌더의 값이라, 열렸는지
    // 안 열렸는지가 구별되지 않는다.
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(sink.latest?.editing).toBeNull()

    gate.release?.()
    await waitFor(() => expect(sink.latest?.busy).toBe(false))
    // 끝나면 다시 열린다 — 잠금이지 영구 차단이 아니다.
    sink.latest?.openInput('new-menu')
    await waitFor(() => expect(sink.latest?.editing).not.toBeNull())
  })
})

describe('인라인 입력의 용도 전환', () => {
  it('용도를 바꾸면 앞 용도의 값이 남지 않는다', async () => {
    // **`TreeInput`의 `key={editing.kind}`가 지키는 것이다.** 같은 자리에 남겨 두면 React가
    // 인스턴스를 재사용해 `useState(props.initial)`의 초기값이 다시 걸리지 않는다.
    //
    // **리뷰는 이 케이스를 만들 수 없다고 봤다**(*"blur가 먼저 언마운트한다"*). 재 보니
    // 그렇지 않다 — `fireEvent.click`은 포커스를 옮기지 않으므로 `onBlur`가 나지 않고,
    // 입력이 그대로 있는 채로 용도만 바뀐다. `key`를 지우면 값이 `'가나'`로 남는다(실측).
    //
    // **그 갈림은 `fireEvent` 환경에서만 참이다.** blur를 손으로 심어 재니(실제 브라우저의
    // 클릭이 하는 일이다) 입력이 **먼저 언마운트되고**, 그 뒤 이름 변경을 열면 `key` 없이도
    // 값이 `'회원관리'`로 초기화된다 — 그 경로에서는 리뷰 말이 맞다. **실제 브라우저에서
    // 버튼 클릭이 포커스를 옮기는지는 재지 못했다**(`menu-toolbar.tsx`의 Esc 주석과 같은
    // 한계다). 그래서 이 케이스가 지키는 것은 **"blur 없이 용도가 바뀌는 경로에서 값이 남지
    // 않는다"**까지이고, 그 경로를 만드는 것이 다음 웨이브의 단축키다.
    await open()

    fireEvent.click(menuButton('회원관리'))
    fireEvent.click(tool('하위 메뉴'))
    fireEvent.change(input(), { target: { value: '가나' } })

    fireEvent.click(tool('이름 변경'))

    expect(input().value).toBe('회원관리')
  })
})
