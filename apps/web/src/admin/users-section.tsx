/**
 * **관리자 › 사용자** — `/admin/users`(설계 `docs/superpowers/specs/2026-10-31-workspace-admin-design.md` «관리자 › 사용자» · «비활성화» ·
 * «관리자 지정 · 해제» · «비밀번호 재설정 링크»).
 *
 * - 표: 이름(관리자 표지) · 이메일 · 상태 · 속한 프로젝트 수 · 가입(초대 링크로 들어왔으면 그 이름) · 마지막 접속. 비활성 줄은 흐리다.
 * - 위 줄: 이름 · 이메일 검색 · 상태 거름 · «초대 링크 만들기»(초대 링크 칸과 같은 상자 — `admin/invites-section.tsx` 의 `InviteCreateDialog`).
 * - **줄 «…» 의 항목은 상태가 정한다**(`rowItems`): 비활성이면 «다시 활성화» 하나. 활성이면 «재설정 링크 만들기», 그리고 **자기 줄이 아니면**
 *   «관리자로 지정» / «관리자 해제» · «비활성화». 서버도 자기 자신의 비활성화 · 해제를 409 로 막는다 — 화면은 누를 자리를 안 둔다.
 * - **되돌리기 어려운 둘은 확인 상자를 거친다** — 비활성화(로그인 · 세션 · API 토큰이 바로 끊긴다 · 그 사람이 만든 링크를 거둔다 · 그 사람이
 *   마지막 활성 owner 인 프로젝트 수)와 관리자 해제(그 사람이 만든 링크를 거둔다). 지정 · 다시 활성화는 곧바로 보낸다 — 되돌릴 수 있다.
 * - **응답의 수를 한 줄로 말한다** — 비활성화의 `revokedLinks` · `ownerlessProjects`, 해제의 `revokedLinks`.
 *
 * «마지막 활성 owner 인 프로젝트 수» 는 상자를 열 때 관리자 › 프로젝트 목록(`listAdminProjects`)에서 센다 — 활성 owner 가 그 사람 하나인 프로젝트.
 * 서버가 비활성화 뒤에 센 값(`ownerlessProjects`)이 정본이고, 상자의 수는 묻는 순간의 미리보기다.
 */
import { useCallback, useEffect, useId, useRef, useState, type ReactElement } from 'react'
import { useApi } from '../api/context'
import { SignedOut, toFailure, type Failure } from '../api/failure'
import type { AdminUser, CreatedResetLink } from '../api/types'
import { useSessionUser } from '../session/session-context'
import { ActionMenu, type ActionMenuItem } from '../shell/action-menu'
import { ICONS, shellIcon } from '../shell/icons'
import { ShellDialog } from '../shell/shell-dialog'
import { confirmClick, matchesText, Outcome, useAdminList, When } from './admin-screen'
import { InviteCreateDialog } from './invites-section'
import { LinkReveal, linkUrl } from './link-reveal'

const LOAD_FAILURE = '사용자 목록을 불러오지 못했습니다'
const WRITE_FAILURE = '사용자를 바꾸지 못했습니다'
export const NO_MATCH = '검색 결과가 없습니다'
/** 비활성화 상자의 첫 경고 — 설계 «비활성화하면 같은 트랜잭션에서 …». */
export const CUT_NOW = '로그인 · 세션 · API 토큰이 바로 끊깁니다.'

type StatusFilter = 'all' | 'active' | 'inactive'
const STATUS_OPTIONS: readonly { value: StatusFilter; label: string }[] = [
  { value: 'all', label: '전체' },
  { value: 'active', label: '활성' },
  { value: 'inactive', label: '비활성' },
]

/** 묻는 중인 확인 — 비활성화 · 관리자 해제. */
type Asking = { kind: 'deactivate' | 'revoke'; user: AdminUser }
/** 보이는 새 링크 — 초대 · 재설정. */
type Reveal = { title: string; url: string; expiresAt: string }

