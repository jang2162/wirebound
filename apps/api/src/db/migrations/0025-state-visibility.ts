import type { Kysely, Migration } from 'kysely'
import { sql } from 'kysely'
import { liftStateRegions, MigrationError, type PageDocument } from '@wirebound/schema'
import { presetToModuleNodes } from './0024-modules'

/**
 * **문서 판 1 → 2 — 상태 영역을 노드 보임으로**(설계 spec `2026-10-18-modules-states-layout-design.md` 「C4」). 칸은 바꾸지 않고 저장된
 * 문서를 옮긴다.
 *
 * | 표 · 칸 | 옮기는 것 |
 * |---|---|
 * | `pages.schema` · `schema_version` | 판 1 문서마다 `liftStateRegions`(상태 영역 → `visibility`) 뒤 `version` · `schema_version` 을 2 로. 판 2 이상은 그대로 |
 * | `layouts.schema` | 같은 함수 — 레이아웃에는 상태 목록이 없어 기본 가지만 남는다 · `version` 을 2 로 |
 * | `modules.nodes` | **기본 가지만 남겨 푼다** — 0024 가 프리셋을 옮긴 규칙 그대로(`presetToModuleNodes` — 모듈에는 상태가 없다 · 버린 가지 안을 가리키던 액션을 뺀다). V2 · V3 사이에 저장된 모듈이 대상이다 |
 *
 * **schema 를 import 한다 — 다른 마이그레이션과 다르다.** 옮기는 함수는 schema 의 판 1 → 2 단계(`migrate.ts`의 `MIGRATIONS` 첫 줄)와 **한 벌**이어야
 * 한다(읽기 경계 · 스냅샷 복원 · 가져오기 · 클립보드가 같은 함수를 부른다 — 둘로 두면 DB 의 문서와 복원한 문서가 갈린다). 그 단계는 판 1 → 2 의
 * 뜻으로 얼어 있다(`migrate-document.ts` 머리말 — 뒤의 판은 새 단계를 더한다). 모듈은 0024 의 얼린 함수를 그대로 부른다.
 *
 * 같은 노드 id 가 둘인 페이지는 옮길 수 없다(`MigrationError`) — 마이그레이션이 그 페이지 id 를 들고 멈추고 트랜잭션째 되돌린다.
 *
 * **`down` 은 거절한다 — 되돌릴 수 없다.** 판 1 의 상태 영역을 보임에서 다시 지을 수 없고(버린 가지 · 옮긴 자리), 옛 코드는 판 2 문서를
 * `unsupported-version` 으로 막는다. 페이지 · 모듈 · 레이아웃이 하나라도 있으면 «백업에서 되돌린다»로 멈춘다. 셋 다 비었으면 잃을 것이 없어
 * 내려간다(칸을 안 바꿨으므로 할 일이 없다) — `test/global-setup.ts` 는 매 실행 왕복 전에 테스트 DB 의 프로젝트를 비운다.
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    const pages = await sql<{ id: string; schema: unknown }>`select id, schema from pages order by id`.execute(db)
    for (const page of pages.rows) {
      const lifted = liftDocument(page.schema, page.id)
      if (lifted === null) continue
      await sql`update pages set schema = ${JSON.stringify(lifted)}::jsonb, schema_version = 2 where id = ${page.id}`.execute(db)
    }

    const layouts = await sql<{ id: string; schema: unknown }>`select id, schema from layouts order by id`.execute(db)
    for (const layout of layouts.rows) {
      const lifted = liftDocument(layout.schema, null)
      if (lifted === null) continue
      await sql`update layouts set schema = ${JSON.stringify(lifted)}::jsonb where id = ${layout.id}`.execute(db)
    }

    const modules = await sql<{ id: string; nodes: unknown }>`select id, nodes from modules order by id`.execute(db)
    for (const row of modules.rows) {
      if (!JSON.stringify(row.nodes).includes('"StateSwitch"') && !JSON.stringify(row.nodes).includes('"StateCase"')) continue
      await sql`update modules set nodes = ${JSON.stringify(presetToModuleNodes(row.nodes))}::jsonb where id = ${row.id}`.execute(db)
    }
  },

  async down(db: Kysely<unknown>): Promise<void> {
    const left = await sql<{ pages: string; modules: string; layouts: string }>`
      select (select count(*) from pages) as pages, (select count(*) from modules) as modules, (select count(*) from layouts) as layouts
    `.execute(db)
    const counts = left.rows[0]!
    if (Number(counts.pages) + Number(counts.modules) + Number(counts.layouts) === 0) return
    throw new Error(
      `0025-state-visibility 은 되돌릴 수 없습니다 — 문서를 판 2(상태 보임)로 옮겼고 판 1 의 상태 영역을 다시 지을 수 없습니다 ` +
        `(페이지 ${counts.pages} · 모듈 ${counts.modules} · 레이아웃 ${counts.layouts}). 백업에서 되돌린다.`,
    )
  },
}

/** 판 1 문서를 판 2 로 — 판 2 이상이거나 문서 꼴이 아니면 `null`(건드리지 않는다). */
function liftDocument(schema: unknown, pageId: string | null): unknown {
  if (schema === null || typeof schema !== 'object' || Array.isArray(schema)) return null
  const version = (schema as { version?: unknown }).version
  if (typeof version !== 'number' || version >= 2) return null
  if ((schema as { root?: unknown }).root === null || typeof (schema as { root?: unknown }).root !== 'object') return null
  try {
    return { ...liftStateRegions(schema as PageDocument).doc, version: 2 }
  } catch (error) {
    if (error instanceof MigrationError && pageId !== null) throw new MigrationError(error.nodeId, pageId)
    throw error
  }
}
