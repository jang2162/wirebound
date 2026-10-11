/**
 * **요청이 끊기면 내보내기 일을 버린다**(`src/routes/export.ts`의 `abortOnClientGone` · `quietWhenGone`) — 진짜 포트로 잰다.
 * `inject()`는 소켓을 만들지 않아 «연결이 닫혔다»를 태울 수 없다. 풀 쪽(줄에서 빼기 · 워커째 끝내기)은
 * `test/export-worker.test.ts`의 «끊김»이 잰다.
 */
import { Writable } from 'node:stream'
import type { PageDocument } from '@wirebound/schema'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMenuNode, createPage, createProject, resetRealData, signup, testConfig, withRealApi, type TestContext } from './helpers'

beforeEach(resetRealData)
afterEach(resetRealData)

/** 글 노드 7000 개 — 한 장이 약 500KB 다. 열두 장이면 워커가 도는 동안 끊을 틈이 넉넉하다. */
function bigDocument(prefix: string): PageDocument {
  return {
    version: 1,
    root: {
      id: `${prefix}_root`,
      type: 'Page',
      children: Array.from({ length: 7000 }, (_, i) => ({
        id: `${prefix}_${i}`,
        type: 'Text',
        props: { content: `가나다라마바사아자차카타파하 ${i}` },
      })),
    },
  }
}

async function putSchema(
  ctx: TestContext,
  cookie: { wb_session: string },
  projectId: string,
  pageId: string,
  schema: PageDocument,
): Promise<void> {
  const res = await ctx.app.inject({
    method: 'PUT',
    url: `/api/projects/${projectId}/pages/${pageId}/schema`,
    cookies: cookie,
    payload: { schema },
  })
  if (res.statusCode !== 200) throw new Error(`putSchema 픽스처가 실패했습니다 (status ${res.statusCode}): ${res.body}`)
}

describe('요청이 끊기면 (진짜 포트)', () => {
  /** 로그를 모으는 자 — 테스트 기본 로그 수준은 `silent`라 `info`로 덮어 쓴다(`helpers.ts`의 `WithApiOptions`). */
  function captureLogs(): { lines: string[]; options: { loggerStream: Writable; config: ReturnType<typeof testConfig> } } {
    const lines: string[] = []
    const loggerStream = new Writable({
      write(chunk, _encoding, callback) {
        lines.push(String(chunk))
        callback()
      },
    })
    return { lines, options: { loggerStream, config: { ...testConfig(), logLevel: 'info' } } }
  }

  it('핸들러에 닿기 전에 이미 끊겼어도 일을 시작하지 않는다', async () => {
    const { lines, options } = captureLogs()
    await withRealApi(
      async (ctx) => {
        const user = await signup(ctx)
        const project = await createProject(ctx, user.cookie, { name: '먼저 끊김', slug: 'worker-abort-early' })
        const menu = await createMenuNode(ctx, user.cookie, project.id, { title: '메뉴' })
        await createPage(ctx, user.cookie, project.id, menu.id, { title: 'p' })

        const controller = new AbortController()
        const request = fetch(`http://127.0.0.1:${ctx.port}/api/projects/${project.id}/export`, {
          headers: { cookie: `wb_session=${user.cookie.wb_session}` },
          signal: controller.signal,
        }).catch((error: unknown) => error)
        await vi.waitFor(() => expect(lines.join('')).toContain('끊길 때까지 핸들러 앞에서 기다린다'))
        controller.abort()
        expect(await request).toBeInstanceOf(Error)

        await vi.waitFor(() => expect(lines.join('')).toContain('요청이 끊겨 내보내기를 멈췄다'), { timeout: 20_000 })
      },
      {
        ...options,
        // 가드가 DB 를 읽는 사이에 끊긴 판 — 그때는 `close`가 핸들러가 듣기 **전에** 지나간다.
        register: async (app) => {
          app.addHook('preHandler', async (request) => {
            if (!request.url.includes('/export')) return
            request.log.info('끊길 때까지 핸들러 앞에서 기다린다')
            if (!request.raw.socket.destroyed) await new Promise((resolve) => request.raw.socket.once('close', resolve))
          })
        },
      },
    )
  }, 60_000)

  it('일을 버리고 답하지 않는다 — «처리되지 않은 예외»로 적지 않는다', async () => {
    const { lines, options } = captureLogs()
    await withRealApi(async (ctx) => {
      const { port } = ctx
      const user = await signup(ctx)
      const project = await createProject(ctx, user.cookie, { name: '끊김', slug: 'worker-abort' })
      const menu = await createMenuNode(ctx, user.cookie, project.id, { title: '메뉴' })
      for (let index = 0; index < 12; index++) {
        const page = await createPage(ctx, user.cookie, project.id, menu.id, { title: `p${index}` })
        await putSchema(ctx, user.cookie, project.id, page.id, bigDocument(`p${index}`))
      }

      const controller = new AbortController()
      const request = fetch(`http://127.0.0.1:${port}/api/projects/${project.id}/export`, {
        headers: { cookie: `wb_session=${user.cookie.wb_session}` },
        signal: controller.signal,
      }).catch((error: unknown) => error)
      await new Promise((resolve) => setTimeout(resolve, 300))
      controller.abort()
      expect(await request).toBeInstanceOf(Error)

      await vi.waitFor(() => expect(lines.join('')).toContain('요청이 끊겨 내보내기를 멈췄다'), { timeout: 20_000 })
      expect(lines.join('')).not.toContain('처리되지 않은 예외')
    }, options)
  }, 60_000)
})
