/**
 * **`api_tokens`에 `(user_id, created_at)` 색인이 있다**(`src/db/migrations/0016-api-tokens-user-idx.ts`) — 프로젝트를 가로지르는
 * «내 토큰»(목록 · 전부 폐기)과 사람을 지울 때의 CASCADE 가 표 전체를 훑지 않는다. 플래너가 그 색인을 고르는지는 행이 많아야
 * 드러나 여기서는 정의만 본다 — 전후 `EXPLAIN` 값은 그 마이그레이션의 머리말.
 */
import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { withApi } from './helpers'

describe('api_tokens 의 사람 색인', () => {
  it('user_id 가 앞이고 created_at 이 뒤다', async () => {
    await withApi(async ({ db }) => {
      const { rows } = await sql<{ indexdef: string }>`
        select indexdef from pg_indexes where tablename = 'api_tokens' and indexname = 'api_tokens_user_created_idx'
      `.execute(db)
      expect(rows.map((row) => row.indexdef.replace(/^.* USING /, ''))).toEqual(['btree (user_id, created_at)'])
    })
  })
})
