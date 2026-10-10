/**
 * ⚠️ WS 케이스가 테스트 DB 에 **실제로 커밋한다**(`withRealApi`).
 *
 * **중첩이 너무 깊은 본문은 500 이 아니라 400 이다**(`services/nesting.ts`). 스키마 패키지의 적용 · 역 계산(`applyOps` · `invertOps`)과 NUL · 서로게이트 훑기가 재귀라
 * 깊이 1500 안팎(노드 단계)에서 스택이 넘쳐 500(PUT · 가져오기는 400 에 «Maximum call stack size exceeded» 문장)이 났다. 입구 셋이 막는다:
 *
 * | 입구 | 무엇을 보나 | 어디서 |
 * |---|---|---|
 * | HTTP 본문(PUT · 가져오기 · 프리셋 · REST ops …) | JSON 중첩 `MAX_JSON_NESTING` | `preValidation` 훅(`app.ts`) |
 * | 편집 파이프라인(WS `patch` · REST ops · 복원 …) | `ops` 의 JSON 중첩 | `applyEdit` 4단계 앞 |
 * | 편집 뒤 문서 | 노드 깊이 `MAX_NODE_DEPTH` | `applyEdit` 5단계 뒤 — **한도 안의 편집을 되풀이해 깊이를 쌓아도 적용이 안 넘친다** |
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { MAX_JSON_NESTING, MAX_NODE_DEPTH } from '../src/services/nesting'
import { createMenuNode, createPage, createProject, resetRealData, signup, withApi, withRealApi, type TestContext } from './helpers'
import { WsProbe, joinRoom } from './ws-client'

beforeEach(resetRealData)
afterEach(resetRealData)

let uniq = 0
/** 같은 사슬을 JSON 글자로 — 깊이 수천을 `JSON.stringify` 하면 시험 쪽 호출 스택이 먼저 넘친다(`light-my-request` 도 그렇다). */
function chainJson(depth: number): string {
  uniq += 1
  const open = Array.from({ length: depth }, (_, i) => `{"id":"n_${uniq}_${i}","type":"Section","children":[`).join('')
  return `${open}{"id":"n_leaf_${uniq}","type":"Text","props":{"content":"x"}}${']}'.repeat(depth)}`
}

/** 노드 단계 `depth` 의 Section 사슬 — id 가 겹치지 않는다. */
function chain(depth: number, leaf: 'text' | 'section' = 'text'): unknown {
  uniq += 1
  let node: Record<string, unknown> =
    leaf === 'text' ? { id: `n_leaf_${uniq}`, type: 'Text', props: { content: 'x' } } : { id: `n_leaf_${uniq}`, type: 'Section', children: [] }
  for (let i = 0; i < depth; i += 1) node = { id: `n_${uniq}_${i}`, type: 'Section', children: [node] }
  return node
}

async function world(ctx: TestContext) {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '메뉴' })
  const page = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '제목' })
  const P = `/api/projects/${project.id}`
  const head = async () => ((await ctx.app.inject({ method: 'GET', url: `${P}/pages/${page.id}`, cookies: owner.cookie })).json() as { headSeq: number }).headSeq
  const patch = async (value: unknown, path = '/root/children/-') =>
    ctx.app.inject({ method: 'PATCH', url: `${P}/pages/${page.id}/ops`, cookies: owner.cookie, payload: { baseSeq: await head(), ops: [{ op: 'add', path, value }] } })
  /** 값을 이미 JSON 글자로 가진 편집(깊은 사슬). */
  const raw = (method: 'PATCH' | 'PUT' | 'POST', url: string, json: string) =>
    ctx.app.inject({ method, url, cookies: owner.cookie, headers: { 'content-type': 'application/json' }, payload: json })
  const patchJson = async (valueJson: string) =>
    raw('PATCH', `${P}/pages/${page.id}/ops`, `{"baseSeq":${await head()},"ops":[{"op":"add","path":"/root/children/-","value":${valueJson}}]}`)
  return { owner, project, page, P, head, patch, raw, patchJson }
}

/** 노드 단계 → JSON 단계(노드 하나가 객체 + `children` 배열 = 둘). 한도 위로 넘치는 깊이. */
const TOO_DEEP = Math.ceil(MAX_JSON_NESTING / 2) + 50
const FIXED = { error: { code: 'bad-request', message: expect.stringContaining('너무 깊') } }

