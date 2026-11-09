import type { Kysely, Migration } from 'kysely'
import { sql } from 'kysely'
import { liftTreeNodes } from '@wirebound/schema'

/**
 * **`Tree` 의 항목을 계층으로 옮기고 문서 판을 5 → 6 으로 올린다.** 옮기는 규칙은 `@wirebound/schema` 의 `migrate-tree-items.ts` 머리말 표가 갖는다
 * (판 5 의 화면 그대로 — 항목 i 의 단 `i % depth` · 단 L 은 앞의 가장 가까운 단 L − 1 의 자식 · 모두 펼침 · `depth` 를 걷는다). 이 파일은 그
 * 함수(`liftTreeNodes`)를 저장된 문서가 사는 자리마다 부른다 — 같은 단계가 런타임 사슬(`migrateDocument`)에도 있어 판 5 로 들어오는 입구(페이지
 * JSON 가져오기 · 클립보드 · REST 의 판 5 문서)가 같은 값을 얻는다.
 *
 * | 표 · 칸 | 옮기는 것 |
 * |---|---|
 * | `pages.schema` · `schema_version` | 판 5 문서마다 판 6 으로. `Tree` 를 옮긴 문서는 `head_seq` · `structure_seq` 를 하나 올린다(아래) |
 * | `layouts.schema` | 같은 함수 |
 * | `modules.nodes` · `personal_modules.nodes` | 노드 묶음에 같은 함수(판 칸이 없다) |
 * | `snapshots.payload` 의 `pages[]` · `layouts[]` | 같은 함수 · 페이지의 `schemaVersion` 도 6 으로 |
 *
 * **`head_seq` 를 올린다** — 옮긴 뒤 옛 좌표(`…/props/items/0` 이 글이던 자리 · `…/props/depth`)가 다른 것을 가리킨다. 옮기기 전 판을 바탕으로 한
 * 편집(열어 둔 탭 · 에이전트가 쥔 `baseSeq`)이 `stale` 로 거절되게 한다(`0032` 와 같다 — 그 번호의 `revisions` 행은 없다). 판 번호만 오른 문서는
 * 좌표가 그대로라 안 올린다.
 *
 * **`down` 은 판 6 문서를 판 5 로 내린다 — 계층을 잃는다.** 항목을 위에서 아래로 편 글 목록과 가장 깊은 단을 `depth`(1 – 5)로 짓는다 — 판 5 화면은
 * `i % depth` 로 단을 지어 옮기기 전 계층을 다시 못 낸다. 펼침도 버린다(판 5 에 없다). 내린 문서의 `head_seq` 도 올린다. 배포된 서비스가 없어 받는다.
 *
 * **이 파일은 판 5 → 6 의 뜻으로 얼어 있다 — 고치지 않는다.**
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await rewrite(db, 5, 6, (nodes) => liftTreeNodes(nodes).nodes)
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await rewrite(db, 6, 5, lowerNodes)
  },
}

type Step = (nodes: readonly unknown[]) => unknown[]

async function rewrite(db: Kysely<unknown>, from: number, to: number, step: Step): Promise<void> {
  const pages = await sql<{ id: string; schema: unknown }>`select id, schema from pages order by id`.execute(db)
  for (const page of pages.rows) {
    const next = rewriteDocument(page.schema, from, to, step)
    if (next === null) continue
    if (next.moved) {
      // 오른쪽의 `head_seq` 는 옛 값이다 — 두 칸이 같은 새 번호가 된다.
      await sql`
        update pages set schema = ${JSON.stringify(next.doc)}::jsonb, schema_version = ${to},
          head_seq = head_seq + 1, structure_seq = head_seq + 1 where id = ${page.id}
      `.execute(db)
    } else {
      await sql`update pages set schema = ${JSON.stringify(next.doc)}::jsonb, schema_version = ${to} where id = ${page.id}`.execute(db)
    }
  }

  const layouts = await sql<{ id: string; schema: unknown }>`select id, schema from layouts order by id`.execute(db)
  for (const layout of layouts.rows) {
    const next = rewriteDocument(layout.schema, from, to, step)
    if (next === null) continue
    await sql`update layouts set schema = ${JSON.stringify(next.doc)}::jsonb where id = ${layout.id}`.execute(db)
  }

  for (const table of ['modules', 'personal_modules'] as const) {
    const rows = await sql<{ id: string; nodes: unknown }>`select id, nodes from ${sql.table(table)} order by id`.execute(db)
    for (const row of rows.rows) {
      if (!Array.isArray(row.nodes)) continue
      const before = JSON.stringify(row.nodes)
      const after = JSON.stringify(step(row.nodes))
      if (after === before) continue
      await sql`update ${sql.table(table)} set nodes = ${after}::jsonb where id = ${row.id}`.execute(db)
    }
  }

  const snapshots = await sql<{ id: string; payload: unknown }>`select id, payload from snapshots order by id`.execute(db)
  for (const row of snapshots.rows) {
    const next = rewritePayload(row.payload, from, to, step)
    if (next === null) continue
    await sql`update snapshots set payload = ${JSON.stringify(next)}::jsonb where id = ${row.id}`.execute(db)
  }
}

interface Raw {
  type?: unknown
  props?: unknown
  children?: unknown
  zones?: unknown
  [key: string]: unknown
}

function isRecord(value: unknown): value is Raw {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** 판 `from` 문서 하나를 판 `to` 로 옮긴 사본과 노드가 바뀌었는지(`moved`). 그 판이 아니거나 문서 꼴이 아니면 `null`(건드리지 않는다). */
function rewriteDocument(schema: unknown, from: number, to: number, step: Step): { doc: unknown; moved: boolean } | null {
  if (!isRecord(schema) || schema.version !== from || !isRecord(schema.root)) return null
  const [root] = step([schema.root])
  return { doc: { ...schema, root, version: to }, moved: JSON.stringify(root) !== JSON.stringify(schema.root) }
}

