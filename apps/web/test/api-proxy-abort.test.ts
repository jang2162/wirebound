// @vitest-environment node
// **node 환경이다** — `vite.config.ts` 로 진짜 dev 서버를 띄운다(jsdom 에서는 그 로더가 싣는
// `@vitejs/plugin-react` 가 죽는다 — `api-proxy-target.test.ts` 머리말과 같은 사정).
/**
 * **브라우저가 끊으면 개발 프록시가 api 쪽 연결도 끊는다** — `vite.config.ts` 의 `'/api'` 엔트리
 * `configure` 훅. 그 훅이 왜 있는지는 그 자리의 주석이 갖는다.
 *
 * # 왜 서버를 띄우는가
 *
 * 훅은 **임의의 함수**다 — 설정의 글자나 값으로는 «끊음이 상류까지 가는가»를 답하지 못한다
 * (`api-proxy-target.test.ts` ws 절 «왜 설정을 읽지 않고 서버를 띄우는가»). 그래서 이 저장소의
 * `vite.config.ts` 를 **그대로** 띄우고 대상만 가짜 상류로 돌린 뒤, 클라이언트가 끊었을 때 **상류가
 * `close` 를 받는지**를 본다. vite 의 `mergeConfig` 가 엔트리를 깊게 합치므로 `configure` 는 파일의
 * 것 그대로 돈다.
 *
 * 잰 값(가짜 상류가 답을 붙잡은 GET · 300ms 에 끊음):
 *
 * | 훅 | 상류가 본 것 |
 * |---|---|
 * | 없다 | 끊긴 뒤에도 **아무것도 안 온다** — 상류가 제 할 일을 끝까지 하고 답한 뒤에야 닫힌다 |
 * | 있다 | 끊고 수 ms 안에 `close` · 응답은 못 끝냄 |
 *
 * 다시 재는 법: `vite.config.ts` 의 훅을 지우고 이 파일을 돈다(아래 판정 케이스가 한도에서 죽는다).
 *
 * 실제 api 로는(내보내기 미리보기 · 400ms 에 끊음): 훅이 없으면 api 가 `200` 으로 끝까지 돌고, 있으면
 * «요청이 끊겨 내보내기를 멈췄다»가 끊은 직후에 찍힌다 — api 에 직접 보내고 끊은 판과 같다.
 * 다시 재는 법: api 와 `vite` 를 띄우고 무거운 프로젝트의 `GET …/export/preview` 를 프록시를 거쳐
 * 보낸 뒤 끊고 api 로그를 본다.
 *
 * # 이 자가 못 보는 것
 *
 * - **운영의 앞단.** 운영에서 끊음을 전하는 것은 같은 오리진 앞단(리버스 프록시)인데 그 설정이
 *   저장소에 없다. 여기서 재는 것은 개발 프록시뿐이다.
 * - **api 가 끊긴 요청을 어떻게 다루는가.** 상류가 가짜다. 내보내기가 일을 버리는 것은
 *   `apps/api/test/export-worker-abort.test.ts` 가 진짜 포트로 잰다. 끊긴 쓰기는 api 가 끝까지
 *   커밋한다 — 프록시를 거치든 직접이든 같다(실제 api 로 잰 값 — 이 파일은 그것을 안 잰다).
 * - **상류 소켓이 붙기 전의 끊김.** 훅은 http-proxy 의 `proxyReq`(상류 소켓이 붙을 때 난다)에서
 *   걸린다. 그보다 먼저 끊긴 요청에는 훅이 없다. 그 창을 만드는 하네스는 없다.
 * - **`Expect` 헤더가 실린 요청.** http-proxy 가 그때 `proxyReq` 를 안 내므로 훅이 안 걸린다(vite 가
 *   묶은 http-proxy 의 원문에서 읽은 것이다 — 재지 않았다). 브라우저의 `fetch` 는 그 헤더를 안 싣는다.
 * - **업그레이드.** 업그레이드는 `proxyReqWs` 로 따로 가서 이 훅을 안 지난다. 업그레이드가 상류까지
 *   가는지는 `api-proxy-target.test.ts` 의 ws 절이 이 설정 그대로 잰다.
 * - **실브라우저.** 클라이언트는 Node 의 `fetch` 다. 브라우저가 끊을 때 연결을 닫는지는 여기서 안 잰다.
 * - **`writableEnded` 류의 가드 유무.** 훅에 «다 보낸 뒤면 끊지 않는다» 가드를 더해도 이 파일은 전부
 *   초록이다 — 다 보낸 뒤의 `destroy()` 는 끝난 요청에 닿아 아무것도 안 바꾸므로 가를 것이 없다
 *   (`vite.config.ts` 의 그 훅 주석). 가드를 잠그는 케이스를 세우지 않은 까닭이다.
 * - **`build`·`preview`** 는 안 본다. `serve` 다.
 */
