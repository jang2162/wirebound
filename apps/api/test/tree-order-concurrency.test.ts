/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `withRealApi`를 쓴다 — 두 요청이 서로 다른 커넥션에서 잠금을 다퉈야
 * 교착이 선다(롤백 하네스는 요청들이 한 트랜잭션을 나눠 쓴다).
 *
 * # 무엇을 재나 — 트리 쓰기 둘이 동시에 오면 (이월 5차 ① · 2026-09-23)
 *
 * 형제의 `sort_order`를 다시 매기는 쓰기(메뉴 · 페이지의 생성 · 순서 이동 · 소속 이동 · 삭제)가 둘이 동시에 오면
 * 형제 행을 **서로 다른 순서로** 잠가 교착이 났고, 교착의 희생자는 500 을 받았다. 생성 둘은 교착 대신 **`sort_order`가
 * 겹쳤다.** 고친 것은 «트리 쓰기는 프로젝트 행을 맨 먼저 잡는다» 하나다(`repos/projects.ts`의 `lockProjectTree` —
 * 고치기 전 값의 표도 거기 있다).
 *
 * 케이스마다 같은 판을 `ROUNDS`번 되풀이하고 **매 판마다** 본다 — 둘 다 성공(500 이 없다) · 끝의 순서가 **둘을 차례로
 * 한 결과와 같다**(섞인 순서가 없다) · 형제의 `sort_order`가 0 부터 빈틈없다. 여기 고른 판은 어느 순서로 차례로 해도
 * 끝이 같게 골랐다 — 그래서 «둘 중 하나의 결과»가 값 하나다.
 *
 * **교착은 500 으로 잰다** — `pg_stat_database.deadlocks`는 통계가 백엔드에서 늦게 모여(쉬는 동안 최대 10s) 케이스에
 * 안 쓴다(`page-meta-conflict.test.ts`의 D1 판과 같은 자세). 카운터의 값은 구현 보고에 있다.
 *
 * `ROUNDS`는 **고치기 전 판에서 빨강이 나는 수**다 — 고치기 전 60 회에 교착이 가장 드문 판(페이지 순서 이동 둘)이 11 이었다
 * (판마다 약 18%). 30 회면 한 번도 안 날 확률이 0.3% 아래다.
 *
 * **혼자 죽는 변조는 케이스마다 주석에 있다** — 변조는 `lockProjectTree`를 부르는 여섯 자리 중 하나를 떼거나 그 조건을
 * 좁힌다. 여섯 자리 전부를 한 번에 떼면 전부 죽는다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMenuNode, createPage, createProject, resetRealData, signup, withRealApi, type RealApiContext } from './helpers'

beforeEach(resetRealData)
afterEach(resetRealData)

const ROUNDS = 30

type Cookie = { wb_session: string }

interface Board {
  ctx: RealApiContext
  cookie: Cookie
  projectId: string
}

async function board(ctx: RealApiContext): Promise<Board> {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  return { ctx, cookie: owner.cookie, projectId: project.id }
}

function send(b: Board, method: 'PATCH' | 'POST' | 'DELETE', path: string, payload?: object) {
  return b.ctx.app.inject({
    method,
    url: `/api/projects/${b.projectId}${path}`,
    cookies: b.cookie,
    ...(payload === undefined ? {} : { payload }),
  })
}

/** 메뉴 밑 페이지의 id 를 `sort_order` 순으로 — `sort_order`가 0 부터 빈틈없는지도 본다. */
async function pagesOf(b: Board, menuId: string): Promise<string[]> {
  const rows = await b.ctx.db
    .selectFrom('pages')
    .select(['id', 'sort_order'])
    .where('menu_node_id', '=', menuId)
    .orderBy('sort_order')
    .orderBy('id')
    .execute()
  expect(rows.map((row) => row.sort_order)).toEqual(rows.map((_, index) => index))
  return rows.map((row) => row.id)
}

/** 한 부모(`null`이면 루트) 밑 메뉴의 id 를 `sort_order` 순으로 — 빈틈도 본다. */
async function menusOf(b: Board, parentId: string | null): Promise<string[]> {
  let query = b.ctx.db
    .selectFrom('menu_nodes')
    .select(['id', 'sort_order'])
    .where('project_id', '=', b.projectId)
    .orderBy('sort_order')
    .orderBy('id')
  query = parentId === null ? query.where('parent_id', 'is', null) : query.where('parent_id', '=', parentId)
  const rows = await query.execute()
  expect(rows.map((row) => row.sort_order)).toEqual(rows.map((_, index) => index))
  return rows.map((row) => row.id)
}

