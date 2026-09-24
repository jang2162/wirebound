/**
 * `routes/snapshots.ts` — 세 엔드포인트와 오류 표.
 *
 * 권한 세 등급은 `permission-matrix.test.ts`가 전수로 친다(그 파일의 완전성 검사가
 * `src/routes/`를 훑어 새 라우트를 강제로 표에 올린다). 여기서는 **내용**을 잰다:
 * 응답 모양, 오류 네 갈래, 그리고 설계서 「스냅샷」의 *"삭제 없는"*이 실제로 지켜지는지.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { stripComments } from '@wirebound/test-support'
import { sql } from 'kysely'
import { containsNulByte } from '../src/db/nul-guard'
import { listSnapshots } from '../src/repos/snapshots'
import { captureSnapshot } from '../src/services/snapshot-capture'
import { snapshotRoutes } from '../src/routes/snapshots'
import { createMenuNode, createPage, createProject, signup, withApi, type TestContext } from './helpers'

const NUL = String.fromCharCode(0)

async function fixture(ctx: TestContext) {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '설정' })
  const page = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '사용자 목록' })
  return { owner, project, menu, page }
}

/**
 * **`payload`를 `unknown`으로 두면 안 된다 — 재서 알았다.**
 *
 * `inject`는 오버로드 셋이고(`(opts, cb): void` · `(opts): Promise<Response>` · `(): Chain`),
 * `InjectOptions.payload`는 `InjectPayload`다. `unknown`을 실으면 **어느 오버로드에도 맞지
 * 않아** 호출식의 타입이 `void & Promise<Response> & Chain`(셋의 교집합)으로 떨어지고,
 * 그러면 호출부의 `.statusCode`·`.json()`이 전부 컴파일 오류가 된다.
 *
 * **vitest는 타입을 보지 않으므로 그 상태로 테스트가 전부 초록이고 `pnpm typecheck`만
 * 실패한다** — 종료 코드를 파이프 없이 따로 찍어야 보이는 형태다.
 * `async`로 감싸 `await`해도 낫지 않는다(교집합의 `Awaited`가 그대로 교집합이다). 고치는
 * 자리는 **인자 타입**이다.
 */
