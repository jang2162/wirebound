import type { Kysely, Migration } from 'kysely'

/**
 * **프로젝트 메뉴 트리의 판 번호.** 메뉴 · 페이지 트리를 바꾸는 쓰기가 커밋마다 1 올리고(`repos/menu.ts`의 `bumpMenuRev`), 그 값을
 * `menu-changed` 프레임과 트리 응답(`GET …/tree`의 `rev`)에 싣는다. 받는 화면은 그 번호로 겹친 조회의 낡은 답을 버리고, 이미 받은 판의
 * 프레임에는 다시 받지 않는다(`apps/web`의 `tree/use-tree-commands.tsx`).
 *
 * | 칸 | 무엇 |
 * |---|---|
 * | `project_id` | 프로젝트. **FK 가 아니다** — 아래 «잠금» |
 * | `rev` | 마지막으로 커밋된 트리 쓰기의 번호. 줄이 없으면 0 이다(아직 아무도 트리를 안 바꿨다) |
 *
 * **`projects` 행에 두지 않는다 — 잠금 순서 때문이다.** 제목만 바꾸는 쓰기는 프로젝트 행을 안 잡고 메뉴 · 페이지 행을 먼저 잡는다
 * (`routes/menu.ts`의 `PATCH` · `routes/pages.ts`의 `PATCH` 바탕 경로). 끝에서 프로젝트 행을 `NO KEY UPDATE`로 올리면 «메뉴 행 → 프로젝트
 * 행»이 되어, «프로젝트 행 → 메뉴 행»으로 잡는 자리 옮기기(`repos/projects.ts`의 `lockProjectTree`)와 고리를 만든다.
 *
 * **잠금 — 쓰기 트랜잭션의 맨 끝 문장으로 올린다.** 그 뒤로 기다리는 잠금이 없어 이 줄을 쥔 트랜잭션은 커밋만 남았다 — 누구도 이 줄을
 * 쥔 채 다른 행을 기다리지 않으므로 고리에 낄 수 없다. 둘이 겹치면 뒤의 것이 앞의 커밋을 기다려 그 다음 번호를 받는다 — **번호 차례가 곧
 * 커밋 차례다.** FK 를 걸면 줄을 처음 넣는 `INSERT`가 프로젝트 행에 `KEY SHARE`를 건다 — 제목 쓰기가 메뉴 행을 쥔 채 그것을 기다리고
 * 프로젝트 삭제 · 복원(프로젝트 행 `FOR UPDATE` → 메뉴 행)이 그 메뉴 행을 기다리면 고리다. 그래서 FK 없이 두고, 프로젝트 삭제가 줄을
 * 지운다(`repos/projects.ts`의 `deleteProject`).
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('project_menu_revs')
      .addColumn('project_id', 'uuid', (col) => col.primaryKey())
      .addColumn('rev', 'bigint', (col) => col.notNull())
      .execute()
  },

  // **`down`은 번호를 버린다** — 다시 올리면 0 부터 센다. 그 사이 열려 있던 화면은 더 큰 판을 들고 있어 그보다 작은 번호의 답과
  // 프레임을 낡은 것으로 버린다 — 새로고침해야 맞는다. 번호가 내려가는 길은 이것 하나다(서버 재기동은 번호를 지킨다).
  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('project_menu_revs').execute()
  },
}
