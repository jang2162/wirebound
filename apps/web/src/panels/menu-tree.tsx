/**
 * 좌측 상단의 메뉴·페이지 트리. **메뉴와 페이지는 한 트리다**(설계서 「설계서 화면 구조」) — 페이지는 항상
 * 어느 메뉴에 속하므로 목록을 둘로 나누지 않는다.
 *
 * 여기서 하는 일은 **트리를 그리고, 주소를 바꾸고, 무엇을 고를지 알리는 것까지다.**
 * 조회·재조회·선택 상태·조작은 전부 `tree/use-tree-commands.tsx`가 갖는다 — 조작이
 * 끝나면 트리를 다시 받아야 하는데, 조회가 이 컴포넌트 안에 있으면 조작이 그것을 부를
 * 길이 없다. 페이지 문서를 받아 스토어에 싣는 것은 여전히 캔버스 쪽(`routes/editor.tsx`의
 * `CanvasFrame`)이다. 그렇게 가른 이유는 둘이다.
 *
 * 1. 주소가 열린 페이지의 단일 진실이다. 클릭이 직접 문서를 받아 오면 "눌러서 연 페이지"와
 *    "주소로 들어와 열린 페이지"가 서로 다른 경로가 되고, 새로고침·공유 주소가 조용히
 *    다르게 동작한다. 트리는 주소만 바꾸고, 문서는 주소를 보고 받는다 — 경로가 하나다.
 * 2. 한 조회의 실패가 다른 자리를 죽이지 않는다. 트리 조회 실패는 이 상자 안에서,
 *    페이지 조회 실패는 캔버스 안에서 끝난다.
 *
 * **열림과 선택은 다른 것이다**. 열림은 주소가 갖고(`pageId` — `<Link>` +
 * `aria-current="page"`), 선택은 트리 안 상태다(`aria-pressed`). 둘이 같은 값일 때가 많지만
 * 같은 것은 아니다 — 메뉴는 열 수 없고 고르기만 할 수 있다. 페이지도 줄의 `+` · `…`로 열지 않고 고를 수 있다
 * (`panels/tree-row-actions.tsx` — 누르면 그 줄을 먼저 고른다).
 *
 * **조작의 입구는 셋이다** — 줄의 `+` · `…`(`panels/tree-row-actions.tsx`), 트리 제목 줄의 뿌리 `+`, 끌어 놓기(`drag/use-pointer-drag.ts`
 * · 자리 판정 `tree/tree-drop.ts`). 셋 다 `useTreeCommands`의 명령을 부르고, 키보드 단축키도 같은 명령이다.
 *
 * **메뉴는 접힌다** — 줄 앞 펼침 단추 · 제목 줄의 «모두 접기» · «모두 펴기»(`./tree-fold.tsx`) · 메뉴 줄의 ← →(`foldKey`). 접힘은 프로젝트마다
 * 화면의 상태(`tree/collapse.ts`)이고, 열린 페이지 · 고른 줄이 접힌 메뉴 안이면 그 위 메뉴를 편다(아래 `chains`).
 *
 * **줄 단추 · 링크에서 ↑ ↓ · Home · End 는 보이는 줄을 옮겨 다닌다**(`rowStep`) — 옮겨 간 줄을 고르고 포커스도 옮긴다. 페이지 줄로 옮기는 것은 고르는 것이고
 * 여는 것은 그 링크의 Enter 다(클릭과 같은 길). ← → · ↑ ↓ 는 고르기와 같은 읽기라 뷰 모드에도 선다. 포커스가 선 줄이 다시 받은 트리에서
 * 빠지면(남의 지우기 · 옮기기) 그 줄 · 이웃 줄로 포커스를 돌려준다(`refocus`) — 안 돌려주면 `body` 로 떨어져 키보드 사람이 트리를 다시 찾아간다.
 */
