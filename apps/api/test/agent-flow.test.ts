/**
 * **설계서 「스킬」의 흐름을 서버 쪽에서 잰다** — 에이전트가 읽고, 고치고, 회신하는 길.
 *
 * ---
 *
 * # 왜 `apps/api`에 있나
 *
 * `packages/mcp`의 케이스는 가짜 서버를 본다. **여기서 재는 것은 서버가 실제로 하는 일의
 * 연쇄**다 — 코멘트가 `head_seq`를 올리고, 그 뒤 옛 `baseSeq`의 편집이 409를 받는 것.
 * 그 연쇄는 **한 Postgres 위에서만** 관측된다.
 *
 * # 무엇이 걸려 있나 — 도구가 이 값을 싣는 근거
 *
 * 「MCP 도구」 절의 `add_comment`가 응답에 `documentChanged`·`headSeq`를 싣는 이유가 여기 있다.
 * **에이전트가 자기 코멘트 때문에 다음 편집이 409가 된다는 것을 모르면** 원인을 남의 편집으로
 * 읽고 문서를 통째로 다시 읽는다 — 그리고 그 판단은 조용히 틀린다.
 *
 * **두 갈래가 갈린다:** 번호가 없던 노드면 문서가 바뀌고, 이미 번호가 있으면 안 바뀐다.
 * 갈림이 없으면 도구가 `documentChanged`를 실을 이유도 없다 — **그래서 둘 다 든다.**
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PatchOp } from '@wirebound/schema'
import {
  createMenuNode,
  createPage,
  createProject,
  getTestDb,
  resetRealData,
  signup,
  withRealApi,
  type RealApiContext,
  type SignedUpUser,
} from './helpers'
import { WsProbe, joinRoom, locksWith } from './ws-client'

const db = getTestDb()

beforeEach(resetRealData)
afterEach(resetRealData)

const opened: WsProbe[] = []
afterEach(() => {
  for (const probe of opened) probe.close()
  opened.length = 0
})

interface Fixture {
  owner: SignedUpUser
  projectId: string
  pageId: string
  token: string
  /** 문서의 노드 둘. 둘 다 번호가 없다. */
  nodes: { a: string; b: string }
}

async function fixture(ctx: RealApiContext): Promise<Fixture> {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '관리자' })
  const page = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '목록' })

  const put = await ctx.app.inject({
    method: 'PUT',
    url: `/api/projects/${project.id}/pages/${page.id}/schema`,
    cookies: owner.cookie,
    payload: {
      schema: {
        version: 5,
        root: {
          id: 'n_root',
          type: 'Page',
          children: [
            { id: 'n_a', type: 'Text', props: {} },
            { id: 'n_b', type: 'Text', props: {} },
          ],
        },
      },
    } as never,
  })
  if (put.statusCode !== 200) throw new Error(`PUT schema 픽스처가 실패했습니다: ${put.body}`)

  const issued = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${project.id}/tokens`,
    cookies: owner.cookie,
    payload: { name: '에이전트' },
  })
  if (issued.statusCode !== 201) throw new Error(`토큰 발급 픽스처가 실패했습니다: ${issued.body}`)

  return {
    owner,
    projectId: project.id,
    pageId: page.id,
    token: (issued.json() as { value: string }).value,
    nodes: { a: 'n_a', b: 'n_b' },
  }
}

/** 에이전트가 부르는 모양 그대로 — 토큰 + `x-wb-client: mcp`. */
function agent(fx: Fixture): Record<string, string> {
  return { authorization: `Bearer ${fx.token}`, 'x-wb-client': 'mcp' }
}

async function headSeqOf(pageId: string): Promise<number> {
  const row = await db.selectFrom('pages').select('head_seq').where('id', '=', pageId).executeTakeFirstOrThrow()
  return Number(row.head_seq)
}

let counter = 0
function addNode(): PatchOp[] {
  counter += 1
  return [{ op: 'add', path: '/root/children/-', value: { id: `n_flow${counter}`, type: 'Text', props: {} } } as PatchOp]
}

async function comment(ctx: RealApiContext, fx: Fixture, nodeId: string, body: string) {
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/comments`,
    headers: agent(fx),
    payload: { nodeId, body },
  })
  if (res.statusCode !== 201) throw new Error(`코멘트가 실패했습니다 (${res.statusCode}): ${res.body}`)
  return res.json() as { marker: number; seq: number; markerOps: unknown[] }
}

