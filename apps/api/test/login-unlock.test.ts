/**
 * **로그인 막힘을 푸는 명령**(`src/auth/unlock-login.ts`)과 **그 입구**(`src/auth/unlock-socket.ts`).
 *
 * 여기서 재는 것:
 *
 * - 명령이 진짜 소켓으로 api 의 기록을 풀면 **그 계정의 로그인이 곧바로 다시 선다** — 로그인 라우트와 같은 정규화 · 주소 키로.
 * - 푸는 것은 준 키 하나뿐이다 — 주소의 기록 · 다른 키는 그대로다.
 * - 입구는 **TCP 에 없다** · 남에게 열린 디렉터리에서는 안 연다 · 남은 파일은 지우고 열되 **산 api 의 소켓은 안 지운다** · 여는 중의
 *   파일 시스템 오류는 전부 거절이다 · **닫기가 도는 요청을 기다리기 전에** 닫힌다 · 요청은 한도 안에 다 와야 한다.
 * - **명령도 자리를 본다** — 믿을 수 없는 자리(남에게 열림 · 링크 · 소켓 아님 · 주인이 남)에는 안 붙고, 답의 꼴을 확인하고, 답의 글자는
 *   제어 문자를 걷고 찍는다.
 * - 자리의 이름에 `HOST` 가 든다 — 같은 `PORT` · 다른 `HOST` 의 api 둘이 서로의 자리를 안 건드린다.
 * - 바꾸지 않는 갈래(인자 · 입구 없음 · api 꺼짐 · 권한 없음 · 거절)는 그렇다고 말하고, 보낸 뒤 답을 잃으면 «모릅니다»다.
 *
 * **«주인이 남»은 root 가 아니면 파일로 못 세운다** — 여기서는 명령이 견줄 uid 를 바꿔 잰다. 남의 uid 가 만든 실물 판(공유 `/tmp` 를
 * 먼저 차지한 다른 사용자)은 여기서 못 잰다 — 재는 법은 docs/guides/development.md 「에디터가 뜨는데 로그인이 안 된다」의 ⓓ 끝 «재는 법».
 *
 * **진짜 터미널(pty)에서 사람이 친 판은 여기서 못 잰다** — docs/guides/development.md 「에디터가 뜨는데 로그인이 안 된다」의 ⓓ 가 그 재는 법을 든다.
 */
import { createServer as createHttpServer } from 'node:http'
import { connect, createServer as createNetServer } from 'node:net'
import { chmod, lstat, mkdir, mkdtemp, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLoginLimiter, LOGIN_LIMIT, type LoginLimiter } from '../src/auth/login-limit'
import { printable, runUnlockLogin } from '../src/auth/unlock-login'
import { prepareUnlockSocket, unlockSocketBase, unlockSocketPath, UnlockSocketRefused } from '../src/auth/unlock-socket'
import { signup, withApi, type TestContext } from './helpers'

const { perAccount, perAddress, windowMs } = LOGIN_LIMIT
const WRONG = '틀린비밀번호1234'

let dir: string
let socketPath: string

beforeEach(async () => {
  // 소켓 경로 한도(macOS 103 바이트) 안에 들게 tmpdir 에 둔다 — 스크래치 · 저장소 경로는 넘는다.
  const base = await mkdtemp(join(tmpdir(), 'wb-unlock-'))
  dir = join(base, 'private')
  socketPath = join(dir, 'api.sock')
})

afterEach(async () => {
  await rm(join(dir, '..'), { recursive: true, force: true })
})

function captureIo() {
  const out: string[] = []
  const err: string[] = []
  return { out, err, io: { log: (line: string) => void out.push(line), error: (line: string) => void err.push(line) } }
}

const FIRST_LINE = () => `로그인 막힘을 풀 api: HOST 127.0.0.1 · PORT 3999 (${socketPath})`

function unlock(args: string[], options: { timeoutMs?: number; uid?: number; host?: string; path?: string; dir?: string } = {}) {
  const { out, err, io } = captureIo()
  const target = {
    host: options.host ?? '127.0.0.1',
    port: 3999,
    dir: options.dir ?? dir,
    socketPath: options.path ?? socketPath,
    timeoutMs: options.timeoutMs ?? 5_000,
    ...(options.uid === undefined ? {} : { uid: options.uid }),
  }
  return runUnlockLogin(args, target, io).then((code) => ({ code, out, err }))
}

