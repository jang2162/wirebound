/**
 * 테스트가 진짜 WebSocket 연결을 여는 자리. **새 의존을 쓰지 않는다** — Node 22의 전역
 * `WebSocket`(undici)이 `{ headers }` 옵션을 받아 핸드셰이크에 쿠키를 실어 준다(실측:
 * `ws-auth.test.ts`의 `쿠키가 핸드셰이크에 실린다`가 그것을 서버 쪽에서 확인한다).
 *
 * # 왜 프레임을 큐에 쌓는가
 *
 * 브로드캐스트는 **기다리기 전에 도착한다.** `await`을 건 뒤에 오는 것만 잡으면 케이스가
 * 우연히 통과하거나 우연히 실패한다 — 받는 즉시 배열에 넣고, `waitFor`는 **이미 와 있는
 * 것부터** 본다.
 *
 * # `quiet`가 있는 이유
 *
 * *"안 온다"*를 재려면 창이 필요하다. 그 창이 없으면 *"룸이 다르면 못 받는다"*가
 * *"아직 안 왔다"*와 구분되지 않는다.
 */
import type { ServerFrame } from '../src/ws/protocol'

export interface CloseInfo {
  code: number
  reason: string
}

/** `waitFor`·`waitClosed`가 기다리는 기본 창. */
const DEFAULT_TIMEOUT_MS = 3000

/** `quiet`가 *"안 온다"*를 판정하는 창. */
const QUIET_MS = 300

export class WsProbe {
  readonly received: ServerFrame[] = []

  closeInfo: CloseInfo | null = null

  /** 핸드셰이크가 101로 끝났는가. 인증 실패 케이스가 이것을 본다. */
  readonly opened: Promise<boolean>

  readonly #socket: WebSocket

  readonly #wake = new Set<() => void>()

  private constructor(socket: WebSocket) {
    this.#socket = socket

    this.opened = new Promise<boolean>((resolve) => {
      socket.addEventListener('open', () => resolve(true), { once: true })
      // 101이 아니면 undici가 `error`를 낸 뒤 `close`를 낸다. 둘 중 먼저 오는 것에서
      // `false`로 끝낸다 — `once`라 `open`이 이미 끝냈으면 무해하다.
      socket.addEventListener('error', () => resolve(false), { once: true })
      socket.addEventListener('close', () => resolve(false), { once: true })
    })

    socket.addEventListener('message', (event) => {
      this.received.push(JSON.parse(String((event as MessageEvent).data)) as ServerFrame)
      this.#notify()
    })
    socket.addEventListener('close', (event) => {
      const closed = event as CloseEvent
      this.closeInfo = { code: closed.code, reason: closed.reason }
      this.#notify()
    })
    // 붙지 못한 연결의 `error`를 잡지 않으면 Node가 unhandled로 죽는다.
    socket.addEventListener('error', () => this.#notify())
  }

  #notify(): void {
    for (const wake of [...this.#wake]) wake()
  }

  static open(port: number, projectId: string, token?: string): WsProbe {
    const url = `ws://127.0.0.1:${port}/api/projects/${projectId}/ws`
    // `headers`는 표준 `WebSocket` 생성자에 없는 undici 확장이라 타입에 없다.
    const socket = token
      ? new WebSocket(url, { headers: { cookie: `wb_session=${token}` } } as never)
      : new WebSocket(url)
    return new WsProbe(socket)
  }

  /** 그 종류의 프레임을 **처음부터 훑어** 기다린다. 이미 와 있으면 그 자리에서 돌려준다. */
  async waitFor<T extends ServerFrame['type']>(
    type: T,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<Extract<ServerFrame, { type: T }>> {
    const found = await this.#until(
      () => this.received.find((frame) => frame.type === type) as Extract<ServerFrame, { type: T }> | undefined,
      timeoutMs,
    )
    if (!found) {
      throw new Error(`${type} 프레임이 ${timeoutMs}ms 안에 오지 않았습니다: ${JSON.stringify(this.received)}`)
    }
    return found
  }

  /** 그 종류의 프레임이 `count`개 쌓일 때까지 기다린다 — 참가·이탈이 여러 번 오는 자리에 쓴다. */
  async waitForCount<T extends ServerFrame['type']>(
    type: T,
    count: number,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<Array<Extract<ServerFrame, { type: T }>>> {
    const matches = (): Array<Extract<ServerFrame, { type: T }>> =>
      this.received.filter((frame) => frame.type === type) as Array<Extract<ServerFrame, { type: T }>>
    const found = await this.#until(() => (matches().length >= count ? matches() : undefined), timeoutMs)
    if (!found) {
      throw new Error(`${type} 프레임이 ${count}개까지 차지 않았습니다: ${JSON.stringify(this.received)}`)
    }
    return found
  }

  async waitClosed(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<CloseInfo> {
    const found = await this.#until(() => this.closeInfo ?? undefined, timeoutMs)
    if (!found) throw new Error(`연결이 ${timeoutMs}ms 안에 닫히지 않았습니다`)
    return found
  }

  /** 창 하나 동안 기다렸다가 **그 사이 새로 온 프레임**을 돌려준다. `[]`가 *"안 왔다"*이다. */
  async quiet(windowMs = QUIET_MS): Promise<ServerFrame[]> {
    const mark = this.received.length
    await new Promise((resolve) => setTimeout(resolve, windowMs))
    return this.received.slice(mark)
  }

  send(raw: string): void {
    this.#socket.send(raw)
  }

  close(): void {
    this.#socket.close()
  }

  async #until<T>(probe: () => T | undefined, timeoutMs: number): Promise<T | undefined> {
    const hit = probe()
    if (hit !== undefined) return hit

    return new Promise<T | undefined>((resolve) => {
      const timer = setTimeout(() => {
        this.#wake.delete(wake)
        resolve(undefined)
      }, timeoutMs)
      const wake = (): void => {
        const value = probe()
        if (value === undefined) return
        clearTimeout(timer)
        this.#wake.delete(wake)
        resolve(value)
      }
      this.#wake.add(wake)
    })
  }
}

/** 붙어서 `joined`까지 받은 연결. 인증이 통과하는 케이스가 이 지름길을 쓴다. */
export async function joinRoom(port: number, projectId: string, token: string): Promise<WsProbe> {
  const probe = WsProbe.open(port, projectId, token)
  if (!(await probe.opened)) {
    throw new Error('WebSocket 핸드셰이크가 실패했습니다')
  }
  await probe.waitFor('joined')
  return probe
}
