/**
 * 페이지 저장소. SQL만 안다 — HTTP도 zod도 스키마 검증(카탈로그 게이트)도 이 파일
 * 밖의 일이다. `routes/pages.ts`와 `services/edit-pipeline.ts`가 `@wirebound/schema`의
 * `migrateDocument`·`validatePage`를 부른 뒤, 검증을 통과한 `PageDocument`만 이 파일에
 * 넘긴다.
 *
 * **`schema`를 쓰는 함수는 `writePageSchemaAtSeq` 하나뿐이고, 그 유일한 호출자는
 * 편집 파이프라인이다.** revision 없이 `schema`만 갱신하는 함수를
 * 여기 두지 않는다 — 그런 함수가 있으면 나중에 누군가 그것을 부르는 순간 `head_seq`와
 * 문서가 조용히 어긋나고, 그 페이지의 undo가 엉뚱한 문서 위에서 돈다.
 *
 * API가 주고받는 키는 camelCase, DB 컬럼은 snake_case다. 그 변환은 이 파일이
 * 전담한다 — `routes/pages.ts`는 이미 camelCase로 바뀐 객체만 주고받는다.
 *
 * `schema` 컬럼은 `JSONColumnType<PageDocument>`(`db/types.ts`)다. 삽입·갱신은
 * `JSON.stringify`한 문자열을 넘기고, 조회는 파싱된 객체를 그대로 쓴다 — 이
 * 비대칭은 컬럼 타입이 명시하는 그대로다.
 *
 * **정렬 불변식.** `sort_order`는 형제(같은 `menu_node_id`) 안에서 0부터 시작하는
 * 연속 정수다(`repos/menu.ts`의 `sort_order`와 같은 규칙, 다만 페이지는 항상 실제
 * 메뉴 노드 하나에 매달리므로 `parent_id`처럼 `null` 그룹을 다루지 않는다). 이
 * 파일의 모든 쓰기 경로(생성·이동·재정렬·삭제)가 그 불변식을 유지한 채로 끝난다.
 *
 * 재번호·메뉴 이동이 필요한 경로는 전부 `withTransaction`으로 감싼다 —
 * `repos/menu.ts`와 같은 이유다: 이 파일이 던지는 도메인 에러(`MenuNodeNotFoundError`)
 * 자체는 어떤 DB 문장을 시도하기 전에 애플리케이션 검사에서 나오지만, 그 검사
 * 뒤에 실제로 실행하는 INSERT/UPDATE는 `menu_node_id`의 `ON DELETE RESTRICT`(FK)
 * 위반을 낼 수 있는 경합 창(사전 확인과 문장 실행 사이에 그 메뉴 노드가 지워지는
 * 경우)이 있다. 그 실패가 세이브포인트 없이 나면 호출자의 트랜잭션(실제 요청이든
 * 테스트 하네스든) 전체가 aborted(`25P02`)로 빠진다(`src/db/tx.ts` 참고).
 */
import { sql } from 'kysely'
import { samePageMeta, type PageDocument } from '@wirebound/schema'
import { withTransaction, type DbHandle } from '../db/tx'
import { assertLocking } from '../db/locking'
import { assertNoNulBytes } from '../db/nul-guard'
import { deletePageComments } from './comments'
import { lockProjectTree } from './projects'

/** 제목·설명의 NUL 을 거절할 때 문장이 부르는 이름. 가져오기도 같은 문장을 낸다(같은 `insertPage`를 지난다). */
const PAGE_TEXT = '페이지 제목·설명'

export interface PageRecord {
  id: string
  projectId: string
  menuNodeId: string
  title: string
  description: string | null
  sortOrder: number
  schemaVersion: number
  schema: PageDocument
  /** 이 페이지의 최신 revision seq. `db/types.ts`의 `PagesTable.head_seq` 참고. */
  headSeq: number
}

export interface PagePatch {
  title?: string
  description?: string | null
  /** `undefined`면 메뉴를 바꾸지 않는다. */
  menuNodeId?: string
  sortOrder?: number
}

/**
 * **페이지 메타 — 제목 · 설명.** 충돌 모델(`routes/pages.ts`의 `PATCH` 머리말)이 견주는 값이다.
 * 순서 · 소속 메뉴는 여기 없다 — 그 둘은 이 모델 밖이다.
 */
export interface PageMeta {
  title: string
  description: string | null
}

/** 견줄 칸. 칸 이름이 `PageMeta`의 키와 같다 — 요청의 `base`가 그 키로 온다. */
export type PageMetaField = keyof PageMeta

/**
 * 페이지 메타를 **행 잠금을 잡고** 읽는다 — `SELECT title, description … FOR UPDATE`.
 *
 * 충돌 모델이 «지금 값»과 «고치기 전 값»(`base`)을 견주는 자리다. **견주기와 쓰기가 한 잠금 안이어야 한다** —
 * 잠금 없이 읽고 견주면 둘이 같은 바탕으로 동시에 와서 둘 다 통과한다(나중이 조용히 이긴다 — 고치려던 바로 그것).
 * `lockPageForEdit`과 같은 이유로 트랜잭션 핸들만 받는다. 대상이 그 프로젝트 소속이 아니면 `null`이다.
 */