const MISSING =
  'api 의 입구가 없습니다 — 이 기계에서 HOST 127.0.0.1 · PORT 3999 의 api 가 안 떠 있거나, 떠 있으면 그 api 의 기동 로그에 ' +
  '«로그인 막힘을 푸는 입구를 안 엽니다» 줄이 까닭을 말한다. 입구가 열렸는데 경로가 위와 다르면 api 를 띄운 셸과 ' +
  'XDG_RUNTIME_DIR · TMPDIR 가 다른 것이다. 아무것도 바꾸지 않았습니다.'

/** 입구 흉내 — 받은 본문을 적고 `answer` 로 답한다. 남이 먼저 차지한 자리에서 듣는 소켓이다. */
async function fakeApi(path: string, answer: { status: number; body: string }) {
  const received: string[] = []
  const server = createHttpServer((request, response) => {
    let body = ''
    request.on('data', (chunk: Buffer) => (body += chunk.toString('utf8')))
    request.on('end', () => {
      received.push(body)
      response.writeHead(answer.status, { 'content-type': 'application/json', connection: 'close' })
      response.end(answer.body)
    })
  })
  await new Promise<void>((resolve) => server.listen(path, resolve))
  return { received, close: () => new Promise<void>((resolve) => server.close(() => resolve())) }
}

const HOSTILE = JSON.stringify({
  account: { email: 'victim@example.com\u001b]0;PWNED\u0007\u001b[31m', cleared: 10, blockedForSeconds: 800 },
})

function login(ctx: TestContext, email: string, password: string, remoteAddress = '10.0.0.1') {
  return ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password }, remoteAddress })
}

/** DB 없이 입구만 세운 앱 — 로그인 제한기만 단다. */
async function bareApp(limiter: LoginLimiter, options: { path?: string; requestTimeoutMs?: number } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  app.decorate('loginLimiter', limiter)
  await prepareUnlockSocket(app, { requestTimeoutMs: options.requestTimeoutMs }).open(options.path ?? socketPath, dir)
  await app.ready()
  return app
}

/** 계정 하나를 한도까지 채운 제한기. */
function blockedLimiter(email: string): LoginLimiter {
  const limiter = createLoginLimiter()
  for (let i = 0; i < perAccount; i++) limiter.begin(email, `10.0.0.${i}`)
  return limiter
}

