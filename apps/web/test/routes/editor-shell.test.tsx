/**
 * 에디터 셸의 틀과 상단 도구. 세 패널의 **자리**만 검사한다 — 메뉴·구조 트리는 태스크 8이,
 * 캔버스 내용과 속성 패널은 태스크 9가 채운다.
 *
 * 모든 케이스가 `<App />`을 라우트째로 렌더한다. 셸만 떼어 내 스토어를 직접 쥐면 케이스가
 * 짧아지지만, 그러면 `getProject`가 실패했을 때도 통과해 버린다 — 이 브랜치에서 실제로
 * 그 거짓 초록이 났다(자리 표시자와 새 화면이 같은 heading을 써서, 조회가 실패해도
 * 단언 다섯 개가 오류 화면 위에서 통과했다). 그래서 셸을 보는 케이스는 전부 `openShell()`로
 * 시작해 **성공한 조회에서만 나오는 프로젝트 이름**을 먼저 기다린다.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, useNavigate } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app'
import { ApiError, type ApiClient } from '../../src/api/client'
import { ApiProvider } from '../../src/api/context'
import type { ProjectDetail, SessionUser } from '../../src/api/types'
import type { EditorStore } from '../../src/store/editor-store'
import {
  currentPath,
  expiringSession,
  fakeApi,
  renderWithProviders,
  unauthenticatedError,
} from '../helpers'

/**
 * 셸이 만든 `EditorStore` 인스턴스를 손에 쥐는 장치.
 *
 * **화면만 보는 단언으로는 "상태가 스토어에 들어간다"를 지킬 수 없다.** 셸이 모드·줌·
 * 뷰포트 폭을 자기 `useState`로 들고 화면의 두 자리를 그 값으로 그리면 화면은 똑같이
 * 움직인다. 실측: 셋을 각각 `EditorShell`의 로컬 `useState`로 승격시킨 변이 셋이 이
 * 장치가 없던 판(태스크 7 시점)을 **한 케이스도 죽이지 못하고 전부 통과했다.** 태스크 9의
 * 캔버스는 이 값들을 스토어에서 읽으므로, 여기서 못박지 않으면 배선이 끊긴 채로 다음
 * 태스크가 시작된다.
 *
 * **지금 그 변이 셋은 각각 둘을 죽인다**(마지막 fix 웨이브에서 다시 쟀다): 아래 스토어를
 * 보는 단언 하나씩과, 태스크 9가 더한 캔버스 케이스 하나씩(`뷰 모드에서는 아웃라인이
 * 없다`·`줌이 transform으로 적용된다`·`뷰포트 폭이 캔버스에 적용된다`). **분모는 적지
 * 않는다** — 케이스를 더할 때마다 어긋난다.
 *
 * 셸에 테스트 전용 prop을 뚫지 않는다. 그러면 `<App />`을 라우트째 렌더하는 구조를
 * 포기해야 하는데(라우트 표가 주는 것은 props 없는 element다), 그 구조가 위 주석이 말한
 * 거짓 초록을 막는 장치다. 대신 스토어 모듈을 가로채 **셸이 `new` 하는 그 인스턴스**를
 * 기록한다. 화면 코드는 한 줄도 바뀌지 않는다.
 *
 * 하위 클래스인 것은 `EditorStore`의 메서드가 프로토타입이 아니라 화살표 필드이기
 * 때문이다(`editor-store.ts`의 주석 참고) — 프로토타입에 스파이를 걸 자리가 없다.
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

beforeEach(() => {
  createdStores.length = 0
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

/**
 * 서버가 준 문장이 그대로 오는지 보려면 화면이 하드코딩할 리 없는 문자열이어야 한다.
 * 그럴듯한 문안을 박아 넣은 구현도 통과하는 테스트는 아무것도 지키지 못한다.
 */
const SERVER_MESSAGE = '설계서 저장소가 응답하지 않습니다 [T7-SHELL-6]'

/**
 * 화면의 문안을 여기 한 번 더 적는다. 구현에서 상수를 import하면 문안이 엉뚱하게 바뀌어도
 * 테스트가 따라가 버려서, 사용자가 보는 문장을 아무도 지키지 않게 된다.
 */
const UNKNOWN_FAILURE = '프로젝트를 불러오지 못했습니다'

function project(overrides: Partial<ProjectDetail> = {}): ProjectDetail {
  return {
    id: 'p-1',
    name: PROJECT_NAME,
    slug: 'admin-console',
    description: '내부 운영 도구',
    role: 'owner',
    ...overrides,
  }
}

