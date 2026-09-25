/**
 * `createHttpClient`의 계약 테스트. **네트워크를 타지 않는다** — 가짜 `fetch`를
 * 주입하고, 그 가짜가 받은 인자와 돌려준 응답만으로 판정한다.
 *
 * 이 파일이 검사하는 것은 "서버가 무엇을 주느냐"가 아니라 "클라이언트가 서버 계약
 * (`apps/api/README.md`의 엔드포인트 표)을 어떻게 번역하느냐"다 — 경로·메서드·본문,
 * 쿠키를 싣기 위한 `credentials`, `{ menu }` 봉투 벗기기, 에러 봉투 → `ApiError`.
 */
import type { PatchOp } from '@wirebound/schema'
import { describe, expect, it, vi } from 'vitest'
import { ApiError, type ApiErrorCode } from '../../src/api/client'
import { createHttpClient } from '../../src/api/http-client'
import type {
  MenuNode,
  PageDetail,
  PageImported,
  ProjectDetail,
  ProjectTheme,
  ThemeDetail,
  ThemeSummary,
  SessionUser,
  TreeMenuNode,
} from '../../src/api/types'
import { stripComments } from '../store-access-guard'

interface RecordedCall {
  url: string
  init: RequestInit | undefined
}

interface FetchStub {
  fetchImpl: typeof fetch
  calls: RecordedCall[]
}

/**
 * 준비한 응답을 순서대로 내주는 가짜 fetch. 호출마다 인자를 그대로 기록한다 —
 * `credentials` 같은 옵션은 jsdom에서 지워도 아무것도 깨지지 않으므로, 화면 동작이
 * 아니라 이 기록을 직접 단언해야만 판별된다.
 *
 * `Response`는 본문을 한 번만 읽을 수 있으므로 호출 횟수만큼 서로 다른 인스턴스를 준다.
 */
