/**
 * **하단 컴포넌트 판** — 캔버스와 하단 바 사이에 펼쳐지는 판(spec `docs/superpowers/specs/2026-10-01-component-drag-design.md`
 * 「하단 컴포넌트 목록」). 셸 그리드의 `palette` 줄이다(`shell.css` 의 `.wb-shell` · `.wb-shell-palette`).
 *
 * **서는 조건 · 높이 · 열림은 셸이 갖는다** — 셸(`routes/editor.tsx`)이 편집 모드 · `canEdit` · 기억한 열림(`shell/sidebar-layout.ts` 머리말
 * «하단 판의 높이»)으로 이 부품을 그리거나 안 그린다. 여기는 그 높이를 위쪽 손잡이(`ShellResizer` · `orientation="horizontal"`)로 나른다 —
 * 위로 끌면 판이 커지므로 `reversed` 다.
 *
 * ## 위층 탭 — «컴포넌트 | 모듈»
 *
 * 판 머리의 첫 탭 줄이 판의 내용을 고른다 — «컴포넌트»(아래 갈래 탭 · 검색 · 카드)와 «모듈»(`./module-tab.tsx`). 하단 바의 여는 단추는 하나다.
 * **마지막에 고른 탭은 브라우저 저장소에 기억한다**(사람 · 탭마다 — `localStorage` 의 `PALETTE_VIEW_KEY`). 읽기 · 쓰기가 던지면(사생활 창 · 막힌
 * 저장소) 기억 없이 «컴포넌트»로 선다 — 기억은 편의다. 검색 칸은 탭마다 따로다(한쪽의 검색어가 다른 쪽을 거르지 않는다).
 *
 * ## 목록 — 갈래 탭 · 이름 검색 · 카드
 *
 * 카드는 `+` 의 타입 고르개와 같은 목록이다(`panels/type-picker.tsx` 의 `placeableGroups` — 페이지에 둘 수 있는 타입 · 갈래 차례 · 갈래 안은
 * 한국어 이름 차례). 탭이 갈래를 고르고, 검색어가 있으면 갈래를 가리지 않고 한국어 이름 · 영문 타입에 그 글이 든 카드만 선다(대소문자 무시 ·
 * 둘 다 NFC 로 맞춰 견준다 — 자모로 풀어 쓴 입력(NFD)도 같은 이름이다).
 *
 * **카드 줄은 Tab 정지점 하나다**(로빙 탭 인덱스) — 카드가 스물 가까이라 하나씩 Tab 을 먹으면 판을 지나는 데 스무 번이 든다. 정지점은
 * 카드마다의 «넣기» 단추이고 화살표 · Home/End 가 카드 사이를 옮긴다. 탭 줄도 같다.
 *
 * ## 카드 — 끌면 놓고, 단추로 넣는다
 *
 * - **몸통은 끌기 전용이다**: 끌기 장치(`drag/use-pointer-drag.ts`)에 `{ kind: 'new', type }` 을 묶고 놓을 자리 · 표시 · 놓기는 경로 층
 *   (`drag/use-placement.ts`)에 맡긴다 — 캔버스 손잡이와 같은 길이다(캔버스가 다시 잴 때 마지막 좌표로 다시 묻는 것까지 —
 *   `useCanvasRemeasured`). 끄는 동안 포인터 곁에 카드 이름표가 따라온다. 몸통을 누르기만 하고 떼면(문턱 안) **아무것도 안 한다** —
 *   넣지도 고르지도 않는다. 누름 한 번이 넣기면 끌려다 문턱을 못 넘은 손이 노드를 넣는다. 몸통은 단추가 아니다(포커스를 안 받는다).
 * - **«넣기» 단추**(오른쪽 위 `+` 아이콘 — 접근 이름 · `title` `<한국어 이름> 넣기`): 누름 · Enter 가 고른 노드에 따라 자리를 골라(`./palette-add.ts`) 지금
 *   편집 전송 길(`useEditCommit` 의 `commitOps`)로 넣고 넣은 노드를 고른다. 누른 채의 키 반복(`event.repeat`)은 넣지 않는다. **더블클릭 · 연달아 친 Enter 의 둘째도 안 넣는다** — 같은 카드를 `DOUBLE_CLICK_MS` 안에 다시 누른 것(포인터는 `DOUBLE_CLICK_SLOP` 안의 같은 자리)은 첫 넣기가 이미 한 일이다(고치기 전: 노드 둘 — 실브라우저). 다른 카드의 연타 · 간격이 지난 같은 카드는 넣는다. 못 넣으면 판
 *   머리에 이유 한 줄을 세운다 — 다음 누름이 걷고, 그 문장을 세운 판(페이지 · 고른 노드)이 바뀌어도 걷는다(판은 페이지를 옮겨도 셸과
 *   함께 남아, 걷는 입구를 세지 않고 문장에 판을 적어 둔다 — 한 번 어긋나면 비운다. 떠났다 돌아와도 다시 서지 않는다). 단추도 카드 안이라
 *   그 자리에서 문턱 밖으로 끌면 끌기다 — 끈 뒤의 `click` 은 끌기 장치가 삼켜 넣기로 새지 않는다.
 * - **이름은 «추가»가 아니라 «넣기»다** — 구조 트리 줄의 `+` 가 `<이름> 추가`(`panels/tree-row-actions.tsx`)라, playwright 의
 *   `getByRole(…, { name })`(부분 일치)이 «버튼 추가» 하나로 두 단추를 함께 잡는다.
 */
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactElement } from 'react'
import { COMPONENT_GROUP_LABELS, type ComponentGroup } from '@wirebound/schema'
import { dragDebug, round } from '../drag/drag-debug'
import { DropIndicator } from '../drag/drop-indicator'
import { useCanvasRemeasured, usePlacementDrop, usePublishPlacementPreview, type PlacementDrop } from '../drag/use-placement'
import { usePointerDrag, type DragPoint } from '../drag/use-pointer-drag'
import { createNode } from '../edit/create-node'
import { dropOps, type Placing } from '../edit/structure-drop'
import { useEditCommit } from '../edit/use-edit-commit'
import { placeableGroups, type PickableGroup, type PickableType } from '../panels/type-picker'
import { ShellResizer } from '../shell/shell-resizer'
import { shellIcon } from '../shell/icons'
import { openDocumentNow, useEditorStore, useEditorStoreInstance } from '../store/use-editor-store'
import { ModuleTab } from './module-tab'
import { paletteAddTarget } from './palette-add'
import { DOUBLE_CLICK_MS, DOUBLE_CLICK_SLOP } from '../shell/action-menu'
import { PaletteThumbs, type ThumbSlot } from './palette-thumbs'

