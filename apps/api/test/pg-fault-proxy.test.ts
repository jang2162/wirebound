/**
 * **프록시의 `holdQuery`가 «판이 안 섬»을 원인 문장으로 말한다**(`test/pg-fault-proxy.ts`의 `holdQuery`). 한도가 없으면 질의 글자가
 * 바뀐 케이스는 원인 없이 케이스 한도까지 멈춘다.
 */
import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { createDb, createPool } from '../src/db/client'
import { startFaultProxy } from './pg-fault-proxy'
import { TEST_DATABASE_URL } from './helpers'

async function withProxy(fn: (ctx: { proxy: Awaited<ReturnType<typeof startFaultProxy>>; db: ReturnType<typeof createDb> }) => Promise<void>) {
  const proxy = await startFaultProxy(TEST_DATABASE_URL)
  const db = createDb(createPool(proxy.url, () => undefined))
  try {
    await fn({ proxy, db })
  } finally {
    // 프록시를 먼저 닫는다 — 붙잡힌 채 남은 질의가 있으면 풀이 그 연결을 영영 기다린다(케이스가 값으로 죽은 뒤에도).
    await proxy.close()
    await db.destroy()
  }
}

/** 케이스 한도보다 먼저 값으로 죽게 — 기다리는 것이 끝내 안 오면 이 글자가 결과다. */
const within = (ms: number, label: string): Promise<string> => new Promise((resolve) => setTimeout(() => resolve(label), ms))

describe('holdQuery 의 한도', () => {
  it('그 글자의 질의가 한도 안에 안 오면 `held`가 원인 문장으로 거절하고, 붙잡기도 거둔다', async () => {
    await withProxy(async ({ proxy, db }) => {
      const hold = proxy.holdQuery('select 424242 as never_sent', 150)
      const verdict = await Promise.race([
        hold.held.then(
          () => 'held',
          (error: Error) => error.message,
        ),
        within(2_000, '한도가 안 섰다'),
      ])
      expect(verdict).toMatch(/'select 424242 as never_sent'를 담은 질의가 150ms 안에 안 왔습니다/)
      // 거둔 뒤에 온 같은 글자의 질의는 서지 않는다.
      const answered = await Promise.race([
        sql<{ never_sent: number }>`select 424242 as never_sent`.execute(db).then(({ rows }) => rows),
        within(2_000, '거둔 붙잡기가 늦게 온 질의를 세웠다'),
      ])
      expect(answered).toEqual([{ never_sent: 424242 }])
    })
  })

  it('한도 안에 오면 붙잡고, 풀면 넘긴다', async () => {
    await withProxy(async ({ proxy, db }) => {
      const hold = proxy.holdQuery('select 515151 as held_one', 5_000)
      const query = sql<{ held_one: number }>`select 515151 as held_one`.execute(db)
      await hold.held
      hold.release()
      expect((await query).rows).toEqual([{ held_one: 515151 }])
    })
  })
})
