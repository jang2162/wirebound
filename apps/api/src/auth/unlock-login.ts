/**
 * **로그인 막힘을 푸는 명령 — 서버에 손이 닿는 사람이 계정 · 주소 하나의 시도 기록을 비운다.**
 *
 * ```bash
 * pnpm --filter @wirebound/api unlock-login me@example.com
 * pnpm --filter @wirebound/api unlock-login --address 203.0.113.7
 * ```
 *
 * 로그인 제한(`auth/login-limit.ts`)은 막힌 동안 옳은 비밀번호도 429 로 받는다 — 그 대가로 남이 틀린 비밀번호를 보내 내 새
 * 로그인을 창 동안 막을 수 있다. 이 명령이 그 창을 기다리지 않고 푸는 길이다. api 를 다시 띄우는 것(모두의 기록을 비운다)보다
 * 좁다 — 준 키의 기록만 걷는다.
 *
 * **api 가 연 유닉스 소켓으로 보낸다**(`auth/unlock-socket.ts` — 왜 소켓인지 · 자리가 어디인지는 그 머리말). 그 api 를 띄운
 * 체크아웃(같은 `apps/api/.env` 의 `HOST` · `PORT`)에서 · 그 api 를 띄운 사용자로 친다. 첫 줄에 어느 api 에 보내는지 말한다.
 *
 * **붙기 전에 자리를 본다 — api 가 여는 조건과 같은 한 벌로**(`privatePlaceProblem`). 공유 `/tmp` 에서는 남이 그 자리를 먼저 만들어
 * 둘 수 있고, 그때 api 는 입구를 안 열었는데 거기 남의 소켓이 듣고 있을 수 있다 — 붙으면 이메일을 남에게 주고 남이 지어낸 답을
 * 믿는다. **답도 믿지 않고 찍는다** — 보낸 키의 결과가 제 꼴로 없으면 «모릅니다»이고, 답의 글자는 제어 문자를 걷고 찍는다(남의
 * 글자가 터미널을 조작하지 않게).
 *
 * **이메일 · 주소의 규칙은 api 가 판정한다** — 로그인이 센 키와 같은 키를 풀어야 하므로 로그인 라우트와 같은 함수(정규화 ·
 * `addressKey`)를 api 쪽에서 부른다. 계정이 DB 에 있는지는 안 본다 — 로그인 제한의 키가 계정 행이 아니라 이메일 글자다.
 *
 * **바꾸지 않고 끝나는 갈래가 전부 «아무것도 바꾸지 않았습니다»를 말하고 종료 1 이다** — 인자가 어긋남 · 소켓이 없음 · api 가
 * 꺼짐 · 권한 없음 · api 가 거절. **보낸 뒤 답을 잃으면 «풀렸는지 모릅니다»다** — 여러 번 쳐도 결과가 같으니 다시 친다.
 * 비밀 값을 받지 않으므로 표준입력을 읽지 않는다 — 붙여 넣은 뒤 줄은 셸이 다음 명령으로 돌린다.
 */
import { request } from 'node:http'
import { pathToFileURL } from 'node:url'
import { loadConfig } from '../config'
import { privatePlaceProblem, UNLOCK_ROUTE, unlockSocketPlace, type UnlockKeyResult, type UnlockRequest } from './unlock-socket'

export interface UnlockLoginIo {
  log: (line: string) => void
  error: (line: string) => void
}

const NOTHING_CHANGED = '아무것도 바꾸지 않았습니다.'
const USAGE = '사용법: pnpm --filter @wirebound/api unlock-login [<이메일>] [--address <주소>]  — 둘 중 하나 이상'

/** 인자를 푼다. 어긋나면 사람에게 갈 한 줄을 준다. */
export function parseUnlockArgs(rawArgs: readonly string[]): UnlockRequest | { error: string } {
  // `pnpm … unlock-login -- <이메일>` 처럼 pnpm 인자 관습으로 붙인 `--` 는 인자가 아니다.
  const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs
  const target: UnlockRequest = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] as string
    if (arg === '--address') {
      const value = args[i + 1]
      if (value === undefined || value.trim() === '') return { error: '--address 뒤에 주소가 없습니다' }
      if (target.address !== undefined) return { error: '주소는 한 번에 하나만 받습니다' }
      target.address = value
      i++
    } else if (arg.startsWith('-')) {
      return { error: `모르는 옵션입니다: ${arg}` }
    } else if (arg.trim() === '') {
      return { error: '빈 인자가 있습니다' }
    } else {
      if (target.email !== undefined) return { error: '이메일은 한 번에 하나만 받습니다' }
      target.email = arg.trim()
    }
  }
  if (target.email === undefined && target.address === undefined) return { error: '푸는 대상(이메일 · 주소)이 없습니다' }
  return target
}

