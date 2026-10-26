import type { Kysely, Migration } from 'kysely'
import { sql } from 'kysely'

/**
 * **«팝업 열기»(`openModal`)가 가리키는 페이지를 팝업 페이지(뿌리 `Popup`)로 옮긴다**(설계 spec `2026-10-26-popup-attach-repeat-design.md` 「3」 ·
 * 사용자 결정 Q2 (가)). 문서 판은 올리지 않는다(5 그대로) — 새 타입을 쓸 뿐 옛 문서의 뜻은 같고, 어느 페이지가 대상인지는 프로젝트 전체를 봐야
 * 알아 판 단계(`migrate-document.ts`)로는 못 한다.
 *
 * | 자리 | 하는 일 |
 * |---|---|
 * | `pages.schema` | 그 프로젝트의 `openModal` 대상 글자를 모아(페이지 · 레이아웃 · 프로젝트 모듈 · 그 프로젝트 멤버의 개인 모듈) 그 프로젝트 트리로 풀어, 한 페이지로 풀리는 것의 뿌리를 옮긴다 |
 * | `snapshots.payload` 의 `pages[]` | 같은 셈을 payload 안의 메뉴 · 페이지 · 레이아웃으로 — 복원하면 팝업으로 되살아난다 |
 * | `layouts` · 두 모듈 표 · `revisions` | 대상을 모으려고 읽기만 한다 — 레이아웃 뿌리는 늘 `Page` 이고, 모듈은 뿌리를 안 든다. 옛 편집은 몸통 좌표가 그대로라 맞는다 |
 *
 * 옮기기는 `root.type = 'Popup'` · `root.props = { title: <페이지 제목> }` 뿐이다 — 몸통(`children`)은 그대로이고 «바닥» 구역은 안 만든다(지금
 * 내용이 이미 단추를 들고 있을 수 있다). 좌표가 안 바뀌어 **`head_seq` · `structure_seq` 를 안 올린다**(`0032` 의 «판 번호만 오른 문서» 와 같다).
 * 둘 이상으로 풀리는 대상 · 못 푸는 대상 · 빈 대상은 안 옮긴다 — lint «대상이 팝업이 아님» 이 그 자리를 말한다. 이미 `Popup` 인 뿌리는 그대로다.
 *
 * **옮긴 수를 한 줄로 찍는다** — 사용자 DB 에 적용하는 사람이 그 줄로 몇 쪽이 바뀌었는지 읽는다.
 *
 * **`down` 은 `Popup` 뿌리를 전부 `Page` 로 내린다** — `props` 를 걷고 «바닥» 구역의 노드를 몸통 끝에 차례로 붙인다(지우지 않는다). 이
 * 마이그레이션이 옮긴 것과 사람이 새로 만든 팝업 페이지를 가르지 않는다(배포된 서비스가 없어 받는다). 페이지 표와 스냅샷 payload 의 `pages[]` 둘 다다.
 *
 * **이 파일은 이 판의 뜻으로 얼어 있다 — 고치지 않는다.** 대상 글자의 풀이(`@wirebound/schema` 의 `page-target.ts` — 접두 `page:` · 조상 메뉴
 * 이름과 페이지 제목을 `/` 로 잇고 마디마다 앞뒤 공백을 걷는다 · 부모가 없는 메뉴와 고리에 갇힌 메뉴의 페이지는 안 닿는다)를 여기 사본으로 둔다.
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    const moved = await liftModalTargets(db)
    console.log(
      `  · 0033-modal-popup: 팝업으로 옮긴 페이지 ${moved.pages} · 스냅샷 ${moved.snapshots} 개 안의 페이지 ${moved.snapshotPages}`,
    )
  },

  async down(db: Kysely<unknown>): Promise<void> {
    const lowered = await lowerPopups(db)
    console.log(
      `  · 0033-modal-popup down: 화면으로 내린 페이지 ${lowered.pages} · 스냅샷 ${lowered.snapshots} 개 안의 페이지 ${lowered.snapshotPages}`,
    )
  },
}

export interface Moved {
  pages: number
  snapshots: number
  snapshotPages: number
}

/** 올리기 — 대상이 된 페이지(페이지 표 · 스냅샷 payload)의 뿌리를 `Popup` 으로. 옮긴 수를 낸다. */
export async function liftModalTargets(db: Kysely<unknown>): Promise<Moved> {
  const moved: Moved = { pages: 0, snapshots: 0, snapshotPages: 0 }
  const projects = await sql<{ id: string }>`select id from projects order by id`.execute(db)
  for (const { id: projectId } of projects.rows) {
    const menu = await sql<MenuRow>`
      select id, parent_id as "parentId", title from menu_nodes where project_id = ${projectId}
    `.execute(db)
    const pages = await sql<{ id: string; menuNodeId: string; title: string; schema: unknown }>`
      select id, menu_node_id as "menuNodeId", title, schema from pages where project_id = ${projectId} order by id
    `.execute(db)
    const sources = await sql<{ body: unknown }>`
      select schema as body from layouts where project_id = ${projectId}
      union all select nodes from modules where project_id = ${projectId}
      union all select nodes from personal_modules
        where owner_id in (select user_id from project_members where project_id = ${projectId})
    `.execute(db)
    const targets = new Set<string>()
    for (const page of pages.rows) modalTargets(page.schema, targets)
    for (const source of sources.rows) modalTargets(source.body, targets)
    const chosen = resolveTargets(menu.rows, pages.rows, targets)
    for (const page of pages.rows) {
      if (!chosen.has(page.id)) continue
      const lifted = liftRoot(page.schema, page.title)
      if (lifted === null) continue
      await sql`update pages set schema = ${JSON.stringify(lifted)}::jsonb where id = ${page.id}`.execute(db)
      moved.pages += 1
    }
  }

  const snapshots = await sql<{ id: string; payload: unknown }>`select id, payload from snapshots order by id`.execute(db)
  for (const row of snapshots.rows) {
    const payload = row.payload
    if (!isRecord(payload) || !Array.isArray(payload.pages)) continue
    const menu = Array.isArray(payload.menu) ? payload.menu.filter(isRecord).map(menuOf) : []
    const entries = payload.pages.filter(isRecord)
    const targets = new Set<string>()
    for (const entry of entries) modalTargets(entry.schema, targets)
    if (Array.isArray(payload.layouts)) for (const layout of payload.layouts) if (isRecord(layout)) modalTargets(layout.schema, targets)
    const chosen = resolveTargets(
      menu,
      entries.map((entry) => ({ id: String(entry.id), menuNodeId: String(entry.menuNodeId), title: String(entry.title) })),
      targets,
    )
    let count = 0
    const nextPages = payload.pages.map((entry) => {
      if (!isRecord(entry) || !chosen.has(String(entry.id))) return entry
      const lifted = liftRoot(entry.schema, String(entry.title))
      if (lifted === null) return entry
      count += 1
      return { ...entry, schema: lifted }
    })
    if (count === 0) continue
    await sql`update snapshots set payload = ${JSON.stringify({ ...payload, pages: nextPages })}::jsonb where id = ${row.id}`.execute(db)
    moved.snapshots += 1
    moved.snapshotPages += count
  }
  return moved
}

