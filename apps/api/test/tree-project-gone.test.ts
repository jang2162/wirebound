/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `withRealApi`를 쓴다 — 트리 쓰기가 프로젝트 삭제의 잠금 뒤에 **다른
 * 커넥션에서** 줄을 서야 판이 선다.
 *
 * # 무엇을 재나 — 트리 쓰기가 프로젝트 삭제 뒤에 섰다가 깨어나면 404 다 (A 리뷰 F4 · 2026-09-23)
 *
 * 트리 쓰기의 첫 잠금(`repos/projects.ts`의 `lockProjectTree`)은 프로젝트 삭제의 `FOR UPDATE`를 기다린다. 삭제가 커밋되면
 * 그 잠금은 **0 행**을 받는다. 앞 판의 머리말은 «그러면 뒤의 조회가 `null`을 보고 404 가 된다»였는데 **루트 메뉴 생성은
 * 뒤에 조회가 없어** 형제 수를 세고 `INSERT` → FK 위반 **500** 이었다(리뷰 S: 20 판 중 11). 이제 `lockProjectTree`가 0 행이면
 * 던지고(`ProjectGoneError`) 오류 처리기가 404 로 옮긴다 — 여섯 자리가 한 규칙이다.
 *
 * 판은 우연에 안 맡긴다 — 케이스가 프로젝트 행을 삭제와 같은 잠금으로 **쥐고**, 요청이 그 뒤에 **줄을 선 것을 본 뒤**
 * (`pg_locks`) 지우고 커밋한다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import { WIREBOUND_PAGE_VERSION, type PageJson } from '@wirebound/schema'
import { withTransaction } from '../src/db/tx'
import { deleteProject, lockProjectRow } from '../src/repos/projects'
import { createMenuNode, createPage, createProject, getTestDb, resetRealData, signup, withRealApi, type RealApiContext } from './helpers'

beforeEach(resetRealData)
afterEach(resetRealData)

const db = getTestDb()

/** 잠금을 기다리는 트랜잭션이 설 때까지 — 질의의 까닭은 `revisions-concurrency.test.ts`의 머리말. */
async function waitForLockWaiter(): Promise<void> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const result = await sql<{ n: number }>`
      select count(*)::int as n
        from pg_locks l
        join pg_stat_activity a on a.pid = l.pid
       where not l.granted
         and a.datname = current_database()
    `.execute(db)
    if ((result.rows[0]?.n ?? 0) >= 1) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('잠금을 기다리는 트랜잭션이 나타나지 않았습니다 — 시나리오가 성립하지 않았습니다')
}

interface Board {
  ctx: RealApiContext
  cookie: { wb_session: string }
  projectId: string
  menuId: string
  pageId: string
}

async function board(ctx: RealApiContext): Promise<Board> {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '메뉴' })
  await createMenuNode(ctx, owner.cookie, project.id, { title: '옆 메뉴' })
  const page = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '페이지' })
  await createPage(ctx, owner.cookie, project.id, menu.id, { title: '옆 페이지' })
  return { ctx, cookie: owner.cookie, projectId: project.id, menuId: menu.id, pageId: page.id }
}

function importFile(): PageJson {
  return {
    wireboundVersion: WIREBOUND_PAGE_VERSION,
    page: { title: '가져온 페이지' },
    schema: { version: 1, root: { id: 'r', type: 'Page', children: [] } },
    comments: [],
  }
}

/**
 * 프로젝트 삭제(`routes/projects.ts`와 같은 잠금 · 같은 삭제)를 쥔 채 `request`를 내고, 그것이 줄을 서면 지우고 커밋한다.
 * 요청의 상태 코드와 본문을 낸다.
 */
async function behindProjectDelete(
  b: Board,
  request: () => Promise<{ statusCode: number; body: string }>,
): Promise<{ status: number; body: string }> {
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let locked: () => void = () => {}
  const acquired = new Promise<void>((resolve) => {
    locked = resolve
  })
  const deleter = withTransaction(db, async (trx) => {
    await lockProjectRow(trx, b.projectId)
    locked()
    await held
    await deleteProject(trx, b.projectId)
  })
  await acquired
  const answer = request()
  await waitForLockWaiter()
  release()
  await deleter
  const response = await answer
  return { status: response.statusCode, body: response.body }
}

