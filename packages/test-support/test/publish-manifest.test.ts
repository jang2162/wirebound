/**
 * **npm 에 내는 패키지의 manifest.** `packages/*` 가운데 `private` 이 아닌 것이 낼 집합이다 — 집합을 여기 이름으로 적어 두고,
 * 낼 패키지가 런타임에 기대는 `@wirebound/*` 가 모두 낼 집합 안에 있는지(닫힘) · 공개 메타데이터가 다 있는지 센다.
 *
 * 못 재는 것: tarball 의 실제 내용(`pnpm pack` 뒤 `workspace:` 가 풀렸는지 · `files` 밖이 안 들었는지)과 깐 뒤 명령이 서는지 —
 * `docs/superpowers/plans/2026-11-26-np-report.md` 의 설치 검증이 그 자리다.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = fileURLToPath(new URL('../../../', import.meta.url))

/** 낼 집합 — CLI · MCP 와 그 런타임 의존 + 테마 작성 도구. 바꾸면 보고(`2026-11-26-np-report.md` 「낼 집합」)도 고친다. */
const PUBLISHED = [
  '@wirebound/cli',
  '@wirebound/mcp',
  '@wirebound/renderer',
  '@wirebound/schema',
  '@wirebound/theme-gallery',
  '@wirebound/theme-kit',
  '@wirebound/theme-sdk',
  '@wirebound/themes',
]

interface Manifest {
  name: string
  private?: boolean
  license?: string
  description?: string
  keywords?: string[]
  homepage?: string
  bugs?: { url?: string }
  repository?: { type?: string; url?: string; directory?: string }
  engines?: { node?: string }
  exports?: unknown
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  publishConfig?: { access?: string; exports?: unknown }
}

const packages = readdirSync(join(ROOT, 'packages'))
  .filter((dir) => existsSync(join(ROOT, 'packages', dir, 'package.json')))
  .map((dir) => ({
    dir: `packages/${dir}`,
    manifest: JSON.parse(readFileSync(join(ROOT, 'packages', dir, 'package.json'), 'utf8')) as Manifest,
  }))
const published = packages.filter((p) => p.manifest.private !== true)
const rootManifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as Manifest
const license = readFileSync(join(ROOT, 'LICENSE'), 'utf8')

describe('낼 집합', () => {
  it('packages/* 의 비공개 아닌 패키지가 정한 집합과 같다', () => {
    expect(packages.length).toBeGreaterThan(PUBLISHED.length)
    expect(published.map((p) => p.manifest.name).sort()).toEqual(PUBLISHED)
  })

  it('낼 패키지의 dependencies · peerDependencies 가 기대는 @wirebound/* 는 모두 낼 집합이다 — 닫혀 있다', () => {
    for (const { manifest } of published) {
      const wanted = Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies }).filter((n) => n.startsWith('@wirebound/'))
      for (const name of wanted) expect(PUBLISHED, `${manifest.name} → ${name}`).toContain(name)
    }
  })
})

describe('낼 패키지마다', () => {
  it.each(published.map((p) => [p.manifest.name, p] as const))('%s — 라이선스 · 저장소 · 공개 설정', (_, { dir, manifest }) => {
    expect(manifest.license).toBe('MIT')
    expect(readFileSync(join(ROOT, dir, 'LICENSE'), 'utf8')).toBe(license)
    expect(manifest.repository).toEqual({ type: 'git', url: 'git+https://github.com/jang2162/wirebound.git', directory: dir })
    expect(manifest.homepage).toMatch(/^https:\/\/github\.com\/jang2162\/wirebound/)
    expect(manifest.bugs?.url).toBe('https://github.com/jang2162/wirebound/issues')
    expect(manifest.description?.length).toBeGreaterThan(0)
    expect(manifest.keywords?.length).toBeGreaterThan(0)
    expect(manifest.engines?.node).toBe(rootManifest.engines?.node)
    expect(existsSync(join(ROOT, dir, 'README.md'))).toBe(true)
    expect(manifest.publishConfig?.access).toBe('public')
  })

  it.each(published.map((p) => [p.manifest.name, p] as const))(
    '%s — 내는 exports 가 저장소 안에서만 쓰는 조건(development → src) · 경로(test-support)를 안 싣는다',
    (_, { manifest }) => {
      // `exports` 에 development 가 있으면 내는 판은 그것을 덮은 publishConfig.exports 여야 한다 — tarball 에는 src 가 없다.
      const shipped = JSON.stringify(manifest.publishConfig?.exports ?? manifest.exports)
      expect(shipped).not.toContain('development')
      expect(shipped).not.toContain('./src/')
      expect(shipped).not.toContain('test-support')
    },
  )
})

describe('뿌리', () => {
  it('뿌리 package.json 도 MIT 를 적고 비공개다', () => {
    expect(rootManifest.license).toBe('MIT')
    expect(rootManifest.private).toBe(true)
  })
})
