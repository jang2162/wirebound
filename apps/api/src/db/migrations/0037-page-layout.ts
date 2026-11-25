import type { Kysely, Migration } from 'kysely'
import { sql } from 'kysely'
import { liftPageLayout } from '@wirebound/schema'

/**
 * **페이지 문서에 레이아웃(`layout`)을 채우고 문서 판을 6 → 7 로 올린다.** 채우는 규칙은 `@wirebound/schema` 의 `migrate-page-layout.ts` 가 갖는다
 * (판 6 의 화면 그대로 — 뿌리 `Popup` 이면 `popup`, 그 밖은 `blank`). 이 파일은 그 함수(`liftPageLayout`)를 저장된 페이지 문서가 사는 자리마다
 * 부른다 — 같은 단계가 런타임 사슬(`migrateDocument`)에도 있어 판 6 으로 들어오는 입구(페이지 JSON 가져오기 · 클립보드 · REST 의 판 6 문서)가 같은
 * 값을 얻는다.
 *
 * | 표 · 칸 | 옮기는 것 |
 * |---|---|
 * | `pages.schema` · `schema_version` | 판 6 문서마다 판 7 로 |
 * | `snapshots.payload` 의 `pages[]` | 같은 함수 · 페이지의 `schemaVersion` 도 7 로 |
 * | `modules.nodes` · `personal_modules.nodes` | 옮길 것이 없다 — 노드 묶음이라 레이아웃과 무관하다 |
 * | `layouts.schema` · payload 의 `layouts[]` | 옮기지 않는다 — 레이아웃 문서는 페이지 레이아웃을 갖지 않는다(그 표는 다음 마이그레이션이 걷는다) |
 *
 * **`head_seq` 를 안 올린다** — 있던 경로가 하나도 안 바뀐다(`/layout` 은 새 자리다). 판 6 바탕의 편집(열어 둔 탭 · 에이전트가 쥔 `baseSeq`)은
 * 그대로 적용된다.
 *
 * **`down` 은 `layout` 을 지우고 판 6 으로 내린다.** 뿌리가 짝이라 잃는 것은 빈 · 서브페이지의 구별뿐이다(판 6 에 `subpage` 의 뜻이 없다).
 *
 * **이 파일은 판 6 → 7 의 뜻으로 얼어 있다 — 고치지 않는다.**
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await rewrite(db, 6, 7, (doc) => liftPageLayout(doc as never) as Raw)
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await rewrite(db, 7, 6, ({ layout: _layout, ...rest }) => rest)
  },
}

interface Raw {
  version?: unknown
  root?: unknown
  [key: string]: unknown
}

type Step = (doc: Raw) => Raw

function isRecord(value: unknown): value is Raw {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function rewrite(db: Kysely<unknown>, from: number, to: number, step: Step): Promise<void> {
  const pages = await sql<{ id: string; schema: unknown }>`select id, schema from pages order by id`.execute(db)
  for (const page of pages.rows) {
    const next = rewriteDocument(page.schema, from, to, step)
    if (next === null) continue
    await sql`update pages set schema = ${JSON.stringify(next)}::jsonb, schema_version = ${to} where id = ${page.id}`.execute(db)
  }

  const snapshots = await sql<{ id: string; payload: unknown }>`select id, payload from snapshots order by id`.execute(db)
  for (const row of snapshots.rows) {
    const next = rewritePayload(row.payload, from, to, step)
    if (next === null) continue
    await sql`update snapshots set payload = ${JSON.stringify(next)}::jsonb where id = ${row.id}`.execute(db)
  }
}

/** 판 `from` 문서 하나를 판 `to` 로 옮긴 사본. 그 판이 아니거나 문서 꼴이 아니면 `null`(건드리지 않는다). */
function rewriteDocument(schema: unknown, from: number, to: number, step: Step): Raw | null {
  if (!isRecord(schema) || schema.version !== from || !isRecord(schema.root)) return null
  return { ...step(schema), version: to }
}

function rewritePayload(payload: unknown, from: number, to: number, step: Step): unknown {
  if (!isRecord(payload) || !Array.isArray(payload.pages)) return null
  let changed = false
  const pages = payload.pages.map((entry: unknown) => {
    if (!isRecord(entry)) return entry
    const next = rewriteDocument(entry.schema, from, to, step)
    if (next === null) return entry
    changed = true
    return { ...entry, schema: next, schemaVersion: to }
  })
  return changed ? { ...payload, pages } : null
}
