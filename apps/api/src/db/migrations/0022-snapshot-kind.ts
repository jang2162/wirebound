import type { Kysely, Migration } from 'kysely'
import { sql } from 'kysely'

/**
 * **스냅샷이 누가 왜 찍은 것인가**(`snapshots.kind`). 메뉴 연쇄 삭제의 안전망은 프로젝트마다 개수 상한이 있고 넘으면 오래된 것부터 지운다
 * (`services/menu-cascade.ts` 머리말 «안전망 스냅샷»). 그 상한이 셀 행을 가르는 칸이다.
 *
 * | 값 | 누가 찍나 | 상한 |
 * |---|---|---|
 * | `tag` | 사람(`POST …/snapshots`) | 없다 — 지우지 않는다 |
 * | `restore-safety` | 복원(`services/restore.ts` — 태그 `복원 전 <시각>`) | 없다 |
 * | `cascade-safety` | 메뉴 연쇄 삭제(태그 `메뉴 "<제목>" 삭제 전 <시각>`) | `CASCADE_SAFETY_KEEP` |
 *
 * **태그 글자로 가르지 않는 까닭:** 태그는 사람이 아무 꼴로나 적는다 — 안전망 태그의 꼴로 적은 사람의 스냅샷이 상한에 걸려 지워진다.
 *
 * **이미 있는 행:** 태그가 정확히 안전망의 꼴이고 끝의 시각이 **그 행의 `created_at`(ISO 밀리초)과 같은** 행만 안전망으로 적는다.
 * 안전망 태그의 시각은 `payload.capturedAt` 이고 `insertSnapshot` 이 같은 값을 `created_at` 에 심는다 — 사람이 친 태그가 걸리려면
 * 저장될 그 밀리초를 미리 적어야 한다. 나머지는 `tag` 다(안 지우는 쪽으로 틀린다). **행을 지우지 않는다** — 상한을 넘은 옛 안전망은 그
 * 프로젝트의 다음 연쇄 삭제가 지운다.
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .alterTable('snapshots')
      .addColumn('kind', 'text', (col) =>
        col.notNull().defaultTo('tag').check(sql`kind in ('tag', 'restore-safety', 'cascade-safety')`),
      )
      .execute()

    const at = sql`to_char(created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`
    await sql`
      update snapshots set kind = 'cascade-safety'
      where left(tag, 4) = '메뉴 "' and right(tag, length('" 삭제 전 ' || ${at})) = '" 삭제 전 ' || ${at}
    `.execute(db)
    await sql`update snapshots set kind = 'restore-safety' where tag = '복원 전 ' || ${at}`.execute(db)
  },

  // **`down`은 가름을 버린다** — 다시 올리면 위 «이미 있는 행»의 규칙으로 다시 가른다.
  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('snapshots').dropColumn('kind').execute()
  },
}
