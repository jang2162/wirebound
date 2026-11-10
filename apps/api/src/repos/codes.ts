/**
 * 공통코드 표(`code_groups` · `code_items`)의 SQL. HTTP · zod 는 `routes/codes.ts` 다.
 *
 * **쓰기는 부르는 쪽이 프로젝트 행을 먼저 잡은 트랜잭션 안에서 부른다**(`routes/codes.ts` 머리말 «잠금 순서») — 그 잠금이 같은 프로젝트의
 * 코드 쓰기를 한 줄로 세우므로, 여기서는 «있나 · 몇 개인가»를 읽고 쓰는 사이에 남이 끼지 않는다(키 겹침 · 상한을 먼저 읽고 판정한다).
 */
import { sql } from 'kysely'
import type { CodeGroup, CodeItem, CodeTable, UsageSource, WbNode } from '@wirebound/schema'
import type { DbHandle } from '../db/tx'

/** 그 프로젝트의 표 — 그룹 · 항목 모두 `sort_order` 차례(같으면 만든 차례 · id). */
export async function readCodeTable(db: DbHandle, projectId: string): Promise<CodeGroup[]> {
  const groups = await db
    .selectFrom('code_groups')
    .select(['id', 'key', 'name'])
    .where('project_id', '=', projectId)
    .orderBy('sort_order')
    .orderBy('created_at')
    .orderBy('id')
    .execute()
  if (groups.length === 0) return []
  const items = await db
    .selectFrom('code_items')
    .select(['group_id', 'value', 'name', 'active'])
    .where(
      'group_id',
      'in',
      groups.map((group) => group.id),
    )
    .orderBy('sort_order')
    .orderBy('created_at')
    .orderBy('id')
    .execute()
  const byGroup = new Map<string, CodeItem[]>(groups.map((group) => [group.id, []]))
  for (const item of items) byGroup.get(item.group_id)!.push({ value: item.value, name: item.name, active: item.active })
  return groups.map((group) => ({ key: group.key, name: group.name, items: byGroup.get(group.id)! }))
}

/** 그룹 하나(항목 포함). 없으면 `null`. */
export async function readCodeGroup(db: DbHandle, projectId: string, key: string): Promise<CodeGroup | null> {
  const table = await readCodeTable(db, projectId)
  return table.find((group) => group.key === key) ?? null
}

async function groupId(db: DbHandle, projectId: string, key: string): Promise<string | null> {
  const row = await db.selectFrom('code_groups').select('id').where('project_id', '=', projectId).where('key', '=', key).executeTakeFirst()
  return row?.id ?? null
}

/** 쓰기의 결과 — 라우트가 상태 코드로 옮긴다. */
export type CodeWriteRefusal = 'no-group' | 'no-item' | 'taken' | 'limit'

/**
 * 차례를 다시 매긴다 — `move` 를 `to`(0 부터 · 넘치면 끝) 자리로 옮기고 나머지는 지금 차례 그대로 0, 1, 2 … 로. 행이 많아야 그룹 500 ·
 * 항목 200 이라 통째로 다시 쓴다.
 */
async function renumber(
  db: DbHandle,
  table: 'code_groups' | 'code_items',
  ids: readonly string[],
  move: string,
  to: number,
): Promise<void> {
  const rest = ids.filter((id) => id !== move)
  rest.splice(Math.min(to, rest.length), 0, move)
  for (const [index, id] of rest.entries()) {
    await db.updateTable(table).set({ sort_order: index }).where('id', '=', id).execute()
  }
}

export async function insertCodeGroup(
  db: DbHandle,
  input: { projectId: string; key: string; name: string; max: number },
): Promise<CodeGroup | CodeWriteRefusal> {
  if ((await groupId(db, input.projectId, input.key)) !== null) return 'taken'
  const count = await db
    .selectFrom('code_groups')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('project_id', '=', input.projectId)
    .executeTakeFirstOrThrow()
  if (Number(count.n) >= input.max) return 'limit'
  await db
    .insertInto('code_groups')
    .values({ project_id: input.projectId, key: input.key, name: input.name, sort_order: Number(count.n) })
    .execute()
  return { key: input.key, name: input.name, items: [] }
}

export async function updateCodeGroup(
  db: DbHandle,
  input: { projectId: string; key: string; name?: string; sortOrder?: number },
): Promise<CodeGroup | CodeWriteRefusal> {
  const id = await groupId(db, input.projectId, input.key)
  if (id === null) return 'no-group'
  if (input.name !== undefined) {
    await db
      .updateTable('code_groups')
      .set({ name: input.name, updated_at: sql<Date>`clock_timestamp()` })
      .where('id', '=', id)
      .execute()
  }
  if (input.sortOrder !== undefined) {
    const ids = await db
      .selectFrom('code_groups')
      .select('id')
      .where('project_id', '=', input.projectId)
      .orderBy('sort_order')
      .orderBy('created_at')
      .orderBy('id')
      .execute()
    await renumber(
      db,
      'code_groups',
      ids.map((row) => row.id),
      id,
      input.sortOrder,
    )
  }
  return (await readCodeGroup(db, input.projectId, input.key))!
}

export async function deleteCodeGroup(db: DbHandle, projectId: string, key: string): Promise<boolean> {
  const result = await db.deleteFrom('code_groups').where('project_id', '=', projectId).where('key', '=', key).executeTakeFirst()
  return (result.numDeletedRows ?? 0n) > 0n
}

