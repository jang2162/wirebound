import { describe, expect, it } from 'vitest'
import { tokensCss, tokenValues, tokenVar } from '@wirebound/themes'

const M = { id: 'a', name: 'a', version: '1.0.0', sdk: '^1.0.0', tokens: { items: {
  'color.primary': { type: 'color', label: 'p', default: '#2563eb' },
  'color.hover': { type: 'color', label: 'h', default: '{color.primary}' },
  gap: { type: 'number', label: 'g', default: 4 },
} } } as const

describe('tokensCss', () => {
  it('기본값을 :root 한 블록으로, 참조는 var()', () => {
    const { css, issues } = tokensCss(M as never)
    expect(issues).toEqual([])
    expect(css).toBe(':root {\n  --wb-color-primary: #2563eb;\n  --wb-color-hover: var(--wb-color-primary);\n  --wb-gap: 4;\n}\n')
  })
  it('값을 주면 덮는다 — 참조를 덮으면 var() 가 아니라 값이다', () => {
    expect(tokensCss(M as never, { 'color.hover': '#000' }).css).toContain('--wb-color-hover: #000;')
  })
  it('CSS 를 깨는 값은 버리고 이슈로', () => {
    const r = tokensCss(M as never, { 'color.primary': 'red;} body{display:none' })
    expect(r.css).toContain('--wb-color-primary: #2563eb;')
    expect(r.css).not.toContain('display')
    expect(r.issues.map((i) => i.code)).toContain('token-default-type')
  })
  it('선언에 없는 키는 버리고 이슈로', () => {
    const r = tokensCss(M as never, { nope: '1' })
    expect(r.issues.map((i) => i.path)).toContain('values.nope')
    expect(r.css).not.toContain('nope')
  })
  it('tokenValues 는 참조를 따라간 값', () => {
    expect(tokenValues(M as never)['color.hover']).toBe('#2563eb')
  })
  it('tokenValues 는 덮은 값을 쓰고, 참조는 덮은 대상을 따라간다', () => {
    const v = tokenValues(M as never, { 'color.primary': '#111', gap: 8 })
    expect(v).toEqual({ 'color.primary': '#111', 'color.hover': '#111', gap: 8 })
  })
  it('tokenVar', () => expect(tokenVar('radius.card-lg')).toBe('--wb-radius-card-lg'))
})