describe('로그인 막힘을 푸는 명령', () => {
  it('막힌 계정을 명령으로 풀면 옳은 비밀번호가 곧바로 200 이다 — 대문자로 친 이메일도 로그인과 같은 키를 푼다', async () => {
    await withApi(async (ctx) => {
      await prepareUnlockSocket(ctx.app).open(socketPath, dir)
      const { user, password } = await signup(ctx)
      for (let i = 0; i < perAccount; i++) expect((await login(ctx, user.email, WRONG)).statusCode).toBe(401)
      expect((await login(ctx, user.email, password)).statusCode).toBe(429)

      const ran = await unlock([user.email.toUpperCase()])

      expect(ran).toEqual({
        code: 0,
        out: [
          FIRST_LINE(),
          `계정 ${user.email} — 창 안의 시도 ${perAccount}건을 지웠습니다 — 막혀 있었습니다(그대로 두면 ${windowMs / 60_000}분 뒤 풀렸습니다)`,
          '풀었는데도 «로그인 시도가 너무 많습니다»가 뜨면 그 사람의 주소가 막힌 것이다 — --address <주소> 로 푼다',
        ],
        err: [],
      })
      expect((await login(ctx, user.email, password)).statusCode).toBe(200)
    })
    // 앱이 닫히면 입구도 닫히고 파일이 없다.
    expect(existsSync(socketPath)).toBe(false)
  })

  it('계정을 풀어도 주소의 기록은 그대로다 — 주소는 --address 로 따로 풀고, IPv6 는 /64 키로 푼다', async () => {
    await withApi(async (ctx) => {
      await prepareUnlockSocket(ctx.app).open(socketPath, dir)
      const { user, password } = await signup(ctx)
      const office = '2001:db8:1:2::5'
      // 계정마다 한 번씩 틀린다 — 주소만 한도에 닿는다. 주인의 계정도 한 번 섞는다.
      await login(ctx, user.email, WRONG, office)
      for (let i = 1; i < perAddress; i++) {
        expect((await login(ctx, `spray${i}@example.com`, WRONG, office)).statusCode).toBe(401)
      }
      expect((await login(ctx, user.email, password, office)).statusCode).toBe(429)

      const byAccount = await unlock([user.email])
      expect(byAccount.out[1]).toBe(`계정 ${user.email} — 창 안의 시도 1건을 지웠습니다 — 막혀 있지 않았습니다`)
      // 계정은 풀렸지만 주소가 막혀 있다 — 같은 /64 의 다른 주소도.
      expect((await login(ctx, user.email, password, '2001:db8:1:2::77')).statusCode).toBe(429)
      // 다른 주소는 계정 키만 보므로 들어온다.
      expect((await login(ctx, user.email, WRONG, '10.9.9.9')).statusCode).toBe(401)

      const byAddress = await unlock(['--address', '2001:db8:1:2::99'])
      expect(byAddress).toEqual({
        code: 0,
        out: [
          FIRST_LINE(),
          `주소 2001:db8:1:2::/64 — 창 안의 시도 ${perAddress}건을 지웠습니다 — 막혀 있었습니다(그대로 두면 ${windowMs / 60_000}분 뒤 풀렸습니다)`,
        ],
        err: [],
      })
      expect((await login(ctx, user.email, password, office)).statusCode).toBe(200)
    })
  })

  it('푸는 것은 준 키뿐이다 — 막힌 다른 계정은 그대로이고, 기록이 없는 이메일은 0 건이라 말한다', async () => {
    let t = 0
    const limiter = createLoginLimiter({ ...LOGIN_LIMIT }, () => t)
    const app = await bareApp(limiter)
    try {
      for (let i = 0; i < perAccount; i++) {
        limiter.begin('a@example.com', `10.0.0.${i}`)
        limiter.begin('b@example.com', `10.0.1.${i}`)
      }
      t = 60_000
      const ran = await unlock(['a@example.com'])
      expect(ran.code).toBe(0)
      expect(ran.out[1]).toBe(
        `계정 a@example.com — 창 안의 시도 ${perAccount}건을 지웠습니다 — 막혀 있었습니다(그대로 두면 ${windowMs / 60_000 - 1}분 뒤 풀렸습니다)`,
      )
      expect(limiter.begin('a@example.com', '10.0.9.9').kind).toBe('admitted')
      expect(limiter.begin('b@example.com', '10.0.9.9').kind).toBe('limited')

      const none = await unlock(['nobody@example.com'])
      expect(none.code).toBe(0)
      expect(none.out[1]).toBe('계정 nobody@example.com — 창 안의 시도가 없습니다 — 막혀 있지 않았습니다')
    } finally {
      await app.close()
    }
  })

  it('api 가 거절한 값은 그 문장과 «아무것도 바꾸지 않았습니다»로 끝난다 — 이메일 · 주소 형식', async () => {
    const app = await bareApp(createLoginLimiter())
    try {
      expect(await unlock(['not-an-email'])).toMatchObject({
        code: 1,
        err: ['api 가 거절했습니다(400): 이메일 형식이 아닙니다: not-an-email — 아무것도 바꾸지 않았습니다.'],
      })
      expect(await unlock(['--address', 'unknown'])).toMatchObject({
        code: 1,
        err: ['api 가 거절했습니다(400): IP 주소가 아닙니다: unknown — 아무것도 바꾸지 않았습니다.'],
      })
    } finally {
      await app.close()
    }
  })

  it('인자가 어긋나면 보내지 않는다 — 사용법과 «아무것도 바꾸지 않았습니다»', async () => {
    const cases: [string[], string][] = [
      [[], '푸는 대상(이메일 · 주소)이 없습니다'],
      [['--'], '푸는 대상(이메일 · 주소)이 없습니다'],
      [['a@example.com', 'b@example.com'], '이메일은 한 번에 하나만 받습니다'],
      [['--address'], '--address 뒤에 주소가 없습니다'],
      [['--address', '1.2.3.4', '--address', '5.6.7.8'], '주소는 한 번에 하나만 받습니다'],
      [['--revoke', 'a@example.com'], '모르는 옵션입니다: --revoke'],
    ]
    for (const [args, reason] of cases) {
      const ran = await unlock(args)
      expect(ran, args.join(' ')).toEqual({
        code: 1,
        out: [],
        err: [
          '사용법: pnpm --filter @wirebound/api unlock-login [<이메일>] [--address <주소>]  — 둘 중 하나 이상',
          `${reason} — 아무것도 바꾸지 않았습니다.`,
        ],
      })
    }
  })
})

