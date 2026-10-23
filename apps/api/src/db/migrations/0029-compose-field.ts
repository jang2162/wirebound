import { randomBytes } from 'node:crypto'
import type { Kysely, Migration } from 'kysely'
import { sql } from 'kysely'
import { liftDocument as liftToV3 } from './0028-node-zones'

/**
 * **문서 판 3 → 4 — 조합 입력**(설계 spec `2026-10-24-compose-input-design.md` 「문서 판 4」 · 사용자 결정 Q3 (가)). 칸은 바꾸지 않고 저장된 문서를
 * 옮긴다. **판 3 → 4 단계는 여기에만 있다** — 런타임 사슬(`@wirebound/schema` 의 `MIGRATIONS`)에는 없어, 이 마이그레이션 뒤 판 3 을 읽는 코드가
 * 서버에 남지 않는다(가져오기 · 클립보드의 판 3 은 거절된다).
 *
 * 옛 `Field` 는 `control`(입력 종류) · `placeholder` · `disabled` · `invalid` 를 prop 으로 들었다. 판 4 의 `Field` 는 `label` · `required` 만 들고 입력은
 * 값 칸(몸통 `children`)의 조각 노드다. `control` 마다(없으면 `text`, 모르는 값도 `text`):
 *
 * | `control` | 값 칸 |
 * |---|---|
 * | `text` | `Input` |
 * | `number` | `Input{kind:'number'}` |
 * | `select` | `Select`(선택지는 기본값) |
 * | `date` | `DateInput` |
 * | `dateRange` | `DateInput` · `Affix '~'` · `DateInput` — 안내 문구는 안 옮긴다(두 칸에 같은 글이 선다) |
 * | `checkbox` | `CheckboxGroup` — 안내 문구 · 오류는 안 옮긴다(그 prop 이 없다) |
 * | `radio` | `RadioGroup` + `variant: 'radio'`(기본테마의 기본이 세그먼트라 옛 라디오 모양을 지킨다) — 안내 문구 · 오류는 안 옮긴다 |
 * | `textarea` | `TextArea` |
 * | `file` | `Input{readonly, placeholder:'선택된 파일 없음'}` · `Button '파일 선택'` — 옛 안내 문구는 안 옮긴다 |
 *
 * 그 prop 이 있는 조각에만 `placeholder`(빈 글이면 안 옮긴다 — 조각의 기본값) · `disabled`(참일 때) · `invalid`(참일 때)를 옮기고(`file` 의 단추는
 * `disabled` 만), `Field` 에서는 넷을 걷는다. 새 조각 id 는 그 문서(묶음)의 id 와 안 겹치게 새로 짓는다(`n_` + 소문자 hex 12자 — `0028` 과 같은 꼴).
 * 이미 값 칸에 노드가 든 `Field`(판 3 에는 없다)는 걷기만 하고 조각을 안 더한다.
 *
 * `setProp` 이 옮긴 `Field` 의 `placeholder` · `disabled` · `invalid` 를 바꾸던 액션은 그 prop 을 가진 조각(`HAS`)마다 하나씩, 조각 차례로 늘려 옮긴다
 * — 옛 액션은 필드 전체를 바꿨다(`dateRange` 의 두 날짜 칸 · `file` 의 입력과 단추가 함께 꺼진다). 묶음 안의 필드일 때만이고, 그 prop 을 가진 조각이
 * 없으면 그대로 둔다.
 * `control` 을 바꾸던 액션은 그대로 둔다 — 검증 경고 `invalid-interaction-prop` 이 그 자리를 말한다(바꿀 종류가 이제 노드의 타입이다).
 *
 * | 표 · 칸 | 옮기는 것 |
 * |---|---|
 * | `pages.schema` · `schema_version` | 판 3 문서마다 위 표 뒤 `version` · `schema_version` 을 4 로 |
 * | `layouts.schema` | 같은 함수 |
 * | `modules.nodes` · `personal_modules.nodes` | 노드 묶음에 같은 함수 |
 * | `snapshots.payload` 의 `pages[].schema` · `layouts[].schema` | 같은 함수 — 판 1 · 2 문서는 먼저 얼린 판 2 → 3(`0028` 의 `liftDocument`)을 탄다 |
 *
 * `revisions`(편집 이력)는 안 옮긴다 — 옮기기 전 편집의 되돌리기는 `/props/control` 등을 가리켜 건너뛰어진다. 옛 `Field` 는 자식이 없어 옛 좌표가
 * 값 칸의 조각을 가리킬 수 없다.
 *
 * **이 파일은 판 3 → 4 의 뜻으로 얼어 있다 — 고치지 않는다.** 아는 노드 키는 `type` · `props` · `children` · `interactions` · `zones` 뿐이다.
 *
 * **`down` 은 거절한다 — 되돌릴 수 없다**(`0028` 과 같다). 페이지 · 모듈 · 레이아웃 · 스냅샷이 하나라도 있으면 «백업에서 되돌린다»로 멈추고, 다
 * 비었으면 할 일이 없어 내려간다.
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    const pages = await sql<{ id: string; schema: unknown }>`select id, schema from pages order by id`.execute(db)
    for (const page of pages.rows) {
      const lifted = liftDocument(page.schema, page.id)
      if (lifted === null) continue
      await sql`update pages set schema = ${JSON.stringify(lifted)}::jsonb, schema_version = 4 where id = ${page.id}`.execute(db)
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
      `0029-compose-field 은 되돌릴 수 없습니다 — 문서를 판 4(값 칸을 가진 입력 필드)로 옮겼고 옛 코드는 판 4 를 읽지 못합니다 ` +
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

/** 옛 `Field` 가 들던 입력의 prop — 판 4 에서 조각으로 간다. */
const MOVED = ['control', 'placeholder', 'disabled', 'invalid'] as const