function renderShell(getProject: ApiClient['getProject'], route = '/projects/p-1'): void {
  renderWithProviders(<App />, {
    client: fakeApi({ me: async () => USER, getProject }),
    route,
  })
}

/** 셸이 성공 대역으로 그려질 때까지 기다린다. 이 대기 자체가 성공 대역의 증거다. */
async function openShell(): Promise<void> {
  renderShell(async () => project())
  await screen.findByRole('heading', { name: PROJECT_NAME })
}

/**
 * 캔버스 프레임. 뷰포트 폭·줌이 실제 화면 치수로 이어졌는지 보는 자리다.
 * 클래스로 찾는 것은 이 요소에 접근성 이름을 붙일 이유가 없기 때문이다 — 이름이 없으면
 * 역할로는 잡히지 않는다. 클래스가 바뀌면 여기서 `null`이 되어 요란하게 깨진다.
 */
function canvasFrame(): HTMLElement {
  const frame = screen
    .getByRole('main', { name: '캔버스' })
    .querySelector<HTMLElement>('.wb-shell-canvas-frame')
  if (frame === null) throw new Error('캔버스 프레임을 찾지 못했습니다')
  return frame
}

describe('에디터 셸', () => {
  it('셸은 좌·중·우 세 영역을 그린다', async () => {
    await openShell()

    screen.getByRole('navigation', { name: '메뉴와 구조' })
    screen.getByRole('main', { name: '캔버스' })
    screen.getByRole('complementary', { name: '속성 패널' })
  })

  it('편집 모드에서는 구조 트리 자리가 보인다', async () => {
    await openShell()

    // 스토어의 초기 모드가 편집이다. 토글이 그것을 그대로 비추는지 함께 본다 —
    // 이것이 없으면 모드와 무관하게 늘 구조 트리를 그리는 구현도 통과한다.
    screen.getByRole('button', { name: '편집 모드', pressed: true })
    screen.getByRole('region', { name: '구조 트리' })
  })

  it('뷰 모드에서는 구조 트리 자리가 접힌다', async () => {
    await openShell()

    // 양성 대조: 누르기 전에는 있다. 이것이 없으면 구조 트리를 아예 그리지 않는
    // 구현도 아래 단언을 통과한다.
    screen.getByRole('region', { name: '구조 트리' })

    fireEvent.click(screen.getByRole('button', { name: '뷰 모드' }))

    expect(screen.queryByRole('region', { name: '구조 트리' })).toBeNull()
    // 접히는 것은 구조 트리뿐이다. 설계 §9에서 뷰 모드의 메뉴 트리는 사라지는 것이
    // 아니라 좌측 전체를 쓴다.
    screen.getByRole('region', { name: '메뉴·페이지 트리' })
  })

  it('모드 토글을 누르면 모드가 바뀐다', async () => {
    await openShell()

    const edit = screen.getByRole('button', { name: '편집 모드' })
    const view = screen.getByRole('button', { name: '뷰 모드' })
    expect(edit.getAttribute('aria-pressed')).toBe('true')
    expect(view.getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(view)

    expect(edit.getAttribute('aria-pressed')).toBe('false')
    expect(view.getAttribute('aria-pressed')).toBe('true')
    // 토글과 좌측 트리는 서로 다른 자리다. **둘이 함께 움직여야** 모드가 한 곳에
    // 모여 있다고 할 수 있다.
    //
    // 실측: 토글이 모드를 자기 `useState`에 들고 스토어에 쓰지 않게 바꾸면 이 줄과
    // 아래 마지막 줄에서 죽는다. 이 두 줄이 없던 판에서는 그 변이가 살아남았다.
    expect(screen.queryByRole('region', { name: '구조 트리' })).toBeNull()
    // 그리고 그 한 곳이 **스토어**다. 위 두 줄은 셸 전체가 공유하는 로컬 상태로도
    // 만족되므로(실측: 그 변이가 이 장치가 없던 판을 전부 통과했다 — 머리말) 여기서
    // 스토어를 직접 본다.
    expect(shellStore().getState().mode).toBe('view')

    // 되돌아오는 것까지 본다. 한 방향만 보면 "누르면 뷰 모드로 고정"인 구현도 통과한다.
    fireEvent.click(edit)

    expect(edit.getAttribute('aria-pressed')).toBe('true')
    screen.getByRole('region', { name: '구조 트리' })
    expect(shellStore().getState().mode).toBe('edit')
  })

  it('프로젝트 이름이 셸에 보인다', async () => {
    let asked: string | null = null
    renderShell(async (projectId) => {
      asked = projectId
      return project({ id: projectId, name: '고객 포털 설계서' })
    })

    await screen.findByRole('heading', { name: '고객 포털 설계서' })
    // 이름이 조회 결과에서 온다는 것을 못박는다. 경로의 id를 그대로 그리는 구현이라면
    // 위 단언이 통과하지 못한다.
    expect(asked).toBe('p-1')
  })

  it('프로젝트 조회에 실패하면 서버 메시지를 보여준다', async () => {
    // `status`가 아니라 `code`로 가르는 서버 규약대로 404를 쓴다 — "없는 프로젝트"와
    // "멤버가 아님"이 둘 다 404다(설계 §10).
    renderShell(async () => Promise.reject(new ApiError(404, 'not-found', SERVER_MESSAGE)))

    await screen.findByText(SERVER_MESSAGE)
    // 셸 **대신** 오류다. 세 랜드마크가 오류 위에 남아 있으면 위 케이스들이 실패한
    // 조회에서도 통과한다.
    expect(screen.queryByRole('navigation', { name: '메뉴와 구조' })).toBeNull()
    expect(screen.queryByRole('main', { name: '캔버스' })).toBeNull()
    expect(screen.queryByRole('complementary', { name: '속성 패널' })).toBeNull()
    expect(screen.queryByText(PROJECT_NAME)).toBeNull()
  })

  it('세션이 끊긴 실패면 로그인 화면으로 보낸다', async () => {
    // 설계 D5. **여기가 가장 아픈 자리다** — 에디터에 들어와 있는 동안 서버가 세션을
    // 지우면 문지기는 이미 통과했으므로 다시 판정하지 않는다. 이 판정이 없으면 화면에
    // 오류 문장만 뜨고 새로고침 말고는 로그인 화면에 갈 방법이 없다.
    renderWithProviders(<App />, {
      client: fakeApi({
        me: expiringSession(USER),
        getProject: async () => Promise.reject(unauthenticatedError()),
      }),
      route: '/projects/p-1',
    })

    await waitFor(() => {
      expect(currentPath()).toBe('/login')
    })
    // 양성 대조: 실제로 로그인 화면이다. 주소만 보면 빈 화면으로 보내는 구현도 통과한다.
    await screen.findByRole('heading', { name: 'wirebound' })
    // 오류 화면이 아니다 — 셸의 실패 제목이 남아 있으면 화면이 바뀐 것이 아니다.
    expect(screen.queryByText('설계서를 열지 못했습니다')).toBeNull()
  })

  it('서버가 이유를 주지 않으면 화면이 가진 문장을 쓴다', async () => {
    // `http-client`가 네트워크 단절도 `ApiError`로 번역하지만, 화면이 보는 것은
    // `ApiClient` 인터페이스이지 그 구현이 아니다. `ApiError`가 아닌 값이 와도
    // 사용자에게 내부 문자열이 아니라 읽을 수 있는 문장이 가야 한다.
    renderShell(async () => Promise.reject(new TypeError('Failed to fetch')))

    await screen.findByText(UNKNOWN_FAILURE)
    expect(screen.queryByText(/Failed to fetch/)).toBeNull()
  })

  it('뷰포트 프리셋 여섯 개를 고를 수 있다', async () => {
    await openShell()

    const select = screen.getByRole<HTMLSelectElement>('combobox', { name: '뷰포트 폭' })
    // 설계 §9의 여섯 값을 여기 다시 적는다. 구현이 쓰는 `VIEWPORT_PRESETS`를 테스트도
    // import하면 프리셋이 잘못 바뀌어도 테스트가 따라가 버린다.
    //
    // **`within(select)`로 좁힌다.** 앞서 `screen.getAllByRole('option')`으로 문서 전체를
    // 훑고 있었는데, 그때는 셸의 `<select>`가 이것 하나여서 같은 뜻이었다. P4b-3이 테마
    // 고르개를 머리에 두면서 갈렸다 — 이 케이스가 재려는 것은 **이 `<select>`의 선택지**이지
    // 화면에 있는 모든 선택지가 아니다.
    expect(within(select).getAllByRole('option').map((option) => option.textContent)).toEqual([
      '1920px',
      '1440px',
      '1280px',
      '1024px',
      '768px',
      '375px',
    ])
    // 스토어의 초기 폭. 양성 대조로도 쓴다 — 처음부터 375였다면 아래가 무의미하다.
    expect(select.value).toBe('1280')
    expect(canvasFrame().style.width).toBe('1280px')
    expect(shellStore().getState().viewportWidth).toBe(1280)

    fireEvent.change(select, { target: { value: '375' } })

    expect(select.value).toBe('375')
    expect(canvasFrame().style.width).toBe('375px')
    // 고른 폭이 스토어에 들어간다. 위 두 줄은 셸의 로컬 상태로도 만족된다 — 태스크 9의
    // 캔버스는 이 값을 스토어에서 읽으므로 거기까지 못박아야 배선이 이어진다.
    expect(shellStore().getState().viewportWidth).toBe(375)
  })

  it('줌을 바꾸면 스토어에 반영된다', async () => {
    await openShell()

    screen.getByText('100%')
    expect(canvasFrame().style.transform).toBe('scale(1)')
    expect(shellStore().getState().zoom).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: '확대' }))

    screen.getByText('125%')
    expect(screen.queryByText('100%')).toBeNull()
    expect(canvasFrame().style.transform).toBe('scale(1.25)')
    // 이름이 약속한 자리. 화면 세 줄은 셸이 줌을 자기 `useState`로 들고 클램프까지
    // 흉내 내도 통과한다(실측: 그 변이가 이 장치가 없던 판을 전부 통과했다 — 머리말).
    expect(shellStore().getState().zoom).toBe(1.25)

    // 되돌아온다. 확대만 보면 "누르면 125%로 고정"인 구현도 통과한다.
    fireEvent.click(screen.getByRole('button', { name: '축소' }))

    screen.getByText('100%')
    expect(shellStore().getState().zoom).toBe(1)
  })
})

