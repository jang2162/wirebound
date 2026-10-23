/**
 * **가드를 지난 뒤 잠금을 기다리는 사이 빠지거나 내려간 사람은 «실패 갈래»에서도 가드와 같은 응답을 받는다**(N41 — N39-N1 의 같은 꼴).
 *
 * 쓰기가 실패하는 갈래(423 잠금 충돌 · 409 낡은 번호 · 422 검증 · 409 이미 있음 · 409 하위가 있음 …)가 재확인(`recheckProjectRole`)
 * 앞에서 나가면, 가드를 지난 뒤 멤버에서 빠진 사람이 **그 프로젝트 안의 사실**(잠금을 쥔 멤버의 이름 · 머리 번호 · 지금 테마 · 그 사람이
 * 이미 멤버라는 것 · 같은 태그 · 하위가 있다는 것)을 받는다. 견주는 것은 처음부터 그 자리였던 사람(비멤버 · 낮은 역할)의 가드 응답이다 —
 * 상태 · 본문 · 헤더(`date` 만 뺌).
 *
 * **N43 이 «대상이 사라졌다» 404 · 400 과 스냅샷 «뜨는 동안 바뀌었다» 409 를 같은 판으로 더했다**(`N43_SCENARIOS` — 판마다 앨리스가 대상을 지운다). 그 갈래도 재확인 앞에서
 * 나가면 «지워졌다 · 그 모양이다» 라는 프로젝트 안의 사실이 빠진 사람에게 간다.
 *
 * 판: 밥의 쓰기를 **가드 뒤 · 그 쓰기의 첫 기다림 앞**의 질의에서 붙잡고(`holdQuery`), 그 사이 앨리스가 밥을 빼거나 내린 뒤 놓는다. 인증이
 * 고치는 세션 · 토큰 행은 문으로 쓰지 않는다. 카나리아: 멤버가 그대로인 대조 판은 그 갈래의 응답(423 · 409 · 422)을 실제로 받는다 —
 * 재확인이 없는 판이면 그것이 새는 값이다.
 */
import { createHash } from 'node:crypto'
import type { PatchOp, PageDocument } from '@wirebound/schema'
import { readWbtheme, type ThemeManifest } from '@wirebound/themes'
import { sql } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { insertThemePackage } from '../src/repos/theme-packages'
import {
  addMember,
  createMenuNode,
  createPage,
  createProject,
  getTestDb,
  resetRealData,
  signup,
  withProxiedRealApi,
  type ProxiedRealApi,
  type SignedUpUser,
} from './helpers'
import { manifestOf, packed } from './theme-fixtures'
import { WsProbe, joinRoom } from './ws-client'

const VOLATILE_HEADERS = new Set(['date'])

interface Snap {
  status: number
  body: string
  headers: Record<string, unknown>
  volatile: string[]
}

function snap(res: { statusCode: number; body: string; headers: Record<string, unknown> }): Snap {
  return {
    status: res.statusCode,
    body: res.body,
    headers: Object.fromEntries(Object.entries(res.headers).filter(([name]) => !VOLATILE_HEADERS.has(name))),
    volatile: Object.keys(res.headers).filter((name) => VOLATILE_HEADERS.has(name)),
  }
}

type Change = 'remove' | 'demote' | 'none'
type BobRole = 'editor' | 'owner'

interface Board {
  alice: SignedUpUser
  bob: SignedUpUser
  /** 이미 멤버인 제3자 — «이미 멤버다» 409 의 대상. */
  carol: SignedUpUser
  projectId: string
  menuId: string
  pageId: string
  rootId: string
  bobRole: BobRole
  /** 시나리오의 `setup` 이 만든 것(곁 메뉴 · 코멘트 · 모듈 id 등) — `send` · `race` 가 읽는다. */
  ids: Record<string, string>
}

async function board(ctx: ProxiedRealApi, bobRole: BobRole): Promise<Board> {
  const alice = await signup(ctx)
  const bob = await signup(ctx)
  const carol = await signup(ctx)
  const project = await createProject(ctx, alice.cookie)
  await addMember(ctx, project.id, bob.user.id, bobRole)
  await addMember(ctx, project.id, carol.user.id, 'viewer')
  const menu = await createMenuNode(ctx, alice.cookie, project.id, { title: '설정' })
  const page = await createPage(ctx, alice.cookie, project.id, menu.id, { title: '사용자 목록' })
  const got = await ctx.app.inject({ method: 'GET', url: `/api/projects/${project.id}/pages/${page.id}`, cookies: alice.cookie })
  const rootId = (got.json().schema as PageDocument).root.id
  return { alice, bob, carol, projectId: project.id, menuId: menu.id, pageId: page.id, rootId, bobRole, ids: {} }
}

/** 밥을 내렸을 때의 역할 — 가드가 그 쓰기에 요구하는 최소 역할(editor · owner) 밑이다. */
function demotedRole(bobRole: BobRole): 'viewer' | 'editor' {
  return bobRole === 'owner' ? 'editor' : 'viewer'
}

async function change(ctx: ProxiedRealApi, b: Board, kind: Exclude<Change, 'none'>): Promise<void> {
  const url = `/api/projects/${b.projectId}/members/${b.bob.user.id}`
  const res =
    kind === 'remove'
      ? await ctx.app.inject({ method: 'DELETE', url, cookies: b.alice.cookie })
      : await ctx.app.inject({ method: 'PATCH', url, cookies: b.alice.cookie, payload: { role: demotedRole(b.bobRole) } })
  expect(res.statusCode, res.body).toBe(kind === 'remove' ? 204 : 200)
}

/** 처음부터 그 자리였던 사람 — 빠진 판은 비멤버, 내린 판은 그 역할의 멤버. */
async function bystander(ctx: ProxiedRealApi, b: Board, kind: Exclude<Change, 'none'>, nonMember = false): Promise<SignedUpUser> {
  const user = await signup(ctx)
  if (kind === 'demote' && !nonMember) await addMember(ctx, b.projectId, user.user.id, demotedRole(b.bobRole))
  return user
}

function addNode(id: string): PatchOp[] {
  return [{ op: 'add', path: '/root/children/-', value: { id, type: 'Text', props: {} } }]
}

/** 페이지 쓰기의 첫 잠금(`repos/pages.ts` 의 `lockPageRow`). 가드는 잠그지 않는다 — 이 글자는 가드 뒤에만 온다. */
const PAGE_ROW_LOCK = 'from "pages" where "id" = $1 and "project_id" = $2 for update'

