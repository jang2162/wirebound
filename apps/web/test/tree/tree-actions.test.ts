/**
 * `tree/tree-actions.ts`의 계약 테스트. **화면을 지나지 않는다** — 판정이 순수 함수라
 * 트리 값 하나와 선택 하나만으로 재진다.
 *
 * 무엇을 고르면 어느 조작이 열리는지의 규칙은 `tree/tree-actions.ts`(머리말과 `treeAbilities`)가
 * 소유한다.
 */
import { describe, expect, it } from 'vitest'
import type { TreeMenuNode, TreePage } from '../../src/api/types'
import {
  flattenMenus,
  menuOutdentTarget,
  previousMenuSibling,
  menuSubtree,
  treeAbilities,
  treeSpot,
} from '../../src/tree/tree-actions'

/** 케이스마다 손으로 만들지 않도록 최소 트리를 만드는 도우미. */
function menu(id: string, over: Partial<TreeMenuNode> = {}): TreeMenuNode {
  return { id, title: id, sortOrder: 0, pages: [], children: [], ...over }
}

function page(id: string, over: Partial<TreePage> = {}): TreePage {
  return { id, title: id, sortOrder: 0, ...over }
}

describe('treeAbilities', () => {
  it('고른 것이 없으면 아무 조작도 못 한다', () => {
    expect(treeAbilities([menu('m1')], null)).toEqual({
      addMenu: false,
      addPage: false,
      rename: false,
      remove: false,
      moveUp: false,
      moveDown: false,
      indent: false,
      outdent: false,
      reparent: false,
    })
  })

  it('트리를 아직 받지 못했으면 아무 조작도 못 한다', () => {
    expect(treeAbilities(null, { kind: 'menu', id: 'm1' }).rename).toBe(false)
  })

  it('트리에 없는 것을 가리키면 아무 조작도 못 한다', () => {
    // 삭제 직후·다른 세션의 변경 뒤에 실제로 생기는 상태다. 선택은 파생값이라
    // 트리가 바뀌어도 저절로 따라오지 않는다.
    expect(treeAbilities([menu('m1')], { kind: 'menu', id: 'gone' }).remove).toBe(false)
    expect(treeAbilities([menu('m1', { pages: [page('pg1')] })], { kind: 'page', id: 'gone' }).rename).toBe(
      false,
    )
  })

  it('루트 메뉴 하나뿐이면 만들기·이름 변경·삭제만 된다', () => {
    expect(treeAbilities([menu('m1')], { kind: 'menu', id: 'm1' })).toEqual({
      addMenu: true,
      addPage: true,
      rename: true,
      remove: true,
      moveUp: false,
      moveDown: false,
      indent: false,
      outdent: false,
      reparent: false,
    })
  })

  it('하위(페이지 · 자식 메뉴)가 있는 메뉴도 지울 수 있다 — 확인 상자가 연쇄 삭제로 보낸다', () => {
    // 하위가 있으면 `askRemove`가 확인 상자를 연다(`src/tree/use-tree-commands.tsx` · `../panels/menu-cascade-delete.test.tsx`).
    const withPage = [menu('m1', { pages: [page('pg1')] })]
    const withChild = [menu('m1', { children: [menu('m2')] })]

    expect(treeAbilities(withPage, { kind: 'menu', id: 'm1' }).remove).toBe(true)
    expect(treeAbilities(withChild, { kind: 'menu', id: 'm1' }).remove).toBe(true)
    // 트리에 없는 메뉴는 여전히 못 지운다(`NOTHING`).
    expect(treeAbilities(withChild, { kind: 'menu', id: 'm-gone' }).remove).toBe(false)
  })

  it('menuSubtree — 밑의 메뉴 수(자기 빼고)와 페이지(트리가 그리는 차례)', () => {
    const tree = [
      menu('m1', {
        pages: [page('pg-b', { sortOrder: 1 }), page('pg-a', { sortOrder: 0 })],
        children: [menu('m2', { pages: [page('pg-c')], children: [menu('m3')] })],
      }),
      menu('m4', { sortOrder: 1, pages: [page('pg-out')] }),
    ]
    const subtree = menuSubtree(tree, 'm1')
    expect(subtree?.menus).toBe(2)
    expect(subtree?.pages.map((item) => item.id)).toEqual(['pg-a', 'pg-b', 'pg-c'])
    expect(menuSubtree(tree, 'm3')).toEqual({ title: 'm3', menus: 0, pages: [] })
    expect(menuSubtree(tree, 'm-gone')).toBeNull()
    expect(menuSubtree(null, 'm1')).toBeNull()
  })

  it('형제 셋 중 가운데 메뉴는 위·아래·들여쓰기가 다 된다', () => {
    const tree = [
      menu('m1', { sortOrder: 0 }),
      menu('m2', { sortOrder: 1 }),
      menu('m3', { sortOrder: 2 }),
    ]

    const abilities = treeAbilities(tree, { kind: 'menu', id: 'm2' })

    expect(abilities.moveUp).toBe(true)
    expect(abilities.moveDown).toBe(true)
    expect(abilities.indent).toBe(true)
  })

  it('형제 셋 중 첫째는 위로도 들여쓰기도 못 한다', () => {
    // 들여쓰기의 목적지는 **앞 형제**다 — 앞이 없으면 갈 곳이 없다.
    const tree = [
      menu('m1', { sortOrder: 0 }),
      menu('m2', { sortOrder: 1 }),
      menu('m3', { sortOrder: 2 }),
    ]

    const abilities = treeAbilities(tree, { kind: 'menu', id: 'm1' })

    expect(abilities.moveUp).toBe(false)
    expect(abilities.indent).toBe(false)
    // 막내는 그 반대다 — 아래로만 막힌다.
    expect(treeAbilities(tree, { kind: 'menu', id: 'm3' }).moveDown).toBe(false)
  })

  it('루트 메뉴는 내어쓸 수 없고 자식 메뉴는 된다', () => {
    const tree = [menu('m1', { children: [menu('m2')] })]

    expect(treeAbilities(tree, { kind: 'menu', id: 'm1' }).outdent).toBe(false)
    expect(treeAbilities(tree, { kind: 'menu', id: 'm2' }).outdent).toBe(true)
  })

  it('페이지를 고르면 하위 만들기와 계층 이동이 전부 막힌다', () => {
    // `indent`·`outdent`가 **언제나** 불가한 근거: 트리가 페이지를 먼저 그리므로
    // 페이지의 앞 형제는 항상 페이지이고, 페이지는 자식을 갖지 못한다. 여기서는 앞
    // 형제가 페이지로 **있는** 상태를 만들어 그 조건이 갖춰져도 여전히 불가임을 본다.
    const tree = [
      menu('m1', { pages: [page('pg1', { sortOrder: 0 }), page('pg2', { sortOrder: 1 })] }),
      menu('m2'),
    ]

    const abilities = treeAbilities(tree, { kind: 'page', id: 'pg2' })

    expect(abilities.addMenu).toBe(false)
    expect(abilities.addPage).toBe(false)
    expect(abilities.indent).toBe(false)
    expect(abilities.outdent).toBe(false)
    // 페이지를 다른 메뉴로 옮기는 길은 이것 하나다.
    expect(abilities.reparent).toBe(true)
    // 이름 변경·삭제는 언제나 되고, 같은 메뉴 안의 앞 페이지가 있으니 위로도 된다.
    expect(abilities.rename).toBe(true)
    expect(abilities.remove).toBe(true)
    expect(abilities.moveUp).toBe(true)
    expect(abilities.moveDown).toBe(false)
  })

  it('메뉴 안 첫 페이지는 위로 못 간다', () => {
    // **앞 케이스는 막내(`pg2`)만 본다** — 이 케이스가 없으면 `moveUp`을 `true`로 고정해도
    // 아무 케이스도 안 죽는다. 같은 메뉴 안의 앞 페이지가 없으면 갈 곳이 없다.
    const tree = [
      menu('m1', { pages: [page('pg1', { sortOrder: 0 }), page('pg2', { sortOrder: 1 })] }),
      // 다른 메뉴에 페이지가 있어도 형제가 아니다 — 페이지의 형제는 같은 메뉴 안뿐이다.
      menu('m2', { sortOrder: 1, pages: [page('pg3')] }),
    ]

    expect(treeAbilities(tree, { kind: 'page', id: 'pg1' }).moveUp).toBe(false)
    expect(treeAbilities(tree, { kind: 'page', id: 'pg1' }).moveDown).toBe(true)
    expect(treeAbilities(tree, { kind: 'page', id: 'pg3' }).moveUp).toBe(false)
    expect(treeAbilities(tree, { kind: 'page', id: 'pg3' }).moveDown).toBe(false)
  })

  it('메뉴가 하나뿐이면 페이지를 옮길 곳이 없다', () => {
    // 옮길 수 있는 곳이 자기 소속 메뉴뿐이라 고를 것이 없다.
    const tree = [menu('m1', { pages: [page('pg1')] })]

    expect(treeAbilities(tree, { kind: 'page', id: 'pg1' }).reparent).toBe(false)
  })

  it('메뉴 수는 트리 전체를 센다 — 자식 메뉴도 옮길 곳이다', () => {
    // 루트가 하나여도 그 안에 자식 메뉴가 있으면 옮길 곳이 있다. 루트 배열 길이로
    // 세면 이 트리에서 `false`가 된다.
    const tree = [menu('m1', { pages: [page('pg1')], children: [menu('m2')] })]

    expect(treeAbilities(tree, { kind: 'page', id: 'pg1' }).reparent).toBe(true)
  })
})

