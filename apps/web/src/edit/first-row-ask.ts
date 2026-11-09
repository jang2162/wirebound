/**
 * **커스텀 행이 그리드 «행» 구역의 첫 자리로 오는 편집은 묻는다**(설계서 §9 «컴포넌트» 탭 «행 내용»). 기본 행은 열의 셀 틀을 그리고 첫 행도 그것을
 * 그려 «기본 행 = 첫 행과 같은 꼴» 이 선다 — 칸을 가진 행(커스텀)이 첫 자리에 서면 기본 행들이 첫 행과 다른 꼴이 된다. 그 편집을 내기 전에 확인을
 * 받는다(`./use-edit-commit.tsx` 의 `commitOps` 가 내기 전에 이 판정을 부른다 · 상자는 `../shell/first-row-dialog.tsx`).
 *
 * **판정은 편집 앞뒤 문서로 한다** — 입구(끌기 · 위로/아래로 · 들여쓰기/내어쓰기 · 붙이기 · 삭제 · 복제 · 모듈 넣기)를 가리지 않는다. 묻는 판:
 *
 * - 편집 앞에도 있던 그리드(같은 id)의 첫 행이 앞에는 칸이 없었고(기본 · 생략 띠) 뒤에는 칸을 가졌다.
 * - 뒤에 기본 행(칸 없는 행 · 생략 띠 아님)이 하나라도 남았다 — 없으면 «다른 꼴» 이 될 행이 없다.
 *
 * **안 묻는 판:** 새로 선 그리드(붙인 그리드 · 모듈 — 그 문서에서 이미 그 꼴이다) · 앞에 행이 없던 그리드 · 앞에도 첫 행이 커스텀이던 그리드.
 * 남의 편집 · MCP · REST 로 첫 자리가 바뀌는 판과 되돌리기 · 다시 실행(앞 판으로 돌아간다)은 이 길을 안 지나 묻지 않는다.
 */
import { BODY_ZONE, zoneList, type PageDocument, type WbNode } from '@wirebound/schema'
import { isNodeLike, walkSafely } from './safe-walk'

export const FIRST_ROW_ASK_TITLE = '첫 행 바꾸기'
export const FIRST_ROW_ASK_QUESTION = '이 행이 첫 행이 되면 기본 행들이 첫 행과 다른 꼴로 그려집니다. 계속할까요?'
/** 상자의 보조 줄 — 왜 다른 꼴이 되는가. */
export const FIRST_ROW_ASK_WHY = '기본 행은 열의 셀 틀을 그립니다.'
export const FIRST_ROW_ASK_CONFIRM = '계속'
/** 확인을 누른 때 그 편집이 더는 얹히지 않는다(남의 편집이 대상 · 목적지를 지움). */
export const FIRST_ROW_ASK_STALE = '묻는 사이 페이지가 바뀌어 편집을 내지 않았습니다 — 다시 해 주세요.'

/** 첫 자리로 온 커스텀 행 — 상자가 그 행을 이름으로 말한다. */
export interface FirstRowLead {
  gridId: string
  rowId: string
}

function rowsOf(grid: WbNode): WbNode[] {
  return zoneList(grid, 'rows').filter(isNodeLike)
}

function isCustom(row: WbNode | undefined): boolean {
  return row?.type === 'GridRow' && zoneList(row, BODY_ZONE).some(isNodeLike)
}

function isBasic(row: WbNode): boolean {
  if (row.type !== 'GridRow' || isCustom(row)) return false
  const props = row.props as Record<string, unknown> | undefined
  return props?.kind !== 'gap'
}

function gridsOf(document: PageDocument): Map<string, WbNode> {
  const grids = new Map<string, WbNode>()
  for (const visit of walkSafely(document.root)) if (visit.node.type === 'DataGrid') grids.set(visit.node.id, visit.node)
  return grids
}

/** 이 편집(`before` → `after`)이 커스텀 행을 그리드의 첫 자리로 데려오는가 — 묻는 판이면 그 그리드와 행(머리말). */
export function customRowLeads(before: PageDocument, after: PageDocument): FirstRowLead | null {
  const was = gridsOf(before)
  for (const [gridId, grid] of gridsOf(after)) {
    const rows = rowsOf(grid)
    const first = rows[0]
    if (first === undefined || !isCustom(first) || !rows.some(isBasic)) continue
    const earlier = was.get(gridId)
    if (earlier === undefined) continue
    const previous = rowsOf(earlier)[0]
    if (previous === undefined || isCustom(previous)) continue
    return { gridId, rowId: first.id }
  }
  return null
}
