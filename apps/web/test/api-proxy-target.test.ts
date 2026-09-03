// @vitest-environment node
// **이 파일만 node 환경이다** — 이 프로젝트의 기본은 jsdom 이다(루트 `vitest.config.ts`).
// 아래 ws 절이 `vite.config.ts` 를 vite 자신의 로더로 **실행해** 값을 읽는데, 그 로더는
// `@vitejs/plugin-react` 를 실제로 import 한다. jsdom 안에서는 거기서 esbuild 가 invariant 로
// 죽는다(리뷰어가 값으로 확인했다). 위 절들은 DOM 을 안 쓰므로 잃는 것이 없다.
import { fileURLToPath } from 'node:url'
import { resolveConfig } from 'vite'
import { describe, expect, it } from 'vitest'
import { DEFAULT_API_PORT, resolveApiPort, resolveApiProxyTarget } from '../config/api-proxy-target'
// `?raw`는 vite가 파일 원문을 문자열로 넣어 준다 — `shell-css.test.ts`·`store-access.test.ts`와
// 같은 관용구다. **원문을 보는 것은 아래 배선 두 절뿐이고**, ws 절은 원문이 아니라 값을 잰다
// (그 이유는 그쪽 머리말에 있다).
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
 * # 왜 원문이 아니라 **값**을 재는가
 *
 * 앞 판은 이 절도 위 배선 절과 같은 자를 썼다 — `?raw` 원문을 `stripComments` 로 걷고
 * `'/api': { … }` 의 짝을 세어 그 안에 `ws: true` 라는 **글자**가 있는지 봤다.
 * 반증 워커가 `vite.config.ts` 를 21 갈래로 변조해 그 자를 실측했고 **거짓 초록이 아홉**
 * 나왔다(2026-09-03). 최악은 한 줄짜리다:
 *
 * ```ts
 * '/api': { target: apiProxyTarget, changeOrigin: false, ws: false, todo: 'ws: true' },
 * ```
 *
 * **설정이 실시간을 끄고 있는데 「ws 가 켜져 있다」가 20/20 초록이었다.** 나머지 여덟도
 * 악의가 필요한 모양이 아니다 — 같은 객체의 **중복 키**(뒤엣것이 런타임에서 이기는데 자는
 * 앞엣것을 읽는다), `preview.proxy` 를 `server` 앞에 둔 것(`pnpm dev` 가 쓰는 것은
 * `server.proxy` 다), **로그 문자열 안의 같은 글자**(`stripComments` 는 문자열 내용을
 * 일부러 남긴다), `agent: { ws: true }` 같은 **중첩**, `...(false ? { ws: true } : {})`
 * **죽은 가지**, 그리고 `rewrite: (p) => p.replace(/^https?:\/\//, '')` — `stripComments` 가
 * 정규식을 모르고 `//` 뒤를 지워 엔트리의 `}` 를 없애 버린다. **프록시 설정에서 가장 흔한
 * 정규식 자리다.**
 *
 * **「ws 가 실행되는 자리에서 참인가」는 글자로 답할 수 있는 질문이 아니다.** 원문을 더
 * 잘 파싱하는 것으로는 못 닫는다 — 위 아홉 중 파싱으로 닫히는 것은 셋뿐이고 나머지는
 * 「그 글자가 실행되는 값인가」를 묻지 않는 데서 온다.
 *
 * 그래서 이 절은 **vite 자신의 로더로 설정을 실행해 값을 읽는다** — `resolveConfig` 는
 * `createServer` 가 프록시를 세울 때 부르는 바로 그 함수이고, 플러그인의 `config()` 훅까지
 * 반영된 뒤의 객체를 준다. 그 위에서 **vite 의 선택 규칙 자체를 옮겨** 실시간 라우트가
 * 실제로 어느 엔트리를 타는지 고른다. 중복 키는 JS 가 이미 하나로 접었고, `preview` 미끼는
 * 그 필드에 없으며, 문자열·중첩·죽은 가지는 값이 되지 못한다.
 *
 * # 이 자가 못 보는 것 — 정직하게 적는다
 *
 * - **`configureServer` 훅**에서 미들웨어를 직접 얹어 프록시를 앞질러 가는 것은 값에
 *   나타나지 않는다. 그것까지 재려면 서버를 띄워야 한다.
 * - 대상(`target`) **값**은 여기서 안 잰다 — gitignore 된 `apps/api/.env` 에 매인다
 *   (이 워크트리에서는 `3002` 였다). 대상 규칙은 위 배선 절이 소유한다.
 */

/**
 * `apps/web/vite.config.ts` 를 **vite 가 뜰 때와 같은 방식으로** 해석한 결과.
 *
 * 정적 `import` 로는 못 한다 — 그쪽은 이 파일이 사는 브라우저 프로그램의 타입 그래프로
 * `vite.config.ts` 를 끌고 들어와 `TS6307` 로 죽는다(`tsconfig.node.json` 이 그 파일을
 * 따로 드는 이유다). `resolveConfig` 는 **경로 문자열**을 받으므로 타입 그래프에 안 들어오고,
 * vite 가 자기 로더(node 쪽 esbuild)로 읽으므로 `@vitejs/plugin-react` 도 정상적으로 산다.
 */
const WEB_ROOT = fileURLToPath(new URL('../', import.meta.url))
const resolvedViteConfig = await resolveConfig(
  { root: WEB_ROOT, configFile: fileURLToPath(new URL('../vite.config.ts', import.meta.url)) },
  'serve',
  'development',
  'development',
)

