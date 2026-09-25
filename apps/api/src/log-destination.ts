/**
 * **로그가 나가는 자리 — 쓰기가 실패해도 서버는 계속 돈다.** `app.ts`의 `buildApp`이 운영 로거에 건다.
 *
 * # 왜 pino 의 기본 목적지를 그대로 안 쓰나
 *
 * 서버를 띄운 터미널을 닫으면 표준출력(끊긴 tty)으로의 쓰기가 **EIO** 로 실패한다. pino 의 기본 목적지(`sonic-boom`)는 그
 * 오류를 EPIPE 가 아니면 다시 던지고(`pino/lib/tools.js`의 `buildSafeSonicBoom`), 잡히지 않은 예외로 프로세스가 끝나려 할 때
 * 종료 처리기가 남은 줄을 `flushSync`로 밀어낸다 — 그 `flushSync`는 EAGAIN 이 아닌 오류에도 **100ms 쉬고 다시 쓰기를 영영
 * 되풀이한다**(`sonic-boom@4.2.1`의 `flushSync`). 프로세스는 `Atomics.wait` 안에서 멈춘 채 포트 · 그리던 브라우저를 쥐고 남는다.
 * 잰 값(macOS · pty 에 `pnpm start`를 띄우고 master 를 닫음): 그리던 pptx 는 끝내 답이 없고 서버 · 브라우저가 남는다. 쉬는
 * 서버는 닫은 뒤 첫 요청에 200 을 답하고 그 요청의 로그 줄에서 멈춰, 둘째 요청부터 답이 없다.
 *
 * 그래서 **쓰기 오류를 받으면 그 뒤의 로그를 버린다** — 쓰기 · `flushSync`를 아무것도 안 하는 것으로 바꾼다(pino 가 EPIPE 에
 * 하는 것과 같은 수). 터미널이 사라진 것을 «닫아라»로 읽는 것은 `shutdown.ts`의 몫이다 — 여기는 로그 때문에 멈추거나 죽지 않게만
 * 한다. **버릴 때 표준에러에 한 줄을 남긴다** — 로그가 끊긴 까닭이 어디에도 안 남으면 운영자는 «그동안 요청이 없었다»로 읽는다.
 * 표준에러도 죽었으면(같은 터미널 · 같은 디스크) 조용하다.
 *
 * # 공간이 차면 줄만 떨군다
 *
 * **ENOSPC · EDQUOT 은 버리지 않는다** — 디스크가 차는 것은 지우면 풀리는 일이라, 버리면 공간이 돌아와도 재기동까지 로그가 없다.
 * 그동안 오는 줄은 떨구고(버퍼에 안 쌓는다 — 쌓으면 찬 동안 메모리가 는다) `LOG_RETRY_MS`마다 실패한 버퍼를 다시 써 본다.
 * 되면 이어 쓰고 떨군 줄 수를 표준에러에 한 줄 남긴다. 떨구는 중의 `flushSync`(종료 처리기)는 아무것도 안 한다 — 밀어내면
 * sonic-boom 의 되풀이에 든다. 잰 값(macOS · 1MB RAM 디스크에 표준출력을 파일로 · 남은 공간을 16KB 로 줄이고 `/health` 300 →
 * 채운 파일을 지우고 1.5s 뒤 50 → SIGTERM): 찬 동안 전부 200 · 뒤 50 의 `request completed` 50 줄이 로그에 남고 표준에러에
 * «떨굼» · «다시 씀» 두 줄 · SIGTERM 에 곧바로 끝. 찬 채로 SIGTERM 도 곧바로 끝난다 — 떨구는 중에 `flushSync`를 밀어내게 하면 10s
 * 넘게 안 끝난다.
 *
 * # 종료 처리기의 `flushSync`는 먼저 0 바이트를 써 본다
 *
 * 쓰기는 pino 의 기본대로 비동기다 — 오류는 쓰기 콜백으로 **늦게** 알려진다. 그 전에 프로세스가 끝나면(쓰는 중인 줄 뒤에 줄이 더
 * 쌓인 채 `process.exit`) 종료 처리기의 `flushSync`가 같은 되풀이에 든다. 그래서 `flushSync`는 먼저 0 바이트를 써 보고, 그것이
 * 실패하면 로그를 버린다 — 끊긴 터미널은 0 바이트 쓰기에도 EIO 를 낸다(`shutdown.ts`가 같은 수로 끊김을 안다).
 *
 * **동기 쓰기는 고르지 않았다** — 오류를 그 자리에서 받아 이 되풀이가 아예 없지만, 읽지 않는 터미널(Ctrl-S 로 멈춘 창 · 출력을
 * 안 읽는 pty)에 쓰는 순간 이벤트 루프가 선다. 잰 값(pty 에 서버를 띄우고 master 를 안 읽은 채 페이지 40 장을 만드는 요청들):
 * 동기 쓰기면 요청이 답을 못 받고 멈춘다 · 비동기면 다 답한다.
 *
 * **0 바이트 쓰기가 못 거르는 판이 있다 — Linux 에서.** 읽는 쪽이 죽은 파이프와 가득 찬 파일은 0 바이트 쓰기가 0 을 돌려 확인을
 * 지난다(1 바이트는 EPIPE · ENOSPC — `node:22-slim` 컨테이너에서 잰 값. macOS 파이프는 0 바이트에도 EPIPE 를 낸다). 그 판에서 비동기
 * 쓰기의 오류가 알려지기 전에 끝나면 sonic-boom 의 되풀이에서 멈출 수 있다 — pino 의 기본과 같은 틈이다.
 *
 * 다시 재는 법: `test/log-destination.test.ts`(읽기 전용 fd 에 써서 오류를 낸다 · 떨굼은 오류를 흘려 넣는다) · 끊긴 터미널은 pty 에
 * 서버를 띄우고 master 를 닫는다(`CLAUDE.md` 「사람이 칠 셸 절차는 대화형 셸에 사람처럼 쳐서 잰다」) · 가득 찬 디스크는
 * `hdiutil attach -nomount ram://2048` 로 RAM 디스크를 만들어 표준출력을 그 위 파일로 보낸다.
 */
