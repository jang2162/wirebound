/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withRealApi`를 쓴다.
 *
 * 서버의 2차 방어가 **앞 연산이 민 좌표**의 편집을 바로 판정하는지 입구마다 잰다(C2 리뷰 · `docs/superpowers/plans/2026-09-30-c2-review.md`
 * 발견 1 의 판). 판정은 `@wirebound/schema`의 `lockConflictOfOps`이고 그 뿌리와 순수 판은 `packages/schema/test/lock-shifted-pointers.test.ts`.
 *
 * ---
 *
 * # 편집의 입구마다 한 판
 *
 * 편집이 잠금 판정(`src/lock/check.ts`의 `lockConflictError`)에 닿는 입구는 셋이다 — REST `PATCH …/ops`(세션) · WS `patch` 프레임 ·
 * MCP `patch_page`(`packages/mcp/src/handlers.ts`가 같은 REST `PATCH …/ops`를 토큰으로 부른다 — 여기서는 그 요청 모양 그대로 보낸다).
 * `PUT …/schema`는 `replace /root` 하나라 좌표가 밀리지 않는다(늘 부딪친다).
 *
 * 보라가 `n_b`를 잡고, 다혜(owner — 토큰을 낸다)가 편집한다.
 *
 * ```
 * n_root
 *   n_a      n_a1
 *   n_b      n_b1  n_b2     ← 보라가 잡았다
 *   n_c
 * ```
 */
import type { PatchOp } from '@wirebound/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addMember,
  createMenuNode,
  createPage,
  createProject,
  getTestDb,
  resetRealData,
  signup,
  withRealApi,
  type RealApiContext,
} from './helpers'
import { WsProbe, joinRoom, locksWith } from './ws-client'
import type { ServerFrame } from '../src/ws/protocol'

beforeEach(resetRealData)
afterEach(resetRealData)

const db = getTestDb()
const opened: WsProbe[] = []

afterEach(() => {
  for (const probe of opened) probe.close()
  opened.length = 0
})

async function board(ctx: RealApiContext) {
  const dahye = await signup(ctx)
  const bora = await signup(ctx)
  const project = await createProject(ctx, dahye.cookie)
  await addMember(ctx, project.id, bora.user.id, 'editor')
  const menu = await createMenuNode(ctx, dahye.cookie, project.id)
  const page = await createPage(ctx, dahye.cookie, project.id, menu.id, { title: '함께 고칠 페이지' })

  const put = await ctx.app.inject({
    method: 'PUT',
    url: `/api/projects/${project.id}/pages/${page.id}/schema`,
    cookies: dahye.cookie,
    payload: {
      schema: {
        version: 1,
        root: {
          id: 'n_root',
          type: 'Page',
          children: [
            { id: 'n_a', type: 'Section', children: [{ id: 'n_a1', type: 'Text', props: {} }] },
            {
              id: 'n_b',
              type: 'Section',
              children: [
                { id: 'n_b1', type: 'Text', props: {} },
                { id: 'n_b2', type: 'Text', props: {} },
              ],
            },
            { id: 'n_c', type: 'Section', children: [] },
          ],
        },
      },
    } as never,
  })
  if (put.statusCode !== 200) throw new Error(`픽스처 PUT 실패 (${put.statusCode}): ${put.body}`)

  const issued = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${project.id}/tokens`,
    cookies: dahye.cookie,
    payload: { name: '에이전트' },
  })
  if (issued.statusCode !== 201) throw new Error(`토큰 픽스처 실패 (${issued.statusCode}): ${issued.body}`)
  const token = (issued.json() as { value: string }).value

  const boraTab = await joinRoom(ctx.port, project.id, bora.cookie.wb_session)
  const dahyeTab = await joinRoom(ctx.port, project.id, dahye.cookie.wb_session)
  opened.push(boraTab, dahyeTab)
  boraTab.send(JSON.stringify({ type: 'lock', pageId: page.id, nodeId: 'n_b' }))
  await locksWith(dahyeTab, 'n_b')

  return { dahye, bora, project, page, token, dahyeTab }
}

type Board = Awaited<ReturnType<typeof board>>

async function headSeq(pageId: string): Promise<number> {
  const row = await db.selectFrom('pages').select('head_seq').where('id', '=', pageId).executeTakeFirstOrThrow()
  return Number(row.head_seq)
}

