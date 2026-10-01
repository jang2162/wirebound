/**
 * **하단 컴포넌트 판** — 캔버스와 하단 바 사이에 펼쳐지는 판(spec `docs/superpowers/specs/2026-10-01-component-drag-design.md`
 * 「하단 컴포넌트 목록」). 셸 그리드의 `palette` 줄이다(`shell.css` 의 `.wb-shell` · `.wb-shell-palette`).
 *
 * **서는 조건 · 높이 · 열림은 셸이 갖는다** — 셸(`routes/editor.tsx`)이 편집 모드 · `canEdit` · 기억한 열림(`shell/sidebar-layout.ts` 머리말
 * «하단 판의 높이»)으로 이 부품을 그리거나 안 그린다. 여기는 그 높이를 위쪽 손잡이(`ShellResizer` · `orientation="horizontal"`)로 나른다 —
 * 위로 끌면 판이 커지므로 `reversed` 다.
 *
 * ## 목록 — 갈래 탭 · 이름 검색 · 카드
 *
 * 카드는 `+` 의 타입 고르개와 같은 목록이다(`panels/type-picker.tsx` 의 `placeableGroups` — 페이지에 둘 수 있는 타입 · 갈래 차례 · 갈래 안은
 * 한국어 이름 차례). 탭이 갈래를 고르고, 검색어가 있으면 갈래를 가리지 않고 한국어 이름 · 영문 타입에 그 글이 든 카드만 선다(대소문자 무시 ·
 * 둘 다 NFC 로 맞춰 견준다 — 자모로 풀어 쓴 입력(NFD)도 같은 이름이다).
 *
 * **카드 줄은 Tab 정지점 하나다**(로빙 탭 인덱스) — 카드가 스물 가까이라 하나씩 Tab 을 먹으면 판을 지나는 데 스무 번이 든다. 화살표 ·
 * Home/End 가 카드 사이를 옮긴다. 탭 줄도 같다.
 *
 * ## 카드 — 누르면 넣고, 끌면 놓는다
 *
 * - **누름 · Enter**(단추의 `click`): 고른 노드에 따라 자리를 골라(`./palette-add.ts`) 지금 편집 전송 길(`useEditCommit` 의 `commitOps`)로
 *   넣고 넣은 노드를 고른다. 못 넣으면 판 머리에 이유 한 줄을 세운다(다음 누름이 걷는다).
 * - **끌기**: 끌기 장치(`drag/use-pointer-drag.ts`)에 `{ kind: 'new', type }` 을 묶고 놓을 자리 · 표시 · 놓기는 경로 층
 *   (`drag/use-placement.ts`)에 맡긴다 — 캔버스 손잡이와 같은 길이다. 끄는 동안 포인터 곁에 카드 이름표가 따라온다. 끈 뒤의 `click` 은 끌기
 *   장치가 삼켜 «누름» 으로 새지 않는다.
 */
import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import { COMPONENT_GROUP_LABELS, type ComponentGroup } from '@wirebound/schema'
import { DropIndicator } from '../drag/drop-indicator'
import { usePlacementDrop, type PlacementDrop } from '../drag/use-placement'
import { usePointerDrag, type DragPoint } from '../drag/use-pointer-drag'
import { createNode } from '../edit/create-node'
import { dropOps, type Placing } from '../edit/structure-drop'
import { useEditCommit } from '../edit/use-edit-commit'
import { placeableGroups, type PickableGroup, type PickableType } from '../panels/type-picker'
import { ShellResizer } from '../shell/shell-resizer'
import { openDocumentNow, useEditorStoreInstance } from '../store/use-editor-store'
import { paletteAddTarget } from './palette-add'
import { PaletteThumbs, type ThumbSlot } from './palette-thumbs'

/** 판의 id — 하단 바의 토글이 `aria-controls` 로 가리킨다. */
export const PALETTE_ID = 'wb-shell-palette'

export function ComponentPalette(props: {
  projectId: string
  pageId: string | undefined
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
      <PaletteBody projectId={props.projectId} pageId={props.pageId} />
    </section>
  )
}

/** 검색에 쓰는 꼴 — NFC · 소문자. */
function searchable(text: string): string {
  return text.normalize('NFC').toLowerCase()
}

/** 검색어에 맞는 카드 — 한국어 이름 · 영문 타입. 갈래 차례 그대로. */
function matching(groups: readonly PickableGroup[], query: string): PickableType[] {
  const wanted = searchable(query.trim())
  return groups.flatMap((group) => group.types).filter((type) => searchable(type.label).includes(wanted) || searchable(type.type).includes(wanted))
}

/** 줄 안에서 화살표 · Home/End 가 옮겨 갈 차례. 그 키가 아니면 `null`. */
function rovingStep(key: string, index: number, count: number): number | null {
  if (count === 0) return null
  if (key === 'ArrowRight') return Math.min(count - 1, index + 1)
  if (key === 'ArrowLeft') return Math.max(0, index - 1)
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return null
}