/** 판의 id — 하단 바의 토글이 `aria-controls` 로 가리킨다. */
export const PALETTE_ID = 'wb-shell-palette'

/** 판의 위층 탭 — 머리말 «위층 탭». */
export type PaletteView = 'components' | 'modules'

/** 마지막에 고른 위층 탭을 기억하는 저장소 열쇠. */
export const PALETTE_VIEW_KEY = 'wb.palette.view'

const VIEWS: readonly { view: PaletteView; label: string }[] = [
  { view: 'components', label: '컴포넌트' },
  { view: 'modules', label: '모듈' },
]

/** 기억한 탭 — 못 읽으면(던짐 · 없음 · 모르는 값) «컴포넌트». */
export function readPaletteView(): PaletteView {
  try {
    return window.localStorage.getItem(PALETTE_VIEW_KEY) === 'modules' ? 'modules' : 'components'
  } catch {
    return 'components'
  }
}

/** 고른 탭을 적는다 — 던지면 안 적는다(기억은 편의다). */
function writePaletteView(view: PaletteView): void {
  try {
    window.localStorage.setItem(PALETTE_VIEW_KEY, view)
  } catch {
    // 막힌 저장소 — 이 판의 고름은 그대로 서고 다음 판에 기억하지 않는다.
  }
}

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
  return groups
    .flatMap((group) => group.types)
    .filter((type) => searchable(type.label).includes(wanted) || searchable(type.type).includes(wanted))
}

