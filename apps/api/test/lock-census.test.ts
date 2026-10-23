/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** `helpers.ts`의 `withRealApi`를 쓴다.
 *
 * ---
 *
 * # 왜 이 파일이 있나 — 2차 방어를 호출자가 부르는 대가
 *
 * 설계서 「소프트 잠금」의 2차 방어는 `applyEdit` **안**에 넣을 수 없다(`lock/check.ts`의
 * 머리말). 그러면 **호출자가 부르고, 호출자가 빠뜨릴 수 있다.** 그것이 이 결정의 대가다.
 *
 * `broadcast-census.test.ts`가 알림에 대해 같은 것을 하고, **같은 분모를 쓴다**
 * (`./source-census.ts`가 `src/` 전체를 재귀로 훑어 `applyEdit` 호출 자리를 센다). 분모가
 * 같아야 *"알리는 자리"*와 *"잠금을 보는 자리"*가 같은 눈금 위에서 비교된다.
 *
 * ---
 *
 * # 세는 단위
 *
 * > **`apps/api/src/` 아래 어느 `.ts`에서든 `applyEdit`을 부르는 자리 하나당 한 줄이고,
 * > 각 줄은 *"그 자리가 잠금을 보는가"*를 판정과 함께 적는다.**
 *
 * **`false`인 줄도 표에 있다.** *"안 본다"*는 판정이지 누락이 아니고, 판정이 표에 없으면
 * 다음 사람이 그것을 누락으로 읽고 고친다.
 *
 * ---
 *
 * # 재는 방식 — `false`인 줄도 실제로 지나간다
 *
 * **다른 사용자가 `n_b`를 잠근 판에서** 표의 모든 줄을 지나간다. 각 줄이 건드리는 자리는
 * 그 서브트리 **안**이거나(`PATCH .../ops`·코멘트 셋) 그것을 **품는다**(`PUT .../schema`·
 * 복원). 그래서 `true`인 줄은 423을 받아야 하고, **`false`인 줄은 성공해야 한다** — 그 판정을
 * 누가 나중에 뒤집으면(잠금 확인을 더하면) 그 줄이 죽는다.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { WIREBOUND_PAGE_VERSION, type PatchOp } from '@wirebound/schema'
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
import { callSitesByFile } from './source-census'
import { WsProbe, joinRoom, locksEmpty, locksWith } from './ws-client'

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

/** 소프트 잠금 충돌의 상태 코드(「소프트 잠금」의 2차 방어 — 409가 아닌 이유는 `src/errors.ts`의 `ERROR_STATUS`의 `locked`). */
const LOCKED = 423

interface Fixture {
  /** 편집을 내는 사람. 프로젝트 owner다 — 복원이 owner를 요구한다(설계서 「권한 모델」). */
  actor: SignedUpUser
  /** **`n_b`를 잠그고 있는 사람.** 편집을 내지 않는다. */
  holder: SignedUpUser
  projectId: string
  menuId: string
  pageId: string
  /**
   * **같은 프로젝트의 다른 페이지이고 노드 id가 `pageId`와 똑같다.**
   *
   * 노드 id가 페이지를 넘어 겹치는 것은 실재한다 — `POST .../pages/import`가 파일의 id를
   * 그대로 쓰고 `PUT .../schema`는 임의의 id를 받는다. 서버가 `frame.pageId`를 **검증하지
   * 않으므로**(문서를 읽어야 안다) 그것을 무해하게 만드는 것은 `lock/check.ts`의 페이지
   * 필터 한 줄이고, 이 페이지가 그 줄을 재는 판을 만든다.
   */
  twinPageId: string
  /** `n_b` 안에 달린 코멘트. 지우는 갈래가 쓴다. */
  commentId: string
  snapshotId: string
}

