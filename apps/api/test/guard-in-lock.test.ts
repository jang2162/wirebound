/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `restore-lock-census.test.ts`와 같은 부류다.
 *
 * # 무엇을 재나 — 커밋 순간의 권한 (이월 AA)
 *
 * 권한 가드(`projectGuard`)는 핸들러 **앞에서 한 번** 돈다. 쓰기가 페이지 잠금에 쥐인 동안 그 사람이
 * 강등되거나 멤버에서 빠져도, 잠금이 풀리면 **그 사람 이름으로 커밋됐다**(좁은 반증 4차 a-4 — Chrome,
 * psql 이 페이지 행을 22s 쥔 판: 22s 에 커밋된 행의 작성자는 그 순간 이미 viewer·비멤버였다).
 *
 * 그래서 페이지 잠금에 서는 쓰기는 **잠금을 잡은 뒤 같은 트랜잭션 안에서** 권한을 다시 본다
 * (`auth/roles.ts`의 `recheckProjectRole` — 가드와 같은 술어). 이 파일이 라우트마다 잰다:
 *
 * > 잠금에 쥐인 채 강등 → 풀림 → **가드와 같은 상태 코드로 거절 · 프로젝트의 행이 하나도 안 바뀐다.**
 *
 * **라우트마다 대조가 붙는다** — 강등이 없으면 같은 요청이 풀린 뒤 커밋되고 상태가 **바뀐다.** 그것이
 * 없으면 «거절»이 «원래 실패하는 요청»과, «안 바뀐다»가 «상태를 못 보는 자»와 구분되지 않는다.
 *
 * # 분모 — 페이지 잠금에 서는 쓰기
 *
 * 쓰기 라우트 전부(`restore-lock-census.test.ts`의 표 — `projectGuard`가 걸린 비-`GET`)를 페이지 행
 * 잠금(`lockPageForEdit`) 아래에서 쏘아 **서는 것만** 골랐다(2026-09-22 · 창 700ms). 아래 `분모` 절이
 * 소스의 쓰기 라우트를 이 표와 `페이지 잠금에 안 서는 쓰기` 목록 둘로 **빠짐없이** 가르게 한다 — 새 쓰기
 * 라우트가 생기면 이 파일이 먼저 죽고, 사람이 «이것이 페이지 잠금에 서는가»를 판정한다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { withTransaction } from '../src/db/tx'
import { updateMemberRole } from '../src/repos/members'
import { lockPageForEdit } from '../src/repos/pages'
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
  type SignedUpUser,
} from './helpers'
import { joinRoom, type WsProbe } from './ws-client'

const db = getTestDb()

beforeEach(resetRealData)
afterEach(resetRealData)

type BobRole = 'editor' | 'owner'

interface Fx {
  projectId: string
  pageId: string
  /** 코멘트가 없는 페이지 — 그 루트에 처음 다는 코멘트는 번호를 붙인다(`applyEdit` 갈래). */
  barePageId: string
  sparePageId: string
  /** 문서의 `marker`가 어긋나 있는 페이지 — `renumber`가 실제로 쓰는 판(`restore-lock-census`와 같은 픽스처). */
  misnumberedPageId: string
  nodeId: string
  bareNodeId: string
  /** 밥이 `pageId`의 루트에 단 코멘트. 그 노드의 **마지막** 코멘트다(지우면 번호도 지운다). */
  bobCommentId: string
  snapshotId: string
  alice: SignedUpUser
  bob: SignedUpUser
}

/**
 * 앨리스(owner)의 프로젝트 하나와 그 안의 밥. **밥의 역할은 라우트가 요구하는 최소 역할이다** — 거기서
 * 한 단계 내리면 가드가 403 을 낼 자리가 된다.
 */
async function fixture(ctx: RealApiContext, bobRole: BobRole): Promise<Fx> {
  const alice = await signup(ctx)
  const bob = await signup(ctx)
  const project = await createProject(ctx, alice.cookie)
  // 앨리스가 owner 로 남으므로 밥을 owner 에서 내려도 «마지막 owner»가 아니다.
  await addMember(ctx, project.id, bob.user.id, bobRole)

  const menu = await createMenuNode(ctx, alice.cookie, project.id, { title: '설정' })
  const page = await createPage(ctx, alice.cookie, project.id, menu.id, { title: '사용자 목록' })
  const bare = await createPage(ctx, alice.cookie, project.id, menu.id, { title: '빈 페이지' })
  const spare = await createPage(ctx, alice.cookie, project.id, menu.id, { title: '지울 페이지' })
  const misnumbered = await createPage(ctx, alice.cookie, project.id, menu.id, { title: '번호가 어긋난 페이지' })
  const nodeId = (page.schema as { root: { id: string } }).root.id
  const bareNodeId = (bare.schema as { root: { id: string } }).root.id

  const comment = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${project.id}/pages/${page.id}/comments`,
    cookies: bob.cookie,
    payload: { nodeId, body: '밥이 먼저 단 말' },
  })
  if (comment.statusCode !== 201) throw new Error(`코멘트 픽스처 실패: ${comment.body}`)

  await db
    .updateTable('pages')
    .set({ schema: sql`jsonb_set(schema, '{root,marker}', '5')` })
    .where('id', '=', misnumbered.id)
    .execute()

  const snapshot = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${project.id}/snapshots`,
    cookies: alice.cookie,
    payload: { tag: '되돌릴 판' },
  })
  if (snapshot.statusCode !== 201) throw new Error(`스냅샷 픽스처 실패: ${snapshot.body}`)
  // 스냅샷 뒤에 하나를 바꿔 둔다 — 복원이 **실제로 쓰는** 판이어야 대조가 «바뀐다»를 본다.
  const renamed = await ctx.app.inject({
    method: 'PATCH',
    url: `/api/projects/${project.id}/pages/${page.id}`,
    cookies: alice.cookie,
    payload: { title: '스냅샷 뒤에 바꾼 제목' },
  })
  if (renamed.statusCode !== 200) throw new Error(`제목 픽스처 실패: ${renamed.body}`)

  return {
    projectId: project.id,
    pageId: page.id,
    barePageId: bare.id,
    sparePageId: spare.id,
    misnumberedPageId: misnumbered.id,
    nodeId,
    bareNodeId,
    bobCommentId: (comment.json() as { comment: { id: string } }).comment.id,
    snapshotId: (snapshot.json() as { id: string }).id,
    alice,
    bob,
  }
}

