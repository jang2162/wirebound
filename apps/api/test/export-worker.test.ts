/**
 * **내보내기의 CPU 몫이 이벤트 루프 밖에서 돈다**(`src/services/export-worker.ts`).
 *
 * | 무엇을 | 어떻게 |
 * |---|---|
 * | 워커가 낸 것이 같은 스레드에서 낸 것과 **바이트로 같다** | 라우트(워커)의 zip 을 풀어 `exportProjectBundle`·`exportProjectPptx`(같은 스레드)의 파일과 엔트리마다 견준다 |
 * | 메인의 루프가 서지 않는다 | 같은 일을 같은 스레드에서 돈 시간과, 워커로 도는 동안 메인의 타이머가 벌어진 최장 간격을 견준다 |
 * | 입력을 한 장씩 넘긴다 | 워커로 가는 메시지를 센다 |
 * | 도메인 에러 · 끊김 · 워커의 죽음 · 상한 · 쉬는 워커 | 풀을 직접 부른다 |
 * | 끊긴 요청이 라우트에서 일을 버린다 | 진짜 포트가 든다 — `test/export-worker-abort.test.ts` |
 *
 * **zip 바이트를 통째로 견주지 않는다** — `fflate`가 엔트리마다 지금 시각(DOS 시각 · 2초 단위)을 적어서 두 번 만들면
 * 2초 경계를 넘을 때 갈린다. 엔트리의 이름 · 순서 · 내용 바이트를 견준다.
 */
import { Worker } from 'node:worker_threads'
import { strFromU8, unzipSync } from 'fflate'
import type { PageDocument } from '@wirebound/schema'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { exportProjectBundle } from '../src/services/export-bundle'
import { runExportJob } from '../src/services/export-job'
import { exportProjectPptx } from '../src/services/export-pptx'
import { UnsupportedDocumentError, type ExportRows } from '../src/services/export-source'
import {
  ExportAbortedError,
  ExportWorkerError,
  ExportWorkerPool,
  workerExecArgv,
} from '../src/services/export-worker'
import type { ExportJobSpec } from '../src/services/export-worker-protocol'
import { bundleRootDirectory, zipBundle, zipParts } from '../src/services/export-zip'
import type { ScreenBatch, ScreenRenderer, ScreenRequest } from '../src/services/screen-render'
import {
  createMenuNode,
  createPage,
  createProject,
  signup,
  withApi,
  type TestContext,
} from './helpers'

/** 진짜 1×1 PNG 바이트. `test/export-pptx-screens.test.ts`가 같은 것을 든다. */
const PNG_1X1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
])

const HTML_NO_ZIP: Extract<ExportJobSpec, { kind: 'html' }> = { kind: 'html', theme: { themeId: null, theme: null }, zipRoot: null }
const HTML_ZIP: Extract<ExportJobSpec, { kind: 'html' }> = { ...HTML_NO_ZIP, zipRoot: 'root' }

/** DB 없이 만든 행 — 페이지 `pages` 장 · 장마다 글 노드 `nodes` 개(7000 이면 한 장이 약 500KB). */
function syntheticRows(pages: number, nodes: number): ExportRows {
  return {
    menu: [{ id: 'm', parent_id: null, title: '메뉴', sort_order: 0 }],
    comments: [],
    pages: Array.from({ length: pages }, (_, p) => ({
      id: `p${p}`,
      projectId: 'x',
      menuNodeId: 'm',
      title: `p${p}`,
      description: null,
      sortOrder: p,
      schemaVersion: 1,
      headSeq: 0,
      schema: {
        version: 1,
        root: {
          id: `p${p}_root`,
          type: 'Page',
          children: Array.from({ length: nodes }, (_, i) => ({
            id: `p${p}_${i}`,
            type: 'Text',
            props: { content: `가나다라마바사아자차카타파하 ${i}` },
          })),
        },
      } as PageDocument,
    })),
  }
}

/** zip 의 엔트리 — 이름 순서 그대로 · 내용 바이트. */
function entries(zip: Uint8Array): [string, Uint8Array][] {
  return Object.entries(unzipSync(zip))
}

