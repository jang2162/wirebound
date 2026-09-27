// @vitest-environment jsdom
/**
 * system-admin 을 저장소 빌드(`pnpm --filter … build` → `wb-theme build --entry src/theme.tsx`)로 `.wbtheme` 로 내고, 호스트처럼
 * 공유 런타임 위에 실어 그린다.
 *
 * **빌드는 자식 프로세스로 돈다** — 이 파일은 그리려고 jsdom 환경인데, vite 가 부르는 esbuild 가 jsdom 의 `TextEncoder` 에서
 * 불변식(`new TextEncoder().encode("") instanceof Uint8Array`)으로 죽는다. 자식 프로세스 판은 루트 `pnpm build` 가 도는 길 그대로다.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
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
const FILE = join(repoRoot, 'system-themes/admin/dist/system-admin-0.1.0.wbtheme')

let files: WbthemeFiles | null = null
let issues: unknown[] = []

beforeAll(() => {
  installCatalog()
  execFileSync('pnpm', ['--filter', '@wirebound/system-theme-admin...', 'build'], { cwd: repoRoot, stdio: 'pipe' })
  ;({ files, issues } = readWbtheme(new Uint8Array(readFileSync(FILE))))
}, 300_000)
afterEach(() => cleanup())

describe('system-admin .wbtheme', () => {
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
