/**
 * **로그인 막힘을 푸는 명령**(`src/auth/unlock-login.ts`)과 **그 입구**(`src/auth/unlock-socket.ts`).
 *
 * 여기서 재는 것:
 *
 * - 명령이 진짜 소켓으로 api 의 기록을 풀면 **그 계정의 로그인이 곧바로 다시 선다** — 로그인 라우트와 같은 정규화 · 주소 키로.
 * - 푸는 것은 준 키 하나뿐이다 — 주소의 기록 · 다른 키는 그대로다.
 * - 입구는 **TCP 에 없다** · 남에게 열린 디렉터리에서는 안 연다 · 남은 파일은 지우고 연다 · **닫기가 도는 요청을 기다리기 전에** 닫힌다.
 * - 바꾸지 않는 갈래(인자 · 입구 없음 · api 꺼짐 · 권한 없음 · 거절)는 그렇다고 말하고, 보낸 뒤 답을 잃으면 «모릅니다»다.
 *
 * **진짜 터미널(pty)에서 사람이 친 판은 여기서 못 잰다** — README 「에디터가 뜨는데 로그인이 안 된다」의 ⓓ 가 그 재는 법을 든다.
 */
import { createServer as createNetServer } from 'node:net'
import { chmod, lstat, mkdir, mkdtemp, rename, rm, symlink, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createLoginLimiter, LOGIN_LIMIT, type LoginLimiter } from '../src/auth/login-limit'
import { runUnlockLogin } from '../src/auth/unlock-login'
import { prepareUnlockSocket, UnlockSocketRefused } from '../src/auth/unlock-socket'
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

function unlock(args: string[], timeoutMs = 5_000) {
  const { out, err, io } = captureIo()
  return runUnlockLogin(args, { port: 3999, socketPath, timeoutMs }, io).then((code) => ({ code, out, err }))
}

function login(ctx: TestContext, email: string, password: string, remoteAddress = '10.0.0.1') {
  return ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password }, remoteAddress })
}

/** DB 없이 입구만 세운 앱 — 로그인 제한기만 단다. */
async function bareApp(limiter: LoginLimiter): Promise<FastifyInstance> {
  const app = Fastify({ logger: false })
  app.decorate('loginLimiter', limiter)
  await prepareUnlockSocket(app).open(socketPath, dir)
  await app.ready()
  return app
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
          `로그인 막힘을 풀 api: PORT 3999 (${socketPath})`,
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
          `로그인 막힘을 풀 api: PORT 3999 (${socketPath})`,
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
    expect(missing.err).toEqual([
      'api 의 입구가 없습니다 — 이 기계에서 PORT 3999 의 api 가 안 떠 있거나, 떠 있으면 그 api 의 기동 로그에 ' +
        '«로그인 막힘을 푸는 입구를 안 엽니다» 줄이 까닭을 말한다. 아무것도 바꾸지 않았습니다.',
    ])

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
      const hung = await unlock(['a@example.com'], 200)
      expect(hung.err).toEqual(['api 가 답하지 않았습니다(200ms 안에 답이 없습니다) — 풀렸는지 모릅니다. 다시 친다(여러 번 쳐도 결과가 같다).'])
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
    const limiter = createLoginLimiter()
    const app = await bareApp(limiter)
    try {
      expect((await lstat(socketPath)).isSocket()).toBe(true)
      expect((await unlock(['a@example.com'])).code).toBe(0)
    } finally {
      await app.close()
    }
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
