/**
 * 좌측의 메뉴·페이지 트리와, 거기서 페이지를 여는 일.
 *
 * 모든 케이스가 `<App />`을 라우트째로 렌더한다. 트리만 떼어 내면 케이스가 짧아지지만,
 * 그러면 셸이 실패한 화면 위에서도 통과한다 — 이 브랜치에서 실제로 그 거짓 초록이 났다.
 * 그래서 트리를 보는 케이스는 전부 `openEditor()`로 시작해 **성공 대역에서만 나오는 두
 * 가지**를 먼저 기다린다: 프로젝트 이름(`getProject` 성공)과 메뉴 제목(`getTree` 성공).
 * 이름표(`메뉴·페이지 트리`)와 랜드마크는 두 조회가 실패해도 남으므로 증거가 되지 못한다.
 *
 * 실측: 아래 기본 가짜의 `getTree`를 실패하게 바꾸면 **케이스 1~8이 전부 죽는다**(케이스
 * 10도 함께 죽는다 — 그쪽도 트리가 남았는지를 본다). 살아남는 것은 자기 손으로 `getTree`를
 * 실패시키는 두 케이스(9·11)뿐이다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { PageDetail, ProjectDetail, SessionUser, TreeMenuNode } from '../../src/api/types'
import { App } from '../../src/app'
import type { EditorStore } from '../../src/store/editor-store'
import { currentPath, fakeApi, renderWithProviders } from '../helpers'

/**
 * 셸이 만든 `EditorStore` 인스턴스를 손에 쥐는 장치. 태스크 7이 같은 이유로 둔 것을
 * (`test/routes/editor-shell.test.tsx`) 여기서도 쓴다.
 *
 * **화면만 보는 단언으로는 "문서가 스토어에 실린다"를 지킬 수 없다.** 트리나 캔버스가
 * 받아온 문서를 자기 `useState`에 들고 그것으로 그리면 화면은 똑같이 움직인다. 실측:
 * `store.loadPage(...)` 대신 `CanvasFrame`의 로컬 `useState`에 문서와 `headSeq`를 담게 바꾼
 * 변이에서 **스토어를 직접 보는 두 케이스(5·7)만 죽고 나머지 아홉은 전부 통과했다.**
 * 화면만 보는 단언은 그 변이를 하나도 잡지 못한다는 뜻이다. 태스크 9의 캔버스는 문서를
 * 스토어에서 읽으므로, 여기서 못박지 않으면 배선이 끊긴 채로 다음 태스크가 시작된다.
 *
 * 셸에 테스트 전용 prop을 뚫지 않는다. 그러면 `<App />`을 라우트째 렌더하는 구조를
 * 포기해야 하는데, 그 구조가 위 주석이 말한 거짓 초록을 막는 장치다. 대신 스토어 모듈을
 * 가로채 **셸이 `new` 하는 그 인스턴스**를 기록한다. 화면 코드는 한 줄도 바뀌지 않는다.
 */
const { createdStores } = vi.hoisted(() => ({ createdStores: [] as unknown[] }))

vi.mock('../../src/store/editor-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/store/editor-store')>()
  return {
    ...actual,
    EditorStore: class extends actual.EditorStore {
      constructor() {
        super()
        createdStores.push(this)
      }
    },
  }
})

/** 셸이 지금 들고 있는 스토어. 셸이 떠 있는 동안에만 쓸 수 있다. */
function shellStore(): EditorStore {
  const store = createdStores.at(-1)
  if (store === undefined) throw new Error('셸이 EditorStore를 만들지 않았습니다')
  return store as EditorStore
}

const USER: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }

/** 성공한 `getProject`에서만 화면에 나오는 문자열. 셸이 떴다는 증거로 쓴다. */
const PROJECT_NAME = '관리자 콘솔 설계서'

