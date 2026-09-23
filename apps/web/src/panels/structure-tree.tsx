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
import type { NodeLock, WbNode } from '@wirebound/schema'
import { useEditorStore, useEditorStoreInstance, useOpenDocument } from '../store/use-editor-store'
import { useLockedBy } from '../store/use-locked-by'
import { nodeTypeLabel } from './node-shape'
import { isTypingSurface } from './typing-surface'
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
 * | `Alt`+`Shift`+`→`·`←` | **들여쓰기**·내어쓰기 | 아래 |
 *
 * **방향은 깊이를 따른다 — `→`가 들여쓰기다.** 들여쓰기는 깊이를 **늘리는** 것이고 LTR에서
 * 오른쪽이 그 방향이다. **앞 판은 반대였고(`←`가 들여쓰기), P2b-4의 메뉴 트리가 계획서대로
 * `→`를 들여쓰기로 만들면서 같은 키가 두 트리에서 반대 일을 하게 됐다**(리뷰가 한 화면에서
 * 양쪽 요청을 재서 잡았다). **P2b-3 계획서·이월·이 파일 어디에도 방향을 고른 근거가 없었다** —
 * 있는 것은 아래의 "왜 `Shift`를 더했나"뿐이다. 그래서 이쪽을 계획서 쪽에 맞췄다.
 * `test/panels/tree-shortcuts.test.tsx`가 두 트리를 한 자리에서 대조한다 — **이 결함이 다시
 * 나는 길은 한쪽만 고치는 것이고**, 그 케이스가 그것을 막는다.
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
  /**
   * 이 조작이 지금 막혔는가. **버튼의 `disabled`와 같은 값을 지나야 한다**(D8) — 키
   * 이벤트는 `disabled`를 지나지 않으므로, 여기서 안 보면 회색인 조작이 단축키로만
   * 실행된다.
   *
   * **불린을 내는 함수인 것이 요점이다.** 앞 판은 `ability: keyof StructureAbilities | null`
   * 이었는데, `null`이 *"판정이 없다"*를 뜻해 **패턴·프리셋이 잠금도 안 봤다**(그 사이
   * 그 둘이 잠긴 자리에 423을 냈다 — `structure-toolbar.tsx`의 `patternLocked`에 실측).
   * 지금은 그 둘도 자기 값을 갖는다.
   *
   * **`StructureAbilities`에 키를 만들지 않은 것은 그대로다 — 재라 #6을 재서 알았다.**
   * 그 표에 `openPattern: true` 같은 키를 더하면 `structureAbilities`가 *"고른 노드가
   * 없다"*에서 내는 `NOTHING`(전부 `false`)에 그 키도 `false`로 들어간다. **그런데 이
   * 둘은 선택이 없어도 되는 조작이다** — 패턴은 선택이 없으면 root의 자식 끝에 꽂고
   * (P7-1 D5), 프리셋은 페이지 통째라 자리를 아예 고르지 않는다. 즉 표에 넣는 순간
   * **정확히 그 상태에서만 단축키가 죽는다.** `WHY_DISABLED`도 절대 보이지 않을 문장을
   * 하나씩 갖게 된다(그 표는 `Record<keyof StructureAbilities, string>`이다).
   */
  blocked: (commands: StructureCommands) => boolean
  run: (commands: StructureCommands) => void
}[] = [
  {
    match: (event) => event.key === 'Delete' || event.key === 'Backspace',
    blocked: (commands) => !commands.abilities.remove,
    run: (commands) => commands.remove(),
  },
  {
    match: (event) => event.key === 'ArrowUp' && event.altKey,
    blocked: (commands) => !commands.abilities.moveUp,
    run: (commands) => commands.moveUp(),
  },
  {
    match: (event) => event.key === 'ArrowDown' && event.altKey,
    blocked: (commands) => !commands.abilities.moveDown,
    run: (commands) => commands.moveDown(),
  },
  {
    match: (event) => event.key === 'ArrowRight' && event.altKey && event.shiftKey,
    blocked: (commands) => !commands.abilities.indent,
    run: (commands) => commands.indent(),
  },
  {
    match: (event) => event.key === 'ArrowLeft' && event.altKey && event.shiftKey,
    blocked: (commands) => !commands.abilities.outdent,
    run: (commands) => commands.outdent(),
  },
  {
    // **`code`를 본다 — `key`가 아니다.** macOS에서 `Alt`(Option)를 누른 채 글자 키를
    // 치면 `event.key`가 그 조합의 **특수문자**가 된다(`Alt`+`P`는 `π`). 지금까지의
    // 단축키가 전부 화살표·`Delete`라 그 축을 만난 적이 없었다. `code`는 물리 키를
    // 가리키므로 그 변환을 지나지 않는다.
    //
    // **jsdom으로는 그 변환을 재현할 수 없다** — `key`도 `code`도 테스트가 직접 넣는
    // 값이다. 그래서 이것은 **잰 것이 아니라 플랫폼 동작을 근거로 고른 것**이고,
    // `Alt`+`Shift` 조합에 브라우저·OS 기본 바인딩이 있는지도 위의 화살표 단축키와 같은
    // 이유로 재지 못했다.
    match: (event) => event.code === 'KeyI' && event.altKey && event.shiftKey,
    blocked: (commands) => commands.patternLocked,
    run: (commands) => commands.openAdd('pattern'),
  },
  {
    // **`I`(넣기)와 `P`(페이지 통째)로 갈랐다.** 둘 다 `P`로 시작하는 낱말이라
    // (Pattern·Preset) 첫 글자로는 못 가른다 — 툴바 라벨이 *"패턴 **넣기**"*이고
    // 프리셋은 **페이지** 통째를 바꾸는 것이라 그 축으로 골랐다.
    match: (event) => event.code === 'KeyP' && event.altKey && event.shiftKey,
    blocked: (commands) => commands.presetLocked,
    run: (commands) => commands.openAdd('preset'),
  },
]

