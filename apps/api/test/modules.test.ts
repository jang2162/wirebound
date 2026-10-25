/**
 * `routes/modules.ts` — 네 엔드포인트와 오류 표.
 *
 * 권한 세 등급은 `permission-matrix.test.ts`가 전수로 친다(그 파일의 완전성 검사가 `src/routes/`를 훑어 새 라우트를 강제로 표에 올린다).
 * 가드와 커밋 사이 · 프로젝트 삭제와의 잠금은 `guard-in-lock.test.ts`(«모듈 삭제 · 이름 바꾸기 — 가드와 커밋 사이» · «E15»)가 잰다.
 * 여기서 재는 것은 **내용**이다: 목록의 차례 · 저장이 `marker` · 상태 보임 · 묶음 밖 액션을 걷고 id 를 그대로 담는가 · 무엇이 **어디서** 막히는가.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { stripComments } from '@wirebound/test-support'
import type { WbNode } from '@wirebound/schema'
import { listModules } from '../src/repos/modules'
import { createProject, signup, withApi, type TestContext } from './helpers'

const NUL = String.fromCharCode(0)
const BUTTON: WbNode = { id: 'm_btn', type: 'Button', props: { label: '저장' } }

async function fixture(ctx: TestContext) {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  return { owner, project }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

interface ModuleBody {
  id: string
  name: string
  nodes: WbNode[]
  nodeCount: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

function base(fx: Fixture): string {
  return `/api/projects/${fx.project.id}/modules`
}

async function post(ctx: TestContext, fx: Fixture, payload: Record<string, unknown>) {
  return ctx.app.inject({ method: 'POST', url: base(fx), cookies: fx.owner.cookie, payload })
}

async function list(ctx: TestContext, fx: Fixture): Promise<ModuleBody[]> {
  const res = await ctx.app.inject({ method: 'GET', url: base(fx), cookies: fx.owner.cookie })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { modules: ModuleBody[] }).modules
}

async function made(ctx: TestContext, fx: Fixture, name: string, nodes: WbNode[] = [BUTTON]): Promise<ModuleBody> {
  const res = await post(ctx, fx, { name, nodes })
  expect(res.statusCode, res.body).toBe(201)
  return (res.json() as { module: ModuleBody }).module
}

describe('GET /:projectId/modules', () => {
  it('없으면 빈 목록 — 개인 모듈은 이 목록에 없다', async () => {
    await withApi(async (ctx) => {
      expect(await list(ctx, await fixture(ctx))).toEqual([])
    })
  })

  it('최근 것이 먼저다 · 노드를 함께 낸다 · nodeCount 는 자손까지 센다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      await made(ctx, fx, '먼저')
      await made(ctx, fx, '나중', [
        { id: 'm_card', type: 'Card', children: [{ id: 'm_in', type: 'Text', props: { content: '안' } }] },
        BUTTON,
      ])

      const body = await list(ctx, fx)

      expect(body.map((entry) => [entry.name, entry.nodeCount])).toEqual([
        ['나중', 3],
        ['먼저', 1],
      ])
      expect(body[1]!.nodes).toEqual([BUTTON])
      expect(body[0]!.createdBy).toBe(fx.owner.user.id)
    })
  })

  it('남의 프로젝트 모듈은 보이지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const other = await fixture(ctx)
      await made(ctx, other, '남의 것')

      expect(await list(ctx, fx)).toEqual([])
    })
  })
})

describe('GET /:projectId/modules/:moduleId', () => {
  it('하나를 낸다 · 지운 것 · 남의 프로젝트의 것은 404', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const other = await fixture(ctx)
      const mine = await made(ctx, fx, '내 것')
      const gone = await made(ctx, fx, '지울 것')
      await ctx.app.inject({ method: 'DELETE', url: `${base(fx)}/${gone.id}`, cookies: fx.owner.cookie })
      const others = await made(ctx, other, '남의 것')

      const read = async (id: string) => ctx.app.inject({ method: 'GET', url: `${base(fx)}/${id}`, cookies: fx.owner.cookie })
      const found = await read(mine.id)
      expect(found.statusCode).toBe(200)
      expect((found.json() as { module: ModuleBody }).module).toEqual(mine)
      expect([(await read(gone.id)).statusCode, (await read(others.id)).statusCode]).toEqual([404, 404])
    })
  })
})

describe('POST /:projectId/modules', () => {
  it('201 { module } — 이름 · 노드 · 만든 사람', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await post(ctx, fx, { name: '저장 단추', nodes: [BUTTON] })

      expect(res.statusCode, res.body).toBe(201)
      const body = (res.json() as { module: ModuleBody }).module
      expect({ name: body.name, nodes: body.nodes, nodeCount: body.nodeCount, createdBy: body.createdBy }).toEqual({
        name: '저장 단추',
        nodes: [BUTTON],
        nodeCount: 1,
        createdBy: fx.owner.user.id,
      })
    })
  })

  it('marker 를 걷는다 — 트리 어디에 있든 · 저장된 것에도 없다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const body = await made(ctx, fx, '번호 달린 묶음', [
        { id: 'a', type: 'Card', marker: 1, children: [{ id: 'b', type: 'List', marker: 2 }] },
      ])

      expect(body.nodes).toEqual([{ id: 'a', type: 'Card', children: [{ id: 'b', type: 'List' }] }])
      const stored = await listModules(ctx.db, fx.project.id)
      expect(JSON.stringify(stored[0]!.nodes)).not.toContain('marker')
    })
  })

  /**
   * **상태 보임을 서버도 걷는다**(Review Focus 5 · 설계 spec 「B3. 모듈」) — 화면을 지나지 않는 본문이 보임을 실은 판이다. 모듈에는 상태가
   * 없어 넣은 노드는 넣는 페이지의 모든 상태에서 보여야 한다.
   */
  it('상태 보임을 걷는다 — 트리 어디에 있든 · 저장된 것에도 없다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const body = await made(ctx, fx, '보임 달린 묶음', [
        {
          id: 'a',
          type: 'Card',
          visibility: { mode: 'only', states: ['s_admin'] },
          children: [{ id: 'b', type: 'List', visibility: { mode: 'except', states: ['s_guest'] } }],
        },
      ])

      expect(body.nodes).toEqual([{ id: 'a', type: 'Card', children: [{ id: 'b', type: 'List' }] }])
      const stored = await listModules(ctx.db, fx.project.id)
      expect(JSON.stringify(stored[0]!.nodes)).not.toContain('visibility')
    })
  })

  /**
   * **묶음 밖 노드를 겨냥하는 액션을 서버도 걷는다**(Review Focus 5) — 화면을 지나지 않는 본문이 그대로 보낸 판이다. 묶음 안 노드 · 페이지 ·
   * 빈 대상은 남는다. 액션이 다 빠진 상호작용은 상호작용째, 상호작용이 다 빠진 노드는 `interactions` 키째 빠진다.
   */
  it('묶음 밖 노드를 겨냥하는 액션을 걷는다 — 안 · 페이지 · 빈 대상은 남는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const body = await made(ctx, fx, '상호작용', [
        {
          id: 'm_open',
          type: 'Button',
          props: { label: '열기' },
          interactions: [
            {
              on: 'click',
              actions: [
                { type: 'setVisible', target: 'm_panel', value: true },
                { type: 'setVisible', target: 'n_outside1', value: true },
                { type: 'navigate', target: 'page-elsewhere' },
                { type: 'setVisible', target: '', value: true },
              ],
            },
            { on: 'change', actions: [{ type: 'setVisible', target: 'n_outside2', value: false }] },
          ],
        },
        {
          id: 'm_lone',
          type: 'Button',
          props: { label: '혼자' },
          interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_outside3', value: true }] }],
        },
        { id: 'm_panel', type: 'Card' },
      ])

      expect(body.nodes).toEqual([
        {
          id: 'm_open',
          type: 'Button',
          props: { label: '열기' },
          interactions: [
            {
              on: 'click',
              actions: [
                { type: 'setVisible', target: 'm_panel', value: true },
                { type: 'navigate', target: 'page-elsewhere' },
                { type: 'setVisible', target: '', value: true },
              ],
            },
          ],
        },
        { id: 'm_lone', type: 'Button', props: { label: '혼자' } },
        { id: 'm_panel', type: 'Card' },
      ])
      expect(JSON.stringify((await listModules(ctx.db, fx.project.id))[0]!.nodes)).not.toContain('n_outside')
    })
  })

  it('id 는 저장 시점 그대로 담는다 — 재발급은 넣기가 한다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      expect((await made(ctx, fx, 'id 보존', [{ id: 'n_keepthis01', type: 'List' }])).nodes[0]!.id).toBe('n_keepthis01')
    })
  })

  it('같은 이름 둘을 막지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const first = await made(ctx, fx, '같은 이름')
      const second = await made(ctx, fx, '같은 이름')
      expect(first.id).not.toBe(second.id)
    })
  })

  it('이름 0 · 61자는 400 · 60자는 201', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const codes = [
        (await post(ctx, fx, { name: '', nodes: [BUTTON] })).statusCode,
        (await post(ctx, fx, { name: '가'.repeat(61), nodes: [BUTTON] })).statusCode,
        (await post(ctx, fx, { name: '가'.repeat(60), nodes: [BUTTON] })).statusCode,
      ]
      expect(codes).toEqual([400, 400, 201])
    })
  })

  it('노드 0개 · 노드 봉투 위반(선언되지 않은 키) · 배열이 아님 · 옛 프리셋 키(schema · description · viewStates)는 400', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const codes = [
        (await post(ctx, fx, { name: '빈', nodes: [] })).statusCode,
        (await post(ctx, fx, { name: '스타일', nodes: [{ id: 'a', type: 'List', style: 'red' }] })).statusCode,
        (await post(ctx, fx, { name: '봉투째', nodes: { version: 5, root: { id: 'a', type: 'Page' } } })).statusCode,
        (await post(ctx, fx, { name: '옛 꼴', schema: [BUTTON] })).statusCode,
        (await post(ctx, fx, { name: '설명', nodes: [BUTTON], description: '옛 칸' })).statusCode,
        (await post(ctx, fx, { name: '상태', nodes: [BUTTON], viewStates: [] })).statusCode,
      ]
      expect(codes).toEqual([400, 400, 400, 400, 400, 400])
      expect(await listModules(ctx.db, fx.project.id)).toEqual([])
    })
  })

  /**
   * **NUL 이 어디서 막히는지 재는 자리다.** 라우트의 `rejectUnstorable` 이 잡는다 — 그 검사를 지우면 repo 의 `ModuleNulByteError` 가 잡아
   * 역시 400 이고, 둘 다 지우면 `nodes::jsonb` 캐스팅이 `22P05` 로 죽어 500 이다.
   */
  it('이름 · 노드 어디에 NUL 이 있어도 400 · 아무것도 저장되지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const codes = [
        (await post(ctx, fx, { name: `이름${NUL}`, nodes: [BUTTON] })).statusCode,
        (await post(ctx, fx, { name: '노드', nodes: [{ id: 'a', type: 'List', props: { columns: [`가${NUL}`] } }] })).statusCode,
      ]
      expect(codes).toEqual([400, 400])
      expect(await listModules(ctx.db, fx.project.id)).toEqual([])
    })
  })

  it('남의 프로젝트 id 로 저장하면 404 — 그 프로젝트에 행이 안 생긴다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const other = await fixture(ctx)
      const res = await ctx.app.inject({
        method: 'POST',
        url: base(other),
        cookies: fx.owner.cookie,
        payload: { name: '끼어든', nodes: [BUTTON] },
      })
      expect(res.statusCode).toBe(404)
      expect(await listModules(ctx.db, other.project.id)).toEqual([])
    })
  })
})

