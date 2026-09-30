/**
 * **포인터 드래그 부품** — 무엇을 끌고 어디에 놓는지 모르는 끌기 장치(설계서 spec `docs/superpowers/specs/2026-09-30-editor-shell-design.md`
 * 「드래그로 옮기기」). 트리 둘이 줄을 옮기는 데 쓰고, 컴포넌트 목록 → 트리 · 캔버스로 끄는 일도 같은 장치를 쓰도록 짓는다.
 *
 * 이 훅이 갖는 것은 **끌기 상태 · 놓을 자리 표시 · 끝 스크롤**이다. 놓을 자리의 판정(`onOver`)과 놓았을 때 할 일(`onDrop`)은 부르는
 * 쪽이 준다 — 부품이 트리를 알면 다른 곳에서 못 쓴다.
 *
 * | 몸짓 | 무엇 |
 * |---|---|
 * | 누름(주 버튼) | 아직 끌기가 아니다 — 누른 자리를 쥐고 기다린다 |
 * | 4px 넘게 움직임(`DRAG_THRESHOLD`) | 끌기가 선다 · 누른 요소가 포인터를 붙잡는다 · 이때부터 움직일 때마다 `onOver` |
 * | 뗌 | 뗀 좌표로 `onOver` 를 다시 물어 `null` 이 아니면 `onDrop` 한 번 |
 * | Escape · `pointercancel` | 취소 — 표시를 걷고 뒤의 뗌도 아무것도 안 한다 |
 *
 * ## 포인터 이벤트로 짓는다 — HTML5 DnD 가 아니다
 *
 * 기본 DnD 는 same-origin iframe 경계에서 이벤트가 끊기고 끄는 모양을 다루기 어렵다(spec 「드래그로 옮기기」). **캔버스는 iframe
 * 이라** 포인터가 그 위로 나가면 `pointermove` · `pointerup` 이 iframe 문서로 가 호스트 `window` 에 안 닿는다 — 끌기가 붙은 채 남는다.
 * 그래서 끌기가 서는 순간 누른 요소가 `setPointerCapture` 로 포인터를 붙잡는다. 그 뒤의 포인터 이벤트는 iframe 위에서도 그 요소로
 * 와서 `window` 까지 올라가고, 좌표도 호스트 창의 것이다(`build-test/tree-drag.test.ts` «끄는 중 캔버스 위를 지나»).
 *
 * **누를 때 붙잡지 않는다** — 문턱을 못 넘는 누름은 클릭이다. 그 클릭의 대상 · 포커스를 캡처가 바꾸지 않게, 끌기가 선 뒤에만 잡는다.
 * **듣는 자리는 `window` 다** — jsdom 에 `setPointerCapture` 가 없어(있으면 부른다) 캡처에만 기대면 테스트의 끌기가 통째로 죽는다.
 * 손잡이(`shell/shell-resizer.tsx` 머리말 «드래그를 `window`에서 듣고, …»)와 같은 짝이다.
 *
 * ## 끈 뒤의 클릭을 삼킨다
 *
 * 붙잡힌 포인터는 누른 요소와 뗀 요소가 같아 브라우저가 그 요소에 `click` 을 낸다 — 줄이 링크면 끌어 놓은 페이지가 **열린다.**
 * 끌기가 선 누름이 끝나면 다음 한 틱 동안 오는 `click` 을 붙잡는 단계(capture)에서 막는다. 틱이 지나면 걷는다 — 다음 진짜 클릭은 산다.
 * 취소한 끌기도 같다(그 누름은 이미 클릭이 아니다).
 *
 * ## 시작한 포인터만 듣는다
 *
 * 창에서 듣는 `pointermove` · `pointerup` · `pointercancel` 은 **모든** 포인터의 것이다 — 마우스로 끄는 중 터치 화면을 한 번 치면 그
 * 손가락의 `pointerup` 이 창에 와 끌기를 그 자리에 놓는다(`build-test/tree-drag-review.test.ts`). 그래서 누른 포인터의 `pointerId` 가
 * 아닌 이벤트는 셋 다 모른 척한다. 다른 포인터의 누름은 새 끌기를 세우지도 않는다(`bind` 의 «이미 누른 것이 있으면 돌아간다»).
 *
 * ## 링크의 기본 끌기를 막는다
 *
 * `<a>` · 그림은 누른 채 움직이면 브라우저의 기본 DnD 가 선다 — 그러면 `pointercancel` 이 와 이 끌기가 취소된다. `bind` 가 주는
 * `onDragStart` 가 그것을 막는다.
 *
 * ## 전역 리스너는 끌기 동안만, 캔버스 문서에도
 *
 * Escape 는 호스트 `window` 와 캔버스 iframe 의 문서(`canvas/canvas-document.tsx` 의 통로) 둘에서 듣는다 — 초점이 캔버스 안에 있으면
 * 그 키가 호스트로 안 올라온다(`CLAUDE.md` «캔버스 문서는 same-origin iframe 이다»). 누르기 전에는 아무것도 걸지 않는다 — 줄마다
 * `bind` 가 붙어 있어, 늘 거는 구현은 트리를 여는 것만으로 리스너를 줄 수만큼 얹는다.
 *
 * ## 끝 스크롤
 *
 * `scrollContainer` 를 주면 끄는 동안 포인터가 그 상자의 위 · 아래 끝 `EDGE_ZONE` 안에 있을 때 `EDGE_SPEED` 로 민다. 포인터가 멈춰
 * 있어도 이어서 민다(타이머) — 트리 끝에 대고 기다리는 것이 그 몸짓이다. 밀고 나면 같은 좌표로 `onOver` 를 다시 묻는다(줄이 포인터
 * 밑으로 지나갔다). 틱은 `setInterval` 이다 — `requestAnimationFrame` 은 가려진 탭에서 멈추고 jsdom 에는 없다.
 */