async function pagesUnder(b: Board, menuId: string, count: number, prefix: string): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await createPage(b.ctx, b.cookie, b.projectId, menuId, { title: `${prefix}${index}` })
  }
}

async function menusUnder(b: Board, parentId: string | null, count: number, prefix: string): Promise<void> {
  for (let index = 0; index < count; index += 1) {
    await createMenuNode(b.ctx, b.cookie, b.projectId, { parentId, title: `${prefix}${index}` })
  }
}

/** 두 요청을 한꺼번에 내고 상태 코드를 모은다. */
async function both(first: Promise<{ statusCode: number }>, second: Promise<{ statusCode: number }>): Promise<number[]> {
  const answers = await Promise.all([first, second])
  return answers.map((answer) => answer.statusCode)
}

describe('트리 쓰기 둘이 동시에 와도 교착 없이 차례로 선다', () => {
  /**
   * 리뷰 D1′ 의 판 — 맨 앞 → 맨 뒤 ∥ 맨 뒤 → 맨 앞. 고치기 전 60 회에 11(판마다 «1–5 를 쥐고 0 을» ↔ «0–4 를 쥐고 5 를»).
   *
   * 혼자 죽는 변조: `repos/pages.ts`의 `updatePage`에서 잠금 조건의 `|| patch.sortOrder !== undefined`를 뗀다(소속 이동만
   * 잠근다). 아래 «페이지 삭제 ∥ 순서 이동»도 함께 죽는다 — 그 판에도 순서 이동이 있다. 그쪽의 주인은 `deletePage`다.
   */
  it('페이지 순서 이동 둘 — 맨 앞 → 맨 뒤 ∥ 맨 뒤 → 맨 앞', async () => {
    await withRealApi(async (ctx) => {
      const b = await board(ctx)
      const menu = await createMenuNode(ctx, b.cookie, b.projectId, { title: '메뉴' })
      await pagesUnder(b, menu.id, 6, 'p')

      for (let round = 0; round < ROUNDS; round += 1) {
        const before = await pagesOf(b, menu.id)
        const first = before[0]!
        const last = before[5]!
        expect(await both(send(b, 'PATCH', `/pages/${first}`, { sortOrder: 5 }), send(b, 'PATCH', `/pages/${last}`, { sortOrder: 0 }))).toEqual([200, 200])
        // 어느 쪽이 먼저든 [last, 가운데 넷, first]다.
        expect(await pagesOf(b, menu.id)).toEqual([last, ...before.slice(1, 5), first])
      }
    })
  })

  /**
   * 두 메뉴 사이 맞바꿈 — 가의 맨 앞을 나로 ∥ 나의 맨 앞을 가로(자리를 안 준다 — 맨 뒤로 간다). 고치기 전 60 회에 51
   * («옛 형제 → 새 형제» 순이라 맞바꾸면 거꾸로 선다).
   *
   * 혼자 죽는 변조: `updatePage`에서 잠금 조건의 `patch.menuNodeId !== undefined ||`를 뗀다(순서만 잠근다).
   */
  it('페이지 소속 맞바꿈 — 가 → 나 ∥ 나 → 가', async () => {
    await withRealApi(async (ctx) => {
      const b = await board(ctx)
      const ga = await createMenuNode(ctx, b.cookie, b.projectId, { title: '가' })
      const na = await createMenuNode(ctx, b.cookie, b.projectId, { title: '나' })
      await pagesUnder(b, ga.id, 6, 'g')
      await pagesUnder(b, na.id, 6, 'n')

      for (let round = 0; round < ROUNDS; round += 1) {
        const inGa = await pagesOf(b, ga.id)
        const inNa = await pagesOf(b, na.id)
        expect(
          await both(
            send(b, 'PATCH', `/pages/${inGa[0]}`, { menuNodeId: na.id }),
            send(b, 'PATCH', `/pages/${inNa[0]}`, { menuNodeId: ga.id }),
          ),
        ).toEqual([200, 200])
        expect(await pagesOf(b, ga.id)).toEqual([...inGa.slice(1), inNa[0]])
        expect(await pagesOf(b, na.id)).toEqual([...inNa.slice(1), inGa[0]])
      }
    })
  })

  /**
   * 페이지 삭제 ∥ 같은 메뉴의 순서 이동 — 둘째를 지운다 ∥ 맨 뒤를 맨 앞으로. 고치기 전 60 회에 21. 판마다 하나를 새로 채워
   * 여섯을 지킨다.
   *
   * 혼자 죽는 변조: `repos/pages.ts`의 `deletePage`에서 `lockProjectTree`를 뗀다.
   */
  it('페이지 삭제 ∥ 같은 메뉴의 순서 이동', async () => {
    await withRealApi(async (ctx) => {
      const b = await board(ctx)
      const menu = await createMenuNode(ctx, b.cookie, b.projectId, { title: '메뉴' })
      await pagesUnder(b, menu.id, 6, 'p')

      for (let round = 0; round < ROUNDS; round += 1) {
        const before = await pagesOf(b, menu.id)
        expect(await both(send(b, 'DELETE', `/pages/${before[1]}`), send(b, 'PATCH', `/pages/${before[5]}`, { sortOrder: 0 }))).toEqual([204, 200])
        expect(await pagesOf(b, menu.id)).toEqual([before[5], before[0], before[2], before[3], before[4]])
        await createPage(ctx, b.cookie, b.projectId, menu.id, { title: `채움${round}` })
      }
    })
  })

  /**
   * 같은 메뉴에 페이지 생성 둘 — 교착은 없었지만 **`sort_order`가 겹쳤다**(고치기 전 60 회 — 둘 다 형제 수를 세고 같은 자리에
   * 넣었다). `pagesOf`가 빈틈 · 겹침을 본다.
   *
   * 혼자 죽는 변조: `repos/pages.ts`의 `insertPage`에서 `lockProjectTree`를 뗀다.
   */
  it('같은 메뉴에 페이지 생성 둘 — 자리가 겹치지 않는다', async () => {
    await withRealApi(async (ctx) => {
      const b = await board(ctx)
      const menu = await createMenuNode(ctx, b.cookie, b.projectId, { title: '메뉴' })

      for (let round = 0; round < ROUNDS; round += 1) {
        expect(
          await both(
            send(b, 'POST', '/pages', { menuNodeId: menu.id, title: `가${round}` }),
            send(b, 'POST', '/pages', { menuNodeId: menu.id, title: `나${round}` }),
          ),
        ).toEqual([201, 201])
        expect(await pagesOf(b, menu.id)).toHaveLength(2 * (round + 1))
      }
    })
  })

  /**
   * 메뉴(루트) 순서 이동 둘 — 페이지의 첫 케이스와 같은 판. 고치기 전 60 회에 35.
   *
   * 혼자 죽는 변조: `repos/menu.ts`의 `updateMenuNode`에서 잠금 조건의 `|| patch.sortOrder !== undefined`를 뗀다. 아래
   * «메뉴 삭제 ∥ 순서 이동»도 함께 죽는다 — 그쪽의 주인은 `deleteMenuNode`다.
   */
  it('메뉴 순서 이동 둘 — 맨 앞 → 맨 뒤 ∥ 맨 뒤 → 맨 앞', async () => {
    await withRealApi(async (ctx) => {
      const b = await board(ctx)
      await menusUnder(b, null, 6, 'r')

      for (let round = 0; round < ROUNDS; round += 1) {
        const before = await menusOf(b, null)
        const first = before[0]!
        const last = before[5]!
        expect(await both(send(b, 'PATCH', `/menu/${first}`, { sortOrder: 5 }), send(b, 'PATCH', `/menu/${last}`, { sortOrder: 0 }))).toEqual([200, 200])
        expect(await menusOf(b, null)).toEqual([last, ...before.slice(1, 5), first])
      }
    })
  })

  /**
   * 메뉴 부모 맞바꿈 — 가의 첫 자식을 나로 ∥ 나의 첫 자식을 가로(자리를 안 준다 — 맨 뒤로 간다).
   *
   * 혼자 죽는 변조: `updateMenuNode`에서 잠금 조건의 `patch.parentId !== undefined ||`를 뗀다. 아래 «서로의 밑으로»도 함께
   * 죽는다 — 그쪽도 부모만 싣는다. 그쪽이 따로 재는 것은 교착이 아니라 고리다.
   */
  it('메뉴 부모 맞바꿈 — 가의 자식 → 나 ∥ 나의 자식 → 가', async () => {
    await withRealApi(async (ctx) => {
      const b = await board(ctx)
      const ga = await createMenuNode(ctx, b.cookie, b.projectId, { title: '가' })
      const na = await createMenuNode(ctx, b.cookie, b.projectId, { title: '나' })
      await menusUnder(b, ga.id, 6, 'g')
      await menusUnder(b, na.id, 6, 'n')

      for (let round = 0; round < ROUNDS; round += 1) {
        const inGa = await menusOf(b, ga.id)
        const inNa = await menusOf(b, na.id)
        expect(
          await both(send(b, 'PATCH', `/menu/${inGa[0]}`, { parentId: na.id }), send(b, 'PATCH', `/menu/${inNa[0]}`, { parentId: ga.id })),
        ).toEqual([200, 200])
        expect(await menusOf(b, ga.id)).toEqual([...inGa.slice(1), inNa[0]])
        expect(await menusOf(b, na.id)).toEqual([...inNa.slice(1), inGa[0]])
      }
    })
  })

  /**
   * 두 메뉴를 **서로의 밑으로** 동시에 — 하나는 옮겨지고 다른 하나는 400(자기 하위로 옮길 수 없다). 둘 다 옮겨지면
   * **고리**다(가의 부모가 나 · 나의 부모가 가) — 둘 다 루트에서 사라져 트리에서 안 보인다. 자손 검사(`assertParentValid`)가
   * 잠금 없이 읽으면 둘 다 «자손이 아니다»를 본다.
   *
   * 혼자 죽는 변조: 없다 — 위 «메뉴 부모 맞바꿈»의 변조(부모 이동의 잠금을 뗀다)에 함께 죽는다. 이 축의 주인은 그 케이스다.
   * 이 케이스가 따로 재는 것은 고리가 안 선다는 것이다.
   */
  it('두 메뉴를 서로의 밑으로 — 하나는 400 이고 고리가 안 선다', async () => {
    await withRealApi(async (ctx) => {
      const b = await board(ctx)

      for (let round = 0; round < ROUNDS; round += 1) {
        const ga = await createMenuNode(ctx, b.cookie, b.projectId, { title: `가${round}` })
        const na = await createMenuNode(ctx, b.cookie, b.projectId, { title: `나${round}` })
        const statuses = await both(send(b, 'PATCH', `/menu/${ga.id}`, { parentId: na.id }), send(b, 'PATCH', `/menu/${na.id}`, { parentId: ga.id }))
        expect([...statuses].sort()).toEqual([200, 400])
        // 둘 중 하나는 여전히 루트다 — 고리면 둘 다 루트가 아니다.
        const roots = await menusOf(b, null)
        expect(roots.filter((id) => id === ga.id || id === na.id)).toHaveLength(1)
      }
    })
  })

  /**
   * 메뉴 삭제 ∥ 같은 부모의 순서 이동 — 둘째를 지운다 ∥ 맨 앞을 맨 뒤로. **페이지의 삭제 판(둘째 ∥ 맨 뒤 → 맨 앞)과 모양이
   * 다르다** — 메뉴에서 그 모양은 삭제의 잠금을 떼도 60 회에 0 이었다(교착도 겹침도). 이 모양은 떼면 60 회에 **60** 이
   * `sort_order`를 깨뜨린다(교착은 0) — 순서 이동이 잠금 뒤에 형제 수(여섯)를 세고 맨 뒤(5)를 고르는 사이, 잠금 없는
   * 삭제가 형제를 당겨 **빈틈이 남는다**.
   *
   * 혼자 죽는 변조: `repos/menu.ts`의 `deleteMenuNode`에서 `lockProjectTree`를 뗀다.
   */
  it('메뉴 삭제 ∥ 같은 부모의 순서 이동', async () => {
    await withRealApi(async (ctx) => {
      const b = await board(ctx)
      await menusUnder(b, null, 6, 'r')

      for (let round = 0; round < ROUNDS; round += 1) {
        const before = await menusOf(b, null)
        expect(await both(send(b, 'DELETE', `/menu/${before[1]}`), send(b, 'PATCH', `/menu/${before[0]}`, { sortOrder: 5 }))).toEqual([204, 200])
        // 어느 쪽이 먼저든 [셋째–여섯째, 첫째]다(삭제가 먼저면 5 는 맨 뒤인 4 로 좁혀진다).
        expect(await menusOf(b, null)).toEqual([before[2], before[3], before[4], before[5], before[0]])
        await createMenuNode(ctx, b.cookie, b.projectId, { title: `채움${round}` })
      }
    })
  })

  /**
   * 같은 부모에 메뉴 생성 둘 — 페이지 생성 판과 같다(자리가 겹친다).
   *
   * 혼자 죽는 변조: `repos/menu.ts`의 `insertMenuNode`에서 `lockProjectTree`를 뗀다.
   */
  it('같은 부모에 메뉴 생성 둘 — 자리가 겹치지 않는다', async () => {
    await withRealApi(async (ctx) => {
      const b = await board(ctx)

      for (let round = 0; round < ROUNDS; round += 1) {
        expect(await both(send(b, 'POST', '/menu', { parentId: null, title: `가${round}` }), send(b, 'POST', '/menu', { parentId: null, title: `나${round}` }))).toEqual([201, 201])
        expect(await menusOf(b, null)).toHaveLength(2 * (round + 1))
      }
    })
  })
})