function stubFetch(...responses: Response[]): FetchStub {
  const calls: RecordedCall[] = []
  let index = 0
  const fetchImpl: typeof fetch = (input, init) => {
    calls.push({ url: String(input), init })
    const response = responses[index]
    index += 1
    if (response === undefined) {
      return Promise.reject(new Error(`가짜 fetch에 준비된 응답이 없다 (${index}번째 호출)`))
    }
    return Promise.resolve(response)
  }
  return { fetchImpl, calls }
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

/** 프록시나 리버스 프록시가 JSON 대신 낼 수 있는 HTML 응답. */
function htmlResponse(status: number): Response {
  return new Response('<!doctype html><title>502 Bad Gateway</title>', {
    status,
    headers: { 'content-type': 'text/html' },
  })
}

const user: SessionUser = { id: 'u1', email: 'a@b.c', name: '홍길동' }
const project: ProjectDetail = { id: 'p1', name: '프로젝트', slug: 'proj', description: null, role: 'owner' }

/** `GET /api/projects/:projectId/theme`의 응답. 서버는 파생 테마를 합쳐서 낸다. */
const themeSummary: ThemeSummary = {
  id: 't1',
  system: true,
  theme: { meta: { id: 'admin', name: '관리자', version: '1.0.0' } },
}

const projectTheme: ProjectTheme = { themeId: null, theme: { meta: { id: 'admin', name: '관리자', version: '1.0.0' } },
  issues: [],
}

/**
 * `GET·POST·PUT .../themes[/:themeId]`의 응답. **조건부 두 키를 일부러 안 담았다** —
 * 그것이 서버의 흔한 응답이고(`base`는 파생일 때만, `warnings`는 경고가 있을 때만),
 * *"없는 것이 정상"*을 통과시키는 것이 `SHAPES.themeDetail`의 절반이다.
 */
const themeDetail: ThemeDetail = {
  id: 't1',
  system: false,
  updatedAt: '2026-08-11T09:00:00.000Z',
  theme: { meta: { id: 'brand', name: '브랜드', version: '1.0.0' } },
}
const treeNode: TreeMenuNode = {
  id: 'm1',
  title: '회원관리',
  sortOrder: 0,
  pages: [{ id: 'pg1', title: '목록', sortOrder: 0 }],
  children: [{ id: 'm2', title: '권한', sortOrder: 0, pages: [], children: [] }],
}
/** `PATCH .../ops` 성공 응답. `inverse`는 **서버가** 만든 것이다(설계서 「정방향 흐름」). */
const patchResult = {
  seq: 8,
  revisionId: 'rev-1',
  inverse: [{ op: 'replace', path: '/root/children/0/props/title', value: '옛 제목' }],
  schemaVersion: 1,
  clientOpId: 'op-1',
}

const page: PageDetail = {
  id: 'pg1',
  menuNodeId: 'm1',
  title: '목록',
  description: null,
  sortOrder: 0,
  schemaVersion: 1,
  headSeq: 7,
  schema: { version: 1, root: { id: 'n_000000000001', type: 'Page', children: [] } },
}

/**
 * `POST /pages/import`의 응답. **`page`가 위 `page`와 같은 여덟 키다** — 서버의 같은
 * `toResponse`가 만든다.
 */
const pageImported: PageImported = { page, comments: { inserted: 2, dangling: 1 } }

/** `POST /menu`·`PATCH /menu/:nodeId`의 응답. 트리 노드와 달리 `pages`·`children`이 없다. */
const menuNode: MenuNode = { id: 'm1', projectId: 'p1', parentId: null, title: '회원관리', sortOrder: 0 }

/** 코멘트 하나. `marker`가 **없는 것이 요점이다** — 번호는 노드의 값이다(설계서 「페이지 스키마 노드」). */
const comment = {
  id: 'c1',
  nodeId: 'n_000000000001',
  body: '검색 조건은 AND 결합',
  authorId: 'u1',
  authorName: '홍길동',
  createdAt: '2026-08-12T09:00:00.000Z',
  updatedAt: '2026-08-12T09:00:00.000Z',
}

/** `POST .../comments`의 응답. `markerOps`가 이 요청이 문서에 낸 변화다. */
const commentCreated = {
  comment,
  marker: 1,
  seq: 8,
  markerOps: [{ op: 'add', path: '/root/children/0/marker', value: 1 }],
}

/** `DELETE .../comments/:id`·`POST .../comments/renumber`의 응답. */
const markerChange = { seq: 9, markerOps: [{ op: 'remove', path: '/root/children/0/marker' }] }

/**
 * `GET .../snapshots`의 항목 하나. **`payload`가 없다** — 목록은 크기만 낸다.
 * 생성 응답에는 `payload`가 더 붙지만 `SHAPES.snapshot`이 그것을 보지 않고 통과시킨다:
 * 이 화면은 payload를 읽지 않는다(복원도 payload를 읽는 것은 서버다 — 아래 `restoreSnapshot` 줄).
 */
const snapshot = {
  id: 's1',
  tag: 'v1',
  description: '첫 릴리스 직전',
  createdBy: 'u1',
  createdByName: '홍길동',
  createdAt: '2026-08-12T09:00:00.000Z',
  payloadBytes: 8123,
}

/** 프리셋 하나. 목록·생성이 같은 모양이다 — 서버의 응답 두 벌이 같은 키를 낸다. */
const preset = {
  id: 'builtin:search-list',
  source: 'builtin',
  name: '검색 + 목록형',
  description: '검색 조건을 위에 두고 결과를 목록으로 보이는 화면',
  nodes: [{ id: 'sl_list', type: 'List' }],
}

/**
 * 복원 결과. **화면이 읽는 것만 담지 않는다** — 서버가 실제로 내는 모양 그대로여야
 * `ok` 판이 *"과도 차단을 재는 자리"*가 된다.
 */
const restoreResult = {
  summary: {
    menu: { created: 0, updated: 1, deleted: 0 },
    pages: { created: 0, metaUpdated: 0, schemaChanged: 2, schemaUnchanged: 3, deleted: 1 },
    comments: { created: 0, updated: 0, deleted: 0 },
    layouts: { themeRefChanged: 0 },
  },
  safetySnapshot: { id: 's2', tag: '복원 전 2026-08-12T09:24:30.443Z' },
  themes: [{ layoutId: 'l1', themeId: 't1', differs: false }],
}

/** `GET .../export/preview?format=html`의 응답. */
const exportPreview = {
  format: 'html',
  pages: [{ id: 'pg1', title: '회원 목록', target: 'page:관리자/회원/목록' }],
  duplicateTargets: [],
  brokenLinks: [],
  errors: [],
  themeId: 't1',
  fileName: 'wirebound-export-proj.zip',
}

/**
 * `GET .../export/preview?format=pptx`의 응답. **위와 다른 모양이다** —
 * 형식마다 다른 것을 말하므로 shape 검사도 갈래마다 재야 한다.
 */
const pptxPreview = {
  format: 'pptx',
  pages: [{ id: 'pg1', title: '회원 목록', target: 'page:관리자/회원/목록' }],
  screenless: ['회원 목록'],
  screenFailures: [{ title: '회원 상세', reason: '페이지를 여는 데 실패했습니다' }],
  fontWarning: null,
  fileName: 'wirebound-export-proj.pptx',
}

/** `GET .../revisions?mine=true`의 항목 하나. */
const revision = {
  id: 'rev-1',
  seq: 8,
  actorType: 'user',
  actorId: 'u1',
  actorLabel: '홍길동',
  ops: [{ op: 'replace', path: '/root/children/0/props/title', value: '새' }],
  inverse: [{ op: 'replace', path: '/root/children/0/props/title', value: '옛' }],
  createdAt: '2026-08-04T09:00:00.000Z',
}

/** `catch`로 받은 값을 `ApiError`로 좁힌다. 아니면 그 자리에서 던져 테스트를 실패시킨다. */
function asApiError(value: unknown): ApiError {
  if (!(value instanceof ApiError)) {
    throw new Error(`ApiError가 아니라 ${String(value)}가 나왔다`)
  }
  return value
}

type Client = ReturnType<typeof createHttpClient>

/**
 * **경로·메서드 표.** 각 `ApiClient` 메서드가 어느 URL에 어느 HTTP 메서드로 가는가.
 *
 * `body`가 `null`이면 204(본문 없음)를 준다.
 *
 * **분모를 손으로 적지 않는다** — 아래 `표의 완전성`이 `api/client.ts`의 `ApiClient` 선언을
 * 훑어 이 표와 맞댄다. 메서드가 늘면 그 케이스가 **먼저 죽는다.**
 */
const ENDPOINTS: Array<{
  client: string
  url: string
  method: string
  body: unknown
  call: (c: Client) => Promise<unknown>
}> = [
  { client: 'login', url: '/api/auth/login', method: 'POST', body: user, call: (c) => c.login('a@b.c', 'pw') },
  { client: 'logout', url: '/api/auth/logout', method: 'POST', body: null, call: (c) => c.logout() },
  { client: 'me', url: '/api/auth/me', method: 'GET', body: user, call: (c) => c.me() },
  { client: 'listProjects', url: '/api/projects', method: 'GET', body: [project], call: (c) => c.listProjects() },
  { client: 'listMyTokens', url: '/api/auth/tokens', method: 'GET', body: [{ id: 't1', name: 'CI', createdAt: '2026-09-01T00:00:00.000Z', lastUsedAt: null, projectId: 'p1', projectName: null, member: false }], call: (c) => c.listMyTokens() },
  { client: 'revokeMyToken', url: '/api/auth/tokens/t1', method: 'DELETE', body: null, call: (c) => c.revokeMyToken('t1') },
  { client: 'revokeAllMyTokens', url: '/api/auth/tokens', method: 'DELETE', body: { revoked: 2 }, call: (c) => c.revokeAllMyTokens() },
  { client: 'getProject', url: '/api/projects/p1', method: 'GET', body: project, call: (c) => c.getProject('p1') },
  { client: 'getTree', url: '/api/projects/p1/tree', method: 'GET', body: { menu: [] }, call: (c) => c.getTree('p1') },
  { client: 'getPage', url: '/api/projects/p1/pages/pg1', method: 'GET', body: page, call: (c) => c.getPage('p1', 'pg1') },
  // **`/theme`(단수)이지 `/themes`(복수)가 아니다.** 둘 다 실재하는 경로라
  // 오타가 404가 아니라 **다른 리소스의 응답**을 받는다 — 목록(배열)이 오면
  // `SHAPES.projectTheme`이 막지만, 그 방벽 하나에 기대지 않는다.
  { client: 'getProjectTheme', url: '/api/projects/p1/theme', method: 'GET', body: projectTheme, call: (c) => c.getProjectTheme('p1') },
  // **고르기는 `/theme`(단수)에 `PUT`이다** — 목록(`/themes`)과 한 글자 차이라 위
  // `getProjectTheme`의 주석과 같은 부류이고, 여기서는 오타가 **테마 생성**(`POST /themes`)이
  // 아니라 **테마 수정**(`PUT /themes/:themeId`)으로 가므로 더 나쁘다.
  {
    client: 'setProjectTheme',
    url: '/api/projects/p1/theme',
    method: 'PUT',
    body: projectTheme,
    call: (c) => c.setProjectTheme('p1', 't1'),
  },
  {
    client: 'listProjectThemes',
    url: '/api/projects/p1/themes',
    method: 'GET',
    body: [themeSummary],
    call: (c) => c.listProjectThemes('p1'),
  },
  // --- 아래 줄들은 **각자 자기 describe에서도 URL이 단언되지만 이 표에도 있어야 한다** —
  // 표에서 빠진 것은 `표의 완전성`이 세고, 그 절이 없으면 아무도 모른다(`표의 완전성` 머리말). ---
  {
    client: 'createProject',
    url: '/api/projects',
    method: 'POST',
    body: project,
    call: (c) => c.createProject({ name: '가', slug: 'ga' }),
  },
  {
    client: 'updateProject',
    url: '/api/projects/p1',
    method: 'PATCH',
    body: project,
    call: (c) => c.updateProject('p1', { name: '가' }),
  },
  { client: 'deleteProject', url: '/api/projects/p1', method: 'DELETE', body: null, call: (c) => c.deleteProject('p1') },
  {
    client: 'createMenu',
    url: '/api/projects/p1/menu',
    method: 'POST',
    body: menuNode,
    call: (c) => c.createMenu('p1', { parentId: null, title: '가' }),
  },
  {
    client: 'updateMenu',
    url: '/api/projects/p1/menu/m1',
    method: 'PATCH',
    body: menuNode,
    call: (c) => c.updateMenu('p1', 'm1', { title: '가' }),
  },
  {
    client: 'deleteMenu',
    url: '/api/projects/p1/menu/m1',
    method: 'DELETE',
    body: null,
    call: (c) => c.deleteMenu('p1', 'm1'),
  },
  {
    client: 'createPage',
    url: '/api/projects/p1/pages',
    method: 'POST',
    body: page,
    call: (c) => c.createPage('p1', { menuNodeId: 'm1', title: '목록' }),
  },
  {
    // **`/pages/import`가 `/pages/:pageId`와 한 글자 차이가 아니다** — `import`는 uuid가
    // 아니므로 서버의 `:pageId` 라우트와 겹칠 수 없고, 오타가 나면 404다(`getProjectTheme`의
    // 주석이 말한 부류와 반대로 안전한 자리다). 그래도 표에 두는 것은 **메서드**가 틀리면
    // (`PUT`으로 보내면) 페이지 생성이 아니라 아무것도 아닌 곳으로 가기 때문이다.
    client: 'importPage',
    url: '/api/projects/p1/pages/import',
    method: 'POST',
    body: pageImported,
    call: (c) => c.importPage('p1', { menuNodeId: 'm1', file: {} }),
  },
  {
    client: 'updatePage',
    url: '/api/projects/p1/pages/pg1',
    method: 'PATCH',
    body: page,
    call: (c) => c.updatePage('p1', 'pg1', { title: '가' }),
  },
  {
    client: 'deletePage',
    url: '/api/projects/p1/pages/pg1',
    method: 'DELETE',
    body: null,
    call: (c) => c.deletePage('p1', 'pg1'),
  },
  {
    client: 'patchOps',
    url: '/api/projects/p1/pages/pg1/ops',
    method: 'PATCH',
    body: patchResult,
    call: (c) =>
      c.patchOps('p1', 'pg1', {
        baseSeq: 7,
        ops: [{ op: 'replace', path: '/root/children/0/props/title', value: '가' }],
      }),
  },
  // **쿼리까지 표에 적는다.** 선언하지 않은 쿼리 키는 그 자체로 400이므로(README)
  // `?mine=true`가 빠지거나 다른 키가 붙는 것은 경로 오타와 같은 부류의 사고다.
  {
    client: 'listMyRevisions',
    url: '/api/projects/p1/pages/pg1/revisions?mine=true',
    method: 'GET',
    body: [revision],
    call: (c) => c.listMyRevisions('p1', 'pg1'),
  },
  // **테마 저작 셋.** `getProjectTheme`의 `/theme`과 한 글자 차이인 `/themes/:id`다 —
  // 두 줄이 나란히 있어야 그 차이가 표에서 보인다.
  {
    client: 'getTheme',
    url: '/api/projects/p1/themes/t1',
    method: 'GET',
    body: themeDetail,
    call: (c) => c.getTheme('p1', 't1'),
  },
  {
    client: 'createTheme',
    url: '/api/projects/p1/themes',
    method: 'POST',
    body: themeDetail,
    call: (c) => c.createTheme('p1', { theme: { meta: { id: 'brand', name: '브랜드', version: '1.0.0' } } }),
  },
  {
    client: 'updateTheme',
    url: '/api/projects/p1/themes/t1',
    method: 'PUT',
    body: themeDetail,
    call: (c) =>
      c.updateTheme('p1', 't1', { theme: { meta: { id: 'brand', name: '브랜드', version: '1.0.0' } } }),
  },
  // **코멘트 다섯.** 전부 `.../pages/:pageId/comments` 아래다 — 코멘트는 프로젝트가
  // 아니라 **페이지의 노드**에 붙는다. 이 다섯 줄을 빼면 `표의 완전성`의 두 케이스가
  // 죽는다.
  {
    client: 'listComments',
    url: '/api/projects/p1/pages/pg1/comments',
    method: 'GET',
    body: [comment],
    call: (c) => c.listComments('p1', 'pg1'),
  },
  {
    client: 'createComment',
    url: '/api/projects/p1/pages/pg1/comments',
    method: 'POST',
    body: commentCreated,
    call: (c) => c.createComment('p1', 'pg1', { nodeId: 'n_000000000001', body: '가' }),
  },
  {
    client: 'updateComment',
    url: '/api/projects/p1/pages/pg1/comments/c1',
    method: 'PATCH',
    body: comment,
    call: (c) => c.updateComment('p1', 'pg1', 'c1', { body: '가' }),
  },
  // **`DELETE`인데 `body`가 `null`이 아니다** — 다른 삭제 셋과 갈린다. 이 삭제는 문서를
  // 바꿀 수 있어 200에 `{ seq, markerOps }`를 싣는다(서버 README).
  {
    client: 'deleteComment',
    url: '/api/projects/p1/pages/pg1/comments/c1',
    method: 'DELETE',
    body: markerChange,
    call: (c) => c.deleteComment('p1', 'pg1', 'c1'),
  },
  // **`/renumber`는 정적 세그먼트다** — `:commentId` 자리와 한 칸 차이라 나란히 둔다.
  {
    client: 'renumberComments',
    url: '/api/projects/p1/pages/pg1/comments/renumber',
    method: 'POST',
    body: markerChange,
    call: (c) => c.renumberComments('p1', 'pg1'),
  },
  // **스냅샷 둘.** 프로젝트 아래이고 페이지를 지나지 않는다 — 스냅샷은 프로젝트
  // **전체** 상태를 얼린다(설계서 「스냅샷」).
  {
    client: 'listSnapshots',
    url: '/api/projects/p1/snapshots',
    method: 'GET',
    body: [snapshot],
    call: (c) => c.listSnapshots('p1'),
  },
  {
    client: 'createSnapshot',
    url: '/api/projects/p1/snapshots',
    method: 'POST',
    body: snapshot,
    call: (c) => c.createSnapshot('p1', { tag: 'v1', description: '첫 릴리스 직전' }),
  },
  // **프리셋 둘.** 스냅샷과 같은 자리(프로젝트 아래, 페이지를 지나지 않는다)이고
  // 이유도 같다 — 프리셋은 **페이지를 건너 다니는** 템플릿이라 특정 페이지에 매이지 않는다.
  {
    client: 'listPresets',
    url: '/api/projects/p1/presets',
    method: 'GET',
    body: [preset],
    call: (c) => c.listPresets('p1'),
  },
  {
    client: 'createPreset',
    url: '/api/projects/p1/presets',
    method: 'POST',
    body: preset,
    call: (c) => c.createPreset('p1', { name: '내 프리셋', schema: [{ id: 'a', type: 'List' }] }),
  },
  // **복원은 `:snapshotId` 아래의 정적 세그먼트다** — `GET .../snapshots/:id`(상세)와
  // 한 칸 차이인데 그쪽은 `ApiClient`에 없다(payload를 읽는 것은 서버다).
  {
    client: 'restoreSnapshot',
    url: '/api/projects/p1/snapshots/s1/restore',
    method: 'POST',
    body: restoreResult,
    call: (c) => c.restoreSnapshot('p1', 's1'),
  },
  // **형식이 쿼리로 간다**(새 라우트가 아니라 `?format=`이다). `html`에도 붙는다:
  // 생략하는 가지를 두면 형식을 붙이는 길과 안 붙이는 길이 둘 생긴다(`http-client.ts`).
  {
    client: 'getExportPreview',
    url: '/api/projects/p1/export/preview?format=html',
    method: 'GET',
    body: exportPreview,
    call: (c) => c.getExportPreview('p1', 'html'),
  },
  {
    client: 'getExportPreview',
    url: '/api/projects/p1/export/preview?format=pptx',
    method: 'GET',
    body: pptxPreview,
    call: (c) => c.getExportPreview('p1', 'pptx'),
  },
  // **파일 그 자체.** 이 표는 주소와 메서드만 잰다 — 이 표의 응답은 JSON 이라 `downloadExport`가 «형식이 아니다»로 거절하고,
  // 그것은 아래 `downloadExport` 케이스들이 잰다.
  {
    client: 'downloadExport',
    url: '/api/projects/p1/export?format=html',
    method: 'GET',
    body: {},
    call: (c) => c.downloadExport('p1', 'html').catch(() => null),
  },
  {
    client: 'downloadExport',
    url: '/api/projects/p1/export?format=pptx',
    method: 'GET',
    body: {},
    call: (c) => c.downloadExport('p1', 'pptx').catch(() => null),
  },
]

/**
 * **응답 모양 케이스의 표.** `http-client.ts`의 `SHAPES` 하나마다 *"계약 밖 응답을 실제로
 * 끊는가"*를 잰다.
 *
 * **분모를 손으로 적지 않는다** — 아래 `표의 완전성`이 `http-client.ts`의 `SHAPES` 선언을
 * 훑어 이 표와 맞댄다. shape가 늘면 그 케이스가 **먼저 죽는다.**
 */
const SHAPE_CASES: Array<{
  shape: string
  /** 계약을 어긴 응답 본문. 이것을 주면 `ApiError`여야 한다. */
  broken: unknown
  /** 계약을 지킨 응답 본문. 이것을 주면 통과해야 한다 — 과도 차단을 재는 자리다. */
  ok: unknown
  call: (c: Client) => Promise<unknown>
}> = [
  { shape: 'projectDetail', broken: { ...project, id: '' }, ok: project, call: (c) => c.getProject('p1') },
  { shape: 'projectList', broken: [{ ...project, id: '' }], ok: [project], call: (c) => c.listProjects() },
  // 폐기 주소가 되는 `id`는 빈 문자열까지 막는다 — 그 밖의 칸은 모양만 본다.
  { shape: 'myTokens', broken: [{ ...{ id: 't1', name: 'CI', createdAt: '2026-09-01T00:00:00.000Z', lastUsedAt: null, projectId: 'p1', projectName: null, member: false }, id: '' }], ok: [{ id: 't1', name: 'CI', createdAt: '2026-09-01T00:00:00.000Z', lastUsedAt: null, projectId: 'p1', projectName: null, member: false }], call: (c) => c.listMyTokens() },
  { shape: 'revokedCount', broken: { revoked: '2' }, ok: { revoked: 2 }, call: (c) => c.revokeAllMyTokens() },
  { shape: 'treeEnvelope', broken: { menu: null }, ok: { menu: [treeNode] }, call: (c) => c.getTree('p1') },
  {
    shape: 'menuNode',
    broken: { ...menuNode, sortOrder: '0' },
    ok: menuNode,
    call: (c) => c.createMenu('p1', { parentId: null, title: '가' }),
  },
  { shape: 'pageDetail', broken: { ...page, headSeq: '0' }, ok: page, call: (c) => c.getPage('p1', 'pg1') },
  {
    // **`page.id`가 빈 문자열이면 막는다** — 가져오기가 성공하면 그 값이 그대로 주소가
    // 되고(`use-tree-commands.tsx`의 `importJson`), `/projects/p1/pages/`는 어느 라우트도
    // 잡지 않아 **화면이 통째로 빈다**(`pageDetail`의 실측 표).
    shape: 'pageImported',
    broken: { ...pageImported, page: { ...page, id: '' } },
    ok: pageImported,
    call: (c) => c.importPage('p1', { menuNodeId: 'm1', file: {} }),
  },
  {
    shape: 'projectTheme',
    broken: { themeId: null, theme: 42, issues: [] },
    ok: projectTheme,
    call: (c) => c.getProjectTheme('p1'),
  },
  {
    // **`id`가 빈 문자열이면 막는다** — 그 값이 그대로 `setProjectTheme`의 본문이 되고,
    // 서버의 `z.uuid()`가 400을 낸다. 사용자는 고르개를 눌렀는데 이유 없는 실패를 본다.
    shape: 'themeList',
    broken: [{ ...themeSummary, id: '' }],
    ok: [themeSummary],
    call: (c) => c.listProjectThemes('p1'),
  },
  {
    // **`warnings`가 배열이 아니면 막는다** — 그 값을 저장 성공 경로에서 화면이 `.map`한다.
    // `id: ''`도 같은 부류지만(생성 응답의 `id`가 주소가 된다) 한 줄에 하나만 심는다.
    shape: 'themeDetail',
    broken: { ...themeDetail, warnings: 'none' },
    ok: themeDetail,
    call: (c) => c.getTheme('p1', 't1'),
  },
  // --- 아래 셋이 빠지면 세는 절(`표의 완전성`)이 찾아낸다. ---
  // `sessionUser.id`는 세션 문맥이 그대로 들고 다니는 값이다(`session/session-context.tsx`).
  { shape: 'sessionUser', broken: { id: 42 }, ok: user, call: (c) => c.me() },
  // **`inverse`가 배열이 아니면 undo가 그것을 `ops`로 보내다 죽는다**(그 shape의 주석).
  {
    shape: 'revisionList',
    broken: [{ ...revision, inverse: null }],
    ok: [revision],
    call: (c) => c.listMyRevisions('p1', 'pg1'),
  },
  // **`seq`가 다음 요청의 `baseSeq`가 된다** — 문자열이 지나가면 그 값이 조용히 어긋난다.
  {
    shape: 'patchResult',
    broken: { ...patchResult, seq: '8' },
    ok: patchResult,
    call: (c) =>
      c.patchOps('p1', 'pg1', {
        baseSeq: 7,
        ops: [{ op: 'replace', path: '/root/children/0/props/title', value: '가' }],
      }),
  },
  // --- 코멘트 넷. ---
  // **`nodeId`가 문자열이 아니면 막는다** — 그 값이 문서에서 노드를 찾는 키이고, 어긋나면
  // 모든 코멘트가 "사라진 노드" 무리로 떨어져 번호가 하나도 안 붙는다.
  { shape: 'comment', broken: { ...comment, nodeId: 42 }, ok: comment, call: (c) => c.updateComment('p1', 'pg1', 'c1', { body: '가' }) },
  // **`id`가 빈 문자열이면 막는다** — 그 값이 수정·삭제 요청의 경로가 된다
  // (`themeList`의 `id`와 같은 축: 주소가 되지는 않지만 **요청 경로가 되는** 값).
  { shape: 'commentList', broken: [{ ...comment, id: '' }], ok: [comment], call: (c) => c.listComments('p1', 'pg1') },
  // **`markerOps`가 배열이 아니면 막는다** — 그 값이 그대로 `applyOps`에 들어간다
  // (`patchResult.inverse`와 같은 하중).
  {
    shape: 'commentCreated',
    broken: { ...commentCreated, markerOps: null },
    ok: commentCreated,
    call: (c) => c.createComment('p1', 'pg1', { nodeId: 'n_000000000001', body: '가' }),
  },
  // **`seq`가 문자열이면 막는다** — 그 값이 `headSeq`가 되고 다음 편집의 `baseSeq`가 된다.
  {
    shape: 'markerChange',
    broken: { ...markerChange, seq: '9' },
    ok: markerChange,
    call: (c) => c.deleteComment('p1', 'pg1', 'c1'),
  },
  // --- 스냅샷 둘. ---
  // **`payloadBytes`가 숫자가 아니면 막는다** — 화면이 그 값에 `toLocaleString`을 부르므로
  // 문자열이 오면 그 자리에서 던진다(이 화면은 오류 경계 밖이다).
  {
    shape: 'snapshot',
    broken: { ...snapshot, payloadBytes: '8123' },
    ok: snapshot,
    call: (c) => c.createSnapshot('p1', { tag: 'v1' }),
  },
  // **`id`가 빈 문자열이면 막는다** — 그 값이 React 목록의 `key`다(`commentList`와 같은 축).
  {
    shape: 'snapshotList',
    broken: [{ ...snapshot, id: '' }],
    ok: [snapshot],
    call: (c) => c.listSnapshots('p1'),
  },
  // --- 프리셋 둘. ---
  // **`nodes`가 배열이 아니면 막는다** — 그 값이 `presetApply`에 그대로 들어가고 그
  // 함수가 `[...nodes]`에서 던진다(구조 트리는 오류 경계 밖이다).
  {
    shape: 'preset',
    broken: { ...preset, nodes: null },
    ok: preset,
    call: (c) => c.createPreset('p1', { name: '내 프리셋', schema: [] }),
  },
  // **`id`가 빈 문자열이면 막는다** — 그 값이 `<option>`의 값이자 React 목록의 `key`다
  // (`snapshotList`와 같은 축).
  {
    shape: 'presetList',
    broken: [{ ...preset, id: '' }],
    ok: [preset],
    call: (c) => c.listPresets('p1'),
  },
  // --- 복원. ---
  // **`themes`가 배열이 아니면 막는다** — 결과 알림이 `.some(...)`으로 훑으므로 배열이
  // 아니면 **렌더 도중 던진다.** 다른 두 값(바뀐 수·안전망 태그)은 이상한 글자가 보일 뿐이라
  // 손해의 등급이 다르다(`pageDetail`의 `schema.root`가 같은 부류다).
  {
    shape: 'restoreResult',
    broken: { ...restoreResult, themes: null },
    ok: restoreResult,
    call: (c) => c.restoreSnapshot('p1', 's1'),
  },
  {
    // **`brokenLinks`가 배열이 아니면 화면이 전개하다 던진다** — 이 화면을 감싸는 오류
    // 경계가 없다(`apps/web`의 경계는 캔버스와 테마 갤러리뿐이다).
    shape: 'exportPreview',
    broken: { ...exportPreview, brokenLinks: null },
    ok: exportPreview,
    call: (c) => c.getExportPreview('p1', 'html'),
  },
  {
    // **pptx 갈래는 다른 배열들을 든다.** `format`을 안 보고 통과시키면 화면이
    // 그것을 pptx로 그리다 `undefined.map`에서 죽는다.
    shape: 'exportPreview',
    broken: { ...pptxPreview, screenFailures: null },
    ok: pptxPreview,
    call: (c) => c.getExportPreview('p1', 'pptx'),
  },
  {
    // **모르는 형식도 막는다** — 화면의 두 갈래 어느 쪽도 안 그려 상자가 조용히 빈다.
    shape: 'exportPreview',
    broken: { ...exportPreview, format: 'docx' },
    ok: exportPreview,
    call: (c) => c.getExportPreview('p1', 'html'),
  },
]

/**
 * 계약 밖 응답을 만들 수 없는 shape. **`noBody`는 `() => true`라 어길 값이 존재하지 않는다** —
 * 본문을 읽지 않는 요청(204·DELETE·logout)이 지나는 자리다.
 */
const SHAPES_WITHOUT_BROKEN_CASE = ['noBody']

/**
 * 요청을 보내지 않는 `ApiClient` 메서드 — 위 경로·메서드 표는 *"부르면 이 URL로 간다"*를 재므로 이런 것이 들 자리가
 * 없다. 지금은 없다. 생기면 그 메서드가 내는 값을 따로 못박는 케이스와 함께 여기 적는다.
 */
const METHODS_WITHOUT_REQUEST: string[] = []

/** `src/api`의 소스. 표의 분모를 소스에서 만든다(`test/api-consumers.test.ts`와 같은 배치). */
const API_SOURCES = import.meta.glob('../../src/api/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/**
 * **표가 스스로 센다.**
 *
 * 새 엔드포인트가 이 파일의 두 표 어디에도 등록되지 않으면 **두 자리가 초록인 채로
 * 무방비**이고, 변이를 심기 전에는 드러나지 않는다. *"찾은 것을 닫는"* 것으로는 매번 하나가
 * 남는다 — 남는 개수가 리뷰의 성실함에 달려 있고 코드의 안전성과는 관계가 없기 때문이다.
 * `apps/api/test/permission-matrix.test.ts`가 같은 이유로 같은 이름의 절을 갖는다.
 */
describe('표의 완전성', () => {
  it('훑을 소스를 실제로 읽는다', () => {
    // 글롭이 어긋나면 **빈 문자열에서 아래가 조용히 통과한다.**
    expect(Object.keys(API_SOURCES).length).toBeGreaterThan(1)
    expect(declaredMethods().length).toBeGreaterThan(10)
    expect(declaredShapes().length).toBeGreaterThan(5)
  })

  it('ApiClient의 모든 메서드가 경로·메서드 표에 있다', () => {
    const registered = new Set([
      ...ENDPOINTS.map((endpoint) => endpoint.client),
      ...METHODS_WITHOUT_REQUEST,
    ])

    expect(declaredMethods().filter((method) => !registered.has(method))).toEqual([])
  })

  it('경로·메서드 표에 ApiClient가 선언하지 않은 메서드가 없다', () => {
    // 반대 방향. 줄은 있는데 그런 메서드가 없으면 그 줄은 **아무것도 지키지 않는다.**
    const declared = new Set(declaredMethods())

    expect(ENDPOINTS.map((endpoint) => endpoint.client).filter((name) => !declared.has(name))).toEqual([])
  })

  it('SHAPES의 모든 키가 응답 모양 케이스에 있다', () => {
    const registered = new Set([...SHAPE_CASES.map((c) => c.shape), ...SHAPES_WITHOUT_BROKEN_CASE])

    expect(declaredShapes().filter((shape) => !registered.has(shape))).toEqual([])
  })

  it('응답 모양 케이스에 SHAPES가 선언하지 않은 이름이 없다', () => {
    const declared = new Set(declaredShapes())

    expect(
      [...SHAPE_CASES.map((c) => c.shape), ...SHAPES_WITHOUT_BROKEN_CASE].filter(
        (shape) => !declared.has(shape),
      ),
    ).toEqual([])
  })
})

/**
 * `ApiClient` 인터페이스가 선언한 메서드 이름. **주석을 걷고 읽는다** — 이 저장소의 주석은
 * 메서드 이름을 실제로 인용한다(`api-consumers.test.ts` 머리말).
 *
 * 인터페이스의 닫는 중괄호까지만 자른다 — 더 가면 아래 `class ApiError`의 `constructor`가
 * 메서드로 세어진다.
 */
function declaredMethods(): string[] {
  const body = stripComments(API_SOURCES['../../src/api/client.ts'] ?? '')
  const start = body.indexOf('export interface ApiClient {')
  const declaration = body.slice(start, body.indexOf('\n}', start))
  return [...declaration.matchAll(/^ {2}(\w+)\s*[(<]/gm)].map((m) => m[1] ?? '')
}

/** `http-client.ts`의 `SHAPES` 레코드가 선언한 키. 같은 이유로 주석을 걷는다. */
function declaredShapes(): string[] {
  const body = stripComments(API_SOURCES['../../src/api/http-client.ts'] ?? '')
  const start = body.indexOf('const SHAPES = {')
  const declaration = body.slice(start, body.indexOf('\n} satisfies', start))
  return [...declaration.matchAll(/^ {2}(\w+):/gm)].map((m) => m[1] ?? '')
}

/**
 * **`downloadExport` — 파일을 받아 온다**(`shell/export-panel.tsx`의 «내려받기는 받아 온 뒤 저장한다»). 실패가 다른 요청처럼
 * `ApiError`로 와야 화면이 말할 수 있다 — 앵커로 받던 때는 그 실패가 브라우저의 내려받기 목록에만 남았다.
 */
describe('downloadExport', () => {
  const ZIP = 'application/zip'
  const PPTX = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'

  it('받은 바이트를 그대로 Blob 으로 돌려준다 — 쿠키를 싣고 시간 제한을 안 건다', async () => {
    const bytes = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0xff])
    const stub = stubFetch(new Response(bytes, { status: 200, headers: { 'content-type': ZIP } }))
    const blob = await createHttpClient(stub.fetchImpl).downloadExport('p1', 'html')

    // jsdom 의 `Blob`에는 `arrayBuffer()`가 없다 — `FileReader`로 읽는다.
    const read = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(blob)
    })
    expect(new Uint8Array(read)).toEqual(bytes)
    expect(stub.calls[0]?.init?.credentials).toBe('same-origin')
    // 시간 제한이 걸리면 `fetchInTime`이 제 신호를 싣는다 — 받은 끊을 신호가 없으면 신호도 없어야 한다.
    expect(stub.calls[0]?.init?.signal).toBeUndefined()
  })

  it('pptx 형식도 받는다', async () => {
    const stub = stubFetch(new Response(new Uint8Array([1, 2]), { status: 200, headers: { 'content-type': PPTX } }))
    await expect(createHttpClient(stub.fetchImpl).downloadExport('p1', 'pptx')).resolves.toBeInstanceOf(Blob)
  })

  it('서버가 거절하면 그 봉투를 ApiError 로 던진다 — 503 · 409 의 문장이 화면에 간다', async () => {
    for (const [status, code, message] of [
      [503, 'internal', '내 내보내기가 이미 돌고 있습니다 — 앞의 것이 끝난 뒤 다시 시도하세요'],
      [409, 'conflict', '내보낼 페이지가 없습니다'],
    ] as const) {
      const stub = stubFetch(jsonResponse(status, { error: { code, message } }))
      const error = asApiError(await createHttpClient(stub.fetchImpl).downloadExport('p1', 'html').catch((e: unknown) => e))
      expect([error.status, error.code, error.message]).toEqual([status, code, message])
    }
  })

  /**
   * **형식 이름은 대소문자를 안 가린다**(MIME 의 타입 · 하위 타입은 대소문자 무관 — RFC 9110 「Media Type」). 서버는 소문자로
   * 내지만 앞단(프록시 · CDN)이 바꿔 실어도 멀쩡한 파일을 «이해할 수 없다»로 버리면 안 된다.
   */
  it('형식 이름의 대소문자가 달라도 받는다', async () => {
    const stub = stubFetch(new Response(new Uint8Array([1, 2]), { status: 200, headers: { 'content-type': 'Application/ZIP' } }))
    await expect(createHttpClient(stub.fetchImpl).downloadExport('p1', 'html')).resolves.toBeInstanceOf(Blob)
  })

  it('200 이어도 파일 형식이 아니면 끊는다 — 프록시가 빠진 개발 서버의 index.html 을 파일로 저장하지 않는다', async () => {
    const stub = stubFetch(htmlResponse(200))
    const error = asApiError(await createHttpClient(stub.fetchImpl).downloadExport('p1', 'html').catch((e: unknown) => e))
    expect(error.message).toBe('서버 응답을 이해할 수 없습니다')
  })

  it('끊을 신호를 fetch 에 싣는다 — 끊기면 «떠난 화면»으로 거절한다', async () => {
    const cancel = new AbortController()
    const fetchImpl: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    const pending = createHttpClient(fetchImpl).downloadExport('p1', 'html', { cancel: cancel.signal }).catch((e: unknown) => e)
    cancel.abort()
    expect(asApiError(await pending).message).toBe('떠난 화면의 조회를 끊었습니다')
  })
})

