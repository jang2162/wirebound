import net from 'node:net'

/**
 * **api ↔ Postgres 사이의 TCP 프록시 — 연결을 원하는 순간에 끊는다.** DB 연결이 쿼리 도중 끊기는 판(페일오버 ·
 * 네트워크 순단 · 백엔드 종료)을 케이스 안에서 만드는 자리다.
 *
 * 무장은 **한 번 쏘면 풀린다.** 판정은 메시지 경계가 아니라 **받은 덩어리**로 한다 — pg 는 한 질의를 한 번에
 * 쓰므로(확장 프로토콜의 Parse…Sync 가 한 덩어리 · `commit` 은 단순 질의 `Q` 한 덩어리) 이 저장소의 질의에는
 * 그것으로 충분하다. 덩어리가 쪼개져 오는 판은 못 잡는다(그러면 무장이 안 쏴지고 케이스가 «끊기지 않았다»로
 * 죽는다 — 거짓 초록이 아니라 거짓 빨강의 방향이다).
 *
 * **글자는 질의문만이 아니라 덩어리 전체에서 찾는다 — 매개변수 값도 든다.** 케이스가 싣는 값(노드 id · 본문)에 조각이 들면
 * 무장이 그 질의에서 쏜다: 노드 id 에 `commit`이 들면 `halfCutOnQuery('commit')`이 COMMIT 이 아니라 그 id 를 실은 질의에서
 * 끊어, 케이스는 커밋 안 된 503 을 본다. 조각이 든 값을 싣지 않는다.
 */
