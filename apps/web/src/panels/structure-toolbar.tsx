/**
 * 구조 트리 하단의 조작 툴바(D4). **선택 노드 하나에 작동한다.**
 *
 * 각 줄에 버튼을 흩지 않는 이유: 좁은 좌측 패널에서 트리가 읽히지 않고, 툴바여야
 * 키보드 단축키와 짝이 맞는다(D8 — Task 8).
 *
 * **판정은 여기 없다.** 무엇을 할 수 있는지는 `edit/structure-actions.ts`의
 * `structureAbilities`가 정하고(D3), 이 파일은 그 결과로 `disabled`를 걸 뿐이다.
 * 판정이 컴포넌트 안으로 들어오면 케이스가 화면을 지나야만 재지고, Task 8의 단축키가
 * 자기 조건을 따로 갖게 된다.
 *
 * **이 파일은 오류 경계 밖이다** — 구조 트리와 같은 자리다(`panels/node-shape.ts`
 * 머리말). 던지면 셸 전체가 흰 화면이므로, 여기서 부르는 것들은 전부 값으로 답한다:
 * `structureAbilities`·`nodeSpot`은 깨진 문서에도 던지지 않고, `ops` 생성기들은
 * 만들 수 없으면 `null`을 낸다.
 */
import type { ReactElement } from 'react'
import { useEditCommit } from '../edit/use-edit-commit'
import { moveNodeOps, removeNodeOps } from '../edit/ops'
import { nodeSpot, structureAbilities, type StructureAbilities } from '../edit/structure-actions'
import { useEditorStore, useEditorStoreInstance, useOpenDocument } from '../store/use-editor-store'

/**
 * 버튼이 비활성일 때 붙는 설명.
 *
 * **문안을 지어내지 않고 조건을 그대로 옮겼다.** 상태별로 다른 문장("루트라서" /
 * "고르지 않아서")을 만들지 않는 것은 그 갈래가 곧 판정의 두 번째 벌이 되기 때문이다 —
 * 판정은 `structureAbilities` 하나가 하고(D3), 여기 있는 것은 "그 버튼이 활성이려면
 * 무엇이 필요한가"뿐이다.
 *
 * **`title`의 한계는 재지 못했다.** 비활성 버튼은 포커스를 받지 못하므로 보조 기술이
 * 이 설명에 닿는지는 브라우저·리더 조합에 달려 있고, jsdom으로는 잴 수 없다.
 * `aria-describedby`로 바꿔도 같은 창에 걸리므로 더 싼 쪽을 골랐다.
 */
const WHY_DISABLED: Record<keyof StructureAbilities, string> = {
  addInside: '자식을 담을 수 있는 노드를 고르세요',
  addAfter: '루트가 아닌 노드를 고르세요',
  remove: '루트가 아닌 노드를 고르세요',
  moveUp: '앞에 형제가 있는 노드를 고르세요',
  moveDown: '뒤에 형제가 있는 노드를 고르세요',
  indent: '앞 형제가 자식을 담을 수 있어야 합니다',
  outdent: '부모가 루트가 아니어야 합니다',
}

