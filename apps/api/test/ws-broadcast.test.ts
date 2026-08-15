/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withRealApi`를 쓴다.
 *
 * ---
 *
 * # 하나짜리로 재지 않는다 (P3-1 T3)
 *
 * **브로드캐스트는 받는 사람이 둘 이상일 때만 뜻이 있다.** 연결 하나로 재면 *"자리 0"*이
 * 되어 룸을 섞어도 안 죽는다 — 보낼 상대가 자기밖에 없으니 어느 룸에 넣든 같은 결과다.
 * 그래서 이 파일의 판은 항상 **연결 둘 이상 · 프로젝트 둘 · 페이지 여럿**이다.
 *
 * | 무엇을 여럿으로 두나 | 그것이 없으면 무엇이 안 죽나 |
 * |---|---|
 * | 연결 둘 | 발신자 제외(`exceptConnectionId`)를 지워도 안 죽는다 |
 * | 프로젝트 둘 | 룸 키를 무시하고 **모두에게** 보내도 안 죽는다 |
 * | 페이지 여럿 | 프레임에서 `pageId`를 빼도 안 죽는다 |
 *
 * # 무엇을 알리는가 (D4)
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
import { CONNECTION_ID_HEADER } from '../src/ws/notify'
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
  /** 이 프로젝트의 페이지 둘. 하나를 고치면 다른 하나를 연 사람도 룸에서 받는다(D2). */
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

let nodeCounter = 0

function nodeId(): string {
  nodeCounter += 1
  return `n_ws${nodeCounter}`
}

async function headSeqOf(pageId: string): Promise<number> {
  const row = await db.selectFrom('pages').select('head_seq').where('id', '=', pageId).executeTakeFirstOrThrow()
  return Number(row.head_seq)
}

describe('룸 하나가 프로젝트 하나다 (D2)', () => {
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

describe('자기 편집은 자기에게 돌아오지 않는다 (§7.1)', () => {
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
   * 그러면 `exceptConnectionId`를 아예 지워도 안 죽는다.
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
})

describe('무엇을 알리는가 (D4)', () => {
  it('편집이 실패하면 아무것도 안 간다 — 성공 결과만 알린다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.peer.cookie.wb_session))

      const stale = await editPage(ctx, fx, fx.owner, { baseSeq: 99 })
      expect(stale.statusCode).toBe(409)

      expect(await watcher.quiet()).toEqual([])
    })
  })

  it('경고를 실어 나른다 — 접속 방식에 따라 보는 것이 갈리지 않는다 (사실 2)', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.peer.cookie.wb_session))

      // `variant`를 받지 않는 컴포넌트에 `variant`를 얹으면 `ignored-variant`(warning)가
      // 나온다 — 저장은 통과한다(P4a-3).
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

  it('코멘트가 붙인 번호도 문서 변경으로 나간다 (사실 4 — P5-1 이월)', async () => {
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

  it('복원은 한 프레임으로 나간다 — 페이지마다가 아니다 (P6-2 이월 §9)', async () => {
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
})

describe('연결·참가·이탈 (D4의 셋째)', () => {
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

describe('보내기 직전에 권한을 다시 본다 (D5의 확인 지점 2)', () => {
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
})

async function waitUntil(predicate: () => boolean, timeoutMs = 3000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('조건이 창 안에 참이 되지 않았습니다')
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
}
