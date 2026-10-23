/**
 * 두 트리(구조 · 메뉴)의 **꺼진 항목 하나가 드는 이유**의 문안.
 *
 * # 어디에 붙나 — 꺼진 항목의 `title` 과 `aria-description`
 *
 * 줄 행동(`+` · `…` — `panels/tree-row-actions.tsx`)의 항목과 트리 안의 꺼지는 단추는 꺼졌을 때 이 문장을 `title`(마우스를 올리면 보인다)과
 * `aria-description`(보조 기술이 그 항목의 설명으로 읽는다)에 **같은 문장으로** 든다. 켜진 항목에는 둘 다 없다 — 켜진 항목에 붙일 «왜 회색인가»가
 * 없다. 트리 아래에 늘 서는 이유 줄은 없다 — 꺼진 것에 마우스를 올려야 이유가 보인다.
 *
 * **키보드로 이유에 닿는 자리 — 포커스가 선 꺼진 항목.** 꺼진 메뉴 항목에도 화살표가 서고, 이유를 싣는 메뉴 밖의 꺼진 단추도
 * `disabled` 대신 `aria-disabled` 라 탭 순서에 남는다(`shell/action-menu.tsx` 머리말 «끈 항목은 …»). 포커스가 서면 보조 기술이 그 설명을
 * 읽는다 — 열두 상태의 표는 `test/panels/toolbar-status-reach.test.tsx`, Chrome 접근성 트리의 값은 `build-test/menu-reason-reach.test.ts`가
 * 갖는다.
 *
 * # 항목 하나의 이유다 — 무리의 이유가 아니다
 *
 * 각 함수는 **꺼진 항목 하나**에 대해 «그 항목이 지금 왜 꺼졌나»를 한 문장으로 낸다. 무리 전체를 한 문장으로 말하는 꼴(«자식을 담지 못하는
 * 타입입니다» · «형제가 없어 …»)은 항목에 붙이면 엉뚱한 항목(«위로»)에 붙는다 — 그 자리는 항목마다의 조건 표(`STRUCTURE_WHY_DISABLED` ·
 * `MENU_WHY_DISABLED`)가 맡는다. 이 파일이 그 표 **위에** 세우는 칸은 **표가 말하지 못하는 원인**뿐이다 — 잠금 · 고른 것이 없음 · 고른 것이
 * 문서(트리)에 없음 · 여럿을 고름 · 보내는 중. 그 원인이 서면 표의 조건은 거짓이 된다(잠긴 루트에 «루트가 아닌 노드를 고르세요»는 지금
 * 꺼진 까닭이 아니다).
 *
 * ## 차례 — 잠금이 위다
 *
 * **화면에 다른 단서가 없는 것이 위다.** 잠긴 노드 자신에게는 *"○○ 편집 중"* 배지가 붙지만(`panels/structure-tree.tsx`) **그 조상**은 배지
 * 없이 회색이 된다 — 그 자리가 곧 자동 선택된 루트라 페이지를 열어 둔 채 남이 아무 노드나 잡으면 루트 줄이 `aria-current`인 채 꺼지고 그
 * 이유가 화면에 없다. 그래서 잠금이 표의 조건보다 먼저다. **«바꿀 수도 없습니다»가 참인 것은 우측 패널이 같은 `lockedBy` 값으로 함께 꺼지기
 * 때문이다** — 두 표면의 범위가 같다는 것을 재는 것은 `test/lock/props-lock.test.tsx`의 «꺼진 항목이 이름을 말하는 판과 …»다. **문장을
 * 좁히려면 그 케이스부터 본다.**
 *
 * **잠금이 «문서에 없다»보다 먼저인 까닭은 하나 더 있다** — 잠기면 판정이 `NOTHING`이라 `addAfter` · `remove`가 둘 다 꺼지는데, 그 값은
 * «문서에 없다»가 읽는 값과 같다. 순서를 뒤집으면 잠긴 자리에서 없는 노드 이야기가 나온다.
 *
 * ## «안 골랐다» 칸이 둘로 갈린다 — 페이지 잠금
 *
 * 안 고른 판에 페이지에 남의 잠금이 있으면(`pageLock`) «고르면 편집할 수 있습니다»는 페이지 전체가 잠겨 고를 줄이 하나도 없는 판에서도 고르라고
 * 말한다. 그래서 그 판에서는 원인(남이 편집 중)을 말한다.
 *
 * **별칭은 판정 키가 없다** — 선택의 개수 · 있음 · 잠금으로만 꺼지므로 그 까닭만 말한다(`aliasReason`).
 *
 * # 판정을 두 벌로 만들지 않는다
 *
 * 이 파일은 **판정하지 않는다.** 무엇을 할 수 있는지는 `edit/structure-actions.ts`의 `structureAbilities` · `selectionAbilities`와
 * `tree/tree-actions.ts`의 `treeAbilities`가 정하고, 여기서는 그 결과(`abilities`)와 **선택 자체의 성질**(잠금 · 루트 · 개수)만 읽는다.
 * 루트인지도 다시 판정하지 않고 `document.root.id`와의 **id 비교**를 호출자가 넘긴다.
 *
 * **React · DOM 을 모른다** — 상태마다 어느 항목에 무엇이 붙는지가 화면을 지나지 않고 재진다(`test/panels/toolbar-status.test.ts`). 항목마다의
 * 조건 표는 `./tree-row-actions.tsx`가 갖는다 — 그 파일이 이 파일의 함수를 부르고 이 파일이 그 표를 읽어 두 모듈이 서로를 부르지만, 둘 다
 * 함수 몸 안에서만 쓰므로 적재 순서와 무관하다.
 */
