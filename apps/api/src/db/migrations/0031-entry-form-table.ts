import { randomBytes } from 'node:crypto'
import type { Kysely, Migration } from 'kysely'
import { sql } from 'kysely'

/**
 * **입력폼 몸통의 필드를 폼 표로 감싼다**(설계 spec `2026-10-25-form-table-design.md` 「`0031-entry-form-table`」 · 사용자 결정 Q2 (가)). 문서 판은
 * 그대로 4 다 — 칸이 바뀌지 않고 노드의 자리만 바뀐다.
 *
 * `EntryForm` 몸통(`children`)에서 **잇단 `Field` 의 묶음마다** 그 묶음을 `FormTable`(props · 구역 없음 = 1 열) 하나로 감싼다. `Field` 가 아닌 몸통
 * 자식은 그 자리에 두고 묶음을 끊는다. 필드 노드는 그대로 옮긴다(id · props · 값 칸 · 몫 · 표지 · 별칭 · 상태 보임 · 상호작용). 몫은 1 열 표에서
 * 1 로 잘려 화면이 그대로다. 새 폼 표 id 는 그 문서(묶음)의 id 와 안 겹치게 새로 짓는다(`n_` + 소문자 hex 12자 — `0028` · `0029` 와 같은 꼴).
 *
 * | 표 · 칸 | 옮기는 것 |
 * |---|---|
 * | `pages.schema` | 감싼 문서마다 `head_seq` · `structure_seq` 를 하나 올린다(아래) |
 * | `layouts.schema` | 같은 함수 |
 * | `modules.nodes` · `personal_modules.nodes` | 노드 묶음에 같은 함수 |
 * | `snapshots.payload` 의 `pages[].schema` · `layouts[].schema` | 같은 함수 |
 *
 * **`head_seq` 를 올린다** — 감싼 뒤 옛 좌표(`…/children/1`)가 다른 노드를 가리킨다. 옮기기 전 판을 바탕으로 한 편집(열어 둔 탭 · 에이전트가 쥔
 * `baseSeq`)이 그 좌표로 엉뚱한 노드를 고치지 않고 `stale` 로 거절되게 한다. 그 번호의 `revisions` 행은 없다 — 이력은 `seq < 커서` 로 읽어 구멍에
 * 막히지 않는다. 옮기기 전 편집의 되돌리기는 옛 좌표라 건너뛰거나 거절된다(`0028` 과 같다). 레이아웃 · 모듈 표에는 판 열이 없다(통째 바꾸기).
 *
 * **`down` 은 이 마이그레이션이 지은 꼴의 폼 표를 푼다** — 입력폼 몸통에 바로 선 폼 표 가운데 노드 칸이 `id` · `type` · `children` 뿐이고(제목 · 열 ·
 * 구역 · 몫 · 별칭 · 상태 보임 · 표지 · 상호작용 없음) 자식이 하나 이상 다 `Field` 인 것. 사람이 지은 같은 꼴의 표도 풀린다 — 배포된 서비스가 없어
 * 받는다. 푼 페이지의 `head_seq` 도 올린다.
 *
 * **이 파일은 이 판의 뜻으로 얼어 있다 — 고치지 않는다.** 아는 노드 키는 `type` · `children` · `zones` 뿐이다.
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await rewrite(db, wrapNodes)
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await rewrite(db, unwrapNodes)
  },
}

type Step = (nodes: readonly unknown[]) => unknown[]

async function rewrite(db: Kysely<unknown>, step: Step): Promise<void> {
  const pages = await sql<{ id: string; schema: unknown }>`select id, schema from pages order by id`.execute(db)
  for (const page of pages.rows) {
    const next = rewriteDocument(page.schema, step)
    if (next === null) continue
    // 오른쪽의 `head_seq` 는 옛 값이다 — 두 칸이 같은 새 번호가 된다.
    await sql`
      update pages set schema = ${JSON.stringify(next)}::jsonb, head_seq = head_seq + 1, structure_seq = head_seq + 1 where id = ${page.id}
    `.execute(db)
  }

  const layouts = await sql<{ id: string; schema: unknown }>`select id, schema from layouts order by id`.execute(db)
  for (const layout of layouts.rows) {
    const next = rewriteDocument(layout.schema, step)
    if (next === null) continue
    await sql`update layouts set schema = ${JSON.stringify(next)}::jsonb where id = ${layout.id}`.execute(db)
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
    const next = rewritePayload(row.payload, step)
    if (next === null) continue
    await sql`update snapshots set payload = ${JSON.stringify(next)}::jsonb where id = ${row.id}`.execute(db)
  }
}

interface Raw {
  id?: unknown
  type?: unknown
  children?: unknown
  zones?: unknown
  [key: string]: unknown
}

function isRecord(value: unknown): value is Raw {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** 문서 하나를 옮긴 사본 — 바꿀 것이 없거나 문서 꼴이 아니면 `null`(건드리지 않는다). */
export function rewriteDocument(schema: unknown, step: Step): unknown {
  if (!isRecord(schema) || !isRecord(schema.root)) return null
  const [root] = step([schema.root])
  if (JSON.stringify(root) === JSON.stringify(schema.root)) return null
  return { ...schema, root }
}

