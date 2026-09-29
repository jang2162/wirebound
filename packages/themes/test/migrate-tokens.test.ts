import { describe, expect, it } from 'vitest'
import { migrateTokens } from '@wirebound/themes'

const manifest = (items: Record<string, object>) => ({ id: 'a', name: 'a', version: '1.0.0', sdk: '^1.0.0', tokens: { items } }) as never

const FROM = manifest({
  'color.primary': { type: 'color', label: 'p', default: '#000000' },
  'space.gap': { type: 'length', label: 'g', default: '4px' },
  density: { type: 'select', label: 'd', options: ['compact', 'cozy', 'loose'], default: 'cozy' },
  gone: { type: 'color', label: 'x', default: '#ffffff' },
})

describe('migrateTokens — 테마를 바꿀 때 토큰을 잇는다', () => {
  it('같은 키 · 같은 타입이면 잇는다', () => {
    const to = manifest({ 'color.primary': { type: 'color', label: 'p', default: '#111111' } })
    expect(migrateTokens(FROM, to, { 'color.primary': '#ff0000' })).toEqual({
      tokens: { 'color.primary': '#ff0000' },
      kept: 1,
      dropped: 0,
      defaulted: 0,
    })
  })

  it('같은 키라도 타입이 다르면 버린다 — 값이 새 타입의 문법에 맞아도', () => {
    // `4px` 는 글꼴 낱말 문법에도 맞는다 — 새 검사만 보면 이어진다. 타입 대조가 거른다.
    const to = manifest({ 'space.gap': { type: 'font', label: 'g', default: 'Inter' } })
    expect(migrateTokens(FROM, to, { 'space.gap': '4px' })).toMatchObject({ tokens: {}, kept: 0, dropped: 1, defaulted: 1 })
  })

  it('새 manifest 에 없는 키는 버린다', () => {
    const to = manifest({ 'color.primary': { type: 'color', label: 'p', default: '#111111' } })
    expect(migrateTokens(FROM, to, { gone: '#123456' })).toMatchObject({ tokens: {}, kept: 0, dropped: 1, defaulted: 1 })
  })

  it('이은 값이 새 manifest 검사에 걸리면 버린다 — select 의 없는 선택지', () => {
    const to = manifest({ density: { type: 'select', label: 'd', options: ['compact', 'cozy'], default: 'cozy' } })
    expect(migrateTokens(FROM, to, { density: 'loose' })).toMatchObject({ tokens: {}, kept: 0, dropped: 1, defaulted: 1 })
    expect(migrateTokens(FROM, to, { density: 'compact' })).toMatchObject({ tokens: { density: 'compact' }, kept: 1 })
  })

  it('defaulted 는 새 manifest 의 키 가운데 이어진 값이 없는 수다', () => {
    const to = manifest({
      'color.primary': { type: 'color', label: 'p', default: '#111111' },
      'space.gap': { type: 'length', label: 'g', default: '8px' },
      fresh: { type: 'number', label: 'f', default: 1 },
    })
    const result = migrateTokens(FROM, to, { 'color.primary': '#ff0000', gone: '#000000', density: 'loose' })
    expect(result).toEqual({ tokens: { 'color.primary': '#ff0000' }, kept: 1, dropped: 2, defaulted: 2 })
  })

  it('지금 선언을 모르면(from 이 null) 타입을 못 견주므로 키와 새 검사만 본다', () => {
    const to = manifest({ 'color.primary': { type: 'color', label: 'p', default: '#111111' } })
    expect(migrateTokens(null, to, { 'color.primary': '#ff0000', other: '1' })).toEqual({
      tokens: { 'color.primary': '#ff0000' },
      kept: 1,
      dropped: 1,
      defaulted: 0,
    })
  })

  it('프로토타입 이름을 선언으로 읽지 않는다', () => {
    const to = manifest({ 'color.primary': { type: 'color', label: 'p', default: '#111111' } })
    expect(migrateTokens(FROM, to, { toString: '#ff0000' })).toMatchObject({ tokens: {}, kept: 0, dropped: 1 })
  })
})
