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
 * | 4px 넘게 움직임(`DRAG_THRESHOLD`) | 끌기가 선다 · 누른 요소가 포인터를 붙잡는다 · 이때부터 움직일 때마다 `onOver` (**터치는 다르다** — 아래 «터치는 길게 눌러 끈다») |
 * | 뗌 | 뗀 좌표로 `onOver` 를 다시 물어 `null` 이 아니면 `onDrop` 한 번 — `sameDrop` 을 주면 그 답이 보인 답일 때만(아래) |
 * | Escape · `pointercancel` | 취소 — 표시를 걷고 뒤의 뗌도 아무것도 안 한다 |
 *
 * ## 놓는 답은 보인 답이다(`sameDrop` · `refresh`)
 *
 * 뗀 좌표로 다시 묻는 것은 마지막 `pointermove` 와 뗌 사이에 포인터가 움직였을 수 있어서다. 그런데 포인터가 멈춰 있어도 그 밑의 것이
 * 바뀐다 — 남의 편집이 줄을 밀거나(지움 · 넣음) 위 노드의 글을 늘려 레이아웃만 밀어도, 같은 좌표에 다시 물은 답은 **보인 표시와 다른
 * 자리**다(옛 표시는 옛 좌표에 남아 있다). 그 답으로 놓으면 사람이 본 적 없는 자리로 간다(`build-test/canvas-drop-review.test.ts`).
 *
 * 그래서 부르는 쪽이 `sameDrop`(두 값이 같은 자리인가)을 주면 **뗀 좌표가 마지막으로 물은 좌표에서 문턱(`DRAG_THRESHOLD`) 안일 때**
 * 다시 물은 답이 지금 보인 답과 같은 자리일 때만 놓는다 — 다르면(보인 답이 없던 판 포함) 편집 0 이다. 문턱 밖이면(뗌 앞의 움직임이 안
 * 왔다) 다시 물은 답으로 놓는다 — `sameDrop` 이 없을 때와 같다. 보통의 끌기는 뗀 좌표가 마지막 `pointermove` 와 같아 다시 물은 답도 같다.
 *
 * 표시가 옛 좌표에 남지 않게 부르는 쪽은 그 밑이 바뀌었을 때(캔버스가 다시 잼) `refresh()` 를 부른다 — 마지막 좌표로 다시 물어 같은
 * 자리면 새 상자로 고쳐 그리고, 다르면 표시를 걷는다(새 자리를 곧바로 내지 않는다 — 멈춘 포인터 밑에서 표시가 뛰어 바로 뗀 판이 안
 * 본 자리로 가지 않게). 걷힌 뒤에는 움직이면 새 자리가 선다. 끝 스크롤의 다시 물음은 사람이 미는 몸짓이라 새 답을 그대로 그린다.
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
 * ## 끄는 동안 캔버스 iframe 은 포인터를 안 받는다
 *
 * 캡처가 iframe 경계를 못 넘는 포인터가 있다 — CDP 의 펜(`pointerType: 'pen'`)은 `hasPointerCapture` 가 참이어도 캔버스 iframe 위의 `pointermove` ·
 * `pointerup` 이 iframe 문서로 가 호스트 `window` 에 안 온다(끌기가 안 끝나 이름표 · 들린 줄이 남고, 다음 누름은 «이미 누른 것이 있다» 로 무시된다 —
 * `build-test/drag-pointer-kinds.test.ts`). 그래서 **누른 순간부터 끌기가 끝날 때까지 캔버스 iframe 을 `pointer-events: none` 으로
 * 둔다**(인라인 style). 위 포인터는 iframe 밑의 호스트 요소로 가 캡처한 요소 · `window` 까지 온다. 놓을
 * 자리의 판정은 좌표로 iframe 문서를 직접 묻는 것이라(`canvas/canvas-drop.ts`) 영향이 없다. 누름 때 거는 것은 첫 move 가 이미 iframe 위인 판을 막기
 * 위해서다. 끌기 여럿이 겹쳐도(마우스 + 펜) 센 수가 0 이 될 때만 푼다. 캔버스 안의 사각형 고르기(`canvas/use-canvas-marquee.ts`)는 이 훅이 아니다.
 *
 * ## 터치는 길게 눌러 끈다
 *
 * 터치로 끌기가 서려면 카드 · 줄의 `touch-action: auto` 인 채 판의 스크롤과 갈라야 한다 — 첫 움직임이 스크롤이 되면 브라우저가 `pointercancel` 을 보내
 * 끌기가 취소된다. 그래서 **터치는 `TOUCH_HOLD_MS`(300ms) 동안 `TOUCH_HOLD_SLOP`(8px) 안에서 가만히 눌러야 끌기가 선다**(서는 순간 누른 자리로 한 번
 * `onOver`). 그 전에 8px 넘게 움직이면 이 누름은 끌기가 아니다 — 스크롤이 그대로 간다. 끌기가 서면 `touchmove` 의 기본 동작(스크롤)을 막아 그 손가락의
 * 스크롤 · `pointercancel` 이 안 온다. 그 리스너는 **`{ passive: false }` 로 누른 때부터 건다**(window 의 `touchmove` 는 기본이 passive 이고, 끌기가 선 뒤에
 * 걸면 이미 스크롤로 간 제스처는 못 막는다). `touchStart: 'now'` 는 작은 단추(캔버스 손잡이)가 쓴다 — 그 단추는 `touch-action: none` 이라 길게 누를
 * 필요 없이 곧바로 문턱(4px)으로 선다. 펜 · 마우스는 문턱뿐이다.
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
 * `scrollContainer` 를 주면 끄는 동안 포인터가 그 상자의 위 · 아래 · 왼 · 오른 끝 `EDGE_ZONE` 안에 있을 때 그쪽으로 `EDGE_SPEED` 로 민다 —
 * 두 축은 따로 본다(모서리에서는 둘 다 민다). 가로는 칸보다 넓은 문서(창 1440 의 칸 860 에 프리셋 1280 · 줌 1 부터)의 화면 밖 쪽에 놓는 길이다. 포인터가 멈춰
 * 있어도 이어서 민다(타이머) — 트리 끝에 대고 기다리는 것이 그 몸짓이다. **상자 밖은 끝 너머가 아니다** — 포인터가 상자 밖(위 · 아래 · 옆)이면
 * 안 민다. 세로만 견주면 캔버스 칸 아래의 하단 판 전체가 «아래 끝 너머»로 읽혀, 판에서 카드를 쥐고 머뭇거리는 동안 칸이 끝까지 밀린다
 * (`build-test/palette.test.ts` «판 위에서 카드를 쥐고 머뭇거려도»). 판에서 캔버스로 올라가는 길은 칸 아래 끝 띠를 지나는 동안만 민다. 밀고 나면 같은 좌표로 `onOver` 를 다시 묻는다(줄이 포인터
 * 밑으로 지나갔다). 틱은 `setInterval` 이다 — `requestAnimationFrame` 은 가려진 탭에서 멈추고 jsdom 에는 없다.
 */
