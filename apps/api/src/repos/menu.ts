/**
 * 메뉴 트리 저장소. SQL만 안다 — HTTP도 zod도 이 파일 밖의 일이다.
 *
 * API가 주고받는 키는 camelCase, DB 컬럼은 snake_case다. 그 변환은 이 파일이
 * 전담한다 — `routes/menu.ts`는 이미 camelCase로 바뀐 객체만 주고받는다.
 *
 * **정렬 불변식.** `sort_order`는 형제(같은 `project_id`·`parent_id`) 안에서
 * 0부터 시작하는 연속 정수다. 이 파일의 모든 쓰기 경로(생성·이동·재정렬·삭제)가
 * 그 불변식을 유지한 채로 끝나야 한다. 재번호가 필요한 경로는 전부
 * `withTransaction`으로 감싼다 — 이유는 `repos/members.ts`·`repos/projects.ts`와
 * 같다: 이 파일이 던지는 도메인 에러(`ParentNotFoundError` 등)가 DB 제약
 * 위반(FK RESTRICT 등)에서 비롯될 수 있고, 그 실패가 세이브포인트 없이 나면
 * 호출자의 트랜잭션(실제 요청이든 테스트 하네스든) 전체가 aborted(`25P02`)로
 * 빠진다(`src/db/tx.ts` 참고).
 */
import { DatabaseError } from 'pg'
import { sql } from 'kysely'
import { withTransaction, type DbHandle } from '../db/tx'

export interface MenuNodeRecord {
  id: string
  projectId: string
  parentId: string | null
  title: string
  sortOrder: number
}

export interface MenuTreeNode {
  id: string
  title: string
  sortOrder: number
  children: MenuTreeNode[]
}

export interface MenuNodePatch {
  title?: string
  /** `undefined`면 부모를 바꾸지 않는다. `null`이면 루트로 옮긴다. */
  parentId?: string | null
  sortOrder?: number
}

/** `0003-menu-nodes` 마이그레이션이 `parent_id`에 건 자기참조 FK(`ON DELETE RESTRICT`)의 기본 명명 규칙 이름. */
const MENU_NODES_PARENT_FK_CONSTRAINT = 'menu_nodes_parent_id_fkey'

/**
 * `0004-pages` 마이그레이션이 `pages.menu_node_id`에 건 FK(`ON DELETE RESTRICT`)의
 * 기본 명명 규칙 이름(태스크 13) — 페이지를 가진 메뉴를 지우려는 시도도 이 함수가
 * (자식 메뉴와 함께) 같은 `HasChildrenError`로 잡는다.
 */
const PAGES_MENU_NODE_FK_CONSTRAINT = 'pages_menu_node_id_fkey'

/** Postgres 외래키 위반 SQLSTATE. */
const FOREIGN_KEY_VIOLATION = '23503'

function isChildRestrictViolation(error: unknown): boolean {
  return (
    error instanceof DatabaseError &&
    error.code === FOREIGN_KEY_VIOLATION &&
    (error.constraint === MENU_NODES_PARENT_FK_CONSTRAINT || error.constraint === PAGES_MENU_NODE_FK_CONSTRAINT)
  )
}

/** `parentId`가 자기 자신일 때 `assertParentValid`가 던진다. */
export class SelfParentError extends Error {
  constructor() {
    super('메뉴를 자기 자신의 하위로 옮길 수 없습니다')
    this.name = 'SelfParentError'
  }
}

/** `parentId`가 이동 대상 노드의 자손일 때 `assertParentValid`가 던진다. */
export class DescendantParentError extends Error {
  constructor() {
    super('메뉴를 자기 하위 메뉴로 옮길 수 없습니다')
    this.name = 'DescendantParentError'
  }
}

/** `parentId`가 없거나(그 프로젝트 안에서) 다른 프로젝트 소속일 때 던진다. 호출자가 404로 매핑한다. */
export class ParentNotFoundError extends Error {
  constructor() {
    super('상위 메뉴를 찾을 수 없습니다')
    this.name = 'ParentNotFoundError'
  }
}

/**
 * 자식 메뉴나 페이지가 있는 노드를 지우려 할 때 `deleteMenuNode`가 던진다(태스크 13:
 * 처음엔 자식 메뉴만 셌으나, `pages.menu_node_id`도 같은 `ON DELETE RESTRICT`라
 * 페이지를 가진 메뉴도 같은 이유로 막아야 한다).
 */
