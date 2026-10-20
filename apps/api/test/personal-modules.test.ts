/**
 * `routes/personal-modules.ts` — 개인 모듈 다섯 엔드포인트와 설계 spec `2026-10-20-personal-modules-design.md` 「실패로 치는 것」 넷.
 *
 * | 케이스 | 무엇이 거짓이면 죽나 |
 * |---|---|
 * | «저장 · 목록 · 하나 · 이름 · 삭제» | 소유자 · 차례 · 거름(`moduleNodesForSave`) · 한도 · `nested-page` · NUL 이 프로젝트 모듈과 다르다 |
 * | «남의 개인 모듈은 모르는 id 와 같은 답» | repo 가 `owner_id` 를 안 본다 · 토큰이 사람을 채운다 · 답이 «있다» 를 흘린다 |
 * | «프로젝트를 지우거나 멤버에서 빠져도 남는다» | 개인 모듈이 프로젝트에 매였다 |
 * | «복사 — 원본 그대로» | 복사(다시 읽고 → 새로 저장)가 원본 행을 바꾸거나 지운다 · 사본이 원본에 이어진다 |
 * | «viewer 의 프로젝트 모듈로 복사는 403» | 프로젝트 모듈 저장 가드가 viewer 를 들인다 |
 * | «프로젝트 삭제를 쥔 동안» | 개인 모듈 쓰기가 프로젝트 행 · CASCADE 에 선다(`guard-in-lock` 의 `NOT_LOCKED` 판정) |
 * | «저장 규칙의 자리가 하나다» | 개인 모듈을 넣는 자리가 `moduleNodesForSave` 를 안 지난다 |
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { stripComments } from '@wirebound/test-support'
import type { WbNode } from '@wirebound/schema'
import { deleteProject } from '../src/repos/projects'
import {
  addMember,
  createProject,
  getTestDb,
  resetRealData,
  signup,
  withApi,
  withRealApi,
  type SignedUpUser,
  type TestContext,
} from './helpers'

const NUL = String.fromCharCode(0)
const BUTTON: WbNode = { id: 'm_btn', type: 'Button', props: { label: '저장' } }
const MISSING = '00000000-0000-4000-8000-000000000000'

interface ModuleBody {
  id: string
  name: string
  nodes: WbNode[]
  nodeCount: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

type Who = { cookies: SignedUpUser['cookie'] } | { headers: { authorization: string } }

function as(user: SignedUpUser): Who {
  return { cookies: user.cookie }
}

function send(ctx: TestContext, who: Who, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: unknown) {
  return ctx.app.inject({ method, url, ...who, ...(payload === undefined ? {} : { payload: payload as Record<string, unknown> }) })
}

async function saved(ctx: TestContext, user: SignedUpUser, name: string, nodes: WbNode[] = [BUTTON]): Promise<ModuleBody> {
  const res = await send(ctx, as(user), 'POST', '/api/me/modules', { name, nodes })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { module: ModuleBody }).module
}

async function mine(ctx: TestContext, user: SignedUpUser): Promise<ModuleBody[]> {
  const res = await send(ctx, as(user), 'GET', '/api/me/modules')
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { modules: ModuleBody[] }).modules
}

async function projectModules(ctx: TestContext, user: SignedUpUser, projectId: string): Promise<ModuleBody[]> {
  const res = await send(ctx, as(user), 'GET', `/api/projects/${projectId}/modules`)
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { modules: ModuleBody[] }).modules
}

async function issueToken(ctx: TestContext, who: SignedUpUser, projectId: string) {
  const res = await send(ctx, as(who), 'POST', `/api/projects/${projectId}/tokens`, { name: '토큰' })
  if (res.statusCode !== 201) throw new Error(`토큰 발급 픽스처가 실패했습니다 (status ${res.statusCode}): ${res.body}`)
  return { headers: { authorization: `Bearer ${(res.json() as { value: string }).value}` } }
}

/** 개인 모듈 행 — 바이트로 견줄 원본. */
async function row(ctx: TestContext, id: string) {
  return ctx.db.selectFrom('personal_modules').selectAll().where('id', '=', id).executeTakeFirst()
}