export interface FaultProxy {
  /** 이 프록시를 거치는 접속 문자열 — `TEST_DATABASE_URL` 에서 포트만 바꾼 것. */
  readonly url: string
  /**
   * `fragment` 를 보낸 연결이 **그 뒤 `commit` 을 보내면** 그 COMMIT 은 Postgres 에 넘기고, **그 응답이 오는 순간**
   * api 쪽 소켓을 끊는다 — 커밋은 됐는데 api 는 모른다(«커밋 응답 유실»).
   */
  dropCommitReplyAfter(fragment: string): void
  /** `fragment` 를 담은 질의를 **Postgres 에 넘기지 않고** 그 연결을 끊는다 — 그 질의는 서버에 안 닿았다. */
  dropOnQuery(fragment: string): void
  /**
   * `fragment` 를 담은 질의를 **`ms` 뒤에** Postgres 에 넘긴다 — 그 질의의 스냅숏이 그만큼 늦게 잡힌다. 위 무장들과 따로
   * 선다(함께 걸 수 있다). 한 번 쏘면 풀리고 `fired`에는 세지 않는다.
   */
  delayQuery(fragment: string, ms: number): void
  /**
   * `fragment` 를 담은 질의를 **붙잡는다** — `release()`까지 Postgres 에 안 넘긴다. `held`는 그 질의가 붙잡혔을 때 풀린다.
   * 요청 하나를 그 질의 앞에서 세워 두고(그 앞에서 잡은 잠금은 쥔 채) 다른 요청을 겹치는 자리다. `delayQuery`와 같은 칸을 쓴다.
   *
   * **`held`는 `heldWithinMs`(기본 `HOLD_WITHIN_MS`) 안에 안 붙잡히면 원인 문장으로 거절한다** — 질의의 글자가 바뀌었거나(조각은
   * SQL 모양에 매인다) 요청이 그 질의 앞에서 끝나면 판이 안 서는데, 한도가 없으면 케이스는 원인 없이 케이스 한도까지 멈춘다. 그때 이
   * 붙잡기도 거둔다 — 늦게 온 질의를 엉뚱하게 세우지 않는다. `held`를 안 기다리는 호출자에게 그 거절은 조용히 지난다.
   *
   * **붙잡을 요청이 그 질의 앞에서 끝나는 판**(고친 판의 앞선 판정)을 함께 받으려면 `held` 와 그 요청의 끝을 겨루고, 요청이 먼저
   * 끝났으면 다음 요청을 보내기 전에 `release()` 로 칸을 푼다 — 안 풀면 무장한 칸이 `heldWithinMs` 까지 남아 다음 요청의 같은 글자
   * 질의를 붙잡는다. 푼 칸도 다음 같은 글자 질의 하나에 쏴지고 사라지지만 붙잡지 않고 곧바로 넘긴다(`project-theme-review.test.ts`
   * «숨긴 판을 다시 고르는 경주»).
   */
  holdQuery(fragment: string, heldWithinMs?: number): { held: Promise<void>; release: () => void }
  /**
   * `fragment` 를 담은 질의 **대신 잘못된 메시지**(형식 `z`)를 Postgres 에 보낸다 — 서버가 **진짜** `FATAL 08P01`
   * («invalid frontend message type 122»)로 답하고 연결을 닫는다 — `08` 부류를 서버에서 내게 하는 길이 이것뿐이다.
   */
  corruptQuery(fragment: string): void
  /**
   * **서버가 연결을 닫은 뒤 api 쪽 소켓을 `ms` 만큼 늦게 닫는다** — 서버의 FATAL 답과 소켓 끝 사이의 틈을 넓힌다. 그 틈은
   * 진짜로 있다(경합으로 선다). 케이스가 경합에 기대지 않고 그 틈을 매번 서게 하려는 것이다. 그 사이
   * api 가 보낸 바이트는 버린다(서버 쪽은 이미 닫혔다).
   */
  holdClientAfterServerClose(ms: number): void
  /**
   * `fragment` 를 담은 질의를 **Postgres 에 넘긴 뒤 api 쪽 소켓만** 끊는다 — 서버 쪽 소켓은 `close()`까지 열어 둔다. 네트워크
   * 분할 · NAT 유휴 끊김의 모양이다: api 는 곧바로 연결을 잃었다고 알고, 서버의 백엔드는 **상대가 떠난 줄 모른 채** 그 질의를
   * 마치고 트랜잭션 안에서 쉰다(잠금을 쥔 채 — 고아).
   */
  halfCutOnQuery(fragment: string): void
  /**
   * **풀러 흉내 — 기동 메시지에 `name`이 있으면 거절한다**(무장과 달리 계속 선다 · 모든 새 연결). 기본 설정 pgbouncer 가 모르는
   * 기동 인자에 보내는 것과 **같은 바이트**를 보내고 닫는다 — `ErrorResponse`의 칸 셋 `S FATAL` · `C 08P01` ·
   * `M unsupported startup parameter: <name>`(`edoburu/pgbouncer` 1.25.2 에서 원시 소켓으로 쟀다 · `V` 칸이 없다).
   */
  rejectStartupParameter(name: string): void
  /** **풀러 흉내 — 기동 메시지에서 `name`을 조용히 뺀다**(pgbouncer 의 `ignore_startup_parameters`). 계속 선다. */
  dropStartupParameter(name: string): void
  /**
   * `fragment` 를 담은 덩어리를 **센다** — 무장 · 붙잡기와 따로 서고 풀리지 않는다(모든 연결 · 끝까지). 한 질의를 몇 번 보냈는지 재는
   * 자리다(잃은 COMMIT 의 결말을 묻는 폴링). 머리말대로 매개변수 값도 글자에 든다.
   */
  countQueries(fragment: string): { readonly count: number }
  /**
   * `fragment` 를 담은 덩어리를 **Postgres 에 넘기지 않고 버린다 — 연결은 둔다**(그 질의의 답이 영영 안 온다). `stop()`까지 모든 연결에서
   * 계속 서고, 무장 · 붙잡기와 따로 선다(함께 걸 수 있다). `count`는 버린 덩어리 수다. 그 연결의 질의 하나가 답을 못 받는 판(NAT 유휴 끊김 ·
   * 죽은 유휴 연결 · 분할)의 흉내다 — 다른 질의는 그대로 지나므로 «그 사이 다른 요청은 멀쩡하다»는 이 흉내의 산물이다.
   */
  swallowQueries(fragment: string): { stop(): void; readonly count: number }
  /** 무장이 쏴졌는가. */
  readonly fired: boolean
  close(): Promise<void>
}

type Arm =
  | { kind: 'commit-reply'; fragment: string }
  | { kind: 'query'; fragment: string }
  | { kind: 'corrupt'; fragment: string }
  | { kind: 'half-cut'; fragment: string }
  | null

const QUERY = 0x51 // 'Q' — 단순 질의
/** 없는 메시지 형식 `z`(길이 4 — 본문 없음). 서버는 `08P01`로 답하고 닫는다. */
const INVALID_MESSAGE = Buffer.from([0x7a, 0, 0, 0, 4])
/** 프로토콜 3.0 의 기동 메시지 — 형식 바이트 없이 길이 · 196608 · `이름\0값\0`… · `\0`. */
const PROTOCOL_3 = 196608

