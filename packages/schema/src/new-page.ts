/**
 * **새 페이지의 문서** — 만들기 요청(`apps/api` 의 `POST /:projectId/pages`)이 종류(`page` · `popup`)로 짓는다. 페이지의 «종류» 는 뿌리
 * 타입이다(`Page` = 화면 · `Popup` = 팝업 — `validate.ts` 의 `ROOT_TYPES`).
 *
 * 팝업은 제목을 페이지 이름으로 채우고 구역의 기본 내용(«바닥» 의 `[취소][저장]` — 카탈로그 `Popup` 의 `initial`)을 실제 노드로 넣는다. 펴는
 * 규칙은 에디터가 노드를 만들 때(`apps/web/src/edit/create-node.ts` 의 `createNode`)와 같다 — 기본 내용의 타입 · props · 변형 · 상호작용을 싣고
 * 그 타입의 기본 내용을 다시 편다. 두 자리가 같은 꼴을 짓는지는 `apps/web/test/edit/create-node.test.ts` 가 견준다.
 */
import { cloneJsonValue } from './clone'
import { BODY_ZONE, type NodeSeed } from './component/define'
import { getComponent } from './component/registry'
import { CURRENT_DOCUMENT_VERSION } from './migrate'
import { createNodeId, type Interaction, type PageDocument, type WbNode } from './node'

/** 페이지의 종류. */
export type PageKind = 'page' | 'popup'

export const PAGE_KINDS: readonly PageKind[] = ['page', 'popup']

/** 문서의 종류 — 뿌리가 `Popup` 이면 팝업. */
export function pageKindOf(doc: { root?: { type?: unknown } } | null | undefined): PageKind {
  return doc?.root?.type === 'Popup' ? 'popup' : 'page'
}

/** 새 페이지의 문서. 팝업은 `title` 을 제목으로 쓴다. */
export function newPageDocument(kind: PageKind, title: string, nextId: () => string = createNodeId): PageDocument {
  if (kind === 'page') return { version: CURRENT_DOCUMENT_VERSION, root: { id: nextId(), type: 'Page', children: [] } }
  const root = seededNode('Popup', nextId)
  return { version: CURRENT_DOCUMENT_VERSION, root: { ...root, props: { title }, children: [] } }
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
