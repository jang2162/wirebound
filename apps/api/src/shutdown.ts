/**
 * **신호를 받으면 도는 요청을 끝까지 답한 뒤 닫는다 — 한도 안에서.** `main.ts`가 부른다.
 *
 * # 신호 셋을 다 여기서 받는다
 *
 * `SIGTERM`(docker stop · systemd · `tsx watch` 재시작) · `SIGINT`(Ctrl-C) · `SIGHUP`(터미널의 끊김 — 창을 닫은 판은 `apps/api/README.md` 「끄기」 절) 모두 «닫아라»다.
 * **`SIGHUP`을 안 받으면** node 의 기본 동작대로 곧바로 죽어 도는 요청이 끊긴다. 신호 처리를 브라우저를 띄우는 자에게 안
 * 맡기는 까닭은 `services/screen-render-chromium.ts`의 `LEAVE_SIGNALS_TO_SERVER`가 든다.
 *
 * **같은 신호가 두 번 오는 것은 정상 경로다** — `pnpm start` 아래에서 터미널의 Ctrl-C 한 번이 node 에 두 번 닿는다(전경 그룹으로
 * 한 번 · pnpm 이 되전달해 한 번). 그래서 둘째 신호를 «기다리지 말고 끝내라»로 읽지 않는다 — 읽으면 한 번 누른 Ctrl-C 가
 * 그리던 pptx 를 끊는다(잰 값 — 둘째 신호에 끝내게 한 판 · `pnpm start` 의 전경 그룹에 SIGINT 또는 SIGTERM 하나: 82ms 에 종료 1 ·
 * 응답 소켓 끊김). 기다림을 끊는 것은 아래 한도 하나다.
 *
 * # 한도가 있는 까닭
 *
 * `app.close()`는 도는 요청이 다 끝나야 끝난다. 그리기의 각 단계에는 시간 한도가 있지만(`SCREEN_DEFAULTS.timeoutMs` · playwright
 * 의 띄우기 한도 180s) 합은 길다 — 멈춘 브라우저 실행 파일로 잰 값(`SCREEN_CHROMIUM_PATH` 가 `sleep` 인 판 · pptx 하나를 보내고
 * 1s 뒤 SIGTERM): 종료까지 **179s**. 한도가 지나면 도는 요청을 버리고 종료 1 로 끝낸다 — `process.exit`에 playwright 의 `exit`
 * 처리기가 띄운 브라우저를 죽인다.
 *
 * 한도보다 먼저 오는 것도 있다 — 감독하는 쪽의 SIGKILL(`tsx watch` 5s · `docker stop` 기본 10s). 그때 도는 응답은 끊기지만
 * 브라우저는 안 남는다(파이프가 닫히면 스스로 끝난다 — 그리는 중에 서버 node 를 SIGKILL 한 판에서 남은 브라우저 0).
 */
import type { FastifyInstance } from 'fastify'

export const SHUTDOWN_SIGNALS = ['SIGTERM', 'SIGINT', 'SIGHUP'] as const

/**
 * 도는 요청을 기다리는 한도.
 *
 * 잰 값(macOS · 빈 페이지 · pptx 내려받기 하나를 그리는 중에 SIGTERM): 40장 1.3–2.5s · 200장(그리는 상한) 6.4s 늦게 끝난다.
 * 한 사람이 둘 · 전체가 여덟까지 줄 서고 그리기 칸이 둘이라(`services/export-worker.ts`) 줄 선 일까지 다 그리면 그 몇 곱이다 —
 * 한도는 그것을 덮고 감독자의 흔한 한도(쿠버네티스 기본 30s) 안에 들게 골랐다.
 */
export const SHUTDOWN_GRACE_MS = 30_000

interface ShutdownProcess {
  on(signal: (typeof SHUTDOWN_SIGNALS)[number], listener: () => void): unknown
  exit(code: number): void
}

export function closeOnSignals(
  app: FastifyInstance,
  db: { destroy(): Promise<void> },
  options: { graceMs?: number; process?: ShutdownProcess } = {},
): void {
  const proc: ShutdownProcess = options.process ?? process
  const graceMs = options.graceMs ?? SHUTDOWN_GRACE_MS
  let closing = false

  async function shutdown(signal: (typeof SHUTDOWN_SIGNALS)[number]): Promise<void> {
    if (closing) return
    closing = true
    app.log.info(`${signal} 수신 — 서버를 종료합니다`)
    const limit = setTimeout(() => {
      app.log.warn(`종료가 ${graceMs}ms 안에 안 끝났습니다 — 도는 요청을 버리고 끝냅니다`)
      proc.exit(1)
    }, graceMs)
    limit.unref()
    await app.close()
    await db.destroy()
    clearTimeout(limit)
    proc.exit(0)
  }

  for (const signal of SHUTDOWN_SIGNALS) proc.on(signal, () => void shutdown(signal))
}
