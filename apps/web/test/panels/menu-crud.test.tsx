/**
 * 메뉴·페이지 만들기·이름 변경·삭제.
 *
 * **`<App />`을 라우트째 렌더한다**(`menu-tree.test.tsx` 머리말과 같은 근거). 툴바만 떼어
 * 내면 "고른 것이 트리를 지나는지", "성공 뒤 트리를 다시 받는지", "주소가 옮겨지는지"를
 * 재지 못하는데 이 기능들의 하중이 정확히 그 셋이다.
 *
 * **낙관 적용이 없다.** 화면이 갱신되는 유일한 길이 재조회이므로, 거의 모든 케이스가
 * `getTree` 호출 수를 함께 센다 — 그 수가 곧 "수렴했는가"다.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, useNavigate } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import { ApiProvider } from '../../src/api/context'
import { WRITE_DEADLINE_MS, WriteLedgerProvider } from '../../src/panels/write-ledger'
import { SessionProvider } from '../../src/session/session-context'
import { useTreeCommands, type TreeCommands } from '../../src/tree/use-tree-commands'
import type { MenuNode, PageDetail, ProjectView, SessionUser, TreeMenuNode } from '../../src/api/types'
import { App } from '../../src/app'
import { currentPath, fakeApi, renderWithProviders } from '../helpers'
import { isOff, queryRowAction, treeTool } from './tree-row'

const USER: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }
const PROJECT_NAME = '설계서'
const PROJECT: ProjectView = {
  id: 'p-1',
  name: PROJECT_NAME,
  slug: 'proj',
  description: null,
  role: 'owner',
  themeRev: 0,
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
  // 옛 «메뉴 편집» 툴바 자리 — 줄 행동 · 줄 아래 입력이 트리 영역 안에 선다(`./tree-row.ts`).
  return treeRegion()
}

function tool(name: string): HTMLElement {
  return treeTool(treeRegion(), name)
}

function menuButton(title: string): HTMLElement {
  return within(treeRegion()).getByRole('button', { name: title })
}

/** 인라인 입력. 용도가 셋이지만 라벨은 하나다. */
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
    // **재조회가 수렴이다** — 낙관 적용이 없으므로 이것이 화면이 갱신되는 유일한 길이다.
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
    // **속성 편집과 다른 점이다.** 그쪽은 blur에도 커밋하지만 undo가 받쳐
    // 준다. 여기는 undo가 없어 "취소하려고 다른 곳을 눌렀는데 만들어졌다"가 복구 불가다.
    const api = await open()

    fireEvent.click(menuButton('회원관리'))
    fireEvent.click(tool('하위 메뉴'))
    fireEvent.change(input(), { target: { value: '사용자' } })
    fireEvent.blur(input())

    expect(within(toolbar()).queryByRole('textbox', { name: '이름' })).toBeNull()
    expect(api.createMenu).not.toHaveBeenCalled()
  })

  it('빈 문자열로 Enter를 누르면 나가지 않고 입력이 열린 채다', async () => {
    // 서버의 `Title`이 `z.string().min(1)`이라 400이 되는데 그 왕복을 만들지 않는다.
    const api = await open()

    fireEvent.click(menuButton('회원관리'))
    fireEvent.click(tool('하위 메뉴'))
    typeAndEnter('')

    expect(api.createMenu).not.toHaveBeenCalled()
    // **닫지 않는 것이 요점이다** — 닫으면 사용자가 무엇이 잘못됐는지 모른 채 입력을 잃는다.
    expect(input()).toBeDefined()
  })

  it('페이지 추가는 createPage를 내고 만든 페이지로 이동한다', async () => {
    // 응답의 `id`가 주소에 들어간다. 빈 문자열은 `SHAPES.pageDetail`이 이미 막는다.
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
    // 큐가 아니라 잠금이다. 막아야 하는 것은 같은 버튼 연타와 "재조회 중에 또 조작"이다.
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

    await waitFor(() => expect(isOff(tool('하위 메뉴'))).toBe(true))
    expect(isOff(tool('이름 변경'))).toBe(true)
    expect(isOff(tool('삭제'))).toBe(true)

    gate.release?.()
    await waitFor(() => expect(api.getTree).toHaveBeenCalledTimes(2))
    // 끝나면 다시 살아난다 — 잠금이지 영구 비활성이 아니다.
    await waitFor(() => expect(isOff(tool('하위 메뉴'))).toBe(false))
  })

  it('페이지를 선택한 상태에서는 하위 메뉴·페이지 추가가 비활성이다', async () => {
    // 페이지는 컨테이너가 아니다.
    await open({}, '/projects/p-1/pages/pg-list')

    // 페이지 줄에는 `+`가 없다.
    expect(queryRowAction(treeRegion(), '하위 메뉴')).toBeNull()
    expect(queryRowAction(treeRegion(), '페이지 추가')).toBeNull()
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
    // **다른 키가 본문에 없다**(`updateBody` 계약). `parentId`나 `sortOrder`가
    // 섞여 나가면 사용자가 건드리지 않은 값을 덮어쓴다.
    const api = await open()

    fireEvent.click(menuButton('회원관리'))
    fireEvent.click(tool('이름 변경'))
    typeAndEnter('회원')

    await waitFor(() => expect(api.updateMenu).toHaveBeenCalledTimes(1))
    // **바탕도 실린다** — 메뉴도 페이지와 같다. 넷째는 장부의 끊는 신호다.
    expect(api.updateMenu).toHaveBeenCalledWith('p-1', 'm-member', { title: '회원', base: { title: '회원관리' } }, expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(api.updatePage).not.toHaveBeenCalled()
    await waitFor(() => expect(api.getTree).toHaveBeenCalledTimes(2))
  })

  it('페이지를 고르면 updatePage가 나간다', async () => {
    const api = await open({}, '/projects/p-1/pages/pg-list')

    fireEvent.click(tool('이름 변경'))
    typeAndEnter('목록')

    await waitFor(() => expect(api.updatePage).toHaveBeenCalledTimes(1))
    // **바탕도 실린다** — 입력이 열릴 때의 제목이다(판정 축은 서버의 `apps/api/test/page-meta-conflict.test.ts`).
    expect(api.updatePage).toHaveBeenCalledWith('p-1', 'pg-list', { title: '목록', base: { title: '회원 목록' } }, expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(api.updateMenu).not.toHaveBeenCalled()
  })

  it('열린 페이지의 제목이 입력에 들어 있다', async () => {
    // 선택이 주소에서 온 경우다 — 그때도 초기값을 찾아야 한다.
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
    // 서버는 제목을 정규화하지 않는다(`tree/use-tree-commands.tsx`의
    // `submitInput` 주석에 잰 값이 있다).
    // 즉 `' 회원관리'`와 `'회원관리'`는 서버에서 다른 값이고, 클라이언트가 같다고 판정해
    // 막으면 사용자가 그 공백을 지울 방법이 없어진다.
    const api = await open()

    fireEvent.click(menuButton('회원관리'))
    fireEvent.click(tool('이름 변경'))
    typeAndEnter('회원관리')

    await waitFor(() => expect(api.updateMenu).toHaveBeenCalledTimes(1))
    expect(api.updateMenu).toHaveBeenCalledWith('p-1', 'm-member', { title: '회원관리', base: { title: '회원관리' } }, expect.objectContaining({ signal: expect.any(AbortSignal) }))
  })

  it('빈 문자열이면 나가지 않는다', async () => {
    // 만들기와 같은 규칙이다 — 서버의 `Title`이 `z.string().min(1)`이다.
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
  /** 확인이 걸린 삭제 버튼. 이름이 바뀌므로 조회도 바뀐다. */
  function confirmButton(): HTMLButtonElement {
    return within(toolbar()).getByRole('button', { name: '정말 삭제합니까?' }) as HTMLButtonElement
  }

  it('한 번 누르면 요청이 나가지 않고 버튼 이름이 바뀐다', async () => {
    // **모달을 쓰지 않는 근거:** 확인이 같은 버튼 안에서 끝나므로 포커스가 움직이지
    // 않는다. 앱에 모달 선례가 없어 포커스 가두기·Esc·반환 포커스를 처음부터 만들어야
    // 하는데, 그것을 재는 케이스가 삭제 확인 자체보다 커진다.
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
    // **`fireEvent.click`은 포커스를 옮기지 않는다.** 클릭 뒤
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
    // **삭제 확인의 취소 조건 셋 중 Esc만 전제를 갖는다**(선택 변경·다른 조작은 갖지 않는다).
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
    // 이동이 `replace`인 것은 뒤로 가기가 지워진 페이지로 돌아가면 404를 만나기 때문이다.
    const api = await open({}, '/projects/p-1/pages/pg-list')

    fireEvent.click(tool('삭제'))
    fireEvent.click(confirmButton())

    await waitFor(() => expect(api.deletePage).toHaveBeenCalledTimes(1))
    expect(api.deletePage).toHaveBeenCalledWith('p-1', 'pg-list')
    await waitFor(() => expect(currentPath()).toBe('/projects/p-1'))
  })

  it('페이지를 옮겨 다녀도 지워지는 것은 언제나 열려 있는 페이지다', async () => {
    // **«페이지 선택은 주소에서 온다»의 귀결을 못박는 자리다.** 이 케이스를
    // *"열지 않은 페이지를 지우면 주소가 그대로다"*로 짓지 않는다 — 그런 상태를 만들 수
    // 없으므로 그 이름의 케이스는 본문이 열려 있던 페이지를 지우게 되어, 이름과 본문이
    // 어긋난다("산문과 케이스가 어긋난다"의 테스트판).
    //
    // 그런 상태를 만들 수 없다는 것이 요점이다: 페이지 링크를 누르면 주소가 바뀌면서
    // `select(null)`이 함께 나가므로 **선택된 페이지와 열린 페이지가 갈리지 않는다.**
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
    // «자식이 있는 메뉴는 지우지 않는다»는 판정이 화면에 닿는 자리다. 서버도 409로
    // 막지만(자식 메뉴만·페이지만·둘 다 전부 409 — `apps/api/test/menu.test.ts`의
    // `자식 있는 노드는 409`), 눌러 봐야 실패할 버튼을 활성으로 두지 않는다.
    await open()

    fireEvent.click(menuButton('회원관리'))

    expect(isOff(tool('삭제'))).toBe(true)
  })
})

/**
 * 조작 잠금이 **동기 재진입**을 막는가.
 *
 * **화면 버튼으로는 이 경로를 만들 수 없다** — `disabled`가 먼저 막고, 입력은 제출 즉시
 * 언마운트된다. 그래서 훅을 직접 태운다. 여기가 그 잠금의 **유일한** 하중이다: 키보드
 * 단축키는 버튼을 지나지 않으므로 같은 tick에 두 번 들어올 수 있다.
 */
describe('조작 잠금', () => {
  function Probe(props: { sink: { latest: TreeCommands | null }; pageId?: string }): ReactElement {
    // `reloadToken`은 이 블록의 대상이 아니다(잠금을 잰다) — 아무도 안 올리는 0으로 둔다.
    props.sink.latest = useTreeCommands({ projectId: 'p-1', pageId: props.pageId, reloadToken: 0 })
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
        {/* 이름 변경은 쓰기 장부를 탄다 — 장부는 세션 세대를 본다. */}
        <SessionProvider>
          <WriteLedgerProvider>
            <MemoryRouter initialEntries={['/projects/p-1']}>
              <Probe sink={sink} pageId={pageId} />
            </MemoryRouter>
          </WriteLedgerProvider>
        </SessionProvider>
      </ApiProvider>,
    )
    await waitFor(() => expect(sink.latest?.state.status).toBe('ready'))
    // **페이지를 열면 선택이 주소에서 온다** — 따로 고르지 않는다.
    if (pageId === undefined) {
      sink.latest?.select({ kind: 'menu', id: 'm-member' })
      await waitFor(() => expect(sink.latest?.selection?.id).toBe('m-member'))
    }
    return { sink, api }
  }

  it('같은 tick에 두 번 확정해도 요청은 한 번이다', async () => {
    // **`useState`로는 이것을 막지 못한다.** `run`이 매 렌더 새로 만들어지고
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
    // **화면·단축키는 둘 다 판정을 지나므로 이 자리에 닿지 않는다.** 훅 API로는 닿고,
    // 그때 `sortOrder: -1`이 나가면 서버가 400을 낸다(`SortOrder`가 `z.int().min(0)`).
    // `indent`·`outdent`처럼 `move`도 목적지가 없으면 되돌아온다 — 그 가드를 빼면 이 케이스가 죽는다.
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
    // 손해다. 이 케이스가 없으면 **그 가드를 빼도 아무것도 죽지 않는다.**
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
    // **요청도 못 나가고 조용히 사라진다** — 입력의 `disabled`로 막아서는 "이미 친 제목이
    // 사라지는 것"을 막지 못한다.
    //
    // 키보드 단축키가 버튼을 지나지 않으므로 이 자리가 그 방벽이다.
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
    // ***"blur가 먼저 언마운트하므로 이 케이스는 만들 수 없다"*는 것은 `fireEvent` 환경에서
    // 참이 아니다** — `fireEvent.click`은 포커스를 옮기지 않으므로 `onBlur`가 나지 않고,
    // 입력이 그대로 있는 채로 용도만 바뀐다. `key`를 지우면 값이 `'가나'`로 남는다(실측).
    //
    // **그 갈림은 `fireEvent` 환경에서만 참이다.** blur를 손으로 심어 재니(실제 브라우저의
    // 클릭이 하는 일이다) 입력이 **먼저 언마운트되고**, 그 뒤 이름 변경을 열면 `key` 없이도
    // 값이 `'회원관리'`로 초기화된다 — 그 경로에서는 그 말이 맞다. **실제 브라우저에서
    // 버튼 클릭이 포커스를 옮기는지는 재지 못했다**(`menu-toolbar.tsx`의 Esc 주석과 같은
    // 한계다). 그래서 이 케이스가 지키는 것은 **"blur 없이 용도가 바뀌는 경로에서 값이 남지
    // 않는다"**까지이고, 그 경로를 만드는 것이 키보드 단축키다.
    await open()

    fireEvent.click(menuButton('회원관리'))
    fireEvent.click(tool('하위 메뉴'))
    fireEvent.change(input(), { target: { value: '가나' } })

    fireEvent.click(tool('이름 변경'))

    expect(input().value).toBe('회원관리')
  })
})

/**
 * **트리 아래 상태줄**(`src/panels/toolbar-status.ts`). 구조 트리와 한 벌이고, 문안 표는
 * `./toolbar-status.test.ts`가 갖는다.
 *
 * 여기서 재는 것은 **메뉴 트리에만 있는 축 둘**이다: ㉠ 선택의 **종류**(메뉴/페이지)가 문장을
 * 가른다, ㉡ **`busy`에는 판정 문안을 붙이지 않는다** — 줄 행동의 항목이 전부 꺼지는 유일한 상태인데
 * 그 이유가 판정이 아니다.
 */
function menuStatusLine(): HTMLElement {
  const line = toolbar().querySelector<HTMLElement>('.wb-shell-menu-status')
  if (line === null) throw new Error('메뉴 트리에 상태줄이 없습니다')
  return line
}

describe('메뉴 트리 — 상태줄', () => {
  it('아무것도 안 고른 채 열리면 고르라고 말한다', async () => {
    await open()

    expect(menuStatusLine().textContent).toBe('메뉴나 페이지를 고르면 편집할 수 있습니다')
  })

  it('하위가 있는 메뉴를 고르면 삭제가 왜 꺼졌는지 말한다', async () => {
    await open()

    fireEvent.click(menuButton('회원관리'))

    expect(isOff(tool('삭제'))).toBe(true)
    expect(menuStatusLine().textContent).toBe('하위가 있는 메뉴라 삭제할 수 없습니다')
  })

  it('페이지를 고르면 페이지라고 말한다', async () => {
    // **페이지는 링크다** — 여는 것이 곧 고르는 것이고 선택은 주소에서 온다.
    await open({}, '/projects/p-1/pages/pg-list')

    expect(menuStatusLine().textContent).toBe('페이지라 하위 추가·계층 이동이 안 됩니다')
  })

  it('형제가 없는 메뉴는 순서를 못 바꾼다고 말한다', async () => {
    // `권한`은 `회원관리`의 유일한 자식이다 — `위로`·`아래로`가 함께 죽는 유일한 자리.
    await open()

    fireEvent.click(menuButton('권한'))

    expect(isOff(tool('위로'))).toBe(true)
    expect(isOff(tool('아래로'))).toBe(true)
    expect(menuStatusLine().textContent).toBe('형제가 없어 순서를 바꿀 수 없습니다')
  })

  it('**`옮기기` 하나가 없는 메뉴에는 아무 말도 하지 않는다**', async () => {
    // `주문관리`는 형제가 있고 비었다. 메뉴 선택에서 `옮기기`는 **언제나** 못 하므로
    // (`treeAbilities`) 메뉴 줄의 `…`에 아예 없고, 그것까지 말하면 메뉴를 고를 때마다 같은 문장이 선다.
    await open()

    fireEvent.click(menuButton('주문관리'))

    expect(queryRowAction(treeRegion(), '옮기기')).toBeNull()
    expect(menuStatusLine().textContent).toBe('')
    expect(tool('삭제').getAttribute('aria-describedby')).toBeNull()
  })

  it('**보내는 중에는 판정 문안을 붙이지 않는다** — 곧 풀릴 상태다', async () => {
    // 조작이 나가 있는 동안 아홉이 전부 꺼진다. 그때 *"메뉴를 고르세요"*가 뜨면
    // 거짓말이다 — 고른 것은 이미 있다.
    let release = (): void => {}
    const held = new Promise<void>((resolve) => {
      release = () => resolve()
    })
    const api = await open({ deleteMenu: vi.fn(async () => held) })

    fireEvent.click(menuButton('권한'))
    fireEvent.click(tool('삭제'))
    fireEvent.click(tool('정말 삭제합니까?'))

    await waitFor(() => expect(menuStatusLine().textContent).toBe('조작을 보내는 중입니다'))
    expect(isOff(tool('이름 변경'))).toBe(true)

    release()
    await waitFor(() => expect(api.getTree).toHaveBeenCalledTimes(2))
  })

  it('**보내는 중에는 그 줄이 탭 정지점이고, 꺼진 항목이 그 줄을 설명으로 든다** — 앱째로 잰다', async () => {
    // ***"켠 항목에 걸린 `aria-describedby`가 키보드가 그 문장에 닿는 길"*만으로는 모자라는
    // 자리다.** `busy`면 줄 행동의 항목이 **전부** 꺼져 화살표가 설 항목이 하나도 없다 — 그때는
    // `aria-describedby`가 읽힐 포커스가 없다. 그래서 줄 자체가 탭 정지점이 된다.
    //
    // 열두 상태의 표는 `./toolbar-status-reach.test.tsx`가 갖는다(상태줄만 떼어 렌더한다).
    // **여기서 재는 것은 그 상태가 진짜 앱에서 나온다는 쪽이다** — 조작 하나를 실제로
    // 붙들어 `busy`를 만든다.
    let release = (): void => {}
    const held = new Promise<void>((resolve) => {
      release = () => resolve()
    })
    const api = await open({ deleteMenu: vi.fn(async () => held) })

    fireEvent.click(menuButton('권한'))
    fireEvent.click(tool('삭제'))
    fireEvent.click(tool('정말 삭제합니까?'))
    await waitFor(() => expect(menuStatusLine().textContent).toBe('조작을 보내는 중입니다'))

    expect(menuStatusLine().tabIndex).toBe(0)
    const item = tool('이름 변경')
    expect(isOff(item)).toBe(true)
    expect(item.getAttribute('aria-describedby')).toBe(menuStatusLine().id)

    release()
    await waitFor(() => expect(api.getTree).toHaveBeenCalledTimes(2))
  })

  it('켠 항목이 그 문장을 자기 설명으로 든다 — 켠 항목이 있을 때는 그쪽이 먼저다', async () => {
    await open({}, '/projects/p-1/pages/pg-list')

    tool('이름 변경')
    const reachable = screen.getByRole('menuitem', {
      name: '이름 변경',
      description: '페이지라 하위 추가·계층 이동이 안 됩니다',
    })
    expect(isOff(reachable)).toBe(false)
    expect(reachable.getAttribute('aria-describedby')).toBe(menuStatusLine().id)
  })

  it('알림 자리를 쓰지 않는다 — `role="alert"`도 `aria-live`도 아니다', async () => {
    await open()

    expect(menuStatusLine().getAttribute('role')).toBeNull()
    expect(menuStatusLine().getAttribute('aria-live')).toBeNull()
  })
})

/**
 * **페이지 제목의 충돌** — 이름 변경이 바탕(입력이 열릴 때의 제목)을 싣고, 409 ·
 * `page-meta-changed`면 «페이지 설명»과 같은 판정(`api/page-meta.ts`의 `judgeMeta`) · 같은 화면
 * (`panels/meta-conflict.tsx`)을 지난다. 가짜 서버는 첫 부름만 409 로 답한다. jsdom 값이다.
 */
describe('이름 변경 — 페이지 제목의 충돌', () => {
  const CHANGED = '다른 사람이 이 페이지를 먼저 바꿨습니다'
  const clash = (current: string) =>
    new ApiError(409, 'conflict', CHANGED, [{ path: 'title', code: 'page-meta-changed', message: CHANGED, current }], true)

  /** 첫 부름은 `current`로 409, 그 뒤는 성공. */
  function clashOnce(current: string) {
    let calls = 0
    return vi.fn(async () => {
      calls += 1
      if (calls === 1) throw clash(current)
      return pageDetail('pg-list', '목록')
    })
  }

  async function renameInto(title: string, updatePage: ReturnType<typeof clashOnce>) {
    const api = await open({ updatePage }, '/projects/p-1/pages/pg-list')
    fireEvent.click(tool('이름 변경'))
    typeAndEnter(title)
    await waitFor(() => expect(updatePage).toHaveBeenCalledTimes(1))
    return api
  }

  function conflictNotice(): HTMLElement | null {
    return within(treeRegion()).queryByText('다른 사람이 이 제목을 바꿨습니다')?.closest<HTMLElement>('[role="alert"]') ?? null
  }

  /** 혼자 죽는 변조: 메뉴 트리가 충돌 화면에 그 사람의 제목 대신 내 제목(`mine`)을 넘긴다. */
  it('남이 먼저 바꿨으면 충돌 화면이 그 사람의 제목을 보이고, 트리를 다시 받는다', async () => {
    const updatePage = clashOnce('밥의 제목')
    const api = await renameInto('목록', updatePage)

    await waitFor(() => expect(conflictNotice()).not.toBeNull())
    expect(within(conflictNotice()!).getByText('밥의 제목')).toBeTruthy()
    expect(updatePage).toHaveBeenCalledWith('p-1', 'pg-list', { title: '목록', base: { title: '회원 목록' } }, expect.objectContaining({ signal: expect.any(AbortSignal) }))
    await waitFor(() => expect(api.getTree).toHaveBeenCalledTimes(2))
    // 실패 문장(서버 문장)으로 서지 않는다 — 충돌은 고를 것이 있는 화면이다.
    expect(within(treeRegion()).queryByText(CHANGED)).toBeNull()
  })

  /** 혼자 죽는 변조: «내 글로 덮기»가 그 사람의 제목 대신 내 제목을 바탕으로 싣는다. */
  it('«내 글로 덮기» — 그 사람의 제목을 바탕으로 내 제목을 다시 보낸다', async () => {
    const updatePage = clashOnce('밥의 제목')
    await renameInto('목록', updatePage)
    await waitFor(() => expect(conflictNotice()).not.toBeNull())

    fireEvent.click(within(conflictNotice()!).getByRole('button', { name: '내 글로 덮기' }))

    await waitFor(() => expect(updatePage).toHaveBeenCalledTimes(2))
    expect(updatePage).toHaveBeenLastCalledWith('p-1', 'pg-list', { title: '목록', base: { title: '밥의 제목' } }, expect.objectContaining({ signal: expect.any(AbortSignal) }))
    await waitFor(() => expect(conflictNotice()).toBeNull())
  })

  /** 혼자 죽는 변조: «내 글 버리기»가 충돌을 안 거둔다. */
  it('«내 글 버리기» — 충돌을 거두고 아무것도 보내지 않는다', async () => {
    const updatePage = clashOnce('밥의 제목')
    await renameInto('목록', updatePage)
    await waitFor(() => expect(conflictNotice()).not.toBeNull())

    fireEvent.click(within(conflictNotice()!).getByRole('button', { name: '내 글 버리기' }))

    expect(conflictNotice()).toBeNull()
    expect(updatePage).toHaveBeenCalledTimes(1)
  })

  /** 혼자 죽는 변조: `rename`의 `land`가 `judgeMeta`의 `'mine'`을 안 보고 늘 충돌을 세운다(메뉴도 이 판정을 지난다 — 축의 주인은 이 케이스). */
  it('409 의 지금 제목이 내 제목과 같으면 원하던 상태다 — 충돌이 아니다', async () => {
    const updatePage = clashOnce('목록')
    const api = await renameInto('목록', updatePage)

    await waitFor(() => expect(api.getTree).toHaveBeenCalledTimes(2))
    expect(conflictNotice()).toBeNull()
    expect(within(treeRegion()).queryByRole('alert')).toBeNull()
  })
})

describe('이름 변경 — 메뉴 제목의 충돌', () => {
  const CHANGED = '다른 사람이 이 메뉴를 먼저 바꿨습니다'
  const clash = (current: string) =>
    new ApiError(409, 'conflict', CHANGED, [{ path: 'title', code: 'menu-title-changed', message: CHANGED, current }], true)

  function conflictNotice(): HTMLElement | null {
    return within(treeRegion()).queryByText('다른 사람이 이 제목을 바꿨습니다')?.closest<HTMLElement>('[role="alert"]') ?? null
  }

  async function renameMenu(updateMenu: ApiClient['updateMenu']) {
    const api = await open({ updateMenu })
    fireEvent.click(menuButton('회원관리'))
    fireEvent.click(tool('이름 변경'))
    typeAndEnter('회원')
    return api
  }

  /**
   * 메뉴의 409 는 **페이지와 갈린 이슈 코드**(`menu-title-changed`)로 온다 — 페이지와 같은 화면이 선다.
   *
   * 혼자 죽는 변조: 없다 — `rename`이 메뉴에도 `PAGE_META_CHANGED`로 읽으면(코드를 안 가른다) 실패 문장으로 서고, 아래
   * «덮기»와 시간 제한 절의 «늦게 커밋된 앞 제목»(메뉴의 409 를 쓴다)도 충돌이 안 서서 함께 죽는다. **이 축(코드를 가른다)의
   * 주인은 이 케이스다.**
   */
  it('남이 먼저 바꿨으면 충돌 화면이 그 사람의 메뉴 제목을 보인다 — 바탕은 입력이 열릴 때의 제목이다', async () => {
    const updateMenu = vi.fn<ApiClient['updateMenu']>(async () => {
      throw clash('밥의 메뉴')
    })
    await renameMenu(updateMenu)

    await waitFor(() => expect(conflictNotice()).not.toBeNull())
    expect(within(conflictNotice()!).getByText('밥의 메뉴')).toBeTruthy()
    expect(updateMenu).toHaveBeenCalledWith('p-1', 'm-member', { title: '회원', base: { title: '회원관리' } }, expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(within(treeRegion()).queryByText(CHANGED)).toBeNull()
  })

  /**
   * 혼자 죽는 변조: 없다 — «덮기»가 내 제목을 바탕으로 실으면 페이지의 «내 글로 덮기»와 함께 죽는다(한 자리 —
   * `overwriteTitle`). **그 축의 주인은 페이지의 케이스다.** 이 케이스가 따로 재는 것은 덮기가 **메뉴 라우트로** 나가는 것이다.
   */
  it('«내 글로 덮기» — 그 사람의 메뉴 제목을 바탕으로 메뉴 라우트에 다시 보낸다', async () => {
    let calls = 0
    const updateMenu = vi.fn<ApiClient['updateMenu']>(async () => {
      calls += 1
      if (calls === 1) throw clash('밥의 메뉴')
      return menuNode('m-member', '회원')
    })
    const api = await renameMenu(updateMenu)
    await waitFor(() => expect(conflictNotice()).not.toBeNull())

    fireEvent.click(within(conflictNotice()!).getByRole('button', { name: '내 글로 덮기' }))

    await waitFor(() => expect(updateMenu).toHaveBeenCalledTimes(2))
    expect(updateMenu).toHaveBeenLastCalledWith('p-1', 'm-member', { title: '회원', base: { title: '밥의 메뉴' } }, expect.objectContaining({ signal: expect.any(AbortSignal) }))
    expect(api.updatePage).not.toHaveBeenCalled()
    await waitFor(() => expect(conflictNotice()).toBeNull())
  })
})

/**
 * **트리 이름 변경의 시간 제한 · «모름» · 떠나 있는 동안의 결말** — 설명 저장의 장치(쓰기 장부 — `panels/write-ledger.tsx`)를
 * 그대로 탄다. 판정의 뜻은 `tree/use-tree-commands.tsx`의 `rename` 머리말이 소유한다.
 *
 * 가짜 타이머가 켜진 동안은 `waitFor`·`findBy*`를 안 쓴다(`write-ledger.test.tsx` 머리말과 같은 까닭).
 */
describe('이름 변경 — 시간 제한 · «모름» · 떠나 있는 동안', () => {
  const SERVER_ERROR = '서버 오류가 발생했습니다'

  afterEach(() => {
    vi.useRealTimers()
  })

  /**
   * 트리 서버 흉내 — 이름 변경은 **붙잡힌다**: `commit`이 서버에 쓰고 `respond`/`fail`이 응답을 준다. `getTree`는 **지금 서버의
   * 제목**을 낸다. 끊기면 실제 `fetch`처럼 거절한다.
   */
  function treeServer() {
    const titles = new Map([
      ['m-member', '회원관리'],
      ['pg-list', '회원 목록'],
    ])
    const held: { id: string; title: string; resolve: (value: never) => void; reject: (reason: unknown) => void; signal?: AbortSignal }[] = []
    let reads: 'ok' | 'fail' = 'ok'
    let readError: unknown = new ApiError(500, 'internal', '서버 오류가 발생했습니다', [], true)
    const readSignals: (AbortSignal | undefined)[] = []

    function snapshot(): TreeMenuNode[] {
      const menu = tree()
      menu[0]!.title = titles.get('m-member')!
      menu[0]!.pages[0]!.title = titles.get('pg-list')!
      return menu
    }
    function take(id: string, title: string | undefined, signal: AbortSignal | undefined): Promise<never> {
      return new Promise<never>((resolve, reject) => {
        held.push({ id, title: title ?? '', resolve, reject, signal })
        signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
      })
    }
    const overrides: Partial<ApiClient> = {
      getTree: vi.fn<ApiClient['getTree']>(async (_projectId, options) => {
        if (options?.signal !== undefined) readSignals.push(options.signal)
        if (reads === 'fail') throw readError
        return snapshot()
      }),
      updateMenu: vi.fn<ApiClient['updateMenu']>(async (_projectId, nodeId, body, options) => take(nodeId, body.title, options?.signal)),
      updatePage: vi.fn<ApiClient['updatePage']>(async (_projectId, pageId, body, options) => take(pageId, body.title, options?.signal)),
      listProjects: async () => [PROJECT],
    }
    return {
      overrides,
      held,
      readSignals,
      /** 읽기를 실패시킨다 — `error`를 주면 그것으로(기본 500). */
      failReads: (fail: boolean, error?: unknown) => {
        reads = fail ? 'fail' : 'ok'
        if (error !== undefined) readError = error
      },
      /** 붙잡힌 이름 변경을 서버에 쓴다. */
      commit: (index = 0) => {
        titles.set(held[index]!.id, held[index]!.title)
      },
      /** 남이 바꿨다. */
      setTitle: (id: string, title: string) => {
        titles.set(id, title)
      },
      respond: async (index = 0) => {
        const entry = held[index]!
        await act(async () => {
          entry.resolve((entry.id.startsWith('m-') ? menuNode(entry.id, entry.title) : pageDetail(entry.id, entry.title)) as never)
        })
      },
      fail: async (index: number, error: unknown) => {
        await act(async () => {
          held[index]!.reject(error)
        })
      },
    }
  }

  async function advance(ms: number): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  }

  /** 메뉴 «회원관리»의 이름을 바꾼다 — 요청이 붙잡힌다. `fake`면 보내기 직전에 가짜 타이머를 켠다. */
  async function renameMenuHeld(server: ReturnType<typeof treeServer>, title: string, fake: boolean, route?: string) {
    await open(server.overrides, route)
    fireEvent.click(menuButton('회원관리'))
    fireEvent.click(tool('이름 변경'))
    if (fake) vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    typeAndEnter(title)
    expect(server.held).toHaveLength(1)
  }

  function alertText(): string | null {
    return within(treeRegion()).queryByRole('alert')?.textContent ?? null
  }

  /**
   * 혼자 죽는 변조: `settle`의 판정 갈래가 다시 읽은 트리를 안 세운다(`setState` 한 줄) — 트리가 옛 제목에 머문다.
   */
  it('시간 안에 응답이 없으면 끊고 트리를 다시 읽는다 — 서버 제목이 내 것이면 말없이 풀리고 그 제목이 선다', async () => {
    const server = treeServer()
    await renameMenuHeld(server, '회원', true)
    server.commit()

    await advance(WRITE_DEADLINE_MS - 1)
    expect(isOff(tool('하위 메뉴'))).toBe(true)
    expect(server.held[0]!.signal?.aborted).toBe(false)

    await advance(1)
    expect(server.held[0]!.signal?.aborted).toBe(true)
    vi.useRealTimers()

    await waitFor(() => expect(isOff(tool('하위 메뉴'))).toBe(false))
    expect(server.readSignals).toHaveLength(1)
    expect(menuButton('회원')).toBeTruthy()
    expect(alertText()).toBeNull()
  })

  /**
   * «바뀌지 않았습니다» 뒤 **끊긴 요청이 늦게 커밋한 판** — 다음 이름 변경의 409 는 다른 사람이 아니라 앞서 보낸 내 제목이다.
   *
   * 혼자 죽는 변조: `land`의 «안 바뀜» 갈래가 보낸 제목을 매달린 값(`hanging`)에 안 든다 — 둘째가 «다른 사람이 …»로 선다.
   */
  it('다시 읽은 제목이 바탕이면 «바뀌지 않았습니다» — 늦게 커밋된 앞 제목은 다음 409 에서 «앞서 보낸 글»이다', async () => {
    const server = treeServer()
    await renameMenuHeld(server, '회원', true)

    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()
    await waitFor(() => expect(alertText()).toBe('응답이 없어 서버를 다시 읽었더니 이름이 바뀌지 않았습니다'))
    expect(menuButton('회원관리')).toBeTruthy()

    // 끊긴 요청이 서버에서 늦게 커밋한다. 트리는 아직 옛 제목이다 — 그 바탕으로 다시 바꾸면 서버는 409 에 내 앞 제목을 싣는다.
    server.commit()
    const CHANGED = '다른 사람이 이 메뉴를 먼저 바꿨습니다'
    ;(server.overrides.updateMenu as ReturnType<typeof vi.fn>).mockImplementationOnce(async () => {
      throw new ApiError(409, 'conflict', CHANGED, [{ path: 'title', code: 'menu-title-changed', message: CHANGED, current: '회원' }], true)
    })
    fireEvent.click(menuButton('회원관리'))
    fireEvent.click(tool('이름 변경'))
    typeAndEnter('회원 모음')

    const lead = await within(treeRegion()).findByText('지금 저장된 제목이 앞서 보낸 글과 같습니다')
    expect(within(lead.closest<HTMLElement>('[role="alert"]')!).getByText('회원')).toBeTruthy()
    expect(within(treeRegion()).queryByText('다른 사람이 이 제목을 바꿨습니다')).toBeNull()
  })

  /**
   * 혼자 죽는 변조: `land`의 «안 바뀜» 갈래가 `'base'`만이 아니라 다시 읽은 모든 판정을 받는다(`verdict !== 'mine'`) — 남의 제목이
   * «바뀌지 않았습니다»로 선다.
   */
  it('다시 읽은 제목이 남의 것이면 충돌 화면이다', async () => {
    const server = treeServer()
    await renameMenuHeld(server, '회원', true)
    server.setTitle('m-member', '밥의 메뉴')

    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()
    const lead = await within(treeRegion()).findByText('다른 사람이 이 제목을 바꿨습니다')
    expect(within(lead.closest<HTMLElement>('[role="alert"]')!).getByText('밥의 메뉴')).toBeTruthy()
  })

  /**
   * 혼자 죽는 변조: 트리의 장부 칸이 `recheck`를 안 넘긴다(`recheck: null`) — «다시 확인»을 눌러도 판정하지 않는다.
   */
  it('다시 읽기도 실패하면 «모름» — 트리 조작이 잠긴 채 «다시 확인»이 판정한다', async () => {
    const server = treeServer()
    await renameMenuHeld(server, '회원', true)
    server.failReads(true)

    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()
    await waitFor(() => expect(alertText()).toBe('응답이 없고, 이름이 바뀌었는지 확인하지도 못했습니다'))
    expect(isOff(tool('하위 메뉴'))).toBe(true)

    server.failReads(false)
    server.commit()
    fireEvent.click(within(treeRegion()).getByRole('button', { name: '다시 확인' }))

    await waitFor(() => expect(isOff(tool('하위 메뉴'))).toBe(false))
    expect(alertText()).toBeNull()
  })

  /**
   * **에디터를 떠나 있는 동안 끝난 실패** — 돌아온 트리가 말한다. 문장은 «이 화면을 떠나 있는 동안»이다(에디터 안에서
   * 다른 프로젝트에 가 있었어도 참이다).
   *
   * 혼자 죽는 변조: 장부가 받는 자리가 **없으면** 본 것으로 친다(`receiver?.sees(target) !== true` →
   * `receiver !== undefined && !receiver.sees(target)`) — 떠나 있는 동안 트리가 아예 없어 남기지 않는다. (트리의 `sees`를 늘 참으로
   * 두는 변조는 이 판에 안 닿는다 — 받을 트리가 없다. 그 축은 아래 절의 «다른 프로젝트에 가 있는 동안 …»이 갖는다.)
   */
  it('에디터를 떠나 있는 동안 실패하면, 돌아온 트리가 «이 화면을 떠나 있는 동안 …»으로 말하고 «확인»이 닫는다', async () => {
    const server = treeServer()
    await renameMenuHeld(server, '회원', false)

    fireEvent.click(screen.getByRole('link', { name: '프로젝트 목록' }))
    await screen.findByRole('link', { name: PROJECT_NAME })
    await server.fail(0, new ApiError(500, 'internal', SERVER_ERROR, [], true))
    fireEvent.click(screen.getByRole('link', { name: PROJECT_NAME }))
    await screen.findByText('회원관리')

    await waitFor(() => expect(alertText()).toBe(`이 화면을 떠나 있는 동안 이름을 바꾸지 못했습니다 — ${SERVER_ERROR}`))
    fireEvent.click(within(treeRegion()).getByRole('button', { name: '확인' }))
    expect(alertText()).toBeNull()
  })

  /**
   * **에디터를 떠났다 와도 나가 있는 이름 변경이 트리를 잠근다** — 새로 선 트리의 `inFlight`는 모른다.
   *
   * 혼자 죽는 변조: `busy`가 장부 칸을 안 본다(`busy: busy || renameLocked` → `busy`).
   */
  it('이름 변경이 나가 있는 채 에디터를 떠났다 오면 트리가 잠긴 채 서고, 응답이 오면 풀린다', async () => {
    const server = treeServer()
    await renameMenuHeld(server, '회원', false)

    fireEvent.click(screen.getByRole('link', { name: '프로젝트 목록' }))
    fireEvent.click(await screen.findByRole('link', { name: PROJECT_NAME }))
    await screen.findByText('회원관리')
    fireEvent.click(menuButton('회원관리'))
    expect(isOff(tool('이름 변경'))).toBe(true)

    server.commit()
    await server.respond()
    await waitFor(() => expect(isOff(tool('이름 변경'))).toBe(false))
    expect(alertText()).toBeNull()
  })

  /**
   * **트리는 같은 프로젝트 안의 페이지 이동에 다시 마운트되지 않는다** — 이 케이스가 그 조건을 잰다.
   * 다른 페이지 · 프로젝트 첫 화면으로 옮긴 사이 끝난 실패를 트리가 **한 번** 말하고, «떠나 있는 동안»은 안 남는다.
   *
   * 혼자 죽는 변조: 장부가 받는 자리를 쓰기의 종류가 아니라 늘 우측 패널(`'page'`)로 고른다(`receiversRef.current.get('page')`) —
   * 우측 패널은 다른 페이지를 보고 있어 «떠나 있었다»로 남긴다. 트리가 두 번 말한다.
   */
  it('같은 프로젝트의 다른 페이지로 옮긴 사이 실패해도 트리가 한 번만 말한다 — «떠나 있는 동안»을 남기지 않는다', async () => {
    const server = treeServer()
    await renameMenuHeld(server, '회원', false, '/projects/p-1/pages/pg-list')

    fireEvent.click(within(treeRegion()).getByRole('link', { name: '회원 상세' }))
    await waitFor(() => expect(currentPath()).toBe('/projects/p-1/pages/pg-detail'))
    await server.fail(0, new ApiError(500, 'internal', SERVER_ERROR, [], true))

    await waitFor(() => expect(alertText()).toBe(SERVER_ERROR))
    expect(within(treeRegion()).getAllByRole('alert')).toHaveLength(1)
    expect(within(treeRegion()).queryByText(/떠나 있는 동안/)).toBeNull()
  })
})

/**
 * ## 판정의 말이 **지금 떠 있는 트리**에 닿는다
 *
 * 이름 변경을 낸 트리가 내려가고(에디터를 떠났다) **새 트리가 떠 있는 채** 판정이 끝나면, 판정의 말은 장부의 `deliver`로
 * 떠 있는 트리(`Receiver` — 종류 `'tree'`)에 간다. 낸 인스턴스의 state 에만 쓰면 새 트리는 «바뀌지 않았습니다»도 충돌 화면도
 * 없이 잠금만 풀린다(Chrome 에서 잰 고장 방식).
 *
 * 변조는 **그 칸 하나만** 낸 인스턴스에 쓰게 되돌린다(`put(칸, …)` → 낸 인스턴스의 `set…`) — 칸마다 그것을 새 트리에서
 * 재는 케이스가 혼자 죽는다. 같은 인스턴스에서 재는 위 절은 안 죽는다.
 */
describe('이름 변경 — 판정의 말이 지금 떠 있는 트리에 닿는다', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  function server2() {
    const titles = new Map([['m-member', '회원관리']])
    const held: { id: string; title: string; resolve: (value: never) => void; reject: (reason: unknown) => void }[] = []
    let readError: unknown = null
    const updateMenu = vi.fn<ApiClient['updateMenu']>(
      async (_projectId, nodeId, body, options) =>
        new Promise<never>((resolve, reject) => {
          held.push({ id: nodeId, title: body.title ?? '', resolve, reject })
          options?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )
    const overrides: Partial<ApiClient> = {
      getTree: vi.fn<ApiClient['getTree']>(async () => {
        if (readError !== null) throw readError
        const menu = tree()
        menu[0]!.title = titles.get('m-member')!
        return menu
      }),
      updateMenu,
      listProjects: async () => [PROJECT],
    }
    return {
      overrides,
      held,
      updateMenu,
      failReads: (error: unknown) => {
        readError = error
      },
      commit: (index = 0) => titles.set(held[index]!.id, held[index]!.title),
      setTitle: (title: string) => titles.set('m-member', title),
      respond: async (index = 0) => {
        const entry = held[index]!
        await act(async () => entry.resolve(menuNode(entry.id, entry.title) as never))
      },
      fail: async (index: number, error: unknown) => {
        await act(async () => held[index]!.reject(error))
      },
    }
  }

  async function advance(ms: number): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  }

  function alertText(): string | null {
    return within(treeRegion()).queryByRole('alert')?.textContent ?? null
  }

  /** «회원관리»의 이름을 바꾼다 — 요청이 붙잡힌다. `fake`면 보내기 직전에 가짜 타이머를 켠다(시간 제한의 타이머). */
  async function renameHeld(server: ReturnType<typeof server2>, title: string, fake: boolean) {
    await open(server.overrides)
    fireEvent.click(menuButton('회원관리'))
    fireEvent.click(tool('이름 변경'))
    if (fake) vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    typeAndEnter(title)
    expect(server.held).toHaveLength(1)
  }

  /**
   * 프로젝트 목록으로 갔다 돌아온다 — 셸째 내려갔다 선다(**새 트리**). 가짜 타이머 아래서도 돌게 타이머를 0 씩 밀며 기다린다
   * (시간 제한까지는 안 민다).
   */
  async function leaveAndReturn(fake: boolean): Promise<void> {
    const until = async (found: () => HTMLElement | null): Promise<HTMLElement> => {
      if (!fake)
        return waitFor(() => {
          const element = found()
          if (element === null) throw new Error('아직 없다')
          return element
        })
      for (let i = 0; i < 50 && found() === null; i += 1) await advance(0)
      const element = found()
      expect(element).not.toBeNull()
      return element!
    }
    const before = treeRegion()
    fireEvent.click(screen.getByRole('link', { name: '프로젝트 목록' }))
    fireEvent.click(await until(() => screen.queryByRole('link', { name: PROJECT_NAME })))
    await until(() => (screen.queryByRole('region', { name: '메뉴·페이지 트리' }) === null ? null : within(treeRegion()).queryByText(/회원관리|밥의 메뉴/)))
    // 셸째 새로 섰다 — 앞의 트리 영역은 문서에 없다.
    expect(before.isConnected).toBe(false)
  }

  /**
   * 새 트리가 떠 있는 채 판정이 `'base'`로 끝난다. «바뀌지 않았습니다»와 **매달린 값**이 새 트리에 닿는다.
   *
   * 혼자 죽는 변조 둘: `land`의 «바뀌지 않았습니다» 실패를 낸 인스턴스에 쓴다 · 매달린 값을 낸 인스턴스에 든다(뒤의 것은
   * «앞서 보낸 글» 대신 «다른 사람이 …»가 선다).
   */
  it('떠났다 돌아온 새 트리에서 판정이 «바뀌지 않았습니다»로 끝나면 새 트리가 말하고, 매달린 값도 새 트리가 든다', async () => {
    const server = server2()
    await renameHeld(server, '회원', true)
    await leaveAndReturn(true)

    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()
    await waitFor(() => expect(alertText()).toBe('응답이 없어 서버를 다시 읽었더니 이름이 바뀌지 않았습니다'))
    expect(menuButton('회원관리')).toBeTruthy()

    // 끊긴 요청이 늦게 커밋한다 — 새 트리에서 다시 바꾸면 409 가 앞서 보낸 내 제목을 싣는다.
    server.commit()
    const CHANGED = '다른 사람이 이 메뉴를 먼저 바꿨습니다'
    server.updateMenu.mockImplementationOnce(async () => {
      throw new ApiError(409, 'conflict', CHANGED, [{ path: 'title', code: 'menu-title-changed', message: CHANGED, current: '회원' }], true)
    })
    fireEvent.click(menuButton('회원관리'))
    fireEvent.click(tool('이름 변경'))
    typeAndEnter('회원 모음')
    expect(await within(treeRegion()).findByText('지금 저장된 제목이 앞서 보낸 글과 같습니다')).toBeTruthy()
    expect(within(treeRegion()).queryByText('다른 사람이 이 제목을 바꿨습니다')).toBeNull()
  })

  /**
   * 그 사이 남이 바꿨다. 충돌 화면이 **새 트리**에 서고, «내 글로 덮기»가 새 트리에서 그 사람의 제목을 바탕으로 보낸다.
   *
   * 혼자 죽는 변조: `land`의 충돌을 낸 인스턴스에 쓴다.
   */
  it('떠났다 돌아온 새 트리에서 판정이 «다른 사람이 바꿨다»로 끝나면 새 트리에 충돌 화면이 서고 덮기가 된다', async () => {
    const server = server2()
    await renameHeld(server, '앨리스의 메뉴', true)
    server.setTitle('밥의 메뉴')
    await leaveAndReturn(true)

    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()
    const lead = await within(treeRegion()).findByText('다른 사람이 이 제목을 바꿨습니다')
    expect(within(lead.closest<HTMLElement>('[role="alert"]')!).getByText('밥의 메뉴')).toBeTruthy()

    fireEvent.click(within(treeRegion()).getByRole('button', { name: '내 글로 덮기' }))
    await waitFor(() => expect(server.updateMenu).toHaveBeenCalledTimes(2))
    expect(server.updateMenu.mock.calls[1]![2]).toEqual({ title: '앨리스의 메뉴', base: { title: '밥의 메뉴' } })
  })

  /**
   * «모름»인 채 떠났다 돌아와 **새 트리의** «다시 확인»으로 판정한다. 판정용으로 다시 읽은 트리가 새 트리에 선다
   * (새 트리는 커밋 전에 읽었다).
   *
   * 혼자 죽는 변조: 판정 갈래가 다시 읽은 트리를 낸 인스턴스에 세운다 — 새 트리가 옛 제목에 머문다.
   */
  it('«모름»으로 떠났다 돌아온 새 트리에서 «다시 확인»하면 다시 읽은 트리가 새 트리에 선다', async () => {
    const server = server2()
    await renameHeld(server, '회원', true)
    server.failReads(new ApiError(500, 'internal', '서버 오류가 발생했습니다', [], true))
    await advance(WRITE_DEADLINE_MS)
    expect(alertText()).toBe('응답이 없고, 이름이 바뀌었는지 확인하지도 못했습니다')

    server.failReads(null)
    await leaveAndReturn(true)
    vi.useRealTimers()
    expect(alertText()).toBe('응답이 없고, 이름이 바뀌었는지 확인하지도 못했습니다')
    expect(menuButton('회원관리')).toBeTruthy()

    server.commit()
    fireEvent.click(within(treeRegion()).getByRole('button', { name: '다시 확인' }))
    await waitFor(() => expect(menuButton('회원')).toBeTruthy())
    expect(alertText()).toBeNull()
  })

  /**
   * **에디터 안에서 다른 프로젝트로** 가 있는 동안 끝난 실패. 그 프로젝트의 트리는 말하지 않고(남의 프로젝트의
   * 이름 변경이다), 돌아온 트리가 «이 화면을 떠나 있는 동안 …»으로 말한다(«에디터를 떠나 있는 동안»이라고 쓰면 이 판에 거짓이다).
   *
   * 혼자 죽는 변조: 트리의 `sees`가 프로젝트를 안 본다(`() => true`) — 다른 프로젝트의 트리가 «보고 있다»고 답해 장부가 안 남기고,
   * 그 트리의 `accept`는 프로젝트가 달라 버린다. 아무도 말하지 않는다. (위 «에디터를 떠나 있는 동안 …»은 이 변조에 안 죽는다 —
   * 그 판에는 떠 있는 트리가 아예 없다.)
   */
  it('에디터 안에서 다른 프로젝트에 가 있는 동안 실패하면 그 트리는 말이 없고, 돌아온 트리가 «이 화면을 떠나 있는 동안 …»으로 말한다', async () => {
    const server = server2()
    const OTHER: ProjectView = { ...PROJECT, id: 'p-2', name: '이번 설계서', slug: 'proj-2' }
    const getTree = server.overrides.getTree!
    const harness = stubs({
      ...server.overrides,
      getProject: async (id: string) => (id === 'p-2' ? OTHER : PROJECT),
      getTree: (async (projectId: string, options?: Parameters<ApiClient['getTree']>[1]) =>
        projectId === 'p-2' ? [{ id: 'm-b', title: '비 메뉴', sortOrder: 0, pages: [], children: [] }] : getTree(projectId, options)) as ApiClient['getTree'],
    })
    function GoTo(props: { to: string; label: string }): ReactElement {
      const navigate = useNavigate()
      return (
        <button type="button" onClick={() => navigate(props.to)}>
          {props.label}
        </button>
      )
    }
    renderWithProviders(
      <>
        <App />
        <GoTo to="/projects/p-2" label="이번으로" />
        <GoTo to="/projects/p-1" label="일번으로" />
      </>,
      { client: harness.client, route: '/projects/p-1' },
    )
    await screen.findByText('회원관리')
    fireEvent.click(menuButton('회원관리'))
    fireEvent.click(tool('이름 변경'))
    typeAndEnter('회원')
    expect(server.held).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: '이번으로' }))
    await screen.findByText('비 메뉴')
    await server.fail(0, new ApiError(500, 'internal', '서버 오류가 발생했습니다', [], true))
    expect(within(treeRegion()).queryByRole('alert')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: '일번으로' }))
    await screen.findByText('회원관리')
    await waitFor(() => expect(alertText()).toBe('이 화면을 떠나 있는 동안 이름을 바꾸지 못했습니다 — 서버 오류가 발생했습니다'))
  })

  /**
   * 돌아온 **뒤에** 끝난 `'failed'`는 새 트리가 **보통 문장으로 한 번** 말한다(«떠나 있는 동안»이
   * 아니다 — 설명이 돌아온 패널에서 보통 문장으로 말하는 것과 같다).
   *
   * 혼자 죽는 변조: `settle`의 실패 갈래가 실패를 낸 인스턴스에 쓴다 — 새 트리가 말이 없다.
   */
  it('돌아온 뒤에 실패하면 새 트리가 보통 문장으로 한 번 말한다', async () => {
    const server = server2()
    await renameHeld(server, '회원', false)
    await leaveAndReturn(false)

    await server.fail(0, new ApiError(500, 'internal', '서버 오류가 발생했습니다', [], true))
    await waitFor(() => expect(alertText()).toBe('서버 오류가 발생했습니다'))
    expect(within(treeRegion()).getAllByRole('alert')).toHaveLength(1)
  })

  /**
   * 돌아온 뒤에 성공하면 **뒤의 다시 받기**도 새 트리에 닿는다 — 새 트리는 커밋 전에 읽어 옛 제목이었다.
   *
   * 혼자 죽는 변조: `rename`이 다시 받기를 `run`의 `load`(낸 인스턴스)에 맡긴다(`return reload ? undefined : NO_RELOAD`).
   */
  it('돌아온 뒤에 성공하면 뒤의 다시 받기가 새 트리에 닿는다 — 새 이름이 선다', async () => {
    const server = server2()
    await renameHeld(server, '회원', false)
    await leaveAndReturn(false)
    expect(menuButton('회원관리')).toBeTruthy()

    server.commit()
    await server.respond()
    await waitFor(() => expect(menuButton('회원')).toBeTruthy())
    expect(alertText()).toBeNull()
  })

  /**
   * **받을 트리가 아예 없는 동안**(프로젝트 목록) 판정이 «바뀌지 않았습니다»로 끝나면 돌아온 트리가 말한다. 장부가 `'failed'`만
   * 남기면 이 판정은 버려진다 — 돌아온 트리에 통지가 없다(Chrome 에서 잰 고장 방식).
   *
   * 혼자 죽는 변조: 트리 `land`의 `'base'` 갈래가 결말로 `null`을 돌려준다(떠 있는 트리에는 그대로 그린다).
   */
  it('목록에 가 있는 동안 판정이 «바뀌지 않았습니다»로 끝나면 돌아온 트리가 «이 화면을 떠나 있는 동안 …»으로 말한다', async () => {
    const server = server2()
    await renameHeld(server, '회원', true)
    fireEvent.click(screen.getByRole('link', { name: '프로젝트 목록' }))
    for (let i = 0; i < 50 && screen.queryByRole('link', { name: PROJECT_NAME }) === null; i += 1) await advance(0)
    expect(screen.queryByRole('region', { name: '메뉴·페이지 트리' })).toBeNull()

    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()
    fireEvent.click(screen.getByRole('link', { name: PROJECT_NAME }))
    await waitFor(() => expect(menuButton('회원관리')).toBeTruthy())
    expect(alertText()).toBe('이 화면을 떠나 있는 동안 이름을 바꾸지 못했습니다 — 응답이 없어 서버를 다시 읽었더니 이름이 바뀌지 않았습니다')
  })

  /**
   * **새 트리의 마운트 조회가 배달된 다시 받기보다 늦게 와도 옛 제목으로 덮지 않는다** — 트리 칸에 설명의 `answered` 같은
   * 창 닫기가 없으면 덮는다. 새 트리가 커밋 **전에** 건 마운트 조회를 붙잡아 두고, 이름 변경이 커밋된 뒤의 다시 받기(새 이름)가 먼저
   * 닿게 한 뒤 마운트 조회(옛 이름)를 놓는다. 창 닫기가 없으면 새 트리가 `회원관리`로 돌아간다.
   *
   * 혼자 죽는 변조: 트리의 «늦게 낸 조회의 답만» 판정(`use-tree-commands.tsx`의 `newer`)을 늘 참으로.
   */
  it('새 트리의 마운트 조회가 배달된 다시 받기보다 늦게 와도 옛 제목으로 덮지 않는다', async () => {
    const server = server2()
    await renameHeld(server, '회원', false)
    let releaseMount: () => void = () => {}
    ;(server.overrides.getTree as ReturnType<typeof vi.fn<ApiClient['getTree']>>).mockImplementationOnce(
      async () =>
        new Promise<TreeMenuNode[]>((resolve) => {
          // 커밋 **전에** 읽은 값 — 옛 제목이다.
          const before = tree()
          releaseMount = () => resolve(before)
        }),
    )
    fireEvent.click(screen.getByRole('link', { name: '프로젝트 목록' }))
    fireEvent.click(await screen.findByRole('link', { name: PROJECT_NAME }))
    await waitFor(() => expect(screen.queryByRole('region', { name: '메뉴·페이지 트리' })).not.toBeNull())

    server.commit()
    await server.respond()
    await waitFor(() => expect(menuButton('회원')).toBeTruthy())

    await act(async () => releaseMount())
    await act(async () => {})
    expect(within(treeRegion()).queryByRole('button', { name: '회원관리' })).toBeNull()
    expect(menuButton('회원')).toBeTruthy()
  })

  /**
   * «모름» 동안 세션이 끝났다(다른 탭의 로그아웃). «다시 확인»의 다시 읽기가 401 이면 «확인하지도 못했습니다»가 아니라
   * 로그인 화면이다. 세션 끊김을 문장으로 바꿔 쓰면 트리가 잠긴 채 머문다(Chrome 에서 잰 고장 방식).
   *
   * 혼자 죽는 변조: 트리의 실패 갈래가 세션 끊김을 문장으로 바꿔 쓴다(`signed-out` → «요청을 처리하지 못했습니다»). 장부의 401
   * 갈래(`attempt`)를 떼면 이것과 `write-ledger.test.tsx`의 설명 케이스가 **함께** 죽는다 — 그 축의 주인은 설명 케이스다.
   */
  it('«모름» 동안 세션이 끝났으면 «다시 확인»이 로그인 화면으로 간다', async () => {
    const server = server2()
    await renameHeld(server, '회원', true)
    server.failReads(new ApiError(500, 'internal', '서버 오류가 발생했습니다', [], true))
    await advance(WRITE_DEADLINE_MS)
    vi.useRealTimers()
    expect(alertText()).toBe('응답이 없고, 이름이 바뀌었는지 확인하지도 못했습니다')

    server.failReads(new ApiError(401, 'unauthenticated', '로그인이 필요합니다'))
    fireEvent.click(within(treeRegion()).getByRole('button', { name: '다시 확인' }))
    await waitFor(() => expect(screen.queryByLabelText('이메일')).not.toBeNull())
  })
})
