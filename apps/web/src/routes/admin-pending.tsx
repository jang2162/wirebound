/**
 * **관리자 칸의 «준비 중»** — `/admin/:section`. 사이드바의 관리자 칸 다섯(`shell/workspace-nav.ts` 의 `ADMIN_NAV`) 가운데 아직 화면이 없는
 * 것을 받는다. 화면이 생기면 그 주소의 정적 라우트가 이 동적 라우트를 이긴다(react-router 는 정적 조각을 먼저 고른다 — `/admin/themes` 가 그렇다).
 *
 * 관리자가 아니면 테마 관리(`routes/admin-themes.tsx`)와 같은 한 줄이다. `ADMIN_NAV` 에 없는 칸이면 프로젝트 목록으로 보낸다.
 */
import type { ReactElement } from 'react'
import { Navigate, useParams } from 'react-router'
import { useSessionUser } from '../session/session-context'
import { WorkspaceLayout } from '../shell/workspace-layout'
import { ADMIN_NAV } from '../shell/workspace-nav'
import { ADMIN_ONLY } from './admin-themes'

const PENDING = '준비 중입니다'

export function AdminPendingRoute(): ReactElement {
  const section = useParams().section
  const user = useSessionUser()
  const item = ADMIN_NAV.find((nav) => nav.key === section)
  if (item === undefined) return <Navigate to="/" replace />

  return (
    <WorkspaceLayout title={item.label}>
      <div className="wb-shell-settings">
        {user?.isInstanceAdmin === true ? (
          <p className="wb-shell-project-notice" role="status">
            {PENDING}
          </p>
        ) : (
          <p className="wb-shell-project-alert" role="alert">
            {ADMIN_ONLY}
          </p>
        )}
      </div>
    </WorkspaceLayout>
  )
}
