import { randomBytes } from 'node:crypto'
import type { Kysely, Migration } from 'kysely'
import { sql } from 'kysely'
import { liftStateRegions, MigrationError, type PageDocument } from '@wirebound/schema'

/**
 * **문서 판 2 → 3 — 노드 구역**(설계 spec `2026-10-23-node-slots-design.md` 「7. 문서 판」 · 사용자 결정 Q1 (가)). 칸은 바꾸지 않고 저장된 문서를
 * 옮긴다. **판 2 → 3 단계는 여기에만 있다** — 런타임 사슬(`@wirebound/schema` 의 `MIGRATIONS`)에는 없어, 이 마이그레이션 뒤 판 2 를 읽는 코드가
 * 서버에 남지 않는다(가져오기 · 클립보드의 판 2 는 거절된다).
 *
 * | 판 2 | 판 3 |
 * |---|---|
 * | `Tabs.props.tabs`(탭 이름 배열) · 자식 전부가 패널 하나 | 이름마다 `TabPanel`(`props.label`) 을 몸통에 · 옛 자식은 `active` 자리 패널(범위 밖이면 마지막 · 이름이 없으면 «탭» 패널 하나)에 · `tabs` 를 걷는다 |
 * | `switchTab { target: <Tabs>, tab: n }` | `{ target: <n 번째 패널> }` — 대상 탭을 못 찾거나 n 이 범위 밖이면 대상은 그대로(검증 경고 `invalid-interaction-target`) · `tab` 을 걷는다 |
 * | `SearchForm` · `EntryForm`(뷰에 박힌 단추) | `zones.actions` 에 기본 단추 둘 — 검색폼 «초기화» · «검색», 입력폼 «저장» · «취소»(카탈로그의 `initial` 을 이 판의 뜻으로 얼린 사본) |
 *
 * | 표 · 칸 | 옮기는 것 |
 * |---|---|
 * | `pages.schema` · `schema_version` | 판 2 문서마다 위 표 뒤 `version` · `schema_version` 을 3 으로 |
 * | `layouts.schema` | 같은 함수 |
 * | `modules.nodes` · `personal_modules.nodes` | 노드 묶음에 같은 함수(대상이 묶음 안일 때만 패널로) |
 * | `snapshots.payload` 의 `pages[].schema` · `layouts[].schema` | 같은 함수 — 판 1 문서는 먼저 얼린 판 1 → 2(`liftStateRegions`)를 탄다(스냅샷은 `0025` 가 안 옮겼다). 런타임 복원은 판 3 만 받는다 |
 *
 * `revisions`(편집 이력)는 안 옮긴다 — 옮기기 전 편집의 되돌리기는 `/props/tabs` 등을 가리켜 건너뛰어진다.
 *
 * **이 파일은 판 2 → 3 의 뜻으로 얼어 있다 — 고치지 않는다.** 아는 노드 키는 `type` · `props` · `children` · `interactions` · `zones` 뿐이고, 새 패널 ·
 * 단추의 id 는 그 문서(묶음)의 id 와 안 겹치게 새로 짓는다(`n_` + 소문자 hex 12자 — `createNodeId` 와 같은 꼴).
 *
 * **`down` 은 거절한다 — 되돌릴 수 없다**(`0025` 와 같다). 옛 코드는 판 3 문서를 `unsupported-version` 으로 막는다. 페이지 · 모듈 · 레이아웃 ·
 * 스냅샷이 하나라도 있으면 «백업에서 되돌린다»로 멈추고, 다 비었으면 할 일이 없어 내려간다.
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    const pages = await sql<{ id: string; schema: unknown }>`select id, schema from pages order by id`.execute(db)
    for (const page of pages.rows) {
      const lifted = liftDocument(page.schema, page.id)
      if (lifted === null) continue
      await sql`update pages set schema = ${JSON.stringify(lifted)}::jsonb, schema_version = 3 where id = ${page.id}`.execute(db)
    }

    const layouts = await sql<{ id: string; schema: unknown }>`select id, schema from layouts order by id`.execute(db)
    for (const layout of layouts.rows) {
      const lifted = liftDocument(layout.schema, null)
      if (lifted === null) continue
      await sql`update layouts set schema = ${JSON.stringify(lifted)}::jsonb where id = ${layout.id}`.execute(db)
    }

    for (const table of ['modules', 'personal_modules'] as const) {
      const rows = await sql<{ id: string; nodes: unknown }>`select id, nodes from ${sql.table(table)} order by id`.execute(db)
      for (const row of rows.rows) {
        if (!Array.isArray(row.nodes)) continue
        const before = JSON.stringify(row.nodes)
        const after = JSON.stringify(liftNodes(row.nodes))
        if (after === before) continue
        await sql`update ${sql.table(table)} set nodes = ${after}::jsonb where id = ${row.id}`.execute(db)
      }
    }

    const snapshots = await sql<{ id: string; payload: unknown }>`select id, payload from snapshots order by id`.execute(db)
    for (const row of snapshots.rows) {
      const next = liftPayload(row.payload)
      if (next === null) continue
      await sql`update snapshots set payload = ${JSON.stringify(next)}::jsonb where id = ${row.id}`.execute(db)
    }
  },

  async down(db: Kysely<unknown>): Promise<void> {
    const left = await sql<{ pages: string; modules: string; personal: string; layouts: string; snapshots: string }>`
      select (select count(*) from pages) as pages, (select count(*) from modules) as modules,
        (select count(*) from personal_modules) as personal, (select count(*) from layouts) as layouts,
        (select count(*) from snapshots) as snapshots
    `.execute(db)
    const counts = left.rows[0]!
    const total = [counts.pages, counts.modules, counts.personal, counts.layouts, counts.snapshots].reduce((sum, n) => sum + Number(n), 0)
    if (total === 0) return
    throw new Error(
      `0028-node-zones 은 되돌릴 수 없습니다 — 문서를 판 3(노드 구역 · 탭 패널)으로 옮겼고 옛 코드는 판 3 을 읽지 못합니다 ` +
        `(페이지 ${counts.pages} · 모듈 ${counts.modules} · 개인 모듈 ${counts.personal} · 레이아웃 ${counts.layouts} · 스냅샷 ${counts.snapshots}). 백업에서 되돌린다.`,
    )
  },
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

/** 이 판의 폼 기본 단추 — 카탈로그 `initial` 의 판 3 사본(얼린다). */
const FORM_BUTTONS: Readonly<Record<string, readonly string[]>> = {
  SearchForm: ['초기화', '검색'],
  EntryForm: ['저장', '취소'],
}