describe('createHttpClient', () => {
  it('login은 이메일과 비밀번호를 POST하고 사용자를 돌려준다', async () => {
    const stub = stubFetch(jsonResponse(200, user))
    const client = createHttpClient(stub.fetchImpl)

    const result = await client.login('a@b.c', 'pw1234!')

    expect(stub.calls[0]?.url).toBe('/api/auth/login')
    expect(stub.calls[0]?.init?.method).toBe('POST')
    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ email: 'a@b.c', password: 'pw1234!' })
    expect(result).toEqual(user)
  })

  it('getTree는 봉투를 벗겨 배열을 돌려준다', async () => {
    // 서버는 이 엔드포인트에서만 `{ menu }` 봉투를 쓴다(README "트리 응답 형태").
    // 그 관용구를 앱 안으로 들이지 않는다 — 호출자는 배열만 본다.
    const stub = stubFetch(jsonResponse(200, { menu: [treeNode] }))
    const client = createHttpClient(stub.fetchImpl)

    const result = await client.getTree('p1')

    expect(result).toEqual([treeNode])
  })

  // **아래 셋은 매 렌더마다 주소가 된다.** 관문이 없으면(진짜 `<App />`로 잰 값):
  //
  //   `TreePage.id: ''`      → `PageLink`가 `/projects/p1/pages/`     → innerHTML 0자, `.wb-shell` 없음
  //   `ProjectDetail.id: ''` → 같은 `PageLink`가 `/projects/pages/pg1` → 0자, 없음
  //                            (`routes/editor.tsx`가 **조회해 온** id를 트리에 넘긴다)
  //   목록의 `ProjectDetail.id: ''` → `<Link>`가 `/projects/`          → 0자, 없음
  //
  // `app.tsx`에 `*` 라우트가 없어 어느 것도 잡히지 않는다. `SHAPES.pageDetail`이 막는 것과
  // **같은 결과**인데 이쪽이 먼저 도달한다.
  //
  // **갈래를 나눠 둔 것은 구분력 때문이다** — 한 `it`에 묶으면 `isTreePage`를 고쳐도
  // `isProjectDetail`을 고쳐도 "1 사망"으로 같아 보여 어느 검사가 무엇을 지키는지 드러나지 않는다.
  it('트리의 페이지 id가 빈 문자열이면 ApiError를 던진다', async () => {
    const menu = [
      { id: 'm1', title: '메뉴', sortOrder: 0, pages: [{ id: '', title: '목록', sortOrder: 0 }], children: [] },
    ]
    const stub = stubFetch(jsonResponse(200, { menu }))

    const error = asApiError(await createHttpClient(stub.fetchImpl).getTree('p1').catch((e: unknown) => e))

    expect(error.code).toBe('internal')
  })

  it('프로젝트 id가 빈 문자열이면 ApiError를 던진다', async () => {
    const stub = stubFetch(jsonResponse(200, { ...project, id: '' }))

    const error = asApiError(await createHttpClient(stub.fetchImpl).getProject('p1').catch((e: unknown) => e))

    expect(error.code).toBe('internal')
  })

  it('프로젝트 목록의 id가 빈 문자열이면 ApiError를 던진다', async () => {
    // 목록과 상세가 같은 `isProjectDetail`을 지나지만 부르는 자리가 달라 따로 본다.
    const stub = stubFetch(jsonResponse(200, [{ ...project, id: '' }]))

    const error = asApiError(await createHttpClient(stub.fetchImpl).listProjects().catch((e: unknown) => e))

    expect(error.code).toBe('internal')
  })

  it('프로젝트의 description이 문자열도 null도 아니면 ApiError를 던진다', async () => {
    // **이것만 화면을 통째로 비운다.** 목록의 `<p>{project.description}</p>`가 그 값을
    // React 자식으로 그리는데, **React가 그리지 못하는 객체가 닿으면** React가
    // `Objects are not valid as a React child`를 던지고 **목록에 오류 경계가 없다**
    // (`apps/web/src`에서 경계는 캔버스의 `CanvasBoundary`와 테마 갤러리의 `GalleryBoundary`뿐이다).
    //
    // **실측(진짜 `<App />`, 계약 밖 값을 관문에 태워 목록까지 보냈다):**
    //
    // | `description` | `<main>` | `innerHTML` |
    // |---|---|---|
    // | `{}` · `{x:1}` · `[{x:1}]` · `[[{}]]` | **없음** | **11자** |
    // | `[1,2]` · `42` · `true` · 키 없음 | 있음 | 277~279자 |
    // | `null` · `''` · 공백 · 2000자 | 있음 | 270~2277자 |
    //
    // **갈리는 축은 "이터러블인가"다.** 이터러블이 아닌 객체(`{}`·`Date`·
    // 정규식·`Object.create(null)`)와 그런 객체를 **담은** 이터러블(`[{x:1}]`·`Set([{x:1}])`)이
    // 죽고, 원소가 그릴 수 있는 이터러블(`[1,2]`·`Map([['a',1]])`·제너레이터·빈 것들)은 산다.
    // **함수와 Symbol도 산다** — React가 그리지 않고 지나간다. 축을 *"객체를 품으면"*으로
    // 잡으면 이 사는 값들이 반례가 된다.
    //
    // 그래도 검사는 "문자열이거나 `null`"로 두고 나머지를 전부 막는다: 계약이 그 둘뿐이고,
    // 통과시킬 이유가 있는 값이 그 밖에 없다.
    const broken: unknown[] = [{}, { x: 1 }, [{ x: 1 }], [[{}]], [1, 2], 42, true]

    for (const description of broken) {
      const stub = stubFetch(jsonResponse(200, [{ ...project, description }]))

      const error = asApiError(
        await createHttpClient(stub.fetchImpl).listProjects().catch((e: unknown) => e),
      )

      expect(error.code, JSON.stringify(description)).toBe('internal')
    }
  })

  it('description 키가 없어도 막는다', async () => {
    // 키 없음은 화면을 죽이지 않지만(`undefined`는 React가 그리지 않는다) **계약은 그 키를
    // 약속한다.** 여기서 통과시키면 `ProjectDetail.description`을 읽는 다음 소비자가
    // `string | null`이라는 타입을 믿고 `undefined`를 받는다.
    const { description: _dropped, ...withoutDescription } = project
    const stub = stubFetch(jsonResponse(200, [withoutDescription]))

    const error = asApiError(
      await createHttpClient(stub.fetchImpl).listProjects().catch((e: unknown) => e),
    )

    expect(error.code).toBe('internal')
  })

  it('slug와 role은 계약을 어겨도 통과시킨다', async () => {
    // **과도 차단을 재는 자리이자 범위를 못박는 자리다.** 셋 다 같은 레코드의 키인데
    // `description`만 막는다 — **그 셋이 화면에서 갈리기 때문이다**(전부 진짜 `<App />`로 쟀다):
    //
    // | 키 | 계약 밖 값이 닿는 곳 | 관측 |
    // |---|---|---|
    // | `description` | 목록의 `<p>` 자식 | **화면이 통째로 빈다**(11자) |
    // | `slug` | 수정 폼의 `<input value>` | 폼이 열리고 화면이 산다(629자) |
    // | `role` | `projectAbilities`의 `!== 'owner'` 비교 | 버튼만 닫히고 화면이 산다(190자) |
    //
    // **`role`을 막지 않는 것이 특히 의도다.** `projectAbilities`는 계약 밖 값을 받아 닫도록
    // 만들어졌고(그쪽 케이스 `계약에 없는 역할 문자열은 아무것도 열지 않는다`), 여기서 막으면
    // **그 프로젝트의 버튼이 닫히는 대신 목록 전체가 막힌다.** 손해가 더 크다.
    //
    // 즉 이 관문이 막는 기준은 "계약을 어겼는가"가 아니라 **"어겼을 때 화면이 통째로 비는가"**다
    // — `id`의 빈 문자열(주소가 된다)·`name`(링크의 자식)이 막히는 것도 같은 기준이다.
    const passing: Partial<ProjectDetail>[] = [
      { slug: 42 as unknown as string },
      { slug: { x: 1 } as unknown as string },
      { role: 'admin' as ProjectDetail['role'] },
      { role: { x: 1 } as unknown as ProjectDetail['role'] },
    ]

    for (const patch of passing) {
      const stub = stubFetch(jsonResponse(200, [{ ...project, ...patch }]))
      await expect(
        createHttpClient(stub.fetchImpl).listProjects(),
        JSON.stringify(patch),
      ).resolves.toHaveLength(1)
    }
  })

  it('정상 description은 그대로 통과한다', async () => {
    // 음성 대조. 위 검사가 좁으므로 정상값이 막히지 않는지 따로 본다.
    for (const description of [null, '', '   ', 'ㄱ'.repeat(2000), '줄\n바꿈']) {
      const stub = stubFetch(jsonResponse(200, [{ ...project, description }]))
      await expect(
        createHttpClient(stub.fetchImpl).listProjects(),
        String(description),
      ).resolves.toHaveLength(1)
    }
  })

  it('비어 있지 않은 id는 그대로 통과한다', async () => {
    // **과도 차단을 재는 자리다.** 위 검사가 "문자열이면 통과"보다 좁으므로, 정상 id가
    // 막히지 않는지 따로 본다. 공백 한 칸은 통과해야 한다 — 실측으로 그 주소는 라우트가
    // 잡히고 셸이 산다(`/projects/p1/pages/%20`).
    const ids = ['pg1', ' ', '0', '한글', '../x', '/', 'a'.repeat(200), '3f2504e0-4f89-11d3-9a0c-0305e82c3301']

    for (const id of ids) {
      const treeStub = stubFetch(jsonResponse(200, { menu: [{ ...treeNode, pages: [{ id, title: '목록', sortOrder: 0 }], children: [] }] }))
      await expect(createHttpClient(treeStub.fetchImpl).getTree('p1'), id).resolves.toBeDefined()

      const projectStub = stubFetch(jsonResponse(200, { ...project, id }))
      await expect(createHttpClient(projectStub.fetchImpl).getProject('p1'), id).resolves.toBeDefined()
    }
  })

  it("모든 요청에 credentials: 'same-origin'이 붙는다", async () => {
    // 본문이 있는 요청과 없는 요청, GET과 POST를 섞어 부른다 — 한 곳에만 붙인
    // 구현이 통과하지 못하게 하려는 것이다.
    const stub = stubFetch(jsonResponse(200, user), jsonResponse(200, user), jsonResponse(200, { menu: [] }))
    const client = createHttpClient(stub.fetchImpl)

    await client.login('a@b.c', 'pw')
    await client.me()
    await client.getTree('p1')

    expect(stub.calls).toHaveLength(3)
    for (const call of stub.calls) {
      expect(call.init?.credentials).toBe('same-origin')
    }
  })

  it('쓰기 다섯은 받은 `signal`을 fetch 에 싣는다 — 안 받으면 키를 만들지 않는다', async () => {
    // 우측 패널의 쓰기 장부(`panels/write-ledger.tsx`)가 시간이 지나면 이것으로 요청을 끊는다.
    // 빠지면 장부는 «모름»으로 가서 판정하는데 요청은 브라우저에 남는다 — 서버에 아직 안 닿은 요청이
    // **판정 뒤에** 가서 커밋될 수 있다(Chrome: 끊으면 `ERR_ABORTED`이고 서버 로그에 그 요청이 없다).
    //
    // **안 받으면 키가 없다** — 위 `credentials` 주석처럼 기존 케이스가 `init`을 통째로 단언한다.
    const writes: [string, (client: ReturnType<typeof createHttpClient>, signal?: AbortSignal) => Promise<unknown>, () => Response][] = [
      ['updatePage', (c, signal) => c.updatePage('p1', 'pg1', { description: '가' }, signal && { signal }), () => jsonResponse(200, page)],
      ['createComment', (c, signal) => c.createComment('p1', 'pg1', { nodeId: 'n_000000000001', body: '가' }, signal && { signal }), () => jsonResponse(201, commentCreated)],
      ['updateComment', (c, signal) => c.updateComment('p1', 'pg1', 'c1', { body: '가' }, signal && { signal }), () => jsonResponse(200, comment)],
      ['deleteComment', (c, signal) => c.deleteComment('p1', 'pg1', 'c1', signal && { signal }), () => jsonResponse(200, markerChange)],
      ['renumberComments', (c, signal) => c.renumberComments('p1', 'pg1', signal && { signal }), () => jsonResponse(200, markerChange)],
    ]

    for (const [name, call, response] of writes) {
      const signal = new AbortController().signal
      const given = stubFetch(response())
      await call(createHttpClient(given.fetchImpl), signal)
      expect(given.calls[0]?.init?.signal, name).toBe(signal)

      const none = stubFetch(response())
      await call(createHttpClient(none.fetchImpl))
      expect(Object.keys(none.calls[0]?.init ?? {}), name).not.toContain('signal')
    }
  })

  it('판정용 읽기 둘은 받은 `signal`을 fetch 에 그대로 싣는다 — 안 받으면 일반 읽기의 시간 제한 신호다', async () => {
    // 쓰기 장부가 **판정용 다시 읽기**에도 시간 제한을 두고 넘으면 이것으로 끊는다(`panels/write-ledger.tsx`의
    // `race`). 빠지면 장부는 «모름»으로 가는데 매달린 읽기가 브라우저에 남는다. **받은 신호가 있으면 여기서 시간을
    // 안 건다** — 두 시계가 한 요청을 다투지 않게(`http-client.ts`의 `READ_DEADLINE_MS`). 안 받으면 일반 읽기의
    // 시간 제한 신호가 실린다 — 키가 없으면 매달린 읽기가 끝없이 남는다.
    const reads: [string, (client: ReturnType<typeof createHttpClient>, signal?: AbortSignal) => Promise<unknown>, () => Response][] = [
      ['getPage', (c, signal) => c.getPage('p1', 'pg1', signal && { signal }), () => jsonResponse(200, page)],
      ['listComments', (c, signal) => c.listComments('p1', 'pg1', signal && { signal }), () => jsonResponse(200, [comment])],
    ]

    for (const [name, call, response] of reads) {
      const signal = new AbortController().signal
      const given = stubFetch(response())
      await call(createHttpClient(given.fetchImpl), signal)
      expect(given.calls[0]?.init?.signal, name).toBe(signal)

      const none = stubFetch(response())
      await call(createHttpClient(none.fetchImpl))
      expect(none.calls[0]?.init?.signal, name).toBeInstanceOf(AbortSignal)
      expect(none.calls[0]?.init?.signal?.aborted, name).toBe(false)
    }
  })

  it("getPage 는 HTTP 캐시를 안 지난다(`cache: 'no-store'`) — 다른 읽기는 캐시 모드를 안 싣는다", async () => {
    // 설명 저장(`PATCH …/pages/:id`)과 같은 URL 이라, 기본 모드면 저장이 서버에 매달린 동안 Chrome 의 HTTP
    // 캐시 잠금에 선다(`http-client.ts`의 `getPage` 주석 — 20016ms vs 10ms). **목록은 안 싣는다** — 게시
    // (`POST`)는 잠금을 안 건다(같은 측정에서 12ms). 번지지 않았는지를 같이 본다.
    const pageFetch = stubFetch(jsonResponse(200, page))
    await createHttpClient(pageFetch.fetchImpl).getPage('p1', 'pg1')
    expect(pageFetch.calls[0]?.init?.cache).toBe('no-store')

    const listFetch = stubFetch(jsonResponse(200, [comment]))
    await createHttpClient(listFetch.fetchImpl).listComments('p1', 'pg1')
    expect(Object.keys(listFetch.calls[0]?.init ?? {})).not.toContain('cache')
  })

  it('createComment 는 멱등 키를 본문에 싣는다 — 안 주면 키를 만들지 않는다', async () => {
    // `BODY_KEYS.createComment`에 그 키가 없으면 `declaredOnly`가 **조용히 떨군다** — 화면은 키를
    // 들고 있는데 서버는 못 받아, 늦게 커밋된 게시와 다시 단 게시가 두 행이 된다.
    const given = stubFetch(jsonResponse(201, commentCreated))
    await createHttpClient(given.fetchImpl).createComment('p1', 'pg1', { nodeId: 'n_1', body: '가', idempotencyKey: 'k-1' })
    expect(JSON.parse(String(given.calls[0]?.init?.body))).toEqual({ nodeId: 'n_1', body: '가', idempotencyKey: 'k-1' })

    const none = stubFetch(jsonResponse(201, commentCreated))
    await createHttpClient(none.fetchImpl).createComment('p1', 'pg1', { nodeId: 'n_1', body: '가' })
    expect(JSON.parse(String(none.calls[0]?.init?.body))).toEqual({ nodeId: 'n_1', body: '가' })
  })

  it('재생 응답의 `marker: null`을 받는다 — 노드나 번호가 그 사이 사라진 게시다', async () => {
    // 서버는 같은 키로 이미 달린 게시를 돌려줄 때 그 노드의 **지금** 번호를 싣고, 없으면 `null`이다
    // (`apps/api/README.md`의 «멱등 키»). 막으면 달린 게시를 «서버 응답을 이해할 수 없습니다»로 읽는다.
    const stub = stubFetch(jsonResponse(200, { ...commentCreated, marker: null, markerOps: [] }))
    const created = await createHttpClient(stub.fetchImpl).createComment('p1', 'pg1', {
      nodeId: 'n_1',
      body: '가',
      idempotencyKey: 'k-1',
    })
    expect(created.marker).toBeNull()
  })

  it('204 응답은 본문을 파싱하지 않는다', async () => {
    const empty = new Response(null, { status: 204 })
    const json = vi.spyOn(empty, 'json')
    const client = createHttpClient(stubFetch(empty).fetchImpl)

    await expect(client.logout()).resolves.toBeUndefined()
    expect(json).not.toHaveBeenCalled()
  })

  it('에러 봉투를 ApiError로 바꾼다', async () => {
    const stub = stubFetch(
      jsonResponse(401, { error: { code: 'unauthenticated', message: '로그인이 필요합니다' } }),
    )
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(await client.me().catch((e: unknown) => e))

    expect(error.status).toBe(401)
    expect(error.code).toBe('unauthenticated')
    expect(error.message).toBe('로그인이 필요합니다')
    expect(error.name).toBe('ApiError')
  })

  it('issues가 있으면 그대로 싣는다', async () => {
    const issues = [{ code: 'unknown-type', nodeId: 'n_1', path: '/root/children/0', message: '알 수 없는 타입' }]
    const stub = stubFetch(
      jsonResponse(422, { error: { code: 'validation-failed', message: '검증 실패', issues } }),
    )
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(await client.getPage('p1', 'pg1').catch((e: unknown) => e))

    expect(error.code).toBe('validation-failed')
    expect(error.issues).toEqual(issues)
  })

  it('issues가 없으면 빈 배열이다', async () => {
    // 화면이 `err.issues.length`를 그냥 읽을 수 있어야 한다 — undefined면 거기서 죽는다.
    const stub = stubFetch(jsonResponse(404, { error: { code: 'not-found', message: '대상을 찾을 수 없습니다' } }))
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(await client.getProject('p1').catch((e: unknown) => e))

    expect(error.issues).toEqual([])
  })

  it('api 의 오류 봉투를 실은 실패만 `enveloped`다 — 봉투 없는 500 · 연결 실패는 아니다', async () => {
    // 같은 500 이라도 **누가 냈는지**가 게시의 결과를 아는지를 가른다(`panels/comment-panel.tsx`의
    // `knownRejection`). Vite 개발 프록시는 api 가 요청을 쥔 채 죽으면 `500 text/plain` 빈 본문을 준다.
    const own = stubFetch(jsonResponse(500, { error: { code: 'internal', message: '서버 오류가 발생했습니다' } }))
    const ownError = asApiError(await createHttpClient(own.fetchImpl).listComments('p1', 'pg1').catch((e: unknown) => e))
    expect(ownError.status).toBe(500)
    expect(ownError.enveloped).toBe(true)

    const proxy = stubFetch(new Response('', { status: 500, headers: { 'content-type': 'text/plain' } }))
    const proxyError = asApiError(await createHttpClient(proxy.fetchImpl).listComments('p1', 'pg1').catch((e: unknown) => e))
    expect(proxyError.status).toBe(500)
    expect(proxyError.enveloped).toBe(false)

    const unreachable = createHttpClient(() => Promise.reject(new TypeError('Failed to fetch')))
    const unreachableError = asApiError(await unreachable.listComments('p1', 'pg1').catch((e: unknown) => e))
    expect(unreachableError.enveloped).toBe(false)
  })

  it('봉투가 아닌 응답도 ApiError로 바꾼다', async () => {
    // 리버스 프록시가 502 HTML을 내면 `res.json()`이 SyntaxError를 던진다.
    // 그것이 새어 나가면 화면이 서버 코드 대신 "Unexpected token <"를 보여준다.
    const stub = stubFetch(htmlResponse(500))
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(await client.listProjects().catch((e: unknown) => e))

    expect(error.code).toBe('internal')
    expect(error.status).toBe(500)
  })

  it('getPage는 headSeq를 그대로 싣는다', async () => {
    // 편집 요청이 이 값을 baseSeq로 쓴다.
    const stub = stubFetch(jsonResponse(200, page))
    const client = createHttpClient(stub.fetchImpl)

    const result = await client.getPage('p1', 'pg1')

    expect(result.headSeq).toBe(7)
    // 서버 계약(apps/api/test/pages.test.ts "페이지 응답은 계약된 키만 담는다")의
    // 여덟 키가 전부 그대로 온다.
    expect(result).toEqual(page)
  })

  // --- 아래는 위 케이스들만으로는 변이가 살아남는 지점을 메운다 ---

  it('각 메서드는 계약된 경로와 HTTP 메서드로 요청한다', async () => {
    // 경로 오타나 메서드 뒤바뀜은 위 케이스들이 login·getTree 말고는 잡지 못한다.
    for (const testCase of ENDPOINTS) {
      const response = testCase.body === null ? new Response(null, { status: 204 }) : jsonResponse(200, testCase.body)
      const stub = stubFetch(response)

      await testCase.call(createHttpClient(stub.fetchImpl))

      expect(stub.calls[0]?.url, testCase.client).toBe(testCase.url)
      expect(stub.calls[0]?.init?.method, testCase.client).toBe(testCase.method)
    }
  })

  it('각 shape는 계약 밖 응답을 ApiError로 끊는다', async () => {
    for (const testCase of SHAPE_CASES) {
      const stub = stubFetch(jsonResponse(200, testCase.broken))

      const error = asApiError(await testCase.call(createHttpClient(stub.fetchImpl)).catch((e: unknown) => e))

      expect(error.code, testCase.shape).toBe('internal')
      expect(error.message, testCase.shape).toBe('서버 응답을 이해할 수 없습니다')
    }
  })

  it('각 shape는 계약을 지킨 응답을 통과시킨다', async () => {
    // **음성 대조.** 위 케이스만으로는 shape를 `() => false`로 만들어도 초록이다 —
    // 그러면 모든 응답이 막혀 화면이 아무것도 못 받는다.
    for (const testCase of SHAPE_CASES) {
      const stub = stubFetch(jsonResponse(200, testCase.ok))

      await expect(testCase.call(createHttpClient(stub.fetchImpl)), testCase.shape).resolves.toBeDefined()
    }
  })

  /**
   * **`SHAPES.projectTheme`이 실제로 막는가.** 이 모양 검사가 `() => true`로 퇴행해도
   * 이 shape에 계약 밖 응답을 태우는 케이스가 없으면 **웹 전량이 초록이다** — 화면 테스트는
   * `fakeApi`로 이 층을 지나지 않는다.
   *
   * 무엇을 막는지는 좁다(그 shape의 주석 참고): `theme`이 객체이거나 `null`인가,
   * `issues`가 배열인가. **테마 안쪽은 일부러 보지 않는다** — `resolveTheme`이 그것을
   * 이슈로 말하고, 두 층이 같은 것을 검사하면 사용자가 원인을 두 번 다르게 듣는다.
   */
  describe('getProjectTheme의 응답 모양', () => {
    it('theme이 객체이거나 null이면 통과한다', async () => {
      for (const body of [projectTheme, { themeId: null, theme: null, issues: [] }]) {
        const stub = stubFetch(jsonResponse(200, body))
        await expect(createHttpClient(stub.fetchImpl).getProjectTheme('p1')).resolves.toEqual(body)
      }
    })

    it('theme이 객체도 null도 아니면 ApiError를 던진다', async () => {
      // 배열이 오는 것이 실재하는 경로다 — 경로를 `/themes`로 잘못 적으면 목록이 온다.
      for (const theme of ['admin', 42, [], undefined]) {
        const stub = stubFetch(jsonResponse(200, { theme, issues: [] }))
        await expect(
          createHttpClient(stub.fetchImpl).getProjectTheme('p1'),
          JSON.stringify(theme),
        ).rejects.toBeInstanceOf(ApiError)
      }
    })

    it('issues가 배열이 아니면 ApiError를 던진다', async () => {
      // 화면이 `issues.length`·`issues.map`을 그냥 부른다(`use-project-theme.ts`).
      const stub = stubFetch(jsonResponse(200, { themeId: null, theme: null, issues: null }))
      await expect(createHttpClient(stub.fetchImpl).getProjectTheme('p1')).rejects.toBeInstanceOf(ApiError)
    })

    it('경로에 들어가는 id는 URL 인코딩된다', async () => {
      const stub = stubFetch(jsonResponse(200, projectTheme))
      await createHttpClient(stub.fetchImpl).getProjectTheme('p 1/../x')

      expect(stub.calls[0]?.url).toBe('/api/projects/p%201%2F..%2Fx/theme')
    })
  })

  /**
   * **자기 편집을 자기가 되받지 않게 하는 값**(설계서 「정방향 흐름」의 *"[본인] ack / [타인] ops"*).
   * REST로 나가는 요청은 서버가 그것이 어느 WebSocket 연결의 주인이 낸 것인지 달리 알
   * 방법이 없다.
   */
  it('연결 id가 있으면 모든 요청에 헤더로 붙는다', async () => {
    // 본문이 있는 요청과 없는 요청을 섞는다 — 한 갈래에만 붙인 구현이 통과하지 못하게.
    const stub = stubFetch(jsonResponse(200, user), jsonResponse(200, user))
    const client = createHttpClient(stub.fetchImpl, () => 'wsc_7')

    await client.login('a@b.c', 'pw')
    await client.me()

    expect(stub.calls[0]?.init?.headers).toEqual({
      'content-type': 'application/json',
      'x-wb-connection-id': 'wsc_7',
    })
    expect(stub.calls[1]?.init?.headers).toEqual({ 'x-wb-connection-id': 'wsc_7' })
  })

  it('요청마다 다시 읽는다 — 다시 붙어 id가 바뀌면 그 값이 나간다', async () => {
    const stub = stubFetch(jsonResponse(200, user), jsonResponse(200, user))
    let current: string | undefined = 'wsc_1'
    const client = createHttpClient(stub.fetchImpl, () => current)

    await client.me()
    current = 'wsc_2'
    await client.me()

    expect(stub.calls.map((call) => (call.init?.headers as Record<string, string>)['x-wb-connection-id'])).toEqual([
      'wsc_1',
      'wsc_2',
    ])
  })

  it('쓰기가 낸 연결을 주면 그것이 나간다 — 지금 연결이 아니다(게시의 같은 키 재전송)', async () => {
    // `panels/comment-panel.tsx`의 `submit`: 다시 보낸 것은 첫 보내기의 연결을 싣는다. 지금 연결을 실으면
    // 그 사이 셸이 바뀌었을 때 서버가 **새 셸의** 연결을 방송에서 뺀다(Chrome — 새 셸의 번호 칸 `–`).
    const stub = stubFetch(jsonResponse(201, commentCreated), jsonResponse(201, commentCreated))
    const client = createHttpClient(stub.fetchImpl, () => 'wsc_new')

    await client.createComment('p1', 'pg1', { nodeId: 'n_000000000001', body: '가' }, { connectionId: 'wsc_old' })
    await client.createComment('p1', 'pg1', { nodeId: 'n_000000000001', body: '가' })

    expect(stub.calls.map((call) => (call.init?.headers as Record<string, string>)['x-wb-connection-id'])).toEqual([
      'wsc_old',
      'wsc_new',
    ])
  })

  it('연결이 없으면 헤더를 아예 안 만든다 — 빈 문자열을 보내지 않는다', async () => {
    const stub = stubFetch(jsonResponse(200, user))
    const client = createHttpClient(stub.fetchImpl, () => undefined)

    await client.me()

    expect(stub.calls[0]?.init?.headers).toBeUndefined()
  })

  it('본문이 있는 요청에만 content-type을 붙인다', async () => {
    const stub = stubFetch(jsonResponse(200, user), jsonResponse(200, user))
    const client = createHttpClient(stub.fetchImpl)

    await client.login('a@b.c', 'pw')
    await client.me()

    expect(stub.calls[0]?.init?.headers).toEqual({ 'content-type': 'application/json' })
    // GET에 본문이 없는데 content-type을 붙이면 서버가 받는 요청이 계약과 달라진다.
    expect(stub.calls[1]?.init?.headers).toBeUndefined()
    expect(stub.calls[1]?.init?.body).toBeUndefined()
  })

  it('listProjects는 각 항목의 role을 그대로 돌려준다', async () => {
    // 서버는 목록의 각 항목에도 내 role을 싣는다
    // (apps/api/test/projects.test.ts "각 항목에 내 role이 실린다").
    const stub = stubFetch(jsonResponse(200, [project, { ...project, id: 'p2', role: 'viewer' }]))
    const client = createHttpClient(stub.fetchImpl)

    const result = await client.listProjects()

    expect(result.map((p) => p.role)).toEqual(['owner', 'viewer'])
  })

  it('성공 응답이 JSON이 아니어도 ApiError로 바꾼다', async () => {
    // 개발 중 프록시가 빠지면 Vite가 /api/* 요청에 index.html을 200으로 낸다.
    // 실패 경로와 같은 이유로 여기서도 SyntaxError가 새어 나가면 안 된다.
    const stub = stubFetch(htmlResponse(200))
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(await client.me().catch((e: unknown) => e))

    expect(error.code).toBe('internal')
  })

  it('알 수 없는 code는 internal로 바꾼다', async () => {
    // 화면은 상태 코드가 아니라 `code`로 분기한다(404가 "없음"과 "비멤버"를 일부러
    // 구분하지 않기 때문이다 — 설계서 「권한 모델」). 계약에 없는 문자열이 `code`에 그대로
    // 실리면 그 분기의 exhaustive switch가 거짓말이 된다.
    const stub = stubFetch(jsonResponse(418, { error: { code: 'teapot', message: '나는 주전자다' } }))
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(await client.me().catch((e: unknown) => e))

    expect(error.code).toBe('internal')
    expect(error.status).toBe(418)
    // 메시지는 서버가 준 것을 유지한다 — 코드를 몰라도 사람이 읽을 값은 있다.
    expect(error.message).toBe('나는 주전자다')
  })

  it('계약의 code 전부를 그대로 싣는다', async () => {
    // **하나씩 지나간다.** 여기까지 오는 값은 `API_ERROR_CODES`를 통과한 것이고, 통과하지
    // 못한 문자열은 위 케이스가 보듯 `internal`로 흡수된다 — 즉 목록에서 하나가 빠지거나
    // 오타가 나면 그 코드가 조용히 `internal`이 되고 화면의 분기가 닿지 않는다.
    //
    // **`Record<ApiErrorCode, true>`의 키를 훑는다 — 배열을 손으로 적지 않는다.** 배열로 두면
    // *"유니온에 코드가 늘면 이 배열이 컴파일 에러가 된다"*가 **거짓이다**: `ApiErrorCode[]`는
    // 원소가 부족해도 멀쩡한 타입이라 유니온에 코드를 더하고 배열을 안 고쳐도 컴파일이 지난다.
    // 레코드로 두면 빠뜨림이 **양방향으로** 컴파일 에러가 되고, 케이스 이름에 수를 적을 일도 없다.
    const codes = Object.keys({
      'bad-request': true,
      unauthenticated: true,
      forbidden: true,
      'not-found': true,
      conflict: true,
      locked: true,
      'validation-failed': true,
      internal: true,
    } satisfies Record<ApiErrorCode, true>) as ApiErrorCode[]

    for (const code of codes) {
      const stub = stubFetch(jsonResponse(400, { error: { code, message: '이유' } }))
      const client = createHttpClient(stub.fetchImpl)

      const error = asApiError(await client.me().catch((e: unknown) => e))

      expect(error.code).toBe(code)
    }
  })

  it('프로토타입에 있는 이름은 code가 아니다', async () => {
    // `'toString' in API_ERROR_CODES`는 `true`다. 목록을 `in`으로 보면 이 문자열이
    // 계약의 코드인 척 그대로 실려, 화면의 `switch`가 어느 갈래에도 닿지 않는 값을 받는다.
    const stub = stubFetch(
      jsonResponse(500, { error: { code: 'toString', message: '이상한 코드' } }),
    )
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(await client.me().catch((e: unknown) => e))

    expect(error.code).toBe('internal')
  })

  it('fetchImpl을 주지 않으면 전역 fetch를 쓴다', async () => {
    // 다른 테스트는 전부 가짜를 주입하므로 기본값 자리는 아무도 지나가지 않는다 —
    // 그 자리가 잘못돼도 이 파일이 통째로 초록일 수 있어 여기서만 따로 본다.
    const stub = stubFetch(jsonResponse(200, user))
    vi.stubGlobal('fetch', stub.fetchImpl)
    try {
      await createHttpClient().me()
      expect(stub.calls[0]?.url).toBe('/api/auth/me')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('fetch 자체가 실패하면 ApiError로 바꾼다', async () => {
    // 네트워크 단절·DNS 실패·CORS 차단에서 `fetch`는 응답 없이 raw `TypeError`로
    // reject한다 — 실패 응답이 아니므로 봉투 번역 경로를 아예 지나가지 않는다.
    // 그것이 그대로 새어 나가면 호출자의 `err instanceof ApiError` 분기가 통째로
    // 빗나가서, 화면이 네트워크 오류를 오류로 알아보지 못한다.
    const fetchImpl: typeof fetch = () => Promise.reject(new TypeError('Failed to fetch'))
    const client = createHttpClient(fetchImpl)

    const error = asApiError(await client.me().catch((e: unknown) => e))

    expect(error.code).toBe('internal')
    // 응답이 없었다는 뜻의 0. 서버가 낼 수 있는 상태 코드가 아니라서 실제 응답과 섞이지 않는다.
    expect(error.status).toBe(0)
    // 사용자에게 그대로 보여도 되는 문장이어야 한다 — 브라우저별 영문 문구를 흘리지 않는다.
    expect(error.message).toBe('서버에 연결하지 못했습니다')
  })

  it('경로에 들어가는 id는 URL 인코딩된다', async () => {
    // 주소창에서 온 id가 그대로 경로에 붙으면 URL이 깨지거나 다른 경로로 샌다.
    const stub = stubFetch(jsonResponse(404, { error: { code: 'not-found', message: '대상을 찾을 수 없습니다' } }))
    const client = createHttpClient(stub.fetchImpl)

    await client.getPage('p 1/x', '../pg1').catch(() => undefined)

    expect(stub.calls[0]?.url).toBe('/api/projects/p%201%2Fx/pages/..%2Fpg1')
  })
})

describe('patchOps', () => {
  const OPS: PatchOp[] = [{ op: 'replace', path: '/root/children/0/props/title', value: '새 제목' }]

  it('ops를 PATCH로 보낸다', async () => {
    const stub = stubFetch(jsonResponse(200, patchResult))
    const client = createHttpClient(stub.fetchImpl)

    await client.patchOps('p-1', 'pg-1', { baseSeq: 7, ops: OPS, clientOpId: 'op-1' })

    expect(stub.calls[0]?.url).toBe('/api/projects/p-1/pages/pg-1/ops')
    expect(stub.calls[0]?.init?.method).toBe('PATCH')
    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({
      baseSeq: 7,
      ops: OPS,
      clientOpId: 'op-1',
    })
  })

  it('clientOpId가 없으면 본문에 키를 만들지 않는다', async () => {
    // 서버는 `z.strictObject`를 쓰므로 선언되지 않은 키는 400이다. `clientOpId: undefined`를
    // 그대로 넘기면 `JSON.stringify`가 키를 지우므로 실제로는 통과하지만, 그것에 기대면
    // 본문 조립이 바뀔 때 조용히 어긋난다 — 나가는 본문을 직접 본다.
    const stub = stubFetch(jsonResponse(200, { ...patchResult, clientOpId: undefined }))
    const client = createHttpClient(stub.fetchImpl)

    await client.patchOps('p-1', 'pg-1', { baseSeq: 7, ops: OPS })

    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ baseSeq: 7, ops: OPS })
  })

  /**
   * **`warnings`는 없을 수 있고, 있으면 배열이어야 한다**(테마 쪽과 같은 관례).
   *
   * **왜 이 가드가 필요한가:** 그 값이 스토어를 지나 셸 머리의 통지로 가고, 거기서
   * `.map`이 불린다. 그 자리는 오류 경계 **밖**이라 배열이 아닌 것이 지나가면 셸 전체가
   * 흰 화면이 된다(`shell/edit-warnings.tsx`). **실측**: 이 가드를 걷고 화면 케이스에서
   * `warnings: { nope: 1 }`을 흘리면 `TypeError: warnings.map is not a function`이
   * 렌더 도중 난다.
   */
  it('warnings가 배열이 아니면 막는다 — 없는 것은 통과시킨다', async () => {
    const client = (body: unknown) => createHttpClient(stubFetch(jsonResponse(200, body)).fetchImpl)

    await expect(
      client({ ...patchResult, warnings: { nope: 1 } }).patchOps('p-1', 'pg-1', { baseSeq: 7, ops: OPS }),
    ).rejects.toThrow()

    // 양성 대조 둘: 키가 없는 응답(서버가 경고 없을 때 내는 모양)과 배열인 응답.
    await expect(
      client(patchResult).patchOps('p-1', 'pg-1', { baseSeq: 7, ops: OPS }),
    ).resolves.toEqual(patchResult)
    const withWarnings = { ...patchResult, warnings: [{ code: 'missing-interaction-target' }] }
    await expect(
      client(withWarnings).patchOps('p-1', 'pg-1', { baseSeq: 7, ops: OPS }),
    ).resolves.toEqual(withWarnings)
  })

  it('응답의 seq와 inverse를 그대로 낸다', async () => {
    // **봉투를 벗기지 않는다** — 서버 응답이 곧 `PatchResult`다. `inverse`는 서버가 적용
    // 직전 상태를 보고 만든 것이고(설계서 「정방향 흐름」), 클라이언트는 그것을 그대로 되보내는 것
    // 말고는 아무것도 하지 않는다.
    const stub = stubFetch(jsonResponse(200, patchResult))
    const client = createHttpClient(stub.fetchImpl)

    const result = await client.patchOps('p-1', 'pg-1', { baseSeq: 7, ops: OPS })

    expect(result).toEqual(patchResult)
    expect(result.inverse).toEqual(patchResult.inverse)
  })

  it('baseSeq 불일치는 conflict 코드로 온다', async () => {
    // 서버는 리베이스를 시도하지 않고 곧바로 409를 낸다(README). 화면은 그것을 재조회로
    // 수렴시킨다.
    const stub = stubFetch(
      jsonResponse(409, { error: { code: 'conflict', message: '문서가 이미 바뀌었습니다' } }),
    )
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(
      await client.patchOps('p-1', 'pg-1', { baseSeq: 3, ops: OPS }).catch((e: unknown) => e),
    )

    expect(error.code).toBe('conflict')
    expect(error.status).toBe(409)
  })

  it('카탈로그 위반은 validation-failed와 issues를 싣는다', async () => {
    const issues = [
      { code: 'unknown-prop', nodeId: 'n_1', path: '/root/children/0/props/nope', message: '알 수 없는 prop' },
    ]
    const stub = stubFetch(
      jsonResponse(422, { error: { code: 'validation-failed', message: '검증 실패', issues } }),
    )
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(
      await client.patchOps('p-1', 'pg-1', { baseSeq: 7, ops: OPS }).catch((e: unknown) => e),
    )

    expect(error.code).toBe('validation-failed')
    expect(error.issues).toHaveLength(1)
    expect(error.issues).toEqual(issues)
  })

  it('경로에 들어가는 id는 URL 인코딩된다', async () => {
    const stub = stubFetch(jsonResponse(200, patchResult))
    const client = createHttpClient(stub.fetchImpl)

    await client.patchOps('p 1/x', '../pg1', { baseSeq: 7, ops: OPS })

    expect(stub.calls[0]?.url).toBe('/api/projects/p%201%2Fx/pages/..%2Fpg1/ops')
  })
})