import { useEffect, useLayoutEffect, useRef, type FocusEvent, type KeyboardEvent, type ReactElement, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router'
import { SignedOut } from '../api/failure'
import { DropIndicator } from '../drag/drop-indicator'
import { HOVER_OPEN_EVENT, hoverRow } from '../drag/hover-open'
import { elementAt, scrollParent, usePointerDrag, type PointerDrag } from '../drag/use-pointer-drag'
import { keyHeldByWidget } from '../edit/editor-shortcuts'
import { ActionMenu } from '../shell/action-menu'
import { ICONS } from '../shell/icons'
import { MetaConflict } from './meta-conflict'
import { PendingNotice } from './pending-notice'
import type { TreeMenuNode, TreePage } from '../api/types'
import { menuKey, useCollapsed, type Collapsed } from '../tree/collapse'
import { treeSpot, type TreeAbilities, type TreeSelection } from '../tree/tree-actions'
import { dropZone, menuDropTarget, sameMenuDrop, type MenuDrop } from '../tree/tree-drop'
import { useTreeCommands, type TreeCommands } from '../tree/use-tree-commands'
import { MenuPicker } from './menu-picker'
import { usePageJsonExport, type PageJsonExport } from './page-json-export'
import type { PageJsonNotices } from './page-json-notices'
import { PageImportDialog } from './page-import-dialog'
import { MenuDeleteDialog } from './menu-delete-dialog'
import { BUSY_REASON, menuItemReason } from './toolbar-status'
import { TreeInput } from './tree-input'
import { TreeFoldButtons, TreeToggle } from './tree-fold'
import { menuRowItems, TreeRowActions } from './tree-row-actions'
import { isTypingSurface } from './typing-surface'

/**
 * 키보드 단축키. **줄 행동(`+` · `…`)의 항목과 같은 함수를 부른다** — `run`이 `TreeCommands`에서
 * 꺼내 쓰고, `ability`가 항목의 끔(`disabled`)과 같은 판정을 지난다.
 *
 * **표를 `structure-tree.tsx`와 따로 두는 것은 두 트리가 한 화면에 있고 조작이 다르기
 * 때문이다.** 키 자체는 같은 것을 골랐다 — 다만 **같은 키가 같은 방향을 뜻해야 한다**는 것이
 * 요점이다. 근거는 *"다른 키를 외우면 그 자체가 비용이다"*가 아니다 — 같은 키가 반대 일을
 * 하면(한 트리는 `←`로 들여쓰고 다른 트리는 내어쓰면) **외우는 비용이 아니라 틀리는
 * 비용**이다. `test/panels/tree-shortcuts.test.tsx`가 두
 * 트리를 한 자리에서 대조한다.
 *
 * | 키 | 조작 | 근거 |
 * |---|---|---|
 * | `Delete`·`Backspace` | 삭제 **확인** | 구조 트리와 같은 키다. `Backspace`를 함께 받는 것은 macOS 노트북 키보드에 forward delete 키가 없기 때문이다(구조 트리와 같은 근거) |
 * | `Alt`+`↑`·`↓` | 순서 이동 | 구조 트리와 같은 키다 |
 * | `Alt`+`Shift`+`→`·`←` | **들여쓰기**·내어쓰기 | 방향은 깊이를 따른다 — 들여쓰기가 깊이를 늘리고 LTR에서 `→`가 그 방향이다. `Alt`+`←`·`→`가 Windows·Linux 브라우저의 뒤로/앞으로라 `Shift`를 더했고 **그 조합에 기본 바인딩이 있는지는 재지 못했다** |
 *
 * **`Delete`는 지우지 않고 확인을 건다.** 키 하나로 사라지면 되돌릴 길이 없다.
 *
 * **`Tab`은 빼앗지 않는다.** 들여쓰기로 쓰고 싶어지는 자리지만 그러면 키보드 사용자가
 * 트리를 빠져나갈 수 없다.
 */
const SHORTCUTS: {
  match: (event: KeyboardEvent) => boolean
  ability: keyof TreeAbilities
  run: (commands: TreeCommands) => void
}[] = [
  {
    match: (event) => event.key === 'Delete' || event.key === 'Backspace',
    ability: 'remove',
    run: (commands) => commands.askRemove(),
  },
  {
    match: (event) => event.key === 'ArrowUp' && event.altKey && !event.shiftKey,
    ability: 'moveUp',
    run: (commands) => commands.move(-1),
  },
  {
    match: (event) => event.key === 'ArrowDown' && event.altKey && !event.shiftKey,
    ability: 'moveDown',
    run: (commands) => commands.move(1),
  },
  {
    match: (event) => event.key === 'ArrowRight' && event.altKey && event.shiftKey,
    ability: 'indent',
    run: (commands) => commands.indent(),
  },
  {
    match: (event) => event.key === 'ArrowLeft' && event.altKey && event.shiftKey,
    ability: 'outdent',
    run: (commands) => commands.outdent(),
  },
]

/**
 * `projectId`·`pageId`를 셸에서 받는다. 여기서 `useParams`를 다시 부르지 않는 것은,
 * 셸이 이미 푼 것을 두 곳에서 풀면 라우트 표가 바뀔 때 한쪽만 고치는 일이 생기기
 * 때문이다.
 */
export function MenuTree(props: {
  projectId: string
  pageId: string | undefined
  /**
   * 오를 때마다 트리를 다시 받는다. 셸이 **스냅샷 복원**에서 올린다 —
   * 복원은 페이지를 지우고 만들므로 목록 자체가 바뀐다(`routes/editor.tsx`의
   * `restoredToken`). 그대로 훅에 넘긴다.
   */
  reloadToken: number
  /**
   * **편집 도구를 낼 것인가.** 셸이 `mode === 'edit'`를 넘긴다(`routes/editor.tsx`).
   *
   * **모드를 여기서 읽지 않고 받는 이유.** 이 컴포넌트는 `EditorStore`를 안 보고 산다 —
   * 트리는 문서 편집 상태(문서·`headSeq`·undo 스택)와 무관하고, 여기서 스토어를 구독하기
   * 시작하면 편집이 일어날 때마다 트리가 다시 그려진다. 그리고 「설계서 화면 구조」의 *"뷰 모드에서 무엇이
   * 접히는가"*는 셸의 판단이라 그 표가 한 파일에 모여 있는 편이 읽힌다(구조 트리·되돌리기·
   * 우측 탭이 이미 거기서 갈린다).
   *
   * **`false`면 넷이 함께 간다:** 줄 행동(`+` · `…` · 뿌리 `+` — 페이지 JSON 의 가져오기 · 내보내기가 그 안이다) · 끌어 놓기 · 가져오기
   * 대화 상자 · 편집 단축키. 넷을 따로 가르지 않는 것은 **같은 조작에 닿는 입구**이기 때문이다 — 줄 행동만 감추면 `Delete`·`Alt+↑`가
   * 그대로 남아 뷰 모드에서 메뉴가 지워진다.
   *
   * **뷰 모드에서는 «JSON 내보내기»까지 함께 간다 — 판정이고, 되돌리지 마라.** 그것 하나는 읽기 동작이 맞다. 그래도 남기지 않는 것은
   * 그 입구가 줄 행동(편집 도구) 안에 있고, 페이지 JSON 의 축이 *"페이지를 JSON으로 주고받는다"*라는 **저작 · 연동용 아티팩트**이기
   * 때문이다 — 내보내기 하나를 살리려고 뷰 모드에 줄 행동을 세우면 편집 도구의 자리가 뷰 모드에 생긴다. **설계서를 읽는 사람의 내려받기는
   * 셸 `…`의 «프로젝트 내보내기»(설계서 「HTML 정적 번들」)가 두 모드 모두에서 낸다** — 그쪽은 역할로도 감추지 않는다(`shell/export-panel.tsx`).
   *
   * **viewer 에게는 편집 모드에서도 `false`다** — 셸이 역할까지 얹어 넘긴다. 이 컴포넌트는 역할을 모른다.
   * 페이지 이름 변경만 따로 닫는 둘째 칸을 두지 않는다 — 이 값이 그것까지 덮는다.
   */
  editable: boolean
  /**
   * 트리 제목 줄의 행동 자리(`routes/editor.tsx`의 `ShellRegion` — 제목 곁 빈 상자). 뿌리 `+`(«최상위 메뉴 추가»)를 거기 그린다
   * (portal). **훅이 이 컴포넌트 안에 하나여야 해서**(아래) 셸이 명령을 받아 그리지 않고 자리만 넘긴다. 없으면 안 그린다.
   */
  headSlot?: HTMLElement | null
  /**
   * 하단 바의 페이지 JSON 통지 — 가져온 결과 · 내보내기 실패(`panels/page-json-notices.tsx`). **셸이 들고 그린다** — 여기서는 채우기만 한다
   * (그 파일의 머리말 «셸이 상태를 들고 트리가 채운다»). 없으면 결과 · 실패를 말하지 않는다.
   */
  notices?: PageJsonNotices
  /** 남의 변경 · 재연결로 다시 받을 신호 — 그대로 훅에 넘긴다(`useTreeCommands`의 `remoteRev` · `resyncToken`). */
  remoteRev?: number
  resyncToken?: number
  /** 다시 받은 트리가 열린 입력 · 상자의 대상을 지웠을 때의 한 줄(훅의 `onDropped`). 셸이 하단 바에 세운다. */
  onDropped?: (message: string) => void
  /** 열린 페이지가 트리에서 사라졌다(훅의 `onPageGone`). 셸이 캔버스에 넘긴다. */
  onPageGone?: (pageId: string) => void
}): ReactElement {
  // **훅을 부르는 자리는 여기 하나다**(`busy` 잠금의 전제). 줄 행동은 결과를 prop으로 받는다 —
  // 두 번째 호출자가 생기면 `busy` 잠금이 각자 것이 된다.
  //
  // **`editable`이 false여도 훅은 그대로 돈다.** 트리를 조회하는 것이 이 훅이라 끄면
  // 뷰 모드에서 트리 자체가 사라진다. 조작은 부르는 자리가 없어져서 닫히는 것이지
  // 훅이 꺼져서 닫히는 것이 아니다.
  /** 앞 렌더에 보인 줄 — 화면 차례. 다시 받은 트리에서 사라진 줄의 이웃을 여기서 찾는다(`neighborOf`). */
  const shownRows = useRef<TreeSelection[]>([])
  const commands = useTreeCommands({
    projectId: props.projectId,
    pageId: props.pageId,
    reloadToken: props.reloadToken,
    onImported: props.notices?.showImported,
    ...(props.remoteRev === undefined ? {} : { remoteRev: props.remoteRev }),
    ...(props.resyncToken === undefined ? {} : { resyncToken: props.resyncToken }),
    ...(props.onDropped === undefined ? {} : { onDropped: props.onDropped }),
    ...(props.onPageGone === undefined ? {} : { onPageGone: props.onPageGone }),
    pickAfterGone: (gone, next) => neighborOf(shownRows.current, gone, (row) => treeSpot(next, row) !== null),
  })
  const { state } = commands
  /** 페이지 줄 `…`의 «JSON 내보내기». 실패는 셸의 하단 바에 선다(`notices`). */
  const exporter = usePageJsonExport(props.projectId, props.notices?.showExportFailure ?? ignoreFailure)
  /**
   * **편집할 수 없게 되면 가져오기 상자를 닫는다** — 역할이 내려가거나(viewer) 모드가 바뀌면 상자가 화면에서 빠지는데, 대상을 훅에 남겨
   * 두면 다시 편집할 수 있게 된 순간 아무도 열지 않은 상자가 다시 선다. 모달이라 상자가 떠 있는 동안 모드 단추에는 못 닿고, 이 갈래는 셸이
   * 권한을 바꿀 때(`ROLE_NOTICE`) 선다.
   */
  const closeImport = useRef(commands.closeImport)
  useEffect(() => {
    closeImport.current = commands.closeImport
  })
  useEffect(() => {
    if (!props.editable) closeImport.current()
  }, [props.editable])
  /** 줄을 찾는 상자 — 끄는 동안 포인터 밑 줄(`[data-tree-row]`)을 여기서 찾는다. */
  const treeRef = useRef<HTMLUListElement>(null)
  /** 접힌 메뉴(`tree/collapse.ts` — 프로젝트마다 · 세션 동안). 페이지는 접을 것이 없다. */
  const fold = useCollapsed(menuKey(props.projectId))
  /**
   * **열린 페이지 · 고른 줄이 접힌 메뉴 안이면 그 위 메뉴를 편다**(설계서 «트리 줄마다 접기» — 구조 트리의 `chains` 와 같은 까닭). 주소로
   * 연 페이지 · 남이 옮긴 메뉴도 같은 사슬로 본다. 사람이 그 위 메뉴를 접은 판은 사슬이 그대로라 다시 펴지 않는다.
   */
  const chains =
    state.status === 'ready'
      ? JSON.stringify([
          props.pageId === undefined ? [] : menuAncestors(state.menu, { kind: 'page', id: props.pageId }),
          commands.selection === null ? [] : menuAncestors(state.menu, commands.selection),
        ])
      : ''
  useLayoutEffect(() => {
    if (chains === '') return
    fold.expand((JSON.parse(chains) as string[][]).flat())
  }, [chains, fold.expand])
  // 끄는 포인터가 접힌 메뉴 위에 머물면(`drag/hover-open.ts`) 그 메뉴를 편다.
  const ready = state.status === 'ready'
  useEffect(() => {
    const tree = treeRef.current
    if (tree === null) return
    const open = (event: Event): void => {
      const row = event.target as HTMLElement
      const id = row.dataset['treeId']
      if (row.dataset['treeKind'] === 'menu' && id !== undefined && id !== '') fold.expand([id])
    }
    tree.addEventListener(HOVER_OPEN_EVENT, open)
    return () => tree.removeEventListener(HOVER_OPEN_EVENT, open)
  }, [fold.expand, ready])

  /**
   * **포커스가 선 줄 단추 · 링크** — 그 요소가 DOM 에서 빠진 렌더에 포커스를 돌려준다(아래 이펙트). 상자 안 다른 자리 · 상자 밖으로 포커스가
   * 옮으면 걷는다. 옮겨 간 곳이 없는 blur(`relatedTarget` 이 `null` — 요소가 빠짐 · 창을 떠남)는 걷지 않는다.
   */
  const focusedRow = useRef<{ row: TreeSelection; element: HTMLElement } | null>(null)
  function trackFocus(event: FocusEvent<HTMLDivElement>): void {
    const row = rowOfControl(event.target)
    const selection = row === null ? null : rowSelection(row)
    focusedRow.current = selection === null ? null : { row: selection, element: event.target }
    // **포커스가 줄에 서면 그 줄이 고른 줄이다** — Tab 으로 다른 줄에 선 채 친 Delete 가 열린 페이지(고른 줄이던)의 삭제 확인을 걸지 않게 한다.
    // 줄 단추 · 링크만 본다(`+` · `…` 는 누르면 제 줄을 고른다 — `pick`). 이미 고른 줄이면 다시 안 고른다 — `select` 가 열린 입력 · 확인을 닫는다.
    // 열린 페이지의 링크면 «주소가 말하는 것»으로 푼다(`PageLink` 의 클릭과 같다) — 따로 적으면 주소가 옮긴 뒤 낡은 고름이 남는다.
    if (selection !== null && !isPicked(commands.selection, selection)) {
      commands.select(selection.kind === 'page' && selection.id === props.pageId ? null : selection)
    }
  }
  function untrackFocus(event: FocusEvent<HTMLDivElement>): void {
    if (event.relatedTarget !== null && !event.currentTarget.contains(event.relatedTarget)) focusedRow.current = null
  }
  // **렌더마다 돈다** — 다시 받은 트리 · 펼침이 줄을 바꾼 뒤 DOM 을 본다. 포커스가 `body` 일 때만 옮긴다 — 사람이 다른 데로 옮긴 포커스는 안 뺏는다.
  useLayoutEffect(() => {
    const tree = treeRef.current
    const lost = focusedRow.current
    if (tree !== null && lost !== null && !lost.element.isConnected && (document.activeElement === null || document.activeElement === document.body)) {
      const rows = shownRowsOf(tree)
      const shown = (row: TreeSelection): boolean => rows.some((one) => isPicked(one, row))
      // 고른 줄을 잃었으면 훅이 이미 이웃을 골랐다(`pickAfterGone`) — 같은 줄에 선다. 아니면 그 줄 자신(옮겨진 줄) · 보이는 이웃.
      const picked = commands.selection !== null && isPicked(commands.selection, lost.row) ? null : commands.selection
      const target = shown(lost.row)
        ? lost.row
        : picked !== null && shown(picked)
          ? picked
          : neighborOf(shownRows.current, lost.row, shown)
      if (target !== null) rowControl(tree, target)?.focus()
    }
    if (tree !== null) shownRows.current = shownRowsOf(tree)
  })

  /**
   * **끌어 놓기.** 포인터 밑 줄과 띠(`dropZone`)를 `menuDropTarget`에 물어 놓을 자리를 받고, 놓으면 `dropTo`가 보낸다. 판정 · 보내기가
   * 줄 행동과 같은 명령 · 같은 서버 규칙을 쓴다(`tree/tree-drop.ts` 머리말).
   *
   * **놓는 답은 보인 답이다**(`sameMenuDrop` · `refresh`) — 끄는 사이 남이 줄을 밀어 포인터 밑에 다른 부모의 줄이 오면 놓지 않고 표시를
   * 걷는다. 같은 부모의 줄이면 표시가 새 줄로 따라가고 차례는 놓을 때 지금 트리로 정한다(구조 트리 줄 끌기와 같다 — `panels/structure-tree.tsx`).
   */
  const drag = usePointerDrag<TreeSelection, MenuDrop>({
    onOver: (source, point) => {
      if (state.status !== 'ready') return null
      const row = elementAt(treeRef.current, '[data-tree-row]', point)
      hoverRow(row)
      const over = row === null ? null : rowSelection(row)
      if (row === null || over === null) return null
      const box = row.getBoundingClientRect()
      const target = menuDropTarget(
        state.menu,
        source,
        over,
        dropZone(point.y - box.top, box.height, over.kind === 'menu'),
      )
      if (target === null) return null
      return {
        value: target,
        rect: { left: box.left, top: box.top, width: box.width, height: box.height },
        placement: target.placement,
      }
    },
    onDrop: (source, target) => commands.dropTo(source, target),
    sameDrop: sameMenuDrop,
    scrollContainer: () => scrollParent(treeRef.current),
  })
  // 끄는 사이 남의 변경으로 트리가 바뀌어 줄이 밀리면 표시를 마지막 좌표로 다시 묻는다 — 같은 부모의 줄이면 따라가고 다른 부모면 걷는다.
  const shownMenu = state.status === 'ready' ? state.menu : null
  useLayoutEffect(() => {
    drag.refresh()
  }, [drag.refresh, shownMenu])

  /**
   * 단축키를 받는다. **상자에 붙이지 전역이 아니다** — 다른 패널에서 타이핑하는 키는 다른
   * 서브트리에서 나므로 여기로 버블되지 않는다(`structure-tree.tsx`와 같은 형태).
   *
   * **입력이 열려 있으면 아예 지나간다.** 구조 트리에는 인라인 입력이 없어 그 파일이 이
   * 상황을 다루지 않는데, 여기서는 입력이 이 상자 **안**에 있어 거기서 친 키가 버블되어
   * 온다(그 가드가 없으면 제목에 친 `Backspace`가 삭제 확인을 건다). 소속 메뉴
   * 목록도 같은 자리라 함께 본다.
   *
   * **잠금을 여기서 겹으로 보지 않는다** — 판정이 두 벌이 되면 한쪽만 고쳐져 갈린다.
   * 잠금은 각 조작이 스스로 본다: 요청을 내는 것은 `run` 안의 `inFlight`가, **"여는" 것
   * (`openInput`·`openReparent`·`askRemove`)은 각자의 `inFlight` 가드**가 잡는다.
   *
   * **"잠금은 `run` 안의 `inFlight`가 잡는다"만으로는 모자라다** — `askRemove`처럼 `run`을
   * 지나지 않는 조작은 제 가드가 없으면 `busy` 중 `Delete`가 건 확인이 잠금 해제 뒤까지
   * 살아남는다.
   */
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    // **더 가까운 받는 쪽이 이미 받은 키는 지나간다** — 줄 `+` · `…` 의 ↓ ↑ 는 메뉴를 연다(`shell/action-menu.tsx`). 안 거르면 닫힌 `…` 의
    // Alt+↓ 가 메뉴를 열면서 고른 메뉴를 옮겼다(Chrome · `build-test/keyboard-holes.test.ts` «6»). 에디터 단축키도 같은 것을 거른다
    // (`edit/editor-shortcuts.ts` 의 `shortcutsBlocked`).
    if (event.defaultPrevented) return
    /**
     * **값을 넣거나 고르는 표면에서 난 키는 단축키를 찾기 전에 돌려보낸다**.
     *
     * 바로 아래 상태 가드(`editing`·`reparenting`)로는 부족하다 — 그것은 **인라인 입력**이
     * 열려 있을 때만 참인데, 이 상자 안에 그 둘이 아닌 입력 칸이 서면(행동 메뉴 · 트리 아래의 새 칸) 그 칸에서 친 `Backspace`가 여기까지
     * 버블되어 **글자가 안 지워지고 메뉴 삭제 확인이 걸린다** — 구조 트리에서도 같은 고장이 난다. 가져오기 대화 상자는 이 상자 **밖**에
     * 선다(아래 반환 · `panels/page-import-dialog.tsx` 머리말 «키가 트리 단축키로 새지 않는다») — 단추에서 친 `Delete`는 이 가드로 못
     * 거른다.
     *
     * **찾기 전에 거르는 순서가 규격이다.** 찾은 뒤에 거르면 `preventDefault`가 이미 걸려
     * 글자가 안 지워진다(그 순서를 뒤집는 변이가 죽는다).
     *
     * **칸을 하나씩 예외 처리하지 않는다** — 규칙은 `panels/typing-surface.ts` 하나가 갖고,
     * 그것이 편집 가능성·폼 컨트롤·ARIA 역할·shadow 호스트 넷으로 가른다.
     */
    if (isTypingSurface(event.target)) return
    // 열린 행동 메뉴(줄 `…` · `+` · 제목 줄 `+`)가 쥔 키 — 목록의 키가 React 트리를 따라 여기 닿는다. 메뉴 안의 Delete 가 삭제 확인을, Alt+화살표가
    // 고른 메뉴의 자리를 바꾸지 않게 에디터 단축키와 같은 판정을 지난다(`edit/editor-shortcuts.ts` 의 `keyHeldByWidget`).
    if (keyHeldByWidget(event)) return
    // **읽는 키(← → 접고 펴기 · ↑ ↓ 줄 옮기기)는 뷰 모드에도 선다** — 고르기와 같은 읽기다(펼침 단추 · «모두 접기»가 뷰 모드에 서는 것과 같다).
    if (foldKey(event, fold)) return
    if (rowStep(event, treeRef.current, commands.select)) return

    // **뷰 모드에서는 편집 단축키가 없다.** 줄 행동만 감추면 여기 조작이 키로 그대로 살아
    // 있어, 화면에 아무 단추도 없는 상태에서 `Delete`가 메뉴를 지운다 — `disabled`를
    // 지나지 않는다는 이 표의 성질(아래 `abilities` 검사 주석)이 여기서는 구멍이 된다.
    if (!props.editable) return
    if (commands.editing !== null || commands.reparenting !== null) return

    const shortcut = SHORTCUTS.find((candidate) => candidate.match(event))
    if (shortcut === undefined) return

    // **인식한 키만 막는다.** `Tab`은 위 목록에 없으므로 여기 오지 않고 브라우저의 포커스
    // 이동이 그대로 일어난다.
    event.preventDefault()
    // **버튼과 같은 판정을 지난다.** 키 이벤트는 `disabled`를 지나지 않으므로 여기서 보지
    // 않으면 비활성인 조작이 단축키로만 실행된다.
    if (!commands.abilities[shortcut.ability]) return

    shortcut.run(commands)
  }

  /**
   * 상자를 연 줄이 그 사이 사라졌을 때(남이 대상 메뉴를 지움 · 내가 확인한 삭제) 상자가 포커스를 돌려줄 자리 — 고른 줄, 없으면 보이는 첫 줄
   * (`shell/shell-dialog.tsx` 의 `focusFallback`). 안 주면 포커스가 `body` 로 떨어진다.
   */
  function treeFocusFallback(): HTMLElement | null {
    const tree = treeRef.current
    if (tree === null) return null
    const picked = commands.selection === null ? null : rowControl(tree, commands.selection)
    return picked ?? tree.querySelector<HTMLElement>('[data-tree-row] > .wb-shell-tree-menu, [data-tree-row] > .wb-shell-tree-page')
  }

  /**
   * **가져오기 · 메뉴 삭제 대화 상자는 트리 상자 밖에 선다** — 조회 상태(불러오는 중 · 실패)와 무관하다(보낸 뒤 다시 받기가 실패해도 상자 안의 결말이
   * 남아야 한다).
   *
   * **단축키 상자의 형제다 — 안에 넣지 마라.** 안이면 상자 안 단추에서 친 `Delete`가 React 트리를 따라 `handleKeyDown`에 닿아 고른 메뉴의
   * 삭제 확인을 건다(`panels/page-import-dialog.tsx` 머리말 «키가 트리 단축키로 새지 않는다»).
   */
  function outside(tree: ReactNode): ReactElement {
    return (
      <>
        {tree}
        {props.editable && <PageImportDialog commands={commands} focusFallback={treeFocusFallback} />}
        {props.editable && <MenuDeleteDialog commands={commands} focusFallback={treeFocusFallback} />}
      </>
    )
  }

  if (state.status === 'loading') {
    return outside(
      <p className="wb-shell-tree-notice" role="status">
        불러오는 중…
      </p>,
    )
  }

  if (state.status === 'failed') {
    // 세션이 끊긴 것은 이 상자 안에서 끝낼 수 없는 실패다 — 트리만 오류 문장을 내고
    // 사용자는 셸 안에 갇힌다. 나머지 이유는 지금대로 서버 문장을 이 자리에 그린다.
    if (state.failure.kind === 'signed-out') return <SignedOut />

    return outside(
      <p className="wb-shell-tree-notice" role="alert">
        {state.failure.message}
      </p>,
    )
  }

  return outside(
    // **키 핸들러가 이 상자에 붙는다.** 트리와 줄 행동을 함께 감싸므로 어느 쪽에 포커스가
    // 있어도 단축키가 닿는다. 스타일이 없는 상자라 클래스는 테스트가 집을 이름 하나뿐이다.
    // **`data-wb-own-shortcuts` — 포커스가 이 상자 안이면 에디터 단축키 · 클립보드 리스너가 서지 않는다**(`edit/editor-shortcuts.ts` 의
    // `shortcutsBlocked`). 이 상자의 `Delete` 는 메뉴 · 페이지의 삭제 확인이지 고른 노드의 삭제가 아니다.
    <div className="wb-shell-tree-keys" data-wb-own-shortcuts="" onKeyDown={handleKeyDown} onFocus={trackFocus} onBlur={untrackFocus}>
      {/* **조작 실패는 트리 안에 낸다.** `shell/edit-alert.tsx`와 섞지 않는 것은 그것이
          편집 파이프라인의 상태를 읽기 때문이다 — CRUD 실패는 그 상태와 무관하므로 섞으면
          서로 다른 두 실패가 한 문장 자리를 다툰다.

          **세션 끊김만 갈라 낸다.** 그 판정은 `api/failure.tsx`가 갖고 여기서 다시
          하지 않는다 — 조회 실패가 위에서 같은 규칙을 쓰는 것과 같은 자리다. */}
      {commands.failure !== null &&
        (commands.failure.kind === 'signed-out' ? (
          <SignedOut />
        ) : (
          <p className="wb-shell-tree-notice" role="alert">
            {commands.failure.message}
          </p>
        ))}
      {/* **이름 변경의 «확인 중» · «모름» · 떠나 있는 동안 끝난 실패** — «페이지 설명»과 같은 알림이다
          (`panels/pending-notice.tsx`). 모드와 무관하게 선다 — 사용자가 낸 쓰기의 결말이다(실패 문장과 같은 자리). */}
      <PendingNotice
        lock={commands.renameLock}
        checking={commands.renameNotices.checking}
        unknown={commands.renameNotices.unknown}
        missedLead={commands.renameNotices.missedLead}
      />
      {/* **제목의 충돌**(페이지도 메뉴도) — «페이지 설명»과 같은 화면이다(`panels/meta-conflict.tsx`).
          이름 변경이 편집 도구라 편집 모드에서만 선다(줄 행동과 같은 조건). */}
      {props.editable && commands.conflict !== null && (
        <MetaConflict
          what="제목"
          theirs={commands.conflict.theirs}
          late={commands.conflict.late}
          disabled={commands.busy}
          disabledReason={BUSY_REASON}
          onOverwrite={commands.overwriteTitle}
          onDiscard={commands.discardTitle}
        />
      )}
      <ul className="wb-shell-tree" ref={treeRef}>
        {byOrder(state.menu).map((node) => (
          // 키는 노드 id다. 인덱스를 쓰면 정렬이 바뀔 때 React가 앞 노드의 상태를 다른
          // 노드에 재사용한다.
          //
          // **트리를 다시 받아도 이 키를 지키는 케이스는 없다.** 세 자리(여기·페이지·자식
          // 메뉴)를 전부 인덱스로 바꿔도 `--project web` 전량이 통과한다(다시 재는 법: 세
          // `key`를 인덱스로 바꾸고 `pnpm vitest run --project web`).
          //
          // **덮고 있는 것은 "트리 항목이 로컬 상태를 갖지 않는다"이다** — `MenuItem`·
          // `PageLink`에 `useState`·`useRef`가 없어 키가 어긋나도 재사용될
          // 상태 자체가 없다. 선택 · 줄 아래 입력은 훅이 id로 들고 있어 트리 밖이다(행동 메뉴의 열림은 `ActionMenu`
          // 안의 상태지만 줄의 id 키 아래에 선다 — 이 키가 인덱스가 되면 그 열림이 옆 줄로 옮겨 갈 수 있다).
          //
          // 그러므로 인덱스 키가 실제로 깨지는 조건은 "트리를 다시 받는 것"이 아니라 **항목이
          // 자기 상태를 갖는 것**이다(펼침/접힘 따위). 그렇게 되면 이 주석이 아니라 케이스가 지켜야 한다.
          <MenuItem
            key={node.id}
            node={node}
            projectId={props.projectId}
            pageId={props.pageId}
            commands={commands}
            drag={props.editable ? drag : null}
            exporter={exporter}
            fold={fold}
          />
        ))}
      </ul>
      {props.editable && <DropIndicator hint={drag.hint} />}
      {/* **빈 트리의 빈 상태.** 새 프로젝트는 메뉴 노드가 0개로 만들어진다(`apps/api/src/repos/projects.ts`의
          `insertProject`는 프로젝트·멤버·기본 레이아웃만 만든다). 줄이 없으니 줄 행동도 없다 — 첫 메뉴를 만드는 길은 제목 줄의
          뿌리 `+`와 여기 단추다. **서버는 루트를 받는다**(`apps/api/src/routes/menu.ts`의 `parentId: z.uuid().nullable().optional()`).

          **뿌리 `+`가 있는데도 단추를 두는 것은** 빈 상자가 다음 걸음을 제자리에서 말해야 하기 때문이다 — 제목 곁의 작은 `+`는
          무엇을 하는 단추인지 열어 봐야 안다.

          **판정이 두 벌이 되지 않는다.** 여기서 보는 것은 `treeAbilities`가 답하는
          *"고른 것에 무엇을 할 수 있나"*가 아니라 **트리가 비었나**이고, 그 둘은 축이 다르다.
          `busy`만 줄 행동과 같은 값을 본다(조작이 나가 있으면 입력을 열지 않는다).

          **뷰 모드에서는 버튼이 없다.** 문장은 남는다 — 빈 상자가 왜 비었는지는 읽는 사람도
          알아야 한다(`editable` 주석의 넷과 같은 자리). */}
      {state.menu.length === 0 && (
        <div className="wb-shell-tree-empty">
          <p className="wb-shell-tree-notice">메뉴가 없습니다.</p>
          {props.editable && (
            <button
              type="button"
              className="wb-shell-menu-tool"
              aria-disabled={commands.busy || undefined}
              title={commands.busy ? BUSY_REASON : undefined}
              aria-description={commands.busy ? BUSY_REASON : undefined}
              onClick={() => {
                if (commands.busy) return
                commands.openInput('new-root-menu')
              }}
            >
              최상위 메뉴
            </button>
          )}
        </div>
      )}
      {/* **줄에 붙지 않는 입력** — 최상위 메뉴는 트리 끝에 붙으므로 그 입력도 트리 아래다. 고른 것이 트리에서 사라진 채 열린
          입력(남이 지운 뒤 다시 받기 전의 창)도 붙을 줄이 없어 여기 선다. */}
      {props.editable && <RowPanel commands={commands} at="bottom" />}
      {/* 제목 줄(`headSlot`) — «모두 접기» · «모두 펴기»(고르기와 같은 읽기라 뷰 모드에도 선다)와 뿌리 `+`. 뿌리 `+`는 고른 것에 매이지 않는 유일한
          줄 행동이다 — 최상위 메뉴가 붙는 곳은 트리 자체다. */}
      {props.headSlot !== undefined &&
        props.headSlot !== null &&
        createPortal(
          <>
            <TreeFoldButtons onCollapse={() => fold.collapse(foldableMenus(state.menu))} onExpand={fold.expandAll} />
            {props.editable && (
              <ActionMenu
                label="메뉴 트리에 추가"
                icon={ICONS.add}
                compact
                items={[
                  {
                    key: 'new-root-menu',
                    label: '최상위 메뉴 추가',
                    icon: ICONS.addMenu,
                    disabled: commands.busy,
                    title: commands.busy ? BUSY_REASON : undefined,
                    description: commands.busy ? BUSY_REASON : undefined,
                    onSelect: () => commands.openInput('new-root-menu'),
                  },
                ]}
              />
            )}
          </>,
          props.headSlot,
        )}
    </div>,
  )
}

