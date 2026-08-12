import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { roleAtLeast } from '../src/auth/roles'
import type { ProjectRole } from '../src/db/types'
import { insertSnapshot } from '../src/repos/snapshots'
import { insertTheme } from '../src/repos/themes'
import { SNAPSHOT_PAYLOAD_VERSION } from '../src/services/snapshot-payload'
import { addMember, createMenuNode, createPage, createProject, signup, withApi, type TestContext } from './helpers'

type Actor = ProjectRole | 'outsider' | 'anonymous'

interface Case {
  label: string
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT'
  /** :projectId 는 실제 id로 치환된다. */
  url: string
  /**
   * 정적 값이면 그대로 보낸다. 함수면 `setup`이 반환한 치환 맵을 받아 payload를
   * 만든다 — `setup`이 실행 시점에 만드는 리소스 id(예: 새 페이지가 참조할
   * 실제 `menuNodeId`)를 payload 안에 실어야 하는 케이스(페이지 생성)를 위해서다.
   */
  payload?: unknown | ((substitutions: Record<string, string>) => unknown)
  /** 이 역할 이상이면 통과한다. */
  allowed: Actor[]
  /**
   * 케이스 실행 전에 owner 권한으로 리소스를 만든다.
   * 반환한 맵의 키가 url의 `:키` 자리에 치환된다(projectId는 하네스가 이미 넣는다).
   * `payload`가 함수면 같은 맵을 받는다.
   *
   * **넷째 인자가 지금 요청을 보낼 주체의 `userId`다**(P5-1이 더했다). 소유권이 걸린
   * 리소스를 그 주체의 것으로 만들어야 하는 케이스가 생겼기 때문이다 — 코멘트 수정은
   * **작성자만** 할 수 있어서(`routes/comments.ts`의 재라 #2), owner가 만든 코멘트를
   * editor가 고치려 하면 **권한과 무관한 이유로** 403이 된다. 그러면 이 매트릭스가
   * 재려는 것(역할 판정)을 못 잰다 — `테마하나`가 시스템 테마를 피하는 것과 같은 이유다.
   *
   * `anonymous`에게는 주체가 없으므로 owner의 id가 온다. 그 행은 어차피 인증 훅에서
   * 끝나므로(401) 누구의 것인지가 결과를 바꾸지 않는다.
   */
  setup?: (
    ctx: TestContext,
    projectId: string,
    ownerCookie: { wb_session: string },
    actorUserId: string,
  ) => Promise<Record<string, string>>
}

/** ':nodeId'가 필요한 케이스(메뉴 수정·삭제)가 실행 전에 대상 메뉴 노드를 만든다. */
const 메뉴하나 = async (
  ctx: TestContext,
  projectId: string,
  ownerCookie: { wb_session: string },
): Promise<Record<string, string>> => ({
  nodeId: (await createMenuNode(ctx, ownerCookie, projectId, { title: '대상 메뉴' })).id,
})

/**
 * ':userId'가 필요한 케이스(멤버 수정·삭제)가 실행 전에 대상 멤버를 만든다.
 * 멤버 초대 API가 아니라 `addMember`(DB 직접 삽입)를 쓴다 — `helpers.ts`의
 * `addMember` 문서와 같은 이유: 픽스처가 검사 대상 API에 의존하면 그 API가
 * 깨졌을 때 무관한 테스트가 전부 무너진다.
 */
const 멤버하나 = async (
  ctx: TestContext,
  projectId: string,
  _ownerCookie: { wb_session: string },
): Promise<Record<string, string>> => {
  const target = await signup(ctx)
  await addMember(ctx, projectId, target.user.id, 'viewer')
  return { userId: target.user.id }
}

/** ':menuNodeId'가 필요한 케이스(페이지 생성)가 실행 전에 대상 메뉴 노드를 만든다. */
const 페이지용메뉴 = async (
  ctx: TestContext,
  projectId: string,
  ownerCookie: { wb_session: string },
): Promise<Record<string, string>> => ({
  menuNodeId: (await createMenuNode(ctx, ownerCookie, projectId, { title: '페이지용 메뉴' })).id,
})

