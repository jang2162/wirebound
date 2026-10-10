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
 * | 선택 이동 | `edit/selection-move.ts` → `store.selectNode` — ← → 는 먼저 접고 편다(`foldStep` → `tree/collapse.ts`) | 트리 줄 · 캔버스 누름 · 줄 앞 펼침 단추 |
 * | 형제 모두 고르기(Cmd+A) | `edit/selection-move.ts` 의 `siblingIds` → `store.selectMany` | 트리 · 캔버스의 Cmd · Shift 클릭 · 사각형(같은 스토어 명령 무리) |
 * | 별칭 바꾸기(F2) | `panels/alias-edit.tsx` 의 `open` — `aliasLocked` 가 거짓일 때만 | 구조 트리 줄 `…` «별칭 바꾸기» · 줄 더블클릭 |
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
  type ViewState,
  type WbNode,
} from '@wirebound/schema'
import { useApi } from '../api/context'
import { useCanvasDocument } from '../canvas/canvas-document'
import { platformOf, type ShortcutCommand } from '../edit/editor-shortcuts'
import {
  PASTE_LEFT_NOTICE,
  PASTE_PAGES_FAILURE,
  droppedActionsNotice,
  droppedCasesNotice,
  duplicateOps,
  hasPageTargets,
  pageTargetsOf,
  pasteOps,
  type NodeEdit,
} from '../edit/paste-ops'
import { renameCaseStates, renameStatesByName } from '../edit/preset-apply'
import { findNodeSafely } from '../edit/safe-walk'
import { ancestorIds, foldStep, moveSelection, siblingIds } from '../edit/selection-move'
import { useClipboard } from '../edit/use-clipboard'
import { useEditCommit } from '../edit/use-edit-commit'
import { useEditorShortcuts } from '../edit/use-editor-shortcuts'
import { useAliasEdit } from '../panels/alias-edit'
import { lockedNotice } from '../panels/property-panel'
import { useStructureCommands } from '../panels/structure-toolbar'
import { lockedSelectionStatus, selectionCapNotice } from '../panels/toolbar-status'
import { MULTI_WHY_DISABLED } from '../edit/structure-actions'
import type { EditFailure } from '../store/editor-store'
import { LOSS_RANK } from '../store/loss-notice'
import { openDocumentNow, useEditorStore, useEditorStoreInstance, useOpenDocument } from '../store/use-editor-store'
import { useLockedBy } from '../store/use-locked-by'
import { collapse, collapsedOf, expand, structureKey } from '../tree/collapse'
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
  const selectedNodeIds = useEditorStore(store, (s) => s.selectedNodeIds)
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
  const aliasEdit = useAliasEdit(props.pageId)
  const [platform] = useState(() => platformOf(navigator))
  const canvasDocument = useCanvasDocument()

  /** 알림 — 편집 실패와 같은 하단 바 한 자리(`EditAlert`). 패턴 넣기 · 프리셋의 실패와 같은 통로다. */
  const say = (message: string): void => store.setEditFailure({ kind: 'message', message })

  /**
   * 노드를 넣는 편집을 낸다 — 이유면 말하고, 남의 잠금에 부딪히면(서버의 2차 방어와 같은 물음 — 스토어의 `editBlockedBy`) 말하고 안 보낸다.
   * 넣은 노드의 **마지막**을 고른다 — 하나만 고르는 판이라, 이어 붙이면 앞서 붙인 것 뒤에 차례로 선다. `tell` 은 할 말을 세우는 길이다 — 기다린
   * 뒤의 붙이기는 앞 잃음을 덮지 않는 길을 준다(`finishPaste`).
   */
  const commitInsert = (
    edit: NodeEdit,
    commitOps: (ops: Parameters<typeof history.commitOps>[0]) => boolean,
    tell: (message: string) => void = say,
  ): boolean => {
    if ('reason' in edit) {
      tell(edit.reason)
      return false
    }
    const blocker = store.editBlockedBy(edit.ops)
    if (blocker !== null) {
      tell(lockedNotice(blocker.userName))
      return false
    }
    if (!commitOps(edit.ops)) return false
    // **넣은 노드 전부를 고른다**(설계서 «붙인 노드(들)가 고른 노드가 된다») — 기준 노드는 마지막 것이라 이어 붙이면 그 뒤에 차례로 선다.
    const last = edit.insertedIds[edit.insertedIds.length - 1]
    if (last !== undefined) store.selectMany(edit.insertedIds, 'replace', last)
    return true
  }

  /** 고른 노드(여럿이면 그 가운데 하나라도)를 남이 잡았는가 — 루트는 빼고(루트 자리의 붙이기는 페이지 끝이라 판정 `editBlockedBy` 에 맡긴다 — `palette/palette-add.ts` 머리말). */
  const selectedLockedByOther = (): boolean => {
    if (doc === null) return false
    for (const nodeId of selectedNodeIds) {
      if (nodeId === doc.root?.id) continue
      const lock = lockOf(nodeId)
      if (lock === null) continue
      say(lockedSelectionStatus(lock.userName))
      return true
    }
    return false
  }

  /** 고른 노드들의 봉투 — 문서 차례(목록이 이미 그 차례다). 고른 것이 없거나 루트면 `null` — 브라우저의 복사가 그대로다. */
  const copySelected = (): string | null => {
    if (doc === null || selectedNodeIds.length === 0 || selectedNodeIds.includes(doc.root?.id)) return null
    const nodes = selectedNodeIds.map((id) => findNodeSafely(doc.root, id)).filter((node): node is WbNode => node !== undefined)
    // 상태 목록을 함께 싣는다 — 붙이는 쪽이 뺀 가지를 이 페이지의 이름으로 말한다(`readNodesEnvelope` 머리말).
    return nodes.length === 0 ? null : writeNodesEnvelope(nodes, doc.version, Array.isArray(doc.viewStates) ? doc.viewStates : undefined)
  }

  /** 여럿을 고른 판에서 하나일 때만 되는 키(순서 · 계층 · 화살표 고르기)를 눌렀다 — 끈 채 이유를 말한다. */
  const manyPicked = (): boolean => {
    if (selectedNodeIds.length <= 1) return false
    say(MULTI_KEY_NOTICE)
    return true
  }

  /**
   * 붙이기의 끝 — 페이지 목록을 읽어야 했으면 그 뒤에 돈다. **기준 노드는 누른 때 고른 노드(`anchor`)다** — 읽는 사이 다른 노드를 골라도 누른
   * 자리에 붙는다. **문서는 이 순간의 스토어 값이다** — 읽는 사이 남의 편집 · 같은 페이지 다시 싣기(재연결 · 복원 다시 읽기 · 편집 실패 수습)가
   * 들어올 수 있고, 기준 노드가 그 문서에 없으면 페이지 끝이다(설계서 「설계서 화면 구조」 붙이기의 «자리» — 고른 것이 없으면 페이지 끝). 그 사이
   * 다른 페이지로 옮겼으면 부르는 쪽이 이미 돌아갔다.
   *
   * `pressed` 는 누른 때의 통지다 — 기다린 붙이기만 준다. **기다리는 사이 선 잃음(수습의 «취소됐습니다» 등)은 치우지도 덮지도 않는다** — 편집은
   * 그 통지를 안 치우고(`CommitOptions.pressed`) 할 말은 그 뒤에 잇는다(`EditorStore.tellLoss`). 덮으면 사람이 누르지 않은 편집의 잃음이 사라진다.
   */
  const finishPaste = (
    pageId: string,
    nodes: readonly WbNode[],
    sourceStates: readonly ViewState[] | undefined,
    pages: readonly TargetedPage[] | null,
    anchor: string | null,
    pressed?: EditFailure | null,
  ): void => {
    const document = openDocumentNow(store, pageId)
    if (document === null) return
    const tell =
      pressed === undefined
        ? say
        : (message: string) => (store.getState().editFailure !== pressed && store.showsLoss() ? tellPasteLoss(message) : say(message))
    const at = anchor !== null && findNodeSafely(document.root, anchor) !== undefined ? anchor : null
    // 붙이는 페이지에 같은 이름의 상태가 있으면 가지를 그 id 로 옮기고(프리셋과 같은 자 — `renameStatesByName`), 없는 이름의 가지는 뺀다
    // (설계서 「설계서 화면 구조」 클립보드 · 화면 상태).
    const states = new Set((Array.isArray(document.viewStates) ? document.viewStates : []).map((state) => state.id))
    const rename = renameStatesByName(document.viewStates, sourceStates)
    const prepared = prepareNodesForPaste(rename.size === 0 ? nodes : nodes.map((node) => renameCaseStates(node, rename)), {
      node: (id) => findNodeSafely(document.root, id) !== undefined,
      page: (target) => pages !== null && matchPageTargets(pages, target).length > 0,
      state: (id) => states.has(id),
    })
    if (at !== null && at !== document.root?.id) {
      const lock = store.lockedBy(at)
      if (lock !== null) {
        tell(lockedSelectionStatus(lock.userName))
        return
      }
    }
    const commitOps = (ops: Parameters<typeof history.commitOps>[0]): boolean => live.current.commitOps(ops, { pressed })
    if (!commitInsert(pasteOps(document, at, prepared.nodes), commitOps, tell)) return
    const dropped = [
      ...(prepared.droppedCases.length > 0 ? [droppedCasesNotice(prepared.droppedCases, sourceStates)] : []),
      ...(prepared.droppedActions > 0 ? [droppedActionsNotice(prepared.droppedActions)] : []),
    ]
    if (dropped.length > 0) tell(dropped.join(' '))
  }

  /** 붙이지 못했다는 말 — 잃음의 조각으로 앞 잃음 뒤에 잇는다(`EditorStore.tellLoss`). 같은 문장은 한 조각이다. */
  const tellPasteLoss = (message: string): void =>
    store.tellLoss({ key: `paste:${message}`, rank: LOSS_RANK.cancelled, counts: [], render: () => message })

  /** 붙이기 — 봉투가 아니면 `false`(브라우저의 붙여넣기가 그대로다 · 통지 없음). */
  const paste = (text: string): boolean => {
    const read = readNodesEnvelope(text)
    if (read === null) return false
    const pageId = props.pageId
    if (pageId === undefined) return true
    const anchor = store.getState().selectedNodeId
    if (!hasPageTargets(read.nodes)) {
      finishPaste(pageId, read.nodes, read.viewStates, null, anchor)
      return true
    }
    // 페이지 대상이 있으면 지금 프로젝트의 페이지 목록으로 가늠한다 — 이 화면에 목록을 든 곳이 메뉴 트리뿐이라(그 훅의 상태) 다시 읽는다.
    // **읽는 사이 떠났으면 붙이지 않고 말한다** — 페이지 id 가 아니라 판을 연 세대(`pageOpenEpoch`)로 가른다. id 로 가르면 떠났다 돌아온 판이
    // «안 떠났다»가 되어 돌아온 뒤의 선택 뒤에 붙었고, 떠나 머문 판은 말없이 사라졌다(Chrome · `build-test/editor-shortcuts-review.test.ts` «L4»).
    // 큐를 갈아 낀 수(`EditorStore` 의 `#queueEpoch`)로 가르면 같은 페이지를 다시 실은 판까지 «옮겨»로 버리고 그 거짓 문장이 수습의 통지를 덮었다(Chrome ·
    // `build-test/editor-shortcuts-review-2.test.ts` «R4»).
    const opened = store.pageOpenEpoch()
    const pressed = store.getState().editFailure
    void api.getTree(props.projectId).then(
      (menu) => {
        if (store.pageOpenEpoch() === opened) finishPaste(pageId, read.nodes, read.viewStates, pageTargetsOf(menu), anchor, pressed)
        else tellPasteLoss(PASTE_LEFT_NOTICE)
      },
      () => tellPasteLoss(store.pageOpenEpoch() === opened ? PASTE_PAGES_FAILURE : PASTE_LEFT_NOTICE),
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
    if (text !== null) commands.remove('none')
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
        // 되돌림이 큐에 있거나 미뤄져 있으면(ack 전) 다시 실행 스택은 비어 있다 — 말없이 버리지 않고 이유를 말한다(단추는 꺼져 있어 그것이 말이다).
        else if (store.undoInFlight()) say(REDO_BEFORE_ACK_NOTICE)
        return
      // **키보드 삭제는 선택을 비운다**(줄 `…` «삭제»는 부모를 고른다) — 부모를 고르면 따로 친 둘째 Delete 가 형제를 든 그 부모를 지운다
      // (Chrome · `build-test/editor-shortcuts-review.test.ts` «H1»). 누른 채의 반복은 리스너가 거른다(`Shortcut.repeat`).
      case 'delete':
        if (commands.abilities.remove) commands.remove('none')
        return
      case 'moveUp':
        if (manyPicked()) return
        if (commands.abilities.moveUp) commands.moveUp()
        return
      case 'moveDown':
        if (manyPicked()) return
        if (commands.abilities.moveDown) commands.moveDown()
        return
      case 'indent':
        if (manyPicked()) return
        if (commands.abilities.indent) commands.indent()
        return
      case 'outdent':
        if (manyPicked()) return
        if (commands.abilities.outdent) commands.outdent()
        return
      // **고른 노드마다 제 바로 뒤에**(`duplicateOps`) — 여럿이면 묶음 하나 · 되돌리기 하나다.
      case 'duplicate':
        if (doc === null || selectedNodeIds.length === 0 || selectedLockedByOther()) return
        commitInsert(duplicateOps(doc, selectedNodeIds), history.commitOps)
        return
      case 'deselect':
        store.selectNode(null)
        return
      case 'selectPrev':
      case 'selectNext':
      case 'selectParent':
      case 'selectFirstChild': {
        if (doc === null || manyPicked()) return
        // 접힘은 구조 트리와 같은 것(`tree/collapse.ts` — 이 페이지의 것)이다. ← → 는 접고 펼 것이 있으면 그것만 한다(`foldStep`).
        const key = structureKey(props.pageId)
        const collapsed = collapsedOf(key)
        const fold = foldStep(doc.root, selectedNodeId, command, collapsed)
        if (fold !== null) {
          if (fold.fold === 'collapse') collapse(key, [fold.id])
          else expand(key, [fold.id])
          return
        }
        const next = moveSelection(doc.root, selectedNodeId, command, (id) => store.selectionBlockedBy(id) !== null, collapsed)
        if (next === null) return
        store.selectNode(next)
        revealNode(next, canvasDocument)
        followFocus(next)
        return
      }
      // **기준 노드의 형제 모두**(`siblingIds`) — 기준 노드는 그대로 둔다(루트였으면 목록의 마지막). 상한에 걸리면 말한다.
      case 'selectSiblings': {
        if (doc === null) return
        const change = store.selectMany(siblingIds(doc.root, selectedNodeId), 'replace', selectedNodeId ?? undefined)
        if (change.capped > 0) say(selectionCapNotice())
        return
      }
      // **하나를 고른 판에서만** — 판정은 줄 `…` «별칭 바꾸기»의 끔과 같은 값(`aliasLocked`)이다. 고른 노드가 사람이 접은 줄 안에 숨었으면
      // 조상을 먼저 편다 — 입력은 그 줄 아래에 서므로, 안 펴면 화면에 아무것도 안 서고 나중에 그 줄을 펴는 순간 묻지 않은 입력이 선다.
      case 'alias':
        if (commands.aliasLocked || selectedNodeId === null) return
        if (doc !== null) expand(structureKey(props.pageId), ancestorIds(doc.root, selectedNodeId))
        aliasEdit.open(selectedNodeId)
        return
      case 'help':
        setHelpOpen(true)
        return
    }
  }

  useEditorShortcuts({ canvasDocument, editable: props.editable, run, platform })
  useClipboard({ canvasDocument, editable: props.editable, copy: copySelected, cut, paste })

  return <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} platform={platform} />
}