describe('입구에 닿지 못하는 갈래', () => {
  it('소켓이 없으면 · api 가 꺼져 파일만 남았으면 · 권한이 없으면 그렇다고 말하고 아무것도 안 바꿨다고 한다', async () => {
    await mkdir(dir, { mode: 0o700 })
    const missing = await unlock(['a@example.com'])
    expect(missing.code).toBe(1)
    expect(missing.err).toEqual([MISSING])
    // 디렉터리도 없으면 같은 문장이다.
    await rm(dir, { recursive: true })
    expect((await unlock(['a@example.com'])).err).toEqual([MISSING])
    await mkdir(dir, { mode: 0o700 })

    // 연 소켓을 다른 이름으로 옮긴 뒤 닫으면 옮긴 파일은 듣는 자 없이 남는다 — 죽은 api 가 남긴 소켓이다.
    const server = createNetServer()
    const aside = join(dir, 'aside.sock')
    await new Promise<void>((resolve) => server.listen(aside, resolve))
    await rename(aside, socketPath)
    await new Promise<void>((resolve) => server.close(() => resolve()))
    expect((await lstat(socketPath)).isSocket()).toBe(true)
    const stale = await unlock(['a@example.com'])
    expect(stale.err).toEqual(['api 가 떠 있지 않습니다(소켓 파일만 남았다) — 다시 띄우면 기록은 비어 있다. 아무것도 바꾸지 않았습니다.'])

    await chmod(socketPath, 0o000)
    const denied = await unlock(['a@example.com'])
    expect(denied.err).toEqual(['입구에 들어갈 권한이 없습니다 — api 를 띄운 사용자로 친다. 아무것도 바꾸지 않았습니다.'])
  })

  it('보낸 뒤 답을 잃으면 «풀렸는지 모릅니다»다 — 끊김 · 답 없음', async () => {
    await mkdir(dir, { mode: 0o700 })
    let received = 0
    // 요청을 받고 답 없이 끊는 입구.
    const server = createNetServer((socket) => {
      socket.once('data', () => {
        received++
        socket.destroy()
      })
    })
    await new Promise<void>((resolve) => server.listen(socketPath, resolve))
    try {
      const cut = await unlock(['a@example.com'])
      expect(cut.code).toBe(1)
      expect(cut.err).toEqual(['api 가 답하지 않았습니다(socket hang up) — 풀렸는지 모릅니다. 다시 친다(여러 번 쳐도 결과가 같다).'])
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }

    // 받고 답하지 않는 입구 — 시간 한도에서 끝난다.
    const silent = createNetServer((socket) => socket.once('data', () => void received++))
    await new Promise<void>((resolve) => silent.listen(socketPath, resolve))
    try {
      const hung = await unlock(['a@example.com'], { timeoutMs: 200 })
      expect(hung.err).toEqual([
        'api 가 답하지 않았습니다(200ms 안에 답이 없습니다) — 풀렸는지 모릅니다. 다시 친다(여러 번 쳐도 결과가 같다).',
      ])
    } finally {
      // 멈춘 연결은 명령이 끊었다 — 닫기가 기다릴 연결이 없다.
      await new Promise<void>((resolve) => silent.close(() => resolve()))
    }
    expect(received).toBe(2)
  })
})

