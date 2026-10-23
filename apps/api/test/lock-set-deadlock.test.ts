/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withRealApi`를 쓴다.
 *
 * # 집합 `lock` 과 다른 쓰기의 교착 — **줄 선 판만** 센다
 *
 * 집합 `lock`(`ws/lock.ts`)은 페이지 행을 `FOR KEY SHARE` 로 **하나만** 잡는다 — 쥔 채 기다리는 것이 없어 고리가 설 수 없다는 것이 코드 판단이었다.
 * 간격을 훑어 `deadlocks` 증가 0 을 본 것(27 판)은 **두 쪽이 행에 줄 섰는지를 안 셌다** — 안 겹친 판의 0 은 «고리 없음»이 아니다. 이 파일은 테스트
 * 트랜잭션이 페이지 행을 `FOR UPDATE` 로 쥔 채 `lock` 과 상대 쓰기를 보내고, **둘 다 그 행에 줄 선 것**(`pg_blocking_pids` 사슬)을 본 뒤에 놓는다 —
 * 줄이 안 서면 던진다. 줄 선 순서 둘(`lock` 먼저 · 상대 먼저)을 다 세우고, 놓은 뒤 둘 다 끝나며 `pg_stat_database.deadlocks` 가 안 는다.
 *
 * 상대는 편집 커밋(`PATCH …/ops`) · 스냅샷 복원 · 메뉴 연쇄 삭제 · 프로젝트 삭제 — 페이지 행을 `FOR UPDATE` 로 잡는 쓰기 넷이다.
 *
 * **변조와 죽는 케이스**(백업 후 바이트 비교 복원):
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | `ws/lock.ts` 의 `handleLockFrame` 이 페이지 행을 안 잡는다(`lockPageSharedHead` 를 뗀다) | 모든 케이스가 «`lock` 이 행에 줄 서지 않았다» 로 던진다 — 줄 세기의 카나리아 |
 * | `lockPageSharedHead` 를 `FOR UPDATE` 로 올린다 | 줄은 서지만 두 `lock` 이 서로를 기다리는 판은 `ws-lock.test.ts` 가 죽인다 — 여기서는 안 죽는다(상대가 쓰기이므로) |
 */
import { sql } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addMember,
  createMenuNode,
  createPage,
  createProject,
  getTestDb,
  resetRealData,
  signup,
  withRealApi,
  type RealApiContext,
} from './helpers'
import { WsProbe, joinRoom } from './ws-client'

beforeEach(resetRealData)
afterEach(resetRealData)

const opened: WsProbe[] = []
afterEach(() => {
  for (const probe of opened) probe.close()
  opened.length = 0
})

const db = getTestDb()
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function until(label: string, ready: () => Promise<boolean> | boolean, timeoutMs = 8_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await ready()) return
    await sleep(10)
  }
  throw new Error(`${label} — 시나리오가 성립하지 않았습니다`)
}

function holdPageRow(pageId: string): Promise<{ pid: number; release: () => Promise<void> }> {
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

/** 쥔 백엔드 뒤에 사슬로 선 백엔드 수 — 자기 조회문은 뺀다(`pid <> pg_backend_pid()`). */
async function waitersBehind(holder: number): Promise<number> {
  const result = await sql<{ n: number }>`
    with recursive chain(pid) as (
      select a.pid from pg_stat_activity a where ${holder}::int = any(pg_blocking_pids(a.pid)) and a.pid <> pg_backend_pid()
      union
      select a.pid from pg_stat_activity a join chain c on c.pid = any(pg_blocking_pids(a.pid)) where a.pid <> pg_backend_pid()
    )
    select count(*)::int as n from chain
  `.execute(db)
  return result.rows[0]?.n ?? 0
}

async function deadlockCount(): Promise<number> {
  const result = await sql<{ n: number }>`select deadlocks::int as n from pg_stat_database where datname = current_database()`.execute(db)
  return result.rows[0]!.n
}

interface Fx {
  owner: Awaited<ReturnType<typeof signup>>
  holder: Awaited<ReturnType<typeof signup>>
  projectId: string
  menuId: string
  pageId: string
  holderTab: WsProbe
  snapshotId: string
}

async function fixture(ctx: RealApiContext): Promise<Fx> {
  const owner = await signup(ctx)
  const holder = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  await addMember(ctx, project.id, holder.user.id, 'editor')
  const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '메뉴' })
  const page = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '페이지' })
  const put = await ctx.app.inject({
    method: 'PUT',
    url: `/api/projects/${project.id}/pages/${page.id}/schema`,
    cookies: owner.cookie,
    payload: {
      schema: {
        version: 3,
        root: { id: 'n_root', type: 'Page', children: ['n_a', 'n_b', 'n_c'].map((id) => ({ id, type: 'Text', props: { content: id } })) },
      },
    } as never,
  })
  if (put.statusCode !== 200) throw new Error(`PUT 실패 (${put.statusCode}): ${put.body}`)
  const snapshot = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${project.id}/snapshots`,
    cookies: owner.cookie,
    payload: { tag: 'base' },
  })
  if (snapshot.statusCode !== 201) throw new Error(`스냅샷 실패 (${snapshot.statusCode}): ${snapshot.body}`)
  const holderTab = await joinRoom(ctx.port, project.id, holder.cookie.wb_session)
  opened.push(holderTab)
  return {
    owner,
    holder,
    projectId: project.id,
    menuId: menu.id,
    pageId: page.id,
    holderTab,
    snapshotId: (snapshot.json() as { id: string }).id,
  }
}