/** ':pageId'가 필요한 케이스(페이지 조회·수정·스키마 저장·삭제)가 실행 전에 대상 페이지를 만든다. */
const 페이지하나 = async (
  ctx: TestContext,
  projectId: string,
  ownerCookie: { wb_session: string },
): Promise<Record<string, string>> => {
  const menu = await createMenuNode(ctx, ownerCookie, projectId, { title: '대상 메뉴' })
  const page = await createPage(ctx, ownerCookie, projectId, menu.id, { title: '대상 페이지' })
  return { pageId: page.id }
}

/**
 * ':nodeId'가 필요한 케이스(코멘트 생성)가 실행 전에 페이지와 그 루트 노드를 잡는다.
 * 서버가 빈 페이지를 만들 때 `Page` 루트 하나를 넣으므로 그 id가 코멘트를 달 대상이다.
 */
const 코멘트용페이지 = async (
  ctx: TestContext,
  projectId: string,
  ownerCookie: { wb_session: string },
): Promise<Record<string, string>> => {
  const menu = await createMenuNode(ctx, ownerCookie, projectId, { title: '대상 메뉴' })
  const page = await createPage(ctx, ownerCookie, projectId, menu.id, { title: '대상 페이지' })
  return { pageId: page.id, nodeId: (page.schema as { root: { id: string } }).root.id }
}

/**
 * ':commentId'가 필요한 케이스(코멘트 수정·삭제)가 실행 전에 대상 코멘트를 만든다.
 *
 * **작성자를 `actorUserId`로 둔다** — 위 `setup` 주석의 이유(수정이 작성자 전용이라
 * 남의 것이면 역할과 무관한 403이 된다).
 *
 * **API가 아니라 DB에 직접 넣는다.** `addMember`와 같은 이유다 — 픽스처가 검사 대상
 * API(`POST .../comments`)에 의존하면 그 API가 깨졌을 때 수정·삭제 행까지 함께 무너져
 * 원인을 가릴 수 없다. 그리고 그 경로로 만들면 작성자를 고를 수 없다.
 */
const 코멘트하나 = async (
  ctx: TestContext,
  projectId: string,
  ownerCookie: { wb_session: string },
  actorUserId: string,
): Promise<Record<string, string>> => {
  const menu = await createMenuNode(ctx, ownerCookie, projectId, { title: '대상 메뉴' })
  const page = await createPage(ctx, ownerCookie, projectId, menu.id, { title: '대상 페이지' })
  const nodeId = (page.schema as { root: { id: string } }).root.id
  const comment = await ctx.db
    .insertInto('comments')
    .values({ page_id: page.id, node_id: nodeId, body: '대상 코멘트', author_id: actorUserId })
    .returning('id')
    .executeTakeFirstOrThrow()

  return { pageId: page.id, nodeId, commentId: comment.id }
}

/**
 * ':themeId'가 필요한 케이스(테마 조회·수정·삭제)가 실행 전에 대상 테마를 만든다.
 *
 * **시스템 테마를 쓰지 않는다.** 그것은 owner도 수정할 수 없어(§6.10) 수정·삭제 행이
 * 권한과 무관한 이유로 403이 되고, 그러면 이 매트릭스가 재려는 것(역할 판정)을 못 잰다.
 */
const 테마하나 = async (
  ctx: TestContext,
  projectId: string,
  _ownerCookie: { wb_session: string },
): Promise<Record<string, string>> => ({
  themeId: (await insertTheme(ctx.db, projectId, { meta: { id: 'target', name: '대상 테마', version: '1.0.0' } })).id,
})

/**
 * ':snapshotId'가 필요한 케이스(스냅샷 조회)가 실행 전에 대상 스냅샷을 만든다.
 *
 * **API가 아니라 repo로 넣는다** — `코멘트하나`와 같은 이유다: 픽스처가 검사 대상
 * API(`POST .../snapshots`)에 의존하면 그쪽이 깨졌을 때 조회 행까지 함께 무너진다.
 * payload는 규격을 만족하는 최소본이면 된다 — 이 행이 재는 것은 역할 판정이다.
 */
