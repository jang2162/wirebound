/**
 * **트리 줄의 `+` · `…`** — 두 트리의 툴바를 대신하는 줄 행동(설계서 spec `docs/superpowers/specs/2026-09-30-editor-shell-design.md`
 * 「툴바 대신 노드별 `+` · `…`」). 둘 다 행동 메뉴(`shell/action-menu.tsx`)다. **구조 트리 줄에는 `+`가 없다** — 노드를 넣는 입구는 하단 판이다
 * (설계 spec `2026-10-18-modules-states-layout-design.md` 「B1」). `+`는 메뉴 트리 줄의 것이다.
 *
 * ## 누르면 먼저 그 줄을 고른다
 *
 * 명령(`TreeCommands` · `StructureCommands`)은 **고른 줄**에 대해 돈다 — 키보드 단축키도 같은 명령을 부른다. 그래서 줄의 `+` · `…`를
 * 열면(`ActionMenu` 의 `onOpen`) 그 줄을 먼저 고르고, 항목의 켜고 끔은 고른 뒤의 판정(`treeAbilities` · `structureAbilities`)으로
 * 그린다. 여는 것과 고르는 것이 한 렌더에 묶이므로 목록이 앞 선택의 판정으로 한 번 그려지는 틈이 없다. **열린 뒤 그 줄이 고른 줄이 아니게
 * 되면 메뉴를 닫는다**(`picked` → `ActionMenu` 의 `openWhile` — 그 머리말 «고른 대상이 바뀌면 닫는다»). 구조 트리는 노드를 여럿 고를 수
 * 있어 «고른 줄»이 **기준 노드**의 줄이고, 연 뒤 **고른 목록**이 바뀌어도 닫는다(`selection` — 여럿을 고른 판의 «삭제»는 고른 것 전부를
 * 지운다 — 연 때의 목록이 아니게 되면 그 항목이 무엇을 지울지가 바뀐다).
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
 * 판정이 지금 막은 항목은 목록에 남기고 끈다(`aria-disabled` · 이유는 `title` · `aria-description` — `./toolbar-status.ts` 머리말). **그 줄의
 * 종류가 결코 못 하는 항목은 뺀다** —
 * 페이지의 들여쓰기 · 내어쓰기(`tree-actions.ts` 의 `treeAbilities` 머리말 «페이지의 `indent`·`outdent`가 언제나 불가한 근거»)와
 * 메뉴의 옮기기(소속 메뉴 고르기는 페이지의 것이다 — 메뉴의 부모는 끌어 놓기 · 들여쓰기 · 내어쓰기가 바꾼다). 늘 꺼진 항목은
 * 읽을 때마다 같은 «못 한다»를 한 번 더 말할 뿐이다.
 */
import type { LucideIcon } from 'lucide-react'
import { useEffect, useState, type ReactElement } from 'react'
import type { StructureAbilities } from '../edit/structure-actions'
import { ActionMenu, type ActionMenuItem } from '../shell/action-menu'
import { ICONS } from '../shell/icons'
import type { TreeAbilities } from '../tree/tree-actions'
import type { TreeCommands } from '../tree/use-tree-commands'
import type { StructureCommands } from './structure-toolbar'
import { EXPORT_BUSY_REASON, menuItemReason } from './toolbar-status'

/** 줄 행동 한 벌 — `+` · `…`(없으면 안 그린다). `name` 은 그 줄의 이름이다(접근 이름이 줄마다 갈리게). */
/** 연 누름이 줄을 고른 뒤의 목록을 기다린다(`TreeRowActions`의 `openedWith`). */
const PENDING: unique symbol = Symbol('pending')

