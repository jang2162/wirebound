/**
 * 표시 옵션(`project_view_prefs`) — 사람 × 프로젝트의 끈 레이아웃 영역. 라우트는 `routes/view-prefs.ts`.
 *
 * 열쇠 꼴 · 개수 · 겹침은 여기서 보지 않는다 — 저장 경계가 본다. 이 계층은 그 사람의 행 하나만 읽고 쓴다.
 */
import type { DbHandle } from '../db/tx'

/** 그 사람이 그 프로젝트에서 끈 영역. 행이 없으면 `[]`(다 켠 것)이다. */
export async function findHiddenRegions(db: DbHandle, userId: string, projectId: string): Promise<string[]> {
  const row = await db
    .selectFrom('project_view_prefs')
    .select('hidden_regions')
    .where('user_id', '=', userId)
    .where('project_id', '=', projectId)
    .executeTakeFirst()
  return row?.hidden_regions ?? []
}

/**
 * 그 사람의 행 하나를 통째로 바꾼다(없으면 만든다). 나중 쓰기가 이긴다 — revision 이 없다(설계 「표시 옵션 저장」).
 *
 * 충돌 열쇠는 PK 둘 다다. `user_id` 가 빠지면 같은 프로젝트의 남의 행을 덮는다.
 */
export async function upsertHiddenRegions(
  db: DbHandle,
  userId: string,
  projectId: string,
  hiddenRegions: readonly string[],
): Promise<string[]> {
  const value = JSON.stringify(hiddenRegions)
  const row = await db
    .insertInto('project_view_prefs')
    .values({ user_id: userId, project_id: projectId, hidden_regions: value })
    .onConflict((oc) =>
      oc.columns(['user_id', 'project_id']).doUpdateSet({ hidden_regions: value, updated_at: (eb) => eb.fn('clock_timestamp') }),
    )
    .returning('hidden_regions')
    .executeTakeFirstOrThrow()
  return row.hidden_regions
}
