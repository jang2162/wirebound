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
 * | 70 | **버그다** | 사용자가 고칠 수 없다. 그래서 1~4와 번호가 멀다 |
 *
 * 70은 `sysexits.h`의 `EX_SOFTWARE`다. **1~4에 붙여 5로 두지 않는 것이 판정이다** —
 * 그 자리는 앞으로 사용자가 고칠 수 있는 갈래가 늘어날 자리이고, 버그를 거기 섞으면
 * 스크립트가 *"다시 해 볼 만한 실패"*와 *"보고할 실패"*를 가르지 못한다.
 *
 * **3과 4가 갈리는 것이 요점이다.** 둘을 접으면 *"주소가 틀렸다"*와 *"권한이 없다"*가 한
 * 코드로 나가고, 그때 사람이 볼 곳이 둘로 늘어난다 — `wireb pull`의 값이 정확히 그
 * 갈래를 말해 주는 것이다(T6).
 */
export const EXIT = {
  ok: 0,
  usage: 1,
  config: 2,
  server: 3,
  unreachable: 4,
  internal: 70,
} as const

export type ExitCode = (typeof EXIT)[keyof typeof EXIT]

/**
 * 명령이 정상적으로 실패했을 때 던지는 것. **`run`이 이것만 문장과 코드로 바꾼다** —
 * 그 밖의 예외는 버그이므로 다르게 다룬다(`run.ts`).
 */
export class CliError extends Error {
  readonly code: ExitCode

  constructor(code: ExitCode, message: string) {
    super(message)
    this.name = 'CliError'
    this.code = code
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
