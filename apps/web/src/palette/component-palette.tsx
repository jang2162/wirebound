/**
 * **하단 컴포넌트 판** — 캔버스와 하단 바 사이에 펼쳐지는 판(spec `docs/superpowers/specs/2026-10-01-component-drag-design.md`
 * 「하단 컴포넌트 목록」). 셸 그리드의 `palette` 줄이다(`shell.css` 의 `.wb-shell` · `.wb-shell-palette`).
 *
 * **서는 조건 · 높이 · 열림은 셸이 갖는다** — 셸(`routes/editor.tsx`)이 편집 모드 · `canEdit` · 기억한 열림(`shell/sidebar-layout.ts` 머리말
 * «하단 판의 높이»)으로 이 부품을 그리거나 안 그린다. 여기는 그 높이를 위쪽 손잡이(`ShellResizer` · `orientation="horizontal"`)로 나른다 —
 * 위로 끌면 판이 커지므로 `reversed` 다.
 */
import type { ReactElement, ReactNode } from 'react'
import { ShellResizer } from '../shell/shell-resizer'

/** 판의 id — 하단 바의 토글이 `aria-controls` 로 가리킨다. */
export const PALETTE_ID = 'wb-shell-palette'

export function ComponentPalette(props: {
  height: number
  min: number
  max: number
  onGrab: () => number
  onMove: (height: number) => void
  onReset: () => void
  children?: ReactNode
}): ReactElement {
  return (
    <section id={PALETTE_ID} className="wb-shell-palette" aria-label="컴포넌트 목록" style={{ height: `${props.height}px` }}>
      <ShellResizer
        orientation="horizontal"
        className="wb-shell-palette-resizer"
        label="컴포넌트 목록 높이"
        reversed
        value={props.height}
        min={props.min}
        max={props.max}
        valueText={`${Math.round(props.height)}px`}
        onGrab={props.onGrab}
        onMove={props.onMove}
        onEdge={(edge) => props.onMove(edge === 'min' ? props.min : props.max)}
        onReset={props.onReset}
      />
      {props.children}
    </section>
  )
}

/** 하단 바의 «컴포넌트» 토글. 판이 서는 조건과 같은 조건으로 셸이 그린다. */
export function PaletteToggle(props: { open: boolean; onToggle: () => void }): ReactElement {
  return (
    <button
      type="button"
      className="wb-shell-palette-toggle"
      aria-expanded={props.open}
      aria-controls={PALETTE_ID}
      onClick={props.onToggle}
    >
      컴포넌트
    </button>
  )
}
