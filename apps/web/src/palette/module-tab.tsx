/**
 * **하단 판의 «모듈» 탭** — 모듈 묶음을 골라 넣는다(설계 spec `docs/superpowers/specs/2026-10-18-modules-states-layout-design.md` 「B2」 · 「B3」).
 * 판의 위층 탭(«컴포넌트 | 모듈» — `./component-palette.tsx`)이 이것을 그린다.
 *
 * ## 묶음 셋
 *
 * | 묶음 | 어디서 | 카드 |
 * |---|---|---|
 * | 프로젝트 모듈 | 서버(`GET …/modules` — 탭을 열 때 · 저장 · 이름 · 삭제 뒤에 다시 읽는다. 방송은 없다) | 이름 · 노드 수 · «넣기» · «이름 바꾸기» · «삭제» |
 * | 기본 모듈 | `@wirebound/schema` 의 `BUILTIN_MODULES`(읽기 전용) | 이름 · 노드 수 · «넣기» |
 * | 테마 패턴 | 캔버스가 그리는 테마의 manifest `patterns`(읽기 전용 — `./theme-patterns.ts` 의 `themePatterns`) | 이름 · 범주 · «넣기» |
 *
 * 프로젝트 모듈이 하나도 없으면 «구조 트리에서 노드를 골라 '모듈로 저장'» 한 줄이 선다. 판은 편집할 수 있는 사람(editor 이상 · 편집 모드)에게만
 * 서므로(셸 — `routes/editor.tsx`) 이름 바꾸기 · 삭제를 다시 가리지 않는다.
 *
 * ## 넣기 — 단추는 고른 노드 곁에, 끌기는 놓은 자리에
 *
 * 자리는 컴포넌트 카드와 같은 규칙이다 — 단추(Enter)는 `paletteAddTarget`(고른 것 없음 · 뿌리 → 페이지 끝, 자식을 받는 노드 → 그 안 끝, 잎 → 바로 뒤),
 * 끌기는 경로 층(`drag/use-placement.ts`)이 판정한 자리다. 넣는 편집은 `./module-insert.ts` 다(편집 하나 · 되돌리기 한 번 · 넣은 노드를 고른다).
 *
 * **넣기는 비동기다** — 프로젝트 모듈은 그 모듈 하나를 다시 읽고(`GET …/modules/:id` — 탭을 연 뒤 남이 지웠으면 404 → «이 모듈은 지워졌습니다» ·
 * 목록 다시 읽기), 페이지를 겨냥하는 액션이 있으면 프로젝트 트리도 읽는다(붙여넣기와 같다 — `shell/editor-keys.tsx` 의 `paste`). 그 사이 페이지를
 * 옮겼으면 넣지 않고 말한다 — 판은 페이지 id 가 아니라 판을 연 세대(`pageOpenEpoch`)로 가른다(붙여넣기의 판단과 같다). 자리는 **다 읽은 뒤의 문서로**
 * 판정한다 — 읽는 사이 남이 고쳤을 수 있다. 기본 모듈 · 패턴은 읽을 것이 없어 같은 걸음을 곧바로 지난다.
 *
 * **더블클릭 · 연달아 친 Enter 의 둘째는 안 넣는다** — 컴포넌트 카드의 «넣기» 와 같은 판정(`DOUBLE_CLICK_MS` · `DOUBLE_CLICK_SLOP`)이다. 넣는 중
 * (읽는 사이)의 다음 누름도 버린다.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactElement } from 'react'
import { BUILTIN_MODULES, MODULE_NAME_MAX, countModuleNodes, matchPageTargets, type PageDocument, type WbNode } from '@wirebound/schema'
import { NO_THEME } from '@wirebound/renderer'
import { expandPattern, type ThemePattern } from '@wirebound/themes'
import { ApiError } from '../api/client'
import { useApi } from '../api/context'
import { toFailure } from '../api/failure'
import type { ProjectModule } from '../api/types'
import { DropIndicator } from '../drag/drop-indicator'
import { useCanvasRemeasured, usePlacementDrop, usePublishPlacementPreview, type PlacementDrop } from '../drag/use-placement'
import { usePointerDrag, type DragPoint } from '../drag/use-pointer-drag'
import { hasPageTargets, pageTargetsOf } from '../edit/paste-ops'
import type { ExpandedNodes } from '../edit/pattern-insert'
import type { Placing, StructureDrop } from '../edit/structure-drop'
import { useEditCommit } from '../edit/use-edit-commit'
import { lockedNotice } from '../panels/property-panel'
import { DOUBLE_CLICK_MS, DOUBLE_CLICK_SLOP } from '../shell/action-menu'
import { shellIcon } from '../shell/icons'
import { openDocumentNow, useEditorStoreInstance } from '../store/use-editor-store'
import { useProjectTheme } from '../theme/project-theme'
import { moduleDroppedNotice, moduleInsertOps, type ModuleBundle } from './module-insert'
import { paletteAddTarget } from './palette-add'
import { EMPTY_NOTICE, themePatterns } from './theme-patterns'

/** 프로젝트 모듈이 없을 때의 안내 한 줄. */
export const NO_PROJECT_MODULES = "구조 트리에서 노드를 골라 '모듈로 저장'하면 여기에 섭니다"
/** 넣으려던 프로젝트 모듈이 그 사이 지워졌다(404). */
export const MODULE_GONE_NOTICE = '이 모듈은 지워졌습니다'
/** 넣을 노드를 읽는 사이 페이지를 옮겼다(떠나 머묾 · 떠났다 돌아옴). */
export const MODULE_LEFT_NOTICE = '넣는 사이 페이지를 옮겨 넣지 않았습니다. 다시 넣으세요.'
/** 목록 · 모듈 · 페이지 목록을 못 읽었다(서버 문장이 없을 때). */
const READ_FAILURE = '모듈을 읽지 못했습니다. 다시 시도하세요.'
/** 패턴 전개가 실패했다 — 테마를 고쳐야 한다. */
function brokenPattern(name: string): string {
  return `패턴을 넣지 못했습니다 — ${name}. 테마의 패턴을 고쳐야 합니다.`
}

