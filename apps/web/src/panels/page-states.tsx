/**
 * **«페이지 정보» 탭의 상태 목록**(설계서 「설계서 화면 구조」의 «화면 상태») — 상태를 다루는 입구는 여기 하나다. 메뉴 트리의 상태 줄은
 * 고르기만 한다(`./state-rows.tsx`).
 *
 * | 무엇 | 어떻게 |
 * |---|---|
 * | 목록 | **열린 문서**의 상태(실시간 — 남이 더하거나 고친 상태가 곧바로 선다) · 트리 차례(`viewStateOrder`) · 하위 상태는 깊이만큼 들여 쓴다 · 설명은 이름 아래 글 |
 * | 쓰기 | 편집할 수 있는 판(`canEdit` — 편집 모드 · editor 이상, 메뉴 트리의 줄 행동이 서는 판과 같은 값)만. 줄마다 `…`: 하위 상태 추가 · 이름 바꾸기 · 설명 쓰기 · 위로 · 아래로 · 삭제, 목록 아래 «상태 추가» |
 * | 읽기 | 그 밖(뷰 모드 · viewer) — 이름과 설명의 글뿐 |
 *
 * **편집은 문서 경로 `/viewStates/…` 의 JSON Patch 다**(`@wirebound/schema` 의 `addViewStateOps` 등 — 묶음 하나가 편집 하나 · 되돌리기 한 번).
 * 이름 규칙을 어기면 보내지 않고 입력 아래에 까닭을 말한다(`nameProblem` — 규칙의 정본은 schema 의 봉투, 화면은 까닭을 고르는 몫만 한다). 설명은
 * 비우면 칸을 지운다(`describeViewStateOps`). 삭제는 확인 상자를 연다(`./remove-state-dialog.tsx`).
 *
 * ## 설명 초안은 패널 밖에 든다 — 페이지 설명과 같은 규칙
 *
 * 설명 상자는 여러 줄 · 저장 단추 상자라 페이지 설명 상자(`./page-description.tsx`)가 잰 손실을 그대로 진다. 그래서 같은 처방을 따른다:
 *
 * | 판 | 어떻게 |
 * |---|---|
 * | 탭 · 모드 왕복 | 초안을 `./panel-drafts.tsx`의 칸(`DRAFTS`)에 든다 — 이 본문은 탭 · 모드마다 내려간다(`page-description.tsx` 머리말 «탭·모드를 오가도 초안이 남는다»). 읽기만 하는 판(뷰 모드 · 강등)은 상자를 안 그리되 초안은 남는다 |
 * | 다른 상태의 «설명 쓰기» | 초안이 **상태마다** 있어 상자가 함께 열린다 — 탭의 이름 칸 · 페이지 설명 상자가 함께 열려 있는 것과 같다. 상자가 열려 있다 = 그 상태의 초안이 있다 |
 * | 남이 그 상태를 지움 | 초안은 줄 밖에 살아 목록 아래에 «지워졌습니다» 와 친 글이 남는다(`goneNotice`) — 줄째 내려가면 친 글이 말없이 사라진다(RV-PI H2) |
 * | 남이 같은 상태의 설명을 씀 | 초안이 연 때의 설명(`base`)을 들고 저장이 그것을 `test`로 싣는다(`describeViewStateOps`). 화면에 남의 글이 와 있으면 보내지 않고, 서버가 묶음째 거절하면 큐에서 빠진 뒤 문서로 안다 — 둘 다 `./meta-conflict.tsx` 의 화면이다(`settleDrafts`) |
 *
 * **열린 상자는 남의 새 설명을 보이지 않는다** — 친 글을 덮지 않는다. 남이 바꾼 것은 저장할 때 안다(페이지 설명과 같다 — 그쪽은 방송이 없어서지만
 * 화면의 꼴은 같다). 페이지가 바뀌면 provider 가 초안을 버린다(`page-description.tsx` 머리말 «페이지가 바뀌면 초안도 통지도 버린다»).
 */