describe('PATCH /:projectId/modules/:moduleId', () => {
  it('이름만 바꾼다 — 200 { module } · 노드는 그대로 · updatedAt 이 오른다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const before = await made(ctx, fx, '옛 이름')

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `${base(fx)}/${before.id}`,
        cookies: fx.owner.cookie,
        payload: { name: '새 이름' },
      })

      expect(res.statusCode, res.body).toBe(200)
      const after = (res.json() as { module: ModuleBody }).module
      expect({ id: after.id, name: after.name, nodes: after.nodes }).toEqual({ id: before.id, name: '새 이름', nodes: before.nodes })
      expect(Date.parse(after.updatedAt)).toBeGreaterThan(Date.parse(before.updatedAt))
      expect((await list(ctx, fx)).map((entry) => entry.name)).toEqual(['새 이름'])
    })
  })

  it('이름 규칙은 저장과 같다 · 노드는 못 바꾼다(선언되지 않은 키 400)', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const before = await made(ctx, fx, '이름')
      const url = `${base(fx)}/${before.id}`
      const codes = await Promise.all(
        [{ name: '' }, { name: '가'.repeat(61) }, { name: `가${NUL}` }, { name: '새', nodes: [] }].map(
          async (payload) => (await ctx.app.inject({ method: 'PATCH', url, cookies: fx.owner.cookie, payload })).statusCode,
        ),
      )
      expect(codes).toEqual([400, 400, 400, 400])
      expect((await list(ctx, fx)).map((entry) => entry.name)).toEqual(['이름'])
    })
  })

  it('지운 모듈 · 남의 프로젝트 모듈의 이름 바꾸기는 404', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const other = await fixture(ctx)
      const gone = await made(ctx, fx, '지울 것')
      await ctx.app.inject({ method: 'DELETE', url: `${base(fx)}/${gone.id}`, cookies: fx.owner.cookie })
      const others = await made(ctx, other, '남의 것')

      const codes = [
        (await ctx.app.inject({ method: 'PATCH', url: `${base(fx)}/${gone.id}`, cookies: fx.owner.cookie, payload: { name: '새' } }))
          .statusCode,
        (await ctx.app.inject({ method: 'PATCH', url: `${base(fx)}/${others.id}`, cookies: fx.owner.cookie, payload: { name: '새' } }))
          .statusCode,
      ]
      expect(codes).toEqual([404, 404])
      expect((await listModules(ctx.db, other.project.id)).map((entry) => entry.name)).toEqual(['남의 것'])
    })
  })
})