export async function lockPageMeta(trx: DbHandle, projectId: string, pageId: string): Promise<PageMeta | null> {
  assertLocking(trx, 'lockPageMeta')
  const row = await trx
    .selectFrom('pages')
    .select(['title', 'description'])
    .where('id', '=', pageId)
    .where('project_id', '=', projectId)
    .forUpdate()
    .executeTakeFirst()
  return row ? { title: row.title, description: row.description } : null
}

/**
 * 페이지 행 하나를 **읽지 않고 잡는다** — `SELECT id … FOR UPDATE`. 부르는 자리는 편집의 2차 방어(`lock/check.ts`의
 * `lockConflictError`)다 — 판정과 커밋을 이 행 안에 두려고 잡을 뿐 메타도 문서도 안 쓴다(메타를 견주는 자리는 `lockPageMeta`).
 * 대상이 `projectId` 소속이 아니면 `false`다.
 */
export async function lockPageRow(trx: DbHandle, projectId: string, pageId: string): Promise<boolean> {
  assertLocking(trx, 'lockPageRow')
  const row = await trx
    .selectFrom('pages')
    .select('id')
    .where('id', '=', pageId)
    .where('project_id', '=', projectId)
    .forUpdate()
    .executeTakeFirst()
  return row !== undefined
}

/**
 * `base`가 지금 값과 **다른 칸**. 빈 배열이면 통과다. **글자 그대로 견준다** — 서버가 제목 · 설명을 정규화하지
 * 않는다. **하나만 뺀다 — 빈 값은 `''`든 `null`이든 같다**(`@wirebound/schema`의 `samePageMeta` — 화면의 판정과
 * 같은 함수다. 저장은 둘을 가른다 — `apps/web/src/api/client.ts`의 `updatePage` 표).
 */
export function staleMetaFields(base: Partial<PageMeta>, current: PageMeta): PageMetaField[] {
  return (Object.keys(base) as PageMetaField[]).filter((field) => !samePageMeta(base[field] ?? null, current[field]))
}

/** `menuNodeId`가 없거나(그 프로젝트 안에서) 다른 프로젝트 소속일 때 던진다. 호출자가 404로 매핑한다. */
export class MenuNodeNotFoundError extends Error {
  constructor() {
    super('메뉴를 찾을 수 없습니다')
    this.name = 'MenuNodeNotFoundError'
  }
}

const PAGE_COLUMNS = [
  'id',
  'project_id',
  'menu_node_id',
  'title',
  'description',
  'sort_order',
  'schema_version',
  'schema',
  'head_seq',
] as const

interface PageRow {
  id: string
  project_id: string
  menu_node_id: string
  title: string
  description: string | null
  sort_order: number
  schema_version: number
  schema: PageDocument
  /** `pg`가 int8을 문자열로 준다(`db/types.ts`의 `head_seq` 컬럼 타입 참고). */
  head_seq: string
}

function toRecord(row: PageRow): PageRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    menuNodeId: row.menu_node_id,
    title: row.title,
    description: row.description,
    sortOrder: row.sort_order,
    schemaVersion: row.schema_version,
    schema: row.schema,
    // head_seq는 pg가 문자열로 주는 bigint다 — API 응답은 number여야 하므로 경계에서 변환한다.
    headSeq: Number(row.head_seq),
  }
}

/**
 * `menuNodeId`가 `projectId` 소속인지 확인한다. 아니면(존재하지 않거나 다른
 * 프로젝트 소속) `MenuNodeNotFoundError`를 던진다 — `repos/menu.ts`의
 * `assertParentValid`와 같은 이유로, 다른 프로젝트의 id가 존재를 흘리면 안 되므로
 * 두 경우를 구분하지 않는다.
 */
async function assertMenuNodeValid(trx: DbHandle, projectId: string, menuNodeId: string): Promise<void> {
  const node = await trx
    .selectFrom('menu_nodes')
    .select('id')
    .where('id', '=', menuNodeId)
    .where('project_id', '=', projectId)
    .executeTakeFirst()
  if (!node) {
    throw new MenuNodeNotFoundError()
  }
}

async function countPagesInMenuNode(trx: DbHandle, menuNodeId: string): Promise<number> {
  const result = await trx
    .selectFrom('pages')
    .select(({ fn }) => [fn.countAll<number>().as('count')])
    .where('menu_node_id', '=', menuNodeId)
    .executeTakeFirstOrThrow()
  return Number(result.count)
}

/** `menuNodeId` 형제 그룹에서 `sort_order > removedIndex`인 행을 전부 하나씩 당긴다(`-1`). */
async function closeGap(trx: DbHandle, menuNodeId: string, removedIndex: number): Promise<void> {
  await trx
    .updateTable('pages')
    .set({ sort_order: sql`sort_order - 1` })
    .where('menu_node_id', '=', menuNodeId)
    .where('sort_order', '>', removedIndex)
    .execute()
}

