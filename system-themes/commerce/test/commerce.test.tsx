import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, listComponents } from '@wirebound/schema'
import { COMMERCE_THEME } from '@wirebound/system-theme-commerce'

beforeAll(() => installCatalog())

describe('system-commerce', () => {
  it('id · sdk 범위', () => {
    expect(COMMERCE_THEME.manifest.id).toBe('system-commerce')
    expect(COMMERCE_THEME.manifest.sdk).toBe('^1.0.0')
  })

  it('components 선언은 카탈로그의 이름만 쓴다', () => {
    const catalog = new Set(listComponents().map((d) => d.type))
    for (const type of Object.keys(COMMERCE_THEME.manifest.components ?? {})) expect(catalog.has(type)).toBe(true)
  })
})
