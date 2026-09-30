/**
 * 설정 페이지의 **«멤버»** 절 — 목록(모든 역할) · 초대 · 역할 바꾸기 · 제외(owner — `projectAbilities(role).manageMembers`). api 는
 * `GET · POST · PATCH · DELETE /api/projects/:projectId/members`(서버 README 「엔드포인트」).
 *
 * - **서버 문장을 그대로 옮긴다** — 없는 계정 404 · 이미 멤버 409 · 마지막 owner 409 · 역할 부족 403. 화면이 문안을 다시 쓰면 서버가
 *   이유를 바꿔도 옛 이유를 말한다(`api/failure.tsx` 머리말).
 * - **성공이든 실패든 목록을 다시 받는다** — 받은 줄만 고쳐 그리면 그 사이 다른 owner 가 바꾼 것과 갈린다. 역할 고르개는 받은
 *   목록의 값에 매인 제어 값이라, 거절된 바꾸기(마지막 owner 강등 409)는 다시 받기 전에도 고르개에 남지 않는다.
 * - **나를 바꾸면 페이지가 역할을 다시 읽는다**(`onSelfChanged`) — 설정 페이지는 실시간 룸에 없어 권한 바뀜 통지를 못 받는다(에디터
 *   셸만 받는다 — `routes/editor.tsx`의 `roleNotice`). 다시 읽으면 owner 칸(이 절 · «일반» · «테마»)이 새 역할로 닫히고, 나를 뺐으면
 *   다음 조회가 404 라 페이지가 «찾을 수 없음»이 된다. **남이 나를 바꾼 것은 다시 읽기 전까지 모른다** — 서버가 막는다(403 · 404).
 * - **제외는 두 번 누른다** — 그 사람의 그 프로젝트 토큰까지 함께 지워진다(서버). 확정은 연타의 둘째 누름을 버린다(`detail > 1` —
 *   `account/tokens-section.tsx` 의 «더블클릭 한 번이 두 누름을 다 지나면 안 된다»와 같은 겹. 그 파일의 둘째 겹(확정이 묻던 자리에
 *   서지 않음)은 여기서 재지 않았다).
 *
 * 멤버 줄의 `member.role` 은 **그 멤버의** 역할(보이고 바꿀 값)이고 `member.userId === me` 는 «이 줄이 나인가»다 — 부르는 사람의
 * 권한 판정은 `projectAbilities(project.role)` 하나다. 두 글자 자(`test/role-access.test.ts` 의 `.role` · `test/lock/one-verdict.test.ts` 의
 * 소유자 비교)가 이 파일을 «판정한 예외»로 든다.
 */
import { useCallback, useEffect, useId, useState, type MouseEvent, type ReactElement } from 'react'
import { useApi } from '../api/context'
import { SignedOut, toFailure, type Failure } from '../api/failure'
import type { ProjectMember, ProjectRole, ProjectView } from '../api/types'
import { projectAbilities } from '../projects/project-actions'
import { useSessionUser } from '../session/session-context'

const LOAD_FAILURE = '멤버 목록을 불러오지 못했습니다'
const WRITE_FAILURE = '멤버를 바꾸지 못했습니다'
const ROLES: readonly ProjectRole[] = ['owner', 'editor', 'viewer']

type ListState = { status: 'loading' } | { status: 'failed'; failure: Failure } | { status: 'ready'; members: ProjectMember[] }

/** 확정 단추의 `onClick` — 연타의 둘째 누름을 버린다(머리말 «제외는 두 번 누른다»). */
function confirmClick(action: () => void): (event: MouseEvent<HTMLButtonElement>) => void {
  return (event) => {
    if (event.detail > 1) return
    action()
  }
}

