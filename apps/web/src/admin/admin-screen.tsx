/**
 * **관리자 칸의 틀** — `/admin/users` · `/admin/invites` · `/admin/projects` · `/admin/audit`(설계 `docs/superpowers/specs/2026-10-31-workspace-admin-design.md`
 * 「관리자 › 사용자」 – 「관리자 › 기록」). 칸마다 따로 선 라우트(`app.tsx`)가 이것으로 뼈대를 세운다 — 제목은 사이드바 칸의 이름(`ADMIN_NAV`) 그대로다.
 *
 * - **관리자가 아니면 몸을 그리지 않는다** — 조회가 0 이고 테마 관리(`routes/admin-themes.tsx`)와 같은 한 줄이다. 판정은 세션 사용자의
 *   `isInstanceAdmin` 이고 권한의 진실은 서버다 — 열린 칸에서 강등되면 그 칸의 조회 · 쓰기가 서버의 403 문장을 제 자리에 그린다.
 * - **칸마다 라우트가 따로다** — 한 동적 라우트가 넷을 받으면 칸을 옮겨도 뼈대가 새로 서지 않아 좁은 창의 펴 둔 «메뉴» 가 남는다
 *   (`shell/workspace-layout.tsx` 머리말 «좁은 창»). [Chrome] `build-test/rv-ws-workspace.test.ts` «펼친 «메뉴» 에서 관리자 칸 …».
 *
 * # 표 넷의 공통 꼴
 *
 * 위 줄(검색 · 거름 · 단추) · 표 하나 · 줄 «…»(`shell/action-menu.tsx`). 실패 문장은 서버 문장 그대로(`api/failure.tsx` 의 `toFailure`)이고, 쓰기가
 * 끝나면(성공이든 실패든) 목록을 다시 받는다(`settings/members-section.tsx` 의 `write` 와 같은 까닭 — 그 사이 다른 관리자가 바꾼 것과 안 갈린다).
 * 창이 좁으면(< 900px) 줄이 카드로 접힌다 — 칸마다 이름표(`data-label`)를 앞에 단다(`shell.css` 의 `.wb-shell-admin-table` 블록).
 */
import type { MouseEvent, ReactElement, ReactNode } from 'react'
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
    <>
      <span className="wb-shell-admin-nowrap">{`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`}</span>{' '}
      <span className="wb-shell-admin-nowrap">{`${pad(date.getHours())}:${pad(date.getMinutes())}`}</span>
    </>
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

/** 쓰기의 결과 한 줄 · 실패 한 줄 — 위 줄 밑에 선다. */
export function Outcome(props: { done: string | null; failure: string | null }): ReactElement {
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
    </>
  )
}
