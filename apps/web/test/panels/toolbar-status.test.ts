/**
 * **꺼진 항목 하나의 이유 — 상태마다 그 항목이 무엇을 드는가.**
 *
 * 재는 것은 `panels/toolbar-status.ts`의 순수 함수들이다. 꺼진 트리 행동 항목은 이 문장을 `title` 과 `aria-description` 으로 든다
 * (`panels/tree-row-actions.tsx`) — 화면에 서는지 · 두 속성이 같은 문장인지는 `./toolbar-status-reach.test.tsx`(열두 상태)와 앱째로 재는
 * `./structure-toolbar.test.tsx` · `./menu-crud.test.tsx`가 갖는다. 여기는 **어느 상태의 어느 항목에 어느 문장이 붙는가** — 즉 차례다.
 *
 * # `abilities`를 손으로 적지 않는다
 *
 * 불리언 일곱을 손으로 채우면 **실제로 도달하지 않는 조합**을 재게 된다(`{ addAfter: false, remove: false, addInside: true }`는 손으로는
 * 쉽게 적히지만 `structureAbilities`가 그 값을 내는 자리는 루트 하나뿐이다). **그래서 문서와 트리를 짓고 진짜 판정 함수를 지난다** —
 * `structureAbilities` · `selectionAbilities` · `treeAbilities`. 카탈로그를 부르는 판정(`addInside` · `indent`)이 있으므로 `catalog-setup`을
 * 들인다.
 *
 * # 메뉴의 «삭제»는 재지 않는다
 *
 * 메뉴 «삭제»의 판정(`treeAbilities.remove`)과 문장(`MENU_WHY_DISABLED.remove`)은 메뉴 연쇄 삭제가 갖는다 — 여기서는 그 둘에 기대지 않는
 * 항목(순서 · 계층 · 이름)으로 차례를 잰다.
 *
 * # 잠금 판정은 안 재고 받는다
 *
 * `lock` · `pageLock`은 `store.lockedBy`가 낸 값이고 그 판정은 `store/editor-store.test.ts`(*"밖에서 온 루트 잠금"*)와
 * `packages/schema/test/lock.test.ts`가 갖는다.
 */
import { describe, expect, it } from 'vitest'
import type { NodeLock, PageDocument, WbNode } from '@wirebound/schema'
import type { TreeMenuNode } from '../../src/api/types'
import { MULTI_WHY_DISABLED, selectionAbilities, structureAbilities, type StructureAbilities } from '../../src/edit/structure-actions'
import { treeAbilities, type TreeAbilities, type TreeSelection } from '../../src/tree/tree-actions'
import {
  aliasReason,
  BUSY_REASON,
  lockedSelectionStatus,
  menuItemReason,
  MISSING_IN_TREE_REASON,
  NOT_IN_DOCUMENT_STATUS,
  PICK_NODE_REASON,
  structureItemReason,
  type StructureReasonInput,
} from '../../src/panels/toolbar-status'
import { MENU_WHY_DISABLED, STRUCTURE_WHY_DISABLED } from '../../src/panels/tree-row-actions'
import '../../src/catalog-setup'

/**
 * ```
 * n-root (Page)             루트 — 페이지를 열면 여기가 고른 자리다
 * ├ n-a    (Text)           잎이자 맏이 — 자식을 못 담고 `moveUp`만 꺼진다
 * ├ n-box  (Card)           가운데 컨테이너 — 들여·내어만 꺼진다
 * │  ├ n-p    (Section)     앞 형제가 컨테이너라 뒤엣것의 들여쓰기를 연다
 * │  │  └ n-solo (Card)     외동 컨테이너 — 순서 둘이 함께 꺼진다
 * │  ├ n-full (Card)        일곱이 다 켜지는 자리
 * │  └ n-q    (Text)        막내
 * └ n-c    (Divider)        잎이자 막내
 * ```
 */
function doc(): PageDocument {
  const root: WbNode = {
    id: 'n-root',
    type: 'Page',
    children: [
      { id: 'n-a', type: 'Text' },
      {
        id: 'n-box',
        type: 'Card',
        children: [
          { id: 'n-p', type: 'Section', children: [{ id: 'n-solo', type: 'Card' }] },
          { id: 'n-full', type: 'Card' },
          { id: 'n-q', type: 'Text' },
        ],
      },
      { id: 'n-c', type: 'Divider' },
    ],
  }
  return { version: 1, root }
}

