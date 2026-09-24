/**
 * **끊긴 내보내기는 그 사람의 몫을 곧바로 돌려준다** — 웹 패널은 형식을 바꾸면 앞 미리보기를 끊고 새로 부른다. 끊긴 요청의
 * 자리가 행 읽기가 끝날 때까지 남으면 빠르게 두 번 바꾼 사람의 셋째가 «내 내보내기가 이미 돌고 있습니다» 503 이다(사람마다
 * 떠 있는 일 2 — `src/services/export-worker.ts`의 «한 사람이 줄을 다 쥐지 않는다»). 전체 자리(`jobs`)는 읽기가 끝날 때까지
 * 남는다 — 읽는 동안 메모리를 쥐는 것은 그대로다(`src/routes/export.ts`의 `admitted`). 진짜 포트로 잰다 — 끊김은 소켓이 닫혀야 선다.
 */
import type { PageDocument } from '@wirebound/schema'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createMenuNode, createPage, createProject, resetRealData, signup, withRealApi, type TestContext } from './helpers'

beforeEach(resetRealData)
afterEach(resetRealData)

/** 글 노드 7000 개 — 한 장이 약 500KB 다(`export-worker-abort.test.ts`와 같은 크기). 읽기에 수십 ms 가 든다. */
function bigDocument(prefix: string): PageDocument {
  return {
    version: 1,
    root: {
      id: `${prefix}_root`,
      type: 'Page',
      children: Array.from({ length: 7000 }, (_, i) => ({ id: `${prefix}_${i}`, type: 'Text', props: { content: `가나다라마바사아자차카타파하 ${i}` } })),
    },
  }
}

async function putSchema(ctx: TestContext, cookie: { wb_session: string }, projectId: string, pageId: string, schema: PageDocument): Promise<void> {
  const res = await ctx.app.inject({ method: 'PUT', url: `/api/projects/${projectId}/pages/${pageId}/schema`, cookies: cookie, payload: { schema } })
  if (res.statusCode !== 200) throw new Error(`putSchema 픽스처가 실패했습니다 (status ${res.statusCode}): ${res.body}`)
}

describe('형식을 빨리 바꾸면 — 끊긴 미리보기의 자리', () => {
  /**
   * 큰 프로젝트(500KB 페이지 12 장)의 미리보기 둘을 보내자마자 끊고, 곧바로 **작은 프로젝트**의 미리보기를 부른다(셋째가
   * 빨리 끝나야 판이 짧다 — 사람 몫은 프로젝트를 가리지 않는다). 끊는 시각이 1–5ms 면 끊김이 행을 읽기 전 · 읽는 중에 닿는다 —
   * 사람 몫을 읽기 끝까지 쥐면 셋째가 503 이다(1ms 2/4 · 5ms 4/4 — 20ms 이상은 0/16: 그때는 워커가 끊김을 보고 곧바로 놓는다).
   */
  it('앞의 둘을 곧바로 끊고 셋째를 부르면 셋째가 돈다 — «내 내보내기» 503 이 아니다', async () => {
    await withRealApi(async (ctx) => {
      const user = await signup(ctx)
      const project = await createProject(ctx, user.cookie)
      const menu = await createMenuNode(ctx, user.cookie, project.id)
      for (let index = 0; index < 12; index++) {
        const page = await createPage(ctx, user.cookie, project.id, menu.id, { title: `p${index}` })
        await putSchema(ctx, user.cookie, project.id, page.id, bigDocument(`p${index}`))
      }
      const small = await createProject(ctx, user.cookie)
      const smallMenu = await createMenuNode(ctx, user.cookie, small.id)
      await createPage(ctx, user.cookie, small.id, smallMenu.id, { title: 's' })
      const bigUrl = `http://127.0.0.1:${ctx.port}/api/projects/${project.id}/export/preview`
      const smallUrl = `http://127.0.0.1:${ctx.port}/api/projects/${small.id}/export/preview?format=html`
      const headers = { cookie: `wb_session=${user.cookie.wb_session}` }
      const statuses: number[] = []
      for (const abortMs of [1, 5]) {
        for (let round = 0; round < 4; round++) {
          for (const format of ['pptx', 'html']) {
            const controller = new AbortController()
            const gone = fetch(`${bigUrl}?format=${format}`, { headers, signal: controller.signal }).catch(() => undefined)
            await new Promise((resolve) => setTimeout(resolve, abortMs))
            controller.abort()
            await gone
          }
          const third = await fetch(smallUrl, { headers })
          await third.arrayBuffer()
          statuses.push(third.status)
          // 끊긴 둘의 전체 자리가 풀릴 틈 — 다음 판이 앞 판의 읽기와 겹치지 않게.
          await new Promise((resolve) => setTimeout(resolve, 1500))
        }
      }
      expect(statuses).toEqual(Array(8).fill(200))
    })
  }, 120_000)
})
