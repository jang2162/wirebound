import type { Kysely, Migration } from 'kysely'

/**
 * **프리셋의 화면 상태 목록.** 프리셋은 노드 배열(`schema` — 뿌리의 `children`)만 들었는데, 상태 가지(`StateCase`)는 상태 id 로 목록을
 * 가리키고 그 목록은 문서(`viewStates`)에 있다. 노드만 담으면 상태 이름이 사라져, 적용한 페이지가 그 가지를 «목록에 없는 상태»로 읽는다.
 *
 * | 칸 | 무엇 |
 * |---|---|
 * | `view_states` | 저장한 페이지의 `viewStates`(`{ id, name }[]`). `NULL` 이면 목록 없이 저장한 것(이 칸 전의 프리셋 · 상태 없는 페이지) |
 *
 * 목록 규칙은 저장 경계(`routes/presets.ts` 의 `ViewStatesSchema`)가 지킨다 — 칸은 모양을 모른다.
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('presets').addColumn('view_states', 'jsonb').execute()
  },

  // **`down`은 목록을 버린다** — 그 프리셋은 노드만 남아, 적용이 상태 가지를 «목록에 없는 상태»로 빼고 말한다(화면의 적용 규칙).
  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('presets').dropColumn('view_states').execute()
  },
}
