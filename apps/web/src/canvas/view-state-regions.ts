/**
 * **캔버스의 상태 영역 표지**(설계서 「설계서 화면 구조」 «화면 상태») — 편집 모드에서 상태 영역마다 얇은 테두리와 꼬리표를 단다. 배치 선처럼
 * 셸 겹(`canvas/canvas.tsx` 의 표면)에 그리고 문서에는 아무것도 넣지 않는다.
 *
 * | 지금 상태 · 영역 | 꼬리표 | 겹 |
 * |---|---|---|
 * | 기본 | «상태 영역 · 가지 N» | 테두리 |
 * | 기본이 아니고 그 상태의 가지가 있다 | «<상태> · 기본에서 다름» | 테두리 |
 * | 기본이 아니고 그 상태의 가지가 없다 | «<상태> · 기본과 같음» | 테두리 + 흐림(기본 가지를 흐리게 보인다 — 고치면 «복사 + 편집», `edit/view-state-fork.ts`) |
 *
 * **상자는 보이는 가지의 자식 요소들의 합이다** — `StateSwitch` · `StateCase` 는 렌더러의 투명 노드라 요소가 없다(K1 — 가지는 자식만 그린다).
 * 자식이 없는 가지(빈 가지)는 요소가 없어 상자를 못 잰다 — **«여기 비어 있음» 자리표**(`EMPTY_BRANCH_HEIGHT` 높이)를 영역이 들어갈 자리에 둔다: 영역 앞의 형제
 * 요소 바로 아래(없으면 영역을 품은 요소의 위)에 그 요소의 폭으로. 자리표는 셸 겹의 상자일 뿐 문서의 칸이 아니다(레이아웃을 안 민다). 보이는 가지만 센다 —
 * 숨은 가지 안의 영역은 그려지지 않으므로 표지도 자리표도 없다.
 *
 * **고른 영역 · 가지의 외곽선도 같은 상자다**(`regionBoxOf` — 캔버스의 고른 노드 외곽선이 요소가 없는 노드에 부른다).
 */
import { caseFor, DEFAULT_CASE, viewStateName, type PageDocument, type ViewState, type WbNode } from '@wirebound/schema'
import { focusElement } from '@wirebound/renderer'
import { walkSafely } from '../edit/safe-walk'

export interface RegionMark {
  switchId: string
  /** 캔버스 문서 좌표의 상자. */
  rect: { left: number; top: number; width: number; height: number }
  label: string
  /** 지금 상태의 가지가 없어 기본 가지를 흐리게 보이는가. */
  dimmed: boolean
  /** 보이는 가지에 자식이 없어 자리표 상자다(`rect` 는 자리표의 자리). */
  empty: boolean
}

/** 빈 가지의 자리표 높이(캔버스 문서 px). */
export const EMPTY_BRANCH_HEIGHT = 28

/** 자리표의 글. */
export const EMPTY_BRANCH_LABEL = '여기 비어 있음'

type Rect = RegionMark['rect']

export function regionLabel(viewStates: readonly ViewState[] | undefined, viewState: string | null, own: boolean, cases: number): string {
  if (viewState === null) return `상태 영역 · 가지 ${cases}`
  const name = viewStateName(viewStates, viewState)
  return own ? `${name} · 기본에서 다름` : `${name} · 기본과 같음`
}

/** 그 노드의 요소 상자(감쌀 요소는 뷰가 정한다). 요소가 없거나 0×0 이면 `null`. */
function boxOf(id: unknown, find: (id: string) => Element | null): DOMRect | null {
  if (typeof id !== 'string') return null
  const element = find(id)
  if (element === null) return null
  const rect = focusElement(element).getBoundingClientRect()
  return rect.width === 0 && rect.height === 0 ? null : rect
}

/** 상자들의 합. 비면 `null`. */
function unionOf(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null
  const left = Math.min(...rects.map((rect) => rect.left))
  const top = Math.min(...rects.map((rect) => rect.top))
  const right = Math.max(...rects.map((rect) => rect.left + rect.width))
  const bottom = Math.max(...rects.map((rect) => rect.top + rect.height))
  return { left, top, width: right - left, height: bottom - top }
}

/**
 * 그 노드가 지금 차지하는 자리 — 요소가 있으면 그 상자, 투명 노드(영역 · 가지)면 **보이는 가지**의 자식 자리의 합(영역이 다른 영역 · 가지의 자식일 때 안쪽
 * 그려진 것까지 잰다). 그려진 것이 없으면 `null`.
 */
function extentOf(node: unknown, viewState: string | null, find: (id: string) => Element | null): Rect | null {
  if (typeof node !== 'object' || node === null) return null
  const value = node as WbNode
  const own = boxOf(value.id, find)
  if (own !== null) return { left: own.left, top: own.top, width: own.width, height: own.height }
  if (value.type === 'StateSwitch') {
    let shown: WbNode | null
    try {
      shown = caseFor(value, viewState)
    } catch {
      shown = null
    }
    return shown === null ? null : extentOf(shown, viewState, find)
  }
  if (value.type !== 'StateCase') return null
  return childrenExtent(value, viewState, find)
}