/** 셸이 통지 자리를 안 넘겼을 때(`notices`) — 내보내기 실패를 말할 곳이 없다. */
function ignoreFailure(): void {}

/** 그 줄을 품은 메뉴의 id — 맨 위부터. 메뉴 자신은 빼고, 트리에 없으면 빈 목록. */
function menuAncestors(menu: readonly TreeMenuNode[], target: TreeSelection): string[] {
  for (const node of menu) {
    if (target.kind === 'menu' && node.id === target.id) return []
    if (target.kind === 'page' && node.pages.some((page) => page.id === target.id)) return [node.id]
    const below = menuAncestors(node.children, target)
    if (below.length > 0 || node.children.some((child) => target.kind === 'menu' && child.id === target.id)) return [node.id, ...below]
  }
  return []
}

/** «모두 접기»가 접을 메뉴 — 페이지나 하위 메뉴를 품은 것 전부. */
function foldableMenus(menu: readonly TreeMenuNode[]): string[] {
  return menu.flatMap((node) => [...(node.pages.length > 0 || node.children.length > 0 ? [node.id] : []), ...foldableMenus(node.children)])
}

/**
 * **메뉴 줄에서 친 ← → — 접고 편다**(설계서 «트리 줄마다 접기» · 펼침 단추는 포인터 몫이다 — `./tree-fold.tsx`). 대상이 접고 펴는 메뉴 단추
 * (`aria-expanded`)일 때만 받고, 받았으면 `true` — 단축키 표(`SHORTCUTS`)의 `Alt`+`Shift`+← → 와는 수식 키로 갈린다.
 */
