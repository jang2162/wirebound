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
 * # 무엇을 그리나 — 번들의 페이지 그대로
 *
 * **HTML 번들의 페이지를 그대로 연다**(`ScreenJob` — `exportBundle` 이 낸 파일 전부). 파일은 쓰지 않고 가짜 origin(`SCREEN_ORIGIN`)에서
 * 메모리로 내준다(`route.fulfill`). 페이지는 `#wb-screen` 으로 열어 셸을 숨기고(화면 모드), 번들 런타임이 프로젝트 테마로 목업을 그린 뒤
 * 세우는 `<html data-wb-ready>` 를 **한 장의 한도 안에서** 기다린다 — 테마 적재 · 글꼴 · 첫 렌더가 그 한도에 든다. 런타임이
 * `data-wb-failed` 를 세웠으면(테마 등록 없음 · 판 불일치 · 뷰가 던짐) 그 까닭으로 그 장을 건너뛴다. 새 HTML 을 만들지 않으므로 화면 ·
 * 번들 · PPTX 가 한 벌이다(spec `docs/superpowers/specs/2026-09-27-code-themes-design.md` 「PPTX」).
 *
 * # 바깥으로 나가는 요청을 막는다
 *
 * 번들에는 관리자가 올린 테마 코드 · CSS 가 실린다 — 그것이 가리키는 바깥 주소(`@font-face` · `url()` · 스크립트의 `fetch`)를 서버가
 * 가져오면 그 코드를 적은 쪽이 고른 주소로 **서버가 요청을 보내는 자리**가 된다. 그래서 가짜 origin 밖으로 나가는 길을 전부 막는다 —
 * `data:`는 네트워크를 안 타므로 그대로 산다. 막는 것이 셋이다:
 *
 * | 무엇 | 막는 길 | 못 보는 길 |
 * |---|---|---|
 * | 요청 가로채기(`newRenderContext` 의 `context.route`) | 문서 · 전용 워커의 fetch · 하위 자원 — 가짜 origin 은 여기서 선다 | WebSocket · WebRTC(STUN · TURN) · WebTransport · **공유 워커의 요청 전부**(fetch · EventSource 까지) |
 * | **브라우저 겹**(`NO_EGRESS_ARGS` — 띄울 때의 인자) | 브라우저의 모든 연결 — 문서 · 워커 가리지 않는다 | 잰 판에서는 없다 |
 * | 페이지 겹(`NO_SOCKETS_INIT` — 초기화 스크립트) | 문서마다 소켓을 여는 생성자를 지운다(about:blank · blob · srcdoc · data iframe · 창까지) | 워커(전용 · 공유) — 초기화 스크립트가 안 돈다 |
 *
 * **브라우저 겹이 주이고 페이지 겹은 보조다** — 잰 판(`build-test/screen-sandbox-review.test.ts` 의 격자: 채널 × 문서 · 창 · 워커 ·
 * IP 리터럴 · 이름)에서 브라우저 겹만으로 소켓이 0 이고, 페이지 겹만으로는 워커의 소켓이 남는다. 페이지 겹을 두는 까닭은 브라우저 겹이
 * Chromium 의 인자 해석에 기대기 때문이다(판이 바뀌어 인자 하나가 조용히 무시되면 문서의 채널은 여전히 막힌다). 두 겹이 문서에서
 * 겹치므로 그 격자는 한 겹을 걷은 판도 따로 돌린다 — 겹마다, 브라우저 겹의 인자마다 혼자 죽는 판이 있다.
 *
 * **대가:** 원격 웹폰트를 든 시트는 대체 글꼴로 그려진다 — 번들이 오프라인에서도 같게 보이려면 테마가 글꼴을 패키지에 싣는다
 * (spec 「스킬」 의 금지 사항).
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
  type ScreenJob,
  type ScreenPage,
  type ScreenRenderer,
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

/**
 * 번들을 내주는 가짜 origin. `.invalid` 는 이름이 풀리지 않는 최상위 도메인이라(RFC 2606) 끊기지 않은 요청이 있어도 어디에도
 * 닿지 않는다. 이 origin 의 요청은 받은 파일에서 내주고, 그 밖은 끊는다(`newRenderContext`).
 */
export const SCREEN_ORIGIN = 'https://export.wirebound.invalid'