interface LockSite {
  /** 세는 단위의 키. 파일 안의 호출 자리를 **파일별 개수**로 대조한다. */
  file: string
  label: string
  checksLock: boolean
  why: string
  /** 그 자리를 지나간다. **낸 것의 상태 코드**를 돌려준다. */
  drive: (ctx: RealApiContext, fx: Fixture) => Promise<number>
}

/** **소스의 `applyEdit` 호출 자리 하나당 한 줄.** */
const CALL_SITES: LockSite[] = [
  {
    file: 'routes/pages.ts',
    label: 'PUT .../schema — 문서 통째 교체',
    checksLock: true,
    why: '`/root`를 갈아 끼우므로 **잠긴 서브트리가 무엇이든 그 안에 있다.** (가져오기·복원을 근거로 적지 마라 — 그 둘은 이 라우트로 안 오고 아래 두 줄이 그것을 별도로 센다)',
    drive: async (ctx, fx) => {
      const res = await ctx.app.inject({
        method: 'PUT',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/schema`,
        cookies: fx.actor.cookie,
        payload: {
          schema: { version: 3, root: { id: 'n_root', type: 'Page', children: [{ id: 'n_put', type: 'Text', props: {} }] } },
        } as never,
      })
      return res.statusCode
    },
  },
  {
    file: 'routes/pages.ts',
    label: 'PATCH .../ops — 부분 편집 (MCP가 이 길로 온다)',
    checksLock: true,
    why: '편집의 본줄기. **에이전트는 잠금을 걸지 않지만(설계서 「LLM 편집 경로」) 남의 잠금에는 막힌다** — 안 막으면 2차 방어가 접속 방식에 따라 갈린다',
    drive: async (ctx, fx) => patchOps(ctx, fx, insideLock()),
  },
  {
    file: 'routes/comments.ts',
    label: 'POST .../comments — 번호를 붙이는 갈래',
    checksLock: false,
    why: '**코멘트는 노드 편집이 아니다.** 바꾸는 것은 서버가 매기는 `marker` 하나이고 사람이 그 필드를 고르지 않는다. 설계서 「소프트 잠금」이 *"코멘트는 잠금 대상이 아니다"*라고 적었다 — 막으면 *"남이 편집 중이라 코멘트를 못 단다"*가 된다',
    drive: async (ctx, fx) => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/comments`,
        cookies: fx.actor.cookie,
        payload: { nodeId: 'n_b2', body: '잠긴 서브트리 안의 노드에 단다' },
      })
      return res.statusCode
    },
  },
  {
    file: 'routes/comments.ts',
    label: 'DELETE .../comments/:id — 번호를 지우는 갈래',
    checksLock: false,
    why: '같은 이유',
    drive: async (ctx, fx) => {
      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/comments/${fx.commentId}`,
        cookies: fx.actor.cookie,
      })
      return res.statusCode
    },
  },
  {
    file: 'routes/comments.ts',
    label: 'POST .../comments/renumber — 바꿀 번호가 있는 갈래',
    checksLock: false,
    why: '같은 이유. 게다가 재번호는 문서 **전체**의 marker를 손보므로, 잠금을 보게 하면 누가 무엇을 잡고 있든 영영 못 돈다',
    drive: async (ctx, fx) => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/comments/renumber`,
        cookies: fx.actor.cookie,
      })
      if (res.statusCode === 200 && (res.json() as { markerOps: PatchOp[] }).markerOps.length === 0) {
        throw new Error('재번호가 아무것도 바꾸지 않았다 — 픽스처가 이 갈래를 안 태웠다')
      }
      return res.statusCode
    },
  },
  {
    file: 'ws/patch.ts',
    label: 'patch 프레임 — WS로 들어온 편집',
    checksLock: true,
    why: '편집의 본줄기가 WS로 들어오는 자리다. **REST와 같은 실패 봉투를 낸다** — 사용자가 보는 것이 접속 방식에 따라 갈리지 않는다',
    drive: async (ctx, fx) => {
      const author = track(await joinRoom(ctx.port, fx.projectId, fx.actor.cookie.wb_session))
      author.send(
        JSON.stringify({
          type: 'patch',
          pageId: fx.pageId,
          baseSeq: await headSeqOf(fx.pageId),
          ops: insideLock(),
          clientOpId: 'op_lock_census',
        }),
      )
      const frame = await Promise.race([
        author.waitFor('patch-ack').then(() => 200),
        author.waitFor('patch-error').then((error) => error.status),
      ])
      return frame
    },
  },
  {
    file: 'services/restore.ts',
    label: '복원이 페이지 문서를 되돌리는 자리',
    checksLock: false,
    why: '**복원은 프로젝트 전체를 되돌리는 owner 조작이고(설계서 「권한 모델」) 잠금과 대응하는 단위가 없다** — 페이지가 사라지고 생기기도 하므로 *"어느 서브트리"*가 성립하지 않는다. 알림도 `restored` 한 프레임으로 *"판이 갈렸다"*를 말하지 페이지 편집으로 말하지 않는다. 그리고 이 호출은 복원 트랜잭션 **안**이라 여기서 조회를 더 하면 그 행 잠금을 든 채 기다린다',
    drive: async (ctx, fx) => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.projectId}/snapshots/${fx.snapshotId}/restore`,
        cookies: fx.actor.cookie,
      })
      return res.statusCode
    },
  },
  {
    file: 'services/page-import.ts',
    label: '가져오기가 새 페이지의 첫 문서를 쓰는 자리',
    checksLock: false,
    why: '**한순간 전까지 없던 페이지다** — 어느 연결도 그것의 노드를 잠글 수 없다. 잠금은 `pageId` 단위로 걸리므로 이 자리에 걸릴 수 있는 잠금 자체가 없다',
    drive: async (ctx, fx) => {
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${fx.projectId}/pages/import`,
        cookies: fx.actor.cookie,
        payload: {
          menuNodeId: fx.menuId,
          file: {
            wireboundVersion: WIREBOUND_PAGE_VERSION,
            page: { title: '가져온 페이지' },
            schema: { version: 3, root: { id: 'file_root', type: 'Page', children: [] } },
            comments: [],
          },
        } as never,
      })
      return res.statusCode
    },
  },
]