/** 줄 안에서 화살표 · Home/End 가 옮겨 갈 차례. 그 키가 아니면 `null`. */
export function rovingStep(key: string, index: number, count: number): number | null {
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
  const [view, setView] = useState<PaletteView>(readPaletteView)
  const [group, setGroup] = useState<string>(() => groups[0]?.group ?? '')
  const [query, setQuery] = useState('')
  const [moduleQuery, setModuleQuery] = useState('')
  const store = useEditorStoreInstance()
  const selected = useEditorStore(store, (s) => s.selectedNodeId)
  /** 거절 문장과 그것을 세운 판(머리말 «카드»). 위층 탭을 바꾸면 걷는다. */
  const [notice, setNotice] = useState<{ text: string; pageId: string | undefined; selected: string | null; view: PaletteView } | null>(
    null,
  )
  if (notice !== null && (notice.pageId !== props.pageId || notice.selected !== selected || notice.view !== view)) setNotice(null)
  const tabRefs = useRef(new Map<string, HTMLButtonElement>())
  const viewRefs = useRef(new Map<PaletteView, HTMLButtonElement>())
  const onNotice = useCallback(
    (text: string) => setNotice(text === '' ? null : { text, pageId: props.pageId, selected: store.getState().selectedNodeId, view }),
    [props.pageId, store, view],
  )

  const pickView = (next: PaletteView): void => {
    setView(next)
    writePaletteView(next)
  }
  const moveView = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const next = rovingStep(event.key, index, VIEWS.length)
    if (next === null) return
    event.preventDefault()
    const target = VIEWS[next]!
    pickView(target.view)
    viewRefs.current.get(target.view)?.focus()
  }
  const viewTabs = (
    <div className="wb-shell-palette-tabs wb-shell-palette-views" role="tablist" aria-label="목록 종류">
      {VIEWS.map((entry, index) => (
        <button
          key={entry.view}
          ref={(element) => {
            if (element === null) viewRefs.current.delete(entry.view)
            else viewRefs.current.set(entry.view, element)
          }}
          type="button"
          role="tab"
          className="wb-shell-palette-tab"
          aria-selected={entry.view === view}
          tabIndex={entry.view === view ? 0 : -1}
          onClick={() => pickView(entry.view)}
          onKeyDown={(event) => moveView(event, index)}
        >
          {entry.label}
        </button>
      ))}
    </div>
  )
  const noticeLine = (
    <p className="wb-shell-palette-notice" role="status" data-wb-palette-notice="">
      {notice?.text ?? ''}
    </p>
  )

  if (view === 'modules') {
    return (
      <>
        <div className="wb-shell-palette-head">
          {viewTabs}
          <input
            type="search"
            className="wb-shell-palette-search"
            aria-label="모듈 찾기"
            placeholder="이름으로 찾기"
            value={moduleQuery}
            onChange={(event) => setModuleQuery(event.target.value)}
          />
          {noticeLine}
        </div>
        <ModuleTab projectId={props.projectId} pageId={props.pageId} onNotice={onNotice} query={moduleQuery} />
      </>
    )
  }

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
        {viewTabs}
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
        {noticeLine}
      </div>
      <PaletteCards projectId={props.projectId} pageId={props.pageId} types={types} onNotice={onNotice} />
    </>
  )
}

