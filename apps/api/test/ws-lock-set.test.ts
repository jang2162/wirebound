/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withRealApi`를 쓴다.
 *
 * ---
 *
 * # 잠금 집합 (설계서 「소프트 잠금」 · 여러 노드 선택)
 *
 * 한 연결이 서브트리 여럿을 쥔다. `lock` 프레임의 `nodeIds`가 «이 연결의 잠금을 이 집합으로»다 — 서버는 페이지 행을 쥔 채 **집합
 * 전부의** 겹침을 묻고(이미 쥔 것도 — 쥔 뒤 복원이 문서를 바꿨을 수 있다), 빠지는 것은 놓는다(`ws/lock.ts`의 «집합을 갈아 끼운다»).
 * 거절은 **거절된 노드만** 싣고 나머지는 쥔다.
 *
 * 하나짜리 프레임(`nodeId`)의 수명 · 거절 · 줄은 `ws-lock.test.ts`가 잰다 — 하나짜리는 `[nodeId]`로 읽혀 같은 길을 지난다. 이 파일은
 * 집합이 더하는 축만 잰다.
 */
import { MAX_OPS_PER_EDIT } from '@wirebound/schema'
import { sql } from 'kysely'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addMember,
  createMenuNode,
  createPage,
  createProject,
  getTestDb,
  resetRealData,
  signup,
  withRealApi,
  type CreatedPage,
  type CreatedProject,
  type RealApiContext,
  type SignedUpUser,
} from './helpers'
import { LOCK_TTL_MS } from '../src/lock/store'
import { WS_CLOSE, type ServerFrame } from '../src/ws/protocol'
import { WsProbe, joinRoom, locksUntil, locksWith } from './ws-client'

beforeEach(resetRealData)
afterEach(resetRealData)

const opened: WsProbe[] = []

afterEach(() => {
  for (const probe of opened) probe.close()
  opened.length = 0
})

function track(probe: WsProbe): WsProbe {
  opened.push(probe)
  return probe
}

interface Board {
  bora: SignedUpUser
  dahye: SignedUpUser
  onlooker: SignedUpUser
  project: CreatedProject
  page: CreatedPage
}

/**
 * ```
 * n_root
 *   n_a      n_a1
 *   n_b      n_b1  n_b2
 *   n_c
 * ```
 */
async function board(ctx: RealApiContext): Promise<Board> {
  const bora = await signup(ctx)
  const dahye = await signup(ctx)
  const onlooker = await signup(ctx)

  const project = await createProject(ctx, bora.cookie)
  await addMember(ctx, project.id, dahye.user.id, 'editor')
  await addMember(ctx, project.id, onlooker.user.id, 'viewer')

  const menu = await createMenuNode(ctx, bora.cookie, project.id)
  const page = await createPage(ctx, bora.cookie, project.id, menu.id, { title: '함께 고칠 페이지' })

  const put = await ctx.app.inject({
    method: 'PUT',
    url: `/api/projects/${project.id}/pages/${page.id}/schema`,
    cookies: bora.cookie,
    payload: {
      schema: {
        version: 1,
        root: {
          id: 'n_root',
          type: 'Page',
          children: [
            { id: 'n_a', type: 'Section', children: [{ id: 'n_a1', type: 'Text', props: {} }] },
            {
              id: 'n_b',
              type: 'Section',
              children: [
                { id: 'n_b1', type: 'Text', props: {} },
                { id: 'n_b2', type: 'Text', props: {} },
              ],
            },
            { id: 'n_c', type: 'Section', children: [] },
          ],
        },
      },
    } as never,
  })
  if (put.statusCode !== 200) throw new Error(`픽스처 PUT 실패 (${put.statusCode}): ${put.body}`)

  return { bora, dahye, onlooker, project, page }
}

const setFrame = (pageId: string, nodeIds: readonly string[], lockId?: number): string =>
  JSON.stringify({ type: 'lock', pageId, nodeIds, ...(lockId !== undefined ? { lockId } : {}) })

const denials = (probe: WsProbe): Array<Extract<ServerFrame, { type: 'lock-denied' }>> =>
  probe.received.filter((frame): frame is Extract<ServerFrame, { type: 'lock-denied' }> => frame.type === 'lock-denied')

/** 지금 서버가 쥔 것 — `이름:노드`, 정렬. */
const held = (ctx: RealApiContext, projectId: string): string[] =>
  ctx.app.realtime.locks
    .liveIn(projectId)
    .map((lock) => `${lock.userName}:${lock.nodeId}`)
    .sort()

/** 조건이 설 때까지 — 안 서면 던진다(시나리오가 성립하지 않았다). */
async function until(label: string, ready: () => Promise<boolean> | boolean, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await ready()) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error(`${label} — 시나리오가 성립하지 않았습니다`)
}

type TestDb = ReturnType<typeof getTestDb>

/** 페이지 행을 테스트 트랜잭션이 `FOR UPDATE`로 쥔다 — 놓을 때까지(`comments-concurrency.test.ts`의 `withPageRowHeld`와 같은 꼴). */
function holdPageRow(db: TestDb, pageId: string): Promise<{ pid: number; release: () => Promise<void> }> {
  return new Promise((resolveHeld, rejectHeld) => {
    let free = (): void => {}
    const freed = new Promise<void>((resolve) => (free = resolve))
    const done = db
      .transaction()
      .execute(async (trx) => {
        const pid = (await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(trx)).rows[0]?.pid ?? 0
        await sql`select 1 from pages where id = ${pageId} for update`.execute(trx)
        resolveHeld({
          pid,
          release: async () => {
            free()
            await done
          },
        })
        await freed
      })
      .catch(rejectHeld)
  })
}

/** 쥔 백엔드 뒤에 사슬로 선 백엔드 수(`comments-concurrency.test.ts`의 `waitersBehind`와 같은 질의). */
async function waitersBehind(db: TestDb, holder: number): Promise<number> {
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
 * `n_c`가 `n_a` 안에 있는 문서를 스냅샷으로 얼리고 판의 문서(`n_c`가 뿌리의 자식)로 되돌린다 — 그 스냅샷의 id. 복원하면 `n_a`와 `n_c`가
 * 조상/자손이 된다(복원은 잠금을 안 본다 — 설계서 「소프트 잠금」의 «거치지 않는 입구»).
 */
async function snapshotWithCInsideA(ctx: RealApiContext, fx: Board): Promise<string> {
  const pageUrl = `/api/projects/${fx.project.id}/pages/${fx.page.id}/schema`
  const before = await getTestDb().selectFrom('pages').select('schema').where('id', '=', fx.page.id).executeTakeFirstOrThrow()
  const flat = before.schema as { version: number; root: { children: Array<{ id: string; children?: unknown[] }> } }
  const cInsideA = structuredClone(flat)
  const [a, b, c] = cInsideA.root.children
  cInsideA.root.children = [{ ...a!, children: [...(a!.children ?? []), c!] }, b!]
  const put = async (schema: unknown): Promise<void> => {
    const response = await ctx.app.inject({ method: 'PUT', url: pageUrl, cookies: fx.bora.cookie, payload: { schema } as never })
    if (response.statusCode !== 200) throw new Error(`PUT 실패 (${response.statusCode}): ${response.body}`)
  }
  await put(cInsideA)
  const snapshot = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${fx.project.id}/snapshots`,
    cookies: fx.bora.cookie,
    payload: { tag: 'c-inside-a' },
  })
  if (snapshot.statusCode !== 201) throw new Error(`스냅샷 실패 (${snapshot.statusCode}): ${snapshot.body}`)
  await put(flat)
  return (snapshot.json() as { id: string }).id
}

