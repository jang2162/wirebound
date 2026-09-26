/**
 * **로그인 막힘을 푸는 입구 — 이 기계의 유닉스 소켓 하나.** 명령(`auth/unlock-login.ts`)이 이것을 부른다.
 *
 * 로그인 시도 기록은 api 프로세스의 메모리에 있고(`auth/login-limit.ts` 머리말 «저장소는 프로세스 메모리다») 명령은 다른
 * 프로세스라, 명령이 그 기록에 닿으려면 api 가 입구를 열어야 한다.
 *
 * **왜 소켓인가 — 인가를 파일 권한으로 한다.** 소켓은 api 를 띄운 사용자만 들어가는 디렉터리(0700) 안에 있다. 그 디렉터리에
 * 닿는 사람은 서버에 손이 닿는 사람이고, 그 사람은 어차피 api 를 다시 띄워 기록을 다 비울 수 있다 — 이 입구가 주는 권한은
 * 그보다 좁다(키 하나). 비밀 값(토큰 · 비밀번호)을 따로 두지 않는다.
 * - **TCP 로는 안 연다.** 루프백만 받게 해도 같은 기계의 앞단(리버스 프록시)이 `127.0.0.1` 로 넘기면 바깥 요청이 루프백으로
 *   들어온다. 소켓 경로는 앞단이 스스로 가리키지 않는 한 닿지 않는다. api 의 TCP 포트에는 이 경로가 없다(404).
 * - **다른 길을 고르지 않은 까닭** — DB 에 «풀어 줌» 표지를 두면 막힌 판(지금 DB 도 scrypt 도 안 거친다)이 DB 를 한 번 읽어
 *   막힌 키를 두드리는 요청이 곧바로 DB 풀을 쓰고, 명령은 api 가 표지를 읽었는지 · 막혀 있었는지를 말하지 못한다. 신호
 *   (`SIGUSR2`)는 키를 못 실어 모두의 기록 — 두드리는 쪽의 것까지 — 을 비운다.
 *
 * **자리는 `<바탕>/wirebound-<uid>/api-<HOST>-<PORT>.sock`**(`unlockSocketPlace`). 바탕은 `XDG_RUNTIME_DIR` 가 있으면 그것(Linux 의
 * 로그인 세션이 주는 주인 전용 디렉터리 — 남이 먼저 만들어 둘 수 없다), 없으면 `os.tmpdir()`(`TMPDIR` · 없으면 `/tmp`)다. compose
 * 컨테이너 · cron · 서비스 관리자에는 대개 `XDG_RUNTIME_DIR` 가 없어 `/tmp` 로 간다. api 와 명령이 같은 `.env`(같은 `HOST` ·
 * `PORT`)와 같은 사용자 · 같은 환경(`XDG_RUNTIME_DIR` · `TMPDIR`)으로 돌면 같은 자리를 본다 — 둘 다 `unlockSocketPlace(config)` 로
 * 짓는다. 워크트리마다 `PORT` 가 갈리므로 소켓도 갈린다. `HOST` 를 이름에 넣는 까닭: 같은 `PORT` 를 `127.0.0.1` · `::1` ·
 * `0.0.0.0` 에 함께 잡을 수 있다(macOS 에서 잰 값) — 이름이 `PORT` 뿐이면 두 api 가 한 자리를 두고 겨룬다.
 * - **자리를 믿는 조건은 api 와 명령이 같다**(`privatePlaceProblem` 한 벌): 디렉터리는 심볼릭 링크가 아닌 디렉터리 · 주인이 나 ·
 *   남에게 권한 0(`mode & 077`), 명령이 붙을 소켓은 소켓 · 주인이 나. 공유 `/tmp` 에서는 남이 `wirebound-<uid>` 를 먼저 만들어 둘 수
 *   있다 — api 는 그 자리에 **소켓을 안 열고** 한 줄로 말한 뒤 그대로 뜨고(`UnlockSocketRefused`), 명령은 **거기 붙지 않는다**(남의
 *   소켓에 이메일을 보내고 가짜 답을 믿게 된다). 경로가 소켓 경로 한도(macOS 103 · Linux 107 바이트)를 넘어도 안 연다.
 *
 * **여는 것은 `main.ts` 가 TCP 포트를 연 뒤다** — 자리에 소켓이 남아 있으면 **붙어 본다**: 받으면 산 api 가 쥔 자리라 안 열고
 * (`UnlockSocketRefused`), 거절(`ECONNREFUSED`)이면 죽은 api 의 것이라 지우고 연다. 소켓이 아닌 파일은 그냥 지운다 — 0700
 * 디렉터리 안이라 이 사용자가 둔 것이다. 붙어 보기 전에 `lstat` 으로 소켓인지 가르는 까닭: 소켓이 아닌 자리에 붙으면 macOS 는
 * `ENOTSOCK`, Linux 는 `ECONNREFUSED` 라(잰 값) 오류 코드만으로는 판이 OS 마다 갈린다. 여는 중의 파일 시스템 오류(자리에
 * 디렉터리가 있다 등)도 전부 `UnlockSocketRefused` 다 — 못 열어도 api 는 뜬다.
 *
 * **닫는 것은 `preClose` 다 — 도는 요청을 기다리기 전.** Node 는 소켓 서버를 닫을 때 그 경로의 파일을 **이름으로** 지운다(그
 * 자리에 다른 프로세스가 새로 만든 소켓이어도 — 잰 값: 연 소켓을 다른 이름으로 옮기고 그 자리에 파일을 둔 뒤 닫으면 그 파일이
 * 지워진다). `onClose` 는 도는 요청이 다 끝난 뒤(최대 `SHUTDOWN_GRACE_MS`)라, 그 사이 TCP 포트를 놓아 새 api 가 떠서 만든 소켓을
 * 지운다. `preClose` 는 TCP 포트를 놓기 전이라 새 api 가 아직 못 뜬다. 살아 있는 동안에는 뒤에 뜬 api 가 붙어 보고 비켜 가므로(위
 * «여는 것은») 이름으로 지우는 파일이 늘 제 것이다.
 *
 * **입구의 요청은 `UNLOCK_REQUEST_TIMEOUT_MS` 안에 다 와야 한다** — 명령은 본문 하나를 한 번에 보낸다. 끝없이 조금씩 보내는 연결이
 * Node 기본(300s) 동안 자리를 쥐지 않게.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { connect } from 'node:net'
import { chmod, lstat, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import type { FastifyInstance } from 'fastify'
import { getKoreanErrorMap } from '@wirebound/schema'
import { NormalizedEmail } from './credentials'
import { addressKey, type KeyClearance, type LoginLimiter } from './login-limit'

/** 입구의 경로 하나. 그 밖은 404 다. */
export const UNLOCK_ROUTE = '/login-unlock'