/** 되돌림이 서버에 닿기 전에 누른 «다시 실행» — 스택은 되돌림의 ack 가 채운다(`EditorStore.ackEdit`). */
export const REDO_BEFORE_ACK_NOTICE = '되돌리는 중입니다 — 서버에 닿은 뒤에 다시 실행할 수 있습니다.'

/** 여럿을 고른 판에서 순서 · 계층 · 화살표 고르기 키를 눌렀을 때의 하단 바 문장 — 줄 행동의 끈 이유(`MULTI_WHY_DISABLED`)를 잇는다. */
export const MULTI_KEY_NOTICE = `여럿을 고른 판입니다 — 순서 · 계층 옮기기와 화살표로 고르기는 ${MULTI_WHY_DISABLED}`

/**
 * **포커스가 구조 트리 줄 단추에 있었으면 옮겨 간 선택의 줄로 따라간다.** 안 따라가면 선택은 다음 줄인데 포커스는 앞 줄에 남아, 이어 친
 * Enter · Space 가 포커스 줄(앞 줄)을 다시 골랐다(Chrome · `build-test/keyboard-holes.test.ts` «7»). 포커스가 다른 곳(캔버스 · 패널)이면 안 건드린다 — 사람이 둔 자리다.
 */
function followFocus(nodeId: string): void {
  const active = document.activeElement
  if (!(active instanceof HTMLElement) || !active.classList.contains('wb-shell-structure-node')) return
  const row = [...document.querySelectorAll('[data-tree-kind="node"]')].find((one) => one.getAttribute('data-tree-id') === nodeId)
  row?.querySelector<HTMLElement>(':scope > button.wb-shell-structure-node')?.focus()
}

