/**
 * 앱 전역에 하나뿐인 세션 상태.
 *
 * **왜 컨텍스트인가.** `RequireAuth`와 `RedirectWhenAuthenticated`가 각자
 * `useSession()`을 불러 **각자 `me()`를 요청하면** `/`와 `/login`을 오갈 때마다
 * 판정이 새로 나고, `me`가 성공하는데 다른 요청이 `unauthenticated`를 내는 상태에서는
 * 두 화면이 서로를 무한히 튕긴다 — `<App />`을 `/`에 렌더하고 `listProjects`만 `unauthenticated`를
 * 던지게 하면 인위로 끊지 않는 한 `me`가 수천 회씩 불리며 **정착하지 않는다.** 재는 케이스와 잰 값은
 * `test/session/session-context.test.tsx`의 *"me가 성공하는데 조회가 unauthenticated면 로그인 화면에서
 * 멈춘다"*와 그 파일의 머리말이 든다(대조군 — `listProjects` 성공 — 은 `me` 1회로 `/`에 정착한다).
 *
 * 상태가 하나면 왕복이 그것을 바꾸지 못하므로 순환이 성립하지 않는다.
 *
 * **`me()`는 마운트에 한 번뿐이다.** 자동 재시도는 없다 — 재시도가
 * 있으면 서버가 계속 실패하는 동안 요청이 쌓인다.
 *
 * **바깥에서 상태를 바꾸는 길은 둘뿐이다:** `useInvalidateSession()`(끊긴 것을 알았다)과
 * `useConfirmSession()`(로그인이 성공했다).
 *
 * **`confirm`은 `SessionUser`를 받는다.** `login()`이 돌려준 그 값을 화면이 쓴다 — 예컨대
 * 코멘트 탭은 **남의 코멘트는 고칠 수 없으므로**(서버가 막는다) 수정 단추를 낼지 말지가
 * *"내가 누구인가"*에 달려 있다.
 *
 * **`confirm()`이 사람을 안 받으면 갓 로그인한 사람의 화면에 수정 단추가 하나도 없다.** 마운트의
 * `me()`는 그때 401이었으므로 사용자가 `null`이고, 그것을
 * 채울 길이 새로고침뿐이다.
 *
 * **`state` 안에 `user`를 넣지 않는다 — 옆 칸에 든다**(`Session`). `state`의 세 값은 모듈 상수라 참조가
 * 안정해야 하는데(아래 `PENDING`·`AUTHENTICATED`·`ANONYMOUS`의 주석), 사용자를 그 안에 넣으면 상수로 둘
 * 수 없다. (두 칸이 한 `useState`인 것은 «탭 사이»가 둘을 함께 보고 갈래를 고르기 때문이다.) 두 칸이 어긋날 자리는 **`authenticated`인데 `user`가 `null`인 것** 하나이고,
 * 그것은 실패가 아니라 *"아직 누구인지 모른다"*이다 — 읽는 쪽(`useSessionUser`)이
 * `null`을 받아 수정 단추를 안 내면 된다(서버가 어차피 403으로 막는다).
 *
 * ## 세션 세대 — 세션이 끝날 때마다 오른다
 *
 * **라우트보다 오래 사는 것이 세션을 넘지 않게 하는 값이다.** 나가 있는 쓰기의 장부
 * (`panels/write-ledger.tsx`)는 에디터를 떠나도 살도록 라우트 표 바깥에 서는데, 세대가 없으면 **앞 사람의
 * 쓰기가 다음 사람에게 넘어간다**(Chrome — 같은 탭에서 앨리스가 저장 중 로그아웃하고 밥이
 * 로그인해 같은 페이지로 가면: 앨리스의 쓰기가 **밥의 상자를 잠그고**, 앨리스의 «저장했습니다»가
 * **밥의 화면에 서고**, 앨리스의 요청이 로그아웃 뒤 서버에 닿아 받은 401 이 **밥을 로그인 화면으로
 * 튕긴다**). 같은 사람이 세션 만료 뒤 다시 로그인해도 같다 — 옛 쿠키를 실은 쓰기의 401 이 새 세션을
 * 튕긴다. 사용자 id 로는 뒤의 판을 못 가른다. 그래서 **사람이 아니라 세션**을 센다.
 *
 * **오르는 자리는 하나다 — `invalidate`가 세션을 끝낼 때**(로그아웃 단추 · 401 을 받은 `SignedOut`).
 * **상태가 실제로 바뀔 때만** 오른다(이미 `anonymous`인데 무효화는 그대로) — 아래 상태 상수의 «같은
 * 참조» 계약을 세대가 깨지 않게 상태와 한 칸에 묶는다. **로그인(`confirm`)에서는 안 올린다** — 세션이
 * 없는 동안(`anonymous`·`failed`)에는 문지기가 에디터를 안 그려 쓰기가 하나도 없으므로, 앞 세션의
 * 쓰기는 전부 그 세션을 끝낸 `invalidate`의 세대에 이미 갇혀 있다. 올려도 재는 것이 없다. 마운트의
 * `me()`도 같은 이유로 안 올린다.
 *
 * **다른 탭이 다른 사람으로 들어온 것을 알았을 때도 오른다**(아래 «탭 사이») — 그때는 이 탭의 세션이
 * 로그아웃 없이 다른 사람의 것으로 바뀌므로 `invalidate`를 지나지 않는다.
 *
 * ## 탭 사이 — 탭이 들고 있는 «나» 가 쿠키의 «나» 와 다르면 그 탭은 쓰지 않는다
 *
 * 쿠키는 브라우저에 하나라 다른 탭의 로그인·로그아웃이 이 탭의 쿠키도 바꾸는데, 알리지 않으면 이 탭의 상태는 그것을
 * 모른다(통로와 두 결함의 값은 `tab-channel.tsx`의 머리말). 그래서 **이 탭에서 일어난 일**을 알리고 다른 탭의 것을 받는다.
 *
 * **내는 자리는 여기 하나다 — `announce`**(두 벌 금지). 무엇을 내는가:
 *
 * | 이 탭에서 | 알림 | 까닭 |
 * |---|---|---|
 * | 로그인이 성공했다(`confirm`) | `signed-in` + 그 사람 | 쿠키가 방금 이 사람의 새 세션이 됐다 |
 * | 로그아웃이 성공했다(`signOut` — 로그아웃 단추) | `signed-out` | 쿠키의 세션을 서버가 지웠다 |
 * | 401 을 받았다(`invalidate` — `SignedOut`) | **안 낸다** | 401 은 **그 요청이 실은 쿠키**에 대해서만 말한다. 다른 탭이 새 사람으로 들어온 뒤에 옛 쿠키로 나갔던 요청이 받은 401 을 알리면 **멀쩡한 새 세션의 탭이 로그인 화면으로 간다.** 쿠키가 정말 죽었으면 다른 탭도 다음 요청에서 저마다 401 을 받는다 |
 *
 * 받은 탭이 하는 일 — **다른 사람인가 같은 사람인가**는 사용자 id 로 가른다(세션은 httpOnly 쿠키라 탭이 못 읽는다):
 *
 * | 받은 것 | 이 탭이 | 하는 일 | 어디로 |
 * |---|---|---|---|
 * | `signed-out` | 로그인해 있다 | `invalidate`와 같다 — **세대가 올라** 나가 있던 쓰기를 끊고 장부를 비운다 | 로그인 화면(`RequireAuth`) |
 * | `signed-in` | 로그인 전(`pending`·`anonymous`·`failed`) | 그 사람으로 **들어간다** — 세대는 안 오른다(위 «세션 세대»: 세션이 없는 동안 쓰기가 없다) | 로그인 화면이었으면 목록(`RedirectWhenAuthenticated`) |
 * | `signed-in` | **다른 사람**으로 들어와 있다 | 그 사람이 된다 · **세대가 오른다** — 앞 사람의 쓰기가 새 사람의 쿠키로 나가지 않는다 | **목록**(`RequireAuth`가 사람이 바뀐 것을 보고 옮긴다) |
 * | `signed-in` | **같은 사람**으로 들어와 있다 | 쓰기는 끊지 않는다(같은 사람이다) · **`renewal`이 오른다** — 실시간 연결이 새 쿠키로 다시 붙는다(`realtime/use-realtime.ts`) | 그대로 |
 *
 * - **다른 사람이면 목록이다 — 로그인 화면이 아니다.** 쿠키가 이미 새 사람의 것이라 로그인 화면은 «로그인한
 *   사람은 `/login`에 머물지 않는다»(`RedirectWhenAuthenticated`)와 어긋난다. 그 자리에 머물지도 않는다 — 앞 사람이
 *   치던 초안과 앞 사람의 권리로 받은 화면이 새 사람의 것으로 남으면, 돌아온 사람이 머리의 이름만 바뀐 화면에서
 *   **새 사람의 이름으로** 쓴다. 앞 사람의 초안은 탭의 저장소에서 지운다(아래 «초안의 사본»).
 * - **세션 확인(`me()`)이 도는 동안 소식이 오면 소식이 이긴다** — 그 확인은 소식보다 먼저 나갔으므로 낡은 쿠키를
 *   답했을 수 있다(`superseded`).
 *
 * **이것이 닫지 못하는 창 — 알림이 늦게 닿는 동안.** 다른 탭의 로그인 응답이 쿠키를 바꾼 순간부터 이 탭이 소식을
 * 받아 세대를 올리기까지, 이 탭이 내는 요청은 새 쿠키로 나간다. 그 창을 닫는 것은 서버다(아래 «서버가 … 답하면»).
 * **알림 없이 쿠키가 바뀌는 길**(앱 밖에서 부른 `/api/auth/login` — 개발자 도구 · 다른 도구)도 알림으로는 모르고,
 * 같은 서버의 거절이 잡는다.
 *
 * ## 서버가 «쿠키의 사람이 다르다»고 답하면 — 쿠키의 사람을 다시 알아낸다
 *
 * 위 창을 닫는 것은 서버다 — 요청마다 **이 탭이 아는 사람**을 싣고(`api/known-user.tsx` — 쓰는 자리는 아래 레이아웃 이펙트
 * 하나), 서버가 쿠키의 사람과 다르면 409 `session-user-changed`로 거절한다(읽기 · 쓰기 · WS 핸드셰이크 — 판정은
 * `apps/api/src/auth/plugin.ts` 하나). HTTP 클라이언트가 그 답을 알아채면(`KnownUserHolder.changed`) 여기서 **`me`로 쿠키의 사람을
 * 다시 묻고**(`reconfirm`) 그 답으로 옮긴다(`learned`):
 *
 * | `me`의 답 | 이 탭이 |
 * |---|---|
 * | 다른 사람 | **탭 사이 알림의 «다른 사람» 줄과 같다** — 그 사람이 된다 · 세대가 오른다(나가 있던 쓰기를 끊는다) · 앞 사람의 초안 칸을 지운다(`admit`) · 목록으로(`RequireAuth`) |
 * | 같은 사람(그 사이 쿠키가 되돌아왔다) | 아무것도 안 한다 — 거절된 요청은 제 실패 문장을 그렸고, 다시 하면 된다 |
 * | 401 | 세션이 끝났다(`invalidate`와 같다) |
 * | 그 밖의 실패 | 아무것도 안 한다 — 다음 거절이 다시 묻는다 |
 *
 * **알리지 않는다**(`announce` 안 부름) — 이 탭은 로그인하지 않았다. 쿠키를 바꾼 탭이 앱 안의 탭이면 그 탭이 이미 알렸다.
 * 한 번에 거절이 여럿 와도(한 화면의 조회 넷) 묻는 것은 하나다(`asking`).
 *
 * **사람이 바뀐 것을 통지 줄에서 말한다**(`useSessionSwitched` — `session/session-menu.tsx`). 탭 사이 알림으로 바뀌든 서버의 거절로
 * 알든 같다 — 목록으로 옮기기만 하면 사용자가 왜 목록에 와 있는지 모른다.
 *
 * ## 초안의 사본 — 명시적 로그아웃에 지우고, 다른 사람이 들어오면 앞 사람의 것을 지운다
 *
 * 초안과 코멘트의 멱등 키는 탭의 `sessionStorage`에 비춰 둔다(`panels/draft-store.tsx`) — 새로고침과 세션 만료를
 * 넘는다. **지우는 자리는 위 «탭 사이»가 이미 가진 신호 그대로다** — 새 신호를 세우지 않는다.
 *
 * | 끝 | 사본 | 까닭 |
 * |---|---|---|
 * | 로그아웃 단추(`signOut`) | **지운다**(사람을 가리지 않고 이 탭의 것 전부) · **세대를 올려** 그 번호를 소식에 싣는다(`forget`) | «로그아웃했다» 뒤에 그 사람의 글이 이 브라우저에 남으면 안 된다(공용 기기) |
 * | 다른 탭의 로그아웃(`signed-out`) | **지운다** · 소식의 번호로 세대를 `max`만 한다(`forgetHeard`) | 같다. 듣는 탭이 번호를 지으면 늦게 들은 탭이 로그아웃 **뒤의** 사본을 지운다(`draft-store.tsx`) |
 * | 401(`invalidate`) | 둔다 | 원하지 않은 끝이다 — 같은 사람이 다시 들어오면 이어 쓴다. 쿠키가 정말 죽었는지도 모른다(위 표의 401 줄) |
 * | 이 탭의 사람을 알았다 — 마운트의 `me()` · 이 탭의 로그인(`confirm`) · 다른 탭의 로그인(`signed-in`) | **그 사람이 아닌 칸을 지운다**(`admit`) | 칸을 사람마다 갈라 안 보이게만 하면 앞 사람의 원문이 명시적 로그아웃까지 그 탭에 남는다. 같은 사람이면 지울 것이 없다. **대가: 앞 사람이 그 탭에 돌아와도 초안은 없다** |
 *
 * `admit`을 **다른 사람일 때만** 부르지 않고 사람을 알 때마다 부른다 — 같은 사람이면 지울 칸이 없으므로 결과가
 * 같고, 갈래를 여기서 한 번 더 고르면 `heard`와 판정이 두 벌이 된다. 마운트의 `me()`가 든 것은 **다른 사람의 쿠키로
 * 다시 선 탭**(닫아 둔 탭을 다시 열었더니 그 사이 다른 탭이 밥으로 들어왔다 · 새로고침)도 같은 «들어옴»이라서다.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react'
import { useApi } from '../api/context'
import { toFailure } from '../api/failure'
import { useKnownUserHolder } from '../api/known-user'
import { useDraftStore } from '../panels/draft-store'
import type { SessionUser } from './../api/types'
import { useTabChannel, type SessionNews } from './tab-channel'

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

/**
 * 상태 · 사용자 · 세션 세대 · 갱신 번호. **한 칸에 든다** — 세대는 상태가 바뀔 때만 오르고(위 머리말 «세션 세대»),
 * 다른 탭의 소식은 **지금 상태와 지금 사람을 함께** 보고 갈래를 고른다(«탭 사이»). 따로 들면 한 소식이 갱신 하나를
 * 아직 안 커밋한 판을 읽는다. `state`는 여전히 모듈 상수다(아래 `PENDING`·`AUTHENTICATED`·`ANONYMOUS`의 주석).
 */
