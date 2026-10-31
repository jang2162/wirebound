/**
 * **에디터 밖 화면의 뼈대** — 왼쪽 사이드바 + 내용 칸(설계 `docs/superpowers/specs/2026-10-31-workspace-admin-design.md` 「뼈대」). 프로젝트 목록 ·
 * 프로젝트 설정 · 계정 설정 · 관리자 화면이 이것 안에 선다. 로그인 · 초대 가입 · 재설정 화면과 에디터 셸은 밖이다(`app.tsx` 의 라우트 표).
 *
 * - **사이드바**: 머리의 로고(`shell/brand-link.tsx` — 프로젝트 목록으로), 칸 목록(`shell/workspace-nav.ts` 의 `MAIN_NAV`), 관리자면 «관리자»
 *   묶음(`ADMIN_NAV`), 맨 밑에 로그인한 사람 이름과 «로그아웃»(`session/session-menu.tsx` 의 `useLogout` — 에디터 `…` 와 같은 흐름. 기다릴
 *   편집이 없는 화면들이라 `settle` 을 안 넘긴다). 관리자 묶음은 빼지 끄지 않는다 — 판정 값은 세션 사용자의 `isInstanceAdmin`(로그인 · 초대 가입 응답 ·
 *   `/me` · 다른 탭의 로그인 소식이 싣는다). 권한의 진실은 서버다.
 * - **지금 화면의 칸**은 `NavLink` 가 `aria-current="page"` 를 단다(프로젝트 목록 `/` 는 `end` — 그 밑 주소에서 안 선다).
 * - **내용 칸**: 머리(빵부스러기 · `<h1>` · 오른쪽 `actions`), 그 밑에 세션 통지(전환 · 로그아웃 실패 — `SessionNotices`), 그 밑에 화면의 몸.
 *   폭 제한이 없다 — 좌우 여백만 둔다.
 *
 * # 좁은 창 — 위 줄로 접는다
 *
 * 창이 좁으면(< 720px · `shell.css` 의 `.wb-shell-workspace` 블록) 사이드바가 위 줄(로고 · «메뉴» 단추)로 접히고 칸 목록 · 사람 줄은 «메뉴» 를
 * 눌러야 펴진다(`aria-expanded`). 넓은 창에서는 «메뉴» 단추가 없고 목록이 늘 보인다 — 접힘은 CSS 가 목록 자신의 `data-folded` 로 가른다(셸 CSS 는
 * 결합자를 못 쓴다 — `test/shell-css-guard.ts`). 화면을 옮기면 화면마다 이 뼈대가 새로 서므로 목록은 다시 접힌다.
 *
 * 펴서 위 줄 밑에 쌓는 꼴을 고른 까닭: 서랍(겹쳐 띄움)은 포커스 가두기 · 바깥 누름 닫기 · Escape 를 따로 지어야 하고, 접지 않고 늘 쌓으면 390px 에서
 * 칸 아홉(관리자)이 화면 반을 먹는다. 펴는 꼴은 흐름 안이라 Tab 차례가 문서 차례 그대로다.
 */
import { useId, useState, type ReactElement, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router'
import { useSessionUser } from '../session/session-context'
import { SessionNotices, useLogout } from '../session/session-menu'
import { BrandLink } from './brand-link'
import { shellIcon } from './icons'
import { ADMIN_NAV, MAIN_NAV, type WorkspaceNavItem } from './workspace-nav'

export function WorkspaceLayout(props: {
  /** `<h1>` 글자. */
  title: string
  /** 제목 위 빵부스러기 — 마지막 칸(지금 화면)은 넣지 않는다, 제목이 그 자리다. */
  crumbs?: { label: string; to: string }[]
  /** 머리 오른쪽 — 화면의 주 동작(«에디터 열기» 등). */
  actions?: ReactNode
  children: ReactNode
}): ReactElement {
  const user = useSessionUser()
  const admin = user?.isInstanceAdmin === true
  const { logout, busy: loggingOut, failure: logoutFailure } = useLogout()
  const [open, setOpen] = useState(false)
  const listId = useId()

  return (
    <div className="wb-shell-workspace">
      <aside className="wb-shell-workspace-side">
        <div className="wb-shell-workspace-top">
          <BrandLink />
          <button
            className="wb-shell-workspace-toggle"
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((was) => !was)}
          >
            {shellIcon('navMenu', 18, 'wb-shell-icon-lead')}
            메뉴
          </button>
        </div>
        <div className="wb-shell-workspace-links" id={listId} data-folded={open ? 'false' : 'true'}>
          <nav className="wb-shell-workspace-group" aria-label="작업 공간">
            <NavList items={MAIN_NAV} />
          </nav>
          {admin && (
            <nav className="wb-shell-workspace-group" aria-label="관리자">
              <p className="wb-shell-workspace-group-title" aria-hidden="true">
                관리자
              </p>
              <NavList items={ADMIN_NAV} />
            </nav>
          )}
          <div className="wb-shell-workspace-user">
            <span className="wb-shell-workspace-user-name">{user?.name ?? ''}</span>
            {/* 요청이 도는 동안 끈다 — 두 번 눌러 두 번 나갈 이유가 없다(로그인 폼과 같은 관례). */}
            <button className="wb-shell-workspace-logout" type="button" onClick={logout} disabled={loggingOut}>
              {shellIcon('logout', 16, 'wb-shell-icon-lead')}
              로그아웃
            </button>
          </div>
        </div>
      </aside>

      <main className="wb-shell-workspace-main">
        <header className="wb-shell-workspace-head">
          <div className="wb-shell-workspace-heading">
            {props.crumbs !== undefined && props.crumbs.length > 0 && (
              <nav className="wb-shell-workspace-crumbs" aria-label="상위 화면">
                {props.crumbs.map((crumb) => (
                  <span className="wb-shell-workspace-crumb" key={crumb.to}>
                    <Link className="wb-shell-workspace-crumb-link" to={crumb.to}>
                      {crumb.label}
                    </Link>
                    <span className="wb-shell-workspace-crumb-sep" aria-hidden="true">
                      ›
                    </span>
                  </span>
                ))}
              </nav>
            )}
            <h1 className="wb-shell-workspace-title">{props.title}</h1>
          </div>
          {props.actions !== undefined && <div className="wb-shell-workspace-actions">{props.actions}</div>}
        </header>
        <SessionNotices failure={logoutFailure} className="wb-shell-project-alert" />
        {props.children}
      </main>
    </div>
  )
}

function NavList(props: { items: readonly WorkspaceNavItem[] }): ReactElement {
  return (
    <ul className="wb-shell-workspace-list">
      {props.items.map((item) => (
        <li className="wb-shell-workspace-item" key={item.to}>
          {/* 클래스를 함수로 준다 — 글자로 주면 `NavLink` 가 접두어 없는 `active` 를 덧붙인다. 지금 칸의 꼴은 `aria-current` 가 가른다. */}
          <NavLink className={() => 'wb-shell-workspace-link'} to={item.to} end={item.to === '/'}>
            {shellIcon(item.icon, 16, 'wb-shell-icon-lead')}
            {item.label}
          </NavLink>
        </li>
      ))}
    </ul>
  )
}