/** 판 2 문서를 판 3 으로 — 판 1 이면 먼저 얼린 판 1 → 2. 판 3 이상이거나 문서 꼴이 아니면 `null`(건드리지 않는다). */
export function liftDocument(schema: unknown, pageId: string | null): unknown {
  if (!isRecord(schema)) return null
  const version = schema.version
  if (typeof version !== 'number' || version >= 3) return null
  if (!isRecord(schema.root)) return null
  let doc: Raw = schema
  if (version < 2) {
    try {
      doc = { ...(liftStateRegions(schema as unknown as PageDocument).doc as unknown as Raw), version: 2 }
    } catch (error) {
      if (error instanceof MigrationError && pageId !== null) throw new MigrationError(error.nodeId, pageId)
      throw error
    }
  }
  const [root] = liftNodes([doc.root])
  return { ...doc, root, version: 3 }
}

/** 노드 묶음을 판 3 으로(입력을 고치지 않는다). 탭 바꾸기의 대상은 묶음 안의 탭일 때만 패널로 옮긴다. */
export function liftNodes(nodes: readonly unknown[]): unknown[] {
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

  /** 옛 탭 id → 패널 id 들(이름 차례). */
  const panelsOf = new Map<string, string[]>()
  const liftNode = (node: unknown): unknown => {
    if (!isRecord(node)) return node
    const next: Raw = { ...node }
    if (Array.isArray(node.children)) next.children = node.children.map(liftNode)
    if (isRecord(node.zones)) {
      const zones: Record<string, unknown> = {}
      for (const [name, list] of Object.entries(node.zones)) zones[name] = Array.isArray(list) ? list.map(liftNode) : list
      next.zones = zones
    }
    if (node.type === 'Tabs') liftTabs(next, freshId, panelsOf)
    const labels = typeof node.type === 'string' ? FORM_BUTTONS[node.type] : undefined
    if (labels !== undefined) {
      const zones: Record<string, unknown> = isRecord(next.zones) ? { ...next.zones } : {}
      if (!Array.isArray(zones.actions) || zones.actions.length === 0) {
        zones.actions = labels.map((label) => ({ id: freshId(), type: 'Button', props: { label } }))
      }
      next.zones = zones
    }
    return next
  }
  const lifted = nodes.map(liftNode)

  const retarget = (node: unknown): void => {
    if (!isRecord(node)) return
    if (Array.isArray(node.interactions)) {
      node.interactions = node.interactions.map((interaction) => {
        if (!isRecord(interaction) || !Array.isArray(interaction.actions)) return interaction
        return { ...interaction, actions: interaction.actions.map((action) => switchTabAction(action, panelsOf)) }
      })
    }
    if (Array.isArray(node.children)) node.children.forEach(retarget)
    if (isRecord(node.zones)) for (const list of Object.values(node.zones)) if (Array.isArray(list)) list.forEach(retarget)
  }
  lifted.forEach(retarget)
  return lifted
}

