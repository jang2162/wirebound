/**
 * `presets` 테이블의 SQL. HTTP도 zod도 여기 없다 — 그것은 `routes/presets.ts`다.
 *
 * **담기는 것은 `WbNode[]`이지 문서 봉투가 아니다.** 이 파일은 그 값의 뜻을 모르고
 * 컬럼으로만 다룬다 — `marker`를 버리는 것도 여기가 아니라 라우트다.
 *
 * **`created_by`를 이름과 함께 낸다.** `repos/snapshots.ts`·`repos/comments.ts`가 같은
 * 조인을 하는 이유와 같다: 목록이 *"누가 남긴 것인가"*를 그리려면 uuid만으로는 안 된다.
 */
import { sql } from 'kysely'
import type { ViewState, WbNode } from '@wirebound/schema'
import { assertLocking } from '../db/locking'
import { containsLoneSurrogate, containsNulByte } from '../db/nul-guard'
import type { DbHandle } from '../db/tx'
import { withTransaction } from '../db/tx'

/** 프리셋 어딘가에 NUL(U+0000)이나 jsonb 가 못 담는 짝 없는 서로게이트가 있을 때 던진다. 호출자가 400으로 매핑한다. */
export class PresetNulByteError extends Error {
  constructor(reason: 'nul' | 'lone-surrogate' = 'nul') {
    super(reason === 'nul' ? '프리셋에 NUL 문자(U+0000)를 포함할 수 없습니다' : '프리셋에 짝 없는 서로게이트 글자를 포함할 수 없습니다')
    this.name = 'PresetNulByteError'
  }
}

/**
 * 프로젝트 프리셋 한 줄.
 *
 * **`nodes`가 목록에도 실린다 — `snapshots`와 갈리는 자리다.** 그쪽은 payload가 프로젝트
 * 전체라 목록에서 뺐지만, 프리셋은 **페이지 하나의 트리**라 페이지 목록이 이미
 * 나르는 것과 같은 크기다. 그리고 적용하는 화면이 그것을 **반드시** 쓰므로, 빼면 고른
 * 직후 상세 조회가 한 번 더 필요해지고 그 왕복의 실패 갈래가 하나 더 생긴다.
 */
export interface PresetRecord {
  id: string
  projectId: string
  name: string
  description: string | null
  nodes: WbNode[]
  /** 저장한 페이지의 화면 상태 목록. 목록 없이 저장했으면 빈 목록이다(`NULL` 을 읽은 것). */
  viewStates: ViewState[]
  createdBy: string
  createdByName: string
  createdAt: Date
}

interface PresetRow {
  id: string
  project_id: string
  name: string
  description: string | null
  schema: WbNode[]
  view_states: ViewState[] | null
  created_by: string
  created_by_name: string
  created_at: Date
}

function selectPresets(db: DbHandle) {
  return db
    .selectFrom('presets')
    .innerJoin('users', 'users.id', 'presets.created_by')
    .select([
      'presets.id',
      'presets.project_id',
      'presets.name',
      'presets.description',
      'presets.schema',
      'presets.view_states',
      'presets.created_by',
      'presets.created_at',
      sql<string>`users.name`.as('created_by_name'),
    ])
}

function toRecord(row: PresetRow): PresetRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    description: row.description,
    nodes: row.schema,
    viewStates: row.view_states ?? [],
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
  }
}

/**
 * 프리셋 하나를 만든다.
 *
 * **NUL 검사가 여기에도 있다 — 마지막 방벽이다.** 라우트가 먼저 보지만(`routes/presets.ts`),
 * 이 함수를 지나는 다른 경로(MCP·CLI)가 생겼을 때 조용히 500이 되지 않게 한다.
 * 검사를 지우면 `schema::jsonb` 캐스팅이 `22P05`로 죽고 그것은 500이다 — 라우트 쪽 주석에
 * 그 실측이 있다.
 */