/** 같은 자리의 내용 바이트가 다른 엔트리 이름들. 이름 목록은 부르는 쪽이 먼저 견준다. */
function differingEntries(got: [string, Uint8Array][], want: [string, Uint8Array][]): string[] {
  return got.filter(([, bytes], index) => Buffer.compare(Buffer.from(bytes), Buffer.from(want[index]![1])) !== 0).map(([name]) => name)
}

async function putSchema(ctx: TestContext, cookie: { wb_session: string }, projectId: string, pageId: string, schema: PageDocument): Promise<void> {
  const res = await ctx.app.inject({ method: 'PUT', url: `/api/projects/${projectId}/pages/${pageId}/schema`, cookies: cookie, payload: { schema } })
  if (res.statusCode !== 200) throw new Error(`putSchema 픽스처가 실패했습니다 (status ${res.statusCode}): ${res.body}`)
}

async function addComment(ctx: TestContext, cookie: { wb_session: string }, projectId: string, pageId: string, nodeId: string, body: string): Promise<void> {
  const res = await ctx.app.inject({ method: 'POST', url: `/api/projects/${projectId}/pages/${pageId}/comments`, cookies: cookie, payload: { nodeId, body } })
  if (res.statusCode !== 201) throw new Error(`addComment 픽스처가 실패했습니다 (status ${res.statusCode}): ${res.body}`)
}

function button(rootId: string, buttonId: string, label: string, navigateTo: string): PageDocument {
  return {
    version: 1,
    root: {
      id: rootId,
      type: 'Page',
      children: [{ id: buttonId, type: 'Button', props: { label }, interactions: [{ on: 'click', actions: [{ type: 'navigate', target: navigateTo }] }] }],
    },
  }
}

/**
 * 견줄 것이 여럿인 설계서 — 메뉴 둘(하나는 자식) · 페이지 셋(설명 · 서로를 겨누는 링크 · 못 잇는 링크) · 코멘트 셋 ·
 * 기본 레이아웃의 시스템 테마(`admin`). **테마가 들어 있어야** 워커의 카탈로그가 빈 판(`export-worker-thread.ts`의
 * `ensureCatalog`)이 `theme.css`와 화면 시트에서 갈린다.
 */
async function 설계서(ctx: TestContext, slug: string): Promise<{ cookie: { wb_session: string }; projectId: string; slug: string }> {
  const user = await signup(ctx)
  const cookie = user.cookie
  const project = await createProject(ctx, cookie, { name: `설계서 ${slug}`, slug })
  const 관리자 = await createMenuNode(ctx, cookie, project.id, { title: '관리자' })
  const 회원 = await createMenuNode(ctx, cookie, project.id, { parentId: 관리자.id, title: '회원' })
  const 대시보드 = await createPage(ctx, cookie, project.id, 관리자.id, { title: '대시보드', description: '대시보드 설명' })
  const 목록 = await createPage(ctx, cookie, project.id, 회원.id, { title: '목록', description: '목록 설명' })
  const 상세 = await createPage(ctx, cookie, project.id, 회원.id, { title: '상세' })
  await putSchema(ctx, cookie, project.id, 대시보드.id, button('d_r', 'd_b', '목록으로', 'page:관리자/회원/목록'))
  await putSchema(ctx, cookie, project.id, 목록.id, button('l_r', 'l_b', '상세로', 'page:관리자/회원/상세'))
  await putSchema(ctx, cookie, project.id, 상세.id, button('s_r', 's_b', '없는 곳', 'page:없는/것'))
  await addComment(ctx, cookie, project.id, 대시보드.id, 'd_b', '대시보드 코멘트')
  await addComment(ctx, cookie, project.id, 목록.id, 'l_b', '목록 코멘트 하나')
  await addComment(ctx, cookie, project.id, 목록.id, 'l_r', '목록 코멘트 둘')
  return { cookie, projectId: project.id, slug }
}