describe('DELETE /:projectId/modules/:moduleId', () => {
  it('지우면 204 · 목록에서 사라진다 · 두 번째는 404', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const target = await made(ctx, fx, '지울 것')
      const url = `${base(fx)}/${target.id}`

      const first = await ctx.app.inject({ method: 'DELETE', url, cookies: fx.owner.cookie })
      const second = await ctx.app.inject({ method: 'DELETE', url, cookies: fx.owner.cookie })

      expect([first.statusCode, second.statusCode]).toEqual([204, 404])
      expect(await list(ctx, fx)).toEqual([])
    })
  })

  it('남의 프로젝트의 모듈은 404 — 실제로 남아 있다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const other = await fixture(ctx)
      const others = await made(ctx, other, '남의 것')

      const res = await ctx.app.inject({ method: 'DELETE', url: `${base(fx)}/${others.id}`, cookies: fx.owner.cookie })

      expect(res.statusCode).toBe(404)
      expect((await listModules(ctx.db, other.project.id)).length).toBe(1)
    })
  })

  it('옛 내장 프리셋 id 꼴(builtin:…)은 400 — 경로가 uuid 를 요구한다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await ctx.app.inject({ method: 'DELETE', url: `${base(fx)}/builtin:search-list`, cookies: fx.owner.cookie })
      expect(res.statusCode).toBe(400)
    })
  })

  it('프로젝트 삭제가 CASCADE 로 모듈을 지운다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      await made(ctx, fx, '함께 갈 것')
      const res = await ctx.app.inject({ method: 'DELETE', url: `/api/projects/${fx.project.id}`, cookies: fx.owner.cookie })
      expect(res.statusCode).toBe(204)
      expect(await listModules(ctx.db, fx.project.id)).toEqual([])
    })
  })
})

