import type { Kysely, Migration } from 'kysely'

/**
 * `comments.revision_seq` — **그 게시가 노드에 번호를 붙이며 만든 revision 의 `seq`.** 번호를 새로 붙이지 않은 게시
 * (그 노드에 번호가 이미 있다) · 가져오기 · 복원은 `NULL`이다.
 *
 * 읽는 자리는 게시의 **재생**뿐이다(`routes/comments.ts`의 `rebroadcastPostRevision`). COMMIT 답을 잃은 게시는 커밋됐는데
 * 핸들러가 503 으로 끝나 그 revision 을 방송하지 않는다. 웹은 같은 키로 다시 보내 재생을 받는데, 재생은 앞 요청이 방송했는지
 * 모른다 — 그래서 이 칸으로 그 revision 을 찾아 **다시 보낸다**(받는 쪽은 자기 `headSeq` 이하의 프레임을 건너뛴다).
 * 이 칸이 없으면 게시와 revision 을 잇는 값이 없다 — 둘의 `created_at` 은 서로 다른 시계다(revision 은 `now()` ·
 * 코멘트는 `clock_timestamp()` — `0008-comments`).
 *
 * **FK 가 아니다** — revision 은 `(page_id, seq)`로 유일하고(`0005-revisions`) 둘 다 페이지와 함께 간다.
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('comments').addColumn('revision_seq', 'bigint').execute()
  },

  // 되돌리면 재생이 앞 요청의 번호 프레임을 다시 보내지 못한다(재생 자체는 그대로다). `test/global-setup.ts`가 매 실행
  // latest → none → latest 를 왕복하므로 이 `down`이 실제로 돈다.
  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('comments').dropColumn('revision_seq').execute()
  },
}
