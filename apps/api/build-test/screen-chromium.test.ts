/**
 * **진짜 브라우저가 계약을 채우는가.**
 *
 * `pnpm test`는 이음매(`src/services/screen-render.ts`)에 가짜를 넣어 재고, **여기서 한 번은
 * 진짜로 그린다** — 안 재면 그 이음매의 계약(PNG 형식 · 바이트에서 읽은 화소 · pptx 에 실리는
 * 자리)이 맞는지 아무도 모른다. 넘기는 것은 HTML 번들 그대로이고(`screen-jobs.ts` 의 `bundled` — 런타임은 저장소 빌드가 지은
 * `@wirebound/exporter/runtime.js`), 그리는 자가 그 페이지를 열어 번들 런타임이 프로젝트 테마로 그린 목업을 찍는다.
 *
 * ---
 *
 * # 왜 `pnpm test:build` 인가
 *
 * 게이트 넷을 매번 도는 저장소다. 브라우저를 단위 케이스에 넣으면 개발 루프가 매번
 * 느려지고 기계마다 결과가 갈린다. `test:build`는 이미 *"무거운 것"*을 담는 자리이고
 * (`packages/exporter/build-test/`), **없으면 건너뛰고 그렇다고 말하는** 결도 거기 있다
 * (`dist-pptx.test.ts`가 macOS 파서 둘에 대해 같은 일을 한다).
 *
 * # 이 자가 못 잡는 것
 *
 * | 무엇 | 누가 잡나 |
 * |---|---|
 * | 브라우저가 없는 기계에서 무슨 일이 나는가 | **여기서 잰다**(아래 *"바이너리가 없으면"*) |
 * | 한글 글꼴이 **없는** 기계 | **여기서 죽는다** — 「한글이 두부가 아니다」와 그린 것을 보는 케이스들(리눅스 컨테이너에서 한글 글리프를 든 글꼴을 걷고 쟀다). 그래서 배포할 이미지 안에서 돌린다(최상위 README 「배포하려면」) |
 * | 받는 쪽(PowerPoint)이 그림을 그리는가 | **사람이 손으로** — `packages/exporter/build-test/dist-pptx.test.ts` 「진짜 자는 PowerPoint다」의 절차 |
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { fileURLToPath } from 'node:url'
import { exportBundle, exportPptx, type PptxScreen } from '@wirebound/exporter'
import { installCatalog, type PageDocument } from '@wirebound/schema'
import { chromium, type Page, type Route } from 'playwright-core'
import { describe, expect, it } from 'vitest'
import {
  chromiumScreenRenderer,
  KOREAN_GLYPH_PROBE,
  SCREEN_DEFAULTS,
  SCREEN_GREW,
  SCREEN_NOT_READY,
  SCREEN_ORIGIN,
  SCREEN_TOO_LARGE,
} from '../src/services/screen-render-chromium'
import { readExportRuntime } from '../src/services/export-runtime'
import { decideKoreanGlyphs, readPngSize, type KoreanGlyphSamples, type ScreenJob } from '../src/services/screen-render'
import { builtSample } from '../test/theme-fixtures'
import { readApiEnvFile } from '../test/test-database-url'
import { bundled, countColor, inlineTheme, jobOf, packageTheme, raw, type Entry } from './screen-jobs'

installCatalog()

/**
 * **서버가 띄우는 그 브라우저로 잰다** — `SCREEN_CHROMIUM_PATH` 를 서버와 같은 순서(셸 → `apps/api/.env`, `--env-file-if-exists`
 * 와 같다)로 읽고, 비면 playwright-core 캐시다(`config.ts` 가 빈 문자열을 안 준 것으로 보는 것과 같다).
 *
 * 안 보면 배포판 chromium 을 쓰는 기계(`SCREEN_CHROMIUM_PATH=/usr/bin/chromium`)에서 캐시가 비었다며 **전부 건너뛰고 초록**이다 —
 * 그 브라우저가 한글 글꼴이 없어 서버가 한 장도 못 그려도 그렇다(`node:22-slim` + `apt-get install chromium` 컨테이너에서
 * 쟀다: 2 통과 · 13 건너뜀). 최상위 README 「배포하려면」이 이 스모크를 배포할 이미지 안에서 돌리라고 든다.
 */
function screenChromiumPath(): string | undefined {
  const value = process.env.SCREEN_CHROMIUM_PATH ?? readApiEnvFile().SCREEN_CHROMIUM_PATH
  return value === undefined || value === '' ? undefined : value
}

const EXECUTABLE_PATH = screenChromiumPath()
const LAUNCH = EXECUTABLE_PATH === undefined ? {} : { executablePath: EXECUTABLE_PATH }

/** 이 스모크가 부르는 렌더러 — 서버와 같은 실행 파일을 쓴다. `options` 가 그 경로를 덮을 수 있다(«바이너리가 없으면»). */
function renderer(options: Parameters<typeof chromiumScreenRenderer>[0] = {}): ReturnType<typeof chromiumScreenRenderer> {
  return chromiumScreenRenderer({ ...LAUNCH, ...options })
}

/**
 * 이 기계에서 렌더러가 띄우는 브라우저가 뜨나. **안 뜨면 건너뛰고 그렇다고 말한다.**
 *
 * **경로가 아니라 실제로 띄워서 본다.** 렌더러는 `chromium.launch()`로 헤드리스 셸(`chromium_headless_shell-<리비전>`)을
 * 띄우는데 `chromium.executablePath()`는 **전체 Chromium** 의 경로다 — 최상위 README 「넣는 법」 절대로 `--only-shell` 만
 * 넣은 기계에서는 그 경로가 없어 브라우저가 뜨는데도 전부 건너뛴다(다시 재는 법: 셸 디렉터리만 든
 * `PLAYWRIGHT_BROWSERS_PATH` 로 이 파일을 돌린다).
 */
async function browserLaunches(): Promise<boolean> {
  try {
    const browser = await chromium.launch(LAUNCH)
    await browser.close()
    return true
  } catch {
    return false
  }
}

const 있다 = await browserLaunches()

if (!있다) {
  // eslint-disable-next-line no-console
  console.log(
    EXECUTABLE_PATH === undefined
      ? '[screen-chromium 스모크] Chromium 을 띄우지 못해 건너뛴다 — 넣는 법: `node apps/api/node_modules/playwright-core/cli.js install chromium --only-shell`(최상위 README 「넣는 법」 절)'
      : `[screen-chromium 스모크] SCREEN_CHROMIUM_PATH(${EXECUTABLE_PATH})를 띄우지 못해 건너뛴다 — 서버도 그 경로로는 못 그린다(최상위 README 「기계에 이미 있는 브라우저를 쓰기」 절)`,
  )
}

