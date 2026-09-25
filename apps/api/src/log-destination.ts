/**
 * **로그가 나가는 자리 — 쓰기가 실패하면 그 뒤 로그를 버리고 서버는 계속 돈다.** `app.ts`의 `buildApp`이 운영 로거에 건다.
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
 * 그래서 **어떤 쓰기 오류든 받으면 그 뒤의 로그를 버린다** — 쓰기 · `flushSync`를 아무것도 안 하는 것으로 바꾼다(pino 가 EPIPE 에
 * 하는 것과 같은 수). 터미널이 사라진 것을 «닫아라»로 읽는 것은 `shutdown.ts`의 몫이다 — 여기는 로그 때문에 멈추거나 죽지 않게만
 * 한다.
 *
 * # 종료 처리기의 `flushSync`는 먼저 0 바이트를 써 본다
 *
 * 쓰기는 pino 의 기본대로 비동기다 — 오류는 쓰기 콜백으로 **늦게** 알려진다. 그 전에 프로세스가 끝나면(쓰는 중인 줄 뒤에 줄이 더
 * 쌓인 채 `process.exit`) 종료 처리기의 `flushSync`가 같은 되풀이에 든다. 그래서 `flushSync`는 먼저 0 바이트를 써 보고, 그것이
 * 실패하면 로그를 버린다 — 끊긴 터미널은 0 바이트 쓰기에도 EIO 를 낸다(`shutdown.ts`가 같은 수로 끊김을 안다).
 *
 * **동기 쓰기는 고르지 않았다** — 오류를 그 자리에서 받아 이 되풀이가 아예 없지만, 읽지 않는 터미널(Ctrl-S 로 멈춘 창 · 출력을
 * 안 읽는 pty)에 쓰는 순간 이벤트 루프가 선다. 잰 값(pty 에 서버를 띄우고 master 를 안 읽은 채 페이지 40 장을 만드는 요청들):
 * 동기 쓰기면 요청이 답을 못 받고 멈춘다 · 비동기면 다 답한다. 파이프의 EPIPE 가 0 바이트 쓰기에 안 드러나는 판은 pino 의
 * 기본과 같다(오류가 알려지기 전에 끝나면 멈출 수 있다).
 *
 * 다시 재는 법: `test/log-destination.test.ts`(읽기 전용 fd 에 써서 오류를 낸다) · 끊긴 터미널은 pty 에 서버를 띄우고 master 를
 * 닫는다(`CLAUDE.md` 「사람이 칠 셸 절차는 대화형 셸에 사람처럼 쳐서 잰다」).
 */
import { writeSync } from 'node:fs'
import { destination } from 'pino'

export type LogDestination = ReturnType<typeof destination>

export function logDestination(fd = 1): LogDestination {
  const stream = destination({ fd, sync: false })
  const discard = (): void => {
    stream.write = () => true
    stream.flushSync = () => {}
    stream.flush = () => {}
    stream.end = () => {}
  }
  stream.on('error', discard)
  const flushSync = stream.flushSync.bind(stream)
  stream.flushSync = () => {
    try {
      writeSync(fd, Buffer.alloc(0))
    } catch {
      discard()
      return
    }
    flushSync()
  }
  return stream
}
