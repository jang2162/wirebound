/**
 * 좌측 하단의 구조 트리 — 열린 페이지의 컴포넌트 트리다(설계서 「설계서 화면 구조」). 편집 모드에서만 있고,
 * 뷰 모드에서는 자리째 접힌다(`routes/editor.tsx`).
 *
 * **문서와 선택은 스토어에서 온다.** 캔버스도 같은 곳을 보므로 어느 쪽에서 골라도 둘이
 * 같은 것을 가리킨다 — 각자 상태를 들면 "캔버스에서 고른 노드"와 "트리에서 고른 노드"가
 * 서로 다른 것이 되고, 그 어긋남은 속성 패널이 어느 쪽을 믿어야 할지의 문제로 번진다.
 *
 * 고르는 것 위에 **구조 편집이 얹혀 있다** — 줄의 `+` · `…`(`panels/tree-row-actions.tsx`) · 제목 줄의 뿌리 `+` · 끌어 놓기
 * (`drag/use-pointer-drag.ts` · 자리 판정 `edit/structure-drop.ts`) · 고르개 단축키(`TREE_SHORTCUTS`). 넷 다 `useStructureCommands`
 * (`panels/structure-toolbar.tsx`)의 명령을 부르고, 판정과 편집은 그쪽이 한다. 삭제 · 순서 · 계층의 키는 에디터 단축키
 * (`shell/editor-keys.tsx`)가 같은 훅의 함수로 받는다.
 */
