/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다** — `helpers.ts`의 `withRealApi`를 쓴다.
 *
 * **설계서 「LLM 편집 경로」의 `actor_type='mcp'` · `actor_label='<토큰명>'`이 참인지 잰다**.
 *
 * ---
 *
 * # 왜 인구조사인가 — 손으로 고른 목록이면 새 라우트가 조용히 `user`로 남는다
 *
 * *"`routes/*`가 전부 `{ type: 'user', … }`를 리터럴로 적는다"*만 재면 **그 문장이
 * 좁다** — `ws/patch.ts`도 revision을 만든다. 그런 누락은 손으로 적은 목록에서 조용히
 * 되풀이되므로, `lock-census`·`broadcast-census`와 **같은 분모 만드는 법**을 쓴다:
 * `src/` 전체를 재귀로 훑어 `actor:`를 실은 자리를 세고, 표에 없는 자리가 있으면 죽는다.
 *
 * **`false`인 줄도 표에 있다.** *"여기는 요청을 안 본다"*는 판정이지 누락이 아니고, 판정이
 * 표에 없으면 다음 사람이 그것을 누락으로 읽고 고친다(`lock-census.test.ts`와 같은 자세).
 *
 * # 재는 것 넷
 *
 * 1. **분모** — `actor:`를 실은 자리 전부가 표에 있다.
 * 2. **값** — 진짜 Postgres에 무엇이 들어가는가. 세션·토큰·헤더 유무·모르는 값.
 * 3. **거울** — `packages/cli`가 싣는 헤더 이름과 이 서버가 읽는 이름이 같은 글자다.
 * 4. **언제** — 헤더 검사가 조작보다 **먼저** 서는가. **분모가 다르다** —
 *    「분모」 절의 표는 소스의 `actor:` 자리를 세고, 「언제」 절은 **Fastify가 아는 라우트 목록**을 센다.
 *    앞엣것은 *"그 자리를 지나는가"*를, 뒤엣것은 *"언제 지나는가"*를 본다.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PatchOp } from '@wirebound/schema'
import type { RegisteredRoute } from '../src/app'
import { CLIENT_KIND_HEADER, CLIENT_KINDS, DEFAULT_CLIENT_KIND } from '../src/auth/actor'
import { PROJECT_ID_PARAM } from '../src/auth/plugin'
import {
  createMenuNode,
  createPage,
  createProject,
  getTestDb,
  resetRealData,
  signup,
  withApi,
  withRealApi,
  type RealApiContext,
  type SignedUpUser,
  type TestContext,
} from './helpers'
import { sourceFiles, stripComments, SRC_ROOT } from './source-census'
import { WsProbe, joinRoom } from './ws-client'

const db = getTestDb()

beforeEach(resetRealData)
afterEach(resetRealData)

const opened: WsProbe[] = []
afterEach(() => {
  for (const probe of opened) probe.close()
  opened.length = 0
})

// ─────────────────────────────────────────────────────────────────────────────
// 1. 분모 — `actor:`를 실은 자리 전부
// ─────────────────────────────────────────────────────────────────────────────

/**
 * actor가 어디서 오는가. **글자로 가른다** — 표와 소스가 같은 술어를 쓴다.
 *
 * | 값 | 소스의 모양 |
 * |---|---|
 * | `request` | `requestActor(request)` — `revisions`에 남는다 |
 * | `request-event` | `requestEventActor(request)` — 룸 프레임이 나른다 |
 * | `literal` | `{ type: '…', … }` — 요청을 안 본다. **판정이 필요하다** |
 * | `passthrough` | 인자로 받은 것을 그대로 넘긴다 |
 * | `type` | 타입 선언(`actor: RevisionActor`). 값을 만들지 않는다 |
 *
 * **선언도 센다.** 버리면 술어가 *"대문자로 시작하면 무시"*가 되어, `actor: Actor.of(io)`
 * 같은 새 모양이 조용히 빠진다 — 분모에서 빠진 자리는 아무도 못 본다.
 */
type ActorOrigin = 'request' | 'request-event' | 'literal' | 'passthrough' | 'type'

interface ActorSite {
  file: string
  label: string
  origin: ActorOrigin
  why: string
}

