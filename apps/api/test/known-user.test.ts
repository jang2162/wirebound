/**
 * **요청한 탭이 아는 사용자**(`src/auth/plugin.ts`의 머리말 «요청한 탭이 아는 사용자»). 웹은 요청마다 «이 탭이 아는
 * 사용자 id»를 싣고(REST 머리 · WS 쿼리), 서버는 쿠키의 사용자와 다르면 409 `session-user-changed`로 거절한다. 실은 것이
 * 없는 요청(CLI · MCP · 그 값을 싣지 않는 탭)은 확인 없이 쿠키만으로 지난다.
 */
import net from 'node:net'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../src/app'
import { KNOWN_USER_HEADER, KNOWN_USER_QUERY, SESSION_USER_CHANGED } from '../src/auth/plugin'
import { createDb, createPool } from '../src/db/client'
import {
  TEST_DATABASE_URL,
  addMember,
  createMenuNode,
  createPage,
  createProject,
  resetRealData,
  signup,
  withApi,
  testConfig,
  withRealApi,
  type TestContext,
} from './helpers'
import { startFaultProxy } from './pg-fault-proxy'

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

  /**
   * **로그아웃은 보지 않는다** — 409 로 막으면 웹이 나가려고 누른 사람에게 쿠키의 사람(밥)의 목록을 연다.
   * 지우는 세션은 **쿠키의 것**이다(밥) — 뒤이은 `me`가 401. 혼자 죽는 변조: 면제에서 로그아웃을 뺀다(409).
   */
  it('`POST /auth/logout`은 보지 않는다 — 머리가 달라도 쿠키의 사람의 세션을 지운다', async () => {
    await withApi(async (ctx) => {
      const { alice, bob } = await fixture(ctx)
      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        cookies: bob.cookie,
        headers: { [KNOWN_USER_HEADER]: alice.user.id },
      })
      expect(res.statusCode, res.body).toBe(204)
      const me = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', cookies: bob.cookie })
      expect(me.statusCode).toBe(401)
    })
  })

  it('쿠키가 없으면 보지 않는다 — 머리가 있어도 401', async () => {
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

  /**
   * `WsProbe.open`은 쿼리를 못 싣는다 — 같은 방식(undici 의 `headers` 확장)으로 연다. 열렸으면 `true`. `known`이 배열이면
   * 그 수만큼 같은 키를 싣는다.
   */
  async function handshake(port: number, projectId: string, token: string, known?: string | string[]): Promise<boolean> {
    const query =
      known === undefined
        ? ''
        : `?${[known].flat().map((id) => `${KNOWN_USER_QUERY}=${encodeURIComponent(id)}`).join('&')}`
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

  /**
   * **둘 이상이면 «다름»이다** — REST 머리 둘이 409 인 것과 같게. 쿼리가 배열이 될 때 «없음»으로 치면 확인 없이
   * 열린다(101). 둘이 같아도 안 열린다(REST 머리 `A, A`도 409). 혼자 죽는 변조: `knownUserOf`가 배열을 잇지 않는다.
   */
  it('쿼리 knownUser 가 둘 이상이면 안 열린다 — 둘이 같아도', async () => {
    await withRealApi(async (ctx) => {
      const { alice, bob, project } = await fixture(ctx)
      const token = bob.cookie.wb_session
      expect(await handshake(ctx.port, project.id, token, [bob.user.id, alice.user.id])).toBe(false)
      expect(await handshake(ctx.port, project.id, token, [bob.user.id, bob.user.id])).toBe(false)
    })
  })

  /**
   * **인증 훅이 던진 업그레이드는 무엇이든 닫힌다** — 409 만이 아니라 «확인하지 못했다»의 503 도. 409 갈래만 닫으면
   * DB 를 내린 채 쿠키 실은 업그레이드가 503 을 받은 뒤에도 소켓이 열린 채 남는다. 세션 조회 하나를 프록시로 끊어 잰다
   * (`api-db-errors.test.ts`의 «세션 조회가 연결을 잃으면 503 이다 — 같은 쿠키는 다음 요청에 산다»와 같은 장치). 혼자 죽는 변조: 닫기를 409 갈래로 되돌린다.
   */
  it('세션 조회가 연결을 잃어 503 인 업그레이드도 서버가 곧바로 닫는다', async () => {
    const proxy = await startFaultProxy(TEST_DATABASE_URL)
    const db = createDb(createPool(proxy.url, () => undefined))
    const app = await buildApp({ db, config: testConfig() })
    // 끊긴 연결이 남기는 예외가 러너를 죽이지 않게 받아 둔다(`api-db-errors.test.ts`와 같다).
    const swallow = (): void => undefined
    process.prependListener('uncaughtException', swallow)
    try {
      await app.listen({ port: 0, host: '127.0.0.1' })
      const address = app.server.address()
      if (address === null || typeof address === 'string') throw new Error('포트를 열지 못했습니다')
      const { bob, project } = await fixture({ app, db })

      proxy.dropOnQuery('from "sessions"')
      const answer = await rawUpgrade(address.port, `/api/projects/${project.id}/ws`, bob.cookie.wb_session)
      expect(proxy.fired).toBe(true)
      expect(answer.status).toMatch(/^HTTP\/1\.1 503 /)
      expect(answer.closed).toBe(true)
    } finally {
      process.removeListener('uncaughtException', swallow)
      await app.close()
      await db.destroy()
      await proxy.close()
    }
  })
})

/**
 * 업그레이드 요청 하나를 날 소켓으로 보낸다 — 첫 줄(상태)과 **서버가 `wait` 안에 소켓을 닫았는가**. 브라우저 `WebSocket`은 실패한
 * 핸드셰이크의 소켓을 스스로 닫아 서버가 닫는지를 가린다 — 그래서 날 소켓이다. 기다림이 넘으면 이쪽이 닫는다(`app.close`가 그 소켓을
 * 기다리지 않게).
 */
function rawUpgrade(port: number, path: string, token: string, wait = 3000): Promise<{ status: string; closed: boolean }> {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1')
    let received = ''
    const finish = (closed: boolean): void => {
      clearTimeout(timer)
      socket.destroy()
      resolve({ status: received.split('\r\n')[0] ?? '', closed })
    }
    const timer = setTimeout(() => finish(false), wait)
    socket.on('data', (chunk) => {
      received += chunk.toString()
    })
    socket.on('close', () => finish(true))
    socket.on('error', () => undefined)
    socket.write(
      `GET ${path} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
        `Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\nSec-WebSocket-Version: 13\r\nCookie: wb_session=${token}\r\n\r\n`,
    )
  })
}