function PaletteBody(props: { projectId: string; pageId: string | undefined }): ReactElement {
  // 카탈로그는 실행 중에 안 바뀐다 — 고르개와 같이 한 번만 센다.
  const groups = useMemo(placeableGroups, [])
  const [group, setGroup] = useState<string>(() => groups[0]?.group ?? '')
  const [query, setQuery] = useState('')
  const [notice, setNotice] = useState('')
  const tabRefs = useRef(new Map<string, HTMLButtonElement>())

  const types = query.trim() === '' ? (groups.find((entry) => entry.group === group)?.types ?? []) : matching(groups, query)

  const moveTab = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const next = rovingStep(event.key, index, groups.length)
    if (next === null) return
    event.preventDefault()
    const target = groups[next]
    if (target === undefined) return
    setGroup(target.group)
    tabRefs.current.get(target.group)?.focus()
  }

  return (
    <>
      <div className="wb-shell-palette-head">
        <div className="wb-shell-palette-tabs" role="tablist" aria-label="갈래">
          {groups.map((entry, index) => (
            <button
              key={entry.group}
              ref={(element) => {
                if (element === null) tabRefs.current.delete(entry.group)
                else tabRefs.current.set(entry.group, element)
              }}
              type="button"
              role="tab"
              className="wb-shell-palette-tab"
              aria-selected={entry.group === group}
              tabIndex={entry.group === group ? 0 : -1}
              onClick={() => setGroup(entry.group)}
              onKeyDown={(event) => moveTab(event, index)}
            >
              {COMPONENT_GROUP_LABELS[entry.group as ComponentGroup] ?? entry.label}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="wb-shell-palette-search"
          aria-label="컴포넌트 찾기"
          placeholder="이름 · 타입으로 찾기"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <p className="wb-shell-palette-notice" role="status" data-wb-palette-notice="">
          {notice}
        </p>
      </div>
      <PaletteCards projectId={props.projectId} pageId={props.pageId} types={types} onNotice={setNotice} />
    </>
  )
}

/**
 * 카드 줄 — 가로로 늘어서고 넘치면 가로 스크롤이다. 카드마다 축소판이 비쳐 보이는 창(투명한 자리)과 한국어 이름이 선다. 축소판 깔개
 * (`./palette-thumbs.tsx`)는 카드 줄(트랙) 뒤에 같은 크기로 깔리고, 여기서 잰 창 좌표로 표본을 옮긴다.
 */
function PaletteCards(props: {
  projectId: string
  pageId: string | undefined
  types: readonly PickableType[]
  onNotice: (text: string) => void
}): ReactElement {
  const store = useEditorStoreInstance()
  const { commitOps } = useEditCommit({ projectId: props.projectId, pageId: props.pageId ?? '' })
  const placement = usePlacementDrop({ projectId: props.projectId, pageId: props.pageId })
  /** 끄는 포인터의 마지막 좌표 — 이름표 자리 · 끝 스크롤할 상자를 고른다. */
  const [pointer, setPointer] = useState<DragPoint | null>(null)
  const last = useRef<DragPoint | null>(null)
  const drag = usePointerDrag<Placing, PlacementDrop>({
    onOver: (placing, point) => {
      last.current = point
      setPointer(point)
      return placement.onOver(placing, point)
    },
    onDrop: placement.onDrop,
    sameDrop: placement.sameDrop,
    scrollContainer: () => (last.current === null ? null : placement.scrollContainerAt(last.current)),
  })
  const hint = placement.live(drag.hint)
  const dragged = drag.dragging?.kind === 'new' ? props.types.find((type) => type.type === (drag.dragging as { type: string }).type) : undefined

  const trackRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [active, setActive] = useState(0)
  const focusIndex = Math.min(active, Math.max(0, props.types.length - 1))
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

  /** 누름 · Enter — 고른 노드에 따라 넣는다(`./palette-add.ts`). */
  const add = (type: string): void => {
    if (props.pageId === undefined) return
    const document = openDocumentNow(store, props.pageId)
    if (document === null) return
    const verdict = paletteAddTarget({
      document,
      selectedNodeId: store.getState().selectedNodeId,
      type,
      blockedBy: store.editBlockedBy,
      lockedBy: store.lockedBy,
    })
    if (!verdict.ok) {
      props.onNotice(verdict.reason)
      return
    }
    props.onNotice('')
    const placing: Placing = { kind: 'new', type }
    const node = createNode(type)
    if (node === null) return
    if (commitOps(dropOps(document, placing, verdict.target, node))) store.selectNode(node.id)
  }

  const moveCard = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const next = rovingStep(event.key, index, props.types.length)
    if (next === null) return
    event.preventDefault()
    setActive(next)
    cardRefs.current[next]?.focus()
  }

  return (
    <div className="wb-shell-palette-cards">
      <div className="wb-shell-palette-track" ref={trackRef} role="group" aria-label="컴포넌트 카드">
        <PaletteThumbs slots={layout.slots} width={layout.width} height={layout.height} />
        {props.types.length === 0 && <p className="wb-shell-palette-empty">맞는 컴포넌트가 없습니다</p>}
        {props.types.map((type, index) => (
          <button
            key={type.type}
            ref={(element) => {
              cardRefs.current[index] = element
            }}
            type="button"
            className="wb-shell-palette-card"
            data-wb-palette-card={type.type}
            title={`${type.type} — ${type.description}`}
            tabIndex={index === focusIndex ? 0 : -1}
            onFocus={() => setActive(index)}
            onKeyDown={(event) => moveCard(event, index)}
            onClick={() => add(type.type)}
            // 새 객체를 렌더마다 묶는다 — 경로 층이 끌기의 판을 이 객체에 단다(`drag/use-placement.ts` 머리말 «판은 끄는 것 객체로»).
            {...drag.bind({ kind: 'new', type: type.type })}
          >
            <span className="wb-shell-palette-window" data-wb-palette-window={type.type} />
            <span className="wb-shell-palette-label">{type.label}</span>
          </button>
        ))}
      </div>
      <DropIndicator hint={hint} layout={hint?.value.layout} />
      {dragged !== undefined && pointer !== null && (
        <div className="wb-shell-palette-dragtag" aria-hidden="true" style={{ left: pointer.x + 14, top: pointer.y + 14 }}>
          {dragged.label}
        </div>
      )}
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
