import { describe, expect, it } from 'vitest'
import { compareVersions, satisfiesSdk } from '@wirebound/themes'

describe('satisfiesSdk', () => {
  it.each([
    ['^1.0.0', '1.0.0', true], ['^1.0.0', '1.9.3', true], ['^1.2.0', '1.1.9', false], ['^1.0.0', '2.0.0', false],
    ['~1.2.0', '1.2.7', true], ['~1.2.0', '1.3.0', false], ['1.2.3', '1.2.3', true], ['1.2.3', '1.2.4', false],
    ['^0.3.0', '0.9.0', true],   // D2 — 0.x 의 ^ 도 같은 major
  ])('%s ∋ %s = %s', (range, v, want) => expect(satisfiesSdk(range, v)).toBe(want))
  it('비교', () => { expect(compareVersions('1.10.0', '1.9.9')).toBeGreaterThan(0); expect(compareVersions('1.0.0', '1.0.0')).toBe(0) })
})
