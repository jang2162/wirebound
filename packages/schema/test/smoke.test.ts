import { describe, expect, it } from 'vitest'
import { PACKAGE_NAME } from '../src/index'

describe('워크스페이스 설정', () => {
  it('schema 패키지를 import할 수 있다', () => {
    expect(PACKAGE_NAME).toBe('@wirebound/schema')
  })
})
