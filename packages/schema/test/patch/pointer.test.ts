import { describe, expect, it } from 'vitest'
import { formatPointer, getByPointer, parsePointer } from '../../src/patch/pointer'

describe('parsePointer', () => {
  it('빈 문자열은 빈 배열이다', () => {
    expect(parsePointer('')).toEqual([])
  })

  it('슬래시로 토큰을 나눈다', () => {
    expect(parsePointer('/root/children/0')).toEqual(['root', 'children', '0'])
  })

  it('~1은 슬래시로, ~0은 물결로 되돌린다', () => {
    expect(parsePointer('/a~1b/c~0d')).toEqual(['a/b', 'c~d'])
  })

  it('슬래시로 시작하지 않으면 던진다', () => {
    expect(() => parsePointer('root')).toThrow('잘못된 JSON Pointer: root')
  })
})

describe('formatPointer', () => {
  it('빈 배열은 빈 문자열이다', () => {
    expect(formatPointer([])).toBe('')
  })

  it('토큰을 슬래시로 잇는다', () => {
    expect(formatPointer(['root', 'children', '0'])).toBe('/root/children/0')
  })

  it('슬래시와 물결을 이스케이프한다', () => {
    expect(formatPointer(['a/b', 'c~d'])).toBe('/a~1b/c~0d')
  })

  it('parsePointer와 왕복한다', () => {
    const pointer = '/root/children/0/props/a~1b'
    expect(formatPointer(parsePointer(pointer))).toBe(pointer)
  })
})

describe('getByPointer', () => {
  const doc = { root: { children: [{ id: 'a' }, { id: 'b' }] } }

  it('중첩 값을 읽는다', () => {
    expect(getByPointer(doc, '/root/children/1/id')).toBe('b')
  })

  it('빈 포인터는 문서 전체다', () => {
    expect(getByPointer(doc, '')).toBe(doc)
  })

  it('없는 경로는 undefined다', () => {
    expect(getByPointer(doc, '/root/children/9/id')).toBeUndefined()
  })
})
