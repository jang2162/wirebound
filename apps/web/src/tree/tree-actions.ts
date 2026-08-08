/**
 * 메뉴 트리 조작을 **하기 전에** 할 수 있는지 판정하는 곳(P2b-4 D5). 화면은 이 결과로
 * 툴바 버튼을 비활성한다 — 눌러 봐야 실패할 버튼을 활성으로 두지 않는다.
 *
 * **순수 함수이고 React·DOM·`fetch`를 모른다.** 판정이 컴포넌트 안에 흩어지면 케이스가
 * 화면을 지나야만 재지고, 툴바와 키보드 단축키가 각자 자기 조건을 갖게 된다.
 *
 * **`edit/structure-actions.ts`와 공유하지 않는 이유:** 구조 트리는 `children` 배열
 * **하나**와 카탈로그 제약을 보고, 메뉴 트리는 `pages`·`children` **두 배열**과 서버
 * 제약을 본다. 판정 규칙이 겹치지 않는다 — 형태만 같다.
 *
 * **던지지 않는 것이 이 파일의 계약이다.** `structure-actions.ts`와 같은 계약이고 근거도
 * 같다: 여기는 렌더 중에 불리는데 **메뉴 트리도 오류 경계 밖이다** — `apps/web/src` 전체에서
 * 경계는 캔버스의 `CanvasBoundary` 하나뿐이라, 던지면 `.wb-shell`이 통째로 DOM에서 사라진다.
 *
 * **재고 적는다(계획서 "계획이 재지 않은 것" #6).** 두 갈래를 다 쟀다.
 *
 * 1. **관문은 오늘 전부 막는다.** `api/http-client.ts`의 `SHAPES.treeEnvelope`가
 *    `isTreeMenuNode`로 **재귀** 검사하고, 그 안에서 `pages`·`children`이 배열인지까지
 *    본다. 깨진 모양 일곱(`pages: null`·`children: null`·`pages` 키 없음·`children`이
 *    배열 유사 객체·자식 안쪽만 깨짐·루트 배열 원소가 `null`·`menu`가 배열 아님)을 가짜
 *    `fetch`로 `getTree`에 태워 재니 **일곱 전부 `ApiError`**였다.
 * 2. **그런데도 소박한 구현은 던졌다.** 같은 일곱을 이 파일의 다섯 함수에 직접 넣어 재니
 *    **35조합 중 20건이 `TypeError`**였다(`treeAbilities`가 가장 많고, `flattenMenus`·
 *    `treeSpot`·`previousMenuSibling`도 났다).
 *
 * 그래서 값으로 다룬다 — 관문과 이 파일은 서로 다른 커밋에서 바뀔 수 있고, 그때 나는
 * 사고가 "화면이 통째로 사라진다"이기 때문이다. **다만 `edit/safe-walk.ts` 같은 별도
 * 모듈은 만들지 않았다**: 그쪽이 필요했던 것은 schema의 `walkNodes`가 던지기 때문이고,
 * 여기 순회는 이 파일 안에 있어 `byOrder` 한 곳으로 닫힌다.
 */
import type { TreeMenuNode, TreePage } from '../api/types'

/** 트리 안에서 고른 것 하나. **여럿을 고를 수 없다**(D3 — 선택은 하나다). */
export type TreeSelection = { kind: 'menu'; id: string } | { kind: 'page'; id: string }

/** 고른 것에 지금 할 수 있는 조작. 화면은 이것으로 버튼을 비활성한다. */
export interface TreeAbilities {
  addMenu: boolean
  addPage: boolean
  rename: boolean
  remove: boolean
  moveUp: boolean
  moveDown: boolean
  indent: boolean
  outdent: boolean
  reparent: boolean
}

/** 선택 대상의 자리. 조작을 실행할 때 부모와 인덱스가 필요하다. */
export interface TreeSpot {
  /** 메뉴면 부모 메뉴 id(루트면 `null`). 페이지면 소속 메뉴 id(항상 있다). */
  parentId: string | null
  /** `sortOrder` 오름차순 형제 배열에서의 자리. */
  index: number
  siblingCount: number
}