describe('treeSpot', () => {
  it('페이지에는 소속 메뉴 id를 준다', () => {
    const tree = [menu('m1'), menu('m2', { sortOrder: 1, pages: [page('pg1')] })]

    expect(treeSpot(tree, { kind: 'page', id: 'pg1' })).toEqual({
      parentId: 'm2',
      index: 0,
      siblingCount: 1,
    })
  })

  it('루트 메뉴에는 parentId: null을 준다', () => {
    const tree = [menu('m1'), menu('m2', { sortOrder: 1 })]

    expect(treeSpot(tree, { kind: 'menu', id: 'm2' })).toEqual({
      parentId: null,
      index: 1,
      siblingCount: 2,
    })
  })

  it('자식 메뉴에는 부모 id를 준다', () => {
    const tree = [menu('m1', { children: [menu('m2'), menu('m3', { sortOrder: 1 })] })]

    expect(treeSpot(tree, { kind: 'menu', id: 'm3' })).toEqual({
      parentId: 'm1',
      index: 1,
      siblingCount: 2,
    })
  })

  it('트리에 없으면 null이다', () => {
    expect(treeSpot([menu('m1')], { kind: 'menu', id: 'gone' })).toBeNull()
    expect(treeSpot([menu('m1')], { kind: 'page', id: 'gone' })).toBeNull()
  })

  it('index는 sortOrder 정렬 기준이다 — 응답 배열 순서가 아니다', () => {
    // **서버가 순서대로 준다는 것에 기대지 않는다.** 배열 순서로 세면 `m1`이 0,
    // `sortOrder`로 세면 2다. 화면도 `byOrder`로 다시 세워 그리므로(`menu-tree.tsx`),
    // 배열 기준으로 세면 사용자가 보는 자리와 목적지 계산이 어긋난다.
    const tree = [
      menu('m1', { sortOrder: 2 }),
      menu('m2', { sortOrder: 0 }),
      menu('m3', { sortOrder: 1 }),
    ]

    expect(treeSpot(tree, { kind: 'menu', id: 'm1' })?.index).toBe(2)
    expect(treeSpot(tree, { kind: 'menu', id: 'm2' })?.index).toBe(0)

    // 페이지도 같다 — 저장소 함수가 달라도(`repos/pages.ts`) 화면 쪽 규칙은 하나다.
    const withPages = [
      menu('m1', { pages: [page('pg1', { sortOrder: 1 }), page('pg2', { sortOrder: 0 })] }),
    ]

    expect(treeSpot(withPages, { kind: 'page', id: 'pg1' })?.index).toBe(1)
    expect(treeSpot(withPages, { kind: 'page', id: 'pg2' })?.index).toBe(0)
  })

  it('판정도 sortOrder 정렬 기준이다', () => {
    // `treeSpot`만 고치고 판정을 배열 기준으로 두면 "위로가 활성인데 앞 형제가 없다"가
    // 된다. 배열 첫째(`m1`)가 `sortOrder`로는 막내다.
    const tree = [
      menu('m1', { sortOrder: 2 }),
      menu('m2', { sortOrder: 0 }),
      menu('m3', { sortOrder: 1 }),
    ]

    expect(treeAbilities(tree, { kind: 'menu', id: 'm1' }).moveDown).toBe(false)
    expect(treeAbilities(tree, { kind: 'menu', id: 'm2' }).moveUp).toBe(false)
  })
})