/**
 * **브라우저 겹 — 브라우저의 모든 연결을 막다른 곳으로 보낸다**(머리말 「바깥으로 나가는 요청을 막는다」). 요청 가로채기가 못 보는
 * 채널(WebSocket · WebRTC · WebTransport · 공유 워커)도 브라우저의 네트워크 층은 지난다. 가짜 origin 은 가로채기가 응답을 지어 네트워크에
 * 안 닿으므로 그대로 선다.
 *
 * | 인자 | 하는 일 · 잰 값(격자 — 겹 없이 소켓 37 곳) |
 * |---|---|
 * | `--proxy-server` | 모든 연결을 풀리지 않는 이름(`.invalid`)의 프록시로 — 닫힌 포트를 고르지 않는다(그 포트에 누가 들으면 그것이 프록시가 된다). 프록시가 실패해도 곧장 나가지 않는다. 이것만이면 WebRTC 의 UDP(STUN · TURN) 12 곳이 남는다 |
 * | `--proxy-bypass-list=<-loopback>` | 루프백도 프록시로 — Chromium 은 루프백을 늘 곧장 보낸다(api · DB 가 도는 그 기계다). playwright 의 `proxy` 옵션을 안 쓰는 까닭: 환경 변수 하나(`PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK`)가 이 규칙을 걷는다 |
 * | `--force-webrtc-ip-handling-policy=disable_non_proxied_udp` | WebRTC 가 프록시 밖 UDP 를 안 쓴다 — 프록시를 거친 TCP 만 남고 그것은 막다른 곳이다. `--webrtc-ip-handling-policy` 는 이 헤드리스 셸에서 아무것도 안 막았다(프록시와 함께여도 UDP 12 곳이 그대로) |
 * | `--host-resolver-rules=MAP * ~NOTFOUND` | 이름 풀이를 전부 실패로 — 테마 코드가 고른 이름으로 DNS 질의가 나가지 않는다(NetLog 의 이름 풀이 0). IP 리터럴(v4 · v6)도 이 규칙에 걸려 연결이 안 선다 — 그래서 이것만이어도 WebRTC 의 IP 리터럴 UDP 6 곳만 남는다 |
 *
 * `--disable-quic` 은 싣지 않았다 — 이것만 준 판에서 WebTransport(QUIC)가 그대로 나갔고, 위 넷에 더해도 바뀌는 것이 없었다. 다시 재는 법:
 * `build-test/screen-sandbox-review.test.ts` 의 격자 — 판의 `strip` 에 걷을 인자를 두거나 `chromium.launch` 감싸개가 더하는 인자에 바꿔 볼
 * 인자를 넣어 돌리면 열린 칸이 나온다.
 */
export const NO_EGRESS_ARGS = [
  '--proxy-server=http://no-egress.wirebound.invalid:9',
  '--proxy-bypass-list=<-loopback>',
  '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
  '--host-resolver-rules=MAP * ~NOTFOUND',
] as const

/**
 * **페이지 겹 — 문서마다 소켓을 여는 생성자를 지운다**(보조 — 머리말 「바깥으로 나가는 요청을 막는다」). 목업을 그리는 데는 셋 다 쓸 일이
 * 없다(번들 런타임 · 시스템 테마 · kit 템플릿에 쓰는 자리 0). 다시 정의하지 못하게 `configurable: false` 로 둔다. 초기화 스크립트라
 * 문서가 서자마자 — 테마 코드보다 먼저 — 돌고, 새로 서는 iframe · 창의 문서에서도 돈다. **워커에서는 안 돈다** — 거기는 브라우저 겹이
 * 막는다. 글자로 넘기는 까닭은 `KOREAN_GLYPH_PROBE`와 같다.
 */
export const NO_SOCKETS_INIT = `(() => {
  for (const name of ['WebSocket', 'WebTransport', 'RTCPeerConnection', 'webkitRTCPeerConnection', 'EventSource']) {
    Object.defineProperty(globalThis, name, { value: undefined, writable: false, configurable: false, enumerable: false })
  }
})()`

/** 화면 모드로 여는 해시 — 번들 런타임이 셸을 숨긴다(`@wirebound/exporter` 의 `SCREEN_HASH`). */
const SCREEN_HASH = '#wb-screen'

