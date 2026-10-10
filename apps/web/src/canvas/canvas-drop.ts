/**
 * **캔버스 위의 놓을 자리** — 끄는 포인터가 캔버스 iframe 의 어느 노드 · 어느 띠에 있나(spec
 * `docs/superpowers/specs/2026-10-01-component-drag-design.md` 「놓을 자리 판정」). 답은 «대상 노드 + 띠 | 페이지 끝»까지이고, 그것을
 * 부모 id + 차례로 바꾸는 것은 트리와 같은 함수(`edit/structure-drop.ts`)다 — 경로 층(`drag/use-placement.ts`)이 둘을 잇는다.
 *
 * 순수 함수(구역 · 축 · 좌표 환산)와 그것을 그려진 DOM 에 대는 얇은 층(`canvasHitAt`)으로 가른다 — jsdom 에 레이아웃이 없어 순수 함수는
 * 값으로 재고(`test/canvas/canvas-drop.test.ts`), DOM 층은 실브라우저로 잰다(`build-test/canvas-drop.test.ts`).
 *
 * ## 띠는 그려진 상자와 부모의 배치로 정한다 — 카탈로그가 아니다
 *
 * 같은 `Grid` 도 테마마다 열 수 · 접힘이 다르고 `SearchForm` 의 필드 줄은 테마가 가로로 늘어놓는다. 그래서 앞 · 뒤의 축은 노드의 DOM
 * 부모가 **지금 그린** 계산 스타일과 형제 상자로 읽는다(`axisOf`). `row-reverse` 는 보이는 앞 · 뒤를 문서 차례로 뒤집는다.
 *
 * | 부모 | 축 |
 * |---|---|
 * | `flex` · `inline-flex` | `flex-direction` — `row*` 면 x, `column*` 면 y, `*-reverse` 면 뒤집힘 |
 * | `grid` · `inline-grid` | 자식 가운데 둘이 같은 줄(세로로 겹침)에 서면 x — 마지막 줄에 혼자 선 칸도 x |
 * | 그 밖(`block` …) | 이 노드가 형제와 같은 줄에 서면 x(인라인 상자가 늘어선 판), 아니면 y |
 *
 * **못 보는 것:** CSS `order` · `direction: rtl` 로 바뀐 보이는 차례는 안 읽는다 — 그 판에서는 보이는 왼쪽이 문서의 앞이라고 셈한다.
 * 시스템 테마 다섯에는 노드를 자식으로 담는 상자에 그런 규칙이 없다(다시 재는 법: `grep -rn "row-reverse\|order:\|direction: *rtl"
 * system-themes/*\/src` — 걸리는 것은 `Field` 의 체크 · 라디오 줄이고 그 안에는 노드가 없다).
 *
 * ## 좌표는 iframe 요소의 호스트 상자 하나로 환산한다
 *
 * 프레임에 `scale(zoom)` 이 걸리고 캔버스 칸이 스크롤된다(`routes/editor.tsx` 의 `CanvasFrame`). iframe 요소의 `getBoundingClientRect`
 * 는 그 둘이 이미 든 호스트 좌표이고, iframe 안의 `elementFromPoint` · `getBoundingClientRect` 는 iframe 창의 좌표다 — 그래서 «프레임
 * 상자 왼 · 위를 빼고 줌으로 나눈다» 한 줄이면 된다(`hostToFrame`). 칸의 스크롤 · 표면 안 iframe 의 자리(`canvas.tsx` 의 `frameOffset`)
 * 를 따로 더하지 않는다 — 그 값들로 다시 짓는 길은 하나라도 빠뜨리면 그만큼 어긋난다. iframe 은 문서 높이를 따라 자라 안쪽 스크롤이
 * 없고(`canvas-iframe.tsx`), 있더라도 두 값이 같은 창 좌표라 서로 지운다.
 *
 * ## 뿌리의 노드 사이 바탕은 가장 가까운 자식의 앞 · 뒤다
 *
 * 뿌리 요소는 자식 사이의 간격(`gap` · 여백)도 덮는다 — 포인터가 그 바탕에 서면 «뿌리 자신» 이라 페이지 끝으로 읽혔고, 위아래로 쓸면 미리보기가
 * 노드 곁 → 페이지 끝 → 노드 곁로 뛰었다(`build-test/canvas-drop-below.test.ts` «노드 사이 바탕»). 그래서 그 바탕은 **점에서 가장 가까운 뿌리
 * 직계 자식**(`nearestChild`)의 앞 · 뒤다 — 띠는 그 자식의 반쪽(앞 · 뒤)뿐이고 «안» 은 없다(바탕은 그 자식의 몸통이 아니다). 앞 · 뒤 쌍으로는 간격 양쪽
 * 자식의 «뒤» 와 «앞» 이 같은 자리다. 뿌리의 자식이 없으면 페이지 끝이다.
 *
 * **못 읽는 것:** 뿌리 밖 컨테이너(카드 · 그리드)의 노드 사이 바탕은 그 컨테이너 자신이라 «안»(끝) 으로 읽힌다 — 같은 떨림이 있으나 그 안의 위치는
 * 컨테이너의 «안» 이라 데이터를 잃지 않는다(재지 않았다).
 *
 * ## 문서 아래 바탕은 페이지 끝이다
 *
 * iframe 은 문서 높이만큼만 서서(짧은 문서는 최소 높이) 캔버스 칸이 그보다 길면 문서 밑에 칸의 바탕이 남는다. **캔버스 칸 안이고 문서 iframe
 * 아래끝보다 밑인 점은 «페이지 끝»으로 읽는다** — 뿌리 자식이 없는 문서 안과 같은 답이다. 하단 판에서 카드를 쥐고 올라오면 먼저 닿는 자리가
 * 그 바탕이라, 못 놓는 자리로 두면 «캔버스로 끌어도 안 놓인다»가 된다(창 1440×900 · 판 기본 높이 · 짧은 문서에서 판 바로 위 125px —
 * `build-test/canvas-drop-below.test.ts` 의 `gap`). 긴 문서를 끝까지 민 판의 칸 안쪽 여백(문서 밑 24px)도 같은 자리다.
 *
 * **문서 옆 · 위의 바탕은 못 놓는 자리로 남긴다** — 놓다 마는 자리가 칸 안에 하나는 있어야 하고(Escape 말고), 문서가 칸보다 좁고 긴 판에서는
 * 옆 바탕의 페이지 끝이 화면 밖이라 미리보기 없이 놓이게 된다. 아래 바탕은 문서 끝이 보일 때만 드러나므로 미리보기가 늘 보인다.
 */
