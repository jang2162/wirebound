/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `restore-lock-census.test.ts`와 같은 부류다.
 *
 * # 무엇을 재나 — 커밋 순간의 권한
 *
 * 권한 가드(`projectGuard`)는 핸들러 **앞에서 한 번** 돈다. 쓰기가 페이지 잠금에 쥐인 동안 그 사람이
 * 강등되거나 멤버에서 빠져도, 가드만 있으면 잠금이 풀린 뒤 **그 사람 이름으로 커밋된다** — 커밋된 행의
 * 작성자는 그 순간 이미 viewer·비멤버다.
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
 * 쓰기 라우트 전부를 페이지 행 잠금(`lockPageForEdit`) 아래에서 쏘아(700ms 창) **서는 것만** 고른다.
 * 아래 `분모` 절이 **등록된** 쓰기 라우트(Fastify 의 `onRoute` 값)와 WS 프레임 종류를 «잠금에 선다»(이 표와 아래
 * `PROJECT_PROBES`)와 «어느 잠금에도 안 선다»(`NOT_LOCKED`)로 **빠짐없이** 가르게 한다 — 새 쓰기가 생기면 이 파일이 먼저
 * 죽고, 사람이 «이것이 잠금에 서는가»를 판정한다.
 *
 * # 프로젝트 잠금 뒤에 서는 쓰기
 *
 * 페이지 행을 안 잡는 쓰기도 복원(`lockProjectForRestore`) · 트리 쓰기(`lockProjectTree`) 뒤에 선다 — 같은 판이다. 아래
 * `프로젝트 잠금에 쥐인 쓰기` 절이 그 두 잠금을 진짜 함수로 쥔 채 라우트마다 잰다(`PROJECT_PROBES`).
 *
 * # 잠금 순서 — 재확인이 연 교착
 *
 * 프로젝트 삭제는 재확인을 위해 기다릴 것을 먼저 잡으므로 잠금 순서가 있다. 아래 `잠금 순서` 절이 그 순서가
 * 복원과 같은지(프로젝트 행 → 페이지)를 교착 두 판으로, 삭제가 owner 행을 멤버 쓰기와 같은 순서로 재확인 앞에서 잡는지를 한 판(E12)으로, 메뉴 행을 owner 행 앞에서 잡아 메뉴 제목 쓰기와 고리를 안 만드는지를 세 판(E13)으로, 프리셋 행을 같은 자리에서 잡아 프리셋 삭제와 고리를 안 만드는지를 두 판(E15)으로, 삭제가 쥔 행에 선 바탕 없는 제목 쓰기가 404 인지를 두 판(E14)으로, 프로젝트 행을 `KEY SHARE`로 먼저 잡는 쓰기(`lockProjectShared`)가
 * 삭제의 CASCADE 와 고리를 안 만드는지(프로젝트 행 → 자기 행 → 멤버 행)를 아홉 판(E3–E11)으로, 코멘트 수정이 코멘트 행을
 * 지우는 두 쓰기 · 역할 변경과 3자 고리를 안 만드는지(프로젝트 행 → 페이지 행 → 멤버 행 → 코멘트 행)를 두 판(F3 · F3′)으로 잰다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { sql } from 'kysely'
