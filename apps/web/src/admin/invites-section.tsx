/**
 * **관리자 › 초대 링크** — `/admin/invites`(설계 `docs/superpowers/specs/2026-10-31-workspace-admin-design.md` «관리자 › 초대 링크» · «초대 링크»).
 *
 * - 표: 이름(메모) · 종류 · 만료 · 가입 수 · 상태 · 만든 사람. 줄 «…» 는 **쓸 수 있는 링크에만** 있고 «거두기» 하나다(확인 상자를 거친다).
 * - **목록에 «복사» 가 없다** — 서버는 원문을 해시로만 둔다. 원문은 만들기 응답에만 실려 그 자리의 `LinkReveal` 이 한 번 보인다(목업에는 목록에
 *   «복사» 가 늘 있었다 — 설계가 그 차이를 적는다).
 * - **만들기 상자(`InviteCreateDialog`)는 «사용자» 칸의 «초대 링크 만들기» 도 연다** — 같은 상자 · 같은 검사다.
 */
import { useCallback, useId, useState, type ReactElement } from 'react'
import { useApi } from '../api/context'
import { SignedOut, toFailure, type Failure } from '../api/failure'
import type { AdminInvite, CreatedInvite, InviteKind, InviteState } from '../api/types'
import { ActionMenu } from '../shell/action-menu'
import { ICONS, shellIcon } from '../shell/icons'
import { isolate } from '../shell/isolate'
import { ShellDialog } from '../shell/shell-dialog'
import { confirmClick, Outcome, useAdminList, When } from './admin-screen'
import { LinkReveal, linkUrl } from './link-reveal'

const LOAD_FAILURE = '초대 링크 목록을 불러오지 못했습니다'
const WRITE_FAILURE = '초대 링크를 바꾸지 못했습니다'
const CREATE_FAILURE = '초대 링크를 만들지 못했습니다'
export const NO_INVITES = '만든 초대 링크가 없습니다'
/** 만료 고르개의 범위 — 서버의 범위(1 – 90 일 · 기본 7 일)와 같다(서버 `routes/admin-invites.ts` 의 `CreateBody`). */
export const INVITE_DAYS = { min: 1, max: 90, default: 7 } as const
const NAME_MAX = 60

export const KIND_TEXT: Record<InviteKind, string> = { single: '한 번', multi: '여러 명' }
export const STATE_TEXT: Record<InviteState, string> = { usable: '사용 중', expired: '만료', revoked: '거둠', 'used-up': '다 씀' }

