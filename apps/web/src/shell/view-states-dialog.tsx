/**
 * **상태 다루기 상자**(설계서 「설계서 화면 구조」 «화면 상태») — 머리 전환기 · 접힌 `…` 의 «상태 추가» · «상태 관리…»가 연다
 * (`shell/use-view-state.ts` 의 `useManageDialog`). 셸이 한 번 그린다(`routes/editor.tsx` — 다른 `ShellDialog` 곁).
 *
 * - **«상태 추가»** — 이름 칸 하나. 더하면 상자를 닫고 그 상태를 고른다(만든 화면을 곧바로 그린다).
 * - **«상태 관리…»** — 상태마다 위로 · 아래로 · 이름 바꾸기 · 삭제, 끝에 새 상태 이름 칸.
 * - **편집은 문서 경로 `/viewStates/…` 의 JSON Patch 다**(`@wirebound/schema` 의 `addViewStateOps` 등 — 묶음 하나가 편집 하나 · 되돌리기 한 번).
 *   남의 노드 잠금에 안 막힌다(목록은 노드가 아니다 — 서버 · `editBlockedBy` 의 같은 판정). 이름 규칙(1 ~ 30자 · 별칭과 같은 받지 않는 글자 ·
 *   겹침 · 20개)을 어기면 보내지 않고 칸 아래에 까닭을 말한다(`nameProblem` — 규칙의 정본은 schema 의 봉투, 화면은 까닭을 고르는 몫만 한다).
 *
 * ## 상태 삭제 확인 — 보인 id 집합을 보낸다
 *
 * 그 상태를 가리키는 가지를 모두 함께 지운다(`removeViewStateOps` — 가지 · 그 안 노드의 id 를 함께 낸다). 확인은 «가지 N개의 내용이 함께
 * 삭제됩니다»와 지워지는 노드 이름이다. **보인 목록과 보낼 묶음이 같은지를 id 집합으로 견준다** — 확인을 연 뒤 남이 그 상태로 가지를 만들거나
 * 가지 안을 바꾸면 «삭제»가 보내지 않고 새 목록으로 다시 서며 «목록이 바뀌었습니다» 한 줄을 띄운다(메뉴 연쇄 삭제 `panels/menu-delete-dialog.tsx`
 * 와 같은 꼴 — 수만 같고 다른 노드인 판도 갈린다). 누른 뒤 서버에 닿기 전에 바뀌면 서버가 막는다(목록에서 뺀 상태의 가지가 남으면 422
 * `state-cases-left` · 지우는 가지 안 남의 잠금은 423). 지우는 가지 안에 남이 잡은 노드가 있으면 «삭제»를 끄고 까닭을 단다(`editBlockedBy`).
 */
import { useEffect, useId, useRef, useState, type FormEvent, type ReactElement } from 'react'
import {
  addViewStateOps,
  createNodeId,
  hasRejectedAliasChar,
  isBlankAlias,
  moveViewStateOps,
  nodeRowLabel,
  removeViewStateOps,
  renameViewStateOps,
  VIEW_STATE_NAME_MAX,
  VIEW_STATES_MAX,
  walkNodes,
  type PageDocument,
  type PatchOp,
  type ViewState,
  type WbNode,
} from '@wirebound/schema'
import { useEditCommit } from '../edit/use-edit-commit'
import { useEditorStoreInstance, useOpenDocument } from '../store/use-editor-store'
import { shellIcon } from './icons'
import { ShellDialog } from './shell-dialog'
import { useManageDialog, useViewState } from './use-view-state'

export const ADD_STATE_TITLE = '상태 추가'
export const MANAGE_STATES_TITLE = '상태 관리'
export const REMOVE_STATE_TITLE = '상태 삭제'
export const NEW_STATE_LABEL = '새 상태 이름'
export const STATES_CHANGED = '목록이 바뀌었습니다 — 다시 확인하세요.'
/** 목록이 바뀐 뒤 확인 단추의 글 — 누르면 «삭제»로 돌아가고 아무것도 안 보낸다(메뉴 연쇄 삭제의 «새 목록 확인»과 같은 꼴). */
export const STATES_RECHECK = '새 목록 확인'
/** 지운 뒤 되돌리는 길 — 상태 삭제는 편집 하나라 개인 되돌리기로 돌아온다. */
export const REMOVE_UNDO_NOTE = '되돌리기(Cmd+Z)로 상태와 가지를 함께 되살립니다.'
/** 지워지는 노드 이름을 보이는 수 — 나머지는 «외 N개». 메뉴 연쇄 삭제 상자의 페이지 수와 같은 까닭(1440×900 에서 굴림 없이 선다). */
export const REMOVED_PREVIEW_LIMIT = 8

