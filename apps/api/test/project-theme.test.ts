/**
 * **프로젝트의 테마 바인딩**(`src/routes/project-theme.ts`) — 읽기 · owner 저장(`theme_rev` 낙관적 동시성) · impact · `theme-changed`.
 *
 * 강등과 겹친 저장은 `guard-in-lock.test.ts` 의 `PROJECT_PROBES` 가, 복원 잠금 뒤에 서는 것은 `restore-lock-census.test.ts` 가 잰다.
 */
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readWbtheme, type ThemeManifest } from '@wirebound/themes'
import { insertThemePackage, setThemePackageHidden } from '../src/repos/theme-packages'
import {
  addMember,
  createMenuNode,
  createPage,
  createProject,
  resetRealData,
  signup,
  withApi,
  withProxiedRealApi,
  withRealApi,
  type SignedUpUser,
  type TestContext,
} from './helpers'
import { laterAdminVersion, SYSTEM_ADMIN } from '@wirebound/test-support/system-admin'
import { manifestOf, packed } from './theme-fixtures'

/** 새 프로젝트가 고정하는 system-admin 의 판과 색 토큰 — 글자로 적지 않는다(`@wirebound/test-support/system-admin`). */
const V = SYSTEM_ADMIN.version
const C = SYSTEM_ADMIN.color.key
import { joinRoom, type WsProbe } from './ws-client'

async function store(ctx: TestContext, manifest: ThemeManifest): Promise<void> {
  const bytes = packed(manifest)
  const { files, issues } = readWbtheme(bytes)
  if (files === null) throw new Error(`픽스처가 검증을 못 지났다: ${JSON.stringify(issues)}`)
  await insertThemePackage(ctx.db, {
    manifest: files.manifest,
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    uploadedBy: null,
  })
}

/** `sample` — `color.accent` 하나 · `Button` 에 `solid` · `ghost`. */
const SAMPLE = manifestOf('sample', '1.0.0', {
  tokens: {
    items: {
      'color.accent': { type: 'color', label: '강조', default: '#e11d48' },
      'radius.md': { type: 'number', label: '모서리', default: 4 },
    },
  },
  components: {
    Button: {
      variants: [
        { id: 'solid', label: '채움' },
        { id: 'ghost', label: '빈' },
      ],
      defaultVariant: 'solid',
    },
  },
})

interface Fixture {
  owner: SignedUpUser
  editor: SignedUpUser
  viewer: SignedUpUser
  projectId: string
}

async function fixture(ctx: TestContext): Promise<Fixture> {
  const owner = await signup(ctx)
  const editor = await signup(ctx)
  const viewer = await signup(ctx)
  const project = await createProject(ctx, owner.cookie)
  await addMember(ctx, project.id, editor.user.id, 'editor')
  await addMember(ctx, project.id, viewer.user.id, 'viewer')
  return { owner, editor, viewer, projectId: project.id }
}

function put(ctx: TestContext, fx: Fixture, who: SignedUpUser, body: unknown) {
  return ctx.app.inject({ method: 'PUT', url: `/api/projects/${fx.projectId}/theme`, cookies: who.cookie, payload: body as object })
}

function getTheme(ctx: TestContext, fx: Fixture, who: SignedUpUser) {
  return ctx.app.inject({ method: 'GET', url: `/api/projects/${fx.projectId}/theme`, cookies: who.cookie })
}