/** 실시간 라우트(`apps/api/src/ws/routes.ts` 의 `'/:projectId/ws'`)가 붙는 자리. */
const REALTIME_URL = '/api/projects/9f1d0c3e-0000-4000-8000-000000000001/ws'

describe('업그레이드도 프록시를 탄다 — ws', () => {
  /** `pnpm dev` 가 프록시를 세울 때 그대로 훑는 목록. 순서가 곧 우선순위다. */
  const contexts = Object.entries(resolvedViteConfig.server.proxy ?? {}).map(
    ([context, value]) =>
      // 문자열 축약형(`'/api': 'http://…'`)은 vite 가 `{ target }` 으로 편다.
      [context, typeof value === 'string' ? { target: value } : value] as const,
  )

  /** vite 의 `doesProxyContextMatchUrl` 을 그대로 옮긴 것. */
  function matchesContext(context: string, url: string): boolean {
    return (context[0] === '^' && new RegExp(context).test(url)) || url.startsWith(context)
  }

  /**
   * **REST 가 타는 자리** — `viteProxyMiddleware` 는 **첫 매치**에서 `return` 한다.
   * 그래서 앞에 놓인 더 넓은 컨텍스트가 있으면 그것이 이긴다.
   */
  function restEntry(url: string) {
    return contexts.find(([context]) => matchesContext(context, url))
  }

  /**
   * **업그레이드가 타는 자리** — 매치하더라도 게이트(`opts.ws || 대상이 ws:/wss:`)가
   * 닫혀 있으면 `return` 하지 않고 **다음 컨텍스트로 넘어간다.** 끝까지 못 열면
   * `undefined` 다 — 그것이 위 표의 "응답 바이트 0" 이다.
   */
  function upgradeEntry(url: string) {
    return contexts.find(([context, options]) => {
      if (!matchesContext(context, url)) {
        return false
      }
      const target = String(options.target ?? '')
      return Boolean(options.ws) || target.startsWith('ws:') || target.startsWith('wss:')
    })
  }

  it('자가 진짜 그 설정을 실행해 읽었다 — 엉뚱한 파일이면 아래가 통째로 헛돈다', () => {
    // 배선 절의 카나리아와 같은 이유다. 읽은 자리가 빗나가면 아래가 전부 초록이 되거나
    // 전부 빨개진다. **어느 파일을 읽었는지**를 먼저 못박는다.
    expect(resolvedViteConfig.configFile?.replace(/\\/g, '/')).toMatch(/apps\/web\/vite\.config\.ts$/)
    expect(contexts.length).toBeGreaterThan(0)
    // 이 절이 재는 것은 **dev 서버**다. `preview.proxy` 를 봐서는 안 된다.
    expect(resolvedViteConfig.server.proxy).toBeDefined()
  })

  it('**업그레이드 게이트가 열린다** — 닫혀 있으면 실시간이 조용히 멈춘다', () => {
    const entry = upgradeEntry(REALTIME_URL)
    // `undefined` 면 그 핸들러가 아무것도 안 하고 빠져나온다 — 소켓도 상태 코드도 없다.
    expect(entry).toBeDefined()
    const [context, options] = entry ?? ['', {}]
    expect(context).toBe('/api')
    // **이 저장소에서 그 게이트를 여는 것은 `ws` 하나뿐이다.** 대상은
    // `http://127.0.0.1:<PORT>` 라(위 배선 절이 잰다) `ws:`·`wss:` 가지는 영원히 거짓이고,
    // 대상을 `ws:` 로 바꿔 여는 것은 답이 아니다 — 같은 엔트리로 REST 도 나간다.
    expect(options.ws).toBe(true)
  })

  it('REST 와 업그레이드가 **같은 엔트리**를 탄다 — 대상을 두 벌 두지 않는다', () => {
    // vite 의 업그레이드 핸들러는 같은 `proxies[context]` 를 다시 꺼내 쓴다. 즉 대상은
    // `apiProxyTarget` 하나뿐이어야 하고, 실시간 전용 컨텍스트를 앞에 끼워 넣으면
    // 그 순간 손으로 맞출 자리가 둘이 된다(이 파일이 없애려던 것이 그것이다).
    //
    // **재는 자리는 「이 URL 이 실제로 타는 엔트리」다.** 파일에 프록시 엔트리가 몇 개인지가
    // 아니다 — 무관한 `'/uploads'` 를 더했다고 빨개지면 안 된다(리뷰어 실측).
    const rest = restEntry(REALTIME_URL)
    expect(rest?.[0]).toBe('/api')
    // 같은 객체여야 한다. 다르면 업그레이드가 REST 와 **다른 대상**으로 나가고 있다.
    expect(upgradeEntry(REALTIME_URL)?.[1]).toBe(rest?.[1])
  })

  it('`changeOrigin` 은 그대로 `false` 다 — WS 도 same-origin 쿠키를 쓴다 (D4)', () => {
    // 업그레이드 요청의 헤더는 http-proxy 가 통째로 베낀다(`setupOutgoing` 의
    // `Object.assign({}, req.headers)`) — `changeOrigin` 이 손대는 것은 `Host` 하나뿐이라
    // `Cookie` 는 어느 쪽이든 실린다. **그래서 D4 의 근거가 WS 에서도 그대로 선다:**
    // 브라우저가 같은 오리진으로 붙으니 쿠키가 실리고, `Host` 를 안 바꾸니 서버는
    // 브라우저가 본 오리진을 그대로 본다. 실측으로 확인했다 — 이 값 그대로
    // `preHandler: projectGuard('viewer')` 를 통과해 `joined` 가 왔다.
    expect(restEntry(REALTIME_URL)?.[1].changeOrigin).toBe(false)
  })
})