import type { RegisteredRoute } from '../src/app'
import { withTransaction, type DbHandle } from '../src/db/tx'
import { findMembership } from '../src/auth/roles'
import { findDefaultLayout, updateLayoutTheme } from '../src/repos/layouts'
import { lockOwnerIds, updateMemberRole } from '../src/repos/members'
import { insertMenuNode } from '../src/repos/menu'
import { lockPageForEdit } from '../src/repos/pages'
import { lockProjectTree } from '../src/repos/projects'
import { lockProjectForRestore } from '../src/repos/snapshots'
import { MIN_ROLE_FOR_FRAME } from '../src/ws/protocol'
import {
  addMember,
  createMenuNode,
  createPage,
  createProject,
  getTestDb,
  resetRealData,
  signup,
  withApi,
  withProxiedRealApi,
  type ProxiedRealApi,
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
  /** 페이지 넷이 매인 메뉴. */
  menuId: string
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
    menuId: menu.id,
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
 * 전부를 보면 «거절했는데 곁에서 무엇이 커밋됐다»도 잡힌다. 밥의 멤버 행은 뺀다(강등이 그것을 바꾼다) — 다른
 * 멤버 행은 본다(초대가 쓴다). 토큰은 `last_used_at`을 뺀다(밥의 토큰 판이 쓰기만 해도 인증이 그것을 고친다).
 */
async function projectState({ projectId, bob }: Pick<Fx, 'projectId' | 'bob'>) {
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
    members: await db
      .selectFrom('project_members')
      .selectAll()
      .where('project_id', '=', projectId)
      .where('user_id', '!=', bob.user.id)
      .orderBy('user_id')
      .execute(),
    themes: await db.selectFrom('themes').selectAll().where('project_id', '=', projectId).orderBy('id').execute(),
    presets: await db.selectFrom('presets').selectAll().where('project_id', '=', projectId).orderBy('id').execute(),
    tokens: await db
      .selectFrom('api_tokens')
      .select(['id', 'user_id', 'name'])
      .where('project_id', '=', projectId)
      .orderBy('id')
      .execute(),
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

/** 보낸 요청을 «끝났는가»를 볼 수 있는 모양으로 싼다. */
function track(response: PromiseLike<{ statusCode: number; body: string }>): Fired {
  let settled = false
  const promise = Promise.resolve(response).then((res) => {
    settled = true
    return { status: res.statusCode, body: res.body }
  })
  return { done: () => settled, promise }
}

function fireRest(
  ctx: RealApiContext,
  fx: Fx,
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE',
  url: string,
  payload?: Record<string, unknown>,
  prepared: Prepared = {},
): Fired {
  // 토큰 판은 쿠키를 싣지 않는다 — 실으면 쿠키가 이긴다(`auth/plugin.ts`).
  const auth = prepared.authorization === undefined ? { cookies: fx.bob.cookie } : { headers: { authorization: prepared.authorization } }
  return track(ctx.app.inject({ method, url, ...auth, ...(payload === undefined ? {} : { payload: payload as never }) }))
}

/** 끝나기를 `ms`까지만 기다리고, 그 안에 끝났는지를 돌려준다(막혔으면 `false` — 요청은 계속 돈다). */
async function settlesWithin(fired: Fired, ms: number): Promise<boolean> {
  await Promise.race([fired.promise, new Promise((resolve) => setTimeout(resolve, ms))])
  return fired.done()
}

async function headSeqOf(pageId: string): Promise<number> {
  const row = await db.selectFrom('pages').select('head_seq').where('id', '=', pageId).executeTakeFirstOrThrow()
  return Number(row.head_seq)
}

interface Probe {
  /** 등록된 라우트의 키(`METHOD /api/…` — 아래 «분모» 절)와 맞대는 값. WS 는 `WS <프레임 종류>`. */
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

/** 아래 절들이 표의 판을 라벨로 다시 꺼낸다(`probeLabeled`). */
const BARE_COMMENT = '코멘트 게시 (번호를 붙인다 — Chrome a-4 의 판)'
const OPS_EDIT = '페이지 ops 편집'
const WS_PATCH = 'WS patch 프레임'

const PROBES: Probe[] = [
  {
    route: 'PATCH /api/projects/:projectId/pages/:pageId',
    label: '페이지 메타 수정',
    bobRole: 'editor',
    lockPage: (fx) => fx.pageId,
    fire: async (ctx, fx) =>
      fireRest(ctx, fx, 'PATCH', `/api/projects/${fx.projectId}/pages/${fx.pageId}`, { title: '밥이 바꾼 제목' }),
    okStatus: 200,
  },
  {
    route: 'DELETE /api/projects/:projectId/pages/:pageId',
    label: '페이지 삭제',
    bobRole: 'editor',
    lockPage: (fx) => fx.sparePageId,
    fire: async (ctx, fx) => fireRest(ctx, fx, 'DELETE', `/api/projects/${fx.projectId}/pages/${fx.sparePageId}`),
    okStatus: 204,
  },
  {
    route: 'PUT /api/projects/:projectId/pages/:pageId/schema',
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
    route: 'PATCH /api/projects/:projectId/pages/:pageId/ops',
    label: OPS_EDIT,
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
    route: 'POST /api/projects/:projectId/pages/:pageId/comments',
    label: BARE_COMMENT,
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
    route: 'POST /api/projects/:projectId/pages/:pageId/comments',
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
    route: 'DELETE /api/projects/:projectId/pages/:pageId/comments/:commentId',
    label: '코멘트 삭제 (마지막이라 번호도 지운다)',
    bobRole: 'editor',
    lockPage: (fx) => fx.pageId,
    fire: async (ctx, fx) =>
      fireRest(ctx, fx, 'DELETE', `/api/projects/${fx.projectId}/pages/${fx.pageId}/comments/${fx.bobCommentId}`),
    okStatus: 200,
  },
  {
    // 코멘트 수정은 문서를 안 바꾸지만 페이지 행을 `KEY SHARE`로 잡는다(`repos/pages.ts`의
    // `lockPageShared`). 그 값으로 같은 페이지의 쓰기 뒤에 선다 — 이 판이 «선다 · 그 뒤의 역할로 판정한다»를 잰다.
    route: 'PATCH /api/projects/:projectId/pages/:pageId/comments/:commentId',
    label: '코멘트 수정 (작성자 — 페이지 행 KEY SHARE 로 선다)',
    bobRole: 'editor',
    lockPage: (fx) => fx.pageId,
    fire: async (ctx, fx) =>
      fireRest(ctx, fx, 'PATCH', `/api/projects/${fx.projectId}/pages/${fx.pageId}/comments/${fx.bobCommentId}`, {
        body: '밥이 고친 말',
      }),
    okStatus: 200,
  },
  {
    route: 'POST /api/projects/:projectId/pages/:pageId/comments/renumber',
    label: '코멘트 재번호 (바꿀 번호가 있다)',
    bobRole: 'editor',
    lockPage: (fx) => fx.misnumberedPageId,
    fire: async (ctx, fx) =>
      fireRest(ctx, fx, 'POST', `/api/projects/${fx.projectId}/pages/${fx.misnumberedPageId}/comments/renumber`),
    okStatus: 200,
  },
  {
    route: 'POST /api/projects/:projectId/snapshots/:snapshotId/restore',
    label: '스냅샷 복원 (owner)',
    bobRole: 'owner',
    lockPage: (fx) => fx.pageId,
    fire: async (ctx, fx) =>
      fireRest(ctx, fx, 'POST', `/api/projects/${fx.projectId}/snapshots/${fx.snapshotId}/restore`),
    okStatus: 200,
  },
  {
    route: 'DELETE /api/projects/:projectId',
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
    label: WS_PATCH,
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

interface QueuedLock {
  /** 잠금을 **잡았을 때** 풀린다. 남이 쥐고 있으면 그동안 줄에 서 있다. */
  acquired: Promise<void>
  /** 그 트랜잭션을 커밋한다(잡기 전에 부르면 잡자마자 커밋한다). */
  release: () => Promise<void>
}

/**
 * 잠금을 **진짜 잠금 함수로** 잡으러 간다 — 잠금 SQL 을 베끼지 않는다(`restore-lock-census`와 같은 판단).
 * 기다리지 않고 돌아온다 — 남이 쥐고 있으면 이 트랜잭션은 **줄에 선다**(«같은 페이지의 다른 사람 편집»).
 */
function queueLock(take: (trx: DbHandle) => Promise<void>): QueuedLock {
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let markAcquired: () => void = () => {}
  const acquired = new Promise<void>((resolve) => {
    markAcquired = resolve
  })
  const holder = withTransaction(db, async (trx) => {
    await take(trx)
    markAcquired()
    await held
  })
  return {
    // 잡기 전에 트랜잭션이 던지면 그것을 그대로 드러낸다 — 영영 안 풀리는 약속으로 매달리지 않는다.
    acquired: Promise.race([acquired, holder]),
    release: async () => {
      release()
      await holder
    },
  }
}

/** 페이지 행 하나를 잡으러 간다(`queueLock`). */
function queuePageLock(projectId: string, pageId: string): QueuedLock {
  return queueLock(async (trx) => {
    const page = await lockPageForEdit(trx, projectId, pageId)
    if (!page) throw new Error('잡을 페이지가 없습니다')
  })
}

/** 페이지 행 하나를 잡고 **잡을 때까지** 기다린다. 돌려준 `release`를 부르면 그 트랜잭션이 커밋된다. */
async function holdPageLock(projectId: string, pageId: string): Promise<{ release: () => Promise<void> }> {
  const lock = queuePageLock(projectId, pageId)
  await lock.acquired
  return lock
}

/** 쓰기가 잠금에 쥐인 동안 밥에게 일어나는 것 — 권한이 줄거나(`role` · `member`) 요청의 자격이 죽는다(`logout` · `revoke`). */
type Demotion = 'role' | 'member' | 'logout' | 'revoke' | 'expire'

/**
 * 앨리스가 밥을 **API 로** 내린다 — 역할 한 단계(editor → viewer · owner → editor) 또는 멤버에서 뺀다. `logout` · `revoke`는
 * 밥 자신이 쿠키로 로그아웃하거나 이 프로젝트의 자기 토큰을 폐기한다.
 * 막히면 그것도 값이다: 3s 안에 안 끝나면 `blocked`로 적고 잠금을 푼 뒤 결과를 받는다.
 */
async function demote(ctx: RealApiContext, fx: Fx, bobRole: BobRole, kind: Demotion): Promise<number> {
  const url = `/api/projects/${fx.projectId}/members/${fx.bob.user.id}`
  if (kind === 'expire') {
    // **세션의 수명이 잠금을 기다리는 동안 다한다** — 만료 시각을 곧(200ms 뒤)으로 당기고 그 시각이 지날 때까지 기다린다. 쓰기의
    // 트랜잭션은 그보다 **먼저** 열렸다 — 그 트랜잭션의 `now()`로 보면 아직 산 세션이다. 답할 상태 코드가 없는 일이라 0 이다.
    await sql`update sessions set expires_at = clock_timestamp() + interval '200 milliseconds' where user_id = ${fx.bob.user.id}`.execute(db)
    await new Promise((resolve) => setTimeout(resolve, 400))
    return 0
  }
  if (kind === 'logout') {
    return (await ctx.app.inject({ method: 'POST', url: '/api/auth/logout', cookies: fx.bob.cookie })).statusCode
  }
  if (kind === 'revoke') {
    const token = await db
      .selectFrom('api_tokens')
      .select('id')
      .where('project_id', '=', fx.projectId)
      .where('user_id', '=', fx.bob.user.id)
      .executeTakeFirstOrThrow()
    return (await ctx.app.inject({ method: 'DELETE', url: `/api/projects/${fx.projectId}/tokens/${token.id}`, cookies: fx.bob.cookie })).statusCode
  }
  const res = await ctx.app.inject(
    kind === 'role'
      ? { method: 'PATCH', url, cookies: fx.alice.cookie, payload: { role: bobRole === 'owner' ? 'editor' : 'viewer' } }
      : { method: 'DELETE', url, cookies: fx.alice.cookie },
  )
  return res.statusCode
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

/**
 * 잠금을 잡고 → 쏘고 → 그 요청이 잠금에 선 것을 확인하고 → (강등하고) → 푼다. 페이지 잠금(`runHeld`)과 프로젝트
 * 잠금(`runProjectHeld`)이 이 한 벌을 쓴다 — 무엇을 쥐는지만 다르다.
 */
async function heldWrite(
  ctx: RealApiContext,
  fx: Fx,
  label: string,
  bobRole: BobRole,
  lock: QueuedLock,
  fire: () => Promise<Fired>,
  kind: Demotion | null,
): Promise<Omit<HeldOutcome, 'before' | 'after'>> {
  await lock.acquired
  let request: Fired | undefined
  let demotion: Promise<number> | null = null
  let demotedWhileHeld = false
  try {
    request = await fire()
    await waitForLockWaiter()
    expect(request.done(), `${label}: 잠금에 서지 않았다`).toBe(false)
    if (kind !== null) {
      demotion = demote(ctx, fx, bobRole, kind)
      const early = await Promise.race([
        demotion.then(() => 'done' as const),
        new Promise<'blocked'>((resolve) => setTimeout(() => resolve('blocked'), 3_000)),
      ])
      demotedWhileHeld = early === 'done'
    }
  } finally {
    await lock.release()
  }
  const res = await request.promise
  const demotionStatus = demotion === null ? null : await demotion
  return { ...res, demotionStatus, demotedWhileHeld }
}

/** 페이지 행을 쥔 채 `heldWrite`. */
async function runHeld(ctx: RealApiContext, probe: Probe, kind: Demotion | null): Promise<HeldOutcome> {
  const fx = await fixture(ctx, probe.bobRole)
  const prepared = probe.prepare ? await probe.prepare(ctx, fx) : {}
  const before = await projectState(fx)
  try {
    const lock = queuePageLock(fx.projectId, probe.lockPage(fx))
    const outcome = await heldWrite(ctx, fx, probe.label, probe.bobRole, lock, () => probe.fire(ctx, fx, prepared), kind)
    return { ...outcome, before, after: await projectState(fx) }
  } finally {
    prepared.socket?.close()
  }
}

/**
 * 가드가 같은 판에서 내는 것 — 역할이 모자라면 403, 멤버가 아니면 404(`requireProjectRole`의 표), 자격이 죽었으면 401
 * (`projectGuard`의 «로그인하지 않았으면»).
 */
const REFUSED: Record<Demotion, number> = { role: 403, member: 404, logout: 401, revoke: 401, expire: 401 }

describe('페이지 잠금에 쥐인 쓰기 — 커밋 순간의 권한으로 판정한다', () => {
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

/**
 * **멤버에서 빠지면 404 — 가드와 같은 상태 코드다.** 재확인이 가드의 술어(`requireProjectRole`)를 그대로 쓰면
 * 비멤버는 404 · 역할 모자람은 403 으로 갈린다. 재확인에 술어를 한 벌 더 쓰면(예: «역할이 없거나 모자라면 403»)
 * 위 표의 403 판은 전부 그대로 지나고 **이 절만** 죽는다.
 *
 * **REST 와 WS 가 한 판씩이다 — 재확인이 두 자리에 따로 있기 때문이다**(`auth/roles.ts`의 `recheckProjectRole` ·
 * `ws/patch.ts`의 `requireProjectRole`). 한쪽만 두 벌 술어로 바꾸면 그쪽 판만 죽는다. REST 한 판뿐이면
 * WS 쪽을 두 벌로 바꾸는 변조에 api 전량이 통과한다. WS 는 거절이 `patch-error` 프레임의 상태다 —
 * 가드 경로의 WS(프레임 수신 확인)는 비멤버면 소켓을 끊지만(4403), 잠금 안의 재확인은 끊지 않고 404 를 답한다.
 *
 * 재확인 자리를 지우는 변조에는 표의 같은 라우트 판(`코멘트 게시 (번호를 붙인다 …)` · `WS patch 프레임`)과 **함께**
 * 죽는다 — 그 축(재확인이 서는가)은 그 판들이 소유한다. 이 절이 혼자 소유하는 것은 상태 코드(404)다.
 */
describe('멤버에서 빠지면 404 — 가드와 같은 상태 코드', () => {
  for (const label of [BARE_COMMENT, WS_PATCH]) {
    it(`${label}: 잠금에 쥐인 채 멤버에서 빠지면 풀린 뒤 404 — 아무것도 안 바뀐다`, async () => {
      await withRealApi(async (ctx) => {
        const outcome = await runHeld(ctx, probeLabeled(label), 'member')
        expect(outcome.demotedWhileHeld, '제외가 쓰기의 잠금 대기에 막혔다').toBe(true)
        expect(outcome.demotionStatus).toBe(204)
        expect(outcome.status, outcome.body).toBe(REFUSED.member)
        expect(outcome.after).toEqual(outcome.before)
      })
    }, 60_000)
  }
})

/** 밥의 토큰으로 낸 `PATCH .../ops` — 아래 두 절이 쓴다. */
const TOKEN_PROBE: Probe = {
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

  it('대조 — 강등이 없으면 토큰의 편집이 커밋된다', async () => {
    await withRealApi(async (ctx) => {
      const outcome = await runHeld(ctx, TOKEN_PROBE, null)
      expect(outcome.status, outcome.body).toBe(200)
      expect(outcome.after).not.toEqual(outcome.before)
    })
  }, 60_000)

  it('잠금에 쥐인 채 토큰 주인이 강등되면 풀린 뒤 403 — 아무것도 안 바뀐다', async () => {
    await withRealApi(async (ctx) => {
      const outcome = await runHeld(ctx, TOKEN_PROBE, 'role')
      expect(outcome.demotedWhileHeld).toBe(true)
      expect(outcome.status, outcome.body).toBe(REFUSED.role)
      expect(outcome.after).toEqual(outcome.before)
    })
  }, 60_000)
})

/**
 * **자격이 잠금을 기다리는 동안 죽으면 401 — 가드가 로그인하지 않은 요청에 내는 값이다.** 가드는 자격(세션 · 토큰)을 핸들러 앞에서
 * 한 번 본다. 쓰기가 잠금에 쥐인 동안 그 사람이 로그아웃하거나 토큰을 폐기해도 역할 · 멤버십은 그대로라, 재확인이 멤버 행만
 * 보면 풀린 뒤 **죽은 자격으로 커밋된다.** 그래서 재확인이 같은 트랜잭션에서 요청의 세션 · 토큰 행도 본다
 * (`auth/roles.ts`의 `recheckAtCommit` — REST 와 WS 가 같은 함수다).
 *
 * **로그아웃 · 폐기는 쓰기의 잠금 대기에 막히지 않는다** — 쓰기는 재확인 **전**이라 그 행을 아직 안 쥐었다(`…WhileHeld`).
 * 재확인이 그 행을 잡는 것은 커밋까지다(`FOR KEY SHARE` — 로그아웃의 `DELETE`와만 부딪힌다).
 *
 * 세 판은 자격이 사는 자리가 갈린다 — 요청의 쿠키(REST) · 연결이 든 세션(WS) · 토큰. 대조(자격이 살아 있으면 커밋)는 표의 같은 판이
 * 소유한다(`코멘트 게시 (번호를 붙인다 …)` · `WS patch 프레임` · 위 `토큰 요청도 …`의 대조).
 */
describe('자격이 잠금을 기다리는 동안 죽으면 401 — 커밋 순간에 세션 · 토큰도 본다', () => {
  for (const [label, kind] of [
    [BARE_COMMENT, 'logout'],
    [WS_PATCH, 'logout'],
  ] as const) {
    it(`${label}: 잠금에 쥐인 채 로그아웃하면 풀린 뒤 401 — 아무것도 안 바뀐다`, async () => {
      await withRealApi(async (ctx) => {
        const outcome = await runHeld(ctx, probeLabeled(label), kind)
        expect(outcome.demotedWhileHeld, '로그아웃이 쓰기의 잠금 대기에 막혔다').toBe(true)
        expect(outcome.demotionStatus).toBe(204)
        expect(outcome.status, outcome.body).toBe(REFUSED[kind])
        expect(outcome.after).toEqual(outcome.before)
      })
    }, 60_000)
  }

  /**
   * **세션의 수명(TTL)이 잠금을 기다리는 동안 다해도 401 이다.** 만료는 행을 지우지 않는다 — 시각이 지날 뿐이다. 생사의
   * 술어(`sessionIsLive`)가 트랜잭션 안의 `now()`로 보면 그것은 **트랜잭션이 열린 시각**(잠금 대기 전)이라 이미 지난 만료를
   * 산 것으로 읽고 커밋한다. 혼자 죽는 변조: `sessionIsLive`의 시각을 `statement_timestamp()`에서 `now()`로 되돌린다.
   */
  for (const label of [BARE_COMMENT, WS_PATCH] as const) {
    it(`${label}: 잠금에 쥐인 채 세션 만료 시각이 지나면 풀린 뒤 401 — 아무것도 안 바뀐다`, async () => {
      await withRealApi(async (ctx) => {
        const outcome = await runHeld(ctx, probeLabeled(label), 'expire')
        expect(outcome.demotedWhileHeld).toBe(true)
        expect(outcome.status, outcome.body).toBe(REFUSED.expire)
        expect(outcome.after).toEqual(outcome.before)
      })
    }, 60_000)
  }

  /**
   * **재확인 뒤의 로그아웃은 이 커밋을 기다린다** — 재확인이 세션 행을 `FOR KEY SHARE`로 잡는 까닭이다. 재확인 뒤에 기다림이
   * 남는 쓰기는 코멘트 수정이다(프로젝트 행 → 페이지 행 → 재확인 → 코멘트 행 — `routes/comments.ts`). 코멘트 행을 쥔 채 밥의
   * 수정을 세우고 밥이 로그아웃하면: 잡으면 로그아웃이 수정의 커밋까지 서고(수정 200 이 먼저), 안 잡으면 로그아웃 204 가 먼저
   * 끝나고 **그 뒤에 죽은 세션의 수정이 커밋된다.** 혼자 죽는 변조: `sessionIsLive`의 `'key-share'` 갈래가 행을 안 잡는다.
   */
  it('재확인을 지나 코멘트 행에 선 수정 — 그동안의 로그아웃은 그 커밋을 기다린다(수정 200 → 로그아웃 204)', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx, 'editor')
      const door = queueLock(async (trx) => {
        await sql`select 1 from comments where id = ${fx.bobCommentId} for update`.execute(trx)
      })
      await door.acquired
      const order: string[] = []
      let edit: Fired | undefined
      let logout: Promise<number> | undefined
      let loggedOutWhileHeld = true
      try {
        edit = fireRest(ctx, fx, 'PATCH', `/api/projects/${fx.projectId}/pages/${fx.pageId}/comments/${fx.bobCommentId}`, {
          body: '밥이 고친 말',
        })
        void edit.promise.then(() => order.push('edit'))
        await waitForLockWaiter(1)
        logout = ctx.app
          .inject({ method: 'POST', url: '/api/auth/logout', cookies: fx.bob.cookie })
          .then((res) => (order.push('logout'), res.statusCode))
        loggedOutWhileHeld = await Promise.race([
          logout.then(() => true),
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 700)),
        ])
      } finally {
        await door.release()
      }
      const [edited, loggedOut] = await Promise.all([edit.promise, logout])

      expect(loggedOutWhileHeld, '로그아웃이 재확인을 지난 수정을 앞질렀다').toBe(false)
      expect(edited.status, edited.body).toBe(200)
      expect(loggedOut).toBe(204)
      expect(order).toEqual(['edit', 'logout'])
    })
  }, 60_000)

  it('페이지 ops 편집 — 토큰: 잠금에 쥐인 채 그 토큰을 폐기하면 풀린 뒤 401 — 아무것도 안 바뀐다', async () => {
    await withRealApi(async (ctx) => {
      const outcome = await runHeld(ctx, TOKEN_PROBE, 'revoke')
      expect(outcome.demotedWhileHeld, '폐기가 쓰기의 잠금 대기에 막혔다').toBe(true)
      expect(outcome.demotionStatus).toBe(204)
      expect(outcome.status, outcome.body).toBe(REFUSED.revoke)
      // 폐기가 지운 토큰 행 말고는 아무것도 안 바뀐다.
      expect(outcome.after.tokens).toEqual([])
      expect({ ...outcome.after, tokens: [] }).toEqual({ ...outcome.before, tokens: [] })
    })
  }, 60_000)
})

/**
 * **잠금에 안 서는 쓰기도 가드와 커밋 사이가 있다 — 프리셋 삭제.** 이 쓰기는 기다리는 잠금이 없어(아래 «분모»의 `NOT_LOCKED`)
 * 가드와 `DELETE` 사이는 수 ms 다. 그 사이 강등 · 제외가 커밋되면 가드의 옛 판정으로 지운다 — viewer 가 된 사람이 프리셋을
 * 지운다. 그 틈을 매번 서게 하려고 `BEFORE DELETE` 트리거가 1s 를 끼운다(행은 이미 잡혔다). 재확인은 `DELETE` 뒤 같은
 * 트랜잭션에서 돈다(`routes/presets.ts`). 혼자 죽는 변조: 그 재확인 한 줄을 뗀다.
 */
describe('프리셋 삭제 — 가드와 커밋 사이의 강등도 커밋 순간에 본다', () => {
  async function presetDeleteRace(ctx: RealApiContext, demotion: Demotion | null) {
    const fx = await fixture(ctx, 'editor')
    const made = await ctx.app.inject({
      method: 'POST',
      url: `/api/projects/${fx.projectId}/presets`,
      cookies: fx.alice.cookie,
      payload: { name: '앨리스의 프리셋', schema: [] },
    })
    expect(made.statusCode, made.body).toBe(201)
    const presetId = (made.json() as { id: string }).id
    await sql.raw(
      `create function zz_slow_preset_delete() returns trigger language plpgsql as $$ begin perform pg_sleep(1); return old; end $$`,
    ).execute(db)
    await sql`create trigger zz_slow_preset_delete before delete on presets for each row execute function zz_slow_preset_delete()`.execute(db)
    try {
      const removal = fireRest(ctx, fx, 'DELETE', `/api/projects/${fx.projectId}/presets/${presetId}`)
      // 트리거의 잠에 든 것을 본다 — 가드는 이미 지났다. `query`로 찾지 않는다: 그 칸은 최상위 문장(`delete from presets …`)이라
      // 트리거 안의 글자가 안 보이고, 찾는 글자를 담은 이 조회문 자신에 걸려 잠든 쓰기가 없어도 1 을 센다. 잠은 `wait_event`로 본다.
      const deadline = Date.now() + 5_000
      for (;;) {
        const { rows } = await sql<{ n: number }>`
          select count(*)::int as n from pg_stat_activity
           where datname = current_database() and wait_event = 'PgSleep' and pid <> pg_backend_pid()
        `.execute(db)
        if ((rows[0]?.n ?? 0) >= 1) break
        if (Date.now() > deadline) throw new Error('삭제가 트리거에 서지 않았다 — 판이 서지 않았다')
        await new Promise((resolve) => setTimeout(resolve, 10))
      }
      const demoted = demotion === null ? null : await demote(ctx, fx, 'editor', demotion)
      const res = await removal.promise
      const left = await db.selectFrom('presets').select('id').where('id', '=', presetId).execute()
      return { res, demoted, left: left.length }
    } finally {
      await sql`drop trigger if exists zz_slow_preset_delete on presets`.execute(db)
      await sql`drop function if exists zz_slow_preset_delete()`.execute(db)
    }
  }

  it('대조 — 강등이 없으면 지운다(204 · 행 0)', async () => {
    await withRealApi(async (ctx) => {
      const { res, left } = await presetDeleteRace(ctx, null)
      expect(res.status, res.body).toBe(204)
      expect(left).toBe(0)
    })
  }, 60_000)

  it('가드 뒤 · 커밋 전에 viewer 로 내려가면 403 — 프리셋이 남는다', async () => {
    await withRealApi(async (ctx) => {
      const { res, demoted, left } = await presetDeleteRace(ctx, 'role')
      expect(demoted).toBe(200)
      expect(res.status, res.body).toBe(REFUSED.role)
      expect(left).toBe(1)
    })
  }, 60_000)
})

/**
 * # 커밋 중 틈 — 같은 키로 다시 보낸 게시
 *
 * 웹은 응답을 10s 안에 못 받은 게시를 **같은 멱등 키로 다시 보내** 판정한다. 첫 게시가 페이지 잠금에 쥐인 채
 * 강등되면: 다시 보낸 것은 행이 아직 없어 가드 앞 재생을 지나쳐 가드에서 403 을 받고, 웹은 그것을 «안 달림»
 * 확정으로 읽는다. **첫 게시가 그 뒤 커밋되면** «안 달림»이 거짓이 되고 고쳐 달면 두 행이다.
 * 그래서 첫 게시도 잠금 뒤 재확인에서 같은 403 으로 되돌아간다.
 *
 * **이 판의 축(재확인이 서는가)은 표의 `코멘트 게시 (번호를 붙인다 …)` 판이 소유한다** — 같은 변조에 함께 죽는다.
 * 이 판이 더 재는 것은 **다시 보낸 것의 답과 첫 게시의 결말이 같은가**다. 대조는 권한이 그대로인 판 — 다시 보낸
 * 것이 잠금 뒤에 줄을 서 있다가 첫 게시의 행을 **잠금 안에서** 재생한다(`routes/comments.ts`).
 *
 * **셋째 판 — 재확인은 잠금 안 재생의 뒤다.** 첫 게시가 **커밋된 뒤**, 다시 보낸 것이 잠금을 잡기 **전에** 강등되면
 * 다시 보낸 것은 재생(200 · 같은 코멘트)이어야 한다 — 이미 커밋된 자기 행이다(가드 앞 재생과 같은 판정). 재확인을
 * 재생 앞으로 옮기면 403 이 나가고, 웹은 **달린 게시**를 «안 달림»으로 읽는다(고쳐 달면 두 행의 씨앗).
 *
 * 이 판은 **같은 페이지의 남의 쓰기가 줄에 끼면** 선다 — 페이지 행의 잠금 대기열은 도착 순이다. 첫 게시 → 남의 쓰기
 * → 다시 보낸 것 순으로 줄을 세우면, 첫 게시가 커밋한 뒤 남의 쓰기가 잠금을 쥔 동안 다시 보낸 것은 아직 잠금 밖이다
 * — 그 사이에 강등을 넣는다. («앞 게시의 커밋과 이 요청의 잠금 획득 사이에 기다리는 문장이 없어 세울 판이 없다»로
 * 보면 줄에 끼는 제삼자를 놓친다.)
 */
describe('커밋 중 틈 — 같은 키로 다시 보낸 게시', () => {
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

  it('첫 게시가 커밋된 뒤 · 다시 보낸 것이 잠금을 잡기 전에 강등되면 — 다시 보낸 것은 잠금 안에서 재생 200 · 행 1', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx, 'editor')
      const hold = await holdPageLock(fx.projectId, fx.barePageId)
      let first: Fired | undefined
      let other: QueuedLock | undefined
      let resent: Fired | undefined
      try {
        first = post(ctx, fx)
        await waitForLockWaiter(1)
        // 같은 페이지의 **남의 쓰기**가 첫 게시 뒤에 줄을 선다.
        other = queuePageLock(fx.projectId, fx.barePageId)
        await waitForLockWaiter(2)
        resent = post(ctx, fx)
        await waitForLockWaiter(3)
      } finally {
        await hold.release()
      }
      const committed = await first.promise
      let demotion: number | undefined
      let resentWasWaiting = false
      try {
        // 첫 게시가 커밋했고, 남의 쓰기가 잠금을 쥐었다 — 다시 보낸 것은 아직 그 뒤에 서 있다.
        await other.acquired
        resentWasWaiting = !resent.done()
        demotion = await demote(ctx, fx, 'editor', 'role')
      } finally {
        await other.release()
      }
      const replayed = await resent.promise

      expect(committed.status, committed.body).toBe(201)
      expect(resentWasWaiting, '다시 보낸 것이 강등 전에 끝났다 — 판이 성립하지 않았다').toBe(true)
      expect(demotion).toBe(200)
      expect(replayed.status, replayed.body).toBe(200)
      const commentId = (body: string) => (JSON.parse(body) as { comment: { id: string } }).comment.id
      expect(commentId(replayed.body)).toBe(commentId(committed.body))
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
      // 요청한 사람이 없는 픽스처라 권한은 다시 보지 않는다 — 이 판이 재는 것은 강등이 커밋 전인 동안의 남의 쓰기다.
      const member = await updateMemberRole(trx, fx.projectId, fx.bob.user.id, 'viewer', { tokenId: null, credential: async () => {}, role: async () => {} })
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
    const before = await projectState(fx)
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
    return { ...res, waitedOnRoleChange, before, after: await projectState(fx) }
  }

  for (const label of [BARE_COMMENT, WS_PATCH]) {
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
 * # 잠금 순서 — 프로젝트 삭제는 복원과 같은 순서로 잠근다 (프로젝트 행 → 페이지)
 *
 * 프로젝트 삭제는 재확인 앞에서 기다릴 것을 먼저 다 잡는다(`routes/projects.ts`). 순서는 복원(`lockProjectForRestore`)과
 * 같이 **프로젝트 행 → 페이지**다(`repos/projects.ts`의 `lockProjectRow`). **페이지만** 먼저 잡으면 그 순서가 아래
 * 두 교착(E1 · E2)을 연다.
 *
 * | 판 | 페이지만 먼저 잡으면 무엇이 서로를 기다리나 | 이 절이 보는 것 |
 * |---|---|---|
 * | E1 — 남의 페이지 쓰기가 진행 중일 때 owner 둘이 삭제 · 복원 | 복원: 프로젝트 행을 쥐고 페이지를 · 삭제: 페이지를 쥐고 프로젝트 행을 | 복원이 삭제를 기다렸다가 404 · 삭제 204 · 교착 0 |
 * | E2 — FK 삽입이 진행 중일 때 삭제와 다른 owner 의 역할 변경 | 삭제: 제 멤버 행을 `FOR SHARE`로 쥐고 프로젝트 행을(FK 삽입 뒤) · 역할 변경(`lockOwnerIds`): 다른 owner 행을 쥐고 삭제의 멤버 행을 · 그다음 CASCADE 가 그 다른 owner 행을 | 역할 변경이 삭제를 **안 기다린다**(200) · 교착 0 |
 *
 * **교착은 `pg_stat_database.deadlocks`로 본다** — 희생자는 500 을 받으므로 상태 코드가 먼저 죽지만, 카운터는 «그
 * 500 이 교착이었다»를 따로 말한다.
 *
 * **E2 는 멤버 행의 물리 순서에 기댄다** — `lockOwnerIds`는 `ORDER BY` 없이 잠가 계획(heap 순서)의 순서로
 * 잡는다. 삭제하는 사람의 행이 **먼저**면 역할 변경은 교착 대신 그 행에서 **삭제가 끝날 때까지 기다린다.** 이 판은 둘 다 잡는다 — «역할 변경이 FK 삽입을 쥔 동안 끝났는가»를 본다. 앨리스를 나중에 owner 로 올리는
 * 것은 교착 쪽이 서기 쉽게 하려는 것이지 판의 전제가 아니다.
 *
 * **FK 삽입은 진짜 `insertMenuNode`다**(메뉴를 만드는 중인 트랜잭션) — 초대 · 페이지 · 스냅샷 · 토큰 생성이 프로젝트
 * 행에 거는 잠금(`FOR KEY SHARE`)과 같다.
 *
 * | 변조(`routes/projects.ts`) | 죽는 것 |
 * |---|---|
 * | 삭제의 `lockProjectRow`를 뺀다(페이지만 먼저) | E1 · E2 |
 * | `lockProjectRow`를 `lockProjectPages` **뒤로** | **E1 혼자** — 프로젝트 행 대기가 재확인 앞이라 E2 는 선다 |
 * | 삭제의 프로젝트 행 잠금을 `FOR NO KEY UPDATE`로 | **E2 혼자** — FK 삽입과 충돌하지 않아 그 대기가 재확인 뒤(`DELETE`)로 밀린다. 복원과는 여전히 충돌해 E1 은 선다 |
 */
async function deadlockCount(): Promise<number> {
  const result = await sql<{ n: number }>`
    select deadlocks::int as n from pg_stat_database where datname = current_database()
  `.execute(db)
  return result.rows[0]!.n
}

/**
 * 그 프로젝트에 **메뉴 노드를 넣는 중인** 트랜잭션을 붙들어 둔다 — 진짜 `insertMenuNode`다. 넣은 행의 FK 가 프로젝트
 * 행에 `FOR KEY SHARE`를 건다. 돌려준 `release`를 부르면 커밋된다.
 */
async function holdMenuInsert(projectId: string): Promise<{ release: () => Promise<void> }> {
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => {
    release = resolve
  })
  let markInserted: () => void = () => {}
  const inserted = new Promise<void>((resolve) => {
    markInserted = resolve
  })
  const holder = withTransaction(db, async (trx) => {
    await insertMenuNode(trx, projectId, { parentId: null, title: '넣는 중인 메뉴' })
    markInserted()
    await held
  })
  await Promise.race([inserted, holder])
  return {
    release: async () => {
      release()
      await holder
    },
  }
}

describe('잠금 순서 — 프로젝트 삭제는 복원과 같은 순서로 잠근다 (프로젝트 행 → 페이지)', () => {
  it('E1 — 남의 페이지 쓰기가 진행 중일 때 owner 둘이 삭제 · 복원을 겹치면: 복원은 삭제를 기다렸다가 404 · 교착 0', async () => {
    await withRealApi(async (ctx) => {
      // 앨리스 · 밥 둘 다 owner. 스냅샷 뒤에 바꾼 것이 있어 복원이 실제로 쓰는 판이다.
      const fx = await fixture(ctx, 'owner')
      const deadlocksBefore = await deadlockCount()
      const pageWrite = await holdPageLock(fx.projectId, fx.pageId)
      let removal: Fired | undefined
      let restore: Fired | undefined
      try {
        removal = track(ctx.app.inject({ method: 'DELETE', url: `/api/projects/${fx.projectId}`, cookies: fx.alice.cookie }))
        await waitForLockWaiter(1)
        restore = fireRest(ctx, fx, 'POST', `/api/projects/${fx.projectId}/snapshots/${fx.snapshotId}/restore`)
        // 둘 다 서야 판이 선다 — 삭제는 페이지에서, 복원은 (프로젝트 행 → 페이지 순서면) 프로젝트 행에서.
        await waitForLockWaiter(2)
      } finally {
        await pageWrite.release()
      }
      const [removed, restored] = await Promise.all([removal.promise, restore.promise])

      expect(restored.status, restored.body).toBe(404)
      expect(removed.status, removed.body).toBe(204)
      expect(await deadlockCount()).toBe(deadlocksBefore)
    })
  }, 60_000)

  it('E2 — FK 삽입이 진행 중일 때 삭제와 다른 owner 의 역할 변경을 겹치면: 역할 변경은 삭제를 안 기다린다 · 교착 0', async () => {
    await withRealApi(async (ctx) => {
      const carol = await signup(ctx)
      const alice = await signup(ctx)
      const bob = await signup(ctx)
      const project = await createProject(ctx, carol.cookie)
      await addMember(ctx, project.id, alice.user.id, 'editor')
      const promoted = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${project.id}/members/${alice.user.id}`,
        cookies: carol.cookie,
        payload: { role: 'owner' },
      })
      if (promoted.statusCode !== 200) throw new Error(`owner 승격 픽스처 실패: ${promoted.body}`)
      await addMember(ctx, project.id, bob.user.id, 'editor')
      const menu = await createMenuNode(ctx, carol.cookie, project.id, { title: '메뉴' })
      await createPage(ctx, carol.cookie, project.id, menu.id, { title: '페이지' })

      const deadlocksBefore = await deadlockCount()
      const insert = await holdMenuInsert(project.id)
      let removal: Fired | undefined
      let roleChange: Fired | undefined
      let roleChangedWhileHeld = false
      try {
        removal = track(ctx.app.inject({ method: 'DELETE', url: `/api/projects/${project.id}`, cookies: alice.cookie }))
        await waitForLockWaiter(1)
        roleChange = track(
          ctx.app.inject({
            method: 'PATCH',
            url: `/api/projects/${project.id}/members/${bob.user.id}`,
            cookies: carol.cookie,
            payload: { role: 'viewer' },
          }),
        )
        roleChangedWhileHeld = await settlesWithin(roleChange, 3_000)
      } finally {
        await insert.release()
      }
      const [removed, changed] = await Promise.all([removal.promise, roleChange.promise])

      expect(roleChangedWhileHeld, '역할 변경이 삭제의 대기에 묶였다').toBe(true)
      expect(changed.status, changed.body).toBe(200)
      expect(removed.status, removed.body).toBe(204)
      expect(await deadlockCount()).toBe(deadlocksBefore)
    })
  }, 60_000)

  /**
   * **E12 — 나중에 들어온 owner 가 지우고 먼저 들어온 owner 가 멤버를 쓴다.** 삭제는 재확인에서 삭제자(밥)의 멤버 행을 `FOR SHARE`로
   * 쥐고 CASCADE 에서 멤버 행 전부를 지운다. 역할 변경이 owner 행을 넣은 순서로(앨리스 → 밥) 잡으면 앨리스 행을 쥔 채 밥 행에 서고,
   * CASCADE 는 그 앨리스 행에 서서 고리다. 판을 세우는 문: 밥의 멤버 행을 테스트 트랜잭션이 `FOR UPDATE`로 쥔 채 삭제를 먼저, 역할
   * 변경을 다음에 그 행에 줄 세우고 푼다(줄의 머리가 삭제다). 삭제가 owner 행을 멤버 쓰기와 같은 순서로 재확인 **앞에서** 잡으면
   * 둘 중 하나가 아무것도 안 쥔 채 선다(`repos/members.ts`의 `lockOwnerIds`). 문은 SQL 로 직접 잡는다 — 줄을 세우는 문일 뿐 재는 대상이
   * 아니다(`FOR SHARE`로는 재확인과 호환이라 삭제가 문 앞에 안 선다). 혼자 죽는 변조: 삭제가 `lockOwnerIds`를 안 부른다
   * (`routes/projects.ts`) — 교착 +1 · 한쪽 500.
   */
  it('E12 — 나중 owner 의 삭제와 먼저 owner 의 역할 변경을 겹치면: 삭제 204 · 역할 변경 404 · 교착 0', async () => {
    await withRealApi(async (ctx) => {
      const alice = await signup(ctx)
      const bob = await signup(ctx)
      const carol = await signup(ctx)
      const project = await createProject(ctx, alice.cookie)
      await addMember(ctx, project.id, bob.user.id, 'owner')
      await addMember(ctx, project.id, carol.user.id, 'editor')
      const menu = await createMenuNode(ctx, alice.cookie, project.id, { title: '메뉴' })
      await createPage(ctx, alice.cookie, project.id, menu.id, { title: '페이지' })

      const deadlocksBefore = await deadlockCount()
      const door = queueLock(async (trx) => {
        await sql`select 1 from project_members where project_id = ${project.id} and user_id = ${bob.user.id} for update`.execute(trx)
      })
      await door.acquired
      let removal: Fired | undefined
      let roleChange: Fired | undefined
      try {
        removal = track(ctx.app.inject({ method: 'DELETE', url: `/api/projects/${project.id}`, cookies: bob.cookie }))
        await waitForLockWaiter(1)
        roleChange = track(
          ctx.app.inject({
            method: 'PATCH',
            url: `/api/projects/${project.id}/members/${carol.user.id}`,
            cookies: alice.cookie,
            payload: { role: 'viewer' },
          }),
        )
        await waitForLockWaiter(2)
      } finally {
        await door.release()
      }
      const [removed, changed] = await Promise.all([removal.promise, roleChange.promise])

      expect(await deadlockCount()).toBe(deadlocksBefore)
      expect(removed.status, removed.body).toBe(204)
      expect(changed.status, changed.body).toBe(404)
    })
  }, 60_000)

  /**
   * **E13 — 메뉴 제목 쓰기가 메뉴 행을 쥔 채 재확인에 서 있을 때 프로젝트 삭제.** 제목 쓰기는 프로젝트 행을 안 잡고 «메뉴 행 →
   * 재확인(자기 멤버 행 `FOR SHARE`)» 순이다(`routes/menu.ts`의 `PATCH`). 삭제가 메뉴 행을 CASCADE 에서 처음 만나면 그때 쓰는 사람의
   * 멤버 행을 이미 쥐고 있다 — owner 면 `lockOwnerIds`가, editor 면 CASCADE 가 먼저 지운 멤버 행이다. 판을 세우는 문: 쓰는 사람의
   * 멤버 행을 테스트 트랜잭션이 `FOR UPDATE`로 쥔 채 삭제를 먼저(그 행에 선다), 제목 쓰기를 다음에 세우고 푼다. 삭제가 메뉴 행을
   * owner 행 **앞에서** 잡으면(`routes/projects.ts` — `lockProjectMenuNodes`) 제목 쓰기가 메뉴 행에서 삭제를 기다렸다가 0 행 → 404 다.
   * 셋은 같은 변조에 함께 죽는다 — 삭제가 `lockProjectMenuNodes`를 안 부르면 교착 +1 · 한쪽 500. 셋을 두는 것은 쓰는 사람이
   * 삭제에 잡히는 자리(owner 행 · CASCADE)와 쓰기 경로(바탕 · 바탕 없음)가 갈려서다.
   */
  for (const probe of [
    { label: 'owner · 바탕 있는 제목', writer: 'bob' as const, base: true },
    { label: 'owner · 바탕 없는 제목', writer: 'bob' as const, base: false },
    { label: 'editor · 바탕 있는 제목', writer: 'carol' as const, base: true },
  ]) {
    it(`E13 — 메뉴 제목 쓰기(${probe.label})가 메뉴 행을 쥔 채 재확인에 섰을 때 삭제: 삭제 204 · 쓰기 404 · 교착 0`, async () => {
      await withRealApi(async (ctx) => {
        const alice = await signup(ctx)
        const bob = await signup(ctx)
        const carol = await signup(ctx)
        const project = await createProject(ctx, alice.cookie)
        await addMember(ctx, project.id, bob.user.id, 'owner')
        await addMember(ctx, project.id, carol.user.id, 'editor')
        const menu = await createMenuNode(ctx, alice.cookie, project.id, { title: '메뉴' })
        await createPage(ctx, alice.cookie, project.id, menu.id, { title: '페이지' })
        const writer = probe.writer === 'bob' ? bob : carol

        const deadlocksBefore = await deadlockCount()
        const door = queueLock(async (trx) => {
          await sql`select 1 from project_members where project_id = ${project.id} and user_id = ${writer.user.id} for update`.execute(trx)
        })
        await door.acquired
        let removal: Fired | undefined
        let rename: Fired | undefined
        try {
          removal = track(ctx.app.inject({ method: 'DELETE', url: `/api/projects/${project.id}`, cookies: alice.cookie }))
          await waitForLockWaiter(1)
          rename = track(
            ctx.app.inject({
              method: 'PATCH',
              url: `/api/projects/${project.id}/menu/${menu.id}`,
              cookies: writer.cookie,
              payload: probe.base ? { title: '고친 제목', base: { title: '메뉴' } } : { title: '고친 제목' },
            }),
          )
          await waitForLockWaiter(2)
        } finally {
          await door.release()
        }
        const [removed, renamed] = await Promise.all([removal.promise, rename.promise])

        expect(await deadlockCount()).toBe(deadlocksBefore)
        expect(removed.status, removed.body).toBe(204)
        expect(renamed.status, renamed.body).toBe(404)
      })
    }, 60_000)
  }

  /**
   * **E14 — 바탕 없는 제목 쓰기가 행을 읽은 뒤 삭제가 그 행을 쥐고 커밋하면 404 다(500 이 아니다).** 그 경로는 행을 잠그지 않고
   * 읽고 `UPDATE`에서 처음 잡는다 — 삭제의 커밋을 기다렸다가 0 행을 쓴다(`repos/menu.ts`의 `updateMenuNode` ·
   * `repos/pages.ts`의 `updatePage` 끝의 조회). 판을 세우는 문: 삭제하는 앨리스의 멤버 행을 쥐어 삭제를 `lockOwnerIds`에 세운다
   * (페이지 · 메뉴 행은 이미 쥔 뒤다). 변조: 그 끝의 조회를 `executeTakeFirstOrThrow`로 — 페이지 판은 혼자 500, 메뉴 판은 E13 의
   * «바탕 없는 제목»과 함께 500(그 판도 메뉴 행에서 삭제를 기다렸다가 0 행을 쓴다). 삭제의 `lockProjectMenuNodes`를 떼면 메뉴 판은
   * 쓰기가 서지 않고 먼저 커밋해 판이 안 선다.
   */
  for (const probe of [
    { label: '페이지 제목', target: 'page' as const },
    { label: '메뉴 제목', target: 'menu' as const },
  ]) {
    it(`E14 — 바탕 없는 ${probe.label} 쓰기가 삭제가 쥔 행에 서면: 삭제 204 · 쓰기 404`, async () => {
      await withRealApi(async (ctx) => {
        const alice = await signup(ctx)
        const carol = await signup(ctx)
        const project = await createProject(ctx, alice.cookie)
        await addMember(ctx, project.id, carol.user.id, 'editor')
        const menu = await createMenuNode(ctx, alice.cookie, project.id, { title: '메뉴' })
        const page = await createPage(ctx, alice.cookie, project.id, menu.id, { title: '페이지' })

        const door = queueLock(async (trx) => {
          await sql`select 1 from project_members where project_id = ${project.id} and user_id = ${alice.user.id} for update`.execute(trx)
        })
        await door.acquired
        let removal: Fired | undefined
        let rename: Fired | undefined
        try {
          removal = track(ctx.app.inject({ method: 'DELETE', url: `/api/projects/${project.id}`, cookies: alice.cookie }))
          await waitForLockWaiter(1)
          rename = track(
            ctx.app.inject({
              method: 'PATCH',
              url: probe.target === 'page' ? `/api/projects/${project.id}/pages/${page.id}` : `/api/projects/${project.id}/menu/${menu.id}`,
              cookies: carol.cookie,
              payload: { title: '고친 제목' },
            }),
          )
          await waitForLockWaiter(2)
        } finally {
          await door.release()
        }
        const [removed, renamed] = await Promise.all([removal.promise, rename.promise])

        expect(removed.status, removed.body).toBe(204)
        expect(renamed.status, renamed.body).toBe(404)
      })
    }, 60_000)
  }

  /**
   * **E15 — 프리셋 삭제가 프리셋 행을 쥔 채 재확인에 서 있을 때 프로젝트 삭제.** 프리셋 삭제는 프로젝트 행을 안 잡고 «프리셋 행
   * (`DELETE`) → 재확인(자기 멤버 행 `FOR SHARE`)» 순이다(`routes/presets.ts`) — E13 의 메뉴 제목 쓰기와 같은 모양이다. 판을 세우는
   * 문도 E13 과 같다: 쓰는 사람의 멤버 행을 쥔 채 삭제를 먼저(그 행에 선다), 프리셋 삭제를 다음에 세우고 푼다. 삭제가 프리셋 행을
   * owner 행 **앞에서** 잡으면(`routes/projects.ts` — `lockProjectPresets`) 프리셋 삭제가 그 행에서 삭제를 기다렸다가 0 행 → 404 다.
   *
   * | 변조(`routes/projects.ts`) | 죽는 것 |
   * |---|---|
   * | 삭제가 `lockProjectPresets`를 안 부른다 | 둘 다 — 교착 +1 · 한쪽 500 |
   * | `lockProjectPresets`를 `lockOwnerIds` **뒤로** | **owner 판 혼자** — owner 는 `lockOwnerIds`에서 이미 잡혀 있어 그 뒤의 프리셋 대기가 고리를 닫는다. editor 는 CASCADE 에서 잡히므로 그 앞이면 된다 |
   *
   * editor 판은 혼자 죽는 변조가 없다 — 그 판이 따로 재는 것은 쓰는 사람이 CASCADE 에서 잡히는 자리인데, 그 자리보다 늦게 잡는
   * 변조는 owner 판의 자리(`lockOwnerIds`)보다도 늦다. 잠금 자리의 축은 owner 판이 소유한다.
   *
   * 재확인을 `DELETE` **앞**으로 옮기는 길은 이 판에서는 초록이지만 고르지 않았다 — 그 까닭은 삭제 주석(CASCADE 순서).
   */
  for (const probe of [
    { label: 'owner', writer: 'bob' as const },
    { label: 'editor', writer: 'carol' as const },
  ]) {
    it(`E15 — 프리셋 삭제(${probe.label})가 프리셋 행을 쥔 채 재확인에 섰을 때 삭제: 삭제 204 · 프리셋 삭제 404 · 교착 0`, async () => {
      await withRealApi(async (ctx) => {
        const alice = await signup(ctx)
        const bob = await signup(ctx)
        const carol = await signup(ctx)
        const project = await createProject(ctx, alice.cookie)
        await addMember(ctx, project.id, bob.user.id, 'owner')
        await addMember(ctx, project.id, carol.user.id, 'editor')
        const menu = await createMenuNode(ctx, alice.cookie, project.id, { title: '메뉴' })
        await createPage(ctx, alice.cookie, project.id, menu.id, { title: '페이지' })
        const writer = probe.writer === 'bob' ? bob : carol
        const made = await ctx.app.inject({
          method: 'POST',
          url: `/api/projects/${project.id}/presets`,
          cookies: writer.cookie,
          payload: { name: '지울 프리셋', schema: [] },
        })
        expect(made.statusCode, made.body).toBe(201)
        const presetId = (made.json() as { id: string }).id

        const deadlocksBefore = await deadlockCount()
        const door = queueLock(async (trx) => {
          await sql`select 1 from project_members where project_id = ${project.id} and user_id = ${writer.user.id} for update`.execute(trx)
        })
        await door.acquired
        let removal: Fired | undefined
        let presetRemoval: Fired | undefined
        try {
          removal = track(ctx.app.inject({ method: 'DELETE', url: `/api/projects/${project.id}`, cookies: alice.cookie }))
          await waitForLockWaiter(1)
          presetRemoval = track(
            ctx.app.inject({ method: 'DELETE', url: `/api/projects/${project.id}/presets/${presetId}`, cookies: writer.cookie }),
          )
          await waitForLockWaiter(2)
        } finally {
          await door.release()
        }
        const [removed, presetRemoved] = await Promise.all([removal.promise, presetRemoval.promise])

        expect(await deadlockCount()).toBe(deadlocksBefore)
        expect(removed.status, removed.body).toBe(204)
        expect(presetRemoved.status, presetRemoved.body).toBe(404)
      })
    }, 60_000)
  }

  /**
   * E3 · E4 · E10 · E11 — 자기 행만 쓰는 쓰기(테마 고르기 · 코멘트 수정 · 테마 수정 · 삭제)의 재확인. 네 판 전부 아래
   * 루프(E10 · E11 은 목록 끝)다. 삭제의 CASCADE 가 밥의 멤버 행을 **먼저** 쥐게 세운다:
   * 밥의 다른 쓰기가 재확인 중이다(그 행 `FOR SHARE` — `findMembership`) → 삭제가 CASCADE 에서 그 행에 선다 → 밥의 쓰기를 쏜다
   * → 붙든 것을 푼다. 프로젝트 행을 먼저 잡지 않으면 그 쓰기는 자기 행을 쥔 채 재확인에서 삭제를 기다리고, 삭제는 그 행을
   * 기다린다.
   */
  for (const probe of [
    {
      label: 'E3 — 테마 고르기',
      bobRole: 'owner' as const,
      fire: (ctx: RealApiContext, fx: ProjectFx) =>
        fireRest(ctx, fx, 'PUT', `/api/projects/${fx.projectId}/theme`, { themeId: fx.themeId }),
    },
    {
      label: 'E4 — 코멘트 수정',
      bobRole: 'editor' as const,
      fire: (ctx: RealApiContext, fx: ProjectFx) =>
        fireRest(ctx, fx, 'PATCH', `/api/projects/${fx.projectId}/pages/${fx.pageId}/comments/${fx.bobCommentId}`, {
          body: '밥이 고친 말',
        }),
    },
    {
      // 테마 수정 · 삭제의 `lockProjectShared`는 권한이 아니라 이 순서 때문이다 — 권한은 쓰기 뒤의 재확인이 잡는다(쓰기가
      // 테마 행 · RI 검사에서 기다려도 재확인이 그 뒤다). 자기 행(테마)부터 잡으면 E3 · E4 와 같은 고리다.
      label: 'E10 — 테마 수정',
      bobRole: 'owner' as const,
      fire: (ctx: RealApiContext, fx: ProjectFx) =>
        fireRest(ctx, fx, 'PUT', `/api/projects/${fx.projectId}/themes/${fx.themeId}`, {
          theme: { meta: { id: 'recheck-target', name: '밥이 고친 테마', version: '2.0.0' } },
        }),
    },
    {
      label: 'E11 — 테마 삭제',
      bobRole: 'owner' as const,
      fire: (ctx: RealApiContext, fx: ProjectFx) => fireRest(ctx, fx, 'DELETE', `/api/projects/${fx.projectId}/themes/${fx.themeId}`),
    },
  ]) {
    it(`${probe.label}: 삭제의 CASCADE 가 멤버 행을 쥔 채 서 있을 때 쏘면 — 삭제 204 · 쓰기는 프로젝트 행에서 기다렸다가 404 · 교착 0`, async () => {
      await withRealApi(async (ctx) => {
        const fx = await projectFixture(ctx, probe.bobRole)
        const deadlocksBefore = await deadlockCount()
        const recheck = queueLock(async (trx) => {
          await findMembership(trx, fx.projectId, fx.bob.user.id, 'share')
        })
        await recheck.acquired
        let removal: Fired | undefined
        let write: Fired | undefined
        try {
          removal = track(ctx.app.inject({ method: 'DELETE', url: `/api/projects/${fx.projectId}`, cookies: fx.alice.cookie }))
          await waitForLockWaiter(1)
          write = probe.fire(ctx, fx)
          await waitForLockWaiter(2)
        } finally {
          await recheck.release()
        }
        const [removed, written] = await Promise.all([removal.promise, write.promise])

        expect(removed.status, removed.body).toBe(204)
        expect(written.status, written.body).toBe(404)
        expect(await deadlockCount()).toBe(deadlocksBefore)
      })
    }, 60_000)
  }

  /**
   * E5–E9 — FK 삽입 다섯(스냅샷 · 초대 · 테마 · 프리셋 · 토큰 생성). 권한이 아니라 **봉투**의 판이다: 삽입의 FK 가 프로젝트
   * 행에 거는 `KEY SHARE`만으로는 삭제의 `FOR UPDATE` 뒤에 섰다가 깨어나 23503 — 봉투 없는 500 이 된다.
   * 트랜잭션 맨 앞의 `lockProjectShared`가 0 행을 보고 404 로 옮긴다. 판은 E3 · E4 와 같다.
   */
  for (const probe of [
    {
      label: 'E5 — 스냅샷 생성',
      bobRole: 'editor' as const,
      fire: (ctx: RealApiContext, fx: ProjectFx) => fireRest(ctx, fx, 'POST', `/api/projects/${fx.projectId}/snapshots`, { tag: '밥의 스냅샷' }),
    },
    {
      label: 'E6 — 멤버 초대',
      bobRole: 'owner' as const,
      fire: (ctx: RealApiContext, fx: ProjectFx) =>
        fireRest(ctx, fx, 'POST', `/api/projects/${fx.projectId}/members`, { email: fx.inviteeEmail, role: 'viewer' }),
    },
    {
      label: 'E7 — 테마 생성',
      bobRole: 'owner' as const,
      fire: (ctx: RealApiContext, fx: ProjectFx) =>
        fireRest(ctx, fx, 'POST', `/api/projects/${fx.projectId}/themes`, {
          theme: { meta: { id: 'recheck-new', name: '밥의 테마', version: '1.0.0' } },
        }),
    },
    {
      label: 'E8 — 프리셋 저장',
      bobRole: 'editor' as const,
      fire: (ctx: RealApiContext, fx: ProjectFx) =>
        fireRest(ctx, fx, 'POST', `/api/projects/${fx.projectId}/presets`, { name: '밥의 프리셋', schema: [] }),
    },
    {
      label: 'E9 — API 토큰 발급',
      bobRole: 'editor' as const,
      fire: (ctx: RealApiContext, fx: ProjectFx) => fireRest(ctx, fx, 'POST', `/api/projects/${fx.projectId}/tokens`, { name: '밥의 토큰' }),
    },
  ]) {
    it(`${probe.label}: 삭제의 CASCADE 가 멤버 행을 쥔 채 서 있을 때 쏘면 — 삭제 204 · 쓰기는 봉투 있는 404 · 교착 0`, async () => {
      await withRealApi(async (ctx) => {
        const fx = await projectFixture(ctx, probe.bobRole)
        const deadlocksBefore = await deadlockCount()
        const recheck = queueLock(async (trx) => {
          await findMembership(trx, fx.projectId, fx.bob.user.id, 'share')
        })
        await recheck.acquired
        let removal: Fired | undefined
        let write: Fired | undefined
        try {
          removal = track(ctx.app.inject({ method: 'DELETE', url: `/api/projects/${fx.projectId}`, cookies: fx.alice.cookie }))
          await waitForLockWaiter(1)
          write = probe.fire(ctx, fx)
          await waitForLockWaiter(2)
        } finally {
          await recheck.release()
        }
        const [removed, written] = await Promise.all([removal.promise, write.promise])

        expect(removed.status, removed.body).toBe(204)
        expect(written.status, written.body).toBe(404)
        expect(JSON.parse(written.body)).toMatchObject({ error: { code: 'not-found' } })
        expect(await deadlockCount()).toBe(deadlocksBefore)
      })
    }, 60_000)
  }

  /**
   * F3 · F3′ — 코멘트 수정의 3자 고리. 코멘트 행 `c`를 지우는 두 쓰기가 `c`와 멤버 행을 **반대 순서로**
   * 잡는다 — 코멘트 삭제는 «재확인 → `c`», 페이지 삭제는 «`c` → 끝의 재확인». 코멘트 수정이 둘 사이 어느 순서를 골라도 하나와
   * 엇갈리고, 다른 owner 의 역할 변경(`lockOwnerIds` — owner 행을 힙 순서로 `FOR UPDATE`)이 셋째로 끼면 고리가 선다. 페이지 행을
   * 먼저 잡으면(`repos/pages.ts`의 `lockPageShared`) 두 삭제 뒤에 줄을 서 고리가 안 선다.
   *
   * 판을 세우는 법: K 가 한 owner 의 멤버 행을 `FOR SHARE`로 쥔다(«그 사람의 다른 쓰기가 재확인을 지난
   * 채») → 앨리스의 역할 변경이 K 앞에 선다 → 나머지 둘을 차례로 세운다 → K 를 푼다. 셋 다 선 것을 센 뒤에 푼다.
   *
   * | 코멘트 수정의 순서 | F3 | F3′ |
   * |---|---|---|
   * | 프로젝트 행 → `UPDATE c` → 재확인 | 교착 · 수정 500 | 0 |
   * | 프로젝트 행 → 재확인 → `UPDATE c` | 0 | 교착 · 페이지 삭제 500 |
   * | 프로젝트 행 → 페이지 행 → 재확인 → `UPDATE c`(이 순서를 쓴다) | 0 | 0 |
   */
  async function threeOwners(ctx: RealApiContext, heapOrder: 'bob-carol' | 'carol-bob') {
    const alice = await signup(ctx)
    const bob = await signup(ctx)
    const carol = await signup(ctx)
    const project = await createProject(ctx, alice.cookie)
    // 멤버 행을 넣는 순서가 힙 순서 — `lockOwnerIds`(정렬 없음)가 잡는 순서다.
    for (const member of heapOrder === 'bob-carol' ? [bob, carol] : [carol, bob]) {
      await addMember(ctx, project.id, member.user.id, 'owner')
    }
    const menu = await createMenuNode(ctx, alice.cookie, project.id, { title: '메뉴' })
    const page = await createPage(ctx, alice.cookie, project.id, menu.id, { title: '페이지' })
    const nodeId = (page.schema as { root: { id: string } }).root.id
    const posted = await ctx.app.inject({
      method: 'POST',
      url: `/api/projects/${project.id}/pages/${page.id}/comments`,
      cookies: bob.cookie,
      payload: { nodeId, body: '밥의 말' },
    })
    if (posted.statusCode !== 201) throw new Error(`코멘트 픽스처 실패: ${posted.body}`)
    const commentId = (posted.json() as { comment: { id: string } }).comment.id
    const base = `/api/projects/${project.id}`
    return { alice, bob, carol, projectId: project.id, pageUrl: `${base}/pages/${page.id}`, commentUrl: `${base}/pages/${page.id}/comments/${commentId}` }
  }

  for (const scenario of [
    {
      label: 'F3 — 코멘트 수정 ∥ 같은 코멘트의 삭제 ∥ 수정자를 내리는 역할 변경(owner 행: 밥 → 캐럴)',
      heapOrder: 'bob-carol' as const,
      // 캐럴의 다른 쓰기가 재확인을 지난 채 — 역할 변경은 밥 행을 쥔 채 캐럴 행에 선다.
      heldShare: 'carol' as const,
      demote: 'bob' as const,
      // 수정이 먼저 서고 삭제가 뒤에 선다.
      order: ['edit', 'delete-comment'] as const,
      // 수정은 삭제보다 먼저 서므로 보통 200 이지만, 순서가 이 판의 축은 아니다 — 축은 교착 · 5xx 다.
      expected: { demote: [200], edit: [200, 404], other: [200] },
    },
    {
      label: 'F3′ — 코멘트 수정 ∥ 그 페이지의 삭제 ∥ 삭제자를 내리는 역할 변경(owner 행: 캐럴 → 밥)',
      heapOrder: 'carol-bob' as const,
      // 밥의 다른 쓰기가 재확인을 지난 채 — 역할 변경은 캐럴 행을 쥔 채 밥 행에 선다.
      heldShare: 'bob' as const,
      demote: 'carol' as const,
      // 페이지 삭제가 코멘트를 지운 채 끝의 재확인에 서고, 수정이 뒤에 선다.
      order: ['delete-page', 'edit'] as const,
      expected: { demote: [200], edit: [200, 404], other: [204] },
    },
  ]) {
    it(`${scenario.label} — 교착 0`, async () => {
      await withRealApi(async (ctx) => {
        const fx = await threeOwners(ctx, scenario.heapOrder)
        const deadlocksBefore = await deadlockCount()
        const held = queueLock(async (trx) => {
          await findMembership(trx, fx.projectId, fx[scenario.heldShare].user.id, 'share')
        })
        await held.acquired
        const fired: Record<string, Fired> = {}
        try {
          fired.demote = track(
            ctx.app.inject({
              method: 'PATCH',
              url: `/api/projects/${fx.projectId}/members/${fx[scenario.demote].user.id}`,
              cookies: fx.alice.cookie,
              payload: { role: 'editor' },
            }),
          )
          await waitForLockWaiter(1)
          for (const [index, step] of scenario.order.entries()) {
            fired[step === 'edit' ? 'edit' : 'other'] =
              step === 'edit'
                ? track(ctx.app.inject({ method: 'PATCH', url: fx.commentUrl, cookies: fx.bob.cookie, payload: { body: '밥이 고친 말' } }))
                : track(ctx.app.inject({ method: 'DELETE', url: step === 'delete-page' ? fx.pageUrl : fx.commentUrl, cookies: fx.carol.cookie }))
            await waitForLockWaiter(index + 2)
          }
        } finally {
          await held.release()
        }
        const [demoted, edited, other] = await Promise.all([fired.demote!.promise, fired.edit!.promise, fired.other!.promise])

        expect(await deadlockCount()).toBe(deadlocksBefore)
        expect(scenario.expected.demote, demoted.body).toContain(demoted.status)
        expect(scenario.expected.edit, edited.body).toContain(edited.status)
        expect(scenario.expected.other, other.body).toContain(other.status)
      })
    }, 60_000)
  }
})

/**
 * 토큰 절의 판 — 앨리스(owner)의 프로젝트에 밥을 `bobRole`로, 캐럴을 editor 로 넣고 밥의 이 프로젝트 토큰 둘을 발급한다(여러 행을
 * 잡는 순서까지 잰다).
 */
async function tokenFixture(ctx: RealApiContext, bobRole: 'editor' | 'owner') {
  const alice = await signup(ctx)
  const bob = await signup(ctx)
  const carol = await signup(ctx)
  const project = await createProject(ctx, alice.cookie)
  await addMember(ctx, project.id, bob.user.id, bobRole)
  await addMember(ctx, project.id, carol.user.id, 'editor')
  const menu = await createMenuNode(ctx, alice.cookie, project.id, { title: '메뉴' })
  const page = await createPage(ctx, alice.cookie, project.id, menu.id, { title: '페이지' })
  const tokens: string[] = []
  for (const name of ['첫 토큰', '둘째 토큰']) {
    const issued = await ctx.app.inject({ method: 'POST', url: `/api/projects/${project.id}/tokens`, cookies: bob.cookie, payload: { name } })
    expect(issued.statusCode, issued.body).toBe(201)
    tokens.push((issued.json() as { value: string }).value)
  }
  return { alice, bob, carol, projectId: project.id, pageId: page.id, bobToken: `Bearer ${tokens[0]}` }
}

/** 토큰 행의 id 를 정한다 — 여러 행을 id 순으로 잡는 자리(`lockProjectTokens` · `lockMemberTokens`)의 순서를 세우려고. */
async function setTokenId(projectId: string, userId: string, name: string, id: string): Promise<void> {
  const result = await db
    .updateTable('api_tokens')
    .set({ id })
    .where('project_id', '=', projectId)
    .where('user_id', '=', userId)
    .where('name', '=', name)
    .executeTakeFirst()
  if (result.numUpdatedRows !== 1n) throw new Error(`토큰 ${name}의 id 를 못 바꿨습니다`)
}

async function roleOf(projectId: string, userId: string): Promise<string | null> {
  const row = await db.selectFrom('project_members').select('role').where('project_id', '=', projectId).where('user_id', '=', userId).executeTakeFirst()
  return row?.role ?? null
}

/** 요청이 끝나거나 · 누군가 잠금 줄에 설 때까지 기다린다(5s 안에 둘 다 없으면 던진다 — 판이 안 섰다). */
async function settledOrQueued(fired: Fired): Promise<void> {
  const deadline = Date.now() + 5_000
  while (Date.now() < deadline) {
    if (fired.done()) return
    const result = await sql<{ n: number }>`
      select count(*)::int as n from pg_locks l join pg_stat_activity a on a.pid = l.pid
       where not l.granted and a.datname = current_database()`.execute(db)
    if ((result.rows[0]?.n ?? 0) >= 1) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('요청이 끝나지도 줄에 서지도 않았습니다 — 시나리오가 성립하지 않았습니다')
}

/**
 * 요청을 세울 질의 글자(프록시의 `holdQuery`) — 세션 · 토큰의 재확인(`auth/roles.ts`의 `recheckAtCommit`), owner 행(`lockOwnerIds`),
 * 멤버 행 재확인, 멤버 제거의 첫 잠금(`lockMemberTokens`).
 */
const SESSION_RECHECK = 'statement_timestamp() for key share'
const TOKEN_RECHECK = '"api_tokens" where "id" = $1 for key share'
const OWNER_LOCK = '"role" = $2 for update'
const MEMBER_SHARE = '"user_id" = $2 for share'
const MEMBER_TOKENS_LOCK = 'order by "id" for update'

/**
 * **멤버 제거가 빠지는 사람의 그 프로젝트 토큰을 지운다**(`repos/members.ts`의 `removeMember` → `repos/api-tokens.ts`의
 * `lockMemberTokens` · `deleteMemberTokens`). 그 쓰기가 토큰 행을 잡으므로 토큰 행을 잡는 자리와 고리를 안 만드는지 잰다.
 * 멤버 쓰기의 잠금 순서는 «토큰 행 → owner 행 → 멤버 행»이다(`repos/members.ts`의 `OwnerRecheck` «잠금 순서»).
 *
 * - **토큰으로 쓰는 owner 를 뺀다.** 토큰 쓰기의 재확인은 «토큰 행(`KEY SHARE`) → 제 멤버 행(`SHARE`)»이다. 제거가 owner 행
 *   (`lockOwnerIds` — 빠지는 owner 의 행도 든다) 뒤에 토큰을 잡으면 고리가 선다. 판: 제거를 재확인 질의(앨리스 세션의
 *   `KEY SHARE`)에서 붙잡아(프록시의 `holdQuery` — 토큰 행은 쥔 채) 그 사이 밥의 토큰 쓰기를 세운다.
 * - **프로젝트 삭제와 겹친다.** 삭제가 토큰 행을 CASCADE 에서 처음 만나면 그때 owner 행을 쥐고 있다 — 토큰 행을 쥔 채 owner
 *   행에 선 제거와 고리다. 판: owner 행을 테스트가 쥐고 둘을 차례로 줄 세운 뒤 푼다. 두 방향을 다 세운다(어느 쪽이 먼저
 *   owner 행 줄에 서나).
 * - **제거가 도는 사이 발급된 토큰.** 지우는 것은 멤버 행을 지운 뒤라 그 사이 커밋된 발급까지 지운다. 발급하자마자 그 토큰으로
 *   쓰는 요청과 겹치면 그 행은 건너뛴다(`SKIP LOCKED` — 기다리면 고리다).
 *
 * | 변조 | 죽는 것(교착이면 +1 · 한쪽 500) |
 * |---|---|
 * | `lockMemberTokens`를 `lockOwnerIds` · 재확인 **뒤로** | «토큰으로 쓰는 owner» · «제거가 먼저» · «발급하자마자 쓰는 요청» · 아래 절의 «토큰으로 남을 빼는 중에 프로젝트를 지우면» — 삭제가 토큰 행을 owner 행 앞에서 잡아 순서가 엇갈린다 |
 * | 프로젝트 삭제가 `lockProjectTokens`를 안 부른다 | «삭제가 먼저» · 아래 절의 «토큰으로 남을 빼는 중에 …» |
 * | `deleteMemberTokens`를 멤버 행 삭제 **앞으로**(owner 행 앞) | «제거가 도는 사이 발급된 토큰» 혼자 — 발급 토큰이 남아 다시 멤버가 되면 200 |
 * | `deleteMemberTokens`의 `SKIP LOCKED`를 뗀다 | «발급하자마자 쓰는 요청» 혼자 — 교착 +1 |
 *
 * «제거가 먼저»는 혼자 죽는 변조가 없다 — 제거의 토큰 자리 축은 «토큰으로 쓰는 owner»가 소유하고, 이 판은 뒤집은 방향을 세우려고
 * 둔다. 토큰을 안 지우던 판에서는 앞의 셋이 교착 0 이다(제거가 토큰 행을 안 잡는다) — 고리는 토큰을 지우는 자리가 여는 것이다.
 */
describe('멤버 제거가 토큰을 지운다 — 토큰 행을 잡는 자리와 고리를 안 만든다', () => {
  async function bobTokenRows(projectId: string, bobId: string): Promise<number> {
    const rows = await db.selectFrom('api_tokens').select('id').where('project_id', '=', projectId).where('user_id', '=', bobId).execute()
    return rows.length
  }

  it('토큰으로 쓰는 owner 를 빼면: 제거 204 · 쓰기 404 · 토큰 0 · 교착 0', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await tokenFixture(ctx, 'owner')
      const deadlocksBefore = await deadlockCount()
      const recheck = ctx.proxy.holdQuery(SESSION_RECHECK)
      let removal: Fired | undefined
      let write: Fired | undefined
      try {
        removal = track(ctx.app.inject({ method: 'DELETE', url: `/api/projects/${fx.projectId}/members/${fx.bob.user.id}`, cookies: fx.alice.cookie }))
        await recheck.held
        write = track(
          ctx.app.inject({
            method: 'PATCH',
            url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/ops`,
            headers: { authorization: fx.bobToken },
            payload: { baseSeq: 0, ops: [{ op: 'add', path: '/root/children/-', value: { id: 'n_bob', type: 'Text', props: {} } }] },
          }),
        )
        await waitForLockWaiter(1)
      } finally {
        recheck.release()
      }
      const [removed, written] = await Promise.all([removal.promise, write.promise])

      expect(await deadlockCount()).toBe(deadlocksBefore)
      expect(removed.status, removed.body).toBe(204)
      expect(written.status, written.body).toBe(404)
      expect(await bobTokenRows(fx.projectId, fx.bob.user.id)).toBe(0)
      expect(await headSeqOf(fx.pageId)).toBe(0)
    })
  }, 60_000)

  for (const first of ['삭제', '제거'] as const) {
    it(`프로젝트 삭제와 겹치면 — ${first}가 먼저 owner 행 줄에: 교착 0`, async () => {
      await withRealApi(async (ctx) => {
        const fx = await tokenFixture(ctx, 'editor')
        const deadlocksBefore = await deadlockCount()
        const door = queueLock(async (trx) => {
          await lockOwnerIds(trx, fx.projectId)
        })
        await door.acquired
        const fireDeletion = () => track(ctx.app.inject({ method: 'DELETE', url: `/api/projects/${fx.projectId}`, cookies: fx.alice.cookie }))
        const fireRemoval = () =>
          track(ctx.app.inject({ method: 'DELETE', url: `/api/projects/${fx.projectId}/members/${fx.bob.user.id}`, cookies: fx.alice.cookie }))
        let deletion: Fired | undefined
        let removal: Fired | undefined
        try {
          if (first === '삭제') {
            deletion = fireDeletion()
            await waitForLockWaiter(1)
            removal = fireRemoval()
          } else {
            removal = fireRemoval()
            await waitForLockWaiter(1)
            deletion = fireDeletion()
          }
          await waitForLockWaiter(2)
        } finally {
          await door.release()
        }
        const [deleted, removed] = await Promise.all([deletion.promise, removal.promise])

        expect(await deadlockCount()).toBe(deadlocksBefore)
        expect(deleted.status, deleted.body).toBe(204)
        // 삭제가 먼저면 제거는 프로젝트가 사라진 뒤에 재확인한다 — 404. 제거가 먼저면 둘 다 선다.
        expect(removed.status, removed.body).toBe(first === '삭제' ? 404 : 204)
      })
    }, 60_000)
  }

  it('제거가 도는 사이 발급된 토큰도 지운다 — 다시 멤버가 돼도 401', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await tokenFixture(ctx, 'editor')
      // 제거를 owner 행 질의 앞에 세운다 — 토큰 행은 이미 쥐었다. 그 사이 밥이 세션으로 새 토큰을 발급한다.
      const ownerLock = ctx.proxy.holdQuery(OWNER_LOCK)
      let removal: Fired | undefined
      let issued: Awaited<ReturnType<typeof ctx.app.inject>> | undefined
      try {
        removal = track(ctx.app.inject({ method: 'DELETE', url: `/api/projects/${fx.projectId}/members/${fx.bob.user.id}`, cookies: fx.alice.cookie }))
        await ownerLock.held
        issued = await ctx.app.inject({ method: 'POST', url: `/api/projects/${fx.projectId}/tokens`, cookies: fx.bob.cookie, payload: { name: '늦은 토큰' } })
      } finally {
        ownerLock.release()
      }
      const removed = await removal.promise

      expect(issued.statusCode, issued.body).toBe(201)
      expect(removed.status, removed.body).toBe(204)
      expect(await bobTokenRows(fx.projectId, fx.bob.user.id)).toBe(0)
      await addMember(ctx, fx.projectId, fx.bob.user.id, 'editor')
      const reused = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}`,
        headers: { authorization: `Bearer ${(issued.json() as { value: string }).value}` },
      })
      expect(reused.statusCode, reused.body).toBe(401)
    })
  }, 60_000)

  it('발급하자마자 그 토큰으로 쓰는 요청과 겹쳐도 교착 0 — 그 토큰은 남는다(`deleteMemberTokens`의 «SKIP LOCKED»)', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await tokenFixture(ctx, 'editor')
      const deadlocksBefore = await deadlockCount()
      const ownerLock = ctx.proxy.holdQuery(OWNER_LOCK)
      const removal = track(ctx.app.inject({ method: 'DELETE', url: `/api/projects/${fx.projectId}/members/${fx.bob.user.id}`, cookies: fx.alice.cookie }))
      await ownerLock.held
      const issued = await ctx.app.inject({ method: 'POST', url: `/api/projects/${fx.projectId}/tokens`, cookies: fx.bob.cookie, payload: { name: '늦은 토큰' } })
      expect(issued.statusCode, issued.body).toBe(201)
      // 새 토큰의 쓰기를 재확인 한가운데 — 토큰 행 `KEY SHARE`를 쥐고 제 멤버 행 `SHARE` 앞 — 에 세운다.
      const memberShare = ctx.proxy.holdQuery(MEMBER_SHARE)
      const write = track(
        ctx.app.inject({
          method: 'PATCH',
          url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/ops`,
          headers: { authorization: `Bearer ${(issued.json() as { value: string }).value}` },
          payload: { baseSeq: 0, ops: [{ op: 'add', path: '/root/children/-', value: { id: 'n_late', type: 'Text', props: {} } }] },
        }),
      )
      await memberShare.held
      ownerLock.release()
      // 제거가 멤버 행을 지우고 토큰을 지우는 문장까지 가서 끝난다 — 그 토큰 행에 서지 않는다.
      const removed = await removal.promise
      memberShare.release()
      const written = await write.promise

      expect(await deadlockCount()).toBe(deadlocksBefore)
      expect(removed.status, removed.body).toBe(204)
      expect(written.status, written.body).toBe(404)
      expect(await headSeqOf(fx.pageId)).toBe(0)
      expect(await bobTokenRows(fx.projectId, fx.bob.user.id)).toBe(1)
    })
  }, 60_000)
})

