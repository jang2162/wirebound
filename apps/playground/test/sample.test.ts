import { installCatalog, validateLayout, validatePage } from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { sampleLayout, samplePage } from '../src/sample'

beforeAll(() => {
  installCatalog()
})

describe('샘플 문서', () => {
  it('레이아웃이 검증을 통과한다', () => {
    expect(validateLayout(sampleLayout)).toEqual([])
  })

  it('페이지가 검증을 통과한다', () => {
    expect(validatePage(samplePage)).toEqual([])
  })
})
