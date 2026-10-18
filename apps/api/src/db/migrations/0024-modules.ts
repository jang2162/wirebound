import type { Kysely, Migration } from 'kysely'
import { sql } from 'kysely'

/**
 * `modules` 테이블 — 설계 spec `2026-10-18-modules-states-layout-design.md` 「B3. 모듈」 · 「B4. 프리셋을 걷는다」.
 *
 * 모듈은 프로젝트의 모든 페이지에 넣는 노드 묶음이다. 페이지 통째 템플릿이던 `presets` 를 대신하고, 그 행을 옮긴 뒤 `presets` 를 지운다.
 *
 * | 칸 | 무엇 |
 * |---|---|
 * | `nodes` | `WbNode[]` — 넣으면 고른 자리의 형제가 될 것. 모양은 저장 경계(`routes/modules.ts` 의 zod)가 지킨다 |
 * | `name` | 1 ~ 60자. **유일 제약이 없다** — 고르는 것은 id 다(`0010-presets` 머리말과 같은 판단) |
 * | `created_by` | `ON DELETE RESTRICT` — `presets.created_by` · `snapshots.created_by` 와 같은 까닭 |
 * | `project_id` | `ON DELETE CASCADE` — 모듈은 프로젝트가 소유한다. 프로젝트 삭제는 CASCADE 전에 이 행을 잡는다(`lockProjectModules`) |
 * | `created_at` · `updated_at` | `clock_timestamp()` — 한 트랜잭션에서 만든 행도 차례가 갈린다(`0010-presets` 머리말 «목록 순서»). `updated_at` 은 이름 바꾸기가 고친다 |
 *
 * ---
 *
 * # 프리셋 옮기기
 *
 * `presets` 행마다 같은 프로젝트 · 같은 이름 · 같은 만든 사람 · 같은 `created_at` 의 모듈 하나. 노드는 이렇게 옮긴다:
 *
 * | 프리셋에 있던 것 | 모듈에서 |
 * |---|---|
 * | `description` | 버린다 — 모듈에 설명 칸이 없다 |
 * | `view_states` | 버린다 — 모듈에는 상태가 없다 |
 * | 상태 영역(`StateSwitch`) | **기본 가지(`StateCase.props.state === 'default'`)의 자식만** 영역 자리에 차례로 꺼낸다(안쪽 영역도 같은 규칙). 기본 가지가 없는 영역은 빈 자리다 |
 * | 버린 가지 안을 겨냥하던 노드 액션 | 뺀다 — 모듈 밖을 가리키는 액션을 걷는 저장 규칙(`@wirebound/schema` 의 `moduleNodesForSave`)과 같다 |
 * | `marker` | 프리셋 저장이 이미 걷었다(`routes/presets.ts` 의 `stripMarkers`). 여기서도 걷는다 — 손으로 넣은 행이 있을 수 있다 |
 *
 * **규칙을 이 파일 안에 적는다 — `@wirebound/schema` 를 import 하지 않는다.** 마이그레이션은 그 판의 규칙으로 얼어 있어야 한다:
 * schema 가 뒤에 상태 영역을 걷거나(V3) 거름을 바꾸면 이 파일이 옛 DB 에서 다른 결과를 낸다. 다른 마이그레이션도 schema 에 기대지 않는다.
 *
 * **`down` 은 모듈에서 프리셋을 다시 짓지 않는다** — 빈 `presets`(0021 판의 칸)를 만들고 `modules` 를 지운다. 풀어 버린 가지 · 설명 · 상태
 * 목록은 되돌릴 수 없다(그래서 다시 지어도 옛 프리셋이 아니다). `test/global-setup.ts` 가 매 실행 latest → none → latest 를 왕복하므로 빈
 * `presets` 위에서 0021 · 0010 의 `down` 이 돈다.
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('modules')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('project_id', 'uuid', (col) => col.notNull().references('projects.id').onDelete('cascade'))
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('nodes', 'jsonb', (col) => col.notNull())
      .addColumn('created_by', 'uuid', (col) => col.notNull().references('users.id').onDelete('restrict'))
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`clock_timestamp()`))
      .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`clock_timestamp()`))
      .execute()
    await db.schema.createIndex('modules_project_created_idx').on('modules').columns(['project_id', 'created_at']).execute()

    const presets = await sql<PresetRow>`
      select id, project_id, name, schema, created_by, created_at from presets order by created_at asc, id asc
    `.execute(db)
    for (const preset of presets.rows) {
      const nodes = presetToModuleNodes(preset.schema)
      await sql`
        insert into modules (project_id, name, nodes, created_by, created_at, updated_at)
        values (${preset.project_id}, ${preset.name}, ${JSON.stringify(nodes)}::jsonb, ${preset.created_by}, ${preset.created_at}, ${preset.created_at})
      `.execute(db)
    }

    await db.schema.dropTable('presets').execute()
  },

  async down(db: Kysely<unknown>): Promise<void> {
    // 0010 · 0021 판의 `presets` 그대로 — 그 둘의 `down` 이 이 표를 지운다.
    await db.schema
      .createTable('presets')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('project_id', 'uuid', (col) => col.notNull().references('projects.id').onDelete('cascade'))
      .addColumn('name', 'text', (col) => col.notNull())
      .addColumn('description', 'text')
      .addColumn('schema', 'jsonb', (col) => col.notNull())
      .addColumn('created_by', 'uuid', (col) => col.notNull().references('users.id').onDelete('restrict'))
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`clock_timestamp()`))
      .addColumn('updated_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`clock_timestamp()`))
      .addColumn('view_states', 'jsonb')
      .execute()
    await db.schema.createIndex('presets_project_created_idx').on('presets').columns(['project_id', 'created_at']).execute()
    await db.schema.dropTable('modules').execute()
  },
}

interface PresetRow {
  id: string
  project_id: string
  name: string
  schema: unknown
  created_by: string
  created_at: Date
}

/** 이 판의 노드 꼴 — 이 파일이 읽는 키만. 나머지 키는 그대로 옮긴다. */
interface RawNode {
  id?: unknown
  type?: unknown
  props?: { state?: unknown } & Record<string, unknown>
  marker?: unknown
  interactions?: { actions?: { type?: unknown; target?: unknown }[] }[]
  children?: unknown[]
  [key: string]: unknown
}

