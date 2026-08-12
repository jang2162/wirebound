/**
 * 레이아웃 저장소. SQL만 안다 — HTTP도 zod도 이 파일 밖의 일이다.
 *
 * **이 슬라이스의 레이아웃은 참조를 나르고 `Slot`을 담는 그릇이다**(계획서 D7).
 * 편집 경로가 없으므로 쓰기 함수는 **생성 하나**뿐이다 — `pages`처럼 정렬 불변식도
 * revision 이력도 없다. 레이아웃 에디터(§4.4)가 오면 그때 갱신 경로가 생긴다.
 */
import type { LayoutDocument } from '@wirebound/schema'
import { CURRENT_DOCUMENT_VERSION, createNodeId } from '@wirebound/schema'
import { assertLocking } from '../db/locking'
import type { DbHandle } from '../db/tx'

export interface LayoutRecord {
  id: string
  projectId: string
  name: string
  /** `null`이면 테마를 고르지 않았다 — 화면은 구조 기본 CSS만으로 그려진다(재라 #7). */
  themeId: string | null
  schema: LayoutDocument
}

const LAYOUT_COLUMNS = ['id', 'project_id', 'name', 'theme_id', 'schema'] as const

interface LayoutRow {
  id: string
  project_id: string
  name: string
  theme_id: string | null
  schema: LayoutDocument
}

function toRecord(row: LayoutRow): LayoutRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    name: row.name,
    themeId: row.theme_id,
    schema: row.schema,
  }
}

/** 기본 레이아웃의 이름. 편집 UI가 없으므로 사용자가 바꿀 수 없다. */
export const DEFAULT_LAYOUT_NAME = '기본 레이아웃'

/**
 * 기본 레이아웃의 문서 — **`Page` 하나와 그 안의 `Slot` 하나**다(계획서 D5).
 *
 * 이것이 최소본인 이유: `validateLayout`이 레이아웃에 `Slot`이 **정확히 하나**일 것을
 * 요구하고(`packages/schema/src/validate.ts`), 그 이상을 담으면 이 슬라이스가 참조를
 * 나르는 그릇 이상이 된다(D7).
 *
 * **이 문서를 오늘 그리는 코드는 없다.** 계획서 D6이 *"`Page > Slot`이면
 * `renderComposed(layout, page)`의 결과가 `renderDocument(page)`와 같다"*고 적었는데
 * **반증됐다** — `Slot`은 구멍이 아니라 그려지는 노드라 합성이 노드 둘을 더한다
 * (`packages/renderer/test/compose-identity.test.tsx`). 그래서 캔버스는 페이지 문서만
 * 그리고, 이 `schema`는 저장만 되는 값이다. 그리는 코드가 생기는 것은 §4.4의 레이아웃
 * 에디터가 올 때이고, 그쪽은 **선택 모델부터** 다시 정해야 한다.
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
 * **`withTransaction`으로 감싸지 않는다.** 오늘 유일한 호출자가 `insertProject`이고
 * 그쪽이 이미 트랜잭션 안에서 부른다 — 여기서 한 겹 더 열면 세이브포인트만 늘고
 * 격리해야 할 실패(이 문장이 낼 수 있는 것은 `project_id`·`theme_id`의 FK 위반인데,
 * 둘 다 같은 트랜잭션이 방금 만들었거나 확인한 값이다)가 없다.
 */
export async function insertLayout(
  db: DbHandle,
  input: { projectId: string; name: string; themeId: string | null; schema: LayoutDocument },
): Promise<LayoutRecord> {
  const row = await db
    .insertInto('layouts')
    .values({
      project_id: input.projectId,
      name: input.name,
      theme_id: input.themeId,
      schema: JSON.stringify(input.schema),
    })
    .returning(LAYOUT_COLUMNS)
    .executeTakeFirstOrThrow()

  return toRecord(row as LayoutRow)
}

/**
 * 레이아웃이 가리키는 테마를 바꾼다. 없는 레이아웃이면 `null`이다.
 *
 * **이 파일에서 유일한 갱신 함수이고, 그것이 의도다**(P4b-3 계획서 D2). 위 머리말이
 * *"편집 경로가 없으므로 쓰기 함수는 생성 하나뿐"*이라고 적어 둔 자리인데, 고르개가
 * 필요로 하는 것은 이 테이블의 **한 필드**다. 레이아웃 CRUD를 여는 것은 §4.4의 레이아웃
 * 에디터가 할 일이고 그쪽은 **선택 모델부터** 다시 정해야 한다(P4a-3 이월의 D6 반증).
 *
 * **`themeId`의 유효성은 여기서 보지 않는다.** *"이 프로젝트에서 고를 수 있는가"*는
 * `listThemes`가 뜻하는 것이고 그 판정은 라우트가 한다 — 이 파일은 SQL만 안다.
 * 그래도 마지막 방벽이 하나 있다: `layouts.theme_id`의 FK가 없는 테마 행을 거부한다.
 */
export async function updateLayoutTheme(
  db: DbHandle,
  layoutId: string,
  themeId: string | null,
): Promise<LayoutRecord | null> {
  const row = await db
    .updateTable('layouts')
    .set({ theme_id: themeId })
    .where('id', '=', layoutId)
    .returning(LAYOUT_COLUMNS)
    .executeTakeFirst()

  return row ? toRecord(row as LayoutRow) : null
}

/**
 * 프로젝트의 레이아웃 **전부**(P6-1 스냅샷 캡처가 부른다).
 *
 * **`findDefaultLayout` 하나로 대신하지 않는다 — 재라 #2가 거짓이기 때문이다.**
 * 계획서는 *"레이아웃은 프로젝트당 하나다"*를 `findDefaultLayout`만 있고 CRUD가 없다는 데서
 * **추론**했는데, 재 보니 `layouts`에는 `project_id` 유니크가 없고(`0007-layouts.ts`) 같은
 * 프로젝트에 두 번째 레이아웃을 실제로 넣으면 **들어간다**(프로젝트 생성 직후 1건 →
 * `insertLayout` 후 2건). 오늘 그것을 만드는 코드 경로가 없을 뿐이다.
 *
 * 캡처가 기본 레이아웃 하나만 담으면, 그런 행이 생기는 날 **스냅샷이 조용히 일부만 얼린다.**
 * 전부 담는 쪽은 그 날에도 규격이 바뀌지 않는다(§4.4의 레이아웃 에디터가 붙는 자리다).
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
 * `NULL`인 프로젝트는 이 마이그레이션(0007) 이전에 만들어진 것뿐이다 — 재라 #8의 결정에
 * 따라 만들어 주지 않고 그대로 둔다. 그 경우 테마 조회가 `null`을 내고 화면은 구조 기본
 * CSS만으로 그려진다.
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
 * 프로젝트의 레이아웃 행 전부를 `FOR UPDATE`로 잠근다(P6-2 D8). **복원 전용이다.**
 * 근거와 실측표는 `repos/snapshots.ts`의 `lockProjectForRestore` 머리말에 있다.
 */
export async function lockProjectLayouts(trx: DbHandle, projectId: string): Promise<void> {
  assertLocking(trx, 'lockProjectLayouts')
  await trx.selectFrom('layouts').select('id').where('project_id', '=', projectId).forUpdate().execute()
}