/** 내리기 — `Popup` 뿌리를 전부 `Page` 로(페이지 표 · 스냅샷 payload). 내린 수를 낸다. */
export async function lowerPopups(db: Kysely<unknown>): Promise<Moved> {
  const lowered: Moved = { pages: 0, snapshots: 0, snapshotPages: 0 }
  const pages = await sql<{ id: string; schema: unknown }>`select id, schema from pages order by id`.execute(db)
  for (const page of pages.rows) {
    const next = lowerRoot(page.schema)
    if (next === null) continue
    await sql`update pages set schema = ${JSON.stringify(next)}::jsonb where id = ${page.id}`.execute(db)
    lowered.pages += 1
  }
  const snapshots = await sql<{ id: string; payload: unknown }>`select id, payload from snapshots order by id`.execute(db)
  for (const row of snapshots.rows) {
    const payload = row.payload
    if (!isRecord(payload) || !Array.isArray(payload.pages)) continue
    let count = 0
    const nextPages = payload.pages.map((entry) => {
      if (!isRecord(entry)) return entry
      const next = lowerRoot(entry.schema)
      if (next === null) return entry
      count += 1
      return { ...entry, schema: next }
    })
    if (count === 0) continue
    await sql`update snapshots set payload = ${JSON.stringify({ ...payload, pages: nextPages })}::jsonb where id = ${row.id}`.execute(db)
    lowered.snapshots += 1
    lowered.snapshotPages += count
  }
  return lowered
}

interface MenuRow {
  id: string
  parentId: string | null
  title: string
}

