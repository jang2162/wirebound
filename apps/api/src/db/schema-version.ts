/**
 * **이 코드가 아는 마이그레이션과 DB 에 올라간 것을 견준다** — `main.ts`가 `buildApp` 앞에서 부른다.
 *
 * api 는 뜰 때 마이그레이션을 올리지 않는다(`migrate`가 따로 있다). 견주지 않으면 **하나 뒤처진 DB 에도 뜨고** 그 마이그레이션이
 * 더한 칸을 쓰는 첫 요청이 500 이다(잰 값: 이 워크트리의 DB 를 `migrate:down` 으로 하나 내리고 `tsx src/main.ts` — `마이그레이션
 * 14건`으로 뜨고 코멘트 게시가 500 `column "revision_seq" … does not exist`).
 *
 * | DB | 판정 | 까닭 |
 * |---|---|---|
 * | 코드가 아는 것을 전부 들었다 | 뜬다 | — |
 * | 하나도 없다 | **안 뜬다** — 빈 DB 라고 말한다(`describe-schema-state.ts`의 `emptySchemaHint`) | 새 볼륨이면 정상이지만 데이터가 다른 볼륨에 있을 수도 있다 |
 * | 코드가 아는 것 중 빠진 것이 있다(뒤처졌다) | **안 뜬다** — `migrate`를 권한다 | 뜨면 그 칸을 쓰는 요청마다 500 이다 |
 * | 코드가 모르는 것도 들었다(앞섰다 — 새 브랜치가 올린 DB 에 옛 코드) | **뜬다** — 경고 한 줄 | 뒤에 붙는 마이그레이션은 대개 칸 · 표를 더할 뿐이라 옛 코드가 그대로 돈다. 멈추고 `migrate:down`을 권하면 그 칸의 데이터를 버리게 시킨다(`README.md` «`migrate:down` 은 … 데이터를 버린다»). 새 칸이 `NOT NULL`이면 옛 코드의 쓰기가 거절된다 — 그래서 말은 한다 |
 * | 둘 다(빠진 것도 모르는 것도 있다) | **안 뜬다** | 다른 갈래가 올린 DB 다 — `migrate`도 «이미 올라간 것이 코드에 없다»로 죽는다 |
 *
 * **못 읽으면 견주지 않는다**(`undefined`) — DB 가 아직 안 떠 있어도 서버는 뜬다(풀은 게으르다). 뜬 뒤의 `이 서버가 보는 DB:` 줄이
 * «읽지 못했습니다»를 말한다(`describeSchemaState`).
 */
import { sql } from 'kysely'
import { describeDatabaseTarget } from './describe-target'
import { emptySchemaHint } from './describe-schema-state'
import { MIGRATIONS } from './migrations/index'
import type { DbHandle } from './tx'

/** kysely 의 기본 마이그레이션 표(`Migrator`에 이름을 안 줬다 — `db/migrate.ts`). */
const MIGRATION_TABLE = 'kysely_migration'

/** DB 에 올라간 마이그레이션 이름들(오름차순). 표가 없으면 빈 배열이다. 못 읽으면 `undefined`. */
export async function readExecutedMigrations(db: DbHandle): Promise<string[] | undefined> {
  try {
    const exists = await sql<{ present: boolean }>`select to_regclass(${MIGRATION_TABLE}) is not null as present`.execute(db)
    if (!exists.rows[0]?.present) return []
    const { rows } = await sql<{ name: string }>`select name from ${sql.table(MIGRATION_TABLE)} order by name`.execute(db)
    return rows.map((row) => row.name)
  } catch {
    return undefined
  }
}

export type SchemaVerdict =
  | { kind: 'current' }
  | { kind: 'empty' }
  | { kind: 'behind'; pending: string[] }
  | { kind: 'ahead'; unknown: string[] }
  | { kind: 'diverged'; pending: string[]; unknown: string[] }

/** 머리말의 표. `known`은 이 코드가 아는 이름이다(`MIGRATIONS`의 키). */
export function schemaVerdict(executed: readonly string[], known: readonly string[] = Object.keys(MIGRATIONS)): SchemaVerdict {
  if (executed.length === 0) return { kind: 'empty' }
  const ran = new Set(executed)
  const knows = new Set(known)
  const pending = known.filter((name) => !ran.has(name))
  const unknown = executed.filter((name) => !knows.has(name))
  if (pending.length > 0 && unknown.length > 0) return { kind: 'diverged', pending, unknown }
  if (pending.length > 0) return { kind: 'behind', pending }
  if (unknown.length > 0) return { kind: 'ahead', unknown }
  return { kind: 'current' }
}

/**
 * 판정을 사람이 읽을 말로. **안 뜨는 판이면 `stop`**(그 글로 던진다), 뜨되 말할 것이 있으면 `warn`이다. 자격 문자열은 안 싣는다 —
 * `describeDatabaseTarget`을 지난 값만 든다.
 */
export function describeSchemaVerdict(verdict: SchemaVerdict, databaseUrl: string): { stop: string } | { warn: string } | null {
  const target = describeDatabaseTarget(databaseUrl)
  switch (verdict.kind) {
    case 'current':
      return null
    case 'empty':
      return { stop: emptySchemaHint(0, databaseUrl)! }
    case 'behind':
      return {
        stop: `이 DB 는 마이그레이션이 뒤처졌습니다(${target} · 안 올라간 것: ${verdict.pending.join(', ')}) — 올린 뒤에 띄우십시오: pnpm --filter @wirebound/api migrate`,
      }
    case 'ahead':
      return {
        warn: `이 DB 에는 이 코드가 모르는 마이그레이션이 올라가 있습니다(${target} · ${verdict.unknown.join(', ')}) — 더 새 코드가 올린 DB 입니다. 그대로 뜹니다. 쓰기가 거절되면 그 코드로 띄우십시오(내리면 그 마이그레이션의 데이터를 잃습니다)`,
      }
    case 'diverged':
      return {
        stop: `이 DB 는 다른 갈래가 올린 마이그레이션을 들고 있습니다(${target} · 이 코드가 모르는 것: ${verdict.unknown.join(', ')} · 이 코드의 것 중 안 올라간 것: ${verdict.pending.join(', ')}) — 그 갈래의 코드로 띄우거나 이 코드의 DB 를 따로 쓰십시오`,
      }
  }
}

/** 기동을 멈추는 판정 — `main.ts`가 이것만 한 줄로 찍는다(스택 없이). */
export class SchemaVersionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SchemaVersionError'
  }
}

/** 읽고 견주고, 안 뜨는 판이면 `SchemaVersionError`로 던진다. 뜨되 말할 것은 `warn`으로. 못 읽으면 조용히 지난다(머리말). */
export async function assertSchemaVersion(db: DbHandle, databaseUrl: string, warn: (message: string) => void): Promise<void> {
  const executed = await readExecutedMigrations(db)
  if (executed === undefined) return
  const said = describeSchemaVerdict(schemaVerdict(executed), databaseUrl)
  if (said === null) return
  if ('stop' in said) throw new SchemaVersionError(said.stop)
  warn(said.warn)
}