const NOTHING: TreeAbilities = {
  addMenu: false,
  addPage: false,
  rename: false,
  remove: false,
  moveUp: false,
  moveDown: false,
  indent: false,
  outdent: false,
  reparent: false,
}

/** 메뉴 하나의 방문 정보. `siblings`는 이미 `sortOrder` 오름차순이다. */
interface MenuVisit {
  node: TreeMenuNode
  parentId: string | null
  siblings: TreeMenuNode[]
  index: number
}

/** 페이지 하나의 방문 정보. 페이지는 항상 메뉴에 속하므로 `menuId`가 `null`이 될 수 없다. */
interface PageVisit {
  menuId: string
  siblings: TreePage[]
  index: number
}

/**
 * 고른 것이 트리에 없으면 전부 `false`다 — **삭제 직후·다른 세션의 변경 뒤에 실제로
 * 생기는 상태다**(D3: 선택은 파생값이라 트리가 바뀌어도 저절로 따라오지 않는다).
 * `structureAbilities`가 문서에 없는 노드에 `NOTHING`을 내는 것과 같은 계약이다.
 *
 * **`remove`가 서버 판정과 겹치는 것은 의도다.** 서버는 자식 메뉴나 페이지가 있는 메뉴의
 * 삭제를 409로 막는다(`apps/api/src/repos/menu.ts`의 `HasChildrenError` → README 엔드포인트
 * 표 "자식 메뉴·페이지가 있으면 409"). 겹치더라도 눌러 봐야 실패할 버튼을 활성으로 두지
 * 않는다 — P2b-2 D7·P2b-3 D3과 같은 정신이다.
 *
 * **페이지의 `indent`·`outdent`가 언제나 불가한 근거(D5):** 들여쓰기는 *"바로 앞 형제의
 * 마지막 자식이 된다"*이다(P2b-3의 정의를 그대로 쓴다). `panels/menu-tree.tsx`의
 * `MenuItem`이 **페이지를 먼저, 자식 메뉴를 나중에** 그리므로 페이지의 앞 형제는 항상
 * 페이지이고, 페이지는 자식을 갖지 못한다(`TreePage`에 `pages`·`children`이 없다).
 * 내어쓰기는 그 역이라 같이 성립하지 않는다. 그래서 페이지를 다른 메뉴로 옮기는 길은
 * `reparent` 하나다.
 */
export function treeAbilities(
  menu: TreeMenuNode[] | null,
  selection: TreeSelection | null,
): TreeAbilities {
  if (menu === null || selection === null) return NOTHING

  if (selection.kind === 'menu') {
    const visit = findMenu(menu, selection.id, null)
    if (visit === null) return NOTHING

    return {
      addMenu: true,
      addPage: true,
      rename: true,
      // **두 배열을 다 본다.** 서버의 FK 제약이 둘을 같은 에러로 잡는다.
      // `byOrder`를 지나는 것은 길이를 세기 위해서가 아니라 배열이 아닌 값에서 던지지
      // 않기 위해서다(머리말의 #6 실측).
      remove:
        byOrder<TreePage>(visit.node.pages).length === 0 &&
        byOrder<TreeMenuNode>(visit.node.children).length === 0,
      moveUp: visit.index > 0,
      moveDown: visit.index < visit.siblings.length - 1,
      // 들여쓰기의 목적지는 앞 형제 메뉴다 — 없으면 갈 곳이 없다. 구조 트리와 달리
      // 그 형제가 자식을 받을 수 있는지는 보지 않는다: 메뉴는 언제나 자식 메뉴를 담는다
      // (카탈로그가 없다).
      indent: visit.index > 0,
      // 부모가 없으면 나갈 곳이 트리 밖이다.
      outdent: visit.parentId !== null,
      reparent: false,
    }
  }

  const visit = findPage(menu, selection.id)
  if (visit === null) return NOTHING

  return {
    // 페이지는 컨테이너가 아니다 — 안에 메뉴도 페이지도 담지 못한다.
    addMenu: false,
    addPage: false,
    rename: true,
    remove: true,
    moveUp: visit.index > 0,
    moveDown: visit.index < visit.siblings.length - 1,
    indent: false,
    outdent: false,
    // **옮길 곳이 자기 소속 메뉴뿐이면 고를 것이 없다.** 메뉴가 둘 이상일 때만 연다.
    reparent: countMenus(menu) > 1,
  }
}