const PROJECT: ProjectDetail = {
  id: 'p-1',
  name: PROJECT_NAME,
  slug: 'admin-console',
  description: null,
  role: 'owner',
}

/**
 * 서버가 준 문장이 그대로 오는지 보려면 화면이 하드코딩할 리 없는 문자열이어야 한다.
 * 트리와 페이지에 서로 다른 것을 쓴다 — 케이스 10이 둘을 가려야 한다.
 */
const TREE_MESSAGE = '메뉴 저장소가 응답하지 않습니다 [T8-TREE-9]'
const PAGE_MESSAGE = '이 페이지를 볼 권한이 없습니다 [T8-PAGE-10]'

/**
 * 화면의 문안을 여기 한 번 더 적는다. 구현에서 상수를 import하면 문안이 엉뚱하게 바뀌어도
 * 테스트가 따라가 버려서, 사용자가 보는 문장을 아무도 지키지 않게 된다.
 */
const TREE_UNKNOWN_FAILURE = '메뉴를 불러오지 못했습니다'
const PAGE_UNKNOWN_FAILURE = '페이지를 불러오지 못했습니다'

/**
 * 트리 한 벌. **배열의 삽입 순서를 `sortOrder`와 일부러 어긋나게 둔다 — 세 자리 전부:**
 * 최상위 메뉴(`주문관리`가 먼저 들어 있다), 한 메뉴의 페이지(`회원 상세`가 먼저),
 * 중첩 메뉴(`등급`이 먼저). 한쪽만 정렬하는 구현이 케이스 3을 통과하지 못하게 한다.
 *
 * `주문관리`는 페이지도 자식도 없다 — 케이스 8이 보는 자리다.
 *
 * 호출마다 새로 만든다. 구현이 응답 배열을 제자리에서 정렬해도 다음 케이스의 입력 순서가
 * 바뀌지 않게 하기 위해서다.
 */
function tree(): TreeMenuNode[] {
  return [
    { id: 'm-order', title: '주문관리', sortOrder: 1, pages: [], children: [] },
    {
      id: 'm-member',
      title: '회원관리',
      sortOrder: 0,
      pages: [
        { id: 'pg-detail', title: '회원 상세', sortOrder: 1 },
        { id: 'pg-list', title: '회원 목록', sortOrder: 0 },
      ],
      children: [
        {
          id: 'm-grade',
          title: '등급',
          sortOrder: 1,
          pages: [{ id: 'pg-grade', title: '등급 정책', sortOrder: 0 }],
          children: [],
        },
        {
          id: 'm-auth',
          title: '권한',
          sortOrder: 0,
          pages: [{ id: 'pg-auth', title: '권한 관리', sortOrder: 0 }],
          children: [],
        },
      ],
    },
  ]
}

/** 화면에 나와야 하는 순서. 메뉴는 자기 페이지를 먼저, 그다음 자식 메뉴를 품는다. */
const EXPECTED_ROWS = [
  '회원관리',
  '회원 목록',
  '회원 상세',
  '권한',
  '권한 관리',
  '등급',
  '등급 정책',
  '주문관리',
]

function pageDetail(id: string, title: string, headSeq: number, rootId: string): PageDetail {
  return {
    id,
    menuNodeId: 'm-member',
    title,
    description: null,
    sortOrder: 0,
    schemaVersion: 1,
    headSeq,
    schema: { version: 1, root: { id: rootId, type: 'Page', children: [] } },
  }
}

/**
 * `getPage`가 돌려줄 것들. **`headSeq`를 페이지마다 다르게, 그리고 전부 0이 아니게 둔다** —
 * 0은 스토어의 초기값이라 그 값을 쓰면 "싣지 않았다"와 구분되지 않고, 값이 같으면 엉뚱한
 * 페이지를 실은 구현도 통과한다.
 */
