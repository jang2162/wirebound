/**
 * **그리드 행의 «행 내용: 기본 / 커스텀»** — 속성 패널의 화면 명령(`panels/row-content-field.tsx`). 문서에 따로 적는 값이 아니다 — 행이 칸(`GridCell`)을
 * 가지면 커스텀, 안 가지면 기본이다. 렌더러 · 서버 · MCP · 내보내기가 이미 그 한 판정으로 그린다(`@wirebound/theme-sdk` 의 `gridLayout` — «칸을 하나라도
 * 가지면 제 칸만»). 그래서 스키마 · 마이그레이션이 없고, 칸을 가진 기존 문서의 행은 그대로 커스텀으로 읽힌다.
 *
 * | 옮김 | 편집 | 못 하는 판 |
 * |---|---|---|
 * | 기본 → 커스텀 | «열 틀로 칸 짓기» 와 같은 묶음(`./grid-row-actions.ts` 의 `buildCellsOps`) — 지금 그린 꼴 그대로 셀 틀을 칸으로 베낀다 | 그 함수의 까닭(첫 행 · 생략 띠 · 위 행 세로 칸) |
 * | 커스텀 → 기본 | 칸 배열을 통째로 걷는다(`clearCellsOps`) — 행은 다시 열의 셀 틀을 되풀이한다 | 생략 띠 |
 *
 * **첫 행은 늘 기본이다** — 기본 행은 열의 셀 틀을 그리고 첫 행도 그것을 그려 «기본 행 = 첫 행과 같은 꼴» 이 선다. 첫 행이 이미 칸을 가졌으면(이 규칙
 * 전에 지은 문서 · 칸을 가진 행을 첫 자리로 옮김) 커스텀으로 보이고 기본으로만 돌릴 수 있다.
 *
 * **커스텀 → 기본은 잃을 것이 있으면 묻는다** — 칸이 지금 열 틀로 지을 칸과 같은 꼴이면(커스텀으로 바꾸고 아무것도 안 고침) 걷어도 잃는 것이 없어 묻지
 * 않는다(`cellsMatchTemplate`). 다르면 걷기 전에 확인을 받는다.
 *
 * **걷기의 전제는 칸 배열 통째다** — 남이 그 사이 그 행의 칸을 고쳤으면(내 화면에 닿기 전) 리베이스가 묶음째 버리고 알린다. 묻고 확인한 것은 내가 본
 * 칸이다 — 남이 그 뒤에 쓴 칸까지 말없이 걷지 않는다.
 */
import { BODY_ZONE, getByPointer, zoneList, type PageDocument, type WbNode } from '@wirebound/schema'
import { cellsMatchTemplate, GAP_ROW_WHY } from './grid-row-actions'
import type { NodeEdit } from './paste-ops'
import { findNodePathSafely, findNodeSafely, isNodeLike } from './safe-walk'

export type RowContent = 'basic' | 'custom'

export const ROW_CONTENT_LABEL = '행 내용'
export const ROW_CONTENT_LABELS: Record<RowContent, string> = { basic: '기본', custom: '커스텀' }
export const ROW_CONTENT_HINT = '기본은 열의 셀 틀을 그립니다 · 커스텀은 이 행만의 칸을 그립니다'
/** 이미 기본인 행을 기본으로 — 부르는 쪽이 같은 값을 거르므로 화면에는 안 선다. */
const ALREADY_BASIC = '칸이 없는 행입니다'
const NOT_A_ROW = '그리드 안의 행이 아닙니다'

/** 칸 — 행의 몸통. 노드 아닌 원소는 뺀다(검증 전 문서 — `zoneList` 는 원소를 안 거른다). */
function cellsOf(row: WbNode): WbNode[] {
  return zoneList(row, BODY_ZONE).filter(isNodeLike)
}

/** 그 행의 내용 — 그리드 행이 아니면 `null`. */
export function rowContentOf(document: PageDocument, rowId: string): RowContent | null {
  const row = findNodeSafely(document.root, rowId)
  if (row?.type !== 'GridRow') return null
  return cellsOf(row).length > 0 ? 'custom' : 'basic'
}

/** 커스텀 → 기본(칸을 걷음)을 못 하는 까닭 — 할 수 있으면 `null`. */
export function toBasicRefusal(document: PageDocument, rowId: string): string | null {
  const row = findNodeSafely(document.root, rowId)
  if (row?.type !== 'GridRow') return NOT_A_ROW
  const props = row.props as Record<string, unknown> | undefined
  if (props?.kind === 'gap') return GAP_ROW_WHY
  return cellsOf(row).length === 0 ? ALREADY_BASIC : null
}

/** 칸을 걷으면 잃는 것이 있는가 — 칸이 지금 열 틀로 지을 칸과 다르다(머리말 «잃을 것이 있으면 묻는다»). 칸 수를 함께 낸다. */
export function cellsToLose(document: PageDocument, rowId: string): number {
  const row = findNodeSafely(document.root, rowId)
  if (row?.type !== 'GridRow') return 0
  const count = cellsOf(row).length
  return count === 0 || cellsMatchTemplate(document, rowId) ? 0 : count
}

/** 확인 문장 — 걷을 칸 수. */
export function clearCellsQuestion(count: number): string {
  return `이 행의 칸 ${count}개를 걷고 열의 셀 틀로 그립니다. 칸에서 고친 내용은 사라집니다.`
}

/** 커스텀 → 기본의 묶음 — 칸 배열이 내가 본 그대로라는 전제 + 배열 걷기(머리말 «걷기의 전제»). */
export function clearCellsOps(document: PageDocument, rowId: string): NodeEdit {
  const refusal = toBasicRefusal(document, rowId)
  if (refusal !== null) return { reason: refusal }
  const path = findNodePathSafely(document.root, rowId)
  if (path === undefined) return { reason: NOT_A_ROW }
  // 전제는 배열 그대로(노드 아닌 원소까지) — 포인터로 읽는다.
  return {
    ops: [
      { op: 'test', path: `${path}/children`, value: structuredClone(getByPointer(document, `${path}/children`)) },
      { op: 'remove', path: `${path}/children` },
    ],
    insertedIds: [],
  }
}
