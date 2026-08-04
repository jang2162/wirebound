import type { Kysely, Migration } from 'kysely'
import { sql } from 'kysely'

/**
 * `pages` 테이블을 만든다 — 설계 §7.1의 서버 검증 게이트가 지키는 문서(설계 §13)를
 * 담는 테이블이다. 메뉴 트리(`0003-menu-nodes`)의 리프에 매달린다.
 *
 * `project_id`는 `projects(id)`를 `ON DELETE CASCADE`로 참조한다 — 프로젝트가
 * 지워지면 그 페이지 전체가 함께 지워진다(`repos/projects.ts`의 `deleteProject`와
 * 같은 전제, `menu_nodes`와 동일).
 *
 * `menu_node_id`는 `menu_nodes(id)`를 `ON DELETE RESTRICT`로 참조한다. 페이지를
 * 가진 메뉴를 지우려는 시도를 API(`repos/menu.ts`의 `deleteMenuNode`)가 사전에
 * 409로 막지만, 그 확인과 실제 DELETE 사이의 경합까지 막는 두 번째
 * 방어선이 이 RESTRICT다 — `0003-menu-nodes`의 `parent_id ... ON DELETE RESTRICT`와
 * 같은 이유.
 *
 * `schema`는 `jsonb`다. `db/types.ts`의 컬럼 타입은 `JSONColumnType<PageDocument>`
 * (= `ColumnType<PageDocument, string, string>`)라, 삽입·갱신 시엔 `JSON.stringify`한
 * 문자열을 넘기고(Postgres가 jsonb로 캐스트한다) 조회 시엔 파싱된 객체가 온다
 * (`pg` 드라이버가 jsonb OID를 기본으로 `JSON.parse`한다).
 *
 * `(project_id, menu_node_id, sort_order)` 인덱스는 "이 프로젝트의 이 메뉴 밑
 * 페이지들을 sort_order 순으로"라는 접근 패턴(조회·재번호)을 그대로 커버한다.
 * `menu_nodes`의 형제 인덱스와 같은 이유로 UNIQUE로 걸지 않는다 — 재번호가 형제
 * 여럿의 sort_order를 한 트랜잭션 안에서 순차 갱신하는 방식이라, 중간 단계에서
 * 일시적으로 값이 겹치는 문장이 있을 수 있다.
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('pages')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('project_id', 'uuid', (col) => col.notNull().references('projects.id').onDelete('cascade'))
      .addColumn('menu_node_id', 'uuid', (col) => col.notNull().references('menu_nodes.id').onDelete('restrict'))
      .addColumn('title', 'text', (col) => col.notNull())
      .addColumn('sort_order', 'integer', (col) => col.notNull())
      .addColumn('description', 'text')
      .addColumn('schema', 'jsonb', (col) => col.notNull())
      .addColumn('schema_version', 'integer', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute()

    await db.schema
      .createIndex('pages_project_menu_sort_idx')
      .on('pages')
      .columns(['project_id', 'menu_node_id', 'sort_order'])
      .execute()
  },

  // 인덱스는 테이블과 함께 자동으로 사라지므로 따로 DROP하지 않는다. `revisions`가
  // `pages`를 참조하지만 그 테이블을 만든 0005의 `down`이 마이그레이션 역순상 먼저
  // 돌아 이미 사라진 뒤다 — 이 순서는 `test/global-setup.ts`가 매 실행 latest → none →
  // latest를 왕복하며 확인한다.
  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('pages').execute()
  },
}
