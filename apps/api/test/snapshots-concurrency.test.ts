/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `revisions-concurrency.test.ts`·
 * `comments-concurrency.test.ts`와 같은 부류이고, 그 파일들의 머리말이 근거·격리·주의를
 * 이미 적어 두었다(요지: `withApi`는 테스트 하나를 커넥션 하나·트랜잭션 하나로 감싸므로
 * **서로 다른 커넥션이 실제로 커밋해야만 검증되는 성질**을 잴 수 없다).
 *
 * ---
 *
 * # 여기서만 잴 수 있는 것 — 지문 확인이 막으려는 그 경합
 *
 * `snapshot-capture.test.ts`는 `withApi` 안에서 훅으로 편집을 끼워 넣는다. 그것으로
 * *"수집 도중 무언가 바뀌면 지문이 다르다"*는 잡히지만, **그 편집은 같은 커넥션·같은
 * 트랜잭션의 것**이라 READ COMMITTED의 실제 위험(다른 커넥션이 **커밋한** 결과가 수집
 * 중간에 보이기 시작하는 것)을 재지 못한다.
 *
 * 이 파일은 앱을 **풀 핸들**로 세워 캡처의 SELECT들이 각자 자동 커밋으로 돌게 하고,
 * 수집 한가운데에서 **다른 요청이 실제로 커밋**하게 만든다. 그 상태가 곧 운영이다.
 *
 * ---
 *
 * # 무엇이 "한 시점에 존재한 적 없는 payload"인가 — 이 파일이 고르는 시나리오
 *
 * 수집 순서는 `menu → pages → [여기] → layouts → comments`다. 끼어드는 편집을
 * **페이지 뒤·코멘트 앞**에 두면 이렇게 갈린다:
 *
 * | payload의 값 | 언제의 것인가 |
 * |---|---|
 * | `pages[X].headSeq` = 0, 문서에 `marker` 없음 | 코멘트가 **달리기 전** |
 * | `comments` = 그 코멘트 한 줄 | 코멘트가 **달린 뒤** |
 *
 * 설계서 「페이지 스키마 노드」가 *"없으면 코멘트 없음"*이라고 적었으므로 **그 조합은 성립한 적이 없다** —
 * 코멘트가 존재한 순간 그 노드에는 이미 번호가 있었고 `head_seq`는 1이었다. 지문 확인을
 * 지우면 그 payload가 **실제로 저장된다**(아래 케이스가 그 값을 확인한다).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { snapshotRoutes } from '../src/routes/snapshots'
import { captureSnapshot } from '../src/services/snapshot-capture'
import {
  createMenuNode,
  createPage,
  createProject,
  getTestDb,
  resetRealData,
  signup,
  withRealApi,
  type CreatedMenuNode,
  type CreatedPage,
  type CreatedProject,
  type SignedUpUser,
  type TestContext,
} from './helpers'

/** 이 파일은 하네스가 아니라 풀 핸들을 직접 쓴다. 파일이 끝나면 `setup.ts`의 `afterAll`이 닫는다. */
const db = getTestDb()

// 청소도 하네스도 `helpers.ts`에 있다. `projects` 삭제가 `snapshots`(CASCADE)·
// `menu_nodes`·`pages`·`comments`까지 데려간다.
beforeEach(resetRealData)
afterEach(resetRealData)

interface Fixture {
  owner: SignedUpUser
  project: CreatedProject
  menu: CreatedMenuNode
  page: CreatedPage
  nodeId: string
}

async function setup(ctx: TestContext): Promise<Fixture> {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '설정' })
  const page = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '사용자 목록' })
  return { owner, project, menu, page, nodeId: (page.schema as { root: { id: string } }).root.id }
}

/**
 * **수집 한가운데에서 끼어들 훅을 문 라우트**를 다른 prefix로 함께 등록한 실커밋 앱.
 *
 * 앱을 세우고 닫는 부분은 `helpers.ts`의 `withRealApi`가 한다 — 이 파일이 갖는 것은
 * **프로브 라우트를 얹는 이음매**뿐이고, 그것은 하네스가 아니라 이 파일의 것이다.
 *
 * **훅을 참조로 늦게 채운다.** Fastify 5는 부팅 뒤의 라우트 등록을 거부하므로
 * (`Root plugin has already booted`) 등록이 픽스처보다 먼저여야 하는데, 훅이 필요로 하는
 * 값은 그 픽스처가 만든다.
 */
async function withProbeApi(fn: (ctx: TestContext, setInterrupt: (run: () => Promise<void>) => void) => Promise<void>): Promise<void> {
  let interrupt: (() => Promise<void>) | undefined
  await withRealApi(
    async (ctx) => {
      await fn(ctx, (run) => {
        interrupt = run
      })
    },
    {
      register: async (app) => {
        await app.register(snapshotRoutes({ captureHooks: { afterPages: async () => interrupt?.() } }), {
          prefix: '/probe/projects',
        })
      },
    },
  )
}