interface StartupPolicy {
  reject: Set<string>
  drop: Set<string>
}

/** 기동 메시지를 풀러처럼 다룬다 — 거절이면 보낼 `ErrorResponse`, 아니면 (뺄 것을 뺀) 기동 메시지. 기동 메시지가 아니면 그대로. */
function applyStartupPolicy(chunk: Buffer, policy: StartupPolicy): { reject: Buffer } | { forward: Buffer } {
  if (chunk.length < 8 || chunk.readInt32BE(4) !== PROTOCOL_3) return { forward: chunk }
  const fields = chunk.subarray(8, chunk.readInt32BE(0)).toString('utf8').split('\0')
  const kept: string[] = []
  for (let i = 0; i + 1 < fields.length && fields[i] !== ''; i += 2) {
    const [name, value] = [fields[i] as string, fields[i + 1] as string]
    if (policy.reject.has(name)) {
      const body = Buffer.from(`SFATAL\0C08P01\0Munsupported startup parameter: ${name}\0\0`, 'utf8')
      const head = Buffer.alloc(5)
      head.write('E', 0, 'latin1')
      head.writeInt32BE(4 + body.length, 1)
      return { reject: Buffer.concat([head, body]) }
    }
    if (!policy.drop.has(name)) kept.push(name, value)
  }
  const body = Buffer.from(kept.map((part) => `${part}\0`).join('') + '\0', 'utf8')
  const head = Buffer.alloc(8)
  head.writeInt32BE(8 + body.length, 0)
  head.writeInt32BE(PROTOCOL_3, 4)
  return { forward: Buffer.concat([head, body, chunk.subarray(chunk.readInt32BE(0))]) }
}

/** `holdQuery`의 `held`가 기다리는 기본 한도 — api 케이스 한도(20s)보다 짧아 그 앞에 원인 문장이 나온다. */
export const HOLD_WITHIN_MS = 10_000