/** 주소를 바꾸는 버튼. 셸에는 다른 프로젝트로 가는 길이 아직 없어 테스트가 직접 놓는다. */
function GoTo(props: { to: string }): ReactElement {
  const navigate = useNavigate()
  return (
    <button type="button" onClick={() => navigate(props.to)}>
      이동
    </button>
  )
}

/**
 * 프로젝트를 옮겨도 **셸은 다시 마운트되지 않는다.** 두 주소가 같은 라우트 컴포넌트를
 * 쓰기 때문이다(실측: 아래 두 단언은 셸이 자기 상태를 직접 지우지 않으면 각각 죽는다 —
 * `setState({ status: 'loading' })`를 빼면 앞 이름이 남고, `store.reset()`을 빼면 줌이
 * 125%로 남는다). 그래서 앞 프로젝트의 흔적을 지우는 일이 셸의 몫이다.
 *
 * `renderWithProviders`를 쓰지 않는 것은 그것이 라우터를 손에 쥐여 주지 않기 때문이다.
 */
describe('프로젝트 전환', () => {
  it('다른 프로젝트로 옮기면 앞 프로젝트의 이름과 편집 상태가 남지 않는다', async () => {
    // p-2의 응답을 붙잡아 둔다. 전환 직후의 빈틈이 이 테스트가 보려는 자리다.
    let deliver: (project: ProjectDetail) => void = () => {}
    const pending = new Promise<ProjectDetail>((resolve) => {
      deliver = resolve
    })

    render(
      <ApiProvider
        client={fakeApi({
          me: async () => USER,
          getProject: (id) =>
            id === 'p-1' ? Promise.resolve(project({ id, name: '일번 설계서' })) : pending,
        })}
      >
        <MemoryRouter initialEntries={['/projects/p-1']}>
          <App />
          <GoTo to="/projects/p-2" />
        </MemoryRouter>
      </ApiProvider>,
    )

    await screen.findByRole('heading', { name: '일번 설계서' })
    fireEvent.click(screen.getByRole('button', { name: '확대' }))
    screen.getByText('125%')

    fireEvent.click(screen.getByRole('button', { name: '이동' }))

    // p-2가 아직 오지 않았어도 p-1의 이름이 새 주소에 남아 있으면 안 된다.
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: '일번 설계서' })).toBeNull()
    })

    deliver(project({ id: 'p-2', name: '이번 설계서' }))

    await screen.findByRole('heading', { name: '이번 설계서' })
    // 줌·선택·문서는 프로젝트에 매인 값이다. 앞 프로젝트의 것이 남으면 안 된다.
    screen.getByText('100%')
  })
})
