/**
 * **캔버스 사각형 고르기**(설계서 「설계서 화면 구조」의 «고르는 법»). 캔버스 문서에서 누르고 `DRAG_THRESHOLD`(4px) 넘게 움직이면 사각형이
 * 선다 — 캔버스에서 노드를 눌러 끄는 동작이 없으므로 어디서 시작해도 된다(노드를 옮기는 길은 손잡이 하나 — 손잡이 · 카드 끌기는 호스트
 * 문서에서 시작해 이 리스너에 안 닿는다). 떼면 그려진 상자가 사각형 안에 **완전히** 든 노드 가운데 가장 바깥 것들을 고른다(`./canvas-marquee.ts`
 * 의 `nodesInRect`) — Shift 를 누른 채 떼면 더한다. 4px 안에서 떼면 아무것도 안 한다 — 지금 클릭(고르기)이 그대로 돈다.
 *
 * - **포인터는 캔버스 문서에서 듣는다** — 호스트에 건 리스너는 iframe 안의 누름을 못 받는다(`canvas-document.tsx`). 사각형이 선 뒤에는
 *   누른 요소가 포인터를 붙잡아(`setPointerCapture`) iframe 밖으로 나가도 움직임이 온다.
 * - **끝 스크롤은 끌어 놓기와 같은 셈**(`drag/use-pointer-drag.ts` 의 `edgeScrollStep`)이다 — 칸이 굴러도 누른 점은 문서 좌표로 붙잡혀 있고,
 *   지금 점은 틱마다 마지막 호스트 점을 그 순간의 iframe 자리로 옮긴다(`./canvas-marquee.ts` 머리말 «좌표 셋»). 휠로 굴려도 같다.
 * - **뗀 뒤의 클릭은 삼킨다** — 사각형이 선 누름의 클릭이 그 밑 노드 하나를 고르면 방금 고른 것이 사라진다(`swallowNextClick` — 이 iframe 의 창).
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
      /** 누른 점 — 문서 좌표. */
      start: Point
      /** 마지막 포인터 — 호스트 좌표. */
      lastHost: Point
      started: boolean
      cancelled: boolean
      timer: ReturnType<typeof setInterval> | null
    }
    let gesture: Gesture | null = null

    const frameRect = (): { left: number; top: number } => win.frameElement?.getBoundingClientRect() ?? { left: 0, top: 0 }
    const toHost = (event: PointerEvent): Point => {
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

    const down = (event: PointerEvent): void => {
      if (event.button !== 0 || !event.isPrimary || gesture !== null) return
      const target = event.target
      if (target === null || (target as Node).nodeType !== 1) return
      gesture = {
        pointerId: event.pointerId,
        target: target as Element,
        start: { x: event.clientX, y: event.clientY },
        lastHost: toHost(event),
        started: false,
        cancelled: false,
        timer: null,
      }
    }

    const move = (event: PointerEvent): void => {
      const at = gesture
      if (at === null || event.pointerId !== at.pointerId) return
      at.lastHost = toHost(event)
      if (at.cancelled) return
      if (!at.started) {
        if (Math.hypot(event.clientX - at.start.x, event.clientY - at.start.y) <= DRAG_THRESHOLD) return
        at.started = true
        if (typeof at.target.setPointerCapture === 'function') at.target.setPointerCapture(at.pointerId)
        win.getSelection()?.removeAllRanges()
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

    const up = (event: PointerEvent): void => {
      const at = gesture
      if (at === null || event.pointerId !== at.pointerId) return
      at.lastHost = toHost(event)
      if (!at.started) {
        end()
        return
      }
      const picked = at.cancelled ? null : nodesInRect(currentRect(at), drawnNodes())
      end()
      swallowNextClick(win)
      if (picked !== null) latest.current.onPick(picked, event.shiftKey)
    }

    const cancel = (event: PointerEvent): void => {
      if (gesture !== null && event.pointerId === gesture.pointerId) end()
    }

    const key = (event: KeyboardEvent): void => {
      const at = gesture
      if (at === null || !at.started || at.cancelled || event.key !== 'Escape') return
      event.preventDefault()
      at.cancelled = true
      setShown(null)
    }

    doc.addEventListener('pointerdown', down)
    doc.addEventListener('pointermove', move)
    doc.addEventListener('pointerup', up)
    doc.addEventListener('pointercancel', cancel)
    win.addEventListener('keydown', key, true)
    window.addEventListener('keydown', key, true)
    return () => {
      doc.removeEventListener('pointerdown', down)
      doc.removeEventListener('pointermove', move)
      doc.removeEventListener('pointerup', up)
      doc.removeEventListener('pointercancel', cancel)
      win.removeEventListener('keydown', key, true)
      window.removeEventListener('keydown', key, true)
      end()
    }
  }, [frame, enabled])

  return shown
}
