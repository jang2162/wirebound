/**
 * **화면 이미지가 슬라이드에 실린다**.
 *
 * | 무엇 | 어디 |
 * |---|---|
 * | 배선 — 라우트가 그리는 자를 지나 이미지를 싣는가 | 여기 |
 * | 화소를 바이트에서 읽는가 | `test/screen-render.test.ts` |
 * | `fitInto`가 못 읽은 화소에서 무엇을 하는가 | `packages/exporter/test/pptx.test.ts` |
 * | **진짜 브라우저**가 그 계약을 채우는가 | `apps/api/build-test/screen-chromium.test.ts` (`pnpm test:build`) |
 *
 * **여기서 브라우저를 안 띄운다**. 이음매에 가짜를 넣어 재고, 진짜는 게이트 밖에서 돈다.
 */
import { readFileSync } from 'node:fs'
import { unzipSync } from 'fflate'
import type { PageDocument } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { SCREEN_FAILURES_HEADER, SCREENLESS_HEADER } from '../src/routes/export'
import { SCREEN_PATH_FAILED } from '../src/services/export-pptx'
import { NO_KOREAN_FONT, type ScreenBatch, type ScreenJob, type ScreenRenderer, type ScreenResult } from '../src/services/screen-render'
import { createMenuNode, createPage, createProject, signup, withApi, type TestContext } from './helpers'

/** 진짜 1×1 PNG 바이트. `packages/exporter/test/pptx.test.ts`가 같은 것을 든다. */
const PNG_1X1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01,
  0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
])

/**
 * **케이스가 쓰는 가짜 그리는 자.** 받은 번들을 그대로 들고 있어서 *"무엇을 넘겼나"*를
 * 잴 수 있다 — *"HTML 번들의 페이지를 그대로 연다"*를 지키는 자가 그것이다.
 */
class FakeRenderer implements ScreenRenderer {
  readonly seen: ScreenJob[] = []

  constructor(private readonly reply: (requests: ScreenJob['pages']) => ScreenBatch) {}

  async render(job: ScreenJob): Promise<ScreenBatch> {
    this.seen.push(job)
    return this.reply(job.pages)
  }

  /** 마지막 배치가 받은 번들. */
  get last(): ScreenJob {
    const found = this.seen[this.seen.length - 1]
    if (!found) throw new Error('그리는 자가 한 번도 안 불렸습니다')
    return found
  }
}

function ok(width = 1440, height = 1104): ScreenResult {
  return { ok: true, bytes: PNG_1X1, width, height }
}

function fail(reason: string): ScreenResult {
  return { ok: false, reason }
}

/** 전부 성공. */
function allOk(): FakeRenderer {
  return new FakeRenderer((requests) => ({ results: requests.map(() => ok()), fontWarning: null }))
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
  if (res.statusCode !== 200) {
    throw new Error(`putSchema 픽스처가 실패했습니다 (status ${res.statusCode}): ${res.body}`)
  }
}

function doc(rootId: string, buttonId: string, label: string): PageDocument {
  return {
    version: 5,
    root: {
      id: rootId,
      type: 'Page',
      children: [{ id: buttonId, type: 'Button', props: { label }, marker: 1 }],
    },
  }
}

interface Fixture {
  cookie: { wb_session: string }
  projectId: string
  /** 슬라이드에 실릴 순서 그대로의 번들 이름들. */
  titles: string[]
}

/** 메뉴 둘 · 페이지 셋. **하나짜리로 재지 않는다.** */
async function 설계서(ctx: TestContext, slug: string): Promise<Fixture> {
  const user = await signup(ctx)
  const project = await createProject(ctx, user.cookie, { name: `설계서 ${slug}`, slug })
  const cookie = user.cookie

  const 관리자 = await createMenuNode(ctx, cookie, project.id, { title: '관리자' })
  const 회원 = await createMenuNode(ctx, cookie, project.id, { parentId: 관리자.id, title: '회원' })

  const 대시보드 = await createPage(ctx, cookie, project.id, 관리자.id, { title: '대시보드' })
  const 목록 = await createPage(ctx, cookie, project.id, 회원.id, { title: '목록' })
  const 상세 = await createPage(ctx, cookie, project.id, 회원.id, { title: '상세' })

  await putSchema(ctx, cookie, project.id, 대시보드.id, doc('n_d', 'n_db', '대시보드 버튼'))
  await putSchema(ctx, cookie, project.id, 목록.id, doc('n_l', 'n_lb', '목록 버튼'))
  await putSchema(ctx, cookie, project.id, 상세.id, doc('n_s', 'n_sb', '상세 버튼'))

  return {
    cookie,
    projectId: project.id,
    titles: ['관리자 대시보드', '관리자 회원 목록', '관리자 회원 상세'],
  }
}

