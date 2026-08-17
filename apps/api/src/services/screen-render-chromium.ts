/**
 * **진짜로 그리는 자 — 헤드리스 Chromium**(P10-2 T3·T4 · D1·D4·D5·D7·D8).
 *
 * `screen-render.ts`가 모양을 들고 여기가 그것을 채운다. **이 파일을 부르는 자리는
 * `main.ts` 하나다** — `pnpm test`가 브라우저를 안 띄우는 것이 D3이고, 이 모듈을
 * import하는 것만으로 `playwright-core`가 딸려 오므로 `buildApp` 쪽에 두면 케이스 전부가
 * 그것을 싣는다.
 *
 * ---
 *
 * # `playwright-core`를 고른 이유 (재라 #1 — 값은 보고서 §2)
 *
 * | 재고 본 것 | 값 |
 * |---|---|
 * | `playwright-core` | 의존 **0개** · 설치 스크립트 **0개** · Apache-2.0 · 브라우저를 **안 내려받는다**(실행할 때 기계에 있는 것을 쓴다) |
 * | `playwright` | `playwright-core` + **설치할 때 브라우저를 내려받는 postinstall**. 저장소의 `pnpm install`이 수백 MB를 타게 된다 |
 * | `puppeteer-core` | 전이 의존 **스물넷**. `fflate`를 고를 때 갈랐던 것과 같은 축이다(`export-zip.ts`) |
 *
 * **의존이 0인 것이 갈랐다** — `export-zip.ts`가 `fflate`를 고른 것과 같은 판정이다.
 *
 * **브라우저 바이너리는 이 저장소가 안 들고 있다.** 기계에 있어야 하고, 없으면 이
 * 렌더러는 **던지지 않고 전부 실패로 낸다**(D5). 배포 형태(`Dockerfile`)가 아직 없다는
 * 것이 그래서 값이 된다 — 이월이 그 줄을 든다.
 *
 * # 무엇을 그리나 (D2)
 *
 * `exportPage`가 낸 HTML을 **파일로 쓰지 않고** 그대로 띄우고(`setContent`) 같은 함수가
 * 낸 CSS를 얹는다(`addStyleTag`). 새 HTML을 만들면 화면·번들·PPTX가 세 벌이 되고
 * §11.3의 *"렌더러가 하나뿐이라 결과가 어긋날 수 없다"*가 거짓이 된다.
 *
 * # 바깥으로 나가는 요청을 막는다
 *
 * 테마의 `@font-face`·`url()`은 **사용자가 적은 문자열**이다(`themes/spec/assets.ts`).
 * 서버가 그것을 가져오면 프로젝트 멤버가 적은 주소로 **서버가 요청을 보내는 자리**가 된다.
 * 그래서 라우팅되는 요청을 전부 끊는다 — `data:`는 네트워크를 안 타므로 그대로 산다.
 *
 * **대가:** 원격 웹폰트를 든 테마는 대체 글꼴로 그려진다. 오늘 시스템 테마는 글꼴 자산이
 * 없어 갈림이 없고, 사용자가 만든 테마에서만 생긴다. **이월이 그 갈림을 든다.**
 *
 * # 어디에 상태를 두나 (D7)
 *
 * `apps/api`는 오늘 프로세스 수명의 상태를 안 갖는다. **그래서 브라우저는 `render` 한 번의
 * 수명이다** — 부를 때 띄우고 `finally`에서 닫는다. 띄우는 값은 N장의 비용에 견주면 작다
 * (보고서 §2의 표). 오래 사는 브라우저를 두면 그 프로세스를 누가 닫는지·요청 둘이 그것을
 * 어떻게 나눠 쓰는지가 새 물음이 되고, 그것은 이 슬라이스가 열 자리가 아니다.
 */
import { chromium, type Browser, type Page } from 'playwright-core'
import {
  NO_KOREAN_FONT,
  readPngSize,
  type ScreenBatch,
  type ScreenRenderer,
  type ScreenRequest,
  type ScreenResult,
} from './screen-render'

/**
 * 뷰포트. **P10-1 이월 §2.1이 권한 화소가 여기서 나온다** — `SCREEN_BOX`가
 * `7.5in × 5.75in`이고 96dpi로 나누면 이 값이다.
 */
