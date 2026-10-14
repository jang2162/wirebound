/**
 * 겹치는 영역 표지를 쌓는 줄 수(`src/canvas/region-tag-stack.ts` 의 `stackLevels`) — L-280. 실브라우저 판은 `build-test/n36-badge-stack.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { stackLevels, type TagAnchor, type TagSize } from '../../src/canvas/region-tag-stack'

const size = (width = 100, height = 18): TagSize => ({ width, height })
const sizes = (...ids: string[]): Map<string, TagSize> => new Map(ids.map((id) => [id, size()]))
const at = (id: string, left: number, top: number): TagAnchor => ({ id, left, top })

describe('stackLevels', () => {
  it('같은 자리의 둘은 0 · 1 줄이다 — 바깥(먼저 온 것)이 제 자리를 지킨다', () => {
    expect([...stackLevels([at('a', 10, 100), at('b', 10, 100)], sizes('a', 'b'))]).toEqual([
      ['a', 0],
      ['b', 1],
    ])
  })

  it('셋이면 0 · 1 · 2 줄이다', () => {
    expect([...stackLevels([at('a', 0, 50), at('b', 0, 50), at('c', 0, 50)], sizes('a', 'b', 'c')).values()]).toEqual([0, 1, 2])
  })

  it('겹치지 않으면 모두 0 줄이다 — 위아래로 떨어진 형제 · 좌우로 떨어진 형제 · 맞닿기만 한 줄', () => {
    const away = stackLevels([at('a', 0, 100), at('b', 0, 300)], sizes('a', 'b'))
    const side = stackLevels([at('a', 0, 100), at('b', 100, 100)], sizes('a', 'b'))
    const touching = stackLevels([at('a', 0, 100), at('b', 0, 118)], sizes('a', 'b'))
    expect([...away.values(), ...side.values(), ...touching.values()]).toEqual([0, 0, 0, 0, 0, 0])
  })

  it('조금 어긋난 자리도 표지 줄이 겹치면 내린다 — 위로 5px 어긋난 안쪽', () => {
    expect([...stackLevels([at('a', 0, 100), at('b', 0, 105)], sizes('a', 'b')).values()]).toEqual([0, 1])
  })

  it('이미 내려간 줄도 자리를 막는다 — 셋째의 0 줄은 가운데의 1 줄과 겹쳐 한 줄 더 내려간다', () => {
    const levels = stackLevels([at('a', 0, 100), at('b', 0, 100), at('c', 0, 118)], sizes('a', 'b', 'c'))
    // a [82,100] · b(1 줄) [100,118]. c 의 0 줄 [100,118] 은 a 와 맞닿기만 하고 b 와 겹친다 → 1 줄 [118,136].
    expect([...levels.values()]).toEqual([0, 1, 1])
  })

  it('크기를 못 잰 표지는 0 줄이고 남의 자리를 막지 않는다', () => {
    const levels = stackLevels(
      [at('a', 0, 100), at('b', 0, 100), at('c', 0, 100)],
      new Map([
        ['a', size()],
        ['c', size()],
      ]),
    )
    expect([...levels.entries()]).toEqual([
      ['a', 0],
      ['b', 0],
      ['c', 1],
    ])
  })
})
