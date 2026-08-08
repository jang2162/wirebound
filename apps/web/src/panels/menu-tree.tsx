/**
 * 좌측 상단의 메뉴·페이지 트리. **메뉴와 페이지는 한 트리다**(설계 §9) — 페이지는 항상
 * 어느 메뉴에 속하므로 목록을 둘로 나누지 않는다.
 *
 * 여기서 하는 일은 **트리를 그리고, 주소를 바꾸고, 무엇을 고를지 알리는 것까지다.**
 * 조회·재조회·선택 상태·조작은 전부 `tree/use-tree-commands.tsx`가 갖는다(D10) — 조작이
 * 끝나면 트리를 다시 받아야 하는데(D1), 조회가 이 컴포넌트 안에 있으면 툴바가 그것을 부를
 * 길이 없다. 페이지 문서를 받아 스토어에 싣는 것은 여전히 캔버스 쪽(`routes/editor.tsx`의
 * `CanvasFrame`)이다. 그렇게 가른 이유는 둘이다.
 *
 * 1. 주소가 열린 페이지의 단일 진실이다. 클릭이 직접 문서를 받아 오면 "눌러서 연 페이지"와
 *    "주소로 들어와 열린 페이지"가 서로 다른 경로가 되고, 새로고침·공유 주소가 조용히
 *    다르게 동작한다. 트리는 주소만 바꾸고, 문서는 주소를 보고 받는다 — 경로가 하나다.
 * 2. 한 조회의 실패가 다른 자리를 죽이지 않는다. 트리 조회 실패는 이 상자 안에서,
 *    페이지 조회 실패는 캔버스 안에서 끝난다.
 *
 * **열림과 선택은 다른 것이다**(D3). 열림은 주소가 갖고(`pageId` — `<Link>` +
 * `aria-current="page"`), 선택은 트리 안 상태다(`aria-pressed`). 둘이 같은 값일 때가 많지만
 * 같은 것은 아니다 — 메뉴는 열 수 없고 고르기만 할 수 있다.
 */
import type { KeyboardEvent, ReactElement } from 'react'
import { Link } from 'react-router'
import { SignedOut } from '../api/failure'
import type { TreeMenuNode, TreePage } from '../api/types'
import type { TreeAbilities, TreeSelection } from '../tree/tree-actions'
import { useTreeCommands, type TreeCommands } from '../tree/use-tree-commands'
import { MenuToolbar } from './menu-toolbar'