/** 이름 칸의 까닭 — 보낼 수 있으면 `null`. `except` 는 이름을 바꾸는 그 상태(겹침에서 뺀다). */
export function nameProblem(viewStates: readonly ViewState[], name: string, except: string | null): string | null {
  const trimmed = name.trim()
  if (isBlankAlias(trimmed)) return '이름을 적으세요'
  if (hasRejectedAliasChar(trimmed)) return '줄바꿈 · 제어 글자는 이름에 쓸 수 없습니다'
  if ([...trimmed].length > VIEW_STATE_NAME_MAX) return `이름은 ${VIEW_STATE_NAME_MAX}자까지입니다`
  if (viewStates.some((state) => state.id !== except && state.name === trimmed)) return '같은 이름의 상태가 있습니다'
  if (except === null && viewStates.length >= VIEW_STATES_MAX) return `상태는 ${VIEW_STATES_MAX}개까지입니다`
  return null
}

export function removeSentence(name: string, cases: number): string {
  return cases === 0
    ? `"${name}" 상태를 지웁니다. 이 상태의 가지는 없습니다.`
    : `"${name}" 상태를 지웁니다. 가지 ${cases}개의 내용이 함께 삭제됩니다.`
}

/** 상태 삭제가 지우는 것 — 확인 상자가 보이는 것과 보내는 것이 이 하나에서 나온다. 검증 전 문서에서 걷기가 던지면 `null`. */
interface Removal {
  ops: PatchOp[]
  caseIds: string[]
  /** 가지 · 그 안 노드 전부 — 정렬한 id 를 이은 글이 견줄 열쇠다. */
  key: string
  /** 지워지는 노드(가지 자신은 빼고) — 줄 글과 id(목록 줄의 `data-node-id` — 실브라우저 케이스가 id 집합으로 견준다). */
  names: { id: string; label: string }[]
}

function removal(doc: PageDocument, stateId: string): Removal | null {
  try {
    const result = removeViewStateOps(doc, stateId)
    if (result === null) return null
    const gone = new Set(result.removedNodeIds)
    const names: { id: string; label: string }[] = []
    for (const { node } of walkNodes(doc.root)) {
      if (gone.has(node.id) && node.type !== 'StateCase') names.push({ id: node.id, label: nodeRowLabel(node as WbNode, doc.viewStates) })
    }
    return { ops: result.ops, caseIds: result.removedCaseIds, key: [...result.removedNodeIds].sort().join(','), names }
  } catch {
    return null
  }
}

export function ViewStatesDialog(props: { projectId: string; pageId: string; editable: boolean }): ReactElement | null {
  const { dialog, close } = useManageDialog()
  const doc = useOpenDocument(props.pageId)
  if (dialog === null || doc === null || !props.editable) return null
  return <OpenViewStatesDialog {...props} dialog={dialog} doc={doc} onClose={close} />
}

/** 삭제를 묻는 중 — 연 순간(또는 다시 선 순간)의 id 집합 열쇠, 그것이 바뀌어 다시 섰는가(알림), 확인 단추가 «새 목록 확인»인가. */
interface Removing {
  stateId: string
  key: string
  changed: boolean
  recheck: boolean
}

