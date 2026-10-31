/**
 * **관리자 칸의 틀** — `/admin/users` · `/admin/invites` · `/admin/projects` · `/admin/audit`(설계 `docs/superpowers/specs/2026-10-31-workspace-admin-design.md`
 * 「관리자 › 사용자」 – 「관리자 › 기록」). 칸마다 따로 선 라우트(`app.tsx`)가 이것으로 뼈대를 세운다 — 제목은 사이드바 칸의 이름(`ADMIN_NAV`) 그대로다.
 *
 * - **관리자가 아니면 몸을 그리지 않는다** — 조회가 0 이고 테마 관리(`routes/admin-themes.tsx`)와 같은 한 줄이다. 판정은 세션 사용자의
 *   `isInstanceAdmin` 이고 권한의 진실은 서버다 — 열린 칸에서 강등되면 그 칸의 조회 · 쓰기가 서버의 403 문장을 제 자리에 그린다.
 * - **칸마다 라우트가 따로다** — 모르는 칸은 `app.tsx` 가 목록으로 보낸다. 넷이 같은 꼴(이 부품)이라 칸을 옮겨도 React 가 뼈대를 이어 가므로,
 *   좁은 창의 펴 둔 «메뉴» 는 뼈대가 주소를 보고 접는다(`shell/workspace-layout.tsx` 머리말 «좁은 창»).
 *
 * # 표 넷의 공통 꼴
 *
 * 위 줄(검색 · 거름 · 단추) · 표 하나 · 줄 «…»(`shell/action-menu.tsx`). 실패 문장은 서버 문장 그대로(`api/failure.tsx` 의 `toFailure`)이고, 쓰기가
 * 끝나면(성공이든 실패든) 목록을 다시 받는다(`settings/members-section.tsx` 의 `write` 와 같은 까닭 — 그 사이 다른 관리자가 바꾼 것과 안 갈린다).
 * 목록 받기는 `useAdminList` 하나다 — 차례 · 다시 받기 실패의 판은 그 머리말.
 * 창이 좁으면(< 900px) 줄이 카드로 접힌다 — 칸마다 이름표(`data-label`)를 앞에 단다(`shell.css` 의 `.wb-shell-admin-table` 블록).
 */
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactElement, type ReactNode } from 'react'
import { toFailure, type Failure } from '../api/failure'
import { useSessionUser } from '../session/session-context'
import { WorkspaceLayout } from '../shell/workspace-layout'
import { ADMIN_NAV } from '../shell/workspace-nav'
import { ADMIN_ONLY } from '../routes/admin-themes'

export type AdminSection = 'users' | 'invites' | 'projects' | 'audit'

export function AdminScreen(props: { section: AdminSection; children: ReactNode }): ReactElement {
  const user = useSessionUser()
  const title = ADMIN_NAV.find((item) => item.key === props.section)?.label ?? ''
  return (
    <WorkspaceLayout title={title}>
      <div className="wb-shell-settings">
        {user?.isInstanceAdmin === true ? (
          props.children
        ) : (
          <p className="wb-shell-project-alert" role="alert">
            {ADMIN_ONLY}
          </p>
        )}
      </div>
    </WorkspaceLayout>
  )
}

const pad = (value: number): string => String(value).padStart(2, '0')

/**
 * 표의 시각 — `YYYY-MM-DD HH:mm`(브라우저 시간대). **날짜와 시각은 각각 끊지 않는다** — 좁은 칸에서도 꺾이는 자리는 둘 사이 하나뿐이다
 * («2026-11-01» 의 붙임표 뒤에서 Chrome 이 끊는다 — `AGENTS.md` «표 칸의 글은 넘침과 함께 꺾인 줄 수로 잰다»).
 */
export function When(props: { iso: string }): ReactElement {
  const date = new Date(props.iso)
  if (Number.isNaN(date.getTime())) return <>{props.iso}</>
  return (
    <span className="wb-shell-admin-when">
      <span className="wb-shell-admin-nowrap">{`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`}</span>{' '}
      <span className="wb-shell-admin-nowrap">{`${pad(date.getHours())}:${pad(date.getMinutes())}`}</span>
    </span>
  )
}

