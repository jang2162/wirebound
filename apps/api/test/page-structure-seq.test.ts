/**
 * **`pages.structure_seq` 는 구조가 바뀐 편집에서만 오른다**(`0023-pages-structure-seq` · `services/edit-pipeline.ts`). 하트비트의 판정 도장이 이 값을 문서 축으로 읽는다
 * (`lock/store.ts` 의 `isJudged`) — 구조를 바꾼 편집이 번호를 안 올리면 낡은 판정으로 겹친 잠금이 서고, 내용만 고친 편집이 올리면 도장이 편집마다 깨진다
 * (`ws-lock-cost.test.ts` 의 «편집 직전의 하트비트»).
 */
import { describe, expect, it } from 'vitest'
import { createMenuNode, createPage, createProject, signup, withApi } from './helpers'

describe('편집이 구조 번호를 올리는 때', () => {
  it('props 만 고치면 head_seq 만 오르고, 더하기 · 옮기기 · 지우기는 둘 다 오른다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const page = await createPage(ctx, owner.cookie, project.id, menu.id)
      const P = `/api/projects/${project.id}/pages/${page.id}`
      const seqs = async () => {
        const row = await ctx.db.selectFrom('pages').select(['head_seq', 'structure_seq']).where('id', '=', page.id).executeTakeFirstOrThrow()
        return { head: Number(row.head_seq), structure: Number(row.structure_seq) }
      }
      const edit = async (ops: unknown[]) => {
        const { head } = await seqs()
        const r = await ctx.app.inject({ method: 'PATCH', url: `${P}/ops`, cookies: owner.cookie, payload: { baseSeq: head, ops } })
        expect(r.statusCode, r.body).toBe(200)
      }
      const text = (id: string) => ({ id, type: 'Text', props: { content: id } })

      const start = await seqs()
      expect(start.structure).toBe(start.head)

      await edit([{ op: 'add', path: '/root/children/0', value: { id: 'n_sec', type: 'Section', children: [] } }])
      const added = await seqs()
      expect({ head: added.head, structure: added.structure }).toEqual({ head: start.head + 1, structure: start.head + 1 })

      await edit([{ op: 'add', path: '/root/children/1', value: text('n_a') }])
      const second = await seqs()
      expect(second.structure).toBe(second.head)

      // 내용만 — 구조 번호는 그대로다.
      await edit([{ op: 'replace', path: '/root/children/1/props', value: { content: '바꿈' } }])
      const content = await seqs()
      expect(content).toEqual({ head: second.head + 1, structure: second.structure })

      // 옮기기(Section 안으로) — 오른다.
      await edit([{ op: 'move', from: '/root/children/1', path: '/root/children/0/children/0' }])
      const moved = await seqs()
      expect(moved).toEqual({ head: content.head + 1, structure: content.head + 1 })

      // 같은 노드를 통째로 replace 해도 id · 부모가 같으면 구조는 그대로다.
      await edit([{ op: 'replace', path: '/root/children/0/children/0', value: text('n_a') }])
      const replaced = await seqs()
      expect(replaced).toEqual({ head: moved.head + 1, structure: moved.structure })

      // 노드를 통째로 다른 노드로 replace 하면 구조가 바뀐다 — `replace` 는 구조를 바꿀 수 있다.
      await edit([{ op: 'replace', path: '/root/children/0/children/0', value: text('n_b') }])
      const swapped = await seqs()
      expect(swapped).toEqual({ head: replaced.head + 1, structure: replaced.head + 1 })

      // 지우기 — 오른다.
      await edit([{ op: 'remove', path: '/root/children/0/children/0' }])
      const removed = await seqs()
      expect(removed).toEqual({ head: swapped.head + 1, structure: swapped.head + 1 })
    })
  })
})