/** **`apps/api/src/` 아래에서 `actor:`를 실은 자리 하나당 한 줄.** */
const ACTOR_SITES: ActorSite[] = [
  {
    file: 'routes/pages.ts',
    label: 'POST .../pages/import — 가져오기가 만든 첫 문서',
    origin: 'request',
    why: '토큰으로도 가져올 수 있다(`projectGuard(\'editor\')`뿐이다). `authorId`는 따로 사람이다 — `comments.author_id`가 `users(id)`에 FK를 건다',
  },
  {
    file: 'routes/pages.ts',
    label: 'PUT .../schema — 문서 통째 교체',
    origin: 'request',
    why: '토큰을 든 에이전트도 이 길로 올 수 있다',
  },
  {
    file: 'routes/pages.ts',
    label: 'PUT .../schema 의 page-changed',
    origin: 'request-event',
    why: '화면이 *"이건 에이전트가 고친 것"*을 실시간으로 본다(설계서 「LLM 편집 경로」의 *"구분 표시된다"*)',
  },
  {
    file: 'routes/pages.ts',
    label: 'PATCH .../ops — MCP `patch_page`가 오는 자리',
    origin: 'request',
    why: '**에이전트의 편집이 들어오는 길이다.** 설계서 「LLM 편집 경로」가 *"그 뒤 파이프라인(검증 → revision → 브로드캐스트)은 완전히 같다"*고 적었고, 갈리는 것은 actor 하나다',
  },
  {
    file: 'routes/pages.ts',
    label: 'PATCH .../ops 의 page-changed',
    origin: 'request-event',
    why: '위와 같다 — 이력과 프레임이 같은 답을 해야 화면과 `GET .../revisions`가 안 갈린다',
  },
  {
    file: 'routes/comments.ts',
    label: 'notifyMarkerChange — 코멘트 셋이 공유하는 알림',
    origin: 'request-event',
    why: 'MCP `add_comment`가 이 길로 온다. 사람 이름을 인자로 받으면 에이전트의 코멘트가 사람 것과 구별되지 않는다',
  },
  {
    file: 'routes/comments.ts',
    label: 'POST .../comments — 번호를 붙이는 갈래',
    origin: 'request',
    why: 'MCP `add_comment`가 만드는 revision이다',
  },
  {
    file: 'routes/comments.ts',
    label: 'DELETE .../comments/:id — 번호를 지우는 갈래',
    origin: 'request',
    why: '같은 라우트 묶음이고 토큰으로도 부를 수 있다 — 셋 중 하나만 남기면 그 자리가 조용히 사람으로 기록된다',
  },
  {
    file: 'routes/comments.ts',
    label: 'POST .../comments/renumber',
    origin: 'request',
    why: '위와 같다. 재번호는 문서 전체의 marker를 손보므로 revision이 남고, 그 revision의 주인이 누구인지가 갈린다',
  },
  {
    file: 'routes/snapshots.ts',
    label: '복원의 restored 프레임',
    origin: 'request-event',
    why: '**프레임은 *"누가 지금 이걸 했나"*를 든다.** 아래 `services/restore.ts`의 revision actor와 답이 다른 것이 판정이다 — 그쪽은 *"무슨 사건인가"*를 든다',
  },
  {
    file: 'services/page-import.ts',
    label: '가져오기가 파이프라인에 넘기는 actor',
    origin: 'passthrough',
    why: '**만들지 않는다.** 라우트가 만든 것을 그대로 넘긴다 — 여기서 다시 만들면 두 벌이 된다',
  },
  {
    file: 'services/restore.ts',
    label: '복원이 페이지 문서를 되돌리는 자리',
    origin: 'literal',
    why: '**이 actor는 *"누가 고쳤나"*가 아니라 *"무슨 사건인가"*다**(라벨이 `복원: <태그>`). 종류를 바꾸면 `actor_id`도 `api_tokens.id`가 돼야 하는데 이 함수는 `actorId` 하나만 받고, 무엇보다 `?mine=true`가 `actor_type=\'user\'`로 좁히므로 **복원 revision이 부른 사람의 undo 스택에서 빠진다.** 바꾸려면 설계서 「개인 undo/redo」의 스택 재구성부터 다시 정해야 한다',
  },
  {
    file: 'ws/patch.ts',
    label: 'patch 프레임이 만드는 revision',
    origin: 'literal',
    why: '**WS는 쿠키만이다**(`ws/routes.ts`의 `requireSessionAuth`). 토큰이 핸드셰이크를 못 지나므로 이 자리에 올 수 있는 자격은 세션 하나이고, 그때 답은 언제나 `user`다. 그리고 여기에는 `FastifyRequest`가 없다',
  },
  {
    file: 'ws/patch.ts',
    label: 'patch 프레임의 page-changed',
    origin: 'literal',
    why: '위와 같다 — 이 자리에 올 수 있는 자격이 세션 하나뿐이므로 답이 언제나 `user`다',
  },
  {
    file: 'repos/revisions.ts',
    label: '`InsertRevisionInput.actor` 선언',
    origin: 'type',
    why: '값을 만들지 않는다. **`RevisionActor`가 선언되는 자리이고 컬럼과 맞닿은 유일한 타입이다**',
  },
  {
    file: 'services/edit-pipeline.ts',
    label: '`ApplyEditInput.actor` 선언',
    origin: 'type',
    why: '값을 만들지 않는다. 파이프라인은 actor를 **받아서 넘길** 뿐이다 — actor를 만드는 것은 요청을 아는 호출자다',
  },
  {
    file: 'services/edit-pipeline.ts',
    label: '파이프라인이 `insertRevision` 에 넘기는 actor',
    origin: 'passthrough',
    why: '**`revisions` 에 행을 만드는 자리가 여기 하나다**(쟀다 — `insertRevision` 호출자가 이 파일뿐이다). 그래서 위의 모든 줄이 결국 이 한 줄을 지난다',
  },
  {
    file: 'services/page-import.ts',
    label: '`PageImportInput.actor` 선언',
    origin: 'type',
    why: '값을 만들지 않는다. 라우트가 만든 것을 받는 자리다',
  },
  {
    file: 'ws/notify.ts',
    label: '`PageChangedInput.actor` 선언',
    origin: 'type',
    why: '값을 만들지 않는다. 프레임 입력의 모양이다',
  },
  {
    file: 'ws/notify.ts',
    label: '`RestoredInput.actor` 선언',
    origin: 'type',
    why: '값을 만들지 않는다. 프레임 입력의 모양이다',
  },
  {
    file: 'ws/protocol.ts',
    label: '`page-changed` 프레임의 actor 선언',
    origin: 'type',
    why: '값을 만들지 않는다. **`EventActor`가 여기서 셋(`user|mcp|cli`)으로 넓어졌다** — 웹의 거울은 `type: string`이라 안 갈린다(쟀다)',
  },
  {
    file: 'ws/protocol.ts',
    label: '`restored` 프레임의 actor 선언',
    origin: 'type',
    why: '값을 만들지 않는다. 위와 같은 유니온을 든다',
  },
]

/** `actor:` 뒤에 오는 첫 조각 하나를 갈래로. **표와 케이스가 같은 술어를 쓴다.** */
function classify(head: string): ActorOrigin {
  // 이름과 `(` 사이의 공백을 걷고 비교한다 — 걷은 주석 자리가 공백으로 남는다(`stripComments`).
  const call = head.replace(/\s+/g, '')
  if (call === 'requestEventActor(') return 'request-event'
  if (call === 'requestActor(') return 'request'
  if (head === '{') return 'literal'
  // 대문자로 시작하면 타입 이름이다(`RevisionActor`·`EventActor`). 값이 아니다.
  return /^[A-Z]/.test(head) ? 'type' : 'passthrough'
}

