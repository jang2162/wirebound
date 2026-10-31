/**
 * **관리자 기록** — 관리자 행동(링크 · 비활성화 · 지정 · owner 넘기기 · 테마)과 링크 사용(가입 · 재설정)을 남기고 읽는다
 * (spec `docs/superpowers/specs/2026-10-31-workspace-admin-design.md` «관리자 › 기록»).
 *
 * **그 행동과 같은 트랜잭션에서 쓴다** — 부르는 쪽이 쓰기 트랜잭션의 `trx` 를 넘긴다. 행동이 되돌아가면(재확인 403 · 409) 기록도
 * 함께 사라지고, 커밋된 행동에는 늘 기록이 있다. 화면에서 고치거나 지우는 길은 없다.
 *
 * **이름은 읽을 때 조인한다** — 대상 칸에는 FK 가 없어(`0034-accounts` 머리말) 대상이 지워지면 조인이 비고, 그때 행동 때
 * `detail` 에 적어 둔 이름(`targetName` · `targetEmail` · `projectName` · `inviteName`)을 쓴다.
 */
import { sql } from 'kysely'
import type { DbHandle } from '../db/tx'

export const AUDIT_ACTIONS = [
  'invite.create',
  'invite.revoke',
  'invite.signup',
  'reset.create',
  'reset.use',
  'user.deactivate',
  'user.activate',
  'admin.grant',
  'admin.revoke',
  'project.owner',
  'theme.upload',
  'theme.hide',
  'theme.unhide',
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number]

export type AuditDetail = Record<string, string | number | boolean>

export interface AuditEntry {
  id: string
  at: string
  action: AuditAction
  actor: { kind: 'user'; id: string; name: string } | { kind: 'cli' }
  targetUser: { id: string; name: string; email: string } | null
  project: { id: string; name: string } | null
  invite: { id: string; name: string } | null
  detail: AuditDetail
}

export interface AuditRecord {
  action: AuditAction
  /** `null` 은 서버 명령(`db/admin.ts`)이다. */
  actorId: string | null
  targetUserId?: string
  projectId?: string
  inviteId?: string
  detail?: AuditDetail
}

/** 한 줄을 남긴다. **쓰기 트랜잭션의 `trx` 로 부른다**(머리말). */
export async function recordAdminAction(trx: DbHandle, entry: AuditRecord): Promise<void> {
  await trx
    .insertInto('admin_audit')
    .values({
      action: entry.action,
      actor_id: entry.actorId,
      target_user_id: entry.targetUserId ?? null,
      project_id: entry.projectId ?? null,
      invite_id: entry.inviteId ?? null,
      detail: JSON.stringify(entry.detail ?? {}),
    })
    .execute()
}

export interface AuditQuery {
  action?: AuditAction
  actorId?: string
  /** 이 시각보다 앞선 줄만 — 앞 쪽의 `next` 를 그대로 받는다. */
  before?: string
  limit: number
}

/**
 * 최신이 위다. `limit` 보다 하나 더 읽어 다음 쪽이 있으면 `next` 를 낸다.
 *
 * **`next` 는 마이크로초까지 적은 ISO 다** — `at` 은 `clock_timestamp()`(마이크로초)인데 JS `Date` 는 밀리초라, 밀리초로 자른 값을 다음
 * 쪽의 `before` 로 쓰면 같은 밀리초 안의 앞선 줄이 `at < before` 에서 빠진다. 같은 마이크로초에 두 줄이 서면 쪽 경계에서 하나를 건너뛸
 * 수 있다(한 트랜잭션 안의 두 줄도 `clock_timestamp()` 가 갈라 놓는다).
 */
export async function listAdminActions(db: DbHandle, q: AuditQuery): Promise<{ entries: AuditEntry[]; next: string | null }> {
  let query = db
    .selectFrom('admin_audit as a')
    .leftJoin('users as actor', 'actor.id', 'a.actor_id')
    .leftJoin('users as target', 'target.id', 'a.target_user_id')
    .leftJoin('projects as p', 'p.id', 'a.project_id')
    .leftJoin('invites as i', 'i.id', 'a.invite_id')
    .select([
      'a.id',
      'a.at',
      sql<string>`to_char(a.at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as('cursor'),
      'a.action',
      'a.actor_id as actorId',
      'actor.name as actorName',
      'a.target_user_id as targetUserId',
      'target.name as targetName',
      'target.email as targetEmail',
      'a.project_id as projectId',
      'p.name as projectName',
      'a.invite_id as inviteId',
      'i.name as inviteName',
      'a.detail',
    ])
    .orderBy('a.at', 'desc')
    .orderBy('a.id', 'desc')
    .limit(q.limit + 1)
  if (q.action !== undefined) query = query.where('a.action', '=', q.action)
  if (q.actorId !== undefined) query = query.where('a.actor_id', '=', q.actorId)
  if (q.before !== undefined) query = query.where('a.at', '<', sql<Date>`${q.before}::timestamptz`)
  const rows = await query.execute()

  const page = rows.slice(0, q.limit)
  const text = (value: unknown): string => (typeof value === 'string' ? value : '')
  const entries = page.map((row): AuditEntry => {
    const detail = row.detail
    return {
      id: row.id,
      at: row.at.toISOString(),
      action: row.action as AuditAction,
      actor: row.actorId === null ? { kind: 'cli' } : { kind: 'user', id: row.actorId, name: row.actorName ?? '' },
      targetUser:
        row.targetUserId === null
          ? null
          : {
              id: row.targetUserId,
              name: row.targetName ?? text(detail.targetName),
              email: row.targetEmail ?? text(detail.targetEmail),
            },
      project: row.projectId === null ? null : { id: row.projectId, name: row.projectName ?? text(detail.projectName) },
      invite: row.inviteId === null ? null : { id: row.inviteId, name: row.inviteName ?? text(detail.inviteName) },
      detail,
    }
  })
  return { entries, next: rows.length > q.limit ? page[page.length - 1]!.cursor : null }
}
