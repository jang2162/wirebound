// @vitest-environment node
/**
 * **브라우저 `WebSocket`이 해 주지 않는 둘.** 소켓도 타이머도 주입하므로
 * DOM 없이 돈다 — `connection.ts`가 React·DOM을 import하지 않는다는 전제를 이 줄이 강제한다.
 *
 * | 재는 것 | 없으면 무엇이 조용한가 |
 * |---|---|
 * | 끊기면 다시 붙는다 | 화면이 붙어 있는 줄 알고 영영 아무것도 못 받는다 |
 * | 답 없는 연결을 스스로 닫는다 | 반쯤 죽은 연결(노트북 뚜껑·중간 프록시)은 `onclose`가 오지 않는다 |
 * | `close()`가 재연결을 멈춘다 | 프로젝트를 옮길 때마다 소켓이 하나씩 쌓인다 |
 */
import { describe, expect, it } from 'vitest'
import {
  openRealtime,
  type RealtimeConnection,
  type RealtimeSocket,
  type RealtimeStatus,
} from '../../src/realtime/connection'
import type { ServerFrame } from '../../src/realtime/protocol'

/** 손으로 밀 수 있는 소켓. 실제 네트워크가 없어야 갈래를 하나씩 태울 수 있다. */
class FakeSocket implements RealtimeSocket {
  onopen: (() => void) | null = null

  onmessage: ((event: { data: unknown }) => void) | null = null

  onclose: (() => void) | null = null

  onerror: (() => void) | null = null

  readonly sent: string[] = []

  closed = false

  send(data: string): void {
    this.sent.push(data)
  }

  close(): void {
    this.closed = true
    this.onclose?.()
  }
}

/** 손으로 돌리는 타이머. 예약된 것을 순서대로 하나씩 발화시킨다. */
class FakeClock {
  #next = 1

  readonly pending = new Map<number, { run: () => void; ms: number }>()

  readonly schedule = (run: () => void, ms: number): unknown => {
    const handle = this.#next++
    this.pending.set(handle, { run, ms })
    return handle
  }

  readonly cancel = (handle: unknown): void => {
    this.pending.delete(handle as number)
  }

  /** 예약된 것 중 가장 먼저 걸린 것을 발화시킨다. 돌려주는 것은 그 지연이다. */
  fire(): number {
    const [handle, entry] = [...this.pending.entries()][0] ?? []
    if (handle === undefined || entry === undefined) throw new Error('예약된 타이머가 없습니다')
    this.pending.delete(handle)
    entry.run()
    return entry.ms
  }
}

interface Harness {
  sockets: FakeSocket[]
  clock: FakeClock
  frames: ServerFrame[]
  statuses: RealtimeStatus[]
  connection: RealtimeConnection
}

function harness(options?: { heartbeatMs?: number; reconnectDelaysMs?: number[] }): Harness {
  const sockets: FakeSocket[] = []
  const clock = new FakeClock()
  const frames: ServerFrame[] = []
  const statuses: RealtimeStatus[] = []
  const connection = openRealtime({
    url: 'ws://x/api/projects/p/ws',
    onFrame: (frame) => frames.push(frame),
    onStatus: (status) => statuses.push(status),
    createSocket: () => {
      const socket = new FakeSocket()
      sockets.push(socket)
      return socket
    },
    schedule: clock.schedule,
    cancel: clock.cancel,
    heartbeatMs: options?.heartbeatMs ?? 1000,
    reconnectDelaysMs: options?.reconnectDelaysMs ?? [10, 20, 40],
  })
  return { sockets, clock, frames, statuses, connection }
}

function pongFrom(socket: FakeSocket): void {
  socket.onmessage?.({ data: JSON.stringify({ type: 'pong' }) })
}

describe('붙고 받는다', () => {
  it('만들자마자 소켓 하나를 연다', () => {
    const h = harness()

    expect(h.sockets).toHaveLength(1)
    expect(h.statuses).toEqual(['connecting'])
  })

  it('열리면 상태가 open이 되고 프레임이 흘러 들어온다', () => {
    const h = harness()
    h.sockets[0]!.onopen?.()

    h.sockets[0]!.onmessage?.({
      data: JSON.stringify({
        type: 'page-changed',
        projectId: 'p',
        pageId: 'g',
        seq: 3,
        ops: [],
        warnings: [],
        actor: { type: 'user', label: '홍길동' },
      }),
    })

    expect(h.statuses).toEqual(['connecting', 'open'])
    expect(h.frames).toEqual([
      {
        type: 'page-changed',
        projectId: 'p',
        pageId: 'g',
        seq: 3,
        ops: [],
        warnings: [],
        actor: { type: 'user', label: '홍길동' },
      },
    ])
  })

  it('모르는 프레임은 버리되 연결은 살려 둔다 — 새 배포가 낡은 화면을 죽이지 않는다', () => {
    const h = harness()
    h.sockets[0]!.onopen?.()

    h.sockets[0]!.onmessage?.({ data: JSON.stringify({ type: 'locked', nodeId: 'n_1' }) })
    h.sockets[0]!.onmessage?.({ data: '{ JSON이 아니다' })
    pongFrom(h.sockets[0]!)

    expect(h.frames).toEqual([{ type: 'pong' }])
    expect(h.sockets[0]!.closed).toBe(false)
  })
})

