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
 * | 표시(`live`) | 보인 자리를 지금 문서로 다시 판정해 답이 `null` 이거나 다른 부모면 표시를 곧바로 걷는다 — 포인터가 멈춰 있어도 |
 * | 다음 물음(`onOver`) | 앞 물음이 보인 자리가 무너졌고(위와 같은 뜻) 포인터가 그 자리에서 문턱(`DRAG_THRESHOLD`) 안이면 `null` — 그 문턱 밖으로 나갈 때까지 |
 * | 놓는 순간(끌기 장치의 `sameDrop`) | 뗀 좌표로 다시 물은 답이 보인 답과 다른 부모면 놓지 않는다 — 판정은 `sameDrop`(`edit/structure-drop.ts`). 같은 부모면 뗀 좌표의 지금 자리로 놓는다 |
 * | 놓기(`onDrop`) | 놓는 자리의 대상 · 띠로 **지금 스토어 문서**에 다시 묻는다(`openDocumentNow`) — 답이 `null` 이면 편집 0 |
 *
 * **레이아웃만 밀리는 판은 앞 두 겹(`live` · 다음 물음)이 못 본다** — 남이 위 노드의 글을 늘리면(구조 그대로) 보인 자리를 다시 판정해도 «선다» 인데 그 노드는
 * 밑으로 밀려 포인터 밑에는 다른 것이 와 있다. 표시는 옛 좌표에 남고, 뗀 좌표로 다시 물은 답은 그 다른 것의 자리다
 * (`build-test/canvas-drop-review.test.ts` «bob 이 위 노드의 글을 길게 고쳐»). 그래서 놓는 순간 끌기 장치가 다시 물은 답을 보인 답과
 * 견주고(`use-pointer-drag.ts` 머리말 «놓는 답은 보인 답이다»), 캔버스가 다시 잴 때(`canvas/canvas-drag-handle.tsx` 의 `layoutKey`)
 * 마지막 좌표로 다시 물어 다른 부모면 표시를 걷고 같은 부모면 그 새 자리로 옮긴다 — 손잡이는 캔버스 안이라 그 값을 직접 받고, 캔버스의 형제인 컴포넌트 목록 카드는 이 층의
 * 영역 칸으로 받는다(`useCanvasRemeasured` — 캔버스가 `useAnnounceCanvasRemeasure` 로 알린다). **«문서가 바뀌면 버린다» 로 막지 않는다** — 남이 아무 데나 고칠 때마다 끄는 사람의 놓기가
 * 버려지고, 문서 밖의 원인(늦은 글꼴 · 그림)은 못 막는다.
 *
 * **둘째 겹(다음 물음)이 있는 까닭:** 끌기 장치는 뗄 때 뗀 좌표로 `onOver` 를 **다시 묻고** 그 답으로 `onDrop` 을 부른다(`use-pointer-drag.ts`
 * «뗌»). 보인 대상이 지워지면 그 좌표 밑에는 다른 것(바탕 = 페이지 끝 · 아래 형제)이 와 있어, 다시 물은 답이 **안 보인 자리**를 낸다 —
 * `onDrop` 의 다시 판정은 그 새 자리를 다시 물을 뿐이라 못 막는다(실브라우저: 빈 카드 위에서 bob 이 그 카드를 지우자 뗀 끌기가 노드를
 * 페이지 끝으로 보냈다 — `build-test/canvas-drop.test.ts` «bob 이 그 카드를 지우면»). 그래서 앞 물음의 자리가 무너진 뒤 포인터가 거의 안
 * 움직였으면 아무 자리도 내지 않는다. 그 자리에서 문턱 밖으로 움직이면 지금 문서로 새 자리를 세운다. 남의 다른
 * 편집이 보인 자리의 차례를 밀어도(앞에 형제를 넣음) 부모가 그대로면 버리지 않는다 — 차례는 지금 문서로 다시 판정해 따라간다
 * (`edit/structure-drop.ts` 의 `sameDrop` 머리말 — 넣은 칸이 포인터 밑으로 밀려 온 «안» 표시가 «그 칸 뒤» 로 옮겨 가는 판).
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
 * ## 배치 미리보기 — 보인 자리를 캔버스에 끼워 보인다
 *
 * 끄는 쪽(목록 카드 · 손잡이)은 보인 자리(`live(hint)`)를 `usePublishPlacementPreview` 로 싣고, 캔버스가 `usePlacementPreview` 로 받아 그
 * 자리에 미리보기를 끼운 문서를 그린다(`canvas/canvas-preview.ts`). 캔버스 위의 선 · 상자 강조는 미리보기가 대신한다 — 포인터가 트리 위면
 * 트리의 선 · 강조를 그대로 그리고 캔버스에도 같은 미리보기가 선다(`PlacementDrop` 의 `region`).
 *
 * ## 판정은 미리보기를 뺀 배치로
 *
 * 미리보기를 끼우면 옆 노드가 밀려 포인터 밑이 바뀐다. 그 배치로 다시 물으면 자리가 옮고, 옮은 미리보기가 다시 배치를 바꾸는 떨림이
 * 생긴다. 그래서 캔버스 판정(`canvasHitAt`)은 **미리보기를 숨긴 배치**로 잰다(`canvas/canvas-preview.ts` 의 `withoutPreview` — 숨김과 되돌림이
 * 한 동기 구간이라 그려지는 판이 없다). 판정이 미리보기에 기대지 않으므로 미리보기가 판정을 되먹일 길이 없다 — 캔버스가 다시 잴 때의 다시
 * 물음(`refresh`)도 떼는 순간의 다시 물음(`sameDrop`)도 미리보기를 끼우기 전과 같은 답을 내 «보인 자리 = 놓인 자리» 가 그대로 선다.
 *
 * 보이는 것과 판정이 어긋나지 않는 까닭: 미리보기는 늘 포인터 밑 노드 곁에 선다 — «N 뒤 · N 안» 이면 N 은 안 밀리고, «N 앞» 이면 미리보기가
 * N 의 자리를 차지해 포인터가 미리보기 위에 선다. 어긋나는 것은 포인터 밑이 아닌 노드(미리보기 뒤로 밀린 것)뿐이다.
 *
 * **고르지 않은 후보 — 그려진 배치(미리보기 포함)로 판정하고 미리보기 위면 보인 자리를 둔다:** 미리보기의 상자가 비운 자리보다 작으면
 * (얇은 구분선 · 형제 사이 여백) 포인터가 부모의 여백에 서서 다른 자리로 판정되고, 걷히면 배치가 돌아와 다시 서는 떨림이 난다(실브라우저 —
 * 카드 자식 앞에 구분선을 보인 채 1px 씩 흔들면 미리보기가 여섯 번 섰다 걷혔고 그대로 떼면 편집 0. 미리보기를 뺀 배치는 0 — 잰 판과 값은
 * `docs/superpowers/plans/2026-10-02-d4-report.md`).
 *
 * ## 트리 줄 끌기를 이 층으로 옮기지 않는다
 *
 * 옮기면 트리 줄을 캔버스에도 놓을 수 있다. 옮기지 않은 까닭: 트리 줄 끌기의 판(제자리 · 자손 · 잠긴 줄 · 끈 뒤 클릭 삼킴 — C 의 실브라우저
 * 판 `build-test/tree-drag*.test.ts`)이 이미 서 있고, 옮기면 그 판을 «캔버스로도 간다» 는 새 갈래와 함께 다시 재야 한다. 캔버스에서 옮기는
 * 길은 손잡이가 갖는다.
 *
 * ## 놓을 자리가 없는 까닭은 진단 줄에만 쓴다
 *
 * 끌기 진단(`./drag-debug.ts`)을 켜면 `onOver` 가 답이 바뀔 때마다 `over` 한 줄을 내고, 답이 `null` 이면 **왜** `null` 인지(`DropMiss`)를 함께
 * 적는다 — 이 층의 갈림(판이 바뀜 · 무너진 자리 · 캔버스 없음)과 그 밑의 `canvasHitAt` · `structureDropTarget` 이 `why` 로 알린 것 가운데 먼저
 * 온 것이다. 꺼진 판은 `why` 를 안 넘겨 아무것도 안 짓는다. 답 자체는 켜도 꺼도 같다.
 */
