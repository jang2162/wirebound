/**
 * 메뉴 트리 조작을 **하기 전에** 할 수 있는지 판정하는 곳. 화면은 이 결과로
 * 줄 행동의 항목을 끈다 — 눌러 봐야 실패할 항목을 켜 두지 않는다.
 *
 * **순수 함수이고 React·DOM·`fetch`를 모른다.** 판정이 컴포넌트 안에 흩어지면 케이스가
 * 화면을 지나야만 재지고, 툴바와 키보드 단축키가 각자 자기 조건을 갖게 된다.
 *
 * **`edit/structure-actions.ts`와 공유하지 않는 이유:** 구조 트리는 `children` 배열
 * **하나**와 카탈로그 제약을 보고, 메뉴 트리는 `pages`·`children` **두 배열**과 서버
 * 제약을 본다. 판정 규칙이 겹치지 않는다 — 형태만 같다.
 *
 * **JSON으로 표현할 수 있고 스택에 들어가는 트리에 대해 던지지 않는 것이 이 파일의 계약이다.**
 * `structure-actions.ts`와 같은 계약이고 근거도 같다: 여기는 렌더 중에 불리는데 **메뉴 트리도
 * 오류 경계 밖이다** — `apps/web/src`의 경계는 캔버스의 `CanvasBoundary` 하나라, 던지면 `.wb-shell`이 통째로 DOM에서 사라진다.
 *
 * **완결성 어휘는 잰 범위까지다.** 계약 밖인 두 부류를 재서 적는다.
 *
 * **1. 순환 트리**(노드가 자기 조상을 `children`에 담는다).
 *
 * 갈리는 것은 노드의 **자리**가 아니라 **순회가 목표를 순환에 들어가기 전에 만나는가**다.
 * `findMenu`는 한 배열의 형제를 **전부 본 뒤** 그 형제들의 자식 서브트리로 순서대로 내려가고,
 * `findPage`는 노드마다 `pages`를 본 뒤 **바로** 그 노드의 자식으로 내려간다. 순회가 순환
 * 서브트리에 먼저 닿으면 거기서 `RangeError`가 난다.
 *
 * 손으로 만든 순환 트리 아홉 프로브로 쟀다(`값`=반환, `X`=`RangeError`):
 *
 * | 트리 · 찾는 것 | abilities | spot | prevSib | outdent | flatten |
 * |---|---|---|---|---|---|
 * | `[m1(자기순환)]` · `m1` | 값 | 값 | 값 | 값 | **X** |
 * | `[m1(자기순환)]` · 없는 메뉴 | X | X | X | X | X |
 * | `m1>m2>m1` · `m2`(둘째 층) | 값 | 값 | 값 | 값 | **X** |
 * | `m1>m2>m3>m1` · `m3`(셋째 층) | 값 | 값 | 값 | 값 | **X** |
 * | `[m1(자기순환), m2]` · `m2`(같은 층 뒤 형제) | 값 | 값 | 값 | 값 | **X** |
 * | `[m1>m3, m2(자기순환)]` · `m3`(**앞** 형제의 자식) | 값 | 값 | 값 | 값 | **X** |
 * | `[m1(자기순환), m2>m3]` · `m3`(**뒤** 형제의 자식) | **X** | **X** | **X** | **X** | X |
 * | `[m1(자기순환)]` · **그 노드 자신의** 페이지 | **X** | 값 | X | X | X |
 * | `[m1(자기순환), …]` · 그 밖의 페이지(없는 페이지 / 뒤 형제 쪽) | X | **X** | X | X | X |
 *
 * 읽어야 할 것 넷:
 *
 * - **자리가 깊어도 값을 낸다.** 둘째·셋째 층 목표가 값을 낸다 — "첫 층인가"는 조건이 아니다.
 * - **트리에 있어도 못 찾을 수 있다.** 순환이 **앞** 형제에 있으면 뒤 형제의 자식에 영영
 *   닿지 않는다. 같은 층의 뒤 형제는 첫 루프에서 먼저 만나므로 값을 낸다.
 * - **페이지 갈래에서 `treeSpot`이 값을 내는 것은 마지막 두 행이 갈라 주는 좁은 경우다.**
 *   페이지 프로브 넷을 재니 값을 낸 것은 **하나**(자기순환 루트가 그 페이지를 직접 가진 경우)
 *   뿐이고 나머지 셋은 `treeSpot`도 `X`였다. **그리고 여기서 두 순회의 차이가 드러난다** —
 *   `[m1(자기순환), m2]`에서 목표가 **메뉴** `m2`면 값이지만(형제를 먼저 본다), 목표가 `m2`의
 *   **페이지**면 `X`다(`findPage`는 `m1`의 자식으로 먼저 내려간다).
 *   `treeSpot`이 성공해도 `treeAbilities`가 `X`인 것은 `countMenus(menu)`가 **트리 전체를 다시
 *   걷기** 때문이다. `previousMenuSibling`·`menuOutdentTarget`은 메뉴 id를 받는 함수라 페이지
 *   id에는 "없는 메뉴"와 같이 동작한다.
 * - **`flattenMenus`는 목표가 없어 전체를 걷는다** — 그래서 위 표 어느 행에서도 값을 내지
 *   않는다. **다만 "순환이 있으면 반드시 던진다"는 아니다:** 순환 노드의 `id`가 문자열이
 *   아니면 `byOrder`의 `id` 필터가 그 노드를 통째로 버려 순회가 순환에 들어가지 않는다.
 *   실측 — `[m1, {id: 123}(자기순환)]`·`[m1, {id 없음}(자기순환)]`이 `[{id:'m1',…}]`을 내고,
 *   같은 자리에 `id: 'm2'`를 두면 `RangeError`다. **순환과 다른 깨진 모양이 겹친 입력이라
 *   좁다.**
 *
 * **도달 불가다:** 이 트리의 유일한 입구가 `getTree`(`panels/menu-tree.tsx` 한 곳만 부른다)
 * 이고 JSON 텍스트에 순환을 적는 문법이 없다. 실측으로도 순환 객체는 `JSON.stringify`가
 * `TypeError`로 거절하고, `getTree`가 낸 값은 순환이 아니었다.
 *
 * **위 표는 지금의 관측이지 계약이 아니다 — 그래서 케이스로 고정하지 않는다.** 값은 순회
 * 순서에 딸린 것이라, `findMenu`를 순수 깊이 우선으로 바꾸기만 해도 칸이 달라진다. 케이스로
 * 못박으면 계약 밖 동작을 계약으로 만들어 그 리팩터링을 부당하게 막는다. **표가 말하는 것은
 * "던지지 않는다"가 순환 트리까지 덮지 않는다는 사실 하나다.**
 *
 * **2. 매우 깊은 트리.**
 *
 * **관문과 이 파일 중 무엇이 먼저 죽는지는 고정이 아니다 — JIT 예열 상태에 따라 뒤집힌다.**
 * 프로토콜 셋으로 쟀다(칸마다 새 프로세스):
 *
 * | 프로토콜 | 관측된 순서 |
 * |---|---|
 * | 완전 냉간(프로세스당 호출 하나) | 관문과 `treeAbilities`·`treeSpot`이 **같은 깊이**에서 죽고 `flattenMenus`가 더 오래 산다 |
 * | 얕은 입력으로 3000회 예열 뒤 | **판정이 먼저** 죽는다(관문은 통과하는 깊이에서 `treeAbilities`·`treeSpot`이 `RangeError`) |
 * | 관문에 이분 탐색 3회를 먼저 돌린 뒤 | **판정이 먼저** 죽는다(3/3 동일). 관문 임계가 같은 프로세스 안에서 회차마다 커진다 |
 *
 * **그러므로 "관문을 지나온 트리는 이 파일을 무너뜨리지 못한다"고 적을 수 없다** — 관문을
 * 통과한 깊이에서 이 파일이 던지는 조합이 재현된다.
 * 절대값은 환경과 예열에 달려 크게 흔들리므로 적지 않는다.
 *
 * **읽기 경로에 JSON 장벽은 없다.** *"`JSON.stringify`/`parse`가 수천 단계에서 먼저
 * 죽는다"*는 `parse`에 대해 거짓이다: `stringify` 없이 손으로 만든 깊은 JSON
 * 텍스트로 재니 **`JSON.parse`는 깊이 100만도 통과한다**(이분 탐색이 상한에 부딪혔다).
 * 수천 단계에서 죽는 것은 `JSON.stringify` 하나이고, **응답을 읽는 경로에서 클라이언트는
 * 트리를 `stringify` 하지 않는다**(`request`가 그것을 쓰는 것은 요청 본문뿐이다).
 *
 * **관문과 이 파일 — 두 갈래를 다 쟀다.**
 *
 * 1. **관문은 지금 전부 막는다.** `api/http-client.ts`의 `SHAPES.treeEnvelope`가
 *    `isTreeMenuNode`로 **재귀** 검사하고, 그 안에서 `pages`·`children`이 배열인지까지
 *    본다. 깨진 모양 일곱(`pages: null`·`children: null`·`pages` 키 없음·`children`이
 *    배열 유사 객체·자식 안쪽만 깨짐·루트 배열 원소가 `null`·`menu`가 배열 아님)을 가짜
 *    `fetch`로 `getTree`에 태워 재니 **일곱 전부 `ApiError`**였다.
 * 2. **그런데도 배열 가드가 없는 형태는 던진다.** 같은 일곱을 값으로 다루는 것은 `byOrder`의
 *    **배열 가드와 `id` 필터 두 줄뿐**이고, 각각을 지우면 테스트의 `깨진 트리를 넣어도 던지지
 *    않는다`가 두 갈래로 나뉘어 죽는다(배열이 아닌 값 / 원소가 노드가 아닌 값).
 *    **수치를 손으로 적지 않는다** — 그 형태가 저장소에 없는 수는 다시 확인할 수 없어 틀려도
 *    틀린 줄 모른다. 변이는 그 두 줄을 지우는 것이라 누구나 다시 걸 수 있다.
 *
 * 그래서 값으로 다룬다 — 관문과 이 파일은 서로 다른 커밋에서 바뀔 수 있고, 그때 나는
 * 사고가 "화면이 통째로 사라진다"이기 때문이다. **다만 `edit/safe-walk.ts` 같은 별도
 * 모듈은 두지 않는다**: 그쪽이 필요했던 것은 schema의 `walkNodes`가 던지기 때문이고,
 * 여기 순회는 이 파일 안에 있어 `byOrder` 한 곳으로 닫힌다.
 */
