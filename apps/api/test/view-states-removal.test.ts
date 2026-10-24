/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withRealApi`를 쓴다.
 *
 * **보임이 가리키는 상태를 목록에서만 빼는 편집 · 목록 밖 상태를 보임에 넣는 편집은 저장 경계에서 거절한다**(`@wirebound/schema`의
 * `checkViewStateRemoval` — 편집 파이프라인 6단계). 목록만 빼면 그 상태로 설계한 노드가 어느 상태에서도 안 서는데(`only`), 잠금 판정은 포인터
 * 겹침이라 `/viewStates`는 남이 잡은 노드와 안 겹쳐 지나간다. 상태 삭제는 보임까지 함께 고치는 묶음(`removeViewStateOps` — 노드 `remove` ·
 * `replace`가 잠금 판정을 탄다)으로만 한다. 편집 전부터 같은 노드가 목록 밖을 가리키던 것(가져온 문서)은 lint 의 몫이라 편집을 막지 않는다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { removeViewStateOps, type PageDocument, type PatchOp } from '@wirebound/schema'
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

beforeEach(resetRealData)
afterEach(resetRealData)

const opened: WsProbe[] = []
afterEach(() => {
  for (const probe of opened) probe.close()
  opened.length = 0
})

const ADMIN = { id: 's_admin', name: '관리자' }
const GUEST = { id: 's_guest', name: '손님' }

/** 목록 `[관리자, 손님]` · `n_ok` 는 관리자에서만(`only`). 손님을 가리키는 보임은 없다. */
const SCHEMA = {
  version: 4,
  viewStates: [ADMIN, GUEST],
  root: {
    id: 'n_root',
    type: 'Page',
    children: [{ id: 'n_ok', type: 'Button', props: { label: '승인' }, visibility: { mode: 'only', states: ['s_admin'] } }],
  },
}

async function board(ctx: RealApiContext, schema: unknown = SCHEMA) {
  const bora = await signup(ctx)
  const dahye = await signup(ctx)
  const project = await createProject(ctx, bora.cookie)
  await addMember(ctx, project.id, dahye.user.id, 'editor')
  const menu = await createMenuNode(ctx, bora.cookie, project.id)
  const page = await createPage(ctx, bora.cookie, project.id, menu.id)
  const base = `/api/projects/${project.id}/pages/${page.id}`
  const put = await ctx.app.inject({ method: 'PUT', url: `${base}/schema`, cookies: bora.cookie, payload: { schema } as never })
  if (put.statusCode !== 200) throw new Error(`픽스처 PUT 실패 (${put.statusCode}): ${put.body}`)
  const read = async () => {
    const res = await ctx.app.inject({ method: 'GET', url: base, cookies: bora.cookie })
    expect(res.statusCode, res.body).toBe(200)
    return res.json() as { schema: PageDocument; headSeq: number }
  }
  const patch = async (ops: PatchOp[]) => {
    const res = await ctx.app.inject({
      method: 'PATCH',
      url: `${base}/ops`,
      cookies: bora.cookie,
      payload: { baseSeq: (await read()).headSeq, ops },
    })
    return {
      status: res.statusCode,
      body: res.json() as { error?: { code?: string; issues?: Array<{ code: string; nodeId: string | null; path: string }> } },
    }
  }
  const putSchema = async (next: unknown) => {
    const res = await ctx.app.inject({ method: 'PUT', url: `${base}/schema`, cookies: bora.cookie, payload: { schema: next } as never })
    return {
      status: res.statusCode,
      body: res.json() as { error?: { code?: string; issues?: Array<{ code: string; nodeId: string | null; path: string }> } },
    }
  }
  return { bora, dahye, project, page, read, patch, putSchema }
}

const issueCodes = (body: { error?: { issues?: Array<{ code: string; nodeId: string | null; path: string }> } }) =>
  (body.error?.issues ?? []).map((issue) => `${issue.code} ${issue.nodeId} ${issue.path}`)

describe('보임이 가리키는 상태를 목록에서만 빼는 편집 — 저장 경계에서 거절', () => {
  it('목록에서만 빼면 422 — 남의 잠금을 지나 그 노드를 감추지 않는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const dahyeTab = await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session)
      opened.push(dahyeTab)
      dahyeTab.send(JSON.stringify({ type: 'lock', pageId: fx.page.id, nodeId: 'n_ok' }))
      await locksWith(dahyeTab, 'n_ok')

      const res = await fx.patch([{ op: 'remove', path: '/viewStates/0' }])
      expect({ status: res.status, code: res.body.error?.code, issues: issueCodes(res.body) }).toEqual({
        status: 422,
        code: 'validation-failed',
        issues: ['state-cases-left n_ok /root/children/0/visibility'],
      })
      expect((await fx.read()).schema.viewStates).toEqual([ADMIN, GUEST])
      // 같은 뜻의 상태 삭제(only 가 비어 노드째 지움)는 그 잠금에 막힌다 — 원래 판정.
      const removal = await fx.patch(removeViewStateOps((await fx.read()).schema, 's_admin')!.ops)
      expect(removal.status).toBe(423)
    })
  })

  it.each<[string, PatchOp[]]>([
    ['상태 id 바꾸기', [{ op: 'replace', path: '/viewStates/0/id', value: 's_other' }]],
    ['목록째 빼기', [{ op: 'remove', path: '/viewStates' }]],
    ['목록째 바꾸기', [{ op: 'replace', path: '/viewStates', value: [GUEST] }]],
    [
      '빼고 같은 이름으로 다시 더하기',
      [
        { op: 'remove', path: '/viewStates/0' },
        { op: 'add', path: '/viewStates/-', value: { id: 's_new', name: '관리자' } },
      ],
    ],
  ])('%s도 422', async (_name, ops) => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const res = await fx.patch(ops)
      expect({ status: res.status, issues: issueCodes(res.body) }).toEqual({
        status: 422,
        issues: ['state-cases-left n_ok /root/children/0/visibility'],
      })
    })
  })

  it('PUT 으로 목록에서만 빼도 422', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const res = await fx.putSchema({ ...SCHEMA, viewStates: [GUEST] })
      expect({ status: res.status, issues: issueCodes(res.body) }).toEqual({
        status: 422,
        issues: ['state-cases-left n_ok /root/children/0/visibility'],
      })
    })
  })

  it('목록 밖 상태를 보임에 넣는 편집도 422', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const res = await fx.patch([{ op: 'replace', path: '/root/children/0/visibility/states', value: ['s_admin', 's_gone'] }])
      expect({ status: res.status, issues: issueCodes(res.body) }).toEqual({
        status: 422,
        issues: ['state-cases-left n_ok /root/children/0/visibility'],
      })
    })
  })

  it('받는 판 — 아무도 안 가리키는 상태를 빼기 · 상태 삭제(보임째) · 보임을 함께 고치는 묶음', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      expect((await fx.patch([{ op: 'remove', path: '/viewStates/1' }])).status).toBe(200)
      expect((await fx.patch(removeViewStateOps((await fx.read()).schema, 's_admin')!.ops)).status).toBe(200)
      expect((await fx.read()).schema.viewStates).toEqual([])
    })
  })

  it('받는 판 — 보임을 함께 고치는 손 묶음(상태를 빼고 그 노드의 보임도 걷음)', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const res = await fx.patch([
        { op: 'remove', path: '/root/children/0/visibility' },
        { op: 'remove', path: '/viewStates/0' },
      ])
      expect(res.status).toBe(200)
    })
  })

  it('편집 전부터 같은 노드가 목록 밖을 가리키던 것(가져온 문서)은 막지 않는다 — lint 의 몫', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      // 가져온 문서처럼 목록 밖을 가리키는 노드를 DB 에 바로 둔다(편집 경계를 안 지난 판).
      await getTestDb()
        .updateTable('pages')
        .set({ schema: JSON.stringify({ ...SCHEMA, viewStates: [GUEST] }) as never })
        .where('id', '=', fx.page.id)
        .execute()
      expect((await fx.patch([{ op: 'replace', path: '/root/children/0/props/label', value: '확인' }])).status).toBe(200)
      expect((await fx.patch([{ op: 'remove', path: '/viewStates/0' }])).status).toBe(200)
    })
  })
})
