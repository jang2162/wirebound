/**
 * **카드 몸통의 더블클릭** — 하단 판의 컴포넌트 카드 · 모듈 카드가 몸통 더블클릭으로 «넣기» 와 같은 넣기를 한 번 한다(`./component-palette.tsx` ·
 * `./module-tab.tsx` 머리말 «카드»).
 *
 * ## `dblclick` 이 아니라 몸통에 닿은 `click` 둘을 짝짓는다
 *
 * 브라우저의 `dblclick` 은 누름 수(`detail`)로 서고, 누름 수는 그 누름이 끌기였는지를 모른다 — 몸통을 끌어 판 안에 놓은 자리에서 곧바로 한 번 누르면
 * OS 가 그것을 더블클릭의 둘째로 세어 `dblclick` 이 선다(Chrome · CDP `clickCount: 2` — `build-test/palette-double-click.test.ts` «끈 뒤의 누름»).
 * 끌기 장치는 끈 누름의 `click` 을 삼키므로(`drag/use-pointer-drag.ts` 머리말 «끈 뒤의 클릭을 삼킨다») **몸통에 닿은 `click` 만 세면** 끈 누름은
 * 짝에 들지 않는다.
 *
 * 짝이 되는 둘째: 같은 카드 · 첫째에서 `DOUBLE_CLICK_MS` 안 · `DOUBLE_CLICK_SLOP` 안의 자리(넣기 단추의 둘째 삼킴과 같은 값 — `shell/action-menu.tsx`).
 * 짝이 서면 비운다 — 세 번째 누름은 새 첫째다.
 *
 * ## 세지 않는 `click`
 *
 * - **카드 안의 단추 · 입력에서 난 것** — «넣기» 단추의 누름 둘은 단추가 넣고 둘째를 삼킨다. 몸통이 함께 세면 두 번 넣는다. 모듈 카드의 이름 칸 ·
 *   «삭제 확인» 같은 단추도 같다.
 * - **카드 DOM 밖에서 버블된 것** — 카드 안에서 연 행동 메뉴 · 상자(portal)의 누름도 React 트리를 따라 몸통에 닿는다.
 * - **키보드가 낸 것**(`detail` 0) — 키보드는 «넣기» 단추가 받는다.
 */
import { useRef, type MouseEvent } from 'react'
import { DOUBLE_CLICK_MS, DOUBLE_CLICK_SLOP } from '../shell/action-menu'

/** 몸통이 세지 않는 누름의 자리 — 카드 안의 조작 요소. */
const CONTROLS = 'button, input, textarea, select, a, label, [role="button"], [role="menuitem"]'

/** 몸통의 `onClick` 을 짓는다 — `onDouble` 은 짝이 선 둘째 누름의 이벤트로 불린다. */
export function useCardDoubleClick<K>(
  onDouble: (key: K, event: MouseEvent<HTMLElement>) => void,
): (key: K, event: MouseEvent<HTMLElement>) => void {
  const first = useRef<{ key: K; at: number; x: number; y: number } | null>(null)
  return (key, event) => {
    if (event.detail === 0) return
    const target = event.target
    if (!(target instanceof Element) || !event.currentTarget.contains(target)) return
    const control = target.closest(CONTROLS)
    if (control !== null && event.currentTarget.contains(control)) return
    const now = performance.now()
    const previous = first.current
    if (
      previous !== null &&
      previous.key === key &&
      now - previous.at < DOUBLE_CLICK_MS &&
      Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= DOUBLE_CLICK_SLOP
    ) {
      first.current = null
      onDouble(key, event)
      return
    }
    first.current = { key, at: now, x: event.clientX, y: event.clientY }
  }
}
