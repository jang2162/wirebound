// @vitest-environment node
/**
 * 선택 목록의 규칙(`store/selection-set.ts` 의 `normalizeSelection`). 스토어 명령(`toggleSelect` · `selectRange` · `selectMany`)과 문서가
 * 바뀐 뒤의 정리는 `editor-store-selection.test.ts` 가 잰다 — 이 파일은 순수 함수만.
 *
 * ```
 * root
 *   a      a1  a2
 *   b      b1  (b1x)
 *   c
 * ```
 */
import type { WbNode } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { normalizeSelection } from '../../src/store/selection-set'

const ROOT: WbNode = {
  id: 'root',
  type: 'Page',
  children: [
    {
      id: 'a',
      type: 'Section',
      children: [
        { id: 'a1', type: 'Text', props: {} },
        { id: 'a2', type: 'Text', props: {} },
      ],
    },
    { id: 'b', type: 'Section', children: [{ id: 'b1', type: 'Section', children: [{ id: 'b1x', type: 'Text', props: {} }] }] },
    { id: 'c', type: 'Text', props: {} },
  ],
}

describe('normalizeSelection', () => {
  it('문서에 없는 id 와 겹친 id 는 빠진다', () => {
    expect(normalizeSelection(ROOT, ['c', 'gone', 'a1', 'c'], 'c')).toEqual({ ids: ['a1', 'c'], anchor: 'c', capped: 0 })
  })

  it('문서 차례로 놓인다 — 넣은 차례가 아니다', () => {
    expect(normalizeSelection(ROOT, ['c', 'b1x', 'a2'], 'c').ids).toEqual(['a2', 'b1x', 'c'])
  })

  it('조상 뒤 자손을 누르면 자손이 조상을 대신한다', () => {
    expect(normalizeSelection(ROOT, ['b', 'c', 'b1x'], 'b1x')).toEqual({ ids: ['b1x', 'c'], anchor: 'b1x', capped: 0 })
  })

  it('자손 뒤 조상을 누르면 조상이 대신하고 그 조상의 다른 자손도 빠진다', () => {
    expect(normalizeSelection(ROOT, ['a1', 'a2', 'c', 'a'], 'a')).toEqual({ ids: ['a', 'c'], anchor: 'a', capped: 0 })
  })

  it('루트를 누르면 루트 하나다 — 모두의 조상이다', () => {
    expect(normalizeSelection(ROOT, ['a', 'c', 'root'], 'root')).toEqual({ ids: ['root'], anchor: 'root', capped: 0 })
  })

  it('루트가 아닌 노드를 누르면 루트가 빠진다', () => {
    expect(normalizeSelection(ROOT, ['root', 'c'], 'c')).toEqual({ ids: ['c'], anchor: 'c', capped: 0 })
  })

  it('`outer` 는 가장 바깥 것들을 남긴다 — 기준 노드가 자손이어도', () => {
    expect(normalizeSelection(ROOT, ['b', 'b1', 'b1x', 'c'], 'b1x', 'outer')).toEqual({ ids: ['b', 'c'], anchor: 'c', capped: 0 })
  })

  it('기준 노드와 무관한 조상 · 자손 쌍은 바깥 것이 남는다', () => {
    expect(normalizeSelection(ROOT, ['a', 'a1', 'c'], 'c').ids).toEqual(['a', 'c'])
  })

  it('기준 노드가 빠지면 목록의 마지막이 기준이다 · 빈 목록이면 `null`', () => {
    expect(normalizeSelection(ROOT, ['a', 'c', 'gone'], 'gone').anchor).toBe('c')
    expect(normalizeSelection(ROOT, ['gone'], 'gone')).toEqual({ ids: [], anchor: null, capped: 0 })
  })

  it('상한을 넘으면 뒤에서 빼고 뺀 수를 낸다 — 기준 노드는 남는다', () => {
    const wide: WbNode = {
      id: 'root',
      type: 'Page',
      children: Array.from({ length: 6 }, (_, index) => ({ id: `n${index}`, type: 'Text', props: {} })),
    }
    expect(normalizeSelection(wide, ['n0', 'n1', 'n2', 'n3', 'n4', 'n5'], 'n5', 'anchor', 4)).toEqual({
      ids: ['n0', 'n1', 'n2', 'n5'],
      anchor: 'n5',
      capped: 2,
    })
  })

  it('상한 기본값은 묶음 하나의 연산 상한이다', () => {
    const wide: WbNode = {
      id: 'root',
      type: 'Page',
      children: Array.from({ length: 205 }, (_, index) => ({ id: `n${index}`, type: 'Text', props: {} })),
    }
    const all = Array.from({ length: 205 }, (_, index) => `n${index}`)
    const result = normalizeSelection(wide, all, 'n0', 'outer')
    expect({ count: result.ids.length, capped: result.capped }).toEqual({ count: 200, capped: 5 })
  })

  it('노드가 아닌 문서도 던지지 않는다', () => {
    expect(normalizeSelection(null, ['a'], 'a')).toEqual({ ids: [], anchor: null, capped: 0 })
  })
})
