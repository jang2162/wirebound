/**
 * 스타터 템플릿 zip 을 잰다 — 빌드한 kit(`dist/`)의 `packTemplate` 으로 짓고 풀어 본다. 두 tarball 은 시스템 `tar` 로 푼다.
 *
 * **저장소 밖 실제 설치는 `WB_TEMPLATE_INSTALL=1` 일 때만 돈다**(npm 레지스트리에서 react · vite 를 받는다). 기본 실행에서는 그
 * 케이스를 건너뛴다.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { unzipSync } from 'fflate'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '@wirebound/schema'
import { readWbtheme } from '@wirebound/themes'

const repoRoot = process.cwd()
const KIT = resolve(repoRoot, 'packages/theme-kit')
// 풀어 둔 템플릿을 설치 없이 저장소의 워크스페이스 판으로 빌드한다 — SDK · react 가 `node_modules` 로 풀리는 자리(`test/build.test.ts` 의 `TMP`).
const TMP = join(KIT, '.tmp')
const ROOT = 'wirebound-theme-starter'
const INSTALL = process.env.WB_TEMPLATE_INSTALL === '1'

interface DistKit {
  packTemplate(opts: { outFile?: string }): Promise<{ file: string; bytes: number; tarballs: { name: string; bytes: number }[] }>
  loadProject(root: string): Promise<{ project: unknown; issues: { code: string }[] }>
  buildTheme(opts: { root: string }): Promise<{ file: string; bytes: number; themeJsBytes: number }>
}

let kit: DistKit
let zip: Record<string, Uint8Array>
let template: string
let packages: Record<'sdk' | 'kit', string>

function extract(files: Record<string, Uint8Array>, into: string): void {
  for (const [name, data] of Object.entries(files)) {
    if (name.endsWith('/')) continue
    const path = join(into, name)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, data)
  }
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => (statSync(join(dir, name)).isDirectory() ? walk(join(dir, name)) : [join(dir, name)]))
}

beforeAll(async () => {
  installCatalog()
  execFileSync('pnpm', ['--filter', '@wirebound/theme-kit...', 'build'], { cwd: repoRoot, stdio: 'pipe' })
  kit = (await import(/* @vite-ignore */ pathToFileURL(join(KIT, 'dist/index.js')).href)) as DistKit
  mkdirSync(TMP, { recursive: true })
  const work = mkdtempSync(join(TMP, 'template-'))
  const packed = await kit.packTemplate({ outFile: join(work, 'starter.zip') })
  console.log(`[template] zip ${packed.bytes} 바이트 · ${packed.tarballs.map((t) => `${t.name} ${t.bytes} 바이트`).join(' · ')}`)
  zip = unzipSync(new Uint8Array(readFileSync(packed.file)))
  extract(zip, work)
  template = join(work, ROOT)
  packages = { sdk: '', kit: '' }
  for (const [key, prefix] of [['sdk', 'wirebound-theme-sdk-'], ['kit', 'wirebound-theme-kit-']] as const) {
    const tgz = readdirSync(join(template, 'vendor')).find((n) => n.startsWith(prefix))!
    const into = join(work, key)
    mkdirSync(into)
    execFileSync('tar', ['-xzf', join(template, 'vendor', tgz), '-C', into])
    packages[key] = join(into, 'package')
  }
}, 300_000)

afterAll(() => rmSync(TMP, { recursive: true, force: true }))

