/**
 * **경로 층** — 한 끌기가 구조 트리 · 캔버스 두 대상 위를 지나므로 «포인터 밑이 어느 대상인가» 를 고르고, 고른 대상의 판정을 같은 함수
 * (`edit/structure-drop.ts`)로 잇는다(spec `docs/superpowers/specs/2026-10-01-component-drag-design.md` 「부품 경계」). 끌기 장치
 * (`./use-pointer-drag.ts`)의 `onOver` · `onDrop` 이 이것이다 — 캔버스 손잡이(`canvas/canvas-drag-handle.tsx`)와 컴포넌트 목록 카드가 쓴다.
 *
 * | 포인터 | 판정 |
 * |---|---|
 * | 트리 영역 안(그 영역의 스크롤 상자로 자른 상자) | 트리 줄의 띠(`panels/structure-tree-hint.ts`) — 줄 밖이면 `null`, 캔버스로 넘어가지 않는다 |
 * | 캔버스 칸 안 | `canvas/canvas-drop.ts` 의 `canvasHitAt` → 대상 + 띠면 `structureDropTarget`, 페이지 끝이면 `pageEndTarget` |
 * | 둘 다 아님 | `null` |
 *
 * 트리 줄 끌기(`panels/structure-tree.tsx`)는 이 층을 지나지 않는다 — 머리말 «트리 줄 끌기» 가 그 판단이다.
 *
 * ## 보인 자리에만 놓는다 — 끄는 사이 그 자리가 바뀌면 버린다
 *
 * 끄는 사이 남이 대상을 지우거나 잡았거나 내 앞 편집이 거절돼 문서가 리베이스됐을 수 있다. 막는 겹이 넷이다.
 *
 * | 겹 | 무엇 |
 * |---|---|
 * | 표시(`live`) | 보인 자리를 지금 문서로 다시 판정해 답이 달라졌으면 표시를 곧바로 걷는다 — 포인터가 멈춰 있어도 |
 * | 다음 물음(`onOver`) | 앞 물음이 보인 자리가 달라졌고 포인터가 그 자리에서 문턱(`DRAG_THRESHOLD`) 안이면 `null` — 그 문턱 밖으로 나갈 때까지 |
 * | 놓는 순간(끌기 장치의 `sameDrop`) | 뗀 좌표로 다시 물은 답이 보인 답과 다른 자리면 놓지 않는다 — 판정은 `sameDrop`(`edit/structure-drop.ts`) |
 * | 놓기(`onDrop`) | 놓는 자리의 대상 · 띠로 **지금 스토어 문서**에 다시 묻는다(`openDocumentNow`) — 답이 `null` 이면 편집 0 |
 *
 * **레이아웃만 밀리는 판은 앞 두 겹(`live` · 다음 물음)이 못 본다** — 남이 위 노드의 글을 늘리면(구조 그대로) 보인 자리를 다시 판정해도 «선다» 인데 그 노드는
 * 밑으로 밀려 포인터 밑에는 다른 것이 와 있다. 표시는 옛 좌표에 남고, 뗀 좌표로 다시 물은 답은 그 다른 것의 자리다
 * (`build-test/canvas-drop-review.test.ts` «bob 이 위 노드의 글을 길게 고쳐»). 그래서 놓는 순간 끌기 장치가 다시 물은 답을 보인 답과
 * 견주고(`use-pointer-drag.ts` 머리말 «놓는 답은 보인 답이다»), 캔버스가 다시 잴 때(`canvas/canvas-drag-handle.tsx` 의 `layoutKey`)
 * 마지막 좌표로 다시 물어 다르면 표시를 걷는다. **«문서가 바뀌면 버린다» 로 막지 않는다** — 남이 아무 데나 고칠 때마다 끄는 사람의 놓기가
 * 버려지고, 문서 밖의 원인(늦은 글꼴 · 그림)은 못 막는다.
 *
 * **둘째 겹(다음 물음)이 있는 까닭:** 끌기 장치는 뗄 때 뗀 좌표로 `onOver` 를 **다시 묻고** 그 답으로 `onDrop` 을 부른다(`use-pointer-drag.ts`
 * «뗌»). 보인 대상이 지워지면 그 좌표 밑에는 다른 것(바탕 = 페이지 끝 · 아래 형제)이 와 있어, 다시 물은 답이 **안 보인 자리**를 낸다 —
 * `onDrop` 의 다시 판정은 그 새 자리를 다시 물을 뿐이라 못 막는다(실브라우저: 빈 카드 위에서 bob 이 그 카드를 지우자 뗀 끌기가 노드를
 * 페이지 끝으로 보냈다 — `build-test/canvas-drop.test.ts` «bob 이 그 카드를 지우면»). 그래서 앞 물음의 자리가 무너진 뒤 포인터가 거의 안
 * 움직였으면 아무 자리도 내지 않는다. 그 자리에서 문턱 밖으로 움직이면 지금 문서로 새 자리를 세운다. 남의 다른
 * 편집이 보인 자리의 차례를 밀어도(앞에 형제를 넣음) 같은 길로 버린다 — 보인 것과 다른 차례로 넣지 않는다.
 *
 * 서버도 잠금은 423 으로 막지만 그 길은 «보냈다가 되돌림» 이라 화면이 한 번 튀고, 지움 · 차례 밀림은 서버가 막지 않는다.
 *
 * ## 끄는 사이 판이 바뀌면 끌기를 버린다
 *
 * 끄는 중 페이지가 바뀌거나 캔버스 iframe 이 새로 서면 그 끌기의 자리는 뜻이 없다(노드 id 의 유효 범위 · 좌표의 기준이 바뀌었다).
 * 끌기 장치를 손대지 않고 이 층이 가른다 — 끌기마다 **처음 물은 때의 판**(`Stage` — 페이지 id · 캔버스 창)을 적어 두고, 그 뒤의
 * `onOver` 가 다른 판에서 불리면 `null`, `onDrop` 이 다른 판에서 불리면 편집 0 이다. 표시는 그리는 쪽이 `live(hint)` 로 거른다 — 포인터가
 * 멈춰 있으면 `onOver` 가 안 불려 장치의 표시가 옛 자리에 남는다.
 *
 * **판 · 앞 물음은 끄는 것(`Placing`) 객체로 단다.** 끌기 장치는 누른 순간의 `source` 를 그 끌기 내내 같은 객체로 넘긴다(`bind(source)` 의 닫힘).
 * 다음 끌기가 같은 객체를 받는 것은 그 사이 부르는 쪽이 다시 그려지지 않았을 때뿐이고, 판이 바뀌면 이 훅이 스토어 구독으로 다시
 * 그려져 부르는 쪽도 새 객체를 묶는다.
 *
 * ## 트리 줄 끌기를 이 층으로 옮기지 않는다
 *
 * 옮기면 트리 줄을 캔버스에도 놓을 수 있다. 옮기지 않은 까닭: 트리 줄 끌기의 판(제자리 · 자손 · 잠긴 줄 · 끈 뒤 클릭 삼킴 — C 의 실브라우저
 * 판 `build-test/tree-drag*.test.ts`)이 이미 서 있고, 옮기면 그 판을 «캔버스로도 간다» 는 새 갈래와 함께 다시 재야 한다. 캔버스에서 옮기는
 * 길은 손잡이가 갖는다.
 */