import { useCallback, useEffect, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useCanvasDocument } from '../canvas/canvas-document'

/** 이만큼(px) 넘게 움직여야 끌기다. 그 안은 클릭(선택)이다. */
export const DRAG_THRESHOLD = 4
/** 스크롤 상자의 위 · 아래 끝에서 이만큼(px) 안이면 민다. */
export const EDGE_ZONE = 24
/** 끝 스크롤 속도(px/s). */
export const EDGE_SPEED = 480
/** 끝 스크롤 틱(ms). */
const EDGE_TICK = 16

/** 호스트 창의 좌표. */
export interface DragPoint {
  x: number
  y: number
}

/**
 * 놓을 자리 하나 — 부르는 쪽의 값(`value`)과 표시할 자리. `rect` 는 그 자리가 붙는 줄의 창 좌표 상자이고, `placement` 가 선(앞 · 뒤)과
 * 강조(안)를 가른다. 표시는 `drop-indicator.tsx` 가 그린다.
 */
export interface DropHint<D> {
  value: D
  rect: { left: number; top: number; width: number; height: number }
  placement: 'before' | 'after' | 'inside'
}

export interface PointerDragOptions<S, D> {
  /** 끄는 동안 포인터 자리에 무엇을 놓을 수 있나. 못 놓으면 `null`. */
  onOver: (source: S, point: DragPoint) => DropHint<D> | null
  /** 놓았다 — `onOver` 가 뗀 자리에 준 값으로 한 번. */
  onDrop: (source: S, value: D) => void
  /** 끝 스크롤할 상자. 없으면 안 민다. */
  scrollContainer?: () => HTMLElement | null
}

export interface PointerDrag<S, D> {
  /** 끌 수 있는 요소에 펼친다(`{...drag.bind(source)}`). */
  bind: (source: S) => {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void
    onDragStart: (event: DragEvent<HTMLElement>) => void
  }
  /** 끄는 중인 것. 끌기가 서기 전(문턱 안)에는 `null`. */
  dragging: S | null
  /** 지금 놓을 자리. 없으면 `null`. */
  hint: DropHint<D> | null
}

