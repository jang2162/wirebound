import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createSession, destroySession, destroyUserSessions, hashSessionToken, resolveSession,
} from '../src/auth/session'
import { withApi } from './helpers'
import type { DbHandle } from '../src/db/tx'

async function seedUser(db: DbHandle, email = 'sess@example.com'): Promise<string> {
  const row = await db.insertInto('users')
    .values({ email, name: '세션사용자', password_hash: 'x' })
    .returning('id').executeTakeFirstOrThrow()
  return row.id
}

describe('hashSessionToken', () => {
  it('sha256 hex를 낸다', () => {
    expect(hashSessionToken('토큰')).toBe(createHash('sha256').update('토큰').digest('hex'))
  })
})

describe('createSession', () => {
  it('토큰 원문이 DB에 저장되지 않는다', async () => {
    await withApi(async ({ db }) => {
      const userId = await seedUser(db)
      const { token } = await createSession(db, userId, 24)
      const rows = await db.selectFrom('sessions').selectAll().execute()
      expect(rows).toHaveLength(1)
      expect(rows[0]?.id).not.toBe(token)
      expect(rows[0]?.id).toBe(hashSessionToken(token))
    })
  })

  it('매번 다른 토큰을 낸다', async () => {
    await withApi(async ({ db }) => {
      const userId = await seedUser(db)
      const a = await createSession(db, userId, 24)
      const b = await createSession(db, userId, 24)
      expect(a.token).not.toBe(b.token)
    })
  })

  it('ttl만큼 뒤의 만료 시각을 준다', async () => {
    await withApi(async ({ db }) => {
      const userId = await seedUser(db)
      const before = Date.now()
      const { expiresAt } = await createSession(db, userId, 2)
      const delta = expiresAt.getTime() - before
      expect(delta).toBeGreaterThan(1.9 * 3600_000)
      expect(delta).toBeLessThan(2.1 * 3600_000)
    })
  })
})

describe('resolveSession', () => {
  it('유효한 토큰으로 사용자를 찾는다', async () => {
    await withApi(async ({ db }) => {
      const userId = await seedUser(db, 'resolve@example.com')
      const { token } = await createSession(db, userId, 24)
      const user = await resolveSession(db, token)
      expect(user).toEqual({ id: userId, email: 'resolve@example.com', name: '세션사용자' })
    })
  })

  it('비밀번호 해시를 돌려주지 않는다', async () => {
    await withApi(async ({ db }) => {
      const userId = await seedUser(db)
      const { token } = await createSession(db, userId, 24)
      const user = await resolveSession(db, token)
      expect(Object.keys(user ?? {}).sort()).toEqual(['email', 'id', 'name'])
    })
  })

  it('없는 토큰에는 null이다', async () => {
    await withApi(async ({ db }) => {
      expect(await resolveSession(db, '없는토큰')).toBeNull()
    })
  })

  it('만료된 세션에는 null이다', async () => {
    await withApi(async ({ db }) => {
      const userId = await seedUser(db)
      const { token } = await createSession(db, userId, 24)
      await db.updateTable('sessions')
        .set({ expires_at: new Date(Date.now() - 1000) })
        .where('id', '=', hashSessionToken(token))
        .execute()
      expect(await resolveSession(db, token)).toBeNull()
    })
  })

  it('last_seen_at을 갱신한다', async () => {
    await withApi(async ({ db }) => {
      const userId = await seedUser(db)
      const { token } = await createSession(db, userId, 24)
      const past = new Date(Date.now() - 60_000)
      await db.updateTable('sessions').set({ last_seen_at: past })
        .where('id', '=', hashSessionToken(token)).execute()

      await resolveSession(db, token)

      const row = await db.selectFrom('sessions').select('last_seen_at')
        .where('id', '=', hashSessionToken(token)).executeTakeFirstOrThrow()
      expect(row.last_seen_at.getTime()).toBeGreaterThan(past.getTime())
    })
  })
})