export function InvitesSection(): ReactElement {
  const api = useApi()
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<CreatedInvite | null>(null)
  const [revoking, setRevoking] = useState<AdminInvite | null>(null)

  const {
    list: state,
    stale,
    reload,
  } = useAdminList(
    useCallback(() => api.listInvites(), [api]),
    LOAD_FAILURE,
  )

  async function revoke(invite: AdminInvite): Promise<void> {
    setRevoking(null)
    setBusy(true)
    setDone(null)
    setFailure(null)
    try {
      await api.revokeInvite(invite.id)
      setDone(`«${isolate(invite.name)}» — 거뒀습니다. 이 링크로는 가입할 수 없습니다.`)
    } catch (caught) {
      setFailure(toFailure(caught, WRITE_FAILURE))
    }
    await reload()
    setBusy(false)
  }

  if (state.status === 'failed' && state.failure.kind === 'signed-out') return <SignedOut />
  if (failure !== null && failure.kind === 'signed-out') return <SignedOut />

  return (
    <>
      <div className="wb-shell-admin-bar">
        <button className="wb-shell-project-submit" type="button" disabled={busy} onClick={() => setCreating(true)}>
          {shellIcon('createInvite', 14, 'wb-shell-icon-lead')}
          초대 링크 만들기
        </button>
      </div>
      {created !== null && (
        <LinkReveal
          key={created.token}
          title={`초대 링크 «${isolate(created.invite.name)}»`}
          url={linkUrl('invite', created.token)}
          expiresAt={created.invite.expiresAt}
          onClose={() => setCreated(null)}
        />
      )}
      <Outcome done={done} failure={failure?.kind === 'message' ? failure.message : null} stale={stale} />
      {state.status === 'loading' && (
        <p className="wb-shell-project-notice" role="status">
          불러오는 중…
        </p>
      )}
      {state.status === 'failed' && state.failure.kind === 'message' && (
        <p className="wb-shell-project-alert" role="alert">
          {state.failure.message}
        </p>
      )}
      {state.status === 'ready' && state.value.length === 0 && <p className="wb-shell-project-notice">{NO_INVITES}</p>}
      {state.status === 'ready' && state.value.length > 0 && (
        <table className="wb-shell-admin-table" aria-label="초대 링크">
          <thead className="wb-shell-admin-head">
            <tr className="wb-shell-admin-head-row">
              <th className="wb-shell-admin-th" scope="col">
                이름
              </th>
              <th className="wb-shell-admin-th" scope="col">
                종류
              </th>
              <th className="wb-shell-admin-th" scope="col">
                만료
              </th>
              <th className="wb-shell-admin-th" scope="col">
                가입
              </th>
              <th className="wb-shell-admin-th" scope="col">
                상태
              </th>
              <th className="wb-shell-admin-th" scope="col">
                만든 사람
              </th>
              <th className="wb-shell-admin-th" scope="col">
                <span className="wb-shell-admin-sr">행동</span>
              </th>
            </tr>
          </thead>
          <tbody className="wb-shell-admin-body">
            {state.value.map((invite) => (
              <tr className="wb-shell-admin-row" key={invite.id} data-active={invite.state === 'usable' ? 'true' : 'false'}>
                <td className="wb-shell-admin-cell wb-shell-admin-cell-name" data-label="이름">
                  {isolate(invite.name)}
                </td>
                <td className="wb-shell-admin-cell" data-label="종류">
                  {KIND_TEXT[invite.kind]}
                </td>
                <td className="wb-shell-admin-cell" data-label="만료">
                  <When iso={invite.expiresAt} />
                </td>
                <td className="wb-shell-admin-cell" data-label="가입">
                  {`${invite.signups}명`}
                </td>
                <td className="wb-shell-admin-cell" data-label="상태">
                  {STATE_TEXT[invite.state] ?? invite.state}
                </td>
                <td className="wb-shell-admin-cell" data-label="만든 사람">
                  {isolate(invite.createdBy.name)}
                </td>
                <td className="wb-shell-admin-cell wb-shell-admin-cell-menu">
                  {invite.state === 'usable' && (
                    <ActionMenu
                      label={`«${invite.name}» 더 보기`}
                      items={[
                        { key: 'revoke', label: '거두기', icon: ICONS.revokeInvite, danger: true, onSelect: () => setRevoking(invite) },
                      ]}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <InviteCreateDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(result) => {
          setCreating(false)
          setDone(null)
          setFailure(null)
          setCreated(result)
          void reload()
        }}
      />
      <ShellDialog open={revoking !== null} title="초대 링크 거두기" onClose={() => setRevoking(null)}>
        {revoking !== null && (
          <div className="wb-shell-admin-dialog-body">
            <p className="wb-shell-admin-dialog-sentence">{`«${isolate(revoking.name)}» 링크를 거둡니다. 거둔 링크로는 가입할 수 없습니다.`}</p>
            <p className="wb-shell-admin-dialog-sentence">이 링크로 이미 만든 계정에는 아무 일도 없습니다.</p>
            <div className="wb-shell-admin-dialog-foot">
              <button className="wb-shell-project-action" type="button" onClick={() => setRevoking(null)}>
                취소
              </button>
              <button className="wb-shell-project-danger" type="button" disabled={busy} onClick={confirmClick(() => void revoke(revoking))}>
                거두기
              </button>
            </div>
          </div>
        )}
      </ShellDialog>
    </>
  )
}

/**
 * **초대 링크 만들기 상자** — 이름(메모) · 종류 · 만료(일). 만들면 상자를 닫고 응답을 부른 쪽에 넘긴다 — 원문을 보이는 것은 부른 쪽의
 * `LinkReveal` 이다(상자를 닫는 Escape 한 번에 원문을 잃지 않게).
 */
export function InviteCreateDialog(props: {
  open: boolean
  onClose: () => void
  onCreated: (created: CreatedInvite) => void
}): ReactElement | null {
  if (!props.open) return null
  return <OpenInviteCreate onClose={props.onClose} onCreated={props.onCreated} />
}

function OpenInviteCreate(props: { onClose: () => void; onCreated: (created: CreatedInvite) => void }): ReactElement {
  const api = useApi()
  const [name, setName] = useState('')
  const [kind, setKind] = useState<InviteKind>('single')
  const [days, setDays] = useState(String(INVITE_DAYS.default))
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const ids = { name: useId(), days: useId(), kind: useId() }

  async function submit(): Promise<void> {
    if (busy) return
    const trimmed = name.trim()
    const n = Number(days)
    if (trimmed === '') return setProblem('이름을 적으세요 — 누구에게 줄 링크인지 알아보는 메모입니다')
    if (trimmed.length > NAME_MAX) return setProblem(`이름은 ${NAME_MAX}자까지입니다`)
    if (!Number.isInteger(n) || n < INVITE_DAYS.min || n > INVITE_DAYS.max) {
      return setProblem(`만료는 ${INVITE_DAYS.min} – ${INVITE_DAYS.max}일 가운데 고르세요`)
    }
    setBusy(true)
    setProblem(null)
    try {
      props.onCreated(await api.createInvite({ name: trimmed, kind, expiresInDays: n }))
    } catch (caught) {
      const failure = toFailure(caught, CREATE_FAILURE)
      setProblem(failure.kind === 'message' ? failure.message : CREATE_FAILURE)
      setBusy(false)
    }
  }

  return (
    <ShellDialog open title="초대 링크 만들기" onClose={props.onClose}>
      {/* 브라우저의 칸 검사(`min` · `max`)는 끈다 — 말풍선은 칸 곁에 잠깐 떴다 사라져, 범위를 화면 문장 하나로 말한다. */}
      <form
        className="wb-shell-admin-dialog-body"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <label className="wb-shell-settings-label" htmlFor={ids.name}>
          이름(메모)
        </label>
        <input
          className="wb-shell-settings-input"
          id={ids.name}
          type="text"
          value={name}
          maxLength={NAME_MAX}
          disabled={busy}
          onChange={(event) => setName(event.target.value)}
        />
        <fieldset className="wb-shell-admin-dialog-choices">
          <legend className="wb-shell-settings-label">종류</legend>
          {(['single', 'multi'] as const).map((value) => (
            <label className="wb-shell-admin-dialog-choice" key={value}>
              <input type="radio" name={ids.kind} value={value} checked={kind === value} disabled={busy} onChange={() => setKind(value)} />
              {value === 'single' ? '한 번 — 가입 하나로 다 씁니다' : '여러 명 — 만료 · 거둠까지 몇 명이든'}
            </label>
          ))}
        </fieldset>
        <label className="wb-shell-settings-label" htmlFor={ids.days}>
          {`만료(일 — ${INVITE_DAYS.min} – ${INVITE_DAYS.max})`}
        </label>
        <input
          className="wb-shell-settings-input wb-shell-admin-dialog-days"
          id={ids.days}
          type="number"
          min={INVITE_DAYS.min}
          max={INVITE_DAYS.max}
          step={1}
          value={days}
          disabled={busy}
          onChange={(event) => setDays(event.target.value)}
        />
        {problem !== null && (
          <p className="wb-shell-project-alert" role="alert">
            {problem}
          </p>
        )}
        <div className="wb-shell-admin-dialog-foot">
          <button className="wb-shell-project-action" type="button" onClick={props.onClose}>
            취소
          </button>
          <button className="wb-shell-project-submit" type="submit" disabled={busy}>
            만들기
          </button>
        </div>
      </form>
    </ShellDialog>
  )
}
