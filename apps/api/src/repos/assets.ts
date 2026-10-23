/**
 * 그림 — 덩이(`asset_blobs`)와 소유 행(`project_assets` · `personal_assets`). 표의 뜻과 덩이를 지우는 트리거는 `db/migrations/0030-assets.ts` 머리말.
 *
 * # 잠금
 *
 * | 쓰기 | 차례 |
 * |---|---|
 * | 올리기 · 가져오기(프로젝트로) | 프로젝트 행 `KEY SHARE`(라우트의 `lockProjectShared`) → 덩이 `KEY SHARE`(`holdBlob`) → 한도 자물쇠(`pg_advisory_xact_lock` — 프로젝트마다) → 소유 행 삽입 → 재확인(멤버 행 `FOR SHARE`) |
 * | 가져오기(사람으로) | 덩이 `KEY SHARE` → 한도 자물쇠(사람마다) → 소유 행 삽입 |
 * | 프로젝트 삭제 | 프로젝트 행 `FOR UPDATE` → … → CASCADE 로 소유 행 삭제 → 트리거가 덩이 `FOR UPDATE` |
 *
 * **프로젝트 삭제가 소유 행을 CASCADE 전에 잡지 않아도 되는 까닭** — 소유 행을 쓰는 길이 삽입뿐이고 그 삽입은 프로젝트 행을 먼저 `KEY SHARE` 로 잡는다
 * (삭제의 `FOR UPDATE` 와 부딪힌다). 그래서 삭제가 소유 행에서 처음 남을 기다리는 판이 없다 — «자기 행 → 재확인» 순의 쓰기(모듈 이름 바꾸기 ·
 * `repos/modules.ts` 의 `lockProjectModules`)와 다르다.
 *
 * **한도는 자물쇠 안에서 센다** — 두 올리기가 함께 «한도 밑» 을 보고 둘 다 넣으면 한도를 넘는다. 프로젝트 행 `NO KEY UPDATE` 로 줄 세우면 트리 쓰기
 * (메뉴 · 페이지 생성 · 가져오기)와 한 줄에 서므로 그림만의 자물쇠(트랜잭션이 끝나면 풀린다)를 쓴다. 해시가 겹치면 남의 프로젝트와 한 줄에 설 뿐이다.
 */
import { sql } from 'kysely'
import type { DbHandle } from '../db/tx'
import type { AssetFormat } from '../services/asset-format'

/** 한도 자물쇠의 갈래 — `pg_advisory_xact_lock(int4, int4)` 의 첫 수. 두 번째 수는 소유자 id 의 `hashtext` 다. */
const QUOTA_LOCK = { project: 0x77620001, personal: 0x77620002 } as const

export interface AssetView {
  id: string
  name: string
  mime: string
  size: number
  width: number
  height: number
  createdAt: Date
}

export interface AssetBytes {
  bytes: Buffer
  mime: string
  size: number
  name: string
}

/** 가져오기에서 한 그림이 못 온 까닭 — `not-readable` 은 «출처에 없음 · 출처의 멤버가 아님 · 출처가 지워짐» 을 가르지 않는다(가르면 남의 그림이 있는지 샌다). */
export type ClaimFailure = 'not-readable' | 'quota'

export interface ClaimResult {
  claimed: string[]
  failed: { id: string; reason: ClaimFailure }[]
}

/**
 * **덩이를 세우고 지울 수 없게 잡는다**(`KEY SHARE`) — 없으면 넣는다. 마지막 소유 행을 지운 트리거가 같은 덩이를 잡고 있으면 그 커밋을 기다리고, 덩이가
 * 지워졌으면 다시 넣는다(같은 바이트다). 잡은 뒤에 넣는 소유 행의 FK 가 그 덩이를 다시 찾지 못하는 판이 없다(`0030-assets` 머리말).
 */
