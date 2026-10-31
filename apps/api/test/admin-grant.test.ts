/**
 * **관리자 지정 · 해제**(`src/routes/admin-users.ts` · `src/repos/users.ts` 의 `applyInstanceAdmin` — 서버 명령과 같은 함수).
 *
 * **«마지막 관리자»(계획 «리뷰 초점» 4)** — 관리자 둘이 서로를 동시에 해제하면 하나만 선다. 막는 겹은 둘이다: 요청자 행을 쥔 채 커밋 순간에
 * 관리자인지 보는 재확인, 그리고 활성 관리자 수 검사(`LAST_ADMIN`). 한 겹씩 떼면 남은 겹이 막고, 둘 다 떼면 둘 다 선다(보고 «혼자 죽는 변조»
 * M-A5a · b · c). 판은 앞 해제를 기록 삽입 앞(대상 행을 고친 뒤 · 커밋 앞)에 붙잡고 뒤 해제를 보낸 뒤 놓는다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { INACTIVE_GRANT, LAST_ADMIN, SELF_REVOKE } from '../src/routes/admin-users'
import { admin, adminOf, joinWith, makeInvite } from './accounts-fixtures'
import { getTestDb, resetRealData, signup, withApi, withProxiedRealApi } from './helpers'

describe('지정 · 해제', () => {
  it('지정 200 · 해제 200 · 기록에 요청한 관리자로 남는다', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const bob = await signup(ctx)
      const granted = await admin(ctx, me.cookie, 'POST', `/users/${bob.user.id}/admin`)
      expect(granted.statusCode, granted.body).toBe(200)
      expect(granted.json().user).toMatchObject({ id: bob.user.id, isInstanceAdmin: true })
      const revoked = await admin(ctx, me.cookie, 'DELETE', `/users/${bob.user.id}/admin`)
      expect(revoked.statusCode, revoked.body).toBe(200)
      expect(revoked.json()).toMatchObject({ user: { isInstanceAdmin: false }, revokedLinks: 0 })
      const entries = (await admin(ctx, me.cookie, 'GET', '/audit')).json().entries as { action: string; actor: { id?: string } }[]
      expect(entries.slice(0, 2).map((entry) => [entry.action, entry.actor.id])).toEqual([
        ['admin.revoke', me.user.id],
        ['admin.grant', me.user.id],
      ])
    })
  })

  it('비활성 지정 409 · 이미 관리자 409 · 자기 해제 409 · 관리자 아닌 사람 해제 409 · 관리자 아님 403', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const other = await adminOf(ctx)
      const off = await signup(ctx)
      expect((await admin(ctx, me.cookie, 'POST', `/users/${off.user.id}/deactivate`)).statusCode).toBe(200)
      const inactive = await admin(ctx, me.cookie, 'POST', `/users/${off.user.id}/admin`)
      expect(inactive.statusCode).toBe(409)
      expect(inactive.json().error.message).toBe(INACTIVE_GRANT)
      expect((await admin(ctx, me.cookie, 'POST', `/users/${other.user.id}/admin`)).statusCode).toBe(409)
      const self = await admin(ctx, me.cookie, 'DELETE', `/users/${me.user.id}/admin`)
      expect(self.statusCode).toBe(409)
      expect(self.json().error.message).toBe(SELF_REVOKE)
      const plain = await signup(ctx)
      expect((await admin(ctx, me.cookie, 'DELETE', `/users/${plain.user.id}/admin`)).statusCode).toBe(409)
      expect((await admin(ctx, plain.cookie, 'POST', `/users/${plain.user.id}/admin`)).statusCode).toBe(403)
    })
  })

  it('해제가 그 사람의 쓸 수 있는 링크를 거두고, 해제된 사람의 다음 관리자 요청은 403', async () => {
    await withApi(async (ctx) => {
      const me = await adminOf(ctx)
      const bob = await adminOf(ctx)
      const multi = await makeInvite(ctx, bob.cookie, { kind: 'multi' })
      const res = await admin(ctx, me.cookie, 'DELETE', `/users/${bob.user.id}/admin`)
      expect(res.json().revokedLinks).toBe(1)
      expect((await joinWith(ctx, multi.token)).statusCode).toBe(404)
      expect((await admin(ctx, bob.cookie, 'GET', '/users')).statusCode).toBe(403)
    })
  })
})

describe('마지막 관리자 — 서로를 동시에 해제하는 둘', () => {
  beforeEach(resetRealData)
  afterEach(resetRealData)

  it('하나만 선다 — 관리자가 하나 남는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const db = getTestDb()
      const alice = await adminOf(ctx)
      const bob = await adminOf(ctx)
      const hold = ctx.proxy.holdQuery('insert into "admin_audit"')
      const first = admin(ctx, alice.cookie, 'DELETE', `/users/${bob.user.id}/admin`)
      await hold.held
      const second = admin(ctx, bob.cookie, 'DELETE', `/users/${alice.user.id}/admin`)
      // 뒤 해제는 앞 해제가 쥔 행 뒤에 서거나(잠금이 있는 판) 끝난다(없는 판) — 어느 쪽이든 판정은 아래 값이 한다.
      await Promise.race([second, new Promise((resolve) => setTimeout(resolve, 300))])
      hold.release()
      const statuses = (await Promise.all([first, second])).map((res) => res.statusCode)
      const admins = await db.selectFrom('users').select('id').where('is_instance_admin', '=', true).execute()
      console.log('[mutual revoke]', statuses, '| admins left', admins.length)
      expect(admins).toHaveLength(1)
      expect(statuses.filter((status) => status === 200)).toHaveLength(1)
      expect(statuses.filter((status) => status === 403 || status === 409)).toHaveLength(1)
    })
  })

  it('혼자 남은 관리자는 자기를 해제 · 비활성화하지 못한다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const alice = await adminOf(ctx)
      expect((await admin(ctx, alice.cookie, 'DELETE', `/users/${alice.user.id}/admin`)).statusCode).toBe(409)
      const off = await admin(ctx, alice.cookie, 'POST', `/users/${alice.user.id}/deactivate`)
      expect(off.statusCode).toBe(409)
      expect([LAST_ADMIN, '자기 자신은 비활성화할 수 없습니다']).toContain(off.json().error.message)
    })
  })
})