describe('분모를 소스에서 만든다 — `broadcast-census.test.ts`와 같은 분모다', () => {
  it('훑을 소스를 실제로 읽는다', () => {
    // 글롭이 어긋나면 **빈 집합에서 아래가 조용히 통과한다.**
    expect([...callSitesByFile('applyEdit').values()].reduce((sum, count) => sum + count, 0)).toBeGreaterThan(5)
    expect([...callSitesByFile('lockConflictError').values()].reduce((sum, count) => sum + count, 0)).toBeGreaterThan(1)
  })

  it('`applyEdit` 호출 자리가 하나도 빠지지 않았다 — 새 호출자가 생기면 여기가 먼저 죽는다', () => {
    const covered = new Map<string, number>()
    for (const site of CALL_SITES) {
      covered.set(site.file, (covered.get(site.file) ?? 0) + 1)
    }

    const mismatched = [...callSitesByFile('applyEdit')]
      .filter(([file, count]) => covered.get(file) !== count)
      .map(([file, count]) => `${file}: 소스 ${count} / 표 ${covered.get(file) ?? 0}`)

    expect(mismatched).toEqual([])
  })

  it('잠금을 본다고 적은 자리만큼 소스에도 잠금 확인이 있다 — 양방향이다', () => {
    const declared = new Map<string, number>()
    for (const site of CALL_SITES.filter((one) => one.checksLock)) {
      declared.set(site.file, (declared.get(site.file) ?? 0) + 1)
    }
    const inSource = callSitesByFile('lockConflictError')

    const files = [...new Set([...declared.keys(), ...inSource.keys()])].sort()
    const mismatched = files
      .filter((file) => (declared.get(file) ?? 0) !== (inSource.get(file) ?? 0))
      .map((file) => `${file}: 소스 ${inSource.get(file) ?? 0} / 표 ${declared.get(file) ?? 0}`)

    expect(mismatched).toEqual([])
  })

  it('두 갈래가 모두 비어 있지 않다 — 분모가 한쪽으로 쏠리면 아래가 공허해진다', () => {
    expect(CALL_SITES.filter((site) => site.checksLock).length).toBeGreaterThan(0)
    expect(CALL_SITES.filter((site) => !site.checksLock).length).toBeGreaterThan(0)
  })
})

