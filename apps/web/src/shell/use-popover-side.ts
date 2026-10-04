/**
 * **셸의 떠 있는 목록을 어디에 놓을지 고른다.** 행동 메뉴(`shell/action-menu.tsx`)가 쓴다 — 목록은 문서 맨 위 겹(`document.body`)에
 * portal 로 서고(그 머리말 «목록은 문서 맨 위 겹에 선다»), 자리는 이 훅이 **단추 상자의 화면 좌표로 지은 `position: fixed` 좌표**다.
 *
 * ## 왜 단추 곁(`position: absolute`)이 아닌가
 *
 * 목록이 단추 곁의 DOM 에 서면 단추를 품은 스크롤 칸(트리 칸 — `overflow: auto`)이 목록을 자르고, 옆 칸(캔버스)이 그 위를 덮는다.
 * 그리고 목록이 칸의 스크롤 높이를 늘려, 연 순간 포커스를 받은 항목을 칸이 보이는 자리로 끌어오며 트리째 튄다(Chrome ·
 * `build-test/action-menu-place.test.ts` 가 고치기 전 소스에서 잰 값: 창 900×700 스크롤한 구조 트리 가운데 줄 `…` 의 목록 아래 36px 잘림 ·
 * 항목 하나 덮임, 창 700×700 메뉴 트리 줄 `+` 의 목록 오른쪽 112px 이 캔버스 밑 · 항목 셋 다 덮임, 맨 아래 줄 `…` 를 열면 단추가
 * 183px 위로 옮겨 감).
 *
 * ## 가로 — 오른끝에 붙여 왼쪽으로 편다
 *
 * 단추가 머리 오른쪽 끝에 서는 넓은 화면의 자리를 흔들지 않는다. 고르는 순서는 셋이다(화면 = `documentElement.clientWidth` — 세로 스크롤
 * 막대를 뺀 폭):
 *
 * | # | 조건 | 자리 |
 * |---|---|---|
 * | 1 | 단추 오른끝에 붙여 왼쪽으로 펴도 화면 안이다 | `end` |
 * | 2 | 아니다 | `start` — 단추 왼끝에 붙여 오른쪽으로 펴되 왼끝을 `[0, 화면 − 상자 폭]` 안으로 **끌어온다**(오른쪽으로 펴도 화면 안이면 끌어올 것이 없어 단추 왼끝 그대로다). 상자가 화면보다 넓으면 왼끝을 0 에 둔다(앞머리를 살린다 — 셸 CSS 의 `max-width` 가 상자를 화면 − 32 로 줄여 이 판은 생기지 않는다) |
 *
 * **끌어오기가 없으면 좁은 폭에서 한쪽만 보고 뒤집은 쪽이 더 많이 넘친다**(Chrome: 600 폭 · 폭 414 상자 — `end` 5px 잘림인데 `start` 로
 * 뒤집어 178px, 상자는 화면 600 에 들어가는데도).
 *
 * ## 세로 — 아래로 열고, 모자라면 위로
 *
 * | # | 조건 | 자리 |
 * |---|---|---|
 * | 1 | 단추 아래 `GAP` 에서 펴도 화면 안이다 | `below` |
 * | 2 | 아니다 | 단추 위 · 아래 가운데 **자리가 넓은 쪽** + **끌어오기** — 위끝을 `[0, 화면 높이 − 상자 높이]` 안으로 옮긴다. 위에 다 들면 위가 넓은 쪽이라 끌어올 것 없이 단추 위 `GAP` 에 선다(맨 아래 줄). 상자가 화면보다 높으면 0 이다(셸 CSS 의 `max-height` 가 상자를 화면 − 16 으로 줄이고 안에서 스크롤한다) |
 *
 * ## 열린 동안 프레임마다 다시 잰다 — 스크롤 · 창 크기 · 단추가 옮겨 감
 *
 * 앵커가 움직였다는 이벤트는 없다 — 트리 칸이 스크롤해도(`scroll` 은 거품이 안 일어 칸마다 걸어야 한다), 열린 채 역할이 바뀌어 머리가
 * 다시 접혀도(Chrome: 단추가 1280 에서 16..61 → 1109..1154) 단추만 옮겨 간다. 그래서 `requestAnimationFrame` 으로 앵커 · 상자 크기 ·
 * 화면 크기 · 잘라 내는 조상 칸을 읽고, **그대로면 아무것도 하지 않는다**(읽기만 — 쓰기가 없어 레이아웃을 다시 돌리지 않는다).
 * **닫혀 있으면 아무것도 걸지 않는다**(`use-popover-dismiss.ts` 와 같은 판단).
 *
 * ## 단추가 스크롤 칸의 보이는 자리 밖으로 나가면 잃었다고 알린다
 *
 * 목록은 고정 좌표라 칸이 단추를 굴려 숨겨도 혼자 떠 있다 — 무엇의 메뉴인지 보이지 않는 목록이 남는다. 그래서 단추의 가운데 점이
 * 잘라 내는 조상 칸(`overflow` 가 `visible` 이 아닌 상자) · 화면 가운데 하나라도 밖이면(상자가 없어져 크기 0 이어도) `onLost` 를 부른다 —
 * 부르는 쪽이 닫는다. 따라가며 반쯤 가린 단추에 붙여 두지 않는 것은, 가린 칸 위에 뜬 목록이 그 칸의 다른 줄을 덮기 때문이다.
 *
 * jsdom 에는 레이아웃이 없어 상자와 화면이 모두 0 이다 — 그때는 가로 1 · 세로 1 이고, 크기 0 인 단추로 잃었다고 보지 않는다(재지 못한
 * 판이다 — 위 «잃었다»는 실브라우저의 것).
 */