/** 본문 상한(바이트). 이메일 · 주소 하나씩이면 넉넉하다. */
export const UNLOCK_BODY_LIMIT = 4096

/** 입구에 온 요청이 다 와야 하는 시간(ms) — 머리말 «입구의 요청은». */
export const UNLOCK_REQUEST_TIMEOUT_MS = 5_000

/** 자리의 바탕 — `XDG_RUNTIME_DIR` 가 있으면 그것, 없으면 `os.tmpdir()`(머리말 «자리는»). 상대 경로는 규격대로 무시한다. */
export function unlockSocketBase(env: NodeJS.ProcessEnv = process.env): string {
  const runtime = env.XDG_RUNTIME_DIR
  return runtime !== undefined && isAbsolute(runtime) ? runtime : tmpdir()
}

/** api 를 띄운 사용자만 들어가는 디렉터리(머리말 «자리는»). */
export function unlockSocketDir(base: string = unlockSocketBase(), uid: number | undefined = process.getuid?.()): string {
  return join(base, `wirebound-${uid ?? 'user'}`)
}

/** 소켓 파일 이름에 `HOST` 를 넣는다 — 경로를 가르는 글자(`/`)와 그 밖의 드문 글자는 `_` 로 바꾼다. */
export function unlockSocketPath(host: string, port: number, dir: string = unlockSocketDir()): string {
  return join(dir, `api-${host.replace(/[^A-Za-z0-9.:_-]/g, '_')}-${port}.sock`)
}

