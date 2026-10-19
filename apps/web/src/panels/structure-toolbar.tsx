/**
 * 구조 트리의 **조작 묶음**(`useStructureCommands`). 조작의 입구는 트리 줄의 `…`(`panels/tree-row-actions.tsx`) · 끌어 놓기 · 키보드 단축키(에디터
 * 단축키 `shell/editor-keys.tsx`)다 — 전부 이 파일의 명령을 부른다. 파일 이름의 «툴바»는 그 입구들이 한 줄 툴바였던 자리의 이름이다.
 *
 * **노드를 넣는 입구는 여기 없다** — 넣기는 하단 판(컴포넌트 · 모듈 카드 — `palette/`)과 붙여넣기 · 복제가 한다(설계 spec
 * `2026-10-18-modules-states-layout-design.md` 「B1」). 그 둘이 쓰는 판정(`StructureAbilities.addInside` · `addAfter`)은 판정 표에 남는다.
 *
 * **판정은 여기 없다.** 무엇을 할 수 있는지는 `edit/structure-actions.ts`의 `structureAbilities`가 정하고, 이 파일은 그 결과를 줄 행동에 넘길
 * 뿐이다. 판정이 컴포넌트 안으로 들어오면 케이스가 화면을 지나야만 재지고, 단축키가 자기 조건을 따로 갖게 된다.
 *
 * **이 파일은 오류 경계 밖이다** — 구조 트리와 같은 자리다(`panels/node-shape.ts` 머리말). 던지면 셸 전체가 흰 화면이므로, 여기서 부르는 것들은
 * 값으로 답해야 한다.
 *
 * **"깨진 문서에도 던지지 않는다"의 전제는 이것이다:** `structureAbilities`·`nodeSpot`·`ops` 생성기가 전부 `walkSafely`(`edit/safe-walk.ts`)를
 * 지나고, 그것이 노드가 아닌 값을 순회에서 뺀다. `@wirebound/schema`의 `walkNodes`를 여기서 다시 쓰면 그 전제가 깨진다 — `children` 배열 안의
 * `null` 원소 같은 것에서 던진다. **완전하다고는 적지 않는다** — 잰 것은 그 반례 부류(배열 원소가 노드가 아닌 경우)와 몇 가지 깨진 형태까지다.
 */
import type { NodeLock } from '@wirebound/schema'
import { useEditCommit } from '../edit/use-edit-commit'
import { aliasOps, moveNodeOps, removeNodeOps } from '../edit/ops'
import { reselectAfterReject } from '../edit/reselect-after-reject'
import { findNodeSafely } from '../edit/safe-walk'
import { nodeSpot, selectionAbilities, type StructureAbilities } from '../edit/structure-actions'
import { removeManyOps } from '../edit/paste-ops'
import type { StructureDrop } from '../edit/structure-drop'
import { useEditorStore, useEditorStoreInstance, useOpenDocument } from '../store/use-editor-store'
import { lockedNotice } from './property-panel'
import { structureWhy, type StructureReasonInput, type StructureWhy } from './toolbar-status'

/**
 * 줄 행동(`+` · `…`) · 끌어 놓기와 키보드 단축키가 **공유하는** 조작 묶음.
 *
 * **입구들이 같은 함수를 부르는 것이 계약이다.** 각자 자기 구현을 가지면 한쪽만
 * 고쳐지는 자리가 생긴다 — `structure-keyboard.test.tsx`의 `단축키와 버튼이 같은 op을
 * 만든다`가 그것을 고정한다.
 *
 * 훅을 **한 번만** 부르는 것도 의도다. 트리가 불러 줄 행동에 내려 주므로 `useEditCommit`
 * 인스턴스가 하나다 — 둘이어도 «in-flight는 항상 하나»는 지켜지지만(펌프 가드가 스토어에 있다) 같은 화면에서
 * 굳이 둘을 만들 이유가 없다.
 */
