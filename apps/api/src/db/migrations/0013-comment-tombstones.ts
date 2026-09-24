import type { Kysely, Migration } from 'kysely'
import { sql } from 'kysely'

/**
 * `comment_tombstones` — **지운 게시의 키를 기억한다**.
 *
 * 멱등 키는 행에 산다(`0012-comment-idempotency-key`). 게시의 응답을 잃은 사이 그 행이 지워지면 키도
 * 함께 사라져, 같은 키로 다시 보낸 게시가 «앞 게시가 없다»로 보고 **새로 커밋한다** — 지운 말이 되살아나고
 * 아무도 그것을 말하지 않는다(제 손 · 남의 손 · 복원 어느 삭제 뒤에도 201). 그래서 행을 지울 때
 * 키가 있으면 여기 한 줄을 남기고, 같은 키가 다시 오면 라우트가 409 로 «달렸고 그 뒤 지워졌다»를 말한다
 * (`routes/comments.ts`의 `DELETED_KEY`).
 *
 * ---
 *
 * **자리 — 새 테이블이지 `comments`의 soft-delete 가 아니다.** soft-delete 면 `comments`를 읽는 자리 전부가
 * 지운 행을 걸러야 한다 — 목록 · 한 행 · 프로젝트 전량(스냅샷 캡처) · 번호 판정의 «이 노드에 남은 코멘트 수»
 * · 복원 계획의 현재 상태 · 캡처의 해시. 하나라도 빠지면 지운 말이 보이거나 번호가 유령으로 남는다 —
 * `0008`·`routes/comments.ts`가 하드 삭제를 고른 이유 그대로다. 여기 두면 **읽는 자리는 게시의 키
 * 판정 둘뿐**이다(가드 앞 · 잠금 안).
 *
 * **범위는 키와 같다 — (페이지, 작성자, 키).** 묘비는 «그 사람이 그 키로 이 페이지에 단 게시»를 가리키므로
 * `0012`의 유일 색인과 같은 세 칸으로 유일하다. 작성자를 빼면 남이 같은 키를 실은 게시가 내 묘비에 걸린다.
 *
 * **수명도 키와 같다 — 페이지가 사는 동안.** 키에는 시간 제한이 없다(행이 사는 동안 산다). 묘비는 행보다
 * 오래 살아야 하므로 한 칸 위인 **페이지**에 매단다(`ON DELETE CASCADE`). 페이지가 사라지면 같은 키 재전송은
 * 묘비 없이도 404 다(가리킬 페이지가 없다 — `test/comment-tombstone.test.ts`의 대조). 프로젝트 삭제는 페이지를
 * 거쳐 함께 간다. **이 수명은 `0014-comment-tombstones-project`가 프로젝트로 옮긴다** — 페이지는 복원으로
 * 되살아나므로 페이지에 매단 묘비는 너무 일찍 간다(그 파일의 머리말).
 *
 * **`comment_id`가 기본 키다 — 복원이 같은 id 로 되살리면 키를 돌려준다.** 복원은 지운 행을 **같은 id 로**
 * 다시 만들 수 있다(`services/restore.ts`의 `create-comment`). 그 행은 키 없이 서고(스냅샷 payload 에 키가 없다),
 * 키를 되붙이지 않으면 같은 키 재전송이 새 행을 만들어 **같은 글이 두 행**이 된다(`apps/api/README.md`
 * 「멱등 키 — 같은 게시를 두 번 커밋하지 않는다」 절). 묘비를 두고 되붙이지 않으면 반대로 틀린다 — 행이 서 있는데 «그 뒤 지워졌다». 그래서
 * `repos/comments.ts`의 `insertCommentWithId`가 이 행을 지우며 키를 되붙인다. FK 가 없는 것은 가리키는 행이
 * 이미 없기 때문이다.
 *
 * **`author_id`는 `CASCADE`다** — `comments.author_id`의 `RESTRICT`와 갈린다. 그쪽은 사람이 남긴 말이라 조용히
 * 사라지면 안 되고, 이것은 서버의 기억일 뿐이다. 사람이 없으면 그 사람의 키로 다시 보낼 사람도 없다.
 *
 * `deleted_at`은 판정에 안 쓴다 — 무엇이 언제 묻혔는지 사람이 DB 를 들여다볼 때를 위한 칸이다.
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('comment_tombstones')
      .addColumn('comment_id', 'uuid', (col) => col.primaryKey())
      .addColumn('page_id', 'uuid', (col) => col.notNull().references('pages.id').onDelete('cascade'))
      .addColumn('author_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('cascade'))
      .addColumn('idempotency_key', 'text', (col) => col.notNull())
      .addColumn('deleted_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`clock_timestamp()`))
      .execute()

    // 판정이 찾는 모양 그대로다(`0012`의 색인과 같은 세 칸). 유일인 것은 마지막 방벽이다 — 같은 키의 행은
    // 둘이 살 수 없으므로(0012) 묻히는 것도 하나다. 그것이 깨지는 날 조용한 두 줄이 아니라 실패가 된다.
    await db.schema
      .createIndex('comment_tombstones_page_author_key_idx')
      .unique()
      .on('comment_tombstones')
      .columns(['page_id', 'author_id', 'idempotency_key'])
      .execute()
  },

  // 테이블을 지우면 색인도 함께 간다. 다른 테이블을 안 건드렸으므로 순서를 지킬 것이 없다 —
  // `test/global-setup.ts`가 매 실행 latest → none → latest 를 왕복하므로 이 `down`이 실제로 돈다.
  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('comment_tombstones').execute()
  },
}
