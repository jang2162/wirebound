/**
 * 메뉴 트리 하단의 조작 툴바(P2b-4). **선택 하나에 작동한다** — 메뉴 또는 페이지다.
 *
 * **판정은 여기 없다.** 무엇을 할 수 있는지는 `tree/tree-actions.ts`의 `treeAbilities`가
 * 정하고(D5), 이 파일은 그 결과로 `disabled`를 걸 뿐이다. `StructureToolbar`와 같은 분리다 —
 * 판정이 컴포넌트 안으로 들어오면 케이스가 화면을 지나야만 재지고, 다음 웨이브의 키보드
 * 단축키가 자기 조건을 따로 갖게 된다.
 *
 * **이 파일은 오류 경계 밖이다** — 메뉴 트리와 같은 자리다. `apps/web/src` 전체에서 오류
 * 경계는 캔버스의 `CanvasBoundary` 하나뿐이라(웨이브 1이 셌다), 던지면 `.wb-shell`이 통째로
 * DOM에서 사라진다. 여기서 부르는 것들은 값으로 답해야 한다.
 */
import type { KeyboardEvent, ReactElement } from 'react'
import type { TreeAbilities } from '../tree/tree-actions'
import type { TreeCommands } from '../tree/use-tree-commands'
import { MenuPicker } from './menu-picker'
import { TreeInput } from './tree-input'

/**
 * 버튼이 비활성일 때 붙는 설명.
 *
 * **문안을 지어내지 않고 조건을 그대로 옮겼다.** 상태별로 다른 문장을 만들지 않는 것은 그
 * 갈래가 곧 판정의 두 번째 벌이 되기 때문이다 — 판정은 `treeAbilities` 하나가 하고(D5),
 * 여기 있는 것은 "그 버튼이 활성이려면 무엇이 필요한가"뿐이다.
 *
 * **`title`의 한계는 재지 못했다** — `StructureToolbar`와 같다. 비활성 버튼은 포커스를 받지
 * 못하므로 보조 기술이 이 설명에 닿는지는 브라우저·리더 조합에 달려 있고 jsdom으로는 잴 수 없다.
 */
const WHY_DISABLED: Record<keyof TreeAbilities, string> = {
  addMenu: '메뉴를 고르세요',
  addPage: '메뉴를 고르세요',
  rename: '메뉴나 페이지를 고르세요',
  // **두 배열을 다 말한다.** 서버가 자식 메뉴만 있어도, 페이지만 있어도 409를 낸다
  // (웨이브 1 실측 — `tree/tree-actions.ts`의 `remove` 주석).
  remove: '하위 메뉴와 페이지가 없는 메뉴이거나, 페이지여야 합니다',
  moveUp: '앞에 형제가 있어야 합니다',
  moveDown: '뒤에 형제가 있어야 합니다',
  indent: '앞에 형제 메뉴가 있어야 합니다',
  outdent: '부모 메뉴가 있어야 합니다',
  reparent: '옮길 메뉴가 둘 이상이어야 합니다',
}

/**
 * 툴바. **판정도 조작도 갖지 않는다** — `useTreeCommands`가 준 것을 그릴 뿐이다.
 *
 * **조작 아홉이 전부 여기 있다.** 판정(`treeAbilities`)의 아홉과 짝이 맞는다.
 */
