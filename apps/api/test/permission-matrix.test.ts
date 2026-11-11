import { describe, expect, it } from 'vitest'
import type { preHandlerHookHandler } from 'fastify'
import { projectGuard, roleAtLeast } from '../src/auth/roles'
import type { ProjectRole } from '../src/db/types'
import { insertApiToken } from '../src/repos/api-tokens'
import { insertModule } from '../src/repos/modules'
import { png, sha256 } from './asset-samples'
import { insertSnapshot } from '../src/repos/snapshots'
import { captureSnapshot } from '../src/services/snapshot-capture'
import { SNAPSHOT_PAYLOAD_VERSION } from '@wirebound/themes'
import { type GuardedRoute, guardMinOf, routeCensus } from './guarded-routes'
import { addMember, createMenuNode, createPage, createProject, signup, withApi, type TestContext } from './helpers'
import { SYSTEM_ADMIN } from '@wirebound/test-support/system-admin'

type Actor = ProjectRole | 'outsider' | 'anonymous'

interface Case {
  label: string
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT'
  /** :projectId 는 실제 id로 치환된다. */
  url: string
  /** 붙일 질의(`?` 뒤). 라우트 표와 맞대는 키는 `url` 만이다. */
  query?: string
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
   * **넷째 인자가 지금 요청을 보낼 주체의 `userId`다.** 소유권이 걸린 리소스를 그
   * 주체의 것으로 만들어야 하는 케이스가 있기 때문이다 — 코멘트 수정은 **작성자만** 할 수
   * 있어서(`routes/comments.ts` 머리말의 「남의 코멘트를 고칠 수 있는가」), owner가 만든 코멘트를
   * editor가 고치려 하면 **권한과 무관한 이유로** 403이 된다. 그러면 이 매트릭스가
   * 재려는 것(역할 판정)을 못 잰다.
   *
   * `anonymous`에게는 주체가 없으므로 owner의 id가 온다. 그 행은 어차피 인증 훅에서
   * 끝나므로(401) 누구의 것인지가 결과를 바꾸지 않는다.
   */
  setup?: (ctx: TestContext, projectId: string, ownerCookie: { wb_session: string }, actorUserId: string) => Promise<Record<string, string>>
}

/** ':nodeId'가 필요한 케이스(메뉴 수정·삭제)가 실행 전에 대상 메뉴 노드를 만든다. */
const 메뉴하나 = async (ctx: TestContext, projectId: string, ownerCookie: { wb_session: string }): Promise<Record<string, string>> => ({
  nodeId: (await createMenuNode(ctx, ownerCookie, projectId, { title: '대상 메뉴' })).id,
})

/**
 * ':userId'가 필요한 케이스(멤버 수정·삭제)가 실행 전에 대상 멤버를 만든다.
 * 멤버 초대 API가 아니라 `addMember`(DB 직접 삽입)를 쓴다 — `helpers.ts`의
 * `addMember` 문서와 같은 이유: 픽스처가 검사 대상 API에 의존하면 그 API가
 * 깨졌을 때 무관한 테스트가 전부 무너진다.
 */
const 멤버하나 = async (ctx: TestContext, projectId: string, _ownerCookie: { wb_session: string }): Promise<Record<string, string>> => {
  const target = await signup(ctx)
  await addMember(ctx, projectId, target.user.id, 'viewer')
  return { userId: target.user.id }
}

/** ':menuNodeId'가 필요한 케이스(페이지 생성)가 실행 전에 대상 메뉴 노드를 만든다. */
const 페이지용메뉴 = async (ctx: TestContext, projectId: string, ownerCookie: { wb_session: string }): Promise<Record<string, string>> => ({
  menuNodeId: (await createMenuNode(ctx, ownerCookie, projectId, { title: '페이지용 메뉴' })).id,
})

/**
 * 내보내기 케이스가 실행 전에 페이지 하나를 만든다.
 *
 * **필요한 이유:** 페이지가 없는 프로젝트에서 내보내기는 409다(빈 번들을 내면 받는
 * 사람이 푼 뒤에야 비었다는 것을 안다). 그러면 허용된 역할도 4xx를 받아 `허용`을
 * 못 보인다 — `스냅샷 복원`이 `setup`을 요구하는 것과 같은 자리다.
 */