/** 한 번의 누름 — 끌기가 섰는지와 걷을 것들. */
interface Gesture<S> {
  source: S
  element: HTMLElement
  pointerId: number
  start: DragPoint
  last: DragPoint
  started: boolean
  /** 걷기 — 리스너 · 타이머. */
  teardown: () => void
}

export function usePointerDrag<S, D>(options: PointerDragOptions<S, D>): PointerDrag<S, D> {
  const [dragging, setDragging] = useState<S | null>(null)
  const [hint, setHint] = useState<DropHint<D> | null>(null)
  const gesture = useRef<Gesture<S> | null>(null)
  const canvasDocument = useCanvasDocument()
  // 마지막 콜백 · 캔버스 문서를 ref 로 든다 — 누른 동안 건 리스너가 그 렌더의 것을 붙잡지 않게.
  const latest = useRef({ options, canvasDocument })
  latest.current = { options, canvasDocument }

  /** 끝낸다 — 리스너 · 타이머를 걷고 표시를 지운다. 끌기가 섰던 누름이면 뒤따를 클릭을 삼킨다(머리말). */
  const finish = useCallback((): void => {
    const current = gesture.current
    if (current === null) return
    gesture.current = null
    current.teardown()
    if (current.started) swallowNextClick()
    setDragging(null)
    setHint(null)
  }, [])

  // 끄는 중에 내려가면 걷는다 — 리스너가 남으면 다음 누름이 옛 콜백을 부른다.
  useEffect(() => finish, [finish])

  const bind = useCallback(
    (source: S) => ({
      onPointerDown: (event: ReactPointerEvent<HTMLElement>): void => {
        if (event.button !== 0 || gesture.current !== null) return
        const element = event.currentTarget
        const point = { x: event.clientX, y: event.clientY }
        const listening: { target: EventTarget; type: string; listener: EventListener }[] = []
        let timer: ReturnType<typeof setInterval> | null = null
        const listen = (target: EventTarget, type: string, listener: EventListener): void => {
          target.addEventListener(type, listener)
          listening.push({ target, type, listener })
        }

        const current: Gesture<S> = {
          source,
          element,
          pointerId: event.pointerId,
          start: point,
          last: point,
          started: false,
          teardown: () => {
            for (const { target, type, listener } of listening) target.removeEventListener(type, listener)
            if (timer !== null) clearInterval(timer)
            if (typeof element.hasPointerCapture === 'function' && element.hasPointerCapture(current.pointerId)) {
              element.releasePointerCapture(current.pointerId)
            }
          },
        }
        gesture.current = current

        const ask = (at: DragPoint): DropHint<D> | null => latest.current.options.onOver(source, at)

        // 이 누름의 포인터가 아닌 이벤트는 모른 척한다(머리말 «시작한 포인터만 듣는다»).
        const mine = (raw: Event): boolean => (raw as PointerEvent).pointerId === current.pointerId

        const move = (raw: Event): void => {
          if (!mine(raw)) return
          const moved = raw as PointerEvent
          const at = { x: moved.clientX, y: moved.clientY }
          current.last = at
          if (!current.started) {
            if (Math.hypot(at.x - current.start.x, at.y - current.start.y) <= DRAG_THRESHOLD) return
            current.started = true
            // 붙잡기는 끌기가 선 뒤다(머리말 «누를 때 붙잡지 않는다»).
            if (typeof element.setPointerCapture === 'function') element.setPointerCapture(current.pointerId)
            setDragging(() => source)
            timer = setInterval(edgeScroll, EDGE_TICK)
          }
          setHint(ask(at))
        }

        const up = (raw: Event): void => {
          if (!mine(raw)) return
          const released = raw as PointerEvent
          if (!current.started) {
            finish()
            return
          }
          // 뗀 좌표로 다시 묻는다 — 마지막 move 와 뗌 사이에 자리가 바뀔 수 있다.
          const landed = ask({ x: released.clientX, y: released.clientY })
          finish()
          if (landed !== null) latest.current.options.onDrop(source, landed.value)
        }

        const key = (raw: Event): void => {
          const pressed = raw as KeyboardEvent
          if (pressed.key !== 'Escape' || !current.started) return
          pressed.preventDefault()
          finish()
        }

        const edgeScroll = (): void => {
          const box = latest.current.options.scrollContainer?.() ?? null
          if (box === null) return
          const frame = box.getBoundingClientRect()
          const y = current.last.y
          const step = (EDGE_SPEED * EDGE_TICK) / 1000
          let delta = 0
          if (y < frame.top + EDGE_ZONE) delta = -step
          else if (y > frame.bottom - EDGE_ZONE) delta = step
          if (delta === 0) return
          const before = box.scrollTop
          box.scrollTop = Math.max(0, before + delta)
          if (box.scrollTop !== before) setHint(ask(current.last))
        }

        listen(window, 'pointermove', move)
        listen(window, 'pointerup', up)
        // 포인터를 잃은 것(창 밖 · 기기 분리 · 기본 DnD)도 끝이다 — 안 걷으면 다음 클릭이 끌기처럼 보인다.
        listen(window, 'pointercancel', (raw) => {
          if (mine(raw)) finish()
        })
        listen(window, 'keydown', key)
        const canvas = latest.current.canvasDocument
        if (canvas !== null) listen(canvas, 'keydown', key)
      },
      onDragStart: (event: DragEvent<HTMLElement>): void => {
        // 링크 · 그림의 기본 끌기를 막는다(머리말).
        event.preventDefault()
      },
    }),
    [finish],
  )

  return { bind, dragging, hint }
}

