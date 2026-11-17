/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withRealApi`를 쓴다.
 *
 * **«화면 상태 바꾸기»(`setViewState`)가 MCP · CLI 의 페이지 쓰기를 지난다** — 둘은 API 토큰으로 `PATCH …/ops` 를 부른다(MCP `patch_page` ·
 * `wireb page patch`). 봉투 · 검증이 새 액션을 받는지(200 · 경고 없음), 그 대상 상태를 목록에서 지우는 편집이 422 가 아니라 경고
 * (`view-state-missing`)와 함께 저장되는지를 잰다 — 상태 대상은 노드 대상과 같은 무게다(설계 spec `2026-11-17-set-view-state-design.md`).
 */
import type { PageDocument } from '@wirebound/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CLIENT_KIND_HEADER } from '../src/auth/actor'
import { createMenuNode, createPage, createProject, resetRealData, signup, withRealApi } from './helpers'

beforeEach(resetRealData)
afterEach(resetRealData)

const opener = (id: string, target: string) => ({
  id,
  type: 'Button',
  props: { label: id },
  interactions: [{ on: 'click', actions: [{ type: 'setViewState', target }] }],
})

describe('토큰으로 쓰는 setViewState', () => {
  it('새 액션을 받아 저장하고, 대상 상태를 지우는 편집은 경고와 함께 저장된다', async () => {
    await withRealApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const page = await createPage(ctx, owner.cookie, project.id, menu.id)
      const issued = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/tokens`,
        cookies: owner.cookie,
        payload: { name: 'mcp' },
      })
      expect(issued.statusCode, issued.body).toBe(201)
      const token = (issued.json() as { value: string }).value
      const base = `/api/projects/${project.id}/pages/${page.id}`
      const headers = { authorization: `Bearer ${token}`, [CLIENT_KIND_HEADER]: 'mcp' }
      const read = async () => {
        const res = await ctx.app.inject({ method: 'GET', url: base, headers })
        expect(res.statusCode, res.body).toBe(200)
        return res.json() as { schema: PageDocument; headSeq: number }
      }
      const patch = async (ops: unknown[]) => {
        const res = await ctx.app.inject({
          method: 'PATCH',
          url: `${base}/ops`,
          headers,
          payload: { baseSeq: (await read()).headSeq, ops },
        })
        return { status: res.statusCode, body: res.json() as { warnings?: { code: string; nodeId: string | null }[] } }
      }

      const added = await patch([
        {
          op: 'add',
          path: '/viewStates',
          value: [
            { id: 's_detail', name: '상세 열림' },
            { id: 's_temp', name: '임시' },
          ],
        },
        { op: 'add', path: '/root/children/0', value: opener('n_add', 's_detail') },
        { op: 'add', path: '/root/children/1', value: opener('n_cancel', 'default') },
        { op: 'add', path: '/root/children/2', value: opener('n_ghost', 's_temp') },
      ])
      expect(added).toEqual({ status: 200, body: expect.not.objectContaining({ warnings: expect.anything() }) })
      const saved = (await read()).schema
      expect(saved.root.children!.map((node) => node.interactions?.[0]?.actions[0])).toEqual([
        { type: 'setViewState', target: 's_detail' },
        { type: 'setViewState', target: 'default' },
        { type: 'setViewState', target: 's_temp' },
      ])

      const removed = await patch([
        { op: 'test', path: '/viewStates/1/id', value: 's_temp' },
        { op: 'remove', path: '/viewStates/1' },
      ])
      expect(removed.status).toBe(200)
      expect(removed.body.warnings?.map((issue) => [issue.code, issue.nodeId])).toEqual([['view-state-missing', 'n_ghost']])
      expect((await read()).schema.viewStates).toEqual([{ id: 's_detail', name: '상세 열림' }])
    })
  })

  it('액션의 모양은 봉투가 본다 — 대상 밖의 키는 400', async () => {
    await withRealApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const page = await createPage(ctx, owner.cookie, project.id, menu.id)
      const base = `/api/projects/${project.id}/pages/${page.id}`
      const head = await ctx.app.inject({ method: 'GET', url: base, cookies: owner.cookie })
      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `${base}/ops`,
        cookies: owner.cookie,
        payload: {
          baseSeq: (head.json() as { headSeq: number }).headSeq,
          ops: [
            {
              op: 'add',
              path: '/root/children/0',
              value: {
                id: 'n_bad',
                type: 'Button',
                interactions: [{ on: 'click', actions: [{ type: 'setViewState', target: 'default', value: 1 }] }],
              },
            },
          ],
        },
      })
      expect(res.statusCode).not.toBe(200)
      expect(res.statusCode).toBeGreaterThanOrEqual(400)
    })
  })
})
