/**
 * 에디터 셸의 틀과 상단 도구. 세 패널의 **자리**만 검사한다 — 메뉴·구조 트리와 캔버스
 * 내용·속성 패널은 각자의 파일이 잰다.
 *
 * 모든 케이스가 `<App />`을 라우트째로 렌더한다. 셸만 떼어 내 스토어를 직접 쥐면 케이스가
 * 짧아지지만, 그러면 `getProject`가 실패했을 때도 통과해 버린다 — 자리 표시자와 새 화면이
 * 같은 heading을 쓰면 조회가 실패해도 단언이 오류 화면 위에서 통과하는 거짓 초록이 난다.
 * 그래서 셸을 보는 케이스는 전부 `openShell()`로
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
 * 움직인다. 셋을 각각 `EditorShell`의 로컬 `useState`로 승격시킨 변이는 화면만 보는 단언을
 * **하나도 죽이지 못한다.** 캔버스는 이 값들을 스토어에서 읽으므로, 여기서 못박지 않으면
 * 배선이 끊긴 채로 화면만 초록이다.
 *
 * **그 변이 셋은 각각 둘을 죽인다**: 아래 스토어를 보는 단언 하나씩과, 캔버스 케이스
 * 하나씩(`canvas/canvas.test.tsx`의 `뷰 모드에서는 아웃라인이
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
    screen.getByRole('complementary', { name: '우측 패널' })
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
    // 접히는 것은 구조 트리뿐이다. 설계서 「설계서 화면 구조」에서 뷰 모드의 메뉴 트리는 사라지는 것이
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
    // 토글이 모드를 자기 `useState`에 들고 스토어에 쓰지 않게 바꾸면 이 줄과 아래 마지막
    // 줄에서 죽는다 — 이 두 줄이 없으면 그 변이가 살아남는다.
    expect(screen.queryByRole('region', { name: '구조 트리' })).toBeNull()
    // 그리고 그 한 곳이 **스토어**다. 위 두 줄은 셸 전체가 공유하는 로컬 상태로도
    // 만족되므로(그 변이는 화면만 보는 단언을 전부 통과한다 — 머리말) 여기서
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
    // "멤버가 아님"이 둘 다 404다(설계서 「권한 모델」).
    renderShell(async () => Promise.reject(new ApiError(404, 'not-found', SERVER_MESSAGE)))

    await screen.findByText(SERVER_MESSAGE)
    // 셸 **대신** 오류다. 세 랜드마크가 오류 위에 남아 있으면 위 케이스들이 실패한
    // 조회에서도 통과한다.
    expect(screen.queryByRole('navigation', { name: '메뉴와 구조' })).toBeNull()
    expect(screen.queryByRole('main', { name: '캔버스' })).toBeNull()
    expect(screen.queryByRole('complementary', { name: '우측 패널' })).toBeNull()
    expect(screen.queryByText(PROJECT_NAME)).toBeNull()
  })

  it('세션이 끊긴 실패면 로그인 화면으로 보낸다', async () => {
    // **여기가 가장 아픈 자리다** — 에디터에 들어와 있는 동안 서버가 세션을
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
    // 설계서 「설계서 화면 구조」의 여섯 값을 여기 다시 적는다. 구현이 쓰는 `VIEWPORT_PRESETS`를 테스트도
    // import하면 프리셋이 잘못 바뀌어도 테스트가 따라가 버린다.
    //
    // **`within(select)`로 좁힌다.** 문서 전체의 `option`을 훑으면 다른 `<select>`의
    // 선택지까지 섞인다 — 이 케이스가 재려는 것은 **이 `<select>`의 선택지**이지
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
    // 고른 폭이 스토어에 들어간다. 위 두 줄은 셸의 로컬 상태로도 만족된다 — 캔버스는
    // 이 값을 스토어에서 읽으므로 거기까지 못박아야 배선이 이어진다.
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
    // 흉내 내도 통과한다(그 변이는 화면만 보는 단언을 전부 통과한다 — 머리말).
    expect(shellStore().getState().zoom).toBe(1.25)

    // 되돌아온다. 확대만 보면 "누르면 125%로 고정"인 구현도 통과한다.
    fireEvent.click(screen.getByRole('button', { name: '축소' }))

    screen.getByText('100%')
    expect(shellStore().getState().zoom).toBe(1)
  })
})

/**
 * # 화면 맞춤 — **누른 순간의 폭 ÷ 뷰포트 폭**
 *
 * ## jsdom에는 레이아웃이 없다 — 그래서 치수를 심는다
 *
 * `clientWidth`는 jsdom에서 언제나 0이고 `getComputedStyle`은 `shell.css`를 읽지 않는다
 * (그 파일은 `main.tsx`가 import 한다). 그래서 이 블록은 캔버스 칸에 **`shell.css`가 실제로
 * 거는 값**을 심는다 — `padding: 24px`(그 파일의 `.wb-shell-canvas`)와 폭 하나.
 *
 * **심은 값이 곧 이 케이스의 하중이다.** `padding`을 심는 이유는 그것을 빼는지 재기
 * 위해서다: 900 − 48 = 852를 1280으로 나눈 **0.665625**와, 안 뺐을 때 나오는 900/1280 =
 * **0.703125**가 다른 값이라 구현이 갈린다.
 *
 * **`getBoundingClientRect`가 아니라 `clientWidth`를 쓰는 결정은 여기서 재지 못한다** —
 * jsdom은 둘 다 0을 내고 스크롤바가 없다. 근거는 `routes/editor.tsx`의 `fitZoom` 머리말에
 * 있고, 브라우저 실측으로 확인했다.
 */