import { MAX_OPS_PER_EDIT, type NodeLock } from '@wirebound/schema'
import { MULTI_DISABLED, MULTI_WHY_DISABLED, type LevelRefusals, type StructureAbilities } from '../edit/structure-actions'
import type { TreeAbilities, TreeSelection } from '../tree/tree-actions'
import { MENU_WHY_DISABLED, STRUCTURE_WHY_DISABLED } from './tree-row-actions'

/** 구조 트리에서 고른 노드가 없을 때 — 고르면 된다(페이지에 남의 잠금이 없는 판). */
export const PICK_NODE_REASON = '트리에서 노드를 고르면 편집할 수 있습니다'

/** 고른 노드가 문서에 없을 때의 문장(`structureItemReason` · `palette/palette-add.ts`). */
export const NOT_IN_DOCUMENT_STATUS = '고른 노드가 문서에 없습니다'

/**
 * 메뉴 트리의 조작이 나가 있는 동안(`busy`) — 항목이 판정과 무관하게 전부 꺼진다(`tree/use-tree-commands.tsx`의 조작 잠금). 곧 풀릴 상태라
 * 판정 문안(«메뉴를 고르세요»)을 붙이면 거짓말이다.
 */
export const BUSY_REASON = '조작을 보내는 중입니다'

/**
 * 메뉴 트리에서 고른 것이 트리에 없을 때 — 남이 지웠거나 다른 세션이 트리를 바꾼 뒤 다시 받기 전의 창이다(`treeAbilities` 머리말). 찾은 것은
 * 메뉴든 페이지든 `rename`이 참이라 `!rename`이 곧 이 상태다.
 */
export const MISSING_IN_TREE_REASON = '고른 것이 트리에 없습니다'

/** 페이지 줄 `…`의 «JSON 내보내기»가 꺼졌을 때 — 내보내기는 한 번에 하나다(`panels/page-json-export.ts`). */
export const EXPORT_BUSY_REASON = '페이지를 내보내는 중입니다'

