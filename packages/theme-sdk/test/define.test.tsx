import { describe, expect, it } from 'vitest'
import { defineTheme, SDK_VERSION, view, type ThemeManifest } from '@wirebound/theme-sdk'

const manifest: ThemeManifest = {
  id: 'sample', name: '샘플', version: '0.1.0', sdk: '^1.0.0',
  tokens: { items: { 'semantic.primary': { type: 'color', label: '주색', default: '#2563eb' } } },
}

describe('defineTheme', () => {
  it('정의를 그대로 돌려준다 — 등록 부작용이 없다', () => {
    const List = view(() => <div />)
    const theme = defineTheme({ manifest, views: { List } })
    expect(theme.manifest).toBe(manifest)
    expect(theme.views.List).toBe(List)
  })

  it('view 는 이름 있는 함수 컴포넌트를 돌려준다', () => {
    const V = view(() => <span />)
    expect(typeof V).toBe('function')
  })

  it('SDK 판은 semver 다', () => {
    expect(SDK_VERSION).toMatch(/^\d+\.\d+\.\d+$/)
  })
})