const KEYS: readonly (keyof StructureAbilities)[] = ['addInside', 'addAfter', 'remove', 'moveUp', 'moveDown', 'indent', 'outdent']

const BORA: NodeLock = { nodeId: 'n-1', userId: 'u-bora', userName: '보라' }

/**
 * 그 노드를 하나 고른 상태의 입력. **잠금을 판정에도 넘긴다** — 화면에서 그 둘은 같은 값을 지나므로
 * (`panels/structure-toolbar.tsx`의 `useStructureCommands`), 이유에만 주면 도달하지 않는 조합(잠겼는데 판정은 켜져 있다)을 잰다.
 */
function one(nodeId: string | null, lock: NodeLock | null = null, pageLock: NodeLock | null = null): StructureReasonInput {
  const document = doc()
  return {
    selectedNodeId: nodeId,
    count: nodeId === null ? 0 : 1,
    anyLock: null,
    isRoot: nodeId !== null && document.root.id === nodeId,
    lock,
    pageLock,
    abilities: realAbilities(document, nodeId, lock),
  }
}

/** 하나 고른 판의 진짜 판정 — `useStructureCommands` 가 쓰는 `structureAbilities` 그대로다(잠기면 판정이 `NOTHING`). */
function realAbilities(document: PageDocument, nodeId: string | null, lock: NodeLock | null): StructureAbilities {
  return structureAbilities(document, nodeId, lock)
}

/** 여럿을 고른 상태의 입력 — 기준 노드는 마지막 것이다. `anyLock` 은 기준 노드 밖에서 남이 잡은 것. */
function many(nodeIds: string[], anyLock: NodeLock | null = null): StructureReasonInput {
  const document = doc()
  const anchor = nodeIds[nodeIds.length - 1] ?? null
  const removable = !nodeIds.includes('n-root')
  return {
    selectedNodeId: anchor,
    count: nodeIds.length,
    anyLock,
    isRoot: anchor === document.root.id,
    lock: null,
    pageLock: anyLock,
    abilities: selectionAbilities(document, nodeIds, anchor, null, anyLock !== null, removable),
  }
}

function reasons(input: StructureReasonInput): Record<string, string | undefined> {
  return Object.fromEntries(KEYS.map((key) => [key, structureItemReason(input, key)]))
}

describe('구조 — 켜진 항목에는 이유가 없다', () => {
  it('일곱이 다 켜진 자리에서는 일곱 다 `undefined`다', () => {
    const input = one('n-full')
    // 전제를 값으로 못박는다 — 거짓이면 아래 단언은 «켜진 항목»을 재지 않는다.
    expect(Object.values(input.abilities).every(Boolean)).toBe(true)
    expect(Object.values(reasons(input))).toEqual(KEYS.map(() => undefined))
  })

  it('일부만 꺼지면 꺼진 것에만 붙는다', () => {
    const input = one('n-box')
    expect([input.abilities.indent, input.abilities.outdent]).toEqual([false, false])
    expect(reasons(input)).toEqual({
      addInside: undefined,
      addAfter: undefined,
      remove: undefined,
      moveUp: undefined,
      moveDown: undefined,
      indent: STRUCTURE_WHY_DISABLED.indent,
      outdent: STRUCTURE_WHY_DISABLED.outdent,
    })
  })
})