/** **api 와 명령이 자리를 짓는 한 곳**(머리말 «자리는») — 둘 다 같은 `.env` 의 `HOST` · `PORT` 로 부른다. */
export function unlockSocketPlace(config: { host: string; port: number }): { dir: string; path: string } {
  const dir = unlockSocketDir()
  return { dir, path: unlockSocketPath(config.host, config.port, dir) }
}

/** 명령이 보내는 본문. 둘 중 하나 이상. */
export interface UnlockRequest {
  email?: string
  address?: string
}

/** 한 키의 결과. `blockedForSeconds` 는 막혀 있었으면 그대로 두었을 때 풀리기까지 남았던 초, 아니면 `null`. */
export interface UnlockKeyResult {
  cleared: number
  blockedForSeconds: number | null
}

/** 입구의 200 답. `email` 은 정규화한 판, `address.key` 는 센 키(IPv6 는 /64)다. */
export interface UnlockResponse {
  account?: UnlockKeyResult & { email: string }
  address?: UnlockKeyResult & { key: string }
}

/** 소켓을 못 열었다 — api 는 그대로 뜬다. `message` 는 사람에게 가는 한 줄이다. */
export class UnlockSocketRefused extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'UnlockSocketRefused'
  }
}

/**
 * **자리를 믿을 수 있는지 — api 와 명령이 함께 쓰는 한 벌**(머리말 «자리를 믿는 조건»). `lstat` 으로 보므로 링크를 따라가지 않는다.
 * 믿을 수 없으면 까닭 한 줄을, 믿을 수 있으면 `undefined` 를 준다. `lstat` 의 오류(없음 `ENOENT` 등)는 그대로 던진다 — 부르는 쪽이
 * 가른다. `socket` 을 주면 그 파일도 본다(명령이 붙기 전).
 */
export async function privatePlaceProblem(
  place: { dir: string; socket?: string },
  uid: number | undefined = process.getuid?.(),
): Promise<string | undefined> {
  const dir = await lstat(place.dir)
  if (!dir.isDirectory()) return `${place.dir} 가 디렉터리가 아닙니다(심볼릭 링크 · 파일)`
  if (uid !== undefined && dir.uid !== uid) return `${place.dir} 의 주인이 이 사용자(uid ${uid})가 아닙니다(uid ${dir.uid})`
  if ((dir.mode & 0o077) !== 0) {
    return `${place.dir} 가 다른 사용자에게 열려 있습니다(권한 ${(dir.mode & 0o777).toString(8)} — 700 이어야 한다)`
  }
  if (place.socket === undefined) return undefined
  const socket = await lstat(place.socket)
  if (!socket.isSocket()) return `${place.socket} 가 소켓이 아닙니다`
  if (uid !== undefined && socket.uid !== uid) return `${place.socket} 의 주인이 이 사용자(uid ${uid})가 아닙니다(uid ${socket.uid})`
  return undefined
}

/** 디렉터리가 이 사용자만 들어가는 것인지 — 없으면 0700 으로 만든다. 아니면 던진다. */
async function ensurePrivateDir(dir: string): Promise<void> {
  try {
    await mkdir(dir, { mode: 0o700 })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw new UnlockSocketRefused(`${dir} 를 만들지 못했습니다(${(error as Error).message})`, { cause: error })
    }
  }
  const problem = await privatePlaceProblem({ dir })
  if (problem !== undefined) throw new UnlockSocketRefused(problem)
}