import { useCallback, useEffect, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { useCanvasDocument } from '../canvas/canvas-document'

/** 이만큼(px) 넘게 움직여야 끌기다. 그 안은 클릭(선택)이다. */
export const DRAG_THRESHOLD = 4
/** 터치로 끌기가 서려면 이만큼(ms) 가만히 눌러야 한다(머리말 «터치는 길게 눌러 끈다»). */
export const TOUCH_HOLD_MS = 300
/** 길게 누르는 동안 이만큼(px) 넘게 움직이면 끌기가 아니라 스크롤이다. */
export const TOUCH_HOLD_SLOP = 8
/** 스크롤 상자의 위 · 아래 · 왼 · 오른 끝에서 이만큼(px) 안이면 민다. */
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
  /** 두 값이 같은 자리인가 — 주면 놓는 답이 보인 답일 때만 놓는다(머리말 «놓는 답은 보인 답이다»). */
  sameDrop?: (shown: D, landed: D) => boolean
  /**
   * 터치로 끌기가 서는 법 — `'hold'`(기본)는 길게 눌러야 서고, `'now'` 는 문턱만 넘으면 곧바로 선다(`touch-action: none` 인 작은 단추).
   * 펜 · 마우스는 이 값과 무관하다.
   */
  touchStart?: 'hold' | 'now'
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
  /** 포인터 밑이 바뀌었다 — 마지막 좌표로 다시 물어 같은 자리면 다시 그리고 다르면 걷는다(머리말). 끌기가 아니면 아무것도 안 한다. */
  refresh: () => void
}