/**
 * 카드 판 — 정해진 크기의 카드가 판 폭에 맞춰 여러 줄로 감싸이고 넘치면 판이 세로로 스크롤한다(설계서 「설계서 화면 구조」 «컴포넌트 목록»). 카드는
 * 판 높이를 따라 늘지 않는다 — 판을 키우면 줄이 더 보인다(크기는 `shell.css` 의 `.wb-shell-palette-card`). 카드마다 축소판이 비쳐 보이는
 * 창(투명한 자리) · 한국어 이름 · «넣기» 단추가 선다. 축소판 깔개(`./palette-thumbs.tsx`)는 트랙 뒤에 같은 크기로 깔리고, 여기서 잰 창 좌표로
 * 표본을 옮긴다.
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
  // 끄는 사이 캔버스가 다시 재면(남의 편집이 노드를 밂) 마지막 좌표로 다시 묻는다 — 손잡이와 같은 길(`canvas/canvas-drag-handle.tsx`
  // 머리말 «캔버스가 다시 잴 때»). 판은 캔버스의 형제라 그 값을 경로 층으로 받는다.
  useCanvasRemeasured(drag.refresh)
  const hint = placement.live(drag.hint)
  // 보인 자리를 캔버스에 미리보기로 끼운다 — 캔버스 위의 선 · 강조는 미리보기가 대신하고, 트리 위면 트리의 선 · 강조도 그린다
  // (`drag/use-placement.ts` 머리말 «배치 미리보기»).
  usePublishPlacementPreview(hint?.value ?? null)
  const dragged =
    drag.dragging?.kind === 'new' ? props.types.find((type) => type.type === (drag.dragging as { type: string }).type) : undefined

  const trackRef = useRef<HTMLDivElement | null>(null)
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])
  const [active, setActive] = useState(0)
  const focusIndex = Math.min(active, Math.max(0, props.types.length - 1))
  const [layout, setLayout] = useState<{ slots: ThumbSlot[]; width: number; height: number }>({ slots: [], width: 0, height: 0 })

  // 창 좌표를 잰다 — 카드가 바뀌거나 트랙 크기가 바뀌면(판 폭 — 줄이 다시 감싸인다 · 판 높이) 다시.
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
      const next = { slots, width: track.offsetWidth, height: track.offsetHeight }
      setLayout((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    }
    measure()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null
    observer?.observe(track)
    return () => observer?.disconnect()
  }, [props.types])

  /** 마지막으로 **넣은** «넣기» 누름 — 같은 카드의 더블클릭 · Enter 두 번의 둘째를 버린다(머리말 «카드»). 못 넣은(거절) 누름은 안 적는다. */
  const lastAdd = useRef<{ type: string; at: number; x: number; y: number; pointer: boolean } | null>(null)

  /**
   * 더블클릭 · 연달아 친 Enter 의 **둘째**인가 — 같은 카드를 `DOUBLE_CLICK_MS` 안에 다시 눌렀다. 포인터는 자리도 본다(`DOUBLE_CLICK_SLOP` 안 — 단추 안
   * 같은 자리). 다른 카드의 연타 · 간격이 지난 같은 카드의 누름은 뜻한 넣기다.
   */
  const repeatsLastAdd = (type: string, event: MouseEvent<HTMLButtonElement>): boolean => {
    const previous = lastAdd.current
    if (previous === null || previous.type !== type || performance.now() - previous.at >= DOUBLE_CLICK_MS) return false
    const pointer = event.detail > 0
    return !pointer || !previous.pointer || Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= DOUBLE_CLICK_SLOP
  }

  /** «넣기» 단추의 누름 · Enter — 고른 노드에 따라 넣는다(`./palette-add.ts`). */
  const add = (type: string, event: MouseEvent<HTMLButtonElement>): void => {
    if (props.pageId === undefined) return
    if (repeatsLastAdd(type, event)) return
    const document = openDocumentNow(store, props.pageId)
    if (document === null) return
    const placing: Placing = { kind: 'new', type }
    const verdict = paletteAddTarget({
      document,
      selectedNodeId: store.getState().selectedNodeId,
      placing,
      blockedBy: store.editBlockedBy,
      lockedBy: store.lockedBy,
    })
    if (!verdict.ok) {
      props.onNotice(verdict.reason)
      return
    }
    props.onNotice('')
    const node = createNode(type)
    if (node === null) return
    if (commitOps(dropOps(document, placing, verdict.target, node))) {
      store.selectNode(node.id)
      lastAdd.current = { type, at: performance.now(), x: event.clientX, y: event.clientY, pointer: event.detail > 0 }
    }
  }

  const moveCard = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    // 누른 채의 키 반복은 넣지 않는다 — 단추는 반복 keydown 마다 `click` 을 내어 한 번 누름이 넣기 여럿이 된다(첫 누름만 넣는다).
    if (event.repeat && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      return
    }
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
          <div
            key={type.type}
            className="wb-shell-palette-card"
            data-wb-palette-card={type.type}
            title={`${type.type} — ${type.description}`}
            // 새 객체를 렌더마다 묶는다 — 경로 층이 끌기의 판을 이 객체에 단다(`drag/use-placement.ts` 머리말 «판은 끄는 것 객체로»).
            {...drag.bind({ kind: 'new', type: type.type })}
          >
            <span className="wb-shell-palette-window" data-wb-palette-window={type.type} />
            <span className="wb-shell-palette-label">{type.label}</span>
            <button
              ref={(element) => {
                cardRefs.current[index] = element
              }}
              type="button"
              className="wb-shell-palette-add"
              aria-label={`${type.label} 넣기`}
              title={`${type.label} 넣기`}
              tabIndex={index === focusIndex ? 0 : -1}
              onFocus={() => setActive(index)}
              onKeyDown={(event) => moveCard(event, index)}
              onClick={(event) => add(type.type, event)}
            >
              {shellIcon('add', 14)}
            </button>
          </div>
        ))}
      </div>
      <DropIndicator hint={hint?.value.region === 'tree' ? hint : null} layout={hint?.value.layout} />
      {dragged !== undefined && pointer !== null && (
        <div
          ref={logTagShown}
          className="wb-shell-palette-dragtag"
          aria-hidden="true"
          style={{ left: pointer.x + 14, top: pointer.y + 14 }}
        >
          {dragged.label}
        </div>
      )}
    </div>
  )
}

/**
 * 이름표가 섰다 — 끌기 진단 줄(`drag/drag-debug.ts`)의 `tag` 한 줄(누름마다 한 번 — 개발 판의 `StrictMode` 는 ref 를 두 번 부른다). 꺼진 판은 아무것도
 * 안 짓는다. 상자를 적는 것은 «이름표조차 안 선다» 와 «섰는데 안 보인다(크기 0 · 화면 밖)» 를 가르려는 것이다.
 */
function logTagShown(element: HTMLDivElement | null): void {
  if (element === null) return
  const debug = dragDebug()
  if (debug === null) return
  const box = element.getBoundingClientRect()
  debug.once('tag', {
    label: element.textContent ?? '',
    left: round(box.left),
    top: round(box.top),
    width: round(box.width),
    height: round(box.height),
  })
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
      {shellIcon('palette', 14, 'wb-shell-icon-lead')}
      컴포넌트
    </button>
  )
}
