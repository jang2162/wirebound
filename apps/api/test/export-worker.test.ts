/**
 * **내보내기의 CPU 몫이 이벤트 루프 밖에서 돈다**(`src/services/export-worker.ts`).
 *
 * | 무엇을 | 어떻게 |
 * |---|---|
 * | 워커가 낸 것이 같은 스레드에서 낸 것과 **바이트로 같다** | 라우트(워커)의 zip 을 풀어 `exportProjectBundle`·`exportProjectPptx`(같은 스레드)의 파일과 엔트리마다 견준다 |
 * | 메인의 루프가 서지 않는다 | 같은 일을 같은 스레드에서 돈 시간과, 워커로 도는 동안 메인의 타이머가 벌어진 최장 간격을 견준다 |
 * | 입력을 한 장씩 넘긴다 | 워커로 가는 메시지를 센다 |
 * | 도메인 에러 · 끊김 · 워커의 죽음 · 상한 · 쉬는 워커 · 칸 배정 · 떠 있는 일의 한도 | 풀을 직접 부른다 |
 * | 한도를 넘은 요청이 503 + `Retry-After`다 | 라우트를 `inject`로 — 그리는 자가 붙잡아 한도를 채운다 |
 * | 자리를 행을 읽기 **전에** 잡는다 | 찼을 때 빈 프로젝트(읽기가 409 를 던진다)가 503 이다 |
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
  EXPORT_JOB_LIMIT,
  EXPORT_PERSON_JOB_LIMIT,
  EXPORT_RENDER_LIMIT,
  EXPORT_RETRY_AFTER_S,
  ExportAbortedError,
  ExportBusyError,
  ExportWorkerError,
  ExportWorkerPool,
  workerExecArgv,
} from '../src/services/export-worker'
import type { ExportJobSpec } from '../src/services/export-worker-protocol'
import { bundleRootDirectory, zipBundle, zipParts } from '../src/services/export-zip'
import type { ScreenBatch, ScreenJob, ScreenRenderer } from '../src/services/screen-render'
import { addMember, createMenuNode, createPage, createProject, signup, withApi, type TestContext } from './helpers'

/** 진짜 1×1 PNG 바이트. `test/export-pptx-screens.test.ts`가 같은 것을 든다. */
const PNG_1X1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01,
  0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
])

const HTML_NO_ZIP: Extract<ExportJobSpec, { kind: 'html' }> = { kind: 'html', zipRoot: null }
const HTML_ZIP: Extract<ExportJobSpec, { kind: 'html' }> = { ...HTML_NO_ZIP, zipRoot: 'root' }

