/**
 * **놓을 자리 표시** — `use-pointer-drag.ts` 가 준 자리(`DropHint`)를 창 위 겹으로 그린다. 앞 · 뒤(형제로 놓기)는 그 줄의 위 · 아래
 * 가는 선, 안(자식으로 놓기)은 줄 강조다(spec 「드래그로 옮기기」).
 *
 * **`position: fixed` 다**(`shell.css` 의 `.wb-shell-drop-indicator`). 자리가 창 좌표(`getBoundingClientRect`)라 스크롤되는 트리 상자의
 * 흐름에 넣으면 스크롤만큼 어긋나고 넘침 자르기에 잘린다. **그리는 자리는 셸 안이다(portal 이 아니다)** — 색이 셸의 팔레트 변수
 * (`--wb-shell-*`)라 `.wb-shell` 밖(`document.body`)에서는 값이 없다. 그래서 **셸에서 이 겹의 조상에 `transform` · `filter` ·
 * `contain` 을 걸면 안 된다** — 그 조상이 `fixed` 의 기준 상자가 되어 선이 그만큼 밀린다. 겹이 누름을 받지 않게 `pointer-events: none`
 * 이다 — 받으면 그 밑의 줄이 `onOver` 에 안 잡힌다.
 */
import type { ReactElement } from 'react'
import type { DropHint } from './use-pointer-drag'

export function DropIndicator<D>(props: { hint: DropHint<D> | null }): ReactElement | null {
  const { hint } = props
  if (hint === null) return null
  const { left, top, width, height } = hint.rect
  // 선은 줄의 위 · 아래 가장자리에 걸친다(두께의 가운데를 가장자리에 맞추는 것은 CSS 의 `margin-top`).
  const style =
    hint.placement === 'inside'
      ? { left, top, width, height }
      : { left, top: hint.placement === 'before' ? top : top + height, width }
  return (
    <div
      className={
        hint.placement === 'inside' ? 'wb-shell-drop-indicator wb-shell-drop-inside' : 'wb-shell-drop-indicator wb-shell-drop-line'
      }
      data-placement={hint.placement}
      aria-hidden="true"
      style={style}
    />
  )
}
