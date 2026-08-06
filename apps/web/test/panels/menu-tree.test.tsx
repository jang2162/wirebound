/**
 * 좌측의 메뉴·페이지 트리와, 거기서 페이지를 여는 일.
 *
 * 모든 케이스가 `<App />`을 라우트째로 렌더한다. 트리만 떼어 내면 케이스가 짧아지지만,
 * 그러면 셸이 실패한 화면 위에서도 통과한다 — 이 브랜치에서 실제로 그 거짓 초록이 났다.
 * 그래서 트리를 보는 케이스는 전부 `openEditor()`로 시작해 **성공 대역에서만 나오는 두
 * 가지**를 먼저 기다린다: 프로젝트 이름(`getProject` 성공)과 메뉴 제목(`getTree` 성공).
 * 이름표(`메뉴·페이지 트리`)와 랜드마크는 두 조회가 실패해도 남으므로 증거가 되지 못한다.
 *
 * 실측(`apps/web/test` 전량): 아래 기본 가짜의 `getTree`를 실패하게 바꾸면 **이 파일의
 * 15케이스 중 13이 죽는다**(전부 `openEditor()`의 `findByText('회원관리')`에서). 살아남는
 * 것은 자기 손으로 `getTree`를 실패시키는 둘(`트리 조회에 실패하면…`·`서버가 이유를
 * 주지 않으면…`)뿐이고, 다른 파일은 하나도 죽지 않는다.
 *
 * 케이스를 번호로 부르지 않는다 — 사이에 하나를 끼워 넣는 순간 그 번호를 적은 주석이
 * 전부 거짓이 되기 때문이다(이 파일에서 실제로 그렇게 됐다).
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { useNavigate } from 'react-router'
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
 * `store.loadPage(...)`·`store.clearPage()` 대신 `CanvasFrame`의 로컬 `useState`에 문서와
 * `headSeq`를 담게 바꾼 변이에서 **스토어를 직접 보는 여섯 케이스만 죽고 나머지 91케이스
 * (다른 11개 파일 포함)가 전부 통과했다.**
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
 * 트리와 페이지에 서로 다른 것을 쓴다 — `페이지 조회에 실패하면…`이 둘을 가려야 한다.
 */
const TREE_MESSAGE = '메뉴 저장소가 응답하지 않습니다 [T8-TREE-9]'
const PAGE_MESSAGE = '이 페이지를 볼 권한이 없습니다 [T8-PAGE-10]'

/**
 * 화면의 문안을 여기 한 번 더 적는다. 구현에서 상수를 import하면 문안이 엉뚱하게 바뀌어도
 * 테스트가 따라가 버려서, 사용자가 보는 문장을 아무도 지키지 않게 된다.
 */
const TREE_UNKNOWN_FAILURE = '메뉴를 불러오지 못했습니다'
const PAGE_UNKNOWN_FAILURE = '페이지를 불러오지 못했습니다'
/** 페이지를 고르지 않은 캔버스의 안내. 페이지를 떠난 뒤 이 대역으로 돌아왔다는 증거로 쓴다. */
const NO_PAGE_NOTICE = '왼쪽 트리에서 페이지를 고르세요'
/** 조회 중인 캔버스의 문장. **전환 중**을 실제로 관측했다는 증거로 쓴다. */
const LOADING_NOTICE = '페이지를 불러오는 중…'

/**
 * 트리 한 벌. **배열의 삽입 순서를 `sortOrder`와 일부러 어긋나게 둔다 — 세 자리 전부:**
 * 최상위 메뉴(`주문관리`가 먼저 들어 있다), 한 메뉴의 페이지(`회원 상세`가 먼저),
 * 중첩 메뉴(`등급`이 먼저). 한쪽만 정렬하는 구현이 `sortOrder 순서대로 그린다`를 통과하지
 * 못하게 한다.
 *
 * `주문관리`는 페이지도 자식도 없다 — `페이지가 없는 메뉴도 그린다`가 보는 자리다.
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

/**
 * 브라우저의 뒤로 가기를 대신하는 버튼. 트리에는 페이지를 **떠나는** 길이 없어(링크는 전부
 * 다른 페이지로 간다) 테스트가 직접 놓는다 — `editor-shell.test.tsx`가 프로젝트 전환에
 * 같은 장치를 쓴다.
 *
 * `navigate(-1)`이다 — 특정 주소로 가는 것이 아니라 히스토리를 한 칸 되짚는다. 사용자가
 * 실제로 밟는 경로(페이지를 눌러 들어갔다가 뒤로)와 같아야 "돌아왔을 때"를 재는 뜻이 있다.
 */
function Back(): ReactElement {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => void navigate(-1)}>
      뒤로
    </button>
  )
}

