/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withRealApi`를 쓴다.
 *
 * ---
 *
 * # 하트비트의 판정 비용 — 남의 잠금이 많은 큰 페이지
 *
 * `lock` 프레임은 집합 전부를 판정하고(`ws/lock.ts`의 «집합을 갈아 끼운다») 웹은 편집마다 같은 집합을 다시 보낸다(하트비트). 판정은
 * 동기라 그동안 **이벤트 루프 전체**가 서고, 페이지 행을 `KEY SHARE`로 쥔 트랜잭션 안이라 **같은 페이지의 편집도 그만큼 줄 선다.**
 * 판정이 «고른 노드마다 남의 잠금마다 문서 훑기»면 고른 200 · 남의 잠금 801 · Text 7000 에서 한 번에 4.2s 였고 남의 편집이 1s 주기의
 * 하트비트 다섯에 503 으로 끝났다(`docs/superpowers/plans/2026-10-03-e2-review-2.md` N1). 이 파일은 그 판을 **값으로** 잠근다 — 판정이
 * 문서를 한 번 도는지(`@wirebound/schema`의 `selectionConflicts`)를 시간으로 잰다. 판정이 맞는지는 `packages/schema/test/lock-selection-oracle.test.ts`가 잰다.
 *
 * **상한은 잰 값에 여유를 둔 것이다** — 다시 재는 법: 이 파일을 혼자 돌리면 `BEATS` 줄에 하트비트의 «보낸 순간 → `hold`» ·
 * 이벤트 루프의 가장 긴 멈춤이, `EDITS` 줄에 남의 편집 왕복이 찍힌다. 값은 `docs/superpowers/plans/2026-10-03-e2-report.md` 「리뷰 대응 2」에 있다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addMember, createMenuNode, createPage, createProject, resetRealData, signup, withRealApi } from './helpers'
import { WsProbe, joinRoom } from './ws-client'

beforeEach(resetRealData)
afterEach(resetRealData)

const opened: WsProbe[] = []

afterEach(() => {
  for (const probe of opened) probe.close()
  opened.length = 0
})

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const max = (xs: readonly number[]) => Math.max(...xs)
const p50 = (xs: readonly number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]!

/** 문서의 Text 수 — 538KB. */
const TEXTS = 7000
/** 한 사람이 쥐는 집합 — 화면의 상한(`MAX_LOCK_SET`)이다. */
const SET = 200
/** 쥔 사람 — 보라 + 넷. 보라가 보는 남의 잠금은 넷 × 200 + 다혜의 하나 = 801. */
const HOLDERS = 5
/** **상한**(ms) — 하트비트 하나의 «보낸 순간 → `hold`». */
const HEARTBEAT_LIMIT_MS = 100
/** **상한**(ms) — 그동안의 이벤트 루프 멈춤. */
const LOOP_STALL_LIMIT_MS = 100
/** **상한**(ms) — 쥔 사람 다섯이 1s 마다 하트비트를 보내는 동안 남의 편집 왕복. */
const EDIT_LIMIT_MS = 1000

describe('하트비트 판정은 고른 수 × 남의 잠금 수로 늘지 않는다', () => {
  it(`Text ${TEXTS} · 고른 ${SET} · 남의 잠금 ${(HOLDERS - 1) * SET + 1} — 하트비트 판정 · 루프 멈춤 · 남의 편집 왕복이 상한 안이다`, { timeout: 300_000 }, async () => {
    await withRealApi(async (ctx) => {
      const holders = [] as Awaited<ReturnType<typeof signup>>[]
      for (let k = 0; k < HOLDERS; k += 1) holders.push(await signup(ctx))
      const dahye = await signup(ctx)
      const sera = await signup(ctx)
      const project = await createProject(ctx, holders[0]!.cookie)
      for (const u of [...holders.slice(1), dahye, sera]) await addMember(ctx, project.id, u.user.id, 'editor')
      const menu = await createMenuNode(ctx, holders[0]!.cookie, project.id)
      const page = await createPage(ctx, holders[0]!.cookie, project.id, menu.id, { title: 'p' })
      const texts = Array.from({ length: TEXTS }, (_, i) => ({
        id: `n_t${String(i).padStart(5, '0')}`,
        type: 'Text',
        props: { content: `줄 ${i} 가나다라마바사 아자차카타파하` },
      }))
      const schema = { version: 1, root: { id: 'n_root', type: 'Page', children: [{ id: 'n_sec', type: 'Section', children: [] }, ...texts] } }
      const P = `/api/projects/${project.id}/pages/${page.id}`
      const put = await ctx.app.inject({ method: 'PUT', url: `${P}/schema`, cookies: holders[0]!.cookie, payload: { schema } })
      expect(put.statusCode).toBe(200)

      // 다혜가 `n_sec`, 쥔 사람 k 가 Text 200 개씩(k 번째 묶음). 세라는 아무도 안 쥔 마지막 Text 를 고친다.
      const sets = holders.map((_, k) => texts.slice(k * SET, (k + 1) * SET).map((t) => t.id))
      const dahyeTab = await joinRoom(ctx.port, project.id, dahye.cookie.wb_session)
      opened.push(dahyeTab)
      dahyeTab.send(JSON.stringify({ type: 'lock', pageId: page.id, nodeIds: ['n_sec'], lockId: 1 }))
      const tabs: WsProbe[] = []
      for (const [k, u] of holders.entries()) {
        const tab = await joinRoom(ctx.port, project.id, u.cookie.wb_session)
        opened.push(tab)
        tabs.push(tab)
        tab.send(JSON.stringify({ type: 'lock', pageId: page.id, nodeIds: sets[k], lockId: 1 }))
      }
      const want = 1 + HOLDERS * SET
      for (let t = 0; t < 3000 && ctx.app.realtime.locks.liveIn(project.id).length !== want; t += 1) await sleep(10)
      // 카나리아 — 판이 섰다: 남의 잠금 801 이 보라에게 보인다.
      expect(ctx.app.realtime.locks.liveIn(project.id).length).toBe(want)

      // 1) 보라(쥔 사람 0)의 하트비트 열 번 — 보낸 순간 → `hold`, 그 사이 이벤트 루프의 가장 긴 멈춤(끝에서 한 번 더 잰다).
      const { locks } = ctx.app.realtime
      const realHold = locks.hold
      let holdAt = 0
      let holds = 0
      locks.hold = (claim) => {
        holdAt = performance.now()
        holds += 1
        return realHold.call(locks, claim)
      }
      const beats: number[] = []
      let stall = 0
      let lastTick = performance.now()
      const ticker = setInterval(() => {
        const now = performance.now()
        stall = Math.max(stall, now - lastTick)
        lastTick = now
      }, 1)
      try {
        for (let n = 2; n < 12; n += 1) {
          holdAt = 0
          const sentAt = performance.now()
          tabs[0]!.send(JSON.stringify({ type: 'lock', pageId: page.id, nodeIds: sets[0], lockId: n }))
          const deadline = Date.now() + 60_000
          while (holdAt === 0 && Date.now() < deadline) await sleep(1)
          expect(holdAt, '`hold`가 안 불렸다').not.toBe(0)
          beats.push(holdAt - sentAt)
          await sleep(20)
        }
      } finally {
        clearInterval(ticker)
        stall = Math.max(stall, performance.now() - lastTick)
        locks.hold = realHold
      }
      console.log('BEATS', JSON.stringify({ p50: p50(beats), max: max(beats), stall, holds }))
      // **하트비트 단언을 여기서 한다** — 판정이 느린 판은 다음 단계(1s 주기의 하트비트 다섯)가 이벤트 루프를 채워 편집이 몇 분씩 서서
      // 케이스가 값이 아니라 시간 초과로 죽는다. 카나리아: 판정이 실제로 돌았다(`hold` 열 번).
      expect(holds).toBe(10)
      expect(max(beats)).toBeLessThan(HEARTBEAT_LIMIT_MS)
      expect(stall).toBeLessThan(LOOP_STALL_LIMIT_MS)

      // 2) 쥔 사람 다섯이 1s 마다 하트비트를 보내는 동안 세라의 편집 20 — 요청 왕복.
      let on = true
      let lockId = 100
      let sent = 0
      const loops = tabs.map(async (tab, k) => {
        await sleep((1000 / HOLDERS) * k)
        while (on) {
          tab.send(JSON.stringify({ type: 'lock', pageId: page.id, nodeIds: sets[k], lockId: ++lockId }))
          sent += 1
          await sleep(1000)
        }
      })
      const edits: number[] = []
      const statuses: number[] = []
      try {
        let seq = Number((await ctx.app.inject({ method: 'GET', url: P, cookies: sera.cookie })).json().headSeq)
        for (let i = 0; i < 20; i += 1) {
          const t0 = performance.now()
          const r = await ctx.app.inject({
            method: 'PATCH',
            url: `${P}/ops`,
            cookies: sera.cookie,
            payload: { baseSeq: seq, ops: [{ op: 'replace', path: `/root/children/${TEXTS}/props`, value: { content: `세라 ${i}` } }] },
          })
          edits.push(performance.now() - t0)
          statuses.push(r.statusCode)
          seq = Number(r.json().headSeq ?? seq + 1)
          await sleep(50)
        }
      } finally {
        on = false
        await Promise.all(loops)
      }

      const denied = tabs.reduce((n, tab) => n + tab.received.filter((f) => f.type === 'lock-denied').length, 0)
      console.log('EDITS', JSON.stringify({ p50: p50(edits), max: max(edits), sent, denied }))
      // 카나리아 — 하트비트 루프가 보냈다 · 겹침이 없어 다 받는다.
      expect(sent).toBeGreaterThanOrEqual(HOLDERS)
      expect(denied).toBe(0)
      expect(statuses.every((s) => s === 200), JSON.stringify(statuses)).toBe(true)
      expect(max(edits)).toBeLessThan(EDIT_LIMIT_MS)
    })
  })
})
