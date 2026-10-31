/**
 * 작업 공간 사이드바(`shell/workspace-layout.tsx`)의 칸 목록. 관리자 묶음의 차례는 설계(`docs/superpowers/specs/2026-10-31-workspace-admin-design.md`
 * 「관리자 › 기록」 — 사용자 · 초대 링크 · 프로젝트 · 테마 · 기록)다. 아직 화면이 없는 칸은 `app.tsx` 의 `/admin/:section` 이 «준비 중» 으로 받는다
 * (`routes/admin-pending.tsx`).
 */
import type { IconName } from './icons'

export interface WorkspaceNavItem<K extends string = string> {
  key: K
  label: string
  to: string
  icon: IconName
}

/** 누구에게나 있는 칸 — 프로젝트 목록 · 계정 설정. */
export const MAIN_NAV: readonly WorkspaceNavItem<'projects' | 'account'>[] = [
  { key: 'projects', label: '프로젝트', to: '/', icon: 'navProjects' },
  { key: 'account', label: '계정', to: '/account', icon: 'account' },
]

/** 인스턴스 관리자에게만 있는 칸. */
export const ADMIN_NAV: readonly WorkspaceNavItem<'users' | 'invites' | 'projects' | 'themes' | 'audit'>[] = [
  { key: 'users', label: '사용자', to: '/admin/users', icon: 'navUsers' },
  { key: 'invites', label: '초대 링크', to: '/admin/invites', icon: 'navInvites' },
  { key: 'projects', label: '프로젝트', to: '/admin/projects', icon: 'navAdminProjects' },
  { key: 'themes', label: '테마', to: '/admin/themes', icon: 'themes' },
  { key: 'audit', label: '기록', to: '/admin/audit', icon: 'navAudit' },
]