import { useEffect, useState, type ReactElement } from 'react'
import {
  addViewStateOps,
  createNodeId,
  describeViewStateOps,
  hasRejectedAliasChar,
  isBlankAlias,
  moveViewStateOps,
  renameViewStateOps,
  stateLineage,
  tidyViewStateDescription,
  VIEW_STATE_DEPTH_MAX,
  VIEW_STATE_DESCRIPTION_MAX,
  VIEW_STATE_NAME_MAX,
  VIEW_STATES_MAX,
  viewStateOrder,
  type ViewState,
} from '@wirebound/schema'
import { useEditCommit } from '../edit/use-edit-commit'
import { ActionMenu, type ActionMenuItem } from '../shell/action-menu'
import { ICONS } from '../shell/icons'
import { useViewState } from '../shell/use-view-state'
import type { PendingEdit } from '../store/edit-queue'
import { useEditorStore, useEditorStoreInstance, useOpenDocument } from '../store/use-editor-store'
import { MetaConflict } from './meta-conflict'
import { slotsOf, usePanelSlot } from './panel-drafts'
import { RemoveStateDialog } from './remove-state-dialog'
import { TreeInput } from './tree-input'

/** 이 모듈의 칸을 선언한다(`./panel-drafts.tsx`의 `slotsOf`). */
const slot = slotsOf(import.meta.url)

/** 목록 아래 단추의 이름. */
export const ADD_STATE_LABEL = '상태 추가'
/** 상태 줄 `…` 의 «하위 상태 추가». */
export const ADD_SUBSTATE_LABEL = '하위 상태 추가'
/** 상태 줄 `…` 의 «설명 쓰기». */
export const DESCRIBE_STATE_LABEL = '설명 쓰기'
/** 상태 이름 입력의 접근 이름. */
export const STATE_NAME_LABEL = '상태 이름'
/** 상태 설명 상자의 접근 이름. */
export const STATE_DESCRIPTION_LABEL = '상태 설명'
/** 상태 설명 상자의 저장 단추 — 페이지 설명의 «설명 저장»과 이름이 갈려야 같은 탭에서 둘을 가른다. */
export const SAVE_STATE_DESCRIPTION_LABEL = '상태 설명 저장'
/** 상태가 없는 페이지의 한 줄. */
export const NO_STATES = '이 페이지에는 화면 상태가 없습니다'
/** 설명을 받지 않는 글의 까닭(`tidyViewStateDescription` 이 `null`). */
export const DESCRIPTION_PROBLEM = `설명은 ${VIEW_STATE_DESCRIPTION_MAX}자까지 쓸 수 있습니다`
/** 보낸 설명이 큐에서 빠졌는데 서버 문서가 바탕 그대로다 — 거절(잠금 · 남이 같은 상태의 이름을 고침 등). 까닭은 하단 바가 말한다. */
export const DESCRIPTION_NOT_SAVED = '이 설명은 저장되지 않았습니다 — 다시 저장할 수 있습니다'
/** 지워진 상태의 초안을 담는 자리의 접근 이름. */
export const GONE_DRAFT_LABEL = '지워진 상태의 설명'
/** 설명을 쓰던 상태가 지워졌을 때의 한 줄 — 누가 지웠는지 말하지 않는다(`routes/editor.tsx`의 «열어 둔 페이지가 지워졌습니다»와 같다). */
export function goneNotice(name: string): string {
  return `«${name}» 상태가 지워졌습니다. 쓰던 설명은 저장되지 않았습니다 — 필요하면 아래 글을 복사해 두세요.`
}

/** 열린 입력 — 무엇을 하는가. `parent` 가 `null` 이면 뿌리 상태를 더한다. 설명 상자는 여기 없다(`DRAFTS`). */
type StateInput = { kind: 'add'; parent: string | null } | { kind: 'rename'; stateId: string }

/** 상태 설명 초안 하나 — 머리말 «설명 초안은 패널 밖에 든다». */
interface StateDraft {
  /** 그 상태의 이름 — 상태가 지워지면 통지가 이 이름을 댄다. 상태가 있는 동안은 이름을 따라간다(`settleDrafts`). */
  name: string
  text: string
  /** 연 때의 설명(없었으면 `null`) — 저장이 `test`로 싣는다. «내 글로 덮기»는 남의 값으로 옮긴다. */
  base: string | null
  /** 보낸 편집의 `clientOpId` — 큐에서 빠질 때까지 상자를 닫고 결말을 기다린다(`settleDrafts`). */
  sent?: string
  /** 남이 바꿨다 — 그 사람의 값(`null` 은 «설명 없음»). 치는 동안에도 남는다(페이지 설명의 `keepConflict`). */
  theirs?: { value: string | null }
  /** 상자 아래 한 줄. 치면 지운다. */
  note?: 'too-long' | 'not-saved'
}

