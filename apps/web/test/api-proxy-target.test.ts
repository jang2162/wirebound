// @vitest-environment node
// **이 파일만 node 환경이다** — 이 프로젝트의 기본은 jsdom 이다(루트 `vitest.config.ts`).
// 아래 **라이브 절과 ws 절**이 `vite.config.ts` 로 **진짜 dev 서버를 띄운다.** 그 로더는
// `@vitejs/plugin-react` 를 실제로 import 하는데, jsdom 안에서는 거기서 esbuild 가 invariant 로
// 죽는다(리뷰어가 값으로 확인했다). 소켓·`http.Server` 도 노드 것이어야 한다.
// 위 절들은 DOM 을 안 쓰므로 잃는 것이 없다.
import { createHash, randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { type IncomingMessage, createServer as createHttpServer, type Server } from 'node:http'
import { type AddressInfo, connect as netConnect } from 'node:net'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'
import {
  type ProxyOptions,
  type ResolvedConfig,
  createServer as createViteServer,
  resolveConfig,
  type ViteDevServer,
} from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_API_PORT, resolveApiPort, resolveApiProxyTarget } from '../config/api-proxy-target'
// `?raw`는 vite가 파일 원문을 문자열로 넣어 준다 — `shell-css.test.ts`·`store-access.test.ts`와
// 같은 관용구다. **원문을 보는 것은 아래 배선 두 절의 여섯 케이스뿐이고, 그것이 보는 것은
// «어느 이름을 어디에 넣고 어느 파일을 가리키는가» 하나다.** «어느 모듈에서 규칙을
// 가져오는가»는 **원문이 아니라 값으로** 잰다 — 설정을 평가해 나온
// `configFileDependencies` 를 본다(그 자리 머리말). **대상에 무엇이 꽂혔는지**는
// «값 대 값» 절이 이 저장소의 `vite.config.ts` 를 **평가해 나온 값**으로 재고, **그 대상으로
// 요청이 실제로 가는지**와 업그레이드는 라이브 절과 ws 절이 **되돌아온 바이트**로 잰다.
//
// **대상 축의 자를 네 판 지었고 셋이 뚫렸다. 다섯 판째는 짓지 않기로 했다** — 5차 리뷰가
// 남은 사각 여덟 갈래를 더 냈는데(전부 27/27), 막으려면 자가 또 커지고 그 자가 다시
// 뚫린다. **재는 척하는 것보다 못 재는 것을 적는 편이 낫다** — 그래서 그 갈래들은 아래
// 각 절의 §«이 자가 못 보는 것» 에 부류로 적혀 있다. 사연은 «값 대 값» 절 머리말에 있다.
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
 * `apps/web/vite.config.ts` — **아래 네 절이 그대로 쓰는 파일.** «배선이 가리키는 자리»와
 * «값 대 값» 절은 평가만 하고(서버를 안 띄운다), 라이브 절과 ws 절은 진짜 dev 서버로
 * 띄운다 (각각 다루는 것이 다르다 — 그쪽 머리말들).
 */
const WEB_ROOT = fileURLToPath(new URL('../', import.meta.url))
const WEB_CONFIG_FILE = fileURLToPath(new URL('../vite.config.ts', import.meta.url))

/**
 * 규칙이 사는 모듈. **원문의 지정자가 아니라 실제 파일**이다 — 아래 «배선이 가리키는
 * 자리» 의 마지막 케이스가 이 파일이 설정의 **의존 그래프**에 들어 있는지 본다.
 */
const RULE_MODULE_FILE = fileURLToPath(new URL('../config/api-proxy-target.ts', import.meta.url))

