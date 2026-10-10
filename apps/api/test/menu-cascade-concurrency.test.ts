/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `withRealApi`를 쓴다 — 두 요청이 서로 다른 커넥션에서 잠금을 다퉈야 줄이 서고 교착이
 * 선다(롤백 하네스는 요청들이 한 트랜잭션을 나눠 쓴다).
 *
 * # 무엇을 재나 — 메뉴 연쇄 삭제와 겹친 쓰기
 *
 * 연쇄 삭제(`services/menu-cascade.ts`)는 복원과 같은 잠금(`lockProjectForRestore` — 프로젝트 행 → 메뉴 → 페이지 → 레이아웃 →
 * 코멘트)을 쥔다. 겹친 쓰기마다 **두 차례를 다** 세운다 — 테스트 트랜잭션으로 둘이 만날 행(프로젝트 행 · 페이지 행 · 메뉴 행)을 쥐고,
 * 앞 요청이 그 행의 줄에 선 것을 본 뒤 뒤 요청을 쏘고, 둘 다 선 것을 본 뒤 놓는다(`queued`). 행 잠금의 대기열은 도착 순이라 놓은 뒤
 * 잠금을 받는 차례도 그 차례다. **줄이 안 서면 던진다** — 겹치지 않은 판을 초록 · 빨강 어느 쪽으로도 세지 않는다.
 *
 * 판마다 본다: 교착이 없다(500 이 없다 — 교착의 희생자는 500 이다) · 상태 코드 · 끝 상태(남은 행 · 목록 불일치 409 의 지금 목록).
 *
 * **같은 수 · 다른 행의 판**(남이 하나 빼고 하나 넣음)은 상대 쓰기 둘을 연쇄와 한 줄에 세운다 — 수로 견주면 지나가 사람이 본 적 없는
 * 행을 지우던 판이다(`services/menu-cascade.ts` 머리말 3).
 *
 * **고치기 전(main)과의 견줌**은 본문 없는 메뉴 삭제(빈 메뉴) ∥ 그 메뉴에 페이지 추가다 — 그 길은 이 묶음이 안 바꿨다
 * (`routes/menu.ts`의 `DELETE` 머리말 표의 첫 두 줄).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import type { PatchOp } from '@wirebound/schema'
import type { ServerFrame } from '../src/ws/protocol'
import { withTransaction } from '../src/db/tx'
import { CASCADE_SAFETY_KEEP } from '../src/services/menu-cascade'
import {
  createMenuNode,
  createPage,
  createProject,
  getTestDb,
  resetRealData,
  signup,
  withRealApi,
  type RealApiContext,
  type SignedUpUser,
} from './helpers'
import { joinRoom, type WsProbe } from './ws-client'

beforeEach(resetRealData)
afterEach(resetRealData)

const db = getTestDb()

/** 한 판(차례 하나)을 몇 번 되풀이하나. 차례를 정해 세우므로 판마다 같은 길을 지난다 — 되풀이는 흔들림을 보려는 것이다. */
const ROUNDS = 2

interface Board {
  ctx: RealApiContext
  owner: SignedUpUser
  projectId: string
  /** 지울 메뉴 «회원관리» — 페이지 하나(`p1`) · 하위 메뉴 하나(`sub` — 페이지 `p2`). */
  target: string
  sub: string
  p1: string
  p2: string
  /** 밖의 빈 메뉴 — 안으로 옮겨 넣을 것. */
  spare: string
}

/** 화면이 본 것 — `sub` 하나 · `p1` · `p2`. */
function seenOf(b: Board): { menuIds: string[]; pageIds: string[] } {
  return { menuIds: [b.sub], pageIds: [b.p1, b.p2] }
}

async function board(ctx: RealApiContext): Promise<Board> {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const target = await createMenuNode(ctx, owner.cookie, project.id, { title: '회원관리' })
  const spare = await createMenuNode(ctx, owner.cookie, project.id, { title: '빈 메뉴' })
  const sub = await createMenuNode(ctx, owner.cookie, project.id, { parentId: target.id, title: '등급' })
  const p1 = await createPage(ctx, owner.cookie, project.id, target.id, { title: '목록' })
  const p2 = await createPage(ctx, owner.cookie, project.id, sub.id, { title: '등급표' })
  return { ctx, owner, projectId: project.id, target: target.id, sub: sub.id, p1: p1.id, p2: p2.id, spare: spare.id }
}

