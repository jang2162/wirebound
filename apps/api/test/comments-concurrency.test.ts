/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다** — `revisions-concurrency.test.ts`와 같은
 * 배치이고 그 파일 머리말에 격리·`singleFork`의 근거가 길게 적혀 있다. 요지만 옮기면:
 * `withApi`는 테스트 하나를 커넥션 하나·트랜잭션 하나에서 돌리므로 `Promise.all`로
 * 요청을 겹쳐도 전부 직렬화된다 — **행 잠금이 있든 없든 똑같이 통과하는 테스트**가 된다.
 *
 * 여기 있는 것은 **동시 삭제에서 조용히 나는 결함 둘**을 잠그는 케이스다.
 *
 * | 경합 | 무엇 | 이 파일의 케이스 |
 * |---|---|---|
 * | **다른 노드** | 서로 다른 노드의 마지막 코멘트를 동시에 지우면 **진 쪽이 409를 받는데 행 삭제는 커밋된다** | `409를 받은 삭제는 행을 남기지 않는다` |
 * | **같은 노드** | 같은 노드의 마지막 둘을 동시에 지우면 둘 다 *"마지막이 아니다"*로 판정해 **고아 번호**가 남는다 | `같은 노드의 마지막 둘을 동시에 지우면 번호가 사라진다` |
 * | **첫 코멘트** | 게시가 잠그기 전의 문서로 번호를 매기면 서로 다른 노드의 첫 코멘트가 둘 다 1번이거나(낡음으로 막으면 한쪽 409), 앞의 삭제가 없앤 번호를 못 봐 **번호 없는 코멘트**가 선다 | `서로 다른 노드의 첫 코멘트를 동시에 달면 …` · `마지막 코멘트의 삭제가 먼저 줄 선 뒤 …` |
 *
 * **다른 노드 줄이 무거운 이유는 상태 코드가 아니다** — *"실패했다고 말하는데 조작은 일어났다"*가
 * 성립하기 때문이고, 그것은 조용히 되풀이되는 부류다.
 */
import { sql } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { migrateDocument, type PageDocument } from '@wirebound/schema'
import { withTransaction } from '../src/db/tx'
import {
  createMenuNode,
  createPage,
  createProject,
  getTestDb,
  resetRealData,
  signup,
  withRealApi,
  type CreatedProject,
  type SignedUpUser,
  type TestContext,
} from './helpers'

const db = getTestDb()

// 청소도 하네스도 `helpers.ts`에 있다.
beforeEach(resetRealData)
afterEach(resetRealData)

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

/** 잠금을 못 받고 기다리는 백엔드 수 — 질의의 까닭은 `revisions-concurrency.test.ts`의 `waitForLockWaiter` 머리말. */
async function lockWaiters(): Promise<number> {
  const result = await sql<{ n: number }>`
    select count(distinct l.pid)::int as n
      from pg_locks l
      join pg_stat_activity a on a.pid = l.pid
     where not l.granted
       and a.datname = current_database()
  `.execute(db)
  return result.rows[0]?.n ?? 0
}

/**
 * **쥔 백엔드(`holder`) 뒤에 사슬로 선 백엔드 수.** 첫 대기자는 쥔 쪽을 직접 기다리고, 같은 행의 둘째부터는 앞 대기자가 쥔
 * 튜플 잠금을 기다린다 — 그래서 `pg_blocking_pids` 를 쥔 쪽에서부터 따라간다. 쥔 쪽은 그 행 하나만 잡고 기다리므로 이 사슬이
 * 곧 그 행의 줄이다(사슬을 떼고 직접 막힌 것만 세면 B5 의 둘째 요청이 안 세어져 던진다). DB 전체의 «못 받은 잠금»
 * (`lockWaiters`)으로 세면 다른 행 · 다른 잠금에서 기다리는 백엔드까지 줄로 읽는다.
 *
 * **못 가르는 것:** 대기자가 그 행과 무관한 잠금을 먼저 쥐고 섰고 다른 요청이 **그 잠금**을 기다리면, 그 요청도 사슬에 든다.
 * 쥔 쪽 뒤에 **표 잠금**(DDL · `LOCK TABLE`)이 서면 그 뒤의 모든 대기가 — 다른 행 · 다른 문장이어도 — 사슬에 든다.
 */