const VIEWPORT = { width: 720, height: 552 }

/**
 * 화소 배율. 권하는 화소의 **2배**다.
 *
 * 슬라이드는 사람이 화면과 빔프로젝터로 본다 — 1배는 자리에 꼭 맞지만 확대하면 뭉개진다.
 * 3배는 파일이 커지는 만큼 얻는 것이 없다(보고서 §2의 표).
 */
const DEVICE_SCALE_FACTOR = 2

/**
 * **화면 전체를 찍는다.** 뷰포트만 찍으면 긴 페이지의 아래가 잘리고, 잘린 목업은
 * *"눈으로는 그럴듯한 한 장"*이다.
 *
 * **그래서 높이를 미리 알 수 없다** — 그것이 `readPngSize`가 있는 이유다(D8).
 */
const FULL_PAGE = true

/** 기본값들. `chromiumScreenRenderer`의 인자로 덮을 수 있다. */
export const SCREEN_DEFAULTS = {
  /** 동시에 여는 페이지 수. 늘려도 얻는 것이 빠르게 줄고 최고 메모리는 그대로 는다. */
  concurrency: 4,
  /** 한 장을 기다리는 시간. 넘으면 **그 장만** 실패한다(D5). */
  timeoutMs: 10_000,
  /**
   * 그릴 페이지 수의 상한(D7).
   *
   * **넘은 장은 조용히 빠지지 않는다** — 실패 이유가 상한과 **분모를 함께** 말한다.
   * pptx 하나가 통째로 메모리에 올라가므로(P10-1 이월 §2.1) 장 수가 그대로 최고 사용량이다.
   */
  maxPages: 200,
} as const

export interface ChromiumScreenRendererOptions {
  concurrency?: number
  timeoutMs?: number
  maxPages?: number
  /**
   * 브라우저 실행 파일. **주지 않으면 `playwright-core`가 기계에서 찾는다.**
   * 스모크가 자기 기계의 것을 가리킬 때 쓴다.
   */
  executablePath?: string
}

/**
 * 한글이 두부가 되는지 브라우저 안에서 묻는다(D4).
 *
 * **`document.fonts.check`를 쓰지 않는다** — 없는 글꼴 이름에도 참을 낸다(보고서 §2의 재라
 * #4). 물어야 할 것은 *"이 이름의 글꼴이 있는가"*가 아니라 ***"한글에 글리프가 있는가"***다.
 *
 * 그래서 **사용자 영역(U+E000~) 두 글자**를 같은 자리에 그려 두부의 모양을 얻고, 한글
 * 두 글자를 같은 방법으로 그려 **픽셀이 같은지** 본다. 어느 글꼴에도 없는 코드포인트라
 * 그것은 반드시 두부이고, 한글이 그것과 같은 그림이면 한글도 두부다.
 *
 * **함수가 아니라 글자로 넘긴다.** 이 저장소의 TS는 esbuild를 지나고 그것이 함수에 이름
 * 표시(`__name`)를 심는데, 그 함수가 브라우저 안에서 실행되면 그 이름이 없어 죽는다
 * (실측 — 보고서 §2).
 */
const KOREAN_GLYPH_PROBE = `(() => {
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
  return ink('\\uD55C\\uAE00') !== ink('\\uE000\\uE001')
})()`

/**
 * 진짜 브라우저로 그리는 `ScreenRenderer`를 만든다.
 *
 * **던지지 않는다.** 브라우저가 안 뜨는 것도(바이너리가 없다·권한이 없다) 결과 전부의
 * 실패로 나온다 — 내보내기 하나가 통째로 500이 되는 것보다 *"그림 없이 나갔고 이유는
 * 이것이다"*가 낫다.
 */
