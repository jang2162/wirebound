/**
 * `modules` 테이블의 SQL. HTTP도 zod도 여기 없다 — 그것은 `routes/modules.ts`다.
 *
 * **담기는 것은 `WbNode[]`이지 문서 봉투가 아니다.** 이 파일은 그 값의 뜻을 모르고 컬럼으로만 다룬다 — `marker` · 묶음 밖 액션을
 * 걷는 것도 여기가 아니라 라우트다(`moduleNodesForSave`).
 */
import { sql } from 'kysely'
import type { WbNode } from '@wirebound/schema'
import { assertLocking } from '../db/locking'
import { containsLoneSurrogate, containsNulByte } from '../db/nul-guard'
import type { DbHandle } from '../db/tx'
import { withTransaction } from '../db/tx'

/** 모듈 어딘가에 NUL(U+0000)이나 jsonb 가 못 담는 짝 없는 서로게이트가 있을 때 던진다. 호출자가 400으로 매핑한다. */
export class ModuleNulByteError extends Error {
  constructor(reason: 'nul' | 'lone-surrogate' = 'nul') {
    super(reason === 'nul' ? '모듈에 NUL 문자(U+0000)를 포함할 수 없습니다' : '모듈에 짝 없는 서로게이트 글자를 포함할 수 없습니다')
    this.name = 'ModuleNulByteError'
  }
}

/**
 * 프로젝트 모듈 한 줄.
 *
 * **`nodes`가 목록에도 실린다** — 넣는 화면이 그것을 **반드시** 쓰므로, 빼면 고른 직후 상세 조회가 한 번 더 필요해지고 그 왕복의 실패
 * 갈래가 하나 더 생긴다(옛 프리셋 목록과 같은 판단).
 */
export interface ModuleRecord {
  id: string
  projectId: string
  name: string
  nodes: WbNode[]
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

interface ModuleRow {
  id: string
  project_id: string
  name: string
  nodes: WbNode[]
  created_by: string
  created_at: Date
  updated_at: Date
}

const COLUMNS = ['id', 'project_id', 'name', 'nodes', 'created_by', 'created_at', 'updated_at'] as const

function toRecord(row: ModuleRow): ModuleRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    nodes: row.nodes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function assertStorable(name: string, nodes: WbNode[] | null): void {
  if (containsNulByte(name) || containsNulByte(nodes)) throw new ModuleNulByteError()
  if (containsLoneSurrogate(name) || containsLoneSurrogate(nodes)) throw new ModuleNulByteError('lone-surrogate')
}

/**
 * 모듈 하나를 만든다.
 *
 * **NUL · 서로게이트 검사가 여기에도 있다 — 마지막 방벽이다.** 라우트가 먼저 보지만, 이 함수를 지나는 다른 경로가 생겼을 때
 * `nodes::jsonb` 캐스팅이 `22P05` 로 죽어 500 이 되지 않게 한다.
 */
export async function insertModule(
  db: DbHandle,
  input: { projectId: string; name: string; nodes: WbNode[]; createdBy: string },
): Promise<ModuleRecord> {
  assertStorable(input.name, input.nodes)
  return withTransaction(db, async (trx) => {
    const row = await trx
      .insertInto('modules')
      .values({ project_id: input.projectId, name: input.name, nodes: JSON.stringify(input.nodes), created_by: input.createdBy })
      .returning(COLUMNS)
      .executeTakeFirstOrThrow()
    return toRecord(row as ModuleRow)
  })
}

/**
 * 그 프로젝트의 모듈 전부. **최근 것이 먼저다** — 방금 저장한 모듈을 넣으러 탭을 여는 것이 흔한 걸음이라 맨 위에 선다.
 */
export async function listModules(db: DbHandle, projectId: string): Promise<ModuleRecord[]> {
  const rows = await db
    .selectFrom('modules')
    .select(COLUMNS)
    .where('project_id', '=', projectId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .execute()
  return rows.map((row) => toRecord(row as ModuleRow))
}

/** 모듈 하나. 없거나 남의 프로젝트의 것이면 `null`(라우트가 404로 옮긴다) — `projectId`를 질의 조건에 두는 까닭은 아래 `renameModule`과 같다. */
export async function findModuleById(db: DbHandle, projectId: string, moduleId: string): Promise<ModuleRecord | null> {
  const row = await db
    .selectFrom('modules')
    .select(COLUMNS)
    .where('project_id', '=', projectId)
    .where('id', '=', moduleId)
    .executeTakeFirst()
  return row === undefined ? null : toRecord(row as ModuleRow)
}

/**
 * 모듈 이름을 바꾼다. 바꾼 행이 없으면 `null`(라우트가 404로 옮긴다).
 *
 * **`projectId`를 함께 받는다** — 남의 프로젝트의 모듈 id 를 실은 요청이 통하면 안 된다. id 로 찾고 나서 견주는 대신 질의 조건에 두는 것은,
 * 견주기를 빠뜨린 판이 조용히 통과하기 때문이다(`findSnapshotById`와 같다).
 */
export async function renameModule(db: DbHandle, projectId: string, moduleId: string, name: string): Promise<ModuleRecord | null> {
  assertStorable(name, null)
  const row = await db
    .updateTable('modules')
    .set({ name, updated_at: sql<Date>`clock_timestamp()` })
    .where('project_id', '=', projectId)
    .where('id', '=', moduleId)
    .returning(COLUMNS)
    .executeTakeFirst()
  return row === undefined ? null : toRecord(row as ModuleRow)
}

/** 모듈 하나를 지운다. 지운 것이 없으면 `false`(라우트가 404로 옮긴다). */
export async function deleteModule(db: DbHandle, projectId: string, moduleId: string): Promise<boolean> {
  const result = await db.deleteFrom('modules').where('project_id', '=', projectId).where('id', '=', moduleId).executeTakeFirst()
  return (result.numDeletedRows ?? 0n) > 0n
}

/**
 * 프로젝트의 모듈 행 전부를 `FOR UPDATE`로 잠근다. **부르는 자리는 프로젝트 삭제 하나다**(`routes/projects.ts` — 모듈 이름 바꾸기 · 삭제와
 * 고리를 만들지 않으려고 CASCADE 보다 먼저 잡는다. 까닭은 그 삭제 주석). `lockProjectMenuNodes`와 같은 모양 · 같은 까닭이다.
 */
export async function lockProjectModules(trx: DbHandle, projectId: string): Promise<void> {
  assertLocking(trx, 'lockProjectModules')
  await trx.selectFrom('modules').select('id').where('project_id', '=', projectId).forUpdate().execute()
}
