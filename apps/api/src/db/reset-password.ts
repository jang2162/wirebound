/**
 * **비밀번호 재설정 — 서버에 손이 닿는 사람이 계정 하나의 비밀번호를 바꾼다.**
 *
 * ```bash
 * pnpm --filter @wirebound/api reset-password me@example.com
 * ```
 *
 * 화면에도 API 에도 비밀번호를 바꾸는 길이 없고, 시딩(`db/seed-user.ts`)은 이미 있는 이메일의 비밀번호를
 * 덮어쓰지 않는다. 그래서 잊은 비밀번호를 되찾는 길은 이 명령 하나다(docs/guides/development.md 「비밀번호를 잊었다」).
 *
 * **서버와 같은 함수를 부른다** — 규칙은 `auth/credentials.ts` 의 `NormalizedEmail` · `NewPassword`(NFC 판을 세고 낸다),
 * 해시는 `auth/password.ts` 의 `hashPassword`(비용은 서버와 같은 `PASSWORD_SCRYPT_N`), 세션 삭제는 `auth/session.ts` 의
 * `destroyUserSessions`. 손으로 친 SQL · 셸 조각으로 같은 일을 하면 규칙이 두 벌이 되고, 붙여 넣기 · Ctrl-D ·
 * 짧은 비밀번호에서 조용히 «아무도 못 쓰는 계정»이 남는다.
 *
 * **비밀번호는 터미널에서 숨겨 받는다** — 인자 · 환경변수 · 표준입력 파이프로는 안 받는다. 셋 다 셸 기록이나
 * `ps` 에 남는 길이다. 표준입력이 터미널이 아니면 아무것도 안 묻고 끝난다. 해시도 명령 글자에 안 싣는다 —
 * 이 프로세스 안에서 만들어 매개변수로 DB 에 보낸다.
 *
 * **바꾸지 않고 끝나는 갈래가 전부 «아무것도 바꾸지 않았습니다»를 말한다** — 대상 0 · 빈 값 · Ctrl-D · Ctrl-C ·
 * 규칙 밖(8–200자) · 두 번 친 값이 다름 · 인자가 어긋남 · 쓰기 전에 난 DB 오류. 쓰기는 두 값을 다 받고 규칙을 지난 뒤에
 * 한 트랜잭션으로 한 번 한다. **커밋에서 난 DB 오류만은 «반영됐는지 모릅니다»다** — 커밋이 DB 에 닿았는지 이 프로세스가
 * 모른다(`ResetPasswordWriteError`).
 */
import { pathToFileURL } from 'node:url'
import { getKoreanErrorMap } from '@wirebound/schema'
import { NewPassword, NormalizedEmail } from '../auth/credentials'
import { DEFAULT_SCRYPT_PARAMS, hashPassword } from '../auth/password'
import { destroyUserSessions } from '../auth/session'
import { loadConfig } from '../config'
import { createDb, createPool } from './client'
import { DbConnectionLostError } from './connection-loss'
import { describeDatabaseTarget } from './describe-target'
import { withTransaction, type DbHandle } from './tx'

/** 값 때문에 바꾸지 않고 멈췄을 때 던진다. **`message` 에 비밀번호를 담지 않는다** — 그대로 콘솔로 나간다. */
export class ResetPasswordError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ResetPasswordError'
  }
}

/**
 * 쓰기 트랜잭션이 DB 오류로 끝났다. `outcomeUnknown` 은 **몸통을 다 돌고 커밋에서** 난 오류다 — 커밋이 DB 에 닿았는지
 * 이 프로세스는 알 수 없다. 몸통에서 났으면 트랜잭션이 끝나지 않았으므로 아무것도 안 바뀌었다.
 */
export class ResetPasswordWriteError extends Error {
  constructor(
    readonly outcomeUnknown: boolean,
    cause: unknown,
  ) {
    super(dbErrorText(cause), { cause })
    this.name = 'ResetPasswordWriteError'
  }
}

/**
 * DB 오류를 한 줄로. `DbConnectionLostError` 는 안쪽 원인을 쓴다 — 그 문장(«그 질의가 반영됐는지 모릅니다»)은 트랜잭션
 * 중간의 끊김까지 넓게 «모름»으로 적는 서버의 판정이고(`db/connection-loss.ts`), 이 명령은 커밋에 닿았는지를 스스로 가른다.
 */
function dbErrorText(error: unknown): string {
  const inner = error instanceof DbConnectionLostError ? error.cause : error
  return inner instanceof Error ? inner.message : String(inner)
}