import {
  createContext,
  createElement,
  useContext,
  useLayoutEffect,
  useState,
  useSyncExternalStore,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react'
import type { PageDocument } from '@wirebound/schema'
import { canvasHitAt, COPY_DROP_REFUSAL, type CanvasHit, type HitNode, type Layout, type Point, type Rect } from '../canvas/canvas-drop'
import { isPreviewId, withoutPreview, type PlacementPreview } from '../canvas/canvas-preview'
import { createNode } from '../edit/create-node'
import { findNodeSafely } from '../edit/safe-walk'
import { acceptsChildren } from '../edit/structure-actions'
import {
  dropOps,
  dropRefusal,
  pageEndTarget,
  sameDrop,
  structureDropTarget,
  zoneDropRefusal,
  zoneDropTarget,
  type Placing,
  type StructureDrop,
} from '../edit/structure-drop'
import { useEditCommit } from '../edit/use-edit-commit'
import { structureTreeHint, structureTreeRefusal } from '../panels/structure-tree-hint'
import { openDocumentNow, useEditorStoreInstance, useOpenDocument } from '../store/use-editor-store'
import { useLockedBy } from '../store/use-locked-by'
import type { DropBand } from '../tree/tree-drop'
import { dragDebug, round, type DragDebug, type DropMiss } from './drag-debug'
import { hoverRow } from './hover-open'
import { DRAG_THRESHOLD, elementAt, scrollParent, type DragPoint, type DropHint } from './use-pointer-drag'

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
  /** 다시 물을 대상 — 노드 + 띠 · 빈 구역 칸(그 구역 끝 — `canvas/empty-zones.tsx`) · 페이지 끝. */
  over: { overId: string; band: DropBand } | { zoneOf: string; zone: string } | 'page-end'
  layout: Layout
  stage: Stage
  /** 어느 대상 위에서 선 자리인가 — 트리면 트리의 선 · 강조를 그리고, 캔버스면 미리보기가 대신한다(머리말 «배치 미리보기»). */
  region: 'tree' | 'canvas'
}

