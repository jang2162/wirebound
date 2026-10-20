/**
 * `personal_modules` 테이블의 SQL. HTTP도 zod도 여기 없다 — 그것은 `routes/personal-modules.ts`다.
 *
 * **함수마다 `ownerId` 를 질의 조건에 둔다** — 남의 개인 모듈 id 를 실은 요청은 «없는 행» 과 같은 결과(`null` · `false`)라 라우트가 같은 404 를
 * 낸다(설계 spec `2026-10-20-personal-modules-design.md` 「소유와 수명」 — 있는지를 알리지 않는다). id 로 찾고 나서 견주지 않는 까닭은
 * `repos/modules.ts` 의 `renameModule` 과 같다.
 *
 * 레코드 꼴은 프로젝트 모듈(`ModuleRecord`)과 같게 둔다 — 응답 모양이 같고(`createdBy` 는 소유자다), 화면이 두 묶음을 한 카드 부품으로 그린다.
 */
import { sql } from 'kysely'
import type { WbNode } from '@wirebound/schema'
import { containsLoneSurrogate, containsNulByte } from '../db/nul-guard'
import type { DbHandle } from '../db/tx'
import { ModuleNulByteError } from './modules'

/** 개인 모듈 한 줄. `nodes` 가 목록에도 실리는 까닭은 `repos/modules.ts` 의 `ModuleRecord` 와 같다. */
export interface PersonalModuleRecord {
  id: string
  ownerId: string
  name: string
  nodes: WbNode[]
  createdAt: Date
  updatedAt: Date
}

interface PersonalModuleRow {
  id: string
  owner_id: string
  name: string
  nodes: WbNode[]
  created_at: Date
  updated_at: Date
}

const COLUMNS = ['id', 'owner_id', 'name', 'nodes', 'created_at', 'updated_at'] as const

function toRecord(row: PersonalModuleRow): PersonalModuleRecord {
  return { id: row.id, ownerId: row.owner_id, name: row.name, nodes: row.nodes, createdAt: row.created_at, updatedAt: row.updated_at }
}

/** 마지막 방벽 — 라우트가 먼저 보지만, `nodes::jsonb` 가 `22P05` 로 죽어 500 이 되지 않게 한다(`repos/modules.ts` 의 `insertModule` 과 같다). */
function assertStorable(name: string, nodes: WbNode[] | null): void {
  if (containsNulByte(name) || containsNulByte(nodes)) throw new ModuleNulByteError()
  if (containsLoneSurrogate(name) || containsLoneSurrogate(nodes)) throw new ModuleNulByteError('lone-surrogate')
}

export async function insertPersonalModule(
  db: DbHandle,
  input: { ownerId: string; name: string; nodes: WbNode[] },
): Promise<PersonalModuleRecord> {
  assertStorable(input.name, input.nodes)
  const row = await db
    .insertInto('personal_modules')
    .values({ owner_id: input.ownerId, name: input.name, nodes: JSON.stringify(input.nodes) })
    .returning(COLUMNS)
    .executeTakeFirstOrThrow()
  return toRecord(row as PersonalModuleRow)
}

/** 그 사람의 개인 모듈 전부 — 최근 것이 먼저다(프로젝트 모듈 목록과 같은 차례 · 같은 까닭). */
export async function listPersonalModules(db: DbHandle, ownerId: string): Promise<PersonalModuleRecord[]> {
  const rows = await db
    .selectFrom('personal_modules')
    .select(COLUMNS)
    .where('owner_id', '=', ownerId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .execute()
  return rows.map((row) => toRecord(row as PersonalModuleRow))
}

/** 하나. 없거나 남의 것이면 `null`. */
export async function findPersonalModule(db: DbHandle, ownerId: string, moduleId: string): Promise<PersonalModuleRecord | null> {
  const row = await db
    .selectFrom('personal_modules')
    .select(COLUMNS)
    .where('owner_id', '=', ownerId)
    .where('id', '=', moduleId)
    .executeTakeFirst()
  return row === undefined ? null : toRecord(row as PersonalModuleRow)
}

/** 이름을 바꾼다. 바꾼 행이 없으면(없음 · 남의 것) `null`. */
export async function renamePersonalModule(
  db: DbHandle,
  ownerId: string,
  moduleId: string,
  name: string,
): Promise<PersonalModuleRecord | null> {
  assertStorable(name, null)
  const row = await db
    .updateTable('personal_modules')
    .set({ name, updated_at: sql<Date>`clock_timestamp()` })
    .where('owner_id', '=', ownerId)
    .where('id', '=', moduleId)
    .returning(COLUMNS)
    .executeTakeFirst()
  return row === undefined ? null : toRecord(row as PersonalModuleRow)
}

/** 하나를 지운다. 지운 것이 없으면(없음 · 남의 것) `false`. */
export async function deletePersonalModule(db: DbHandle, ownerId: string, moduleId: string): Promise<boolean> {
  const result = await db.deleteFrom('personal_modules').where('owner_id', '=', ownerId).where('id', '=', moduleId).executeTakeFirst()
  return (result.numDeletedRows ?? 0n) > 0n
}
