// @vitest-environment jsdom
/**
 * system-admin 을 저장소 빌드(`pnpm --filter … build` → `wb-theme build --entry src/theme.tsx`)로 `.wbtheme` 로 내고, 호스트처럼
 * 공유 런타임 위에 실어 그린다.
 *
 * **빌드는 자식 프로세스로 돈다** — 이 파일은 그리려고 jsdom 환경인데, vite 가 부르는 esbuild 가 jsdom 의 `TextEncoder` 에서
 * 불변식(`new TextEncoder().encode("") instanceof Uint8Array`)으로 죽는다. 자식 프로세스 판은 루트 `pnpm build` 가 도는 길 그대로다.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '@wirebound/schema'
import { readWbtheme, type WbthemeFiles } from '@wirebound/themes'
import { installRuntime } from '@wirebound/theme-sdk/runtime'
import { renderDocument } from '@wirebound/renderer'
import { ADMIN_V0_CSS } from '@wirebound/system-theme-admin'

// jsdom 환경에서는 `import.meta.url` 이 `file:` 이 아니다(`packages/exporter/build-test/dist-runtime.test.ts` 머리말) — 저장소 뿌리(cwd)에서 잇는다.
const repoRoot = process.cwd()
const DIST = join(repoRoot, 'system-themes/admin/dist')
const FILE = join(DIST, 'system-admin-0.1.0.wbtheme')
/** 빌드 전에 심는 옛 판 이름의 산출물 — 빌드가 `dist` 를 비우는지 본다. */
const STALE = 'system-admin-9.9.9.wbtheme'

let files: WbthemeFiles | null = null
let issues: unknown[] = []
let built: string[] = []

beforeAll(() => {
  installCatalog()
  mkdirSync(DIST, { recursive: true })
  writeFileSync(join(DIST, STALE), 'stale')
  execFileSync('pnpm', ['--filter', '@wirebound/system-theme-admin...', 'build'], { cwd: repoRoot, stdio: 'pipe' })
  built = readdirSync(DIST)
  ;({ files, issues } = readWbtheme(new Uint8Array(readFileSync(FILE))))
}, 300_000)
afterEach(() => cleanup())

describe('system-admin .wbtheme', () => {
  // 옛 판 이름의 산출물이 남으면 기동 시딩이 그것까지 읽는다 — 판을 올려도 옛 이름 파일이 옛 빌드의 새 바이트로 남아 «판을 올리십시오»
  // 로 계속 멈추거나, 옛 실험의 높은 판이 새 프로젝트의 기본이 된다(A3 리뷰 5b′ · 5c′).
  it('저장소 빌드는 dist 를 비우고 낸다 — 앞에 남은 산출물이 없다', () => {
    expect(built).toEqual(['system-admin-0.1.0.wbtheme'])
  })

  it('저장소 빌드가 system-admin-0.1.0.wbtheme 를 내고 읽기 검증을 지난다', () => {
    expect(issues).toEqual([])
    expect(files!.manifest.id).toBe('system-admin')
    expect(files!.themeCss!.replace(/\s+/g, '')).toContain(ADMIN_V0_CSS.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, '').slice(0, 200))
  })

  it('실어 그리면 테마 뷰로 그려진다 — 공유 런타임 한 벌', () => {
    const handle = installRuntime()
    try {
      new Function(files!.themeJs)()          // 호스트가 <script> 로 싣는 것과 같은 일
      const def = handle.take()
      expect(def?.manifest.id).toBe('system-admin')
      const doc = { version: 1, root: { id: 'r', type: 'Page', children: [{ id: 'b', type: 'Button', props: { label: '저장' }, variant: 'primary' }] } }
      const { container } = render(<>{renderDocument(doc as never, { theme: def! })}</>)
      const btn = container.querySelector('[data-wb-id="b"]')!
      expect(btn.tagName).toBe('BUTTON')
      expect(btn.getAttribute('data-wb-variant')).toBe('primary')
      expect(container.querySelector('[data-wb-error]')).toBeNull()
    } finally { handle.uninstall() }
  })
})