/** 페이지마다 **다른 크기**를 답하는 가짜 그리는 자 — 그림이 엉뚱한 페이지에 붙으면 슬라이드가 갈린다. */
class SizedRenderer implements ScreenRenderer {
  readonly seen: ScreenRequest[][] = []
  last(): ScreenRequest[] {
    const found = this.seen[this.seen.length - 1]
    if (!found) throw new Error('그리는 자가 한 번도 안 불렸습니다')
    return found
  }
  async render(requests: readonly ScreenRequest[]): Promise<ScreenBatch> {
    this.seen.push([...requests])
    return {
      results: requests.map((_, index) => ({ ok: true as const, bytes: PNG_1X1, width: 1000 + index * 100, height: 700 + index * 50 })),
      fontWarning: '글꼴 경고 — 워커를 건너 와야 한다',
    }
  }
}

describe('워커가 낸 것은 같은 스레드에서 낸 것과 같다', () => {
  it('HTML — 라우트의 zip 과 미리보기가 같은 스레드의 번들과 엔트리마다 같다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, 'worker-same-html')
      const reference = await exportProjectBundle(ctx.db, fixture.projectId)
      const referenceZip = zipBundle(reference.files, bundleRootDirectory(fixture.slug))

      const res = await ctx.app.inject({ method: 'GET', url: `/api/projects/${fixture.projectId}/export`, cookies: fixture.cookie })
      expect(res.statusCode).toBe(200)
      const got = entries(new Uint8Array(res.rawPayload))
      const want = entries(referenceZip)
      expect(got.map(([name]) => name)).toEqual(want.map(([name]) => name))
      // **`assets/runtime.js` 하나만 갈린다 — 이 하네스에서만.** 그 파일은 함수 하나의 `toString()`이라(`packages/exporter`의
      // `RUNTIME_JS`) 글자가 **변환기가 낸 그대로**다. vitest 는 메인을 vite 로, 워커를 tsx 로 변환하므로 두 글자가 다르다.
      // 운영은 두 스레드가 같은 `dist` 파일을 싣는다(`export-worker.ts`의 «워커가 싣는 코드는 메인과 같다»). 나머지는 바이트로 같다.
      expect(differingEntries(got, want)).toEqual([`${bundleRootDirectory(fixture.slug)}/assets/runtime.js`])
      // 카나리아 — 견준 것에 테마와 코멘트가 실제로 들어 있다(없으면 둘이 우연히 같다).
      const theme = got.find(([name]) => name.endsWith('assets/theme.css'))!
      expect(strFromU8(theme[1])).toContain('--wb-palette-')
      expect(got.map(([, bytes]) => strFromU8(bytes)).join('\n')).toContain('목록 코멘트 둘')

      const preview = await ctx.app.inject({ method: 'GET', url: `/api/projects/${fixture.projectId}/export/preview`, cookies: fixture.cookie })
      expect(preview.statusCode).toBe(200)
      const body = preview.json()
      expect(body.pages).toEqual(reference.pages)
      expect(body.brokenLinks).toEqual(reference.brokenLinks)
      expect(body.brokenLinks).toHaveLength(1)
      expect(body.duplicateTargets).toEqual(reference.duplicateTargets)
      expect(body.errors).toEqual(reference.errors)
      expect(body.themeId).toBe(reference.themeId)
    })
  })

  it('PPTX — 라우트의 파일 · 그리라고 넘긴 것 · 미리보기가 같은 스레드와 같다', async () => {
    const viaRoute = new SizedRenderer()
    await withApi(
      async (ctx) => {
        const fixture = await 설계서(ctx, 'worker-same-pptx')
        const inThread = new SizedRenderer()
        const reference = await exportProjectPptx(ctx.db, fixture.projectId, { renderer: inThread })

        const res = await ctx.app.inject({ method: 'GET', url: `/api/projects/${fixture.projectId}/export?format=pptx`, cookies: fixture.cookie })
        expect(res.statusCode).toBe(200)
        const got = entries(new Uint8Array(res.rawPayload))
        const want = entries(zipParts(reference.parts))
        expect(got.map(([name]) => name)).toEqual(want.map(([name]) => name))
        expect(differingEntries(got, want)).toEqual([])
        // 그리라고 넘긴 HTML · 시트가 같다 — 테마가 든 시트여야 견준 것이 뜻이 있다.
        expect(viaRoute.last()).toEqual(inThread.last())
        expect(inThread.last()[0]!.css).toContain('--wb-palette-')

        const preview = await ctx.app.inject({ method: 'GET', url: `/api/projects/${fixture.projectId}/export/preview?format=pptx`, cookies: fixture.cookie })
        const body = preview.json()
        expect(body.pages).toEqual(reference.pages)
        expect(body.screenless).toEqual(reference.screenless)
        expect(body.screenFailures).toEqual(reference.screenFailures)
        expect(body.fontWarning).toBe(reference.fontWarning)
        expect(body.fontWarning).not.toBeNull()
      },
      { screenRenderer: viaRoute },
    )
  })
})