/**
 * 페이지 문서 하나. **한글이 들어 있다** — 두부가 되는지 재려면 그래야 한다.
 *
 * **카탈로그에 있는 것만 쓴다** — `Heading` 타입은 없고(`Text` + `role`이다) `Text`의 prop은
 * `text`가 아니라 `content`다. 카탈로그에 없는 것을 쓰면 *"진짜 브라우저가 그린 PNG"*가
 * **오류 상자의 사진**이 되는데, 계약 쪽 측정(서명·폭·높이·타임아웃·상한·차단)은 내용과
 * 무관해 그대로 초록이다 — *"화면이 화면처럼 보인다"*만 조용히 무너진다.
 *
 * **아래 「스모크 픽스처가 진짜 화면인가」가 그것을 값으로 지킨다** — 픽스처가 낡으면 거기서 죽는다.
 */
function doc(index: number, rows: number): PageDocument {
  return {
    version: 5,
    root: {
      id: `n_page_${index}`,
      type: 'Page',
      children: [
        { id: `n_head_${index}`, type: 'Text', props: { content: `회원 목록 ${index}`, role: 'h1' } },
        { id: `n_btn_${index}`, type: 'Button', props: { label: '검색' } },
        ...Array.from({ length: rows }, (_unused, row) => ({
          id: `n_row_${index}_${row}`,
          type: 'Text',
          props: { content: `${row}번째 줄 — 한글 본문이 들어간다`, role: 'body' },
        })),
      ],
    },
  } as unknown as PageDocument
}

/** 번들 한 장. `themeCss` 를 주면 그 CSS 를 `theme.css` 로 싣는 작은 테마로 그린다 — 테마 CSS 가 화면에 닿는 판을 세울 때 준다. */
function requestFor(index: number, rows: number, themeCss?: string): Entry {
  return bundled(`관리자 회원 목록${index}`, doc(index, rows), themeCss === undefined ? null : inlineTheme({ themeCss }))
}

/** 장들을 그린다(`jobOf`). */
function draw(entries: Entry[], options: Parameters<typeof chromiumScreenRenderer>[0] = {}) {
  return renderer(options).render(jobOf(...entries))
}

