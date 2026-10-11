/**
 * **프리셋이 화면 상태 목록을 싣는다**(설계 spec 「페이지 JSON · 프리셋 · 붙여넣기」 — «프리셋으로 새 페이지를 만들면 원본의 viewStates 를
 * 함께 싣는다»). 저장 본문의 `viewStates` 는 페이지 봉투와 같은 목록 규칙(`ViewStatesSchema`)을 지나고, 목록 · 생성 응답은 늘 `viewStates`
 * 를 싣는다(없으면 빈 목록 — 내장도). 적용(목록을 페이지 목록에 잇고 없는 상태의 가지를 빼는 것)은 화면이 한다 —
 * `apps/web/test/edit/preset-apply-view-states.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { createProject, signup, withApi, type TestContext } from './helpers'

const ADMIN = { id: 's_admin', name: '관리자' }
const AREA = {
  id: 'sw',
  type: 'StateSwitch',
  children: [
    { id: 'cd', type: 'StateCase', props: { state: 'default' }, children: [] },
    { id: 'ca', type: 'StateCase', props: { state: 's_admin' }, children: [{ id: 'b', type: 'Button', props: { label: '승인' } }] },
  ],
}

async function fixture(ctx: TestContext) {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const post = (payload: Record<string, unknown>) =>
    ctx.app.inject({ method: 'POST', url: `/api/projects/${project.id}/presets`, cookies: owner.cookie, payload })
  const list = async () =>
    (await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}/presets`, cookies: owner.cookie })).json() as Array<
      Record<string, unknown>
    >
  return { post, list }
}

describe('프리셋의 상태 목록', () => {
  it('저장한 목록을 생성 응답과 목록에 그대로 싣는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await fx.post({ name: '상태 있음', schema: [AREA], viewStates: [ADMIN] })
      expect(res.statusCode, res.body).toBe(201)
      expect((res.json() as Record<string, unknown>)['viewStates']).toEqual([ADMIN])
      const saved = (await fx.list()).find((preset) => preset['name'] === '상태 있음')
      expect(saved?.['viewStates']).toEqual([ADMIN])
    })
  })

  it('목록 없이 저장한 프리셋 · 내장은 빈 목록이다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      expect((await fx.post({ name: '상태 없음', schema: [{ id: 'a', type: 'List' }] })).statusCode).toBe(201)
      const all = await fx.list()
      expect(all.length).toBeGreaterThan(1)
      for (const preset of all) expect(preset['viewStates'], String(preset['name'])).toEqual([])
    })
  })

  it.each([
    ['이름 겹침', [ADMIN, { id: 's_2', name: ADMIN.name }]],
    ['빈 이름', [{ id: 's_1', name: '' }]],
    ['default id', [{ id: 'default', name: '기본2' }]],
    ['배열 아님', { id: 's_1', name: '하나' }],
  ])('목록 규칙 밖(%s)은 400 이고 저장되지 않는다', async (_what, viewStates) => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await fx.post({ name: '나쁨', schema: [AREA], viewStates })
      expect(res.statusCode, res.body).toBe(400)
      // 목록 규칙이 막았다 — 모르는 본문 키로 막힌 것이 아니다(이슈의 자리가 목록 안이다).
      const issues = (res.json() as { error: { issues: { path: string }[] } }).error.issues
      expect(issues.length).toBeGreaterThan(0)
      for (const issue of issues) expect(issue.path).toMatch(/^viewStates/)
      expect((await fx.list()).some((preset) => preset['name'] === '나쁨')).toBe(false)
    })
  })
})
