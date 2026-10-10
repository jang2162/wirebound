import type { Kysely, Migration } from 'kysely'
import { sql } from 'kysely'

/**
 * `snapshots` 테이블 — 설계서 「스냅샷」의 *"삭제 없는 태그"*다.
 *
 * ---
 *
 * **`payload`가 jsonb 하나다 — 자원마다 테이블을 만들지 않는다.**
 *
 * 「스냅샷」이 *"현재 프로젝트 전체 상태(메뉴·페이지·레이아웃·테마·코멘트)를 `payload`에 압축
 * 저장한다"*고 적은 그대로다. 다섯 자원을 각각 `snapshot_pages`·`snapshot_menu_nodes`…로
 * 쪼개면 **스냅샷이 그 자원들의 스키마 변경을 따라다녀야 한다** — 페이지에 컬럼이 하나
 * 늘 때마다 그 사본 테이블도 함께 늘려야 하고, 늘리지 않으면 옛 스냅샷과 새 스냅샷이
 * 서로 다른 것을 담게 된다. jsonb 하나면 그 결합이 없고, 대신 **payload 형식 자체가
 * 자기 버전을 든다**(`payloadVersion` — `@wirebound/themes`의 `snapshot/payload.ts`).
 *
 * **`json`이 아니라 `jsonb`인 것은 `pages.schema`와 같은 이유다.** 키 순서 계약이 걸리는
 * 것은 테마의 **절**뿐인데(0006의 주석), 그 절들은 payload 안에서 이미 **값**으로 들어가
 * 있고 우리가 그 순서를 다시 읽지 않는다 — 복원은 문서를 통째로 다시 쓴다. 반대로 `jsonb`가
 * 주는 것이 둘 있다: NUL(U+0000)이 든 값을 **삽입 시점에** 거부하고(`22P05`), payload의
 * 실제 바이트 크기를 `octet_length(payload::text)`로 한 문장에 잴 수 있다.
 *
 * ---
 *
 * **`UNIQUE (project_id, tag)`.**
 *
 * 태그는 이름이다. 같은 프로젝트에 같은 이름이 둘이면 *"그때 그 화면"*을 지목할 수 없다.
 * 충돌은 `routes/snapshots.ts`가 **409**로 옮긴다.
 *
 * **인덱스를 따로 만들지 않는다.** 목록 조회(`WHERE project_id = ?`)는 이 UNIQUE가 만드는
 * B-tree 복합 인덱스의 **선두 컬럼만으로 만족된다** — 0008이 `(page_id, node_id)` 하나로
 * `(page_id)` 조회를 덮은 것과 같은 판단이고, 따로 만들면 쓰기마다 갱신 비용만 늘린다.
 *
 * ---
 *
 * **DELETE 경로가 없다(「스냅샷」 — *"삭제 없는 태그"*).**
 *
 * 라우트를 만들지 않는 것으로 그 성질을 지킨다. 다만 **행이 절대 사라지지 않는다는 뜻은
 * 아니다** — `project_id`가 `ON DELETE CASCADE`라 프로젝트를 지우면 그 스냅샷도 함께 간다.
 * 그것이 옳은 이유는 `revisions`·`comments`와 같다: 프로젝트가 사라지면 스냅샷이 가리키는
 * 대상 자체가 없다. 「스냅샷」이 막는 것은 *"기록을 골라서 지우는 것"*이지 프로젝트 삭제가 아니다.
 * 저절로 지워지는 다른 하나는 메뉴 연쇄 삭제의 안전망이다 — 프로젝트마다 개수 상한이 있다(`0022-snapshot-kind` · `services/menu-cascade.ts`
 * 머리말 «안전망 스냅샷»).
 *
 * **`created_by`는 `ON DELETE RESTRICT`다** — `comments.author_id`와 같은 이유다.
 * 사용자를 지우는 경로가 없어 지금은 도달하지 않지만, 그 경로를 만드는 사람에게 *"그 사람이 얼린
 * 기록을 어떻게 할 것인가"*를 묻게 만든다. `CASCADE`면 삭제 없는 태그가 사람 하나를 지우는
 * 것으로 사라지고, `SET NULL`이면 *"누가 얼렸는지"*를 목록이 그릴 수 없다.
 *
 * ---
 *
 * **`created_at`의 기본값(`now()`)은 도달하지 않는다 — 값을 애플리케이션이 심는다.**
 *
 * `repos/snapshots.ts`의 `insertSnapshot`이 **언제나 `payload.capturedAt`을 이 컬럼에
 * 싣는다.** 그것이 `snapshots`에 행을 넣는 유일한 경로이므로 이 `defaultTo`는 도달하지
 * 않는 자리이고, 그래도 남겨 두는 것은 `NOT NULL` 컬럼의 기본값을 지우면 그 경로 밖에서
 * 넣는 문장이 생겼을 때 **행이 안 들어가는 것이 아니라 에러가 나기** 때문이다.
 *
 * **`now()` 기본값에 맡기면 payload 안의 `capturedAt`과 이 컬럼이 어긋난다** — *"같은
 * 트랜잭션의 같은 시점이라 어긋나지 않는다"*는 거짓이다. 세 가지가 겹친다:
 * ㉠ 두 값이 애초에 **다른 순간**이고(수집 끝 vs 삽입 트랜잭션 시작), ㉡ `now()`는
 * `transaction_timestamp()`라 트랜잭션 안에서 **얼어 있으며**, ㉢ `capturedAt`을
 * **Node의 시계**로 찍으면 DB 시계와 또 갈린다.
 *
 * **그래서 값을 하나로 만든다.** 근거와 대안 비교는
 * `repos/snapshots.ts`의 `insertSnapshot` 머리말에 있다.
 *
 * **0008과 갈리는 지점.** 그쪽은 컬럼 기본값으로 `clock_timestamp()`를 골라
 * 스레드 순서를 만들었고, 여기는 **기본값을 쓰지 않고** 캡처가 읽은 `clock_timestamp()`를
 * 심는다 — 결과적으로 두 표 다 트랜잭션 시작 시각에 기대지 않는다.
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('snapshots')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('project_id', 'uuid', (col) => col.notNull().references('projects.id').onDelete('cascade'))
      .addColumn('tag', 'text', (col) => col.notNull())
      // `NULL`이면 설명을 적지 않았다. 빈 문자열과 가르는 것은 `projects.description`과 같다.
      .addColumn('description', 'text')
      .addColumn('payload', 'jsonb', (col) => col.notNull())
      .addColumn('created_by', 'uuid', (col) => col.notNull().references('users.id').onDelete('restrict'))
      // 기본값은 도달하지 않는다 — `insertSnapshot`이 언제나 값을 싣는다(위 머리말).
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .execute()

    await db.schema
      .createIndex('snapshots_project_tag_key')
      .on('snapshots')
      .columns(['project_id', 'tag'])
      .unique()
      .execute()
  },

  // 테이블을 지우면 그 인덱스도 함께 간다. 다른 테이블에 컬럼을 더하지 않았으므로
  // 0007처럼 순서를 지킬 것이 없다 — 그래도 `test/global-setup.ts`가 매 실행
  // latest → none → latest를 왕복하므로 이 `down`이 실제로 도는 것은 확인된다.
  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('snapshots').execute()
  },
}
