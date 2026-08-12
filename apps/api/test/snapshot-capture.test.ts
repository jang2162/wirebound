/**
 * `services/snapshot-capture.ts` — 얼리는 쪽(P6-1 T2).
 *
 * 여기서 재는 것 넷:
 *
 * 1. 다섯 자원이 실제로 담기고 **겹layer는 담기지 않는다**(사실 2).
 * 2. 테마가 **병합된 결과**로 얼려진다 — `ThemeSchema`를 통과하고 `extends`가 남지 않는다(D5).
 * 3. 저장된 문서를 **마이그레이션하지 않고** 그대로 담는다(D4).
 * 4. 지문이 어긋나면 **값으로** 실패하고 **아무것도 쓰지 않는다**(D6 + 사실 5).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { sql } from 'kysely'
import { ThemeSchema, systemTheme } from '@wirebound/themes'
import { CURRENT_DOCUMENT_VERSION } from '@wirebound/schema'
import { captureSnapshot } from '../src/services/snapshot-capture'
import { SNAPSHOT_PAYLOAD_VERSION, SNAPSHOT_RESOURCES } from '../src/services/snapshot-payload'
import { listSnapshots } from '../src/repos/snapshots'
import { createMenuNode, createPage, createProject, signup, withApi, type TestContext } from './helpers'

/** 현실적인 프로젝트 하나 — 메뉴 둘·페이지 둘·코멘트 하나·기본 레이아웃·시스템 테마. */
async function realisticProject(ctx: TestContext) {
  const owner = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  const rootMenu = await createMenuNode(ctx, owner.cookie, project.id, { title: '설정' })
  const childMenu = await createMenuNode(ctx, owner.cookie, project.id, {
    parentId: rootMenu.id,
    title: '사용자 관리',
  })
  const first = await createPage(ctx, owner.cookie, project.id, childMenu.id, {
    title: '사용자 목록',
    description: '가입한 사용자를 보여 준다',
  })
  const second = await createPage(ctx, owner.cookie, project.id, childMenu.id, { title: '사용자 상세' })

  const rootNodeId = (first.schema as { root: { id: string } }).root.id
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${project.id}/pages/${first.id}/comments`,
    cookies: owner.cookie,
    payload: { nodeId: rootNodeId, body: '이 목록은 페이지네이션이 필요하다' },
  })
  if (res.statusCode !== 201) throw new Error(`코멘트 픽스처 실패 (${res.statusCode}): ${res.body}`)

  return { owner, project, rootMenu, childMenu, first, second, rootNodeId }
}

/** 파생 테마를 만들어 프로젝트의 기본 레이아웃에 건다. 상속 대상은 시스템 `admin`이다. */
async function chooseDerivedTheme(ctx: TestContext, fx: Awaited<ReturnType<typeof realisticProject>>) {
  const created = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${fx.project.id}/themes`,
    cookies: fx.owner.cookie,
    payload: {
      theme: {
        meta: { id: 'derived', name: '파생 테마', version: '1.0.0', extends: 'system:admin' },
        tokens: { semantic: { primary: '#ff0000' } },
      },
    },
  })
  if (created.statusCode !== 201) throw new Error(`테마 픽스처 실패 (${created.statusCode}): ${created.body}`)
  const themeId = (created.json() as { id: string }).id

  const chosen = await ctx.app.inject({
    method: 'PUT',
    url: `/api/projects/${fx.project.id}/theme`,
    cookies: fx.owner.cookie,
    payload: { themeId },
  })
  if (chosen.statusCode !== 200) throw new Error(`테마 선택 실패 (${chosen.statusCode}): ${chosen.body}`)
  return themeId
}

function captured(outcome: Awaited<ReturnType<typeof captureSnapshot>>) {
  if (outcome.kind !== 'captured') throw new Error(`캡처가 실패했다: ${outcome.kind}`)
  return outcome.payload
}

