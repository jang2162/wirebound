/**
 * **비밀번호 재설정 명령**(`src/db/reset-password.ts`) — 바꾸는 갈래 하나와 바꾸지 않는 갈래 전부.
 *
 * 여기서 재는 것:
 *
 * - 바꾸면 **서버의 로그인이 새 비밀번호를 받고**, 그 사람의 세션만 지워지며, API 토큰은 그대로다.
 * - 바꾸지 않는 갈래(대상 0 · 빈 값 · Ctrl-D · Ctrl-C · 규칙 밖 · 두 값이 다름 · 터미널 아님 · 인자로 준 비밀번호)는
 *   **해시가 그대로**이고 그렇다고 말한다.
 * - 어느 갈래에서도 **비밀번호가 출력에 안 실린다.**
 * - 숨겨 받기는 **묻기 전에 와 있던 입력을 버린다** — 명령과 뒤 줄들을 통째로 붙여 넣은 판이다.
 *
 * **진짜 터미널(pty)에서의 값은 여기서 못 잰다** — 가짜 입력은 원시 모드가 실제로 되비추기를 끄는지 · 붙여 넣은
 * 바이트가 어느 조각으로 오는지를 흉내만 낸다. 그 판은 대화형 셸에 사람처럼 쳐서 잰다(README 「비밀번호를 잊었다」).
 */
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { verifyPassword } from '../src/auth/password'
import {
  readHiddenLine,
  resetPassword,
  runResetPassword,
  type HiddenInput,
  type ResetPasswordIo,
} from '../src/db/reset-password'
import { createProject, getTestDb, signup, testConfig, withApi, type TestContext } from './helpers'

const TEST_SCRYPT_N = testConfig().passwordScryptN
const NEW_PASSWORD = '새-비밀번호-5678'

/**
 * 원시 모드 전환을 적고, `type` 으로 친 조각을 흘리는 가짜 터미널 입력.
 *
 * **듣는 자가 없을 때 친 조각은 쌓아 두었다가 첫 듣는 자에게 준다** — 진짜 터미널에서 명령이 뜨기 전에 붙여 넣은 줄은
 * 커널의 입력에 쌓여 있다가 읽기 시작하면 온다. 안 쌓으면 «묻기 전 입력을 버린다»를 떼어도 그 줄이 그냥 사라져 초록이다.
 */
class FakeTty extends EventEmitter implements HiddenInput {
  isTTY: boolean | undefined = true
  readonly rawModes: boolean[] = []
  private pending: string[] = []
  override on(event: string | symbol, listener: (...args: any[]) => void): this {
    super.on(event, listener)
    if (event === 'data' && this.pending.length > 0) {
      const queued = this.pending
      this.pending = []
      for (const chunk of queued) this.emit('data', chunk)
    }
    return this
  }
  setRawMode(mode: boolean): this {
    this.rawModes.push(mode)
    return this
  }
  setEncoding(): this {
    return this
  }
  resume(): this {
    return this
  }
  pause(): this {
    return this
  }
  type(chunk: string): void {
    if (this.listenerCount('data') === 0) this.pending.push(chunk)
    else this.emit('data', chunk)
  }
}

/**
 * 명령 한 번의 입출력. `answers` 는 물음마다 사람이 칠 조각이다 — 물음이 뜬 **뒤에** 흘린다.
 * 물음이 더 오면 아무것도 안 친다(케이스가 기다림으로 멈추면 그 물음이 뜨면 안 됐다는 뜻이다).
 */
function terminal(answers: string[], options: { tty?: boolean } = {}) {
  const input = new FakeTty()
  input.isTTY = options.tty ?? true
  const out: string[] = []
  const err: string[] = []
  const prompts: string[] = []
  const queue = [...answers]
  const io: ResetPasswordIo = {
    log: (line) => out.push(line),
    error: (line) => err.push(line),
    prompt: (text) => {
      prompts.push(text)
      if (text !== '\n') {
        const next = queue.shift()
        if (next !== undefined) queueMicrotask(() => input.type(next))
      }
    },
    input,
    drainMs: 0,
  }
  return {
    io,
    input,
    out,
    err,
    questions: () => prompts.filter((text) => text !== '\n'),
    all: () => [...out, ...err, ...prompts].join('\n'),
  }
}