/** 확정 단추의 `onClick` — 연타의 둘째 누름을 버린다(`settings/members-section.tsx` 의 `confirmClick` 과 같은 겹). */
export function confirmClick(action: () => void): (event: MouseEvent<HTMLButtonElement>) => void {
  return (event) => {
    if (event.detail > 1) return
    action()
  }
}

/** 이름 · 이메일 등 글 칸 여럿에서 `text` 를 찾는다 — 대소문자를 가리지 않는 부분 일치(프로젝트 목록 `projects/project-filter.ts` 와 같은 뜻). */
export function matchesText(text: string, fields: readonly string[]): boolean {
  const needle = text.trim().toLocaleLowerCase()
  return needle === '' || fields.some((field) => field.toLocaleLowerCase().includes(needle))
}

export type AdminList<T> = { status: 'loading' } | { status: 'failed'; failure: Failure } | { status: 'ready'; value: T }

/**
 * **칸의 목록** — 첫 조회와 쓰기 뒤 다시 받기(`reload`). `fetch` 는 `useCallback` 으로 고정해 넘긴다(바뀌면 첫 쪽부터 다시 받는다).
 *
 * - **조회마다 차례 번호를 단다** — 마지막에 시작한 조회의 답만 싣는다. 겹친 다시 받기(owner 넘기기를 보낸 채 상자를 닫음 → 닫기의 다시 받기가
 *   넘기기 커밋 전 표를 읽고 넘기기 뒤의 다시 받기보다 늦게 온다)에서 늦은 답이 새 표를 덮어 «활성 owner 없음» 이 되살았다. 기록 칸의
 *   거름 조회(`audit-section.tsx` 의 `turn`)와 같은 꼴이다.
 * - **다시 받기가 실패하면 앞 표를 둔다** — 실패는 `stale` 한 줄로 서고(로그인이 풀린 판만 `failed` 로 가 `SignedOut` 이 선다), 표가
 *   사라지지 않는다. 강등된 관리자의 쓰기 하나가 쓰기의 403 과 다시 받기의 403 을 함께 내 같은 문장이 두 줄 서고 표가 사라졌다 —
 *   같은 문장이면 `Outcome` 이 한 줄로 접는다.
 */
export function useAdminList<T>(
  fetch: () => Promise<T>,
  loadFailure: string,
): { list: AdminList<T>; stale: Failure | null; reload: () => Promise<void> } {
  const [list, setList] = useState<AdminList<T>>({ status: 'loading' })
  const [stale, setStale] = useState<Failure | null>(null)
  const turn = useRef(0)
  const alive = useRef(false)
  const shown = useRef(false)

  const reload = useCallback(async (): Promise<void> => {
    const mine = ++turn.current
    const current = (): boolean => alive.current && mine === turn.current
    try {
      const value = await fetch()
      if (!current()) return
      shown.current = true
      setList({ status: 'ready', value })
      setStale(null)
    } catch (caught) {
      if (!current()) return
      const failure = toFailure(caught, loadFailure)
      if (shown.current && failure.kind === 'message') return setStale(failure)
      shown.current = false
      setList({ status: 'failed', failure })
    }
  }, [fetch, loadFailure])

  useEffect(() => {
    alive.current = true
    void reload()
    return () => {
      alive.current = false
    }
  }, [reload])

  return { list, stale, reload }
}

/**
 * 쓰기의 결과 한 줄 · 실패 한 줄 — 위 줄 밑에 선다. `stale` 은 다시 받기의 실패(`useAdminList`)다 — 쓰기의 실패와 같은 문장이면 한 줄만 선다.
 */
export function Outcome(props: { done: string | null; failure: string | null; stale?: Failure | null }): ReactElement {
  const stale = props.stale?.kind === 'message' && props.stale.message !== props.failure ? props.stale.message : null
  return (
    <>
      {props.done !== null && (
        <p className="wb-shell-project-notice" role="status">
          {props.done}
        </p>
      )}
      {props.failure !== null && (
        <p className="wb-shell-project-alert" role="alert">
          {props.failure}
        </p>
      )}
      {stale !== null && (
        <p className="wb-shell-project-alert" role="alert">
          {stale}
        </p>
      )}
    </>
  )
}
