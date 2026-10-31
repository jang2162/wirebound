/**
 * **관리자 › 프로젝트** — `/admin/projects`(설계 `docs/superpowers/specs/2026-10-31-workspace-admin-design.md` «관리자 › 프로젝트»).
 *
 * - 표: 이름 · 슬러그 · owner(들 — 비활성 owner 는 표지) · 멤버 수 · 최근 수정. 위에 «활성 owner 가 없는 프로젝트 N» 경고와 그것만 보는 거름.
 * - **«owner 넘기기» 는 `hasActiveOwner === false` 줄에만 있다**(사용자가 정했다). 대상은 활성 사용자 하나(자기 자신도 된다). 서버도 같은 조건을
 *   판정한다 — 그 사이 활성 owner 가 생겼으면 409 문장이 그 자리에 선다.
 * - **이름은 내가 멤버인 프로젝트만 링크다** — 관리자는 멤버가 아닌 프로젝트의 내용을 못 연다(설계 «반목표»). 멤버인지는 내 프로젝트 목록
 *   (`listProjects`)으로 가른다 — 이 표의 응답에는 내 멤버십이 없다. 목록을 못 받으면 링크를 하나도 안 단다(열리지 않는 링크를 달지 않는다).
 */
import { useCallback, useEffect, useId, useState, type ReactElement } from 'react'
import { Link } from 'react-router'
import { useApi } from '../api/context'
import { SignedOut, toFailure, type Failure } from '../api/failure'
import type { AdminProject, AdminUser } from '../api/types'
import { useSessionUser } from '../session/session-context'
import { ActionMenu } from '../shell/action-menu'
import { ICONS } from '../shell/icons'
import { isolate } from '../shell/isolate'
import { ShellDialog } from '../shell/shell-dialog'
import { matchesText, Outcome, useAdminList, When } from './admin-screen'

const LOAD_FAILURE = '프로젝트 목록을 불러오지 못했습니다'
const WRITE_FAILURE = 'owner 를 넘기지 못했습니다'
const USERS_FAILURE = '사용자 목록을 불러오지 못했습니다'
export const NO_MATCH = '검색 결과가 없습니다'