describe('listMyRevisions', () => {
  it('mine=true만 붙여 GET한다', async () => {
    // **`limit`을 붙이지 않는다.** 기본값 50이 설계서 「개인 undo/redo」의 "최근 50개"와 같고,
    // **선언하지 않은 쿼리 키는 그 자체로 400이다**(README) — 캐시 버스터도 거부된다.
    const stub = stubFetch(jsonResponse(200, [revision]))
    const client = createHttpClient(stub.fetchImpl)

    await client.listMyRevisions('p-1', 'pg-1')

    expect(stub.calls[0]?.url).toBe('/api/projects/p-1/pages/pg-1/revisions?mine=true')
    expect(stub.calls[0]?.init?.method).toBe('GET')
  })

  it('응답을 순서 그대로 낸다', async () => {
    // 서버가 `seq` 내림차순으로 준다. 여기서 뒤집지 않는다 — 스택으로 옮기는 자리가
    // 그 순서를 안다(`store/editor-store.ts`의 `restoreUndoStack`).
    const older = { ...revision, id: 'rev-0', seq: 7 }
    const stub = stubFetch(jsonResponse(200, [revision, older]))
    const client = createHttpClient(stub.fetchImpl)

    const result = await client.listMyRevisions('p-1', 'pg-1')

    expect(result.map((r) => r.seq)).toEqual([8, 7])
  })

  it('경로에 들어가는 id는 URL 인코딩된다', async () => {
    const stub = stubFetch(jsonResponse(200, []))
    const client = createHttpClient(stub.fetchImpl)

    await client.listMyRevisions('p 1/x', '../pg1')

    expect(stub.calls[0]?.url).toBe('/api/projects/p%201%2Fx/pages/..%2Fpg1/revisions?mine=true')
  })
})

