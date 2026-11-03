/**
 * **하단 판의 «모듈» 탭** — 모듈 묶음을 골라 넣는다(설계 spec `docs/superpowers/specs/2026-10-18-modules-states-layout-design.md` 「B2」 · 「B3」 ·
 * `2026-10-20-personal-modules-design.md`). 판의 위층 탭(«컴포넌트 | 모듈» — `./component-palette.tsx`)이 이것을 그린다.
 *
 * ## 묶음 둘
 *
 * | 묶음 | 어디서 | 카드 |
 * |---|---|---|
 * | 개인 모듈 | 서버(`GET /api/me/modules` — 사람이 소유하고 그 사람이 여는 모든 프로젝트에 선다) | 이름 · 노드 수 · «넣기» · «이름 바꾸기» · «삭제» · «프로젝트 모듈로 복사» |
 * | 프로젝트 모듈 | 서버(`GET …/modules`) | 이름 · 노드 수 · «넣기» · «이름 바꾸기» · «삭제» · «개인 모듈로 복사» |
 *
 * 두 서버 목록은 탭을 열 때와 저장 · 이름 · 삭제 · 복사 뒤에 다시 읽는다(방송은 없다). 비었으면 그 묶음이 어디서 채우는지 한 줄을 말한다.
 *
 * ## 무엇이 서는가 — 셋을 가른다
 *
 * 판은 편집할 수 없는 판(viewer · editor 이상의 뷰 모드)에도 선다(셸 — `routes/editor.tsx`). 카드의 단추는 두 값이 가른다:
 *
 * | 값 | 셸의 무엇 | 서는 것 |
 * |---|---|---|
 * | `insertable` | 편집 모드 && 고칠 수 있다 | «넣기» 단추 · 카드 끌기 — 문서를 바꾸는 길 전부 |
 * | `projectWritable` | 고칠 수 있다(editor 이상 — 모드와 무관하다. 모듈 쓰기는 문서 편집이 아니다) | 프로젝트 모듈의 «이름 바꾸기» · «삭제», 개인 카드의 «프로젝트 모듈로 복사» |
 * | (늘) | — | 개인 모듈의 «이름 바꾸기» · «삭제» · 프로젝트 카드의 «개인 모듈로 복사» — 내 것이라 역할과 무관하다 |
 *
 * 서버가 같은 것을 다시 막는다 — 프로젝트 모듈 쓰기는 editor 가드, 개인 모듈은 세션의 그 사람만.
 *
 * ## 넣기 — 단추는 고른 노드 곁에, 끌기는 놓은 자리에
 *
 * 자리는 컴포넌트 카드와 같은 규칙이다 — 단추(Enter)는 `paletteAddTarget`(고른 것 없음 · 뿌리 → 페이지 끝, 방금 넣어 고른 노드 → 그 기준 노드 바로 뒤,
 * 자식을 받는 노드 → 그 안 끝, 잎 → 바로 뒤 — `./palette-add.ts` 머리말 «연달아 넣기»), 끌기는 경로 층(`drag/use-placement.ts`)이 판정한 자리다. 넣는 편집은
 * `./module-insert.ts` 다(편집 하나 · 되돌리기 한 번 · 넣은 노드를 «방금 넣음» 으로 고른다 — `store.selectPlaced`).
 *
 * **넣기는 비동기다** — 개인 · 프로젝트 모듈은 그 모듈 하나를 다시 읽고(탭을 연 뒤 지웠으면 404 → «이 모듈은 지워졌습니다» · 목록 다시 읽기),
 * 페이지를 겨냥하는 액션이 있으면 프로젝트 트리도 읽는다(붙여넣기와 같다 — `shell/editor-keys.tsx` 의 `paste`). 개인 모듈은 다른 프로젝트에서
 * 저장했을 수 있어 이 프로젝트에 없는 페이지 · 넣는 페이지에 없는 노드를 겨냥하는 동작이 흔히 빠진다 — 뺀 수를 정보 통지로 말한다. 그 사이
 * 페이지를 옮겼으면 넣지 않고 말한다 — 판은 페이지 id 가 아니라 판을 연 세대(`pageOpenEpoch`)로 가른다(붙여넣기의 판단과 같다). 자리는 **다 읽은
 * 뒤의 문서로** 판정한다 — 읽는 사이 남이 고쳤을 수 있다.
 *
 * **넣을 수 있는가를 넣는 순간에 다시 본다** — 판은 뷰 모드 · 강등에도 남으므로 끄는 중 · 읽는 중에 넣을 수 없게 될 수 있다. 그 값이 바뀌면 카드
 * 판을 다시 마운트해(끌기를 끊는다) 놓기가 오지 않게 하고, 그래도 온 넣기(읽는 사이 바뀜)는 보내기 직전에 그 값을 보고 버린다.
 *
 * **더블클릭 · 연달아 친 Enter 의 둘째는 안 넣는다** — 컴포넌트 카드의 «넣기» 와 같은 판정(`DOUBLE_CLICK_MS` · `DOUBLE_CLICK_SLOP`)이다. 넣는 중
 * (읽는 사이)의 다음 누름도 버린다.
 *
 * ## 복사 — 다시 읽고 새로 저장한다
 *
 * «프로젝트 모듈로 복사» · «개인 모듈로 복사» 는 원본 하나를 다시 읽고(지워졌으면 넣기와 같은 404 길) 그 이름 · 노드로 대상 쪽 저장을 부른다 — 서버의
 * 복사 엔드포인트가 따로 없다(`apps/api` 의 `routes/personal-modules.ts` 머리말). 사본은 새 모듈이라 원본과 이어지지 않는다. 끝나면 대상 목록을
 * 다시 읽고 정보 통지(`copiedNotice`)를 세운다.
 */