describe('구조 — 항목 하나의 이유는 그 항목의 것이다', () => {
  /**
   * **무리의 이유를 엉뚱한 항목에 붙이지 않는다.** 잎이 «자식을 담지 못한다»는 `addInside`의 이유이지 «위로»의 이유가 아니다 — 무리 전체를
   * 한 문장으로 말하던 줄의 사다리를 항목마다 붙이면 그렇게 된다.
   */
  it('잎의 `addInside`는 타입을, «위로»는 형제를 말한다', () => {
    expect(structureItemReason(one('n-a'), 'addInside')).toBe(STRUCTURE_WHY_DISABLED.addInside)
    expect(structureItemReason(one('n-a'), 'moveUp')).toBe(STRUCTURE_WHY_DISABLED.moveUp)
  })

  it('외동의 «위로» · «아래로»는 각자의 조건을 말한다', () => {
    const input = one('n-solo')
    expect([input.abilities.moveUp, input.abilities.moveDown]).toEqual([false, false])
    expect([structureItemReason(input, 'moveUp'), structureItemReason(input, 'moveDown')]).toEqual([
      STRUCTURE_WHY_DISABLED.moveUp,
      STRUCTURE_WHY_DISABLED.moveDown,
    ])
  })

  /** 뿌리가 못 하는 것은 **자리** 때문이다 — 꺼진 여섯이 각자의 문장(«루트가 아닌 노드를 고르세요» 등)을 든다. */
  it('루트는 꺼진 여섯이 각자의 조건을 말하고 `addInside`는 켜져 있다', () => {
    const got = reasons(one('n-root'))
    expect(got.addInside).toBeUndefined()
    expect(got.remove).toBe('루트가 아닌 노드를 고르세요')
    expect(got).toEqual({ ...Object.fromEntries(KEYS.map((key) => [key, STRUCTURE_WHY_DISABLED[key]])), addInside: undefined })
  })

  it('문서에 없는 노드를 고르고 있으면 일곱 다 그렇게 말한다', () => {
    expect(Object.values(reasons(one('n-gone')))).toEqual(KEYS.map(() => NOT_IN_DOCUMENT_STATUS))
  })

  /**
   * **루트가 자식을 못 담아도 «문서에 없다»가 아니다.** 그때는 일곱이 다 꺼져 «문서에 없다»가 읽는 값과 같아지는데, 고른 노드는 있고 그것이
   * 루트다 — 검증 전 문서가 스토어에 실릴 수 있어(`structure-actions.ts`의 계약) 값으로 고정한다.
   */
  it('자식을 못 담는 루트는 «문서에 없다»가 아니라 각 항목의 조건을 말한다', () => {
    const broken: PageDocument = { version: 1, root: { id: 'n-root', type: 'Text' } }
    const abilities = structureAbilities(broken, 'n-root')
    expect(Object.values(abilities).some(Boolean)).toBe(false)
    const input: StructureReasonInput = { selectedNodeId: 'n-root', isRoot: true, lock: null, pageLock: null, abilities }
    expect(reasons(input)).toEqual(Object.fromEntries(KEYS.map((key) => [key, STRUCTURE_WHY_DISABLED[key]])))
  })
})

describe('구조 — 잠금이 차례의 맨 위다(고른 것이 있을 때)', () => {
  /**
   * **배지가 안 붙는 자리다.** 잠긴 노드 자신에게는 트리 줄에 *"보라 편집 중"* 배지가 붙지만 막히는 것은 그 서브트리 전체다 — 자동 선택된
   * 루트가 늘 그 조상이다. 루트가 원래 못 하는 여섯도 지금 꺼진 까닭은 잠금이다(원래 켜진 `addInside` 도 잠금으로 함께 꺼진다).
   */
  it('루트가 남의 잠금에 막히면 일곱 다 이름과 함께 잠금을 말한다', () => {
    expect(reasons(one('n-root', BORA))).toEqual(Object.fromEntries(KEYS.map((key) => [key, lockedSelectionStatus('보라')])))
  })

  /**
   * **«문서에 없다»보다 먼저다.** 잠기면 판정이 `NOTHING`이라 `addAfter` · `remove`가 둘 다 꺼지는데, 그 값은 «문서에 없다»가 읽는 값과
   * **같다.** 순서를 뒤집으면 잠긴 자리에서 없는 노드 이야기가 나온다.
   */
  it('잠금이 «문서에 없다»보다 먼저다 — 잠기면 판정이 그쪽과 같은 값이 된다', () => {
    const input = one('n-p', BORA)
    expect([input.abilities.addAfter, input.abilities.remove]).toEqual([false, false])
    expect(structureItemReason(input, 'remove')).toBe(lockedSelectionStatus('보라'))
  })

  it('잠금은 각 항목의 조건보다도 먼저다', () => {
    expect(structureItemReason(one('n-a', BORA), 'addInside')).toBe(lockedSelectionStatus('보라'))
  })

  it('잠금 소유자 이름을 그대로 싣는다 — 하드코딩이 아니다', () => {
    const other: NodeLock = { nodeId: 'n-1', userId: 'u-dahye', userName: '다혜' }
    expect(structureItemReason(one('n-root', other), 'remove')).toBe(lockedSelectionStatus('다혜'))
    expect(lockedSelectionStatus('다혜')).toContain('다혜')
  })
})

