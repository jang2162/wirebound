/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withRealApi`를 쓴다.
 *
 * **MCP 스킬 문서의 레이아웃 꼴이 저장 경계를 지난다** — `packages/mcp/skill/SKILL.md` 「고칠 때」 의 레이아웃 예(`<!-- wirebound:layout-example
 * … -->` 뒤의 `json` 블록)를 **문서에서 읽어 글자 그대로** `PATCH …/ops` 로 보낸다(`view-states-skill.test.ts` 와 같은 자세 — `patch_page` 는 그
 * 본문을 그대로 이 라우트에 넘긴다). 표지 이름을 화면 상태 예(`wirebound:example`)와 가른 까닭: 그 케이스가 예 다섯의 목록을 글자로 견준다.
 *
 * 예는 차례로 잇는다 — API 가 지은 빈 페이지(`blank`) → 서브페이지 → 팝업(바닥 단추째) → 서브페이지. 팝업 경계를 넘는 두 예는 뿌리 갈아 끼우기를 함께
 * 실어야 지난다(`layout-root-mismatch` — 그 거절 자체는 `popup-pages.test.ts` 가 잰다).
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

/** 스킬 문서의 레이아웃 예 — 표지 이름 → 연산. vitest 의 cwd 는 저장소 뿌리다. */
function layoutExamples(): Map<string, PatchOp[]> {
  const skill = readFileSync(resolve(process.cwd(), 'packages/mcp/skill/SKILL.md'), 'utf8')
  const found = new Map<string, PatchOp[]>()
  for (const match of skill.matchAll(/<!-- wirebound:layout-example ([a-z-]+) -->\s*```json\n([\s\S]*?)```/g)) {
    found.set(match[1]!, JSON.parse(match[2]!) as PatchOp[])
  }
  return found
}

describe('스킬 문서의 레이아웃 꼴', () => {
  it('문서에서 예 셋을 실제로 읽는다 — 파서가 어긋나면 아래가 빈 채로 돈다', () => {
    expect([...layoutExamples().keys()]).toEqual(['to-subpage', 'to-popup', 'from-popup'])
  })

  it('빈 → 서브페이지 → 팝업 → 서브페이지가 차례로 저장되고, 저장된 문서에 검증 오류가 없다', async () => {
    const examples = layoutExamples()
    await withRealApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const page = await createPage(ctx, owner.cookie, project.id, menu.id)
      const base = `/api/projects/${project.id}/pages/${page.id}`
      const read = async (): Promise<{ schema: PageDocument; headSeq: number }> => {
        const got = await ctx.app.inject({ method: 'GET', url: base, cookies: owner.cookie })
        expect(got.statusCode, got.body).toBe(200)
        return got.json() as { schema: PageDocument; headSeq: number }
      }

      const first = await read()
      // 예의 첫 `test` 가 기대는 바탕 — API 의 기본 레이아웃이 `blank` 이고 뿌리가 빈 `Page` 다.
      expect(first.schema.layout).toBe('blank')
      expect(first.schema.root).toMatchObject({ type: 'Page', children: [] })

      let seq = first.headSeq
      const send = async (name: string): Promise<PageDocument> => {
        const res = await ctx.app.inject({
          method: 'PATCH',
          url: `${base}/ops`,
          cookies: owner.cookie,
          payload: { baseSeq: seq, ops: examples.get(name) },
        })
        expect(res.statusCode, `${name}: ${res.body}`).toBe(200)
        seq = (res.json() as { seq: number }).seq
        const document = (await read()).schema
        expect(partitionIssues(validatePage(document)).errors, name).toEqual([])
        return document
      }

      const subpage = await send('to-subpage')
      expect([subpage.layout, subpage.root.type]).toEqual(['subpage', 'Page'])

      const popup = await send('to-popup')
      expect([popup.layout, popup.root.type, popup.root.props]).toEqual(['popup', 'Popup', { title: '회원 상세' }])
      expect(popup.root.zones?.footer?.map((node) => node.id)).toEqual(['n_close'])

      const back = await send('from-popup')
      expect([back.layout, back.root.type, back.root.props, back.root.zones]).toEqual(['subpage', 'Page', undefined, undefined])
      // 바닥 단추는 지우지 않고 몸통 끝으로 옮긴다.
      expect(back.root.children?.map((node) => node.id)).toEqual(['n_close'])
    })
  })
})