export function TreeRowActions(props: {
  name: string
  add?: readonly ActionMenuItem[]
  more?: readonly ActionMenuItem[]
  /** 열 때 — 그 줄을 고른다(머리말). */
  onOpen: () => void
  /** 그 줄이 고른 줄(구조 트리는 기준 노드)인가 — 열린 뒤 거짓이 되면 메뉴를 닫는다(머리말). */
  picked: boolean
  /**
   * 고른 목록을 글자 하나로(구조 트리 — 여러 노드 선택). 주면 **연 뒤 이 값이 바뀌어도 닫는다** — 기준 노드는 그대로인데 목록이 늘거나
   * 준 판(Cmd 클릭 · Cmd+A · 남의 편집)이다. 연 렌더의 값을 이펙트에서 붙잡는다(여는 누름이 그 줄을 고른 뒤의 값이다).
   */
  selection?: string
}): ReactElement {
  /**
   * 연 때의 목록. 이미 고른 줄이면 그 자리에서 붙잡고, 아니면 여는 누름이 그 줄을 고른 **뒤**의 값을 다음 렌더의 이펙트에서 붙잡는다(`PENDING`
   * — 고르기가 목록을 바꾸므로 그 렌더는 꼭 온다). `null`이면 견주지 않는다(`selection`을 안 준 메뉴 트리 · 아직 안 연 메뉴).
   */
  const [openedWith, setOpenedWith] = useState<string | typeof PENDING | null>(null)
  useEffect(() => {
    if (openedWith === PENDING) setOpenedWith(props.selection ?? null)
  })
  const onOpen = (): void => {
    setOpenedWith(props.picked ? (props.selection ?? null) : PENDING)
    props.onOpen()
  }
  const live = props.picked && (openedWith === null || openedWith === PENDING || openedWith === (props.selection ?? null))
  return (
    <span className="wb-shell-tree-row-actions">
      {props.add !== undefined && (
        <ActionMenu label={`${props.name} 추가`} icon={ICONS.add} items={props.add} onOpen={onOpen} openWhile={live} compact />
      )}
      {props.more !== undefined && (
        <ActionMenu label={`${props.name} 더 보기`} items={props.more} onOpen={onOpen} openWhile={live} compact />
      )}
    </span>
  )
}

/**
 * 메뉴 트리 항목이 꺼졌을 때의 설명. **조건을 그대로 옮긴다** — 판정은 `treeAbilities` 하나가 하고, 여기 있는 것은 «그 항목이
 * 켜지려면 무엇이 필요한가»뿐이다. 그보다 먼저 서는 원인(보내는 중 · 트리에 없다)은 `./toolbar-status.ts` 의 `menuItemReason`이 이 표 위에
 * 세운다.
 */
export const MENU_WHY_DISABLED: Record<keyof TreeAbilities, string> = {
  addMenu: '메뉴를 고르세요',
  addPage: '메뉴를 고르세요',
  rename: '메뉴나 페이지를 고르세요',
  // 찾은 메뉴 · 페이지는 늘 지울 수 있다 — 하위가 있는 메뉴는 확인 상자가 연쇄로 보낸다(`tree/tree-actions.ts`의 `treeAbilities`).
  remove: '메뉴나 페이지를 고르세요',
  moveUp: '앞에 형제가 있어야 합니다',
  moveDown: '뒤에 형제가 있어야 합니다',
  indent: '앞에 형제 메뉴가 있어야 합니다',
  outdent: '부모 메뉴가 있어야 합니다',
  reparent: '옮길 메뉴가 둘 이상이어야 합니다',
}

/**
 * 항목 하나 — **켜고 끔과 그 이유가 같은 판정 하나(`ability`)에서 나온다.** 조작이 나가 있는 동안(`busy`)은 판정과 무관하게 다 꺼지고
 * 이유가 «보내는 중»이다 — 곧 풀릴 상태에 «메뉴를 고르세요»가 뜨면 거짓말이다(`menuItemReason`). 이유는 `title` 과 `aria-description` 에
 * 같은 문장으로 든다(`./toolbar-status.ts` 머리말).
 *
 * `key`는 판정과 따로 받는다 — 판정 하나에 항목이 둘일 수 있다(`addPage` — «페이지 추가» · «JSON 에서 가져오기…»).
 */
function menuItem(
  commands: TreeCommands,
  ability: keyof TreeAbilities,
  entry: { key?: string; label: string; onSelect: () => void; danger?: boolean; icon: LucideIcon },
): ActionMenuItem {
  const reason = menuItemReason({ selection: commands.selection, busy: commands.busy, abilities: commands.abilities }, ability)
  return {
    key: entry.key ?? ability,
    label: entry.label,
    onSelect: entry.onSelect,
    disabled: !commands.abilities[ability] || commands.busy,
    title: reason,
    description: reason,
    danger: entry.danger ?? false,
    icon: entry.icon,
  }
}