/** 페이지의 루트 노드에 코멘트를 단다. **실제로 커밋된다** — 이 파일의 앱은 풀 핸들 위에 산다. */
async function addComment(ctx: TestContext, fx: Fixture, body: string): Promise<void> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${fx.project.id}/pages/${fx.page.id}/comments`,
    cookies: fx.owner.cookie,
    payload: { nodeId: fx.nodeId, body },
  })
  if (res.statusCode !== 201) throw new Error(`끼어들기 실패 (${res.statusCode}): ${res.body}`)
}

async function snapshotCount(projectId: string): Promise<number> {
  const row = await db
    .selectFrom('snapshots')
    .select((eb) => eb.fn.countAll<string>().as('count'))
    .where('project_id', '=', projectId)
    .executeTakeFirstOrThrow()
  return Number(row.count)
}

describe('수집 도중 다른 커넥션이 커밋한다', () => {
  it('아무도 끼어들지 않으면 201이다 — 음성 대조', async () => {
    await withProbeApi(async (ctx) => {
      const fx = await setup(ctx)

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/probe/projects/${fx.project.id}/snapshots`,
        cookies: fx.owner.cookie,
        payload: { tag: 'v1' },
      })

      expect(res.statusCode).toBe(201)
      expect(await snapshotCount(fx.project.id)).toBe(1)
    })
  })

  it('수집 한가운데의 커밋을 409로 끝낸다', async () => {
    await withProbeApi(async (ctx, setInterrupt) => {
      const fx = await setup(ctx)
      setInterrupt(() => addComment(ctx, fx, '끼어든 코멘트'))

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/probe/projects/${fx.project.id}/snapshots`,
        cookies: fx.owner.cookie,
        payload: { tag: 'v1' },
      })

      expect(res.statusCode).toBe(409)
      expect((res.json() as { error: { message: string } }).error.message).toContain('다시 시도')
      // **되돌릴 것이 없다** — 캡처는 읽기뿐이고 삽입은 그 뒤다.
      expect(await snapshotCount(fx.project.id)).toBe(0)
    })
  })

  /**
   * **끼어든 편집이 실제로 커밋됐는지부터 확인한다.** 이것이 없으면 위 케이스가
   * *"훅이 아무것도 안 했는데 지문이 우연히 달랐다"*로도 통과할 수 있다 — 측정 장치를
   * 먼저 의심하라는 그 자리다.
   */
  it('끼어든 편집이 다른 커넥션에서 실제로 커밋된다', async () => {
    await withProbeApi(async (ctx, setInterrupt) => {
      const fx = await setup(ctx)
      setInterrupt(() => addComment(ctx, fx, '끼어든 코멘트'))

      await ctx.app.inject({
        method: 'POST',
        url: `/probe/projects/${fx.project.id}/snapshots`,
        cookies: fx.owner.cookie,
        payload: { tag: 'v1' },
      })

      // 캡처 요청과 **무관한** 새 커넥션으로 읽는다. 보이면 커밋된 것이다.
      const rows = await db.selectFrom('comments').select('body').where('page_id', '=', fx.page.id).execute()
      expect(rows.map((row) => row.body)).toEqual(['끼어든 코멘트'])
      const page = await db.selectFrom('pages').select('head_seq').where('id', '=', fx.page.id).executeTakeFirstOrThrow()
      expect(Number(page.head_seq)).toBe(1)
    })
  })

  /**
   * **지문 확인이 없었다면 무엇이 저장됐을까.** 그 payload를 여기서 **직접 만들어 본다** —
   * `captureSnapshot`의 결과가 아니라, 수집 순서가 만드는 조합 자체를 값으로 보인다.
   *
   * 이 케이스는 프로덕션 코드를 고치지 않고도 그 조합을 보인다: 페이지를 먼저 읽고,
   * 그 사이 코멘트를 커밋하고, 코멘트를 나중에 읽는다. **두 값이 함께 참인 시점이 없다.**
   */
  it('지문이 없으면 담겼을 조합 — 그 두 값이 함께 참인 시점이 없다', async () => {
    await withProbeApi(async (ctx) => {
      const fx = await setup(ctx)

      // 1. 페이지를 읽는다(코멘트 전).
      const before = await db.selectFrom('pages').select(['head_seq', 'schema']).where('id', '=', fx.page.id).executeTakeFirstOrThrow()

      // 2. 다른 요청이 코멘트를 커밋한다.
      await addComment(ctx, fx, '끼어든 코멘트')

      // 3. 코멘트를 읽는다(코멘트 후).
      const comments = await db.selectFrom('comments').select('id').where('page_id', '=', fx.page.id).execute()

      // 1과 3이 한 payload에 담기면: 문서에는 번호가 없는데 코멘트는 하나다.
      expect(Number(before.head_seq)).toBe(0)
      expect((before.schema as { root: { marker?: number } }).root.marker).toBeUndefined()
      expect(comments).toHaveLength(1)

      // **그 조합은 성립한 적이 없다** — 코멘트가 존재한 순간 번호는 이미 붙어 있었다(설계서 「페이지 스키마 노드」).
      const after = await db.selectFrom('pages').select(['head_seq', 'schema']).where('id', '=', fx.page.id).executeTakeFirstOrThrow()
      expect(Number(after.head_seq)).toBe(1)
      expect((after.schema as { root: { marker?: number } }).root.marker).toBe(1)
    })
  })

  /**
   * **지문 확인이 실제로 그 조합을 막는다.** 위 케이스가 *"그런 조합이 만들어질 수 있다"*를
   * 보였다면, 이것은 *"캡처가 그것을 내놓지 않는다"*를 본다 — 캡처를 직접 불러 결과를 본다.
   */
  it('같은 끼어들기에서 캡처는 payload를 내놓지 않는다', async () => {
    await withProbeApi(async (ctx) => {
      const fx = await setup(ctx)

      const outcome = await captureSnapshot(db, fx.project.id, {
        afterPages: () => addComment(ctx, fx, '끼어든 코멘트'),
      })

      expect(outcome.kind).toBe('fingerprint-mismatch')
    })
  })
})
