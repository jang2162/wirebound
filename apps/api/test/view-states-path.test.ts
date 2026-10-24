/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withRealApi`를 쓴다.
 *
 * 화면 상태 목록의 편집 길 — 문서 경로 `/viewStates/…` 의 JSON Patch 가 서버 ops 경계(REST `PATCH …/ops` · WS `patch`) · 이력의 역연산
 * (되돌리기) · 방송 · 잠금 판정을 지나는가(설계 spec `docs/superpowers/specs/2026-10-05-page-states-design.md` 「상태 목록」). 목록의
 * 모양 칸마다의 케이스는 `packages/schema/test/view-state-model.test.ts`, 잠금 판정의 좌표 케이스는
 * `packages/schema/test/view-state-lock.test.ts` 가 갖는다 — 여기는 서버가 그 길을 여는지 · 잠금이 남의 노드 잠금에 막히지 않는지 ·
 * 같은 묶음의 노드 연산은 그대로 판정하는지를 잰다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PatchOp } from '@wirebound/schema'
import { addMember, createMenuNode, createPage, createProject, resetRealData, signup, withRealApi, type RealApiContext } from './helpers'
import { WsProbe, joinRoom, locksWith } from './ws-client'

beforeEach(resetRealData)
afterEach(resetRealData)

const opened: WsProbe[] = []
afterEach(() => {
  for (const probe of opened) probe.close()
  opened.length = 0
})

function track(probe: WsProbe): WsProbe {
  opened.push(probe)
  return probe
}

/**
 * 그 `clientOpId`의 답 — `patch-ack`이든 `patch-error`든 먼저 온 것, 또는 연결이 닫혔다는 것(규격 밖 프레임은 답 없이 연결을 끊는다 —
 * `ws/protocol.ts`의 `parseClientFrame` 머리말). 한쪽만 기다리면 다른 판이 «안 왔다»는 시간 초과로 죽어 무엇이 틀렸는지가 값으로 안
 * 남는다.
 */
async function answerOf(probe: WsProbe, clientOpId: string): Promise<Record<string, unknown>> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    const frame = probe.received.find(
      (entry) =>
        (entry.type === 'patch-ack' || entry.type === 'patch-error') && (entry as { clientOpId?: string }).clientOpId === clientOpId,
    )
    if (frame !== undefined) return frame as unknown as Record<string, unknown>
    if (probe.closeInfo !== null) return { type: 'closed', ...probe.closeInfo }
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  throw new Error(`${clientOpId} 의 답이 오지 않았습니다: ${JSON.stringify(probe.received)}`)
}

const ADMIN = { id: 's_admin', name: '관리자' }
const GUEST = { id: 's_guest', name: '비로그인' }

/**
 * ```
 * n_root
 *   n_a
 *   n_b   n_b1
 * ```
 * 편집자 둘(bora · dahye). 문서는 `PUT …/schema` 로 세우고 이력은 seq 1 에서 시작한다.
 */
async function board(ctx: RealApiContext) {
  const bora = await signup(ctx)
  const dahye = await signup(ctx)
  const project = await createProject(ctx, bora.cookie)
  await addMember(ctx, project.id, dahye.user.id, 'editor')
  const menu = await createMenuNode(ctx, bora.cookie, project.id)
  const page = await createPage(ctx, bora.cookie, project.id, menu.id)
  const base = `/api/projects/${project.id}/pages/${page.id}`
  const put = await ctx.app.inject({
    method: 'PUT',
    url: `${base}/schema`,
    cookies: bora.cookie,
    payload: {
      schema: {
        version: 4,
        root: {
          id: 'n_root',
          type: 'Page',
          children: [
            { id: 'n_a', type: 'Section', children: [] },
            { id: 'n_b', type: 'Section', children: [{ id: 'n_b1', type: 'Text', props: {} }] },
          ],
        },
      },
    } as never,
  })
  if (put.statusCode !== 200) throw new Error(`픽스처 PUT 실패 (${put.statusCode}): ${put.body}`)
  return { bora, dahye, project, page, base }
}

type Board = Awaited<ReturnType<typeof board>>

async function patch(ctx: RealApiContext, fx: Board, who: Board['bora'], baseSeq: number, ops: PatchOp[]) {
  const res = await ctx.app.inject({ method: 'PATCH', url: `${fx.base}/ops`, cookies: who.cookie, payload: { baseSeq, ops } })
  return {
    status: res.statusCode,
    body: res.json() as { seq?: number; inverse?: PatchOp[]; error?: { code?: string; issues?: unknown[] } },
  }
}

async function saved(ctx: RealApiContext, fx: Board): Promise<{ viewStates?: unknown; root: { children?: Array<{ id: string }> } }> {
  const res = await ctx.app.inject({ method: 'GET', url: fx.base, cookies: fx.bora.cookie })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { schema: { viewStates?: unknown; root: { children?: Array<{ id: string }> } } }).schema
}

describe('상태 목록 — 문서 경로 편집', () => {
  it('REST — 목록을 만들고 · 더하고 · 이름을 바꾸고 · 옮기고 · 빼고, 각 편집의 역연산으로 되돌린다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)

      const created = await patch(ctx, fx, fx.bora, 1, [{ op: 'add', path: '/viewStates', value: [ADMIN] }])
      expect(created.status, JSON.stringify(created.body)).toBe(200)
      // 목록째를 빼는 역연산은 그 목록 값 전부를 `test`로 싣는다(`guardViewStateOps`) — 그 사이 남이 더한 상태까지 빼지 않게.
      expect(created.body.inverse).toEqual([
        { op: 'test', path: '/viewStates', value: [ADMIN] },
        { op: 'remove', path: '/viewStates' },
      ])
      expect((await saved(ctx, fx)).viewStates).toEqual([ADMIN])

      expect((await patch(ctx, fx, fx.bora, 2, [{ op: 'add', path: '/viewStates/-', value: GUEST }])).status).toBe(200)
      expect((await patch(ctx, fx, fx.bora, 3, [{ op: 'replace', path: '/viewStates/0/name', value: '운영자' }])).status).toBe(200)
      const moved = await patch(ctx, fx, fx.bora, 4, [{ op: 'move', from: '/viewStates/1', path: '/viewStates/0' }])
      expect(moved.status).toBe(200)
      expect((await saved(ctx, fx)).viewStates).toEqual([GUEST, { id: 's_admin', name: '운영자' }])

      const removed = await patch(ctx, fx, fx.bora, 5, [{ op: 'remove', path: '/viewStates/1' }])
      expect(removed.status).toBe(200)
      expect((await saved(ctx, fx)).viewStates).toEqual([GUEST])

      // 되돌리기 — 각 편집의 역연산을 거꾸로 보낸다(개인 되돌리기가 하는 것과 같은 길).
      expect((await patch(ctx, fx, fx.bora, 6, removed.body.inverse!)).status).toBe(200)
      expect((await patch(ctx, fx, fx.bora, 7, moved.body.inverse!)).status).toBe(200)
      expect((await saved(ctx, fx)).viewStates).toEqual([{ id: 's_admin', name: '운영자' }, GUEST])
      expect((await patch(ctx, fx, fx.bora, 8, [{ op: 'remove', path: '/viewStates/1' }])).status).toBe(200)
      expect((await patch(ctx, fx, fx.bora, 9, [{ op: 'replace', path: '/viewStates/0/name', value: ADMIN.name }])).status).toBe(200)
      expect((await patch(ctx, fx, fx.bora, 10, created.body.inverse!)).status).toBe(200)
      expect(await saved(ctx, fx)).not.toHaveProperty('viewStates')
    })
  })

  it('REST — 모양이 틀린 목록은 422 이고 저장되지 않는다(500 없음)', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      expect((await patch(ctx, fx, fx.bora, 1, [{ op: 'add', path: '/viewStates', value: [ADMIN] }])).status).toBe(200)
      const bad: [string, PatchOp[]][] = [
        ['이름 겹침', [{ op: 'add', path: '/viewStates/-', value: { id: 's_2', name: ADMIN.name } }]],
        ['31자', [{ op: 'replace', path: '/viewStates/0/name', value: '가'.repeat(31) }]],
        ['id default', [{ op: 'add', path: '/viewStates/-', value: { id: 'default', name: '기본 2' } }]],
        ['배열이 아님', [{ op: 'replace', path: '/viewStates', value: { s: 1 } }]],
        ['모르는 키', [{ op: 'add', path: '/viewStates/0/role', value: 'admin' }]],
        ['외짝 서로게이트', [{ op: 'replace', path: '/viewStates/0/name', value: 'a\ud800' }]],
      ]
      for (const [label, ops] of bad) {
        const res = await patch(ctx, fx, fx.bora, 2, ops)
        expect(res.status, label).toBe(422)
        expect(res.body.error?.issues?.[0], label).toMatchObject({ code: 'bad-document' })
      }
      expect((await saved(ctx, fx)).viewStates).toEqual([ADMIN])
    })
  })

  it('REST — `/viewStates` 밖의 문서 경로는 여전히 400 이다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      for (const path of ['/viewStatesX', '/view', '/states', '/viewstates']) {
        const res = await patch(ctx, fx, fx.bora, 1, [{ op: 'add', path, value: [] }])
        expect(res.status, path).toBe(400)
      }
      const from = await ctx.app.inject({
        method: 'PATCH',
        url: `${fx.base}/ops`,
        cookies: fx.bora.cookie,
        payload: { baseSeq: 1, ops: [{ op: 'move', from: '/viewStatesX', path: '/viewStates' }] },
      })
      expect(from.statusCode).toBe(400)
    })
  })

  it('WS `patch` — 목록 편집이 patch-ack 으로 커밋되고 룸의 다른 연결이 그 ops 를 받는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const author = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))
      const ops: PatchOp[] = [{ op: 'add', path: '/viewStates', value: [ADMIN, GUEST] }]

      author.send(JSON.stringify({ type: 'patch', pageId: fx.page.id, clientOpId: 'op_states', baseSeq: 1, ops }))
      expect(await answerOf(author, 'op_states')).toMatchObject({ type: 'patch-ack', clientOpId: 'op_states', seq: 2 })
      const frame = await watcher.waitFor('page-changed')
      expect(frame).toMatchObject({ pageId: fx.page.id, seq: 2, ops })
      expect((await saved(ctx, fx)).viewStates).toEqual([ADMIN, GUEST])
    })
  })

  it('이력 — `GET …/revisions?mine=true` 의 역연산이 목록 편집을 되돌린다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      expect((await patch(ctx, fx, fx.bora, 1, [{ op: 'add', path: '/viewStates', value: [ADMIN] }])).status).toBe(200)
      const res = await ctx.app.inject({ method: 'GET', url: `${fx.base}/revisions?mine=true`, cookies: fx.bora.cookie })
      expect(res.statusCode, res.body).toBe(200)
      const head = (res.json() as { seq: number; ops: PatchOp[]; inverse: PatchOp[] }[]).find((revision) => revision.seq === 2)!
      expect(head.ops).toEqual([{ op: 'add', path: '/viewStates', value: [ADMIN] }])
      expect((await patch(ctx, fx, fx.bora, 2, head.inverse)).status).toBe(200)
      expect(await saved(ctx, fx)).not.toHaveProperty('viewStates')
    })
  })
})

describe('상태 목록 — 잠금 판정(Review Focus 1)', () => {
  it('남이 페이지 뿌리 · 노드를 잡고 있어도 목록 편집은 지나간다 — REST · WS', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const dahyeTab = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))
      dahyeTab.send(JSON.stringify({ type: 'lock', pageId: fx.page.id, nodeId: 'n_root' }))
      await locksWith(dahyeTab, 'n_root')

      // 카나리아 — 그 잠금이 서 있다: 페이지 안 노드를 고치는 편집은 막힌다.
      expect((await patch(ctx, fx, fx.bora, 1, [{ op: 'add', path: '/root/children/0/alias', value: '머리' }])).status).toBe(423)

      expect((await patch(ctx, fx, fx.bora, 1, [{ op: 'add', path: '/viewStates', value: [ADMIN] }])).status).toBe(200)
      expect((await patch(ctx, fx, fx.bora, 2, [{ op: 'replace', path: '/viewStates/0/name', value: '운영자' }])).status).toBe(200)

      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      boraTab.send(
        JSON.stringify({
          type: 'patch',
          pageId: fx.page.id,
          clientOpId: 'op_ws_states',
          baseSeq: 3,
          ops: [{ op: 'add', path: '/viewStates/-', value: GUEST }],
        }),
      )
      expect(await answerOf(boraTab, 'op_ws_states')).toMatchObject({ type: 'patch-ack', clientOpId: 'op_ws_states', seq: 4 })
      expect((await saved(ctx, fx)).viewStates).toEqual([{ id: 's_admin', name: '운영자' }, GUEST])
    })
  }, 30_000)

  it('같은 묶음 안의 노드 연산은 그대로 판정한다 — 남이 잡은 노드를 지우는 묶음은 목록 편집째 423 이다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const dahyeTab = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))
      dahyeTab.send(JSON.stringify({ type: 'lock', pageId: fx.page.id, nodeId: 'n_b1' }))
      await locksWith(dahyeTab, 'n_b1')

      const res = await patch(ctx, fx, fx.bora, 1, [
        { op: 'add', path: '/viewStates', value: [ADMIN] },
        { op: 'remove', path: '/root/children/1' },
      ])
      expect(res.status).toBe(423)
      const doc = await saved(ctx, fx)
      expect(doc).not.toHaveProperty('viewStates')
      expect(doc.root.children?.map((child) => child.id)).toEqual(['n_a', 'n_b'])

      // 잡히지 않은 노드를 지우는 같은 꼴의 묶음은 지나간다 — 막은 것이 목록 편집이 아니라 노드 연산이다.
      expect(
        (
          await patch(ctx, fx, fx.bora, 1, [
            { op: 'add', path: '/viewStates', value: [ADMIN] },
            { op: 'remove', path: '/root/children/0' },
          ])
        ).status,
      ).toBe(200)
    })
  }, 30_000)
})
