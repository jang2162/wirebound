import { randomBytes } from 'node:crypto'
import type { Kysely, Migration } from 'kysely'
import { sql } from 'kysely'

/**
 * **`List` 를 `DataGrid` 로 옮기고 문서 판을 4 → 5 로 올린다**(설계 spec `2026-10-25-grid-design.md` 「`0032-list-data-grid`」 · 사용자 결정 Q5 (가)).
 *
 * 판 4 문서마다 `version` 을 5 로 올리고, 그 안의 `List` 노드를 같은 id 의 `DataGrid` 로 바꾼다:
 *
 * | 옛 `List` | 새 `DataGrid` |
 * |---|---|
 * | id · 별칭 · 표지 · 상태 보임 · 상호작용 · 몫 · 변형 · `headStart` · `headEnd` | 그대로 |
 * | `columns: string[]` | 열마다 `GridColumn { label }` + 셀 틀 `Text «—»` |
 * | `items: n` | `n ≥ 1` 이면 `GridRow { repeat: n }` 하나(50 에서 자른다), 0 이면 행 없음 |
 * | `pagination: true` | `footer` 에 `Pagination` |
 * | `selectable: true` | `select: 'check'` |
 * | `selected: true` · `disabled: true` | 그 행의 `tone` `selected` · `dimmed`(둘 다면 `selected`) |
 * | `loading` · `empty` | 그대로 |
 *
 * 옛 prop 의 기본값(`columns` 셋 · `items` 5 · `pagination` 참)은 노드에 없을 때 쓴다 — 옛 카탈로그가 그 값으로 그렸다. `setProp` 액션은
 * `selectable` 만 `select`(`true` → `check` · `false` → `none`)로 옮기고, 나머지 옛 prop(`items` · `columns` · …)을 바꾸던 액션은 그대로 둔다 —
 * 검증 경고 `invalid-interaction-prop` 이 그 자리를 말한다(`0029` 의 `control` 과 같다). 새 노드 id 는 그 문서(묶음)의 id 와 안 겹치게 새로
 * 짓는다(`n_` + 소문자 hex 12자 — `0028` · `0029` · `0031` 과 같은 꼴).
 *
 * | 표 · 칸 | 옮기는 것 |
 * |---|---|
 * | `pages.schema` · `schema_version` | 판 4 문서마다 판 5 로. `List` 를 옮긴 문서는 `head_seq` · `structure_seq` 를 하나 올린다(아래) |
 * | `layouts.schema` | 같은 함수 |
 * | `modules.nodes` · `personal_modules.nodes` | 노드 묶음에 같은 함수(판 칸이 없다) |
 * | `snapshots.payload` 의 `pages[]` · `layouts[]` | 같은 함수 · 페이지의 `schemaVersion` 도 5 로 |
 *
 * **`head_seq` 를 올린다** — 옮긴 뒤 옛 좌표(`…/props/columns`)가 없는 칸을 가리킨다. 옮기기 전 판을 바탕으로 한 편집(열어 둔 탭 · 에이전트가 쥔
 * `baseSeq`)이 `stale` 로 거절되게 한다(`0031` 과 같다 — 그 번호의 `revisions` 행은 없다). 판 번호만 오른 문서는 좌표가 그대로라 안 올린다.
 *
 * **`down` 은 판 5 문서를 판 4 로 내린다** — `DataGrid` 를 같은 id 의 `List` 로 다시 짓는다(열 이름 · 행 수(데이터 행 `repeat` 합) · `select` ·
 * 바닥의 `Pagination` 유무 · 첫 데이터 행의 꼴). 셀 틀 · 제 칸 · 열 묶음(그 안 열의 이름은 묶음 차례로 편다) · 열 props · 바의 props 는 버리고,
 * 그리드 밖의 `Pagination` 은 걷는다(판 4 에 없는 타입이다 — 배포된 서비스가 없어 받는다). 내린 문서의 `head_seq` 도 올린다.
 *
 * **이 파일은 판 4 → 5 의 뜻으로 얼어 있다 — 고치지 않는다.** 아는 노드 키는 `type` · `props` · `children` · `zones` · `interactions` 뿐이다.
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await rewrite(db, 4, 5, liftNodes)
  },

  async down(db: Kysely<unknown>): Promise<void> {
    await rewrite(db, 5, 4, lowerNodes)
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
  id?: unknown
  type?: unknown
  props?: unknown
  children?: unknown
  zones?: unknown
  interactions?: unknown
  [key: string]: unknown
}

function isRecord(value: unknown): value is Raw {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/**
 * 판 `from` 문서 하나를 판 `to` 로 옮긴 사본과 노드가 바뀌었는지(`moved`). 그 판이 아니거나 문서 꼴이 아니면 `null`(건드리지 않는다).
 */
