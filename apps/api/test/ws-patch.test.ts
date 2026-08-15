/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withRealApi`를 쓴다 —
 * `inject()`는 소켓을 만들지 않아 `patch` 프레임을 태울 수 없다.
 *
 * ---
 *
 * # 무엇을 재는가 (P3-2 T1·T2 · §7.1)
 *
 * §7.1의 서버 쪽 절반이 WebSocket으로 들어오는 판이다.
 *
 * ```
 * [클라] WS 전송 { pageId, baseSeq, ops[], clientOpId }
 * [서버] 권한 확인(editor+) → … → 룸 broadcast
 * [본인] ack(seq) 수신
 * ```
 *
 * # 하나짜리로 재지 않는다
 *
 * | 무엇을 여럿으로 두나 | 그것이 없으면 무엇이 안 죽나 |
 * |---|---|
 * | 연결 둘 | 발신자 제외를 지워도, ack를 룸 전체에 흘려도 안 죽는다 |
 * | 프로젝트 둘 | 프레임의 `pageId`를 **연결의 프로젝트와 무관하게** 열어 두어도 안 죽는다(§10) |
 * | `clientOpId` 여럿 | ack가 엉뚱한 편집의 것을 되돌려 줘도 안 죽는다 |
 *
 * # 역할 판정이 이 파일의 첫째다 (D1)
 *
 * 앞 슬라이스에는 WS 경로 어디에도 `editor` 판정이 없었다 — 받는 기준(`viewer`)이 프레임
 * 수신 검사도 겸했다. §10은 viewer를 *"조회 전용 — 편집·코멘트 모두 불가"*로 못박았다.
 * **뷰어가 내면 거절되고 에디터가 내면 통과하는 판을 함께 둔다** — 한쪽만 재면 *"아무도 못
 * 낸다"*와 구분되지 않는다.
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
  /** 같은 프로젝트의 **에디터**. 편집을 낼 수 있다. */
  editor: SignedUpUser
  /** 같은 프로젝트의 **뷰어**. §10이 편집을 막는다. */
  viewer: SignedUpUser
  project: CreatedProject
  page: CreatedPage
  /** **다른** 프로젝트. owner가 그쪽에서도 owner다 — 막는 것은 역할이 아니라 룸 경계다. */
  other: CreatedProject
  otherPage: CreatedPage
}

async function board(ctx: RealApiContext): Promise<Board> {
  const owner = await signup(ctx)
  const editor = await signup(ctx)
  const viewer = await signup(ctx)

  const project = await createProject(ctx, owner.cookie)
  await addMember(ctx, project.id, editor.user.id, 'editor')
  await addMember(ctx, project.id, viewer.user.id, 'viewer')
  const menu = await createMenuNode(ctx, owner.cookie, project.id)
  const page = await createPage(ctx, owner.cookie, project.id, menu.id, { title: '고칠 페이지' })

  const other = await createProject(ctx, owner.cookie)
  const otherMenu = await createMenuNode(ctx, owner.cookie, other.id)
  const otherPage = await createPage(ctx, owner.cookie, other.id, otherMenu.id, { title: '남의 프로젝트 페이지' })

  return {
    owner,
    editor,
    viewer,
    project,
    page,
    other,
    otherPage,
  }
}

async function headSeqOf(pageId: string): Promise<number> {
  const row = await db.selectFrom('pages').select('head_seq').where('id', '=', pageId).executeTakeFirstOrThrow()
  return Number(row.head_seq)
}

function addNode(id: string): PatchOp[] {
  return [{ op: 'add', path: '/root/children/-', value: { id, type: 'Text', props: {} } }]
}

/**
 * **참가 알림이 끝나기를 기다린다.** `joinRoom`은 `joined`까지만 기다리는데 그 뒤에
 * `announcePresence`가 따로 돌고, 그 브로드캐스트도 연결마다 자격을 **다시 본다**
 * (`ws/broadcast.ts`). 그것이 도는 **동안** 권한을 지우면 그 자리에서 연결이 닫혀
 * `4403`이 오는데, **그것은 patch 프레임이 만든 회수가 아니다.**
 *
 * 리뷰가 그 창을 값으로 잡았다 — 회수/거절 가르기를 지운 변이가 3회 중 1회 살아남았다.
 * `presence`를 받으면 그 브로드캐스트의 자격 확인이 이 연결에 대해 이미 끝난 것이므로,
 * 그 뒤의 `4403`은 **프레임이 만든 것**이다.
 */
async function settleJoin(probe: WsProbe): Promise<void> {
  await probe.waitFor('presence')
}

/**
 * **회수는 답하지 않는다 — 거절은 닫지 않는다.** 두 갈래가 서로 배타적이라는 것을 회수 판이
 * 양쪽으로 단언한다.
 *
 * **닫힘만 보면 구분력이 창에 매인다**(리뷰가 쟀다: 가르기를 지운 변이가 3회 중 1회 살아남았고,
 * 그 케이스는 `waitClosed`의 3초 창에 걸려 있었다). 거절 구현에서는 `patch-error`가 반드시
 * 오므로, **그 프레임이 없다는 것**이 창과 무관한 판정이다.
 */
function expectRevokedNotRefused(probe: WsProbe): void {
  expect(probe.received.filter((frame) => frame.type === 'patch-error')).toEqual([])
}

/** `patch` 프레임 하나를 보낸다. */
function sendPatch(
  probe: WsProbe,
  input: { pageId: string; baseSeq: number; ops: PatchOp[]; clientOpId: string },
): void {
  probe.send(JSON.stringify({ type: 'patch', ...input }))
}

describe('patch 프레임에는 editor 이상이 필요하다 (D1 · §10)', () => {
  it('에디터가 내면 통과한다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const probe = track(await joinRoom(ctx.port, fx.project.id, fx.editor.cookie.wb_session))

      sendPatch(probe, {
        pageId: fx.page.id,
        baseSeq: await headSeqOf(fx.page.id),
        ops: addNode('n_by_editor'),
        clientOpId: 'op_editor',
      })

      const ack = await probe.waitFor('patch-ack')
      expect(ack.clientOpId).toBe('op_editor')
      expect(ack.seq).toBe(await headSeqOf(fx.page.id))
    })
  })

  it('뷰어가 내면 거절된다 — 그리고 문서가 안 바뀐다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const probe = track(await joinRoom(ctx.port, fx.project.id, fx.viewer.cookie.wb_session))
      const before = await headSeqOf(fx.page.id)

      sendPatch(probe, {
        pageId: fx.page.id,
        baseSeq: before,
        ops: addNode('n_by_viewer'),
        clientOpId: 'op_viewer',
      })

      const error = await probe.waitFor('patch-error')
      expect(error.status).toBe(403)
      expect(error.clientOpId).toBe('op_viewer')
      expect(await headSeqOf(fx.page.id)).toBe(before)
    })
  })

  /**
   * **거절과 회수를 가른다.** 뷰어가 편집을 낸 것은 *"권한이 회수됐다"*가 아니다 — 그 연결은
   * 남의 편집을 계속 받아야 한다(`ws/broadcast.ts`의 `MIN_ROLE_TO_RECEIVE`). 닫아 버리면
   * 조회 전용 사용자가 편집 버튼을 한 번 잘못 누른 것으로 실시간을 잃는다.
   */
  it('거절된 뷰어의 연결은 살아 있다 — 회수가 아니다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const probe = track(await joinRoom(ctx.port, fx.project.id, fx.viewer.cookie.wb_session))

      sendPatch(probe, {
        pageId: fx.page.id,
        baseSeq: await headSeqOf(fx.page.id),
        ops: addNode('n_by_viewer'),
        clientOpId: 'op_viewer',
      })
      await probe.waitFor('patch-error')
      probe.send(JSON.stringify({ type: 'ping' }))

      await probe.waitFor('pong')
      expect(probe.closeInfo).toBeNull()
    })
  })

  /**
   * **거절의 반대편 — 회수는 연결을 닫는다**(§10의 *"세션 행을 지우면 열려 있는 WS 연결의
   * 권한도 즉시 회수된다"*).
   *
   * **리뷰가 뚫은 자리다(F2).** 회수를 재던 케이스(`ws-auth.test.ts` 셋)는 전부 `ping`을
   * 쓰는데 `ping`의 최소 역할은 룸에 들어올 자격과 같아 **가르는 갈래를 아예 안 지난다.**
   * 그리고 위 뷰어 판은 멤버십이 살아 있어 그 갈래가 어느 구현에서든 통과한다. 그래서
   * *"회수된 사람이 patch를 냈다"*는 판이 없었고, 가르기를 지워도 **아무도 안 죽었다.**
   *
   * 그 갈래가 없으면 회수된 연결이 **룸에 남아** patch-error만 받는다 — 다음 브로드캐스트가
   * 다시 쫓아낼 때까지 남의 편집을 계속 본다.
   */
  it('회수된 연결이 patch를 내면 닫힌다 — 거절이 아니라 회수다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const probe = track(await joinRoom(ctx.port, fx.project.id, fx.editor.cookie.wb_session))
      await settleJoin(probe)

      await db
        .deleteFrom('project_members')
        .where('project_id', '=', fx.project.id)
        .where('user_id', '=', fx.editor.user.id)
        .execute()
      sendPatch(probe, {
        pageId: fx.page.id,
        baseSeq: await headSeqOf(fx.page.id),
        ops: addNode('n_revoked'),
        clientOpId: 'op_revoked',
      })

      expect((await probe.waitClosed()).code).toBe(4403)
      expectRevokedNotRefused(probe)
    })
  })

  /** 세션이 사라진 판도 같은 자리다 — 멤버십만이 아니다. */
  it('세션이 사라진 연결이 patch를 내도 닫힌다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const probe = track(await joinRoom(ctx.port, fx.project.id, fx.editor.cookie.wb_session))
      await settleJoin(probe)

      await ctx.db.deleteFrom('sessions').where('user_id', '=', fx.editor.user.id).execute()
      sendPatch(probe, {
        pageId: fx.page.id,
        baseSeq: await headSeqOf(fx.page.id),
        ops: addNode('n_revoked'),
        clientOpId: 'op_revoked',
      })

      expect((await probe.waitClosed()).code).toBe(4403)
      expectRevokedNotRefused(probe)
    })
  })

  /**
   * **음성 대조.** 뷰어가 `ping`은 그대로 낼 수 있다 — 위 거절이 *"뷰어는 아무 프레임도 못
   * 낸다"*로 통과하지 않는다.
   */
  it('뷰어의 ping은 그대로 통과한다 — 음성 대조', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const probe = track(await joinRoom(ctx.port, fx.project.id, fx.viewer.cookie.wb_session))

      probe.send(JSON.stringify({ type: 'ping' }))

      await probe.waitFor('pong')
    })
  })
})

describe('프레임 규격은 REST 본문에서 온다 (D2)', () => {
  /**
   * **`clientOpId`가 필수인 것이 두 진입점이 갈리는 유일한 자리다.** REST에서는 없어도 되지만
   * (서버가 응답에 되돌려 줄 뿐이다) 여기서는 ack가 프레임이라 **짝지을 것이 이 값뿐**이다.
   * 없으면 되돌려 줄 `patch-error`조차 어느 편집의 것인지 말할 수 없어 연결을 닫는다.
   */
  it('clientOpId가 없으면 프레임을 못 읽는다 — 나머지가 다 맞아도', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const probe = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))
      const before = await headSeqOf(fx.page.id)

      probe.send(
        JSON.stringify({ type: 'patch', pageId: fx.page.id, baseSeq: before, ops: addNode('n_no_id') }),
      )

      expect((await probe.waitClosed()).code).toBe(4400)
      expect(await headSeqOf(fx.page.id)).toBe(before)
    })
  })

  /**
   * **REST의 상한을 그대로 쓴다**(`http/patch-ops.ts`의 `ops는 200개 이하`). 두 벌을 만들면
   * *"REST로는 되는데 WS로는 안 되는"* 입력이 생기고, 그 어긋남은 **접속 방식에 따라 갈린다.**
   */
  it('ops 상한이 REST와 같다 — 넘으면 프레임을 못 읽는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const probe = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))

      sendPatch(probe, {
        pageId: fx.page.id,
        baseSeq: await headSeqOf(fx.page.id),
        ops: Array.from({ length: 201 }, (_unused, index) => addNode(`n_${index}`)[0]!),
        clientOpId: 'op_too_many',
      })

      expect((await probe.waitClosed()).code).toBe(4400)
    })
  })

  /**
   * **음성 대조.** 상한 안이면 통과한다 — 위 케이스가 *"ops가 여럿이면 못 읽는다"*로
   * 통과하지 않는다.
   */
  it('상한 안의 여러 ops는 그대로 통과한다 — 음성 대조', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const probe = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))

      sendPatch(probe, {
        pageId: fx.page.id,
        baseSeq: await headSeqOf(fx.page.id),
        ops: Array.from({ length: 200 }, (_unused, index) => addNode(`n_${index}`)[0]!),
        clientOpId: 'op_many',
      })

      await probe.waitFor('patch-ack')
    })
  })
})

describe('ack가 되돌려 주는 것 (D4 · §7.1)', () => {
  it('undo가 필요로 하는 것을 전부 싣는다 — REST 응답과 같은 값이다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const probe = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))
      const baseSeq = await headSeqOf(fx.page.id)

      sendPatch(probe, { pageId: fx.page.id, baseSeq, ops: addNode('n_acked'), clientOpId: 'op_1' })

      const ack = await probe.waitFor('patch-ack')
      expect(ack.seq).toBe(baseSeq + 1)
      expect(ack.revisionId).toMatch(/./)
      // 서버가 만든 역패치다(§7.1) — 클라이언트가 계산하지 않는다.
      expect(ack.inverse).toEqual([{ op: 'remove', path: '/root/children/0' }])
      expect(ack.warnings).toEqual([])
    })
  })

  /**
   * **경고를 싣는다**(P4a-3). `variant`를 받지 않는 컴포넌트에 `variant`를 얹으면
   * `ignored-variant`가 나오고 저장은 통과한다. 한쪽 경로만 나르면 사용자가 보는 것이
   * **접속 방식에 따라 갈린다.**
   */
  it('경고를 싣는다 — REST 응답만 나르면 접속 방식에 따라 갈린다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const probe = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))

      sendPatch(probe, {
        pageId: fx.page.id,
        baseSeq: await headSeqOf(fx.page.id),
        ops: [
          {
            op: 'add',
            path: '/root/children/-',
            value: { id: 'n_warned', type: 'Text', variant: 'caption', props: { role: 'h2' } },
          },
        ],
        clientOpId: 'op_warned',
      })

      const ack = await probe.waitFor('patch-ack')
      expect(ack.warnings.map((issue) => issue.code)).toEqual(['ignored-variant'])
    })
  })

  /**
   * **`clientOpId` 여럿.** 하나짜리로 재면 ack가 어느 편집의 것인지 안 봐도 통과한다 —
   * 되돌려 주는 값을 프레임에서 고정으로 만들어도 안 죽는다.
   */
  it('ack가 낸 편집마다 자기 clientOpId를 되돌려 준다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const probe = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))
      const baseSeq = await headSeqOf(fx.page.id)

      // **한 번에 하나씩 보낸다.** 서버는 `baseSeq`가 `head_seq`와 정확히 같을 때만 받으므로
      // (파이프라인 3단계) 앞의 ack를 받아야 다음 `baseSeq`가 정해진다.
      sendPatch(probe, { pageId: fx.page.id, baseSeq, ops: addNode('n_a'), clientOpId: 'op_a' })
      await probe.waitFor('patch-ack')
      sendPatch(probe, { pageId: fx.page.id, baseSeq: baseSeq + 1, ops: addNode('n_b'), clientOpId: 'op_b' })
      await probe.waitForCount('patch-ack', 2)
      sendPatch(probe, { pageId: fx.page.id, baseSeq: baseSeq + 2, ops: addNode('n_c'), clientOpId: 'op_c' })

      const acks = await probe.waitForCount('patch-ack', 3)
      expect(acks.map((frame) => frame.clientOpId)).toEqual(['op_a', 'op_b', 'op_c'])
      expect(acks.map((frame) => frame.seq)).toEqual([baseSeq + 1, baseSeq + 2, baseSeq + 3])
    })
  })
})

describe('실패는 봉투로 되돌아온다 — REST와 같은 표다', () => {
  it('baseSeq가 어긋나면 409다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const probe = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))

      sendPatch(probe, { pageId: fx.page.id, baseSeq: 99, ops: addNode('n_stale'), clientOpId: 'op_stale' })

      const error = await probe.waitFor('patch-error')
      expect(error.status).toBe(409)
      expect(error.code).toBe('conflict')
      expect(error.clientOpId).toBe('op_stale')
    })
  })

  it('얹을 수 없는 ops도 409다 — 본문은 계약을 지켰다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const probe = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))

      sendPatch(probe, {
        pageId: fx.page.id,
        baseSeq: await headSeqOf(fx.page.id),
        ops: [{ op: 'replace', path: '/root/children/9/type', value: 'Text' }],
        clientOpId: 'op_bad_path',
      })

      const error = await probe.waitFor('patch-error')
      expect(error.status).toBe(409)
    })
  })

  it('카탈로그를 어기면 422이고 issues가 실린다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const probe = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))

      sendPatch(probe, {
        pageId: fx.page.id,
        baseSeq: await headSeqOf(fx.page.id),
        ops: [{ op: 'add', path: '/root/children/-', value: { id: 'n_x', type: '없는타입', props: {} } }],
        clientOpId: 'op_invalid',
      })

      const error = await probe.waitFor('patch-error')
      expect(error.status).toBe(422)
      expect(error.issues.map((issue) => issue.code)).toContain('unknown-type')
    })
  })

  /**
   * **§10의 경계가 WS 편집 경로로 새지 않는다.** owner는 저쪽 프로젝트에서도 owner이므로
   * 막는 것은 역할이 아니라 **연결이 어느 룸에 있는가**다 — `applyEdit`이 받는 `projectId`가
   * 프레임이 아니라 연결에서 온다는 것이 이 케이스가 재는 것이다.
   */
  it('다른 프로젝트의 페이지는 이 연결로 못 고친다 — 404다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const probe = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))
      const before = await headSeqOf(fx.otherPage.id)

      sendPatch(probe, {
        pageId: fx.otherPage.id,
        baseSeq: before,
        ops: addNode('n_crossed'),
        clientOpId: 'op_cross',
      })

      const error = await probe.waitFor('patch-error')
      expect(error.status).toBe(404)
      expect(await headSeqOf(fx.otherPage.id)).toBe(before)
    })
  })

  /**
   * **음성 대조.** 같은 owner가 **저쪽 룸에 붙어서** 내면 통과한다 — 위 404가
   * *"owner라도 못 고친다"*로 통과하지 않는다.
   */
  it('그 프로젝트 룸에 붙으면 같은 사람이 같은 페이지를 고친다 — 음성 대조', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const probe = track(await joinRoom(ctx.port, fx.other.id, fx.owner.cookie.wb_session))

      sendPatch(probe, {
        pageId: fx.otherPage.id,
        baseSeq: await headSeqOf(fx.otherPage.id),
        ops: addNode('n_crossed'),
        clientOpId: 'op_cross',
      })

      await probe.waitFor('patch-ack')
    })
  })
})

describe('예상 밖 예외에도 낸 사람은 답을 받는다 (리뷰 F4)', () => {
  /**
   * **답이 없으면 클라이언트가 조용히 멈춘다.** 편집 하나가 응답을 못 받으면 그 `Promise`가
   * 영영 안 끝나고, in-flight를 하나로 지키는 펌프가 거기 매달려 **다음 편집도 안 나간다**
   * (`apps/web`의 `realtime/edit-channel.ts`가 그 부류를 머리말에 적었다).
   *
   * **REST 경로는 같은 예외에 500 봉투가 나간다** — 두 진입점의 결말을 맞춘다.
   *
   * 파이프라인의 모든 실패는 값(`outcome`)으로 돌아오므로 **예상 밖 예외를 내는 입력은 없다.**
   * 그래서 자격 확인을 던지게 바꿔 그 갈래를 지나간다 — 재는 것은 *"무엇이 던졌나"*가 아니라
   * *"던졌을 때 낸 사람이 답을 받는가"*다.
   */
  it('처리가 던져도 patch-error가 온다 — 매달아 두지 않는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const probe = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))
      const realtime = ctx.app.realtime
      const original = realtime.broadcast.stillAllowed
      realtime.broadcast.stillAllowed = () => {
        throw new Error('예상 밖 예외 [F4]')
      }

      try {
        sendPatch(probe, {
          pageId: fx.page.id,
          baseSeq: await headSeqOf(fx.page.id),
          ops: addNode('n_boom'),
          clientOpId: 'op_boom',
        })

        const error = await probe.waitFor('patch-error')
        expect(error.status).toBe(500)
        expect(error.clientOpId).toBe('op_boom')
        expect(probe.closeInfo).toBeNull()
      } finally {
        realtime.broadcast.stillAllowed = original
      }
    })
  })

  /**
   * **음성 대조.** `ping`은 되돌려 줄 짝이 없으므로 아무것도 안 낸다 — 위 케이스가
   * *"던지면 늘 프레임을 낸다"*로 통과하지 않는다.
   */
  it('ping이 던지면 아무것도 안 낸다 — 짝지을 것이 없다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const probe = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))
      const realtime = ctx.app.realtime
      const original = realtime.broadcast.stillAllowed
      realtime.broadcast.stillAllowed = () => {
        throw new Error('예상 밖 예외 [F4]')
      }

      try {
        probe.send(JSON.stringify({ type: 'ping' }))

        const quiet = await probe.quiet()
        // `presence`는 참가 알림이라 이 창에 섞일 수 있다. 재는 것은 **답이 없다**는 것이다.
        expect(quiet.filter((f) => f.type === 'patch-error' || f.type === 'pong')).toEqual([])
      } finally {
        realtime.broadcast.stillAllowed = original
      }
    })
  })
})

describe('WS로 들어온 편집도 룸에 나간다 (D5)', () => {
  it('남은 page-changed를 받고 낸 사람은 안 받는다 — 연결이 곧 발신자다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const author = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.editor.cookie.wb_session))

      await sendBroadcastPatch(author, fx)

      const frame = await watcher.waitFor('page-changed')
      expect(frame.pageId).toBe(fx.page.id)
      expect(frame.ops).toEqual(addNode('n_broadcast'))
      // 낸 사람은 ack만 받는다 — 자기 ops가 되돌아오면 낙관적으로 이미 얹은 것을 또 얹는다.
      await author.waitFor('patch-ack')
      expect(author.received.filter((received) => received.type === 'page-changed')).toEqual([])
    })
  })

  /**
   * **음성 대조.** 낸 사람이 자기 프레임을 안 받는 것이 *"룸에 아무것도 안 나간다"*가
   * 아니라는 것을 보인다 — 두 번째 연결이 낸 편집은 첫 번째가 받는다.
   */
  it('상대가 내면 이쪽이 받는다 — 음성 대조', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const author = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.editor.cookie.wb_session))

      await sendBroadcastPatch(watcher, fx)

      const frame = await author.waitFor('page-changed')
      expect(frame.actor.label).toBe(fx.editor.user.name)
    })
  })

  /**
   * **되받기 창을 닫는 값**(P3-2). 서버가 발신자를 제외하지 못하는 판이 있다 — 편집이 REST로
   * 나가는데 `x-wb-connection-id`가 없을 때다(소켓이 아직 안 열렸다). 그때 그 사람의 소켓이
   * 열려 룸에 들어오면 **자기 편집을 되받고**, 받는 쪽의 리베이스가 그것을 두 번 얹는다.
   *
   * **여기서 재는 것은 그 프레임에 `clientOpId`가 실린다는 것**이다 — 받는 쪽이 그것으로
   * 자기 편집을 알아본다(`apps/web`의 `store/editor-store.ts`).
   */
  it('REST로 낸 편집의 프레임도 clientOpId를 나른다 — 헤더가 없어도', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.editor.cookie.wb_session))

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.project.id}/pages/${fx.page.id}/ops`,
        cookies: fx.owner.cookie,
        payload: { baseSeq: await headSeqOf(fx.page.id), ops: addNode('n_rest'), clientOpId: 'op_rest' },
      })
      expect(res.statusCode).toBe(200)

      const frame = await watcher.waitFor('page-changed')
      expect(frame.clientOpId).toBe('op_rest')
    })
  })

  /**
   * **음성 대조.** 안 보낸 편집의 프레임에는 그 키가 없다 — 서버가 만들어 내는 값이 아니다.
   */
  it('clientOpId 없이 낸 편집의 프레임에는 그 키가 없다 — 음성 대조', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.editor.cookie.wb_session))

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.project.id}/pages/${fx.page.id}/ops`,
        cookies: fx.owner.cookie,
        payload: { baseSeq: await headSeqOf(fx.page.id), ops: addNode('n_rest') },
      })
      expect(res.statusCode).toBe(200)

      const frame = await watcher.waitFor('page-changed')
      expect(Object.keys(frame)).not.toContain('clientOpId')
    })
  })

  it('ack는 낸 사람에게만 간다 — 룸에 흘리지 않는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await board(ctx)
      const author = track(await joinRoom(ctx.port, fx.project.id, fx.owner.cookie.wb_session))
      const watcher = track(await joinRoom(ctx.port, fx.project.id, fx.editor.cookie.wb_session))

      await sendBroadcastPatch(author, fx)
      await author.waitFor('patch-ack')

      await watcher.quiet()
      expect(watcher.received.filter((received) => received.type === 'patch-ack')).toEqual([])
    })
  })
})

/** 위 셋이 같은 편집을 낸다 — 재는 것이 프레임 내용이 아니라 **누가 받는가**이기 때문이다. */
async function sendBroadcastPatch(probe: WsProbe, fx: Board): Promise<void> {
  sendPatch(probe, {
    pageId: fx.page.id,
    baseSeq: await headSeqOf(fx.page.id),
    ops: addNode('n_broadcast'),
    clientOpId: 'op_broadcast',
  })
}