/**
 * 그 프로젝트의 **쓰기가 닿을 수 있는 행 전부.** 라우트마다 무엇을 쓰는지 따로 적지 않는다 — 한 벌로
 * 전부를 보면 «거절했는데 곁에서 무엇이 커밋됐다»도 잡힌다. 멤버 행은 뺀다(강등이 그것을 바꾼다).
 */
async function projectState(projectId: string) {
  const project = await db.selectFrom('projects').selectAll().where('id', '=', projectId).executeTakeFirst()
  const pages = await db.selectFrom('pages').selectAll().where('project_id', '=', projectId).orderBy('id').execute()
  const pageIds = pages.map((page) => page.id)
  const inPages = <T>(query: () => Promise<T[]>): Promise<T[]> => (pageIds.length === 0 ? Promise.resolve([]) : query())
  return {
    project,
    pages,
    menu: await db.selectFrom('menu_nodes').selectAll().where('project_id', '=', projectId).orderBy('id').execute(),
    comments: await inPages(() =>
      db.selectFrom('comments').selectAll().where('page_id', 'in', pageIds).orderBy('id').execute(),
    ),
    revisions: await inPages(() =>
      db.selectFrom('revisions').select(['id', 'page_id', 'seq']).where('page_id', 'in', pageIds).orderBy('id').execute(),
    ),
    snapshots: await db.selectFrom('snapshots').select(['id', 'tag']).where('project_id', '=', projectId).orderBy('id').execute(),
    layouts: await db.selectFrom('layouts').selectAll().where('project_id', '=', projectId).orderBy('id').execute(),
  }
}

/** 요청 하나. REST 는 `inject`, WS 는 프레임의 답(`patch-ack` → 200 · `patch-error` → 그 상태). */
interface Fired {
  done: () => boolean
  promise: Promise<{ status: number; body: string }>
}

/** 판마다 먼저 세우는 것 — WS 는 방에 든 소켓, 토큰 판은 밥의 토큰 헤더. 잠금을 잡기 **전에** 세운다. */
interface Prepared {
  socket?: WsProbe
  authorization?: string
}

function fireRest(
  ctx: RealApiContext,
  fx: Fx,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  payload?: Record<string, unknown>,
  prepared: Prepared = {},
): Fired {
  let settled = false
  // 토큰 판은 쿠키를 싣지 않는다 — 실으면 쿠키가 이긴다(`auth/plugin.ts`).
  const auth = prepared.authorization === undefined ? { cookies: fx.bob.cookie } : { headers: { authorization: prepared.authorization } }
  const promise = ctx.app
    .inject({ method, url, ...auth, ...(payload === undefined ? {} : { payload: payload as never }) })
    .then((res) => {
      settled = true
      return { status: res.statusCode, body: res.body }
    })
  return { done: () => settled, promise }
}

async function headSeqOf(pageId: string): Promise<number> {
  const row = await db.selectFrom('pages').select('head_seq').where('id', '=', pageId).executeTakeFirstOrThrow()
  return Number(row.head_seq)
}

interface Probe {
  /** 소스에서 뽑은 키(`METHOD /경로`)와 맞대는 값. WS 는 `WS patch`. */
  route: string
  label: string
  bobRole: BobRole
  /** 이 요청이 기다릴 페이지 — 그 행을 잡아 둔다. */
  lockPage: (fx: Fx) => string
  /** 먼저 세울 것이 있는 판(WS · 토큰)만 — 잠금을 잡기 전에 방에 들어가 있거나 토큰이 있어야 한다. */
  prepare?: (ctx: RealApiContext, fx: Fx) => Promise<Prepared>
  fire: (ctx: RealApiContext, fx: Fx, prepared: Prepared) => Promise<Fired>
  /** 강등이 없을 때 풀린 뒤 나오는 상태. */
  okStatus: number
}