const 스냅샷하나 = async (
  ctx: TestContext,
  projectId: string,
  _ownerCookie: { wb_session: string },
  actorUserId: string,
): Promise<Record<string, string>> => ({
  snapshotId: (
    await insertSnapshot(ctx.db, {
      projectId,
      tag: '대상 스냅샷',
      description: null,
      payload: {
        payloadVersion: SNAPSHOT_PAYLOAD_VERSION,
        capturedAt: '2026-08-12T00:00:00.000Z',
        menu: [],
        pages: [],
        layouts: [],
        themes: [],
        comments: [],
      },
      createdBy: actorUserId,
    })
  ).id,
})

const CASES: Case[] = [
  { label: '프로젝트 조회', method: 'GET', url: '/api/projects/:projectId', allowed: ['owner', 'editor', 'viewer'] },
  { label: '프로젝트 수정', method: 'PATCH', url: '/api/projects/:projectId', payload: { name: '바뀐 이름' }, allowed: ['owner'] },
  { label: '프로젝트 삭제', method: 'DELETE', url: '/api/projects/:projectId', allowed: ['owner'] },
  { label: '멤버 목록', method: 'GET', url: '/api/projects/:projectId/members', allowed: ['owner', 'editor', 'viewer'] },
  { label: '멤버 초대', method: 'POST', url: '/api/projects/:projectId/members', payload: { email: 'invitee@example.com', role: 'viewer' }, allowed: ['owner'] },
  {
    label: '멤버 수정',
    method: 'PATCH',
    url: '/api/projects/:projectId/members/:userId',
    payload: { role: 'editor' },
    allowed: ['owner'],
    setup: 멤버하나,
  },
  {
    label: '멤버 삭제',
    method: 'DELETE',
    url: '/api/projects/:projectId/members/:userId',
    allowed: ['owner'],
    setup: 멤버하나,
  },
  { label: '메뉴 조회', method: 'GET', url: '/api/projects/:projectId/menu', allowed: ['owner', 'editor', 'viewer'] },
  {
    label: '메뉴 생성',
    method: 'POST',
    url: '/api/projects/:projectId/menu',
    payload: { title: '새 메뉴' },
    allowed: ['owner', 'editor'],
  },
  {
    label: '메뉴 수정',
    method: 'PATCH',
    url: '/api/projects/:projectId/menu/:nodeId',
    payload: { title: '바뀐 메뉴' },
    allowed: ['owner', 'editor'],
    setup: 메뉴하나,
  },
  {
    label: '메뉴 삭제',
    method: 'DELETE',
    url: '/api/projects/:projectId/menu/:nodeId',
    allowed: ['owner', 'editor'],
    setup: 메뉴하나,
  },
  {
    label: '페이지 생성',
    method: 'POST',
    url: '/api/projects/:projectId/pages',
    payload: (subs: Record<string, string>) => ({ menuNodeId: subs.menuNodeId, title: '새 페이지' }),
    allowed: ['owner', 'editor'],
    setup: 페이지용메뉴,
  },
  {
    label: '페이지 조회',
    method: 'GET',
    url: '/api/projects/:projectId/pages/:pageId',
    allowed: ['owner', 'editor', 'viewer'],
    setup: 페이지하나,
  },
  {
    label: '페이지 수정',
    method: 'PATCH',
    url: '/api/projects/:projectId/pages/:pageId',
    payload: { title: '바뀐 페이지' },
    allowed: ['owner', 'editor'],
    setup: 페이지하나,
  },
  {
    label: '페이지 스키마 저장',
    method: 'PUT',
    url: '/api/projects/:projectId/pages/:pageId/schema',
    payload: { schema: { version: 1, root: { id: 'n_root', type: 'Page', children: [] } } },
    allowed: ['owner', 'editor'],
    setup: 페이지하나,
  },
  {
    label: '페이지 ops 편집',
    method: 'PATCH',
    url: '/api/projects/:projectId/pages/:pageId/ops',
    // 빈 ops를 보낸다 — 이 행이 검사하는 것은 권한 판정이지 편집 내용이 아니다.
    // 문서를 실제로 바꾸는 payload를 쓰면 카탈로그·경로 규칙이 실패할 때 권한과
    // 무관한 이유로 이 행 전체가 무너진다.
    payload: { baseSeq: 0, ops: [] },
    allowed: ['owner', 'editor'],
    setup: 페이지하나,
  },
  {
    label: '페이지 이력 조회',
    method: 'GET',
    url: '/api/projects/:projectId/pages/:pageId/revisions',
    allowed: ['owner', 'editor', 'viewer'],
    setup: 페이지하나,
  },
  {
    label: '페이지 삭제',
    method: 'DELETE',
    url: '/api/projects/:projectId/pages/:pageId',
    allowed: ['owner', 'editor'],
    setup: 페이지하나,
  },
  // --- 코멘트 다섯(P5-1). **이 다섯 줄이 없어서 `표의 완전성`이 죽는 것을 먼저 봤다** —
  // `projectGuard가 걸린 라우트가 전부 표에 있다` 한 케이스가 `[…(5)]`를 냈다(P5-1이 쟀다).
  {
    label: '코멘트 조회',
    method: 'GET',
    url: '/api/projects/:projectId/pages/:pageId/comments',
    allowed: ['owner', 'editor', 'viewer'],
    setup: 페이지하나,
  },
  {
    label: '코멘트 작성',
    method: 'POST',
    url: '/api/projects/:projectId/pages/:pageId/comments',
    // `nodeId`는 setup이 만든 페이지의 실제 루트 id다 — 없는 노드를 주면 404가 되어
    // 이 행이 권한과 무관한 이유로 무너진다(페이지 생성 행이 `menuNodeId`를 그렇게 넘긴다).
    payload: (subs: Record<string, string>) => ({ nodeId: subs.nodeId, body: '새 코멘트' }),
    allowed: ['owner', 'editor'],
    setup: 코멘트용페이지,
  },
  {
    label: '코멘트 수정',
    method: 'PATCH',
    url: '/api/projects/:projectId/pages/:pageId/comments/:commentId',
    payload: { body: '바뀐 코멘트' },
    allowed: ['owner', 'editor'],
    setup: 코멘트하나,
  },
  {
    label: '코멘트 삭제',
    method: 'DELETE',
    url: '/api/projects/:projectId/pages/:pageId/comments/:commentId',
    allowed: ['owner', 'editor'],
    setup: 코멘트하나,
  },
  {
    label: '코멘트 재번호',
    method: 'POST',
    url: '/api/projects/:projectId/pages/:pageId/comments/renumber',
    allowed: ['owner', 'editor'],
    setup: 페이지하나,
  },
  { label: '트리 조회', method: 'GET', url: '/api/projects/:projectId/tree', allowed: ['owner', 'editor', 'viewer'] },
  {
    // **캔버스가 부르는 유일한 테마 엔드포인트다**(`apps/web`의 `useProjectTheme`).
    // 이 줄이 없어서 권한 가드를 **아예 없애도**(과소 차단) **owner 전용으로 좁혀도**
    // (과도 차단) api 599케이스 중 0건이 죽었다 — 리뷰가 양방향으로 실측했다.
    label: '프로젝트의 현재 테마',
    method: 'GET',
    url: '/api/projects/:projectId/theme',
    allowed: ['owner', 'editor', 'viewer'],
  },
  {
    // **테마를 고르는 것은 owner 전용이다**(§10 — 테마 편집과 같은 등급). 페이지·메뉴가
    // editor까지 허용하는 것과 다른 이유: 이 한 번의 호출이 그 프로젝트의 **모든 화면**을
    // 바꾼다.
    //
    // **`{ themeId: null }`을 보낸다.** 이 행이 재는 것은 역할 판정이지 고르기의 내용이
    // 아니다 — 실제 테마 id를 실으려면 `setup`이 필요하고, 그러면 그 픽스처가 깨질 때
    // 권한과 무관한 이유로 이 행 전체가 무너진다(페이지 ops 행과 같은 판단이다).
    label: '프로젝트 테마 고르기',
    method: 'PUT',
    url: '/api/projects/:projectId/theme',
    payload: { themeId: null },
    allowed: ['owner'],
  },
  { label: '테마 목록', method: 'GET', url: '/api/projects/:projectId/themes', allowed: ['owner', 'editor', 'viewer'] },
  {
    label: '테마 조회',
    method: 'GET',
    url: '/api/projects/:projectId/themes/:themeId',
    allowed: ['owner', 'editor', 'viewer'],
    setup: 테마하나,
  },
  {
    // **테마 편집은 owner 전용이다**(§10·§6.10) — 페이지·메뉴가 editor까지 허용하는 것과 다르다.
    label: '테마 생성',
    method: 'POST',
    url: '/api/projects/:projectId/themes',
    payload: { theme: { meta: { id: 'new-theme', name: '새 테마', version: '1.0.0' } } },
    allowed: ['owner'],
  },
  {
    label: '테마 수정',
    method: 'PUT',
    url: '/api/projects/:projectId/themes/:themeId',
    payload: { theme: { meta: { id: 'target', name: '바뀐 테마', version: '2.0.0' } } },
    allowed: ['owner'],
    setup: 테마하나,
  },
  {
    label: '테마 삭제',
    method: 'DELETE',
    url: '/api/projects/:projectId/themes/:themeId',
    allowed: ['owner'],
    setup: 테마하나,
  },
  {
    // **스냅샷 생성은 editor다**(§10 — *"editor: … 스냅샷 생성 (복원 불가)"*). 테마 고르기가
    // owner인 것과 갈리는 이유: 스냅샷은 아무것도 바꾸지 않는다. 지금 상태를 적어 둘 뿐이다.
    //
    // **태그를 행마다 다르게 하지 않는다.** 각 행이 `withApi`로 새 프로젝트를 만들고
    // 유일성 단위가 `(project_id, tag)`라 충돌할 자리가 없다.
    label: '스냅샷 생성',
    method: 'POST',
    url: '/api/projects/:projectId/snapshots',
    payload: { tag: 'v1' },
    allowed: ['owner', 'editor'],
  },
  {
    label: '스냅샷 목록',
    method: 'GET',
    url: '/api/projects/:projectId/snapshots',
    allowed: ['owner', 'editor', 'viewer'],
  },
  {
    // **`setup`이 없다 — 없는 id로 친다.** 이 행이 재는 것은 역할 판정이고, 가드는
    // 핸들러보다 **먼저** 돈다(preHandler). 거부는 401/403/404로 갈리고, 허용된 역할은
    // 핸들러에 도달해 404를 받는데 그것도 4xx가 아님을 보는 판정에는 걸리지 않는다 —
    // 그래서 실제 스냅샷을 만드는 픽스처가 필요 없다.
    //
    // **다만 그 404가 outsider의 404와 겹친다.** 아래 `허용된 역할이 4xx가 아니다`가
    // 그 겹침을 그냥 넘기지 않도록 실제 스냅샷을 만들어 둔다.
    label: '스냅샷 조회',
    method: 'GET',
    url: '/api/projects/:projectId/snapshots/:snapshotId',
    allowed: ['owner', 'editor', 'viewer'],
    setup: 스냅샷하나,
  },
]

