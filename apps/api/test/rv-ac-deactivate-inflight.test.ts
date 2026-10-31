/**
 * **RV-AC 리뷰 4 · 7 — 비활성화의 «즉시» 와 «마지막 접속» 갱신.**
 *
 * - **비활성화 커밋 순간에 그 사람이 이미 보내 둔 쓰기**(보고 `docs/superpowers/plans/2026-10-31-ac-report.md` «결정과 이유» 1 — «세션
 *   `DELETE` 에서 기다린다»). 쓰기가 재확인(자격 행 `KEY SHARE`)을 **지난 뒤** 비활성화가 오면 비활성화는 세션 `DELETE` 에서 그 쓰기의
 *   커밋을 기다린다 — 쓰기가 비활성화보다 먼저 커밋된다. 재확인 **앞**이면 비활성화가 먼저 커밋되고 쓰기는 지워진 세션을 보고 401 로 안
 *   남는다. 어느 쪽이든 «비활성화 커밋 뒤에 커밋된 그 사람의 쓰기» 는 없다. REST 코멘트(재확인 뒤)와 WS `patch`(재확인 앞)로 잰다.
 * - **«마지막 접속»(`users.last_seen_at`) 갱신은 사용자 행을 기다리지 않는다**(«결정» 6 · `src/auth/session.ts` 의 `touchUserLastSeen`).
 *   다른 트랜잭션이 그 사람의 행을 `FOR SHARE`(관리자 재확인 · 로그인) · `FOR NO KEY UPDATE`(비밀번호 바꾸기 · 비활성화)로 쥔 동안 그 사람의
 *   요청이 인증에서 서지 않는다 — 건너뛰고 끝난다. 놓은 뒤의 요청이 고친다.
 */
import { sql } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { admin, adminOf, deadlockCount, heldBackend, settledOrQueued } from './accounts-fixtures'
import { createMenuNode, createPage, createProject, getTestDb, resetRealData, signup, withProxiedRealApi } from './helpers'
import { joinRoom } from './ws-client'

const db = getTestDb()
const COMMENT_INSERT = 'insert into "comments"'
const SESSION_DELETE = 'delete from "sessions"'
const SESSION_RECHECK = '"sessions" where "id" = $1 and "expires_at" > statement_timestamp() for key share'

beforeEach(resetRealData)
afterEach(resetRealData)