import { useId, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { NodeLock, WbNode } from '@wirebound/schema'
import { DropIndicator } from '../drag/drop-indicator'
import { platformOf, type ShortcutLine } from '../edit/editor-shortcuts'
import { usePublishTreeRegion } from '../drag/use-placement'
import { scrollParent, usePointerDrag, type PointerDrag } from '../drag/use-pointer-drag'
import { findNodeSafely } from '../edit/safe-walk'
import { visibleNodeOrder } from '../edit/selection-move'
import { structureAbilities } from '../edit/structure-actions'
import { sameDrop, type StructureDrop } from '../edit/structure-drop'
import { ActionMenu } from '../shell/action-menu'
import { useEditorStore, useEditorStoreInstance, useOpenDocument } from '../store/use-editor-store'
import { useLockedBy } from '../store/use-locked-by'
import { nodeTypeLabel } from './node-shape'
import { structureTreeHint } from './structure-tree-hint'
import { selectionCapNotice } from './toolbar-status'
import { isTypingSurface } from './typing-surface'
import { StructurePicker, useStructureCommands, type StructureCommands } from './structure-toolbar'
import { structureRowItems, TreeRowActions } from './tree-row-actions'

/**
 * **이 상자의 단축키** — 구조 트리의 고르개를 여는 둘(패턴 넣기 · 프리셋). 고르개는 이 트리의 명령 인스턴스(`useStructureCommands` 의
 * `adding`)에 매여 있어 트리 상자 안에서 받는다. 삭제 · 순서 · 계층 · 선택 이동은 에디터 어디서나 먹는 표(`edit/editor-shortcuts.ts` 의
 * `EDITOR_SHORTCUTS`)가 받는다 — 셸이 같은 명령 훅의 함수에 잇는다(`shell/editor-keys.tsx`).
 */
const TREE_SHORTCUTS: {
  match: (event: KeyboardEvent) => boolean
  /**
   * 이 조작이 지금 막혔는가. **항목의 끔과 같은 값을 지나야 한다** — 키
   * 이벤트는 끈 항목을 지나지 않으므로, 여기서 안 보면 회색인 조작이 단축키로만
   * 실행된다.
   *
   * **불린을 내는 함수인 것이 요점이다.** `ability: keyof StructureAbilities | null`처럼
   * 표의 키를 가리키게 하면 `null`이 *"판정이 없다"*를 뜻해 **패턴·프리셋이 잠금도 안 본다**
   * — 그러면 그 둘이 잠긴 자리에 423을 낸다(`structure-toolbar.tsx`의 `patternLocked`에 실측).
   * 함수이므로 그 둘도 자기 값을 갖는다.
   *
   * **`StructureAbilities`에는 키를 만들지 않는다.**
   * 그 표에 `openPattern: true` 같은 키를 더하면 `structureAbilities`가 *"고른 노드가
   * 없다"*에서 내는 `NOTHING`(전부 `false`)에 그 키도 `false`로 들어간다. **그런데 이
   * 둘은 선택이 없어도 되는 조작이다** — 패턴은 선택이 없으면 root의 자식 끝에 꽂고,
   * 프리셋은 페이지 통째라 자리를 아예 고르지 않는다. 즉 표에 넣는 순간
   * **정확히 그 상태에서만 단축키가 죽는다.** `WHY_DISABLED`도 절대 보이지 않을 문장을
   * 하나씩 갖게 된다(그 표는 `Record<keyof StructureAbilities, string>`이다).
   */
  blocked: (commands: StructureCommands) => boolean
  run: (commands: StructureCommands) => void
  /** 도움말 상자의 한 줄(`shell/shortcut-help.tsx`). */
  line: ShortcutLine
}[] = [
  {
    // **`code`를 본다 — `key`가 아니다.** macOS에서 `Alt`(Option)를 누른 채 글자 키를
    // 치면 `event.key`가 그 조합의 **특수문자**가 된다(`Alt`+`P`는 `π`). `code`는 물리 키를
    // 가리키므로 그 변환을 지나지 않는다.
    //
    // **jsdom으로는 그 변환을 재현할 수 없다** — `key`도 `code`도 테스트가 직접 넣는
    // 값이다. 그래서 이것은 **잰 것이 아니라 플랫폼 동작을 근거로 고른 것**이고,
    // `Alt`+`Shift` 조합에 브라우저·OS 기본 바인딩이 있는지도 재지 못했다.
    match: (event) => event.code === 'KeyI' && event.altKey && event.shiftKey,
    blocked: (commands) => commands.patternLocked,
    run: (commands) => commands.openAdd('pattern'),
    line: { keys: (p) => (p === 'mac' ? '⌥⇧I' : 'Alt+Shift+I'), label: '패턴 넣기' },
  },
  {
    // **`I`(넣기)와 `P`(페이지 통째)로 갈랐다.** 둘 다 `P`로 시작하는 낱말이라
    // (Pattern·Preset) 첫 글자로는 못 가른다 — 툴바 라벨이 *"패턴 **넣기**"*이고
    // 프리셋은 **페이지** 통째를 바꾸는 것이라 그 축으로 골랐다.
    match: (event) => event.code === 'KeyP' && event.altKey && event.shiftKey,
    blocked: (commands) => commands.presetLocked,
    run: (commands) => commands.openAdd('preset'),
    line: { keys: (p) => (p === 'mac' ? '⌥⇧P' : 'Alt+Shift+P'), label: '프리셋' },
  },
]

/** 도움말 상자가 그리는 이 상자의 줄 — 위 표에서 짓는다(글자를 두 벌 두지 않는다). */
export const TREE_SHORTCUT_LINES: readonly ShortcutLine[] = TREE_SHORTCUTS.map((shortcut) => shortcut.line)

export function StructureTree(props: {
  projectId: string
  pageId: string | undefined
  /**
   * **구조를 고칠 수 있는가** — 셸이 `projectAbilities(role).editDesign`을 넘긴다. `false`면 **줄 행동 · 뿌리 `+` · 끌어 놓기와 단축키가
   * 함께 간다** — 메뉴 트리의 `editable`과 같은 이유로 가르지 않는다(줄 행동만 빼면 `Delete`·`Alt+↑`가 남는다).
   * **트리 자체는 남는다** — 노드를 고르는 것은 읽기다(속성 · 코멘트를 보려고 고른다). 고른 노드를 잠그지 않는 것은
   * 셸의 `useNodeLock`이 같은 값으로 한다. 이 컴포넌트는 역할을 모른다.
   */
  editable: boolean
  /** 트리 제목 줄의 행동 자리 — 뿌리 `+`를 거기 그린다(메뉴 트리의 `headSlot`과 같은 까닭). 없으면 안 그린다. */
  headSlot?: HTMLElement | null
}): ReactElement {
  const store = useEditorStoreInstance()
  // selector를 여러 번 부른다(`use-editor-store.tsx`의 주석 — `(s) => s`는 테스트 전용이다).
  // 문서는 `useOpenDocument`로 받는다 — 스토어의 문서가 **지금 주소의 것**일 때만 그린다.
  const doc = useOpenDocument(props.pageId)
  const selectedNodeId = useEditorStore(store, (s) => s.selectedNodeId)
  const selectedNodeIds = useEditorStore(store, (s) => s.selectedNodeIds)
  const [platform] = useState(() => platformOf(navigator))
  // **목록을 구독하는 자리는 이 파일 밖이다.** 잠금을 봐야 하는 패널이 둘(여기와 속성
  // 패널)이라 형제 둘 중 하나에 둘 수 없다 — 그 사정과 «자리는 하나»는
  // `store/use-locked-by.ts`가 갖는다. **판정은 스토어가 한다.**
  const lockOf = useLockedBy()
  // **선택이 잠금을 거는가**(스토어의 `selectionClaims`). 값을 안 쓴다 — 바뀌면 다시 그리려고 구독한다.
  // 줄의 `disabled`는 `store.selectionBlockedBy`가 정하고, 그 판정이 이 값을 본다.
  useEditorStore(store, (s) => s.selectionClaims)
  // **조작을 여기서 한 번만 만든다.** 줄 행동에 내려 주고 아래 고르개 단축키(`TREE_SHORTCUTS`)도 같은 것을 쓴다.
  const commands = useStructureCommands({
    projectId: props.projectId,
    pageId: props.pageId,
    // **고른 노드의 잠금도 여기서 내려 준다.** 그 값이 하는 일이 둘이다 — 줄 행동의 판정을
    // 끄고(`structureAbilities`의 셋째 인자), 트리 아래 상태줄이 *"○○님이 편집 중"*을
    // 그것으로 말한다. 목록을 손에 쥐는 자리는 화면에 하나여야 하고(그 규칙과 근거는
    // `test/lock/one-verdict.test.ts`), 그 하나가 바로 위의 구독이다.
    //
    // **단축키가 같은 값을 지나는 것이 요점이다.** 에디터 단축키(`shell/editor-keys.tsx`)도 같은 훅의 `abilities`를
    // 보므로, 판정이 훅에서 꺼지면 단축키도 함께 꺼진다 — 판정을 이 컴포넌트에서 끔으로
    // 겹치면 그렇게 되지 않는다.
    //
    // **줄에 붙는 배지로는 안 닫히는 자리가 있다.** 배지는 잠금이 가리키는 노드에만
    // 붙는데(아래 `StructureNode`), 막히는 것은 그 **서브트리 전체**다 — 자동 선택된
    // 루트는 문서 안 모든 노드의 조상이라, 남이 아무 노드나 잡으면 루트 줄이
    // `aria-current`인 채 회색이 되고, 상태줄이 이 값으로 말하지 않으면 그 이유가 화면
    // 어디에도 없다.
    selectedLock: selectedNodeId === null ? null : lockOf(selectedNodeId),
    // **판정 밖의 둘이 지나는 잠금.** 루트는 문서 안 모든 노드의 조상이므로
    // `lockedBy(root)`가 곧 *"이 페이지에 살아 있는 남의 잠금이 있나"*다 — 목록을 다시
    // 뒤지지 않고 **같은 판정 한 벌**로 답한다. 어느 조작이 이것을 쓰는지는
    // `structure-toolbar.tsx`의 `pageLock` 주석에 있다.
    //
    // 루트가 노드가 아닌 문서(검증 전에는 가능하다)에서는 물을 id가 없으므로 `null`이다 —
    // 그때는 `structureAbilities`도 아무것도 못 찾아 일곱이 이미 꺼져 있다.
    pageLock: typeof doc?.root?.id === 'string' ? lockOf(doc.root.id) : null,
  })
  const statusId = useId()
  /**
   * 프리셋 이름칸에 친 글자. **고르개가 아니라 여기서 든다** — 고르개는 잠금이 걸리는 동안 DOM에서 빠지지만 트리는 그대로 있다.
   * 왜 이 하나만 가르는지는 `visiblePicker`의 머리말 «두 축»이 갖는다.
   */
  const [presetName, setPresetName] = useState('')
  /** 줄을 찾는 상자 — 끄는 동안 포인터 밑 줄(`[data-tree-row]`)을 여기서 찾는다. */
  const treeRef = useRef<HTMLUListElement>(null)
  usePublishTreeRegion(treeRef)
  /**
   * **끌어 놓기.** 포인터 밑 줄과 띠로 놓을 자리를 받고(`./structure-tree-hint.ts` — 캔버스 손잡이 · 목록 카드가 트리 위를 지날 때도 같은
   * 함수다), 놓으면 `dropTo`가 `moveNodeOps`로 낸다. 남이 잡은 자리는 판정이 스토어의 `editBlockedBy`(서버의 2차 방어와 같은 물음)로
   * 거른다 — `edit/structure-drop.ts` 머리말.
   *
   * **줄 끌기는 경로 층(`drag/use-placement.ts`)을 지나지 않는다** — 그래서 트리 줄은 캔버스에 놓을 수 없다. 이 트리 영역은 경로 층에
   * 싣는다(`usePublishTreeRegion`) — 다른 끌기가 트리 위를 지날 때 이 줄들로 판정한다.
   *
   * **놓는 답은 보인 답이다**(`sameDrop` — 캔버스 손잡이와 같은 판정 함수). 끄는 사이 남이 보인 줄의 노드를 지우거나 앞에 줄을 넣으면
   * 멈춘 포인터 밑에 다른 줄이 와 있어, 끌기 장치가 뗀 좌표로 다시 물은 답이 보인 띠와 다른 자리다 — 그때는 놓지 않는다
   * (`drag/use-pointer-drag.ts` 머리말 «놓는 답은 보인 답이다» · `build-test/canvas-drop-review.test.ts` «구조 트리 줄 끌기»). 표시는
   * 옛 줄 상자에 남는다(캔버스의 `refresh` 를 트리에는 걸지 않았다).
   */
  const drag = usePointerDrag<string, StructureDrop>({
    onOver: (source, point) =>
      doc === null
        ? null
        : (structureTreeHint(treeRef.current, doc, { kind: 'node', id: source }, point, store.editBlockedBy)?.hint ?? null),
    onDrop: (source, target) => commands.dropTo(source, target),
    sameDrop,
    scrollContainer: () => scrollParent(treeRef.current),
  })

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    // **고칠 수 없으면 단축키도 없다**(`editable`). 찾기 전에 돌아가므로 `preventDefault`도 안 걸린다.
    if (!props.editable) return
    // **값을 넣거나 고르는 표면에서 난 키는 구조 조작이 아니다**(`./typing-surface.ts`). **단축키를 찾기 전에** 걸러야
    // `preventDefault`가 걸리지 않는다 — 걸리면 글자가 안 들어간다.
    if (isTypingSurface(event.target)) return

    const shortcut = TREE_SHORTCUTS.find((candidate) => candidate.match(event))
    if (shortcut === undefined) return

    // **인식한 키만 막는다.** 막은 키는 에디터 단축키 리스너도 안 본다(`shortcutsBlocked` 의 `defaultPrevented`).
    event.preventDefault()
    // **버튼과 같은 판정을 지난다** — 키 이벤트는 `disabled`를 지나지 않는다. 남이 잠근 자리도 이 줄이 막는다.
    if (shortcut.blocked(commands)) return

    shortcut.run(commands)
  }

  if (doc === null) {
    // 문서가 없는 이유가 셋(페이지 미선택·조회 중·조회 실패)이라는 것은 스토어만 봐서는
    // 알 수 없다(`routes/editor.tsx`의 `CanvasFrame` 주석). 어느 쪽이든 트리에 그릴
    // 것은 없으므로 여기서는 가르지 않고, 이유는 캔버스가 그 자리에서 말한다.
    //
    // **툴바도 함께 없다.** 문서가 없으면 판정이 전부 `false`라 비활성 버튼만 남는데,
    // 그리려면 "왜 아무것도 못 하는가"를 트리 자리의 안내와 두 번 말하게 된다.
    return <p className="wb-shell-tree-notice">열린 페이지가 없습니다</p>
  }

  const rootId = typeof doc.root?.id === 'string' ? doc.root.id : null
  /**
   * **줄을 누른다** — 클릭은 그것 하나, Cmd(mac) · Ctrl 클릭은 더하기 · 빼기, Shift 클릭은 기준 노드부터 보이는 차례로(설계서 「설계서 화면
   * 구조」의 «고르는 법»). 규칙(조상 · 자손 · 루트 · 남의 잠금 · 상한)은 스토어 명령이 갖는다 — 상한에 걸렸으면 하단 바가 말한다.
   */
  const pick = (nodeId: string, event: MouseEvent<HTMLButtonElement>): void => {
    const command = platform === 'mac' ? event.metaKey : event.ctrlKey
    const change = command
      ? store.toggleSelect(nodeId)
      : event.shiftKey
          ? store.selectRange(nodeId, visibleNodeOrder(doc.root))
          : null
    if (change === null) store.selectNode(nodeId)
    else if (change.capped > 0) store.setEditFailure({ kind: 'message', message: selectionCapNotice() })
  }
  /** 고른 줄 전부 — 줄마다 «고른 줄인가»를 묻는다(강조). */
  const selectedSet = new Set(selectedNodeIds)
  /**
   * **고르개가 설 줄** — 고른 줄, 고른 것이 없거나 문서에 없으면 뿌리 줄. 패턴 · 프리셋은 고른 것 없이도 열리므로(뿌리 `+`) 붙을 줄이
   * 있어야 한다 — 페이지 통째의 조작이라 뿌리 줄 아래다.
   */
  const anchorId =
    selectedNodeId !== null && findNodeSafely(doc.root, selectedNodeId) !== undefined ? selectedNodeId : rootId
  /** 뿌리의 판정 — 뿌리 `+`의 «페이지에 추가»가 뿌리를 골라 «안에 추가»를 열므로 그 판정을 먼저 본다(잠기면 뿌리를 못 고른다). */
  const rootAbilities = structureAbilities(doc, rootId, rootId === null ? null : lockOf(rootId))
  const picker = props.editable ? (
    <StructurePicker
      commands={commands}
      projectId={props.projectId}
      pageId={props.pageId}
      // **문서를 여기서 이미 읽었으므로 그대로 내려 준다.** `children`이 배열이 아닌 문서에서는 `null`이다 —
      // 그때 저장할 것이 없고, 고르개의 저장 버튼이 비활성이 된다.
      currentNodes={Array.isArray(doc.root?.children) ? doc.root.children : null}
      presetName={presetName}
      onPresetNameChange={setPresetName}
    />
  ) : null

  return (
    // **고르개 단축키가 이 상자에 붙는다 — 전역이 아니다**(고르개가 이 트리의 상태라서 — `TREE_SHORTCUTS` 머리말). 스타일이 없는
    // 상자라 클래스도 붙이지 않는다.
    <div onKeyDown={handleKeyDown}>
      <ul className="wb-shell-structure" ref={treeRef}>
        <StructureNode
          node={doc.root}
          selectedNodeId={selectedNodeId}
          selected={selectedSet}
          selection={selectedNodeIds.join(',')}
          onSelect={pick}
          // 판정의 자리는 위 `lockOf` 선언이 갖는다 — 줄과 상태줄이 **같은 값**을 쓴다.
          lockOf={lockOf}
          blockedOf={store.selectionBlockedBy}
          row={
            props.editable
              ? { commands, drag, statusId, rootId, anchorId, picker, select: store.selectNode }
              : null
          }
        />
      </ul>
      {props.editable && <DropIndicator hint={drag.hint} />}
      {/* **상태줄** — 고른 것에 무엇을 못 하는지 · 누가 잡았는지를 한 문장으로(`panels/toolbar-status.ts`의 `structureStatus`). 줄 행동의
          항목이 이 줄을 설명으로 들고(`aria-describedby`), 할 말이 있으면 이 줄 자체가 탭 정지점이다 — 남이 잡은 자리에서는 줄 행동이
          없어 키보드로 이유에 닿는 자리가 이 줄뿐이다(`test/panels/toolbar-status-reach.test.tsx`).

          **고칠 수 없으면 DOM 에서 뺀다**(`editable` — 셸의 `canEdit` 표 «동작 입구»). */}
      {props.editable && <StructureStatusLine commands={commands} id={statusId} />}
      {props.editable &&
        props.headSlot !== undefined &&
        props.headSlot !== null &&
        createPortal(
          // **뿌리 `+`** — 페이지 통째에 더하는 셋. «페이지에 추가»는 뿌리를 골라 «안에 추가»를 연다(spec 「툴바 대신 노드별 `+` · `…`」).
          // 패턴은 고른 것을 풀고 연다 — 고른 것이 없으면 뿌리의 자식 끝에 꽂는다(`edit/pattern-insert.ts`).
          <ActionMenu
            label="구조 트리에 추가"
            glyph="+"
            compact
            items={[
              {
                key: 'page',
                label: '페이지에 추가',
                disabled: !rootAbilities.addInside,
                onSelect: () => {
                  if (rootId === null) return
                  store.selectNode(rootId)
                  commands.openAdd('inside')
                },
              },
              {
                key: 'pattern',
                label: '패턴 넣기',
                disabled: typeof doc.root?.id !== 'string' || lockOf(doc.root.id) !== null,
                onSelect: () => {
                  store.selectNode(null)
                  commands.openAdd('pattern')
                },
              },
              { key: 'preset', label: '프리셋', disabled: commands.presetLocked, onSelect: () => commands.openAdd('preset') },
            ]}
          />,
          props.headSlot,
        )}
    </div>
  )
}

