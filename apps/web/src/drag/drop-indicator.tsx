/**
 * **놓을 자리 표시** — `use-pointer-drag.ts` 가 준 자리(`DropHint`)를 창 위 겹으로 그린다. 앞 · 뒤(형제로 놓기)는 그 줄의 위 · 아래
 * 가는 선, 안(자식으로 놓기)은 줄 강조다(spec 「드래그로 옮기기」).
 *
 * **캔버스 위의 자리는 이 겹이 아니라 배치 미리보기로 선다**(`canvas/canvas-preview.ts` — 경로 층의 `PlacementDrop.region` 이 `'canvas'`
 * 면 부르는 쪽이 이 겹에 안 넘긴다). 이 겹이 그리는 것은 트리 줄 위의 자리다. `layout`(축 — `canvas/canvas-drop.ts` 의 `Layout`)을 주면
 * 가로로 늘어놓는 자리의 앞 · 뒤를 상자의 왼 · 오른쪽 세로 선으로, 뒤집힌 배치(`row-reverse`)는 보이는 오른쪽을 앞으로 그린다 — 트리
 * 줄은 세로라 지금 부르는 쪽은 위 · 아래만 낸다.
 *
 * **`position: fixed` 다**(`shell.css` 의 `.wb-shell-drop-indicator`). 자리가 창 좌표(`getBoundingClientRect`)라 스크롤되는 트리 상자의
 * 흐름에 넣으면 스크롤만큼 어긋나고 넘침 자르기에 잘린다. **그리는 자리는 셸 안이다** — 색이 셸의 팔레트 변수(`--wb-shell-*`)라
 * `.wb-shell` 밖(`document.body`)에서는 값이 없다. 그래서 **셸에서 이 겹의 조상에 `transform` · `filter` · `contain` 을 걸면 안 된다** —
 * 그 조상이 `fixed` 의 기준 상자가 되어 선이 그만큼 밀린다. 캔버스 프레임에는 `scale(zoom)` 이 걸려 있어 그 안에서 시작한 끌기(캔버스
 * 손잡이 — 트리 위로도 간다)는 이 겹을 `.wb-shell` 로 portal 한다(`canvas/canvas-drag-handle.tsx`). 겹이 누름을 받지 않게 `pointer-events: none`
 * 이다 — 받으면 그 밑의 줄이 `onOver` 에 안 잡힌다.
 */
import type { ReactElement } from 'react'
import type { DropHint } from './use-pointer-drag'

export function DropIndicator<D>(props: {
  hint: DropHint<D> | null
  layout?: { axis: 'x' | 'y'; reversed: boolean } | undefined
}): ReactElement | null {
  const { hint } = props
  if (hint === null) return null
  const { left, top, width, height } = hint.rect
  if (hint.placement === 'inside') {
    return (
      <div
        className="wb-shell-drop-indicator wb-shell-drop-inside"
        data-placement="inside"
        aria-hidden="true"
        style={{ left, top, width, height }}
      />
    )
  }
  const axis = props.layout?.axis ?? 'y'
  // 보이는 앞쪽 가장자리인가 — 문서의 앞(`before`)이 뒤집힌 배치에서는 보이는 뒤쪽이다.
  const start = (hint.placement === 'before') !== (props.layout?.reversed ?? false)
  // 선은 상자의 가장자리에 걸친다(두께의 가운데를 가장자리에 맞추는 것은 CSS 의 `margin-top` · `margin-left`).
  return axis === 'x' ? (
    <div
      className="wb-shell-drop-indicator wb-shell-drop-line-x"
      data-placement={hint.placement}
      data-axis="x"
      aria-hidden="true"
      style={{ left: start ? left : left + width, top, height }}
    />
  ) : (
    <div
      className="wb-shell-drop-indicator wb-shell-drop-line"
      data-placement={hint.placement}
      data-axis="y"
      aria-hidden="true"
      style={{ left, top: start ? top : top + height, width }}
    />
  )
}