/** 서버 문서의 `n_b` 자식 id — `null`이면 `n_b`가 없다. */
async function childrenOfB(pageId: string): Promise<string[] | null> {
  const row = await db.selectFrom('pages').select('schema').where('id', '=', pageId).executeTakeFirstOrThrow()
  const root = (row.schema as { root: { children: { id: string; children?: { id: string }[] }[] } }).root
  const b = root.children.find((child) => child.id === 'n_b')
  return b === undefined ? null : (b.children ?? []).map((child) => child.id)
}

async function viaSession(ctx: RealApiContext, fx: Board, ops: PatchOp[]): Promise<number> {
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/api/projects/${fx.project.id}/pages/${fx.page.id}/ops`,
    cookies: fx.dahye.cookie,
    payload: { baseSeq: await headSeq(fx.page.id), ops },
  })
  return res.statusCode
}

/** MCP `patch_page`가 보내는 모양 그대로 — 토큰 + `x-wb-client: mcp` · 본문 `{ baseSeq, ops }`. */
async function viaAgent(ctx: RealApiContext, fx: Board, ops: PatchOp[]): Promise<number> {
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/api/projects/${fx.project.id}/pages/${fx.page.id}/ops`,
    headers: { authorization: `Bearer ${fx.token}`, 'x-wb-client': 'mcp' },
    payload: { baseSeq: await headSeq(fx.page.id), ops },
  })
  return res.statusCode
}

async function viaSocket(fx: Board, ops: PatchOp[]): Promise<number> {
  fx.dahyeTab.send(JSON.stringify({ type: 'patch', pageId: fx.page.id, baseSeq: await headSeq(fx.page.id), ops, clientOpId: 'op-shift' }))
  const answered = (): ServerFrame | undefined =>
    fx.dahyeTab.received.find(
      (frame) => (frame.type === 'patch-ack' || frame.type === 'patch-error') && frame.clientOpId === 'op-shift',
    )
  const deadline = Date.now() + 5_000
  while (answered() === undefined) {
    if (Date.now() > deadline) throw new Error('WS patch 의 답이 5s 안에 안 왔다')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  const answer = answered()!
  if (answer.type === 'patch-error') return answer.status
  return 200
}

/** 앞쪽 형제를 뒤쪽의 잠긴 노드 안으로(`move`의 `path`는 뺀 뒤 좌표 — 뺀 뒤 `n_b`는 `/root/children/0`). */
const MOVE_A_INTO_B: PatchOp[] = [{ op: 'move', from: '/root/children/0', path: '/root/children/0/children/-' }]
/** 앞 형제를 지우고, 당겨진 좌표로 잠긴 노드 자신을 지운다. */
const REMOVE_A_THEN_B: PatchOp[] = [
  { op: 'remove', path: '/root/children/0' },
  { op: 'remove', path: '/root/children/0' },
]
/** 앞쪽 형제를 잠긴 노드 **뒤**로 — 뺀 뒤 좌표 `/root/children/1`이 잠긴 노드의 지금 경로와 같다. */
const MOVE_A_AFTER_B: PatchOp[] = [{ op: 'move', from: '/root/children/0', path: '/root/children/1' }]

describe('남의 잠긴 서브트리를 밀린 좌표로 건드리는 편집 — 423 이어야 한다', () => {
  it('REST(세션) — 앞 형제를 잠긴 노드 안으로 옮기기', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const status = await viaSession(ctx, fx, MOVE_A_INTO_B)
      expect({ status, b: await childrenOfB(fx.page.id) }).toEqual({ status: 423, b: ['n_b1', 'n_b2'] })
    })
  }, 30_000)

  it('WS `patch` — 앞 형제를 잠긴 노드 안으로 옮기기', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const status = await viaSocket(fx, MOVE_A_INTO_B)
      expect({ status, b: await childrenOfB(fx.page.id) }).toEqual({ status: 423, b: ['n_b1', 'n_b2'] })
    })
  }, 30_000)

  it('MCP(토큰 · `PATCH …/ops`) — 앞 형제를 지우고 당겨진 좌표로 잠긴 노드 자신을 지우기', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const status = await viaAgent(ctx, fx, REMOVE_A_THEN_B)
      expect({ status, b: await childrenOfB(fx.page.id) }).toEqual({ status: 423, b: ['n_b1', 'n_b2'] })
    })
  }, 30_000)
})