describe('풀', () => {
  let pool: ExportWorkerPool
  beforeAll(() => {
    pool = new ExportWorkerPool({ limit: 1 })
  })
  afterAll(async () => {
    await pool.close()
  })

  it('워커로 도는 동안 메인의 루프가 서지 않는다 — 같은 스레드에서 돈 시간보다 한참 짧게만 선다', async () => {
    const rows = syntheticRows(8, 7000)
    // 워커를 먼저 띄워 둔다 — 띄우는 동안 메인이 도는 모듈 적재는 이 케이스가 재는 것이 아니다.
    await pool.runHtml(syntheticRows(1, 1), HTML_NO_ZIP)

    const s0 = performance.now()
    await runExportJob(HTML_ZIP, rows, () => Promise.reject(new Error('그리지 않는다')))
    const inThreadMs = performance.now() - s0

    let last = performance.now()
    let longestGap = 0
    const ticker = setInterval(() => {
      const now = performance.now()
      longestGap = Math.max(longestGap, now - last)
      last = now
    }, 5)
    try {
      const result = await pool.runHtml(rows, HTML_ZIP)
      expect(result.zip).not.toBeNull()
    } finally {
      // **끝의 멈춤도 센다.** 타이머는 다음에 불릴 때 간격을 적으므로, 답을 받은 뒤 메인이 선 몫(압축을 메인이 하는 판)은
      // 여기서 재지 않으면 아무도 안 적는다.
      longestGap = Math.max(longestGap, performance.now() - last)
      clearInterval(ticker)
    }

    // 같은 스레드에서 돈 시간 전체가 한 번의 멈춤이다(`runExportJob`의 몸통은 동기다). 워커로 돌면 메인은 행을 한 장씩
    // 복제하는 동안만 선다. 잰 값(이 케이스 · 15코어): 같은 스레드 0.44–0.53s · 워커 중 최장 6–15ms.
    expect(inThreadMs).toBeGreaterThan(300)
    expect(longestGap).toBeLessThan(inThreadMs / 4)
  }, 60_000)

  it('입력을 페이지 한 장씩 넘긴다 — 메시지 하나의 복제가 가장 큰 페이지 한 장으로 묶인다', async () => {
    const spy = vi.spyOn(Worker.prototype, 'postMessage')
    try {
      await pool.runHtml(syntheticRows(5, 10), HTML_NO_ZIP)
      const pageMessages = spy.mock.calls
        .map(([message]) => message as { t?: string; part?: string; items?: unknown[] })
        .filter((message) => message.t === 'rows' && message.part === 'pages')
      expect(pageMessages.map((message) => message.items!.length)).toEqual([1, 1, 1, 1, 1])
    } finally {
      spy.mockRestore()
    }
  })

  it('워커가 던진 도메인 에러는 같은 클래스로 오고 그 워커를 다시 쓴다', async () => {
    const rows = syntheticRows(2, 1)
    rows.pages[1]!.schema = { ...rows.pages[1]!.schema, version: 999 } as PageDocument
    const failure = await pool.runHtml(rows, HTML_NO_ZIP).catch((error: unknown) => error)
    expect(failure).toBeInstanceOf(UnsupportedDocumentError)
    expect((failure as UnsupportedDocumentError).pageTitle).toBe('메뉴 p1')

    // 멀쩡히 답한 워커다 — 버리지 않는다.
    expect(pool.stats).toEqual({ threads: 1, busy: 0, queued: 0 })
    await expect(pool.runHtml(syntheticRows(1, 1), HTML_NO_ZIP)).resolves.toMatchObject({ kind: 'html' })
  })

  it('상한을 넘은 일은 줄을 서고 둘 다 끝난다', async () => {
    const first = pool.runHtml(syntheticRows(4, 3000), HTML_ZIP)
    const second = pool.runHtml(syntheticRows(1, 1), HTML_NO_ZIP)
    await new Promise((resolve) => setImmediate(resolve))
    expect(pool.stats).toMatchObject({ threads: 1, busy: 1, queued: 1 })
    await expect(Promise.all([first, second])).resolves.toHaveLength(2)
    expect(pool.stats).toEqual({ threads: 1, busy: 0, queued: 0 })
  }, 60_000)

})

