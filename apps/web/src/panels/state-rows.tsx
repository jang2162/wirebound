/**
 * **메뉴 트리의 상태 줄**(설계 spec `docs/superpowers/specs/2026-10-18-modules-states-layout-design.md` 「C3」) — 페이지 줄 아래에 그 페이지의
 * 화면 상태가 트리로 선다(`viewStateOrder` — 트리 차례 · 하위 상태는 깊이만큼 들여 쓴다). 페이지 줄이 접히면 함께 접힌다(`./menu-tree.tsx`).
 *
 * | 무엇 | 어떻게 |
 * |---|---|
 * | 목록 | 열린 페이지는 **열린 문서**(실시간 — 남이 더한 상태가 곧바로 선다), 다른 페이지는 **트리 응답**(`TreePage.viewStates` — 트리를 다시 읽을 때 따라온다) |
 * | 누르기 | 그 페이지를 열고 그 상태를 고른다 — 열린 페이지면 상태만 바꾸고(`useViewState` 의 `choose`), 다른 페이지면 주소 `?state=` 로 연다(`shell/view-state-address.ts` 가 열 때 읽는다) |
 * | 켜짐 | 지금 고른 상태의 줄 — `aria-current` |
 * | `…` | editor 이상 · 편집 모드(`editable`): 하위 상태 추가 · 이름 바꾸기 · 위로 · 아래로 · 삭제. 열린 페이지에서만 켜진다 — `…` 를 열면 그 줄을 먼저 고르므로(그 페이지를 연다) 문서가 실리면 켜진다 |
 *
 * **상태 줄은 메뉴 트리의 줄(`[data-tree-row]`)이 아니다** — 표지가 `data-state-row` 다. 메뉴 트리의 선택 · 단축키 · 끌어 놓기 · ↑ ↓ 는 메뉴와
 * 페이지의 것이라(`tree/tree-actions.ts` 의 `TreeSelection`) 상태 줄은 거기 들지 않는다 — 상태 줄에서 친 `Delete` 가 고른 메뉴 · 페이지의
 * 삭제 확인을 걸지 않게 트리 상자가 그 키를 지나보낸다(`./menu-tree.tsx` 의 `handleKeyDown`).
 *
 * **편집은 문서 경로 `/viewStates/…` 의 JSON Patch 다**(`@wirebound/schema` 의 `addViewStateOps` 등 — 묶음 하나가 편집 하나 · 되돌리기 한 번).
 * 이름 규칙을 어기면 보내지 않고 입력 아래에 까닭을 말한다(`nameProblem` — 규칙의 정본은 schema 의 봉투, 화면은 까닭을 고르는 몫만 한다).
 * 삭제는 확인 상자를 연다(`./remove-state-dialog.tsx` — 트리 상자 밖에 선다).
 */
import { useState, type ReactElement } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  addViewStateOps,
  createNodeId,
  hasRejectedAliasChar,
  isBlankAlias,
  moveViewStateOps,
  renameViewStateOps,
  stateLineage,
  VIEW_STATE_DEPTH_MAX,
  VIEW_STATE_NAME_MAX,
  VIEW_STATES_MAX,
  viewStateOrder,
  type ViewState,
} from '@wirebound/schema'
import type { TreePage } from '../api/types'
import { useEditCommit } from '../edit/use-edit-commit'
import type { ActionMenuItem } from '../shell/action-menu'
import { ICONS } from '../shell/icons'
import { useViewState } from '../shell/use-view-state'
import { useOpenDocument } from '../store/use-editor-store'
import { TreeInput } from './tree-input'
import { TreeRowActions } from './tree-row-actions'

/** 페이지 줄 `…` 의 항목 이름. */
export const ADD_STATE_LABEL = '상태 추가'
/** 상태 줄 `…` 의 «하위 상태 추가». */
export const ADD_SUBSTATE_LABEL = '하위 상태 추가'
/** 상태 이름 입력의 접근 이름. */
export const STATE_NAME_LABEL = '상태 이름'
/** 열리지 않은 페이지의 상태는 고칠 수 없다 — 그 문서가 화면에 없다. */
export const STATE_PAGE_CLOSED_REASON = '페이지를 열면 상태를 고칠 수 있습니다'

/** 열린 상태 이름 입력 — 어느 페이지의 무엇인가. `parent` 가 `null` 이면 뿌리 상태를 더한다. */
export type StateInput = { pageId: string; kind: 'add'; parent: string | null } | { pageId: string; kind: 'rename'; stateId: string }

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

const NO_STATES: readonly ViewState[] = []

/** 그 페이지의 상태 목록 — 열린 페이지는 열린 문서, 아니면 트리 응답(머리말 표). 열린 문서면 `open` 이 참이다. */
export function usePageStates(page: TreePage): { states: readonly ViewState[]; open: boolean } {
  const document = useOpenDocument(page.id)
  if (document !== null) return { states: Array.isArray(document.viewStates) ? document.viewStates : NO_STATES, open: true }
  return { states: Array.isArray(page.viewStates) ? page.viewStates : NO_STATES, open: false }
}

/** 페이지 줄 `…` 의 «상태 추가» — 열린 페이지에서만 켜진다. */
export function addStateItem(page: TreePage, states: readonly ViewState[], open: boolean, onSelect: () => void): ActionMenuItem {
  const why = open ? addStateWhy(states, null) : STATE_PAGE_CLOSED_REASON
  return {
    key: 'add-state',
    label: ADD_STATE_LABEL,
    icon: ICONS.viewStates,
    onSelect,
    disabled: why !== undefined,
    title: why,
    description: why,
  }
}

