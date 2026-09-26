/**
 * **진짜로 그리는 자 — 헤드리스 Chromium.**
 *
 * `screen-render.ts`가 모양을 들고 여기가 그것을 채운다. **이 파일을 부르는 자리는
 * `main.ts` 하나다** — `pnpm test`는 브라우저를 안 띄우고(`screen-render.ts`의 「왜 이음매인가」), 이 모듈을
 * import하는 것만으로 `playwright-core`가 딸려 오므로 `buildApp` 쪽에 두면 케이스 전부가
 * 그것을 싣는다.
 *
 * ---
 *
 * # `playwright-core`를 고른 이유
 *
 * | 재고 본 것 | 값 |
 * |---|---|
 * | `playwright-core` | 의존 **0개** · 설치 스크립트 **0개** · Apache-2.0 · 브라우저를 **안 내려받는다**(실행할 때 기계에 있는 것을 쓴다) |
 * | `playwright` | `playwright-core` + **설치할 때 브라우저를 내려받는 postinstall**. 저장소의 `pnpm install`이 수백 MB를 타게 된다 |
 * | `puppeteer-core` | 전이 의존 **스물넷**(설치되는 패키지는 자기를 넣어 스물다섯이다). `fflate`를 고를 때 갈랐던 것과 같은 축이다(`export-zip.ts`) |
 *
 * **의존이 0인 것이 갈랐다** — `export-zip.ts`가 `fflate`를 고른 것과 같은 판정이다.
 *
 * **브라우저 바이너리는 이 저장소가 안 들고 있다.** 기계에 있어야 하고, 없으면 이
 * 렌더러는 **던지지 않고 전부 실패로 낸다**(`screen-render.ts`의 「실패는 값이다」). 그래서 배포 형태(`Dockerfile`)를
 * 만들 때는 브라우저를 함께 실어야 한다 — 없으면 pptx 가 화면 없이 나간다.
 *
 * # 무엇을 그리나
 *
 * `exportPage`가 낸 HTML을 **파일로 쓰지 않고** 그대로 띄우고(`setContent`) 같은 함수가
 * 낸 CSS를 얹는다(`addStyleTag`). 새 HTML을 만들면 화면·번들·PPTX가 세 벌이 되고
 * 설계서 「HTML 정적 번들」의 *"렌더러가 하나뿐이라 결과가 어긋날 수 없다"*가 거짓이 된다.
 *
 * # 바깥으로 나가는 요청을 막는다
 *
 * 테마의 `@font-face`·`url()`은 **사용자가 적은 문자열**이다(`themes/spec/assets.ts`).
 * 서버가 그것을 가져오면 프로젝트 멤버가 적은 주소로 **서버가 요청을 보내는 자리**가 된다.
 * 그래서 라우팅되는 요청을 전부 끊는다 — `data:`는 네트워크를 안 타므로 그대로 산다.
 *
 * **대가:** 원격 웹폰트를 든 테마는 대체 글꼴로 그려진다.
 *
 * **시스템 테마에서 갈림이 없는 이유는 *"글꼴 자산이 없어서"*가 아니다** — 시스템 테마 **넷**이
 * `assets.fonts`를 든다(`packages/themes/src/system/`). 갈림이 없는 이유는 **그 `src`가 `local()`뿐이라
 * 네트워크를 안 타기 때문**이다 — 컴파일된 시트에 `@font-face`는 있고 `url(`은 **0건**이다(다시 재려면
 * 시스템 테마 다섯을 컴파일해 `url(`을 센다).
 *
 * **그래서 `url()`을 하나 더하는 순간 갈린다.**
 *
 * # 어디에 상태를 두나
 *
 * **브라우저는 `render` 한 번의 수명이다** — 부를 때 띄우고 `finally`에서 닫는다. 띄우는 값은
 * N장의 비용에 견주면 작다. 오래 사는 브라우저를 두면 그 프로세스를 누가 닫는지·요청 둘이
 * 그것을 어떻게 나눠 쓰는지가 새 물음이 된다. 동시에 뜨는 브라우저 수는 `export-worker.ts`의
 * 그리기 칸이 묶는다.
 */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core'
import {
  decideKoreanGlyphs,
  errorLine,
  KOREAN_PROBE_FAILED,
  NO_KOREAN_FONT,
  readPngSize,
  type KoreanGlyphSamples,
  type KoreanGlyphVerdict,
  type ScreenBatch,
  type ScreenRenderer,
  type ScreenRequest,
  type ScreenResult,
} from './screen-render'

