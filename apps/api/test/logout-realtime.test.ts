/**
 * **로그아웃이 그 세션의 WS 연결을 닫고 그 연결의 잠금을 곧바로 놓는다**(`routes/auth.ts`의 `/logout` ·
 * `ws/notify.ts`의 `closeSessionConnections`).
 *
 * 세션 행을 지우는 것만으로는 이미 열린 연결이 안 닫힌다 — 그 연결은 다음 확인(그 연결이 보내는 프레임 · 방송 · 하트비트 25초)에서
 * 4403 으로 닫히고, 그 전까지 쥔 잠금은 남의 화면에 «편집 중»으로 남는다(잠금 TTL 30초). **다른 세션의 연결은 그대로다** — 같은
 * 사람이라도 다른 브라우저의 로그인이면 그 연결을 끊지 않는다.
 */
import { sql } from 'kysely'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withTransaction } from '../src/db/tx'
import { WS_CLOSE } from '../src/ws/protocol'
import {
  addMember,
  authCookie,
  createMenuNode,
  createPage,
  createProject,
  getTestDb,
  resetRealData,
  signup,
  withRealApi,
  type RealApiContext,
} from './helpers'
import { WsProbe, joinRoom, locksUntil, locksWith } from './ws-client'

beforeEach(resetRealData)
afterEach(resetRealData)

const opened: WsProbe[] = []
afterEach(() => {
  for (const probe of opened) probe.close()
  opened.length = 0
})
function track(probe: WsProbe): WsProbe {
  opened.push(probe)
  return probe
}

/** 같은 사람의 두 번째 로그인 — 다른 세션이다. */
async function loginAgain(ctx: RealApiContext, email: string, password: string): Promise<string> {
  const res = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } })
  expect(res.statusCode, res.body).toBe(200)
  return res.cookies.find((cookie) => cookie.name === 'wb_session')!.value
}

async function scene(ctx: RealApiContext) {
  const owner = await signup(ctx)
  const peer = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  await addMember(ctx, project.id, peer.user.id, 'editor')
  const menu = await createMenuNode(ctx, owner.cookie, project.id)
  const page = await createPage(ctx, owner.cookie, project.id, menu.id)
  const put = await ctx.app.inject({
    method: 'PUT',
    url: `/api/projects/${project.id}/pages/${page.id}/schema`,
    cookies: owner.cookie,
    payload: { schema: { version: 1, root: { id: 'n_root', type: 'Page', children: [{ id: 'n_a', type: 'Text', props: {} }, { id: 'n_b', type: 'Text', props: {} }] } } },
  })
  expect(put.statusCode, put.body).toBe(200)
  const otherSession = await loginAgain(ctx, owner.user.email, owner.password)

  // 로그아웃할 세션의 탭 둘 · 같은 사람의 다른 세션 · 남.
  const leaving = track(await joinRoom(ctx.port, project.id, owner.cookie.wb_session))
  const leavingTwin = track(await joinRoom(ctx.port, project.id, owner.cookie.wb_session))
  const staying = track(await joinRoom(ctx.port, project.id, otherSession))
  const watcher = track(await joinRoom(ctx.port, project.id, peer.cookie.wb_session))
  leaving.send(JSON.stringify({ type: 'lock', pageId: page.id, nodeId: 'n_a' }))
  staying.send(JSON.stringify({ type: 'lock', pageId: page.id, nodeId: 'n_b' }))
  await locksWith(watcher, 'n_a')
  await locksWith(watcher, 'n_b')
  return { owner, peer, project, page, otherSession, leaving, leavingTwin, staying, watcher }
}