/** 지금 iframe 을 막고 있는 누름의 수 — 0 이 되면 푼다(머리말 «끄는 동안 캔버스 iframe 은 포인터를 안 받는다»). */
let iframeHolds = 0
/** 막은 iframe 과 그 전의 인라인 `pointer-events` — 풀 때 되돌린다. */
const inertFrames = new Map<HTMLElement, string>()

/**
 * 호스트 문서의 iframe 이 포인터를 안 받게 한다. 돌려주는 함수가 그 몫을 거둔다(두 번 불러도 한 번만).
 * **인라인 style 로 건다** — `shell.css` 의 누수 검사(`apps/web/test/shell-css.test.ts`)가 결합자 선택자(`.끌기중 .iframe`)를 막는다.
 */
function holdIframesInert(): () => void {
  iframeHolds += 1
  if (iframeHolds === 1) {
    for (const frame of document.querySelectorAll<HTMLElement>('iframe')) {
      inertFrames.set(frame, frame.style.pointerEvents)
      frame.style.pointerEvents = 'none'
    }
  }
  let released = false
  return () => {
    if (released) return
    released = true
    iframeHolds -= 1
    if (iframeHolds > 0) return
    for (const [frame, before] of inertFrames) frame.style.pointerEvents = before
    inertFrames.clear()
  }
}

/** 한 번의 누름 — 끌기가 섰는지와 걷을 것들. */
interface Gesture<S, D> {
  source: S
  element: HTMLElement
  pointerId: number
  start: DragPoint
  last: DragPoint
  started: boolean
  /** 지금 그린 표시 — 놓는 답과 견준다. */
  shown: DropHint<D> | null
  /** 마지막 좌표로 다시 묻는다(`refresh`). */
  reask: () => void
  /** 걷기 — 리스너 · 타이머. */
  teardown: () => void
}