const 내보낼페이지 = async (ctx: TestContext, projectId: string, ownerCookie: { wb_session: string }): Promise<Record<string, string>> => {
  const menu = await createMenuNode(ctx, ownerCookie, projectId, { title: '내보낼 메뉴' })
  await createPage(ctx, ownerCookie, projectId, menu.id, { title: '내보낼 페이지' })
  return {}
}

/** ':pageId'가 필요한 케이스(페이지 조회·수정·스키마 저장·삭제)가 실행 전에 대상 페이지를 만든다. */
const 페이지하나 = async (ctx: TestContext, projectId: string, ownerCookie: { wb_session: string }): Promise<Record<string, string>> => {
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
        comments: [],
      },
      createdBy: actorUserId,
    })
  ).id,
})

/**
 * ':tokenId'가 필요한 케이스(토큰 폐기)가 실행 전에 **그 주체의** 토큰을 만든다.
 *
 * **API가 아니라 repo로 넣는다** — `모듈하나`·`스냅샷하나`와 같은 이유다.
 */
const 토큰하나 = async (
  ctx: TestContext,
  projectId: string,
  _ownerCookie: { wb_session: string },
  actorUserId: string,
): Promise<Record<string, string>> => ({
  tokenId: (await insertApiToken(ctx.db, { projectId, userId: actorUserId, name: '지울 토큰' })).record.id,
})

/**
 * ':moduleId'가 필요한 케이스(모듈 이름 바꾸기 · 삭제)가 실행 전에 대상 모듈을 만든다.
 *
 * **API가 아니라 repo로 넣는다** — `스냅샷하나`와 같은 이유다: 픽스처가 검사 대상
 * API(`POST .../modules`)에 의존하면 그쪽이 깨졌을 때 이름 · 삭제 행까지 함께 무너진다.
 */
const 모듈하나 = async (
  ctx: TestContext,
  projectId: string,
  _ownerCookie: { wb_session: string },
  actorUserId: string,
): Promise<Record<string, string>> => ({
  moduleId: (
    await insertModule(ctx.db, {
      projectId,
      name: '대상 모듈',
      nodes: [{ id: 'm_a', type: 'Button', props: { label: '저장' } }],
      createdBy: actorUserId,
    })
  ).id,
})

/** 공통코드 쓰기가 대상 그룹 `S` · 항목 `A` 를 만든다 — `모듈하나` 와 같은 까닭으로 행을 넣는다. */
const 코드하나 = async (ctx: TestContext, projectId: string): Promise<Record<string, string>> => {
  const group = await ctx.db
    .insertInto('code_groups')
    .values({ project_id: projectId, key: 'S', name: '상태', sort_order: 0 })
    .returning('id')
    .executeTakeFirstOrThrow()
  await ctx.db.insertInto('code_items').values({ group_id: group.id, value: 'A', name: '가', sort_order: 0 }).execute()
  return { key: 'S', value: 'A' }
}

/**
 * ':id'가 필요한 그림 읽기가 대상 그림을 만든다 — `모듈하나` 와 같은 까닭으로 API(`POST …/assets`)가 아니라 행을 넣는다.
 */
const 그림하나 = async (ctx: TestContext, projectId: string): Promise<Record<string, string>> => {
  const bytes = png(3, 2, 77)
  const id = sha256(bytes)
  await ctx.db
    .insertInto('asset_blobs')
    .values({ sha256: id, bytes, mime: 'image/png', size: bytes.length, width: 3, height: 2 })
    .onConflict((oc) => oc.column('sha256').doNothing())
    .execute()
  await ctx.db.insertInto('project_assets').values({ project_id: projectId, sha256: id, name: '그림.png', uploaded_by: null }).execute()
  return { id }
}

