import { afterAll } from 'vitest'
import { closeTestDb } from './helpers'

/** 각 테스트 파일 컨텍스트에서 돌며, 파일이 끝나면 공유 DB 풀을 정리한다. */
afterAll(async () => {
  await closeTestDb()
})