export class HasChildrenError extends Error {
  constructor() {
    super('하위 메뉴나 페이지가 있어 삭제할 수 없습니다')
    this.name = 'HasChildrenError'
  }
}

function toRecord(row: {
  id: string
  project_id: string
  parent_id: string | null
  title: string
  sort_order: number
}): MenuNodeRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    parentId: row.parent_id,
    title: row.title,
    sortOrder: row.sort_order,
  }
}

/**
 * `(projectId, parentId)` 형제 그룹의 개수를 센다. `parentId`가 `null`이면
 * 루트 노드들(같은 프로젝트에서 `parent_id IS NULL`)을 센다 — Kysely는 `= null`을
 * "항상 거짓"으로 컴파일하므로 `null`/비-`null`을 분기해야 한다.
 */
async function countSiblings(trx: DbHandle, projectId: string, parentId: string | null): Promise<number> {
  let query = trx
    .selectFrom('menu_nodes')
    .select(({ fn }) => [fn.countAll<number>().as('count')])
    .where('project_id', '=', projectId)
  query = parentId === null ? query.where('parent_id', 'is', null) : query.where('parent_id', '=', parentId)
  const result = await query.executeTakeFirstOrThrow()
  return Number(result.count)
}

/**
 * `(projectId, parentId)` 형제 그룹에서 `sort_order > removedIndex`인 행을 전부
 * 하나씩 당긴다(`-1`). 어떤 노드가 그 그룹에서 빠질 때(삭제, 또는 다른 부모로
 * 이동) 뒤에 남은 빈틈을 메운다.
 */
async function closeGap(trx: DbHandle, projectId: string, parentId: string | null, removedIndex: number): Promise<void> {
  let query = trx
    .updateTable('menu_nodes')
    .set({ sort_order: sql`sort_order - 1` })
    .where('project_id', '=', projectId)
    .where('sort_order', '>', removedIndex)
  query = parentId === null ? query.where('parent_id', 'is', null) : query.where('parent_id', '=', parentId)
  await query.execute()
}

/**
 * `(projectId, parentId)` 형제 그룹에서 `sort_order >= insertIndex`인 행을 전부
 * 하나씩 민다(`+1`). 새 노드를 그 위치에 끼워 넣기 전에 자리를 비운다.
 */
async function openGap(trx: DbHandle, projectId: string, parentId: string | null, insertIndex: number): Promise<void> {
  let query = trx
    .updateTable('menu_nodes')
    .set({ sort_order: sql`sort_order + 1` })
    .where('project_id', '=', projectId)
    .where('sort_order', '>=', insertIndex)
  query = parentId === null ? query.where('parent_id', 'is', null) : query.where('parent_id', '=', parentId)
  await query.execute()
}

/**
 * 같은 부모 밑에서 노드 하나를 `oldIndex`에서 `targetIndex`로 옮기고, 그 사이에
 * 낀 형제들을 밀거나 당겨 여전히 0부터 연속하게 만든다. 대상 노드 자신의
 * `sort_order`는 이 함수가 마지막에 직접 갱신한다(형제 갱신 조건절이
 * `sort_order > oldIndex`/`< oldIndex` 형태라 대상 자신은 애초에 걸리지 않는다).
 */
async function reorderWithinSiblings(
  trx: DbHandle,
  projectId: string,
  parentId: string | null,
  nodeId: string,
  oldIndex: number,
  targetIndex: number,
): Promise<void> {
  if (targetIndex === oldIndex) return

  if (targetIndex < oldIndex) {
    // [targetIndex, oldIndex) 구간의 형제들이 한 칸씩 뒤로 밀린다.
    let query = trx
      .updateTable('menu_nodes')
      .set({ sort_order: sql`sort_order + 1` })
      .where('project_id', '=', projectId)
      .where('sort_order', '>=', targetIndex)
      .where('sort_order', '<', oldIndex)
    query = parentId === null ? query.where('parent_id', 'is', null) : query.where('parent_id', '=', parentId)
    await query.execute()
  } else {
    // (oldIndex, targetIndex] 구간의 형제들이 한 칸씩 앞으로 당겨진다.
    let query = trx
      .updateTable('menu_nodes')
      .set({ sort_order: sql`sort_order - 1` })
      .where('project_id', '=', projectId)
      .where('sort_order', '>', oldIndex)
      .where('sort_order', '<=', targetIndex)
    query = parentId === null ? query.where('parent_id', 'is', null) : query.where('parent_id', '=', parentId)
    await query.execute()
  }

  await trx.updateTable('menu_nodes').set({ sort_order: targetIndex }).where('id', '=', nodeId).execute()
}

