/**
 * **트리 줄의 `+` · `…`** — 두 트리의 툴바를 대신하는 줄 행동(설계서 spec `docs/superpowers/specs/2026-09-30-editor-shell-design.md`
 * 「툴바 대신 노드별 `+` · `…`」). 둘 다 행동 메뉴(`shell/action-menu.tsx`)다.
 *
 * ## 누르면 먼저 그 줄을 고른다
 *
 * 명령(`TreeCommands` · `StructureCommands`)은 **고른 줄**에 대해 돈다 — 키보드 단축키도 같은 명령을 부른다. 그래서 줄의 `+` · `…`를
 * 열면(`ActionMenu` 의 `onOpen`) 그 줄을 먼저 고르고, 항목의 켜고 끔은 고른 뒤의 판정(`treeAbilities` · `structureAbilities`)으로
 * 그린다. 여는 것과 고르는 것이 한 렌더에 묶이므로 목록이 앞 선택의 판정으로 한 번 그려지는 틈이 없다.
 *
 * ## 서는 조건은 CSS 가 갖는다 — 상태를 더하지 않는다
 *
 * 편집할 수 있는 판(`editable`)이면 줄마다 DOM 에 있고, 보이는 것은 줄에 마우스가 올라왔거나 · 줄 안에 포커스가 있거나 · 고른 줄일
 * 때다(`shell.css` 의 `.wb-shell-tree-row`). 그 규칙은 줄이 커스텀 프로퍼티를 켜고 이 상자가 상속받는 꼴이다 — 셸 CSS 는 결합자를
 * 못 쓴다(`shell.css` 머리말 «자손 선택자를 쓰지 않는다»). 안 보이는 동안은 `visibility: hidden` 이라 **Tab 이 그 단추에 서지
 * 않는다** — 줄 단추에 포커스가 오면 줄이 보이게 되고 그때 Tab 이 `+` · `…` 에 닿는다.
 *
 * ## 할 수 없는 항목은 끈다 — 늘 못 하는 항목은 뺀다
 *
 * 판정이 지금 막은 항목은 목록에 남기고 끈다(`aria-disabled` · 마우스를 올리면 이유). **그 줄의 종류가 결코 못 하는 항목은 뺀다** —
 * 페이지의 들여쓰기 · 내어쓰기(`tree-actions.ts` 의 `treeAbilities` 머리말 «페이지의 `indent`·`outdent`가 언제나 불가한 근거»)와
 * 메뉴의 옮기기(소속 메뉴 고르기는 페이지의 것이다 — 메뉴의 부모는 끌어 놓기 · 들여쓰기 · 내어쓰기가 바꾼다). 늘 꺼진 항목은
 * 읽을 때마다 같은 «못 한다»를 한 번 더 말할 뿐이다.
 */
import type { ReactElement } from 'react'
import { ActionMenu, type ActionMenuItem } from '../shell/action-menu'
import type { TreeAbilities } from '../tree/tree-actions'
import type { TreeCommands } from '../tree/use-tree-commands'
import { menuStatus } from './toolbar-status'

/** 줄 행동 한 벌 — `+`(없으면 안 그린다)와 `…`. `name` 은 그 줄의 이름이다(접근 이름이 줄마다 갈리게). */
export function TreeRowActions(props: {
  name: string
  add?: readonly ActionMenuItem[]
  more: readonly ActionMenuItem[]
  /** 열 때 — 그 줄을 고른다(머리말). */
  onOpen: () => void
}): ReactElement {
  return (
    <span className="wb-shell-tree-row-actions">
      {props.add !== undefined && (
        <ActionMenu label={`${props.name} 추가`} glyph="+" items={props.add} onOpen={props.onOpen} compact />
      )}
      <ActionMenu label={`${props.name} 더 보기`} items={props.more} onOpen={props.onOpen} compact />
    </span>
  )
}

