/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다** — `helpers.ts`의 `withRealApi`를 쓴다.
 *
 * **§7.4의 `actor_type='mcp'` · `actor_label='<토큰명>'`이 참인지 잰다**(P9-5 D1).
 *
 * ---
 *
 * # 왜 인구조사인가 — 손으로 고른 목록이면 새 라우트가 조용히 `user`로 남는다
 *
 * P9-2가 *"`routes/*`가 전부 `{ type: 'user', … }`를 리터럴로 적는다"*를 쟀는데 **그 문장이
 * 좁았다** — `ws/patch.ts`도 revision을 만든다(P9-5 계획서 재라 #1). 그런 누락은 손으로 적은
 * 목록에서 반복되므로, `lock-census`·`broadcast-census`와 **같은 분모 만드는 법**을 쓴다:
 * `src/` 전체를 재귀로 훑어 `actor:`를 실은 자리를 세고, 표에 없는 자리가 있으면 죽는다.
 *
 * **`false`인 줄도 표에 있다.** *"여기는 요청을 안 본다"*는 판정이지 누락이 아니고, 판정이
 * 표에 없으면 다음 사람이 그것을 누락으로 읽고 고친다(`lock-census.test.ts`와 같은 자세).
 *
 * # 재는 것 셋
 *
 * 1. **분모** — `actor:`를 실은 자리 전부가 표에 있다.
 * 2. **값** — 진짜 Postgres에 무엇이 들어가는가. 세션·토큰·헤더 유무·모르는 값.
 * 3. **거울** — `packages/cli`가 싣는 헤더 이름과 이 서버가 읽는 이름이 같은 글자다.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PatchOp } from '@wirebound/schema'
import { CLIENT_KIND_HEADER, CLIENT_KINDS, DEFAULT_CLIENT_KIND } from '../src/auth/actor'
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
    why: '§7.4의 에이전트가 이 길로도 올 수 있다',
  },
  {
    file: 'routes/pages.ts',
    label: 'PUT .../schema 의 page-changed',
    origin: 'request-event',
    why: '화면이 *"이건 에이전트가 고친 것"*을 실시간으로 본다(§7.4 · P3-3 이월 §3.2가 남긴 자리다)',
  },
  {
    file: 'routes/pages.ts',
    label: 'PATCH .../ops — §12.2의 `patch_page`가 오는 자리',
    origin: 'request',
    why: '**이 슬라이스가 여는 길이다.** §7.4가 *"REST로 들어오지만 그 뒤 파이프라인은 완전히 같다"*고 적었고, 갈리는 것은 actor 하나다',
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
    why: '§12.2의 `add_comment`가 이 길로 온다. 앞 판은 사람 이름을 인자로 받아 에이전트의 코멘트가 사람 것과 구별되지 않았다',
  },
  {
    file: 'routes/comments.ts',
    label: 'POST .../comments — 번호를 붙이는 갈래',
    origin: 'request',
    why: '§12.2의 `add_comment`가 만드는 revision이다',
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
    why: '**D10 — 이 actor는 *"누가 고쳤나"*가 아니라 *"무슨 사건인가"*다**(라벨이 `복원: <태그>`). 종류를 바꾸면 `actor_id`도 `api_tokens.id`가 돼야 하는데 이 함수는 `actorId` 하나만 받고, 무엇보다 `?mine=true`가 `actor_type=\'user\'`로 좁히므로 **복원 revision이 부른 사람의 undo 스택에서 빠진다.** §7.3을 다시 여는 일이라 이 슬라이스 밖이다',
  },
  {
    file: 'ws/patch.ts',
    label: 'patch 프레임이 만드는 revision',
    origin: 'literal',
    why: '**WS는 쿠키만이다**(§10 · `ws/routes.ts`의 `requireSessionAuth`). 토큰이 핸드셰이크를 못 지나므로 이 자리에 올 수 있는 자격은 세션 하나이고, 그때 답은 언제나 `user`다. 그리고 여기에는 `FastifyRequest`가 없다',
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
    why: '값을 만들지 않는다. 파이프라인은 actor를 **받아서 넘길** 뿐이고 그것이 D1이 지키는 경계다',
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
  if (head === 'requestEventActor(') return 'request-event'
  if (head === 'requestActor(') return 'request'
  if (head === '{') return 'literal'
  // 대문자로 시작하면 타입 이름이다(`RevisionActor`·`EventActor`). 값이 아니다.
  return /^[A-Z]/.test(head) ? 'type' : 'passthrough'
}

/** 소스에서 `actor:` 자리를 파일별·출처별로 센다. **표와 같은 술어를 쓴다.** */
function actorSitesByFile(): Map<string, Map<ActorOrigin, number>> {
  const found = new Map<string, Map<ActorOrigin, number>>()
  for (const relative of sourceFiles()) {
    const source = stripComments(readFileSync(`${SRC_ROOT}/${relative}`, 'utf8'))
    for (const match of source.matchAll(/\bactor:\s*(requestEventActor\(|requestActor\(|\{|[A-Za-z_$][\w$.]*)/g)) {
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

describe('actor 를 만드는 자리를 소스에서 센다 (D1)', () => {
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
    const shapes = /\bactor:\s*(requestEventActor\(|requestActor\(|\{|[A-Za-z_$][\w$.]*)/g
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

describe('`revisions.actor_*` 에 실제로 무엇이 들어가나 (D1)', () => {
  it('세션은 오늘 그대로다 — `user` + 사람 id + 사람 이름', async () => {
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

  it('토큰 + `x-wb-client: mcp` 는 `mcp` + **토큰 id** + **토큰명**이다 — §7.4가 그것을 적었다', async () => {
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

  it('대소문자를 접지 않는다 — `MCP` 는 오타이지 `mcp` 가 아니다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await patchOps(ctx, fx, 'token', { [CLIENT_KIND_HEADER]: 'MCP' })
      expect(res.statusCode).toBe(400)
    })
  }, 30_000)

  /**
   * **`actorType`은 감사 기록이지 권한이 아니다**(D1의 근거 ①).
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
   * **이 슬라이스가 바꾼 동작이다 — 값으로 고정한다.**
   *
   * `?mine=true`는 `actor_type='user' AND actor_id=<나>`로 좁힌다(`repos/revisions.ts`).
   * 토큰 편집이 `cli`·`mcp`가 되면서 **그 목록에서 빠진다.** 그것이 옳다: §7.3의 undo 스택은
   * *"내가 이 브라우저에서 한 편집"*이고, 에이전트가 한 것을 사람의 undo에 섞으면 사람이
   * 자기가 안 한 편집을 되돌린다.
   */
  it('`?mine=true` 가 도구의 편집을 안 준다 — undo 스택은 사람의 것이다 (§7.3)', async () => {
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
   * **화면이 *"이건 에이전트가 고친 것"*을 실시간으로 본다**(§7.4 · P3-3 이월 §3.2가
   * *"화면은 그 필드를 아직 안 그린다"*로 남긴 자리).
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