/** 페이지 줄 `…`의 «JSON 내보내기» — 그 줄의 페이지를 낸다(`panels/page-json-export.ts`). */
export interface PageExportEntry {
  run: () => void
  /** 내보내기가 나가 있다(어느 줄의 것이든) — 한 번에 하나다. */
  busy: boolean
}

/**
 * 메뉴 트리 줄의 `+` · `…` 항목(spec 「트리」 표). 페이지 줄에는 `+` 가 없다 — 페이지는 아무것도 담지 않는다.
 *
 * **페이지 JSON 의 두 입구가 여기 있다**(설계서 「페이지 JSON」). 메뉴 `+`의 «JSON 에서 가져오기…»는 그 메뉴 밑에 새 페이지를 만드는
 * 상자를 연다(`TreeCommands.openImport` — 판정은 «페이지 추가»와 같은 `addPage`다. 가져오기도 페이지를 만드는 것이다). 페이지 `…`의
 * «JSON 내보내기»는 **그 줄의** 페이지를 파일로 낸다 — 읽기라 트리 판정 · 트리 조작의 잠금(`busy`)을 안 보고 제 내보내기만 기다린다.
 * 둘 다 편집 모드에서만 있다 — 줄 행동이 편집 모드에서만 서므로(`menu-tree.tsx`의 `editable`).
 */
export function menuRowItems(
  commands: TreeCommands,
  kind: 'menu' | 'page',
  exportEntry?: PageExportEntry,
): { add?: ActionMenuItem[]; more: ActionMenuItem[] } {
  const item = (key: keyof TreeAbilities, label: string, icon: LucideIcon, onSelect: () => void, danger = false): ActionMenuItem =>
    menuItem(commands, key, { label, onSelect, danger, icon })
  const rename = item('rename', '이름 변경', ICONS.rename, () => commands.openInput('rename'))
  const up = item('moveUp', '위로', ICONS.moveUp, () => commands.move(-1))
  const down = item('moveDown', '아래로', ICONS.moveDown, () => commands.move(1))
  const remove = item('remove', '삭제', ICONS.remove, commands.askRemove, true)

  if (kind === 'page') {
    const exported: ActionMenuItem[] =
      exportEntry === undefined
        ? []
        : [
            {
              key: 'export-json',
              label: 'JSON 내보내기',
              icon: ICONS.exportJson,
              onSelect: exportEntry.run,
              disabled: exportEntry.busy,
              title: exportEntry.busy ? EXPORT_BUSY_REASON : undefined,
              description: exportEntry.busy ? EXPORT_BUSY_REASON : undefined,
            },
          ]
    return {
      more: [rename, item('reparent', '옮기기', ICONS.reparent, commands.openReparent), up, down, ...exported, remove],
    }
  }
  return {
    add: [
      item('addMenu', '하위 메뉴', ICONS.addMenu, () => commands.openInput('new-menu')),
      item('addPage', '페이지 추가', ICONS.addPage, () => commands.openInput('new-page')),
      menuItem(commands, 'addPage', {
        key: 'import-json',
        label: 'JSON 에서 가져오기…',
        onSelect: commands.openImport,
        icon: ICONS.importJson,
      }),
    ],
    more: [
      rename,
      up,
      down,
      item('indent', '들여쓰기', ICONS.indent, commands.indent),
      item('outdent', '내어쓰기', ICONS.outdent, commands.outdent),
      remove,
    ],
  }
}

/**
 * 구조 트리 항목이 꺼졌을 때의 설명 — `MENU_WHY_DISABLED`와 같은 규칙(조건을 그대로 옮긴다 · 그보다 먼저 서는 원인 — 잠금 · 고른 것 없음 ·
 * 여럿 · 문서에 없음 — 은 `./toolbar-status.ts` 의 `structureItemReason`이 이 표 위에 세운다). 컴포넌트 목록 카드의 «넣기» 단추가 «자식을 안
 * 받는 자리» 에서 `addInside` 문장을 그대로 쓴다(`palette/palette-add.ts`). «안에 추가» · «아래 추가» 항목은 걷었다 — 판정(`addInside` ·
 * `addAfter`)과 그 문장은 하단 판의 넣기 · 붙여넣기 · 복제가 쓴다.
 */
