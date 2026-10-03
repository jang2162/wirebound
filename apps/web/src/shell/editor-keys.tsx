/**
 * **에디터 단축키를 지금 명령에 잇는 자리**(설계서 「설계서 화면 구조」의 단축키). 표는 `edit/editor-shortcuts.ts`, 리스너는
 * `edit/use-editor-shortcuts.ts` 이고, 여기는 명령마다 **이미 있는 함수**를 부른다 — 판정을 새로 짓지 않는다.
 *
 * | 명령 | 부르는 것 | 같은 함수를 부르는 단추 |
 * |---|---|---|
 * | 되돌리기 · 다시 실행 | `useEditCommit` 의 `undo` · `redo` | 머리의 «되돌리기» · «다시 실행»(`routes/editor.tsx` 의 `UndoTools`) |
 * | 삭제 · 위로 · 아래로 · 들여쓰기 · 내어쓰기 | `useStructureCommands` 의 명령 — `abilities` 가 참일 때만 | 구조 트리 줄 `…` |
 * | 선택 이동 | `edit/selection-move.ts` → `store.selectNode` | 트리 줄 · 캔버스 누름 |
 * | 도움말 | `shell/shortcut-help.tsx` | — |
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
import { useState, type ReactElement } from 'react'
import { useCanvasDocument } from '../canvas/canvas-document'
import { platformOf, type ShortcutCommand } from '../edit/editor-shortcuts'
import { moveSelection } from '../edit/selection-move'
import { useEditCommit } from '../edit/use-edit-commit'
import { useEditorShortcuts } from '../edit/use-editor-shortcuts'
import { useStructureCommands } from '../panels/structure-toolbar'
import { useEditorStore, useEditorStoreInstance, useOpenDocument } from '../store/use-editor-store'
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
  const [helpOpen, setHelpOpen] = useState(false)
  const [platform] = useState(() => platformOf(navigator))

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
      // 복제는 클립보드와 함께 선다. 형제 모두 고르기는 여럿 고르기가 서야 뜻이 있다 — 하나만 고르는 판에서는 기준 노드가 그대로다.
      case 'duplicate':
      case 'selectSiblings':
        return
    }
  }

  useEditorShortcuts({ canvasDocument: useCanvasDocument(), editable: props.editable, run, platform })

  return <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} platform={platform} />
}
