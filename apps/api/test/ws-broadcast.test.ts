/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withRealApi`를 쓴다.
 *
 * ---
 *
 * # 하나짜리로 재지 않는다
 *
 * **브로드캐스트는 받는 사람이 둘 이상일 때만 뜻이 있다.** 연결 하나로 재면 *"자리 0"*이
 * 되어 룸을 섞어도 안 죽는다 — 보낼 상대가 자기밖에 없으니 어느 룸에 넣든 같은 결과다.
 * 그래서 이 파일의 판은 항상 **연결 둘 이상 · 프로젝트 둘 · 페이지 여럿**이다.
 *
 * | 무엇을 여럿으로 두나 | 그것이 없으면 무엇이 안 죽나 |
 * |---|---|
 * | 연결 둘 | 발신자 제외(`except`)를 지워도 안 죽는다 |
 * | 프로젝트 둘 | 룸 키를 무시하고 **모두에게** 보내도 안 죽는다 |
 * | 페이지 여럿 | 프레임에서 `pageId`를 빼도 안 죽는다 |
 *
 * # 무엇을 알리는가
 *
 * 셋이다 — **페이지 문서 변경**(`applyEdit` 성공) · **복원 성공** · **연결·참가·이탈**.
 * 어느 `applyEdit` 호출자가 알리고 어느 쪽이 안 알리는지는 `broadcast-census.test.ts`가
 * 소스에서 세어 고정한다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { PatchOp } from '@wirebound/schema'
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
import { CONNECTION_ID_HEADER, RESTORE_ID_HEADER } from '../src/ws/notify'
import { WsProbe, joinRoom } from './ws-client'

const db = getTestDb()

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
  owner: SignedUpUser
  /** 같은 프로젝트의 두 번째 사람. 편집을 내지 않고 **받기만** 한다. */
  peer: SignedUpUser
  project: CreatedProject
  /** **다른** 프로젝트. 룸 경계를 재는 데 쓴다 — owner가 여기도 owner다. */
  other: CreatedProject
  /** 이 프로젝트의 페이지 둘. 하나를 고치면 다른 하나를 연 사람도 룸에서 받는다. */
  page: CreatedPage
  spare: CreatedPage
  /** `other` 프로젝트의 페이지. */
  otherPage: CreatedPage
}

/** 연결 둘 · 프로젝트 둘 · 페이지 여럿의 판을 세운다. */
async function board(ctx: RealApiContext): Promise<Board> {
  const owner = await signup(ctx)
  const peer = await signup(ctx)

  const project = await createProject(ctx, owner.cookie)
  await addMember(ctx, project.id, peer.user.id, 'editor')
  const menu = await createMenuNode(ctx, owner.cookie, project.id)
  const page = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '고칠 페이지' })
  const spare = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '안 고칠 페이지' })

  const other = await createProject(ctx, owner.cookie)
  const otherMenu = await createMenuNode(ctx, owner.cookie, other.id)
  const otherPage = await createPage(ctx, owner.cookie, other.id, otherMenu.id, { title: '남의 프로젝트 페이지' })

  return { owner, peer, project, other, page, spare, otherPage }
}

/** `PATCH .../ops`로 문서를 한 번 고친다. `connectionId`를 주면 그 연결은 제외된다. */
async function editPage(
  ctx: RealApiContext,
  fx: Board,
  who: SignedUpUser,
  input?: { pageId?: string; ops?: PatchOp[]; baseSeq?: number; connectionId?: string },
): Promise<{ statusCode: number; seq: number }> {
  const pageId = input?.pageId ?? fx.page.id
  const baseSeq = input?.baseSeq ?? (await headSeqOf(pageId))
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/api/projects/${fx.project.id}/pages/${pageId}/ops`,
    cookies: who.cookie,
    headers: input?.connectionId ? { [CONNECTION_ID_HEADER]: input.connectionId } : {},
    payload: {
      baseSeq,
      ops: input?.ops ?? [{ op: 'add', path: '/root/children/-', value: { id: nodeId(), type: 'Text', props: {} } }],
    },
  })
  return { statusCode: res.statusCode, seq: res.statusCode === 200 ? (res.json() as { seq: number }).seq : -1 }
}