describe('끊김', () => {
  it('끊긴 일은 줄에서 빠지고, 도는 일은 워커째 끝낸다', async () => {
    // **제 풀을 쓴다** — 앞 케이스들이 나눠 쓰는 풀에 남긴 쉬는 워커가 있으면 «줄을 선다»가 성립하지 않는다.
    const pool = new ExportWorkerPool({ limit: 1 })
    try {
      const running = new AbortController()
      const queued = new AbortController()
      const first = pool.runHtml(syntheticRows(8, 7000), HTML_ZIP, { signal: running.signal }).catch((error: unknown) => error)
      const second = pool.runHtml(syntheticRows(1, 1), HTML_NO_ZIP, { signal: queued.signal }).catch((error: unknown) => error)
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(pool.stats).toMatchObject({ busy: 1, queued: 1 })

      queued.abort()
      expect(await second).toBeInstanceOf(ExportAbortedError)
      expect(pool.stats.queued).toBe(0)

      running.abort()
      expect(await first).toBeInstanceOf(ExportAbortedError)
      await vi.waitFor(() => expect(pool.stats).toEqual({ threads: 0, busy: 0, queued: 0 }))

      // 다음 일은 새 워커로 된다.
      await expect(pool.runHtml(syntheticRows(1, 1), HTML_NO_ZIP)).resolves.toMatchObject({ kind: 'html' })
    } finally {
      await pool.close()
    }
  }, 60_000)
})

describe('워커가 죽는다', () => {
  it('힙 한도를 넘으면 그 워커만 죽고 일은 ExportWorkerError 다 — 다음 일은 새 워커로 된다', async () => {
    const pool = new ExportWorkerPool({ resourceLimits: { maxOldGenerationSizeMb: 64 } })
    try {
      const failure = await pool.runHtml(syntheticRows(12, 7000), HTML_ZIP).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(ExportWorkerError)
      expect(pool.stats).toEqual({ threads: 0, busy: 0, queued: 0 })
      await expect(pool.runHtml(syntheticRows(1, 1), HTML_NO_ZIP)).resolves.toMatchObject({ kind: 'html' })
    } finally {
      await pool.close()
    }
  }, 60_000)
})

describe('쉬는 워커', () => {
  it('쉬는 시간이 지나면 끝내고, 마지막 하나는 새 워커로 갈아 둔다', async () => {
    const pool = new ExportWorkerPool({ limit: 2, idleMs: 100 })
    try {
      await Promise.all([pool.runHtml(syntheticRows(2, 2000), HTML_ZIP), pool.runHtml(syntheticRows(2, 2000), HTML_ZIP)])
      expect(pool.stats.threads).toBe(2)
      await new Promise((resolve) => setTimeout(resolve, 600))
      expect(pool.stats).toEqual({ threads: 1, busy: 0, queued: 0 })
    } finally {
      await pool.close()
    }
  }, 60_000)
})

const PPTX_NO_ZIP: Extract<ExportJobSpec, { kind: 'pptx' }> = { kind: 'pptx', screenTheme: { ok: true, theme: null }, zip: false }

