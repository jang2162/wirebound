/**
 * **A3 리뷰가 찾은 바인딩 결함의 빨강 케이스**(`docs/superpowers/plans/2026-09-28-a3-review.md` 항목 3 · 4). 리뷰어는 고치지 않았다 —
 * 고칠 때까지 빨강이다.
 *
 * - «숨긴 판을 다시 고르는 경주» — `PUT …/theme` 은 숨긴 판 판정의 바탕(지금 바인딩)을 트랜잭션 밖에서 읽고, 갱신은 **요청이 실은
 *   `rev`** 로만 거른다. 바탕을 읽은 뒤 남이 옮기고, 이 요청이 옮긴 뒤의 `rev` 를 실으면 갱신이 지나 숨긴 판을 새로 고른다.
 * - «토큰 값이 스냅샷 · 복원을 막는다» — `font` 의 따옴표 문자열이 짝 없는 서로게이트 · NUL 을 받는다. `projects.theme_tokens` 는 `json`
 *   이라 저장되고, 캡처가 그 값을 `snapshots.payload`(`jsonb`)에 넣다 죽는다 — 그 프로젝트는 스냅샷도 복원(안전망 캡처)도 못 한다.
 * - «복원은 토큰을 검증하지 않는다» — 판 3 payload 의 `theme.tokens` 를 manifest 로 보지 않고 쓴다. payload 는 서버가 짓는 것이라
 *   API 로 닿는 길은 없다 — 이 판은 DB 의 payload 를 손으로 고쳐 세운다(다른 인스턴스 · 옛 판에서 온 DB 의 모양).
 */
import { createHash } from 'node:crypto'
import { sql } from 'kysely'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readWbtheme, type ThemeManifest } from '@wirebound/themes'
import { insertThemePackage, setThemePackageHidden } from '../src/repos/theme-packages'
import {
  addMember,
  createMenuNode,
  createProject,
  getTestDb,
  resetRealData,
  signup,
  withApi,
  withProxiedRealApi,
  type SignedUpUser,
  type TestContext,
} from './helpers'
import { manifestOf, packed } from './theme-fixtures'

async function store(db: TestContext['db'], manifest: ThemeManifest): Promise<void> {
  const bytes = packed(manifest)
  const { files, issues } = readWbtheme(bytes)
  if (files === null) throw new Error(`픽스처가 검증을 못 지났다: ${JSON.stringify(issues)}`)
  await insertThemePackage(db, {
    manifest: files.manifest,
    bytes,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    uploadedBy: null,
  })
}

/** `font.body` 하나 — 따옴표 문자열이 받는 글자를 잰다. */
const FONT = manifestOf('fonted', '1.0.0', {
  tokens: { items: { 'font.body': { type: 'font', label: '본문', default: 'sans-serif' } } },
} as Partial<ThemeManifest>)

function put(app: TestContext['app'], projectId: string, who: SignedUpUser, body: object) {
  return app.inject({ method: 'PUT', url: `/api/projects/${projectId}/theme`, cookies: who.cookie, payload: body })
}

function snapshot(ctx: TestContext, projectId: string, who: SignedUpUser, tag: string) {
  return ctx.app.inject({ method: 'POST', url: `/api/projects/${projectId}/snapshots`, cookies: who.cookie, payload: { tag } })
}

function restore(ctx: TestContext, projectId: string, who: SignedUpUser, snapshotId: string) {
  return ctx.app.inject({ method: 'POST', url: `/api/projects/${projectId}/snapshots/${snapshotId}/restore`, cookies: who.cookie })
}