/**
 * `src/routes/`의 원문. **`projectGuard`가 걸린 라우트를 전수로 세어 위 `CASES`와 맞대기
 * 위해서다** — 아래 *"표가 라우트를 하나도 빠뜨리지 않는다"* 참고.
 *
 * `apps/web/test/api-consumers.test.ts`와 같은 배치다: 소스를 훑는 검사가 **`test/`에
 * 살아야** 자기 자신을 훑지 않는다. 여기서는 `src/routes/`만 보므로 그 위험이 애초에
 * 없지만, 같은 이유로 **주석은 걷는다**(주석 안의 라우트 인용이 세어지면 안 된다).
 *
 * **`import.meta.glob`이 아니라 `node:fs`로 읽는다.** 그것은 Vite가 주는 것이고
 * `apps/api`의 tsconfig에는 `vite/client` 타입이 없다(`types: ["node"]`) — 웹 쪽 선례를
 * 그대로 옮기면 컴파일이 깨진다(실제로 깨뜨려 보고 알았다). 여기는 Node 앱이므로
 * 파일을 그냥 읽는 편이 결이 맞는다.
 *
 * 경로는 **이 파일 기준**으로 잡는다 — vitest의 cwd는 저장소 루트라 상대 경로로 적으면
 * 실행 위치에 묶인다.
 */
