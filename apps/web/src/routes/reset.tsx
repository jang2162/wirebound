/**
 * **비밀번호 재설정 화면** — `/reset/<원문 토큰>`. 관리자가 만든 링크를 연 사람이 새 비밀번호를 정한다. 로그인 화면과 같은 꼴이고 뼈대
 * 밖이다. spec `docs/superpowers/specs/2026-10-31-workspace-admin-design.md` «비밀번호 재설정 화면».
 *
 * 먼저 링크를 확인해 누구의 비밀번호인지 보인다(`getPasswordReset`). 못 쓰는 링크(없음 · 만료 · 이미 씀)는 서버의 한 문장을 폼 대신 그린다.
 * 성공하면 서버가 그 사람의 세션을 전부 끊고, 화면은 로그인 화면으로 «비밀번호를 바꿨습니다» 한 줄을 들고 간다(`routes/login.tsx` 의
 * `LoginNotice`).
 */
import { useEffect, useState, type FormEvent, type ReactElement } from 'react'
import { useNavigate, useParams } from 'react-router'
import { ApiError } from '../api/client'
import { useApi } from '../api/context'
import type { LoginNotice } from './login'
import { checkNewPassword, PasswordFields } from '../account/new-password-fields'

export const PASSWORD_RESET_DONE = '비밀번호를 바꿨습니다 — 새 비밀번호로 로그인하세요'
const CHECK_FAILED = '재설정 링크를 확인하지 못했습니다 — 잠시 뒤 다시 열어 보세요'
const RESET_FAILED = '비밀번호를 바꾸지 못했습니다'

type LinkState =
  | { kind: 'checking' }
  | { kind: 'usable'; email: string; name: string }
  | { kind: 'unusable'; message: string }
  | { kind: 'failed' }

export function ResetRoute(): ReactElement {
  const api = useApi()
  const navigate = useNavigate()
  const token = useParams().token ?? ''
  const [link, setLink] = useState<LinkState>({ kind: 'checking' })
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let alive = true
    api.getPasswordReset(token).then(
      (target) => alive && setLink({ kind: 'usable', email: target.email, name: target.name }),
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
    const problem = checkNewPassword(password, confirm)
    if (problem !== null) return setError(problem)
    setSubmitting(true)
    setError(null)
    try {
      await api.completePasswordReset(token, password)
      const state: LoginNotice = { notice: PASSWORD_RESET_DONE }
      void navigate('/login', { replace: true, state })
    } catch (caught) {
      if (caught instanceof ApiError && caught.code === 'not-found') setLink({ kind: 'unusable', message: caught.message })
      else setError(caught instanceof ApiError ? caught.message : RESET_FAILED)
      setSubmitting(false)
    }
  }

  return (
    <main className="wb-shell-login">
      <h1 className="wb-shell-login-title">wirebound</h1>
      {link.kind === 'checking' && (
        <p className="wb-shell-login-notice" role="status">
          재설정 링크를 확인하는 중…
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
          <p className="wb-shell-login-notice">
            {link.name}({link.email})의 새 비밀번호를 정합니다
          </p>
          <form
            className="wb-shell-login-form"
            onSubmit={(event) => {
              void submit(event)
            }}
          >
            <PasswordFields idPrefix="reset" password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} />
            <button className="wb-shell-login-submit" type="submit" disabled={submitting}>
              비밀번호 바꾸기
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