const PROBES: Probe[] = [
  {
    route: 'PATCH /:projectId/pages/:pageId',
    label: '페이지 메타 수정',
    bobRole: 'editor',
    lockPage: (fx) => fx.pageId,
    fire: async (ctx, fx) =>
      fireRest(ctx, fx, 'PATCH', `/api/projects/${fx.projectId}/pages/${fx.pageId}`, { title: '밥이 바꾼 제목' }),
    okStatus: 200,
  },
  {
    route: 'DELETE /:projectId/pages/:pageId',
    label: '페이지 삭제',
    bobRole: 'editor',
    lockPage: (fx) => fx.sparePageId,
    fire: async (ctx, fx) => fireRest(ctx, fx, 'DELETE', `/api/projects/${fx.projectId}/pages/${fx.sparePageId}`),
    okStatus: 204,
  },
  {
    route: 'PUT /:projectId/pages/:pageId/schema',
    label: '페이지 스키마 저장',
    bobRole: 'editor',
    lockPage: (fx) => fx.pageId,
    fire: async (ctx, fx) =>
      fireRest(ctx, fx, 'PUT', `/api/projects/${fx.projectId}/pages/${fx.pageId}/schema`, {
        schema: { version: 1, root: { id: fx.nodeId, type: 'Page', children: [] } },
      }),
    okStatus: 200,
  },
  {
    route: 'PATCH /:projectId/pages/:pageId/ops',
    label: '페이지 ops 편집',
    bobRole: 'editor',
    lockPage: (fx) => fx.pageId,
    fire: async (ctx, fx) =>
      fireRest(ctx, fx, 'PATCH', `/api/projects/${fx.projectId}/pages/${fx.pageId}/ops`, {
        baseSeq: await headSeqOf(fx.pageId),
        ops: [{ op: 'add', path: '/root/children/-', value: { id: 'n_bob_ops', type: 'Text', props: {} } }],
      }),
    okStatus: 200,
  },
  {
    route: 'POST /:projectId/pages/:pageId/comments',
    label: '코멘트 게시 (번호를 붙인다 — Chrome a-4 의 판)',
    bobRole: 'editor',
    lockPage: (fx) => fx.barePageId,
    fire: async (ctx, fx) =>
      fireRest(ctx, fx, 'POST', `/api/projects/${fx.projectId}/pages/${fx.barePageId}/comments`, {
        nodeId: fx.bareNodeId,
        body: '밥의 말',
        idempotencyKey: 'k-bob-bare',
      }),
    okStatus: 201,
  },
  {
    // 재확인은 두 갈래(번호를 붙인다 / 행만 넣는다) **앞에 한 줄**이다 — 그 줄을 지우면 위 판과 함께 죽는다(그 축은
    // 위 판이 소유한다). 이 판이 혼자 재는 것은 «행만 넣는 갈래도 재확인을 지난다»다: 재확인을 `applyEdit` 갈래로만
    // 옮기면 이 판만 죽는다.
    route: 'POST /:projectId/pages/:pageId/comments',
    label: '코멘트 게시 (번호가 이미 있다 — 행만 넣는다)',
    bobRole: 'editor',
    lockPage: (fx) => fx.pageId,
    fire: async (ctx, fx) =>
      fireRest(ctx, fx, 'POST', `/api/projects/${fx.projectId}/pages/${fx.pageId}/comments`, {
        nodeId: fx.nodeId,
        body: '밥의 둘째 말',
        idempotencyKey: 'k-bob-numbered',
      }),
    okStatus: 201,
  },
  {
    route: 'DELETE /:projectId/pages/:pageId/comments/:commentId',
    label: '코멘트 삭제 (마지막이라 번호도 지운다)',
    bobRole: 'editor',
    lockPage: (fx) => fx.pageId,
    fire: async (ctx, fx) =>
      fireRest(ctx, fx, 'DELETE', `/api/projects/${fx.projectId}/pages/${fx.pageId}/comments/${fx.bobCommentId}`),
    okStatus: 200,
  },
  {
    route: 'POST /:projectId/pages/:pageId/comments/renumber',
    label: '코멘트 재번호 (바꿀 번호가 있다)',
    bobRole: 'editor',
    lockPage: (fx) => fx.misnumberedPageId,
    fire: async (ctx, fx) =>
      fireRest(ctx, fx, 'POST', `/api/projects/${fx.projectId}/pages/${fx.misnumberedPageId}/comments/renumber`),
    okStatus: 200,
  },
  {
    route: 'POST /:projectId/snapshots/:snapshotId/restore',
    label: '스냅샷 복원 (owner)',
    bobRole: 'owner',
    lockPage: (fx) => fx.pageId,
    fire: async (ctx, fx) =>
      fireRest(ctx, fx, 'POST', `/api/projects/${fx.projectId}/snapshots/${fx.snapshotId}/restore`),
    okStatus: 200,
  },
  {
    route: 'DELETE /:projectId',
    label: '프로젝트 삭제 (owner)',
    bobRole: 'owner',
    lockPage: (fx) => fx.pageId,
    fire: async (ctx, fx) => fireRest(ctx, fx, 'DELETE', `/api/projects/${fx.projectId}`),
    okStatus: 204,
  },
  {
    // 재확인을 지우면 아래 동시 역할 변경의 WS 판과 함께 죽는다. 이 판이 혼자 재는 것은 **자리**다 — 재확인을
    // `applyEdit` 앞(잠금 대기 앞)으로 옮기면 멤버 행을 쥔 채 잠금을 기다려 강등이 막히고, 이 판만 죽는다.
    route: 'WS patch',
    label: 'WS patch 프레임',
    bobRole: 'editor',
    lockPage: (fx) => fx.pageId,
    prepare: async (ctx, fx) => {
      const socket = await joinRoom(ctx.port, fx.projectId, fx.bob.cookie.wb_session)
      // 참가 알림의 자격 확인이 끝난 뒤여야 한다 — `ws-patch.test.ts`의 `settleJoin`과 같은 이유.
      await socket.waitFor('presence')
      return { socket }
    },
    fire: async (_ctx, fx, { socket }) => {
      if (!socket) throw new Error('WS 판은 prepare 가 소켓을 준다')
      socket.send(
        JSON.stringify({
          type: 'patch',
          pageId: fx.pageId,
          baseSeq: await headSeqOf(fx.pageId),
          ops: [{ op: 'add', path: '/root/children/-', value: { id: 'n_bob_ws', type: 'Text', props: {} } }],
          clientOpId: 'op_bob_ws',
        }),
      )
      let settled = false
      const promise = (async () => {
        const answer = await Promise.race([socket.waitFor('patch-ack', 15_000), socket.waitFor('patch-error', 15_000)])
        settled = true
        return { status: answer.type === 'patch-ack' ? 200 : answer.status, body: JSON.stringify(answer) }
      })()
      return { done: () => settled, promise }
    },
    okStatus: 200,
  },
]