type StateDrafts = Readonly<Record<string, StateDraft>>
const NO_DRAFTS: StateDrafts = {}

/**
 * **상태 id → 초안.** 페이지 설명의 칸(`page-description/…`)과 이름이 갈린다 — 칸 이름이 겹치면 `slotsOf`가 던진다.
 *
 * 저장소에 비춘다(`./panel-drafts.tsx` 「저장소에 비춘다」) — 이름 · 글 · 바탕만. **보낸 표지 · 충돌은 안 비춘다** — 표지의 `clientOpId`는 그 문서의
 * 큐에서만 뜻이 있다. 되살린 초안은 상자로 서고, 그 사이 저장됐으면 다시 누를 때 «이미 그 글»로 닫힌다(`submitDescription`).
 */
const DRAFTS = slot<StateDrafts>('page-states/description-drafts', NO_DRAFTS, {
  save: (drafts) => {
    const kept = Object.entries(drafts).map(([id, draft]) => [id, { name: draft.name, text: draft.text, base: draft.base }] as const)
    return kept.length === 0 ? undefined : Object.fromEntries(kept)
  },
  // 모양이 틀린 항목만 버린다.
  load: (raw) => {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return undefined
    const drafts: Record<string, StateDraft> = {}
    for (const [id, entry] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof entry !== 'object' || entry === null) continue
      const { name, text, base } = entry as Record<string, unknown>
      if (typeof name === 'string' && typeof text === 'string' && (base === null || typeof base === 'string'))
        drafts[id] = { name, text, base }
    }
    return drafts
  },
})

/** 친 글이 서버에 설 값 — 빈 글은 «설명 없음»(`null`). 규칙 밖이면 `undefined`. */
function wantedOf(text: string): string | null | undefined {
  const tidy = tidyViewStateDescription(text)
  return tidy === null ? undefined : tidy === '' ? null : tidy
}

/** 보낸 표지 · 충돌 · 한 줄을 뗀 초안. */
function unsent(draft: StateDraft): StateDraft {
  return { name: draft.name, text: draft.text, base: draft.base }
}

/**
 * **문서 · 큐로 초안의 결말을 짓는다.** 바뀐 것이 없으면 `prev` 그대로다(칸이 다시 그리지 않는다).
 *
 * | 초안 | 그 상태 | 결말 |
 * |---|---|---|
 * | 보냈고 아직 큐에 있다 | — | 그대로 |
 * | 보냈고 큐에서 빠졌다 | 설명 = 친 글 | 버린다(저장됐다) |
 * | 〃 | 설명 = 바탕 | 상자를 다시 연다 · «저장되지 않았습니다» — 거절(잠금 · 남이 그 상태의 이름을 고쳐 항목째 견주기가 실패 · 연결을 잃어 다시 읽음) |
 * | 〃 | 그 밖 | 충돌 — 남의 값을 든다(서버가 바탕의 `test`로 묶음째 거절했다 · RV-PI H3) |
 * | 보냈든 안 보냈든 | 없다 | 보낸 표지를 떼고 남긴다 — 목록 아래 «지워졌습니다» |
 * | 안 보냈다 | 있다 | 이름만 따라간다 |
 *
 * 큐에서 빠진 것만 보고 ack 인지 거절인지는 안 가른다 — 문서가 말한다. ack 뒤 남의 편집이 같은 칸을 곧바로 바꾼 판은 충돌로 읽힌다(그 값은
 * 지금 서버의 것이라 거짓은 아니다).
 */
