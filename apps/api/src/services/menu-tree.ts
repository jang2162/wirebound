/**
 * 메뉴 트리 조립.
 *
 * 이 함수는 SQL을 한 줄도 쓰지 않는 **순수 함수**다 — 호출자가 이미 조회해 둔
 * 평평한 행 배열 두 개를 받아 메모리에서 트리를 만든다. SQL이 없으므로 "라우트는 SQL을
 * 직접 쓰지 않는다"는 계층 규칙 때문에 `repos/`에 둘 까닭이 없다.
 *
 * `services/`는 SQL을 직접 쓰지 않고 HTTP도 모르는 계층이다 — 순수 도메인 함수와
 * repo 조율이 여기 산다.
 */

/**
 * 통합 트리(`routes/tree.ts`, 설계서 「설계서 화면 구조」)의 페이지 노드. `repos/pages.ts`의
 * 전체 `PageRecord`와 달리 `id`·`title`·`sortOrder` · `viewStates` 넷만 담는다 — 트리 응답에
 * `schema`가 실리면 프로젝트가 커질수록 응답이 무거워진다. `repos/pages.ts`의
 * `listPageRows` 는 문서에서 상태 목록(`schema->'viewStates'`)만 고른다.
 *
 * `viewStates` 는 메뉴 트리의 상태 줄이 쓴다(설계 spec `2026-10-18-modules-states-layout-design.md` 「C3」 — 열린 페이지는 열린 문서에서, 다른
 * 페이지는 이것으로). 상태가 없는 페이지는 `[]`. 모양이 틀린 항목(손으로 넣은 행)은 뺀다.
 */
export interface TreePage {
  id: string
  title: string
  sortOrder: number
  viewStates: TreeViewState[]
}

/** 트리 응답의 상태 하나 — 문서의 `ViewState` 와 같은 모양. */
export interface TreeViewState {
  id: string
  name: string
  parent?: string
}

/** 통합 트리의 메뉴 노드. `repos/menu.ts`의 `MenuTreeNode`(`listMenuTree` 전용)에 `pages`만 더한 형태다. */
export interface TreeMenuNode {
  id: string
  title: string
  sortOrder: number
  pages: TreePage[]
  children: TreeMenuNode[]
}

/**
 * `buildMenuTree`가 받는 메뉴 행. `repos/menu.ts`의 `listMenuRows`가 `menu_nodes`를 한 번
 * SELECT한 결과(camelCase 변환 없이, DB 컬럼 이름 그대로)를 그대로 넘긴다.
 */
export interface MenuRow {
  id: string
  parent_id: string | null
  title: string
  sort_order: number
}

/**
 * `buildMenuTree`가 받는 페이지 행. `repos/pages.ts`의 `PageRecord`와
 * 달리 트리 조립에 필요한 네 필드만 담는다 — `schema`는 여기 없다(`repos/pages.ts`의
 * `listPageRows`가 애초에 그 컬럼을 고르지 않는다).
 */
export interface PageRow {
  id: string
  menu_node_id: string
  title: string
  sort_order: number
  /** 문서의 상태 목록(`schema->'viewStates'` — jsonb 그대로). 없으면 상태가 없는 페이지다. */
  view_states?: unknown
}

/** 문서에서 읽은 상태 목록을 트리 응답의 모양으로 — 배열이 아니면 `[]`, 모양이 틀린 항목은 뺀다. */
function treeViewStates(value: unknown): TreeViewState[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry: unknown) => {
    if (entry === null || typeof entry !== 'object') return []
    const { id, name, parent } = entry as { id?: unknown; name?: unknown; parent?: unknown }
    if (typeof id !== 'string' || typeof name !== 'string') return []
    return [typeof parent === 'string' ? { id, name, parent } : { id, name }]
  })
}