/**
 * 키보드 단축키(Task 10). **툴바 버튼과 같은 함수를 부른다** — `run`이 `TreeCommands`에서
 * 꺼내 쓰고, `ability`가 버튼의 `disabled`와 같은 판정을 지난다.
 *
 * **표를 `structure-tree.tsx`와 따로 두는 것은 두 트리가 한 화면에 있고 조작이 다르기
 * 때문이다.** 키 자체는 같은 것을 골랐다 — 다만 **같은 키가 같은 방향을 뜻해야 한다**는 것이
 * 요점이다. 앞 판은 근거를 *"다른 키를 외우면 그 자체가 비용이다"*로 적었는데, 같은 키가
 * 반대 일을 하면 **외우는 비용이 아니라 틀리는 비용**이다(리뷰가 실제로 그 상태를 잡았다 —
 * 구조 트리가 `←`를 들여쓰기로 쓰고 있었다). `test/panels/tree-shortcuts.test.tsx`가 두
 * 트리를 한 자리에서 대조한다.
 *
 * | 키 | 조작 | 근거 |
 * |---|---|---|
 * | `Delete`·`Backspace` | 삭제 **확인** | 계획서가 `Delete`를 정했다. `Backspace`를 함께 받는 것은 macOS 노트북 키보드에 forward delete 키가 없기 때문이다(구조 트리와 같은 근거) |
 * | `Alt`+`↑`·`↓` | 순서 이동 | 계획서가 정했다 |
 * | `Alt`+`Shift`+`→`·`←` | **들여쓰기**·내어쓰기 | 방향은 깊이를 따른다 — 들여쓰기가 깊이를 늘리고 LTR에서 `→`가 그 방향이다. `Alt`+`←`·`→`가 Windows·Linux 브라우저의 뒤로/앞으로라 `Shift`를 더했고 **그 조합에 기본 바인딩이 있는지는 재지 못했다** |
 *
 * **`Delete`가 지우지 않고 확인을 거는 것이 D7이다.** 키 하나로 사라지면 되돌릴 길이 없다.
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
export function MenuTree(props: { projectId: string; pageId: string | undefined }): ReactElement {
  // **훅을 부르는 자리는 여기 하나다**(D2의 전제). 툴바는 결과를 prop으로 받는다 —
  // 두 번째 호출자가 생기면 `busy` 잠금이 각자 것이 된다.
  const commands = useTreeCommands(props)
  const { state } = commands

  /**
   * 단축키를 받는다. **상자에 붙이지 전역이 아니다** — 다른 패널에서 타이핑하는 키는 다른
   * 서브트리에서 나므로 여기로 버블되지 않는다(`structure-tree.tsx`와 같은 형태).
   *
   * **입력이 열려 있으면 아예 지나간다.** 구조 트리에는 인라인 입력이 없어 그 파일이 이
   * 상황을 다루지 않는데, 여기서는 입력이 이 상자 **안**에 있어 거기서 친 키가 버블되어
   * 온다(재 봤다: 그 가드가 없으면 제목에 친 `Backspace`가 삭제 확인을 건다). 소속 메뉴
   * 목록도 같은 자리라 함께 본다.
   *
   * **잠금을 여기서 겹으로 보지 않는다** — 판정이 두 벌이 되는 것이 D5가 막으려는 것이다.
   * 잠금은 각 조작이 스스로 본다: 요청을 내는 것은 `run` 안의 `inFlight`가, **"여는" 것
   * (`openInput`·`openReparent`·`askRemove`)은 각자의 `inFlight` 가드**가 잡는다.
   *
   * **앞 판은 여기 "잠금은 `run` 안의 `inFlight`가 잡으므로"라고만 적었고 그것이 `askRemove`
   * 자리에서 거짓이었다** — 그 함수는 `run`을 지나지 않아 가드가 없었고, `busy` 중 `Delete`가
   * 건 확인이 잠금 해제 뒤까지 살아남았다(리뷰가 잡았고 재현했다).
   */
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>): void {
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

  if (state.status === 'loading') {
    return (
      <p className="wb-shell-tree-notice" role="status">
        불러오는 중…
      </p>
    )
  }

  if (state.status === 'failed') {
    // 세션이 끊긴 것은 이 상자 안에서 끝낼 수 없는 실패다 — 트리만 오류 문장을 내고
    // 사용자는 셸 안에 갇힌다. 나머지 이유는 지금대로 서버 문장을 이 자리에 그린다.
    if (state.failure.kind === 'signed-out') return <SignedOut />

    return (
      <p className="wb-shell-tree-notice" role="alert">
        {state.failure.message}
      </p>
    )
  }

  return (
    // **키 핸들러가 이 상자에 붙는다.** 트리와 툴바를 함께 감싸므로 어느 쪽에 포커스가
    // 있어도 단축키가 닿는다. 스타일이 없는 상자라 클래스는 테스트가 집을 이름 하나뿐이다.
    <div className="wb-shell-tree-keys" onKeyDown={handleKeyDown}>
      {/* **조작 실패는 트리 안에 낸다(D9).** `shell/edit-alert.tsx`와 섞지 않는 것은 그것이
          편집 파이프라인의 상태를 읽기 때문이다 — CRUD 실패는 그 상태와 무관하므로 섞으면
          서로 다른 두 실패가 한 문장 자리를 다툰다.

          **세션 끊김만 갈라 낸다.** 그 판정은 `api/failure.tsx`가 갖고(D5) 여기서 다시
          하지 않는다 — 조회 실패가 위에서 같은 규칙을 쓰는 것과 같은 자리다. */}
      {commands.failure !== null &&
        (commands.failure.kind === 'signed-out' ? (
          <SignedOut />
        ) : (
          <p className="wb-shell-tree-notice" role="alert">
            {commands.failure.message}
          </p>
        ))}
      <ul className="wb-shell-tree">
        {byOrder(state.menu).map((node) => (
          // 키는 노드 id다. 인덱스를 쓰면 정렬이 바뀔 때 React가 앞 노드의 상태를 다른
          // 노드에 재사용한다.
          //
          // **앞 판의 주석은 "P2b-2에서 트리를 다시 받거나 순서를 편집하게 되면 그때
          // 케이스와 함께 지켜야 한다"고 예언했다. 이 웨이브가 트리를 다시 받게 됐으므로
          // 다시 쟀는데 — 아직 참이 아니다.** 세 자리(여기·페이지·자식 메뉴)를 전부
          // 인덱스로 바꿔도 `--project web` 전량이 통과한다(0 사망. Task 3 시점, 재조회가
          // 붙은 Task 4 뒤, 삭제까지 붙은 Task 6 뒤 세 번 쟀고 셋 다 0이었다).
          //
          // **덮고 있는 것은 "트리 항목이 로컬 상태를 갖지 않는다"이다** — `MenuItem`·
          // `PageLink`에 `useState`·`useRef`가 0건이라(재 봤다) 키가 어긋나도 재사용될
          // 상태 자체가 없다. 선택은 훅이 id로 들고 있어 트리 밖이다.
          //
          // 그러므로 예언이 참이 되는 조건은 "트리를 다시 받는 것"이 아니라 **항목이
          // 자기 상태를 갖는 것**이다(펼침/접힘, 인라인 편집을 줄 안으로 옮기는 것 따위).
          // 그날이 오면 이 주석이 아니라 케이스가 지켜야 한다.
          <MenuItem
            key={node.id}
            node={node}
            projectId={props.projectId}
            pageId={props.pageId}
            commands={commands}
          />
        ))}
      </ul>
      {/* 툴바가 트리 **아래**인 것은 `StructureToolbar`와 같은 자리 규칙이다. */}
      <MenuToolbar commands={commands} />
    </div>
  )
}

