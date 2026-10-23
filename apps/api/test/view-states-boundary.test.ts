/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withRealApi`를 쓴다.
 *
 * 화면 상태가 저장 경계를 지나는가 — 문서를 통째로 갈아 끼우는 세 길(`PUT …/schema` · 페이지 JSON 가져오기 · 스냅샷 복원)이 상태 목록 ·
 * 노드 보임을 싣고, **판 1 문서(상태 영역)는 세 길 모두 판 2 로 옮겨 선다**(계획 Review Focus 3 · `migratePageDocument`), 비튼 값은
 * 클라이언트 오류(500 없음)이고, 상태 삭제의 연쇄(보임째)가 WS 편집 하나로 커밋되며 남이 잡은 노드에 막히는가(설계 spec
 * `docs/superpowers/specs/2026-10-18-modules-states-layout-design.md` 「C3」 · 「C4」). 편집 길(`/viewStates/…` 의 REST · WS · 되돌리기 ·
 * 잠금)은 `view-states-path.test.ts` 가 갖는다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WIREBOUND_PAGE_VERSION, applyOps, removeViewStateOps, type PageDocument, type PatchOp } from '@wirebound/schema'
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

const ADMIN = { id: 's_admin', name: '관리자' }
const GUEST = { id: 's_guest', name: '비로그인' }

/** 상태 둘 · 기본 «보기»(관리자에서 숨김) · 관리자 «승인». */
function statefulDoc(): PageDocument {
  return {
    version: 3,
    // 사본이다 — 케이스가 목록을 비틀어도 다음 케이스의 문서에 새지 않는다.
    viewStates: [{ ...ADMIN }, { ...GUEST }],
    root: {
      id: 'n_root',
      type: 'Page',
      children: [
        { id: 'n_head', type: 'Text', props: { content: '머리' } },
        { id: 'n_view', type: 'Button', props: { label: '보기' }, visibility: { mode: 'except', states: ['s_admin'] } },
        { id: 'n_ok', type: 'Button', props: { label: '승인' }, visibility: { mode: 'only', states: ['s_admin'] } },
      ],
    },
  }
}

/**
 * 같은 화면의 **판 1 문서** — 상태 영역 하나(기본 «보기» · 관리자 «승인»). 판 2 로 옮기면 `statefulDoc()` 의 화면이다. 들어오는 경계는 판 3 만
 * 받는다(판 2 → 3 은 DB 마이그레이션 `0028` 에만 있다) — 아래 케이스가 그 거절을 잰다.
 */
function legacyDoc(): unknown {
  return {
    version: 1,
    viewStates: [{ ...ADMIN }, { ...GUEST }],
    root: {
      id: 'n_root',
      type: 'Page',
      children: [
        { id: 'n_head', type: 'Text', props: { content: '머리' } },
        {
          id: 'n_sw',
          type: 'StateSwitch',
          children: [
            {
              id: 'n_c0',
              type: 'StateCase',
              props: { state: 'default' },
              children: [{ id: 'n_view', type: 'Button', props: { label: '보기' } }],
            },
            {
              id: 'n_c1',
              type: 'StateCase',
              props: { state: 's_admin' },
              children: [{ id: 'n_ok', type: 'Button', props: { label: '승인' } }],
            },
          ],
        },
      ],
    },
  }
}

async function board(ctx: RealApiContext) {
  const owner = await signup(ctx)
  const peer = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  await addMember(ctx, project.id, peer.user.id, 'editor')
  const menu = await createMenuNode(ctx, owner.cookie, project.id)
  const page = await createPage(ctx, owner.cookie, project.id, menu.id)
  return { owner, peer, project, menu, page, base: `/api/projects/${project.id}/pages/${page.id}` }
}

type Board = Awaited<ReturnType<typeof board>>

async function put(ctx: RealApiContext, fx: Board, schema: unknown) {
  return ctx.app.inject({ method: 'PUT', url: `${fx.base}/schema`, cookies: fx.owner.cookie, payload: { schema } as never })
}

async function read(ctx: RealApiContext, fx: Board, pageId = fx.page.id): Promise<{ schema: PageDocument; headSeq: number }> {
  const res = await ctx.app.inject({ method: 'GET', url: `/api/projects/${fx.project.id}/pages/${pageId}`, cookies: fx.owner.cookie })
  expect(res.statusCode, res.body).toBe(200)
  return res.json() as { schema: PageDocument; headSeq: number }
}

describe('PUT …/schema — 통째 교체가 상태 목록을 싣는다', () => {
  it('상태 목록 · 보임이 든 문서를 저장하고 되읽는다 · 룸의 다른 연결이 받은 ops 를 옛 문서에 적용하면 새 문서다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const before = (await read(ctx, fx)).schema
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.peer.cookie.wb_session))

      const res = await put(ctx, fx, statefulDoc())
      expect(res.statusCode, res.body).toBe(200)
      expect((await read(ctx, fx)).schema).toEqual(statefulDoc())

      const frame = (await watcher.waitFor('page-changed')) as unknown as { ops: PatchOp[] }
      expect(applyOps(before, frame.ops)).toEqual(statefulDoc())
    })
  })

  it('목록 없는 문서로 갈아 끼우면 목록이 빠진다 — 옛 목록이 남지 않는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      expect((await put(ctx, fx, statefulDoc())).statusCode).toBe(200)
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.peer.cookie.wb_session))
      const stateful = (await read(ctx, fx)).schema

      const plain = { version: 3, root: { id: 'n_root', type: 'Page', children: [] } }
      const res = await put(ctx, fx, plain)
      expect(res.statusCode, res.body).toBe(200)
      expect((await read(ctx, fx)).schema).toEqual(plain)
      const frame = (await watcher.waitFor('page-changed')) as unknown as { ops: PatchOp[] }
      expect(applyOps(stateful, frame.ops)).toEqual(plain)
    })
  })

  it.each<[string, (doc: PageDocument) => void]>([
    ['이름 31자', (doc) => (doc.viewStates![0]!.name = '가'.repeat(31))],
    ['이름 겹침', (doc) => (doc.viewStates![1]!.name = ADMIN.name)],
    ['21개', (doc) => (doc.viewStates = Array.from({ length: 21 }, (_, i) => ({ id: `s_${i}`, name: `상태 ${i}` })))],
    ['id 가 default', (doc) => (doc.viewStates![0]!.id = 'default')],
    ['외짝 서로게이트', (doc) => (doc.viewStates![0]!.name = 'a\ud800')],
    ['목록이 배열이 아님', (doc) => ((doc as { viewStates: unknown }).viewStates = { s: 1 })],
  ])('봉투를 어긴 목록(%s)은 400 이고 저장되지 않는다', async (_label, twist) => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const doc = statefulDoc()
      twist(doc)
      const res = await put(ctx, fx, doc)
      expect(res.statusCode, res.body).toBe(400)
      expect((await read(ctx, fx)).schema).not.toHaveProperty('viewStates')
    })
  })

  it.each<[string, (doc: PageDocument) => void]>([
    ['보임 states 빈 배열', (doc) => (doc.root.children![2]!.visibility = { mode: 'only', states: [] })],
    ['보임 겹침', (doc) => (doc.root.children![2]!.visibility = { mode: 'only', states: ['s_admin', 's_admin'] })],
    ['모르는 mode', (doc) => ((doc.root.children![2] as { visibility: unknown }).visibility = { mode: 'hide', states: ['s_admin'] })],
    ['부모 고리', (doc) => ((doc.viewStates![0]!.parent = 's_guest'), (doc.viewStates![1]!.parent = 's_admin'))],
  ])('봉투를 어긴 보임 · 트리(%s)는 400 이고 저장되지 않는다', async (_label, twist) => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const doc = statefulDoc()
      twist(doc)
      const res = await put(ctx, fx, doc)
      expect(res.statusCode, res.body).toBe(400)
      expect((await read(ctx, fx)).schema).not.toHaveProperty('viewStates')
    })
  })

  it('판 1 문서(상태 영역)를 PUT 하면 400 이고 저장되지 않는다 — 런타임은 판 3 에 못 올린다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const before = (await read(ctx, fx)).schema
      const res = await put(ctx, fx, legacyDoc())
      expect(res.statusCode, res.body).toBe(400)
      expect(res.body).toContain('버전 2에서 올릴 마이그레이션이 없습니다')
      expect((await read(ctx, fx)).schema).toEqual(before)
    })
  })

  it('걷은 상태 영역을 판 3 문서에 실으면 422 unknown-type 이다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const doc = statefulDoc()
      doc.root.children!.push({ id: 'n_sw', type: 'StateSwitch', children: [] })
      const res = await put(ctx, fx, doc)
      expect(res.statusCode, res.body).toBe(422)
      expect((res.json() as { error: { issues: { code: string }[] } }).error.issues.map((issue) => issue.code)).toContain('unknown-type')
    })
  })
})

describe('페이지 JSON — 내보낸 파일 · 가져오기가 상태 목록을 싣는다', () => {
  it.each<[string, () => unknown]>([['판 3 파일', statefulDoc]])(
    '%s — 가져온 페이지가 파일의 상태 목록 · 보임을 갖고 노드 id 만 새로 짓는다(보임의 상태 id 는 그대로)',
    async (_label, schema) => {
      await withRealApi(async (ctx) => {
        const fx = await board(ctx)
        const res = await ctx.app.inject({
          method: 'POST',
          url: `/api/projects/${fx.project.id}/pages/import`,
          cookies: fx.owner.cookie,
          payload: {
            menuNodeId: fx.menu.id,
            file: { wireboundVersion: WIREBOUND_PAGE_VERSION, page: { title: '상태 페이지' }, schema: schema(), comments: [] },
          } as never,
        })
        expect(res.statusCode, res.body).toBe(201)
        const pageId = (res.json() as { page: { id: string } }).page.id
        const saved = (await read(ctx, fx, pageId)).schema
        expect(saved.version).toBe(3)
        expect(saved.viewStates).toEqual([ADMIN, GUEST])
        expect(saved.root.children!.map((child) => [child.type, child.visibility ?? null])).toEqual([
          ['Text', null],
          ['Button', { mode: 'except', states: ['s_admin'] }],
          ['Button', { mode: 'only', states: ['s_admin'] }],
        ])
        expect(saved.root.children!.map((child) => child.id)).not.toContain('n_ok')
      })
    },
  )

  it('판 1 파일(상태 영역)은 400 이고 페이지가 남지 않는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.project.id}/pages/import`,
        cookies: fx.owner.cookie,
        payload: {
          menuNodeId: fx.menu.id,
          file: { wireboundVersion: WIREBOUND_PAGE_VERSION, page: { title: '옛 파일' }, schema: legacyDoc(), comments: [] },
        } as never,
      })
      expect(res.statusCode, res.body).toBe(400)
      expect(res.body).toContain('버전 2에서 올릴 마이그레이션이 없습니다')
      const rows = await ctx.db.selectFrom('pages').select('id').where('project_id', '=', fx.project.id).execute()
      expect(rows).toHaveLength(1)
    })
  })

  it('봉투를 어긴 목록이 든 파일은 400 이고 페이지가 남지 않는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const doc = statefulDoc()
      doc.viewStates![1]!.name = ADMIN.name
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.project.id}/pages/import`,
        cookies: fx.owner.cookie,
        payload: {
          menuNodeId: fx.menu.id,
          file: { wireboundVersion: WIREBOUND_PAGE_VERSION, page: { title: '나쁜 파일' }, schema: doc, comments: [] },
        } as never,
      })
      expect(res.statusCode, res.body).toBe(400)
      const rows = await ctx.db.selectFrom('pages').select('id').where('project_id', '=', fx.project.id).execute()
      expect(rows).toHaveLength(1)
    })
  })
})

describe('스냅샷 복원이 상태 목록을 되돌린다', () => {
  it('얼린 뒤 상태를 지운 페이지를 복원하면 목록 · 보임 · 노드가 돌아온다 · 목록이 없던 판으로 복원하면 목록이 빠진다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const snap = async (tag: string): Promise<string> => {
        const res = await ctx.app.inject({
          method: 'POST',
          url: `/api/projects/${fx.project.id}/snapshots`,
          cookies: fx.owner.cookie,
          payload: { tag },
        })
        expect(res.statusCode, res.body).toBe(201)
        return (res.json() as { id: string }).id
      }
      const restore = async (id: string) => {
        const res = await ctx.app.inject({
          method: 'POST',
          url: `/api/projects/${fx.project.id}/snapshots/${id}/restore`,
          cookies: fx.owner.cookie,
        })
        expect(res.statusCode, res.body).toBe(200)
      }
      const plain = await snap('목록 없음')
      expect((await put(ctx, fx, statefulDoc())).statusCode).toBe(200)
      const stateful = await snap('상태 둘')

      const now = await read(ctx, fx)
      const { ops } = removeViewStateOps(now.schema, 's_admin')!
      const removed = await ctx.app.inject({
        method: 'PATCH',
        url: `${fx.base}/ops`,
        cookies: fx.owner.cookie,
        payload: { baseSeq: now.headSeq, ops },
      })
      expect(removed.statusCode, removed.body).toBe(200)
      expect((await read(ctx, fx)).schema.viewStates).toEqual([GUEST])

      await restore(stateful)
      expect((await read(ctx, fx)).schema).toEqual(statefulDoc())

      await restore(plain)
      expect((await read(ctx, fx)).schema).not.toHaveProperty('viewStates')
    })
  }, 30_000)

  /**
   * 저장된 스냅샷은 DB 마이그레이션(`0028`)이 판 3 으로 옮겼다 — 옮기기를 지나지 않은 판 1 문서는 복원이 올리지 못해 그대로 두고(`currentVersionPages`)
   * 검증이 거절한다. 판 1 의 상태 영역은 `unknown-type`, 판 2 문서면 `bad-document`(«version은 편집으로 바꿀 수 없습니다») 로 같은 422 다.
   */
  it('판 1 문서를 얼린 스냅샷을 복원하면 422 이고 문서가 그대로다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      expect((await put(ctx, fx, statefulDoc())).statusCode).toBe(200)
      const taken = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.project.id}/snapshots`,
        cookies: fx.owner.cookie,
        payload: { tag: '옛 판' },
      })
      expect(taken.statusCode, taken.body).toBe(201)
      const snapshotId = (taken.json() as { id: string }).id
      // 옮기기를 지나지 않은 판 1 문서를 payload 에 심는다 — 런타임 복원은 판 3 만 받는다.
      const row = await ctx.db.selectFrom('snapshots').select('payload').where('id', '=', snapshotId).executeTakeFirstOrThrow()
      const payload = row.payload as unknown as { pages: { id: string; schema: unknown }[] }
      const at = payload.pages.findIndex((page) => page.id === fx.page.id)
      expect(at).toBeGreaterThanOrEqual(0)
      payload.pages[at]!.schema = legacyDoc()
      await ctx.db
        .updateTable('snapshots')
        .set({ payload: JSON.stringify(payload) as never })
        .where('id', '=', snapshotId)
        .execute()

      expect((await put(ctx, fx, { version: 3, root: { id: 'n_root', type: 'Page', children: [] } })).statusCode).toBe(200)
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.project.id}/snapshots/${snapshotId}/restore`,
        cookies: fx.owner.cookie,
      })
      expect(res.statusCode, res.body).toBe(422)
      expect((await read(ctx, fx)).schema).toEqual({ version: 3, root: { id: 'n_root', type: 'Page', children: [] } })
    })
  }, 30_000)
})

describe('상태 삭제의 연쇄 — WS 편집 하나', () => {
  it('상태를 지우는 묶음이 patch-ack 으로 커밋되고 그 상태에서만 보이던 노드가 사라지고 숨김이 걷힌다 · 역연산 한 번에 돌아온다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      expect((await put(ctx, fx, statefulDoc())).statusCode).toBe(200)
      const now = await read(ctx, fx)
      const result = removeViewStateOps(now.schema, 's_admin')!
      const author = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))
      author.send(JSON.stringify({ type: 'patch', pageId: fx.page.id, clientOpId: 'op_drop', baseSeq: now.headSeq, ops: result.ops }))
      const ack = (await author.waitFor('patch-ack')) as unknown as { seq: number; inverse: PatchOp[] }
      const after = (await read(ctx, fx)).schema
      expect(after.viewStates).toEqual([GUEST])
      expect(JSON.stringify(after)).not.toContain('n_ok')
      expect(result.removedNodeIds).toEqual(['n_ok'])
      expect(result.clearedNodeIds).toEqual(['n_view'])
      expect(after.root.children!.find((child) => child.id === 'n_view')).not.toHaveProperty('visibility')

      const undo = await ctx.app.inject({
        method: 'PATCH',
        url: `${fx.base}/ops`,
        cookies: fx.owner.cookie,
        payload: { baseSeq: ack.seq, ops: ack.inverse },
      })
      expect(undo.statusCode, undo.body).toBe(200)
      expect((await read(ctx, fx)).schema).toEqual(statefulDoc())
    })
  })

  it('지우거나 고칠 노드를 남이 잡고 있으면 423 이고 아무것도 안 바꾼다 · 무관한 노드의 잠금은 막지 않는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      expect((await put(ctx, fx, statefulDoc())).statusCode).toBe(200)
      const peerTab = track(await joinRoom(ctx.port, fx.project.id, fx.peer.cookie.wb_session))
      peerTab.send(JSON.stringify({ type: 'lock', pageId: fx.page.id, nodeId: 'n_ok' }))
      await locksWith(peerTab, 'n_ok')

      const now = await read(ctx, fx)
      const { ops } = removeViewStateOps(now.schema, 's_admin')!
      const blocked = await ctx.app.inject({
        method: 'PATCH',
        url: `${fx.base}/ops`,
        cookies: fx.owner.cookie,
        payload: { baseSeq: now.headSeq, ops },
      })
      expect(blocked.statusCode, blocked.body).toBe(423)
      expect((await read(ctx, fx)).schema).toEqual(statefulDoc())

      peerTab.send(JSON.stringify({ type: 'lock', pageId: fx.page.id, nodeId: 'n_head' }))
      await locksWith(peerTab, 'n_head')
      const passed = await ctx.app.inject({
        method: 'PATCH',
        url: `${fx.base}/ops`,
        cookies: fx.owner.cookie,
        payload: { baseSeq: now.headSeq, ops },
      })
      expect(passed.statusCode, passed.body).toBe(200)
    })
  }, 30_000)
})