export async function holdBlob(trx: DbHandle, sha256: string, bytes: Uint8Array, format: AssetFormat): Promise<void> {
  for (let attempt = 0; attempt < 3; attempt++) {
    await trx
      .insertInto('asset_blobs')
      .values({ sha256, bytes: Buffer.from(bytes), mime: format.mime, size: bytes.byteLength, width: format.width, height: format.height })
      .onConflict((oc) => oc.column('sha256').doNothing())
      .execute()
    if (await holdExistingBlob(trx, sha256)) return
  }
  throw new Error(`그림 덩이를 잡지 못했습니다: ${sha256}`)
}

/** 있는 덩이를 잡는다 — 없으면(지워졌으면) `false`. 가져오기가 쓴다(바이트가 없어 다시 넣을 수 없다). */
async function holdExistingBlob(trx: DbHandle, sha256: string): Promise<boolean> {
  const row = await trx.selectFrom('asset_blobs').select('sha256').where('sha256', '=', sha256).forKeyShare().executeTakeFirst()
  return row !== undefined
}

async function quotaLock(trx: DbHandle, kind: keyof typeof QUOTA_LOCK, ownerId: string): Promise<void> {
  await sql`select pg_advisory_xact_lock(${QUOTA_LOCK[kind]}::int4, hashtext(${ownerId}))`.execute(trx)
}

/** 프로젝트가 가진 그림의 바이트 합. 같은 덩이를 두 프로젝트가 가지면 두 프로젝트에 다 센다. */
export async function projectAssetBytes(trx: DbHandle, projectId: string): Promise<number> {
  const row = await trx
    .selectFrom('project_assets')
    .innerJoin('asset_blobs', 'asset_blobs.sha256', 'project_assets.sha256')
    .select(sql<string>`coalesce(sum(asset_blobs.size), 0)`.as('total'))
    .where('project_assets.project_id', '=', projectId)
    .executeTakeFirstOrThrow()
  return Number(row.total)
}

export async function personalAssetBytes(trx: DbHandle, ownerId: string): Promise<number> {
  const row = await trx
    .selectFrom('personal_assets')
    .innerJoin('asset_blobs', 'asset_blobs.sha256', 'personal_assets.sha256')
    .select(sql<string>`coalesce(sum(asset_blobs.size), 0)`.as('total'))
    .where('personal_assets.owner_id', '=', ownerId)
    .executeTakeFirstOrThrow()
  return Number(row.total)
}

/**
 * 프로젝트에 소유 행을 더한다 — 덩이는 이미 잡혀 있어야 한다(`holdBlob`). 이미 있으면 `exists`(한도를 안 센다), 넣으면 한도가 넘는지 자물쇠 안에서
 * 보고 넘으면 `quota` 다.
 */
export async function addProjectAsset(
  trx: DbHandle,
  input: { projectId: string; sha256: string; size: number; name: string; uploadedBy: string | null; limit: number },
): Promise<'added' | 'exists' | 'quota'> {
  await quotaLock(trx, 'project', input.projectId)
  const existing = await trx
    .selectFrom('project_assets')
    .select('sha256')
    .where('project_id', '=', input.projectId)
    .where('sha256', '=', input.sha256)
    .executeTakeFirst()
  if (existing !== undefined) return 'exists'
  if ((await projectAssetBytes(trx, input.projectId)) + input.size > input.limit) return 'quota'
  await trx
    .insertInto('project_assets')
    .values({ project_id: input.projectId, sha256: input.sha256, name: input.name, uploaded_by: input.uploadedBy })
    .execute()
  return 'added'
}

export async function addPersonalAsset(
  trx: DbHandle,
  input: { ownerId: string; sha256: string; size: number; name: string; limit: number },
): Promise<'added' | 'exists' | 'quota'> {
  await quotaLock(trx, 'personal', input.ownerId)
  const existing = await trx
    .selectFrom('personal_assets')
    .select('sha256')
    .where('owner_id', '=', input.ownerId)
    .where('sha256', '=', input.sha256)
    .executeTakeFirst()
  if (existing !== undefined) return 'exists'
  if ((await personalAssetBytes(trx, input.ownerId)) + input.size > input.limit) return 'quota'
  await trx.insertInto('personal_assets').values({ owner_id: input.ownerId, sha256: input.sha256, name: input.name }).execute()
  return 'added'
}

