/**
 * **덮개 층** — 뷰 모드 · HTML 번들에서 «팝업 열기»(`openModal`)가 연 팝업 문서를 연 화면 위에 덮개 + 가운데 상자로 쌓는다(정본 「상호작용」
 * 「실행」). 에디터 캔버스(`apps/web/src/canvas/canvas.tsx`)와 번들(`packages/exporter/src/browser/mount.tsx`)이 같은 층을 그린다 — 모양 ·
 * 키 처리 · 겹 쌓기가 어긋날 수 없게 렌더러에 둔다. 둘이 다른 것은 팝업 문서를 어디서 얻는가(에디터는 API · 번들은 페이지 데이터)뿐이다.
 *
 * | 무엇 | 규칙 |
 * |---|---|
 * | 덮개 | 연 화면 전체를 덮어 누름을 막는다. 덮개 누름으로는 닫지 않고 포커스도 안 옮긴다(앱의 대화 상자와 같다) |
 * | 상자 | 가운데 · 폭 `min(크기, 창 − 여백)` · 높이 창 − 여백까지 — 넘치면 몸통 조각만 굴린다(SDK 기본 CSS 의 `[data-wb-popup-layer]` 규칙) |
 * | 닫기 | ✖(뷰의 `close` 조각) · Escape(한글 조합 중은 빼고) · «팝업 닫기» 규칙(부른 쪽이 `pop`) — 늘 맨 위 하나 |
 * | 포커스 | 열면 맨 위 상자 안의 첫 포커스 받는 요소로 · Tab 은 그 상자 안을 돈다 · 닫으면 연 요소로 돌려준다 |
 * | 겹 | 다섯까지(`POPUP_DEPTH_MAX`) — 아래 겹은 `inert` 다 |
 * | 상호작용 | 팝업 문서마다 제 겹layer — 닫으면 사라지고 다시 열면 처음 판이다 |
 * | 화면 상태 | 팝업 문서마다 제 상태(처음엔 기본) — 그 팝업 안의 «화면 상태 바꾸기» 는 그 겹만 바꾸고 부른 쪽에 안 넘긴다(연 화면의 상태는 그대로). 겹layer 와 같은 수명 |
 *
 * 문서 · 테마 · 상태를 바꾸지 않는다 — 열린 목록은 부른 쪽이 들고(`usePopupStack`), 이 층은 그린다.
 */
import { DEFAULT_VIEW_STATE, type AnyDocument, type CodeIndex } from '@wirebound/schema'
import type { ThemeDefinition } from '@wirebound/theme-sdk'
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactElement } from 'react'
import { EMPTY_OVERLAY, type InteractionOverlay } from './interaction/runtime'
import { renderDocument, type InteractionEvent, type NodeRenderError } from './render'

/** 덮개 위에 열린 팝업 하나. */
export interface OpenPopup {
  /** 열 때마다 새로 짓는 열쇠 — 같은 팝업을 두 번 열어도 갈린다(겹layer 가 처음 판에서 선다). */
  key: string
  document: AnyDocument
  /** 닫으면 포커스를 돌려줄 요소(연 단추). 그 사이 사라졌으면 안 돌려준다. */
  opener: Element | null
  /** 그 문서의 그림 주소(`RenderOptions.assetUrl`). */
  assetUrl?: (id: string) => string | null
}

/** 겹 상한 — 서로를 여는 두 팝업이 끝없이 쌓이지 않게. */
export const POPUP_DEPTH_MAX = 5

export const POPUP_DEPTH_NOTICE = '팝업은 다섯 겹까지 엽니다'
/** «팝업 닫기» · ✖ 를 눌렀는데 덮개 위에 열린 팝업이 없다. */
export const NO_OPEN_POPUP = '열린 팝업이 없습니다'
/** 위와 같은데 그 화면이 팝업 페이지 자체다(메뉴 트리 · 목차에서 바로 열었다). */
export const NO_OPEN_POPUP_DIRECT = '열린 팝업이 없습니다 — 이 팝업 페이지를 바로 열었습니다'