const PAGES: Record<string, PageDetail> = {
  'pg-list': pageDetail('pg-list', '회원 목록', 7, 'n_00000000000a'),
  'pg-detail': pageDetail('pg-detail', '회원 상세', 12, 'n_00000000000b'),
  'pg-auth': pageDetail('pg-auth', '권한 관리', 31, 'n_00000000000c'),
  'pg-grade': pageDetail('pg-grade', '등급 정책', 5, 'n_00000000000d'),
}

/** `getPage`가 무엇으로 불렸는지. 트리가 아니라 주소가 페이지를 정한다는 것을 본다. */
let asked: string[][] = []

beforeEach(() => {
  createdStores.length = 0
  asked = []
})

function renderEditor(overrides: Partial<ApiClient> = {}, route = '/projects/p-1'): void {
  renderWithProviders(<App />, {
    client: fakeApi({
      me: async () => USER,
      getProject: async () => PROJECT,
      getTree: async () => tree(),
      getPage: async (projectId, pageId) => {
        asked.push([projectId, pageId])
        const page = PAGES[pageId]
        if (page === undefined) throw new Error(`가짜 서버가 모르는 페이지: ${pageId}`)
        return page
      },
      ...overrides,
    }),
    route,
  })
}

/** 셸과 트리가 **둘 다 성공 대역으로** 그려질 때까지 기다린다. */
async function openEditor(overrides: Partial<ApiClient> = {}, route = '/projects/p-1'): Promise<void> {
  renderEditor(overrides, route)
  await screen.findByRole('heading', { name: PROJECT_NAME })
  await screen.findByText('회원관리')
}

function treeRegion(): HTMLElement {
  return screen.getByRole('region', { name: '메뉴·페이지 트리' })
}

function canvas(): HTMLElement {
  return screen.getByRole('main', { name: '캔버스' })
}

/**
 * 트리에 그려진 줄의 제목을 **문서 순서대로**.
 *
 * 역할 조회로는 메뉴(제목뿐)와 페이지(링크)를 한 줄에 세울 수 없어 클래스로 모은다.
 * 클래스가 바뀌면 빈 배열이 되어 케이스 3이 요란하게 깨진다.
 */
function treeRows(): string[] {
  const rows = treeRegion().querySelectorAll<HTMLElement>('.wb-shell-tree-menu, .wb-shell-tree-page')
  return [...rows].map((row) => row.textContent ?? '')
}

/** 제목이 붙은 메뉴의 `<li>`. 그 안에 무엇이 들었는지가 "함께 그린다"의 증거다. */
function menuItem(title: string): HTMLElement {
  const item = within(treeRegion()).getByText(title).closest('li')
  if (item === null) throw new Error(`메뉴 항목을 찾지 못했습니다: ${title}`)
  return item
}

/** 지금 선택 표시가 붙은 줄의 제목. 표시가 하나뿐인지 보는 데 쓴다. */
function markedRows(): string[] {
  const marked = treeRegion().querySelectorAll<HTMLElement>('[aria-current]')
  return [...marked].map((row) => row.textContent ?? '')
}