export function chromiumScreenRenderer(options?: ChromiumScreenRendererOptions): ScreenRenderer {
  const concurrency = options?.concurrency ?? SCREEN_DEFAULTS.concurrency
  const timeoutMs = options?.timeoutMs ?? SCREEN_DEFAULTS.timeoutMs
  const maxPages = options?.maxPages ?? SCREEN_DEFAULTS.maxPages

  return {
    async render(requests: readonly ScreenRequest[]): Promise<ScreenBatch> {
      if (requests.length === 0) return { results: [], fontWarning: null }

      let browser: Browser
      try {
        browser = await chromium.launch(
          options?.executablePath === undefined ? {} : { executablePath: options.executablePath },
        )
      } catch (error) {
        return {
          results: requests.map(() => failure(`브라우저를 띄우지 못했습니다: ${messageOf(error)}`)),
          fontWarning: null,
        }
      }

      try {
        const hasKorean = await probeKoreanGlyphs(browser, timeoutMs)
        if (!hasKorean) {
          // **두부를 그려 내보내지 않는다**(D4). 없는 것이 나쁜 것보다 낫다.
          return {
            results: requests.map(() => failure(NO_KOREAN_FONT)),
            fontWarning: NO_KOREAN_FONT,
          }
        }
        return { results: await renderAll(browser, requests, { concurrency, timeoutMs, maxPages }), fontWarning: null }
      } finally {
        await browser.close()
      }
    },
  }
}

/**
 * 요청들을 동시성 한도 안에서 그린다. **순서를 지킨다** — 결과는 인덱스로 짝지어진다.
 */
async function renderAll(
  browser: Browser,
  requests: readonly ScreenRequest[],
  limits: { concurrency: number; timeoutMs: number; maxPages: number },
): Promise<ScreenResult[]> {
  const results: ScreenResult[] = new Array(requests.length)
  let next = 0

  async function worker(): Promise<void> {
    for (;;) {
      const index = next++
      if (index >= requests.length) return
      if (index >= limits.maxPages) {
        // **분모를 함께 말한다**(D7). *"몇 장 중 몇 번째가 빠졌다"*가 없으면 조용히 빠진 것과 같다.
        results[index] = failure(
          `화면 이미지 상한 ${limits.maxPages}장을 넘었습니다 (${requests.length}장 중 ${index + 1}번째)`,
        )
        continue
      }
      results[index] = await renderOne(browser, requests[index]!, limits.timeoutMs)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limits.concurrency, requests.length) }, () => worker()),
  )
  return results
}

/** 한 장. **여기서 던지는 것은 전부 값이 된다**(D5). */
async function renderOne(
  browser: Browser,
  request: ScreenRequest,
  timeoutMs: number,
): Promise<ScreenResult> {
  let page: Page | undefined
  try {
    page = await newRenderPage(browser, timeoutMs)
    await page.setContent(request.html, { waitUntil: 'load' })
    await page.addStyleTag({ content: request.css })
    const bytes = await page.screenshot({ type: 'png', fullPage: FULL_PAGE })
    const size = readPngSize(bytes)
    // **못 읽은 크기를 계약에 넣지 않는다**(D8) — 넣으면 슬라이드가 조용히 찌그러진다.
    if (size === null) return failure('그린 이미지의 화소를 읽지 못했습니다')
    return { ok: true, bytes, width: size.width, height: size.height }
  } catch (error) {
    return failure(messageOf(error))
  } finally {
    await page?.close().catch(() => {})
  }
}

/** 그리는 페이지 하나. **바깥으로 나가는 요청을 끊는다**(위 머리말). */
async function newRenderPage(browser: Browser, timeoutMs: number): Promise<Page> {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR })
  page.setDefaultTimeout(timeoutMs)
  await page.route('**/*', (route) => {
    void route.abort()
  })
  return page
}

/** 두부 물음(D4). **배치마다 한 번이다** — 글꼴은 기계의 성질이다. */
async function probeKoreanGlyphs(browser: Browser, timeoutMs: number): Promise<boolean> {
  const page = await newRenderPage(browser, timeoutMs)
  try {
    await page.setContent('<!doctype html><html lang="ko"><body></body></html>', { waitUntil: 'load' })
    return (await page.evaluate(KOREAN_GLYPH_PROBE)) === true
  } finally {
    await page.close().catch(() => {})
  }
}

function failure(reason: string): ScreenResult {
  return { ok: false, reason }
}

/** 던져진 것의 첫 줄. 브라우저 오류는 여러 줄이라 그대로 실으면 응답이 길어진다. */
function messageOf(error: unknown): string {
  const text = error instanceof Error ? error.message : String(error)
  return text.split('\n')[0]!.trim()
}