function settleDrafts(prev: StateDrafts, states: readonly ViewState[], pending: readonly PendingEdit[]): StateDrafts {
  let next: Record<string, StateDraft> | null = null
  const put = (id: string, draft: StateDraft | undefined): void => {
    next ??= { ...prev }
    if (draft === undefined) delete next[id]
    else next[id] = draft
  }
  for (const [id, draft] of Object.entries(prev)) {
    if (draft.sent !== undefined && pending.some((edit) => edit.clientOpId === draft.sent)) continue
    const state = states.find((entry) => entry.id === id)
    if (state === undefined) {
      if (draft.sent !== undefined) put(id, unsent(draft))
      continue
    }
    if (draft.sent === undefined) {
      if (state.name !== draft.name) put(id, { ...draft, name: state.name })
      continue
    }
    const current = state.description ?? null
    if (current === wantedOf(draft.text)) put(id, undefined)
    else if (current === draft.base) put(id, { ...unsent(draft), name: state.name, note: 'not-saved' })
    else put(id, { ...unsent(draft), name: state.name, theirs: { value: current } })
  }
  return next ?? prev
}

/** 이름 칸의 까닭 — 보낼 수 있으면 `null`. `except` 는 이름을 바꾸는 그 상태(겹침에서 뺀다 · 개수 한도를 안 본다). */
export function nameProblem(viewStates: readonly ViewState[], name: string, except: string | null): string | null {
  const trimmed = name.trim()
  if (isBlankAlias(trimmed)) return '이름을 적으세요'
  if (hasRejectedAliasChar(trimmed)) return '줄바꿈 · 제어 글자는 이름에 쓸 수 없습니다'
  if ([...trimmed].length > VIEW_STATE_NAME_MAX) return `이름은 ${VIEW_STATE_NAME_MAX}자까지입니다`
  if (viewStates.some((state) => state.id !== except && state.name === trimmed)) return '같은 이름의 상태가 있습니다'
  if (except === null && viewStates.length >= VIEW_STATES_MAX) return `상태는 ${VIEW_STATES_MAX}개까지입니다`
  return null
}

/** 그 자리에 상태를 더할 수 없는 까닭 — 더할 수 있으면 `undefined`. `parent` 가 `null` 이면 뿌리. */
export function addStateWhy(viewStates: readonly ViewState[], parent: string | null): string | undefined {
  if (viewStates.length >= VIEW_STATES_MAX) return `상태는 ${VIEW_STATES_MAX}개까지입니다`
  if (parent !== null && stateLineage(viewStates, parent).length >= VIEW_STATE_DEPTH_MAX)
    return `상태는 ${VIEW_STATE_DEPTH_MAX}단계까지입니다`
  return undefined
}

const NO_VIEW_STATES: readonly ViewState[] = []

