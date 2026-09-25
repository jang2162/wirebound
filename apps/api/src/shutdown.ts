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
 *
 * # 신호 없이 오는 «닫아라» 둘 — 터미널이 사라졌다 · 띄운 부모가 끝났다
 *
 * **터미널을 닫아도 SIGHUP 이 안 올 수 있다.** 깔린 pnpm 판이 저장소의 `packageManager`와 다르면 `pnpm start`의 바깥 pnpm 이
 * 그 판을 자식으로 띄우는데, 그때는 터미널을 닫아도 서버 · tsx 에 신호가 안 온다(잰 값 · macOS: pty 에 `pnpm start`를 띄우고
 * master 를 닫은 판 — 서버 · tsx 가 받은 신호 0 · 바깥 pnpm 은 산 채 남음. `packageManager`가 없는 디렉터리의 `pnpm start` ·
 * `tsx` 직접은 SIGHUP 을 받는다). 그래서 표준출력이
 * 터미널이면 `LIFELINE_INTERVAL_MS`마다 0 바이트를 써 본다 — 끊긴 터미널은 0 바이트 쓰기에도 **EIO** 를 낸다(`/dev/tty`를 다시
 * 여는 것은 끊긴 뒤에도 성공해 못 쓴다). 로그 쓰기의 EIO 는 로그를 버리기만 한다(`log-destination.ts`).
 *
 * **띄운 부모가 끝나도 신호가 안 온다.** `tsx`(watch 아님)는 SIGINT · SIGTERM 만 서버에 되전달한다 — `tsx`의 pid 에만 SIGHUP 을
 * 보내거나 `tsx`가 SIGKILL 로 죽으면 서버는 부모 없이 포트를 쥐고 남는다. 그래서 같은 주기에 `process.ppid`가 처음 값과
 * 달라졌는지 본다(부모가 끝나면 launchd · init 이 새 부모가 된다). 처음부터 부모가 없는 판(컨테이너의 1 번)은 값이 안 바뀐다.
 */
import { write } from 'node:fs'
import { isatty } from 'node:tty'
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

/** 터미널 · 부모를 보는 주기. 0 바이트 쓰기 하나와 `ppid` 읽기라 값싸다 — 끊긴 뒤 이만큼 안에 닫기 시작한다. */
export const LIFELINE_INTERVAL_MS = 1_000

interface ShutdownProcess {
  on(signal: (typeof SHUTDOWN_SIGNALS)[number], listener: () => void): unknown
  exit(code: number): void
  readonly ppid: number
}

/** 터미널에 0 바이트를 써 본다 — 오류 코드를 낸다(없으면 `undefined`). */
export type TerminalProbe = () => Promise<string | undefined>

/** 표준출력이 터미널일 때만 잰다 — 파이프 · 파일(컨테이너 · `nohup`)에는 «터미널이 사라진다»가 없다. */
function stdoutTerminalProbe(): TerminalProbe | undefined {
  if (!isatty(1)) return undefined
  return () => new Promise((resolve) => write(1, Buffer.alloc(0), (error) => resolve(error?.code)))
}

export function closeOnSignals(
  app: FastifyInstance,
  db: { destroy(): Promise<void> },
  options: {
    graceMs?: number
    process?: ShutdownProcess
    lifelineMs?: number
    /** `null`이면 터미널을 안 본다. 생략하면 표준출력이 터미널일 때 본다. */
    terminal?: TerminalProbe | null
  } = {},
): void {
  const proc: ShutdownProcess = options.process ?? process
  const graceMs = options.graceMs ?? SHUTDOWN_GRACE_MS
  const terminal = options.terminal === undefined ? stdoutTerminalProbe() : (options.terminal ?? undefined)
  const parent = proc.ppid
  let closing = false

  async function shutdown(reason: string): Promise<void> {
    if (closing) return
    closing = true
    clearInterval(lifeline)
    app.log.info(`${reason} — 서버를 종료합니다`)
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

  for (const signal of SHUTDOWN_SIGNALS) proc.on(signal, () => void shutdown(`${signal} 수신`))

  let probing = false
  const lifeline = setInterval(() => {
    if (proc.ppid !== parent) {
      void shutdown(`부모 프로세스(${parent})가 끝났습니다`)
      return
    }
    if (terminal === undefined || probing) return
    probing = true
    void terminal().then((code) => {
      probing = false
      if (code === 'EIO') void shutdown('터미널이 닫혔습니다')
    })
  }, options.lifelineMs ?? LIFELINE_INTERVAL_MS)
  lifeline.unref()
}
