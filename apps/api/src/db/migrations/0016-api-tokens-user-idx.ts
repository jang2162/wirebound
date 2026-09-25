import type { Kysely, Migration } from 'kysely'

/**
 * `api_tokens (user_id, created_at)` 색인 — **프로젝트를 가로지르는 «내 토큰»이 사람으로 거른다.**
 *
 * `0011-api-tokens`의 색인은 `(project_id, user_id, created_at)`라 `project_id` 없이 `user_id`로만 거르는 질의를 못 덮는다.
 * 그런 질의가 셋이다 — 목록(`repos/api-tokens.ts`의 `listUserTokens` · `created_at` 순) · 전부 폐기(`deleteAllUserTokens`의 id 순
 * 선잠금) · 사람을 지울 때 CASCADE 가 그 사람의 토큰을 찾는 것. 색인이 없으면 셋 다 표 전체를 훑는다. `created_at`까지 넣어
 * 목록의 정렬도 색인이 덮는다(0011 과 같은 형태).
 *
 * 잰 값(토큰 20 000 · 사람마다 10 · 한 사람의 것을 `EXPLAIN (ANALYZE, BUFFERS)`): 색인 전 — 목록 · 선잠금이 `Seq Scan on api_tokens`
 * (19 990 행을 버림 · 버퍼 311 · 0.88ms · 0.51ms), CASCADE 의 `api_tokens_user_id_fkey` 트리거 0.47ms · 색인 뒤 — 목록 · 선잠금이
 * `Bitmap Index Scan on api_tokens_user_created_idx`(버퍼 15 · 0.14ms · 0.06ms), 트리거 0.06ms. 다시 재는 법은 표에 행을 채운 뒤
 * 같은 질의를 `EXPLAIN`한다(행이 적으면 플래너가 색인이 있어도 표를 훑는다).
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema.createIndex('api_tokens_user_created_idx').on('api_tokens').columns(['user_id', 'created_at']).execute()
  },

  // 되돌려도 잃는 데이터가 없다 — 위 셋이 다시 표 전체를 훑을 뿐이다. `test/global-setup.ts`가 매 실행 latest → none → latest 를
  // 왕복하므로 이 `down`이 실제로 돈다.
  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropIndex('api_tokens_user_created_idx').execute()
  },
}
