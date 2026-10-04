/**
 * **배치 선** — 캔버스의 Flex · Grid 노드마다 점선 테두리 · 모서리 표시(Flex → ↓ ← ↑ · Grid «N열») · 안쪽 선을 셸 겹에 그린다(설계서 「설계서 화면 구조」
 * «배치 선»). 켜고 끄는 단추는 머리(`GuidesToggle` — 편집 모드에서만 선다), 그리기는 캔버스(`canvas/canvas.tsx` 의 `guides` — 선택 외곽선 ·
 * 번호 마커와 같은 측정 · 같은 다시 잼)다.
 *
 * ## 켬 · 끔은 사람마다 브라우저에 기억한다
 *
 * `localStorage` 의 `GUIDES_KEY` 하나. 읽거나 쓰지 못하면(사생활 창 · 막힌 저장소) 끈 채 시작하고 이번 화면 동안만 켠다 — 접근이 던져도 셸은
 * 산다. 단추와 캔버스가 같은 값을 보게 모듈의 값 하나를 구독한다(`useLayoutGuides`).
 *
 * ## 방향 · 열 수는 그려진 배치로 읽는다 — props 가 아니다
 *
 * 같은 `Flex` 도 테마가 `direction` 을 어떻게 그리는지(`*-reverse` · 감싼 상자)가 다르다. 그래서 노드의 자식 하나가 놓인 배치 부모의 계산
 * 스타일과 형제 상자로 축을 읽는다 — 놓을 자리 판정과 같은 함수(`./canvas-drop.ts` 의 `layoutParent` · `axisOf`)다. 그린 자식이 없으면 노드
 * 상자의 `display` 를, 그것도 flex · grid 가 아니면 props 를 쓴다. Grid 의 열 수는 그 배치 부모가 grid 면 계산된 `grid-template-columns` 의
 * 칸 수, 아니면 자식 상자의 첫 줄 수다.
 *
 * ## 안쪽 선 — 열 · 행 · 자식 사이 · 줄 사이는 그려진 자식 상자로 정한다
 *
 * 켜면 바깥 점선 안에 옅은 점선을 더 긋는다 — Grid 는 열과 열 · 행과 행 사이, Flex 는 자식과 자식 사이(주축에 직각 — 가로 배치는 세로선)와
 * 줄바꿈으로 선 줄과 줄 사이다. **자리는 CSS(`grid-template-*` · `flex-direction`)가 아니라 그린 자식 상자로 정한다** — 테마 뷰가 칸을 감싼
 * 상자 · 다른 배치로 그려도 선이 보이는 칸에 맞는다. Flex 의 방향만은 모서리 글과 같은 판정(`axisOf`)을 쓴다.
 *
 * - **묶음은 겹침으로 짓는다**(`groups`) — Grid 의 열은 가로로 겹치는 자식, 행은 세로로 겹치는 자식, Flex 의 줄은 교차축으로 겹치는 자식이다.
 *   윗끝 · 왼끝이 같은지로 묶지 않는 것은 칸 안에서 가운데 · 끝으로 붙은 자식(`align-items: center`)의 윗끝이 칸마다 달라서다. 맞닿기만 한
 *   두 상자(간격 0)는 `TOUCH` 보다 덜 겹치면 다른 묶음이다 — 소수 px 폭의 칸이 반올림으로 겹쳐 보이는 판. 맞닿은 상자를 잇게 바꾸면 간격 단위
 *   토큰을 0 으로 둔 관리 테마에서 세로선이 다 빠진다(`build-test/layout-guides.test.ts` 의 «간격 0»).
 * - **선은 이웃 묶음 사이 간격의 가운데**다 — 앞 묶음의 끝(가장 먼 끝)과 뒤 묶음의 시작(가장 가까운 시작)의 가운데. 간격이 없으면 경계다.
 * - 선의 길이는 자식 전체가 덮는 상자(줄 안의 선은 그 줄)다 — 노드의 안쪽 여백 위로는 안 긋는다.
 * - 자식이 하나 · 없으면 안쪽 선이 없다. 미리보기 노드(`wb:preview:`)는 세지 않는다. 크기 0(숨김)인 자식은 묶음을 안 만든다.
 *
 * **칸 걸침은 선을 지운다** — 칸을 둘 이상 덮는 자식(열 · 행 걸침)은 두 묶음을 하나로 이어 그 사이 선이 사라진다. 스키마에 걸침이 없어 그
 * 판을 세우지 않았다. **비용은 노드의 자손 요소 수와 자식 수에 비례한다**(`querySelectorAll` 한 번 · 정렬 몇 번 — `build-test/layout-guides.test.ts`
 * 의 `[다시 잼]` 로그).
 *
 * ## 못 재는 것
 *
 * 시스템 테마 다섯은 `direction` · `columns` 를 props 그대로 그린다(`build-test/layout-guides.test.ts` 의 `[배치 선]` 로그 —
 * 뷰포트 375 의 Grid 도 3열이다) — 그려진 배치로 읽는 길과 props 로 읽는 길이 그 판들에서 같은 글을 내어, props 만 읽게 바꾼 변이가 산다.
 * 그 둘이 갈리는 테마(`*-reverse` · 좁은 폭에서 접히는 Grid)가 서면 그 테마로 케이스를 세운다.
 */
