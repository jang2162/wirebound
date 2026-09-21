/**
 * **빈 프로젝트에서 최상위 메뉴를 만든다** — 그 자리가 막다른 길이었다.
 *
 * # 무엇이 막혀 있었나
 *
 * 새 프로젝트는 메뉴 노드가 **0개**로 만들어진다(`apps/api/src/repos/projects.ts`의
 * `insertProject`는 프로젝트·멤버·기본 레이아웃만 만든다). 그런데 메뉴 툴바의 아홉은
 * **전부 선택에 매여 있다** — `tree/tree-actions.ts`의 `treeAbilities`가 `selection === null`
 * 이면 `NOTHING`을 낸다. 빈 트리에는 고를 것이 없으므로 첫 메뉴를 만들 수 없고, 페이지는
 * `menuNodeId`가 필수라 페이지도 만들 수 없었다.
 *
 * **서버가 아니라 화면의 구멍이었다.** `apps/api/src/routes/menu.ts`는 처음부터
 * `parentId: z.uuid().nullable().optional()`을 받고 `body.parentId ?? null`을 쓴다 —
 * `{title}`만으로 `POST /menu`를 치면 **201 · `parentId: null`**이다. 클라이언트도
 * `api/http-client.ts`의 `createMenu`에 *"`parentId`는 `null`이어도 그대로 싣는다"*를 이미
 * 적고 있었다. **부르는 자리가 없었을 뿐이다.**
 *
 * # 이 파일이 재는 것 — 빈 상태의 버튼 하나
 *
 * 고른 형태는 **빈 트리의 빈 상태 버튼**이고, 툴바에 「최상위 메뉴」를 상설하지 않은
 * 근거는 `panels/menu-tree.tsx`의 그 자리 주석이 갖는다(요지: 메뉴가 하나라도 있으면
 * `하위 메뉴`+`내어쓰기`로 형제 루트를 만드는 길이 이미 있고, 선택 없이 켜지는 버튼을
 * 툴바에 두면 `toolbar-status.ts`의 문안과 `./toolbar-status-reach.test.tsx`의 열두 상태가
 * 함께 거짓이 된다).
 *
 * **`<App />`을 라우트째 렌더한다**(`./menu-crud.test.tsx`와 같은 근거) — 이 슬라이스의
 * 하중이 *"빈 트리에서 그 버튼이 보이는가"*와 *"거기서 친 제목이 `parentId: null`로
 * 나가는가"*라서, 컴포넌트만 떼면 둘 다 재지 못한다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ApiClient } from '../../src/api/client'
import type { MenuNode, ProjectDetail, SessionUser, TreeMenuNode } from '../../src/api/types'
import { App } from '../../src/app'
import { fakeApi, renderWithProviders } from '../helpers'

const USER: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }
const PROJECT_NAME = '설계서'
const PROJECT: ProjectDetail = {
  id: 'p-1',
  name: PROJECT_NAME,
  slug: 'proj',
  description: null,
  role: 'owner',
}

/** 만들어진 루트 메뉴의 응답. **`parentId`가 `null`인 것이 루트라는 뜻이다.** */
const CREATED: MenuNode = { id: 'm-new', projectId: 'p-1', parentId: null, title: '관리자', sortOrder: 0 }

/** 메뉴 하나짜리 트리 — *"비었을 때만"*을 재는 대조군이다. */
function oneMenu(): TreeMenuNode[] {
  return [{ id: 'm-1', title: '회원관리', sortOrder: 0, pages: [], children: [] }]
}

function stubs(menu: () => TreeMenuNode[], overrides: Partial<ApiClient> = {}) {
  const getTree = vi.fn(async () => menu())
  const createMenu = vi.fn(async () => CREATED)

  const client = fakeApi({
    me: async () => USER,
    getProject: async () => PROJECT,
    listMyRevisions: async () => [],
    getTree,
    createMenu,
    ...overrides,
  })

  return { client, getTree, createMenu: (overrides.createMenu ?? createMenu) as typeof createMenu }
}

