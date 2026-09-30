/**
 * 계정 설정의 **«비밀번호 바꾸기»** 절 — 지금 · 새 · 새 확인(`POST /api/auth/password`).
 *
 * - **새 두 칸이 다르면 보내지 않는다** — 서버는 새 비밀번호를 한 칸만 받는다. 규칙(길이)은 서버가 400 과 이유로 말한다 — 두 곳에
 *   두면 갈린다(`settings/general-section.tsx` 의 슬러그와 같은 판단).
 * - **`wrong-password`(401)는 세션 끝이 아니다.** 같은 401 `unauthenticated`라도 이 이슈 코드면 세션은 그대로다(서버가 그렇게
 *   답한다). `toFailure`에 먼저 넘기면 «세션이 끊겼다»로 읽혀 로그인 화면으로 간다 — 이 코드를 먼저 가른다. 이슈 없는 401 은
 *   진짜 세션 끝이라 `toFailure`의 길로 간다.
 * - 429 · 400 은 서버 문장 그대로다(기다릴 시간 · 이유). 틀렸을 때는 친 새 비밀번호를 남긴다 — 지금 비밀번호만 다시 치면 된다.
 * - 성공하면 세 칸을 비운다 — 이 세션은 남고 다른 기기의 로그인은 끝났다(서버). API 토큰은 안 거둬진다 — 아래 토큰 절이 그 길이다.
 */
import { useId, useState, type ReactElement } from 'react'
import { ApiError, WRONG_PASSWORD } from '../api/client'
import { useApi } from '../api/context'
import { SignedOut, toFailure } from '../api/failure'

const CHANGED = '비밀번호를 바꿨습니다. 다른 기기의 로그인은 끊겼습니다.'
const MISMATCH = '새 비밀번호 두 칸이 다릅니다'
const WRONG = '지금 비밀번호가 맞지 않습니다'
const CHANGE_FAILURE = '비밀번호를 바꾸지 못했습니다'

type Outcome =
  | { kind: 'idle' }
  | { kind: 'changed' }
  | { kind: 'mismatch' }
  | { kind: 'wrong' }
  | { kind: 'signed-out' }
  | { kind: 'failed'; message: string }

function isWrongPassword(caught: unknown): boolean {
  return caught instanceof ApiError && caught.code === 'unauthenticated' && caught.issues.some((issue) => issue.code === WRONG_PASSWORD)
}

export function PasswordSection(): ReactElement {
  const api = useApi()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' })
  const heading = useId()
  const ids = { current: useId(), next: useId(), again: useId() }

  async function change(): Promise<void> {
    if (busy) return
    if (next !== again) {
      setOutcome({ kind: 'mismatch' })
      return
    }
    setBusy(true)
    setOutcome({ kind: 'idle' })
    try {
      await api.changePassword(current, next)
      setCurrent('')
      setNext('')
      setAgain('')
      setOutcome({ kind: 'changed' })
    } catch (caught) {
      if (isWrongPassword(caught)) {
        setCurrent('')
        setOutcome({ kind: 'wrong' })
      } else {
        const read = toFailure(caught, CHANGE_FAILURE)
        setOutcome(read.kind === 'signed-out' ? { kind: 'signed-out' } : { kind: 'failed', message: read.message })
      }
    } finally {
      setBusy(false)
    }
  }

  if (outcome.kind === 'signed-out') return <SignedOut />

  return (
    <section className="wb-shell-settings-section" aria-labelledby={heading}>
      <h2 className="wb-shell-settings-section-title" id={heading}>
        비밀번호 바꾸기
      </h2>
      <form
        className="wb-shell-settings-form"
        onSubmit={(event) => {
          event.preventDefault()
          void change()
        }}
      >
        <PasswordField id={ids.current} label="지금 비밀번호" autoComplete="current-password" value={current} busy={busy} onChange={setCurrent}>
          {outcome.kind === 'wrong' && (
            <p className="wb-shell-settings-field-alert" role="alert">
              {WRONG}
            </p>
          )}
        </PasswordField>
        <PasswordField id={ids.next} label="새 비밀번호" autoComplete="new-password" value={next} busy={busy} onChange={setNext} />
        <PasswordField id={ids.again} label="새 비밀번호 확인" autoComplete="new-password" value={again} busy={busy} onChange={setAgain}>
          {outcome.kind === 'mismatch' && (
            <p className="wb-shell-settings-field-alert" role="alert">
              {MISMATCH}
            </p>
          )}
        </PasswordField>
        <button className="wb-shell-project-submit" type="submit" disabled={busy || current === '' || next === ''}>
          비밀번호 바꾸기
        </button>
        {outcome.kind === 'failed' && (
          <p className="wb-shell-project-alert" role="alert">
            {outcome.message}
          </p>
        )}
        {outcome.kind === 'changed' && (
          <p className="wb-shell-project-notice" role="status">
            {CHANGED}
          </p>
        )}
      </form>
    </section>
  )
}

function PasswordField(props: {
  id: string
  label: string
  autoComplete: 'current-password' | 'new-password'
  value: string
  busy: boolean
  onChange: (value: string) => void
  children?: ReactElement | false
}): ReactElement {
  return (
    <div className="wb-shell-settings-field">
      <label className="wb-shell-settings-label" htmlFor={props.id}>
        {props.label}
      </label>
      <input
        className="wb-shell-settings-input"
        id={props.id}
        type="password"
        autoComplete={props.autoComplete}
        value={props.value}
        disabled={props.busy}
        onChange={(event) => props.onChange(event.target.value)}
      />
      {props.children}
    </div>
  )
}
