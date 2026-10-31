/**
 * **관리자 › 기록** — `/admin/audit`(설계 `docs/superpowers/specs/2026-10-31-workspace-admin-design.md` «관리자 › 기록»). 읽기만 한다 — 기록은
 * 각 행동이 같은 트랜잭션에서 남기고 화면에서 고치거나 지울 수 없다.
 *
 * - 최신이 위. 행동 종류 · 사람으로 거른다(서버 질의 `?action=&actorId=` — 서버 명령(`cli`)은 사람 거름에 없다, 서버가 id 로만 거른다).
 * - **«더 보기» 는 앞 쪽의 `next` 를 `before` 로 싣는다** — 시각을 화면에서 다시 짓지 않는다(서버가 마이크로초까지 적는다 — 밀리초로 자르면
 *   같은 밀리초의 줄이 빠진다. 서버 `repos/admin-audit.ts` 의 `listAdminActions`).
 * - **거름을 바꾸면 첫 쪽부터 다시 받는다.** 앞 거름의 늦은 답이 새 거름의 표를 덮지 않게 조회마다 차례 번호를 단다.
 * - 줄의 «무엇» 은 행동마다 한 줄(`auditLine`) — 행동 뒤에 대상(사람 · 프로젝트 · 링크 이름)과 세부(`detail`)를 붙인다. 대상이 지워졌으면 서버가
 *   행동 때 적어 둔 이름을 싣는다.
 */
import { useEffect, useId, useRef, useState, type ReactElement } from 'react'
import { useApi } from '../api/context'
import { SignedOut, toFailure, type Failure } from '../api/failure'
import type { AdminUser, AuditAction, AuditEntry, AuditQuery } from '../api/types'
import { Outcome, When } from './admin-screen'
import { KIND_TEXT } from './invites-section'

const LOAD_FAILURE = '기록을 불러오지 못했습니다'
export const NO_ENTRIES = '남은 기록이 없습니다'
/** 서버 명령(`db/admin.ts`)으로 한 행동의 «누가». */
export const CLI_ACTOR = '서버 명령'

const person = (user: AuditEntry['targetUser']): string => (user === null ? '(알 수 없음)' : `${user.name}(${user.email})`)
const quoted = (named: { name: string } | null): string => `«${named?.name ?? ''}»`
const count = (detail: AuditEntry['detail'], key: string): string => `${typeof detail[key] === 'number' ? detail[key] : 0}개`
const themeRef = (detail: AuditEntry['detail']): string => `${String(detail['themeId'] ?? '')}@${String(detail['version'] ?? '')}`

/** 행동마다 거름의 이름과 한 줄. 차례는 거름 고르개의 차례다. */
export const AUDIT_ACTIONS: Record<AuditAction, { label: string; line: (entry: AuditEntry) => string }> = {
  'invite.create': {
    label: '초대 링크 만듦',
    line: (e) => {
      const kind = e.detail['kind']
      return `${quoted(e.invite)} · ${kind === 'single' || kind === 'multi' ? KIND_TEXT[kind] : ''} · ${String(e.detail['expiresInDays'] ?? '')}일`
    },
  },
  'invite.revoke': { label: '초대 링크 거둠', line: (e) => quoted(e.invite) },
  'invite.signup': { label: '초대 링크로 가입', line: (e) => `${quoted(e.invite)} · ${person(e.targetUser)}` },
  'reset.create': { label: '재설정 링크 만듦', line: (e) => person(e.targetUser) },
  'reset.use': { label: '재설정 링크로 비밀번호 바꿈', line: (e) => person(e.targetUser) },
  'user.deactivate': {
    label: '비활성화',
    line: (e) =>
      `${person(e.targetUser)} · 거둔 링크 ${count(e.detail, 'revokedLinks')}${e.detail['wasAdmin'] === true ? ' · 관리자였음' : ''}`,
  },
  'user.activate': { label: '다시 활성화', line: (e) => person(e.targetUser) },
  'admin.grant': { label: '관리자로 지정', line: (e) => person(e.targetUser) },
  'admin.revoke': { label: '관리자 해제', line: (e) => `${person(e.targetUser)} · 거둔 링크 ${count(e.detail, 'revokedLinks')}` },
  'project.owner': { label: 'owner 넘김', line: (e) => `${quoted(e.project)} → ${person(e.targetUser)}` },
  'theme.upload': { label: '테마 올림', line: (e) => themeRef(e.detail) },
  'theme.hide': { label: '테마 판 숨김', line: (e) => themeRef(e.detail) },
  'theme.unhide': { label: '테마 판 되살림', line: (e) => themeRef(e.detail) },
}

/** 한 줄 — «행동 — 대상 · 세부». 모르는 행동(서버가 새로 더함)은 이름 그대로. */
export function auditLine(entry: AuditEntry): string {
  const known = AUDIT_ACTIONS[entry.action]
  return known === undefined ? entry.action : `${known.label} — ${known.line(entry)}`
}

type Rows = { status: 'loading' } | { status: 'failed'; failure: Failure } | { status: 'ready'; entries: AuditEntry[]; next: string | null }