async function restore(ctx: RealApiContext, fx: Board, snapshotId: string): Promise<void> {
  const response = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${fx.project.id}/snapshots/${snapshotId}/restore`,
    cookies: fx.bora.cookie,
  })
  if (response.statusCode !== 200) throw new Error(`복원 실패 (${response.statusCode}): ${response.body}`)
}

/** 서로 다른 사람의 `n_a`와 `n_c` 잠금이 함께 섰는가 — 복원 뒤 문서에서 둘은 조상/자손이다. */
const overlapping = (ctx: RealApiContext, fx: Board): boolean => {
  const live = ctx.app.realtime.locks.liveIn(fx.project.id)
  const a = live.find((lock) => lock.nodeId === 'n_a')
  const c = live.find((lock) => lock.nodeId === 'n_c')
  return a !== undefined && c !== undefined && a.userId !== c.userId
}

/** 거절이 오기를 `ms`까지 기다린다 — 안 와도 던지지 않는다(안 온 것은 단언이 값으로 잰다). */
async function deniedWithin(probe: WsProbe, ms: number): Promise<void> {
  const deadline = Date.now() + ms
  while (Date.now() < deadline && denials(probe).length === 0) await new Promise((resolve) => setTimeout(resolve, 10))
}

describe('집합을 쥐고 갈아 끼운다', () => {
  /** 혼자 죽는 변조: 저장소가 집합의 첫 노드만 쥔다. */
  it('셋을 청하면 셋 다 서고 룸의 목록에 세 줄이 선다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))

      boraTab.send(setFrame(fx.page.id, ['n_a', 'n_b', 'n_c']))

      const locks = await locksUntil(watcher, (list) => list.length === 3, '셋')
      expect(locks.map((lock) => lock.nodeId).sort()).toEqual(['n_a', 'n_b', 'n_c'])
      expect(locks.every((lock) => lock.userId === fx.bora.user.id && lock.pageId === fx.page.id)).toBe(true)
      expect(denials(boraTab)).toEqual([])
    })
  }, 30_000)

  /** 혼자 죽는 변조: 빠지는 것을 안 놓는다(앞 집합과 새 집합의 합을 쥔다). */
  it('집합을 줄이면 빠진 것만 놓이고 남은 것은 그대로다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))
      boraTab.send(setFrame(fx.page.id, ['n_a', 'n_b', 'n_c']))
      await locksUntil(watcher, (list) => list.length === 3, '셋')

      boraTab.send(setFrame(fx.page.id, ['n_a', 'n_c']))

      const left = await locksUntil(watcher, (list) => list.length === 2, '둘')
      expect(left.map((lock) => lock.nodeId).sort()).toEqual(['n_a', 'n_c'])
      await watcher.quiet()
      expect(held(ctx, fx.project.id)).toEqual([`${fx.bora.user.name}:n_a`, `${fx.bora.user.name}:n_c`])
    })
  }, 30_000)

  it('빈 집합은 다 놓는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))
      boraTab.send(setFrame(fx.page.id, ['n_a', 'n_b']))
      await locksUntil(watcher, (list) => list.length === 2, '둘')

      boraTab.send(setFrame(fx.page.id, [], 7))

      await locksUntil(watcher, (list) => list.length === 0, '빔')
      await watcher.quiet()
      expect(denials(boraTab)).toEqual([])
    })
  }, 30_000)

  it('하나짜리 프레임(`nodeId`)은 그 하나의 집합이다 — 집합을 쥔 연결이 보내면 그것 하나로 갈아 끼운다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))
      boraTab.send(setFrame(fx.page.id, ['n_a', 'n_b']))
      await locksUntil(watcher, (list) => list.length === 2, '둘')

      boraTab.send(JSON.stringify({ type: 'lock', pageId: fx.page.id, nodeId: 'n_c' }))

      const after = await locksUntil(watcher, (list) => list.length === 1, '하나')
      expect(after.map((lock) => lock.nodeId)).toEqual(['n_c'])
    })
  }, 30_000)

  /**
   * 화면은 조상과 자손을 함께 고르지 않지만(`apps/web`의 `store/selection-set.ts`) 서버는 그것을 믿지 않는다 — **자기 집합 안의 겹침은
   * 견주지 않는다**(같은 사람의 잠금은 막지 않는다 — 다른 탭과 같은 규칙). 둘 다 선다.
   */
  it('자기 집합 안의 조상과 자손은 견주지 않는다 — 둘 다 선다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))

      boraTab.send(setFrame(fx.page.id, ['n_b', 'n_b1']))

      const both = await locksUntil(watcher, (list) => list.length === 2, '둘')
      expect(both.map((lock) => lock.nodeId).sort()).toEqual(['n_b', 'n_b1'])
      expect(denials(boraTab)).toEqual([])
    })
  }, 30_000)

  it('같은 노드를 두 번 실어도 한 번 쥔다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))

      boraTab.send(setFrame(fx.page.id, ['n_a', 'n_a', 'n_c']))

      await locksWith(watcher, 'n_c')
      await watcher.quiet()
      expect(held(ctx, fx.project.id)).toEqual([`${fx.bora.user.name}:n_a`, `${fx.bora.user.name}:n_c`])
    })
  }, 30_000)

  it('연결이 끊기면 집합 전부가 그 자리에서 풀린다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))
      boraTab.send(setFrame(fx.page.id, ['n_a', 'n_b', 'n_c']))
      await locksUntil(watcher, (list) => list.length === 3, '셋')

      boraTab.close()

      await locksUntil(watcher, (list) => list.length === 0, '빔')
      expect(ctx.app.realtime.locks.liveCount()).toBe(0)
    })
  }, 30_000)
})

describe('하트비트', () => {
  /**
   * 같은 집합을 다시 보내는 것이 하트비트다 — 차례가 달라도. 룸에 목록이 다시 흐르지 않고 **집합 전체**의 만료가 미뤄진다. 시계는
   * 앱을 짓기 **전에** 갈아 둔다(`createLockStore`의 기본 인자 — `ws-lock.test.ts`의 «TTL 을 넘긴 남의 잠금은 막지 않는다»와 같다).
   */
  it('같은 집합을 다시 보내면 목록이 안 흐르고 집합 전체의 만료가 미뤄진다', async () => {
    const realNow = Date.now.bind(Date)
    let skew = 0
    const clock = vi.spyOn(Date, 'now').mockImplementation(() => realNow() + skew)
    try {
      await withRealApi(async (ctx) => {
        const fx = await board(ctx)
        const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
        const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))
        boraTab.send(setFrame(fx.page.id, ['n_a', 'n_b'], 1))
        await locksUntil(watcher, (list) => list.length === 2, '둘')
        await watcher.quiet()

        skew = LOCK_TTL_MS - 1_000
        boraTab.send(setFrame(fx.page.id, ['n_b', 'n_a'], 2))
        const echoed = await watcher.quiet()
        skew = 2 * LOCK_TTL_MS - 2_000

        expect(echoed.filter((frame) => frame.type === 'locks')).toEqual([])
        expect(held(ctx, fx.project.id)).toEqual([`${fx.bora.user.name}:n_a`, `${fx.bora.user.name}:n_b`])
      })
    } finally {
      clock.mockRestore()
    }
  }, 30_000)

  /**
   * **남는 것도 다시 판정한다** — 쥔 뒤 문서가 바뀌어 남의 잠금과 조상/자손이 됐으면 하트비트가 그것을 거절한다(`ws/lock.ts`의 «집합을
   * 갈아 끼운다 — 프레임마다 집합 전부를 판정한다»). 문서를 잠금과 무관하게 갈아 끼우는 쓰기가 스냅샷 복원이다: 보라 `[n_a]` · 다혜
   * `[n_c, n_b]`를 쥔 채 보라가 `n_c`가 `n_a` 안에 있던 스냅샷을 복원한다. **먼저 하트비트를 보낸 쪽이 겹친 노드를 거절받고**(그 판정이
   * 남의 잠금을 본다) 뒤는 그것이 놓인 뒤라 그대로 선다 — 하나짜리 시절(main)의 «같은 자리를 다시 보내면 판정이 다시 돈다»와 같은
   * 판정이다. 혼자 죽는 변조: 남는 것을 판정하지 않는다(겹친 둘이 다 남고 거절이 없다).
   */
  it.each([
    { first: 'dahye', denied: [['n_c']], held: ['보라:n_a', '다혜:n_b'] },
    { first: 'bora', denied: [['n_a']], held: ['다혜:n_b', '다혜:n_c'] },
  ] as const)('복원이 두 사람의 잠금을 조상/자손으로 만들면 먼저 하트비트를 보낸 쪽($first)이 겹친 노드를 거절받는다', async (row) => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const snapshotId = await snapshotWithCInsideA(ctx, fx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const dahyeTab = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.onlooker.cookie.wb_session))
      boraTab.send(setFrame(fx.page.id, ['n_a'], 1))
      dahyeTab.send(setFrame(fx.page.id, ['n_c', 'n_b'], 1))
      await locksUntil(watcher, (list) => list.length === 3, '셋')

      await restore(ctx, fx, snapshotId)
      // 카나리아 — 복원이 겹침을 만들었다(복원은 잠금을 안 본다).
      expect(overlapping(ctx, fx)).toBe(true)

      const [firstTab, secondTab] = row.first === 'dahye' ? [dahyeTab, boraTab] : [boraTab, dahyeTab]
      const [firstSet, secondSet] = row.first === 'dahye' ? [['n_c', 'n_b'], ['n_a']] : [['n_a'], ['n_c', 'n_b']]
      firstTab.send(setFrame(fx.page.id, firstSet, 2))
      await deniedWithin(firstTab, 3_000)
      secondTab.send(setFrame(fx.page.id, secondSet, 2))
      await secondTab.quiet()

      const names = { [fx.bora.user.name]: '보라', [fx.dahye.user.name]: '다혜' }
      expect({
        overlapping: overlapping(ctx, fx),
        firstDenied: denials(firstTab).map((frame) => frame.nodeIds),
        secondDenied: denials(secondTab).length,
        held: held(ctx, fx.project.id)
          .map((line) => {
            const [name, node] = line.split(':')
            return `${names[name!]}:${node}`
          })
          .sort(),
      }).toEqual({ overlapping: false, firstDenied: row.denied, secondDenied: 0, held: [...row.held].sort() })
    })
  }, 30_000)
})

describe('하트비트의 경주', () => {
  const db = getTestDb()

  /**
   * **겹친 두 잠금의 하트비트가 페이지 행에 함께 줄 선다** — 복원 뒤 둘이 같은 순간 하트비트를 보내도 하나만 거절된다(둘 다 남지도,
   * 둘 다 잃지도 않는다). 페이지 행을 테스트 트랜잭션이 `FOR UPDATE`로 쥐고 두 `lock`이 그 행에 줄 선 것을 본 뒤에 놓는다(줄이 안 서면
   * 던진다). 판정과 `hold`가 한 틱이라 먼저 판정된 쪽이 거절되고 뒤는 그 놓음을 본다. 혼자 죽는 변조: 남는 것을 판정하지 않는다(겹친
   * 둘이 다 남는다).
   */
  it('겹친 두 잠금의 하트비트가 행에 함께 줄 서도 하나만 거절되고 겹침이 풀린다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const snapshotId = await snapshotWithCInsideA(ctx, fx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const dahyeTab = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.onlooker.cookie.wb_session))
      boraTab.send(setFrame(fx.page.id, ['n_a'], 1))
      dahyeTab.send(setFrame(fx.page.id, ['n_c', 'n_b'], 1))
      await locksUntil(watcher, (list) => list.length === 3, '셋')
      await restore(ctx, fx, snapshotId)
      expect(overlapping(ctx, fx)).toBe(true)

      const row = await holdPageRow(db, fx.page.id)
      boraTab.send(setFrame(fx.page.id, ['n_a'], 2))
      dahyeTab.send(setFrame(fx.page.id, ['n_c', 'n_b'], 2))
      let lined: unknown
      try {
        await until('두 하트비트가 페이지 행에 줄 선다', async () => (await waitersBehind(db, row.pid)) >= 2)
      } catch (error) {
        lined = error
      }
      await row.release()
      if (lined !== undefined) throw lined

      await Promise.all([deniedWithin(boraTab, 3_000), deniedWithin(dahyeTab, 3_000)])
      await watcher.quiet()
      const boraDenied = denials(boraTab).map((frame) => frame.nodeIds)
      const dahyeDenied = denials(dahyeTab).map((frame) => frame.nodeIds)
      expect({
        overlapping: overlapping(ctx, fx),
        deniedSides: [boraDenied.length, dahyeDenied.length].sort(),
        denied: boraDenied.length > 0 ? boraDenied : dahyeDenied,
      }).toEqual({ overlapping: false, deniedSides: [0, 1], denied: boraDenied.length > 0 ? [['n_a']] : [['n_c']] })
    })
  }, 30_000)
})

describe('부분 거절', () => {
  /**
   * 셋 가운데 하나를 남이 쥐었다 — 둘만 서고 거절은 **그 하나만** 싣는다(그 프레임의 `lockId`와 함께). 혼자 죽는 변조: 거절이 집합째다
   * (하나라도 막히면 아무것도 안 쥔다) · 거절이 프레임의 노드 전부를 싣는다.
   */
  it('셋 가운데 하나를 남이 쥐었으면 둘만 서고 `lock-denied`에는 그 하나만 실린다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const dahyeTab = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.onlooker.cookie.wb_session))
      dahyeTab.send(setFrame(fx.page.id, ['n_b1']))
      await locksWith(watcher, 'n_b1')

      boraTab.send(setFrame(fx.page.id, ['n_a', 'n_b', 'n_c'], 5))

      expect(await boraTab.waitFor('lock-denied')).toEqual({
        type: 'lock-denied',
        projectId: fx.project.id,
        pageId: fx.page.id,
        nodeIds: ['n_b'],
        lockId: 5,
      })
      await locksUntil(watcher, (list) => list.length === 3, '다혜 하나 + 보라 둘')
      await watcher.quiet()
      expect(held(ctx, fx.project.id)).toEqual(
        [`${fx.bora.user.name}:n_a`, `${fx.bora.user.name}:n_c`, `${fx.dahye.user.name}:n_b1`].sort(),
      )
    })
  }, 30_000)

  /**
   * 앞서 쥔 것 가운데 집합에 남는 것은 거절과 함께 놓이지 않는다. 혼자 죽는 변조: 거절이 이 연결이 쥔 것을 전부 놓는다(하나짜리 시절의
   * «새 자리를 달라는 것이 앞 자리를 놓는 것이다»를 집합에 그대로 건다).
   */
  it('거절이 와도 앞서 쥔 것 가운데 집합에 남은 것은 쥔 채다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const dahyeTab = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.onlooker.cookie.wb_session))
      boraTab.send(setFrame(fx.page.id, ['n_a']))
      dahyeTab.send(setFrame(fx.page.id, ['n_c']))
      await locksUntil(watcher, (list) => list.length === 2, '둘')

      boraTab.send(setFrame(fx.page.id, ['n_a', 'n_c'], 9))

      expect((await boraTab.waitFor('lock-denied')).nodeIds).toEqual(['n_c'])
      await watcher.quiet()
      expect(held(ctx, fx.project.id)).toEqual([`${fx.bora.user.name}:n_a`, `${fx.dahye.user.name}:n_c`].sort())
    })
  }, 30_000)

  /** 모두 막혔으면 아무것도 안 쥔다 — 앞서 쥔 것도 집합에 없으면 놓인다. */
  it('새로 드는 것이 모두 막히고 남는 것이 없으면 아무것도 안 쥔다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const dahyeTab = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.onlooker.cookie.wb_session))
      boraTab.send(setFrame(fx.page.id, ['n_c']))
      dahyeTab.send(setFrame(fx.page.id, ['n_a', 'n_b']))
      await locksUntil(watcher, (list) => list.length === 3, '셋')

      boraTab.send(setFrame(fx.page.id, ['n_a1', 'n_b2'], 4))

      expect((await boraTab.waitFor('lock-denied')).nodeIds).toEqual(['n_a1', 'n_b2'])
      await locksUntil(watcher, (list) => list.length === 2, '다혜 둘')
      expect(held(ctx, fx.project.id)).toEqual([`${fx.dahye.user.name}:n_a`, `${fx.dahye.user.name}:n_b`].sort())
    })
  }, 30_000)
})

describe('규격', () => {
  async function closesWith(raw: string): Promise<number> {
    let code = 0
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      boraTab.send(raw.replaceAll('PAGE', fx.page.id))
      code = (await boraTab.waitClosed()).code
    })
    return code
  }

  it('`nodeId`와 `nodeIds`를 함께 실은 프레임은 연결을 닫는다', async () => {
    expect(await closesWith(JSON.stringify({ type: 'lock', pageId: 'PAGE', nodeId: 'n_a', nodeIds: ['n_b'] }))).toBe(WS_CLOSE.badFrame)
  }, 30_000)

  it('둘 다 없는 프레임도 닫는다', async () => {
    expect(await closesWith(JSON.stringify({ type: 'lock', pageId: 'PAGE' }))).toBe(WS_CLOSE.badFrame)
  }, 30_000)

  it(`상한(${MAX_OPS_PER_EDIT})을 넘는 집합은 닫는다 — 상한까지는 받는다`, async () => {
    const ids = (count: number): string[] => Array.from({ length: count }, (_, index) => `n_x${index}`)
    expect(await closesWith(JSON.stringify({ type: 'lock', pageId: 'PAGE', nodeIds: ids(MAX_OPS_PER_EDIT + 1) }))).toBe(WS_CLOSE.badFrame)

    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))
      boraTab.send(setFrame(fx.page.id, ids(MAX_OPS_PER_EDIT)))
      const all = await locksUntil(watcher, (list) => list.length === MAX_OPS_PER_EDIT, '상한까지')
      expect(all).toHaveLength(MAX_OPS_PER_EDIT)
      expect(boraTab.closeInfo).toBeNull()
    })
  }, 30_000)

  it('노드 id 모양을 어긴 집합도 닫는다', async () => {
    expect(await closesWith(JSON.stringify({ type: 'lock', pageId: 'PAGE', nodeIds: ['n_a', 'not an id!'] }))).toBe(WS_CLOSE.badFrame)
  }, 30_000)
})

/**
 * **두 연결이 겹치는 집합을 같은 순간 청한다.** 페이지 행을 테스트 트랜잭션이 `FOR UPDATE`로 쥔 채 둘을 보내고, **둘이 그 행에 줄 선 것을
 * 본 뒤에** 놓는다(`comments-concurrency.test.ts`의 `withPageRowHeld`와 같은 꼴 — 줄이 안 서면 던진다). 둘 다 행 앞에서 기다렸으므로
 * 판정은 행이 풀린 뒤 차례로 돈다 — 먼저 끝난 쪽이 겹친 노드를 쥐고 뒤는 그것을 보고 **겹친 노드만** 거절된다.
 */
describe('겹치는 집합의 경주', () => {
  const db = getTestDb()

  /**
   * 보라 `[n_a, n_b]` · 다혜 `[n_b1, n_c]` — `n_b`가 `n_b1`의 조상이라 겹친다. 이긴 쪽은 집합을 다 쥐고, 진 쪽은 겹친 노드 하나만
   * 거절되고 나머지를 쥔다. 겹친 잠금(서로 다른 사람의 두 잠금이 조상/자손)은 0 이다. 혼자 죽는 변조: 판정을 집합째로 묻고 `hold`를
   * 판정 **뒤 await 하나 다음에** 한다(같은 틱이 아니다 — 둘이 함께 «비었다»를 보고 둘 다 선다).
   */
  it('두 연결이 겹치는 집합을 함께 청해도 겹친 잠금은 서지 않고, 진 쪽은 겹친 노드만 거절된다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const dahyeTab = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.onlooker.cookie.wb_session))
      const row = await holdPageRow(db, fx.page.id)

      boraTab.send(setFrame(fx.page.id, ['n_a', 'n_b'], 1))
      dahyeTab.send(setFrame(fx.page.id, ['n_b1', 'n_c'], 1))
      let lined: unknown
      try {
        await until('두 `lock`이 페이지 행에 줄 선다', async () => (await waitersBehind(db, row.pid)) >= 2)
      } catch (error) {
        lined = error
      }
      await row.release()
      if (lined !== undefined) throw lined

      // «셋 이상» 을 기다린다 — 겹친 잠금이 서면 넷이 되어 아래 단언이 값으로 죽는다(정확히 셋을 기다리면 시간 초과로 죽는다).
      await locksUntil(watcher, (list) => list.length >= 3, '셋 — 이긴 쪽 둘 + 진 쪽 하나')
      await watcher.quiet()
      const live = ctx.app.realtime.locks.liveIn(fx.project.id)
      const boraWon = live.some((lock) => lock.nodeId === 'n_b')
      const [winner, loser] = boraWon ? [fx.bora, fx.dahye] : [fx.dahye, fx.bora]
      const loserTab = boraWon ? dahyeTab : boraTab
      expect({
        overlapping: live.some((lock) => lock.nodeId === 'n_b') && live.some((lock) => lock.nodeId === 'n_b1'),
        loserDenied: denials(loserTab).map((frame) => frame.nodeIds),
        winnerDenied: denials(boraWon ? boraTab : dahyeTab).length,
      }).toEqual({ overlapping: false, loserDenied: [boraWon ? ['n_b1'] : ['n_b']], winnerDenied: 0 })
      expect(held(ctx, fx.project.id)).toEqual(
        (boraWon
          ? [`${winner.user.name}:n_a`, `${winner.user.name}:n_b`, `${loser.user.name}:n_c`]
          : [`${winner.user.name}:n_b1`, `${winner.user.name}:n_c`, `${loser.user.name}:n_a`]
        ).sort(),
      )
    })
  }, 30_000)
})

/**
 * **편집 커밋과 집합 획득도 페이지 행에 줄 선다**(`lock/check.ts`의 «판정은 페이지 행 안에서» — 하나짜리 판은 `ws-lock.test.ts`의
 * 같은 제목 describe). 보라가 쥔 `n_c`를 `n_b` 안으로 옮기는 편집을 커밋 직전(멤버 행 재확인)에 세워 두고 다혜가 `[n_a, n_b]`를
 * 청한다. 다혜의 판정은 커밋 뒤 머리 문서로 돌아 `n_b`만 거절되고 `n_a`는 선다. 혼자 죽는 변조: `handleLockFrame`이 페이지 행을 안
 * 쥔다(커밋 전 문서로 판정 — `n_b`가 서서 옮겨 들어온 `n_c`와 겹친다).
 */
describe('편집 커밋과 집합 획득', () => {
  const db = getTestDb()

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

  async function headSeq(pageId: string): Promise<number> {
    const row = await db.selectFrom('pages').select('head_seq').where('id', '=', pageId).executeTakeFirstOrThrow()
    return Number(row.head_seq)
  }

  it('커밋 직전의 편집이 옮겨 넣은 서브트리와 겹치는 노드만 거절되고 나머지는 선다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const boraTab = track(await joinRoom(ctx.port, fx.project.id, fx.bora.cookie.wb_session))
      const dahyeTab = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))
      boraTab.send(setFrame(fx.page.id, ['n_c']))
      await locksWith(dahyeTab, 'n_c')

      let freeDoor = (): void => {}
      const doorFreed = new Promise<void>((resolve) => (freeDoor = resolve))
      let doorHeld = (): void => {}
      const doorAcquired = new Promise<void>((resolve) => (doorHeld = resolve))
      const door = db.transaction().execute(async (trx) => {
        await sql`select 1 from project_members where project_id = ${fx.project.id} and user_id = ${fx.bora.user.id} for update`.execute(trx)
        doorHeld()
        await doorFreed
      })
      await doorAcquired

      const moveCIntoB = [{ op: 'move', from: '/root/children/2', path: '/root/children/1/children/-' }]
      boraTab.send(JSON.stringify({ type: 'patch', pageId: fx.page.id, baseSeq: await headSeq(fx.page.id), ops: moveCIntoB, clientOpId: 'op-in' }))
      const dahyeSettled = (): boolean =>
        dahyeTab.received.some((frame) => frame.type === 'lock-denied') ||
        ctx.app.realtime.locks.liveIn(fx.project.id).some((lock) => lock.userId === fx.dahye.user.id)
      let staged: unknown
      try {
        await until('편집이 커밋 직전에 선다', async () => (await lockWaiters()) >= 1)
        dahyeTab.send(setFrame(fx.page.id, ['n_a', 'n_b'], 3))
        await until('다혜의 lock 이 줄에 서거나 끝난다', async () => dahyeSettled() || (await lockWaiters()) >= 2)
      } catch (error) {
        staged = error
      }
      freeDoor()
      await door
      if (staged !== undefined) throw staged

      await boraTab.waitFor('patch-ack')
      await until('다혜가 n_a 를 쥔다', () => held(ctx, fx.project.id).includes(`${fx.dahye.user.name}:n_a`))
      await dahyeTab.quiet()
      expect({ denied: denials(dahyeTab).map((frame) => frame.nodeIds), held: held(ctx, fx.project.id) }).toEqual({
        denied: [['n_b']],
        held: [`${fx.bora.user.name}:n_c`, `${fx.dahye.user.name}:n_a`].sort(),
      })
    })
  }, 30_000)
})

/**
 * **2차 방어는 남의 잠금 여럿을 본다**(`lockConflictOfOps` — 바뀌지 않았다). 다혜가 집합 `[n_a, n_b]`를 쥔 채 보라가 낸 묶음이 그 가운데
 * 하나에 닿으면 묶음째 423 이고 문서는 그대로다.
 */
describe('2차 방어', () => {
  it('집합을 쥔 사람의 노드 하나에 닿는 묶음은 묶음째 423 이다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const dahyeTab = track(await joinRoom(ctx.port, fx.project.id, fx.dahye.cookie.wb_session))
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.onlooker.cookie.wb_session))
      dahyeTab.send(setFrame(fx.page.id, ['n_a', 'n_b']))
      await locksUntil(watcher, (list) => list.length === 2, '둘')
      const page = await getTestDb().selectFrom('pages').select(['head_seq', 'schema']).where('id', '=', fx.page.id).executeTakeFirstOrThrow()

      const response = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.project.id}/pages/${fx.page.id}/ops`,
        cookies: fx.bora.cookie,
        payload: {
          baseSeq: Number(page.head_seq),
          ops: [
            { op: 'add', path: '/root/children/2/props', value: {} },
            { op: 'replace', path: '/root/children/1/children/1/props', value: { text: '안' } },
          ],
        },
      })

      expect(response.statusCode).toBe(423)
      const after = await getTestDb().selectFrom('pages').select(['head_seq', 'schema']).where('id', '=', fx.page.id).executeTakeFirstOrThrow()
      expect(Number(after.head_seq)).toBe(Number(page.head_seq))
      expect(after.schema).toEqual(page.schema)
    })
  }, 30_000)
})