export function PageStates(props: { projectId: string; pageId: string; canEdit: boolean }): ReactElement | null {
  const document = useOpenDocument(props.pageId)
  const choice = useViewState(props.pageId)
  const { commitOps } = useEditCommit({ projectId: props.projectId, pageId: props.pageId })
  const store = useEditorStoreInstance()
  const pending = useEditorStore(store, (s) => s.pending)
  const [drafts, setDrafts] = usePanelSlot(DRAFTS)
  const [input, setInput] = useState<StateInput | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  // 메뉴로 막 연 상자 — 그 상자만 포커스를 받는다(탭을 다녀와 다시 선 상자는 포커스를 안 뺏는다).
  const [focusId, setFocusId] = useState<string | null>(null)
  const viewStates = document !== null && Array.isArray(document.viewStates) ? document.viewStates : NO_VIEW_STATES
  // 문서 · 큐가 바뀔 때마다 보낸 초안의 결말을 짓는다(`settleDrafts`). 읽기만 하는 판에서도 돈다 — 상자를 안 그려도 초안은 남는다.
  useEffect(() => {
    if (document === null) return
    setDrafts((prev) => settleDrafts(prev, viewStates, pending))
  }, [document, viewStates, pending, setDrafts])
  // 문서가 아직 안 실렸으면(여는 중) 아무것도 안 그린다 — 이름 · 설명 칸이 «불러오는 중»을 말한다.
  if (document === null) return null
  const states = viewStates
  const order = viewStateOrder(states)
  // 쓸 수 없게 되면(뷰 모드로 · 강등) 이름 입력 · 확인 상자를 그리지 않는다 — 다시 쓸 수 있게 돼도 닫힌 채다(렌더 중에 비운다). 설명 초안은
  // 남는다(머리말 «설명 초안은 패널 밖에 든다»).
  if (!props.canEdit && (input !== null || removing !== null)) {
    setInput(null)
    setRemoving(null)
  }

  const close = (): void => {
    setProblem(null)
    setInput(null)
  }
  const open = (next: StateInput): void => {
    setProblem(null)
    setInput(next)
  }
  const submitName = (value: string): void => {
    if (input === null) return
    const except = input.kind === 'rename' ? input.stateId : null
    const why = nameProblem(states, value, except)
    if (why !== null) {
      setProblem(why)
      return
    }
    if (input.kind === 'rename') {
      const ops = renameViewStateOps(document, input.stateId, value)
      // 이름이 그대로면 `null` — 보낼 것 없이 닫는다.
      if (ops === null || commitOps(ops)) close()
      return
    }
    let id: string | null = null
    const ops = addViewStateOps(document, value, input.parent, () => (id = createNodeId()))
    if (ops === null || id === null) {
      setProblem(addStateWhy(states, input.parent) ?? '이 자리에 상태를 더할 수 없습니다')
      return
    }
    if (!commitOps(ops)) return
    close()
    // 만든 상태를 곧바로 고른다 — 만든 화면을 그린다.
    choice.choose(id)
  }
  /** 그 상태의 초안을 고친다 — 없으면 아무것도 안 한다. */
  const updateDraft = (stateId: string, change: (draft: StateDraft) => StateDraft | undefined): void => {
    setDrafts((prev) => {
      const draft = prev[stateId]
      if (draft === undefined) return prev
      const next = { ...prev }
      const changed = change(draft)
      if (changed === undefined) delete next[stateId]
      else next[stateId] = changed
      return next
    })
  }
  const dropDraft = (stateId: string): void => updateDraft(stateId, () => undefined)
  const openDescription = (state: ViewState): void => {
    setFocusId(state.id)
    const current = state.description ?? null
    setDrafts((prev) =>
      prev[state.id] !== undefined ? prev : { ...prev, [state.id]: { name: state.name, text: current ?? '', base: current } },
    )
  }
  /**
   * 초안을 보낸다. `base`는 그 초안의 바탕이다 — **«내 글로 덮기»만 다른 바탕을 준다**(충돌 화면이 보인 그 사람의 값 — 페이지 설명의 `submit`과 같다).
   * 화면의 문서가 이미 바탕과 다르면 보내지 않고 충돌을 세운다 — 남의 글이 와 있다. 서버에서만 다르면 묶음째 거절되고 `settleDrafts`가 같은 화면을 세운다.
   */
  const submitDescription = (stateId: string, base: string | null): void => {
    const draft = drafts[stateId]
    const state = states.find((entry) => entry.id === stateId)
    if (draft === undefined || draft.sent !== undefined || state === undefined) return
    const wanted = wantedOf(draft.text)
    if (wanted === undefined) {
      updateDraft(stateId, (prev) => ({ ...prev, note: 'too-long' }))
      return
    }
    const current = state.description ?? null
    // 이미 그 글이다(남이 같은 글을 썼거나 되살린 초안이 저장된 뒤다) — 보낼 것 없이 닫는다.
    if (current === wanted) {
      dropDraft(stateId)
      return
    }
    if (current !== base) {
      updateDraft(stateId, (prev) => ({ ...unsent(prev), base, theirs: { value: current } }))
      return
    }
    const ops = describeViewStateOps(document, stateId, draft.text, base)
    if (ops === null) {
      dropDraft(stateId)
      return
    }
    if (!commitOps(ops)) {
      updateDraft(stateId, (prev) => ({ ...unsent(prev), base, note: 'not-saved' }))
      return
    }
    // `commitOps`가 큐 끝에 넣었다(`EditorStore.applyEdit`) — 그 편집이 큐에서 빠질 때 결말을 짓는다.
    const sent = store.getState().pending.at(-1)?.clientOpId
    updateDraft(stateId, (prev) => (sent === undefined ? undefined : { ...unsent(prev), base, sent }))
  }

  const problemLine =
    problem === null ? null : (
      <p className="wb-shell-tree-state-problem" role="status">
        {problem}
      </p>
    )
  const nameInput = (key: string, initial: string): ReactElement => (
    <div className="wb-shell-page-state-input" key={key}>
      <TreeInput label={STATE_NAME_LABEL} initial={initial} onSubmit={submitName} onCancel={close} onEdit={() => setProblem(null)} />
      {problemLine}
    </div>
  )

  const items = (state: ViewState): ActionMenuItem[] => {
    const siblings = order.filter((entry) => entry.state.parent === state.parent).map((entry) => entry.state.id)
    const at = siblings.indexOf(state.id)
    const item = (
      key: string,
      label: string,
      icon: ActionMenuItem['icon'],
      why: string | undefined,
      onSelect: () => void,
      danger = false,
    ): ActionMenuItem => ({
      key,
      label,
      icon,
      onSelect,
      disabled: why !== undefined,
      title: why,
      description: why,
      danger,
    })
    return [
      item('add-substate', ADD_SUBSTATE_LABEL, ICONS.viewStates, addStateWhy(states, state.id), () =>
        open({ kind: 'add', parent: state.id }),
      ),
      item('rename-state', '이름 바꾸기', ICONS.rename, undefined, () => open({ kind: 'rename', stateId: state.id })),
      item('describe-state', DESCRIBE_STATE_LABEL, ICONS.rename, undefined, () => openDescription(state)),
      item('state-up', '위로', ICONS.moveUp, at > 0 ? undefined : '앞에 형제 상태가 있어야 합니다', () => {
        commitOps(moveViewStateOps(document, state.id, at - 1))
      }),
      item('state-down', '아래로', ICONS.moveDown, at < siblings.length - 1 ? undefined : '뒤에 형제 상태가 있어야 합니다', () => {
        commitOps(moveViewStateOps(document, state.id, at + 1))
      }),
      item('remove-state', '삭제', ICONS.remove, undefined, () => setRemoving(state.id), true),
    ]
  }
  const addWhy = addStateWhy(states, null)
  // 지워진 상태의 초안 — 보낸 것은 결말을 기다린다(`settleDrafts`가 표지를 떼면 선다).
  const gone = props.canEdit
    ? Object.entries(drafts).filter(([id, draft]) => draft.sent === undefined && !states.some((state) => state.id === id))
    : []
  const noteLine = (draft: StateDraft): ReactElement | null =>
    draft.note === undefined ? null : (
      <p className="wb-shell-tree-state-problem" role="status">
        {draft.note === 'too-long' ? DESCRIPTION_PROBLEM : DESCRIPTION_NOT_SAVED}
      </p>
    )
  const describing = (state: ViewState): ReactElement | null => {
    const draft = drafts[state.id]
    if (!props.canEdit || draft === undefined || draft.sent !== undefined) return null
    const theirs = draft.theirs
    return (
      <>
        <DescriptionInput
          text={draft.text}
          autoFocus={focusId === state.id}
          onFocused={() => setFocusId(null)}
          onChange={(text) => updateDraft(state.id, (prev) => ({ ...prev, text, note: undefined }))}
          onSubmit={() => submitDescription(state.id, draft.base)}
          onCancel={() => dropDraft(state.id)}
          problem={noteLine(draft)}
        />
        {theirs !== undefined && (
          <MetaConflict
            what="상태 설명"
            theirs={theirs.value}
            onOverwrite={() => submitDescription(state.id, theirs.value)}
            onDiscard={() => dropDraft(state.id)}
          />
        )}
      </>
    )
  }

  return (
    <section className="wb-shell-page-states" aria-labelledby="wb-page-states-heading">
      <h3 id="wb-page-states-heading" className="wb-shell-page-info-heading">
        상태
      </h3>
      {order.length === 0 && <p className="wb-shell-panel-notice">{NO_STATES}</p>}
      {order.length > 0 && (
        <ul className="wb-shell-page-state-list" aria-label="화면 상태">
          {order.map(({ state, depth }) => (
            <li key={state.id} className="wb-shell-page-state" data-state-id={state.id} style={{ paddingLeft: depth * 12 }}>
              <div className="wb-shell-page-state-row">
                <span className="wb-shell-page-state-name">{state.name}</span>
                {props.canEdit && <ActionMenu label={`상태 ${state.name} 더 보기`} items={items(state)} compact />}
              </div>
              {describing(state) ??
                (state.description !== undefined && <p className="wb-shell-page-state-description">{state.description}</p>)}
              {input?.kind === 'rename' && input.stateId === state.id && nameInput(`rename-${state.id}`, state.name)}
              {input?.kind === 'add' && input.parent === state.id && nameInput(`add-${state.id}`, '')}
            </li>
          ))}
        </ul>
      )}
      {gone.map(([id, draft]) => (
        <div key={id} className="wb-shell-page-state-gone" role="group" aria-label={GONE_DRAFT_LABEL}>
          <p className="wb-shell-panel-notice" role="status">
            {goneNotice(draft.name)}
          </p>
          {/* 고칠 수 없는 상자 — 글을 골라 복사할 수 있다(포커스 · 선택은 된다). */}
          <textarea
            className="wb-shell-control wb-shell-page-description-input"
            aria-label="쓰던 설명"
            rows={3}
            readOnly
            value={draft.text}
          />
          <button type="button" className="wb-shell-panel-action wb-shell-page-state-cancel" onClick={() => dropDraft(id)}>
            버리기
          </button>
        </div>
      ))}
      {input?.kind === 'add' && input.parent === null && nameInput('add-root', '')}
      {props.canEdit && (
        <button
          type="button"
          className="wb-shell-panel-action wb-shell-page-state-add"
          aria-disabled={addWhy !== undefined || undefined}
          title={addWhy}
          aria-description={addWhy}
          onClick={() => {
            if (addWhy === undefined) open({ kind: 'add', parent: null })
          }}
        >
          {ADD_STATE_LABEL}
        </button>
      )}
      {props.canEdit && (
        <RemoveStateDialog
          projectId={props.projectId}
          target={removing === null ? null : { pageId: props.pageId, stateId: removing }}
          onClose={() => setRemoving(null)}
        />
      )}
    </section>
  )
}