describe('배열 번호를 글자로 달리 쓴 편집 — 적용이 읽는 대로 잰다(C2 리뷰 대응 · 원래 있던 길)', () => {
  // 적용은 배열 번호를 `Number(token)`으로 읽어(`packages/schema/src/patch/pointer.ts`의 `readMember`) `01`이 `1`을 지운다. 판정이
  // 포인터를 글자로 견주면 `01`이 `1`과 안 겹쳐 200 이 나고 `n_b`가 사라진다.
  it('MCP(토큰) — `remove /root/children/01`은 잠긴 `n_b`를 지우는 편집이다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const status = await viaAgent(ctx, fx, [{ op: 'remove', path: '/root/children/01' }])
      expect({ status, b: await childrenOfB(fx.page.id) }).toEqual({ status: 423, b: ['n_b1', 'n_b2'] })
    })
  }, 30_000)
})

describe('남의 잠긴 서브트리를 안 건드리는 옮기기 — 받아야 한다', () => {
  it('REST(세션) — 앞 형제를 잠긴 노드 뒤로 옮기기', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const status = await viaSession(ctx, fx, MOVE_A_AFTER_B)
      expect({ status, b: await childrenOfB(fx.page.id) }).toEqual({ status: 200, b: ['n_b1', 'n_b2'] })
    })
  }, 30_000)
})

/**
 * C2 좁은 반증(`docs/superpowers/plans/2026-09-30-c2-review-2.md`) — 새 판정이 적용과 갈리는 입력이 서버에서 무엇이 되는가.
 * 순수 판의 전수(무작위 묶음 · 객체 정체성 오라클)는 `packages/schema/test/lock-ops-identity.test.ts`.
 */
describe('좁은 반증 — 번호 꼴 · 실패하는 묶음 · op 종류가 서버에서 무엇이 되는가', () => {
  it('WS `patch` — `remove /root/children/+1`(적용은 `Number`로 1)은 잠긴 `n_b`를 지우는 편집이라 423 이다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const status = await viaSocket(fx, [{ op: 'remove', path: '/root/children/+1' }])
      expect({ status, b: await childrenOfB(fx.page.id) }).toEqual({ status: 423, b: ['n_b1', 'n_b2'] })
    })
  }, 30_000)

  it('REST — 실패하는 연산(없는 번호) 뒤에 잠긴 `n_b`를 지우는 묶음은 잠금이 아니라 적용 실패로 거절되고 아무것도 안 바뀐다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const before = await headSeq(fx.page.id)
      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.project.id}/pages/${fx.page.id}/ops`,
        cookies: fx.dahye.cookie,
        payload: {
          baseSeq: before,
          ops: [
            { op: 'remove', path: '/root/children/9' },
            { op: 'remove', path: '/root/children/1' },
          ],
        },
      })
      // 409 는 `patch-failed`다(`src/http/edit-outcome.ts`) — `stale`도 409 라 문장으로 가른다.
      expect({
        status: res.statusCode,
        failed: (res.json() as { error: { message: string } }).error.message.startsWith('편집을 적용할 수 없습니다'),
        b: await childrenOfB(fx.page.id),
        seq: await headSeq(fx.page.id),
      }).toEqual({ status: 409, failed: true, b: ['n_b1', 'n_b2'], seq: before })
    })
  }, 30_000)

  it('REST — 잠긴 `n_b`를 지운 뒤 실패하는 연산이 오는 묶음은 423 이다(실패 앞에서 부딪쳤다)', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const status = await viaSession(ctx, fx, [
        { op: 'remove', path: '/root/children/1' },
        { op: 'remove', path: '/root/children/9' },
      ])
      expect({ status, b: await childrenOfB(fx.page.id) }).toEqual({ status: 423, b: ['n_b1', 'n_b2'] })
    })
  }, 30_000)

  it('REST — 잠긴 `n_b` 자신을 앞으로 옮기기는 423 이다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const status = await viaSession(ctx, fx, [{ op: 'move', from: '/root/children/1', path: '/root/children/0' }])
      expect({ status, b: await childrenOfB(fx.page.id) }).toEqual({ status: 423, b: ['n_b1', 'n_b2'] })
    })
  }, 30_000)

  it.each([
    ['copy', { op: 'copy', from: '/root/children/1', path: '/root/children/0' }],
    ['test', { op: 'test', path: '/root/children/1/id', value: 'n_b' }],
  ])('MCP(토큰) — RFC 6902 의 `%s`은 판정에 닿기 전에 400 이다', async (_name, op) => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const status = await viaAgent(ctx, fx, [op as never])
      expect({ status, b: await childrenOfB(fx.page.id) }).toEqual({ status: 400, b: ['n_b1', 'n_b2'] })
    })
  }, 30_000)
})
