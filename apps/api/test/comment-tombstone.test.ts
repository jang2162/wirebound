/**
 * **코멘트 묘비**(`0013-comment-tombstones` — 이월 AC′, 2026-09-23). 게시가 «모름»인 사이 그 행이
 * 지워지면 같은 키 재전송이 **되살렸다** — 키가 행에 살아 행과 함께 사라졌기 때문이다. 이제 지운 행의
 * 키를 서버가 기억하고, 같은 키가 다시 오면 새 행을 세우지 않고 409 + 이슈 코드
 * `idempotency-key-deleted`로 답한다(`routes/comments.ts`의 `DELETED_KEY`).
 *
 * | 케이스 | 무엇을 잠그나 | 혼자 죽는 변조 |
 * |---|---|---|
 * | 제 손 · 남의 손 | 라우트 `DELETE`가 묘비를 남기고, 지운 사람에 상관없이 같은 답이다 | **없다** — 라우트가 `deleteComment`를 안 지나게 하면 이것과 «강등» · «복원이 되살림» · «수명»이 함께 죽는다. **그 축(라우트 삭제가 묘비를 남긴다)의 주인이 이 케이스다** — 나머지 셋은 라우트 삭제를 준비로만 쓰고 각자 제 변조가 있다 |
 * | 범위 | 묘비의 범위는 (페이지, 작성자, 키) — 남 · 새 키는 막지 않는다 | 묘비 조회에서 작성자를 뺀다 |
 * | 복원이 지움 | 복원의 `delete-comment`도 묘비를 남긴다 | 복원이 `deleteComment` 대신 맨 `DELETE`를 쓴다 |
 * | 복원이 되살림 | 지운 행을 복원이 **같은 id 로** 되살리면 키가 돌아와 재생 200 | `insertCommentWithId`가 키를 안 되붙인다 |
 * | 강등 | 묘비 판정도 가드 앞 — 권한을 잃어도 409 | 가드 앞의 묘비 조회를 뺀다(잠금 안의 것이 있어 다른 케이스는 산다) |
 * | 수명 | 묘비가 페이지 · 프로젝트 삭제를 막지 않고 함께 간다 · 재전송은 404 | `page_id`의 FK 를 뺀다(묘비가 남는다). FK 를 `RESTRICT`로 두면 하네스 청소까지 깨져 13 건이 함께 죽는다 |
 * | 동시성 | 첫 게시가 쥐인 채 다시 보낸 것이 줄을 서고, 그 사이 커밋 · 삭제가 끼면 잠금 안에서 묘비를 본다 | 잠금 안의 묘비 조회를 뺀다 |
 *
 * 묘비를 아예 안 남기면(`deleteComment`의 CTE 에서 `where false`) «범위»를 뺀 여섯이 함께 죽는다.
 *
 * ⚠️ 동시성 판은 `withRealApi`라 테스트 DB 에 **실제로 커밋한다**(`comments-concurrency.test.ts`의 머리말).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { withTransaction } from '../src/db/tx'
import { deleteComment, findCommentByIdempotencyKey } from '../src/repos/comments'
import { lockPageForEdit } from '../src/repos/pages'
import {
  addMember,
  createMenuNode,
  createPage,
  createProject,
  getTestDb,
  resetRealData,
  signup,
  withApi,
  withRealApi,
  type SignedUpUser,
  type TestContext,
} from './helpers'
import { sql } from 'kysely'

const db = getTestDb()

interface Fixture {
  owner: SignedUpUser
  projectId: string
  pageId: string
  nodeId: string
}

async function setup(ctx: TestContext): Promise<Fixture> {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const menu = await createMenuNode(ctx, owner.cookie, project.id)
  const page = await createPage(ctx, owner.cookie, project.id, menu.id)
  return {
    owner,
    projectId: project.id,
    pageId: page.id,
    nodeId: (page.schema as { root: { id: string } }).root.id,
  }
}

function commentsUrl(fx: Fixture): string {
  return `/api/projects/${fx.projectId}/pages/${fx.pageId}/comments`
}

function postKeyed(ctx: TestContext, fx: Fixture, body: string, key: string, cookie = fx.owner.cookie) {
  return ctx.app.inject({
    method: 'POST',
    url: commentsUrl(fx),
    cookies: cookie,
    payload: { nodeId: fx.nodeId, body, idempotencyKey: key },
  })
}

function remove(ctx: TestContext, fx: Fixture, commentId: string, cookie = fx.owner.cookie) {
  return ctx.app.inject({ method: 'DELETE', url: `${commentsUrl(fx)}/${commentId}`, cookies: cookie })
}

async function bodies(ctx: TestContext, fx: Fixture): Promise<string[]> {
  const res = await ctx.app.inject({ method: 'GET', url: commentsUrl(fx), cookies: fx.owner.cookie })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { body: string }[]).map((row) => row.body)
}

const DELETED_ISSUE = {
  path: 'idempotencyKey',
  message: '같은 멱등 키로 달린 코멘트가 그 뒤 지워졌습니다',
  code: 'idempotency-key-deleted',
}

/** 묘비 409 의 모양 — 같은 키 · 다른 글(`idempotency-key-reused`)과 **같은 꼴**이고 이슈 코드만 다르다. */
function expectDeleted(res: { statusCode: number; body: string; json: () => unknown }): void {
  expect(res.statusCode, res.body).toBe(409)
  const error = (res.json() as { error: { code: string; message: string; issues: unknown[] } }).error
  expect(error.code).toBe('conflict')
  expect(error.message).toBe(DELETED_ISSUE.message)
  expect(error.issues).toEqual([DELETED_ISSUE])
}

