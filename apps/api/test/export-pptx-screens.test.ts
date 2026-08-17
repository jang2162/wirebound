/**
 * **화면 이미지가 슬라이드에 실린다**(P10-2 T3·T4·T5 · D2·D4·D5·D6·D8).
 *
 * | 무엇 | 어디 |
 * |---|---|
 * | 배선 — 라우트가 그리는 자를 지나 이미지를 싣는가 | 여기 |
 * | 화소를 바이트에서 읽는가 | `test/screen-render.test.ts` |
 * | `fitInto`가 못 읽은 화소에서 무엇을 하는가 | `packages/exporter/test/pptx.test.ts` |
 * | **진짜 브라우저**가 그 계약을 채우는가 | `apps/api/build-test/screen-chromium.test.ts` (`pnpm test:build`) |
 *
 * **여기서 브라우저를 안 띄운다**(D3). 이음매에 가짜를 넣어 재고, 진짜는 게이트 밖에서 돈다.
 */
import { unzipSync } from 'fflate'
import type { PageDocument } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { SCREEN_PATH_FAILED } from '../src/services/export-pptx'
import { NO_KOREAN_FONT, type ScreenBatch, type ScreenRenderer, type ScreenRequest, type ScreenResult } from '../src/services/screen-render'
import { createMenuNode, createPage, createProject, signup, withApi, type TestContext } from './helpers'

/** 진짜 1×1 PNG 바이트. `packages/exporter/test/pptx.test.ts`가 같은 것을 든다. */
const PNG_1X1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82,
])

/**
 * **케이스가 쓰는 가짜 그리는 자.** 받은 요청을 그대로 들고 있어서 *"무엇을 넘겼나"*를
 * 잴 수 있다 — D2(*"`exportPage`가 낸 HTML을 그대로 띄운다"*)를 지키는 자가 그것이다.
 */
class FakeRenderer implements ScreenRenderer {
  readonly seen: ScreenRequest[][] = []

  constructor(
    private readonly reply: (requests: readonly ScreenRequest[]) => ScreenBatch,
  ) {}

  async render(requests: readonly ScreenRequest[]): Promise<ScreenBatch> {
    this.seen.push([...requests])
    return this.reply(requests)
  }

  /** 마지막 배치가 받은 요청들. */
  get last(): ScreenRequest[] {
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
    version: 1,
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

describe('화면 이미지 — 전부 성공 (D5)', () => {
  it('페이지마다 매체 파트가 하나씩 실리고 바이트가 그대로다', async () => {
    const renderer = allOk()
    await withApi(
      async (ctx) => {
        const fixture = await 설계서(ctx, 'screens-all')
        const entries = await download(ctx, fixture)

        expect(mediaPaths(entries)).toEqual([
          'ppt/media/image1.png',
          'ppt/media/image2.png',
          'ppt/media/image3.png',
        ])
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

describe('화면 이미지 — 일부 실패 (D5)', () => {
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

        expect(body.screenFailures).toEqual([
          { title: fixture.titles[1], reason: '페이지가 응답하지 않습니다' },
        ])
        /** **접히지 않는다** — 실패한 것은 *"아직 아무도 안 만들었다"*가 아니다(P10-1 이월 §2.3). */
        expect(body.screenless).toEqual([])
      },
      { screenRenderer: renderer },
    )
  })
})

describe('화면 이미지 — 전부 실패 (D5)', () => {
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
        expect((body.screenFailures as { title: string }[]).map((item) => item.title)).toEqual(
          fixture.titles,
        )
        expect(body.screenless).toEqual([])
      },
      { screenRenderer: renderer },
    )
  })
})

describe('그리는 자가 없다 — P10-1 이 만든 상태 그대로다', () => {
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

describe('한글 글꼴이 없다 (D4)', () => {
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

describe('못 읽은 화소를 계약에 넣지 않는다 (D8)', () => {
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
        expect((body.screenFailures as { title: string }[]).map((item) => item.title)).toEqual([
          fixture.titles[0],
        ])
      },
      { screenRenderer: renderer },
    )
  })
})