/** 기본값들. `chromiumScreenRenderer`의 인자로 덮을 수 있다. */
export const SCREEN_DEFAULTS = {
  /** 동시에 여는 페이지 수. 늘려도 얻는 것이 빠르게 줄고 최고 메모리는 그대로 는다. */
  concurrency: 4,
  /** 한 장을 기다리는 시간 — 여는 것 · 테마 적재 · 글꼴 · 첫 렌더 · 재기가 모두 든다. 넘으면 **그 장만** 실패한다. */
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
    async render(job: ScreenJob): Promise<ScreenBatch> {
      const requests = job.pages
      if (requests.length === 0) return { results: [], fontWarning: null }

      let browser: Browser
      try {
        browser = await chromium.launch({
          ...LEAVE_SIGNALS_TO_SERVER,
          args: [...NO_EGRESS_ARGS],
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
        return { results: await renderAll(browser, job, { concurrency, timeoutMs, maxPages, maxArea }), fontWarning: null }
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
  job: ScreenJob,
  limits: { concurrency: number; timeoutMs: number; maxPages: number; maxArea: number },
): Promise<ScreenResult[]> {
  const requests = job.pages
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
      results[index] = await renderOne(browser, job.files, requests[index]!, limits.timeoutMs, limits.maxArea)
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
  files: ScreenJob['files'],
  request: ScreenPage,
  timeoutMs: number,
  maxArea: number,
): Promise<ScreenResult> {
  let context: BrowserContext | undefined
  // **한 장의 한도 하나를 단계들이 나눠 쓴다** — 단계마다 한도를 새로 주면 한도가 단계 수만큼 곱해진다.
  const started = Date.now()
  const left = (): number => Math.max(1, timeoutMs - (Date.now() - started))
  try {
    context = await newRenderContext(browser, timeoutMs, files)
    // 첫 그림 전에 움직임을 끈다(`FREEZE_MOTION`) — 테마 시트가 늦게 와도 전이가 시작도 안 한다.
    await context.addInitScript({ content: FREEZE_MOTION_INIT })
    // 테마 코드보다 먼저 소켓을 여는 생성자를 지운다(`NO_SOCKETS_INIT` — 보조 겹).
    await context.addInitScript({ content: NO_SOCKETS_INIT })
    const page = await context.newPage()
    await page.goto(`${SCREEN_ORIGIN}/${encodePath(request.path)}${SCREEN_HASH}`, { waitUntil: 'commit', timeout: left() })
    if (!(await waitReady(page, left()))) return failure(notReady(timeoutMs))
    // 번들 런타임이 테마를 못 썼다(등록 없음 · 판 불일치 · 뷰가 던짐) — 기본 뷰로 그린 장을 찍지 않고 그 까닭을 낸다. 이 읽기도 한 장의
    // 한도 안이다(`withinLimit`) — 테마 코드가 `getAttribute` 를 끝나지 않는 thenable 로 덮으면 한도 없는 `evaluate` 가 배치째 멈췄다.
    const failed = await withinLimit(page.evaluate<string | null>(`document.documentElement.getAttribute('data-wb-failed')`), left())
    if (failed === LATE) return failure(notReady(timeoutMs))
    if (failed !== null) return failure(failed)
    // **찍기 전에 잰다** — 비트맵을 만드는 것이 비싼 몫이다(`SCREEN_DEFAULTS.maxArea`).
    const measured = await measure(page, left())
    if (measured === LATE) return failure(notReady(timeoutMs))
    const [width, height] = measured
    if (width * height > maxArea) return failure(tooLarge(width, height, maxArea))
    /**
     * **잰 크기로 묶어 찍는다.** playwright 는 찍으면서 크기를 다시 재고 그 크기로 비트맵을 만든다 — 잰 뒤에 자라는
     * 페이지(움직임 끄기가 못 닫는 수단)가 상한을 지난 비트맵이 된다. `clip` 이 있으면 그 재기를 `clip` 안으로 자른다.
     */
    const bytes = await page.screenshot({ type: 'png', fullPage: FULL_PAGE, clip: { x: 0, y: 0, width, height }, timeout: left() })
    // **잘린 그림을 내지 않는다** — 묶어 찍은 뒤 자랐으면 그림은 위쪽만이다(`FULL_PAGE`의 판정).
    const after = await measure(page, left())
    if (after === LATE) return failure(notReady(timeoutMs))
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

/** 번들 안 경로를 URL 경로로 — 마디마다 인코딩한다(한글 파일 이름). 받는 쪽(`newRenderContext`)이 되돌린다. */
function encodePath(path: string): string {
  return path.split('/').map((segment) => encodeURIComponent(segment)).join('/')
}

/** 준비 신호(`<html data-wb-ready>`)가 한도 안에 섰나. 한도를 넘으면 `false` — 다른 실패는 던진다(부른 쪽이 값으로 바꾼다). */
async function waitReady(page: Page, timeoutMs: number): Promise<boolean> {
  try {
    await page.waitForSelector('html[data-wb-ready]', { state: 'attached', timeout: timeoutMs })
    return true
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') return false
    throw error
  }
}

/** 확장자 → `Content-Type`. 번들이 싣는 것(HTML · CSS · JS · 패키지 자산의 허용 확장자)만 안다 — 모르는 것은 바이트로 낸다. */
const CONTENT_TYPES: Record<string, string> = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  svg: 'image/svg+xml',
  woff: 'font/woff',
  woff2: 'font/woff2',
  ttf: 'font/ttf',
  otf: 'font/otf',
}

function contentTypeOf(path: string): string {
  const dot = path.lastIndexOf('.')
  return (dot === -1 ? undefined : CONTENT_TYPES[path.slice(dot + 1).toLowerCase()]) ?? 'application/octet-stream'
}

/**
 * 그리는 컨텍스트 하나. **가짜 origin 의 요청은 받은 파일에서 내주고, 그 밖은 끊는다**(위 머리말). 없는 파일은 404 로 답한다 — 끊지
 * 않아야 `<link>` · `<script>` 가 곧바로 `error` 를 내 번들 런타임이 기다리지 않는다.
 *
 * **페이지가 아니라 컨텍스트에 건다.** `page.route`는 **그 페이지 하나**에만 걸리므로
 * `window.open`이 만드는 새 페이지가 규칙 밖으로 나간다 — 그 새 페이지의 요청은 실제로
 * 바깥에 닿는다. 번들에는 테마 스크립트가 실리므로 그 길이 열려 있다(`build-test/screen-chromium.test.ts` 「일곱 길」).
 */
async function newRenderContext(browser: Browser, timeoutMs: number, files: ScreenJob['files'] = new Map()): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  })
  context.setDefaultTimeout(timeoutMs)
  await context.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== SCREEN_ORIGIN) {
      void route.abort()
      return
    }
    let body: string | Uint8Array | undefined
    let path = ''
    try {
      path = decodeURIComponent(url.pathname.slice(1))
      body = files.get(path)
    } catch {
      body = undefined
    }
    if (body === undefined) {
      void route.fulfill({ status: 404, body: '' })
      return
    }
    void route.fulfill({ status: 200, contentType: contentTypeOf(path), body: typeof body === 'string' ? body : Buffer.from(body) })
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
    // **판정을 여기서 하지 않는다** — 날 값만 받아 `decideKoreanGlyphs`에 넘긴다(그 함수의 머리말). 한도 안에서 묻는다(`withinLimit`) —
    // 못 받으면 «못 물었다»다.
    const samples = await withinLimit(page.evaluate<KoreanGlyphSamples>(KOREAN_GLYPH_PROBE), timeoutMs)
    if (samples === LATE) return { reason: `${KOREAN_PROBE_FAILED}: ${timeoutMs}ms 안에 답이 없습니다` }
    return decideKoreanGlyphs(samples)
  } catch (error) {
    return { reason: `${KOREAN_PROBE_FAILED}: ${errorLine(error)}` }
  } finally {
    await context?.close().catch(() => {})
  }
}

