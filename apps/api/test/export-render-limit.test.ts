/**
 * **`EXPORT_RENDER_LIMIT` — 동시에 뜨는 화면 그리기 브라우저 수를 env 로 준다.**
 *
 * 칸 자체(줄 서기 · 칸 순서)는 `services/export-worker.ts`의 «칸이 둘이다»가 갖고 `test/export-worker.test.ts`가 잰다. 여기서
 * 재는 것은 **env 에서 풀까지의 배선** — 값이 `ApiConfig`에 어떤 모양으로 앉는가와, 앉은 값이 라우트의 풀에 닿는가다. 풀에 안
 * 닿으면 env 를 바꿔도 풀은 기본값 칸으로 돌아 조용히 아무 일도 안 한다.
 *
 * **브라우저를 안 띄운다** — 가짜 그리는 자가 겹친 수를 센다. 진짜 브라우저의 메모리는 최상위 README 「배포하려면」이 갖는다.
 */
import type { PageDocument } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config'
import { EXPORT_RENDER_LIMIT } from '../src/services/export-worker'
import type { ScreenBatch, ScreenJob, ScreenRenderer } from '../src/services/screen-render'
import { createMenuNode, createPage, createProject, signup, testConfig, withApi, type TestContext } from './helpers'

const BASE = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://wirebound:wirebound@127.0.0.1:5433/wirebound_test',
} as const

describe('EXPORT_RENDER_LIMIT 을 읽는다', () => {
  it('안 주거나 비우면 `EXPORT_RENDER_LIMIT` 이다 — 주석만 푼 줄을 기동 거절하지 않는다', () => {
    expect(loadConfig({ ...BASE }).exportRenderLimit).toBe(EXPORT_RENDER_LIMIT)
    expect(loadConfig({ ...BASE, EXPORT_RENDER_LIMIT: '' }).exportRenderLimit).toBe(EXPORT_RENDER_LIMIT)
  })

  it('주면 그 수다', () => {
    expect(loadConfig({ ...BASE, EXPORT_RENDER_LIMIT: '1' }).exportRenderLimit).toBe(1)
    expect(loadConfig({ ...BASE, EXPORT_RENDER_LIMIT: '4' }).exportRenderLimit).toBe(4)
  })

  it('0 · 숫자가 아닌 값은 기동 거절이다 — 0 을 받으면 풀이 1 로 올려 읽어 적은 값과 다른 수로 돈다', () => {
    expect(() => loadConfig({ ...BASE, EXPORT_RENDER_LIMIT: '0' })).toThrow(/EXPORT_RENDER_LIMIT은 1 이상/)
    expect(() => loadConfig({ ...BASE, EXPORT_RENDER_LIMIT: 'two' })).toThrow(/EXPORT_RENDER_LIMIT은 숫자/)
  })
})

/**
 * 겹친 그리기 수를 센다. 들어온 그리기는 둘째가 들어오거나 `HOLD_MS`가 지날 때까지 쥔다 — 칸이 둘이면 둘째가 곧바로 들어와
 * 둘 다 풀리고, 칸이 하나면 첫째가 한도까지 쥔 뒤 끝나야 둘째가 들어온다.
 */
const HOLD_MS = 400

class OverlapRenderer implements ScreenRenderer {
  active = 0
  maxActive = 0
  calls = 0
  private wake: (() => void)[] = []

  async render(job: ScreenJob): Promise<ScreenBatch> {
    this.calls += 1
    this.active += 1
    this.maxActive = Math.max(this.maxActive, this.active)
    for (const wake of this.wake.splice(0)) wake()
    if (this.active < 2)
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, HOLD_MS)
        this.wake.push(() => {
          clearTimeout(timer)
          resolve()
        })
      })
    this.active -= 1
    return { results: job.pages.map(() => ({ ok: false, reason: '가짜' })), fontWarning: null }
  }
}

function doc(rootId: string): PageDocument {
  return { version: 5, root: { id: rootId, type: 'Page', children: [] } }
}

/** 페이지 하나짜리 프로젝트 둘 — 사람 몫(`EXPORT_PERSON_JOB_LIMIT` 2)에 안 걸리게 사람도 둘이다. */
async function twoProjects(ctx: TestContext): Promise<{ cookie: { wb_session: string }; projectId: string }[]> {
  const out = []
  for (const slug of ['render-limit-a', 'render-limit-b']) {
    const user = await signup(ctx)
    const project = await createProject(ctx, user.cookie, { name: slug, slug })
    const menu = await createMenuNode(ctx, user.cookie, project.id, { title: '메뉴' })
    const page = await createPage(ctx, user.cookie, project.id, menu.id, { title: '페이지' })
    const put = await ctx.app.inject({
      method: 'PUT',
      url: `/api/projects/${project.id}/pages/${page.id}/schema`,
      cookies: user.cookie,
      payload: { schema: doc(`n_${slug.at(-1)}`) },
    })
    if (put.statusCode !== 200) throw new Error(`스키마 픽스처가 실패했습니다 (${put.statusCode}): ${put.body}`)
    out.push({ cookie: user.cookie, projectId: project.id })
  }
  return out
}

async function overlapWith(exportRenderLimit: number): Promise<OverlapRenderer> {
  const renderer = new OverlapRenderer()
  await withApi(
    async (ctx) => {
      const projects = await twoProjects(ctx)
      const replies = await Promise.all(
        projects.map((fixture) =>
          ctx.app.inject({ method: 'GET', url: `/api/projects/${fixture.projectId}/export?format=pptx`, cookies: fixture.cookie }),
        ),
      )
      expect(replies.map((reply) => reply.statusCode)).toEqual([200, 200])
    },
    { config: { ...testConfig(), exportRenderLimit }, screenRenderer: renderer },
  )
  return renderer
}

describe('EXPORT_RENDER_LIMIT 이 라우트의 풀에 닿는다', () => {
  it('1 이면 pptx 둘의 그리기가 안 겹친다', async () => {
    const renderer = await overlapWith(1)
    expect([renderer.calls, renderer.maxActive]).toEqual([2, 1])
  })

  it('2 면 겹친다 — 위 케이스의 자가 겹침을 볼 수 있다는 카나리아', async () => {
    const renderer = await overlapWith(2)
    expect([renderer.calls, renderer.maxActive]).toEqual([2, 2])
  })
})