/** 재설정 뒤에도 사는 그 사람의 API 토큰 — 프로젝트 하나 몫. 토큰 원문 · 해시는 없다. */
export interface RemainingTokens {
  projectId: string
  projectName: string
  /** 그 프로젝트의 멤버인가. 아니면 그 토큰은 지금 404 지만 다시 멤버가 되면 산다(역할을 요청 때 읽는다). */
  member: boolean
  tokenNames: string[]
}

export type ResetPasswordOutcome =
  | { kind: 'updated'; email: string; sessionsDeleted: number; tokens: RemainingTokens[] }
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
 * 비밀번호가 서버의 규칙(`NewPassword`)을 지나는지 — 지나면 NFC 판을 낸다. 어긋나면 던진다 — 규칙 밖의 비밀번호를 넣으면 로그인 본문
 * 검증이 400 을 내 **아무도 못 쓰는 계정**이 된다(`auth/credentials.ts` 머리말).
 */
export function checkPassword(password: string): string {
  const parsed = NewPassword.safeParse(password, { error: getKoreanErrorMap() })
  if (!parsed.success) {
    // `NewPassword` 가 세는 단위(NFC 판의 UTF-16 — 이모지 하나가 2자)로 센다. 코드 포인트로 세면 규칙이 받는 값에 «8자 미만»이라 말한다.
    throw new ResetPasswordError(`비밀번호는 8–200자여야 합니다(친 값은 ${password.normalize('NFC').length}자)`)
  }
  return parsed.data
}

/**
 * **그 계정의 해시를 바꾸고 그 사람의 세션을 지운다 — 한 트랜잭션.** 계정이 없으면 아무것도 안 바꾸고 `no-user`.
 *
 * 세션을 지우는 것은 옛 비밀번호로 로그인한 브라우저를 끊기 위해서다.
 *
 * **API 토큰(`wireb login`)은 지우지 않고 센다.** 잊어서 바꾸는 사람에게는 토큰이 그대로 도는 것이 맞다 — 그 사람의
 * CLI 가 계속 돈다. 그런데 **옛 비밀번호가 새어서** 바꾸는 것이면 세션만 지워서는 못 쫓아낸다: 토큰은 세션으로 만들고
 * (`routes/tokens.ts`) 발급자의 역할을 그대로 가지므로, 옛 비밀번호를 쥔 사람이 세션 하나로 멤버인 프로젝트마다 토큰을
 * 남겼을 수 있다. 이 명령은 두 갈래를 가를 수 없어 **남은 토큰을 프로젝트별로 말하고** 거두는 것은 사람이 한다 — 새
 * 비밀번호로 에디터에 로그인해 «API 토큰» 화면(`apps/web/src/routes/tokens.tsx`)에서. 그 화면은 그 계정의 토큰을 프로젝트를
 * 가리지 않고(멤버가 아닌 프로젝트의 것까지) 보이고 거둔다(docs/guides/development.md 「비밀번호를 잊었다」).
 *
 * **«토큰도 지운다» 갈래(`--revoke-tokens`)를 두지 않는다.** ① 닿는 범위가 화면과 같다 — 화면이 멤버가 아닌 프로젝트의
 * 토큰까지 거두므로 이 명령만 닿는 토큰이 없다. ② «새었는가»를 아는 것은 그 사람이다 — 명령을 치는 사람은 서버에 손이 닿는
 * 사람이라 잊은 사람의 CLI 를 모르고 끊을 수 있다. ③ 그 사람은 어차피 새 비밀번호로 로그인한다 — 거두는 길이 한 걸음 뒤에
 * 있다. 로그인하지 않을 사람의 토큰을 거둬야 하는 판(퇴사 등)은 멤버 제거가 그 프로젝트 토큰을 지운다.
 */
export async function resetPassword(db: DbHandle, email: string, password: string, scryptN: number): Promise<ResetPasswordOutcome> {
  const normalized = normalizeEmail(email)
  const passwordHash = await hashPassword(checkPassword(password), { ...DEFAULT_SCRYPT_PARAMS, N: scryptN })
  let reachedCommit = false
  try {
    return await withTransaction(db, async (trx) => {
      const outcome = await writeReset(trx, normalized, passwordHash)
      reachedCommit = true
      return outcome
    })
  } catch (error) {
    throw new ResetPasswordWriteError(reachedCommit, error)
  }
}

/**
 * **재설정의 쓰기 몸통 — 해시를 바꾸고 그 사람의 세션을 전부 지운다.** 이 명령과 재설정 링크(`routes/password-reset.ts`)가 함께 부른다 —
 * 두 벌이면 한쪽만 세션을 남긴다. **사용자 행 → 세션 차례다**(`auth/admin.ts` 머리말 «사용자 행 → 자격 차례다»). 대상이 없으면 `null`.
 * 지운 세션 id 를 낸다 — 서버 안에서 부른 쪽이 그 WS 를 닫는다(`ws/notify.ts` 의 `closeSessionConnections`).
 */