/** 상태줄(`StructureTree`의 주석). 할 말이 없으면 글자 없이 자리만 지킨다(`shell.css`의 `min-height`). */
export function StructureStatusLine(props: { commands: StructureCommands; id: string }): ReactElement {
  return (
    <p className="wb-shell-structure-status" id={props.id} tabIndex={props.commands.status === '' ? undefined : 0}>
      {props.commands.status}
    </p>
  )
}

/**
 * 고를 수 있는 노드인가. **타입이 아니라 런타임 값을 본다** — 렌더러가 모양 가드를 두는
 * 것과 같은 이유다(`packages/renderer/src/render.tsx`): 스토어에 실리는 문서는
 * 서버 검증 전의 것이라 일시적으로 타입을 만족하지 않을 수 있다.
 *
 * **노드인지부터 본다.** 값이 `null`이면 `node.id`를 읽는 것 자체가 던진다 — `<App />`
 * 층에서 드러나는 자리다. `edit/` 쪽 순회(`edit/safe-walk.ts`)가 견뎌도 그것으로 덮이지
 * 않는다: **선택이 없는 문서에서는 `structureAbilities`가 불리지도 않고**, 여기가 먼저
 * 그린다.
 *
 * **이 검사 자체는 지워도 지금 죽는 케이스가 없다.** 자식은 아래 `children.filter(isNodeShaped)`가
 * 먼저 거르고(그 걸러내기는 죽는다 — 지우면 `children 배열 안에 …` 케이스가 죽는다),
 * 루트가 노드가 아닌 문서는 **캔버스·렌더러가 먼저 무너져** 구조 트리까지 오지 않는다
 * (그런 문서로 열면 `구조 트리` region 자체가 화면에 없다). 그래서 루트 쪽
 * 하중을 케이스로 만들 수 없다 — 두는 것은 걸러내기가 닿지 않는 유일한 경로가 루트라서다.
 */
