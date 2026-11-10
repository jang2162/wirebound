/**
 * 공통코드 REST(`routes/codes.ts`) — 권한 · 바꿀 수 없는 칸 · 상한 · 글자 규칙 · 차례 · 거절. 사용처는 `codes-usage.test.ts`, 신호는
 * `codes-changed.test.ts`.
 */
import { describe, expect, it } from 'vitest'
import { CODE_GROUPS_MAX, CODE_ITEMS_MAX } from '@wirebound/schema'
import { addMember, createProject, signup, withApi, type TestContext } from './helpers'

async function fixture(ctx: TestContext) {
  const owner = await signup(ctx)
  const editor = await signup(ctx)
  const viewer = await signup(ctx)
  const outsider = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  await addMember(ctx, project.id, editor.user.id, 'editor')
  await addMember(ctx, project.id, viewer.user.id, 'viewer')
  const base = `/api/projects/${project.id}/codes`
  const as =
    (who: { cookie: { wb_session: string } }) =>
    (method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: Record<string, unknown>) =>
      ctx.app.inject({ method, url: `${base}${url}`, cookies: who.cookie, ...(payload === undefined ? {} : { payload }) })
  return { project, base, owner: as(owner), editor: as(editor), viewer: as(viewer), outsider: as(outsider) }
}