/**
 * 뷰포트. **권하는 화소가 여기서 나온다** — `SCREEN_BOX`가
 * `7.5in × 5.75in`이고 96dpi로 나누면 이 값이다.
 */
const VIEWPORT = { width: 720, height: 552 }

/**
 * 화소 배율. 권하는 화소의 **2배**다.
 *
 * 슬라이드는 사람이 화면과 빔프로젝터로 본다 — 1배는 자리에 꼭 맞지만 확대하면 뭉개진다.
 * 3배는 파일이 커지는 만큼 얻는 것이 없다.
 */
const DEVICE_SCALE_FACTOR = 2

/**
 * **화면 전체를 찍는다.** 뷰포트만 찍으면 긴 페이지의 아래가 잘리고, 잘린 목업은
 * *"눈으로는 그럴듯한 한 장"*이다.
 *
 * **그래서 높이를 미리 알 수 없다** — 그것이 `readPngSize`가 있는 이유다(`screen-render.ts`의 「화소는 바이트에서 읽는다」).
 */
const FULL_PAGE = true

/**
 * **신호는 서버가 받는다 — 브라우저를 띄우는 자가 받지 않는다.**
 *
 * playwright 는 기본으로 브라우저가 떠 있는 동안 신호 처리기를 건다. 그러면 서버가 도는 요청을 끝까지 답하려고 닫는
 * 사이에(`shutdown.ts`) 브라우저가 먼저 닫혀 그리던 pptx 가 200 인데 그림이 전부 빠진다. 셋 다 그렇다:
 * - `SIGTERM` · `SIGHUP` — 브라우저만 닫는다. `SIGHUP`은 처리기가 걸린 동안 node 의 기본 동작(죽기)도 막으므로, 서버가 그 신호를
 *   안 받으면 그리던 서버가 **포트를 쥔 채 고아로 남는다**(`tsx` 부모만 죽는다).
 * - `SIGINT` — 브라우저를 닫고 `process.exit(130)` 한다. 서버의 닫기가 끝나기 전에 프로세스가 끝난다.
 *
 * 잰 값(macOS 로컬 api · 빈 페이지 40장 pptx 를 보내고 300ms 뒤 `tsx` 의 전경 그룹에 신호): 이것이 없으면 셋 다 200 · 그림 실패
 * 36/40 · SIGHUP 은 고아 서버. 있으면 셋 다 실패 0.
 *
 * **떼어도 브라우저가 남지 않는다** — 서버가 `process.exit`로 끝나면 playwright 의 `exit` 처리기가 죽이고, 서버가 신호로 죽으면
 * (SIGKILL) 파이프가 닫혀 브라우저가 스스로 끝난다.
 */
export const LEAVE_SIGNALS_TO_SERVER = { handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false } as const

/** 기본값들. `chromiumScreenRenderer`의 인자로 덮을 수 있다. */
export const SCREEN_DEFAULTS = {
  /** 동시에 여는 페이지 수. 늘려도 얻는 것이 빠르게 줄고 최고 메모리는 그대로 는다. */
  concurrency: 4,
  /** 한 장을 기다리는 시간. 넘으면 **그 장만** 실패한다. */
  timeoutMs: 10_000,
  /**
   * 그릴 페이지 수의 상한.
   *
   * **넘은 장은 조용히 빠지지 않는다** — 실패 이유가 상한과 **분모를 함께** 말한다.
   * pptx 하나가 통째로 메모리에 올라가므로 장 수가 그대로 최고 사용량이다.
   */
  maxPages: 200,
  /**
   * **한 장의 넓이 상한(CSS px²)** — 뷰포트 폭 × 8192. 넘은 장은 그리지 않고 실패한다(이유가 크기와 상한을 말한다).
   *
   * 화면 전체를 찍으므로(`FULL_PAGE`) 긴 페이지의 비트맵이 높이만큼 자란다. 잰 값(운영 compose 의 api 컨테이너 · 배포판
   * chromium · `Text` 행만 든 페이지 한 장의 pptx 내려받기 · cgroup `memory.current` 최고 − 부하 전): 200행 +0.38GB · 500행
   * +0.77GB · 1000행 +1.24GB · 2000행 +2.05GB · 4000행 5.7GB 까지 오르고 다음 번은 컨테이너 안에서 OOM kill 로 «Unable to
   * capture screenshot». 페이지 여덟 장 × 40행 짜리 일 하나가 +0.54GB 다 — 긴 페이지 한 장이 서버 하나를 쓰러뜨린다.
   * 8192 는 200행 남짓이고 장치 화소로 16384(배율 2)다. 그보다 긴 그림은 슬라이드(7.5 × 5.75in)에 1pt 안팎의 글자로 앉는다.
   *
   * **자르지 않는다** — 잘린 목업은 «눈으로는 그럴듯한 한 장»이다(`FULL_PAGE`의 판정과 같다). 넓이로 재는 것은 폭이 뷰포트를
   * 넘는 페이지도 전체를 찍기 때문이다. 다시 재는 법: 최상위 README 「배포하려면」의 「화면 그리기 상한」.
   */
  maxArea: 720 * 8192,
} as const

