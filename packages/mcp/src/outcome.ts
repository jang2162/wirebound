/**
 * **붙지 못한 것과 결과를 낸 것을 가른다**(D8).
 *
 * ---
 *
 * # MCP에는 갈래가 셋이다 — 계획서는 둘로 적었다 (재라 #3 — 쟀다)
 *
 * 진짜 `Client`로 재서 확인했다.
 *
 * | 서버가 한 것 | 클라이언트가 본 것 |
 * |---|---|
 * | `{ content }` | 정상 결과 |
 * | `{ content, isError: true }` | **정상 응답인데 `isError`가 서 있다** — 예외가 아니다 |
 * | 예외를 던진다 | **JSON-RPC 오류**(`McpError`) |
 *
 * # CLI의 종료 코드 표를 그 셋에 나눠 싣는다
 *
 * | `wireb` | 여기 | 왜 |
 * |---|---|---|
 * | 1 (명령을 잘못 썼다) | **JSON-RPC 오류** | 부르는 쪽이 요청을 잘못 만들었다. 답은 도구 스키마가 갖고 있고 에이전트가 문장을 읽을 일이 아니다 |
 * | 2·3·4 (설정·자격·서버) | **`isError: true` 결과** | **에이전트가 그 문장을 읽어야 한다**(D4 — *"`wireb init`을 치게 해야 한다"*). JSON-RPC 오류로 내면 호스트가 그것을 *"도구가 고장났다"*로 접고 모델에 안 보이는 판이 있다 |
 * | 0·10 (제대로 서서 결과를 냈다) | **정상 결과** | **`validate`가 결함을 찾은 것은 오류가 아니다.** 오류로 내면 에이전트가 재시도한다 |
 *
 * # 문장 앞에 종료 코드를 단다
 *
 * `[wireb 코드 2] …`. **같은 상태를 두 도구가 같은 값으로 말한다** — 사람이 `wireb`를 치고
 * 에이전트가 이 도구를 부를 때 둘이 같은 번호를 보는 것이, *"같은 함수를 부른다"*를 눈에
 * 보이게 만드는 자리다. 번호를 지어내지 않는다: `CliError.code`를 그대로 옮긴다.
 */
import { CliError, EXIT } from '@wirebound/cli/embed'

/** 도구 하나가 낸 것. **글자와 `isError` 둘뿐이다** — 프로토콜 모양은 `server.ts`가 만든다. */
export interface ToolOutcome {
  text: string
  /** `true`면 *"도구가 서지 못했다"*. 결함을 찾은 것은 여기 해당하지 않는다. */
  isError: boolean
}

/** 결과를 낸 것. JSON을 그대로 싣는다 — 에이전트가 읽는 것이 값이지 글자 모양이 아니다. */
export function toolResult(value: unknown): ToolOutcome {
  return { text: JSON.stringify(value, null, 2), isError: false }
}

/**
 * **`CliError`만 여기서 문장이 된다.** 그 밖의 예외는 버그이므로 다르게 다룬다 —
 * `run.ts`가 `CliError`만 잡는 것과 같은 규칙이고, 여기서 전부 삼키면 우리 쪽 버그가
 * *"설정을 고치세요"*로 위장한다.
 *
 * ---
 *
 * # 설정 갈래에는 **어디서 찾았는지**를 덧붙인다
 *
 * `wireb`의 문장은 *"`.wirebound.json`을 찾을 수 없습니다. 리포 뿌리에서 `wireb init`을
 * 먼저 실행하세요"*다. **사람에게는 그것으로 충분하다** — 자기가 어느 디렉터리에서 쳤는지
 * 안다. **에이전트는 모른다:** 이 서버를 띄운 것은 호스트이고 그 작업 디렉터리는 에이전트가
 * 고른 것이 아니다. 그 값을 안 말하면 *"리포 뿌리에서 실행하세요"*가 **어느 리포인지 모르는
 * 지시**가 된다.
 *
 * **문장을 다시 쓰지 않는다.** `wireb`의 문장을 그대로 옮기고 자리만 덧붙인다 — 두 도구가
 * 다른 말을 하면 사람이 원인을 둘로 센다(`binding.ts`의 `SERVER_HINT`가 같은 자세다).
 */
export function toolFailure(error: CliError, cwd: string): ToolOutcome {
  const head = `[wireb 코드 ${error.code}] ${error.message}`
  const text = error.code === EXIT.config ? `${head}\n(MCP 서버가 ${cwd} 에서부터 위로 찾았습니다)` : head
  return { text, isError: true }
}

/**
 * `wireb` 갈래인가. **`instanceof`로 본다** — `tsdown`이 진입점을 나눠도 공유 청크 하나를
 * 보므로 클래스가 두 벌이 되지 않는다(재라 #5에서 확인했다).
 *
 * **코드를 안 가른다.** `CliError`는 그 자체가 *"명령이 정상적으로 실패했다"*이고
 * (`exit.ts`), 그 전부를 에이전트가 읽어야 한다. **인자 모양이 틀린 것은 여기 오지 않는다** —
 * `server.ts`가 표로 먼저 보고 JSON-RPC 오류로 낸다.
 */
export function isToolFailure(error: unknown): error is CliError {
  return error instanceof CliError
}