describe('끊기면 다시 붙는다', () => {
  it('닫히면 잠시 뒤 새 소켓을 연다', () => {
    const h = harness()
    h.sockets[0]!.onopen?.()

    h.sockets[0]!.onclose?.()
    expect(h.sockets).toHaveLength(1)
    h.clock.fire()

    expect(h.sockets).toHaveLength(2)
  })

  it('이어 실패하면 기다리는 시간이 늘고 끝 값에서 멈춘다', () => {
    const h = harness({ reconnectDelaysMs: [10, 20] })
    const delays: number[] = []

    h.sockets[0]!.onclose?.()
    delays.push(h.clock.fire())
    h.sockets[1]!.onclose?.()
    delays.push(h.clock.fire())
    h.sockets[2]!.onclose?.()
    delays.push(h.clock.fire())

    expect(delays).toEqual([10, 20, 20])
  })

  it('붙는 데 성공하면 기다리는 시간이 처음으로 돌아간다', () => {
    const h = harness({ reconnectDelaysMs: [10, 20] })
    h.sockets[0]!.onclose?.()
    h.clock.fire()
    h.sockets[1]!.onclose?.()
    expect(h.clock.fire()).toBe(20)

    h.sockets[2]!.onopen?.()
    h.sockets[2]!.onclose?.()

    expect(h.clock.fire()).toBe(10)
  })

  /**
   * `onerror` 뒤에 `onclose`가 또 온다.
   *
   * ***"예약이 둘이 된다"*로는 못 잡는다** — 재연결 경로가 앞의 예약을 지우고 새로 걸므로
   * 예약 수는 어느 쪽이든 하나다(두 번 세게 바꿔도 예약 수 단언은 안 죽는다).
   * **실제로 어긋나는 것은 간격이다:** 두 번 세면 `attempt`가 두 칸 올라 첫 재시도가
   * 벌써 두 번째 간격만큼 기다린다.
   */
  it('error와 close가 잇달아 와도 간격이 한 칸만 움직인다', () => {
    const h = harness({ reconnectDelaysMs: [10, 20, 40] })
    const socket = h.sockets[0]!
    socket.onopen?.()

    socket.onerror?.()
    socket.onclose?.()

    expect(h.clock.pending.size).toBe(1)
    expect(h.clock.fire()).toBe(10)
    expect(h.sockets).toHaveLength(2)
  })
})

describe('반쯤 죽은 연결을 스스로 닫는다', () => {
  it('간격마다 ping을 보낸다', () => {
    const h = harness({ heartbeatMs: 1000 })
    h.sockets[0]!.onopen?.()

    expect(h.clock.fire()).toBe(1000)

    expect(h.sockets[0]!.sent).toEqual([JSON.stringify({ type: 'ping' })])
  })

  it('답이 오면 계속 보낸다 — 음성 대조', () => {
    const h = harness({ heartbeatMs: 1000 })
    h.sockets[0]!.onopen?.()
    h.clock.fire()
    pongFrom(h.sockets[0]!)

    h.clock.fire()

    expect(h.sockets[0]!.sent).toHaveLength(2)
    expect(h.sockets[0]!.closed).toBe(false)
  })

  it('답이 없으면 다음 간격에 스스로 닫고 다시 붙는다', () => {
    const h = harness({ heartbeatMs: 1000 })
    h.sockets[0]!.onopen?.()
    h.clock.fire()

    // 두 번째 간격: 그 사이 아무것도 안 왔다.
    h.clock.fire()

    expect(h.sockets[0]!.closed).toBe(true)
    h.clock.fire()
    expect(h.sockets).toHaveLength(2)
  })
})

describe('close()는 그만두는 것이다', () => {
  it('닫은 뒤에는 다시 붙지 않는다', () => {
    const h = harness()
    h.sockets[0]!.onopen?.()

    h.connection.close()

    expect(h.sockets[0]!.closed).toBe(true)
    expect(h.clock.pending.size).toBe(0)
    expect(h.sockets).toHaveLength(1)
  })

  it('재연결을 기다리는 중에 닫아도 그 예약이 사라진다', () => {
    const h = harness()
    h.sockets[0]!.onclose?.()
    expect(h.clock.pending.size).toBe(1)

    h.connection.close()

    expect(h.clock.pending.size).toBe(0)
  })

  it('닫힌 뒤 늦게 온 프레임은 전달되지 않는다', () => {
    const h = harness()
    const socket = h.sockets[0]!
    socket.onopen?.()
    h.connection.close()

    socket.onmessage?.({ data: JSON.stringify({ type: 'pong' }) })

    expect(h.frames).toEqual([])
  })
})