describe('다섯 자원을 담는다', () => {
  it('메뉴·페이지·레이아웃·테마·코멘트가 전부 실린다', async () => {
    await withApi(async (ctx) => {
      const fx = await realisticProject(ctx)

      const payload = captured(await captureSnapshot(ctx.db, fx.project.id))

      expect(payload.payloadVersion).toBe(SNAPSHOT_PAYLOAD_VERSION)
      expect(payload.menu.map((node) => node.title)).toEqual(['설정', '사용자 관리'])
      expect(payload.pages.map((page) => page.title)).toEqual(['사용자 목록', '사용자 상세'])
      expect(payload.layouts).toHaveLength(1)
      expect(payload.themes).toHaveLength(1)
      expect(payload.comments.map((comment) => comment.body)).toEqual(['이 목록은 페이지네이션이 필요하다'])
    })
  })

  /**
   * 사실 2 — **겹layer는 없다.** 규격이 `z.strictObject`라 선언되지 않은 절은 파싱에서
   * 죽지만, 그것은 *"실리면 죽는다"*이지 *"실릴 자리가 없다"*는 아니다. 이 케이스는
   * **만들어진 payload의 키**를 세어 그 자리가 실제로 다섯인지 본다.
   */
  it('payload의 키가 규격이 선언한 것뿐이다 — 겹layer가 없다', async () => {
    await withApi(async (ctx) => {
      const fx = await realisticProject(ctx)

      const payload = captured(await captureSnapshot(ctx.db, fx.project.id))

      expect(Object.keys(payload).sort()).toEqual(
        ['capturedAt', 'payloadVersion', ...SNAPSHOT_RESOURCES].sort(),
      )
    })
  })

  it('메뉴의 부모 관계가 payload에 남는다 — 트리로 접지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await realisticProject(ctx)

      const payload = captured(await captureSnapshot(ctx.db, fx.project.id))

      const child = payload.menu.find((node) => node.id === fx.childMenu.id)
      expect(child?.parentId).toBe(fx.rootMenu.id)
      expect(payload.menu.find((node) => node.id === fx.rootMenu.id)?.parentId).toBeNull()
    })
  })

  /** §4.5 — *"각 페이지의 `head_seq`를 함께 기록한다."* */
  it('페이지마다 headSeq가 실린다', async () => {
    await withApi(async (ctx) => {
      const fx = await realisticProject(ctx)

      const payload = captured(await captureSnapshot(ctx.db, fx.project.id))

      // 첫 페이지는 코멘트가 번호를 붙이며 revision을 하나 남겼다(P5-1 D2).
      expect(payload.pages.find((page) => page.id === fx.first.id)?.headSeq).toBe(1)
      expect(payload.pages.find((page) => page.id === fx.second.id)?.headSeq).toBe(0)
    })
  })

  it('남의 프로젝트의 것은 담기지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await realisticProject(ctx)
      const empty = await createProject(ctx, fx.owner.cookie)

      const payload = captured(await captureSnapshot(ctx.db, empty.id))

      expect(payload.menu).toEqual([])
      expect(payload.pages).toEqual([])
      expect(payload.comments).toEqual([])
      // 빈 프로젝트에도 기본 레이아웃은 있다(`insertProject`가 만든다).
      expect(payload.layouts).toHaveLength(1)
    })
  })
})