describe('입구', () => {
  it('api 의 TCP 에는 없다 — 로그인 라우트와 같은 앱이어도 /login-unlock 은 404 다', async () => {
    await withApi(async (ctx) => {
      await prepareUnlockSocket(ctx.app).open(socketPath, dir)
      for (const url of ['/login-unlock', '/api/login-unlock', '/api/auth/login-unlock']) {
        const res = await ctx.app.inject({ method: 'POST', url, payload: { email: 'a@example.com' } })
        expect(res.statusCode, url).toBe(404)
      }
    })
  })

  it('만든 디렉터리는 700 · 소켓은 600 이다 · 남에게 열린 디렉터리 · 심볼릭 링크에서는 안 연다', async () => {
    const app = await bareApp(createLoginLimiter())
    try {
      expect((await lstat(dir)).mode & 0o777).toBe(0o700)
      expect((await lstat(socketPath)).mode & 0o777).toBe(0o600)
    } finally {
      await app.close()
    }

    await chmod(dir, 0o755)
    const open = Fastify({ logger: false })
    open.decorate('loginLimiter', createLoginLimiter())
    await expect(prepareUnlockSocket(open).open(socketPath, dir)).rejects.toThrow(
      new UnlockSocketRefused(`${dir} 가 다른 사용자에게 열려 있습니다(권한 755 — 700 이어야 한다)`),
    )
    expect(existsSync(socketPath)).toBe(false)

    const target = join(dir, '..', 'real')
    await mkdir(target, { mode: 0o700 })
    const linked = join(dir, '..', 'linked')
    await symlink(target, linked)
    await expect(prepareUnlockSocket(open).open(join(linked, 'api.sock'), linked)).rejects.toThrow(
      new UnlockSocketRefused(`${linked} 가 디렉터리가 아닙니다(심볼릭 링크 · 파일)`),
    )
    expect(existsSync(join(target, 'api.sock'))).toBe(false)
    await open.close()
  })

  it('자리에 남은 파일은 지우고 연다 — 죽은 api 의 소켓 · 아무 파일', async () => {
    await mkdir(dir, { mode: 0o700 })
    await writeFile(socketPath, 'stale')
    const app = await bareApp(createLoginLimiter())
    try {
      expect((await lstat(socketPath)).isSocket()).toBe(true)
      expect((await unlock(['a@example.com'])).code).toBe(0)
    } finally {
      await app.close()
    }

    // 죽은 api 의 소켓 — 연 소켓을 다른 이름으로 옮긴 뒤 닫아 듣는 자 없이 남긴다.
    const dead = createNetServer()
    const aside = join(dir, 'aside.sock')
    await new Promise<void>((resolve) => dead.listen(aside, resolve))
    await rename(aside, socketPath)
    await new Promise<void>((resolve) => dead.close(() => resolve()))
    const staleInode = (await lstat(socketPath)).ino
    const again = await bareApp(createLoginLimiter())
    try {
      expect((await lstat(socketPath)).ino).not.toBe(staleInode)
      expect((await unlock(['a@example.com'])).code).toBe(0)
    } finally {
      await again.close()
    }
  })

  it('산 api 의 소켓은 안 지운다 — 뒤에 연 쪽이 비켜 가고, 비켜 간 쪽이 닫혀도 앞의 자리는 그대로다', async () => {
    const first = await bareApp(blockedLimiter('a@example.com'))
    const inode = (await lstat(socketPath)).ino
    const second = Fastify({ logger: false })
    second.decorate('loginLimiter', createLoginLimiter())
    try {
      await expect(prepareUnlockSocket(second).open(socketPath, dir)).rejects.toThrow(
        new UnlockSocketRefused(`${socketPath} 에서 다른 api 가 듣고 있습니다 — 같은 HOST · PORT 의 api 가 이 기계에 떠 있다`),
      )
      expect((await lstat(socketPath)).ino).toBe(inode)
      await second.close()
      expect((await lstat(socketPath)).ino).toBe(inode)
      // 명령은 앞의 api 에 닿는다 — 막힌 기록이 거기 있다.
      const ran = await unlock(['a@example.com'])
      expect(ran.out[1]).toBe(
        `계정 a@example.com — 창 안의 시도 ${perAccount}건을 지웠습니다 — 막혀 있었습니다(그대로 두면 ${windowMs / 60_000}분 뒤 풀렸습니다)`,
      )
    } finally {
      await first.close()
    }
    expect(existsSync(socketPath)).toBe(false)
  })

  it('여는 중의 파일 시스템 오류도 거절이다 — 자리에 디렉터리가 있으면 api 는 뜨고 까닭 한 줄을 받는다', async () => {
    await mkdir(socketPath, { recursive: true, mode: 0o700 })
    const app = Fastify({ logger: false })
    app.decorate('loginLimiter', createLoginLimiter())
    try {
      const refused = await prepareUnlockSocket(app)
        .open(socketPath, dir)
        .then(
          () => undefined,
          (error: unknown) => error,
        )
      expect(refused).toBeInstanceOf(UnlockSocketRefused)
      expect((refused as Error).message.startsWith(`${socketPath} 에 소켓을 열지 못했습니다(`)).toBe(true)
      expect((refused as Error).message).toContain('EISDIR')
      expect((await lstat(socketPath)).isDirectory()).toBe(true)
    } finally {
      await app.close()
    }
  })

  /**
   * **여는 중에 닫기가 오면 입구를 안 연다.** `main.ts` 는 TCP 포트를 연 뒤에 입구를 연다 — 그 사이에 신호가 오면 닫기(`preClose`)는
   * 아직 안 연 입구를 지나치고, 여는 일은 그 뒤에도 이어 소켓을 연다. 닫힌 api 가 연 채 남기는 소켓이다(프로세스가 끝나면 파일만
   * 남고, 그 사이 같은 자리에 선 새 api 의 소켓을 지울 수 있다). 여기서는 여는 일이 첫 await 에 선 사이에 앱을 닫는다.
   */
  it('여는 중에 닫기가 오면 입구를 안 연다 — 닫힌 뒤 늦게 끝난 여는 일이 소켓을 남기지 않는다', async () => {
    const app = Fastify({ logger: false })
    app.decorate('loginLimiter', createLoginLimiter())
    const opening = prepareUnlockSocket(app)
      .open(socketPath, dir)
      .then(
        () => undefined,
        (error: unknown) => error,
      )
    await app.close()
    const refused = await opening
    const listening = await new Promise<boolean>((resolve) => {
      const socket = connect(socketPath)
      socket.once('connect', () => {
        socket.destroy()
        resolve(true)
      })
      socket.once('error', () => resolve(false))
    })
    expect({ listening, file: existsSync(socketPath) }).toEqual({ listening: false, file: false })
    expect(refused).toBeInstanceOf(UnlockSocketRefused)
    expect((refused as Error).message).toBe(`${socketPath} 에 입구를 안 엽니다 — api 가 닫히는 중입니다`)
  })

  it('닫기는 도는 요청을 기다리기 전에 입구부터 닫는다 — 그 사이 같은 자리에 선 새 api 의 소켓을 안 지운다', async () => {
    await withApi(async (ctx) => {
      let release = (): void => {}
      const held = new Promise<void>((resolve) => (release = resolve))
      let entered = (): void => {}
      const inside = new Promise<void>((resolve) => (entered = resolve))
      ctx.app.get('/hold', async () => {
        entered()
        await held
        return { ok: true }
      })
      await prepareUnlockSocket(ctx.app).open(socketPath, dir)
      await ctx.app.listen({ host: '127.0.0.1', port: 0 })
      const address = ctx.app.server.address()
      if (address === null || typeof address === 'string') throw new Error('포트가 없다')
      const request = fetch(`http://127.0.0.1:${address.port}/hold`, { headers: { connection: 'close' } })
      await inside

      const closing = ctx.app.close()
      let goneWhileHeld = false
      try {
        // 도는 요청이 있는 동안 — 입구는 이미 닫혀 파일이 없어야 한다.
        const deadline = Date.now() + 2_000
        while (existsSync(socketPath) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 10))
        goneWhileHeld = !existsSync(socketPath)
        // 새 api 가 그 자리에 소켓을 만든 판 — 닫기가 끝난 뒤에도 남아야 한다.
        if (goneWhileHeld) await writeFile(socketPath, 'new api')
      } finally {
        release()
      }
      expect(goneWhileHeld).toBe(true)
      expect((await request).status).toBe(200)
      await closing
      expect(existsSync(socketPath)).toBe(true)
    })
  })
})

