/**
 * 스냅샷과 공통코드 표(판 4) — 캡처가 표를 담고, 판 4 복원이 표를 그 판으로 덮고, 안전망이 덮기 전 표를 담고, 판 3(표 없음) 복원은 표를 안
 * 건드리고, 복원 뒤 룸에 `codes-changed` 가 간다(Review Focus 4).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import type { CodeTable } from '@wirebound/schema'
import type { ServerFrame } from '../src/ws/protocol'
import { createProject, resetRealData, signup, withApi, withRealApi, type TestContext } from './helpers'
import { joinRoom } from './ws-client'

beforeEach(resetRealData)
afterEach(resetRealData)

async function fixture(ctx: TestContext) {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const send = async (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: Record<string, unknown>) =>
    ctx.app.inject({
      method,
      url: `/api/projects/${project.id}${url}`,
      cookies: owner.cookie,
      ...(payload === undefined ? {} : { payload }),
    })
  const table = async (): Promise<CodeTable> => (await send('GET', '/codes')).json().groups
  const snapshot = async (tag: string): Promise<string> => {
    const res = await send('POST', '/snapshots', { tag })
    expect(res.statusCode, res.body).toBe(201)
    return res.json().id
  }
  const restore = (id: string) => send('POST', `/snapshots/${id}/restore`)
  const payloadOf = async (id: string) =>
    (await ctx.db.selectFrom('snapshots').select('payload').where('id', '=', id).executeTakeFirstOrThrow()).payload
  // 그룹 둘 · 항목 셋 — 차례를 뒤집어 만든 차례가 아닌 것을 담게 한다.
  await send('POST', '/codes', { key: 'ORDER_STATUS', name: '주문 상태' })
  await send('POST', '/codes', { key: 'GRADE', name: '등급' })
  await send('POST', '/codes/ORDER_STATUS/items', { value: 'WAIT', name: '결제 대기' })
  await send('POST', '/codes/ORDER_STATUS/items', { value: 'DONE', name: '완료', active: false })
  await send('POST', '/codes/GRADE/items', { value: 'VIP', name: '우수' })
  await send('PATCH', '/codes/GRADE', { sortOrder: 0 })
  return { project, owner, send, table, snapshot, restore, payloadOf }
}

const AT_SNAPSHOT: CodeTable = [
  { key: 'GRADE', name: '등급', items: [{ value: 'VIP', name: '우수', active: true }] },
  {
    key: 'ORDER_STATUS',
    name: '주문 상태',
    items: [
      { value: 'WAIT', name: '결제 대기', active: true },
      { value: 'DONE', name: '완료', active: false },
    ],
  },
]

describe('스냅샷 · 공통코드', () => {
  it('캡처한 payload 의 codes 가 그때 표와 같다(차례 포함)', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      expect(await fx.table()).toEqual(AT_SNAPSHOT)
      const payload = await fx.payloadOf(await fx.snapshot('v1'))
      expect(payload.payloadVersion).toBe(5)
      expect(payload.codes).toEqual(AT_SNAPSHOT)
    })
  })

  it('판 4 복원은 표를 그 판으로 덮고, 안전망은 덮기 전 표를 담는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const id = await fx.snapshot('v1')
      await fx.send('POST', '/codes', { key: 'NEW', name: '나중 그룹' })
      await fx.send('DELETE', '/codes/ORDER_STATUS/items/WAIT')
      await fx.send('PATCH', '/codes/GRADE/items/VIP', { name: '고친 이름' })
      const before = await fx.table()

      const res = await fx.restore(id)
      expect(res.statusCode, res.body).toBe(200)
      expect(await fx.table()).toEqual(AT_SNAPSHOT)
      const safety = await fx.payloadOf(res.json().safetySnapshot.id)
      expect(safety.codes).toEqual(before)
      expect(before.map((group) => group.key)).toContain('NEW')
    })
  })

  for (const [label, edit] of [
    ['판 3 payload(표 없음)', sql<string>`jsonb_set(payload - 'codes', '{payloadVersion}', '3')`],
    // 손댄 payload — 판만 3 이고 표가 있다. 판으로 가른다(`set-theme` 가 판 2 의 `theme` 를 안 쓰는 것과 같다).
    ['표가 든 판 3 payload', sql<string>`jsonb_set(payload, '{payloadVersion}', '3')`],
  ] as const) {
    it(`${label} 복원은 지금 표를 건드리지 않는다`, async () => {
      await withApi(async (ctx) => {
        const fx = await fixture(ctx)
        const id = await fx.snapshot('v1')
        await ctx.db.updateTable('snapshots').set({ payload: edit }).where('id', '=', id).execute()
        await fx.send('POST', '/codes', { key: 'NEW', name: '나중 그룹' })
        const now = await fx.table()

        const res = await fx.restore(id)
        expect(res.statusCode, res.body).toBe(200)
        expect(await fx.table()).toEqual(now)
      })
    })
  }

  it('판 4 복원 뒤 룸에 codes-changed 가 간다 — 낸 사람의 연결도 받는다 · 판 3 은 안 간다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const room = await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session)
      await room.waitFor('joined')
      const codesChanged = (from: number) => room.received.slice(from).filter((frame: ServerFrame) => frame.type === 'codes-changed')

      const v4 = await fx.snapshot('v4')
      let at = room.received.length
      expect((await fx.restore(v4)).statusCode).toBe(200)
      await room.quiet()
      expect(codesChanged(at)).toEqual([{ type: 'codes-changed', projectId: fx.project.id }])

      const v3 = await fx.snapshot('v3')
      await ctx.db
        .updateTable('snapshots')
        .set({ payload: sql`jsonb_set(payload - 'codes', '{payloadVersion}', '3')` })
        .where('id', '=', v3)
        .execute()
      at = room.received.length
      expect((await fx.restore(v3)).statusCode).toBe(200)
      await room.quiet()
      expect(codesChanged(at)).toEqual([])
      room.close()
    })
  })
})