async function preview(ctx: TestContext, fixture: Fixture): Promise<Record<string, unknown>> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/projects/${fixture.projectId}/export/preview?format=pptx`,
    cookies: fixture.cookie,
  })
  if (res.statusCode !== 200) throw new Error(`미리보기 실패 (${res.statusCode}): ${res.body}`)
  return res.json()
}

async function download(ctx: TestContext, fixture: Fixture): Promise<Record<string, Uint8Array>> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/projects/${fixture.projectId}/export?format=pptx`,
    cookies: fixture.cookie,
  })
  if (res.statusCode !== 200) throw new Error(`내려받기 실패 (${res.statusCode}): ${res.body}`)
  return unzipSync(new Uint8Array(res.rawPayload))
}

function mediaPaths(entries: Record<string, Uint8Array>): string[] {
  return Object.keys(entries)
    .filter((path) => path.startsWith('ppt/media/'))
    .sort()
}

function slideText(entries: Record<string, Uint8Array>, index: number): string {
  return new TextDecoder().decode(entries[`ppt/slides/slide${index}.xml`]!)
}

async function downloadHeaders(ctx: TestContext, fixture: Fixture, format = 'pptx'): Promise<Record<string, unknown>> {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/projects/${fixture.projectId}/export?format=${format}`,
    cookies: fixture.cookie,
  })
  if (res.statusCode !== 200) throw new Error(`내려받기 실패 (${res.statusCode}): ${res.body}`)
  return res.headers
}

/**
 * **파일 응답의 머리가 화면 이미지의 수를 말한다**(`routes/export.ts`의 `SCREEN_FAILURES_HEADER`) — 미리보기를 안 부르는
 * `wireb export`가 그림이 빠진 pptx 를 조용히 받지 않게 하는 자리다. 이유는 미리보기가 갖는다(위 케이스들).
 */
describe('내려받기 응답 머리 — 화면 이미지의 수', () => {
  it('일부 실패면 실패 수 · 전부 성공이면 0 · 그리는 자가 없으면 screenless 수 · html 에는 없다', async () => {
    const partial = new FakeRenderer((requests) => ({
      results: requests.map((request, index) => (index === 1 ? fail('페이지가 응답하지 않습니다') : ok())),
      fontWarning: null,
    }))
    await withApi(
      async (ctx) => {
        const fixture = await 설계서(ctx, 'screens-header-partial')
        const headers = await downloadHeaders(ctx, fixture)
        expect([headers[SCREEN_FAILURES_HEADER], headers[SCREENLESS_HEADER]]).toEqual(['1', '0'])
        // html 에는 화면이 없다 — 머리를 안 싣는다.
        const html = await downloadHeaders(ctx, fixture, 'html')
        expect([html[SCREEN_FAILURES_HEADER], html[SCREENLESS_HEADER]]).toEqual([undefined, undefined])
      },
      { screenRenderer: partial },
    )
    await withApi(
      async (ctx) => {
        const headers = await downloadHeaders(ctx, await 설계서(ctx, 'screens-header-ok'))
        expect([headers[SCREEN_FAILURES_HEADER], headers[SCREENLESS_HEADER]]).toEqual(['0', '0'])
      },
      { screenRenderer: allOk() },
    )
    await withApi(async (ctx) => {
      const headers = await downloadHeaders(ctx, await 설계서(ctx, 'screens-header-absent'))
      expect([headers[SCREEN_FAILURES_HEADER], headers[SCREENLESS_HEADER]]).toEqual(['0', '3'])
    })
  })

  /**
   * **`packages/cli`가 읽는 이름과 같은 글자다.** 앱과 패키지는 서로를 import 하지 않으므로(`CLAUDE.md`) 두 소스의 선언 줄을
   * 읽어 맞댄다 — `actor-census.test.ts`의 «헤더 이름이 `packages/cli` 와 같은 글자다»와 같은 자세다. **줄 머리에 선
   * `export const 이름 = '…'`만 선언으로 본다** — 블록 주석의 줄은 `*`로 시작하고 줄 주석은 `//`로 시작해 걸리지 않는다. 한
   * 파일에 같은 이름의 선언이 둘이 아니면(0 이거나 여럿) 죽는다. 다른 꼴(템플릿 · 이어 붙이기)로 선언하면 여기서 죽는다 —
   * 이 자가 못 보는 것은 값이 **어디서 쓰이는지**다(쓰는 자리는 두 쪽의 값 케이스가 잰다).
   */
  it('머리 이름이 packages/cli 와 같은 글자다', () => {
    const declared = (path: URL, name: string): string[] =>
      [...readFileSync(path, 'utf8').matchAll(new RegExp(`^export const ${name} = '([^']+)'$`, 'gm'))].map((match) => match[1]!)
    const cli = new URL('../../../packages/cli/src/commands/export.ts', import.meta.url)
    const api = new URL('../src/routes/export.ts', import.meta.url)
    for (const name of ['SCREEN_FAILURES_HEADER', 'SCREENLESS_HEADER']) {
      const mine = declared(api, name)
      expect(mine, `apps/api/src/routes/export.ts 의 ${name}`).toHaveLength(1)
      expect(declared(cli, name), `packages/cli/src/commands/export.ts 의 ${name}`).toEqual(mine)
    }
  })
})