const STATE_SWITCH = 'StateSwitch'
const STATE_CASE = 'StateCase'
const DEFAULT_CASE = 'default'
/** 페이지를 겨냥하는 액션 — 이 판의 `isPageTargetAction`. 나머지는 노드를 겨냥한다. */
const PAGE_TARGET_ACTIONS = new Set(['navigate', 'openModal'])

function isNode(value: unknown): value is RawNode {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** 프리셋 노드 배열 → 모듈 노드 배열(머리말 표). 배열이 아니면 빈 묶음이다(저장 경계가 막았지만 손으로 넣은 행). */
export function presetToModuleNodes(schema: unknown): unknown[] {
  if (!Array.isArray(schema)) return []
  const unwrapped = unwrapList(schema)
  const inside = new Set<string>()
  const collect = (node: unknown): void => {
    if (!isNode(node)) return
    if (typeof node.id === 'string') inside.add(node.id)
    node.children?.forEach(collect)
  }
  unwrapped.forEach(collect)
  return unwrapped.map((node) => pruneActions(node, inside))
}

/** 목록 안의 상태 영역을 기본 가지의 자식으로 바꿔 펼친다 — 안쪽 영역도. */
function unwrapList(list: readonly unknown[]): unknown[] {
  return list.flatMap((node) => {
    if (!isNode(node)) return [node]
    if (node.type === STATE_SWITCH) {
      const fallback = (node.children ?? []).find(
        (child) => isNode(child) && child.type === STATE_CASE && child.props?.state === DEFAULT_CASE,
      )
      return isNode(fallback) ? unwrapList(fallback.children ?? []) : []
    }
    const next: RawNode = { ...node }
    delete next.marker
    if (Array.isArray(node.children)) next.children = unwrapList(node.children)
    return [next]
  })
}

/** 묶음 밖 노드를 겨냥하는 액션을 뺀다 — 다 빠진 상호작용은 상호작용째, 다 빠진 `interactions` 는 키째. */
function pruneActions(node: unknown, inside: ReadonlySet<string>): unknown {
  if (!isNode(node)) return node
  const next: RawNode = { ...node }
  if (Array.isArray(node.interactions)) {
    const interactions = node.interactions.flatMap((interaction) => {
      if (!Array.isArray(interaction.actions)) return [interaction]
      const actions = interaction.actions.filter((action) => {
        if (typeof action.target !== 'string' || action.target.trim() === '') return true
        if (typeof action.type === 'string' && PAGE_TARGET_ACTIONS.has(action.type)) return true
        return inside.has(action.target)
      })
      if (actions.length === interaction.actions.length) return [interaction]
      return actions.length > 0 ? [{ ...interaction, actions }] : []
    })
    if (interactions.length > 0 || node.interactions.length === 0) next.interactions = interactions
    else delete next.interactions
  }
  if (Array.isArray(node.children)) next.children = node.children.map((child) => pruneActions(child, inside))
  return next
}
