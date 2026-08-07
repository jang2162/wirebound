/**
 * 좌측 하단의 구조 트리 — 열린 페이지의 컴포넌트 트리다(설계 §9). 편집 모드에서만 있고,
 * 뷰 모드에서는 자리째 접힌다(`routes/editor.tsx`).
 *
 * **문서와 선택은 스토어에서 온다.** 캔버스도 같은 곳을 보므로 어느 쪽에서 골라도 둘이
 * 같은 것을 가리킨다 — 각자 상태를 들면 "캔버스에서 고른 노드"와 "트리에서 고른 노드"가
 * 서로 다른 것이 되고, 그 어긋남은 속성 패널이 어느 쪽을 믿어야 할지의 문제로 번진다.
 *
 * 고르는 것 위에 **구조 편집이 얹혀 있다**(P2b-3) — 트리 아래의 툴바가 그것이다.
 * 툴바는 자기 판정과 편집을 스스로 하고(`panels/structure-toolbar.tsx`), 트리는 여전히
 * 고르는 일만 한다. 추가와 드래그 이동(설계 §9)은 아직 없다.
 */
import type { KeyboardEvent, ReactElement } from 'react'
import type { WbNode } from '@wirebound/schema'
import { useEditorStore, useEditorStoreInstance, useOpenDocument } from '../store/use-editor-store'
import type { StructureAbilities } from '../edit/structure-actions'
import { nodeTypeLabel } from './node-shape'
import { StructureToolbar, useStructureCommands, type StructureCommands } from './structure-toolbar'

/**
 * 키보드 단축키(D8). **툴바 버튼과 같은 함수를 부른다** — `run`이 `StructureCommands`에서
 * 꺼내 쓰고, `ability`가 버튼의 `disabled`와 같은 판정을 지난다.
 *
 * **무엇을 골랐고 왜인가.**
 *
 * | 키 | 조작 | 근거 |
 * |---|---|---|
 * | `Delete`·`Backspace` | 삭제 | 계획서가 `Delete`를 정했다. `Backspace`를 함께 받는 것은 **macOS 노트북 키보드에 forward delete 키가 없기 때문**이다 — 그 자리의 키가 내는 것이 `Backspace`다 |
 * | `Alt`+`↑`·`↓` | 순서 이동 | 계획서가 정했다 |
 * | `Alt`+`Shift`+`←`·`→` | 들여쓰기·내어쓰기 | 아래 |
 *
 * **`Alt`+`←`·`→`를 쓰지 않은 것은 그것이 Windows·Linux의 Chrome·Firefox에서 브라우저
 * 뒤로/앞으로이기 때문이다.** `Shift`를 더한 조합에 브라우저·OS의 기본 바인딩이 있는지는
 * **재지 못했다** — jsdom에는 브라우저 히스토리도 OS 단축키도 없다. `preventDefault`가
 * `Alt`+`←`를 실제로 막는지도 같은 이유로 확인하지 못했다. **재지 못한 것을 근거로
 * 삼지 않으려고 덜 알려진 조합을 골랐고, 그 선택 자체가 잰 것이 아니다.**
 *
 * **들여쓰기 단축키가 있어야 판정 검사에 하중이 생긴다.** 순서 이동·삭제는 판정을
 * 지우고 실행해도 뒤에서 막히지만(`moveNodeOps`가 범위 밖에 `null`, `removeNodeOps`가
 * 루트에 `null`), **들여쓰기는 다르다** — `moveNodeOps`는 설계상 타입을 읽지 않으므로
 * 앞 형제가 자식을 담을 수 없어도 ops를 만들고, 그것이 `children-not-allowed` 문서가
 * 되어 서버로 나간다(실측). 그것을 막는 것은 `structureAbilities.indent` 하나뿐이다.
 *
 * **`Tab`은 빼앗지 않는다.** 들여쓰기 단축키로 쓰고 싶어지는 자리지만, 그러면 키보드
 * 사용자가 트리를 빠져나갈 수 없다(계획서 Task 8 케이스 4).
 */