/**
 * 메뉴 트리 항목이 꺼졌을 때의 설명. **조건을 그대로 옮긴다** — 판정은 `treeAbilities` 하나가 하고, 여기 있는 것은 «그 항목이
 * 켜지려면 무엇이 필요한가»뿐이다. 왜 지금 막혔는지를 한 문장으로 말하는 것은 트리 아래 상태줄이다(`toolbar-status.ts` 의 `menuStatus`).
 */
const MENU_WHY_DISABLED: Record<keyof TreeAbilities, string> = {
  addMenu: '메뉴를 고르세요',
  addPage: '메뉴를 고르세요',
  rename: '메뉴나 페이지를 고르세요',
  // **두 배열을 다 말한다.** 서버가 자식 메뉴만 있어도, 페이지만 있어도 409를 낸다(`tree/tree-actions.ts`의 `remove` 주석).
  remove: '하위 메뉴와 페이지가 없는 메뉴이거나, 페이지여야 합니다',
  moveUp: '앞에 형제가 있어야 합니다',
  moveDown: '뒤에 형제가 있어야 합니다',
  indent: '앞에 형제 메뉴가 있어야 합니다',
  outdent: '부모 메뉴가 있어야 합니다',
  reparent: '옮길 메뉴가 둘 이상이어야 합니다',
}

/**
 * 항목 하나 — **켜고 끔과 그 이유가 같은 판정 하나(`ability`)에서 나온다.** 조작이 나가 있는 동안(`busy`)은 다 꺼지되 이유를 안
 * 붙인다 — 곧 풀릴 상태에 «메뉴를 고르세요»가 뜨면 거짓말이다(그때 무엇을 하는지는 상태줄이 «보내는 중»으로 말한다).
 */
function menuItem(
  commands: TreeCommands,
  describedBy: string | undefined,
  key: keyof TreeAbilities,
  label: string,
  onSelect: () => void,
  danger = false,
): ActionMenuItem {
  const allowed = commands.abilities[key]
  return {
    key,
    label,
    onSelect,
    disabled: !allowed || commands.busy,
    title: allowed ? undefined : MENU_WHY_DISABLED[key],
    describedBy,
    danger,
  }
}

/**
 * 메뉴 트리 줄의 `+` · `…` 항목(spec 「트리」 표). 페이지 줄에는 `+` 가 없다 — 페이지는 아무것도 담지 않는다.
 *
 * `statusId`는 트리 아래 상태줄의 id 다 — 할 말이 있으면 항목마다 그 줄을 설명으로 든다(`aria-describedby`). **포커스가 항목에 닿는
 * 그 순간**이 사용자가 그 조작을 하려는 때라 그때 한 번 읽힌다. 할 말이 없으면 가리키지 않는다(빈 설명을 읽히지 않게).
 */
export function menuRowItems(
  commands: TreeCommands,
  kind: 'menu' | 'page',
  statusId: string,
): { add?: ActionMenuItem[]; more: ActionMenuItem[] } {
  const describedBy =
    menuStatus({ selection: commands.selection, busy: commands.busy, abilities: commands.abilities }) === ''
      ? undefined
      : statusId
  const item = (key: keyof TreeAbilities, label: string, onSelect: () => void, danger = false): ActionMenuItem =>
    menuItem(commands, describedBy, key, label, onSelect, danger)
  const rename = item('rename', '이름 변경', () => commands.openInput('rename'))
  const up = item('moveUp', '위로', () => commands.move(-1))
  const down = item('moveDown', '아래로', () => commands.move(1))
  const remove = item('remove', '삭제', commands.askRemove, true)

  if (kind === 'page') {
    return { more: [rename, item('reparent', '옮기기', commands.openReparent), up, down, remove] }
  }
  return {
    add: [
      item('addMenu', '하위 메뉴', () => commands.openInput('new-menu')),
      item('addPage', '페이지 추가', () => commands.openInput('new-page')),
    ],
    more: [
      rename,
      up,
      down,
      item('indent', '들여쓰기', commands.indent),
      item('outdent', '내어쓰기', commands.outdent),
      remove,
    ],
  }
}
