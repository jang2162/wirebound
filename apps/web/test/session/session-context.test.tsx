/**
 * 앱 전역 세션 상태의 계약. **이 파일의 중심은 요청 수를 세는 것이다.**
 *
 * 앞 판은 `RequireAuth`와 `RedirectWhenAuthenticated`가 각자 `useSession()`을 불러 각자
 * `me()`를 요청했다. 그래서 `me`는 성공하는데 다른 조회가 `unauthenticated`를 내는 상태에서
 * 두 화면이 서로를 무한히 튕겼다. **고치기 전에 이 하네스로 실측했다** — `me`가 늘 성공하고
 * `listProjects`가 `unauthenticated`를 던지는 가짜로 `<App />`을 `/`에 렌더하면 800ms 동안
 * `me` 7070 · 6694 · 7928회(3회 실행), `list` 3535 · 3347 · 3964회다. 인위로 끊지 않으면
 * `act`가 돌아오지 않아 vitest의 5000ms 타임아웃까지 `me` 60,623회를 세고 **정착하지 않는다.**
 * 대조군(`listProjects`가 성공)은 같은 하네스에서 `me` 1 · `list` 1로 `/`에 정착한다 —
 * 그 대조가 없으면 7000회가 순환인지 하네스의 부하인지 구분되지 않는다.
 *
 * 그래서 아래 케이스 둘이 이 파일의 방어선이다: `한 번만 불린다`와 `로그인 화면에서 멈춘다`.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactElement, ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../src/app'
import type { ApiClient } from '../../src/api/client'
import { ApiProvider } from '../../src/api/context'
import type { ProjectDetail, SessionUser } from '../../src/api/types'
import {
  SessionProvider,
  useConfirmSession,
  useInvalidateSession,
  useSessionState,
} from '../../src/session/session-context'
import { RedirectWhenAuthenticated, RequireAuth } from '../../src/routes/require-auth'
import { currentPath, fakeApi, renderWithProviders, unauthenticatedError } from '../helpers'

const USER: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }

/** 목록 화면이 **성공한 조회에서만** 그리는 문자열. 제목은 실패해도 뜨므로 이름을 본다. */
const PROJECT_NAME = '내 설계서 [P2B2-T1-도착지]'
const PROJECTS: ProjectDetail[] = [
  { id: 'p-1', name: PROJECT_NAME, slug: 'mine', description: null, role: 'owner' },
]

/** 보호된 자리가 열렸다는 증거. 문지기가 통과시킨 것 말고는 나올 길이 없는 문자열이다. */
const PROTECTED = '보호된 내용 [P2B2-T1]'

/**
 * 이 파일 전용 위치 탐침. `helpers.tsx`의 것은 `renderWithProviders` 안에만 있는데,
 * 아래 케이스 몇은 `<App />` 대신 문지기 둘을 직접 렌더한다 — 그때 주소를 읽는 통로다.
 */
function PathProbe(): ReactElement {
  return <span data-testid="session-path">{useLocation().pathname}</span>
}

function probedPath(): string {
  return screen.getByTestId('session-path').textContent ?? ''
}

/** `SessionProvider` 안에서 임의의 트리를 렌더한다. `<App />`을 쓰지 않는 케이스용이다. */
function renderInSession(ui: ReactNode, options: { client: ApiClient; route?: string }): void {
  render(
    <ApiProvider client={options.client}>
      <MemoryRouter initialEntries={[options.route ?? '/']}>
        <SessionProvider>{ui}</SessionProvider>
        <PathProbe />
      </MemoryRouter>
    </ApiProvider>,
  )
}

/** 세션을 끊는 버튼. 훅은 Provider 안에서만 부를 수 있으므로 컴포넌트로 감싼다. */
function InvalidateButton(): ReactElement {
  const invalidate = useInvalidateSession()
  return (
    <button type="button" onClick={invalidate}>
      무효화
    </button>
  )
}

/**
 * 무효화의 짝. 확정이 멱등인지 재는 케이스가 쓴다.
 *
 * **`onClick={confirm}`으로 바로 넘기지 못한다** — P5-1이 `confirm`을 넓혀 `SessionUser`를
 * 받게 했기 때문이다(그래야 갓 로그인한 사람이 자기가 누구인지 안다). 클릭 이벤트가
 * 사용자로 흘러들지 않게 감싼다.
 */
function ConfirmButton(): ReactElement {
  const confirm = useConfirmSession()
  return (
    <button type="button" onClick={() => confirm(USER)}>
      확정
    </button>
  )
}

