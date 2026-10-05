/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withRealApi` · `withProxiedRealApi`를 쓴다.
 *
 * # `menu-changed`와 트리 판 번호의 성질
 *
 * 쓰기마다 방송이 나가는지는 `menu-broadcast-census.test.ts`가 센다. 여기는 번호와 방송이 지켜야 하는 성질이다:
 *
 * | 성질 | 왜 |
 * |---|---|
 * | 낸 연결도 받는다(연결 id 를 실어도) | 답을 잃은 쓰기의 커밋이 그 탭의 다시 받기보다 늦으면 이 신호만이 낡음을 안다(`ws/notify.ts`의 `notifyMenuChanged`) |
 * | 트리에 안 보이는 쓰기 · 거절된 쓰기는 안 보낸다 | 받는 화면마다 조회 하나 — 헛 신호가 그만큼 트리를 다시 받게 한다 |
 * | 멤버에서 빠진 연결 · 세션이 끝난 연결은 못 받는다 | 받는 자격은 방송이 보내기 전에 다시 본다(`ws/broadcast.ts`의 `deliver`) |
 * | 번호 차례 = 커밋 차례 | 화면은 큰 번호의 답을 새것으로 믿는다 — 뒤에 커밋한 쓰기가 작은 번호를 받으면 새 트리를 옛것으로 버린다 |
 * | 트리 응답의 번호와 행은 한 시점이다 | 번호가 행보다 앞서면 화면이 옛 행을 새 판으로 믿고 그 판의 신호를 넘긴다(`routes/tree.ts`) |
 * | 번호 줄이 고리에 안 낀다 | 트리 쓰기의 맨 끝에서 잡는다(`0020-project-menu-revs` 머리말 «잠금») |
 */
import { sql } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addMember,
  createMenuNode,
  createPage,
  createProject,
  getTestDb,
  resetRealData,
  signup,
  withProxiedRealApi,
  withRealApi,
  type RealApiContext,
  type SignedUpUser,
} from './helpers'
import { WsProbe, joinRoom } from './ws-client'

const db = getTestDb()

beforeEach(resetRealData)
afterEach(resetRealData)

const opened: WsProbe[] = []
afterEach(() => {
  for (const probe of opened) probe.close()
  opened.length = 0
})

async function join(ctx: RealApiContext, projectId: string, who: SignedUpUser): Promise<WsProbe> {
  const probe = await joinRoom(ctx.port, projectId, who.cookie.wb_session)
  opened.push(probe)
  return probe
}

interface Fx {
  owner: SignedUpUser
  editor: SignedUpUser
  viewer: SignedUpUser
  projectId: string
  menuId: string
  pageId: string
}

async function fixture(ctx: RealApiContext): Promise<Fx> {
  const owner = await signup(ctx)
  const editor = await signup(ctx)
  const viewer = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  await addMember(ctx, project.id, editor.user.id, 'editor')
  await addMember(ctx, project.id, viewer.user.id, 'viewer')
  const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '회원관리' })
  const page = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '목록' })
  return { owner, editor, viewer, projectId: project.id, menuId: menu.id, pageId: page.id }
}

function inject(ctx: RealApiContext, who: SignedUpUser, method: string, url: string, payload?: unknown, headers?: Record<string, string>) {
  return ctx.app.inject({
    method: method as never,
    url,
    cookies: who.cookie,
    ...(headers === undefined ? {} : { headers }),
    ...(payload === undefined ? {} : { payload: payload as never }),
  })
}

async function treeRev(ctx: RealApiContext, fx: Fx): Promise<number> {
  return (await inject(ctx, fx.owner, 'GET', `/api/projects/${fx.projectId}/tree`)).json().rev
}

async function deadlockCount(): Promise<number> {
  const result = await sql<{ n: number }>`select deadlocks::int as n from pg_stat_database where datname = current_database()`.execute(db)
  return result.rows[0]!.n
}

/** 그 DB 에서 못 받은 잠금을 기다리는 백엔드가 `atLeast` 개 설 때까지. 안 서면 판이 안 선 것이라 던진다. */
async function waitForLockWaiters(atLeast: number, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const result = await sql<{ n: number }>`
      select count(distinct l.pid)::int as n from pg_locks l join pg_stat_activity a on a.pid = l.pid
       where not l.granted and a.datname = current_database() and a.pid <> pg_backend_pid()
    `.execute(db)
    if ((result.rows[0]?.n ?? 0) >= atLeast) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`잠금을 기다리는 트랜잭션이 ${atLeast} 개 서지 않았습니다 — 판이 안 섰다`)
}

/**
 * 이름 바꾸기의 제목 쓰기 — 붙잡는 조각. 메뉴 행은 이미 쥐었고(`lockMenuTitle`) 번호는 아직 안 올렸다. **번호 문장 자체를 붙잡지 않는다** —
 * 번호 문장 앞에 다른 잠금(프로젝트 행)을 끼우는 고침은 붙잡히기 전에 그 잠금을 잡아 버려 고리가 안 서고, 이 묶음이 그 고침을 못 잰다.
 * 케이스가 싣는 값에 이 글자가 들지 않는다.
 */
const RENAME_WRITE = 'update "menu_nodes"'

describe('받는 사람', () => {
  it('낸 연결도 받는다 — 요청이 제 연결 id 를 실어도(`x-wb-connection-id`)', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const mine = await join(ctx, fx.projectId, fx.editor)
      const joined = await mine.waitFor('joined')
      const res = await inject(ctx, fx.editor, 'POST', `/api/projects/${fx.projectId}/menu`, { parentId: null, title: '내 메뉴' }, {
        'x-wb-connection-id': joined.connectionId,
      })
      expect(res.statusCode).toBe(201)
      const frame = await mine.waitFor('menu-changed')
      expect(frame).toEqual({
        type: 'menu-changed',
        projectId: fx.projectId,
        rev: await treeRev(ctx, fx),
        actor: { type: 'user', label: fx.editor.user.name },
      })
    })
  })

  it('트리에 안 보이는 쓰기(설명만) · 거절된 쓰기(409 · 404)는 안 보내고 번호도 안 올린다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const watcher = await join(ctx, fx.projectId, fx.viewer)
      const from = await treeRev(ctx, fx)
      const P = `/api/projects/${fx.projectId}`
      const answers = [
        (await inject(ctx, fx.owner, 'PATCH', `${P}/pages/${fx.pageId}`, { description: '설명만' })).statusCode,
        (await inject(ctx, fx.owner, 'PATCH', `${P}/menu/${fx.menuId}`, { title: '새 이름', base: { title: '남의 바탕' } })).statusCode,
        (await inject(ctx, fx.owner, 'PATCH', `${P}/pages/${fx.pageId}`, { title: '새 이름', base: { title: '남의 바탕' } })).statusCode,
        (await inject(ctx, fx.owner, 'DELETE', `${P}/menu/${fx.menuId}`)).statusCode,
        (await inject(ctx, fx.owner, 'DELETE', `${P}/pages/00000000-0000-4000-8000-000000000000`)).statusCode,
      ]
      expect(answers).toEqual([200, 409, 409, 409, 404])
      expect((await watcher.quiet()).filter((frame) => frame.type === 'menu-changed')).toEqual([])
      expect(await treeRev(ctx, fx)).toBe(from)

      // 대조 — 이 연결이 살아 있고 받는다.
      await inject(ctx, fx.owner, 'PATCH', `${P}/pages/${fx.pageId}`, { title: '트리에 보이는 칸' })
      expect((await watcher.waitFor('menu-changed')).rev).toBe(from + 1)
    })
  })

  it('멤버에서 빠진 연결 · 세션이 끝난 연결은 못 받는다 — 남은 viewer 는 받는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const viewer = await join(ctx, fx.projectId, fx.viewer)
      const removed = await join(ctx, fx.projectId, fx.editor)
      const outsider = await signup(ctx)
      await addMember(ctx, fx.projectId, outsider.user.id, 'viewer')
      const expired = await join(ctx, fx.projectId, outsider)
      await db.deleteFrom('project_members').where('project_id', '=', fx.projectId).where('user_id', '=', fx.editor.user.id).execute()
      await db.deleteFrom('sessions').where('user_id', '=', outsider.user.id).execute()

      await createMenuNode(ctx, fx.owner.cookie, fx.projectId, { title: '그 뒤 메뉴' })

      expect((await viewer.waitFor('menu-changed')).rev).toBe(await treeRev(ctx, fx))
      expect({
        removed: [(await removed.waitClosed()).code, removed.received.filter((frame) => frame.type === 'menu-changed')],
        expired: [(await expired.waitClosed()).code, expired.received.filter((frame) => frame.type === 'menu-changed')],
      }).toEqual({ removed: [4403, []], expired: [4403, []] })
    })
  })
})

describe('번호', () => {
  it('겹친 트리 쓰기 열 개 — 번호가 하나씩 겹치지 않고 오르고, 받는 쪽은 그 번호를 다 받는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const watcher = await join(ctx, fx.projectId, fx.viewer)
      const from = await treeRev(ctx, fx)
      const answers = await Promise.all(
        Array.from({ length: 10 }, (_, index) =>
          inject(ctx, fx.owner, 'POST', `/api/projects/${fx.projectId}/menu`, { parentId: null, title: `겹친 ${index}` }),
        ),
      )
      expect(answers.map((res) => res.statusCode)).toEqual(Array(10).fill(201))
      const frames = await watcher.waitForCount('menu-changed', 10)
      expect(frames.map((frame) => frame.rev).sort((a, b) => a - b)).toEqual(Array.from({ length: 10 }, (_, index) => from + index + 1))
      expect(await treeRev(ctx, fx)).toBe(from + 10)
    })
  }, 30_000)

  /**
   * **번호를 쥔 쓰기가 커밋하기 전에 온 쓰기는 그 커밋 뒤의 번호를 받는다.** 이름 바꾸기(트리 잠금을 안 잡는다)를 COMMIT 앞에서 붙잡고
   * 페이지를 만든다(트리 잠금을 잡는다 — 둘은 행이 겹치지 않아 번호 줄 말고는 서로 안 기다린다). 페이지 만들기가 번호 줄에 서는지,
   * 놓은 뒤 이름 바꾸기가 작은 번호 · 페이지가 큰 번호인지 본다.
   */
  it('번호 차례 = 커밋 차례 — 앞 쓰기가 번호를 쥔 채 커밋 전이면 뒤 쓰기는 그 줄에 섰다가 다음 번호를 받는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const from = await treeRev(ctx, fx)
      const hold = ctx.proxy.holdQuery('commit')
      const rename = inject(ctx, fx.owner, 'PATCH', `/api/projects/${fx.projectId}/menu/${fx.menuId}`, { title: '바꾼 이름', base: { title: '회원관리' } })
      await hold.held
      const page = inject(ctx, fx.owner, 'POST', `/api/projects/${fx.projectId}/pages`, { menuNodeId: fx.menuId, title: '뒤에 온 페이지' })
      try {
        await waitForLockWaiters(1)
      } finally {
        hold.release()
      }
      const [renamed, created] = await Promise.all([rename, page])
      expect([renamed.statusCode, created.statusCode]).toEqual([200, 201])
      const tree = (await inject(ctx, fx.owner, 'GET', `/api/projects/${fx.projectId}/tree`)).json()
      expect(tree.rev).toBe(from + 2)
      // 페이지 만들기가 뒤에 커밋했다 — 그 응답 뒤에 읽은 트리가 둘 다 든 판이 `from + 2`다.
      expect(tree.menu[0].title).toBe('바꾼 이름')
      expect(tree.menu[0].pages.map((p: { title: string }) => p.title)).toEqual(['목록', '뒤에 온 페이지'])
    })
  }, 30_000)

  /**
   * **트리 응답의 번호와 행은 한 스냅숏이다.** 번호를 읽은 뒤 메뉴 행을 읽는 질의를 붙잡고, 그 사이 메뉴를 하나 만들어 커밋한다. 놓은
   * 응답은 옛 번호와 **옛 행**이어야 한다 — 새 행이 실리면 그 번호의 신호(이미 지났다)를 화면이 넘겨 새 메뉴를 영영 안 그린다는 판의
   * 반대(옛 번호 + 새 행)는 무해하지만, 행과 번호가 갈린다는 것 자체가 그 갈래를 연다.
   */
  it('트리 응답의 번호와 행은 한 시점이다 — 번호를 읽은 뒤 커밋된 쓰기는 그 응답에 안 실린다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const from = await treeRev(ctx, fx)
      const hold = ctx.proxy.holdQuery('from "menu_nodes"')
      const read = inject(ctx, fx.viewer, 'GET', `/api/projects/${fx.projectId}/tree`)
      await hold.held
      // 붙잡힌 조회의 연결 말고 다른 연결로 쓴다 — 앱 풀의 다른 칸이다.
      const wrote = await inject(ctx, fx.owner, 'POST', `/api/projects/${fx.projectId}/menu`, { parentId: null, title: '사이에 만든 메뉴' })
      hold.release()
      expect(wrote.statusCode).toBe(201)
      const body = (await read).json()
      expect({ rev: body.rev, titles: body.menu.map((m: { title: string }) => m.title) }).toEqual({ rev: from, titles: ['회원관리'] })
      expect(await treeRev(ctx, fx)).toBe(from + 1)
    })
  }, 30_000)
})

describe('잠금 — 번호 줄이 고리에 안 낀다(교착 0)', () => {
  /**
   * 이름 바꾸기(바탕 경로 — 메뉴 행을 먼저 잡는다)를 제목 쓰기 앞에서 붙잡고, 같은 메뉴의 자리 옮기기(프로젝트 행 → 그 메뉴 행)와 프로젝트
   * 삭제(프로젝트 행 `FOR UPDATE` — 자리 옮기기 뒤에 선다)를 줄 세운다. 번호가 프로젝트 행에 매이면 이름 바꾸기가 자리 옮기기가 쥔 프로젝트
   * 행을 기다려 고리다.
   */
  it('이름 바꾸기가 메뉴 행을 쥔 채 번호를 올릴 때 같은 메뉴의 자리 옮기기 · 프로젝트 삭제가 줄 서 있어도 — 200 · 200 · 204', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const other = await createMenuNode(ctx, fx.owner.cookie, fx.projectId, { title: '옆 메뉴' })
      const deadlocks = await deadlockCount()
      const hold = ctx.proxy.holdQuery(RENAME_WRITE)
      const rename = inject(ctx, fx.owner, 'PATCH', `/api/projects/${fx.projectId}/menu/${fx.menuId}`, { title: '바꾼 이름', base: { title: '회원관리' } })
      await hold.held
      const move = inject(ctx, fx.editor, 'PATCH', `/api/projects/${fx.projectId}/menu/${fx.menuId}`, { parentId: other.id })
      let removal
      try {
        await waitForLockWaiters(1)
        removal = inject(ctx, fx.owner, 'DELETE', `/api/projects/${fx.projectId}`)
        await waitForLockWaiters(2)
      } finally {
        hold.release()
      }
      const answers = await Promise.all([rename, move, removal!])
      expect(answers.map((res) => res.statusCode)).toEqual([200, 200, 204])
      expect(await deadlockCount()).toBe(deadlocks)
    })
  }, 30_000)

  /**
   * 이름 바꾸기를 제목 쓰기 앞에서 붙잡고 프로젝트 삭제(프로젝트 행 `FOR UPDATE` → 페이지 · 메뉴 행)를 줄 세운다. 번호 줄을 처음 넣는
   * 쓰기가 프로젝트 행에 `KEY SHARE`를 걸면(FK) 이름 바꾸기가 삭제가 쥔 프로젝트 행을, 삭제가 이름 바꾸기가 쥔 메뉴 행을 기다린다.
   * 번호 줄이 아직 없는 프로젝트라야 넣기가 선다 — 픽스처의 번호 줄을 지우고 시작한다.
   */
  it('번호 줄이 없는 프로젝트에서 이름 바꾸기가 첫 줄을 넣을 때 프로젝트 삭제가 줄 서 있어도 — 200 · 204', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      await db.deleteFrom('project_menu_revs').where('project_id', '=', fx.projectId).execute()
      const deadlocks = await deadlockCount()
      const hold = ctx.proxy.holdQuery(RENAME_WRITE)
      const rename = inject(ctx, fx.owner, 'PATCH', `/api/projects/${fx.projectId}/menu/${fx.menuId}`, { title: '바꾼 이름', base: { title: '회원관리' } })
      await hold.held
      const removal = inject(ctx, fx.owner, 'DELETE', `/api/projects/${fx.projectId}`)
      try {
        await waitForLockWaiters(1)
      } finally {
        hold.release()
      }
      const answers = await Promise.all([rename, removal])
      expect(answers.map((res) => res.statusCode)).toEqual([200, 204])
      expect(await deadlockCount()).toBe(deadlocks)
      // 삭제가 번호 줄도 지웠다(FK 가 없어 CASCADE 가 안 데려간다 — `repos/projects.ts`의 `deleteProject`).
      expect(await db.selectFrom('project_menu_revs').select('rev').where('project_id', '=', fx.projectId).execute()).toEqual([])
    })
  }, 30_000)
})