/**
 * 어떤 트랜잭션이 잠금을 기다리며 설 때까지 기다린다. `revisions-concurrency.test.ts`의 같은 이름 헬퍼와
 * 같은 질의다 — **왜 `pg_stat_activity`로 좁히는지는 그쪽 머리말이 소유한다.** 고정 `sleep`이 아닌 것은
 * 느린 머신에서 시나리오가 조용히 뒤집히지 않게 하려고서다 — 나타나지 않으면 던진다.
 */
async function waitForLockWaiter(atLeast = 1, timeoutMs = 5_000): Promise<void> {
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

/**
 * 페이지 행 하나를 **진짜 잠금 함수로** 잡는다 — 잠금 SQL 을 베끼지 않는다(`restore-lock-census`와 같은 판단).
 * 돌려준 `release`를 부르면 그 트랜잭션이 커밋된다.
 */
async function holdPageLock(projectId: string, pageId: string): Promise<{ release: () => Promise<void> }> {
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let locked = false
  const holder = withTransaction(db, async (trx) => {
    const page = await lockPageForEdit(trx, projectId, pageId)
    if (!page) throw new Error('잡을 페이지가 없습니다')
    locked = true
    await held
  })
  while (!locked) await new Promise((resolve) => setTimeout(resolve, 10))
  return {
    release: async () => {
      release()
      await holder
    },
  }
}

type Demotion = 'role' | 'member'

/**
 * 앨리스가 밥을 **API 로** 내린다 — 역할 한 단계(editor → viewer · owner → editor) 또는 멤버에서 뺀다.
 * 막히면 그것도 값이다: 3s 안에 안 끝나면 `blocked`로 적고 잠금을 푼 뒤 결과를 받는다.
 */
function demote(ctx: RealApiContext, fx: Fx, bobRole: BobRole, kind: Demotion) {
  const url = `/api/projects/${fx.projectId}/members/${fx.bob.user.id}`
  const promise = ctx.app
    .inject(
      kind === 'role'
        ? { method: 'PATCH', url, cookies: fx.alice.cookie, payload: { role: bobRole === 'owner' ? 'editor' : 'viewer' } }
        : { method: 'DELETE', url, cookies: fx.alice.cookie },
    )
    .then((res) => res.statusCode)
  return promise
}

interface HeldOutcome {
  status: number
  body: string
  demotionStatus: number | null
  /** 강등이 쓰기의 잠금 대기 동안 **끝났는가**(끝나야 «잠금에 쥐인 채 강등»이다). */
  demotedWhileHeld: boolean
  before: Awaited<ReturnType<typeof projectState>>
  after: Awaited<ReturnType<typeof projectState>>
}

/** 잠금을 잡고 → 쏘고 → 그 요청이 잠금에 선 것을 확인하고 → (강등하고) → 푼다. */
async function runHeld(ctx: RealApiContext, probe: Probe, kind: Demotion | null): Promise<HeldOutcome> {
  const fx = await fixture(ctx, probe.bobRole)
  const prepared = probe.prepare ? await probe.prepare(ctx, fx) : {}
  const before = await projectState(fx.projectId)

  const hold = await holdPageLock(fx.projectId, probe.lockPage(fx))
  let request: Fired | undefined
  let demotion: Promise<number> | null = null
  let demotedWhileHeld = false
  try {
    request = await probe.fire(ctx, fx, prepared)
    await waitForLockWaiter()
    expect(request.done(), `${probe.label}: 잠금에 서지 않았다`).toBe(false)
    if (kind !== null) {
      demotion = demote(ctx, fx, probe.bobRole, kind)
      const early = await Promise.race([
        demotion.then(() => 'done' as const),
        new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 3_000)),
      ])
      demotedWhileHeld = early === 'done'
    }
  } finally {
    await hold.release()
  }
  const res = await request.promise
  const demotionStatus = demotion === null ? null : await demotion
  prepared.socket?.close()
  return { ...res, demotionStatus, demotedWhileHeld, before, after: await projectState(fx.projectId) }
}

