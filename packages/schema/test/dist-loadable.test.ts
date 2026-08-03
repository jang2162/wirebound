import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const playground = fileURLToPath(new URL('../../../apps/playground', import.meta.url))

function runInNode(script: string): string {
  return execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: playground,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

describe('빌드 산출물', () => {
  beforeAll(() => {
    execFileSync('pnpm', ['--filter', './packages/*', '-r', 'build'], {
      cwd: repoRoot,
      stdio: 'pipe',
    })
  }, 300_000)

  it('순수 Node가 @wirebound/schema를 로드하고 검증까지 돌린다', () => {
    const out = runInNode(`
      const m = await import('@wirebound/schema')
      if (typeof m.createNodeId !== 'function') throw new Error('createNodeId 없음')
      if (!/^n_[0-9a-f]{12}$/.test(m.createNodeId())) throw new Error('createNodeId 형식 오류')
      m.installCatalog()
      const doc = { version: 1, root: { id: m.createNodeId(), type: 'Page', children: [] } }
      const issues = m.validatePage(doc)
      if (issues.length !== 0) throw new Error('검증 실패: ' + JSON.stringify(issues))
      console.log('OK')
    `)
    expect(out.trim()).toBe('OK')
  })

  it('순수 Node가 @wirebound/renderer를 로드하고 렌더한다', () => {
    const out = runInNode(`
      const s = await import('@wirebound/schema')
      const r = await import('@wirebound/renderer')
      s.installCatalog()
      r.installStructures()
      const el = r.renderDocument({ version: 1, root: { id: 'n_000000000001', type: 'Page', children: [] } })
      if (!el) throw new Error('렌더 결과가 비었다')
      console.log('OK')
    `)
    expect(out.trim()).toBe('OK')
  })
})