describe('명령은 믿을 수 없는 자리에 안 붙는다 — api 가 여는 조건과 같은 한 벌', () => {
  const refusedLine = (problem: string) => `입구의 자리를 믿을 수 없어 보내지 않았습니다 — ${problem}. 아무것도 바꾸지 않았습니다.`

  it('남에게 열린 디렉터리 — 거기서 듣는 소켓이 있어도 본문을 안 보낸다', async () => {
    await mkdir(dir, { mode: 0o700 })
    await chmod(dir, 0o777)
    const fake = await fakeApi(socketPath, { status: 200, body: HOSTILE })
    try {
      expect(await unlock(['victim@example.com'])).toEqual({
        code: 1,
        out: [FIRST_LINE()],
        err: [refusedLine(`${dir} 가 다른 사용자에게 열려 있습니다(권한 777 — 700 이어야 한다)`)],
      })
      expect(fake.received).toEqual([])
    } finally {
      await fake.close()
    }
  })

  it('심볼릭 링크인 디렉터리 — 링크 끝이 제 것이어도 따라가지 않는다', async () => {
    const real = join(dir, '..', 'real')
    await mkdir(real, { mode: 0o700 })
    await symlink(real, dir)
    const fake = await fakeApi(join(real, 'api.sock'), { status: 200, body: HOSTILE })
    try {
      const ran = await unlock(['victim@example.com'])
      expect(ran.code).toBe(1)
      expect(ran.err).toEqual([refusedLine(`${dir} 가 디렉터리가 아닙니다(심볼릭 링크 · 파일)`)])
      expect(fake.received).toEqual([])
    } finally {
      await fake.close()
    }
  })

  it('소켓 자리가 소켓이 아니다 — 다른 곳의 소켓을 가리키는 링크 · 일반 파일', async () => {
    await mkdir(dir, { mode: 0o700 })
    const elsewhere = join(dir, '..', 'elsewhere.sock')
    const fake = await fakeApi(elsewhere, { status: 200, body: HOSTILE })
    try {
      await symlink(elsewhere, socketPath)
      const linked = await unlock(['victim@example.com'])
      expect(linked.code).toBe(1)
      expect(linked.err).toEqual([refusedLine(`${socketPath} 가 소켓이 아닙니다`)])
      expect(fake.received).toEqual([])
    } finally {
      await fake.close()
    }
    await rm(socketPath)
    await writeFile(socketPath, 'not a socket')
    expect((await unlock(['victim@example.com'])).err).toEqual([refusedLine(`${socketPath} 가 소켓이 아닙니다`)])
  })

  it('주인이 남이다 — 명령이 견줄 uid 가 자리의 주인과 다르면 안 보낸다', async () => {
    await mkdir(dir, { mode: 0o700 })
    const fake = await fakeApi(socketPath, { status: 200, body: HOSTILE })
    const mine = process.getuid?.() ?? 0
    try {
      const ran = await unlock(['victim@example.com'], { uid: mine + 1 })
      expect(ran.code).toBe(1)
      expect(ran.err).toEqual([refusedLine(`${dir} 의 주인이 이 사용자(uid ${mine + 1})가 아닙니다(uid ${mine})`)])
      expect(fake.received).toEqual([])
      // 같은 자리 · 제 uid 면 보낸다 — 위의 거절이 uid 로 갈렸다는 대조.
      expect((await unlock(['victim@example.com'])).code).toBe(0)
      expect(fake.received).toHaveLength(1)
    } finally {
      await fake.close()
    }
  })
})