function OpenViewStatesDialog(props: {
  projectId: string
  pageId: string
  dialog: 'add' | 'manage'
  doc: PageDocument
  onClose: () => void
}): ReactElement {
  const { doc } = props
  const store = useEditorStoreInstance()
  const history = useEditCommit({ projectId: props.projectId, pageId: props.pageId })
  const choice = useViewState(props.pageId)
  const viewStates = Array.isArray(doc.viewStates) ? doc.viewStates : []
  const [name, setName] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; value: string; problem: string | null } | null>(null)
  const [removing, setRemoving] = useState<Removing | null>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const problemId = useId()
  const sentenceId = useId()

  useEffect(() => {
    if (props.dialog === 'add') nameRef.current?.focus()
  }, [props.dialog])

  function add(event: FormEvent): void {
    event.preventDefault()
    const why = nameProblem(viewStates, name, null)
    if (why !== null) {
      setProblem(why)
      return
    }
    let id: string | null = null
    const ops = addViewStateOps(doc, name, () => (id = createNodeId()))
    if (ops === null || id === null || !history.commitOps(ops)) return
    setName('')
    setProblem(null)
    if (props.dialog === 'add') {
      choice.choose(id)
      props.onClose()
    }
  }

  function rename(event: FormEvent): void {
    event.preventDefault()
    if (renaming === null) return
    const why = nameProblem(viewStates, renaming.value, renaming.id)
    if (why !== null) {
      setRenaming({ ...renaming, problem: why })
      return
    }
    const ops = renameViewStateOps(doc, renaming.id, renaming.value)
    // 이름이 그대로면 `null` — 보낼 것 없이 닫는다.
    if (ops === null || history.commitOps(ops)) setRenaming(null)
  }

  const removingState = removing === null ? undefined : viewStates.find((state) => state.id === removing.stateId)
  const pending = removing === null || removingState === undefined ? null : removal(doc, removing.stateId)
  // 묻는 사이 목록이 바뀌었으면(남의 편집이 닿음) 새 목록으로 다시 선다 — 렌더 중에 고친다(아래 «삭제»가 보는 열쇠와 같은 값).
  if (removing !== null && pending !== null && pending.key !== removing.key) {
    setRemoving({ stateId: removing.stateId, key: pending.key, changed: true, recheck: true })
  }
  const blocker = pending === null ? null : store.editBlockedBy(pending.ops)
  const removeWhy =
    pending === null
      ? '이 상태가 목록에 없습니다 — 다른 사람이 먼저 지웠을 수 있습니다.'
      : blocker !== null
        ? `${blocker.userName}님이 편집 중인 노드가 있어 함께 지울 수 없습니다`
        : null

  function confirmRemove(): void {
    if (removing === null) return
    const now = removal(doc, removing.stateId)
    if (now === null || store.editBlockedBy(now.ops) !== null) return
    // 렌더 중의 견줌(위)이 대개 먼저 잡는다. 이 줄은 남의 편집이 스토어에 닿고 다시 그리기 전에 누름이 온 판의 몫이다 — 그 판을 실브라우저로
    // 세울 길이 없어 이 줄을 떼는 변조는 케이스에서 산다(K2 보고 «변조 표» M2-10).
    if (now.key !== removing.key) {
      setRemoving({ stateId: removing.stateId, key: now.key, changed: true, recheck: true })
      return
    }
    // 바뀐 목록을 본 첫 누름 — 단추 글만 «삭제»로 되돌린다.
    if (removing.recheck) {
      setRemoving({ ...removing, recheck: false })
      return
    }
    if (history.commitOps(now.ops)) setRemoving(null)
  }

  if (removing !== null) {
    const shown = pending?.names.slice(0, REMOVED_PREVIEW_LIMIT) ?? []
    const rest = (pending?.names.length ?? 0) - shown.length
    return (
      <ShellDialog open title={REMOVE_STATE_TITLE} onClose={() => setRemoving(null)} describedBy={sentenceId}>
        <div className="wb-shell-view-states-body">
          {removing.changed && (
            <p className="wb-shell-view-states-changed" role="status">
              {STATES_CHANGED}
            </p>
          )}
          <p id={sentenceId} className="wb-shell-view-states-sentence">
            {pending === null || removingState === undefined ? removeWhy : removeSentence(removingState.name, pending.caseIds.length)}
          </p>
          {shown.length > 0 && (
            <ul className="wb-shell-view-states-removed" aria-label="함께 지워지는 노드">
              {shown.map((entry) => (
                <li key={entry.id} data-node-id={entry.id}>
                  {entry.label}
                </li>
              ))}
              {rest > 0 && <li className="wb-shell-view-states-rest">외 {rest}개</li>}
            </ul>
          )}
          {pending !== null && <p className="wb-shell-view-states-note">{REMOVE_UNDO_NOTE}</p>}
          <div className="wb-shell-view-states-foot">
            <button type="button" className="wb-shell-view-states-button" onClick={() => setRemoving(null)}>
              취소
            </button>
            <button
              type="button"
              className="wb-shell-view-states-danger"
              aria-disabled={removeWhy !== null || undefined}
              title={removeWhy ?? undefined}
              aria-description={removeWhy ?? undefined}
              onClick={(event) => {
                // 더블클릭의 둘째 누름은 버린다 — 첫 누름이 «목록이 바뀌었습니다»로 다시 세운 상자를 곧바로 지우지 않게.
                if (removeWhy !== null || event.detail > 1) return
                confirmRemove()
              }}
            >
              {removing.recheck && pending !== null ? STATES_RECHECK : '삭제'}
            </button>
          </div>
        </div>
      </ShellDialog>
    )
  }

  const form = (
    <form className="wb-shell-view-states-add" onSubmit={add}>
      <label className="wb-shell-view-states-field">
        <span>{NEW_STATE_LABEL}</span>
        <input
          className="wb-shell-view-states-input"
          ref={nameRef}
          value={name}
          maxLength={VIEW_STATE_NAME_MAX * 2}
          aria-invalid={problem !== null || undefined}
          aria-describedby={problem !== null ? problemId : undefined}
          onChange={(event) => {
            setName(event.target.value)
            setProblem(null)
          }}
        />
      </label>
      <button type="submit" className="wb-shell-view-states-button">
        {shellIcon('add', 14, 'wb-shell-view-states-icon')}
        추가
      </button>
      {problem !== null && (
        <p id={problemId} className="wb-shell-view-states-problem" role="status">
          {problem}
        </p>
      )}
    </form>
  )

  if (props.dialog === 'add') {
    return (
      <ShellDialog open title={ADD_STATE_TITLE} onClose={props.onClose}>
        <div className="wb-shell-view-states-body">{form}</div>
      </ShellDialog>
    )
  }

  return (
    <ShellDialog open title={MANAGE_STATES_TITLE} onClose={props.onClose}>
      <div className="wb-shell-view-states-body">
        <p className="wb-shell-view-states-note">
          기본 상태는 늘 있습니다. 상태마다 다르게 그릴 영역은 구조 트리 줄 `…` 의 «상태별로 나누기»로 정합니다.
        </p>
        {viewStates.length === 0 ? (
          <p className="wb-shell-view-states-empty">아직 상태가 없습니다.</p>
        ) : (
          <ul className="wb-shell-view-states-list" aria-label="상태 목록">
            {viewStates.map((state, index) => (
              <li key={state.id} className="wb-shell-view-states-row">
                {renaming?.id === state.id ? (
                  <form className="wb-shell-view-states-rename" onSubmit={rename}>
                    <input
                      className="wb-shell-view-states-input"
                      aria-label={`${state.name} 새 이름`}
                      value={renaming.value}
                      autoFocus
                      aria-invalid={renaming.problem !== null || undefined}
                      onChange={(event) => setRenaming({ id: state.id, value: event.target.value, problem: null })}
                    />
                    <button type="submit" className="wb-shell-view-states-button">
                      저장
                    </button>
                    <button type="button" className="wb-shell-view-states-button" onClick={() => setRenaming(null)}>
                      취소
                    </button>
                    {renaming.problem !== null && (
                      <p className="wb-shell-view-states-problem" role="status">
                        {renaming.problem}
                      </p>
                    )}
                  </form>
                ) : (
                  <>
                    <span className="wb-shell-view-states-name">{state.name}</span>
                    <RowButton
                      label={`${state.name} 위로`}
                      icon="moveUp"
                      disabled={index === 0}
                      onClick={() => history.commitOps(moveViewStateOps(doc, state.id, index - 1))}
                    />
                    <RowButton
                      label={`${state.name} 아래로`}
                      icon="moveDown"
                      disabled={index === viewStates.length - 1}
                      onClick={() => history.commitOps(moveViewStateOps(doc, state.id, index + 1))}
                    />
                    <RowButton
                      label={`${state.name} 이름 바꾸기`}
                      icon="rename"
                      onClick={() => setRenaming({ id: state.id, value: state.name, problem: null })}
                    />
                    <RowButton
                      label={`${state.name} 삭제`}
                      icon="remove"
                      onClick={() => {
                        const shown = removal(doc, state.id)
                        if (shown !== null) setRemoving({ stateId: state.id, key: shown.key, changed: false, recheck: false })
                      }}
                    />
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {form}
      </div>
    </ShellDialog>
  )
}

/** 줄의 아이콘 단추 — 이름 = `title` = 아이콘을 얹기 전의 글(`shell/icons.ts` 머리말). */
function RowButton(props: {
  label: string
  icon: 'moveUp' | 'moveDown' | 'rename' | 'remove'
  disabled?: boolean
  onClick: () => void
}): ReactElement {
  return (
    <button
      type="button"
      className="wb-shell-view-states-row-button"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {shellIcon(props.icon, 14)}
    </button>
  )
}