describe('세션 폐기', () => {
  it('destroySession 후에는 해석되지 않는다', async () => {
    await withApi(async ({ db }) => {
      const userId = await seedUser(db)
      const { token } = await createSession(db, userId, 24)
      await destroySession(db, token)
      expect(await resolveSession(db, token)).toBeNull()
    })
  })

  it('destroyUserSessions가 그 사용자 세션만 지운다', async () => {
    await withApi(async ({ db }) => {
      const a = await seedUser(db, 'a@example.com')
      const b = await seedUser(db, 'b@example.com')
      const sessionA = await createSession(db, a, 24)
      const sessionB = await createSession(db, b, 24)

      await destroyUserSessions(db, a)

      expect(await resolveSession(db, sessionA.token)).toBeNull()
      expect(await resolveSession(db, sessionB.token)).not.toBeNull()
    })
  })
})

describe('인증 훅', () => {
  it('쿠키가 없으면 currentUser가 null이고 requireAuth가 401을 낸다', async () => {
    await withApi(async ({ app }) => {
      app.get('/__me', { preHandler: app.requireAuth }, async (request) => request.currentUser)
      const res = await app.inject({ method: 'GET', url: '/__me' })
      expect(res.statusCode).toBe(401)
      expect(res.json().error.code).toBe('unauthenticated')
    })
  })

  it('유효한 쿠키면 currentUser가 채워진다', async () => {
    await withApi(async ({ app, db }) => {
      const userId = await seedUser(db, 'hook@example.com')
      const { token } = await createSession(db, userId, 24)
      app.get('/__me', { preHandler: app.requireAuth }, async (request) => request.currentUser)

      const res = await app.inject({ method: 'GET', url: '/__me', cookies: { wb_session: token } })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ id: userId, email: 'hook@example.com', name: '세션사용자' })
    })
  })

  it('쓰레기 쿠키는 401이고 500이 아니다', async () => {
    await withApi(async ({ app }) => {
      app.get('/__me', { preHandler: app.requireAuth }, async (request) => request.currentUser)
      const res = await app.inject({ method: 'GET', url: '/__me', cookies: { wb_session: '!!!쓰레기!!!' } })
      expect(res.statusCode).toBe(401)
    })
  })

  it('resolveSession 조회 자체가 실패해도 401이고 500이 아니다', async () => {
    await withApi(async ({ app, db }) => {
      const userId = await seedUser(db, 'crash@example.com')
      const { token } = await createSession(db, userId, 24)
      app.get('/__me', { preHandler: app.requireAuth }, async (request) => request.currentUser)

      // withTransaction 없이 raw db로 유니크 위반을 직접 낸다 (db.test.ts가 문서화한
      // 25P02 함정). 이 트랜잭션 위의 모든 이후 쿼리가 내용과 무관하게 실패하는
      // 상태가 되므로, resolveSession의 SELECT도 예외 없이 던진다 — 이제서야
      // onRequest 훅의 try/catch가 실제로 시험대에 오른다. 이 try/catch를 지우면
      // 이 테스트는 실패한다(500).
      await expect(
        db.insertInto('users')
          .values({ email: 'crash@example.com', name: '중복', password_hash: 'y' })
          .execute(),
      ).rejects.toThrow()

      const res = await app.inject({ method: 'GET', url: '/__me', cookies: { wb_session: token } })
      expect(res.statusCode).toBe(401)
      expect(res.json().error.code).toBe('unauthenticated')
    })
  })

  it('requireAuth가 없는 라우트는 쿠키가 없어도 돈다', async () => {
    await withApi(async ({ app }) => {
      app.get('/__open', async (request) => ({ user: request.currentUser }))
      const res = await app.inject({ method: 'GET', url: '/__open' })
      expect(res.statusCode).toBe(200)
      expect(res.json()).toEqual({ user: null })
    })
  })
})
