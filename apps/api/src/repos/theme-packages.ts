/**
 * 테마 패키지 저장소(`0019-theme-packages`). SQL 만 안다 — 검증(`readWbtheme` · `satisfiesSdk`)은 부르는 자리의 일이다.
 *
 * 행은 한 번 쓰면 `hidden_at` 말고는 안 바뀌고 지우는 길이 없다(spec `docs/superpowers/specs/2026-09-27-code-themes-design.md`
 * 「저장」). 그래서 이 파일에는 UPDATE 가 숨김 하나, DELETE 가 없다.
 */
import { DatabaseError } from 'pg'
import { compareVersions, type ThemeManifest } from '@wirebound/themes'
import { withTransaction, type DbHandle } from '../db/tx'

/** 새 프로젝트 · 비어 있는 바인딩이 고정하는 테마(spec 「데이터」 — «새 프로젝트는 `system-admin` 의 최신 버전으로 시작한다»). */
export const DEFAULT_THEME_ID = 'system-admin'

export interface ThemePackageRow {
  themeId: string
  version: string
  name: string
  description: string | null
  sdkRange: string
  manifest: ThemeManifest
  size: number
  sha256: string
  uploadedBy: string | null
  /** 올린 사람의 지금 이름(`users.name`). 올린 사람이 없으면(시스템 테마 · 지워진 사용자) `null`. */
  uploaderName: string | null
  uploadedAt: Date
  hiddenAt: Date | null
}

/** 같은 `id@version` 이 이미 있다(spec 「업로드 검증」 — 재업로드는 거부한다). */
export class DuplicatePackageError extends Error {
  constructor(
    readonly themeId: string,
    readonly version: string,
  ) {
    super(`이미 올린 버전입니다: ${themeId}@${version}`)
    this.name = 'DuplicatePackageError'
  }
}

const UNIQUE_VIOLATION = '23505'
const PRIMARY_KEY = 'theme_packages_pkey'

const COLUMNS = [
  'theme_packages.theme_id as themeId',
  'theme_packages.version',
  'theme_packages.name',
  'theme_packages.description',
  'theme_packages.sdk_range as sdkRange',
  'theme_packages.manifest',
  'theme_packages.size',
  'theme_packages.sha256',
  'theme_packages.uploaded_by as uploadedBy',
  'users.name as uploaderName',
  'theme_packages.uploaded_at as uploadedAt',
  'theme_packages.hidden_at as hiddenAt',
] as const

/** 행을 읽는 자리 — 올린 사람의 이름을 함께 싣는다. */
function selectRows(db: DbHandle) {
  return db.selectFrom('theme_packages').leftJoin('users', 'users.id', 'theme_packages.uploaded_by').select(COLUMNS)
}

/**
 * 패키지 한 판을 넣는다. 같은 PK 면 `DuplicatePackageError`.
 *
 * **`manifest` 는 `readWbtheme` 이 파싱한 값을 다시 문자열로 쓴다** — 키 순서는 파싱 · 직렬화를 지나도 그대로다(JS 객체의 문자열 키
 * 차례). 칸이 `json` 이라 그 순서가 읽을 때 그대로 돌아온다(`0019` 의 머리말).
 */
export async function insertThemePackage(
  db: DbHandle,
  input: { manifest: ThemeManifest; bytes: Uint8Array; sha256: string; uploadedBy: string | null },
): Promise<ThemePackageRow> {
  const { manifest } = input
  try {
    return await withTransaction(db, async (trx) => {
      await trx
        .insertInto('theme_packages')
        .values({
          theme_id: manifest.id,
          version: manifest.version,
          name: manifest.name,
          description: manifest.description ?? null,
          sdk_range: manifest.sdk,
          manifest: JSON.stringify(manifest),
          files: Buffer.from(input.bytes.buffer, input.bytes.byteOffset, input.bytes.byteLength),
          size: input.bytes.byteLength,
          sha256: input.sha256,
          uploaded_by: input.uploadedBy,
        })
        .execute()
      return (await findThemePackage(trx, manifest.id, manifest.version))!
    })
  } catch (error) {
    if (error instanceof DatabaseError && error.code === UNIQUE_VIOLATION && error.constraint === PRIMARY_KEY) {
      throw new DuplicatePackageError(manifest.id, manifest.version)
    }
    throw error
  }
}

export async function findThemePackage(db: DbHandle, themeId: string, version: string): Promise<ThemePackageRow | null> {
  const row = await selectRows(db)
    .where('theme_packages.theme_id', '=', themeId)
    .where('theme_packages.version', '=', version)
    .executeTakeFirst()
  return row ?? null
}

/** zip 원본. 없으면 `null`. */
export async function readThemePackageFiles(db: DbHandle, themeId: string, version: string): Promise<Uint8Array | null> {
  const row = await db
    .selectFrom('theme_packages')
    .select('files')
    .where('theme_id', '=', themeId)
    .where('version', '=', version)
    .executeTakeFirst()
  return row === undefined ? null : new Uint8Array(row.files.buffer, row.files.byteOffset, row.files.byteLength)
}

/**
 * 패키지 전부 — `theme_id` 순, 한 테마 안에서는 semver 가 큰 것부터. `includeHidden` 이 거짓이면 숨긴 판은 빠진다.
 * 정렬은 코드에서 한다 — 판을 글자로 늘어놓으면 `1.10.0` 이 `1.9.0` 앞에 온다.
 */
export async function listThemePackages(db: DbHandle, opts: { includeHidden: boolean }): Promise<ThemePackageRow[]> {
  let query = selectRows(db)
  if (!opts.includeHidden) query = query.where('theme_packages.hidden_at', 'is', null)
  const rows = await query.execute()
  return rows.sort((a, b) => (a.themeId < b.themeId ? -1 : a.themeId > b.themeId ? 1 : compareVersions(b.version, a.version)))
}

/** 한 테마의 «최신» — 숨기지 않은 판 가운데 semver 가 가장 큰 것(spec 「버전과 숨김」). 없으면 `null`. */
export async function latestVisibleVersion(db: DbHandle, themeId: string): Promise<string | null> {
  const rows = await db
    .selectFrom('theme_packages')
    .select('version')
    .where('theme_id', '=', themeId)
    .where('hidden_at', 'is', null)
    .execute()
  return rows.map((row) => row.version).reduce<string | null>((best, v) => (best === null || compareVersions(v, best) > 0 ? v : best), null)
}

/**
 * 숨긴다 · 되살린다. 이미 그 상태면 시각을 안 바꾼다(숨긴 때가 처음 숨긴 때로 남는다). 없는 판이면 `null`.
 */
export async function setThemePackageHidden(
  db: DbHandle,
  themeId: string,
  version: string,
  hidden: boolean,
): Promise<ThemePackageRow | null> {
  const updated = await db
    .updateTable('theme_packages')
    .set((eb) => ({
      hidden_at: hidden ? eb.fn.coalesce('hidden_at', eb.fn<Date>('now', [])) : null,
    }))
    .where('theme_id', '=', themeId)
    .where('version', '=', version)
    .executeTakeFirst()
  return updated.numUpdatedRows === 0n ? null : findThemePackage(db, themeId, version)
}