describe('지운 게시의 키 — 같은 키 재전송이 되살리지 않는다 (이월 AC′)', () => {
  it('제 손(다른 탭)으로 지워도 · 남이 지워도 같은 키 · 같은 글 → 409 idempotency-key-deleted · 행 0 — 문장은 누가 지웠는지 말하지 않는다', async () => {
    // 고치기 전 값: 둘 다 **201** · 지운 말이 새 id 로 다시 섰다. 제 손과 남의 손을 한 케이스에 둔다 — 서버에서 둘은
    // 같은 길(`DELETE` → `deleteComment`)이고, 답이 같아야 한다는 것(지운 사람을 단정하지 않는다)이 이 케이스의 몫이다.
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const bob = await signup(ctx)
      await addMember(ctx, fx.projectId, bob.user.id, 'editor')
      const mine = await postKeyed(ctx, fx, '내가 지울 말', 'key-1')
      const theirs = await postKeyed(ctx, fx, '밥이 지울 말', 'key-2')
      expect(mine.statusCode, mine.body).toBe(201)
      expect(theirs.statusCode, theirs.body).toBe(201)
      expect((await remove(ctx, fx, mine.json().comment.id)).statusCode).toBe(200)
      expect((await remove(ctx, fx, theirs.json().comment.id, bob.cookie)).statusCode).toBe(200)

      const selfDeleted = await postKeyed(ctx, fx, '내가 지울 말', 'key-1')
      const otherDeleted = await postKeyed(ctx, fx, '밥이 지울 말', 'key-2')

      expectDeleted(selfDeleted)
      expectDeleted(otherDeleted)
      expect(selfDeleted.body).toBe(otherDeleted.body)
      expect(await bodies(ctx, fx)).toEqual([])
    })
  })

  it('범위는 (페이지, 작성자, 키)다 — 남이 같은 키를 실어도 · 내가 새 키로 같은 글을 달아도 막지 않는다', async () => {
    // **양성 대조.** 묘비를 키만으로(작성자 없이) 보면 밥의 게시가 앨리스의 묘비에 걸린다 — 남의 키 하나로
    // 남의 게시를 막는 길이 된다(0012 의 범위 머리말과 같은 이유).
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const bob = await signup(ctx)
      await addMember(ctx, fx.projectId, bob.user.id, 'editor')
      const first = await postKeyed(ctx, fx, '지울 말', 'key-1')
      await remove(ctx, fx, first.json().comment.id)

      const bobs = await postKeyed(ctx, fx, '지울 말', 'key-1', bob.cookie)
      const fresh = await postKeyed(ctx, fx, '지울 말', 'key-2')

      expect(bobs.statusCode, bobs.body).toBe(201)
      expect(fresh.statusCode, fresh.body).toBe(201)
      expect(await bodies(ctx, fx)).toEqual(['지울 말', '지울 말'])
    })
  })

  it('강등된 뒤에도 409 — 묘비도 권한 가드 앞에서 본다(재생과 같은 자리)', async () => {
    // 가드 뒤에서만 보면 여기가 403 이다. 웹은 다시 보낸 것의 4xx 를 «안 달림»으로 확정해 초안을 연다 —
    // 권한을 되찾으면 같은 키가 그때 409 를 받으니 두 행은 안 되지만, «안 달림»은 거짓이다(달렸고 지워졌다).
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const bob = await signup(ctx)
      await addMember(ctx, fx.projectId, bob.user.id, 'editor')
      const first = await postKeyed(ctx, fx, '밥의 말', 'key-1', bob.cookie)
      await remove(ctx, fx, first.json().comment.id)
      const demoted = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.projectId}/members/${bob.user.id}`,
        cookies: fx.owner.cookie,
        payload: { role: 'viewer' },
      })
      expect(demoted.statusCode, demoted.body).toBe(200)

      const again = await postKeyed(ctx, fx, '밥의 말', 'key-1', bob.cookie)

      expectDeleted(again)
    })
  })
})

describe('지우는 길 전부 — 복원 · 페이지 · 프로젝트', () => {
  async function snapshot(ctx: TestContext, fx: Fixture, tag: string): Promise<string> {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/projects/${fx.projectId}/snapshots`,
      cookies: fx.owner.cookie,
      payload: { tag },
    })
    expect(res.statusCode, res.body).toBe(201)
    return res.json().id
  }

  async function restore(ctx: TestContext, fx: Fixture, snapshotId: string): Promise<void> {
    const res = await ctx.app.inject({
      method: 'POST',
      url: `/api/projects/${fx.projectId}/snapshots/${snapshotId}/restore`,
      cookies: fx.owner.cookie,
    })
    expect(res.statusCode, res.body).toBe(200)
  }

  it('복원이 그 행을 지우면(스냅샷 뒤에 달렸다) 같은 키 → 409 · 행 0', async () => {
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const before = await snapshot(ctx, fx, 'before')
      const first = await postKeyed(ctx, fx, '스냅샷 뒤에 단 말', 'key-1')
      expect(first.statusCode, first.body).toBe(201)
      await restore(ctx, fx, before)
      expect(await bodies(ctx, fx)).toEqual([])

      const again = await postKeyed(ctx, fx, '스냅샷 뒤에 단 말', 'key-1')

      expectDeleted(again)
      expect(await bodies(ctx, fx)).toEqual([])
    })
  })

  it('지운 행을 복원이 같은 id 로 되살리면 키도 돌아온다 — 같은 키 재전송은 재생 200 · 행 1', async () => {
    // 앞 판(`apps/api/README.md`의 «멱등 키» 복원 표 셋째 줄)은 되살린 행의 키가 `NULL`이라 201 · **두 행**이었다.
    // 묘비가 들어온 뒤 되붙이지 않으면 반대로 틀린다 — 행이 서 있는데 «그 뒤 지워졌습니다»(409).
    await withApi(async (ctx) => {
      const fx = await setup(ctx)
      const first = await postKeyed(ctx, fx, '되살아날 말', 'key-1')
      const withComment = await snapshot(ctx, fx, 'with-comment')
      await remove(ctx, fx, first.json().comment.id)
      await restore(ctx, fx, withComment)

      const again = await postKeyed(ctx, fx, '되살아날 말', 'key-1')

      expect(again.statusCode, again.body).toBe(200)
      expect(again.json().comment.id).toBe(first.json().comment.id)
      expect(await bodies(ctx, fx)).toEqual(['되살아날 말'])
    })
  })

  it('묘비의 수명은 페이지다 — 묘비가 선 페이지 · 프로젝트를 지우면 묘비도 함께 가고 재전송은 404', async () => {
    // 묘비는 페이지에 매인다(CASCADE — `0013`의 «수명»). 페이지가 없으면 재전송이 설 자리가 없어 묘비 없이도 이미
    // 404 다(고치기 전 값도 404). 여기서 잠그는 것은 **묘비가 페이지 · 프로젝트 삭제를 막지 않고 함께 간다**는 것이다.
    // 페이지 판과 프로젝트 판을 한 케이스에 둔다 — 같은 축(«가리킨 것이 없다»)이다.
    await withApi(async (ctx) => {
      // **`ctx.db`로 센다** — `withApi`는 케이스 전체가 트랜잭션 하나라 바깥 풀에서는 늘 0 이다(거짓 초록).
      const tombstones = async (pageId: string) =>
        (await ctx.db.selectFrom('comment_tombstones').select('comment_id').where('page_id', '=', pageId).execute()).length
      const fx = await setup(ctx)
      const first = await postKeyed(ctx, fx, '페이지와 함께 갈 말', 'key-1')
      expect(first.statusCode, first.body).toBe(201)
      const buried = await postKeyed(ctx, fx, '먼저 지운 말', 'key-0')
      await remove(ctx, fx, buried.json().comment.id)
      expect(await tombstones(fx.pageId)).toBe(1)
      const pageGone = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}`,
        cookies: fx.owner.cookie,
      })
      expect(pageGone.statusCode, pageGone.body).toBe(204)
      const afterPage = await postKeyed(ctx, fx, '페이지와 함께 갈 말', 'key-1')
      const buriedAfterPage = await postKeyed(ctx, fx, '먼저 지운 말', 'key-0')
      expect(afterPage.statusCode, afterPage.body).toBe(404)
      expect(buriedAfterPage.statusCode, buriedAfterPage.body).toBe(404)

      const other = await setup(ctx)
      const second = await postKeyed(ctx, other, '프로젝트와 함께 갈 말', 'key-2')
      expect(second.statusCode, second.body).toBe(201)
      const buriedToo = await postKeyed(ctx, other, '먼저 지운 말', 'key-0')
      await remove(ctx, other, buriedToo.json().comment.id)
      expect(await tombstones(other.pageId)).toBe(1)
      const projectGone = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${other.projectId}`,
        cookies: other.owner.cookie,
      })
      expect(projectGone.statusCode, projectGone.body).toBe(204)
      const afterProject = await postKeyed(ctx, other, '프로젝트와 함께 갈 말', 'key-2')
      expect(afterProject.statusCode, afterProject.body).toBe(404)
      expect(await tombstones(fx.pageId)).toBe(0)
      expect(await tombstones(other.pageId)).toBe(0)
    })
  })
})