/** DB 없이 만든 행 — 페이지 `pages` 장 · 장마다 글 노드 `nodes` 개(7000 이면 한 장이 약 500KB). */
function syntheticRows(pages: number, nodes: number): ExportRows {
  return {
    menu: [{ id: 'm', parent_id: null, title: '메뉴', sort_order: 0 }],
    comments: [],
    theme: null,
    themeWarning: null,
    images: [],
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
        version: 5,
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

async function addComment(
  ctx: TestContext,
  cookie: { wb_session: string },
  projectId: string,
  pageId: string,
  nodeId: string,
  body: string,
): Promise<void> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/pages/${pageId}/comments`,
    cookies: cookie,
    payload: { nodeId, body },
  })
  if (res.statusCode !== 201) throw new Error(`addComment 픽스처가 실패했습니다 (status ${res.statusCode}): ${res.body}`)
}

function button(rootId: string, buttonId: string, label: string, navigateTo: string): PageDocument {
  return {
    version: 5,
    root: {
      id: rootId,
      type: 'Page',
      children: [
        {
          id: buttonId,
          type: 'Button',
          props: { label },
          interactions: [{ on: 'click', actions: [{ type: 'navigate', target: navigateTo }] }],
        },
      ],
    },
  }
}

/**
 * 견줄 것이 여럿인 설계서 — 메뉴 둘(하나는 자식) · 페이지 셋(설명 · 서로를 겨누는 링크 · 못 잇는 링크) · 코멘트 셋.
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

/**
 * 전체 한도를 채울 사람들 — 그 프로젝트의 viewer 들이다. **한 사람으로는 못 채운다**(사람마다 한도
 * `EXPORT_PERSON_JOB_LIMIT`). `i` 번째 요청은 `people[i % people.length]`가 보낸다.
 */
async function 채울사람들(ctx: TestContext, projectId: string): Promise<{ wb_session: string }[]> {
  const people: { wb_session: string }[] = []
  for (let i = 0; i < Math.ceil(EXPORT_JOB_LIMIT / EXPORT_PERSON_JOB_LIMIT); i++) {
    const person = await signup(ctx)
    await addMember(ctx, projectId, person.user.id, 'viewer')
    people.push(person.cookie)
  }
  return people
}

/** 페이지마다 **다른 크기**를 답하는 가짜 그리는 자 — 그림이 엉뚱한 페이지에 붙으면 슬라이드가 갈린다. */
class SizedRenderer implements ScreenRenderer {
  readonly seen: ScreenJob[] = []
  last(): ScreenJob {
    const found = this.seen[this.seen.length - 1]
    if (!found) throw new Error('그리는 자가 한 번도 안 불렸습니다')
    return found
  }
  async render(job: ScreenJob): Promise<ScreenBatch> {
    this.seen.push(job)
    return {
      results: job.pages.map((_, index) => ({ ok: true as const, bytes: PNG_1X1, width: 1000 + index * 100, height: 700 + index * 50 })),
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
      // **전 엔트리가 바이트로 같다.** `assets/runtime.js` 는 빌드 산출물(`@wirebound/exporter/runtime.js`)을 두 스레드가 각자 같은 파일에서
      // 읽는다(`services/export-runtime.ts`) — 변환기가 글자를 짓지 않는다.
      expect(differingEntries(got, want)).toEqual([])
      // 카나리아 — 견준 것에 기본 뷰 CSS · 런타임 · 문서 · 코멘트가 실제로 들어 있다(없으면 둘이 우연히 같다).
      const views = got.find(([name]) => name.endsWith('assets/views.css'))!
      expect(strFromU8(views[1])).toContain('--wb-node-grid-columns')
      expect(got.find(([name]) => name.endsWith('assets/runtime.js'))![1].length).toBeGreaterThan(100_000)
      expect(got.map(([, bytes]) => strFromU8(bytes)).join('\n')).toContain('"type":"Button"')
      expect(got.map(([, bytes]) => strFromU8(bytes)).join('\n')).toContain('목록 코멘트 둘')

      const preview = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fixture.projectId}/export/preview`,
        cookies: fixture.cookie,
      })
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

        const res = await ctx.app.inject({
          method: 'GET',
          url: `/api/projects/${fixture.projectId}/export?format=pptx`,
          cookies: fixture.cookie,
        })
        expect(res.statusCode).toBe(200)
        const got = entries(new Uint8Array(res.rawPayload))
        const want = entries(zipParts(reference.parts))
        expect(got.map(([name]) => name)).toEqual(want.map(([name]) => name))
        expect(differingEntries(got, want)).toEqual([])
        // 그리라고 넘긴 번들(파일 전부 · 찍을 페이지)이 같다 — 기본 뷰 CSS · 런타임 · 테마가 든 번들이어야 견준 것이 뜻이 있다.
        expect(viaRoute.last()).toEqual(inThread.last())
        expect(String(inThread.last().files.get('assets/views.css'))).toContain('--wb-node-grid-columns')
        expect(inThread.last().files.has('assets/theme/theme.js')).toBe(true)
        expect(inThread.last().pages.map((page) => page.title)).toEqual(reference.pages.map((page) => page.title))
        expect(inThread.last().pages.every((page) => inThread.last().files.has(page.path))).toBe(true)

        const preview = await ctx.app.inject({
          method: 'GET',
          url: `/api/projects/${fixture.projectId}/export/preview?format=pptx`,
          cookies: fixture.cookie,
        })
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
    const rows = syntheticRows(16, 7000)
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
    // 복제하는 동안만 선다. 잰 값(이 케이스 · 15코어 · 목업을 번들이 아니라 브라우저가 그리는 판 — 입력이 16 장인 까닭): 같은 스레드
    // 0.54–0.59s · 워커 중 최장 6–7ms. 다시 재는 법: 두 값을 찍어 이 케이스만 돌린다(`-t '메인의 루프가 서지 않는다'`).
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
    expect(pool.stats).toEqual({ threads: 1, busy: 0, queued: 0, drawSlots: 0 })
    await expect(pool.runHtml(syntheticRows(1, 1), HTML_NO_ZIP)).resolves.toMatchObject({ kind: 'html' })
  })

  it('상한을 넘은 일은 줄을 서고 둘 다 끝난다', async () => {
    const first = pool.runHtml(syntheticRows(4, 3000), HTML_ZIP)
    const second = pool.runHtml(syntheticRows(1, 1), HTML_NO_ZIP)
    await new Promise((resolve) => setImmediate(resolve))
    expect(pool.stats).toMatchObject({ threads: 1, busy: 1, queued: 1 })
    await expect(Promise.all([first, second])).resolves.toHaveLength(2)
    expect(pool.stats).toEqual({ threads: 1, busy: 0, queued: 0, drawSlots: 0 })
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
      await vi.waitFor(() => expect(pool.stats).toEqual({ threads: 0, busy: 0, queued: 0, drawSlots: 0 }))

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
      expect(pool.stats).toEqual({ threads: 0, busy: 0, queued: 0, drawSlots: 0 })
      await expect(pool.runHtml(syntheticRows(1, 1), HTML_NO_ZIP)).resolves.toMatchObject({ kind: 'html' })
    } finally {
      await pool.close()
    }
  }, 60_000)
})

