import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, listComponents } from '@wirebound/schema'
import { DEFAULT_VIEWS } from '@wirebound/theme-sdk'
import { ADMIN_V0, ADMIN_V0_CSS } from '@wirebound/system-theme-admin'

beforeAll(() => installCatalog())

describe('system-admin 첫 판', () => {
  it('id · 판 · sdk 범위', () => {
    expect(ADMIN_V0.manifest.id).toBe('system-admin')
    expect(ADMIN_V0.manifest.version).toBe('0.1.0')
    expect(ADMIN_V0.manifest.sdk).toBe('^1.0.0')
  })

  it('뷰는 기본 뷰다', () => {
    expect(ADMIN_V0.views).toBe(DEFAULT_VIEWS)
  })

  it('토큰마다 CSS 의 :root 에 같은 이름 · 같은 기본값의 변수가 있다', () => {
    const keys = Object.entries(ADMIN_V0.manifest.tokens.items)
    expect(keys.length).toBeGreaterThan(0)
    for (const [key, decl] of keys) expect(ADMIN_V0_CSS).toContain(`--wb-${key.replaceAll('.', '-')}: ${decl.default};`)
  })

  it('components 선언은 카탈로그의 이름만 쓴다', () => {
    const catalog = new Set(listComponents().map((d) => d.type))
    for (const type of Object.keys(ADMIN_V0.manifest.components ?? {})) expect(catalog.has(type)).toBe(true)
  })

  /** variant 없는 노드는 `defaultVariant`(`default`)로 그려진다 — 그 값을 겨냥한 규칙이 있으면 옛 모습(규칙 없음)과 갈린다. */
  it('옛 테마 CSS 에 [data-wb-variant="default"] 규칙이 없다', () => {
    expect(ADMIN_V0_CSS).not.toContain('data-wb-variant="default"')
  })

  it('CSS 는 비어 있지 않고 :root 를 싣는다', () => {
    expect(ADMIN_V0_CSS.length).toBeGreaterThan(1000)
    expect(ADMIN_V0_CSS).toContain(':root {')
  })
})