describe('GET …/theme', () => {
  it('viewer 가 읽는다 — 새 프로젝트는 system-admin 최신판 · 빈 토큰 · rev 0', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await getTheme(ctx, fx, fx.viewer)
      expect(res.statusCode).toBe(200)
      const body = res.json()
      expect({ ...body, manifest: body.manifest.id }).toEqual({
        themeId: 'system-admin',
        version: V,
        tokens: {},
        rev: 0,
        manifest: 'system-admin',
        latest: V,
        latestName: body.manifest.name,
      })
    })
  })

  it('latestName 은 latest 판의 이름이다 — 고정한 판의 이름과 다르면 그 판의 것이 아니다 · 숨기지 않은 판이 없으면 null', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      await store(ctx, manifestOf('system-admin', laterAdminVersion(1), { name: '새 이름' }))
      const later = (await getTheme(ctx, fx, fx.viewer)).json()
      expect(later.manifest.name).not.toBe('새 이름')
      expect(later).toMatchObject({ version: V, latest: laterAdminVersion(1), latestName: '새 이름' })
      await setThemePackageHidden(ctx.db, 'system-admin', laterAdminVersion(1), true)
      await setThemePackageHidden(ctx.db, 'system-admin', V, true)
      expect((await getTheme(ctx, fx, fx.viewer)).json()).toMatchObject({ version: V, latest: null, latestName: null })
    })
  })

  it('latest 는 같은 테마의 숨기지 않은 최신판이다', async () => {
    await withApi(async (ctx) => {
      await store(ctx, manifestOf('system-admin', laterAdminVersion(1)))
      await store(ctx, manifestOf('system-admin', laterAdminVersion(2)))
      await setThemePackageHidden(ctx.db, 'system-admin', laterAdminVersion(2), true)
      const fx = await fixture(ctx)
      // 새 프로젝트는 숨기지 않은 최신판에 고정된다.
      expect((await getTheme(ctx, fx, fx.viewer)).json()).toMatchObject({ version: laterAdminVersion(1), latest: laterAdminVersion(1) })
    })
  })
})