type Sent =
  | { kind: 'answered'; status: number; body: unknown }
  /** 소켓에 닿기 전에 끝났다 — api 는 아무것도 못 받았다. */
  | { kind: 'unreached'; code: string | undefined; message: string }
  /** 닿은 뒤 답을 잃었다 — api 가 풀었는지 모른다. */
  | { kind: 'lost'; message: string }

function send(socketPath: string, body: UnlockRequest, timeoutMs: number): Promise<Sent> {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body)
    let connected = false
    let settled = false
    const settle = (sent: Sent): void => {
      if (settled) return
      settled = true
      resolve(sent)
    }
    const req = request(
      {
        socketPath,
        method: 'POST',
        path: UNLOCK_ROUTE,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) },
        timeout: timeoutMs,
      },
      (response) => {
        const chunks: Buffer[] = []
        response.on('data', (chunk: Buffer) => chunks.push(chunk))
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8')
          let parsed: unknown = text
          try {
            parsed = JSON.parse(text)
          } catch {
            // 글자 그대로 둔다 — 아래에서 거절로 말한다.
          }
          settle({ kind: 'answered', status: response.statusCode ?? 0, body: parsed })
        })
        response.on('error', (error) => settle({ kind: 'lost', message: error.message }))
      },
    )
    req.on('socket', (socket) => socket.once('connect', () => (connected = true)))
    req.on('timeout', () => req.destroy(new Error(`${timeoutMs}ms 안에 답이 없습니다`)))
    req.on('error', (error: NodeJS.ErrnoException) =>
      settle(connected ? { kind: 'lost', message: error.message } : { kind: 'unreached', code: error.code, message: error.message }),
    )
    req.end(payload)
  })
}

/**
 * 터미널에 찍기 전에 제어 문자(C0 · DEL · C1)와 글자 방향을 뒤집는 문자를 `\u001b` 꼴로 바꾼다 — 답의 글자가 터미널을 조작하지 않게.
 */