/** 노드 묶음 안의 입력폼마다 잇단 필드를 폼 표로 감싼다(입력을 고치지 않는다). */
export function wrapNodes(nodes: readonly unknown[]): unknown[] {
  const taken = new Set<string>()
  const collect = (node: unknown): void => {
    if (!isRecord(node)) return
    if (typeof node.id === 'string') taken.add(node.id)
    if (Array.isArray(node.children)) node.children.forEach(collect)
    if (isRecord(node.zones)) for (const list of Object.values(node.zones)) if (Array.isArray(list)) list.forEach(collect)
  }
  nodes.forEach(collect)
  const freshId = (): string => {
    for (;;) {
      const id = `n_${randomBytes(6).toString('hex')}`
      if (!taken.has(id)) {
        taken.add(id)
        return id
      }
    }
  }
  const isField = (node: unknown): boolean => isRecord(node) && node.type === 'Field'
  return visit(nodes, (node) => {
    if (node.type !== 'EntryForm' || !Array.isArray(node.children) || !node.children.some(isField)) return
    const body: unknown[] = []
    let run: unknown[] = []
    const close = () => {
      if (run.length > 0) body.push({ id: freshId(), type: 'FormTable', children: run })
      run = []
    }
    for (const child of node.children) {
      if (isField(child)) run.push(child)
      else {
        close()
        body.push(child)
      }
    }
    close()
    node.children = body
  })
}

/** `down` — 입력폼 몸통에 바로 선, 이 마이그레이션이 지은 꼴의 폼 표를 그 자리에 푼다. */
export function unwrapNodes(nodes: readonly unknown[]): unknown[] {
  const made = (node: unknown): node is Raw & { children: unknown[] } =>
    isRecord(node) &&
    node.type === 'FormTable' &&
    Object.keys(node).every((key) => key === 'id' || key === 'type' || key === 'children') &&
    Array.isArray(node.children) &&
    node.children.length > 0 &&
    node.children.every((child) => isRecord(child) && child.type === 'Field')
  return visit(nodes, (node) => {
    if (node.type !== 'EntryForm' || !Array.isArray(node.children) || !node.children.some(made)) return
    node.children = node.children.flatMap((child) => (made(child) ? child.children : [child]))
  })
}

/** 노드 묶음의 사본을 아래에서 위로 걸으며 노드마다 `change`(사본을 고친다)를 부른다. */
function visit(nodes: readonly unknown[], change: (node: Raw) => void): unknown[] {
  const walk = (node: unknown): unknown => {
    if (!isRecord(node)) return node
    const next: Raw = { ...node }
    if (Array.isArray(node.children)) next.children = node.children.map(walk)
    if (isRecord(node.zones)) {
      const zones: Record<string, unknown> = {}
      for (const [name, list] of Object.entries(node.zones)) zones[name] = Array.isArray(list) ? list.map(walk) : list
      next.zones = zones
    }
    change(next)
    return next
  }
  return nodes.map(walk)
}

/** 스냅샷 payload 의 페이지 · 레이아웃 문서 — 바꿀 것이 없으면 `null`. */
function rewritePayload(payload: unknown, step: Step): unknown {
  if (!isRecord(payload)) return null
  let changed = false
  const each = (list: unknown) =>
    Array.isArray(list)
      ? list.map((entry) => {
          if (!isRecord(entry)) return entry
          const schema = rewriteDocument(entry.schema, step)
          if (schema === null) return entry
          changed = true
          return { ...entry, schema }
        })
      : list
  const pages = each(payload.pages)
  const layouts = each(payload.layouts)
  return changed ? { ...payload, pages, layouts } : null
}
