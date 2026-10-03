/**
 * **에디터 단축키를 지금 명령에 잇는 자리**(설계서 「설계서 화면 구조」의 단축키). 표는 `edit/editor-shortcuts.ts`, 리스너는
 * `edit/use-editor-shortcuts.ts` 이고, 여기는 명령마다 **이미 있는 함수**를 부른다 — 판정을 새로 짓지 않는다.
 *
 * | 명령 | 부르는 것 | 같은 함수를 부르는 단추 |
 * |---|---|---|
 * | 되돌리기 · 다시 실행 | `useEditCommit` 의 `undo` · `redo` | 머리의 «되돌리기» · «다시 실행»(`routes/editor.tsx` 의 `UndoTools`) |
 * | 삭제 · 위로 · 아래로 · 들여쓰기 · 내어쓰기 | `useStructureCommands` 의 명령 — `abilities` 가 참일 때만 | 구조 트리 줄 `…` |
 * | 복제 · 붙이기 | `edit/paste-ops.ts` 의 `duplicateOps` · `pasteOps` → `editBlockedBy` → `commitOps` | — |
 * | 복사 · 잘라내기 | 봉투(`writeNodesEnvelope`) · 잘라내기의 지우기는 삭제와 같은 명령 | — |
 * | 선택 이동 | `edit/selection-move.ts` → `store.selectNode` | 트리 줄 · 캔버스 누름 |
 * | 도움말 | `shell/shortcut-help.tsx` | — |
 *
 * 복사 · 잘라내기 · 붙여넣기는 키가 아니라 `copy` · `cut` · `paste` 이벤트로 받는다(`edit/use-clipboard.ts`).
 *
 * **훅 인스턴스가 하나 더 서는 것은 괜찮다** — 전송 루프의 in-flight 가드는 훅의 `ref` 가 아니라 스토어가 든다(`store/editor-store.ts` 의
 * `#pumping`). 그래서 머리 단추와 이 키가 서로 다른 `useEditCommit` 을 불러도 같은 큐 · 같은 되돌리기 스택을 지난다 —
 * `test/edit/use-editor-shortcuts.test.tsx` 가 단추와 키로 각각 되돌린 스토어 상태를 견준다.
 *
 * **키가 판정을 지나야 하는 까닭** — 키 이벤트는 끈 단추를 지나지 않는다. 판정을 안 보면 회색인 조작이 키로만 실행된다. 특히 **들여쓰기는
 * 뒤에서 안 막힌다** — `moveNodeOps` 는 타입을 읽지 않아 앞 형제가 자식을 못 담아도 연산을 짓고, 그것이 `children-not-allowed` 문서가 되어
 * 서버로 나간다. 그것을 막는 것은 `structureAbilities.indent` 하나다. 되돌리기도 단추가 꺼진 판(`canUndo` 가 거짓)에서는 부르지 않는다 —
 * 빈 스택의 되돌리기가 앞 통지를 치우는 것까지 단추와 같게.
 */
import { useEffect, useRef, useState, type ReactElement } from 'react'
import {
  matchPageTargets,
  prepareNodesForPaste,
  readNodesEnvelope,
  writeNodesEnvelope,
  type TargetedPage,
  type WbNode,
} from '@wirebound/schema'
import { useApi } from '../api/context'
import { useCanvasDocument } from '../canvas/canvas-document'
import { platformOf, type ShortcutCommand } from '../edit/editor-shortcuts'
import {
  PASTE_PAGES_FAILURE,
  droppedActionsNotice,
  duplicateOps,
  hasPageTargets,
  pageTargetsOf,
  pasteOps,
  type NodeEdit,
} from '../edit/paste-ops'
import { findNodeSafely } from '../edit/safe-walk'
import { moveSelection } from '../edit/selection-move'
import { useClipboard } from '../edit/use-clipboard'
import { useEditCommit } from '../edit/use-edit-commit'
import { useEditorShortcuts } from '../edit/use-editor-shortcuts'
import { lockedNotice } from '../panels/property-panel'
import { useStructureCommands } from '../panels/structure-toolbar'
import { lockedSelectionStatus } from '../panels/toolbar-status'
import { isPageOpen, openDocumentNow, useEditorStore, useEditorStoreInstance, useOpenDocument } from '../store/use-editor-store'
import { useLockedBy } from '../store/use-locked-by'
import { ShortcutHelp } from './shortcut-help'