export function usePointerDrag<S, D>(options: PointerDragOptions<S, D>): PointerDrag<S, D> {
  const [dragging, setDragging] = useState<S | null>(null)
  const [hint, setHint] = useState<DropHint<D> | null>(null)
  const gesture = useRef<Gesture<S, D> | null>(null)
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
        const listening: { target: EventTarget; type: string; listener: EventListener; options: AddEventListenerOptions }[] = []
        let timer: ReturnType<typeof setInterval> | null = null
        let holdTimer: ReturnType<typeof setTimeout> | null = null
        const touch = event.pointerType === 'touch'
        const holdToStart = touch && (latest.current.options.touchStart ?? 'hold') === 'hold'
        const listen = (target: EventTarget, type: string, listener: EventListener, options: AddEventListenerOptions = {}): void => {
          target.addEventListener(type, listener, options)
          listening.push({ target, type, listener, options })
        }
        const releaseIframes = holdIframesInert()

        const current: Gesture<S, D> = {
          source,
          element,
          pointerId: event.pointerId,
          start: point,
          last: point,
          started: false,
          shown: null,
          reask: () => {
            const same = latest.current.options.sameDrop
            const next = ask(current.last)
            const kept = current.shown !== null && next !== null && (same === undefined || same(current.shown.value, next.value))
            show(same === undefined || kept ? next : null)
          },
          teardown: () => {
            for (const { target, type, listener, options } of listening) target.removeEventListener(type, listener, options)
            if (timer !== null) clearInterval(timer)
            if (holdTimer !== null) clearTimeout(holdTimer)
            releaseIframes()
            if (typeof element.hasPointerCapture === 'function' && element.hasPointerCapture(current.pointerId)) {
              element.releasePointerCapture(current.pointerId)
            }
          },
        }
        gesture.current = current

        const ask = (at: DragPoint): DropHint<D> | null => latest.current.options.onOver(source, at)
        const show = (next: DropHint<D> | null): void => {
          current.shown = next
          setHint(next)
        }

        // 이 누름의 포인터가 아닌 이벤트는 모른 척한다(머리말 «시작한 포인터만 듣는다»).
        const mine = (raw: Event): boolean => (raw as PointerEvent).pointerId === current.pointerId

        const move = (raw: Event): void => {
          if (!mine(raw)) return
          const moved = raw as PointerEvent
          const at = { x: moved.clientX, y: moved.clientY }
          current.last = at
          if (!current.started) {
            const far = Math.hypot(at.x - current.start.x, at.y - current.start.y)
            if (holdToStart) {
              // 길게 누르기 전의 움직임은 스크롤이다(머리말 «터치는 길게 눌러 끈다») — 이 누름을 놓아 준다.
              if (far > TOUCH_HOLD_SLOP) finish()
              return
            }
            if (far <= DRAG_THRESHOLD) return
            begin()
          }
          show(ask(at))
        }

        /** 끌기가 선다 — 붙잡기는 끌기가 선 뒤다(머리말 «누를 때 붙잡지 않는다»). */
        const begin = (): void => {
          current.started = true
          if (typeof element.setPointerCapture === 'function') element.setPointerCapture(current.pointerId)
          setDragging(() => source)
          timer = setInterval(edgeScroll, EDGE_TICK)
        }

        const up = (raw: Event): void => {
          if (!mine(raw)) return
          const released = raw as PointerEvent
          if (!current.started) {
            finish()
            return
          }
          // 뗀 좌표로 다시 묻는다 — 마지막 move 와 뗌 사이에 자리가 바뀔 수 있다.
          const at = { x: released.clientX, y: released.clientY }
          const landed = ask(at)
          const shown = current.shown
          finish()
          if (landed === null) return
          // 놓는 답은 보인 답이다 — 포인터가 거의 안 움직였는데 답이 다르면 그 밑이 바뀐 것이다(머리말).
          const same = latest.current.options.sameDrop
          const still = Math.hypot(at.x - current.last.x, at.y - current.last.y) <= DRAG_THRESHOLD
          if (same !== undefined && still && (shown === null || !same(shown.value, landed.value))) return
          latest.current.options.onDrop(source, landed.value)
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
          const delta = edgeScrollStep(box.getBoundingClientRect(), current.last)
          if (delta.x === 0 && delta.y === 0) return
          if (edgeScrollBy(box, delta)) show(ask(current.last))
        }

        if (holdToStart) {
          holdTimer = setTimeout(() => {
            holdTimer = null
            begin()
            show(ask(current.last))
          }, TOUCH_HOLD_MS)
        }
        if (touch) {
          // 끌기가 선 뒤의 스크롤 · 길게 누름 메뉴 · 글자 고르기를 막는다. `touchmove` 는 **누른 때부터** `passive: false` 로 건다(머리말).
          listen(window, 'touchmove', (raw) => {
            if (current.started && raw.cancelable) raw.preventDefault()
          }, { passive: false })
          for (const type of ['contextmenu', 'selectstart']) {
            listen(window, type, (raw) => {
              if (current.started) raw.preventDefault()
            })
          }
        }
        listen(window, 'pointermove', move)
        listen(window, 'pointerup', up)
        // 포인터를 잃은 것(창 밖 · 기기 분리 · 기본 DnD)도 끝이다 — 안 걷으면 다음 클릭이 끌기처럼 보인다.
        listen(window, 'pointercancel', (raw) => {
          if (mine(raw)) finish()
        })
        // **capture 로 받는다** — 끄는 중의 Escape 는 취소이지 선택 해제가 아니다. 에디터 단축키는 문서의 버블에서 Escape 를 선택 해제로
        // 받고 이미 막힌(`defaultPrevented`) 키는 안 본다(`edit/editor-shortcuts.ts` 의 `shortcutsBlocked`) — 창의 버블은 문서보다 늦어
        // 여기서 막아도 해제가 먼저 돈다(Chrome: 손잡이 끌기를 Escape 로 취소하면 외곽선 · 손잡이가 사라졌다 — `build-test/canvas-preview.test.ts`).
        listen(window, 'keydown', key, { capture: true })
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

  const refresh = useCallback((): void => {
    const current = gesture.current
    if (current !== null && current.started) current.reask()
  }, [])

  return { bind, dragging, hint, refresh }
}