export function printable(text: string): string {
  return text.replace(
    /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g,
    (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`,
  )
}

/** 답 속 키 하나의 결과가 제 꼴인지 — 아니면 `undefined`. `label` 은 `email`(계정) · `key`(주소)다. */
function keyResultOf(value: unknown, label: 'email' | 'key'): (UnlockKeyResult & { label: string }) | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const { cleared, blockedForSeconds, [label]: name } = value as Record<string, unknown>
  if (typeof name !== 'string' || typeof cleared !== 'number' || !Number.isSafeInteger(cleared) || cleared < 0) return undefined
  if (
    blockedForSeconds !== null &&
    !(typeof blockedForSeconds === 'number' && Number.isFinite(blockedForSeconds) && blockedForSeconds > 0)
  ) {
    return undefined
  }
  return { label: name, cleared, blockedForSeconds }
}

function describeKey(result: UnlockKeyResult): string {
  if (result.cleared === 0) return '창 안의 시도가 없습니다 — 막혀 있지 않았습니다'
  const state =
    result.blockedForSeconds === null
      ? '막혀 있지 않았습니다'
      : `막혀 있었습니다(그대로 두면 ${Math.ceil(result.blockedForSeconds / 60)}분 뒤 풀렸습니다)`
  return `창 안의 시도 ${result.cleared}건을 지웠습니다 — ${state}`
}

/** **명령 한 번 — 종료 코드를 돌려준다.** 0 풀었다(걷은 것이 0 건이어도) · 1 바꾸지 않았다 · 모른다. */
export async function runUnlockLogin(
  rawArgs: readonly string[],
  /** `uid` 는 자리의 주인과 견줄 값 — 기본은 이 프로세스의 것이다. */
  target: { host: string; port: number; dir: string; socketPath: string; timeoutMs: number; uid?: number },
  io: UnlockLoginIo,
): Promise<number> {
  const parsed = parseUnlockArgs(rawArgs)
  if ('error' in parsed) {
    io.error(USAGE)
    io.error(`${parsed.error} — ${NOTHING_CHANGED}`)
    return 1
  }

  io.log(`로그인 막힘을 풀 api: HOST ${target.host} · PORT ${target.port} (${target.socketPath})`)
  const missing =
    `api 의 입구가 없습니다 — 이 기계에서 HOST ${target.host} · PORT ${target.port} 의 api 가 안 떠 있거나, 떠 있으면 그 api 의 ` +
    `기동 로그에 «로그인 막힘을 푸는 입구를 안 엽니다» 줄이 까닭을 말한다. 입구가 열렸는데 경로가 위와 다르면 api 를 띄운 셸과 ` +
    `XDG_RUNTIME_DIR · TMPDIR 가 다른 것이다. ${NOTHING_CHANGED}`
  let problem: string | undefined
  try {
    problem = await privatePlaceProblem({ dir: target.dir, socket: target.socketPath }, target.uid ?? process.getuid?.())
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      io.error(missing)
      return 1
    }
    problem = `자리를 보지 못했습니다(${(error as Error).message})`
  }
  if (problem !== undefined) {
    io.error(`입구의 자리를 믿을 수 없어 보내지 않았습니다 — ${problem}. ${NOTHING_CHANGED}`)
    return 1
  }

  const sent = await send(target.socketPath, parsed, target.timeoutMs)

  if (sent.kind === 'unreached') {
    io.error(
      sent.code === 'ENOENT'
        ? missing
        : sent.code === 'ECONNREFUSED'
          ? `api 가 떠 있지 않습니다(소켓 파일만 남았다) — 다시 띄우면 기록은 비어 있다. ${NOTHING_CHANGED}`
          : sent.code === 'EACCES'
            ? `입구에 들어갈 권한이 없습니다 — api 를 띄운 사용자로 친다. ${NOTHING_CHANGED}`
            : `api 에 닿지 못했습니다(${printable(sent.message)}) — ${NOTHING_CHANGED}`,
    )
    return 1
  }
  if (sent.kind === 'lost') {
    io.error(`api 가 답하지 않았습니다(${printable(sent.message)}) — 풀렸는지 모릅니다. 다시 친다(여러 번 쳐도 결과가 같다).`)
    return 1
  }
  if (sent.status !== 200) {
    const message =
      typeof sent.body === 'object' && sent.body !== null && typeof (sent.body as { message?: unknown }).message === 'string'
        ? (sent.body as { message: string }).message
        : String(sent.body)
    io.error(`api 가 거절했습니다(${sent.status}): ${printable(message)} — ${NOTHING_CHANGED}`)
    return 1
  }

  const body = (typeof sent.body === 'object' && sent.body !== null ? sent.body : {}) as Record<string, unknown>
  const account = parsed.email === undefined ? undefined : keyResultOf(body.account, 'email')
  const address = parsed.address === undefined ? undefined : keyResultOf(body.address, 'key')
  if ((parsed.email !== undefined && account === undefined) || (parsed.address !== undefined && address === undefined)) {
    io.error('api 의 답에 보낸 키의 결과가 없습니다 — 풀렸는지 모릅니다. api 를 띄운 체크아웃 · 사용자로 친 것인지 본다.')
    return 1
  }
  if (account !== undefined) io.log(`계정 ${printable(account.label)} — ${describeKey(account)}`)
  if (address !== undefined) io.log(`주소 ${printable(address.label)} — ${describeKey(address)}`)
  if (parsed.address === undefined) {
    // 429 문장은 계정 · 주소를 안 가른다(`routes/auth.ts` 의 `loginLimitedMessage`) — 풀었는데 또 막히면 주소 쪽이다.
    io.log('풀었는데도 «로그인 시도가 너무 많습니다»가 뜨면 그 사람의 주소가 막힌 것이다 — --address <주소> 로 푼다')
  }
  return 0
}

async function main(): Promise<void> {
  const config = loadConfig()
  // api 가 여는 자리와 같은 함수로 짓는다(`auth/unlock-socket.ts` 머리말 «자리는»).
  const place = unlockSocketPlace(config)
  process.exitCode = await runUnlockLogin(
    process.argv.slice(2),
    // 입구는 메모리의 키 하나를 걷고 곧바로 답한다 — 답이 이만큼 없으면 api 가 멈춘 것이다.
    { host: config.host, port: config.port, dir: place.dir, socketPath: place.path, timeoutMs: 10_000 },
    { log: (line) => console.log(line), error: (line) => console.error(line) },
  )
}

// `migrate.ts` 와 같은 판정 — 경로에 공백 · 한글이 있어도 CLI 로 불렸을 때만 돈다.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  void main()
}