export function AuditSection(): ReactElement {
  const api = useApi()
  const [action, setAction] = useState<AuditAction | ''>('')
  const [actorId, setActorId] = useState('')
  const [rows, setRows] = useState<Rows>({ status: 'loading' })
  const [more, setMore] = useState<Failure | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [actors, setActors] = useState<AdminUser[]>([])
  /** 조회 차례 — 거름을 바꾸면 오른다(머리말 «거름을 바꾸면 첫 쪽부터»). */
  const turn = useRef(0)
  const ids = { action: useId(), actor: useId() }

  const query: AuditQuery = { ...(action === '' ? {} : { action }), ...(actorId === '' ? {} : { actorId }) }

  useEffect(() => {
    const leave = new AbortController()
    void api.listAdminUsers({ cancel: leave.signal }).then(
      (users) => {
        if (!leave.signal.aborted) setActors(users)
      },
      () => {},
    )
    return () => leave.abort()
  }, [api])

  useEffect(() => {
    const mine = ++turn.current
    const leave = new AbortController()
    setRows({ status: 'loading' })
    setMore(null)
    void (async () => {
      try {
        const page = await api.listAudit(
          { ...(action === '' ? {} : { action }), ...(actorId === '' ? {} : { actorId }) },
          { cancel: leave.signal },
        )
        if (mine === turn.current) setRows({ status: 'ready', entries: page.entries, next: page.next })
      } catch (caught) {
        if (mine === turn.current) setRows({ status: 'failed', failure: toFailure(caught, LOAD_FAILURE) })
      }
    })()
    return () => leave.abort()
  }, [api, action, actorId])

  async function loadMore(next: string): Promise<void> {
    const mine = turn.current
    setLoadingMore(true)
    setMore(null)
    try {
      const page = await api.listAudit({ ...query, before: next })
      if (mine === turn.current) {
        setRows((prev) =>
          prev.status === 'ready' ? { status: 'ready', entries: [...prev.entries, ...page.entries], next: page.next } : prev,
        )
      }
    } catch (caught) {
      if (mine === turn.current) setMore(toFailure(caught, LOAD_FAILURE))
    }
    setLoadingMore(false)
  }

  if (rows.status === 'failed' && rows.failure.kind === 'signed-out') return <SignedOut />
  if (more !== null && more.kind === 'signed-out') return <SignedOut />

  return (
    <>
      <div className="wb-shell-admin-bar">
        <label className="wb-shell-settings-label" htmlFor={ids.action}>
          행동
        </label>
        <select
          className="wb-shell-admin-select"
          id={ids.action}
          value={action}
          onChange={(event) => setAction(event.target.value as AuditAction | '')}
        >
          <option value="">전체</option>
          {(Object.keys(AUDIT_ACTIONS) as AuditAction[]).map((key) => (
            <option key={key} value={key}>
              {AUDIT_ACTIONS[key].label}
            </option>
          ))}
        </select>
        <label className="wb-shell-settings-label" htmlFor={ids.actor}>
          사람
        </label>
        <select className="wb-shell-admin-select" id={ids.actor} value={actorId} onChange={(event) => setActorId(event.target.value)}>
          <option value="">전체</option>
          {actors.map((user) => (
            <option key={user.id} value={user.id}>
              {`${user.name} (${user.email})`}
            </option>
          ))}
        </select>
      </div>
      {rows.status === 'loading' && (
        <p className="wb-shell-project-notice" role="status">
          불러오는 중…
        </p>
      )}
      {rows.status === 'failed' && rows.failure.kind === 'message' && (
        <p className="wb-shell-project-alert" role="alert">
          {rows.failure.message}
        </p>
      )}
      {rows.status === 'ready' && rows.entries.length === 0 && <p className="wb-shell-project-notice">{NO_ENTRIES}</p>}
      {rows.status === 'ready' && rows.entries.length > 0 && (
        <table className="wb-shell-admin-table" aria-label="기록">
          <thead className="wb-shell-admin-head">
            <tr className="wb-shell-admin-head-row">
              {['언제', '누가', '무엇'].map((head) => (
                <th className="wb-shell-admin-th" scope="col" key={head}>
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="wb-shell-admin-body">
            {rows.entries.map((entry) => (
              <tr className="wb-shell-admin-row" key={entry.id} data-active="true">
                <td className="wb-shell-admin-cell" data-label="언제">
                  <When iso={entry.at} />
                </td>
                <td className="wb-shell-admin-cell wb-shell-admin-cell-name" data-label="누가">
                  {entry.actor.kind === 'cli' ? CLI_ACTOR : entry.actor.name}
                </td>
                <td className="wb-shell-admin-cell wb-shell-admin-cell-email" data-label="무엇">
                  {auditLine(entry)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {rows.status === 'ready' && rows.next !== null && (
        <div className="wb-shell-admin-bar">
          <button
            className="wb-shell-project-action"
            type="button"
            disabled={loadingMore}
            onClick={() => void loadMore(rows.next as string)}
          >
            더 보기
          </button>
        </div>
      )}
      <Outcome done={null} failure={more?.kind === 'message' ? more.message : null} />
    </>
  )
}