import {
  createContext,
  createElement,
  useContext,
  useLayoutEffect,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react'
import { canvasHitAt, type CanvasHit, type HitNode, type Layout, type Point, type Rect } from '../canvas/canvas-drop'
import { createNode } from '../edit/create-node'
import { findNodeSafely } from '../edit/safe-walk'
import { acceptsChildren } from '../edit/structure-actions'
import { dropOps, pageEndTarget, sameDrop, structureDropTarget, type Placing, type StructureDrop } from '../edit/structure-drop'
import { useEditCommit } from '../edit/use-edit-commit'
import { structureTreeHint } from '../panels/structure-tree-hint'
import { openDocumentNow, useEditorStoreInstance, useOpenDocument } from '../store/use-editor-store'
import { useLockedBy } from '../store/use-locked-by'
import type { DropZone } from '../tree/tree-drop'
import { DRAG_THRESHOLD, scrollParent, type DragPoint, type DropHint } from './use-pointer-drag'

/** 캔버스 칸 — 문서를 그리는 iframe 의 창과 지금 줌. */
export interface CanvasRegion {
  frame: Window
  zoom: number
}

/** 끌기가 선 판(머리말 «끄는 사이 판이 바뀌면»). */
interface Stage {
  pageId: string | undefined
  frame: Window | null
}

/** 놓을 자리 — 무엇을 · 표시에 쓴 자리 · 다시 물을 대상 · 표시의 축 · 끌기가 선 판. */
export interface PlacementDrop {
  placing: Placing
  target: StructureDrop
  over: { overId: string; zone: DropZone } | 'page-end'
  layout: Layout
  stage: Stage
}

/** 한 끌기의 기억 — 선 판 · 앞 물음(좌표 · 그때 보인 자리) · 보인 자리가 무너진 좌표. */
interface Gesture {
  stage: Stage
  last: { point: DragPoint; shown: PlacementDrop | null } | null
  collapsedAt: DragPoint | null
}

interface Regions {
  tree: () => HTMLElement | null
  canvas: () => CanvasRegion | null
}

/** 셸이 싣는 두 영역. 공급자 밖이면(최소 숙주 테스트) 둘 다 없다. */
interface RegionSlots {
  tree: RefObject<HTMLElement | null> | null
  canvas: CanvasRegion | null
}

const RegionsContext = createContext<RegionSlots | null>(null)

/** 셸이 트리 · 캔버스를 함께 감싼다. 값은 바뀌어도 다시 그리지 않는 칸이다 — 읽는 것은 끄는 동안의 처리기다. */
export function PlacementRegionsProvider(props: { children: ReactNode }): ReactElement {
  const [slots] = useState<RegionSlots>(() => ({ tree: null, canvas: null }))
  return createElement(RegionsContext.Provider, { value: slots }, props.children)
}

/** 구조 트리가 줄을 담는 상자를 싣는다. */
export function usePublishTreeRegion(ref: RefObject<HTMLElement | null>): void {
  const slots = useContext(RegionsContext)
  useLayoutEffect(() => {
    if (slots === null) return
    slots.tree = ref
    return () => {
      if (slots.tree === ref) slots.tree = null
    }
  }, [slots, ref])
}

/** 캔버스가 지금 iframe 창 · 줌을 싣는다. 내려가면 거둔다. */
export function usePublishCanvasRegion(frame: Window | null, zoom: number): void {
  const slots = useContext(RegionsContext)
  useLayoutEffect(() => {
    if (slots === null || frame === null) return
    const region = { frame, zoom }
    slots.canvas = region
    return () => {
      if (slots.canvas === region) slots.canvas = null
    }
  }, [slots, frame, zoom])
}

const VERTICAL: Layout = { axis: 'y', reversed: false }

/** 상자 안인가 — 스크롤 상자가 있으면 그것으로 자른다(밀려난 줄은 다른 칸 밑에 깔려 있다). */
function withinRegion(element: HTMLElement, point: DragPoint): boolean {
  const boxes = [element.getBoundingClientRect()]
  const scroller = scrollParent(element)
  if (scroller !== null) boxes.push(scroller.getBoundingClientRect())
  return boxes.every((box) => point.x >= box.left && point.x < box.right && point.y >= box.top && point.y < box.bottom)
}

function rectOf(element: HTMLElement): Rect {
  const box = element.getBoundingClientRect()
  return { left: box.left, top: box.top, width: box.width, height: box.height }
}

export interface Placement {
  onOver: (placing: Placing, point: DragPoint) => DropHint<PlacementDrop> | null
  onDrop: (placing: Placing, drop: PlacementDrop) => void
  /** 그 표시가 지금 판의 것이고 그 자리가 지금도 서면 그대로, 아니면 `null` — 표시를 그리는 쪽이 거른다(머리말). */
  live: (hint: DropHint<PlacementDrop> | null) => DropHint<PlacementDrop> | null
  /** 두 자리가 같은가 — 끌기 장치의 `sameDrop` 에 준다(머리말 «놓는 순간»). */
  sameDrop: (shown: PlacementDrop, landed: PlacementDrop) => boolean
  /**
   * 그 좌표에서 끝 스크롤할 상자 — 트리 영역 안이면 트리의 스크롤 상자, 아니면 캔버스 칸. 끌기 장치의 `scrollContainer` 는 좌표를 안 받으므로
   * 부르는 쪽이 마지막 좌표를 들고 묻는다(컴포넌트 목록 카드 — 한 끌기가 두 대상 위를 지난다).
   */
  scrollContainerAt: (point: DragPoint) => HTMLElement | null
}

export function usePlacementDrop(input: {
  projectId: string
  pageId: string | undefined
  /** 영역을 주입한다(테스트). 없으면 셸이 실은 것(`PlacementRegionsProvider`). */
  regions?: Regions
  /** 캔버스 판정을 주입한다(테스트 — jsdom 에 레이아웃이 없다). */
  canvasHit?: typeof canvasHitAt
}): Placement {
  const store = useEditorStoreInstance()
  const document = useOpenDocument(input.pageId)
  const { commitOps } = useEditCommit({ projectId: input.projectId, pageId: input.pageId ?? '' })
  const slots = useContext(RegionsContext)
  const regions: Regions = input.regions ?? {
    tree: () => slots?.tree?.current ?? null,
    canvas: () => slots?.canvas ?? null,
  }
  const hitAt = input.canvasHit ?? canvasHitAt
  const [gestures] = useState(() => new WeakMap<Placing, Gesture>())
  // 잠금이 바뀌면 다시 그린다 — 보인 자리의 판정(`live`)이 잠금을 본다. 판정은 스토어의 `editBlockedBy` 다.
  useLockedBy()

  const stageNow = (): Stage => ({ pageId: input.pageId, frame: regions.canvas()?.frame ?? null })
  const sameStage = (a: Stage, b: Stage): boolean => a.pageId === b.pageId && a.frame === b.frame

  /** 대상 · 띠를 판정에 묻는다 — 표시 때와 놓을 때가 같은 길이다. */
  const verdict = (doc: Parameters<typeof structureDropTarget>[0], placing: Placing, over: PlacementDrop['over']) =>
    over === 'page-end'
      ? pageEndTarget(doc, placing, store.editBlockedBy)
      : structureDropTarget(doc, placing, over.overId, over.zone, store.editBlockedBy)

  /** 보인 자리가 지금 문서 · 잠금에서도 같은 답인가(머리말 «보인 자리에만 놓는다»). */
  const holds = (shown: PlacementDrop): boolean => {
    if (document === null) return false
    const now = verdict(document, shown.placing, shown.over)
    return now !== null && sameDrop(now, shown.target)
  }

  const onOver = (placing: Placing, point: DragPoint): DropHint<PlacementDrop> | null => {
    const now = stageNow()
    let gesture = gestures.get(placing)
    if (gesture === undefined) {
      gesture = { stage: now, last: null, collapsedAt: null }
      gestures.set(placing, gesture)
    }
    if (!sameStage(gesture.stage, now)) return null
    const near = (at: DragPoint): boolean => Math.hypot(point.x - at.x, point.y - at.y) <= DRAG_THRESHOLD
    // 무너진 자리에서 문턱 밖으로 나가기 전에는 아무 자리도 내지 않는다 — 조금 움직였다 떼도(머리말 «둘째 겹»).
    if (gesture.collapsedAt !== null) {
      if (near(gesture.collapsedAt)) return null
      gesture.collapsedAt = null
    }
    const last = gesture.last
    if (last !== null && last.shown !== null && near(last.point) && !holds(last.shown)) {
      gesture.collapsedAt = last.point
      gesture.last = null
      return null
    }
    const hint = placeAt(placing, point, now)
    gesture.last = { point, shown: hint?.value ?? null }
    return hint
  }

  const placeAt = (placing: Placing, point: DragPoint, now: Stage): DropHint<PlacementDrop> | null => {
    if (document === null) return null

    const tree = regions.tree()
    if (tree !== null && withinRegion(tree, point)) {
      const hit = structureTreeHint(tree, document, placing, point, store.editBlockedBy)
      if (hit === null) return null
      return {
        ...hit.hint,
        value: { placing, target: hit.hint.value, over: { overId: hit.overId, zone: hit.zone }, layout: VERTICAL, stage: now },
      }
    }

    const canvas = regions.canvas()
    if (canvas === null) return null
    const clipElement = scrollParent(canvas.frame.frameElement as HTMLElement | null)
    const hit: CanvasHit | null = hitAt(
      canvas.frame,
      canvas.zoom,
      point as Point,
      (id): HitNode | null => {
        const node = findNodeSafely(document.root, id)
        if (node === undefined) return null
        return {
          root: document.root?.id === id,
          acceptsChildren: acceptsChildren(node),
          empty: !Array.isArray(node.children) || node.children.length === 0,
        }
      },
      clipElement === null ? null : rectOf(clipElement),
    )
    if (hit === null) return null
    const over: PlacementDrop['over'] = 'pageEnd' in hit ? 'page-end' : { overId: hit.overId, zone: hit.zone }
    const target = verdict(document, placing, over)
    if (target === null) return null
    return { value: { placing, target, over, layout: hit.layout, stage: now }, rect: hit.rect, placement: target.placement }
  }

  const onDrop = (placing: Placing, drop: PlacementDrop): void => {
    gestures.delete(placing)
    if (input.pageId === undefined || !sameStage(drop.stage, stageNow())) return
    const doc = openDocumentNow(store, input.pageId)
    if (doc === null) return
    const target = verdict(doc, placing, drop.over)
    if (target === null) return
    const node = placing.kind === 'new' ? createNode(placing.type) : null
    if (placing.kind === 'new' && node === null) return
    const ops = dropOps(doc, placing, target, node ?? undefined)
    if (commitOps(ops) && node !== null) store.selectNode(node.id)
  }

  const live = (hint: DropHint<PlacementDrop> | null): DropHint<PlacementDrop> | null =>
    hint !== null && sameStage(hint.value.stage, stageNow()) && holds(hint.value) ? hint : null

  const scrollContainerAt = (point: DragPoint): HTMLElement | null => {
    const tree = regions.tree()
    if (tree !== null && withinRegion(tree, point)) return scrollParent(tree)
    const canvas = regions.canvas()
    return canvas === null ? null : scrollParent(canvas.frame.frameElement as HTMLElement | null)
  }

  return { onOver, onDrop, live, sameDrop: (shown, landed) => sameDrop(shown.target, landed.target), scrollContainerAt }
}