export function UsersSection(): ReactElement {
  const api = useApi()
  const me = useSessionUser()
  const [text, setText] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [asking, setAsking] = useState<Asking | null>(null)
  const [inviting, setInviting] = useState(false)
  const [reveal, setReveal] = useState<Reveal | null>(null)
  const ids = { search: useId(), status: useId() }

  const {
    list: state,
    stale,
    reload,
  } = useAdminList(
    useCallback(() => api.listAdminUsers(), [api]),
    LOAD_FAILURE,
  )
  /** 쓰기가 떠 있나 — 렌더를 기다리지 않는 값이다(`busy` 는 다음 렌더에야 선다 — 한 틱 안의 두 누름이 둘 다 거짓을 본다). */
  const writing = useRef(false)

  /**
   * 쓰기 하나 — 결과 한 줄 · 실패 한 줄, 끝나면 목록을 다시 받는다(`admin/admin-screen.tsx` 머리말 «표 넷의 공통 꼴»). **쓰기는 한 번에
   * 하나다** — 줄 «…» 의 지정 · 다시 활성화 · 재설정은 확인 상자를 안 거쳐, 앞 쓰기의 답 전에 온 둘째 고름(키 반복 · 다른 줄)을 버린다.
   */
  async function write<T>(run: () => Promise<T>, said: (result: T) => string): Promise<T | null> {
    if (writing.current) return null
    writing.current = true
    setBusy(true)
    setDone(null)
    setFailure(null)
    let result: T | null = null
    try {
      result = await run()
      setDone(said(result))
    } catch (caught) {
      setFailure(toFailure(caught, WRITE_FAILURE))
    }
    await reload()
    writing.current = false
    setBusy(false)
    return result
  }

  async function resetLink(user: AdminUser): Promise<void> {
    if (writing.current) return
    setReveal(null)
    const created = await write<CreatedResetLink>(
      () => api.createResetLink(user.id),
      () => `${user.name} — 비밀번호 재설정 링크를 만들었습니다. 24 시간 · 한 번 쓸 수 있습니다.`,
    )
    if (created !== null) {
      setReveal({ title: `${user.name}의 비밀번호 재설정 링크`, url: linkUrl('reset', created.token), expiresAt: created.expiresAt })
    }
  }

  function rowItems(user: AdminUser): ActionMenuItem[] {
    if (!user.active) {
      return [
        {
          key: 'activate',
          label: '다시 활성화',
          icon: ICONS.activateUser,
          onSelect: () =>
            void write(
              () => api.activateUser(user.id),
              () => `${user.name} — 다시 활성화했습니다. 일반 사용자로 돌아옵니다.`,
            ),
        },
      ]
    }
    const items: ActionMenuItem[] = [
      { key: 'reset', label: '재설정 링크 만들기', icon: ICONS.resetLink, onSelect: () => void resetLink(user) },
    ]
    // 자기 줄에는 비활성화 · 해제가 없다(머리말 «줄 «…» 의 항목은 상태가 정한다»).
    if (user.id === me?.id) return items
    items.push(
      user.isInstanceAdmin
        ? { key: 'revoke', label: '관리자 해제', icon: ICONS.revokeAdmin, onSelect: () => setAsking({ kind: 'revoke', user }) }
        : {
            key: 'grant',
            label: '관리자로 지정',
            icon: ICONS.grantAdmin,
            onSelect: () =>
              void write(
                () => api.grantInstanceAdmin(user.id),
                () => `${user.name} — 관리자로 지정했습니다.`,
              ),
          },
      {
        key: 'deactivate',
        label: '비활성화',
        icon: ICONS.deactivateUser,
        danger: true,
        onSelect: () => setAsking({ kind: 'deactivate', user }),
      },
    )
    return items
  }

  if (state.status === 'failed' && state.failure.kind === 'signed-out') return <SignedOut />
  if (failure !== null && failure.kind === 'signed-out') return <SignedOut />

  const shown =
    state.status === 'ready'
      ? state.value.filter(
          (user) => (status === 'all' || user.active === (status === 'active')) && matchesText(text, [user.name, user.email]),
        )
      : []

  return (
    <>
      <div className="wb-shell-admin-bar">
        <label className="wb-shell-settings-label" htmlFor={ids.search}>
          검색
        </label>
        <input
          className="wb-shell-settings-input wb-shell-admin-search"
          id={ids.search}
          type="search"
          placeholder="이름 · 이메일"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <label className="wb-shell-settings-label" htmlFor={ids.status}>
          상태
        </label>
        <select
          className="wb-shell-admin-select"
          id={ids.status}
          value={status}
          onChange={(event) => setStatus(event.target.value as StatusFilter)}
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <button className="wb-shell-project-submit wb-shell-admin-bar-end" type="button" disabled={busy} onClick={() => setInviting(true)}>
          {shellIcon('createInvite', 14, 'wb-shell-icon-lead')}
          초대 링크 만들기
        </button>
      </div>
      {reveal !== null && (
        <LinkReveal key={reveal.url} title={reveal.title} url={reveal.url} expiresAt={reveal.expiresAt} onClose={() => setReveal(null)} />
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
      {state.status === 'ready' && shown.length === 0 && <p className="wb-shell-project-notice">{NO_MATCH}</p>}
      {state.status === 'ready' && shown.length > 0 && (
        <table className="wb-shell-admin-table" aria-label="사용자">
          <thead className="wb-shell-admin-head">
            <tr className="wb-shell-admin-head-row">
              {['이름', '이메일', '상태', '프로젝트', '가입', '마지막 접속'].map((head) => (
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
            {shown.map((user) => (
              <tr className="wb-shell-admin-row" key={user.id} data-active={user.active ? 'true' : 'false'}>
                <td className="wb-shell-admin-cell wb-shell-admin-cell-name" data-label="이름">
                  {user.name}
                  {user.isInstanceAdmin && <span className="wb-shell-admin-badge">관리자</span>}
                </td>
                <td className="wb-shell-admin-cell wb-shell-admin-cell-email" data-label="이메일">
                  {user.email}
                </td>
                <td className="wb-shell-admin-cell" data-label="상태">
                  {user.active ? '활성' : '비활성'}
                </td>
                <td className="wb-shell-admin-cell" data-label="프로젝트">
                  {`${user.projectCount}개`}
                </td>
                <td className="wb-shell-admin-cell" data-label="가입">
                  <When iso={user.createdAt} />
                  {user.invite !== null && <span className="wb-shell-admin-sub">{`초대 «${user.invite.name}»`}</span>}
                </td>
                <td className="wb-shell-admin-cell" data-label="마지막 접속">
                  {user.lastSeenAt === null ? '없음' : <When iso={user.lastSeenAt} />}
                </td>
                <td className="wb-shell-admin-cell wb-shell-admin-cell-menu">
                  <ActionMenu label={`${user.name} 더 보기`} items={rowItems(user)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <InviteCreateDialog
        open={inviting}
        onClose={() => setInviting(false)}
        onCreated={(created) => {
          setInviting(false)
          setDone(null)
          setFailure(null)
          setReveal({
            title: `초대 링크 «${created.invite.name}»`,
            url: linkUrl('invite', created.token),
            expiresAt: created.invite.expiresAt,
          })
        }}
      />
      {asking !== null && (
        <AskDialog
          asking={asking}
          busy={busy}
          onClose={() => setAsking(null)}
          onConfirm={() => {
            const { kind, user } = asking
            setAsking(null)
            if (kind === 'deactivate') {
              void write(
                () => api.deactivateUser(user.id),
                (result) =>
                  `${user.name} — 비활성화했습니다. 거둔 링크 ${result.revokedLinks}개 · 활성 owner 가 없어진 프로젝트 ${result.ownerlessProjects}개` +
                  (result.ownerlessProjects > 0 ? ' — 관리자 › 프로젝트에서 owner 를 넘기세요.' : '.'),
              )
            } else {
              void write(
                () => api.revokeInstanceAdmin(user.id),
                (result) => `${user.name} — 관리자 권한을 해제했습니다. 거둔 링크 ${result.revokedLinks}개.`,
              )
            }
          }}
        />
      )}
    </>
  )
}

/** 비활성화 · 관리자 해제의 확인 상자(머리말 «되돌리기 어려운 둘은 확인 상자를 거친다»). */
function AskDialog(props: { asking: Asking; busy: boolean; onClose: () => void; onConfirm: () => void }): ReactElement {
  const { kind, user } = props.asking
  const sentence = useId()
  return (
    <ShellDialog open title={kind === 'deactivate' ? '비활성화' : '관리자 해제'} onClose={props.onClose} describedBy={sentence}>
      <div className="wb-shell-admin-dialog-body">
        <p className="wb-shell-admin-dialog-sentence" id={sentence}>
          {kind === 'deactivate'
            ? `${user.name}(${user.email}) 계정을 비활성화합니다. ${CUT_NOW}`
            : `${user.name}(${user.email})의 관리자 권한을 해제합니다.`}
        </p>
        <p className="wb-shell-admin-dialog-sentence">이 사람이 만든 아직 쓸 수 있는 초대 · 재설정 링크를 함께 거둡니다.</p>
        {kind === 'deactivate' && user.isInstanceAdmin && (
          <p className="wb-shell-admin-dialog-sentence">관리자 권한도 지웁니다 — 다시 활성화하면 일반 사용자로 돌아옵니다.</p>
        )}
        {kind === 'deactivate' && <LastOwnerCount userId={user.id} />}
        <div className="wb-shell-admin-dialog-foot">
          <button className="wb-shell-project-action" type="button" onClick={props.onClose}>
            취소
          </button>
          <button className="wb-shell-project-danger" type="button" disabled={props.busy} onClick={confirmClick(props.onConfirm)}>
            {kind === 'deactivate' ? '비활성화' : '관리자 해제'}
          </button>
        </div>
      </div>
    </ShellDialog>
  )
}

/** 그 사람이 마지막 활성 owner 인 프로젝트 수 — 묻는 순간의 미리보기다(머리말 끝 문단). */
function LastOwnerCount(props: { userId: string }): ReactElement {
  const api = useApi()
  const [count, setCount] = useState<number | 'loading' | 'failed'>('loading')

  useEffect(() => {
    const leave = new AbortController()
    void (async () => {
      try {
        const projects = await api.listAdminProjects({ cancel: leave.signal })
        const last = projects.filter((project) => {
          const active = project.owners.filter((owner) => owner.active)
          return active.length === 1 && active[0]?.id === props.userId
        })
        if (!leave.signal.aborted) setCount(last.length)
      } catch {
        if (!leave.signal.aborted) setCount('failed')
      }
    })()
    return () => leave.abort()
  }, [api, props.userId])

  const text =
    count === 'loading'
      ? '이 사람이 마지막 활성 owner 인 프로젝트를 세는 중…'
      : count === 'failed'
        ? '이 사람이 마지막 활성 owner 인 프로젝트를 세지 못했습니다.'
        : count === 0
          ? '이 사람이 마지막 활성 owner 인 프로젝트는 없습니다.'
          : `이 사람이 마지막 활성 owner 인 프로젝트 ${count}개 — 관리자 › 프로젝트에서 owner 를 넘기세요.`
  return (
    <p className="wb-shell-admin-dialog-sentence" role="status">
      {text}
    </p>
  )
}