describe('로그아웃', () => {
  it('그 세션의 연결을 곧바로 닫고, 그 연결의 잠금을 놓는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await scene(ctx)

      const res = await ctx.app.inject({ method: 'POST', url: '/api/auth/logout', cookies: fx.owner.cookie })
      expect(res.statusCode, res.body).toBe(204)

      // 다음 확인(하트비트 25초 · 잠금 TTL 30초)을 기다리지 않는다 — 한도 1초.
      expect(await fx.leaving.waitClosed(1_000)).toMatchObject({ code: WS_CLOSE.revoked })
      expect(await fx.leavingTwin.waitClosed(1_000)).toMatchObject({ code: WS_CLOSE.revoked })
      // 남은 것은 다른 세션의 잠금 하나다. 1초 안에 — 만료(30초)를 기다리지 않는다.
      const started = Date.now()
      const locks = await locksUntil(fx.watcher, (list) => !list.some((lock) => lock.nodeId === 'n_a'), 'n_a 풀림')
      expect(Date.now() - started).toBeLessThan(1_000)
      expect(locks.map((lock) => lock.nodeId)).toEqual(['n_b'])
    })
  })

  it('같은 사람의 다른 세션 연결 · 남의 연결은 그대로다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await scene(ctx)

      const res = await ctx.app.inject({ method: 'POST', url: '/api/auth/logout', cookies: fx.owner.cookie })
      expect(res.statusCode, res.body).toBe(204)
      await fx.leaving.waitClosed(1_000)

      // 다른 세션의 잠금은 남는다 · 그 연결은 아직 프레임을 주고받는다.
      const locks = await locksUntil(fx.watcher, (list) => !list.some((lock) => lock.nodeId === 'n_a'), 'n_a 풀림')
      expect(locks.map((lock) => lock.nodeId)).toEqual(['n_b'])
      expect(fx.staying.closeInfo).toBeNull()
      expect(fx.watcher.closeInfo).toBeNull()
      fx.staying.send(JSON.stringify({ type: 'ping' }))
      await fx.staying.waitFor('pong')
      fx.watcher.send(JSON.stringify({ type: 'ping' }))
      await fx.watcher.waitFor('pong')
      // 로그아웃한 세션의 쿠키로는 다시 못 붙는다(세션 행이 없다).
      const again = track(WsProbe.open(ctx.port, fx.project.id, fx.owner.cookie.wb_session))
      expect(await again.opened).toBe(false)
      // 다른 세션은 REST 도 그대로다.
      const me = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', cookies: authCookie(fx.otherSession) })
      expect(me.statusCode).toBe(200)
    })
  })

  /**
   * **편집이 잠금에 선 채 로그아웃하면** 잠금 목록은 곧바로 비고, 소켓은 그 편집의 답(401) 뒤에 닫힌다
   * (`RoomConnection.closeWhenIdle`). 곧바로 닫으면 확정된 거절이 «모름»이 된다. 페이지 행을 테스트 트랜잭션으로 쥐어
   * 편집을 세운다 — 자격 확인은 이미 지났다.
   */
  it('편집이 잠금에 선 채 로그아웃하면 잠금은 곧바로 놓고, 소켓은 그 편집의 답 뒤에 닫는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await scene(ctx)
      const db = getTestDb()
      let release!: () => void
      const released = new Promise<void>((resolve) => (release = resolve))
      let held!: () => void
      const holding = new Promise<void>((resolve) => (held = resolve))
      const holder = withTransaction(db, async (trx) => {
        await trx.selectFrom('pages').select('id').where('id', '=', fx.page.id).forUpdate().execute()
        held()
        await released
      })
      try {
        await holding
        fx.leaving.send(
          JSON.stringify({ type: 'patch', pageId: fx.page.id, clientOpId: 'op_out', baseSeq: 1, ops: [{ op: 'add', path: '/root/children/-', value: { id: 'n_x', type: 'Text', props: {} } }] }),
        )
        // 그 편집이 페이지 행에서 기다린다.
        await vi.waitFor(async () => {
          const { rows } = await sql<{ n: number }>`
            select count(*)::int as n from pg_stat_activity
             where pid <> pg_backend_pid() and datname = current_database() and wait_event_type = 'Lock'
          `.execute(db)
          expect(rows[0]!.n).toBeGreaterThanOrEqual(1)
        }, { timeout: 5_000 })

        const res = await ctx.app.inject({ method: 'POST', url: '/api/auth/logout', cookies: fx.owner.cookie })
        expect(res.statusCode, res.body).toBe(204)
        const started = Date.now()
        const locks = await locksUntil(fx.watcher, (list) => !list.some((lock) => lock.nodeId === 'n_a'), 'n_a 풀림')
        expect(Date.now() - started).toBeLessThan(1_000)
        expect(locks.map((lock) => lock.nodeId)).toEqual(['n_b'])
        // 편집이 아직 도는 동안은 안 닫는다(쌍둥이 탭은 도는 것이 없어 곧바로 닫힌다).
        expect(await fx.leavingTwin.waitClosed(1_000)).toMatchObject({ code: WS_CLOSE.revoked })
        expect(fx.leaving.closeInfo).toBeNull()
      } finally {
        release()
        await holder
      }
      expect(await fx.leaving.waitFor('patch-error')).toMatchObject({ clientOpId: 'op_out', status: 401, code: 'unauthenticated' })
      expect(await fx.leaving.waitClosed(1_000)).toMatchObject({ code: WS_CLOSE.revoked })
    })
  })

  it('남의 세션이 로그아웃해도 내 연결 · 잠금은 그대로다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await scene(ctx)
      const res = await ctx.app.inject({ method: 'POST', url: '/api/auth/logout', cookies: fx.peer.cookie })
      expect(res.statusCode, res.body).toBe(204)
      await fx.watcher.waitClosed(1_000)

      for (const probe of [fx.leaving, fx.leavingTwin, fx.staying]) {
        expect(probe.closeInfo).toBeNull()
        probe.send(JSON.stringify({ type: 'ping' }))
        await probe.waitFor('pong')
      }
      // 내 두 잠금은 그대로다 — 남의 로그아웃이 목록을 비우지 않는다.
      const list = await locksWith(fx.staying, 'n_a')
      expect(list.map((lock) => lock.nodeId).sort()).toEqual(['n_a', 'n_b'])
    })
  })
})