/**
 * # 동시성 — 삭제가 첫 게시와 다시 보낸 것 **사이에** 낀다
 *
 * 다시 보낸 것이 가드 앞에서 아무것도 못 보는 판은 **첫 게시가 아직 커밋 중일 때**뿐이다(커밋됐으면 행이나
 * 묘비가 보인다). 그 판을 세운다: 페이지 행을 쥔 채 첫 게시 → 삭제자 → 다시 보낸 것 순으로 줄을 세우고 푼다.
 * 첫 게시가 커밋하고, 삭제자가 잠금을 잡아 **진짜 `deleteComment`로** 그 행을 지우고 커밋한 뒤, 다시 보낸 것이
 * 잠금을 잡는다 — 잠금 안에서 묘비를 안 보면 여기서 새 행을 세운다(201).
 *
 * **잠금 순서**: 셋 다 페이지 행(`lockPageForEdit` — `FOR UPDATE`)을 먼저 잡고, 삭제자는 그 안에서 코멘트 행을
 * 지우며 묘비를 넣는다(한 문장). 다시 보낸 것은 페이지 행 → 코멘트 조회 → 묘비 조회 순이라 삭제 트랜잭션과
 * 같은 페이지 행에서 줄을 선다 — 둘이 겹칠 수 없다. `guard-in-lock.test.ts`의 «커밋 중 틈» 셋째 판과 같은
 * 줄 세우기다(페이지 행의 잠금 대기열은 도착 순이다).
 */