export const STRUCTURE_WHY_DISABLED: Record<keyof StructureAbilities, string> = {
  // **조건 둘을 다 말한다.** `acceptsChildren`은 카탈로그의 `many` 여부만이 아니라
  // 문서의 `children`이 배열인지도 본다 — 앞엣것만 적으면 `Card`인데 꺼진 자리에서
  // 사용자가 이유를 알 수 없다.
  addInside: '자식을 담을 수 있는 타입이어야 하고, children이 배열이어야 합니다',
  addAfter: '루트가 아닌 노드를 고르세요',
  remove: '루트가 아닌 노드를 고르세요',
  moveUp: '앞에 형제가 있는 노드를 고르세요',
  moveDown: '뒤에 형제가 있는 노드를 고르세요',
  indent: '앞 형제가 자식을 담을 수 있어야 합니다',
  outdent: '부모가 루트가 아니어야 합니다',
}

/** 구조 트리 줄 `…` 의 «모듈로 저장…» 항목 이름. */
export const SAVE_MODULE_LABEL = '모듈로 저장…'

/**
 * «모듈로 저장…» 항목 — 편집할 수 있는 판(`structureRowItems`)과 편집할 수 없는 판의 한 항목(`panels/structure-tree.tsx` 의 `saveOnly`)이 같은
 * 것을 쓴다. 끄지 않는다 — 문서 읽기라 잠금과 무관하다(아래 머리말).
 */
export function saveModuleItem(onSelect: () => void): ActionMenuItem {
  return { key: 'save-module', label: SAVE_MODULE_LABEL, icon: ICONS.saveModule, onSelect }
}

/**
 * 구조 트리 줄의 `…` 항목(spec 「트리」 표 — `…` 별칭 바꾸기 · 모듈로 저장… · 위로 · 아래로 · 들여쓰기 · 내어쓰기 · 삭제). `+`는 없다(머리말).
 *
 * **«모듈로 저장…»은 뿌리 줄에 없다** — 뿌리는 모듈에 담을 수 없다(설계 spec 「B3」 — 저장되는 것은 고른 노드들이고, 뿌리는 그 페이지의 것이다).
 * 그 줄의 종류가 결코 못 하는 항목이라 끄지 않고 뺀다(머리말 «늘 못 하는 항목은 뺀다»). 고른 것은 문서 읽기라 잠금과 무관하다 — 남이 잡은
 * 노드도 담는다(편집이 아니다). 상자는 `./save-module-dialog.tsx`.
 *
 * **뿌리 줄도 다른 항목을 끈 채 둔다** — 뿌리가 못 하는 것(삭제 · 순서 · 계층)은 **종류가 아니라 자리** 때문이라, 끈 항목의 이유(«루트가 아닌
 * 노드를 고르세요»)가 할 말이 있다.
 *
 * 꺼진 항목의 이유는 명령 묶음이 지어 둔 것(`commands.why` — `./toolbar-status.ts`)을 `title` 과 `aria-description` 에 같은 문장으로 싣는다.
 */
export function structureRowItems(
  commands: StructureCommands,
  /** «별칭 바꾸기» — 그 줄 아래에 별칭 입력을 연다(`./alias-edit.tsx`). 끔은 `commands.aliasLocked`. */
  openAlias: () => void,
  /** «모듈로 저장…» — 고른 노드들로 상자를 연다. 없으면(뿌리 줄) 항목을 뺀다. */
  saveModule?: () => void,
): { more: ActionMenuItem[] } {
  const item = (key: keyof StructureAbilities, label: string, icon: LucideIcon, onSelect: () => void, danger = false): ActionMenuItem => ({
    key,
    label,
    onSelect,
    disabled: !commands.abilities[key],
    title: commands.why[key],
    description: commands.why[key],
    danger,
    icon,
  })
  return {
    more: [
      {
        key: 'alias',
        label: '별칭 바꾸기',
        icon: ICONS.rename,
        onSelect: openAlias,
        disabled: commands.aliasLocked,
        title: commands.why.alias,
        description: commands.why.alias,
      },
      ...(saveModule === undefined ? [] : [saveModuleItem(saveModule)]),
      item('moveUp', '위로', ICONS.moveUp, commands.moveUp),
      item('moveDown', '아래로', ICONS.moveDown, commands.moveDown),
      item('indent', '들여쓰기', ICONS.indent, commands.indent),
      item('outdent', '내어쓰기', ICONS.outdent, commands.outdent),
      item('remove', '삭제', ICONS.remove, commands.remove, true),
    ],
  }
}