async function post(ctx: TestContext, fx: Awaited<ReturnType<typeof fixture>>, payload: Record<string, unknown>) {
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${fx.project.id}/snapshots`,
    cookies: fx.owner.cookie,
    payload,
  })
  return res
}

describe('POST /:projectId/snapshots', () => {
  it('201과 함께 payload·payloadBytes·만든 사람을 낸다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)

      const res = await post(ctx, fx, { tag: 'v1', description: '첫 스냅샷' })

      expect(res.statusCode).toBe(201)
      const body = res.json() as Record<string, unknown>
      expect(body['tag']).toBe('v1')
      expect(body['description']).toBe('첫 스냅샷')
      expect(body['createdByName']).toBe(fx.owner.user.name)
      expect(body['payloadBytes']).toBeGreaterThan(0)
      expect((body['payload'] as { pages: unknown[] }).pages).toHaveLength(1)
    })
  })

  it('설명 없이도 만들 수 있다 — 그때 description은 null이다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)

      const res = await post(ctx, fx, { tag: 'v1' })

      expect(res.statusCode).toBe(201)
      expect((res.json() as { description: unknown }).description).toBeNull()
    })
  })

  it('같은 태그를 두 번 쓰면 409이고 문장이 "이름을 바꾸라"는 쪽이다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      expect((await post(ctx, fx, { tag: '중복' })).statusCode).toBe(201)

      const res = await post(ctx, fx, { tag: '중복' })

      expect(res.statusCode).toBe(409)
      const error = (res.json() as { error: { code: string; message: string } }).error
      expect(error.code).toBe('conflict')
      expect(error.message).toContain('이미 있습니다')
      // 실패했는데 조작이 일어나지 않았다(사실 5).
      expect(await listSnapshots(ctx.db, fx.project.id)).toHaveLength(1)
    })
  })

  /**
   * **두 409의 문장이 달라야 한다** — 사용자가 할 일이 다르다: 태그 중복은
   * *"이름을 바꾼다"*이고 지문 불일치는 *"다시 시도한다"*이다. 화면이 코드(`conflict`)로는
   * 가를 수 없으므로 문장이 갈라야 한다.
   *
   * 지문 불일치를 **결정적으로** 만들기 위해 같은 라우트 팩토리를 다른 prefix로 한 번 더
   * 등록한다(근거는 `routes/snapshots.ts`의 팩토리 머리말). 라우트를 베끼지 않으므로
   * 여기서 도는 것은 운영과 **같은 핸들러**다.
   */
  it('수집 도중 프로젝트가 바뀌면 409이고 문장이 "다시 시도하라"는 쪽이다', async () => {
    await withApi(async (ctx) => {
      // **등록이 픽스처보다 먼저다.** Fastify 5는 부팅(첫 `inject`) 뒤의 라우트 등록을
      // 거부한다(`Root plugin has already booted` — 순서를 바꿔 보고 확인했다). 픽스처는
      // `signup`부터 요청을 보내므로, 훅이 그때는 아직 없는 값을 봐야 한다. 그래서 훅을
      // 참조로 늦게 채운다.
      let interrupt: (() => Promise<void>) | undefined
      await ctx.app.register(
        snapshotRoutes({ captureHooks: { afterPages: async () => interrupt?.() } }),
        { prefix: '/probe/projects' },
      )

      const fx = await fixture(ctx)
      interrupt = async () => {
        await createPage(ctx, fx.owner.cookie, fx.project.id, fx.menu.id, { title: '끼어든 페이지' })
      }

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/probe/projects/${fx.project.id}/snapshots`,
        cookies: fx.owner.cookie,
        payload: { tag: 'v1' },
      })

      expect(res.statusCode).toBe(409)
      const error = (res.json() as { error: { code: string; message: string } }).error
      expect(error.code).toBe('conflict')
      expect(error.message).toContain('다시 시도')
      expect(error.message).not.toContain('이미 있습니다')
      // **이 갈래는 아무것도 되돌리지 않는다 — 되돌릴 것이 없기 때문이다.**
      expect(await listSnapshots(ctx.db, fx.project.id)).toHaveLength(0)
    })
  })

  it('태그가 비면 400이다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)

      const res = await post(ctx, fx, { tag: '' })

      expect(res.statusCode).toBe(400)
      expect(JSON.stringify(res.json())).toContain('태그를 입력하세요')
    })
  })

  it('태그가 61자면 400이고 60자는 통과한다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)

      expect((await post(ctx, fx, { tag: 'a'.repeat(61) })).statusCode).toBe(400)
      expect((await post(ctx, fx, { tag: 'a'.repeat(60) })).statusCode).toBe(201)
    })
  })

  it('설명이 2001자면 400이고 2000자는 통과한다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)

      expect((await post(ctx, fx, { tag: 'v1', description: 'a'.repeat(2001) })).statusCode).toBe(400)
      expect((await post(ctx, fx, { tag: 'v2', description: 'a'.repeat(2000) })).statusCode).toBe(201)
    })
  })

  it('선언되지 않은 키는 그 자체로 400이다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)

      expect((await post(ctx, fx, { tag: 'v1', payload: {} })).statusCode).toBe(400)
    })
  })

  /**
   * **NUL은 400이다 — 막지 않으면 500이다.** `snapshots.tag`가 `text`라 `pg`가 던지는 raw
   * 예외를 `http/error-handler.ts`가 500으로 낸다. 사용자가 보내온 글자 때문에 나는 실패는
   * 서버가 잘못한 것이 아니다(`routes/comments.ts`가 같은 자리에서 같은 판단을 한다).
   */
  it('태그의 NUL을 400으로 막는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)

      const res = await post(ctx, fx, { tag: `v${NUL}1` })

      expect(res.statusCode).toBe(400)
      expect((res.json() as { error: { message: string } }).error.message).toContain('NUL')
      expect(await listSnapshots(ctx.db, fx.project.id)).toHaveLength(0)
    })
  })

  /**
   * # payload의 NUL 가드는 **죽은 코드가 아니다**
   *
   * *"DB가 삽입 시점에 막으니 도달 경로 0"*으로 읽기 쉽지만 **거짓 근거**이고, 그렇게 믿으면
   * 다음 사람이 이 가드를 지운다. **도달 경로가 있다:** `themes`의 절 다섯은 `jsonb`가 아니라 **`json`** 컬럼이라(0006) DB가 NUL을 **받는다.**
   *
   * 실측(같은 값으로 두 캐스팅을 나란히 쳤다):
   *
   * | 대상 | 결과 |
   * |---|---|
   * | `'{"semantic":{"primary":"#fff\u0000"}}'::json` | **들어간다** |
   * | 같은 값 `::jsonb` | **`22P05 unsupported Unicode escape sequence`** |
   *
   * 즉 그 절을 막는 것은 DB가 아니라 `repos/themes.ts`의 `containsNulByte` 가드(`ThemeNulByteError`를 던진다) **한 줄뿐**이고,
   * 그 줄을 끄면 `POST /themes`가 **201**을 내고 → 되읽은 테마에 NUL이 있고 → 캡처가
   * `'captured'`로 **NUL이 든 payload**를 만들고 → `POST /snapshots`가 **400**을 낸다
   * (그 400을 내는 것이 바로 이 가드다. 행은 0개 남는다).
   *
   * **이 케이스는 프로덕션을 고치지 않고 같은 상태를 만든다** — `json` 컬럼에 raw SQL로
   * NUL을 넣는다. 그것이 DB가 실제로 허용하는 일이므로 가짜 상태가 아니다.
   */
  it('payload에 NUL이 실리면 400이다 — themes의 json 컬럼이 그 경로다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)

      // **`JSON.stringify`를 지나야 한다 — 재서 알았다.** 템플릿 리터럴로 NUL을 그대로
      // 심으면 파라미터에 **날 NUL 바이트**가 실려 Postgres가 프로토콜 층에서
      // `22021 invalid byte sequence for encoding "UTF8": 0x00`으로 끊는다.
      // `JSON.stringify`는 그것을 여섯 글자 이스케이프
      // `\u0000`으로 바꾸므로 날 바이트가 없고, **그것이 `repos/themes.ts`의 `section()`이
      // 실제로 하는 일이다** — 즉 이 문장이 그 경로를 그대로 재현한다.
      const tokens = JSON.stringify({ semantic: { primary: `#fff${NUL}` } })

      // `json` 컬럼이라 들어간다. `jsonb`였다면 이 문장이 `22P05`로 죽는다.
      const themeRow = await sql<{ id: string }>`
        insert into themes (project_id, slug, name, version, tokens)
        values (${fx.project.id}, 'raw-nul', '원시', '1.0.0', ${tokens}::json)
        returning id
      `.execute(ctx.db)
      const themeId = themeRow.rows[0]!.id

      const chosen = await ctx.app.inject({
        method: 'PUT',
        url: `/api/projects/${fx.project.id}/theme`,
        cookies: fx.owner.cookie,
        payload: { themeId },
      })
      expect(chosen.statusCode).toBe(200)

      // 캡처는 성공한다 — NUL은 캡처가 아니라 **저장**이 막는다.
      const outcome = await captureSnapshot(ctx.db, fx.project.id)
      expect(outcome.kind).toBe('captured')
      expect(containsNulByte(outcome.kind === 'captured' ? outcome.payload : null)).toBe(true)

      const res = await post(ctx, fx, { tag: 'v1' })

      expect(res.statusCode).toBe(400)
      expect((res.json() as { error: { message: string } }).error.message).toContain('NUL')
      expect(await listSnapshots(ctx.db, fx.project.id)).toHaveLength(0)
    })
  })

  it('설명의 NUL도 400으로 막는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)

      const res = await post(ctx, fx, { tag: 'v1', description: `설명${NUL}` })

      expect(res.statusCode).toBe(400)
      expect((res.json() as { error: { message: string } }).error.message).toContain('NUL')
    })
  })
})