describe('명령은 답을 믿지 않고 찍는다', () => {
  beforeEach(async () => {
    await mkdir(dir, { mode: 0o700 })
  })

  it('답의 글자에 든 제어 문자는 걷고 찍는다 — 터미널에 ESC 가 안 나간다', async () => {
    const fake = await fakeApi(socketPath, { status: 200, body: HOSTILE })
    try {
      const ran = await unlock(['victim@example.com'])
      expect(ran.out[1]).toBe(
        '계정 victim@example.com\\u001b]0;PWNED\\u0007\\u001b[31m — 창 안의 시도 10건을 지웠습니다 — 막혀 있었습니다(그대로 두면 14분 뒤 풀렸습니다)',
      )
      expect([...ran.out, ...ran.err].join('\n')).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/)
    } finally {
      await fake.close()
    }
    const rejected = await fakeApi(socketPath, { status: 400, body: JSON.stringify({ message: 'no\u001b[2Jpe\u202e' }) })
    try {
      expect((await unlock(['victim@example.com'])).err).toEqual([
        'api 가 거절했습니다(400): no\\u001b[2Jpe\\u202e — 아무것도 바꾸지 않았습니다.',
      ])
    } finally {
      await rejected.close()
    }
  })

  it('보낸 키의 결과가 제 꼴로 없으면 «모릅니다» · 종료 1 이다', async () => {
    const unknown = 'api 의 답에 보낸 키의 결과가 없습니다 — 풀렸는지 모릅니다. api 를 띄운 체크아웃 · 사용자로 친 것인지 본다.'
    const answers: [string[], string][] = [
      [['a@example.com'], '{}'],
      [['a@example.com'], 'not json'],
      [['a@example.com'], JSON.stringify({ account: { email: 'a@example.com', cleared: '10', blockedForSeconds: null } })],
      [['a@example.com'], JSON.stringify({ account: { cleared: 1, blockedForSeconds: null } })],
      [['a@example.com'], JSON.stringify({ account: { email: 'a@example.com', cleared: -1, blockedForSeconds: null } })],
      [['a@example.com'], JSON.stringify({ account: { email: 'a@example.com', cleared: 1, blockedForSeconds: 'soon' } })],
      [
        ['a@example.com', '--address', '10.0.0.1'],
        JSON.stringify({ account: { email: 'a@example.com', cleared: 1, blockedForSeconds: null } }),
      ],
      [['--address', '10.0.0.1'], JSON.stringify({ account: { email: 'a@example.com', cleared: 1, blockedForSeconds: null } })],
    ]
    for (const [args, body] of answers) {
      const fake = await fakeApi(socketPath, { status: 200, body })
      try {
        expect(await unlock(args), body).toEqual({ code: 1, out: [FIRST_LINE()], err: [unknown] })
      } finally {
        await fake.close()
      }
    }
  })

  it('printable 은 글자 방향을 뒤집는 문자와 C1 도 걷는다 · 한글과 줄 밖 글자는 그대로다', () => {
    expect(printable('a\u009bb\u2066c\u200fd 한글 ✓')).toBe('a\\u009bb\\u2066c\\u200fd 한글 ✓')
  })
})