describe('동시성 — 삭제가 첫 게시와 다시 보낸 것 사이에 낀다', () => {
  beforeEach(resetRealData)
  afterEach(resetRealData)

  async function waitForLockWaiter(atLeast: number, timeoutMs = 5_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      const result = await sql<{ n: number }>`
        select count(*)::int as n
          from pg_locks l
          join pg_stat_activity a on a.pid = l.pid
         where not l.granted
           and a.datname = current_database()
      `.execute(db)
      if ((result.rows[0]?.n ?? 0) >= atLeast) return
      await new Promise((resolve) => setTimeout(resolve, 10))
    }
    throw new Error('잠금을 기다리는 트랜잭션이 나타나지 않았습니다 — 시나리오가 성립하지 않았습니다')
  }

  /** 페이지 행을 잡고, 잡은 뒤 `then`을 돌리고 커밋한다. 잡을 때까지 기다리지 않는다. */
  function queueOnPage(fx: Fixture, then: (trx: typeof db) => Promise<void>) {
    let markAcquired: () => void = () => {}
    const acquired = new Promise<void>((resolve) => {
      markAcquired = resolve
    })
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const done = withTransaction(db, async (trx) => {
      const page = await lockPageForEdit(trx, fx.projectId, fx.pageId)
      if (!page) throw new Error('잡을 페이지가 없습니다')
      markAcquired()
      await held
      await then(trx)
    })
    return { acquired: Promise.race([acquired, done]), release: () => (release(), done) }
  }

  it('첫 게시 커밋 → 삭제 커밋 → 다시 보낸 것 — 잠금 안에서 묘비를 보고 409 · 남은 행은 먼저 있던 것 하나', async () => {
    // **그 노드에 번호가 이미 있게 둔다** — 없으면 첫 게시가 번호를 붙여 `head_seq`를 올리고, 다시 보낸 것은 묘비를
    // 안 봐도 낡음(`stale`) 409 에 우연히 걸린다(고치기 전 값이 그랬다). 번호가 있으면 게시가 문서를 안 바꿔 낡음이
    // 안 걸리고, 잠금 안의 묘비 조회 **하나만** 새 행을 막는다.
    await withRealApi(async (ctx) => {
      const fx = await setup(ctx)
      const earlier = await ctx.app.inject({
        method: 'POST',
        url: commentsUrl(fx),
        cookies: fx.owner.cookie,
        payload: { nodeId: fx.nodeId, body: '먼저 있던 말' },
      })
      expect(earlier.statusCode, earlier.body).toBe(201)
      const hold = queueOnPage(fx, async () => {})
      await hold.acquired
      let first: ReturnType<typeof postKeyed> | undefined
      let resent: ReturnType<typeof postKeyed> | undefined
      let deleter: ReturnType<typeof queueOnPage> | undefined
      try {
        first = postKeyed(ctx, fx, '쥐인 게시', 'key-1')
        await waitForLockWaiter(1)
        deleter = queueOnPage(fx, async (trx) => {
          const row = await findCommentByIdempotencyKey(trx, fx.pageId, fx.owner.user.id, 'key-1')
          if (row === null) throw new Error('첫 게시가 커밋되지 않았다 — 판이 성립하지 않았다')
          expect(await deleteComment(trx, fx.pageId, row.id)).not.toBe('not-found')
        })
        deleter.release()
        await waitForLockWaiter(2)
        resent = postKeyed(ctx, fx, '쥐인 게시', 'key-1')
        await waitForLockWaiter(3)
      } finally {
        await hold.release()
      }
      const committed = await first
      await deleter.release()
      const answer = await resent
      if (committed === undefined || answer === undefined) throw new Error('판이 서지 않았다')

      expect(committed.statusCode, committed.body).toBe(201)
      expectDeleted(answer)
      const rows = await db.selectFrom('comments').select('body').where('page_id', '=', fx.pageId).execute()
      expect(rows.map((row) => row.body)).toEqual(['먼저 있던 말'])
    })
  }, 60_000)
})