/**
 * **«안 골랐다» 칸이 둘로 갈린다.** 페이지에 남의 잠금이 하나라도 있으면 «고르면 편집할 수 있습니다»는 고를 줄이 하나도 없는 판에서도 고르라고
 * 말한다 — 그 판은 원인을 말한다.
 */
describe('구조 — 안 골랐을 때', () => {
  it('안 골랐으면 고르라고 말한다', () => {
    expect(Object.values(reasons(one(null)))).toEqual(KEYS.map(() => PICK_NODE_REASON))
  })

  it('안 골랐는데 페이지에 남의 잠금이 있으면 원인을 말한다 — 고르라고 하지 않는다', () => {
    const reason = structureItemReason(one(null, null, BORA), 'addInside')
    expect(reason).toContain('보라')
    expect(reason).not.toBe(PICK_NODE_REASON)
  })

  /** **고른 것이 있으면 페이지 잠금이 이 칸을 대신하지 않는다** — `n-a`는 잠긴 서브트리 밖이라 그 자리의 이유는 잠금이 아니다. */
  it('고른 것이 있으면 페이지 잠금이 각 항목의 조건을 대신하지 않는다', () => {
    expect(structureItemReason(one('n-a', null, BORA), 'addInside')).toBe(STRUCTURE_WHY_DISABLED.addInside)
    expect(structureItemReason(one('n-full', null, BORA), 'remove')).toBeUndefined()
  })
})

describe('구조 — 여럿을 고른 판', () => {
  it('순서 · 계층은 «하나일 때만»을 말하고 삭제 · 추가는 켜져 있다', () => {
    const got = reasons(many(['n-a', 'n-c']))
    expect(got).toEqual({
      addInside: STRUCTURE_WHY_DISABLED.addInside,
      addAfter: undefined,
      remove: undefined,
      moveUp: MULTI_WHY_DISABLED,
      moveDown: MULTI_WHY_DISABLED,
      indent: MULTI_WHY_DISABLED,
      outdent: MULTI_WHY_DISABLED,
    })
  })

  it('고른 것 가운데 하나를 남이 잡았으면 «삭제»가 누가 잡았는지 말한다', () => {
    expect(structureItemReason(many(['n-a', 'n-c'], BORA), 'remove')).toBe('보라님이 편집 중인 노드가 있어 함께 지울 수 없습니다')
  })

  it('남의 잠금 없이 «삭제»가 꺼졌으면(루트를 품었다) 그 항목의 조건을 말한다', () => {
    const input = many(['n-a', 'n-root'])
    expect(input.abilities.remove).toBe(false)
    expect(structureItemReason(input, 'remove')).toBe(STRUCTURE_WHY_DISABLED.remove)
  })
})

describe('구조 — 판정 키가 없는 별칭', () => {
  it('별칭은 잠금 · 여럿 · 없음 · 안 골랐음을 가른다', () => {
    expect(aliasReason(one('n-a', BORA))).toBe(lockedSelectionStatus('보라'))
    expect(aliasReason(many(['n-a', 'n-c']))).toBe(MULTI_WHY_DISABLED)
    expect(aliasReason(one('n-gone'))).toBe(NOT_IN_DOCUMENT_STATUS)
    expect(aliasReason(one(null))).toBe(PICK_NODE_REASON)
  })
})

/**
 * ```
 * mn-1 관리자   pages: pg-1 회원목록, pg-2 회원상세
 * │ └ mn-1-1 회원   (자식 없음, 페이지 없음) — 외동
 * mn-2 포털     pages: pg-3 홈
 * mn-3 설정     비었다 · 형제가 둘
 * ```
 */