/**
 * **움직임을 끈다 — 잰 크기와 찍는 크기가 같은 상태를 보게.** 테마의 `transition` 은 시트가 늦게 실리거나 번들 런타임이 다시 그릴 때
 * 옛 값에서 새 값으로 옮겨 가는 전이를 시작한다. 그 사이에 재면 작게 재고 크게 찍는다(여백 20000px 을 전이로 건 파생 테마가 상한의
 * 4.9배 비트맵을 냈다 — 운영 compose 의 api 컨테이너에서 한 장에 cgroup 최고 2GB 안팎) — 시스템 테마도 단추에 `transition` 을 걸어
 * 그림이 옮겨 가는 중간에 찍혔다. **첫 그림 전에 건다**(초기화 스크립트 · `FREEZE_MOTION_INIT`). 다시 재는 법:
 * `build-test/screen-chromium.test.ts` 「잰 크기와 찍는 크기」(끄기 · 층 · 글꼴 기다림 · 묶어 찍기 · 찍은 뒤 다시 재기를 하나씩 떼면
 * 거기 케이스가 죽는다) · 최상위 README 「화면 그리기 상한」의 잰 값.
 *
 * **층(`@layer`)에 둔다** — 층 안의 `!important` 는 층 밖의 `!important` 를 특이도와 상관없이 이긴다. 테마 값은 `!important` 를
 * 실을 수 있고(컴파일이 받는다) 그 셀렉터가 `*` 보다 구체적이라, 층 없이 두면 테마가 이 끄기를 이긴다.
 */
export const FREEZE_MOTION =
  '@layer wb-freeze-motion { *, *::before, *::after { transition: none !important; animation: none !important } }'

