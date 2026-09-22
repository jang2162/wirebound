import type { Kysely, Migration } from 'kysely'

/**
 * `comments.idempotency_key` — **같은 게시를 두 번 커밋하지 않는다**(2026-09-21, 이월 Q·R 뒤).
 *
 * 웹의 쓰기 장부(`apps/web/src/panels/write-ledger.tsx`)는 응답이 10초 안에 안 오면 요청을
 * 끊고 목록을 다시 읽어 판정한다. 그런데 서버가 이미 받은 요청은 끊겨도 커밋한다 — Chrome
 * 실측: 10초에 «안 달림»으로 판정했는데 13.4초에 커밋됐고, 그 사이 사용자가 다시 달면
 * **같은 글이 두 행**이 됐다. 새로고침이 끊은 게시도 같은 꼴로 두 행을 만들었다. 클라이언트는
 * «아직 안 달렸다»와 «영영 안 달린다»를 가를 수 없다 — **가를 수 있는 것은 서버다.**
 *
 * 그래서 게시에 **클라이언트가 지은 키**를 싣고, 같은 키가 다시 오면 서버가 앞 행을 그대로
 * 돌려준다(`routes/comments.ts`의 `POST`). 이 컬럼이 그 키다.
 *
 * ---
 *
 * **범위는 (페이지, 작성자, 키)다.** 코멘트는 페이지에 매이고(0008) 키는 **한 사람의 초안**을
 * 가리킨다. 작성자를 빼면 남이 내 키를 실어 보냈을 때 **내 행이 그 사람의 «만든 결과»로**
 * 돌아간다 — 멱등이 아니라 남의 게시를 제 것으로 받는 길이 된다. 작성자를 넣으면 그 요청은
 * 그냥 제 행을 새로 만든다.
 *
 * **`NULL`을 허용한다.** 키 없는 게시(키를 싣지 않는 클라이언트 · 페이지 JSON 가져오기 ·
 * 스냅샷 복원)가 있다. Postgres 의 유일 색인은 `NULL`끼리를 서로 다른 값으로 보므로 부분
 * 색인(`WHERE idempotency_key IS NOT NULL`) 없이도 키 없는 행이 여럿 들어간다.
 *
 * **유일 색인은 마지막 방벽이다.** 라우트는 페이지 행을 잠근 뒤 같은 키를 찾아 재생하므로
 * 정상 경로에서는 이 색인이 막을 일이 없다. 그 확인이 빠지는 날 같은 키의 둘째 삽입을 조용한
 * 두 행이 아니라 **실패**로 만드는 것이 이 색인의 몫이고, 같은 키를 찾는 조회의 계획이기도 하다.
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('comments').addColumn('idempotency_key', 'text').execute()

    await db.schema
      .createIndex('comments_page_author_idempotency_key_idx')
      .unique()
      .on('comments')
      .columns(['page_id', 'author_id', 'idempotency_key'])
      .execute()
  },

  // 색인을 먼저 지운다 — 컬럼을 지우면 색인도 함께 가지만, 순서를 적어 두면 `down`만 읽고도
  // 무엇이 무엇에 기대는지 보인다. `test/global-setup.ts`가 매 실행 latest → none → latest 를
  // 왕복하므로 이 `down`은 실제로 돈다.
  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropIndex('comments_page_author_idempotency_key_idx').execute()
    await db.schema.alterTable('comments').dropColumn('idempotency_key').execute()
  },
}
