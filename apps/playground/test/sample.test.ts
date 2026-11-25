import { installCatalog, validatePage } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { samplePage } from '../src/sample'

beforeAll(() => {
  installCatalog()
})

describe('샘플 문서', () => {
  it('페이지가 검증을 통과한다', () => {
    expect(validatePage(samplePage)).toEqual([])
  })
})
