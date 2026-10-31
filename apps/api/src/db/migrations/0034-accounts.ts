import type { Kysely, Migration } from 'kysely'
import { sql } from 'kysely'

/**
 * **계정 — 초대 링크 · 비활성화 · 재설정 링크 · 관리자 기록**(spec `docs/superpowers/specs/2026-10-31-workspace-admin-design.md`).
 *
 * | 자리 | 무엇 |
 * |---|---|
 * | `users.deactivated_at` | 비활성 표시. `null` 이면 활성이다 |
 * | `users.invite_id` | 그 사람이 들어온 초대 링크. 시딩으로 생긴 계정은 `null` |
 * | `users.last_seen_at` | 마지막 접속 — 세션 조회가 함께 고친다(`auth/session.ts` 의 `resolveSession`). 세션이 지워져도 남는다 |
 * | `invites` | 초대 링크. 원문은 저장하지 않고 sha256 hex 만 둔다(`auth/token-hash.ts` — 세션 · API 토큰과 같다) |
 * | `password_resets` | 관리자가 만든 비밀번호 재설정 링크. 원문은 같은 규칙 |
 * | `admin_audit` | 관리자 행동 기록 — 그 행동과 같은 트랜잭션에서 쓴다(`repos/admin-audit.ts`) |
 *
 * **`admin_audit` 의 대상 칸(`target_user_id` · `project_id` · `invite_id`)에 FK 를 걸지 않는다** — 대상이 지워져도 기록은 남는다
 * (`revisions.actor_id` 와 같은 까닭). 이름은 읽을 때 조인하고, 없으면 행동 때 `detail` 에 적어 둔 이름을 쓴다.
 * `actor_id` 는 FK 이고 `null` 이 «서버 명령»(`db/admin.ts`)이다.
 *
 * **`created_by` · `actor_id` 는 기본(NO ACTION)이다** — 계정을 지우는 길이 없고, 지우려 들면 남은 링크 · 기록 앞에서 멈춘다. 링크를 만든
 * 사람이 사라졌다고 링크 · 기록을 말없이 데려가지 않는다. 실커밋 테스트의 청소(`test/helpers.ts` 의 `resetRealData`)가 그래서 이 셋을
 * 사용자보다 먼저 지운다.
 *
 * **시각 기본값은 `clock_timestamp()` 다** — 한 트랜잭션 안에서 여러 줄을 남겨도 차례가 선다(`0010-presets.ts` 머리말 «목록 순서»).
 *
 * `down` 은 컬럼을 떼고 표 셋을 지운다(`users.invite_id` 가 `invites` 를 가리키므로 컬럼이 먼저다).
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('invites')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('kind', 'text', (col) => col.notNull().check(sql`kind in ('single', 'multi')`))
      .addColumn('token_hash', 'text', (col) => col.notNull().unique())
      .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
      .addColumn('revoked_at', 'timestamptz')
      .addColumn('created_by', 'uuid', (col) => col.notNull().references('users.id'))
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`clock_timestamp()`))
      .execute()
    // 비활성화 · 관리자 해제가 그 사람이 만든 링크를 거둔다(`repos/invites.ts` 의 `revokeInvitesBy`).
    await db.schema.createIndex('invites_created_by_idx').on('invites').column('created_by').execute()

    await db.schema
      .alterTable('users')
      .addColumn('deactivated_at', 'timestamptz')
      .addColumn('invite_id', 'uuid', (col) => col.references('invites.id').onDelete('set null'))
      .addColumn('last_seen_at', 'timestamptz')
      .execute()
    // 초대 목록의 «그 링크로 가입한 수» · 가입 판정(«한 번» 은 가입 1 이상이면 다 씀).
    await db.schema.createIndex('users_invite_id_idx').on('users').column('invite_id').execute()

    await db.schema
      .createTable('password_resets')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
      .addColumn('token_hash', 'text', (col) => col.notNull().unique())
      .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
      .addColumn('used_at', 'timestamptz')
      .addColumn('created_by', 'uuid', (col) => col.notNull().references('users.id'))
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`clock_timestamp()`))
      .execute()
    await db.schema.createIndex('password_resets_user_idx').on('password_resets').column('user_id').execute()
    await db.schema.createIndex('password_resets_created_by_idx').on('password_resets').column('created_by').execute()

    await db.schema
      .createTable('admin_audit')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('at', 'timestamptz', (col) => col.notNull().defaultTo(sql`clock_timestamp()`))
      .addColumn('action', 'text', (col) => col.notNull())
      .addColumn('actor_id', 'uuid', (col) => col.references('users.id'))
      .addColumn('target_user_id', 'uuid')
      .addColumn('project_id', 'uuid')
      .addColumn('invite_id', 'uuid')
      .addColumn('detail', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
      .execute()
    // 목록은 최신이 위이고 `before` 로 쪽을 넘긴다(`repos/admin-audit.ts` 의 `listAdminActions`).
    await db.schema.createIndex('admin_audit_at_idx').on('admin_audit').columns(['at desc', 'id desc']).execute()
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('admin_audit').execute()
    await db.schema.dropTable('password_resets').execute()
    await db.schema.alterTable('users').dropColumn('invite_id').dropColumn('deactivated_at').dropColumn('last_seen_at').execute()
    await db.schema.dropTable('invites').execute()
  },
}