/**
 * 메뉴 하나와 그 안의 것들. 자기 페이지를 먼저, 그다음 자식 메뉴를 품는다 — 둘은 각각
 * 자기 `sortOrder` 눈금을 갖고 있어(서버가 배열을 따로 준다) 하나로 섞어 정렬할 수 없다.
 *
 * **그 그리는 순서가 `tree-actions.ts`의 판정 근거이기도 하다** — 페이지의 앞 형제는 항상
 * 페이지이므로 페이지는 들여쓸 수 없다(D5).
 */
function MenuItem(props: {
  node: TreeMenuNode
  projectId: string
  pageId: string | undefined
  commands: TreeCommands
}): ReactElement {
  const { node, projectId, pageId, commands } = props
  const pages = byOrder(node.pages)
  const children = byOrder(node.children)
  const picked = isPicked(commands.selection, { kind: 'menu', id: node.id })

  return (
    <li>
      {/* **메뉴 제목은 누를 수 있다 — 누르는 것은 "여는 것"이 아니라 "가리키는 것"이다**(D4).
          메뉴에는 열 문서가 없지만(설계 §9의 트리에서 문서를 가진 것은 페이지뿐이다) 고르는
          효과가 실재한다: 툴바가 그 메뉴에 작동하게 된다. 앞 판의 주석은 "누를 수 있게
          보이는 것은 그 자체로 거짓말이다"였는데 그 문장은 **누르는 것 = 여는 것**을
          전제했고, 이 단계가 그 전제를 바꿨다.

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
        onClick={() => commands.select({ kind: 'menu', id: node.id })}
      >
        {node.title}
      </button>

      {(pages.length > 0 || children.length > 0) && (
        <ul className="wb-shell-tree-list">
          {/* 여기 두 자리의 키도 인덱스가 아니라 id다 — 이유와 실측은 `MenuTree`의 키
              주석에 있다. */}
          {pages.map((page) => (
            <li key={page.id}>
              <PageLink page={page} projectId={projectId} pageId={pageId} commands={commands} />
            </li>
          ))}
          {children.map((child) => (
            <MenuItem
              key={child.id}
              node={child}
              projectId={projectId}
              pageId={pageId}
              commands={commands}
            />
          ))}
        </ul>
      )}
    </li>
  )
}

/**
 * 페이지 한 줄. 버튼이 아니라 링크인 것은 주소가 있는 이동이기 때문이다 — 새 탭으로
 * 열거나 주소를 공유할 수 있어야 한다(`project-list.tsx`와 같은 이유). **그 근거는 D4에서도
 * 그대로 참이라 메뉴와 달리 바뀌지 않았다.**
 */
function PageLink(props: {
  page: TreePage
  projectId: string
  pageId: string | undefined
  commands: TreeCommands
}): ReactElement {
  const selected = props.page.id === props.pageId

  return (
    <Link
      className="wb-shell-tree-page"
      to={`/projects/${props.projectId}/pages/${props.page.id}`}
      // 선택은 **주소에서 나온다.** 누른 것을 따로 기억하면 새로고침·뒤로 가기에서
      // 표시와 실제로 열린 페이지가 어긋난다.
      //
      // `false`가 아니라 `undefined`인 것은 `aria-current="false"`가 DOM에 남기
      // 때문이다 — 그러면 "표시가 붙은 줄"을 속성으로 셀 수 없다.
      aria-current={selected ? 'page' : undefined}
      // **메뉴 선택을 푼다**(D3). 주소가 그 페이지를 말하므로 상태로 또 적지 않는다 —
      // 풀지 않으면 주소는 페이지인데 툴바는 메뉴에 작동하는 상태가 남는다.
      onClick={() => props.commands.select(null)}
    >
      {props.page.title}
    </Link>
  )
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