describe('숨긴 판을 다시 고르는 경주', () => {
  beforeEach(resetRealData)
  afterEach(resetRealData)

  it('바탕을 읽은 뒤 · 갱신 앞에서 남이 다른 판으로 옮기면, 옮긴 뒤의 rev 로 보낸 숨긴 판 저장은 받지 않는다', async () => {
    await withProxiedRealApi(async (ctx) => {
      const db = getTestDb()
      await store(db, manifestOf('hidden-x', '1.0.0'))
      await store(db, manifestOf('other-y', '1.0.0'))
      const a = await signup(ctx)
      const b = await signup(ctx)
      const project = await createProject(ctx, a.cookie)
      await addMember(ctx, project.id, b.user.id, 'owner')
      expect((await put(ctx.app, project.id, a, { themeId: 'hidden-x', version: '1.0.0', tokens: {}, rev: 0 })).statusCode).toBe(200)
      await setThemePackageHidden(db, 'hidden-x', '1.0.0', true)

      // B 는 바탕(hidden-x@1 · rev 1 — 고정한 판이라 숨김 판정을 지난다)을 읽고 갱신에 붙잡힌다. 고친 판이 갱신 앞에서 끝내면
      // (먼저 rev 를 견줌) 붙잡을 질의가 없다 — 그때는 B 가 먼저 끝난 것을 판으로 받는다. 어느 쪽이든 B 는 A 가 옮기기 전에 읽었다.
      const hold = ctx.proxy.holdQuery('update "projects"')
      const pendingB = put(ctx.app, project.id, b, { themeId: 'hidden-x', version: '1.0.0', tokens: {}, rev: 2 })
      const first = await Promise.race([hold.held.then(() => 'held' as const), pendingB.then(() => 'settled' as const)])
      expect(['held', 'settled']).toContain(first)
      // 먼저 끝났으면 쏘지 않은 붙잡기를 거둔다 — 안 거두면 A 의 갱신을 잡는다.
      if (first === 'settled') hold.release()
      // A 가 다른 판으로 옮긴다(rev 1 → 2). 고친 판이 B 에 행 잠금을 걸었으면 A 는 그 뒤에 선다 — 끝나거나 줄 설 때까지 기다린 뒤 놓는다.
      const pendingA = put(ctx.app, project.id, a, { themeId: 'other-y', version: '1.0.0', tokens: {}, rev: 1 })
      let aDone = false
      void pendingA.then(() => (aDone = true))
      for (let i = 0; i < 50 && !aDone; i++) {
        const waiting = await sql<{ n: string }>`
          select count(*) as n from pg_stat_activity
          where pid <> pg_backend_pid() and wait_event_type = 'Lock' and query like '%"projects"%'`.execute(db)
        if (Number(waiting.rows[0]!.n) > 0) break
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      hold.release()
      const [moved, resB] = await Promise.all([pendingA, pendingB])
      expect(moved.statusCode, moved.body).toBe(200)

      // 차례로 보냈다면 B 의 바탕은 other-y 라 422 `hidden-version` 이다(B 가 먼저면 rev 가 안 맞아 409) — 겹친 판도 숨긴 판을 새로
      // 고르지 않아야 한다.
      expect(resB.statusCode, resB.body).not.toBe(200)
      const row = await db.selectFrom('projects').select(['theme_id', 'theme_version']).where('id', '=', project.id).executeTakeFirstOrThrow()
      expect(row).toEqual({ theme_id: 'other-y', theme_version: '1.0.0' })
    })
  })
})

describe('토큰 값이 스냅샷 · 복원을 막지 않는다', () => {
  it.each([
    ['짝 없는 서로게이트', '"a\ud800b"'],
    ['NUL', '"a\u0000b"'],
  ])('font 값에 %s — PUT 이 받았으면 그 뒤 스냅샷 · 복원이 선다', async (_label, value) => {
    await withApi(async (ctx) => {
      await store(ctx.db, FONT)
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      await createMenuNode(ctx, owner.cookie, project.id, { title: '메뉴' })
      const older = await snapshot(ctx, project.id, owner, '앞')
      expect(older.statusCode, older.body).toBe(201)

      const saved = await put(ctx.app, project.id, owner, { themeId: 'fonted', version: '1.0.0', tokens: { 'font.body': value }, rev: 0 })
      const after = saved.statusCode === 200 ? await snapshot(ctx, project.id, owner, '뒤') : null
      const back = saved.statusCode === 200 ? await restore(ctx, project.id, owner, older.json().id) : null

      // 막는 자리는 둘 중 하나다 — PUT 이 422 로 거절하거나, 받았으면 스냅샷(201)과 복원(200)이 선다.
      const outcome = saved.statusCode === 422 ? 'rejected' : `put ${saved.statusCode} · snapshot ${after?.statusCode} · restore ${back?.statusCode}`
      expect(['rejected', 'put 200 · snapshot 201 · restore 200']).toContain(outcome)
    })
  })
})

describe('토큰 키 · 값이 외짝 서로게이트 · NUL 을 실으면 PUT 이 거절하고 칸은 그대로다(`projects.theme_tokens` 는 `json`)', () => {
  // `json` 칸은 외짝 서로게이트 이스케이프를 받는다(`psql`: `'{"a":"\\ud800"}'::json` 은 통과 · `->>` · `::jsonb` 는 22P02) — 입구가 막지 않으면 그 값이 스냅샷
  // payload(`jsonb`)에서 터진다. 값은 `checkTokenValue` 의 `BAD_CHAR` 가, 키는 manifest 에 없는 키라는 이유로 거절된다.
  it.each([
    ['값 — 외짝 서로게이트', { 'font.body': '"a\ud800b"' }],
    ['값 — NUL', { 'font.body': '"a\u0000b"' }],
    ['키 — 외짝 서로게이트', { 'font.body\ud800': 'serif' }],
    ['키 — NUL', { 'font.body\u0000': 'serif' }],
  ])('%s', async (_label, tokens) => {
    await withApi(async (ctx) => {
      await store(ctx.db, FONT)
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)

      const saved = await put(ctx.app, project.id, owner, { themeId: 'fonted', version: '1.0.0', tokens, rev: 0 })

      const row = await ctx.db.selectFrom('projects').select(['theme_tokens', 'theme_rev']).where('id', '=', project.id).executeTakeFirstOrThrow()
      expect({ status: saved.statusCode, tokens: row.theme_tokens }).toEqual({ status: 422, tokens: {} })
    })
  })
})