export function rewriteDocument(schema: unknown, from: number, to: number, step: Step): { doc: unknown; moved: boolean } | null {
  if (!isRecord(schema) || schema.version !== from || !isRecord(schema.root)) return null
  const [root] = step([schema.root])
  return { doc: { ...schema, root, version: to }, moved: JSON.stringify(root) !== JSON.stringify(schema.root) }
}

/** 묶음 안 노드 id 를 모아 그것과 안 겹치는 새 id 를 짓는 함수를 낸다. */
function idMaker(nodes: readonly unknown[]): () => string {
  const taken = new Set<string>()
  const collect = (node: unknown): void => {
    if (!isRecord(node)) return
    if (typeof node.id === 'string') taken.add(node.id)
    if (Array.isArray(node.children)) node.children.forEach(collect)
    if (isRecord(node.zones)) for (const list of Object.values(node.zones)) if (Array.isArray(list)) list.forEach(collect)
  }
  nodes.forEach(collect)
  return () => {
    for (;;) {
      const id = `n_${randomBytes(6).toString('hex')}`
      if (!taken.has(id)) {
        taken.add(id)
        return id
      }
    }
  }
}

/** 옛 카탈로그의 `List` 기본값 — 노드에 그 prop 이 없으면 옛 화면은 이 값으로 그렸다. */
const LIST_DEFAULTS = { columns: ['컬럼 1', '컬럼 2', '컬럼 3'], items: 5, pagination: true }

/** 새 `GridRow.repeat` 의 상한. */
const REPEAT_MAX = 50

/** 노드 묶음 안의 `List` 를 `DataGrid` 로(입력을 고치지 않는다). 옮긴 노드를 가리키는 `selectable` 액션도 옮긴다. */
export function liftNodes(nodes: readonly unknown[]): unknown[] {
  const freshId = idMaker(nodes)
  const moved = new Set<string>()
  const lifted = visit(nodes, (node) => {
    if (node.type !== 'List') return
    const props = isRecord(node.props) ? node.props : {}
    const columns = Array.isArray(props.columns) ? props.columns : LIST_DEFAULTS.columns
    const items = typeof props.items === 'number' && Number.isInteger(props.items) ? props.items : LIST_DEFAULTS.items
    const pagination = typeof props.pagination === 'boolean' ? props.pagination : LIST_DEFAULTS.pagination
    const tone = props.selected === true ? 'selected' : props.disabled === true ? 'dimmed' : null

    const grid: Record<string, unknown> = {}
    if (props.selectable === true) grid.select = 'check'
    if (typeof props.loading === 'boolean') grid.loading = props.loading
    if (typeof props.empty === 'boolean') grid.empty = props.empty

    node.type = 'DataGrid'
    if (Object.keys(grid).length > 0) node.props = grid
    else delete node.props
    node.children = columns
      .filter((label): label is string => typeof label === 'string')
      .map((label) => ({
        id: freshId(),
        type: 'GridColumn',
        props: { label },
        children: [{ id: freshId(), type: 'Text', props: { content: '—' } }],
      }))
    const zones: Record<string, unknown> = isRecord(node.zones) ? { ...node.zones } : {}
    if (items >= 1) {
      zones.rows = [{ id: freshId(), type: 'GridRow', props: { repeat: Math.min(items, REPEAT_MAX), ...(tone === null ? {} : { tone }) } }]
    }
    if (pagination) zones.footer = [{ id: freshId(), type: 'Pagination' }]
    if (Object.keys(zones).length > 0) node.zones = zones
    if (typeof node.id === 'string') moved.add(node.id)
  })
  return renameSetProp(lifted, moved, 'selectable', (value) => ({ prop: 'select', value: value === true ? 'check' : 'none' }))
}