export function ProjectsSection(): ReactElement {
  const api = useApi()
  const [text, setText] = useState('')
  const [ownerless, setOwnerless] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [moving, setMoving] = useState<AdminProject | null>(null)
  const ids = { search: useId(), ownerless: useId() }

  const {
    list: state,
    stale,
    reload,
  } = useAdminList(
    useCallback(async () => {
      const [projects, mine] = await Promise.all([
        api.listAdminProjects(),
        api.listProjects().then(
          (list): ReadonlySet<string> => new Set(list.map((project) => project.id)),
          () => new Set<string>(),
        ),
      ])
      return { projects, mine }
    }, [api]),
    LOAD_FAILURE,
  )

  if (state.status === 'failed' && state.failure.kind === 'signed-out') return <SignedOut />
  if (failure !== null && failure.kind === 'signed-out') return <SignedOut />

  const missing = state.status === 'ready' ? state.value.projects.filter((project) => !project.hasActiveOwner).length : 0
  const shown =
    state.status === 'ready'
      ? state.value.projects.filter((project) => (!ownerless || !project.hasActiveOwner) && matchesText(text, [project.name, project.slug]))
      : []

  return (
    <>
      {missing > 0 && (
        <p className="wb-shell-admin-warning" role="status">
          {`활성 owner 가 없는 프로젝트 ${missing}개 — 줄의 «…» 에서 owner 를 넘기세요.`}
        </p>
      )}
      <div className="wb-shell-admin-bar">
        <label className="wb-shell-settings-label" htmlFor={ids.search}>
          검색
        </label>
        <input
          className="wb-shell-settings-input wb-shell-admin-search"
          id={ids.search}
          type="search"
          placeholder="이름 · 슬러그"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <label className="wb-shell-admin-check" htmlFor={ids.ownerless}>
          <input id={ids.ownerless} type="checkbox" checked={ownerless} onChange={(event) => setOwnerless(event.target.checked)} />
          활성 owner 가 없는 것만
        </label>
      </div>
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
      {state.status === 'ready' && shown.length === 0 && <p className="wb-shell-project-notice">{NO_MATCH}</p>}
      {state.status === 'ready' && shown.length > 0 && (
        <table className="wb-shell-admin-table" aria-label="프로젝트">
          <thead className="wb-shell-admin-head">
            <tr className="wb-shell-admin-head-row">
              {['이름', '슬러그', 'owner', '멤버', '최근 수정'].map((head) => (
                <th className="wb-shell-admin-th" scope="col" key={head}>
                  {head}
                </th>
              ))}
              <th className="wb-shell-admin-th" scope="col">
                <span className="wb-shell-admin-sr">행동</span>
              </th>
            </tr>
          </thead>
          <tbody className="wb-shell-admin-body">
            {shown.map((project) => (
              <tr className="wb-shell-admin-row" key={project.id} data-active={project.hasActiveOwner ? 'true' : 'false'}>
                <td className="wb-shell-admin-cell wb-shell-admin-cell-name" data-label="이름">
                  {state.value.mine.has(project.id) ? (
                    <Link className="wb-shell-admin-link" to={`/projects/${project.id}`}>
                      {isolate(project.name)}
                    </Link>
                  ) : (
                    isolate(project.name)
                  )}
                </td>
                <td className="wb-shell-admin-cell wb-shell-admin-cell-email" data-label="슬러그">
                  {project.slug}
                </td>
                <td className="wb-shell-admin-cell" data-label="owner">
                  {project.owners.length === 0
                    ? '없음'
                    : project.owners.map((owner, index) => (
                        <span key={owner.id}>
                          {index > 0 && ' · '}
                          {isolate(owner.name)}
                          {!owner.active && <span className="wb-shell-admin-badge">비활성</span>}
                        </span>
                      ))}
                  {!project.hasActiveOwner && <span className="wb-shell-admin-sub">활성 owner 없음</span>}
                </td>
                <td className="wb-shell-admin-cell" data-label="멤버">
                  {`${project.memberCount}명`}
                </td>
                <td className="wb-shell-admin-cell" data-label="최근 수정">
                  <When iso={project.updatedAt} />
                </td>
                <td className="wb-shell-admin-cell wb-shell-admin-cell-menu">
                  {!project.hasActiveOwner && (
                    <ActionMenu
                      label={`${project.name} 더 보기`}
                      items={[{ key: 'owner', label: 'owner 넘기기', icon: ICONS.transferOwner, onSelect: () => setMoving(project) }]}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {moving !== null && (
        <OwnerDialog
          project={moving}
          onClose={() => {
            setMoving(null)
            void reload()
          }}
          onDone={(said) => {
            setMoving(null)
            setFailure(null)
            setDone(said)
            void reload()
          }}
        />
      )}
    </>
  )
}

/**
 * owner 넘기기 상자 — 활성 사용자 목록에서 하나를 고른다(자기 자신 포함). 서버 거절(409 그새 생김 · 400 대상 비활성)은 상자 안에 서버 문장으로
 * 서고 목록은 닫을 때 다시 받는다 — 409 면 그 줄의 «…» 가 사라진다.
 */
function OwnerDialog(props: { project: AdminProject; onClose: () => void; onDone: (said: string) => void }): ReactElement {
  const api = useApi()
  const me = useSessionUser()
  const [users, setUsers] = useState<AdminUser[] | 'loading' | 'failed'>('loading')
  const [picked, setPicked] = useState('')
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<Failure | null>(null)
  const pickId = useId()
  const sentence = useId()

  useEffect(() => {
    const leave = new AbortController()
    void (async () => {
      try {
        const list = await api.listAdminUsers({ cancel: leave.signal })
        if (!leave.signal.aborted) setUsers(list.filter((user) => user.active))
      } catch {
        if (!leave.signal.aborted) setUsers('failed')
      }
    })()
    return () => leave.abort()
  }, [api])

  async function submit(): Promise<void> {
    if (busy || picked === '' || !Array.isArray(users)) return
    const target = users.find((user) => user.id === picked)
    setBusy(true)
    setProblem(null)
    try {
      await api.transferProjectOwner(props.project.id, picked)
      props.onDone(`«${isolate(props.project.name)}» — owner 를 넘겼습니다(${isolate(target?.name ?? '')}).`)
    } catch (caught) {
      setProblem(toFailure(caught, WRITE_FAILURE))
      setBusy(false)
    }
  }

  if (problem !== null && problem.kind === 'signed-out') return <SignedOut />

  return (
    <ShellDialog open title="owner 넘기기" onClose={props.onClose} describedBy={sentence}>
      <form
        className="wb-shell-admin-dialog-body"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <p className="wb-shell-admin-dialog-sentence" id={sentence}>
          {`«${isolate(props.project.name)}» 의 owner 로 만들 사람을 고르세요. 멤버가 아니면 owner 로 넣고, 멤버면 owner 로 올립니다.`}
        </p>
        <p className="wb-shell-admin-dialog-sentence">비활성 owner 는 그대로 남습니다 — 그 사람을 다시 활성화하면 owner 로 돌아옵니다.</p>
        {users === 'loading' && (
          <p className="wb-shell-project-notice" role="status">
            불러오는 중…
          </p>
        )}
        {users === 'failed' && (
          <p className="wb-shell-project-alert" role="alert">
            {USERS_FAILURE}
          </p>
        )}
        {Array.isArray(users) && (
          <>
            <label className="wb-shell-settings-label" htmlFor={pickId}>
              새 owner
            </label>
            <select
              className="wb-shell-admin-select"
              id={pickId}
              value={picked}
              disabled={busy}
              onChange={(event) => setPicked(event.target.value)}
            >
              <option value="">고르세요</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {`${isolate(user.name)} (${isolate(user.email)})${user.id === me?.id ? ' — 나' : ''}`}
                </option>
              ))}
            </select>
          </>
        )}
        {problem !== null && problem.kind === 'message' && (
          <p className="wb-shell-project-alert" role="alert">
            {problem.message}
          </p>
        )}
        <div className="wb-shell-admin-dialog-foot">
          <button className="wb-shell-project-action" type="button" onClick={props.onClose}>
            취소
          </button>
          <button className="wb-shell-project-submit" type="submit" disabled={busy || picked === ''}>
            owner 로 만들기
          </button>
        </div>
      </form>
    </ShellDialog>
  )
}