export async function startFaultProxy(databaseUrl: string): Promise<FaultProxy> {
  const upstream = new URL(databaseUrl)
  const upstreamPort = Number(upstream.port || 5432)
  const upstreamHost = upstream.hostname
  let arm: Arm = null
  let fired = false
  let holdMs = 0
  let delay: { fragment: string; ms: number | Promise<void>; onHeld?: () => void } | null = null
  const startup: StartupPolicy = { reject: new Set(), drop: new Set() }
  const counters: { fragment: string; count: number }[] = []
  const swallows: { fragment: string; on: boolean; count: number }[] = []
  const sockets = new Set<net.Socket>()

  const server = net.createServer((client) => {
    const up = net.connect(upstreamPort, upstreamHost)
    sockets.add(client)
    sockets.add(up)
    let sawFragment = false
    let commitSent = false
    let serverGone = false
    /** `halfCutOnQuery`가 쐈다 — 서버 쪽 소켓은 `close()`까지 둔다. */
    let orphaned = false
    /** 첫 덩어리는 기동 메시지다 — pg 는 SSL 을 안 쓰면 그것부터 보낸다. */
    let startupSeen = false
    const cut = (): void => {
      client.destroy()
      if (!orphaned) up.destroy()
    }
    /** 서버 쪽이 닫혔다 — `holdClientAfterServerClose`가 있으면 api 쪽은 그만큼 뒤에 닫는다. */
    const onServerGone = (): void => {
      if (serverGone) return
      serverGone = true
      if (holdMs > 0 && !client.destroyed) setTimeout(cut, holdMs).unref()
      else cut()
    }

    client.on('data', (chunk: Buffer) => {
      if (serverGone) return
      if (!startupSeen) {
        startupSeen = true
        const handled = applyStartupPolicy(chunk, startup)
        if ('reject' in handled) {
          // 서버 쪽 끝이 api 쪽을 곧바로 끊지 않게(`onServerGone`) 먼저 세운다 — 거절 바이트가 다 나간 뒤 닫힌다.
          serverGone = true
          up.destroy()
          client.end(handled.reject)
          return
        }
        up.write(handled.forward)
        return
      }
      const text = chunk.toString('latin1').toLowerCase()
      for (const counter of counters) if (text.includes(counter.fragment)) counter.count += 1
      const swallow = swallows.find((slot) => slot.on && text.includes(slot.fragment))
      if (swallow !== undefined) {
        swallow.count += 1
        return
      }
      if (arm?.kind === 'query' && text.includes(arm.fragment)) {
        arm = null
        fired = true
        cut()
        return
      }
      if (arm?.kind === 'half-cut' && text.includes(arm.fragment)) {
        arm = null
        fired = true
        orphaned = true
        up.write(chunk)
        client.destroy()
        return
      }
      if (arm?.kind === 'corrupt' && text.includes(arm.fragment)) {
        arm = null
        fired = true
        up.write(INVALID_MESSAGE)
        return
      }
      if (delay !== null && text.includes(delay.fragment)) {
        const { ms, onHeld } = delay
        delay = null
        const forward = (): void => {
          if (!up.destroyed) up.write(chunk)
        }
        if (typeof ms === 'number') setTimeout(forward, ms)
        else void ms.then(forward)
        onHeld?.()
        return
      }
      if (arm?.kind === 'commit-reply') {
        if (text.includes(arm.fragment)) sawFragment = true
        if (sawFragment && chunk[0] === QUERY && text.slice(5).startsWith('commit')) {
          arm = null
          commitSent = true
        }
      }
      up.write(chunk)
    })
    up.on('data', (chunk) => {
      if (orphaned) return
      if (commitSent) {
        fired = true
        cut()
        return
      }
      client.write(chunk)
    })
    client.on('error', cut)
    client.on('close', () => {
      sockets.delete(client)
      cut()
    })
    up.on('error', onServerGone)
    up.on('close', () => {
      sockets.delete(up)
      onServerGone()
    })
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('pg-fault-proxy: 포트를 열지 못했습니다')
  const url = new URL(databaseUrl)
  url.hostname = '127.0.0.1'
  url.port = String(address.port)

  return {
    url: url.toString(),
    dropCommitReplyAfter: (fragment) => {
      arm = { kind: 'commit-reply', fragment: fragment.toLowerCase() }
    },
    dropOnQuery: (fragment) => {
      arm = { kind: 'query', fragment: fragment.toLowerCase() }
    },
    delayQuery: (fragment, ms) => {
      delay = { fragment: fragment.toLowerCase(), ms }
    },
    holdQuery: (fragment, heldWithinMs = HOLD_WITHIN_MS) => {
      let release: () => void = () => {}
      const released = new Promise<void>((resolve) => {
        release = resolve
      })
      let markHeld: () => void = () => {}
      let giveUp: (error: Error) => void = () => {}
      const held = new Promise<void>((resolve, reject) => {
        markHeld = resolve
        giveUp = reject
      })
      held.catch(() => {})
      const slot = {
        fragment: fragment.toLowerCase(),
        ms: released,
        onHeld: () => {
          clearTimeout(limit)
          markHeld()
        },
      }
      const limit = setTimeout(() => {
        if (delay === slot) delay = null
        giveUp(
          new Error(
            `프록시: '${fragment}'를 담은 질의가 ${heldWithinMs}ms 안에 안 왔습니다 — 판이 안 섰습니다(그 질의의 글자가 바뀌었거나, 요청이 그 질의 앞에서 끝났거나, 다음 붙잡기가 이 칸을 덮었다)`,
          ),
        )
      }, heldWithinMs)
      limit.unref()
      delay = slot
      return { held, release }
    },
    corruptQuery: (fragment) => {
      arm = { kind: 'corrupt', fragment: fragment.toLowerCase() }
    },
    holdClientAfterServerClose: (ms) => {
      holdMs = ms
    },
    halfCutOnQuery: (fragment) => {
      arm = { kind: 'half-cut', fragment: fragment.toLowerCase() }
    },
    countQueries: (fragment) => {
      const counter = { fragment: fragment.toLowerCase(), count: 0 }
      counters.push(counter)
      return {
        get count() {
          return counter.count
        },
      }
    },
    swallowQueries: (fragment) => {
      const slot = { fragment: fragment.toLowerCase(), on: true, count: 0 }
      swallows.push(slot)
      return {
        stop: () => {
          slot.on = false
        },
        get count() {
          return slot.count
        },
      }
    },
    rejectStartupParameter: (name) => {
      startup.reject.add(name)
    },
    dropStartupParameter: (name) => {
      startup.drop.add(name)
    },
    get fired() {
      return fired
    },
    close: async () => {
      for (const socket of sockets) socket.destroy()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}
