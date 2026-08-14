import { describe, expect, it } from 'vitest'
import { PACKAGE_NAME } from '../src/index'

describe('@wirebound/exporter 골격', () => {
  it('루트 vitest 설정이 이 디렉터리의 케이스를 집는다', () => {
    // 이 파일이 실행된다는 것 자체가 재라 #7의 답이다 —
    // `unit` 프로젝트의 include가 `packages/*/test/**`라 새 패키지가 저절로 들어온다.
    expect(PACKAGE_NAME).toBe('@wirebound/exporter')
  })
})
