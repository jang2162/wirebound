import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, listComponents } from '@wirebound/schema'
import { PORTAL_THEME } from '@wirebound/system-theme-portal'

beforeAll(() => installCatalog())

describe('system-portal', () => {
  it('id · sdk 범위', () => {
    expect(PORTAL_THEME.manifest.id).toBe('system-portal')
    expect(PORTAL_THEME.manifest.sdk).toBe('^1.0.0')
  })

  it('components 선언은 카탈로그의 이름만 쓴다', () => {
    const catalog = new Set(listComponents().map((d) => d.type))
    for (const type of Object.keys(PORTAL_THEME.manifest.components ?? {})) expect(catalog.has(type)).toBe(true)
  })
})