/** 한 끌기의 기억 — 선 판 · 앞 물음(좌표 · 그때 보인 자리) · 보인 자리가 무너진 좌표. */
interface Gesture {
  stage: Stage
  last: { point: DragPoint; shown: PlacementDrop | null } | null
  collapsedAt: DragPoint | null
  /** 마지막 물음이 못 놓은 까닭(받는 타입 · 설 자리) — 끌기 장치의 `refusal` 이 읽는다(`refusalOf`). */
  refusal: string | null
}

interface Regions {
  tree: () => HTMLElement | null
  canvas: () => CanvasRegion | null
}

/** 셸이 싣는 두 영역과 캔버스가 다시 잴 때 부를 것. 공급자 밖이면(최소 숙주 테스트) 다 없다. */
interface RegionSlots {
  tree: RefObject<HTMLElement | null> | null
  canvas: CanvasRegion | null
  remeasured: Set<() => void>
  /** 지금 끼워 보일 미리보기와 그것을 실은 쪽 · 받는 쪽(머리말 «배치 미리보기»). */
  preview: { value: PlacementPreview; owner: object } | null
  /** 지금 끄는 것과 그것을 실은 쪽 — 캔버스가 빈 구역 칸을 세운다(`canvas/empty-zones.tsx`). 받는 쪽은 미리보기와 같은 목록이다. */
  dragging: { value: Placing; owner: object } | null
  previewListeners: Set<() => void>
}

const RegionsContext = createContext<RegionSlots | null>(null)

