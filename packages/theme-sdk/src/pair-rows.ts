/**
 * **폼 표(`FormTable`)의 칸 흐름** — 몸통 자식을 한 줄에 쌍 `columns` 개씩 흘리고, 줄 끝과 «넓은 칸이 다음 줄로 넘어가며 남긴 구멍» 에 빈 쌍을
 * 끼운 차례(설계 spec `docs/superpowers/specs/2026-10-25-form-table-design.md` 「빈 쌍 — 뷰가 채운다」).
 *
 * **CSS 격자의 자동 배치(촘촘하지 않은 줄 차례)와 같은 셈이다** — 자식이 지금 줄의 남은 쌍보다 넓으면 남은 쌍이 비고 그 자식은 다음 줄 첫 칸에
 * 선다. 빈 쌍을 그 구멍마다 DOM 에 끼우면 격자의 줄이 늘 꽉 차, 격자가 놓는 자리와 이 셈이 갈리지 않는다. CSS 만으로는 못 채운다 — 격자의 남는
 * 트랙에는 상자가 없어 칸 선 · 라벨 바탕이 안 선다.
 */
import type { ViewItem } from './types'

/** 칸 하나 — 몸통 자식이거나, 노드가 아닌 빈 쌍(`key` 는 그 줄 · 칸 자리라 다시 그려도 같다). */
export type PairCell = { kind: 'item'; item: ViewItem } | { kind: 'filler'; key: string }

/** 열 수를 읽는다 — 1 ~ 4 정수가 아니면 1(카탈로그의 기본값). 뷰는 검증을 지난 props 를 받지만 테마 뷰가 무엇을 넘길지 모른다. */
function columnsOf(columns: unknown): number {
  return typeof columns === 'number' && Number.isInteger(columns) && columns >= 1 ? Math.min(columns, 4) : 1
}

/**
 * 몸통 자식(`ViewProps.items` — 그 상태에서 보이는 것만)을 칸 차례로 펴고 빈 쌍을 끼운다. 자식의 폭은 `ViewItem.span`(렌더러가 열 수로 자른 몫)이고
 * 없으면 1 이다. 상태로 숨은 자식은 `items` 에 없으므로 그 자리는 다음 자식이 채우고 빈 쌍은 끝으로 간다.
 */
export function pairRows(items: readonly ViewItem[], columns: unknown): PairCell[] {
  const width = columnsOf(columns)
  const cells: PairCell[] = []
  let row = 0
  let at = 0
  const fill = () => {
    for (let column = at; column < width; column++) cells.push({ kind: 'filler', key: `filler-${row}-${column}` })
    row += 1
    at = 0
  }
  for (const item of items) {
    const span = Math.max(1, Math.min(typeof item.span === 'number' && Number.isInteger(item.span) ? item.span : 1, width))
    if (at + span > width) fill()
    cells.push({ kind: 'item', item })
    at += span
    if (at === width) {
      row += 1
      at = 0
    }
  }
  if (at > 0) fill()
  return cells
}