/**
 * `parentId`가 `projectId` 소속인지 확인하고, `excludeNodeId`가 주어지면
 * (PATCH로 노드를 이동하는 경우) 그 노드 자신이나 자손을 새 부모로 삼으려는
 * 시도를 막는다.
 *
 * - `parentId === excludeNodeId`(자기 자신) → `SelfParentError`(호출자가 400으로 매핑).
 * - `parentId`가 존재하지 않거나 다른 프로젝트 소속 → `ParentNotFoundError`(404).
 *   두 경우를 구분하지 않는다 — 다른 프로젝트의 id가 존재를 흘리면 안 된다
 *   (`projectGuard`의 404/403 원칙과 같은 이유).
 * - `parentId`가 `excludeNodeId`의 자손 → `DescendantParentError`(400). 재귀
 *   CTE(`WITH RECURSIVE`) 한 번으로 확인한다 — 애플리케이션에서 트리를 올려 받아
 *   순회하면 왕복이 늘고 동시 이동과 경합한다(브리프 "금지 규칙" 절 참고).
 */
async function assertParentValid(
  trx: DbHandle,
  projectId: string,
  parentId: string,
  excludeNodeId?: string,
): Promise<void> {
  if (excludeNodeId !== undefined && parentId === excludeNodeId) {
    throw new SelfParentError()
  }

  const parent = await trx
    .selectFrom('menu_nodes')
    .select('id')
    .where('id', '=', parentId)
    .where('project_id', '=', projectId)
    .executeTakeFirst()
  if (!parent) {
    throw new ParentNotFoundError()
  }

  if (excludeNodeId !== undefined) {
    const descendants = await sql<{ id: string }>`
      WITH RECURSIVE descendants AS (
        SELECT id FROM menu_nodes WHERE parent_id = ${excludeNodeId}
        UNION ALL
        SELECT m.id FROM menu_nodes m INNER JOIN descendants d ON m.parent_id = d.id
      )
      SELECT id FROM descendants WHERE id = ${parentId}
    `.execute(trx)
    if (descendants.rows.length > 0) {
      throw new DescendantParentError()
    }
  }
}

/**
 * 태스크 14: 통합 트리(`routes/tree.ts`, 설계 §9)의 페이지 노드. `repos/pages.ts`의
 * 전체 `PageRecord`와 달리 `id`·`title`·`sortOrder` 셋만 담는다 — 트리 응답에
 * `schema`가 실리면 프로젝트가 커질수록 응답이 무거워진다(브리프: 목록이 무거워지면
 * 안 된다). `routes/tree.ts`의 SELECT 자체가 `schema` 컬럼을 고르지 않는다.
 */
export interface TreePage {
  id: string
  title: string
  sortOrder: number
}

/** 태스크 14: 통합 트리의 메뉴 노드. `MenuTreeNode`(위, `listMenuTree` 전용)에 `pages`만 더한 형태다. */
export interface TreeMenuNode {
  id: string
  title: string
  sortOrder: number
  pages: TreePage[]
  children: TreeMenuNode[]
}

/**
 * 태스크 14: `buildMenuTree`가 받는 메뉴 행. `routes/tree.ts`가 `menu_nodes`를 한 번
 * SELECT한 결과(camelCase 변환 없이, DB 컬럼 이름 그대로)를 그대로 넘긴다.
 */
export interface MenuRow {
  id: string
  parent_id: string | null
  title: string
  sort_order: number
}

/**
 * 태스크 14: `buildMenuTree`가 받는 페이지 행. `repos/pages.ts`의 `PageRecord`와
 * 달리 트리 조립에 필요한 네 필드만 담는다 — `schema`는 여기 없다(`repos/pages.ts`의
 * `listPageRows`가 애초에 그 컬럼을 고르지 않는다).
 */
export interface PageRow {
  id: string
  menu_node_id: string
  title: string
  sort_order: number
}

