/**
 * **비밀번호 재설정 — 서버에 손이 닿는 사람이 계정 하나의 비밀번호를 바꾼다.**
 *
 * ```bash
 * pnpm --filter @wirebound/api reset-password me@example.com
 * ```
 *
 * 화면에도 API 에도 비밀번호를 바꾸는 길이 없고, 시딩(`db/seed-user.ts`)은 이미 있는 이메일의 비밀번호를
 * 덮어쓰지 않는다. 그래서 잊은 비밀번호를 되찾는 길은 이 명령 하나다(최상위 README 「비밀번호를 잊었다」).
 *
 * **서버와 같은 함수를 부른다** — 규칙은 `auth/credentials.ts` 의 `NormalizedEmail` · `RawPassword`, 해시는
 * `auth/password.ts` 의 `hashPassword`(비용은 서버와 같은 `PASSWORD_SCRYPT_N`), 세션 삭제는 `auth/session.ts` 의
 * `destroyUserSessions`. 손으로 친 SQL · 셸 조각으로 같은 일을 하면 규칙이 두 벌이 되고, 붙여 넣기 · Ctrl-D ·
 * 짧은 비밀번호에서 조용히 «아무도 못 쓰는 계정»이 남는다.
 *
 * **비밀번호는 터미널에서 숨겨 받는다** — 인자 · 환경변수 · 표준입력 파이프로는 안 받는다. 셋 다 셸 기록이나
 * `ps` 에 남는 길이다. 표준입력이 터미널이 아니면 아무것도 안 묻고 끝난다. 해시도 명령 글자에 안 싣는다 —
 * 이 프로세스 안에서 만들어 매개변수로 DB 에 보낸다.
 *
 * **바꾸지 않고 끝나는 갈래가 전부 «아무것도 바꾸지 않았습니다»를 말한다** — 대상 0 · 빈 값 · Ctrl-D · Ctrl-C ·
 * 규칙 밖(8–200자) · 두 번 친 값이 다름. 쓰기는 두 값을 다 받고 규칙을 지난 뒤에 한 트랜잭션으로 한 번 한다.
 */
import { pathToFileURL } from 'node:url'
import { getKoreanErrorMap } from '@wirebound/schema'
import { NormalizedEmail, RawPassword } from '../auth/credentials'
import { DEFAULT_SCRYPT_PARAMS, hashPassword } from '../auth/password'
import { destroyUserSessions } from '../auth/session'
import { loadConfig } from '../config'
import { createDb, createPool } from './client'
import { describeDatabaseTarget } from './describe-target'
import { withTransaction, type DbHandle } from './tx'

/** 값 때문에 바꾸지 않고 멈췄을 때 던진다. **`message` 에 비밀번호를 담지 않는다** — 그대로 콘솔로 나간다. */
export class ResetPasswordError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ResetPasswordError'
  }
}

export type ResetPasswordOutcome =
  | { kind: 'updated'; email: string; sessionsDeleted: number }
  | { kind: 'no-user'; email: string }

/** 이메일을 서버의 규칙으로 정규화한다(소문자). 형식이 어긋나면 던진다. */
export function normalizeEmail(raw: string): string {
  const parsed = NormalizedEmail.safeParse(raw.trim(), { error: getKoreanErrorMap() })
  if (!parsed.success) {
    throw new ResetPasswordError(`이메일 형식이 아닙니다: ${raw}`)
  }
  return parsed.data
}

/**
 * 비밀번호가 서버의 규칙(`RawPassword`)을 지나는지. 어긋나면 던진다 — 규칙 밖의 비밀번호를 넣으면 로그인 본문
 * 검증이 400 을 내 **아무도 못 쓰는 계정**이 된다(`auth/credentials.ts` 머리말).
 */
export function checkPassword(password: string): string {
  const parsed = RawPassword.safeParse(password, { error: getKoreanErrorMap() })
  if (!parsed.success) {
    throw new ResetPasswordError(`비밀번호는 8–200자여야 합니다(친 값은 ${[...password].length}자)`)
  }
  return parsed.data
}

/**
 * **그 계정의 해시를 바꾸고 그 사람의 세션을 지운다 — 한 트랜잭션.** 계정이 없으면 아무것도 안 바꾸고 `no-user`.
 *
 * 세션을 지우는 것은 옛 비밀번호가 새어 바꾸는 사람을 위해서다 — 안 지우면 그 전에 로그인한 브라우저가 계속 산다.
 * **API 토큰(`wireb login`)은 건드리지 않는다**(`api_tokens` 는 다른 표이고 토큰마다 따로 폐기한다).
 */
