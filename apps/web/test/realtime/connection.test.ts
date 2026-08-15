// @vitest-environment node
/**
 * **브라우저 `WebSocket`이 해 주지 않는 둘**(P3-1 재라 #5). 소켓도 타이머도 주입하므로
 * DOM 없이 돈다 — `connection.ts`가 React·DOM을 import하지 않는다는 전제를 이 줄이 강제한다.
 *
 * | 재는 것 | 없으면 무엇이 조용한가 |
 * |---|---|
 * | 끊기면 다시 붙는다 | 화면이 붙어 있는 줄 알고 영영 아무것도 못 받는다 |
 * | 답 없는 연결을 스스로 닫는다 | 반쯤 죽은 연결(노트북 뚜껑·중간 프록시)은 `onclose`가 오지 않는다 |
 * | `close()`가 재연결을 멈춘다 | 프로젝트를 옮길 때마다 소켓이 하나씩 쌓인다 |
 */
import { describe, expect, it } from 'vitest'
import { openRealtime, type RealtimeSocket, type RealtimeStatus } from '../../src/realtime/connection'
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
  connection: { close(): void }
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
   * **처음엔 *"예약이 둘이 된다"*로 잡으려 했고 그것은 거짓이었다** — 재연결 경로가
   * 앞의 예약을 지우고 새로 걸므로 예약 수는 어느 쪽이든 하나다(변이 M23이 0 사망이었다).
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