/** 옛 탭 하나를 패널로(`next` 는 이미 사본이다). 이미 패널을 든 탭(판 3)은 그대로 둔다 — 판 2 에는 `TabPanel` 타입이 없다. */
function liftTabs(next: Raw, freshId: () => string, panelsOf: Map<string, string[]>): void {
  if (
    Array.isArray(next.children) &&
    next.children.length > 0 &&
    next.children.every((child) => isRecord(child) && child.type === 'TabPanel')
  )
    return
  const props: Record<string, unknown> = isRecord(next.props) ? { ...next.props } : {}
  const names = Array.isArray(props.tabs) ? props.tabs.map((name) => String(name)) : ['탭 1', '탭 2']
  delete props.tabs
  next.props = props
  const labels = names.length > 0 ? names : ['탭']
  const active = typeof props.active === 'number' && Number.isInteger(props.active) && props.active >= 0 ? props.active : 0
  const host = Math.min(active, labels.length - 1)
  const old = Array.isArray(next.children) ? next.children : []
  const panels = labels.map((label, index) => {
    const panel: Raw = { id: freshId(), type: 'TabPanel', props: { label } }
    if (index === host && old.length > 0) panel.children = old
    return panel
  })
  next.children = panels
  if (typeof next.id === 'string')
    panelsOf.set(
      next.id,
      panels.map((panel) => panel.id as string),
    )
}

function switchTabAction(action: unknown, panelsOf: ReadonlyMap<string, string[]>): unknown {
  if (!isRecord(action) || action.type !== 'switchTab') return action
  const { tab, ...rest } = action
  const panels = typeof rest.target === 'string' ? panelsOf.get(rest.target) : undefined
  const panel = panels !== undefined && typeof tab === 'number' && Number.isInteger(tab) && tab >= 0 ? panels[tab] : undefined
  return panel === undefined ? rest : { ...rest, target: panel }
}

/** 스냅샷 payload 의 페이지 · 레이아웃 문서를 판 3 으로 — 바꿀 것이 없으면 `null`. */
function liftPayload(payload: unknown): unknown {
  if (!isRecord(payload)) return null
  let changed = false
  const pages = Array.isArray(payload.pages)
    ? payload.pages.map((page) => {
        if (!isRecord(page)) return page
        const schema = liftDocument(page.schema, typeof page.id === 'string' ? page.id : null)
        if (schema === null) return page
        changed = true
        return { ...page, schema, schemaVersion: 3 }
      })
    : payload.pages
  const layouts = Array.isArray(payload.layouts)
    ? payload.layouts.map((layout) => {
        if (!isRecord(layout)) return layout
        const schema = liftDocument(layout.schema, null)
        if (schema === null) return layout
        changed = true
        return { ...layout, schema }
      })
    : payload.layouts
  return changed ? { ...payload, pages, layouts } : null
}