interface Scenario {
  name: string
  bobRole: BobRole
  hold: string
  /** 멤버가 그대로인 대조 판이 받는 응답. */
  asMember: { status: number; code: string }
  /** 쓰기 앞에 판을 세운다(남의 잠금 등). */
  setup?: (ctx: ProxiedRealApi, b: Board) => Promise<void>
  /** 붙잡힌 사이 · 멤버십이 바뀌기 앞에 일어나는 일(남의 저장 등). */
  race?: (ctx: ProxiedRealApi, b: Board) => Promise<void>
  /** 멤버십이 바뀐 **뒤**에 일어나는 일(프로젝트 삭제 — 멤버 행이 사라지므로 `change` 앞에 못 둔다). */
  after?: (ctx: ProxiedRealApi, b: Board) => Promise<void>
  /** 그 자리가 지워진 판이라 «내려간 사람» 의 가드 응답이 따로 없다 — 비멤버의 가드 응답(404)으로 견준다. */
  guardAlwaysNotFound?: boolean
  send: (ctx: ProxiedRealApi, cookie: { wb_session: string }, b: Board) => Promise<Snap>
}

async function headSeqOf(pageId: string): Promise<number> {
  const row = await getTestDb().selectFrom('pages').select('head_seq').where('id', '=', pageId).executeTakeFirstOrThrow()
  return Number(row.head_seq)
}

/** 알리스가 페이지 루트를 쥔다 — 밥의 편집이 겹치면 423 이다. */
async function aliceHoldsRoot(ctx: ProxiedRealApi, b: Board): Promise<void> {
  ctx.app.realtime.locks.hold({
    projectId: b.projectId,
    pageId: b.pageId,
    nodeIds: [b.rootId],
    connectionId: 'conn-alice',
    userId: b.alice.user.id,
    userName: '앨리스',
  })
}

async function storeTheme(manifest: ThemeManifest): Promise<void> {
  const bytes = packed(manifest)
  const { files, issues } = readWbtheme(bytes)
  if (files === null) throw new Error(`픽스처가 검증을 못 지났다: ${JSON.stringify(issues)}`)
  await insertThemePackage(getTestDb(), {
    manifest: files.manifest,
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    uploadedBy: null,
  })
}

const N41_SCENARIOS: Scenario[] = [
  {
    name: 'PATCH …/ops · 423 (잠금을 쥔 멤버의 이름)',
    bobRole: 'editor',
    hold: PAGE_ROW_LOCK,
    asMember: { status: 423, code: 'locked' },
    setup: aliceHoldsRoot,
    send: async (ctx, cookie, b) =>
      snap(
        await ctx.app.inject({
          method: 'PATCH',
          url: `/api/projects/${b.projectId}/pages/${b.pageId}/ops`,
          cookies: cookie,
          payload: { baseSeq: await headSeqOf(b.pageId), ops: addNode('n_bob') },
        }),
      ),
  },
  {
    name: 'PATCH …/ops · 409 stale (머리 번호)',
    bobRole: 'editor',
    hold: PAGE_ROW_LOCK,
    asMember: { status: 409, code: 'conflict' },
    send: async (ctx, cookie, b) =>
      snap(
        await ctx.app.inject({
          method: 'PATCH',
          url: `/api/projects/${b.projectId}/pages/${b.pageId}/ops`,
          cookies: cookie,
          payload: { baseSeq: 99, ops: addNode('n_bob') },
        }),
      ),
  },
  {
    name: 'PATCH …/ops · 422 issues',
    bobRole: 'editor',
    hold: PAGE_ROW_LOCK,
    asMember: { status: 422, code: 'validation-failed' },
    send: async (ctx, cookie, b) =>
      snap(
        await ctx.app.inject({
          method: 'PATCH',
          url: `/api/projects/${b.projectId}/pages/${b.pageId}/ops`,
          cookies: cookie,
          payload: {
            baseSeq: await headSeqOf(b.pageId),
            ops: [{ op: 'add', path: '/root/children/-', value: { id: 'n_bad', type: '없는타입', props: {} } }],
          },
        }),
      ),
  },
  {
    name: 'PUT …/schema · 423 (잠금을 쥔 멤버의 이름)',
    bobRole: 'editor',
    hold: PAGE_ROW_LOCK,
    asMember: { status: 423, code: 'locked' },
    setup: aliceHoldsRoot,
    send: async (ctx, cookie, b) => {
      const got = await ctx.app.inject({ method: 'GET', url: `/api/projects/${b.projectId}/pages/${b.pageId}`, cookies: cookie })
      return snap(
        await ctx.app.inject({
          method: 'PUT',
          url: `/api/projects/${b.projectId}/pages/${b.pageId}/schema`,
          cookies: cookie,
          payload: { schema: got.json().schema },
        }),
      )
    },
  },
  {
    // PUT 은 머리 번호를 라우트가 읽어 넘기므로(`before.headSeq`) 낡음은 «읽은 뒤 · 잠금 앞»에 남이 커밋한 판에서만 난다 — 붙잡힌 사이 앨리스가 편집한다.
    name: 'PUT …/schema · 409 stale (읽은 뒤 남이 커밋)',
    bobRole: 'editor',
    hold: PAGE_ROW_LOCK,
    asMember: { status: 409, code: 'conflict' },
    race: async (ctx, b) => {
      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${b.projectId}/pages/${b.pageId}/ops`,
        cookies: b.alice.cookie,
        payload: { baseSeq: await headSeqOf(b.pageId), ops: addNode('n_alice') },
      })
      expect(res.statusCode, res.body).toBe(200)
    },
    send: async (ctx, cookie, b) => {
      const got = await ctx.app.inject({ method: 'GET', url: `/api/projects/${b.projectId}/pages/${b.pageId}`, cookies: cookie })
      return snap(
        await ctx.app.inject({
          method: 'PUT',
          url: `/api/projects/${b.projectId}/pages/${b.pageId}/schema`,
          cookies: cookie,
          payload: { schema: got.json().schema },
        }),
      )
    },
  },
  {
    name: 'PUT …/theme · 409 (지금 테마 · 판 · 토큰 · rev)',
    bobRole: 'owner',
    hold: 'update "projects"',
    asMember: { status: 409, code: 'conflict' },
    setup: async () => {
      await storeTheme(manifestOf('n41-a', '1.0.0'))
      await storeTheme(manifestOf('n41-b', '1.0.0'))
    },
    // 밥이 rev 0 으로 보낸 갱신이 붙잡힌 사이 앨리스가 먼저 저장한다 — 밥의 갱신은 0 행이다.
    race: async (ctx, b) => {
      const res = await ctx.app.inject({
        method: 'PUT',
        url: `/api/projects/${b.projectId}/theme`,
        cookies: b.alice.cookie,
        payload: { themeId: 'n41-b', version: '1.0.0', tokens: {}, rev: 0 },
      })
      expect(res.statusCode, res.body).toBe(200)
    },
    send: async (ctx, cookie, b) =>
      snap(
        await ctx.app.inject({
          method: 'PUT',
          url: `/api/projects/${b.projectId}/theme`,
          cookies: cookie,
          payload: { themeId: 'n41-a', version: '1.0.0', tokens: {}, rev: 0 },
        }),
      ),
  },
  {
    name: 'POST …/members · 409 (그 사람이 이미 멤버)',
    bobRole: 'owner',
    hold: 'from "projects" where "id" = $1 for key share',
    asMember: { status: 409, code: 'conflict' },
    send: async (ctx, cookie, b) =>
      snap(
        await ctx.app.inject({
          method: 'POST',
          url: `/api/projects/${b.projectId}/members`,
          cookies: cookie,
          payload: { email: b.carol.user.email, role: 'viewer' },
        }),
      ),
  },
  {
    name: 'POST …/snapshots · 409 (같은 태그)',
    bobRole: 'editor',
    hold: 'insert into "snapshots"',
    asMember: { status: 409, code: 'conflict' },
    setup: async (ctx, b) => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${b.projectId}/snapshots`,
        cookies: b.alice.cookie,
        payload: { tag: 'v1' },
      })
      expect(res.statusCode, res.body).toBe(201)
    },
    send: async (ctx, cookie, b) =>
      snap(
        await ctx.app.inject({ method: 'POST', url: `/api/projects/${b.projectId}/snapshots`, cookies: cookie, payload: { tag: 'v1' } }),
      ),
  },
  {
    name: 'DELETE …/menu/:id · 409 (하위가 있다)',
    bobRole: 'editor',
    hold: 'from "projects" where "id" = $1 for no key update',
    asMember: { status: 409, code: 'conflict' },
    send: async (ctx, cookie, b) =>
      snap(await ctx.app.inject({ method: 'DELETE', url: `/api/projects/${b.projectId}/menu/${b.menuId}`, cookies: cookie })),
  },
]

