/**
 * 테마 저장소. SQL만 안다 — HTTP도 zod도 테마 검증(`resolveTheme`)도 이 파일 밖의
 * 일이다. `routes/themes.ts`가 규격·의미 검증을 통과한 `Theme`만 여기 넘긴다.
 *
 * API가 주고받는 키는 camelCase, DB 컬럼은 snake_case다. 그 변환은 이 파일이
 * 전담한다(`repos/pages.ts`와 같은 관례).
 *
 * ---
 *
 * **이 파일의 일은 `Theme` ↔ 행 변환 하나다.**
 *
 * 테마 문서는 설계서 「테마 규격」의 여섯 절인데 저장은 **절마다 컬럼 하나**이고 `meta`는 컬럼으로
 * 흩어진다(`meta.id`→`slug`, `meta.extends`→`extends_ref`, 나머지는 각 컬럼).
 * 그래서 조립을 두 함수(`toColumns`·`toTheme`)에 가둔다 — 조립이 흩어지면 컬럼 하나가
 * 새로 생겼을 때 **읽는 쪽만 고쳐지고 쓰는 쪽이 남아** 그 필드가 말없이 사라진다.
 *
 * **없는 절과 빈 절을 가른다.** 컬럼이 `NULL`이면 *"그 절이 없다"*, `'{}'`면 *"있는데
 * 비었다"*다. `mergeTheme`이 파생 테마를 base와 합칠 때 **없는 절은 건드리지 않고 빈
 * 절은 그 절을 다룬다**로 갈리므로, 둘을 접으면 저장한 문서와 되읽은 문서가 달라지고
 * 그 차이가 병합 결과에서야 드러난다. 값이 두 상태를 이미 담을 수 있으니(컬럼이
 * nullable이다) 접을 이유가 없다.
 *
 * ---
 *
 * **NUL(U+0000)을 여기서 막는다.**
 *
 * 절 컬럼이 `jsonb`가 아니라 `json`이기 때문이다(0006의 주석). `jsonb`는 NUL이 든 값을
 * **삽입 시점에** 거부하지만(`22P05`) `json`은 원문을 그대로 받아 두었다가 나중에
 * `->>`로 텍스트를 뽑을 때에야 죽는다 — 둘 다 컨테이너에서 직접 쟀고
 * `themes-schema.test.ts`가 그 관찰을 고정한다. 즉 순서 계약을 지키려고 `json`을
 * 고른 대가로 **DB가 대신 잡아 주던 방벽 하나가 사라졌고**, 막지 않으면 저장은 성공한
 * 뒤 알 수 없는 자리에서 터진다. `pages`가 편집 파이프라인 8단계에서 같은 검사를 하는
 * 것과 같은 자리다.
 *
 * **검사 대상은 `Theme` 전체다** — 절뿐 아니라 `meta.name`·`description` 같은 text
 * 컬럼으로 가는 값도 NUL을 담을 수 없다(Postgres의 text 계열 제약).
 */
import { sql } from 'kysely'
import type { Theme } from '@wirebound/themes'
import { containsNulByte } from '../db/nul-guard'
import { withTransaction, type DbHandle } from '../db/tx'

export interface ThemeRecord {
  id: string
  /** `null`이면 시스템 테마다(설계서 「테이블 정의」). */
  projectId: string | null
  /** 컬럼들을 다시 조립한 테마 문서. */
  theme: Theme
  updatedAt: Date
}

/** 테마 어딘가에 NUL(U+0000)이 있을 때 던진다. 호출자가 400으로 매핑한다. */
export class ThemeNulByteError extends Error {
  constructor() {
    super('테마에 NUL 문자(U+0000)를 포함할 수 없습니다')
    this.name = 'ThemeNulByteError'
  }
}

const THEME_COLUMNS = [
  'id',
  'project_id',
  'slug',
  'name',
  'description',
  'extends_ref',
  'version',
  'preview',
  'tokens',
  'primitives',
  'components',
  'patterns',
  'assets',
  'updated_at',
] as const

/** `THEME_COLUMNS`로 고른 행의 모양. `toTheme`이 이것만 본다. */
interface ThemeRow {
  id: string
  project_id: string | null
  slug: string
  name: string
  description: string | null
  extends_ref: string | null
  version: string
  preview: string | null
  tokens: Theme['tokens'] | null
  primitives: Theme['primitives'] | null
  components: Theme['components'] | null
  patterns: Theme['patterns'] | null
  assets: Theme['assets'] | null
  updated_at: Date
}