describe('복원은 토큰을 검증하지 않는다', () => {
  it('판 3 payload 의 theme.tokens 에 manifest 에 없는 키가 있으면 바인딩에 넣지 않는다', async () => {
    await withApi(async (ctx) => {
      await store(ctx.db, FONT)
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      expect((await put(ctx.app, project.id, owner, { themeId: 'fonted', version: '1.0.0', tokens: { 'font.body': 'serif' }, rev: 0 })).statusCode).toBe(200)
      const snap = await snapshot(ctx, project.id, owner, '판3')
      expect(snap.statusCode, snap.body).toBe(201)
      const id = snap.json().id as string
      const row = await ctx.db.selectFrom('snapshots').select('payload').where('id', '=', id).executeTakeFirstOrThrow()
      const payload = row.payload as unknown as Record<string, unknown>
      expect(payload.payloadVersion).toBe(3)
      await ctx.db
        .updateTable('snapshots')
        .set({ payload: JSON.stringify({ ...payload, theme: { themeId: 'fonted', version: '1.0.0', tokens: { 'no.such': 'x' } } }) as never })
        .where('id', '=', id)
        .execute()

      // 같은 토큰을 PUT 으로 보내면 422 `unknown-token` 이다(대조).
      const direct = await put(ctx.app, project.id, owner, { themeId: 'fonted', version: '1.0.0', tokens: { 'no.such': 'x' }, rev: 1 })
      expect(direct.statusCode).toBe(422)

      await restore(ctx, project.id, owner, id)
      const binding = await ctx.db.selectFrom('projects').select('theme_tokens').where('id', '=', project.id).executeTakeFirstOrThrow()
      expect(Object.keys(binding.theme_tokens as Record<string, unknown>)).not.toContain('no.such')
    })
  })
})