describe('저장 · 목록 · 하나 · 이름 · 삭제 — 내 것', () => {
  it('201 · 소유자 · 최근 것 먼저 · nodeCount · 하나 · 이름 · 삭제', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      expect(await mine(ctx, alice)).toEqual([])
      const first = await saved(ctx, alice, '먼저')
      await saved(ctx, alice, '나중', [{ id: 'm_card', type: 'Card', children: [{ id: 'm_in', type: 'Text' }] }, BUTTON])
      expect(first).toMatchObject({ name: '먼저', nodes: [BUTTON], nodeCount: 1, createdBy: alice.user.id })
      expect((await mine(ctx, alice)).map((entry) => [entry.name, entry.nodeCount])).toEqual([
        ['나중', 3],
        ['먼저', 1],
      ])

      const one = await send(ctx, as(alice), 'GET', `/api/me/modules/${first.id}`)
      expect([one.statusCode, (one.json() as { module: ModuleBody }).module]).toEqual([200, first])

      const renamed = await send(ctx, as(alice), 'PATCH', `/api/me/modules/${first.id}`, { name: '새 이름' })
      expect([renamed.statusCode, (renamed.json() as { module: ModuleBody }).module.name]).toEqual([200, '새 이름'])

      const removed = await send(ctx, as(alice), 'DELETE', `/api/me/modules/${first.id}`)
      expect(removed.statusCode).toBe(204)
      expect((await mine(ctx, alice)).map((entry) => entry.name)).toEqual(['나중'])
    })
  })

  it('저장이 marker · 상태 보임 · 묶음 밖 노드를 겨냥하는 액션을 걷는다 — 페이지 대상 액션은 남긴다', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const module = await saved(ctx, alice, '걷기', [
        {
          id: 'm_open',
          type: 'Button',
          marker: 3,
          visibility: { mode: 'only', states: ['s1'] },
          interactions: [
            {
              on: 'click',
              actions: [
                { type: 'setVisible', target: 'n_outside', value: false },
                { type: 'navigate', target: 'p_somewhere' },
              ],
            },
          ],
        } as unknown as WbNode,
      ])
      expect(module.nodes).toEqual([
        { id: 'm_open', type: 'Button', interactions: [{ on: 'click', actions: [{ type: 'navigate', target: 'p_somewhere' }] }] },
      ])
    })
  })

  it('프로젝트 모듈과 같은 거절 — 이름 · 노드 0개 · 선언 밖 키 400 · Page 422 nested-page · NUL 400', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const post = async (payload: unknown) => (await send(ctx, as(alice), 'POST', '/api/me/modules', payload)).statusCode
      const page = await send(ctx, as(alice), 'POST', '/api/me/modules', { name: '쪽', nodes: [{ id: 'm_page', type: 'Page' }] })
      expect({
        empty: await post({ name: '', nodes: [BUTTON] }),
        long: await post({ name: 'ㄱ'.repeat(61), nodes: [BUTTON] }),
        max: await post({ name: 'ㄱ'.repeat(60), nodes: [BUTTON] }),
        none: await post({ name: '빈', nodes: [] }),
        extra: await post({ name: '설명', nodes: [BUTTON], description: '옛 칸' }),
        nul: await post({ name: `이${NUL}름`, nodes: [BUTTON] }),
        page: [
          page.statusCode,
          ((page.json() as { error?: { issues?: { code: string; path: string }[] } }).error?.issues ?? []).map((issue) => [
            issue.code,
            issue.path,
          ]),
        ],
      }).toEqual({ empty: 400, long: 400, max: 201, none: 400, extra: 400, nul: 400, page: [422, [['nested-page', '/nodes/0']]] })
      const first = (await mine(ctx, alice))[0]!
      expect((await send(ctx, as(alice), 'PATCH', `/api/me/modules/${first.id}`, { name: '' })).statusCode).toBe(400)
    })
  })
})

