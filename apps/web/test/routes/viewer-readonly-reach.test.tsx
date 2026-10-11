/** editor 대조 — 훑기가 입구마다 쓰기에 닿는다. 도구는 `./viewer-readonly-harness` 가 갖는다(머리말 · 사각 · 대조의 뜻). */
import { describe, expect, it } from 'vitest'
import { REACH, sweepEditor } from './viewer-readonly-harness'

describe('viewer 는 에디터에서 쓰기를 내지 않는다', () => {
  it('editor 로 훑으면 입구마다 쓰기가 나온다 — 훑기가 닿는다는 대조', async () => {
    const wire = await sweepEditor('editor')
    expect(wire.unrouted).toEqual([])
    expect(REACH.filter((spot) => !spot.hit(wire)).map((spot) => spot.name)).toEqual([])
  }, 300_000)
})