describe.skipIf(!있다)('진짜 브라우저가 그린 PNG', () => {
  it('계약이 요구하는 것을 낸다 — PNG 이고 화소를 읽을 수 있다', async () => {
    const drawing = renderer()
    // **하나짜리로 재지 않는다.** 셋이고 길이가 서로 다르다.
    const requests = [requestFor(1, 4), requestFor(2, 40), requestFor(3, 4)]
    const batch = await drawing.render(jobOf(...requests))

    expect(batch.results).toHaveLength(3)
    expect(batch.fontWarning).toBeNull()

    for (const result of batch.results) {
      expect(result.ok).toBe(true)
      if (!result.ok) continue
      // 서명을 우리 파서가 아니라 바이트로 직접 본다.
      expect([...result.bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      expect(readPngSize(result.bytes)).toEqual({ width: result.width, height: result.height })
      // 뷰포트 720 × 배율 2배 — **폭은 정해져 있다.**
      expect(result.width).toBe(1440)
      expect(result.height).toBeGreaterThanOrEqual(1104)
    }

    /**
     * **긴 페이지가 더 높다.** 뷰포트만 찍으면 셋이 같은 높이일 것이고, 그러면 긴
     * 페이지의 아래가 잘린 채 목업이 나간다 — 그것이 `fullPage`를 켠 이유다.
     */
    const heights = batch.results.map((result) => (result.ok ? result.height : 0))
    expect(heights[1]!).toBeGreaterThan(heights[0]!)
    expect(heights[0]).toBe(heights[2])
  })

  it('한글이 두부가 아니다 — 이 기계에는 글꼴이 있다', async () => {
    const batch = await draw([requestFor(1, 4)])
    expect(batch.fontWarning).toBeNull()
    expect(batch.results[0]!.ok).toBe(true)
  })

  it('그린 것이 pptx 의 매체로 그대로 실린다 — 계약이 이어진다', async () => {
    const requests = [requestFor(1, 6), requestFor(2, 6)]
    const batch = await draw(requests)

    const screens: (PptxScreen | null)[] = batch.results.map((result, index) =>
      result.ok ? { fileName: `screen${index + 1}.png`, bytes: result.bytes, width: result.width, height: result.height } : null,
    )

    const { parts, screenless } = exportPptx({
      pages: requests.map((request, index) => ({
        title: request.title,
        document: doc(index + 1, 6),
        screen: screens[index] ?? null,
      })),
    })

    expect(screenless).toEqual([])
    const media = parts.filter((part) => part.path.startsWith('ppt/media/'))
    expect(media.map((part) => part.path)).toEqual(['ppt/media/image1.png', 'ppt/media/image2.png'])
    // **바이트가 그대로다** — 어딘가에서 다시 인코딩되면 여기서 죽는다.
    expect(media[0]!.content).toEqual(batch.results[0]!.ok ? batch.results[0]!.bytes : null)
  })

  /**
   * **진짜 타임아웃이 예외가 아니라 값이 되는가.**
   *
   * 글꼴 물음이 던지면 그것이 `render` 밖으로 새어 나가 **내보내기 하나가 통째로 500**이
   * 된다 — 가짜로는 못 보는 갈래다. 1ms는 이 기계에서 어떤 페이지도 못 지키므로 글꼴 물음이
   * 먼저 걸리고, 그때도 **결과는 요청과 같은 길이로 나와야 한다.**
   */
  it('한 장도 못 그려도 던지지 않는다 — 타임아웃이 값이 된다', async () => {
    const requests = [requestFor(1, 4), requestFor(2, 4)]
    const batch = await draw(requests, { timeoutMs: 1 })

    expect(batch.results).toHaveLength(requests.length)
    expect(batch.results.map((result) => result.ok)).toEqual([false, false])
    for (const result of batch.results) {
      if (result.ok) continue
      expect(result.reason).toContain('Timeout')
    }
    /** **글꼴이 없다고 말하지 않는다** — 못 물은 것과 없는 것은 다르다. */
    expect(batch.fontWarning).toBeNull()
  })

  /**
   * **바깥으로 나가는 요청을 끊는가.**
   *
   * 페이지의 HTML · CSS 가 가리키는 바깥 주소(`@font-face` · `url()` · `<link>`)를 서버가 가져가면 그것을 적은 사람의
   * 주소로 **서버가 요청을 보내는 자리**가 된다.
   *
   * **재는 방법은 「기다리지 않는다」이다.** 라우팅되는 곳이 없는 주소를 걸어 두면 끊는
   * 쪽은 그대로 그리고, 안 끊는 쪽은 `load`를 기다리다 타임아웃으로 죽는다.
   *
   * **이 자의 한계:** 그 주소가 **빨리 거절되는** 망에서는 안 끊어도 통과한다 — 그때
   * 이 케이스는 조용히 이빨을 잃는다(초록이 되지 빨강이 되지 않는다). 이 기계에서 갈리는지는
   * `chromiumScreenRenderer`의 요청 차단을 지우고 이 케이스가 죽는지로 다시 잰다.
   */
  it('바깥 자원을 든 페이지도 그려진다 — 요청을 끊으므로 기다리지 않는다', async () => {
    const request = raw(
      '바깥 자원',
      '<!doctype html><html lang="ko"><head>' +
        '<link rel="stylesheet" href="http://10.255.255.1/x.css">' +
        '</head><body><h1>회원 목록</h1></body></html>',
      'body { color: #111 }',
    )
    const batch = await draw([request], { timeoutMs: 3000 })
    expect(batch.results[0]!.ok).toBe(true)
  })

  it('상한을 넘은 장은 조용히 빠지지 않고 분모를 말한다', async () => {
    const requests = [requestFor(1, 4), requestFor(2, 4), requestFor(3, 4)]
    const batch = await draw(requests, { maxPages: 2 })

    expect(batch.results.slice(0, 2).every((result) => result.ok)).toBe(true)
    const last = batch.results[2]!
    expect(last.ok).toBe(false)
    if (!last.ok) {
      expect(last.reason).toContain('2장')
      expect(last.reason).toContain('3장 중 3번째')
    }
  })

  /**
   * **넓이 상한을 넘은 장은 찍지 않고 크기와 상한을 말한다**(`SCREEN_DEFAULTS.maxArea`) — 긴 페이지 한 장의 비트맵이 서버의
   * 메모리를 다 먹는다. 상한 바로 밑은 그린다 — 상한이 멀쩡한 페이지를 막지 않는다. 폭이 뷰포트를 넘는 페이지도 넓이로 잰다.
   */
  it('넓이 상한을 넘은 장은 그리지 않고 크기와 상한을 말한다 — 바로 밑은 그린다', async () => {
    const block = (width: number, height: number): Entry =>
      raw(
        `${width}×${height}`,
        `<!doctype html><html lang="ko"><body style="margin:0"><div style="width:${width}px;height:${height}px">긴 페이지</div></body></html>`,
        'body { color: #111 }',
      )
    const maxHeight = SCREEN_DEFAULTS.maxArea / 720
    const batch = await draw([block(720, maxHeight), block(720, maxHeight + 1), block(1440, maxHeight / 2 + 1)])
    const [under, tall, wide] = batch.results
    expect(under!.ok ? [under!.width, under!.height] : under).toEqual([1440, maxHeight * 2])
    expect(tall).toEqual({ ok: false, reason: `${SCREEN_TOO_LARGE} — 720×${maxHeight + 1}px(상한 720×${maxHeight}px 넓이)` })
    expect(wide).toEqual({ ok: false, reason: `${SCREEN_TOO_LARGE} — 1440×${maxHeight / 2 + 1}px(상한 720×${maxHeight}px 넓이)` })
  })
})

/**
 * **잰 크기와 찍는 크기가 같은 상태를 본다**(`screen-render-chromium.ts` 의 `FREEZE_MOTION` · `PAGE_SIZE` · 잰 크기로 묶어 찍기).
 * 넓이 상한은 찍기 전에 재고 playwright 는 찍으면서 크기를 다시 잰다 — 그 사이에 자라는 페이지가 상한을 지난 비트맵이 됐다.
 *
 * **판을 타이밍에 맡기지 않는다.** 전이는 지연을 5초로 둬 찍기가 끝나기 전에 안 끝나고(끄기가 없으면 늘 작게 재고 작게 찍는다),
 * 글꼴은 막힌 원본 열 개를 거쳐 온다(원본마다 서버까지 왕복해 끊겨, 기다림이 없으면 늘 오기 전에 잰다). 찍는 사이에 자라는 판은
 * `screenshot` 을 감싸 잰 직후에 키운다. 지연을 몇 ms 로 둔 경주 판은 같은 소스에서 거절과 통과가 섞여 자로 못 쓴다.
 */
describe.skipIf(!있다)('잰 크기와 찍는 크기', () => {
  /** 여백 20000px 를 전이로 거는 테마 CSS 의 페이지 — 테마 CSS 는 무엇이든 적을 수 있다(`!important` 도). */
  function growingPage(transition: string): Entry {
    return requestFor(1, 4, `[data-wb-component="Page"] { padding-top: 20000px; padding-bottom: 20000px; transition: ${transition} }`)
  }

  it('전이로 자라는 페이지는 끝 크기로 재서 거절한다 — 값에 `!important` 를 실어도', async () => {
    const batch = await draw([growingPage('padding 1ms linear 5s'), growingPage('padding 1ms linear 5s !important')])
    const seen = batch.results.map((result) => (result.ok ? `그림 ${result.width}×${result.height}` : result.reason))
    // 끝 크기는 여백 둘(40000px) 너머 — 전이 앞에 재면 뷰포트(552px)다.
    const final = expect.stringMatching(new RegExp(`^${SCREEN_TOO_LARGE} — 720×4\\d{4}px\\(`))
    expect(seen).toEqual([final, final])
  })

  it('늦게 오는 글꼴은 기다린 뒤 잰다', async () => {
    const lines = Array.from({ length: 40 }, (_unused, index) => `<p style="margin:0">line ${index}</p>`).join('')
    const blocked = Array.from({ length: 10 }, (_unused, index) => `url(https://font.invalid/${index}.ttf)`).join(', ')
    // 막힌 원본 뒤에 이 기계에 있는 글꼴을 두고 세로 지표를 15배로 — 오면 40줄이 상한(8192px)을 넘는다. 어느 것도 없으면 대체 글꼴로 작게 그려져 여기서 죽는다.
    const local = ['Arial', 'DejaVu Sans', 'Noto Sans CJK KR', 'NotoSansCJKkr-Regular'].map((name) => `local("${name}")`).join(', ')
    const batch = await draw([
      raw(
        '늦은 글꼴',
        `<!doctype html><html lang="ko"><body style="margin:0">${lines}</body></html>`,
        `@font-face { font-family: Tall; src: ${blocked}, ${local}; ascent-override: 1500% } body { font-family: Tall; font-size: 16px }`,
      ),
    ])
    const [result] = batch.results
    expect(result!.ok ? `그림 ${result!.width}×${result!.height}` : result!.reason).toMatch(
      new RegExp(`^${SCREEN_TOO_LARGE} — 720×\\d+px\\(`),
    )
  })

  /**
   * **글꼴을 기다리는 것도 한 장의 한도 안이다.** `page.evaluate` 는 컨텍스트의 기본 한도를 안 받아, 재기가 기다리는
   * `document.fonts.ready` 는 한도 없이 기다렸다. 받기를 끝나지 않게 만드는 페이지는 못 찾았지만(원격 요청은 끊기고 `data:` ·
   * `local()` · 낯선 스킴은 곧 끝난다) 막힌 원본을 가족마다 줄줄이 달면 받기가 가족을 차례로 지나 원본 수만큼 길어진다 — 1MiB 안의
   * 파생 테마(가족 23 × 원본 2000)가 한 장에 15s 를 기다리고 `ok` 로 끝났다(한 장 한도 10s). 여기서는 가족 40 × 원본 800 을
   * 한도 3s 로 잰다 — 한도가 없으면 기다린 뒤 그림이 나와 여기서 죽는다.
   */
  it('글꼴을 기다리는 것도 한 장의 한도 안이다 — 넘으면 그 장이 실패하고 까닭을 말한다', async () => {
    const families = Array.from({ length: 40 }, (_unused, family) => family)
    const faces = families
      .map((family) => {
        const blocked = Array.from({ length: 800 }, (_unused, index) => `url(https://font.invalid/${family}/${index}.ttf)`).join(', ')
        return `@font-face { font-family: Slow${family}; src: ${blocked} }`
      })
      .join('\n')
    const chain = families.map((family) => `Slow${family}`).join(', ')
    const batch = await draw(
      [
        raw(
          '느린 글꼴',
          '<!doctype html><html lang="ko"><body><p>회원 목록</p></body></html>',
          `${faces}\nbody { font-family: ${chain}, sans-serif }`,
        ),
      ],
      { timeoutMs: 3000 },
    )
    expect(batch.results).toEqual([{ ok: false, reason: `${SCREEN_NOT_READY} — 3000ms` }])
  })

  it('찍는 사이에 자라도 비트맵은 잰 크기를 안 넘고, 위쪽만 잘린 그림을 내지 않는다', async () => {
    // **렌더러가 쓰는 그 `Page` 클래스를 감싼다** — 같은 `playwright-core` 모듈이다. 잰 직후(찍기 바로 앞)에 페이지를 40000px 키운다.
    const probe = await chromium.launch(LAUNCH)
    const proto = Object.getPrototypeOf(await probe.newPage()) as { screenshot: Page['screenshot'] }
    await probe.close()
    const original = proto.screenshot
    const captured: unknown[] = []
    proto.screenshot = async function (this: Page, options) {
      await this.evaluate(`document.body.style.paddingBottom = '40000px'`)
      const bytes = await original.call(this, options)
      captured.push(readPngSize(bytes))
      return bytes
    }
    let batch
    try {
      batch = await draw([
        raw(
          '자라는 장',
          '<!doctype html><html lang="ko"><body style="margin:0"><div style="height:100px">자란다</div></body></html>',
          'body { color: #111 }',
        ),
      ])
    } finally {
      proto.screenshot = original
    }
    // 잰 크기(뷰포트 720×552)의 두 배다 — 자란 40000px 를 찍지 않았다.
    expect(captured).toEqual([{ width: 1440, height: 1104 }])
    expect(batch.results).toEqual([{ ok: false, reason: `${SCREEN_GREW} — 720×552px 에서 720×40100px` }])
  })

  /**
   * **테마 CSS 의 전이는 끝 상태로 찍힌다.** 번들 런타임이 목업을 다시 그리거나(마커 · 글꼴 뒤 다시 재기) 시트가 늦게 실리면 테마의
   * `transition` 이 옛 값에서 새 값으로 옮겨 가는 전이를 시작한다 — 그 중간에 찍히면 전이를 걷은 CSS 와 그림이 다르다. 끄기 없이 찍은
   * 뒤에 다시 재면 이 전이가 «그리는 동안 커짐»으로 멀쩡한 장을 거절한다.
   */
  it('테마 CSS 의 전이는 끝 상태로 찍힌다 — 전이를 걷은 CSS 와 같은 그림이고 멀쩡한 장이 거절되지 않는다', async () => {
    const skin = '[data-wb-component="Button"] { padding: 24px 48px; background: #2563eb; color: #fff }'
    const moving = `${skin}\n[data-wb-component="Button"] { transition: padding 150ms, background-color 150ms }`
    const batch = await draw([requestFor(1, 40, moving), requestFor(1, 40, skin)])
    const [movingShot, calmShot] = batch.results
    expect(movingShot!.ok && calmShot!.ok ? Buffer.compare(movingShot!.bytes, calmShot!.bytes) : batch.results).toBe(0)
  })
})

describe('바이너리가 없으면', () => {
  /**
   * **배포에서 가장 있을 법한 사고다** — 이미지가 없는 컨테이너에 이 서버를 올린 상태.
   * 그때 내보내기가 통째로 500이 되면 pptx를 아예 못 받는다.
   */
  it('던지지 않고 전부 실패로 낸다 — pptx 는 여전히 나온다', async () => {
    const batch = await draw([requestFor(1, 4), requestFor(2, 4)], { executablePath: '/tmp/wirebound-no-such-chromium' })

    expect(batch.results.map((result) => result.ok)).toEqual([false, false])
    for (const result of batch.results) {
      if (result.ok) continue
      expect(result.reason).toContain('브라우저를 띄우지 못했습니다')
    }
    expect(batch.fontWarning).toBeNull()
  })
})

/* ------------------------------------------ 소스를 지워도 아무도 안 죽던 자리들 — 그 자 */

/**
 * 이 워커 밑에서 도는 브라우저 프로세스 수 — **이 프로세스의 자손**을 센다. **자를 여기 둔다 — 소스에 두지 않는다.**
 *
 * 실행 파일 이름으로 세지 않는다 — `SCREEN_CHROMIUM_PATH` 의 배포판 chromium 은 셸 스크립트가 다른 경로의 실행 파일을 띄워
 * 이름이 안 맞는다. **리눅스는 `/proc` 을 읽는다** — `node:22-slim` 컨테이너에는 `ps` 가 없어 `ps` 로 세면 늘 0 이고, 그때 아래
 * 수명 케이스는 `browser.close()` 를 떼도 초록이다(그 컨테이너에서 쟀다). 좀비는 세지 않는다 — 거둘 차례만 남은 것이다.
 */
function browserProcesses(): number {
  const parents = new Map<number, number>()
  if (existsSync('/proc/self/stat')) {
    for (const entry of readdirSync('/proc')) {
      if (!/^\d+$/.test(entry)) continue
      let stat: string
      try {
        stat = readFileSync(`/proc/${entry}/stat`, 'utf8')
      } catch {
        continue // 읽는 사이 끝났다
      }
      // `pid (이름) 상태 ppid …` — 이름에 공백 · 괄호가 들 수 있어 마지막 `)` 뒤에서 자른다.
      const [state, ppid] = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
      if (state !== 'Z') parents.set(Number(entry), Number(ppid))
    }
  } else {
    for (const line of execFileSync('ps', ['-A', '-o', 'pid=,ppid=,stat=,comm='], { encoding: 'utf8' }).split('\n')) {
      const [pid, ppid, state, ...command] = line.trim().split(/\s+/)
      // 세는 `ps` 자신도 이 프로세스의 자식이다 — 뺀다.
      if (pid === undefined || ppid === undefined || state?.startsWith('Z') || command.join(' ').split('/').pop() === 'ps') continue
      parents.set(Number(pid), Number(ppid))
    }
  }
  const mine = new Set([process.pid])
  let grew = true
  while (grew) {
    grew = false
    for (const [pid, ppid] of parents) {
      if (!mine.has(pid) && mine.has(ppid)) {
        mine.add(pid)
        grew = true
      }
    }
  }
  return mine.size - 1
}

/** `render`가 도는 동안의 **최고** 프로세스 수와 끝난 뒤의 수. */
async function processWatch(requests: readonly Entry[], concurrency: number): Promise<{ peak: number; after: number }> {
  let peak = 0
  // **100ms 다.** 세는 값(`ps` · `/proc` 을 훑는 것)이 작지 않아 25ms 로 재면 이 케이스 하나가 20초를 먹는다
  // (macOS `ps` 로 쟀다). 재려는 것은 최고치의 **자릿수**이지 순간값이 아니다.
  const timer = setInterval(() => {
    const now = browserProcesses()
    if (now > peak) peak = now
  }, 100)
  try {
    await renderer({ concurrency }).render(jobOf(...requests))
  } finally {
    clearInterval(timer)
  }
  // 닫히는 데 잠깐 걸린다. **여기서 안 기다리면 원본도 빨갛다.**
  await new Promise((resolve) => setTimeout(resolve, 500))
  return { peak, after: browserProcesses() }
}

describe.skipIf(!있다)('브라우저·페이지 수명', () => {
  /**
   * **`render`가 브라우저를 안 닫으면 좀비가 쌓인다.**
   *
   * `finally { await browser.close() }`를 지우면 `render()`가 돌아온 뒤에도 **프로세스가
   * 남고 노드가 안 끝난다.** 그런데 이 케이스 없이는 게이트가 아무 말도 안 한다 —
   * **프로세스가 vitest 워커와 함께 죽기 때문이다.**
   * 오래 도는 서버에서만 나는 증상이라 여기서 세는 수밖에 없다.
   */
  it('끝나면 프로세스가 시작값으로 돌아온다', async () => {
    const before = browserProcesses()
    const { peak, after } = await processWatch([requestFor(1, 4), requestFor(2, 4)], 2)
    // **세는 자가 눈을 떴는가** — 그리는 동안 하나도 안 보이면 아래 단언은 0 과 0 을 견주는 빈 자다.
    expect(peak).toBeGreaterThan(before)
    expect(after).toBe(before)
  })

  /**
   * **최고 프로세스 수는 동시성이 정한다 — 장 수가 아니다.**
   *
   * `renderOne`이 컨텍스트를 안 닫으면 열린 컨텍스트가 장마다 쌓여 **최고치가 장 수를
   * 따라간다**(다시 재는 법: `renderOne`의 `finally`에서 컨텍스트를 닫는 줄을 지우고 이 케이스의 두 `peak`를 본다).
   * 그래서 *"끝난 뒤 0"*으로는 이 갈래를 못 본다. 같은 동시성에서 **장 수만 네 배**로
   * 늘려 최고치를 맞대는 것이 그 자다.
   */
  it('장 수를 네 배로 늘려도 최고치가 거의 그대로다', async () => {
    const 적게 = await processWatch([requestFor(1, 4), requestFor(2, 4)], 2)
    const 많이 = await processWatch(
      Array.from({ length: 8 }, (_unused, index) => requestFor(index, 4)),
      2,
    )

    expect(많이.after).toBe(적게.after)
    // 여유를 둔다 — 재는 것은 *"장 수를 따라가지 않는다"*이지 정확한 수가 아니다.
    expect(많이.peak).toBeLessThanOrEqual(적게.peak + 2)
  })
})

/**
 * **서버가 닫는 동안 브라우저가 먼저 닫히지 않는다**(`LEAVE_SIGNALS_TO_SERVER`).
 *
 * 신호를 보내려면 프로세스가 따로 있어야 한다 — vitest 워커에 보내면 워커가 죽는다. 그래서 `render-through-signal.ts`를
 * 자식으로 띄우고 그 안에서 브라우저가 뜬 뒤 자기에게 보낸다. 셋 다 따로 잰다 — 그 옵션의 한 칸을 떼면 그 신호의 케이스만 죽는다
 * (SIGTERM · SIGHUP 은 실패 40 · SIGINT 는 playwright 가 `process.exit(130)` 해 한 줄도 못 낸다).
 */
describe.skipIf(!있다)('그리는 중에 신호를 받아도', () => {
  it.each(['SIGTERM', 'SIGINT', 'SIGHUP'])(
    '%s — 도는 그리기가 끝까지 그린다',
    (signal) => {
      const child = spawnSync(
        fileURLToPath(new URL('../node_modules/.bin/tsx', import.meta.url)),
        [fileURLToPath(new URL('./render-through-signal.ts', import.meta.url)), signal, EXECUTABLE_PATH ?? '-'],
        { encoding: 'utf8', timeout: 60_000 },
      )
      expect({ status: child.status, signal: child.signal, stderr: child.stderr }).toEqual({ status: 0, signal: null, stderr: '' })
      expect(JSON.parse(child.stdout)).toEqual({ failures: 0, total: 40 })
    },
    90_000,
  )
})

describe.skipIf(!있다)('두부 판정자', () => {
  /** 판정자가 브라우저에서 걷어 오는 날 값. */
  async function samples(): Promise<KoreanGlyphSamples> {
    const browser = await chromium.launch(LAUNCH)
    try {
      const page = await browser.newPage()
      await page.setContent('<!doctype html><html lang="ko"><body></body></html>')
      return await page.evaluate<KoreanGlyphSamples>(KOREAN_GLYPH_PROBE)
    } finally {
      await browser.close()
    }
  }

  /**
   * **날 값이 판정을 지탱하는가.**
   *
   * 판정자를 `return true`로 갈아도 `pnpm test`는 초록이다 — 브라우저가 거기 없다. 그래서
   * 그 자리가 **날 값을 걷는 자**와 **순수한 판정자**로 갈려 있고, 판정자는
   * `test/screen-render.test.ts`가 잰다. 여기가 재는 것은 **걷어 온 값 자체**다.
   */
  it('기준선이 서고 한글이 그것과 다르다', async () => {
    const 값 = await samples()

    // 후보가 여럿이어야 *"기준선이 두부다"*를 확인할 수 있다 — 사용자 영역 코드포인트라도
    // 기계에 따라 글리프가 있다(macOS 의 `U+F8FF`). 하나만 재면 그 기계에서 조용히 틀린다.
    expect(값.baselines.length).toBeGreaterThanOrEqual(2)
    expect(new Set(값.baselines).size).toBe(1)
    // 두부가 실제로 무언가를 그렸다 — 안 그렸으면 한글도 같아져 **거짓 경고**가 된다.
    expect(값.baselines[0]).not.toBe(값.blank)
    // 이 기계에는 한글 글꼴이 있다.
    expect(값.hangul).not.toBe(값.baselines[0])
    expect(decideKoreanGlyphs(값)).toBe('yes')
  })

  /**
   * **걷어 온 값이 **전부** 진짜 측정인가.**
   *
   * 앞 케이스만 있으면 걷는 글자가 **상수를 되돌려도** 통과한다 — `hangul`·`blank`를
   * 상수로 바꿔도 앞 케이스는 안 죽는다. 한글 해시가 상수면 **글꼴이 없는 기계에서도
   * 「있다」로 답하고**, 그것이 이 판정자가 막으려는 바로 그 사고다.
   *
   * 그래서 **같은 페이지 안에서** 같은 캔버스 설정을 이 케이스가 따로 재서 **세 값을 전부**
   * 맞댄다. 자를 소스가 아니라 여기 둔다.
   */
  it('걷어 온 세 값을 따로 재도 같다 — 상수를 되돌리면 여기서 죽는다', async () => {
    const browser = await chromium.launch(LAUNCH)
    try {
      const page = await browser.newPage()
      await page.setContent('<!doctype html><html lang="ko"><body></body></html>')

      const 걷은것 = await page.evaluate<KoreanGlyphSamples>(KOREAN_GLYPH_PROBE)
      const 따로 = await page.evaluate<KoreanGlyphSamples>(`(() => {
        function ink(text) {
          const canvas = document.createElement('canvas')
          canvas.width = 160
          canvas.height = 60
          const g = canvas.getContext('2d')
          g.fillStyle = '#fff'
          g.fillRect(0, 0, canvas.width, canvas.height)
          g.fillStyle = '#000'
          g.font = '32px sans-serif'
          g.textBaseline = 'top'
          g.fillText(text, 2, 2)
          const data = g.getImageData(0, 0, canvas.width, canvas.height).data
          let hash = 0
          for (let i = 0; i < data.length; i += 4) hash = (hash * 31 + data[i]) | 0
          return hash
        }
        return {
          baselines: ['\\uE000\\uE001', '\\uE010\\uE011', '\\uE100\\uE101', '\\uE500\\uE501'].map(ink),
          hangul: ink('\\uD55C\\uAE00'),
          blank: ink(''),
        }
      })()`)

      expect(걷은것).toEqual(따로)
    } finally {
      await browser.close()
    }
  })

  /**
   * **거짓 양성 방향** — 멀쩡한 기계에서 조용한 경고가 뜨면 그것이 더 나쁘다.
   *
   * 그 사고는 *"이따금"*의 모양이므로 한 번으로는 못 본다. 게이트에는 다섯 번을 둔다 —
   * 더 세게 재려면 아래 횟수를 올려 돌린다.
   */
  it('다섯 번을 물어도 늘 「있다」다 — 조용한 거짓 경고가 없다', async () => {
    for (let 회 = 0; 회 < 5; 회 += 1) {
      const batch = await draw([requestFor(회, 3)])
      expect(batch.fontWarning).toBeNull()
      expect(batch.results[0]!.ok).toBe(true)
    }
  })
})

describe.skipIf(!있다)('시트가 그림에 반영되나', () => {
  /**
   * **이 케이스가 없으면 번들의 테마 시트가 안 실려도 아무도 안 죽는다.** 곧
   * *"슬라이드의 화면이 곧 그 테마다"*를 지키는 자가 없다.
   *
   * **바이트로는 못 잰다** — 같은 입력을 여러 번 그려도 바이트 수가 갈린다. **화소는
   * 결정적이다**(위 「계약이 요구하는 것을 낸다」의 1440 폭). 그래서 **자리를 바꾸는
   * 시트**를 얹어 높이가 따라 변하는지로 잰다.
   */
  it('시트가 자리를 바꾸면 그림의 높이가 따라 바뀐다', async () => {
    const 그대로 = requestFor(1, 4, '')
    const 여백 = requestFor(1, 4, '[data-wb-component="Page"] { padding-top: 800px }')

    const batch = await draw([그대로, 여백], { concurrency: 1 })
    const [a, b] = batch.results
    expect(a!.ok).toBe(true)
    expect(b!.ok).toBe(true)
    if (!a!.ok || !b!.ok) return

    expect(a!.width).toBe(b!.width)
    // 800px 을 더했고 배율이 2배다 — 시트가 반영됐으면 `b`는 그것만으로 1600 화소를 넘는다. **차이로 재지 않는다** — `a`는 짧은
    // 문서라 뷰포트 높이(552 → 1104)에 눌려 있어, 차이는 내용 높이에 따라 800 × 2 보다 작다. 시트가 무시되면 `b`도 1104 다.
    expect(a!.height).toBeLessThan(1600)
    expect(b!.height).toBeGreaterThan(1600)
  })
})

describe('스모크 픽스처가 진짜 화면인가', () => {
  /**
   * **카탈로그에 없는 것을 쓴 픽스처는 오류 상자를 그린다**(위 `doc` 머리말). 그 상태에서도
   * 계약 측정은 전부 초록이다 — **내용과 무관한 것만 재기 때문이다.**
   *
   * **브라우저가 없어도 도는 케이스다** — 그리기 전 단계를 잰다.
   */
  it('픽스처가 폴백 없이 그려진다 — 그린 것이 진짜 화면이다', () => {
    const bundle = exportBundle({ pages: [{ title: '관리자 회원 목록1', document: doc(1, 4) }], runtimeJs: readExportRuntime() })
    expect(bundle.errors).toEqual([])
    expect(String(bundle.files.find((file) => file.path === bundle.pagePaths[0])!.content)).toContain('회원 목록 1')
  })
})

describe.skipIf(!있다)('바깥으로 나가는 요청 — 일곱 길 전부', () => {
  /**
   * **`page.route`는 그 페이지 하나에만 걸린다** — 차단을 페이지에 걸면 일곱 길 가운데
   * **`window.open`만 규칙 밖으로 나간다.** 그래서 차단은 컨텍스트에 건다.
   *
   * 번들에는 테마 스크립트 · 테마 CSS 가 실리므로 이 길들이 **실제로 열려 있다** — 두 판을 잰다: 바깥을 가리키는 HTML 한 장, 그리고
   * `theme.css` · `theme.js` 가 바깥을 가리키는 번들 페이지. 테마 판은 그려져야 한다(테마가 등록한다) — 그래야 스크립트가 돌았다.
   *
   * **서버에 안 닿은 것만으로는 이 차단을 못 잰다.** 페이지가 https 가짜 origin 에 서므로 브라우저가 루프백 http 요청을 스스로도
   * 막는다 — 차단을 `route.continue()` 로 바꾼 판에서 서버에 닿은 것은 팝업 둘뿐이었고, 브라우저 겹(`NO_EGRESS_ARGS`)이 선 뒤로는 그 판에서도
   * 0 이다. 그래서 **길마다 차단이 끊었는지**(`abort` 에 온 주소)를 함께 센다 — 막는 것이 브라우저의 다른 규칙이 아니라 이 차단임을 그것이
   * 가른다. 가로채기가 못 보는 채널(WebSocket · WebRTC · 공유 워커)은 `screen-sandbox-review.test.ts` 의 격자가 잰다.
   */
  it('일곱 길 어느 것도 서버에 닿지 않는다 — HTML 한 장도, 테마 CSS · 스크립트가 가리켜도', async () => {
    const hits: string[] = []
    const server: Server = createServer((request, response) => {
      hits.push(request.url ?? '')
      response.writeHead(200, { 'content-type': 'text/plain' })
      response.end('x')
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    const base = typeof address === 'object' && address !== null ? `http://127.0.0.1:${address.port}` : ''

    try {
      const html = [
        '<!doctype html><html lang="ko"><head>',
        `<link rel="stylesheet" href="${base}/link.css">`,
        `<style>@font-face { font-family: probe; src: url(${base}/font.woff2) }`,
        `body { font-family: probe; background-image: url(${base}/bg.png) }</style>`,
        `<script src="${base}/script.js"></script>`,
        '</head><body><h1>회원 목록</h1>',
        `<img src="${base}/img.png" alt="">`,
        `<iframe src="${base}/frame.html"></iframe>`,
        `<script>fetch('${base}/fetch.json').catch(() => {});`,
        `window.open('${base}/popup.html');</script>`,
        '</body></html>',
      ].join('')
      const themeCss = [
        `@import url(${base}/theme-import.css);`,
        `@font-face { font-family: probe; src: url(${base}/theme-font.woff2) }`,
        `[data-wb-component="Page"] { font-family: probe; background-image: url(${base}/theme-bg.png) }`,
      ].join('\n')
      const before = [
        `const add = (tag, attrs) => { const el = document.createElement(tag); Object.assign(el, attrs); document.head.appendChild(el) }`,
        `add('link', { rel: 'stylesheet', href: '${base}/theme-link.css' })`,
        `add('script', { src: '${base}/theme-script.js' })`,
        `add('img', { src: '${base}/theme-img.png' })`,
        `add('iframe', { src: '${base}/theme-frame.html' })`,
        `fetch('${base}/theme-fetch.json').catch(() => {})`,
        `window.open('${base}/theme-popup.html')`,
      ].join('; ')

      const proto = (await routeClass()) as unknown as { abort: Route['abort'] }
      const originalAbort = proto.abort
      const aborted: string[] = []
      proto.abort = function (this: Route, code) {
        aborted.push(this.request().url())
        return originalAbort.call(this, code)
      }
      let batch
      try {
        batch = await draw(
          [
            raw('바깥 자원 일곱 길', html, 'body { color: #111 }'),
            bundled('테마가 가리키는 바깥', doc(1, 2), inlineTheme({ themeCss, before })),
          ],
          { timeoutMs: 5000 },
        )
      } finally {
        proto.abort = originalAbort
      }
      expect(batch.results.map((result) => (result.ok ? 'ok' : result.reason))).toEqual(['ok', 'ok'])
      // 팝업이 뜨고 나가는 데 시간이 걸릴 수 있다. 그려진 뒤에도 잠깐 더 본다.
      await new Promise((resolve) => setTimeout(resolve, 500))
      expect(hits).toEqual([])
      const roads = ['link.css', 'font.woff2', 'bg.png', 'script.js', 'img.png', 'frame.html', 'fetch.json', 'popup.html']
      const expected = [...roads, ...roads.map((road) => `theme-${road}`), 'theme-import.css']
      expect([...new Set(aborted.map((url) => url.slice(base.length + 1)))].sort()).toEqual(expected.sort())
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})

/** 저장소 빌드가 지은 시스템 테마 패키지(`system-themes/admin/dist`) — api 가 기동 때 시딩하는 그 바이트다. */
function systemAdminBytes(): Uint8Array {
  const dir = fileURLToPath(new URL('../../../system-themes/admin/dist/', import.meta.url))
  const name = readdirSync(dir).find((file) => file.endsWith('.wbtheme'))
  if (name === undefined) throw new Error(`시스템 테마 패키지가 없다(${dir}) — 저장소 뿌리에서 \`pnpm build\``)
  return new Uint8Array(readFileSync(`${dir}${name}`))
}

/**
 * **렌더러가 쓰는 그 `Route` 클래스** — 같은 `playwright-core` 모듈이다(`Route` 는 값으로 안 내보낸다). 가짜 origin 의 응답을 늦추는 데
 * 쓴다: 번들 파일은 메모리에서 곧바로 나가므로 «늦게 오는 글꼴»은 응답을 붙잡아야 선다.
 */
async function routeClass(): Promise<{ fulfill: Route['fulfill'] }> {
  const probe = await chromium.launch(LAUNCH)
  try {
    const context = await probe.newContext()
    let proto: { fulfill: Route['fulfill'] } | undefined
    await context.route('**/*', (route) => {
      proto ??= Object.getPrototypeOf(route) as { fulfill: Route['fulfill'] }
      void route.fulfill({ status: 200, contentType: 'text/html', body: '' })
    })
    await (await context.newPage()).goto('https://route.invalid/')
    if (proto === undefined) throw new Error('Route 를 못 붙잡았다')
    return proto
  } finally {
    await probe.close()
  }
}

/** 경로가 `suffix` 로 끝나는 응답을 `ms` 늦춘다. 되돌리는 함수를 낸다. 늦춘 뒤 컨텍스트가 닫혔으면 조용히 버린다. */
async function delayResponses(suffix: string, ms: number): Promise<() => void> {
  const proto = await routeClass()
  const original = proto.fulfill
  proto.fulfill = function (this: Route, options) {
    if (!this.request().url().endsWith(suffix)) return original.call(this, options)
    return new Promise<void>((resolve) => setTimeout(resolve, ms)).then(() => original.call(this, options).catch(() => {}))
  }
  return () => {
    proto.fulfill = original
  }
}

/**
 * **번들 페이지를 연다** — 그리는 자가 `pages/<이름>.html#wb-screen` 을 가짜 origin 에서 열고 번들 런타임의 준비 신호를 기다린다
 * (`src/services/screen-render-chromium.ts` 머리말).
 */
describe.skipIf(!있다)('번들 페이지를 연다', () => {
  /** 셸의 바탕(`.wb-export` — `packages/exporter/src/bundle/shell-css.ts`). 화면 모드에서는 셸을 걷으므로 한 화소도 없어야 한다. */
  const SHELL_BACKGROUND: [number, number, number] = [0xee, 0xf0, 0xf4]

  it('시스템 테마로 그린 장은 목업만이다 — 폭이 뷰포트 그대로이고 셸의 바탕이 한 화소도 없다', async () => {
    const batch = await draw([bundled('관리자 회원 목록', doc(1, 4), packageTheme(systemAdminBytes()))])
    const [shot] = batch.results
    expect(shot!.ok ? [shot!.width, countColor(shot!.bytes, SHELL_BACKGROUND)] : shot).toEqual([1440, 0])
  })

  /** 샘플 테마(kit 픽스처 — `packages/theme-kit/test/fixtures/sample-theme`)의 `Card` 뷰는 테두리를 주색 토큰(`#e11d48`)으로 그린다. */
  it('kit 으로 지은 테마의 뷰가 화면에 선다 — 주색 테두리가 테마 판에만 있다', async () => {
    const card = {
      version: 5,
      root: { id: 'n_page', type: 'Page', children: [{ id: 'n_card', type: 'Card', props: { title: '카드' }, children: [] }] },
    } as unknown as PageDocument
    const theme = packageTheme(await builtSample())
    const batch = await draw([bundled('샘플 테마', card, theme), bundled('테마 없음', card)])
    const counts = batch.results.map((result) => (result.ok ? countColor(result.bytes, [0xe1, 0x1d, 0x48]) : result.reason))
    expect(counts[0]).toBeGreaterThan(0)
    expect(counts[1]).toBe(0)
  })

  it('번들이 등록하지 않은 테마 · 던지는 뷰는 그 장만 실패하고 까닭을 말한다', async () => {
    const batch = await draw([
      requestFor(1, 2),
      bundled('등록 안 함', doc(2, 2), inlineTheme({ id: 'silent', register: false })),
      bundled(
        '던지는 뷰',
        doc(3, 2),
        inlineTheme({ id: 'thrower', views: `{ Button: rt.sdk.view(() => { throw new Error('뷰가 던진다') }) }` }),
      ),
      requestFor(4, 2),
    ])
    expect(batch.results.map((result) => (result.ok ? 'ok' : result.reason))).toEqual([
      'ok',
      '테마 번들이 등록하지 않았습니다(silent@1.0.0)',
      '테마 뷰가 던졌습니다: n_btn_3',
      'ok',
    ])
  })

  /**
   * 테마 자산의 글꼴(`late.woff2`)을 늦게 내준다. 원본이 실패하면 `local()` 로 떨어지되 `ascent-override` 가 줄을 높인다 — 글꼴을
   * 기다렸으면 늦춘 판과 안 늦춘 판의 높이가 같고, 안 기다렸으면 늦춘 판이 대체 글꼴 높이로 짧다.
   */
  const lateFont = (): Entry => {
    const local = ['Arial', 'DejaVu Sans', 'Noto Sans CJK KR', 'NotoSansCJKkr-Regular'].map((name) => `local("${name}")`).join(', ')
    return bundled(
      '늦은 글꼴',
      doc(1, 20),
      inlineTheme({
        themeCss: `@font-face { font-family: Late; src: url(../assets/late.woff2), ${local}; ascent-override: 1500% }\n[data-wb-component="Page"] { font-family: Late }`,
        assets: [['assets/late.woff2', new Uint8Array([1, 2, 3, 4])]],
      }),
    )
  }

  it('테마의 늦은 글꼴을 기다린 뒤 잰다 — 늦춘 판과 안 늦춘 판의 높이가 같다', async () => {
    const calm = await draw([lateFont()])
    const restore = await delayResponses('/late.woff2', 1500)
    let late
    try {
      late = await draw([lateFont()], { timeoutMs: 10_000 })
    } finally {
      restore()
    }
    const [calmShot] = calm.results
    const [lateShot] = late.results
    expect(calmShot!.ok && lateShot!.ok ? [lateShot!.height, lateShot!.height > 1104] : late.results).toEqual([
      calmShot!.ok ? calmShot!.height : -1,
      true,
    ])
  })

  it('테마의 글꼴이 한 장의 한도를 넘기면 그 장이 실패하고 한도를 말한다', async () => {
    const restore = await delayResponses('/late.woff2', 8000)
    let batch
    try {
      batch = await draw([lateFont()], { timeoutMs: 3000 })
    } finally {
      restore()
    }
    expect(batch.results).toEqual([{ ok: false, reason: `${SCREEN_NOT_READY} — 3000ms` }])
  })

  /**
   * **움직임 끄기는 첫 스크립트보다 먼저 선다**(초기화 스크립트) — 머리의 스크립트가 `<html>` 의 계산된 `transition-duration` 을 읽어
   * 끄기가 없으면 몸을 3000px 키운다. 끄기가 늦게 서면(찍기 직전에 얹으면) 그 스크립트가 이미 켜진 전이를 본다.
   */
  it('움직임 끄기가 페이지의 첫 스크립트보다 먼저 선다', async () => {
    const page = [
      '<!doctype html><html lang="ko"><head>',
      '<style>html { transition: color 5s }</style>',
      `<script>window.__moving = getComputedStyle(document.documentElement).transitionDuration !== '0s'</script>`,
      '</head><body style="margin:0"><div id="box" style="height:100px">움직임</div>',
      `<script>if (window.__moving) document.getElementById('box').style.height = '3000px'</script>`,
      '</body></html>',
    ].join('')
    const batch = await draw([raw('움직임 끄기', page)])
    const [shot] = batch.results
    expect(shot!.ok ? shot!.height : shot).toBe(1104)
  })

  it('가짜 origin 에서 연다 — 번들 밖 경로는 404 이고 페이지 경로의 한글 이름을 그대로 찾는다', async () => {
    const entry = bundled('회원 목록 — 한글 이름', doc(1, 2))
    expect(entry.path).toMatch(/[가-힣]/)
    const batch = await draw([entry])
    expect(batch.results.map((result) => (result.ok ? 'ok' : result.reason))).toEqual(['ok'])
    expect(SCREEN_ORIGIN).toMatch(/^https:\/\/[^/]+\.invalid$/)
  })
})