/** `menuNodeId` 형제 그룹에서 `sort_order >= insertIndex`인 행을 전부 하나씩 민다(`+1`). */
async function openGap(trx: DbHandle, menuNodeId: string, insertIndex: number): Promise<void> {
  await trx
    .updateTable('pages')
    .set({ sort_order: sql`sort_order + 1` })
    .where('menu_node_id', '=', menuNodeId)
    .where('sort_order', '>=', insertIndex)
    .execute()
}

/** 같은 메뉴 밑에서 페이지 하나를 `oldIndex`에서 `targetIndex`로 옮기고, 그 사이 형제를 밀거나 당긴다(`repos/menu.ts`의 `reorderWithinSiblings`와 같은 방식). */
async function reorderWithinSiblings(
  trx: DbHandle,
  menuNodeId: string,
  pageId: string,
  oldIndex: number,
  targetIndex: number,
): Promise<void> {
  if (targetIndex === oldIndex) return

  if (targetIndex < oldIndex) {
    await trx
      .updateTable('pages')
      .set({ sort_order: sql`sort_order + 1` })
      .where('menu_node_id', '=', menuNodeId)
      .where('sort_order', '>=', targetIndex)
      .where('sort_order', '<', oldIndex)
      .execute()
  } else {
    await trx
      .updateTable('pages')
      .set({ sort_order: sql`sort_order - 1` })
      .where('menu_node_id', '=', menuNodeId)
      .where('sort_order', '>', oldIndex)
      .where('sort_order', '<=', targetIndex)
      .execute()
  }

  await trx.updateTable('pages').set({ sort_order: targetIndex }).where('id', '=', pageId).execute()
}

/**
 * 페이지를 만든다. `menuNodeId`가 `projectId` 소속인지 먼저 확인하고, 새 페이지는
 * 그 형제 그룹의 맨 끝(`sort_order = 형제 수`)에 붙는다. `schema`는 호출자
 * (`routes/pages.ts`)가 만든 기본 문서(`{ version, root: { id, type: 'Page', children: [] } }`)를 그대로 받는다 — 이 파일은 문서 내용을 모른다.
 */
export async function insertPage(
  db: DbHandle,
  projectId: string,
  input: { menuNodeId: string; title: string; description: string | null; schema: PageDocument; schemaVersion: number },
): Promise<PageRecord> {
  // **가져오기도 여기를 지난다** — 제목·설명의 NUL 판정은 이 자리 하나다(`db/nul-guard.ts`의 `NulByteError`).
  assertNoNulBytes(PAGE_TEXT, input.title, input.description)
  return withTransaction(db, async (trx) => {
    // **트리 쓰기의 첫 잠금**(`repos/projects.ts`의 `lockProjectTree`) — 형제 수를 세고 그 자리에 넣는 사이에 옆 생성이
    // 같은 수를 세지 않게(잠그지 않으면 같은 메뉴에 둘이 동시에 올 때 `sort_order`가 겹친다).
    await lockProjectTree(trx, projectId)
    await assertMenuNodeValid(trx, projectId, input.menuNodeId)

    const sortOrder = await countPagesInMenuNode(trx, input.menuNodeId)

    const row = await trx
      .insertInto('pages')
      .values({
        project_id: projectId,
        menu_node_id: input.menuNodeId,
        title: input.title,
        description: input.description,
        sort_order: sortOrder,
        schema: JSON.stringify(input.schema),
        schema_version: input.schemaVersion,
      })
      .returning(PAGE_COLUMNS)
      .executeTakeFirstOrThrow()

    return toRecord(row)
  })
}

/** id로 페이지 하나를 조회한다. `projectId` 소속이 아니면(다른 프로젝트, 또는 존재하지 않으면) `null`이다. */
export async function findPageById(db: DbHandle, projectId: string, pageId: string): Promise<PageRecord | null> {
  const row = await db
    .selectFrom('pages')
    .select(PAGE_COLUMNS)
    .where('id', '=', pageId)
    .where('project_id', '=', projectId)
    .executeTakeFirst()
  return row ? toRecord(row) : null
}

/**
 * `services/menu-tree.ts`의 `buildMenuTree`가 받을 페이지 행을 조회한다.
 * 프로젝트의 `pages`에서 `id`·`menu_node_id`·`title`·`sort_order` 네 필드만 고른다 —
 * `schema`는 여기서 애초에 select하지 않는다(통합 트리 응답에 스키마가 실리면
 * 프로젝트가 커질수록 무거워진다). 반환 타입은 `services/menu-tree.ts`의 `PageRow`와
 * 구조적으로 같다 — 이 파일 안의 (비공개) `PageRow`(전체 컬럼을 담는 타입)와
 * 이름이 겹치므로 그 타입을 직접 import하지 않고 인라인으로 선언한다.
 *
 * `routes/tree.ts`가 이 함수를 부른다 — routes는 SQL을 직접 쓰지 않는다는
 * 계층 규칙(`apps/api/README.md` 「계층 규칙」 절)을 지킨다.
 */
export async function listPageRows(
  db: DbHandle,
  projectId: string,
): Promise<Array<{ id: string; menu_node_id: string; title: string; sort_order: number }>> {
  return db
    .selectFrom('pages')
    .select(['id', 'menu_node_id', 'title', 'sort_order'])
    .where('project_id', '=', projectId)
    .execute()
}