/** 소스에서 `actor:` 자리를 파일별·출처별로 센다. **표와 같은 술어를 쓴다.** */
function actorSitesByFile(): Map<string, Map<ActorOrigin, number>> {
  const found = new Map<string, Map<ActorOrigin, number>>()
  for (const relative of sourceFiles()) {
    const source = stripComments(readFileSync(`${SRC_ROOT}/${relative}`, 'utf8'))
    for (const match of source.matchAll(/\bactor:\s*(requestEventActor\s*\(|requestActor\s*\(|\{|[A-Za-z_$][\w$.]*)/g)) {
      const head = match[1]!
      const origin: ActorOrigin = classify(head)
      const byOrigin = found.get(relative) ?? new Map<ActorOrigin, number>()
      byOrigin.set(origin, (byOrigin.get(origin) ?? 0) + 1)
      found.set(relative, byOrigin)
    }
  }
  return found
}

function tableByFile(): Map<string, Map<ActorOrigin, number>> {
  const declared = new Map<string, Map<ActorOrigin, number>>()
  for (const site of ACTOR_SITES) {
    const byOrigin = declared.get(site.file) ?? new Map<ActorOrigin, number>()
    byOrigin.set(site.origin, (byOrigin.get(site.origin) ?? 0) + 1)
    declared.set(site.file, byOrigin)
  }
  return declared
}

function flatten(counted: Map<string, Map<ActorOrigin, number>>): string[] {
  return [...counted]
    .flatMap(([file, byOrigin]) => [...byOrigin].map(([origin, count]) => `${file} ${origin} ${count}`))
    .sort()
}

describe('actor 를 만드는 자리를 소스에서 센다', () => {
  it('훑을 소스를 실제로 읽는다 — 분모가 비면 아래가 조용히 통과한다', () => {
    const counted = actorSitesByFile()
    expect(counted.size).toBeGreaterThan(4)
    expect([...counted.keys()]).toContain('ws/patch.ts')
    expect([...counted.keys()]).toContain('routes/pages.ts')
  })

  it('`actor:` 를 실은 자리가 하나도 빠지지 않았다 — 새 자리가 생기면 여기가 먼저 죽는다', () => {
    expect(flatten(actorSitesByFile())).toEqual(flatten(tableByFile()))
  })

  it('표의 모든 줄에 이유가 있다 — 이유 없이 늘리면 표가 아무것도 안 막는다', () => {
    for (const site of ACTOR_SITES) expect(site.why.length, site.label).toBeGreaterThan(20)
  })

  it('네 갈래가 모두 비어 있지 않다 — 한쪽으로 쏠리면 위가 공허해진다', () => {
    for (const origin of ['request', 'request-event', 'literal', 'passthrough', 'type'] as const) {
      expect(ACTOR_SITES.filter((site) => site.origin === origin).length, origin).toBeGreaterThan(0)
    }
  })

  it('술어가 실제로 가른다 — 반대편', () => {
    const shapes = /\bactor:\s*(requestEventActor\s*\(|requestActor\s*\(|\{|[A-Za-z_$][\w$.]*)/g
    const read = (line: string): string | undefined => [...line.matchAll(shapes)][0]?.[1]
    expect(read("actor: { type: 'user', id, label }")).toBe('{')
    expect(read('actor: requestActor(request),')).toBe('requestActor(')
    expect(read('actor: requestEventActor(request),')).toBe('requestEventActor(')
    expect(read('actor: input.actor,')).toBe('input.actor')
    expect(classify('{')).toBe('literal')
    expect(classify('requestActor(')).toBe('request')
    expect(classify('requestEventActor(')).toBe('request-event')
    expect(classify('RevisionActor')).toBe('type')
    expect(classify('input.actor')).toBe('passthrough')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. 거울 — `packages/cli`가 싣는 이름과 여기서 읽는 이름
// ─────────────────────────────────────────────────────────────────────────────

/**
 * **두 벌이 갈라지는 것을 막는다**(`protocol-parity.test.ts`와 같은 자세).
 *
 * `apps/*`와 `packages/*`는 서로 의존하지 않으므로 헤더 이름이 두 자리에 있다. 갈리면
 * **`wireb`가 싣는 헤더를 서버가 못 읽고, 그러면 모든 토큰 편집이 조용히 `cli`로 남는다** —
 * 오류도 안 난다.
 */
const CLI_CLIENT = fileURLToPath(new URL('../../../packages/cli/src/client.ts', import.meta.url))

describe('헤더 이름이 `packages/cli` 와 같은 글자다', () => {
  it('두 소스에서 읽어 맞댄다', () => {
    const source = stripComments(readFileSync(CLI_CLIENT, 'utf8'))
    const match = /export const CLIENT_KIND_HEADER = '([^']+)'/.exec(source)
    expect(match, 'packages/cli/src/client.ts 에 CLIENT_KIND_HEADER 선언이 없습니다').not.toBeNull()
    expect(match![1]).toBe(CLIENT_KIND_HEADER)
  })

  it('그 이름이 우리가 아는 값이다 — 분모가 0이 아니다', () => {
    expect(CLIENT_KIND_HEADER).toBe('x-wb-client')
    expect([...CLIENT_KINDS]).toEqual(['cli', 'mcp'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 3. 값 — 진짜 Postgres에 무엇이 들어가나
// ─────────────────────────────────────────────────────────────────────────────

interface Fixture {
  owner: SignedUpUser
  projectId: string
  menuId: string
  pageId: string
  token: string
  tokenId: string
  tokenName: string
}

const TOKEN_NAME = '내 에이전트 자격'

async function fixture(ctx: RealApiContext): Promise<Fixture> {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const menu = await createMenuNode(ctx, owner.cookie, project.id, { title: '메뉴' })
  const page = await createPage(ctx, owner.cookie, project.id, menu.id)

  const issued = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${project.id}/tokens`,
    cookies: owner.cookie,
    payload: { name: TOKEN_NAME },
  })
  if (issued.statusCode !== 201) throw new Error(`토큰 발급 픽스처가 실패했습니다: ${issued.body}`)
  const token = issued.json() as { id: string; value: string }

  return {
    owner,
    projectId: project.id,
    menuId: menu.id,
    pageId: page.id,
    token: token.value,
    tokenId: token.id,
    tokenName: TOKEN_NAME,
  }
}

let nodeCounter = 0

/** 문서에 노드 하나를 더하는 편집. 매번 다른 id다 — 같은 id를 두 번 넣으면 검증이 막는다. */
function addNode(): PatchOp[] {
  nodeCounter += 1
  return [{ op: 'add', path: '/root/children/-', value: { id: `n_actor${nodeCounter}`, type: 'Text', props: {} } } as PatchOp]
}

async function headSeqOf(pageId: string): Promise<number> {
  const row = await db.selectFrom('pages').select('head_seq').where('id', '=', pageId).executeTakeFirstOrThrow()
  return Number(row.head_seq)
}

async function lastRevision(pageId: string): Promise<{ actor_type: string; actor_id: string | null; actor_label: string }> {
  const row = await db
    .selectFrom('revisions')
    .select(['actor_type', 'actor_id', 'actor_label'])
    .where('page_id', '=', pageId)
    .orderBy('seq', 'desc')
    .executeTakeFirstOrThrow()
  return row
}

async function countRevisions(pageId: string): Promise<number> {
  const rows = await db.selectFrom('revisions').select('id').where('page_id', '=', pageId).execute()
  return rows.length
}

async function countComments(pageId: string): Promise<number> {
  const rows = await db.selectFrom('comments').select('id').where('page_id', '=', pageId).execute()
  return rows.length
}

/**
 * 프로젝트가 지금 어떤 상태인가 — **조작이 일어났는지를 재는 자.**
 *
 * 넷을 함께 본다: 스냅샷 수(복원이 안전망을 뜬다) · revision 수 · `head_seq` ·
 * 문서의 자식 수. **하나만 보면 조작의 일부만 없던 판과 구별되지 않는다.**
 */
async function projectState(fx: Fixture): Promise<{
  snapshots: number
  revisions: number
  headSeq: number
  children: number
}> {
  const snapshots = await db.selectFrom('snapshots').select('id').where('project_id', '=', fx.projectId).execute()
  const page = await db
    .selectFrom('pages')
    .select(['head_seq', 'schema'])
    .where('id', '=', fx.pageId)
    .executeTakeFirstOrThrow()
  const root = (page.schema as { root?: { children?: unknown[] } }).root
  return {
    snapshots: snapshots.length,
    revisions: await countRevisions(fx.pageId),
    headSeq: Number(page.head_seq),
    children: root?.children?.length ?? 0,
  }
}

/** `PATCH .../ops` 하나. 헤더를 주면 그대로 싣는다. */
async function patchOps(
  ctx: RealApiContext,
  fx: Fixture,
  auth: 'session' | 'token',
  headers: Record<string, string> = {},
): Promise<{ statusCode: number; body: string }> {
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/ops`,
    ...(auth === 'session'
      ? { cookies: fx.owner.cookie, headers }
      : { headers: { authorization: `Bearer ${fx.token}`, ...headers } }),
    payload: { baseSeq: await headSeqOf(fx.pageId), ops: addNode() },
  })
  return { statusCode: res.statusCode, body: res.body }
}

describe('`revisions.actor_*` 에 실제로 무엇이 들어가나', () => {
  it('세션은 사람 그대로다 — `user` + 사람 id + 사람 이름', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await patchOps(ctx, fx, 'session')
      expect(res.statusCode, res.body).toBe(200)

      expect(await lastRevision(fx.pageId)).toEqual({
        actor_type: 'user',
        actor_id: fx.owner.user.id,
        actor_label: fx.owner.user.name,
      })
    })
  }, 30_000)

  it('토큰 + `x-wb-client: mcp` 는 `mcp` + **토큰 id** + **토큰명**이다 — 설계서 「LLM 편집 경로」가 그것을 적었다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await patchOps(ctx, fx, 'token', { [CLIENT_KIND_HEADER]: 'mcp' })
      expect(res.statusCode, res.body).toBe(200)

      expect(await lastRevision(fx.pageId)).toEqual({
        actor_type: 'mcp',
        // 마이그레이션 0005: `'mcp'`·`'cli'`의 `actor_id`는 `users.id`가 아니다.
        actor_id: fx.tokenId,
        actor_label: fx.tokenName,
      })
      // **사람 이름이 아니다** — 분모가 0이면 위가 공허하다.
      expect(fx.tokenName).not.toBe(fx.owner.user.name)
      expect(fx.tokenId).not.toBe(fx.owner.user.id)
    })
  }, 30_000)

  it('토큰 + `x-wb-client: cli` 는 `cli` 다 — `wireb` 가 싣는 값이다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await patchOps(ctx, fx, 'token', { [CLIENT_KIND_HEADER]: 'cli' })
      expect(res.statusCode, res.body).toBe(200)
      expect((await lastRevision(fx.pageId)).actor_type).toBe('cli')
    })
  }, 30_000)

  it('헤더가 없는 토큰 요청은 기본값이다 — `user` 로 남지 않는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await patchOps(ctx, fx, 'token')
      expect(res.statusCode, res.body).toBe(200)

      const revision = await lastRevision(fx.pageId)
      expect(revision.actor_type).toBe(DEFAULT_CLIENT_KIND)
      // **신원은 여전히 남는다** — 어느 토큰이 했는지가 라벨에 있다.
      expect(revision.actor_label).toBe(fx.tokenName)
    })
  }, 30_000)

  it('세션에 헤더를 실어도 사람 신원을 못 덮는다 — 자칭이 신원이 되지 않는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await patchOps(ctx, fx, 'session', { [CLIENT_KIND_HEADER]: 'mcp' })
      expect(res.statusCode, res.body).toBe(200)

      expect(await lastRevision(fx.pageId)).toEqual({
        actor_type: 'user',
        actor_id: fx.owner.user.id,
        actor_label: fx.owner.user.name,
      })
    })
  }, 30_000)

  it('모르는 값은 400이고 **아무것도 쓰이지 않는다** — 지어낸 문자열이 컬럼에 안 들어간다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const before = await countRevisions(fx.pageId)

      const res = await patchOps(ctx, fx, 'token', { [CLIENT_KIND_HEADER]: 'robot' })

      expect(res.statusCode).toBe(400)
      expect((JSON.parse(res.body) as { error: { code: string; message: string } }).error.code).toBe('bad-request')
      expect(JSON.parse(res.body).error.message).toContain(CLIENT_KIND_HEADER)
      expect(await countRevisions(fx.pageId)).toBe(before)
    })
  }, 30_000)

  /**
   * **세션도 400이다.** README 표의 첫 줄이 *"세션은 헤더를
   * 무시한다"*로 읽히는데 그것은 **아는 값**에 대해서만 참이고, 모르는 값은 자격 종류와
   * 무관하게 끊긴다(`requestClientKind`가 `authKind`를 안 본다).
   *
   * 400 케이스를 **토큰으로만** 재면 세션 갈래가 헤더를 무시하는지 끊는지를 못 가른다.
   */
  it('세션으로 들어와도 모르는 값이면 400이다 — 자격 종류를 안 본다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const before = await countRevisions(fx.pageId)

      const res = await patchOps(ctx, fx, 'session', { [CLIENT_KIND_HEADER]: 'robot' })

      expect(res.statusCode).toBe(400)
      expect((JSON.parse(res.body) as { error: { message: string } }).error.message).toContain(CLIENT_KIND_HEADER)
      expect(await countRevisions(fx.pageId)).toBe(before)
    })
  }, 30_000)

  it('대소문자를 접지 않는다 — `MCP` 는 오타이지 `mcp` 가 아니다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await patchOps(ctx, fx, 'token', { [CLIENT_KIND_HEADER]: 'MCP' })
      expect(res.statusCode).toBe(400)
    })
  }, 30_000)

  /**
   * **`actorType`은 감사 기록이지 권한이 아니다**.
   *
   * **그 문장을 코드가 아니라 이 케이스가 든다.** 누가 나중에 그것으로 무엇을 막으려 하면
   * 여기가 말해야 한다 — 자칭한 종류로 권한이 갈리는 순간 *"감사 기록"*이 **인증 수단**이
   * 되고, 그것은 클라이언트가 스스로 말하는 값이다.
   */
  it('자칭한 종류로 무엇도 막지 않는다 — 같은 토큰이 `cli` 로도 `mcp` 로도 똑같이 쓴다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const asCli = await patchOps(ctx, fx, 'token', { [CLIENT_KIND_HEADER]: 'cli' })
      const asMcp = await patchOps(ctx, fx, 'token', { [CLIENT_KIND_HEADER]: 'mcp' })
      expect([asCli.statusCode, asMcp.statusCode]).toEqual([200, 200])
    })
  }, 30_000)

  it('코멘트 경로도 같은 값을 남긴다 — `add_comment` 가 이 길로 온다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const document = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}`,
        cookies: fx.owner.cookie,
      })
      const rootId = (document.json() as { schema: { root: { id: string } } }).schema.root.id

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/comments`,
        headers: { authorization: `Bearer ${fx.token}`, [CLIENT_KIND_HEADER]: 'mcp' },
        payload: { nodeId: rootId, body: '구현하다 보니 정렬 기준이 없습니다' },
      })
      expect(res.statusCode, res.body).toBe(201)

      // 번호를 붙이느라 문서가 바뀌었고 그 revision의 actor가 도구다.
      expect(await lastRevision(fx.pageId)).toEqual({
        actor_type: 'mcp',
        actor_id: fx.tokenId,
        actor_label: fx.tokenName,
      })
      // **코멘트 행의 작성자는 여전히 사람이다** — `comments.author_id`가 `users(id)`에 FK를 건다.
      expect((res.json() as { comment: { authorId: string } }).comment.authorId).toBe(fx.owner.user.id)
    })
  }, 30_000)

  /**
   * **값으로 고정한다.**
   *
   * `?mine=true`는 `actor_type='user' AND actor_id=<나>`로 좁힌다(`repos/revisions.ts`).
   * 토큰 편집은 `cli`·`mcp`이므로 **그 목록에서 빠진다.** 그것이 옳다: 설계서 「개인 undo/redo」의 undo 스택은
   * *"내가 이 브라우저에서 한 편집"*이고, 에이전트가 한 것을 사람의 undo에 섞으면 사람이
   * 자기가 안 한 편집을 되돌린다.
   */
  it('`?mine=true` 가 도구의 편집을 안 준다 — undo 스택은 사람의 것이다 (설계서 「개인 undo/redo」)', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      await patchOps(ctx, fx, 'session')
      await patchOps(ctx, fx, 'token', { [CLIENT_KIND_HEADER]: 'mcp' })

      const mine = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/revisions?mine=true`,
        cookies: fx.owner.cookie,
      })
      const all = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/revisions`,
        cookies: fx.owner.cookie,
      })

      const mineTypes = (mine.json() as { actorType: string }[]).map((r) => r.actorType)
      const allTypes = (all.json() as { actorType: string }[]).map((r) => r.actorType).sort()
      expect(mineTypes).toEqual(['user'])
      // 분모가 0이면 위가 공허하다 — 이력에는 둘 다 있다.
      expect(allTypes).toEqual(['mcp', 'user'])
    })
  }, 30_000)

  /**
   * **화면이 *"이건 에이전트가 고친 것"*을 실시간으로 본다**(설계서 「LLM 편집 경로」).
   */
  it('`page-changed` 프레임의 actor 도 도구다 — 프레임과 이력이 같은 답을 한다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const watcher = await joinRoom(ctx.port, fx.projectId, fx.owner.cookie.wb_session)
      opened.push(watcher)

      const res = await patchOps(ctx, fx, 'token', { [CLIENT_KIND_HEADER]: 'mcp' })
      expect(res.statusCode, res.body).toBe(200)

      const frame = await watcher.waitFor('page-changed')
      expect(frame.actor).toEqual({ type: 'mcp', label: fx.tokenName })
    })
  }, 30_000)

  /**
   * **표의 `literal` 줄 하나를 실제로 지나간다.** 판정이 산문으로만 있으면 다음 사람이
   * 그것을 누락으로 읽고 고친다.
   */
  it('복원은 여전히 `user` + `복원: <태그>` 다 — 표의 판정을 지나간다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const snapshot = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.projectId}/snapshots`,
        cookies: fx.owner.cookie,
        payload: { tag: '복원해볼 태그' },
      })
      expect(snapshot.statusCode, snapshot.body).toBe(201)
      const snapshotId = (snapshot.json() as { id: string }).id

      // 스냅샷 뒤에 편집을 하나 넣어 복원이 실제로 문서를 되돌리게 만든다.
      expect((await patchOps(ctx, fx, 'session')).statusCode).toBe(200)

      const restored = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.projectId}/snapshots/${snapshotId}/restore`,
        headers: { authorization: `Bearer ${fx.token}`, [CLIENT_KIND_HEADER]: 'mcp' },
      })
      expect(restored.statusCode, restored.body).toBe(200)

      const revision = await lastRevision(fx.pageId)
      expect(revision.actor_type).toBe('user')
      expect(revision.actor_label).toBe('복원: 복원해볼 태그')
      expect(revision.actor_id).toBe(fx.owner.user.id)
    })
  }, 30_000)
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. **언제** 검사하나 — 입력 검증이 조작보다 먼저 선다
// ─────────────────────────────────────────────────────────────────────────────

/**
 * **이 절이 지키는 것 — 헤더 검사를 핸들러 안에 두면 조작이 먼저 커밋될 수 있다.**
 *
 * ---
 *
 * # 핸들러 안에서 검사하면 무엇이 깨지나
 *
 * 헤더 검사가 **핸들러 안**에 있으면 순서가 라우트마다 갈린다. 대부분의 쓰기 라우트는
 * `applyEdit` **앞에서** actor를 만들어 무해하지만, **복원**은 순서가 반대다:
 * `restoreSnapshot`이 자기 트랜잭션을 **커밋한 뒤** `notifyRestored`가 처음으로 헤더를 본다.
 *
 * 그러면 `x-wb-client: robot`으로 복원을 부를 때 **status 400 · 안전망 스냅샷 +1 · 문서가
 * 되돌아감 · `복원: 기준` revision 기록됨** · `notifyRestored` 안 돎이 된다. **부른 쪽은 아무
 * 일도 안 일어났다고 믿는데 프로젝트가 통째로 되돌아가 있고, 열려 있는 화면들은 그것을 모른다.**
 *
 * *"실패했다고 말하는데 조작은 일어났다"* — 조용히 되풀이되는 부류다
 * (`routes/comments.ts`의 머리말 규칙 1).
 *
 * # 어디서 막나 — **자리가 아니라 층에서**
 *
 * 대안은 *"복원 핸들러에서 두 줄을 위로"*다. **그것보다 한 층 위에서 막는다:**
 * `projectGuard`가 **preHandler**로 헤더를 검사한다(`auth/roles.ts`).
 *
 * | 무엇 | 두 줄을 위로 | 가드에서 |
 * |---|---|---|
 * | 복원의 순서 결함 | 닫힌다 | 닫힌다 |
 * | **다음 쓰기 라우트** | **또 순서를 지켜야 한다** — 지키는 자가 산문뿐이다 | **핸들러 본문보다 먼저라는 것이 구조다** |
 * | 코멘트의 **상태 의존**(아래) | 안 닫힌다 | 닫힌다 |
 * | 읽기 | 헤더 오타를 **쓸 때까지** 모른다 | 첫 요청에서 안다 |
 *
 * # `ACTOR_SITES`는 *"언제"*를 못 본다 — 그리고 못 보게 두는 것이 맞다 (판정)
 *
 * 위 「분모」 절의 표는 *"`actor:`를 실은 자리가 전부 표에 있는가"*를 본다. **호출 순서는 그 술어에
 * 안 잡힌다** — 표를 그대로 두고 두 줄만 뒤집어도 그 census는 초록이다.
 *
 * **그것을 그 표에 욱여넣지 않는다.** 순서는 핸들러의 성질인데 검사가 핸들러 밖에
 * 있으므로, 지켜야 하는 명제는 *"핸들러 안에서 언제 부르나"*가 아니라 **"등록된 라우트
 * 전부가 그 가드를 지나는가"*다. 그래서 **분모가 다른 census를 따로 세운다** —
 * 아래가 그것이고, 분모는 **Fastify가 아는 라우트 목록**이다(`token-route-census.test.ts`와
 * 같은 이음매).
 */
describe('헤더 검사가 조작보다 **먼저** 선다', () => {
  it('모르는 `x-wb-client` 로 복원을 부르면 400이고 **아무것도 되돌아가지 않는다**', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const snapshot = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.projectId}/snapshots`,
        cookies: fx.owner.cookie,
        payload: { tag: '기준' },
      })
      expect(snapshot.statusCode, snapshot.body).toBe(201)
      const snapshotId = (snapshot.json() as { id: string }).id

      // 스냅샷 뒤에 편집을 하나 넣는다 — 복원이 실제로 되돌릴 것이 있어야 잰다.
      expect((await patchOps(ctx, fx, 'session')).statusCode).toBe(200)

      const before = await projectState(fx)
      // 분모가 0이면 아래가 공허하다 — **되돌릴 것이 실제로 있는가.** 스냅샷은 편집
      // **앞에서** 떴으므로 복원이 성공하면 이 자식이 사라진다.
      expect(before.children).toBeGreaterThan(0)
      expect(before.revisions).toBeGreaterThan(0)

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.projectId}/snapshots/${snapshotId}/restore`,
        headers: { authorization: `Bearer ${fx.token}`, [CLIENT_KIND_HEADER]: 'robot' },
      })

      expect(res.statusCode).toBe(400)
      expect((JSON.parse(res.body) as { error: { message: string } }).error.message).toContain(CLIENT_KIND_HEADER)

      // **조작이 하나도 안 일어났다.** 400인데 프로젝트가 되돌아가 있으면 여기가 죽는다.
      expect(await projectState(fx)).toEqual(before)
    })
  }, 30_000)

  /**
   * **대조.** 위 케이스가 *"복원이 아예 안 된다"*와 구별되지 않으면 아무것도 못 잰다 —
   * 같은 요청이 올바른 헤더로는 실제로 되돌린다.
   */
  it('올바른 헤더면 같은 요청이 실제로 되돌린다 — 반대편', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const snapshot = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.projectId}/snapshots`,
        cookies: fx.owner.cookie,
        payload: { tag: '기준' },
      })
      const snapshotId = (snapshot.json() as { id: string }).id
      expect((await patchOps(ctx, fx, 'session')).statusCode).toBe(200)

      const before = await projectState(fx)
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.projectId}/snapshots/${snapshotId}/restore`,
        headers: { authorization: `Bearer ${fx.token}`, [CLIENT_KIND_HEADER]: 'mcp' },
      })

      expect(res.statusCode, res.body).toBe(200)
      const after = await projectState(fx)
      expect(after.snapshots).toBe(before.snapshots + 1)
      expect(after.revisions).toBeGreaterThan(before.revisions)
      expect(after.headSeq).toBeGreaterThan(before.headSeq)
    })
  }, 30_000)

  /**
   * **코멘트의 상태 의존** — 검사가 actor를 만들 때 서면 같은 요청이 문서 상태에 따라
   * 400이 되기도 201이 되기도 한다.
   *
   * 번호가 **없던** 노드면 `applyEdit`을 부르며 actor를 만들다 400이 나고(트랜잭션 안이라
   * 되돌아간다 — 무해하다), **이미 번호가 있으면** `markerOps`가 비어 actor를 아예 안
   * 만들므로 **헤더가 검사되지 않은 채 201**이다. 검사가 가드에 있으면 둘이 같다.
   */
  it('이미 번호가 있는 노드에 코멘트를 달아도 모르는 헤더는 400이다 — 문서 상태에 안 갈린다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const document = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}`,
        cookies: fx.owner.cookie,
      })
      const rootId = (document.json() as { schema: { root: { id: string } } }).schema.root.id

      // 첫 코멘트가 번호를 만든다(올바른 헤더로).
      const first = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/comments`,
        headers: { authorization: `Bearer ${fx.token}`, [CLIENT_KIND_HEADER]: 'mcp' },
        payload: { nodeId: rootId, body: '첫째' },
      })
      expect(first.statusCode, first.body).toBe(201)
      // 분모: 이제 그 노드는 번호가 있으므로 다음 코멘트는 문서를 안 바꾼다.
      expect((first.json() as { markerOps: unknown[] }).markerOps.length).toBeGreaterThan(0)

      const before = await countComments(fx.pageId)
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/comments`,
        headers: { authorization: `Bearer ${fx.token}`, [CLIENT_KIND_HEADER]: 'robot' },
        payload: { nodeId: rootId, body: '둘째' },
      })

      expect(res.statusCode, res.body).toBe(400)
      expect(await countComments(fx.pageId)).toBe(before)
    })
  }, 30_000)
})