describe('스타터 템플릿 zip', () => {
  it('뼈대가 있다', () => {
    const names = Object.keys(zip)
    for (const name of ['package.json', 'theme.config.ts', 'tsconfig.json', 'src/index.tsx', 'src/theme.css', 'SKILL.md', 'README.md', '.gitignore', 'vendor/wirebound-theme-sdk-1.0.0.tgz']) {
      expect(names, name).toContain(`${ROOT}/${name}`)
    }
    expect(names.some((n) => /^wirebound-theme-starter\/vendor\/wirebound-theme-kit-.+\.tgz$/.test(n))).toBe(true)
    expect(names.filter((n) => n.startsWith(`${ROOT}/src/views/`)).sort()).toEqual(
      ['action', 'data', 'document', 'input', 'structure'].map((g) => `${ROOT}/src/views/${g}.tsx`),
    )
  })

  it('package.json 이 두 tarball 을 file: 로 가리킨다', () => {
    const pkg = JSON.parse(readFileSync(join(template, 'package.json'), 'utf8'))
    expect(pkg.dependencies['@wirebound/theme-sdk']).toBe('file:vendor/wirebound-theme-sdk-1.0.0.tgz')
    expect(pkg.devDependencies['@wirebound/theme-kit']).toMatch(/^file:vendor\/wirebound-theme-kit-.+\.tgz$/)
    expect(pkg.scripts).toMatchObject({ dev: 'wb-theme dev', build: 'wb-theme build' })
  })

  it('tarball 의존에 비공개 패키지가 없다', () => {
    for (const key of ['sdk', 'kit'] as const) {
      const raw = readFileSync(join(packages[key], 'package.json'), 'utf8')
      expect(raw, key).not.toContain('workspace:')
      const pkg = JSON.parse(raw)
      const names = [...Object.keys(pkg.dependencies ?? {}), ...Object.keys(pkg.peerDependencies ?? {})].filter((n) => n.startsWith('@wirebound/'))
      expect(names, key).toEqual(key === 'kit' ? ['@wirebound/theme-sdk'] : [])
      expect(Object.keys(pkg.peerDependencies ?? {}).includes('@wirebound/theme-sdk') || key === 'sdk').toBe(true)
    }
  })

  it('tarball 의 exports 가 tarball 에 든 파일만 가리킨다 — development 조건(src)이 없다', () => {
    for (const key of ['sdk', 'kit'] as const) {
      const pkg = JSON.parse(readFileSync(join(packages[key], 'package.json'), 'utf8'))
      expect(JSON.stringify(pkg.exports), key).not.toContain('development')
      const targets: string[] = []
      const leaves = (value: unknown): void => {
        if (typeof value === 'string') targets.push(value)
        else if (value !== null && typeof value === 'object') Object.values(value).forEach(leaves)
      }
      leaves(pkg.exports)
      expect(targets.length, key).toBeGreaterThan(0)
      for (const target of targets) {
        expect(statSync(join(packages[key], target)).isFile(), `${key} ${target}`).toBe(true)
      }
    }
  })

  it('kit tarball 의 dist 가 비공개 패키지를 import 하지 않는다', () => {
    const js = walk(join(packages.kit, 'dist')).filter((p) => p.endsWith('.js'))
    expect(js.some((p) => p.endsWith('client/frame.js'))).toBe(true)
    const PRIVATE = /(?:from\s*|require\(\s*|import\(\s*)['"]@wirebound\/(schema|themes|renderer|theme-gallery)(\/[^'"]*)?['"]/
    for (const path of js) expect(readFileSync(path, 'utf8'), path).not.toMatch(PRIVATE)
  })

  it('템플릿의 manifest 가 검증을 지난다', async () => {
    const { project, issues } = await kit.loadProject(template)
    expect(issues).toEqual([])
    expect(project).not.toBeNull()
  })

  it('템플릿이 타입검사를 지난다 — 옮긴 기본 뷰가 SDK 가 내보내는 이름만 쓴다', () => {
    execFileSync('pnpm', ['exec', 'tsc', '-p', join(template, 'tsconfig.json')], { cwd: repoRoot, stdio: 'pipe' })
  })

  it('템플릿을 빌드한다 — 업로드 검증을 지난다', async () => {
    const r = await kit.buildTheme({ root: template })
    console.log(`[template] 빌드 ${r.bytes} 바이트 · theme.js ${r.themeJsBytes} 바이트`)
    expect(readWbtheme(new Uint8Array(readFileSync(r.file))).issues).toEqual([])
  })

  it.skipIf(!INSTALL)('저장소 밖에서 설치하고 빌드한다(WB_TEMPLATE_INSTALL=1)', () => {
    const outside = mkdtempSync(join(tmpdir(), 'wb-template-install-'))
    try {
      extract(zip, outside)
      const root = join(outside, ROOT)
      execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: root, stdio: 'pipe' })
      execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'pipe' })
      const built = readdirSync(join(root, 'dist')).filter((n) => n.endsWith('.wbtheme'))
      expect(built).toEqual(['my-theme-0.1.0.wbtheme'])
      expect(readWbtheme(new Uint8Array(readFileSync(join(root, 'dist', built[0]!)))).issues).toEqual([])
      execFileSync('npm', ['run', 'typecheck'], { cwd: root, stdio: 'pipe' })
    } finally {
      rmSync(outside, { recursive: true, force: true })
    }
  }, 300_000)
})