/** 같은 사람으로 **한 번 더** 로그인한다 — 새 세션의 쿠키다(다른 탭·다른 브라우저의 모양). */
async function loginAgain(ctx: RealApiContext, who: SignedUpUser): Promise<{ wb_session: string }> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: who.user.email, password: who.password },
  })
  const token = res.cookies.find((cookie) => cookie.name === 'wb_session')?.value
  if (res.statusCode !== 200 || token === undefined) throw new Error(`다시 로그인 실패 (status ${res.statusCode})`)
  expect(token).not.toBe(who.cookie.wb_session)
  return { wb_session: token }
}

/** 그 사람의 API 토큰. `Authorization` 헤더 값을 돌려준다. */
async function issueToken(ctx: RealApiContext, who: SignedUpUser, projectId: string): Promise<string> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/tokens`,
    cookies: who.cookie,
    payload: { name: '방송 토큰' },
  })
  if (res.statusCode !== 201) throw new Error(`토큰 발급 실패 (status ${res.statusCode}): ${res.body}`)
  return `Bearer ${(res.json() as { value: string }).value}`
}

/** 토큰으로 `PATCH .../ops` 를 한 번 — 쿠키 없이, 연결 id 헤더를 싣고. 새 `seq`를 돌려준다. */
async function editWithToken(ctx: RealApiContext, fx: Board, authorization: string, connectionId: string): Promise<number> {
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/api/projects/${fx.project.id}/pages/${fx.page.id}/ops`,
    headers: { authorization, [CONNECTION_ID_HEADER]: connectionId },
    payload: {
      baseSeq: await headSeqOf(fx.page.id),
      ops: [{ op: 'add', path: '/root/children/-', value: { id: nodeId(), type: 'Text', props: {} } }],
    },
  })
  expect(res.statusCode, res.body).toBe(200)
  return (res.json() as { seq: number }).seq
}

let nodeCounter = 0

function nodeId(): string {
  nodeCounter += 1
  return `n_ws${nodeCounter}`
}

async function headSeqOf(pageId: string): Promise<number> {
  const row = await db.selectFrom('pages').select('head_seq').where('id', '=', pageId).executeTakeFirstOrThrow()
  return Number(row.head_seq)
}

describe('룸 하나가 프로젝트 하나다', () => {
  it('편집을 안 낸 다른 연결이 그 변경을 받는다 — 이 슬라이스의 본줄기', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.peer.cookie.wb_session))

      const edit = await editPage(ctx, fx, fx.owner)
      expect(edit.statusCode).toBe(200)

      const frame = await watcher.waitFor('page-changed')
      expect(frame.pageId).toBe(fx.page.id)
      expect(frame.seq).toBe(edit.seq)
      expect(frame.ops).toHaveLength(1)
      expect(frame.actor.label).toBe(fx.owner.user.name)
    })
  })

  it('다른 프로젝트의 연결은 받지 않는다 — 룸 경계', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const inside = track(await joinRoom(ctx.port, fx.project.id, fx.peer.cookie.wb_session))
      const outside = track(await joinRoom(ctx.port, fx.other.id, fx.owner.cookie.wb_session))

      await editPage(ctx, fx, fx.owner)

      // 안쪽이 먼저 받았다는 것을 확인한 뒤에 바깥을 잰다 — 순서를 안 잡으면
      // *"아직 안 왔다"*와 *"안 온다"*가 구분되지 않는다.
      await inside.waitFor('page-changed')
      expect(await outside.quiet()).toEqual([])
    })
  })

  it('다른 페이지를 연 사람도 받되 프레임이 어느 페이지인지 말한다 — 받는 쪽이 거른다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.peer.cookie.wb_session))

      await editPage(ctx, fx, fx.owner, { pageId: fx.spare.id })
      const first = await watcher.waitFor('page-changed')
      expect(first.pageId).toBe(fx.spare.id)

      await editPage(ctx, fx, fx.owner, { pageId: fx.page.id })
      const frames = await watcher.waitForCount('page-changed', 2)
      expect(frames.map((frame) => frame.pageId)).toEqual([fx.spare.id, fx.page.id])
    })
  })

  it('뷰어도 받는다 — 조회 전용도 남이 고친 화면을 봐야 한다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const viewer = await signup(ctx)
      await addMember(ctx, fx.project.id, viewer.user.id, 'viewer')
      const watcher = track(await joinRoom(ctx.port, fx.project.id, viewer.cookie.wb_session))

      await editPage(ctx, fx, fx.owner)

      const frame = await watcher.waitFor('page-changed')
      expect(frame.pageId).toBe(fx.page.id)
    })
  })
})