import { useCallback, useEffect, useRef, useState, type MouseEvent, type ReactElement } from 'react'
import { MODULE_NAME_MAX, matchPageTargets, type PageDocument, type WbNode } from '@wirebound/schema'
import { ApiError, type ApiClient } from '../api/client'
import { useApi } from '../api/context'
import { toFailure } from '../api/failure'
import type { PersonalModule, ProjectModule } from '../api/types'
import { DropIndicator, DropRefusal } from '../drag/drop-indicator'
import {
  useCanvasRemeasured,
  usePlacementDrop,
  usePublishDragging,
  usePublishPlacementPreview,
  type PlacementDrop,
} from '../drag/use-placement'
import { usePointerDrag, type DragPoint } from '../drag/use-pointer-drag'
import { claimNodeImages, claimNodeImagesToMe } from '../edit/claim-images'
import { hasPageTargets, pageTargetsOf } from '../edit/paste-ops'
import type { Placing, StructureDrop } from '../edit/structure-drop'
import { useEditCommit } from '../edit/use-edit-commit'
import { lockedNotice } from '../panels/property-panel'
import { DOUBLE_CLICK_MS, DOUBLE_CLICK_SLOP } from '../shell/action-menu'
import { shellIcon } from '../shell/icons'
import { openDocumentNow, useEditorStoreInstance } from '../store/use-editor-store'
import { moduleDroppedNotice, moduleInsertOps } from './module-insert'
import { paletteAddTarget } from './palette-add'

/** 개인 모듈이 없을 때의 안내 한 줄. */
export const NO_PERSONAL_MODULES = "구조 트리에서 노드를 골라 '모듈로 저장'에서 '개인 모듈'을 고르면 여기에 섭니다"
/** 프로젝트 모듈이 없을 때의 안내 한 줄. */
export const NO_PROJECT_MODULES = "구조 트리에서 노드를 골라 '모듈로 저장'하면 여기에 섭니다"
/** 넣거나 복사하려던 모듈이 그 사이 지워졌다(404). */
export const MODULE_GONE_NOTICE = '이 모듈은 지워졌습니다'

/** 복사했다 — 정보 통지 자리의 한 줄. */
export function copiedNotice(name: string, to: 'project' | 'personal'): string {
  return `'${name}' 을 ${to === 'project' ? '프로젝트 모듈' : '개인 모듈'}로 복사했습니다`
}
/** 넣을 노드를 읽는 사이 페이지를 옮겼다(떠나 머묾 · 떠났다 돌아옴). */
export const MODULE_LEFT_NOTICE = '넣는 사이 페이지를 옮겨 넣지 않았습니다. 다시 넣으세요.'
/** 목록 · 모듈 · 페이지 목록을 못 읽었다(서버 문장이 없을 때). */
const READ_FAILURE = '모듈을 읽지 못했습니다. 다시 시도하세요.'

