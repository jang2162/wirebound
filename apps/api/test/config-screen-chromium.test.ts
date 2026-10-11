/**
 * **`SCREEN_CHROMIUM_PATH` — 기계에 있는 브라우저를 가리키는 유일한 길.**
 *
 * `chromiumScreenRenderer`의 `executablePath` 옵션을 바깥에서 채우는 길이 이 env 하나다 —
 * 이것이 없으면 그 옵션은 **바깥에서 닿을 수 없다.** `playwright-core`(1.62.1)는 실행 파일을 가리키는
 * 환경변수를 **안 낸다** — 쟀다: `lib/` 전체에서 `PLAYWRIGHT_*` 이름을 훑으면
 * `*_EXECUTABLE_PATH`는 `PLAYWRIGHT_MCP_EXECUTABLE_PATH` 하나이고 그것은 Playwright MCP
 * 서버의 것이지 `chromium.launch()`의 것이 아니다. `PLAYWRIGHT_BROWSERS_PATH`는 *캐시
 * 디렉터리*라 그 안이 playwright의 `chromium_headless_shell-<리비전>/…` 배치여야 한다 —
 * 배포판 chromium을 그 자리에 넣는 것은 절차가 아니라 손질이다.
 *
 * **그리는 자를 실제로 만드는 것은 `main.ts` 하나이고** 그 줄이 남아 있는지는
 * `screen-renderer-census.test.ts`가 센다. 여기서 재는 것은 **그 앞 단계** — env에서 값이
 * 어떤 모양으로 `ApiConfig`에 앉는가다.
 */
import { describe, expect, it } from 'vitest'
import { loadConfig } from '../src/config'

const BASE = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgres://wirebound:wirebound@127.0.0.1:5433/wirebound_test',
} as const

describe('SCREEN_CHROMIUM_PATH', () => {
  it('안 주면 `undefined` 다 — 그때 `playwright-core` 가 자기 캐시에서 찾는다', () => {
    expect(loadConfig({ ...BASE }).screenChromiumPath).toBeUndefined()
  })

  it('주면 그 문자열이 그대로 온다', () => {
    expect(loadConfig({ ...BASE, SCREEN_CHROMIUM_PATH: '/usr/bin/chromium' }).screenChromiumPath).toBe('/usr/bin/chromium')
  })

  /**
   * **빈 문자열은 *"안 줬다"*와 같은 뜻이다.** `.env.example`이 주석으로 든 줄을 사람이
   * 주석만 풀고 값을 안 채우는 자리다. 그대로 넘기면 `executablePath: ''`가 되고,
   * playwright 가 내는 문장은 *"Executable doesn't exist at "* — **경로가 없는 채로 끝난다.**
   * 그 문장은 `screenFailures[].reason`을 타고 사람에게 도달하므로 조용하지는 않지만,
   * 무엇을 고쳐야 하는지 말하지 않는다.
   */
  it('빈 문자열은 안 준 것과 같다 — 끝이 잘린 오류 문장을 만들지 않는다', () => {
    expect(loadConfig({ ...BASE, SCREEN_CHROMIUM_PATH: '' }).screenChromiumPath).toBeUndefined()
  })

  /** 공백만 든 값은 **경로다.** 눌러 주면 *"띄어쓰기로 시작하는 경로"*를 못 쓰게 된다. */
  it('공백을 눌러 주지 않는다 — 경로의 일부일 수 있다', () => {
    expect(loadConfig({ ...BASE, SCREEN_CHROMIUM_PATH: ' /opt/chromium' }).screenChromiumPath).toBe(' /opt/chromium')
  })
})
