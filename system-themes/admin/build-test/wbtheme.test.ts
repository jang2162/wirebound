/**
 * system-admin 을 저장소 빌드(`pnpm --filter … build` → `wb-theme build --entry src/theme.tsx`)로 `.wbtheme` 로 내고, 공용 검사(`checkTheme`)로
 * 갤러리 칸 전부를 그려 본다 — 모든 컴포넌트 × 선언한 variant × 표본이 오류 없이 그려지는가.
 *
 * **빌드는 자식 프로세스로 돈다** — 이 파일에서 vite 를 부르면 esbuild 가 vitest 환경의 `TextEncoder` 에서 불변식
 * (`new TextEncoder().encode("") instanceof Uint8Array`)으로 죽을 수 있다. 자식 프로세스 판은 루트 `pnpm build` 가 도는 길 그대로다.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { readWbtheme, type WbthemeFiles } from '@wirebound/themes'
import { checkTheme, type ThemeCheckReport } from '@wirebound/theme-kit'
import { MANIFEST } from '../src/manifest'

const DIST = join(process.cwd(), 'system-themes/admin/dist')
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
  execFileSync('pnpm', ['--filter', '@wirebound/system-theme-admin...', 'build'], { cwd: process.cwd(), stdio: 'pipe' })
  built = readdirSync(DIST)
  ;({ files, issues } = readWbtheme(new Uint8Array(readFileSync(join(DIST, NAME)))))
  report = await checkTheme(files!)
}, 300_000)

describe('system-admin .wbtheme', () => {
  it('저장소 빌드는 dist 를 비우고 지금 판 하나를 낸다 · 읽기 검증을 지난다', () => {
    expect(built).toEqual([NAME])
    expect(issues).toEqual([])
    expect(files!.manifest.id).toBe('system-admin')
  })

  /**
   * 빌드 CSS 에 토큰마다 기본값 변수가 실린다 — 토큰 시트가 없는 판(갤러리 · 토큰을 안 덮은 캔버스)이 이 값으로 그려진다. 견주는 쪽은 manifest 다:
   * 이 프로젝트(build)에서는 `theme.css?raw` 가 빈 글자라(루트 `vitest.config.ts` 의 `css.include` 는 unit 프로젝트에만 있다) 소스 CSS 와 견주면
   * `toContain('')` 이 되어 늘 참이다.
   */
  it('빌드 CSS 에 토큰마다 --wb-<키>: <기본값>; 이 있다', () => {
    const css = files!.themeCss ?? ''
    expect(css.length).toBeGreaterThan(0)
    const items = Object.entries(MANIFEST.tokens.items)
    expect(items.length).toBeGreaterThan(0)
    expect(items.filter(([key, decl]) => !css.includes(`--wb-${key.replaceAll('.', '-')}: ${decl.default};`)).map(([key]) => key)).toEqual(
      [],
    )
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