/** 셸이 트리 · 캔버스를 함께 감싼다. 값은 바뀌어도 다시 그리지 않는 칸이다 — 읽는 것은 끄는 동안의 처리기다. */
export function PlacementRegionsProvider(props: { children: ReactNode }): ReactElement {
  const [slots] = useState<RegionSlots>(() => ({
    tree: null,
    canvas: null,
    remeasured: new Set(),
    preview: null,
    dragging: null,
    previewListeners: new Set(),
  }))
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

/**
 * 캔버스가 다시 잴 때마다(`canvas/canvas.tsx` 의 `layoutKey`) 구독한 것을 부른다 — 머리말 «레이아웃만 밀리는 판». 캔버스 밖에서 끄는
 * 쪽(컴포넌트 목록 카드)이 끌기 장치의 `refresh` 를 싣는다(`useCanvasRemeasured`).
 */
export function useAnnounceCanvasRemeasure(layoutKey: unknown): void {
  const slots = useContext(RegionsContext)
  useLayoutEffect(() => {
    if (slots === null) return
    for (const listener of [...slots.remeasured]) listener()
  }, [slots, layoutKey])
}

/** 캔버스가 다시 잴 때 `listener` 를 부른다(`useAnnounceCanvasRemeasure`). */
export function useCanvasRemeasured(listener: () => void): void {
  const slots = useContext(RegionsContext)
  useLayoutEffect(() => {
    if (slots === null) return
    slots.remeasured.add(listener)
    return () => {
      slots.remeasured.delete(listener)
    }
  }, [slots, listener])
}

/** 두 미리보기가 같은 판인가 — 같으면 다시 싣지 않는다(받는 캔버스가 다시 그리지 않게). */
function samePreview(a: PlacementPreview, b: PlacementPreview): boolean {
  const placing =
    a.placing.kind === 'new'
      ? b.placing.kind === 'new' && a.placing.type === b.placing.type && a.placing.preset === b.placing.preset
      : a.placing.kind === 'module'
        ? b.placing.kind === 'module' && a.placing.key === b.placing.key
        : b.placing.kind === 'node' && a.placing.id === b.placing.id
  return (
    placing &&
    a.target.parentId === b.target.parentId &&
    a.target.zone === b.target.zone &&
    a.target.index === b.target.index &&
    a.target.placement === b.target.placement &&
    a.axis === b.axis
  )
}

/**
 * 끄는 쪽이 보인 자리를 미리보기로 싣는다 — `null` 이면 걷는다. 내려가면 제가 실은 것만 걷는다(다른 끄는 쪽이 실은 것은 두다).
 */
export function usePublishPlacementPreview(drop: PlacementDrop | null): void {
  const slots = useContext(RegionsContext)
  const [owner] = useState(() => ({}))
  const value: PlacementPreview | null = drop === null ? null : { placing: drop.placing, target: drop.target, axis: drop.layout.axis }
  useLayoutEffect(() => {
    if (slots === null) return
    const now = slots.preview
    if (value === null) {
      if (now === null || now.owner !== owner) return
      slots.preview = null
    } else {
      if (now !== null && now.owner === owner && samePreview(now.value, value)) return
      slots.preview = { value, owner }
    }
    for (const listener of [...slots.previewListeners]) listener()
  })
  useLayoutEffect(
    () => () => {
      if (slots === null || slots.preview?.owner !== owner) return
      slots.preview = null
      for (const listener of [...slots.previewListeners]) listener()
    },
    [slots, owner],
  )
}

/**
 * 끄는 쪽이 지금 끄는 것을 싣는다 — `null` 이면 걷는다(끌기가 서기 전 · 끝난 뒤). 내려가면 제가 실은 것만 걷는다. 미리보기(`usePublishPlacementPreview`)와
 * 달리 놓을 자리가 안 서도 싣는다 — 빈 구역 칸은 끌기를 시작하면 서야 그 칸 위로 갈 수 있다(`canvas/empty-zones.tsx`).
 */
export function usePublishDragging(placing: Placing | null): void {
  const slots = useContext(RegionsContext)
  const [owner] = useState(() => ({}))
  useLayoutEffect(() => {
    if (slots === null) return
    const now = slots.dragging
    if (placing === null) {
      if (now === null || now.owner !== owner) return
      slots.dragging = null
    } else {
      if (now !== null && now.owner === owner && now.value === placing) return
      slots.dragging = { value: placing, owner }
    }
    for (const listener of [...slots.previewListeners]) listener()
  })
  useLayoutEffect(
    () => () => {
      if (slots === null || slots.dragging?.owner !== owner) return
      slots.dragging = null
      for (const listener of [...slots.previewListeners]) listener()
    },
    [slots, owner],
  )
}

/** 지금 끄는 것(`usePublishDragging`). 없거나 공급자 밖이면 `null`. */
export function useDragging(): Placing | null {
  const slots = useContext(RegionsContext)
  return useSyncExternalStore(
    (listener) => {
      if (slots === null) return () => {}
      slots.previewListeners.add(listener)
      return () => {
        slots.previewListeners.delete(listener)
      }
    },
    () => slots?.dragging?.value ?? null,
  )
}

/** 지금 끼워 보일 미리보기(머리말 «배치 미리보기»). 없거나 공급자 밖이면 `null`. */
export function usePlacementPreview(): PlacementPreview | null {
  const slots = useContext(RegionsContext)
  return useSyncExternalStore(
    (listener) => {
      if (slots === null) return () => {}
      slots.previewListeners.add(listener)
      return () => {
        slots.previewListeners.delete(listener)
      }
    },
    () => slots?.preview?.value ?? null,
  )
}

const VERTICAL: Layout = { axis: 'y', reversed: false }

/** `null` 의 까닭을 받는 것 — 진단을 켰을 때만 있다(머리말 «놓을 자리가 없는 까닭»). */
type Why = ((reason: DropMiss) => void) | undefined

/** `null` 을 내며 그 까닭을 알린다. */
function miss(why: Why, reason: DropMiss): null {
  why?.(reason)
  return null
}

/** 놓기가 편집 없이 끝났다 — `drop result=refused` 한 줄. 판정이 알린 까닭이 있으면 그것, 없으면 이 층의 갈림(`fallback`). */
function logRefused(debug: DragDebug | null, reason: DropMiss | null, fallback: DropMiss | 'commit-refused' | 'unknown'): void {
  debug?.line('drop', { result: 'refused', why: reason ?? fallback })
}

/** 놓을 자리의 답을 `over` 한 줄로 — 같은 답이면 다시 안 낸다(`DragDebug.over`). 좌표는 서명에 안 넣는다(매 프레임이 아니라 바뀔 때만). */
function logOver(debug: DragDebug, hint: DropHint<PlacementDrop> | null, reason: DropMiss | null, point: DragPoint): void {
  if (hint === null) {
    const why = reason ?? 'unknown'
    debug.over(`none:${why}`, { result: 'none', why, x: round(point.x), y: round(point.y) })
    return
  }
  const { region, target, over } = hint.value
  const overId = over === 'page-end' ? 'page-end' : 'zoneOf' in over ? `zone:${over.zoneOf}:${over.zone}` : over.overId
  const band = over === 'page-end' || 'zoneOf' in over ? undefined : over.band
  debug.over(`${region}:${target.parentId}:${target.index}:${target.placement}:${overId}:${band ?? ''}`, {
    result: region,
    parent: target.parentId,
    index: target.index,
    placement: target.placement,
    over: overId,
    band,
    x: round(point.x),
    y: round(point.y),
  })
}

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
  /** 그 끌기의 마지막 물음이 못 놓은 까닭(받는 타입 · 설 자리) — 없으면 `null`. 끌기 장치의 `refusal` 에 준다. */
  refusalOf: (placing: Placing) => string | null
}

