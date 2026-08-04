import type { Migration, MigrationProvider } from 'kysely'
import { migration as m0001 } from './0001-users-sessions'
import { migration as m0002 } from './0002-projects-members'
import { migration as m0003 } from './0003-menu-nodes'
import { migration as m0004 } from './0004-pages'
import { migration as m0005 } from './0005-revisions'

/**
 * 정적 마이그레이션 레지스트리.
 *
 * Kysely의 `FileMigrationProvider`는 마이그레이션 파일을 동적 `import()`로 읽는다.
 * `.ts` 파일의 동적 import는 tsx·vitest·순수 node에서 서로 다르게 동작한다 —
 * 실행기마다 결과가 갈리는 부류의 문제다. 그래서 각 마이그레이션을 여기서
 * 정적으로 import해 객체에 담는다: 동적 해석이 사라지고, 마이그레이션을 추가하는
 * 비용은 import 한 줄이 되며, 순서가 파일에 그대로 드러난다. 키를 빠뜨리면
 * (참조하지 않은 import) 컴파일 오류가 된다.
 *
 * 키는 알파벳(오름차순) 순서로 적는다 — Kysely의 `Migrator`가 이 순서로 실행한다.
 */
export const MIGRATIONS: Record<string, Migration> = {
  '0001-users-sessions': m0001,
  '0002-projects-members': m0002,
  '0003-menu-nodes': m0003,
  '0004-pages': m0004,
  '0005-revisions': m0005,
}

export const migrationProvider: MigrationProvider = {
  getMigrations: async () => MIGRATIONS,
}