export function StructureTree(props: {
  projectId: string
  pageId: string | undefined
  /**
   * **구조를 고칠 수 있는가** — 셸이 `projectAbilities(role).editDesign`을 넘긴다(이월 M′). `false`면 **툴바와 단축키가
   * 함께 간다** — 메뉴 트리의 `editable`과 같은 이유로 둘을 가르지 않는다(툴바만 빼면 `Delete`·`Alt+↑`가 남는다).
   * **트리 자체는 남는다** — 노드를 고르는 것은 읽기다(속성 · 코멘트를 보려고 고른다). 고른 노드를 잠그지 않는 것은
   * 셸의 `useNodeLock`이 같은 값으로 한다. 이 컴포넌트는 역할을 모른다.
   */
  editable: boolean
}): ReactElement {
  const store = useEditorStoreInstance()
  // selector를 여러 번 부른다(`use-editor-store.tsx`의 주석 — `(s) => s`는 테스트 전용이다).
  // 문서는 `useOpenDocument`로 받는다 — 스토어의 문서가 **지금 주소의 것**일 때만 그린다.
  const doc = useOpenDocument(props.pageId)
  const selectedNodeId = useEditorStore(store, (s) => s.selectedNodeId)
  // **목록을 구독하는 자리가 이 파일 밖으로 나갔다.** 잠금을 봐야 하는 패널이 둘이 되면서
  // (여기와 속성 패널) 형제 둘 중 하나에 둘 수 없어졌다 — 그 사정과 «자리는 여전히 하나»는
  // `store/use-locked-by.ts`가 갖는다. **판정은 그때도 지금도 스토어가 한다**(D7).
  const lockOf = useLockedBy()
  // **선택이 잠금을 거는가**(스토어의 `selectionClaims` — 이월 5차 F4). 값을 안 쓴다 — 바뀌면 다시 그리려고 구독한다.
  // 줄의 `disabled`는 `store.selectionBlockedBy`가 정하고, 그 판정이 이 값을 본다.
  useEditorStore(store, (s) => s.selectionClaims)
  // **조작을 여기서 한 번만 만든다.** 툴바에 내려 주고 아래 키 핸들러도 같은 것을 쓴다 —
  // 그것이 D8이 요구하는 "같은 함수"다.
  const commands = useStructureCommands({
    projectId: props.projectId,
    pageId: props.pageId,
    // **고른 노드의 잠금도 여기서 내려 준다.** 그 값이 하는 일이 둘이다 — 툴바의 판정을
    // 끄고(`structureAbilities`의 셋째 인자), 툴바 아래 상태줄이 *"○○님이 편집 중"*을
    // 그것으로 말한다. 목록을 손에 쥐는 자리는 화면에 하나여야 하고(그 규칙과 근거는
    // `test/lock/one-verdict.test.ts`), 그 하나가 바로 위의 구독이다.
    //
    // **아래 키 핸들러가 같은 값을 지나는 것이 요점이다.** 단축키는 `commands.abilities`를
    // 보므로, 판정이 훅에서 꺼지면 단축키도 함께 꺼진다 — 판정을 이 컴포넌트에서 `disabled`로
    // 겹쳤으면 그렇게 되지 않았다(D8이 툴바와 단축키를 한 묶음으로 둔 이유가 그것이다).
    //
    // **줄에 붙는 배지로는 안 닫히는 자리가 있다.** 배지는 잠금이 가리키는 노드에만
    // 붙는데(아래 `StructureNode`), 막히는 것은 그 **서브트리 전체**다 — 자동 선택된
    // 루트는 문서 안 모든 노드의 조상이라, 남이 아무 노드나 잡으면 루트 줄이
    // `aria-current`인 채 회색이 되고 그 이유는 화면 어디에도 없었다(P10-2 이월).
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

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
    // **고칠 수 없으면 단축키도 없다**(`editable`). 찾기 전에 돌아가므로 `preventDefault`도 안 걸린다 — 방향키 같은 키가
    // 브라우저의 기본 동작(스크롤)을 그대로 갖는다.
    if (!props.editable) return
    // **값을 넣거나 고르는 표면에서 난 키는 구조 조작이 아니다.** 판정과 실측은
    // `./typing-surface.ts`에 있다(그 상자 밖의 패널도 같은 것을 쓸 수 있게 갈라 두었다).
    // **단축키를 찾기 전에** 걸러야 `preventDefault`가 걸리지 않는다 — 걸리면 글자가
    // 지워지지 않는다(그 순서를 뒤집는 변이가 죽는다).
    if (isTypingSurface(event.target)) return

    const shortcut = SHORTCUTS.find((candidate) => candidate.match(event))
    if (shortcut === undefined) return

    // **인식한 키만 막는다.** `Tab`은 위 목록에 없으므로 여기 오지 않고, 브라우저의
    // 포커스 이동이 그대로 일어난다.
    event.preventDefault()
    // **버튼과 같은 판정을 지난다**(D8). 키 이벤트는 `disabled`를 지나지 않으므로
    // 여기서 보지 않으면 비활성인 조작이 단축키로만 실행된다. **남이 잠근 자리도 이 줄이
    // 막는다** — 잠금은 `useStructureCommands`가 넣으므로 여기서 따로 볼 것이 없고,
    // 그것이 아홉 **전부**에 걸린다(앞 판은 일곱뿐이었다).
    // (`test/lock/toolbar-abilities.test.tsx`가 단축키 쪽을 따로 잰다.)
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

  return (
    // **키 핸들러가 이 상자에 붙는다 — 전역이 아니다**(D8). 속성 패널에서 타이핑하는
    // 키는 다른 서브트리에서 나므로 여기로 버블되지 않는다. 스타일이 없는 상자라
    // 클래스도 붙이지 않는다: `sticky`인 툴바는 스크롤 조상(`.wb-shell-region`)을 보므로
    // 이 상자가 끼어도 그대로 바닥에 붙는다.
    <div onKeyDown={handleKeyDown}>
      <ul className="wb-shell-structure">
        <StructureNode
          node={doc.root}
          selectedNodeId={selectedNodeId}
          onSelect={store.selectNode}
          // 판정의 자리는 위 `lockOf` 선언이 갖는다 — 줄과 상태줄이 **같은 값**을 쓴다.
          lockOf={lockOf}
          blockedOf={store.selectionBlockedBy}
        />
      </ul>
      {/* 툴바가 트리 **아래**인 것은 D4다. 스크롤되는 상자 안이라 `sticky`로 바닥에
          붙여 둔다 — 트리가 길어지면 조작 버튼이 화면 밖으로 밀려난다.

          **고칠 수 없으면 DOM 에서 뺀다**(`editable` — 셸의 `canEdit` 표 «동작 입구»). 프리셋 · 패턴 고르개도 툴바 안이라
          함께 간다. */}
      {props.editable && (
        <StructureToolbar
          commands={commands}
          projectId={props.projectId}
          pageId={props.pageId}
          // **문서를 여기서 이미 읽었으므로 그대로 내려 준다**(D7). 툴바가 다시 구독하면
          // 같은 값을 두 번 읽는다. `children`이 배열이 아닌 문서에서는 `null`이다 —
          // 그때 저장할 것이 없고, 고르개의 저장 버튼이 비활성이 된다.
          currentNodes={Array.isArray(doc.root?.children) ? doc.root.children : null}
        />
      )}
    </div>
  )
}

/**
 * 고를 수 있는 노드인가. **타입이 아니라 런타임 값을 본다** — 렌더러가 모양 가드를 두는
 * 것과 같은 이유다(`packages/renderer/src/render.tsx`): 스토어에 실리는 문서는 P2b-2부터
 * 서버 검증 전의 것이라 일시적으로 타입을 만족하지 않을 수 있다.
 *
 * **노드인지부터 본다.** 값이 `null`이면 `node.id`를 읽는 것 자체가 던진다 — 리뷰가
 * `<App />` 층에서 찾은 자리다. 웨이브 1이 `edit/` 쪽 순회를 고쳤지만 그것으로 덮이지
 * 않는다: **선택이 없는 문서에서는 `structureAbilities`가 불리지도 않고**, 여기가 먼저
 * 그린다.
 *
 * **이 검사 자체는 지금 0 사망이다 — 재 봤다.** 자식은 아래 `children.filter(isNodeShaped)`가
 * 먼저 거르고(그 걸러내기는 죽는다 — 지우면 `children 배열 안에 …` 케이스가 죽는다),
 * 루트가 노드가 아닌 문서는 **캔버스·렌더러가 먼저 무너져** 구조 트리까지 오지 않는다
 * (재 봤다: 그런 문서로 열면 `구조 트리` region 자체가 화면에 없다). 그래서 루트 쪽
 * 하중을 케이스로 만들지 못했다 — 두는 것은 걸러내기가 닿지 않는 유일한 경로가 루트라서다.
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
  /** 그 노드를 막는 남의 잠금을 내는 함수(`store/use-locked-by.ts`). 없으면 `null`을 낸다. */
  lockOf: (nodeId: string) => NodeLock | null
  /**
   * 그 노드를 **고르는 것을** 막는 잠금(`store.selectionBlockedBy`). `lockOf`와 갈리는 것은 선택이 잠금을 걸지 않는
   * 사람(viewer)뿐이다 — 그에게는 배지는 서고 줄은 눌린다(이월 5차 F4).
   */
  blockedOf: (nodeId: string) => NodeLock | null
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
  // id가 없는 노드는 잠금과 짝지을 것이 없다 — 아래에서 고를 수도 없다.
  const lock = isSelectable(node) ? props.lockOf(node.id) : null

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
          // **누를 수 없다는 것이 보여야 한다**(§7.2의 *"선택이 차단된다"*). 막는 것 자체는
          // `store.selectNode`가 하고(캔버스도 그 함수를 지난다) 여기 `disabled`는 **왜
          // 안 되는지를 보이는 쪽**이다 — 같은 모양인데 반응만 없으면 고장으로 읽힌다.
          disabled={props.blockedOf(node.id) !== null}
          onClick={() => props.onSelect(node.id)}
        >
          {typeLabel}
        </button>
      ) : (
        <span className="wb-shell-structure-broken">{typeLabel}</span>
      )}

      {/* §7.2의 *"○○ 편집 중"* 배지. **잠금이 가리키는 노드에만 붙는다** — 서브트리 전체가
          막히지만 자손마다 이름을 붙이면 트리가 이름으로 뒤덮이고, 누가 무엇을 잡았는지가
          오히려 안 보인다. **이름은 잠금이 직접 나른다**(`realtime/protocol.ts`의
          `NodeLockView`) — 참가자 목록에서 찾으면 그 목록이 낡은 한 프레임 동안 배지가
          조용히 사라진다(P3-2 이월 §2.5). */}
      {lock !== null && lock.nodeId === node.id && (
        <span className="wb-shell-structure-lock">{lock.userName} 편집 중</span>
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
              lockOf={props.lockOf}
              blockedOf={props.blockedOf}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
