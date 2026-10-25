/**
 * **그리드 뷰가 내린 배치를 행 · 열 · 칸 뷰가 읽는 통로**(`./grid-layout.ts` 머리말 «그리드 뷰가 셈하고 행 · 열 뷰가 읽는다»). 그리드 뷰가
 * `<GridProvider value={gridLayout(...)}>` 로 표를 감싸고, 그 안의 뷰가 제 노드 몫을 훅으로 읽는다. 그리드 밖에 선 노드(설 자리 밖 · 검증 전 문서)는
 * `null` 을 받는다 — 뷰는 그때 배치 없이 제 뿌리만 그린다.
 *
 * 사본(`ViewItem.copy`)의 뷰는 `nodeId` 가 `<원본 id>~<열쇠>` 라 꼬리를 떼고 찾는다 — 노드 id 꼴(`NODE_ID_PATTERN`)에 `~` 가 없다.
 *
 * **훅은 `nodeId` 를 인자로 받는다** — 뷰 함수의 몸은 `view()` 가 내리는 노드 문맥(`ViewNodeContext`)의 **바깥**에서 돈다(그 문맥은 뷰가 돌려준 엘리먼트를
 * 감싼다). 문맥에서 읽으면 부모 노드의 id 를 읽는다.
 */
import { createContext, useContext, type ReactElement, type ReactNode } from 'react'
import type { GridBodyCell, GridHeadCell, GridLayout, GridLine } from './grid-layout'

const GridContext = createContext<GridLayout | null>(null)

export function GridProvider(props: { value: GridLayout; children: ReactNode }): ReactElement {
  return <GridContext.Provider value={props.value}>{props.children}</GridContext.Provider>
}

/** 지금 그리는 그리드의 배치 — 그리드 밖이면 `null`. */
export function useGridLayout(): GridLayout | null {
  return useContext(GridContext)
}

/** 원본 id — 사본의 뷰 id(`<원본 id>~<열쇠>`)면 꼬리를 뗀 것. */
function ownId(nodeId: string): string {
  const cut = nodeId.indexOf('~')
  return cut < 0 ? nodeId : nodeId.slice(0, cut)
}

/** 열 · 열 묶음 뷰 — 제 머리 칸(`colSpan` · `rowSpan` · 칸 자리 · 고정). `nodeId` 는 뷰가 받은 그대로(`ViewProps.nodeId`). 그리드 밖이면 `null`. */
export function useGridHead(nodeId: string): Extract<GridHeadCell, { kind: 'column' }> | null {
  const layout = useContext(GridContext)
  return layout === null ? null : (layout.headOf.get(ownId(nodeId)) ?? null)
}

/** 행 뷰 — 제 줄들(되풀이 수만큼 · 첫 줄이 행 노드 자신). `nodeId` 는 뷰가 받은 그대로. 그리드 밖이면 `null`. */
export function useGridRow(nodeId: string): readonly GridLine[] | null {
  const layout = useContext(GridContext)
  return layout === null ? null : (layout.linesOf.get(ownId(nodeId)) ?? null)
}

/** 칸 뷰 — 제 칸 자리(덮는 열 수 · 줄 수 · 첫 열). 되풀이 줄의 사본은 그 줄의 자리, 못 찾으면 첫 줄의 자리. 그리드 밖이면 `null`. */
export function useGridCell(nodeId: string): Extract<GridBodyCell, { kind: 'own' }> | null {
  const layout = useContext(GridContext)
  if (layout === null) return null
  return layout.cellOf.get(nodeId) ?? layout.cellOf.get(ownId(nodeId)) ?? null
}