/**
 * 상태 설명 상자 — 여러 줄이라 Enter 는 줄바꿈이다. **«상태 설명 저장»으로 보내고 Escape · «취소»로 닫는다.** 이름 입력(`TreeInput`)처럼 blur 로
 * 닫지 않는다 — 여러 줄 글은 쓰는 도중 다른 곳을 누르는 일이 흔하다(페이지 설명 상자와 같은 까닭 — `./page-description.tsx` 머리말 «즉시 저장이
 * 아니라 저장 버튼이다»의 3).
 */
function DescriptionInput(props: {
  /** 초안의 글 — 칸은 패널 밖에 든다(머리말 «설명 초안은 패널 밖에 든다»). */
  text: string
  autoFocus: boolean
  onFocused: () => void
  onChange: (text: string) => void
  onSubmit: () => void
  onCancel: () => void
  problem: ReactElement | null
}): ReactElement {
  return (
    <form
      className="wb-shell-page-state-describe"
      onSubmit={(event) => {
        event.preventDefault()
        props.onSubmit()
      }}
    >
      <textarea
        className="wb-shell-control wb-shell-page-description-input"
        aria-label={STATE_DESCRIPTION_LABEL}
        rows={3}
        maxLength={VIEW_STATE_DESCRIPTION_MAX}
        value={props.text}
        // 여는 누름(행동 메뉴 항목)이 포커스를 둘 자리다 — 키보드 사람이 곧바로 친다.
        autoFocus={props.autoFocus}
        onFocus={props.onFocused}
        onChange={(event) => props.onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            props.onCancel()
          }
        }}
      />
      {props.problem}
      <div className="wb-shell-page-state-describe-actions">
        <button type="submit" className="wb-shell-panel-action wb-shell-page-description-save">
          {SAVE_STATE_DESCRIPTION_LABEL}
        </button>
        <button type="button" className="wb-shell-panel-action wb-shell-page-state-cancel" onClick={props.onCancel}>
          취소
        </button>
      </div>
    </form>
  )
}