export interface ChromiumScreenRendererOptions {
  concurrency?: number
  timeoutMs?: number
  maxPages?: number
  maxArea?: number
  /**
   * 브라우저 실행 파일. **주지 않으면 `playwright-core`가 기계에서 찾는다.**
   * 스모크가 자기 기계의 것을 가리킬 때 쓴다.
   */
  executablePath?: string
}

/**
 * 두부 물음의 **날 값을 걷는다**. **판정하지 않는다** — 그것은 `decideKoreanGlyphs`다.
 *
 * **`document.fonts.check`를 쓰지 않는다** — 없는 글꼴 이름에도 참을 낸다. 물어야 할 것은 *"이 이름의 글꼴이 있는가"*가 아니라 ***"한글에 글리프가 있는가"***다.
 *
 * 그래서 사용자 영역(PUA) 두 글자를 그려 두부의 모양을 얻고, 한글 두 글자를 같은 방법으로
 * 그려 픽셀 해시를 맞댄다.
 *
 * **여기서 참·거짓을 정하지 않는다.** 두 가지 이유가 있다:
 *
 * 1. **판정이 브라우저 안에 있으면 게이트가 그것을 못 잰다** — 이 자리를
 *    `return true`로 갈아도 케이스가 전부 초록이다.
 * 2. ***"사용자 영역은 반드시 두부"*가 참이 아니다** — `U+F8FF`에 실제 글리프가
 *    있는 기계가 있다. 그래서 후보를 **넷**으로 두고 서로 같을
 *    때만 기준선으로 쓴다(`decideKoreanGlyphs`).
 *
 * **함수가 아니라 글자로 넘긴다.** 이 저장소의 TS는 esbuild를 지나고 그것이 함수에 이름
 * 표시(`__name`)를 심는데, 그 함수가 브라우저 안에서 실행되면 그 이름이 없어 죽는다.
 *
 * **수출하는 것은 `build-test`가 이 글자를 그대로 브라우저에 먹여 날 값을 재기 위해서다.**
 */