/** 프로젝트의 그림 하나 — 소유 행이 있을 때만. 남의 프로젝트 그림 · 없는 해시 · 지워진 덩이가 같은 `null` 이다. */
export async function findProjectAsset(db: DbHandle, projectId: string, sha256: string): Promise<AssetView | null> {
  const row = await db
    .selectFrom('project_assets')
    .innerJoin('asset_blobs', 'asset_blobs.sha256', 'project_assets.sha256')
    .select([
      'project_assets.sha256 as id',
      'project_assets.name as name',
      'asset_blobs.mime as mime',
      'asset_blobs.size as size',
      'asset_blobs.width as width',
      'asset_blobs.height as height',
      'project_assets.created_at as createdAt',
    ])
    .where('project_assets.project_id', '=', projectId)
    .where('project_assets.sha256', '=', sha256)
    .executeTakeFirst()
  return row ?? null
}

/** 그 프로젝트의 그림 바이트 — 소유 행이 없으면 `null`(질의 하나 — 남의 그림과 없는 해시가 같은 길이다). */
export async function readProjectAsset(db: DbHandle, projectId: string, sha256: string): Promise<AssetBytes | null> {
  const row = await db
    .selectFrom('project_assets')
    .innerJoin('asset_blobs', 'asset_blobs.sha256', 'project_assets.sha256')
    .select(['asset_blobs.bytes as bytes', 'asset_blobs.mime as mime', 'asset_blobs.size as size', 'project_assets.name as name'])
    .where('project_assets.project_id', '=', projectId)
    .where('project_assets.sha256', '=', sha256)
    .executeTakeFirst()
  return row ?? null
}

/** 그 사람의 그림 바이트 — 자기 소유 행이 없으면 `null`. 남의 개인 그림과 없는 해시가 같은 질의 · 같은 답이다. */
export async function readPersonalAsset(db: DbHandle, ownerId: string, sha256: string): Promise<AssetBytes | null> {
  const row = await db
    .selectFrom('personal_assets')
    .innerJoin('asset_blobs', 'asset_blobs.sha256', 'personal_assets.sha256')
    .select(['asset_blobs.bytes as bytes', 'asset_blobs.mime as mime', 'asset_blobs.size as size', 'personal_assets.name as name'])
    .where('personal_assets.owner_id', '=', ownerId)
    .where('personal_assets.sha256', '=', sha256)
    .executeTakeFirst()
  return row ?? null
}

/** 프로젝트의 그림 목록 — 최근 것 먼저. */
export async function listProjectAssets(db: DbHandle, projectId: string): Promise<AssetView[]> {
  return db
    .selectFrom('project_assets')
    .innerJoin('asset_blobs', 'asset_blobs.sha256', 'project_assets.sha256')
    .select([
      'project_assets.sha256 as id',
      'project_assets.name as name',
      'asset_blobs.mime as mime',
      'asset_blobs.size as size',
      'asset_blobs.width as width',
      'asset_blobs.height as height',
      'project_assets.created_at as createdAt',
    ])
    .where('project_assets.project_id', '=', projectId)
    .orderBy('project_assets.created_at', 'desc')
    .orderBy('project_assets.sha256')
    .execute()
}

/** 출처에서 읽을 수 있는 그림 — 해시 → (이름 · 크기). 출처의 소유 행이 있는 것만 든다. */
type Readable = Map<string, { name: string; size: number }>

/**
 * 그 사람이 그 프로젝트의 멤버(viewer 이상 — 멤버면 누구나)이고 그 프로젝트가 가진 그림 가운데 `ids` 에 든 것. 멤버가 아니면 빈 것이다. 멤버 행을
 * `FOR SHARE` 로 잡는다 — 읽은 뒤 · 커밋 전에 그 사람이 빠져도 가져오기가 «멤버였다» 로 커밋하지 않게(빼기가 이 커밋을 기다린다).
 */