/**
 * **토큰으로 낸 멤버 쓰기 — 자격 행이 owner 행보다 먼저다**(`repos/members.ts`의 `OwnerRecheck` «잠금 순서»).
 *
 * 멤버 쓰기(역할 변경 · 제거)는 owner 행을 쥔다. 토큰 요청의 자격 재확인(토큰 행 `KEY SHARE`)을 그 **뒤에** 하면, 토큰 행을 owner
 * 행 앞에서 잡는 두 쓰기와 반대 순서가 된다 — 그 토큰의 주인을 빼는 멤버 제거(`lockMemberTokens`)와 프로젝트 삭제
 * (`lockProjectTokens`). 대조는 같은 쓰기를 세션으로 낸 판이다(세션 행은 두 쓰기가 안 잡는다 — 교착 0).
 *
 * | 변조 | 죽는 것 |
 * |---|---|
 * | 역할 변경의 자격 확인을 `lockOwnerIds` 뒤로 | «토큰으로 역할을 바꾸는 owner 를 그때 빼면» · «토큰으로 역할을 바꾸는 중에 프로젝트를 지우면» — 둘 다 교착 +1 |
 * | 제거가 요청의 토큰을 `lockMemberTokens`에 안 싣는다(자격은 따로 `KEY SHARE`) — 거기에 제거의 자격 확인을 `lockOwnerIds` 뒤로 옮겨도 같다 | «토큰으로 남을 빼는 중에 …» · «owner 둘이 토큰으로 서로를 빼면» — 둘 다 교착 +1 |
 * | 제거가 토큰을 지운 **뒤에** 자격을 본다 | «토큰으로 자기를 빼면» 혼자 — 제 토큰이 지워져 401 |
 *
 * 역할 변경의 두 판은 늘 함께 죽는다 — 역할 변경의 자격 자리 축은 앞의 것이 소유하고, 뒤의 것은
 * 삭제의 토큰 선잠금과 엇갈리는 판을 세우려고 둔다.
 *
 * 요청의 토큰을 첫 잠금에 싣는 축은 «owner 둘이 토큰으로 서로를 빼면»이 소유한다 — 프로젝트 삭제 없이 서고, 두 토큰의 id 를
 * 바꿔 세워도 그 변조에 교착 +1 이다. «토큰으로 남을 빼는 중에 …»는 삭제의 토큰 선잠금과 엇갈리는 판을 세우려고 두고, 삭제가
 * `lockProjectTokens`를 안 부르는 변조에도 죽는다(위 절의 표). 두 판을 가르는 변조는 없다. 첫 잠금의 `ORDER BY`를 떼면 새
 * 케이스가 60 초 멈춰 죽는데 교착이 아니다 — 질의 글자가 `MEMBER_TOKENS_LOCK`과 안 맞아 밥을 못 세운다.
 */
