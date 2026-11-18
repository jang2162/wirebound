/**
 * 로그인 화면. 성공하면 서버가 세션 쿠키를 심어 주고, 이 화면은 프로젝트 목록으로 넘긴다.
 */
import { useState, type FormEvent, type ReactElement } from 'react'
import { useLocation } from 'react-router'
import { ApiError } from '../api/client'
import { useApi } from '../api/context'
import { PasswordInput } from '../account/password-input'
import { useConfirmSession, useSignOutNotice } from '../session/session-context'

/** 서버까지 가 보지 않아도 실패가 확실한 경우에만 쓰는 문장. */
const EMPTY_EMAIL = '이메일을 입력하세요'
const EMPTY_PASSWORD = '비밀번호를 입력하세요'
/** 서버가 이유를 주지 않은 실패(네트워크 단절 등)에 쓸 문장. */
const UNKNOWN_FAILURE = '로그인하지 못했습니다'
/** 무엇을 하는 화면인가 — 제목 밑 한 줄. */
const LEAD = '화면 설계서 작업 공간에 로그인합니다'
/**
 * 비밀번호를 잊었을 때의 길. **그 길이 실제로 있다** — 인스턴스 관리자가 «관리자 › 사용자» 의 줄 «…» «재설정 링크 만들기» 로 링크를 짓고
 * (`admin/users-section.tsx`), 받은 사람이 `/reset/<원문>` 에서 바꾼다(`routes/reset.tsx`). 서버 명령(`apps/api/src/db/reset-password.ts`)은
 * 관리자가 없을 때의 길이라 이 문장이 가리키지 않는다.
 */
const RESET_HINT = '비밀번호를 잊었으면 관리자에게 재설정 링크를 요청하세요'

/** 다른 화면이 로그인 화면으로 보내며 들려 보내는 한 줄(주소 상태) — 재설정을 마친 화면(`routes/reset.tsx`)이 쓴다. */
export interface LoginNotice {
  notice: string
}

function noticeOf(state: unknown): string | null {
  return typeof state === 'object' && state !== null && typeof (state as { notice?: unknown }).notice === 'string'
    ? (state as LoginNotice).notice
    : null
}

