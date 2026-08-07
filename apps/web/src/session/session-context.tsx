/**
 * 앱 전역에 하나뿐인 세션 상태.
 *
 * **왜 컨텍스트인가.** 앞 판은 `RequireAuth`와 `RedirectWhenAuthenticated`가 각자
 * `useSession()`을 불러 **각자 `me()`를 요청했다.** 그래서 `/`와 `/login`을 오갈 때마다
 * 판정이 새로 났고, `me`가 성공하는데 다른 요청이 `unauthenticated`를 내는 상태에서는
 * 두 화면이 서로를 무한히 튕겼다(이월 문서 §1). **그 순환을 이 커밋의 하네스로 다시
 * 실측했다** — `<App />`을 `/`에 렌더하고 `listProjects`만 `unauthenticated`를 던지게 하면
 * 800ms 동안 `me` 7070 · 6694 · 7928회(3회 실행)이고, 인위로 끊지 않으면 vitest의 5000ms
 * 타임아웃까지 60,623회를 세며 **정착하지 않는다.** 같은 하네스의 대조군(`listProjects`
 * 성공)은 `me` 1회로 `/`에 정착한다.
 *
 * 상태가 하나면 왕복이 그것을 바꾸지 못하므로 순환이 성립하지 않는다.
 *
 * **`me()`는 마운트에 한 번뿐이다.** 자동 재시도가 없는 것은 앞 판과 같다 — 재시도가
 * 있으면 서버가 계속 실패하는 동안 요청이 쌓인다.
 *
 * **바깥에서 상태를 바꾸는 길은 둘뿐이다:** `useInvalidateSession()`(끊긴 것을 알았다)과
 * `useConfirmSession()`(로그인이 성공했다). 둘 다 인자를 받지 않는다 — `login()`이
 * `SessionUser`를 돌려주지만 그 값을 쓰는 화면이 아직 없고, 필요해지면 그때 넓힌다.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { useApi } from '../api/context'
import { toFailure } from '../api/failure'

export type SessionState =
  | { status: 'pending' }
  | { status: 'authenticated' }
  | { status: 'anonymous' }
  | { status: 'failed'; message: string }

/**
 * 세션 확인이 실패했는데 서버가 이유를 주지 않은 경우에 쓸 문장.
 *
 * `routes/require-auth.tsx`가 실패 화면의 제목으로도 쓴다 — 판정과 문안이 갈리면
 * 사용자가 보는 이유와 코드가 가른 이유가 어긋난다.
 */
export const UNKNOWN_SESSION_FAILURE = '세션을 확인하지 못했습니다'

/**
 * 상태 값을 모듈 상수로 두는 것이 계약이다. `invalidate`가 이미 `anonymous`인 상태에
 * **같은 참조**를 돌려줘야 React가 리렌더를 건너뛴다 — 매번 `{ status: 'anonymous' }`를
 * 새로 만들면 `SignedOut`이 렌더될 때마다 무효화를 부르는 자리(`api/failure.tsx`)가
 * 렌더 루프가 된다. 스토어의 `#apply`가 참조 비교를 하는 것과 같은 이유다.
 */
const PENDING: SessionState = { status: 'pending' }
const AUTHENTICATED: SessionState = { status: 'authenticated' }
const ANONYMOUS: SessionState = { status: 'anonymous' }

interface SessionContextValue {
  state: SessionState
  invalidate: () => void
  confirm: () => void
}

/**
 * 기본값이 `null`인 것은 의도다(`api/context.tsx`·`store/use-editor-store.tsx`와 같은 관례).
 * `{ status: 'anonymous' }` 같은 것을 기본값으로 두면 Provider를 빠뜨린 트리가 조용히
 * 로그인 화면을 그리고, 원인이 어디였는지 남지 않는다.
 */