/** 가드가 같은 판에서 내는 것 — 역할이 모자라면 403, 멤버가 아니면 404(`requireProjectRole`의 표). */
const REFUSED: Record<Demotion, number> = { role: 403, member: 404 }

describe('페이지 잠금에 쥐인 쓰기 — 커밋 순간의 권한으로 판정한다 (이월 AA)', () => {
  for (const probe of PROBES) {
    describe(`${probe.route} — ${probe.label}`, () => {
      it('대조 — 강등이 없으면 잠금이 풀린 뒤 커밋되고 상태가 바뀐다', async () => {
        await withRealApi(async (ctx) => {
          const outcome = await runHeld(ctx, probe, null)
          expect(outcome.status, outcome.body).toBe(probe.okStatus)
          expect(outcome.after).not.toEqual(outcome.before)
        })
      }, 60_000)

      it('잠금에 쥐인 채 강등되면 풀린 뒤 403 — 프로젝트의 행이 하나도 안 바뀐다', async () => {
        await withRealApi(async (ctx) => {
          const outcome = await runHeld(ctx, probe, 'role')
          expect(outcome.demotedWhileHeld, '강등이 쓰기의 잠금 대기에 막혔다').toBe(true)
          expect(outcome.demotionStatus).toBe(200)
          expect(outcome.status, outcome.body).toBe(REFUSED.role)
          expect(outcome.after).toEqual(outcome.before)
        })
      }, 60_000)
    })
  }
})

/** 표에서 라벨로 한 줄을 꺼낸다 — 아래 절들이 표의 판을 그대로 다시 쓴다(요청을 두 벌 적지 않는다). */
function probeLabeled(label: string): Probe {
  const probe = PROBES.find((candidate) => candidate.label === label)
  if (!probe) throw new Error(`표에 없는 라벨: ${label}`)
  return probe
}

const BARE_COMMENT = '코멘트 게시 (번호를 붙인다 — Chrome a-4 의 판)'
const OPS_EDIT = '페이지 ops 편집'

/**
 * **멤버에서 빠지면 404 — 가드와 같은 상태 코드다.** 재확인이 가드의 술어(`requireProjectRole`)를 그대로 쓰면
 * 비멤버는 404 · 역할 모자람은 403 으로 갈린다. 재확인에 술어를 한 벌 더 쓰면(예: «역할이 없거나 모자라면 403»)
 * 위 표의 403 판은 전부 그대로 지나고 **이 판만** 죽는다.
 *
 * 재확인 자리를 지우는 변조에는 표의 `코멘트 게시 (번호를 붙인다 …)` 판과 **함께** 죽는다 — 그 축(재확인이
 * 서는가)은 그 판이 소유한다. 이 판이 혼자 소유하는 것은 상태 코드(404)다.
 */
describe('멤버에서 빠지면 404 — 가드와 같은 상태 코드 (Chrome a-4 gap-member 의 api 판)', () => {
  it('코멘트 게시가 잠금에 쥐인 채 멤버에서 빠지면 풀린 뒤 404 — 아무것도 안 바뀐다', async () => {
    await withRealApi(async (ctx) => {
      const outcome = await runHeld(ctx, probeLabeled(BARE_COMMENT), 'member')
      expect(outcome.demotedWhileHeld, '제외가 쓰기의 잠금 대기에 막혔다').toBe(true)
      expect(outcome.demotionStatus).toBe(204)
      expect(outcome.status, outcome.body).toBe(REFUSED.member)
      expect(outcome.after).toEqual(outcome.before)
    })
  }, 60_000)
})

/**
 * **토큰 요청도 같은 재확인을 지난다.** MCP·`wireb`는 토큰으로 쓴다(`currentUser`는 토큰 훅이 채운다). 재확인의
 * 입력은 가드와 같은 자리에서 읽으므로 토큰 갈래를 따로 두지 않는다 — «토큰이면 가드의 판정을 그대로 쓴다» 같은
 * 지름길이 생기면 이 판만 죽는다.
 *
 * **스코프 인자는 이 판이 못 잰다 — 0 사망이 설계다.** 토큰의 프로젝트는 바뀌지 않고 가드가 이미 봤으므로,
 * 재확인에서 스코프를 빼도 결과가 같다. 그래도 넘기는 것은 가드와 **같은 호출**이어야 해서다(`auth/roles.ts`).
 *
 * `PATCH .../ops`의 재확인을 지우거나 옮기는 변조에는 표의 `페이지 ops 편집` 판과 **함께** 죽는다 — 그 축은 그
 * 판이 소유한다.
 */