describe('SessionProvider', () => {
  it('me는 앱이 뜨는 동안 한 번만 불린다', async () => {
    let meCalls = 0
    const client = fakeApi({
      me: async () => {
        meCalls += 1
        return USER
      },
    })

    // 문지기 **둘 다** 마운트한다. 앞 판에서는 이 트리가 `me`를 두 번 불렀다 — 각자
    // 자기 훅으로 물었기 때문이다. 상태가 하나면 몇이 보든 요청은 하나다.
    renderInSession(
      <>
        <RequireAuth>
          <span>{PROTECTED}</span>
        </RequireAuth>
        <RedirectWhenAuthenticated>
          <span>로그인 폼</span>
        </RedirectWhenAuthenticated>
      </>,
      { client },
    )

    await screen.findByText(PROTECTED)
    expect(meCalls).toBe(1)
  })

  it('me가 성공하는데 조회가 unauthenticated면 로그인 화면에서 멈춘다', async () => {
    // **순환 재현 케이스.** 이 조합이 이월 문서 §1의 상태다 — 서버가 `/auth/me`는
    // 성공시키면서 다른 엔드포인트는 세션이 없다고 답한다.
    let meCalls = 0
    let listCalls = 0
    const client = fakeApi({
      me: async () => {
        meCalls += 1
        return USER
      },
      listProjects: async () => {
        listCalls += 1
        throw unauthenticatedError()
      },
    })

    renderWithProviders(<App />, { client, route: '/' })

    await screen.findByLabelText('이메일')
    const settled = meCalls

    // **시간을 흘려야 정착을 볼 수 있다.** `waitFor`는 조건이 이미 참이면 곧바로
    // 돌아오므로 "그 뒤로 늘지 않는다"를 재지 못한다. 순환이 살아 있으면 이 50ms
    // 동안 수백 회가 더 쌓인다(위 머리말의 실측: 800ms에 7000회 남짓).
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))
    })

    expect(meCalls).toBe(settled)
    expect(meCalls).toBeLessThan(10)
    expect(listCalls).toBeLessThan(10)
    expect(currentPath()).toBe('/login')
  })

  it('무효화하면 로그인 화면이 뜬다', async () => {
    const client = fakeApi({ me: async () => USER })

    renderInSession(
      <>
        <RequireAuth>
          <span>{PROTECTED}</span>
        </RequireAuth>
        <InvalidateButton />
      </>,
      { client },
    )

    await screen.findByText(PROTECTED)

    fireEvent.click(screen.getByRole('button', { name: '무효화' }))

    // 보호된 내용이 사라지고 로그인 주소로 옮겨 갔다. 둘을 함께 보는 것은, 주소만
    // 보면 내용을 그대로 둔 채 옮기는 구현도 통과하기 때문이다.
    expect(screen.queryByText(PROTECTED)).toBeNull()
    expect(probedPath()).toBe('/login')
  })

  it('무효화한 뒤에는 me를 다시 묻지 않는다', async () => {
    let meCalls = 0
    const client = fakeApi({
      me: async () => {
        meCalls += 1
        return USER
      },
    })

    renderInSession(
      <>
        <RequireAuth>
          <span>{PROTECTED}</span>
        </RequireAuth>
        <RedirectWhenAuthenticated>
          <span>로그인 폼</span>
        </RedirectWhenAuthenticated>
        <InvalidateButton />
      </>,
      { client },
    )

    await screen.findByText(PROTECTED)
    expect(meCalls).toBe(1)

    fireEvent.click(screen.getByRole('button', { name: '무효화' }))
    await screen.findByText('로그인 폼')

    // **왕복이 상태를 바꾸지 못한다는 것이 순환을 닫는 이유다.** 로그인 화면이 다시
    // 물으면 성공하고, 성공하면 되돌아가고, 그것이 §1의 엔진이었다.
    expect(meCalls).toBe(1)
  })

  it('로그인에 성공하면 다시 authenticated가 된다', async () => {
    // `me`는 **끝까지 401이다.** 그러므로 목록에 도착했다면 로그인이 상태를 되돌린
    // 것이지 세션을 다시 물어서가 아니다. 재조회로 되살리는 구현은 여기서 죽는다.
    let meCalls = 0
    const client = fakeApi({
      me: async () => {
        meCalls += 1
        throw unauthenticatedError()
      },
      login: async () => USER,
      listProjects: async () => PROJECTS,
    })

    renderWithProviders(<App />, { client, route: '/login' })
    await screen.findByLabelText('이메일')

    fireEvent.change(screen.getByLabelText('이메일'), { target: { value: 'me@example.com' } })
    fireEvent.change(screen.getByLabelText('비밀번호'), { target: { value: 'pw-1234' } })
    fireEvent.click(screen.getByRole('button', { name: '로그인' }))

    await screen.findByText(PROJECT_NAME)
    expect(currentPath()).toBe('/')
    expect(meCalls).toBe(1)
  })

  it('이미 anonymous면 무효화가 상태를 교체하지 않는다', async () => {
    // 스토어의 `#apply`와 같은 이유다 — 값이 같은데 참조를 바꾸면 구독자가 헛일을 한다.
    // 여기서는 `SignedOut`이 렌더될 때마다 무효화를 부르므로, 두 번째 호출이 상태를
    // 갈아치우면 그 자리가 렌더 루프가 된다.
    let renders = 0
    function StatusProbe(): ReactElement {
      renders += 1
      const state = useSessionState()
      return <span data-testid="status">{state.status}</span>
    }

    renderInSession(
      <>
        <StatusProbe />
        <InvalidateButton />
      </>,
      { client: fakeApi({ me: async () => Promise.reject(unauthenticatedError()) }) },
    )

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('anonymous')
    })
    const settled = renders

    fireEvent.click(screen.getByRole('button', { name: '무효화' }))
    fireEvent.click(screen.getByRole('button', { name: '무효화' }))

    expect(screen.getByTestId('status').textContent).toBe('anonymous')
    expect(renders).toBe(settled)
  })

  it('이미 authenticated면 확정이 상태를 교체하지 않는다', async () => {
    // 위 케이스의 짝이다. **리뷰가 이 계약을 "재지 않았다"고 지목해서 더했다** — 독스트링이
    // "이미 `authenticated`면 아무 일도 하지 않는다"고 적고 있었는데, 그것을
    // `setState({ status: 'authenticated' })`로 바꿔 멱등성을 깨도 죽는 케이스가 0개였다.
    //
    // 오늘 `confirm`을 두 번 부르는 자리는 없다(`login.tsx`가 성공에 한 번 부른다).
    // 그래도 재 두는 것은, 무효화 쪽이 정확히 그런 자리(`SignedOut`이 렌더될 때마다
    // 부른다)를 갖게 되면서 다리가 됐기 때문이다 — 확정 쪽도 그런 호출자가 생기면
    // 같은 자리가 렌더 루프가 된다.
    let renders = 0
    function StatusProbe(): ReactElement {
      renders += 1
      const state = useSessionState()
      return <span data-testid="status">{state.status}</span>
    }

    renderInSession(
      <>
        <StatusProbe />
        <ConfirmButton />
      </>,
      { client: fakeApi({ me: async () => USER }) },
    )

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated')
    })
    const settled = renders

    fireEvent.click(screen.getByRole('button', { name: '확정' }))
    fireEvent.click(screen.getByRole('button', { name: '확정' }))

    expect(screen.getByTestId('status').textContent).toBe('authenticated')
    expect(renders).toBe(settled)
  })

  it('Provider 밖에서 useSessionState를 부르면 던진다', () => {
    // 기본값을 `null`로 둔 의도다(P2b-1의 `useApi`·`useEditorStoreInstance`와 같은 관례).
    // 빈 상태를 기본값으로 두면 Provider를 빠뜨린 트리가 조용히 로그인 화면을 그린다.
    function Orphan(): ReactElement {
      const state = useSessionState()
      return <span>{state.status}</span>
    }

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() => render(<Orphan />)).toThrow(/SessionProvider/)
    } finally {
      consoleError.mockRestore()
    }
  })

  it('Provider 밖에서 useConfirmSession을 부르면 던진다', () => {
    // 세 훅이 같은 컨텍스트를 읽으므로 하나만 막아 두고 나머지를 열어 두면, 빠뜨린
    // Provider가 "아무 일도 안 일어나는 로그인"으로 나타난다.
    function Orphan(): ReactElement {
      const confirm = useConfirmSession()
      return (
        <button type="button" onClick={() => confirm(USER)}>
          확정
        </button>
      )
    }

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() => render(<Orphan />)).toThrow(/SessionProvider/)
    } finally {
      consoleError.mockRestore()
    }
  })
})