/** 팝업 페이지의 문서인가 — 뿌리 타입이 `Popup` 이다. */
export function isPopupDocument(doc: AnyDocument | null | undefined): boolean {
  return (doc?.root as { type?: unknown } | undefined)?.type === 'Popup'
}

/** 누른 대상이 팝업 뿌리의 닫기 조각(✖) 안인가. 대상이 iframe 의 것이어도 `nodeType` 으로 본다. */
export function isPopupClose(target: EventTarget | null): boolean {
  const node = target as Node | null
  if (node === null || typeof node !== 'object' || !('nodeType' in node)) return false
  const element = node.nodeType === 1 ? (node as Element) : node.parentElement
  const close = element?.closest('[data-wb-part="close"]') ?? null
  if (close === null) return false
  return close.closest('[data-wb-id]')?.getAttribute('data-wb-component') === 'Popup'
}

/**
 * 요청을 낸 노드에서 닫힌 뒤 포커스를 돌려받을 요소 — 지금 포커스가 그 노드 안이면 그것, 아니면 그 노드 안의 첫 포커스 받는 요소, 없으면 노드
 * 뿌리. 노드가 그 문서에 없으면 `null`.
 *
 * **같은 노드 id 가 여럿일 수 있다** — 팝업이 자기를(또는 같은 팝업을) 다시 열면 겹마다 그 노드가 선다. 포커스를 든 것을 먼저 고르고, 없으면
 * `inert` 밖의 마지막 것(맨 위 겹 — 층은 문서 뒤에 겹을 쌓는다)을 고른다. 첫 것을 고르면 아래 겹의 단추를 적어 닫은 뒤 포커스가 갈 곳을 잃는다.
 */