function foldKey(event: KeyboardEvent, fold: Collapsed): boolean {
  // 키를 `key` 로 받아 견준다 — `event.key === '` 는 위 표의 조합을 세는 닻이다(`test/panels/menu-keyboard.test.tsx` «표의 여섯을 다 덮는다»).
  const key = event.key
  if (event.altKey || event.shiftKey || event.metaKey || event.ctrlKey) return false
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return false
  const button = event.target as HTMLElement
  const expanded = button.getAttribute('aria-expanded')
  const id = button.closest<HTMLElement>('[data-tree-row]')?.dataset['treeId']
  if (expanded === null || id === undefined) return false
  event.preventDefault()
  if (key === 'ArrowRight' && expanded === 'false') fold.expand([id])
  if (key === 'ArrowLeft' && expanded === 'true') fold.collapse([id])
  return true
}

/**
 * **줄 단추 · 링크에서 친 ↑ ↓ · Home · End — 보이는 줄을 옮겨 다닌다**(설계서 «트리 줄 접기» · 구조 트리의 ↑ ↓ 와 같은 축 · Home · End 는 보이는 첫 · 끝 줄). 옮겨 간 줄을 고르고(`select`) 그
 * 줄 단추 · 링크에 포커스를 옮긴다 — 포커스가 남으면 이어 친 Enter · Delete 가 앞 줄에 닿는다. 페이지 줄은 고르기만 한다(여는 것은 링크의 Enter).
 * 접힌 메뉴 안은 DOM 에 없어 건너뛴다. 끝에서는 멈춘다(돌지 않는다 — 구조 트리와 같다). 대상이 줄 단추 · 링크일 때만 받는다 — `+` · `…` 의
 * ↑ ↓ 는 메뉴를 연다(`shell/action-menu.tsx`). 받았으면 `true`.
 */