export function MembersSection(props: { project: ProjectView; onSelfChanged: () => void }): ReactElement {
  const api = useApi()
  const me = useSessionUser()
  const { project, onSelfChanged } = props
  const manage = projectAbilities(project.role).manageMembers
  const [state, setState] = useState<ListState>({ status: 'loading' })
  const [failure, setFailure] = useState<Failure | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirming, setConfirming] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [inviteRole, setInviteRole] = useState<ProjectRole>('editor')
  const heading = useId()
  const ids = { email: useId(), grade: useId() }

  const load = useCallback(async (): Promise<void> => {
    try {
      setState({ status: 'ready', members: await api.listMembers(project.id) })
    } catch (caught) {
      setState({ status: 'failed', failure: toFailure(caught, LOAD_FAILURE) })
    }
  }, [api, project.id])

  useEffect(() => {
    void load()
  }, [load])

  /** 쓰기 하나 — 실패는 문장으로, 끝나면 목록을 다시 받는다. 나를 바꾼 쓰기가 성공하면 페이지가 역할을 다시 읽는다. */
  async function write(run: () => Promise<unknown>, self: boolean): Promise<boolean> {
    setBusy(true)
    setFailure(null)
    let ok = false
    try {
      await run()
      ok = true
    } catch (caught) {
      setFailure(toFailure(caught, WRITE_FAILURE))
    }
    await load()
    setBusy(false)
    if (ok && self) onSelfChanged()
    return ok
  }

  async function invite(): Promise<void> {
    if (busy || email === '') return
    if (await write(() => api.addMember(project.id, email, inviteRole), false)) setEmail('')
  }

  if (state.status === 'failed' && state.failure.kind === 'signed-out') return <SignedOut />
  if (failure !== null && failure.kind === 'signed-out') return <SignedOut />

  return (
    <section className="wb-shell-settings-section" aria-labelledby={heading}>
      <h2 className="wb-shell-settings-section-title" id={heading}>
        멤버
      </h2>

      {manage && (
        <form
          className="wb-shell-members-invite"
          onSubmit={(event) => {
            event.preventDefault()
            void invite()
          }}
        >
          <label className="wb-shell-settings-label" htmlFor={ids.email}>
            초대할 이메일
          </label>
          <input
            className="wb-shell-settings-input"
            id={ids.email}
            type="email"
            value={email}
            disabled={busy}
            onChange={(event) => setEmail(event.target.value)}
          />
          <label className="wb-shell-settings-label" htmlFor={ids.grade}>
            초대할 역할
          </label>
          <RoleSelect id={ids.grade} value={inviteRole} busy={busy} onChange={setInviteRole} />
          <button className="wb-shell-project-submit" type="submit" disabled={busy || email === ''}>
            초대
          </button>
        </form>
      )}

      {failure !== null && failure.kind === 'message' && (
        <p className="wb-shell-project-alert" role="alert">
          {failure.message}
        </p>
      )}
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
      {state.status === 'ready' && (
        <ul className="wb-shell-project-items" aria-label="멤버">
          {state.members.map((member) => {
            const { userId, name } = member
            const self = member.userId === me?.id
            return (
              <li className="wb-shell-project-item" key={userId}>
                <span className="wb-shell-members-name">{name}</span>
                <span className="wb-shell-members-email">{member.email}</span>
                {manage ? (
                  <RoleSelect
                    label={`${name}의 역할`}
                    value={member.role}
                    busy={busy}
                    onChange={(next) => void write(() => api.updateMemberRole(project.id, userId, next), self)}
                  />
                ) : (
                  <span className="wb-shell-members-role">{member.role}</span>
                )}
                {manage &&
                  (confirming === userId ? (
                    <>
                      <button className="wb-shell-project-action" type="button" disabled={busy} onClick={() => setConfirming(null)}>
                        취소
                      </button>
                      <button
                        className="wb-shell-project-danger"
                        type="button"
                        disabled={busy}
                        onClick={confirmClick(() => {
                          setConfirming(null)
                          void write(() => api.removeMember(project.id, userId), self)
                        })}
                      >
                        {`${name} 제외 확정`}
                      </button>
                    </>
                  ) : (
                    <button className="wb-shell-project-action" type="button" disabled={busy} onClick={() => setConfirming(userId)}>
                      {`${name} 제외`}
                    </button>
                  ))}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function RoleSelect(props: { id?: string; label?: string; value: ProjectRole; busy: boolean; onChange: (role: ProjectRole) => void }): ReactElement {
  return (
    <select
      className="wb-shell-members-role"
      id={props.id}
      aria-label={props.label}
      value={props.value}
      disabled={props.busy}
      onChange={(event) => props.onChange(event.target.value as ProjectRole)}
    >
      {ROLES.map((role) => (
        <option key={role} value={role}>
          {role}
        </option>
      ))}
    </select>
  )
}
