/**
 * 좌측 하단의 구조 트리 — 열린 페이지의 컴포넌트 트리다(설계서 「설계서 화면 구조」). 편집 모드에서만 있고,
 * 뷰 모드에서는 자리째 접힌다(`routes/editor.tsx`).
 *
 * **문서와 선택은 스토어에서 온다.** 캔버스도 같은 곳을 보므로 어느 쪽에서 골라도 둘이
 * 같은 것을 가리킨다 — 각자 상태를 들면 "캔버스에서 고른 노드"와 "트리에서 고른 노드"가
 * 서로 다른 것이 되고, 그 어긋남은 속성 패널이 어느 쪽을 믿어야 할지의 문제로 번진다.
 *
 * 고르는 것 위에 **구조 편집이 얹혀 있다** — 줄의 `…`(`panels/tree-row-actions.tsx`) · 끌어 놓기(`drag/use-pointer-drag.ts` · 자리 판정
 * `edit/structure-drop.ts`). 둘 다 `useStructureCommands`(`panels/structure-toolbar.tsx`)의 명령을 부르고, 판정과 편집은 그쪽이 한다. 삭제 · 순서 ·
 * 계층의 키는 에디터 단축키(`shell/editor-keys.tsx`)가 같은 훅의 함수로 받는다. **노드를 넣는 입구는 여기 없다** — 하단 판(컴포넌트 · 모듈 카드)과
 * 붙여넣기 · 복제가 넣는다(설계 spec `2026-10-18-modules-states-layout-design.md` 「B1」). 줄 `…` 의 «모듈로 저장…»이 고른 노드를 모듈로 남긴다
 * (`./save-module-dialog.tsx`).
 *
 * **줄은 접힌다** — 줄 앞 펼침 단추 · 제목 줄의 «모두 접기» · «모두 펴기»(`./tree-fold.tsx`), 접힘은 페이지마다 화면의 상태(`tree/collapse.ts`)다.
 * 고른 노드가 접힌 줄 안으로 들어가면 그 조상을 편다(아래 `chains`).
 */
import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactElement } from 'react'
import { createPortal } from 'react-dom'
import { childLists, nodeAlias, nodeSummary, zoneDefs, zonePointer, type NodeLock, type WbNode } from '@wirebound/schema'
import { DropIndicator, DropRefusal } from '../drag/drop-indicator'
import { HOVER_OPEN_EVENT, hoverRow } from '../drag/hover-open'
import { platformOf } from '../edit/editor-shortcuts'
import { usePublishTreeRegion } from '../drag/use-placement'
import { elementAt, scrollParent, usePointerDrag, type PointerDrag } from '../drag/use-pointer-drag'
import { walkSafely } from '../edit/safe-walk'
import { ancestorIds, hasChildRows, visibleNodeOrder } from '../edit/selection-move'
import { sameDrop, type StructureDrop } from '../edit/structure-drop'
import { useHiddenNodes } from '../shell/use-view-state'
import { useEditorStore, useEditorStoreInstance, useOpenDocument } from '../store/use-editor-store'
import type { ZoneRef } from '../store/editor-store'
import { useLockedBy, useLocksVersion } from '../store/use-locked-by'
import { structureKey, useCollapsed, type Collapsed } from '../tree/collapse'
import { useAliasEdit, type AliasEdit } from './alias-edit'
import { nodeTypeLabel } from './node-shape'
import { structureTreeHint, structureTreeRefusal } from './structure-tree-hint'
import { moduleSelection, SaveModuleDialog, savedModuleNotice } from './save-module-dialog'
import { selectionCapNotice } from './toolbar-status'
import { useStructureCommands, type StructureCommands } from './structure-toolbar'
import { TreeFoldButtons, TreeToggle } from './tree-fold'
import { TreeInput } from './tree-input'
import { saveModuleItem, structureRowItems, TreeRowActions } from './tree-row-actions'

