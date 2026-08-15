/**
 * 룸 하나에 붙어 있는 것을 유지하는 자리. **React도 DOM도 import하지 않는다** —
 * `store/editor-store.ts`와 같은 이유로 화면 없이 단위 테스트할 수 있어야 한다.
 *
 * # 새 의존을 더하지 않는다 (P3-1 전역 제약 · 재라 #5)
 *
 * 브라우저에 `WebSocket`이 있다. **다만 그것이 해 주지 않는 것이 둘 있고, 그 둘이 이 파일의
 * 내용 전부다** — 재서 알았다:
 *
 * | 필요한 것 | 브라우저 `WebSocket`이 주는가 |
 * |---|---|
 * | 연결 | 준다 |
 * | **재연결** | **안 준다.** 끊기면 그대로다. `onclose`에서 다시 열어야 한다 |
 * | **하트비트** | **반쪽만.** 서버가 보낸 프로토콜 ping에는 브라우저가 자동으로 pong하지만, **브라우저가 ping을 보낼 수단은 API에 없다**(`WebSocket`에 그 메서드가 없다). 그래서 살아 있는지 **내가** 재려면 앱 수준 프레임이 필요하고, 그것이 `{"type":"ping"}`이다 |
 * | 쿠키 | 준다 — 같은 오리진이면 핸드셰이크에 실린다(§10의 *"핸드셰이크도 같은 쿠키를 쓴다"*) |
 *
 * # 반쯤 죽은 연결
 *
 * TCP가 살아 있는데 아무것도 오가지 않는 상태(노트북 뚜껑, 중간 프록시)에서는 `onclose`가
 * **오지 않는다.** 그래서 주기적으로 `ping`을 보내고 **답이 없으면 내가 닫는다** — 닫으면
 * `onclose`가 재연결을 태운다. 이것이 없으면 화면이 *"붙어 있다"*고 믿으면서 아무것도 못
 * 받는다. 그 상태는 조용하다.
 */
import { PING_FRAME, parseServerFrame, type ServerFrame } from './protocol'

