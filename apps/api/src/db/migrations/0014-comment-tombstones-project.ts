import type { Kysely, Migration } from 'kysely'
import { sql } from 'kysely'

/**
 * **묘비의 수명을 페이지에서 프로젝트로 옮긴다.**
 *
 * `0013`은 묘비를 페이지에 매단다(`page_id → pages ON DELETE CASCADE`) — «페이지가 없으면 재전송은 묘비 없이도
 * 404 다». 그런데 **페이지는 되살아난다.** 복원이 지운 페이지를 같은 id 로 다시 세우면 그 페이지의 코멘트도 같은 id
 * 로 서는데, 묘비가 이미 CASCADE 로 갔으므로 되살린 행은 키 없이 서고(키는 묘비에서만 돌아온다) 스냅샷에 없던 코멘트는
 * 가릴 것이 없다. 페이지에 매달면 같은 키 재전송이 **201 · 같은 글 두 행** 또는 **201 · 되살림**이 된다 — 페이지
 * `DELETE` 뒤 복원, 그리고 복원의 `delete-page` 뒤 복원(복원 1단계가 `deleteComment`로 세운 묘비를 같은 트랜잭션의
 * `delete-page`가 곧바로 지운다).
 *
 * **그래서 한 칸 더 위 — 프로젝트에 매단다.** 복원이 되살릴 수 있는 것의 바깥 경계가 프로젝트다(스냅샷은 프로젝트의
 * 것이다). 프로젝트가 지워지면 되살릴 길이 없으니 묘비도 갈 때다.
 *
 * - `project_id → projects ON DELETE CASCADE` 를 더하고, **`page_id`의 FK 를 뺀다.** `page_id`는 판정이 찾는 칸으로
 *   남는다(유일 색인 그대로) — 가리키는 페이지가 지금 없을 수 있으므로 FK 가 아니다(`comment_id`와 같은 이유).
 * - 페이지 삭제는 CASCADE 가 코멘트를 데려가기 **전에** 그 페이지의 키 있는 코멘트를 묻는다(`repos/pages.ts`의
 *   `deletePage` → `repos/comments.ts`의 `deletePageComments` — `deleteComment`와 같은 문장). 복원의 `delete-page`는
 *   1단계가 이미 묻었다.
 *
 * **DB 트리거로 CASCADE 까지 잡지 않은 까닭** — `comments`의 `BEFORE DELETE` 트리거면 페이지 삭제도 저절로 묻지만,
 * 프로젝트 삭제의 CASCADE 도 그 트리거를 태워 **지금 지워지는 프로젝트를 가리키는 묘비**를 넣는다. FK 가 있으면 그
 * 삽입이 문장 끝의 FK 검사에서 프로젝트 삭제를 깨고, FK 가 없으면 고아로 영영 남는다(재지 않음 — 코드 읽기). 그리고
 * 묻는 자리가 SQL 파일 밖의 트리거로 숨는다 — 이 저장소가 `repos/`에 SQL 을 모으는 관례와 어긋난다.
 *
 * **잠금 — 묘비를 넣는 트랜잭션은 프로젝트 행을 먼저 잡는다.** FK 가 프로젝트로 옮겨 가면 묘비 삽입이 프로젝트 행에
 * `FOR KEY SHARE`를 건다. 묻는 길(코멘트 `DELETE` · 페이지 삭제)은 페이지 행을 쥔 뒤에 묻으므로, 프로젝트 행을
 * `FOR UPDATE`로 먼저 잡고 페이지 행을 기다리는 복원 · 프로젝트 삭제와 고리가 된다. 그래서 두 길은 페이지를 잡기
 * **전에** 프로젝트 행을 먼저 잡는다 — 코멘트 `DELETE`는 `lockProjectForBurial`(`FOR KEY SHARE` — `repos/comments.ts`),
 * 페이지 삭제는 트리 쓰기의 첫 잠금 `lockProjectTree`(`FOR NO KEY UPDATE`). 복원은 프로젝트 행을
 * 이미 쥐고 묻는다.
 *
 * **`0013`을 고치지 않고 여기 둔다** — 이미 `0013`을 돈 DB 는 고친 `0013`을 다시 돌지 않는다. `0013`이 남긴 묘비는
 * 전부 살아 있는 페이지를 가리킨다(`0013`의 CASCADE) — 그 페이지의 프로젝트로 채운다.
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .alterTable('comment_tombstones')
      .addColumn('project_id', 'uuid', (col) => col.references('projects.id').onDelete('cascade'))
      .execute()
    await sql`
      update comment_tombstones t set project_id = p.project_id from pages p where p.id = t.page_id
    `.execute(db)
    await db.schema.alterTable('comment_tombstones').alterColumn('project_id', (col) => col.setNotNull()).execute()
    await db.schema.alterTable('comment_tombstones').dropConstraint('comment_tombstones_page_id_fkey').execute()
    // 프로젝트 삭제의 CASCADE 가 이 칸으로 찾는다 — 색인이 없으면 프로젝트 하나를 지울 때마다 표 전체를 훑는다.
    await db.schema.createIndex('comment_tombstones_project_idx').on('comment_tombstones').column('project_id').execute()
  },

  // **`down`은 페이지가 없는 묘비를 버린다** — `0013`의 FK 를 되살리려면 가리키는 페이지가 있어야 한다. 버린 묘비의 키는
  // (복원이 그 페이지를 되살리면) 다시 되살림에 열린다 — `0013`의 `down`이 모든 묘비를 버리는 것과 같은 성질이다.
  // `test/global-setup.ts`가 매 실행 latest → none → latest 를 왕복하므로 이 `down`이 실제로 돈다.
  async down(db: Kysely<unknown>): Promise<void> {
    await sql`delete from comment_tombstones t where not exists (select 1 from pages p where p.id = t.page_id)`.execute(db)
    await db.schema
      .alterTable('comment_tombstones')
      .addForeignKeyConstraint('comment_tombstones_page_id_fkey', ['page_id'], 'pages', ['id'])
      .onDelete('cascade')
      .execute()
    // 색인과 FK 는 컬럼과 함께 간다.
    await db.schema.alterTable('comment_tombstones').dropColumn('project_id').execute()
  },
}