describe('입구 — 깊이가 한도를 넘으면 400 이고 아무것도 안 바뀐다', () => {
  it.each([3000, 8000, TOO_DEEP])('PATCH …/ops — 노드 단계 %i', async (depth) => {
    await withApi(async (ctx) => {
      const w = await world(ctx)
      const before = await w.head()

      const res = await w.patchJson(chainJson(depth))

      expect({ status: res.statusCode, body: res.json(), head: await w.head() }).toEqual({ status: 400, body: FIXED, head: before })
    })
  })

  it.each([3000, TOO_DEEP])('PUT …/schema — 노드 단계 %i', async (depth) => {
    await withApi(async (ctx) => {
      const w = await world(ctx)
      const before = await w.head()
      const res = await w.raw('PUT', `${w.P}/pages/${w.page.id}/schema`, `{"schema":{"version":1,"root":{"id":"n_root","type":"Page","children":[${chainJson(depth)}]}}}`)

      expect({ status: res.statusCode, body: res.json(), head: await w.head() }).toEqual({ status: 400, body: FIXED, head: before })
    })
  })

  it('POST …/presets — schema 가 깊다', async () => {
    await withApi(async (ctx) => {
      const w = await world(ctx)

      const res = await w.raw('POST', `${w.P}/presets`, `{"name":"프리셋","schema":[${chainJson(3000)}]}`)

      expect({ status: res.statusCode, body: res.json() }).toEqual({ status: 400, body: FIXED })
      expect(await ctx.db.selectFrom('presets').select('id').execute()).toEqual([])
    })
  })

  it('편집 `patch` 프레임 — 400 patch-error 가 오고 연결은 산다', async () => {
    await withRealApi(async (ctx) => {
      const w = await world(ctx)
      const probe: WsProbe = await joinRoom(ctx.port, w.project.id, w.owner.cookie.wb_session)
      try {
        const before = await w.head()

        probe.send(
          `{"type":"patch","pageId":"${w.page.id}","clientOpId":"op_deep","baseSeq":${before},"ops":[{"op":"add","path":"/root/children/-","value":${chainJson(3000)}}]}`,
        )

        const error = await probe.waitFor('patch-error')
        expect({ status: error.status, clientOpId: error.clientOpId, head: await w.head() }).toEqual({ status: 400, clientOpId: 'op_deep', head: before })
      } finally {
        probe.close()
      }
    })
  })
})

describe('대조군 — 한도 안의 깊이는 그대로 저장된다', () => {
  it('PATCH …/ops — 노드 단계 100', async () => {
    await withApi(async (ctx) => {
      const w = await world(ctx)

      const res = await w.patch(chain(100))

      expect(res.statusCode, res.body).toBe(200)
    })
  })
})

describe('한도 안의 편집을 되풀이해 깊이를 쌓아도 막힌다 — 적용이 넘치기 전에', () => {
  it('가장 깊은 노드 밑에 한도 안의 사슬을 계속 달면 문서 깊이가 한도에 닿는 편집이 400 이고 그 뒤에도 편집이 선다', async () => {
    await withApi(async (ctx) => {
      const w = await world(ctx)
      const step = 120
      // 한 조각은 맨 밑이 빈 Section 인 사슬이다 — 다음 조각을 그 밑에 단다. 조각 하나가 `step + 1` 단계를 더한다.
      let leafPath = '/root'
      const statuses: number[] = []
      for (let round = 0; round < Math.ceil(MAX_NODE_DEPTH / step) + 2; round += 1) {
        const res = await w.patch(chain(step, 'section'), `${leafPath}/children/-`)
        statuses.push(res.statusCode)
        if (res.statusCode !== 200) break
        leafPath += '/children/0'.repeat(step + 1)
      }
      // 마지막 하나가 400 이다(깊이 한도), 그 앞은 전부 200.
      expect(statuses.at(-1)).toBe(400)
      expect(statuses.slice(0, -1).every((status) => status === 200)).toBe(true)
      // 그 뒤에도 평범한 편집이 선다 — 문서가 적용이 넘치는 깊이에 닿지 않았다.
      const ok = await w.patch({ id: 'n_after', type: 'Text', props: { content: '뒤' } })
      expect(ok.statusCode, ok.body).toBe(200)
    })
  })
})
