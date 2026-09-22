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
 * `useConfirmSession()`(로그인이 성공했다).
 *
 * **P5-1이 `confirm`을 넓혔다 — 이제 `SessionUser`를 받는다.** 앞 판의 주석이
 * *"`login()`이 `SessionUser`를 돌려주지만 그 값을 쓰는 화면이 아직 없고, 필요해지면 그때
 * 넓힌다"*로 이 자리를 남겨 두었고, 코멘트 탭이 그 화면이다 — **남의 코멘트는 고칠 수
 * 없으므로**(서버의 재라 #2) 수정 단추를 낼지 말지가 *"내가 누구인가"*에 달려 있다.
 *
 * **넓히지 않았다면 갓 로그인한 사람의 화면에 수정 단추가 하나도 없었다.** 마운트의
 * `me()`는 그때 401이었으므로 사용자가 `null`이고, `confirm()`이 인자를 안 받으면 그것을
 * 채울 길이 새로고침뿐이다.
 *
 * **`state`와 `user`를 따로 든다.** `state`의 세 값은 모듈 상수라 참조가 안정해야 하는데
 * (아래 `PENDING`·`AUTHENTICATED`·`ANONYMOUS`의 주석), 사용자를 그 안에 넣으면 상수로 둘
 * 수 없다. 두 상태가 어긋날 자리는 **`authenticated`인데 `user`가 `null`인 것** 하나이고,
 * 그것은 실패가 아니라 *"아직 누구인지 모른다"*이다 — 읽는 쪽(`useSessionUser`)이
 * `null`을 받아 수정 단추를 안 내면 된다(서버가 어차피 403으로 막는다).
 *
 * ## 세션 세대 — 세션이 끝날 때마다 오른다 (2026-09-21)
 *
 * **라우트보다 오래 사는 것이 세션을 넘지 않게 하는 값이다.** 나가 있는 쓰기의 장부
 * (`panels/write-ledger.tsx`)는 에디터를 떠나도 살도록 라우트 표 바깥에 서는데, 그러자 **앞 사람의
 * 쓰기가 다음 사람에게 넘어갔다**(리뷰 1-1, Chrome — 같은 탭에서 앨리스가 저장 중 로그아웃하고 밥이
 * 로그인해 같은 페이지로 가면: 앨리스의 쓰기가 **밥의 상자를 잠그고**, 앨리스의 «저장했습니다»가
 * **밥의 화면에 서고**, 앨리스의 요청이 로그아웃 뒤 서버에 닿아 받은 401 이 **밥을 로그인 화면으로
 * 튕겼다**). 같은 사람이 세션 만료 뒤 다시 로그인해도 같다 — 옛 쿠키를 실은 쓰기의 401 이 새 세션을
 * 튕긴다. 사용자 id 로는 뒤의 판을 못 가른다. 그래서 **사람이 아니라 세션**을 센다.
 *
 * **오르는 자리는 하나다 — `invalidate`가 세션을 끝낼 때**(로그아웃 단추 · 401 을 받은 `SignedOut`).
 * **상태가 실제로 바뀔 때만** 오른다(이미 `anonymous`인데 무효화는 그대로) — 아래 상태 상수의 «같은
 * 참조» 계약을 세대가 깨지 않게 상태와 한 칸에 묶었다. **로그인(`confirm`)에서는 안 올린다** — 세션이
 * 없는 동안(`anonymous`·`failed`)에는 문지기가 에디터를 안 그려 쓰기가 하나도 없으므로, 앞 세션의
 * 쓰기는 전부 그 세션을 끝낸 `invalidate`의 세대에 이미 갇혀 있다. 올려도 재는 것이 없다. 마운트의
 * `me()`도 같은 이유로 안 올린다.
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
import type { SessionUser } from './../api/types'

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

/** 상태와 세션 세대. **한 칸에 든다** — 세대는 상태가 바뀔 때만 오른다(위 머리말 «세션 세대»). */
interface Session {
  state: SessionState
  epoch: number
}

interface SessionContextValue {
  state: SessionState
  /** 세션 세대(위 머리말). */
  epoch: number
  /** 지금 로그인한 사람. `state`가 `authenticated`여도 아직 `null`일 수 있다(위 머리말). */
  user: SessionUser | null
  invalidate: () => void
  confirm: (user: SessionUser) => void
}

/**
 * 기본값이 `null`인 것은 의도다(`api/context.tsx`·`store/use-editor-store.tsx`와 같은 관례).
 * `{ status: 'anonymous' }` 같은 것을 기본값으로 두면 Provider를 빠뜨린 트리가 조용히
 * 로그인 화면을 그리고, 원인이 어디였는지 남지 않는다.
 */
const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider(props: { children: ReactNode }): ReactElement {
  const api = useApi()
  const [session, setSession] = useState<Session>({ state: PENDING, epoch: 0 })
  const [user, setUser] = useState<SessionUser | null>(null)

  useEffect(() => {
    // 응답이 오기 전에 Provider가 사라지면 결과를 버린다. 사라진 컴포넌트의 상태를
    // 갱신하면 아무 일도 일어나지 않는다.
    let alive = true
    api.me().then(
      (sessionUser) => {
        if (!alive) return
        setUser(sessionUser)
        setSession((current) => ({ ...current, state: AUTHENTICATED }))
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
        // 누구인지 모르는 상태로 되돌린다. 실패한 뒤에도 앞 사람이 남아 있으면 화면이
        // 그 사람의 권리로 단추를 낸다 — P4c-3 이월의 둘째 줄이 말하는 부류다.
        setUser(null)
        setSession((current) => ({
          ...current,
          state: failure.kind === 'signed-out' ? ANONYMOUS : { status: 'failed', message: failure.message },
        }))
      },
    )
    return () => {
      alive = false
    }
  }, [api])

  // **순환을 닫는 다리는 아래 `current.state.status === 'anonymous' ? current : …`다.**
  // 그것을 매번 새 객체(`{ state: ANONYMOUS, … }`)로 바꾸게 하면
  // `이미 anonymous면 무효화가 상태를 교체하지 않는다`가 죽는다(실측 1 사망).
  //
  // **`useCallback`은 겹치는 방어다 — 하중이 아니다.** 걷어내 참조를 불안정하게 만들어도
  // 죽는 케이스가 **0개**이고, 위 상태 교체와 **동시에** 깨도 `Maximum update depth`가
  // 나지 않고 죽는 것은 상태 교체 쪽이 죽이는 그 하나뿐이다(실측). 그래도 두는 것은
  // `SignedOut`이 `useEffect(invalidate, [invalidate])`로 부르기 때문이다 — 참조가 렌더마다
  // 바뀌면 그 이펙트가 커밋마다 다시 돈다. 즉 헛일을 줄이는 것이지 순환을 막는 것이 아니다.
  const invalidate = useCallback(() => {
    // 세션이 끊겼으면 누구인지도 잊는다. **세션이 끝났으니 세대가 오른다**(위 머리말).
    setUser(null)
    setSession((current) =>
      current.state.status === 'anonymous' ? current : { state: ANONYMOUS, epoch: current.epoch + 1 },
    )
  }, [])

  const confirm = useCallback((sessionUser: SessionUser) => {
    setUser(sessionUser)
    // **세대는 안 올린다** — 앞 세션은 `invalidate`가 이미 끝냈고, 세션이 없는 동안에는 쓰기가 없다
    // (위 머리말 «세션 세대»).
    setSession((current) =>
      current.state.status === 'authenticated' ? current : { ...current, state: AUTHENTICATED },
    )
  }, [])

  const { state, epoch } = session
  const value = useMemo(
    () => ({ state, epoch, user, invalidate, confirm }),
    [state, epoch, user, invalidate, confirm],
  )

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

/**
 * 지금 세션 세대(위 머리말 «세션 세대»). **라우트보다 오래 사는 것**이 앞 세션의 일을 다음 세션에
 * 넘기지 않으려고 읽는다 — 오늘은 쓰기 장부(`panels/write-ledger.tsx`)와 그 칸 쓰기(`panel-drafts.tsx`)다.
 */
export function useSessionEpoch(): number {
  return useSessionContext().epoch
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
/**
 * 지금 로그인한 사람. **`null`은 *"아직 누구인지 모른다"*이고 실패가 아니다** — 세션 확인이
 * 아직 안 끝났거나, 익명이거나, 확인이 실패한 경우다.
 *
 * 오늘 이것을 읽는 자리는 코멘트 탭 하나이고, 쓰는 곳은 *"이 코멘트를 내가 썼는가"* 판정이다.
 * **권한의 진실은 서버다** — 여기서 `null`을 받아 단추를 안 내는 것은 눌러 봐야 실패할
 * 자리를 없애는 것이지 보안 장치가 아니다.
 */
export function useSessionUser(): SessionUser | null {
  return useSessionContext().user
}

export function useConfirmSession(): (user: SessionUser) => void {
  return useSessionContext().confirm
}