/**
 * 메뉴 트리와 페이지 목록을 각각 한 번씩 받아 메모리에서 하나의 트리로 조립한다
 * (설계서 「설계서 화면 구조」, `routes/tree.ts`가 호출자). `listMenuTree`와 달리 **순수 함수**다 — DB
 * 핸들을 받지 않고, 호출자가 이미 한 번씩 조회해 둔 평평한 행 배열만 받는다. 노드마다
 * 페이지를 다시 조회하면 N+1이 되므로, 이 함수가 메모리에서 두 목록을 이어 붙이는
 * 대가로 그 조회 비용을 없앤다.
 *
 * **입력을 신뢰하지 않는다.** DB의 FK와 `repos/menu.ts`의 재귀 CTE 검사(`assertParentValid`)가
 * 순환 참조나 존재하지 않는 부모를 이미 막고 있지만, 이 함수는 그 보장에 기대지
 * 않는다 — 순수 함수이므로 어떤 배열이 들어와도 예외 없이, 무한 루프 없이 끝나야 한다.
 *
 * - **고아 노드**(`parent_id`가 입력에 없는 id를 가리키는 노드)는 결과 어디에도
 *   나타나지 않는다 — 루트로 승격시키지 않고 조용히 버린다. `listMenuTree`가 같은
 *   상황(부모를 못 찾음)에서 루트로 승격시키는 것과 의도적으로 다르다: `listMenuTree`는
 *   DB가 그 상황 자체를 막아 주므로 문제되지 않지만, 이 함수는 DB 보장 밖에서도
 *   스스로 방어해야 한다.
 * - **순환 참조**도 예외나 무한 루프 없이 끝난다. 알고리즘이 각 노드를 정확히 한 번씩만
 *   순회하며 부모→자식 간선을 잇기 때문이다(재귀로 부모 사슬을 타지 않는다) — 순환에
 *   갇힌 노드들은 어느 루트에서도 도달할 수 없는 채로 남아 반환값에 나타나지 않을
 *   뿐, 그 자체가 무한 루프를 일으키지 않는다.
 *
 * 정렬은 입력 배열의 순서에 기대지 않고 이 함수가 직접 `sort_order`로 정렬한다 —
 * 형제 그룹 안에서 `sort_order`는 0부터 시작하는 연속 정수라는 불변식(`repos/menu.ts`의 머리말)이
 * 있으므로, 전체를 한 번 정렬해도 같은 부모 밑 형제들의 상대 순서가 그대로 보존된다
 * (`Array.prototype.sort`는 안정 정렬이다 — 서로 다른 부모에 속한 노드들이 우연히
 * 같은 `sort_order` 값을 가져도 형제 그룹 내부 순서에는 영향이 없다).
 */
export function buildMenuTree(nodes: MenuRow[], pages: PageRow[]): TreeMenuNode[] {
  const sortedNodes = [...nodes].sort((a, b) => a.sort_order - b.sort_order)
  const sortedPages = [...pages].sort((a, b) => a.sort_order - b.sort_order)

  const nodeById = new Map<string, TreeMenuNode>()
  for (const row of sortedNodes) {
    nodeById.set(row.id, { id: row.id, title: row.title, sortOrder: row.sort_order, pages: [], children: [] })
  }

  for (const row of sortedPages) {
    const node = nodeById.get(row.menu_node_id)
    // 소속 메뉴 노드가 입력에 없으면(정상 데이터로는 있을 수 없다 — pages.menu_node_id는
    // NOT NULL FK다) 그 페이지도 고아 노드와 같은 이유로 조용히 버린다.
    if (node) {
      node.pages.push({ id: row.id, title: row.title, sortOrder: row.sort_order, viewStates: treeViewStates(row.view_states) })
    }
  }

  const roots: TreeMenuNode[] = []
  for (const row of sortedNodes) {
    const node = nodeById.get(row.id) as TreeMenuNode // 위 루프에서 이미 채운 맵이라 반드시 존재한다.
    if (row.parent_id === null) {
      roots.push(node)
      continue
    }
    const parent = nodeById.get(row.parent_id)
    if (parent) {
      parent.children.push(node)
    }
    // else: 고아 노드. 부모가 입력에 없으므로 루트에도, 다른 노드의 children에도 넣지
    // 않는다 — 이 분기가 "결과에서 빠진다"는 요구를 구현하는 지점이다. 순환 참조도
    // 이 분기를 그대로 통과한다: A의 부모가 B, B의 부모가 A라면 둘 다 parent 조회가
    // 성공해 서로의 children에 들어가지만, 어느 쪽도 roots에는 들어가지 않는다 — 결국
    // roots에서 시작해 도달할 수 없는 고립된 쌍이 되어 반환값에 나타나지 않는다.
  }

  return roots
}