/**
 * ':snapshotId'가 필요한 **복원** 케이스가 실행 전에 대상 스냅샷을 만든다.
 *
 * **`스냅샷하나`를 재사용하지 않는다 — 그것으로는 이 행이 못 선다.** 그쪽 payload는 네
 * 절이 전부 빈 최소본인데, 프로젝트를 만들면 **기본 레이아웃이 하나 생긴다**(`insertProject`).
 * 그래서 복원이 레이아웃 개수 불일치로 **409**를 내고, 허용된 역할(owner)이 4xx가 아님을
 * 보는 판정이 **권한과 무관한 이유로** 무너진다.
 *
 * 그래서 **지금 상태를 실제로 캡처해** 넣는다 — 복원이 아무것도 바꾸지 않는 판이 되어
 * 이 행이 재려는 것(역할 판정)만 남는다.
 */
const 복원할스냅샷 = async (
  ctx: TestContext,
  projectId: string,
  _ownerCookie: { wb_session: string },
  actorUserId: string,
): Promise<Record<string, string>> => {
  const outcome = await captureSnapshot(ctx.db, projectId)
  if (outcome.kind !== 'captured') throw new Error(`복원할스냅샷 픽스처 실패: ${outcome.kind}`)
  const record = await insertSnapshot(ctx.db, {
    projectId,
    tag: '복원 대상',
    description: null,
    payload: outcome.payload,
    createdBy: actorUserId,
  })
  return { snapshotId: record.id }
}

