/**
 * **시스템 테마를 기동 때 넣고, 테마가 비어 있는 프로젝트를 채운다**(spec `docs/superpowers/specs/2026-09-27-code-themes-design.md`
 * 「시스템 테마」). `buildApp` 이 라우트보다 먼저 부른다 — 운영 · 개발 서버 · 테스트 앱이 같은 길을 탄다.
 *
 * 저장소 빌드(`pnpm build`)가 `system-themes/<이름>/dist/<id>-<version>.wbtheme` 를 낸다. 여기서는 `package.json` 이 있는 테마 디렉터리의
 * 그 파일들 가운데 **DB 에 없는
 * `id@version` 만** 넣는다(`uploaded_by` 없음). 있는 판은 건드리지 않는다.
 *
 * **기동을 멈추는 갈래 셋** — 셋 다 조용히 넘기면 화면이 뒤늦게 틀린다:
 *
 * | 갈래 | 넘기면 |
 * |---|---|
 * | 산출물이 하나도 없다 | 새 프로젝트가 고정할 테마가 없어 null 로 선다 — 캔버스가 그릴 테마를 못 찾는다 |
 * | 같은 `id@version` 인데 sha256 이 다르다 | 이미 그 판에 고정한 프로젝트 · 스냅샷이 «그때 그 화면» 이 아닌 것을 모른 채 쓴다. 판을 올려야 한다 |
 * | 검증을 못 지난다(이슈 · `system-` 이 아닌 id · SDK 범위 밖) | 관리자 업로드가 거절하는 것을 시스템 길로 들인다 |
 *
 * 같은 입력이면 빌드가 같은 바이트를 낸다(`packWbtheme` 이 항목 시각 · 차례를 고정한다) — 다시 빌드한 것만으로는 sha256 이 안 바뀐다.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { SDK_VERSION } from '@wirebound/theme-sdk/version'
import { readWbtheme, satisfiesSdk } from '@wirebound/themes'
import type { DbHandle } from '../db/tx'
import {
  DEFAULT_THEME_ID,
  DuplicatePackageError,
  findThemePackage,
  insertThemePackage,
  latestVisibleVersion,
} from '../repos/theme-packages'

/** 시스템 테마 id 의 접두어. 관리자 업로드는 쓸 수 없다(spec 「manifest」의 `id` 줄). */
export const SYSTEM_THEME_PREFIX = 'system-'

/** 기동을 멈추는 까닭. 문장은 그대로 콘솔로 나간다 — 무엇을 치면 되는지까지 말한다. */
export class SystemThemeError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SystemThemeError'
  }
}

/**
 * `dir/*\/dist/*.wbtheme` — 경로 차례로. **`package.json` 이 있는 테마 디렉터리만 본다** — 저장소에서 걷은 테마는 체크아웃에 무시된
 * `dist` 가 남는다(`git pull` 은 추적하는 파일만 지운다). 그것을 읽으면 걷은 테마가 새 DB 에 숨김 없이 다시 들어온다.
 */
function findArtifacts(dir: string): string[] {
  if (!existsSync(dir)) return []
  const found: string[] = []
  for (const theme of readdirSync(dir).sort()) {
    if (!existsSync(join(dir, theme, 'package.json'))) continue
    const dist = join(dir, theme, 'dist')
    if (!existsSync(dist) || !statSync(dist).isDirectory()) continue
    for (const file of readdirSync(dist).sort()) {
      if (file.endsWith('.wbtheme')) found.push(join(dist, file))
    }
  }
  return found
}

export async function seedSystemThemes(db: DbHandle, dir: string): Promise<{ inserted: string[]; kept: string[] }> {
  const artifacts = findArtifacts(dir)
  if (artifacts.length === 0) {
    throw new SystemThemeError(
      `시스템 테마 산출물이 없습니다(${join(dir, '*', 'dist', '*.wbtheme')} — \`package.json\` 이 있는 테마 디렉터리만 읽는다) — 저장소 뿌리에서 \`pnpm build\` 를 먼저 돌립니다`,
    )
  }
  const inserted: string[] = []
  const kept: string[] = []
  for (const file of artifacts) {
    const bytes = readFileSync(file)
    const { files, issues } = readWbtheme(bytes)
    if (files === null) {
      throw new SystemThemeError(
        `시스템 테마 패키지가 검증을 못 지났습니다(${file}) — ${issues.map((issue) => `${issue.path} ${issue.message}`).join(' · ')}`,
      )
    }
    const { manifest } = files
    const key = `${manifest.id}@${manifest.version}`
    if (!manifest.id.startsWith(SYSTEM_THEME_PREFIX)) {
      throw new SystemThemeError(`시스템 테마의 id 는 \`${SYSTEM_THEME_PREFIX}\` 로 시작해야 합니다: ${key}(${file})`)
    }
    if (!satisfiesSdk(manifest.sdk, SDK_VERSION)) {
      throw new SystemThemeError(`시스템 테마가 호스트 SDK ${SDK_VERSION} 과 맞지 않습니다: ${key} 의 sdk 는 ${manifest.sdk}(${file})`)
    }
    const sha256 = createHash('sha256').update(bytes).digest('hex')

    let row = await findThemePackage(db, manifest.id, manifest.version)
    if (row === null) {
      try {
        await insertThemePackage(db, { manifest, bytes, sha256, uploadedBy: null })
        inserted.push(key)
        continue
      } catch (error) {
        // 같은 DB 를 보는 다른 기동이 사이에 넣었다 — 그 행과 견준다.
        if (!(error instanceof DuplicatePackageError)) throw error
        row = await findThemePackage(db, manifest.id, manifest.version)
        if (row === null) throw error
      }
    }
    if (row.sha256 !== sha256) {
      throw new SystemThemeError(
        `이미 올린 버전의 내용이 바뀌었습니다: ${key} — 판을 올리십시오(${file} 의 sha256 ${sha256} · DB ${row.sha256})`,
      )
    }
    kept.push(key)
  }
  return { inserted, kept }
}

/**
 * 테마가 비어 있는(`theme_id IS NULL`) 프로젝트를 `system-admin` 의 최신판 · 빈 토큰으로 채운다. 채운 수를 돌려준다. 멱등이다.
 *
 * 비는 판은 둘이다 — 마이그레이션 `0019` 앞에 있던 프로젝트(마이그레이션은 `.wbtheme` 를 못 본다), 시딩 전에 만든 프로젝트
 * (`repos/projects.ts` 의 `insertProject` 가 고정할 판을 못 찾았다). `system-admin` 의 모든 판이 숨었으면 채우지 않는다(0).
 */
export async function backfillProjectThemes(db: DbHandle): Promise<number> {
  const latest = await latestVisibleVersion(db, DEFAULT_THEME_ID)
  if (latest === null) return 0
  const result = await db
    .updateTable('projects')
    .set({ theme_id: DEFAULT_THEME_ID, theme_version: latest })
    .where('theme_id', 'is', null)
    .executeTakeFirst()
  return Number(result.numUpdatedRows)
}