const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider(props: { children: ReactNode }): ReactElement {
  const api = useApi()
  const [state, setState] = useState<SessionState>(PENDING)

  useEffect(() => {
    // 응답이 오기 전에 Provider가 사라지면 결과를 버린다. 사라진 컴포넌트의 상태를
    // 갱신하면 아무 일도 일어나지 않는다.
    let alive = true
    api.me().then(
      () => {
        if (alive) setState(AUTHENTICATED)
      },
      (caught: unknown) => {
        if (!alive) return
        // **"세션이 끊겼다"의 정의는 `api/failure.tsx`가 갖는다.** 여기와 네 조회 자리가
        // 같은 판정을 써야, 한쪽이 로그인으로 보내는 실패를 다른 쪽이 오류 문장으로
        // 그리는 어긋남이 생기지 않는다.
        //
        // `status`가 아니라 `code`로 가른다. 서버는 같은 401을 여러 이유로 낼 수 있으므로
        // `unauthenticated`가 아닌 실패는 "로그아웃됨"이 아니라 `failed`다.
        const failure = toFailure(caught, UNKNOWN_SESSION_FAILURE)
        setState(
          failure.kind === 'signed-out' ? ANONYMOUS : { status: 'failed', message: failure.message },
        )
      },
    )
    return () => {
      alive = false
    }
  }, [api])

  // **순환을 닫는 다리는 아래 `current.status === 'anonymous' ? current : ANONYMOUS`다.**
  // 그것을 `setState({ status: 'anonymous' })`로 바꿔 매번 새 객체를 만들게 하면
  // `이미 anonymous면 무효화가 상태를 교체하지 않는다`가 죽는다(실측 1 사망).
  //
  // **`useCallback`은 겹치는 방어다 — 하중이 아니다.** 걷어내 참조를 불안정하게 만들어도
  // 죽는 케이스가 **0개**이고, 위 상태 교체와 **동시에** 깨도 `Maximum update depth`가
  // 나지 않고 죽는 것은 상태 교체 쪽이 죽이는 그 하나뿐이다(실측). 그래도 두는 것은
  // `SignedOut`이 `useEffect(invalidate, [invalidate])`로 부르기 때문이다 — 참조가 렌더마다
  // 바뀌면 그 이펙트가 커밋마다 다시 돈다. 즉 헛일을 줄이는 것이지 순환을 막는 것이 아니다.
  const invalidate = useCallback(() => {
    setState((current) => (current.status === 'anonymous' ? current : ANONYMOUS))
  }, [])

  const confirm = useCallback(() => {
    setState((current) => (current.status === 'authenticated' ? current : AUTHENTICATED))
  }, [])

  const value = useMemo(() => ({ state, invalidate, confirm }), [state, invalidate, confirm])

  return <SessionContext.Provider value={value}>{props.children}</SessionContext.Provider>
}

function useSessionContext(): SessionContextValue {
  const value = useContext(SessionContext)
  if (value === null) throw new Error('세션 훅은 SessionProvider 안에서만 부를 수 있습니다')
  return value
}

/** 지금 세션 상태. Provider 밖에서 부르면 던진다. */
export function useSessionState(): SessionState {
  return useSessionContext().state
}

/** 세션이 끊긴 것을 알았을 때 부른다. 이미 `anonymous`면 아무 일도 하지 않는다. */
export function useInvalidateSession(): () => void {
  return useSessionContext().invalidate
}

/**
 * 로그인이 성공한 것을 알았을 때 부른다. 이미 `authenticated`면 아무 일도 하지 않는다.
 *
 * **이 훅이 없으면 로그인이 끊긴다.** 세션이 전역 상태 하나가 되면서 `me()`를 다시 묻는
 * 일이 없어졌으므로, 로그인 성공을 알리는 길이 따로 필요하다. 앞 판에서는 `RequireAuth`가
 * 마운트마다 `me()`를 새로 불러 그 일이 저절로 됐고, 그것이 바로 이 커밋이 없앤 것이다.
 */
export function useConfirmSession(): () => void {
  return useSessionContext().confirm
}