describe('공통코드 — 슬라이드의 노드 이름', () => {
  /** 표를 PPTX 로 넘긴다(`ExportPptxOptions.codes`) — 화면 이미지(번들 페이지)가 그린 이름과 오른쪽 칸의 이름이 같아야 한다. */
  it('묶인 노드를 표의 이름으로 부른다', async () => {
    await withApi(async (ctx) => {
      const user = await signup(ctx)
      const project = await createProject(ctx, user.cookie, { name: '설계서 codes-pptx', slug: 'codes-pptx' })
      const menu = await createMenuNode(ctx, user.cookie, project.id, { title: '관리자' })
      const page = await createPage(ctx, user.cookie, project.id, menu.id, { title: '대시보드' })
      const post = (url: string, payload: Record<string, unknown>) =>
        ctx.app.inject({ method: 'POST', url: `/api/projects/${project.id}/codes${url}`, cookies: user.cookie, payload })
      expect((await post('', { key: 'GRADE', name: '등급' })).statusCode).toBe(201)
      expect((await post('/GRADE/items', { value: 'VIP', name: '새 이름' })).statusCode).toBe(201)
      await putSchema(ctx, user.cookie, project.id, page.id, {
        version: 5,
        root: {
          id: 'n_d',
          type: 'Page',
          children: [{ id: 'n_db', type: 'Button', props: { label: '옛 이름' }, code: { group: 'GRADE', item: 'VIP' }, marker: 1 }],
        },
      })
      const xml = slideText(await download(ctx, { cookie: user.cookie, projectId: project.id, titles: [] }), 1)
      expect(xml).toContain('① 새 이름 버튼')
      expect(xml).not.toContain('옛 이름')
    })
  })
})

describe('화면 이미지 — 전부 성공', () => {
  it('페이지마다 매체 파트가 하나씩 실리고 바이트가 그대로다', async () => {
    const renderer = allOk()
    await withApi(
      async (ctx) => {
        const fixture = await 설계서(ctx, 'screens-all')
        const entries = await download(ctx, fixture)

        expect(mediaPaths(entries)).toEqual(['ppt/media/image1.png', 'ppt/media/image2.png', 'ppt/media/image3.png'])
        expect(entries['ppt/media/image1.png']).toEqual(PNG_1X1)
      },
      { screenRenderer: renderer },
    )
  })

  it('슬라이드가 그림을 가리키고 "실리지 않았습니다" 상자를 안 그린다', async () => {
    await withApi(
      async (ctx) => {
        const fixture = await 설계서(ctx, 'screens-pic')
        const entries = await download(ctx, fixture)
        const xml = slideText(entries, 1)
        expect(xml).toContain('<p:pic>')
        expect(xml).not.toContain('화면 이미지가 실리지 않았습니다')
      },
      { screenRenderer: allOk() },
    )
  })

  it('미리보기가 못 그린 것도 글꼴 경고도 안 낸다', async () => {
    await withApi(
      async (ctx) => {
        const fixture = await 설계서(ctx, 'screens-clean')
        const body = await preview(ctx, fixture)
        expect(body.screenless).toEqual([])
        expect(body.screenFailures).toEqual([])
        expect(body.fontWarning).toBeNull()
      },
      { screenRenderer: allOk() },
    )
  })
})

