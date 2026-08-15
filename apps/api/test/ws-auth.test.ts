/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withRealApi`를 쓴다 —
 * `inject()`는 소켓을 만들지 않아 업그레이드를 태울 수 없다.
 *
 * ---
 *
 * # 무엇을 재는가 (P3-1 T2 · D5 · §10)
 *
 * §10이 WS 인증에 대해 세 문장을 적었고 **아무도 재지 않았다**(계획서 재라 #3).
 *
 * | §10의 문장 | 여기서 재는 것 |
 * |---|---|
 * | *"핸드셰이크도 같은 쿠키를 쓴다"* | 쿠키 없이 붙으면 101이 오지 않는다 |
 * | *"REST와 WS가 동일한 가드 함수를 쓴다"* | 비멤버는 붙지 못하고, 뷰어는 붙는다 — REST의 404/403 규칙과 같은 판정이다 |
 * | *"세션 행을 지우면 열려 있는 WS 연결의 권한도 즉시 회수된다"* | 세션을 지운 뒤 프레임을 보내면 그 연결이 닫힌다 |
 *
 * **셋째 줄이 P3-1의 판정이었다.** §10은 *"룸 참가 시 한 번, 각 patch 수신 시 한 번"*
 * 이라고 적었는데 그 슬라이스에는 patch 수신이 없어(D6) 회수를 실행하는 자리를 둘로 두었다
 * (`ws/routes.ts` 머리말). **P3-2가 patch 수신을 얹으면서 그 문장이 글자 그대로 참이 됐다** —
 * 여기서는 그중 **프레임 수신** 쪽을 잰다. **보낼 때** 쪽은 `ws-broadcast.test.ts`가 잰다.
 *
 * **역할이 프레임마다 갈리는 것(D1)은 `ws-patch.test.ts`가 잰다** — 이 파일이 재는 것은
 * *"자격이 사라지면 닫힌다"*이고 그쪽이 재는 것은 *"뷰어는 편집을 못 낸다"*다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  addMember,
  createProject,
  getTestDb,
  resetRealData,
  signup,
  withRealApi,
  type TestContext,
} from './helpers'
import { WsProbe, joinRoom } from './ws-client'

const db = getTestDb()

beforeEach(resetRealData)
afterEach(resetRealData)

/** 이 파일이 여는 연결 전부. 케이스가 끝나면 닫는다 — 안 닫으면 `withRealApi`의 `close`가 기다린다. */
const opened: WsProbe[] = []

afterEach(() => {
  for (const probe of opened) probe.close()
  opened.length = 0
})

function track(probe: WsProbe): WsProbe {
  opened.push(probe)
  return probe
}

describe('WS 핸드셰이크는 REST와 같은 쿠키·같은 가드다 (§10 · D5)', () => {
  it('쿠키가 없으면 붙지 못한다', async () => {
    await withRealApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const probe = track(WsProbe.open(ctx.port, project.id))

      expect(await probe.opened).toBe(false)
    })
  })

  it('멤버가 아니면 붙지 못한다 — 남의 프로젝트에 붙을 수 없다', async () => {
    await withRealApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const outsider = await signup(ctx)

      const probe = track(WsProbe.open(ctx.port, project.id, outsider.cookie.wb_session))

      expect(await probe.opened).toBe(false)
    })
  })

  it('뷰어도 붙는다 — 조회 전용도 남의 편집을 봐야 한다', async () => {
    await withRealApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const viewer = await signup(ctx)
      await addMember(ctx, project.id, viewer.user.id, 'viewer')

      const probe = track(await joinRoom(ctx.port, project.id, viewer.cookie.wb_session))
      const joined = await probe.waitFor('joined')

      expect(joined.role).toBe('viewer')
      expect(joined.userId).toBe(viewer.user.id)
    })
  })

  it('붙은 연결은 자기 connectionId를 받는다 — 브로드캐스트 제외가 이 값에 매여 있다', async () => {
    await withRealApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const first = track(await joinRoom(ctx.port, project.id, owner.cookie.wb_session))
      const second = track(await joinRoom(ctx.port, project.id, owner.cookie.wb_session))

      const a = await first.waitFor('joined')
      const b = await second.waitFor('joined')

      expect(a.connectionId).not.toBe(b.connectionId)
    })
  })

  it('업그레이드가 아닌 GET에도 같은 가드가 먼저 돈다 — 비멤버에게 404다', async () => {
    await withRealApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const outsider = await signup(ctx)

      // 소켓을 열지 않는 평범한 GET이다. **상태 코드를 볼 수 있는 유일한 경로**라
      // §10의 404/403 규칙이 이 라우트에도 그대로 걸렸는지 여기서 읽는다.
      const res = await fetch(`http://127.0.0.1:${ctx.port}/api/projects/${project.id}/ws`, {
        headers: { cookie: `wb_session=${outsider.cookie.wb_session}` },
      })

      expect(res.status).toBe(404)
    })
  })
})

