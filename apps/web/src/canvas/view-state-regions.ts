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
 * 자식이 없는 가지(빈 가지)의 영역은 그릴 상자가 없어 표지가 안 선다. 숨은 가지 안의 영역은 그 안 요소가 그려지지 않아 저절로 빠진다.
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
}

export function regionLabel(viewStates: readonly ViewState[] | undefined, viewState: string | null, own: boolean, cases: number): string {
  if (viewState === null) return `상태 영역 · 가지 ${cases}`
  const name = viewStateName(viewStates, viewState)
  return own ? `${name} · 기본에서 다름` : `${name} · 기본과 같음`
}

/** 그린 문서(`rendered`)의 상태 영역마다 표지 — `find` 는 노드 id 로 그려진 요소를 찾는다(`canvas.tsx` 의 `findNodeElement`). */
export function regionMarks(rendered: PageDocument, viewState: string | null, find: (id: string) => Element | null): RegionMark[] {
  const out: RegionMark[] = []
  for (const visit of walkSafely(rendered.root)) {
    const node = visit.node as WbNode
    if (node.type !== 'StateSwitch') continue
    let shown: WbNode | null
    try {
      shown = caseFor(node, viewState)
    } catch {
      shown = null
    }
    if (shown === null) continue
    const children = Array.isArray(shown.children) ? shown.children : []
    let left = Infinity
    let top = Infinity
    let right = -Infinity
    let bottom = -Infinity
    for (const child of children) {
      if (typeof child !== 'object' || child === null || typeof child.id !== 'string') continue
      const element = find(child.id)
      if (element === null) continue
      const rect = focusElement(element).getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) continue
      left = Math.min(left, rect.left)
      top = Math.min(top, rect.top)
      right = Math.max(right, rect.right)
      bottom = Math.max(bottom, rect.bottom)
    }
    if (left === Infinity) continue
    const state = (shown.props as { state?: unknown } | undefined)?.state
    const own = viewState !== null && state === viewState
    const cases = Array.isArray(node.children) ? node.children.length : 0
    out.push({
      switchId: node.id,
      rect: { left, top, width: right - left, height: bottom - top },
      label: regionLabel(rendered.viewStates, viewState, own, cases),
      dimmed: viewState !== null && state === DEFAULT_CASE,
    })
  }
  return out
}