export function popupOpener(doc: Document, sourceNodeId: string): Element | null {
  const found = Array.from(doc.querySelectorAll('[data-wb-id]')).filter((element) => element.getAttribute('data-wb-id') === sourceNodeId)
  if (found.length === 0) return null
  const active = doc.activeElement
  const holder = active === null ? undefined : found.find((element) => element.contains(active))
  if (holder !== undefined) return active
  const root = found.filter((element) => element.closest('[inert]') === null).at(-1) ?? found[found.length - 1]!
  if (root.matches(FOCUSABLE)) return root
  return root.querySelector(FOCUSABLE) ?? root
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** 덮개 층을 세울 구간 — 그 문서 좌표의 px. */
export interface PopupArea {
  top: number
  height: number
  left: number
  width: number
}

/** 열린 팝업 목록 — 부른 쪽이 든다. 쌓기 · 닫기는 렌더 밖(이벤트 핸들러)에서 부른다. */
export interface PopupStack {
  popups: readonly OpenPopup[]
  /** 맨 위에 쌓는다. 겹이 찼으면 쌓지 않고 `false`. */
  push: (popup: Omit<OpenPopup, 'key'>) => boolean
  /** 맨 위를 닫고 그 팝업을 연 요소로 포커스를 돌려준다(층이 그린 뒤). 열린 것이 없으면 `false`. */
  pop: () => boolean
  /** 모두 닫는다 — 모드 · 페이지를 옮길 때. 포커스는 돌려주지 않는다. */
  clear: () => void
  /** 다음 커밋 뒤 포커스를 돌려줄 요소 — `pop` 이 싣고 층이 비운다. 아래 겹은 `inert` 라 그것이 걷힌 뒤에야 받는다. */
  restore: { current: Element | null }
}

/** 열린 팝업 목록을 상태로 든다. */
export function usePopupStack(): PopupStack {
  const [popups, setPopups] = useState<readonly OpenPopup[]>(NO_POPUPS)
  // 이벤트 하나에서 열기 · 닫기가 이어질 수 있다(«닫고 다른 팝업 열기») — 렌더를 기다리지 않고 지금 목록을 읽는다.
  const live = useRef<readonly OpenPopup[]>(NO_POPUPS)
  const serial = useRef(0)
  const restore = useRef<Element | null>(null)
  const set = useCallback((next: readonly OpenPopup[]) => {
    live.current = next
    setPopups(next)
  }, [])
  const push = useCallback(
    (popup: Omit<OpenPopup, 'key'>) => {
      if (live.current.length >= POPUP_DEPTH_MAX) return false
      serial.current += 1
      restore.current = null
      set([...live.current, { ...popup, key: `popup-${serial.current}` }])
      return true
    },
    [set],
  )
  const pop = useCallback(() => {
    const top = live.current[live.current.length - 1]
    if (top === undefined) return false
    restore.current = top.opener
    set(live.current.slice(0, -1))
    return true
  }, [set])
  const clear = useCallback(() => {
    restore.current = null
    if (live.current.length > 0) set(NO_POPUPS)
  }, [set])
  return useMemo(() => ({ popups, push, pop, clear, restore }), [popups, push, pop, clear])
}

const NO_POPUPS: readonly OpenPopup[] = []

export interface PopupLayerProps {
  stack: PopupStack
  theme?: ThemeDefinition
  /** 팝업 문서 안의 상호작용 — 요청(열기 · 닫기 · 이동)과 말은 부른 쪽이 처리한다. 겹layer 는 이 층이 든다. */
  onEvent: (event: InteractionEvent, popup: OpenPopup) => void
  onNodeError?: (error: NodeRenderError) => void
  /**
   * 층을 세울 구간(그 문서 좌표의 px) — 에디터 캔버스는 iframe 이 문서 크기(높이 · 기기 폭)라 창 전체가 아니라 호스트에서 보이는 구간에 세운다.
   * 없으면 창 전체다.
   */
  area?: PopupArea
  /** 팝업 문서의 공통코드 표(`RenderOptions.codes`) — 연 화면과 같은 프로젝트의 표다. */
  codes?: CodeIndex
}

/** 열린 팝업을 그린다. 없으면 아무것도 안 그린다. */
export function PopupLayer(props: PopupLayerProps): ReactElement | null {
  const { stack } = props
  const { popups } = stack
  const onClose = stack.pop
  const layerRef = useRef<HTMLDivElement | null>(null)
  const [overlays, setOverlays] = useState<Readonly<Record<string, InteractionOverlay>>>({})
  /** 팝업 겹마다의 화면 상태(머리말 표) — 없으면 기본. */
  const [viewStates, setViewStates] = useState<Readonly<Record<string, string | null>>>({})
  const composing = useRef(false)
  const shown = useRef<readonly OpenPopup[]>(NO_POPUPS)

  /**
   * 맨 위가 바뀌면 포커스를 옮긴다 — 새로 열린 상자 안의 첫 포커스 받는 요소로, 닫혔으면(`pop`) 그 상자를 연 요소로. 모두 걷힌 판(`clear`)은
   * 돌려주지 않는다. 걷힌 팝업의 겹layer 를 버린다. 상자 뿌리에 `aria-modal` 을 단다 — 뷰는 안 단다(페이지로 연 판은 모달이 아니다).
   */
  useLayoutEffect(() => {
    const before = shown.current
    shown.current = popups
    const layer = layerRef.current
    for (const frame of Array.from(layer?.querySelectorAll('[data-wb-popup-frame]') ?? [])) {
      frame.querySelector(':scope > [data-wb-component="Popup"]')?.setAttribute('aria-modal', 'true')
    }
    const top = popups[popups.length - 1]
    if (top !== undefined && !before.includes(top) && layer !== null) {
      const frame = layer.querySelector(`[data-wb-popup-frame="${top.key}"]`)
      frame?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    } else {
      const opener = stack.restore.current as HTMLElement | null
      stack.restore.current = null
      if (opener !== null && opener.isConnected) opener.focus()
    }
    const closed = before.filter((popup) => !popups.includes(popup))
    if (closed.length > 0) {
      setOverlays((prev) => {
        const next = { ...prev }
        for (const popup of closed) delete next[popup.key]
        return next
      })
      setViewStates((prev) => {
        const next = { ...prev }
        for (const popup of closed) delete next[popup.key]
        return next
      })
    }
  }, [popups, stack])

  if (popups.length === 0) return null
  const topKey = popups[popups.length - 1]!.key

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      // 조합 중의 Escape 는 조합을 취소하는 키다 — 닫으면 친 글이 사라진다.
      if (event.nativeEvent.isComposing || composing.current) return
      event.preventDefault()
      onClose()
      return
    }
    if (event.key !== 'Tab') return
    const frame = layerRef.current?.querySelector(`[data-wb-popup-frame="${topKey}"]`)
    if (frame === null || frame === undefined) return
    const items = Array.from(frame.querySelectorAll<HTMLElement>(FOCUSABLE))
    const active = frame.ownerDocument.activeElement
    if (items.length === 0) {
      event.preventDefault()
      return
    }
    const first = items[0]!
    const last = items[items.length - 1]!
    if (active === null || !frame.contains(active)) {
      event.preventDefault()
      ;(event.shiftKey ? last : first).focus()
    } else if (event.shiftKey && active === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const onClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (!isPopupClose(event.target)) return
    const frame = layerRef.current?.querySelector(`[data-wb-popup-frame="${topKey}"]`)
    if (frame?.contains(event.target as Node) === true) onClose()
  }

  return (
    <div
      ref={layerRef}
      data-wb-popup-layer=""
      style={
        props.area === undefined
          ? undefined
          : {
              top: `${props.area.top}px`,
              height: `${props.area.height}px`,
              bottom: 'auto',
              left: `${props.area.left}px`,
              width: `${props.area.width}px`,
              right: 'auto',
            }
      }
      onKeyDown={onKeyDown}
      onClick={onClick}
      onCompositionStart={() => {
        composing.current = true
      }}
      onCompositionEnd={() => {
        composing.current = false
      }}
    >
      {popups.map((popup, index) => (
        <div key={popup.key} data-wb-popup-level={index + 1} inert={popup.key !== topKey}>
          {/* 덮개를 눌러도 포커스가 상자 밖으로 안 나간다 — 닫지도 않는다. */}
          <div data-wb-popup-backdrop="" aria-hidden="true" onMouseDown={(event) => event.preventDefault()} />
          <div data-wb-popup-frame={popup.key}>
            <PopupDocument
              popup={popup}
              theme={props.theme}
              codes={props.codes}
              overlay={overlays[popup.key] ?? EMPTY_OVERLAY}
              viewState={viewStates[popup.key] ?? null}
              onNodeError={props.onNodeError}
              onEvent={(event) => {
                setOverlays((prev) => (prev[popup.key] === event.overlay ? prev : { ...prev, [popup.key]: event.overlay }))
                // 이 겹의 상태 바꾸기는 여기서 끝난다 — 부른 쪽이 연 화면의 상태를 바꾸지 않게 요청에서 뺀다.
                const own = event.requests.filter((request) => request.type === 'setViewState')
                const last = own[own.length - 1]
                if (last !== undefined) {
                  const next = last.target === DEFAULT_VIEW_STATE ? null : last.target
                  setViewStates((prev) => (prev[popup.key] === next ? prev : { ...prev, [popup.key]: next }))
                }
                props.onEvent(
                  own.length === 0 ? event : { ...event, requests: event.requests.filter((request) => request.type !== 'setViewState') },
                  popup,
                )
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/** 팝업 문서 하나 — `renderDocument` 는 함수라 컴포넌트로 감싸 겹layer 가 바뀐 상자만 다시 그린다. */
function PopupDocument(props: {
  popup: OpenPopup
  theme: ThemeDefinition | undefined
  codes: CodeIndex | undefined
  overlay: InteractionOverlay
  viewState: string | null
  onEvent: (event: InteractionEvent) => void
  onNodeError: ((error: NodeRenderError) => void) | undefined
}): ReactElement {
  return renderDocument(props.popup.document, {
    viewState: props.viewState,
    ...(props.theme === undefined ? {} : { theme: props.theme }),
    ...(props.onNodeError === undefined ? {} : { onNodeError: props.onNodeError }),
    ...(props.popup.assetUrl === undefined ? {} : { assetUrl: props.popup.assetUrl }),
    ...(props.codes === undefined ? {} : { codes: props.codes }),
    interaction: { overlay: props.overlay, onEvent: props.onEvent },
  })
}
