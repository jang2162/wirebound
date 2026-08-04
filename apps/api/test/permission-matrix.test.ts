import { beforeEach, describe, expect, it } from 'vitest'
import type { ProjectRole } from '../src/db/types'
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
   */
  setup?: (ctx: TestContext, projectId: string, ownerCookie: { wb_session: string }) => Promise<Record<string, string>>
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
    label: '페이지 삭제',
    method: 'DELETE',
    url: '/api/projects/:projectId/pages/:pageId',
    allowed: ['owner', 'editor'],
    setup: 페이지하나,
  },
]

const ACTORS: Actor[] = ['owner', 'editor', 'viewer', 'outsider', 'anonymous']

/** 거부는 상태로 판별한다. 허용된 경우의 성공 상태는 케이스마다 다르므로 4xx가 아님만 본다. */
function expectedRejection(actor: Actor): number {
  if (actor === 'anonymous') return 401
  if (actor === 'outsider') return 404   // 프로젝트 존재를 숨긴다 (설계 §10)
  return 403
}

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
          if (actor === 'owner') {
            cookie = owner.cookie
          } else if (actor === 'editor' || actor === 'viewer') {
            const member = await signup(ctx)
            await addMember(ctx, project.id, member.user.id, actor)
            cookie = member.cookie
          } else if (actor === 'outsider') {
            cookie = (await signup(ctx)).cookie
          }

          // setup은 항상 owner 권한으로 돈다 — 어떤 actor가 실제로 호출하든
          // 대상 리소스는 미리 존재해야 한다(브리프 "Step 2" 하네스 확장).
          const substitutions = testCase.setup ? await testCase.setup(ctx, project.id, owner.cookie) : {}
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