/** 구조 트리의 꺼진 항목 하나의 이유를 지을 때 읽는 것 — 판정의 결과와 선택 자체의 성질. */
export interface StructureReasonInput {
  selectedNodeId: string | null
  /** 고른 노드 수(여러 노드 선택). 빠뜨리면 1 이다. */
  count?: number
  /** 고른 노드 가운데 남이 잡은 것 — 여럿일 때 기준 노드 밖의 잠금도 말한다. */
  anyLock?: NodeLock | null
  /** 고른 것이 문서 루트인가. 호출자가 `document.root.id`와 id로 비교한다. */
  isRoot: boolean
  /** 고른 노드를 막는 **남의** 잠금(`store.lockedBy`). 없으면 `null`. */
  lock: NodeLock | null
  /**
   * **이 페이지에 남의 잠금이 하나라도 있는가** — `store.lockedBy(document.root.id)`가 낸 것이다. 쓰이는 자리는 **고른 것이 없을 때뿐**이다
   * (머리말 «안 골랐다 칸») — 고른 것이 있으면 `lock`과 항목의 조건이 답한다.
   */
  pageLock: NodeLock | null
  abilities: StructureAbilities
  /**
   * 들여쓰기 · 내어쓰기가 갈 자리에 그 노드가 못 서는 까닭(`edit/structure-actions.ts` 의 `levelRefusals` — 놓기 · 넣기 · 붙이기와 같은 문장).
   * 빠뜨리면 그 두 항목은 자리의 조건(`STRUCTURE_WHY_DISABLED`)을 말한다.
   */
  levels?: LevelRefusals
}

/**
 * 구조 트리 항목 `key`가 꺼졌을 때의 이유. 켜져 있으면 `undefined`다.
 *
 * 차례: 안 골랐고 페이지에 남의 잠금 → 안 골랐다 → 고른 노드를 남이 잡음 → 여럿(«삭제»의 남의 잠금 · 순서 · 계층의 «하나일 때만») → 문서에
 * 없다 → 그 항목의 조건(`STRUCTURE_WHY_DISABLED` — 뿌리는 이것이 «루트가 아닌 노드를 고르세요»로 말한다).
 */
export function structureItemReason(input: StructureReasonInput, key: keyof StructureAbilities): string | undefined {
  if (input.abilities[key]) return undefined
  if (input.selectedNodeId === null) {
    return input.pageLock === null ? PICK_NODE_REASON : `${input.pageLock.userName}님이 편집 중이라 지금은 쓸 수 있는 도구가 없습니다`
  }
  if (input.lock !== null) return lockedSelectionStatus(input.lock.userName)
  if ((input.count ?? 1) > 1) {
    if (key === 'remove' && input.anyLock !== null && input.anyLock !== undefined) {
      return `${input.anyLock.userName}님이 편집 중인 노드가 있어 함께 지울 수 없습니다`
    }
    if (MULTI_DISABLED.has(key)) return MULTI_WHY_DISABLED
  }
  // 루트가 아닌데 `addAfter` · `remove`가 함께 꺼졌으면 그 노드가 문서에 없다 — 찾은 비루트 노드는 둘이 언제나 참이다(`structureAbilities`).
  // 루트는 둘이 늘 꺼져 있으므로 이 칸에서 뺀다 — 고른 노드는 있고 그것이 루트다.
  if (!input.isRoot && !input.abilities.addAfter && !input.abilities.remove) return NOT_IN_DOCUMENT_STATUS
  // 갈 자리가 그 노드를 안 받으면 다른 입구와 같은 까닭을 말한다(리뷰 RV-ZE H1).
  if (key === 'indent' || key === 'outdent') {
    const refusal = input.levels?.[key] ?? null
    if (refusal !== null) return refusal
  }
  return STRUCTURE_WHY_DISABLED[key]
}

/**
 * 별칭 바꾸기가 꺼졌을 때(`aliasLocked`가 참일 때만 부른다) — 하나를 고르지 않았거나 · 고른 노드가 문서에 없거나 · 남이 잡았다. 잠금이
 * 먼저다(위 «차례»와 같은 까닭).
 */