export function StructureToolbar(props: {
  projectId: string
  pageId: string | undefined
}): ReactElement {
  const store = useEditorStoreInstance()
  // 문서는 `useOpenDocument`로 받는다 — 스토어의 문서가 **지금 주소의 것**일 때만 본다
  // (`store/use-editor-store.tsx`가 그 대조를 갖는 유일한 자리다).
  const document = useOpenDocument(props.pageId)
  const selectedNodeId = useEditorStore(store, (s) => s.selectedNodeId)
  // 훅은 조건부로 부를 수 없으므로 페이지가 없어도 부른다. `pageId`가 없으면 `''`를
  // 주는데, 그 값은 어느 페이지 id와도 같지 않아 `commitOps`가 그 자리에서 돌아온다
  // (속성 패널과 같은 관례).
  const { commitOps } = useEditCommit({ projectId: props.projectId, pageId: props.pageId ?? '' })

  const abilities = structureAbilities(document, selectedNodeId)

  /**
   * 선택 노드를 지운다. **지운 뒤 선택을 부모로 옮긴다**(D5).
   *
   * 옮기는 이유: `applyEdit`은 `selectedNodeId`를 건드리지 않으므로(P2b-2 이월 §4)
   * 툴바가 옮기지 않으면 선택이 **사라진 노드를 가리킨 채** 남는다 — 사용자는 트리에서
   * 자기 위치를 잃고 속성 패널이 "노드를 고르면 속성이 보입니다"로 되돌아간다.
   * `삭제 뒤 선택이 부모로 옮겨진다`가 그것을 잡는다.
   *
   * **부모 자리를 편집 전 문서에서 먼저 읽는다.** 지운 뒤에는 그 노드가 없어 `nodeSpot`이
   * `null`이다.
   *
   * **`commitOps`의 반환값을 보는 것은 지금 0 사망이다 — 재 봤다.** 무조건 옮기도록
   * 바꿔도 `--project web` 전량이 통과한다. 덮고 있는 것 둘:
   *
   * - **로컬 실패 경로에 닿지 못한다.** `commitOps`가 `false`를 내는 세 조건 중 열린
   *   페이지 대조는 위의 `document === null`이, 없는 노드는 `nodeSpot`이 먼저 잡는다.
   *   남는 것은 `applyEdit`이 던지는 경우인데 `removeNodeOps`가 만든 경로로는 던지지
   *   않는다.
   * - **서버 실패 경로에서는 선택이 어차피 지워진다.** 409 뒤 재조회가 `loadPage`를
   *   지나고 그것이 선택까지 서버 상태로 재설정한다(P2b-2 이월 §1) — 실측: 그 시점의
   *   선택은 부모가 아니라 `null`이다. `편집이 실패하면 선택이 지워진다`가 그 값을
   *   고정한다.
   *
   * 그래도 남기는 것은 **Task 7(추가)이 `commitOps`에 `null`이 실제로 흘러갈 경로를
   * 만들기 때문이다** — `createNode`·`insertNodeOps` 둘 다 `null`을 낼 수 있고, 그때
   * "편집이 안 들어갔는데 새 노드를 선택하는" 자리가 생긴다. **그것은 예측이지 잰 것이
   * 아니다.**
   */
  function removeSelected(): void {
    if (document === null || selectedNodeId === null) return
    const spot = nodeSpot(document, selectedNodeId)
    if (spot === null) return

    if (commitOps(removeNodeOps(document, selectedNodeId))) {
      store.selectNode(spot.parentId)
    }
  }

  /**
   * 형제 사이에서 한 칸 옮긴다. `delta`가 -1이면 위로, +1이면 아래로다.
   *
   * **`index + delta`가 그대로 목적지인 것은 웨이브 1이 잰 계약 덕분이다** —
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

  return (
    <div className="wb-shell-structure-toolbar" role="group" aria-label="구조 편집">
      <ToolButton label="삭제" ability="remove" abilities={abilities} onClick={removeSelected} />
      <ToolButton
        label="위로"
        ability="moveUp"
        abilities={abilities}
        onClick={() => moveSelected(-1)}
      />
      <ToolButton
        label="아래로"
        ability="moveDown"
        abilities={abilities}
        onClick={() => moveSelected(1)}
      />
    </div>
  )
}

/**
 * 버튼 하나. **비활성 여부와 그 이유가 같은 하나(`ability`)에서 나온다** — 둘을 따로
 * 넘기면 어긋나는 자리가 생긴다(선택 표시가 `aria-current` 하나에서 갈라져 나오는 것과
 * 같은 방식).
 */
function ToolButton(props: {
  label: string
  ability: keyof StructureAbilities
  abilities: StructureAbilities
  onClick: () => void
}): ReactElement {
  const enabled = props.abilities[props.ability]

  return (
    <button
      type="button"
      className="wb-shell-structure-tool"
      disabled={!enabled}
      // 활성일 때 설명을 남기지 않는다 — 버튼 이름과 겹쳐 읽힌다.
      title={enabled ? '' : WHY_DISABLED[props.ability]}
      onClick={props.onClick}
    >
      {props.label}
    </button>
  )
}