describe('남의 개인 모듈은 모르는 id 와 같은 답', () => {
  it('다른 사용자 · 같은 프로젝트의 다른 멤버 · 프로젝트 API 토큰 — 읽기 · 이름 · 삭제가 모르는 id 와 같은 상태 · 같은 본문이고 원본은 그대로', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const bob = await signup(ctx)
      const stranger = await signup(ctx)
      const project = await createProject(ctx, alice.cookie)
      await addMember(ctx, project.id, bob.user.id, 'editor')
      const aliceToken = await issueToken(ctx, alice, project.id)
      const hers = await saved(ctx, alice, '앨리스의 것')
      const before = await row(ctx, hers.id)

      const answer = async (who: Who, id: string) => {
        const out: Record<string, [number, string]> = {}
        for (const [key, method, payload] of [
          ['read', 'GET', undefined],
          ['rename', 'PATCH', { name: '뺏기' }],
          ['remove', 'DELETE', undefined],
        ] as const) {
          const res = await send(ctx, who, method, `/api/me/modules/${id}`, payload)
          out[key] = [res.statusCode, res.body]
        }
        return out
      }

      for (const [label, who] of [
        ['다른 사용자', as(stranger)],
        ['같은 프로젝트의 다른 멤버', as(bob)],
        ['그 프로젝트의 앨리스 토큰', aliceToken],
      ] as const) {
        const theirs = await answer(who, hers.id)
        expect(theirs, label).toEqual(await answer(who, MISSING))
        expect(
          Object.values(theirs).map(([status]) => status),
          label,
        ).not.toContain(200)
      }
      // 토큰은 목록 · 저장도 못 한다.
      expect((await send(ctx, aliceToken, 'GET', '/api/me/modules')).statusCode).toBe(401)
      expect((await send(ctx, aliceToken, 'POST', '/api/me/modules', { name: '토큰', nodes: [BUTTON] })).statusCode).toBe(401)
      // 다른 사람의 목록에 안 선다.
      expect(await mine(ctx, bob)).toEqual([])
      expect(await row(ctx, hers.id)).toEqual(before)
      expect((await mine(ctx, alice)).map((entry) => entry.id)).toEqual([hers.id])
    })
  })
})

describe('프로젝트를 지우거나 멤버에서 빠져도 남는다', () => {
  it('그 프로젝트에서 저장한 개인 모듈이 멤버 제거 · 프로젝트 삭제 뒤에도 그대로', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const bob = await signup(ctx)
      const project = await createProject(ctx, alice.cookie)
      await addMember(ctx, project.id, bob.user.id, 'viewer')
      const bobs = await saved(ctx, bob, '밥의 것')
      const alices = await saved(ctx, alice, '앨리스의 것')
      const before = [await row(ctx, bobs.id), await row(ctx, alices.id)]

      const removed = await send(ctx, as(alice), 'DELETE', `/api/projects/${project.id}/members/${bob.user.id}`)
      expect(removed.statusCode, removed.body).toBe(204)
      const dropped = await send(ctx, as(alice), 'DELETE', `/api/projects/${project.id}`)
      expect(dropped.statusCode, dropped.body).toBe(204)

      expect([await row(ctx, bobs.id), await row(ctx, alices.id)]).toEqual(before)
      expect((await mine(ctx, bob)).map((entry) => entry.id)).toEqual([bobs.id])
      expect((await mine(ctx, alice)).map((entry) => entry.id)).toEqual([alices.id])
    })
  })
})

/**
 * **실커밋 하네스다** — 쥔 트랜잭션과 요청이 서로 다른 연결이어야 «서는가» 를 잰다(`withApi` 는 한 트랜잭션이라 잴 수 없다).
 */
