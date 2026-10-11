import type { Kysely, Migration } from 'kysely'
import { sql } from 'kysely'

/**
 * **페이지의 구조가 마지막으로 바뀐 번호**(`pages.structure_seq`) — 노드를 더하거나 · 지우거나 · 옮긴(부모나 차례가 바뀐) 편집의 `seq` 다.
 * 내용(props · 상태 · 상호작용)만 고친 편집은 이 칸을 안 올린다.
 *
 * **왜 두는가.** 소프트 잠금의 하트비트(`ws/lock.ts`)는 «판정을 지난 그대로면 문서를 안 읽고 만료만 미룬다» 로 비용을 줄이는데, 그 «그대로» 의 문서
 * 축이 `head_seq` 면 웹이 편집마다 보내는 하트비트는 편집마다 번호가 달라 건너뛰지 못한다. 잠금의 판정은 노드의 부모 사슬(겹침)만 읽으므로 구조가
 * 같으면 판정도 같다.
 *
 * **이미 있는 행:** `head_seq` 와 같게 채운다 — 구조가 언제 마지막으로 바뀌었는지 모르니 «마지막 편집에서 바뀌었다» 로 두는 쪽(다시 판정)으로 틀린다.
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .alterTable('pages')
      .addColumn('structure_seq', 'bigint', (col) => col.notNull().defaultTo(0))
      .execute()
    await sql`update pages set structure_seq = head_seq`.execute(db)
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('pages').dropColumn('structure_seq').execute()
  },
}
