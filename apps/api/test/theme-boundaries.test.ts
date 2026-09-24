/**
 * 저장 경계가 **재지 않으면 알 수 없는** 것 둘 — 깊이와 `meta.version`.
 */
import { describe, expect, it } from 'vitest'
import { createProject, signup, withApi, type TestContext } from './helpers'

async function ownedProject(ctx: TestContext) {
  const owner = await signup(ctx)
  return { owner, project: await createProject(ctx, owner.cookie) }
}

function post(ctx: TestContext, projectId: string, cookie: { wb_session: string }, theme: unknown) {
  return ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/themes`,
    cookies: cookie,
    payload: { theme } as never,
  })
}

/**
 * **서버가 깊은 본문을 받으면 500이 되는가.**
 *
 * `safeParse`는 깊은 트리에서 `success: false`를 내는 것이 아니라 **던진다**(`RangeError`
 * — zod의 재귀가 호출 스택을 쓴다). 그리고 *"경계가 되는 깊이는 계약이 될 수 없다"* —
 * 같은 프로세스에서도 측정을 거듭하면 경계가 크게 움직인다.
 *
 * **그래서 여기서 재는 것은 깊이의 수가 아니라 도달 가능성이다.** 테마의 어느 절이
 * 재귀 스키마를 쓰는지 훑으면 `patterns.*.schema`(`PatternNodeSchema`) 하나뿐이고,
 * 그것이 유일한 도달 경로다.
 *
 * 결과: **아래 케이스가 잰 깊이에서는 500이 나지 않는다.** 아주 깊게 만들면 그 위에서는
 * 던질 수 있고, 그때 Fastify의 에러 핸들러가 500으로 옮긴다 — 절대값을 계약에 적지 않는다.
 *
 * # 경계 가까운 깊이를 단언하지 않는다
 *
 * *"깊이 1000도 500이 아니다"* 같은 단언은 **위의 결론을 스스로 어긴다** — 그런 깊이는
 * 기계에 따라 **찬 경계 바로 위**에 걸리고, 그러면 코드와 무관하게 게이트가 빨개진다
 * (작업 트리를 `main`으로 되돌려도 죽는다).
 *
 * **결정적인 성질 하나:** 같은 프로세스 안에서 **같은 입력(같은 깊이)이 500과 500 아닌 것을
 * 둘 다 낸다** — 처음 던지면 500이고, 더 깊은 것을 한 번 던져 스택을 데운 뒤 같은 것을
 * 다시 던지면 통과한다. **결말이 입력이 아니라 순서에 달려 있으면 그것은 계약이 아니다.**
 *
 * `packages/themes/src/spec/patterns.ts`도 같은 것을 적는다 —
 * *"경계가 되는 깊이는 여기 적지 않는다. 계약이 될 수 없기 때문이다"*, *"앞선 실행이 스택을
 * 데운다"*, *"깊이 상한은 이 패키지의 것이 아니라 그 순간 스택의 것이다."* **그 파일이 안
 * 적기로 한 값을 이 파일이 단언하면 안 된다.**
 *
 * **그러니 넣지 마라.** 아래 케이스가 빨개지면 답은 **수를 낮추는 것이 아니다** —
 * 그때 세울 것은 *"넘겼을 때의 결말"*이다(`apps/api/README.md` 「에러 형식」의 봉투로 400/413을 내는 것).
 * 그것은 라우트가 `RangeError`를 잡아야 하는 **프로덕션 변경**이고 테마·에러 처리의 몫이다.
 *
 * **잰 값은 여기 안 적는다** — 그것이 위 문단의 요지다.
 */
describe('재라 #11 — 깊은 테마 본문', () => {
  /** `patterns.<이름>.schema`를 `depth`만큼 중첩한 노드 트리로 만든다. */
  function deepPattern(depth: number): unknown {
    let node: Record<string, unknown> = { type: 'Text', props: { content: '끝' } }
    for (let i = 0; i < depth; i += 1) {
      node = { type: 'Section', children: [node] }
    }
    return {
      meta: { id: 'deep', name: '깊다', version: '1.0.0' },
      patterns: { 'content.deep': { name: '깊은 패턴', schema: node } },
    }
  }

  /**
   * **경계에서 먼 깊이 하나만 잰다**(위 머리말 「경계 가까운 깊이를 단언하지 않는다」). 사람이 쓰는 패턴의 중첩은 한 자릿수이고,
   * 이 깊이는 그것보다 훨씬 깊으면서 **찬 프로세스의 경계보다는 훨씬 얕다** — 재는 것은
   * *"재귀 스키마에 도달하는 본문이 정상 경로로 처리된다"*이지 경계의 위치가 아니다.
   */
  it('깊이 200은 500이 아니다 — 정상 경로로 처리된다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)
      const res = await post(ctx, project.id, owner.cookie, deepPattern(200))

      // 201이든 422든 상관없다 — **500이 아니라는 것**이 이 케이스가 재는 전부다.
      expect(res.statusCode).not.toBe(500)
      expect([201, 400, 422]).toContain(res.statusCode)
    })
  })
})

/**
 * **`meta.version`을 서버가 강제하는가.**
 *
 * 답: **강제하지 않는다. 저장 경계에서도 테마 규격과 같다.**
 *
 * 근거: 설계서 「테마 관리」가 *"`meta.version`을 기록한다"*까지만 말하고 형식을 주지 않으며,
 * 설계서 「스냅샷」이 스냅샷에 테마를 통째로 얼리므로 **복원이 버전 비교에 기대지 않는다.** 즉 이 값은
 * 사람이 읽는 표시이지 해석 대상이 아니다. semver를 강제하면 규격이 근거 없이 좁아진다.
 *
 * 저장 경계가 그것을 바꾸지 않는 이유: 저장은 값을 **나르기만** 한다. 서버가 이 값으로
 * 무엇을 판정하는 자리가 하나도 없으므로(마이그레이션도 낙관적 잠금도 이 값을 안 본다),
 * 형식을 요구하면 **아무것도 지키지 않으면서 사용자를 막는** 규칙이 된다.
 *
 * `pages`의 `schema_version`과 헷갈리지 말 것 — 그쪽은 마이그레이션이 해석하는 정수다.
 */
describe('meta.version', () => {
  it('semver가 아닌 값도 저장되고 그대로 왕복한다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)

      for (const version of ['1', '2026-08-10', '초안', 'v3 (검토중)']) {
        const res = await post(ctx, project.id, owner.cookie, {
          meta: { id: `v-${version.length}-${version.charCodeAt(0)}`, name: '버전', version },
        })
        expect(res.statusCode, version).toBe(201)
        expect(res.json().theme.meta.version, version).toBe(version)
      }
    })
  })

  it('빈 문자열은 거부한다 — 유일한 제약이다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)
      const res = await post(ctx, project.id, owner.cookie, {
        meta: { id: 'empty-version', name: '버전', version: '' },
      })
      // `MetaSchema`의 `z.string().min(1)`이 봉투에서 잡는다.
      expect(res.statusCode).toBe(400)
    })
  })

  it('버전을 바꿔도 서버가 아무것도 판정하지 않는다 — 낮춰도 저장된다', async () => {
    await withApi(async (ctx) => {
      const { owner, project } = await ownedProject(ctx)
      const created = (
        await post(ctx, project.id, owner.cookie, {
          meta: { id: 'downgrade', name: '내림', version: '9.0.0' },
        })
      ).json()

      const res = await ctx.app.inject({
        method: 'PUT',
        url: `/api/projects/${project.id}/themes/${created.id}`,
        cookies: owner.cookie,
        payload: { theme: { meta: { id: 'downgrade', name: '내림', version: '0.0.1' } } } as never,
      })
      expect(res.statusCode).toBe(200)
      expect(res.json().theme.meta.version).toBe('0.0.1')
    })
  })
})
