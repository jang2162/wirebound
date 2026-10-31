/**
 * **관리자 › 프로젝트** — 모든 프로젝트의 목록과 «owner 넘기기»(spec `docs/superpowers/specs/2026-10-31-workspace-admin-design.md`
 * «관리자 › 프로젝트»). SQL 만 안다.
 *
 * **관리자가 하는 프로젝트 쓰기는 owner 넘기기 하나다** — 목록은 이름 · 멤버 수 · owner 만 낸다. 내용(페이지 · 메뉴 · 스냅샷)을 여는 길은
 * 여기 없고, 프로젝트 라우트는 지금처럼 `projectGuard`(멤버만)가 막는다.
 *
 * **`updatedAt` 은 `greatest(projects.updated_at, max(pages.updated_at))` 다** — 프로젝트 목록 응답(`GET /api/projects` — 뼈대 트랙)과 같은
 * 정의다. 두 트랙이 나란히 지어 여기 따로 두었다 — 병합 때 한 함수로 모은다(계획 «A7»).
 */
import { sql } from 'kysely'
import { assertLocking } from '../db/locking'
import type { DbHandle } from '../db/tx'
import { lockMemberTokens } from './api-tokens'
import { lockOwnerIds } from './members'

export interface AdminProjectRecord {
  id: string
  name: string
  slug: string
  owners: { id: string; name: string; active: boolean }[]
  hasActiveOwner: boolean
  memberCount: number
  updatedAt: Date
}

/** 한 질의로 모든 프로젝트를 읽는다 — owner · 멤버 수 · 최근 수정은 상관 부분 질의다(프로젝트마다 질의를 따로 돌지 않는다). */
function adminProjectRows(db: DbHandle) {
  return db.selectFrom('projects as p').select([
    'p.id',
    'p.name',
    'p.slug',
    sql<{ id: string; name: string; active: boolean }[]>`coalesce((
        select json_agg(json_build_object('id', u.id, 'name', u.name, 'active', u.deactivated_at is null) order by m.invited_at, u.id)
        from project_members m join users u on u.id = m.user_id
        where m.project_id = p.id and m.role = 'owner'
      ), '[]'::json)`.as('owners'),
    sql<string>`(select count(*) from project_members m where m.project_id = p.id)`.as('memberCount'),
    sql<Date>`greatest(p.updated_at, (select max(pg.updated_at) from pages pg where pg.project_id = p.id))`.as('updatedAt'),
  ])
}

type AdminProjectRow = Awaited<ReturnType<ReturnType<typeof adminProjectRows>['executeTakeFirstOrThrow']>>

function toAdminProject(row: AdminProjectRow): AdminProjectRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    owners: row.owners,
    hasActiveOwner: row.owners.some((owner) => owner.active),
    memberCount: Number(row.memberCount),
    updatedAt: row.updatedAt,
  }
}

/** 모든 프로젝트 — 만든 차례. 관리자가 멤버가 아닌 프로젝트도 든다. */
export async function listAdminProjects(db: DbHandle): Promise<AdminProjectRecord[]> {
  const rows = await adminProjectRows(db).orderBy('p.created_at', 'asc').orderBy('p.id', 'asc').execute()
  return rows.map(toAdminProject)
}

export async function findAdminProject(db: DbHandle, projectId: string): Promise<AdminProjectRecord | null> {
  const row = await adminProjectRows(db).where('p.id', '=', projectId).executeTakeFirst()
  return row === undefined ? null : toAdminProject(row)
}

/** 넘기기를 막은 까닭 — 라우트가 409 로 옮긴다. */
export class ActiveOwnerExistsError extends Error {
  constructor() {
    super('활성 owner 가 있는 프로젝트입니다')
    this.name = 'ActiveOwnerExistsError'
  }
}

/**
 * **owner 넘기기의 프로젝트 쪽** — 부르는 쪽(`routes/admin-projects.ts`)이 사용자 행(요청자 · 대상)을 잡고 재확인하고 프로젝트 행을
 * `KEY SHARE` 로 잡았다. 여기서 대상의 그 프로젝트 토큰(id 순 — `lockMemberTokens`) → owner 행(`lockOwnerIds`) 을 잡고, 활성 owner 가 있으면
 * `ActiveOwnerExistsError`. 멤버가 아니면 앞 멤버십의 토큰을 지우고 owner 로 넣고(`repos/members.ts` 의 `insertMember` 와 같은 길), 멤버면
 * owner 로 올린다. 비활성 owner 행은 그대로 둔다(그 사람을 다시 켜면 돌아온다). 앞 역할을 낸다(멤버가 아니었으면 `null`).
 *
 * **토큰 행이 owner 행보다 먼저다** — 멤버 제거 · 프로젝트 삭제와 같은 차례(`repos/members.ts` 의 `removeMember` «토큰 행이 첫 잠금이다»).
 * 대상을 멤버로 넣는 그 프로젝트 owner 의 추가(«프로젝트 행 → 대상 토큰 → 요청자 멤버 행»)와도 고리가 없다 — 여기가 owner 행을 쥐기 전에
 * 대상 토큰에서 줄을 선다.
 */
export async function transferOwner(trx: DbHandle, projectId: string, userId: string): Promise<{ previousRole: string | null }> {
  assertLocking(trx, 'transferOwner')
  await lockMemberTokens(trx, projectId, userId, null)
  await lockOwnerIds(trx, projectId)
  const active = await trx
    .selectFrom('project_members as m')
    .innerJoin('users as u', 'u.id', 'm.user_id')
    .select('u.id')
    .where('m.project_id', '=', projectId)
    .where('m.role', '=', 'owner')
    .where('u.deactivated_at', 'is', null)
    .executeTakeFirst()
  if (active !== undefined) throw new ActiveOwnerExistsError()

  const current = await trx
    .selectFrom('project_members')
    .select('role')
    .where('project_id', '=', projectId)
    .where('user_id', '=', userId)
    .executeTakeFirst()
  if (current === undefined) {
    await trx.deleteFrom('api_tokens').where('project_id', '=', projectId).where('user_id', '=', userId).execute()
    await trx.insertInto('project_members').values({ project_id: projectId, user_id: userId, role: 'owner' }).execute()
    return { previousRole: null }
  }
  await trx
    .updateTable('project_members')
    .set({ role: 'owner' })
    .where('project_id', '=', projectId)
    .where('user_id', '=', userId)
    .execute()
  return { previousRole: current.role }
}
