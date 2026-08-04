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

/** Postgres 외래키 위반 SQLSTATE. */
const FOREIGN_KEY_VIOLATION = '23503'

function isChildRestrictViolation(error: unknown): boolean {
  return (
    error instanceof DatabaseError &&
    error.code === FOREIGN_KEY_VIOLATION &&
    error.constraint === MENU_NODES_PARENT_FK_CONSTRAINT
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

/** 자식이 있는 노드를 지우려 할 때 `deleteMenuNode`가 던진다. */
export class HasChildrenError extends Error {
  constructor() {
    super('하위 메뉴가 있어 삭제할 수 없습니다')
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
 * 자식이 있으면 `HasChildrenError`를 던진다(호출자가 409로 매핑) — DELETE
 * 문장을 시도하기 전에 미리 확인한다. `parent_id`의 `ON DELETE RESTRICT`
 * (`0003-menu-nodes` 마이그레이션)가 두 번째 방어선이라, 이 사전 확인과 실제
 * DELETE 사이에 자식이 생기는 경합이 나더라도 DELETE 문장이 FK 위반으로 실패하고
 * 그 예외를 잡아 같은 `HasChildrenError`로 바꿔 던진다.
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
    if (child) {
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