/**
 * 메뉴·페이지 CRUD 여섯.
 *
 * **이 여섯이 지켜야 하는 것은 본문 조립이다.** 서버의 `CreateMenuBody`·`UpdateMenuBody`·
 * `CreatePageBody`·`UpdatePageBody`가 전부 `z.strictObject`이고, 갱신 둘은
 * `.refine((body) => Object.keys(body).length > 0)`까지 걸려 있다
 * (`apps/api/src/routes/menu.ts`·`pages.ts`). 즉 **어떤 키를 만드는가**가 그대로 200과
 * 400을 가른다 — 화면 테스트는 가짜 `ApiClient`를 쓰므로 이 조립을 지나가지 않는다.
 */
describe('메뉴 CRUD', () => {
  it('createMenu는 parentId를 null로도 싣는다', async () => {
    // 서버의 `parentId`는 `z.uuid().nullable().optional()`이라 **`null`이 유효한 값**이고
    // "루트에 만든다"는 뜻이다. 클라이언트가 그 뜻을 흘리지 않도록 값으로 싣는다 —
    // 이 계약이 `updateMenu`의 `parentId: null`(내어쓰기로 루트에 보낸다)과 같은 모양이어야
    // 한다. **키를 빼도 서버는 같은 곳(루트 맨 뒤)에 만든다** — api 하네스로 쟀고 근거는
    // `api/client.ts`의 `createMenu` 주석에 있다. 결과가 같아도 뜻을 값으로 남긴다.
    const stub = stubFetch(jsonResponse(201, menuNode))
    const client = createHttpClient(stub.fetchImpl)

    await client.createMenu('p1', { parentId: null, title: '회원관리' })

    expect(stub.calls[0]?.url).toBe('/api/projects/p1/menu')
    expect(stub.calls[0]?.init?.method).toBe('POST')
    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ parentId: null, title: '회원관리' })
  })

  it('createMenu는 하위 메뉴의 parentId를 그대로 싣는다', async () => {
    const stub = stubFetch(jsonResponse(201, { ...menuNode, id: 'm2', parentId: 'm1' }))
    const client = createHttpClient(stub.fetchImpl)

    const result = await client.createMenu('p1', { parentId: 'm1', title: '권한' })

    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ parentId: 'm1', title: '권한' })
    expect(result.id).toBe('m2')
  })

  it('선언되지 않은 키를 만들지 않는다 — undefined인 필드는 본문에서 빠진다', async () => {
    // 서버의 `UpdateMenuBody`는 `z.strictObject`다 — 선언되지 않은 키는 그 자체로 400이고,
    // `undefined`를 실은 키가 통과하는 것은 `JSON.stringify`가 지워 주는 우연이다
    // (`patchOps`가 같은 이유로 `clientOpId` 키를 만들지 않는다). 그 우연에 기대면
    // 본문 조립이 바뀔 때 조용히 어긋나므로 나가는 본문을 직접 본다.
    const stub = stubFetch(jsonResponse(200, { ...menuNode, title: '가' }))
    const client = createHttpClient(stub.fetchImpl)

    await client.updateMenu('p1', 'm1', { title: '가' })

    expect(stub.calls[0]?.url).toBe('/api/projects/p1/menu/m1')
    expect(stub.calls[0]?.init?.method).toBe('PATCH')
    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ title: '가' })
  })

  it('updateMenu는 parentId: null을 싣는다 — 키 없음과 다른 뜻이다', async () => {
    // 키가 없으면 "부모를 바꾸지 않는다", `null`이면 "루트로 옮긴다"이다(내어쓰기의
    // 목적지가 루트 목록일 때 나가는 본문이다). `undefined`만 걸러야 하고
    // falsy 전체를 걸러서는 안 된다.
    const stub = stubFetch(jsonResponse(200, menuNode))
    const client = createHttpClient(stub.fetchImpl)

    await client.updateMenu('p1', 'm2', { parentId: null })

    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ parentId: null })
  })

  it('updateMenu는 sortOrder 0을 싣는다', async () => {
    // 0은 falsy인데 서버의 `sortOrder`는 `z.int().min(0)`이라 **0이 유효 범위의 하한**이다.
    // 걸러야 하는 것은 `undefined` 하나뿐이라는 것을 이 케이스가 못박는다 — 0이 빠지면
    // 본문이 비어 서버의 `.refine(빈 본문 금지)`에 걸린다.
    const stub = stubFetch(jsonResponse(200, menuNode))
    const client = createHttpClient(stub.fetchImpl)

    await client.updateMenu('p1', 'm1', { sortOrder: 0 })

    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ sortOrder: 0 })
  })

  it('updateMenu는 준 키를 전부 싣는다', async () => {
    const stub = stubFetch(jsonResponse(200, menuNode))
    const client = createHttpClient(stub.fetchImpl)

    await client.updateMenu('p1', 'm1', { title: '가', parentId: 'm9', sortOrder: 2 })

    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({
      title: '가',
      parentId: 'm9',
      sortOrder: 2,
    })
  })

  it('빈 갱신 본문은 서버에 보내지 않고 ApiError로 막는다', async () => {
    // **서버 실측**(api 하네스 — 임시 테스트로 두 요청을 보내 다시 잰다): `PATCH /menu {}`·`PATCH /pages {}`가
    // 둘 다 `400 {"code":"bad-request", …, "issues":[{"path":"","message":"변경할 값이
    // 없습니다"}]}`다. 보내 봐야 400인 요청은 만들지 않는다.
    //
    // **`fetch`가 아예 불리지 않는 것까지 본다.** 던지기만 하고 요청이 나가면 서버에 쓸모없는
    // 왕복이 남는다.
    const stub = stubFetch()
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(await client.updateMenu('p1', 'm1', {}).catch((e: unknown) => e))

    expect(error.code).toBe('bad-request')
    expect(error.status).toBe(0)
    expect(stub.calls).toHaveLength(0)
  })

  it('undefined만 담긴 갱신 본문도 같다', async () => {
    // `definedOnly`가 이것을 `{}`로 **만들어 낸다** — 타입이 세 키를 전부 optional로 두므로
    // 호출부가 계산한 값이 `undefined`가 되는 경로가 실제로 열려 있다(`tree/tree-actions.ts`의
    // `previousMenuSibling`·`menuOutdentTarget`이 `null`을 내는 자리다).
    const stub = stubFetch()
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(
      await client
        .updateMenu('p1', 'm1', { title: undefined, parentId: undefined, sortOrder: undefined })
        .catch((e: unknown) => e),
    )

    expect(error.code).toBe('bad-request')
    expect(stub.calls).toHaveLength(0)
  })

  it('거절은 동기 throw가 아니라 rejection이다', () => {
    // `ApiClient`의 계약은 `Promise`를 돌려주는 것이다. 몸통에서 그냥 던지면 `await` 없이
    // `.catch`를 붙이는 호출부가 그것을 못 잡는다.
    const client = createHttpClient(stubFetch().fetchImpl)

    expect(() => client.updateMenu('p1', 'm1', {}).catch(() => undefined)).not.toThrow()
    expect(() => client.updatePage('p1', 'pg1', {}).catch(() => undefined)).not.toThrow()
  })

  it('삭제는 204를 본문 없이 받는다', async () => {
    // 204에서 `request`가 조기 반환하므로 shape 검사에 닿지 않는다. 본문을 읽으려
    // 들면 거기서 죽는다(`logout`이 같은 자리를 지킨다).
    const empty = new Response(null, { status: 204 })
    const json = vi.spyOn(empty, 'json')
    const stub = stubFetch(empty)
    const client = createHttpClient(stub.fetchImpl)

    await expect(client.deleteMenu('p1', 'm1')).resolves.toBeUndefined()

    expect(stub.calls[0]?.url).toBe('/api/projects/p1/menu/m1')
    expect(stub.calls[0]?.init?.method).toBe('DELETE')
    expect(json).not.toHaveBeenCalled()
  })

  it('메뉴 응답이 계약과 다른 모양이면 ApiError를 던진다', async () => {
    // `sortOrder`가 문자열인 응답. **이 응답의 이 값을 읽는 자리는 없다** — 위/아래 이동의
    // 목적지 계산도 `node.sortOrder`가 아니라 정렬한 뒤의 자리(`index`)를 쓴다(`tree/tree-actions.ts`).
    // 그런데도 계약을 벗어난 응답을 통과시키지 않는 것은 `SHAPES.menuNode` 주석의 근거 둘 때문이다.
    const stub = stubFetch(jsonResponse(200, { ...menuNode, sortOrder: '0' }))
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(await client.updateMenu('p1', 'm1', { title: '가' }).catch((e: unknown) => e))

    expect(error.code).toBe('internal')
    expect(error.message).toBe('서버 응답을 이해할 수 없습니다')
  })

  it('메뉴 응답에 id가 없으면 ApiError를 던진다', async () => {
    const stub = stubFetch(jsonResponse(201, { projectId: 'p1', parentId: null, title: '가', sortOrder: 0 }))
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(
      await client.createMenu('p1', { parentId: null, title: '가' }).catch((e: unknown) => e),
    )

    expect(error.code).toBe('internal')
  })

  it('선언되지 않은 키만 담긴 메뉴 갱신 본문은 빈 본문으로 거절된다', async () => {
    // **떨어내는 순서가 정하는 결과다**(`updateProject`와 같은 자리). 미선언 키를 먼저
    // 떨어낸 뒤에 남은 키를 세므로 `{id, projectId}`는 `{}`가 되어 `updateBody`가 던진다.
    // 순서가 반대면 "두 키가 있으니 빈 본문이 아니다"로 통과해 `{}`가 나가고 400을 받는다.
    const stub = stubFetch()
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(
      await client
        .updateMenu('p1', 'm1', { id: 'm1', projectId: 'p1' } as unknown as { title?: string })
        .catch((e: unknown) => e),
    )

    expect(error.code).toBe('bad-request')
    expect(stub.calls).toHaveLength(0)
  })

  it('메뉴 응답 객체를 그대로 넘겨도 선언된 키만 나간다', async () => {
    // **`MenuNode` 응답에는 요청이 받지 않는 키가 셋 섞여 있다**(`id`·`projectId`·`sortOrder` —
    // `sortOrder`는 갱신에만 선언돼 있다). 서버의 본문 스키마가 `z.strictObject`라 그것이
    // 그대로 나가면 400이다. **실측(api 하네스):**
    //
    //   POST  /menu     응답 그대로 → 400 인식할 수 없는 키: "id", "projectId", "sortOrder"
    //   PATCH /menu/:id 응답 그대로 → 400 인식할 수 없는 키: "id", "projectId"
    //   선언된 키만 담으면            → 201 / 200
    //
    // **타입은 막지 못한다** — 변수도 스프레드 리터럴도 `tsc` 0 에러다(`declaredOnly` 머리말의
    // 프로브 표). 그래서 `declaredOnly`가 여기서 막는다.
    const stub = stubFetch(jsonResponse(201, menuNode), jsonResponse(200, menuNode))
    const client = createHttpClient(stub.fetchImpl)

    await client.createMenu('p1', menuNode)
    await client.updateMenu('p1', 'm1', { ...menuNode })

    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ parentId: null, title: '회원관리' })
    expect(JSON.parse(String(stub.calls[1]?.init?.body))).toEqual({
      title: '회원관리',
      parentId: null,
      sortOrder: 0,
    })
  })

  it('경로에 들어가는 id는 URL 인코딩된다', async () => {
    const stub = stubFetch(jsonResponse(200, menuNode), new Response(null, { status: 204 }))
    const client = createHttpClient(stub.fetchImpl)

    await client.updateMenu('p 1/x', '../m1', { title: '가' })
    await client.deleteMenu('p 1/x', '../m1')

    expect(stub.calls[0]?.url).toBe('/api/projects/p%201%2Fx/menu/..%2Fm1')
    expect(stub.calls[1]?.url).toBe('/api/projects/p%201%2Fx/menu/..%2Fm1')
  })
})

