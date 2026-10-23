/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withRealApi`를 쓴다.
 *
 * **상태 목록 편집은 번호 경로라 남의 편집과 겹치면 다른 상태를 가리킨다** — 그래서 목록의 있는 자리를 고치는 연산(빼기 · 이름 · 옮기기)은 그
 * 자리의 `id`를 JSON Patch `test`로 함께 싣고, 서버가 지은 역연산(되돌리기)도 같다(`@wirebound/schema`의 `guardViewStateOps`). 판은 늘
 * 겹친 판이다 — 내 편집을 지은 뒤 남의 편집이 먼저 커밋되고, 나는 판 번호만 새로 받아 **같은 ops 를 그대로** 다시 낸다(409 뒤 다시 읽고
 * ops 를 다시 짓지 않는 클라이언트 · `revisions?mine`의 역연산을 그대로 내는 되돌리기). 웹의 리베이스는 상태를 id 로 다시 짚는다 —
 * 그 판은 `apps/web/test/store/anchored-ops.test.ts` «상태 목록».
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { addViewStateOps, renameViewStateOps, type PageDocument, type PatchOp } from '@wirebound/schema'
import { addMember, createMenuNode, createPage, createProject, resetRealData, signup, withRealApi, type RealApiContext } from './helpers'

beforeEach(resetRealData)
afterEach(resetRealData)

const ADMIN = { id: 's_admin', name: '관리자' }

/** 편집자 둘(bora · dahye). 목록 `viewStates`, 관리자에서만 보이는 `n_ok`(목록에 관리자가 있을 때). */
async function board(ctx: RealApiContext, viewStates: Array<{ id: string; name: string }> | undefined) {
  const bora = await signup(ctx)
  const dahye = await signup(ctx)
  const project = await createProject(ctx, bora.cookie)
  await addMember(ctx, project.id, dahye.user.id, 'editor')
  const menu = await createMenuNode(ctx, bora.cookie, project.id)
  const page = await createPage(ctx, bora.cookie, project.id, menu.id)
  const base = `/api/projects/${project.id}/pages/${page.id}`
  const schema = {
    version: 4,
    ...(viewStates === undefined ? {} : { viewStates }),
    root: {
      id: 'n_root',
      type: 'Page',
      children: viewStates?.some((state) => state.id === ADMIN.id)
        ? [{ id: 'n_ok', type: 'Button', props: { label: '승인' }, visibility: { mode: 'only', states: [ADMIN.id] } }]
        : [],
    },
  }
  const put = await ctx.app.inject({ method: 'PUT', url: `${base}/schema`, cookies: bora.cookie, payload: { schema } as never })
  if (put.statusCode !== 200) throw new Error(`픽스처 PUT 실패 (${put.statusCode}): ${put.body}`)
  const read = async () => {
    const res = await ctx.app.inject({ method: 'GET', url: base, cookies: bora.cookie })
    expect(res.statusCode, res.body).toBe(200)
    return res.json() as { schema: PageDocument; headSeq: number }
  }
  const patch = async (who: typeof bora, baseSeq: number, ops: PatchOp[]) => {
    const res = await ctx.app.inject({ method: 'PATCH', url: `${base}/ops`, cookies: who.cookie, payload: { baseSeq, ops } })
    return { status: res.statusCode, body: res.json() as { seq?: number; inverse?: PatchOp[]; error?: { code?: string } } }
  }
  /** 판 번호만 새로 받아 같은 ops 를 다시 낸다 — 겹친 판의 «늦은 편집». */
  const resend = async (who: typeof bora, ops: PatchOp[]) => patch(who, (await read()).headSeq, ops)
  return { bora, dahye, read, patch, resend }
}

describe('상태 목록 편집은 그 자리의 id 를 함께 싣는다 — 겹친 판', () => {
  it('남이 순서를 바꾼 뒤 내 «상태 추가»의 되돌리기는 남의 상태를 빼지 않는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx, [ADMIN])
      const head = await fx.read()
      const added = await fx.patch(
        fx.bora,
        head.headSeq,
        addViewStateOps(head.schema, '손님', null, () => 's_guest')!,
      )
      expect(added.status, JSON.stringify(added.body)).toBe(200)
      // 다혜가 «손님»을 맨 앞으로 — 보라의 역연산(`remove /viewStates/1`)이 가리키던 자리에 «관리자»가 선다.
      expect((await fx.patch(fx.dahye, added.body.seq!, [{ op: 'move', from: '/viewStates/1', path: '/viewStates/0' }])).status).toBe(200)

      const undo = await fx.resend(fx.bora, added.body.inverse!)
      const after = (await fx.read()).schema
      expect({ status: undo.status, code: undo.body.error?.code, viewStates: after.viewStates }).toEqual({
        status: 409,
        code: 'conflict',
        viewStates: [{ id: 's_guest', name: '손님' }, ADMIN],
      })
    })
  })

  it('순서가 그대로면 «상태 추가»의 되돌리기는 그 상태를 뺀다 — 실린 id 가 맞는 판', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx, [ADMIN])
      const head = await fx.read()
      const added = await fx.patch(
        fx.bora,
        head.headSeq,
        addViewStateOps(head.schema, '손님', null, () => 's_guest')!,
      )
      // 남의 편집이 목록 밖(노드)을 고친 판 — 판 번호는 오르지만 목록의 자리는 그대로다.
      expect(
        (await fx.patch(fx.dahye, added.body.seq!, [{ op: 'replace', path: '/root/children/0/props/label', value: '확인' }])).status,
      ).toBe(200)
      const undo = await fx.resend(fx.bora, added.body.inverse!)
      expect(undo.status, JSON.stringify(undo.body)).toBe(200)
      expect((await fx.read()).schema.viewStates).toEqual([ADMIN])
    })
  })

  it('남이 그 상태를 지운 뒤 내 이름 바꾸기는 다음 상태의 이름을 바꾸지 않는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx, [ADMIN, { id: 's_guest', name: '손님' }, { id: 's_staff', name: '직원' }])
      const head = await fx.read()
      // 보라는 «손님»(자리 1)의 이름을 바꾸는 편집을 지었다.
      const rename = renameViewStateOps(head.schema, 's_guest', '방문자')!
      // 그 사이 다혜가 «손님»을 뺀다 — 자리 1 에 «직원»이 선다.
      expect((await fx.patch(fx.dahye, head.headSeq, [{ op: 'remove', path: '/viewStates/1' }])).status).toBe(200)
      const late = await fx.patch(fx.bora, head.headSeq, rename)
      expect(late.status).toBe(409)

      const again = await fx.resend(fx.bora, rename)
      const after = (await fx.read()).schema
      expect({ status: again.status, code: again.body.error?.code, viewStates: after.viewStates }).toEqual({
        status: 409,
        code: 'conflict',
        viewStates: [ADMIN, { id: 's_staff', name: '직원' }],
      })
    })
  })

  it('남이 순서를 바꾼 뒤 내 «이름 바꾸기»의 되돌리기는 남의 상태 이름을 덮지 않는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx, [ADMIN, { id: 's_guest', name: '손님' }])
      const head = await fx.read()
      const renamed = await fx.patch(fx.bora, head.headSeq, renameViewStateOps(head.schema, 's_guest', '방문자')!)
      expect(renamed.status, JSON.stringify(renamed.body)).toBe(200)
      expect((await fx.patch(fx.dahye, renamed.body.seq!, [{ op: 'move', from: '/viewStates/1', path: '/viewStates/0' }])).status).toBe(200)

      const undo = await fx.resend(fx.bora, renamed.body.inverse!)
      expect({ status: undo.status, viewStates: (await fx.read()).schema.viewStates }).toEqual({
        status: 409,
        viewStates: [{ id: 's_guest', name: '방문자' }, ADMIN],
      })
    })
  })

  it('두 사람이 동시에 추가하면 둘 다 남는다 — 목록이 있으면 끝에 넣기라 겹쳐도 남의 것을 안 덮는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx, [ADMIN])
      const head = await fx.read()
      const mine = addViewStateOps(head.schema, '손님', null, () => 's_guest')!
      const theirs = addViewStateOps(head.schema, '직원', null, () => 's_staff')!
      expect((await fx.patch(fx.dahye, head.headSeq, theirs)).status).toBe(200)
      expect((await fx.patch(fx.bora, head.headSeq, mine)).status).toBe(409)
      expect((await fx.resend(fx.bora, mine)).status).toBe(200)
      expect((await fx.read()).schema.viewStates).toEqual([ADMIN, { id: 's_staff', name: '직원' }, { id: 's_guest', name: '손님' }])
    })
  })

  it('목록을 처음 만든 편집의 되돌리기는 그 사이 남이 더한 상태가 있으면 목록을 지우지 않는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx, undefined)
      const head = await fx.read()
      const created = await fx.patch(
        fx.bora,
        head.headSeq,
        addViewStateOps(head.schema, '손님', null, () => 's_guest')!,
      )
      expect(created.status, JSON.stringify(created.body)).toBe(200)
      const now = await fx.read()
      expect(
        (
          await fx.patch(
            fx.dahye,
            now.headSeq,
            addViewStateOps(now.schema, '직원', null, () => 's_staff')!,
          )
        ).status,
      ).toBe(200)

      const undo = await fx.resend(fx.bora, created.body.inverse!)
      expect({ status: undo.status, viewStates: (await fx.read()).schema.viewStates }).toEqual({
        status: 409,
        viewStates: [
          { id: 's_guest', name: '손님' },
          { id: 's_staff', name: '직원' },
        ],
      })
    })
  })
})
