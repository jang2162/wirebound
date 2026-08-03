import { describe, expect, it } from 'vitest'
import {
  CURRENT_DOCUMENT_VERSION,
  MIGRATIONS,
  migrateDocument,
  type Migration,
} from '../src/migrate'
import type { PageDocument } from '../src/node'

function doc(version: number): PageDocument {
  return { version, root: { id: 'n_000000000001', type: 'Page' } }
}

const toV2: Migration = {
  from: 1,
  to: 2,
  migrate: (input) => ({
    ...input,
    root: { ...input.root, props: { ...(input.root.props ?? {}), migrated: true } },
  }),
}

describe('migrateDocument', () => {
  it('현재 버전이면 그대로 돌려준다', () => {
    expect(migrateDocument(doc(1))).toEqual(doc(1))
  })

  it('한 단계를 올린다', () => {
    const result = migrateDocument(doc(1), [toV2], 2)
    expect(result.version).toBe(2)
    expect(result.root.props).toEqual({ migrated: true })
  })

  it('여러 단계를 연달아 올린다', () => {
    const toV3: Migration = {
      from: 2,
      to: 3,
      migrate: (input) => ({ ...input, root: { ...input.root, marker: 1 } }),
    }
    const result = migrateDocument(doc(1), [toV2, toV3], 3)
    expect(result.version).toBe(3)
    expect(result.root.marker).toBe(1)
  })

  it('올릴 마이그레이션이 없으면 던진다', () => {
    expect(() => migrateDocument(doc(1), [], 2)).toThrow('버전 1에서 올릴 마이그레이션이 없습니다')
  })

  it('목표보다 높은 버전이면 던진다', () => {
    expect(() => migrateDocument(doc(5), [], 1)).toThrow('지원하지 않는 문서 버전: 5')
  })

  it('입력 문서를 변경하지 않는다', () => {
    const input = doc(1)
    migrateDocument(input, [toV2], 2)
    expect(input.version).toBe(1)
    expect(input.root.props).toBeUndefined()
  })
})

describe('상수', () => {
  it('현재 문서 버전은 1이다', () => {
    expect(CURRENT_DOCUMENT_VERSION).toBe(1)
  })

  it('아직 등록된 마이그레이션이 없다', () => {
    expect(MIGRATIONS).toEqual([])
  })
})