/** 이 모듈이 소켓에 요구하는 전부. 브라우저 `WebSocket`이 이 모양을 만족한다. */
export interface RealtimeSocket {
  send(data: string): void
  close(): void
  onopen: (() => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: (() => void) | null
  onerror: (() => void) | null
}

export type RealtimeStatus = 'connecting' | 'open' | 'closed'

export interface RealtimeOptions {
  url: string
  onFrame: (frame: ServerFrame) => void
  onStatus?: (status: RealtimeStatus) => void
  /** 소켓 팩토리. 기본은 브라우저 `WebSocket`이고, 테스트가 가짜를 끼운다. */
  createSocket?: (url: string) => RealtimeSocket
  /** 타이머. 기본은 `setTimeout`/`clearTimeout`이다. */
  schedule?: (run: () => void, ms: number) => unknown
  cancel?: (handle: unknown) => void
  /** `ping`을 보내는 간격. */
  heartbeatMs?: number
  /**
   * 다시 붙기까지 기다리는 시간. **끝 값을 계속 쓴다** — 서버가 오래 죽어 있어도 무한히
   * 벌어지지 않고, 매번 즉시 재시도해 서버를 때리지도 않는다.
   */
  reconnectDelaysMs?: readonly number[]
}

const DEFAULT_HEARTBEAT_MS = 25_000
const DEFAULT_RECONNECT_DELAYS_MS = [500, 1_000, 2_000, 5_000, 10_000] as const

export interface RealtimeConnection {
  /** 붙는 것을 그만둔다. **이 뒤로는 재연결하지 않는다.** */
  close(): void
}

/**
 * 붙고, 끊기면 다시 붙는다. 돌려주는 것은 **그만두는 함수 하나**다.
 *
 * **`close()`가 재연결을 멈추는 것이 계약이다.** 안 멈추면 화면을 떠난 뒤에도 소켓이 계속
 * 살아나고, 프로젝트를 옮길 때마다 하나씩 쌓인다.
 */
export function openRealtime(options: RealtimeOptions): RealtimeConnection {
  const createSocket = options.createSocket ?? defaultSocketFactory
  const schedule = options.schedule ?? ((run, ms) => setTimeout(run, ms))
  const cancel = options.cancel ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>))
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS
  const delays = options.reconnectDelaysMs ?? DEFAULT_RECONNECT_DELAYS_MS

  let stopped = false
  let socket: RealtimeSocket | null = null
  let attempt = 0
  let timer: unknown = null
  /** 마지막 `ping` 이후 무엇이든 받았는가. 안 받았으면 그 연결은 죽은 것으로 본다. */
  let heardSinceLastPing = true

  const clearTimer = (): void => {
    if (timer !== null) {
      cancel(timer)
      timer = null
    }
  }

  const beat = (): void => {
    if (stopped || socket === null) return
    if (!heardSinceLastPing) {
      // 반쯤 죽었다. **내가 닫는다** — 닫으면 아래 `onclose`가 재연결을 태운다.
      socket.close()
      return
    }
    heardSinceLastPing = false
    socket.send(PING_FRAME)
    timer = schedule(beat, heartbeatMs)
  }

  const connect = (): void => {
    if (stopped) return
    options.onStatus?.('connecting')
    const next = createSocket(options.url)
    socket = next

    next.onopen = () => {
      if (stopped) return
      attempt = 0
      heardSinceLastPing = true
      options.onStatus?.('open')
      clearTimer()
      timer = schedule(beat, heartbeatMs)
    }

    next.onmessage = (event) => {
      if (stopped) return
      heardSinceLastPing = true
      const frame = parseServerFrame(String(event.data))
      // **모르는 프레임은 조용히 버린다 — 연결은 살려 둔다.** 서버가 새 `type`을 더했을 때
      // 낡은 화면이 연결째 죽으면, 그 배포 창 동안 아무도 아무것도 못 받는다.
      if (frame !== null) options.onFrame(frame)
    }

    const dropped = (): void => {
      if (stopped) return
      // **`onerror` 뒤에 `onclose`가 또 온다.** 핸들러를 떼지 않으면 이 함수가 두 번 돈다.
      //
      // **소켓이 두 배로 늘지는 않는다 — 재서 알았다.** 아래 `clearTimer()`가 앞의 예약을
      // 지우므로 예약은 여전히 하나다. 실제로 어긋나는 것은 **`attempt`가 두 칸 오르는
      // 것**이고, 그러면 첫 재시도가 이미 두 번째 간격만큼 기다린다. `connection.test.ts`의
      // `error와 close가 잇달아 와도 간격이 한 칸만 움직인다`가 그 값을 잰다.
      next.onopen = null
      next.onmessage = null
      next.onclose = null
      next.onerror = null
      socket = null
      clearTimer()
      options.onStatus?.('closed')
      const delay = delays[Math.min(attempt, delays.length - 1)] ?? 0
      attempt += 1
      timer = schedule(connect, delay)
    }

    next.onclose = dropped
    next.onerror = dropped
  }

  connect()

  return {
    close: () => {
      // **`stopped`는 방어선이고 오늘 그것만 지우는 케이스는 없다(0 사망 — 변이 M22).**
      // 아래 두 줄(예약 취소 + 핸들러 떼기)이 `stopped`가 막는 경로를 이미 전부 막기
      // 때문이다: 재연결 예약은 `clearTimer`가 지우고, 소켓이 `close()` 도중 동기로
      // `onclose`를 내도 그때는 핸들러가 이미 `null`이다.
      //
      // **그래도 남긴다.** 저 두 줄의 **순서**가 뒤집히면(핸들러 떼기가 `open.close()`
      // 뒤로 가면) 그 순간 `stopped`가 유일한 방벽이 된다. 이 줄을 지워도 되는 신호로
      // 읽지 마라 — 지금 안 죽는 이유는 다른 두 줄이 옳게 서 있기 때문이다.
      stopped = true
      clearTimer()
      const open = socket
      socket = null
      if (open) {
        open.onopen = null
        open.onmessage = null
        open.onclose = null
        open.onerror = null
        open.close()
      }
    },
  }
}

/**
 * 브라우저 `WebSocket`을 이 모듈의 모양으로 감싼다. **`apps/web`의 유일한 `WebSocket`
 * 참조다** — 이 한 줄이 브라우저 전역에 닿는 자리 전부이고, 테스트는 `createSocket`을
 * 주입해 이것을 지나지 않는다.
 */
function defaultSocketFactory(url: string): RealtimeSocket {
  return new WebSocket(url) as unknown as RealtimeSocket
}