/**
 * 절 하나를 컬럼 값으로. **`undefined`는 `null`(절 없음), 그 밖은 `JSON.stringify`**다.
 *
 * `JSON.stringify(undefined)`가 `undefined`를 내는 것에 기대지 않고 명시적으로 가른다 —
 * Kysely에 `undefined`를 넘기면 그 컬럼이 INSERT 문에서 **아예 빠져** DEFAULT가 되는데,
 * 여기서는 우연히 결과가 같지만 UPDATE에서는 *"그 컬럼을 안 건드린다"*가 되어
 * **통째 교체가 옛 절을 남긴다.** 두 문장이 같은 함수를 쓰므로 그 갈림을 만들지 않는다.
 */
function section(value: unknown): string | null {
  return value === undefined ? null : JSON.stringify(value)
}

/** 테마 문서를 컬럼 값들로 흩는다. `insertTheme`·`updateTheme`이 함께 쓴다. */
function toColumns(theme: Theme) {
  return {
    slug: theme.meta.id,
    name: theme.meta.name,
    description: theme.meta.description ?? null,
    extends_ref: theme.meta.extends ?? null,
    version: theme.meta.version,
    preview: theme.meta.preview ?? null,
    tokens: section(theme.tokens),
    primitives: section(theme.primitives),
    components: section(theme.components),
    patterns: section(theme.patterns),
    assets: section(theme.assets),
  }
}

/**
 * 행을 테마 문서로 조립한다.
 *
 * **`null` 컬럼은 키 자체를 만들지 않는다.** `{ description: undefined }`로 두면
 * `toEqual`은 통과하지만 `JSON.stringify`가 그 키를 지워, 응답과 되읽은 값이
 * 미묘하게 갈린다(`PatchValue`에도 같은 함정이 있다).
 */
function toTheme(row: ThemeRow): ThemeRecord {
  const meta: Theme['meta'] = {
    id: row.slug,
    name: row.name,
    ...(row.description === null ? {} : { description: row.description }),
    ...(row.extends_ref === null ? {} : { extends: row.extends_ref }),
    version: row.version,
    ...(row.preview === null ? {} : { preview: row.preview }),
  }

  return {
    id: row.id,
    projectId: row.project_id,
    updatedAt: row.updated_at,
    theme: {
      meta,
      ...(row.tokens === null ? {} : { tokens: row.tokens }),
      ...(row.primitives === null ? {} : { primitives: row.primitives }),
      ...(row.components === null ? {} : { components: row.components }),
      ...(row.patterns === null ? {} : { patterns: row.patterns }),
      ...(row.assets === null ? {} : { assets: row.assets }),
    },
  }
}

/** 저장 전 NUL 검사. 통과하지 못하면 **아무것도 쓰지 않고** 던진다. */
function assertNoNulByte(theme: Theme): void {
  if (containsNulByte(theme)) {
    throw new ThemeNulByteError()
  }
}

/**
 * 프로젝트에서 **고를 수 있는** 테마 전부 — 그 프로젝트의 것과 시스템 테마다.
 *
 * 시스템 테마를 함께 내는 이유: 이 목록의 쓸모가 *"여기서 고를 수 있는 테마"*인데
 * 시스템 테마는 어느 프로젝트에서나 고를 수 있다(설계서 「테마 관리」). 빼면 부르는 쪽이 매번 두 번
 * 조회해 합쳐야 하고 그 합치는 규칙이 호출자마다 갈린다.
 *
 * 정렬은 시스템 테마가 먼저, 그 안에서는 `slug` 순이다 — 목록 UI가 상속의 출발점을
 * 위에 보이는 편이 낫고, 순서가 결정적이어야 응답을 케이스로 고정할 수 있다.
 */
export async function listThemes(db: DbHandle, projectId: string): Promise<ThemeRecord[]> {
  const rows = await db
    .selectFrom('themes')
    .select(THEME_COLUMNS)
    .where((eb) => eb.or([eb('project_id', 'is', null), eb('project_id', '=', projectId)]))
    .orderBy(sql`project_id is not null`)
    .orderBy('slug')
    .execute()

  return (rows as ThemeRow[]).map(toTheme)
}

/**
 * `(project_id, slug)`로 하나를 찾는다. `projectId`가 `null`이면 **시스템 테마**를 찾는다.
 *
 * `is` 비교를 쓰는 것이 요점이다 — `= NULL`은 SQL에서 언제나 UNKNOWN이라 시스템 테마를
 * 하나도 못 찾는다(같은 이유로 0006의 UNIQUE에 `NULLS NOT DISTINCT`가 붙었다).
 */
