/**
 * 선택 외곽선 · 코멘트 마커의 자리. 뷰가 단 `data-wb-focus` · `data-wb-marker` · `data-wb-marker-offset` 을 DOM 에서
 * 읽는다 — 에디터 캔버스 · HTML 뷰어 · PPTX 가 이 함수 하나를 쓴다(설계 spec 「뷰 계약」). 좌표를 부르는 쪽마다
 * 계산하면 셋이 갈린다.
 */
export interface Point {
  x: number
  y: number
}

const PLACEMENTS = new Set(['top-start', 'top-end', 'bottom-start', 'bottom-end', 'start', 'end'])

/** 선택 외곽선이 감쌀 요소. 이 노드의 `[data-wb-focus]` 가 있으면 그것, 없으면 루트. */
export function focusElement(root: Element): Element {
  for (const el of Array.from(root.querySelectorAll('[data-wb-focus]'))) {
    // 가장 가까운 노드(자기 자신 포함)가 root 여야 이 노드의 것이다 — 자식 노드 안의 focus 는 그 자식의 것이다.
    if (el.closest('[data-wb-id]') === root) return el
  }
  return root
}

function offsetOf(root: Element): [number, number] {
  const raw = root.getAttribute('data-wb-marker-offset')
  if (raw === null) return [0, 0]
  const parts = raw.split(',').map(Number)
  return parts.length === 2 && parts.every(Number.isFinite) ? [parts[0]!, parts[1]!] : [0, 0]
}

/** 마커 중심점. 좌표계는 `getBoundingClientRect()` 와 같다. 망가진 속성은 기본값(`top-start` · `[0, 0]`)으로 읽는다. */
export function markerPoint(root: Element): Point {
  const r = focusElement(root).getBoundingClientRect()
  const raw = root.getAttribute('data-wb-marker') ?? 'top-start'
  const placement = PLACEMENTS.has(raw) ? raw : 'top-start'
  const x = placement.endsWith('end') ? r.left + r.width : r.left
  const y = placement.startsWith('top') ? r.top : placement.startsWith('bottom') ? r.top + r.height : r.top + r.height / 2
  const [dx, dy] = offsetOf(root)
  return { x: x + dx, y: y + dy }
}
