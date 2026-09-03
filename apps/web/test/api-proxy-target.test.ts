import { describe, expect, it } from 'vitest'
import { DEFAULT_API_PORT, resolveApiPort, resolveApiProxyTarget } from '../config/api-proxy-target'
// `?raw`는 vite가 파일 원문을 문자열로 넣어 준다 — `shell-css.test.ts`·`store-access.test.ts`와
// 같은 관용구다. 이 파일은 Node 타입이 없는 브라우저 프로그램에 살므로 `node:fs`를 못 쓴다.
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
 * if (opts.ws || opts.target?.toString().startsWith("ws:") || …startsWith("wss:")) {
 *   proxy.ws(req, socket, head)   // ← 여기 못 오면
 * }
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
 * # 왜 원문을 읽는가
 *
 * 위 배선 절과 같은 자를 쓴다. 설정 객체를 `import` 해서 재는 길도 있지만 그쪽은
 * `vite.config.ts` 를 **브라우저 프로그램의 타입 그래프로 끌고 들어온다** — 그 파일이
 * `tsconfig.node.json` 에 따로 사는 이유가 정확히 그것이다(`types: ["node"]` 를
 * `apps/web/src` 에 안 얹으려고 갈랐다). 게다가 jsdom 안에서 `@vitejs/plugin-react` 를
 * 실행하고 **gitignore 된 `.env` 를 읽게** 되므로, 재는 값이 있을 수도 없을 수도 있는
 * 파일에 매인다.
 *
 * 원문 읽기의 약점(글자가 맞아도 vite 에 안 꽂힐 수 있다)은 위 배선 절이 쓰는 방법으로
 * 좁힌다 — **`'/api'` 엔트리 *안에* 있는지**를 보지 파일 어딘가에 있는지를 보지 않는다.
 */
describe('업그레이드도 프록시를 탄다 — ws', () => {
  const source = stripComments(viteConfigSource)

  /** `'/api': { … }` 의 중괄호 안. 없으면 빈 문자열이라 아래가 전부 실패한다. */
  const apiEntry = source.match(/'\/api':\s*\{([^}]*)\}/)?.[1] ?? ''

  it('자가 진짜 엔트리를 잡았다 — 못 잡으면 아래가 통째로 헛돈다', () => {
    // 배선 절의 카나리아와 같은 이유다. 정규식이 빗나가면 `not.toMatch` 계열이 전부
    // 초록이 되므로, 먼저 **잡았다는 것**을 못박는다.
    expect(apiEntry).not.toBe('')
    expect(apiEntry).toContain('target: apiProxyTarget')
  })

  it('**`ws` 가 그 엔트리 안에 켜져 있다** — 없으면 업그레이드가 조용히 멈춘다', () => {
    expect(apiEntry).toMatch(/\bws:\s*true\b/)
  })

  it('vite 가 묻는 조건을 만족한다 — `ws` 가 참이거나 대상이 ws:/wss: 여야 한다', () => {
    // 이 저장소의 대상은 `http://127.0.0.1:<PORT>` 다(위 절이 잰다). 즉 뒤의 둘은
    // 영원히 거짓이고 **`ws` 만이 그 게이트를 연다.** 대상을 `ws:` 로 바꾸는 것은
    // 답이 아니다 — 같은 엔트리로 REST 도 나가기 때문이다.
    expect(apiEntry).toMatch(/\bws:\s*true\b/)
    expect(apiEntry).toContain('target: apiProxyTarget')
    expect(apiEntry).not.toMatch(/target:\s*'wss?:/)
  })

  it('`changeOrigin` 은 그대로 `false` 다 — WS 도 same-origin 쿠키를 쓴다 (D4)', () => {
    // 업그레이드 요청의 헤더는 http-proxy 가 통째로 베낀다(`setupOutgoing` 의
    // `Object.assign({}, req.headers)`) — `changeOrigin` 이 손대는 것은 `Host` 하나뿐이라
    // `Cookie` 는 어느 쪽이든 실린다. **그래서 D4 의 근거가 WS 에서도 그대로 선다:**
    // 브라우저가 같은 오리진으로 붙으니 쿠키가 실리고, `Host` 를 안 바꾸니 서버는
    // 브라우저가 본 오리진을 그대로 본다. 실측으로 확인했다 — 이 값 그대로
    // `preHandler: projectGuard('viewer')` 를 통과해 `joined` 가 왔다.
    expect(apiEntry).toMatch(/\bchangeOrigin:\s*false\b/)
  })

  it('업그레이드도 **같은 대상 규칙**을 쓴다 — 대상을 두 벌 두지 않는다', () => {
    // vite 의 업그레이드 핸들러는 같은 `proxies[context]` 엔트리를 다시 꺼내 쓴다.
    // 즉 대상은 위 절이 잰 `apiProxyTarget` 하나뿐이고, WS 전용 대상을 따로 두면
    // 그 순간 손으로 맞출 자리가 둘이 된다(이 파일이 없애려던 것이 그것이다).
    expect(source.match(/target:/g)).toHaveLength(1)
  })
})