describe('자기 편집은 자기에게 돌아오지 않는다 (설계서 「정방향 흐름」)', () => {
  it('헤더로 가리킨 연결만 빠지고 나머지는 받는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const author = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.peer.cookie.wb_session))
      const joined = await author.waitFor('joined')

      await editPage(ctx, fx, fx.owner, { connectionId: joined.connectionId })

      await watcher.waitFor('page-changed')
      expect(author.received.filter((frame) => frame.type === 'page-changed')).toEqual([])
    })
  })

  /**
   * **음성 대조.** 이것이 없으면 위 케이스가 *"작성자에게는 원래 안 간다"*로도 통과한다 —
   * 그러면 `except`를 아예 지워도 안 죽는다.
   */
  it('헤더가 없으면 작성자의 연결도 받는다 — 음성 대조', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const author = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))
      track(await joinRoom(ctx.port, fx.project.id, fx.peer.cookie.wb_session))

      await editPage(ctx, fx, fx.owner)

      const frame = await author.waitFor('page-changed')
      expect(frame.pageId).toBe(fx.page.id)
    })
  })

  /**
   * **빠지는 것은 그 요청의 세션이 든 연결뿐이다**(`broadcast.ts`의 `sentBy`). id 만 견주면
   * 재기동 뒤 앨리스의 옛 id 를 받은 캐럴이 앨리스의 게시 방송에서 빠진다. 여기서는
   * 재기동 대신 **남의 id 를 그대로 싣는다** — 서버가 보는 것은 같다(id 가 같고 세션이 다르다).
   *
   * 두 판을 한 케이스에 둔다: **남**(다른 사용자)과 **같은 사람의 다른 세션**(다시 로그인한 쿠키). 뒤의 것이
   * 없으면 «사용자로 견준다»가 통과한다 — 같은 사람이 탭 둘에서 다른 세션이면 한쪽의 게시가 다른 쪽을 뺀다.
   */
  it('다른 세션의 요청이 실은 id 로는 아무도 안 빠진다 — 남의 연결도, 같은 사람의 다른 세션도', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const peer = track(await joinRoom(ctx.port, fx.project.id, fx.peer.cookie.wb_session))
      const elsewhere = await loginAgain(ctx, fx.owner)
      const ownerElsewhere = track(await joinRoom(ctx.port, fx.project.id, elsewhere.wb_session))
      const peerId = (await peer.waitFor('joined')).connectionId
      const elsewhereId = (await ownerElsewhere.waitFor('joined')).connectionId

      const intoPeer = await editPage(ctx, fx, fx.owner, { connectionId: peerId })
      // 첫 방송이 룸을 다 돈 뒤에 둘째를 낸다 — 방송은 기다리지 않고 나가므로(`notify.ts`) 안 기다리면 두
      // 방송의 프레임 순서가 섞일 수 있다. 룸은 넣은 순서로 돌고 `ownerElsewhere`가 마지막이다.
      await ownerElsewhere.waitFor('page-changed')
      const intoElsewhere = await editPage(ctx, fx, fx.owner, { connectionId: elsewhereId })

      const seqs = [intoPeer.seq, intoElsewhere.seq]
      expect((await peer.waitForCount('page-changed', 2)).map((frame) => frame.seq)).toEqual(seqs)
      expect((await ownerElsewhere.waitForCount('page-changed', 2)).map((frame) => frame.seq)).toEqual(seqs)
    })
  })

  /**
   * **토큰 요청은 아무도 안 뺀다**(`sentBy`의 머리말). 토큰은 WS 를 못 열므로(`ws/routes.ts`의
   * `requireSessionAuth`) 그 요청을 **낸 연결이 없다** — 같은 사람의 연결 id 를 실었어도 그 연결은 에이전트가 낸
   * 편집을 받아야 한다. 남의 id 를 실은 둘째 편집은 «토큰이면 id 만 본다»를 잰다.
   */
  it('토큰 요청은 아무도 안 뺀다 — 같은 사람의 연결 id 를 실어도 그 연결은 받는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const author = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))
      const peer = track(await joinRoom(ctx.port, fx.project.id, fx.peer.cookie.wb_session))
      const authorId = (await author.waitFor('joined')).connectionId
      const peerId = (await peer.waitFor('joined')).connectionId
      const token = await issueToken(ctx, fx.owner, fx.project.id)

      const intoAuthor = await editWithToken(ctx, fx, token, authorId)
      // 첫 방송이 룸을 다 돈 뒤에 둘째를 낸다(위 케이스와 같은 이유). `peer`가 마지막으로 넣은 연결이다.
      await peer.waitFor('page-changed')
      const intoPeer = await editWithToken(ctx, fx, token, peerId)

      const seqs = [intoAuthor, intoPeer]
      expect((await author.waitForCount('page-changed', 2)).map((frame) => frame.seq)).toEqual(seqs)
      expect((await peer.waitForCount('page-changed', 2)).map((frame) => frame.seq)).toEqual(seqs)
    })
  })
})

