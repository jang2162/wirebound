/** viewer 로 훑는 본 케이스. 도구는 `./viewer-readonly-harness` 가 갖는다(머리말 · 사각 · 대조의 뜻). */
import { describe, expect, it } from 'vitest'
import { sweepEditor } from './viewer-readonly-harness'

describe('viewer 는 에디터에서 쓰기를 내지 않는다', () => {
  it('viewer 로 훑으면 HTTP 쓰기 0 · WS 쓰기 프레임 0', async () => {
    const wire = await sweepEditor('viewer')
    expect(wire.unrouted).toEqual([])
    expect({ http: [...new Set(wire.http)].sort(), frames: [...new Set(wire.frames)].sort() }).toEqual({
      http: [],
      frames: [],
    })
    // 개인 모듈 쓰기는 낸다 — viewer 도 «모듈로 저장…» 의 개인 모듈로 저장한다(훑기가 그 입구에 닿았다는 대조이기도 하다).
    expect([...new Set(wire.personal)]).toEqual(['POST /api/me/modules'])
  }, 300_000)
})