export async function resetPassword(
  db: DbHandle,
  email: string,
  password: string,
  scryptN: number,
): Promise<ResetPasswordOutcome> {
  const normalized = normalizeEmail(email)
  const passwordHash = await hashPassword(checkPassword(password), { ...DEFAULT_SCRYPT_PARAMS, N: scryptN })
  return withTransaction(db, async (trx) => {
    const updated = await trx
      .updateTable('users')
      .set({ password_hash: passwordHash })
      .where('email', '=', normalized)
      .returning('id')
      .executeTakeFirst()
    if (updated === undefined) {
      return { kind: 'no-user', email: normalized }
    }
    const sessions = await trx
      .selectFrom('sessions')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('user_id', '=', updated.id)
      .executeTakeFirstOrThrow()
    await destroyUserSessions(trx, updated.id)
    return { kind: 'updated', email: normalized, sessionsDeleted: Number(sessions.n) }
  })
}

/** 숨겨 받기가 쓰는 터미널 입력. `process.stdin` 이 이 모양이다 — 케이스는 가짜를 넣는다. */
export interface HiddenInput {
  isTTY?: boolean
  setRawMode(mode: boolean): unknown
  setEncoding(encoding: BufferEncoding): unknown
  on(event: 'data', listener: (chunk: string) => void): unknown
  off(event: 'data', listener: (chunk: string) => void): unknown
  resume(): unknown
  pause(): unknown
}

/** 숨겨 받은 결과. `eof` 는 빈 줄에서 Ctrl-D, `cancelled` 는 Ctrl-C 다. */
export type HiddenLine = { kind: 'line'; value: string } | { kind: 'eof' } | { kind: 'cancelled' }

const CTRL_C = '\u0003'
const CTRL_D = '\u0004'
const CTRL_U = '\u0015'
const ESC = '\u001b'

/**
 * **한 줄을 터미널에서 숨겨 받는다** — 원시 모드로 바꾸고 친 글자를 되비추지 않는다.
 *
 * **묻기 전에 이미 와 있던 입력은 버린다**(`drainMs` 동안 온 것). 명령 줄과 그 뒤 줄들을 통째로 붙여 넣으면 뒤 줄들이
 * 터미널 입력에 쌓여 있다가 첫 물음의 답으로 먹힌다 — 버리지 않으면 붙여 넣은 다음 줄(흔히 빈 줄이나 다음 명령)이
 * 비밀번호가 된다. 버린 바이트 수를 `discarded` 로 알린다.
 *
 * 한 줄을 받으면 그 조각의 나머지도 버린다 — 다음 물음 앞에 온 입력이다. 원시 모드는 어느 갈래로 끝나든 되돌린다.
 */
export async function readHiddenLine(
  input: HiddenInput,
  prompt: (text: string) => void,
  question: string,
  options: { drainMs: number; discarded?: (count: number) => void },
): Promise<HiddenLine> {
  input.setEncoding('utf8')
  input.setRawMode(true)
  input.resume()
  let dropped = 0
  const drain = (chunk: string): void => {
    dropped += chunk.length
  }
  try {
    input.on('data', drain)
    await new Promise((resolve) => setTimeout(resolve, options.drainMs))
    input.off('data', drain)
    if (dropped > 0) options.discarded?.(dropped)

    prompt(question)
    return await new Promise<HiddenLine>((resolve) => {
      let value: string[] = []
      let escaping = false
      const finish = (result: HiddenLine): void => {
        input.off('data', onData)
        resolve(result)
      }
      const onData = (chunk: string): void => {
        for (const char of chunk) {
          if (escaping) {
            // 화살표 · 기능 키의 제어열(`ESC [ … 글자`)은 통째로 버린다 — 비밀번호의 글자가 아니다.
            if (char !== '[' && char >= '@' && char <= '~') escaping = false
            continue
          }
          if (char === '\r' || char === '\n') return finish({ kind: 'line', value: value.join('') })
          if (char === CTRL_C) return finish({ kind: 'cancelled' })
          if (char === CTRL_D) {
            if (value.length === 0) return finish({ kind: 'eof' })
            continue
          }
          if (char === '\u007f' || char === '\b') {
            value = value.slice(0, -1)
            continue
          }
          if (char === CTRL_U) {
            value = []
            continue
          }
          if (char === ESC) {
            escaping = true
            continue
          }
          if (char < ' ') continue
          value.push(char)
        }
      }
      input.on('data', onData)
    })
  } finally {
    input.off('data', drain)
    input.setRawMode(false)
    input.pause()
    prompt('\n')
  }
}

export interface ResetPasswordIo {
  /** 결과 줄. */
  log: (line: string) => void
  /** 실패 줄. */
  error: (line: string) => void
  /** 묻는 글 — 줄바꿈 없이 그대로 쓴다. */
  prompt: (text: string) => void
  input: HiddenInput
  /** 묻기 전에 와 있던 입력을 버리는 시간(ms). */
  drainMs: number
}

const NOTHING_CHANGED = '아무것도 바꾸지 않았습니다.'