/** 카드 하나 — 끌기 표본 · 넣기 원천. `key` 는 `Placing.key` 와 같다. */
interface ModuleCard {
  key: string
  name: string
  /** 카드의 둘째 줄(«노드 N개»). */
  detail: string
  /** 끌기 미리보기 · 판정의 표본(`Placing` 머리말). */
  sample: readonly WbNode[]
  source: { kind: 'personal'; module: PersonalModule } | { kind: 'project'; module: ProjectModule }
}

/** 바뀐 목록 — 개인(사람 하나) · 프로젝트 하나. */
export type ModulesScope = { kind: 'personal' } | { kind: 'project'; projectId: string }

/**
 * 모듈 목록이 바뀌었다 — «모듈로 저장…» 상자(`panels/save-module-dialog.tsx`)와 이 탭의 복사가 저장한 뒤 부른다. 탭이 열려 있으면 그 목록을 다시
 * 읽는다(방송이 없다 — 같은 사람의 같은 화면 안 소식이다).
 */
const listeners = new Set<(scope: ModulesScope) => void>()
export function announceModulesChanged(scope: ModulesScope): void {
  for (const listener of [...listeners]) listener(scope)
}

type Listed<T> = { status: 'loading' | 'ready' | 'failed'; modules: T[] }

/** 서버 목록 하나 — 읽기 · 다시 읽기 · 세대(늦게 온 앞 응답을 버린다). 실패는 판 머리의 한 줄로 말한다. */
function useModuleList<T>(read: () => Promise<T[]>, onNotice: (text: string) => void): { listed: Listed<T>; reload: () => void } {
  const [listed, setListed] = useState<Listed<T>>({ status: 'loading', modules: [] })
  const generation = useRef(0)
  const reload = useCallback(() => {
    const mine = (generation.current += 1)
    read().then(
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
  }, [read, onNotice])
  useEffect(
    () => () => {
      generation.current += 1
    },
    [],
  )
  return { listed, reload }
}

/** 묶음의 빈 줄 — 읽는 중 · 하나도 없음 · 검색에 안 맞음. */
function emptyLine(listed: Listed<unknown>, none: string): string {
  return listed.status === 'loading' ? '읽는 중…' : listed.modules.length === 0 ? none : '맞는 모듈이 없습니다'
}

/** 검색에 쓰는 꼴 — 컴포넌트 탭의 검색과 같다(NFC · 소문자). */
function searchable(text: string): string {
  return text.normalize('NFC').toLowerCase()
}

export function ModuleTab(props: {
  projectId: string
  pageId: string | undefined
  onNotice: (text: string) => void
  query: string
  /** 넣기 단추 · 끌기가 서는가 — 편집 모드 && 고칠 수 있다(머리말 «무엇이 서는가»). */
  insertable: boolean
  /** 프로젝트 모듈을 쓸 수 있는가 — editor 이상(모드와 무관하다). */
  projectWritable: boolean
}): ReactElement {
  const api = useApi()
  const { onNotice } = props
  const readPersonal = useCallback(() => api.listMyModules(), [api])
  const readProject = useCallback(() => api.listModules(props.projectId), [api, props.projectId])
  const personal = useModuleList(readPersonal, onNotice)
  const project = useModuleList(readProject, onNotice)
  const reloadPersonal = personal.reload
  const reloadProject = project.reload

  // 탭을 열 때 읽는다(머리말 «묶음 둘»). 같은 화면에서 저장 · 복사했으면 그 목록을 다시 읽는다.
  useEffect(() => {
    reloadPersonal()
    reloadProject()
    const listener = (scope: ModulesScope): void => {
      if (scope.kind === 'personal') reloadPersonal()
      else if (scope.projectId === props.projectId) reloadProject()
    }
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [reloadPersonal, reloadProject, props.projectId])

  const wanted = searchable(props.query.trim())
  const matches = (card: ModuleCard): boolean => wanted === '' || searchable(card.name).includes(wanted)

  const personalCards: ModuleCard[] = personal.listed.modules.map((module) => ({
    key: `personal:${module.id}`,
    name: module.name,
    detail: `노드 ${module.nodeCount}개`,
    sample: module.nodes,
    source: { kind: 'personal', module },
  }))
  const projectCards: ModuleCard[] = project.listed.modules.map((module) => ({
    key: `project:${module.id}`,
    name: module.name,
    detail: `노드 ${module.nodeCount}개`,
    sample: module.nodes,
    source: { kind: 'project', module },
  }))

  const insert = useModuleInsert({
    projectId: props.projectId,
    pageId: props.pageId,
    insertable: props.insertable,
    onNotice,
    onGone: (kind) => (kind === 'personal' ? reloadPersonal() : reloadProject()),
  })

  return (
    <ModuleCards
      // 넣을 수 있는가가 바뀌면 다시 마운트한다 — 끄던 끌기를 끊는다(머리말 «넣을 수 있는가를 넣는 순간에 다시 본다»).
      key={props.insertable ? 'insertable' : 'read-only'}
      projectId={props.projectId}
      pageId={props.pageId}
      insert={insert}
      insertable={props.insertable}
      projectWritable={props.projectWritable}
      groups={[
        { label: '개인 모듈', cards: personalCards.filter(matches), empty: emptyLine(personal.listed, NO_PERSONAL_MODULES) },
        { label: '프로젝트 모듈', cards: projectCards.filter(matches), empty: emptyLine(project.listed, NO_PROJECT_MODULES) },
      ]}
      onNotice={onNotice}
      onChanged={(kind) => (kind === 'personal' ? reloadPersonal() : reloadProject())}
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
  insertable: boolean
  onNotice: (text: string) => void
  onGone: (kind: 'personal' | 'project') => void
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
      if (pageId === undefined || busy.current || !live.current.input.insertable) return false
      busy.current = true
      try {
        const opened = store.pageOpenEpoch()
        const module = await reread(api, projectId, card.source, onNotice, onGone)
        if (module === null) return false
        // 개인 모듈의 그림은 이 프로젝트로 먼저 가져온다 — 못 가져온 것은 비우고 넣은 뒤 말한다(`edit/claim-images.ts`). 프로젝트 모듈은 같은 프로젝트다.
        const claimed = card.source.kind === 'personal' ? await claimNodeImages(api, projectId, module.nodes, { personal: true }) : null
        const nodes = claimed === null ? module.nodes : claimed.nodes
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
            selectedZone: store.getState().selectedZone,
            placing: { kind: 'module', key: card.key, nodes },
            blockedBy: store.editBlockedBy,
            lockedBy: store.lockedBy,
            justPlaced: store.getState().justPlaced,
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

        const edit = moduleInsertOps(document, nodes, target, (page) => pages !== null && matchPageTargets(pages, page).length > 0)
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
        // 읽는 사이 뷰 모드 · 강등으로 넣을 수 없게 됐다 — 보내지 않는다(머리말 «넣을 수 있는가를 넣는 순간에 다시 본다»).
        if (!live.current.input.insertable) return false
        onNotice('')
        if (!live.current.commitOps(edit.ops)) return false
        const last = edit.selectIds[edit.selectIds.length - 1]
        if (last !== undefined) store.selectPlaced(edit.selectIds, last)
        const dropped = [moduleDroppedNotice(edit), claimed?.notice ?? ''].filter((line) => line !== '').join(' ')
        if (dropped !== '') store.setInfoNotice(dropped)
        return true
      } finally {
        busy.current = false
      }
    },
    [api, store],
  )
}

/**
 * 넣기 · 복사 직전에 그 모듈 하나를 다시 읽는다(머리말 «넣기는 비동기다»). 지워졌으면(404) «이 모듈은 지워졌습니다» 를 말하고 그 목록을 다시 읽게
 * 하고 `null`, 다른 실패도 말하고 `null`.
 */
async function reread(
  api: ApiClient,
  projectId: string,
  source: { kind: 'personal'; module: PersonalModule } | { kind: 'project'; module: ProjectModule },
  onNotice: (text: string) => void,
  onGone: (kind: 'personal' | 'project') => void,
): Promise<ProjectModule | null> {
  try {
    return source.kind === 'personal' ? await api.getMyModule(source.module.id) : await api.getModule(projectId, source.module.id)
  } catch (caught) {
    if (caught instanceof ApiError && caught.code === 'not-found') {
      onNotice(MODULE_GONE_NOTICE)
      onGone(source.kind)
    } else {
      const failure = toFailure(caught, READ_FAILURE)
      onNotice(failure.kind === 'message' ? failure.message : READ_FAILURE)
    }
    return null
  }
}

interface CardGroup {
  label: string
  cards: ModuleCard[]
  /** 카드가 없을 때의 한 줄. */
  empty: string
}

function ModuleCards(props: {
  projectId: string
  pageId: string | undefined
  insert: Insert
  insertable: boolean
  projectWritable: boolean
  groups: CardGroup[]
  onNotice: (text: string) => void
  onChanged: (kind: 'personal' | 'project') => void
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
    refusal: placement.refusalOf,
  })
  useCanvasRemeasured(drag.refresh)
  const hint = placement.live(drag.hint)
  usePublishPlacementPreview(hint?.value ?? null)
  // 끄는 것을 캔버스에 알린다 — 받을 수 있는 빈 구역마다 점선 칸이 선다(`canvas/empty-zones.tsx`).
  usePublishDragging(drag.dragging)
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
                    // 넣을 수 없는 판에는 끌기가 없다 — 몸통이 끌기 전용이라 그때는 아무것도 안 한다(머리말 «무엇이 서는가»).
                    {...(props.insertable ? drag.bind({ kind: 'module', key: card.key, nodes: card.sample }) : {})}
                  >
                    <span className="wb-shell-module-name">{card.name}</span>
                    <span className="wb-shell-module-detail">{card.detail}</span>
                    <span className="wb-shell-module-actions">
                      {props.insertable && (
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
                      )}
                      <SavedModuleActions
                        projectId={props.projectId}
                        source={card.source}
                        writable={card.source.kind === 'personal' || props.projectWritable}
                        copyable={card.source.kind === 'project' || props.projectWritable}
                        onNotice={props.onNotice}
                        onChanged={props.onChanged}
                      />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>
      <DropIndicator hint={hint?.value.region === 'tree' ? hint : null} layout={hint?.value.layout} />
      <DropRefusal refusal={drag.refusal} />
      {dragged !== undefined && pointer !== null && (
        <div className="wb-shell-palette-dragtag" aria-hidden="true" style={{ left: pointer.x + 14, top: pointer.y + 14 }}>
          {dragged.name}
        </div>
      )}
    </div>
  )
}