/** 카드 하나 — 끌기 표본 · 넣기 원천. `key` 는 `Placing.key` 와 같다. */
interface ModuleCard {
  key: string
  name: string
  /** 카드의 둘째 줄(«노드 N개» · 패턴 범주). */
  detail: string
  /** 끌기 미리보기 · 판정의 표본(`Placing` 머리말). */
  sample: readonly WbNode[]
  source:
    | { kind: 'project'; module: ProjectModule }
    | { kind: 'builtin'; nodes: readonly WbNode[] }
    | { kind: 'pattern'; key: string; pattern: ThemePattern }
}

/**
 * 프로젝트 모듈 목록이 바뀌었다 — «모듈로 저장…» 상자(`panels/save-module-dialog.tsx`)가 저장한 뒤 부른다. 탭이 열려 있으면 목록을 다시 읽는다(방송이
 * 없다 — 같은 사람의 같은 화면 안 소식이다).
 */
const listeners = new Set<(projectId: string) => void>()
export function announceModulesChanged(projectId: string): void {
  for (const listener of [...listeners]) listener(projectId)
}

/** 검색에 쓰는 꼴 — 컴포넌트 탭의 검색과 같다(NFC · 소문자). */
function searchable(text: string): string {
  return text.normalize('NFC').toLowerCase()
}

/** 패턴 키의 범주 — 설계서 「patterns — 테마가 소유한 구성 레시피」가 패턴 이름을 `<범주>.<변형>` 으로 정했다. 표시일 뿐이다(판정은 `checkPatterns`). */
function patternCategory(key: string): string {
  return key.includes('.') ? key.slice(0, key.indexOf('.')) : key
}

/** 끌기 표본으로 쓸 패턴 전개 — 결정적 id(렌더마다 같은 표본). 전개가 실패하면 빈 표본이다(그 카드의 끌기는 놓을 자리가 없다). */
function patternSample(key: string, pattern: ThemePattern): readonly WbNode[] {
  let next = 0
  return expandPattern(pattern, () => `pv_${key.replace(/[^A-Za-z0-9_-]/g, '_')}_${(next += 1)}`).expanded?.nodes ?? []
}