export function EditorKeys(props: {
  projectId: string
  pageId: string | undefined
  /** 편집 모드 && `canEdit` — 편집 명령이 이것으로 선다. 고르기 · 선택 이동 · 도움말은 늘 선다. */
  editable: boolean
}): ReactElement {
  const store = useEditorStoreInstance()
  const doc = useOpenDocument(props.pageId)
  const selectedNodeId = useEditorStore(store, (s) => s.selectedNodeId)
  // 잠금은 구조 트리와 같은 한 자리(`store/use-locked-by.ts`)에서 받아 같은 명령 훅에 넘긴다 — 판정은 스토어가 한다.
  const lockOf = useLockedBy()
  const commands = useStructureCommands({
    projectId: props.projectId,
    pageId: props.pageId,
    selectedLock: selectedNodeId === null ? null : lockOf(selectedNodeId),
    pageLock: typeof doc?.root?.id === 'string' ? lockOf(doc.root.id) : null,
  })
  const history = useEditCommit({ projectId: props.projectId, pageId: props.pageId ?? '' })
  const api = useApi()
  const [helpOpen, setHelpOpen] = useState(false)
  const [platform] = useState(() => platformOf(navigator))
  const canvasDocument = useCanvasDocument()

  /** 알림 — 편집 실패와 같은 하단 바 한 자리(`EditAlert`). 패턴 넣기 · 프리셋의 실패와 같은 통로다. */
  const say = (message: string): void => store.setEditFailure({ kind: 'message', message })

  /**
   * 노드를 넣는 편집을 낸다 — 이유면 말하고, 남의 잠금에 부딪히면(서버의 2차 방어와 같은 물음 — 스토어의 `editBlockedBy`) 말하고 안 보낸다.
   * 넣은 노드의 **마지막**을 고른다 — 하나만 고르는 판이라, 이어 붙이면 앞서 붙인 것 뒤에 차례로 선다.
   */
  const commitInsert = (edit: NodeEdit, commitOps: (ops: Parameters<typeof history.commitOps>[0]) => boolean): boolean => {
    if ('reason' in edit) {
      say(edit.reason)
      return false
    }
    const blocker = store.editBlockedBy(edit.ops)
    if (blocker !== null) {
      say(lockedNotice(blocker.userName))
      return false
    }
    if (!commitOps(edit.ops)) return false
    const last = edit.insertedIds[edit.insertedIds.length - 1]
    if (last !== undefined) store.selectNode(last)
    return true
  }

  /** 고른 노드를 남이 잡았는가 — 루트는 빼고(루트 자리의 붙이기는 페이지 끝이라 판정 `editBlockedBy` 에 맡긴다 — `palette/palette-add.ts` 머리말). */
  const selectedLockedByOther = (): boolean => {
    if (doc === null || selectedNodeId === null || selectedNodeId === doc.root?.id) return false
    const lock = lockOf(selectedNodeId)
    if (lock === null) return false
    say(lockedSelectionStatus(lock.userName))
    return true
  }

  /** 고른 노드의 봉투. 고른 것이 없거나 루트면 `null` — 브라우저의 복사가 그대로다. */
  const copySelected = (): string | null => {
    if (doc === null || selectedNodeId === null || selectedNodeId === doc.root?.id) return null
    const node = findNodeSafely(doc.root, selectedNodeId)
    return node === undefined ? null : writeNodesEnvelope([node], doc.version)
  }

  /**
   * 붙이기의 끝 — 페이지 목록을 읽어야 했으면 그 뒤에 돈다. **문서 · 기준 노드는 이 순간의 스토어 값이다** — 목록을 읽는 사이 남의 편집 · 고르기가
   * 들어올 수 있다. 그 사이 다른 페이지로 옮겼으면 부르는 쪽이 이미 돌아갔다.
   */
  const finishPaste = (pageId: string, nodes: readonly WbNode[], pages: readonly TargetedPage[] | null): void => {
    const document = openDocumentNow(store, pageId)
    if (document === null) return
    const anchor = store.getState().selectedNodeId
    const prepared = prepareNodesForPaste(nodes, {
      node: (id) => findNodeSafely(document.root, id) !== undefined,
      page: (target) => pages !== null && matchPageTargets(pages, target).length > 0,
    })
    if (anchor !== null && anchor !== document.root?.id) {
      const lock = store.lockedBy(anchor)
      if (lock !== null) {
        say(lockedSelectionStatus(lock.userName))
        return
      }
    }
    if (!commitInsert(pasteOps(document, anchor, prepared.nodes), live.current.commitOps)) return
    if (prepared.droppedActions > 0) say(droppedActionsNotice(prepared.droppedActions))
  }

  /** 붙이기 — 봉투가 아니면 `false`(브라우저의 붙여넣기가 그대로다 · 통지 없음). */
  const paste = (text: string): boolean => {
    const read = readNodesEnvelope(text)
    if (read === null) return false
    const pageId = props.pageId
    if (pageId === undefined) return true
    if (!hasPageTargets(read.nodes)) {
      finishPaste(pageId, read.nodes, null)
      return true
    }
    // 페이지 대상이 있으면 지금 프로젝트의 페이지 목록으로 가늠한다 — 이 화면에 목록을 든 곳이 메뉴 트리뿐이라(그 훅의 상태) 다시 읽는다.
    // 읽는 사이 다른 페이지로 옮겼으면 붙이지도 말하지도 않는다(`isPageOpen`).
    void api.getTree(props.projectId).then(
      (menu) => {
        if (isPageOpen(store, pageId)) finishPaste(pageId, read.nodes, pageTargetsOf(menu))
      },
      () => {
        if (isPageOpen(store, pageId)) say(PASTE_PAGES_FAILURE)
      },
    )
    return true
  }

  /**
   * 잘라내기 — 지울 수 있을 때만 봉투를 싣고 지운다. 판정 · 지우기는 삭제 단축키 · 줄 `…` «삭제»와 같은 것(`abilities.remove` ·
   * `commands.remove`)이다. 못 지우는 까닭이 남의 잠금이면 말하고, 루트 · 고른 것 없음은 말없이 브라우저의 잘라내기에 둔다.
   */
  const cut = (): string | null => {
    if (!commands.abilities.remove) {
      selectedLockedByOther()
      return null
    }
    const text = copySelected()
    if (text !== null) commands.remove()
    return text
  }

  // 목록을 읽은 뒤 도는 붙이기는 그때의 `commitOps`(열린 페이지 대조가 든 것)를 써야 한다.
  const live = useRef({ commitOps: history.commitOps })
  useEffect(() => {
    live.current = { commitOps: history.commitOps }
  })

  function run(command: ShortcutCommand): void {
    switch (command) {
      case 'undo':
        if (history.canUndo) history.undo()
        return
      case 'redo':
        if (history.canRedo) history.redo()
        return
      case 'delete':
        if (commands.abilities.remove) commands.remove()
        return
      case 'moveUp':
        if (commands.abilities.moveUp) commands.moveUp()
        return
      case 'moveDown':
        if (commands.abilities.moveDown) commands.moveDown()
        return
      case 'indent':
        if (commands.abilities.indent) commands.indent()
        return
      case 'outdent':
        if (commands.abilities.outdent) commands.outdent()
        return
      case 'duplicate':
        if (doc === null || selectedNodeId === null || selectedLockedByOther()) return
        commitInsert(duplicateOps(doc, [selectedNodeId]), history.commitOps)
        return
      case 'deselect':
        store.selectNode(null)
        return
      case 'selectPrev':
      case 'selectNext':
      case 'selectParent':
      case 'selectFirstChild': {
        if (doc === null) return
        const next = moveSelection(doc.root, selectedNodeId, command, (id) => store.selectionBlockedBy(id) !== null)
        if (next !== null) store.selectNode(next)
        return
      }
      case 'help':
        setHelpOpen(true)
        return
      // 형제 모두 고르기는 여럿 고르기가 서야 뜻이 있다 — 하나만 고르는 판에서는 기준 노드가 그대로다.
      case 'selectSiblings':
        return
    }
  }

  useEditorShortcuts({ canvasDocument, editable: props.editable, run, platform })
  useClipboard({ canvasDocument, editable: props.editable, copy: copySelected, cut, paste })

  return <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} platform={platform} />
}
