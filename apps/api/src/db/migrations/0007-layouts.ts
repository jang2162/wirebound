import type { Kysely, Migration } from 'kysely'
import { sql } from 'kysely'

/**
 * `layouts` 테이블과 `projects.default_layout_id`를 만든다 — 설계서 「테이블 정의」가 정한
 * 참조 사슬 `projects.default_layout_id → layouts.theme_id → themes`의 나머지 절반이다.
 *
 * **테마는 프로젝트가 아니라 레이아웃이 가리킨다.** 그래서 테마 저장이 `layouts`를
 * 함께 만든다. 다만 여기 `layouts`는 **참조를 나르고 `Slot`을 담는 최소본**이고,
 * 레이아웃을 편집하는 화면은 없다(설계서 「레이아웃」의 레이아웃 편집기는 서지 않았다).
 *
 * ---
 *
 * **`schema`는 `jsonb`다 — `themes`의 절이 `json`인 것과 갈린다.**
 *
 * 순서 계약이 걸리는 것은 **테마의 절**뿐이기 때문이다(`compileTheme`이 `states`·스타일
 * 맵의 문서 키 순서를 우선순위로 쓴다). 레이아웃의 `schema`는 노드 트리이고 그 안에서
 * 순서를 나르는 것은 `children` **배열**이다 — 배열 순서는 `jsonb`도 보존한다.
 * `pages.schema`가 `jsonb`인 것과 같은 이유이고, 「테이블 정의」도 여기서는 `jsonb`라고 적는다.
 *
 * **`schema_version` 컬럼을 두지 않는다.** 「테이블 정의」의 `layouts` 목록에 없고(`pages`에는 있다),
 * 버전은 문서 봉투 안의 `version`이 이미 나른다. `pages.schema_version`은 그 값을
 * 비정규화해 둔 것이라 둘이 어긋날 자리가 있는데(그래서 `routes/pages.ts`가 응답의
 * 두 값을 한 번의 `migrateDocument`에서 파생시킨다), 여기서는 그 자리를 만들지 않는다.
 *
 * ---
 *
 * **`theme_id`는 `NULL`을 받는다.**
 *
 * 허용하는 근거: 테마를 고르지 않은 상태가 **이미 정상 경로**다. `apps/web`의
 * `ThemeSource`가 `null`을 낼 수 있고 그때 화면은 구조 기본 CSS만으로 그려진다
 * (구조 CSS와 테마 CSS가 두 시트로 갈린 이유). 컬럼을 `NOT NULL`로 두면 레이아웃을 만들려면
 * 반드시 테마가 먼저 있어야 하고, 그러면 "테마가 없는 프로젝트"라는 정상 상태를
 * 스키마가 금지하게 된다.
 *
 * **`ON DELETE RESTRICT`다.** 쓰이고 있는 테마를 지우면 실패한다 — `routes/themes.ts`가
 * 그것을 409로 옮긴다. `menu_nodes.parent_id`·`pages.menu_node_id`가 같은 선택을 한
 * 자리이고 이유도 같다: 지워진 참조를 조용히 `NULL`로 만들면 **화면이 말없이 달라진다**
 * (테마가 사라져 구조 기본 CSS로 떨어진다). 실패하는 편이 낫다.
 *
 * ---
 *
 * **`projects.default_layout_id`와 `layouts.project_id`가 서로를 가리킨다 — 순환이다.**
 *
 * 그래서 `default_layout_id`가 **nullable**이다. 그러지 않으면 프로젝트를 만들 때
 * 레이아웃이 먼저 있어야 하고 레이아웃을 만들 때 프로젝트가 먼저 있어야 해서 어느 쪽도
 * 먼저 만들 수 없다. 실제 순서는 `repos/projects.ts`의 `insertProject`가 **한 트랜잭션
 * 안에서** 닫는다: 프로젝트(참조 없음) → 레이아웃 → 프로젝트 UPDATE.
 *
 * `ON DELETE SET NULL`이다. 프로젝트를 지우면 `layouts`가 CASCADE로 먼저 사라지는데,
 * 그때 `default_layout_id`가 RESTRICT면 자기 프로젝트를 못 지운다.
 *
 * ---
 *
 * **이미 있는 프로젝트에 기본 레이아웃을 만들어 주지 않는다.**
 *
 * 관찰: **이 마이그레이션이 도는 시점에 `themes`는 반드시 비어 있다.** 0006이 같은
 * 실행에서 테이블을 막 만들었고, 시스템 테마를 넣는 것은 마이그레이션이 아니라
 * **기동 시 동기화**이기 때문이다(`services/system-themes.ts`). 그러므로 여기서 만들 수 있는 것은
 * **`theme_id`가 `NULL`인 레이아웃**뿐이다.
 *
 * 결정: 만들지 않는다. `theme_id`가 `NULL`인 레이아웃과 레이아웃이 아예 없는 것은
 * **관찰되는 결과가 같다** — 둘 다 테마 조회가 `null`을 내고 화면이 구조 기본 CSS로
 * 그려진다. 결과가 같다면 스키마 변경이 사용자 데이터를 만들어 낼 이유가 없고,
 * 프로젝트가 많은 DB에서 전체 스캔 + 삽입을 도는 비용만 남는다.
 *
 * **대가:** 이 마이그레이션 이전에 만들어진 프로젝트는 `default_layout_id`가 `NULL`로
 * 남고, 그 프로젝트에 레이아웃을 주는 경로가 **없다**(레이아웃 편집기가 없다). 그런 DB가
 * 실재하게 되면 그것을 채우는 것은 마이그레이션이 아니라 관리 경로의 일이다.
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('layouts')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('project_id', 'uuid', (col) => col.notNull().references('projects.id').onDelete('cascade'))
      .addColumn('name', 'text', (col) => col.notNull())
      // NULL = 테마를 고르지 않았다(구조 기본 CSS만으로 그린다). 위 머리말의 "`NULL`을 받는다" 참고.
      .addColumn('theme_id', 'uuid', (col) => col.references('themes.id').onDelete('restrict'))
      .addColumn('schema', 'jsonb', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute()

    await db.schema.createIndex('layouts_project_idx').on('layouts').column('project_id').execute()

    await db.schema
      .alterTable('projects')
      .addColumn('default_layout_id', 'uuid', (col) => col.references('layouts.id').onDelete('set null'))
      .execute()
  },

  // 컬럼을 먼저 떨어뜨린다 — `layouts`를 먼저 지우려 하면 `projects.default_layout_id`의
  // FK가 남아 있어 실패한다. `test/global-setup.ts`가 매 실행 latest → none → latest를
  // 왕복하므로 이 순서가 틀리면 그 자리에서 드러난다.
  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.alterTable('projects').dropColumn('default_layout_id').execute()
    await db.schema.dropTable('layouts').execute()
  },
}