export async function readableFromProject(db: DbHandle, userId: string, projectId: string, ids: readonly string[]): Promise<Readable> {
  if (ids.length === 0) return new Map()
  const member = await db
    .selectFrom('project_members')
    .select('user_id')
    .where('project_id', '=', projectId)
    .where('user_id', '=', userId)
    .forShare()
    .executeTakeFirst()
  if (member === undefined) return new Map()
  const rows = await db
    .selectFrom('project_assets')
    .innerJoin('asset_blobs', 'asset_blobs.sha256', 'project_assets.sha256')
    .select(['project_assets.sha256 as id', 'project_assets.name as name', 'asset_blobs.size as size'])
    .where('project_assets.project_id', '=', projectId)
    .where('project_assets.sha256', 'in', [...ids])
    .execute()
  return new Map(rows.map((row) => [row.id, { name: row.name, size: row.size }]))
}

/** 그 사람의 개인 그림 가운데 `ids` 에 든 것. */
export async function readableFromPersonal(db: DbHandle, ownerId: string, ids: readonly string[]): Promise<Readable> {
  if (ids.length === 0) return new Map()
  const rows = await db
    .selectFrom('personal_assets')
    .innerJoin('asset_blobs', 'asset_blobs.sha256', 'personal_assets.sha256')
    .select(['personal_assets.sha256 as id', 'personal_assets.name as name', 'asset_blobs.size as size'])
    .where('personal_assets.owner_id', '=', ownerId)
    .where('personal_assets.sha256', 'in', [...ids])
    .execute()
  return new Map(rows.map((row) => [row.id, { name: row.name, size: row.size }]))
}

/**
 * **가져오기** — 출처에서 읽을 수 있는 그림만 대상(프로젝트 · 사람)에 소유 행을 더한다. 바이트를 옮기지 않는다(덩이는 한 벌). 덩이를 잡지 못하면
 * (출처의 마지막 소유 행이 그 사이 지워졌다) `not-readable` 이다. 이미 대상에 있으면 옮긴 것으로 센다. 한도는 차례대로 센다 — 앞의 것이 들고 뒤의
 * 것이 넘으면 뒤의 것만 `quota` 다.
 */
export async function claimAssets(
  trx: DbHandle,
  ids: readonly string[],
  readable: Readable,
  add: (sha256: string, entry: { name: string; size: number }) => Promise<'added' | 'exists' | 'quota'>,
): Promise<ClaimResult> {
  const result: ClaimResult = { claimed: [], failed: [] }
  for (const id of [...new Set(ids)]) {
    const entry = readable.get(id)
    if (entry === undefined || !(await holdExistingBlob(trx, id))) {
      result.failed.push({ id, reason: 'not-readable' })
      continue
    }
    const outcome = await add(id, entry)
    if (outcome === 'quota') result.failed.push({ id, reason: 'quota' })
    else result.claimed.push(id)
  }
  return result
}

/** 그림 id 들 가운데 그 프로젝트가 가진 것(번들 수집 · 가져오기 전 «이미 있음» 판정). */
export async function projectAssetIds(db: DbHandle, projectId: string, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const rows = await db
    .selectFrom('project_assets')
    .select('sha256')
    .where('project_id', '=', projectId)
    .where('sha256', 'in', [...ids])
    .execute()
  return new Set(rows.map((row) => row.sha256))
}

/** 번들에 실을 그림 — 그 프로젝트가 가진 것만(바이트 · 꼴). */
export async function readProjectAssetsForBundle(
  db: DbHandle,
  projectId: string,
  ids: readonly string[],
): Promise<{ id: string; bytes: Buffer; mime: string }[]> {
  if (ids.length === 0) return []
  return db
    .selectFrom('project_assets')
    .innerJoin('asset_blobs', 'asset_blobs.sha256', 'project_assets.sha256')
    .select(['project_assets.sha256 as id', 'asset_blobs.bytes as bytes', 'asset_blobs.mime as mime'])
    .where('project_assets.project_id', '=', projectId)
    .where('project_assets.sha256', 'in', [...ids])
    .orderBy('project_assets.sha256')
    .execute()
}