import { dropZone, type DropZone } from '../tree/tree-drop'

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

export interface Point {
  x: number
  y: number
}

export type Axis = 'x' | 'y'

/** 부모가 자식을 늘어놓는 축 · 보이는 차례가 문서 차례와 반대인가. 표시(`drag/drop-indicator.tsx`)도 이것으로 선을 세운다. */
export interface Layout {
  axis: Axis
  reversed: boolean
}

/**
 * 포인터 밑 캔버스 자리. `rect` 는 표시가 붙을 상자의 **호스트 창 좌표**다(`DropIndicator` 가 `position: fixed` 로 그린다). 문서 아래
 * 바탕 · 뿌리 자신(자식이 없을 때)은 페이지 끝이고 그 상자는 뿌리의 것이다.
 */
export type CanvasHit =
  | { overId: string; zone: DropZone; rect: Rect; layout: Layout }
  | { pageEnd: true; rect: Rect; layout: Layout }
  | { preview: true; rect: Rect; layout: Layout }

/** 문서에서 읽는 노드의 사정 — 부르는 쪽이 스토어 문서로 답한다. 문서에 없는 id(합성의 유령 · 폴백)는 `null`. */
export interface HitNode {
  root: boolean
  acceptsChildren: boolean
  /** 자식이 없다 — 받는 노드면 상자 전체가 «안». */
  empty: boolean
}

