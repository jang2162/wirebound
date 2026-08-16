import type { Kysely, Migration } from 'kysely'
import { sql } from 'kysely'

/**
 * `api_tokens` 테이블 — 설계 §10의 *"API 토큰은 발급자의 권한을 상속한다 … 토큰 스코프는
 * 프로젝트 단위다"*(P9-2 D1·D2·D3·D4).
 *
 * ---
 *
 * **`id`가 해시가 아니다 — `sessions`와 갈리는 자리다.**
 *
 * `sessions.id`는 쿠키 토큰의 sha256 hex 그 자체다(0001). 그 표는 목록에 나오지 않으므로
 * 행을 지목하는 열쇠가 해시 하나면 충분했다. **토큰은 목록과 폐기가 있다**(P9-2 T2 —
 * *"폐기할 수 없는 자격은 두지 않는다"*). 목록 응답에 해시를 실으면 그것은 원문의 검증자를
 * 그대로 내보내는 것이고, 실지 않으면 폐기가 지목할 열쇠가 없다. 그래서 **공개해도 되는
 * id(uuid)와 공개하면 안 되는 검증자(`token_hash`)를 갈라 둔다.**
 *
 * `token_hash`에 UNIQUE를 거는 것은 조회 경로가 그것 하나이기 때문이다 — 인덱스가 곧
 * 인증 경로의 조회 계획이고, 유일성은 해시 충돌을 조용히 두 행으로 만들지 않는다.
 *
 * ---
 *
 * **`user_id`가 `ON DELETE CASCADE`다 — `presets.created_by`(RESTRICT)와 갈린다.**
 *
 * 프리셋·코멘트·스냅샷은 **사람이 남긴 산출물**이라 그 사람을 지우려는 사람에게 *"이것을
 * 어떻게 할 것인가"*를 물어야 했다. 토큰은 산출물이 아니라 **그 사람의 자격**이다 —
 * 사람이 사라졌는데 그 사람의 자격이 남아 인증을 통과하는 상태를 만들 수 없다.
 * `sessions.user_id`가 CASCADE인 것과 같은 판단이고, 실제로 이 둘은 같은 부류다.
 *
 * **`project_id`도 CASCADE다.** 스코프가 프로젝트 단위이므로(§10) 프로젝트가 사라지면 그
 * 토큰이 가리킬 수 있는 대상 자체가 없다.
 *
 * ---
 *
 * **수명 컬럼(`expires_at`)을 두지 않는다.** §10에 토큰 만료·회전을 정하는 줄이 없고,
 * 근거 없이 기본값을 정하면 그 값이 계약이 된다(P9-2 계획서 *"계획이 재지 않은 것"*).
 * 폐기는 만든다 — **회수 수단이 없는 자격을 두지 않는 것**이 이 슬라이스가 지키는 선이고,
 * 수명은 그 위에 나중에 얹을 수 있다. 이월에 그렇게 적는다.
 *
 * **`last_used_at`은 `NULL`로 시작한다.** *"한 번도 안 쓴 토큰"*과 *"쓴 지 오래된 토큰"*을
 * 가르는 값이라 `created_at`으로 채워 두면 그 둘이 같아진다(`presets.updated_at`이 없는
 * 값을 `null`로 말하지 않는 것과 같은 자세).
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('api_tokens')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('project_id', 'uuid', (col) => col.notNull().references('projects.id').onDelete('cascade'))
      .addColumn('user_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
      // 토큰 원문의 sha256 hex. **원문은 저장하지 않는다**(§10의 세션과 같은 규칙).
      .addColumn('token_hash', 'text', (col) => col.notNull().unique())
      .addColumn('name', 'text', (col) => col.notNull())
      // 목록 순서가 흔들리지 않아야 하므로 `now()`가 아니라 `clock_timestamp()`다 —
      // 0008·0010이 같은 이유로 같은 것을 골랐고, 그쪽에 실측이 있다.
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`clock_timestamp()`))
      .addColumn('last_used_at', 'timestamptz')
      .execute()

    // 목록은 `(project_id, user_id)`로 거른다 — 자기 것만 본다(`routes/tokens.ts`).
    // `created_at`까지 넣어 정렬도 인덱스가 덮는다(0010과 같은 형태).
    await db.schema
      .createIndex('api_tokens_project_user_created_idx')
      .on('api_tokens')
      .columns(['project_id', 'user_id', 'created_at'])
      .execute()
  },

  // `token_hash`의 UNIQUE가 만든 인덱스도 테이블과 함께 간다.
  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('api_tokens').execute()
  },
}