describe('테마를 병합된 결과로 얼린다 (D5)', () => {
  it('테마를 고르지 않았으면 null이다 — 실패가 아니다', async () => {
    await withApi(async (ctx) => {
      const fx = await realisticProject(ctx)
      await ctx.app.inject({
        method: 'PUT',
        url: `/api/projects/${fx.project.id}/theme`,
        cookies: fx.owner.cookie,
        payload: { themeId: null },
      })

      const payload = captured(await captureSnapshot(ctx.db, fx.project.id))

      expect(payload.themes).toHaveLength(1)
      expect(payload.themes[0]!.themeId).toBeNull()
      expect(payload.themes[0]!.theme).toBeNull()
    })
  })

  it('시스템 테마는 그대로 얼린다', async () => {
    await withApi(async (ctx) => {
      const fx = await realisticProject(ctx)

      const payload = captured(await captureSnapshot(ctx.db, fx.project.id))

      // 프로젝트를 만들면 기본 레이아웃이 시스템 `admin`을 가리킨다(`repos/projects.ts`).
      expect(payload.themes[0]!.theme?.meta.id).toBe(systemTheme('admin')!.meta.id)
    })
  })

  /** **워커가 재서 보고할 것 (ㄱ)** — 병합 결과가 `ThemeSchema`를 통과하는가. */
  it('파생 테마의 병합 결과가 ThemeSchema를 통과한다', async () => {
    await withApi(async (ctx) => {
      const fx = await realisticProject(ctx)
      await chooseDerivedTheme(ctx, fx)

      const payload = captured(await captureSnapshot(ctx.db, fx.project.id))

      const frozen = payload.themes[0]!.theme
      expect(frozen).not.toBeNull()
      expect(ThemeSchema.safeParse(frozen).success).toBe(true)
    })
  })

  /**
   * **워커가 재서 보고할 것 (ㄴ)** — `extends`가 남아 있지 않은가. 남아 있으면 payload가
   * 자기완결이 아니고 D5가 거짓이 된다(§4.5의 *"참조만 저장하면 …"*).
   *
   * **두 층으로 잰다.** `meta.extends`가 없는지와, 문서 전체를 직렬화했을 때 그 문자열이
   * 어디에도 없는지. 앞쪽만 보면 절 어딘가에 남은 참조를 놓친다.
   */
  it('병합 결과에 extends가 남지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await realisticProject(ctx)
      await chooseDerivedTheme(ctx, fx)

      const payload = captured(await captureSnapshot(ctx.db, fx.project.id))

      const frozen = payload.themes[0]!.theme!
      expect(Object.hasOwn(frozen.meta, 'extends')).toBe(false)
      expect(JSON.stringify(frozen)).not.toContain('extends')
    })
  })

  it('파생이 덮어쓴 값이 병합 결과에 살아 있다 — 얼린 것이 base가 아니다', async () => {
    await withApi(async (ctx) => {
      const fx = await realisticProject(ctx)
      await chooseDerivedTheme(ctx, fx)

      const payload = captured(await captureSnapshot(ctx.db, fx.project.id))

      const frozen = payload.themes[0]!.theme!
      expect(frozen.tokens?.semantic?.['primary']).toBe('#ff0000')
      // base의 다른 절이 함께 내려왔다 — 병합이 실제로 일어났다는 증거다.
      expect(frozen.primitives).toBeDefined()
    })
  })

  it('themeId도 함께 남는다 — 복원이 그 행이 아직 있는지 물을 수 있어야 한다', async () => {
    await withApi(async (ctx) => {
      const fx = await realisticProject(ctx)
      const themeId = await chooseDerivedTheme(ctx, fx)

      const payload = captured(await captureSnapshot(ctx.db, fx.project.id))

      expect(payload.themes[0]!.themeId).toBe(themeId)
      expect(payload.themes[0]!.layoutId).toBe(payload.layouts[0]!.id)
    })
  })
})