export async function replacePassword(
  trx: DbHandle,
  target: { email: string } | { id: string },
  passwordHash: string,
): Promise<{ userId: string; endedSessions: string[] } | null> {
  const query = trx.updateTable('users').set({ password_hash: passwordHash })
  const updated = await ('email' in target ? query.where('email', '=', target.email) : query.where('id', '=', target.id))
    .returning('id')
    .executeTakeFirst()
  if (updated === undefined) return null
  return { userId: updated.id, endedSessions: await destroyUserSessions(trx, updated.id) }
}

async function writeReset(trx: DbHandle, normalized: string, passwordHash: string): Promise<ResetPasswordOutcome> {
  const replaced = await replacePassword(trx, { email: normalized }, passwordHash)
  if (replaced === null) {
    return { kind: 'no-user', email: normalized }
  }
  const updated = { id: replaced.userId }
  const tokens = await trx
    .selectFrom('api_tokens')
    .innerJoin('projects', 'projects.id', 'api_tokens.project_id')
    .leftJoin('project_members', (join) =>
      join.onRef('project_members.project_id', '=', 'api_tokens.project_id').onRef('project_members.user_id', '=', 'api_tokens.user_id'),
    )
    .select([
      'projects.id as projectId',
      'projects.name as projectName',
      'api_tokens.name as tokenName',
      'project_members.user_id as memberId',
    ])
    .where('api_tokens.user_id', '=', updated.id)
    .execute()
  return { kind: 'updated', email: normalized, sessionsDeleted: replaced.endedSessions.length, tokens: groupTokens(tokens) }
}

/** 프로젝트별로 묶는다. 순서는 DB 정렬(콜레이션)에 안 기대고 코드 포인트로 — 출력이 기계마다 같다. */
function groupTokens(rows: { projectId: string; projectName: string; tokenName: string; memberId: string | null }[]): RemainingTokens[] {
  const byProject = new Map<string, RemainingTokens>()
  for (const row of rows) {
    const group = byProject.get(row.projectId) ?? {
      projectId: row.projectId,
      projectName: row.projectName,
      member: row.memberId !== null,
      tokenNames: [],
    }
    group.tokenNames.push(row.tokenName)
    byProject.set(row.projectId, group)
  }
  const order = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
  const groups = [...byProject.values()]
  for (const group of groups) group.tokenNames.sort(order)
  return groups.sort((a, b) => order(a.projectName, b.projectName) || order(a.projectId, b.projectId))
}

/**
 * 사람이 지은 이름을 터미널에 싣는 꼴. **제어 문자(C0 · DEL · C1)는 `\uXXXX` 로 적는다** — 프로젝트 · 토큰 이름은
 * 멤버 누구나 짓는 값이라, 그대로 찍으면 이름에 넣은 제어열이 이 명령을 치는 사람의 터미널을 조작한다.
 */
