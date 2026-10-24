/**
 * **폼 표의 칸 흐름**(`src/pair-rows.ts`) — 빈 쌍을 끼운 차례가 CSS 격자의 자동 배치와 같은 줄을 짓는가. 격자가 실제로 그 줄에 놓는지(상자 좌표)는
 * 실브라우저 판 `apps/web/build-test/form-table.test.ts` 가 잰다.
 */
import { describe, expect, it } from 'vitest'
import { pairRows, type ViewItem } from '@wirebound/theme-sdk'

const item = (id: string, span?: number): ViewItem => ({
  nodeId: id,
  index: 0,
  element: null,
  content: null,
  ...(span === undefined ? {} : { span }),
})

/** 칸 차례를 글로 — 자식은 id, 빈 쌍은 `_`. 줄은 `|` 로 가른다(열 수마다 끊는다 — 빈 쌍을 끼운 뒤 줄은 늘 꽉 찬다). */
function layout(items: ViewItem[], columns: unknown, width = typeof columns === 'number' ? columns : 1): string {
  const rows: string[][] = [[]]
  let at = 0
  for (const cell of pairRows(items, columns)) {
    const span = cell.kind === 'item' ? Math.min(cell.item.span ?? 1, width) : 1
    rows.at(-1)!.push(cell.kind === 'item' ? cell.item.nodeId : '_')
    at += span
    if (at >= width) {
      rows.push([])
      at = 0
    }
  }
  return rows
    .filter((row) => row.length > 0)
    .map((row) => row.join(' '))
    .join(' | ')
}

describe('pairRows — 빈 쌍을 끼운 칸 차례', () => {
  it.each([
    // [열 수, 자식(id:몫), 기대]
    [1, ['a', 'b', 'c'], 'a | b | c'],
    [2, ['a', 'b', 'c', 'd'], 'a b | c d'],
    [2, ['a', 'b', 'c'], 'a b | c _'],
    [3, ['a', 'b', 'c', 'd'], 'a b c | d _ _'],
    [4, ['a'], 'a _ _ _'],
    // 전폭(몫 = 열 수) · 몫 12 는 열 수로 잘린 값이 온다 — 렌더러가 자른다. 여기 넘쳐 와도 열 수로 자른다.
    [2, ['a', 'b:2', 'c'], 'a _ | b | c _'],
    [2, ['a:2', 'b', 'c'], 'a | b c'],
    [3, ['a', 'b:12', 'c'], 'a _ _ | b | c _ _'],
    // 넓은 칸이 다음 줄로 넘어가며 남긴 구멍
    [3, ['a', 'b', 'c:2', 'd'], 'a b _ | c d'],
    [4, ['a', 'b', 'c', 'd:2', 'e:2'], 'a b c _ | d e'],
    [4, ['a:3', 'b:2'], 'a _ | b _ _'],
  ] as const)('%s열 · %j → %s', (columns, specs, expected) => {
    const items = specs.map((spec) => {
      const [id, span] = spec.split(':')
      return item(id!, span === undefined ? undefined : Number(span))
    })
    expect(layout(items, columns)).toBe(expected)
  })

  it('자식이 없으면 칸도 빈 쌍도 없다', () => {
    expect(pairRows([], 2)).toEqual([])
  })

  it('열 수를 못 읽으면 1 열이다(빈 쌍이 안 선다)', () => {
    expect(pairRows([item('a'), item('b', 3)], 'two').map((cell) => cell.kind)).toEqual(['item', 'item'])
    expect(pairRows([item('a')], 0).map((cell) => cell.kind)).toEqual(['item'])
  })

  it('빈 쌍의 열쇠는 그 줄 · 칸 자리라 겹치지 않는다', () => {
    const keys = pairRows([item('a'), item('b', 3), item('c')], 3).flatMap((cell) => (cell.kind === 'filler' ? [cell.key] : []))
    expect(keys).toEqual(['filler-0-1', 'filler-0-2', 'filler-2-1', 'filler-2-2'])
    expect(new Set(keys).size).toBe(keys.length)
  })
})
