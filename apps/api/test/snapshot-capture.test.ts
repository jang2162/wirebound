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
import { describe, expect, it } from 'vitest'
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