function isNodeShaped(node: WbNode): boolean {
  return typeof node === 'object' && node !== null && !Array.isArray(node)
}

function isSelectable(node: WbNode): boolean {
  if (typeof node !== 'object' || node === null) return false
  return typeof node.id === 'string' && node.id !== ''
}

/** 편집할 수 있는 판에서 줄마다 내려가는 것 — 명령 · 끌기 · 상태줄 id · 뿌리 · 고르개가 설 줄 · 고르개 · 고르기. */
interface RowWiring {
  commands: StructureCommands
  drag: PointerDrag<string, StructureDrop>
  statusId: string
  rootId: string | null
  anchorId: string | null
  picker: ReactNode
  select: (nodeId: string) => void
}

/** 노드 한 줄과 그 아래. 트리 자체가 재귀 구조라 컴포넌트도 재귀다. */
function StructureNode(props: {
  node: WbNode
  /** 기준 노드(`aria-current` · 줄 행동이 서는 줄). */
  selectedNodeId: string | null
  /** 고른 노드 전부(기준 노드 포함) — 강조할 줄. */
  selected: ReadonlySet<string>
  /** 고른 목록의 글자 — 열린 줄 메뉴가 연 뒤 목록이 바뀌었는지 본다(`TreeRowActions`의 `selection`). */
  selection: string
  onSelect: (nodeId: string, event: MouseEvent<HTMLButtonElement>) => void
  /** 그 노드를 막는 남의 잠금을 내는 함수(`store/use-locked-by.ts`). 없으면 `null`을 낸다. */
  lockOf: (nodeId: string) => NodeLock | null
  /**
   * 그 노드를 **고르는 것을** 막는 잠금(`store.selectionBlockedBy`). `lockOf`와 갈리는 것은 선택이 잠금을 걸지 않는
   * 사람(viewer)뿐이다 — 그에게는 배지는 서고 줄은 눌린다.
   */
  blockedOf: (nodeId: string) => NodeLock | null
  /** 편집할 수 있는 판의 줄 행동 · 끌기 배선. `null`이면 고르기만 한다(viewer · 뷰 모드). */
  row: RowWiring | null
}): ReactElement {
  const { node, row } = props
  // **모양 가드 둘.** 검증 전 문서에는 `children`이 배열이 아니거나 `type`이
  // 문자열이 아닌 노드가 들어올 수 있고, 둘 다 렌더 도중 던진다 — 앞은 `.map`이,
  // 뒤는 React가(`Objects are not valid as a React child`). 이쪽에는 캔버스와 달리 오류
  // 경계가 없어서 던지면 **셸 전체가 DOM에서 사라진다**(실측: `type`이 객체인 노드로
  // 재 봤다 — `./node-shape.ts`의 머리말). 지금 막는 것이 이 둘이고, 목록이 완전한지는
  // 재지 못했다.
  const children = Array.isArray(node.children) ? node.children : []
  const typeLabel = nodeTypeLabel(node)
  // id가 없는 노드는 잠금과 짝지을 것이 없다 — 아래에서 고를 수도 없다.
  const lock = isSelectable(node) ? props.lockOf(node.id) : null

  /**
   * **이 줄이 기준 노드인가** — 줄 행동이 서는 줄이고, 열린 줄 메뉴가 그대로 있을 조건이다(`TreeRowActions`의 `picked`). 여럿을 고른 판의
   * 줄 행동은 기준 노드 줄의 `…`에서 연다 — 그 «삭제»가 고른 것 전부를 지운다. **다른 고른 줄의 `…`를 열면 그 줄 하나로 고른다**(`onOpen`).
   * 연 뒤 고른 목록이 바뀌면(Cmd · Shift 클릭 · Cmd+A · 남의 편집 · 거절) 메뉴를 닫는다(`selection`) — 항목이 연 때의 목록에 대해 선다.
   */
  const picked = props.selectedNodeId === node.id
  /** 고른 줄인가 — 기준 노드가 아니어도(강조). */
  const inSelection = isSelectable(node) && props.selected.has(node.id)
  /**
   * **남이 잡은 줄은 행동도 끌기도 없다 — 고른 줄은 빼고.** 줄 단추가 이미 꺼져 있다(`blockedOf`). 행동을 열면 그 줄을 먼저 고르는데
   * (아래 `onOpen`) 고르기가 막히므로 목록이 **앞 선택의 판정 · 명령**으로 설 것이다. **이미 고른 줄은 다르다** — 고른 뒤에 남의 잠금이
   * 도착한 판(선택은 그대로 남는다 — `edit/structure-actions.ts` 머리말)이고, 그때 목록은 그 줄의 판정(`selectedLock`이 전부 끈다)으로
   * 서서 무엇이 왜 꺼졌는지 보인다. 끌기는 그 노드를 뽑는 편집이 잠금에 부딪치는 판이라(`lockOf` — 그 노드와 조상 · 자손의 잠금)
   * 들리지도 않게 한다. 뿌리는 옮기지 않으므로 끌지 않는다.
   */
  const open = row !== null && isSelectable(node) && (picked || props.blockedOf(node.id) === null)
  const draggable = open && row.rootId !== node.id && props.lockOf(node.id) === null
  const lifted = row !== null && isSelectable(node) && row.drag.dragging === node.id

  return (
    <li>
      {/* **id가 없는 노드는 고를 수 없다.** 선택은 id 하나로 오가므로(스토어·캔버스·패널이
          전부 id를 본다), id 없는 노드를 누르면 아무도 가리키지 못하는 값이 스토어에
          들어간다 — 캔버스가 빈 `data-wb-id`를 거르는 것과 같은 이유다. 대신 줄은 그대로
          보여 준다: 캔버스에는 폴백으로 그려져 있는데 트리에서만 사라지면 무엇이 잘못됐는지
          더 알기 어렵다. */}
      {isSelectable(node) ? (
        // **줄 상자** — 줄 단추와 `+` · `…`가 한 줄에 서고, 끌기가 찾을 표지(`data-tree-row` · id)를 단다(메뉴 트리의 `TreeRow`와 같은
        // 꼴 · 같은 CSS — 서는 조건은 `panels/tree-row-actions.tsx` 머리말).
        <div
          className={
            'wb-shell-tree-row' + (picked ? ' wb-shell-tree-row-picked' : '') + (lifted ? ' wb-shell-tree-row-dragging' : '')
          }
          data-tree-row=""
          data-tree-kind="node"
          data-tree-id={node.id}
        >
          <button
            type="button"
            className={inSelection && !picked ? 'wb-shell-structure-node wb-shell-structure-node-member' : 'wb-shell-structure-node'}
            // 선택 표시는 `aria-current`가 갖고 색은 CSS가 가져간다 — 보조 기술이 읽는 것과
            // 눈에 보이는 것이 같은 하나에서 갈라져 나와야 둘이 어긋나지 않는다(메뉴 트리의
            // 페이지 링크와 같은 방식).
            //
            // `false`가 아니라 `undefined`인 것은 `aria-current="false"`가 DOM에 남기
            // 때문이다 — 그러면 "표시가 붙은 줄"을 셀 수 없다.
            aria-current={props.selectedNodeId === node.id ? true : undefined}
            // **누를 수 없다는 것이 보여야 한다**(설계서 「소프트 잠금」의 *"선택이 차단된다"*). 막는 것 자체는
            // `store.selectNode`가 하고(캔버스도 그 함수를 지난다) 여기 `disabled`는 **왜
            // 안 되는지를 보이는 쪽**이다 — 같은 모양인데 반응만 없으면 고장으로 읽힌다.
            disabled={props.blockedOf(node.id) !== null}
            onClick={(event) => props.onSelect(node.id, event)}
            {...(draggable ? row.drag.bind(node.id) : {})}
          >
            {typeLabel}
          </button>
          {open && (
            <TreeRowActions
              name={typeLabel}
              {...structureRowItems(row.commands, row.statusId)}
              // 열면 그 줄을 먼저 고른다 — 이미 고른 줄이면 다시 고르지 않는다(열린 고르개가 닫히지 않게 — `openAdd`는 선택을 안 본다).
              onOpen={() => {
                if (!picked) row.select(node.id)
              }}
              picked={picked}
              selection={props.selection}
            />
          )}
        </div>
      ) : (
        <span className="wb-shell-structure-broken">{typeLabel}</span>
      )}

      {/* 「소프트 잠금」의 *"○○ 편집 중"* 배지. **잠금이 가리키는 노드에만 붙는다** — 서브트리 전체가
          막히지만 자손마다 이름을 붙이면 트리가 이름으로 뒤덮이고, 누가 무엇을 잡았는지가
          오히려 안 보인다. **이름은 잠금이 직접 나른다**(`realtime/protocol.ts`의
          `NodeLockView`) — 참가자 목록에서 찾으면 그 목록이 낡은 한 프레임 동안 배지가
          조용히 사라진다. */}
      {lock !== null && lock.nodeId === node.id && (
        <span className="wb-shell-structure-lock">{lock.userName} 편집 중</span>
      )}

      {/* **고르개는 그 줄 바로 아래다**(`StructureTree`의 `anchorId`). */}
      {row !== null && isSelectable(node) && row.anchorId === node.id && row.picker}

      {children.length > 0 && (
        <ul className="wb-shell-structure-list">
          {/* **노드가 아닌 원소는 줄로 그리지 않는다.** 그릴 이름도 고를 id도 없고,
              `nodeTypeLabel`이 `node.type`을 읽는 순간 던진다. id 없는 노드(줄은 그린다)와
              다른 것은 그쪽은 **노드이긴 하다**는 점이다. */}
          {children.filter(isNodeShaped).map((child, index) => (
            // 키는 노드 id다. 인덱스를 쓰면 구조 편집이 형제를 넣고 뺄 때 React가 앞 노드의
            // 상태를 다른 노드에 재사용한다. id가 없는 노드에서만 인덱스로 물러선다 —
            // 그 자리에는 쓸 id가 없다.
            <StructureNode
              key={isSelectable(child) ? child.id : `wb-invalid-${index}`}
              node={child}
              selectedNodeId={props.selectedNodeId}
              selected={props.selected}
              selection={props.selection}
              onSelect={props.onSelect}
              lockOf={props.lockOf}
              blockedOf={props.blockedOf}
              row={row}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