function rowStep(event: KeyboardEvent, tree: HTMLElement | null, select: (selection: TreeSelection) => void): boolean {
  if (event.altKey || event.shiftKey || event.metaKey || event.ctrlKey) return false
  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown' && event.key !== 'Home' && event.key !== 'End') return false
  const row = rowOfControl(event.target)
  if (tree === null || row === null) return false
  event.preventDefault()
  const rows = [...tree.querySelectorAll<HTMLElement>('[data-tree-row]')]
  // `!==` 로 견준다 — 위 `SHORTCUTS` 의 조합을 세는 자(`test/panels/menu-keyboard.test.tsx` «표의 여섯을 다 덮는다»)가 `event.key === '` 를 닻으로 센다.
  // Home · End 는 보이는 첫 · 끝 줄이다(접힌 메뉴 안은 DOM 에 없다).
  const key = event.key
  const next = key === 'Home' ? rows[0] : key === 'End' ? rows[rows.length - 1] : rows[rows.indexOf(row) + (key !== 'ArrowUp' ? 1 : -1)]
  const selection = next === undefined ? null : rowSelection(next)
  if (next === undefined || selection === null) return true
  select(selection)
  rowControl(tree, selection)?.focus()
  return true
}

/** 대상이 줄 단추 · 링크(줄 상자의 바로 아래 `.wb-shell-tree-menu` · `.wb-shell-tree-page`)면 그 줄 상자. */
function rowOfControl(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null
  const row = target.parentElement
  if (row === null || !row.hasAttribute('data-tree-row')) return null
  return target.classList.contains('wb-shell-tree-menu') || target.classList.contains('wb-shell-tree-page') ? row : null
}