function rewritePayload(payload: unknown, from: number, to: number, step: Step): unknown {
  if (!isRecord(payload)) return null
  let changed = false
  const each = (list: unknown, page: boolean) =>
    Array.isArray(list)
      ? list.map((entry) => {
          if (!isRecord(entry)) return entry
          const next = rewriteDocument(entry.schema, from, to, step)
          if (next === null) return entry
          changed = true
          return { ...entry, schema: next.doc, ...(page ? { schemaVersion: to } : {}) }
        })
      : list
  const pages = each(payload.pages, true)
  const layouts = each(payload.layouts, false)
  return changed ? { ...payload, pages, layouts } : null
}

/** 판 6 의 항목을 위에서 아래로 편 글 목록과 가장 깊은 단(맨 위가 1). 꼴이 깨진 원소는 버린다. */
function flatten(items: unknown): { labels: string[]; depth: number } {
  const labels: string[] = []
  let depth = 1
  const walk = (list: unknown, level: number): void => {
    if (!Array.isArray(list)) return
    for (const item of list) {
      if (!isRecord(item)) continue
      labels.push(typeof item.label === 'string' ? item.label : '')
      depth = Math.max(depth, level)
      walk(item.children, level + 1)
    }
  }
  walk(items, 1)
  return { labels, depth: Math.min(depth, 5) }
}

/** 노드 묶음 안의 `Tree` 를 판 5 꼴로(입력을 고치지 않는다) — 몸통과 모든 구역을 걷는다. */
function lowerNodes(nodes: readonly unknown[]): unknown[] {
  const walk = (node: unknown): unknown => {
    if (!isRecord(node)) return node
    const next: Raw = { ...node }
    if (Array.isArray(node.children)) next.children = node.children.map(walk)
    if (isRecord(node.zones)) {
      const zones: Record<string, unknown> = {}
      for (const [name, list] of Object.entries(node.zones)) zones[name] = Array.isArray(list) ? list.map(walk) : list
      next.zones = zones
    }
    if (node.type !== 'Tree' || !isRecord(node.props) || !Array.isArray(node.props.items)) return next
    const { labels, depth } = flatten(node.props.items)
    next.props = { ...node.props, items: labels, depth }
    return next
  }
  return nodes.map(walk)
}