export function aliasReason(input: StructureReasonInput): string {
  if (input.selectedNodeId === null) return PICK_NODE_REASON
  if (input.lock !== null) return lockedSelectionStatus(input.lock.userName)
  if ((input.count ?? 1) > 1) return MULTI_WHY_DISABLED
  return NOT_IN_DOCUMENT_STATUS
}

/**
 * 메뉴 트리 항목 `key`가 꺼졌을 때의 이유. 켜져 있고 보내는 중이 아니면 `undefined`다.
 *
 * 차례: 보내는 중(판정이 켠 항목도 꺼진다) → 안 골랐다(그 항목의 조건) → 트리에 없다 → 그 항목의 조건(`MENU_WHY_DISABLED`).
 */
export function menuItemReason(
  input: { selection: TreeSelection | null; busy: boolean; abilities: TreeAbilities },
  key: keyof TreeAbilities,
): string | undefined {
  if (input.busy) return BUSY_REASON
  if (input.abilities[key]) return undefined
  if (input.selection !== null && !input.abilities.rename) return MISSING_IN_TREE_REASON
  return MENU_WHY_DISABLED[key]
}

/** 꺼진 항목의 이유 — 판정 일곱과 판정 키가 없는 별칭. 켜진 항목은 `undefined`다. */
export type StructureWhy = { readonly [K in keyof StructureAbilities | 'alias']?: string }

/** 구조 트리 줄 행동이 싣는 이유 전부(`StructureCommands.why`). 판정 키가 없는 별칭은 끈 값(`aliasLocked`)을 받는다. */
export function structureWhy(input: StructureReasonInput, gates: { aliasLocked: boolean }): StructureWhy {
  return {
    addInside: structureItemReason(input, 'addInside'),
    addAfter: structureItemReason(input, 'addAfter'),
    remove: structureItemReason(input, 'remove'),
    moveUp: structureItemReason(input, 'moveUp'),
    moveDown: structureItemReason(input, 'moveDown'),
    indent: structureItemReason(input, 'indent'),
    outdent: structureItemReason(input, 'outdent'),
    alias: gates.aliasLocked ? aliasReason(input) : undefined,
  }
}

/**
 * 고른 노드를 남이 잡았을 때의 문장 — 꺼진 항목의 이유에서 잠금 칸(`structureItemReason`). 하단 판 카드의 «넣기» 단추와 편집 단축키의
 * 하단 바가 같은 판에서 같은 문장을 낸다(`palette/palette-add.ts` · `shell/editor-keys.tsx`).
 */
export function lockedSelectionStatus(userName: string): string {
  return `${userName}님이 편집 중이라 고를 수도 바꿀 수도 없습니다`
}

/**
 * 여럿을 고르는 사이 남이 그중 일부를 먼저 잡아 서버가 거절했을 때의 하단 바 문장(`realtime/use-realtime.ts` — 그 노드는 선택에서
 * 빠졌다). 이름은 `locks` 목록에서 읽고, 아직 모르면 이름 없이 말한다.
 */
export function deniedSelectionNotice(userNames: readonly string[]): string {
  return userNames.length === 0 ? '다른 사람이 편집 중이라 고를 수 없습니다' : `${userNames.join(' · ')}님이 편집 중이라 고를 수 없습니다`
}

/**
 * 고르기 몸짓(Cmd · Shift 클릭 · Cmd+A · 사각형)이 상한(`MAX_OPS_PER_EDIT`)에 걸려 더 고르지 않았을 때의 하단 바 문장 — 고른 것을 한 번에
 * 지우는 묶음이 서버 상한을 넘지 않게 하는 수다(`store/selection-set.ts` 머리말).
 */
export function selectionCapNotice(): string {
  return `한 번에 고를 수 있는 노드는 ${MAX_OPS_PER_EDIT}개까지입니다`
}
