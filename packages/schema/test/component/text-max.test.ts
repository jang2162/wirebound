/**
 * `propTextMax` — 카탈로그 prop 의 글 상한을 정의의 zod 에서 읽는다(속성 패널의 글 칸 · 목록 칸이 그 한도에서 막는다 —
 * `apps/web/test/panels/file-list-control.test.tsx`). 견주는 값도 정의에서 읽는다 — 글자로 적으면 한도를 바꿔도 산다.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { CATALOG_DEFS, FileAttachDef, FileEntrySchema, installCatalog } from '../../src/component/catalog/index'
import { resetRegistry } from '../../src/component/registry'
import { propTextMax } from '../../src/component/text-max'

const maxOf = (schema: unknown): number => (schema as { maxLength: number }).maxLength

describe('propTextMax', () => {
  beforeEach(() => {
    resetRegistry()
    installCatalog()
  })

  it('파일첨부의 글 셋 — 파일 이름 · 크기 · «최대 크기»', () => {
    const maxSize = (FileAttachDef.props as unknown as { shape: { maxSize: { unwrap(): unknown } } }).shape.maxSize.unwrap()
    expect([
      propTextMax(FileAttachDef, ['files', '[]', 'name']),
      propTextMax(FileAttachDef, ['files', '[]', 'size']),
      propTextMax(FileAttachDef, ['maxSize']),
    ]).toEqual([maxOf(FileEntrySchema.shape.name), maxOf(FileEntrySchema.shape.size), maxOf(maxSize)])
    expect([maxOf(FileEntrySchema.shape.name), maxOf(maxSize)].every((max) => Number.isInteger(max) && max > 0)).toBe(true)
  })

  it('상한 없는 글 · 글이 아닌 자리 · 없는 자리 · 정의 없음은 undefined', () => {
    expect(propTextMax(FileAttachDef, ['hint'])).toBeUndefined()
    expect(propTextMax(FileAttachDef, ['maxFiles'])).toBeUndefined()
    expect(propTextMax(FileAttachDef, ['files'])).toBeUndefined()
    expect(propTextMax(FileAttachDef, ['files', '[]'])).toBeUndefined()
    expect(propTextMax(FileAttachDef, ['nope'])).toBeUndefined()
    expect(propTextMax(undefined, ['maxSize'])).toBeUndefined()
  })

  it('편집 칸이 있는 prop 가운데 글 상한을 가진 자리는 파일첨부 셋뿐이다 — 정의 전부를 훑는다', () => {
    const found: string[] = []
    for (const def of CATALOG_DEFS) {
      for (const field of def.editor) {
        for (const path of [[], ['[]'], ['[]', 'key'], ['[]', 'value'], ['[]', 'label'], ['[]', 'name'], ['[]', 'size']]) {
          if (propTextMax(def, [field.prop, ...path]) !== undefined) found.push([def.type, field.prop, ...path].join('.'))
        }
      }
    }
    expect(found).toEqual(['FileAttach.files.[].name', 'FileAttach.files.[].size', 'FileAttach.maxSize'])
  })
})