/**
 * **화살표로 옮긴 선택을 구조 트리 줄 · 캔버스 노드에서 보이게 굴린다.** 선택 이동 키는 `preventDefault` 가 걸려 칸을 굴리지 않으므로 이것이
 * 없으면 옮겨 간 선택이 화면 밖에 남는다(Chrome · `build-test/editor-shortcuts-review.test.ts` «L5»). `block: 'nearest'` — 이미 보이면 안 굴린다.
 * 캔버스 노드는 iframe 문서 안이고, 그 `scrollIntoView` 가 호스트의 캔버스 칸까지 굴린다. **jsdom 에는 `scrollIntoView` 가 없다** — 있을 때만 부른다.
 */
function revealNode(nodeId: string, canvasDocument: Document | null): void {
  // 셀렉터에 id 를 끼우지 않고 속성 값으로 찾는다 — 검증 전 문서의 id 는 셀렉터 글자를 품을 수 있다(`CSS.escape` 는 jsdom 에 없다).
  const find = (root: Document | null, attribute: string): Element | undefined =>
    root === null ? undefined : [...root.querySelectorAll(`[${attribute}]`)].find((element) => element.getAttribute(attribute) === nodeId)
  for (const element of [find(document, 'data-tree-id'), find(canvasDocument, 'data-wb-id')]) {
    if (element !== undefined && typeof element.scrollIntoView === 'function') element.scrollIntoView({ block: 'nearest' })
  }
}
