/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withRealApi`를 쓴다.
 *
 * # 트리 쓰기 한 번의 비용 — 방송 한 번 · 다시 받기 한 번(메뉴 500 · 페이지 2000)
 *
 * `menu-changed`는 트리를 안 싣는 신호라 크기가 트리와 무관하다. 비용은 받는 화면마다 한 번의 `GET …/tree`다 — 그 크기 · 시간이 트리를
 * 따라간다. 이 파일이 그 둘을 재고 `[메뉴 비용]` 줄로 찍는다(다시 재는 법: 이 파일을 돌린다). 단언은 «실시간이 아닌» 상한만 둔다 — 잰 값은
 * 기계마다 다르다.
 *
 * | 잰 것 | 어떻게 |
 * |---|---|
 * | 신호 크기 | 받은 `menu-changed` 하나의 바이트 |
 * | 방송 한 번 | 룸에 viewer `ROOM`개를 붙이고 메뉴 이름 하나를 바꿔, 보낸 순간부터 모두가 받기까지(ms) — `ws/broadcast.ts`의 `deliver`가 연결마다 자격을 본다 |
 * | 다시 받기 한 번 | 진짜 포트로 `GET …/tree`를 `READS`번 — 응답 바이트 · 시간의 가운데 값 |
 * | 방 전체의 다시 받기 | 받은 viewer `ROOM`명이 한꺼번에 `GET …/tree` — 신호 하나가 서버에 내는 일(모두 끝나기까지 ms) |
 */
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { CURRENT_DOCUMENT_VERSION } from '@wirebound/schema'
import { addMember, createProject, getTestDb, resetRealData, signup, withRealApi } from './helpers'
import { WsProbe, joinRoom } from './ws-client'

const db = getTestDb()

beforeEach(resetRealData)
afterEach(resetRealData)

const ROOTS = 50
const CHILDREN_PER_ROOT = 9
const PAGES_PER_MENU = 4
const ROOM = 20
const READS = 5

/** 받기까지의 상한 — 넘으면 «실시간»이 아니다. */
const LIMIT_MS = 2_000

it('메뉴 500 · 페이지 2000 — 신호 크기 · 방송 한 번 · 다시 받기 한 번', async () => {
  await withRealApi(async (ctx) => {
    const owner = await signup(ctx)
    const project = await createProject(ctx, owner.cookie)

    const menus: { id: string; project_id: string; parent_id: string | null; title: string; sort_order: number }[] = []
    for (let root = 0; root < ROOTS; root += 1) {
      const rootId = randomUUID()
      menus.push({ id: rootId, project_id: project.id, parent_id: null, title: `메뉴 ${root}`, sort_order: root })
      for (let child = 0; child < CHILDREN_PER_ROOT; child += 1) {
        menus.push({ id: randomUUID(), project_id: project.id, parent_id: rootId, title: `메뉴 ${root}-${child}`, sort_order: child })
      }
    }
    await db.insertInto('menu_nodes').values(menus).execute()
    const doc = JSON.stringify({ version: CURRENT_DOCUMENT_VERSION, root: { id: 'n_root', type: 'Page', children: [] } })
    const pages = menus.flatMap((menu) =>
      Array.from({ length: PAGES_PER_MENU }, (_, index) => ({
        id: randomUUID(),
        project_id: project.id,
        menu_node_id: menu.id,
        title: `${menu.title} 화면 ${index}`,
        description: null,
        sort_order: index,
        schema: doc,
        schema_version: CURRENT_DOCUMENT_VERSION,
        head_seq: 0,
      })),
    )
    for (let at = 0; at < pages.length; at += 500)
      await db
        .insertInto('pages')
        .values(pages.slice(at, at + 500))
        .execute()
    expect({ menus: menus.length, pages: pages.length }).toEqual({ menus: 500, pages: 2000 })

    const viewers = await Promise.all(Array.from({ length: ROOM }, () => signup(ctx)))
    for (const viewer of viewers) await addMember(ctx, project.id, viewer.user.id, 'viewer')
    const probes: WsProbe[] = []
    try {
      for (const viewer of viewers) probes.push(await joinRoom(ctx.port, project.id, viewer.cookie.wb_session))

      const start = performance.now()
      const renamed = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/menu/${menus[0]!.id}`,
        cookies: owner.cookie,
        payload: { title: '바뀐 이름' },
      })
      expect(renamed.statusCode).toBe(200)
      const frames = await Promise.all(probes.map((probe) => probe.waitFor('menu-changed', 5_000)))
      const broadcastMs = performance.now() - start

      const base = `http://127.0.0.1:${ctx.port}/api/projects/${project.id}/tree`
      const cookie = `wb_session=${owner.cookie.wb_session}`
      const reads: { ms: number; bytes: number; rev: number }[] = []
      for (let index = 0; index < READS; index += 1) {
        const began = performance.now()
        const response = await fetch(base, { headers: { cookie } })
        const text = await response.text()
        reads.push({ ms: performance.now() - began, bytes: Buffer.byteLength(text), rev: (JSON.parse(text) as { rev: number }).rev })
      }
      const median = [...reads].sort((a, b) => a.ms - b.ms)[Math.floor(READS / 2)]!
      const burstStart = performance.now()
      await Promise.all(
        viewers.map(async (viewer) => (await fetch(base, { headers: { cookie: `wb_session=${viewer.cookie.wb_session}` } })).text()),
      )
      const burstMs = performance.now() - burstStart

      const frameBytes = Buffer.byteLength(JSON.stringify(frames[0]))
      // eslint-disable-next-line no-console
      console.log(
        '[메뉴 비용]',
        JSON.stringify({
          menus: menus.length,
          pages: pages.length,
          room: ROOM,
          frameBytes,
          broadcastMs: Math.round(broadcastMs),
          treeBytes: median.bytes,
          treeMs: Math.round(median.ms),
          treeMsAll: reads.map((read) => Math.round(read.ms)),
          roomRereadMs: Math.round(burstMs),
        }),
      )
      expect(new Set(frames.map((frame) => frame.rev)).size).toBe(1)
      expect(reads.every((read) => read.rev === frames[0]!.rev)).toBe(true)
      expect(frameBytes).toBeLessThan(300)
      expect(broadcastMs).toBeLessThan(LIMIT_MS)
      expect(median.ms).toBeLessThan(LIMIT_MS)
      expect(burstMs).toBeLessThan(LIMIT_MS)
    } finally {
      for (const probe of probes) probe.close()
    }
  })
}, 120_000)
