/**
 * **캔버스 사각형 고르기의 순수한 몫**(설계서 「설계서 화면 구조」의 «고르는 법» — 캔버스 사각형). 포인터를 듣고 그리는 것은
 * `./use-canvas-marquee.ts`다.
 *
 * # 좌표 셋
 *
 * | 좌표 | 무엇 | 어디서 온다 |
 * |---|---|---|
 * | 호스트 | 호스트 창의 `clientX/Y` | 포인터 · 끝 스크롤이 보는 칸 상자 |
 * | 문서 | 캔버스 iframe 문서의 CSS px(`clientX/Y` — iframe 안에는 세로 스크롤이 없다 · `canvas-iframe.tsx`) | 노드 상자(`getBoundingClientRect`) |
 * | 표면 | 셸 겹(`.wb-shell-canvas-surface`)의 자리 — 외곽선 · 사각형을 그리는 곳 | 문서 + 표면 안 iframe 의 자리 |
 *
 * **판정은 문서 좌표로 한다** — 노드 상자와 같은 좌표라 줌 · 칸 스크롤이 판정에 안 끼어든다. 누른 점은 문서 좌표로 붙잡아 두고(칸이
 * 굴러도 같은 문서 점이다), 지금 점은 마지막 호스트 점을 그 순간의 iframe 자리로 옮긴다(`hostToDocument` — 끝 스크롤 · 휠로 칸이
 * 굴러도 사각형이 포인터를 따라간다).
 */

export interface Point {
  x: number
  y: number
}

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface Box {
  left: number
  top: number
  width: number
  height: number
}

/**
 * 사각형 판정에 드는 노드 하나 — 문서 차례로 준다(부모가 자식보다 앞). `parentId`가 `null`이면 뿌리다. 그려진 요소마다 하나다 — 누름이 고를 노드
 * (`./canvas-pick.ts` 의 `nodeIdAt`)의 `id` 로 든다. 그리드 되풀이 줄의 사본 · 몸 칸은 그 줄의 행 `id` 로 더 든다(상자만 다르다) — 그 가운데 하나라도
 * 사각형 안이면 그 노드가 든다.
 */
export interface MarqueeNode {
  id: string
  parentId: string | null
  /** 문서 좌표의 그려진 상자(뷰가 정한 감쌀 요소 — 외곽선과 같은 측정). */
  box: Box
  /**
   * 그 요소가 선 그리드 줄의 행(`./canvas-pick.ts` 의 `lineAt`) — 첫 줄 셀 틀의 원본 노드처럼 노드 트리로는 행의 자손이 아닌데 화면으로는 그 줄 안에
   * 선 것. 그 행이 사각형에 들면 따로 고르지 않는다(행 줄을 다 덮은 사각형이 셀 틀까지 골라 Delete 가 열의 셀 틀을 지우지 않게). 없으면 `null`.
   */
  line?: string | null
}

/** 두 점 사이의 사각형. */
export function rectBetween(a: Point, b: Point): Rect {
  return { left: Math.min(a.x, b.x), top: Math.min(a.y, b.y), right: Math.max(a.x, b.x), bottom: Math.max(a.y, b.y) }
}

/**
 * 사각형 안에 **완전히** 든 노드 가운데 조상이 이미 든 것을 뺀 가장 바깥 것들 — 문서 차례. **뿌리는 안 든다**(뿌리는 여럿 고르기에
 * 안 든다 — 페이지를 덮는 사각형은 그 자식들이다). 크기가 0 인 상자는 그려지지 않은 것이라 안 든다. 그 요소가 선 줄의 행(`MarqueeNode.line`)이
 * 들었으면 그 행도 조상처럼 본다 — 행은 노드 차례로 셀 틀보다 뒤라(«열» 구역이 «행» 구역 앞) 든 것을 먼저 다 센 뒤 고른다.
 */
export function nodesInRect(rect: Rect, nodes: readonly MarqueeNode[]): string[] {
  const parentOf = new Map(nodes.map((node) => [node.id, node.parentId]))
  const within = (node: MarqueeNode): boolean => {
    if (node.parentId === null) return false
    const { left, top, width, height } = node.box
    if (width <= 0 || height <= 0) return false
    return !(left < rect.left || top < rect.top || left + width > rect.right || top + height > rect.bottom)
  }
  const inside = new Set(nodes.filter(within).map((node) => node.id))
  /** 그 id 나 그 조상 가운데 든 것이 있는가. */
  const coveredFrom = (start: string | null): boolean => {
    for (let at = start; at !== null; at = parentOf.get(at) ?? null) if (inside.has(at)) return true
    return false
  }
  const picked: string[] = []
  const inPicked = new Set<string>()
  for (const node of nodes) {
    if (!within(node) || inPicked.has(node.id)) continue
    if (coveredFrom(parentOf.get(node.id) ?? null)) continue
    if (node.line != null && node.line !== node.id && coveredFrom(node.line)) continue
    inPicked.add(node.id)
    picked.push(node.id)
  }
  return picked
}

/**
 * 호스트 점을 문서 점으로 — iframe 요소의 지금 자리(`getBoundingClientRect` — 줌이 곱해진 상자)를 빼고 줌으로 나눈다. 칸이 굴러 iframe 이
 * 움직이면 같은 호스트 점이 다른 문서 점이 된다.
 */
export function hostToDocument(point: Point, frame: { left: number; top: number }, zoom: number): Point {
  return { x: (point.x - frame.left) / zoom, y: (point.y - frame.top) / zoom }
}

/**
 * 문서 사각형을 표면 상자로 — 표면 안 iframe 의 자리(`canvas.tsx`의 `frameOffset` — 줌으로 나눈 값)를 더한다. 표면은 줌이 걸린 판 안에
 * 있어 문서 px 그대로 그린다(외곽선의 `measure`와 같은 셈).
 */
export function toSurfaceRect(rect: Rect, offset: { left: number; top: number }): Box {
  return { left: offset.left + rect.left, top: offset.top + rect.top, width: rect.right - rect.left, height: rect.bottom - rect.top }
}