describe('쉬는 워커', () => {
  /**
   * **쉬는 시계를 가짜로 둔다** — 쉬는 시계는 일이 끝날 때마다 따로 선다. 진짜 시계면 두 일이 끝난 시각이 쉬는 시간보다 벌어진
   * 판(붐빌 때)에서 앞 워커가 뒤 일이 끝나기 전에 쉬는 시간을 다 채워 «둘이 떠 있다»가 1 로 나왔다 — 다시 재는 법: 이 케이스를
   * 진짜 시계로 되돌리고 CPU 를 묶는다(`node -e 'for(;;){}'` 를 코어 수의 네 배). `setImmediate` 는 안 바꾼다 — 행을 보내는 사이의
   * 양보가 그것이다(`yieldToLoop`).
   */
  it('쉬는 시간이 지나면 끝내고, 마지막 하나는 새 워커로 갈아 둔다', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    // 목록에서 빼는 것만이 아니라 스레드를 끝내는지 — `stats` 는 목록만 센다.
    const terminate = vi.spyOn(Worker.prototype, 'terminate')
    const pool = new ExportWorkerPool({ limit: 2, idleMs: 100 })
    try {
      await Promise.all([pool.runHtml(syntheticRows(2, 2000), HTML_ZIP), pool.runHtml(syntheticRows(2, 2000), HTML_ZIP)])
      expect(pool.stats.threads).toBe(2)
      await vi.advanceTimersByTimeAsync(99)
      expect([pool.stats.threads, terminate.mock.calls.length]).toEqual([2, 0])
      await vi.advanceTimersByTimeAsync(1)
      expect(pool.stats).toEqual({ threads: 1, busy: 0, queued: 0, drawSlots: 0 })
      expect(terminate).toHaveBeenCalledTimes(2)
    } finally {
      terminate.mockRestore()
      try {
        await pool.close()
      } finally {
        vi.useRealTimers()
      }
    }
  }, 60_000)
})

const PPTX_NO_ZIP: Extract<ExportJobSpec, { kind: 'pptx' }> = { kind: 'pptx', screens: true, zip: false }