describe('메뉴·페이지 트리', () => {
  it('메뉴와 그 아래 페이지를 함께 그린다', async () => {
    await openEditor()

    // 페이지가 메뉴 **안에** 있어야 한 트리다(설계 §9). 화면 어딘가에 둘 다 있다는
    // 단언은 메뉴 목록과 페이지 목록을 따로 그린 구현도 통과한다.
    const member = menuItem('회원관리')
    within(member).getByRole('link', { name: '회원 목록' })
    within(member).getByRole('link', { name: '회원 상세' })

    // 양성 대조: 아무 메뉴에나 모든 페이지를 붙인 구현이 아니다.
    expect(within(menuItem('주문관리')).queryByRole('link')).toBeNull()
  })

  it('중첩 메뉴를 깊이대로 그린다', async () => {
    await openEditor()

    const member = menuItem('회원관리')
    const auth = menuItem('권한')

    // 자식 메뉴는 부모 **안**이다. 최상위에 평평하게 늘어놓은 구현과 갈린다.
    expect(member.contains(auth)).toBe(true)
    expect(auth).not.toBe(member)
    // 그리고 그 자식 메뉴가 자기 페이지를 품는다 — 깊이가 1에서 멈추지 않는다.
    within(auth).getByRole('link', { name: '권한 관리' })
  })

  it('sortOrder 순서대로 그린다', async () => {
    await openEditor()

    // 입력은 세 자리 모두 어긋난 순서다(`tree()` 주석). 정렬을 최상위·페이지·자식 중
    // 어느 하나만 구현해도 이 단언이 깨진다.
    expect(treeRows()).toEqual(EXPECTED_ROWS)
  })

  it('페이지를 누르면 URL에 pageId가 실린다', async () => {
    await openEditor()

    // 양성 대조: 처음에는 페이지가 열려 있지 않다.
    expect(currentPath()).toBe('/projects/p-1')

    fireEvent.click(screen.getByRole('link', { name: '회원 상세' }))

    expect(currentPath()).toBe('/projects/p-1/pages/pg-detail')
  })

  it('페이지를 누르면 스토어에 문서와 headSeq가 실린다', async () => {
    await openEditor()

    // 양성 대조: 누르기 전에는 비어 있다.
    expect(shellStore().getState().document).toBeNull()

    fireEvent.click(screen.getByRole('link', { name: '회원 상세' }))

    // **화면이 아니라 스토어를 본다.** 화면만 보면 받아온 문서를 컴포넌트의 로컬
    // `useState`에 든 구현도 통과한다(파일 상단 장치 주석의 실측).
    await waitFor(() => {
      expect(shellStore().getState().document).toBe(PAGES['pg-detail']?.schema)
    })
    expect(shellStore().getState().headSeq).toBe(12)
    // 서버 조회가 그 페이지로 갔다는 것까지. 스토어의 값만 보면 트리가 들고 있던
    // 무언가를 그대로 실은 구현과 갈리지 않는다.
    expect(asked).toEqual([['p-1', 'pg-detail']])
  })

  it('선택된 페이지가 시각적으로 구분된다', async () => {
    await openEditor()

    // 양성 대조: 누르기 전에는 아무 줄에도 표시가 없다.
    expect(markedRows()).toEqual([])

    fireEvent.click(screen.getByRole('link', { name: '회원 상세' }))

    // 표시는 `aria-current="page"`다. 색은 `shell.css`의
    // `.wb-shell-tree-page[aria-current='page']`가 이 속성에 건다 — jsdom은 스타일시트를
    // 싣지 않으므로 **이 테스트가 보는 것은 속성뿐이고 색이 아니다.**
    expect(screen.getByRole('link', { name: '회원 상세' }).getAttribute('aria-current')).toBe('page')
    // 음성 대조: 다른 페이지에는 표시가 없다. 그리고 표시가 붙은 줄은 하나뿐이다 —
    // 모든 줄에 표시를 다는 구현이 위 단언만으로는 통과한다.
    expect(screen.getByRole('link', { name: '회원 목록' }).getAttribute('aria-current')).toBeNull()
    expect(markedRows()).toEqual(['회원 상세'])
  })

  it('URL에 pageId가 있는 채로 들어오면 그 페이지를 연다', async () => {
    // 새로고침·주소 공유. 누른 적이 없어도 열려야 한다.
    await openEditor({}, '/projects/p-1/pages/pg-auth')

    await waitFor(() => {
      expect(shellStore().getState().document).toBe(PAGES['pg-auth']?.schema)
    })
    expect(shellStore().getState().headSeq).toBe(31)
    expect(asked).toEqual([['p-1', 'pg-auth']])
    // 선택 표시도 주소에서 나온다 — 누른 것을 기억하는 로컬 상태가 아니다.
    expect(markedRows()).toEqual(['권한 관리'])
  })

  it('페이지가 없는 메뉴도 그린다', async () => {
    await openEditor()

    // `pages: []`·`children: []`인 메뉴다. 페이지를 가진 메뉴만 그리는 구현과 갈린다.
    const order = menuItem('주문관리')
    within(order).getByText('주문관리')
    expect(within(order).queryAllByRole('link')).toEqual([])
    // 그리고 그 메뉴가 트리의 제자리에 있다(케이스 3의 순서에서 마지막).
    expect(treeRows()).toContain('주문관리')
  })

  it('트리 조회에 실패하면 서버 메시지를 보여준다', async () => {
    // `status`가 아니라 `code`로 가르는 서버 규약대로 403을 쓴다.
    renderEditor({ getTree: async () => Promise.reject(new ApiError(403, 'forbidden', TREE_MESSAGE)) })

    await screen.findByText(TREE_MESSAGE)
    // 메시지는 트리 자리에 있다.
    within(treeRegion()).getByText(TREE_MESSAGE)
    // 한 실패가 화면 전체를 죽이지 않는다 — 셸은 그대로다.
    screen.getByRole('heading', { name: PROJECT_NAME })
    screen.getByRole('main', { name: '캔버스' })
    // 그리고 트리 내용은 없다. 이것이 위 케이스 1~8이 기다리는 성공 대역의 증거다.
    expect(screen.queryByText('회원관리')).toBeNull()
  })

  it('페이지 조회에 실패하면 트리는 남고 캔버스 자리에만 에러가 뜬다', async () => {
    await openEditor(
      { getPage: async () => Promise.reject(new ApiError(404, 'not-found', PAGE_MESSAGE)) },
      '/projects/p-1/pages/pg-list',
    )

    await screen.findByText(PAGE_MESSAGE)
    // 에러가 뜨는 자리는 캔버스다.
    within(canvas()).getByText(PAGE_MESSAGE)
    // 트리는 남는다. `getPage` 실패를 화면 전체 에러로 만든 구현은 여기서 죽는다 —
    // 트리 자리 자체가 사라지므로 `treeRegion()`이 던진다.
    within(treeRegion()).getByRole('link', { name: '회원 목록' })
    // 한 줄이 아니라 트리 전체가 남았다. 순서까지 보지 않는 것은 그것이 케이스 3의
    // 몫이기 때문이다 — 여기서 함께 보면 정렬을 깨뜨렸을 때 이 케이스도 같이 죽어
    // 어느 변이가 무엇을 잡았는지 흐려진다(실측: 그렇게 두었더니 정렬 제거 변이가
    // 케이스 3과 10을 함께 죽였다).
    expect(treeRows()).toHaveLength(EXPECTED_ROWS.length)
    screen.getByRole('heading', { name: PROJECT_NAME })
    // 그리고 트리 자리에는 이 에러가 없다. 두 실패의 자리가 섞이지 않는다.
    expect(within(treeRegion()).queryByText(PAGE_MESSAGE)).toBeNull()
  })

  it('서버가 이유를 주지 않으면 화면이 가진 문장을 쓴다', async () => {
    // `http-client`가 네트워크 단절도 `ApiError`로 번역하지만, 화면이 보는 것은
    // `ApiClient` 인터페이스이지 그 구현이 아니다. `ApiError`가 아닌 값이 와도
    // 사용자에게 내부 문자열이 아니라 읽을 수 있는 문장이 가야 한다.
    renderEditor(
      {
        getTree: async () => Promise.reject(new TypeError('Failed to fetch')),
        getPage: async () => Promise.reject(new TypeError('Failed to fetch')),
      },
      '/projects/p-1/pages/pg-list',
    )

    await screen.findByText(TREE_UNKNOWN_FAILURE)
    await screen.findByText(PAGE_UNKNOWN_FAILURE)
    expect(screen.queryByText(/Failed to fetch/)).toBeNull()
  })
})