function shown(name: string): string {
  return `«${name.replace(/[\u0000-\u001f\u007f-\u009f]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`)}»`
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
 * **묻기 전에 오는 입력은 조용해질 때까지 버린다** — 마지막 조각 뒤로 `drainMs` 동안 아무것도 안 와야 묻는다. 명령 줄과
 * 그 뒤 줄들을 통째로 붙여 넣으면 뒤 줄들이 터미널 입력에 쌓여 있다가 첫 물음의 답으로 먹힌다 — 버리지 않으면 붙여 넣은
 * 다음 줄(흔히 빈 줄이나 다음 명령)이 비밀번호가 된다. **창을 고정하지 않는 까닭:** 터미널이 붙여넣기를 조각으로 나눠
 * 천천히 보내면(iTerm2 «Paste Slowly» — 16바이트씩 125ms) 고정 창 뒤에 온 줄이 답으로 먹히고, 조각 경계에서 잘린 줄의
 * 뒤쪽이 셸로 가 명령으로 돈다. 버린 글자 수(UTF-16 단위)를 `discarded` 로 알린다.
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
  let quiet: ReturnType<typeof setTimeout> | undefined
  let settle = (): void => {}
  const drain = (chunk: string): void => {
    dropped += chunk.length
    settle()
  }
  try {
    await new Promise<void>((resolve) => {
      settle = () => {
        clearTimeout(quiet)
        quiet = setTimeout(resolve, options.drainMs)
      }
      settle()
      input.on('data', drain)
    })
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
    clearTimeout(quiet)
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
  /** 묻기 전 입력을 버릴 때 «조용해졌다»고 보는 간격(ms). */
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
  rawArgs: readonly string[],
  target: { db: DbHandle; databaseUrl: string; scryptN: number },
  io: ResetPasswordIo,
): Promise<number> {
  // `pnpm … reset-password -- <이메일>` 처럼 pnpm 인자 관습으로 붙인 `--` 는 인자가 아니다.
  const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs
  if (args.length !== 1 || args[0] === undefined || args[0].trim() === '') {
    io.error('사용법: pnpm --filter @wirebound/api reset-password <이메일>')
    if (args.length > 1) {
      // 인자를 되찍지 않는다 — 비밀번호를 인자로 준 사람이면 그 값이다.
      const emails = args.filter((arg) => NormalizedEmail.safeParse(arg.trim()).success).length
      io.error(
        emails === args.length
          ? `이메일은 한 번에 하나만 받습니다(받은 이메일 ${emails}개) — ${NOTHING_CHANGED}`
          : `인자는 이메일 하나만 받습니다(받은 인자 ${args.length}개). 비밀번호는 인자로 받지 않습니다 — 셸 기록에 남습니다. 명령이 물을 때 친다.`,
      )
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

  let found: { id: string } | undefined
  try {
    found = await target.db.selectFrom('users').select('id').where('email', '=', email).executeTakeFirst()
  } catch (error) {
    io.error(`DB 에서 계정을 찾지 못했습니다(${dbErrorText(error)}) — ${NOTHING_CHANGED}`)
    return 1
  }
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

  let outcome: ResetPasswordOutcome
  try {
    outcome = await resetPassword(target.db, email, firstValue, target.scryptN)
  } catch (error) {
    if (!(error instanceof ResetPasswordWriteError)) throw error
    io.error(
      error.outcomeUnknown
        ? `DB 가 커밋에 답하지 못했습니다(${error.message}) — 반영됐는지 모릅니다. 새 비밀번호로 로그인해 보고, 안 되면 다시 친다.`
        : `DB 에 쓰지 못했습니다(${error.message}) — ${NOTHING_CHANGED}`,
    )
    return 1
  }
  if (outcome.kind === 'no-user') {
    // 묻는 사이에 계정이 지워졌다.
    io.error(`대상 0 — ${email} 계정이 이 DB 에 없습니다. ${NOTHING_CHANGED}`)
    return 1
  }
  io.log(`바꿨습니다 — ${outcome.email} · 로그인해 둔 세션 ${outcome.sessionsDeleted}개를 지웠습니다`)
  const tokenCount = outcome.tokens.reduce((sum, group) => sum + group.tokenNames.length, 0)
  if (tokenCount === 0) {
    io.log('API 토큰(wireb login)은 0개입니다')
    return 0
  }
  io.log(`API 토큰(wireb login)은 그대로입니다 — ${tokenCount}개:`)
  for (const group of outcome.tokens) {
    io.log(
      `  ${shown(group.projectName)} (${group.projectId}) ${group.tokenNames.length}개 — ${group.tokenNames.map(shown).join(', ')}` +
        (group.member ? '' : ' — 멤버가 아니어서 지금은 404, 다시 멤버가 되면 산다'),
    )
  }
  io.log('옛 비밀번호가 새어서 바꾼 것이면 이 토큰들도 거둔다 — 새 비밀번호로 에디터에 로그인해 «API 토큰» 화면(/tokens)에서')
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
  // 풀의 연결 오류는 찍지 않는다 — 그 연결에 매달린 질의가 거절되고 이 명령이 무엇이 됐는지 한 줄로 말한다(기본 싱크는 스택째 찍는다).
  const db = createDb(createPool(config.databaseUrl, () => undefined, config.dbTimeLimits))
  // 원시 모드인 채로 끝나면 셸이 글자를 안 되비춘다 — 어느 길로 끝나든 되돌린다.
  const restoreTty = (): void => {
    if (process.stdin.isTTY) process.stdin.setRawMode(false)
  }
  process.on('exit', restoreTty)
  // `exit` 는 신호 죽음에서 안 돈다. SIGINT · SIGTERM 은 Node 가 스스로 tty 를 되돌리고 죽지만 SIGHUP 은 되돌리지 않는다 —
  // 전경 그룹째 HUP 을 받으면 zsh 의 다음 명령이 `-isig -icrnl` 을 물려받는다. 되돌린 뒤 같은 신호로 다시 죽는다(셸이
  // 보는 종료가 SIGTERM 판과 같은 «신호 죽음»이다).
  process.once('SIGHUP', () => {
    restoreTty()
    process.kill(process.pid, 'SIGHUP')
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
        // 천천히 보내는 붙여넣기의 조각 사이(iTerm2 «Paste Slowly» 125ms)보다 넉넉히 길고, 물음이 늦는 값으로는 사람이 못 느낀다.
        drainMs: 300,
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
