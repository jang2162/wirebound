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
 * | 코드가 아는 것 중 빠진 것이 있고, 전부 마지막으로 올라간 이름 뒤다(뒤처졌다) | **안 뜬다** — `migrate`를 권한다 | 뜨면 그 칸을 쓰는 요청마다 500 이다 |
 * | 빠진 것 중 마지막으로 올라간 이름보다 **앞** 이름이 있다(순서가 어긋났다 — 두 갈래가 이름을 엇갈려 올렸다) | **안 뜬다** — `migrate`를 권하지 않는다 | kysely `Migrator`는 올라간 것이 코드 목록(`sort()` — 코드 단위 순)의 앞머리일 때만 돈다(`allowUnorderedMigrations` 없이 — `db/migrate.ts`). 이 코드로는 `migrate`도 `migrate:down`도 `corrupted migrations`로 죽는다(잰 값: 이 워크트리 DB 의 `kysely_migration`에서 가운데 행 하나를 지우고 `pnpm migrate` · `pnpm migrate:down`). 그래서 이름을 뒤로 바꾸거나 그것이 없던 코드로 내리라고 말한다 |
 * | 코드가 모르는 것도 들었다(앞섰다 — 새 브랜치가 올린 DB 에 옛 코드) | **뜬다** — 경고 한 줄 | 뒤에 붙는 마이그레이션은 대개 칸 · 표를 더할 뿐이라 옛 코드가 그대로 돈다. 멈추고 `migrate:down`을 권하면 그 칸의 데이터를 버리게 시킨다(`README.md` «`migrate:down` 은 … 데이터를 버린다»). 새 칸이 `NOT NULL`이면 옛 코드의 쓰기가 거절된다 — 그래서 말은 한다 |
 * | 둘 다(빠진 것도 모르는 것도 있다) | **안 뜬다** | 다른 갈래가 올린 DB 다 — `migrate`도 «이미 올라간 것이 코드에 없다»로 죽는다 |
 *
 * **못 읽으면 견주지 않는다**(`undefined`) — DB 가 아직 안 떠 있어도 서버는 뜬다(풀은 게으르다). 뜬 뒤의 `이 서버가 보는 DB:` 줄이
 * «읽지 못했습니다»를 말한다(`describeSchemaState`).
 *
 * # 올린 시각의 순서
 *
 * 위 표는 이름만 본다. kysely 는 올라간 것을 **이름이 아니라 `timestamp` 순**(같으면 이름)으로 읽어 코드 목록의 앞머리와 견준다
 * (`Migrator`의 `#getExecutedMigrations` · `#ensureMigrationsInOrder`). `timestamp` 는 올린 프로세스의 시계다 — 시계가 뒤처진
 * 호스트가 다음 것을 올리면 이름은 맞는데 시각 순이 어긋난다. 그 DB 는 스키마가 다 올라가 있어 **서버는 뜨고**(멈추면 멀쩡한 DB 를
 * 기동 장애로 만든다) **다음 `migrate` · `migrate:down` 이 `corrupted migrations` 로 죽는다** — 그 문장은 시계를 말하지 않는다.
 * 그래서 기동이 **경고 한 줄**로 미리 말한다(`timestampOrderSlip`). 판정이 멈추는 판이어도 먼저 말한다 — 멈춤 문장이 권하는
 * `migrate` 가 같은 까닭으로 죽는다.
 *
 * 잰 값: 이 워크트리 DB 에서 `0016` 의 `timestamp` 를 `2000-01-01T00:00:00.000Z` 로 당기면 `tsx src/main.ts` 가 경고 없이 뜨고
 * (health 200) `migrate` 가 `expected previously executed migration 0016-api-tokens-user-idx to be at index 0` 로 죽는다.
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
  return (await readExecutedMigrationTimes(db))?.map((row) => row.name)
}

export interface ExecutedMigration {
  readonly name: string
  readonly timestamp: string
}

/** 올라간 마이그레이션의 이름과 `timestamp`(이름 오름차순). 표가 없으면 빈 배열이다. 못 읽으면 `undefined`. */
export async function readExecutedMigrationTimes(db: DbHandle): Promise<ExecutedMigration[] | undefined> {
  try {
    const exists = await sql<{ present: boolean }>`select to_regclass(${MIGRATION_TABLE}) is not null as present`.execute(db)
    if (!exists.rows[0]?.present) return []
    const { rows } = await sql<ExecutedMigration>`select name, timestamp from ${sql.table(MIGRATION_TABLE)} order by name`.execute(db)
    return rows.map((row) => ({ name: row.name, timestamp: row.timestamp }))
  } catch {
    return undefined
  }
}