describe('세션 행을 지우면 권한이 회수된다 (§10 · 재라 #3)', () => {
  /** **프레임 수신 쪽 확인 지점**(`ws/routes.ts`의 1번). 종류와 무관하게 먼저 도는 줄이다. */
  it('세션을 지운 뒤 프레임을 보내면 그 연결이 닫힌다', async () => {
    await withRealApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const probe = track(await joinRoom(ctx.port, project.id, owner.cookie.wb_session))

      await deleteSessions(ctx, owner.user.id)
      probe.send(JSON.stringify({ type: 'ping' }))

      const closed = await probe.waitClosed()
      expect(closed.code).toBe(4403)
    })
  })

  /**
   * **음성 대조.** 이것이 없으면 위 케이스의 *"닫힌다"*가 *"`ping`을 보내면 원래 닫힌다"*와
   * 구분되지 않는다.
   */
  it('세션이 살아 있으면 같은 프레임에 pong이 온다 — 음성 대조', async () => {
    await withRealApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const probe = track(await joinRoom(ctx.port, project.id, owner.cookie.wb_session))

      probe.send(JSON.stringify({ type: 'ping' }))

      await probe.waitFor('pong')
      expect(probe.closeInfo).toBeNull()
    })
  })

  it('멤버십을 지워도 같은 자리에서 회수된다 — 세션만이 아니다', async () => {
    await withRealApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const viewer = await signup(ctx)
      await addMember(ctx, project.id, viewer.user.id, 'viewer')
      const probe = track(await joinRoom(ctx.port, project.id, viewer.cookie.wb_session))

      await db
        .deleteFrom('project_members')
        .where('project_id', '=', project.id)
        .where('user_id', '=', viewer.user.id)
        .execute()
      probe.send(JSON.stringify({ type: 'ping' }))

      const closed = await probe.waitClosed()
      expect(closed.code).toBe(4403)
    })
  })

  it('읽을 수 없는 프레임은 연결을 닫는다 — 회수와 다른 코드로', async () => {
    await withRealApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const probe = track(await joinRoom(ctx.port, project.id, owner.cookie.wb_session))

      probe.send('{ 이것은 JSON이 아니다')

      const closed = await probe.waitClosed()
      expect(closed.code).toBe(4400)
    })
  })

  /**
   * **JSON이지만 모르는 `type`도 같은 자리다** — 재서 알았다: JSON 파싱만 잡는 케이스로는
   * `type` 검사를 통째로 지워도 아무도 안 죽는다(변이 M11이 0 사망이었다).
   */
  it('모르는 type도 연결을 닫는다 — JSON이라는 것만으로는 부족하다', async () => {
    await withRealApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const probe = track(await joinRoom(ctx.port, project.id, owner.cookie.wb_session))

      probe.send(JSON.stringify({ type: '없는프레임', ops: [] }))

      const closed = await probe.waitClosed()
      expect(closed.code).toBe(4400)
    })
  })

  /**
   * **아는 `type`인데 모양이 어긋난 것도 같은 자리다.** P3-2가 `patch`를 더하면서 이 자리의
   * 뜻이 갈렸다 — 앞 판은 이 판을 *"모르는 type"*으로 세었는데 `patch`는 이제 아는 이름이다.
   *
   * **닫는 쪽을 고른 것은 판정이다.** 되돌려 줄 `clientOpId`조차 못 읽었으므로 `patch-error`를
   * 보내도 받는 쪽이 어느 편집의 실패인지 짝지을 수 없다 — 그 프레임은 클라이언트의 in-flight를
   * 영영 매달아 둔다. 닫으면 클라이언트가 그 자리에서 전부 실패로 처리하고 다시 붙는다
   * (`apps/web`의 `edit-channel.ts`).
   */
  it('아는 type인데 모양이 어긋나도 닫는다 — 짝지을 것이 없다', async () => {
    await withRealApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const probe = track(await joinRoom(ctx.port, project.id, owner.cookie.wb_session))

      probe.send(JSON.stringify({ type: 'patch', ops: [] }))

      const closed = await probe.waitClosed()
      expect(closed.code).toBe(4400)
    })
  })
})

async function deleteSessions(ctx: TestContext, userId: string): Promise<void> {
  await ctx.db.deleteFrom('sessions').where('user_id', '=', userId).execute()
}