const ROUTES_DIR = fileURLToPath(new URL('../src/routes', import.meta.url))

const ROUTE_SOURCES: Record<string, string> = Object.fromEntries(
  readdirSync(ROUTES_DIR)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => [name, readFileSync(join(ROUTES_DIR, name), 'utf8')]),
)

/**
 * 블록·줄 주석을 걷는다. 문자열 안의 `//`를 주석으로 오인할 수 있지만, 여기서 찾는 것은
 * `app.get('…', { preHandler: projectGuard('…') }` 꼴이고 그 앞에 `//`가 든 문자열이 올
 * 자리가 없다 — 오인해서 지워도 **라우트를 놓치는 쪽으로만** 틀리고, 그러면 아래 검사가
 * 죽어 사람이 본다(조용히 통과하는 방향이 아니다).
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/** 소스에 실제로 선언된, `projectGuard`가 걸린 라우트. */
function declaredRoutes(): { method: string; url: string; min: ProjectRole }[] {
  const found: { method: string; url: string; min: ProjectRole }[] = []
  for (const source of Object.values(ROUTE_SOURCES)) {
    const pattern = /app\.(get|post|patch|put|delete)\(\s*'([^']+)'\s*,\s*\{\s*preHandler:\s*projectGuard\('(\w+)'\)/g
    for (const match of stripComments(source).matchAll(pattern)) {
      found.push({
        method: match[1]!.toUpperCase(),
        // 라우트는 `/api/projects` prefix로 등록된다(`app.ts`).
        url: `/api/projects${match[2]}`,
        min: match[3] as ProjectRole,
      })
    }
  }
  return found
}

