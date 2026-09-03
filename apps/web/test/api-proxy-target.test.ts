// @vitest-environment node
// **이 파일만 node 환경이다** — 이 프로젝트의 기본은 jsdom 이다(루트 `vitest.config.ts`).
// 아래 ws 절이 `vite.config.ts` 로 **진짜 dev 서버를 띄운다.** 그 로더는
// `@vitejs/plugin-react` 를 실제로 import 하는데, jsdom 안에서는 거기서 esbuild 가 invariant 로
// 죽는다(리뷰어가 값으로 확인했다). 소켓·`http.Server` 도 노드 것이어야 한다.
// 위 절들은 DOM 을 안 쓰므로 잃는 것이 없다.
import { createHash, randomBytes } from 'node:crypto'
import { type IncomingMessage, createServer as createHttpServer, type Server } from 'node:http'
import { type AddressInfo, connect as netConnect } from 'node:net'
import { fileURLToPath } from 'node:url'
import { type ProxyOptions, createServer as createViteServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_API_PORT, resolveApiPort, resolveApiProxyTarget } from '../config/api-proxy-target'
// `?raw`는 vite가 파일 원문을 문자열로 넣어 준다 — `shell-css.test.ts`·`store-access.test.ts`와
// 같은 관용구다. **원문을 보는 것은 아래 배선 두 절뿐이다** — ws 절은 원문도 값도 아닌
// **되돌아온 바이트**를 본다(그 이유는 그쪽 머리말에 있다).
import viteConfigSource from '../vite.config.ts?raw'
// **주석을 걷고 센다.** 안 걷으면 옳은 줄을 주석에 남기고 아래에서 뒤집는 우회가 통째로
// 지나간다 — 리뷰어가 실측했다(귀속: 리뷰 델타 W4: `.env`의 3067 이 셸의 3099 를 이기는데
// 13/13 통과). 이 저장소의 인구조사가 쓰는 자가 이미 있다.
import { stripComments } from './store-access-guard'

/**
 * `apps/web` 옆의 api 패키지. **`vite.config.ts`가 `'../api/.env'`로 타는 그 상대 홉이
 * 실재하는지**를 이 glob 이 증명한다 — 여기 기준은 `apps/web/test/`라 한 겹이 더 붙는다.
 * 경로가 어긋나면 이 자리가 빈 객체가 된다.
 *
 * **`.env.example` 로는 못 잰다** — vite 가 `.env*` 를 `server.fs.deny` 로 막아
 * `Denied ID …/.env.example?raw` 로 죽는다(쟀다). 그래서 같은 디렉터리의 추적 파일 중
 * 가장 안 움직이는 것을 쓴다.
 */