describe('토큰 요청도 커밋 순간의 권한으로 판정한다', () => {
  const tokenProbe: Probe = {
    ...probeLabeled(OPS_EDIT),
    label: '페이지 ops 편집 — 토큰',
    prepare: async (ctx, fx) => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.projectId}/tokens`,
        cookies: fx.bob.cookie,
        payload: { name: '밥의 토큰' },
      })
      if (res.statusCode !== 201) throw new Error(`토큰 픽스처 실패: ${res.body}`)
      return { authorization: `Bearer ${(res.json() as { value: string }).value}` }
    },
    fire: async (ctx, fx, prepared) =>
      fireRest(
        ctx,
        fx,
        'PATCH',
        `/api/projects/${fx.projectId}/pages/${fx.pageId}/ops`,
        {
          baseSeq: await headSeqOf(fx.pageId),
          ops: [{ op: 'add', path: '/root/children/-', value: { id: 'n_bob_token', type: 'Text', props: {} } }],
        },
        prepared,
      ),
  }

  it('대조 — 강등이 없으면 토큰의 편집이 커밋된다', async () => {
    await withRealApi(async (ctx) => {
      const outcome = await runHeld(ctx, tokenProbe, null)
      expect(outcome.status, outcome.body).toBe(200)
      expect(outcome.after).not.toEqual(outcome.before)
    })
  }, 60_000)

  it('잠금에 쥐인 채 토큰 주인이 강등되면 풀린 뒤 403 — 아무것도 안 바뀐다', async () => {
    await withRealApi(async (ctx) => {
      const outcome = await runHeld(ctx, tokenProbe, 'role')
      expect(outcome.demotedWhileHeld).toBe(true)
      expect(outcome.status, outcome.body).toBe(REFUSED.role)
      expect(outcome.after).toEqual(outcome.before)
    })
  }, 60_000)
})

/**
 * # 커밋 중 틈 — 같은 키로 다시 보낸 게시 (좁은 반증 4차 a-4 의 api 판)
 *
 * 웹은 응답을 10s 안에 못 받은 게시를 **같은 멱등 키로 다시 보내** 판정한다. 첫 게시가 페이지 잠금에 쥐인 채
 * 강등되면: 다시 보낸 것은 행이 아직 없어 가드 앞 재생을 지나쳐 가드에서 403 을 받고, 웹은 그것을 «안 달림»
 * 확정으로 읽는다. **앞 판은 그 뒤 첫 게시가 커밋됐다** — «안 달림»이 거짓이 되고 고쳐 달면 두 행이었다(Chrome).
 * 이제 첫 게시도 잠금 뒤 재확인에서 같은 403 으로 되돌아간다.
 *
 * **이 판의 축(재확인이 서는가)은 표의 `코멘트 게시 (번호를 붙인다 …)` 판이 소유한다** — 같은 변조에 함께 죽는다.
 * 이 판이 더 재는 것은 **다시 보낸 것의 답과 첫 게시의 결말이 같은가**다. 대조는 권한이 그대로인 판 — 다시 보낸
 * 것이 잠금 뒤에 줄을 서 있다가 첫 게시의 행을 **잠금 안에서** 재생한다(`routes/comments.ts`).
 */
describe('커밋 중 틈 — 같은 키로 다시 보낸 게시 (좁은 반증 4차 a-4 의 api 판)', () => {
  const KEY = 'k-bob-resend'

  async function keyedRows(pageId: string, authorId: string): Promise<number> {
    const rows = await db
      .selectFrom('comments')
      .select('id')
      .where('page_id', '=', pageId)
      .where('author_id', '=', authorId)
      .where('idempotency_key', '=', KEY)
      .execute()
    return rows.length
  }

  function post(ctx: RealApiContext, fx: Fx): Fired {
    return fireRest(ctx, fx, 'POST', `/api/projects/${fx.projectId}/pages/${fx.barePageId}/comments`, {
      nodeId: fx.bareNodeId,
      body: '밥의 말',
      idempotencyKey: KEY,
    })
  }

  it('첫 게시가 쥐인 채 강등 → 다시 보낸 것은 가드에서 403 → 풀린 뒤 첫 게시도 403 · 행 0', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx, 'editor')
      const hold = await holdPageLock(fx.projectId, fx.barePageId)
      let first: Fired | undefined
      let resent: { status: number; body: string } | undefined
      try {
        first = post(ctx, fx)
        await waitForLockWaiter()
        expect(await demote(ctx, fx, 'editor', 'role')).toBe(200)
        resent = await post(ctx, fx).promise
        expect(first.done(), '첫 게시가 다시 보낸 것보다 먼저 끝났다 — 판이 성립하지 않았다').toBe(false)
      } finally {
        await hold.release()
      }
      const settled = await first.promise

      expect(resent.status, resent.body).toBe(403)
      expect(settled.status, settled.body).toBe(403)
      expect(await keyedRows(fx.barePageId, fx.bob.user.id)).toBe(0)
    })
  }, 60_000)

  it('대조 — 권한이 그대로면 첫 게시는 201 · 다시 보낸 것은 잠금 안에서 재생 200 · 행 1', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx, 'editor')
      const hold = await holdPageLock(fx.projectId, fx.barePageId)
      let first: Fired | undefined
      let resent: Fired | undefined
      try {
        first = post(ctx, fx)
        await waitForLockWaiter()
        resent = post(ctx, fx)
        // 둘 다 잠금에 서야 «다시 보낸 것이 잠금 안에서 재생한다»가 선다.
        await waitForLockWaiter(2)
      } finally {
        await hold.release()
      }
      const [a, b] = await Promise.all([first.promise, resent.promise])

      expect([a.status, b.status], `${a.body} / ${b.body}`).toEqual([201, 200])
      expect(await keyedRows(fx.barePageId, fx.bob.user.id)).toBe(1)
    })
  }, 60_000)
})

/**
 * # 동시 역할 변경 — 재확인이 멤버 행을 `FOR SHARE`로 잡는다
 *
 * 역할 변경(`repos/members.ts`의 `updateMemberRole` — 진짜 함수를 부른다, SQL 을 베끼지 않는다)을 **커밋 전에**
 * 붙들어 둔 채 밥의 쓰기를 낸다. 가드는 커밋된 값(editor)을 보고 통과하고, 쓰기는 잠금 뒤 재확인에 닿는다.
 *
 * | 재확인이 | 역할 변경이 커밋하면 | 롤백하면 |
 * |---|---|---|
 * | 멤버 행을 잡는다(`FOR SHARE`) | 재확인이 그 커밋을 **기다렸다가** 바뀐 값으로 판정 → 403 · 행 0 | 기다렸다가 editor → 커밋 |
 * | 안 잡는다(평 `SELECT`) | 커밋된 값(editor)을 곧바로 보고 통과 → **역할 변경보다 먼저 끝나지만**, 그 둘의 커밋 순서는 경주다 | 같다 |
 *
 * 평 `SELECT`의 경주가 지는 판은 «재확인 → 역할 변경 커밋(강등 200) → 쓰기 커밋»이다 — 강등을 알린 **뒤에**
 * 옛 역할로 판정된 쓰기가 들어간다. 잡으면 이 판이 설 수 없다: 역할 변경의 UPDATE 가 그 행에서 쓰기의 커밋을
 * 기다린다(반대 방향). 반대 방향은 결정적으로 세울 판이 없어 이 파일이 재지 않는다 — 재확인 뒤로는 커밋밖에 없다.
 *
 * **REST 와 WS 가 각자 `'share'`를 넘긴다** — 한쪽만 지우는 변조에 그쪽 판만 죽는다. `findMembership`의 `forShare()`
 * 를 지우면 둘이 함께 죽는다.
 */
describe('동시 역할 변경 — 재확인이 멤버 행을 FOR SHARE 로 잡는다', () => {
  class RollbackRoleChange extends Error {}

  /** 밥을 viewer 로 내리는 **진짜 역할 변경**을 커밋 전에 붙들어 둔다. `settle(true)`면 커밋, `false`면 롤백. */
  async function holdRoleChange(fx: Fx): Promise<{ settle: (commit: boolean) => Promise<void> }> {
    let decide: (commit: boolean) => void = () => {}
    const decision = new Promise<boolean>((resolve) => {
      decide = resolve
    })
    let updated = false
    const holder = withTransaction(db, async (trx) => {
      const member = await updateMemberRole(trx, fx.projectId, fx.bob.user.id, 'viewer')
      if (member?.role !== 'viewer') throw new Error('역할 변경 픽스처 실패')
      updated = true
      if (!(await decision)) throw new RollbackRoleChange()
    }).catch((error: unknown) => {
      if (!(error instanceof RollbackRoleChange)) throw error
    })
    while (!updated) await new Promise((resolve) => setTimeout(resolve, 10))
    return {
      settle: async (commit) => {
        decide(commit)
        await holder
      },
    }
  }

  async function underRoleChange(ctx: RealApiContext, probe: Probe, commit: boolean) {
    const fx = await fixture(ctx, 'editor')
    const prepared = probe.prepare ? await probe.prepare(ctx, fx) : {}
    const before = await projectState(fx.projectId)
    const roleChange = await holdRoleChange(fx)
    let request: Fired | undefined
    let waitedOnRoleChange = false
    try {
      request = await probe.fire(ctx, fx, prepared)
      // 재확인이 그 행을 잡으면 역할 변경의 커밋을 기다리며 선다. 안 잡으면 그대로 끝난다 — 어느 쪽이 먼저인지 본다.
      await Promise.race([waitForLockWaiter(), request.promise])
      waitedOnRoleChange = !request.done()
    } finally {
      await roleChange.settle(commit)
    }
    const res = await request.promise
    prepared.socket?.close()
    return { ...res, waitedOnRoleChange, before, after: await projectState(fx.projectId) }
  }

  for (const label of [BARE_COMMENT, 'WS patch 프레임']) {
    describe(label, () => {
      it('역할 변경이 커밋 전이면 재확인이 그것을 기다렸다가 바뀐 값으로 판정한다 — 403 · 아무것도 안 바뀐다', async () => {
        await withRealApi(async (ctx) => {
          const outcome = await underRoleChange(ctx, probeLabeled(label), true)
          expect(outcome.waitedOnRoleChange, '재확인이 역할 변경의 커밋을 안 기다렸다').toBe(true)
          expect(outcome.status, outcome.body).toBe(403)
          expect(outcome.after).toEqual(outcome.before)
        })
      }, 60_000)

      it('대조 — 역할 변경이 롤백되면 기다렸다가 옛 값(editor)으로 커밋한다', async () => {
        await withRealApi(async (ctx) => {
          const probe = probeLabeled(label)
          const outcome = await underRoleChange(ctx, probe, false)
          expect(outcome.waitedOnRoleChange).toBe(true)
          expect(outcome.status, outcome.body).toBe(probe.okStatus)
          expect(outcome.after).not.toEqual(outcome.before)
        })
      }, 60_000)
    })
  }
})

/**
 * # 분모 — 소스의 쓰기 라우트를 빠짐없이 가른다
 *
 * **세는 단위는 `restore-lock-census.test.ts`와 같다** — `apps/api/src/routes/`의 `projectGuard`가 걸린 비-`GET`
 * 라우트 하나당 한 키. 그 전부가 위 `PROBES`(페이지 잠금에 선다 → 재확인한다) 또는 아래 목록(안 선다) 중
 * **정확히 하나**에 있어야 한다. 새 쓰기 라우트는 이 절을 먼저 죽이고, 사람이 어느 쪽인지 판정한다.
 *
 * **아래 목록의 판정은 잰 값이다**(2026-09-22 — 쓰기 라우트 전부를 `lockPageForEdit` 아래에서 쏘아 700ms 창).
 * **이 파일은 그것을 다시 재지 않는다** — 목록에 넣는 사람이 잰다. 페이지 잠금에 안 서도 **다른 잠금**(복원의
 * `lockProjectForRestore` · 자기 행의 행 잠금)에는 설 수 있다 — 그 판의 틈은 이월로 적었다(장부 AA).
 */
const NOT_PAGE_LOCKED: Record<string, string> = {
  'POST /:projectId/menu': '메뉴 행만 쓴다',
  'PATCH /:projectId/menu/:nodeId': '메뉴 행만 쓴다',
  'DELETE /:projectId/menu/:nodeId': '페이지가 매인 메뉴는 RESTRICT 로 실패한다 — 쓰는 판은 페이지 행을 안 건드린다',
  'POST /:projectId/pages': '새 페이지 행을 넣는다 — 있는 페이지 행을 안 잡는다',
  'POST /:projectId/pages/import': '새 페이지를 만들고 **그 새 행**만 잠근다 — 남이 쥘 수 없는 행이다',
  'PATCH /:projectId/pages/:pageId/comments/:commentId': '코멘트 행만 고친다 — FK 열을 안 바꾸는 UPDATE 는 페이지 행을 안 잡는다',
  'PUT /:projectId/theme': '레이아웃 행만 쓴다',
  'POST /:projectId/snapshots': '페이지를 **읽기만** 한다 — `FOR UPDATE`는 읽기를 막지 않는다',
  'PATCH /:projectId': '프로젝트 행만 쓴다',
  'POST /:projectId/members': '멤버 행',
  'PATCH /:projectId/members/:userId': '멤버 행',
  'DELETE /:projectId/members/:userId': '멤버 행',
  'POST /:projectId/themes': '테마 행',
  'PUT /:projectId/themes/:themeId': '테마 행',
  'DELETE /:projectId/themes/:themeId': '테마 행',
  'POST /:projectId/presets': '프리셋 행',
  'DELETE /:projectId/presets/:presetId': '프리셋 행',
  'POST /:projectId/tokens': '토큰 행',
  'DELETE /:projectId/tokens/:tokenId': '토큰 행',
}

const ROUTES_DIR = fileURLToPath(new URL('../src/routes', import.meta.url))

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/** `restore-lock-census.test.ts`의 `declaredWriteRoutes`와 같은 패턴 — 세는 단위를 두 파일이 같게 쓴다. */
function declaredWriteRoutes(): string[] {
  const found: string[] = []
  for (const name of readdirSync(ROUTES_DIR).filter((file) => file.endsWith('.ts'))) {
    const source = stripComments(readFileSync(join(ROUTES_DIR, name), 'utf8'))
    const pattern = /app\.(post|patch|put|delete)\(\s*'([^']+)'\s*,\s*\{\s*preHandler:\s*projectGuard\('\w+'\)/g
    for (const match of source.matchAll(pattern)) {
      found.push(`${match[1]!.toUpperCase()} ${match[2]}`)
    }
  }
  return found
}

describe('분모 — 소스의 쓰기 라우트가 두 목록 중 정확히 하나에 있다', () => {
  const locked = new Set(PROBES.map((probe) => probe.route).filter((route) => route !== 'WS patch'))
  const free = new Set(Object.keys(NOT_PAGE_LOCKED))

  it('훑을 소스를 실제로 읽는다', () => {
    // 글롭이 어긋나면 빈 집합에서 아래가 조용히 통과한다.
    expect(declaredWriteRoutes().length).toBeGreaterThan(20)
  })

  it('쓰기 라우트가 하나도 빠지지 않았다', () => {
    const missing = [...new Set(declaredWriteRoutes())].filter((route) => !locked.has(route) && !free.has(route))
    expect(missing).toEqual([])
  })

  it('두 목록이 겹치지 않고, 소스에 없는 라우트를 적지 않았다', () => {
    const declared = new Set(declaredWriteRoutes())
    expect([...locked].filter((route) => free.has(route))).toEqual([])
    expect([...locked, ...free].filter((route) => !declared.has(route))).toEqual([])
  })
})