/** 조각 한 개의 씨앗 — 어느 옛 prop 을 받는지(`takes`)와 고정 props. */
interface Seed {
  type: string
  props?: Record<string, unknown>
  variant?: string
  takes: readonly ('placeholder' | 'disabled' | 'invalid')[]
}

const ALL = ['placeholder', 'disabled', 'invalid'] as const

/** 조각 타입마다 가진 옛 prop — `setProp` 을 옮길 자리를 고른다(판 4 카탈로그를 이 판의 뜻으로 얼린 사본). */
const HAS: Readonly<Record<string, readonly string[]>> = {
  Input: ALL,
  Select: ALL,
  DateInput: ALL,
  TextArea: ALL,
  CheckboxGroup: ['disabled'],
  RadioGroup: ['disabled'],
  Button: ['disabled'],
}

/** 이 판의 `control` → 조각 — 판 4 카탈로그를 이 판의 뜻으로 얼린 사본. */
const PIECES: Readonly<Record<string, readonly Seed[]>> = {
  text: [{ type: 'Input', takes: ALL }],
  number: [{ type: 'Input', props: { kind: 'number' }, takes: ALL }],
  select: [{ type: 'Select', takes: ALL }],
  date: [{ type: 'DateInput', takes: ALL }],
  dateRange: [
    { type: 'DateInput', takes: ['disabled', 'invalid'] },
    { type: 'Affix', props: { text: '~' }, takes: [] },
    { type: 'DateInput', takes: ['disabled', 'invalid'] },
  ],
  checkbox: [{ type: 'CheckboxGroup', takes: ['disabled'] }],
  radio: [{ type: 'RadioGroup', variant: 'radio', takes: ['disabled'] }],
  textarea: [{ type: 'TextArea', takes: ALL }],
  file: [
    { type: 'Input', props: { readonly: true, placeholder: '선택된 파일 없음' }, takes: ['disabled', 'invalid'] },
    { type: 'Button', props: { label: '파일 선택' }, takes: ['disabled'] },
  ],
}

/** 판 3 문서를 판 4 로 — 판 1 · 2 면 먼저 얼린 판 2 → 3(`0028`). 판 4 이상이거나 문서 꼴이 아니면 `null`(건드리지 않는다). */
export function liftDocument(schema: unknown, pageId: string | null): unknown {
  if (!isRecord(schema)) return null
  const version = schema.version
  if (typeof version !== 'number' || version >= 4) return null
  if (!isRecord(schema.root)) return null
  const doc = (version < 3 ? liftToV3(schema, pageId) : schema) as Raw
  const [root] = liftNodes([doc.root])
  return { ...doc, root, version: 4 }
}