/** 풀어 줄 때까지 안 끝나는 그리는 자 — 지금 몇이 그리는 중인지 센다. */
class HeldRenderer {
  started = 0
  active = 0
  maxActive = 0
  private readonly releases: (() => void)[] = []
  readonly render = async (requests: readonly ScreenRequest[]): Promise<ScreenBatch> => {
    this.started++
    this.active++
    this.maxActive = Math.max(this.maxActive, this.active)
    await new Promise<void>((resolve) => this.releases.push(resolve))
    this.active--
    return { results: requests.map(() => ({ ok: true as const, bytes: PNG_1X1, width: 1, height: 1 })), fontWarning: null }
  }
  /** 그리는 중인 것 하나를 끝낸다(먼저 시작한 것부터). */
  releaseOne(): void {
    const release = this.releases.shift()
    if (!release) throw new Error('그리는 중인 것이 없습니다')
    release()
  }
  releaseAll(): void {
    while (this.releases.length > 0) this.releaseOne()
  }
}

/** 워커가 «그려 달라»고 한 수 — 메인이 받은 `render` 메시지를 센다. */
function countRenderAsks(): { readonly count: number; restore(): void } {
  let count = 0
  const emit = Worker.prototype.emit
  const spy = vi.spyOn(Worker.prototype, 'emit').mockImplementation(function (this: Worker, event, ...args) {
    if (event === 'message' && (args[0] as { t?: string } | undefined)?.t === 'render') count++
    return emit.call(this, event, ...args)
  })
  return {
    get count() {
      return count
    },
    restore: () => spy.mockRestore(),
  }
}