async function waitersBehind(holder: number): Promise<number> {
  const result = await sql<{ n: number }>`
    with recursive chain(pid) as (
      select a.pid from pg_stat_activity a where ${holder}::int = any(pg_blocking_pids(a.pid))
      union
      select a.pid from pg_stat_activity a join chain c on c.pid = any(pg_blocking_pids(a.pid))
    )
    select count(*)::int as n from chain
  `.execute(db)
  return result.rows[0]?.n ?? 0
}

/**
 * 페이지 행을 테스트 트랜잭션으로 쥔 채 `run`을 시작하고, **요청 `waiters`개가 그 행에서 줄을 선 것을 본 뒤에** 놓는다.
 *
 * 코멘트 삭제는 `baseSeq`를 잠그기 **전에** 읽는다(`routes/comments.ts` 머리말의 «대가 2»). 요청 둘을 `Promise.all`로
 * 던지기만 하면 앞 요청이 커밋을 마친 뒤에 뒤 요청이 `head_seq`를 읽는 판이 생기고, 그 판에서는 둘 다 200 인 것이
 * **옳은 동작**이다 — 경합을 재는 케이스가 경합 없이 빨개진다(DB 컨테이너에 CPU 부하를 걸고 B5 를 되풀이하면 드물게 난다).
 * 둘 다 행에서 기다리는 것을 봤으면 둘 다 그 전에 `baseSeq`를 읽었다 — 겹침이 성립한다.
 *
 * **줄이 안 서면 던진다** — 겹치지 않은 판을 초록 · 빨강 어느 쪽으로도 세지 않는다. 그때도 요청은 끝까지 기다린다.
 */
async function withPageRowHeld<T>(pageId: string, waiters: number, run: () => Promise<T>, timeoutMs = 5_000): Promise<T> {
  const holder = await holdPageRow(pageId)
  const running = run()
  let lined: unknown
  try {
    await waitForWaiters(holder.pid, waiters, timeoutMs)
  } catch (error) {
    lined = error
  }
  await holder.release()
  const result = await running
  if (lined !== undefined) throw lined
  return result
}

/**
 * `withPageRowHeld`와 같되 **줄 서는 순서를 정한다** — `runs[i]`는 앞의 `i`개가 행에서 줄을 선 것을 본 뒤에 시작한다.
 * 페이지 행의 잠금 대기열은 도착 순이므로 놓은 뒤 잠금을 받는 순서도 이 순서다. 결과는 `runs`의 순서로 돌려준다.
 */
async function withPageRowQueued<T>(pageId: string, runs: Array<() => Promise<T>>): Promise<T[]> {
  const holder = await holdPageRow(pageId)
  const running: Promise<T>[] = []
  let lined: unknown
  try {
    for (const [index, run] of runs.entries()) {
      running.push(run())
      await waitForWaiters(holder.pid, index + 1)
    }
  } catch (error) {
    lined = error
  }
  await holder.release()
  const results = await Promise.all(running)
  if (lined !== undefined) throw lined
  return results
}

/**
 * 페이지 행을 테스트 트랜잭션으로 쥔다. `pid`는 쥔 백엔드다(`waitersBehind`가 그 뒤의 줄을 센다). `release`가 놓고 그
 * 트랜잭션이 끝나기를 기다린다.
 */
async function holdPageRow(pageId: string): Promise<{ pid: number; release: () => Promise<void> }> {
  let release!: () => void
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  let markHeld!: () => void
  const held = new Promise<void>((resolve) => {
    markHeld = resolve
  })
  let holderPid = 0
  const holder = withTransaction(db, async (trx) => {
    await trx.selectFrom('pages').select('id').where('id', '=', pageId).forUpdate().execute()
    holderPid = (await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(trx)).rows[0]!.pid
    markHeld()
    await released
  })
  await Promise.race([held, holder])
  return {
    pid: holderPid,
    release: async () => {
      release()
      await holder
    },
  }
}