/** vite 가 내는 경로는 posix 구분자다(`normalizePath`). 윈도에서도 같은 자로 재려고 맞춘다. */
function posix(filePath: string): string {
  return filePath.replace(/\\/g, '/')
}

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
 *
 * # 이 절이 재는 축은 하나다 — «규칙을 **무엇으로** 부르는가»
 *
 * **«그 값이 대상이 되는가»는 여기 없다.** 그 축은 아래 «값 대 값» 절이 갖는다 —
 * 이 자리에서 원문으로 재려던 시도가 **세 판 내리 뚫렸기 때문이다.** 그 이력과 원인은
 * 그쪽 머리말이 소유한다(여기 두 벌로 적지 않는다).
 *
 * # 지금 축이 어떻게 나뉘나 — 정직하게
 *
 * | 축 | 누가 갖나 |
 * |---|---|
 * | 규칙을 **무엇으로** 부르는가(`shellEnv`/`fileEnv`가 안 뒤집혔나) | 아래 `wiring()` 케이스 셋 |
 * | 그 파일을 **어디서** 읽는가(원문 셋) · 규칙 모듈이 **의존 그래프에 있는가**(값 하나) | `배선이 가리키는 자리` 넷 |
 * | 규칙이 낸 값이 **그대로 대상이 되는가** | «값 대 값» 절 넷 |
 * | 그 대상으로 요청이 **실제로 가는가** | «라이브» 절 둘 |
 * | 업그레이드가 그 대상까지 가는가 | «ws» 절 |
 *
 * **이 절의 세 케이스는 원문을 읽는다.** `wiring()` 은 `resolveApiProxyTarget({…})` 의
 * 인자 객체를 정규식 하나로 잘라 키 → 값으로 읽는다 — 키 **순서**는 안 보지만
 * **표기**에 일부 매인다: **인자를 변수에 담아** 넘기면 빈 객체가 되어 **빨개진다**
 * (쟀다: **24/27**). **호출을 여러 줄로 쓰는 것은 통과한다** — `[^}]*` 가 개행을 먹으므로
 * **27/27** 이다. (앞 판 머리말은 *"여러 줄로 쓰거나"* 를 함께 적었으나 **그 절반은
 * 거짓이다** — 두 형태를 따로 심어 쟀다.)
 *
 * 실패 방향이 빨강이라 거짓 초록은 안 만든다. **다만 «거짓 빨강이라 안전하다» 는 절반만
 * 참이다** — 옳은 설정을 죽이는 것 자체가 값이고, 4판이 원문으로 잰 케이스 하나가 정확히
 * 그 값을 냈다(거짓 빨강 둘. 아래 «배선이 가리키는 자리» 머리말).
 *
 * **뒤집힘은 이제 값으로도 잡힌다 — 다만 조건부다.** «값 대 값» 절이 셸에 임시 포트를
 * 심는 케이스를 가지므로, 인자가 뒤집혀 있으면 그 케이스가 **파일의 수**를 보고 빨개진다
 * (`apps/api/.env` 에 `PORT` 가 있을 때만 그렇다 — 없으면 뒤집어도 두 자리가 다 비어
 * 답이 같다). 이 세 케이스는 **그 조건이 없는 기계에서도 서는** 쪽을 맡는다.
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
    // 그 값이 이름을 갖는다 — 아래 배너 케이스가 그 이름을 다시 쓴다.
    // **네임스페이스 접두사를 허용한다**(`apiProxyRules.resolveApiProxyTarget(`) — 행동이
    // 같은 옳은 설정을 죽이던 자리다(리뷰어 실측: 25/27).
    expect(source).toMatch(/const apiProxyTarget = [\w$.]*\bresolveApiProxyTarget\(/)
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
 *
 * **이제 값으로도 닫힌다.** «값 대 값» 절이 `apps/api/.env` 를 **따로 읽어** 규칙의 답을
 * 만들므로, 설정이 다른 파일을 읽으면 두 답이 갈린다 — 쟀다: 경로를 없는 파일로 바꾸면
 * 여기 둘 + 그쪽 ①② 해서 **23/27**(`apps/api/.env` 가 `PORT` 를 말하는 기계에서).
 * 아래 셋은 **그 조건이 없는 기계에서도 서는** 쪽이다.
 *
 * **규칙을 어느 모듈에서 가져오는지도 여기 있다** — 리뷰어가 가드 비대칭을 실증했다
 * (6차 2판 리뷰 V6): `readApiEnvFile` 쪽에는 `(?<!function )` 가드가 있어 선언과 호출을
 * 가르는데 `resolveApiProxyTarget` 쪽에는 없었다. 그래서 `function` 선언으로 갈음하면
 * 빨갛고 **화살표 `const` 로 갈음하면 초록**이었다(`const 이름 = (` 는 이름 뒤에 `(` 가
 * 안 붙어 호출 카운트를 안 올린다). 아래 마지막 케이스가 그 비대칭을 없앤다.
 *
 * # 그 케이스는 **원문이 아니라 값**으로 잰다 — 4판의 거짓 빨강 둘을 없앤 자리다
 *
 * 4판은 그것을 원문 정규식으로 요구했다
 * (`import\s*\{[^}]*\bresolveApiProxyTarget\b[^}]*\}\s*from\s*'\./config/api-proxy-target'`).
 * **행동이 완전히 같은 옳은 설정 둘이 그 자리에서 죽었다**(5차 리뷰 실측, 이 워커가 재현):
 *
 * | 옳은 설정 | 4판(원문) | 지금(값) |
 * |---|---|---|
 * | `from './config/api-proxy-target.js'` — NodeNext 지정자 | **26/27** | **27/27** |
 * | `import * as apiProxyRules from …` + `apiProxyRules.resolveApiProxyTarget(…)` | **25/27** | **27/27** |
 *
 * 그리고 그 원문 자는 **자기 서술과 어긋났다** — 4판은 «원문 파서를 버렸다» 고 적으면서
 * 이 한 자리에서 원문의 **표기**를 재고 있었다.
 *
 * **지금은 `resolveConfig` 가 내는 `configFileDependencies` 를 본다.** esbuild 가 설정을
 * 번들할 때 **실제로 먹은 입력 파일 목록**이라 표기를 안 본다 — 지정자에 확장자를 붙이든,
 * 네임스페이스로 받든, `as` 로 별칭을 주든 같은 값이 나온다. 쟀다: 규칙 모듈을 **import
 * 조차 안 하고** 같은 이름의 지역 화살표로 갈음하면(V6, **계약을 정확히 베낀 복제**)
 * 목록에 그 파일이 없어 **혼자 죽는다**(26/27 — 나머지 스물여섯은 전부 초록이다).
 * 실패 방향은 그대로 빨강이다: 목록이 비거나 경로가 안 맞으면 빨개진다.
 *
 * **이 자가 못 보는 것 — 정직하게 적는다.** 이 자는 «규칙 모듈이 설정의 의존 그래프에
 * 있는가» 만 묻는다. **import 만 하고 안 부르면 못 본다** — 쟀다: 별칭 import
 * (`as upstreamRule`)를 남긴 채 같은 이름의 지역 화살표로 규칙을 베끼면 **27/27** 이고
 * 규칙 모듈은 한 번도 안 불린다. **4판의 원문 자도 같은 별칭에 똑같이 뚫렸다** — 그 정규식을
 * 네 변조본에 직접 걸어 쟀다: 별칭본은 통과하고(`\bresolveApiProxyTarget\b` 가 `as` 절에
 * 걸린다) 위 표의 옳은 설정 둘만 빨개졌다. **이 구멍은 새로 난 것이 아니다.**
 * **여기서 더 좁힐 방법은 없다** — 설정은 esbuild 번들 안에서 규칙 모듈의 **자기 사본**을
 * 받으므로 «이 자가 부른 함수와 같은 객체인가» 를 물을 수 없다. 그리고 **계약을 정확히
 * 베낀 복제는 «값 대 값» 넷이 구조적으로 못 본다**(그쪽 머리말 §못 보는 것).
 */
describe('배선이 가리키는 자리', () => {
  const source = stripComments(viteConfigSource)

  /**
   * 설정을 평가했을 때 vite 가 «이 설정이 딸린 파일» 로 세는 것 — esbuild 가 설정을
   * 번들할 때 실제로 먹은 입력들이다. **원문이 아니라 값이고, 표기를 안 본다.**
   */
  let configFileDependencies: string[] = []

  beforeAll(async () => {
    // **셸의 `PORT` 를 지우고 평가한다.** 이 축은 `PORT` 와 무관한데, 셸에 숫자가 아닌
    // 값이 걸려 있으면 규칙이 던져 이 절의 **네 케이스가 다 빨개진다** — 재는 것과
    // 상관없는 자리까지 죽이지 않는다. 끝나면 되돌린다(«값 대 값» 절의 `resolveUnder`
    // 와 같은 이유·같은 절차다).
    const saved = process.env.PORT
    delete process.env.PORT
    try {
      const config = await resolveConfig(
        { root: WEB_ROOT, configFile: WEB_CONFIG_FILE, logLevel: 'silent' },
        'serve',
      )
      configFileDependencies = config.configFileDependencies.map(posix)
    } finally {
      if (saved !== undefined) {
        process.env.PORT = saved
      }
    }
  }, 30_000)

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

  it('**규칙을 그 모듈에서 가져온다** — 같은 이름의 지역 함수로 갈음하지 않는다', () => {
    // 카나리아: 이 목록이 살아 있는지 먼저 본다. 비면 아래가 헛돈다.
    expect(configFileDependencies).toContain(posix(WEB_CONFIG_FILE))
    expect(configFileDependencies).toContain(posix(RULE_MODULE_FILE))
  })
})

/**
 * **규칙이 낸 값이 그대로 대상이 되는가 — 값 대 값**(P10-2 이월 G, 4판).
 *
 * # 이 한 축의 자가 세 판 내리 뚫렸다
 *
 * | 판 | 방법 | 결과 |
 * |---|---|---|
 * | 1 (`main`) | 원문 읽기 — «`target` 이 **첫 키**» + «`'/api':` 가 든 **그 한 줄**에 네 자리 수가 없다» | **거짓 빨강 1**(`headers` 를 `target` 앞에 둔 **옳은** 설정이 죽는다) · **거짓 초록 1**(엔트리를 여러 줄로 쓰고 다음 줄에 수를 박으면 안 본다) |
 * | 2 (6차 1판) | 축을 통째로 라이브(값)로 옮김 | **거짓 초록 1** — 리뷰어가 지었다: `target:` 자리에 `` `http://127.0.0.1:${process.env.PORT ?? '3001'}` `` |
 * | 3 (6차 2판) | 원문(**이름**) + 라이브(**값**) **둘을 겹침** — `apiTargetExpression()` 이 `target` 에 쓰인 식이 `apiProxyTarget` 인지 봤다 | **거짓 초록 7 · 거짓 빨강 2**(리뷰어 실측. 일곱 중 **다섯은 `pnpm typecheck` 도 통과**했다) |
 *
 * **왜 겹쳐 놓고도 뚫렸나 — 원인 한 줄.** `apiTargetExpression()` 은 **이름**을 보고
 * 라이브 절은 **값**을 보는데, **라이브 절이 심는 값이 `process.env.PORT` 라서** 손으로
 * 만든 `` `http://127.0.0.1:${process.env.PORT ?? '3001'}` `` 가 **두 자를 다 통과한다.**
 * 두 자의 사각이 서로를 덮은 것이 아니라 **겹쳤다.** 그래서 공격이 하나로 줄었다 —
 * 글자로는 `target: apiProxyTarget` 을 그대로 남기고 **그 이름이 가리키는 값**이나
 * **그 엔트리가 실제로 쓰이는지**만 갈아 끼우면 된다: `&&` 로 이어 붙이기 · 같은 이름의
 * 지역 화살표로 갈음(**규칙 모듈을 import 조차 안 하는데 초록**) · `readApiEnvFile()` 이
 * `{}` 반환 · 죽지 않은 삼항 스프레드 · `preview.proxy` 미끼.
 *
 * 그리고 **손으로 쓴 파서가 또 뚫렸다** — `matchingBrace` 가 **정규식 리터럴을 몰라**
 * `rewrite: (p) => p.replace(/[}]/g, '')` 의 `}` 를 진짜 닫는 괄호로 세고 엔트리를 일찍
 * 닫았다. 5차에 2판을 뚫은 것과 **같은 구멍**이다(그때는 `stripComments` 가 `//` 를 먹었다).
 *
 * # 4판 — **겹침을 없앤다.** 규칙을 이 자가 직접 불러 «값 대 값» 으로 잰다
 *
 * **원문을 안 본다. 손으로 쓴 파서를 없앴다** — 정규식 리터럴 구멍도 함께 사라지고,
 * 표기에 매여 나던 **거짓 빨강 둘**(`"/api":` · `['/api']:`)도 사라진다. 대신 이 저장소의
 * `vite.config.ts` 를 **`resolveConfig` 로 그대로 평가해** vite 가 쓸
 * `server.proxy['/api'].target` 을 읽고, **같은 입력을 규칙 모듈에 직접 넣어** 나온 답과
 * 대조한다. **수를 어디에도 안 박는다** — 양쪽 다 그 자리에서 구한 값이다.
 *
 * **겹침이 없어지는 이유는 셸을 안 심는 판이 있기 때문이다.** 셸에 `PORT` 를 안 심으면
 * 규칙의 답은 `apps/api/.env` 에서 오고 손으로 만든 값은 자기 기본값으로 간다 —
 * **갈린다.** 리뷰어가 정확히 그 조건에서 재서 일곱을 잡았다.
 *
 * # 판을 넷 만든다 — 규칙의 **계약**을 통째로 통과해야 한다
 *
 * 값 하나만 맞히면 되는 자는 그 값 하나만 흉내 내면 뚫린다. 그래서 이 절은 셸 `PORT` 를
 * 넷으로 바꿔 가며 매번 «설정이 낸 대상 == 규칙이 낸 답» 을 묻는다.
 *
 * | 판 | 심는 셸 `PORT` | 규칙의 답 | 무엇을 가르나 |
 * |---|---|---|---|
 * | ① | **지운다** | `.env` 의 `PORT` ?? 3001 | **파일 갈래.** 손으로 만든 값·`readApiEnvFile()` 훼손·규칙 갈음이 여기서 갈린다 |
 * | ② | `''` | 위와 같다(빈 값 = «안 줬다») | `??` 는 빈 문자열을 안 잡는다 — 계약을 안 베낀 값은 `http://127.0.0.1:` 이 된다 |
 * | ③ | 임시 포트(무작위) | 그 수 | **셸이 파일을 이긴다.** 대상을 수로 박거나 인자를 뒤집으면 여기서 죽는다 |
 * | ④ | 숫자가 아닌 값 | **던진다** | 규칙의 거부가 설정까지 간다. 규칙을 안 부르면 설정이 그냥 뜬다 |
 *
 * ①②는 `process.env.PORT` 를 **지운 채** 평가하므로 **셸에 `PORT` 가 걸린 기계에서도**
 * 판이 같다. ③④는 `apps/api/.env` 가 무엇이든(없어도) 답이 같다.
 *
 * # 받아들임 검사 — 3판을 뚫은 열 갈래를 **그대로 심어 쟀다** (2026-09-04, 이 파일 27 케이스)
 *
 * | 심은 것 | 이 파일 | 죽은 자리 |
 * |---|---|---|
 * | `target:` 자리에 손으로 만든 값 · `&&` 이어 붙이기 · 스프레드 덮기 · 죽지 않은 삼항 스프레드 · 중복 `'/api'` 키 · `preview.proxy` 미끼 · 정규식으로 깊이 속이기 · `readApiEnvFile()` 이 `{}` 반환 · `Object.assign` 덮기 | **25/27** | ①② |
 * | 같은 이름의 지역 화살표로 갈음 — **순진한 복제**(3판에서 **23/23 초록**이었다) | **23/27** | ①②④ + `규칙을 그 모듈에서 가져온다` |
 * | 같은 갈음 — **계약을 정확히 베낀 복제**(빈 문자열·거부 메시지까지) | **26/27** | `규칙을 그 모듈에서 가져온다` **하나** |
 * | `['/api']:` 계산된 키 · `"/api":` 쌍따옴표 키 — **옳은 설정**(3판의 거짓 빨강 둘) | **27/27** | — |
 * | `target` 이 마지막 키·여러 줄·주석 · `headers` 중첩이 앞 · `'target':` 따옴표 키 · 인자 순서 뒤집기 · `rewrite` 에 `/[{]/` — 옳은 설정 다섯 | **27/27** | — |
 * | 대상을 수로 박기(`.env` 와 **같은 수**로) | 19/27 | ③④ + 라이브 둘 + 배선 셋 + `자리` 하나 |
 * | 인자 뒤집기(`shellEnv`↔`fileEnv`) | 21/27 | ③④ + 라이브 둘 + 배선 둘 |
 * | `.env` 경로를 없는 파일로(리뷰 델타 W6) | 23/27 | ①② + `배선이 가리키는 자리` 둘 |
 *
 * **넷이 서로 다른 것을 잰다** — 각각 **그 넷 중 혼자만** 죽는 변조가 있다(재는 척만
 * 하지 않는다는 뜻이다):
 * ① 「셸에 `PORT` 가 없을 때만 기본값으로 물러난다」 · ② 「빈 문자열을 진짜 값으로 본다」 ·
 * ③ 「셸의 숫자 값에만 `0` 을 붙인다」 · ④ 「거부를 삼키고 기본값으로 물러난다」.
 * `규칙을 그 모듈에서 가져온다` 도 혼자 죽는다 — **규칙을 계약까지 그대로 베껴 지역에
 * 두면** 넷은 다 초록인데 그 하나만 빨개진다(쟀다: **26/27**. §7.2 의 *"판정이 두 벌이면
 * 갈린다"* 가 그 자리다). **그 자는 원문이 아니라 값으로 잰다** — 그쪽 머리말.
 *
 * # 이 자가 못 보는 것 — 정직하게 적는다
 *
 * **여기 적힌 것을 막으려고 다섯 판째를 짓지 않는다.** 이 축의 자는 네 판을 지었고 셋이
 * 뚫렸다(위 표). 5차 리뷰가 4판에도 남은 갈래를 **여덟** 더 냈는데 전부 27/27 이고,
 * 뿌리는 **넷**이다 — ⓐ 자와 설정이 같은 realm 에 산다 · ⓑ 흔드는 입력이 `PORT` 하나다 ·
 * ⓒ 두 하네스가 «평범한 개발 조건» 을 안 만든다 · ⓓ 바이트로 본 표본이 URL 둘·GET 하나다.
 * **ⓐⓑ 는 아래에, ⓒⓓ 는 라이브 절 §못 보는 것에** 적혀 있다(그쪽이 그 둘의 자리다).
 * **재는 척하는 것보다 못 재는 것을 적는 편이 낫다** — 다음 사람이 여기서 같은 것을 또
 * 시도하지 않게 하는 것이 이 문단의 값이다.
 *
 * - **`.env` 가 `PORT` 를 안 말하는 기계(또는 그 값이 3001 인 기계)에서는 ①②의 구분력이
 *   *일부* 준다.** ①은 규칙의 답도 3001, 손으로 만든 값도 3001 이라 안 갈린다. **그러나
 *   ②④는 그 기계에서도 선다** — 쟀다(`fileEnv = {}` 로 실제 규칙 모듈을 돌렸다):
 *   순진한 손수 값 `` `http://127.0.0.1:${process.env.PORT ?? '3001'}` `` 은 ②에서
 *   `http://127.0.0.1:` 을 내고 ④에서 안 던진다. 앞 판이 *"구분력이 준다"* 고만 적은 것은
 *   **과소평가다.**
 *
 *   **정말 안 보이는 것은 «PORT 계약을 정확히 베낀 복제» 뿐이고, «해롭지 않다» 의 근거도
 *   «그 기계» 가 아니라 «계약을 정확히 베꼈다» 이다.** 조건을 `.env` 에 매어 적으면 사각이
 *   실제보다 좁아 보인다 — 계약을 정확히 베낀 복제도 **입력을 하나 더 보면**
 *   (`HOST` 등, 아래) `.env` 가 `PORT=3003` 을 말하는 기계에서도 해롭고 그때도 27/27 이다.
 *   (③은 그 조건과 **무관하게** 선다.)
 * - **흔드는 입력이 `PORT` 하나다.** 넷이 다 `PORT` 만 바꾸므로 **설정이 다른 입력을 하나
 *   더 보면** 안 보인다. 쟀다(리뷰어): 규칙의 답에 `process.env.HOST` 를 덧씌우면
 *   **27/27** 이고 `HOST=0.0.0.0 pnpm dev` 에서 대상이 `http://0.0.0.0:3003` 이 된다 —
 *   규칙이 `PROXY_HOST` 로 **일부러** 막아 둔 값이다. 위 「대상 호스트는 루프백이다」는
 *   **규칙**에만 서 있고 **설정**에는 안 서 있다. 규칙이 모르는 새 변수
 *   (`WIREBOUND_API_URL` 같은 것)를 하나 더 보는 판도 **27/27** 인데, 그때는 **배너가
 *   규칙의 답을 찍은 채** 프록시만 딴 데로 간다 — D4 의 «사람이 눈으로 가른다» 가 그
 *   자리에서 무너진다.
 * - **자와 설정이 같은 프로세스에 산다.** `resolveConfig` 는 이 저장소의 `vite.config.ts` 를
 *   **이 vitest 워커 안에서** 평가하므로, 설정의 최상위 코드가 **이 자의 전역을 갈아 끼울
 *   수 있다.** 쟀다(리뷰어): `globalThis.URL` 을 갈아 끼워 이 절의 `apiEnvFile()` 만 없는
 *   파일로 돌리면 **파일 갈래를 통째로 버린 설정이 27/27** 이고 대상은 `:3001` 이었다
 *   (`.env` 는 3003). 그 오염 없이 파일 갈래만 버리면 **25/27** 로 ①②가 정확히 잡는다.
 *   4판이 없앤 것은 «겹침» 이지 **realm** 이 아니다 — «규칙의 답» 과 «설정이 낸 대상» 은
 *   독립이 아니다. (`node:fs` 를 갈아 끼우는 것은 **안 통했다**: vitest 가 노드 빌트인을
 *   ESM 네임스페이스로 붙들어 CJS 모듈 객체 변조가 이 자에게 안 간다.)
 * - **런타임에 대상을 바꾸는 것**(`configure`·`bypass`·`configureServer`)은 값으로 못
 *   읽는다. `resolveConfig` 는 프록시 미들웨어를 아예 안 만들므로 그 함수들이 **여기서는
 *   안 돈다.** **그 갈래를 아래 라이브 절과 ws 절이 받는데, 조건이 붙으면 그쪽도 못 본다**
 *   — 라이브 절 §못 보는 것에 쟀다.
 * - **`'/api'` 보다 좁은 컨텍스트를 앞에 끼우는 것**은 이 절도 라이브 절도 못 본다.
 *   vite 는 **먼저 맞는 컨텍스트 하나**만 쓰는데 둘 다 `'/api'` 엔트리를 보고 그 컨텍스트에
 *   맞는 경로만 쏘기 때문이다(ws 절이 그 갈래를 하나 잰다 — 그쪽 머리말). **원인은
 *   컨텍스트 순서가 아니라 바이트로 본 표본이 URL 둘 · 메서드 GET 하나라는 것이고**,
 *   그래서 범위가 더 넓다 — 컨텍스트를 안 끼워도 `bypass` 나 `configureServer` 미들웨어로
 *   같은 일이 된다(라이브 절 §못 보는 것).
 * - **`build`·`preview`** 는 안 본다. `serve` 다.
 */

/** ④ 가 심을 값. **숫자가 아니면 규칙이 던진다**(`resolveApiPort`). */
const BOGUS_PORT = 'not-a-port'

describe('규칙이 낸 값이 그대로 대상이 된다 — 값 대 값', () => {
  /**
   * `apps/api/.env` 를 **이 자가 따로** 읽는다. `vite.config.ts` 의 `readApiEnvFile()` 을
   * 베끼는 것이 아니라 **같은 파일을 독립적으로 보는 것**이다 — 설정이 다른 파일을 읽게
   * 되면 두 답이 갈려 ①②가 빨개진다(리뷰 델타 W6 이 열어 둔 자리다).
   * **파일이 없으면 빈 객체다** — D6.
   */
  function apiEnvFile(): Record<string, string | undefined> {
    try {
      return parseEnv(readFileSync(new URL('../../api/.env', import.meta.url), 'utf8')) as Record<
        string,
        string | undefined
      >
    } catch {
      return {}
    }
  }

  /** 셸에 이 값을 심었을 때 **규칙이 내는 답.** 수를 박지 않는다. */
  function ruleAnswer(shellPort: string | undefined): string {
    return resolveApiProxyTarget({
      shellEnv: shellPort === undefined ? {} : { PORT: shellPort },
      fileEnv: apiEnvFile(),
    })
  }

  /**
   * 셸에 이 값을 심고 이 저장소의 `vite.config.ts` 를 **그대로 평가한다.**
   * `resolveConfig` 가 내는 것은 라이브 절이 읽는 `viteServer.config` 와 같은 자리다.
   * **끝나면 `process.env.PORT` 를 되돌린다** — 안 되돌리면 이 파일 뒤의 것이 심은 값을 본다.
   */
  async function resolveUnder(shellPort: string | undefined): Promise<ResolvedConfig> {
    const saved = process.env.PORT
    if (shellPort === undefined) {
      delete process.env.PORT
    } else {
      process.env.PORT = shellPort
    }
    try {
      return await resolveConfig(
        { root: WEB_ROOT, configFile: WEB_CONFIG_FILE, logLevel: 'silent' },
        'serve',
      )
    } finally {
      if (saved === undefined) {
        delete process.env.PORT
      } else {
        process.env.PORT = saved
      }
    }
  }

  /** vite 가 실제로 쓸 `'/api'` 대상. 문자열 축약형이면 그 문자열 자체다. */
  function targetOf(config: ResolvedConfig): unknown {
    const entry = config.server.proxy?.['/api']
    return typeof entry === 'object' && entry !== null ? entry.target : entry
  }

  /** ③ 이 심을 임시 포트. **파일의 값·기본값과 다른 수**여야 그 판이 선다. */
  let plantedPort = ''
  let targetWithoutShell: unknown
  let targetWithEmptyShell: unknown
  let targetWithPlantedShell: unknown
  /** ④ — 규칙이 던진 말과 설정이 던진 말. 둘이 같아야 한다. */
  let ruleRejection = ''
  let configRejection = ''

  beforeAll(async () => {
    const filePort = apiEnvFile().PORT
    do {
      plantedPort = String(1024 + (randomBytes(2).readUInt16BE(0) % 60000))
    } while (plantedPort === filePort || plantedPort === DEFAULT_API_PORT)

    targetWithoutShell = targetOf(await resolveUnder(undefined))
    targetWithEmptyShell = targetOf(await resolveUnder(''))
    targetWithPlantedShell = targetOf(await resolveUnder(plantedPort))

    try {
      ruleAnswer(BOGUS_PORT)
    } catch (error) {
      ruleRejection = (error as Error).message
    }
    try {
      await resolveUnder(BOGUS_PORT)
    } catch (error) {
      configRejection = (error as Error).message
    }
  }, 30_000)

  it('① 셸에 `PORT` 가 없으면 **파일 갈래**가 그대로 대상이 된다 — 규칙과 같은 답이다', () => {
    expect(targetWithoutShell).toBe(ruleAnswer(undefined))
  })

  it('② 빈 문자열은 «안 줬다»와 같은 뜻이다 — 그 뜻이 대상까지 간다', () => {
    expect(targetWithEmptyShell).toBe(ruleAnswer(''))
  })

  it('③ 셸이 파일을 이긴다 — 심은 수가 그대로 대상이 된다', () => {
    // **수를 박지 않는다** — 심은 것은 무작위 임시 포트이고, 그것을 대상으로 옮기는 것은
    // 규칙이다. 이 줄은 그 임시 포트가 정말 대상에 실렸는지를 말해 주는 카나리아다.
    expect(ruleAnswer(plantedPort)).toBe(`http://127.0.0.1:${plantedPort}`)
    expect(targetWithPlantedShell).toBe(ruleAnswer(plantedPort))
  })

  it('④ 규칙이 거부하는 값은 **설정도 거부한다** — 에디터만 기본값으로 뜨지 않는다', () => {
    // 카나리아: 규칙이 정말 던지는지 먼저 본다. 안 던지면 아래가 헛돈다.
    expect(ruleRejection).toMatch(/숫자가 아닙니다/)
    expect(configRejection).toContain(ruleRejection)
  })
})

/**
 * **규칙이 정한 포트로 요청이 실제로 간다 — 라이브**(P10-2 이월 G).
 *
 * 배선 절이 원문의 **자리**에 매여 있던 케이스를 여기로 옮겼다(무엇이 났는지는 위
 * «값 대 값» 절 머리말의 표가 갖는다). 방식은 5차의 ws 절과 **한 벌이다** — 스텁 상류 +
 * 이 저장소의 `vite.config.ts` 를 그대로 띄운 진짜 dev 서버 + 되돌아온 바이트.
 *
 * **이 절은 «어디로 갔나»만 잰다.** 「대상을 손으로 만들지 않는다」는 여기서 **못 잰다** —
 * 손으로 만든 값이 이 절이 심는 셸 `PORT` 를 똑같이 읽으면 되돌아온 바이트까지 같아지기
 * 때문이다(리뷰어가 지어 전량 초록을 냈다. 그것이 «값 대 값» 절이 생긴 이유다).
 *
 * # 다른 것이 하나 있다 — **`target` 을 안 갈아 끼운다**
 *
 * ws 절은 `target` 을 스텁으로 **덮어서** 띄우므로 *"대상 값 자체는 여기서 안 잰다"* 고
 * 스스로 적는다. 이 절이 그 자리를 받는다: **덮지 않고, 대신 규칙의 입력을 정한다** —
 * 스텁을 임시 포트에 세우고 `process.env.PORT` 에 그 수를 심는다. 셸이 파일을 이기는 것이
 * 규칙이므로(`resolveApiPort`), 배선이 온전하면 대상이 **그 스텁**이 된다.
 *
 * 그래서 이 절은 **gitignore 된 `apps/api/.env` 에 매이지 않는다** — 그 파일에 무엇이
 * 있든(없어도) 결과가 같다. 앞 판의 약점이 그 매임이었다.
 *
 * # 무엇이 닫히나 — 그리고 **어디까지만** 닫히나
 *
 * **값으로도 못 읽는 것**이 여기서 닫힌다 — `configure`·`bypass`·`configureServer` 처럼
 * 런타임에 대상을 바꾸는 **임의의 함수**(5차 표의 그 넷)와, 값을 구해 놓고 안 꽂거나
 * `preview.proxy` 에만 꽂는 갈래. 설정을 **평가해서** 답할 수 있는 것은 위 «값 대 값»
 * 절이 이미 잠갔다 — 이 절은 그 위에 **되돌아온 바이트**를 얹는다.
 *
 * **다만 그것은 «조건 없는 변조» 에 대해서만 참이다.** 앞 판이 «값 대 값» 절 §사각에
 * *"런타임에 대상을 바꾸는 임의의 함수는 라이브 절과 ws 절이 바이트로 잡는다"* 고 적었는데
 * **그 문장은 거짓이었다** — 조건을 하나 붙이면 두 절 다 못 본다. 아래 §못 보는 것의 첫
 * 항목이 그것이다.
 *
 * # 이 자가 못 보는 것 — 정직하게 적는다
 *
 * - **두 절 다 «평범한 개발 조건» 에서는 한 번도 안 돈다.** 이 절은 셸 `PORT` 를 **심고**
 *   ws 절은 `target` 을 **덮는다.** 둘 다 아닌 상태 — 셸이 조용하고 대상이 파일 갈래인 것,
 *   **곧 `pnpm dev`** — 를 바이트로 본 자는 **없다.** 그래서 «그 조건에서만» 대상을 갈아
 *   끼우는 것은 두 절 다 못 본다. 쟀다(리뷰어):
 *   `configure(_p, o) { if (process.env.PORT === undefined && o.target === apiProxyTarget)
 *   o.target = 'http://127.0.0.1:3001' }` 는 **27/27** 이고 소켓이 실제로 3001 로 간다
 *   (`ECONNREFUSED 127.0.0.1:3001` 이 다이얼한 수를 말한다). 배너 플러그인의
 *   `configureServer` 에서 `server.config.server.proxy['/api']` 를 만지는 판도 같다 —
 *   프록시 미들웨어는 `configureServer` 훅들 **뒤에** 등록된다. 두 가드(«셸 `PORT` 없음» ·
 *   «아무도 대상을 안 덮었다»)는 자를 이름으로 알아보지 않는다 — 개발자가 «안전한 폴백»
 *   이라고 쓸 만한 모양인데, 그 둘이 곧 «두 하네스가 만들지 않는 조건» 이다.
 *   앞 판이 쟀던 «`configure` 5개 빨강 / `configureServer` 6개 빨강» 은 **조건 없는
 *   변조**에 대한 수치이고, 조건 하나에 **0** 이 된다.
 * - **바이트로 본 표본이 URL 둘 · 메서드 GET 하나다.** 이 절은 `GET /api/proxy-target-probe`,
 *   ws 절은 `GET /api/projects/…/ws` 하나씩이다. 그러므로 **`/api` 의 부분집합만 딴 데로
 *   보내는 것**은 모양을 안 가리고 다 통과한다. 쟀다(리뷰어): `bypass` 로 GET 아닌 것만
 *   막으면 **27/27** 인데 POST·PATCH·DELETE 가 전부 `index.html` 을 받는다 —
 *   **에디터의 쓰기가 통째로 죽는다.** 배너의 `configureServer` 에서
 *   `server.middlewares.use('/api/auth', …)` 로 가로채는 판도 **27/27** 이고, 그쪽은
 *   `server.proxy` 를 **손도 안 대므로** 위 «값 대 값» 절이 **구조적으로** 못 본다.
 *   이것이 «값 대 값» §사각 「좁은 컨텍스트를 앞에 끼우는 것」의 진짜 범위다.
 * - **파일 쪽 갈래.** 셸 값을 심으므로 `fileEnv` 를 빈 객체로 바꿔도 초록이다. **그 갈래는
 *   위 «값 대 값» 절 ①②가 잰다** — 셸을 안 심고 규칙의 답과 대조하므로 `readApiEnvFile()`
 *   이 값을 버리면 거기서 갈린다(`apps/api/.env` 가 `PORT` 를 말할 때. 그쪽 머리말의
 *   §못 보는 것). **되돌아온 바이트로 그 갈래를 본 자는 여전히 없다.**
 * - **대상에 무엇이 꽂혔는가.** 여기서는 심은 셸 값과 우연히 같아질 수 있다 — 위
 *   «값 대 값» 절이 그 축을 갖는다.
 * - **업그레이드**는 안 본다(ws 절이 갖는다). 여기서 보내는 것은 평범한 REST 하나다.
 * - **`build`·`preview`** 는 안 본다. `serve` 다.
 */

/**
 * 게이트가 닫히면 **아무 바이트도 안 온다** — 그때 매달리지 않도록 여기서 끊는다.
 * 두 하네스가 같은 값을 쓴다.
 */
const SILENCE_TIMEOUT_MS = 3_000

/** 스텁 상류만 낼 수 있는 표식. **실서버가 답해도 이 글자는 안 온다.** */
const TARGET_STUB_MARKER = 'x-wirebound-target-stub'

/** 프록시를 지나갈 평범한 경로. 라우트가 아니어도 스텁이 답한다. */
const PROBE_URL = '/api/proxy-target-probe'

describe('프록시 대상은 규칙이 정한 포트로 간다 — 라이브', () => {
  let viteServer: ViteDevServer
  let upstream: Server
  /** 스텁의 주소. **배선이 온전하면 대상이 이것이어야 한다.** */
  let expectedTarget = ''
  /** `process.env.PORT` 의 원래 값. 이 절이 끝나면 되돌린다. */
  let savedPort: string | undefined
  /** 심은 포트로 규칙이 내는 답. 카나리아가 대상과 대조한다. */
  let plantedPort = ''

  /**
   * **요청을 보내기 전**의 `'/api'` 엔트리. 요청 뒤에 읽으면 안 된다 — http-proxy 가
   * 첫 요청에서 `opts.target` 을 `url.parse()` 결과로 **제자리 바꾼다**(ws 절이 잰 것과
   * 같은 자리다).
   */
  let configuredEntry: ProxyOptions | undefined

  let status = 0
  let marker: string | null = null
  let sightedUrl: string | undefined

  beforeAll(async () => {
    // ── 1. 스텁 상류. 실제 api 도 DB 도 필요 없다.
    upstream = createHttpServer((req, res) => {
      sightedUrl = req.url ?? ''
      res.writeHead(200, { [TARGET_STUB_MARKER]: 'yes' })
      res.end('stub')
    })
    await new Promise<void>((resolve) => upstream.listen(0, '127.0.0.1', resolve))
    plantedPort = String((upstream.address() as AddressInfo).port)
    // **규칙의 입력을 자가 정한다.** 셸이 `apps/api/.env` 를 이기는 것이 규칙이므로
    // (`resolveApiPort`), 이 한 줄이 «대상은 어디여야 하는가»를 이 절 안에서 결정한다.
    expectedTarget = resolveApiProxyTarget({ shellEnv: { PORT: plantedPort } })
    savedPort = process.env.PORT
    process.env.PORT = plantedPort

    // ── 2. 진짜 vite dev 서버. **`server.proxy` 를 안 덮는다** — 그것이 이 절의 요점이다.
    viteServer = await createViteServer({
      root: WEB_ROOT,
      configFile: WEB_CONFIG_FILE,
      logLevel: 'error',
      // ws 절과 같은 이유다(그쪽 주석) — 이 하네스는 모듈을 하나도 요청하지 않는데
      // 스캐너가 배경에서 `index.html` 을 훑기 시작해 `close()` 와 경합한다.
      optimizeDeps: { noDiscovery: true, include: [] },
    })
    const entry = viteServer.config.server.proxy?.['/api']
    configuredEntry = typeof entry === 'object' ? { ...entry } : undefined
    await viteServer.listen()
    const address = viteServer.httpServer?.address() as AddressInfo
    const authority = `${address.family === 'IPv6' ? `[${address.address}]` : address.address}:${address.port}`

    // ── 3. 평범한 REST 하나. **되돌아온 표식이 이 절의 판정이다.**
    try {
      const response = await fetch(`http://${authority}${PROBE_URL}`, {
        signal: AbortSignal.timeout(SILENCE_TIMEOUT_MS),
      })
      status = response.status
      marker = response.headers.get(TARGET_STUB_MARKER)
      await response.arrayBuffer()
    } catch {
      // 못 갔으면 아래 케이스가 `0` 을 보고 빨개진다.
    }
  }, 30_000)

  afterAll(async () => {
    await viteServer?.close()
    await new Promise<void>((resolve) => {
      if (!upstream?.listening) {
        resolve()
        return
      }
      upstream.close(() => resolve())
    })
    // **환경을 되돌린다.** 안 되돌리면 이 파일 뒤의 것이 심은 값을 본다.
    if (savedPort === undefined) {
      delete process.env.PORT
    } else {
      process.env.PORT = savedPort
    }
  })

  /**
   * **카나리아이지 독립된 축이 아니다** — 아래 라이브 단언이 죽었을 때 *왜* 죽었는지를
   * 가르는 자리다(5차가 값 읽기를 카나리아로 남긴 것과 같은 이유). 대상 값이 틀리면 이
   * 케이스와 아래가 **함께** 죽고, 그때 이쪽 메시지가 «어느 수로 갔는지»를 말한다.
   */
  it('카나리아 — 심은 포트가 그대로 대상이 됐다', () => {
    expect(viteServer.config.configFile?.replace(/\\/g, '/')).toMatch(
      /apps\/web\/vite\.config\.ts$/,
    )
    // 문자열 축약형(`'/api': 'http://…'`)이면 여기서 걸린다.
    expect(configuredEntry).toBeDefined()
    // **수를 여기 박지 않는다** — 규칙이 그 수를 내고, 심은 것은 임시 포트다.
    expect(expectedTarget).toBe(`http://127.0.0.1:${plantedPort}`)
    expect(configuredEntry?.target).toBe(expectedTarget)
  })

  /**
   * **이 절의 판정이다.** 대상을 수로 박아 두거나(임시 포트와 같을 수 없다), 값을 구해
   * 놓고 안 꽂거나, `preview.proxy` 에 꽂거나, 중복 키로 뒤에서 덮거나, `configure` 로
   * 런타임에 바꾸거나, `bypass` 로 상류에 안 보내면 — **표식이 안 온다.**
   *
   * **`target:` 이 엔트리의 몇째 키인지는 안 본다.** 앞 판이 그것을 요구해 옳은 설정을
   * 죽였다(위 배선 절 머리말의 표).
   */
  it('그 대상으로 요청이 실제로 간다 — 스텁이 답한 표식이 돌아온다', () => {
    expect(status).toBe(200)
    expect(marker).toBe('yes')
    expect(sightedUrl).toBe(PROBE_URL)
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
 * - **대상(`target`) 값 자체**는 여기서 안 잰다 — 스텁으로 바꿔 놓기 때문이다. **그 축은
 *   위 두 절이 나눠 갖는다:** «값 대 값» 절이 설정을 평가해 **무엇이 꽂혔는지**를 규칙의
 *   답과 대조하고, «라이브» 절이 `target` 을 덮지 않은 채 **규칙의 입력**(`process.env.PORT`)
 *   에 스텁의 임시 포트를 심어 **요청이 거기 닿는지**를 본다.
 * - **실제 api 가 그 업그레이드에 무엇으로 답하는지**는 안 잰다. 여기서 재는 것은
 *   *"vite 가 업그레이드를 상류까지, 경로·`Host`·`Cookie` 를 보존한 채 넘기는가"* 다.
 * - **위 표의 수는 «조건 없는 변조» 에 대한 것이다.** 이 절은 `target` 을 덮고 라이브 절은
 *   셸 `PORT` 를 심으므로, **«셸이 조용하고 아무도 대상을 안 덮은 상태» — 곧 `pnpm dev` —**
 *   에서만 도는 변조는 두 절 다 못 본다(쟀다: 27/27). 표본이 `GET` 하나뿐이라 `/api` 의
 *   **부분집합**만 딴 데로 보내는 것도 못 본다. 자세한 것은 **라이브 절 §못 보는 것**이
 *   갖는다 — 여기 두 벌로 적지 않는다.
 * - `build`·`preview` 는 안 본다. 이 절이 재는 것은 `serve` 다.
 *
 * # 값 (2026-09-03, 이 기계)
 *
 * 이 파일 단독 실행 **약 1.0초**(vitest 보고 기준 테스트 70~150ms) · 5회 연속 22/22 ·
 * **5173 을 점유한 채로도 22/22**(vite 가 `pnpm dev` 와 똑같이 올려 잡는다) ·
 * **동시 2회 실행도 각각 22/22** · 끝난 뒤 남는 프로세스·리스닝 포트 **0**.
 */

/** 실시간 라우트(`apps/api/src/ws/routes.ts` 의 `'/:projectId/ws'`)가 붙는 자리. */
const REALTIME_URL = '/api/projects/9f1d0c3e-0000-4000-8000-000000000001/ws'

/** D4 의 근거를 값으로 재기 위해 실어 보내는 쿠키. 서버의 `projectGuard` 가 보는 자리다. */
const SESSION_COOKIE = 'wb_session=proxy-harness-probe'

/** 스텁 상류만 낼 수 있는 표식. **실서버가 답해도 이 글자는 안 온다.** */
const STUB_UPGRADE_MARKER = 'x-wirebound-stub-upgraded'
const STUB_REST_MARKER = 'x-wirebound-stub-rest'

/** RFC 6455 의 그 상수. 스텁이 진짜 핸드셰이크를 완성하도록 쓴다. */
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

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