/** 그 줄의 줄 단추 · 링크. 줄이 안 그려졌으면(접힌 메뉴 안 · 트리에 없음) `null`. */
function rowControl(tree: HTMLElement, selection: TreeSelection): HTMLElement | null {
  const row = [...tree.querySelectorAll<HTMLElement>('[data-tree-row]')].find((one) => {
    const at = rowSelection(one)
    return at !== null && isPicked(at, selection)
  })
  return row?.querySelector<HTMLElement>(':scope > .wb-shell-tree-menu, :scope > .wb-shell-tree-page') ?? null
}

/** 보이는 줄 — 화면 차례. */
function shownRowsOf(tree: HTMLElement): TreeSelection[] {
  return [...tree.querySelectorAll<HTMLElement>('[data-tree-row]')].map(rowSelection).filter((row): row is TreeSelection => row !== null)
}

/**
 * **사라진 줄의 이웃** — 앞 렌더의 보이는 차례(`order`)에서 그 줄 뒤로 처음 남은(`alive`) 줄, 없으면 앞으로 처음 남은 줄. 그 줄이 차례에 없었으면
 * `null`. 다음 줄을 먼저 보는 것은 지운 자리에 올라오는 것이 다음 줄이기 때문이다(목록에서 지운 뒤의 흔한 자리).
 */
function neighborOf(order: readonly TreeSelection[], gone: TreeSelection, alive: (row: TreeSelection) => boolean): TreeSelection | null {
  const at = order.findIndex((row) => isPicked(row, gone))
  if (at === -1) return null
  for (const row of order.slice(at + 1)) if (alive(row)) return row
  for (const row of order.slice(0, at).reverse()) if (alive(row)) return row
  return null
}

