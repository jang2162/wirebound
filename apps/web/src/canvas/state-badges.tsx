/**
 * **영역 표지** «상태에 따라 다름»(설계서 「설계서 화면 구조」 «화면 상태» — 읽기) — 뷰 모드에서 캔버스의 상태 영역(`StateSwitch`)마다 작은
 * 단추를 셸 겹에 단다. 누르면 그 영역의 가지 목록이 나오고, 고르면 지금 상태가 바뀐다(`shell/use-view-state.ts` — 머리 전환기 · 주소
 * `?state=` 가 같은 값을 따른다).
 *
 * - **서는 영역은 지금 상태에서 보이는 것뿐이다**(`visibleTree`) — 고르지 않은 가지 안의 영역은 그려지지 않아 자리가 없다.
 * - **영역은 그려진 가지의 자식 상자를 합친 상자다** — 영역 · 가지는 DOM 요소를 남기지 않는다(렌더러의 투명 노드). 자식이 다른 영역이면 그 안쪽 그려진 것까지 합친다(편집 모드 표지와 같은 함수 `childrenExtent`). 그 상자에 옅은 점선을
 *   두르고 표지를 상자의 왼쪽 위 **바깥**(상자 위에 붙은)에 둔다 — 편집 모드의 영역 꼬리표(`canvas/view-state-regions.ts`)와 같은 자리 · 모양이다.
 *   오른쪽에 두면 페이지가 캔버스 칸보다 넓은 판(뷰포트 1280 · 줌 100%)에서 화면 밖에 서 누를 수 없고, 안쪽에 두면 영역 첫 줄의 왼쪽 끝을 가린다. 그려진
 *   자식이 없는 영역(빈 가지)은 표지가 없다 — 머리 전환기로 고른다.
 * - **목록은 그 영역의 가지다** — 기본과 가지가 있는 상태만(목록에 없는 상태의 가지는 고를 수 없어 뺀다). 가지가 없는 상태를 고른
 *   판은 기본 가지를 그리므로 «기본»이 고른 항목이다(`caseFor`).
 * - 측정은 외곽선 · 마커 · 배치 선과 같은 때 다시 한다(`layoutKey` — `canvas.tsx`). 단추의 크기는 줌을 걷어 화면에서 늘 같다.
 */
import { useLayoutEffect, useMemo, useState, type ReactElement, type RefObject } from 'react'
import { DEFAULT_CASE, caseFor, viewStateName, visibleTree, type PageDocument, type WbNode } from '@wirebound/schema'
import { ActionMenu } from '../shell/action-menu'
import { ICONS } from '../shell/icons'
import { useViewState } from '../shell/use-view-state'
import { findNodeElement, frameOffset } from './canvas'
import type { CanvasFrame } from './canvas-iframe'
import { useTagStack } from './region-tag-stack'
import { childrenExtent } from './view-state-regions'

/** 표지의 보이는 글이자 접근 이름의 머리. */
export const STATE_BADGE_LABEL = '상태에 따라 다름'

interface Region {
  nodeId: string
  /** 표면 좌표의 상자. */
  left: number
  top: number
  width: number
  height: number
  node: WbNode
}

export function StateRegionBadges(props: {
  pageId: string
  doc: PageDocument
  frame: CanvasFrame | null
  surfaceRef: RefObject<HTMLElement | null>
  zoom: number
  /** 다시 잴 때마다 새 값(`canvas.tsx` 의 `layoutKey`). */
  layoutKey: object
}): ReactElement | null {
  const choice = useViewState(props.pageId)
  const [regions, setRegions] = useState<readonly Region[]>([])
  const { doc, frame, zoom, layoutKey } = props

  useLayoutEffect(() => {
    const surface = props.surfaceRef.current
    if (frame === null || surface === null) {
      setRegions((prev) => (prev.length === 0 ? prev : []))
      return
    }
    const offset = frameOffset(frame, surface, zoom)
    const originals = new Map<string, WbNode>()
    collectSwitches(doc.root, originals)
    const next: Region[] = []
    const visible = new Map<string, WbNode>()
    collectSwitches(visibleTree(doc, choice.state), visible)
    for (const id of visible.keys()) {
      const node = originals.get(id)
      const shown = node === undefined ? null : caseFor(node, choice.state)
      if (node === undefined || shown === null) continue
      const box = childrenExtent(shown, choice.state, (childId) => findNodeElement(frame.document, childId))
      if (box === null) continue
      next.push({ nodeId: id, left: offset.left + box.left, top: offset.top + box.top, width: box.width, height: box.height, node })
    }
    setRegions((prev) => (sameRegions(prev, next) ? prev : next))
  }, [doc, frame, zoom, layoutKey, choice.state, props.surfaceRef])

  // 영역이 영역의 직계 자식이면 표지가 같은 자리에 겹쳐 선다 — 깊이마다 한 줄씩 아래로 쌓는다(`./region-tag-stack.ts`).
  const anchors = useMemo(() => regions.map((region) => ({ id: region.nodeId, left: region.left, top: region.top })), [regions])
  const stack = useTagStack(anchors, zoom)

  if (regions.length === 0) return null
  return (
    <>
      {regions.map((region, index) => {
        const shown = caseFor(region.node, choice.state)
        return (
          <div
            key={region.nodeId}
            className="wb-shell-state-region"
            data-wb-state-region-for={region.nodeId}
            style={{ left: region.left, top: region.top, width: region.width, height: region.height }}
          >
            <div
              ref={stack.bind(region.nodeId)}
              className="wb-shell-state-badge"
              data-wb-state-badge-for={region.nodeId}
              style={{ transform: `scale(${1 / zoom})`, translate: stack.shift(region.nodeId) }}
            >
              <ActionMenu
                label={regions.length === 1 ? STATE_BADGE_LABEL : `${STATE_BADGE_LABEL} ${index + 1}`}
                icon={ICONS.viewStates}
                text={STATE_BADGE_LABEL}
                fullText
                tag
                compact
                items={(region.node.children ?? []).flatMap((child) => {
                  const state: unknown = child?.type === 'StateCase' ? child.props?.state : undefined
                  if (typeof state !== 'string') return []
                  if (state !== DEFAULT_CASE && !choice.viewStates.some((entry) => entry.id === state)) return []
                  return [
                    {
                      key: `case-${child.id}`,
                      label: viewStateName(choice.viewStates, state),
                      icon: ICONS.viewStates,
                      checked: shown === child,
                      onSelect: () => choice.choose(state === DEFAULT_CASE ? null : state),
                    },
                  ]
                })}
              />
            </div>
          </div>
        )
      })}
    </>
  )
}

/** 트리의 상태 영역 — id → 노드. 문서 차례로 먼저 온 것이 이긴다. 노드 아닌 자식은 건너뛴다. */
function collectSwitches(node: unknown, into: Map<string, WbNode>): void {
  if (node === null || typeof node !== 'object') return
  const value = node as WbNode
  if (value.type === 'StateSwitch' && typeof value.id === 'string' && !into.has(value.id)) into.set(value.id, value)
  if (Array.isArray(value.children)) for (const child of value.children) collectSwitches(child, into)
}

function sameRegions(a: readonly Region[], b: readonly Region[]): boolean {
  return (
    a.length === b.length &&
    a.every((item, index) => {
      const other = b[index]!
      return (
        item.nodeId === other.nodeId &&
        item.left === other.left &&
        item.top === other.top &&
        item.width === other.width &&
        item.height === other.height &&
        item.node === other.node
      )
    })
  )
}