describe('표의 각 줄을 **남이 잠근 판에서** 지나가 본다', () => {
  for (const site of CALL_SITES) {
    it(`${site.checksLock ? '막힌다' : '안 막힌다'} — ${site.label}`, async () => {
      await withRealApi(async (ctx) => {
        const fx = await fixture(ctx)
        // **잠금이 실제로 섰다는 것을 확인한 뒤에 지나간다.** 프레임을 보내 놓고 곧바로
        // 편집하면 *"안 막혔다"*가 *"아직 안 잠겼다"*와 구분되지 않는다.
        const holderTab = track(await joinRoom(ctx.port, fx.projectId, fx.holder.cookie.wb_session))
        holderTab.send(JSON.stringify({ type: 'lock', pageId: fx.pageId, nodeId: 'n_b' }))
        await locksWith(holderTab, 'n_b')

        const status = await site.drive(ctx, fx)

        if (site.checksLock) {
          expect(status, site.why).toBe(LOCKED)
        } else {
          expect([200, 201], site.why).toContain(status)
        }
      })
    }, 30_000)
  }
})

describe('막는 것은 **남의** 잠금이다', () => {
  it('자기 잠금에는 안 막힌다 — 같은 사람의 다른 탭이 여기 온다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      // 같은 사람이 **다른 탭**으로 잠근다. `holder`가 아니라 `actor`다.
      const otherTab = track(await joinRoom(ctx.port, fx.projectId, fx.actor.cookie.wb_session))
      otherTab.send(JSON.stringify({ type: 'lock', pageId: fx.pageId, nodeId: 'n_b' }))
      await locksWith(otherTab, 'n_b')

      const status = await patchOps(ctx, fx, insideLock())

      expect(status).toBe(200)
    })
  }, 30_000)

  it('잠금이 없으면 안 막힌다 — 대조', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)

      const status = await patchOps(ctx, fx, insideLock())

      expect(status).toBe(200)
    })
  }, 30_000)

  it('남이 잠근 서브트리 **밖**은 안 막힌다 — 잠금이 문서를 통째로 얼리지 않는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const holderTab = track(await joinRoom(ctx.port, fx.projectId, fx.holder.cookie.wb_session))
      holderTab.send(JSON.stringify({ type: 'lock', pageId: fx.pageId, nodeId: 'n_b' }))
      await locksWith(holderTab, 'n_b')

      const status = await patchOps(ctx, fx, outsideLock())

      expect(status).toBe(200)
    })
  }, 30_000)

  it('여러 op 중 **뒤쪽 하나만** 잠긴 자리여도 막힌다 — 편집은 자기가 건드리는 자리를 전부 낸다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const holderTab = track(await joinRoom(ctx.port, fx.projectId, fx.holder.cookie.wb_session))
      holderTab.send(JSON.stringify({ type: 'lock', pageId: fx.pageId, nodeId: 'n_b' }))
      await locksWith(holderTab, 'n_b')

      // 첫 op은 잠긴 서브트리 **밖**이다. 첫 포인터만 보면 이 편집이 지나간다.
      const status = await patchOps(ctx, fx, [...outsideLock(), ...insideLock()])

      expect(status).toBe(LOCKED)
    })
  }, 30_000)

  it('`move`는 **뽑는 자리**만 잠겨 있어도 막힌다 — 포인터가 둘이다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const holderTab = track(await joinRoom(ctx.port, fx.projectId, fx.holder.cookie.wb_session))
      holderTab.send(JSON.stringify({ type: 'lock', pageId: fx.pageId, nodeId: 'n_b' }))
      await locksWith(holderTab, 'n_b')

      // `from`이 잠긴 `n_b` 안(`n_b1`), `path`는 밖(`n_a` 아래)이다.
      const status = await patchOps(ctx, fx, [{ op: 'move', from: '/root/children/1/children/0', path: '/root/children/0/children/-' }])

      expect(status).toBe(LOCKED)
    })
  }, 30_000)

  it('**다른 페이지**의 잠금은 이 페이지의 편집을 막지 않는다 — 노드 id는 페이지를 넘어 겹친다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const holderTab = track(await joinRoom(ctx.port, fx.projectId, fx.holder.cookie.wb_session))

      // **같은 `nodeId`를 다른 `pageId`로 잠근다.** 서버는 `frame.pageId`가 그 프로젝트의
      // 페이지인지 보지 않으므로(문서를 읽어야 안다) 이 프레임은 그대로 선다 — 그것을
      // 무해하게 만드는 것은 `lock/check.ts`의 페이지 필터 한 줄이다.
      holderTab.send(JSON.stringify({ type: 'lock', pageId: fx.twinPageId, nodeId: 'n_b' }))
      await locksWith(holderTab, 'n_b')

      const status = await patchOps(ctx, fx, insideLock())

      expect(status).toBe(200)
    })
  }, 30_000)

  it('그 대조 — **같은 페이지**의 같은 노드를 잠그면 막힌다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const holderTab = track(await joinRoom(ctx.port, fx.projectId, fx.holder.cookie.wb_session))

      holderTab.send(JSON.stringify({ type: 'lock', pageId: fx.pageId, nodeId: 'n_b' }))
      await locksWith(holderTab, 'n_b')

      const status = await patchOps(ctx, fx, insideLock())

      expect(status).toBe(LOCKED)
    })
  }, 30_000)

  it('읽을 수 없는 버전의 문서는 잠금이 아니라 **버전**으로 답한다 — 같은 부류다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const holderTab = track(await joinRoom(ctx.port, fx.projectId, fx.holder.cookie.wb_session))
      holderTab.send(JSON.stringify({ type: 'lock', pageId: fx.pageId, nodeId: 'n_b' }))
      await locksWith(holderTab, 'n_b')

      // **새 배포가 쓴 문서를 옛 서버가 읽는 판이다**(설계서 「스키마 마이그레이션」). 잠금 확인은 파이프라인과
      // **같은 기준**으로 문서를 올리므로(`migrateDocument`) 여기서 읽지 못하고 판정을
      // 건너뛴다 — 그러면 파이프라인이 자기 이름(`unsupported-version` → 400)으로 답한다.
      // 올리지 않고 저장된 문서를 그대로 보면 잠금이 먼저 걸려 **400이 423으로 바뀐다.**
      const row = await db.selectFrom('pages').select(['schema', 'head_seq']).where('id', '=', fx.pageId).executeTakeFirstOrThrow()
      await db
        .updateTable('pages')
        .set({ schema: JSON.stringify({ ...(row.schema as object), version: 99 }) as never })
        .where('id', '=', fx.pageId)
        .execute()

      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/ops`,
        cookies: fx.actor.cookie,
        payload: { baseSeq: Number(row.head_seq), ops: insideLock() },
      })

      expect(res.statusCode).toBe(400)
      expect((res.json() as { error: { code: string } }).error.code).toBe('bad-request')
    })
  }, 30_000)

  it('낡은 요청은 잠금이 아니라 낡음으로 답한다 — 겪지 않은 실패를 말하지 않는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const holderTab = track(await joinRoom(ctx.port, fx.projectId, fx.holder.cookie.wb_session))
      holderTab.send(JSON.stringify({ type: 'lock', pageId: fx.pageId, nodeId: 'n_b' }))
      await locksWith(holderTab, 'n_b')

      // **잠긴 자리를 건드리는 편집인데 `baseSeq`가 낡았다.** 잠금 확인은 자기가 읽은 문서가
      // 요청이 선 revision의 것일 때만 판정한다(`lock/check.ts`) — 아니면 파이프라인이
      // `stale`로 답한다. 그 순서가 뒤집히면 사용자는 *"남이 편집 중"*이라는 말을 듣고
      // **재조회를 안 한다.**
      const res = await ctx.app.inject({
        method: 'PATCH',
        url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/ops`,
        cookies: fx.actor.cookie,
        payload: { baseSeq: 0, ops: insideLock() },
      })

      expect(res.statusCode).toBe(409)
      expect((res.json() as { error: { code: string } }).error.code).toBe('conflict')
    })
  }, 30_000)

  it('연결이 끊기면 다시 편집할 수 있다 — 설계서 「소프트 잠금」의 *"연결 종료 시 즉시 해제"*', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const watcher = track(await joinRoom(ctx.port, fx.projectId, fx.actor.cookie.wb_session))
      const holderTab = track(await joinRoom(ctx.port, fx.projectId, fx.holder.cookie.wb_session))
      holderTab.send(JSON.stringify({ type: 'lock', pageId: fx.pageId, nodeId: 'n_b' }))
      await locksWith(watcher, 'n_b')

      const blocked = await patchOps(ctx, fx, insideLock())
      holderTab.close()
      // **목록이 빌 때까지 기다린다** — 창을 두고 재면 흔들린다. 해제가 서버에 닿았다는
      // 신호가 이 프레임이다.
      await locksEmpty(watcher)
      const allowed = await patchOps(ctx, fx, insideLock())

      expect([blocked, allowed]).toEqual([LOCKED, 200])
    })
  }, 30_000)
})