const CASES: Case[] = [
  { label: '프로젝트 조회', method: 'GET', url: '/api/projects/:projectId', allowed: ['owner', 'editor', 'viewer'] },
  { label: '프로젝트 수정', method: 'PATCH', url: '/api/projects/:projectId', payload: { name: '바뀐 이름' }, allowed: ['owner'] },
  { label: '프로젝트 삭제', method: 'DELETE', url: '/api/projects/:projectId', allowed: ['owner'] },
  { label: '테마 바인딩 조회', method: 'GET', url: '/api/projects/:projectId/theme', allowed: ['owner', 'editor', 'viewer'] },
  {
    label: '테마 바인딩 저장',
    method: 'PUT',
    url: '/api/projects/:projectId/theme',
    payload: { themeId: 'system-admin', version: SYSTEM_ADMIN.version, tokens: {}, rev: 0 },
    allowed: ['owner'],
  },
  {
    label: '테마 바꾸기 영향',
    method: 'GET',
    url: '/api/projects/:projectId/theme/impact',
    query: `themeId=system-admin&version=${SYSTEM_ADMIN.version}`,
    allowed: ['owner', 'editor', 'viewer'],
  },
  { label: '멤버 목록', method: 'GET', url: '/api/projects/:projectId/members', allowed: ['owner', 'editor', 'viewer'] },
  {
    label: '멤버 초대',
    method: 'POST',
    url: '/api/projects/:projectId/members',
    payload: { email: 'invitee@example.com', role: 'viewer' },
    allowed: ['owner'],
  },
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
    label: '메뉴 연쇄 삭제',
    method: 'DELETE',
    url: '/api/projects/:projectId/menu/:nodeId',
    payload: { cascade: true, expect: { menuIds: [], pageIds: [] } },
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
    // **설계서 「권한 모델」의 표에 가져오기가 없다.** 등급의 근거는 `routes/pages.ts`의
    // 그 핸들러 주석에 있다 — 가져오기는 **페이지를 만드는 것**이므로 바로 위
    // `페이지 생성`과 같은 등급이다. 레이아웃처럼 프로젝트 전체를 한 번에 바꾸지 않는다.
    //
    // **허용된 역할이 실제로 성공해야 한다** — `menuNodeId`가 진짜여야 하고(아니면 404),
    // 파일이 봉투·카탈로그를 지나야 한다(아니면 400/422). 그래서 `setup`이 만든 메뉴 id를
    // 실은 최소 봉투를 보낸다: 이 행이 재는 것은 역할 판정이므로 내용이 가벼운 편이 낫다.
    label: '페이지 가져오기',
    method: 'POST',
    url: '/api/projects/:projectId/pages/import',
    payload: (subs: Record<string, string>) => ({
      menuNodeId: subs.menuNodeId,
      file: {
        wireboundVersion: '1',
        page: { title: '가져온 페이지' },
        schema: { version: 5, root: { id: 'n_root', type: 'Page', children: [] } },
        comments: [],
      },
    }),
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
    payload: { schema: { version: 5, root: { id: 'n_root', type: 'Page', children: [] } } },
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
  // --- 코멘트 다섯. **이 다섯 줄이 빠지면 `표의 완전성`이 죽는다** —
  // `projectGuard가 걸린 라우트가 전부 표에 있다` 한 케이스가 `[…(5)]`를 낸다.
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
  {
    label: '코멘트 번호 색인',
    method: 'GET',
    url: '/api/projects/:projectId/comments/index',
    allowed: ['owner', 'editor', 'viewer'],
  },
  { label: '트리 조회', method: 'GET', url: '/api/projects/:projectId/tree', allowed: ['owner', 'editor', 'viewer'] },
  {
    // **스냅샷 생성은 editor다**(설계서 「권한 모델」 — *"editor: … 스냅샷 생성 (복원 불가)"*). 복원이
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
  {
    // **복원은 owner 전용이다**(설계서 「권한 모델」 — *"editor: … 스냅샷 생성 (복원 불가)"*). 같은 표의
    // *"스냅샷 생성"*이 editor까지 여는 것과 갈리는 이유: 생성은 아무것도 바꾸지 않고
    // 복원은 **프로젝트 전체를 바꾼다.**
    //
    // **`setup`이 필요하다** — 이 라우트는 허용된 역할이 실제로 핸들러까지 가서 성공해야
    // 4xx가 아니다. 없는 id로 치면 owner도 404를 받아 `허용`을 못 보인다.
    label: '스냅샷 복원',
    method: 'POST',
    url: '/api/projects/:projectId/snapshots/:snapshotId/restore',
    allowed: ['owner'],
    setup: 복원할스냅샷,
  },
  {
    // **설계서 「권한 모델」의 표에 모듈이 없다.** 등급의 근거는
    // `routes/modules.ts`의 머리말에 있다 — editor의 *"페이지 편집"*을 돕는 도구이지
    // 레이아웃처럼 프로젝트 전체 외형을 한 번에 바꾸는 것이 아니다.
    label: '모듈 목록',
    method: 'GET',
    url: '/api/projects/:projectId/modules',
    allowed: ['owner', 'editor', 'viewer'],
  },
  {
    label: '모듈 하나',
    method: 'GET',
    url: '/api/projects/:projectId/modules/:moduleId',
    allowed: ['owner', 'editor', 'viewer'],
    setup: 모듈하나,
  },
  {
    // 이 행이 재는 것은 역할 판정이므로 내용이 가벼운 편이 낫다(노드 하나).
    label: '모듈 저장',
    method: 'POST',
    url: '/api/projects/:projectId/modules',
    payload: { name: '대상', nodes: [{ id: 'm_a', type: 'Button', props: { label: '저장' } }] },
    allowed: ['owner', 'editor'],
  },
  {
    // **`setup`이 필요하다** — 없는 id로 치면 허용된 역할도 404를 받아 `허용`을 못
    // 보인다(`스냅샷 복원`과 같은 자리).
    label: '모듈 이름 바꾸기',
    method: 'PATCH',
    url: '/api/projects/:projectId/modules/:moduleId',
    payload: { name: '새 이름' },
    allowed: ['owner', 'editor'],
    setup: 모듈하나,
  },
  {
    label: '모듈 삭제',
    method: 'DELETE',
    url: '/api/projects/:projectId/modules/:moduleId',
    allowed: ['owner', 'editor'],
    setup: 모듈하나,
  },
  {
    // 공통코드 — 읽기 viewer · 쓰기 editor(`routes/codes.ts` 머리말 — 표는 화면 글의 원천이라 페이지 편집과 같은 역할).
    label: '공통코드 표',
    method: 'GET',
    url: '/api/projects/:projectId/codes',
    allowed: ['owner', 'editor', 'viewer'],
  },
  {
    label: '공통코드 사용처',
    method: 'GET',
    url: '/api/projects/:projectId/codes/usage',
    query: 'group=S',
    allowed: ['owner', 'editor', 'viewer'],
  },
  {
    label: '공통코드 사용 수',
    method: 'GET',
    url: '/api/projects/:projectId/codes/usage-counts',
    allowed: ['owner', 'editor', 'viewer'],
  },
  {
    label: '공통코드 그룹 만들기',
    method: 'POST',
    url: '/api/projects/:projectId/codes',
    payload: { key: 'NEW', name: '새 그룹' },
    allowed: ['owner', 'editor'],
  },
  {
    label: '공통코드 그룹 고치기',
    method: 'PATCH',
    url: '/api/projects/:projectId/codes/:key',
    payload: { name: '바꿈' },
    allowed: ['owner', 'editor'],
    setup: 코드하나,
  },
  {
    label: '공통코드 그룹 지우기',
    method: 'DELETE',
    url: '/api/projects/:projectId/codes/:key',
    allowed: ['owner', 'editor'],
    setup: 코드하나,
  },
  {
    label: '공통코드 항목 만들기',
    method: 'POST',
    url: '/api/projects/:projectId/codes/:key/items',
    payload: { value: 'NEW', name: '새 항목' },
    allowed: ['owner', 'editor'],
    setup: 코드하나,
  },
  {
    label: '공통코드 항목 고치기',
    method: 'PATCH',
    url: '/api/projects/:projectId/codes/:key/items/:value',
    payload: { active: false },
    allowed: ['owner', 'editor'],
    setup: 코드하나,
  },
  {
    label: '공통코드 항목 지우기',
    method: 'DELETE',
    url: '/api/projects/:projectId/codes/:key/items/:value',
    allowed: ['owner', 'editor'],
    setup: 코드하나,
  },
  {
    // 그림 — 정본 「그림」 · `routes/assets.ts` 머리말. 올리기 · 가져오기는 editor(페이지 편집을 돕는 바이트), 읽기 · 목록은 viewer.
    label: '그림 올리기',
    method: 'POST',
    url: '/api/projects/:projectId/assets',
    payload: png(2, 2, 78),
    allowed: ['owner', 'editor'],
  },
  {
    label: '그림 목록',
    method: 'GET',
    url: '/api/projects/:projectId/assets',
    allowed: ['owner', 'editor', 'viewer'],
  },
  {
    label: '그림 읽기',
    method: 'GET',
    url: '/api/projects/:projectId/assets/:id',
    allowed: ['owner', 'editor', 'viewer'],
    setup: 그림하나,
  },
  {
    // 가져오기는 세션만이다(토큰 403) — 이 표의 행위자는 세션이다.
    label: '그림 가져오기',
    method: 'POST',
    url: '/api/projects/:projectId/assets/claim',
    payload: { ids: ['0'.repeat(64)], from: { personal: true } },
    allowed: ['owner', 'editor'],
  },
  {
    // **내보내기는 viewer다.** 번들은 viewer가 화면에서 볼 수 있는 것을 파일로
    // 받는 것이므로 새 권한을 만들지 않는다 — 무엇을 담는지 세어 확인한 표는
    // `routes/export.ts`의 머리말에 있다.
    label: '내보내기 미리보기',
    method: 'GET',
    url: '/api/projects/:projectId/export/preview',
    allowed: ['owner', 'editor', 'viewer'],
    setup: 내보낼페이지,
  },
  {
    label: '내보내기(zip)',
    method: 'GET',
    url: '/api/projects/:projectId/export',
    allowed: ['owner', 'editor', 'viewer'],
    setup: 내보낼페이지,
  },
  {
    // **읽기 전용 프로젝트 덤프는 viewer다.** 내보내기와 같은 자리이고 같은
    // 이유다 — viewer가 화면에서 볼 수 있는 것을 값 하나로 받는 것이므로 새 권한을
    // 만들지 않는다. 복수(`POST .../snapshots`, editor)와 갈리는 것은 그쪽이 **쓰기**이기
    // 때문이다.
    label: '프로젝트 덤프(단수 snapshot)',
    method: 'GET',
    url: '/api/projects/:projectId/snapshot',
    allowed: ['owner', 'editor', 'viewer'],
  },
  {
    // **토큰 발급은 viewer다** — 설계서 「권한 모델」의 viewer 행이 *"API 토큰 발급은
    // 된다(토큰은 발급자의 권한을 넘지 않는다)"*이다. 근거는 `routes/tokens.ts`의 머리말에
    // 있다.
    label: 'API 토큰 발급',
    method: 'POST',
    url: '/api/projects/:projectId/tokens',
    payload: { name: '매트릭스 토큰' },
    allowed: ['owner', 'editor', 'viewer'],
  },
  {
    label: 'API 토큰 목록',
    method: 'GET',
    url: '/api/projects/:projectId/tokens',
    allowed: ['owner', 'editor', 'viewer'],
  },
  {
    // **`setup`이 주체의 것으로 만들어야 한다** — 폐기는 자기 토큰만 되고(그 파일의
    // *"목록·폐기는 자기 것만 본다"*), owner가 만든 토큰을 editor가 지우려 하면 **권한과
    // 무관한 이유로** 404가 되어 이 매트릭스가 재려는 것을 못 잰다. `코멘트하나`와 같은
    // 함정이라 `setup`의 넷째 인자(주체의 `userId`)를 쓴다.
    label: 'API 토큰 폐기',
    method: 'DELETE',
    url: '/api/projects/:projectId/tokens/:tokenId',
    allowed: ['owner', 'editor', 'viewer'],
    setup: 토큰하나,
  },
]

/**
 * **표에 줄로 둘 수 없는 가드 라우트** — 이름 있는 예외다. 값은 그 라우트의 최소 역할이고 아래 케이스가 등록된
 * 값과 견준다(예외로 빼도 역할은 잠긴다).
 *
 * WS 입장은 업그레이드라 HTTP 상태로 허용을 가를 수 없다 — 업그레이드가 아닌 GET 은 가드를 지난 멤버에게도 404 다
 * (`@fastify/websocket` 이 답한다 · owner · viewer 404, 익명 401). 입장 판정은 `ws-auth.test.ts` 가 소켓으로 잰다.
 */
const NOT_IN_TABLE: Record<string, ProjectRole> = {
  'GET /api/projects/:projectId/ws': 'viewer',
}

const ACTORS: Actor[] = ['owner', 'editor', 'viewer', 'outsider', 'anonymous']

/** 거부는 상태로 판별한다. 허용된 경우의 성공 상태는 케이스마다 다르므로 4xx가 아님만 본다. */
function expectedRejection(actor: Actor): number {
  if (actor === 'anonymous') return 401
  if (actor === 'outsider') return 404 // 프로젝트 존재를 숨긴다 (설계서 「권한 모델」)
  return 403
}

/**
 * **표가 라우트를 하나도 빠뜨리지 않는다.**
 *
 * 표에서 빠진 라우트는 권한 가드를 **아예 없애도**(과소 차단) **owner 전용으로 좁혀도**
 * (과도 차단) **0건도 죽지 않는다**.
 *
 * *"새 라우트를 만들면 이 표에 등록한다"*를 사람의 기억에 맡기면 하나가 빠져도 아무도
 * 모른다. 세는 것을 실행으로 옮기면 빠지지 않는다.
 *
 * **분모를 손으로 적지 않는다** — Fastify 가 등록한 라우트에서 가드가 걸린 것을 전수로 뽑는다(`guarded-routes.ts` —
 * 라우트도 최소 역할도 값이다). 새 라우트가 생기면 여기가 먼저 죽는다.
 */
describe('표의 완전성', () => {
  const key = (route: GuardedRoute): string => `${route.method} ${route.url}`

  it('분모를 실제로 만든다 — 이음매가 가드 라우트와 최소 역할을 준다', async () => {
    // 이음매가 어긋나면 **빈 집합에서 아래가 조용히 통과한다**.
    const { guarded } = await routeCensus()
    expect(guarded.length).toBeGreaterThan(20)
    expect(new Set(guarded.map((route) => route.min))).toEqual(new Set(['owner', 'editor', 'viewer']))
  })

  it('`:projectId` 라우트는 전부 가드를 지난다 — 가드를 못 알아보면 분모에서 빠지는 대신 여기서 죽는다', async () => {
    expect((await routeCensus()).unguardedProjectRoutes).toEqual([])
  })

  it('감싼 가드는 가드로 읽지 않는다 — 탐침이 지나는 한 갈래의 역할은 최소 역할이 아니다', async () => {
    // 토큰이면 viewer 로 푸는 가드다. 탐침은 세션 갈래(`editor`)만 지나므로 읽으면 표와 맞아 지나간다(`guarded-routes.ts` 머리말).
    const wrapped: preHandlerHookHandler = async function (request, reply) {
      return projectGuard(request.tokenProjectId ? 'viewer' : 'editor').call(this, request, reply, () => {})
    }
    expect(await guardMinOf([wrapped])).toBeUndefined()
    expect(await guardMinOf([projectGuard('owner')])).toBe('owner')
  })

  it('projectGuard가 걸린 라우트가 전부 표에 있다', async () => {
    const registered = new Set([...CASES.map((testCase) => `${testCase.method} ${testCase.url}`), ...Object.keys(NOT_IN_TABLE)])
    const missing = (await routeCensus()).guarded.map(key).filter((route) => !registered.has(route))

    expect(missing).toEqual([])
  })

  it('표와 예외에 등록되지 않은 라우트를 적어 두지 않았다 — 반대편', async () => {
    const declared = new Set((await routeCensus()).guarded.map(key))
    const extra = [...CASES.map((testCase) => `${testCase.method} ${testCase.url}`), ...Object.keys(NOT_IN_TABLE)].filter(
      (route) => !declared.has(route),
    )

    expect(extra).toEqual([])
  })

  /**
   * **`allowed`가 등록된 가드의 최소 역할과 같은가.** 표에 줄은 있는데 `allowed`가 틀리면
   * 그 줄은 **틀린 것을 지킨다** — 등록 여부만 세는 위 케이스가 못 잡는 자리다.
   *
   * 역할 순위 비교는 `auth/roles.ts`의 `roleAtLeast` 하나만 쓴다(README의 계층 규칙).
   */
  it('표의 allowed가 가드의 최소 역할과 일치한다', async () => {
    const byKey = new Map(CASES.map((testCase) => [`${testCase.method} ${testCase.url}`, testCase]))

    for (const route of (await routeCensus()).guarded) {
      const exempt = NOT_IN_TABLE[key(route)]
      if (exempt !== undefined) {
        expect(route.min, key(route)).toBe(exempt)
        continue
      }
      const testCase = byKey.get(key(route))
      if (testCase === undefined) continue // 위 케이스가 잡는다

      const expected = (['owner', 'editor', 'viewer'] as const).filter((role) => roleAtLeast(role, route.min))
      expect([...testCase.allowed].sort(), key(route)).toEqual([...expected].sort())
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
          // (로컬 파트가 ASCII가 아니면 routes/auth.ts의 NormalizedEmail(z.email())이
          // 자체적으로 거부한다 — 이메일 검증을 느슨하게 하지 않고, 이 픽스처 값을
          // ASCII 로컬 파트의 유효한 이메일로 둔다.)
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
          // 대상 리소스는 미리 존재해야 한다.
          const substitutions = testCase.setup ? await testCase.setup(ctx, project.id, owner.cookie, actorUserId) : {}
          let url = testCase.url.replace(':projectId', project.id)
          for (const [key, value] of Object.entries(substitutions)) {
            url = url.replace(':' + key, value)
          }
          if (testCase.query !== undefined) url += `?${testCase.query}`
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