/**
 * `extra`는 라우터 **안**에 함께 그릴 것이다(`<App />`의 형제). 화면에 없는 조작을
 * 테스트가 놓아야 할 때만 쓴다 — 넘기지 않으면 다른 케이스의 DOM은 한 글자도 달라지지
 * 않는다.
 */
function renderEditor(
  overrides: Partial<ApiClient> = {},
  route = '/projects/p-1',
  extra?: ReactNode,
): void {
  renderWithProviders(
    <>
      <App />
      {extra}
    </>,
    {
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
    },
  )
}

/** 셸과 트리가 **둘 다 성공 대역으로** 그려질 때까지 기다린다. */
async function openEditor(
  overrides: Partial<ApiClient> = {},
  route = '/projects/p-1',
  extra?: ReactNode,
): Promise<void> {
  renderEditor(overrides, route, extra)
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
 * 클래스가 바뀌면 빈 배열이 되어 `sortOrder 순서대로 그린다`가 요란하게 깨진다.
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

  it('다른 페이지를 여는 동안 스토어에 앞 페이지의 문서가 남지 않는다', async () => {
    // 두 번째 페이지의 응답을 붙잡아 둔다. 그래야 "주소는 새 페이지인데 아직 문서가 오지
    // 않은" 창을 멈춰 세우고 그 안에서 스토어를 볼 수 있다. 붙잡지 않으면 조회가 즉시
    // 끝나 이 창이 아예 관측되지 않는다.
    let release: () => void = () => {
      throw new Error('pg-detail 조회가 아직 시작되지 않았습니다')
    }
    await openEditor(
      {
        getPage: async (projectId, pageId) => {
          asked.push([projectId, pageId])
          const page = PAGES[pageId]
          if (page === undefined) throw new Error(`가짜 서버가 모르는 페이지: ${pageId}`)
          if (pageId !== 'pg-detail') return page
          return new Promise<PageDetail>((resolve) => {
            release = () => resolve(page)
          })
        },
      },
      '/projects/p-1/pages/pg-list',
    )

    // 성공 대역 증거: 앞 페이지는 실제로 실렸다. 이것이 없으면 애초에 문서를 싣지 않는
    // 구현이 아래 `toBeNull()`을 그냥 통과한다.
    await waitFor(() => {
      expect(shellStore().getState().document).toBe(PAGES['pg-list']?.schema)
    })
    expect(shellStore().getState().headSeq).toBe(7)

    fireEvent.click(screen.getByRole('link', { name: '회원 상세' }))

    // **전환 중이라는 증거 둘.** 주소는 이미 새 페이지이고, 캔버스는 조회 대역이다.
    // 둘 다 없으면 이 케이스는 "아직 클릭이 반영되지 않은 순간"을 재고 있을 수 있다.
    expect(currentPath()).toBe('/projects/p-1/pages/pg-detail')
    await within(canvas()).findByText(LOADING_NOTICE)

    // 이 순간 스토어가 앞 페이지의 문서를 들고 있으면, 주소는 `pg-detail`인데 문서를
    // 스토어에서 읽는 쪽(태스크 9의 캔버스·구조 트리·속성 패널)은 `pg-list`를 그린다.
    // `headSeq`도 함께 본다 — P2b-2가 그 값을 `baseSeq`로 쓰므로, 남으면 앞 페이지의
    // revision 위에서 새 페이지의 편집 요청이 만들어진다.
    expect(shellStore().getState().document).toBeNull()
    expect(shellStore().getState().headSeq).toBe(0)

    // 그리고 붙잡아 둔 응답을 놓으면 새 페이지가 실린다 — **비우기만 하고 싣지 않는**
    // 구현이 위 두 줄만으로는 통과한다.
    release()
    await waitFor(() => {
      expect(shellStore().getState().document).toBe(PAGES['pg-detail']?.schema)
    })
    expect(shellStore().getState().headSeq).toBe(12)
  })

  it('앞 페이지의 응답이 늦게 와도 새 페이지의 문서를 덮어쓰지 않는다', async () => {
    // 위 케이스가 전환 **창**을 재는 것과 달리 여기는 전환이 **끝난 뒤**를 잰다.
    // 두 페이지의 응답을 각각 붙잡아 두고 **순서를 어겨** 놓는다 — 뒤 페이지를 먼저,
    // 앞 페이지를 나중에. 조회 두 건이 동시에 떠 있으면 서버가 요청 순서대로 답한다는
    // 보장이 없으므로 실제로 나는 순서다.
    const held: Record<string, (() => void) | undefined> = {}
    function release(pageId: string): void {
      const resolve = held[pageId]
      if (resolve === undefined) throw new Error(`조회가 아직 시작되지 않았습니다: ${pageId}`)
      resolve()
    }

    await openEditor(
      {
        getPage: async (projectId, pageId) => {
          asked.push([projectId, pageId])
          const page = PAGES[pageId]
          if (page === undefined) throw new Error(`가짜 서버가 모르는 페이지: ${pageId}`)
          return new Promise<PageDetail>((resolve) => {
            held[pageId] = () => resolve(page)
          })
        },
      },
      '/projects/p-1/pages/pg-list',
    )

    // 앞 페이지의 조회가 떠 있고 아직 응답이 없다.
    expect(asked).toEqual([['p-1', 'pg-list']])
    await within(canvas()).findByText(LOADING_NOTICE)

    fireEvent.click(screen.getByRole('link', { name: '회원 상세' }))

    // **두 조회가 동시에 떠 있다는 증거.** 앞 페이지의 것을 아직 놓지 않았으므로 이 뒤에
    // 오는 것이 진짜 "늦게 온 앞 페이지의 응답"이다.
    expect(currentPath()).toBe('/projects/p-1/pages/pg-detail')
    await waitFor(() => {
      expect(asked).toEqual([
        ['p-1', 'pg-list'],
        ['p-1', 'pg-detail'],
      ])
    })

    // 뒤 페이지가 먼저 도착한다. 여기까지가 양성 대조 — 새 페이지는 실제로 실렸다.
    release('pg-detail')
    await waitFor(() => {
      expect(shellStore().getState().document).toBe(PAGES['pg-detail']?.schema)
    })
    expect(shellStore().getState().headSeq).toBe(12)

    // 그리고 **뒤늦게** 앞 페이지의 응답이 온다.
    release('pg-list')
    // 그 응답이 화면 쪽까지 실제로 도달할 시간을 준다. `waitFor`로는 잴 수 없다 — 이미
    // 참인 단언 앞에서는 한 번도 양보하지 않고 그대로 통과하므로, 늦은 응답이 닿기 전에
    // 재고 끝날 수 있다. 매크로태스크를 하나 실제로 건너뛰면 그 사이 프라미스 연쇄는
    // 전부 흘러간다.
    await act(async () => {
      await new Promise((resolve) => {
        setTimeout(resolve, 0)
      })
    })

    // 스토어는 여전히 **주소가 가리키는** 페이지의 것이다. 이것이 없으면 사용자는
    // `pg-detail`의 주소·선택 표시 아래에서 `pg-list`의 문서를 편집하게 되고, P2b-2에서는
    // 그 `headSeq: 7` 위에서 편집 요청이 만들어진다.
    expect(shellStore().getState().document).toBe(PAGES['pg-detail']?.schema)
    expect(shellStore().getState().headSeq).toBe(12)
  })

  it('페이지를 떠나 pageId 없는 주소로 돌아오면 스토어의 문서가 비워진다', async () => {
    await openEditor({}, '/projects/p-1', <Back />)

    fireEvent.click(screen.getByRole('link', { name: '회원 상세' }))

    // **성공 대역이 실제로 쓰였다는 증거를 먼저 못박는다.** 이것 없이 뒤의 `toBeNull()`만
    // 보면 애초에 문서를 싣지 않는 구현이 통과한다 — 비운 적이 없는데 비어 있으니까.
    await waitFor(() => {
      expect(shellStore().getState().document).toBe(PAGES['pg-detail']?.schema)
    })
    expect(shellStore().getState().headSeq).toBe(12)

    // 브라우저 뒤로 가기. 주소에서 `pageId`가 사라진다.
    fireEvent.click(screen.getByRole('button', { name: '뒤로' }))
    expect(currentPath()).toBe('/projects/p-1')

    // 화면은 안내로 돌아가는데 스토어에 앞 페이지의 문서가 남으면, 문서를 스토어에서 읽는
    // 쪽(태스크 9)이 열려 있지 않은 페이지를 그린다. `headSeq`도 함께 본다 — P2b-2의
    // `baseSeq`가 그 값이라, 문서만 비우고 seq를 남기면 열린 페이지 없이 편집 요청이 만들어진다.
    await waitFor(() => {
      expect(shellStore().getState().document).toBeNull()
    })
    expect(shellStore().getState().headSeq).toBe(0)
    // 그리고 캔버스가 정말 안내 대역이다 — 스토어만 보면 화면이 앞 페이지에 멈춘 구현과
    // 갈리지 않는다.
    within(canvas()).getByText(NO_PAGE_NOTICE)
  })

  it('다른 페이지의 조회가 실패하면 앞 페이지의 문서가 남지 않는다', async () => {
    await openEditor(
      {
        getPage: async (projectId, pageId) => {
          asked.push([projectId, pageId])
          // `pg-detail`만 실패한다. 앞 페이지(`pg-list`)는 성공해야 "남지 않는다"를 잴 수 있다.
          if (pageId === 'pg-detail') throw new ApiError(404, 'not-found', PAGE_MESSAGE)
          const page = PAGES[pageId]
          if (page === undefined) throw new Error(`가짜 서버가 모르는 페이지: ${pageId}`)
          return page
        },
      },
      '/projects/p-1/pages/pg-list',
    )

    // 성공 대역 증거: 앞 페이지는 실제로 실렸다.
    await waitFor(() => {
      expect(shellStore().getState().document).toBe(PAGES['pg-list']?.schema)
    })
    expect(shellStore().getState().headSeq).toBe(7)

    fireEvent.click(screen.getByRole('link', { name: '회원 상세' }))

    // **실패 대역이 실제로 그려졌다는 증거를 먼저 세운다.** 화면이 비우는 자리는 조회
    // **시작** 시점이므로, 이것이 없으면 이 케이스는 "비웠고 아직 응답이 안 왔다"까지만
    // 재고 **실패한 뒤에 앞 페이지의 문서를 되살려 놓는** 구현을 놓친다. 바로 위
    // `다른 페이지를 여는 동안…`이 그 앞 창을, 여기가 그 뒤를 맡는다.
    await screen.findByText(PAGE_MESSAGE)
    within(canvas()).getByText(PAGE_MESSAGE)

    // 열지 못한 페이지의 자리에 앞 페이지의 문서가 남아 있으면, 오류를 보면서 다른 페이지의
    // 문서를 편집하는 상태가 된다.
    expect(shellStore().getState().document).toBeNull()
    expect(shellStore().getState().headSeq).toBe(0)
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
    // 그 메뉴가 그려졌다는 증거는 `menuItem()` 자신이다 — 제목을 못 찾으면 던진다.
    const order = menuItem('주문관리')
    // 그리고 그 안에 링크가 없다. 빈 메뉴에 페이지가 새어 들어온 구현과, 메뉴 제목 자체를
    // 누를 수 있게 만든 구현이 여기서 죽는다(실측: 제목을 `<Link>`로 바꾸면 이 줄과
    // `메뉴와 그 아래 페이지를 함께 그린다`의 양성 대조, 둘이 함께 죽는다).
    expect(within(order).queryAllByRole('link')).toEqual([])
    // 그리고 그 메뉴가 트리의 제자리에 있다(`sortOrder 순서대로 그린다`의 순서에서 마지막).
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
    // 그리고 트리 내용은 없다. 이것이 `openEditor()`로 시작하는 케이스들이 기다리는
    // 성공 대역의 증거다.
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
    // 트리는 남는다. **`getPage` 실패를 화면 전체 에러로 만든 구현은 이 줄에 닿지 못하고
    // `openEditor()`에서 먼저 죽는다** — 셸 대신 오류 화면이 뜨면 `openEditor()`가 기다리는
    // 성공 대역의 증거 둘(프로젝트 이름·메뉴 제목)이 함께 사라지기 때문이다.
    //
    // **둘 중 어느 줄에서 죽는지는 그 구현을 어떻게 쓰느냐에 달렸다.** 실측 둘: 조회
    // 자체를 셸의 이펙트로 올린 변이는 `findByRole('heading')`에서, 실패만 셸로 올린
    // 변이(셸이 한 번 뜬 뒤 오류로 바뀐다)는 `findByText('회원관리')`에서 죽는다.
    // 변이를 가로질러 변하지 않는 것은 **여기까지 오지 못한다**는 것뿐이라 그것만 적는다.
    //
    // 이 단언이 잡는 것은 **셸은 남기고 트리의 `region` 랜드마크만 지운** 구현이다
    // (실측: 트리의 `<section aria-label>`을 `<div>`로 바꾸면 이 케이스는 `treeRegion()`
    // 자신에서 죽는다). "트리 자리"라고만 적으면 "트리의 내용을 지운다"로도 읽히는데,
    // 그 구현에서는 `openEditor()`가 먼저 죽어 이 줄이 발화하지 않는다.
    within(treeRegion()).getByRole('link', { name: '회원 목록' })
    // 한 줄이 아니라 트리 전체가 남았다. 순서까지 보지 않는 것은 그것이
    // `sortOrder 순서대로 그린다`의 몫이기 때문이다 — 여기서 함께 보면 정렬을 깨뜨렸을 때
    // 이 케이스도 같이 죽어 어느 변이가 무엇을 잡았는지 흐려진다(실측: 그렇게 두었더니
    // 정렬 제거 변이가 두 케이스를 함께 죽였다).
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
