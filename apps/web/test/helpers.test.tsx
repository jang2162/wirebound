import { describe, expect, it } from 'vitest'
import type { SessionUser } from '../src/api/types'
import { fakeApi } from './helpers'

const USER: SessionUser = { id: 'u-1', email: 'me@example.com', name: '테스터' }

// `fakeApi`의 안전장치는 뒤 태스크의 화면들이 기대는 성질인데, 지금 화면들은 스텁한
// 메서드만 부르므로 어떤 화면 테스트도 이것을 건드리지 않는다. 안전장치가 조용히
// 사라지는 일이 없도록 여기서 직접 본다.
describe('fakeApi', () => {
  it('스텁하지 않은 메서드를 부르면 어느 메서드인지 말하며 던진다', () => {
    expect(() => fakeApi().getTree('p-1')).toThrow('fakeApi: getTree가 스텁되지 않았습니다')
  })

  it('스텁한 메서드는 그대로 쓴다', async () => {
    const client = fakeApi({ me: async () => USER })

    await expect(client.me()).resolves.toBe(USER)
  })
})