describe('페이지 CRUD', () => {
  it('createPage는 menuNodeId와 title을 싣는다', async () => {
    // `description`은 만들 때 싣지 않는다 — 설계서 「설계서 화면 구조」가 그것을 우측 패널의
    // "페이지 설명" 탭에 둔다. 그래서 본문에 그 키가 아예 없다.
    const stub = stubFetch(jsonResponse(201, page))
    const client = createHttpClient(stub.fetchImpl)

    const result = await client.createPage('p1', { menuNodeId: 'm1', title: '목록' })

    expect(stub.calls[0]?.url).toBe('/api/projects/p1/pages')
    expect(stub.calls[0]?.init?.method).toBe('POST')
    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ menuNodeId: 'm1', title: '목록' })
    // 만든 페이지로 이동하려면 응답의 `id`가 필요하다.
    expect(result.id).toBe('pg1')
  })

  it('updatePage는 준 키만 본문에 만든다', async () => {
    const stub = stubFetch(jsonResponse(200, page))
    const client = createHttpClient(stub.fetchImpl)

    await client.updatePage('p1', 'pg1', { title: '새 이름' })

    expect(stub.calls[0]?.url).toBe('/api/projects/p1/pages/pg1')
    expect(stub.calls[0]?.init?.method).toBe('PATCH')
    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ title: '새 이름' })
  })

  it('updatePage는 description을 싣는다 — null도 값이다', async () => {
    // **혼자 죽지 않는다 — 늘 아래 *"페이지 응답 객체를 그대로 넘겨도 선언된 키만 나간다"*와
    // 함께 죽는다**(실측: `BODY_KEYS.updatePage`에서 그 키를 지우면 둘이 함께 2 사망).
    // 그쪽이 *"미선언 키가 떨어진다"*를 소유하고 여기는 **`description`이 실린다**를 소유한다 —
    // 그쪽 픽스처가 `description`을 우연히 들고 있어 겹칠 뿐이라, 그 픽스처가 좁아지면
    // 이 자리만 남는다.
    //
    // **`BODY_KEYS.updatePage`에 `description`이 없으면** 시그니처만 넓혀도 `declaredOnly`가
    // 그 키를 조용히 떨궈 낸다 — 서버는 그 키를 받는데(`apps/api/test/pages.test.ts`) 클라이언트가
    // 안 보낸다.
    //
    // **그때 무엇이 나는지는 본문의 모양에 따라 갈린다.** 이 케이스처럼 `{description}`
    // 하나면 `declaredOnly`가 `{}`로 만들어 **`updateBody`가 `바꿀 내용이 없습니다`로 던지고
    // 요청이 아예 안 나간다**(그 줄을 지우고 쟀다). *"200이 오는데 값이 안 바뀐다"*는
    // **다른 선언된 키가 함께 실릴 때**의 이야기다 — 갈래 표는 `api/http-client.ts`의
    // `BODY_KEYS.updatePage` 주석이 갖는다.
    const stub = stubFetch(jsonResponse(200, page), jsonResponse(200, page))
    const client = createHttpClient(stub.fetchImpl)

    await client.updatePage('p1', 'pg1', { description: '회원을 찾고 고치는 화면' })
    await client.updatePage('p1', 'pg1', { description: null })

    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({
      description: '회원을 찾고 고치는 화면',
    })
    // `null`은 "설명을 지운다"이고 키가 없는 것("바꾸지 않는다")과 다르다.
    expect(JSON.parse(String(stub.calls[1]?.init?.body))).toEqual({ description: null })
  })

  it('updatePage는 sortOrder 0을 싣는다', async () => {
    const stub = stubFetch(jsonResponse(200, page))
    const client = createHttpClient(stub.fetchImpl)

    await client.updatePage('p1', 'pg1', { sortOrder: 0 })

    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ sortOrder: 0 })
  })

  it('updatePage는 소속 메뉴만 바꿀 때 다른 키를 만들지 않는다', async () => {
    // `reparent`가 내는 본문이다. `title`이 섞여 나가면 사용자가 바꾸지 않은
    // 값을 덮어쓴다.
    const stub = stubFetch(jsonResponse(200, page))
    const client = createHttpClient(stub.fetchImpl)

    await client.updatePage('p1', 'pg1', { menuNodeId: 'm2' })

    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ menuNodeId: 'm2' })
  })

  it('deletePage는 204를 본문 없이 받는다', async () => {
    const empty = new Response(null, { status: 204 })
    const json = vi.spyOn(empty, 'json')
    const stub = stubFetch(empty)
    const client = createHttpClient(stub.fetchImpl)

    await expect(client.deletePage('p1', 'pg1')).resolves.toBeUndefined()

    expect(stub.calls[0]?.url).toBe('/api/projects/p1/pages/pg1')
    expect(stub.calls[0]?.init?.method).toBe('DELETE')
    expect(json).not.toHaveBeenCalled()
  })

  it('빈 갱신 본문은 페이지 쪽도 막힌다', async () => {
    const stub = stubFetch()
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(await client.updatePage('p1', 'pg1', {}).catch((e: unknown) => e))

    expect(error.code).toBe('bad-request')
    expect(stub.calls).toHaveLength(0)
  })

  it('페이지 CRUD 응답도 페이지 계약을 지난다', async () => {
    // `POST`·`PATCH`의 응답은 `GET`과 같은 여덟 키다(`apps/api/src/routes/pages.ts`의
    // `toResponse` 하나가 셋을 다 만든다). 조회만 검사하고 쓰기를 통과시키면 같은
    // 계약이 반쪽만 지켜진다.
    const stub = stubFetch(jsonResponse(201, { ...page, headSeq: '0' }))
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(
      await client.createPage('p1', { menuNodeId: 'm1', title: '목록' }).catch((e: unknown) => e),
    )

    expect(error.code).toBe('internal')
  })

  it('만든 페이지의 id가 계약과 다르면 ApiError를 던진다', async () => {
    // **이 값이 주소에 들어간다** — 만들고 나서 그 페이지로 이동한다. 통과시키면
    // `ApiError`가 아니라 **200 성공 경로로** 잘못된 주소가 만들어진다.
    //
    // 실측(가짜 소비자를 세워 `PageLink`와 같은 형태로 조립했다):
    //   `id` 키 없음 → `/projects/p1/pages/undefined`
    //   `id: 42` → `…/42`,  `id: null` → `…/null`,  `id: ''` → `/projects/p1/pages/`
    //
    // **빈 문자열이 가장 나쁘다** — 진짜 `<App />`을 그 주소로 렌더하면 `innerHTML`이
    // 0자이고 `.wb-shell`이 없다(`app.tsx`에 `*` 라우트가 없어 아무 라우트도 안 잡힌다).
    const { id: _dropped, ...withoutId } = page
    const broken: unknown[] = [
      withoutId,
      { ...page, id: 42 },
      { ...page, id: null },
      { ...page, id: '' },
    ]

    for (const body of broken) {
      const stub = stubFetch(jsonResponse(201, body))
      const client = createHttpClient(stub.fetchImpl)

      const error = asApiError(
        await client.createPage('p1', { menuNodeId: 'm1', title: '목록' }).catch((e: unknown) => e),
      )

      expect(error.code, JSON.stringify(body)).toBe('internal')
    }
  })

  it('선언되지 않은 키만 담긴 페이지 갱신 본문은 빈 본문으로 거절된다', async () => {
    // `updateProject`·`updateMenu`와 같은 자리. `PageDetail`의 `schema`는 `PATCH`가 받지
    // 않는 키라 떨어져 나가고, 남는 것이 없으면 그 자리에서 던진다.
    const stub = stubFetch()
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(
      await client
        .updatePage('p1', 'pg1', { id: 'pg1', headSeq: 3 } as unknown as { title?: string })
        .catch((e: unknown) => e),
    )

    expect(error.code).toBe('bad-request')
    expect(stub.calls).toHaveLength(0)
  })

  it('patchOps도 선언된 세 키만 보낸다', async () => {
    // **이 자리는 다른 넷과 위험의 모양이 다르다.** 응답(`PatchResult`)에는 `baseSeq`·`ops`가
    // 없어 그것을 되보내는 것은 타입이 이미 막는다. 그런데도 같은 관용구를 쓰는 것은
    // **규칙을 한 벌로 두기 위해서다** — 자리마다 방식이 다르면 다음 사람이 자기가 먼저 본
    // 쪽을 따르고, "한 곳만 고치고 다른 곳을 놓치는" 결함이 거기서 난다.
    //
    // **닫는 케이스가 없으면 그 관용구가 지켜지는지 알 수 없어 여기 둔다.** 부르는 자리는
    // `edit/use-edit-commit.tsx` 하나이고 `store.nextRequest()`가 정확히 세 키를 주므로,
    // 이 케이스가 재는 것은 **호출부가 아니라 이 층의 계약**이다.
    const stub = stubFetch(jsonResponse(200, patchResult))
    const client = createHttpClient(stub.fetchImpl)
    const ops: PatchOp[] = [{ op: 'replace', path: '/root/children/0/props/title', value: '가' }]

    await client.patchOps('p1', 'pg1', {
      baseSeq: 7,
      ops,
      clientOpId: 'op-1',
      seq: 9,
      revisionId: 'rev-1',
    } as unknown as { baseSeq: number; ops: PatchOp[]; clientOpId?: string })

    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ baseSeq: 7, ops, clientOpId: 'op-1' })
  })

  it('페이지 응답 객체를 그대로 넘겨도 선언된 키만 나간다', async () => {
    // `PageDetail`은 여덟 키인데 요청이 받는 것은 그 일부다. **실측(api 하네스):**
    //
    //   POST  /pages     응답 그대로 → 400 인식할 수 없는 키: "id", "sortOrder", "schemaVersion", "schema", "headSeq"
    //   PATCH /pages/:id 응답 그대로 → 400 인식할 수 없는 키: "id", "schemaVersion", "schema", "headSeq"
    //   선언된 키만 담으면             → 201 / 200
    //
    // **`schema`가 섞여 나가는 것이 특히 나쁘다** — 서버는 그것을 `PUT .../schema`·
    // `PATCH .../ops`로만 받는다(`api/client.ts`의 `updatePage` 주석).
    //
    // **`updatePage`에는 `description`도 선언된 키라 나가는 것이 맞다** — 이 케이스가 재는 것은
    // *"미선언 키가 안 나간다"*이지 *"세 키만 나간다"*가 아니다. `createPage`는 둘이다(설명은
    // 설계서 「설계서 화면 구조」대로 우측 패널에서 쓰므로 만들 때는 제목만 묻는다).
    const stub = stubFetch(jsonResponse(201, page), jsonResponse(200, page))
    const client = createHttpClient(stub.fetchImpl)

    await client.createPage('p1', page)
    await client.updatePage('p1', 'pg1', { ...page })

    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ menuNodeId: 'm1', title: '목록' })
    expect(JSON.parse(String(stub.calls[1]?.init?.body))).toEqual({
      title: '목록',
      description: null,
      menuNodeId: 'm1',
      sortOrder: 0,
    })
  })

  it('나가는 키 순서는 호출자가 적은 순서가 아니라 계약의 순서다', async () => {
    // **`declaredOnly`가 만든 동작이고 의도한 것이다.** 키 목록(`BODY_KEYS`)의 순서로
    // 정규화되므로, 호출자가 어떤 순서로 적든 같은 바이트가 나간다. JSON 객체의 키 순서는
    // 뜻을 바꾸지 않고 서버의 zod도 보지 않는다.
    //
    // **이것을 케이스로 두는 것은 "바이트가 그대로다"라고 적지 않기 위해서다** — 호출자가 적은
    // 순서를 그대로 내는 구현과 견주면 값과 키 집합은 같아도 **역순으로 적은 본문은 바이트가
    // 다르다**(아래 두 호출이 그것을 잰다).
    const stub = stubFetch(jsonResponse(200, page), jsonResponse(200, page))
    const client = createHttpClient(stub.fetchImpl)

    await client.updatePage('p1', 'pg1', { sortOrder: 2, title: '가' })
    await client.updatePage('p1', 'pg1', { title: '가', sortOrder: 2 })

    expect(stub.calls[0]?.init?.body).toBe('{"title":"가","sortOrder":2}')
    expect(stub.calls[0]?.init?.body).toBe(String(stub.calls[1]?.init?.body))
  })

  it('경로에 들어가는 id는 URL 인코딩된다', async () => {
    const stub = stubFetch(jsonResponse(200, page), new Response(null, { status: 204 }))
    const client = createHttpClient(stub.fetchImpl)

    await client.updatePage('p 1/x', '../pg1', { title: '가' })
    await client.deletePage('p 1/x', '../pg1')

    expect(stub.calls[0]?.url).toBe('/api/projects/p%201%2Fx/pages/..%2Fpg1')
    expect(stub.calls[1]?.url).toBe('/api/projects/p%201%2Fx/pages/..%2Fpg1')
  })
})