/**
 * 프로젝트의 페이지 전부를 **`schema`까지 담아** 낸다(스냅샷 캡처가 부른다).
 *
 * **`listPageRows`와 갈리는 지점이 `schema` 하나다.** 그쪽은 트리 응답용이라 스키마를
 * 애초에 select하지 않는다(*"통합 트리 응답에 스키마가 실리면 프로젝트가 커질수록
 * 무거워진다"*). 캡처는 반대로 **문서 자체가 담을 것**이라 빼면 스냅샷이 아무것도 얼리지
 * 못한다.
 *
 * **마이그레이션하지 않는다.** 이 파일의 다른 읽기와 마찬가지로 `schema`를
 * DB에 있는 그대로 낸다. 저장된 버전이 `CURRENT_DOCUMENT_VERSION`보다 큰 페이지가 하나만
 * 있어도 캡처 전체가 실패하는 일이 없어야 하기 때문이고, 그 성질은 이 파일이 애초에
 * `@wirebound/schema`의 `migrateDocument`를 부르지 않는 데서 나온다(재는 법:
 * `schema_version`을 999로 심으면 `findPageById`는 999를 그대로 내고 `GET` 라우트만 400이다).
 *
 * **정렬이 결정적이어야 한다** — `listMenuNodes`와 같은 이유다.
 */
export async function listPages(db: DbHandle, projectId: string): Promise<PageRecord[]> {
  const rows = await db
    .selectFrom('pages')
    .select(PAGE_COLUMNS)
    .where('project_id', '=', projectId)
    .orderBy('menu_node_id', 'asc')
    .orderBy('sort_order', 'asc')
    .orderBy('id', 'asc')
    .execute()

  return rows.map(toRecord)
}

/**
 * 페이지의 제목·설명·소속 메뉴·순서를 갱신한다. `schema`는 이 함수의 책임이
 * 아니다 — 문서를 바꾸는 유일한 경로는 편집 파이프라인(`services/edit-pipeline.ts`)이고,
 * 이 파일에서 그 경로가 쓰는 함수는 `lockPageForEdit`·`writePageSchemaAtSeq` 둘뿐이다.
 *
 * 대상이 `projectId` 소속이 아니면 `null`을 돌려준다(호출자가 404로 매핑).
 *
 * `patch.menuNodeId`가 주어지고 현재 메뉴와 다르면 "이동"으로 처리한다:
 * 기존 형제 그룹의 빈틈을 메우고(`closeGap`), 새 형제 그룹에 자리를 만든 뒤
 * (`openGap`) 그 자리로 옮긴다(`repos/menu.ts`의 `updateMenuNode`와 같은 방식).
 * `patch.menuNodeId`가 없거나 현재와 같으면 `patch.sortOrder`만 같은 형제 그룹
 * 안에서의 재정렬로 처리한다.
 *
 * `title`·`description`은 위 처리와 독립적으로 마지막에 한 번에 적용하고,
 * `updated_at`도 그 자리에서 함께 갱신한다 — 어떤 필드가 바뀌었든(메뉴 이동·
 * 순서만 바뀐 경우 포함) 페이지가 갱신됐다는 사실은 같다.
 */
export async function updatePage(
  db: DbHandle,
  projectId: string,
  pageId: string,
  patch: PagePatch,
): Promise<PageRecord | null> {
  assertNoNulBytes(PAGE_TEXT, patch.title, patch.description)
  return withTransaction(db, async (trx) => {
    // **자리를 옮기면 트리 쓰기의 첫 잠금을 맨 먼저 잡는다**(`repos/projects.ts`의 `lockProjectTree`) — 지금 자리를 읽기
    // 전에. 제목 · 설명만 바꾸면 안 잡는다(그 쓰기는 이 행 하나만 잡는다 — `routes/pages.ts`의 `PATCH` 머리말).
    if (patch.menuNodeId !== undefined || patch.sortOrder !== undefined) await lockProjectTree(trx, projectId)
    const current = await trx
      .selectFrom('pages')
      .select(['id', 'menu_node_id', 'sort_order'])
      .where('id', '=', pageId)
      .where('project_id', '=', projectId)
      .executeTakeFirst()
    if (!current) return null

    const menuChanging = patch.menuNodeId !== undefined && patch.menuNodeId !== current.menu_node_id

    if (menuChanging) {
      // menuChanging이 true이면 patch.menuNodeId는 반드시 정의돼 있다(위 조건절 참고).
      const newMenuNodeId = patch.menuNodeId as string
      await assertMenuNodeValid(trx, projectId, newMenuNodeId)

      const newSiblingCount = await countPagesInMenuNode(trx, newMenuNodeId)
      const requested = patch.sortOrder ?? newSiblingCount
      const targetIndex = Math.min(requested, newSiblingCount)

      await closeGap(trx, current.menu_node_id, current.sort_order)
      await openGap(trx, newMenuNodeId, targetIndex)

      await trx
        .updateTable('pages')
        .set({ menu_node_id: newMenuNodeId, sort_order: targetIndex })
        .where('id', '=', pageId)
        .execute()
    } else if (patch.sortOrder !== undefined) {
      const siblingCount = await countPagesInMenuNode(trx, current.menu_node_id)
      const targetIndex = Math.min(patch.sortOrder, siblingCount - 1)
      await reorderWithinSiblings(trx, current.menu_node_id, pageId, current.sort_order, targetIndex)
    }

    await trx
      .updateTable('pages')
      .set({
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        updated_at: sql`now()`,
      })
      .where('id', '=', pageId)
      .execute()

    // **위 `current`는 잠그지 않고 읽었다** — 제목 · 설명만 바꾸는 판은 행 잠금을 `UPDATE`에서 처음 잡는다. 그 사이 프로젝트
    // 삭제가 이 행을 쥐었으면 `UPDATE`가 그 커밋을 기다렸다가 0 행을 쓰고, 여기서 행이 없다 — 앞의 `null`과 같은 404 다
    // (던지면 봉투 없는 500).
    const updated = await trx.selectFrom('pages').select(PAGE_COLUMNS).where('id', '=', pageId).executeTakeFirst()
    return updated ? toRecord(updated) : null
  })
}