const API_PACKAGE = import.meta.glob('../../api/package.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/**
 * 프록시 대상이 **한 자리에서 오는지**를 잰다.
 *
 * 이 자를 세운 이유는 실측이다(2026-08-19 보고 §2.2): 워크트리 둘을 띄우고 대상이
 * 박혀 있는 채로 두면 **B의 에디터에서 B의 계정이 401이고 A의 계정이 200**이었다.
 * vite도 api도 아무 말을 안 했다 — 그래서 이 파일이 있다.
 */
describe('프록시 대상은 apps/api/.env 의 PORT 한 자리에서 온다', () => {
  it('아무 값도 없으면 오늘과 같다 — 3001 (D6: .env 를 안 만든 사람이 깨지면 안 된다)', () => {
    expect(resolveApiPort({})).toBe('3001')
    expect(resolveApiPort()).toBe(DEFAULT_API_PORT)
    expect(resolveApiProxyTarget({})).toBe('http://127.0.0.1:3001')
  })

  it('.env 의 PORT 를 따라간다 — 손으로 맞추지 않는다', () => {
    expect(resolveApiProxyTarget({ fileEnv: { PORT: '3011' } })).toBe('http://127.0.0.1:3011')
  })

  it('셸 환경변수가 .env 를 이긴다 — api 의 --env-file-if-exists 와 같은 순서다', () => {
    // 실측: `PORT=3031 pnpm --filter @wirebound/api start`는 .env 의 PORT=3032 를 무시하고
    // 3031 을 열려다 EADDRINUSE 로 죽었다. 두 실행자가 같은 답을 내야 한다.
    expect(resolveApiPort({ shellEnv: { PORT: '3031' }, fileEnv: { PORT: '3032' } })).toBe('3031')
  })

  it('빈 문자열은 "안 줬다"와 같은 뜻이다 — 셸 쪽도 파일 쪽도', () => {
    expect(resolveApiPort({ shellEnv: { PORT: '' }, fileEnv: { PORT: '3011' } })).toBe('3011')
    expect(resolveApiPort({ shellEnv: { PORT: '' }, fileEnv: { PORT: '' } })).toBe('3001')
  })

  it('PORT 가 없는 키로 들어와도(undefined) 기본값이다', () => {
    expect(resolveApiPort({ shellEnv: { HOST: '127.0.0.1' }, fileEnv: { DATABASE_URL: 'postgres://x' } })).toBe('3001')
  })

  it('숫자가 아니면 조용히 기본값으로 물러나지 않고 죽는다 — 어느 자리 값인지 말한다', () => {
    // 조용히 3001 로 물러나면 api 는 (zod 가 같은 값을 거부해서) 안 뜨는데 에디터만 떠서
    // 이 파일이 없애려는 "둘이 다른 답을 낸다"를 그대로 다시 만든다.
    expect(() => resolveApiPort({ fileEnv: { PORT: '삼천일' } })).toThrow(/apps\/api\/\.env의 PORT/)
    expect(() => resolveApiPort({ shellEnv: { PORT: '30 01' } })).toThrow(/셸 환경변수 PORT/)
    expect(() => resolveApiPort({ fileEnv: { PORT: '3001;DROP' } })).toThrow(/3001;DROP/)
  })

  it('대상 호스트는 루프백이다 — apps/api 의 HOST 를 따라가지 않는다', () => {
    // HOST 의 흔한 값 `0.0.0.0`은 바인딩 주소이지 붙을 주소가 아니다.
    expect(resolveApiProxyTarget({ fileEnv: { PORT: '3011', HOST: '0.0.0.0' } })).toBe('http://127.0.0.1:3011')
  })
})

/**
 * **여기서부터가 배선이다.** 위의 케이스들은 규칙(`resolveApiPort`)을 재고, 아래는
 * **그 규칙에 무엇을 넣어 프록시에 꽂는가**를 잰다.
 *
 * 앞 판에는 이 자가 없었다. 리뷰가 `vite.config.ts`의 조립 한 줄에서 `shellEnv`와
 * `fileEnv`를 뒤집자 **게이트 넷이 전부 초록인 채로** 파일이 셸을 이기게 됐다
 * (귀속: 리뷰 §9 R3 — `.env`에 `PORT=3063`, 셸에 `PORT=3099`를 건 상태에서
 * 원본은 `3099`, 변이는 `3063`을 프록시 대상으로 찍었다). **D1이 없애려던 것이
 * 정확히 그 어긋남이다.**
 *
 * **규칙이 맞아도 그것을 안 꽂으면 교차가 되살아난다** — 이 슬라이스의 요점이 배선이다.
 */
describe('배선 — 규칙을 무엇으로 불러 어디에 꽂는가', () => {
  /** **주석을 걷은** 원문. 아래 케이스는 전부 이것만 본다. */
  const source = stripComments(viteConfigSource)

  /** `resolveApiProxyTarget({ ... })`의 인자 객체를 키 → 값으로 읽는다. */
  function wiring(): Record<string, string> {
    const match = source.match(/resolveApiProxyTarget\(\{([^}]*)\}\)/)
    if (match?.[1] === undefined) {
      return {}
    }
    return Object.fromEntries(
      match[1]
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
        .map((entry) => {
          const [key, ...rest] = entry.split(':')
          return [(key ?? '').trim(), rest.join(':').trim()]
        }),
    )
  }

  it('자가 진짜 소스를 읽는다 — `?raw` 가 빈 문자열이면 아래가 통째로 헛돈다', () => {
    // 실제로 난 사고다: `shell.css?raw`가 빈 문자열이라 심기 37개가 전부 초록이었다
    // (`store-access.test.ts` 머리말). 그래서 이 카나리아가 먼저 온다.
    expect(viteConfigSource.length).toBeGreaterThan(200)
    expect(source).toContain('export default defineConfig(')
    // 호출이 **하나뿐**이어야 한다 — 둘이면 첫 번째만 보고 두 번째가 조용히 이긴다.
    expect(source.match(/resolveApiProxyTarget\(/g)).toHaveLength(1)
    expect(Object.keys(wiring()).sort()).toEqual(['fileEnv', 'shellEnv'])
  })

  it('**셸을 `shellEnv` 에, 파일을 `fileEnv` 에 넣는다** — 뒤집히면 파일이 셸을 이긴다', () => {
    expect(wiring().shellEnv).toBe('process.env')
    expect(wiring().fileEnv).toBe('readApiEnvFile()')
  })

  it('둘을 바꿔 넣지 않는다 — 뒤집기를 양쪽에서 못박는다', () => {
    expect(wiring().shellEnv).not.toContain('readApiEnvFile')
    expect(wiring().fileEnv).not.toBe('process.env')
  })

  it('계산한 값이 **실제로 프록시 대상이 된다** — 구해 놓고 안 쓰면 소용이 없다', () => {
    expect(source).toMatch(/const apiProxyTarget = resolveApiProxyTarget\(/)
    expect(source).toMatch(/'\/api':\s*\{\s*target:\s*apiProxyTarget\b/)
  })

  it('대상을 수로 박아 두지 않는다 — 이 슬라이스가 걷어 낸 것이 그것이다', () => {
    const proxyLine = source.split('\n').find((line) => line.includes("'/api':")) ?? ''
    expect(proxyLine).not.toMatch(/\d{4}/)
  })

  it('뜰 때 그 대상을 말한다 — 두 터미널을 나란히 놓은 사람이 눈으로 가른다 (D4)', () => {
    expect(source).toContain('API 프록시')
    expect(source).toMatch(/API 프록시[^\n]*\$\{apiProxyTarget\}/)
  })
})

/**
 * **배선이 가리키는 자리 자체를 잰다** — api 쪽 `test-database-url.test.ts`의 같은 절과 짝이다.
 *
 * 리뷰어가 열어 뒀다(귀속: 리뷰 델타 W6): `new URL('../api/.env', import.meta.url)`을 없는
 * 파일로 바꿔도 **13/13 통과**였고, 행동으로는 `.env`가 무시되어 **에디터가 3001로 조용히
 * 물러난다.** 워크트리를 여럿 띄운 사람에게 그것은 §2.2의 교차가 그대로 되살아나는 것이다.
 *
 * 파일이 없는 것은 정상이므로(D6) 재는 축은 **가리키는 자리**다.
 */
describe('배선이 가리키는 자리', () => {
  const source = stripComments(viteConfigSource)

  it('`apps/api/.env` 를 상대 경로로 탄다 — 그 한 줄이 바뀌면 여기서 걸린다', () => {
    expect(source).toContain("new URL('../api/.env', import.meta.url)")
  })

  it('그 상대 홉이 **실재하는 api 패키지**로 간다 — 문자열만 맞는 것이 아니다', () => {
    // `.env` 자체는 gitignore 라 없을 수 있다(D6). 디렉터리가 맞는지만 본다.
    const [, manifest] = Object.entries(API_PACKAGE)[0] ?? []
    expect(manifest).toBeDefined()
    expect(manifest).toContain('"@wirebound/api"')
  })

  it('그 파일을 읽는 자가 하나뿐이다 — 두 자리에서 읽으면 한쪽만 고쳐진다', () => {
    expect(source.match(/new URL\('\.\.\/api\/\.env'/g)).toHaveLength(1)
    // 선언(`function readApiEnvFile()`)은 빼고 **부르는 자리**만 센다.
    expect(source.match(/(?<!function )readApiEnvFile\(\)/g)).toHaveLength(1)
  })
})

/**
 * **업그레이드도 이 프록시를 타야 한다** — `ws: true` 가 그 한 줄이다.
 *
 * # 없으면 무엇이 보이는가 (2026-09-03 실측)
 *
 * 서버의 실시간 라우트는 `/api/projects/:projectId/ws` 라 `'/api'` 컨텍스트에 **맞는다.**
 * 그런데 vite 의 프록시는 업그레이드를 **따로** 다루고, 그 자리에서 한 번 더 묻는다
 * (`vite/dist/node/chunks/dep-*.js` 의 `httpServer.on("upgrade", …)`):
 *
 * ```js
 * for (const context in proxies) {
 *   if (doesProxyContextMatchUrl(context, url)) {
 *     const [proxy, opts] = proxies[context]
 *     if (opts.ws || opts.target?.toString().startsWith("ws:") || …startsWith("wss:")) {
 *       …; proxy.ws(req, socket, head); return    // ← 여기 못 오면
 *     }
 *   }
 * }                                               // ← 그냥 루프가 끝난다
 * ```
 *
 * **셋 다 거짓이면 그 핸들러는 아무것도 안 하고 그냥 빠져나온다.** 소켓을 닫지도,
 * 상태 코드를 쓰지도 않는다. 그래서 실패가 **조용하다**:
 *
 * | 잰 것 | 값 |
 * |---|---|
 * | 원시 업그레이드 요청(5173) | **응답 바이트 0** · 3초 타임아웃 |
 * | 브라우저 `new WebSocket(…)` | 6초 뒤 `readyState=0 (CONNECTING)` · **open·error·close 어느 것도 안 옴** |
 * | api 로그의 그 요청 | **없다** — 서버까지 가지 않는다 |
 * | 직접 api 로(3002) 같은 요청 | `101 Switching Protocols` + `joined`·`presence`·`locks` |
 *
 * `onclose` 가 안 오므로 `connection.ts` 의 재연결도 안 탄다 — 화면은 *"붙는 중"* 에서
 * 영원히 멈춘다. **협업 잠금(§7.2)과 WS 편집(§7.1)이 통째로 죽는데 아무도 말하지 않는다.**
 *
 * # 자가 세 번 뒤집혔다 — 왜 결국 **서버를 띄우는가**
 *
 * | 판 | 방법 | 반증 워커가 뚫은 수 |
 * |---|---|---|
 * | 1 | `?raw` 원문을 정규식(`[^}]*`)으로 훑어 `ws: true` 라는 **글자**를 찾는다 | 거짓 **빨강** |
 * | 2 | 손으로 중괄호를 세어 엔트리를 정확히 자른다 | 거짓 초록 **9** |
 * | 3 | `resolveConfig` 로 **값**을 읽고 vite 의 매칭 규칙을 **옮겨** 적용한다 | 거짓 초록 **4** |
 * | 4 (지금) | **스텁 상류 + 진짜 vite dev 서버 + 원시 업그레이드 바이트** | — |
 *
 * 2판이 뚫린 아홉은 악의가 필요한 모양이 아니었다 — 같은 객체의 **중복 키**(뒤엣것이
 * 런타임에서 이기는데 자는 앞엣것을 읽는다), `preview.proxy` 를 `server` 앞에 둔 것,
 * **로그 문자열 안의 같은 글자**, `agent: { ws: true }` 같은 **중첩**,
 * `...(false ? { ws: true } : {})` **죽은 가지**, 그리고 `rewrite: (p) => p.replace(/^https?:\/\//, '')`
 * — `stripComments` 가 정규식을 모르고 `//` 뒤를 지워 엔트리의 `}` 를 없애 버린다.
 * 최악은 `'/api': { …, ws: false, todo: 'ws: true' }` 였다: **설정이 실시간을 끄고 있는데
 * 「ws 가 켜져 있다」가 20/20 초록**이었다.
 *
 * 3판은 그 아홉을 전부 닫았고 **옮긴 규칙 자체는 충실했다**(vite 6.4.3 원문과 대조했다).
 * 그래도 넷이 남았는데, 그 넷은 파싱이나 값 읽기로 닫을 수 있는 것이 아니다 —
 * **자가 안 보는 프록시 옵션**이다:
 *
 * | 갈래 | 3판(값) | 라이브(바이트) |
 * |---|---|---|
 * | `bypass` — vite **공식 문서 예제 그대로**. 업그레이드엔 `Accept` 가 없어 던지고 `return` | 20/20 초록 | **바이트 0** |
 * | `configure: (_p, options) => { options.ws = false }` | 20/20 초록 | **바이트 0** |
 * | `rewrite: (p) => p.replace(/^\/api/, '')` | 20/20 초록 | 101 이지만 상류가 `/projects/…/ws` 를 받는다 → 실서버면 **404** |
 * | `configureServer` 가 `server.config.server.proxy` 를 만짐 | 20/20 초록 | **바이트 0** |
 *
 * `bypass`·`configure`·`rewrite` 는 **임의의 함수**다. 값으로도 못 읽는다. 그리고
 * **이 `vite.config.ts` 에는 이미 `configureServer` 플러그인(배너)이 있다** — 넷째 갈래가
 * 이 파일에서 실제로 가능한 모양이라는 뜻이다.
 *
 * **「업그레이드가 상류까지 가는가」는 설정을 읽어서 답할 수 있는 질문이 아니다.**
 * 그래서 이 절은 vite 자신이 판정하게 한다: **스텁 상류**를 세우고 이 저장소의
 * `vite.config.ts` 를 **그대로** 실행해 진짜 dev 서버를 띄운 뒤, 원시 업그레이드를
 * 보내 **되돌아온 바이트**를 본다.
 *
 * **그 넷을 이 하네스에 다시 심어 쟀다**(2026-09-03, 22 케이스 중 빨개진 수):
 * `bypass` **4** · `configure` **5** · `rewrite` **2** · `configureServer` **6**.
 * `ws: true` 를 빼면 **5**. 2판을 뚫었던 `ws: false, todo: 'ws: true'` 도 **5** 다.
 * 반대쪽도 쟀다 — 무관한 `'/uploads'` 엔트리를 더한 것은 **22/22 초록**이고,
 * `'/api/projects'` 컨텍스트를 앞에 끼워 대상을 둘로 만든 것은 **1** 이 빨개진다.
 *
 * # 무엇을 손대고 무엇을 안 손대는가
 *
 * 바꾸는 값은 **하나뿐**이다 — `server.proxy['/api'].target` 을 스텁으로 돌린다(실서버도
 * DB 도 필요 없게). vite 의 `mergeConfig` 가 그 엔트리를 **깊게** 합치므로 `ws`·
 * `changeOrigin` 을 비롯한 나머지는 **파일에서 온 값 그대로** 실행된다 — 아래 카나리아가
 * 그 셋을 살아 있는 서버의 설정에서 다시 읽어 못박는다. 플러그인·`bypass` 유무도 파일
 * 그대로다. 포트는 안 건드린다: 5173 이 물려 있으면 vite 가 `pnpm dev` 와 똑같이 하나씩
 * 올려 잡는다.
 *
 * # 이 자가 못 보는 것 — 정직하게 적는다
 *
 * - **대상(`target`) 값 자체**는 여기서 안 잰다 — 스텁으로 바꿔 놓기 때문이다. 그 규칙은
 *   위 배선 절이 소유한다(gitignore 된 `apps/api/.env` 에 매인다).
 * - **실제 api 가 그 업그레이드에 무엇으로 답하는지**는 안 잰다. 여기서 재는 것은
 *   *"vite 가 업그레이드를 상류까지, 경로·`Host`·`Cookie` 를 보존한 채 넘기는가"* 다.
 * - `build`·`preview` 는 안 본다. 이 절이 재는 것은 `serve` 다.
 *
 * # 값 (2026-09-03, 이 기계)
 *
 * 이 파일 단독 실행 **약 1.0초**(vitest 보고 기준 테스트 70~150ms) · 5회 연속 22/22 ·
 * **5173 을 점유한 채로도 22/22**(vite 가 `pnpm dev` 와 똑같이 올려 잡는다) ·
 * **동시 2회 실행도 각각 22/22** · 끝난 뒤 남는 프로세스·리스닝 포트 **0**.
 */

/** `apps/web/vite.config.ts` — 아래 하네스가 **그대로** 실행하는 파일. */
const WEB_ROOT = fileURLToPath(new URL('../', import.meta.url))
const WEB_CONFIG_FILE = fileURLToPath(new URL('../vite.config.ts', import.meta.url))

/** 실시간 라우트(`apps/api/src/ws/routes.ts` 의 `'/:projectId/ws'`)가 붙는 자리. */
const REALTIME_URL = '/api/projects/9f1d0c3e-0000-4000-8000-000000000001/ws'

/** D4 의 근거를 값으로 재기 위해 실어 보내는 쿠키. 서버의 `projectGuard` 가 보는 자리다. */
const SESSION_COOKIE = 'wb_session=proxy-harness-probe'

/** 스텁 상류만 낼 수 있는 표식. **실서버가 답해도 이 글자는 안 온다.** */
const STUB_UPGRADE_MARKER = 'x-wirebound-stub-upgraded'
const STUB_REST_MARKER = 'x-wirebound-stub-rest'

/** RFC 6455 의 그 상수. 스텁이 진짜 핸드셰이크를 완성하도록 쓴다. */
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

/** 게이트가 닫히면 **아무 바이트도 안 온다** — 그때 매달리지 않도록 여기서 끊는다. */
const SILENCE_TIMEOUT_MS = 3_000

/** 스텁 상류가 한 요청에서 실제로 본 것. `undefined` 면 **거기까지 오지 않았다**는 뜻이다. */
interface UpstreamSighting {
  url: string
  host: string | undefined
  cookie: string | undefined
}

function sight(req: IncomingMessage): UpstreamSighting {
  return { url: req.url ?? '', host: req.headers.host, cookie: req.headers.cookie }
}

describe('업그레이드도 프록시를 탄다 — ws', () => {
  let viteServer: ViteDevServer
  let upstream: Server
  /** 스텁의 주소. `target` 이 이것으로 갈렸는지 카나리아가 확인한다. */
  let stubTarget = ''
  /** 브라우저가 보는 자리 — vite 의 오리진. `Host` 로 실어 보내고 상류에서 되받는다. */
  let viteAuthority = ''

  /**
   * **요청을 보내기 전**의 `'/api'` 엔트리. 요청 뒤에 읽으면 안 된다 — http-proxy 가
   * 첫 요청에서 `opts.target` 을 `url.parse()` 결과로 **제자리 바꿔** 버리고, 그 `opts` 는
   * `config.server.proxy['/api']` 와 같은 객체다(쟀다: 문자열 대신 `Url` 이 나온다).
   */
  let configuredEntry: ProxyOptions | undefined

  /** 되돌아온 **원시 바이트**. 게이트가 닫히면 빈 문자열이다. */
  let upgradeResponse = ''
  let upgradeSighting: UpstreamSighting | undefined
  let restStatus = 0
  let restMarker: string | null = null
  let restSighting: UpstreamSighting | undefined

  beforeAll(async () => {
    // ── 1. 스텁 상류. 실제 api 도 DB 도 필요 없다.
    upstream = createHttpServer((req, res) => {
      restSighting = sight(req)
      res.writeHead(200, { [STUB_REST_MARKER]: 'yes' })
      res.end('stub')
    })
    upstream.on('upgrade', (req, socket) => {
      upgradeSighting = sight(req)
      const accept = createHash('sha1')
        .update(`${req.headers['sec-websocket-key'] ?? ''}${WS_GUID}`)
        .digest('base64')
      socket.write(
        'HTTP/1.1 101 Switching Protocols\r\n' +
          'Upgrade: websocket\r\n' +
          'Connection: Upgrade\r\n' +
          `Sec-WebSocket-Accept: ${accept}\r\n` +
          `${STUB_UPGRADE_MARKER}: yes\r\n\r\n`,
      )
      socket.end()
    })
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
    stubTarget = `http://127.0.0.1:${(upstream.address() as AddressInfo).port}`

    // ── 2. 진짜 vite dev 서버. **바꾸는 값은 `target` 하나뿐이다.**
    viteServer = await createViteServer({
      root: WEB_ROOT,
      configFile: WEB_CONFIG_FILE,
      // 하네스의 배너·URL 이 vitest 출력에 섞이지 않게만 한다. 프록시 경로와 무관하고,
      // **`error` 는 남긴다** — `bypass` 가 던지는 갈래는 vite 가 거기에만 적는다.
      logLevel: 'error',
      // **의존 스캐너를 끈다.** 이 하네스는 모듈을 하나도 요청하지 않는데, `listen()` 이
      // 배경에서 `index.html` 을 esbuild 로 훑기 시작해 `close()` 와 경합한다(쟀다:
      // `Failed to scan for dependencies … The server is being restarted or closed`
      // 스택이 stderr 로 쏟아지고 esbuild 자식이 남는다). 프록시 경로와는 무관하다.
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { proxy: { '/api': { target: stubTarget } } },
    })
    // **요청을 보내기 전에** 찍는다(위 필드 주석 참고).
    const entry = viteServer.config.server.proxy?.['/api']
    configuredEntry = typeof entry === 'object' ? { ...entry } : undefined
    await viteServer.listen()
    const address = viteServer.httpServer?.address() as AddressInfo
    // vite 는 기본적으로 `localhost` 에 붙는데 이 기계에서는 `::1` 로 잡힌다.
    // URL 과 `Host` 헤더에는 대괄호가 필요하다.
    viteAuthority = `${address.family === 'IPv6' ? `[${address.address}]` : address.address}:${address.port}`

    // ── 3. 원시 업그레이드. **여기서 되돌아온 바이트가 이 절의 판정이다.**
    upgradeResponse = await new Promise<string>((resolve) => {
      const chunks: Buffer[] = []
      const socket = netConnect(address.port, address.address)
      const finish = () => {
        socket.destroy()
        resolve(Buffer.concat(chunks).toString('utf8'))
      }
      socket.setTimeout(SILENCE_TIMEOUT_MS, finish)
      socket.on('connect', () => {
        socket.write(
          `GET ${REALTIME_URL} HTTP/1.1\r\n` +
            `Host: ${viteAuthority}\r\n` +
            'Upgrade: websocket\r\n' +
            'Connection: Upgrade\r\n' +
            `Sec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\n` +
            'Sec-WebSocket-Version: 13\r\n' +
            `Cookie: ${SESSION_COOKIE}\r\n\r\n`,
        )
      })
      socket.on('data', (chunk: Buffer) => {
        chunks.push(chunk)
        // 헤더가 끝났으면 판정에 필요한 것은 다 왔다.
        if (Buffer.concat(chunks).includes('\r\n\r\n')) {
          finish()
        }
      })
      socket.on('error', finish)
      socket.on('close', finish)
    })

    // ── 4. 같은 URL 로 평범한 REST 도 한 번. **같은 상류로 가는지**를 본다.
    try {
      const response = await fetch(`http://${viteAuthority}${REALTIME_URL}`, {
        headers: { cookie: SESSION_COOKIE },
        signal: AbortSignal.timeout(SILENCE_TIMEOUT_MS),
      })
      restStatus = response.status
      restMarker = response.headers.get(STUB_REST_MARKER)
      await response.arrayBuffer()
    } catch {
      // 못 갔으면 아래 케이스가 `0` 을 보고 빨개진다.
    }
  }, 30_000)

  afterAll(async () => {
    // **둘 다 반드시 닫는다.** 안 닫으면 vitest 가 끝나지 않는다.
    await viteServer?.close()
    await new Promise<void>((resolve) => {
      if (!upstream?.listening) {
        resolve()
        return
      }
      upstream.close(() => resolve())
    })
  })

  it('하네스가 진짜 그 설정을 띄웠다 — 대상만 갈리고 나머지는 파일 그대로다', () => {
    // 카나리아가 먼저 온다. 엉뚱한 파일을 띄웠거나 `target` 이 안 갈렸으면 아래가 통째로
    // 헛돈다 — 특히 **`target` 이 안 갈리면 실서버로 나가** 스텁이 아무것도 못 본 채
    // 실서버의 101 을 초록으로 읽을 수 있다. 그래서 표식(`STUB_*_MARKER`)까지 함께 본다.
    expect(viteServer.config.configFile?.replace(/\\/g, '/')).toMatch(/apps\/web\/vite\.config\.ts$/)
    // 문자열 축약형(`'/api': 'http://…'`)이면 여기서 걸린다 — vite 가 그것을
    // `changeOrigin: true` 로 펴 버려 D4 의 근거가 무너진다.
    expect(configuredEntry).toBeDefined()
    expect(configuredEntry?.target).toBe(stubTarget)
    // **여기부터가 파일에서 온 값이다** — 라이브 단언이 죽었을 때 *왜* 죽었는지 말해 준다.
    // (`configure` 로 `options.ws` 를 끄는 갈래는 vite 가 그 객체를 그대로 넘기므로
    // 이 자리에서도 보인다.)
    expect(configuredEntry?.ws).toBe(true)
    expect(configuredEntry?.changeOrigin).toBe(false)
  })

  it('**업그레이드가 상류까지 간다** — 101 이 돌아온다', () => {
    // 게이트가 닫히면 vite 의 핸들러는 소켓을 닫지도 상태 코드를 쓰지도 않는다.
    // 그때 이 값은 **빈 문자열**이다(위 표의 "응답 바이트 0").
    expect(upgradeResponse).not.toBe('')
    expect(upgradeResponse).toMatch(/^HTTP\/1\.1 101 /)
    // 그 101 이 **스텁이 낸 것**이어야 한다. 실서버가 답한 101 은 이 표식이 없다.
    expect(upgradeResponse.toLowerCase()).toContain(`${STUB_UPGRADE_MARKER}: yes`)
  })

  it('상류가 받은 경로가 그대로다 — `rewrite` 가 끼면 실서버에서 404 다', () => {
    // vite 는 업그레이드 핸들러에서도 `opts.rewrite` 를 태운다(`req.url = opts.rewrite(url)`).
    // 경로가 깎이면 101 은 그대로 오는데 라우트가 없어 실서버에서만 죽는다 — 여기서 잡는다.
    expect(upgradeSighting?.url).toBe(REALTIME_URL)
  })

  it('`changeOrigin` 이 `false` 인 것이 값으로 보인다 — 상류가 vite 의 `Host` 를 본다 (D4)', () => {
    // http-proxy 는 업그레이드 요청의 헤더를 통째로 베끼고(`setupOutgoing`) `changeOrigin`
    // 이 손대는 것은 `Host` 하나뿐이다. `false` 면 **브라우저가 본 오리진이 그대로** 간다.
    expect(upgradeSighting?.host).toBe(viteAuthority)
    // 켜져 있었다면 상류 자신의 주소로 바뀌었을 자리다.
    expect(upgradeSighting?.host).not.toBe(stubTarget.replace('http://', ''))
  })

  it('세션 쿠키가 업그레이드에도 실린다 — `projectGuard` 가 보는 자리다 (D4)', () => {
    expect(upgradeSighting?.cookie).toBe(SESSION_COOKIE)
  })

  it('REST 와 업그레이드가 **같은 대상**으로 간다 — 손으로 맞출 자리를 둘로 만들지 않는다', () => {
    // 실시간 전용 컨텍스트를 `'/api'` 앞에 끼워 넣으면 그 순간 대상이 둘이 된다.
    // 그때 REST 는 그쪽으로 새고 업그레이드만 여기로 온다 — 이 케이스가 그것을 가른다.
    // (**재는 자리는 「이 URL 이 실제로 닿는 상류」다.** 무관한 `'/uploads'` 를 더했다고
    // 빨개지면 안 된다.)
    expect(restStatus).toBe(200)
    expect(restMarker).toBe('yes')
    expect(restSighting?.url).toBe(REALTIME_URL)
  })
})