/**
 * 선택 대상의 자리. 트리에 없으면 `null`.
 *
 * **`index`는 `sortOrder` 오름차순으로 정렬한 뒤의 자리이지 응답 배열의 자리가 아니다.**
 *
 * **실측**(P2b-4 웨이브 1에서 `apps/api/test/`에 임시 측정 파일을 두고 재고 지웠다):
 * 루트 메뉴 셋·자식 메뉴 셋·페이지 셋을 만들고 `GET /tree`를 받으면 세 형제 배열이 전부
 * `sortOrder` `[0,1,2]`이고 **배열 순서와 같다.** 가운데를 지운 뒤에도 메뉴가 `[0,1]`,
 * 페이지가 `[0,1]`로 재번호되어 연속이다. 서버 쪽 케이스가 그 불변식을 계속 지킨다 —
 * `apps/api/test/menu.test.ts`의 "sortOrder가 0,1,2로 부여된다"·"남은 형제가 재번호된다"와
 * `pages.test.ts`의 "다른 메뉴로 이동 시 양쪽 메뉴의 sortOrder가 재번호된다".
 *
 * **그런데도 그 값에 기대지 않는다.** 연속이라는 것은 **서버가 지키는 불변식**
 * (`apps/api/src/repos/menu.ts` 머리말: *"모든 쓰기 경로가 그 불변식을 유지한 채로 끝나야
 * 한다"*)이지 이 화면이 지킬 수 있는 것이 아니다 — 화면은 받은 트리를 그대로 그려야 하고
 * `panels/menu-tree.tsx`도 응답을 `byOrder`로 다시 세운다. 그래서 목적지 계산(Task 7)은
 * `node.sortOrder`가 아니라 이 `index`를 쓴다.
 */
export function treeSpot(menu: TreeMenuNode[], selection: TreeSelection): TreeSpot | null {
  if (selection.kind === 'menu') {
    const visit = findMenu(menu, selection.id, null)
    if (visit === null) return null
    return { parentId: visit.parentId, index: visit.index, siblingCount: visit.siblings.length }
  }

  const visit = findPage(menu, selection.id)
  if (visit === null) return null
  return { parentId: visit.menuId, index: visit.index, siblingCount: visit.siblings.length }
}

/**
 * 들여쓰기 목적지 — `sortOrder` 순으로 바로 앞의 형제 메뉴. 없으면 `null`.
 *
 * **첫째를 따로 막지 않는다.** 처음에는 `visit.index === 0`을 가드로 두었는데 **지워도
 * 0 사망이었다**(실측). 갈리는 자리가 없어서다: 첫째면 `siblings[-1]`이 `undefined`이고
 * `?? null`이 그것을 계약값으로 바꾼다 — `noUncheckedIndexedAccess` 때문에 그 `??`는
 * 어차피 있어야 한다. **닫는 케이스를 만드는 대신 잉여인 가드를 걷어냈다**(P2b-3의
 * "0 사망이면 케이스를 더하는 것이 항상 답은 아니다").
 */
export function previousMenuSibling(menu: TreeMenuNode[], menuId: string): TreeMenuNode | null {
  const visit = findMenu(menu, menuId, null)
  if (visit === null) return null
  return visit.siblings[visit.index - 1] ?? null
}

/**
 * 내어쓰기 목적지 — 부모의 부모 id와 **부모 자신의 자리**. 부모가 없으면 `null`.
 *
 * 부모의 자리를 주는 것은 내어쓴 노드가 부모의 **다음** 형제가 되기 때문이다 — 그 계산
 * (`index + 1`)은 호출자가 한다. 여기서는 자리만 알려 주고 `sortOrder`를 만들지 않는다.
 */
export function menuOutdentTarget(
  menu: TreeMenuNode[],
  menuId: string,
): { parentId: string | null; index: number } | null {
  const visit = findMenu(menu, menuId, null)
  if (visit === null || visit.parentId === null) return null

  const parent = findMenu(menu, visit.parentId, null)
  if (parent === null) return null
  return { parentId: parent.parentId, index: parent.index }
}