describe('토큰으로 낸 멤버 쓰기 — 자격 행이 owner 행보다 먼저다', () => {
  /**
   * 역할 변경을 **자기 토큰의 재확인 질의 앞에** 세운다 — 인증은 지났다(먼저 쏘면 인증의 `last_used_at` 갱신이 상대가 쥔 토큰
   * 행에 서서 재확인까지 못 간다 — 가드의 404 가 난다). 그 사이 상대(`rival`)를 쏘고, 상대가 끝나거나 줄에 서면 푼다. 자격이
   * 첫 잠금이면 역할 변경은 아무것도 안 쥔 채 서 있으므로 상대가 먼저 끝난다. owner 행 뒤라면 상대가 그 owner 행에 서고, 풀린
   * 역할 변경이 상대가 쥔 토큰 행에 서서 고리다.
   */
  async function roleChangeAgainst(ctx: ProxiedRealApi, fx: Awaited<ReturnType<typeof tokenFixture>>, rival: () => Fired) {
    const recheck = ctx.proxy.holdQuery(TOKEN_RECHECK)
    let change: Fired | undefined
    let other: Fired | undefined
    try {
      change = track(
        ctx.app.inject({
          method: 'PATCH',
          url: `/api/projects/${fx.projectId}/members/${fx.carol.user.id}`,
          headers: { authorization: fx.bobToken },
          payload: { role: 'viewer' },
        }),
      )
      await recheck.held
      other = rival()
      await settledOrQueued(other)
    } finally {
      recheck.release()
    }
    const [changed, rivalled] = await Promise.all([change.promise, other.promise])
    return { changed, rivalled }
  }

  it('토큰으로 역할을 바꾸는 owner 를 그때 빼면: 교착 0 · 제거 204 · 역할 변경 401', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await tokenFixture(ctx, 'owner')
      const deadlocksBefore = await deadlockCount()
      const { changed, rivalled: removed } = await roleChangeAgainst(ctx, fx, () =>
        track(ctx.app.inject({ method: 'DELETE', url: `/api/projects/${fx.projectId}/members/${fx.bob.user.id}`, cookies: fx.alice.cookie })),
      )

      expect(await deadlockCount()).toBe(deadlocksBefore)
      expect(removed.status, removed.body).toBe(204)
      // 밥의 토큰은 제거와 함께 지워졌다 — 자격이 죽었다.
      expect(changed.status, changed.body).toBe(401)
      expect(await roleOf(fx.projectId, fx.carol.user.id)).toBe('editor')
    })
  }, 60_000)

  it('토큰으로 역할을 바꾸는 중에 프로젝트를 지우면: 교착 0 · 삭제 204 · 역할 변경 401', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await tokenFixture(ctx, 'owner')
      const deadlocksBefore = await deadlockCount()
      const { changed, rivalled: deleted } = await roleChangeAgainst(ctx, fx, () =>
        track(ctx.app.inject({ method: 'DELETE', url: `/api/projects/${fx.projectId}`, cookies: fx.alice.cookie })),
      )

      expect(await deadlockCount()).toBe(deadlocksBefore)
      expect(deleted.status, deleted.body).toBe(204)
      // 토큰은 삭제의 CASCADE 로 사라졌다 — 자격이 죽었다.
      expect(changed.status, changed.body).toBe(401)
    })
  }, 60_000)

  it('토큰으로 남을 빼는 중에 프로젝트를 지우면(요청의 토큰 id 가 더 작은 판): 교착 0', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await tokenFixture(ctx, 'owner')
      const carolToken = await ctx.app.inject({ method: 'POST', url: `/api/projects/${fx.projectId}/tokens`, cookies: fx.carol.cookie, payload: { name: '캐럴 토큰' } })
      expect(carolToken.statusCode, carolToken.body).toBe(201)
      // 삭제는 토큰 행을 id 순으로 잡는다. 밥(요청)의 토큰이 캐럴(빠지는 사람)의 것보다 앞이어야 삭제가 밥의 것을 쥔 채 캐럴의
      // 것에 선다 — 반대 순서면 삭제가 첫 행에서 아무것도 안 쥐고 서서 어느 판이든 고리가 없다.
      await setTokenId(fx.projectId, fx.bob.user.id, '첫 토큰', '00000000-0000-4000-8000-000000000001')
      await setTokenId(fx.projectId, fx.carol.user.id, '캐럴 토큰', 'ffffffff-ffff-4fff-bfff-fffffffffff1')
      const deadlocksBefore = await deadlockCount()
      // 제거를 자기 토큰의 재확인 앞에 세운다.
      const recheck = ctx.proxy.holdQuery(TOKEN_RECHECK)
      let removal: Fired | undefined
      let deletion: Fired | undefined
      try {
        removal = track(
          ctx.app.inject({ method: 'DELETE', url: `/api/projects/${fx.projectId}/members/${fx.carol.user.id}`, headers: { authorization: fx.bobToken } }),
        )
        await recheck.held
        deletion = track(ctx.app.inject({ method: 'DELETE', url: `/api/projects/${fx.projectId}`, cookies: fx.alice.cookie }))
        await waitForLockWaiter(1)
      } finally {
        recheck.release()
      }
      const [removed, deleted] = await Promise.all([removal.promise, deletion.promise])

      expect(await deadlockCount()).toBe(deadlocksBefore)
      expect(removed.status, removed.body).toBe(204)
      expect(deleted.status, deleted.body).toBe(204)
    })
  }, 60_000)

  it('owner 둘이 토큰으로 서로를 빼면: 교착 0 · 먼저 잡은 쪽 204 · 다른 쪽 401', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await tokenFixture(ctx, 'owner')
      const issued = await ctx.app.inject({ method: 'POST', url: `/api/projects/${fx.projectId}/tokens`, cookies: fx.alice.cookie, payload: { name: '앨리스 토큰' } })
      expect(issued.statusCode, issued.body).toBe(201)
      const aliceToken = `Bearer ${(issued.json() as { value: string }).value}`
      await setTokenId(fx.projectId, fx.alice.user.id, '앨리스 토큰', '00000000-0000-4000-8000-000000000001')
      await setTokenId(fx.projectId, fx.bob.user.id, '첫 토큰', 'ffffffff-ffff-4fff-bfff-fffffffffff1')
      const deadlocksBefore = await deadlockCount()
      // 밥의 제거를 첫 잠금(`lockMemberTokens`) 앞에 세운다 — 인증은 지났고 아무것도 안 쥐었다. 그 사이 앨리스의 제거가 첫 잠금을
      // 지나 자기 토큰의 재확인 앞에 선다. 밥을 풀면 밥은 앨리스가 쥔 토큰 행에 선다. 요청의 토큰이 첫 잠금에 없으면 밥은 앨리스
      // 토큰을 먼저 쥐고 제 토큰의 `KEY SHARE`에서 서고, 풀린 앨리스는 제 토큰의 `KEY SHARE`에서 밥에게 서서 고리다.
      const bobLock = ctx.proxy.holdQuery(MEMBER_TOKENS_LOCK)
      let bobRemoval: Fired | undefined
      let aliceRemoval: Fired | undefined
      let aliceRecheck: { held: Promise<void>; release: () => void } | undefined
      try {
        bobRemoval = track(
          ctx.app.inject({ method: 'DELETE', url: `/api/projects/${fx.projectId}/members/${fx.alice.user.id}`, headers: { authorization: fx.bobToken } }),
        )
        await bobLock.held
        aliceRecheck = ctx.proxy.holdQuery(TOKEN_RECHECK)
        aliceRemoval = track(
          ctx.app.inject({ method: 'DELETE', url: `/api/projects/${fx.projectId}/members/${fx.bob.user.id}`, headers: { authorization: aliceToken } }),
        )
        await aliceRecheck.held
        bobLock.release()
        await waitForLockWaiter(1)
      } finally {
        bobLock.release()
        aliceRecheck?.release()
      }
      const [aliceRemoved, bobRemoved] = await Promise.all([aliceRemoval.promise, bobRemoval.promise])

      expect(await deadlockCount()).toBe(deadlocksBefore)
      expect(aliceRemoved.status, aliceRemoved.body).toBe(204)
      // 밥의 토큰은 앨리스의 제거와 함께 지워졌다 — 자격이 죽었다.
      expect(bobRemoved.status, bobRemoved.body).toBe(401)
      expect(await roleOf(fx.projectId, fx.alice.user.id)).toBe('owner')
      expect(await roleOf(fx.projectId, fx.bob.user.id)).toBeNull()
    })
  }, 60_000)

  it('토큰으로 자기를 빼면 204 — 그 토큰까지 지워진다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await tokenFixture(ctx, 'owner')
      const left = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${fx.projectId}/members/${fx.bob.user.id}`,
        headers: { authorization: fx.bobToken },
      })

      expect(left.statusCode, left.body).toBe(204)
      expect(await roleOf(fx.projectId, fx.bob.user.id)).toBeNull()
      const rows = await db.selectFrom('api_tokens').select('id').where('project_id', '=', fx.projectId).where('user_id', '=', fx.bob.user.id).execute()
      expect(rows).toHaveLength(0)
    })
  }, 60_000)
})

/**
 * # 프로젝트 잠금 뒤에 서는 쓰기 — 커밋 순간의 권한
 *
 * 위 표는 **페이지 행**에 서는 쓰기다. 페이지 행을 안 잡는 쓰기도 프로젝트를 통째로 쥐는 트랜잭션 뒤에 선다 — 복원
 * (`lockProjectForRestore` — 프로젝트 행 `FOR UPDATE` + 메뉴 · 페이지 · 레이아웃 · 코멘트 행)과 트리 쓰기의 첫 잠금
 * (`lockProjectTree` — 프로젝트 행 `FOR NO KEY UPDATE`)이다. 이 절이 그 둘을 **진짜 잠금 함수로** 쥔 채 같은 판을 잰다.
 *
 * **어디에 서나 — 잰 값**(잠금을 쥔 채 쏘아 700ms 창 · 아래 `NOT_LOCKED`의 판정과 같은 판):
 *
 * | 쓰기 | 복원 잠금 뒤에 서는 자리 | 트리 잠금 뒤에 |
 * |---|---|---|
 * | 메뉴 생성 · 자리 옮기기 · 삭제 · 페이지 생성 · 자리 옮기기 · 삭제 · 가져오기 | 자기의 `lockProjectTree`(프로젝트 행) | 선다 |
 * | 프로젝트 수정 | `UPDATE projects`(프로젝트 행) | 선다 |
 * | 복원 · 프로젝트 삭제 | 자기의 `lockProjectRow`(프로젝트 행 `FOR UPDATE`) | 선다 |
 * | 스냅샷 · 초대 · 테마 · 프리셋 · 토큰 생성 | 자기의 `lockProjectShared`(`INSERT`의 FK 가 부모 행에 거는 `KEY SHARE`와 모드는 같다 — 먼저 잡아 두면 삭제 뒤에 깰 때 500 이 아니라 404 다) | 안 선다(`KEY SHARE`는 `NO KEY UPDATE`와 안 부딪힌다) |
 * | 테마 고르기 · 코멘트 수정 | 자기의 `lockProjectShared`(프로젝트 행 `KEY SHARE` — 자기 행(레이아웃 · 코멘트)보다 먼저) | 안 선다 |
 * | 테마 수정 · 삭제 | 자기의 `lockProjectShared`. **잠금 함수만 쥐고 재면 «안 선다»로 잘못 나온다** — 복원이 쓰는 판(`restore-write`)에서 삭제는 RI 검사가 레이아웃 행에, slug 를 바꾸는 수정은 테마 행 `KEY SHARE`에 선다 | 안 선다 |
 * | 코멘트 삭제 | 자기의 `lockProjectForBurial`(프로젝트 행 `KEY SHARE`) | 안 선다 |
 *
 * 프로젝트 삭제의 앞 잠금(`lockProjectRow` + `lockProjectPages`)은 복원 잠금의 부분이라 따로 세지 않는다 — 그 뒤에 서는
 * 쓰기는 전부 위 «복원» 열에 있다.
 *
 * **재확인이 없으면** 메뉴 생성 · 삭제 · 페이지 생성 · 가져오기 · 프로젝트 수정(두 잠금 모두) · 테마 고르기 · 스냅샷 · 초대 ·
 * 테마 · 프리셋 · 토큰 생성 · 코멘트 수정이 강등 **뒤에** 옛 권한으로 커밋한다(201 · 200 · 204 — 토큰은 멤버에서 빠진 뒤
 * 원문까지 내준다). 메뉴 · 페이지 자리 옮기기 · 페이지 · 코멘트 삭제 · 복원 · 프로젝트 삭제의 재확인 축은 위 `PROBES` 와
 * `menu-title-conflict.test.ts`가 소유하고, 이 표는 «프로젝트 잠금 뒤에서도 선다»를 센다.
 *
 * **재확인 자리는 쓰기 뒤 · 같은 트랜잭션 안이다** — 기다림은 쓰는 문장에서 난다(트리 첫 잠금 · `UPDATE projects`). 프로젝트
 * 행을 `KEY SHARE`로 먼저 잡는 자리(`repos/projects.ts`의 `lockProjectShared` — 테마 고르기 · 수정 · 삭제 · 코멘트 수정 · FK
 * 삽입 다섯)도 재확인이 쓰기 뒤다 — **테마 수정 · 삭제는 그 잠금 뒤에도 자기 행에서 기다릴 수 있으므로**(남의 쓰기가 건 잠금)
 * 권한은 그 뒤의 재확인이 잡는다(`lockProjectShared`를 떼도 아래 강등 판은 초록이다 — 그 줄은 «잠금 순서» 절의 E10 · E11 이
 * 소유한다). **코멘트 수정만은 재확인이 `UPDATE` 앞이다** — 프로젝트 행 → 페이지 행(`repos/pages.ts`의 `lockPageShared`) →
 * 재확인 → 코멘트 행. 그 까닭은 «잠금 순서» 절의 F3 · F3′.
 */
type ProjectHolder = 'restore' | 'tree' | 'restore-write'

/**
 * 쥐는 자 — 잠금 SQL 을 베끼지 않고 프로덕션 함수를 부른다.
 *
 * **`restore-write`는 잠금만이 아니라 복원의 쓰기까지 쥔다.** 잠금 함수만 쥐면 쥔 자의 **쓰기**가 거는
 * 잠금이 빠진다 — 복원의 마지막 단계 `set-layout-theme`(`services/restore-plan.ts`)는 레이아웃 행을 고치며 FK 로 새 테마
 * 행에 `KEY SHARE`를 걸고, 옛 테마는 그 커밋 뒤에야 «안 쓰인다». 잠금만 쥐고 · 쓰이지 않는 테마로 재면 «테마 수정 ·
 * 삭제는 안 선다»로 잘못 나온다: 쓰이는 테마의 삭제는 `ON DELETE RESTRICT` 검사(`layouts`를 `FOR KEY SHARE`로 훑는다)가
 * 복원이 쥔 레이아웃 행에 서고, slug 를 바꾸는 수정은 UNIQUE 키 갱신(`FOR UPDATE`)이라 그 `KEY SHARE`에 선다.
 */
type ProjectState = Awaited<ReturnType<typeof projectState>>

const PROJECT_HOLDERS: Record<
  ProjectHolder,
  {
    label: string
    take: (trx: DbHandle, fx: ProjectFx) => Promise<void>
    /** 쥔 자가 **스스로 커밋하는** 표 — 판의 «전 · 후»에서 뺀다(쓰기의 결과가 아니다). */
    writes?: readonly (keyof ProjectState)[]
  }
> = {
  restore: { label: '복원 잠금', take: (trx, fx) => lockProjectForRestore(trx, fx.projectId) },
  tree: { label: '트리 잠금', take: (trx, fx) => lockProjectTree(trx, fx.projectId) },
  'restore-write': {
    label: '복원(레이아웃 테마 쓰기까지) 잠금',
    take: async (trx, fx) => {
      await lockProjectForRestore(trx, fx.projectId)
      const layout = await findDefaultLayout(trx, fx.projectId)
      if (!layout) throw new Error('기본 레이아웃이 없습니다')
      // 복원의 `set-layout-theme`과 같은 함수 — 레이아웃을 (쓰이던 테마가 있으면 그것에서) `themeId`로 옮긴다.
      await updateLayoutTheme(trx, layout.id, fx.themeId)
    },
    writes: ['layouts'],
  },
}

interface ProjectFx extends Fx {
  /** 아무것도 안 매인 메뉴 — 지울 수 있다. 메뉴의 둘째 형제다. */
  spareMenuId: string
  /** 이 프로젝트의 테마 — 기본 레이아웃에 고를 수 있다. */
  themeId: string
  /** 계정은 있고 멤버는 아닌 사람 — 초대한다. */
  inviteeEmail: string
  /** 기본 레이아웃이 쓰고 있는 테마 — `prepare`가 세운 판에만 있다(쓰이는 테마의 삭제). */
  usedThemeId?: string
}

async function projectFixture(ctx: RealApiContext, bobRole: BobRole): Promise<ProjectFx> {
  const fx = await fixture(ctx, bobRole)
  const spareMenu = await createMenuNode(ctx, fx.alice.cookie, fx.projectId, { title: '지울 메뉴' })
  const theme = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${fx.projectId}/themes`,
    cookies: fx.alice.cookie,
    payload: { theme: { meta: { id: 'recheck-target', name: '고를 테마', version: '1.0.0' } } },
  })
  if (theme.statusCode !== 201) throw new Error(`테마 픽스처 실패: ${theme.body}`)
  const invitee = await signup(ctx)
  return {
    ...fx,
    spareMenuId: spareMenu.id,
    themeId: (theme.json() as { id: string }).id,
    inviteeEmail: invitee.user.email,
  }
}