export function ModuleTab(props: {
  projectId: string
  pageId: string | undefined
  onNotice: (text: string) => void
  query: string
}): ReactElement {
  const api = useApi()
  const [listed, setListed] = useState<{ status: 'loading' | 'ready' | 'failed'; modules: ProjectModule[] }>({
    status: 'loading',
    modules: [],
  })
  const generation = useRef(0)
  const { onNotice } = props

  const reload = useCallback(() => {
    const mine = (generation.current += 1)
    api.listModules(props.projectId).then(
      (modules) => {
        if (generation.current === mine) setListed({ status: 'ready', modules })
      },
      (caught: unknown) => {
        if (generation.current !== mine) return
        setListed((prev) => ({ status: 'failed', modules: prev.modules }))
        const failure = toFailure(caught, READ_FAILURE)
        onNotice(failure.kind === 'message' ? failure.message : READ_FAILURE)
      },
    )
  }, [api, props.projectId, onNotice])

  // 탭을 열 때 읽는다(머리말 «묶음 셋»). 같은 화면에서 저장했으면 다시 읽는다.
  useEffect(() => {
    reload()
    const listener = (projectId: string): void => {
      if (projectId === props.projectId) reload()
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
      generation.current += 1
    }
  }, [reload, props.projectId])

  const manifest = useProjectTheme().manifest ?? NO_THEME.manifest
  const patterns = useMemo(() => themePatterns(manifest), [manifest])
  const wanted = searchable(props.query.trim())
  const matches = (card: ModuleCard): boolean => wanted === '' || searchable(card.name).includes(wanted)

  const projectCards: ModuleCard[] = listed.modules.map((module) => ({
    key: `project:${module.id}`,
    name: module.name,
    detail: `노드 ${module.nodeCount}개`,
    sample: module.nodes,
    source: { kind: 'project', module },
  }))
  const builtinCards: ModuleCard[] = BUILTIN_MODULES.map((entry) => ({
    key: `builtin:${entry.key}`,
    name: entry.name,
    detail: `노드 ${countModuleNodes(entry.nodes)}개`,
    sample: entry.nodes,
    source: { kind: 'builtin', nodes: entry.nodes },
  }))
  const patternCards: ModuleCard[] = patterns.entries.map(([key, pattern]) => ({
    key: `pattern:${key}`,
    name: pattern.name,
    detail: patternCategory(key),
    sample: patternSample(key, pattern),
    source: { kind: 'pattern', key, pattern },
  }))

  const insert = useModuleInsert({ projectId: props.projectId, pageId: props.pageId, onNotice, onGone: reload })

  return (
    <ModuleCards
      projectId={props.projectId}
      pageId={props.pageId}
      insert={insert}
      groups={[
        {
          label: '프로젝트 모듈',
          cards: projectCards.filter(matches),
          empty: listed.status === 'loading' ? '읽는 중…' : listed.modules.length === 0 ? NO_PROJECT_MODULES : '맞는 모듈이 없습니다',
          editable: true,
        },
        { label: '기본 모듈', cards: builtinCards.filter(matches), empty: '맞는 모듈이 없습니다', editable: false },
        {
          label: '테마 패턴',
          cards: patternCards.filter(matches),
          empty: patterns.broken ?? (patterns.entries.length === 0 ? EMPTY_NOTICE : '맞는 패턴이 없습니다'),
          editable: false,
        },
      ]}
      onNotice={onNotice}
      onChanged={reload}
    />
  )
}

/** 넣는 곳 — 단추(고른 노드 곁) · 놓은 자리(그때의 문서로 다시 판정하는 함수). */
type Where = { kind: 'button' } | { kind: 'drop'; verdict: (doc: PageDocument) => StructureDrop | null }

/** 넣기 한 걸음(머리말 «넣기는 비동기다»). 넣었으면 `true`. */
type Insert = (card: ModuleCard, where: Where) => Promise<boolean>