async function hashOf(ctx: TestContext, email: string): Promise<string> {
  const row = await ctx.db.selectFrom('users').select('password_hash').where('email', '=', email).executeTakeFirstOrThrow()
  return row.password_hash
}

async function sessionCount(ctx: TestContext, userId: string): Promise<number> {
  const rows = await ctx.db.selectFrom('sessions').select('id').where('user_id', '=', userId).execute()
  return rows.length
}

function target(ctx: TestContext) {
  return { db: ctx.db, databaseUrl: 'postgres://u:비밀@127.0.0.1:5999/wb_reset', scryptN: TEST_SCRYPT_N }
}

async function login(ctx: TestContext, email: string, password: string): Promise<number> {
  const res = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } })
  return res.statusCode
}

describe('숨겨 받기', () => {
  it('친 글자를 되비추지 않고 한 줄을 받는다 — 원시 모드는 켰다가 되돌린다', async () => {
    const input = new FakeTty()
    const prompts: string[] = []
    const reading = readHiddenLine(input, (text) => prompts.push(text), '묻는 글: ', { drainMs: 0 })
    await new Promise((resolve) => setTimeout(resolve, 5))
    input.type('abc')
    input.type('def\r')
    expect(await reading).toEqual({ kind: 'line', value: 'abcdef' })
    expect(input.rawModes).toEqual([true, false])
    expect(prompts.join('')).not.toContain('abc')
  })

  it('지우기 · 줄 비우기 · 화살표 제어열은 글자가 아니다', async () => {
    const input = new FakeTty()
    const reading = readHiddenLine(input, () => {}, '? ', { drainMs: 0 })
    await new Promise((resolve) => setTimeout(resolve, 5))
    input.type('xyz\u0015ab\u007fc\u001b[Dd\r')
    expect(await reading).toEqual({ kind: 'line', value: 'acd' })
  })

  it('빈 줄에서 Ctrl-D 는 끝 · 글자가 있으면 무시한다 · Ctrl-C 는 취소다', async () => {
    for (const [typed, expected] of [
      ['\u0004', { kind: 'eof' }],
      ['ab\u0004c\r', { kind: 'line', value: 'abc' }],
      ['ab\u0003', { kind: 'cancelled' }],
    ] as const) {
      const input = new FakeTty()
      const reading = readHiddenLine(input, () => {}, '? ', { drainMs: 0 })
      await new Promise((resolve) => setTimeout(resolve, 5))
      input.type(typed)
      expect(await reading).toEqual(expected)
      expect(input.rawModes).toEqual([true, false])
    }
  })

  it('**묻기 전에 와 있던 입력은 버린다** — 붙여 넣은 뒤 줄이 비밀번호로 먹히지 않는다', async () => {
    const input = new FakeTty()
    const dropped: number[] = []
    const reading = readHiddenLine(input, () => {}, '? ', { drainMs: 30, discarded: (n) => dropped.push(n) })
    // 명령 줄 뒤에 붙여 넣은 빈 줄과 다음 명령 — 묻기 전에 온다.
    input.type('\n')
    input.type('echo 다음 명령\n')
    await new Promise((resolve) => setTimeout(resolve, 60))
    input.type('사람이 친 값\r')
    expect(await reading).toEqual({ kind: 'line', value: '사람이 친 값' })
    expect(dropped).toEqual(['\n'.length + 'echo 다음 명령\n'.length])
  })

  it('한 줄을 받으면 그 조각의 나머지를 다음 물음에 넘기지 않는다', async () => {
    const input = new FakeTty()
    const first = readHiddenLine(input, () => {}, '? ', { drainMs: 0 })
    await new Promise((resolve) => setTimeout(resolve, 5))
    input.type('first\rsecond\r')
    expect(await first).toEqual({ kind: 'line', value: 'first' })
    const second = readHiddenLine(input, () => {}, '? ', { drainMs: 0 })
    await new Promise((resolve) => setTimeout(resolve, 5))
    input.type('third\r')
    expect(await second).toEqual({ kind: 'line', value: 'third' })
  })
})

