/**
 * **테마 코드가 도는 그리기 브라우저의 샌드박스 — A5 리뷰가 세운 판에서 시작해 실브라우저로 잠근다.** 무엇을 재는지:
 *
 * 1. **`page.evaluate` 는 한도를 안 받는다** — 컨텍스트 기본 한도(`setDefaultTimeout`)도 옵션도 없다. 그래서 렌더러는 `evaluate` 를 전부
 *    `withinLimit` 로 감싼다(`screen-render-chromium.ts`). 리뷰가 찾은 판: 준비 신호 뒤의 `data-wb-failed` 읽기만 감싸지 않아, 테마 코드가
 *    `getAttribute` 를 끝나지 않는 thenable 로 덮으면 **그 장의 render 가 영영 안 끝나고 배치 전체(멀쩡한 장까지)가 멈췄다** — 그리기 칸을
 *    쥔 채다. 두부 물음의 `evaluate` 도 같은 꼴이라 함께 잰다(물음 페이지는 테마 코드를 안 싣는다 — 호출을 붙잡아 판을 세운다).
 *
 * 2. **가짜 origin 밖 요청 차단(`context.route(… route.abort())`)이 WebSocket · WebRTC 를 안 막는다.** playwright 의 `context.route`
 *    는 fetch · 하위 자원만 가로채고 WebSocket 핸드셰이크와 WebRTC ICE(STUN · TURN)는 그 아래로 빠진다. 이 브랜치가 브라우저에서
 *    돌리는 테마 코드가 `new WebSocket(…)` · `new RTCPeerConnection({ iceServers })` 로 **테마 작성자가 고른 주소에 실제로 소켓을
 *    연다** — 서버의 헤드리스 Chromium 이 바깥으로 나간다. 그 채널의 존재 이유(`screen-render-chromium.ts` 머리말 「바깥으로 나가는
 *    요청을 막는다」)를 정면으로 뚫는다. 여기서는 127.0.0.1 리스너로 «소켓이 열렸다» 만 센다 — 운영에서는 실제 공인 주소다.
 *
 * **2 는 아직 빨강이다**(고칠 방향: 첫 그림 전 초기화 스크립트에서 `WebSocket` · `RTCPeerConnection` · `EventSource` 를 지운다).
 */
import { createServer, type Socket } from 'node:net'
import { createSocket } from 'node:dgram'
import { installCatalog, type PageDocument } from '@wirebound/schema'
import { chromium, type Browser, type Page } from 'playwright-core'
import { describe, expect, it } from 'vitest'
import { chromiumScreenRenderer, KOREAN_GLYPH_PROBE } from '../src/services/screen-render-chromium'
import { KOREAN_PROBE_FAILED } from '../src/services/screen-render'
import { readApiEnvFile } from '../test/test-database-url'
import { bundled, inlineTheme, jobOf } from './screen-jobs'

installCatalog()

function screenChromiumPath(): string | undefined {
  const value = process.env.SCREEN_CHROMIUM_PATH ?? readApiEnvFile().SCREEN_CHROMIUM_PATH
  return value === undefined || value === '' ? undefined : value
}
const EXECUTABLE_PATH = screenChromiumPath()
const LAUNCH = EXECUTABLE_PATH === undefined ? {} : { executablePath: EXECUTABLE_PATH }

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
  console.log('[screen-sandbox-review] Chromium 을 띄우지 못해 건너뛴다 — `screen-chromium.test.ts` 와 같은 넣는 법')
}

/** **렌더러가 쓰는 그 `Page` 클래스** — 같은 `playwright-core` 모듈이다(`Page` 는 값으로 안 내보낸다). 호출 하나를 붙잡는 데 쓴다. */
async function pageClass(): Promise<{ evaluate: Page['evaluate'] }> {
  const probe = await chromium.launch(LAUNCH)
  try {
    return Object.getPrototypeOf(await probe.newPage()) as { evaluate: Page['evaluate'] }
  } finally {
    await probe.close()
  }
}

const doc = (): PageDocument =>
  ({ version: 1, root: { id: 'n_p', type: 'Page', children: [{ id: 'n_t', type: 'Text', props: { content: '한글 본문' } }] } }) as unknown as PageDocument