describe('PUT …/theme', () => {
  it('owner 가 토큰을 저장한다 — rev 가 오르고 기본값과 같은 값은 빠진다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const res = await put(ctx, fx, fx.owner, {
        themeId: 'system-admin',
        version: V,
        tokens: { [C]: '#123456', [SYSTEM_ADMIN.otherColor.key]: SYSTEM_ADMIN.otherColor.value },
        rev: 0,
      })
      expect(res.statusCode, res.body).toBe(200)
      expect(res.json()).toMatchObject({ themeId: 'system-admin', version: V, tokens: { [C]: '#123456' }, rev: 1 })
      const row = await ctx.db
        .selectFrom('projects')
        .select(['theme_tokens', 'theme_rev'])
        .where('id', '=', fx.projectId)
        .executeTakeFirstOrThrow()
      expect(row).toEqual({ theme_tokens: { [C]: '#123456' }, theme_rev: 1 })
    })
  })

  it('옛 rev 는 409 이고 지금 값을 싣는다 — 같은 rev 를 두 번 보내면 둘째가 409', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const body = { themeId: 'system-admin', version: V, tokens: { [C]: '#111111' }, rev: 0 }
      expect((await put(ctx, fx, fx.owner, body)).statusCode).toBe(200)
      const second = await put(ctx, fx, fx.owner, { ...body, tokens: { [C]: '#222222' } })
      expect(second.statusCode).toBe(409)
      const current = second.json().current
      expect({ rev: current.rev, tokens: current.tokens, manifest: current.manifest.id }).toEqual({
        rev: 1,
        tokens: { [C]: '#111111' },
        manifest: 'system-admin',
      })
      const row = await ctx.db.selectFrom('projects').select('theme_tokens').where('id', '=', fx.projectId).executeTakeFirstOrThrow()
      expect(row.theme_tokens).toEqual({ [C]: '#111111' })
    })
  })

  it('editor · viewer 는 403', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const body = { themeId: 'system-admin', version: V, tokens: {}, rev: 0 }
      expect((await put(ctx, fx, fx.editor, body)).statusCode).toBe(403)
      expect((await put(ctx, fx, fx.viewer, body)).statusCode).toBe(403)
    })
  })

  it('다른 테마로 바꾼다 — 서버는 새 manifest 로 검증만 하고 보낸 토큰을 저장한다', async () => {
    await withApi(async (ctx) => {
      await store(ctx, SAMPLE)
      const fx = await fixture(ctx)
      await put(ctx, fx, fx.owner, { themeId: 'system-admin', version: V, tokens: { [C]: '#111111' }, rev: 0 })
      const moved = await put(ctx, fx, fx.owner, { themeId: 'sample', version: '1.0.0', tokens: { 'color.accent': '#00ff00' }, rev: 1 })
      expect(moved.statusCode, moved.body).toBe(200)
      expect(moved.json()).toMatchObject({
        themeId: 'sample',
        version: '1.0.0',
        tokens: { 'color.accent': '#00ff00' },
        rev: 2,
        latest: '1.0.0',
      })
      expect(moved.json().manifest.id).toBe('sample')
    })
  })

  it('옛 테마의 토큰을 실어 보내면 422 — 새 manifest 에 없는 키다', async () => {
    await withApi(async (ctx) => {
      await store(ctx, SAMPLE)
      const fx = await fixture(ctx)
      const res = await put(ctx, fx, fx.owner, { themeId: 'sample', version: '1.0.0', tokens: { [C]: '#111111' }, rev: 0 })
      expect(res.statusCode).toBe(422)
    })
  })

  it('숫자 토큰은 숫자로 받고 기본값과 같으면 뺀다', async () => {
    await withApi(async (ctx) => {
      await store(ctx, SAMPLE)
      const fx = await fixture(ctx)
      const same = await put(ctx, fx, fx.owner, { themeId: 'sample', version: '1.0.0', tokens: { 'radius.md': 4 }, rev: 0 })
      expect(same.json().tokens).toEqual({})
      const other = await put(ctx, fx, fx.owner, { themeId: 'sample', version: '1.0.0', tokens: { 'radius.md': 8 }, rev: 1 })
      expect(other.json().tokens).toEqual({ 'radius.md': 8 })
    })
  })

  describe('숨긴 판 (Review Focus 2)', () => {
    it('고정한 판을 숨긴 뒤 토큰만 저장하는 것은 받는다', async () => {
      await withApi(async (ctx) => {
        await store(ctx, SAMPLE)
        const fx = await fixture(ctx)
        expect((await put(ctx, fx, fx.owner, { themeId: 'sample', version: '1.0.0', tokens: {}, rev: 0 })).statusCode).toBe(200)
        await setThemePackageHidden(ctx.db, 'sample', '1.0.0', true)
        const res = await put(ctx, fx, fx.owner, { themeId: 'sample', version: '1.0.0', tokens: { 'color.accent': '#000000' }, rev: 1 })
        expect(res.statusCode, res.body).toBe(200)
        expect(res.json()).toMatchObject({ rev: 2, tokens: { 'color.accent': '#000000' }, latest: null, latestName: null })
      })
    })

    it('숨긴 판으로 새로 바꾸는 것은 422 hidden-version', async () => {
      await withApi(async (ctx) => {
        await store(ctx, SAMPLE)
        await setThemePackageHidden(ctx.db, 'sample', '1.0.0', true)
        const fx = await fixture(ctx)
        const res = await put(ctx, fx, fx.owner, { themeId: 'sample', version: '1.0.0', tokens: {}, rev: 0 })
        expect(res.statusCode).toBe(422)
        expect(res.json().error.issues.map((issue: { code: string }) => issue.code)).toEqual(['hidden-version'])
        expect((await getTheme(ctx, fx, fx.owner)).json()).toMatchObject({ themeId: 'system-admin', rev: 0 })
      })
    })

    it('같은 테마의 다른 숨긴 판으로 옮기는 것도 422', async () => {
      await withApi(async (ctx) => {
        await store(ctx, manifestOf('system-admin', laterAdminVersion(1)))
        await setThemePackageHidden(ctx.db, 'system-admin', laterAdminVersion(1), true)
        const fx = await fixture(ctx)
        const res = await put(ctx, fx, fx.owner, { themeId: 'system-admin', version: laterAdminVersion(1), tokens: {}, rev: 0 })
        expect(res.statusCode).toBe(422)
      })
    })
  })

  describe('토큰 검증 · 한도', () => {
    // 한 422 가 이유 여럿을 나른다 — 케이스마다 이유(코드)까지 본다.
    it.each([
      ['CSS 를 깨는 값', { [C]: 'red;}' }, 'token-default-type'],
      ['선언에 없는 키', { 'nope.key': '#000000' }, 'unknown-token'],
      // 스냅샷 payload(`jsonb`)가 못 받는 글자 — 받으면 그 프로젝트의 스냅샷 · 복원이 막힌다(`project-theme-review.test.ts`).
      ['NUL 이 든 값', { [C]: 'red\u0000' }, 'token-value-char'],
      ['짝 없는 서로게이트가 든 값', { [C]: 'red\ud800' }, 'token-value-char'],
    ])('%s → 422 %s · 저장 안 됨', async (_label, tokens, code) => {
      await withApi(async (ctx) => {
        const fx = await fixture(ctx)
        const res = await put(ctx, fx, fx.owner, { themeId: 'system-admin', version: V, tokens, rev: 0 })
        expect(res.statusCode, res.body).toBe(422)
        expect(res.json().error.issues.map((issue: { code: string }) => issue.code)).toEqual([code])
        expect((await getTheme(ctx, fx, fx.owner)).json()).toMatchObject({ tokens: {}, rev: 0 })
      })
    })

    it('값 하나는 200 자까지 — 201 자는 422 token-too-long', async () => {
      await withApi(async (ctx) => {
        await store(
          ctx,
          manifestOf('fonty', '1.0.0', { tokens: { items: { 'font.body': { type: 'font', label: '본문', default: 'serif' } } } }),
        )
        const fx = await fixture(ctx)
        const at = `F${'x'.repeat(199)}`
        const ok = await put(ctx, fx, fx.owner, { themeId: 'fonty', version: '1.0.0', tokens: { 'font.body': at }, rev: 0 })
        expect(ok.statusCode, ok.body).toBe(200)
        expect(ok.json().tokens).toEqual({ 'font.body': at })
        const over = await put(ctx, fx, fx.owner, { themeId: 'fonty', version: '1.0.0', tokens: { 'font.body': `${at}x` }, rev: 1 })
        expect(over.statusCode).toBe(422)
        expect(over.json().error.issues.map((issue: { code: string }) => issue.code)).toEqual(['token-too-long'])
      })
    })

    it('전체 JSON 이 16 KB 를 넘으면 422 token-too-large', async () => {
      await withApi(async (ctx) => {
        const items = Object.fromEntries(
          Array.from({ length: 100 }, (_, i) => [`font.f${i}`, { type: 'font', label: `글꼴 ${i}`, default: 'serif' }]),
        )
        await store(ctx, manifestOf('many', '1.0.0', { tokens: { items } as ThemeManifest['tokens'] }))
        const fx = await fixture(ctx)
        const tokens = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`font.f${i}`, `F${'x'.repeat(190)}`]))
        const res = await put(ctx, fx, fx.owner, { themeId: 'many', version: '1.0.0', tokens, rev: 0 })
        expect(res.statusCode, res.body).toBe(422)
        expect(res.json().error.issues.map((issue: { code: string }) => issue.code)).toEqual(['token-too-large'])
      })
    })

    it('없는 패키지는 404', async () => {
      await withApi(async (ctx) => {
        const fx = await fixture(ctx)
        expect((await put(ctx, fx, fx.owner, { themeId: 'nope', version: '1.0.0', tokens: {}, rev: 0 })).statusCode).toBe(404)
      })
    })

    it('본문이 틀리면 400', async () => {
      await withApi(async (ctx) => {
        const fx = await fixture(ctx)
        expect((await put(ctx, fx, fx.owner, { themeId: 'system-admin', version: V, tokens: {} })).statusCode).toBe(400)
        expect((await put(ctx, fx, fx.owner, { themeId: 'system-admin', version: V, tokens: [], rev: 0 })).statusCode).toBe(400)
        // 값은 글자나 수다 — 그 밖은 본문 모양에서 끊는다.
        const bool = await put(ctx, fx, fx.owner, { themeId: 'system-admin', version: V, tokens: { [C]: true }, rev: 0 })
        expect(bool.statusCode).toBe(400)
      })
    })
  })

  it('GET /api/projects/:projectId 의 themeRev 가 저장 뒤 1 이다', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      const project = () => ctx.app.inject({ method: 'GET', url: `/api/projects/${fx.projectId}`, cookies: fx.viewer.cookie })
      expect((await project()).json().themeRev).toBe(0)
      await put(ctx, fx, fx.owner, { themeId: 'system-admin', version: V, tokens: { [C]: '#111111' }, rev: 0 })
      expect((await project()).json().themeRev).toBe(1)
    })
  })
})

