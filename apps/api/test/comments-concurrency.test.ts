/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다** — `revisions-concurrency.test.ts`와 같은
 * 배치이고 그 파일 머리말에 격리·`singleFork`의 근거가 길게 적혀 있다. 요지만 옮기면:
 * `withApi`는 테스트 하나를 커넥션 하나·트랜잭션 하나에서 돌리므로 `Promise.all`로
 * 요청을 겹쳐도 전부 직렬화된다 — **행 잠금이 있든 없든 똑같이 통과하는 테스트**가 된다.
 *
 * 여기 있는 것은 **리뷰가 실측한 결함 둘**을 고정하는 케이스다.
 *
 * | 리뷰 | 무엇 | 이 파일의 케이스 |
 * |---|---|---|
 * | **B5** | 서로 다른 노드의 마지막 코멘트를 동시에 지우면 **진 쪽이 409를 받는데 행 삭제는 커밋된다** | `409를 받은 삭제는 행을 남기지 않는다` |
 * | **B3** | 같은 노드의 마지막 둘을 동시에 지우면 둘 다 *"마지막이 아니다"*로 판정해 **고아 번호**가 남는다 | `같은 노드의 마지막 둘을 동시에 지우면 번호가 사라진다` |
 *
 * **B5가 무거운 이유는 상태 코드가 아니다** — *"실패했다고 말하는데 조작은 일어났다"*가
 * 성립하기 때문이고, 그것이 이 저장소가 반복해 겪은 부류다(P4c-3 이월 2번).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { migrateDocument, type PageDocument } from '@wirebound/schema'
import { buildApp } from '../src/app'
import {
  createMenuNode,
  createPage,
  createProject,
  getTestDb,
  signup,
  testConfig,
  type CreatedProject,
  type SignedUpUser,
  type TestContext,
} from './helpers'

const db = getTestDb()

async function reset(): Promise<void> {
  await db.deleteFrom('projects').execute()
  await db.deleteFrom('users').execute()
}

beforeEach(reset)
afterEach(reset)

async function withRealApi(fn: (ctx: TestContext) => Promise<void>): Promise<void> {
  const app: FastifyInstance = await buildApp({ db, config: testConfig() })
  try {
    await fn({ app, db })
  } finally {
    await app.close()
  }
}

interface Fixture {
  owner: SignedUpUser
  project: CreatedProject
  pageId: string
}

/** 노드 둘을 가진 페이지. 서로 다른 노드에 코멘트를 달아야 하는 케이스가 필요로 한다. */
async function setup(ctx: TestContext): Promise<Fixture> {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const menu = await createMenuNode(ctx, owner.cookie, project.id)
  const page = await createPage(ctx, owner.cookie, project.id, menu.id)

  const put = await ctx.app.inject({
    method: 'PUT',
    url: `/api/projects/${project.id}/pages/${page.id}/schema`,
    cookies: owner.cookie,
    payload: {
      schema: {
        version: 1,
        root: {
          id: 'n_root',
          type: 'Page',
          children: [
            { id: 'n_a', type: 'Text', props: { content: '가' } },
            { id: 'n_b', type: 'Text', props: { content: '나' } },
          ],
        },
      },
    },
  })
  expect(put.statusCode, put.body).toBe(200)

  return { owner, project, pageId: page.id }
}

function commentsUrl(fx: Fixture): string {
  return `/api/projects/${fx.project.id}/pages/${fx.pageId}/comments`
}

async function postComment(ctx: TestContext, fx: Fixture, nodeId: string, body = '말'): Promise<string> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: commentsUrl(fx),
    cookies: fx.owner.cookie,
    payload: { nodeId, body },
  })
  expect(res.statusCode, res.body).toBe(201)
  return res.json().comment.id
}

function deleteComment(ctx: TestContext, fx: Fixture, commentId: string) {
  return ctx.app.inject({
    method: 'DELETE',
    url: `${commentsUrl(fx)}/${commentId}`,
    cookies: fx.owner.cookie,
  })
}

async function schemaOf(pageId: string): Promise<PageDocument> {
  const row = await db.selectFrom('pages').select('schema').where('id', '=', pageId).executeTakeFirstOrThrow()
  return migrateDocument(row.schema)
}

/** 저장된 문서에서 노드 하나의 `marker`. 노드가 없으면 `'없는 노드'`다. */
function markerOf(document: PageDocument, nodeId: string): number | undefined | '없는 노드' {
  const found = [document.root, ...(document.root.children ?? [])].find((node) => node.id === nodeId)
  return found === undefined ? '없는 노드' : found.marker
}

async function commentCount(pageId: string): Promise<number> {
  const rows = await db.selectFrom('comments').select('id').where('page_id', '=', pageId).execute()
  return rows.length
}

/** 상태 코드를 오름차순으로. `Promise.all`의 완료 순서에 기대지 않는다. */
function sorted(codes: number[]): number[] {
  return codes.slice().sort((a, b) => a - b)
}