import { type IncomingMessage, type ServerResponse, createServer as createHttpServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'
import { type ProxyOptions, createServer as createViteServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const WEB_ROOT = fileURLToPath(new URL('../', import.meta.url))
const WEB_CONFIG_FILE = fileURLToPath(new URL('../vite.config.ts', import.meta.url))

/** 상류가 답을 **붙잡는** 경로 — 끊김이 오기 전에는 절대 답하지 않는다. */
const HOLD_URL = '/api/abort-probe/hold'
/** 상류가 **조금 뒤에** 답하는 경로. 그 사이 요청 본문은 이미 다 갔다. */
const SLOW_URL = '/api/abort-probe/slow'
/** 느린 답이 기다리는 시간(ms). 요청 본문이 다 가고도 한참 남는다. */
const SLOW_REPLY_MS = 200
/** 느린 경로에 실어 보내는 본문. 상류가 **다 받았는지** 센다. */
const SLOW_BODY = 'x'.repeat(4096)
/** 스텁 상류만 낼 수 있는 답. */
const SLOW_REPLY = 'stub-slow-reply'
/**
 * 끊은 뒤 상류의 `close` 를 기다리는 한도(ms). 훅이 있으면 수 ms 안에 온다 — 없으면 **영영 안 오므로**
 * 이 한도가 판정을 끝낸다.
 */
const CLOSE_WAIT_MS = 2_000

/**
 * 한도(`CLOSE_WAIT_MS`) 안에 풀리면 그 값, 아니면 `missing` 이다 — 판정이 vitest 의 시간 제한에 걸려
 * 죽지 않고 **무엇이 안 왔는지**를 말하게 한다.
 */
async function within<T>(promise: Promise<T>, missing: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(missing)), CLOSE_WAIT_MS)
  })
  try {
    return await Promise.race([promise, late])
  } finally {
    clearTimeout(timer)
  }
}

/** 상류가 한 요청에서 본 끝. */
interface UpstreamEnd {
  /** 상류가 답을 다 보낸 뒤에 닫혔나. */
  finished: boolean
}

interface Sighting {
  req: IncomingMessage
  res: ServerResponse
  body: string
  ended: Promise<UpstreamEnd>
}