interface Session {
  state: SessionState
  /** 지금 로그인한 사람. `state`가 `authenticated`여도 아직 `null`일 수 있다(위 머리말). */
  user: SessionUser | null
  epoch: number
  /** 같은 사람이 다른 탭에서 다시 들어올 때마다 오른다(«탭 사이») — 실시간 연결이 새 쿠키로 다시 붙는다. */
  renewal: number
  /** 이 탭이 로그인하지 않았는데 **다른 사람이 됐다**(탭 사이 알림 · 서버의 거절 — 위 머리말). 이 탭이 로그인 · 로그아웃하면 지운다. */
  switched: boolean
  /**
   * 로그아웃하며 이 탭이 남긴 한 줄과 **그 로그아웃이 연 세대**(`useSignOutNotice`). 세대가 지금 세대와 같을 때만 그린다 — 다음 세션이 끝나면
   * (세대가 오른다) 앞 사람의 줄은 없다.
   */
  farewell: { epoch: number; text: string } | null
}

/** 세션이 끝났다 — 이미 `anonymous`면 **같은 참조**(아래 `invalidate`의 주석). */
function ended(current: Session): Session {
  if (current.state.status === 'anonymous') return current
  return { ...current, state: ANONYMOUS, user: null, epoch: current.epoch + 1, switched: false }
}

