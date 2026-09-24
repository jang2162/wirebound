/**
 * **셸 머리의 팝오버를 어느 쪽에 붙일지 고른다.** 내보내기·스냅샷 둘이 쓴다.
 *
 * 떠 있는 상자는 토글 상자의 **오른쪽 끝에 붙어 왼쪽으로 펼쳐진다**(`right: 0`) — 토글이 머리 오른쪽 끝에 서는 넓은
 * 화면의 자리다. 그런데 머리는 감싸는 줄이라(`.wb-shell-header`의 `flex-wrap`) 폭이 좁으면 토글이 **다음 줄 왼쪽**으로
 * 내려가고, 그때 오른쪽 끝에 붙인 상자는 화면 왼쪽 밖으로 나간다 — 잘린 쪽에 형식 토글과 문장의 앞머리가 있어
 * 읽지도 누르지도 못한다(Chrome · 높이 900: 1280 폭에서 내보내기 상자 x = −353, 1024 에서 스냅샷 상자 −118, 768 에서
 * −504. 머리가 몇 줄로 접히는지는 프로젝트 이름 · 사용자 이름 길이에 따라 갈린다).
 *
 * **CSS 로는 못 고른다.** 토글이 줄의 어디에 섰는지는 접힌 뒤에야 정해지고, 셸 CSS 는 결합자를 쓰지 않는다(`shell.css`
 * 머리말) — 그래서 열 때 재서 고른다. **오른쪽 끝에 붙여 왼쪽으로 펼 자리가 없을 때만 바꾼다**(토글의 오른쪽 끝에서
 * 상자 폭만큼 왼쪽이 화면 밖): 넓은 화면의 자리를 흔들지 않는다.
 *
 * 창 폭이 열린 채 바뀌면 다시 잰다. **닫혀 있으면 아무것도 걸지 않는다**(`use-popover-dismiss.ts`와 같은 판단).
 *
 * jsdom 에는 레이아웃이 없어 두 상자가 모두 0 이다 — 그때는 오른쪽이다(`0 − 0`이 0 보다 작지 않다).
 */
import { useLayoutEffect, useRef, useState, type RefObject } from 'react'

/** `'end'`면 토글의 오른쪽 끝에 붙어 왼쪽으로 펼쳐진다(기본). `'start'`면 왼쪽 끝에 붙어 오른쪽으로 펼쳐진다. */
export type PopoverSide = 'end' | 'start'

/**
 * @param root 토글까지 감싸는 상자(`usePopoverDismiss`가 돌려준 것).
 * @returns `bodyRef`는 떠 있는 상자에 건다. `side`는 그 상자의 `data-side`로 싣는다(`shell.css`가 그 값으로 붙일 쪽을 바꾼다).
 */
export function usePopoverSide<T extends HTMLElement = HTMLDivElement>(
  root: RefObject<HTMLElement | null>,
  open: boolean,
): { side: PopoverSide; bodyRef: RefObject<T | null> } {
  const bodyRef = useRef<T>(null)
  const [side, setSide] = useState<PopoverSide>('end')

  useLayoutEffect(() => {
    if (!open) return
    const place = (): void => {
      const anchor = root.current?.getBoundingClientRect()
      const body = bodyRef.current?.getBoundingClientRect()
      if (anchor === undefined || body === undefined) return
      setSide(anchor.right - body.width < 0 ? 'start' : 'end')
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [open, root])

  return { side, bodyRef }
}