/** 쥔 백엔드(`holder`) 뒤에 `waiters`개가 줄을 설 때까지 기다린다(`waitersBehind`). `timeoutMs` 안에 안 되면 던진다. */
async function waitForWaiters(holder: number, waiters: number, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while ((await waitersBehind(holder)) < waiters) {
    if (Date.now() > deadline) {
      throw new Error(`페이지 행에서 요청 ${waiters}개가 줄을 서지 않았습니다 — 요청이 겹치지 않았습니다`)
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

describe('같은 멱등 키의 게시가 동시에 온다', () => {
  it('둘 다 성공하고(201·200) 행은 하나 · 번호는 1 이다', async () => {
    // **잠금 안에서 키를 한 번 더 보는 것이 이 케이스의 전부다**(`routes/comments.ts`). 둘 다
    // 잠그기 전의 확인을 지나(아직 아무것도 커밋되지 않았다) 페이지 행에서 줄을 선다. 뒤의 요청이
    // 잠근 뒤 키를 안 보면 같은 키로 둘째 행을 넣으려다 유일 색인에 걸려 **500** 이다 —
    // 같은 게시를 두 번 보낸 사람이 «모름»을 듣는다.
    await withRealApi(async (ctx) => {
      const fx = await setup(ctx)
      const post = () =>
        ctx.app.inject({
          method: 'POST',
          url: commentsUrl(fx),
          cookies: fx.owner.cookie,
          payload: { nodeId: 'n_a', body: '한 번만 달 말', idempotencyKey: 'same-key' },
        })

      const [first, second] = await Promise.all([post(), post()])

      expect(sorted([first.statusCode, second.statusCode])).toEqual([200, 201])
      expect(first.json().comment.id).toBe(second.json().comment.id)
      expect(await commentCount(fx.pageId)).toBe(1)
      expect(markerOf(await schemaOf(fx.pageId), 'n_a')).toBe(1)
    })
  })
})

describe('코멘트 삭제의 동시성', () => {
  it('409를 받은 삭제는 행을 남기지 않는다 (리뷰 B5)', async () => {
    // **이 케이스가 다른 노드 경합의 전부다.** 서로 다른 노드의 마지막 코멘트를 동시에 지우면 둘 다
    // 번호를 지우려 하고, 진 쪽은 `stale`로 409를 받는다. **그때 그쪽의 행 삭제가
    // 커밋되어 있으면 안 된다** — 사용자는 실패를 들었는데 코멘트는 사라진 상태다.
    await withRealApi(async (ctx) => {
      const fx = await setup(ctx)
      const a = await postComment(ctx, fx, 'n_a', '가에 붙은 말')
      const b = await postComment(ctx, fx, 'n_b', '나에 붙은 말')
      expect(await commentCount(fx.pageId)).toBe(2)

      // **둘이 겹친 판만 잰다**(`withPageRowHeld`) — 겹치지 않으면 둘 다 200 이 옳다.
      const [resA, resB] = await withPageRowHeld(fx.pageId, 2, () =>
        Promise.all([deleteComment(ctx, fx, a), deleteComment(ctx, fx, b)]),
      )

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

  it('같은 노드의 마지막 둘을 동시에 지우면 번호가 사라진다', async () => {
    // 잠금이 없으면 둘 다 *"아직 하나 남았다"*로 판정해 **고아 번호**가 남는다 —
    // 코멘트는 없는데 캔버스에 번호가 뜬다.
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

  it('서로 다른 노드의 첫 코멘트를 동시에 달면 둘 다 달리고 번호가 겹치지 않는다', async () => {
    // **번호는 잠근 뒤의 문서로 매긴다**(`routes/comments.ts` 머리말 「게시는 잠근 뒤의 문서로 번호를 매긴다」).
    // 잠그기 전에 읽은 문서로 매기면 뒤의 요청이 앞 요청의 번호를 못 봐 둘 다 1번이 되고, 그것을 낡음으로
    // 거절하면 한쪽이 409 다. **둘이 겹친 판만 잰다**(`withPageRowHeld`) — 겹치지 않으면 어느 쪽이든 둘 다 201 이다.
    await withRealApi(async (ctx) => {
      const fx = await setup(ctx)
      const before = await db.selectFrom('pages').select('head_seq').where('id', '=', fx.pageId).executeTakeFirstOrThrow()

      const post = (nodeId: string) =>
        ctx.app.inject({
          method: 'POST',
          url: commentsUrl(fx),
          cookies: fx.owner.cookie,
          payload: { nodeId, body: `${nodeId}의 말` },
        })

      const [a, b] = await withPageRowHeld(fx.pageId, 2, () => Promise.all([post('n_a'), post('n_b')]))

      expect(sorted([a.statusCode, b.statusCode])).toEqual([201, 201])
      const document = await schemaOf(fx.pageId)
      // **둘 다 1번을 받는 일이 없다.** 문서 · 응답 · revision 번호가 한 줄로 맞는다.
      expect([markerOf(document, 'n_a'), markerOf(document, 'n_b')].sort()).toEqual([1, 2])
      expect([a.json().marker, b.json().marker].sort()).toEqual([1, 2])
      expect(sorted([a.json().seq, b.json().seq])).toEqual([Number(before.head_seq) + 1, Number(before.head_seq) + 2])
      expect(await commentCount(fx.pageId)).toBe(2)
    })
  })

  it('마지막 코멘트의 삭제가 먼저 줄 선 뒤 같은 노드에 게시하면 번호를 새로 받는다', async () => {
    // 게시는 잠근 뒤의 문서로 번호를 본다. 잠그기 전에 읽은 문서로 보면 *"이미 번호가 있다"*로 판단해
    // 앞의 삭제가 번호를 지운 뒤에 **번호 없는 코멘트**를 세운다. 순서를 정해 줄을 세운다(`withPageRowQueued`).
    await withRealApi(async (ctx) => {
      const fx = await setup(ctx)
      const only = await postComment(ctx, fx, 'n_a', '지울 말')

      const [del, post] = await withPageRowQueued(fx.pageId, [
        () => deleteComment(ctx, fx, only),
        () =>
          ctx.app.inject({
            method: 'POST',
            url: commentsUrl(fx),
            cookies: fx.owner.cookie,
            payload: { nodeId: 'n_a', body: '새 말' },
          }),
      ])

      expect([del!.statusCode, post!.statusCode]).toEqual([200, 201])
      expect(await commentCount(fx.pageId)).toBe(1)
      // 번호가 **있다**는 것만 본다 — 그 값(최댓값 + 1)은 위 «첫 코멘트를 동시에» 케이스의 축이다.
      const marker = markerOf(await schemaOf(fx.pageId), 'n_a')
      expect(typeof marker).toBe('number')
      expect(post!.json().markerOps).toEqual([{ op: 'add', path: '/root/children/0/marker', value: marker }])
    })
  })
})

describe('줄 세기는 그 행에 묶인다 — `withPageRowHeld` 의 술어', () => {
  it('다른 행에서 기다리는 백엔드는 세지 않는다 — 겹치지 않은 판은 던진다', async () => {
    // 옆에서 사용자 행 하나를 쥐고 백엔드 둘을 그 행에 줄 세운다 — 페이지 행과 무관한 대기자 둘이다. 그 사이 `run` 은 요청을
    // 하나도 안 낸다(겹침 0). 술어가 DB 전체의 대기를 세면 이 둘을 «페이지 행에 선 요청»으로 읽어 겹치지 않은 판을 센다.
    await withRealApi(async (ctx) => {
      const fx = await setup(ctx)
      let release!: () => void
      const released = new Promise<void>((resolve) => {
        release = resolve
      })
      let markHeld!: () => void
      const held = new Promise<void>((resolve) => {
        markHeld = resolve
      })
      const lockUser = (trx: typeof db) =>
        trx.selectFrom('users').select('id').where('id', '=', fx.owner.user.id).forUpdate().execute()
      const other = withTransaction(db, async (trx) => {
        await lockUser(trx)
        markHeld()
        await released
      })
      await held
      const bystanders = [withTransaction(db, lockUser), withTransaction(db, lockUser)]
      try {
        const deadline = Date.now() + 5_000
        while ((await lockWaiters()) < 2) {
          if (Date.now() > deadline) throw new Error('옆 대기자 둘이 줄을 서지 않았다 — 이 케이스의 전제가 안 섰다')
          await new Promise((resolve) => setTimeout(resolve, 10))
        }
        await expect(withPageRowHeld(fx.pageId, 2, async () => '겹침 없음', 300)).rejects.toThrow(/줄을 서지 않았습니다/)
      } finally {
        release()
        await other
        await Promise.all(bystanders)
      }
    })
  })
})