import { writeSync } from 'node:fs'
import { destination } from 'pino'

export type LogDestination = ReturnType<typeof destination>

/** 곧 풀릴 수 있는 쓰기 오류 — 버리지 않고 줄만 떨구며 다시 써 본다(머리말 «공간이 차면 줄만 떨군다»). */
const RETRYABLE = new Set(['ENOSPC', 'EDQUOT'])

/** 줄을 떨구는 동안 다시 써 보는 주기. 쓰기 하나라 값싸다 — 공간이 돌아온 뒤 이만큼 안에 이어 쓴다. */
export const LOG_RETRY_MS = 1_000

export interface LogDestinationOptions {
  /** 버리기 · 떨구기 · 다시 쓰기를 알리는 한 줄. 생략하면 표준에러에 쓰고, 그것도 실패하면 조용하다. */
  notice?: (line: string) => void
  retryMs?: number
}

/**
 * `notice` 를 생략했을 때 알리는 자리. 동기로 쓴다 — 버리는 판은 대개 종료 처리기 안이라 비동기로 두면 한 줄이 나가기 전에
 * 프로세스가 끝난다. 객체의 속성으로 두는 것은 `buildApp` 이 옵션 없이 만든 목적지의 알림을 테스트가 가로채게 하려는 것이다 —
 * `writeSync(2)` 는 vitest 가 못 거둬 테스트 출력에 그대로 새어 나온다(`test/log-destination.test.ts` 의 «앱의 로거»).
 */
export const stderrNotice = {
  line(line: string): void {
    try {
      writeSync(2, `${line}\n`)
    } catch {
      // 표준에러도 죽었다 — 알릴 곳이 없다.
    }
  },
}

export function logDestination(fd = 1, options: LogDestinationOptions = {}): LogDestination {
  const notice = options.notice ?? ((line: string) => stderrNotice.line(line))
  const stream = destination({ fd, sync: false })
  const write = stream.write.bind(stream)
  const flushSync = stream.flushSync.bind(stream)
  let stalled: { code: string; dropped: number; retry: NodeJS.Timeout } | undefined
  let discarded = false

  const discard = (code: string): void => {
    if (discarded) return
    discarded = true
    if (stalled !== undefined) clearInterval(stalled.retry)
    stalled = undefined
    stream.write = () => true
    stream.flushSync = () => {}
    stream.flush = () => {}
    stream.end = () => {}
    notice(`로그 목적지(fd ${fd})에 쓰지 못해(${code}) 이 뒤의 로그를 버립니다 — 서버는 계속 돕니다`)
  }
  // 첫 오류는 두 번 온다 — pino 가 자기 청취자를 떼며 같은 오류를 다시 낸다(`pino/lib/tools.js`의 `buildSafeSonicBoom`).
  stream.on('error', (error: NodeJS.ErrnoException) => {
    const code = error.code ?? 'UNKNOWN'
    if (!RETRYABLE.has(code)) {
      discard(code)
      return
    }
    if (discarded || stalled !== undefined) return
    // 빈 줄을 쓰면 sonic-boom 이 실패한 버퍼부터 다시 쓴다 — 그것이 되면 `write` 이벤트가 온다.
    const retry = setInterval(() => write(''), options.retryMs ?? LOG_RETRY_MS)
    retry.unref()
    stalled = { code, dropped: 0, retry }
    notice(`로그 목적지(fd ${fd})에 쓰지 못해(${code}) 쓸 수 있을 때까지 로그 줄을 버립니다`)
  })
  stream.on('write', () => {
    if (stalled === undefined) return
    clearInterval(stalled.retry)
    notice(`로그 목적지(fd ${fd})에 다시 씁니다 — 못 쓰는 동안 ${stalled.dropped}줄을 버렸습니다`)
    stalled = undefined
  })
  stream.write = (line: string) => {
    if (stalled === undefined) return write(line)
    stalled.dropped += 1
    return true
  }
  stream.flushSync = () => {
    // 떨구는 중이면 밀어낼 수 없다 — sonic-boom 의 `flushSync`는 ENOSPC 에도 영영 되풀이한다.
    if (stalled !== undefined) return
    try {
      writeSync(fd, Buffer.alloc(0))
    } catch (error) {
      discard((error as NodeJS.ErrnoException).code ?? 'UNKNOWN')
      return
    }
    flushSync()
  }
  return stream
}
