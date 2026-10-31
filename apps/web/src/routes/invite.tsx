/**
 * **초대 링크로 가입하는 화면** — `/invite/<원문 토큰>`. 로그인 화면과 같은 꼴이고 뼈대 밖이다(로그인한 사람은
 * `RedirectWhenAuthenticated` 가 목록으로 보낸다). spec `docs/superpowers/specs/2026-10-31-workspace-admin-design.md` «가입 화면».
 *
 * - 먼저 링크를 확인한다(`checkInvite`). 못 쓰는 링크(없음 · 만료 · 거둠 · 다 씀)는 서버가 한 문장을 내고 화면은 폼 대신 그 문장을 그린다.
 * - 칸 넷 — 이메일 · 이름 · 비밀번호 · 비밀번호 확인. 비밀번호 길이는 서버의 자(`RawPassword` — 8 자 이상)를 말하고, 확인이 다르면
 *   보내지 않는다.
 * - 성공하면 서버가 세션 쿠키를 심는다. 화면은 응답의 사용자로 세션을 확정하고(`useConfirmSession`), 주소는 `RedirectWhenAuthenticated`
 *   가 `/` 로 옮긴다 — 로그인 화면과 같은 까닭(`routes/login.tsx` 의 «여기서 주소를 옮기지 않는다»).
 */
import { useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { useParams } from 'react-router'
import { ApiError } from '../api/client'
import { useApi } from '../api/context'
import { useConfirmSession } from '../session/session-context'
import { checkNewPassword, PasswordFields } from './new-password'

const CHECK_FAILED = '초대 링크를 확인하지 못했습니다 — 잠시 뒤 다시 열어 보세요'
const SIGNUP_FAILED = '가입하지 못했습니다'
const EMPTY_EMAIL = '이메일을 입력하세요'
const EMPTY_NAME = '이름을 입력하세요'

type LinkState = { kind: 'checking' } | { kind: 'usable' } | { kind: 'unusable'; message: string } | { kind: 'failed' }

export function InviteRoute(): ReactElement {
  const api = useApi()
  const confirmSession = useConfirmSession()
  const token = useParams().token ?? ''
  const [link, setLink] = useState<LinkState>({ kind: 'checking' })
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let alive = true
    api.checkInvite(token).then(
      () => alive && setLink({ kind: 'usable' }),
      (caught: unknown) => {
        if (!alive) return
        if (caught instanceof ApiError && caught.code === 'not-found') setLink({ kind: 'unusable', message: caught.message })
        else setLink({ kind: 'failed' })
      },
    )
    return () => {
      alive = false
    }
  }, [api, token])

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (email.trim() === '') return setError(EMPTY_EMAIL)
    if (name.trim() === '') return setError(EMPTY_NAME)
    const problem = checkNewPassword(password, confirm)
    if (problem !== null) return setError(problem)

    setSubmitting(true)
    setError(null)
    try {
      confirmSession(await api.signupWithInvite(token, { email: email.trim(), name: name.trim(), password }))
    } catch (caught) {
      // 그새 못 쓰게 된 링크(다른 사람이 먼저 썼다 · 거뒀다)는 폼째 그 문장으로 바꾼다 — 다시 눌러도 같다.
      if (caught instanceof ApiError && caught.code === 'not-found') setLink({ kind: 'unusable', message: caught.message })
      else setError(caught instanceof ApiError ? caught.message : SIGNUP_FAILED)
      setSubmitting(false)
    }
  }

  return (
    <main className="wb-shell-login">
      <h1 className="wb-shell-login-title">wirebound</h1>
      {link.kind === 'checking' && (
        <p className="wb-shell-login-notice" role="status">
          초대 링크를 확인하는 중…
        </p>
      )}
      {link.kind === 'unusable' && (
        <p className="wb-shell-login-error" role="alert">
          {link.message}
        </p>
      )}
      {link.kind === 'failed' && (
        <p className="wb-shell-login-error" role="alert">
          {CHECK_FAILED}
        </p>
      )}
      {link.kind === 'usable' && (
        <>
          <p className="wb-shell-login-notice">초대받은 계정을 만듭니다</p>
          <form
            className="wb-shell-login-form"
            onSubmit={(event) => {
              void submit(event)
            }}
          >
            <p className="wb-shell-login-field">
              <label className="wb-shell-login-label" htmlFor="invite-email">
                이메일
              </label>
              <input
                className="wb-shell-login-input"
                id="invite-email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </p>
            <p className="wb-shell-login-field">
              <label className="wb-shell-login-label" htmlFor="invite-name">
                이름
              </label>
              <input
                className="wb-shell-login-input"
                id="invite-name"
                autoComplete="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </p>
            <PasswordFields idPrefix="invite" password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} />
            <button className="wb-shell-login-submit" type="submit" disabled={submitting}>
              가입
            </button>
          </form>
          {error !== null && (
            <p className="wb-shell-login-error" role="alert">
              {error}
            </p>
          )}
        </>
      )}
    </main>
  )
}