function send(b: Board, method: 'POST' | 'PATCH' | 'DELETE', path: string, payload?: object) {
  return () =>
    b.ctx.app.inject({
      method,
      url: `/api/projects/${b.projectId}${path}`,
      cookies: b.cookie,
      ...(payload === undefined ? {} : { payload }),
    })
}

describe('트리 쓰기가 프로젝트 삭제 뒤에 섰다가 깨어나면 404 다 (실커밋)', () => {
  /**
   * 리뷰 F4 의 판 — 뒤에 조회가 없는 유일한 자리. 고치기 전 500(`23503 menu_nodes_project_id_fkey`).
   *
   * 혼자 죽는 변조: `lockProjectTree`가 0 행에 던지지 않는다(앞 판). 아래 케이스는 안 죽는다 — 그 자리들은 뒤의 조회가 따로
   * 404 로 간다.
   */
  it('루트 메뉴 생성', async () => {
    await withRealApi(async (ctx) => {
      const b = await board(ctx)
      const answer = await behindProjectDelete(b, send(b, 'POST', '/menu', { parentId: null, title: '새 메뉴' }))
      expect(answer.status).toBe(404)
      expect(JSON.parse(answer.body).error.code).toBe('not-found')
    })
  })

  /**
   * 나머지 자리 — 하위 메뉴 생성 · 메뉴 순서 이동 · 메뉴 삭제 · 페이지 생성 · 페이지 순서 이동 · 페이지 삭제 · 가져오기.
   * **여섯 자리 전부가 같은 규칙인지**를 값으로 적는다(브리프: «다른 다섯 자리도 같은 규칙인지 확인»).
   *
   * **혼자 죽는 변조가 없다** — 이 자리들은 막는 것이 둘이다(`lockProjectTree`가 던진다 · 뒤의 조회가 `null`/없는 메뉴를 본다).
   * 하나를 떼면 다른 하나가 404 로 보낸다. 둘을 함께 떼거나 오류 처리기의 옮김(`ProjectGoneError` → 404)을 떼면 위 케이스와
   * **함께** 죽는다 — 옮김 축의 주인은 위 «루트 메뉴 생성»이다.
   */
  it('나머지 트리 쓰기 일곱 갈래도 404 다', async () => {
    await withRealApi(async (ctx) => {
      const statuses: Record<string, number> = {}
      const cases: Array<[string, (b: Board) => () => Promise<{ statusCode: number; body: string }>]> = [
        ['하위 메뉴 생성', (b) => send(b, 'POST', '/menu', { parentId: b.menuId, title: '하위' })],
        ['메뉴 순서 이동', (b) => send(b, 'PATCH', `/menu/${b.menuId}`, { sortOrder: 1 })],
        ['메뉴 삭제', (b) => send(b, 'DELETE', `/menu/${b.menuId}`)],
        ['페이지 생성', (b) => send(b, 'POST', '/pages', { menuNodeId: b.menuId, title: '새 페이지' })],
        ['페이지 순서 이동', (b) => send(b, 'PATCH', `/pages/${b.pageId}`, { sortOrder: 1 })],
        ['페이지 삭제', (b) => send(b, 'DELETE', `/pages/${b.pageId}`)],
        ['가져오기', (b) => send(b, 'POST', '/pages/import', { menuNodeId: b.menuId, file: importFile() })],
      ]
      for (const [name, make] of cases) {
        const b = await board(ctx)
        statuses[name] = (await behindProjectDelete(b, make(b))).status
      }
      expect(statuses).toEqual({
        '하위 메뉴 생성': 404,
        '메뉴 순서 이동': 404,
        '메뉴 삭제': 404,
        '페이지 생성': 404,
        '페이지 순서 이동': 404,
        '페이지 삭제': 404,
        가져오기: 404,
      })
    })
  })
})