/**
 * **kysely 가 읽는 순서(올린 시각 순)와 이름 순이 처음 갈리는 자리** — 안 갈리면 `null`. 순서는 kysely 의 비교를 그대로 옮겼다:
 * `timestamp` 글자가 같으면 이름을 `localeCompare`, 다르면 `Date` 로 읽은 시각의 차. 이름 순은 kysely 가 코드 목록을 세우는
 * `sort()`(코드 단위)다. 머리말 「올린 시각의 순서」.
 */
export function timestampOrderSlip(rows: readonly ExecutedMigration[]): { index: number; byTime: string; byName: string } | null {
  const byTime = [...rows]
    .sort((a, b) => (a.timestamp === b.timestamp ? a.name.localeCompare(b.name) : new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()))
    .map((row) => row.name)
  const byName = rows.map((row) => row.name).sort()
  const index = byTime.findIndex((name, i) => name !== byName[i])
  return index === -1 ? null : { index, byTime: byTime[index]!, byName: byName[index]! }
}

/** `timestampOrderSlip` 을 사람이 읽을 한 줄로. 자격 문자열은 안 싣는다. */
export function describeTimestampOrderSlip(slip: { index: number; byTime: string; byName: string }, databaseUrl: string): string {
  return `이 DB 의 마이그레이션 기록은 올린 시각 순서가 이름 순서와 다릅니다(${describeDatabaseTarget(databaseUrl)} · 시각 순으로 ${slip.index + 1}번째가 ${slip.byTime} — 이름 순이면 ${slip.byName}) — 다음 migrate · migrate:down 이 corrupted migrations 로 죽습니다. 시계가 뒤처진 호스트가 올린 기록입니다. kysely_migration 의 timestamp 를 이름 순으로 고치십시오`
}

export type SchemaVerdict =
  | { kind: 'current' }
  | { kind: 'empty' }
  | { kind: 'behind'; pending: string[] }
  /** `stranded` — 빠진 것 중 마지막으로 올라간 이름보다 앞의 것. `later` — 그중 가장 앞의 것보다 뒤 이름으로 이미 올라간 것. */
  | { kind: 'unordered'; stranded: string[]; later: string[] }
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
  if (pending.length > 0) {
    // 이름은 kysely 가 코드 목록을 세우는 순서(`sort()` — 코드 단위)로 견준다. 로캘 비교나 DB 의 `order by`(정렬 규칙)는 대소문자
    // · 기호에서 갈린다.
    const last = executed.reduce((a, b) => (b > a ? b : a))
    const stranded = pending.filter((name) => name < last).sort()
    if (stranded.length > 0) return { kind: 'unordered', stranded, later: executed.filter((name) => name > stranded[0]!).sort() }
    return { kind: 'behind', pending }
  }
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
    case 'unordered':
      return {
        stop: `이 DB 는 마이그레이션 순서가 어긋났습니다(${target} · 안 올라간 것: ${verdict.stranded.join(', ')} · 그보다 뒤 이름으로 이미 올라간 것: ${verdict.later.join(', ')}) — migrate 로는 안 올라갑니다(이 코드로는 migrate:down 도 같은 까닭으로 죽습니다). 뒤 이름들을 어느 갈래가 올렸는지 확인하고, 안 올라간 것의 이름을 ${verdict.later.at(-1)} 뒤로 바꾸거나 그것이 없던 코드로 migrate:down 해 뒤 이름들을 내린 뒤(그 데이터를 잃습니다) 이 코드로 migrate 하십시오`,
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

/**
 * 읽고 견주고, 안 뜨는 판이면 `SchemaVersionError`로 던진다. 뜨되 말할 것은 `warn`으로. 못 읽으면 조용히 지난다(머리말). 올린 시각의
 * 순서가 어긋났으면 판정보다 먼저 `warn` 한 줄이다(머리말 「올린 시각의 순서」).
 */
export async function assertSchemaVersion(db: DbHandle, databaseUrl: string, warn: (message: string) => void): Promise<void> {
  const rows = await readExecutedMigrationTimes(db)
  if (rows === undefined) return
  const slip = timestampOrderSlip(rows)
  if (slip !== null) warn(describeTimestampOrderSlip(slip, databaseUrl))
  const said = describeSchemaVerdict(schemaVerdict(rows.map((row) => row.name)), databaseUrl)
  if (said === null) return
  if ('stop' in said) throw new SchemaVersionError(said.stop)
  warn(said.warn)
}