/**
 * 메뉴 트리와 페이지 목록을 각각 한 번씩 받아 메모리에서 하나의 트리로 조립한다
 * (설계 §9, `routes/tree.ts`가 호출자). `listMenuTree`와 달리 **순수 함수**다 — DB
 * 핸들을 받지 않고, 호출자가 이미 한 번씩 조회해 둔 평평한 행 배열만 받는다. 노드마다
 * 페이지를 다시 조회하면 N+1이 되므로, 이 함수가 메모리에서 두 목록을 이어 붙이는
 * 대가로 그 조회 비용을 없앤다.
 *
 * **입력을 신뢰하지 않는다.** DB의 FK와 태스크 12의 재귀 CTE 검사(`assertParentValid`)가
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
 * 형제 그룹 안에서 `sort_order`는 0부터 시작하는 연속 정수라는 불변식(파일 헤더 참고)이
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
      node.pages.push({ id: row.id, title: row.title, sortOrder: row.sort_order })
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

/**
 * `buildMenuTree`가 받을 메뉴 행을 조회한다. 프로젝트의 `menu_nodes`를 정렬 없이
 * 한 번 SELECT할 뿐이다(정렬은 `buildMenuTree`가 스스로 한다) — `routes/tree.ts`가
 * SQL을 직접 쓰지 않고 이 함수를 부르게 해서 계층 규칙(routes는 SQL을 모른다)을
 * 지킨다.
 */
export async function listMenuRows(db: DbHandle, projectId: string): Promise<MenuRow[]> {
  return db
    .selectFrom('menu_nodes')
    .select(['id', 'parent_id', 'title', 'sort_order'])
    .where('project_id', '=', projectId)
    .execute()
}

/**
 * 프로젝트의 메뉴 트리 전체를 조회해 중첩 구조로 조립한다.
 *
 * 한 번의 평평한 SELECT를 `sort_order` 오름차순으로 받아 `parent_id`별로 묶는다.
 * 전체가 `sort_order` 순으로 정렬돼 있으므로, 그 순서 그대로 각 부모의 `children`
 * 배열에 밀어 넣기만 해도(안정 정렬 성질) 형제 안에서의 순서가 보존된다 — 그룹마다
 * 따로 정렬할 필요가 없다.
 */
export async function listMenuTree(db: DbHandle, projectId: string): Promise<MenuTreeNode[]> {
  const rows = await db
    .selectFrom('menu_nodes')
    .select(['id', 'parent_id', 'title', 'sort_order'])
    .where('project_id', '=', projectId)
    .orderBy('sort_order', 'asc')
    .execute()

  const nodeById = new Map<string, MenuTreeNode>()
  for (const row of rows) {
    nodeById.set(row.id, { id: row.id, title: row.title, sortOrder: row.sort_order, children: [] })
  }

  const roots: MenuTreeNode[] = []
  for (const row of rows) {
    // 위 루프에서 이미 채운 맵이라 반드시 존재한다.
    const node = nodeById.get(row.id) as MenuTreeNode
    const parent = row.parent_id === null ? undefined : nodeById.get(row.parent_id)
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }

  return roots
}

/**
 * 메뉴 노드를 만든다. `parentId`가 있으면 같은 프로젝트 소속인지 먼저 확인하고
 * (`assertParentValid`), 새 노드는 그 형제 그룹의 맨 끝(`sort_order = 형제 수`)에 붙는다.
 */
export async function insertMenuNode(
  db: DbHandle,
  projectId: string,
  input: { parentId: string | null; title: string },
): Promise<MenuNodeRecord> {
  return withTransaction(db, async (trx) => {
    if (input.parentId !== null) {
      await assertParentValid(trx, projectId, input.parentId)
    }

    const sortOrder = await countSiblings(trx, projectId, input.parentId)

    const row = await trx
      .insertInto('menu_nodes')
      .values({ project_id: projectId, parent_id: input.parentId, title: input.title, sort_order: sortOrder })
      .returning(['id', 'project_id', 'parent_id', 'title', 'sort_order'])
      .executeTakeFirstOrThrow()

    return toRecord(row)
  })
}

/**
 * 메뉴 노드를 갱신한다. `projectId` 소속이 아니면(다른 프로젝트, 또는 존재하지
 * 않으면) `null`을 돌려준다 — 호출자가 404로 매핑한다.
 *
 * `patch.parentId`가 주어지고 현재 부모와 다르면 "이동"으로 처리한다: 기존 형제
 * 그룹의 빈틈을 메우고(`closeGap`), 새 형제 그룹에 자리를 만든 뒤(`openGap`) 그
 * 자리로 노드를 옮긴다. 대상 위치는 `patch.sortOrder`가 있으면 그 값을(새 형제
 * 수로 클램프), 없으면 맨 끝을 쓴다.
 *
 * `patch.parentId`가 없거나 현재 부모와 같으면(부모는 그대로) `patch.sortOrder`만
 * 같은 형제 그룹 안에서의 재정렬(`reorderWithinSiblings`)로 처리한다.
 *
 * `patch.title`은 부모/순서 처리와 독립적으로 마지막에 적용한다.
 */