export interface LockedPage {
  id: string
  schema: PageDocument
  schemaVersion: number
  headSeq: number
}

/**
 * 편집 파이프라인(`services/edit-pipeline.ts`)이 페이지를 잠그고 현재 상태를 읽는다.
 * `SELECT id, schema, schema_version, head_seq FROM pages WHERE id = ? AND project_id = ? FOR UPDATE`.
 *
 * **`withTransaction`으로 감싸지 않는다.** 세이브포인트로 감쌀 이유가 없어서다 —
 * SELECT 하나뿐이라 제약 위반이 날 수 없고, 세이브포인트는 제약 위반의 오염을 막는
 * 장치이지 잠금과는 무관하다.
 *
 * **잠금과 무관하다는 것은 실측이다.** `RELEASE SAVEPOINT`는 하위 트랜잭션을 부모에
 * 병합할 뿐이라 그 안에서 얻은 행 잠금은 부모 트랜잭션으로 넘어간다. 확인한 방법:
 * `begin; savepoint s1; select … for update; release savepoint s1;` 상태의 세션을 둔 채
 * 다른 세션에서 같은 행에 `select … for update nowait`을 걸면 `55P03 could not obtain
 * lock on row`가 난다(양성 대조: 앞 세션이 COMMIT한 뒤 같은 nowait은 성공한다).
 * 그러므로 `writePageSchemaAtSeq`가 잠금을 쥔 채 세이브포인트를 여는 것도 안전하다 —
 * 그 래퍼를 "잠금 구간이라 위험하다"는 이유로 걷어내지 마라.
 *
 * 파라미터 이름을 `db`가 아니라 `trx`로 둔 것은 "이미 트랜잭션 안에서 불러야 한다"는
 * 전제를 시그니처로 드러내기 위해서다.
 *
 * 대상이 `projectId` 소속이 아니면(다른 프로젝트, 또는 존재하지 않으면) `null`이다.
 *
 * **호출자가 트랜잭션 밖에서 부르면 잠금이 즉시 풀린다.** `db.selectFrom(...).forUpdate()`를
 * 트랜잭션이 아닌 핸들로 실행하면 Postgres가 그 SELECT 문장 하나만을 위한 암묵적
 * 트랜잭션을 열고 문장이 끝나자마자 커밋한다 — `FOR UPDATE`가 건 잠금도 그 순간
 * 함께 풀린다. 즉 이 함수가 "잠갔다"고 믿고 그 뒤에 `head_seq`를 읽어 `+1`하는
 * 코드를 짜면, 동시에 같은 페이지를 편집하는 두 요청이 서로의 잠금을 전혀 보지
 * 못한 채 같은 `seq`를 채번해 `(page_id, seq)` UNIQUE 위반(또는 더 나쁘게, 타이밍에
 * 따라 그 위반조차 피해 한쪽의 편집이 조용히 사라지는 경우)으로 이어진다. 이
 * 실수는 조용히 동시성 방어를 없애는 종류이므로, 방어적으로 트랜잭션이 아닌
 * 핸들이 오면 즉시 크게 실패시킨다(아래 `if (!trx.isTransaction)`).
 */
export async function lockPageForEdit(trx: DbHandle, projectId: string, pageId: string): Promise<LockedPage | null> {
  assertLocking(trx, 'lockPageForEdit')

  const row = await trx
    .selectFrom('pages')
    .select(['id', 'schema', 'schema_version', 'head_seq'])
    .where('id', '=', pageId)
    .where('project_id', '=', projectId)
    .forUpdate()
    .executeTakeFirst()

  if (!row) return null

  return {
    id: row.id,
    schema: row.schema,
    schemaVersion: row.schema_version,
    // head_seq는 pg가 문자열로 주는 bigint다 — repos/pages.ts의 toRecord와 같은 이유로 변환한다.
    headSeq: Number(row.head_seq),
  }
}

