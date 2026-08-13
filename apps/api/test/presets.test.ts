/**
 * `routes/presets.ts` — 세 엔드포인트와 오류 표(P7-2 T2).
 *
 * 권한 세 등급은 `permission-matrix.test.ts`가 전수로 친다(그 파일의 완전성 검사가
 * `src/routes/`를 훑어 새 라우트를 강제로 표에 올린다). 여기서 재는 것은 **내용**이다:
 * 목록이 내장과 프로젝트 것을 함께 내는가(D2), 저장이 `marker`를 버리고 id를 그대로
 * 담는가(D4·D7), 그리고 NUL이 **어디서** 막히는가(계획서 T2가 요구한 관측).
 */
import { describe, expect, it } from 'vitest'
import { BUILTIN_PRESETS, type WbNode } from '@wirebound/schema'
import { listPresets } from '../src/repos/presets'
import { createProject, signup, withApi, type TestContext } from './helpers'

const NUL = String.fromCharCode(0)

async function fixture(ctx: TestContext) {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  return { owner, project }
}

type Fixture = Awaited<ReturnType<typeof fixture>>

async function post(ctx: TestContext, fx: Fixture, payload: Record<string, unknown>) {
  return ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${fx.project.id}/presets`,
    cookies: fx.owner.cookie,
    payload,
  })
}

async function list(ctx: TestContext, fx: Fixture) {
  const res = await ctx.app.inject({
    method: 'GET',
    url: `/api/projects/${fx.project.id}/presets`,
    cookies: fx.owner.cookie,
  })
  return res
}

describe('GET /:projectId/presets', () => {
  it('프로젝트 프리셋이 없어도 내장이 나온다 — 그것이 기본 상태다(D2)', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)

      const res = await list(ctx, fx)

      expect(res.statusCode).toBe(200)
      const body = res.json() as { id: string; source: string; name: string }[]
      // **수를 적지 않는다** — 내장 목록에서 만든다. 프리셋이 늘거나 줄면 이 배열이 따라간다.
      expect(body.map((entry) => entry.id)).toEqual(
        BUILTIN_PRESETS.map((preset) => `builtin:${preset.key}`),
      )
      expect(new Set(body.map((entry) => entry.source))).toEqual(new Set(['builtin']))
    })
  })

  it('내장 항목이 nodes를 함께 낸다 — 고른 뒤 다시 묻지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)

      const body = (await list(ctx, fx)).json() as { id: string; nodes: WbNode[] }[]

      const first = body[0]!
      expect(first.nodes).toEqual(BUILTIN_PRESETS[0]!.nodes)
    })
  })

  it('내장 항목에는 createdBy·createdAt이 아예 없다 — null로 말하지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)

      const body = (await list(ctx, fx)).json() as Record<string, unknown>[]

      expect(Object.hasOwn(body[0]!, 'createdBy')).toBe(false)
      expect(Object.hasOwn(body[0]!, 'createdAt')).toBe(false)
    })
  })

  it('프로젝트 프리셋은 내장 뒤에 오래된 것부터 붙는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      await post(ctx, fx, { name: '먼저', schema: [] })
      await post(ctx, fx, { name: '나중', schema: [] })

      const body = (await list(ctx, fx)).json() as { source: string; name: string }[]

      const project = body.filter((entry) => entry.source === 'project')
      expect(project.map((entry) => entry.name)).toEqual(['먼저', '나중'])
      // 내장이 앞이다 — 프로젝트 항목의 첫 자리가 내장 개수와 같다.
      expect(body.indexOf(project[0]!)).toBe(BUILTIN_PRESETS.length)
    })
  })

  it('남의 프로젝트 프리셋은 보이지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const other = await fixture(ctx)
      await post(ctx, other, { name: '남의 것', schema: [] })

      const body = (await list(ctx, fx)).json() as { source: string }[]

      expect(body.filter((entry) => entry.source === 'project')).toEqual([])
    })
  })
})

describe('POST /:projectId/presets', () => {
  it('201과 함께 만든 사람과 이름을 낸다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)

      const res = await post(ctx, fx, {
        name: '회원 목록형',
        description: '검색 + 목록',
        schema: [{ id: 'a', type: 'List' }],
      })

      expect(res.statusCode).toBe(201)
      const body = res.json() as Record<string, unknown>
      expect(body['source']).toBe('project')
      expect(body['name']).toBe('회원 목록형')
      expect(body['description']).toBe('검색 + 목록')
      expect(body['createdBy']).toBe(fx.owner.user.id)
      expect(body['createdByName']).toBe(fx.owner.user.name)
      expect(body['nodes']).toEqual([{ id: 'a', type: 'List' }])
    })
  })

  it('marker를 버린다 — 트리 어디에 있든(D4)', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)

      const res = await post(ctx, fx, {
        name: '번호 달린 페이지',
        schema: [
          { id: 'a', type: 'Card', marker: 1, children: [{ id: 'b', type: 'List', marker: 2 }] },
        ],
      })

      expect(res.statusCode).toBe(201)
      expect((res.json() as { nodes: WbNode[] }).nodes).toEqual([
        { id: 'a', type: 'Card', children: [{ id: 'b', type: 'List' }] },
      ])
      // 응답만이 아니라 **저장된 것**에 없어야 한다.
      const stored = await listPresets(ctx.db, fx.project.id)
      expect(stored[0]!.nodes[0]!.marker).toBeUndefined()
    })
  })

  it('id는 저장 시점 그대로 담는다 — 재발급은 적용이 한다(D7)', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)

      const res = await post(ctx, fx, { name: 'id 보존', schema: [{ id: 'n_keepthis01', type: 'List' }] })

      expect((res.json() as { nodes: WbNode[] }).nodes[0]!.id).toBe('n_keepthis01')
    })
  })

  it('빈 페이지도 프리셋이 된다 — 그것이 "치우기"다(D7)', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)

      const res = await post(ctx, fx, { name: '비우기', schema: [] })

      expect(res.statusCode).toBe(201)
      expect((res.json() as { nodes: WbNode[] }).nodes).toEqual([])
    })
  })

  it('같은 이름 둘을 막지 않는다 — 태그와 다르다(D2)', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)

      const first = await post(ctx, fx, { name: '같은 이름', schema: [] })
      const second = await post(ctx, fx, { name: '같은 이름', schema: [] })

      expect([first.statusCode, second.statusCode]).toEqual([201, 201])
      expect((first.json() as { id: string }).id).not.toBe((second.json() as { id: string }).id)
    })
  })

  it('노드 봉투 위반은 400이다 — 선언되지 않은 키', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)

      // §4.3의 *"노드는 스타일을 갖지 않는다"*를 `WbNodeSchema`가 strictObject로 지킨다.
      const res = await post(ctx, fx, { name: '스타일', schema: [{ id: 'a', type: 'List', style: 'red' }] })

      expect(res.statusCode).toBe(400)
    })
  })

  it('schema가 배열이 아니면 400이다 — 문서 봉투를 보내는 것도 여기 걸린다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)

      const res = await post(ctx, fx, {
        name: '봉투째',
        schema: { version: 1, root: { id: 'a', type: 'Page' } },
      })

      expect(res.statusCode).toBe(400)
    })
  })

  it('이름이 비었거나 60자를 넘으면 400이다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)

      expect((await post(ctx, fx, { name: '', schema: [] })).statusCode).toBe(400)
      expect((await post(ctx, fx, { name: '가'.repeat(61), schema: [] })).statusCode).toBe(400)
      expect((await post(ctx, fx, { name: '가'.repeat(60), schema: [] })).statusCode).toBe(201)
    })
  })

  it('설명이 2000자를 넘으면 400이다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)

      const res = await post(ctx, fx, { name: '긴 설명', description: '가'.repeat(2001), schema: [] })

      expect(res.statusCode).toBe(400)
    })
  })

  it('선언되지 않은 본문 키는 400이다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)

      const res = await post(ctx, fx, { name: '여분', schema: [], pageId: 'pg-1' })

      expect(res.statusCode).toBe(400)
    })
  })

  /**
   * **NUL이 어디서 막히는지 재는 자리다**(계획서 T2). 세 자리 전부에서 400이고, 그것은
   * 라우트의 `containsNulByte`가 잡기 때문이다 — 그 검사를 지우면 repo의
   * `PresetNulByteError`가 잡아 역시 400이 되고, **둘 다 지우면 `schema::jsonb` 캐스팅이
   * `22P05`로 죽어 500**이 된다(T5의 변이 검사에 그 관측이 있다).
   */
  it('이름·설명·노드 어디에 NUL이 있어도 400이다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)

      expect((await post(ctx, fx, { name: `이름${NUL}`, schema: [] })).statusCode).toBe(400)
      expect((await post(ctx, fx, { name: '설명', description: `설명${NUL}`, schema: [] })).statusCode).toBe(400)
      expect(
        (await post(ctx, fx, { name: '노드', schema: [{ id: 'a', type: 'List', props: { columns: [`가${NUL}`] } }] }))
          .statusCode,
      ).toBe(400)
    })
  })

  it('NUL이 걸리면 아무것도 저장되지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)

      await post(ctx, fx, { name: `이름${NUL}`, schema: [] })

      expect(await listPresets(ctx.db, fx.project.id)).toEqual([])
    })
  })
})

describe('DELETE /:projectId/presets/:presetId', () => {
  it('지우면 204이고 목록에서 사라진다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const created = (await post(ctx, fx, { name: '지울 것', schema: [] })).json() as { id: string }

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${fx.project.id}/presets/${created.id}`,
        cookies: fx.owner.cookie,
      })

      expect(res.statusCode).toBe(204)
      const body = (await list(ctx, fx)).json() as { source: string }[]
      expect(body.filter((entry) => entry.source === 'project')).toEqual([])
    })
  })

  it('두 번째 삭제는 404다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const created = (await post(ctx, fx, { name: '지울 것', schema: [] })).json() as { id: string }
      const url = `/api/projects/${fx.project.id}/presets/${created.id}`

      await ctx.app.inject({ method: 'DELETE', url, cookies: fx.owner.cookie })
      const second = await ctx.app.inject({ method: 'DELETE', url, cookies: fx.owner.cookie })

      expect(second.statusCode).toBe(404)
    })
  })

  it('남의 프로젝트의 프리셋은 404다 — 존재를 숨긴다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const other = await fixture(ctx)
      const created = (await post(ctx, other, { name: '남의 것', schema: [] })).json() as { id: string }

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${fx.project.id}/presets/${created.id}`,
        cookies: fx.owner.cookie,
      })

      expect(res.statusCode).toBe(404)
      // 실제로 남아 있다 — 404가 "지웠는데 없다"가 아니다.
      expect((await listPresets(ctx.db, other.project.id)).length).toBe(1)
    })
  })

  it('내장 프리셋은 지울 수 없다 — 경로가 uuid를 요구해 400이다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${fx.project.id}/presets/builtin:${BUILTIN_PRESETS[0]!.key}`,
        cookies: fx.owner.cookie,
      })

      expect(res.statusCode).toBe(400)
      expect((await list(ctx, fx)).json()).toHaveLength(BUILTIN_PRESETS.length)
    })
  })
})

describe('프로젝트가 사라지면 프리셋도 간다', () => {
  it('프로젝트 삭제가 CASCADE로 프리셋을 지운다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      await post(ctx, fx, { name: '함께 갈 것', schema: [] })

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${fx.project.id}`,
        cookies: fx.owner.cookie,
      })

      expect(res.statusCode).toBe(204)
      expect(await listPresets(ctx.db, fx.project.id)).toEqual([])
    })
  })
})