describe('무엇을 알리는가', () => {
  it('편집이 실패하면 아무것도 안 간다 — 성공 결과만 알린다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.peer.cookie.wb_session))

      const stale = await editPage(ctx, fx, fx.owner, { baseSeq: 99 })
      expect(stale.statusCode).toBe(409)

      expect(await watcher.quiet()).toEqual([])
    })
  })

  it('경고를 실어 나른다 — 접속 방식에 따라 보는 것이 갈리지 않는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.peer.cookie.wb_session))

      // `variant`를 받지 않는 컴포넌트에 `variant`를 얹으면 `ignored-variant`(warning)가
      // 나온다 — 저장은 통과한다.
      const put = await ctx.app.inject({
        method: 'PUT',
        url: `/api/projects/${fx.project.id}/pages/${fx.page.id}/schema`,
        cookies: fx.owner.cookie,
        payload: {
          schema: {
            version: 1,
            root: {
              id: 'n_root',
              type: 'Page',
              children: [{ id: 'n_warned', type: 'Text', variant: 'caption', props: { role: 'h2' } }],
            },
          },
        } as never,
      })
      expect(put.statusCode).toBe(200)

      const frame = await watcher.waitFor('page-changed')
      expect(frame.warnings.map((issue) => issue.code)).toEqual(['ignored-variant'])
    })
  })

  it('코멘트가 붙인 번호도 문서 변경으로 나간다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.peer.cookie.wb_session))
      const rootId = (fx.page.schema as { root: { id: string } }).root.id

      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.project.id}/pages/${fx.page.id}/comments`,
        cookies: fx.owner.cookie,
        payload: { nodeId: rootId, body: '여기 봐 주세요' },
      })
      expect(res.statusCode).toBe(201)

      const frame = await watcher.waitFor('page-changed')
      expect(frame.pageId).toBe(fx.page.id)
      expect(frame.ops).toEqual((res.json() as { markerOps: PatchOp[] }).markerOps)
    })
  })

  it('복원은 한 프레임으로 나간다 — 페이지마다가 아니다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const snapshot = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.project.id}/snapshots`,
        cookies: fx.owner.cookie,
        payload: { tag: 'v1' },
      })
      expect(snapshot.statusCode).toBe(201)
      const snapshotId = (snapshot.json() as { id: string }).id

      await editPage(ctx, fx, fx.owner)
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.peer.cookie.wb_session))

      const restore = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.project.id}/snapshots/${snapshotId}/restore`,
        cookies: fx.owner.cookie,
      })
      expect(restore.statusCode).toBe(200)

      const frame = await watcher.waitFor('restored')
      expect(frame.snapshotId).toBe(snapshotId)
      expect(watcher.received.filter((received) => received.type === 'page-changed')).toEqual([])
    })
  })

  /**
   * **프레임이 그 복원의 안전망 스냅샷 id 를 싣는다 — 응답의 것과 같은 값이다.** 복원이 연결 id 없이 나가 낸 사람이 되받으면 웹이 그 값으로
   * 내 복원을 알아본다(`apps/web`의 `EditorStore.markRestored`). 헤더 없이 낸 owner 의 소켓도 받는다 — 그 창이다.
   */
  it('복원 프레임이 응답과 같은 안전망 스냅샷 id 를 싣는다 — 연결 id 없이 낸 사람도 받는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const snapshot = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.project.id}/snapshots`,
        cookies: fx.owner.cookie,
        payload: { tag: 'v1' },
      })
      expect(snapshot.statusCode).toBe(201)
      const snapshotId = (snapshot.json() as { id: string }).id
      const mine = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))

      const restore = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.project.id}/snapshots/${snapshotId}/restore`,
        cookies: fx.owner.cookie,
      })
      expect(restore.statusCode).toBe(200)
      const safety = (restore.json() as { safetySnapshot: { id: string } }).safetySnapshot.id

      const frame = await mine.waitFor('restored')
      expect(frame.safetySnapshotId).toBe(safety)
    })
  })

  /**
   * **복원은 낸 연결도 빼지 않는다**(`ws/notify.ts`의 `notifyRestored`) — 답을 잃은 탭에게는 그 신호만이 서버가 복원했다는 것을 알린다
   * (`apps/web/build-test/editor-restore-signal-order.test.ts` «답을 잃음 · 다시 읽기보다 늦게 커밋»). 요청이 실은 복원 id 가 프레임으로 되돌아온다. 편집의 방송은 그대로 뺀다
   * (위 «자기 편집은 자기에게 돌아오지 않는다»).
   */
  it('연결 id 를 실은 복원도 그 연결에 신호를 보내고, 요청의 복원 id 를 싣는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const snapshot = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.project.id}/snapshots`,
        cookies: fx.owner.cookie,
        payload: { tag: 'v1' },
      })
      expect(snapshot.statusCode).toBe(201)
      const snapshotId = (snapshot.json() as { id: string }).id
      const mine = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.peer.cookie.wb_session))
      const joined = await mine.waitFor('joined')

      const restore = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.project.id}/snapshots/${snapshotId}/restore`,
        cookies: fx.owner.cookie,
        headers: { [CONNECTION_ID_HEADER]: joined.connectionId, [RESTORE_ID_HEADER]: 'rst-0f3a_B' },
      })
      expect(restore.statusCode).toBe(200)

      // 방송이 나간 것을 남의 연결로 본 뒤 낸 연결을 센다 — 안 오면 타임아웃이 아니라 값(`null`)으로 죽는다.
      await watcher.waitFor('restored')
      const frame = await mine.waitFor('restored', 1_000).catch(() => null)
      expect({ safety: frame?.safetySnapshotId, restoreId: frame?.clientRestoreId }).toEqual({
        safety: (restore.json() as { safetySnapshot: { id: string } }).safetySnapshot.id,
        restoreId: 'rst-0f3a_B',
      })
    })
  })

  /** 복원 id 는 룸의 모두에게 되비친다 — 꼴을 벗어난 값(길이 · 글자)은 안 실은 것으로 본다. */
  it('꼴이 틀린 복원 id 는 프레임에 안 실린다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.peer.cookie.wb_session))
      for (const bad of ['<b>x</b>', 'a'.repeat(65)]) {
        const snapshot = await ctx.app.inject({
          method: 'POST',
          url: `/api/projects/${fx.project.id}/snapshots`,
          cookies: fx.owner.cookie,
          payload: { tag: `v-${bad.length}` },
        })
        expect(snapshot.statusCode).toBe(201)
        const restore = await ctx.app.inject({
          method: 'POST',
          url: `/api/projects/${fx.project.id}/snapshots/${(snapshot.json() as { id: string }).id}/restore`,
          cookies: fx.owner.cookie,
          headers: { [RESTORE_ID_HEADER]: bad },
        })
        expect(restore.statusCode).toBe(200)
      }
      const frames = await watcher.waitForCount('restored', 2)
      expect(frames.map((frame) => 'clientRestoreId' in frame)).toEqual([false, false])
    })
  })
})

describe('연결·참가·이탈', () => {
  it('둘째가 붙으면 첫째가 참가자 둘을 받는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const first = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))
      await first.waitFor('presence')

      track(await joinRoom(ctx.port, fx.project.id, fx.peer.cookie.wb_session))

      const frames = await first.waitForCount('presence', 2)
      expect(frames.at(-1)?.participants.map((participant) => participant.userId)).toEqual([
        fx.owner.user.id,
        fx.peer.user.id,
      ])
    })
  })

  it('하나가 나가면 남은 쪽이 그것을 받는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const stays = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))
      const leaves = track(await joinRoom(ctx.port, fx.project.id, fx.peer.cookie.wb_session))
      await stays.waitForCount('presence', 2)

      leaves.close()

      const frames = await stays.waitForCount('presence', 3)
      expect(frames.at(-1)?.participants.map((participant) => participant.userId)).toEqual([fx.owner.user.id])
    })
  })

  /**
   * **presence 는 보내는 순간의 룸을 싣는다**(`broadcast.ts`의 `announcePresence`). 회수가 겹쳐 presence 방송이 겹쳐 돌면 부를 때
   * 지은 목록이 뒤에 지은 목록을 추월해 나간 사람을 든 채 마지막 프레임으로 남는다 — 그 겹침은 흔들려서, 같은 기전을 방송 하나
   * 안에서 잰다: 부른 뒤 첫 연결의 자격을 재는(await) 사이에 나간 연결은 그 방송에 안 실린다.
   */
  it('presence 는 보내는 순간의 룸을 싣는다 — 부른 뒤 보내기 전에 나간 연결은 안 싣는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))
      track(await joinRoom(ctx.port, fx.project.id, fx.peer.cookie.wb_session))
      await watcher.waitForCount('presence', 2)
      const { rooms, broadcast } = ctx.app.realtime
      const gone = rooms.membersOf(fx.project.id).find((connection) => connection.userId === fx.peer.user.id)!

      const announced = broadcast.announcePresence(fx.project.id)
      rooms.leave(fx.project.id, gone.id)
      await announced

      const frames = await watcher.waitForCount('presence', 3)
      expect(frames[2]!.participants.map((participant) => participant.userId)).toEqual([fx.owner.user.id])
    })
  })

  it('모두 나가면 룸이 남지 않는다 — 연 프로젝트만큼 자라는 누수가 아니다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const a = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))
      const b = track(await joinRoom(ctx.port, fx.other.id, fx.owner.cookie.wb_session))
      expect(ctx.app.realtime.rooms.roomCount()).toBe(2)

      a.close()
      b.close()

      await waitUntil(() => ctx.app.realtime.rooms.roomCount() === 0)
      expect(ctx.app.realtime.rooms.roomCount()).toBe(0)
    })
  })
})

describe('보내기 직전에 권한을 다시 본다 (확인 지점 2)', () => {
  /**
   * **`ws-auth.test.ts`가 재는 것과 다른 자리다.** 그쪽은 *"프레임을 보내면"* 회수된다를
   * 재고, 여기는 **아무것도 안 보내는 연결**이 회수되는지를 잰다. 화면은 대개 아무것도 안
   * 보내고 있으므로 이쪽이 실제 상황이다.
   */
  it('세션이 사라진 연결은 브로드캐스트를 못 받고 닫힌다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const revoked = track(await joinRoom(ctx.port, fx.project.id, fx.peer.cookie.wb_session))
      const kept = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))

      await db.deleteFrom('sessions').where('user_id', '=', fx.peer.user.id).execute()
      await editPage(ctx, fx, fx.owner)

      // 살아 있는 쪽은 받는다 — 이것이 없으면 *"둘 다 못 받았다"*와 구분되지 않는다.
      await kept.waitFor('page-changed')
      const closed = await revoked.waitClosed()
      expect(closed.code).toBe(4403)
      expect(revoked.received.filter((frame) => frame.type === 'page-changed')).toEqual([])
    })
  })

  /**
   * **회수할 연결이 여럿이어도 연결마다 한 번만 회수한다**(`broadcast.ts`의 `deliver` — «await 뒤에 룸에 아직 있는지 본다»).
   * 회수마다 `onRevoked`가 presence 방송을 내고 그 방송이 도는 사본에는 아직 안 빠진 회수 연결이 들어 있어, 가르지 않으면 방송
   * 하나가 연결마다 여러 번 회수하고 presence 방송이 회수 수의 제곱 남짓으로 는다. 그 방송마다 연결마다 질의 둘이라 서버 전체가
   * 느려진다 — 다른 요청의 지연은 붐비는 기계에서 흔들려 자로 안 쓰고, 그 원인인 수를 잰다. 가르면 presence 는 연결마다
   * `onRevoked` 한 번과 닫힘 이벤트 한 번이다.
   */
  it('회수할 연결이 여럿이면 방송 하나가 연결마다 한 번만 회수하고 presence 는 회수 수의 두 배를 안 넘는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const kept = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))
      track(await joinRoom(ctx.port, fx.project.id, fx.peer.cookie.wb_session))
      const revokedUsers: SignedUpUser[] = []
      const revokedTabs: WsProbe[] = []
      for (let i = 0; i < 4; i += 1) {
        const user = await signup(ctx)
        await addMember(ctx, fx.project.id, user.user.id, 'editor')
        revokedUsers.push(user)
        revokedTabs.push(track(await joinRoom(ctx.port, fx.project.id, user.cookie.wb_session)))
      }
      await kept.waitForCount('presence', 6)

      const { rooms, broadcast } = ctx.app.realtime
      const revokedIds = new Set(revokedUsers.map((user) => user.user.id))
      const revocations = new Map<string, number>()
      for (const connection of rooms.membersOf(fx.project.id)) {
        if (!revokedIds.has(connection.userId)) continue
        const closeWhenIdle = connection.closeWhenIdle.bind(connection)
        connection.closeWhenIdle = (code, reason) => {
          revocations.set(connection.id, (revocations.get(connection.id) ?? 0) + 1)
          closeWhenIdle(code, reason)
        }
      }
      let presenceCalls = 0
      const announcePresence = broadcast.announcePresence.bind(broadcast)
      broadcast.announcePresence = (projectId) => {
        presenceCalls += 1
        return announcePresence(projectId)
      }

      await db.deleteFrom('sessions').where('user_id', 'in', [...revokedIds]).execute()
      await editPage(ctx, fx, fx.owner)

      for (const tab of revokedTabs) expect((await tab.waitClosed()).code).toBe(4403)
      // 닫힘 이벤트의 presence 까지 다 난 뒤에 센다 — 수가 200ms 동안 안 바뀌면 끝난 것으로 본다.
      let seen = -1
      while (seen !== presenceCalls) {
        seen = presenceCalls
        await new Promise((resolve) => setTimeout(resolve, 200))
      }
      expect([...revocations.values()]).toEqual([1, 1, 1, 1])
      expect(presenceCalls).toBeLessThanOrEqual(2 * revokedTabs.length)
      const last = kept.received.filter((frame) => frame.type === 'presence').at(-1)
      expect(last?.type === 'presence' && last.participants.map((participant) => participant.userId)).toEqual([
        fx.owner.user.id,
        fx.peer.user.id,
      ])
    })
  })
})

async function waitUntil(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('조건이 창 안에 참이 되지 않았습니다')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}