let newNodeCounter = 0

/** 매번 다른 id를 쓴다 — 같은 id를 두 번 넣으면 검증이 그것을 막는다. */
function freshNode(): { id: string; type: string; props: Record<string, never> } {
  newNodeCounter += 1
  return { id: `n_added${newNodeCounter}`, type: 'Text', props: {} }
}

/** `n_b` **안**을 건드리는 편집. holder가 잠근 서브트리다. */
function insideLock(): PatchOp[] {
  return [{ op: 'add', path: '/root/children/1/children/-', value: freshNode() }]
}

/** `n_a` 안을 건드리는 편집 — 잠긴 서브트리 **밖**이다. */
function outsideLock(): PatchOp[] {
  return [{ op: 'add', path: '/root/children/0/children/-', value: freshNode() }]
}

async function patchOps(ctx: RealApiContext, fx: Fixture, ops: PatchOp[]): Promise<number> {
  const res = await ctx.app.inject({
    method: 'PATCH',
    url: `/api/projects/${fx.projectId}/pages/${fx.pageId}/ops`,
    cookies: fx.actor.cookie,
    payload: { baseSeq: await headSeqOf(fx.pageId), ops },
  })
  return res.statusCode
}

async function headSeqOf(pageId: string): Promise<number> {
  const row = await db.selectFrom('pages').select('head_seq').where('id', '=', pageId).executeTakeFirstOrThrow()
  return Number(row.head_seq)
}

