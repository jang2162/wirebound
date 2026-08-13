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
 * 머리말). 던지면 셸 전체가 흰 화면이므로, 여기서 부르는 것들은 값으로 답해야 한다.
 *
 * **"깨진 문서에도 던지지 않는다"는 처음 적었을 때 거짓이었다** — 리뷰가 `children`
 * 배열 안의 `null` 원소로 반례를 찾았다. 웨이브 3의 정정(`edit/safe-walk.ts`)이 그것을
 * 닫았고 재현해 확인했다. **전제는 이것이다:** `structureAbilities`·`nodeSpot`·`ops`
 * 생성기 넷이 전부 `walkSafely`를 지나고, 그것이 노드가 아닌 값을 순회에서 뺀다.
 * `@wirebound/schema`의 `walkNodes`를 여기서 다시 쓰면 그 전제가 깨진다.
 *
 * **완전하다고는 적지 않는다** — 잰 것은 그 반례 부류(배열 원소가 노드가 아닌 경우)와
 * 웨이브 1이 잰 여섯 형태까지다.
 */
import { useState, type ReactElement } from 'react'
import { useEditCommit } from '../edit/use-edit-commit'
import { createNode } from '../edit/create-node'
import { insertNodeOps, moveNodeOps, removeNodeOps } from '../edit/ops'
import { findNodeSafely } from '../edit/safe-walk'
import { nodeSpot, structureAbilities, type StructureAbilities } from '../edit/structure-actions'
import { useEditorStore, useEditorStoreInstance, useOpenDocument } from '../store/use-editor-store'
import { PatternPicker } from './pattern-picker'
import { TypePicker } from './type-picker'

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
  // **조건 둘을 다 말한다.** `acceptsChildren`은 카탈로그의 `many` 여부만이 아니라
  // 문서의 `children`이 배열인지도 본다 — 앞엣것만 적으면 `Card`인데 비활성인 자리에서
  // 사용자가 이유를 알 수 없다(리뷰 지적).
  addInside: '자식을 담을 수 있는 타입이어야 하고, children이 배열이어야 합니다',
  addAfter: '루트가 아닌 노드를 고르세요',
  remove: '루트가 아닌 노드를 고르세요',
  moveUp: '앞에 형제가 있는 노드를 고르세요',
  moveDown: '뒤에 형제가 있는 노드를 고르세요',
  indent: '앞 형제가 자식을 담을 수 있어야 합니다',
  outdent: '부모가 루트가 아니어야 합니다',
}

/**
 * 툴바 버튼과 키보드 단축키가 **공유하는** 조작 묶음(D8).
 *
 * **두 경로가 같은 함수를 부르는 것이 계약이다.** 각자 자기 구현을 가지면 한쪽만
 * 고쳐지는 자리가 생긴다 — `structure-keyboard.test.tsx`의 `단축키와 버튼이 같은 op을
 * 만든다`가 그것을 고정한다.
 *
 * 훅을 **한 번만** 부르는 것도 의도다. 트리가 불러 툴바에 내려 주므로 `useEditCommit`
 * 인스턴스가 하나다 — 둘이어도 D6는 지켜지지만(펌프 가드가 스토어에 있다) 같은 화면에서
 * 굳이 둘을 만들 이유가 없다.
 */
export interface StructureCommands {
  abilities: StructureAbilities
  remove: () => void
  moveUp: () => void
  moveDown: () => void
  indent: () => void
  outdent: () => void
  /**
   * 고르개를 연다. 실제 추가는 `pick`(타입)·`pickPattern`(패턴)이 한다.
   *
   * **`'pattern'`이 `'inside'`·`'after'`와 같은 상태에 있는 것이 의도다** — 고르개 둘이
   * 동시에 열리면 좁은 좌측 패널에 목록 두 개가 쌓이고, 어느 쪽 `추가`를 눌렀는지가
   * 흐려진다. 상태가 하나면 그 경우가 성립하지 않는다.
   */
  openAdd: (where: 'inside' | 'after' | 'pattern') => void
  /** 고르개가 열려 있으면 무엇을 고르는 중인지. 닫혀 있으면 `null`. */
  adding: 'inside' | 'after' | 'pattern' | null
  pick: (type: string) => void
  cancelAdd: () => void
}