import { useSyncExternalStore, type ReactElement } from 'react'
import type { WbNode } from '@wirebound/schema'
import { focusElement } from '@wirebound/renderer'
import { shellIcon } from '../shell/icons'
import { axisOf, layoutParent, siblingRects, type Rect } from './canvas-drop'
import { isPreviewId } from './canvas-preview'

export const GUIDES_KEY = 'wirebound.layoutGuides'

let on: boolean | null = null
const listeners = new Set<() => void>()

function read(): boolean {
  if (on !== null) return on
  try {
    on = window.localStorage.getItem(GUIDES_KEY) === 'on'
  } catch {
    on = false
  }
  return on
}

/** 켬 · 끔을 바꾼다 — 저장을 못 해도 이번 화면에서는 바뀐다. */
export function setLayoutGuides(next: boolean): void {
  on = next
  try {
    if (next) window.localStorage.setItem(GUIDES_KEY, 'on')
    else window.localStorage.removeItem(GUIDES_KEY)
  } catch {
    // 막힌 저장소 — 머리말 «켬 · 끔은 사람마다 브라우저에 기억한다».
  }
  for (const listener of listeners) listener()
}

/** 케이스 사이에 기억을 걷는다 — 다음 읽기가 저장소에서 다시 읽는다. */
export function resetLayoutGuides(): void {
  on = null
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useLayoutGuides(): boolean {
  return useSyncExternalStore(subscribe, read)
}

/** 머리의 «배치 선» 단추 — 누름 상태는 `aria-pressed`. 아이콘만 남는 단추라 이름 · `title` 이 글이다(`shell/icons.ts` 머리말). */
export function GuidesToggle(): ReactElement {
  const pressed = useLayoutGuides()
  return (
    <button
      type="button"
      className="wb-shell-guides-toggle"
      aria-pressed={pressed}
      aria-label="배치 선"
      title="배치 선"
      onClick={() => setLayoutGuides(!pressed)}
    >
      {shellIcon('layoutGuides', 16)}
    </button>
  )
}

/**
 * 안쪽 선 하나(머리말 «안쪽 선») — 캔버스 문서의 좌표. `axis` 가 `'x'` 면 세로선(`at` 이 x · `from`–`to` 가 y), `'y'` 면 가로선(`at` 이 y ·
 * `from`–`to` 가 x)이다.
 */
export interface GuideLine {
  axis: 'x' | 'y'
  at: number
  from: number
  to: number
}

/** 노드 하나의 배치 선 — 종류 · 모서리 글 · 안쪽 선. */
export interface Guide {
  kind: 'flex' | 'grid'
  label: string
  lines: readonly GuideLine[]
}

/** 두 상자를 한 묶음으로 보는 겹침의 하한(캔버스 문서 px) — 머리말 «묶음은 겹침으로 짓는다». */
const TOUCH = 1

interface Span {
  start: number
  end: number
}

/** 한 축의 묶음 — 그 축으로 `TOUCH` 넘게 겹치는 상자끼리. 차례는 시작 차례다. */
function groups<T>(items: readonly T[], span: (item: T) => Span): T[][] {
  const sorted = [...items].sort((a, b) => span(a).start - span(b).start)
  const out: T[][] = []
  let end = -Infinity
  for (const item of sorted) {
    const { start, end: itemEnd } = span(item)
    const last = out[out.length - 1]
    if (last !== undefined && start < end - TOUCH) {
      last.push(item)
      end = Math.max(end, itemEnd)
    } else {
      out.push([item])
      end = itemEnd
    }
  }
  return out
}

const X = (rect: Rect): Span => ({ start: rect.left, end: rect.left + rect.width })
const Y = (rect: Rect): Span => ({ start: rect.top, end: rect.top + rect.height })

function extent(rects: readonly Rect[], span: (rect: Rect) => Span): Span {
  return { start: Math.min(...rects.map((rect) => span(rect).start)), end: Math.max(...rects.map((rect) => span(rect).end)) }
}

/** 이웃 묶음 사이 간격의 가운데마다 선 하나 — `along` 축에 놓이고 `across` 축으로 `cross` 만큼 뻗는다. */
function between(bands: readonly Rect[][], along: 'x' | 'y', cross: Span): GuideLine[] {
  const span = along === 'x' ? X : Y
  const out: GuideLine[] = []
  for (let index = 1; index < bands.length; index += 1) {
    const before = extent(bands[index - 1]!, span).end
    const after = extent(bands[index]!, span).start
    out.push({ axis: along, at: (before + after) / 2, from: cross.start, to: cross.end })
  }
  return out
}

/** 노드의 자식 상자 — 노드 요소 안에서 자식 id 로 찾는다(미리보기 · 크기 0 은 뺀다). 노드 요소가 상자가 없으면 뷰가 고른 상자(`data-wb-focus`). */
function childRects(node: WbNode, element: Element): Rect[] {
  const ids = new Set(
    (Array.isArray(node.children) ? node.children : [])
      .filter((child) => typeof child === 'object' && child !== null && typeof child.id === 'string' && !isPreviewId(child.id))
      .map((child) => child.id),
  )
  if (ids.size < 2) return []
  const out: Rect[] = []
  for (const candidate of Array.from(element.querySelectorAll('[data-wb-id]'))) {
    const id = candidate.getAttribute('data-wb-id') ?? ''
    if (!ids.has(id)) continue
    ids.delete(id)
    let rect = candidate.getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) rect = focusElement(candidate).getBoundingClientRect()
    if (rect.width > 0 || rect.height > 0) out.push(plain(rect))
  }
  return out
}