export function StructureTree(props: {
  projectId: string
  pageId: string | undefined
  /**
   * **구조를 고칠 수 있는가** — 셸이 `projectAbilities(role).editDesign`을 넘긴다. `false`면 **줄 행동 · 끌어 놓기와 단축키가
   * 함께 간다** — 메뉴 트리의 `editable`과 같은 이유로 가르지 않는다(줄 행동만 빼면 `Delete`·`Alt+↑`가 남는다).
   * **트리 자체는 남는다** — 노드를 고르는 것은 읽기다(속성 · 코멘트를 보려고 고른다). 고른 노드를 잠그지 않는 것은
   * 셸의 `useNodeLock`이 같은 값으로 한다. 이 컴포넌트는 역할을 모른다.
   *
   * **«모듈로 저장…» 은 `false`여도 선다** — 문서를 바꾸지 않는 쓰기라(내 개인 모듈) 줄 `…` 에 그 한 항목만 남는다(설계 spec
   * `2026-10-20-personal-modules-design.md` «편집할 수 없는 판의 입구»). 상자의 «프로젝트 모듈» 고르기는 이 값이 참일 때만 선다 — 트리는 편집
   * 모드에만 있으므로 이 값이 곧 «프로젝트 모듈을 쓸 수 있는가»(editor 이상)다.
   */
  editable: boolean
  /** 트리 제목 줄의 행동 자리 — 모두 접기 · 펴기 · 모든 가지 보기를 거기 그린다(메뉴 트리의 `headSlot`과 같은 까닭). 없으면 안 그린다. */
  headSlot?: HTMLElement | null
}): ReactElement {
  const store = useEditorStoreInstance()
  // selector를 여러 번 부른다(`use-editor-store.tsx`의 주석 — `(s) => s`는 테스트 전용이다).
  // 문서는 `useOpenDocument`로 받는다 — 스토어의 문서가 **지금 주소의 것**일 때만 그린다.
  const doc = useOpenDocument(props.pageId)
  const selectedNodeId = useEditorStore(store, (s) => s.selectedNodeId)
  const selectedNodeIds = useEditorStore(store, (s) => s.selectedNodeIds)
  const selectedZone = useEditorStore(store, (s) => s.selectedZone)
  const [platform] = useState(() => platformOf(navigator))
  // **목록을 구독하는 자리는 이 파일 밖이다.** 잠금을 봐야 하는 패널이 둘(여기와 속성
  // 패널)이라 형제 둘 중 하나에 둘 수 없다 — 그 사정과 «자리는 하나»는
  // `store/use-locked-by.ts`가 갖는다. **판정은 스토어가 한다.**
  const lockOf = useLockedBy()
  // **선택이 잠금을 거는가**(스토어의 `selectionClaims`). 값을 안 쓴다 — 바뀌면 다시 그리려고 구독한다.
  // 줄의 `disabled`는 `store.selectionBlockedBy`가 정하고, 그 판정이 이 값을 본다.
  useEditorStore(store, (s) => s.selectionClaims)
  // **조작을 여기서 한 번만 만든다.** 줄 행동에 내려 준다.
  const commands = useStructureCommands({
    projectId: props.projectId,
    pageId: props.pageId,
    // **고른 노드의 잠금도 여기서 내려 준다.** 그 값이 하는 일이 둘이다 — 줄 행동의 판정을
    // 끄고(`structureAbilities`의 셋째 인자), 꺼진 항목의 이유가 *"○○님이 편집 중"*을
    // 그것으로 말한다(`commands.why`). 목록을 손에 쥐는 자리는 화면에 하나여야 하고(그 규칙과 근거는
    // `test/lock/one-verdict.test.ts`), 그 하나가 바로 위의 구독이다.
    //
    // **단축키가 같은 값을 지나는 것이 요점이다.** 에디터 단축키(`shell/editor-keys.tsx`)도 같은 훅의 `abilities`를
    // 보므로, 판정이 훅에서 꺼지면 단축키도 함께 꺼진다 — 판정을 이 컴포넌트에서 끔으로
    // 겹치면 그렇게 되지 않는다.
    //
    // **줄에 붙는 배지로는 안 닫히는 자리가 있다.** 배지는 잠금이 가리키는 노드에만
    // 붙는데(아래 `StructureNode`), 막히는 것은 그 **서브트리 전체**다 — 자동 선택된
    // 루트는 문서 안 모든 노드의 조상이라, 남이 아무 노드나 잡으면 루트 줄이
    // `aria-current`인 채 회색이 되고, 그 줄의 꺼진 항목이 이 값으로 말하지 않으면 그 이유가
    // 화면 어디에도 없다.
    selectedLock: selectedNodeId === null ? null : lockOf(selectedNodeId),
    // **페이지의 잠금.** 루트는 문서 안 모든 노드의 조상이므로 `lockedBy(root)`가 곧 *"이 페이지에 살아 있는 남의 잠금이 있나"*다 — 목록을 다시
    // 뒤지지 않고 **같은 판정 한 벌**로 답한다. 쓰는 자리는 `structure-toolbar.tsx`의 `pageLock` 주석에 있다.
    //
    // 루트가 노드가 아닌 문서(검증 전에는 가능하다)에서는 물을 id가 없으므로 `null`이다 —
    // 그때는 `structureAbilities`도 아무것도 못 찾아 일곱이 이미 꺼져 있다.
    pageLock: typeof doc?.root?.id === 'string' ? lockOf(doc.root.id) : null,
  })
  const alias = useAliasEdit(props.pageId)
  /** 지금 상태에서 숨은 노드(`shell/use-view-state.ts`) — 흐리게 그리고 «이 상태에서 숨김» 표지를 단다. 고르고 고칠 수 있다. */
  const hidden = useHiddenNodes(props.pageId)
  /** «모듈로 저장…» 상자가 담을 노드 — 연 순간의 선택(`./save-module-dialog.tsx` 머리말). `null` 이면 닫혀 있다. */
  const [saving, setSaving] = useState<WbNode[] | null>(null)
  /** 줄을 찾는 상자 — 끄는 동안 포인터 밑 줄(`[data-tree-row]`)을 여기서 찾는다. */
  const treeRef = useRef<HTMLUListElement>(null)
  usePublishTreeRegion(treeRef)
  /** 접힌 줄(`tree/collapse.ts` — 페이지마다 · 세션 동안). 에디터 단축키의 ← → 도 같은 것을 읽고 쓴다. */
  const fold = useCollapsed(structureKey(props.pageId))
  /**
   * **고른 노드가 접힌 줄 안이면 그 조상을 편다**(설계서 «트리 줄마다 접기»). 고른 것이 어디서 왔든 — 캔버스 누름 · 붙여넣기 · 복제 · 화살표 ·
   * 사각형 · 되돌리기 — 스토어의 선택 목록 하나로 모이므로 그것을 본다. **조상 사슬까지 열쇠에 든다** — 남의 편집이 고른 노드를 접힌 줄 안으로
   * 옮기면 선택은 그대로여도 사슬이 바뀐다. 사람이 고른 노드의 조상을 접은 판은 사슬이 그대로라 다시 펴지 않는다(접은 손을 이기지 않는다).
   */
  const chains = doc === null ? '' : JSON.stringify(selectedNodeIds.map((id) => ancestorIds(doc.root, id)))
  useLayoutEffect(() => {
    if (chains === '') return
    fold.expand((JSON.parse(chains) as string[][]).flat())
    // `fold` 는 열쇠(페이지)가 바뀔 때만 새 함수다 — 사슬과 함께 본다.
  }, [chains, fold.expand])
  // 끄는 포인터가 접힌 줄 위에 머물면(`drag/hover-open.ts`) 그 줄을 편다 — 이 트리 줄 끌기 · 카드 · 손잡이 셋 다 이 이벤트로 온다.
  useEffect(() => {
    const tree = treeRef.current
    if (tree === null) return
    const open = (event: Event): void => {
      const id = (event.target as HTMLElement).dataset['treeId']
      if (id !== undefined && id !== '') fold.expand([id])
    }
    tree.addEventListener(HOVER_OPEN_EVENT, open)
    return () => tree.removeEventListener(HOVER_OPEN_EVENT, open)
  }, [fold.expand, doc === null])
  /**
   * **끌어 놓기.** 포인터 밑 줄과 띠로 놓을 자리를 받고(`./structure-tree-hint.ts` — 캔버스 손잡이 · 목록 카드가 트리 위를 지날 때도 같은
   * 함수다), 놓으면 `dropTo`가 `moveNodeOps`로 낸다. 남이 잡은 자리는 판정이 스토어의 `editBlockedBy`(서버의 2차 방어와 같은 물음)로
   * 거른다 — `edit/structure-drop.ts` 머리말.
   *
   * **줄 끌기는 경로 층(`drag/use-placement.ts`)을 지나지 않는다** — 그래서 트리 줄은 캔버스에 놓을 수 없다. 이 트리 영역은 경로 층에
   * 싣는다(`usePublishTreeRegion`) — 다른 끌기가 트리 위를 지날 때 이 줄들로 판정한다.
   *
   * **놓는 답은 보인 답이다**(`sameDrop` — 캔버스 손잡이와 같은 판정 함수). 끄는 사이 남이 보인 줄의 노드를 지우거나 앞에 줄을 넣으면
   * 멈춘 포인터 밑에 다른 부모의 줄이 와 있으면 끌기 장치가 뗀 좌표로 다시 물은 답이 보인 자리와 다른 부모다 — 그때는 놓지 않는다
   * (`drag/use-pointer-drag.ts` 머리말 «놓는 답은 보인 답이다» · `build-test/canvas-drop-review.test.ts` «구조 트리 줄 끌기»). 문서 · 잠금이 바뀌면
   * 표시를 마지막 좌표로 다시 물어(`refresh`) 새 줄로 옮기거나 걷는다 — 같은 부모의 줄이면 따라가고(`sameDrop` 은 부모만 견준다) 다른 부모면 걷는다.
   */
  const drag = usePointerDrag<string, StructureDrop>({
    onOver: (source, point) => {
      hoverRow(elementAt(treeRef.current, '[data-tree-row]', point))
      return doc === null
        ? null
        : (structureTreeHint(treeRef.current, doc, { kind: 'node', id: source }, point, store.editBlockedBy)?.hint ?? null)
    },
    onDrop: (source, target) => commands.dropTo(source, target),
    sameDrop,
    scrollContainer: () => scrollParent(treeRef.current),
    // 못 놓는 까닭(받는 타입 · 설 자리) — 포인터 곁에 한 줄(`drag/drop-indicator.tsx` 의 `DropRefusal`).
    refusal: (source, point) => (doc === null ? null : structureTreeRefusal(treeRef.current, doc, { kind: 'node', id: source }, point)),
  })
  // 끄는 사이 문서 · 잠금이 바뀌어 줄이 밀리거나 사라지면 표시를 마지막 좌표로 다시 묻는다 — 같은 부모의 줄이면 새 줄로 옮겨 가고, 다른 부모 ·
  // 못 놓는 자리면 걷는다. 안 부르면 표시가 옛 줄 상자에 남는다(`refresh` 는 끌기가 아니면 아무것도 안 한다).
  const locksVersion = useLocksVersion()
  useLayoutEffect(() => {
    drag.refresh()
  }, [drag.refresh, doc, locksVersion])

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
  /** **그리는 트리는 문서 전부다** — 지금 상태에서 숨은 노드도 줄로 선다(흐리게 — 설계 spec «C3»). */
  const shown: WbNode = doc.root
  /**
   * **줄을 누른다** — 클릭은 그것 하나, Cmd(mac) · Ctrl 클릭은 더하기 · 빼기, Shift 클릭은 기준 노드부터 보이는 차례로(설계서 「설계서 화면
   * 구조」의 «고르는 법»). 규칙(조상 · 자손 · 루트 · 남의 잠금 · 상한)은 스토어 명령이 갖는다 — 상한에 걸렸으면 하단 바가 말한다.
   */
  const pick = (nodeId: string, event: MouseEvent<HTMLButtonElement>): void => {
    const command = platform === 'mac' ? event.metaKey : event.ctrlKey
    const change = command
      ? store.toggleSelect(nodeId)
      : event.shiftKey
        ? store.selectRange(nodeId, visibleNodeOrder(shown, fold.collapsed))
        : null
    if (change === null) store.selectNode(nodeId)
    else if (change.capped > 0) store.setEditFailure({ kind: 'message', message: selectionCapNotice() })
  }
  /** 고른 줄 전부 — 줄마다 «고른 줄인가»를 묻는다(강조). */
  const selectedSet = new Set(selectedNodeIds)
  /** «모듈로 저장…» — 그 줄을 연 누름이 줄을 고른 뒤의 선택으로 담을 노드를 정한다(여럿을 고른 판은 고른 것 전부). */
  const openSaveModule = (): void => {
    const nodes = moduleSelection(doc, store.getState().selectedNodeIds)
    if (nodes.length > 0) setSaving(nodes)
  }

  return (
    <>
      <div>
        <ul className="wb-shell-structure" ref={treeRef}>
          <StructureNode
            node={shown}
            hidden={hidden}
            selectedNodeId={selectedNodeId}
            selected={selectedSet}
            selection={selectedNodeIds.join(',')}
            onSelect={pick}
            // 판정의 자리는 위 `lockOf` 선언이 갖는다 — 줄과 꺼진 항목의 이유가 **같은 값**을 쓴다.
            lockOf={lockOf}
            blockedOf={store.selectionBlockedBy}
            fold={fold}
            row={props.editable ? { commands, drag, rootId, select: store.selectNode, alias, saveModule: openSaveModule } : null}
            saveOnly={props.editable ? null : { rootId, select: store.selectNode, saveModule: openSaveModule }}
            selectedZone={selectedZone}
            onSelectZone={store.selectZone}
          />
        </ul>
        {props.editable && <DropIndicator hint={drag.hint} />}
        {props.editable && <DropRefusal refusal={drag.refusal} />}
        {props.headSlot !== undefined &&
          props.headSlot !== null &&
          createPortal(
            <>
              {/* **모두 접기 · 모두 펴기** — 고르기와 같은 읽기라 고칠 수 없어도 선다. 모두 접어도 뿌리는 편 채다 — 뿌리는 하나라 접으면 줄 하나만
                남는다(맨 위 갈래가 보이는 것이 «모두 접은» 트리다). */}
              <TreeFoldButtons onCollapse={() => fold.collapse(foldableIds(shown, rootId))} onExpand={fold.expandAll} />
            </>,
            props.headSlot,
          )}
      </div>
      {/* **«모듈로 저장…»**(`./save-module-dialog.tsx`) — 트리 상자의 형제다(상자 안의 키가 React 트리를 따라 줄 행동으로 버블되지 않게 —
        `shell/shell-dialog.tsx` 머리말). */}
      <SaveModuleDialog
        projectId={props.projectId}
        nodes={saving}
        projectWritable={props.editable}
        onClose={() => setSaving(null)}
        onSaved={(name, to) => store.setInfoNotice(savedModuleNotice(name, to))}
      />
    </>
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
 * **이 검사 자체는 지워도 지금 죽는 케이스가 없다.** 자식은 위 `rowLists` 의 `filter(isNodeShaped)`가
 * 먼저 거르고(그 걸러내기는 죽는다 — 지우면 `children 배열 안에 …` 케이스가 죽는다),
 * 루트가 노드가 아닌 문서는 **캔버스·렌더러가 먼저 무너져** 구조 트리까지 오지 않는다
 * (그런 문서로 열면 `구조 트리` region 자체가 화면에 없다). 그래서 루트 쪽
 * 하중을 케이스로 만들 수 없다 — 두는 것은 걸러내기가 닿지 않는 유일한 경로가 루트라서다.
 */
function isNodeShaped(node: unknown): node is WbNode {
  return typeof node === 'object' && node !== null && !Array.isArray(node)
}

function isSelectable(node: WbNode): boolean {
  if (typeof node !== 'object' || node === null) return false
  return typeof node.id === 'string' && node.id !== ''
}

/** «모두 접기»가 접을 줄 — 자식 줄이 있는 고를 수 있는 노드 전부, 뿌리만 빼고(`StructureTree` 의 머리 주석). */
function foldableIds(root: unknown, rootId: string | null): string[] {
  return [...walkSafely(root)]
    .map((visit) => visit.node)
    .filter((node) => isSelectable(node) && node.id !== rootId && hasChildRows(node))
    .map((node) => node.id)
}

/** 지금 상태에서 숨은 줄의 표지 — 흐린 줄 뒤에 선다. 줄의 접근 설명도 같은 글이다. */
export const HIDDEN_IN_STATE_LABEL = '이 상태에서 숨김'

/** 별칭 입력의 접근 이름 — 속성 패널 «별칭» 칸과 같은 낱말이다. */
const ALIAS_INPUT_LABEL = '별칭'

/** 편집할 수 있는 판에서 줄마다 내려가는 것 — 명령 · 끌기 · 뿌리 · 고르기 · 별칭 · 모듈로 저장. */
interface RowWiring {
  commands: StructureCommands
  drag: PointerDrag<string, StructureDrop>
  rootId: string | null
  select: (nodeId: string) => void
  /** 별칭 입력이 선 줄(`./alias-edit.tsx`). */
  alias: AliasEdit
  /** «모듈로 저장…» 상자를 연다 — 지금 선택으로(뿌리 줄에는 항목이 없다 — `./tree-row-actions.tsx`). */
  saveModule: () => void
}

/** 편집할 수 없는 판에서 줄마다 내려가는 것 — 뿌리 · 고르기 · 모듈로 저장(뿌리 줄에는 항목이 없다). */
interface SaveOnlyWiring {
  rootId: string | null
  select: (nodeId: string) => void
  saveModule: () => void
}

/** 빈 구역 줄의 꼬리 글. */
export const EMPTY_ZONE_LABEL = '비어 있음'

/**
 * 노드의 자식 줄 묶음 — 구역 줄을 세울지와 그 아래 노드들. **구역이 몸통 하나뿐인 노드는 구역 줄이 없다**(지금 그대로 — `Flex` · `Grid` ·
 * `Section` · `Page` · `TabPanel`). 이름 붙은 구역을 선언했거나 선언 밖 구역을 든 노드는 카탈로그 차례대로 구역마다 줄(`label`)을 세운다(빈
 * 구역 포함 — 선언 밖 구역은 든 것만). 노드가 아닌 원소는 뺀다.
 */
function rowLists(node: WbNode): { key: string; zone: string; label: string | null; nodes: WbNode[] }[] {
  const entries = childLists(node as unknown)
  const declared = zoneDefs(node.type)
  const zoned = entries.some((entry) => entry.pointer !== '/children')
  return entries
    .map((entry) => ({
      key: entry.pointer,
      zone: entry.zone,
      label: zoned
        ? (declared.find((zone) => zone.name === entry.zone && entry.pointer === zonePointer(zone.name))?.label ?? entry.zone)
        : null,
      nodes: entry.list.filter(isNodeShaped),
    }))
    .filter((list) => list.label !== null || list.nodes.length > 0)
}

/**
 * 구역 줄의 머리 — 누르면 그 구역을 넣을 자리로 고른다(`StructureNode` 의 구역 줄 주석). 부모 노드에 id 가 없으면(검증 전 문서) 고를 수 없어
 * 글만 선다. 끄는 동안 이 줄 위에 놓으면 그 구역 끝이다(`./structure-tree-hint.ts` 가 `data-tree-zone-row` 로 찾는다).
 */
function ZoneRow(props: {
  parentId: string | null
  zone: string
  label: string
  selected: ZoneRef | null
  onSelect: (parentId: string, zone: string) => void
}): ReactElement {
  const { parentId, zone } = props
  if (parentId === null) return <span className="wb-shell-structure-zone-label">{props.label}</span>
  const current = props.selected !== null && props.selected.parentId === parentId && props.selected.zone === zone
  return (
    <button
      type="button"
      className="wb-shell-structure-zone-label wb-shell-structure-zone-pick"
      data-tree-zone-row=""
      data-tree-zone-parent={parentId}
      data-tree-zone-name={zone}
      aria-current={current ? true : undefined}
      onClick={() => props.onSelect(parentId, zone)}
    >
      {props.label}
    </button>
  )
}

/** 한 줄 묶음의 노드들 — 노드 줄(`StructureNode`)을 차례로. */
function StructureChildren(props: Parameters<typeof StructureNode>[0] & { nodes: WbNode[] }): ReactElement {
  return (
    <>
      {props.nodes.map((child, index) => (
        // 키는 노드 id다. 인덱스를 쓰면 구조 편집이 형제를 넣고 뺄 때 React가 앞 노드의
        // 상태를 다른 노드에 재사용한다. id가 없는 노드에서만 인덱스로 물러선다 —
        // 그 자리에는 쓸 id가 없다.
        <StructureNode
          key={isSelectable(child) ? child.id : `wb-invalid-${index}`}
          node={child}
          hidden={props.hidden}
          parentHidden={props.parentHidden}
          selectedNodeId={props.selectedNodeId}
          selected={props.selected}
          selection={props.selection}
          onSelect={props.onSelect}
          lockOf={props.lockOf}
          blockedOf={props.blockedOf}
          fold={props.fold}
          row={props.row}
          saveOnly={props.saveOnly}
          selectedZone={props.selectedZone}
          onSelectZone={props.onSelectZone}
        />
      ))}
    </>
  )
}

/** 노드 한 줄과 그 아래. 트리 자체가 재귀 구조라 컴포넌트도 재귀다. */
function StructureNode(props: {
  node: WbNode
  /** 지금 상태에서 숨은 노드(`shell/use-view-state.ts` 의 `useHiddenNodes`) — 그 줄은 흐리게 · 표지를 단다. */
  hidden: ReadonlySet<string>
  /** 부모 줄이 숨었는가 — 숨은 표지는 숨김이 시작된 줄에만 단다. */
  parentHidden?: boolean
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
  /** 접힌 줄 · 접고 펴기(`tree/collapse.ts`). */
  fold: Collapsed
  /** 편집할 수 있는 판의 줄 행동 · 끌기 배선. `null`이면 고르기만 한다(viewer · 뷰 모드). */
  row: RowWiring | null
  /** 편집할 수 없는 판의 줄 `…` — «모듈로 저장…» 한 항목(`StructureTree` 의 `editable` 주석). 편집할 수 있는 판이면 `null`(`row` 가 갖는다). */
  saveOnly: SaveOnlyWiring | null
  /** 넣을 자리로 고른 구역(스토어의 `selectedZone`) — 그 구역 줄이 `aria-current` 다. */
  selectedZone: ZoneRef | null
  onSelectZone: (parentId: string, zone: string) => void
}): ReactElement {
  const { node, row } = props
  // **모양 가드 둘.** 검증 전 문서에는 `children`이 배열이 아니거나 `type`이
  // 문자열이 아닌 노드가 들어올 수 있고, 둘 다 렌더 도중 던진다 — 앞은 `.map`이,
  // 뒤는 React가(`Objects are not valid as a React child`). 이쪽에는 캔버스와 달리 오류
  // 경계가 없어서 던지면 **셸 전체가 DOM에서 사라진다**(실측: `type`이 객체인 노드로
  // 재 봤다 — `./node-shape.ts`의 머리말). 지금 막는 것이 이 둘이고, 목록이 완전한지는
  // 재지 못했다.
  const lists = rowLists(node)
  const typeLabel = nodeTypeLabel(node)
  /**
   * **줄 글은 `타입 (별칭) 요약`이다**(설계서 「설계서 화면 구조」의 구조 트리 줄) — 같은 타입이 여럿일 때 어느 것인지 가르는 데까지만.
   * 셋을 조각으로 나눠 그리는 것은 요약만 흐리게 하려는 것이고, 접근 이름은 셋을 이은 글 그대로다(`packages/schema` 의 `nodeRowLabel`과
   * 같은 글 — MCP 가 같은 것을 낸다). 타입을 못 읽는 노드는 요약이 없다.
   */
  const alias = nodeAlias(node)
  const summary = nodeSummary(node)
  /**
   * 줄 글 전부 — 줄 단추의 접근 이름과 같다. **줄 행동(`+` · `…`)의 이름도 이것으로 짓는다** — 타입만으로 지으면 라벨이 «추가»인 Button 줄
   * (`Button 추가`)과 그 줄의 `+`(`Button 추가`)가 같은 이름이 된다.
   */
  const rowLabel = `${typeLabel}${alias === null ? '' : ` (${alias})`}${summary === null ? '' : ` ${summary}`}`
  // id가 없는 노드는 잠금과 짝지을 것이 없다 — 아래에서 고를 수도 없다.
  const lock = isSelectable(node) ? props.lockOf(node.id) : null
  const blocker = isSelectable(node) ? props.blockedOf(node.id) : null
  /** 지금 상태에서 숨은 줄인가 — 흐리게 그리고 표지를 단다(조상이 숨어 함께 숨은 줄도). */
  const hiddenHere = isSelectable(node) && props.hidden.has(node.id)

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
  /** 편집할 수 없는 판의 «모듈로 저장…» 한 항목 — 서는 조건은 `open` 과 같고 뿌리 줄은 뺀다(뿌리는 담을 수 없다). */
  const saveOnly =
    props.saveOnly !== null && isSelectable(node) && node.id !== props.saveOnly.rootId && (picked || props.blockedOf(node.id) === null)
      ? props.saveOnly
      : null
  /** 줄 단추 — 별칭 입력을 닫은 뒤 포커스를 돌릴 자리. */
  const button = useRef<HTMLButtonElement>(null)
  const draggable = open && row.rootId !== node.id && props.lockOf(node.id) === null
  const lifted = row !== null && isSelectable(node) && row.drag.dragging === node.id
  /** 펼침 단추가 서는 줄인가 — 고를 수 있고 자식 줄이 있다. id 없는 노드는 접힘을 적을 열쇠가 없어 늘 편 채다. */
  const foldable = isSelectable(node) && hasChildRows(node)
  const folded = foldable && props.fold.collapsed.has(node.id)

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
          className={'wb-shell-tree-row' + (picked ? ' wb-shell-tree-row-picked' : '') + (lifted ? ' wb-shell-tree-row-dragging' : '')}
          data-tree-row=""
          data-tree-kind="node"
          data-tree-id={node.id}
          // 끄는 포인터가 머물면 펴는 표지(`drag/hover-open.ts`).
          data-tree-collapsed={folded ? '' : undefined}
        >
          <button
            type="button"
            className={
              'wb-shell-structure-node' +
              (inSelection && !picked ? ' wb-shell-structure-node-member' : '') +
              (hiddenHere ? ' wb-shell-structure-node-hidden' : '')
            }
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
            disabled={blocker !== null}
            aria-description={hiddenHere ? HIDDEN_IN_STATE_LABEL : undefined}
            // 접고 펴는 줄의 상태 — 보조 기술이 읽는 것은 여기다(펼침 단추는 포인터 몫이다 — `./tree-fold.tsx`).
            aria-expanded={foldable ? !folded : undefined}
            onClick={(event) => props.onSelect(node.id, event)}
            // **더블클릭은 고른 줄에서만 별칭 입력을 연다** — 첫 누름이 그 줄을 고르므로 판정(`aliasLocked`)이 그 줄의 것이다.
            onDoubleClick={() => {
              if (open && picked && !row.commands.aliasLocked) row.alias.open(node.id)
            }}
            {...(draggable ? row.drag.bind(node.id) : {})}
            ref={button}
          >
            {typeLabel}
            {/* **별칭 · 요약은 사람 글이라 방향을 격리한다(`<bdi>`)** — 괄호는 격리 밖에 둔다. 격리가 없으면 괄호가 안 닫힌 RTL 별칭의 `(` 가
                줄의 `)` 와 짝이 되어 별칭 · `)` · RTL 요약이 한 RTL 덩이로 서고, 라벨 · 제목에 든 방향 제어 글자(봉투가 별칭에만 막는다 —
                `packages/schema/src/alias.ts`)가 뒤의 조각까지 뒤집는다(`build-test/node-alias.test.ts` «방향을 격리한다»). */}
            {alias !== null && (
              <span className="wb-shell-structure-alias">
                {' ('}
                <bdi>{alias}</bdi>
                {')'}
              </span>
            )}
            {summary !== null && (
              <span className="wb-shell-structure-summary">
                {' '}
                <bdi>{summary}</bdi>
              </span>
            )}
          </button>
          {/* 펼침 단추는 줄 단추 **뒤**에 두고 CSS 가 앞에 세운다(`./tree-fold.tsx` 머리말 «DOM 에서는 줄 단추 뒤다»). */}
          <TreeToggle foldable={foldable} folded={folded} onToggle={() => props.fold.toggle(node.id)} />
          {open && (
            <TreeRowActions
              name={rowLabel}
              {...structureRowItems(row.commands, () => row.alias.open(node.id), row.rootId === node.id ? undefined : row.saveModule)}
              // 열면 그 줄을 먼저 고른다 — 이미 고른 줄이면 다시 고르지 않는다(여럿을 고른 판의 기준 줄 `…` 이 고른 것 전부에 대해 서게).
              onOpen={() => {
                if (!picked) row.select(node.id)
              }}
              picked={picked}
              selection={props.selection}
            />
          )}
          {saveOnly !== null && (
            <TreeRowActions
              name={rowLabel}
              more={[saveModuleItem(saveOnly.saveModule)]}
              onOpen={() => {
                if (!picked) saveOnly.select(node.id)
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
      {lock !== null && lock.nodeId === node.id && <span className="wb-shell-structure-lock">{lock.userName} 편집 중</span>}
      {/* **숨은 줄의 표지** — 그 노드 자신의 보임으로 숨은 줄에만(조상이 숨어 함께 숨은 자손은 흐리기만 — 표지가 서브트리를 뒤덮지 않게). */}
      {hiddenHere && !props.parentHidden && (
        <span className="wb-shell-structure-hidden" aria-hidden="true">
          {HIDDEN_IN_STATE_LABEL}
        </span>
      )}

      {/* **별칭 입력은 그 줄 바로 아래다** — 메뉴 트리의 «이름 변경»과 같은 꼴(`./tree-input.tsx` — Enter 만 확정 · Escape · blur 는
          취소). Enter · Escape 뒤에는 포커스를 줄 단추로 돌린다 — 키보드로 연 사람이 그 자리에서 이어 간다. blur 로 닫힌 판은 포커스가
          이미 다른 데로 갔으니 건드리지 않는다. */}
      {open && row.alias.nodeId === node.id && (
        <div className="wb-shell-tree-panel">
          <TreeInput
            label={ALIAS_INPUT_LABEL}
            // 친 글이 있으면 그것으로 선다 — 노드가 다른 부모로 옮겨져 줄이 새로 마운트돼도 이어 친다(`./alias-edit.tsx` 머리말).
            initial={row.alias.draft() ?? nodeAlias(node) ?? ''}
            onEdit={row.alias.type}
            onSubmit={(value) => {
              row.alias.close()
              row.commands.renameAlias(node.id, value)
              button.current?.focus()
            }}
            onCancel={() => {
              const escaped = document.activeElement?.classList.contains('wb-shell-tree-input') === true
              row.alias.close()
              if (escaped) button.current?.focus()
            }}
          />
        </div>
      )}

      {lists.length > 0 && !folded && (
        <ul className="wb-shell-structure-list">
          {lists.map((list) =>
            list.label === null ? (
              <StructureChildren key={list.key} {...props} nodes={list.nodes} parentHidden={hiddenHere} />
            ) : (
              // **구역 줄** — 이름 붙은 구역이 있는 노드는 자식 줄 위에 구역마다 줄을 세운다(카탈로그 차례 · 빈 구역 포함). 구역 줄은 노드가
              // 아니다 — 누르면 «넣을 자리» 가 그 구역이 되고(`store.selectZone` — 노드 선택이 비어 잠금을 잡지 않는다) 하단 판 넣기 · 붙여넣기 ·
              // 모듈 넣기가 그 구역 끝에 넣는다. 줄 행동(`…`)이 없다. 고르기는 읽기라 고칠 수 없는 판(viewer)에서도 선다(넣는 입구가 꺼진다).
              <li key={list.key} className="wb-shell-structure-zone" data-tree-zone={list.key}>
                <ZoneRow
                  parentId={isSelectable(node) ? node.id : null}
                  zone={list.zone}
                  label={`${list.label}${list.nodes.length === 0 ? ` · ${EMPTY_ZONE_LABEL}` : ''}`}
                  selected={props.selectedZone}
                  onSelect={props.onSelectZone}
                />
                {list.nodes.length > 0 && (
                  <ul className="wb-shell-structure-list">
                    <StructureChildren {...props} nodes={list.nodes} parentHidden={hiddenHere} />
                  </ul>
                )}
              </li>
            ),
          )}
        </ul>
      )}
    </li>
  )
}