/**
 * `FREEZE_MOTION` 을 문서가 서자마자 싣는 초기화 스크립트. **`<style>` 을 끼우지 않고 문서가 채택한 시트로 둔다** — 초기화 스크립트가
 * 도는 때는 아직 `<html>` 이 없을 수 있고, 채택한 시트는 DOM 이 서기 전에도 걸리며 페이지가 머리를 다시 짜도 남는다. 글자로 넘기는
 * 까닭은 `KOREAN_GLYPH_PROBE`와 같다.
 */
const FREEZE_MOTION_INIT = `(() => {
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(${JSON.stringify(FREEZE_MOTION)})
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
})()`

/**
 * 화면 전체의 크기(CSS px) — playwright 가 `fullPage` 로 찍을 때 재는 식(`body`·`documentElement` 의 scroll · offset · client
 * 최대)과 같다. **글꼴을 기다린 뒤 잰다** — 테마의 `@font-face` 는 그 글꼴을 쓰는 레이아웃이 선 뒤에야 받기 시작하고 playwright 도 찍기 전에
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
 * 화면 전체의 크기를 잰다 — **한 단계의 한도(`timeoutMs`) 안에서**(`withinLimit`). 넘으면 `LATE`.
 *
 * `PAGE_SIZE` 가 기다리는 `document.fonts.ready` 가 한도 없이 기다렸다. 받기가 끝나지 않는 글꼴은 페이지 내용만으로 못 만들었지만(원격
 * 요청은 끊기고 `data:` · `local()` · 낯선 스킴은 곧 끝난다) 막힌 원본을 가족마다 줄줄이 단 파생 테마는 받기가 가족을 차례로 지나 원본
 * 수만큼 길어진다(1MiB 안에서 한 장 15s). 다시 재는 법: `build-test/screen-chromium.test.ts` 「글꼴을 기다리는 것도 한 장의 한도 안이다」.
 */
function measure(page: Page, timeoutMs: number): Promise<[number, number] | typeof LATE> {
  return withinLimit(page.evaluate<[number, number]>(PAGE_SIZE), timeoutMs)
}

/** 한도 안에 답이 안 온 단계(`withinLimit`). */
const LATE = Symbol('late')

/**
 * **`page.evaluate` 는 한도를 안 받는다** — 컨텍스트의 기본 한도(`setDefaultTimeout`)도, 옵션도 없다. 그래서 `evaluate` 는 전부 이것으로
 * 감싼다 — 그리기의 다른 단계에는 한도가 있다(`shutdown.ts` 「한도가 있는 까닭」). 한도를 넘으면 `LATE`.
 *
 * 렌더러가 부르는 playwright 호출마다 한도를 받는지 잰 값: `evaluate` 만 영영 기다렸다. `goto` · `setContent` · `waitForSelector` 는 기본
 * 한도에 던지고(렌더러는 그래도 `left()` 를 옵션으로 준다), `screenshot` 은 `document.fonts.ready` 를 덮어도 곧 돌아오고, `newContext` ·
 * `newPage` · `addInitScript` · `close` 는 페이지 코드가 붙잡을 자리가 없다. 다시 재는 법: 기본 한도 1s 인 컨텍스트에서 그 호출을 붙잡는
 * 페이지(끝나지 않는 Promise · 답하지 않는 응답 · 덮은 `getAttribute`)를 세우고 6s 안에 돌아오는지 본다. `evaluate` 의 두 자리는
 * `build-test/screen-sandbox-review.test.ts` 가 잠근다.
 *
 * 한도를 넘긴 `evaluate` 는 브라우저 안에서 계속 돈다 — 부른 쪽이 컨텍스트를 닫을 때 끊긴다(그때 던지는 것을 여기서 받는다).
 */
async function withinLimit<T>(pending: Promise<T>, timeoutMs: number): Promise<T | typeof LATE> {
  pending.catch(() => {})
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<typeof LATE>((resolve) => {
    timer = setTimeout(() => resolve(LATE), timeoutMs)
  })
  try {
    return await Promise.race([pending, late])
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

/** 한 장의 한도 안에 준비되지 않은 장(테마 적재 · 글꼴 · 첫 렌더 · 재기)의 이유 머리. 뒤에 한도를 붙인다(`notReady`). */
export const SCREEN_NOT_READY = '한 장의 한도 안에 준비되지 않았습니다'

function notReady(timeoutMs: number): string {
  return `${SCREEN_NOT_READY} — ${timeoutMs}ms`
}

/** 잰 뒤에 자란 장의 이유 머리. */
export const SCREEN_GREW = '페이지가 그리는 동안 커져 화면을 그리지 않았습니다'

function failure(reason: string): ScreenResult {
  return { ok: false, reason }
}