describe('공통코드 REST', () => {
  it('editor 가 그룹 · 항목을 만들고 표가 차례대로 선다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      expect((await fx.editor('POST', '', { key: 'ORDER_STATUS', name: '주문 상태' })).statusCode).toBe(201)
      expect((await fx.editor('POST', '', { key: 'GRADE', name: '등급' })).statusCode).toBe(201)
      expect((await fx.editor('POST', '/ORDER_STATUS/items', { value: 'WAIT', name: '결제 대기' })).statusCode).toBe(201)
      const off = await fx.editor('POST', '/ORDER_STATUS/items', { value: 'DONE', name: '완료', active: false })
      expect(off.json()).toEqual({ item: { value: 'DONE', name: '완료', active: false } })
      const table = await fx.viewer('GET', '')
      expect(table.statusCode).toBe(200)
      expect(table.json()).toEqual({
        groups: [
          {
            key: 'ORDER_STATUS',
            name: '주문 상태',
            items: [
              { value: 'WAIT', name: '결제 대기', active: true },
              { value: 'DONE', name: '완료', active: false },
            ],
          },
          { key: 'GRADE', name: '등급', items: [] },
        ],
      })
    })
  })

  it('viewer 는 읽기만 · 비멤버는 404', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      await fx.owner('POST', '', { key: 'S', name: '상태' })
      expect((await fx.viewer('GET', '')).statusCode).toBe(200)
      expect((await fx.viewer('GET', '/usage?group=S')).statusCode).toBe(200)
      expect((await fx.viewer('POST', '', { key: 'T', name: '다른' })).statusCode).toBe(403)
      expect((await fx.viewer('PATCH', '/S', { name: '바꿈' })).statusCode).toBe(403)
      expect((await fx.viewer('POST', '/S/items', { value: 'A', name: '가' })).statusCode).toBe(403)
      expect((await fx.viewer('DELETE', '/S')).statusCode).toBe(403)
      expect((await fx.outsider('GET', '')).statusCode).toBe(404)
      expect((await fx.outsider('POST', '', { key: 'T', name: '다른' })).statusCode).toBe(404)
    })
  })

  it('키 · 코드값은 본문으로 못 바꾼다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      await fx.editor('POST', '', { key: 'S', name: '상태' })
      await fx.editor('POST', '/S/items', { value: 'A', name: '가' })
      expect((await fx.editor('PATCH', '/S', { key: 'T' })).statusCode).toBe(400)
      expect((await fx.editor('PATCH', '/S', { key: 'T', name: '이름' })).statusCode).toBe(400)
      expect((await fx.editor('PATCH', '/S/items/A', { value: 'B' })).statusCode).toBe(400)
      expect((await fx.editor('PATCH', '/S', {})).statusCode).toBe(400)
      expect((await fx.editor('GET', '')).json().groups[0]).toMatchObject({ key: 'S', items: [{ value: 'A' }] })
    })
  })

  it('이름 · 사용 여부 · 차례를 고친다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      for (const key of ['A', 'B', 'C']) await fx.editor('POST', '', { key, name: key })
      for (const value of ['X', 'Y', 'Z']) await fx.editor('POST', '/A/items', { value, name: value })
      expect((await fx.editor('PATCH', '/C', { sortOrder: 0, name: '셋' })).json().group).toMatchObject({ key: 'C', name: '셋' })
      const item = await fx.editor('PATCH', '/A/items/Z', { sortOrder: 0, active: false, name: '제트' })
      expect(item.json()).toEqual({ item: { value: 'Z', name: '제트', active: false } })
      const groups = (await fx.editor('GET', '')).json().groups as { key: string; items: { value: string }[] }[]
      expect(groups.map((group) => group.key)).toEqual(['C', 'A', 'B'])
      expect(groups[1]!.items.map((entry) => entry.value)).toEqual(['Z', 'X', 'Y'])
    })
  })

  it('겹친 키 · 값은 409 · 없는 그룹 · 항목은 404', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      await fx.editor('POST', '', { key: 'S', name: '상태' })
      const taken = await fx.editor('POST', '', { key: 'S', name: '또' })
      expect(taken.statusCode).toBe(409)
      expect(taken.json().error.issues[0].code).toBe('code-key-taken')
      await fx.editor('POST', '/S/items', { value: 'A', name: '가' })
      expect((await fx.editor('POST', '/S/items', { value: 'A', name: '나' })).statusCode).toBe(409)
      expect((await fx.editor('POST', '/NOPE/items', { value: 'A', name: '가' })).statusCode).toBe(404)
      expect((await fx.editor('PATCH', '/S/items/NOPE', { name: '가' })).statusCode).toBe(404)
      expect((await fx.editor('DELETE', '/S/items/NOPE')).statusCode).toBe(404)
      expect((await fx.editor('DELETE', '/NOPE')).statusCode).toBe(404)
      expect((await fx.editor('DELETE', '/S/items/A')).statusCode).toBe(204)
      expect((await fx.editor('DELETE', '/S')).statusCode).toBe(204)
      expect((await fx.editor('GET', '')).json()).toEqual({ groups: [] })
    })
  })

  it('글자 규칙을 어기면 400', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      expect((await fx.editor('POST', '', { key: 'order', name: '소문자' })).statusCode).toBe(400)
      expect((await fx.editor('POST', '', { key: 'S', name: '' })).statusCode).toBe(400)
      expect((await fx.editor('POST', '', { key: 'S', name: `방향${String.fromCodePoint(0x202e)}제어` })).statusCode).toBe(400)
      await fx.editor('POST', '', { key: 'S', name: '상태' })
      expect((await fx.editor('POST', '/S/items', { value: 'x'.repeat(41), name: '긴 값' })).statusCode).toBe(400)
      expect((await fx.editor('POST', '/S/items', { value: 'A', name: `줄${String.fromCodePoint(0x2028)}바꿈` })).statusCode).toBe(400)
      expect((await fx.editor('POST', '/S/items', { value: 'A\u0000', name: '널' })).statusCode).toBe(400)
    })
  })

  it('상한 — 항목 201 번째 · 그룹 501 번째는 400', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      await fx.editor('POST', '', { key: 'S', name: '상태' })
      // 상한까지는 DB 에 바로 채운다 — 요청 200 번은 이 케이스의 몫이 아니다.
      const group = await ctx.db.selectFrom('code_groups').select('id').where('key', '=', 'S').executeTakeFirstOrThrow()
      await ctx.db
        .insertInto('code_items')
        .values(
          Array.from({ length: CODE_ITEMS_MAX - 1 }, (_, i) => ({ group_id: group.id, value: `V${i}`, name: `이름${i}`, sort_order: i })),
        )
        .execute()
      expect((await fx.editor('POST', '/S/items', { value: 'LAST', name: '마지막' })).statusCode).toBe(201)
      expect((await fx.editor('POST', '/S/items', { value: 'OVER', name: '넘침' })).statusCode).toBe(400)
      await ctx.db
        .insertInto('code_groups')
        .values(
          Array.from({ length: CODE_GROUPS_MAX - 2 }, (_, i) => ({
            project_id: fx.project.id,
            key: `G${i}`,
            name: `그룹${i}`,
            sort_order: i + 1,
          })),
        )
        .execute()
      expect((await fx.editor('POST', '', { key: 'LAST', name: '마지막' })).statusCode).toBe(201)
      expect((await fx.editor('POST', '', { key: 'OVER', name: '넘침' })).statusCode).toBe(400)
    })
  })
})
