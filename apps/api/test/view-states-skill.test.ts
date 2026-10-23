/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withRealApi`를 쓴다.
 *
 * **MCP 스킬 문서의 화면 상태 꼴이 저장 경계를 지난다** — `packages/mcp/skill/SKILL.md` 「화면 상태를 다룰 때」의 예(`<!-- wirebound:example
 * … -->` 뒤의 `json` 블록)를 **문서에서 읽어 글자 그대로** `PATCH …/ops` 로 보낸다. `patch_page` 는 그 본문(`{ baseSeq, ops }`)을 그대로
 * 이 라우트에 넘기므로(`packages/mcp/src/handlers.ts` 의 `patchPage`) 여기서 지나면 에이전트가 스킬대로 낸 편집도 지난다. 손으로 옮긴
 * 사본을 보내면 문서가 틀려도 조용하다.
 *
 * 예는 차례로 잇는다 — 상태 더하기 → 하위 상태 더하기 → 노드를 그 상태에서만 보이기 → 상태 지우기. 예의 경로는 이 문서의 모양(`/root/children/1`
 * 이 보임을 걸 단추)을 전제한다.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { installCatalog, partitionIssues, validatePage, type PageDocument, type PatchOp } from '@wirebound/schema'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createMenuNode, createPage, createProject, resetRealData, signup, withRealApi } from './helpers'

beforeAll(() => {
  installCatalog()
})
beforeEach(resetRealData)
afterEach(resetRealData)

/** 스킬 문서의 예 — 표지 이름 → 연산. vitest 의 cwd 는 저장소 뿌리다. */
function skillExamples(): Map<string, PatchOp[]> {
  const skill = readFileSync(resolve(process.cwd(), 'packages/mcp/skill/SKILL.md'), 'utf8')
  const found = new Map<string, PatchOp[]>()
  for (const match of skill.matchAll(/<!-- wirebound:example ([a-z-]+) -->\s*```json\n([\s\S]*?)```/g)) {
    found.set(match[1]!, JSON.parse(match[2]!) as PatchOp[])
  }
  return found
}

describe('스킬 문서의 화면 상태 꼴', () => {
  it('문서에서 예 넷을 실제로 읽는다 — 파서가 어긋나면 아래가 빈 채로 돈다', () => {
    expect([...skillExamples().keys()]).toEqual(['add-state', 'add-child-state', 'show-only', 'remove-state'])
  })

  it('상태 더하기 → 하위 상태 → 보임 → 상태 지우기가 차례로 저장되고, 저장된 문서에 검증 오류가 없다', async () => {
    const examples = skillExamples()
    await withRealApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const page = await createPage(ctx, owner.cookie, project.id, menu.id)
      const base = `/api/projects/${project.id}/pages/${page.id}`
      const put = await ctx.app.inject({
        method: 'PUT',
        url: `${base}/schema`,
        cookies: owner.cookie,
        payload: {
          schema: {
            version: 3,
            root: {
              id: 'n_root',
              type: 'Page',
              children: [
                { id: 'n_title', type: 'Text', props: { content: '회원' } },
                { id: 'n_approve', type: 'Button', props: { label: '보기' } },
              ],
            },
          },
        },
      })
      expect(put.statusCode, put.body).toBe(200)

      let seq = 1
      const send = async (name: string): Promise<PageDocument> => {
        const res = await ctx.app.inject({
          method: 'PATCH',
          url: `${base}/ops`,
          cookies: owner.cookie,
          payload: { baseSeq: seq, ops: examples.get(name) },
        })
        expect(res.statusCode, `${name}: ${res.body}`).toBe(200)
        seq = (res.json() as { seq: number }).seq
        const got = await ctx.app.inject({ method: 'GET', url: base, cookies: owner.cookie })
        const document = (got.json() as { schema: PageDocument }).schema
        expect(partitionIssues(validatePage(document)).errors, name).toEqual([])
        return document
      }

      const added = await send('add-state')
      expect(added.viewStates).toEqual([{ id: 's_login', name: '로그인' }])

      const child = await send('add-child-state')
      expect(child.viewStates).toEqual([
        { id: 's_login', name: '로그인' },
        { id: 's_admin', name: '관리자', parent: 's_login' },
      ])

      const shown = await send('show-only')
      expect(shown.root.children![1]).toMatchObject({ id: 'n_approve', visibility: { mode: 'only', states: ['s_admin'] } })

      const removed = await send('remove-state')
      expect(removed.viewStates).toEqual([{ id: 's_login', name: '로그인' }])
      expect(removed.root.children!.map((node) => node.id)).toEqual(['n_title'])
    })
  })
})