describe('바꾼다', () => {
  it('새 비밀번호로 로그인되고 옛 것은 안 된다 · 그 사람의 세션만 지운다 · 토큰은 그대로다', async () => {
    await withApi(async (ctx) => {
      const me = await signup(ctx, { email: 'me@example.com' })
      const other = await signup(ctx)
      expect(await login(ctx, 'me@example.com', me.password)).toBe(200) // 세션 둘째
      const project = await createProject(ctx, me.cookie)
      const issued = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${project.id}/tokens`,
        cookies: me.cookie,
        payload: { name: '재설정 전 토큰' },
      })
      expect(issued.statusCode, issued.body).toBe(201)
      const bearer = { authorization: `Bearer ${issued.json().value}` }

      const t = terminal([`${NEW_PASSWORD}\r`, `${NEW_PASSWORD}\r`])
      expect(await runResetPassword(['me@example.com'], target(ctx), t.io)).toBe(0)

      expect(await verifyPassword(NEW_PASSWORD, await hashOf(ctx, 'me@example.com'))).toBe(true)
      expect(await login(ctx, 'me@example.com', NEW_PASSWORD)).toBe(200)
      expect(await login(ctx, 'me@example.com', me.password)).toBe(401)
      const meAgain = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', cookies: me.cookie })
      expect(meAgain.statusCode).toBe(401)
      expect(await sessionCount(ctx, other.user.id)).toBe(1)
      const viaToken = await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}/tree`, headers: bearer })
      expect(viaToken.statusCode, viaToken.body).toBe(200)

      expect(t.out).toEqual([
        '비밀번호 재설정 대상 DB: 127.0.0.1:5999/wb_reset',
        '바꿨습니다 — me@example.com · 로그인해 둔 세션 2개를 지웠습니다 · API 토큰(wireb login)은 그대로입니다',
      ])
      expect(t.all()).not.toContain(NEW_PASSWORD)
      expect(t.all()).not.toContain('비밀@')
    })
  })

  it('이메일은 서버처럼 정규화한다 — 대문자 · 앞뒤 공백', async () => {
    await withApi(async (ctx) => {
      await signup(ctx, { email: 'mixed@example.com' })
      const t = terminal([`${NEW_PASSWORD}\r`, `${NEW_PASSWORD}\r`])
      expect(await runResetPassword([' MIXED@Example.COM '], target(ctx), t.io)).toBe(0)
      expect(await verifyPassword(NEW_PASSWORD, await hashOf(ctx, 'mixed@example.com'))).toBe(true)
    })
  })

  it('`resetPassword` 는 계정이 없으면 아무 행도 안 건드린다', async () => {
    await withApi(async (ctx) => {
      await signup(ctx, { email: 'keep@example.com' })
      const before = await hashOf(ctx, 'keep@example.com')
      expect(await resetPassword(ctx.db, 'nobody@example.com', NEW_PASSWORD, TEST_SCRYPT_N)).toEqual({
        kind: 'no-user',
        email: 'nobody@example.com',
      })
      expect(await hashOf(ctx, 'keep@example.com')).toBe(before)
    })
  })
})