/**
 * 메뉴 하나와 그 안의 것들. 자기 페이지를 먼저, 그다음 자식 메뉴를 품는다 — 둘은 각각
 * 자기 `sortOrder` 눈금을 갖고 있어(서버가 배열을 따로 준다) 하나로 섞어 정렬할 수 없다.
 *
 * **그 그리는 순서가 `tree-actions.ts`의 판정 근거이기도 하다** — 페이지의 앞 형제는 항상
 * 페이지이므로 페이지는 들여쓸 수 없다.
 *
 * `drag`가 `null`이면 편집할 수 없는 판이다 — 줄 행동도 끌기도 없다.
 */
function MenuItem(props: {
  node: TreeMenuNode
  projectId: string
  pageId: string | undefined
  commands: TreeCommands
  drag: PointerDrag<TreeSelection, MenuDrop> | null
  exporter: PageJsonExport
  fold: Collapsed
}): ReactElement {
  const { node, projectId, pageId, commands, drag } = props
  const pages = byOrder(node.pages)
  const children = byOrder(node.children)
  const self: TreeSelection = { kind: 'menu', id: node.id }
  const picked = isPicked(commands.selection, self)
  const foldable = pages.length > 0 || children.length > 0
  const folded = foldable && props.fold.collapsed.has(node.id)

  return (
    <li>
      <TreeRow self={self} picked={picked} drag={drag} folded={folded}>
        {/* **메뉴 제목은 누를 수 있다 — 누르는 것은 "여는 것"이 아니라 "가리키는 것"이다**.
            메뉴에는 열 문서가 없지만(「설계서 화면 구조」의 트리에서 문서를 가진 것은 페이지뿐이다) 고르는
            효과가 실재한다: 단축키 · 줄 행동이 그 메뉴에 작동하게 된다. *"누를 수 있게 보이는 것은 그
            자체로 거짓말이다"*는 **누르는 것 = 여는 것**일 때만 서는 판단이다.

            `<Link>`가 아니라 `<button>`인 것은 갈 주소가 없기 때문이다. 선택 표시가
            `aria-current`가 아니라 `aria-pressed`인 것도 같은 이유다 — `aria-current="page"`는
            "지금 보고 있는 페이지"라는 뜻이라 열리지 않는 것에 붙이면 거짓이 된다.

            **`false`를 지우지 않는다.** 페이지 링크의 `aria-current`는 `undefined`로 지우는데
            (그래야 "표시가 붙은 줄"을 속성으로 셀 수 있다) 여기는 반대다: 토글 버튼은 눌리지
            않은 상태도 말해야 보조 기술이 "누를 수 있는 것"으로 읽는다. */}
        <button
          type="button"
          className="wb-shell-tree-menu"
          aria-pressed={picked}
          // 접고 펴는 줄의 상태 — 보조 기술이 읽는 것은 여기다(`./tree-fold.tsx` 머리말).
          aria-expanded={foldable ? !folded : undefined}
          onClick={() => commands.select(self)}
          {...(drag === null ? {} : drag.bind(self))}
        >
          {node.title}
        </button>
        {/* 펼침 단추는 줄 단추 **뒤**에 두고 CSS 가 앞에 세운다(`./tree-fold.tsx` 머리말 «DOM 에서는 줄 단추 뒤다»). */}
        <TreeToggle foldable={foldable} folded={folded} onToggle={() => props.fold.toggle(node.id)} />
        {drag !== null && (
          <TreeRowActions
            name={node.title}
            {...menuRowItems(commands, 'menu')}
            onOpen={() => pick(commands, self)}
            picked={picked}
          />
        )}
      </TreeRow>
      {drag !== null && picked && <RowPanel commands={commands} at="row" />}

      {foldable && !folded && (
        <ul className="wb-shell-tree-list">
          {/* 여기 두 자리의 키도 인덱스가 아니라 id다 — 이유와 실측은 `MenuTree`의 키
              주석에 있다. */}
          {pages.map((page) => (
            <li key={page.id}>
              <PageLink
                page={page}
                projectId={projectId}
                pageId={pageId}
                commands={commands}
                drag={drag}
                exporter={props.exporter}
              />
            </li>
          ))}
          {children.map((child) => (
            <MenuItem
              key={child.id}
              node={child}
              projectId={projectId}
              pageId={pageId}
              commands={commands}
              drag={drag}
              exporter={props.exporter}
              fold={props.fold}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

/**
 * 페이지 한 줄. 버튼이 아니라 링크인 것은 주소가 있는 이동이기 때문이다 — 새 탭으로
 * 열거나 주소를 공유할 수 있어야 한다(`project-list.tsx`와 같은 이유). **메뉴와 달리
 * 페이지는 열리는 것이라 그 근거가 그대로 선다.**
 */
function PageLink(props: {
  page: TreePage
  projectId: string
  pageId: string | undefined
  commands: TreeCommands
  drag: PointerDrag<TreeSelection, MenuDrop> | null
  exporter: PageJsonExport
}): ReactElement {
  const { commands, drag, exporter } = props
  const selected = props.page.id === props.pageId
  const self: TreeSelection = { kind: 'page', id: props.page.id }
  const picked = isPicked(commands.selection, self)

  return (
    <>
      <TreeRow self={self} picked={picked} drag={drag} folded={false}>
        <Link
          className="wb-shell-tree-page"
          to={`/projects/${props.projectId}/pages/${props.page.id}`}
          // 선택은 **주소에서 나온다.** 누른 것을 따로 기억하면 새로고침·뒤로 가기에서
          // 표시와 실제로 열린 페이지가 어긋난다.
          //
          // `false`가 아니라 `undefined`인 것은 `aria-current="false"`가 DOM에 남기
          // 때문이다 — 그러면 "표시가 붙은 줄"을 속성으로 셀 수 없다.
          aria-current={selected ? 'page' : undefined}
          // **고른 것을 푼다**. 주소가 그 페이지를 말하므로 상태로 또 적지 않는다 —
          // 풀지 않으면 주소는 페이지인데 단축키는 메뉴(또는 줄의 `…`로 고른 다른 페이지)에 작동하는 상태가 남는다.
          onClick={() => commands.select(null)}
          {...(drag === null ? {} : drag.bind(self))}
        >
          {props.page.title}
        </Link>
        <TreeToggle foldable={false} folded={false} />
        {drag !== null && (
          <TreeRowActions
            name={props.page.title}
            {...menuRowItems(commands, 'page', {
              run: () => exporter.run(props.page.id),
              busy: exporter.exporting !== null,
            })}
            onOpen={() => pick(commands, self)}
            picked={picked}
          />
        )}
      </TreeRow>
      {drag !== null && picked && <RowPanel commands={commands} at="row" />}
    </>
  )
}

/**
 * 줄 하나의 상자 — 줄 단추 · 줄 행동을 한 줄에 세우고, 끌기가 찾을 표지(`data-tree-row` · 종류 · id)를 단다. **줄 행동이 서는 조건
 * 셋(마우스 · 포커스 · 고른 줄)이 이 상자에 걸린다**(`shell.css` 의 `.wb-shell-tree-row` — `panels/tree-row-actions.tsx` 머리말 «서는
 * 조건은 CSS 가 갖는다»). 끄는 중인 줄은 흐리게 한다.
 */
function TreeRow(props: {
  self: TreeSelection
  picked: boolean
  drag: PointerDrag<TreeSelection, MenuDrop> | null
  /** 접힌 메뉴인가 — 끄는 포인터가 머물면 펴는 표지(`drag/hover-open.ts`). */
  folded: boolean
  children: ReactElement | (ReactElement | false)[]
}): ReactElement {
  const dragging = props.drag?.dragging
  const lifted = dragging !== undefined && dragging !== null && isPicked(dragging, props.self)
  return (
    <div
      className={
        'wb-shell-tree-row' + (props.picked ? ' wb-shell-tree-row-picked' : '') + (lifted ? ' wb-shell-tree-row-dragging' : '')
      }
      data-tree-row=""
      data-tree-kind={props.self.kind}
      data-tree-id={props.self.id}
      data-tree-collapsed={props.folded ? '' : undefined}
    >
      {props.children}
    </div>
  )
}

/** 줄 상자의 표지를 선택으로 되읽는다. 표지가 깨졌으면 `null`. */
function rowSelection(row: HTMLElement): TreeSelection | null {
  const kind = row.dataset['treeKind']
  const id = row.dataset['treeId']
  if (id === undefined || id === '') return null
  if (kind === 'menu' || kind === 'page') return { kind, id }
  return null
}

/**
 * 고른 줄 바로 아래에 서는 것 — 이름 입력 · 소속 메뉴 목록 · 삭제 확인(spec 「툴바 대신 노드별 `+` · `…`」 — «지금처럼 트리 영역
 * 안에 선다, 자리만 줄 곁으로»). 셋 다 훅의 상태라 여는 것이 줄 행동이든 단축키든 같은 자리에 선다.
 *
 * **닫혀 있을 때는 DOM에 없다** — 남겨 두면 Tab 순서에 정지점이 그대로 남는다. 뷰 모드에서도 없다(부르는 쪽이 `editable`로 가른다) —
 * 그 상태는 훅이 들고 있으므로 편집 모드로 돌아오면 열려 있던 그대로 되살아난다(구조 트리의 선택이 스토어에 남는 것과 같은 결).
 */
function RowPanel(props: { commands: TreeCommands; at: 'row' | 'bottom' }): ReactElement | null {
  const { commands } = props
  const anchored = anchoredToRow(commands)
  /** 이 자리에 설 것인가 — 최상위 메뉴 입력은 트리 아래에만, 나머지는 고른 줄이 있으면 그 아래 · 없으면 트리 아래. */
  const here = (rooted: boolean): boolean => (props.at === 'bottom' ? rooted || !anchored : !rooted && anchored)
  const items = [
    commands.reparenting !== null && here(false) && (
      <MenuPicker
        key="reparent"
        options={commands.reparenting}
        onPick={commands.reparentTo}
        onCancel={commands.cancelReparent}
      />
    ),
    commands.editing !== null && here(commands.editing.kind === 'new-root-menu') && (
      <TreeInput
        // **용도가 바뀌면 새 인스턴스를 마운트한다.** 같은 자리에 남겨 두면 앞 용도의
        // 값이 남는다 — `key`가 그것을 갈라 준다.
        key={commands.editing.kind}
        label={INPUT_LABEL}
        initial={commands.inputValue()}
        onSubmit={commands.submitInput}
        onCancel={commands.cancelInput}
        onEdit={commands.typeInput}
      />
    ),
    commands.confirmingRemove && here(false) && <RemoveConfirm key="remove" commands={commands} />,
  ].filter((item) => item !== false)
  if (items.length === 0) return null
  return <div className="wb-shell-tree-panel">{items}</div>
}

/**
 * 고른 것이 트리의 줄에 붙어 있나 — 고른 것이 있고 트리에 있다(`abilities.rename`이 그것만 본다). 아니면 줄 아래 것들이 트리 아래에
 * 선다(`MenuTree`).
 */
function anchoredToRow(commands: TreeCommands): boolean {
  return commands.selection !== null && commands.abilities.rename
}

/**
 * 삭제 확인 — 두 번 누르기의 두 번째(키 하나로 사라지면 되돌릴 길이 없다). `…`의 «삭제»나 `Delete` 키가 걸고, 설 때 포커스를 받는다 —
 * 그래서 확인하는 두 번째 누름이 첫 누름과 같은 손(Enter · 클릭)이고, Escape 가 그 자리에서 취소다.
 *
 * **Esc를 이 단추에서 받는다** — 전역 리스너를 두지 않는 것은 그것이 다른 패널의 Esc까지 가로채기 때문이다. 확인이 풀리는 나머지
 * 조건(선택 변경 · 다른 조작 · «취소»)은 훅이 갖는다(`askRemove`의 짝).
 */
export function RemoveConfirm(props: { commands: TreeCommands }): ReactElement {
  const { commands } = props
  const confirm = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    confirm.current?.focus()
  }, [])
  /** 확인 단추가 꺼졌을 때의 이유 — `…`의 «삭제»와 같은 판정 · 같은 문장(`panels/toolbar-status.ts`의 `menuItemReason`). */
  const removeReason = menuItemReason({ selection: commands.selection, busy: commands.busy, abilities: commands.abilities }, 'remove')
  const off = !commands.abilities.remove || commands.busy
  return (
    <span className="wb-shell-tree-confirm">
      {/* 꺼진 동안도 포커스는 받는다 — 이유(`aria-description`)에 키보드로 닿는 자리다(`shell/action-menu.tsx` 머리말 «끈 항목은 …»). */}
      <button
        type="button"
        ref={confirm}
        className="wb-shell-menu-tool"
        aria-disabled={off || undefined}
        title={removeReason}
        aria-description={removeReason}
        onClick={() => {
          if (off) return
          commands.confirmRemove()
        }}
        onKeyDown={(event) => {
          // `!==`로 쓴다 — 위 `SHORTCUTS`의 조합을 세는 자(`test/panels/menu-keyboard.test.tsx` «표의 여섯을 다 덮는다»)가 `event.key === '`를 닻으로 센다.
          if (event.key !== 'Escape') return
          event.preventDefault()
          commands.cancelRemove()
        }}
      >
        {REMOVE_CONFIRM_LABEL}
      </button>
      <button type="button" className="wb-shell-menu-tool" onClick={commands.cancelRemove}>
        취소
      </button>
    </span>
  )
}

/** 인라인 입력의 라벨. 용도가 여럿이지만 입력은 하나다(`tree-input.tsx`). */
const INPUT_LABEL = '이름'

/** 삭제 확인 단추의 문안. */
const REMOVE_CONFIRM_LABEL = '정말 삭제합니까?'

/**
 * 줄 행동을 열 때 그 줄을 고른다 — **이미 고른 줄이면 다시 고르지 않는다.** `select`는 열린 입력 · 삭제 확인 · 소속 목록을 함께
 * 닫으므로(다른 것을 고르면 그것들이 어느 줄에 붙는지 사라진다), 같은 줄의 `…`를 다시 여는 것이 그 줄의 이름 입력을 닫으면 안 된다.
 */
function pick(commands: TreeCommands, self: TreeSelection): void {
  if (!isPicked(commands.selection, self)) commands.select(self)
}

/** 두 선택이 같은 것을 가리키는가. `kind`가 갈라 주므로 메뉴와 페이지의 id가 같아도 섞이지 않는다. */
function isPicked(selection: TreeSelection | null, target: TreeSelection): boolean {
  return selection !== null && selection.kind === target.kind && selection.id === target.id
}

/**
 * `sortOrder` 오름차순. **원본을 복사하고 정렬한다** — 응답 배열을 제자리에서 뒤집으면
 * 그 배열을 들고 있는 다른 곳(캐시·다음 렌더의 같은 참조)의 순서까지 바뀐다.
 *
 * `sort`는 안정 정렬이므로 `sortOrder`가 같은 형제는 서버가 준 순서를 지킨다.
 */
function byOrder<T extends { sortOrder: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.sortOrder - b.sortOrder)
}