import type { TreeMenuNode, TreePage } from '../api/types'

/** 트리 안에서 고른 것 하나. **여럿을 고를 수 없다**(선택은 하나다). */
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
 * 생기는 상태다**(선택은 파생값이라 트리가 바뀌어도 저절로 따라오지 않는다).
 * `structureAbilities`가 문서에 없는 노드에 `NOTHING`을 내는 것과 같은 계약이다.
 *
 * **메뉴의 `remove`는 찾으면 늘 참이다.** 하위가 없으면 본문 없는 `DELETE`(204), 있으면 확인 상자가 함께 지울 것을 보인 뒤 연쇄
 * 삭제(`ApiClient.deleteMenuCascade`)로 간다 — 본문 없는 `DELETE`는 하위가 있으면 409 라(apps/api README «메뉴 연쇄 삭제») 그 판에서
 * 쓰지 않는다.
 *
 * **페이지의 `indent`·`outdent`가 언제나 불가한 근거:** 들여쓰기는 *"바로 앞 형제의
 * 마지막 자식이 된다"*이다(구조 트리의 들여쓰기와 같은 정의다). `panels/menu-tree.tsx`의
 * `MenuItem`이 **페이지를 먼저, 자식 메뉴를 나중에** 그리므로 페이지의 앞 형제는 항상
 * 페이지이고, 페이지는 자식을 갖지 못한다(`TreePage`에 `pages`·`children`이 없다).
 * 내어쓰기는 그 역이라 같이 성립하지 않는다. 그래서 페이지를 다른 메뉴로 옮기는 길은
 * `reparent` 하나다.
 */
