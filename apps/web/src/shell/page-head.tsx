/**
 * **셸 밖 화면의 머리** — 프로젝트 목록 · 프로젝트 설정 · 계정 설정 · 테마 관리가 함께 쓴다(spec `docs/superpowers/specs/2026-09-30-editor-shell-design.md`
 * 「화면 사이의 길」). 왼쪽은 로고(`shell/brand-link.tsx` — 프로젝트 목록으로)와 제목, 오른쪽 끝은 `…`(`shell/action-menu.tsx`)다.
 *
 * **`…` 의 항목은 어느 화면에서나 같다** — 계정 설정 · 테마 관리(인스턴스 관리자만) · 로그아웃. 에디터 `…` 와 같은 부품 · 같은 로그아웃 흐름
 * (`session/session-menu.tsx`의 `useLogout`)이다. 기다릴 편집이 없는 화면들이라 `settle`을 안 넘긴다. «테마 관리»는 빼지 끄지 않는다 — 역할처럼
 * 기다려서 풀리는 것이 아니다. 판정 값은 세션 사용자의 `isInstanceAdmin`(로그인 응답 · `/me` · 다른 탭의 로그인 소식이 싣는다).
 *
 * **로고는 프로젝트 목록에서만 뺀다**(`brand={false}`) — 로고가 가는 곳이 그 화면이다.
 *
 * **세션 통지(전환 · 로그아웃 실패)는 머리 아래 형제로 선다**(`SessionNotices` · `.wb-shell-project-alert`) — 머리 안에 넣으면 그 줄이 두꺼워진다.
 */
import type { ReactElement } from 'react'
import { useSessionUser } from '../session/session-context'
import { SessionNotices, useLogout } from '../session/session-menu'
import { ActionMenu, type ActionMenuItem } from './action-menu'
import { BrandLink } from './brand-link'
import { ICONS } from './icons'

export function PageHead(props: {
  /** `<h1>` 글자. */
  title: string
  /** 로고를 그리는가 — 프로젝트 목록만 `false`(머리말). */
  brand: boolean
}): ReactElement {
  const user = useSessionUser()
  const admin = user?.isInstanceAdmin === true
  const { logout, busy: loggingOut, failure: logoutFailure } = useLogout()
  const items: ActionMenuItem[] = [
    { key: 'account', label: '계정 설정', icon: ICONS.account, to: '/account' },
    ...(admin ? [{ key: 'themes', label: '테마 관리', icon: ICONS.themes, to: '/admin/themes' }] : []),
    // 요청이 도는 동안 끈다 — 두 번 눌러 두 번 나갈 이유가 없다(로그인 폼과 같은 관례).
    { key: 'logout', label: '로그아웃', icon: ICONS.logout, onSelect: logout, disabled: loggingOut },
  ]
  const title = <h1 className="wb-shell-project-list-title">{props.title}</h1>

  return (
    <>
      <div className="wb-shell-project-head">
        {props.brand ? (
          <div className="wb-shell-page-lead">
            <BrandLink />
            {title}
          </div>
        ) : (
          title
        )}
        <ActionMenu label="더 보기" heading={user?.name} items={items} />
      </div>
      <SessionNotices failure={logoutFailure} className="wb-shell-project-alert" />
    </>
  )
}
