/**
 * **목업을 브라우저에서 그린다** — 번들 페이지의 `.wb-export-canvas` 에 캔버스 미리보기와 같은 렌더러로.
 *
 * 캔버스(`apps/web/src/canvas/canvas.tsx`)와 같은 셋을 쓴다: `renderDocument`(테마 뷰 → 기본 뷰) · 상호작용 런타임(`interaction` —
 * 겹layer를 상태로 두고 `onEvent` 로 받은 것을 다시 그린다) · 마커 자리(`markerPoint`). 다른 것은 셸의 말뿐이다 — 캔버스는 이동 요청을
 * 알리기만 하지만 번들은 그 페이지 파일로 옮긴다.
 *
 * `boot.tsx` 가 페이지 JSON 으로 이것을 부르고, 케이스(jsdom)는 같은 함수를 곧바로 부른다 — 번들과 케이스가 한 진입을 지난다.
 */
import {
  EMPTY_OVERLAY,
  markerPoint,
  renderDocument,
  type InteractionEvent,
  type InteractionOverlay,
  type NodeRenderError,
} from '@wirebound/renderer'
import { childLists, type PageDocument, type WbNode } from '@wirebound/schema'
import { ThemeProvider, type ThemeDefinition } from '@wirebound/theme-sdk'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import type { ExportMarker } from '../page-data'

export interface ExportMountInput {
  document: PageDocument
  /** 그릴 정의. 번들이 없거나 실패했으면 `NO_THEME`(기본 뷰). */
  theme: ThemeDefinition
  /** `useToken` 의 값 — `tokenValues(manifest, tokens)`. */
  tokens: Record<string, string | number>
  /** 문서가 그려지는 창(`useWindow()`). */
  window: Window
  /** 타겟 → 이 파일에서 본 상대 경로(`ExportPageData.hrefs`). */
  hrefs: Readonly<Record<string, string | null>>
  markers: readonly ExportMarker[]
  /** 그림 id → 이 파일에서 본 상대 경로(`ExportPageData.images`). 없으면 그림이 없는 문서다 — 그림 든 자리표시자는 «그림을 불러올 수 없음» 이다. */
  images?: Readonly<Record<string, string>>
  /** 말할 자리(셸의 `.wb-export-status`). 없으면 말하지 않는다. */
  status: Element | null
  /** 늘 머리에 서는 줄 — 번들을 못 쓴 까닭 따위. 조작마다 비우지 않는다. */
  standing?: readonly string[]
  /** 링크로 옮긴다. 기본은 `window.location.href`. */
  navigate?: (href: string) => void
  /** 처음 그릴 화면 상태(`RenderOptions.viewState`). 없거나 목록 밖이면 기본이다. */
  viewState?: string | null
}

export interface ExportMount {
  /** 첫 커밋이 끝났다. 그 커밋에서 뷰가 던진 노드(`data-wb-error` 인데 구조 오류가 아닌 것)의 id 를 든다. */
  thrown: string[]
  /** 구조 오류(`onNodeError`) — 기본 뷰로도 못 그린 노드. */
  errors: NodeRenderError[]
  /** 마커 자리를 다시 잰다(시트 · 글꼴이 실린 뒤). */
  remeasure(): void
  /** 늘 머리에 서는 줄을 바꾼다(`ExportMountInput.standing`). */
  say(lines: readonly string[]): void
  /** 고른 화면 상태로 다시 그린다 — 상태 전환기 · 주소 해시가 부른다(`boot.tsx`). */
  setViewState(viewState: string | null): void
  unmount(): void
}

/** 규칙에 액션이 하나도 없을 때의 말 — 눌렀는데 아무 일도 없으면 문서 탓인지 도구 탓인지 못 가른다. */
export const EMPTY_RULE = '이 규칙에는 실행할 액션이 없습니다'

/** 타겟을 든 페이지가 번들에 없다. */
export function missingPage(target: string): string {
  return `이 번들에 없는 페이지입니다: ${target}`
}

/** 타겟을 든 페이지가 둘 이상이다 — 조용히 첫 페이지로 가지 않는다. */
export function ambiguousPage(target: string): string {
  return `이 타겟을 가리키는 페이지가 번들에 둘 이상입니다: ${target}`
}

/**
 * `container` 에 문서를 그린다. **첫 커밋을 동기로 끝내고 돌아온다**(`flushSync`) — 부른 쪽이 곧바로 DOM 을 읽고 준비 신호를 잇는다.
 */