/** 풀어 줄 때까지 안 끝나는 그리는 자 — 지금 몇이 그리는 중인지 센다. */
class HeldRenderer {
  started = 0
  active = 0
  maxActive = 0
  private readonly releases: (() => void)[] = []
  readonly render = async (job: ScreenJob): Promise<ScreenBatch> => {
    this.started++
    this.active++
    this.maxActive = Math.max(this.maxActive, this.active)
    await new Promise<void>((resolve) => this.releases.push(resolve))
    this.active--
    return { results: job.pages.map(() => ({ ok: true as const, bytes: PNG_1X1, width: 1, height: 1 })), fontWarning: null }
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
  return Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${ms}ms 안에 안 끝났습니다`)), ms))])
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

  it('동시에 그리는 것은 그리기 칸 수까지다 — 넘은 것은 워커 없이 줄을 서고 칸이 나면 그린다', async () => {
    const pool = new ExportWorkerPool({ limit: 3, renderLimit: 2 })
    const renderer = new HeldRenderer()
    const asks = countRenderAsks()
    try {
      const jobs = [0, 1, 2].map(() => pool.runPptx(syntheticRows(1, 1), PPTX_NO_ZIP, { render: renderer.render }))
      await vi.waitFor(() => expect(renderer.started).toBe(2), { timeout: 30_000 })
      await new Promise((resolve) => setTimeout(resolve, 50))
      // 셋째는 그리기 칸을 기다린다 — CPU 칸이 남아도 조립하지 않고 워커도 없다.
      expect(asks.count).toBe(2)
      expect(pool.stats).toMatchObject({ busy: 2, queued: 1 })

      renderer.releaseOne()
      await vi.waitFor(() => expect(renderer.started).toBe(3), { timeout: 30_000 })
      renderer.releaseAll()
      await expect(Promise.all(jobs)).resolves.toHaveLength(3)
      expect(renderer.maxActive).toBe(2)
    } finally {
      asks.restore()
      renderer.releaseAll()
      await pool.close()
    }
  }, 60_000)

  it('그리기를 기다리는 pptx 는 CPU 칸을 쥐지 않는다 — pptx 가 그리기 칸보다 많아도 html 이 돈다', async () => {
    const pool = new ExportWorkerPool({ limit: 1, renderLimit: 1 })
    const renderer = new HeldRenderer()
    try {
      const drawing = pool.runPptx(syntheticRows(1, 1), PPTX_NO_ZIP, { render: renderer.render })
      await vi.waitFor(() => expect(renderer.started).toBe(1), { timeout: 30_000 })
      const waiting = pool.runPptx(syntheticRows(1, 1), PPTX_NO_ZIP, { render: renderer.render })
      await vi.waitFor(() => expect(pool.stats.queued).toBe(1))

      // 둘째 pptx 가 CPU 칸 하나를 쥐고 그리기 칸을 기다리면 이 html 은 첫째가 다 그릴 때까지 줄을 선다.
      await expect(within(pool.runHtml(syntheticRows(1, 1), HTML_NO_ZIP), 20_000)).resolves.toMatchObject({ kind: 'html' })
      expect(renderer.started).toBe(1)

      renderer.releaseOne()
      await vi.waitFor(() => expect(renderer.started).toBe(2), { timeout: 30_000 })
      renderer.releaseAll()
      await expect(Promise.all([drawing, waiting])).resolves.toHaveLength(2)
    } finally {
      renderer.releaseAll()
      await pool.close()
    }
  }, 60_000)

  it('다 그린 일은 CPU 칸을 줄 맨 앞에서 다시 얻는다 — 먼저 줄 선 일보다 먼저 끝난다', async () => {
    const pool = new ExportWorkerPool({ limit: 1, renderLimit: 1 })
    const held = new HeldRenderer()
    const finished: string[] = []
    try {
      // 가: 그리는 중(그리기 칸을 쥐고 CPU 칸은 내놓았다).
      const 가 = pool.runPptx(syntheticRows(1, 1), PPTX_NO_ZIP, { render: held.render }).then(() => finished.push('가'))
      await vi.waitFor(() => expect(held.started).toBe(1), { timeout: 30_000 })
      // 나: 큰 html 이 CPU 칸을 쥔다. 다: 그 뒤에 줄을 선다.
      const 나 = pool.runHtml(syntheticRows(8, 7000), HTML_ZIP).then(() => finished.push('나'))
      await vi.waitFor(() => expect(pool.stats.busy).toBe(2))
      const 다 = pool.runHtml(syntheticRows(1, 1), HTML_NO_ZIP).then(() => finished.push('다'))
      await vi.waitFor(() => expect(pool.stats.queued).toBe(1))

      // 가가 다 그렸다 → CPU 칸을 다시 기다리는데 먼저 선 다의 앞에 선다. 나가 끝나면 가 · 다 순이다.
      held.releaseOne()
      await Promise.all([가, 나, 다])
      expect(finished).toEqual(['나', '가', '다'])
    } finally {
      held.releaseAll()
      await pool.close()
    }
  }, 60_000)

  it('끊긴 pptx 의 그리기 칸은 그리기가 끝날 때 돌아온다 — 그동안 다음 pptx 는 그리지 않는다', async () => {
    const pool = new ExportWorkerPool({ limit: 2, renderLimit: 1 })
    const renderer = new HeldRenderer()
    try {
      const gone = new AbortController()
      const first = pool
        .runPptx(syntheticRows(1, 1), PPTX_NO_ZIP, { render: renderer.render, signal: gone.signal })
        .catch((error: unknown) => error)
      await vi.waitFor(() => expect(renderer.started).toBe(1), { timeout: 30_000 })
      gone.abort()
      expect(await first).toBeInstanceOf(ExportAbortedError)

      // 브라우저는 아직 그리는 중이다 — 칸이 벌써 돌아오면 브라우저가 칸 수를 넘어 뜬다.
      const second = pool.runPptx(syntheticRows(1, 1), PPTX_NO_ZIP, { render: renderer.render })
      await new Promise((resolve) => setTimeout(resolve, 200))
      expect(renderer.started).toBe(1)
      expect(pool.stats.queued).toBe(1)

      renderer.releaseOne()
      await vi.waitFor(() => expect(renderer.started).toBe(2), { timeout: 30_000 })
      expect(renderer.maxActive).toBe(1)
      renderer.releaseAll()
      await expect(second).resolves.toMatchObject({ kind: 'pptx' })
    } finally {
      renderer.releaseAll()
      await pool.close()
    }
  }, 60_000)

  it('stats 가 쥔 그리기 칸을 센다 — 그리는 중 · 끊긴 일의 브라우저가 떠 있는 동안 · 다 그린 뒤', async () => {
    const pool = new ExportWorkerPool({ limit: 2, renderLimit: 2 })
    const renderer = new HeldRenderer()
    try {
      expect(pool.stats.drawSlots).toBe(0)
      const gone = new AbortController()
      const cut = pool
        .runPptx(syntheticRows(1, 1), PPTX_NO_ZIP, { render: renderer.render, signal: gone.signal })
        .catch((error: unknown) => error)
      const kept = pool.runPptx(syntheticRows(1, 1), PPTX_NO_ZIP, { render: renderer.render })
      await vi.waitFor(() => expect(renderer.started).toBe(2), { timeout: 30_000 })
      expect(pool.stats.drawSlots).toBe(2)

      // 끊긴 일은 끝났지만 그 브라우저는 아직 그린다 — 칸도 쥐인 채다.
      gone.abort()
      expect(await cut).toBeInstanceOf(ExportAbortedError)
      expect(pool.stats.drawSlots).toBe(2)

      renderer.releaseAll()
      await kept
      expect(pool.stats.drawSlots).toBe(0)
    } finally {
      renderer.releaseAll()
      await pool.close()
    }
  }, 60_000)

  /**
   * **워커가 그림을 두 번 부탁하면 그 일을 끝낸다.** 조립은 한 번만 부탁하므로(`buildProjectPptx`) 오늘의 워커로는 닿지
   * 않는 갈래다 — 그래서 메인이 받은 첫 `render`를 한 번 더 흘려 흉내 낸다. 받아 주면 칸 셈이 어긋난다: 둘째 부탁이
   * 그리기 칸을 하나 더 얻고, 이미 내놓은 CPU 칸을 **한 번 더** 내놓아 CPU 칸이 하나 늘어난 것처럼 돈다.
   */
  it('둘째 그리기 부탁은 그 일을 ExportWorkerError 로 끝낸다 — CPU 칸을 두 번 내놓지 않는다', async () => {
    const pool = new ExportWorkerPool({ limit: 1, renderLimit: 2 })
    const renderer = new HeldRenderer()
    const emit = Worker.prototype.emit
    let doubled = false
    const spy = vi.spyOn(Worker.prototype, 'emit').mockImplementation(function (this: Worker, event, ...args) {
      const out = emit.call(this, event, ...args)
      if (!doubled && event === 'message' && (args[0] as { t?: string } | undefined)?.t === 'render') {
        doubled = true
        emit.call(this, event, ...args)
      }
      return out
    })
    try {
      const pptx = pool.runPptx(syntheticRows(1, 1), PPTX_NO_ZIP, { render: renderer.render }).catch((error: unknown) => error)
      await vi.waitFor(() => expect(doubled).toBe(true), { timeout: 30_000 })
      spy.mockRestore()
      await new Promise((resolve) => setTimeout(resolve, 50))

      // CPU 칸이 하나다 — 큰 html 이 그것을 쥐면 작은 html 은 줄에 선다. 칸이 두 번 풀렸으면 둘 다 돈다.
      const big = pool.runHtml(syntheticRows(8, 7000), HTML_ZIP)
      const small = pool.runHtml(syntheticRows(1, 1), HTML_NO_ZIP)
      await new Promise((resolve) => setTimeout(resolve, 50))
      expect(pool.stats.queued).toBe(1)

      const failure = await within(pptx, 20_000)
      expect(failure).toBeInstanceOf(ExportWorkerError)
      expect((failure as Error).message).toBe('내보내기 워커가 화면을 두 번 그려 달라고 했습니다')
      // 둘째 부탁은 그리지 않았다 — 첫 부탁의 브라우저만 떠 있다.
      expect(renderer.started).toBe(1)

      renderer.releaseAll()
      await expect(Promise.all([big, small])).resolves.toHaveLength(2)
      await vi.waitFor(() => expect(pool.stats).toMatchObject({ busy: 0, queued: 0, drawSlots: 0 }))
    } finally {
      spy.mockRestore()
      renderer.releaseAll()
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
      expect(pool.stats).toEqual({ threads: 1, busy: 0, queued: 0, drawSlots: 0 })
    } finally {
      await pool.close()
    }
  }, 60_000)

  // 스레드는 죽었는데 메인이 `exit`을 아직 처리하지 않은 틈 — 일이 그 워커를 꺼내 행을 보내고 뒤늦은 죽음을 받는다.
  for (const [how, kill] of [
    ['끝냈다(terminate)', (worker: Worker) => void worker.terminate()],
    // 받을 것이 없는 `screens-done`에 워커가 던진다 — 쉬는 워커의 처리되지 않은 예외다.
    ['예외로 죽었다', (worker: Worker) => worker.postMessage({ t: 'screens-done', fontWarning: null })],
  ] as const) {
    it(`exit 을 처리하기 전에 꺼내도 그 일은 새 워커로 된다 — ${how}`, async () => {
      const pool = new ExportWorkerPool({ limit: 1 })
      try {
        await pool.runHtml(syntheticRows(1, 1), HTML_NO_ZIP)
        const idle = (pool as unknown as { idle: { worker: Worker }[] }).idle
        expect(idle).toHaveLength(1)
        kill(idle[0]!.worker)

        await expect(within(pool.runHtml(syntheticRows(1, 1), HTML_NO_ZIP), 20_000)).resolves.toMatchObject({ kind: 'html' })
        expect(pool.stats).toEqual({ threads: 1, busy: 0, queued: 0, drawSlots: 0 })
      } finally {
        await pool.close()
      }
    }, 60_000)
  }

  it('일을 받은 뒤의 죽음은 다시 하지 않는다 — 같은 일은 또 죽는다', async () => {
    const pool = new ExportWorkerPool({ resourceLimits: { maxOldGenerationSizeMb: 64 } })
    let accepted = 0
    const emit = Worker.prototype.emit
    const spy = vi.spyOn(Worker.prototype, 'emit').mockImplementation(function (this: Worker, event, ...args) {
      if (event === 'message' && (args[0] as { t?: string } | undefined)?.t === 'accepted') accepted++
      return emit.call(this, event, ...args)
    })
    try {
      // 쉬던 워커에 준다 — 받은 뒤 힙 한도로 죽는다.
      await pool.runHtml(syntheticRows(1, 1), HTML_NO_ZIP)
      accepted = 0
      const failure = await pool.runHtml(syntheticRows(12, 7000), HTML_ZIP).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(ExportWorkerError)
      expect(accepted).toBe(1)
    } finally {
      spy.mockRestore()
      await pool.close()
    }
  }, 60_000)
})

describe('줄은 길이로 묶는다', () => {
  // 이 케이스가 재는 것은 «그리는 일 · 그리기 칸을 기다리는 일도 떠 있는 일로 센다»다. 자리를 놓는 규칙은 «잡은 자리는
  // 놓거나 끊기거나 일이 끝나면 돌아온다»가, 503 의 모양은 «라우트 — …»가, 칸 배정은 «칸이 둘이다»의 케이스들이 갖는다 —
  // 그 축이 무너지면 이 케이스도 함께 죽는다.
  it('떠 있는 일이 차면 곧바로 ExportBusyError 다 — 그리는 일과 그리기를 기다리는 일도 센다', async () => {
    const pool = new ExportWorkerPool({ limit: 1, renderLimit: 2, jobLimit: 4 })
    const renderer = new HeldRenderer()
    try {
      // 둘은 그리고, 둘은 그리기 칸을 기다리며 줄에 선다 — 떠 있는 일이 넷이다.
      const jobs = [0, 1, 2, 3].map(() => pool.runPptx(syntheticRows(1, 1), PPTX_NO_ZIP, { render: renderer.render }))
      await vi.waitFor(() => expect(renderer.started).toBe(2), { timeout: 30_000 })
      expect(pool.stats).toMatchObject({ busy: 2, queued: 2 })

      const busy = await pool.runHtml(syntheticRows(1, 1), HTML_NO_ZIP).catch((error: unknown) => error)
      expect(busy).toBeInstanceOf(ExportBusyError)
      expect((busy as ExportBusyError).retryAfterSeconds).toBe(EXPORT_RETRY_AFTER_S)

      renderer.releaseOne()
      await jobs[0]
      pool.admit().release()

      while (renderer.started < 4) {
        renderer.releaseAll()
        await new Promise((resolve) => setTimeout(resolve, 20))
      }
      renderer.releaseAll()
      await expect(Promise.all(jobs)).resolves.toHaveLength(4)
      expect(pool.stats.queued).toBe(0)
    } finally {
      renderer.releaseAll()
      await pool.close()
    }
  }, 60_000)

  it('잡은 자리는 놓거나 끊기거나 일이 끝나면 돌아온다 — 두 번 놓아도 한 번이다', async () => {
    const pool = new ExportWorkerPool({ limit: 1, jobLimit: 2 })
    try {
      // 놓는다 — 라우트가 읽다가 던진 판.
      const a = pool.admit()
      const b = pool.admit()
      expect(() => pool.admit()).toThrow(ExportBusyError)
      a.release()
      a.release()
      // b 가 아직 쥐고 있다 — 남은 자리는 하나다.
      const c = pool.admit()
      expect(() => pool.admit()).toThrow(ExportBusyError)
      c.release()
      b.release()

      const fresh = new ExportWorkerPool({ limit: 1, jobLimit: 2 })
      try {
        // 끊긴다 — 줄에서 빠지고 자리를 내놓는다.
        const running = fresh.runHtml(syntheticRows(8, 7000), HTML_ZIP)
        await vi.waitFor(() => expect(fresh.stats).toMatchObject({ busy: 1, queued: 0 }))
        const gone = new AbortController()
        const queued = fresh.runHtml(syntheticRows(1, 1), HTML_NO_ZIP, { signal: gone.signal }).catch((error: unknown) => error)
        expect(fresh.stats.queued).toBe(1)
        expect(() => fresh.admit()).toThrow(ExportBusyError)
        gone.abort()
        expect(await queued).toBeInstanceOf(ExportAbortedError)
        expect(fresh.stats.queued).toBe(0)
        fresh.admit().release()

        // 끝난다 — 도는 일도 끝나면 자리를 내놓는다.
        await running
        const [x, y] = [fresh.admit(), fresh.admit()]
        x.release()
        y.release()
      } finally {
        await fresh.close()
      }
    } finally {
      await pool.close()
    }
  }, 60_000)

  it('라우트 — 떠 있는 일이 차면 503 + Retry-After 이고 봉투의 문장이 사람에게 간다', async () => {
    const renderer = new HeldRenderer()
    try {
      await withApi(
        async (ctx) => {
          const fixture = await 설계서(ctx, 'worker-busy')
          const people = await 채울사람들(ctx, fixture.projectId)
          const url = `/api/projects/${fixture.projectId}/export/preview?format=pptx`
          // 둘이 그리고, 나머지는 그리기 칸을 기다린다 — 떠 있는 일이 한도에 닿는다. 묻는 사람(`fixture`)은 떠 있는 일이 없다.
          const filling = Array.from({ length: EXPORT_JOB_LIMIT }, (_, i) =>
            ctx.app.inject({ method: 'GET', url, cookies: people[i % people.length]! }),
          )
          await vi.waitFor(() => expect(renderer.started).toBe(EXPORT_RENDER_LIMIT), { timeout: 30_000 })

          // 채우는 요청들이 아직 가드를 지나는 중이면 이 요청이 들어가 돈다 — 한도가 찰 때까지 다시 본다.
          let busy!: Awaited<ReturnType<typeof ctx.app.inject>>
          await vi.waitFor(
            async () => {
              busy = await ctx.app.inject({
                method: 'GET',
                url: `/api/projects/${fixture.projectId}/export/preview`,
                cookies: fixture.cookie,
              })
              expect(busy.statusCode).toBe(503)
            },
            { timeout: 30_000 },
          )
          expect(busy.headers['retry-after']).toBe(String(EXPORT_RETRY_AFTER_S))
          expect(busy.json()).toEqual({ error: { code: 'internal', message: '내보내기가 밀려 있습니다 — 잠시 뒤 다시 시도하세요' } })

          const settled = Promise.all(filling)
          let done = false
          void settled.then(() => (done = true))
          while (!done) {
            renderer.releaseAll()
            await new Promise((resolve) => setTimeout(resolve, 20))
          }
          expect((await settled).map((res) => res.statusCode)).toEqual(filling.map(() => 200))
        },
        { screenRenderer: { render: renderer.render } },
      )
    } finally {
      renderer.releaseAll()
    }
  }, 120_000)

  // 읽은 뒤에 자리를 잡아도 503 은 나온다 — 다만 거절할 요청이 행을 다 읽은 뒤에 나와 한도가 메모리를 묶지 못한다. 그
  // 순서를 답으로 보는 길이 빈 프로젝트다: 읽기가 `EmptyProjectError`(→ 409)를 던지므로, 읽기 전에 거절하면 503 이다.
  it('라우트 — 자리는 행을 읽기 전에 잡는다: 찼을 때 빈 프로젝트는 409 가 아니라 503 이다', async () => {
    const renderer = new HeldRenderer()
    try {
      await withApi(
        async (ctx) => {
          const fixture = await 설계서(ctx, 'worker-busy-before-read')
          const empty = await createProject(ctx, fixture.cookie, { name: '빈 설계서', slug: 'worker-busy-empty' })
          // 한가할 때는 409 다 — 이 프로젝트의 읽기가 정말 던진다.
          const idle = await ctx.app.inject({
            method: 'GET',
            url: `/api/projects/${empty.id}/export/preview?format=pptx`,
            cookies: fixture.cookie,
          })
          expect(idle.statusCode).toBe(409)

          const people = await 채울사람들(ctx, fixture.projectId)
          const filling = Array.from({ length: EXPORT_JOB_LIMIT }, (_, i) =>
            ctx.app.inject({
              method: 'GET',
              url: `/api/projects/${fixture.projectId}/export/preview?format=pptx`,
              cookies: people[i % people.length]!,
            }),
          )
          await vi.waitFor(() => expect(renderer.started).toBe(EXPORT_RENDER_LIMIT), { timeout: 30_000 })
          // 채우는 요청들이 아직 가드를 지나는 중이면 이 요청이 들어가 읽는다 — 한도가 찰 때까지 다시 본다.
          await vi.waitFor(
            async () => {
              const html = await ctx.app.inject({ method: 'GET', url: `/api/projects/${empty.id}/export/preview`, cookies: fixture.cookie })
              expect(html.statusCode).toBe(503)
            },
            { timeout: 30_000 },
          )
          const pptx = await ctx.app.inject({ method: 'GET', url: `/api/projects/${empty.id}/export?format=pptx`, cookies: fixture.cookie })
          expect(pptx.statusCode).toBe(503)

          const settled = Promise.all(filling)
          let done = false
          void settled.then(() => (done = true))
          while (!done) {
            renderer.releaseAll()
            await new Promise((resolve) => setTimeout(resolve, 20))
          }
          expect((await settled).map((res) => res.statusCode)).toEqual(filling.map(() => 200))
        },
        { screenRenderer: { render: renderer.render } },
      )
    } finally {
      renderer.releaseAll()
    }
  }, 120_000)
})

describe('한 사람이 줄을 다 쥐지 않는다', () => {
  it('사람마다 떠 있는 일을 센다 — 넘으면 «내 내보내기» 이고 남의 자리는 그대로다', () => {
    const pool = new ExportWorkerPool({ jobLimit: 4, personJobLimit: 2 })
    try {
      const a1 = pool.admit('가')
      const a2 = pool.admit('가')
      const mine = (() => {
        try {
          pool.admit('가')
        } catch (error) {
          return error
        }
      })()
      expect(mine).toBeInstanceOf(ExportBusyError)
      expect((mine as ExportBusyError).scope).toBe('person')
      expect((mine as ExportBusyError).message).toBe('내 내보내기가 이미 돌고 있습니다 — 앞의 것이 끝난 뒤 다시 시도하세요')
      expect((mine as ExportBusyError).retryAfterSeconds).toBe(EXPORT_RETRY_AFTER_S)

      // 남은 그대로 잡는다 — 전체가 차면 그때는 «밀려 있다»다.
      const b1 = pool.admit('나')
      const b2 = pool.admit('나')
      const full = (() => {
        try {
          pool.admit('다')
        } catch (error) {
          return error
        }
      })()
      expect((full as ExportBusyError).scope).toBe('server')
      expect((full as ExportBusyError).message).toBe('내보내기가 밀려 있습니다 — 잠시 뒤 다시 시도하세요')

      // 놓으면 그 사람의 몫이 돌아온다 — 두 번 놓아도 한 번이다. 이때 전체도 차 있다(넷) — 그래서 **누구의 한도로**
      // 거절했는지까지 본다: 두 번 놓은 것을 두 번 돌려주면 그 사람의 몫은 남고 전체 한도로만 거절된다.
      a1.release()
      a1.release()
      const a3 = pool.admit('가')
      expect(() => pool.admit('가')).toThrow(expect.objectContaining({ scope: 'person' }))
      for (const admission of [a2, a3, b1, b2]) admission.release()
      // 다 놓았으면 사람마다의 셈이 비었다 — 한 사람이 다시 둘을 잡는다.
      pool.admit('가')
      pool.admit('가')
    } finally {
      void pool.close()
    }
  })

  it('`leave`는 사람 몫만 돌려준다 — 전체 자리는 `release`까지 남고, 뒤의 `release`가 사람 몫을 두 번 돌려주지 않는다', () => {
    const pool = new ExportWorkerPool({ jobLimit: 3, personJobLimit: 2 })
    try {
      const a1 = pool.admit('가')
      const a2 = pool.admit('가')
      a1.leave()
      a1.leave()
      // 사람 몫이 하나 돌아왔다 — 셋째를 잡는다. 전체는 셋이 찼다(a1 은 아직 전체 자리를 쥔다).
      const a3 = pool.admit('가')
      expect(() => pool.admit('나')).toThrow(expect.objectContaining({ scope: 'server' }))
      // 끊긴 일이 끝났다 — 전체 자리가 돌아온다. 사람 몫은 이미 돌려줬으므로 또 돌려주지 않는다: 가는 여전히 둘이다.
      a1.release()
      expect(() => pool.admit('가')).toThrow(expect.objectContaining({ scope: 'person' }))
      pool.admit('나')
      for (const admission of [a2, a3]) admission.release()
    } finally {
      void pool.close()
    }
  })

  it('라우트 — 한 사람의 셋째는 «내 내보내기» 503 이고, 같은 사람의 토큰도 그 몫이며, 남은 막히지 않는다', async () => {
    const renderer = new HeldRenderer()
    try {
      await withApi(
        async (ctx) => {
          const fixture = await 설계서(ctx, 'worker-person')
          const other = await signup(ctx)
          await addMember(ctx, fixture.projectId, other.user.id, 'viewer')
          const issued = await ctx.app.inject({
            method: 'POST',
            url: `/api/projects/${fixture.projectId}/tokens`,
            cookies: fixture.cookie,
            payload: { name: '내 토큰' },
          })
          expect(issued.statusCode).toBe(201)
          const token = (issued.json() as { value: string }).value

          // 한 사람이 둘을 띄운다(탭 둘) — 둘 다 그리는 중이다.
          const url = `/api/projects/${fixture.projectId}/export/preview?format=pptx`
          const mine = Array.from({ length: EXPORT_PERSON_JOB_LIMIT }, () =>
            ctx.app.inject({ method: 'GET', url, cookies: fixture.cookie }),
          )
          await vi.waitFor(() => expect(renderer.started).toBe(EXPORT_PERSON_JOB_LIMIT), { timeout: 30_000 })

          const third = await ctx.app.inject({
            method: 'GET',
            url: `/api/projects/${fixture.projectId}/export/preview`,
            cookies: fixture.cookie,
          })
          expect(third.statusCode).toBe(503)
          expect(third.headers['retry-after']).toBe(String(EXPORT_RETRY_AFTER_S))
          expect(third.json()).toEqual({
            error: { code: 'internal', message: '내 내보내기가 이미 돌고 있습니다 — 앞의 것이 끝난 뒤 다시 시도하세요' },
          })

          const byToken = await ctx.app.inject({
            method: 'GET',
            url: `/api/projects/${fixture.projectId}/export?format=html`,
            headers: { authorization: `Bearer ${token}` },
          })
          expect(byToken.statusCode).toBe(503)
          expect((byToken.json() as { error: { message: string } }).error.message).toMatch(/^내 내보내기/)

          const others = await ctx.app.inject({
            method: 'GET',
            url: `/api/projects/${fixture.projectId}/export/preview`,
            cookies: other.cookie,
          })
          expect(others.statusCode).toBe(200)

          renderer.releaseAll()
          expect((await Promise.all(mine)).map((res) => res.statusCode)).toEqual(mine.map(() => 200))
          // 앞의 것이 끝나면 다시 된다.
          const again = await ctx.app.inject({
            method: 'GET',
            url: `/api/projects/${fixture.projectId}/export/preview`,
            cookies: fixture.cookie,
          })
          expect(again.statusCode).toBe(200)
        },
        { screenRenderer: { render: renderer.render } },
      )
    } finally {
      renderer.releaseAll()
    }
  }, 120_000)
})

describe('workerExecArgv', () => {
  it('메인의 --conditions 만 이어받고 tsx 로더를 싣는다', () => {
    const argv = workerExecArgv([
      '--require',
      '/x/preflight.cjs',
      '--conditions',
      'development',
      '-C',
      'node',
      '--conditions=custom',
      '--inspect',
    ])
    expect(argv.slice(0, 5)).toEqual(['--conditions', 'development', '--conditions', 'node', '--conditions=custom'])
    expect(argv[5]).toBe('--import')
    expect(argv[6]).toMatch(/^file:.*\/tsx\/.*esm/)
    expect(argv).toHaveLength(7)
  })
})
