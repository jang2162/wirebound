import type { Kysely, Migration } from 'kysely'
import { sql } from 'kysely'

/**
 * `presets` 테이블 — 설계서 「페이지 프리셋」의 *"현재 페이지를 프리셋으로 저장"*.
 *
 * ---
 *
 * **`schema`에 담는 것은 `WbNode[]`(root의 children)이지 문서 봉투가 아니다.**
 *
 * 적용이 root를 바꾸지 않기 때문이다(root의 `id`·`type`·`props`는 **그 페이지의
 * 것**이지 프리셋의 것이 아니다). 봉투째 담으면 저장 시점 페이지의 root id가 프리셋에
 * 실려 다니고, 적용하는 쪽은 그것을 **버려야 한다** — 쓰지 않을 값을 담는 열이 된다.
 *
 * `json`이 아니라 `jsonb`인 것은 `pages.schema`·`snapshots.payload`와 같은 이유다:
 * 키 순서를 우리가 다시 읽지 않고, 대신 NUL(U+0000)이 든 값을 **삽입 시점에** 거부한다
 * (`22P05`). 그 거부가 어디서 어떤 상태로 나타나는지는 `routes/presets.ts`가 적어 두었다.
 *
 * ---
 *
 * **이름에 UNIQUE를 걸지 않는다 — `snapshots.tag`와 갈리는 자리다.**
 *
 * 태그는 *"그때"*를 지목하는 이름이라 유일해야 하고 지울 수도 없다(설계서 「스냅샷」의 *"삭제 없는
 * 태그"*). **프리셋은 지울 수 있고 고르는 것은 id다** — 같은 이름 둘은 사용자의 실수이지
 * 시스템의 모순이 아니고, 유일 제약은 *"이름을 바꾸라"*는 409를 만들어 저장을 막는다.
 *
 * **그 대신 인덱스를 하나 만든다.** 0009는 UNIQUE가 만드는 복합 인덱스의 선두 컬럼이
 * 목록 조회를 덮지만 여기는 UNIQUE가 없으므로 `(project_id, created_at)`을 직접 만든다 —
 * 목록이 그 순서로 나가므로(`repos/presets.ts`) 정렬까지 인덱스가 덮는다.
 *
 * ---
 *
 * **`created_by`는 `ON DELETE RESTRICT`다** — `comments.author_id`·`snapshots.created_by`와
 * 같은 이유다. 사용자를 지우는 경로가 없어 지금은 도달하지 않지만, 그 경로를 만드는
 * 사람에게 *"그 사람이 만든 프리셋을 어떻게 할 것인가"*를 묻게 만든다.
 *
 * **`project_id`는 `ON DELETE CASCADE`다.** 프리셋은 프로젝트가 소유한다(「페이지 프리셋」) —
 * 프로젝트가 사라지면 그것이 가리키는 대상 자체가 없다.
 *
 * ---
 *
 * **목록 순서 — `created_at`의 기본값이 `now()`가 아니라 `clock_timestamp()`다.**
 *
 * `now()`는 `transaction_timestamp()`라 **트랜잭션 안에서 얼어 있다**(0009의 주석이 같은
 * 사실을 다른 이유로 적었다). 그래서 한 트랜잭션에서 만든 두 행의 `created_at`이 **같은
 * 값**이 되어 정렬이 동률로 떨어지고, 그다음 순서를 정하는 것은 `id`(랜덤 uuid)다 —
 * `test/presets.test.ts`의 *"프로젝트 프리셋은 내장 뒤에 오래된 것부터 붙는다"*가
 * `['나중', '먼저']`로 죽는다.
 *
 * **0008도 같은 이유로 `clock_timestamp()`를 쓴다**(코멘트 스레드 순서). 여기도
 * 목록의 자리가 움직이면 안 되는 값이므로 같은 것을 쓴다 — *"내가 어제 만든 것"*을 찾을
 * 때 자리가 흔들리지 않는 것이 이 열의 쓸모다.
 *
 * **운영에서는 요청마다 트랜잭션이 갈리므로 `now()`로도 대개 갈린다.** 그래서 이
 * 결함은 **테스트에서만** 드러나는데, 그 사실 자체가 이 기본값을 고른 이유다 — 순서를
 * 트랜잭션 경계에 기대게 두면 그 경계가 바뀌는 날(배치 저장·복원 경로) 조용히 어긋난다.
 *
 * ---
 *
 * **`updated_at`이 있고 그것을 바꾸는 경로는 없다.** 프리셋 수정(PATCH) 라우트가
 * 없기 때문이다(프리셋이 하는 일은 *"프리셋으로 시작하고, 지금 페이지를 프리셋으로
 * 남긴다"* 둘이다). 컬럼을 미리 두는 것은 `projects`·`pages`와 같은 모양을 유지하기
 * 위해서이고, **없는 것을 있다고 말하지 않으려고 README의 표에는 응답 키로 싣지 않는다.**
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('presets')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('project_id', 'uuid', (col) => col.notNull().references('projects.id').onDelete('cascade'))
      .addColumn('name', 'text', (col) => col.notNull())
      // `NULL`이면 설명을 적지 않았다. 빈 문자열과 가르는 것은 `snapshots.description`과 같다.
      .addColumn('description', 'text')
      // `WbNode[]`. 배열이라는 것은 저장 경계(`routes/presets.ts`의 zod)가 지킨다 —
      // jsonb는 배열도 객체도 받는다.
      .addColumn('schema', 'jsonb', (col) => col.notNull())
      .addColumn('created_by', 'uuid', (col) => col.notNull().references('users.id').onDelete('restrict'))
      // **`now()`가 아니라 `clock_timestamp()`다 — 0008과 같은 자리다.**
      // 위 머리말의 *"목록 순서"* 절에 고장 방식과 그것을 잡는 테스트가 있다.
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`clock_timestamp()`))
      .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`clock_timestamp()`))
      .execute()

    await db.schema.createIndex('presets_project_created_idx').on('presets').columns(['project_id', 'created_at']).execute()
  },

  // 테이블을 지우면 그 인덱스도 함께 간다. `test/global-setup.ts`가 매 실행 latest → none →
  // latest를 왕복하므로 이 `down`이 실제로 도는 것은 확인된다.
  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('presets').execute()
  },
}
