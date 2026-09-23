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
import { assertNoNulBytes } from '../db/nul-guard'
import { withTransaction, type DbHandle } from '../db/tx'
import { assertLocking } from '../db/locking'
import type { MenuRow } from '../services/menu-tree'
import { lockProjectTree } from './projects'

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
 * 기본 명명 규칙 이름 — 페이지를 가진 메뉴를 지우려는 시도도 이 함수가
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

/** 제목의 NUL 을 거절할 때 문장이 부르는 이름(`db/nul-guard.ts`의 `NulByteError`). */
const MENU_TEXT = '메뉴 제목'

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
 * 자식 메뉴나 페이지가 있는 노드를 지우려 할 때 `deleteMenuNode`가 던진다(처음엔
 * 자식 메뉴만 셌으나, `pages.menu_node_id`도 같은 `ON DELETE RESTRICT`라
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
 * 프로젝트의 메뉴 노드 전부를 **평평하게** 낸다(P6-1 스냅샷 캡처가 부른다).
 *
 * `listMenuRows`·`listMenuTree`와 셋이 비슷해 보이지만 내는 것이 다르다:
 *
 * | 함수 | 내는 것 | 소비자 |
 * |---|---|---|
 * | `listMenuRows` | **snake_case 행** 그대로 | `buildMenuTree`(`services/menu-tree.ts`) |
 * | `listMenuTree` | 중첩 트리 | `GET .../menu` |
 * | `listMenuNodes` (여기) | camelCase **평평한 목록** | 스냅샷 캡처 |
 *
 * 캡처가 트리를 받지 않는 이유는 payload가 트리를 접지 않기 때문이다 —
 * `parentId`가 구조를 나른다(`@wirebound/themes`의 `snapshot/payload.ts`). 캡처가 `listMenuRows`를
 * 대신 쓰지 않는 이유는 그쪽이 snake_case를 그대로 흘려 **키 변환이 repo 밖으로 새기**
 * 때문이다(README "계층 규칙").
 *
 * **정렬이 결정적이어야 한다** — 같은 상태를 두 번 캡처하면 payload가 같아야 하고,
 * 그래야 `payloadBytes`나 payload 비교가 뜻을 갖는다.
 *
 * **`sort_order`만으로는 결정적이지 않다 — 재서 알았다.** 그 값은 **형제 그룹 안에서만**
 * 뜻이 있어서(`db/types.ts`의 `MenuNodesTable`) 루트 노드와 그 자식이 **둘 다 0**을 갖는다.
 * 처음에 `ORDER BY sort_order, id`로 짰더니 `['설정', '사용자 관리']`(부모, 자식)를 넣은
 * 프로젝트에서 `['사용자 관리', '설정']`이 나왔다 — 동률이 uuid 순으로 갈린 것이다.
 *
 * 그래서 `parent_id NULLS FIRST`를 앞에 둔다: **루트가 먼저, 그다음 부모별로 묶여** 각
 * 그룹 안에서 `sort_order` 순이다. **트리 순회(깊이 우선)는 아니다** — 부모끼리의 순서는
 * uuid 순이라 사람이 읽는 순서와 다를 수 있다. 그래도 되는 이유는 payload가 트리를 접지
 * 않고 `parentId`가 구조를 나르기 때문이다(`@wirebound/themes`의 `snapshot/payload.ts`). 여기서 필요한
 * 것은 **같은 상태면 같은 순서**이지 보기 좋은 순서가 아니다.
 */
export async function listMenuNodes(db: DbHandle, projectId: string): Promise<MenuNodeRecord[]> {
  const rows = await db
    .selectFrom('menu_nodes')
    .select(['id', 'project_id', 'parent_id', 'title', 'sort_order'])
    .where('project_id', '=', projectId)
    .orderBy(sql`parent_id nulls first`)
    .orderBy('sort_order', 'asc')
    .orderBy('id', 'asc')
    .execute()

  return rows.map(toRecord)
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
  // 제목의 NUL — 판정과 번역자는 `db/nul-guard.ts`의 `NulByteError`가 소유한다.
  assertNoNulBytes(MENU_TEXT, input.title)
  return withTransaction(db, async (trx) => {
    // **트리 쓰기의 첫 잠금**(`repos/projects.ts`의 `lockProjectTree`) — 형제 수를 세고 그 자리에 넣는 사이에 옆 생성이
    // 같은 수를 세지 않게.
    await lockProjectTree(trx, projectId)
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
 * 메뉴 제목을 **행 잠금을 잡고** 읽는다 — 메뉴 제목의 충돌 모델(이월 5차 ② — `routes/menu.ts`의 `PATCH` 머리말)이
 * «지금 값»과 «고치기 전 값»(`base`)을 견주는 자리다. `repos/pages.ts`의 `lockPageMeta`와 같은 이유로 **견주기와 쓰기가
 * 한 잠금 안**이어야 한다(잠금 없이 견주면 같은 바탕의 둘이 다 통과해 나중이 조용히 이긴다). 대상이 그 프로젝트
 * 소속이 아니면 `null`이다.
 *
 * **`FOR NO KEY UPDATE`다**(`lockPageMeta`는 `FOR UPDATE`) — 제목 쓰기끼리만 줄을 세우면 된다. `FOR UPDATE`면 이 메뉴
 * 밑에 페이지 · 하위 메뉴를 만드는 FK 삽입(부모 행에 `FOR KEY SHARE`)까지 제목 쓰기 뒤에 선다.
 *
 * **트리 쓰기의 첫 잠금(`lockProjectTree`)을 안 잡는다** — 제목은 형제를 안 건드린다. 그래서 바탕 경로는 자리 옮기기와
 * 한 본문에 못 온다(`routes/menu.ts`의 `UpdateMenuBody` — 오면 «이 행 → 프로젝트 행»으로 거꾸로 선다).
 */
export async function lockMenuTitle(trx: DbHandle, projectId: string, nodeId: string): Promise<string | null> {
  assertLocking(trx, 'lockMenuTitle')
  const row = await trx
    .selectFrom('menu_nodes')
    .select('title')
    .where('id', '=', nodeId)
    .where('project_id', '=', projectId)
    .forNoKeyUpdate()
    .executeTakeFirst()
  return row?.title ?? null
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
  assertNoNulBytes(MENU_TEXT, patch.title)
  return withTransaction(db, async (trx) => {
    // **자리를 옮기면 트리 쓰기의 첫 잠금을 맨 먼저 잡는다**(`repos/projects.ts`의 `lockProjectTree`) — 형제를 다시
    // 매기기 전에, 그리고 지금 자리를 읽기 전에(잠금 뒤에 읽어야 앞 쓰기가 옮긴 자리를 본다). 제목만 바꾸면 안 잡는다.
    if (patch.parentId !== undefined || patch.sortOrder !== undefined) await lockProjectTree(trx, projectId)
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
 * DELETE 문장을 시도하기 전에 둘 다 미리 확인한다(원래 자식 메뉴만
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
    // 남은 형제를 당긴다 — 트리 쓰기의 첫 잠금이 먼저다(`repos/projects.ts`의 `lockProjectTree`).
    await lockProjectTree(trx, projectId)
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

/**
 * 프로젝트의 메뉴 행 전부를 `FOR UPDATE`로 잠근다(P6-2 D8). **복원 전용이다.**
 *
 * 잠금이 실제로 무엇을 막는지는 `repos/snapshots.ts`의 `lockProjectForRestore` 머리말에
 * 실측표로 있다 — 이 함수 하나만으로는 **새 루트 메뉴 삽입을 못 막는다**(잠금은 이미
 * 있는 행에만 걸리고 Postgres에 술어 잠금이 없다). 그 구멍은 `projects` 행을 함께
 * 잠그는 것으로 닫힌다.
 *
 * `trx.isTransaction`을 확인하는 이유는 `lockPageForEdit`과 같다 — 트랜잭션 밖에서
 * 부르면 문장이 끝나는 순간 잠금이 함께 풀려, **잠갔다고 믿는 코드가 아무것도 안 잠근
 * 채로 돈다.**
 */
export async function lockProjectMenuNodes(trx: DbHandle, projectId: string): Promise<void> {
  assertLocking(trx, 'lockProjectMenuNodes')
  await trx.selectFrom('menu_nodes').select('id').where('project_id', '=', projectId).forUpdate().execute()
}

/**
 * **id를 받아** 메뉴 노드를 만든다(P6-2 D3 — *"복원이지 복제가 아니다"*).
 *
 * `insertMenuNode`와 갈리는 지점이 둘이다: (ㄱ) id를 발급하지 않고 **payload의 것을 그대로
 * 쓴다**, (ㄴ) `sort_order`를 형제 수로 계산하지 않고 **주어진 값을 그대로 쓴다.** 둘 다
 * 복원이 *"그때의 그 값"*을 되돌리는 일이기 때문이다 — 계산하면 payload와 어긋난다.
 *
 * **`assertParentValid`를 부르지 않는다.** 부모의 유효성은 `services/restore-plan.ts`가
 * 이미 판정했고(`dangling-reference`), 순서도 그쪽이 정한다(부모가 자식보다 먼저).
 * 마지막 방벽은 `menu_nodes_parent_id_fkey`다.
 *
 * **기존 `insertMenuNode`를 고치지 않았다** — 그쪽이 id를 만들어 내고 맨 끝에 붙이는
 * 성질은 `POST .../menu`의 계약이다(계획서 D3: *"기존 호출자가 id를 만들어 내는 성질은
 * 그대로 둔다"*).
 */
export async function insertMenuNodeWithId(
  trx: DbHandle,
  projectId: string,
  input: { id: string; parentId: string | null; title: string; sortOrder: number },
): Promise<void> {
  await trx
    .insertInto('menu_nodes')
    .values({
      id: input.id,
      project_id: projectId,
      parent_id: input.parentId,
      title: input.title,
      sort_order: input.sortOrder,
    })
    .execute()
}

/**
 * 메뉴 노드의 부모·제목·순서를 **주어진 값 그대로** 쓴다(복원 전용).
 *
 * `updateMenuNode`와 갈리는 지점은 **재번호를 하지 않는 것**이다. 그쪽은 형제 그룹의
 * 빈틈을 메우고 자리를 밀어 0부터 연속하게 만드는데, 복원은 payload의 값 전부를 그대로
 * 쓰므로 그 계산이 **payload를 덮어쓴다.** payload의 값들은 캡처 시점에 이미 그 불변식을
 * 만족했으므로(캡처 대상 DB가 이 파일의 규칙으로 유지됐다), 그대로 쓰는 것이 곧 불변식이다.
 */
export async function writeMenuNodePlacement(
  trx: DbHandle,
  projectId: string,
  input: { id: string; parentId: string | null; title: string; sortOrder: number },
): Promise<void> {
  await trx
    .updateTable('menu_nodes')
    .set({ parent_id: input.parentId, title: input.title, sort_order: input.sortOrder })
    .where('id', '=', input.id)
    .where('project_id', '=', projectId)
    .execute()
}

/**
 * 메뉴 노드 행 하나를 **재번호 없이** 지운다(복원 전용).
 *
 * `deleteMenuNode`를 쓰지 않는 이유가 `closeGap`이다 — 그쪽은 남은 형제의 `sort_order`를
 * 당기는데, 복원은 **계획을 세운 뒤에** 지우므로 그 당김이 계획이 본 값을 바꿔 버린다
 * (계획이 *"이 페이지는 순서가 그대로다"*라고 판정한 뒤 값이 움직인다).
 *
 * **자식·페이지 확인도 하지 않는다.** 순서는 계획이 정한다(자식이 부모보다 먼저, 살아남는
 * 자식은 먼저 옮긴다). 그래도 `menu_nodes_parent_id_fkey`·`pages_menu_node_id_fkey`가
 * 남아 있어, 계획이 틀렸다면 **조용히 통과하지 않고 FK 위반으로 크게 죽는다** — 그리고
 * 복원 전체가 한 트랜잭션이라(D1) 아무것도 남지 않는다.
 */
export async function deleteMenuNodeRow(trx: DbHandle, projectId: string, nodeId: string): Promise<void> {
  await trx.deleteFrom('menu_nodes').where('id', '=', nodeId).where('project_id', '=', projectId).execute()
}
