import type { Kysely, Migration } from 'kysely'
import { sql } from 'kysely'

/**
 * `comments` 테이블 — 설계서 「설계서 화면 구조」의 *"우측 코멘트 탭"*이 담는 말이다.
 *
 * ---
 *
 * **`marker` 컬럼이 없다.** 번호는 **페이지 문서의 노드**가 든다
 * (`marker?: number`, `packages/schema/src/node.ts`). 설계서 「페이지 스키마 노드」가 *"없으면 코멘트 없음"*이라
 * 적었으므로 **문서만 봐도 마커를 그릴 수 있어야 하고**, 내보낸 HTML 번들(「HTML 정적 번들」)과
 * PPTX가 문서만 들고 그린다. 반대로 본문·작성자·시각을 문서에 넣으면 코멘트 한 줄이
 * revision 로그를 만들고 undo 스택에 섞인다.
 *
 * 번호는 **노드에서 파생되는 값**이지 코멘트가 스스로 드는 값이 아니다 — 그래서 **같은
 * 노드의 코멘트들이 같은 번호를 공유**한다.
 *
 * **페이지 JSON 봉투는 `comments[].marker`를 받지 않는다.** 근거는 이 절의 첫 문단과
 * 같다 — 파생 값을 파일에 겹쳐 적으면 **같은 값의 출처가 둘**이 되고, 사람이 파일을 열어
 * `schema` 안의 노드에서 번호를 고치는 순간 둘이 갈린다. 그때 무엇을 믿을지 정하는 규칙이
 * 이 저장소 어디에도 없다. 내보내기는 `nodeId`·`body`만 싣고 번호는 **`schema` 안의 노드가
 * 그대로 나른다.** 가져오기도 그 노드의 번호를 그대로 쓰고 새로 매기지 않는다 —
 * 번호를 부여하는 자리는 이 파일이 지키는 그대로 `routes/comments.ts` **하나**다.
 * 규격과 근거는 `packages/schema/src/page-json/envelope.ts`의 「번호는 노드가 든다」 절에
 * 있고, 봉투는 그 키를 **조용히 버리지 않고 거부한다**(문장이 노드를 가리킨다).
 *
 * ---
 *
 * **`page_id`이지 `project_id`가 아니다.** 코멘트는 페이지의 **노드**에 붙고
 * (`node_id`가 그 앵커다), 노드 id는 그 페이지 문서 안에서만 뜻이 있다. `ON DELETE
 * CASCADE`인 것은 `revisions`와 같은 이유다 — 페이지가 사라지면 그 노드도 사라지므로
 * 가리킬 곳 없는 코멘트만 남는다. 과거 상태의 보존은 스냅샷(설계서 「스냅샷」)의 책임이다.
 *
 * **`node_id`에 FK가 없다.** 노드는 테이블이 아니라 `pages.schema`(jsonb) 안의 값이다.
 * 그래서 **문서에 없는 `node_id`를 가진 행이 존재할 수 있고**, 그것을 막는 것은 라우트다
 * (`POST .../comments`가 문서에서 노드를 찾지 못하면 404). 지워진 노드에 붙어 있던
 * 코멘트가 남는 경로는 여전히 열려 있다 — 그 판정은 `routes/comments.ts`의 머리말에 있다.
 *
 * ---
 *
 * **인덱스는 `(page_id, node_id)` 하나다.** `(page_id)` 단독을 따로 두지 않는다 — **B-tree
 * 복합 인덱스의 선두 컬럼은 단독 인덱스처럼 쓰인다** — `WHERE page_id = ?`(탭이 그
 * 페이지의 코멘트를 전부 받는 조회)는 이 인덱스의 선두 컬럼만으로 만족되므로 `(page_id)`
 * 단독은 같은 일을 두 번 하는 것이고, 쓰기마다 갱신 비용만 늘린다. `revisions`가
 * `(page_id, seq)` UNIQUE 하나로 *"이 페이지의 이력을 seq 순으로"*를 덮은 것과 같은 판단이다.
 *
 * **UNIQUE가 아니다** — 한 노드에 코멘트가 여럿 붙는다(스레드).
 *
 * ---
 *
 * **`created_at`이 `now()`가 아니라 `clock_timestamp()`다.**
 *
 * `now()`(= `transaction_timestamp()`)는 **트랜잭션이 시작한 시각**이라 한 트랜잭션 안에서
 * 만들어진 행이 전부 같은 값을 갖는다. 그래도 되는 테이블은 정렬 키가 따로 있거나
 * (`revisions.seq`·`menu_nodes.sort_order`) 순서를 보지 않기 때문이다. **코멘트의 스레드
 * 순서를 정하는 것은 시각뿐이다.**
 *
 * 실제로 갈리는 자리: api 테스트 하네스가 **테스트 하나 전체를 트랜잭션 하나로** 감싸므로
 * (`test/helpers.ts`의 `withApi`), `now()`면 한 테스트에서 만든 코멘트들의 `created_at`이
 * 전부 같아져 *"먼저 단 코멘트가 먼저 나온다"*를 잴 수 없다. 운영에서도 같은 요청 안에서
 * 코멘트를 여럿 만드는 경로가 생기면 같은 일이 난다.
 *
 * `id`(랜덤 uuid)를 2차 정렬 키로 두는 것으로는 닫히지 않는다 — 랜덤이라 삽입 순서와
 * 무관하다. `repos/comments.ts`가 `(created_at, id)`로 정렬하는 것은 **동률일 때의
 * 결정성**을 위해서지 순서를 만들어 내기 위해서가 아니다.
 *
 * ---
 *
 * **`author_id`는 `ON DELETE RESTRICT`다.** 사용자를 지우는 경로가 없으므로 지금은 도달하지
 * 않는다. 그래도 `RESTRICT`인 것은 **셋 중 어느 것도 조용해서는 안 되기 때문**이다:
 * `CASCADE`면 사람이 나갈 때 그가 남긴 설계 피드백이 말없이 사라지고, `SET NULL`이면
 * 작성자 없는 코멘트가 생겨 화면이 이름 자리에 무엇을 쓸지 모른다. `RESTRICT`는 사용자
 * 삭제 경로를 만드는 사람에게 *"코멘트를 어떻게 할 것인가"*를 묻게 만든다 —
 * `layouts.theme_id`가 같은 이유로 `RESTRICT`다.
 *
 * `revisions.actor_id`가 FK를 안 건 것과 갈리는데 근거가 있다: 그쪽은 `actor_type`에 따라
 * `users`와 `api_tokens` 두 테이블을 가리키므로 FK를 걸 수 없다. 코멘트의 작성자는
 * **사람뿐이다** — 토큰으로 단 코멘트(MCP의 `add_comment`)도 토큰의 주인이 작성자다.
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('comments')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('page_id', 'uuid', (col) => col.notNull().references('pages.id').onDelete('cascade'))
      // 노드는 테이블이 아니라 jsonb 문서 안의 값이라 FK를 걸 수 없다(위 머리말).
      .addColumn('node_id', 'text', (col) => col.notNull())
      .addColumn('body', 'text', (col) => col.notNull())
      .addColumn('author_id', 'uuid', (col) => col.notNull().references('users.id').onDelete('restrict'))
      // `now()`가 아니다 — 위 머리말의 "clock_timestamp" 절 참고.
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`clock_timestamp()`))
      .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`clock_timestamp()`))
      .execute()

    await db.schema
      .createIndex('comments_page_node_idx')
      .on('comments')
      .columns(['page_id', 'node_id'])
      .execute()
  },

  // 테이블을 지우면 그 인덱스도 함께 간다. 다른 테이블에 컬럼을 더하지 않았으므로
  // 0007처럼 순서를 지킬 것이 없다 — 그래도 `test/global-setup.ts`가 매 실행
  // latest → none → latest를 왕복하므로 이 `down`이 실제로 도는 것은 확인된다.
  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('comments').execute()
  },
}