/**
 * 끌기가 끝난 뒤 한 틱 동안 오는 `click` 하나를 삼킨다(머리말 «끈 뒤의 클릭을 삼킨다»). 붙잡는 단계에서 막아 줄 · 링크의 처리기와
 * 라우터까지 안 간다.
 */
function swallowNextClick(): void {
  const swallow = (event: MouseEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    window.removeEventListener('click', swallow, true)
  }
  window.addEventListener('click', swallow, true)
  setTimeout(() => window.removeEventListener('click', swallow, true), 0)
}

/**
 * 상자 안에서 `selector` 에 맞는 요소 가운데 점을 품은 것 — `onOver` 가 포인터 밑 줄을 찾는 데 쓴다. 없으면 `null`.
 *
 * **`elementFromPoint` 를 쓰지 않는다** — 줄 사이 틈 · 줄 안의 다른 요소(행동 단추 · 배지)에서도 줄을 찾아야 하고, 상자로 재면 무엇이
 * 위에 겹쳐 있든(표시 겹 · 떠 있는 메뉴) 같은 답이다. 차례는 문서 차례이고 먼저 맞은 것을 준다.
 */
export function elementAt(container: HTMLElement | null, selector: string, point: DragPoint): HTMLElement | null {
  if (container === null) return null
  for (const element of container.querySelectorAll<HTMLElement>(selector)) {
    const box = element.getBoundingClientRect()
    if (point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y < box.bottom) return element
  }
  return null
}

/** 가장 가까운 세로 스크롤 조상 — 끝 스크롤할 상자(`scrollContainer`). 없으면 `null`. */
export function scrollParent(element: HTMLElement | null): HTMLElement | null {
  for (let cursor = element?.parentElement ?? null; cursor !== null; cursor = cursor.parentElement) {
    const overflow = getComputedStyle(cursor).overflowY
    if (overflow === 'auto' || overflow === 'scroll') return cursor
  }
  return null
}