export function StateRows(props: {
  projectId: string
  page: TreePage
  editable: boolean
  input: StateInput | null
  setInput: (input: StateInput | null) => void
  /** 상태 삭제 확인을 연다 — 상자는 트리 상자 밖에 선다(`./menu-tree.tsx`). */
  onAskRemove: (pageId: string, stateId: string) => void
  /** 상태 줄을 누르거나 `…` 를 열 때 — 메뉴 트리의 고른 줄을 주소로 푼다(페이지 링크의 누름과 같다). */
  onPick: () => void
}): ReactElement | null {
  const { page } = props
  const { states, open } = usePageStates(page)
  const choice = useViewState(page.id)
  const navigate = useNavigate()
  const { commitOps } = useEditCommit({ projectId: props.projectId, pageId: page.id })
  const document = useOpenDocument(page.id)
  const [problem, setProblem] = useState<string | null>(null)
  const input = props.input !== null && props.input.pageId === page.id ? props.input : null
  const order = viewStateOrder(states)
  if (order.length === 0 && input === null) return null

  const href = (stateId: string): string => `/projects/${props.projectId}/pages/${page.id}?state=${encodeURIComponent(stateId)}`
  /** 그 상태를 고른다 — 열린 페이지면 상태만, 아니면 그 상태의 주소로 연다(머리말 표). */
  const choose = (stateId: string): void => {
    props.onPick()
    if (open) choice.choose(stateId)
    else void navigate(href(stateId))
  }
  const close = (): void => {
    setProblem(null)
    props.setInput(null)
  }
  const submit = (value: string): void => {
    if (input === null || document === null) return
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
  const nameInput = (key: string, initial: string): ReactElement => (
    <div className="wb-shell-tree-state-input" key={key}>
      <TreeInput label={STATE_NAME_LABEL} initial={initial} onSubmit={submit} onCancel={close} onEdit={() => setProblem(null)} />
      {problem !== null && (
        <p className="wb-shell-tree-state-problem" role="status">
          {problem}
        </p>
      )}
    </div>
  )

  const items = (state: ViewState): ActionMenuItem[] => {
    const closed = open ? undefined : STATE_PAGE_CLOSED_REASON
    const siblings = order.filter((entry) => entry.state.parent === state.parent).map((entry) => entry.state.id)
    const at = siblings.indexOf(state.id)
    const item = (
      key: string,
      label: string,
      icon: ActionMenuItem['icon'],
      why: string | undefined,
      onSelect: () => void,
      danger = false,
    ) => ({
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
      item('add-substate', ADD_SUBSTATE_LABEL, ICONS.viewStates, closed ?? addStateWhy(states, state.id), () =>
        props.setInput({ pageId: page.id, kind: 'add', parent: state.id }),
      ),
      item('rename-state', '이름 바꾸기', ICONS.rename, closed, () =>
        props.setInput({ pageId: page.id, kind: 'rename', stateId: state.id }),
      ),
      item('state-up', '위로', ICONS.moveUp, closed ?? (at > 0 ? undefined : '앞에 형제 상태가 있어야 합니다'), () => {
        if (document !== null) commitOps(moveViewStateOps(document, state.id, at - 1))
      }),
      item(
        'state-down',
        '아래로',
        ICONS.moveDown,
        closed ?? (at < siblings.length - 1 ? undefined : '뒤에 형제 상태가 있어야 합니다'),
        () => {
          if (document !== null) commitOps(moveViewStateOps(document, state.id, at + 1))
        },
      ),
      item('remove-state', '삭제', ICONS.remove, closed, () => props.onAskRemove(page.id, state.id), true),
    ]
  }

  return (
    <ul className="wb-shell-tree-list" aria-label={`${page.title} 화면 상태`}>
      {order.map(({ state, depth }) => {
        const current = open && choice.state === state.id
        return (
          <li key={state.id}>
            <div
              className={'wb-shell-tree-state-row' + (current ? ' wb-shell-tree-state-row-current' : '')}
              data-state-row=""
              data-state-id={state.id}
              style={{ paddingLeft: depth * 12 }}
            >
              <Link
                className="wb-shell-tree-state"
                to={href(state.id)}
                aria-current={current ? 'true' : undefined}
                onClick={(event) => {
                  // 열린 페이지는 주소를 옮기지 않는다 — 편집 모드의 주소는 페이지를 가리키는 것이다(`shell/view-state-address.ts`).
                  if (open) event.preventDefault()
                  choose(state.id)
                }}
              >
                {state.name}
              </Link>
              {props.editable && (
                <TreeRowActions
                  name={`상태 ${state.name}`}
                  more={items(state)}
                  onOpen={() => {
                    if (!current) choose(state.id)
                  }}
                  picked={current || !open}
                />
              )}
            </div>
            {input !== null &&
              ((input.kind === 'rename' && input.stateId === state.id && nameInput(`rename-${state.id}`, state.name)) ||
                (input.kind === 'add' && input.parent === state.id && nameInput(`add-${state.id}`, '')))}
          </li>
        )
      })}
      {input !== null && input.kind === 'add' && input.parent === null && <li>{nameInput('add-root', '')}</li>}
    </ul>
  )
}