export function MenuToolbar(props: { commands: TreeCommands }): ReactElement {
  const { commands } = props

  return (
    <div className="wb-shell-menu-toolbar" role="group" aria-label="메뉴 편집">
      <ToolButton
        label="하위 메뉴"
        ability="addMenu"
        commands={commands}
        onClick={() => commands.openInput('new-menu')}
      />
      <ToolButton
        label="페이지 추가"
        ability="addPage"
        commands={commands}
        onClick={() => commands.openInput('new-page')}
      />
      <ToolButton
        label="이름 변경"
        ability="rename"
        commands={commands}
        onClick={() => commands.openInput('rename')}
      />
      {/* **삭제만 버튼 이름이 상태에 따라 바뀐다**(D7). 확인이 같은 버튼 안에서 끝나므로
          포커스가 움직이지 않는다 — 모달을 쓰지 않은 근거가 그것이다.

          **Esc를 이 버튼에서 받는다** — 전역 리스너를 두지 않는 것은 그것이 다른 패널의
          Esc까지 가로채기 때문이다.

          **그래서 이 취소는 "포커스가 이 버튼에 있다"를 전제한다. 그 전제는 이 저장소에서
          검증되지 않는다 — 재고 적는다.** 앞 판은 *"확인이 걸린 동안 포커스가 여기 있으므로
          (방금 눌렀다)"*라고 적었는데, 이 저장소는 `userEvent`를 0건 쓰고 `fireEvent`만
          쓰며 **`fireEvent.click`은 포커스를 옮기지 않는다**(실측: 클릭 뒤
          `document.activeElement`가 이 버튼이 아니고, 포커스를 밖에 둔 채 문서에 Escape를
          보내면 확인이 풀리지 않는다). **실제 브라우저의 클릭이 버튼에 포커스를 주는지는
          재지 못했다** — 브라우저·OS에 따라 갈린다고 알려져 있지만 그것도 잰 것이 아니다
          (`structure-toolbar.tsx`의 `title` 한계 주석과 같은 형식이다).

          케이스 둘이 그 두 쪽을 각각 값으로 고정한다: `버튼에 포커스가 있을 때 Esc로 확인이
          풀린다`와 `포커스가 버튼 밖이면 Esc가 닿지 않는다`. D7의 나머지 두 취소 조건
          (선택 변경·다른 조작)은 이 전제를 갖지 않는다. */}
      <ToolButton
        label={commands.confirmingRemove ? REMOVE_CONFIRM_LABEL : REMOVE_LABEL}
        ability="remove"
        commands={commands}
        onClick={commands.confirmingRemove ? commands.confirmRemove : commands.askRemove}
        onKeyDown={(event) => {
          if (commands.confirmingRemove && event.key === 'Escape') {
            event.preventDefault()
            commands.cancelRemove()
          }
        }}
      />

      <ToolButton
        label="위로"
        ability="moveUp"
        commands={commands}
        onClick={() => commands.move(-1)}
      />
      <ToolButton
        label="아래로"
        ability="moveDown"
        commands={commands}
        onClick={() => commands.move(1)}
      />

      <ToolButton
        label="들여쓰기"
        ability="indent"
        commands={commands}
        onClick={commands.indent}
      />
      <ToolButton
        label="내어쓰기"
        ability="outdent"
        commands={commands}
        onClick={commands.outdent}
      />

      <ToolButton
        label="옮기기"
        ability="reparent"
        commands={commands}
        onClick={commands.openReparent}
      />

      {/* 입력은 툴바 **안**에 있다 — 조작 묶음과 같은 자리라야 어느 항목에 붙는 작업인지가
          보인다. 닫혀 있을 때는 DOM에 없다: 남겨 두면 Tab 순서에 정지점이 그대로 남는다
          (`StructureToolbar`가 `TypePicker`에 쓴 것과 같은 근거). */}
      {commands.reparenting !== null && (
        <MenuPicker
          options={commands.reparenting}
          onPick={commands.reparentTo}
          onCancel={commands.cancelReparent}
        />
      )}
      {commands.editing !== null && (
        <TreeInput
          // **용도가 바뀌면 새 인스턴스를 마운트한다.** 같은 자리에 남겨 두면 앞 용도의
          // 값이 남는다 — `key`가 그것을 갈라 준다.
          key={commands.editing.kind}
          label={INPUT_LABEL}
          initial={commands.editing.initial}
          onSubmit={commands.submitInput}
          onCancel={commands.cancelInput}
        />
      )}
    </div>
  )
}

/** 인라인 입력의 라벨. 용도가 여럿이지만 입력은 하나다(D6). */
const INPUT_LABEL = '이름'

/** 삭제 버튼의 두 얼굴(D7). 확인이 걸리면 이름이 바뀌고, 한 번 더 눌러야 나간다. */
const REMOVE_LABEL = '삭제'
const REMOVE_CONFIRM_LABEL = '정말 삭제합니까?'

/**
 * 버튼 하나. **비활성 여부와 그 이유가 같은 하나(`ability`)에서 나온다** — 둘을 따로
 * 넘기면 어긋나는 자리가 생긴다(`StructureToolbar`의 `ToolButton`과 같은 방식).
 *
 * **`busy`도 여기서 함께 본다**(D2). 조작이 나가 있는 동안 툴바 전체가 비활성이라, 각
 * 버튼이 자기 조건에 그것을 더하는 대신 한 자리에서 곱한다.
 */
function ToolButton(props: {
  label: string
  ability: keyof TreeAbilities
  commands: TreeCommands
  onClick: () => void
  onKeyDown?: (event: KeyboardEvent<HTMLButtonElement>) => void
}): ReactElement {
  const allowed = props.commands.abilities[props.ability]
  const enabled = allowed && !props.commands.busy

  return (
    <button
      type="button"
      className="wb-shell-menu-tool"
      disabled={!enabled}
      // 활성일 때 설명을 남기지 않는다 — 버튼 이름과 겹쳐 읽힌다. **`busy`로 꺼진 것은
      // 판정과 다른 이유이므로 판정 문안을 붙이지 않는다**: 곧 풀릴 상태에 "메뉴를
      // 고르세요"가 뜨면 거짓말이다.
      title={allowed ? '' : WHY_DISABLED[props.ability]}
      onClick={props.onClick}
      onKeyDown={props.onKeyDown}
    >
      {props.label}
    </button>
  )
}