export const KOREAN_GLYPH_PROBE = `(() => {
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
    baselines: [
      ink('\\uE000\\uE001'),
      ink('\\uE010\\uE011'),
      ink('\\uE100\\uE101'),
      ink('\\uE500\\uE501'),
    ],
    hangul: ink('\\uD55C\\uAE00'),
    blank: ink(''),
  }
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
  const maxArea = options?.maxArea ?? SCREEN_DEFAULTS.maxArea

  return {
    async render(requests: readonly ScreenRequest[]): Promise<ScreenBatch> {
      if (requests.length === 0) return { results: [], fontWarning: null }

      let browser: Browser
      try {
        browser = await chromium.launch({
          ...LEAVE_SIGNALS_TO_SERVER,
          ...(options?.executablePath === undefined ? {} : { executablePath: options.executablePath }),
        })
      } catch (error) {
        return {
          results: requests.map(() => failure(`브라우저를 띄우지 못했습니다: ${errorLine(error)}`)),
          fontWarning: null,
        }
      }

      try {
        const korean = await probeKoreanGlyphs(browser, timeoutMs)
        if (korean === 'no') {
          // **두부를 그려 내보내지 않는다.** 없는 것이 나쁜 것보다 낫다.
          return {
            results: requests.map(() => failure(NO_KOREAN_FONT)),
            fontWarning: NO_KOREAN_FONT,
          }
        }
        if (korean !== 'yes') {
          /**
           * **모르면 안 그린다.** 물음 자체가 죽은 것은 *"글꼴이 없다"*와 다르므로
           * `fontWarning`을 세우지 않는다 — 그 값은 *"이 기계에 한글 글꼴이 없다"*를
           * 뜻하고, 여기서 아는 것은 **모른다**는 것뿐이다.
           *
           * **여기서 던지지 않는다** — 던지면 내보내기 하나가
           * 통째로 500이 되어 pptx를 아예 못 받는다(`screen-render.ts`의 「실패는 값이다」의 정반대다).
           */
          return { results: requests.map(() => failure(korean.reason)), fontWarning: null }
        }
        return { results: await renderAll(browser, requests, { concurrency, timeoutMs, maxPages, maxArea }), fontWarning: null }
      } finally {
        /**
         * **닫는 데 실패해도 다 그린 배치를 잃지 않는다.** 여기서 던지면 그 예외가 `render`
         * 밖으로 그대로 나간다.
         *
         * **삼키는 것이 공짜가 아니다** — 못 닫은 브라우저는 조용히 남는다. 그래서 정상
         * 경로에서 프로세스가 0으로 돌아오는 것을 `build-test`가 센다.
         */
        await browser.close().catch(() => {})
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
  limits: { concurrency: number; timeoutMs: number; maxPages: number; maxArea: number },
): Promise<ScreenResult[]> {
  const results: ScreenResult[] = new Array(requests.length)
  let next = 0

  async function worker(): Promise<void> {
    for (;;) {
      const index = next++
      if (index >= requests.length) return
      if (index >= limits.maxPages) {
        // **분모를 함께 말한다.** *"몇 장 중 몇 번째가 빠졌다"*가 없으면 조용히 빠진 것과 같다.
        results[index] = failure(
          `화면 이미지 상한 ${limits.maxPages}장을 넘었습니다 (${requests.length}장 중 ${index + 1}번째)`,
        )
        continue
      }
      results[index] = await renderOne(browser, requests[index]!, limits.timeoutMs, limits.maxArea)
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limits.concurrency, requests.length) }, () => worker()),
  )
  return results
}

/** 한 장. **여기서 던지는 것은 전부 값이 된다**(`screen-render.ts`의 「실패는 값이다」). */
async function renderOne(
  browser: Browser,
  request: ScreenRequest,
  timeoutMs: number,
  maxArea: number,
): Promise<ScreenResult> {
  let context: BrowserContext | undefined
  try {
    context = await newRenderContext(browser, timeoutMs)
    const page = await context.newPage()
    await page.setContent(request.html, { waitUntil: 'load' })
    // 테마 시트보다 먼저 얹어 전이가 시작도 안 하게 한다(`FREEZE_MOTION`). 뒤에 얹어도 시작한 전이가 끊겨 끝 값으로 간다 — 잰 값이 같았다.
    await page.addStyleTag({ content: FREEZE_MOTION })
    await page.addStyleTag({ content: request.css })
    // **찍기 전에 잰다** — 비트맵을 만드는 것이 비싼 몫이다(`SCREEN_DEFAULTS.maxArea`).
    const measured = await measure(page, timeoutMs)
    if (measured === null) return failure(`${SCREEN_FONTS_LATE} — ${timeoutMs}ms`)
    const [width, height] = measured
    if (width * height > maxArea) return failure(tooLarge(width, height, maxArea))
    /**
     * **잰 크기로 묶어 찍는다.** playwright 는 찍으면서 크기를 다시 재고 그 크기로 비트맵을 만든다 — 잰 뒤에 자라는
     * 페이지(위 두 겹이 못 닫는 수단)가 상한을 지난 비트맵이 된다. `clip` 이 있으면 그 재기를 `clip` 안으로 자른다.
     */
    const bytes = await page.screenshot({ type: 'png', fullPage: FULL_PAGE, clip: { x: 0, y: 0, width, height } })
    // **잘린 그림을 내지 않는다** — 묶어 찍은 뒤 자랐으면 그림은 위쪽만이다(`FULL_PAGE`의 판정).
    const after = await measure(page, timeoutMs)
    if (after === null) return failure(`${SCREEN_FONTS_LATE} — ${timeoutMs}ms`)
    const [afterWidth, afterHeight] = after
    if (afterWidth > width || afterHeight > height) return failure(grew(width, height, afterWidth, afterHeight))
    const size = readPngSize(bytes)
    // **못 읽은 크기를 계약에 넣지 않는다** — 넣으면 슬라이드가 조용히 찌그러진다.
    if (size === null) return failure('그린 이미지의 화소를 읽지 못했습니다')
    return { ok: true, bytes, width: size.width, height: size.height }
  } catch (error) {
    return failure(errorLine(error))
  } finally {
    // **컨텍스트를 닫으면 그 안의 페이지가 함께 닫힌다** — 팝업까지 포함해서다.
    await context?.close().catch(() => {})
  }
}

/**
 * 그리는 컨텍스트 하나. **바깥으로 나가는 요청을 끊는다**(위 머리말).
 *
 * **페이지가 아니라 컨텍스트에 건다.** `page.route`는 **그 페이지 하나**에만 걸리므로
 * `window.open`이 만드는 새 페이지가 규칙 밖으로 나간다 — 그 새 페이지의 요청은 실제로
 * 바깥에 닿는다.
 *
 * **지금 `exportPage`가 `<script>`를 안 내므로 도달할 길이 없다는 것도 값이다**
 * (`test/export-pptx-screens.test.ts`가 그것을 센다). 그래도 컨텍스트로 올린 이유는
 * *"지금 도달 불가"*가 **산문**이면 `exportPage`가 바뀔 때 조용히 열리기 때문이다.
 */
async function newRenderContext(browser: Browser, timeoutMs: number): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  })
  context.setDefaultTimeout(timeoutMs)
  await context.route('**/*', (route) => {
    void route.abort()
  })
  return context
}

/**
 * 두부 물음. **배치마다 한 번이다** — 글꼴은 기계의 성질이다.
 *
 * **답이 셋이다.** *"있다"*·*"없다"*·**"못 물었다"**. 셋째를 둘째에 접으면 브라우저가
 * 잠깐 흔들린 것이 *"이 서버에 한글 글꼴이 없다"*로 나가고, 그것은 거짓말이다.
 */
async function probeKoreanGlyphs(browser: Browser, timeoutMs: number): Promise<KoreanGlyphVerdict> {
  let context: BrowserContext | undefined
  try {
    context = await newRenderContext(browser, timeoutMs)
    const page = await context.newPage()
    await page.setContent('<!doctype html><html lang="ko"><body></body></html>', { waitUntil: 'load' })
    // **판정을 여기서 하지 않는다** — 날 값만 받아 `decideKoreanGlyphs`에 넘긴다(그 함수의 머리말).
    return decideKoreanGlyphs(await page.evaluate<KoreanGlyphSamples>(KOREAN_GLYPH_PROBE))
  } catch (error) {
    return { reason: `${KOREAN_PROBE_FAILED}: ${errorLine(error)}` }
  } finally {
    await context?.close().catch(() => {})
  }
}

/**
 * **움직임을 끈다 — 잰 크기와 찍는 크기가 같은 상태를 보게.** 테마 시트는 HTML 을 띄운 **뒤에** 얹으므로 테마의
 * `transition` 은 기본값에서 테마 값으로 옮겨 가는 전이를 시작한다. 그 사이에 재면 작게 재고 크게 찍는다(여백 20000px 을
 * 전이로 건 파생 테마가 상한의 4.9배 비트맵을 냈다 — 운영 compose 의 api 컨테이너에서 한 장에 cgroup 최고 2GB 안팎) — 시스템 테마도
 * 단추에 `transition` 을 걸어 그림이 옮겨 가는 중간에 찍혔다. 다시 재는 법: `build-test/screen-chromium.test.ts` 「잰 크기와 찍는
 * 크기」(끄기 · 층 · 글꼴 기다림 · 묶어 찍기 · 찍은 뒤 다시 재기를 하나씩 떼면 거기 케이스가 죽는다) · 최상위 README
 * 「화면 그리기 상한」의 잰 값.
 *
 * **층(`@layer`)에 둔다** — 층 안의 `!important` 는 층 밖의 `!important` 를 특이도와 상관없이 이긴다. 테마 값은 `!important` 를
 * 실을 수 있고(컴파일이 받는다) 그 셀렉터가 `*` 보다 구체적이라, 층 없이 두면 테마가 이 끄기를 이긴다.
 */
export const FREEZE_MOTION =
  '@layer wb-freeze-motion { *, *::before, *::after { transition: none !important; animation: none !important } }'

/**
 * 화면 전체의 크기(CSS px) — playwright 가 `fullPage` 로 찍을 때 재는 식(`body`·`documentElement` 의 scroll · offset · client
 * 최대)과 같다. **글꼴을 기다린 뒤 잰다** — 테마의 `@font-face` 는 시트를 얹은 뒤에야 받기 시작하고 playwright 도 찍기 전에
 * `document.fonts.ready` 를 기다린다(세로 지표가 큰 글꼴이 오기 전에 재면 작게 잰다). 먼저 레이아웃을 세워야 쓰이는 글꼴의 받기가
 * 시작된다. 글자로 넘기는 까닭은 `KOREAN_GLYPH_PROBE`와 같다.
 */
const PAGE_SIZE = `(async () => {
  void document.documentElement.offsetHeight
  await document.fonts.ready
  const d = document.documentElement
  const b = document.body
  return [
    Math.max(d.scrollWidth, d.offsetWidth, d.clientWidth, b ? Math.max(b.scrollWidth, b.offsetWidth, b.clientWidth) : 0),
    Math.max(d.scrollHeight, d.offsetHeight, d.clientHeight, b ? Math.max(b.scrollHeight, b.offsetHeight, b.clientHeight) : 0),
  ]
})()`

/**
 * 화면 전체의 크기를 잰다 — **한 단계의 한도(`timeoutMs`) 안에서.** 넘으면 `null`.
 *
 * `page.evaluate` 는 컨텍스트의 기본 한도(`setDefaultTimeout`)를 안 받아, `PAGE_SIZE` 가 기다리는 `document.fonts.ready` 가 한도 없이
 * 기다렸다 — 그리기의 다른 단계에는 한도가 있다(`shutdown.ts` 「한도가 있는 까닭」). 받기가 끝나지 않는 글꼴은 페이지 내용만으로
 * 못 만들었지만(원격 요청은 끊기고 `data:` · `local()` · 낯선 스킴은 곧 끝난다) 막힌 원본을 가족마다 줄줄이 단 파생 테마는 받기가
 * 가족을 차례로 지나 원본 수만큼 길어진다(1MiB 안에서 한 장 15s). 다시 재는 법: `build-test/screen-chromium.test.ts` 「글꼴을
 * 기다리는 것도 한 장의 한도 안이다」.
 *
 * 한도를 넘긴 재기는 브라우저 안에서 계속 돈다 — 부른 쪽이 컨텍스트를 닫을 때 끊긴다(그때 던지는 것을 여기서 받는다).
 */
async function measure(page: Page, timeoutMs: number): Promise<[number, number] | null> {
  const measured = page.evaluate<[number, number]>(PAGE_SIZE)
  measured.catch(() => {})
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs)
  })
  try {
    return await Promise.race([measured, late])
  } finally {
    clearTimeout(timer)
  }
}

/** 넓이 상한을 넘은 장의 이유. 크기와 상한을 함께 말한다 — 무엇을 줄이면 되는지 사람이 알아야 한다. */
export function tooLarge(width: number, height: number, maxArea: number): string {
  return `${SCREEN_TOO_LARGE} — ${width}×${height}px(상한 ${VIEWPORT.width}×${Math.floor(maxArea / VIEWPORT.width)}px 넓이)`
}

/** 넓이 상한을 넘은 장의 이유 머리. */
export const SCREEN_TOO_LARGE = '페이지가 너무 커 화면을 그리지 않았습니다'

/** 잰 뒤에 자란 장의 이유. 두 크기를 함께 말한다. */
export function grew(width: number, height: number, afterWidth: number, afterHeight: number): string {
  return `${SCREEN_GREW} — ${width}×${height}px 에서 ${afterWidth}×${afterHeight}px`
}

/** 글꼴을 기다리다 한도를 넘은 장의 이유 머리. 뒤에 한도를 붙인다(`measure`). */
export const SCREEN_FONTS_LATE = '글꼴을 기다리다 한 장의 한도를 넘어 화면을 그리지 않았습니다'

/** 잰 뒤에 자란 장의 이유 머리. */
export const SCREEN_GREW = '페이지가 그리는 동안 커져 화면을 그리지 않았습니다'

function failure(reason: string): ScreenResult {
  return { ok: false, reason }
}