describe('previousMenuSibling', () => {
  it('sortOrder 순으로 바로 앞의 형제를 준다', () => {
    const tree = [
      menu('m1', { sortOrder: 2 }),
      menu('m2', { sortOrder: 0 }),
      menu('m3', { sortOrder: 1 }),
    ]

    expect(previousMenuSibling(tree, 'm1')?.id).toBe('m3')
    expect(previousMenuSibling(tree, 'm3')?.id).toBe('m2')
  })

  it('첫째와 트리에 없는 것에는 null을 준다', () => {
    const tree = [menu('m1'), menu('m2', { sortOrder: 1 })]

    expect(previousMenuSibling(tree, 'm1')).toBeNull()
    expect(previousMenuSibling(tree, 'gone')).toBeNull()
  })

  it('자식 메뉴는 같은 부모 안에서만 앞을 본다', () => {
    // 앞 형제를 트리 전체의 앞 노드로 찾으면 `m3`의 앞이 `m2`가 아니라 다른 층의 것이 된다.
    const tree = [
      menu('m1', { children: [menu('m2'), menu('m3', { sortOrder: 1 })] }),
      menu('m4', { sortOrder: 1 }),
    ]

    expect(previousMenuSibling(tree, 'm3')?.id).toBe('m2')
    expect(previousMenuSibling(tree, 'm2')).toBeNull()
  })
})

