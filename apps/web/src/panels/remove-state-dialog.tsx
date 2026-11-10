/**
 * **상태 삭제 확인**(설계서 「설계서 화면 구조」의 «화면 상태») — «페이지 정보» 탭의 상태 `…` «삭제»가 연다(`./page-states.tsx`).
 *
 * 지우는 것은 `removeViewStateOps` 하나가 정한다 — 그 상태와 하위 상태를 목록에서 빼고, 노드 보임의 `states` 에서 그 id 들을 뺀다:
 *
 * | 상자가 말하는 것 | 집합 |
 * |---|---|
 * | 지워지는 상태 이름 | `removedStateIds` — 그 상태와 하위 상태 |
 * | 함께 지워지는 노드(이름) | `removedNodeIds` — `only` 가 비어 지워지는 노드와 그 자손 |
 * | 보임을 걷는 노드 수 | `clearedNodeIds` — `except` 가 비어 모든 상태에서 보이게 되는 노드 |
 * | 보임을 줄이는 노드 수 | `trimmedNodeIds` — 남은 상태로 바뀌는 노드 |
 *
 * 편집 하나 — 되돌리기 한 번에 상태 · 보임 · 노드가 함께 돌아온다.
 *
 * ## 보인 집합을 보낸다
 *
 * **보인 것과 보낼 묶음이 같은지를 id 집합으로 견준다** — 연 뒤 남이 그 상태에 보임을 걸거나 · 지울 노드를 바꾸거나 · 하위 상태를 더하면
 * «삭제»가 보내지 않고 새 집합으로 다시 서며 «목록이 바뀌었습니다» 한 줄을 띄운다(메뉴 연쇄 삭제 `./menu-delete-dialog.tsx` 와 같은 꼴 — 확인
 * 단추가 «새 목록 확인»이 되고 첫 누름은 안 보낸다). 지울 · 고칠 노드 안에 남이 잡은 노드가 있으면 «삭제»를 끄고 까닭을 단다(`editBlockedBy` —
 * 서버도 423 으로 막는다).
 */
import { useId, useState, type ReactElement } from 'react'
import {
  nodeRowLabel,
  removeViewStateOps,
  walkNodes,
  type CodeIndex,
  type PageDocument,
  type PatchOp,
  type WbNode,
} from '@wirebound/schema'
import { useProjectCodes } from '../codes/project-codes'
import { useEditCommit } from '../edit/use-edit-commit'
import { ShellDialog } from '../shell/shell-dialog'
import { useEditorStoreInstance, useOpenDocument } from '../store/use-editor-store'
import { useLockedBy } from '../store/use-locked-by'

export const REMOVE_STATE_TITLE = '상태 삭제'
export const STATES_CHANGED = '목록이 바뀌었습니다 — 다시 확인하세요.'
/** 목록이 바뀐 뒤 확인 단추의 글 — 누르면 «삭제»로 돌아가고 아무것도 안 보낸다(메뉴 연쇄 삭제의 «새 목록 확인»과 같은 꼴). */
export const STATES_RECHECK = '새 목록 확인'
/** 지운 뒤 되돌리는 길 — 상태 삭제는 편집 하나라 개인 되돌리기로 돌아온다. */
export const REMOVE_UNDO_NOTE = '되돌리기(Cmd+Z)로 상태 · 보임 · 노드를 함께 되살립니다.'
/** 지워지는 노드 이름을 보이는 수 — 나머지는 «외 N개». */
export const REMOVED_PREVIEW_LIMIT = 8
/** 상태가 이미 없다 — 남이 먼저 지웠다. */
export const STATE_GONE_REASON = '이 상태가 목록에 없습니다 — 다른 사람이 먼저 지웠을 수 있습니다.'

/** 첫 문장 — 지워지는 상태. */
export function removeStateSentence(names: readonly string[]): string {
  const [first, ...rest] = names
  return rest.length === 0 ? `"${first}" 상태를 지웁니다.` : `"${first}" 상태와 하위 상태 ${rest.length}개(${rest.join(' · ')})를 지웁니다.`
}

/** 둘째 문장 — 보임이 걸린 노드의 수. 셋 다 0 이면 빈 글. */
export function removeStateCounts(counts: { removed: number; cleared: number; trimmed: number }): string {
  const parts = [
    counts.removed > 0 ? `노드 ${counts.removed}개가 함께 삭제됩니다` : '',
    counts.cleared > 0 ? `노드 ${counts.cleared}개는 모든 상태에서 보이게 됩니다` : '',
    counts.trimmed > 0 ? `노드 ${counts.trimmed}개는 남은 상태에서만 보임이 유지됩니다` : '',
  ].filter((part) => part !== '')
  return parts.length === 0 ? '이 상태에 보임이 걸린 노드는 없습니다.' : `${parts.join(' · ')}.`
}

/** 삭제가 바꾸는 것 — 상자가 보이는 것과 보내는 것이 이 하나에서 나온다. 검증 전 문서에서 걷기가 던지면 `null`. */
interface Removal {
  ops: PatchOp[]
  stateNames: string[]
  removed: { id: string; label: string }[]
  cleared: number
  trimmed: number
  /** 네 집합을 정렬해 이은 글 — 견줄 열쇠. */
  key: string
}