const VERTICAL: Layout = { axis: 'y', reversed: false }

/**
 * 상자 안 자리를 띠로. 축 방향으로 앞 25% · 뒤 25% · 가운데(받을 때만 — 아니면 반씩)는 트리 줄과 같은 셈이다(`tree/tree-drop.ts` 의
 * `dropZone`). 받는 빈 노드는 상자 전체가 «안» 이다 — 빈 컨테이너에 놓을 자리가 가운데 절반뿐이면 작은 상자에서 못 맞춘다.
 */
export function zoneOf(rect: Rect, axis: Axis, reversed: boolean, point: Point, acceptsChildren: boolean, empty: boolean): DropZone {
  if (acceptsChildren && empty) return 'inside'
  const zone =
    axis === 'x'
      ? dropZone(point.x - rect.left, rect.width, acceptsChildren)
      : dropZone(point.y - rect.top, rect.height, acceptsChildren)
  if (!reversed || zone === 'inside') return zone
  return zone === 'before' ? 'after' : 'before'
}

/** 두 상자가 세로로 겹치는가 — 같은 줄. 맞닿기만 한 것은 아니다(위아래로 쌓인 블록). */
function sameRow(a: Rect, b: Rect): boolean {
  return a.top < b.top + b.height && b.top < a.top + a.height
}

/** 부모 배치의 축(머리말의 표). `siblings` 는 같은 부모의 다른 자식 상자다. */
export function axisOf(style: { display: string; flexDirection: string }, siblings: readonly Rect[], self: Rect): Layout {
  if (style.display === 'flex' || style.display === 'inline-flex') {
    const reversed = style.flexDirection.endsWith('-reverse')
    return { axis: style.flexDirection.startsWith('row') ? 'x' : 'y', reversed }
  }
  if (style.display === 'grid' || style.display === 'inline-grid') {
    const all = [self, ...siblings]
    const horizontal = all.some((a, i) => all.some((b, j) => j > i && sameRow(a, b)))
    return horizontal ? { axis: 'x', reversed: false } : VERTICAL
  }
  return siblings.some((sibling) => sameRow(self, sibling)) ? { axis: 'x', reversed: false } : VERTICAL
}

/** 호스트 창의 점 → iframe 창의 점. `frame` 은 iframe 요소의 호스트 상자다(머리말 «좌표는»). */
export function hostToFrame(point: Point, frame: Rect, zoom: number): Point {
  return { x: (point.x - frame.left) / zoom, y: (point.y - frame.top) / zoom }
}

/** iframe 창의 상자 → 호스트 창의 상자. */
export function frameToHost(rect: Rect, frame: Rect, zoom: number): Rect {
  return { left: frame.left + rect.left * zoom, top: frame.top + rect.top * zoom, width: rect.width * zoom, height: rect.height * zoom }
}

/** 그 점이 상자 안인가(오른 · 아래 끝은 밖). */
function inside(point: Point, rect: Rect): boolean {
  return point.x >= rect.left && point.x < rect.left + rect.width && point.y >= rect.top && point.y < rect.top + rect.height
}

