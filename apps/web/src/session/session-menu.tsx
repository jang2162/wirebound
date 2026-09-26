/**
 * **앱에서 나가는 길**(누구로 들어와 있는지 + 로그아웃). 에디터 셸의 머리 오른쪽 끝에 산다.
 *
 * ## 왜 있는가 — 그리고 왜 여기인가
 *
 * **`api.logout()`을 부르는 화면은 이것 하나다**(검산: `grep -rnE "\.logout\(" apps/web/src`).
 * 이것이 없으면 이 앱에 들어온 사람이 **세션을 끝낼 길이 없다** —
 * 쿠키가 만료되기를 기다리거나 브라우저의 저장소를 손으로 지우는 것뿐이다.
 *
 * **머리의 오른쪽 끝인 것은 그것이 계정의 자리이기 때문이다.** 셸 머리의 갈래는 왼쪽이
 * *"어디에 있고 어디로 나가는가"*(`.wb-shell-lead`)이고 오른쪽이 *"이 설계서로 무엇을
 * 하는가"*(도구들)인데, 계정은 둘 다 아니다 — **설계서가 아니라 앱 전체에 걸리는 것**이라
 * 도구 묶음 뒤, 줄의 끝에 둔다.
 *
 * ## 누구인지 함께 보인다 — 이유
 *
 * 1. **로그아웃은 무엇을 끝내는지 말하고 눌러야 하는 단추다.** 이름이 없으면 여럿이 쓰는
 *    브라우저에서 *"내 세션인가"*를 확인할 길이 화면에 없다.
 * 2. **이미 손에 있는 값이다.** `useSessionUser()`가 마운트의 `me()` 결과를 들고 있어
 *    요청이 새로 나가지 않는다.
 * 3. **코멘트 탭이 같은 값으로 *"내가 쓴 것"*을 가른다**(`session/session-context.tsx`).
 *    같은 사실을 두 자리가 말하면 사용자가 그 판정을 화면에서 검산할 수 있다.
 *
 * **`null`이면 이름 자리를 비운다.** 그것은 실패가 아니라 *"아직 누구인지 모른다"*이고
 * (그 파일의 `useSessionUser` 주석), 누구인지 몰라도 로그아웃은 유효한 동작이다.
 *
 * ## 실패했을 때 — 상태를 끊지 않는다
 *
 * 성공하면 `signOut()`으로 세션을 끊는다(다른 탭에도 알린다 — `session-context.tsx`의 «탭 사이»).
 * **주소를 여기서 옮기지 않는다** —
 * `RequireAuth`가 `anonymous`를 보고 `/login`으로 보낸다(`routes/login.tsx`가 성공 뒤
 * `navigate`를 안 하는 것과 같은 근거: 목적지 규칙이 한 곳에 남는다).
 *
 * **실패하면 끊지 않고 이유를 말한다.** 서버가 세션을 안 지웠는데 화면만 끊으면 *"로그아웃
 * 했다"*가 거짓이 된다 — 쿠키는 살아 있어 다른 탭·다른 창이 그대로 들어간다. 그래서
 * `role="alert"` 한 문장으로 남긴다(이 셸의 다른 실패와 같은 모양 — `shell/edit-alert.tsx`).
 *
 * **`signed-out`만 성공으로 친다.** 서버가 *"세션이 없다"*고 답한 것은 로그아웃이 이루려던
 * 상태가 이미 참이라는 뜻이다. 그때 오류를 그리면 사용자는 나가지 못한 줄 알고 다시 누른다.
 * 판정 자체는 `api/failure.tsx`가 갖는다 — 여기서 `code`를 다시 읽지 않는다.
 */
import { useState, type ReactElement } from 'react'
import { Link } from 'react-router'
import { useApi } from '../api/context'
import { toFailure } from '../api/failure'
import { useSessionEpochNow, useSessionSwitched, useSessionUser, useSignOut } from './session-context'

/** 서버가 이유를 주지 않은 실패(네트워크 단절 등)에 쓸 문장. */
const UNKNOWN_FAILURE = '로그아웃하지 못했습니다'
/**
 * 이 탭이 로그인하지 않았는데 다른 사람이 됐을 때(`useSessionSwitched` — 다른 탭의 로그인 · 서버의 «쿠키의 사람이 다르다» 거절).
 * 목록으로 옮겨진 까닭을 말한다. **실패가 아니다** — 브라우저는 그 사람으로 로그인해 있다. 그래서 `status`다.
 */
export const SWITCHED_NOTICE = '다른 사람으로 로그인됐습니다 — 이 탭은 이제 머리의 사람의 화면입니다'

