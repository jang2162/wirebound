/**
 * **관리자 기록**(`src/repos/admin-audit.ts` · `src/routes/admin-audit.ts`) — 행동과 같은 트랜잭션에서 남고, 관리자만 읽고, `before` 로 쪽을 넘긴다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { insertApiToken } from '../src/repos/api-tokens'
import { setInstanceAdmin } from '../src/repos/users'
import { adminOf, admin, auditActions } from './accounts-fixtures'
import { createProject, getTestDb, resetRealData, signup, withApi, withProxiedRealApi, type TestContext } from './helpers'
import { manifestOf, packed } from './theme-fixtures'

const ADMIN_RECHECK = '"is_instance_admin" from "users" where "id" = $1 for share'

function upload(ctx: TestContext, cookie: { wb_session: string }, themeId: string) {
  return ctx.app.inject({
    method: 'POST',
    url: '/api/admin/theme-packages',
    headers: { 'content-type': 'application/zip' },
    cookies: cookie,
    payload: Buffer.from(packed(manifestOf(themeId, '1.0.0'))),
  })
}

describe('테마 쓰기의 기록', () => {
  it('올리기 · 숨기기 · 되살리기가 하나씩 남는다 — 누가 · 무엇을', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      expect((await upload(ctx, me.cookie, 'audited')).statusCode).toBe(201)
      const hide = (hidden: boolean) =>
        ctx.app.inject({ method: 'PATCH', url: '/api/admin/theme-packages/audited/1.0.0', cookies: me.cookie, payload: { hidden } })
      expect((await hide(true)).statusCode).toBe(200)
      expect((await hide(false)).statusCode).toBe(200)

      const res = await admin(ctx, me.cookie, 'GET', '/audit')
      expect(res.statusCode, res.body).toBe(200)
      const entries = res.json().entries as { action: string; actor: unknown; detail: Record<string, unknown> }[]
      expect(entries.map((entry) => entry.action)).toEqual(['theme.unhide', 'theme.hide', 'theme.upload', 'admin.grant'])
      expect(entries[2]!.actor).toEqual({ kind: 'user', id: me.user.id, name: me.user.name })
      expect(entries[2]!.detail).toMatchObject({ themeId: 'audited', version: '1.0.0' })
    })
  })
})

describe('되돌아간 행동은 기록도 없다 — 같은 트랜잭션', () => {
  beforeEach(resetRealData)
  afterEach(resetRealData)

  it('재확인에서 403 으로 되돌아간 올리기는 `theme.upload` 를 남기지 않는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const db = getTestDb()
      const me = await adminOf(ctx)
      const hold = ctx.proxy.holdQuery(ADMIN_RECHECK)
      const write = upload(ctx, me.cookie, 'rolled-back')
      await hold.held
      // 올리기가 패키지 행 · 기록을 넣고 재확인 앞에 선 동안 서버 명령이 관리자를 거둔다.
      expect(await setInstanceAdmin(db, me.user.email, false)).toBe('changed')
      hold.release()
      const res = await write
      expect(res.statusCode, res.body).toBe(403)
      expect(await auditActions(db)).toEqual(['admin.grant', 'admin.revoke'])
      expect(await db.selectFrom('theme_packages').select('theme_id').where('theme_id', '=', 'rolled-back').execute()).toEqual([])
    })
  })
})

describe('서버 명령의 기록', () => {
  it('명령의 지정 · 해제는 행위자가 «서버 명령»(`cli`)이다', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const other = await signup(ctx)
      expect(await setInstanceAdmin(ctx.db, other.user.email, true)).toBe('changed')
      expect(await setInstanceAdmin(ctx.db, other.user.email, false)).toBe('changed')
      const entries = (await admin(ctx, me.cookie, 'GET', '/audit')).json().entries as {
        action: string
        actor: unknown
        targetUser: unknown
      }[]
      expect(entries.slice(0, 2).map((entry) => [entry.action, entry.actor, entry.targetUser])).toEqual([
        ['admin.revoke', { kind: 'cli' }, { id: other.user.id, name: other.user.name, email: other.user.email }],
        ['admin.grant', { kind: 'cli' }, { id: other.user.id, name: other.user.name, email: other.user.email }],
      ])
    })
  })
})

describe('읽기', () => {
  it('비로그인 401 · 관리자 아님 403 · 관리자의 토큰 401', async () => {
    await withApi(async (ctx) => {
      expect((await admin(ctx, undefined, 'GET', '/audit')).statusCode).toBe(401)
      const plain = await signup(ctx)
      const denied = await admin(ctx, plain.cookie, 'GET', '/audit')
      expect(denied.statusCode).toBe(403)
      expect(denied.json().error.message).toBe('인스턴스 관리자만 할 수 있습니다')
      const me = await adminOf(ctx)
      const project = await createProject(ctx, me.cookie)
      const token = await insertApiToken(ctx.db, { projectId: project.id, userId: me.user.id, name: 't' })
      const viaToken = await ctx.app.inject({ method: 'GET', url: '/api/admin/audit', headers: { authorization: `Bearer ${token.value}` } })
      expect(viaToken.statusCode).toBe(401)
    })
  })

  it('`before` 로 쪽을 넘긴다 — 겹치지도 빠지지도 않는다, 끝 쪽의 `next` 는 `null`', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      for (const name of ['가', '나', '다', '라']) {
        expect((await admin(ctx, me.cookie, 'POST', '/invites', { name, kind: 'single' })).statusCode).toBe(201)
      }
      // 줄은 다섯(지정 하나 + 만들기 넷).
      const seen: string[] = []
      let before: string | null = null
      let pages = 0
      do {
        const query: string = before === null ? '?limit=2' : `?limit=2&before=${encodeURIComponent(before)}`
        const res = await admin(ctx, me.cookie, 'GET', `/audit${query}`)
        expect(res.statusCode, res.body).toBe(200)
        const body = res.json() as { entries: { id: string; action: string; invite: { name: string } | null }[]; next: string | null }
        seen.push(...body.entries.map((entry) => entry.invite?.name ?? entry.action))
        before = body.next
        pages += 1
      } while (before !== null && pages < 10)
      expect(seen).toEqual(['라', '다', '나', '가', 'admin.grant'])
      expect(pages).toBe(3)
    })
  })

  it('행동 · 사람으로 거른다', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const other = await adminOf(ctx)
      await admin(ctx, me.cookie, 'POST', '/invites', { name: '내 것', kind: 'single' })
      await admin(ctx, other.cookie, 'POST', '/invites', { name: '남의 것', kind: 'single' })
      const mine = (await admin(ctx, me.cookie, 'GET', `/audit?action=invite.create&actorId=${me.user.id}`)).json().entries
      expect(mine.map((entry: { invite: { name: string } }) => entry.invite.name)).toEqual(['내 것'])
    })
  })

  it('`limit` 201 · 모르는 행동 · ISO 아닌 `before` 는 400', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      for (const query of ['?limit=201', '?limit=0', '?action=user.delete', '?before=어제']) {
        expect((await admin(ctx, me.cookie, 'GET', `/audit${query}`)).statusCode, query).toBe(400)
      }
      expect((await admin(ctx, me.cookie, 'GET', '/audit?limit=200')).statusCode).toBe(200)
    })
  })
})