describe('코멘트 삭제의 동시성', () => {
  it('409를 받은 삭제는 행을 남기지 않는다 (리뷰 B5)', async () => {
    // **이 케이스가 B5의 전부다.** 서로 다른 노드의 마지막 코멘트를 동시에 지우면 둘 다
    // 번호를 지우려 하고, 진 쪽은 `stale`로 409를 받는다. **그때 그쪽의 행 삭제가
    // 커밋되어 있으면 안 된다** — 사용자는 실패를 들었는데 코멘트는 사라진 상태다.
    await withRealApi(async (ctx) => {
      const fx = await setup(ctx)
      const a = await postComment(ctx, fx, 'n_a', '가에 붙은 말')
      const b = await postComment(ctx, fx, 'n_b', '나에 붙은 말')
      expect(await commentCount(fx.pageId)).toBe(2)

      const [resA, resB] = await Promise.all([deleteComment(ctx, fx, a), deleteComment(ctx, fx, b)])

      // 하나는 이기고 하나는 409다 — 어느 쪽이 이기는지는 정해져 있지 않다.
      expect(sorted([resA.statusCode, resB.statusCode])).toEqual([200, 409])

      // **핵심 단언:** 진 쪽의 행이 살아 있어야 한다. 되돌리지 않으면 여기가 0이 된다.
      expect(await commentCount(fx.pageId)).toBe(1)

      // 그리고 문서도 일관된다 — 이긴 쪽의 번호만 사라지고 진 쪽의 번호는 남는다.
      const document = await schemaOf(fx.pageId)
      const markers = [markerOf(document, 'n_a'), markerOf(document, 'n_b')]
      expect(markers.filter((marker) => marker !== undefined)).toHaveLength(1)
    })
  })

  it('같은 노드의 마지막 둘을 동시에 지우면 번호가 사라진다 (리뷰 B3)', async () => {
    // 잠금이 없으면 둘 다 *"아직 하나 남았다"*로 판정해 **고아 번호**가 남는다 —
    // 코멘트는 없는데 캔버스에 번호가 뜬다(재라 #6이 미리 물어 둔 상태).
    await withRealApi(async (ctx) => {
      const fx = await setup(ctx)
      const first = await postComment(ctx, fx, 'n_a', '첫째')
      const second = await postComment(ctx, fx, 'n_a', '둘째')
      expect(markerOf(await schemaOf(fx.pageId), 'n_a')).toBe(1)

      const [resA, resB] = await Promise.all([
        deleteComment(ctx, fx, first),
        deleteComment(ctx, fx, second),
      ])

      // **둘 다 성공한다.** 앞의 삭제는 문서를 안 바꾸므로 `head_seq`가 그대로이고,
      // 그래서 뒤의 삭제가 `stale`에 걸리지 않는다 — 잠금이 순서를 만들 뿐이다.
      expect(sorted([resA.statusCode, resB.statusCode])).toEqual([200, 200])
      expect(await commentCount(fx.pageId)).toBe(0)

      // **핵심 단언:** 마지막을 지운 쪽이 번호를 지웠다.
      expect(markerOf(await schemaOf(fx.pageId), 'n_a')).toBeUndefined()
    })
  })

  it('마지막 코멘트를 지우는 동안 같은 노드에 새 코멘트가 들어와도 번호가 남는다', async () => {
    // 반대 방향의 경합. 잠금이 없으면 삭제가 *"0개 남았다"*로 세고 번호를 지우는데,
    // 그 사이 들어온 코멘트는 **번호 없는 코멘트**가 된다.
    await withRealApi(async (ctx) => {
      const fx = await setup(ctx)
      const only = await postComment(ctx, fx, 'n_a', '지울 말')

      const [del, post] = await Promise.all([
        deleteComment(ctx, fx, only),
        ctx.app.inject({
          method: 'POST',
          url: commentsUrl(fx),
          cookies: fx.owner.cookie,
          payload: { nodeId: 'n_a', body: '새 말' },
        }),
      ])

      const document = await schemaOf(fx.pageId)
      const rows = await commentCount(fx.pageId)

      // **성립해선 안 되는 상태 하나를 못박는다: 코멘트가 있는데 번호가 없다.**
      // 어느 쪽이 이기든(둘 다 200이든, 한쪽이 409든) 이 관계는 지켜져야 한다.
      if (rows > 0) {
        expect(markerOf(document, 'n_a')).toBe(1)
      }
      // 반대쪽도 못박는다: 코멘트가 하나도 없는데 번호만 남지 않는다.
      if (rows === 0) {
        expect(markerOf(document, 'n_a')).toBeUndefined()
      }
      // 두 요청이 500을 내지는 않는다 — 잠금 대기는 실패가 아니다.
      expect([200, 201, 409]).toContain(del.statusCode)
      expect([200, 201, 409]).toContain(post.statusCode)
    })
  })

  it('서로 다른 노드의 첫 코멘트를 동시에 달면 번호가 겹치지 않는다', async () => {
    // 재라 #1의 근거를 실측으로 고정한다 — `baseSeq`를 잠그기 **전에** 읽는 것이
    // 낙관적 잠금으로 서는 이유다. 잠근 뒤에 읽으면 둘 다 1번을 받는다.
    await withRealApi(async (ctx) => {
      const fx = await setup(ctx)

      const post = (nodeId: string) =>
        ctx.app.inject({
          method: 'POST',
          url: commentsUrl(fx),
          cookies: fx.owner.cookie,
          payload: { nodeId, body: `${nodeId}의 말` },
        })

      const [a, b] = await Promise.all([post('n_a'), post('n_b')])

      expect(sorted([a.statusCode, b.statusCode])).toEqual([201, 409])

      const document = await schemaOf(fx.pageId)
      const markers = [markerOf(document, 'n_a'), markerOf(document, 'n_b')].filter(
        (marker): marker is number => typeof marker === 'number',
      )
      // 성공한 쪽 하나만 번호를 갖는다. **둘 다 1번을 받는 일이 없다.**
      expect(markers).toEqual([1])
    })
  })
})