/**
 * 편집 파이프라인(`services/edit-pipeline.ts`)이 패치를 적용한 결과를 저장한다. `schema`·`schema_version`·
 * `head_seq`·`updated_at` 넷을 함께 갱신한다 — 다른 컬럼(`title`·`menu_node_id` 등)은
 * 건드리지 않는다. 반환값은 없다(`void`) — 호출자가 이미 결과 문서(`schema`)와 새
 * `headSeq`를 갖고 있으므로 다시 읽어 돌려줄 이유가 없다.
 *
 * `lockPageForEdit`과 같은 이유로 트랜잭션 전제를 확인한다 — 이 함수는 `lockPageForEdit`이
 * 건 행 잠금이 여전히 걸려 있는 같은 트랜잭션 안에서, 그 잠금이 지키는 `head_seq`를
 * 갱신하는 문장이다. 트랜잭션 밖에서 불리면 그 전제 자체가 깨진다.
 *
 * `withTransaction`으로 감싼다. 이 문장은 `project_id`·`menu_node_id` 같은 FK 제약은
 * 참조하지 않지만, `schema::jsonb` 캐스팅 자체가 제약 위반과 같은 방식으로 실패할
 * 수 있다는 게 실측으로 드러났다: 문자열 값 안에 NUL 문자(U+0000)가 있으면 Postgres가
 * `22P05 unsupported Unicode escape sequence`를 던진다. 파이프라인이 저장 전에 `containsNulByte`로 이 조건을
 * 미리 걸러내지만, 그 방어를 우회해 이 함수가 직접 불리는 경로가 생기면 세이브포인트
 * 없이는 호출자의 트랜잭션 전체가 `25P02`로 오염된다(`src/db/tx.ts` 참고) — `repos/`의
 * 다른 쓰기 경로와 같은 이유로 감싼다.
 */
export async function writePageSchemaAtSeq(
  trx: DbHandle,
  pageId: string,
  schema: PageDocument,
  schemaVersion: number,
  headSeq: number,
): Promise<void> {
  if (!trx.isTransaction) {
    throw new Error('writePageSchemaAtSeq는 트랜잭션 핸들(trx)로만 불러야 합니다 — lockPageForEdit과 같은 트랜잭션이어야 합니다.')
  }

  await withTransaction(trx, async (tx) => {
    await tx
      .updateTable('pages')
      .set({ schema: JSON.stringify(schema), schema_version: schemaVersion, head_seq: headSeq, updated_at: sql`now()` })
      .where('id', '=', pageId)
      .execute()
  })
}

/**
 * 페이지를 지운다. 대상이 `projectId` 소속이 아니면 `'not-found'`다.
 *
 * 삭제 뒤 남은 형제들을 `closeGap`으로 재번호한다. `withTransaction`으로 감싸는
 * 이유는 `repos/menu.ts`의 `deleteMenuNode`와 다르다 — `pages`를 참조하는 것은
 * `revisions.page_id` 하나이고 그것이 `ON DELETE CASCADE`라(0005), 이 DELETE 자체는
 * 제약 위반을 낼 수 없다(`RESTRICT` 참조가 생기면 이 문장이 깨진다). 그래도
 * 감싸는 것은 "삭제 + 재번호"가 하나의 원자적 단위여야 하기 때문이다(둘 사이에
 * 죽으면 형제 sort_order에 구멍이 남는다).
 */
export async function deletePage(db: DbHandle, projectId: string, pageId: string): Promise<'deleted' | 'not-found'> {
  return withTransaction(db, async (trx) => {
    // 남은 형제를 당긴다 — 트리 쓰기의 첫 잠금이 먼저다(`repos/projects.ts`의 `lockProjectTree`). **묘비를 묻을 트랜잭션의
    // «프로젝트 행 먼저»도 이것이 채운다**(`repos/comments.ts`의 `lockProjectForBurial` — 묘비의 FK 가 거는 `KEY SHARE`와는
    // 제 트랜잭션이라 안 부딪히고, 복원 · 프로젝트 삭제의 `FOR UPDATE`와는 페이지를 잡기 전에 기다린다).
    await lockProjectTree(trx, projectId)
    const current = await trx
      .selectFrom('pages')
      .select(['menu_node_id', 'sort_order', 'head_seq'])
      .where('id', '=', pageId)
      .where('project_id', '=', projectId)
      .forUpdate()
      .executeTakeFirst()
    if (!current) return 'not-found'

    await deletePageComments(trx, pageId)
    await recordPageSeqFloor(trx, projectId, pageId, Number(current.head_seq))
    await trx.deleteFrom('pages').where('id', '=', pageId).execute()
    await closeGap(trx, current.menu_node_id, current.sort_order)

    return 'deleted'
  })
}