describe('두 owner 의 동시 저장', () => {
  beforeEach(resetRealData)
  afterEach(resetRealData)

  // «바탕을 읽은 뒤 안 바뀌었다» 의 둘째 겹(갱신 문장의 `WHERE theme_rev`)을 혼자 잰다 — A 는 핸들러의 rev 견주기를 이미 지나
  // 갱신 앞에 붙잡혀 있어 첫 겹이 못 본다. 첫 겹은 `project-theme-review.test.ts` «숨긴 판을 다시 고르는 경주» 가 잰다.
  it('바탕을 읽고 갱신 앞에 선 저장은, 그 사이 같은 rev 로 커밋된 저장 뒤에 409 다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const other = await signup(ctx)
      await addMember(ctx, fx.projectId, other.user.id, 'owner')
      const hold = ctx.proxy.holdQuery('update "projects"')
      const pendingA = put(ctx, fx, fx.owner, { themeId: 'system-admin', version: V, tokens: { [C]: '#aaaaaa' }, rev: 0 })
      await hold.held
      const b = await put(ctx, fx, other, { themeId: 'system-admin', version: V, tokens: { [C]: '#bbbbbb' }, rev: 0 })
      expect(b.statusCode, b.body).toBe(200)
      hold.release()
      const a = await pendingA
      expect(a.statusCode, a.body).toBe(409)
      expect(a.json().current).toMatchObject({ tokens: { [C]: '#bbbbbb' }, rev: 1 })
      const row = await ctx.db
        .selectFrom('projects')
        .select(['theme_tokens', 'theme_rev'])
        .where('id', '=', fx.projectId)
        .executeTakeFirstOrThrow()
      expect(row).toEqual({ theme_tokens: { [C]: '#bbbbbb' }, theme_rev: 1 })
    })
  })
})

