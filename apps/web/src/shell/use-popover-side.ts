/**
 * **셸 머리의 팝오버를 어디에 붙일지 고른다.** 내보내기·스냅샷 둘이 쓴다.
 *
 * 떠 있는 상자는 토글 상자의 **오른쪽 끝에 붙어 왼쪽으로 펼쳐진다**(`right: 0`) — 토글이 머리 오른쪽 끝에 서는 넓은
 * 화면의 자리다. 그런데 머리는 감싸는 줄이라(`.wb-shell-header`의 `flex-wrap`) 폭이 좁으면 토글이 **다음 줄 왼쪽**으로
 * 내려가고, 그때 오른쪽 끝에 붙인 상자는 화면 왼쪽 밖으로 나간다 — 잘린 쪽에 형식 토글과 문장의 앞머리가 있어
 * 읽지도 누르지도 못한다(Chrome · 높이 900: 1280 폭에서 내보내기 상자 x = −353, 1024 에서 스냅샷 상자 −118, 768 에서
 * −504. 머리가 몇 줄로 접히는지는 프로젝트 이름 · 사용자 이름 길이에 따라 갈린다).
 *
 * **CSS 로는 못 고른다.** 토글이 줄의 어디에 섰는지는 접힌 뒤에야 정해지고, 셸 CSS 는 결합자를 쓰지 않는다(`shell.css`
 * 머리말) — 그래서 열 때 재서 고른다. 고르는 순서는 셋이다(화면 = `documentElement.clientWidth` — 세로 스크롤 막대를 뺀 폭):
 *
 * | # | 조건 | 자리 |
 * |---|---|---|
 * | 1 | 오른쪽 끝에 붙여 왼쪽으로 펴도 화면 안이다 | `end` — 넓은 화면의 자리를 흔들지 않는다 |
 * | 2 | 아니고, 왼쪽 끝에 붙여 오른쪽으로 펴면 화면 안이다 | `start` |
 * | 3 | 둘 다 넘친다 | `start` + **끌어오기**(`left` 보정) — 상자의 왼쪽 끝을 `[0, 화면 − 상자 폭]` 안으로 옮긴다. 상자가 화면보다 넓으면 왼쪽 끝을 0 에 둔다(앞머리를 살린다 — 셸 CSS 의 `max-width`가 상자를 화면 − 16 으로 줄여 이 판은 생기지 않는다) |
 *
 * **3 이 없으면 좁은 폭에서 한쪽만 보고 뒤집은 쪽이 더 많이 넘친다**(Chrome: 600 폭 내보내기 — `end` 5px 잘림인데 `start`로
 * 뒤집어 178px, 상자 414 는 화면 600 에 들어가는데도). 1 · 2 에서 끌어오지 않는 것은 넘치지 않는 자리를 토글에 붙여 두려는
 * 것이다 — 끌어온 상자는 토글과 떨어져 선다.
 *
 * **열려 있는 동안 프레임마다 다시 잰다** — 창 폭이 바뀌지 않아도 토글이 옮겨 가기 때문이다: 열린 채 역할이 바뀌어 머리의
 * 되돌리기 묶음이 사라지면 머리가 다시 접히고, 토글이 1280 에서 16..61 → 1109..1154 로 간다(Chrome — 옛 자리 `start`에 선 상자가
 * 243px 넘쳤다. 900 스냅샷은 `end`에서 155px). 앵커가 움직였다는 이벤트는 없다. **머리에 `ResizeObserver`를 거는 쪽은 고르지
 * 않았다** — 잰 판은 전부 머리 높이가 바뀌어 잡히지만(역할 알림 줄이 함께 떠 1280 에서 98 → 88), 그것은 이 방아쇠의 우연이다.
 * 앞 칸이 빠지거나 줄어 토글이 **줄 안에서만** 밀리면 머리와 토글의 크기는 그대로다(코드로 읽은 판 — 재지 않았다). 그래서
 * `requestAnimationFrame`으로 앵커 · 상자 폭 · 화면 폭을 읽고, **셋이 그대로면 아무것도 하지 않는다**(읽기 둘 — 쓰기가 없어
 * 레이아웃을 다시 돌리지 않는다). 창 폭의 변화도 이 길로 잡는다. **닫혀 있으면 아무것도 걸지 않는다**(`use-popover-dismiss.ts`와
 * 같은 판단).
 *
 * jsdom 에는 레이아웃이 없어 상자와 화면 폭이 모두 0 이다 — 그때는 1 이다(잘림 0).
 */
