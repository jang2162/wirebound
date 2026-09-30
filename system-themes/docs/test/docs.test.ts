import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, listComponents } from '@wirebound/schema'
import { DOCS_THEME } from '@wirebound/system-theme-docs'

beforeAll(() => installCatalog())

describe('system-docs', () => {
  it('id · sdk 범위', () => {
    expect(DOCS_THEME.manifest.id).toBe('system-docs')
    expect(DOCS_THEME.manifest.sdk).toBe('^1.0.0')
  })

  it('components 선언은 카탈로그의 이름만 쓴다', () => {
    const catalog = new Set(listComponents().map((d) => d.type))
    for (const type of Object.keys(DOCS_THEME.manifest.components ?? {})) expect(catalog.has(type)).toBe(true)
  })
})
