/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withRealApi`를 쓴다.
 *
 * **가지가 남은 상태를 목록에서만 빼는 편집은 저장 경계에서 거절한다**(`@wirebound/schema`의 `checkViewStateRemoval` — 편집 파이프라인
 * 6단계). 목록만 빼면 그 상태의 가지가 어느 상태에서도 안 그려지는데, 잠금 판정은 포인터 겹침이라 `/viewStates`는 가지 안 남의 잠금과
 * 안 겹쳐 지나갔다(K1 리뷰 R2). 상태 삭제는 가지째 지우는 묶음(`removeViewStateOps` — 가지 `remove`가 잠금 판정을 탄다)으로만 한다.
 * 편집 전부터 목록 밖이던 가지(옛 문서)는 이 판정이 아니라 lint 의 몫이라 편집을 막지 않는다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { removeViewStateOps, type PageDocument, type PatchOp } from '@wirebound/schema'
import { addMember, createMenuNode, createPage, createProject, resetRealData, signup, withRealApi, type RealApiContext } from './helpers'
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

/** 목록 `[관리자, 손님]` · 관리자 가지(`n_c1`) 안에 `n_ok`. 손님은 가지가 없다. */
const SCHEMA = {
  version: 1,
  viewStates: [ADMIN, GUEST],
  root: {
    id: 'n_root',
    type: 'Page',
    children: [
      {
        id: 'n_sw',
        type: 'StateSwitch',
        children: [
          { id: 'n_c0', type: 'StateCase', props: { state: 'default' }, children: [] },
          { id: 'n_c1', type: 'StateCase', props: { state: 's_admin' }, children: [{ id: 'n_ok', type: 'Button', props: { label: '승인' } }] },
        ],
      },
    ],
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
    const res = await ctx.app.inject({ method: 'PATCH', url: `${base}/ops`, cookies: bora.cookie, payload: { baseSeq: (await read()).headSeq, ops } })
    return { status: res.statusCode, body: res.json() as { error?: { code?: string; issues?: Array<{ code: string; nodeId: string | null; path: string }> } } }
  }
  const putSchema = async (next: unknown) => {
    const res = await ctx.app.inject({ method: 'PUT', url: `${base}/schema`, cookies: bora.cookie, payload: { schema: next } as never })
    return { status: res.statusCode, body: res.json() as { error?: { code?: string; issues?: Array<{ code: string; nodeId: string | null; path: string }> } } }
  }
  return { bora, dahye, project, page, read, patch, putSchema }
}

const issueCodes = (body: { error?: { issues?: Array<{ code: string; nodeId: string | null; path: string }> } }) =>
  (body.error?.issues ?? []).map((issue) => `${issue.code} ${issue.nodeId} ${issue.path}`)

describe('가지가 남은 상태를 목록에서만 빼는 편집 — 저장 경계에서 거절', () => {
  it('목록에서만 빼면 422 — 가지 안 남의 잠금을 지나 그 가지를 감추지 않는다', async () => {
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
        issues: ['state-cases-left n_c1 /root/children/0/children/1'],
      })
      expect((await fx.read()).schema.viewStates).toEqual([ADMIN, GUEST])
      // 같은 뜻의 상태 삭제(가지째)는 그 잠금에 막힌다 — 원래 판정.
      const removal = await fx.patch(removeViewStateOps((await fx.read()).schema, 's_admin')!.ops)
      expect(removal.status).toBe(423)
    })
  })

  it.each<[string, PatchOp[]]>([
    ['상태 id 바꾸기', [{ op: 'replace', path: '/viewStates/0/id', value: 's_other' }]],
    ['목록째 빼기', [{ op: 'remove', path: '/viewStates' }]],
    ['목록째 바꾸기', [{ op: 'replace', path: '/viewStates', value: [GUEST] }]],
    ['빼고 같은 이름으로 다시 더하기', [{ op: 'remove', path: '/viewStates/0' }, { op: 'add', path: '/viewStates/-', value: { id: 's_new', name: '관리자' } }]],
  ])('%s도 422', async (_name, ops) => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const res = await fx.patch(ops)
      expect({ status: res.status, issues: issueCodes(res.body) }).toEqual({ status: 422, issues: ['state-cases-left n_c1 /root/children/0/children/1'] })
    })
  })

  it('PUT 으로 목록에서만 빼도 422', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const res = await fx.putSchema({ ...SCHEMA, viewStates: [GUEST] })
      expect({ status: res.status, issues: issueCodes(res.body) }).toEqual({ status: 422, issues: ['state-cases-left n_c1 /root/children/0/children/1'] })
    })
  })

  it('받는 판 — 가지 없는 상태를 빼기 · 상태 삭제(가지째) · 가지를 함께 지우는 묶음', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      expect((await fx.patch([{ op: 'remove', path: '/viewStates/1' }])).status).toBe(200)
      expect((await fx.patch(removeViewStateOps((await fx.read()).schema, 's_admin')!.ops)).status).toBe(200)
      expect((await fx.read()).schema.viewStates).toEqual([])
    })
  })

  it('편집 전부터 목록 밖이던 가지(옛 문서)는 막지 않는다 — lint 의 몫', async () => {
    await withRealApi(async (ctx) => {
      // 처음부터 목록에 없는 상태의 가지 — 목록에서 뺀 것이 아니라 들어올 때 받는다.
      const fx = await board(ctx, { ...SCHEMA, viewStates: [GUEST] })
      expect((await fx.patch([{ op: 'replace', path: '/root/children/0/children/1/children/0/props/label', value: '확인' }])).status).toBe(200)
      expect((await fx.patch([{ op: 'remove', path: '/viewStates/0' }])).status).toBe(200)
    })
  })
})