function tree(): TreeMenuNode[] {
  return [
    {
      id: 'mn-1',
      title: '관리자',
      sortOrder: 0,
      pages: [
        { id: 'pg-1', title: '회원 목록', sortOrder: 0 },
        { id: 'pg-2', title: '회원 상세', sortOrder: 1 },
      ],
      children: [{ id: 'mn-1-1', title: '회원', sortOrder: 0, pages: [], children: [] }],
    },
    { id: 'mn-2', title: '포털', sortOrder: 1, pages: [{ id: 'pg-3', title: '홈', sortOrder: 0 }], children: [] },
    { id: 'mn-3', title: '설정', sortOrder: 2, pages: [], children: [] },
  ]
}

function menuReason(selection: TreeSelection | null, key: keyof TreeAbilities, busy = false): string | undefined {
  return menuItemReason({ selection, busy, abilities: treeAbilities(tree(), selection) }, key)
}

describe('메뉴 — 항목 하나의 이유', () => {
  /**
   * **`busy`가 맨 위이고 켜진 항목도 그것을 든다.** 조작이 나가 있는 동안은 항목이 전부 꺼진다(`tree/use-tree-commands.tsx`의 조작 잠금) —
   * 판정으로는 켜진 항목도 꺼지므로 이유가 있어야 하고, 그때 *"메뉴를 고르세요"*가 뜨면 거짓말이다(고른 것은 이미 있다).
   */
  it('busy면 판정이 켠 항목도 «보내는 중»을 말한다', () => {
    expect(treeAbilities(tree(), { kind: 'menu', id: 'mn-3' }).rename).toBe(true)
    expect(menuReason({ kind: 'menu', id: 'mn-3' }, 'rename', true)).toBe(BUSY_REASON)
  })

  it('busy는 판정이 끈 항목의 조건보다도 먼저다 — 고른 것이 없어도', () => {
    expect(menuReason(null, 'rename', true)).toBe(BUSY_REASON)
    expect(menuReason({ kind: 'menu', id: 'mn-1' }, 'moveUp', true)).toBe(BUSY_REASON)
  })

  it('켜진 항목에는 이유가 없다', () => {
    expect(menuReason({ kind: 'menu', id: 'mn-3' }, 'rename')).toBeUndefined()
  })

  it('안 골랐으면 그 항목의 조건을 말한다', () => {
    expect(menuReason(null, 'rename')).toBe(MENU_WHY_DISABLED.rename)
    expect(menuReason(null, 'addMenu')).toBe(MENU_WHY_DISABLED.addMenu)
  })

  it('트리에 없는 것을 고르고 있으면 그렇게 말한다 — 메뉴도 페이지도', () => {
    expect(menuReason({ kind: 'menu', id: 'mn-gone' }, 'rename')).toBe(MISSING_IN_TREE_REASON)
    expect(menuReason({ kind: 'page', id: 'pg-gone' }, 'moveUp')).toBe(MISSING_IN_TREE_REASON)
  })

  it('그 밖에는 그 항목의 조건이다 — 페이지의 하위 추가 · 맏이의 위로 · 외동의 아래로', () => {
    expect(menuReason({ kind: 'page', id: 'pg-1' }, 'addMenu')).toBe(MENU_WHY_DISABLED.addMenu)
    expect(menuReason({ kind: 'menu', id: 'mn-1' }, 'moveUp')).toBe(MENU_WHY_DISABLED.moveUp)
    expect(menuReason({ kind: 'menu', id: 'mn-1-1' }, 'moveDown')).toBe(MENU_WHY_DISABLED.moveDown)
  })
})

describe('문장의 꼴', () => {
  it('항목의 이유는 마침표 없이 끝난다 — 한 줄짜리 문장이다', () => {
    const spoken = [
      ...Object.values(reasons(one(null))),
      ...Object.values(reasons(one(null, null, BORA))),
      ...Object.values(reasons(one('n-root', BORA))),
      ...Object.values(reasons(one('n-gone'))),
      ...Object.values(reasons(many(['n-a', 'n-c'], BORA))),
      menuReason(null, 'rename', true),
      menuReason({ kind: 'menu', id: 'mn-gone' }, 'rename'),
    ].filter((sentence): sentence is string => sentence !== undefined)
    expect(spoken.length).toBeGreaterThan(30)
    for (const sentence of spoken) {
      expect(sentence).not.toBe('')
      expect(sentence.endsWith('.')).toBe(false)
    }
  })
})