describe('바꾸지 않는다 — 해시가 그대로이고 그렇다고 말한다', () => {
  const cases: { name: string; answers: string[]; code: number; says: RegExp; asked: number }[] = [
    { name: '빈 값', answers: ['\r'], code: 1, says: /비었습니다/, asked: 1 },
    { name: 'Ctrl-D', answers: ['\u0004'], code: 1, says: /비었습니다/, asked: 1 },
    { name: 'Ctrl-C', answers: ['abc\u0003'], code: 130, says: /취소했습니다/, asked: 1 },
    { name: '7자 — 규칙 밖은 둘째를 묻지도 않는다', answers: ['1234567\r'], code: 1, says: /8–200자.*7자/, asked: 1 },
    { name: '201자', answers: [`${'가'.repeat(201)}\r`], code: 1, says: /8–200자.*201자/, asked: 1 },
    { name: '두 값이 다름', answers: [`${NEW_PASSWORD}\r`, `${NEW_PASSWORD}x\r`], code: 1, says: /다릅니다/, asked: 2 },
    { name: '둘째에서 Ctrl-D', answers: [`${NEW_PASSWORD}\r`, '\u0004'], code: 1, says: /비었습니다/, asked: 2 },
  ]

  for (const c of cases) {
    it(c.name, async () => {
      await withApi(async (ctx) => {
        const me = await signup(ctx, { email: 'me@example.com' })
        const before = await hashOf(ctx, 'me@example.com')
        const t = terminal(c.answers)

        expect(await runResetPassword(['me@example.com'], target(ctx), t.io)).toBe(c.code)

        expect(await hashOf(ctx, 'me@example.com')).toBe(before)
        expect(await sessionCount(ctx, me.user.id)).toBe(1)
        expect(t.err.join('\n')).toMatch(c.says)
        expect(t.err.join('\n')).toContain('아무것도 바꾸지 않았습니다')
        expect(t.questions()).toHaveLength(c.asked)
        expect(t.input.rawModes.at(-1)).toBe(false)
        for (const answer of c.answers) {
          const typed = answer.replace(/[\r\u0003\u0004]/g, '')
          if (typed.length > 0) expect(t.all()).not.toContain(typed)
        }
      })
    })
  }

  it('대상 0 — 계정이 없으면 비밀번호를 묻지도 않는다', async () => {
    await withApi(async (ctx) => {
      const t = terminal([`${NEW_PASSWORD}\r`, `${NEW_PASSWORD}\r`])
      expect(await runResetPassword(['nobody@example.com'], target(ctx), t.io)).toBe(1)
      expect(t.err).toEqual(['대상 0 — nobody@example.com 계정이 이 DB 에 없습니다. 아무것도 바꾸지 않았습니다.'])
      expect(t.questions()).toEqual([])
      expect(t.input.rawModes).toEqual([])
    })
  })

  it('표준입력이 터미널이 아니면 묻지 않는다 — 파이프로 준 비밀번호는 셸 기록에 남는 길이다', async () => {
    await withApi(async (ctx) => {
      await signup(ctx, { email: 'me@example.com' })
      const before = await hashOf(ctx, 'me@example.com')
      const t = terminal([`${NEW_PASSWORD}\r`], { tty: false })
      expect(await runResetPassword(['me@example.com'], target(ctx), t.io)).toBe(1)
      expect(t.err.join('\n')).toMatch(/터미널에서만/)
      expect(t.questions()).toEqual([])
      expect(await hashOf(ctx, 'me@example.com')).toBe(before)
    })
  })

  it('인자로 비밀번호를 주면 거절한다 · 이메일이 아니면 거절한다 — DB 에 가기 전에', async () => {
    const db = getTestDb()
    for (const args of [['me@example.com', NEW_PASSWORD], [], ['이메일아님']]) {
      const t = terminal([])
      expect(await runResetPassword(args, { db, databaseUrl: 'postgres://x', scryptN: TEST_SCRYPT_N }, t.io)).toBe(1)
      expect(t.out).toEqual([])
      expect(t.questions()).toEqual([])
    }
    const extra = terminal([])
    await runResetPassword(['me@example.com', NEW_PASSWORD], { db, databaseUrl: 'postgres://x', scryptN: 1024 }, extra.io)
    expect(extra.err.join('\n')).toMatch(/인자로 받지 않습니다/)
    expect(extra.all()).not.toContain(NEW_PASSWORD)
  })
})

describe('명령 이름', () => {
  it('`pnpm --filter @wirebound/api reset-password` 가 이 파일을 `.env` 와 함께 부른다 — README 가 그 이름을 든다', () => {
    const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { scripts: Record<string, string> }
    expect(pkg.scripts['reset-password']).toBe('tsx --env-file-if-exists=.env src/db/reset-password.ts')
    expect(readFileSync(new URL('../../../README.md', import.meta.url), 'utf8')).toContain(
      'pnpm --filter @wirebound/api reset-password me@example.com',
    )
  })
})
