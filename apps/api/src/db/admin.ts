/**
 * **인스턴스 관리자 명령 — 서버에 손이 닿는 사람이 관리자를 주고 거둔다.**
 *
 * ```bash
 * pnpm --filter @wirebound/api admin grant me@example.com
 * pnpm --filter @wirebound/api admin revoke me@example.com
 * pnpm --filter @wirebound/api admin list
 * ```
 *
 * 관리자는 테마 패키지를 올리고 숨긴다(spec `docs/superpowers/specs/2026-09-27-code-themes-design.md` 「인스턴스 관리자」).
 * **API 에는 관리자를 만들거나 바꾸는 라우트가 없다** — 주는 길은 이 명령과 시딩의 `SEED_USER_ADMIN`(`db/seed-user.ts`)뿐이다.
 * 올라온 테마 코드는 같은 origin 에서 신뢰 코드로 돌므로, 그 권한을 요청으로 넓힐 수 있으면 신뢰 경계가 없어진다.
 *
 * 종료 코드: 0 바꿨다(또는 `list`) · 1 바꾸지 않았다 · 2 인자가 어긋났다(사용법).
 *
 * **거두기(`revoke`)는 행 하나를 고치는 `UPDATE` 다** — 관리자 쓰기가 커밋 직전에 그 행을 `FOR SHARE` 로 다시 읽으므로 둘이 줄을 선다
 * (`repos/users.ts` 의 `setInstanceAdmin`). 거둔 뒤 커밋되는 업로드 · 숨김은 없다. 그 사람의 세션은 그대로다 — 관리자 판정은 요청마다
 * DB 에서 읽으므로 다음 요청부터 403 이다.
 */
import { pathToFileURL } from 'node:url'
import { getKoreanErrorMap } from '@wirebound/schema'
import { NormalizedEmail } from '../auth/credentials'
import { loadConfig } from '../config'
import { listInstanceAdmins, setInstanceAdmin } from '../repos/users'
import { createDb, createPool } from './client'
import { describeDatabaseTarget } from './describe-target'
import type { DbHandle } from './tx'

export interface AdminIo {
  log: (line: string) => void
  error: (line: string) => void
}

const USAGE = '사용법: pnpm --filter @wirebound/api admin grant <이메일> | revoke <이메일> | list'
const NOTHING_CHANGED = '아무것도 바꾸지 않았습니다.'

/** 명령 한 번 — 종료 코드를 돌려준다. 대상 DB 를 먼저 말한다(워크트리마다 DB 가 갈린다 — `db/describe-target.ts`). */
export async function runAdmin(rawArgs: readonly string[], target: { db: DbHandle; databaseUrl: string }, io: AdminIo): Promise<number> {
  // `pnpm … admin -- grant <이메일>` 처럼 pnpm 인자 관습으로 붙인 `--` 는 인자가 아니다.
  const args = rawArgs[0] === '--' ? rawArgs.slice(1) : rawArgs
  const [verb, ...rest] = args
  const valid = (verb === 'list' && rest.length === 0) || ((verb === 'grant' || verb === 'revoke') && rest.length === 1)
  if (!valid) {
    io.error(USAGE)
    return 2
  }

  if (verb === 'list') {
    io.log(`인스턴스 관리자 대상 DB: ${describeDatabaseTarget(target.databaseUrl)}`)
    const emails = await listInstanceAdmins(target.db)
    if (emails.length === 0) io.log('관리자가 없습니다')
    for (const email of emails) io.log(email)
    return 0
  }

  const raw = rest[0]!
  const parsed = NormalizedEmail.safeParse(raw.trim(), { error: getKoreanErrorMap() })
  if (!parsed.success) {
    io.error(`이메일 형식이 아닙니다: ${raw} — ${NOTHING_CHANGED}`)
    return 1
  }
  const email = parsed.data
  io.log(`인스턴스 관리자 대상 DB: ${describeDatabaseTarget(target.databaseUrl)}`)
  const outcome = await setInstanceAdmin(target.db, email, verb === 'grant')
  if (outcome === 'missing') {
    io.error(`그 이메일의 계정이 없습니다(${email}) — ${NOTHING_CHANGED}`)
    return 1
  }
  if (outcome === 'unchanged') {
    io.error(`${verb === 'grant' ? '이미 관리자입니다' : '관리자가 아닙니다'} — ${NOTHING_CHANGED}`)
    return 1
  }
  io.log(verb === 'grant' ? `관리자로 만들었습니다 — ${email}` : `관리자를 거뒀습니다 — ${email}`)
  return 0
}

async function main(): Promise<void> {
  const config = loadConfig()
  const db = createDb(createPool(config.databaseUrl, () => undefined, config.dbTimeLimits))
  try {
    process.exitCode = await runAdmin(
      process.argv.slice(2),
      { db, databaseUrl: config.databaseUrl },
      { log: (line) => console.log(line), error: (line) => console.error(line) },
    )
  } catch (error) {
    // 문장 하나(`UPDATE`)가 커밋에 닿았는지 이 프로세스는 모른다 — «안 바꿨다»고 말하지 않는다.
    console.error(`DB 오류로 끝났습니다(${error instanceof Error ? error.message : String(error)}) — 바뀌었는지 \`admin list\` 로 봅니다`)
    process.exitCode = 1
  } finally {
    await db.destroy()
  }
}

// `migrate.ts` 와 같은 판정 — 경로에 공백 · 한글이 있어도 CLI 로 불렸을 때만 돈다.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  void main()
}
