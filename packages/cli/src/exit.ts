/**
 * 종료 코드 표. **한 자리에 둔다** — 흩어지면 같은 실패가 명령마다 다른 코드로 나가고,
 * 스크립트가 그것으로 갈래를 만들 수 없다(`apps/api`의 `ERROR_STATUS`와 같은 자세).
 *
 * **가르는 선은 *"사람이 무엇을 해야 하는가"*다.**
 *
 * | 코드 | 뜻 | 할 일 |
 * |---|---|---|
 * | 0 | 됐다 | — |
 * | 1 | **명령을 잘못 썼다** | 쓰임말을 읽고 다시 친다 |
 * | 2 | **설정·자격이 없다** | `wireb init` 또는 `wireb login` |
 * | 3 | **서버가 거절했다** | 응답의 문장을 읽는다(권한·프로젝트 불일치 등) |
 * | 4 | **서버에 닿지 못했다** | 주소·네트워크·서버 기동을 본다 |
 * | 10 | **명령이 제대로 서서 결함을 찾았다** | 설계서를 고친다. `wireb lint`가 유일한 소유자다 |
 * | 70 | **버그다** | 사용자가 고칠 수 없다. 그래서 1~4와 번호가 멀다 |
 *
 * 70은 `sysexits.h`의 `EX_SOFTWARE`다. **1~4에 붙여 5로 두지 않는 것이 판정이다** —
 * 그 자리는 앞으로 사용자가 고칠 수 있는 갈래가 늘어날 자리이고, 버그를 거기 섞으면
 * 스크립트가 *"다시 해 볼 만한 실패"*와 *"보고할 실패"*를 가르지 못한다.
 *
 * **3과 4가 갈리는 것이 요점이다.** 둘을 접으면 *"주소가 틀렸다"*와 *"권한이 없다"*가 한
 * 코드로 나가고, 그때 사람이 볼 곳이 둘로 늘어난다 — `wireb pull`의 값이 정확히 그
 * 갈래를 말해 주는 것이다.
 *
 * ---
 *
 * # `findings`가 1~4 밖인 이유
 *
 * **1~4는 *"명령이 서지 못했다"*이고 lint의 발견은 *"명령이 제대로 서서 결함을 찾았다"*다.**
 * 둘을 같은 번호에 두면 스크립트가 *"lint가 못 돌았다"*와 *"lint가 결함을 찾았다"*를 못
 * 가른다 — CI가 전자를 후자로 읽으면 **설계서에 결함이 없는데도 빨개지고**, 후자를 전자로
 * 읽으면 **결함을 놓친 채 초록이 된다.**
 *
 * **왜 10인가.** 5~9는 위 문단이 예약해 둔 자리다(*"사용자가 고칠 수 있는 갈래가 늘어날
 * 자리"* — 그 갈래는 전부 *"명령이 서지 못했다"*이므로 1~4 옆에 붙어야 한다). 64~78은
 * `sysexits.h`가 쓰는 구간이라 `EX_USAGE`(64)·`EX_SOFTWARE`(70)와 뜻이 부딪힌다. 그
 * 사이의 10이 **어느 관례와도 안 겹치는 가장 가까운 자리**다.
 *
 * **무엇이 이 번호를 만드는가 — `error`가 하나라도 있을 때다. `warning`만 있으면 0이다.**
 * 근거는 실측이다(그 수를 못박는 것은 `packages/themes/test/warning-channel.test.ts`): 시스템 테마
 * `portal`·`docs`는 `resolveTheme`이 내는 경고를 **하나씩** 갖는다
 * (`theme-other:warning` — `components.Tree.parts.node.paddingX`). `warning`으로 실패를
 * 내면 **문서를 아무리 잘 써도 그 테마를 고른 프로젝트가 CI에서 빨개진다.**
 *
 * **올릴 수는 있다** — `wireb lint --fail-on warning`. 기본값은 바꾸지 않는다.
 */
export const EXIT = {
  ok: 0,
  usage: 1,
  config: 2,
  server: 3,
  unreachable: 4,
  /** `wireb lint`가 결함을 찾았다. **명령은 제대로 섰다** — 위 "findings" 절. */
  findings: 10,
  internal: 70,
} as const

export type ExitCode = (typeof EXIT)[keyof typeof EXIT]

/**
 * 명령이 정상적으로 실패했을 때 던지는 것. **`run`이 이것만 문장과 코드로 바꾼다** —
 * 그 밖의 예외는 버그이므로 다르게 다룬다(`run.ts`).
 */
export class CliError extends Error {
  readonly code: ExitCode

  /**
   * 서버가 거절했을 때의 **HTTP 상태 코드**. 그 밖의 갈래에서는 `undefined`다.
   *
   * ---
   *
   * # 왜 코드 3 하나로 안 접나
   *
   * `wireb`에게는 3 하나로 충분하다 — 사람이 문장을 읽는다. **에이전트는 다르다:**
   * 409(*"문서가 내 밑에서 움직였다"*)와 423(*"사람이 그 자리를 잡고 있다"*)은
   * **해야 할 일이 정반대**다(설계서 「LLM 편집 경로」 · `apps/api/README.md`의 잠금 절: 409는 재조회 후
   * 재시도, 423은 재조회해도 안 풀린다). 도구가 그 둘을 가르려면 상태 코드가 필요하고,
   * **문장에서 숫자를 되파는 것은 서버가 문장을 바꾸는 날 조용히 틀린다.**
   *
   * **종료 코드를 안 늘린다.** 이 값은 갈래를 만들지 않는다 — `run`은 여전히
   * `error.code`만 본다(`exit.ts`의 표가 그대로다).
   */
  readonly status: number | undefined

  /**
   * 서버가 거절하며 준 `Retry-After`(초). 없거나 초가 아니면 `undefined`다. `wireb export`가 이것을 따라 다시 보낸다
   * (`commands/export.ts`의 «밀려 있으면 몇 번 다시 보낸다»). **HTTP 날짜 꼴은 안 읽는다** — 우리 서버는 초만 쓴다.
   */
  readonly retryAfterSeconds: number | undefined

  constructor(code: ExitCode, message: string, status?: number, retryAfterSeconds?: number) {
    super(message)
    this.name = 'CliError'
    this.code = code
    this.status = status
    this.retryAfterSeconds = retryAfterSeconds
  }
}

export function usageError(message: string): CliError {
  return new CliError(EXIT.usage, message)
}

export function configError(message: string): CliError {
  return new CliError(EXIT.config, message)
}

export function serverError(message: string): CliError {
  return new CliError(EXIT.server, message)
}

export function unreachableError(message: string): CliError {
  return new CliError(EXIT.unreachable, message)
}