/** 트리 쓰기의 첫 잠금(`repos/projects.ts` 의 `lockProjectTree`) — 가드는 잠그지 않는다. */
const TREE_LOCK = 'from "projects" where "id" = $1 for no key update'
/** 프로젝트 행의 `KEY SHARE`(코멘트 수정 · 삭제의 첫 잠금). */
const PROJECT_KEY_SHARE = 'from "projects" where "id" = $1 for key share'

type Cookie = { wb_session: string }

async function ok(res: { statusCode: number; body: string }, status: number): Promise<void> {
  expect(res.statusCode, res.body).toBe(status)
}

/** 앨리스가 지운다 — 밥의 쓰기가 붙잡힌 사이 대상이 사라지는 판을 만든다. */
async function aliceDeletes(ctx: ProxiedRealApi, b: Board, path: string): Promise<void> {
  await ok(await ctx.app.inject({ method: 'DELETE', url: `/api/projects/${b.projectId}/${path}`, cookies: b.alice.cookie }), 204)
}

async function spareMenu(ctx: ProxiedRealApi, b: Board, key: string): Promise<void> {
  b.ids[key] = (await createMenuNode(ctx, b.alice.cookie, b.projectId, { title: `곁 메뉴 ${key}` })).id
}

async function bobComments(ctx: ProxiedRealApi, b: Board): Promise<void> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${b.projectId}/pages/${b.pageId}/comments`,
    cookies: b.bob.cookie,
    payload: { nodeId: b.rootId, body: '밥의 말' },
  })
  await ok(res, 201)
  b.ids.commentId = (res.json() as { comment: { id: string } }).comment.id
}

async function inject(ctx: ProxiedRealApi, b: Board, cookie: Cookie, method: 'POST' | 'PATCH' | 'DELETE', path: string, payload?: object) {
  return await ctx.app.inject({
    method,
    url: `/api/projects/${b.projectId}/${path}`,
    cookies: cookie,
    ...(payload === undefined ? {} : { payload }),
  })
}

/**
 * **N43(L-322) — 404 · 400 줄.** 대상이 «사라졌다 · 없다» 는 실패도 재확인 앞에서 나가면 가드를 지난 뒤 빠진 사람이 **그 프로젝트 안의 사실**(페이지 ·
 * 메뉴 · 코멘트 · 모듈이 지워졌다 · 하위 메뉴다)을 받는다. 판은 위와 같다 — 쓰기를 첫 잠금 질의에서 붙잡고, 그 사이 앨리스가 대상을 지우고 밥을
 * 빼거나 내린 뒤 놓는다. 대조(멤버 그대로)는 그 갈래의 응답을 실제로 받는다.
 */
const N43_SCENARIOS: Scenario[] = [
  {
    name: 'POST …/comments · 404 (페이지가 사라졌다)',
    bobRole: 'editor',
    hold: PAGE_ROW_LOCK,
    asMember: { status: 404, code: 'not-found' },
    race: (ctx, b) => aliceDeletes(ctx, b, `pages/${b.pageId}`),
    send: async (ctx, cookie, b) =>
      snap(
        await inject(ctx, b, cookie, 'POST', `pages/${b.pageId}/comments`, { nodeId: b.rootId, body: '밥의 말', idempotencyKey: 'k-n43' }),
      ),
  },
  {
    name: 'PATCH …/comments/:id · 404 (페이지가 사라졌다)',
    bobRole: 'editor',
    hold: PROJECT_KEY_SHARE,
    asMember: { status: 404, code: 'not-found' },
    setup: bobComments,
    race: (ctx, b) => aliceDeletes(ctx, b, `pages/${b.pageId}`),
    send: async (ctx, cookie, b) =>
      snap(await inject(ctx, b, cookie, 'PATCH', `pages/${b.pageId}/comments/${b.ids.commentId}`, { body: '고친 말' })),
  },
  {
    name: 'DELETE …/comments/:id · 404 (페이지가 사라졌다)',
    bobRole: 'editor',
    hold: PROJECT_KEY_SHARE,
    asMember: { status: 404, code: 'not-found' },
    setup: bobComments,
    race: (ctx, b) => aliceDeletes(ctx, b, `pages/${b.pageId}`),
    send: async (ctx, cookie, b) => snap(await inject(ctx, b, cookie, 'DELETE', `pages/${b.pageId}/comments/${b.ids.commentId}`)),
  },
  {
    // 재번호는 «바꿀 번호가 있을 때만» 잠금에 간다 — 문서 순서(n1 · n2)와 달리 n2 에 먼저 단 코멘트가 1 번이다.
    name: 'POST …/comments/renumber · 404 (페이지가 사라졌다)',
    bobRole: 'editor',
    hold: PAGE_ROW_LOCK,
    asMember: { status: 404, code: 'not-found' },
    setup: async (ctx, b) => {
      const added = await inject(ctx, b, b.alice.cookie, 'PATCH', `pages/${b.pageId}/ops`, {
        baseSeq: await headSeqOf(b.pageId),
        ops: [...addNode('n1'), ...addNode('n2')],
      })
      await ok(added, 200)
      for (const nodeId of ['n2', 'n1'])
        await ok(await inject(ctx, b, b.alice.cookie, 'POST', `pages/${b.pageId}/comments`, { nodeId, body: `${nodeId} 의 말` }), 201)
    },
    race: (ctx, b) => aliceDeletes(ctx, b, `pages/${b.pageId}`),
    send: async (ctx, cookie, b) => snap(await inject(ctx, b, cookie, 'POST', `pages/${b.pageId}/comments/renumber`)),
  },
  {
    name: 'POST …/pages · 404 (그 메뉴가 사라졌다)',
    bobRole: 'editor',
    hold: TREE_LOCK,
    asMember: { status: 404, code: 'not-found' },
    setup: (ctx, b) => spareMenu(ctx, b, 'spare'),
    race: (ctx, b) => aliceDeletes(ctx, b, `menu/${b.ids.spare}`),
    send: async (ctx, cookie, b) => snap(await inject(ctx, b, cookie, 'POST', 'pages', { menuNodeId: b.ids.spare, title: '밥의 페이지' })),
  },
  {
    name: 'PATCH …/pages/:id · 404 (바탕이 있는 판 — 페이지가 사라졌다)',
    bobRole: 'editor',
    hold: PAGE_ROW_LOCK,
    asMember: { status: 404, code: 'not-found' },
    race: (ctx, b) => aliceDeletes(ctx, b, `pages/${b.pageId}`),
    send: async (ctx, cookie, b) =>
      snap(await inject(ctx, b, cookie, 'PATCH', `pages/${b.pageId}`, { title: '밥의 제목', base: { title: '사용자 목록' } })),
  },
  {
    name: 'PATCH …/pages/:id · 404 (자리를 옮기는 판 — 페이지가 사라졌다)',
    bobRole: 'editor',
    hold: TREE_LOCK,
    asMember: { status: 404, code: 'not-found' },
    race: (ctx, b) => aliceDeletes(ctx, b, `pages/${b.pageId}`),
    send: async (ctx, cookie, b) => snap(await inject(ctx, b, cookie, 'PATCH', `pages/${b.pageId}`, { sortOrder: 0 })),
  },
  {
    name: 'PATCH …/pages/:id · 404 (옮길 메뉴가 사라졌다)',
    bobRole: 'editor',
    hold: TREE_LOCK,
    asMember: { status: 404, code: 'not-found' },
    setup: (ctx, b) => spareMenu(ctx, b, 'spare'),
    race: (ctx, b) => aliceDeletes(ctx, b, `menu/${b.ids.spare}`),
    send: async (ctx, cookie, b) => snap(await inject(ctx, b, cookie, 'PATCH', `pages/${b.pageId}`, { menuNodeId: b.ids.spare })),
  },
  {
    name: 'DELETE …/pages/:id · 404 (페이지가 이미 사라졌다)',
    bobRole: 'editor',
    hold: TREE_LOCK,
    asMember: { status: 404, code: 'not-found' },
    race: (ctx, b) => aliceDeletes(ctx, b, `pages/${b.pageId}`),
    send: async (ctx, cookie, b) => snap(await inject(ctx, b, cookie, 'DELETE', `pages/${b.pageId}`)),
  },
  {
    name: 'POST …/pages/import · 404 (그 메뉴가 사라졌다)',
    bobRole: 'editor',
    hold: TREE_LOCK,
    asMember: { status: 404, code: 'not-found' },
    setup: (ctx, b) => spareMenu(ctx, b, 'spare'),
    race: (ctx, b) => aliceDeletes(ctx, b, `menu/${b.ids.spare}`),
    send: async (ctx, cookie, b) =>
      snap(
        await inject(ctx, b, cookie, 'POST', 'pages/import', {
          menuNodeId: b.ids.spare,
          file: {
            wireboundVersion: '1',
            page: { title: '밥이 가져온 페이지' },
            schema: { version: 3, root: { id: 'n_root', type: 'Page', children: [] } },
            comments: [],
          },
        }),
      ),
  },
  {
    name: 'POST …/menu · 404 (부모 메뉴가 사라졌다)',
    bobRole: 'editor',
    hold: TREE_LOCK,
    asMember: { status: 404, code: 'not-found' },
    setup: (ctx, b) => spareMenu(ctx, b, 'spare'),
    race: (ctx, b) => aliceDeletes(ctx, b, `menu/${b.ids.spare}`),
    send: async (ctx, cookie, b) => snap(await inject(ctx, b, cookie, 'POST', 'menu', { parentId: b.ids.spare, title: '밥의 메뉴' })),
  },
  {
    name: 'PATCH …/menu/:id · 404 (바탕이 있는 판 — 메뉴가 사라졌다)',
    bobRole: 'editor',
    hold: 'from "menu_nodes" where "id" = $1 and "project_id" = $2 for no key update',
    asMember: { status: 404, code: 'not-found' },
    setup: (ctx, b) => spareMenu(ctx, b, 'spare'),
    race: (ctx, b) => aliceDeletes(ctx, b, `menu/${b.ids.spare}`),
    send: async (ctx, cookie, b) =>
      snap(await inject(ctx, b, cookie, 'PATCH', `menu/${b.ids.spare}`, { title: '밥의 제목', base: { title: `곁 메뉴 spare` } })),
  },
  {
    name: 'PATCH …/menu/:id · 404 (자리를 옮기는 판 — 메뉴가 사라졌다)',
    bobRole: 'editor',
    hold: TREE_LOCK,
    asMember: { status: 404, code: 'not-found' },
    setup: (ctx, b) => spareMenu(ctx, b, 'spare'),
    race: (ctx, b) => aliceDeletes(ctx, b, `menu/${b.ids.spare}`),
    send: async (ctx, cookie, b) => snap(await inject(ctx, b, cookie, 'PATCH', `menu/${b.ids.spare}`, { sortOrder: 0 })),
  },
  {
    name: 'PATCH …/menu/:id · 404 (새 부모가 사라졌다)',
    bobRole: 'editor',
    hold: TREE_LOCK,
    asMember: { status: 404, code: 'not-found' },
    setup: async (ctx, b) => {
      await spareMenu(ctx, b, 'spare')
      await spareMenu(ctx, b, 'parent')
    },
    race: (ctx, b) => aliceDeletes(ctx, b, `menu/${b.ids.parent}`),
    send: async (ctx, cookie, b) => snap(await inject(ctx, b, cookie, 'PATCH', `menu/${b.ids.spare}`, { parentId: b.ids.parent })),
  },
  {
    // 400 — 새 부모가 옮기는 메뉴의 자손이다(트리의 모양이라는 프로젝트 안의 사실). 판이 이미 그 모양이라 경주가 필요 없다.
    name: 'PATCH …/menu/:id · 400 (새 부모가 자기 자손이다)',
    bobRole: 'editor',
    hold: TREE_LOCK,
    asMember: { status: 400, code: 'bad-request' },
    setup: async (ctx, b) => {
      await spareMenu(ctx, b, 'spare')
      b.ids.kid = (await createMenuNode(ctx, b.alice.cookie, b.projectId, { parentId: b.ids.spare, title: '자손' })).id
    },
    send: async (ctx, cookie, b) => snap(await inject(ctx, b, cookie, 'PATCH', `menu/${b.ids.spare}`, { parentId: b.ids.kid })),
  },
  {
    name: 'DELETE …/menu/:id · 404 (메뉴가 이미 사라졌다)',
    bobRole: 'editor',
    hold: TREE_LOCK,
    asMember: { status: 404, code: 'not-found' },
    setup: (ctx, b) => spareMenu(ctx, b, 'spare'),
    race: (ctx, b) => aliceDeletes(ctx, b, `menu/${b.ids.spare}`),
    send: async (ctx, cookie, b) => snap(await inject(ctx, b, cookie, 'DELETE', `menu/${b.ids.spare}`)),
  },
  {
    name: 'DELETE …/menu/:id (연쇄) · 404 (메뉴가 이미 사라졌다)',
    bobRole: 'editor',
    hold: 'from "projects" where "id" = $1 for update',
    asMember: { status: 404, code: 'not-found' },
    setup: (ctx, b) => spareMenu(ctx, b, 'spare'),
    race: (ctx, b) => aliceDeletes(ctx, b, `menu/${b.ids.spare}`),
    send: async (ctx, cookie, b) =>
      snap(await inject(ctx, b, cookie, 'DELETE', `menu/${b.ids.spare}`, { cascade: true, expect: { menuIds: [], pageIds: [] } })),
  },
  {
    name: 'DELETE …/modules/:id · 404 (모듈이 이미 사라졌다)',
    bobRole: 'editor',
    hold: 'delete from "modules"',
    asMember: { status: 404, code: 'not-found' },
    setup: async (ctx, b) => {
      const made = await inject(ctx, b, b.alice.cookie, 'POST', 'modules', {
        name: '앨리스의 모듈',
        nodes: [{ id: 'm_a', type: 'Button', props: { label: '저장' } }],
      })
      await ok(made, 201)
      b.ids.moduleId = (made.json() as { module: { id: string } }).module.id
    },
    race: (ctx, b) => aliceDeletes(ctx, b, `modules/${b.ids.moduleId}`),
    send: async (ctx, cookie, b) => snap(await inject(ctx, b, cookie, 'DELETE', `modules/${b.ids.moduleId}`)),
  },
  {
    name: 'PATCH …/modules/:id · 404 (모듈이 이미 사라졌다)',
    bobRole: 'editor',
    hold: 'update "modules"',
    asMember: { status: 404, code: 'not-found' },
    setup: async (ctx, b) => {
      const made = await inject(ctx, b, b.alice.cookie, 'POST', 'modules', {
        name: '앨리스의 모듈',
        nodes: [{ id: 'm_a', type: 'Button', props: { label: '저장' } }],
      })
      await ok(made, 201)
      b.ids.moduleId = (made.json() as { module: { id: string } }).module.id
    },
    race: (ctx, b) => aliceDeletes(ctx, b, `modules/${b.ids.moduleId}`),
    send: async (ctx, cookie, b) => snap(await inject(ctx, b, cookie, 'PATCH', `modules/${b.ids.moduleId}`, { name: '밥이 바꾼 이름' })),
  },
  {
    // L-323 — 캡처(페이지 · 코멘트 전부를 읽는다)가 도는 사이 남이 커밋하면 «뜨는 동안 프로젝트가 바뀌었습니다» 409 다. 캡처는 트랜잭션 앞이고 길이는 프로젝트 크기에 비례한다.
    name: 'POST …/snapshots · 409 (뜨는 동안 프로젝트가 바뀌었다)',
    bobRole: 'editor',
    hold: 'from "comments"',
    asMember: { status: 409, code: 'conflict' },
    race: async (ctx, b) => {
      const res = await inject(ctx, b, b.alice.cookie, 'PATCH', `pages/${b.pageId}/ops`, {
        baseSeq: await headSeqOf(b.pageId),
        ops: addNode('n_alice'),
      })
      await ok(res, 200)
    },
    send: async (ctx, cookie, b) => snap(await inject(ctx, b, cookie, 'POST', 'snapshots', { tag: 'v-n43' })),
  },
  {
    // 프로젝트가 지워졌으면 가드는 누구에게든 404 다 — 견주는 것은 비멤버의 가드 응답이다(멤버 행이 CASCADE 로 사라져 «내려간 사람» 이 따로 없다).
    name: 'PATCH /api/projects/:id · 404 (프로젝트가 지워졌다)',
    bobRole: 'owner',
    hold: 'update "projects"',
    asMember: { status: 404, code: 'not-found' },
    guardAlwaysNotFound: true,
    after: async (ctx, b) => {
      await ok(await ctx.app.inject({ method: 'DELETE', url: `/api/projects/${b.projectId}`, cookies: b.alice.cookie }), 204)
    },
    send: async (ctx, cookie, b) =>
      snap(await ctx.app.inject({ method: 'PATCH', url: `/api/projects/${b.projectId}`, cookies: cookie, payload: { name: '밥의 이름' } })),
  },
]

const SCENARIOS: Scenario[] = [...N41_SCENARIOS, ...N43_SCENARIOS]

interface Ran {
  held: Snap
  b: Board
}

async function run(ctx: ProxiedRealApi, s: Scenario, kind: Change): Promise<Ran> {
  const b = await board(ctx, s.bobRole)
  await s.setup?.(ctx, b)
  const hold = ctx.proxy.holdQuery(s.hold)
  const pending = s.send(ctx, b.bob.cookie, b)
  await hold.held
  if (s.race) await s.race(ctx, b)
  if (kind !== 'none') await change(ctx, b, kind)
  if (s.after) await s.after(ctx, b)
  hold.release()
  return { held: await pending, b }
}

describe('가드 뒤에 빠진 사람 — 실패 갈래도 재확인한다 (N41)', () => {
  beforeEach(resetRealData)
  afterEach(resetRealData)

  describe.each(SCENARIOS)('$name', (s) => {
    it('대조 — 멤버가 그대로면 그 갈래의 응답이 실제로 나온다', async () => {
      await withProxiedRealApi(async (ctx) => {
        const { held } = await run(ctx, s, 'none')
        expect(held.status, held.body).toBe(s.asMember.status)
        expect(JSON.parse(held.body).error.code).toBe(s.asMember.code)
      })
    }, 30_000)

    it.each(['remove', 'demote'] as const)(
      '%s — 가드와 같은 응답이다(상태 · 본문 · 헤더)',
      async (kind) => {
        await withProxiedRealApi(async (ctx) => {
          const { held, b } = await run(ctx, s, kind)
          const other = await bystander(ctx, b, kind, s.guardAlwaysNotFound === true)
          const guard = await s.send(ctx, other.cookie, b)
          if (process.env.N41_PROBE)
            console.log(
              'N41',
              JSON.stringify({ name: s.name, kind, held: { ...held, headers: undefined }, guard: { ...guard, headers: undefined } }),
            )
          expect(guard.status).toBe(kind === 'remove' || s.guardAlwaysNotFound === true ? 404 : 403)
          expect(guard.volatile).toEqual(['date'])
          expect(held).toEqual(guard)
        })
      },
      30_000,
    )
  })
})

/** 재확인의 멤버 행(`auth/roles.ts` 의 `findMembership` 의 `share` 판) — 이 글자는 재확인에만 온다(가드의 조회는 잠그지 않는다). */
const MEMBER_SHARE = '"user_id" = $2 for share'

/** 다른 연결에서 그 행을 지금 잡을 수 있는가(`NOWAIT` — 쥔 사람이 있으면 `55P03`). 문장 하나라 끝나면 놓는다. */
async function lockableNow(query: ReturnType<typeof sql>): Promise<boolean> {
  try {
    await query.execute(getTestDb())
    return true
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === '55P03') return false
    throw error
  }
}

/**
 * **실패 갈래의 재확인이 «그때 쥔 것» — 성공 갈래와 같은 차례다.** 재확인의 멤버 행 질의에서 붙잡은 채 다른 연결로 프로젝트 행 · 페이지 행에
 * `FOR UPDATE NOWAIT`(쥔 것이 있으면 못 잡는다 — `false`). 실패 갈래가 새로 잡는 것은 «(그 쓰기가 이미 쥔 행) → 자격 행 → 멤버 행» 뿐이어야 하고,
 * 그 앞 부분은 성공 갈래가 이미 같은 차례로 쥐는 것이다 — 새 고리가 없다. 페이지 쓰기는 실패 갈래도 페이지 행을 쥔 채 재확인한다(성공 갈래와 같다).
 */
describe('실패 갈래의 재확인 자리 — 쥔 잠금이 성공 갈래와 같은 차례다 (N41)', () => {
  beforeEach(resetRealData)
  afterEach(resetRealData)

  const okOps = async (b: Board) => ({ baseSeq: await headSeqOf(b.pageId), ops: addNode('n_ok') })

  const CASES: {
    name: string
    scenario: Scenario
    hold?: string
    expected: { projectRowFree: boolean; pageRowFree: boolean }
    status: number
  }[] = [
    {
      name: 'PATCH …/ops · 423 (실패)',
      scenario: SCENARIOS[0]!,
      expected: { projectRowFree: true, pageRowFree: false },
      status: 423,
    },
    {
      name: 'PATCH …/ops · 409 stale (실패)',
      scenario: SCENARIOS[1]!,
      expected: { projectRowFree: true, pageRowFree: false },
      status: 409,
    },
    {
      name: 'PATCH …/ops · 성공(대조)',
      scenario: {
        ...SCENARIOS[1]!,
        asMember: { status: 200, code: '' },
        send: async (ctx, cookie, b) =>
          snap(
            await ctx.app.inject({
              method: 'PATCH',
              url: `/api/projects/${b.projectId}/pages/${b.pageId}/ops`,
              cookies: cookie,
              payload: await okOps(b),
            }),
          ),
      },
      expected: { projectRowFree: true, pageRowFree: false },
      status: 200,
    },
    { name: 'POST …/members · 409 (실패)', scenario: SCENARIOS[6]!, expected: { projectRowFree: false, pageRowFree: true }, status: 409 },
    { name: 'POST …/snapshots · 409 (실패)', scenario: SCENARIOS[7]!, expected: { projectRowFree: false, pageRowFree: true }, status: 409 },
    { name: 'DELETE …/menu/:id · 409 (실패)', scenario: SCENARIOS[8]!, expected: { projectRowFree: true, pageRowFree: true }, status: 409 },
  ]

  it.each(CASES)(
    '$name',
    async ({ scenario, expected, status }) => {
      await withProxiedRealApi(async (ctx) => {
        const b = await board(ctx, scenario.bobRole)
        await scenario.setup?.(ctx, b)
        const hold = ctx.proxy.holdQuery(MEMBER_SHARE)
        const pending = scenario.send(ctx, b.bob.cookie, b)
        await hold.held
        const projectRowFree = await lockableNow(sql`select id from projects where id = ${b.projectId} for update nowait`)
        const pageRowFree = await lockableNow(sql`select id from pages where project_id = ${b.projectId} for update nowait`)
        hold.release()
        const res = await pending
        if (process.env.N41_PROBE) console.log('N41LOCK', JSON.stringify({ projectRowFree, pageRowFree, status: res.status }))
        expect(res.status, res.body).toBe(status)
        expect({ projectRowFree, pageRowFree }).toEqual(expected)
      })
    },
    30_000,
  )
})

/**
 * **N43 — 실패 갈래(대상이 사라졌다)의 재확인이 «그때 쥔 것» — 성공 갈래와 같은 차례다.** 위 표와 같은 잣대(재확인의 멤버 행 질의에서 붙잡고 다른 연결로
 * `FOR UPDATE NOWAIT`)인데, 대상이 지워진 판이라 두 단계로 붙잡는다 — 그 쓰기의 첫 잠금 질의(`hold`)에서 붙잡고 앨리스가 대상을 지운 뒤, 재확인의 멤버 행
 * 질의를 붙잡아 놓고 처음 붙잡은 것을 푼다. 짝(대조)은 같은 쓰기가 **지우지 않은 대상**에 닿아 성공하는 판이다 — 실패 갈래가 쥔 것이 그 부분집합이어야 한다.
 */
describe('실패 갈래의 재확인 자리 — 대상이 사라진 판의 잠금 차례 (N43)', () => {
  beforeEach(resetRealData)
  afterEach(resetRealData)

  const named = (name: string): Scenario => {
    const found = N43_SCENARIOS.find((scenario) => scenario.name.startsWith(name))
    if (found === undefined) throw new Error(`시나리오가 없다: ${name}`)
    return found
  }

  interface Held {
    projectRowFree: boolean
    pageRowFree: boolean
    status: number
  }

  async function probe(ctx: ProxiedRealApi, scenario: Scenario, withRace: boolean): Promise<Held> {
    const b = await board(ctx, scenario.bobRole)
    await scenario.setup?.(ctx, b)
    const first = ctx.proxy.holdQuery(scenario.hold)
    const pending = scenario.send(ctx, b.bob.cookie, b)
    await first.held
    if (withRace) await scenario.race?.(ctx, b)
    // 처음 붙잡은 질의의 칸이 비었다 — 재확인의 멤버 행 질의를 붙잡아 놓고 처음 것을 푼다.
    const second = ctx.proxy.holdQuery(MEMBER_SHARE)
    first.release()
    await second.held
    const projectRowFree = await lockableNow(sql`select id from projects where id = ${b.projectId} for update nowait`)
    const pageRowFree = await lockableNow(sql`select id from pages where project_id = ${b.projectId} for update nowait`)
    second.release()
    const res = await pending
    return { projectRowFree, pageRowFree, status: res.status }
  }

  const CASES2: { name: string; scenario: string; failure: Held; success: Held }[] = [
    {
      name: 'POST …/comments · 404',
      scenario: 'POST …/comments · 404',
      failure: { projectRowFree: true, pageRowFree: true, status: 404 },
      success: { projectRowFree: true, pageRowFree: false, status: 201 },
    },
    {
      name: 'PATCH …/comments/:id · 404',
      scenario: 'PATCH …/comments/:id · 404',
      failure: { projectRowFree: false, pageRowFree: true, status: 404 },
      success: { projectRowFree: false, pageRowFree: false, status: 200 },
    },
    {
      name: 'DELETE …/comments/:id · 404',
      scenario: 'DELETE …/comments/:id · 404',
      failure: { projectRowFree: false, pageRowFree: true, status: 404 },
      success: { projectRowFree: false, pageRowFree: false, status: 200 },
    },
    {
      name: 'POST …/comments/renumber · 404',
      scenario: 'POST …/comments/renumber · 404',
      failure: { projectRowFree: true, pageRowFree: true, status: 404 },
      success: { projectRowFree: true, pageRowFree: false, status: 200 },
    },
    {
      name: 'POST …/pages · 404',
      scenario: 'POST …/pages · 404',
      failure: { projectRowFree: true, pageRowFree: true, status: 404 },
      success: { projectRowFree: false, pageRowFree: true, status: 201 },
    },
    {
      name: 'PATCH …/pages/:id · 404 (바탕',
      scenario: 'PATCH …/pages/:id · 404 (바탕',
      failure: { projectRowFree: true, pageRowFree: true, status: 404 },
      success: { projectRowFree: true, pageRowFree: false, status: 200 },
    },
    {
      name: 'PATCH …/pages/:id · 404 (자리를',
      scenario: 'PATCH …/pages/:id · 404 (자리를',
      failure: { projectRowFree: false, pageRowFree: true, status: 404 },
      success: { projectRowFree: false, pageRowFree: false, status: 200 },
    },
    {
      name: 'PATCH …/pages/:id · 404 (옮길',
      scenario: 'PATCH …/pages/:id · 404 (옮길',
      failure: { projectRowFree: true, pageRowFree: true, status: 404 },
      success: { projectRowFree: false, pageRowFree: false, status: 200 },
    },
    {
      name: 'DELETE …/pages/:id · 404',
      scenario: 'DELETE …/pages/:id · 404',
      failure: { projectRowFree: false, pageRowFree: true, status: 404 },
      success: { projectRowFree: false, pageRowFree: false, status: 204 },
    },
    {
      name: 'POST …/pages/import · 404',
      scenario: 'POST …/pages/import · 404',
      failure: { projectRowFree: true, pageRowFree: true, status: 404 },
      success: { projectRowFree: false, pageRowFree: true, status: 201 },
    },
    {
      name: 'POST …/menu · 404',
      scenario: 'POST …/menu · 404',
      failure: { projectRowFree: true, pageRowFree: true, status: 404 },
      success: { projectRowFree: false, pageRowFree: true, status: 201 },
    },
    {
      name: 'PATCH …/menu/:id · 404 (바탕',
      scenario: 'PATCH …/menu/:id · 404 (바탕',
      failure: { projectRowFree: true, pageRowFree: true, status: 404 },
      success: { projectRowFree: true, pageRowFree: true, status: 200 },
    },
    {
      name: 'PATCH …/menu/:id · 404 (자리를',
      scenario: 'PATCH …/menu/:id · 404 (자리를',
      failure: { projectRowFree: false, pageRowFree: true, status: 404 },
      success: { projectRowFree: false, pageRowFree: true, status: 200 },
    },
    {
      name: 'PATCH …/menu/:id · 404 (새 부모',
      scenario: 'PATCH …/menu/:id · 404 (새 부모',
      failure: { projectRowFree: true, pageRowFree: true, status: 404 },
      success: { projectRowFree: false, pageRowFree: true, status: 200 },
    },
    {
      name: 'DELETE …/menu/:id · 404',
      scenario: 'DELETE …/menu/:id · 404',
      failure: { projectRowFree: false, pageRowFree: true, status: 404 },
      success: { projectRowFree: false, pageRowFree: true, status: 204 },
    },
    {
      name: 'DELETE …/menu/:id (연쇄) · 404',
      scenario: 'DELETE …/menu/:id (연쇄) · 404',
      failure: { projectRowFree: false, pageRowFree: false, status: 404 },
      success: { projectRowFree: false, pageRowFree: false, status: 200 },
    },
    {
      name: 'DELETE …/modules/:id · 404',
      scenario: 'DELETE …/modules/:id · 404',
      failure: { projectRowFree: true, pageRowFree: true, status: 404 },
      success: { projectRowFree: true, pageRowFree: true, status: 204 },
    },
    {
      name: 'PATCH …/modules/:id · 404',
      scenario: 'PATCH …/modules/:id · 404',
      failure: { projectRowFree: true, pageRowFree: true, status: 404 },
      success: { projectRowFree: true, pageRowFree: true, status: 200 },
    },
    {
      name: 'POST …/snapshots · 409 (뜨는',
      scenario: 'POST …/snapshots · 409 (뜨는',
      failure: { projectRowFree: true, pageRowFree: true, status: 409 },
      success: { projectRowFree: false, pageRowFree: true, status: 201 },
    },
  ]

  it.each(CASES2)(
    '$name',
    async ({ scenario, failure, success }) => {
      await withProxiedRealApi(async (ctx) => {
        const s = named(scenario)
        const failed = await probe(ctx, s, true)
        const succeeded = await probe(ctx, s, false)
        if (process.env.N43_PROBE) console.log('N43LOCK', JSON.stringify({ scenario, failed, succeeded }))
        expect(failed).toEqual(failure)
        expect(succeeded).toEqual(success)
        // 실패 갈래가 쥔 것은 성공 갈래가 같은 때 쥐는 것의 부분집합이다 — 쥔 행(`Free` 가 거짓)이 성공 쪽에도 쥐여 있어야 한다.
        expect({ project: !failed.projectRowFree && succeeded.projectRowFree, page: !failed.pageRowFree && succeeded.pageRowFree }).toEqual(
          {
            project: false,
            page: false,
          },
        )
      })
    },
    60_000,
  )
})

/**
 * **WS `patch` 프레임도 같다**(`ws/patch.ts`). 프레임을 받을 때의 자격 확인(`stillAllowed`)은 잠금 밖이라, 프레임이 페이지 행에 줄 선 사이
 * 빠진 · 내려간 사람은 그 확인을 이미 지났다 — 빠진 사람의 연결은 `closeWhenIdle` 이 도는 프레임이 끝난 뒤에 닫으므로(`ws/routes.ts`)
 * 그 프레임의 답은 연결이 닫히기 전에 나간다. 견주는 것은 같은 프레임이 **잠금 없이** 성공 갈래에 닿았을 때의 답(재확인이 낸 `patch-error`)이다 —
 * WS 에는 «처음부터 비멤버» 의 프레임 응답이 없다(핸드셰이크가 거절한다).
 */
describe('WS patch — 가드 뒤에 빠진 사람의 프레임 (N41)', () => {
  beforeEach(resetRealData)
  afterEach(resetRealData)

  const opened: WsProbe[] = []
  afterEach(() => {
    for (const probe of opened) probe.close()
    opened.length = 0
  })

  type Fail = 'locked' | 'stale' | 'invalid' | 'none'

  /** 빠졌거나 내려간 밥의 프레임이 받은 `patch-*` 프레임과 연결의 끝. */
  async function wsRun(ctx: ProxiedRealApi, kind: Change, fail: Fail) {
    const b = await board(ctx, 'editor')
    const probe = await joinRoom(ctx.port, b.projectId, b.bob.cookie.wb_session)
    opened.push(probe)
    await probe.waitFor('presence')
    if (fail === 'locked') await aliceHoldsRoot(ctx, b)
    const ops: PatchOp[] =
      fail === 'invalid' ? [{ op: 'add', path: '/root/children/-', value: { id: 'n_bad', type: '없는타입', props: {} } }] : addNode('n_bob')
    const baseSeq = fail === 'stale' ? 99 : await headSeqOf(b.pageId)
    const hold = ctx.proxy.holdQuery(PAGE_ROW_LOCK)
    probe.send(JSON.stringify({ type: 'patch', pageId: b.pageId, baseSeq, ops, clientOpId: 'op_bob' }))
    await hold.held
    if (kind !== 'none') await change(ctx, b, kind)
    hold.release()
    await probe.waitFor('patch-error').catch(() => undefined)
    await probe.quiet(500)
    // 판마다 프로젝트 · 페이지 id 가 다르다 — 견주는 것은 그 밖의 칸(상태 · 코드 · 문장 · issues)이다.
    const frames = probe.received
      .filter((frame) => frame.type === 'patch-error' || frame.type === 'patch-ack')
      .map(({ projectId: _projectId, pageId: _pageId, ...rest }) => rest)
    return { frames, closeInfo: probe.closeInfo }
  }

  const FAILS: { fail: Exclude<Fail, 'none'>; status: number; code: string }[] = [
    { fail: 'locked', status: 423, code: 'locked' },
    { fail: 'stale', status: 409, code: 'conflict' },
    { fail: 'invalid', status: 422, code: 'validation-failed' },
  ]

  describe.each(FAILS)('$fail', ({ fail, status, code }) => {
    it('대조 — 멤버가 그대로면 그 실패 프레임이 실제로 나온다', async () => {
      await withProxiedRealApi(async (ctx) => {
        const control = await wsRun(ctx, 'none', fail)
        expect(control.frames).toHaveLength(1)
        expect(control.frames[0]).toMatchObject({ type: 'patch-error', status, code })
      })
    }, 60_000)

    it.each(['remove', 'demote'] as const)(
      '%s — 같은 프레임이 잠금 없이 성공 갈래에 닿았을 때 재확인이 낸 거절과 같다',
      async (kind) => {
        await withProxiedRealApi(async (ctx) => {
          const reference = await wsRun(ctx, kind, 'none')
          const held = await wsRun(ctx, kind, fail)
          if (process.env.N41_PROBE) console.log('N41WS', JSON.stringify({ fail, kind, reference, held }))
          expect(reference.frames).toHaveLength(1)
          expect(reference.frames[0]).toMatchObject({ type: 'patch-error', status: kind === 'remove' ? 404 : 403 })
          expect(held.frames).toEqual(reference.frames)
        })
      },
      60_000,
    )
  })
})