/** 다른 탭의 소식으로 옮긴다(위 머리말 «탭 사이»의 표). 순수하다 — 업데이터 안에서 돈다. */
function heard(current: Session, news: SessionNews): Session {
  if (news.kind === 'signed-out') return ended(current)
  if (current.state.status !== 'authenticated') return { ...current, state: AUTHENTICATED, user: news.user }
  if (current.user !== null && current.user.id === news.user.id) return { ...current, renewal: current.renewal + 1 }
  return { ...current, user: news.user, epoch: current.epoch + 1, switched: true }
}

/**
 * 서버의 거절 뒤 `me`가 알려 준 쿠키의 사람으로 옮긴다(위 머리말 «서버가 … 답하면»). **다른 사람이면 `heard`의 «다른 사람»
 * 줄과 같은 값이다** — 같은 판정을 두 벌로 짓지 않으려고 그 함수를 부른다. 같은 사람이거나 로그인해 있지 않으면 그대로다.
 */
function learned(current: Session, user: SessionUser): Session {
  if (current.state.status !== 'authenticated' || current.user?.id === user.id) return current
  return heard(current, { kind: 'signed-in', user })
}

interface SessionContextValue {
  state: SessionState
  /** 세션 세대(위 머리말). */
  epoch: number
  /** 지금 로그인한 사람. `state`가 `authenticated`여도 아직 `null`일 수 있다(위 머리말). */
  user: SessionUser | null
  /** 이 탭이 로그인하지 않았는데 다른 사람이 됐다(`Session.switched`). */
  switched: boolean
  /** 로그아웃하며 이 탭이 남긴 한 줄(`useSignOutNotice`). */
  farewell: string | null
  invalidate: () => void
  /** 이 탭에서 로그아웃했다 — 끊고 다른 탭에 알린다(«탭 사이»). 잃은 것을 말하는 한 줄을 받는다. */
  signOut: (farewell?: string) => void
  confirm: (user: SessionUser) => void
  /** 같은 사람의 새 세션을 알았을 때 부를 것을 단다. 돌려주는 함수가 뗀다. */
  onRenewal: (listener: () => void) => () => void
  /** 지금 세대를 부르는 순간에 읽는다(`useSessionEpochNow`). */
  epochNow: () => number
}

