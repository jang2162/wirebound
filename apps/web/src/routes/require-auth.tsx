/**
 * 세션이 있는지 확인하는 문지기.
 *
 * 세션 쿠키는 httpOnly라 JS가 읽지 못한다. **로그인 여부를 아는 방법은 `GET /auth/me`를
 * 실제로 불러 보는 것 하나뿐이다.** 로그인 결과를 `localStorage` 같은 곳에 적어 두면
 * 서버가 세션을 지운 뒤에도 로그인된 것처럼 보이고, 화면은 401만 받는 상태에 갇힌다.
 */
import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import { Navigate } from 'react-router'
import { ApiError } from '../api/client'
import { useApi } from '../api/context'

type SessionState =
  | { status: 'pending' }
  | { status: 'authenticated' }
  | { status: 'anonymous' }
  | { status: 'failed'; message: string }

/** 세션 확인이 실패했는데 서버가 이유를 주지 않은 경우에 쓸 문장. */
const UNKNOWN_FAILURE = '세션을 확인하지 못했습니다'

/**
 * `me()`를 한 번 불러 세션 상태를 판정한다.
 *
 * `status`가 아니라 `code`로 가른다. 서버는 같은 401을 여러 이유로 낼 수 있고, 반대로
 * 500을 "로그아웃됨"으로 읽으면 사용자는 될 리 없는 로그인을 반복하게 된다.
 */
function useSession(): SessionState {
  const api = useApi()
  const [state, setState] = useState<SessionState>({ status: 'pending' })

  useEffect(() => {
    // 응답이 오기 전에 화면이 바뀌면 결과를 버린다. 사라진 컴포넌트의 상태를 갱신하면
    // 아무 일도 일어나지 않거나, 다음 화면의 판정을 덮어쓴다.
    let alive = true
    api.me().then(
      () => {
        if (alive) setState({ status: 'authenticated' })
      },
      (caught: unknown) => {
        if (!alive) return
        if (caught instanceof ApiError && caught.code === 'unauthenticated') {
          setState({ status: 'anonymous' })
          return
        }
        setState({
          status: 'failed',
          message: caught instanceof ApiError ? caught.message : UNKNOWN_FAILURE,
        })
      },
    )
    return () => {
      alive = false
    }
  }, [api])

  return state
}

function SessionFailure(props: { message: string }): ReactElement {
  return (
    <main>
      <h1>{UNKNOWN_FAILURE}</h1>
      <p role="alert">{props.message}</p>
    </main>
  )
}

/**
 * 로그인한 사용자에게만 자식을 보여준다. 아니면 로그인 화면으로 보낸다.
 *
 * 확인이 끝나기 전에는 아무것도 렌더하지 않는다 — 자식을 먼저 그렸다가 치우면 한 번
 * 깜빡이고, 그사이 자식이 부른 요청은 전부 401로 버려진다.
 */
export function RequireAuth(props: { children: ReactNode }): ReactElement | null {
  const session = useSession()

  if (session.status === 'pending') return null
  if (session.status === 'failed') return <SessionFailure message={session.message} />
  // `replace`: 로그인한 뒤 뒤로 가기가 방금 튕겨 나온 주소로 돌아가면 다시 튕긴다.
  if (session.status === 'anonymous') return <Navigate to="/login" replace />
  return <>{props.children}</>
}

/**
 * 이미 로그인한 사용자를 자식(로그인 화면) 대신 목록으로 보낸다.
 *
 * `RequireAuth`와 같은 확인을 반대 방향으로 쓴다. 로그인 화면만 예외로 두면, 세션이
 * 살아 있는 사용자가 주소창으로 `/login`에 들어와 다시 로그인하는 길이 남는다.
 */
export function RedirectWhenAuthenticated(props: { children: ReactNode }): ReactElement | null {
  const session = useSession()

  if (session.status === 'pending') return null
  if (session.status === 'failed') return <SessionFailure message={session.message} />
  if (session.status === 'authenticated') return <Navigate to="/" replace />
  return <>{props.children}</>
}