describe('비활성화 × 그 사람이 이미 보내 둔 쓰기', () => {
  it('REST 코멘트가 재확인을 지난 뒤 — 비활성화가 세션 `DELETE` 에서 그 커밋을 기다리고, 코멘트 201 이 먼저 커밋된다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const me = await adminOf(ctx)
      const bob = await signup(ctx)
      const project = await createProject(ctx, bob.cookie)
      const menu = await createMenuNode(ctx, bob.cookie, project.id, { title: '메뉴' })
      const page = await createPage(ctx, bob.cookie, project.id, menu.id, { title: '페이지' })
      const nodeId = (page.schema as { root: { id: string } }).root.id
      const before = await deadlockCount(db)
      const hold = ctx.proxy.holdQuery(COMMENT_INSERT)
      const posting = ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/pages/${page.id}/comments`,
        cookies: bob.cookie,
        payload: { nodeId, body: '퇴사 직전의 말' },
      })
      await hold.held
      const holder = await heldBackend(db)
      const order: string[] = []
      void posting.then(() => order.push('comment'))
      const off = admin(ctx, me.cookie, 'POST', `/users/${bob.user.id}/deactivate`)
      void off.then(() => order.push('deactivate'))
      const waited = await settledOrQueued(db, off, holder, SESSION_DELETE)
      hold.release()
      const [posted, res] = await Promise.all([posting, off])
      const comments = await db.selectFrom('comments').select('id').where('page_id', '=', page.id).execute()
      console.log('[rv-ac 4 rest after recheck]', waited, posted.statusCode, res.statusCode, order, comments.length)
      expect(waited).toBe('queued')
      expect([posted.statusCode, res.statusCode]).toEqual([201, 200])
      expect(order).toEqual(['comment', 'deactivate'])
      expect(comments.length).toBe(1)
      expect((await deadlockCount(db)) - before).toBe(0)
    })
  })

  it('WS `patch` 가 재확인 앞 — 비활성화가 기다리지 않고 커밋되고, 그 patch 는 401 · 판 번호 그대로', async () => {
    await withProxiedRealApi(async (ctx) => {
      const me = await adminOf(ctx)
      const bob = await signup(ctx)
      const project = await createProject(ctx, bob.cookie)
      const menu = await createMenuNode(ctx, bob.cookie, project.id, { title: '메뉴' })
      const page = await createPage(ctx, bob.cookie, project.id, menu.id, { title: '페이지' })
      const headSeq = async () =>
        Number((await db.selectFrom('pages').select('head_seq').where('id', '=', page.id).executeTakeFirstOrThrow()).head_seq)
      const seq0 = await headSeq()
      const socket = await joinRoom(ctx.port, project.id, bob.cookie.wb_session)
      try {
        const hold = ctx.proxy.holdQuery(SESSION_RECHECK)
        socket.send(
          JSON.stringify({
            type: 'patch',
            pageId: page.id,
            baseSeq: seq0,
            ops: [{ op: 'add', path: '/root/children/-', value: { id: 'n_rvac_ws', type: 'Text', props: {} } }],
            clientOpId: 'op_rvac_ws',
          }),
        )
        await hold.held
        const holder = await heldBackend(db)
        const off = admin(ctx, me.cookie, 'POST', `/users/${bob.user.id}/deactivate`)
        const waited = await settledOrQueued(db, off, holder, SESSION_DELETE)
        const res = await off
        hold.release()
        // 연결은 비활성화 커밋 뒤 `revoked` 로 닫히므로 patch 의 답 프레임이 안 올 수 있다 — 붙잡힌 백엔드가 트랜잭션을 끝낼 때까지 기다린다.
        const until = Date.now() + 5_000
        for (;;) {
          const row = await sql<{ state: string | null }>`select state from pg_stat_activity where pid = ${holder}`.execute(db)
          const state = row.rows[0]?.state ?? 'gone'
          if (state !== 'idle in transaction' && state !== 'active') break
          if (Date.now() > until) throw new Error(`patch 트랜잭션이 끝나지 않았다: ${state}`)
          await new Promise((resolve) => setTimeout(resolve, 20))
        }
        const answers = socket.received.filter((frame) => frame.type === 'patch-ack' || frame.type === 'patch-error')
        const revisions = await db.selectFrom('revisions').select('seq').where('page_id', '=', page.id).execute()
        console.log(
          '[rv-ac 4 ws before recheck]',
          waited,
          res.statusCode,
          JSON.stringify(answers),
          socket.closeInfo,
          await headSeq(),
          revisions.length,
        )
        expect(waited).toBe('settled')
        expect(res.statusCode).toBe(200)
        expect(answers.every((frame) => frame.type === 'patch-error')).toBe(true)
        expect(await headSeq()).toBe(seq0)
        expect(revisions.every((row) => Number(row.seq) <= seq0)).toBe(true)
      } finally {
        socket.close()
      }
    })
  })
})

describe('«마지막 접속» 갱신은 사용자 행을 기다리지 않는다', () => {
  async function heldRow(userId: string, mode: 'share' | 'no key update'): Promise<{ release: () => Promise<void> }> {
    let commit!: () => void
    const gate = new Promise<void>((resolve) => (commit = resolve))
    let locked!: () => void
    const ready = new Promise<void>((resolve) => (locked = resolve))
    const done = db.transaction().execute(async (trx) => {
      await sql`select id from users where id = ${userId} for ${sql.raw(mode)}`.execute(trx)
      locked()
      await gate
    })
    await ready
    return {
      release: async () => {
        commit()
        await done
      },
    }
  }

  for (const mode of ['share', 'no key update'] as const) {
    it(`그 사람의 행을 FOR ${mode.toUpperCase()} 로 쥔 동안 — 요청은 서지 않고 200, 마지막 접속은 건너뛴다 · 놓은 뒤 고친다`, async () => {
      await withProxiedRealApi(async (ctx) => {
        const bob = await signup(ctx)
        await db.updateTable('users').set({ last_seen_at: null }).where('id', '=', bob.user.id).execute()
        const before = await deadlockCount(db)
        const held = await heldRow(bob.user.id, mode)
        const holder = await heldBackend(db)
        const started = performance.now()
        const me = ctx.app.inject({ method: 'GET', url: '/api/auth/me', cookies: bob.cookie })
        const waited = await settledOrQueued(db, me, holder, '"last_seen_at"')
        const ms = Math.round(performance.now() - started)
        const during = (await db.selectFrom('users').select('last_seen_at').where('id', '=', bob.user.id).executeTakeFirstOrThrow())
          .last_seen_at
        // 놓은 뒤에 답을 기다린다 — 줄을 선 판(갱신이 행을 기다림)에서 케이스가 시간 초과가 아니라 `waited` 값으로 죽게.
        await held.release()
        const res = await me
        const again = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', cookies: bob.cookie })
        const after = (await db.selectFrom('users').select('last_seen_at').where('id', '=', bob.user.id).executeTakeFirstOrThrow())
          .last_seen_at
        console.log(`[rv-ac 7 ${mode}]`, waited, res.statusCode, `${ms}ms`, during, after)
        expect(waited).toBe('settled')
        expect(res.statusCode).toBe(200)
        expect(during).toBeNull()
        expect(again.statusCode).toBe(200)
        expect(after).not.toBeNull()
        expect((await deadlockCount(db)) - before).toBe(0)
      })
    })
  }
})
