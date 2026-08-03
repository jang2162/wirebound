import { describe, expect, it } from 'vitest'
import { formatPointer, getByPointer, parsePointer } from '../../src/patch/pointer'
import { PatchError } from '../../src/patch/types'

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

  it.each(['/root/__proto__', '/root/constructor/prototype/pwned', '/prototype', '/a/b/__proto__/c'])(
    '프로토타입 오염 토큰이 든 경로 %s 를 거부한다',
    (pointer) => {
      expect(() => parsePointer(pointer)).toThrow(PatchError)
      expect(() => parsePointer(pointer)).toThrow('쓸 수 없는 JSON Pointer 토큰입니다')
    },
  )

  it('막힌 토큰을 알려주는 PatchError는 경로를 함께 담는다', () => {
    try {
      parsePointer('/root/__proto__')
      expect.unreachable('던져야 한다')
    } catch (error) {
      expect(error).toBeInstanceOf(PatchError)
      expect((error as PatchError).path).toBe('/root/__proto__')
    }
  })

  it('토큰의 일부로 들어간 이름은 막지 않는다', () => {
    expect(parsePointer('/root/__proto__x')).toEqual(['root', '__proto__x'])
    expect(parsePointer('/root/props/constructorName')).toEqual(['root', 'props', 'constructorName'])
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

  it('상속된 멤버는 읽지 않는다', () => {
    expect(getByPointer({ a: 1 }, '/toString')).toBeUndefined()
    expect(getByPointer({ a: 1 }, '/hasOwnProperty')).toBeUndefined()
  })

  it('프로토타입 오염 토큰이 든 경로는 던진다', () => {
    expect(() => getByPointer(doc, '/root/__proto__')).toThrow(PatchError)
  })
})