describe('브라우저가 끊으면 개발 프록시가 api 쪽 연결도 끊는다', () => {
  let viteServer: ViteDevServer
  let upstream: Server
  let stubTarget = ''
  let viteOrigin = ''
  /** **요청을 보내기 전**의 `'/api'` 엔트리 — http-proxy 가 첫 요청에서 `target` 을 제자리 바꾼다. */
  let configuredEntry: ProxyOptions | undefined
  /** 경로마다 기다리는 자. 요청이 상류에 닿으면 풀린다. */
  const waiting = new Map<string, (sighting: Sighting) => void>()
  /** 상류가 본 요청 전부 — 끝날 때 붙잡은 답을 닫는다. */
  const seen: Sighting[] = []

  function expectArrival(url: string): Promise<Sighting> {
    return new Promise<Sighting>((resolve) => waiting.set(url, resolve))
  }

  beforeAll(async () => {
    upstream = createHttpServer((req, res) => {
      const url = req.url ?? ''
      const ended = new Promise<UpstreamEnd>((resolve) => {
        res.on('close', () => resolve({ finished: res.writableFinished }))
      })
      let body = ''
      req.setEncoding('utf8')
      req.on('data', (chunk: string) => {
        body += chunk
      })
      const sighting: Sighting = { req, res, ended, get body() { return body } }
      seen.push(sighting)
      waiting.get(url)?.(sighting)
      if (url === SLOW_URL) {
        req.on('end', () => {
          setTimeout(() => {
            if (!res.destroyed) res.end(SLOW_REPLY)
          }, SLOW_REPLY_MS)
        })
      }
      // `HOLD_URL` 은 답하지 않는다 — 끊김만이 이 요청을 끝낸다.
    })
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
    stubTarget = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`

    viteServer = await createViteServer({
      root: WEB_ROOT,
      configFile: WEB_CONFIG_FILE,
      logLevel: 'error',
      // `api-proxy-target.test.ts` ws 절과 같은 이유 — 이 하네스는 모듈을 요청하지 않는데 스캐너가
      // 배경에서 `index.html` 을 훑다가 `close()` 와 경합한다.
      optimizeDeps: { noDiscovery: true, include: [] },
      // **바꾸는 값은 `target` 하나다.** `configure` 를 비롯한 나머지는 파일에서 온 값 그대로다.
      server: { proxy: { '/api': { target: stubTarget } } },
    })
    const entry = viteServer.config.server.proxy?.['/api']
    configuredEntry = typeof entry === 'object' ? { ...entry } : undefined
    await viteServer.listen()
    const address = viteServer.httpServer?.address() as AddressInfo
    viteOrigin = `http://${address.family === 'IPv6' ? `[${address.address}]` : address.address}:${address.port}`
  }, 30_000)

  afterAll(async () => {
    // 붙잡은 답이 남아 있으면 닫는다 — 안 닫으면 `upstream.close()` 가 끝나지 않는다.
    for (const sighting of seen) sighting.res.destroy()
    await viteServer?.close()
    upstream?.closeAllConnections()
    await new Promise<void>((resolve) => {
      if (!upstream?.listening) {
        resolve()
        return
      }
      upstream.close(() => resolve())
    })
  })

  /**
   * **카나리아이지 독립된 축이 아니다** — 아래 두 케이스가 죽었을 때 *왜* 죽었는지를 가른다. 엉뚱한
   * 설정을 띄웠거나 대상이 안 갈리면 요청이 실서버로 나가 가짜 상류는 아무것도 못 보고, 그때 아래
   * 두 케이스가 «요청이 상류에 안 닿았다»로 함께 죽는다.
   */
  it('카나리아 — 이 저장소의 설정을 띄웠고 대상만 가짜 상류로 갈렸다', () => {
    expect(viteServer.config.configFile?.replace(/\\/g, '/')).toMatch(/apps\/web\/vite\.config\.ts$/)
    expect(configuredEntry?.target).toBe(stubTarget)
  })

  /**
   * **이 파일의 판정이다.** 본문은 다 갔고 상류가 아직 답하지 않은 동안 끊는다 — http-proxy 가 스스로
   * 못 전하는 바로 그 창이다. 훅을 지우면 상류는 `close` 를 영영 못 받아 한도에서 죽는다.
   */
  it('답이 오기 전에 끊으면 상류가 곧 `close` 를 받는다 — 응답은 못 끝낸 채다', async () => {
    const arrival = expectArrival(HOLD_URL)
    const controller = new AbortController()
    const request = fetch(`${viteOrigin}${HOLD_URL}`, { signal: controller.signal }).catch((error: unknown) => error)
    const sighting = await within(arrival, '요청이 상류에 안 닿았다')

    controller.abort()
    expect(await request).toBeInstanceOf(Error)

    expect(await within(sighting.ended, '끊었는데 상류가 close 를 못 받았다')).toEqual({ finished: false })
  })

  /**
   * **다 받는 요청은 온전해야 한다.** 이 케이스가 잠그는 것은 끊음이 아니라 **끊지 말아야 할 때**다 —
   * 훅이 없어도 초록이다. 죽는 판:
   *
   * - 훅을 `req` 의 `close` 에 건다 — `req` 의 `close` 는 본문을 다 읽으면 나서 상류가 답하기 전에 모든
   *   요청을 끊는다. 이 요청은 vite 의 500 을 받는다(위 판정 케이스도 함께 죽는다).
   * - 상류를 시간으로 끊는다 — 엔트리에 `proxyTimeout` 을 느린 답보다 짧게 두면 **이 케이스만** 500 으로
   *   죽는다. 쓰기 장부의 시간 제한(`src/panels/write-ledger.tsx` 의 `WRITE_DEADLINE_MS`)은 브라우저가
   *   정한다 — 프록시가 그보다 먼저 끊으면 멀쩡한 쓰기가 «모름»이 된다.
   */
  it('끊지 않은 요청은 끝까지 간다 — 본문을 다 보내고 상류의 답을 다 받는다', async () => {
    const arrival = expectArrival(SLOW_URL)
    const response = await fetch(`${viteOrigin}${SLOW_URL}`, {
      method: 'POST',
      body: SLOW_BODY,
      signal: AbortSignal.timeout(CLOSE_WAIT_MS + SLOW_REPLY_MS),
    })
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(SLOW_REPLY)

    const sighting = await within(arrival, '요청이 상류에 안 닿았다')
    expect(sighting.body).toBe(SLOW_BODY)
    expect(await within(sighting.ended, '상류가 닫히지 않았다')).toEqual({ finished: true })
  })
})