describe('자리의 이름 — HOST · PORT 와 바탕', () => {
  it('같은 PORT · 다른 HOST 의 api 둘은 자리가 갈린다 — 명령은 제 HOST 의 api 에 닿고, 하나가 닫혀도 다른 쪽 자리는 그대로다', async () => {
    const v4 = unlockSocketPath('127.0.0.1', 3999, dir)
    const v6 = unlockSocketPath('::1', 3999, dir)
    const any = unlockSocketPath('0.0.0.0', 3999, dir)
    expect(new Set([v4, v6, any]).size).toBe(3)
    expect(v4).toBe(join(dir, 'api-127.0.0.1-3999.sock'))
    expect(unlockSocketPath('a/b', 3999, dir)).toBe(join(dir, 'api-a_b-3999.sock'))

    const a = await bareApp(blockedLimiter('a@example.com'), { path: v4 })
    const b = await bareApp(createLoginLimiter(), { path: v6 })
    try {
      const onA = await unlock(['a@example.com'], { path: v4 })
      expect(onA.out[1]).toMatch(new RegExp(`^계정 a@example.com — 창 안의 시도 ${perAccount}건을 지웠습니다`))
      // (a) 뒤에 뜬 쪽(::1)이 먼저 닫혀도 앞의 자리는 남는다.
      await b.close()
      expect(existsSync(v4)).toBe(true)
      expect(existsSync(v6)).toBe(false)
      expect((await unlock(['a@example.com'], { path: v4 })).code).toBe(0)
    } finally {
      await a.close()
      await b.close()
    }

    // (b) 앞의 쪽(127.0.0.1)이 먼저 닫혀도 뒤의 자리(0.0.0.0)는 남는다.
    const first = await bareApp(createLoginLimiter(), { path: v4 })
    const later = await bareApp(blockedLimiter('b@example.com'), { path: any })
    try {
      await first.close()
      expect(existsSync(any)).toBe(true)
      const onLater = await unlock(['b@example.com'], { path: any, host: '0.0.0.0' })
      expect(onLater.out[0]).toBe(`로그인 막힘을 풀 api: HOST 0.0.0.0 · PORT 3999 (${any})`)
      expect(onLater.out[1]).toMatch(new RegExp(`^계정 b@example.com — 창 안의 시도 ${perAccount}건을 지웠습니다`))
    } finally {
      await first.close()
      await later.close()
    }
  })

  it('바탕은 XDG_RUNTIME_DIR 가 절대 경로면 그것, 아니면 os.tmpdir() 다', () => {
    expect(unlockSocketBase({ XDG_RUNTIME_DIR: '/run/user/1000' })).toBe('/run/user/1000')
    expect(unlockSocketBase({ XDG_RUNTIME_DIR: 'relative/dir' })).toBe(tmpdir())
    expect(unlockSocketBase({ XDG_RUNTIME_DIR: '' })).toBe(tmpdir())
    expect(unlockSocketBase({})).toBe(tmpdir())
  })
})

describe('입구의 요청 시간 한도', () => {
  // 끊는 순간 서버가 안 읽은 바이트를 쥐고 있으면 408 답이 클라이언트에 안 닿기도 한다(잰 값: 한도가 선 13 판에 3 판이 빈 답) — 끊긴 것만 잰다.
  it('본문을 끝없이 조금씩 보내는 연결은 한도에서 끊긴다', async () => {
    const app = await bareApp(createLoginLimiter(), { requestTimeoutMs: 300 })
    const socket = connect(socketPath)
    socket.on('error', () => {})
    const closed = new Promise<void>((resolve) => socket.once('close', () => resolve()))
    try {
      await new Promise<void>((resolve) => socket.once('connect', () => resolve()))
      socket.write('POST /login-unlock HTTP/1.1\r\nHost: x\r\nTransfer-Encoding: chunked\r\n\r\n')
      const drip = setInterval(() => socket.writable && socket.write('1\r\na\r\n'), 100)
      const outcome = await Promise.race([
        closed.then(() => 'closed'),
        new Promise<string>((resolve) => setTimeout(() => resolve('still open'), 2_500)),
      ])
      clearInterval(drip)
      expect(outcome).toBe('closed')
    } finally {
      socket.destroy()
      await app.close()
    }
  })
})
