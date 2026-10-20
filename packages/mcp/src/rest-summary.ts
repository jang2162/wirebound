/**
 * `/llms.txt` 의 «REST API (summary)» 표 — 바깥 에이전트가 MCP 밖에서 토큰으로 부를 만한 프로젝트 라우트를 고른 것이다. 글을 짓는
 * 자리는 `apps/web/config/llms-txt.ts` 이고, 표가 여기 사는 까닭은 api 의 케이스가 이 값을 읽어야 해서다 — 앱끼리는 서로의 소스를
 * 부르지 않는다(api 는 이 패키지를 devDependencies 로만 둔다). 이 표는 순수한 값이라 이 패키지의 «조립하지 않는다»(`test/assembly-census.test.ts`)
 * 에 안 걸린다.
 *
 * **고른 요약이다 — 전부는 `apps/api/README.md` 「엔드포인트」가 갖는다.** 줄마다 등록된 라우트이고 최소 역할이 가드의 값과 같은지는
 * `apps/api/test/llms-rest-routes.test.ts` 가 등록된 라우트(`onRoute`)로 잰다. 빠진 라우트는 아무것도 안 죽는다.
 */
/** 프로젝트 라우트의 최소 역할 — api 의 `projectGuard` 가 받는 값. */
export type LlmsRouteRole = 'viewer' | 'editor' | 'owner'

export interface LlmsRestRoute {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  /** Fastify 에 등록된 패턴 그대로(`/api/projects/:projectId/…`). */
  path: string
  min: LlmsRouteRole
  summary: string
}

export const LLMS_REST_ROUTES: readonly LlmsRestRoute[] = [
  { method: 'GET', path: '/api/projects/:projectId', min: 'viewer', summary: 'The project (name, slug, your role).' },
  {
    method: 'GET',
    path: '/api/projects/:projectId/tree',
    min: 'viewer',
    summary: 'Menu tree with the pages under each menu node (no page documents).',
  },
  {
    method: 'GET',
    path: '/api/projects/:projectId/pages/:pageId',
    min: 'viewer',
    summary: 'One page with its document (`schema`) and `headSeq` — the `baseSeq` for the next edit.',
  },
  {
    method: 'PATCH',
    path: '/api/projects/:projectId/pages/:pageId/ops',
    min: 'editor',
    summary: 'Edit the document: `{ baseSeq, ops }` (JSON Patch). 409 when `baseSeq` is stale, 423 when a person holds the area.',
  },
  {
    method: 'GET',
    path: '/api/projects/:projectId/pages/:pageId/revisions',
    min: 'viewer',
    summary: 'Edit history, newest first (`?limit=`, `?beforeSeq=`).',
  },
  {
    method: 'GET',
    path: '/api/projects/:projectId/pages/:pageId/comments',
    min: 'viewer',
    summary: 'Comments on the page, oldest first.',
  },
  {
    method: 'POST',
    path: '/api/projects/:projectId/pages/:pageId/comments',
    min: 'editor',
    summary: 'Add a comment to a node: `{ nodeId, body }`. May number the node, which changes the document.',
  },
  {
    method: 'GET',
    path: '/api/projects/:projectId/snapshot',
    min: 'viewer',
    summary: 'Read-only dump of the whole project: menu, pages with their stored documents, layouts, comments, theme binding.',
  },
  {
    method: 'GET',
    path: '/api/projects/:projectId/snapshots',
    min: 'viewer',
    summary: 'Saved snapshots (tags), without their payload.',
  },
  {
    method: 'GET',
    path: '/api/projects/:projectId/theme',
    min: 'viewer',
    summary: "The project's theme binding and token values.",
  },
  {
    method: 'GET',
    path: '/api/projects/:projectId/export',
    min: 'viewer',
    summary: 'Download the design: `?format=html` (static bundle, zip) or `?format=pptx`.',
  },
]