describe('방송 — theme-changed', () => {
  beforeEach(resetRealData)
  afterEach(resetRealData)
  const opened: WsProbe[] = []
  afterEach(() => {
    for (const probe of opened.splice(0)) probe.close()
  })

  it('저장 뒤 룸의 viewer 와 보낸 사람의 다른 연결이 받는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const viewer = await joinRoom(ctx.port, fx.projectId, fx.viewer.cookie.wb_session)
      const ownerOther = await joinRoom(ctx.port, fx.projectId, fx.owner.cookie.wb_session)
      opened.push(viewer, ownerOther)
      const res = await put(ctx, fx, fx.owner, {
        themeId: 'system-admin',
        version: V,
        tokens: { [C]: '#123456' },
        rev: 0,
      })
      expect(res.statusCode).toBe(200)
      for (const probe of [viewer, ownerOther]) {
        const frame = await probe.waitFor('theme-changed')
        expect(frame).toEqual({
          type: 'theme-changed',
          projectId: fx.projectId,
          themeId: 'system-admin',
          version: V,
          tokens: { [C]: '#123456' },
          rev: 1,
        })
      }
    })
  })

  it('거절된 저장(409)은 방송하지 않는다', async () => {
    await withRealApi(async (ctx) => {
      const fx = await fixture(ctx)
      const viewer = await joinRoom(ctx.port, fx.projectId, fx.viewer.cookie.wb_session)
      opened.push(viewer)
      expect((await put(ctx, fx, fx.owner, { themeId: 'system-admin', version: V, tokens: {}, rev: 7 })).statusCode).toBe(409)
      // 조용한 창을 지난 뒤 받은 것 전부를 본다 — `quiet()` 의 반환은 창 안의 것뿐이라 답보다 먼저 닿은 프레임을 못 본다.
      await viewer.quiet()
      expect(viewer.received.filter((frame) => frame.type === 'theme-changed')).toEqual([])
    })
  })
})

