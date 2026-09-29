/**
 * **테마를 바꾸면 무엇이 달라지나** — 설정 화면이 바꾸기 전에 확인 창으로 보이는 두 수(spec
 * `docs/superpowers/specs/2026-09-27-code-themes-design.md` 「테마 바꾸기와 버전 올리기」).
 *
 * - 토큰 이전: `@wirebound/themes` 의 `migrateTokens` 가 센다 — 설정 화면이 «바꾸기» 로 보내는 본문이 같은 함수의 결과라 확인 창의
 *   수와 보낸 값이 갈리지 않는다. 세는 것은 저장된 값(기본값과 다른 것)이다.
 * - 없는 variant: 대상 manifest 가 `components` 로 선언한 컴포넌트의 노드 가운데, `variant` 를 들고 있는데 그 값이 선언 밖인 것. 선언이
 *   없는 컴포넌트는 모든 값이 통과하고, `variant` 가 없는 노드는 `defaultVariant` 로 그려지므로 안 센다. 페이지 데이터는 바꾸지 않는다.
 */
import type { WbNode } from '@wirebound/schema'
import { migrateTokens, type ThemeManifest } from '@wirebound/themes'
import type { DbHandle } from '../db/tx'
import type { ProjectThemeBinding } from '../repos/projects'

export interface ThemeImpact {
  tokens: { kept: number; dropped: number; defaulted: number }
  variants: { pageId: string; title: string; count: number }[]
}

export async function computeThemeImpact(
  db: DbHandle,
  projectId: string,
  current: { binding: ProjectThemeBinding; manifest: ThemeManifest | null },
  target: ThemeManifest,
): Promise<ThemeImpact> {
  const { kept, dropped, defaulted } = migrateTokens(current.manifest, target, current.binding.tokens)

  const pages = await db
    .selectFrom('pages')
    .select(['id', 'title', 'schema', 'menu_node_id as menuNodeId', 'sort_order as sortOrder'])
    .where('project_id', '=', projectId)
    .execute()
  const menu = await db
    .selectFrom('menu_nodes')
    .select(['id', 'parent_id as parentId', 'sort_order as sortOrder'])
    .where('project_id', '=', projectId)
    .execute()
  const variants: ThemeImpact['variants'] = []
  for (const page of inTreeOrder(menu, pages)) {
    const count = countMissingVariants(page.schema.root, target)
    if (count > 0) variants.push({ pageId: page.id, title: page.title, count })
  }

  return {
    tokens: { kept, dropped, defaulted },
    variants,
  }
}

function countMissingVariants(node: WbNode, target: ThemeManifest): number {
  const declared = target.components?.[node.type]
  const missing = declared !== undefined && node.variant !== undefined && !declared.variants.some((v) => v.id === node.variant) ? 1 : 0
  return missing + (node.children ?? []).reduce((sum, child) => sum + countMissingVariants(child, target), 0)
}

/** 페이지를 설계서 트리의 차례로 — 메뉴를 깊이 우선(형제는 `sort_order`), 한 메뉴 안의 페이지는 `sort_order`. 화면이 트리 차례로 보인다. */
function inTreeOrder<P extends { menuNodeId: string; sortOrder: number }>(
  menu: { id: string; parentId: string | null; sortOrder: number }[],
  pages: P[],
): P[] {
  const children = new Map<string | null, typeof menu>()
  for (const node of menu) children.set(node.parentId, [...(children.get(node.parentId) ?? []), node])
  const pagesOf = new Map<string, P[]>()
  for (const page of pages) pagesOf.set(page.menuNodeId, [...(pagesOf.get(page.menuNodeId) ?? []), page])
  const ordered: P[] = []
  const visit = (parentId: string | null): void => {
    for (const node of (children.get(parentId) ?? []).sort((a, b) => a.sortOrder - b.sortOrder)) {
      ordered.push(...(pagesOf.get(node.id) ?? []).sort((a, b) => a.sortOrder - b.sortOrder))
      visit(node.id)
    }
  }
  visit(null)
  return ordered
}