describe('프로젝트 삭제를 쥔 동안', () => {
  beforeEach(resetRealData)
  afterEach(resetRealData)

  it('프로젝트 삭제를 커밋 전에 쥔 동안에도 개인 모듈 저장 · 이름 · 삭제가 서지 않는다', async () => {
    await withRealApi(async (ctx) => {
      const alice = await signup(ctx)
      const project = await createProject(ctx, alice.cookie)
      const kept = await saved(ctx, alice, '이름 바꿀 것')
      const gone = await saved(ctx, alice, '지울 것')
      let canary: Promise<number> | undefined
      const settled = await getTestDb()
        .transaction()
        .execute(async (trx) => {
          await deleteProject(trx, project.id)
          // 카나리아 — 같은 창에서 프로젝트 모듈 저장은 프로젝트 행에 **선다**(쥔 것이 진짜 잠금이다).
          canary = send(ctx, as(alice), 'POST', `/api/projects/${project.id}/modules`, { name: '선다', nodes: [BUTTON] }).then(
            (res) => res.statusCode,
          )
          const writes = Promise.all([
            send(ctx, as(alice), 'POST', '/api/me/modules', { name: '새것', nodes: [BUTTON] }),
            send(ctx, as(alice), 'PATCH', `/api/me/modules/${kept.id}`, { name: '바뀐 이름' }),
            send(ctx, as(alice), 'DELETE', `/api/me/modules/${gone.id}`),
          ]).then((all) => all.map((res) => res.statusCode))
          // 판이 섰는지 — 쥔 트랜잭션 밖에서 프로젝트가 아직 보인다(삭제가 커밋 전이다).
          const visible = await ctx.db.selectFrom('projects').select('id').where('id', '=', project.id).execute()
          const timeout = new Promise<'stood'>((resolve) => setTimeout(() => resolve('stood'), 2_000))
          const personal = await Promise.race([writes, timeout])
          const held = await Promise.race([canary!, new Promise<'stood'>((resolve) => setTimeout(() => resolve('stood'), 300))])
          return { visible: visible.length, writes: personal, canary: held }
        })
      expect({ ...settled, canaryAfter: await canary }).toEqual({ visible: 1, writes: [201, 200, 204], canary: 'stood', canaryAfter: 404 })
    })
  })
})