export function mountExportDocument(container: Element, input: ExportMountInput): ExportMount {
  const root = createRoot(container)
  const errors: NodeRenderError[] = []
  const handle: CanvasHandle = { remeasure: () => {}, say: () => {}, setViewState: () => {} }
  flushSync(() => {
    root.render(
      <ThemeProvider value={{ tokens: input.tokens, window: input.window }}>
        <ExportCanvas input={input} container={container} errors={errors} handle={handle} />
      </ThemeProvider>,
    )
  })
  const structural = new Set(errors.map((error) => error.nodeId))
  const thrown: string[] = []
  for (const element of Array.from(container.querySelectorAll('[data-wb-error]'))) {
    const id = element.getAttribute('data-wb-id') ?? ''
    if (!structural.has(id) && !thrown.includes(id)) thrown.push(id)
  }
  return {
    thrown,
    errors: [...errors],
    remeasure: () => flushSync(() => handle.remeasure()),
    say: (lines) => flushSync(() => handle.say(lines)),
    setViewState: (viewState) => flushSync(() => handle.setViewState(viewState)),
    unmount: () => root.unmount(),
  }
}

/** 컴포넌트가 채우는 손잡이 — 마운트 밖에서 상태를 바꾼다. */
interface CanvasHandle {
  remeasure: () => void
  say: (lines: readonly string[]) => void
  setViewState: (viewState: string | null) => void
}

interface MarkerBox {
  nodeId: string
  marker: string
  left: number
  top: number
}

function ExportCanvas(props: {
  input: ExportMountInput
  container: Element
  errors: NodeRenderError[]
  handle: CanvasHandle
}): ReactElement {
  const { input, container } = props
  const [overlay, setOverlay] = useState<InteractionOverlay>(EMPTY_OVERLAY)
  const [standing, setStanding] = useState<readonly string[]>(input.standing ?? [])
  const [notices, setNotices] = useState<string[]>([])
  const [markers, setMarkers] = useState<MarkerBox[]>([])
  const [measureTick, setMeasureTick] = useState(0)
  const [viewState, setViewState] = useState<string | null>(input.viewState ?? null)
  /** 이번 조작에서 이미 옮겨 가기로 했나 — 한 조작에 링크가 여럿이면 첫 것만 간다. */
  const leaving = useRef(false)

  const nodes = useMemo(() => nodeIndex(input.document.root as WbNode), [input.document])

  /**
   * **알림은 «마지막 조작이 만든 것» 이다** — 조작이 시작될 때 비우고 그 조작 동안 일어난 것을 쌓는다(캔버스의 `beginGesture` 와 같은
   * 규칙). 캡처 단계의 리스너가 노드의 핸들러보다 먼저 돈다. 규칙이 없는 자리를 눌러도 비워진다 — 안 비우면 방금 누른 것이 실패한
   * 줄로 읽힌다.
   */
  useEffect(() => {
    const begin = (): void => {
      leaving.current = false
      setNotices((prev) => (prev.length === 0 ? prev : []))
    }
    const kinds = ['click', 'change', 'submit'] as const
    for (const kind of kinds) container.addEventListener(kind, begin, true)
    return () => {
      for (const kind of kinds) container.removeEventListener(kind, begin, true)
    }
  }, [container])

  const onEvent = useCallback(
    (event: InteractionEvent) => {
      setOverlay(event.overlay)
      const added: string[] = []
      for (const issue of event.issues) added.push(issue.message)
      for (const request of event.requests) {
        const href = input.hrefs[request.target]
        if (typeof href === 'string') {
          if (!leaving.current) {
            leaving.current = true
            ;(input.navigate ?? ((to: string) => input.window.location.assign(to)))(href)
          }
        } else {
          added.push(href === null ? ambiguousPage(request.target) : missingPage(request.target))
        }
      }
      if (event.issues.length === 0 && event.requests.length === 0 && actionsOf(nodes.get(event.nodeId), event.trigger) === 0) {
        added.push(EMPTY_RULE)
      }
      if (added.length > 0) setNotices((prev) => [...prev, ...added])
    },
    [input, nodes],
  )

  const errors = props.errors
  errors.length = 0
  const tree = renderDocument(input.document, {
    theme: input.theme,
    onNodeError: (error) => errors.push(error),
    interaction: { overlay, onEvent },
    viewState,
    assetUrl: (id) => input.images?.[id] ?? null,
  })

  // 셸의 상태 줄. 빈 목록이면 줄을 감춘다 — 빈 상자가 남으면 목업이 밀린다.
  const lines = useMemo(() => [...standing, ...notices], [standing, notices])
  useLayoutEffect(() => {
    const status = input.status
    if (status === null) return
    status.textContent = ''
    for (const line of lines) {
      const item = status.ownerDocument.createElement('p')
      item.className = 'wb-export-status-line'
      item.textContent = line
      status.appendChild(item)
    }
    if (lines.length === 0) status.setAttribute('hidden', '')
    else status.removeAttribute('hidden')
  }, [input.status, lines])

  props.handle.remeasure = () => setMeasureTick((tick) => tick + 1)
  props.handle.say = (next) => setStanding([...next])
  /** 상태를 바꾸는 것도 조작이다 — 앞 조작의 알림을 비운다(위 «알림은 마지막 조작이 만든 것»). */
  props.handle.setViewState = (next) => {
    setViewState(next)
    setNotices((prev) => (prev.length === 0 ? prev : []))
  }

  /**
   * 마커 자리. **그린 뒤에 잰다** — 좌표는 브라우저가 그려야 생긴다. 자리는 렌더러의 `markerPoint`(에디터 캔버스 · PPTX 와 같은 함수)이고,
   * 기준은 캔버스의 안쪽 상자(마커 겹layer가 `inset: 0` 으로 거기 선다). 숨겨진 노드 · 그리지 못한 노드에는 마커가 없다.
   * 겹layer(상호작용) · 알림 줄 · 화면 상태 · 크기 바뀜 · 시트와 글꼴이 실린 뒤(`remeasure`)에 다시 잰다. 고른 상태에서 안 그려진
   * 가지의 노드는 요소가 없어 마커도 없다.
   */
  useLayoutEffect(() => {
    const base = container.getBoundingClientRect()
    const next: MarkerBox[] = []
    const drawn = new Set<string>()
    for (const { nodeId, marker } of input.markers) {
      if (drawn.has(nodeId)) continue
      const target = findNode(container, nodeId)
      if (target === null) continue
      drawn.add(nodeId)
      const point = markerPoint(target)
      next.push({ nodeId, marker, left: point.x - base.left - container.clientLeft, top: point.y - base.top - container.clientTop })
    }
    setMarkers((prev) => (sameMarkers(prev, next) ? prev : next))
  }, [container, input.markers, overlay, lines, viewState, measureTick])

  useEffect(() => {
    const win = input.window
    const onResize = (): void => setMeasureTick((tick) => tick + 1)
    win.addEventListener('resize', onResize)
    return () => win.removeEventListener('resize', onResize)
  }, [input.window])

  return (
    <>
      {tree}
      {markers.length > 0 && (
        <div className="wb-export-markers" aria-hidden="true">
          {markers.map((box) => (
            <span
              key={box.nodeId}
              className="wb-export-marker"
              data-wb-marker-for={box.nodeId}
              title={`코멘트 ${box.marker}번`}
              style={{ left: `${box.left}px`, top: `${box.top}px` }}
            >
              {box.marker}
            </span>
          ))}
        </div>
      )}
    </>
  )
}