const SHORTCUTS: {
  match: (event: KeyboardEvent) => boolean
  ability: keyof StructureAbilities
  run: (commands: StructureCommands) => void
}[] = [
  {
    match: (event) => event.key === 'Delete' || event.key === 'Backspace',
    ability: 'remove',
    run: (commands) => commands.remove(),
  },
  {
    match: (event) => event.key === 'ArrowUp' && event.altKey,
    ability: 'moveUp',
    run: (commands) => commands.moveUp(),
  },
  {
    match: (event) => event.key === 'ArrowDown' && event.altKey,
    ability: 'moveDown',
    run: (commands) => commands.moveDown(),
  },
  {
    match: (event) => event.key === 'ArrowLeft' && event.altKey && event.shiftKey,
    ability: 'indent',
    run: (commands) => commands.indent(),
  },
  {
    match: (event) => event.key === 'ArrowRight' && event.altKey && event.shiftKey,
    ability: 'outdent',
    run: (commands) => commands.outdent(),
  },
]

export function StructureTree(props: {
  projectId: string
  pageId: string | undefined
}): ReactElement {
  const store = useEditorStoreInstance()
  // selector를 여러 번 부른다(`use-editor-store.tsx`의 주석 — `(s) => s`는 테스트 전용이다).
  // 문서는 `useOpenDocument`로 받는다 — 스토어의 문서가 **지금 주소의 것**일 때만 그린다.
  const doc = useOpenDocument(props.pageId)
  const selectedNodeId = useEditorStore(store, (s) => s.selectedNodeId)
  // **조작을 여기서 한 번만 만든다.** 툴바에 내려 주고 아래 키 핸들러도 같은 것을 쓴다 —
  // 그것이 D8이 요구하는 "같은 함수"다.
  const commands = useStructureCommands({ projectId: props.projectId, pageId: props.pageId })

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const shortcut = SHORTCUTS.find((candidate) => candidate.match(event))
    if (shortcut === undefined) return

    // **인식한 키만 막는다.** `Tab`은 위 목록에 없으므로 여기 오지 않고, 브라우저의
    // 포커스 이동이 그대로 일어난다.
    event.preventDefault()
    // **버튼과 같은 판정을 지난다**(D8). 키 이벤트는 `disabled`를 지나지 않으므로
    // 여기서 보지 않으면 비활성인 조작이 단축키로만 실행된다.
    if (!commands.abilities[shortcut.ability]) return

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

  return (
    // **키 핸들러가 이 상자에 붙는다 — 전역이 아니다**(D8). 속성 패널에서 타이핑하는
    // 키는 다른 서브트리에서 나므로 여기로 버블되지 않는다. 스타일이 없는 상자라
    // 클래스도 붙이지 않는다: `sticky`인 툴바는 스크롤 조상(`.wb-shell-region`)을 보므로
    // 이 상자가 끼어도 그대로 바닥에 붙는다.
    <div onKeyDown={handleKeyDown}>
      <ul className="wb-shell-structure">
        <StructureNode node={doc.root} selectedNodeId={selectedNodeId} onSelect={store.selectNode} />
      </ul>
      {/* 툴바가 트리 **아래**인 것은 D4다. 스크롤되는 상자 안이라 `sticky`로 바닥에
          붙여 둔다 — 트리가 길어지면 조작 버튼이 화면 밖으로 밀려난다. */}
      <StructureToolbar commands={commands} />
    </div>
  )
}

/**
 * 고를 수 있는 노드인가. **타입이 아니라 런타임 값을 본다** — 렌더러가 모양 가드를 두는
 * 것과 같은 이유다(`packages/renderer/src/render.tsx`): 스토어에 실리는 문서는 P2b-2부터
 * 서버 검증 전의 것이라 일시적으로 타입을 만족하지 않을 수 있다.
 *
 * **노드인지부터 본다.** `children` 배열의 원소가 `null`이면 `node.id`를 읽는 것 자체가
 * 던진다 — 리뷰가 `<App />` 층에서 찾은 자리다. 웨이브 1이 `edit/` 쪽 순회를 고쳤지만
 * 그것으로 덮이지 않는다: **선택이 없는 문서에서는 `structureAbilities`가 불리지도 않고**,
 * 여기가 먼저 그린다.
 */