/** Grid 의 안쪽 선 — 열 사이 세로선 · 행 사이 가로선(머리말 «안쪽 선»). */
function gridLines(rects: readonly Rect[]): GuideLine[] {
  if (rects.length < 2) return []
  return [...between(groups(rects, X), 'x', extent(rects, Y)), ...between(groups(rects, Y), 'y', extent(rects, X))]
}

/** Flex 의 안쪽 선 — 줄마다 자식 사이(주축에 놓인 선) · 줄 사이(교차축에 놓인 선). `axis` 는 주축이다. */
function flexLines(rects: readonly Rect[], axis: 'x' | 'y'): GuideLine[] {
  if (rects.length < 2) return []
  const [main, cross] = axis === 'x' ? [X, Y] : [Y, X]
  const crossAxis = axis === 'x' ? 'y' : 'x'
  const rows = groups(rects, cross)
  const out: GuideLine[] = []
  for (const row of rows) out.push(...between(groups(row, main), axis, extent(row, cross)))
  out.push(...between(rows, crossAxis, extent(rects, main)))
  return out
}

const ARROWS = { x: ['→', '←'], y: ['↓', '↑'] } as const

function plain(rect: DOMRect): Rect {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
}

/** 노드의 자식 가운데 그려진 첫 요소 — 노드 요소 안에서 자식 id 로 찾는다(셀렉터에 id 를 끼우지 않는다 — `canvas.tsx` 의 `findNodeElement`). */
function firstChildElement(node: WbNode, element: Element): Element | null {
  const ids = new Set(
    (Array.isArray(node.children) ? node.children : [])
      .filter((child) => typeof child === 'object' && child !== null && typeof child.id === 'string')
      .map((child) => child.id),
  )
  if (ids.size === 0) return null
  for (const candidate of Array.from(element.querySelectorAll('[data-wb-id]'))) {
    if (ids.has(candidate.getAttribute('data-wb-id') ?? '')) return candidate
  }
  return null
}

/** 그 노드의 배치 선. Flex · Grid 가 아니면 `null`. `element` 는 그 노드의 그려진 요소, `view` 는 그 문서의 창이다. */
export function guideOf(node: WbNode, element: Element, view: Window): Guide | null {
  if (node.type !== 'Flex' && node.type !== 'Grid') return null
  const found = firstChildElement(node, element)
  // 배치 부모가 노드 요소 밖이면(자식을 `display: contents` 로만 감싼 뷰) 그 자식으로는 이 노드의 배치를 못 읽는다.
  const parent = found === null ? null : layoutParent(found, view)
  const child = parent !== null && element.contains(parent) ? found : null
  const container = child === null || parent === null ? element : parent
  const style = view.getComputedStyle(container)

  const rects = childRects(node, element)

  if (node.type === 'Flex') {
    if (child !== null) {
      const layout = axisOf(style, siblingRects(container, child, view), plain(child.getBoundingClientRect()))
      return { kind: 'flex', label: ARROWS[layout.axis][layout.reversed ? 1 : 0], lines: flexLines(rects, layout.axis) }
    }
    if (style.display === 'flex' || style.display === 'inline-flex') {
      const axis = style.flexDirection.startsWith('column') ? 'y' : 'x'
      return { kind: 'flex', label: ARROWS[axis][style.flexDirection.endsWith('-reverse') ? 1 : 0], lines: flexLines(rects, axis) }
    }
    const axis = node.props?.['direction'] === 'column' ? 'y' : 'x'
    return { kind: 'flex', label: ARROWS[axis][0], lines: flexLines(rects, axis) }
  }

  const lines = gridLines(rects)
  if (style.display === 'grid' || style.display === 'inline-grid') {
    const tracks = style.gridTemplateColumns.split(/\s+/).filter((track) => track !== '' && track !== 'none').length
    if (tracks > 0) return { kind: 'grid', label: `${tracks}열`, lines }
  }
  if (child !== null) {
    const rects = [plain(child.getBoundingClientRect()), ...siblingRects(container, child, view)]
    const top = Math.min(...rects.map((rect) => rect.top))
    const firstRow = rects.filter((rect) => rect.top < top + 1).length
    if (firstRow > 0) return { kind: 'grid', label: `${firstRow}열`, lines }
  }
  const columns = node.props?.['columns']
  return { kind: 'grid', label: `${typeof columns === 'number' ? columns : 2}열`, lines }
}