/**
 * 페이지 행 하나를 `FOR KEY SHARE`로 잡는다. 부르는 자리는 둘이다 — 코멘트 수정(아래)과 잠금 획득(`ws/lock.ts`의
 * `handleLockFrame` — 그 트랜잭션이 잡는 유일한 행이다. 까닭은 그 파일의 «판정과 잡기는 같은 틱이다»).
 *
 * **코멘트 수정의 둘째 잠금**(`routes/comments.ts` — 프로젝트 행(`repos/projects.ts`의 `lockProjectShared`) 뒤 · 재확인 앞).
 *
 * **왜 페이지 행을 먼저 — 코멘트 행을 지우는 두 쓰기가 둘 다 페이지 행 `FOR UPDATE`를 먼저 잡는다.** 코멘트 삭제는
 * «페이지 행(`lockPageForEdit`) → 재확인(멤버 행 `FOR SHARE`) → 코멘트 행», 페이지 삭제(`deletePage`)는 «페이지 행 →
 * 코멘트 행(`deletePageComments`) → 끝의 재확인»이다 — 코멘트 행과 멤버 행의 순서가 **둘이 반대다.** 그래서 코멘트
 * 수정이 코멘트 행과 재확인을 어느 순서로 두어도 둘 중 하나와 엇갈리고, 다른 owner 의 역할 변경(`repos/members.ts`의
 * `lockOwnerIds` — owner 행을 차례로 `FOR UPDATE`)이 셋째로 끼면 고리가 선다. 남의 다른 쓰기가 재확인을
 * 지난 채 멤버 행을 `FOR SHARE`로 쥔 판에서: «`UPDATE` → 재확인»이면 코멘트 삭제와 **교착 · 수정 500**, «재확인 →
 * `UPDATE`»이면 페이지 삭제와 **교착 · 삭제 500**. 페이지 행을 먼저 잡으면 두 삭제 뒤에 줄을 서므로 — 코멘트 행을 쥔
 * 자가 멤버 행을 기다리는 동안 코멘트 수정은 아무 멤버 행도 안 쥔다 — **교착이 없다**(`test/guard-in-lock.test.ts`의
 * «코멘트 수정의 3자 고리» 두 판이 잰다).
 *
 * **`KEY SHARE`인 까닭** — `FOR UPDATE`(두 삭제 · 문서 편집 · 코멘트 게시의 `lockPageForEdit`)와만 부딪힌다. 그래서 코멘트
 * 수정이 같은 페이지의 문서 편집 뒤에도 선다(그 판이 `PROBES`에 있다) — 그 값을 치르고 산 것이 위 순서다.
 *
 * 대상이 `projectId` 소속이 아니면(지워졌거나 다른 프로젝트) `false`다 — 부르는 쪽이 404 로 읽는다.
 */
export async function lockPageShared(trx: DbHandle, projectId: string, pageId: string): Promise<boolean> {
  assertLocking(trx, 'lockPageShared')
  const row = await trx
    .selectFrom('pages')
    .select('id')
    .where('id', '=', pageId)
    .where('project_id', '=', projectId)
    .forKeyShare()
    .executeTakeFirst()
  return row !== undefined
}

/**
 * 프로젝트의 페이지 행 전부를 `FOR UPDATE`로 잠근다. 복원의 근거와 실측표는 `repos/snapshots.ts`의
 * `lockProjectForRestore` 머리말에 있다.
 *
 * **부르는 자리가 둘이다** — 복원과 프로젝트 삭제(`routes/projects.ts`). 삭제는 CASCADE 가 멤버 행을 페이지보다
 * 먼저 지우므로, 페이지 대기를 이것으로 **먼저** 치러야 커밋 순간의 재확인(`auth/roles.ts`의
 * `recheckProjectRole`)이 제 멤버 행을 보고, 역할 변경이 그 대기에 묶이지 않는다.
 *
 * **두 자리 다 이것보다 프로젝트 행을 먼저 잡는다**(`repos/projects.ts`의 `lockProjectRow`) — 한쪽이 이것을 먼저
 * 잡으면 둘이 서로를 기다린다(`routes/projects.ts`의 삭제 주석).
 */
export async function lockProjectPages(trx: DbHandle, projectId: string): Promise<void> {
  assertLocking(trx, 'lockProjectPages')
  await trx.selectFrom('pages').select('id').where('project_id', '=', projectId).forUpdate().execute()
}

/**
 * **id와 문서를 함께 받아** 페이지를 만든다(id를 보존한다).
 *
 * `insertPage`와 갈리는 지점 셋: id를 발급하지 않고, `sort_order`를 계산하지 않고,
 * `menu_node_id`의 유효성을 확인하지 않는다(계획이 판정했고 FK가 마지막 방벽이다).
 *
 * **`head_seq`는 그 id 가 쓴 마지막 번호 다음이다**(`page_seq_floors` — `recordPageSeqFloor`). 한 페이지 id 에서 번호가 같으면
 * 문서도 같아야 한다 — 서버는 편집의 자리 경로를 `baseSeq` 판에 그대로 적용하므로, 되살린 판본이 옛 판본이 쓴 번호를 다시 쓰면
 * 옛 판본을 든 탭(복원 방송을 못 받았다 · MCP · CLI)의 편집이 되살린 문서의 다른 노드에 적용된다. 그 id 의 줄이 없으면(한 번도
 * 안 지웠다 · `0017` 앞에 지웠다) 0 이다.
 *
 * **그 번호에는 revision 행이 없다** — 그 페이지가 지워질 때 `revisions.page_id`의 CASCADE가 이력을 함께 데려갔다(재는 법: 삭제
 * 전후로 그 페이지의 `revisions` 행 수를 센다 — 0 이 된다). 그 페이지의 undo 는 빈 이력 위에서 돈다 — 되살린 뒤의 편집만 이력에
 * 쌓인다. **복원이 되살릴 수 있는 것은 문서이지 이력이 아니다.** payload의 `headSeq`를 심지 않는 것도 같은 까닭이다 — 그 값은
 * 그 id 가 쓴 마지막 번호보다 작을 수 있다(스냅샷 뒤의 편집).
 *
 * **그래서 이 경로는 revision을 남기지 않는다.** *"모든 스키마 변경이 revision을
 * 남긴다"*(이 파일의 머리말)와 어긋나지 않는다 — `POST .../pages`가 이미 문서를 들고 태어나며 revision을
 * 만들지 않는다. 생성은 *"변경"*이 아니다. 대신 그 문서는 아무도 검증하지 않는 유일한
 * 쓰기가 되므로 `services/restore-plan.ts`가 `validatePage`로 본다.
 */