/** 묶음 안에서 `targets` 를 가리키는 `setProp` 가운데 prop 이 `prop` 인 액션을 `to` 로 바꾼다. */
function renameSetProp(
  nodes: unknown[],
  targets: ReadonlySet<string>,
  prop: string,
  to: (value: unknown) => { prop: string; value: unknown },
): unknown[] {
  if (targets.size === 0) return nodes
  return visit(nodes, (node) => {
    if (!Array.isArray(node.interactions)) return
    node.interactions = node.interactions.map((interaction) => {
      if (!isRecord(interaction) || !Array.isArray(interaction.actions)) return interaction
      return {
        ...interaction,
        actions: interaction.actions.map((action) =>
          isRecord(action) &&
          action.type === 'setProp' &&
          typeof action.target === 'string' &&
          targets.has(action.target) &&
          action.prop === prop
            ? { ...action, ...to(action.value) }
            : action,
        ),
      }
    })
  })
}

/**
 * `down` — 노드 묶음 안의 `DataGrid` 를 같은 id 의 `List` 로, 그리드 밖의 `Pagination` 은 걷는다(입력을 고치지 않는다). 내린 노드를 가리키는
 * `select` 액션은 `selectable` 로 되돌린다.
 */
export function lowerNodes(nodes: readonly unknown[]): unknown[] {
  const lowered: string[] = []
  const out = visit(nodes, (node) => {
    // 먼저 걷는다 — 그리드의 바닥은 아래 갈래가 통째로 버린다.
    if (Array.isArray(node.children)) node.children = node.children.filter(notPagination)
    if (isRecord(node.zones) && node.type !== 'DataGrid') {
      const zones: Record<string, unknown> = {}
      for (const [name, list] of Object.entries(node.zones)) zones[name] = Array.isArray(list) ? list.filter(notPagination) : list
      node.zones = zones
    }
    if (node.type !== 'DataGrid') return
    const props = isRecord(node.props) ? node.props : {}
    const zones = isRecord(node.zones) ? node.zones : {}
    const rows = (Array.isArray(zones.rows) ? zones.rows : []).filter(
      (row): row is Raw => isRecord(row) && (!isRecord(row.props) || row.props.kind === undefined || row.props.kind === 'data'),
    )
    const repeatOf = (row: Raw): number =>
      isRecord(row.props) && typeof row.props.repeat === 'number' && Number.isInteger(row.props.repeat) ? row.props.repeat : 1
    const firstTone = rows.length > 0 && isRecord(rows[0]!.props) ? rows[0]!.props.tone : undefined
    const footer = Array.isArray(zones.footer) ? zones.footer : []

    const list: Record<string, unknown> = {
      columns: leafLabels(Array.isArray(node.children) ? node.children : []),
      items: rows.reduce((sum, row) => sum + repeatOf(row), 0),
      pagination: footer.some((child) => isRecord(child) && child.type === 'Pagination'),
    }
    if (props.select === 'check' || props.select === 'radio') list.selectable = true
    if (firstTone === 'selected') list.selected = true
    if (firstTone === 'dimmed') list.disabled = true
    if (typeof props.loading === 'boolean') list.loading = props.loading
    if (typeof props.empty === 'boolean') list.empty = props.empty

    node.type = 'List'
    node.props = list
    if (typeof node.id === 'string') lowered.push(node.id)
    delete node.children
    const kept: Record<string, unknown> = {}
    for (const name of ['headStart', 'headEnd'] as const) {
      const list = zones[name]
      if (list !== undefined) kept[name] = Array.isArray(list) ? list.filter(notPagination) : list
    }
    if (Object.keys(kept).length > 0) node.zones = kept
    else delete node.zones
  })
  return renameSetProp(out.filter(notPagination), new Set(lowered), 'select', (value) => ({ prop: 'selectable', value: value !== 'none' }))
}

function notPagination(node: unknown): boolean {
  return !(isRecord(node) && node.type === 'Pagination')
}

/** 열 · 열 묶음 줄의 잎 열 이름(묶음 안은 그 차례로 편다). 이름이 없으면 옛 기본 이름 «컬럼». */
function leafLabels(columns: readonly unknown[]): string[] {
  return columns.flatMap((column) => {
    if (!isRecord(column)) return []
    if (column.type === 'GridColumnGroup') return leafLabels(Array.isArray(column.children) ? column.children : [])
    if (column.type !== 'GridColumn') return []
    const label = isRecord(column.props) ? column.props.label : undefined
    return [typeof label === 'string' ? label : '컬럼']
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
