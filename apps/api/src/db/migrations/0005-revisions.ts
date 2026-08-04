import type { Kysely, Migration } from 'kysely'
import { sql } from 'kysely'

/**
 * `revisions` 테이블과 `pages.head_seq`를 만든다 — 설계 §4.2·§7.1의 편집 이력이다.
 *
 * `page_id`는 `pages(id)`를 `ON DELETE CASCADE`로 참조한다. 페이지를 지우면 그
 * 이력도 함께 사라진다 — 과거 상태의 보존은 스냅샷(P6, payload를 통째로 저장)의
 * 책임이지 revision 로그의 책임이 아니다. 이 CASCADE 덕분에 `repos/pages.ts`의
 * `deletePage`는 revision을 따로 지우지 않는다.
 *
 * `seq`는 페이지별 단조 증가 정수다. 전역 시퀀스를 쓰지 않는 이유: 클라이언트가
 * `baseSeq`로 보내는 값이 "이 페이지에서 내가 아는 마지막 변경"이어야 의미가
 * 있기 때문이다. 채번은 `services/edit-pipeline.ts`가 `pages` 행을
 * `SELECT ... FOR UPDATE`로 잠근 상태에서 `head_seq + 1`로 한다 — 그 행 잠금이
 * 페이지별 직렬화 지점이고, `(page_id, seq)` UNIQUE가 그 규약이 깨졌을 때의
 * 마지막 방어선이다.
 *
 * `bigint`인 이유는 설계 §4.2가 그렇게 정했기 때문이다. `pg`는 int8을 정밀도
 * 손실을 피하려고 **문자열**로 주므로, `db/types.ts`의 컬럼 타입이 그 비대칭을
 * 그대로 드러내고(`ColumnType<string, number, never>`) `repos/`가 경계에서
 * `Number()`로 바꾼다.
 *
 * CHECK 두 개:
 * - `actor_type`은 `'user'|'mcp'|'cli'`뿐이다(설계 §4.2). `'mcp'`·`'cli'`를 쓰는
 *   코드는 아직 없지만(P9), 값 집합을 지금 고정해 두면 나중에 마이그레이션이
 *   필요 없다.
 * - `actor_type = 'user'`면 `actor_id`가 반드시 있어야 한다. 사람의 편집인데
 *   누구인지 모르는 행은 개인 undo 스택을 재구성할 수 없게 만든다.
 *
 * `actor_id`에 FK를 걸지 않는다. `'user'`일 때는 `users(id)`를 가리키지만
 * `'mcp'`·`'cli'`일 때는 `api_tokens(id)`(P9)를 가리키게 되므로, 한 컬럼이 두
 * 테이블을 참조하는 형태에는 FK를 걸 수 없다.
 *
 * 인덱스 두 개:
 * - `(page_id, seq)` UNIQUE — 채번 규약이자 "이 페이지의 이력을 seq 순으로"라는
 *   기본 조회 패턴을 그대로 덮는다.
 * - `(page_id, actor_id, seq DESC)` — `GET .../revisions?mine=true`(설계 §7.3의
 *   새로고침 시 undo 스택 재구성)가 정확히 이 형태로 조회한다.
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('revisions')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('page_id', 'uuid', (col) => col.notNull().references('pages.id').onDelete('cascade'))
      .addColumn('seq', 'bigint', (col) => col.notNull())
      .addColumn('actor_type', 'text', (col) => col.notNull())
      .addColumn('actor_id', 'uuid')
      .addColumn('actor_label', 'text', (col) => col.notNull())
      .addColumn('ops', 'jsonb', (col) => col.notNull())
      .addColumn('inverse', 'jsonb', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addCheckConstraint('revisions_actor_type_check', sql`actor_type in ('user', 'mcp', 'cli')`)
      .addCheckConstraint('revisions_user_actor_id_check', sql`actor_type <> 'user' or actor_id is not null`)
      .execute()

    await db.schema.createIndex('revisions_page_seq_idx').on('revisions').columns(['page_id', 'seq']).unique().execute()

    await db.schema
      .createIndex('revisions_page_actor_seq_idx')
      .on('revisions')
      .columns(['page_id', 'actor_id', 'seq desc'])
      .execute()

    // 기존 행은 DEFAULT 0으로 채워진다 — "이력이 비어 있다"의 정의가 head_seq = 0이다.
    // 브리프의 `addColumn(...).alterTable('pages')` 순서는 Kysely 빌더 API와 맞지
    // 않는다(`addColumn`은 `AlterTableBuilder`의 메서드이지 스키마 최상위의 메서드가
    // 아니다) — 실제로 컴파일해 보면 `db.schema.addColumn`이 존재하지 않는다는
    // 타입 오류가 난다. 올바른 순서는 `alterTable`을 먼저 호출해 `AlterTableBuilder`를
    // 얻은 뒤 그 위에서 `addColumn`을 부르는 것이다.
    await db.schema.alterTable('pages').addColumn('head_seq', 'bigint', (col) => col.notNull().defaultTo(0)).execute()
  },

  // 인덱스는 테이블과 함께 사라지므로 따로 DROP하지 않는다. `pages.head_seq`는
  // 테이블이 남으므로 명시적으로 되돌린다.
  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('revisions').execute()
    await db.schema.alterTable('pages').dropColumn('head_seq').execute()
  },
}