export function SessionMenu(props: {
  /**
   * **로그아웃 요청을 내기 전에 기다릴 것** — 에디터 셸이 보낸 편집의 답을 기다리게 넘긴다(`routes/editor.tsx`의 `editsAnswered`). 한도가
   * 있어야 한다 — 로그아웃은 권한을 줄이는 쓰기라 막히면 안 된다. 셸 밖(프로젝트 목록 · 토큰)은 넘기지 않는다. **기다림 뒤에도 잃는 것이
   * 있으면 그 한 줄을 돌려준다** — 로그아웃이 성공하면 로그인 화면이 그린다(`useSignOutNotice`). 없으면 `null`이다.
   */
  settle?: () => Promise<string | null>
}): ReactElement {
  const api = useApi()
  const user = useSessionUser()
  const switched = useSessionSwitched()
  // **끊고 다른 탭에 알린다**(`session-context.tsx`의 «탭 사이») — 401 의 무효화와 갈린다.
  const signOut = useSignOut()
  const epochNow = useSessionEpochNow()
  /** 실패 문장. **`Failure`를 통째로 들지 않는다** — `signed-out`은 아래에서 성공으로
   * 접히므로 이 자리에 올 수 있는 것은 문장 하나뿐이다. */
  const [failure, setFailure] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function run(): Promise<void> {
    setBusy(true)
    setFailure(null)
    const pressed = epochNow()
    const farewell = (await props.settle?.()) ?? null
    /**
     * **기다리는 동안 세션이 끝났으면 로그아웃하지 않는다** — 로그아웃 요청은 쿠키의 세션을 지운다. 기다림(`settle` — 한도 3s) 사이에 다른
     * 탭이 로그아웃하고 다른 사람으로 들어오면 쿠키는 그 사람의 것이라, 여기서 내면 그 사람의 세션을 끊고 끊었다고 다른 탭에 알린다
     * (jsdom: `test/session/logout-farewell.test.tsx`의 «로그아웃을 기다리는 동안 다른 탭에서 …»). 누를 때 끝내려던 세션은 이미 끝났다 —
     * 세대가 올랐다(세션이 끝나는 길은 전부 세대를 올린다 · 다른 사람으로 바뀌어도 오른다). 두고 간 편집의 한 줄은 이때 잃는다 — 그 한 줄은
     * 끝낸 세션의 세대에 매달리는데(`useSignOutNotice`) 그 세션을 끝낸 것은 이 탭이 아니다.
     */
    if (epochNow() !== pressed) {
      setBusy(false)
      return
    }
    try {
      await api.logout()
    } catch (caught) {
      const caughtFailure = toFailure(caught, UNKNOWN_FAILURE)
      // 세션이 이미 없다는 답은 실패가 아니다(머리말). 아래로 흘려보내 끊는다.
      if (caughtFailure.kind === 'message') {
        setFailure(caughtFailure.message)
        setBusy(false)
        return
      }
    }
    // **여기 뒤로 상태를 놓지 않는다.** 끊는 순간 문지기가 로그인으로 보내 이 컴포넌트가
    // 사라지므로, `setBusy(false)`는 사라진 것에 거는 일이 된다.
    signOut(farewell ?? undefined)
  }

  return (
    /* **묶음과 통지가 형제다** — 통지를 묶음 **안**에 넣으면 머리의 그 줄이 두 줄로 두꺼워진다.
       밖에 두면 `.wb-shell-session-alert`의 `flex-basis: 100%`가 머리의 `flex-wrap`을 타고
       아랫줄로 내려간다 — `.wb-shell-edit-alert`와 같은 자리이고 같은 장치다. */
    <>
      <div className="wb-shell-session">
        {user !== null && <span className="wb-shell-session-user">{user.name}</span>}
        {/* 이 계정의 API 토큰 — 거두는 화면이 여기서 열린다(`routes/tokens.tsx`). */}
        <Link className="wb-shell-session-tokens" to="/tokens">API 토큰</Link>
        {/* 요청이 도는 동안 잠근다 — 두 번 눌러 두 번 나갈 이유가 없다(로그인 폼과 같은 관례). */}
        <button
          type="button"
          className="wb-shell-session-logout"
          disabled={busy}
          onClick={() => void run()}
        >
          로그아웃
        </button>
      </div>
      {switched && (
        <p className="wb-shell-session-alert" role="status">
          {SWITCHED_NOTICE}
        </p>
      )}
      {failure !== null && (
        <p className="wb-shell-session-alert" role="alert">
          {failure}
        </p>
      )}
    </>
  )
}
