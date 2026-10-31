/**
 * **한 번짜리 초대 링크를 두 사람이 동시에 연다**(계획 «리뷰 초점» 1) — 하나만 가입되고 다른 쪽은 «더 쓸 수 없습니다».
 *
 * 판: 앞 가입을 링크 행을 `FOR UPDATE` 로 잡은 뒤의 사용자 삽입(`insert into "users"`)에서 붙잡고(`holdQuery`), 뒤 가입을 보낸 뒤 그것이
 * 앞 가입의 백엔드 뒤에 링크 행 잠금으로 줄 섰는지(`pg_blocking_pids` 사슬)를 보고 놓는다. 줄 서지 않고 끝났으면(잠금이 없는 판) 값으로
 * 죽는다 — 둘 다 201 · 사용자 둘. 끝나지도 줄 서지도 않으면 판이 안 선 것이라 던진다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { adminOf, heldBackend, joinWith, makeInvite, settledOrQueued } from './accounts-fixtures'
import { getTestDb, resetRealData, withProxiedRealApi } from './helpers'

const USER_INSERT = 'insert into "users"'

describe('한 번짜리 링크로 동시에 둘이 가입한다', () => {
  beforeEach(resetRealData)
  afterEach(resetRealData)

  it('201 하나 · 404 하나 · 사용자 하나 — 뒤 가입은 링크 행에서 앞 커밋을 기다린다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const db = getTestDb()
      const me = await adminOf(ctx)
      const { id, token } = await makeInvite(ctx, me.cookie, { kind: 'single' })

      const hold = ctx.proxy.holdQuery(USER_INSERT)
      const first = joinWith(ctx, token, { email: 'first@example.com' })
      await hold.held
      const holder = await heldBackend(db)
      const second = joinWith(ctx, token, { email: 'second@example.com' })
      const waited = await settledOrQueued(db, second, holder, 'from "invites"')
      hold.release()
      const statuses = (await Promise.all([first, second])).map((res) => res.statusCode)

      const joined = await db.selectFrom('users').select('email').where('invite_id', '=', id).execute()
      console.log('[invite race]', statuses, '| waited', waited, '| joined', joined.length)
      expect(statuses).toEqual([201, 404])
      expect(joined).toEqual([{ email: 'first@example.com' }])
      expect(waited).toBe('queued')
    })
  })
})
