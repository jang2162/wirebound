/**
 * **캔버스 사각형 고르기**(설계서 「설계서 화면 구조」의 «고르는 법»). 캔버스 문서에서 누르고 `DRAG_THRESHOLD`(4px) 넘게 움직이면 사각형이
 * 선다 — 캔버스에서 노드를 눌러 끄는 동작이 없으므로 어디서 시작해도 된다(노드를 옮기는 길은 손잡이 하나 — 손잡이 · 카드 끌기는 호스트
 * 문서에서 시작해 이 리스너에 안 닿는다). 떼면 그려진 상자가 사각형 안에 **완전히** 든 노드 가운데 가장 바깥 것들을 고른다(`./canvas-marquee.ts`
 * 의 `nodesInRect`) — Shift 를 누른 채 떼면 더한다. 4px 안에서 떼면 아무것도 안 한다 — 지금 클릭(고르기)이 그대로 돈다.
 *
 * - **누름은 두 자리에서 받는다 — 캔버스 문서와 캔버스 칸의 빈 자리**(`.wb-shell-canvas` · 판 · 표면 — 문서 바깥 여백). 호스트에 건 리스너는
 *   iframe 안의 누름을 못 받고(`canvas-document.tsx`), 캔버스 문서 안에서만 시작하면 문서 폭을 다 차는 노드(블록 글 · 카드)를 **완전히**
 *   감쌀 수 없다 — 그 노드의 왼끝이 문서의 왼끝이라 그보다 왼쪽에서 누를 자리가 문서 안에 없다(Chrome: 1280 폭 문서의 글 상자가 x 0 에서 시작).
 *   칸의 빈 자리만 시작점이다 — 손잡이 · 번호 마커 · 통지 같은 셸 겹의 요소에서 누른 것은 아니다. 사각형이 선 뒤에는 누른 요소가 포인터를
 *   붙잡아(`setPointerCapture`) 그 문서 밖으로 나가도 움직임이 온다.
 * - **끝 스크롤은 끌어 놓기와 같은 셈**(`drag/use-pointer-drag.ts` 의 `edgeScrollStep`)이다 — 칸이 굴러도 누른 점은 문서 좌표로 붙잡혀 있고,
 *   지금 점은 틱마다 마지막 호스트 점을 그 순간의 iframe 자리로 옮긴다(`./canvas-marquee.ts` 머리말 «좌표 셋»). 휠로 굴려도 같다.
 * - **뗀 뒤의 클릭은 삼킨다** — 사각형이 선 누름의 클릭이 그 밑 노드 하나를 고르거나(캔버스 문서) 선택을 비우면(칸의 빈 자리 — 표면의
 *   `onClick`) 방금 고른 것이 사라진다(`swallowNextClick` — 누름이 난 창).
 * - **Escape 는 사각형을 걷는다** — 고르지 않고, 선택 해제도 아니다(capture 로 받아 막는다 — 단축키의 선택 해제는 막힌 키를 안 본다).
 * - **글자 고르기를 걷는다** — 사각형이 서면 그 누름이 만든 글자 선택을 지운다. 누를 때는 안 건드린다(포커스 · 캐럿은 E1 의 단축키 · 클립보드가 본다).
 */
import { useEffect, useRef, useState } from 'react'
import { focusElement } from '@wirebound/renderer'
import type { WbNode } from '@wirebound/schema'
import { DRAG_THRESHOLD, EDGE_SCROLL_TICK, edgeScrollStep, scrollParent, swallowNextClick } from '../drag/use-pointer-drag'
import { walkSafely } from '../edit/safe-walk'
import type { CanvasFrame } from './canvas-iframe'
import { hostToDocument, nodesInRect, rectBetween, toSurfaceRect, type Box, type MarqueeNode, type Point } from './canvas-marquee'

export interface CanvasMarqueeInput {
  frame: CanvasFrame | null
  /** 셸 겹 — 사각형을 그리는 표면. 끝 스크롤할 칸은 그 스크롤 조상이다. */
  surface: () => HTMLElement | null
  zoom: number
  /** 편집 모드일 때만 선다(뷰 모드는 선택을 안 바꾼다 — `canvas.tsx` 의 표면 `onClick`). */
  enabled: boolean
  /** 지금 그린 문서의 뿌리 — 부모를 읽는다. */
  root: () => WbNode | null
  /** 뗐다 — 고를 노드(문서 차례)와 더하기(Shift)인가. */
  onPick: (nodeIds: string[], add: boolean) => void
}