export async function insertPageWithId(
  trx: DbHandle,
  projectId: string,
  input: {
    id: string
    menuNodeId: string
    title: string
    description: string | null
    sortOrder: number
    schema: PageDocument
    schemaVersion: number
  },
): Promise<void> {
  const floor = await trx.selectFrom('page_seq_floors').select('head_seq').where('page_id', '=', input.id).executeTakeFirst()
  await trx
    .insertInto('pages')
    .values({
      id: input.id,
      project_id: projectId,
      menu_node_id: input.menuNodeId,
      title: input.title,
      description: input.description,
      sort_order: input.sortOrder,
      schema: JSON.stringify(input.schema),
      schema_version: input.schemaVersion,
      head_seq: floor === undefined ? 0 : Number(floor.head_seq) + 1,
    })
    .execute()
}

/**
 * **지우는 페이지 id 가 쓴 마지막 번호를 남긴다**(`0017-page-seq-floors`) — 페이지 행을 지우는 트랜잭션에서 그 행의 `head_seq`로
 * 부른다. 부르는 자리는 페이지를 지우는 두 길이다: `deletePage`(페이지 `DELETE`) · `deletePageRow`(복원의 `delete-page`). 지우는
 * 길이 늘면 여기를 부르게 한다 — 빠뜨리면 그 길로 지운 페이지를 되살릴 때 0 부터 센다(`insertPageWithId`).
 *
 * **`greatest`로 덮는다.** 되살린 페이지는 이 값보다 큰 번호에서 세므로 늘 더 큰 값이 온다 — 그 전제가 깨져도(줄을 거치지 않고 만든
 * 행) 앞 판본이 쓴 번호를 잃지 않는다.
 */
export async function recordPageSeqFloor(trx: DbHandle, projectId: string, pageId: string, headSeq: number): Promise<void> {
  await trx
    .insertInto('page_seq_floors')
    .values({ page_id: pageId, project_id: projectId, head_seq: headSeq })
    .onConflict((conflict) =>
      conflict.column('page_id').doUpdateSet({ head_seq: sql`greatest(page_seq_floors.head_seq, excluded.head_seq)` }),
    )
    .execute()
}

/**
 * 페이지의 메뉴·제목·설명·순서를 **주어진 값 그대로** 쓴다(복원 전용). `schema`는 건드리지
 * 않는다 — 문서를 바꾸는 경로는 편집 파이프라인 하나다(이 파일의 머리말).
 *
 * `updatePage`와 갈리는 지점은 `repos/menu.ts`의 `writeMenuNodePlacement`와 같다:
 * **재번호를 하지 않는다.** payload의 `sort_order`는 캡처 시점에 이미 불변식을 만족했다.
 */
export async function writePagePlacement(
  trx: DbHandle,
  projectId: string,
  input: { id: string; menuNodeId: string; title: string; description: string | null; sortOrder: number },
): Promise<void> {
  await trx
    .updateTable('pages')
    .set({
      menu_node_id: input.menuNodeId,
      title: input.title,
      description: input.description,
      sort_order: input.sortOrder,
      updated_at: sql`now()`,
    })
    .where('id', '=', input.id)
    .where('project_id', '=', projectId)
    .execute()
}

/**
 * 페이지 행 하나를 **재번호 없이** 지운다(복원 전용). `deletePage`의 `closeGap`을 피하는
 * 이유는 `repos/menu.ts`의 `deleteMenuNodeRow`와 같다.
 *
 * **`revisions`·`comments`는 CASCADE로 함께 사라진다**(0005·0008). 복원은 그것에 순서를
 * 맡기지 않고 코멘트를 먼저 지우지만(계획의 1단계), 이력은 되살릴 수 없으므로 그대로 간다.
 */
export async function deletePageRow(trx: DbHandle, projectId: string, pageId: string): Promise<void> {
  const deleted = await trx
    .deleteFrom('pages')
    .where('id', '=', pageId)
    .where('project_id', '=', projectId)
    .returning('head_seq')
    .executeTakeFirst()
  if (deleted !== undefined) await recordPageSeqFloor(trx, projectId, pageId, Number(deleted.head_seq))
}