describe('화면 이미지 — 일부 실패', () => {
  it('실패한 장만 빠지고 pptx 는 나온다', async () => {
    const renderer = new FakeRenderer((requests) => ({
      results: requests.map((request, index) => (index === 1 ? fail('페이지가 응답하지 않습니다') : ok())),
      fontWarning: null,
    }))
    await withApi(
      async (ctx) => {
        const fixture = await 설계서(ctx, 'screens-partial')
        const entries = await download(ctx, fixture)

        // 매체는 **둘**이고 이름의 번호는 **슬라이드 번호**다(`pptx/index.ts`의 `mediaName`) —
        // 실린 순서가 아니므로 둘째가 빠지면 `image2.png`도 함께 빠진다.
        expect(mediaPaths(entries)).toEqual(['ppt/media/image1.png', 'ppt/media/image3.png'])
        expect(slideText(entries, 2)).toContain('화면 이미지가 실리지 않았습니다')
        expect(slideText(entries, 1)).toContain('<p:pic>')
      },
      { screenRenderer: renderer },
    )
  })

  it('미리보기가 **어느 페이지가 왜** 실패했는지 말한다 — screenless 와 갈린다', async () => {
    const renderer = new FakeRenderer((requests) => ({
      results: requests.map((request, index) => (index === 1 ? fail('페이지가 응답하지 않습니다') : ok())),
      fontWarning: null,
    }))
    await withApi(
      async (ctx) => {
        const fixture = await 설계서(ctx, 'screens-partial-preview')
        const body = await preview(ctx, fixture)

        expect(body.screenFailures).toEqual([{ title: fixture.titles[1], reason: '페이지가 응답하지 않습니다' }])
        /** **접히지 않는다** — 실패한 것은 *"아직 아무도 안 만들었다"*가 아니다. */
        expect(body.screenless).toEqual([])
      },
      { screenRenderer: renderer },
    )
  })
})

describe('화면 이미지 — 전부 실패', () => {
  it('한 장도 못 그려도 pptx 는 나오고 이유가 셋 다 실린다', async () => {
    const renderer = new FakeRenderer((requests) => ({
      results: requests.map(() => fail('브라우저를 띄우지 못했습니다: 실행 파일이 없습니다')),
      fontWarning: null,
    }))
    await withApi(
      async (ctx) => {
        const fixture = await 설계서(ctx, 'screens-none')
        const entries = await download(ctx, fixture)
        expect(mediaPaths(entries)).toEqual([])
        expect(slideText(entries, 1)).toContain('화면 이미지가 실리지 않았습니다')

        const body = await preview(ctx, fixture)
        expect((body.screenFailures as { title: string }[]).map((item) => item.title)).toEqual(fixture.titles)
        expect(body.screenless).toEqual([])
      },
      { screenRenderer: renderer },
    )
  })
})

describe('그리는 자가 없다 — 화면 없이 낸다', () => {
  it('screenless 가 전부이고 실패는 비어 있다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, 'screens-absent')
      const body = await preview(ctx, fixture)

      expect(body.screenless).toEqual(fixture.titles)
      expect(body.screenFailures).toEqual([])
      expect(body.fontWarning).toBeNull()

      const entries = await download(ctx, fixture)
      expect(mediaPaths(entries)).toEqual([])
    })
  })
})

