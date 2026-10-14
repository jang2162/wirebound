/**
 * **겹치는 영역 표지를 깊이마다 한 줄씩 아래로 쌓는다**(뷰 모드 «상태에 따라 다름» 표지 `state-badges.tsx` · 편집 모드 꼬리표 `canvas.tsx`).
 *
 * 영역이 영역의 직계 자식이면 두 영역의 상자가 같아 표지가 같은 자리에 선다 — DOM 차례상 안쪽이 위라 바깥 표지는 눌리지 않았다. 표지는 상자 위 바깥에 붙으므로
 * **바깥을 그대로 두고 안쪽을 한 줄 아래로** 내린다(안쪽 표지가 상자 안 첫 줄로 들어간다). 셋이면 0 · 1 · 2 줄이다.
 *
 * - **겹침은 그린 표지 상자끼리 잰다**(`stackLevels`) — 상자 구조(직계 자식)가 아니라 자리다. 영역 상자가 위로 몇 px 어긋나도 표지 줄이 겹치면 내리고, 형제 영역처럼 겹치지
 *   않으면 0 줄이라 자리가 그대로다.
 * - **차례는 영역의 문서 차례(바깥이 먼저)다** — 먼저 온 표지가 자리를 갖고, 나중 표지가 겹치면 비는 줄까지 한 줄씩 내려간다.
 * - **폭 · 높이는 그린 요소에서 잰다**(`useTagStack`) — 글 길이를 짐작하지 않는다. 쌓는 단위는 표지 높이이고 줌을 걷은 값이다(표지는 `scale(1 / zoom)` 이라 화면에서
 *   늘 같은 크기다).
 * - 못 다루는 것: 표지 줄이 영역 상자를 넘어 아래로 나가는 판(바깥이 표지 한 줄보다 낮다)은 그대로 둔다 — 안쪽 표지가 바깥 상자 밖(그 아래 노드 위)에 선다.
 */
import { useCallback, useLayoutEffect, useRef, useState } from 'react'

export interface TagAnchor {
  id: string
  /** 표면 좌표 — 표지가 매달리는 상자의 왼쪽 · 위. */
  left: number
  top: number
}

export interface TagSize {
  /** 표면 좌표 크기(줌을 걷은 값). */
  width: number
  height: number
}

/** 같은 줄로 겹친다고 보지 않는 오차(px). 맞닿기만 한 줄은 겹침이 아니다. */
const EPSILON = 0.01

/**
 * 표지마다 내릴 줄 수 — `anchors` 의 차례대로 먼저 온 표지의 자리를 지키며 겹치지 않는 가장 위 줄을 고른다. 크기를 못 잰 표지(`sizes` 에 없다)는 0 줄이고 남의 자리도
 * 안 막는다.
 */
export function stackLevels(anchors: readonly TagAnchor[], sizes: ReadonlyMap<string, TagSize>): Map<string, number> {
  const levels = new Map<string, number>()
  const placed: { left: number; top: number; right: number; bottom: number }[] = []
  const step = Math.max(0, ...[...sizes.values()].map((size) => size.height))
  for (const anchor of anchors) {
    const size = sizes.get(anchor.id)
    if (size === undefined || size.width <= 0 || size.height <= 0) {
      levels.set(anchor.id, 0)
      continue
    }
    for (let level = 0; level <= anchors.length; level += 1) {
      const top = anchor.top - size.height + level * step
      const rect = { left: anchor.left, top, right: anchor.left + size.width, bottom: top + size.height }
      const clash = placed.some(
        (other) =>
          Math.min(rect.right, other.right) - Math.max(rect.left, other.left) > EPSILON &&
          Math.min(rect.bottom, other.bottom) - Math.max(rect.top, other.top) > EPSILON,
      )
      if (!clash || level === anchors.length) {
        levels.set(anchor.id, level)
        placed.push(rect)
        break
      }
    }
  }
  return levels
}

/** 내릴 거리 — 표지 높이(줌을 걷은 값)의 `level` 배. 표지의 `translate` 에 그대로 쓴다. 안 내리면 `undefined`. */
export type TagShift = (id: string) => string | undefined

interface Stacked {
  levels: ReadonlyMap<string, number>
  /** 한 줄의 높이(표면 좌표) — 잰 표지 높이의 최댓값. */
  step: number
}

const NONE: Stacked = { levels: new Map(), step: 0 }

function sameStacked(a: Stacked, b: Stacked): boolean {
  return a.step === b.step && a.levels.size === b.levels.size && [...a.levels].every(([id, level]) => b.levels.get(id) === level)
}

/**
 * 그린 표지들의 크기를 재 줄을 정한다. `bind(id)` 를 표지 요소의 `ref` 에 걸고, `shift(id)` 를 그 요소의 `translate` 에 준다. `anchors` 는 바뀔 때만 새 값이어야 한다
 * (`useMemo`) — 다시 잴 때마다 새 배열이면 매 렌더에 잰다.
 */
export function useTagStack(
  anchors: readonly TagAnchor[],
  zoom: number,
): { bind: (id: string) => (element: HTMLElement | null) => void; shift: TagShift } {
  const elements = useRef(new Map<string, HTMLElement>())
  const [stacked, setStacked] = useState<Stacked>(NONE)

  const bind = useCallback(
    (id: string) => (element: HTMLElement | null) => {
      if (element === null) elements.current.delete(id)
      else elements.current.set(id, element)
    },
    [],
  )

  useLayoutEffect(() => {
    const sizes = new Map<string, TagSize>()
    for (const anchor of anchors) {
      const element = elements.current.get(anchor.id)
      if (element !== undefined) sizes.set(anchor.id, { width: element.offsetWidth / zoom, height: element.offsetHeight / zoom })
    }
    const next: Stacked = { levels: stackLevels(anchors, sizes), step: Math.max(0, ...[...sizes.values()].map((size) => size.height)) }
    setStacked((prev) => (sameStacked(prev, next) ? prev : next))
  }, [anchors, zoom])

  const shift: TagShift = (id) => {
    const level = stacked.levels.get(id) ?? 0
    return level === 0 ? undefined : `0 ${level * stacked.step}px`
  }
  return { bind, shift }
}