/** 끝 스크롤의 틱 간격(ms) — 사각형 고르기(`canvas/use-canvas-marquee.ts`)도 같은 틱으로 민다. */
export const EDGE_SCROLL_TICK = EDGE_TICK

/**
 * **끝 스크롤 한 틱에 밀 양(px)** — 축마다 따로: 점이 스크롤 상자의 그 축 끝(`EDGE_ZONE`) 안이면 그쪽으로 `EDGE_SPEED`의 한 틱, 아니면 0.
 * 상자 밖은 끝 너머가 아니다(머리말 «끝 스크롤») — 두 축 다 0 이다. 끌기와 사각형 고르기가 같은 셈을 쓴다.
 */
export function edgeScrollStep(frame: { left: number; right: number; top: number; bottom: number }, point: DragPoint): DragPoint {
  const { x, y } = point
  if (x < frame.left || x > frame.right || y < frame.top || y > frame.bottom) return { x: 0, y: 0 }
  const step = (EDGE_SPEED * EDGE_TICK) / 1000
  const along = (at: number, start: number, end: number): number => (at < start + EDGE_ZONE ? -step : at > end - EDGE_ZONE ? step : 0)
  return { x: along(x, frame.left, frame.right), y: along(y, frame.top, frame.bottom) }
}

/** 끝 스크롤 한 틱을 상자에 싣는다 — 실제로 굴렀으면 `true`(끝에 닿아 안 구른 축은 안 센다). */
export function edgeScrollBy(box: HTMLElement, delta: DragPoint): boolean {
  const left = box.scrollLeft
  const top = box.scrollTop
  if (delta.x !== 0) box.scrollLeft = Math.max(0, left + delta.x)
  if (delta.y !== 0) box.scrollTop = Math.max(0, top + delta.y)
  return box.scrollLeft !== left || box.scrollTop !== top
}

/**
 * 끌기가 끝난 뒤 한 틱 동안 오는 `click` 하나를 삼킨다(머리말 «끈 뒤의 클릭을 삼킨다»). 붙잡는 단계에서 막아 줄 · 링크의 처리기와
 * 라우터까지 안 간다. 클릭이 서는 창을 준다 — 캔버스 사각형은 그 iframe 의 창이다(`canvas/use-canvas-marquee.ts`).
 */
export function swallowNextClick(target: Window = window): void {
  const swallow = (event: MouseEvent): void => {
    event.preventDefault()
    event.stopPropagation()
    target.removeEventListener('click', swallow, true)
  }
  target.addEventListener('click', swallow, true)
  setTimeout(() => target.removeEventListener('click', swallow, true), 0)
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