describe.skipIf(!있다)('내보내기 화면 샌드박스', () => {
  /**
   * 테마 코드가 `data-wb-failed` 읽기를 끝나지 않는 Promise 로 바꾼다. render 는 한 장의 한도(2s) 안에 그 장을 **실패**로 끝내고
   * 돌아와야 한다. 그 읽기를 한도 없이 두면 render 가 영영 안 끝난다 — 멀쩡한 둘째 장은 다 그려도 배치가 멈춘다(8s 가드에 `hung`).
   */
  it('준비 뒤 data-wb-failed 읽기가 멈추면 그 장만 실패하고 배치는 한도 안에 끝난다', async () => {
    const trap = inlineTheme({
      id: 'evaluate-trap',
      before: `const g = Element.prototype.getAttribute; Element.prototype.getAttribute = function (n) { return n === 'data-wb-failed' ? new Promise(() => {}) : g.call(this, n) }`,
    })
    const launched: Browser[] = []
    const original = chromium.launch.bind(chromium)
    ;(chromium as unknown as { launch: typeof chromium.launch }).launch = (async (o?: Parameters<typeof chromium.launch>[0]) => {
      const b = await original(o)
      launched.push(b)
      return b
    }) as typeof chromium.launch
    const timeoutMs = 2000
    const rendering = chromiumScreenRenderer({ ...LAUNCH, timeoutMs, concurrency: 2 }).render(
      jobOf(bundled('덫', doc(), trap), bundled('멀쩡', doc())),
    )
    let verdict: 'hung' | 'returned' = 'hung'
    try {
      // 배치가 한 장의 한도의 네 배(8s) 안에 끝나야 한다. 안 끝나면 결함이다.
      const got = await Promise.race([
        rendering.then((batch) => ({ batch })),
        new Promise<'guard'>((r) => setTimeout(() => r('guard'), timeoutMs * 4)),
      ])
      if (got !== 'guard') {
        verdict = 'returned'
        const reasons = got.batch.results.map((x) => (x.ok ? 'ok' : x.reason))
        expect(reasons[0]).toContain('준비되지 않았습니다')
      }
    } finally {
      ;(chromium as unknown as { launch: typeof chromium.launch }).launch = original
      for (const b of launched.splice(0)) await b.close().catch(() => {})
      rendering.catch(() => {})
    }
    expect(verdict).toBe('returned')
  }, 30_000)

  /**
   * 두부 물음의 `evaluate` 도 한도 안이다 — 물음 페이지는 테마 코드를 안 싣지만 `evaluate` 는 한도를 안 받으므로 브라우저가 답하지 않으면
   * 배치가 멈춘다. 그 호출을 끝나지 않게 만든 판(`Page.prototype.evaluate` 를 감쌈)에서 render 가 «못 물었다»로 돌아와야 한다.
   */
  it('두부 물음이 답하지 않으면 한도 안에 «못 물었다»로 돌아온다', async () => {
    const proto = await pageClass()
    const original = proto.evaluate
    let held = 0
    proto.evaluate = function (this: Page, expression: unknown, arg?: unknown) {
      if (expression === KOREAN_GLYPH_PROBE) {
        held += 1
        return new Promise(() => {})
      }
      return original.call(this, expression as string, arg)
    } as Page['evaluate']
    const timeoutMs = 1500
    const rendering = chromiumScreenRenderer({ ...LAUNCH, timeoutMs }).render(jobOf(bundled('멀쩡', doc())))
    rendering.catch(() => {})
    let got: Awaited<typeof rendering> | 'guard'
    try {
      got = await Promise.race([rendering, new Promise<'guard'>((r) => setTimeout(() => r('guard'), timeoutMs * 4))])
    } finally {
      proto.evaluate = original
    }
    expect(held).toBe(1)
    expect(got === 'guard' ? 'guard' : got.results.map((x) => (x.ok ? 'ok' : x.reason))).toEqual([
      `${KOREAN_PROBE_FAILED}: ${timeoutMs}ms 안에 답이 없습니다`,
    ])
  }, 30_000)

  /**
   * 테마 코드가 WebSocket · WebRTC(STUN · TURN)를 127.0.0.1 리스너로 연다. 차단이 온전하면 **어느 소켓도 리스너에 닿지 않아야**
   * 한다. 지금은 세 채널 모두 실제로 소켓을 연다(운영에서는 공인 주소로 나간다).
   */
  it('테마 코드의 WebSocket · WebRTC 는 바깥으로 소켓을 열지 못한다', async () => {
    const tcpHits: number[] = []
    const tcp = createServer((s: Socket) => {
      tcpHits.push(1)
      s.destroy()
    })
    tcp.on('error', () => {})
    await new Promise<void>((r) => tcp.listen(0, '127.0.0.1', r))
    const wsPort = (tcp.address() as { port: number }).port
    const turn = createServer((s: Socket) => {
      tcpHits.push(1)
      s.destroy()
    })
    turn.on('error', () => {})
    await new Promise<void>((r) => turn.listen(0, '127.0.0.1', r))
    const turnPort = (turn.address() as { port: number }).port
    const udpHits: number[] = []
    const udp = createSocket('udp4')
    udp.on('message', () => udpHits.push(1))
    await new Promise<void>((r) => udp.bind(0, '127.0.0.1', r))
    const stunPort = (udp.address() as { port: number }).port

    const before = [
      `try { new WebSocket('wss://127.0.0.1:${wsPort}/exfil') } catch (e) {}`,
      `try { const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:127.0.0.1:${stunPort}' }, { urls: 'turn:127.0.0.1:${turnPort}?transport=tcp', username: 'u', credential: 'c' }] }); pc.createDataChannel('x'); pc.createOffer().then((o) => pc.setLocalDescription(o)) } catch (e) {}`,
    ].join('; ')
    try {
      const batch = await chromiumScreenRenderer({ ...LAUNCH, timeoutMs: 6000, concurrency: 1 }).render(
        jobOf(bundled('바깥 채널', doc(), inlineTheme({ id: 'net-channels', before }))),
      )
      // 그 장은 그려진다(차단이 온전하면 채널이 열리기만 실패). 늦은 소켓까지 본다.
      await new Promise((r) => setTimeout(r, 2500))
      expect(batch.results[0]?.ok).toBe(true)
      expect({ tcp: tcpHits.length, udp: udpHits.length }).toEqual({ tcp: 0, udp: 0 })
    } finally {
      tcp.close()
      turn.close()
      udp.close()
    }
  }, 40_000)
})