/**
 * 표의 모든 줄이 자기 갈래를 **실제로 태울 수 있는** 판.
 *
 * ```
 * n_root
 *   n_a      n_a1
 *   n_b      n_b1  n_b2      ← holder가 여기를 잠근다
 * ```
 *
 * 재번호가 바꿀 것을 갖게 하려고 **문서 순서와 어긋나게** 번호를 붙인다: 뒤 노드에 먼저
 * 코멘트를 달아 1번을 주고, 앞 노드에 나중에 달아 2번을 준다. **둘 다 `n_b` 안**이라
 * 코멘트가 만드는 marker 편집이 잠긴 서브트리 안에서 일어난다 — 그것이 `false` 줄의
 * 판정에 하중을 만든다.
 */
async function fixture(ctx: RealApiContext): Promise<Fixture> {
  const actor = await signup(ctx)
  const holder = await signup(ctx)
  const project = await createProject(ctx, actor.cookie)
  await addMember(ctx, project.id, holder.user.id, 'editor')
  const menu = await createMenuNode(ctx, actor.cookie, project.id)
  const page = await createPage(ctx, actor.cookie, project.id, menu.id, { title: '함께 고칠 페이지' })

  const put = await ctx.app.inject({
    method: 'PUT',
    url: `/api/projects/${project.id}/pages/${page.id}/schema`,
    cookies: actor.cookie,
    payload: {
      schema: {
        version: 3,
        root: {
          id: 'n_root',
          type: 'Page',
          children: [
            { id: 'n_a', type: 'Section', children: [{ id: 'n_a1', type: 'Text', props: {} }] },
            {
              id: 'n_b',
              type: 'Section',
              children: [
                { id: 'n_b1', type: 'Text', props: {} },
                { id: 'n_b2', type: 'Text', props: {} },
              ],
            },
          ],
        },
      },
    } as never,
  })
  if (put.statusCode !== 200) throw new Error(`픽스처 PUT 실패 (${put.statusCode}): ${put.body}`)

  // **같은 문서를 두 번째 페이지에도 심는다.** 두 페이지의 노드 id가 겹치는 판을 만든다.
  const twin = await createPage(ctx, actor.cookie, project.id, menu.id, { title: '노드 id가 겹치는 페이지' })
  const twinPut = await ctx.app.inject({
    method: 'PUT',
    url: `/api/projects/${project.id}/pages/${twin.id}/schema`,
    cookies: actor.cookie,
    payload: {
      schema: {
        version: 3,
        root: {
          id: 'n_root',
          type: 'Page',
          children: [
            { id: 'n_a', type: 'Section', children: [{ id: 'n_a1', type: 'Text', props: {} }] },
            { id: 'n_b', type: 'Section', children: [{ id: 'n_b1', type: 'Text', props: {} }] },
          ],
        },
      },
    } as never,
  })
  if (twinPut.statusCode !== 200) throw new Error(`쌍둥이 페이지 PUT 실패 (${twinPut.statusCode}): ${twinPut.body}`)

  // 뒤 노드에 먼저 → 1번. 앞 노드에 나중에 → 2번. 재번호가 이것을 뒤집는다.
  await addComment(ctx, project.id, page.id, actor, 'n_b2')
  const commentId = await addComment(ctx, project.id, page.id, actor, 'n_b1')

  const snapshot = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${project.id}/snapshots`,
    cookies: actor.cookie,
    payload: { tag: 'lock-census' },
  })
  if (snapshot.statusCode !== 201) throw new Error(`스냅샷 픽스처 실패: ${snapshot.body}`)

  return {
    actor,
    holder,
    projectId: project.id,
    menuId: menu.id,
    pageId: page.id,
    twinPageId: twin.id,
    commentId,
    snapshotId: (snapshot.json() as { id: string }).id,
  }
}

async function addComment(ctx: RealApiContext, projectId: string, pageId: string, who: SignedUpUser, nodeId: string): Promise<string> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/pages/${pageId}/comments`,
    cookies: who.cookie,
    payload: { nodeId, body: `${nodeId}에 붙인 코멘트` },
  })
  if (res.statusCode !== 201) throw new Error(`코멘트 픽스처 실패 (${res.statusCode}): ${res.body}`)
  return (res.json() as { comment: { id: string } }).comment.id
}