/**
 * ## `reconnect()` — 쿠키가 바뀌었다: 지금 소켓을 버리고 곧바로 다시 붙는다
 *
 * 다른 탭이 **같은 사람으로 다시 로그인하면** 쿠키는 새 세션인데 이 탭의 WS 는 옛 세션에 붙어 있다(옛 세션은
 * 산다). 서버의 방송은 요청과 같은 세션의 연결만 빼므로 **이 탭이 자기 방송을 되받는다.** 핸드셰이크가 쿠키를 싣는 유일한 순간이라, 새 쿠키로 붙는 길은 다시 붙는 것뿐이다
 * (`session/session-context.tsx`의 «탭 사이»가 부른다).
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 곧바로가 아니라 재연결 간격을 기다려 붙는다 | *"열린 연결을 버리고 곧바로 …"* **혼자** |
 * | 열린 소켓만 버린다(핸드셰이크 중이면 그대로 둔다) | *"핸드셰이크 중인 소켓도 …"* **혼자** |
 * | 옛 소켓의 핸들러를 떼지 않고 닫는다(닫힘이 재연결을 한 번 더 예약한다) | *"옛 소켓이 늦게 낸 …"* **혼자** |
 * | 재연결을 기다리는 중에도(`close()` 뒤에도) 곧바로 붙는다 | *"재연결을 기다리는 중이거나 …"* **혼자** |
 */
describe('reconnect()는 새 쿠키로 다시 붙는 것이다', () => {
  it('열린 연결을 버리고 곧바로 새 소켓을 연다 — 기다리지 않는다', () => {
    const h = harness()
    h.sockets[0]!.onopen?.()
    h.statuses.length = 0

    h.connection.reconnect()

    expect(h.sockets[0]!.closed).toBe(true)
    expect(h.sockets).toHaveLength(2)
    // 닫힘을 알리고(연결 id 를 비우고 답을 기다리던 편집을 끝낸다 — `use-realtime.ts`) 곧바로 붙는다.
    expect(h.statuses).toEqual(['closed', 'connecting'])
    h.sockets[1]!.onopen?.()
    expect(h.connection.isOpen()).toBe(true)
  })

  it('핸드셰이크 중인 소켓도 버리고 곧바로 다시 붙는다 — 그 핸드셰이크는 옛 쿠키를 실었다', () => {
    // 첫 소켓은 아직 `onopen`을 안 지났다(끊긴 뒤 예약된 연결이 막 떠난 판과 같다). 그 핸드셰이크는 쿠키가 바뀌기
    // **전에** 나갔으므로 붙으면 옛 세션이다 — 열린 소켓만 버리면 자기 방송을 되받는 결함이 그 연결에서 선다.
    const h = harness()

    h.connection.reconnect()

    expect(h.sockets[0]!.closed).toBe(true)
    expect(h.sockets).toHaveLength(2)
    h.sockets[1]!.onopen?.()
    expect(h.connection.isOpen()).toBe(true)
  })

  it('옛 소켓이 늦게 낸 프레임·닫힘은 새 연결에 닿지 않는다 — 재연결을 또 예약하지 않는다', () => {
    const h = harness()
    const old = h.sockets[0]!
    old.onopen?.()
    const beforeReconnect = h.clock.pending.size

    h.connection.reconnect()
    old.onmessage?.({ data: JSON.stringify({ type: 'pong' }) })
    old.onclose?.()

    expect(h.frames).toEqual([])
    expect(h.sockets).toHaveLength(2)
    // 하트비트 예약 하나가 옛 소켓과 함께 지워지고, 새 소켓은 아직 안 열려 예약이 없다.
    expect(beforeReconnect).toBe(1)
    expect(h.clock.pending.size).toBe(0)
  })

  it('재연결을 기다리는 중이거나 닫은 뒤면 아무것도 안 한다 — 예약된 연결이 그때의 쿠키를 싣는다', () => {
    const waiting = harness()
    waiting.sockets[0]!.onclose?.()
    expect(waiting.clock.pending.size).toBe(1)
    waiting.statuses.length = 0

    waiting.connection.reconnect()

    expect(waiting.sockets).toHaveLength(1)
    expect(waiting.clock.pending.size).toBe(1)
    expect(waiting.statuses).toEqual([])

    const closed = harness()
    closed.sockets[0]!.onopen?.()
    closed.connection.close()
    closed.statuses.length = 0

    closed.connection.reconnect()

    expect(closed.sockets).toHaveLength(1)
    expect(closed.statuses).toEqual([])
  })
})
