/**
 * **짝 없는 서로게이트는 jsonb 로 가는 입구에서 400 이다 — 500 이 아니다**(`db/nul-guard.ts` 의 `containsLoneSurrogate`).
 *
 * `JSON.stringify` 는 외짝을 이스케이프로 내보내고 Postgres 의 `::jsonb` 캐스팅이 죽는다. 입구는 넷이다 — 편집 `PATCH …/ops`(REST) ·
 * 편집 `patch` 프레임(WS) · `PUT …/schema` · `POST …/modules`(`nodes`). 앞의 둘은 `applyEdit` 8단계(`lone-surrogate`)를 같이 지나고
 * 셋째는 라우트의 앞 검사(그 줄만 지우면 파이프라인이 같은 400 을 낸다 — 라우트 줄의 몫은 «잠금도 트랜잭션도 열기 전에 끝남»이라
 * 상태로는 못 잰다), 모듈은 라우트 검사 + repo 의 마지막 방벽이 지킨다(둘을 다 지워야 500). 모듈 이름도 같은 검사가 거절한다(아래 «이름» 케이스).
 *
 * **텍스트 칸(제목 · 이름 · 코멘트 본문)은 이 파일이 안 지킨다** — `pg` 가 U+FFFD 로 바꿔 쓰므로 죽지 않고 **조용히 바뀐다**(보고에 적었다).
 *
 * **변조와 죽는 케이스**(백업 후 바이트 비교 복원):
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | `applyEdit` 8단계의 서로게이트 줄을 지운다 | REST ops · WS patch(두 케이스가 **함께** — 같은 단계다) |
 * | `routes/modules.ts` 의 `rejectUnstorable` 서로게이트 줄과 `repos/modules.ts` 의 `assertStorable` 서로게이트 줄을 둘 다 지운다 | 모듈 노드 케이스 **혼자**(이름 케이스는 200 · U+FFFD 로 죽는다) |
 * | `containsLoneSurrogate` 를 `false` 로 | 위 전부 + 아래 판정 케이스 |
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { containsLoneSurrogate } from '../src/db/nul-guard'
import { createMenuNode, createPage, createProject, resetRealData, signup, withApi, withRealApi, type TestContext } from './helpers'
import { WsProbe, joinRoom } from './ws-client'

// WS 케이스가 실제로 커밋한다(`withRealApi`) — 남기면 다른 파일의 가입 픽스처가 겹친다.
beforeEach(resetRealData)
afterEach(resetRealData)

const HIGH = String.fromCharCode(0xd800)
const LOW = String.fromCharCode(0xdc00)

async function world(ctx: TestContext) {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '메뉴' })
  const page = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '제목' })
  const P = `/api/projects/${project.id}`
  const head = async () =>
    ((await ctx.app.inject({ method: 'GET', url: `${P}/pages/${page.id}`, cookies: owner.cookie })).json() as { headSeq: number }).headSeq
  return { owner, project, page, P, head }
}

const badSurrogate = { error: { code: 'bad-request', message: '문서에 짝 없는 서로게이트 글자를 포함할 수 없습니다' } }
const addText = (content: string) => [
  { op: 'add', path: '/root/children/-', value: { id: 'n_surrogate', type: 'Text', props: { content } } },
]

describe('판정', () => {
  it('외짝은 값 · 키 · 중첩 어디서든 잡고, 짝을 이룬 것(이모지)은 안 잡는다', () => {
    expect(containsLoneSurrogate(`a${HIGH}b`)).toBe(true)
    expect(containsLoneSurrogate(`a${LOW}b`)).toBe(true)
    expect(containsLoneSurrogate(`${HIGH}${HIGH}${LOW}`)).toBe(true)
    expect(containsLoneSurrogate(`끝${HIGH}`)).toBe(true)
    expect(containsLoneSurrogate({ [`k${HIGH}`]: 1 })).toBe(true)
    expect(containsLoneSurrogate([{ a: [`x${LOW}`] }])).toBe(true)
    expect(containsLoneSurrogate('😀 가나다 \u{1F600}')).toBe(false)
    expect(containsLoneSurrogate(`${HIGH}${LOW}`)).toBe(false)
    expect(containsLoneSurrogate({ a: [1, null, true, '정상'] })).toBe(false)
  })
})

describe('jsonb 로 가는 입구의 외짝은 400 이고 아무것도 안 바뀐다', () => {
  it('PATCH …/ops', async () => {
    await withApi(async (ctx) => {
      const w = await world(ctx)
      const before = await w.head()

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `${w.P}/pages/${w.page.id}/ops`,
        cookies: w.owner.cookie,
        payload: { baseSeq: before, ops: addText(`a${HIGH}b`) },
      })

      expect(res.statusCode, res.body).toBe(400)
      expect(res.json()).toEqual(badSurrogate)
      expect(await w.head()).toBe(before)
    })
  })

  it('편집 `patch` 프레임', async () => {
    await withRealApi(async (ctx) => {
      const w = await world(ctx)
      const probe: WsProbe = await joinRoom(ctx.port, w.project.id, w.owner.cookie.wb_session)
      try {
        const before = await w.head()

        probe.send(
          JSON.stringify({ type: 'patch', pageId: w.page.id, clientOpId: 'op_surrogate', baseSeq: before, ops: addText(`a${HIGH}b`) }),
        )

        const error = await probe.waitFor('patch-error')
        expect(error.status).toBe(400)
        expect(error.clientOpId).toBe('op_surrogate')
        expect(await w.head()).toBe(before)
      } finally {
        probe.close()
      }
    })
  })

  it('PUT …/schema', async () => {
    await withApi(async (ctx) => {
      const w = await world(ctx)
      const before = await w.head()
      const schema = {
        version: 4,
        root: { id: 'n_root', type: 'Page', children: [{ id: 'n_y', type: 'Text', props: { content: `a${LOW}b` } }] },
      }

      const res = await ctx.app.inject({
        method: 'PUT',
        url: `${w.P}/pages/${w.page.id}/schema`,
        cookies: w.owner.cookie,
        payload: { schema },
      })

      expect(res.statusCode, res.body).toBe(400)
      expect(res.json()).toEqual(badSurrogate)
      expect(await w.head()).toBe(before)
    })
  })

  it('POST …/modules 의 nodes', async () => {
    await withApi(async (ctx) => {
      const w = await world(ctx)

      const res = await ctx.app.inject({
        method: 'POST',
        url: `${w.P}/modules`,
        cookies: w.owner.cookie,
        payload: { name: '모듈', nodes: [{ id: 'a', type: 'Text', props: { content: `a${HIGH}` } }] },
      })

      expect(res.statusCode, res.body).toBe(400)
      expect(res.json()).toEqual({ error: { code: 'bad-request', message: '모듈에 짝 없는 서로게이트 글자를 포함할 수 없습니다' } })
      expect(await ctx.db.selectFrom('modules').select('id').execute()).toEqual([])
    })
  })

  it('POST · PATCH …/modules 의 name — 텍스트 칸이지만 거절한다(U+FFFD 로 조용히 바뀌지 않게)', async () => {
    await withApi(async (ctx) => {
      const w = await world(ctx)
      const nodes = [{ id: 'a', type: 'Text', props: { content: '가' } }]

      const made = await ctx.app.inject({
        method: 'POST',
        url: `${w.P}/modules`,
        cookies: w.owner.cookie,
        payload: { name: `모${HIGH}듈`, nodes },
      })
      const good = await ctx.app.inject({
        method: 'POST',
        url: `${w.P}/modules`,
        cookies: w.owner.cookie,
        payload: { name: '모듈', nodes },
      })
      const id = (good.json() as { module: { id: string } }).module.id
      const renamed = await ctx.app.inject({
        method: 'PATCH',
        url: `${w.P}/modules/${id}`,
        cookies: w.owner.cookie,
        payload: { name: `모${HIGH}듈` },
      })

      expect({ made: made.statusCode, good: good.statusCode, renamed: renamed.statusCode }).toEqual({ made: 400, good: 201, renamed: 400 })
      expect((await ctx.db.selectFrom('modules').select('name').execute()).map((row) => row.name)).toEqual(['모듈'])
    })
  })

  it('대조군 — 짝을 이룬 글자(이모지)는 그대로 저장된다', async () => {
    await withApi(async (ctx) => {
      const w = await world(ctx)

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `${w.P}/pages/${w.page.id}/ops`,
        cookies: w.owner.cookie,
        payload: { baseSeq: await w.head(), ops: addText('😀 정상') },
      })

      expect(res.statusCode, res.body).toBe(200)
    })
  })
})
