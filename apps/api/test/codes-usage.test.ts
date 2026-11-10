/** 공통코드 사용처(`GET …/codes/usage` · `…/codes/usage-counts`) — 페이지 · 레이아웃 · 프로젝트 모듈을 세고 개인 모듈은 안 센다. */
import { describe, expect, it } from 'vitest'
import { createMenuNode, createPage, createProject, signup, withApi } from './helpers'

const bound = (id: string, item: string) => ({ id, type: 'Affix', props: { text: '옛 이름' }, code: { group: 'ORDER_STATUS', item } })

describe('공통코드 사용처', () => {
  it('페이지 둘 · 레이아웃 · 모듈을 내고 개인 모듈은 안 센다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const send = (method: 'POST' | 'PATCH' | 'GET', url: string, payload?: Record<string, unknown>) =>
        ctx.app.inject({ method, url, cookies: owner.cookie, ...(payload === undefined ? {} : { payload }) })
      const pages = [await createPage(ctx, owner.cookie, project.id, menu.id), await createPage(ctx, owner.cookie, project.id, menu.id)]
      for (const [index, page] of pages.entries()) {
        const res = await send('PATCH', `/api/projects/${project.id}/pages/${page.id}/ops`, {
          baseSeq: 0,
          ops: [{ op: 'add', path: '/root/children/-', value: bound(`n_p${index}`, 'WAIT') }],
        })
        expect(res.statusCode, res.body).toBe(200)
      }
      const unrelated = await createPage(ctx, owner.cookie, project.id, menu.id)
      await send('PATCH', `/api/projects/${project.id}/pages/${unrelated.id}/ops`, {
        baseSeq: 0,
        ops: [{ op: 'add', path: '/root/children/-', value: bound('n_done', 'DONE') }],
      })
      await ctx.db
        .insertInto('layouts')
        .values({
          project_id: project.id,
          name: '기본 틀',
          schema: JSON.stringify({
            version: 1,
            root: { id: 'n_lr', type: 'Page', children: [bound('n_lay', 'WAIT'), { id: 'n_slot', type: 'Slot' }] },
          }),
        })
        .execute()
      const module = await send('POST', `/api/projects/${project.id}/modules`, { name: '상태 칩', nodes: [bound('n_mod', 'WAIT')] })
      expect(module.statusCode, module.body).toBe(201)
      const personal = await send('POST', '/api/me/modules', { name: '내 칩', nodes: [bound('n_mine', 'WAIT')] })
      expect(personal.statusCode, personal.body).toBe(201)

      const usage = await send('GET', `/api/projects/${project.id}/codes/usage?group=ORDER_STATUS&item=WAIT`)
      expect(usage.statusCode, usage.body).toBe(200)
      const hits = usage.json().usage as { kind: string; id: string; title: string; nodes: { nodeId: string; name: string }[] }[]
      expect(hits.map((hit) => [hit.kind, hit.nodes.map((node) => node.nodeId)])).toEqual([
        ['page', ['n_p0']],
        ['page', ['n_p1']],
        ['layout', ['n_lay']],
        ['module', ['n_mod']],
      ])
      expect(hits[0]!.id).toBe(pages[0]!.id)
      expect(hits[3]!.title).toBe('상태 칩')

      const counts = await send('GET', `/api/projects/${project.id}/codes/usage-counts`)
      expect(counts.json()).toEqual({ counts: { ORDER_STATUS: { group: 5, items: { WAIT: 4, DONE: 1 } } } })
    })
  })

  it('그룹 키 꼴이 아니면 400', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const res = await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}/codes/usage?group=bad`, cookies: owner.cookie })
      expect(res.statusCode).toBe(400)
    })
  })
})