describe('저장된 문서를 그대로 담는다 (D4)', () => {
  /**
   * §13.1이 적어 둔 그 상태 — 저장된 문서의 버전이 `CURRENT_DOCUMENT_VERSION`보다 큰
   * 페이지. **그런 페이지가 하나 있어도 프로젝트 전체 캡처가 성공해야 한다.** 실패하면
   * 사용자는 그 페이지를 복구하려는 바로 그 순간에 얼릴 수단을 잃는다.
   */
  it('CURRENT_DOCUMENT_VERSION보다 큰 페이지가 있어도 캡처가 성공한다', async () => {
    await withApi(async (ctx) => {
      const fx = await realisticProject(ctx)
      await ctx.db
        .updateTable('pages')
        .set({
          schema_version: CURRENT_DOCUMENT_VERSION + 1,
          schema: JSON.stringify({
            version: CURRENT_DOCUMENT_VERSION + 1,
            root: { id: 'n_future', type: 'Page', children: [] },
          }),
        })
        .where('id', '=', fx.second.id)
        .execute()

      const payload = captured(await captureSnapshot(ctx.db, fx.project.id))

      const frozen = payload.pages.find((page) => page.id === fx.second.id)!
      expect(frozen.schemaVersion).toBe(CURRENT_DOCUMENT_VERSION + 1)
      expect(frozen.schema.version).toBe(CURRENT_DOCUMENT_VERSION + 1)
      expect(frozen.schema.root.id).toBe('n_future')
    })
  })

  it('같은 요청으로 그 페이지를 GET하면 400이다 — 캡처만 살아남는다', async () => {
    await withApi(async (ctx) => {
      const fx = await realisticProject(ctx)
      await ctx.db
        .updateTable('pages')
        .set({ schema_version: 999, schema: JSON.stringify({ version: 999, root: { id: 'n_x', type: 'Page' } }) })
        .where('id', '=', fx.second.id)
        .execute()

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fx.project.id}/pages/${fx.second.id}`,
        cookies: fx.owner.cookie,
      })

      expect(res.statusCode).toBe(400)
      expect((await captureSnapshot(ctx.db, fx.project.id)).kind).toBe('captured')
    })
  })
})

/**
 * # `capturedAt`은 **어느 시계의, 어느 순간인가** (델타 리뷰)
 *
 * 두 축이 있고 **둘 다 케이스로 갈린다.**
 *
 * | 축 | 무엇을 고르나 | 아래 어느 케이스가 잡나 |
 * |---|---|---|
 * | **시계** | Postgres(`clock_timestamp()`) vs Node(`new Date()`) | `Node의 시계를 갈아 끼워도 …` |
 * | **순간** | 수집 **후** 지문 vs 수집 **전** 지문 | `수집 한가운데보다 뒤다` |
 *
 * **앞 라운드에서 이 둘을 변이로 심고 0 사망을 보고하면서 원인을 *"구조적으로 구분할 수
 * 없다"*고 단정했다. 그것이 거짓이었다** — 구조가 아니라 **겨냥**의 문제였다. 그때 있던
 * 케이스는 등식(`capturedAt === created_at`)과 *"지문이 증명한 구간 안"*이라는 성질을
 * 재고 있었는데, **두 축 모두 그 두 성질을 바꾸지 않는다.** 시계를 바꿔도 등식은
 * `insertSnapshot`이 파생시키므로 그대로이고, 구간의 어느 끝을 골라도 둘 다 구간 안이다.
 *
 * **겨냥을 옮기면 죽는다.** 시계는 *"두 시계를 갈라 놓고 어느 쪽을 따라가는지"*를,
 * 순간은 *"수집 한가운데를 기준으로 앞인지 뒤인지"*를 재야 한다. 아래 둘이 그것이다.
 */
describe('capturedAt이 어느 시계의 어느 순간인가', () => {
  // 가짜 시계를 쓰는 케이스가 있으므로 뒤에 반드시 되돌린다 — 남으면 같은 파일의 다른
  // 케이스(그리고 같은 포크에서 뒤에 도는 파일 전부)가 2030년에서 돈다.
  afterEach(() => {
    vi.useRealTimers()
  })

  /**
   * **시계 축.** `toFake: ['Date']`로 **Node의 시계만** 2030으로 갈아 끼운다. Postgres의
   * `clock_timestamp()`는 그대로이므로 **두 시계가 갈라진다** — 그 상태에서 `capturedAt`이
   * 어느 쪽을 따라가는지가 곧 답이다.
   *
   * **`toFake`를 `['Date']`로 좁히는 것이 요점이다.** 통째로 가짜 타이머를 켜면
   * `setTimeout`까지 멈춰 `pg` 드라이버가 응답을 기다리다 걸린다 — 재는 대상이 아니라
   * 하네스가 죽는다.
   *
   * **등식은 이 케이스가 재는 것이 아니다.** `insertSnapshot`이 `created_at`을
   * `capturedAt`에서 파생시키므로 시계를 무엇으로 바꾸든 둘은 같다. 그래서 등식을 보는
   * 케이스로는 이 축이 **0 사망**이었다.
   */
  it('Node의 시계를 갈아 끼워도 capturedAt은 DB의 시계를 따른다', async () => {
    await withApi(async (ctx) => {
      const fx = await realisticProject(ctx)

      vi.useFakeTimers({ toFake: ['Date'] })
      vi.setSystemTime(new Date('2030-06-01T00:00:00.000Z'))
      // 가짜가 실제로 걸렸는지 먼저 확인한다 — 안 걸렸으면 아래가 공허하게 통과한다.
      expect(new Date().getUTCFullYear()).toBe(2030)

      const payload = captured(await captureSnapshot(ctx.db, fx.project.id))

      // `Date.parse`는 가짜 시계와 무관하다(파싱은 "지금"을 읽지 않는다).
      expect(new Date(Date.parse(payload.capturedAt)).getUTCFullYear()).not.toBe(2030)

      // 양성 대조: DB의 시계와는 가깝다. 같은 트랜잭션에서 읽되 `now()`가 아니라
      // `clock_timestamp()`여야 한다(`now()`는 트랜잭션 시작 시각이라 얼어 있다).
      const dbNow = await sql<{ at: Date }>`select clock_timestamp() as at`.execute(ctx.db)
      expect(Math.abs(Date.parse(payload.capturedAt) - dbNow.rows[0]!.at.getTime())).toBeLessThan(10_000)
    })
  })

  /**
   * **순간 축.** 수집 **한가운데**에서 DB 시계를 읽어 기준점으로 삼는다. `capturedAt`이
   * 수집 **후** 지문의 시각이면 그 기준점보다 **뒤**이고, 수집 **전** 지문의 시각이면
   * **앞**이다 — 부호가 뒤집힌다.
   *
   * **훅이 상태를 바꾸지 않는 것이 요점이다.** `pg_sleep`과 `clock_timestamp()`는 아무것도
   * 쓰지 않으므로 지문이 그대로이고 캡처가 **성공한다** — 그래야 `capturedAt`을 볼 수 있다.
   * 앞 라운드의 훅들은 전부 상태를 바꿔 `fingerprint-mismatch`로 끝났고, 그래서 이 축을
   * 잴 기회가 아예 없었다.
   *
   * **앞뒤로 50ms씩 재우는 이유:** `clock_timestamp()`는 마이크로초인데 JS `Date`는
   * 밀리초라, 질의 몇 개 사이의 간격이 0ms로 접히면 부등호가 동률에서 흔들린다. 양쪽에
   * 여유를 두면 올바른 판에서는 `+50ms`, 뒤집힌 판에서는 `-50ms` 근처가 되어 부호가
   * 확실히 갈린다.
   */
  it('capturedAt은 수집 한가운데보다 뒤다 — 지문이 증명한 구간의 닫는 끝이다', async () => {
    await withApi(async (ctx) => {
      const fx = await realisticProject(ctx)
      let middle: Date | undefined

      const payload = captured(
        await captureSnapshot(ctx.db, fx.project.id, {
          afterPages: async () => {
            // **아무것도 바꾸지 않는다** — 바꾸면 지문이 어긋나 캡처가 실패한다.
            await sql`select pg_sleep(0.05)`.execute(ctx.db)
            const row = await sql<{ at: Date }>`select clock_timestamp() as at`.execute(ctx.db)
            middle = row.rows[0]!.at
            await sql`select pg_sleep(0.05)`.execute(ctx.db)
          },
        }),
      )

      expect(middle).toBeDefined()
      expect(Date.parse(payload.capturedAt)).toBeGreaterThan(middle!.getTime())
    })
  })
})

describe('지문이 어긋나면 값으로 실패한다 (D6)', () => {
  it('아무도 안 건드리면 캡처가 성공한다 — 음성 대조', async () => {
    await withApi(async (ctx) => {
      const fx = await realisticProject(ctx)

      expect((await captureSnapshot(ctx.db, fx.project.id)).kind).toBe('captured')
    })
  })

  it('수집 도중 페이지가 하나 늘면 지문 불일치다', async () => {
    await withApi(async (ctx) => {
      const fx = await realisticProject(ctx)

      const outcome = await captureSnapshot(ctx.db, fx.project.id, {
        afterPages: async () => {
          await createPage(ctx, fx.owner.cookie, fx.project.id, fx.childMenu.id, { title: '끼어든 페이지' })
        },
      })

      expect(outcome.kind).toBe('fingerprint-mismatch')
    })
  })

  it('수집 도중 코멘트가 하나 늘면 지문 불일치다', async () => {
    await withApi(async (ctx) => {
      const fx = await realisticProject(ctx)

      const outcome = await captureSnapshot(ctx.db, fx.project.id, {
        afterPages: async () => {
          const res = await ctx.app.inject({
            method: 'POST',
            url: `/api/projects/${fx.project.id}/pages/${fx.first.id}/comments`,
            cookies: fx.owner.cookie,
            payload: { nodeId: fx.rootNodeId, body: '끼어든 코멘트' },
          })
          if (res.statusCode !== 201) throw new Error(`끼어들기 실패 (${res.statusCode}): ${res.body}`)
        },
      })

      expect(outcome.kind).toBe('fingerprint-mismatch')
    })
  })

  /**
   * **계획서 D6의 지문으로는 못 잡던 자리다.** 그쪽은 `menu_nodes`를 `count` +
   * `max(created_at)`로 봤는데, 그 표에는 **`updated_at` 컬럼이 아예 없어서**(0003)
   * 제목만 바뀌면 둘 다 그대로다. 하네스의 성질이 아니라 운영에서도 참인 구멍이었고,
   * 지문을 내용 기반으로 바꾼 이유의 절반이다(`repos/snapshots.ts`의 표).
   */
  it('수집 도중 메뉴 제목이 바뀌면 지문 불일치다', async () => {
    await withApi(async (ctx) => {
      const fx = await realisticProject(ctx)

      const outcome = await captureSnapshot(ctx.db, fx.project.id, {
        afterPages: async () => {
          const res = await ctx.app.inject({
            method: 'PATCH',
            url: `/api/projects/${fx.project.id}/menu/${fx.rootMenu.id}`,
            cookies: fx.owner.cookie,
            payload: { title: '환경설정' },
          })
          if (res.statusCode !== 200) throw new Error(`메뉴 수정 실패 (${res.statusCode}): ${res.body}`)
        },
      })

      expect(outcome.kind).toBe('fingerprint-mismatch')
    })
  })

  /**
   * **여기도 계획서 D6으로는 못 잡았다** — `updateTheme`이 `updated_at`을 `now()`
   * (=트랜잭션 시작 시각)로 쓰는데 하네스가 테스트 하나를 트랜잭션 하나로 감싸므로 그 값이
   * 얼어 있다. 운영에서는 요청마다 트랜잭션이 갈려 움직이지만, **잴 수 없는 방어는 다음
   * 사람이 지운다.** 내용 지문은 하네스에서도 잡힌다.
   */
  it('수집 도중 테마가 바뀌면 지문 불일치다', async () => {
    await withApi(async (ctx) => {
      const fx = await realisticProject(ctx)
      const themeId = await chooseDerivedTheme(ctx, fx)

      const outcome = await captureSnapshot(ctx.db, fx.project.id, {
        afterPages: async () => {
          const res = await ctx.app.inject({
            method: 'PUT',
            url: `/api/projects/${fx.project.id}/themes/${themeId}`,
            cookies: fx.owner.cookie,
            payload: {
              theme: {
                meta: { id: 'derived', name: '파생 테마', version: '1.0.1', extends: 'system:admin' },
                tokens: { semantic: { primary: '#0000ff' } },
              },
            },
          })
          if (res.statusCode !== 200) throw new Error(`테마 수정 실패 (${res.statusCode}): ${res.body}`)
        },
      })

      expect(outcome.kind).toBe('fingerprint-mismatch')
    })
  })

  /**
   * **사실 5 — 이 갈래는 무엇을 되돌리는가.** 답은 *"되돌릴 것이 없다"*이고, 그 근거는
   * 캡처가 아무것도 쓰지 않는다는 것이다. 이 케이스가 그것을 값으로 확인한다.
   */
  it('지문 불일치로 끝나면 snapshots에 행이 남지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await realisticProject(ctx)

      const outcome = await captureSnapshot(ctx.db, fx.project.id, {
        afterPages: async () => {
          await createPage(ctx, fx.owner.cookie, fx.project.id, fx.childMenu.id, { title: '끼어든 페이지' })
        },
      })

      expect(outcome.kind).toBe('fingerprint-mismatch')
      expect(await listSnapshots(ctx.db, fx.project.id)).toHaveLength(0)
    })
  })

  /**
   * **남의 프로젝트 편집은 지문을 흔들지 않는다.** 지문이 프로젝트로 좁혀지지 않으면
   * 무관한 편집이 409를 만들고, 그러면 붐비는 서버에서 스냅샷을 영영 못 뜬다.
   */
  it('다른 프로젝트가 바뀌는 것은 지문에 잡히지 않는다', async () => {
    await withApi(async (ctx) => {
      const fx = await realisticProject(ctx)
      const other = await createProject(ctx, fx.owner.cookie)
      const otherMenu = await createMenuNode(ctx, fx.owner.cookie, other.id)

      const outcome = await captureSnapshot(ctx.db, fx.project.id, {
        afterPages: async () => {
          await createPage(ctx, fx.owner.cookie, other.id, otherMenu.id, { title: '남의 페이지' })
        },
      })

      expect(outcome.kind).toBe('captured')
    })
  })
})