export interface StructureCommands {
  abilities: StructureAbilities
  /**
   * 꺼진 항목마다의 이유 — 줄 행동이 꺼진 항목의 `title` · `aria-description`으로 싣는다(`./tree-row-actions.tsx`). 켜진 항목은 `undefined`다.
   *
   * **줄 행동이 아니라 여기서 짓는다** — 이유가 `abilities` 말고도 **선택 자체의 성질**(잠금 · 루트 · 개수)을 보는데, 그것은 스토어와 문서에서
   * 나오고 그것을 이미 든 자리가 여기다. 문안 자체는 `./toolbar-status.ts`가 갖는다(순수 함수 — 상태마다 무엇이 나오는지가 화면을 지나지 않고
   * 재진다).
   */
  why: StructureWhy
  /**
   * 고른 노드를 지운다. 지운 뒤 무엇을 고르는지는 부르는 쪽이 정한다 — 줄 `…` «삭제»는 부모(`'parent'` — 기본), 키보드 삭제 · 잘라내기는
   * 선택을 비운다(`'none'` — `shell/editor-keys.tsx` 머리말 «키보드 삭제는 선택을 비운다»).
   */
  remove: (selectAfter?: 'parent' | 'none') => void
  moveUp: () => void
  moveDown: () => void
  indent: () => void
  outdent: () => void
  /**
   * **끌어 놓은 자리로 옮긴다**(`edit/structure-drop.ts`의 `structureDropTarget`이 준 자리). 선택이 아니라 끈 노드에 대해 돈다 —
   * 끌기는 줄을 고르지 않는다(`drag/use-pointer-drag.ts` «끈 뒤의 클릭을 삼킨다»). 편집은 `moveNodeOps` 하나 — 위로 · 들여쓰기가
   * 내는 것과 같은 종류다(spec 「드래그로 옮기기」 — 드래그만의 새 편집 종류를 만들지 않는다).
   */
  dropTo: (nodeId: string, target: StructureDrop) => void
  /**
   * 별칭을 고칠 수 없는가 — 하나를 고르지 않았거나(여럿 · 없음) · 고른 노드가 문서에 없거나 · 남이 잡았다(`selectedLock`). 줄 `…`
   * «별칭 바꾸기»의 끔 · 더블클릭 · F2 가 같은 값을 지난다. `abilities`에 키를 두지 않는 까닭은 그 표가 구조(자리)의 판정이고 별칭은 자리와
   * 무관하기 때문이다.
   */
  aliasLocked: boolean
  /**
   * 그 노드의 별칭을 바꾼다(`aliasOps` — 빈 값은 지움). 보내기 전에 서버의 2차 방어와 같은 물음(`editBlockedBy`)을 한 번 더 —
   * 입력을 연 뒤 도착한 남의 잠금이면 말하고 안 보낸다.
   */
  renameAlias: (nodeId: string, alias: string) => void
}

