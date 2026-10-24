/**
 * **그림 id → 에디터가 읽는 주소**(`GET /api/projects/:projectId/assets/:id`). 캔버스(same-origin iframe)가 세션 쿠키로 읽는다 — 그 프로젝트가 가진
 * 그림만 200 이고 나머지(남의 그림 id · 없는 해시)는 404 라 렌더러가 «그림을 불러올 수 없음» 표지를 그린다. 경로 모양은 api 라우트
 * (`apps/api/src/routes/assets.ts`)와 같아야 한다.
 */
export function projectAssetUrl(projectId: string, id: string): string {
  return `/api/projects/${encodeURIComponent(projectId)}/assets/${encodeURIComponent(id)}`
}