export function useStructureCommands(props: {
  projectId: string
  pageId: string | undefined
}): StructureCommands {
  const store = useEditorStoreInstance()
  // 문서는 `useOpenDocument`로 받는다 — 스토어의 문서가 **지금 주소의 것**일 때만 본다
  // (`store/use-editor-store.tsx`가 그 대조를 갖는 유일한 자리다).
  const document = useOpenDocument(props.pageId)
  const selectedNodeId = useEditorStore(store, (s) => s.selectedNodeId)
  // 훅은 조건부로 부를 수 없으므로 페이지가 없어도 부른다. `pageId`가 없으면 `''`를
  // 주는데, 그 값은 어느 페이지 id와도 같지 않아 `commitOps`가 그 자리에서 돌아온다
  // (속성 패널과 같은 관례).
  //
  // **다만 이 갈래는 지금 도달하지 않는다 — 리뷰가 지적했고 소스로 확인했다.**
  // `StructureTree`가 `doc === null`이면 툴바를 아예 그리지 않고, 문서가 있다는 것은
  // `useOpenDocument`가 주소와 대조를 통과했다는 뜻이라 `pageId`가 있다. 속성 패널은
  // 그 게이트가 없어 실제로 이 갈래를 지난다 — 관례를 맞춘 것이지 여기서 쓰이는 것이
  // 아니다.
  const { commitOps } = useEditCommit({ projectId: props.projectId, pageId: props.pageId ?? '' })

  const abilities = structureAbilities(document, selectedNodeId)
  /** 고르개가 열려 있으면 무엇을 고르는 중인지. 닫혀 있으면 `null`이다. */
  const [adding, setAdding] = useState<'inside' | 'after' | 'pattern' | null>(null)

  /**
   * 고른 타입으로 새 노드를 만들어 넣는다. 편집이 실제로 들어갔을 때만 선택을 옮긴다.
   *
   * **웨이브 2에서 "Task 7이 이 반환값 검사에 하중을 준다"고 적었는데 그 예측은
   * 빗나갔다 — 여기서도 0 사망이다(재 봤다).** 무조건 옮기도록 바꿔도 이 파일의 케이스가
   * 하나도 죽지 않는다. 앞의 가드들이 여전히 덮기 때문이다: `createNode`가 받는 타입은
   * **목록이 카탈로그에서 만든 것**이라 `null`이 될 수 없고, `insertNodeOps`가 받는
   * 부모·인덱스는 `structureAbilities`·`nodeSpot`을 지난 값이다.
   *
   * 그래도 남긴다. `routes/editor.tsx`의 `ready` 게이트와 같은 자리다 — **지금 통과하는
   * 이유가 "위의 성질이 지켜지고 있어서"이므로**, 그 성질이 깨지는 날 이것이 마지막
   * 방벽이다. **닫는 케이스를 만들지 못했다**: 화면에서 `commitOps`를 `false`로 만들려면
   * 비활성인 버튼을 눌러야 하는데 그 경로가 없다.
   *
   * 목록은 **성패와 무관하게 닫는다.** 열어 둔 채로 두면 실패했을 때 같은 편집을 다시
   * 내게 되고, 그것도 같은 이유로 실패한다.
   */
  function addNode(type: string): void {
    setAdding(null)
    // **`adding`이 `'pattern'`이면 여기 오지 않는다** — 그때 그려지는 것은 `PatternPicker`
    // 이고 이 함수는 `TypePicker.onPick`에만 걸려 있다. 그래도 자리를 좁혀 두는 것은
    // 아래 두 갈래가 `'inside' | 'after'`를 전제하기 때문이다.
    if (document === null || selectedNodeId === null) return
    if (adding !== 'inside' && adding !== 'after') return

    const node = createNode(type)
    if (node === null) return

    const ops =
      adding === 'inside' ? insertInside(selectedNodeId, node) : insertAfter(selectedNodeId, node)

    if (commitOps(ops)) store.selectNode(node.id)
  }

  /** 선택 노드의 **마지막 자식**으로. `children`이 없으면 0이고 `insertNodeOps`가 배열째 만든다. */
  function insertInside(nodeId: string, node: ReturnType<typeof createNode>) {
    if (document === null || node === null) return null
    const parent = findNodeSafely(document.root, nodeId)
    return insertNodeOps(document, nodeId, parent?.children?.length ?? 0, node)
  }

  /** 선택 노드의 **다음 형제**로. `moveNodeOps`의 계약과 같은 자리 계산이다. */
  function insertAfter(nodeId: string, node: ReturnType<typeof createNode>) {
    if (document === null || node === null) return null
    const spot = nodeSpot(document, nodeId)
    if (spot === null) return null
    return insertNodeOps(document, spot.parentId, spot.index + 1, node)
  }

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
   * **그때 적은 예측("Task 7이 하중을 준다")은 빗나갔다** — Task 7에서 재보니 그쪽도
   * 0 사망이다(`addNode`의 주석에 이유를 적었다). 남기는 근거는 예측이 아니라
   * `routes/editor.tsx`의 `ready` 게이트와 같은 것이다: 지금 통과하는 이유가 위의
   * 성질이 지켜지고 있어서이므로, 그것이 깨지는 날 이 검사가 마지막 방벽이다.
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

  /**
   * 한 단계 안으로 — **앞 형제의 마지막 자식**이 된다(D3).
   *
   * 목적지 인덱스가 앞 형제의 `children` 길이인 것은 그 배열이 **소스를 빼는 것과
   * 무관하기 때문이다.** 노드는 부모의 배열에서 빠지고 앞 형제의 배열로 들어가므로,
   * 웨이브 1이 잰 "값을 뺀 뒤 기준"이 여기서는 뺀 것과 같은 값을 낸다.
   *
   * **앞 형제에 `children` 키가 없으면 `moveNodeOps`가 배열을 먼저 만든다**(웨이브 1의
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
    // 따로 두지 않는 것은 그 검사가 0 사망이었기 때문이다.
    //
    // **다만 "이 줄이 덮는다"는 반쪽이었다 — 리뷰가 잡았고 재현했다.** 논리로는 덮지만
    // **이 줄 자체도 0 사망**이다: 첫 형제에서는 버튼이 비활성이라 클릭이 오지 않고,
    // 단축키는 `structureAbilities.indent`를 먼저 지난다. 둘 다 `disabled`/판정이 덮고
    // 있고, 여기 남은 것은 그 둘이 벗겨졌을 때의 `TypeError` 방벽이다.
    const previous = parent?.children?.[spot.index - 1]
    if (previous === undefined) return

    // **앞 형제의 `children`이 배열인지 여기서 보지 않는다.** `structureAbilities`의
    // `indent`가 `acceptsChildren`으로 이미 거르므로(배열도 `undefined`도 아니면 `false`)
    // 그런 앞 형제에서는 버튼이 비활성이다. 겹으로 두면 판정이 두 곳에 생기고 — 그것이
    // D3이 막으려는 것이다 — 실제로 0 사망이었다(재 봤다).
    commitOps(moveNodeOps(document, selectedNodeId, previous.id, previous.children?.length ?? 0))
  }

  /**
   * 한 단계 밖으로 — **부모의 다음 형제**가 된다(D3).
   *
   * 부모의 자리를 `nodeSpot`으로 한 번 더 읽는다. 그것이 `null`이면 부모가 루트라
   * 나갈 곳이 없다 — `structureAbilities`의 `outdent`와 같은 판정이지만, 여기서는
   * 조부모 id와 부모 인덱스가 **필요해서** 부른다.
   *
   * **그 `null` 검사는 지금 0 사망이다 — 재 봤다.** 부모가 루트면 버튼이 이미 비활성이라
   * 클릭이 핸들러에 닿지 않는다. 벗겨지는 때가 온다: **Task 8의 키보드 단축키는 버튼을
   * 지나지 않으므로**(D8 케이스 5가 "단축키가 비활성 조작을 실행하지 않는다"를 요구한다)
   * 그때 이 검사가 마지막 방벽이다. **그것은 계획을 읽은 것이지 잰 것이 아니다.**
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

    commitOps(
      moveNodeOps(document, selectedNodeId, parentSpot.parentId, parentSpot.index + 1),
    )
  }

  return {
    abilities,
    remove: removeSelected,
    moveUp: () => moveSelected(-1),
    moveDown: () => moveSelected(1),
    indent: indentSelected,
    outdent: outdentSelected,
    openAdd: setAdding,
    adding,
    pick: addNode,
    cancelAdd: () => setAdding(null),
  }
}

/**
 * 툴바. **판정도 조작도 갖지 않는다** — `useStructureCommands`가 준 것을 그릴 뿐이다.
 *
 * **`projectId`를 받는 것은 패턴 고르개 때문이다**(D8). 패턴은 테마가 소유하므로
 * (§11.1) 목록을 만들려면 그 프로젝트의 테마를 읽어야 하고, 그 조회는 고르개가 열렸을
 * 때만 일어난다 — `PatternPicker`가 닫혀 있을 때 DOM에 없기 때문이다.
 */
export function StructureToolbar(props: {
  commands: StructureCommands
  projectId: string
}): ReactElement {
  const { commands } = props
  const { abilities } = commands

  return (
    <div className="wb-shell-structure-toolbar" role="group" aria-label="구조 편집">
      <ToolButton
        label="안에 추가"
        ability="addInside"
        abilities={abilities}
        onClick={() => commands.openAdd('inside')}
      />
      <ToolButton
        label="아래 추가"
        ability="addAfter"
        abilities={abilities}
        onClick={() => commands.openAdd('after')}
      />
      <ToolButton label="삭제" ability="remove" abilities={abilities} onClick={commands.remove} />
      <ToolButton label="위로" ability="moveUp" abilities={abilities} onClick={commands.moveUp} />
      <ToolButton
        label="아래로"
        ability="moveDown"
        abilities={abilities}
        onClick={commands.moveDown}
      />
      <ToolButton
        label="들여쓰기"
        ability="indent"
        abilities={abilities}
        onClick={commands.indent}
      />
      <ToolButton
        label="내어쓰기"
        ability="outdent"
        abilities={abilities}
        onClick={commands.outdent}
      />
      {/* **패턴은 `ToolButton`이 아니다.** 그 버튼은 `StructureAbilities`의 키 하나에
          묶여 있는데(비활성 여부와 이유가 같은 곳에서 나온다), 패턴 넣기는 **선택이
          없어도 할 수 있다**(D5 — 선택이 없으면 root의 자식 끝). 판정이 없으므로 걸
          `ability`도 없다. 패턴이 0개인 테마에서도 활성인 것은 D7이다 — *"없다"*를
          보여 주는 것이 회색 버튼보다 낫다. */}
      <button
        type="button"
        className="wb-shell-structure-tool"
        onClick={() => commands.openAdd('pattern')}
      >
        패턴 넣기
      </button>
      {/* 목록은 툴바 **안**에 있다 — 조작 묶음과 같은 자리라야 어느 노드에 붙는
          작업인지가 보인다. 닫혀 있을 때는 DOM에 없다: 남겨 두면 Tab 순서에 정지점이
          그대로 남는다. */}
      {(commands.adding === 'inside' || commands.adding === 'after') && (
        <TypePicker onPick={commands.pick} onCancel={commands.cancelAdd} />
      )}
      {commands.adding === 'pattern' && (
        <PatternPicker
          projectId={props.projectId}
          onPick={commands.cancelAdd}
          onCancel={commands.cancelAdd}
        />
      )}
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
