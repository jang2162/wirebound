/**
 * `src/canonical-json.ts` — 키 순서를 빼고 비교하기 위한 정규화.
 *
 * 이 파일이 지키는 명제는 둘이다: **객체 키 순서는 지운다**(경계마다 순서가 달라지므로),
 * **배열 순서는 지우지 않는다**(배열은 순서 자체가 값이다).
 */
import { describe, expect, it } from 'vitest'
import { canonicalJson } from '../src/canonical-json'

describe('키 순서는 지운다', () => {
  it('평평한 객체', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }))
  })

  it('중첩된 객체', () => {
    expect(canonicalJson({ x: { version: 1, root: { id: 'n' } } })).toBe(
      canonicalJson({ x: { root: { id: 'n' }, version: 1 } }),
    )
  })

  it('배열 안의 객체', () => {
    expect(canonicalJson([{ b: 1, a: 2 }])).toBe(canonicalJson([{ a: 2, b: 1 }]))
  })
})

describe('배열 순서는 지우지 않는다 — 순서 자체가 값이다', () => {
  it('문서의 children이 뒤집히면 다른 문서다', () => {
    const one = { root: { children: [{ id: 'a' }, { id: 'b' }] } }
    const two = { root: { children: [{ id: 'b' }, { id: 'a' }] } }
    expect(canonicalJson(one)).not.toBe(canonicalJson(two))
  })
})

describe('값이 다르면 다르다 — 음성 대조', () => {
  it('키는 같고 값만 다른 경우', () => {
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }))
  })

  it('키 하나가 더 있는 경우', () => {
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 1, b: 2 }))
  })

  it('null과 빈 객체를 가른다', () => {
    expect(canonicalJson(null)).not.toBe(canonicalJson({}))
  })
})
