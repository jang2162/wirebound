import type { Kysely, Migration } from 'kysely'
import { sql } from 'kysely'

/**
 * **이 표는 `0018-drop-json-themes.ts`가 걷는다.** 아래가 가리키는 코드(`repos/themes.ts` · `services/system-themes.ts` ·
 * `packages/themes/src/emit/index.ts`의 테마 컴파일러)는 그때 함께 걷혔다 — 이 마이그레이션이 왜 이 모양인지 볼 때는
 * `git show 34c6c9d0:<경로>`로 연다.
 *
 * `themes` 테이블을 만든다 — 설계서 「테이블 정의」의 테마 저장소다. 테마 문서(설계서
 * 「테마 규격」의 여섯 절)를 **절마다 컬럼 하나**로 쪼개 담는다.
 *
 * `Theme` 객체를 통째로 한 컬럼에 넣지 않는 이유는 설계서 「테이블 정의」가 절마다 컬럼을 두었고
 * `slug`·`extends_ref`에 제약과 인덱스가 걸려야 하기 때문이다. **`meta`는 컬럼으로
 * 흩어진다** — `meta.id`는 `slug`, `meta.extends`는 `extends_ref`, 나머지(`name`·
 * `description`·`version`·`preview`)는 각 컬럼이다. 읽을 때 `repos/themes.ts`가 다시
 * `Theme` 모양으로 조립한다.
 *
 * **`preview` 컬럼이 있어야 한다** — `ThemeMeta`(설계서 「meta」)가 `preview`를 갖는다.
 * 컬럼을 두지 않으면 저장이 그 필드를 **말없이 지운다**(왕복이 깨진다).
 *
 * ---
 *
 * **절 컬럼이 `jsonb`가 아니라 `json`이다**(설계서 「테이블 정의」도 json 이다).
 *
 * 테마 컴파일러의 계약은 **문서 키 순서가 곧 우선순위**다(`states`끼리, 그리고 한 스타일
 * 맵 안의 프로퍼티끼리). 그런데 Postgres `jsonb`는 키를 **(길이, 바이트)로 정규화**한다 —
 * 컨테이너에서 직접 쟀다(PostgreSQL 16.14):
 *
 * ```
 * '{"selected":1,"disabled":2,"loading":3,"empty":4}'::jsonb
 *   → {"empty": 4, "loading": 3, "disabled": 2, "selected": 1}
 * '{"bgGradient":"a","bgImage":"b"}'::jsonb  →  {"bgImage": "b", "bgGradient": "a"}
 * ```
 *
 * 중첩 안쪽까지 그렇고, 순서를 반대로 적어도 **같은 결과**가 나온다. 즉 `jsonb`에 담는
 * 순간 작성자가 적은 순서는 **복원할 수 없게 사라진다.** `json`은 원문 텍스트를 그대로
 * 보관하므로(공백·중복 키까지 그대로다) 왕복이 순서를 지킨다 — 같은 자리에서 함께 쟀다.
 *
 * **대가 셋을 알고 고른다.**
 * 1. `jsonb` 연산자·GIN 인덱스를 잃는다. 테마의 접근 패턴은 `(project_id, slug)`나
 *    `id`로 **통째로 읽는 것**뿐이라 절 안쪽을 조건으로 거는 질의가 없다. 생기면 그때
 *    생성 컬럼이나 별도 인덱스를 붙이는 편이 순서 계약을 버리는 것보다 싸다.
 * 2. `json`은 **중복 키를 보존한다.** 이 저장소에서는 도달하지 않는다 — 쓰기는 전부
 *    `JSON.stringify`(JS 객체 → 중복 키 없음)를 거치고, HTTP 본문도 `JSON.parse`가
 *    먼저 접는다.
 * 3. **`json`은 NUL(`\u0000`)을 삽입 시점에 막지 않는다.** `jsonb`는 거부하는데(`22P05`)
 *    `json`은 받아 두었다가 `->>`로 텍스트를 뽑을 때에야 죽는다(둘 다 쟀다). DB가 대신
 *    잡아 주던 방벽이 사라지므로 `repos/themes.ts`가 `containsNulByte`로 직접 막는다.
 *
 * 나머지 두 갈래를 버린 이유: **순서를 배열로 옮기면** 설계서 「components — 구조 + 스킨」의 객체 표기가 바뀌어 설계
 * 문서·저작 UI·이미 쓴 시스템 테마가 함께 움직여야 하고, **순서 계약을 버리면**
 * 테마 컴파일러가 이름 정렬 같은 것을 써야 하는데 그것은 작성자가 적은 순서와 무관한
 * 우선순위를 만든다(같은 프로퍼티를 건드리는 상태 둘의 승자가 이름의 알파벳 순으로 정해진다).
 *
 * ---
 *
 * `project_id`는 `projects(id)`를 `ON DELETE CASCADE`로 참조한다 — 프로젝트가 지워지면
 * 그 프로젝트의 테마가 함께 지워진다(`pages`·`menu_nodes`와 같은 전제). **`NULL`이면
 * 시스템 테마**다(설계서 「테이블 정의」·「테마 관리」: 읽기 전용, 배포에 실려 온다).
 *
 * **`UNIQUE NULLS NOT DISTINCT (project_id, slug)`** — 설계서 「테이블 정의」가 요구하는 `UNIQUE
 * (project_id, slug)`인데, 평범한 UNIQUE로는 **시스템 테마에 아무 제약도 걸리지 않는다.**
 * SQL의 NULL은 자기 자신과도 같지 않아 `(NULL, 'admin')` 두 행이 충돌로 판정되지 않기
 * 때문이다 — 임시 테이블에 실제로 두 번 넣어 둘 다 남는 것으로 확인된다.
 * `NULLS NOT DISTINCT`(PG15+)는 그 쌍을 같은 것으로 보아 막고, 프로젝트별 유일성은
 * 그대로 지킨다. 부분 인덱스를 따로 두지 않는 이유는 제약 하나가 뜻도 하나이고
 * (*"slug는 소유자 안에서 유일하다"*), 기동 동기화(`services/system-themes.ts`)가
 * `ON CONFLICT (project_id, slug)` **한 문장**으로 두 경우를 다 덮기 때문이다.
 *
 * `extends_ref`에는 FK를 걸지 않는다. 값이 `system:<id>`라는 **문자열 참조**이지 uuid가
 * 아니고(설계서 「상속과 병합」의 `meta.extends` 표기 그대로), 가리키는 대상은 코드가 진실인 시스템
 * 테마다. 참조 무결성은 라우트(`routes/themes.ts`)가 저장 전에 확인한다.
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('themes')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      // NULL = 시스템 테마. 그래서 notNull이 아니다.
      .addColumn('project_id', 'uuid', (col) => col.references('projects.id').onDelete('cascade'))
      // `meta.id`. 형식(THEME_ID_PATTERN)은 zod가 보고 DB는 유일성만 본다.
      .addColumn('slug', 'text', (col) => col.notNull())
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('description', 'text')
      // `meta.extends`. `system:<id>` 문자열이다 — 위 주석의 "FK를 걸지 않는다" 참고.
      .addColumn('extends_ref', 'text')
      // `meta.version`. 형식을 강제하지 않는다(해석 대상이 아니라 사람이 읽는 표시다).
      .addColumn('version', 'text', (col) => col.notNull())
      // `meta.preview`. 없으면 저장이 그 필드를 지운다 — 위 주석 참고.
      .addColumn('preview', 'text')
      // 절 다섯. **`json`이다** — 위의 「절 컬럼이 `jsonb`가 아니라 `json`이다」 참고.
      // NULL은 "그 절이 없다", `{}`는 "있는데 비었다"로 서로 다르다
      // (`test/repos-themes.test.ts`의 *"빈 절과 없는 절이 왕복 후에도 구별된다"*가 고정한다).
      .addColumn('tokens', 'json')
      .addColumn('primitives', 'json')
      .addColumn('components', 'json')
      .addColumn('patterns', 'json')
      .addColumn('assets', 'json')
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addUniqueConstraint('themes_project_slug_key', ['project_id', 'slug'], (builder) =>
        builder.nullsNotDistinct(),
      )
      .execute()

    // "이 프로젝트의 테마 목록"이 유일한 목록 조회다(`repos/themes.ts`의 `listThemes`).
    // 시스템 테마(`project_id IS NULL`)도 이 인덱스로 함께 찾힌다.
    await db.schema.createIndex('themes_project_idx').on('themes').column('project_id').execute()
  },

  // 인덱스와 유니크 제약은 테이블과 함께 사라지므로 따로 DROP하지 않는다(`0004-pages`와 같다).
  // `layouts.theme_id`가 이 테이블을 참조하지만 그 테이블을 만든 0007의 `down`이
  // 마이그레이션 역순상 먼저 돌아 이미 사라진 뒤다 — `test/global-setup.ts`가 매 실행
  // latest → none → latest를 왕복하며 이 순서를 확인한다.
  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('themes').execute()
  },
}
