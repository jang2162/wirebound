import type { Kysely, Migration } from 'kysely'

/**
 * **지운 페이지가 쓴 마지막 번호를 남긴다** — 복원이 같은 id 로 되살리면 그 다음부터 센다(`repos/pages.ts`의 `insertPageWithId`).
 *
 * 서버는 편집의 자리 경로를 `baseSeq` 판에 그대로 적용한다(설계서 「정방향 흐름」). 그러니 한 페이지 id 에서 **번호가 같으면
 * 문서도 같아야** 한다. 페이지를 지우면 `revisions`가 CASCADE 로 함께 가서(0005) 그 id 가 어디까지 셌는지가 사라진다. 복원이
 * 되살린 페이지가 0 부터 다시 세면, 복원 방송을 못 받은 탭(WS 가 끊겼다 · MCP · CLI)이 든 번호와 남의 편집으로 오른 번호가
 * 우연히 같아지고 그 탭의 편집이 되살린 문서의 **다른 노드**에 적용된다(Chrome: `apps/web/build-test/editor-page-version.test.ts`).
 *
 * | 칸 | 무엇 |
 * |---|---|
 * | `page_id` | 지운 페이지의 id. **FK 가 아니다** — 가리키는 페이지가 지금 없다(`comment_tombstones.page_id`와 같은 이유) |
 * | `project_id` | 수명(`ON DELETE CASCADE`). 복원이 되살릴 수 있는 것의 바깥 경계가 프로젝트다(`0014`와 같은 판정) |
 * | `head_seq` | 그 id 가 지워질 때의 `head_seq` — 그 id 가 쓴 가장 큰 번호다(되살아났다 다시 지워지면 더 큰 값으로 바뀐다) |
 *
 * **줄은 되살린 뒤에도 남긴다.** 되살린 페이지의 번호는 이 값보다 크므로 다음 삭제가 더 큰 값으로 덮는다(`repos/pages.ts`의
 * `recordPageSeqFloor` — `greatest`). 되살릴 때 지우지 않으니 쓰기가 삭제 한 자리뿐이다.
 *
 * **DB 트리거로 잡지 않는다** — `0014`가 묘비에 내린 판정과 같다. `pages`의 `BEFORE DELETE` 트리거는 프로젝트 삭제의 CASCADE 도
 * 태워 지워지는 프로젝트를 가리키는 줄을 넣고, 그 삽입의 FK 검사가 프로젝트 삭제를 깬다. 페이지를 지우는 길은 둘이다 — 페이지
 * `DELETE`(`deletePage`)와 복원의 `delete-page`(`deletePageRow`). 메뉴 삭제는 `pages.menu_node_id`가 `RESTRICT`라 페이지를 안 지운다.
 *
 * **잠금 — 줄을 넣는 트랜잭션은 프로젝트 행을 먼저 쥐고 있다.** FK 가 프로젝트 행에 `FOR KEY SHARE`를 건다. 페이지 `DELETE`는 트리
 * 쓰기의 첫 잠금(`lockProjectTree` — `FOR NO KEY UPDATE`)으로, 복원은 `FOR UPDATE`로 그 행을 페이지보다 먼저 쥔다 — 제 트랜잭션의
 * 잠금이라 부딪히지 않는다(`0014`의 «묘비를 넣는 트랜잭션은 프로젝트 행을 먼저 잡는다»와 같은 길).
 *
 * **이 마이그레이션 앞에 지운 페이지는 줄이 없다** — 그 id 가 어디까지 셌는지 남은 곳이 없다. 줄이 없는 id 를 되살리면 0 부터 센다.
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('page_seq_floors')
      .addColumn('page_id', 'uuid', (col) => col.primaryKey())
      .addColumn('project_id', 'uuid', (col) => col.notNull().references('projects.id').onDelete('cascade'))
      .addColumn('head_seq', 'bigint', (col) => col.notNull())
      .execute()
    // 프로젝트 삭제의 CASCADE 가 이 칸으로 찾는다 — 색인이 없으면 프로젝트 하나를 지울 때마다 표 전체를 훑는다(`0014`와 같은 이유).
    await db.schema.createIndex('page_seq_floors_project_idx').on('page_seq_floors').column('project_id').execute()
  },

  // **`down`은 남긴 번호를 버린다** — 그 뒤 되살린 페이지는 다시 0 부터 센다. `test/global-setup.ts`가 매 실행 latest → none →
  // latest 를 왕복하므로 이 `down`이 실제로 돈다.
  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('page_seq_floors').execute()
  },
}