interface Writer {
  name: string
  /** 상대 쓰기를 보낸다 — 끝나는 `Promise`. */
  send: (ctx: RealApiContext, fx: Fx) => Promise<{ statusCode: number }>
  expect: number
}

const WRITERS: Writer[] = [
  {
    name: '편집 커밋(PATCH …/ops)',
    expect: 200,
    send: async (ctx, fx) => {
      const head = (
        (
          await ctx.app.inject({ method: 'GET', url: `/api/projects/${fx.projectId}/pages/${fx.pageId}`, cookies: fx.owner.cookie })
        ).json() as { headSeq: number }
      ).headSeq
      return ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/ops`,
        cookies: fx.owner.cookie,
        payload: { baseSeq: head, ops: [{ op: 'replace', path: '/root/children/2/props', value: { content: '고침' } }] },
      })
    },
  },
  {
    name: '스냅샷 복원',
    expect: 200,
    send: async (ctx, fx) =>
      ctx.app.inject({ method: 'POST', url: `/api/projects/${fx.projectId}/snapshots/${fx.snapshotId}/restore`, cookies: fx.owner.cookie }),
  },
  {
    name: '메뉴 연쇄 삭제',
    expect: 200,
    send: async (ctx, fx) =>
      ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${fx.projectId}/menu/${fx.menuId}`,
        cookies: fx.owner.cookie,
        payload: { cascade: true, expect: { menuIds: [], pageIds: [fx.pageId] } },
      }),
  },
  {
    name: '프로젝트 삭제',
    expect: 204,
    send: async (ctx, fx) => ctx.app.inject({ method: 'DELETE', url: `/api/projects/${fx.projectId}`, cookies: fx.owner.cookie }),
  },
]

describe('집합 lock 과 페이지 행을 FOR UPDATE 로 잡는 쓰기는 줄 서도 교착이 없다', () => {
  for (const writer of WRITERS) {
    for (const order of ['lock 먼저', '쓰기 먼저'] as const) {
      it(`${writer.name} · ${order}`, { timeout: 60_000 }, async () => {
        await withRealApi(async (ctx) => {
          const fx = await fixture(ctx)
          const deadlocksBefore = await deadlockCount()
          const row = await holdPageRow(fx.pageId)
          const sendLock = () => fx.holderTab.send(JSON.stringify({ type: 'lock', pageId: fx.pageId, nodeIds: ['n_a', 'n_b'], lockId: 1 }))
          let pending: Promise<{ statusCode: number }> | null = null
          const sendWrite = () => {
            pending = writer.send(ctx, fx)
          }
          let lined: unknown
          try {
            if (order === 'lock 먼저') {
              sendLock()
              await until('`lock` 이 페이지 행에 줄 선다', async () => (await waitersBehind(row.pid)) >= 1)
              sendWrite()
            } else {
              sendWrite()
              await until(`${writer.name} 이 페이지 행에 줄 선다`, async () => (await waitersBehind(row.pid)) >= 1)
              sendLock()
            }
            await until('둘 다 페이지 행에 줄 선다', async () => (await waitersBehind(row.pid)) >= 2)
          } catch (error) {
            lined = error
          }
          await row.release()
          if (lined !== undefined) {
            await pending
            throw lined
          }
          const res = await pending!
          expect(res.statusCode, `${writer.name} 의 답`).toBe(writer.expect)
          // 놓은 뒤 줄이 다 풀렸다 — 아무도 안 기다린다.
          await until('줄이 풀린다', async () => (await waitersBehind(row.pid)) === 0)
          await sleep(1_200) // 통계(`pg_stat_database.deadlocks`)가 내보내지는 주기
          expect(await deadlockCount()).toBe(deadlocksBefore)
        })
      })
    }
  }
})
