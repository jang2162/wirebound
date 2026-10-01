/**
 * **하단 컴포넌트 판** — 캔버스와 하단 바 사이에 펼쳐지는 판(spec `docs/superpowers/specs/2026-10-01-component-drag-design.md`
 * 「하단 컴포넌트 목록」). 셸 그리드의 `palette` 줄이다(`shell.css` 의 `.wb-shell` · `.wb-shell-palette`).
 *
 * **서는 조건 · 높이 · 열림은 셸이 갖는다** — 셸(`routes/editor.tsx`)이 편집 모드 · `canEdit` · 기억한 열림(`shell/sidebar-layout.ts` 머리말
 * «하단 판의 높이»)으로 이 부품을 그리거나 안 그린다. 여기는 그 높이를 위쪽 손잡이(`ShellResizer` · `orientation="horizontal"`)로 나른다 —
 * 위로 끌면 판이 커지므로 `reversed` 다.
 */
import { useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react'
import { placeableGroups, type PickableType } from '../panels/type-picker'
import { ShellResizer } from '../shell/shell-resizer'
import { PaletteThumbs, type ThumbSlot } from './palette-thumbs'

/** 판의 id — 하단 바의 토글이 `aria-controls` 로 가리킨다. */
export const PALETTE_ID = 'wb-shell-palette'

export function ComponentPalette(props: {
  height: number
  min: number
  max: number
  onGrab: () => number
  onMove: (height: number) => void
  onReset: () => void
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
      <PaletteCards types={useMemo(() => placeableGroups().flatMap((group) => group.types), [])} />
    </section>
  )
}

/**
 * 카드 줄 — 가로로 늘어서고 넘치면 가로 스크롤이다. 카드마다 축소판이 비쳐 보이는 창(투명한 자리)과 한국어 이름이 선다. 축소판 깔개
 * (`./palette-thumbs.tsx`)는 카드 줄(트랙) 뒤에 같은 크기로 깔리고, 여기서 잰 창 좌표로 표본을 옮긴다.
 */
function PaletteCards(props: { types: readonly PickableType[] }): ReactElement {
  const trackRef = useRef<HTMLDivElement | null>(null)
  const [layout, setLayout] = useState<{ slots: ThumbSlot[]; width: number; height: number }>({ slots: [], width: 0, height: 0 })

  // 창 좌표를 잰다 — 카드가 바뀌거나 트랙 크기가 바뀌면(판 높이 · 창 폭) 다시.
  useLayoutEffect(() => {
    const track = trackRef.current
    if (track === null) return
    const measure = () => {
      const origin = track.getBoundingClientRect()
      const slots: ThumbSlot[] = []
      for (const win of track.querySelectorAll<HTMLElement>('[data-wb-palette-window]')) {
        const box = win.getBoundingClientRect()
        slots.push({
          type: win.getAttribute('data-wb-palette-window') ?? '',
          left: box.left - origin.left,
          top: box.top - origin.top,
          width: box.width,
          height: box.height,
        })
      }
      const next = { slots, width: track.scrollWidth, height: track.offsetHeight }
      setLayout((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    }
    measure()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    observer?.observe(track)
    return () => observer?.disconnect()
  }, [props.types])

  return (
    <div className="wb-shell-palette-cards">
      <div className="wb-shell-palette-track" ref={trackRef}>
        <PaletteThumbs slots={layout.slots} width={layout.width} height={layout.height} />
        {props.types.map((type) => (
          <button
            key={type.type}
            type="button"
            className="wb-shell-palette-card"
            data-wb-palette-card={type.type}
            title={`${type.type} — ${type.description}`}
          >
            <span className="wb-shell-palette-window" data-wb-palette-window={type.type} />
            <span className="wb-shell-palette-label">{type.label}</span>
          </button>
        ))}
      </div>
    </div>
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