export async function insertCodeItem(
  db: DbHandle,
  input: { projectId: string; key: string; value: string; name: string; active: boolean; max: number },
): Promise<CodeItem | CodeWriteRefusal> {
  const id = await groupId(db, input.projectId, input.key)
  if (id === null) return 'no-group'
  const taken = await db
    .selectFrom('code_items')
    .select('id')
    .where('group_id', '=', id)
    .where('value', '=', input.value)
    .executeTakeFirst()
  if (taken !== undefined) return 'taken'
  const count = await db
    .selectFrom('code_items')
    .select((eb) => eb.fn.countAll<string>().as('n'))
    .where('group_id', '=', id)
    .executeTakeFirstOrThrow()
  if (Number(count.n) >= input.max) return 'limit'
  await db
    .insertInto('code_items')
    .values({ group_id: id, value: input.value, name: input.name, active: input.active, sort_order: Number(count.n) })
    .execute()
  await touchGroup(db, id)
  return { value: input.value, name: input.name, active: input.active }
}

export async function updateCodeItem(
  db: DbHandle,
  input: { projectId: string; key: string; value: string; name?: string; active?: boolean; sortOrder?: number },
): Promise<CodeItem | CodeWriteRefusal> {
  const id = await groupId(db, input.projectId, input.key)
  if (id === null) return 'no-group'
  const item = await db.selectFrom('code_items').select('id').where('group_id', '=', id).where('value', '=', input.value).executeTakeFirst()
  if (item === undefined) return 'no-item'
  if (input.name !== undefined || input.active !== undefined) {
    await db
      .updateTable('code_items')
      .set({
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.active === undefined ? {} : { active: input.active }),
        updated_at: sql<Date>`clock_timestamp()`,
      })
      .where('id', '=', item.id)
      .execute()
  }
  if (input.sortOrder !== undefined) {
    const ids = await db
      .selectFrom('code_items')
      .select('id')
      .where('group_id', '=', id)
      .orderBy('sort_order')
      .orderBy('created_at')
      .orderBy('id')
      .execute()
    await renumber(
      db,
      'code_items',
      ids.map((row) => row.id),
      item.id,
      input.sortOrder,
    )
  }
  await touchGroup(db, id)
  const row = await db.selectFrom('code_items').select(['value', 'name', 'active']).where('id', '=', item.id).executeTakeFirstOrThrow()
  return row
}

export async function deleteCodeItem(db: DbHandle, projectId: string, key: string, value: string): Promise<CodeWriteRefusal | null> {
  const id = await groupId(db, projectId, key)
  if (id === null) return 'no-group'
  const result = await db.deleteFrom('code_items').where('group_id', '=', id).where('value', '=', value).executeTakeFirst()
  if ((result.numDeletedRows ?? 0n) === 0n) return 'no-item'
  await touchGroup(db, id)
  return null
}

async function touchGroup(db: DbHandle, id: string): Promise<void> {
  await db
    .updateTable('code_groups')
    .set({ updated_at: sql<Date>`clock_timestamp()` })
    .where('id', '=', id)
    .execute()
}

/**
 * 표를 통째로 바꾼다 — 스냅샷 복원이 부른다(`services/restore.ts`). 표에 revision 이 없어 patch 가 아니라 행 교체다. 부르는 쪽이 프로젝트 행을
 * `FOR UPDATE` 로 쥔 트랜잭션이다(복원의 잠금 차례).
 */
export async function replaceCodeTable(db: DbHandle, projectId: string, table: CodeTable): Promise<void> {
  await db.deleteFrom('code_groups').where('project_id', '=', projectId).execute()
  for (const [groupIndex, group] of table.entries()) {
    const inserted = await db
      .insertInto('code_groups')
      .values({ project_id: projectId, key: group.key, name: group.name, sort_order: groupIndex })
      .returning('id')
      .executeTakeFirstOrThrow()
    if (group.items.length === 0) continue
    await db
      .insertInto('code_items')
      .values(
        group.items.map((item, index) => ({
          group_id: inserted.id,
          value: item.value,
          name: item.name,
          active: item.active,
          sort_order: index,
        })),
      )
      .execute()
  }
}

/**
 * 사용처를 셀 원천 — 페이지 · 레이아웃의 문서와 프로젝트 모듈의 노드(개인 모듈은 남의 것이라 뺀다). 걷는 함수는 `@wirebound/schema` 의
 * `codeUsage` · `codeUsageCounts` 하나다.
 */
export async function codeUsageSources(db: DbHandle, projectId: string): Promise<UsageSource[]> {
  // 차례로 묻는다 — 트랜잭션 핸들이면 한 연결이라 나란히 보내도 줄을 선다.
  const pages = await db
    .selectFrom('pages')
    .select(['id', 'title', 'schema'])
    .where('project_id', '=', projectId)
    .orderBy('sort_order')
    .orderBy('id')
    .execute()
  const layouts = await db
    .selectFrom('layouts')
    .select(['id', 'name', 'schema'])
    .where('project_id', '=', projectId)
    .orderBy('created_at')
    .orderBy('id')
    .execute()
  const modules = await db
    .selectFrom('modules')
    .select(['id', 'name', 'nodes'])
    .where('project_id', '=', projectId)
    .orderBy('created_at')
    .orderBy('id')
    .execute()
  return [
    ...pages.map((page) => ({ kind: 'page' as const, id: page.id, title: page.title, nodes: [page.schema.root] })),
    ...layouts.map((layout) => ({ kind: 'layout' as const, id: layout.id, title: layout.name, nodes: [layout.schema.root] })),
    ...modules.map((module) => ({ kind: 'module' as const, id: module.id, title: module.name, nodes: module.nodes as WbNode[] })),
  ]
}
