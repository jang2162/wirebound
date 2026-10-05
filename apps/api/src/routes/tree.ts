/**
 * 통합 트리 라우트: 메뉴 폴더와 페이지를 한 트리로 합쳐 낸다(설계서 「설계서 화면 구조」, 좌측 패널).
 * `projectRoutes`·`menuRoutes`·`pageRoutes`(`routes/projects.ts`·`routes/menu.ts`·
 * `routes/pages.ts`)와 같은 `/api/projects` prefix로 등록한다(`app.ts`). 이 파일의
 * 라우트는 `/:projectId/tree` 하나뿐이다.
 *
 * HTTP·zod 검증만 다룬다 — SQL은 전부 `repos/menu.ts`(`listMenuRows`)와
 * `repos/pages.ts`(`listPageRows`)에 맡긴다(README "계층 규칙": `routes/`는 SQL을
 * 직접 쓰지 않는다 — 다른 라우트 파일과 같은 규칙이다). 메뉴 전체와 페이지 전체를
 * 각각 한 번씩(총 2회) 조회하고, 조립은 순수 함수인 `services/menu-tree.ts`의 `buildMenuTree`에
 * 맡긴다 — 노드마다 페이지를 다시 조회하면 N+1이 되므로 여기서 반드시 피한다.
 *
 * `listMenuRows`·`listPageRows` 둘 다 `schema` 컬럼을 고르지 않는다 — 트리 응답에
 * 페이지 스키마가 실리면 프로젝트가 커질수록 목록이 무거워진다.
 *
 * `rootPages`는 없다 — `pages.menu_node_id`가 `NOT NULL`이라 페이지는 항상 메뉴
 * 노드에 속한다.
 *
 * **`rev`(메뉴 트리 판 번호 — `repos/menu.ts`의 `readMenuRev`)를 함께 싣고, 셋을 한 스냅숏에서 읽는다**(`REPEATABLE READ`). 화면은 이
 * 번호로 겹친 조회의 낡은 답을 버리고 이미 받은 판의 `menu-changed`를 넘긴다 — 번호가 행보다 앞서면(번호를 따로 읽은 뒤 쓰기가 끼면)
 * 옛 행을 새 판으로 믿고 그 판의 신호를 넘겨 조용히 낡는다. 테스트 하네스처럼 이미 트랜잭션 안이면 그 트랜잭션에서 읽는다.
 */
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { projectGuard } from '../auth/roles'
import { parseParams } from '../http/parse'
import type { DbHandle } from '../db/tx'
import { listMenuRows, readMenuRev } from '../repos/menu'
import { listPageRows } from '../repos/pages'
import { buildMenuTree } from '../services/menu-tree'

const ProjectIdParams = z.object({ projectId: z.uuid() })

/** `app.ts`가 `app.register(treeRoutes(), { prefix: '/api/projects' })`로 등록하는 팩토리. */
export function treeRoutes() {
  return async function plugin(app: FastifyInstance): Promise<void> {
    app.get('/:projectId/tree', { preHandler: projectGuard('viewer') }, async (request) => {
      const { projectId } = parseParams(ProjectIdParams, request.params)

      const read = async (db: DbHandle) => {
        const rev = await readMenuRev(db, projectId)
        const nodes = await listMenuRows(db, projectId)
        const pages = await listPageRows(db, projectId)
        return { menu: buildMenuTree(nodes, pages), rev }
      }
      return app.db.isTransaction ? read(app.db) : app.db.transaction().setIsolationLevel('repeatable read').execute(read)
    })
  }
}
