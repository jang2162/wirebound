/**
 * 새 비밀번호 두 칸(비밀번호 · 확인)과 그 판정 — 가입(`routes/invite.tsx`)과 재설정(`routes/reset.tsx`)이 함께 쓴다.
 *
 * **길이 자는 서버의 것이다** — `apps/api/src/auth/credentials.ts` 의 `NewPassword`(NFC 판으로 8 – 200 자). 화면이 먼저 말하는 것은 왕복 없이
 * 사람이 고칠 수 있게 하려는 것이고, 판정은 서버가 다시 한다.
 */
import type { ReactElement } from 'react'
import { PasswordInput } from './password-input'

export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 200
export const PASSWORD_TOO_SHORT = `비밀번호는 ${PASSWORD_MIN}자 이상이어야 합니다`
export const PASSWORD_TOO_LONG = `비밀번호는 ${PASSWORD_MAX}자 이하여야 합니다`
export const PASSWORD_MISMATCH = '두 비밀번호가 다릅니다'

/** 보내기 전 판정 — 문제가 없으면 `null`. */
export function checkNewPassword(password: string, confirm: string): string | null {
  const length = password.normalize('NFC').length
  if (length < PASSWORD_MIN) return PASSWORD_TOO_SHORT
  if (length > PASSWORD_MAX) return PASSWORD_TOO_LONG
  if (password !== confirm) return PASSWORD_MISMATCH
  return null
}

export function PasswordFields(props: {
  idPrefix: string
  password: string
  confirm: string
  onPassword: (value: string) => void
  onConfirm: (value: string) => void
}): ReactElement {
  return (
    <>
      <p className="wb-shell-login-field">
        <label className="wb-shell-login-label" htmlFor={`${props.idPrefix}-password`}>
          비밀번호({PASSWORD_MIN}자 이상)
        </label>
        <PasswordInput
          id={`${props.idPrefix}-password`}
          label="비밀번호"
          autoComplete="new-password"
          value={props.password}
          onChange={props.onPassword}
        />
      </p>
      <p className="wb-shell-login-field">
        <label className="wb-shell-login-label" htmlFor={`${props.idPrefix}-confirm`}>
          비밀번호 확인
        </label>
        <PasswordInput
          id={`${props.idPrefix}-confirm`}
          label="비밀번호 확인"
          autoComplete="new-password"
          value={props.confirm}
          onChange={props.onConfirm}
        />
      </p>
    </>
  )
}