export function treeAbilities(menu: TreeMenuNode[] | null, selection: TreeSelection | null): TreeAbilities {
  if (menu === null || selection === null) return NOTHING

  if (selection.kind === 'menu') {
    const visit = findMenu(menu, selection.id, null)
    if (visit === null) return NOTHING

    return {
      addMenu: true,
      addPage: true,
      rename: true,
      // 하위가 있어도 지운다 — 하위가 있으면 확인 상자가 함께 지울 것을 보이고 연쇄 삭제로 보낸다(`menuSubtree` ·
      // `use-tree-commands.tsx`의 `askRemove`).
      remove: true,
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
 * **실측**(다시 재는 법: api 하네스로 메뉴·페이지를 만들어 `GET /tree`를 받는다):
 * 루트 메뉴 셋·자식 메뉴 셋·페이지 셋을 만들고 `GET /tree`를 받으면 세 형제 배열이 전부
 * `sortOrder` `[0,1,2]`이고 **배열 순서와 같다.** 가운데를 지운 뒤에도 메뉴가 `[0,1]`,
 * 페이지가 `[0,1]`로 재번호되어 연속이다. 서버 쪽 케이스가 그 불변식을 계속 지킨다 —
 * `apps/api/test/menu.test.ts`의 "sortOrder가 0,1,2로 부여된다"·"남은 형제가 재번호된다"와
 * `pages.test.ts`의 "다른 메뉴로 이동 시 양쪽 메뉴의 sortOrder가 재번호된다".
 *
 * **그런데도 그 값에 기대지 않는다.** 연속이라는 것은 **서버가 지키는 불변식**
 * (`apps/api/src/repos/menu.ts` 머리말: *"모든 쓰기 경로가 그 불변식을 유지한 채로 끝나야
 * 한다"*)이지 이 화면이 지킬 수 있는 것이 아니다 — 화면은 받은 트리를 그대로 그려야 하고
 * `panels/menu-tree.tsx`도 응답을 `byOrder`로 다시 세운다. 그래서 목적지 계산은
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
 * **첫째를 따로 막지 않는다.** `visit.index === 0` 가드는 **지워도 아무 케이스도 죽지
 * 않는다** — 갈리는 자리가 없어서다: 첫째면 `siblings[-1]`이 `undefined`이고
 * `?? null`이 그것을 계약값으로 바꾼다 — `noUncheckedIndexedAccess` 때문에 그 `??`는
 * 어차피 있어야 한다. **잉여인 가드는 닫는 케이스를 더하는 대신 두지 않는다** — 아무것도
 * 안 죽는 변이에 케이스를 더하는 것이 항상 답은 아니다.
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
export function menuOutdentTarget(menu: TreeMenuNode[], menuId: string): { parentId: string | null; index: number } | null {
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
 * 가려지지 않는다. **실측**(api 하네스): 같은 제목으로 메뉴를 **형제로** 두 번 만들어도,
 * 그 아래 **자식으로** 또 만들어도 전부 201이다. 서버 쪽에 막는 것이 없다 —
 * `0003-menu-nodes.ts`의 `title`은 `notNull`뿐이고 `repos/menu.ts`·`routes/menu.ts`에도
 * 중복 판정이 없다.
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
function findMenu(nodes: TreeMenuNode[], menuId: string, parentId: string | null): MenuVisit | null {
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

/**
 * 메뉴 하나가 가진 자식 메뉴 · 페이지의 수. 메뉴가 트리에 없으면 `null`. 드래그가 «안에 놓기»의 자리(맨 뒤)를 세는 데 쓴다
 * (`tree-drop.ts`). 순회를 이 파일에 두는 것은 머리말 «관문과 이 파일» — `byOrder` 한 곳으로 닫는다.
 */
export function menuChildCount(menu: TreeMenuNode[], menuId: string, kind: 'menu' | 'page'): number | null {
  const visit = findMenu(menu, menuId, null)
  if (visit === null) return null
  return kind === 'menu' ? byOrder<TreeMenuNode>(visit.node.children).length : byOrder<TreePage>(visit.node.pages).length
}

/** 트리 전체의 메뉴 수. `reparent` 판정이 "옮길 곳이 있는가"를 이것으로 본다. */
/**
 * 메뉴 하나의 밑 — 연쇄 삭제의 확인 상자가 보이고 그 id 를 서버에 싣는 것(`api/client.ts`의 `SubtreeSeen`). 꼴이 서버 409 의 지금
 * 목록(`SubtreeListing`)과 같아 상자는 어느 쪽이든 같은 길로 그린다.
 */
export interface MenuSubtree {
  title: string
  /** 밑의 메뉴 — 자기는 안 든다. 트리가 그리는 차례(아래 `pages`와 같은 순회). */
  menus: { id: string; title: string }[]
  /** 자기와 밑의 메뉴에 매인 페이지 — 트리가 그리는 차례(메뉴마다 페이지 먼저, 그다음 하위 메뉴). */
  pages: { id: string; title: string }[]
}

/** 메뉴의 밑을 센다. 트리에 없으면 `null`. */
export function menuSubtree(menu: TreeMenuNode[] | null, menuId: string): MenuSubtree | null {
  if (menu === null) return null
  const visit = findMenu(menu, menuId, null)
  if (visit === null) return null
  const pages: MenuSubtree['pages'] = []
  const menus: MenuSubtree['menus'] = []
  const walk = (node: TreeMenuNode): void => {
    for (const page of byOrder<TreePage>(node.pages)) pages.push({ id: page.id, title: page.title })
    for (const child of byOrder<TreeMenuNode>(node.children)) {
      menus.push({ id: child.id, title: child.title })
      walk(child)
    }
  }
  walk(visit.node)
  return { title: visit.node.title, menus, pages }
}

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

  return items.filter((item): item is T => isRecord(item) && typeof item['id'] === 'string').sort((a, b) => a.sortOrder - b.sortOrder)
}