export function usePlacementDrop(input: {
  projectId: string
  pageId: string | undefined
  /** 영역을 주입한다(테스트). 없으면 셸이 실은 것(`PlacementRegionsProvider`). */
  regions?: Regions
  /** 캔버스 판정을 주입한다(테스트 — jsdom 에 레이아웃이 없다). */
  canvasHit?: typeof canvasHitAt
  /**
   * 모듈 카드를 놓았다 — 넣을 노드를 다시 지은 뒤(서버에서 다시 읽기) 넣는 것은 부르는 쪽이다(`palette/module-tab.tsx`). `verdict` 는
   * 놓은 대상 · 띠를 **그때의 문서**로 다시 묻는 함수다 — 다시 짓는 사이 남이 고쳤을 수 있다(머리말 «보인 자리에만 놓는다»의 «놓기» 겹과 같은 물음).
   * 없으면 모듈 카드의 놓기는 편집 0 이다.
   */
  onModuleDrop?: (placing: Extract<Placing, { kind: 'module' }>, verdict: (doc: PageDocument) => StructureDrop | null) => void
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

  /** 대상 · 띠를 판정에 묻는다 — 표시 때와 놓을 때가 같은 길이다. `why` 는 진단 줄에만(머리말 «놓을 자리가 없는 까닭»). */
  const verdict = (doc: Parameters<typeof structureDropTarget>[0], placing: Placing, over: PlacementDrop['over'], why?: Why) =>
    over === 'page-end'
      ? pageEndTarget(doc, placing, store.editBlockedBy, why)
      : 'zoneOf' in over
        ? zoneDropTarget(doc, placing, over.zoneOf, over.zone, store.editBlockedBy, why)
        : structureDropTarget(doc, placing, over.overId, over.band, store.editBlockedBy, why)

  /** 판정이 `null` 을 낸 대상의 못 놓는 까닭(받는 타입 · 설 자리 — `fitRefusal`) — 없으면 `null`. */
  const refusalAt = (doc: PageDocument, placing: Placing, over: PlacementDrop['over']): string | null => {
    if (over === 'page-end') {
      const rootId: unknown = doc.root?.id
      return typeof rootId === 'string' ? dropRefusal(doc, placing, rootId, 'inside') : null
    }
    return 'zoneOf' in over ? zoneDropRefusal(doc, placing, over.zoneOf, over.zone) : dropRefusal(doc, placing, over.overId, over.band)
  }

  /** 보인 자리가 지금 문서 · 잠금에서도 같은 답인가(머리말 «보인 자리에만 놓는다»). */
  const holds = (shown: PlacementDrop): boolean => {
    if (document === null) return false
    const now = verdict(document, shown.placing, shown.over)
    return now !== null && sameDrop(now, shown.target)
  }

  const onOver = (placing: Placing, point: DragPoint): DropHint<PlacementDrop> | null => {
    const debug = dragDebug()
    if (debug === null) return overAt(placing, point, undefined)
    let reason: DropMiss | null = null
    const hint = overAt(placing, point, (next) => {
      reason ??= next
    })
    logOver(debug, hint, reason, point)
    return hint
  }

  const overAt = (placing: Placing, point: DragPoint, why: Why): DropHint<PlacementDrop> | null => {
    const now = stageNow()
    let gesture = gestures.get(placing)
    if (gesture === undefined) {
      gesture = { stage: now, last: null, collapsedAt: null, refusal: null }
      gestures.set(placing, gesture)
    }
    gesture.refusal = null
    if (!sameStage(gesture.stage, now)) return miss(why, 'stage-changed')
    const near = (at: DragPoint): boolean => Math.hypot(point.x - at.x, point.y - at.y) <= DRAG_THRESHOLD
    // 무너진 자리에서 문턱 밖으로 나가기 전에는 아무 자리도 내지 않는다 — 조금 움직였다 떼도(머리말 «둘째 겹»).
    if (gesture.collapsedAt !== null) {
      if (near(gesture.collapsedAt)) return miss(why, 'collapsed')
      gesture.collapsedAt = null
    }
    const last = gesture.last
    if (last !== null && last.shown !== null && near(last.point) && !holds(last.shown)) {
      gesture.collapsedAt = last.point
      gesture.last = null
      return miss(why, 'collapsed')
    }
    const hint = placeAt(placing, point, now, last?.shown ?? null, why, gesture)
    gesture.last = { point, shown: hint?.value ?? null }
    return hint
  }

  /** 보인 자리를 그대로 낸다 — 지금 문서로 다시 판정해 서면(숨긴 미리보기가 잡힌 판 — 머리말 «판정은 미리보기를 뺀 배치로»). */
  const keep = (shown: PlacementDrop | null, rect: Rect, now: Stage, why: Why): DropHint<PlacementDrop> | null => {
    if (shown === null || document === null || !sameStage(shown.stage, now)) return miss(why, 'preview-gone')
    const target = verdict(document, shown.placing, shown.over)
    if (target === null || !sameDrop(target, shown.target)) return miss(why, 'preview-gone')
    return { value: { ...shown, target }, rect, placement: target.placement }
  }

  const placeAt = (
    placing: Placing,
    point: DragPoint,
    now: Stage,
    shown: PlacementDrop | null,
    why: Why,
    gesture: Gesture,
  ): DropHint<PlacementDrop> | null => {
    if (document === null) return miss(why, 'no-document')

    const tree = regions.tree()
    // 접힌 줄 위에 머물면 편다(`./hover-open.ts`) — 트리 밖이면 잰 것을 걷는다.
    hoverRow(tree !== null && withinRegion(tree, point) ? elementAt(tree, '[data-tree-row]', point) : null)
    if (tree !== null && withinRegion(tree, point)) {
      const hit = structureTreeHint(tree, document, placing, point, store.editBlockedBy)
      if (hit === null) {
        gesture.refusal = structureTreeRefusal(tree, document, placing, point)
        return miss(why, 'tree-miss')
      }
      return {
        ...hit.hint,
        value: {
          placing,
          target: hit.hint.value,
          over: hit.over,
          layout: VERTICAL,
          stage: now,
          region: 'tree',
        },
      }
    }

    const canvas = regions.canvas()
    if (canvas === null) return miss(why, 'no-canvas')
    const clipElement = scrollParent(canvas.frame.frameElement as HTMLElement | null)
    const hit: CanvasHit | null = withoutPreview(canvas.frame.document as Document | undefined, () =>
      hitAt(
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
        isPreviewId,
        why,
      ),
    )
    if (hit === null) return null
    // 숨긴 미리보기는 안 잡힌다 — 그래도 잡히면(숨기기 전에 선 요소) 노드로 읽지 않고 보인 자리 그대로다.
    if ('preview' in hit) return keep(shown, hit.rect, now, why)
    // 되풀이 줄의 사본은 놓을 자리가 아니다(`canvas/canvas-drop.ts` 의 `canvasHitAt` 머리말 «되풀이 줄의 사본 위면»).
    if ('copy' in hit) {
      gesture.refusal = COPY_DROP_REFUSAL
      return miss(why, 'over-copy')
    }
    const over: PlacementDrop['over'] =
      'pageEnd' in hit
        ? 'page-end'
        : 'zone' in hit
          ? { zoneOf: hit.zone.parentId, zone: hit.zone.zone }
          : { overId: hit.overId, band: hit.band }
    const target = verdict(document, placing, over, why)
    if (target === null) {
      gesture.refusal = refusalAt(document, placing, over)
      return null
    }
    return {
      value: { placing, target, over, layout: hit.layout, stage: now, region: 'canvas' },
      rect: hit.rect,
      placement: target.placement,
    }
  }

  const onDrop = (placing: Placing, drop: PlacementDrop): void => {
    gestures.delete(placing)
    const debug = dragDebug()
    let reason: DropMiss | null = null
    const why: Why =
      debug === null
        ? undefined
        : (next) => {
            reason ??= next
          }
    if (input.pageId === undefined) return logRefused(debug, reason, 'no-document')
    if (!sameStage(drop.stage, stageNow())) return logRefused(debug, reason, 'stage-changed')
    if (placing.kind === 'module') {
      if (input.onModuleDrop === undefined) return logRefused(debug, reason, 'unknown')
      debug?.line('drop', { result: 'deferred', placing: `module:${placing.key}` })
      input.onModuleDrop(placing, (now) => verdict(now, placing, drop.over))
      return
    }
    const doc = openDocumentNow(store, input.pageId)
    if (doc === null) return logRefused(debug, reason, 'no-document')
    const target = verdict(doc, placing, drop.over, why)
    if (target === null) return logRefused(debug, reason, 'unknown')
    const node = placing.kind === 'new' ? createNode(placing.type, undefined, placing.preset) : null
    if (placing.kind === 'new' && node === null) return logRefused(debug, reason, 'unknown-type')
    const ops = dropOps(doc, placing, target, node ?? undefined)
    const committed = commitOps(ops)
    if (!committed) return logRefused(debug, reason, 'commit-refused')
    debug?.line('drop', {
      result: 'committed',
      parent: target.parentId,
      index: target.index,
      placing:
        placing.kind === 'new' ? `new:${placing.type}${placing.preset === undefined ? '' : `:${placing.preset}`}` : `node:${placing.id}`,
    })
    // 넣은 노드를 «방금 넣음» 으로 고른다 — 다음 넣기 단추가 그 뒤에 선다(`palette/palette-add.ts` 머리말 «연달아 넣기»).
    if (node !== null) store.selectPlaced([node.id])
  }

  const live = (hint: DropHint<PlacementDrop> | null): DropHint<PlacementDrop> | null =>
    hint !== null && sameStage(hint.value.stage, stageNow()) && holds(hint.value) ? hint : null

  const scrollContainerAt = (point: DragPoint): HTMLElement | null => {
    const tree = regions.tree()
    if (tree !== null && withinRegion(tree, point)) return scrollParent(tree)
    const canvas = regions.canvas()
    return canvas === null ? null : scrollParent(canvas.frame.frameElement as HTMLElement | null)
  }

  /** 그 끌기의 마지막 물음이 못 놓은 까닭 — 끌기 장치의 `refusal` 에 준다(`use-pointer-drag.ts` 의 `PointerDragOptions.refusal`). */
  const refusalOf = (placing: Placing): string | null => gestures.get(placing)?.refusal ?? null

  return { onOver, onDrop, live, sameDrop: (shown, landed) => sameDrop(shown.target, landed.target), scrollContainerAt, refusalOf }
}