function removal(doc: PageDocument, stateId: string, codes: CodeIndex | undefined): Removal | null {
  try {
    const result = removeViewStateOps(doc, stateId)
    if (result === null) return null
    const states = Array.isArray(doc.viewStates) ? doc.viewStates : []
    const gone = new Set(result.removedNodeIds)
    const removed: { id: string; label: string }[] = []
    for (const { node } of walkNodes(doc.root)) {
      if (gone.has(node.id)) removed.push({ id: node.id, label: nodeRowLabel(node as WbNode, codes) })
    }
    const sorted = (ids: readonly string[]): string => [...ids].sort().join(',')
    return {
      ops: result.ops,
      stateNames: result.removedStateIds.map((id) => states.find((state) => state.id === id)?.name ?? id),
      removed,
      cleared: result.clearedNodeIds.length,
      trimmed: result.trimmedNodeIds.length,
      key: [result.removedStateIds, result.removedNodeIds, result.clearedNodeIds, result.trimmedNodeIds].map(sorted).join('|'),
    }
  } catch {
    return null
  }
}

/** 묻는 중 — 연 순간(또는 다시 선 순간)의 열쇠, 그것이 바뀌어 다시 섰는가(알림), 확인 단추가 «새 목록 확인»인가. */
interface Asking {
  key: string
  changed: boolean
  recheck: boolean
}

export function RemoveStateDialog(props: {
  projectId: string
  target: { pageId: string; stateId: string } | null
  onClose: () => void
  /** 연 줄이 사라졌을 때 포커스를 돌려줄 자리(`ShellDialog` 의 `focusFallback`). */
  focusFallback?: () => HTMLElement | null
}): ReactElement | null {
  const doc = useOpenDocument(props.target?.pageId)
  if (props.target === null || doc === null) return null
  // 대상이 바뀌면 새로 마운트한다 — 앞 대상의 열쇠가 남지 않게.
  return <OpenRemoveStateDialog key={`${props.target.pageId}/${props.target.stateId}`} {...props} target={props.target} doc={doc} />
}

function OpenRemoveStateDialog(props: {
  projectId: string
  target: { pageId: string; stateId: string }
  doc: PageDocument
  onClose: () => void
  focusFallback?: () => HTMLElement | null
}): ReactElement {
  const store = useEditorStoreInstance()
  // **잠금 목록을 구독한다** — «삭제»의 끔(`editBlockedBy`)은 렌더 중에 묻는데 그 함수는 참조가 안 바뀐다. 안 구독하면 남이 지울 노드를 놓아도
  // 상자가 다시 안 그려져 «삭제»가 꺼진 채 남았다(`build-test/state-tree.test.ts` «두 사람»).
  useLockedBy()
  const { commitOps } = useEditCommit({ projectId: props.projectId, pageId: props.target.pageId })
  const sentenceId = useId()
  // 지워질 줄의 이름은 구조 트리 줄과 같은 글이다 — 묶인 노드는 표의 이름.
  const codes = useProjectCodes().index
  const pending = removal(props.doc, props.target.stateId, codes)
  const [asking, setAsking] = useState<Asking>(() => ({ key: pending?.key ?? '', changed: false, recheck: false }))
  // 묻는 사이 집합이 바뀌었으면(남의 편집이 닿음) 새 집합으로 다시 선다 — 렌더 중에 고친다(«삭제»가 보는 열쇠와 같은 값).
  if (pending !== null && pending.key !== asking.key) setAsking({ key: pending.key, changed: true, recheck: true })
  const blocker = pending === null ? null : store.editBlockedBy(pending.ops)
  const why =
    pending === null ? STATE_GONE_REASON : blocker !== null ? `${blocker.userName}님이 편집 중인 노드가 있어 함께 지울 수 없습니다` : null

  function confirm(): void {
    const now = removal(props.doc, props.target.stateId, codes)
    if (now === null || store.editBlockedBy(now.ops) !== null) return
    // 렌더 중의 견줌(위)이 대개 먼저 잡는다. 이 줄은 남의 편집이 스토어에 닿고 다시 그리기 전에 누름이 온 판의 몫이다.
    if (now.key !== asking.key) {
      setAsking({ key: now.key, changed: true, recheck: true })
      return
    }
    // 바뀐 집합을 본 첫 누름 — 단추 글만 «삭제»로 되돌린다.
    if (asking.recheck) {
      setAsking({ ...asking, recheck: false })
      return
    }
    if (commitOps(now.ops)) props.onClose()
  }

  const shown = pending?.removed.slice(0, REMOVED_PREVIEW_LIMIT) ?? []
  const rest = (pending?.removed.length ?? 0) - shown.length
  return (
    <ShellDialog
      open
      title={REMOVE_STATE_TITLE}
      onClose={props.onClose}
      describedBy={sentenceId}
      {...(props.focusFallback === undefined ? {} : { focusFallback: props.focusFallback })}
    >
      <div className="wb-shell-view-states-body">
        {asking.changed && (
          <p className="wb-shell-view-states-changed" role="status">
            {STATES_CHANGED}
          </p>
        )}
        <p id={sentenceId} className="wb-shell-view-states-sentence">
          {pending === null ? why : removeStateSentence(pending.stateNames)}
        </p>
        {pending !== null && (
          <p className="wb-shell-view-states-sentence">
            {removeStateCounts({ removed: pending.removed.length, cleared: pending.cleared, trimmed: pending.trimmed })}
          </p>
        )}
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
          <button type="button" className="wb-shell-view-states-button" onClick={props.onClose}>
            취소
          </button>
          <button
            type="button"
            className="wb-shell-view-states-danger"
            aria-disabled={why !== null || undefined}
            title={why ?? undefined}
            aria-description={why ?? undefined}
            onClick={(event) => {
              // 더블클릭의 둘째 누름은 버린다 — 첫 누름이 «목록이 바뀌었습니다»로 다시 세운 상자를 곧바로 지우지 않게.
              if (why !== null || event.detail > 1) return
              confirm()
            }}
          >
            {asking.recheck && pending !== null ? STATES_RECHECK : '삭제'}
          </button>
        </div>
      </div>
    </ShellDialog>
  )
}
