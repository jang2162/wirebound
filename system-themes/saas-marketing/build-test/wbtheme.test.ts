/**
 * system-saas-marketing 을 저장소 빌드(`pnpm --filter … build` → `wb-theme build --entry src/theme.tsx`)로 `.wbtheme` 로 내고, 공용 검사(`checkTheme`)로
 * 갤러리 칸 전부를 그려 본다 — 모든 컴포넌트 × 선언한 variant × 표본이 오류 없이 그려지는가.
 *
 * **빌드는 자식 프로세스로 돈다** — 루트 `pnpm build` 가 도는 길 그대로다(`system-themes/admin/build-test/wbtheme.test.ts` 머리말).
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { readWbtheme, type WbthemeFiles } from '@wirebound/themes'
import { checkTheme, type ThemeCheckReport } from '@wirebound/theme-kit'
import { MANIFEST } from '../src/manifest'

const DIST = join(process.cwd(), 'system-themes/saas-marketing/dist')
const NAME = `${MANIFEST.id}-${MANIFEST.version}.wbtheme`
/** 빌드 전에 심는 옛 판 이름의 산출물 — 빌드가 `dist` 를 비우는지 본다. */
const STALE = `${MANIFEST.id}-99.99.99.wbtheme`

let files: WbthemeFiles | null = null
let issues: unknown[] = []
let built: string[] = []
let report: ThemeCheckReport

beforeAll(async () => {
  mkdirSync(DIST, { recursive: true })
  writeFileSync(join(DIST, STALE), 'stale')
  execFileSync('pnpm', ['--filter', '@wirebound/system-theme-saas-marketing...', 'build'], { cwd: process.cwd(), stdio: 'pipe' })
  built = readdirSync(DIST)
  ;({ files, issues } = readWbtheme(new Uint8Array(readFileSync(join(DIST, NAME)))))
  report = await checkTheme(files!)
}, 300_000)

describe('system-saas-marketing .wbtheme', () => {
  it('저장소 빌드는 dist 를 비우고 지금 판 하나를 낸다 · 읽기 검증을 지난다', () => {
    expect(built).toEqual([NAME])
    expect(issues).toEqual([])
    expect(files!.manifest.id).toBe('system-saas-marketing')
  })

  it('갤러리 칸 전부가 오류 없이 그려진다(jsdom)', () => {
    expect(report.items).toBeGreaterThan(0)
    expect(report.errors).toEqual([])
  })

  it('선언한 토큰은 전부 쓰이고 · 패턴은 선언한 variant 만 쓴다', () => {
    expect(report.unusedTokens).toEqual([])
    expect(report.undeclaredVariantsUsedByPatterns).toEqual([])
  })
})
