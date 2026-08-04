import type { Kysely, Migration } from 'kysely'
import { sql } from 'kysely'

/**
 * `menu_nodes` 테이블을 만든다 — 설계 §9 좌측 패널의 폴더 트리(태스크 12).
 * 페이지(태스크 13)는 이 트리의 리프에 매달린다.
 *
 * `project_id`는 `projects(id)`를 `ON DELETE CASCADE`로 참조한다 — 프로젝트가
 * 지워지면 그 메뉴 트리 전체가 함께 지워진다(`repos/projects.ts`의 `deleteProject`와
 * 같은 전제).
 *
 * `parent_id`는 같은 테이블(`menu_nodes.id`)을 `ON DELETE RESTRICT`로 참조한다.
 * 자식이 있는 노드를 API(`repos/menu.ts`의 `deleteMenuNode`)가 사전에 409로 막지만,
 * 그 확인과 실제 DELETE 사이의 경합(동시에 자식이 생기는 경우)까지 막는 두 번째
 * 방어선이 이 RESTRICT다 — 앱 검사를 우회해도 DB가 최종적으로 막는다.
 *
 * `(project_id, parent_id, sort_order)` 인덱스는 트리 조회(`listMenuTree`)와
 * 형제 재번호(`repos/menu.ts`의 `closeGap`/`openGap`/`reorderWithinSiblings`)가 매번
 * "이 프로젝트의 이 부모 밑 형제들을 sort_order 순으로"라는 형태로 필터링하므로
 * 그 접근 패턴을 그대로 커버한다. UNIQUE로 걸지 않는다 — 브리프가 sort_order를
 * 형제 안에서 0부터 연속한 정수로 못박긴 했지만, 그 불변식을 지키는 것은 이
 * 테이블 위의 애플리케이션 코드(재번호 로직)의 책임이지 DB 제약의 책임이 아니다.
 * 재번호는 "형제 여럿의 sort_order를 한 트랜잭션 안에서 순차적으로 갱신"하는
 * 방식이라, UNIQUE 제약을 걸면 갱신 중간 단계에서 일시적으로 값이 겹치는
 * 문장이 위반으로 걸릴 수 있다(예: 두 형제가 값을 맞바꾸는 갱신).
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('menu_nodes')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('project_id', 'uuid', (col) => col.notNull().references('projects.id').onDelete('cascade'))
      .addColumn('parent_id', 'uuid', (col) => col.references('menu_nodes.id').onDelete('restrict'))
      .addColumn('title', 'text', (col) => col.notNull())
      .addColumn('sort_order', 'integer', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute()

    await db.schema
      .createIndex('menu_nodes_project_parent_sort_idx')
      .on('menu_nodes')
      .columns(['project_id', 'parent_id', 'sort_order'])
      .execute()
  },

  // 인덱스는 테이블과 함께 자동으로 사라지므로 따로 DROP하지 않는다. 자기 자신을
  // 참조하는 FK(parent_id → menu_nodes.id)는 같은 테이블 안의 제약이라 다른
  // 테이블과의 순서를 고려할 필요 없이 테이블 하나만 DROP하면 함께 없어진다.
  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('menu_nodes').execute()
  },
}