export async function insertPreset(
  db: DbHandle,
  input: {
    projectId: string
    name: string
    description: string | null
    nodes: WbNode[]
    /** 없거나 빈 목록이면 `NULL` 로 담는다 — 목록 없이 저장한 것과 같다. */
    viewStates?: ViewState[]
    createdBy: string
  },
): Promise<PresetRecord> {
  if (
    containsNulByte(input.name) ||
    containsNulByte(input.description) ||
    containsNulByte(input.nodes) ||
    containsNulByte(input.viewStates ?? null)
  ) {
    throw new PresetNulByteError()
  }
  if (containsLoneSurrogate(input.nodes) || containsLoneSurrogate(input.viewStates ?? null)) {
    throw new PresetNulByteError('lone-surrogate')
  }

  return withTransaction(db, async (trx) => {
    const inserted = await trx
      .insertInto('presets')
      .values({
        project_id: input.projectId,
        name: input.name,
        description: input.description,
        schema: JSON.stringify(input.nodes),
        view_states: input.viewStates === undefined || input.viewStates.length === 0 ? null : JSON.stringify(input.viewStates),
        created_by: input.createdBy,
      })
      .returning('id')
      .executeTakeFirstOrThrow()

    const record = await findPresetById(trx, input.projectId, inserted.id)
    if (record === null) {
      // 방금 같은 트랜잭션에서 넣은 행이 안 보인다면 그것 자체가 버그다. 조용히 `null`을
      // 흘리면 라우트가 404로 옮겨 "만들었는데 없다"가 된다(`insertSnapshot`과 같은 자리).
      throw new Error('방금 만든 프리셋을 다시 읽지 못했습니다')
    }
    return record
  })
}

/**
 * 그 프로젝트의 프리셋 전부. **오래된 것이 먼저다** — 목록에 내장 프리셋이 앞에 붙고
 * 그 뒤로 사용자가 만든 순서대로 쌓이는 것이, *"내가 어제 만든 것"*을 찾을 때
 * 자리가 움직이지 않는다. 스냅샷이 최신 순인 것과 갈리는 이유는 그쪽이 *"방금 얼린 것"*을
 * 먼저 보여야 하기 때문이다.
 */
export async function listPresets(db: DbHandle, projectId: string): Promise<PresetRecord[]> {
  const rows = await selectPresets(db)
    .where('presets.project_id', '=', projectId)
    .orderBy('presets.created_at', 'asc')
    .orderBy('presets.id', 'asc')
    .execute()
  return rows.map((row) => toRecord(row as PresetRow))
}

/**
 * 프리셋 하나.
 *
 * **`projectId`를 함께 받는다** — 남의 프로젝트의 프리셋 id를 실은 요청이 통하면 안 된다.
 * id만으로 찾고 나서 비교하는 대신 질의 조건에 두는 것은, 비교를 빠뜨린 판이 조용히
 * 통과하기 때문이다(`findSnapshotById`와 같다).
 */
export async function findPresetById(
  db: DbHandle,
  projectId: string,
  presetId: string,
): Promise<PresetRecord | null> {
  const row = await selectPresets(db)
    .where('presets.project_id', '=', projectId)
    .where('presets.id', '=', presetId)
    .executeTakeFirst()

  if (!row) return null
  return toRecord(row as PresetRow)
}

/**
 * 프리셋 하나를 지운다. 지운 것이 없으면 `false`(라우트가 404로 옮긴다).
 *
 * **`snapshots`와 갈리는 자리다** — 그쪽은 삭제 경로 자체를 만들지 않는 것이 설계서 「스냅샷」의
 * 규칙이다. 프리셋은 지울 수 있고, 그래서 이름에 유일 제약이 없다.
 */
export async function deletePreset(db: DbHandle, projectId: string, presetId: string): Promise<boolean> {
  const result = await db
    .deleteFrom('presets')
    .where('project_id', '=', projectId)
    .where('id', '=', presetId)
    .executeTakeFirst()

  return (result.numDeletedRows ?? 0n) > 0n
}

/**
 * 프로젝트의 프리셋 행 전부를 `FOR UPDATE`로 잠근다. **부르는 자리는 프로젝트 삭제 하나다**(`routes/projects.ts` — 프리셋 삭제와
 * 고리를 만들지 않으려고 CASCADE 보다 먼저 잡는다. 까닭은 그 삭제 주석). `lockProjectMenuNodes`와 같은 모양 · 같은 까닭이다.
 */
export async function lockProjectPresets(trx: DbHandle, projectId: string): Promise<void> {
  assertLocking(trx, 'lockProjectPresets')
  await trx.selectFrom('presets').select('id').where('project_id', '=', projectId).forUpdate().execute()
}