describe('한글 글꼴이 없다', () => {
  it('두부를 그려 내보내지 않고 미리보기가 그 사실을 말한다', async () => {
    const renderer = new FakeRenderer((requests) => ({
      results: requests.map(() => fail(NO_KOREAN_FONT)),
      fontWarning: NO_KOREAN_FONT,
    }))
    await withApi(
      async (ctx) => {
        const fixture = await 설계서(ctx, 'screens-tofu')
        const body = await preview(ctx, fixture)

        expect(body.fontWarning).toBe(NO_KOREAN_FONT)
        expect((body.screenFailures as { reason: string }[]).map((item) => item.reason)).toEqual([
          NO_KOREAN_FONT,
          NO_KOREAN_FONT,
          NO_KOREAN_FONT,
        ])

        const entries = await download(ctx, fixture)
        expect(mediaPaths(entries)).toEqual([])
      },
      { screenRenderer: renderer },
    )
  })
})

describe('못 읽은 화소를 계약에 넣지 않는다', () => {
  it.each([
    ['0', 0, 0],
    ['NaN', Number.NaN, Number.NaN],
    ['음수', -3, -3],
  ])('그리는 자가 성공이라며 화소 %s 을 주면 그 장은 실패다', async (_label, width, height) => {
    const renderer = new FakeRenderer((requests) => ({
      results: requests.map((request, index) =>
        index === 0 ? { ok: true as const, bytes: PNG_1X1, width: width!, height: height! } : ok(),
      ),
      fontWarning: null,
    }))
    await withApi(
      async (ctx) => {
        const fixture = await 설계서(ctx, `screens-bad-${_label === 'NaN' ? 'nan' : _label === '0' ? 'zero' : 'neg'}`)
        const entries = await download(ctx, fixture)

        /** 늘어난 그림이 실리는 대신 **아무것도 안 실린다.** */
        expect(mediaPaths(entries)).toEqual(['ppt/media/image2.png', 'ppt/media/image3.png'])
        expect(slideText(entries, 1)).toContain('화면 이미지가 실리지 않았습니다')

        const body = await preview(ctx, fixture)
        expect((body.screenFailures as { title: string }[]).map((item) => item.title)).toEqual([fixture.titles[0]])
      },
      { screenRenderer: renderer },
    )
  })
})

describe('무엇을 그리라고 넘기나', () => {
  /** HTML 내려받기의 zip — 번들 뿌리 기준 경로 → 바이트. */
  async function htmlZip(ctx: TestContext, fixture: Fixture): Promise<Map<string, Uint8Array>> {
    const res = await ctx.app.inject({ method: 'GET', url: `/api/projects/${fixture.projectId}/export`, cookies: fixture.cookie })
    if (res.statusCode !== 200) throw new Error(`내려받기 실패 (${res.statusCode}): ${res.body}`)
    return new Map(
      Object.entries(unzipSync(new Uint8Array(res.rawPayload))).map(([name, bytes]) => [name.slice(name.indexOf('/') + 1), bytes]),
    )
  }

  /**
   * **HTML 번들을 그대로 넘긴다 — 새 HTML 을 만들지 않는다.** 넘긴 파일이 같은 프로젝트를 HTML 로 내려받은 zip 의 파일과 경로 · 바이트로
   * 같고, 찍을 페이지는 번들의 페이지 파일이다(그 파일의 페이지 JSON 이 그 제목을 든다). 그리는 자가 그 페이지를 연다
   * (`screen-render-chromium.ts` 머리말).
   */
  it('HTML 번들의 파일 그대로와 페이지 경로를 넘긴다', async () => {
    const renderer = allOk()
    await withApi(
      async (ctx) => {
        const fixture = await 설계서(ctx, 'screens-input')
        await download(ctx, fixture)
        const job = renderer.last
        const zip = await htmlZip(ctx, fixture)

        const encoder = new TextEncoder()
        const bytesOf = (content: string | Uint8Array): number[] => [...(typeof content === 'string' ? encoder.encode(content) : content)]
        expect([...job.files.keys()]).toEqual([...zip.keys()])
        for (const [path, content] of job.files) expect(bytesOf(content), path).toEqual([...zip.get(path)!])

        expect(job.pages.map((page) => page.title)).toEqual(fixture.titles)
        for (const page of job.pages) {
          expect(page.path.startsWith('pages/') && page.path.endsWith('.html'), page.path).toBe(true)
          const html = String(job.files.get(page.path))
          expect(html, page.path).toContain(`<title>${page.title}</title>`)
          expect(html, page.path).toContain('id="wb-export-page"')
        }
        // 카나리아 — 넘긴 번들에 페이지 문서 · 런타임 · 프로젝트 테마가 실제로 든다.
        expect(String(job.files.get(job.pages[0]!.path))).toContain('대시보드 버튼')
        expect(job.files.has('assets/runtime.js')).toBe(true)
        expect(job.files.has('assets/theme/theme.js')).toBe(true)
      },
      { screenRenderer: renderer },
    )
  })

  it('미리보기와 내려받기가 **같은 판정**을 쓴다 — 둘 다 그리는 자를 지난다', async () => {
    const renderer = allOk()
    await withApi(
      async (ctx) => {
        const fixture = await 설계서(ctx, 'screens-same')
        await preview(ctx, fixture)
        await download(ctx, fixture)

        expect(renderer.seen).toHaveLength(2)
        expect(renderer.seen[0]).toEqual(renderer.seen[1])
      },
      { screenRenderer: renderer },
    )
  })

  /**
   * **그리는 입력은 프로젝트 테마를 실은 번들이다** — 새 프로젝트는 system-admin 에 고정돼 선다. 기본 뷰 CSS(`--wb-node-grid-columns`) ·
   * 테마 시트 · 토큰 시트가 다 든다.
   */
  it('기본 뷰 CSS · 테마 · 토큰 시트가 그리는 입력에 든다', async () => {
    const renderer = allOk()
    await withApi(
      async (ctx) => {
        const fixture = await 설계서(ctx, 'screens-theme')
        await download(ctx, fixture)
        const files = renderer.last.files
        expect(String(files.get('assets/views.css'))).toContain('--wb-node-grid-columns')
        expect(files.has('assets/theme/theme.css')).toBe(true)
        expect(files.has('assets/tokens.css')).toBe(true)
      },
      { screenRenderer: renderer },
    )
  })
})

