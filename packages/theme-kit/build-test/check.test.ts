/**
 * `wb-theme check` 를 빌드한 kit(`dist/bin.js`)으로 돌린다 — 명령의 종료 코드와 찍는 줄. 검사 자체의 판정은 `test/check.test.ts` 가 잰다.
 *
 * 설치한 kit 은 렌더러 · 갤러리를 제 `dist` 에 묶어 싣고(`tsdown.config.ts` 의 `noExternal`) jsdom 을 의존으로 받는다 — 이 파일이 그 산출물을
 * 저장소 밖 경로(`--file`)로 부른다.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { packWbtheme, type ThemeManifest } from '@wirebound/themes'

const repoRoot = process.cwd()
const BIN = resolve(repoRoot, 'packages/theme-kit/bin/wb-theme.js')
let dir: string

const MANIFEST: ThemeManifest = {
  id: 'probe',
  name: '탐침',
  version: '1.0.0',
  sdk: '^1.0.0',
  tokens: { items: { 'color.unused': { type: 'color', label: '안 씀', default: '#000000' } } },
  components: { Button: { variants: [{ id: 'primary', label: '주' }], defaultVariant: 'primary' } },
}

function write(name: string, views: string, manifest: ThemeManifest = MANIFEST): string {
  const themeJs = `(() => { const rt = globalThis.__wirebound_runtime__; const { defineTheme, DEFAULT_VIEWS } = rt.sdk;
    rt.register(defineTheme({ manifest: ${JSON.stringify(manifest)}, views: { ...DEFAULT_VIEWS, ...(${views}) } })) })()`
  const file = join(dir, name)
  writeFileSync(file, packWbtheme({ manifest, themeJs, themeCss: ':root{--wb-color-unused:#000000}' }))
  return file
}

function check(file: string) {
  const run = spawnSync('node', [BIN, 'check', '--file', file], { cwd: dir, encoding: 'utf8' })
  return { status: run.status, out: `${run.stdout}${run.stderr}` }
}

beforeAll(() => {
  execFileSync('pnpm', ['--filter', '@wirebound/theme-kit...', 'build'], { cwd: repoRoot, stdio: 'pipe' })
  dir = mkdtempSync(join(tmpdir(), 'wb-theme-check-'))
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('wb-theme check', () => {
  it('깨끗한 테마는 0 으로 끝나고 «오류 없음» 을 찍는다', () => {
    const clean = write('clean.wbtheme', '{}', { ...MANIFEST, tokens: { items: {} } })
    const { status, out } = check(clean)
    expect(out).toContain('✓ 오류 없음')
    expect(status).toBe(0)
  })

  it('던지는 뷰 · 안 쓰는 토큰이 있으면 1 로 끝나고 칸 · 토큰을 찍는다', () => {
    const broken = write('broken.wbtheme', `{ Button: () => { throw new Error('단추가 터졌다') } }`)
    const { status, out } = check(broken)
    expect(status).toBe(1)
    expect(out).toMatch(/✗ \[fallback\] Button · primary — .*단추가 터졌다/)
    expect(out).toContain('✗ 안 쓰는 토큰: color.unused')
  })
})