/** 셸과 트리가 **둘 다 그려질 때까지** 기다린다. 빈 트리의 닻은 빈 상태 문장이다. */
async function open(
  menu: () => TreeMenuNode[] = () => [],
  overrides: Partial<ApiClient> = {},
): Promise<ReturnType<typeof stubs>> {
  const harness = stubs(menu, overrides)
  renderWithProviders(<App />, { client: harness.client, route: '/projects/p-1' })
  await screen.findByRole('heading', { name: PROJECT_NAME })
  if (menu().length === 0) await screen.findByText(EMPTY_TEXT)
  else await screen.findByText('회원관리')
  return harness
}

const EMPTY_TEXT = '메뉴가 없습니다.'
const ROOT_BUTTON = '최상위 메뉴'

function treeRegion(): HTMLElement {
  return screen.getByRole('region', { name: '메뉴·페이지 트리' })
}

function toolbar(): HTMLElement {
  return within(treeRegion()).getByRole('group', { name: '메뉴 편집' })
}

function tool(name: string): HTMLButtonElement {
  return within(toolbar()).getByRole('button', { name }) as HTMLButtonElement
}

/** 빈 상태 버튼. **툴바 밖이다** — 트리 자리에 선다. */
function rootButton(): HTMLButtonElement {
  return within(treeRegion()).getByRole('button', { name: ROOT_BUTTON }) as HTMLButtonElement
}

function queryRootButton(): HTMLElement | null {
  return within(treeRegion()).queryByRole('button', { name: ROOT_BUTTON })
}

/** 인라인 입력. 용도가 넷이 됐지만 입력은 하나다(D6). */
function input(): HTMLInputElement {
  return within(toolbar()).getByRole('textbox', { name: '이름' }) as HTMLInputElement
}

function typeAndEnter(value: string): void {
  const box = input()
  fireEvent.change(box, { target: { value } })
  fireEvent.keyDown(box, { key: 'Enter' })
}

