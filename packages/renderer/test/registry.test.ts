import { beforeEach, describe, expect, it } from 'vitest'
import {
  getStructure,
  listStructureKeys,
  registerStructure,
  requireStructure,
  resetStructures,
} from '../src/structures/registry'

const dummy = () => null as never

describe('구조 레지스트리', () => {
  beforeEach(() => {
    resetStructures()
  })

  it('타입과 구조 조합으로 등록하고 찾는다', () => {
    registerStructure('List', 'table', dummy)
    expect(getStructure('List', 'table')).toBe(dummy)
  })

  it('다른 구조는 따로 관리된다', () => {
    registerStructure('List', 'table', dummy)
    expect(getStructure('List', 'cardGrid')).toBeUndefined()
  })

  it('같은 조합을 두 번 등록하면 던진다', () => {
    registerStructure('List', 'table', dummy)
    expect(() => registerStructure('List', 'table', dummy)).toThrow(
      '이미 등록된 구조: List:table',
    )
  })

  it('requireStructure는 없는 조합에 대해 던진다', () => {
    expect(() => requireStructure('List', 'table')).toThrow('구현되지 않은 구조: List:table')
  })

  it('등록된 키 목록을 준다', () => {
    registerStructure('List', 'table', dummy)
    registerStructure('Text', 'default', dummy)
    expect(listStructureKeys().sort()).toEqual(['List:table', 'Text:default'])
  })
})