/** 노드 묶음을 판 4 로(입력을 고치지 않는다). `setProp` 의 대상은 묶음 안의 필드일 때만 조각으로 옮긴다. */
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

  /** 옮긴 필드 id → 옛 prop 마다 그 prop 을 가진 조각 id(차례대로). */
  const movedTo = new Map<string, Partial<Record<string, string[]>>>()
  const liftNode = (node: unknown): unknown => {
    if (!isRecord(node)) return node
    const next: Raw = { ...node }
    if (Array.isArray(node.children)) next.children = node.children.map(liftNode)
    if (isRecord(node.zones)) {
      const zones: Record<string, unknown> = {}
      for (const [name, list] of Object.entries(node.zones)) zones[name] = Array.isArray(list) ? list.map(liftNode) : list
      next.zones = zones
    }
    if (node.type === 'Field') liftField(next, freshId, movedTo)
    return next
  }
  const lifted = nodes.map(liftNode)

  const retarget = (node: unknown): void => {
    if (!isRecord(node)) return
    if (Array.isArray(node.interactions)) {
      node.interactions = node.interactions.map((interaction) => {
        if (!isRecord(interaction) || !Array.isArray(interaction.actions)) return interaction
        return { ...interaction, actions: interaction.actions.flatMap((action) => setPropActions(action, movedTo)) }
      })
    }
    if (Array.isArray(node.children)) node.children.forEach(retarget)
    if (isRecord(node.zones)) for (const list of Object.values(node.zones)) if (Array.isArray(list)) list.forEach(retarget)
  }
  lifted.forEach(retarget)
  return lifted
}

/** 옛 필드 하나를 판 4 로(`next` 는 이미 사본이다). */
function liftField(next: Raw, freshId: () => string, movedTo: Map<string, Partial<Record<string, string[]>>>): void {
  const props: Record<string, unknown> = isRecord(next.props) ? { ...next.props } : {}
  const old = Object.fromEntries(MOVED.map((key) => [key, props[key]]))
  for (const key of MOVED) delete props[key]
  if (Object.keys(props).length === 0) delete next.props
  else next.props = props
  // 판 3 에는 값 칸이 없었다 — 노드가 든 필드는 판 4 의 것이라 조각을 더하지 않는다.
  if (Array.isArray(next.children) && next.children.length > 0) return

  const seeds = (typeof old.control === 'string' ? PIECES[old.control] : undefined) ?? PIECES.text!
  const piecesFor: Partial<Record<string, string[]>> = {}
  next.children = seeds.map((seed) => {
    const id = freshId()
    const pieceProps: Record<string, unknown> = { ...seed.props }
    if (seed.takes.includes('placeholder') && typeof old.placeholder === 'string' && old.placeholder !== '')
      pieceProps.placeholder = old.placeholder
    if (seed.takes.includes('disabled') && old.disabled === true) pieceProps.disabled = true
    if (seed.takes.includes('invalid') && old.invalid === true) pieceProps.invalid = true
    for (const key of HAS[seed.type] ?? []) (piecesFor[key] ??= []).push(id)
    return {
      id,
      type: seed.type,
      ...(Object.keys(pieceProps).length === 0 ? {} : { props: pieceProps }),
      ...(seed.variant === undefined ? {} : { variant: seed.variant }),
    }
  })
  if (typeof next.id === 'string') movedTo.set(next.id, piecesFor)
}

function setPropActions(action: unknown, movedTo: ReadonlyMap<string, Partial<Record<string, string[]>>>): unknown[] {
  if (!isRecord(action) || action.type !== 'setProp' || typeof action.target !== 'string' || typeof action.prop !== 'string')
    return [action]
  const pieces = movedTo.get(action.target)?.[action.prop]
  return pieces === undefined ? [action] : pieces.map((piece) => ({ ...action, target: piece }))
}

/** 스냅샷 payload 의 페이지 · 레이아웃 문서를 판 4 로 — 바꿀 것이 없으면 `null`. */
function liftPayload(payload: unknown): unknown {
  if (!isRecord(payload)) return null
  let changed = false
  const pages = Array.isArray(payload.pages)
    ? payload.pages.map((page) => {
        if (!isRecord(page)) return page
        const schema = liftDocument(page.schema, typeof page.id === 'string' ? page.id : null)
        if (schema === null) return page
        changed = true
        return { ...page, schema, schemaVersion: 4 }
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