/**
 * 기본값이 `null`인 것은 의도다(`api/context.tsx`·`store/use-editor-store.tsx`와 같은 관례).
 * `{ status: 'anonymous' }` 같은 것을 기본값으로 두면 Provider를 빠뜨린 트리가 조용히
 * 로그인 화면을 그리고, 원인이 어디였는지 남지 않는다.
 */
const SessionContext = createContext<SessionContextValue | null>(null)

export function SessionProvider(props: { children: ReactNode }): ReactElement {
  const api = useApi()
  const channel = useTabChannel()
  const drafts = useDraftStore()
  const [session, setSession] = useState<Session>({ state: PENDING, user: null, epoch: 0, renewal: 0, switched: false, farewell: null })
  const knownUser = useKnownUserHolder()
  /** 다른 탭의 소식이 왔다 — 그보다 먼저 나간 마운트의 `me()` 답은 낡았을 수 있다(«탭 사이»). */
  const superseded = useRef(false)
  const renewals = useRef(new Set<() => void>())

  useEffect(() => {
    // 응답이 오기 전에 Provider가 사라지면 결과를 버린다. 사라진 컴포넌트의 상태를
    // 갱신하면 아무 일도 일어나지 않는다.
    let alive = true
    // **내려가면 요청째 끊는다**(`ReadOptions.cancel`). 앱에서는 문서가 사는 동안 하나라 거의 안 도는 길이지만,
    // 끊지 않는 읽기를 남기지 않는다(조회 이펙트 전부가 같은 장치다).
    const leave = new AbortController()
    api.me({ cancel: leave.signal }).then(
      (sessionUser) => {
        if (!alive || superseded.current) return
        // **이 탭의 사람을 알았다** — 그 사람이 아닌 칸을 지운다(아래 «초안의 사본»).
        drafts?.admit(sessionUser.id)
        setSession((current) => ({ ...current, state: AUTHENTICATED, user: sessionUser }))
      },
      (caught: unknown) => {
        if (!alive || superseded.current) return
        // **"세션이 끊겼다"의 정의는 `api/failure.tsx`가 갖는다.** 여기와 네 조회 자리가
        // 같은 판정을 써야, 한쪽이 로그인으로 보내는 실패를 다른 쪽이 오류 문장으로
        // 그리는 어긋남이 생기지 않는다.
        //
        // `status`가 아니라 `code`로 가른다. 서버는 같은 401을 여러 이유로 낼 수 있으므로
        // `unauthenticated`가 아닌 실패는 "로그아웃됨"이 아니라 `failed`다.
        const failure = toFailure(caught, UNKNOWN_SESSION_FAILURE)
        // 누구인지 모르는 상태로 되돌린다. 실패한 뒤에도 앞 사람이 남아 있으면 화면이
        // 그 사람의 권리로 단추를 낸다.
        setSession((current) => ({
          ...current,
          user: null,
          state: failure.kind === 'signed-out' ? ANONYMOUS : { status: 'failed', message: failure.message },
        }))
      },
    )
    return () => {
      alive = false
      leave.abort()
    }
    // `drafts`를 의존에 안 넣는다 — 문서가 사는 동안 하나이고(`main.tsx`), 넣으면 그것이 바뀔 때 `me()`가 다시 나간다
    // (위 머리말 «`me()`는 마운트에 한 번뿐이다»).
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
    // 세션이 끊겼으면 누구인지도 잊는다. **세션이 끝났으니 세대가 오른다**(위 머리말). **알리지 않는다** —
    // 401 은 그 요청이 실은 쿠키에 대해서만 말한다(위 머리말 «탭 사이»).
    setSession(ended)
  }, [])

  /** **다른 탭에 알리는 자리는 여기 하나다**(위 머리말 «탭 사이»). 통로가 없으면 아무것도 안 한다. */
  const announce = useCallback((news: SessionNews) => channel?.post(news), [channel])

  const signOut = useCallback((notice?: string) => {
    // **명시적 로그아웃이면 이 탭의 초안 사본을 지운다**(아래 «초안의 사본») — 세션을 끝내기 **전에**: 지운 뒤에
    // 그 사람의 화면이 한 번 더 커밋돼도 저장소가 그것을 받지 않는다(`panels/draft-store.tsx`의 `generation`).
    // **올린 세대를 소식에 싣는다** — 듣는 탭은 그 번호로 `max`만 한다(`panels/draft-store.tsx`의 «표지는 세대 번호다»).
    const era = drafts?.forget()
    // **한 줄은 이 로그아웃이 연 세대에 매단다**(`useSignOutNotice`).
    setSession((current) => {
      const next = ended(current)
      return { ...next, farewell: notice === undefined ? null : { epoch: next.epoch, text: notice } }
    })
    announce(era === undefined ? { kind: 'signed-out' } : { kind: 'signed-out', era })
  }, [announce, drafts])

  const confirm = useCallback(
    (sessionUser: SessionUser) => {
      // **세대는 안 올린다** — 앞 세션은 `invalidate`가 이미 끝냈고, 세션이 없는 동안에는 쓰기가 없다
      // (위 머리말 «세션 세대»). **이 탭의 사람을 알았다** — 그 사람이 아닌 칸을 지운다(위 머리말 «초안의 사본»).
      drafts?.admit(sessionUser.id)
      setSession((current) =>
        current.state.status === 'authenticated'
          ? { ...current, user: sessionUser, switched: false }
          : { ...current, state: AUTHENTICATED, user: sessionUser, switched: false },
      )
      announce({ kind: 'signed-in', user: sessionUser })
    },
    [announce, drafts],
  )

  // **다른 탭의 소식을 듣는다**(위 머리말 «탭 사이»). 갈래는 순수한 `heard`가 고르고, 받은 뒤로는 마운트의
  // `me()` 답을 버린다.
  useEffect(() => {
    if (channel === null) return undefined
    return channel.listen((news) => {
      superseded.current = true
      // 다른 탭의 로그아웃도 명시적 로그아웃이다 — 이 탭의 초안 사본을 지운다(위 머리말 «초안의 사본»). 다른 탭의
      // 로그인이면 이 탭의 사람이 그 사람이 된다 — 그 사람이 아닌 칸을 지운다.
      if (news.kind === 'signed-out') drafts?.forgetHeard(news.era)
      else drafts?.admit(news.user.id)
      setSession((current) => heard(current, news))
    })
  }, [channel, drafts])

  // **이 탭이 아는 사람을 싣는 자리에 적는다 — 쓰는 자리는 여기 하나다**(`api/known-user.tsx`). **레이아웃 이펙트인 것이 요점이다** —
  // 사람이 바뀐 커밋의 자식 조회 이펙트(수동 이펙트)보다 먼저 선다. 뒤에 서면 새 사람의 화면이 첫 조회에 **앞 사람의 id** 를 실어
  // 거짓 거절을 받는다. (자식의 레이아웃 이펙트는 이것보다 먼저 돌지만 요청을 내는 것이 없다 — 받는 자리를 세우는 것뿐이다.)
  const { user: sessionUser } = session
  useLayoutEffect(() => {
    knownUser?.set(sessionUser?.id)
  }, [knownUser, sessionUser])

  // **서버가 «쿠키의 사람이 다르다»고 답하면 쿠키의 사람을 다시 묻는다**(위 머리말 «서버가 … 답하면»). 묻는 것은 한 번에 하나다.
  const asking = useRef(false)
  useEffect(() => {
    if (knownUser === null) return undefined
    let alive = true
    const stop = knownUser.onChanged(() => {
      if (asking.current) return
      asking.current = true
      api.me().then(
        (cookieUser) => {
          asking.current = false
          if (!alive) return
          drafts?.admit(cookieUser.id)
          setSession((current) => learned(current, cookieUser))
        },
        (caught: unknown) => {
          asking.current = false
          if (alive && toFailure(caught, UNKNOWN_SESSION_FAILURE).kind === 'signed-out') setSession(ended)
        },
      )
    })
    return () => {
      alive = false
      stop()
    }
  }, [api, drafts, knownUser])

  // **같은 사람의 새 세션을 알리면 단 것을 부른다** — 커밋 뒤에 부른다(업데이터는 순수해야 한다). 첫 값(0)에는
  // 부르지 않는다: 오른 적이 없다.
  const { renewal } = session
  useEffect(() => {
    if (renewal === 0) return
    for (const listener of [...renewals.current]) listener()
  }, [renewal])

  const onRenewal = useCallback((listener: () => void) => {
    renewals.current.add(listener)
    return () => {
      renewals.current.delete(listener)
    }
  }, [])

  const { state, epoch, user, switched } = session
  /** 커밋된 세대 — 부르는 컴포넌트가 이미 내려갔어도 읽힌다(`useSessionEpochNow`). */
  const committedEpoch = useRef(epoch)
  useLayoutEffect(() => {
    committedEpoch.current = epoch
  }, [epoch])
  const epochNow = useCallback(() => committedEpoch.current, [])
  const farewell = session.farewell !== null && session.farewell.epoch === epoch ? session.farewell.text : null
  const value = useMemo(
    () => ({ state, epoch, user, switched, farewell, invalidate, signOut, confirm, onRenewal, epochNow }),
    [state, epoch, user, switched, farewell, invalidate, signOut, confirm, onRenewal, epochNow],
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
 * 넘기지 않으려고 읽는다 — 쓰기 장부(`panels/write-ledger.tsx`) · 그 칸 쓰기(`panel-drafts.tsx`) · 트리 조작
 * (`tree/use-tree-commands.tsx`)다(다시 세는 법: `git grep -l useSessionEpoch apps/web/src`).
 */
export function useSessionEpoch(): number {
  return useSessionContext().epoch
}

/**
 * **지금 세대를 부르는 순간에 읽는 함수**(위 머리말 «세션 세대»). 기다림 뒤에 «누를 때와 같은 세션인가»를 묻는 자리가 쓴다 — 세션이 끝나면
 * 그 화면은 내려가므로(문지기가 로그인으로 보낸다) 렌더에서 읽은 세대는 기다림 뒤에 낡는다. 로그아웃 단추가 부른다(`session-menu.tsx`의 `run`).
 */
export function useSessionEpochNow(): () => number {
  return useSessionContext().epochNow
}

/**
 * 세션이 끊긴 것을 알았을 때 부른다(401). 이미 `anonymous`면 아무 일도 하지 않는다. **다른 탭에 알리지
 * 않는다**(위 머리말 «탭 사이») — 이 탭에서 로그아웃한 것은 `useSignOut`이다.
 */
export function useInvalidateSession(): () => void {
  return useSessionContext().invalidate
}

/**
 * 이 탭에서 로그아웃이 성공했을 때 부른다 — 끊고 **다른 탭에 알린다**(위 머리말 «탭 사이»). 로그아웃이 잃은 것이 있으면 그 한 줄을 넘긴다 —
 * 로그인 화면이 그린다(`useSignOutNotice`).
 */
export function useSignOut(): (farewell?: string) => void {
  return useSessionContext().signOut
}

/**
 * **로그아웃하며 이 탭이 남긴 한 줄** — 에디터의 로그아웃은 보낸 편집의 답을 한도까지만 기다리고 나간다(`session/session-menu.tsx`의
 * `settle`). 한도 뒤에 답을 못 받은 편집 · 못 보낸 편집은 말할 화면이 셸째 내려가므로, 그 수를 로그인 화면이 말한다(`routes/login.tsx`).
 * 이 탭의 메모리에만 산다 — 다른 탭의 로그아웃 소식 · 401 무효화는 남기지 않는다. 없으면 `null`이다.
 *
 * **그 로그아웃이 연 세대 동안만 선다**(위 머리말 «세션 세대»). 같은 탭의 다음 사람은 로그인하기 **전에** 이 줄을 본다(설계). 그 뒤 세션이
 * 끝나 로그인 화면이 다시 서면 줄은 없다 — 세션이 끝나는 길은 전부 세대를 올리므로(`ended`), 사람이 이 탭에 들어온 입구(이 탭의 로그인 ·
 * 다른 탭 소식 · 마운트 `me()` · 서버 거절 뒤 `me()`)를 하나씩 세어 지우지 않는다. 입구마다 지우면 입구가 늘 때 빠진다(Chrome: 이 탭의 로그인만
 * 지우자 다른 탭에서 들어온 밥이 로그아웃한 뒤 앨리스의 줄이 다시 섰다 — `apps/web/build-test/editor-logout-edits.test.ts`).
 */
export function useSignOutNotice(): string | null {
  return useSessionContext().farewell
}

/**
 * 같은 사람의 새 세션(다른 탭이 같은 사람으로 다시 들어왔다)을 알았을 때 부를 것을 다는 함수 — 실시간 연결이
 * 새 쿠키로 다시 붙는 데 쓴다(`realtime/use-realtime.ts`). **Provider 가 없으면 `null`이고 던지지 않는다** —
 * 실시간 쪽의 관례다(`realtime/context.tsx`: 없으면 조용히). 부르는 자리가 세션 없이 도는 화면 테스트에도 선다.
 */
export function useSessionRenewal(): ((listener: () => void) => () => void) | null {
  return useContext(SessionContext)?.onRenewal ?? null
}

/**
 * 로그인이 성공한 것을 알았을 때 부른다. **다른 탭에 그 사람을 알린다**(위 머리말 «탭 사이»). 이미
 * `authenticated`면 상태는 그대로다.
 *
 * **이 훅이 없으면 로그인이 끊긴다.** 세션이 전역 상태 하나라 `me()`를 다시 묻는
 * 일이 없으므로, 로그인 성공을 알리는 길이 따로 필요하다. `RequireAuth`가
 * 마운트마다 `me()`를 새로 부르면 그 일이 저절로 되지만, 그것이 머리말의 순환을 만든다.
 */
/**
 * 지금 로그인한 사람. **`null`은 *"아직 누구인지 모른다"*이고 실패가 아니다** — 세션 확인이
 * 아직 안 끝났거나, 익명이거나, 확인이 실패한 경우다.
 *
 * 읽는 자리는 *"내가 누구인가"*로 가르는 화면들이다 — 코멘트 탭의 *"이 코멘트를 내가 썼는가"* 판정 등
 * (다시 세는 법: `git grep -l useSessionUser apps/web/src`).
 * **권한의 진실은 서버다** — 여기서 `null`을 받아 단추를 안 내는 것은 눌러 봐야 실패할
 * 자리를 없애는 것이지 보안 장치가 아니다.
 */
export function useSessionUser(): SessionUser | null {
  return useSessionContext().user
}

/**
 * **이 탭이 로그인하지 않았는데 다른 사람이 됐는가**(위 머리말 «서버가 … 답하면») — 머리가 그렇다고 말한다(`session-menu.tsx`).
 * 이 탭이 로그인하거나 로그아웃하면 거짓이 된다.
 */
export function useSessionSwitched(): boolean {
  return useSessionContext().switched
}

export function useConfirmSession(): (user: SessionUser) => void {
  return useSessionContext().confirm
}
