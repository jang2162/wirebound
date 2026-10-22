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
 */
import { useState, type ReactElement } from 'react'
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
import { useOpenDocument } from '../store/use-editor-store'
import { RemoveStateDialog } from './remove-state-dialog'
import { TreeInput } from './tree-input'

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

/** 열린 입력 — 무엇을 하는가. `parent` 가 `null` 이면 뿌리 상태를 더한다. */
type StateInput = { kind: 'add'; parent: string | null } | { kind: 'rename'; stateId: string } | { kind: 'describe'; stateId: string }

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
  const [input, setInput] = useState<StateInput | null>(null)
  const [problem, setProblem] = useState<string | null>(null)
  const [removing, setRemoving] = useState<string | null>(null)
  // 문서가 아직 안 실렸으면(여는 중) 아무것도 안 그린다 — 이름 · 설명 칸이 «불러오는 중»을 말한다.
  if (document === null) return null
  const states = Array.isArray(document.viewStates) ? document.viewStates : NO_VIEW_STATES
  const order = viewStateOrder(states)
  // 쓸 수 없게 되면(뷰 모드로 · 강등) 입력 · 확인 상자를 그리지 않는다 — 다시 쓸 수 있게 돼도 닫힌 채다(렌더 중에 비운다).
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
    if (input === null || input.kind === 'describe') return
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
  const submitDescription = (stateId: string, text: string): void => {
    if (tidyViewStateDescription(text) === null) {
      setProblem(DESCRIPTION_PROBLEM)
      return
    }
    const ops = describeViewStateOps(document, stateId, text)
    // 그대로면 `null` — 보낼 것 없이 닫는다.
    if (ops === null || commitOps(ops)) close()
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
      item('describe-state', DESCRIBE_STATE_LABEL, ICONS.rename, undefined, () => open({ kind: 'describe', stateId: state.id })),
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
              {input?.kind === 'describe' && input.stateId === state.id ? (
                <DescriptionInput
                  initial={state.description ?? ''}
                  onSubmit={(text) => submitDescription(state.id, text)}
                  onCancel={close}
                  onEdit={() => setProblem(null)}
                  problem={problemLine}
                />
              ) : (
                state.description !== undefined && <p className="wb-shell-page-state-description">{state.description}</p>
              )}
              {input?.kind === 'rename' && input.stateId === state.id && nameInput(`rename-${state.id}`, state.name)}
              {input?.kind === 'add' && input.parent === state.id && nameInput(`add-${state.id}`, '')}
            </li>
          ))}
        </ul>
      )}
      {input?.kind === 'add' && input.parent === null && nameInput('add-root', '')}
      {props.canEdit && (
        <button
          type="button"
          className="wb-shell-page-state-add"
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
  initial: string
  onSubmit: (text: string) => void
  onCancel: () => void
  onEdit: () => void
  problem: ReactElement | null
}): ReactElement {
  const [text, setText] = useState(props.initial)
  return (
    <form
      className="wb-shell-page-state-describe"
      onSubmit={(event) => {
        event.preventDefault()
        props.onSubmit(text)
      }}
    >
      <textarea
        className="wb-shell-page-description-input"
        aria-label={STATE_DESCRIPTION_LABEL}
        rows={3}
        maxLength={VIEW_STATE_DESCRIPTION_MAX}
        value={text}
        // 여는 누름(행동 메뉴 항목)이 포커스를 둘 자리다 — 키보드 사람이 곧바로 친다.
        autoFocus
        onChange={(event) => {
          setText(event.target.value)
          props.onEdit()
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            props.onCancel()
          }
        }}
      />
      {props.problem}
      <div className="wb-shell-page-state-describe-actions">
        <button type="submit" className="wb-shell-page-description-save">
          {SAVE_STATE_DESCRIPTION_LABEL}
        </button>
        <button type="button" className="wb-shell-page-state-cancel" onClick={props.onCancel}>
          취소
        </button>
      </div>
    </form>
  )
}