/** 캔버스 안에서 그 노드의 요소. 마커 겹layer의 배지도 `data-wb-marker-for` 를 들 뿐 `data-wb-id` 는 없어 섞이지 않는다. */
function findNode(container: Element, nodeId: string): Element | null {
  for (const element of Array.from(container.querySelectorAll('[data-wb-id]'))) {
    if (element.getAttribute('data-wb-id') === nodeId) return element
  }
  return null
}

function sameMarkers(a: readonly MarkerBox[], b: readonly MarkerBox[]): boolean {
  return (
    a.length === b.length &&
    a.every((box, index) => {
      const other = b[index]!
      return box.nodeId === other.nodeId && box.marker === other.marker && box.left === other.left && box.top === other.top
    })
  )
}

/** id → 노드. 문서 순서로 먼저 온 것이 이긴다. 노드 아닌 자식은 건너뛴다. 자식 줄은 몸통 · 구역 전부다(`childLists`). */
function nodeIndex(root: WbNode): Map<string, WbNode> {
  const found = new Map<string, WbNode>()
  const visit = (node: unknown): void => {
    if (typeof node !== 'object' || node === null) return
    const value = node as WbNode
    if (typeof value.id === 'string' && !found.has(value.id)) found.set(value.id, value)
    for (const { list } of childLists(value)) for (const child of list) visit(child)
  }
  visit(root)
  return found
}

/** 그 노드에서 그 트리거에 걸린 규칙들의 액션 수. */
function actionsOf(node: WbNode | undefined, trigger: string): number {
  let count = 0
  for (const interaction of node?.interactions ?? []) {
    if (interaction?.on === trigger) count += Array.isArray(interaction.actions) ? interaction.actions.length : 0
  }
  return count
}
