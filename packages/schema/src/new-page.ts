/**
 * **새 페이지의 문서** — 만들기 요청(`apps/api` 의 `POST /:projectId/pages`)이 레이아웃(`blank` · `popup` · `subpage`)으로 짓는다. 팝업
 * 레이아웃의 뿌리는 `Popup`, 그 밖은 `Page` 다(`validate.ts` 의 `layout-root-mismatch`).
 *
 * 팝업은 제목을 페이지 이름으로 채우고 구역의 기본 내용(«바닥» 의 `[취소][저장]` — 카탈로그 `Popup` 의 `initial`)을 실제 노드로 넣는다. 펴는
 * 규칙은 에디터가 노드를 만들 때(`apps/web/src/edit/create-node.ts` 의 `createNode`)와 같다 — 기본 내용의 타입 · props · 변형 · 상호작용을 싣고
 * 그 타입의 기본 내용을 다시 편다. 두 자리가 같은 꼴을 짓는지는 `apps/web/test/edit/create-node.test.ts` 가 견준다.
 */
import { cloneJsonValue } from './clone'
import { BODY_ZONE, type NodeSeed } from './component/define'
import { getComponent } from './component/registry'
import { CURRENT_DOCUMENT_VERSION } from './migrate'
import { legacyPageLayout } from './migrate-page-layout'
import { createNodeId, PAGE_LAYOUTS, type Interaction, type PageDocument, type PageLayout, type WbNode } from './node'

/** 페이지의 종류 — 팝업 레이아웃이면 `popup`, 그 밖(빈 · 서브페이지)은 `page`. 읽는 자리(트리 응답 · MCP · CLI)가 쓰던 값이라 남긴다. */
export type PageKind = 'page' | 'popup'

export const PAGE_KINDS: readonly PageKind[] = ['page', 'popup']

/**
 * **문서의 레이아웃** — «팝업인가» 를 묻는 모든 자리가 이것(또는 `pageKindOf`)을 읽는다. 판 7 문서는 `layout` 그대로다. 아는 값이 없는 문서(판 6
 * 이하 · 검증 전 입력)는 판 6 의 뜻(`legacyPageLayout` — 뿌리 `Popup` 이면 팝업)으로 읽는다 — 사슬이 올리면 같은 값이 된다.
 */
export function pageLayoutOf(doc: { layout?: unknown; root?: { type?: unknown } } | null | undefined): PageLayout {
  const layout = doc?.layout
  return PAGE_LAYOUTS.includes(layout as PageLayout) ? (layout as PageLayout) : legacyPageLayout(doc)
}

/** 문서의 종류 — 팝업 레이아웃이면 팝업(`pageLayoutOf`). 뿌리 타입은 읽지 않는다 — 판정은 `layout` 하나다. */
export function pageKindOf(doc: { layout?: unknown; root?: { type?: unknown } } | null | undefined): PageKind {
  return pageLayoutOf(doc) === 'popup' ? 'popup' : 'page'
}

/** 새 페이지의 문서. 팝업은 `title` 을 제목으로 쓴다. */
export function newPageDocument(layout: PageLayout, title: string, nextId: () => string = createNodeId): PageDocument {
  if (layout !== 'popup') return { version: CURRENT_DOCUMENT_VERSION, layout, root: { id: nextId(), type: 'Page', children: [] } }
  const root = seededNode('Popup', nextId)
  return { version: CURRENT_DOCUMENT_VERSION, layout, root: { ...root, props: { title }, children: [] } }
}

/** 타입의 빈 노드에 구역의 기본 내용을 편다. */
function seededNode(type: string, nextId: () => string): WbNode {
  const node: WbNode = { id: nextId(), type }
  for (const zone of getComponent(type)?.zones ?? []) {
    const seeds = (zone.initial ?? []).map((seed) => fromSeed(seed, nextId))
    if (seeds.length === 0) continue
    if (zone.name === BODY_ZONE) node.children = seeds
    else node.zones = { ...node.zones, [zone.name]: seeds }
  }
  return node
}

function fromSeed(seed: NodeSeed, nextId: () => string): WbNode {
  return {
    ...seededNode(seed.type, nextId),
    ...(seed.props === undefined ? {} : { props: { ...seed.props } }),
    ...(seed.variant === undefined ? {} : { variant: seed.variant }),
    ...(seed.interactions === undefined ? {} : { interactions: cloneJsonValue([...seed.interactions]) as Interaction[] }),
  }
}