/**
 * 소속 메뉴 고르기 목록. 트리 순서(각 층 `sortOrder` 오름차순)로 평평하게, 조상 제목을
 * 이어 붙인 경로와 함께 낸다.
 *
 * **경로가 필요한 이유:** 제목이 같은 메뉴가 여럿일 수 있어 제목만으로는 어느 것인지
 * 가려지지 않는다. 서버 쪽에 제목 유일성 제약이 보이지 않는다 — `0003-menu-nodes.ts`의
 * `title`은 `notNull`뿐이고 `repos/menu.ts`·`routes/menu.ts`에도 중복 판정이 없다
 * (**소스를 읽은 것이고 같은 제목을 실제로 두 번 만들어 보지는 않았다**).
 */
export function flattenMenus(menu: TreeMenuNode[]): { id: string; path: string }[] {
  const flat: { id: string; path: string }[] = []

  function walk(nodes: TreeMenuNode[], prefix: string): void {
    for (const node of byOrder<TreeMenuNode>(nodes)) {
      const path = prefix === '' ? node.title : `${prefix} / ${node.title}`
      flat.push({ id: node.id, path })
      walk(node.children, path)
    }
  }

  walk(menu, '')
  return flat
}

/**
 * 메뉴 하나를 찾아 그 자리까지 준다. 못 찾으면 `null`.
 *
 * 형제 배열을 `byOrder`로 세운 뒤 자리를 세는 것이 요점이다 — 그래야 `index`가 화면이
 * 그리는 순서와 같다(`panels/menu-tree.tsx`도 같은 정렬을 쓴다).
 */
function findMenu(
  nodes: TreeMenuNode[],
  menuId: string,
  parentId: string | null,
): MenuVisit | null {
  const siblings = byOrder<TreeMenuNode>(nodes)

  for (const [index, node] of siblings.entries()) {
    if (node.id === menuId) return { node, parentId, siblings, index }
  }

  for (const node of siblings) {
    const found = findMenu(node.children, menuId, node.id)
    if (found !== null) return found
  }

  return null
}

/** 페이지 하나를 찾아 소속 메뉴와 그 안의 자리를 준다. 못 찾으면 `null`. */
function findPage(nodes: TreeMenuNode[], pageId: string): PageVisit | null {
  for (const node of byOrder<TreeMenuNode>(nodes)) {
    const siblings = byOrder<TreePage>(node.pages)

    for (const [index, page] of siblings.entries()) {
      if (page.id === pageId) return { menuId: node.id, siblings, index }
    }

    const found = findPage(node.children, pageId)
    if (found !== null) return found
  }

  return null
}

/** 트리 전체의 메뉴 수. `reparent` 판정이 "옮길 곳이 있는가"를 이것으로 본다. */
function countMenus(nodes: TreeMenuNode[]): number {
  return byOrder<TreeMenuNode>(nodes).reduce((total, node) => total + 1 + countMenus(node.children), 0)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 형제 배열을 `sortOrder` 오름차순으로 세운다. **이 파일의 순회가 전부 여기를 지난다** —
 * 머리말의 "던지지 않는 계약"이 닫히는 자리가 한 곳인 것이 요점이다.
 *
 * **배열이 아니면 빈 배열로 본다.** `null`·객체를 받으면 전개·`for…of`가 그 자리에서
 * 던지는데, 그 예외를 잡는 오류 경계가 이 트리 위에 없다.
 *
 * **원소 중 `id`가 문자열이 아닌 것은 버린다.** 배열 안의 `null`에서 `node.id`를 읽으면
 * 같은 이유로 던진다(`edit/safe-walk.ts`가 구조 트리에서 잡은 것과 같은 모양이다).
 *
 * `filter`가 이미 새 배열을 만들므로 정렬해도 원본의 순서는 바뀌지 않는다 — 응답 배열을
 * 제자리에서 뒤집으면 그것을 들고 있는 다른 곳의 순서까지 바뀐다.
 */
function byOrder<T extends { id: string; sortOrder: number }>(items: unknown): T[] {
  if (!Array.isArray(items)) return []

  return items
    .filter((item): item is T => isRecord(item) && typeof item['id'] === 'string')
    .sort((a, b) => a.sortOrder - b.sortOrder)
}