/**
 * 프로젝트 CRUD 셋.
 *
 * **서버 실측**(api 하네스 — `apps/api/test/`에 임시 테스트를 두고 보내 다시 잰다):
 *
 * ```
 * POST   /projects {name,slug}                → 201 {"id","name","slug","description":null,"role":"owner"}
 * POST   /projects {name,slug,description}    → 201 (같은 다섯 키)
 * POST   /projects {name,slug,role:'owner'}   → 400 {"code":"bad-request", issues:[{"message":"인식할 수 없는 키: \"role\""}]}
 * PATCH  /projects/:id {}                     → 400 {"code":"bad-request", issues:[{"message":"변경할 값이 없습니다"}]}
 * PATCH  /projects/:id {description:null}     → 200 (description 이 null 로 바뀐다)
 * PATCH  /projects/:id {name, unknownKey}     → 400 {"message":"인식할 수 없는 키: \"unknownKey\""}
 * ```
 *
 * **읽어야 할 것 둘.**
 *
 * 1. **생성 응답에 `role`이 실려 온다** — 목록 항목과 같은 모양이다(`apps/api/src/repos/projects.ts`의
 *    `insertProject`가 `.returning([…])` 뒤에 `{ ...project, role: 'owner' }`로 감싼다). 그래서 반환 타입이
 *    `ProjectSummary`가 아니라 `ProjectDetail`이고, 응답 검사도 `SHAPES.projectDetail`을
 *    같이 쓴다.
 * 2. **그런데도 응답을 그대로 요청 본문으로 되보낼 수 없다** — `role` 키가 있으면 서버의
 *    `z.strictObject`가 400을 낸다(위 셋째 줄). 이 파일이 나가는 본문을 직접 보는 이유다.
 */
describe('프로젝트 CRUD', () => {
  it('createProject는 이름·슬러그·설명을 POST한다', async () => {
    const stub = stubFetch(jsonResponse(201, { ...project, description: '설명' }))
    const client = createHttpClient(stub.fetchImpl)

    const result = await client.createProject({ name: '프로젝트', slug: 'proj', description: '설명' })

    expect(stub.calls[0]?.url).toBe('/api/projects')
    expect(stub.calls[0]?.init?.method).toBe('POST')
    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({
      name: '프로젝트',
      slug: 'proj',
      description: '설명',
    })
    // 만든 프로젝트로 이동하려면 응답의 `id`가 필요하다.
    expect(result.id).toBe('p1')
  })

  it('설명을 주지 않으면 그 키를 만들지 않는다', async () => {
    // `undefined`를 실은 키가 통과하는 것은 `JSON.stringify`가 지워 주는 우연이라 그것에
    // 기대지 않는다(`patchOps`의 `clientOpId`와 같은 판단).
    //
    // **이 케이스만으로는 `declaredOnly`가 키를 고르지 않게 바꿔도 죽지 않는다** — 관찰 지점이
    // 직렬화된 문자열 하나뿐이라 두 구현의 바이트가 같아진다(선언된 세 키의 조합을 전부
    // 돌려 두 구현을 견주면 차이가 없다). 그것을 닫는 것은 **아래 "응답 객체를 그대로 넘겨도" 케이스**다.
    const stub = stubFetch(jsonResponse(201, project))
    const client = createHttpClient(stub.fetchImpl)

    await client.createProject({ name: '가', slug: 'ga' })

    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ name: '가', slug: 'ga' })
  })

  it('응답 객체를 그대로 넘겨도 선언된 세 키만 나간다', async () => {
    // **여기가 `declaredOnly`를 닫는 자리다.** 서버의 `CreateProjectBody`는 `z.strictObject`라
    // 선언되지 않은 키가 그 자체로 400인데, **`definedOnly`는 미선언 키를 하나도 거르지
    // 않는다** — 값이 `undefined`인 키만 뺀다. 두 장치가 막는 실패가 다르다.
    //
    // **실측(api 하네스):** `{id,name,slug,description,role}`을 실제로 보내면 `POST`·`PATCH`
    // 둘 다 `400 bad-request` / issues `[{"path":"","message":"인식할 수 없는 키: \"id\",
    // \"role\""}]`이고, 선언된 셋만 담은 본문은 200이다.
    //
    // **타입은 이것을 막지 못한다**(`tsc` 프로브): 변수로 넘기면 에러가 없고, 키를 적은
    // 리터럴만 `TS2353`이 나며, **스프레드 리터럴(`{ ...created }`)은 에러가 없다.**
    // 수정 폼이 쓰기 가장 쉬운 모양이 그 셋째다.
    const stub = stubFetch(jsonResponse(201, project), jsonResponse(200, project))
    const client = createHttpClient(stub.fetchImpl)
    const created: ProjectDetail = { id: 'p1', name: '가', slug: 'ga', description: null, role: 'owner' }

    await client.createProject(created)
    await client.updateProject('p1', { ...created })

    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({
      name: '가',
      slug: 'ga',
      description: null,
    })
    expect(JSON.parse(String(stub.calls[1]?.init?.body))).toEqual({
      name: '가',
      slug: 'ga',
      description: null,
    })
  })

  it('선언되지 않은 키만 담긴 갱신 본문은 빈 본문으로 거절된다', async () => {
    // **떨어내는 순서가 정하는 결과다.** 미선언 키를 먼저 떨어낸 뒤에 남은 키를 세므로
    // `{id, role}`은 `{}`가 되어 `updateBody`가 던진다. 순서가 반대면 "두 키가 있으니 빈
    // 본문이 아니다"로 통과해 `{}`가 서버로 나가고 400을 받는다.
    const stub = stubFetch()
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(
      await client
        .updateProject('p1', { id: 'p1', role: 'owner' } as unknown as { name?: string })
        .catch((e: unknown) => e),
    )

    expect(error.code).toBe('bad-request')
    expect(stub.calls).toHaveLength(0)
  })

  it('설명에 null을 주면 그 값을 그대로 싣는다', async () => {
    // `null`은 **"설명 없음"이라는 값**이고 키가 없는 것과 다른 뜻이다 — 서버가
    // `z.string().max(2000).nullable().optional()`로 받고 `body.description ?? null`로 쓴다.
    // 실측으로 `POST {description:null}`이 201, `PATCH {description:null}`이 200이다.
    // 걸러야 하는 것은 `undefined` 하나뿐이라는 것을 이 케이스가 못박는다
    // (`updateMenu`의 `parentId: null`과 같은 자리).
    const stub = stubFetch(jsonResponse(201, project))
    const client = createHttpClient(stub.fetchImpl)

    await client.createProject({ name: '가', slug: 'ga', description: null })

    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({
      name: '가',
      slug: 'ga',
      description: null,
    })
  })

  it('만든 프로젝트의 id가 계약과 다르면 ApiError를 던진다', async () => {
    // **그 값이 곧 주소가 된다** — 만들고 나서 그 프로젝트로 이동한다. 통과시키면
    // `ApiError`가 아니라 **201 성공 경로로** 잘못된 주소가 만들어진다.
    //
    // **빈 문자열이 가장 나쁘다.** 진짜 `<App />`으로 재면 `/projects/`는
    // `innerHTML` 0자·`.wb-shell` 없음이다(`app.tsx`에 `*` 라우트가 없다). 같은 근거로
    // `TreePage.id`·`projectDetail.id`·`projectList[].id` 셋을 막고 있고,
    // **`createProject`가 그 셋을 지키는 `isProjectDetail`을 그대로 지난다.**
    const { id: _dropped, ...withoutId } = project
    const broken: unknown[] = [withoutId, { ...project, id: 42 }, { ...project, id: null }, { ...project, id: '' }]

    for (const body of broken) {
      const stub = stubFetch(jsonResponse(201, body))
      const client = createHttpClient(stub.fetchImpl)

      const error = asApiError(
        await client.createProject({ name: '가', slug: 'ga' }).catch((e: unknown) => e),
      )

      expect(error.code, JSON.stringify(body)).toBe('internal')
    }
  })

  it('updateProject는 준 키만 본문에 만든다', async () => {
    const stub = stubFetch(jsonResponse(200, { ...project, name: '새 이름' }))
    const client = createHttpClient(stub.fetchImpl)

    await client.updateProject('p1', { name: '새 이름' })

    expect(stub.calls[0]?.url).toBe('/api/projects/p1')
    expect(stub.calls[0]?.init?.method).toBe('PATCH')
    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ name: '새 이름' })
  })

  it('updateProject는 description: null을 싣는다 — 키 없음과 다른 뜻이다', async () => {
    // 키가 없으면 "설명을 바꾸지 않는다", `null`이면 "설명을 지운다"이다. 실측으로 그
    // 본문이 200이고 응답의 `description`이 `null`이 된다.
    const stub = stubFetch(jsonResponse(200, project))
    const client = createHttpClient(stub.fetchImpl)

    await client.updateProject('p1', { description: null })

    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({ description: null })
  })

  it('updateProject는 준 키를 전부 싣는다', async () => {
    const stub = stubFetch(jsonResponse(200, project))
    const client = createHttpClient(stub.fetchImpl)

    await client.updateProject('p1', { name: '가', slug: 'ga', description: '설명' })

    expect(JSON.parse(String(stub.calls[0]?.init?.body))).toEqual({
      name: '가',
      slug: 'ga',
      description: '설명',
    })
  })

  it('빈 갱신 본문은 그 자리에서 거절한다', async () => {
    // **프로젝트 쪽도 같다**(위 머리말의 실측): `PATCH /projects/:id {}`가
    // `400 {"code":"bad-request", …, "issues":[{"path":"","message":"변경할 값이 없습니다"}]}`로
    // 메뉴·페이지와 **같은 코드·문장**이다. 보내 봐야 400인 요청은 만들지 않는다 —
    // 메뉴·페이지와 같은 `updateBody`를 쓴다(**따로 만들지 않는다**).
    const stub = stubFetch()
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(await client.updateProject('p1', {}).catch((e: unknown) => e))

    expect(error.code).toBe('bad-request')
    expect(error.status).toBe(0)
    expect(stub.calls).toHaveLength(0)
  })

  it('undefined만 담긴 갱신 본문도 같다', async () => {
    const stub = stubFetch()
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(
      await client
        .updateProject('p1', { name: undefined, slug: undefined, description: undefined })
        .catch((e: unknown) => e),
    )

    expect(error.code).toBe('bad-request')
    expect(stub.calls).toHaveLength(0)
  })

  it('프로젝트 갱신의 거절도 동기 throw가 아니라 rejection이다', () => {
    const client = createHttpClient(stubFetch().fetchImpl)

    expect(() => client.updateProject('p1', {}).catch(() => undefined)).not.toThrow()
  })

  it('갱신 응답도 프로젝트 계약을 지난다', async () => {
    // `PATCH`의 응답은 `GET /:projectId`와 같은 다섯 키다(실측). 조회만 검사하고 쓰기를
    // 통과시키면 같은 계약이 반쪽만 지켜진다 — `pageDetail`과 같은 부류다.
    const stub = stubFetch(jsonResponse(200, { ...project, id: '' }))
    const client = createHttpClient(stub.fetchImpl)

    const error = asApiError(await client.updateProject('p1', { name: '가' }).catch((e: unknown) => e))

    expect(error.code).toBe('internal')
  })

  it('deleteProject는 204를 본문 없이 받는다', async () => {
    const empty = new Response(null, { status: 204 })
    const json = vi.spyOn(empty, 'json')
    const stub = stubFetch(empty)
    const client = createHttpClient(stub.fetchImpl)

    await expect(client.deleteProject('p1')).resolves.toBeUndefined()

    expect(stub.calls[0]?.url).toBe('/api/projects/p1')
    expect(stub.calls[0]?.init?.method).toBe('DELETE')
    expect(json).not.toHaveBeenCalled()
  })

  it('경로에 들어가는 프로젝트 id는 URL 인코딩된다', async () => {
    const stub = stubFetch(jsonResponse(200, project), new Response(null, { status: 204 }))
    const client = createHttpClient(stub.fetchImpl)

    await client.updateProject('p 1/x', { name: '가' })
    await client.deleteProject('p 1/x')

    expect(stub.calls[0]?.url).toBe('/api/projects/p%201%2Fx')
    expect(stub.calls[1]?.url).toBe('/api/projects/p%201%2Fx')
  })
})

