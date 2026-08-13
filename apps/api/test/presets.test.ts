/**
 * `routes/presets.ts` — 세 엔드포인트와 오류 표(P7-2 T2).
 *
 * 권한 세 등급은 `permission-matrix.test.ts`가 전수로 친다(그 파일의 완전성 검사가
 * `src/routes/`를 훑어 새 라우트를 강제로 표에 올린다). 여기서 재는 것은 **내용**이다:
 * 목록이 내장과 프로젝트 것을 함께 내는가(D2), 저장이 `marker`를 버리고 id를 그대로
 * 담는가(D4·D7), 그리고 NUL이 **어디서** 막히는가(계획서 T2가 요구한 관측).
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
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

/**
 * **`marker`를 버리는 자리가 하나인 것을 실행으로 지킨다**(P7-2 리뷰 (4) · 델타 리뷰 N4).
 *
 * # 세는 단위
 *
 * > **`presets` 테이블에 행을 넣는 자리 하나당 하나.**
 *
 * **앞 판은 `insertPreset(` 호출만 셌고 그것은 단위보다 좁았다** — repo 함수를 지나지 않고
 * `insertInto('presets')`로 직접 쓰는 자리를 못 봤다(재현했다: 그런 파일을 하나 만들어
 * 두어도 케이스가 초록이었다). 지금은 **두 형태를 모두 센다.**
 *
 * # 분모 밖에 남는 것 — 이름으로 찾을 수 없는 쓰기
 *
 * - **원시 SQL**(`` sql`insert into presets …` ``)과 **동적 테이블 이름**. 문자열을 조립하면
 *   어떤 grep도 못 잡는다.
 * - **DB 안의 쓰기** — 트리거·기본값·다른 테이블의 CASCADE. 오늘 `presets`에는 없다.
 *
 * 즉 이 케이스가 지키는 것은 *"코드에서 이름으로 드러나는 쓰기"*까지다. 그 밖의 경로를
 * 만드는 사람에게까지 신호를 주지는 못한다.
 *
 * # 왜 NUL처럼 repo에 겹으로 두지 않는가
 *
 * **NUL이 겹인 이유는 저장 제약이기 때문이다.** 그 검사가 없으면 Postgres가 `22P05`로
 * 죽어 **500**이 된다(T5에서 세 판을 돌려 쟀다: 400 · 400 · 500). repo의 검사는 그
 * 500을 400으로 바꾸는 마지막 방벽이고, `db/nul-guard.ts`가 `db/`에 사는 것도 그것이
 * 순전히 Postgres의 제약이기 때문이다.
 *
 * **`marker`에는 그런 바닥이 없다.** 그것은 저장 제약이 아니라 **도메인 규칙**이고
 * (D4 — 고아 marker를 만들지 않는다), 담겨도 DB는 아무 말도 하지 않는다. 그래서
 * `repos/presets.ts`는 *"값의 뜻을 모르고 컬럼으로만 다룬다"*를 지키고, 규칙은 라우트
 * 하나가 갖는다 — README의 계층 규칙이 그은 선이다.
 *
 * **대신 그 "하나"가 진짜 하나인지를 이 케이스가 센다.** 겹으로 두는 대신 **자리가 늘면
 * 죽는 것**을 골랐다: P9의 MCP·CLI가 두 번째 쓰기 경로를 만들면 여기가 먼저 죽고, 그때
 * 사람이 *"`stripMarkers`를 어디에 둘 것인가"*를 다시 판정하게 된다.
 */
const SRC_DIR = fileURLToPath(new URL('../src', import.meta.url))

/** `presets`에 행을 넣는 **이름으로 드러나는** 두 형태. 전역 플래그를 쓰지 않는다(`lastIndex`). */
const WRITE_FORMS: { label: string; pattern: RegExp }[] = [
  { label: 'repo 함수', pattern: /\binsertPreset\s*\(/ },
  { label: '테이블 직접', pattern: /\binsertInto\s*\(\s*['"`]presets['"`]\s*\)/ },
]

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/** `src` 아래의 `.ts` 전부. 경로는 `src` 기준 상대다. */
function sourceFiles(): string[] {
  return readdirSync(SRC_DIR, { recursive: true })
    .map((entry) => String(entry))
    .filter((name) => name.endsWith('.ts'))
}

describe('marker 규칙의 자리가 하나다', () => {
  it('훑을 소스를 실제로 읽는다', () => {
    // 글롭이 어긋나면 **빈 집합에서 아래가 조용히 통과한다**(이 저장소가 여러 번 겪은 사고다).
    expect(sourceFiles().length).toBeGreaterThan(20)
  })

  it('두 형태를 실제로 알아본다 — 정규식이 아무것도 못 찾는 판을 막는다', () => {
    // **저장소의 소스가 아니라 표본으로 잰다.** 소스로 재면 그 소스가 바뀔 때 무엇이
    // 깨졌는지(형태를 못 알아보는가, 자리가 늘었는가) 갈리지 않는다.
    const samples = ["await insertPreset(db, input)", "db.insertInto('presets').values(row)"]

    expect(samples.map((sample) => WRITE_FORMS.some(({ pattern }) => pattern.test(sample)))).toEqual([
      true,
      true,
    ])
  })

  it('프리셋을 쓰는 자리가 라우트 하나다 — 늘면 marker 규칙을 다시 판정해야 한다', () => {
    const writers = sourceFiles().filter((name) => {
      // repo 자신은 **쓰는 자리를 제공하는 쪽**이다 — 세는 것은 그것을 부르는 자리다.
      if (name === 'repos/presets.ts') return false
      const source = stripComments(readFileSync(join(SRC_DIR, name), 'utf8'))
      return WRITE_FORMS.some(({ pattern }) => pattern.test(source))
    })

    expect(writers).toEqual(['routes/presets.ts'])
  })

  it('그 자리가 stripMarkers를 지난다', () => {
    const source = stripComments(readFileSync(join(SRC_DIR, 'routes/presets.ts'), 'utf8'))

    expect(/stripMarkers\s*\(/.test(source)).toBe(true)
  })
})