export function useStructureCommands(props: {
  projectId: string
  pageId: string | undefined
  /**
   * 고른 노드를 막는 **남의** 잠금(`store.lockedBy`가 낸 것). 없으면 `null`이다.
   *
   * **두 곳이 이 값을 쓴다.** 판정이 이것으로 꺼지고(`structureAbilities`의 셋째 인자 —
   * 그쪽 머리말에 왜 «전부» 꺼지는지와 실측이 있다), 꺼진 항목의 이유가 차례 맨 위에서 그
   * 잠금을 말한다(`./toolbar-status.ts`). **판정을 끄는 자리가 여기인 것이 요점이다** — 툴바
   * 컴포넌트에서 `disabled`를 겹치면 단축키가 안 막힌다(에디터 단축키 `shell/editor-keys.tsx`는
   * `commands.abilities`를 지난다).
   *
   * **여기서 구독하지 않고 받는다.** 스토어의 잠금 목록을 손에 쥐는 자리는 화면에 **하나**여야
   * 하고(`test/lock/one-verdict.test.ts` — *"셋째 판정은 여기서 먼저 보인다"*), 그 하나는
   * `store/use-locked-by.ts`다(속성 패널도 잠금을 봐야 하므로 형제 둘 중 하나인 `StructureTree`에
   * 둘 수 없다 — 그 사정은 그 파일이 갖는다).
   * `StructureTree`가 그 훅으로 받은 값을 트리 줄의 배지·비활성과 여기에 함께 내려 주므로,
   * 같은 값을 여기서 또 구독하면 자리만 늘고 얻는 것이 없다. **판정은 어느 쪽도 하지
   * 않는다** — 양쪽 다 스토어의 `lockedBy`를 지난 값을 든다.
   *
   * **선택 인자가 아니다.** 빠뜨리면 잠긴 자리에서 도구가 다시 살아나는데, 그것은 조용히
   * 지나가는 부류의 누락이다.
   */
  selectedLock: NodeLock | null
  /**
   * **이 페이지에 남의 잠금이 하나라도 있는가** — `store.lockedBy(document.root.id)`가 낸 값이다. 루트는 문서 안 모든 노드의 조상이므로 그 물음이
   * 곧 *"살아 있는 남의 잠금이 있나"*이고, **판정을 새로 짓지 않고** 같은 `lockedBy` 한 벌로 답한다. 쓰는 자리는 꺼진 항목의 이유 하나다
   * (`./toolbar-status.ts` 머리말 «안 골랐다 칸»).
   */
  pageLock: NodeLock | null
}): StructureCommands {
  const store = useEditorStoreInstance()
  // 문서는 `useOpenDocument`로 받는다 — 스토어의 문서가 **지금 주소의 것**일 때만 본다
  // (`store/use-editor-store.tsx`가 그 대조를 갖는 유일한 자리다).
  const document = useOpenDocument(props.pageId)
  const selectedNodeId = useEditorStore(store, (s) => s.selectedNodeId)
  const selectedNodeIds = useEditorStore(store, (s) => s.selectedNodeIds)
  // 훅은 조건부로 부를 수 없으므로 페이지가 없어도 부른다. `pageId`가 없으면 `''`를
  // 주는데, 그 값은 어느 페이지 id와도 같지 않아 `commitOps`가 그 자리에서 돌아온다
  // (속성 패널과 같은 관례).
  //
  // **다만 이 갈래는 지금 도달하지 않는다 — 소스로 확인한다.**
  // `StructureTree`가 `doc === null`이면 툴바를 아예 그리지 않고, 문서가 있다는 것은
  // `useOpenDocument`가 주소와 대조를 통과했다는 뜻이라 `pageId`가 있다. 속성 패널은
  // 그 게이트가 없어 실제로 이 갈래를 지난다 — 관례를 맞춘 것이지 여기서 쓰이는 것이
  // 아니다.
  const { commitOps } = useEditCommit({ projectId: props.projectId, pageId: props.pageId ?? '' })

  /**
   * **여럿을 고른 판은 고른 것 전부를 본다**(`selectionAbilities`) — 기준 노드 밖의 잠금은 고른 노드마다 스토어의 `lockedBy`를 묻는다(판정은
   * 스토어가 한다 — 목록을 손에 쥐지 않는다). 다시 그리는 것은 부르는 쪽의 잠금 구독(`useLockedBy`)이 한다.
   */
  const many = selectedNodeIds.length > 1
  const otherLock = many ? (selectedNodeIds.map((id) => store.lockedBy(id)).find((lock) => lock !== null) ?? null) : null
  const removable = many && document !== null && removeManyOps(document, selectedNodeIds) !== null
  const selectionBased = selectionAbilities(document, selectedNodeIds, selectedNodeId, props.selectedLock, otherLock !== null, removable)
  const abilities = selectionBased

  /**
   * 선택 노드를 지운다. **지운 뒤 선택을 부모로 옮긴다**(`selectAfter` 가 `'none'` 이면 비운다 — `StructureCommands.remove`).
   *
   * 옮기는 이유: `applyEdit`은 `selectedNodeId`를 건드리지 않으므로
   * 툴바가 옮기지 않으면 선택이 **사라진 노드를 가리킨 채** 남는다 — 사용자는 트리에서
   * 자기 위치를 잃고 속성 패널이 "노드를 고르면 속성이 보입니다"로 되돌아간다.
   * `삭제 뒤 선택이 부모로 옮겨진다`가 그것을 잡는다.
   *
   * **부모 자리를 편집 전 문서에서 먼저 읽는다.** 지운 뒤에는 그 노드가 없어 `nodeSpot`이
   * `null`이다.
   *
   * **`commitOps`의 반환값을 보는 검사는 지워도 죽는 케이스가 없다.** 무조건 옮기도록
   * 바꿔도 `--project web` 전량이 통과한다. 덮고 있는 것 둘:
   *
   * - **로컬 실패 경로에 닿지 못한다.** `commitOps`가 `false`를 내는 세 조건 중 열린
   *   페이지 대조는 위의 `document === null`이, 없는 노드는 `nodeSpot`이 먼저 잡는다.
   *   남는 것은 `applyEdit`이 던지는 경우인데 `removeNodeOps`가 만든 경로로는 던지지
   *   않는다.
   * - **서버 실패 경로에서는 두 구현이 같은 값을 낸다.** *"선택이 어차피 지워진다 —
   *   409 뒤 재조회의 `loadPage`가 선택까지 재설정하므로 그 시점의 선택은 부모가 아니라
   *   `null`이다"*가 아니다: `loadPage`는 같은
   *   페이지를 다시 싣는 경로에서 선택을 건드리지 않는다(`store/editor-store.ts`의
   *   `#selectionFor`). 그래서 실패 뒤 선택은 **부모 그대로**이고, 그것은 무조건 옮기는
   *   구현이 내는 값과 같다 — 가르지 못하는 것은 그대로다.
   *   `편집이 실패해도 툴바가 옮긴 선택은 남는다 — 두 경로가 갈리지 않는다`가 그 값을
   *   고정한다.
   *
   * 남기는 근거는 `routes/editor.tsx`의 `ready` 게이트와 같은 것이다: 지금 통과하는 이유가 위의 성질이 지켜지고 있어서이므로, 그것이 깨지는 날
   * 이 검사가 마지막 방벽이다.
   */
  function removeSelected(selectAfter: 'parent' | 'none' = 'parent'): void {
    if (document === null || selectedNodeId === null) return
    const spot = nodeSpot(document, selectedNodeId)
    if (spot === null) return

    // **여럿이면 고른 것 전부를 묶음 하나로**(`removeManyOps` — 편집 하나 · 되돌리기 하나). 줄 `…` «삭제»는 기준 노드의 부모를 고른다.
    // 남의 잠금은 판정(`abilities.remove`)이 이미 껐다 — 그래도 보내기 전에 서버와 같은 물음을 한 번 더 묻는다(`editBlockedBy`).
    if (selectedNodeIds.length > 1) {
      const ops = removeManyOps(document, selectedNodeIds)
      if (ops === null || store.editBlockedBy(ops) !== null) return
      const removed = {
        nodes: selectedNodeIds.flatMap((id) => {
          const at = nodeSpot(document, id)
          return at === null ? [] : [{ id, parentId: at.parentId }]
        }),
        anchor: selectedNodeId,
      }
      if (commitOps(ops)) {
        store.selectNode(selectAfter === 'parent' ? spot.parentId : null)
        reselectAfterReject(store, removed)
      }
      return
    }

    const removed = { nodes: [{ id: selectedNodeId, parentId: spot.parentId }], anchor: selectedNodeId }
    if (commitOps(removeNodeOps(document, selectedNodeId))) {
      store.selectNode(selectAfter === 'parent' ? spot.parentId : null)
      reselectAfterReject(store, removed)
    }
  }

  /**
   * 형제 사이에서 한 칸 옮긴다. `delta`가 -1이면 위로, +1이면 아래로다.
   *
   * **`index + delta`가 그대로 목적지인 것은 `moveNodeOps`의 계약 덕분이다** —
   * `moveNodeOps`의 `index`는 *결과* 배열에서의 자리이고(`[A,B,C]`에서 A를 2로 주면
   * `[B,C,A]`), 그래서 방향에 따라 보정을 나눌 필요가 없다.
   *
   * **선택은 손대지 않는다.** 노드 id가 그대로라 선택이 저절로 따라간다.
   */
  function moveSelected(delta: number): void {
    if (document === null || selectedNodeId === null) return
    const spot = nodeSpot(document, selectedNodeId)
    if (spot === null) return

    commitOps(moveNodeOps(document, selectedNodeId, spot.parentId, spot.index + delta))
  }

  /**
   * 한 단계 안으로 — **앞 형제의 마지막 자식**이 된다.
   *
   * 목적지 인덱스가 앞 형제의 `children` 길이인 것은 그 배열이 **소스를 빼는 것과
   * 무관하기 때문이다.** 노드는 부모의 배열에서 빠지고 앞 형제의 배열로 들어가므로,
   * `moveNodeOps`의 "값을 뺀 뒤 기준"이 여기서는 뺀 것과 같은 값을 낸다.
   *
   * **앞 형제에 `children` 키가 없으면 `moveNodeOps`가 배열을 먼저 만든다**(그 함수의
   * 두 op 갈래). 여기서 그것을 다시 다루지 않는다 — 빈 컨테이너로 들여쓰는 흔한 경로가
   * 그 갈래를 탄다(`앞 형제에 children 키가 없으면 배열을 먼저 만든다`).
   */
  function indentSelected(): void {
    if (document === null || selectedNodeId === null) return
    const spot = nodeSpot(document, selectedNodeId)
    if (spot === null) return

    const parent = findNodeSafely(document.root, spot.parentId)
    // **첫 형제는 여기서 걸린다** — 인덱스 0의 앞은 `-1`이고 그 자리는 비어 있다
    // (`noUncheckedIndexedAccess`가 그것을 타입으로도 말해 준다). `spot.index === 0`을
    // 따로 두지 않는 것은 그 검사를 지워도 죽는 케이스가 없기 때문이다.
    //
    // **다만 "이 줄이 덮는다"는 반쪽이다.** 논리로는 덮지만
    // **이 줄 자체도 지워도 죽는 케이스가 없다**: 첫 형제에서는 버튼이 비활성이라 클릭이 오지 않고,
    // 단축키는 `structureAbilities.indent`를 먼저 지난다. 둘 다 `disabled`/판정이 덮고
    // 있고, 여기 남은 것은 그 둘이 벗겨졌을 때의 `TypeError` 방벽이다.
    const previous = parent?.children?.[spot.index - 1]
    if (previous === undefined) return

    // **앞 형제의 `children`이 배열인지 여기서 보지 않는다.** `structureAbilities`의
    // `indent`가 `acceptsChildren`으로 이미 거르므로(배열도 `undefined`도 아니면 `false`)
    // 그런 앞 형제에서는 버튼이 비활성이다. 겹으로 두면 판정이 두 곳에 생기고(판정은
    // `structureAbilities` 한 곳이 한다), 그 겹만 지키는 케이스도 없다.
    commitOps(moveNodeOps(document, selectedNodeId, previous.id, previous.children?.length ?? 0))
  }

  /**
   * 한 단계 밖으로 — **부모의 다음 형제**가 된다.
   *
   * 부모의 자리를 `nodeSpot`으로 한 번 더 읽는다. 그것이 `null`이면 부모가 루트라
   * 나갈 곳이 없다 — `structureAbilities`의 `outdent`와 같은 판정이지만, 여기서는
   * 조부모 id와 부모 인덱스가 **필요해서** 부른다.
   *
   * **그 `null` 검사는 지워도 죽는 케이스가 없다.** 부모가 루트면 버튼이 이미 비활성이라
   * 클릭이 핸들러에 닿지 않고, 키보드 단축키도 `abilities.outdent`를 먼저 지난다
   * (`shell/editor-keys.tsx`). 남은 것은 그 둘이 벗겨졌을 때의 방벽이다.
   *
   * 목적지가 `부모 인덱스 + 1`인 것도 소스를 빼는 것과 무관하다 — 노드는 부모의 배열
   * 안에 있으므로 조부모의 배열은 그대로다.
   */
  function outdentSelected(): void {
    if (document === null || selectedNodeId === null) return
    const spot = nodeSpot(document, selectedNodeId)
    if (spot === null) return

    const parentSpot = nodeSpot(document, spot.parentId)
    if (parentSpot === null) return

    commitOps(moveNodeOps(document, selectedNodeId, parentSpot.parentId, parentSpot.index + 1))
  }

  const aliasLocked =
    document === null ||
    selectedNodeId === null ||
    selectedNodeIds.length !== 1 ||
    props.selectedLock !== null ||
    findNodeSafely(document.root, selectedNodeId) === undefined
  const reasonInput: StructureReasonInput = {
    selectedNodeId,
    // **루트인지는 id로 본다.** 판정을 다시 하지 않는다 — `structureAbilities`가 이미
    // 지나간 순회를 한 벌 더 돌면 둘이 갈릴 수 있다(`./toolbar-status.ts` 머리말).
    isRoot: document !== null && selectedNodeId !== null && document.root?.id === selectedNodeId,
    lock: props.selectedLock,
    count: selectedNodeIds.length,
    anyLock: otherLock,
    // 고른 것이 없을 때 항목이 다 회색인 까닭이 페이지 잠금이면 그것을 말한다 — 이 값을 못 보면 *"고르면 편집할 수 있습니다"*를 고를 줄이 없는
    // 판에서도 말한다(`./toolbar-status.ts` 머리말 «안 골랐다 칸»).
    pageLock: props.pageLock,
    abilities,
  }

  return {
    abilities,
    why: structureWhy(reasonInput, { aliasLocked }),
    remove: removeSelected,
    moveUp: () => moveSelected(-1),
    moveDown: () => moveSelected(1),
    dropTo: (nodeId, target) => {
      if (document === null) return
      commitOps(moveNodeOps(document, nodeId, target.parentId, target.index))
    },
    indent: indentSelected,
    outdent: outdentSelected,
    aliasLocked,
    renameAlias: (nodeId, alias) => {
      if (document === null) return
      const ops = aliasOps(document, nodeId, alias)
      if (ops === null) return
      const blocker = store.editBlockedBy(ops)
      if (blocker !== null) {
        store.setEditFailure({ kind: 'message', message: lockedNotice(blocker.userName) })
        return
      }
      commitOps(ops)
    },
  }
}