/**
 * 개인 · 프로젝트 모듈 카드의 «이름 바꾸기» · «삭제» · 복사. 이름 바꾸기는 카드 안의 이름 칸(Enter 저장 · Escape 취소), 삭제는 한 번 더 묻는다
 * («삭제 확인» · «취소») — 되돌릴 길이 없다. 끝나면 목록을 다시 읽는다(없어졌으면 — 404 — 그 사실을 말하고 다시 읽는다). 복사는 머리말 «복사».
 */
function SavedModuleActions(props: {
  projectId: string
  source: { kind: 'personal'; module: PersonalModule } | { kind: 'project'; module: ProjectModule }
  /** 이름 바꾸기 · 삭제가 서는가 — 개인은 늘, 프로젝트는 editor 이상. */
  writable: boolean
  /** 다른 묶음으로 복사가 서는가 — 개인 → 프로젝트는 editor 이상, 프로젝트 → 개인은 늘. */
  copyable: boolean
  onNotice: (text: string) => void
  onChanged: (kind: 'personal' | 'project') => void
}): ReactElement {
  const api = useApi()
  const store = useEditorStoreInstance()
  const { kind, module } = props.source
  const to = kind === 'personal' ? 'project' : 'personal'
  const copyLabel = `${module.name} ${to === 'project' ? '프로젝트 모듈로 복사' : '개인 모듈로 복사'}`
  const [mode, setMode] = useState<'idle' | 'renaming' | 'deleting'>('idle')
  const [name, setName] = useState(module.name)
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
    props.onChanged(kind)
  }

  const rename = (): void => {
    if (nameWhy !== undefined || pending) return
    if (trimmed === module.name) {
      setMode('idle')
      return
    }
    setPending(true)
    const renamed =
      kind === 'personal'
        ? api.renameMyModule(module.id, { name: trimmed })
        : api.renameModule(props.projectId, module.id, { name: trimmed })
    renamed.then(
      () => {
        setPending(false)
        setMode('idle')
        props.onNotice('')
        props.onChanged(kind)
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
    const removed = kind === 'personal' ? api.deleteMyModule(module.id) : api.deleteModule(props.projectId, module.id)
    removed.then(
      () => {
        setPending(false)
        setMode('idle')
        props.onNotice('')
        props.onChanged(kind)
      },
      (caught: unknown) => {
        setPending(false)
        setMode('idle')
        settle(caught)
      },
    )
  }

  /** 복사 — 원본을 다시 읽고(지웠으면 404 길) 그 이름 · 노드로 대상 쪽에 새로 저장한다(머리말 «복사»). */
  const copy = (): void => {
    if (pending) return
    setPending(true)
    void (async () => {
      try {
        const fresh = await reread(api, props.projectId, props.source, props.onNotice, props.onChanged)
        if (fresh === null) return
        // 그림도 옮긴다(`edit/claim-images.ts`) — 프로젝트로는 못 가져온 것을 비우고 말하고, 개인 몫으로는 하나라도 못 가져오면 복사하지 않는다.
        let nodes = fresh.nodes
        let imageNotice: string | null = null
        if (to === 'project') {
          const claimed = await claimNodeImages(api, props.projectId, fresh.nodes, { personal: true })
          nodes = claimed.nodes
          imageNotice = claimed.notice
        } else {
          const refusal = await claimNodeImagesToMe(api, props.projectId, fresh.nodes)
          if (refusal !== null) {
            props.onNotice(refusal)
            return
          }
        }
        const body = { name: fresh.name, nodes }
        await (to === 'project' ? api.createModule(props.projectId, body) : api.createMyModule(body))
        props.onNotice('')
        announceModulesChanged(to === 'project' ? { kind: 'project', projectId: props.projectId } : { kind: 'personal' })
        store.setInfoNotice(imageNotice === null ? copiedNotice(fresh.name, to) : `${copiedNotice(fresh.name, to)} ${imageNotice}`)
      } catch (caught) {
        const failure = toFailure(caught, '모듈을 복사하지 못했습니다. 다시 시도하세요.')
        props.onNotice(failure.kind === 'message' ? failure.message : '모듈을 복사하지 못했습니다. 다시 시도하세요.')
      } finally {
        setPending(false)
      }
    })()
  }

  if (mode === 'renaming') {
    return (
      // 칸 안의 누름이 카드의 끌기로 새지 않게 한다(글자를 끌어 고르는 누름 — 카드 몸통이 끌기다).
      <span className="wb-shell-module-edit" data-wb-holds-keys="" onPointerDown={(event) => event.stopPropagation()}>
        <input
          className="wb-shell-module-name-input"
          aria-label={`${module.name} 새 이름`}
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
              setName(module.name)
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
      {props.writable && (
        <>
          <button
            type="button"
            className="wb-shell-palette-add wb-shell-module-action"
            aria-label={`${module.name} 이름 바꾸기`}
            title={`${module.name} 이름 바꾸기`}
            onClick={() => {
              setName(module.name)
              setMode('renaming')
            }}
          >
            {shellIcon('rename', 14)}
          </button>
          <button
            type="button"
            className="wb-shell-palette-add wb-shell-module-action"
            aria-label={`${module.name} 삭제`}
            title={`${module.name} 삭제`}
            onClick={() => setMode('deleting')}
          >
            {shellIcon('remove', 14)}
          </button>
        </>
      )}
      {props.copyable && (
        <button
          type="button"
          className="wb-shell-palette-add wb-shell-module-action"
          aria-label={copyLabel}
          title={copyLabel}
          disabled={pending}
          onClick={copy}
        >
          {shellIcon('copyModule', 14)}
        </button>
      )}
    </>
  )
}
