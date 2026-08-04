/**
 * 페이지 저장소. SQL만 안다 — HTTP도 zod도 스키마 검증(카탈로그 게이트)도 이 파일
 * 밖의 일이다. `routes/pages.ts`가 `@wirebound/schema`의 `migrateDocument`·
 * `validatePage`를 부른 뒤, 검증을 통과한 `PageDocument`만 이 파일에 넘긴다.
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
import type { PageDocument } from '@wirebound/schema'
import { withTransaction, type DbHandle } from '../db/tx'

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
    // head_seq는 pg가 문자열로 주는 bigint다 — API 응답은 number여야 하므로 경계에서 변환한다(D9).
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
  return withTransaction(db, async (trx) => {
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
 * 계층 규칙(README "계층 규칙" 절)을 지킨다.
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
 * 페이지의 제목·설명·소속 메뉴·순서를 갱신한다. `schema`는 이 함수의 책임이
 * 아니다(`updatePageSchema` 참고) — 그 게이트는 별도 엔드포인트(`PUT .../schema`)다.
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
  return withTransaction(db, async (trx) => {
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

    const updated = await trx.selectFrom('pages').select(PAGE_COLUMNS).where('id', '=', pageId).executeTakeFirstOrThrow()
    return toRecord(updated)
  })
}

/**
 * 검증(마이그레이션·카탈로그 게이트, `routes/pages.ts`)을 통과한 문서를 그대로
 * 저장한다. `schema`·`schema_version`·`updated_at` 셋만 갱신한다 — 다른 컬럼은
 * 건드리지 않는다.
 *
 * `withTransaction`으로 감싼다. 이 문장은 `project_id`·`menu_node_id` 같은 FK
 * 제약은 참조하지 않지만, `schema::jsonb` 캐스팅 자체가 제약 위반과 같은 방식으로
 * 실패할 수 있다는 게 실측으로 드러났다: 문자열 값 안에 NUL 문자(U+0000)가 있으면
 * Postgres가 `22P05 unsupported Unicode escape sequence`를 던진다. `routes/pages.ts`가
 * 저장 전에 이 조건을 미리 걸러 400으로 돌려주지만(`containsNulByte`), 그 방어를
 * 우회해 이 함수가 직접 불리는 경로가 생기면(P3의 협업 편집처럼 더 큰 트랜잭션
 * 안에서 이 문장이 도는 경우 포함) 세이브포인트 없이는 호출자의 트랜잭션 전체가
 * `25P02`로 오염된다(`src/db/tx.ts` 참고) — `repos/`의 다른 쓰기 경로와 같은 이유로
 * 감싼다.
 */
export async function updatePageSchema(
  db: DbHandle,
  projectId: string,
  pageId: string,
  schema: PageDocument,
  schemaVersion: number,
): Promise<PageRecord | null> {
  return withTransaction(db, async (trx) => {
    const row = await trx
      .updateTable('pages')
      .set({ schema: JSON.stringify(schema), schema_version: schemaVersion, updated_at: sql`now()` })
      .where('id', '=', pageId)
      .where('project_id', '=', projectId)
      .returning(PAGE_COLUMNS)
      .executeTakeFirst()
    return row ? toRecord(row) : null
  })
}

export interface LockedPage {
  id: string
  schema: PageDocument
  schemaVersion: number
  headSeq: number
}

/**
 * 편집 파이프라인(태스크 5)이 페이지를 잠그고 현재 상태를 읽는다.
 * `SELECT id, schema, schema_version, head_seq FROM pages WHERE id = ? AND project_id = ? FOR UPDATE`.
 *
 * **`withTransaction`으로 감싸지 않는다.** 세이브포인트로 감쌀 이유가 없어서다 —
 * SELECT 하나뿐이라 제약 위반이 날 수 없고(세이브포인트는 제약 위반의 오염을
 * 막는 장치이지 잠금과는 무관하다), 오히려 `FOR UPDATE`가 건 행 잠금은 세이브포인트
 * RELEASE/ROLLBACK이 아니라 **트랜잭션이 COMMIT되거나 ROLLBACK될 때까지** 유지돼야
 * 한다 — 이 함수 하나만 감싸는 세이브포인트를 열고 그 안에서 즉시 RELEASE하면
 * 잠금의 지속 시간이 그 함수 호출로 좁아져 버려, 파이프라인이 잠근 뒤 이어서
 * 실행하려는 나머지 로직(패치 적용·`insertRevision`·`writePageSchemaAtSeq`) 동안은
 * 더 이상 잠겨 있지 않게 된다. 파라미터 이름을 `db`가 아니라 `trx`로 둔 것도 "이미
 * 트랜잭션 안에서 불러야 한다"는 전제를 시그니처로 드러내기 위해서다.
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
  if (!trx.isTransaction) {
    throw new Error(
      'lockPageForEdit은 트랜잭션 핸들(trx)로만 불러야 합니다 — 그렇지 않으면 FOR UPDATE 잠금이 이 문장 직후 즉시 풀립니다.',
    )
  }

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
    // head_seq는 pg가 문자열로 주는 bigint다 — repos/pages.ts의 toRecord와 같은 이유로 변환한다(D9).
    headSeq: Number(row.head_seq),
  }
}

/**
 * 편집 파이프라인(태스크 5)이 패치를 적용한 결과를 저장한다. `schema`·`schema_version`·
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
 * 수 있다는 게 실측으로 드러났다(`updatePageSchema`가 같은 이유로 겪은 것과 동일):
 * 문자열 값 안에 NUL 문자(U+0000)가 있으면 Postgres가 `22P05 unsupported Unicode
 * escape sequence`를 던진다. 파이프라인이 저장 전에 `containsNulByte`로 이 조건을
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
 * 이유는 `repos/menu.ts`의 `deleteMenuNode`와 다르다 — `pages`를 참조하는 다른
 * 테이블이 없어(이 태스크 시점) 이 DELETE 자체는 제약 위반을 낼 수 없다. 그래도
 * 감싸는 것은 "삭제 + 재번호"가 하나의 원자적 단위여야 하기 때문이다(둘 사이에
 * 죽으면 형제 sort_order에 구멍이 남는다).
 */
export async function deletePage(db: DbHandle, projectId: string, pageId: string): Promise<'deleted' | 'not-found'> {
  return withTransaction(db, async (trx) => {
    const current = await trx
      .selectFrom('pages')
      .select(['menu_node_id', 'sort_order'])
      .where('id', '=', pageId)
      .where('project_id', '=', projectId)
      .executeTakeFirst()
    if (!current) return 'not-found'

    await trx.deleteFrom('pages').where('id', '=', pageId).execute()
    await closeGap(trx, current.menu_node_id, current.sort_order)

    return 'deleted'
  })
}