type Raw = Record<string, unknown>

function isRecord(value: unknown): value is Raw {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function menuOf(node: Raw): MenuRow {
  return { id: String(node.id), parentId: typeof node.parentId === 'string' ? node.parentId : null, title: String(node.title) }
}

/** 글자 하나(문서 · 노드 묶음)에서 `openModal` 의 대상 글자를 모은다 — 키를 가리지 않고 걷는다(상호작용이 사는 자리가 어디든). */
export function modalTargets(value: unknown, out: Set<string>): Set<string> {
  if (Array.isArray(value)) for (const item of value) modalTargets(item, out)
  else if (isRecord(value)) {
    if (value.type === 'openModal' && typeof value.target === 'string') out.add(value.target)
    for (const child of Object.values(value)) modalTargets(child, out)
  }
  return out
}

/** 대상 글자를 페이지 경로로 — 접두 `page:` 를 벗기고 마디마다 앞뒤 공백을 걷는다. */
function normalizePath(target: string): string {
  const trimmed = target.trim()
  const path = trimmed.startsWith('page:') ? trimmed.slice('page:'.length).trim() : trimmed
  return path
    .split('/')
    .map((segment) => segment.trim())
    .join('/')
}

/**
 * 메뉴 트리로 페이지마다 경로를 짓고, 대상 글자 가운데 **한 페이지로만** 풀리는 것의 페이지 id. 부모가 없는 메뉴 · 고리에 갇힌 메뉴는 뿌리에서
 * 안 닿아 그 페이지는 경로가 없다(뿌리로 올리지 않는다).
 */
export function resolveTargets(
  menu: readonly MenuRow[],
  pages: readonly { id: string; menuNodeId: string; title: string }[],
  targets: ReadonlySet<string>,
): Set<string> {
  const known = new Set(menu.map((node) => node.id))
  const byParent = new Map<string | null, MenuRow[]>()
  for (const node of menu) {
    const parent = node.parentId === null || known.has(node.parentId) ? node.parentId : undefined
    if (parent === undefined) continue
    byParent.set(parent, [...(byParent.get(parent) ?? []), node])
  }
  const pathOf = new Map<string, string[]>()
  const visited = new Set<string>()
  const visit = (parentId: string | null, ancestors: readonly string[]): void => {
    for (const node of byParent.get(parentId) ?? []) {
      if (visited.has(node.id)) continue
      visited.add(node.id)
      pathOf.set(node.id, [...ancestors, node.title.trim()])
      visit(node.id, pathOf.get(node.id)!)
    }
  }
  visit(null, [])
  const pagesByPath = new Map<string, string[]>()
  for (const page of pages) {
    const ancestors = pathOf.get(page.menuNodeId)
    if (ancestors === undefined) continue
    const path = [...ancestors, page.title.trim()].join('/')
    pagesByPath.set(path, [...(pagesByPath.get(path) ?? []), page.id])
  }
  const chosen = new Set<string>()
  for (const target of targets) {
    const path = normalizePath(target)
    if (path === '') continue
    const found = pagesByPath.get(path) ?? []
    if (found.length === 1) chosen.add(found[0]!)
  }
  return chosen
}

/** 뿌리가 `Page` 인 문서를 `Popup` 뿌리로(제목 = 페이지 제목). 그 밖이면 `null`. */
export function liftRoot(schema: unknown, title: string): unknown {
  if (!isRecord(schema) || !isRecord(schema.root) || schema.root.type !== 'Page') return null
  return { ...schema, root: { ...schema.root, type: 'Popup', props: { title } } }
}

/** 뿌리가 `Popup` 인 문서를 `Page` 뿌리로 — `props` 를 걷고 «바닥» 노드를 몸통 끝에 붙인다. 그 밖이면 `null`. */
export function lowerRoot(schema: unknown): unknown {
  if (!isRecord(schema) || !isRecord(schema.root) || schema.root.type !== 'Popup') return null
  const { props: _props, zones, ...root } = schema.root
  const children = Array.isArray(root.children) ? root.children : []
  const footer = isRecord(zones) && Array.isArray(zones.footer) ? zones.footer : []
  const next: Raw = { ...root, type: 'Page', children: [...children, ...footer] }
  if (isRecord(zones)) {
    const { footer: _footer, ...rest } = zones
    if (Object.keys(rest).length > 0) next.zones = rest
  }
  return { ...schema, root: next }
}
