/**
 * 레이아웃 저장소. SQL만 안다 — HTTP도 zod도 이 파일 밖의 일이다.
 *
 * **이 슬라이스의 레이아웃은 참조를 나르고 `Slot`을 담는 그릇이다**(계획서 D7).
 * 편집 경로가 없으므로 쓰기 함수는 **생성 하나**뿐이다 — `pages`처럼 정렬 불변식도
 * revision 이력도 없다. 레이아웃 에디터(§4.4)가 오면 그때 갱신 경로가 생긴다.
 */
import type { LayoutDocument } from '@wirebound/schema'
import { CURRENT_DOCUMENT_VERSION, createNodeId } from '@wirebound/schema'
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
 * 요구하고(`packages/schema/src/validate.ts`), 그 이상을 담으면 이 슬라이스가 화면의
 * 외형을 건드리게 된다. `Page > Slot`이면 `renderComposed(layout, page)`의 결과가
 * `renderDocument(page)`와 같아야 하고 **그것이 Task 10의 판정이다**(D6).
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