describe('빈 메뉴 트리 — 최상위 메뉴를 만드는 자리', () => {
  /**
   * **대조가 이 케이스의 절반이다.** `하위 메뉴`가 꺼져 있다는 것이 이 버튼이 왜 따로
   * 있어야 하는지이고, 동시에 *"선택이 없을 때 「하위 메뉴」가 루트를 만들게 한다"*는
   * 다른 형태를 **고르지 않았다**는 사실을 값으로 둔다. 그 형태로 갈아타면 이 줄이 먼저
   * 운다.
   */
  it('빈 트리에 최상위 메뉴 버튼이 서고, 툴바의 하위 메뉴는 꺼져 있다', async () => {
    await open()

    expect(queryRootButton()).not.toBeNull()
    expect(tool('하위 메뉴').disabled).toBe(true)
    expect(tool('페이지 추가').disabled).toBe(true)
  })

  /**
   * **이 파일의 값이다.** `parentId: null`이 곧 *"루트에 만든다"*이고, 서버가 그것을 그렇게
   * 읽는다(머리말의 실측).
   */
  it('그 버튼으로 확정하면 parentId 가 null 로 나간다', async () => {
    const api = await open()

    fireEvent.click(rootButton())
    // 누른 뒤 손이 키보드에 있다 — 커서가 딴 데 있으면 한 번 더 눌러야 한다.
    expect(document.activeElement).toBe(input())

    typeAndEnter('관리자')

    await waitFor(() => expect(api.createMenu).toHaveBeenCalledTimes(1))
    expect(api.createMenu).toHaveBeenCalledWith('p-1', { parentId: null, title: '관리자' })
  })

  /**
   * **빈 제목 가드가 이 갈래보다 위에 있는가**(D6). 서버의 `Title`이 `z.string().min(1)`이라
   * 400이 되는데 그 왕복을 만들지 않는다 — 이 갈래를 가드 **위로** 올리면 여기서만 죽는다.
   */
  it('빈 제목이면 나가지 않고 입력이 열린 채다 (D6)', async () => {
    const api = await open()

    fireEvent.click(rootButton())
    typeAndEnter('')

    expect(api.createMenu).not.toHaveBeenCalled()
    // 닫지 않는 것이 요점이다 — 닫으면 무엇이 잘못됐는지 모른 채 입력을 잃는다.
    expect(input()).toBeDefined()
  })

  /**
   * **«빈 상태»라는 것 자체를 값으로 둔다.** 메뉴가 하나라도 있으면 형제 루트를 만드는 길이
   * 이미 있으므로(`하위 메뉴` → `내어쓰기`) 이 버튼은 거기 있을 이유가 없다. 툴바로 올리는
   * 판으로 갈아타면 이 줄이 먼저 운다 — 그때 다시 읽어야 하는 것은
   * `panels/menu-tree.tsx`의 그 자리 주석과 `./toolbar-status-reach.test.tsx`의 열두 상태다.
   */
  it('메뉴가 하나라도 있으면 그 버튼이 없다', async () => {
    await open(oneMenu)

    expect(queryRootButton()).toBeNull()
    expect(within(treeRegion()).queryByText(EMPTY_TEXT)).toBeNull()
  })

  /**
   * **뷰 모드에서는 버튼이 없고 문장은 남는다.** 툴바·페이지 JSON·단축키와 같은 자리다
   * (`panels/menu-tree.tsx`의 `editable`) — 앞 판이 툴바를 뷰 모드에 남겨 `이름 변경`·
   * `옮기기`가 눌리던 사고가 이 저장소에 실제로 있었다. 문장을 남기는 것은 **읽는 사람도
   * 빈 상자가 왜 비었는지 알아야 하기 때문**이다.
   */
  it('뷰 모드에는 버튼이 없고 빈 상태 문장만 남는다', async () => {
    await open()

    fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))

    expect(queryRootButton()).toBeNull()
    expect(within(treeRegion()).getByText(EMPTY_TEXT)).toBeDefined()
  })

  /**
   * **이 갈래가 `run`을 지나는가 — 그 축을 이 케이스가 통째로 갖는다.**
   *
   * `run`이 주는 것이 둘이고 둘 다 여기서 잰다:
   *
   * 1. **잠금**(D2) — 조작이 나가 있는 동안 `busy`라 이 버튼도 꺼진다. 툴바 아홉과 **같은
   *    값**을 보는 것이 요점이다: 이 버튼만 살아 있으면 잠긴 화면에 눌리는 것이 하나
   *    남는다(`openInput`의 `inFlight` 가드가 요청은 막지만, 눌리는 버튼과 안 눌리는 버튼이
   *    섞인 화면이 된다).
   * 2. **재조회**(D1) — 낙관 적용이 없으므로 그것이 화면이 갱신되는 유일한 길이다. 이 갈래가
   *    `run` 밖에서 `api.createMenu`를 직접 부르면 요청은 나가고 화면은 빈 채로 남는다.
   *
   * **재조회만 재는 케이스를 따로 두지 않았다.** 처음에 그렇게 썼는데 **혼자 죽는 변조가
   * 없었다** — 이 케이스의 둘째 단언이 그것을 글자 그대로 삼키고, `run`을 우회하는 변조는
   * 둘을 **함께** 죽인다. 재는 척만 하는 자를 남기지 않는다.
   */
  it('조작이 나가 있는 동안 비활성이고, 끝나면 살아난다 — `run`을 지난다 (D1·D2)', async () => {
    const gate: { release: (() => void) | null } = { release: null }
    const api = await open(
      () => [],
      {
        createMenu: vi.fn(
          () =>
            new Promise<MenuNode>((resolve) => {
              gate.release = () => resolve(CREATED)
            }),
        ),
      },
    )

    fireEvent.click(rootButton())
    typeAndEnter('관리자')

    await waitFor(() => expect(rootButton().disabled).toBe(true))

    gate.release?.()
    await waitFor(() => expect(api.getTree).toHaveBeenCalledTimes(2))
    // 잠금이지 영구 비활성이 아니다.
    await waitFor(() => expect(rootButton().disabled).toBe(false))
  })
})
