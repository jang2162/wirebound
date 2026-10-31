/**
 * 관리자 칸 넷(`src/admin/*`)의 jsdom 케이스가 함께 쓰는 **가짜 서버** — 사용자 · 초대 링크 · 프로젝트 · 기록 표를 들고, 쓰기마다 불린 인자를
 * 적는다. 거절 문장은 서버(`apps/api/src/routes/admin-*.ts`)의 것을 그대로 싣는다 — 화면이 그 문장을 옮기는지 잰다.
 *
 * 서버의 판정(자기 자신 · 마지막 관리자 · 이미 그 상태)은 **흉내 내지 않는다** — 케이스가 거절을 원하면 `refuse` 로 그 쓰기를 던지게 한다.
 * 흉내 낸 판정은 서버와 갈려도 초록이다.
 */
import { ApiError, type ApiClient } from '../../src/api/client'
import type { AdminInvite, AdminProject, AdminUser, AuditEntry, AuditQuery, ProjectListItem, SessionUser } from '../../src/api/types'
import { fakeApi } from '../helpers'

export const ME: SessionUser = { id: 'u-me', email: 'me@example.com', name: '나관리', isInstanceAdmin: true }

export function adminUser(id: string, name: string, extra: Partial<AdminUser> = {}): AdminUser {
  return {
    id,
    email: `${id}@example.com`,
    name,
    isInstanceAdmin: false,
    active: true,
    createdAt: '2026-10-01T09:05:00.000Z',
    lastSeenAt: null,
    projectCount: 0,
    invite: null,
    ...extra,
  }
}

export function invite(id: string, name: string, extra: Partial<AdminInvite> = {}): AdminInvite {
  return {
    id,
    name,
    kind: 'single',
    expiresAt: '2026-11-08T00:00:00.000Z',
    state: 'usable',
    signups: 0,
    createdAt: '2026-11-01T00:00:00.000Z',
    createdBy: { id: ME.id, name: ME.name },
    ...extra,
  }
}

export function adminProject(id: string, name: string, extra: Partial<AdminProject> = {}): AdminProject {
  return {
    id,
    name,
    slug: id,
    owners: [{ id: ME.id, name: ME.name, active: true }],
    hasActiveOwner: true,
    memberCount: 1,
    updatedAt: '2026-10-20T00:00:00.000Z',
    ...extra,
  }
}

type Writes =
  | 'deactivateUser'
  | 'activateUser'
  | 'grantInstanceAdmin'
  | 'revokeInstanceAdmin'
  | 'createResetLink'
  | 'createInvite'
  | 'revokeInvite'
  | 'transferProjectOwner'

export interface AdminServer {
  client: ApiClient
  users: AdminUser[]
  invites: AdminInvite[]
  projects: AdminProject[]
  /** 내가 멤버인 프로젝트 — `listProjects` 의 답. */
  mine: string[]
  audit: { pages: { entries: AuditEntry[]; next: string | null }[] }
  /** 쓰기마다 받은 인자. */
  calls: Record<Writes | 'listAudit', unknown[][]>
  /** 이 쓰기를 이 오류로 던지게 한다. */
  refuse: Partial<Record<Writes, ApiError>>
  /** 쓰기 응답의 수(`revokedLinks` · `ownerlessProjects`). */
  counts: { revokedLinks: number; ownerlessProjects: number }
}

export function conflict(message: string): ApiError {
  return new ApiError(409, 'conflict', message, [], true)
}

export function adminServer(
  seed: { users?: AdminUser[]; invites?: AdminInvite[]; projects?: AdminProject[]; mine?: string[] } = {},
): AdminServer {
  const server: AdminServer = {
    client: undefined as unknown as ApiClient,
    users: seed.users ?? [adminUser(ME.id, ME.name, { isInstanceAdmin: true })],
    invites: seed.invites ?? [],
    projects: seed.projects ?? [],
    mine: seed.mine ?? [],
    audit: { pages: [{ entries: [], next: null }] },
    calls: {
      deactivateUser: [],
      activateUser: [],
      grantInstanceAdmin: [],
      revokeInstanceAdmin: [],
      createResetLink: [],
      createInvite: [],
      revokeInvite: [],
      transferProjectOwner: [],
      listAudit: [],
    },
    refuse: {},
    counts: { revokedLinks: 0, ownerlessProjects: 0 },
  }
  const user = (id: string): AdminUser => server.users.find((row) => row.id === id)!
  const patch = (id: string, change: Partial<AdminUser>): AdminUser => {
    server.users = server.users.map((row) => (row.id === id ? { ...row, ...change } : row))
    return user(id)
  }
  const write = <T>(name: Writes, args: unknown[], run: () => T): Promise<T> => {
    server.calls[name].push(args)
    const refused = server.refuse[name]
    if (refused !== undefined) return Promise.reject(refused)
    return Promise.resolve(run())
  }
  server.client = fakeApi({
    me: async () => ME,
    listProjects: async () =>
      server.mine.map((id): ProjectListItem => ({
        id,
        name: id,
        slug: id,
        description: null,
        role: 'owner',
        memberCount: 1,
        updatedAt: '2026-10-01T00:00:00.000Z',
      })),
    listAdminUsers: async () => server.users,
    listInvites: async () => server.invites,
    listAdminProjects: async () => server.projects,
    listAudit: async (query: AuditQuery) => {
      server.calls.listAudit.push([query])
      const index =
        query.before === undefined ? 0 : server.audit.pages.findIndex((_, i) => server.audit.pages[i - 1]?.next === query.before)
      return server.audit.pages[index] ?? { entries: [], next: null }
    },
    deactivateUser: (id) =>
      write('deactivateUser', [id], () => ({ user: patch(id, { active: false, isInstanceAdmin: false }), ...server.counts })),
    activateUser: (id) => write('activateUser', [id], () => ({ user: patch(id, { active: true }) })),
    grantInstanceAdmin: (id) => write('grantInstanceAdmin', [id], () => ({ user: patch(id, { isInstanceAdmin: true }) })),
    revokeInstanceAdmin: (id) =>
      write('revokeInstanceAdmin', [id], () => ({ user: patch(id, { isInstanceAdmin: false }), revokedLinks: server.counts.revokedLinks })),
    createResetLink: (id) => write('createResetLink', [id], () => ({ token: `reset-token-${id}`, expiresAt: '2026-11-02T09:00:00.000Z' })),
    createInvite: (body) =>
      write('createInvite', [body], () => {
        const created = invite(`i-${server.invites.length + 1}`, body.name, { kind: body.kind })
        server.invites = [...server.invites, created]
        return { invite: created, token: `invite-token-${created.id}` }
      }),
    revokeInvite: (id) =>
      write('revokeInvite', [id], () => {
        server.invites = server.invites.map((row) => (row.id === id ? { ...row, state: 'revoked' as const } : row))
        return { invite: server.invites.find((row) => row.id === id)! }
      }),
    transferProjectOwner: (projectId, userId) =>
      write('transferProjectOwner', [projectId, userId], () => {
        const target = user(userId)
        server.projects = server.projects.map((row) =>
          row.id === projectId
            ? { ...row, hasActiveOwner: true, owners: [...row.owners, { id: target.id, name: target.name, active: true }] }
            : row,
        )
        return { project: server.projects.find((row) => row.id === projectId)! }
      }),
  })
  return server
}