describe('옛 프리셋 라우트는 없다', () => {
  it('GET · POST …/presets 는 404', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const url = `/api/projects/${fx.project.id}/presets`
      const codes = [
        (await ctx.app.inject({ method: 'GET', url, cookies: fx.owner.cookie })).statusCode,
        (await ctx.app.inject({ method: 'POST', url, cookies: fx.owner.cookie, payload: { name: '옛', schema: [] } })).statusCode,
      ]
      expect(codes).toEqual([404, 404])
    })
  })
})

/**
 * **저장 규칙(`moduleNodesForSave`)을 지나는 자리가 하나인 것을 실행으로 지킨다** — 옛 프리셋의 «marker 규칙의 자리가 하나다»를 옮긴 것이다.
 *
 * 세는 단위는 «`modules` 테이블에 행을 넣는 자리 하나당 하나» — repo 함수(`insertModule(`)와 테이블 직접(`insertInto('modules')`) 두 꼴을 센다.
 *
 * **분모 밖에 남는 것** — 원시 SQL(`` sql`insert into modules …` ``)과 동적 테이블 이름. 프리셋을 옮기는 마이그레이션(`0024-modules.ts`)이
 * 그 꼴이다 — 그 파일은 제 규칙(기본 가지만 · 묶음 밖 액션 · `marker`)을 이 함수 대신 제 안에 얼려 둔다(그 머리말).
 */