function useModuleInsert(input: {
  projectId: string
  pageId: string | undefined
  onNotice: (text: string) => void
  onGone: () => void
}): Insert {
  const api = useApi()
  const store = useEditorStoreInstance()
  const { commitOps } = useEditCommit({ projectId: input.projectId, pageId: input.pageId ?? '' })
  const live = useRef({ commitOps, input })
  live.current = { commitOps, input }
  const busy = useRef(false)

  return useCallback(
    async (card: ModuleCard, where: Where): Promise<boolean> => {
      const { pageId, onNotice, onGone, projectId } = live.current.input
      if (pageId === undefined || busy.current) return false
      busy.current = true
      try {
        const opened = store.pageOpenEpoch()
        let bundle: ModuleBundle
        if (card.source.kind === 'project') {
          let module: ProjectModule
          try {
            module = await api.getModule(projectId, card.source.module.id)
          } catch (caught) {
            if (caught instanceof ApiError && caught.code === 'not-found') {
              onNotice(MODULE_GONE_NOTICE)
              onGone()
            } else {
              const failure = toFailure(caught, READ_FAILURE)
              onNotice(failure.kind === 'message' ? failure.message : READ_FAILURE)
            }
            return false
          }
          bundle = { kind: 'nodes', nodes: module.nodes }
        } else if (card.source.kind === 'builtin') {
          bundle = { kind: 'nodes', nodes: card.source.nodes }
        } else {
          const { expanded } = expandPattern(card.source.pattern)
          if (expanded === null) {
            onNotice(brokenPattern(card.name))
            return false
          }
          bundle = { kind: 'pattern', expanded: expanded as ExpandedNodes }
        }

        const nodes = bundle.kind === 'nodes' ? bundle.nodes : bundle.expanded.nodes
        let pages: ReturnType<typeof pageTargetsOf> | null = null
        if (hasPageTargets(nodes)) {
          try {
            pages = pageTargetsOf(await api.getTree(projectId))
          } catch (caught) {
            const failure = toFailure(caught, READ_FAILURE)
            onNotice(failure.kind === 'message' ? failure.message : READ_FAILURE)
            return false
          }
        }
        if (store.pageOpenEpoch() !== opened) {
          onNotice(MODULE_LEFT_NOTICE)
          return false
        }
        const document = openDocumentNow(store, pageId)
        if (document === null) return false

        let target: StructureDrop | null
        if (where.kind === 'button') {
          const verdict = paletteAddTarget({
            document,
            selectedNodeId: store.getState().selectedNodeId,
            placing: { kind: 'module', key: card.key, nodes },
            blockedBy: store.editBlockedBy,
            lockedBy: store.lockedBy,
          })
          if (!verdict.ok) {
            onNotice(verdict.reason)
            return false
          }
          target = verdict.target
        } else {
          target = where.verdict(document)
          if (target === null) return false
        }

        const edit = moduleInsertOps(document, bundle, target, (page) => pages !== null && matchPageTargets(pages, page).length > 0)
        if ('reason' in edit) {
          onNotice(edit.reason)
          return false
        }
        // 보내기 전에 서버의 2차 방어와 같은 물음을 한 번 더(붙여넣기의 `commitInsert` 와 같은 자리). **이 줄을 떼도 죽는 케이스가 없다** — 자리
        // 판정(`paletteAddTarget` · 놓기의 다시 판정)이 같은 자리의 넣기를 이미 같은 물음으로 걸렀다. 남기는 것은 그 판정과 다른 노드(다시 읽은
        // 모듈의 첫 노드)로 지은 편집이라서다 — 잠금은 경로로 가르므로 오늘은 같은 답이다.
        const blocker = store.editBlockedBy(edit.ops)
        if (blocker !== null) {
          onNotice(lockedNotice(blocker.userName))
          return false
        }
        onNotice('')
        if (!live.current.commitOps(edit.ops)) return false
        const last = edit.selectIds[edit.selectIds.length - 1]
        if (last !== undefined) store.selectMany(edit.selectIds, 'replace', last)
        const dropped = moduleDroppedNotice(edit)
        if (dropped !== '') store.setInfoNotice(dropped)
        return true
      } finally {
        busy.current = false
      }
    },
    [api, store],
  )
}

interface CardGroup {
  label: string
  cards: ModuleCard[]
  /** 카드가 없을 때의 한 줄. */
  empty: string
  /** 이름 바꾸기 · 삭제가 서는가(프로젝트 모듈). */
  editable: boolean
}