describe('무엇을 그리라고 넘기나 (D2)', () => {
  it('`exportPage` 가 낸 한 장을 그대로 넘긴다 — 새 HTML 을 만들지 않는다', async () => {
    const renderer = allOk()
    await withApi(
      async (ctx) => {
        const fixture = await 설계서(ctx, 'screens-input')
        await download(ctx, fixture)

        const requests = renderer.last
        expect(requests.map((request) => request.title)).toEqual(fixture.titles)
        for (const request of requests) {
          expect(request.html.startsWith('<!doctype html>')).toBe(true)
          expect(request.html).toContain('<html lang="ko">')
          // 제목은 `exportPage`가 `<title>`에 싣는다 — **번들 이름 그대로다.**
          expect(request.html).toContain(`<title>${request.title}</title>`)
          // CSS 는 따로 온다(`exportPage`의 계약) — HTML 안에 시트가 없다.
          expect(request.html).not.toContain('<style')
          expect(request.css.length).toBeGreaterThan(0)
          /**
           * **`<script>`가 없다는 것이 값이어야 한다.** 리뷰가 이것을 재서
           * *"오늘 팝업으로 나갈 길이 없다"*를 세웠는데(귀속: 리뷰 §4.2) 그 근거가
           * **산문이면 `exportPage`가 바뀌는 날 조용히 열린다.** 차단은 컨텍스트로
           * 올렸고(`screen-render-chromium.ts`), 이 줄은 그 위의 두 번째 방벽이다.
           */
          expect(request.html).not.toContain('<script')
        }
        // 페이지 문서가 실제로 그려졌다 — 버튼의 글자가 HTML 에 있다.
        expect(requests[0]!.html).toContain('대시보드 버튼')
      },
      { screenRenderer: renderer },
    )
  })

  it('미리보기와 내려받기가 **같은 판정**을 쓴다 (D6) — 둘 다 그리는 자를 지난다', async () => {
    const renderer = allOk()
    await withApi(
      async (ctx) => {
        const fixture = await 설계서(ctx, 'screens-same')
        await preview(ctx, fixture)
        await download(ctx, fixture)

        expect(renderer.seen).toHaveLength(2)
        expect(renderer.seen[0]!.map((request) => request.html)).toEqual(
          renderer.seen[1]!.map((request) => request.html),
        )
      },
      { screenRenderer: renderer },
    )
  })

  it('테마가 그리는 입력으로 들어간다 — 시트가 빈 문자열이 아니다', async () => {
    const renderer = allOk()
    await withApi(
      async (ctx) => {
        const fixture = await 설계서(ctx, 'screens-theme')
        await download(ctx, fixture)
        // 프로젝트를 만들면 기본 레이아웃이 시스템 `admin`을 가리킨다(`repos/projects.ts`).
        // 그 테마가 컴파일된 시트가 여기 있어야 슬라이드의 화면이 캔버스와 같은 색이 된다.
        //
        // **`--wb-`로는 안 갈린다** — 구조 기본 CSS 도 그 접두를 쓴다(변이로 확인했다:
        // `theme: null`을 심어도 0 사망이었다). 테마만 내는 것은 팔레트 선언이다.
        expect(renderer.last[0]!.css).toContain('--wb-palette-')
        // 구조 기본 CSS 도 함께 있어야 한다 — 순서가 곧 *"테마가 이긴다"*이다(`pageCss`).
        expect(renderer.last[0]!.css).toContain('--wb-')
      },
      { screenRenderer: renderer },
    )
  })
})

describe('그리는 자가 던진다 (D5 · 리뷰 §2 — 라우트 둘이 500 이었다)', () => {
  /**
   * **이음매의 계약이 문서뿐이었다.** `ScreenRenderer.render`는 *"던지지 않는다"*로 적혀
   * 있지만 **타입이 그것을 강제하지 못한다.** 리뷰가 던지는 구현을 넣어 라우트 둘이
   * **500**을 내는 것을 값으로 봤다(귀속: 리뷰 §2.1).
   *
   * **이 슬라이스가 이 부류에 두 번 물렸다** — 앞의 한 번은 글꼴 물음의 예외였고 스모크가
   * 잡았다. 그 고침은 `screen-render-chromium.ts` **안쪽**이라 그 한 갈래만 닫았다.
   * 여기서 닫는 것은 **부르는 쪽**이므로 어떤 구현이 던져도 같다.
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