describe('그리는 자가 던진다 — 라우트 둘이 500 을 내지 않는다', () => {
  /**
   * **이음매의 계약이 문서뿐이다.** `ScreenRenderer.render`는 *"던지지 않는다"*로 적혀
   * 있지만 **타입이 그것을 강제하지 못한다** — 던지는 구현이 들어오면 부르는 쪽이 막지
   * 않는 한 라우트 둘이 **500**을 낸다.
   *
   * 구현 **안쪽**(`screen-render-chromium.ts`)에서 막으면 그 한 갈래(글꼴 물음의 예외 같은
   * 것)만 닫힌다. 여기서 닫는 것은 **부르는 쪽**이므로 어떤 구현이 던져도 같다.
   */
  class 던지는렌더러 implements ScreenRenderer {
    async render(): Promise<ScreenBatch> {
      throw new Error('그리는 자가 터졌다\n두 번째 줄은 잘려야 한다')
    }
  }

  it('내려받기가 200 이고 pptx 가 나온다 — 화면만 빠진다', async () => {
    await withApi(
      async (ctx) => {
        const fixture = await 설계서(ctx, 'screens-throw-dl')
        const entries = await download(ctx, fixture)
        expect(mediaPaths(entries)).toEqual([])
        expect(slideText(entries, 1)).toContain('화면 이미지가 실리지 않았습니다')
      },
      { screenRenderer: new 던지는렌더러() },
    )
  })

  it('미리보기가 200 이고 **왜** 못 그렸는지 말한다', async () => {
    await withApi(
      async (ctx) => {
        const fixture = await 설계서(ctx, 'screens-throw-pv')
        const body = await preview(ctx, fixture)

        const failures = body.screenFailures as { title: string; reason: string }[]
        expect(failures.map((item) => item.title)).toEqual(fixture.titles)
        for (const failure of failures) {
          expect(failure.reason).toContain(SCREEN_PATH_FAILED)
          expect(failure.reason).toContain('그리는 자가 터졌다')
          // 여러 줄짜리 오류가 그대로 실리면 응답이 길어진다 — 첫 줄만 싣는다.
          expect(failure.reason).not.toContain('두 번째 줄')
        }
        /** **접히지 않는다** — 던진 것도 *"만들려다 실패했다"*이지 *"아무도 안 만들었다"*가 아니다. */
        expect(body.screenless).toEqual([])
        expect(body.fontWarning).toBeNull()
      },
      { screenRenderer: new 던지는렌더러() },
    )
  })
})