import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'

/** `'end'` 면 단추 오른끝에 붙어 왼쪽으로 펼쳐진다(기본). `'start'` 면 왼끝에 붙어 오른쪽으로 펼쳐진다(끌어오기 포함). */
export type PopoverSide = 'end' | 'start'
/** `'below'` 면 단추 아래로(기본), `'above'` 면 단추 위로 펼쳐진다. */
export type PopoverBlock = 'below' | 'above'

/** 단추와 목록 사이(px). */
export const GAP = 6

/** 떠 있는 상자에 실을 것 — `side` · `block` 은 `data-side` · `data-block` 으로(읽는 쪽은 케이스다), `style` 은 그대로 싣는다. */
export interface PopoverPlacement {
  side: PopoverSide
  block: PopoverBlock
  style: CSSProperties
}

interface Box {
  left: number
  right: number
  top: number
  bottom: number
}

/**
 * 머리말 두 표를 그대로 옮긴 판정. **DOM 을 모른다** — 잰 값만 받는다.
 *
 * @param anchor 단추를 감싼 상자의 화면 좌표.
 * @param size 떠 있는 상자의 크기(테두리 포함).
 * @param viewport 화면 크기.
 */
export function placePopover(
  anchor: Box,
  size: { width: number; height: number },
  viewport: { width: number; height: number },
): PopoverPlacement {
  const over = (start: number, length: number, limit: number): number => Math.max(0, -start) + Math.max(0, start + length - limit)

  const clamp = (start: number, length: number, limit: number): number => Math.max(0, Math.min(start, limit - length))

  const end = anchor.right - size.width
  const side: PopoverSide = over(end, size.width, viewport.width) === 0 ? 'end' : 'start'
  const left = side === 'end' ? end : clamp(anchor.left, size.width, viewport.width)

  const below = anchor.bottom + GAP
  const fits = over(below, size.height, viewport.height) === 0
  const block: PopoverBlock = fits || viewport.height - anchor.bottom >= anchor.top ? 'below' : 'above'
  const top = fits ? below : clamp(block === 'below' ? below : anchor.top - GAP - size.height, size.height, viewport.height)
  return { side, block, style: { left, top } }
}

/** 잘라 내는 `overflow` 값. 값으로 고른다 — jsdom 은 안 정한 칸에 `visible` 이 아니라 빈 글자를 돌려준다. */
const CLIPS: ReadonlySet<string> = new Set(['hidden', 'clip', 'auto', 'scroll'])