async function patch(ctx: RealApiContext, fx: Fixture, baseSeq: number) {
  return ctx.app.inject({
    method: 'PATCH',
    url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/ops`,
    headers: agent(fx),
    payload: { baseSeq, ops: addNode() },
  })
}

describe('코멘트가 문서를 바꾼다 — 그것을 숨기면 다음 편집이 조용히 409다', () => {
  it('번호가 없던 노드에 달면 `markerOps` 가 서고 `head_seq` 가 오른다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const before = await headSeqOf(fx.pageId)

      const said = await comment(ctx, fx, fx.nodes.a, '정렬 기준을 정해야 합니다')

      expect(said.marker).toBe(1)
      expect(said.markerOps.length).toBeGreaterThan(0)
      expect(await headSeqOf(fx.pageId)).toBe(before + 1)
      expect(said.seq).toBe(before + 1)
    })
  }, 30_000)

  it('그 뒤 **옛 `baseSeq`** 로 patch 하면 409다 — 원인이 자기 코멘트다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const before = await headSeqOf(fx.pageId)

      await comment(ctx, fx, fx.nodes.a, '정렬 기준을 정해야 합니다')
      const res = await patch(ctx, fx, before)

      expect(res.statusCode).toBe(409)
      expect((res.json() as { error: { code: string } }).error.code).toBe('conflict')
    })
  }, 30_000)

  it('새 `seq` 로 다시 하면 통한다 — 대조. 막힌 것이 아니라 낡았던 것이다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const said = await comment(ctx, fx, fx.nodes.a, '정렬 기준을 정해야 합니다')

      const res = await patch(ctx, fx, said.seq)

      expect(res.statusCode, res.body).toBe(200)
    })
  }, 30_000)

  it('이미 번호가 있는 노드면 문서가 **안 바뀌고** 옛 `baseSeq` 가 그대로 유효하다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      // 첫 코멘트가 번호를 만든다.
      await comment(ctx, fx, fx.nodes.a, '첫째')
      const mid = await headSeqOf(fx.pageId)

      const second = await comment(ctx, fx, fx.nodes.a, '둘째')

      // **문서를 안 바꿨다** — 그래서 revision 도 없고 `seq` 도 안 올랐다.
      expect(second.markerOps).toEqual([])
      expect(second.seq).toBe(mid)
      expect(await headSeqOf(fx.pageId)).toBe(mid)

      const res = await patch(ctx, fx, mid)
      expect(res.statusCode, res.body).toBe(200)
    })
  }, 30_000)

  it('다른 노드에 달면 다시 문서가 바뀐다 — 노드마다 번호가 하나다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      await comment(ctx, fx, fx.nodes.a, '첫째')
      const mid = await headSeqOf(fx.pageId)

      const other = await comment(ctx, fx, fx.nodes.b, '둘째 노드')

      expect(other.marker).toBe(2)
      expect(other.markerOps.length).toBeGreaterThan(0)
      expect(await headSeqOf(fx.pageId)).toBe(mid + 1)
    })
  }, 30_000)
})

/**
 * **설계서 「LLM 편집 경로」의 잠금 판정 둘.**
 *
 * *"자기 잠금에 자기 토큰이 안 막힌다"*는 산문(`apps/api/README.md`의 *"소유자 판정은
 * 사람 단위"*)만으로는 토큰으로 재지 않는다 — `lock-census.test.ts`의 같은 케이스는
 * **세션 쿠키**로 잰다. 토큰 갈래는 이 절이 잰다.
 *
 * **둘 다 들어야 한다.** 하나만 있으면 나머지가 조용한 성질이 된다: 자기 잠금만 재면
 * *"잠금을 아예 안 본다"*와 구별되지 않고, 남의 잠금만 재면 *"토큰은 언제나 막힌다"*와
 * 구별되지 않는다.
 */
describe('설계서 「LLM 편집 경로」의 잠금 — 에이전트는 걸지 않지만 남의 잠금에는 막힌다', () => {
  /**
   * 잠긴 서브트리 **안**을 건드리는 편집. `n_a`가 그 자리다.
   *
   * **`props`를 빈 것으로 갈아 끼운다** — 값이 무엇인지는 여기서 재는 것이 아니고, 카탈로그
   * 규칙에 걸리면 422가 나와 **잠금 판정과 검증 실패가 섞인다**(실측: `Text`의 `props`에
   * `text`를 넣으면 `invalid-props`다).
   */
  const insideLock: PatchOp[] = [{ op: 'replace', path: '/root/children/0/props', value: {} } as PatchOp]

  it('발급자가 다른 탭에서 잡은 잠금에 **자기 토큰은 안 막힌다**', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)

      // **발급자 본인이 다른 탭(세션)으로 잠근다.** 토큰은 그 사람의 자격을 상속한다(설계서 「권한 모델」).
      const tab = await joinRoom(ctx.port, fx.projectId, fx.owner.cookie.wb_session)
      opened.push(tab)
      tab.send(JSON.stringify({ type: 'lock', pageId: fx.pageId, nodeId: fx.nodes.a }))
      await locksWith(tab, fx.nodes.a)

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/ops`,
        headers: agent(fx),
        payload: { baseSeq: await headSeqOf(fx.pageId), ops: insideLock },
      })

      // **에이전트는 그 사람의 연장이다** — 자기 잠금에 자기가 막히면 에이전트를 쓰는
      // 내내 잠금을 풀어야 한다.
      expect(res.statusCode, res.body).toBe(200)
    })
  }, 30_000)

  it('**남이 잡은 잠금에는 막힌다** — 423이고 누가 잡고 있는지를 말한다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)

      const holder = await signup(ctx)
      const added = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.projectId}/members`,
        cookies: fx.owner.cookie,
        payload: { email: holder.user.email, role: 'editor' },
      })
      expect(added.statusCode, added.body).toBe(201)

      const tab = await joinRoom(ctx.port, fx.projectId, holder.cookie.wb_session)
      opened.push(tab)
      tab.send(JSON.stringify({ type: 'lock', pageId: fx.pageId, nodeId: fx.nodes.a }))
      await locksWith(tab, fx.nodes.a)

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/ops`,
        headers: agent(fx),
        payload: { baseSeq: await headSeqOf(fx.pageId), ops: insideLock },
      })

      expect(res.statusCode).toBe(423)
      const error = (res.json() as { error: { code: string; message: string } }).error
      expect(error.code).toBe('locked')
      // **누가 잡고 있는지가 문장에 있다** — 배지를 못 보는 클라이언트에게는 이것이 전부다.
      expect(error.message).toContain(holder.user.name)
    })
  }, 30_000)

  it('잠금이 없으면 안 막힌다 — 대조. 위 423 이 *"토큰은 언제나 막힌다"* 가 아니다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/ops`,
        headers: agent(fx),
        payload: { baseSeq: await headSeqOf(fx.pageId), ops: insideLock },
      })
      expect(res.statusCode, res.body).toBe(200)
    })
  }, 30_000)
})