export async function updateMenuNode(
  db: DbHandle,
  projectId: string,
  nodeId: string,
  patch: MenuNodePatch,
): Promise<MenuNodeRecord | null> {
  return withTransaction(db, async (trx) => {
    const current = await trx
      .selectFrom('menu_nodes')
      .select(['id', 'parent_id', 'sort_order'])
      .where('id', '=', nodeId)
      .where('project_id', '=', projectId)
      .executeTakeFirst()
    if (!current) return null

    const parentChanging = patch.parentId !== undefined && patch.parentId !== current.parent_id

    if (parentChanging) {
      const newParentId = patch.parentId ?? null
      if (newParentId !== null) {
        await assertParentValid(trx, projectId, newParentId, nodeId)
      }

      const newSiblingCount = await countSiblings(trx, projectId, newParentId)
      const requested = patch.sortOrder ?? newSiblingCount
      const targetIndex = Math.min(requested, newSiblingCount)

      await closeGap(trx, projectId, current.parent_id, current.sort_order)
      await openGap(trx, projectId, newParentId, targetIndex)

      await trx
        .updateTable('menu_nodes')
        .set({ parent_id: newParentId, sort_order: targetIndex })
        .where('id', '=', nodeId)
        .execute()
    } else if (patch.sortOrder !== undefined) {
      const siblingCount = await countSiblings(trx, projectId, current.parent_id)
      const targetIndex = Math.min(patch.sortOrder, siblingCount - 1)
      await reorderWithinSiblings(trx, projectId, current.parent_id, nodeId, current.sort_order, targetIndex)
    }

    if (patch.title !== undefined) {
      await trx.updateTable('menu_nodes').set({ title: patch.title }).where('id', '=', nodeId).execute()
    }

    const updated = await trx
      .selectFrom('menu_nodes')
      .select(['id', 'project_id', 'parent_id', 'title', 'sort_order'])
      .where('id', '=', nodeId)
      .executeTakeFirstOrThrow()
    return toRecord(updated)
  })
}

/**
 * 메뉴 노드를 지운다. 대상이 `projectId` 소속이 아니면(다른 프로젝트, 또는
 * 존재하지 않으면) `'not-found'`를 돌려준다.
 *
 * 자식 메뉴나 페이지가 있으면 `HasChildrenError`를 던진다(호출자가 409로 매핑) —
 * DELETE 문장을 시도하기 전에 둘 다 미리 확인한다(태스크 13: 원래 자식 메뉴만
 * 셌으나, 페이지도 `menu_node_id`로 이 노드를 참조하므로 함께 센다). `parent_id`·
 * `pages.menu_node_id` 양쪽의 `ON DELETE RESTRICT`(`0003-menu-nodes`·`0004-pages`
 * 마이그레이션)가 두 번째 방어선이라, 이 사전 확인과 실제 DELETE 사이에 자식이나
 * 페이지가 생기는 경합이 나더라도 DELETE 문장이 FK 위반으로 실패하고 그 예외를
 * 잡아 같은 `HasChildrenError`로 바꿔 던진다(`isChildRestrictViolation`이 두
 * 제약 이름을 모두 인식한다).
 *
 * 삭제 뒤 남은 형제들을 `closeGap`으로 재번호한다. 전부 한 트랜잭션(`withTransaction`)
 * 안에서 한다.
 */
export async function deleteMenuNode(db: DbHandle, projectId: string, nodeId: string): Promise<'deleted' | 'not-found'> {
  return withTransaction(db, async (trx) => {
    const current = await trx
      .selectFrom('menu_nodes')
      .select(['parent_id', 'sort_order'])
      .where('id', '=', nodeId)
      .where('project_id', '=', projectId)
      .executeTakeFirst()
    if (!current) return 'not-found'

    const child = await trx.selectFrom('menu_nodes').select('id').where('parent_id', '=', nodeId).executeTakeFirst()
    const page = await trx.selectFrom('pages').select('id').where('menu_node_id', '=', nodeId).executeTakeFirst()
    if (child || page) {
      throw new HasChildrenError()
    }

    try {
      await trx.deleteFrom('menu_nodes').where('id', '=', nodeId).execute()
    } catch (error) {
      if (isChildRestrictViolation(error)) {
        throw new HasChildrenError()
      }
      throw error
    }

    await closeGap(trx, projectId, current.parent_id, current.sort_order)

    return 'deleted'
  })
}
