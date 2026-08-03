import { beforeEach, describe, expect, it } from 'vitest'
import type { ProjectRole } from '../src/db/types'
import { addMember, createProject, signup, withApi, type TestContext } from './helpers'

type Actor = ProjectRole | 'outsider' | 'anonymous'

interface Case {
  label: string
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT'
  /** :projectId 는 실제 id로 치환된다. */
  url: string
  payload?: unknown
  /** 이 역할 이상이면 통과한다. */
  allowed: Actor[]
}

// 태스크 12·13이 여기에 행을 추가한다.
const CASES: Case[] = [
  { label: '프로젝트 조회', method: 'GET', url: '/api/projects/:projectId', allowed: ['owner', 'editor', 'viewer'] },
  { label: '프로젝트 수정', method: 'PATCH', url: '/api/projects/:projectId', payload: { name: '바뀐 이름' }, allowed: ['owner'] },
  { label: '프로젝트 삭제', method: 'DELETE', url: '/api/projects/:projectId', allowed: ['owner'] },
  { label: '멤버 목록', method: 'GET', url: '/api/projects/:projectId/members', allowed: ['owner', 'editor', 'viewer'] },
  { label: '멤버 초대', method: 'POST', url: '/api/projects/:projectId/members', payload: { email: 'invitee@example.com', role: 'viewer' }, allowed: ['owner'] },
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

          const res = await ctx.app.inject({
            method: testCase.method,
            url: testCase.url.replace(':projectId', project.id),
            payload: testCase.payload as never,
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
