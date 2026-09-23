/**
 * **요청한 탭이 아는 사용자**(이월 Y′ · `src/auth/plugin.ts`의 머리말 «요청한 탭이 아는 사용자»). 웹은 요청마다 «이 탭이 아는
 * 사용자 id»를 싣고(REST 머리 · WS 쿼리), 서버는 쿠키의 사용자와 다르면 409 `session-user-changed`로 거절한다. 실은 것이
 * 없는 요청(CLI · MCP · 옛 판 탭)은 앞 판 그대로다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { KNOWN_USER_HEADER, KNOWN_USER_QUERY, SESSION_USER_CHANGED } from '../src/auth/plugin'
import {
  addMember,
  createMenuNode,
  createPage,
  createProject,
  resetRealData,
  signup,
  withApi,
  withRealApi,
  type TestContext,
} from './helpers'

function changedIssue(body: { error: { code: string; issues?: { code?: string }[] } }): string | undefined {
  return body.error.issues?.find((issue) => issue.code === SESSION_USER_CHANGED)?.code
}

async function fixture(ctx: TestContext) {
  const alice = await signup(ctx)
  const bob = await signup(ctx)
  const project = await createProject(ctx, alice.cookie)
  await addMember(ctx, project.id, bob.user.id, 'editor')
  const menu = await createMenuNode(ctx, alice.cookie, project.id)
  const page = await createPage(ctx, alice.cookie, project.id, menu.id)
  return { alice, bob, project, page, rootId: (page.schema as { root: { id: string } }).root.id }
}

describe('REST — 머리의 사용자가 쿠키의 사용자와 다르면 409 session-user-changed', () => {
  it('쓰기(코멘트 게시)는 거절되고 행이 안 선다 — 같거나 없으면 달린다', async () => {
    await withApi(async (ctx) => {
      const { alice, bob, project, page, rootId } = await fixture(ctx)
      const url = `/api/projects/${project.id}/pages/${page.id}/comments`
      // 앨리스로 믿는 탭 · 쿠키는 밥
      const mismatched = await ctx.app.inject({
        method: 'POST',
        url,
        cookies: bob.cookie,
        headers: { [KNOWN_USER_HEADER]: alice.user.id },
        payload: { nodeId: rootId, body: '앨리스 탭의 말' },
      })
      expect(mismatched.statusCode).toBe(409)
      expect(changedIssue(mismatched.json())).toBe(SESSION_USER_CHANGED)
      expect(await ctx.db.selectFrom('comments').select('body').execute()).toEqual([])

      const same = await ctx.app.inject({
        method: 'POST',
        url,
        cookies: bob.cookie,
        headers: { [KNOWN_USER_HEADER]: bob.user.id },
        payload: { nodeId: rootId, body: '밥 탭의 말' },
      })
      const none = await ctx.app.inject({ method: 'POST', url, cookies: bob.cookie, payload: { nodeId: rootId, body: '머리 없는 말' } })
      expect([same.statusCode, none.statusCode]).toEqual([201, 201])
    })
  })

  it('읽기도 거절한다 — 앞 사람의 화면에 새 사람의 권리로 읽은 값을 그리지 않는다', async () => {
    await withApi(async (ctx) => {
      const { alice, bob, project } = await fixture(ctx)
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}`,
        cookies: bob.cookie,
        headers: { [KNOWN_USER_HEADER]: alice.user.id },
      })
      expect(res.statusCode).toBe(409)
      expect(changedIssue(res.json())).toBe(SESSION_USER_CHANGED)
    })
  })

  it('`GET /auth/me`는 보지 않는다 — 탭이 쿠키의 사람을 알아내는 길이다', async () => {
    await withApi(async (ctx) => {
      const { alice, bob } = await fixture(ctx)
      const res = await ctx.app.inject({
        method: 'GET',
        url: '/api/auth/me',
        cookies: bob.cookie,
        headers: { [KNOWN_USER_HEADER]: alice.user.id },
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().id).toBe(bob.user.id)
    })
  })

  it('쿠키가 없으면 보지 않는다 — 앞 판 그대로 401', async () => {
    await withApi(async (ctx) => {
      const { alice, project } = await fixture(ctx)
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}`,
        headers: { [KNOWN_USER_HEADER]: alice.user.id },
      })
      expect(res.statusCode).toBe(401)
    })
  })

  it('토큰으로 들어온 요청은 보지 않는다 — 머리는 쿠키의 사람과만 견준다', async () => {
    await withApi(async (ctx) => {
      const { alice, bob, project } = await fixture(ctx)
      const issued = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/tokens`,
        cookies: bob.cookie,
        payload: { name: '밥의 토큰' },
      })
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}`,
        headers: { authorization: `Bearer ${issued.json().value}`, [KNOWN_USER_HEADER]: alice.user.id },
      })
      expect(res.statusCode).toBe(200)
    })
  })
})

describe('WS 핸드셰이크 — 쿼리의 사용자가 쿠키의 사용자와 다르면 101 전에 거절', () => {
  beforeEach(resetRealData)
  afterEach(resetRealData)

  /** `WsProbe.open`은 쿼리를 못 싣는다 — 같은 방식(undici 의 `headers` 확장)으로 연다. 열렸으면 `true`. */
  async function handshake(port: number, projectId: string, token: string, known?: string): Promise<boolean> {
    const query = known === undefined ? '' : `?${KNOWN_USER_QUERY}=${encodeURIComponent(known)}`
    const socket = new WebSocket(`ws://127.0.0.1:${port}/api/projects/${projectId}/ws${query}`, {
      headers: { cookie: `wb_session=${token}` },
    } as never)
    const opened = await new Promise<boolean>((resolve) => {
      socket.addEventListener('open', () => resolve(true), { once: true })
      socket.addEventListener('error', () => resolve(false), { once: true })
      socket.addEventListener('close', () => resolve(false), { once: true })
    })
    socket.close()
    return opened
  }

  /**
   * 혼자 죽는 변조: 거절한 업그레이드의 소켓을 닫지 않는다(`closeUpgradeAfterReply`) — 서버가 그 소켓을 쥔 채 `close`가 기다린다.
   * 쿼리를 안 읽는 변조(`knownUserOf`)에도 죽는다.
   */
  it('다르면 안 열리고, 같거나 없으면 열린다', async () => {
    await withRealApi(async (ctx) => {
      const { alice, bob, project } = await fixture(ctx)
      const token = bob.cookie.wb_session
      expect(await handshake(ctx.port, project.id, token, alice.user.id)).toBe(false)
      expect(await handshake(ctx.port, project.id, token, bob.user.id)).toBe(true)
      expect(await handshake(ctx.port, project.id, token)).toBe(true)
    })
  })
})