describe('화면 맞춤', () => {
  /**
   * `shell.css`가 캔버스 칸에 거는 값을 심는다. 돌려주는 것은 폭을 바꾸는 손잡이다.
   *
   * **프레임의 `margin-left`는 심지 않는다** — jsdom에서 `''`이고, 그 자리는 아래
   * `가운데 정렬한 만큼을 뺀다` 하나가 따로 심는다.
   */
  function measurable(clientWidth: number): (next: number) => void {
    const canvas = screen.getByRole('main', { name: '캔버스' })
    canvas.style.padding = '24px'
    let width = clientWidth
    Object.defineProperty(canvas, 'clientWidth', { configurable: true, get: () => width })
    return (next) => {
      width = next
    }
  }

  it('캔버스에 들어가는 폭으로 배율을 맞춘다 — padding을 뺀 값이다', async () => {
    await openShell()
    measurable(900)

    expect(shellStore().getState().zoom).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: '화면 맞춤' }))

    // (900 − 24 − 24) / 1280. **`padding`을 안 뺐다면 0.703125다** — 그 구현은 여기서 죽는다.
    expect(shellStore().getState().zoom).toBe(0.665625)
    expect(canvasFrame().style.transform).toBe('scale(0.665625)')
    screen.getByText('67%')
  })

  /**
   * **분모가 뷰포트 폭이라는 것과, 한계는 스토어가 안다는 것을 한 케이스에서 잰다.**
   * 852/375 = 2.272는 `MAX_ZOOM`(2) 밖이라 스토어가 자른다 — 버튼이 자르지 않는다.
   */
  it('뷰포트 폭이 분모다 — 한계를 넘으면 스토어가 자른다', async () => {
    await openShell()
    measurable(900)

    fireEvent.change(screen.getByLabelText('뷰포트 폭'), { target: { value: '375' } })
    fireEvent.click(screen.getByRole('button', { name: '화면 맞춤' }))

    // 852/375 = 2.272. 화면이 자르지 않았다면 스토어가 2로 자른 이 값이 나온다.
    expect(shellStore().getState().zoom).toBe(2)
    screen.getByText('200%')
  })

  /**
   * **창 크기를 따라가지 않는다.** 맞춘 뒤 칸이 넓어져도 배율은 그대로다 — 따라다니면
   * 사용자가 손으로 맞춘 배율까지 창을 흔들 때마다 빼앗긴다.
   */
  it('맞춘 뒤 창이 바뀌어도 배율은 그대로다 — 1회 계산이다', async () => {
    await openShell()
    const resize = measurable(900)

    fireEvent.click(screen.getByRole('button', { name: '화면 맞춤' }))
    expect(shellStore().getState().zoom).toBe(0.665625)

    resize(1600)
    fireEvent(window, new Event('resize'))

    // 리스너가 걸려 있었다면 (1600 − 48)/1280 = 1.2125가 된다.
    expect(shellStore().getState().zoom).toBe(0.665625)

    // 그래도 **다시 누르면** 새 폭으로 맞춘다 — 값을 캐시해 둔 구현과 갈린다.
    fireEvent.click(screen.getByRole('button', { name: '화면 맞춤' }))
    expect(shellStore().getState().zoom).toBe(1.2125)
  })

  /**
   * **가운데 정렬한 만큼은 확대가 쓸 수 없다.** 프레임이 칸보다 좁으면 `margin: 0 auto`가
   * 그것을 가운데 세우는데, `transform-origin`이 좌상단이라 확대는 **그 자리에서 오른쪽으로만**
   * 자란다 — 왼쪽 여백은 남고 오른쪽으로 그만큼 넘친다.
   *
   * **브라우저에서 잰 값이다**(창 1100 · 프리셋 375 · 쓸 수 있는 폭 486): 여백을 안 빼면
   * 130%가 나오고 프레임 오른쪽이 칸 밖으로 **31px** 나간다. 여백(55.5px)을 빼면
   * (486−55.5)/375 = 115%이고 오른쪽 끝이 칸의 끝과 정확히 같다.
   *
   * 여기서는 같은 형태를 값만 바꿔 심는다: 852 − 100 = 752를 375로 나눈 **2.005**가
   * `MAX_ZOOM`(2) 밖이라 스토어가 자른다 — 그래서 100이 아니라 **200**을 심어
   * 자르지 않는 값(1.738…)이 나오게 한다.
   */
  it('가운데 정렬한 만큼을 뺀다 — 확대는 오른쪽으로만 자란다', async () => {
    await openShell()
    measurable(900)
    canvasFrame().style.marginLeft = '200px'

    fireEvent.change(screen.getByLabelText('뷰포트 폭'), { target: { value: '375' } })
    fireEvent.click(screen.getByRole('button', { name: '화면 맞춤' }))

    // (900 − 48 − 200) / 375. **여백을 안 뺐다면 852/375 = 2.272이고 스토어가 2로 자른다.**
    expect(shellStore().getState().zoom).toBeCloseTo(652 / 375, 10)
    expect(shellStore().getState().zoom).not.toBe(2)
  })

  /**
   * **재지 못하면 아무것도 안 한다.** 심는 폭이 0이다 — `padding`은 그대로라 실제
   * 브라우저에서 캔버스가 `display: none`일 때의 모양이고, 그때 나오는 값은 852가 아니라
   * **−48**이다. 그대로 `setZoom`에 넘기면 스토어가 `MIN_ZOOM`으로 잘라 **아무 이유 없이
   * 25%가 된다** — 재지 못한 것과 *"폭이 25%다"*는 다른 사실이다.
   *
   * **치수를 아예 안 심는 판(순수 jsdom)은 이 결정을 재지 못한다.** 그때는 계산된
   * `padding`이 없어 `usable`이 `NaN`이 되고, `fitZoom`의 가드를 지워도 **스토어의 NaN
   * 가드가 대신 막는다**(가드를 지워도 이 파일의 케이스가 전부 통과한다).
   * 그래서 이 케이스는 폭만 0으로 심는다.
   */
  it('잴 수 없으면 줌을 건드리지 않는다', async () => {
    await openShell()
    measurable(0)

    fireEvent.click(screen.getByRole('button', { name: '화면 맞춤' }))

    expect(shellStore().getState().zoom).toBe(1)
    screen.getByText('100%')
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
