import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog, listComponents } from '@wirebound/schema'
import { SAAS_MARKETING_THEME } from '@wirebound/system-theme-saas-marketing'

beforeAll(() => installCatalog())

describe('system-saas-marketing', () => {
  it('id · sdk 범위', () => {
    expect(SAAS_MARKETING_THEME.manifest.id).toBe('system-saas-marketing')
    expect(SAAS_MARKETING_THEME.manifest.sdk).toBe('^1.0.0')
  })

  it('components 선언은 카탈로그의 이름만 쓴다', () => {
    const catalog = new Set(listComponents().map((d) => d.type))
    for (const type of Object.keys(SAAS_MARKETING_THEME.manifest.components ?? {})) expect(catalog.has(type)).toBe(true)
  })
})