export async function findThemeBySlug(
  db: DbHandle,
  projectId: string | null,
  slug: string,
): Promise<ThemeRecord | null> {
  const row = await db
    .selectFrom('themes')
    .select(THEME_COLUMNS)
    .where('slug', '=', slug)
    .where((eb) => (projectId === null ? eb('project_id', 'is', null) : eb('project_id', '=', projectId)))
    .executeTakeFirst()

  return row ? toTheme(row as ThemeRow) : null
}

export async function findThemeById(db: DbHandle, themeId: string): Promise<ThemeRecord | null> {
  const row = await db.selectFrom('themes').select(THEME_COLUMNS).where('id', '=', themeId).executeTakeFirst()
  return row ? toTheme(row as ThemeRow) : null
}

/**
 * 테마를 만든다. `projectId`가 `null`이면 시스템 테마다.
 *
 * `withTransaction`으로 감싼다 — `(project_id, slug)` 유니크 위반이 날 수 있고, 그
 * 실패가 세이브포인트 없이 나면 호출자의 트랜잭션이 `25P02`로 오염된다
 * (`repos/projects.ts`의 `insertProject`와 같은 이유).
 */
export async function insertTheme(
  db: DbHandle,
  projectId: string | null,
  theme: Theme,
): Promise<ThemeRecord> {
  assertNoNulByte(theme)

  const row = await withTransaction(db, (trx) =>
    trx
      .insertInto('themes')
      .values({ project_id: projectId, ...toColumns(theme) })
      .returning(THEME_COLUMNS)
      .executeTakeFirstOrThrow(),
  )
  return toTheme(row as ThemeRow)
}

/**
 * 테마 문서를 **통째로** 갈아 끼운다. 부분 갱신이 아니다 — `toColumns`가 절 다섯을 전부
 * 내므로 없는 절은 `NULL`이 되어 실제로 비워진다. 부분 갱신을 두면 *"지울 수 없는 절"*이
 * 생긴다.
 *
 * 없는 id면 `null`이다(`repos/projects.ts`의 `updateProject`와 같은 취급 — 권한 확인과
 * 이 UPDATE 사이에 지워지는 경합을 500이 아니라 404로 만든다).
 */
export async function updateTheme(db: DbHandle, themeId: string, theme: Theme): Promise<ThemeRecord | null> {
  assertNoNulByte(theme)

  const row = await withTransaction(db, (trx) =>
    trx
      .updateTable('themes')
      .set({ ...toColumns(theme), updated_at: sql`now()` })
      .where('id', '=', themeId)
      .returning(THEME_COLUMNS)
      .executeTakeFirst(),
  )
  return row ? toTheme(row as ThemeRow) : null
}

/**
 * 시스템 테마 하나를 넣거나 **코드 값으로 덮는다**(`services/system-themes.ts`가 부른다).
 *
 * `ON CONFLICT (project_id, slug) DO UPDATE` 한 문장이라 원자적이다 — 조회 후 삽입이
 * 아니므로 여러 인스턴스가 동시에 기동해도 경합 창이 없다. 그 충돌 대상이 성립하는 것은
 * 0006의 유니크가 `NULLS NOT DISTINCT`이기 때문이다(평범한 UNIQUE면 `(NULL, slug)`가
 * 충돌로 판정되지 않아 매 기동마다 행이 하나씩 늘어난다).
 *
 * **`project_id`는 언제나 `null`이다** — 이 함수가 만드는 것은 시스템 테마뿐이다.
 * 프로젝트 테마를 여기로 넣으면 그 소유자의 테마를 코드가 덮어쓰게 된다.
 */
export async function upsertSystemTheme(db: DbHandle, theme: Theme): Promise<ThemeRecord> {
  assertNoNulByte(theme)

  const columns = toColumns(theme)
  const row = await withTransaction(db, (trx) =>
    trx
      .insertInto('themes')
      .values({ project_id: null, ...columns })
      .onConflict((oc) =>
        oc.columns(['project_id', 'slug']).doUpdateSet({ ...columns, updated_at: sql`now()` }),
      )
      .returning(THEME_COLUMNS)
      .executeTakeFirstOrThrow(),
  )
  return toTheme(row as ThemeRow)
}

/** 지웠으면 `true`, 그 id가 없었으면 `false`. */
export async function deleteTheme(db: DbHandle, themeId: string): Promise<boolean> {
  const result = await withTransaction(db, (trx) =>
    trx.deleteFrom('themes').where('id', '=', themeId).executeTakeFirst(),
  )
  return Number(result.numDeletedRows) > 0
}