describe('GET /:projectId/snapshots', () => {
  it('payload 본문 없이 목록을 낸다 — payloadBytes는 있다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      await post(ctx, fx, { tag: 'v1' })

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fx.project.id}/snapshots`,
        cookies: fx.owner.cookie,
      })

      expect(res.statusCode).toBe(200)
      const rows = res.json() as Record<string, unknown>[]
      expect(rows).toHaveLength(1)
      expect(Object.hasOwn(rows[0]!, 'payload')).toBe(false)
      expect(rows[0]!['payloadBytes']).toBeGreaterThan(0)
    })
  })

  it('남의 프로젝트 스냅샷은 나오지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      await post(ctx, fx, { tag: 'v1' })
      const other = await createProject(ctx, fx.owner.cookie)

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${other.id}/snapshots`,
        cookies: fx.owner.cookie,
      })

      expect(res.json()).toEqual([])
    })
  })
})

describe('GET /:projectId/snapshots/:snapshotId', () => {
  it('payload 본문을 함께 낸다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const created = (await post(ctx, fx, { tag: 'v1' })).json() as { id: string; payload: unknown }

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fx.project.id}/snapshots/${created.id}`,
        cookies: fx.owner.cookie,
      })

      expect(res.statusCode).toBe(200)
      expect((res.json() as { payload: unknown }).payload).toEqual(created.payload)
    })
  })

  it('없는 id는 404다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fx.project.id}/snapshots/00000000-0000-4000-8000-0000000000ff`,
        cookies: fx.owner.cookie,
      })

      expect(res.statusCode).toBe(404)
    })
  })

  it('남의 프로젝트의 스냅샷 id는 404다 — 존재를 숨긴다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const created = (await post(ctx, fx, { tag: 'v1' })).json() as { id: string }
      const other = await createProject(ctx, fx.owner.cookie)

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${other.id}/snapshots/${created.id}`,
        cookies: fx.owner.cookie,
      })

      expect(res.statusCode).toBe(404)
    })
  })
})

/**
 * **설계서 「스냅샷」의 *"삭제 없는 태그"*를 실행으로 지킨다.**
 *
 * 테이블에는 그것을 막는 장치가 없다(평범한 표다). 지키는 것은 **라우트가 없다는 사실**
 * 하나뿐이고, 그런 규칙은 사람이 기억하면 낡는다 — `permission-matrix.test.ts`가
 * *"새 라우트를 표에 등록한다"*를 실행으로 옮긴 것과 같은 판단이다.
 */
describe('삭제 없는 태그', () => {
  const SOURCE = readFileSync(fileURLToPath(new URL('../src/routes/snapshots.ts', import.meta.url)), 'utf8')

  it('검사가 진짜 라우트 파일을 읽는다', () => {
    // 경로가 어긋나면 아래가 빈 문자열에서 조용히 통과한다.
    expect(SOURCE).toContain("app.post('/:projectId/snapshots'")
  })

  it('이 파일에 삭제 라우트가 없다', () => {
    expect(stripComments(SOURCE)).not.toMatch(/app\.delete\s*\(/)
  })

  /**
   * **쓰이지 않는 `owner` 가드를 미리 만들어 두지 않는다** — 그래서 그 가드는 *"쓰이는 그
   * 한 자리에만 있다"*. 지금 그 자리는 복원 하나다.
   */
  it('owner 가드는 복원 하나에만 걸려 있다', () => {
    const code = stripComments(SOURCE)
    const guarded = [...code.matchAll(/app\.(get|post|patch|put|delete)\(\s*'([^']+)'\s*,\s*\{\s*preHandler:\s*projectGuard\('(\w+)'\)/g)]

    expect(guarded.filter((match) => match[3] === 'owner').map((match) => match[2])).toEqual([
      '/:projectId/snapshots/:snapshotId/restore',
    ])
  })

  /**
   * **다섯째는 `GET /:projectId/snapshot`(단수)이다.** 읽기 전용 프로젝트 덤프이고 행을
   * 쓰지 않는다 — `wireb pull`이 부르는 것이 그쪽이다.
   * **단수와 복수가 이름 하나 차이라 목록을 통째로 단언하는 이 케이스가 그 갈림을
   * 사람에게 보인다.**
   */
  it('복원은 POST 하나이고 라우트가 다섯이다', () => {
    const code = stripComments(SOURCE)
    const routes = [...code.matchAll(/app\.(get|post|patch|put|delete)\(\s*'([^']+)'/g)].map(
      (match) => `${match[1]!.toUpperCase()} ${match[2]}`,
    )

    expect(routes).toEqual([
      'POST /:projectId/snapshots',
      'GET /:projectId/snapshot',
      'GET /:projectId/snapshots',
      'GET /:projectId/snapshots/:snapshotId',
      'POST /:projectId/snapshots/:snapshotId/restore',
    ])
  })

  it('심으면 잡는다 — 구분력', () => {
    const planted = `${SOURCE}\napp.delete('/:projectId/snapshots/:snapshotId', {}, async () => {})\n`
    expect(stripComments(planted)).toMatch(/app\.delete\s*\(/)
  })

  it('주석 안의 인용은 세지 않는다 — 구분력의 반대편', () => {
    // 이 파일의 머리말이 실제로 `app.delete`를 인용한다. 주석을 걷지 않으면 위 케이스가
    // 늘 죽는다(`apps/web/test/api-consumers.test.ts`의 것과 같은 함정이다).
    expect(SOURCE).toContain('app.delete')
    expect(stripComments(SOURCE)).not.toContain('app.delete')
  })
})