describe('menuOutdentTarget', () => {
  it('부모의 부모와 부모의 자리를 준다', () => {
    const tree = [
      menu('m1', { sortOrder: 0 }),
      menu('m2', { sortOrder: 1, children: [menu('m3')] }),
    ]

    // `m3`을 내어쓰면 루트 목록의 `m2` 다음 자리로 간다 — `index + 1`은 호출자가 만든다.
    expect(menuOutdentTarget(tree, 'm3')).toEqual({ parentId: null, index: 1 })
  })

  it('두 층 아래면 조부모 id가 나온다', () => {
    const tree = [menu('m1', { children: [menu('m2', { children: [menu('m3')] })] })]

    expect(menuOutdentTarget(tree, 'm3')).toEqual({ parentId: 'm1', index: 0 })
  })

  it('루트 메뉴와 트리에 없는 것에는 null을 준다', () => {
    const tree = [menu('m1')]

    expect(menuOutdentTarget(tree, 'm1')).toBeNull()
    expect(menuOutdentTarget(tree, 'gone')).toBeNull()
  })
})

describe('flattenMenus', () => {
  it('트리 순서로 평평하게 내고 경로에 조상 제목을 붙인다', () => {
    const tree = [
      menu('m1', { title: '회원관리', sortOrder: 1, children: [menu('m3', { title: '권한' })] }),
      menu('m2', { title: '주문', sortOrder: 0 }),
    ]

    expect(flattenMenus(tree)).toEqual([
      { id: 'm2', path: '주문' },
      { id: 'm1', path: '회원관리' },
      { id: 'm3', path: '회원관리 / 권한' },
    ])
  })

  it('트리에 있는 메뉴를 하나도 빠뜨리지 않는다', () => {
    // **분모를 손으로 적지 않는다** — 트리에서 세어 대조한다. 손으로 적으면 트리가
    // 자랄 때 이 케이스가 조용히 반만 보게 된다.
    const tree = [
      menu('m1', { children: [menu('m2', { children: [menu('m3')] }), menu('m4', { sortOrder: 1 })] }),
      menu('m5', { sortOrder: 1 }),
    ]

    function countMenus(nodes: TreeMenuNode[]): number {
      return nodes.reduce((total, node) => total + 1 + countMenus(node.children), 0)
    }

    expect(flattenMenus(tree)).toHaveLength(countMenus(tree))
  })

  it('메뉴가 없으면 빈 목록이다', () => {
    expect(flattenMenus([])).toEqual([])
  })
})