/** 소켓에 붙어 본다 — 받으면 `'alive'`, 아니면 오류 코드. 산 api 는 곧바로 받으므로 짧게 기다린다. */
function probe(socketPath: string): Promise<'alive' | string> {
  return new Promise((resolve) => {
    const socket = connect(socketPath)
    const timer = setTimeout(() => {
      socket.destroy()
      resolve('ETIMEDOUT')
    }, 1_000)
    socket.once('connect', () => {
      clearTimeout(timer)
      socket.destroy()
      resolve('alive')
    })
    socket.once('error', (error: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      resolve(error.code ?? error.message)
    })
  })
}

/** 자리에 남은 것을 치운다 — 산 api 의 소켓이면 던진다(머리말 «여는 것은»). */
async function clearPlace(socketPath: string): Promise<void> {
  let stat
  try {
    stat = await lstat(socketPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  if (stat.isSocket()) {
    const answer = await probe(socketPath)
    if (answer === 'alive') {
      throw new UnlockSocketRefused(`${socketPath} 에서 다른 api 가 듣고 있습니다 — 같은 HOST · PORT 의 api 가 이 기계에 떠 있다`)
    }
    if (answer !== 'ECONNREFUSED') throw new UnlockSocketRefused(`${socketPath} 에 남은 소켓이 죽었는지 모릅니다(${answer})`)
  }
  // 디렉터리면 여기서 던진다 — `open` 이 거절로 옮긴다.
  await rm(socketPath)
}

function keyResult(clearance: KeyClearance): UnlockKeyResult {
  return {
    cleared: clearance.cleared,
    // 로그인의 `Retry-After` 와 같은 올림(`auth/login-limit.ts` 의 `begin`).
    blockedForSeconds: clearance.blockedForMs === undefined ? null : Math.max(1, Math.ceil(clearance.blockedForMs / 1000)),
  }
}

/** 본문을 읽어 푼다. 답의 상태 코드와 본문을 준다 — 거절은 `{ message }` 다. */
export function handleUnlock(
  limiter: LoginLimiter,
  raw: string,
): { status: number; body: UnlockResponse | { message: string } } {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { status: 400, body: { message: '본문이 JSON 이 아닙니다' } }
  }
  const { email, address } = (typeof parsed === 'object' && parsed !== null ? parsed : {}) as Record<string, unknown>
  if ((email !== undefined && typeof email !== 'string') || (address !== undefined && typeof address !== 'string')) {
    return { status: 400, body: { message: 'email · address 는 글자여야 합니다' } }
  }
  if (email === undefined && address === undefined) {
    return { status: 400, body: { message: '푸는 대상(이메일 · 주소)이 없습니다' } }
  }
  let normalized: string | undefined
  if (email !== undefined) {
    // 로그인 본문과 같은 규칙으로 맞춘다 — 그래야 로그인이 센 키와 같은 키를 푼다(`routes/auth.ts` 의 `LoginBody`).
    const result = NormalizedEmail.safeParse(email, { error: getKoreanErrorMap() })
    if (!result.success) return { status: 400, body: { message: `이메일 형식이 아닙니다: ${email}` } }
    normalized = result.data
  }
  let key: string | undefined
  if (address !== undefined) {
    key = addressKey(address.trim())
    if (key === undefined) return { status: 400, body: { message: `IP 주소가 아닙니다: ${address}` } }
  }
  const outcome = limiter.unlock({ email: normalized, address: key })
  return {
    status: 200,
    body: {
      ...(outcome.account === undefined || normalized === undefined
        ? {}
        : { account: { email: normalized, ...keyResult(outcome.account) } }),
      ...(outcome.address === undefined || key === undefined
        ? {}
        : { address: { key, ...keyResult(outcome.address) } }),
    },
  }
}

function reply(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', connection: 'close' })
  response.end(JSON.stringify(body))
}

/**
 * 입구를 준비한다 — **`listen` 전에 부른다.** Fastify 는 뜬 뒤에 훅을 못 달므로 닫는 훅(`preClose` — 머리말 «닫는 것은»)을 여기서
 * 단다. 여는 것(`open`)은 TCP 포트를 연 뒤다(머리말 «여는 것은»). `open` 이 못 열면 `UnlockSocketRefused` 를 던진다 — 부르는
 * 쪽(`main.ts`)이 한 줄로 말하고 api 는 그대로 뜬다.
 */
export function prepareUnlockSocket(
  app: FastifyInstance,
  options: { requestTimeoutMs?: number } = {},
): { open(socketPath: string, dir: string): Promise<void> } {
  const requestTimeout = options.requestTimeoutMs ?? UNLOCK_REQUEST_TIMEOUT_MS
  const serverOptions = {
    requestTimeout,
    headersTimeout: requestTimeout,
    // 한도는 이 주기로 검사된다(기본 30s) — 한도보다 길면 한도가 그만큼 늘어난다.
    connectionsCheckingInterval: Math.min(1_000, requestTimeout),
  }
  const server = createServer(serverOptions, (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== 'POST' || request.url !== UNLOCK_ROUTE) {
      request.resume()
      reply(response, 404, { message: `${request.method} ${request.url} 은 없습니다` })
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    request.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size <= UNLOCK_BODY_LIMIT) chunks.push(chunk)
    })
    request.on('end', () => {
      if (size > UNLOCK_BODY_LIMIT) return reply(response, 413, { message: `본문이 ${UNLOCK_BODY_LIMIT} 바이트를 넘습니다` })
      const { status, body } = handleUnlock(app.loginLimiter, Buffer.concat(chunks).toString('utf8'))
      if (status === 200) {
        // 이메일 · 주소는 안 적는다 — 로그인 라우트도 시도한 이메일을 로그에 안 남긴다. 무엇을 몇 건 걷었는지만.
        const result = body as UnlockResponse
        const summary = (key: UnlockKeyResult | undefined) =>
          key && { cleared: key.cleared, wasBlocked: key.blockedForSeconds !== null }
        app.log.info(
          { account: summary(result.account), address: summary(result.address) },
          '로그인 막힘을 푸는 명령을 받았습니다',
        )
      }
      reply(response, status, body)
    })
  })

  app.addHook('preClose', async () => {
    if (!server.listening) return
    const closed = new Promise<void>((resolve) => server.close(() => resolve()))
    // 명령은 답을 받으면 끊지만(`connection: close`) 멈춘 연결이 종료를 붙잡지 않게.
    server.closeAllConnections()
    await closed
  })

  async function openAt(socketPath: string, dir: string): Promise<void> {
    await ensurePrivateDir(dir)
    await clearPlace(socketPath)
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(socketPath, () => {
        server.off('error', reject)
        resolve()
      })
    })
    try {
      // 디렉터리가 이미 막지만 파일도 좁힌다 — 소켓은 umask 대로(대개 755) 만들어진다.
      await chmod(socketPath, 0o600)
    } catch (error) {
      // 못 좁혔으면 연 입구를 도로 닫는다 — «안 엽니다»라 말하고 열어 둔 채 두지 않게.
      await new Promise<void>((resolve) => server.close(() => resolve()))
      throw error
    }
  }

  return {
    async open(socketPath, dir) {
      try {
        await openAt(socketPath, dir)
      } catch (error) {
        // 여는 중의 오류는 전부 거절이다 — api 는 그대로 뜬다(머리말 «여는 것은»).
        if (error instanceof UnlockSocketRefused) throw error
        throw new UnlockSocketRefused(`${socketPath} 에 소켓을 열지 못했습니다(${(error as Error).message})`, { cause: error })
      }
    },
  }
}