/** 단추를 잘라 내는 조상 칸 — `overflow` 가 자르는 값인 상자. 열 때 한 번 모은다(칸이 바뀌는 일은 열린 동안 없다). */
function clippingAncestors(element: Element): Element[] {
  const found: Element[] = []
  const root = element.ownerDocument.documentElement
  for (let at = element.parentElement; at !== null && at !== root; at = at.parentElement) {
    const style = getComputedStyle(at)
    if (CLIPS.has(style.overflowX) || CLIPS.has(style.overflowY)) found.push(at)
  }
  return found
}

/** 점이 상자 안인가(안쪽 끝 포함). */
function inside(x: number, y: number, box: Box): boolean {
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
}

/**
 * @param anchor 단추까지 감싸는 상자(`usePopoverDismiss` 가 돌려준 것).
 * @param onLost 단추가 보이는 자리 밖으로 나갔다(머리말 «잃었다고 알린다»). 마지막 것을 부른다 — 렌더마다 새 함수여도 된다.
 * @returns `bodyRef` 는 떠 있는 상자에 건다. `placement` 는 그 상자에 싣는다.
 */
export function usePopoverSide<T extends HTMLElement = HTMLDivElement>(
  anchor: RefObject<HTMLElement | null>,
  open: boolean,
  onLost: () => void,
): { placement: PopoverPlacement; bodyRef: RefObject<T | null> } {
  const bodyRef = useRef<T>(null)
  const [placement, setPlacement] = useState<PopoverPlacement>(() => placePopover({ left: 0, right: 0, top: 0, bottom: 0 }, { width: 0, height: 0 }, { width: 0, height: 0 }))
  // 마지막 `onLost` 를 든다 — 의존으로 두면 렌더마다 재기를 걷었다 다시 건다(`use-popover-dismiss.ts` 의 `latest` 와 같은 판단).
  const lost = useRef(onLost)
  useLayoutEffect(() => {
    lost.current = onLost
  })

  useLayoutEffect(() => {
    if (!open) return
    const element = anchor.current
    if (element === null) return
    const clips = clippingAncestors(element)
    /** 마지막으로 고른 때의 입력. 같으면 고르지 않는다. */
    let seen = ''
    let frame = 0
    const place = (): void => {
      const at = element.getBoundingClientRect()
      const body = bodyRef.current?.getBoundingClientRect()
      if (body === undefined) return
      const root = element.ownerDocument.documentElement
      const viewport = { width: root.clientWidth, height: root.clientHeight }
      const boxes = clips.map((clip) => clip.getBoundingClientRect())
      const inputs = [at.left, at.right, at.top, at.bottom, body.width, body.height, viewport.width, viewport.height, ...boxes.flatMap((b) => [b.left, b.top, b.right, b.bottom])].join(' ')
      if (inputs === seen) return
      seen = inputs
      const measured = viewport.width > 0 && viewport.height > 0
      const x = (at.left + at.right) / 2
      const y = (at.top + at.bottom) / 2
      const gone = at.width === 0 && at.height === 0
      const hidden = gone || !inside(x, y, { left: 0, top: 0, right: viewport.width, bottom: viewport.height }) || boxes.some((box) => !inside(x, y, box))
      if (measured && hidden) {
        lost.current()
        return
      }
      const next = placePopover(at, body, viewport)
      // **같은 자리면 같은 객체를 둔다** — 판정은 부를 때마다 새 `style` 을 만들어, 그대로 넣으면 다시 고를 때마다 다시 그린다.
      setPlacement((prev) =>
        prev.side === next.side && prev.block === next.block && prev.style.left === next.style.left && prev.style.top === next.style.top ? prev : next,
      )
    }
    const watch = (): void => {
      place()
      frame = requestAnimationFrame(watch)
    }
    // 여는 순간은 그리기 전에 고른다(이 이펙트가 레이아웃 이펙트인 까닭) — 첫 프레임을 기다리면 옛 자리가 한 번 보인다.
    place()
    frame = requestAnimationFrame(watch)
    return () => cancelAnimationFrame(frame)
  }, [open, anchor])

  return { placement, bodyRef }
}