function isNodeShaped(node: WbNode): boolean {
  return typeof node === 'object' && node !== null && !Array.isArray(node)
}

function isSelectable(node: WbNode): boolean {
  if (typeof node !== 'object' || node === null) return false
  return typeof node.id === 'string' && node.id !== ''
}

/** 노드 한 줄과 그 아래. 트리 자체가 재귀 구조라 컴포넌트도 재귀다. */
function StructureNode(props: {
  node: WbNode
  selectedNodeId: string | null
  onSelect: (nodeId: string) => void
}): ReactElement {
  const { node } = props
  // **모양 가드 둘.** 검증 전 문서(P2b-2)에는 `children`이 배열이 아니거나 `type`이
  // 문자열이 아닌 노드가 들어올 수 있고, 둘 다 렌더 도중 던진다 — 앞은 `.map`이,
  // 뒤는 React가(`Objects are not valid as a React child`). 이쪽에는 캔버스와 달리 오류
  // 경계가 없어서 던지면 **셸 전체가 DOM에서 사라진다**(실측: `type`이 객체인 노드로
  // 재 봤다 — `./node-shape.ts`의 머리말). 지금 막는 것이 이 둘이고, 목록이 완전한지는
  // 재지 못했다.
  const children = Array.isArray(node.children) ? node.children : []
  const typeLabel = nodeTypeLabel(node)

  return (
    <li>
      {/* **id가 없는 노드는 고를 수 없다.** 선택은 id 하나로 오가므로(스토어·캔버스·패널이
          전부 id를 본다), id 없는 노드를 누르면 아무도 가리키지 못하는 값이 스토어에
          들어간다 — 캔버스가 빈 `data-wb-id`를 거르는 것과 같은 이유다. 대신 줄은 그대로
          보여 준다: 캔버스에는 폴백으로 그려져 있는데 트리에서만 사라지면 무엇이 잘못됐는지
          더 알기 어렵다. */}
      {isSelectable(node) ? (
        <button
          type="button"
          className="wb-shell-structure-node"
          // 선택 표시는 `aria-current`가 갖고 색은 CSS가 가져간다 — 보조 기술이 읽는 것과
          // 눈에 보이는 것이 같은 하나에서 갈라져 나와야 둘이 어긋나지 않는다(메뉴 트리의
          // 페이지 링크와 같은 방식).
          //
          // `false`가 아니라 `undefined`인 것은 `aria-current="false"`가 DOM에 남기
          // 때문이다 — 그러면 "표시가 붙은 줄"을 셀 수 없다.
          aria-current={props.selectedNodeId === node.id ? true : undefined}
          onClick={() => props.onSelect(node.id)}
        >
          {typeLabel}
        </button>
      ) : (
        <span className="wb-shell-structure-broken">{typeLabel}</span>
      )}

      {children.length > 0 && (
        <ul className="wb-shell-structure-list">
          {/* **노드가 아닌 원소는 줄로 그리지 않는다.** 그릴 이름도 고를 id도 없고,
              `nodeTypeLabel`이 `node.type`을 읽는 순간 던진다. id 없는 노드(줄은 그린다)와
              다른 것은 그쪽은 **노드이긴 하다**는 점이다. */}
          {children.filter(isNodeShaped).map((child, index) => (
            // 키는 노드 id다. 인덱스를 쓰면 P2b-2가 형제를 넣고 뺄 때 React가 앞 노드의
            // 상태를 다른 노드에 재사용한다. id가 없는 노드에서만 인덱스로 물러선다 —
            // 그 자리에는 쓸 id가 없다.
            <StructureNode
              key={isSelectable(child) ? child.id : `wb-invalid-${index}`}
              node={child}
              selectedNodeId={props.selectedNodeId}
              onSelect={props.onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