describe('복사 — 원본 그대로', () => {
  it('개인 → 프로젝트 · 프로젝트 → 개인: 새 id · 새 만든 사람 · 원본 행 그대로 · 원본을 지워도 사본이 남는다', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const bob = await signup(ctx)
      const project = await createProject(ctx, alice.cookie)
      await addMember(ctx, project.id, bob.user.id, 'editor')

      // 개인 → 프로젝트: 화면이 하듯 원본을 다시 읽고 그 노드로 프로젝트 모듈을 저장한다.
      const personal = await saved(ctx, bob, '밥의 단추')
      const personalBefore = await row(ctx, personal.id)
      const read = (await send(ctx, as(bob), 'GET', `/api/me/modules/${personal.id}`)).json() as { module: ModuleBody }
      const toProject = await send(ctx, as(bob), 'POST', `/api/projects/${project.id}/modules`, {
        name: read.module.name,
        nodes: read.module.nodes,
      })
      expect(toProject.statusCode, toProject.body).toBe(201)
      const projectCopy = (toProject.json() as { module: ModuleBody }).module
      expect(projectCopy.id).not.toBe(personal.id)
      expect([projectCopy.name, projectCopy.nodes, projectCopy.createdBy]).toEqual([personal.name, personal.nodes, bob.user.id])

      // 프로젝트 → 개인: 앨리스가 밥이 만든 프로젝트 모듈을 제 것으로.
      const projectBefore = await ctx.db.selectFrom('modules').selectAll().where('id', '=', projectCopy.id).executeTakeFirst()
      const toPersonal = await saved(ctx, alice, projectCopy.name, projectCopy.nodes)
      expect(toPersonal.id).not.toBe(projectCopy.id)
      expect(toPersonal.createdBy).toBe(alice.user.id)

      expect(await row(ctx, personal.id)).toEqual(personalBefore)
      expect(await ctx.db.selectFrom('modules').selectAll().where('id', '=', projectCopy.id).executeTakeFirst()).toEqual(projectBefore)

      // 원본을 지워도 사본이 남는다.
      expect((await send(ctx, as(bob), 'DELETE', `/api/me/modules/${personal.id}`)).statusCode).toBe(204)
      expect((await send(ctx, as(bob), 'DELETE', `/api/projects/${project.id}/modules/${projectCopy.id}`)).statusCode).toBe(204)
      expect((await mine(ctx, alice)).map((entry) => entry.id)).toEqual([toPersonal.id])
      expect(await projectModules(ctx, alice, project.id)).toEqual([])
    })
  })

  it('viewer 의 «프로젝트 모듈로 복사» 는 403 · 프로젝트 모듈 수 그대로 — 개인 저장 · 개인 모듈로 복사는 한다', async () => {
    await withApi(async (ctx) => {
      const alice = await signup(ctx)
      const vera = await signup(ctx)
      const project = await createProject(ctx, alice.cookie)
      await addMember(ctx, project.id, vera.user.id, 'viewer')
      const shared = (
        (await send(ctx, as(alice), 'POST', `/api/projects/${project.id}/modules`, { name: '함께', nodes: [BUTTON] })).json() as {
          module: ModuleBody
        }
      ).module

      const personal = await saved(ctx, vera, '베라의 것')
      const refused = await send(ctx, as(vera), 'POST', `/api/projects/${project.id}/modules`, {
        name: personal.name,
        nodes: personal.nodes,
      })
      expect(refused.statusCode, refused.body).toBe(403)
      expect((await projectModules(ctx, alice, project.id)).map((entry) => entry.id)).toEqual([shared.id])

      const listed = await projectModules(ctx, vera, project.id)
      const copied = await saved(ctx, vera, listed[0]!.name, listed[0]!.nodes)
      expect((await mine(ctx, vera)).map((entry) => entry.id)).toEqual([copied.id, personal.id])
    })
  })
})

/**
 * **개인 모듈을 넣는 자리도 저장 규칙(`moduleNodesForSave`)을 지나는 것을 지킨다** — `modules.test.ts` «저장 규칙의 자리가 하나다» 의 짝이다.
 * 세는 꼴은 repo 함수(`insertPersonalModule(`)와 테이블 직접(`insertInto('personal_modules')`) 둘. 원시 SQL 은 분모 밖이다(그 파일과 같다).
 */
const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url))
const WRITE_FORMS: RegExp[] = [/\binsertPersonalModule\s*\(/, /\binsertInto\s*\(\s*['"`]personal_modules['"`]\s*\)/]

describe('저장 규칙의 자리가 하나다', () => {
  it('두 꼴을 실제로 알아본다', () => {
    const samples = ['await insertPersonalModule(db, input)', "db.insertInto('personal_modules').values(row)"]
    expect(samples.map((sample) => WRITE_FORMS.some((pattern) => pattern.test(sample)))).toEqual([true, true])
  })

  it('개인 모듈 행을 넣는 자리는 repo 와 라우트뿐이고 라우트가 moduleNodesForSave 를 지난다', () => {
    const files = readdirSync(SRC_DIR, { recursive: true })
      .map((entry) => String(entry))
      .filter((name) => name.endsWith('.ts'))
    expect(files.length).toBeGreaterThan(20)
    const writers = files.filter((name) => {
      const source = stripComments(readFileSync(join(SRC_DIR, name), 'utf8'))
      return WRITE_FORMS.some((pattern) => pattern.test(source))
    })
    expect(writers.sort()).toEqual(['repos/personal-modules.ts', 'routes/personal-modules.ts'])
    const route = stripComments(readFileSync(join(SRC_DIR, 'routes/personal-modules.ts'), 'utf8'))
    expect(/moduleNodesForSave\s*\(/.test(route)).toBe(true)
  })
})