import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react'

/** `'end'`면 토글의 오른쪽 끝에 붙어 왼쪽으로 펼쳐진다(기본). `'start'`면 왼쪽 끝에 붙어 오른쪽으로 펼쳐진다. */
export type PopoverSide = 'end' | 'start'

/**
 * 떠 있는 상자에 실을 것. `side`는 `data-side`로(`shell.css`가 그 값으로 붙일 쪽을 바꾼다), `style`은 그대로 싣는다 —
 * 끌어오기(머리말 표의 3)일 때만 `left`가 있고, 그 밖에는 `undefined`다(CSS 의 `left: 0`이 선다).
 */
export interface PopoverPlacement {
  side: PopoverSide
  style: CSSProperties | undefined
}

const END: PopoverPlacement = { side: 'end', style: undefined }
const START: PopoverPlacement = { side: 'start', style: undefined }

/**
 * 머리말 표를 그대로 옮긴 판정. **DOM 을 모른다** — 잰 값만 받는다.
 *
 * @param anchor 토글까지 감싸는 상자(떠 있는 상자가 기대는 `position: relative`)의 왼쪽 · 오른쪽 끝(화면 좌표).
 * @param width 떠 있는 상자의 폭(테두리 포함).
 * @param viewport 화면 폭.
 */
export function placePopover(anchor: { left: number; right: number }, width: number, viewport: number): PopoverPlacement {
  const clipped = (left: number): number => Math.max(0, -left) + Math.max(0, left + width - viewport)
  if (clipped(anchor.right - width) === 0) return END
  if (clipped(anchor.left) === 0) return START
  const left = Math.max(0, Math.min(anchor.left, viewport - width))
  return { side: 'start', style: { left: left - anchor.left } }
}

/**
 * @param root 토글까지 감싸는 상자(`usePopoverDismiss`가 돌려준 것).
 * @returns `bodyRef`는 떠 있는 상자에 건다. `placement`는 그 상자에 싣는다(`PopoverPlacement`).
 */
export function usePopoverSide<T extends HTMLElement = HTMLDivElement>(
  root: RefObject<HTMLElement | null>,
  open: boolean,
): { placement: PopoverPlacement; bodyRef: RefObject<T | null> } {
  const bodyRef = useRef<T>(null)
  const [placement, setPlacement] = useState<PopoverPlacement>(END)

  useLayoutEffect(() => {
    if (!open) return
    /** 마지막으로 고른 때의 앵커 양 끝 · 상자 폭 · 화면 폭. 같으면 고르지 않는다. */
    let seen = ''
    let frame = 0
    const place = (): void => {
      const anchor = root.current?.getBoundingClientRect()
      const body = bodyRef.current?.getBoundingClientRect()
      if (anchor === undefined || body === undefined) return
      const viewport = document.documentElement.clientWidth
      const inputs = `${anchor.left} ${anchor.right} ${body.width} ${viewport}`
      if (inputs === seen) return
      seen = inputs
      const next = placePopover(anchor, body.width, viewport)
      // **같은 자리면 같은 객체를 둔다** — 끌어오기는 부를 때마다 새 `style`을 만들어, 그대로 넣으면 다시 고를 때마다 다시 그린다.
      setPlacement((prev) => (prev.side === next.side && prev.style?.left === next.style?.left ? prev : next))
    }
    const watch = (): void => {
      place()
      frame = requestAnimationFrame(watch)
    }
    // 여는 순간은 그리기 전에 고른다(이 이펙트가 레이아웃 이펙트인 까닭) — 첫 프레임을 기다리면 옛 자리가 한 번 보인다.
    place()
    frame = requestAnimationFrame(watch)
    return () => cancelAnimationFrame(frame)
  }, [open, root])

  return { placement, bodyRef }
}