/**
 * **명령 한 번 — 종료 코드를 돌려준다.** 0 바꿨다 · 1 바꾸지 않았다 · 130 Ctrl-C.
 *
 * 순서가 요점이다: 대상 DB 를 말하고 → 계정이 있는지 보고(없으면 비밀번호를 묻지도 않는다) → 두 번 받아 → 규칙을
 * 지나면 → 쓴다. 쓰기 전에 끝나는 갈래는 DB 에 아무것도 안 보낸다.
 */
export async function runResetPassword(
  args: readonly string[],
  target: { db: DbHandle; databaseUrl: string; scryptN: number },
  io: ResetPasswordIo,
): Promise<number> {
  if (args.length !== 1 || args[0] === undefined || args[0].trim() === '') {
    io.error('사용법: pnpm --filter @wirebound/api reset-password <이메일>')
    if (args.length > 1) {
      io.error('비밀번호는 인자로 받지 않습니다 — 셸 기록에 남습니다. 명령이 묻을 때 친다.')
    }
    return 1
  }

  let email: string
  try {
    email = normalizeEmail(args[0])
  } catch (error) {
    io.error(`${(error as Error).message} — ${NOTHING_CHANGED}`)
    return 1
  }

  io.log(`비밀번호 재설정 대상 DB: ${describeDatabaseTarget(target.databaseUrl)}`)

  if (io.input.isTTY !== true) {
    io.error(`비밀번호는 터미널에서만 받습니다(표준입력이 터미널이 아닙니다) — ${NOTHING_CHANGED}`)
    return 1
  }

  const found = await target.db.selectFrom('users').select('id').where('email', '=', email).executeTakeFirst()
  if (found === undefined) {
    io.error(`대상 0 — ${email} 계정이 이 DB 에 없습니다. ${NOTHING_CHANGED}`)
    return 1
  }

  const discarded = (count: number): void => {
    io.error(`(묻기 전에 들어온 입력 ${count}글자를 버렸습니다)`)
  }
  const first = await readHiddenLine(io.input, io.prompt, `${email} 의 새 비밀번호(8–200자, 친 글자는 안 보인다): `, {
    drainMs: io.drainMs,
    discarded,
  })
  const firstValue = ended(first, io)
  if (firstValue === undefined) return first.kind === 'cancelled' ? 130 : 1
  try {
    checkPassword(firstValue)
  } catch (error) {
    io.error(`${(error as Error).message} — ${NOTHING_CHANGED}`)
    return 1
  }

  const second = await readHiddenLine(io.input, io.prompt, '한 번 더: ', { drainMs: io.drainMs, discarded })
  const secondValue = ended(second, io)
  if (secondValue === undefined) return second.kind === 'cancelled' ? 130 : 1
  if (secondValue !== firstValue) {
    io.error(`두 번 친 값이 다릅니다 — ${NOTHING_CHANGED}`)
    return 1
  }

  const outcome = await resetPassword(target.db, email, firstValue, target.scryptN)
  if (outcome.kind === 'no-user') {
    // 묻는 사이에 계정이 지워졌다.
    io.error(`대상 0 — ${email} 계정이 이 DB 에 없습니다. ${NOTHING_CHANGED}`)
    return 1
  }
  io.log(
    `바꿨습니다 — ${outcome.email} · 로그인해 둔 세션 ${outcome.sessionsDeleted}개를 지웠습니다` +
      ' · API 토큰(wireb login)은 그대로입니다',
  )
  return 0
}

/** 받은 줄이 쓸 값이면 그 값, 아니면 그렇다고 말하고 `undefined`. */
function ended(line: HiddenLine, io: ResetPasswordIo): string | undefined {
  if (line.kind === 'cancelled') {
    io.error(`취소했습니다 — ${NOTHING_CHANGED}`)
    return undefined
  }
  if (line.kind === 'eof' || line.value === '') {
    io.error(`비밀번호가 비었습니다 — ${NOTHING_CHANGED}`)
    return undefined
  }
  return line.value
}

async function main(): Promise<void> {
  const config = loadConfig()
  const db = createDb(createPool(config.databaseUrl, undefined, config.dbTimeLimits))
  // 원시 모드인 채로 끝나면 셸이 글자를 안 되비춘다 — 어느 길로 끝나든 되돌린다.
  process.on('exit', () => {
    if (process.stdin.isTTY) process.stdin.setRawMode(false)
  })
  try {
    process.exitCode = await runResetPassword(
      process.argv.slice(2),
      { db, databaseUrl: config.databaseUrl, scryptN: config.passwordScryptN },
      {
        log: (line) => console.log(line),
        error: (line) => console.error(line),
        prompt: (text) => process.stderr.write(text),
        input: process.stdin,
        drainMs: 100,
      },
    )
  } finally {
    await db.destroy()
  }
}

// `migrate.ts` 와 같은 판정 — 경로에 공백 · 한글이 있어도 CLI 로 불렸을 때만 돈다.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  void main()
}