describe('GET …/theme/impact', () => {
  const doc = (nodes: object[]) => JSON.stringify({ version: 3, root: { id: 'n_root', type: 'Page', children: nodes } })

  async function pagesWithButtons(ctx: TestContext, fx: Fixture) {
    const menu = await createMenuNode(ctx, fx.owner.cookie, fx.projectId)
    const first = await createPage(ctx, fx.owner.cookie, fx.projectId, menu.id, { title: '첫 페이지' })
    const second = await createPage(ctx, fx.owner.cookie, fx.projectId, menu.id, { title: '둘째 페이지' })
    const button = (id: string, variant?: string) => ({ id, type: 'Button', props: { label: '저장' }, ...(variant ? { variant } : {}) })
    await ctx.db
      .updateTable('pages')
      .set({ schema: doc([button('b1', 'primary'), { id: 's1', type: 'Section', children: [button('b2', 'primary'), button('b3')] }]) })
      .where('id', '=', first.id)
      .execute()
    await ctx.db
      .updateTable('pages')
      .set({ schema: doc([button('b4', 'primary')]) })
      .where('id', '=', second.id)
      .execute()
    return { first, second }
  }

  function impact(ctx: TestContext, fx: Fixture, who: SignedUpUser, themeId: string, version: string) {
    return ctx.app.inject({
      method: 'GET',
      url: `/api/projects/${fx.projectId}/theme/impact?themeId=${themeId}&version=${version}`,
      cookies: who.cookie,
    })
  }

  it('대상이 Button 을 선언하지 않으면 variant 는 0 — 선언이 없으면 모든 값이 통과한다', async () => {
    await withApi(async (ctx) => {
      await store(ctx, manifestOf('plain', '1.0.0'))
      const fx = await fixture(ctx)
      await pagesWithButtons(ctx, fx)
      const res = await impact(ctx, fx, fx.viewer, 'plain', '1.0.0')
      expect(res.statusCode, res.body).toBe(200)
      expect(res.json().variants).toEqual([])
    })
  })

  it('대상이 Button 을 선언하고 primary 가 없으면 페이지마다 센다 — variant 없는 노드는 안 센다', async () => {
    await withApi(async (ctx) => {
      await store(ctx, SAMPLE)
      const fx = await fixture(ctx)
      const { first, second } = await pagesWithButtons(ctx, fx)
      const res = await impact(ctx, fx, fx.viewer, 'sample', '1.0.0')
      expect(res.json().variants).toEqual([
        { pageId: first.id, title: '첫 페이지', count: 2 },
        { pageId: second.id, title: '둘째 페이지', count: 1 },
      ])
    })
  })

  it('토큰 — 이어지는 · 버려지는 · 기본값으로 서는 수', async () => {
    await withApi(async (ctx) => {
      await store(
        ctx,
        manifestOf('next', '1.0.0', {
          tokens: {
            items: {
              [C]: { type: 'color', label: '주색', default: '#000000' },
              [SYSTEM_ADMIN.otherColor.key]: { type: 'length', label: '타입이 다름', default: '1px' },
              'fresh.one': { type: 'color', label: '새것', default: '#ffffff' },
            },
          },
        }),
      )
      const fx = await fixture(ctx)
      await put(ctx, fx, fx.owner, {
        themeId: 'system-admin',
        version: V,
        tokens: { [C]: '#111111', [SYSTEM_ADMIN.otherColor.key]: '#222222', [SYSTEM_ADMIN.thirdColor.key]: '#333333' },
        rev: 0,
      })
      const res = await impact(ctx, fx, fx.viewer, 'next', '1.0.0')
      // 이어짐: 첫째 색(같은 키 · 같은 타입). 버려짐: 둘째 색(타입이 다름) · 셋째 색(없음). 기본값: 새 테마의 나머지 둘.
      expect(res.json().tokens).toEqual({ kept: 1, dropped: 2, defaulted: 2 })
    })
  })

  it('없는 패키지는 404 · 질의가 없으면 400', async () => {
    await withApi(async (ctx) => {
      const fx = await fixture(ctx)
      expect((await impact(ctx, fx, fx.viewer, 'nope', '1.0.0')).statusCode).toBe(404)
      const bare = await ctx.app.inject({ method: 'GET', url: `/api/projects/${fx.projectId}/theme/impact`, cookies: fx.viewer.cookie })
      expect(bare.statusCode).toBe(400)
    })
  })
})