const ACTORS: Actor[] = ['owner', 'editor', 'viewer', 'outsider', 'anonymous']

/** 거부는 상태로 판별한다. 허용된 경우의 성공 상태는 케이스마다 다르므로 4xx가 아님만 본다. */
function expectedRejection(actor: Actor): number {
  if (actor === 'anonymous') return 401
  if (actor === 'outsider') return 404   // 프로젝트 존재를 숨긴다 (설계 §10)
  return 403
}

/**
 * **표가 라우트를 하나도 빠뜨리지 않는다.**
 *
 * 이 절이 없어서 `GET /:projectId/theme`가 표에 빠졌고, 그 라우트는 권한 가드를 **아예
 * 없애도**(과소 차단) **owner 전용으로 좁혀도**(과도 차단) **0건도 죽지 않는 채**로
 * 있었다 — 캔버스가 부르는 유일한 테마 엔드포인트인데도 그랬다.
 *
 * **P4a-3이 그 부류를 다섯 찾아 닫고도 여섯째를 놓쳤다는 것이 이 절을 만든 이유다.**
 * *"새 라우트를 만들면 이 표에 등록한다"*는 사람이 기억할 규칙이었고, 기억은 한 번
 * 빠졌다. 세는 것을 실행으로 옮기면 빠지지 않는다.
 *
 * **분모를 손으로 적지 않는다** — `src/routes/`를 훑어 `projectGuard`가 걸린 라우트를
 * 전수로 뽑는다. 새 라우트가 생기면 여기가 먼저 죽는다.
 */