/** 그리는 동안의 사각형(표면 좌표). 없으면 `null`. */
export function useCanvasMarquee(input: CanvasMarqueeInput): Box | null {
  const [shown, setShown] = useState<Box | null>(null)
  const latest = useRef(input)
  latest.current = input
  const { frame, enabled } = input

  useEffect(() => {
    if (frame === null || !enabled) return
    const doc = frame.document
    const win = frame.window
    interface Gesture {
      pointerId: number
      target: Element
      /** 누름이 난 자리 — 캔버스 문서(`frame`)인가 칸의 빈 자리(`host`)인가. 움직임 · 뗌은 그 문서에서 받는다. */
      source: 'frame' | 'host'
      /** 누른 점 — 문서 좌표. */
      start: Point
      /** 누른 점 — 호스트 좌표(문턱을 화면 거리로 잰다). */
      pressedHost: Point
      /** 마지막 포인터 — 호스트 좌표. */
      lastHost: Point
      started: boolean
      cancelled: boolean
      timer: ReturnType<typeof setInterval> | null
    }
    let gesture: Gesture | null = null

    const frameRect = (): { left: number; top: number } => win.frameElement?.getBoundingClientRect() ?? { left: 0, top: 0 }
    /** 이벤트의 호스트 좌표 — 캔버스 문서의 이벤트는 iframe 자리 · 줌을 걸어 옮긴다. */
    const toHost = (event: PointerEvent, source: 'frame' | 'host'): Point => {
      if (source === 'host') return { x: event.clientX, y: event.clientY }
      const rect = frameRect()
      const zoom = latest.current.zoom
      return { x: rect.left + event.clientX * zoom, y: rect.top + event.clientY * zoom }
    }
    const currentRect = (at: Gesture) => rectBetween(at.start, hostToDocument(at.lastHost, frameRect(), latest.current.zoom))

    const draw = (at: Gesture): void => {
      const surface = latest.current.surface()
      if (surface === null) return
      const rect = frameRect()
      const base = surface.getBoundingClientRect()
      const zoom = latest.current.zoom
      setShown(toSurfaceRect(currentRect(at), { left: (rect.left - base.left) / zoom, top: (rect.top - base.top) / zoom }))
    }

    const end = (): void => {
      const at = gesture
      gesture = null
      if (at === null) return
      if (at.timer !== null) clearInterval(at.timer)
      if (typeof at.target.hasPointerCapture === 'function' && at.target.hasPointerCapture(at.pointerId)) {
        at.target.releasePointerCapture(at.pointerId)
      }
      setShown(null)
    }

    /** 지금 그려진 노드들 — 문서 차례 · 부모 · 문서 좌표 상자(외곽선과 같은 감쌀 요소). */
    const drawnNodes = (): MarqueeNode[] => {
      const elements = new Map<string, Element>()
      for (const element of Array.from(doc.querySelectorAll('[data-wb-id]'))) {
        const id = element.getAttribute('data-wb-id')
        if (id !== null && id !== '' && !elements.has(id)) elements.set(id, element)
      }
      const nodes: MarqueeNode[] = []
      for (const visit of walkSafely(latest.current.root())) {
        const id = visit.node.id
        if (typeof id !== 'string' || id === '') continue
        const element = elements.get(id)
        const parentId = typeof visit.parent?.id === 'string' && visit.parent.id !== '' ? visit.parent.id : null
        if (element === undefined) {
          // 그려지지 않은 노드도 차례에는 든다 — 자손이 그 노드를 조상으로 찾는다. 상자는 0 이라 고르지 않는다.
          nodes.push({ id, parentId, box: { left: 0, top: 0, width: 0, height: 0 } })
          continue
        }
        const box = focusElement(element).getBoundingClientRect()
        nodes.push({ id, parentId, box: { left: box.left, top: box.top, width: box.width, height: box.height } })
      }
      return nodes
    }

    const begin = (event: PointerEvent, source: 'frame' | 'host'): void => {
      if (event.button !== 0 || !event.isPrimary || gesture !== null) return
      const target = event.target
      if (target === null || (target as Node).nodeType !== 1) return
      const host = toHost(event, source)
      gesture = {
        pointerId: event.pointerId,
        target: target as Element,
        source,
        start: hostToDocument(host, frameRect(), latest.current.zoom),
        pressedHost: host,
        lastHost: host,
        started: false,
        cancelled: false,
        timer: null,
      }
    }

    const down = (event: PointerEvent): void => begin(event, 'frame')
    /**
     * 칸의 빈 자리 — 누른 요소가 표면 자신이거나 표면을 품은 상자(칸 · 판 · 그 사이 상자)일 때만이다. 표면 위의 셸 겹(손잡이 · 번호 마커 ·
     * 통지)은 표면의 **자식**이라 표면을 품지 않는다(머리말).
     */
    const downOnPane = (event: PointerEvent): void => {
      const target = event.target as Element | null
      const surface = latest.current.surface()
      if (target === null || target.nodeType !== 1 || surface === null) return
      if (target.contains(surface)) begin(event, 'host')
    }

    const move = (event: PointerEvent, source: 'frame' | 'host'): void => {
      const at = gesture
      if (at === null || at.source !== source || event.pointerId !== at.pointerId) return
      const host = toHost(event, source)
      at.lastHost = host
      if (at.cancelled) return
      if (!at.started) {
        // 문턱은 호스트 좌표의 움직임으로 잰다(줌이 곱해진 화면 거리 — 끌기와 같다).
        if (Math.hypot(host.x - at.pressedHost.x, host.y - at.pressedHost.y) <= DRAG_THRESHOLD) return
        at.started = true
        if (typeof at.target.setPointerCapture === 'function') at.target.setPointerCapture(at.pointerId)
        win.getSelection()?.removeAllRanges()
        window.getSelection()?.removeAllRanges()
        at.timer = setInterval(() => {
          const scroller = scrollParent(latest.current.surface())
          if (scroller !== null) {
            const delta = edgeScrollStep(scroller.getBoundingClientRect(), at.lastHost)
            if (delta !== 0) scroller.scrollTop = Math.max(0, scroller.scrollTop + delta)
          }
          if (gesture === at && !at.cancelled) draw(at)
        }, EDGE_SCROLL_TICK)
      }
      draw(at)
    }

    const up = (event: PointerEvent, source: 'frame' | 'host'): void => {
      const at = gesture
      if (at === null || at.source !== source || event.pointerId !== at.pointerId) return
      if (!at.started) {
        end()
        return
      }
      at.lastHost = toHost(event, source)
      const picked = at.cancelled ? null : nodesInRect(currentRect(at), drawnNodes())
      end()
      swallowNextClick(source === 'frame' ? win : window)
      if (picked !== null) latest.current.onPick(picked, event.shiftKey)
    }

    const cancel = (event: PointerEvent): void => {
      if (gesture !== null && event.pointerId === gesture.pointerId) end()
    }
    const frameMove = (event: PointerEvent): void => move(event, 'frame')
    const frameUp = (event: PointerEvent): void => up(event, 'frame')
    const hostMove = (event: PointerEvent): void => move(event, 'host')
    const hostUp = (event: PointerEvent): void => up(event, 'host')
    const pane = scrollParent(latest.current.surface())

    const key = (event: KeyboardEvent): void => {
      const at = gesture
      if (at === null || !at.started || at.cancelled || event.key !== 'Escape') return
      event.preventDefault()
      at.cancelled = true
      setShown(null)
    }

    doc.addEventListener('pointerdown', down)
    doc.addEventListener('pointermove', frameMove)
    doc.addEventListener('pointerup', frameUp)
    doc.addEventListener('pointercancel', cancel)
    pane?.addEventListener('pointerdown', downOnPane)
    document.addEventListener('pointermove', hostMove)
    document.addEventListener('pointerup', hostUp)
    document.addEventListener('pointercancel', cancel)
    win.addEventListener('keydown', key, true)
    window.addEventListener('keydown', key, true)
    return () => {
      doc.removeEventListener('pointerdown', down)
      doc.removeEventListener('pointermove', frameMove)
      doc.removeEventListener('pointerup', frameUp)
      doc.removeEventListener('pointercancel', cancel)
      pane?.removeEventListener('pointerdown', downOnPane)
      document.removeEventListener('pointermove', hostMove)
      document.removeEventListener('pointerup', hostUp)
      document.removeEventListener('pointercancel', cancel)
      win.removeEventListener('keydown', key, true)
      window.removeEventListener('keydown', key, true)
      end()
    }
  }, [frame, enabled])

  return shown
}