function plain(rect: DOMRect): Rect {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

/** iframe 안의 요소는 iframe 창의 `Element` 라 호스트의 `instanceof` 가 거짓이다(`CLAUDE.md` «캔버스 문서는 same-origin iframe 이다»). */
function isElement(value: unknown): value is Element {
  return typeof value === 'object' && value !== null && (value as Node).nodeType === 1
}

/** `display: contents` 는 상자가 없다 — 배치는 그 위 조상이 한다. 배치 선(`./layout-guides.ts`)도 이것으로 컨테이너를 찾는다. */
export function layoutParent(element: Element, view: Window): Element | null {
  let parent = element.parentElement
  while (parent !== null && view.getComputedStyle(parent).display === 'contents') parent = parent.parentElement
  return parent
}

/** 배치 부모의 다른 자식 상자 — `display: contents` 자식은 그 안을 펼친다. 크기 0(숨김)은 줄을 안 만든다. */
export function siblingRects(parent: Element, self: Element, view: Window): Rect[] {
  const out: Rect[] = []
  const visit = (element: Element): void => {
    if (element === self) return
    if (view.getComputedStyle(element).display === 'contents') {
      for (const child of Array.from(element.children)) visit(child)
      return
    }
    const rect = element.getBoundingClientRect()
    if (rect.width > 0 || rect.height > 0) out.push(plain(rect))
  }
  for (const child of Array.from(parent.children)) visit(child)
  return out
}

/**
 * **호스트 창의 점 → 캔버스 자리.** `clip` 상자(캔버스 칸) 밖이면 `null` — 스크롤로 칸 밖에 밀려난 iframe 부분은 머리 · 사이드바 밑에 깔려
 * 있다. 칸 안에서 iframe 상자 밖이면 문서 아래끝보다 밑일 때만 페이지 끝이고(머리말 «문서 아래 바탕은 페이지 끝이다») 옆 · 위는 `null` 이다.
 * `clip` 이 없으면(칸이 없는 숙주) iframe 밖은 다 `null` 이다 — «아래»의 끝을 정할 상자가 없다.
 *
 * 포인터 밑 요소에서 가장 가까운 `[data-wb-id]` 조상이 대상이다. `node(id)` 가 `null` 인 id(문서에 없는 — 폴백의 빈 id · 합성의 유령)는
 * 건너뛰고 위로 오른다. 그런 조상이 없으면 페이지 끝이고, 뿌리면 가장 가까운 뿌리 자식의 앞 · 뒤다(머리말 «뿌리의 노드 사이 바탕») — 자식이 없을 때만 페이지 끝.
 *
 * **배치 미리보기 위면 `{ preview: true }` 다**(`isPreview` — `./canvas-preview.ts` 의 id 머리) — 미리보기는 문서의 노드가 아니라 그 위의
 * 그림이라 대상도 · 그 부모의 «안» 도 아니다. 판정은 미리보기를 숨기고 재므로(`drag/use-placement.ts` 머리말 «판정은 미리보기를 뺀
 * 배치로») 보통은 안 잡힌다 — 잡히면 부르는 쪽이 보인 자리를 그대로 둔다.
 */
export function canvasHitAt(
  frame: Window,
  zoom: number,
  hostPoint: Point,
  node: (id: string) => HitNode | null,
  clip: Rect | null,
  isPreview: (id: string) => boolean = () => false,
): CanvasHit | null {
  const element = frame.frameElement
  if (element === null) return null
  const frameRect = plain(element.getBoundingClientRect())
  if (clip !== null && !inside(hostPoint, clip)) return null
  const doc = frame.document
  if (!inside(hostPoint, frameRect)) {
    if (clip === null || hostPoint.y < frameRect.top + frameRect.height) return null
    return pageEndHit(firstNodeElement(doc, node) ?? doc.body, frameRect, zoom)
  }

  const point = hostToFrame(hostPoint, frameRect, zoom)
  const under: unknown = doc.elementFromPoint(point.x, point.y)
  let cursor: Element | null = isElement(under) ? under : null
  let found: { element: Element; id: string; info: HitNode } | null = null
  while (cursor !== null && doc.body.contains(cursor)) {
    const id = cursor.getAttribute('data-wb-id')
    if (id !== null && isPreview(id)) return { preview: true, rect: frameToHost(plain(cursor.getBoundingClientRect()), frameRect, zoom), layout: VERTICAL }
    const info = id === null || id === '' ? null : node(id)
    if (id !== null && info !== null) {
      found = { element: cursor, id, info }
      break
    }
    cursor = cursor.parentElement
  }

  if (found === null) return pageEndHit(firstNodeElement(doc, node) ?? doc.body, frameRect, zoom)
  if (found.info.root) {
    // 뿌리의 노드 사이 바탕 — 가장 가까운 자식의 앞 · 뒤다(머리말 «뿌리의 노드 사이 바탕은 가장 가까운 자식의 앞 · 뒤다»). 자식이 없으면 페이지 끝.
    const nearest = nearestChild(found.element, point, node, isPreview)
    return nearest === null
      ? pageEndHit(found.element, frameRect, zoom)
      : nodeHit(frame, frameRect, zoom, point, nearest.element, nearest.id, { root: false, acceptsChildren: false, empty: false })
  }
  return nodeHit(frame, frameRect, zoom, point, found.element, found.id, found.info)
}

/** 포인터 밑 노드 요소에서 «대상 + 띠» 를 낸다 — 부모의 배치 축으로 띠를 가른다(머리말 표). */
function nodeHit(frame: Window, frameRect: Rect, zoom: number, point: Point, element: Element, id: string, info: HitNode): CanvasHit {
  const rect = plain(element.getBoundingClientRect())
  const parent = layoutParent(element, frame)
  const layout = parent === null ? VERTICAL : axisOf(frame.getComputedStyle(parent), siblingRects(parent, element, frame), rect)
  const zone = zoneOf(rect, layout.axis, layout.reversed, point, info.acceptsChildren, info.empty)
  return { overId: id, zone, rect: frameToHost(rect, frameRect, zoom), layout }
}

/**
 * 뿌리 요소의 노드 자식 가운데 `point`(iframe 창 좌표)에 가장 가까운 것 — 점이 상자 안이면 거리 0 이다. 크기 0(숨김 · 미리보기)과 미리보기는
 * 건너뛴다. 동점이면 문서 차례가 앞선 쪽. 없으면 `null`.
 */
function nearestChild(
  rootElement: Element,
  point: Point,
  node: (id: string) => HitNode | null,
  isPreview: (id: string) => boolean,
): { element: Element; id: string } | null {
  let best: { element: Element; id: string; distance: number } | null = null
  for (const element of Array.from(rootElement.querySelectorAll('[data-wb-id]'))) {
    const id = element.getAttribute('data-wb-id')
    if (id === null || id === '' || isPreview(id)) continue
    // 뿌리의 **직계** 노드 자식만 — 자식의 자손은 그 자식 곁이 아니라 안이라 뿌리 사이 바탕의 후보가 아니다.
    if (element.parentElement?.closest('[data-wb-id]') !== rootElement) continue
    const info = node(id)
    if (info === null || info.root) continue
    const box = element.getBoundingClientRect()
    if (box.width <= 0 && box.height <= 0) continue
    const dx = Math.max(box.left - point.x, 0, point.x - (box.left + box.width))
    const dy = Math.max(box.top - point.y, 0, point.y - (box.top + box.height))
    const distance = Math.hypot(dx, dy)
    if (best === null || distance < best.distance) best = { element, id, distance }
  }
  return best === null ? null : { element: best.element, id: best.id }
}

/** 페이지 끝 — 표시가 붙을 상자는 뿌리 요소의 것이다. */
function pageEndHit(rootElement: Element, frameRect: Rect, zoom: number): CanvasHit {
  return { pageEnd: true, rect: frameToHost(plain(rootElement.getBoundingClientRect()), frameRect, zoom), layout: VERTICAL }
}

/** 페이지 끝 표시가 붙을 뿌리 요소 — 문서 차례로 처음 만나는 뿌리. 없으면(빈 문서를 안 그리는 뷰) `null` 이고 부르는 쪽이 `body` 를 쓴다. */
function firstNodeElement(doc: Document, node: (id: string) => HitNode | null): Element | null {
  for (const element of Array.from(doc.querySelectorAll('[data-wb-id]'))) {
    const id = element.getAttribute('data-wb-id')
    if (id !== null && id !== '' && node(id)?.root === true) return element
  }
  return null
}