type Answer = { statusCode: number; body: string }

function send(b: Board, method: 'PATCH' | 'POST' | 'DELETE', path: string, payload?: object): Promise<Answer> {
  return b.ctx.app.inject({
    method,
    url: `/api/projects/${b.projectId}${path}`,
    cookies: b.owner.cookie,
    ...(payload === undefined ? {} : { payload }),
  })
}

function cascade(b: Board, menuId = b.target, seen = seenOf(b)): Promise<Answer> {
  return send(b, 'DELETE', `/menu/${menuId}`, { cascade: true, expect: seen })
}

/** 쥔 백엔드(`holder`) 뒤에 사슬로 선 백엔드 수 — `comments-concurrency.test.ts`의 `waitersBehind`와 같은 질의 · 같은 한계. */
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

async function waitForWaiters(holder: number, waiters: number, label: string): Promise<void> {
  const deadline = Date.now() + 5_000
  while ((await waitersBehind(holder)) < waiters) {
    if (Date.now() > deadline) throw new Error(`${label}: 요청 ${waiters}개가 줄을 서지 않았습니다 — 요청이 겹치지 않았습니다`)
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

type Held = 'projects' | 'pages' | 'menu_nodes'

/** 행 하나를 `FOR UPDATE`로 쥔다 — 놓을 때까지 그 행을 잠그는 요청이 그 뒤에 선다. */
async function holdRow(table: Held, id: string): Promise<{ pid: number; release: () => Promise<void> }> {
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
    await sql`select id from ${sql.table(table)} where id = ${id} for update`.execute(trx)
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

/**
 * 행을 쥔 채 `runs`를 차례로 줄 세우고 놓는다. `runs[i]`는 앞의 `i`개가 줄을 선 것을 본 뒤에 시작한다. 결과는 `runs`의 차례로.
 */
async function queued<T>(
  table: Held,
  id: string,
  runs: Array<() => Promise<T>>,
  label: string,
  /** 모두 줄을 선 뒤 · 놓기 전에 부른다 — 줄에 선 요청이 아직 무엇을 안 건드렸는지 본다. */
  whileLined?: () => Promise<void>,
): Promise<T[]> {
  const holder = await holdRow(table, id)
  const running: Promise<T>[] = []
  let lined: unknown
  try {
    for (const [index, run] of runs.entries()) {
      running.push(run())
      await waitForWaiters(holder.pid, index + 1, label)
    }
    if (whileLined !== undefined) await whileLined()
  } catch (error) {
    lined = error
  }
  await holder.release()
  const results = await Promise.all(running)
  if (lined !== undefined) throw lined
  return results
}

async function ids(table: 'menu_nodes' | 'pages', projectId: string): Promise<string[]> {
  const rows = await db.selectFrom(table).select('id').where('project_id', '=', projectId).execute()
  return rows.map((row) => row.id).sort()
}

interface Listing {
  title: string
  menus: { id: string; title: string }[]
  pages: { id: string; title: string }[]
}

/** 목록 불일치 409 의 지금 목록 — 이름으로 줄인다(판의 이름은 겹치지 않는다). 다른 답이면 `null`. */
function changedTo(answer: Answer): { menus: string[]; pages: string[] } | null {
  if (answer.statusCode !== 409) return null
  const issue = (JSON.parse(answer.body) as { error: { issues?: { code: string; subtree?: Listing }[] } }).error.issues?.[0]
  if (issue?.code !== 'menu-subtree-changed' || issue.subtree === undefined) return null
  return { menus: issue.subtree.menus.map((menu) => menu.title), pages: issue.subtree.pages.map((page) => page.title) }
}

/** 두 차례 × `ROUNDS`. `check`가 판마다 상태 코드와 끝 상태를 본다. */
async function bothOrders(
  label: string,
  table: (b: Board) => [Held, string],
  other: (b: Board) => Promise<Answer>,
  check: (b: Board, order: 'cascade-first' | 'other-first', cascadeAnswer: Answer, otherAnswer: Answer) => Promise<void>,
  /** 판을 세운 뒤 · 행을 쥐기 전에 부른다(복원할 스냅샷 찍기). */
  prepare?: (b: Board) => Promise<void>,
): Promise<void> {
  await bothOrdersOf(label, table, [other], (b, order, cascadeAnswer, [otherAnswer]) => check(b, order, cascadeAnswer, otherAnswer!), prepare)
}

/** `bothOrders`의 상대 쓰기 여럿 판 — `others`는 그 차례로 줄에 서고, 연쇄는 그 앞이나 뒤에 선다. */
async function bothOrdersOf(
  label: string,
  table: (b: Board) => [Held, string],
  others: Array<(b: Board) => Promise<Answer>>,
  check: (b: Board, order: 'cascade-first' | 'other-first', cascadeAnswer: Answer, otherAnswers: Answer[]) => Promise<void>,
  prepare?: (b: Board) => Promise<void>,
): Promise<void> {
  await withRealApi(async (ctx) => {
    for (let round = 0; round < ROUNDS; round += 1) {
      for (const order of ['cascade-first', 'other-first'] as const) {
        const b = await board(ctx)
        if (prepare !== undefined) await prepare(b)
        const [heldTable, heldId] = table(b)
        const otherRuns = others.map((other) => () => other(b))
        const runs = order === 'cascade-first' ? [() => cascade(b), ...otherRuns] : [...otherRuns, () => cascade(b)]
        const answers = await queued(heldTable, heldId, runs, `${label} · ${order}`)
        const cascadeAnswer = order === 'cascade-first' ? answers[0]! : answers[answers.length - 1]!
        const otherAnswers = order === 'cascade-first' ? answers.slice(1) : answers.slice(0, -1)
        // 교착의 희생자는 500 이다.
        expect(answers.map((answer) => answer.statusCode), `${label} · ${order} · ${answers.map((answer) => answer.body).join(' · ')}`).not.toContain(500)
        await check(b, order, cascadeAnswer, otherAnswers)
      }
    }
  })
}

describe('메뉴 연쇄 삭제와 겹친 트리 쓰기 — 프로젝트 행에서 만난다', () => {
  it('서브트리 안에 페이지 추가 — 추가가 먼저면 연쇄가 409(목록 바뀜) · 연쇄가 먼저면 추가가 404', async () => {
    await bothOrders(
      '페이지 추가',
      (b) => ['projects', b.projectId],
      (b) => send(b, 'POST', '/pages', { menuNodeId: b.sub, title: '끼어든 페이지' }),
      async (b, order, deleted, added) => {
        if (order === 'other-first') {
          expect(added.statusCode, added.body).toBe(201)
          expect(changedTo(deleted)).toEqual({ menus: ['등급'], pages: ['목록', '등급표', '끼어든 페이지'] })
          expect(await ids('pages', b.projectId)).toHaveLength(3)
        } else {
          expect(deleted.statusCode, deleted.body).toBe(200)
          expect(added.statusCode, added.body).toBe(404)
          expect(await ids('pages', b.projectId)).toEqual([])
          expect(await ids('menu_nodes', b.projectId)).toEqual([b.spare])
        }
      },
    )
  })

  it('밖 → 안 메뉴 옮기기 — 옮기기가 먼저면 409(하위 메뉴가 늘어난 목록) · 연쇄가 먼저면 옮기기가 404', async () => {
    await bothOrders(
      '밖 → 안',
      (b) => ['projects', b.projectId],
      (b) => send(b, 'PATCH', `/menu/${b.spare}`, { parentId: b.target }),
      async (b, order, deleted, moved) => {
        if (order === 'other-first') {
          expect(moved.statusCode, moved.body).toBe(200)
          expect(changedTo(deleted)).toEqual({ menus: ['등급', '빈 메뉴'], pages: ['목록', '등급표'] })
          expect(await ids('menu_nodes', b.projectId)).toHaveLength(3)
        } else {
          expect(deleted.statusCode, deleted.body).toBe(200)
          expect(moved.statusCode, moved.body).toBe(404)
          expect(await ids('menu_nodes', b.projectId)).toEqual([b.spare])
        }
      },
    )
  })

  it('안 → 밖 메뉴 옮기기 — 옮기기가 먼저면 409(하위 메뉴 · 그 페이지가 빠진 목록) · 연쇄가 먼저면 옮기기가 404', async () => {
    await bothOrders(
      '안 → 밖',
      (b) => ['projects', b.projectId],
      (b) => send(b, 'PATCH', `/menu/${b.sub}`, { parentId: null }),
      async (b, order, deleted, moved) => {
        if (order === 'other-first') {
          expect(moved.statusCode, moved.body).toBe(200)
          expect(changedTo(deleted)).toEqual({ menus: [], pages: ['목록'] })
          expect(await ids('pages', b.projectId)).toHaveLength(2)
        } else {
          expect(deleted.statusCode, deleted.body).toBe(200)
          expect(moved.statusCode, moved.body).toBe(404)
          expect(await ids('menu_nodes', b.projectId)).toEqual([b.spare])
        }
      },
    )
  })

  it('같은 수 · 다른 페이지(리뷰의 판) — 남이 페이지 하나를 밖으로 · 새 페이지 하나를 안으로: 남이 먼저면 409(지금 목록) · 아무것도 안 지움', async () => {
    await bothOrdersOf(
      '페이지 하나 밖 + 하나 안',
      (b) => ['projects', b.projectId],
      [
        (b) => send(b, 'PATCH', `/pages/${b.p1}`, { menuNodeId: b.spare }),
        (b) => send(b, 'POST', '/pages', { menuNodeId: b.target, title: '새 결제 화면(bob)' }),
      ],
      async (b, order, deleted, [moved, added]) => {
        if (order === 'other-first') {
          expect(moved!.statusCode, moved!.body).toBe(200)
          expect(added!.statusCode, added!.body).toBe(201)
          expect(changedTo(deleted)).toEqual({ menus: ['등급'], pages: ['새 결제 화면(bob)', '등급표'] })
          expect(await ids('pages', b.projectId)).toHaveLength(3)
          expect(await ids('menu_nodes', b.projectId)).toHaveLength(3)
        } else {
          expect(deleted.statusCode, deleted.body).toBe(200)
          expect(moved!.statusCode, moved!.body).toBe(404)
          expect(added!.statusCode, added!.body).toBe(404)
          expect(await ids('pages', b.projectId)).toEqual([])
          expect(await ids('menu_nodes', b.projectId)).toEqual([b.spare])
        }
      },
    )
  })

  it('같은 수 · 다른 메뉴 — 남이 하위 메뉴 하나를 밖으로 · 페이지 든 메뉴 하나를 안으로: 남이 먼저면 409(지금 목록) · 아무것도 안 지움', async () => {
    let sparePage = ''
    await bothOrdersOf(
      '메뉴 하나 밖 + 하나 안',
      (b) => ['projects', b.projectId],
      [
        (b) => send(b, 'PATCH', `/menu/${b.sub}`, { parentId: null }),
        (b) => send(b, 'PATCH', `/menu/${b.spare}`, { parentId: b.target }),
      ],
      async (b, order, deleted, [out, into]) => {
        if (order === 'other-first') {
          expect(out!.statusCode, out!.body).toBe(200)
          expect(into!.statusCode, into!.body).toBe(200)
          expect(changedTo(deleted)).toEqual({ menus: ['빈 메뉴'], pages: ['목록', '들어온 페이지'] })
          expect(await ids('menu_nodes', b.projectId)).toHaveLength(3)
          expect(await ids('pages', b.projectId)).toHaveLength(3)
        } else {
          expect(deleted.statusCode, deleted.body).toBe(200)
          expect(out!.statusCode, out!.body).toBe(404)
          expect(into!.statusCode, into!.body).toBe(404)
          expect(await ids('menu_nodes', b.projectId)).toEqual([b.spare])
          expect(await ids('pages', b.projectId)).toEqual([sparePage])
        }
      },
      async (b) => {
        sparePage = (await createPage(b.ctx, b.owner.cookie, b.projectId, b.spare, { title: '들어온 페이지' })).id
      },
    )
  })

  it('삭제 직전 남이 서브트리 안에 하위 메뉴를 만듦 — 만들기가 먼저면 409(새 메뉴가 든 목록) · 연쇄가 먼저면 만들기가 404', async () => {
    await bothOrders(
      '하위 메뉴 만들기',
      (b) => ['projects', b.projectId],
      (b) => send(b, 'POST', '/menu', { parentId: b.target, title: '끼어든 하위' }),
      async (b, order, deleted, created) => {
        if (order === 'other-first') {
          expect(created.statusCode, created.body).toBe(201)
          expect(changedTo(deleted)).toEqual({ menus: ['등급', '끼어든 하위'], pages: ['목록', '등급표'] })
          expect(await ids('menu_nodes', b.projectId)).toHaveLength(4)
          expect(await ids('pages', b.projectId)).toHaveLength(2)
        } else {
          expect(deleted.statusCode, deleted.body).toBe(200)
          expect(created.statusCode, created.body).toBe(404)
          expect(await ids('menu_nodes', b.projectId)).toEqual([b.spare])
        }
      },
    )
  })

  it('같은 메뉴의 연쇄 삭제 둘 — 앞이 200 · 뒤가 404', async () => {
    await bothOrders(
      '연쇄 둘',
      (b) => ['projects', b.projectId],
      (b) => cascade(b),
      async (b, _order, first, second) => {
        expect([first.statusCode, second.statusCode].sort()).toEqual([200, 404])
        expect(await ids('menu_nodes', b.projectId)).toEqual([b.spare])
        // 안전망은 지운 쪽 하나만 남는다 — 404 는 아무것도 안 쓴다.
        const snapshots = await db.selectFrom('snapshots').select('id').where('project_id', '=', b.projectId).execute()
        expect(snapshots).toHaveLength(1)
      },
    )
  })

  it('스냅샷 복원 — 어느 차례든 둘 다 성공 · 복원이 뒤면 서브트리가 돌아온다', async () => {
    const snapshotOf = new Map<string, string>()
    await bothOrders(
      '복원',
      (b) => ['projects', b.projectId],
      (b) => send(b, 'POST', `/snapshots/${snapshotOf.get(b.projectId)}/restore`),
      async (b, order, deleted, restored) => {
        expect(deleted.statusCode, deleted.body).toBe(200)
        expect(restored.statusCode, restored.body).toBe(200)
        const menus = await ids('menu_nodes', b.projectId)
        if (order === 'cascade-first') expect(menus).toEqual([b.target, b.sub, b.spare].sort())
        else expect(menus).toEqual([b.spare])
      },
      async (b) => {
        const taken = await send(b, 'POST', '/snapshots', { tag: '지우기 전' })
        expect(taken.statusCode, taken.body).toBe(201)
        snapshotOf.set(b.projectId, (JSON.parse(taken.body) as { id: string }).id)
      },
    )
  })

  it('프로젝트 삭제 — 프로젝트 삭제가 먼저면 연쇄가 404 · 연쇄가 먼저면 둘 다 성공', async () => {
    await bothOrders(
      '프로젝트 삭제',
      (b) => ['projects', b.projectId],
      (b) => send(b, 'DELETE', ''),
      async (b, order, deleted, gone) => {
        expect(gone.statusCode, gone.body).toBe(204)
        if (order === 'other-first') expect(deleted.statusCode, deleted.body).toBe(404)
        else expect(deleted.statusCode, deleted.body).toBe(200)
        expect(await ids('menu_nodes', b.projectId)).toEqual([])
      },
    )
  })

  it('고치기 전과 같은 길(대조군) — 본문 없는 빈 메뉴 삭제 ∥ 그 메뉴에 페이지 추가', async () => {
    await withRealApi(async (ctx) => {
      for (const order of ['delete-first', 'add-first'] as const) {
        const b = await board(ctx)
        const remove = () => send(b, 'DELETE', `/menu/${b.spare}`)
        const add = () => send(b, 'POST', '/pages', { menuNodeId: b.spare, title: '끼어든 페이지' })
        const [first, second] = await queued('projects', b.projectId, order === 'delete-first' ? [remove, add] : [add, remove], `대조군 · ${order}`)
        if (order === 'delete-first') expect([first!.statusCode, second!.statusCode]).toEqual([204, 404])
        else expect([first!.statusCode, second!.statusCode]).toEqual([201, 409])
      }
    })
  })
})

/**
 * **안전망 상한**(`services/menu-cascade.ts` 머리말 «안전망 스냅샷») — 상한에 닿은 프로젝트의 연쇄는 가장 오래된 안전망을 지운다. 지우기는
 * 프로젝트 행을 쥔 뒤라, 그 스냅샷으로 복원하는 요청과 프로젝트 삭제가 프로젝트 행에서 줄을 선다. 상한에 안 닿은 같은 겹침(대조군)은 위의
 * «스냅샷 복원» · «프로젝트 삭제»다.
 */
describe('안전망 상한 — 지우는 연쇄와 겹친 복원 · 프로젝트 삭제', () => {
  /** 판에 상한만큼 안전망을 쌓는다(서브트리 밖 메뉴 · 페이지를 하나씩 연쇄로 지운다) — 가장 오래된 것의 id. */
  async function fill(b: Board): Promise<string> {
    let oldest: string | undefined
    for (let i = 0; i < CASCADE_SAFETY_KEEP; i += 1) {
      const menu = await createMenuNode(b.ctx, b.owner.cookie, b.projectId, { title: `쌓을 ${i}` })
      const page = await createPage(b.ctx, b.owner.cookie, b.projectId, menu.id, { title: `쌓을 페이지 ${i}` })
      const res = await cascade(b, menu.id, { menuIds: [], pageIds: [page.id] })
      expect(res.statusCode, res.body).toBe(200)
      oldest ??= (JSON.parse(res.body) as { safetySnapshot: { id: string } }).safetySnapshot.id
    }
    return oldest!
  }

  async function exists(snapshotId: string): Promise<boolean> {
    return (await db.selectFrom('snapshots').select('id').where('id', '=', snapshotId).executeTakeFirst()) !== undefined
  }

  /** 다른 연결에서 그 행을 잠가 본다 — 남이 쥐었으면(지우는 중) 거른다. */
  async function rowFree(snapshotId: string): Promise<boolean> {
    const rows = await sql`select id from snapshots where id = ${snapshotId} for update skip locked`.execute(db)
    return rows.rows.length === 1
  }

  it('밀려날 안전망으로 복원 — 연쇄가 먼저면 복원이 404 · 복원이 먼저면 둘 다 성공하고 그 뒤에 지워진다 · 줄에 선 동안 그 행은 아무도 안 쥔다', async () => {
    await withRealApi(async (ctx) => {
      for (let round = 0; round < ROUNDS; round += 1) {
        for (const order of ['cascade-first', 'restore-first'] as const) {
          const b = await board(ctx)
          const oldest = await fill(b)
          const restore = () => send(b, 'POST', `/snapshots/${oldest}/restore`)
          const label = `안전망 상한 · 복원 · ${order}`
          let freeWhileLined: boolean | undefined
          const answers = await queued(
            'projects',
            b.projectId,
            order === 'cascade-first' ? [() => cascade(b), restore] : [restore, () => cascade(b)],
            label,
            async () => {
              freeWhileLined = await rowFree(oldest)
            },
          )
          const [deleted, restored] = order === 'cascade-first' ? answers : [answers[1]!, answers[0]!]
          expect(answers.map((answer) => answer.statusCode), `${label} · ${answers.map((answer) => answer.body).join(' · ')}`).not.toContain(500)
          expect(freeWhileLined, label).toBe(true)
          expect(deleted!.statusCode, deleted!.body).toBe(200)
          if (order === 'cascade-first') {
            expect(restored!.statusCode, restored!.body).toBe(404)
            expect((JSON.parse(restored!.body) as { error: { message: string } }).error.message).toBe('스냅샷을 찾을 수 없습니다')
          } else {
            expect(restored!.statusCode, restored!.body).toBe(200)
          }
          expect(await exists(oldest), label).toBe(false)
          const kept = await db
            .selectFrom('snapshots')
            .select('id')
            .where('project_id', '=', b.projectId)
            .where('kind', '=', 'cascade-safety')
            .execute()
          expect(kept, label).toHaveLength(CASCADE_SAFETY_KEEP)
        }
      }
    })
  })

  it('프로젝트 삭제 — 어느 차례든 교착이 없다 · 프로젝트 삭제가 먼저면 연쇄가 404', async () => {
    const oldestOf = new Map<string, string>()
    await bothOrders(
      '안전망 상한 · 프로젝트 삭제',
      (b) => ['projects', b.projectId],
      (b) => send(b, 'DELETE', ''),
      async (b, order, deleted, gone) => {
        expect(gone.statusCode, gone.body).toBe(204)
        if (order === 'other-first') expect(deleted.statusCode, deleted.body).toBe(404)
        else expect(deleted.statusCode, deleted.body).toBe(200)
        expect(await exists(oldestOf.get(b.projectId)!)).toBe(false)
        expect(await db.selectFrom('snapshots').select('id').where('project_id', '=', b.projectId).execute()).toEqual([])
      },
      async (b) => {
        oldestOf.set(b.projectId, await fill(b))
      },
    )
  })
})

describe('안전망 스냅샷은 지우는 그 순간의 프로젝트다', () => {
  /**
   * **서브트리 밖의 페이지도 잠그는 까닭**(`services/menu-cascade.ts` 머리말의 1). 밖의 페이지를 고치는 트랜잭션이 열려 있으면 연쇄는 그
   * 커밋을 기다린 뒤 캡처한다 — 안전망에 그 편집이 실린다. 서브트리(또는 트리)만 잠그면 기다리지 않고 캡처해 안전망이 커밋된 편집을
   * 빠뜨린다(그 안전망으로 복원하면 그 편집이 사라진다). 그 편집이 캡처 한가운데 커밋되면 지문이 어긋나 409 다.
   */
  it('밖의 페이지를 고치는 트랜잭션이 열려 있으면 그 커밋을 기다려 안전망에 싣는다', async () => {
    await withRealApi(async (ctx) => {
      const b = await board(ctx)
      const outside = await createPage(ctx, b.owner.cookie, b.projectId, b.spare, { title: '밖' })
      let release!: () => void
      const released = new Promise<void>((resolve) => {
        release = resolve
      })
      let holderPid = 0
      let markHeld!: () => void
      const held = new Promise<void>((resolve) => {
        markHeld = resolve
      })
      const holder = withTransaction(db, async (trx) => {
        await trx.updateTable('pages').set({ title: '밖 — 고친 뒤' }).where('id', '=', outside.id).execute()
        holderPid = (await sql<{ pid: number }>`select pg_backend_pid() as pid`.execute(trx)).rows[0]!.pid
        markHeld()
        await released
      })
      await held
      const pending = cascade(b)
      // 줄을 섰는지를 값으로 남긴다 — 서지 않은 판(잠그지 않는 변조)이 시간 초과가 아니라 이 값으로 죽게.
      const deadline = Date.now() + 1_000
      let lined = false
      while (Date.now() < deadline) {
        if ((await waitersBehind(holderPid)) >= 1) {
          lined = true
          break
        }
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      release()
      await holder
      const answer = await pending
      expect(lined).toBe(true)
      expect(answer.statusCode, answer.body).toBe(200)
      const safetyId = (JSON.parse(answer.body) as { safetySnapshot: { id: string } }).safetySnapshot.id
      const row = await db.selectFrom('snapshots').select('payload').where('id', '=', safetyId).executeTakeFirstOrThrow()
      const titles = (row.payload as { pages: { id: string; title: string }[] }).pages.map((page) => [page.id, page.title])
      expect(titles).toContainEqual([outside.id, '밖 — 고친 뒤'])
    })
  })
})

describe('기다리는 사이 멤버에서 빠진 사람', () => {
  /**
   * **재확인이 목록을 견주기 전이다**(`services/menu-cascade.ts` 머리말의 2) — 프로젝트 행에서 기다리는 동안 멤버에서 빠진 사람에게 지금
   * 목록을 409 로 흘리지 않는다. 멤버 삭제는 프로젝트 행을 안 잡아(`restore-lock-census.test.ts`의 «막히지 않는 줄») 연쇄가 기다리는
   * 동안 끝난다.
   */
  it('목록이 틀린 연쇄 삭제를 낸 editor 가 기다리는 사이 빠지면 409(지금 목록)가 아니라 거절이다', async () => {
    await withRealApi(async (ctx) => {
      const b = await board(ctx)
      const bob = await signup(ctx)
      await ctx.db.insertInto('project_members').values({ project_id: b.projectId, user_id: bob.user.id, role: 'editor' }).execute()
      const holder = await holdRow('projects', b.projectId)
      let answer: Answer
      try {
        const pending = ctx.app.inject({
          method: 'DELETE',
          url: `/api/projects/${b.projectId}/menu/${b.target}`,
          cookies: bob.cookie,
          payload: { cascade: true, expect: { menuIds: [], pageIds: [] } },
        })
        await waitForWaiters(holder.pid, 1, '빠진 멤버')
        const removed = await send(b, 'DELETE', `/members/${bob.user.id}`)
        expect(removed.statusCode, removed.body).toBe(204)
        await holder.release()
        answer = await pending
      } finally {
        await holder.release().catch(() => undefined)
      }
      expect(answer.statusCode, answer.body).not.toBe(409)
      expect([403, 404]).toContain(answer.statusCode)
      expect(answer.body).not.toContain('"menus"')
      expect(await ids('menu_nodes', b.projectId)).toHaveLength(3)
    })
  })
})

describe('메뉴 연쇄 삭제와 겹친 행 쓰기 — 그 행에서 만난다', () => {
  it('메뉴 이름 바꾸기(바탕 있음) — 이름이 먼저면 둘 다 성공 · 연쇄가 먼저면 이름이 404', async () => {
    await bothOrders(
      '메뉴 이름',
      (b) => ['menu_nodes', b.sub],
      (b) => send(b, 'PATCH', `/menu/${b.sub}`, { title: '새 이름', base: { title: '등급' } }),
      async (b, order, deleted, renamed) => {
        expect(deleted.statusCode, deleted.body).toBe(200)
        expect(renamed.statusCode, renamed.body).toBe(order === 'other-first' ? 200 : 404)
        expect(await ids('menu_nodes', b.projectId)).toEqual([b.spare])
      },
    )
  })

  it('페이지 이름 바꾸기(바탕 있음) — 이름이 먼저면 둘 다 성공 · 연쇄가 먼저면 이름이 404', async () => {
    await bothOrders(
      '페이지 이름',
      (b) => ['pages', b.p1],
      (b) => send(b, 'PATCH', `/pages/${b.p1}`, { title: '새 이름', base: { title: '목록' } }),
      async (b, order, deleted, renamed) => {
        expect(deleted.statusCode, deleted.body).toBe(200)
        expect(renamed.statusCode, renamed.body).toBe(order === 'other-first' ? 200 : 404)
        expect(await ids('pages', b.projectId)).toEqual([])
      },
    )
  })
})

describe('메뉴 연쇄 삭제와 겹친 페이지 편집(WS patch)', () => {
  const ADD: PatchOp[] = [{ op: 'add', path: '/root/children/-', value: { id: 'n_late', type: 'Text', props: {} } }]

  it('편집이 먼저면 ack 뒤 연쇄 200 · 연쇄가 먼저면 편집이 patch-error(not-found)', async () => {
    await withRealApi(async (ctx) => {
      for (let round = 0; round < ROUNDS; round += 1) {
        for (const order of ['cascade-first', 'edit-first'] as const) {
          const b = await board(ctx)
          const probe: WsProbe = await joinRoom(ctx.port, b.projectId, b.owner.cookie.wb_session)
          try {
            const head = await db.selectFrom('pages').select('head_seq').where('id', '=', b.p1).executeTakeFirstOrThrow()
            const clientOpId = `op-${round}-${order}`
            const edit = async (): Promise<ServerFrame> => {
              probe.send(JSON.stringify({ type: 'patch', pageId: b.p1, baseSeq: Number(head.head_seq), ops: ADD, clientOpId }))
              const deadline = Date.now() + 10_000
              for (;;) {
                const found = probe.received.find(
                  (frame) => (frame.type === 'patch-ack' || frame.type === 'patch-error') && frame.clientOpId === clientOpId,
                )
                if (found !== undefined) return found
                if (Date.now() > deadline) throw new Error(`patch 답이 안 왔습니다: ${JSON.stringify(probe.received)}`)
                await new Promise((resolve) => setTimeout(resolve, 10))
              }
            }
            const results = await queued<unknown>(
              'pages',
              b.p1,
              order === 'cascade-first' ? [() => cascade(b), edit] : [edit, () => cascade(b)],
              `WS patch · ${order}`,
            )
            const [deleted, frame] = (order === 'cascade-first' ? results : [results[1], results[0]]) as [Answer, ServerFrame]
            expect(deleted.statusCode, deleted.body).toBe(200)
            if (order === 'edit-first') expect(frame.type).toBe('patch-ack')
            else {
              expect(frame.type).toBe('patch-error')
              expect((frame as Extract<ServerFrame, { type: 'patch-error' }>).code).toBe('not-found')
            }
            expect(await ids('pages', b.projectId)).toEqual([])
          } finally {
            probe.close()
          }
        }
      }
    })
  })
})
