/**
 * 레이아웃 저장소. SQL만 안다 — HTTP도 zod도 이 파일 밖의 일이다.
 *
 * **레이아웃은 `Slot`을 담는 그릇이다.**
 * 편집 경로가 없으므로 쓰기 함수는 **생성**뿐이다 —
 * `pages`처럼 정렬 불변식도 revision 이력도 없다. 설계서 「레이아웃」의 레이아웃 편집기가
 * 서면 그때 갱신 경로가 생긴다.
 */
import type { LayoutDocument } from '@wirebound/schema'
import { CURRENT_DOCUMENT_VERSION, createNodeId } from '@wirebound/schema'
import { assertLocking } from '../db/locking'
import type { DbHandle } from '../db/tx'

export interface LayoutRecord {
  id: string
  projectId: string
  name: string
  schema: LayoutDocument
}

const LAYOUT_COLUMNS = ['id', 'project_id', 'name', 'schema'] as const

interface LayoutRow {
  id: string
  project_id: string
  name: string
  schema: LayoutDocument
}

function toRecord(row: LayoutRow): LayoutRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    schema: row.schema,
  }
}

/** 기본 레이아웃의 이름. 편집 UI가 없으므로 사용자가 바꿀 수 없다. */
export const DEFAULT_LAYOUT_NAME = '기본 레이아웃'

/**
 * 기본 레이아웃의 문서 — **`Page` 하나와 그 안의 `Slot` 하나**다.
 *
 * 이것이 최소본인 이유: `validateLayout`이 레이아웃에 `Slot`이 **정확히 하나**일 것을
 * 요구한다(`packages/schema/src/validate.ts`).
 *
 * **이 문서를 그리는 코드는 없다.** *"`Page > Slot`이면
 * `renderComposed(layout, page)`의 결과가 `renderDocument(page)`와 같다"*는
 * **거짓이다** — `Slot`은 구멍이 아니라 그려지는 노드라 합성이 노드 둘을 더한다
 * (`packages/renderer/test/compose-identity.test.tsx`). 그래서 캔버스는 페이지 문서만
 * 그리고, 이 `schema`는 저장만 되는 값이다. 그리는 코드가 생기는 것은 설계서 「레이아웃」의
 * 레이아웃 편집기가 설 때이고, 그쪽은 **선택 모델부터** 다시 정해야 한다.
 *
 * **호출마다 새 id를 뽑는다.** 노드 id를 상수로 박으면 모든 프로젝트의 레이아웃이 같은
 * id를 갖게 되는데, 문서 안에서 id는 노드를 가리키는 이름이므로 서로 다른 문서가 같은
 * 이름을 쓰는 상태를 만들 이유가 없다(`routes/pages.ts`가 빈 페이지를 만들 때
 * `createNodeId()`를 부르는 것과 같은 자리다).
 */
export function defaultLayoutDocument(): LayoutDocument {
  return {
    version: CURRENT_DOCUMENT_VERSION,
    root: {
      id: createNodeId(),
      type: 'Page',
      children: [{ id: createNodeId(), type: 'Slot' }],
    },
  }
}

/**
 * 레이아웃을 만든다.
 *
 * **`withTransaction`으로 감싸지 않는다.** 유일한 호출자가 `insertProject`이고
 * 그쪽이 이미 트랜잭션 안에서 부른다 — 여기서 한 겹 더 열면 세이브포인트만 늘고
 * 격리해야 할 실패(이 문장이 낼 수 있는 것은 `project_id`의 FK 위반인데, 같은 트랜잭션이 방금 만든 값이다)가 없다.
 */
export async function insertLayout(
  db: DbHandle,
  input: { projectId: string; name: string; schema: LayoutDocument },
): Promise<LayoutRecord> {
  const row = await db
    .insertInto('layouts')
    .values({
      project_id: input.projectId,
      name: input.name,
      schema: JSON.stringify(input.schema),
    })
    .returning(LAYOUT_COLUMNS)
    .executeTakeFirstOrThrow()

  return toRecord(row as LayoutRow)
}

/**
 * 프로젝트의 레이아웃 **전부**(스냅샷 캡처가 부른다).
 *
 * **`findDefaultLayout` 하나로 대신하지 않는다 — *"레이아웃은 프로젝트당 하나다"*는 거짓이다.**
 * `findDefaultLayout`만 있고 CRUD가 없다는 데서 그렇게 **추론**하기 쉽지만, `layouts`에는
 * `project_id` 유니크가 없고(`0007-layouts.ts`) 같은 프로젝트에 두 번째 레이아웃을 실제로
 * 넣으면 **들어간다**(프로젝트 생성 직후 1건 → `insertLayout` 후 2건). 그것을 만드는 코드
 * 경로가 지금 없을 뿐이다.
 *
 * 캡처가 기본 레이아웃 하나만 담으면, 그런 행이 생기는 날 **스냅샷이 조용히 일부만 얼린다.**
 * 전부 담는 쪽은 그 날에도 규격이 바뀌지 않는다(「레이아웃」의 레이아웃 편집기가 붙는 자리다).
 */
export async function listLayouts(db: DbHandle, projectId: string): Promise<LayoutRecord[]> {
  const rows = await db
    .selectFrom('layouts')
    .select(LAYOUT_COLUMNS)
    .where('project_id', '=', projectId)
    // 정렬이 결정적이어야 같은 상태를 두 번 캡처했을 때 payload가 같다.
    .orderBy('id', 'asc')
    .execute()

  return (rows as LayoutRow[]).map(toRecord)
}

export async function findLayoutById(db: DbHandle, layoutId: string): Promise<LayoutRecord | null> {
  const row = await db.selectFrom('layouts').select(LAYOUT_COLUMNS).where('id', '=', layoutId).executeTakeFirst()
  return row ? toRecord(row as LayoutRow) : null
}

/**
 * 프로젝트의 기본 레이아웃. `default_layout_id`가 `NULL`이면 `null`이다.
 *
 * `NULL`인 프로젝트는 이 마이그레이션(0007) 이전에 만들어진 것뿐이다 — `0007-layouts.ts`
 * 머리말(«이미 있는 프로젝트에 기본 레이아웃을 만들어 주지 않는다»)대로 그대로 둔다.
 */
export async function findDefaultLayout(db: DbHandle, projectId: string): Promise<LayoutRecord | null> {
  const row = await db
    .selectFrom('projects')
    .innerJoin('layouts', 'layouts.id', 'projects.default_layout_id')
    .select(LAYOUT_COLUMNS.map((column) => `layouts.${column}` as const))
    .where('projects.id', '=', projectId)
    .executeTakeFirst()

  return row ? toRecord(row as LayoutRow) : null
}

/**
 * 프로젝트의 레이아웃 행 전부를 `FOR UPDATE`로 잠근다. **복원 전용이다.**
 * 근거와 실측표는 `repos/snapshots.ts`의 `lockProjectForRestore` 머리말에 있다.
 */
export async function lockProjectLayouts(trx: DbHandle, projectId: string): Promise<void> {
  assertLocking(trx, 'lockProjectLayouts')
  await trx.selectFrom('layouts').select('id').where('project_id', '=', projectId).forUpdate().execute()
}