/**
 * **일반 읽기의 시간 제한**(`http-client.ts`의 `READ_DEADLINE_MS`). 시간 제한이 없으면 서버가 답을 안 줄 때 걸린 읽기가
 * 끝없이 «불러오는 중»이다(Chrome 에서 잰 고장 방식 · Postgres 컨테이너 `pause`: 세션 확인은 빈 흰 화면).
 *
 * 혼자 죽는 변조(백업 → 한 줄 → web 전량 → 바이트 비교 복원):
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 다 넘긴 거절을 `UNREACHABLE`로 | *"둘 다 넘으면 …"* **혼자** |
 * | 한 번만 보낸다(`READ_ATTEMPTS = 1`) | *"첫 번째가 넘으면 …"* **혼자** |
 * | PPTX 미리보기에도 건다(`{ deadline: false }`를 뺀다) | *"미리보기는 …"* **혼자** |
 * | 받은 신호가 있어도 건다 | 위 절의 *"판정용 읽기 둘은 …"* **혼자** |
 * | 쓰기에도 건다(`method === 'GET'`을 뺀다) | 위 절의 *"쓰기 다섯은 …"* **혼자** |
 * | 머리가 와도 타이머를 안 치운다(`finally`의 `clearTimeout`을 뺀다) | *"머리가 시간 안에 오면 …"* **혼자** |
 * | 떠나도 요청을 안 끊는다(`cancel`에 귀를 안 단다) | *"떠나면 머리 전이든 …"* **혼자** |
 * | 머리가 온 뒤에는 떠나도 안 끊는다(성공한 시도에서 귀를 뗀다) | *"떠나면 머리 전이든 …"* **혼자** |
 * | 끊긴 조회를 다시 보낸다(시도 머리의 `gone()` 검사를 뺀다 → 시간 초과처럼 다음 시도) | *"끊긴 조회는 다시 보내지 않는다 …"* **혼자** |
 */
describe('일반 읽기의 시간 제한 — 넘으면 한 번 더, 그래도 넘으면 거절한다', () => {
  const DEADLINE = 10_000

  /** 차례대로 답하는 가짜 — `'hang'`이면 **끊길 때까지** 답하지 않는다(실제 `fetch`처럼 끊기면 거절한다). */
  function hangingFetch(...answers: (Response | 'hang')[]): FetchStub {
    const calls: RecordedCall[] = []
    const fetchImpl: typeof fetch = (input, init) => {
      calls.push({ url: String(input), init })
      const answer = answers[calls.length - 1]
      if (answer === undefined) return Promise.reject(new Error('준비된 답이 없다'))
      if (answer !== 'hang') return Promise.resolve(answer)
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('요청을 끊었다', 'AbortError')))
      })
    }
    return { fetchImpl, calls }
  }

  it('둘 다 넘으면 «서버가 응답하지 않습니다»로 거절한다 — 끝없이 기다리지 않는다', async () => {
    vi.useFakeTimers()
    try {
      const stub = hangingFetch('hang', 'hang')
      const settled = createHttpClient(stub.fetchImpl).me().then(
        () => 'resolved',
        (caught: unknown) => caught,
      )
      await vi.advanceTimersByTimeAsync(DEADLINE * 2)

      const caught = await settled
      expect(caught).toBeInstanceOf(ApiError)
      expect((caught as ApiError).message).toBe('서버가 응답하지 않습니다 — 잠시 뒤 새로고침하세요')
      // 매달린 요청을 남기지 않는다 — 보낸 것은 전부 끊었다.
      expect(stub.calls.every((call) => call.init?.signal?.aborted === true)).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('첫 번째가 넘으면 끊고 한 번 더 보낸다 — 둘째가 답하면 그 값이다', async () => {
    vi.useFakeTimers()
    try {
      const stub = hangingFetch('hang', jsonResponse(200, user))
      const answer = createHttpClient(stub.fetchImpl).me()
      await vi.advanceTimersByTimeAsync(DEADLINE)

      await expect(answer).resolves.toEqual(user)
      expect(stub.calls).toHaveLength(2)
      expect(stub.calls[0]?.init?.signal?.aborted).toBe(true)
      expect(stub.calls[1]?.url).toBe(stub.calls[0]?.url)
    } finally {
      vi.useRealTimers()
    }
  })

  /**
   * 머리는 곧바로 주고 **본문은 `bodyAfter` 뒤에** 주는 가짜 — 실제 `fetch`처럼 끊기면 본문 읽기가 거절된다(Chrome 의
   * 스로틀이 이 모양이다: 머리는 지연 뒤 곧바로, 본문만 늦는다).
   */
  function slowBodyFetch(body: unknown, bodyAfter: number): FetchStub {
    const calls: RecordedCall[] = []
    const fetchImpl: typeof fetch = (input, init) => {
      calls.push({ url: String(input), init })
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const timer = setTimeout(() => {
            controller.enqueue(new TextEncoder().encode(JSON.stringify(body)))
            controller.close()
          }, bodyAfter)
          init?.signal?.addEventListener('abort', () => {
            clearTimeout(timer)
            controller.error(new DOMException('요청을 끊었다', 'AbortError'))
          })
        },
      })
      return Promise.resolve(new Response(stream, { status: 200, headers: { 'content-type': 'application/json' } }))
    }
    return { fetchImpl, calls }
  }

  it('머리가 시간 안에 오면 본문이 10초를 넘어도 끊지 않는다 — 큰 문서 × 느린 망에서도 페이지가 선다', async () => {
    // Chrome(40KB/s · 1MB 페이지)에서 머리 2.2s · 본문 끝 27.4s 다(`READ_DEADLINE_MS` 머리말 «응답 머리까지만 잰다»).
    vi.useFakeTimers()
    try {
      const stub = slowBodyFetch(page, DEADLINE * 2.5)
      const settled = createHttpClient(stub.fetchImpl).getPage('p1', 'pg1').then(
        (value) => value,
        (caught: unknown) => caught,
      )
      await vi.advanceTimersByTimeAsync(DEADLINE * 3)

      expect(await settled).toEqual(page)
      expect(stub.calls).toHaveLength(1)
      expect(stub.calls[0]?.init?.signal?.aborted).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('떠나면 머리 전이든 본문을 읽는 중이든 요청을 끊는다 — 떠난 방문의 본문이 브라우저 연결을 쥐지 않는다', async () => {
    // 끊지 않으면 버려진 1MB 본문 여섯이 Chrome 의 호스트당 연결 여섯을 쥐고, 다음 방문의 조회가 브라우저
    // 안에서 줄을 서 «서버가 응답하지 않습니다»까지 간다(`READ_DEADLINE_MS` 머리말 «떠난 조회는 끊는다»).
    vi.useFakeTimers()
    try {
      // 머리 전 — 답이 없는 채 떠난다.
      const before = hangingFetch('hang')
      const beforeLeave = new AbortController()
      const first = createHttpClient(before.fetchImpl)
        .getPage('p1', 'pg1', { cancel: beforeLeave.signal })
        .then(() => 'resolved', (caught: unknown) => caught)
      await vi.advanceTimersByTimeAsync(1_000)
      beforeLeave.abort()
      await vi.advanceTimersByTimeAsync(0)
      expect(before.calls[0]?.init?.signal?.aborted).toBe(true)
      expect(await first).toBeInstanceOf(ApiError)

      // 본문을 읽는 중 — 머리는 왔고 본문이 내려오는 중에 떠난다.
      const during = slowBodyFetch(page, DEADLINE * 2.5)
      const duringLeave = new AbortController()
      const second = createHttpClient(during.fetchImpl)
        .getPage('p1', 'pg1', { cancel: duringLeave.signal })
        .then(() => 'resolved', (caught: unknown) => caught)
      // 머리는 왔고 본문이 내려오는 중이다 — 시간 제한과 엮이지 않게 10초 안에서 떠난다(그 축은 위 케이스의 것이다).
      await vi.advanceTimersByTimeAsync(1_000)
      expect(during.calls[0]?.init?.signal?.aborted).toBe(false)
      duringLeave.abort()
      await vi.advanceTimersByTimeAsync(0)
      expect(during.calls[0]?.init?.signal?.aborted).toBe(true)
      expect(await second).toBeInstanceOf(ApiError)
    } finally {
      vi.useRealTimers()
    }
  })

  it('끊긴 조회는 다시 보내지 않는다 — 10초가 지나도 요청은 하나다', async () => {
    // 끊긴 조회를 다시 보내면 버려진 조회도 10초가 되면 다시 나가 줄을 더 길게 만든다.
    vi.useFakeTimers()
    try {
      const stub = hangingFetch('hang', 'hang')
      const leave = new AbortController()
      const settled = createHttpClient(stub.fetchImpl)
        .getPage('p1', 'pg1', { cancel: leave.signal })
        .then(() => 'resolved', (caught: unknown) => caught)
      await vi.advanceTimersByTimeAsync(1_000)
      leave.abort()
      await vi.advanceTimersByTimeAsync(DEADLINE * 3)

      expect(stub.calls).toHaveLength(1)
      const caught = await settled
      expect(caught).toBeInstanceOf(ApiError)
      // 시간 초과로 읽히지 않는다 — 떠난 것이지 서버가 답을 안 한 것이 아니다.
      expect((caught as ApiError).message).not.toBe('서버가 응답하지 않습니다 — 잠시 뒤 새로고침하세요')
    } finally {
      vi.useRealTimers()
    }
  })

  it('미리보기(PPTX 는 서버가 페이지를 그린다)에는 시간 제한을 안 건다 — 1분이 지나도 기다린다', async () => {
    vi.useFakeTimers()
    try {
      const stub = hangingFetch('hang')
      let settled = false
      void createHttpClient(stub.fetchImpl)
        .getExportPreview('p1', 'pptx')
        .finally(() => {
          settled = true
        })
        .catch(() => undefined)
      await vi.advanceTimersByTimeAsync(60_000)

      expect(settled).toBe(false)
      expect(stub.calls).toHaveLength(1)
      expect(Object.keys(stub.calls[0]?.init ?? {})).not.toContain('signal')
    } finally {
      vi.useRealTimers()
    }
  })

  it('미리보기도 떠나면 끊는다 — 시간 제한 없이 기다리다가, 끊기면 다시 보내지 않는다', async () => {
    // 끊지 않으면 서버는 연결이 닫힐 때까지 그 내보내기를 끝까지 돌고 다음 미리보기가 그 뒤에 선다
    // (`shell/export-panel.tsx` 머리말 «앞 요청은 끊는다»).
    vi.useFakeTimers()
    try {
      const stub = hangingFetch('hang', 'hang')
      const leave = new AbortController()
      const settled = createHttpClient(stub.fetchImpl)
        .getExportPreview('p1', 'pptx', { cancel: leave.signal })
        .then(() => 'resolved', (caught: unknown) => caught)
      await vi.advanceTimersByTimeAsync(60_000)
      expect(stub.calls[0]?.init?.signal?.aborted).toBe(false)

      leave.abort()
      await vi.advanceTimersByTimeAsync(DEADLINE * 3)
      expect(stub.calls).toHaveLength(1)
      expect(stub.calls[0]?.init?.signal?.aborted).toBe(true)
      const caught = await settled
      expect(caught).toBeInstanceOf(ApiError)
      // 연결 실패로 읽히지 않는다 — 떠난 것이다.
      expect((caught as ApiError).message).toBe('떠난 화면의 조회를 끊었습니다')
    } finally {
      vi.useRealTimers()
    }
  })
})