/** `ms` 안에 안 끝나면 거절한다 — 줄에 선 채 안 끝나는 것을 «시간 초과»가 아니라 값으로 본다. */
function within<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${ms}ms 안에 안 끝났습니다`)), ms)),
  ])
}

describe('칸이 둘이다 — CPU 와 그리기', () => {
  it('그리는 동안은 CPU 칸을 내놓는다 — pptx 가 그리는 중이어도 html 이 돈다', async () => {
    const pool = new ExportWorkerPool({ limit: 1, renderLimit: 2 })
    const renderer = new HeldRenderer()
    try {
      const pptx = pool.runPptx(syntheticRows(2, 1), PPTX_NO_ZIP, { render: renderer.render })
      await vi.waitFor(() => expect(renderer.started).toBe(1), { timeout: 30_000 })

      // CPU 칸이 하나뿐이다 — 그리는 pptx 가 그 칸을 쥐고 있으면 이 html 은 그리기가 끝날 때까지 줄을 선다.
      await expect(within(pool.runHtml(syntheticRows(1, 1), HTML_NO_ZIP), 20_000)).resolves.toMatchObject({ kind: 'html' })
      expect(renderer.active).toBe(1)

      renderer.releaseAll()
      await expect(pptx).resolves.toMatchObject({ kind: 'pptx', screenFailures: [] })
    } finally {
      renderer.releaseAll()
      await pool.close()
    }
  }, 60_000)

  it('동시에 그리는 것은 그리기 칸 수까지다 — 넘은 것은 기다렸다 그린다', async () => {
    const pool = new ExportWorkerPool({ limit: 3, renderLimit: 2 })
    const renderer = new HeldRenderer()
    const asks = countRenderAsks()
    try {
      const jobs = [0, 1, 2].map(() => pool.runPptx(syntheticRows(1, 1), PPTX_NO_ZIP, { render: renderer.render }))
      // 셋 다 그려 달라고 했다 — 그리기 칸이 CPU 칸과 같으면 셋이 함께 그린다.
      await vi.waitFor(() => expect(asks.count).toBe(3), { timeout: 30_000 })
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(renderer.started).toBe(2)

      renderer.releaseOne()
      await vi.waitFor(() => expect(renderer.started).toBe(3), { timeout: 10_000 })
      renderer.releaseAll()
      await expect(Promise.all(jobs)).resolves.toHaveLength(3)
      expect(renderer.maxActive).toBe(2)
    } finally {
      asks.restore()
      renderer.releaseAll()
      await pool.close()
    }
  }, 60_000)

  // 이 판은 앞 두 케이스의 축 위에 선다(가가 그리는 동안 CPU 칸을 내놓고, 나는 그리기 칸을 기다린다) — 그 두 축이
  // 무너지면 이 케이스도 함께 죽는다. 축의 주인은 «그리는 동안은 CPU 칸을 내놓는다» · «동시에 그리는 것은 그리기 칸
  // 수까지다»이고, 이 케이스가 혼자 재는 것은 «줄 맨 앞»과 «그리기 칸을 얻은 뒤에 CPU 칸을 내놓는다»다.
  it('다 그린 일은 CPU 칸을 줄 맨 앞에서 다시 얻는다 — 뒤에 온 일보다 먼저 끝난다', async () => {
    const pool = new ExportWorkerPool({ limit: 1, renderLimit: 1 })
    const held = new HeldRenderer()
    const asks = countRenderAsks()
    const finished: string[] = []
    try {
      // 가: 그리는 중(그리기 칸을 쥐고 CPU 칸은 내놓았다).
      const 가 = pool.runPptx(syntheticRows(1, 1), PPTX_NO_ZIP, { render: held.render }).then(() => finished.push('가'))
      await vi.waitFor(() => expect(held.started).toBe(1), { timeout: 30_000 })
      // 나: CPU 칸을 얻어 조립하고 그려 달라 한다 — 그리기 칸이 없어 CPU 칸을 쥔 채 기다린다.
      const 나 = pool
        .runPptx(syntheticRows(1, 1), PPTX_NO_ZIP, {
          render: async (requests) => ({ results: requests.map(() => ({ ok: true as const, bytes: PNG_1X1, width: 1, height: 1 })), fontWarning: null }),
        })
        .then(() => finished.push('나'))
      await vi.waitFor(() => expect(asks.count).toBe(2), { timeout: 30_000 })
      // 다: CPU 칸을 기다린다.
      const 다 = pool.runHtml(syntheticRows(1, 1), HTML_NO_ZIP).then(() => finished.push('다'))
      await vi.waitFor(() => expect(pool.stats.queued).toBe(1))

      // 가가 다 그렸다 → 그리기 칸은 나에게, 나가 내놓은 CPU 칸은 줄 맨 앞에 선 가에게.
      held.releaseOne()
      await Promise.all([가, 나, 다])
      expect(finished).toEqual(['가', '나', '다'])
    } finally {
      asks.restore()
      held.releaseAll()
      await pool.close()
    }
  }, 60_000)
})

describe('쉬는 동안 죽은 워커', () => {
  it('꺼내지 않는다 — 다음 일은 새 워커로 된다', async () => {
    const pool = new ExportWorkerPool({ limit: 1 })
    try {
      await pool.runHtml(syntheticRows(1, 1), HTML_NO_ZIP)
      const idle = (pool as unknown as { idle: { worker: Worker }[] }).idle
      expect(idle).toHaveLength(1)
      const dead = idle[0]!.worker
      await dead.terminate()
      // `exit`이 처리될 때까지 — 그 뒤에 꺼내면 `converse`가 들을 `exit`이 다시 오지 않는다.
      await new Promise((resolve) => setImmediate(resolve))

      await expect(within(pool.runHtml(syntheticRows(1, 1), HTML_NO_ZIP), 20_000)).resolves.toMatchObject({ kind: 'html' })
      expect(pool.stats).toEqual({ threads: 1, busy: 0, queued: 0 })
    } finally {
      await pool.close()
    }
  }, 60_000)
})

describe('workerExecArgv', () => {
  it('메인의 --conditions 만 이어받고 tsx 로더를 싣는다', () => {
    const argv = workerExecArgv(['--require', '/x/preflight.cjs', '--conditions', 'development', '-C', 'node', '--conditions=custom', '--inspect'])
    expect(argv.slice(0, 5)).toEqual(['--conditions', 'development', '--conditions', 'node', '--conditions=custom'])
    expect(argv[5]).toBe('--import')
    expect(argv[6]).toMatch(/^file:.*\/tsx\/.*esm/)
    expect(argv).toHaveLength(7)
  })
})