/**
 * **깨진 트리 입력 — 관문이 막는 것을 판정도 견디는가.**
 *
 * **관문(`SHAPES.treeEnvelope`)이 이 모양 일곱을 전부 `ApiError`로 막는다**(관문에 이 일곱을
 * 먹여 다시 잰다). 그런데도 여기서 값으로 다루는 것은, 관문과 판정이 서로 다른
 * 커밋에서 바뀔 수 있고 그때 나는 사고가 "던져서 셸이 통째로 사라진다"이기 때문이다 —
 * 메뉴 트리에는 오류 경계가 없다(`tree-actions.ts` 머리말).
 *
 * **값으로 다루는 것은 `byOrder`의 배열 가드와 `id` 필터 둘뿐이고, 이 블록은 그 둘로 나뉜다** —
 * 배열 가드를 지우면 `pages`·`children`·`menu`가 배열이 아닌 케이스들이, `id` 필터를 지우면
 * 원소가 노드가 아닌 케이스들이 죽는다. **변이는 그 두 줄을 지우는 것이라 누구나 다시 걸 수 있다.**
 *
 * **수를 손으로 적지 않는다.** *"몇 조합 중 몇 건이 던진다"*는 비교 대상인 구현이 저장소에
 * 없으면 **아무도 다시 확인할 수 없고**, 같은 취지로 다시 쓴 구현은 다른 수를 낸다. 케이스가
 * 늘면 어차피 그 수가 틀린다 — 갈래를 적고 변이를 짚는 편이 스스로 따라간다.
 */
describe('깨진 트리를 넣어도 던지지 않는다', () => {
  const broken: Array<{ label: string; menu: unknown }> = [
    { label: 'pages가 null', menu: [{ id: 'm1', title: '가', sortOrder: 0, pages: null, children: [] }] },
    { label: 'children이 null', menu: [{ id: 'm1', title: '가', sortOrder: 0, pages: [], children: null }] },
    { label: 'pages 키가 없다', menu: [{ id: 'm1', title: '가', sortOrder: 0, children: [] }] },
    {
      label: 'children이 배열 유사 객체',
      menu: [{ id: 'm1', title: '가', sortOrder: 0, pages: [], children: { length: 1 } }],
    },
    {
      label: '자식 안쪽만 깨졌다',
      menu: [
        {
          id: 'm1',
          title: '가',
          sortOrder: 0,
          pages: [],
          children: [{ id: 'm2', title: '나', sortOrder: 0, pages: null, children: [] }],
        },
      ],
    },
    { label: '배열 원소가 null', menu: [null, { id: 'm1', title: '가', sortOrder: 0, pages: [], children: [] }] },
    { label: 'menu 자체가 배열이 아니다', menu: { length: 0 } },
  ]

  for (const { label, menu } of broken) {
    it(label, () => {
      // 타입을 속여 넣는다 — 이 입력은 계약 위반이고, 계약을 지키는 값으로는 이 경로를
      // 재현할 수 없다.
      const tree = menu as TreeMenuNode[]

      expect(() => treeAbilities(tree, { kind: 'menu', id: 'm1' })).not.toThrow()
      expect(() => treeAbilities(tree, { kind: 'page', id: 'pg1' })).not.toThrow()
      expect(() => treeSpot(tree, { kind: 'menu', id: 'm1' })).not.toThrow()
      expect(() => treeSpot(tree, { kind: 'page', id: 'pg1' })).not.toThrow()
      expect(() => previousMenuSibling(tree, 'm1')).not.toThrow()
      expect(() => menuOutdentTarget(tree, 'm2')).not.toThrow()
      expect(() => flattenMenus(tree)).not.toThrow()
    })
  }

  it('배열 안의 null은 형제 수에서 빠진다', () => {
    // 던지지 않는 것만 보면 "원소를 세는 자리가 조용히 어긋난다"를 못 잡는다. `null`을
    // 형제로 세면 `moveDown`이 갈 곳 없는 자리를 활성으로 연다.
    const tree = [
      { id: 'm1', title: '가', sortOrder: 0, pages: [], children: [] },
      null,
    ] as unknown as TreeMenuNode[]

    expect(treeSpot(tree, { kind: 'menu', id: 'm1' })?.siblingCount).toBe(1)
    expect(treeAbilities(tree, { kind: 'menu', id: 'm1' }).moveDown).toBe(false)
  })
})
