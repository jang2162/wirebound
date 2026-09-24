/**
 * 세션이 있는지 확인하는 문지기.
 *
 * 세션 쿠키는 httpOnly라 JS가 읽지 못한다. **로그인 여부를 아는 방법은 `GET /auth/me`를
 * 실제로 불러 보는 것 하나뿐이다.** 로그인 결과를 `localStorage` 같은 곳에 적어 두면
 * 서버가 세션을 지운 뒤에도 로그인된 것처럼 보이고, 화면은 401만 받는 상태에 갇힌다.
 *
 * **그 확인은 여기서 하지 않는다.** 두 컴포넌트가 각자 물으면 왕복마다 판정이 새로 나
 * 로그인 화면과 보호된 라우트 사이를 리다이렉트가 끝없이 돈다. 상태는 `session/session-context.tsx`에
 * 하나 있고 여기서는 **읽기만** 한다.
 */
import { useEffect, useState, type ReactElement, type ReactNode } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { UNKNOWN_SESSION_FAILURE, useSessionState, useSessionUser } from '../session/session-context'

/**
 * `failed`를 화면에서 어떻게 다룰지는 상태가 정하지 않는다 — 아래 두 컴포넌트가 다르게
 * 답한다. 보호된 라우트에서는 로그인 화면으로 보내면 안 된다(로그인해 봐야 통과하지
 * 못하므로 사용자가 될 리 없는 로그인을 반복하게 된다). 로그인 화면에서는 정확히
 * 뒤집힌다 — 거기서 폼을 치우면 재시도 경로가 없어 새로고침 말고는 앱에 들어갈 방법이
 * 사라진다.
 */
function SessionFailure(props: { message: string }): ReactElement {
  return (
    <main>
      <h1>{UNKNOWN_SESSION_FAILURE}</h1>
      <p role="alert">{props.message}</p>
    </main>
  )
}

/**
 * 로그인한 사용자에게만 자식을 보여준다. 아니면 로그인 화면으로 보낸다.
 *
 * 확인이 끝나기 전에는 아무것도 렌더하지 않는다 — 자식을 먼저 그렸다가 치우면 한 번
 * 깜빡이고, 그사이 자식이 부른 요청은 전부 401로 버려진다.
 *
 * **들어와 있는 동안 사람이 바뀌면 목록으로 옮긴다**(다른 탭이 다른 사람으로 들어온 판 —
 * `session/session-context.tsx`의 «탭 사이»). 자식을 **한 번 내렸다가** 목록에서 새로 세운다 — 이미 목록이어도
 * 앞 사람의 권리로 받은 목록이 새 사람에게 남지 않는다. 같은 탭에서 사람이 바뀌는 길(로그아웃 → 로그인)은 로그인
 * 화면을 지나므로 이 문지기가 내려갔다 새로 서서 여기에 안 온다.
 *
 * **사람으로 가른다 — 세대로 가르지 않는다.** 세대는 «나가 있던 쓰기를 끊는다»의 값이고(같은 파일 «세션 세대»),
 * 화면을 옮길지는 «누구의 화면인가»의 일이다. 둘을 한 값에 매면 한쪽을 바꾸는 사람이 다른 쪽을 함께 바꾼다.
 */
export function RequireAuth(props: { children: ReactNode }): ReactElement | null {
  const session = useSessionState()
  const who = useSessionUser()?.id ?? null
  const navigate = useNavigate()
  /** 이 문지기를 지나 자식을 본 사람. **`null`은 «아직 아무도»다** — 누구인지 모르는 동안에는 옮기지 않는다. */
  const [holder, setHolder] = useState<string | null>(null)
  const authenticated = session.status === 'authenticated'
  const moved = authenticated && holder !== null && who !== holder

  useEffect(() => {
    if (!authenticated) return
    if (moved) navigate('/', { replace: true })
    setHolder(who)
  }, [authenticated, moved, who, navigate])

  if (session.status === 'pending') return null
  if (session.status === 'failed') return <SessionFailure message={session.message} />
  // `replace`: 로그인한 뒤 뒤로 가기가 방금 튕겨 나온 주소로 돌아가면 다시 튕긴다.
  if (session.status === 'anonymous') return <Navigate to="/login" replace />
  // 옮기는 동안은 아무것도 안 그린다 — 앞 사람의 화면이 새 사람의 것으로 한 번이라도 서지 않게.
  if (moved) return null
  return <>{props.children}</>
}

/**
 * 이미 로그인한 사용자를 자식(로그인 화면) 대신 목록으로 보낸다.
 *
 * `RequireAuth`와 같은 확인을 반대 방향으로 쓴다. 로그인 화면만 예외로 두면, 세션이
 * 살아 있는 사용자가 주소창으로 `/login`에 들어와 다시 로그인하는 길이 남는다.
 *
 * **로그인 성공 뒤의 이동도 이 컴포넌트가 한다.** `routes/login.tsx`는 세션 상태를
 * `authenticated`로 확정하기만 하고 목적지를 정하지 않는다 — 그래야 "로그인한 사람은
 * `/login`에 머물지 않는다"는 규칙이 여기 한 곳에 남는다.
 *
 * **`failed`는 `anonymous`처럼 다뤄 폼을 그린다.** `RequireAuth`와 갈리는 유일한
 * 지점이다 — 여기서 실패 화면을 내면 API가 잠깐 500을 내거나 네트워크가 끊긴 동안
 * 로그인 폼이 사라지고, 세션 확인은 재시도하지 않으므로 서버가 회복돼도 사용자는
 * 새로고침 전까지 앱에 들어갈 수 없다.
 */
export function RedirectWhenAuthenticated(props: { children: ReactNode }): ReactElement | null {
  const session = useSessionState()

  if (session.status === 'pending') return null
  if (session.status === 'authenticated') return <Navigate to="/" replace />
  return (
    <>
      {/* 확인이 실패했으면 왜 로그인 화면에 있는지 알려 준다. `alert`가 아니라 `status`인
          것은 사용자가 한 행동의 결과가 아니기 때문이다 — 폼의 `alert` 자리는 제출
          결과에 남겨 둔다. */}
      {session.status === 'failed' && <p role="status">{session.message}</p>}
      {props.children}
    </>
  )
}