/** 보이는 가지의 자식 자리의 합. 그려진 자식이 없으면 `null`. */
function childrenExtent(shown: WbNode, viewState: string | null, find: (id: string) => Element | null): Rect | null {
  const rects: Rect[] = []
  for (const child of Array.isArray(shown.children) ? shown.children : []) {
    const rect = extentOf(child, viewState, find)
    if (rect !== null) rects.push(rect)
  }
  return unionOf(rects)
}

/**
 * 빈 가지의 자리표 자리 — `chain` 은 뿌리부터 그 영역 바로 위까지의 노드들이다. 영역 앞의 형제 가운데 그려진 것의 아래에(그것을 품은 요소의 폭으로 — 형제가
 * 좁아도 줄 하나를 쓴다), 없으면 영역을 품은 요소의 위에 선다. 투명 노드(영역 · 가지)는 요소가 없어 한 겹씩 올라간다. 그려진 요소가 하나도 없으면 `null`.
 */
function emptyAnchor(switchNode: WbNode, chain: readonly WbNode[], viewState: string | null, find: (id: string) => Element | null): Rect | null {
  let below: WbNode = switchNode
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const container = chain[index]!
    const siblings = Array.isArray(container.children) ? container.children : []
    const position = siblings.indexOf(below)
    const held = boxOf(container.id, find)
    for (let before = position - 1; before >= 0; before -= 1) {
      const rect = extentOf(siblings[before], viewState, find)
      if (rect === null) continue
      const wide = held ?? rect
      return { left: wide.left, top: rect.top + rect.height, width: wide.width, height: EMPTY_BRANCH_HEIGHT }
    }
    if (held !== null) return { left: held.left, top: held.top, width: held.width, height: EMPTY_BRANCH_HEIGHT }
    below = container
  }
  return null
}

interface Entry {
  switchNode: WbNode
  shown: WbNode
  /** 뿌리부터 그 영역 바로 위까지 — 보이는 가지 · 영역도 든다. */
  chain: WbNode[]
}

/** 보이는 영역들 — 고르지 않은 가지 안으로는 들어가지 않는다. 노드 아닌 자식 · 던지는 가지는 건너뛴다. */
function visibleRegions(root: unknown, viewState: string | null): Entry[] {
  const out: Entry[] = []
  const visit = (node: unknown, chain: WbNode[]): void => {
    if (typeof node !== 'object' || node === null) return
    const value = node as WbNode
    const next = [...chain, value]
    if (value.type === 'StateSwitch') {
      let shown: WbNode | null
      try {
        shown = caseFor(value, viewState)
      } catch {
        shown = null
      }
      if (shown === null) return
      out.push({ switchNode: value, shown, chain })
      visit(shown, next)
      return
    }
    if (Array.isArray(value.children)) for (const child of value.children) visit(child, next)
  }
  visit(root, [])
  return out
}

/** 영역 하나의 상자 — 보이는 가지의 자식 합, 자식이 없으면 자리표. 둘 다 못 잡으면 `null`. */
function regionRect(entry: Entry, viewState: string | null, find: (id: string) => Element | null): { rect: Rect; empty: boolean } | null {
  const union = childrenExtent(entry.shown, viewState, find)
  if (union !== null) return { rect: union, empty: false }
  const anchor = emptyAnchor(entry.switchNode, entry.chain, viewState, find)
  return anchor === null ? null : { rect: anchor, empty: true }
}

/** 그린 문서(`rendered`)의 상태 영역마다 표지 — `find` 는 노드 id 로 그려진 요소를 찾는다(`canvas.tsx` 의 `findNodeElement`). */
export function regionMarks(rendered: PageDocument, viewState: string | null, find: (id: string) => Element | null): RegionMark[] {
  const out: RegionMark[] = []
  for (const entry of visibleRegions(rendered.root, viewState)) {
    const box = regionRect(entry, viewState, find)
    if (box === null) continue
    const { switchNode: node, shown } = entry
    const state = (shown.props as { state?: unknown } | undefined)?.state
    const own = viewState !== null && state === viewState
    const cases = Array.isArray(node.children) ? node.children.length : 0
    out.push({
      switchId: node.id,
      rect: box.rect,
      label: regionLabel(rendered.viewStates, viewState, own, cases),
      dimmed: viewState !== null && state === DEFAULT_CASE,
      empty: box.empty,
    })
  }
  return out
}

/**
 * **고른 영역(`StateSwitch`) · 가지(`StateCase`)의 외곽선 상자** — 둘은 요소가 없는 투명 노드라 `findNodeElement` 가 못 찾는다. 영역은 보이는 가지의 자식
 * 합(표지와 같은 상자 · 빈 가지면 자리표), 가지는 **지금 그려진 가지**일 때만 그 가지의 자식 합이다(그려지지 않은 가지는 외곽선이 없다 — 그릴 것이 없다).
 * 영역 · 가지가 아니거나 못 잰 판은 `null`.
 */
export function regionBoxOf(rendered: PageDocument, nodeId: string, viewState: string | null, find: (id: string) => Element | null): Rect | null {
  for (const entry of visibleRegions(rendered.root, viewState)) {
    if (entry.switchNode.id === nodeId || entry.shown.id === nodeId) return regionRect(entry, viewState, find)?.rect ?? null
  }
  return null
}