function ModuleCards(props: {
  projectId: string
  pageId: string | undefined
  insert: Insert
  groups: CardGroup[]
  onNotice: (text: string) => void
  onChanged: () => void
}): ReactElement {
  const cards = props.groups.flatMap((group) => group.cards)
  const placement = usePlacementDrop({
    projectId: props.projectId,
    pageId: props.pageId,
    onModuleDrop: (placing, verdict) => {
      const card = cards.find((entry) => entry.key === placing.key)
      if (card !== undefined) void props.insert(card, { kind: 'drop', verdict })
    },
  })
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
  useCanvasRemeasured(drag.refresh)
  const hint = placement.live(drag.hint)
  usePublishPlacementPreview(hint?.value ?? null)
  const dragged = drag.dragging?.kind === 'module' ? cards.find((card) => card.key === (drag.dragging as { key: string }).key) : undefined

  /** 마지막으로 넣은 누름 — 같은 카드의 더블클릭 · Enter 두 번의 둘째를 버린다(머리말 «넣기»). */
  const lastAdd = useRef<{ key: string; at: number; x: number; y: number; pointer: boolean } | null>(null)
  const repeatsLastAdd = (key: string, event: MouseEvent<HTMLButtonElement>): boolean => {
    const previous = lastAdd.current
    if (previous === null || previous.key !== key || performance.now() - previous.at >= DOUBLE_CLICK_MS) return false
    const fromPointer = event.detail > 0
    return !fromPointer || !previous.pointer || Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= DOUBLE_CLICK_SLOP
  }
  const add = (card: ModuleCard, event: MouseEvent<HTMLButtonElement>): void => {
    if (repeatsLastAdd(card.key, event)) return
    const at = { key: card.key, at: performance.now(), x: event.clientX, y: event.clientY, pointer: event.detail > 0 }
    void props.insert(card, { kind: 'button' }).then((inserted) => {
      if (inserted) lastAdd.current = at
    })
  }

  return (
    <div className="wb-shell-palette-cards">
      <div className="wb-shell-module-groups">
        {props.groups.map((group) => (
          <section key={group.label} className="wb-shell-module-group" aria-label={group.label}>
            <h3 className="wb-shell-module-group-head">{group.label}</h3>
            {group.cards.length === 0 ? (
              <p className="wb-shell-module-empty">{group.empty}</p>
            ) : (
              <div className="wb-shell-module-track" role="group" aria-label={`${group.label} 카드`}>
                {group.cards.map((card) => (
                  <div
                    key={card.key}
                    className="wb-shell-module-card"
                    data-wb-module-card={card.key}
                    {...drag.bind({ kind: 'module', key: card.key, nodes: card.sample })}
                  >
                    <span className="wb-shell-module-name">{card.name}</span>
                    <span className="wb-shell-module-detail">{card.detail}</span>
                    <span className="wb-shell-module-actions">
                      <button
                        type="button"
                        className="wb-shell-palette-add wb-shell-module-action"
                        aria-label={`${card.name} 넣기`}
                        title={`${card.name} 넣기`}
                        onKeyDown={(event) => {
                          if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault()
                        }}
                        onClick={(event) => add(card, event)}
                      >
                        {shellIcon('add', 14)}
                      </button>
                      {group.editable && card.source.kind === 'project' && (
                        <ProjectModuleActions
                          projectId={props.projectId}
                          module={card.source.module}
                          onNotice={props.onNotice}
                          onChanged={props.onChanged}
                        />
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
      <DropIndicator hint={hint?.value.region === 'tree' ? hint : null} layout={hint?.value.layout} />
      {dragged !== undefined && pointer !== null && (
        <div className="wb-shell-palette-dragtag" aria-hidden="true" style={{ left: pointer.x + 14, top: pointer.y + 14 }}>
          {dragged.name}
        </div>
      )}
    </div>
  )
}

/**
 * 프로젝트 모듈 카드의 «이름 바꾸기» · «삭제». 이름 바꾸기는 카드 안의 이름 칸(Enter 저장 · Escape 취소), 삭제는 한 번 더 묻는다(«삭제 확인» · «취소»)
 * — 되돌릴 길이 없다. 끝나면 목록을 다시 읽는다(없어졌으면 — 404 — 그 사실을 말하고 다시 읽는다).
 */
function ProjectModuleActions(props: {
  projectId: string
  module: ProjectModule
  onNotice: (text: string) => void
  onChanged: () => void
}): ReactElement {
  const api = useApi()
  const [mode, setMode] = useState<'idle' | 'renaming' | 'deleting'>('idle')
  const [name, setName] = useState(props.module.name)
  const [pending, setPending] = useState(false)
  const trimmed = name.trim()
  const nameWhy =
    trimmed === '' ? '이름을 입력하세요' : trimmed.length > MODULE_NAME_MAX ? `이름은 ${MODULE_NAME_MAX}자 이하여야 합니다` : undefined

  const settle = (caught: unknown): void => {
    if (caught instanceof ApiError && caught.code === 'not-found') props.onNotice(MODULE_GONE_NOTICE)
    else {
      const failure = toFailure(caught, '모듈을 바꾸지 못했습니다. 다시 시도하세요.')
      props.onNotice(failure.kind === 'message' ? failure.message : '모듈을 바꾸지 못했습니다. 다시 시도하세요.')
    }
    props.onChanged()
  }

  const rename = (): void => {
    if (nameWhy !== undefined || pending) return
    if (trimmed === props.module.name) {
      setMode('idle')
      return
    }
    setPending(true)
    api.renameModule(props.projectId, props.module.id, { name: trimmed }).then(
      () => {
        setPending(false)
        setMode('idle')
        props.onNotice('')
        props.onChanged()
      },
      (caught: unknown) => {
        setPending(false)
        settle(caught)
      },
    )
  }

  const remove = (): void => {
    if (pending) return
    setPending(true)
    api.deleteModule(props.projectId, props.module.id).then(
      () => {
        setPending(false)
        setMode('idle')
        props.onNotice('')
        props.onChanged()
      },
      (caught: unknown) => {
        setPending(false)
        setMode('idle')
        settle(caught)
      },
    )
  }

  if (mode === 'renaming') {
    return (
      // 칸 안의 누름이 카드의 끌기로 새지 않게 한다(글자를 끌어 고르는 누름 — 카드 몸통이 끌기다).
      <span className="wb-shell-module-edit" data-wb-holds-keys="" onPointerDown={(event) => event.stopPropagation()}>
        <input
          className="wb-shell-module-name-input"
          aria-label={`${props.module.name} 새 이름`}
          value={name}
          maxLength={MODULE_NAME_MAX + 20}
          autoFocus
          disabled={pending}
          aria-invalid={nameWhy !== undefined}
          title={nameWhy}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return
            if (event.key === 'Enter') {
              event.preventDefault()
              rename()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              setName(props.module.name)
              setMode('idle')
            }
          }}
        />
        <button type="button" className="wb-shell-module-text-action" disabled={nameWhy !== undefined || pending} onClick={rename}>
          저장
        </button>
      </span>
    )
  }
  if (mode === 'deleting') {
    return (
      <span className="wb-shell-module-edit">
        <button type="button" className="wb-shell-module-text-action" disabled={pending} onClick={remove}>
          삭제 확인
        </button>
        <button type="button" className="wb-shell-module-text-action" disabled={pending} onClick={() => setMode('idle')}>
          취소
        </button>
      </span>
    )
  }
  return (
    <>
      <button
        type="button"
        className="wb-shell-palette-add wb-shell-module-action"
        aria-label={`${props.module.name} 이름 바꾸기`}
        title={`${props.module.name} 이름 바꾸기`}
        onClick={() => {
          setName(props.module.name)
          setMode('renaming')
        }}
      >
        {shellIcon('rename', 14)}
      </button>
      <button
        type="button"
        className="wb-shell-palette-add wb-shell-module-action"
        aria-label={`${props.module.name} 삭제`}
        title={`${props.module.name} 삭제`}
        onClick={() => setMode('deleting')}
      >
        {shellIcon('remove', 14)}
      </button>
    </>
  )
}