/**
 * **라우트 인구조사 — 분모가 Fastify가 아는 목록이다.**
 *
 * *"헤더 검사가 핸들러보다 먼저"*를 지키는 것은 **가드가 라우트마다 걸려 있다**는 사실이다.
 * 그 사실을 손으로 적으면 새 라우트가 조용히 빠진다 — 가드 없는 라우트가 하나 있어도 api
 * 전량이 초록일 수 있다. 그래서 `token-route-census.test.ts`와 같은 이음매(`buildApp`의
 * `onRoute`)를 쓴다.
 *
 * **읽기도 분모에 있다.** 검사가 핸들러 밖이라는 것의 직접 관측이 그것이다 — 읽기는
 * `actorType`을 안 쓰는데도 400이 나는 것이, 검사가 *"actor를 만들 때"*가 아니라
 * *"요청이 들어올 때"* 선다는 뜻이다.
 */
describe('`:projectId` 라우트 전부가 나쁜 헤더를 핸들러 앞에서 끊는다', () => {
  const METHODS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'] as const
  const FILLER_UUID = '00000000-0000-4000-8000-000000000000'

  interface Target {
    method: (typeof METHODS)[number]
    url: string
  }

  function expand(route: RegisteredRoute): Target[] {
    return route.method
      .split(',')
      .filter((method): method is Target['method'] => (METHODS as readonly string[]).includes(method))
      .map((method) => ({ method, url: route.url }))
  }

  function fill(pattern: string, projectId: string): string {
    return pattern.replace(PROJECT_ID_PARAM, projectId).replace(/:[A-Za-z]+/g, FILLER_UUID)
  }

  /**
   * **프로젝트를 지우는 라우트를 맨 뒤로 민다.**
   *
   * `DELETE /api/projects/:projectId`는 픽스처 자체를 지운다 — 목록 중간에서 돌면 그 뒤의
   * 라우트가 전부 404가 되어 **아래 두 케이스가 조용히 약해진다.** 헤더가 올바른 판(대조)이
   * 정확히 그 판이다.
   *
   * **뺀 것이 아니라 미뤘다** — 분모는 그대로다.
   */
  function ordered(targets: Target[]): Target[] {
    const destroys = (one: Target): boolean => one.method === 'DELETE' && one.url === `/api/projects/${PROJECT_ID_PARAM}`
    return [...targets.filter((one) => !destroys(one)), ...targets.filter(destroys)]
  }

  function projectTargets(routes: RegisteredRoute[]): Target[] {
    return ordered(routes.filter((route) => route.url.includes(PROJECT_ID_PARAM)).flatMap(expand))
  }

  async function withRoutes(
    fn: (args: { ctx: TestContext; routes: RegisteredRoute[]; projectId: string; cookie: { wb_session: string } }) => Promise<void>,
  ): Promise<void> {
    const routes: RegisteredRoute[] = []
    await withApi(
      async (ctx) => {
        const owner = await signup(ctx)
        const project = await createProject(ctx, owner.cookie)
        await fn({ ctx, routes, projectId: project.id, cookie: owner.cookie })
      },
      { onRoute: (route) => routes.push(route) },
    )
  }

  /**
   * 이 앱이 쓸 수 있는 표 전부의 행 수. **조작이 일어났는지를 재는 자.**
   *
   * **목록을 손으로 적었지만 자가검사가 붙어 있다** — `Database`의 키와 맞대는 케이스가
   * 아래 있다. 새 표가 생기면 그 케이스가 먼저 죽는다.
   */
  const TABLES = [
    'users',
    'sessions',
    'projects',
    'project_members',
    'menu_nodes',
    'pages',
    'revisions',
    'themes',
    'layouts',
    'comments',
    'comment_tombstones',
    'snapshots',
    'presets',
    'api_tokens',
  ] as const

  async function rowCounts(ctx: TestContext): Promise<Record<string, number>> {
    const counted: Record<string, number> = {}
    for (const table of TABLES) {
      // **`id`를 안 고른다** — `project_members`는 복합 키라 그 컬럼이 없다(실측: `column
      // "id" does not exist`). 세는 것이 목적이므로 행 수만 받는다.
      const row = await ctx.db
        .selectFrom(table)
        .select((eb) => eb.fn.countAll<string>().as('n'))
        .executeTakeFirstOrThrow()
      counted[table] = Number(row.n)
    }
    return counted
  }

  /** 그 요청이 **헤더 때문에** 거절됐는가. 다른 400과 갈라야 한다. */
  function refusedForHeader(body: string): boolean {
    try {
      return (JSON.parse(body) as { error?: { message?: string } }).error?.message?.includes(CLIENT_KIND_HEADER) === true
    } catch {
      return false
    }
  }

  it('분모를 실제로 만든다 — 목록이 비어 있지 않고 읽기·쓰기가 다 있다', async () => {
    await withRoutes(async ({ routes }) => {
      const inside = projectTargets(routes)
      // 이음매가 어긋나면 **빈 집합에서 아래가 조용히 통과한다.**
      expect(inside.length).toBeGreaterThan(20)
      expect(inside.filter((one) => one.method === 'GET').length).toBeGreaterThan(5)
      expect(inside.filter((one) => one.method !== 'GET').length).toBeGreaterThan(10)
    })
  }, 60_000)

  it('표 목록이 `Database` 를 하나도 안 빠뜨린다 — 아래 자가 눈을 감지 않게', async () => {
    // `Database`의 키를 소스에서 읽는다. 새 표가 생기면 여기가 **먼저** 죽는다.
    const source = stripComments(readFileSync(`${SRC_ROOT}/db/types.ts`, 'utf8'))
    const block = source.slice(source.indexOf('export interface Database {'))
    const declared = [...block.slice(0, block.indexOf('}')).matchAll(/^\s*([a-z_]+):/gm)].map((one) => one[1]!)
    expect(declared.length).toBeGreaterThan(10)
    expect([...TABLES].sort()).toEqual(declared.sort())
  })

  /**
   * **전부 400이고, 그 400이 나기 전에 아무것도 안 바뀐다.**
   *
   * 뒤엣것이 이 절이 지키는 성질이다 — *"실패했다고 말하는데 조작은 일어났다"*를
   * 라우트 하나가 아니라 **등록된 전부**에 대해 잰다. 표 열셋의 행 수를 요청마다 앞뒤로
   * 세므로, 어느 라우트가 400 앞에서 무엇을 썼든 여기서 이름과 함께 드러난다.
   */
  it('전부 400이고 문장이 헤더를 지목한다 — 그리고 **아무 표도 안 바뀐다**', async () => {
    await withRoutes(async ({ ctx, routes, projectId, cookie }) => {
      const missed: string[] = []
      const mutated: string[] = []
      for (const target of projectTargets(routes)) {
        const before = await rowCounts(ctx)
        const res = await ctx.app.inject({
          method: target.method,
          url: fill(target.url, projectId),
          cookies: cookie,
          headers: { [CLIENT_KIND_HEADER]: 'robot' },
          // **본문은 아무것이나 된다** — 가드가 본문 검증보다 먼저 돈다. 그것도 이 케이스가
          // 재는 것이다(zod가 먼저 돌면 문장이 헤더를 안 지목한다).
          ...(target.method === 'GET' || target.method === 'DELETE' ? {} : { payload: {} }),
        })
        if (res.statusCode !== 400 || !refusedForHeader(res.body)) {
          missed.push(`${target.method} ${target.url} → ${res.statusCode} ${res.body.slice(0, 120)}`)
        }
        const after = await rowCounts(ctx)
        for (const table of TABLES) {
          if (before[table] !== after[table]) {
            mutated.push(`${target.method} ${target.url}: ${table} ${before[table]} → ${after[table]}`)
          }
        }
        // **첫 조작에서 멈춘다.** 무엇이 하나라도 바뀌면 그 뒤의 픽스처를 못 믿으므로,
        // 계속 돌면 실패 문장이 연쇄로 뒤덮여 **어느 라우트가 범인인지 안 보인다.**
        if (mutated.length > 0) break
      }
      // **이것이 이 절이 지키는 성질이다** — 먼저 단언한다. 400을 받은 요청이 표를 하나라도
      // 만졌으면 여기가 죽고, 그 줄이 범인의 이름이다.
      expect(mutated).toEqual([])
      expect(missed).toEqual([])
    })
  }, 180_000)

  it('올바른 헤더면 그 문장이 안 나온다 — 술어가 늘 참이 아니다', async () => {
    await withRoutes(async ({ ctx, routes, projectId, cookie }) => {
      const wrong: string[] = []
      for (const target of projectTargets(routes)) {
        const res = await ctx.app.inject({
          method: target.method,
          url: fill(target.url, projectId),
          cookies: cookie,
          headers: { [CLIENT_KIND_HEADER]: 'cli' },
          ...(target.method === 'GET' || target.method === 'DELETE' ? {} : { payload: {} }),
        })
        // 다른 이유로 400·404가 나는 것은 상관없다. **헤더를 지목하면 안 된다.**
        if (refusedForHeader(res.body)) wrong.push(`${target.method} ${target.url}`)
      }
      expect(wrong).toEqual([])
    })
  }, 120_000)

  it('`:projectId` 밖 라우트는 그 검사를 안 지난다 — 가드가 없는 자리다', async () => {
    await withRoutes(async ({ ctx, routes }) => {
      const outside = routes.filter((route) => !route.url.includes(PROJECT_ID_PARAM)).flatMap(expand)
      // 분모가 0이면 아래가 공허하다.
      expect(outside.length).toBeGreaterThan(4)

      const refused: string[] = []
      for (const target of outside) {
        const res = await ctx.app.inject({
          method: target.method,
          url: fill(target.url, FILLER_UUID),
          headers: { [CLIENT_KIND_HEADER]: 'robot' },
          ...(target.method === 'GET' || target.method === 'DELETE' ? {} : { payload: {} }),
        })
        if (refusedForHeader(res.body)) refused.push(`${target.method} ${target.url}`)
      }
      expect(refused).toEqual([])
    })
  }, 120_000)
})