const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url))

const WRITE_FORMS: { label: string; pattern: RegExp }[] = [
  { label: 'repo 함수', pattern: /\binsertModule\s*\(/ },
  { label: '테이블 직접', pattern: /\binsertInto\s*\(\s*['"`]modules['"`]\s*\)/ },
]

function sourceFiles(): string[] {
  return readdirSync(SRC_DIR, { recursive: true })
    .map((entry) => String(entry))
    .filter((name) => name.endsWith('.ts'))
}

describe('저장 규칙의 자리가 하나다', () => {
  it('훑을 소스를 실제로 읽는다', () => {
    expect(sourceFiles().length).toBeGreaterThan(20)
  })

  it('두 꼴을 실제로 알아본다 — 정규식이 아무것도 못 찾는 판을 막는다', () => {
    const samples = ['await insertModule(db, input)', "db.insertInto('modules').values(row)"]
    expect(samples.map((sample) => WRITE_FORMS.some(({ pattern }) => pattern.test(sample)))).toEqual([true, true])
  })

  it('모듈을 쓰는 자리가 라우트 하나다 — 늘면 저장 규칙을 다시 판정해야 한다', () => {
    const writers = sourceFiles().filter((name) => {
      if (name === 'repos/modules.ts') return false
      const source = stripComments(readFileSync(join(SRC_DIR, name), 'utf8'))
      return WRITE_FORMS.some(({ pattern }) => pattern.test(source))
    })
    expect(writers).toEqual(['routes/modules.ts'])
  })

  it('그 자리가 moduleNodesForSave 를 지난다', () => {
    const source = stripComments(readFileSync(join(SRC_DIR, 'routes/modules.ts'), 'utf8'))
    expect(/moduleNodesForSave\s*\(/.test(source)).toBe(true)
  })
})
