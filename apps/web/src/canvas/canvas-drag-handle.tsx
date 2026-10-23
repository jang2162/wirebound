/**
 * **캔버스 손잡이** — 고른 노드의 선택 외곽선 왼쪽 위 모서리에 서는 «옮기기» 단추. 끌면 그 노드를 옮긴다(spec
 * `docs/superpowers/specs/2026-10-01-component-drag-design.md` 「기존 노드 옮기기 — 손잡이」). 노드를 아무 데서나 눌러 끌지 않는 것은
 * 범위다 — 캔버스의 누름은 고르기다.
 *
 * 서는 조건(편집 모드 · `canEdit` · 뿌리 아님 · 남이 안 잡음)은 그리는 쪽(`./canvas.tsx`)이 가른다. 이 부품은 끌기 장치
 * (`drag/use-pointer-drag.ts`)에 `{ kind: 'node', id }` 를 묶고 판정 · 편집은 경로 층(`drag/use-placement.ts`)에 맡긴다 — 트리 위에 놓아도,
 * 캔버스 위에 놓아도 같은 판정이다.
 *
 * ## 단추는 확대된 프레임 안, 표시는 밖
 *
 * 단추는 선택 외곽선 곁(캔버스 표면 — 프레임의 `scale(zoom)` 아래)에 서야 노드를 따라간다. 크기는 줌을 걷어 화면에서 늘 같게 둔다
 * (`scale(1 / zoom)` — 줌 0.5 에서 반으로 줄면 누를 자리가 없다). 캔버스 위의 자리는 배치 미리보기로 서고(`./canvas-preview.ts` — 보인
 * 자리를 `usePublishPlacementPreview` 로 싣는다), 트리 위의 자리만 선 · 강조로 선다. **그 표시(`DropIndicator`)는 프레임 밖에 그린다** — 그 겹은 창 좌표의
 * `position: fixed` 인데 `transform` 이 걸린 조상 안에 두면 그 조상이 기준 상자가 되어 줌 · 스크롤만큼 밀린다(`drag/drop-indicator.tsx`
 * 머리말). 그래서 셸 뿌리(`.wb-shell` — 팔레트 변수가 사는 곳)로 portal 한다. 셸 밖(최소 숙주 테스트)이면 제자리에 그린다.
 *
 * ## 캔버스가 다시 잴 때 마지막 좌표로 다시 묻는다
 *
 * 끄는 사이 남의 편집 · 늦은 글꼴 · 그림이 노드를 밀면 포인터 밑이 바뀐다 — 보인 자리는 마지막 `pointermove` 때 잰 옛 좌표의 것으로 남는다. 캔버스는
 * 그럴 때 외곽선 · 마커를 다시 재고(`./canvas.tsx` 의 측정 이펙트 — 문서 · 줌 · 폭 · 겹layer · iframe 크기 변화), 같은 의존으로 지은
 * `layoutKey` 를 여기 내린다. 바뀌면 끌기 장치의 `refresh` 가 마지막 좌표로 다시 물어 같은 자리면 새 상자로, 다르면 표시를 걷는다
 * (`drag/use-pointer-drag.ts` 머리말 «놓는 답은 보인 답이다» — 걷힌 채 떼면 편집 0).
 *
 * ## 누름이 고르기로 새지 않는다
 *
 * 단추는 캔버스 표면 안이라 그 `click` 이 표면의 «누른 자리의 노드를 고른다»(`canvas.tsx` 의 `onClick`)로 올라간다 — 단추는 iframe
 * 문서 밖이라 노드가 없고 선택이 풀린다. 단추의 `click` 은 거기서 멈춘다. 끈 뒤의 `click` 은 끌기 장치가 삼킨다.
 */
import { useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { DropIndicator, DropRefusal } from '../drag/drop-indicator'
import { usePlacementDrop, usePublishDragging, usePublishPlacementPreview, type PlacementDrop } from '../drag/use-placement'
import { scrollParent, usePointerDrag } from '../drag/use-pointer-drag'
import type { Placing } from '../edit/structure-drop'
import { shellIcon } from '../shell/icons'

/** 외곽선 모서리에서 손잡이까지(화면 px) — 단추가 노드의 첫 글자를 가리지 않게 바깥 위 · 왼쪽에 선다. */
const OUTSIDE = 22

export function CanvasDragHandle(props: {
  projectId: string
  pageId: string | undefined
  nodeId: string
  /** 접근 이름의 «<이름>» — 구조 트리 줄과 같은 타입 이름. */
  label: string
  /** 선택 외곽선의 자리 — 캔버스 표면 좌표(줌을 걷은 값). */
  box: { left: number; top: number }
  zoom: number
  /** 캔버스가 다시 잴 때마다 바뀌는 값 — 끄는 중이면 마지막 좌표로 다시 묻는다(머리말 «다시 잴 때»). */
  layoutKey: unknown
}): ReactElement {
  const placement = usePlacementDrop({ projectId: props.projectId, pageId: props.pageId })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const drag = usePointerDrag<Placing, PlacementDrop>({
    onOver: placement.onOver,
    onDrop: placement.onDrop,
    sameDrop: placement.sameDrop,
    // 작은 단추라 `touch-action: none`(`shell.css`)으로 곧바로 끈다 — 터치도 길게 누르지 않는다.
    touchStart: 'now',
    // 캔버스 칸의 위 · 아래 · 왼 · 오른 끝에 대면 칸이 민다(`drag/use-pointer-drag.ts` 머리말 «끝 스크롤»).
    scrollContainer: () => scrollParent(buttonRef.current),
    refusal: placement.refusalOf,
  })
  const { refresh } = drag
  useLayoutEffect(() => {
    refresh()
  }, [props.layoutKey, refresh])
  const [shell, setShell] = useState<Element | null>(null)
  useLayoutEffect(() => {
    setShell(buttonRef.current?.closest('.wb-shell') ?? null)
  }, [])

  const hint = placement.live(drag.hint)
  // 보인 자리를 캔버스에 미리보기로 끼운다 — 캔버스 위의 선 · 강조는 미리보기가 대신한다(`drag/use-placement.ts` 머리말 «배치 미리보기»).
  usePublishPlacementPreview(hint?.value ?? null)
  // 끄는 노드를 캔버스에 알린다 — 받을 수 있는 빈 구역마다 점선 칸이 선다(`./empty-zones.tsx`).
  usePublishDragging(drag.dragging)
  const indicator = (
    <>
      <DropIndicator hint={hint?.value.region === 'tree' ? hint : null} layout={hint?.value.layout} />
      <DropRefusal refusal={drag.refusal} />
    </>
  )
  const scale = 1 / props.zoom

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="wb-shell-canvas-handle"
        aria-label={`${props.label} 옮기기`}
        title={`${props.label} 옮기기`}
        style={{
          left: props.box.left - OUTSIDE * scale,
          top: props.box.top - OUTSIDE * scale,
          transform: `scale(${scale})`,
        }}
        onClick={(event) => event.stopPropagation()}
        // 새 객체를 렌더마다 묶는다 — 경로 층이 끌기의 판을 이 객체에 단다(`drag/use-placement.ts` 머리말 «판은 끄는 것 객체로»).
        {...drag.bind({ kind: 'node', id: props.nodeId })}
      >
        {shellIcon('drag', 14)}
      </button>
      {shell === null ? indicator : createPortal(indicator, shell)}
    </>
  )
}