describe('표의 완전성', () => {
  it('훑을 소스를 실제로 읽는다', () => {
    // 글롭이 어긋나면 **빈 집합에서 아래가 조용히 통과한다**(이 저장소가 두 번 겪은 사고다).
    expect(Object.keys(ROUTE_SOURCES).length).toBeGreaterThan(5)
    expect(declaredRoutes().length).toBeGreaterThan(20)
  })

  it('projectGuard가 걸린 라우트가 전부 표에 있다', () => {
    const registered = new Set(CASES.map((testCase) => `${testCase.method} ${testCase.url}`))
    const missing = declaredRoutes()
      .map((route) => `${route.method} ${route.url}`)
      .filter((key) => !registered.has(key))

    expect(missing).toEqual([])
  })

  /**
   * **`allowed`가 소스의 최소 역할과 같은가.** 표에 줄은 있는데 `allowed`가 틀리면
   * 그 줄은 **틀린 것을 지킨다** — 등록 여부만 세는 위 케이스가 못 잡는 자리다.
   *
   * 역할 순위 비교는 `auth/roles.ts`의 `roleAtLeast` 하나만 쓴다(README의 계층 규칙).
   */
  it('표의 allowed가 소스가 선언한 최소 역할과 일치한다', () => {
    const byKey = new Map(CASES.map((testCase) => [`${testCase.method} ${testCase.url}`, testCase]))

    for (const route of declaredRoutes()) {
      const testCase = byKey.get(`${route.method} ${route.url}`)
      if (testCase === undefined) continue // 위 케이스가 잡는다

      const expected = (['owner', 'editor', 'viewer'] as const).filter((role) => roleAtLeast(role, route.min))
      expect([...testCase.allowed].sort(), `${route.method} ${route.url}`).toEqual([...expected].sort())
    }
  })
})

describe('권한 매트릭스 (역할 × 엔드포인트)', () => {
  for (const testCase of CASES) {
    for (const actor of ACTORS) {
      const allowed = testCase.allowed.includes(actor)
      it(`${testCase.label} — ${actor} → ${allowed ? '허용' : expectedRejection(actor)}`, async () => {
        await withApi(async (ctx) => {
          const owner = await signup(ctx)
          const project = await createProject(ctx, owner.cookie)
          // 초대 케이스가 쓸 대상 사용자를 미리 만들어 둔다.
          // (브리프 원문은 '초대대상@example.com'이지만, 로컬 파트가 ASCII가 아니면
          // routes/auth.ts의 NormalizedEmail(z.email())이 자체적으로 거부한다 —
          // 그 결정은 이 태스크 이전에 이미 내려진 것이라 여기서 이메일 검증을
          // 느슨하게 하지 않고, 이 픽스처 값만 유효한 이메일로 바꿔 쓴다.)
          await signup(ctx, { email: 'invitee@example.com' })

          let cookie: { wb_session: string } | undefined
          // **주체의 `userId`도 함께 든다** — 소유권이 걸린 리소스를 그 주체의 것으로
          // 만들어야 하는 setup이 있다(`코멘트하나`). `anonymous`에는 주체가 없으므로
          // owner의 id가 그대로 남는다.
          let actorUserId = owner.user.id
          if (actor === 'owner') {
            cookie = owner.cookie
          } else if (actor === 'editor' || actor === 'viewer') {
            const member = await signup(ctx)
            await addMember(ctx, project.id, member.user.id, actor)
            cookie = member.cookie
            actorUserId = member.user.id
          } else if (actor === 'outsider') {
            const outsider = await signup(ctx)
            cookie = outsider.cookie
            actorUserId = outsider.user.id
          }

          // setup은 항상 owner 권한으로 돈다 — 어떤 actor가 실제로 호출하든
          // 대상 리소스는 미리 존재해야 한다(브리프 "Step 2" 하네스 확장).
          const substitutions = testCase.setup
            ? await testCase.setup(ctx, project.id, owner.cookie, actorUserId)
            : {}
          let url = testCase.url.replace(':projectId', project.id)
          for (const [key, value] of Object.entries(substitutions)) {
            url = url.replace(':' + key, value)
          }
          const payload =
            typeof testCase.payload === 'function'
              ? (testCase.payload as (substitutions: Record<string, string>) => unknown)(substitutions)
              : testCase.payload

          const res = await ctx.app.inject({
            method: testCase.method,
            url,
            payload: payload as never,
            cookies: cookie,
          })

          if (allowed) {
            expect(res.statusCode, `${testCase.label}/${actor}: ${res.body}`).toBeLessThan(400)
          } else {
            expect(res.statusCode, `${testCase.label}/${actor}: ${res.body}`).toBe(expectedRejection(actor))
          }
        })
      })
    }
  }
})
