import { describe, expect, it } from 'vitest'
import manifest from '../package.json?raw'
import { SERVER_VERSION } from '../src/server'

describe('서버 판', () => {
  it('initialize 의 serverInfo.version 이 package.json 의 version 과 같다 — npm 에 낸 판을 호스트가 본다', () => {
    expect(SERVER_VERSION).toBe((JSON.parse(manifest) as { version: string }).version)
  })
})