interface ProjectProbe {
  /** 등록된 라우트의 키 — 아래 «분모» 절과 맞댄다. */
  route: string
  label: string
  bobRole: BobRole
  /** 강등의 모양. 가드가 `viewer`인 라우트(토큰 발급)는 한 단계 내릴 자리가 없어 멤버에서 뺀다 — 404 다. */
  demotion: Demotion
  /** 이 쓰기가 서는 잠금 — 재서 고른 것이다(위 표). 판마다 «잠금에 섰다»를 다시 단언한다. */
  holders: readonly ProjectHolder[]
  /** 픽스처 위에 더 세울 것이 있는 판만 — 잠금을 잡기 **전에**, 그리고 «전» 상태를 뜨기 전에 돈다. */
  prepare?: (ctx: RealApiContext, fx: ProjectFx) => Promise<Partial<ProjectFx>>
  fire: (ctx: RealApiContext, fx: ProjectFx) => Fired
  okStatus: number
}

const IMPORT_FILE = {
  wireboundVersion: '1',
  page: { title: '밥이 가져온 페이지' },
  schema: { version: 1, root: { id: 'n_root', type: 'Page', children: [] } },
  comments: [],
}

const PROJECT_PROBES: ProjectProbe[] = [
  {
    route: 'POST /api/projects/:projectId/menu',
    label: '메뉴 생성',
    bobRole: 'editor',
    demotion: 'role',
    holders: ['restore', 'tree'],
    fire: (ctx, fx) => fireRest(ctx, fx, 'POST', `/api/projects/${fx.projectId}/menu`, { title: '밥의 메뉴' }),
    okStatus: 201,
  },
  {
    route: 'PATCH /api/projects/:projectId/menu/:nodeId',
    label: '메뉴 자리 옮기기',
    bobRole: 'editor',
    demotion: 'role',
    holders: ['restore', 'tree'],
    fire: (ctx, fx) => fireRest(ctx, fx, 'PATCH', `/api/projects/${fx.projectId}/menu/${fx.spareMenuId}`, { sortOrder: 0 }),
    okStatus: 200,
  },
  {
    route: 'DELETE /api/projects/:projectId/menu/:nodeId',
    label: '메뉴 삭제',
    bobRole: 'editor',
    demotion: 'role',
    holders: ['restore', 'tree'],
    fire: (ctx, fx) => fireRest(ctx, fx, 'DELETE', `/api/projects/${fx.projectId}/menu/${fx.spareMenuId}`),
    okStatus: 204,
  },
  {
    route: 'POST /api/projects/:projectId/pages',
    label: '페이지 생성',
    bobRole: 'editor',
    demotion: 'role',
    holders: ['restore', 'tree'],
    fire: (ctx, fx) =>
      fireRest(ctx, fx, 'POST', `/api/projects/${fx.projectId}/pages`, { menuNodeId: fx.menuId, title: '밥의 페이지' }),
    okStatus: 201,
  },
  {
    route: 'PATCH /api/projects/:projectId/pages/:pageId',
    label: '페이지 자리 옮기기',
    bobRole: 'editor',
    demotion: 'role',
    holders: ['restore', 'tree'],
    fire: (ctx, fx) => fireRest(ctx, fx, 'PATCH', `/api/projects/${fx.projectId}/pages/${fx.sparePageId}`, { sortOrder: 0 }),
    okStatus: 200,
  },
  {
    route: 'DELETE /api/projects/:projectId/pages/:pageId',
    label: '페이지 삭제',
    bobRole: 'editor',
    demotion: 'role',
    holders: ['restore', 'tree'],
    fire: (ctx, fx) => fireRest(ctx, fx, 'DELETE', `/api/projects/${fx.projectId}/pages/${fx.sparePageId}`),
    okStatus: 204,
  },
  {
    route: 'POST /api/projects/:projectId/pages/import',
    label: '페이지 가져오기',
    bobRole: 'editor',
    demotion: 'role',
    holders: ['restore', 'tree'],
    fire: (ctx, fx) =>
      fireRest(ctx, fx, 'POST', `/api/projects/${fx.projectId}/pages/import`, { menuNodeId: fx.menuId, file: IMPORT_FILE }),
    okStatus: 201,
  },
  {
    route: 'PATCH /api/projects/:projectId',
    label: '프로젝트 수정',
    bobRole: 'owner',
    demotion: 'role',
    holders: ['restore', 'tree'],
    fire: (ctx, fx) => fireRest(ctx, fx, 'PATCH', `/api/projects/${fx.projectId}`, { name: '밥이 바꾼 이름' }),
    okStatus: 200,
  },
  {
    route: 'PUT /api/projects/:projectId/theme',
    label: '프로젝트 테마 고르기',
    bobRole: 'owner',
    demotion: 'role',
    holders: ['restore'],
    fire: (ctx, fx) => fireRest(ctx, fx, 'PUT', `/api/projects/${fx.projectId}/theme`, { themeId: fx.themeId }),
    okStatus: 200,
  },
  {
    // slug(`meta.id`)를 바꾸는 판이다 — 같은 slug 면 `NO KEY UPDATE`라 테마 행의 `KEY SHARE`와 안 부딪힌다.
    route: 'PUT /api/projects/:projectId/themes/:themeId',
    label: '테마 수정 (slug 를 바꾼다)',
    bobRole: 'owner',
    demotion: 'role',
    holders: ['restore-write'],
    fire: (ctx, fx) =>
      fireRest(ctx, fx, 'PUT', `/api/projects/${fx.projectId}/themes/${fx.themeId}`, {
        theme: { meta: { id: 'recheck-renamed', name: '밥이 고친 테마', version: '2.0.0' } },
      }),
    okStatus: 200,
  },
  {
    // 레이아웃이 쓰던 테마를 지운다 — 쥔 자(복원)가 레이아웃을 다른 테마로 옮기므로 풀린 뒤에는 지울 수 있다(대조 204).
    route: 'DELETE /api/projects/:projectId/themes/:themeId',
    label: '테마 삭제 (쓰이던 테마 — 복원이 레이아웃을 뗀다)',
    bobRole: 'owner',
    demotion: 'role',
    holders: ['restore-write'],
    prepare: async (ctx, fx) => {
      const created = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.projectId}/themes`,
        cookies: fx.alice.cookie,
        payload: { theme: { meta: { id: 'recheck-used', name: '쓰이던 테마', version: '1.0.0' } } },
      })
      if (created.statusCode !== 201) throw new Error(`테마 픽스처 실패: ${created.body}`)
      const usedThemeId = (created.json() as { id: string }).id
      const chosen = await ctx.app.inject({
        method: 'PUT',
        url: `/api/projects/${fx.projectId}/theme`,
        cookies: fx.alice.cookie,
        payload: { themeId: usedThemeId },
      })
      if (chosen.statusCode !== 200) throw new Error(`테마 고르기 픽스처 실패: ${chosen.body}`)
      return { usedThemeId }
    },
    fire: (ctx, fx) => fireRest(ctx, fx, 'DELETE', `/api/projects/${fx.projectId}/themes/${fx.usedThemeId}`),
    okStatus: 204,
  },
  {
    route: 'POST /api/projects/:projectId/snapshots',
    label: '스냅샷 생성',
    bobRole: 'editor',
    demotion: 'role',
    holders: ['restore'],
    fire: (ctx, fx) => fireRest(ctx, fx, 'POST', `/api/projects/${fx.projectId}/snapshots`, { tag: '밥의 스냅샷' }),
    okStatus: 201,
  },
  {
    route: 'POST /api/projects/:projectId/members',
    label: '멤버 초대',
    bobRole: 'owner',
    demotion: 'role',
    holders: ['restore'],
    fire: (ctx, fx) =>
      fireRest(ctx, fx, 'POST', `/api/projects/${fx.projectId}/members`, { email: fx.inviteeEmail, role: 'viewer' }),
    okStatus: 201,
  },
  {
    route: 'POST /api/projects/:projectId/themes',
    label: '테마 생성',
    bobRole: 'owner',
    demotion: 'role',
    holders: ['restore'],
    fire: (ctx, fx) =>
      fireRest(ctx, fx, 'POST', `/api/projects/${fx.projectId}/themes`, {
        theme: { meta: { id: 'recheck-new', name: '밥의 테마', version: '1.0.0' } },
      }),
    okStatus: 201,
  },
  {
    route: 'POST /api/projects/:projectId/presets',
    label: '프리셋 저장',
    bobRole: 'editor',
    demotion: 'role',
    holders: ['restore'],
    fire: (ctx, fx) => fireRest(ctx, fx, 'POST', `/api/projects/${fx.projectId}/presets`, { name: '밥의 프리셋', schema: [] }),
    okStatus: 201,
  },
  {
    route: 'POST /api/projects/:projectId/tokens',
    label: 'API 토큰 발급 (가드가 viewer — 멤버에서 뺀다)',
    bobRole: 'editor',
    demotion: 'member',
    holders: ['restore'],
    fire: (ctx, fx) => fireRest(ctx, fx, 'POST', `/api/projects/${fx.projectId}/tokens`, { name: '밥의 토큰' }),
    okStatus: 201,
  },
  {
    route: 'PATCH /api/projects/:projectId/pages/:pageId/comments/:commentId',
    label: '코멘트 수정',
    bobRole: 'editor',
    demotion: 'role',
    holders: ['restore'],
    fire: (ctx, fx) =>
      fireRest(ctx, fx, 'PATCH', `/api/projects/${fx.projectId}/pages/${fx.pageId}/comments/${fx.bobCommentId}`, {
        body: '밥이 고친 말',
      }),
    okStatus: 200,
  },
  {
    route: 'DELETE /api/projects/:projectId/pages/:pageId/comments/:commentId',
    label: '코멘트 삭제',
    bobRole: 'editor',
    demotion: 'role',
    holders: ['restore'],
    fire: (ctx, fx) =>
      fireRest(ctx, fx, 'DELETE', `/api/projects/${fx.projectId}/pages/${fx.pageId}/comments/${fx.bobCommentId}`),
    okStatus: 200,
  },
  {
    route: 'POST /api/projects/:projectId/snapshots/:snapshotId/restore',
    label: '스냅샷 복원',
    bobRole: 'owner',
    demotion: 'role',
    holders: ['restore', 'tree'],
    fire: (ctx, fx) => fireRest(ctx, fx, 'POST', `/api/projects/${fx.projectId}/snapshots/${fx.snapshotId}/restore`),
    okStatus: 200,
  },
  {
    route: 'DELETE /api/projects/:projectId',
    label: '프로젝트 삭제',
    bobRole: 'owner',
    demotion: 'role',
    holders: ['restore', 'tree'],
    fire: (ctx, fx) => fireRest(ctx, fx, 'DELETE', `/api/projects/${fx.projectId}`),
    okStatus: 204,
  },
]

/** 프로젝트 잠금을 쥔 채 `heldWrite` — 그 사이 교착이 났는지도 센다(`pg_stat_database.deadlocks`). */
async function runProjectHeld(ctx: RealApiContext, probe: ProjectProbe, holder: ProjectHolder, kind: Demotion | null) {
  const base = await projectFixture(ctx, probe.bobRole)
  const fx: ProjectFx = { ...base, ...(probe.prepare ? await probe.prepare(ctx, base) : {}) }
  const before = await projectState(fx)
  const deadlocksBefore = await deadlockCount()
  const lock = queueLock((trx) => PROJECT_HOLDERS[holder].take(trx, fx))
  const outcome = await heldWrite(ctx, fx, probe.label, probe.bobRole, lock, async () => probe.fire(ctx, fx), kind)
  const after = await projectState(fx)
  const own = (state: ProjectState) => {
    const rest: Partial<ProjectState> = { ...state }
    for (const key of PROJECT_HOLDERS[holder].writes ?? []) delete rest[key]
    return rest
  }
  return { ...outcome, before: own(before), after: own(after), deadlocks: (await deadlockCount()) - deadlocksBefore }
}

describe('프로젝트 잠금에 쥐인 쓰기 — 커밋 순간의 권한으로 판정한다', () => {
  for (const probe of PROJECT_PROBES) {
    for (const holder of probe.holders) {
      const held = PROJECT_HOLDERS[holder].label
      describe(`${probe.route} — ${probe.label} · ${held}`, () => {
        it(`대조 — 강등이 없으면 ${held}이 풀린 뒤 커밋되고 상태가 바뀐다`, async () => {
          await withRealApi(async (ctx) => {
            const outcome = await runProjectHeld(ctx, probe, holder, null)
            expect(outcome.status, outcome.body).toBe(probe.okStatus)
            expect(outcome.after).not.toEqual(outcome.before)
            expect(outcome.deadlocks).toBe(0)
          })
        }, 60_000)

        it(`${held}에 쥐인 채 강등되면 풀린 뒤 ${REFUSED[probe.demotion]} — 프로젝트의 행이 하나도 안 바뀐다 · 교착 0`, async () => {
          await withRealApi(async (ctx) => {
            const outcome = await runProjectHeld(ctx, probe, holder, probe.demotion)
            expect(outcome.demotedWhileHeld, '강등이 쓰기의 잠금 대기에 막혔다').toBe(true)
            expect(outcome.status, outcome.body).toBe(REFUSED[probe.demotion])
            expect(outcome.after).toEqual(outcome.before)
            expect(outcome.deadlocks).toBe(0)
          })
        }, 60_000)
      })
    }
  }
})

/**
 * # 분모 — 등록된 쓰기를 빠짐없이 가른다
 *
 * **세는 것은 Fastify 가 등록한 라우트의 값이다** — `buildApp`의 `onRoute` 이음매(`pre-guard-hook-census.test.ts`가
 * 쓰는 것과 같다). 소스 글자를 정규식(`app.post('…', { preHandler: projectGuard(`)으로 세면
 * `preHandler: [projectGuard('editor')]`(배열)로 적은 새 쓰기 라우트를 조용히 못 본다 — api 전량이 통과하는 채로 그
 * 라우트가 강등 뒤에 뷰어 이름으로 커밋한다. 값으로 세면 옵션을 어떤 글꼴로 적든(배열 · `app.route({…})` ·
 * 옵션 순서 · 하위 디렉터리) 등록되는 한 분모에 든다.
 *
 * **단위는 `GET`·`HEAD`가 아닌 라우트 전부다** — 가드가 걸렸는지로 거르지 않는다(`projectGuard(…)`는 부를 때마다
 * 새 클로저라 값으로 알아볼 수 없다 · 거르지 않으면 알아볼 필요도 없다). 그래서 프로젝트 밖의 쓰기(로그인 · 로그아웃 ·
 * 프로젝트 생성)도 아래 목록에 있다.
 *
 * **WS 는 프레임 종류다** — `ws/protocol.ts`의 `MIN_ROLE_FOR_FRAME`의 키. 그 표는 `Record<ClientFrame['type'], …>`라
 * 프레임을 하나 더하면 거기서 컴파일이 막히고, 표에 더하면 이 절이 죽는다.
 *
 * 그 전부가 위 두 표 — `PROBES`(페이지 잠금에 선다) · `PROJECT_PROBES`(프로젝트 잠금에 선다) — 중 하나 이상, 또는 아래 목록
 * (어느 잠금에도 안 선다) 중 **정확히 한쪽**에 있어야 한다. 새 쓰기는 이 절을 먼저 죽이고, 사람이 어느 쪽인지 판정한다.
 *
 * **아래 목록의 판정은 잰 값이다** — 쓰기 라우트 전부를 페이지 행(`lockPageForEdit`)과 복원 잠금
 * (`lockProjectForRestore`) · 트리 잠금(`lockProjectTree`) · 프로젝트 삭제의 앞 잠금(`lockProjectRow` + `lockProjectPages`)
 * 아래에서 쏘아 700ms 창. WS 셋은 코드로 판정한다 — 핸들러가 동기라 DB 잠금을 기다릴 자리가 없다. **이 파일은
 * 목록을 다시 재지 않는다** — 목록에 넣는 사람이 잰다.
 *
 * **잴 때는 쥔 자의 쓰기까지 쥔다 — 잠금 함수만으로는 모자란다**(테마 수정 · 삭제가 «안 선다»로 잘못 나온다 —
 * 「프로젝트 잠금 뒤에 서는 쓰기」 절의 표). 재는 판(700ms 창): 진짜 복원(`restoreSnapshot` — 메뉴 · 제목 · 코멘트 ·
 * 레이아웃 테마 T→S 를 실제로 쓴다) · 진짜 트리 쓰기(`deletePage` — 코멘트 달린 페이지 + `insertMenuNode`) · 진짜 프로젝트
 * 삭제(`deleteProject`까지 — CASCADE)를 커밋 전에 쥔다. 복원 · 트리 뒤에서 아래 목록은 **전부 안 선다.** 프로젝트 삭제
 * 뒤에서는 멤버 수정 · 삭제 · 프리셋 · 토큰 삭제가 **선다**(CASCADE 가 그 행을 쥔다) — 풀리면 행이 없어 **404 · 아무것도 커밋 안 됨**이라 권한 판정의 자리가 아니다(그
 * 사이의 강등도 같은 멤버 행에서 선다). «쓰이는 대상»의 판은 없다 — 멤버 · 프리셋 · 토큰 행은 어느 FK 도 가리키지 않는다.
 *
 * **못 재는 것**: 플러그인의 `addHook`으로 단 훅이 잠금에 서는 쓰기 — 라우트가 아니라 분모에 안 든다(지금은 없다 ·
 * `pre-guard-hook-census.test.ts`의 «못 재는 것»과 같은 부류). 라우트 **밖**의 쓰기 경로(예: 서버가 스스로 도는 작업)도
 * 같다. 그리고 **이 두 부류가 아닌 줄** — 아래 목록의 멤버 수정 · 삭제는 프로젝트 잠금에는 안 서지만 다른 owner 의 역할
 * 변경(`repos/members.ts`의 `lockOwnerIds` — owner 행 `FOR UPDATE`)에는 선다. 그 판은 이 파일이 안 잰다.
 */
const NOT_LOCKED: Record<string, string> = {
  'POST /api/auth/login': '프로젝트 밖 — 세션 행만 쓴다',
  'POST /api/auth/logout': '프로젝트 밖 — 세션 행만 지운다',
  'POST /api/projects': '새 프로젝트 — 남이 쥘 수 있는 행이 아직 없다',
  'PATCH /api/projects/:projectId/members/:userId':
    '멤버 행 — FK 열을 안 바꾸는 UPDATE 는 프로젝트 행을 안 잡고, 그 행을 가리키는 FK 가 없다(프로젝트 삭제 뒤에는 서지만 404)',
  'DELETE /api/projects/:projectId/members/:userId':
    '멤버 행 — 자식 행 삭제는 부모 행을 안 잡고, 그 행을 가리키는 FK 가 없다(프로젝트 삭제 뒤에는 서지만 404)',
  'DELETE /api/projects/:projectId/presets/:presetId':
    '프리셋 행 — 자식 행 삭제는 부모 행을 안 잡고, 그 행을 가리키는 FK 가 없다(프로젝트 삭제가 CASCADE 전에 쥔 프리셋 행에는 서지만 404 — «E15»). 가드와 커밋 사이는 재확인한다 — 위 «프리셋 삭제 — 가드와 커밋 사이»',
  'DELETE /api/projects/:projectId/tokens/:tokenId':
    '토큰 행 — 자식 행 삭제는 부모 행을 안 잡고, 그 행을 가리키는 FK 가 없다(프로젝트 삭제가 CASCADE 전에 쥔 토큰 행에는 서지만 404 — `lockProjectTokens`). 재확인하지 않는다 — 지우는 것은 자기 토큰뿐(`deleteApiToken`의 `user_id`)이고 권한을 줄이는 쓰기다. 걸면 강등 · 로그아웃 직후의 폐기가 롤백돼 거두려던 자격이 남는다',
  'DELETE /api/auth/tokens/:tokenId':
    '토큰 행 하나 — 위 줄과 같다(프로젝트를 안 보고 `user_id`로만 거른다 — `deleteUserToken`). 재확인하지 않는다(같은 까닭)',
  'DELETE /api/auth/tokens':
    '내 토큰 행 전부를 id 순으로 — 토큰 행 밖을 안 잡는다(`deleteAllUserTokens`). 프로젝트 삭제 · 멤버 제거가 쥔 토큰 행에는 서고(`my-tokens-lock.test.ts`), 재확인하지 않는다(같은 까닭)',
  'WS ping': '아무것도 안 쓴다',
  'WS lock': '메모리의 잠금 표만(`ws/lock.ts` — 동기 함수) — DB 를 안 쓴다',
  'WS unlock': '메모리의 잠금 표만(`ws/lock.ts` — 동기 함수) — DB 를 안 쓴다',
}

/** Fastify 가 등록한 쓰기 라우트 — `METHOD /api/…`. */
async function registeredWrites(): Promise<string[]> {
  const routes: RegisteredRoute[] = []
  await withApi(async () => {}, { onRoute: (route) => routes.push(route) })
  return routes.flatMap((route) =>
    route.method
      .split(',')
      .filter((method) => method !== 'GET' && method !== 'HEAD')
      .map((method) => `${method} ${route.url}`),
  )
}

/** WS 로 받는 프레임 종류 — `WS <type>`. */
function frameKinds(): string[] {
  return Object.keys(MIN_ROLE_FOR_FRAME).map((type) => `WS ${type}`)
}

describe('분모 — 등록된 쓰기가 «잠금에 선다»(두 표) · «안 선다»(목록) 중 정확히 한쪽에 있다', () => {
  const locked = new Set([...PROBES, ...PROJECT_PROBES].map((probe) => probe.route))
  const free = new Set(Object.keys(NOT_LOCKED))

  it('분모를 실제로 만든다 — 이음매가 라우트와 프레임을 준다', async () => {
    // 이음매가 어긋나면 빈 집합에서 아래가 조용히 통과한다.
    expect((await registeredWrites()).length).toBeGreaterThan(20)
    expect(frameKinds()).toContain('WS patch')
  })

  it('쓰기가 하나도 빠지지 않았다', async () => {
    const declared = [...new Set([...(await registeredWrites()), ...frameKinds()])]
    expect(declared.filter((write) => !locked.has(write) && !free.has(write))).toEqual([])
  })

  it('두 목록이 겹치지 않고, 등록되지 않은 쓰기를 적지 않았다', async () => {
    const declared = new Set([...(await registeredWrites()), ...frameKinds()])
    expect([...locked].filter((write) => free.has(write))).toEqual([])
    expect([...locked, ...free].filter((write) => !declared.has(write))).toEqual([])
  })
})