export function LoginRoute(): ReactElement {
  const api = useApi()
  const confirmSession = useConfirmSession()
  // 이 탭이 로그아웃하며 남긴 한 줄 — 에디터의 로그아웃이 한도 뒤에 두고 간 편집을 말한다(`useSignOutNotice`).
  const farewell = useSignOutNotice()
  const notice = noticeOf(useLocation().state)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()

    // 빈 칸은 서버에 물어볼 것도 없이 실패한다. 왕복을 아끼려는 것이 아니라, 왕복하면
    // 사용자가 자기 오타 대신 서버의 일반적인 거절 문구를 보게 되기 때문이다.
    if (email.trim() === '') {
      setError(EMPTY_EMAIL)
      return
    }
    if (password === '') {
      setError(EMPTY_PASSWORD)
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const user = await api.login(email, password)
      // **여기서 주소를 옮기지 않는다.** 상태가 `authenticated`가 되면 이 화면을 감싼
      // `RedirectWhenAuthenticated`가 목록으로 보낸다 — "로그인한 사람은 `/login`에
      // 머물지 않는다"는 규칙이 그 한 곳에만 남는다. `navigate('/')`를 여기 함께 두면
      // 규칙이 두 벌이 된다.
      //
      // **되튕김의 조건은 "순서를 뒤집으면"이 아니라 "확정이 이동보다 한 틱 이상 늦으면"
      // 이다.** 재서 확인했다 — `navigate('/')`를 앞에 두고 `confirmSession()`을 뒤에 둔
      // 판은 주소 자취가 `["/login","/"]`로 지금과 **똑같고** 되튕기지 않는다. React가
      // 같은 틱의 두 setState를 배치하므로 중간 상태(`anonymous` + `/`)가 커밋되지
      // 않는다. 둘 사이에 틱 하나(`await setTimeout(0)`)를 넣으면 자취가
      // `["/login","/","/login","/"]`가 되어 **되튕김이 실제로 난다.**
      //
      // **그 계약은 테스트로 고정돼 있지 않다.** 되튕김이 나는 판에서도 죽는 케이스가
      // 0개다(web 전량 재확인). 지금 코드에 `navigate`가 없어 도달 가능한 결함이
      // 아니라 케이스를 두지 않는다 — **`navigate`를 되살리는 사람이 그 케이스를 함께
      // 만들어야 한다.**
      //
      // 세션을 다시 묻지 않는 것이 요점이다. `RequireAuth`가 마운트마다 `me()`를 새로
      // 부르게 하면 이 일이 저절로 되지만, 그것이 `/`와 `/login`이 서로를 무한히 튕기는
      // 순환의 엔진이 된다(`session/session-context.tsx` 머리말).
      // **응답의 사용자를 그대로 넘긴다.** 마운트의 `me()`는 그때 401이었으므로
      // 이것을 안 넘기면 갓 로그인한 사람은 자기가 누구인지 모르는 채로 화면에 들어간다.
      confirmSession(user)
    } catch (caught) {
      // 서버가 준 문장을 그대로 보여준다. 화면이 문안을 다시 쓰면 서버가 거절 이유를
      // 바꿔도 사용자는 옛 이유를 듣게 된다.
      setError(caught instanceof ApiError ? caught.message : UNKNOWN_FAILURE)
      // 성공했을 때는 이 화면을 떠나므로 되돌리지 않는다.
      setSubmitting(false)
    }
  }

  return (
    // **클래스는 전부 `wb-shell-` 접두어를 쓴다.** 이 화면은 셸 안이 아니지만 스타일이
    // `src/shell.css` 한 파일에 있고, `test/shell-css.test.ts`가 그 접두어를 기계로
    // 지킨다 — 프로젝트 목록·스냅샷·테마 화면이 같은 자리에서 같은 규칙을 따른다.
    <main className="wb-shell-login">
      {/* **화면 가운데 카드 하나** — 무엇을 하는 화면인지 한 줄(`LEAD`)과 폼 · 재설정 안내를 품는다. 초대 · 재설정 화면도 같은 꼴이다. */}
      <div className="wb-shell-login-card">
        <h1 className="wb-shell-login-title">wirebound</h1>
        <p className="wb-shell-login-lead">{LEAD}</p>
        {farewell !== null && (
          <p className="wb-shell-login-notice" role="status">
            {farewell}
          </p>
        )}
        {notice !== null && (
          <p className="wb-shell-login-notice" role="status">
            {notice}
          </p>
        )}
        <form
          className="wb-shell-login-form"
          onSubmit={(event) => {
            void submit(event)
          }}
        >
          <p className="wb-shell-login-field">
            <label className="wb-shell-login-label" htmlFor="login-email">
              이메일
            </label>
            <input
              className="wb-shell-login-input"
              id="login-email"
              type="email"
              autoComplete="email"
              value={email}
              // 실패한 뒤에도 입력을 지우지 않는다. 다시 타이핑하게 만들면 사용자는 자기
              // 이메일이 문제였다고 오해한다.
              onChange={(event) => setEmail(event.target.value)}
            />
          </p>
          <p className="wb-shell-login-field">
            <label className="wb-shell-login-label" htmlFor="login-password">
              비밀번호
            </label>
            <PasswordInput id="login-password" label="비밀번호" autoComplete="current-password" value={password} onChange={setPassword} />
          </p>
          {/* 요청이 도는 동안 잠근다 — 두 번 눌러 두 세션을 만들 이유가 없다. */}
          <button className="wb-shell-login-submit" type="submit" disabled={submitting}>
            로그인
          </button>
        </form>
        {error !== null && (
          <p className="wb-shell-login-error" role="alert">
            {error}
          </p>
        )}
        <p className="wb-shell-login-hint">{RESET_HINT}</p>
      </div>
    </main>
  )
}
