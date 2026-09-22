import net from 'node:net'

/**
 * **api ↔ Postgres 사이의 TCP 프록시 — 연결을 원하는 순간에 끊는다.** DB 연결이 쿼리 도중 끊기는 판(페일오버 ·
 * 네트워크 순단 · 백엔드 종료)을 케이스 안에서 만드는 자리다. 좁은 반증 3차의 `pgproxy.mjs`(Chrome 측정)를
 * 케이스로 옮긴 것이다.
 *
 * 무장은 **한 번 쏘면 풀린다.** 판정은 메시지 경계가 아니라 **받은 덩어리**로 한다 — pg 는 한 질의를 한 번에
 * 쓰므로(확장 프로토콜의 Parse…Sync 가 한 덩어리 · `commit` 은 단순 질의 `Q` 한 덩어리) 이 저장소의 질의에는
 * 그것으로 충분하다. 덩어리가 쪼개져 오는 판은 못 잡는다(그러면 무장이 안 쏴지고 케이스가 «끊기지 않았다»로
 * 죽는다 — 거짓 초록이 아니라 거짓 빨강의 방향이다).
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
   * `fragment` 를 담은 질의 **대신 잘못된 메시지**(형식 `z`)를 Postgres 에 보낸다 — 서버가 **진짜** `FATAL 08P01`
   * («invalid frontend message type 122»)로 답하고 연결을 닫는다. 리뷰(2026-09-22)의 `corrupt` 모드다 — `08` 부류를 서버에서
   * 내게 하는 길이 이것뿐이었다.
   */
  corruptQuery(fragment: string): void
  /**
   * **서버가 연결을 닫은 뒤 api 쪽 소켓을 `ms` 만큼 늦게 닫는다** — 서버의 FATAL 답과 소켓 끝 사이의 틈을 넓힌다. 그 틈은
   * 진짜로 있다(곁 — api 스크립트에서 경합으로 섰다). 케이스가 경합에 기대지 않고 그 틈을 매번 서게 하려는 것이다. 그 사이
   * api 가 보낸 바이트는 버린다(서버 쪽은 이미 닫혔다).
   */
  holdClientAfterServerClose(ms: number): void
  /** 무장이 쏴졌는가. */
  readonly fired: boolean
  close(): Promise<void>
}

type Arm =
  | { kind: 'commit-reply'; fragment: string }
  | { kind: 'query'; fragment: string }
  | { kind: 'corrupt'; fragment: string }
  | null

const QUERY = 0x51 // 'Q' — 단순 질의
/** 없는 메시지 형식 `z`(길이 4 — 본문 없음). 서버는 `08P01`로 답하고 닫는다. */
const INVALID_MESSAGE = Buffer.from([0x7a, 0, 0, 0, 4])

export async function startFaultProxy(databaseUrl: string): Promise<FaultProxy> {
  const upstream = new URL(databaseUrl)
  const upstreamPort = Number(upstream.port || 5432)
  const upstreamHost = upstream.hostname
  let arm: Arm = null
  let fired = false
  let holdMs = 0
  const sockets = new Set<net.Socket>()

  const server = net.createServer((client) => {
    const up = net.connect(upstreamPort, upstreamHost)
    sockets.add(client)
    sockets.add(up)
    let sawFragment = false
    let commitSent = false
    let serverGone = false
    const cut = (): void => {
      client.destroy()
      up.destroy()
    }
    /** 서버 쪽이 닫혔다 — `holdClientAfterServerClose`가 있으면 api 쪽은 그만큼 뒤에 닫는다. */
    const onServerGone = (): void => {
      if (serverGone) return
      serverGone = true
      if (holdMs > 0 && !client.destroyed) setTimeout(cut, holdMs).unref()
      else cut()
    }

    client.on('data', (chunk) => {
      if (serverGone) return
      const text = chunk.toString('latin1').toLowerCase()
      if (arm?.kind === 'query' && text.includes(arm.fragment)) {
        arm = null
        fired = true
        cut()
        return
      }
      if (arm?.kind === 'corrupt' && text.includes(arm.fragment)) {
        arm = null
        fired = true
        up.write(INVALID_MESSAGE)
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
    corruptQuery: (fragment) => {
      arm = { kind: 'corrupt', fragment: fragment.toLowerCase() }
    },
    holdClientAfterServerClose: (ms) => {
      holdMs = ms
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
