/**
 * **배치 선** — 캔버스의 Flex · Grid 노드마다 점선 테두리와 모서리 표시(Flex → ↓ ← ↑ · Grid «N열»)를 셸 겹에 그린다(설계서 「설계서 화면 구조」
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
 * **못 재는 것:** 시스템 테마 다섯은 `direction` · `columns` 를 props 그대로 그린다(`build-test/layout-guides.test.ts` 의 `[배치 선]` 로그 —
 * 뷰포트 375 의 Grid 도 3열이다) — 그려진 배치로 읽는 길과 props 로 읽는 길이 그 판들에서 같은 글을 내어, props 만 읽게 바꾼 변이가 산다.
 * 그 둘이 갈리는 테마(`*-reverse` · 좁은 폭에서 접히는 Grid)가 서면 그 테마로 케이스를 세운다.
 */
import { useSyncExternalStore, type ReactElement } from 'react'
import type { WbNode } from '@wirebound/schema'
import { shellIcon } from '../shell/icons'
import { axisOf, layoutParent, siblingRects, type Rect } from './canvas-drop'

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

/** 노드 하나의 배치 선 — 종류와 모서리 글. */
export interface Guide {
  kind: 'flex' | 'grid'
  label: string
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

  if (node.type === 'Flex') {
    if (child !== null) {
      const layout = axisOf(style, siblingRects(container, child, view), plain(child.getBoundingClientRect()))
      return { kind: 'flex', label: ARROWS[layout.axis][layout.reversed ? 1 : 0] }
    }
    if (style.display === 'flex' || style.display === 'inline-flex') {
      const axis = style.flexDirection.startsWith('column') ? 'y' : 'x'
      return { kind: 'flex', label: ARROWS[axis][style.flexDirection.endsWith('-reverse') ? 1 : 0] }
    }
    return { kind: 'flex', label: node.props?.['direction'] === 'column' ? '↓' : '→' }
  }

  if (style.display === 'grid' || style.display === 'inline-grid') {
    const tracks = style.gridTemplateColumns.split(/\s+/).filter((track) => track !== '' && track !== 'none').length
    if (tracks > 0) return { kind: 'grid', label: `${tracks}열` }
  }
  if (child !== null) {
    const rects = [plain(child.getBoundingClientRect()), ...siblingRects(container, child, view)]
    const top = Math.min(...rects.map((rect) => rect.top))
    const firstRow = rects.filter((rect) => rect.top < top + 1).length
    if (firstRow > 0) return { kind: 'grid', label: `${firstRow}열` }
  }
  const columns = node.props?.['columns']
  return { kind: 'grid', label: `${typeof columns === 'number' ? columns : 2}열` }
}
