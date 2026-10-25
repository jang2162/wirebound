/**
 * **그림 라우트**(`src/routes/assets.ts`) — 올리기 · 읽기 · 목록 · 가져오기 · 지우기. 채널마다 상태 코드 · 응답 바이트를 값으로 잰다.
 *
 * | 절 | 재는 것 |
 * |---|---|
 * | 읽기 권한 | 그 프로젝트 viewer · editor · 비멤버 · 다른 프로젝트 멤버 · 로그아웃 · API 토큰(그 프로젝트 · 남의 프로젝트)이 같은 해시를 읽은 응답 |
 * | 개인 몫 | 남의 개인 그림의 해시와 없는 해시의 응답이 같다(상태 · 몸 · 머리) |
 * | 꼴 | 꼴 다섯의 크기 · 꼴 밖 415 · 크기 밖 422 · 확장자 · `Content-Type` 을 안 믿는다 · 응답 머리 |
 * | 한도 | 파일 · 프로젝트 · 사람 한도 바로 밑 · 위(한 바이트) |
 * | 가져오기 | 출처마다 옮긴 것 · 못 옮긴 것과 그 까닭 · 소유 행 수 |
 * | 번들 | 문서가 든 그림 가운데 그 프로젝트가 가진 것만 싣는다 — 남의 해시를 적어도 바이트가 안 실린다 |
 * | 지우기 | 프로젝트를 지우면 그 소유 행이 없고, 남이 안 가진 덩이도 없다 · 남이 가지면 덩이가 남는다 |
 *
 * 겹친 올리기의 한도는 `assets-race.test.ts`(실커밋 하네스)가 잰다.
 */
import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import type { ApiConfig } from '../src/config'
import {
  addMember,
  createMenuNode,
  createPage,
  createProject,
  signup,
  testConfig,
  withApi,
  type SignedUpUser,
  type TestContext,
} from './helpers'
import { gif, jpeg, png, pngOfSize, SCRIPTED_SVG, sha256, webpExtended, webpLossless, webpLossy } from './asset-samples'

const PNG = png(32, 20)
const PNG_ID = sha256(PNG)

async function upload(
  ctx: TestContext,
  projectId: string,
  bytes: Uint8Array,
  auth: { cookies?: { wb_session: string }; headers?: Record<string, string> },
  type = 'image/png',
  name?: string,
) {
  return ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/assets`,
    ...(auth.cookies === undefined ? {} : { cookies: auth.cookies }),
    headers: { 'content-type': type, ...(name === undefined ? {} : { 'x-asset-name': encodeURIComponent(name) }), ...auth.headers },
    payload: Buffer.from(bytes),
  })
}

async function token(ctx: TestContext, cookie: { wb_session: string }, projectId: string): Promise<{ authorization: string }> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/tokens`,
    cookies: cookie,
    payload: { name: '그림 토큰' },
  })
  expect(res.statusCode).toBe(201)
  return { authorization: `Bearer ${res.json().value}` }
}

interface Board {
  owner: SignedUpUser
  editor: SignedUpUser
  viewer: SignedUpUser
  stranger: SignedUpUser
  /** 다른 프로젝트(Q)의 owner — P 의 멤버가 아니다. */
  other: SignedUpUser
  p: string
  q: string
}

async function board(ctx: TestContext): Promise<Board> {
  const owner = await signup(ctx)
  const editor = await signup(ctx)
  const viewer = await signup(ctx)
  const stranger = await signup(ctx)
  const other = await signup(ctx)
  const p = (await createProject(ctx, owner.cookie)).id
  const q = (await createProject(ctx, other.cookie)).id
  await addMember(ctx, p, editor.user.id, 'editor')
  await addMember(ctx, p, viewer.user.id, 'viewer')
  return { owner, editor, viewer, stranger, other, p, q }
}

function withLimits(limits: Partial<ApiConfig['assetLimits']>): { config: ApiConfig } {
  const base = testConfig()
  return { config: { ...base, assetLimits: { ...base.assetLimits, ...limits } } }
}

async function ownerRows(ctx: TestContext) {
  const projects = await ctx.db.selectFrom('project_assets').select(['project_id', 'sha256']).execute()
  const personal = await ctx.db.selectFrom('personal_assets').select(['owner_id', 'sha256']).execute()
  const blobs = await ctx.db.selectFrom('asset_blobs').select('sha256').execute()
  return { projects, personal, blobs: blobs.map((row) => row.sha256) }
}

describe('올리기', () => {
  it('editor 가 올리면 201 · 해시가 id · 크기를 잰다 — 같은 바이트를 다시 올리면 200 · 같은 답', async () => {
    await withApi(async (ctx) => {
      const b = await board(ctx)
      const first = await upload(ctx, b.p, PNG, { cookies: b.editor.cookie }, 'image/png', '배너 그림.png')
      expect(first.statusCode).toBe(201)
      expect(first.json()).toMatchObject({ id: PNG_ID, name: '배너 그림.png', mime: 'image/png', size: PNG.length, width: 32, height: 20 })
      const again = await upload(ctx, b.p, PNG, { cookies: b.owner.cookie }, 'image/png', '다른 이름.png')
      expect(again.statusCode).toBe(200)
      expect(again.json()).toEqual(first.json())
      expect((await ownerRows(ctx)).projects).toEqual([{ project_id: b.p, sha256: PNG_ID }])
    })
  })

  it('viewer 403 · 비멤버 404 · 로그아웃 401 · 그 프로젝트의 토큰 201 · 남의 프로젝트 토큰 404 — 소유 행은 하나뿐', async () => {
    await withApi(async (ctx) => {
      const b = await board(ctx)
      expect((await upload(ctx, b.p, PNG, { cookies: b.viewer.cookie })).statusCode).toBe(403)
      expect((await upload(ctx, b.p, PNG, { cookies: b.stranger.cookie })).statusCode).toBe(404)
      expect((await upload(ctx, b.p, PNG, {})).statusCode).toBe(401)
      expect((await upload(ctx, b.p, PNG, { headers: await token(ctx, b.other.cookie, b.q) })).statusCode).toBe(404)
      expect((await ownerRows(ctx)).projects).toEqual([])
      expect((await upload(ctx, b.p, PNG, { headers: await token(ctx, b.editor.cookie, b.p) })).statusCode).toBe(201)
      expect((await ownerRows(ctx)).projects).toEqual([{ project_id: b.p, sha256: PNG_ID }])
    })
  })
})

describe('읽기 권한 — 해시를 안다고 바이트가 나오지 않는다', () => {
  it('채널마다 상태 · 바이트', async () => {
    await withApi(async (ctx) => {
      const b = await board(ctx)
      expect((await upload(ctx, b.p, PNG, { cookies: b.editor.cookie })).statusCode).toBe(201)
      const read = (projectId: string, auth: { cookies?: { wb_session: string }; headers?: Record<string, string> }) =>
        ctx.app.inject({ method: 'GET', url: `/api/projects/${projectId}/assets/${PNG_ID}`, ...auth })
      const pToken = await token(ctx, b.viewer.cookie, b.p)
      const qToken = await token(ctx, b.other.cookie, b.q)
      const cases = {
        viewer: await read(b.p, { cookies: b.viewer.cookie }),
        editor: await read(b.p, { cookies: b.editor.cookie }),
        pToken: await read(b.p, { headers: pToken }),
        stranger: await read(b.p, { cookies: b.stranger.cookie }),
        otherOnP: await read(b.p, { cookies: b.other.cookie }),
        otherOnQ: await read(b.q, { cookies: b.other.cookie }),
        qTokenOnP: await read(b.p, { headers: qToken }),
        qTokenOnQ: await read(b.q, { headers: qToken }),
        loggedOut: await read(b.p, {}),
      }
      const summary = Object.fromEntries(
        Object.entries(cases).map(([key, res]) => [key, { status: res.statusCode, same: Buffer.compare(res.rawPayload, PNG) === 0 }]),
      )
      expect(summary).toEqual({
        viewer: { status: 200, same: true },
        editor: { status: 200, same: true },
        pToken: { status: 200, same: true },
        stranger: { status: 404, same: false },
        otherOnP: { status: 404, same: false },
        otherOnQ: { status: 404, same: false },
        qTokenOnP: { status: 404, same: false },
        qTokenOnQ: { status: 404, same: false },
        loggedOut: { status: 401, same: false },
      })
      // 404 의 몸은 그림이 없는 프로젝트(Q)의 멤버에게나 비멤버에게나 같은 봉투다 — 그림 바이트가 한 조각도 안 든다.
      expect(cases.otherOnQ.json()).toEqual({ error: { code: 'not-found', message: '그림을 찾을 수 없습니다' } })
      expect(cases.otherOnQ.rawPayload.includes(PNG.subarray(0, 16))).toBe(false)
    })
  })

  it('응답 머리 — 격리(CSP sandbox) · nosniff · 바이트로 가른 꼴 · 캐시', async () => {
    await withApi(async (ctx) => {
      const b = await board(ctx)
      // 머리는 SVG 라고 거짓말해도 바이트는 PNG 다 — 저장 · 응답의 꼴은 바이트로 정한다. 이름의 확장자(.jpg)도 안 믿는다.
      const res = await upload(ctx, b.p, PNG, { cookies: b.editor.cookie }, 'image/svg+xml', '사진.jpg')
      expect(res.json()).toMatchObject({ mime: 'image/png', name: '사진.jpg' })
      const svg = await upload(ctx, b.p, SCRIPTED_SVG, { cookies: b.editor.cookie }, 'application/octet-stream', '아이콘.svg')
      expect(svg.json()).toMatchObject({ mime: 'image/svg+xml', width: 120, height: 80 })
      const heads = async (id: string) => {
        const got = await ctx.app.inject({ method: 'GET', url: `/api/projects/${b.p}/assets/${id}`, cookies: b.viewer.cookie })
        return {
          type: got.headers['content-type'],
          csp: got.headers['content-security-policy'],
          nosniff: got.headers['x-content-type-options'],
          corp: got.headers['cross-origin-resource-policy'],
          cache: got.headers['cache-control'],
          disposition: got.headers['content-disposition'],
        }
      }
      const common = {
        csp: "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        nosniff: 'nosniff',
        corp: 'same-origin',
        cache: 'private, max-age=31536000, immutable',
      }
      expect(await heads(PNG_ID)).toEqual({
        type: 'image/png',
        ...common,
        disposition: `inline; filename="__.jpg"; filename*=UTF-8''${encodeURIComponent('사진.jpg')}`,
      })
      expect(await heads(sha256(SCRIPTED_SVG))).toEqual({
        type: 'image/svg+xml',
        ...common,
        disposition: `inline; filename="___.svg"; filename*=UTF-8''${encodeURIComponent('아이콘.svg')}`,
      })
    })
  })
})

describe('꼴', () => {
  it('다섯 꼴의 크기를 머리에서 읽는다', async () => {
    await withApi(async (ctx) => {
      const b = await board(ctx)
      const samples: [string, Buffer, string, number, number][] = [
        ['png', png(7, 5), 'image/png', 7, 5],
        ['gif', gif(640, 480), 'image/gif', 640, 480],
        ['jpeg', jpeg(1920, 1080), 'image/jpeg', 1920, 1080],
        ['webp 손실', webpLossy(300, 200), 'image/webp', 300, 200],
        ['webp 무손실', webpLossless(301, 201), 'image/webp', 301, 201],
        ['webp 확장', webpExtended(4000, 3000), 'image/webp', 4000, 3000],
        ['svg viewBox', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24.5 12"/>'), 'image/svg+xml', 25, 12],
        [
          'svg 너비 높이',
          Buffer.from('\uFEFF<svg width="40px" height="30" xmlns="http://www.w3.org/2000/svg"></svg>'),
          'image/svg+xml',
          40,
          30,
        ],
        ['svg 크기 없음', Buffer.from('<s:svg xmlns:s="http://www.w3.org/2000/svg"></s:svg>'), 'image/svg+xml', 300, 150],
      ]
      const got = []
      for (const [label, bytes] of samples) {
        const res = await upload(ctx, b.p, bytes, { cookies: b.editor.cookie }, 'application/octet-stream')
        got.push([label, res.statusCode, res.json().mime, res.json().width, res.json().height])
      }
      expect(got).toEqual(samples.map(([label, , mime, w, h]) => [label, 201, mime, w, h]))
    })
  })

  it('꼴 밖은 415 · 한 변 8192 · 넓이 4천만 px 을 넘으면 422 — 둘 다 소유 행 · 덩이를 안 만든다', async () => {
    await withApi(async (ctx) => {
      const b = await board(ctx)
      const refused: [string, Buffer, number][] = [
        ['html 을 png 라고', Buffer.from('<!doctype html><script>alert(1)</script>'), 415],
        ['DOCTYPE 이 든 svg', Buffer.from('<!DOCTYPE svg [<!ENTITY x "y">]><svg xmlns="http://www.w3.org/2000/svg"/>'), 415],
        ['뿌리가 svg 가 아닌 xml', Buffer.from('<?xml version="1.0"?><html><svg/></html>'), 415],
        ['깨진 UTF-8', Buffer.from([0x3c, 0x73, 0x76, 0x67, 0xff, 0x3e]), 415],
        ['IHDR 없는 png', Buffer.concat([png(2, 2).subarray(0, 8), Buffer.alloc(20)]), 415],
        ['빈 본문', Buffer.alloc(0), 415],
        ['너비 8193', gif(8193, 10), 422],
        ['넓이 4천만 + 1 쪽', jpeg(8000, 5001), 422],
        ['너비 0', gif(0, 10), 422],
      ]
      const got = []
      for (const [label, bytes] of refused) got.push([label, (await upload(ctx, b.p, bytes, { cookies: b.editor.cookie })).statusCode])
      expect(got).toEqual(refused.map(([label, , status]) => [label, status]))
      expect(await upload(ctx, b.p, Buffer.from('x'), { cookies: b.editor.cookie }).then((r) => r.json().error)).toEqual({
        code: 'unsupported-media',
        message: 'PNG · JPEG · WebP · GIF · SVG 만 올릴 수 있습니다',
      })
      // 경계 안쪽 — 8192 × 4882 = 39,993,344 ≤ 4천만.
      expect((await upload(ctx, b.p, jpeg(8192, 4882), { cookies: b.editor.cookie })).statusCode).toBe(201)
      expect((await ownerRows(ctx)).projects).toHaveLength(1)
      expect((await ownerRows(ctx)).blobs).toHaveLength(1)
    })
  })

  it('JSON 본문도 가드를 지난 뒤 바이트로 가른다 — 비멤버 404 · editor 415 unsupported-media', async () => {
    await withApi(async (ctx) => {
      const b = await board(ctx)
      const send = (cookie: { wb_session: string }) =>
        ctx.app.inject({ method: 'POST', url: `/api/projects/${b.p}/assets`, cookies: cookie, payload: { x: 1 } })
      expect((await send(b.stranger.cookie)).statusCode).toBe(404)
      const res = await send(b.editor.cookie)
      expect(res.statusCode).toBe(415)
      expect(res.json().error.code).toBe('unsupported-media')
    })
  })
})

describe('한도 — 바로 밑 · 위(한 바이트)', () => {
  it('파일 한도 — 같으면 받고 한 바이트 넘으면 413 · 문장이 한도와 그 파일 크기를 말한다', async () => {
    const limit = 3000
    await withApi(
      async (ctx) => {
        const b = await board(ctx)
        expect((await upload(ctx, b.p, pngOfSize(limit, 1), { cookies: b.editor.cookie })).statusCode).toBe(201)
        const over = await upload(ctx, b.p, pngOfSize(limit + 1, 2), { cookies: b.editor.cookie })
        expect(over.statusCode).toBe(413)
        expect(over.json().error).toEqual({ code: 'too-large', message: '그림은 2.9 KB 까지 올릴 수 있습니다(이 파일 2.9 KB)' })
        expect((await ownerRows(ctx)).projects).toHaveLength(1)
      },
      withLimits({ fileBytes: limit }),
    )
  })

  it('한도 문장의 크기 — 0.05 MB 밑은 «0 MB» 가 아니라 KB · 1 KB 밑은 바이트 · 기본 한도는 MB', async () => {
    const { byteSize } = await import('../src/routes/assets')
    const sizes = [0, 1000, 1023, 1024, 3001, 52_428, 52_429, 7.2 * 1024 * 1024, 5 * 1024 * 1024, 100 * 1024 * 1024, 200 * 1024 * 1024]
    expect(sizes.map(byteSize)).toEqual([
      '0 B',
      '1000 B',
      '1023 B',
      '1 KB',
      '2.9 KB',
      '51.2 KB',
      '0.1 MB',
      '7.2 MB',
      '5 MB',
      '100 MB',
      '200 MB',
    ])
  })

  it('파일 한도의 문장 — 5 MB 한도 · 7.2 MB 파일(길이 머리로 읽기 전에 끊는다)', async () => {
    await withApi(async (ctx) => {
      const b = await board(ctx)
      const res = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${b.p}/assets`,
        cookies: b.editor.cookie,
        headers: { 'content-type': 'image/png' },
        payload: Buffer.alloc(Math.round(7.2 * 1024 * 1024)),
      })
      expect(res.statusCode).toBe(413)
      expect(res.json().error.message).toBe('그림은 5 MB 까지 올릴 수 있습니다(이 파일 7.2 MB)')
    })
  })

  it('프로젝트 한도 — 합이 한도와 같으면 받고 한 바이트 넘으면 409 asset-quota · 이미 가진 그림은 다시 올려도 안 센다', async () => {
    const a = pngOfSize(1000, 1)
    const c = pngOfSize(1000, 2)
    const d = pngOfSize(1001, 3)
    await withApi(
      async (ctx) => {
        const b = await board(ctx)
        expect((await upload(ctx, b.p, a, { cookies: b.editor.cookie })).statusCode).toBe(201)
        // 1000 + 1001 = 2001 — 한 바이트 넘는다.
        const over = await upload(ctx, b.p, d, { cookies: b.editor.cookie })
        expect(over.statusCode).toBe(409)
        expect(over.json().error).toEqual({ code: 'asset-quota', message: '이 프로젝트의 그림 공간 2 KB 가 찼습니다' })
        // 1000 + 1000 = 2000 — 한도와 같으면 받는다. 이미 가진 그림은 다시 올려도 안 센다.
        expect((await upload(ctx, b.p, c, { cookies: b.editor.cookie })).statusCode).toBe(201)
        expect((await upload(ctx, b.p, a, { cookies: b.editor.cookie })).statusCode).toBe(200)
        expect((await upload(ctx, b.p, png(1, 1, 9), { cookies: b.editor.cookie })).statusCode).toBe(409)
        // 다른 프로젝트의 몫은 따로다 — 같은 덩이(a)를 가져도 그 프로젝트에 센다: Q 는 a(1000) 뒤 d(1001)가 넘는다.
        expect((await upload(ctx, b.q, a, { cookies: b.other.cookie })).statusCode).toBe(201)
        expect((await upload(ctx, b.q, d, { cookies: b.other.cookie })).statusCode).toBe(409)
        const list = await ctx.app.inject({ method: 'GET', url: `/api/projects/${b.p}/assets`, cookies: b.viewer.cookie })
        expect(list.json()).toMatchObject({ usedBytes: 2000, limitBytes: 2000 })
        expect(
          list
            .json()
            .assets.map((asset: { id: string }) => asset.id)
            .sort(),
        ).toEqual([sha256(a), sha256(c)].sort())
      },
      withLimits({ projectBytes: 2000 }),
    )
  })

  it('사람 한도 — 가져오기(개인 몫)가 한도와 같으면 받고 한 바이트 넘는 그림은 quota 로 못 옮긴다', async () => {
    const a = pngOfSize(1000, 1)
    const c = pngOfSize(1001, 2)
    await withApi(
      async (ctx) => {
        const b = await board(ctx)
        await upload(ctx, b.p, a, { cookies: b.editor.cookie })
        await upload(ctx, b.p, c, { cookies: b.editor.cookie })
        const res = await ctx.app.inject({
          method: 'POST',
          url: '/api/me/assets/claim',
          cookies: b.viewer.cookie,
          payload: { ids: [sha256(a), sha256(c)], from: { projectId: b.p } },
        })
        expect(res.statusCode).toBe(200)
        expect(res.json()).toEqual({ claimed: [sha256(a)], failed: [{ id: sha256(c), reason: 'quota' }] })
      },
      withLimits({ personalBytes: 1000 }),
    )
  })
})

describe('가져오기(claim) — 옮길 권한이 없는 그림은 못 옮긴다', () => {
  it('다른 프로젝트에서 — 출처의 멤버면 옮기고, 출처에 없는 해시 · 비멤버 · 지워진 출처는 not-readable', async () => {
    await withApi(async (ctx) => {
      const b = await board(ctx)
      // Q 에 그림 둘 · P 의 editor 를 Q 의 viewer 로.
      const q1 = png(3, 3, 11)
      const q2 = png(3, 3, 12)
      await upload(ctx, b.q, q1, { cookies: b.other.cookie })
      await upload(ctx, b.q, q2, { cookies: b.other.cookie })
      await addMember(ctx, b.q, b.editor.user.id, 'viewer')
      const claim = (cookie: { wb_session: string }, ids: string[], from: unknown) =>
        ctx.app.inject({ method: 'POST', url: `/api/projects/${b.p}/assets/claim`, cookies: cookie, payload: { ids, from } })
      const unknown = 'f'.repeat(64)
      const ok = await claim(b.editor.cookie, [sha256(q1), unknown], { projectId: b.q })
      expect(ok.json()).toEqual({ claimed: [sha256(q1)], failed: [{ id: unknown, reason: 'not-readable' }] })
      // 출처의 멤버가 아니다(P 의 owner 는 Q 에 없다) — 해시를 알아도 못 옮긴다.
      const notMember = await claim(b.owner.cookie, [sha256(q2)], { projectId: b.q })
      expect(notMember.json()).toEqual({ claimed: [], failed: [{ id: sha256(q2), reason: 'not-readable' }] })
      // 없는 출처 프로젝트.
      const gone = await claim(b.editor.cookie, [sha256(q2)], { projectId: '00000000-0000-0000-0000-000000000000' })
      expect(gone.json()).toEqual({ claimed: [], failed: [{ id: sha256(q2), reason: 'not-readable' }] })
      const rows = (await ownerRows(ctx)).projects.filter((row) => row.project_id === b.p)
      expect(rows).toEqual([{ project_id: b.p, sha256: sha256(q1) }])
      // 옮긴 그림은 P 에서 읽힌다.
      const read = await ctx.app.inject({ method: 'GET', url: `/api/projects/${b.p}/assets/${sha256(q1)}`, cookies: b.viewer.cookie })
      expect(Buffer.compare(read.rawPayload, q1)).toBe(0)
    })
  })

  it('개인 몫에서 · 개인 몫으로 — 남의 개인 그림은 못 옮긴다', async () => {
    await withApi(async (ctx) => {
      const b = await board(ctx)
      const mine = png(5, 5, 21)
      await upload(ctx, b.q, mine, { cookies: b.other.cookie })
      await addMember(ctx, b.q, b.editor.user.id, 'viewer')
      // Q 의 그림을 editor 의 개인 몫으로(개인 모듈 저장) → P 로(개인 모듈 넣기).
      const toMe = await ctx.app.inject({
        method: 'POST',
        url: '/api/me/assets/claim',
        cookies: b.editor.cookie,
        payload: { ids: [sha256(mine)], from: { projectId: b.q } },
      })
      expect(toMe.json()).toEqual({ claimed: [sha256(mine)], failed: [] })
      // owner 는 그 그림의 개인 몫이 없다 — 개인 몫에서 P 로 못 옮긴다.
      const notMine = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${b.p}/assets/claim`,
        cookies: b.owner.cookie,
        payload: { ids: [sha256(mine)], from: { personal: true } },
      })
      expect(notMine.json()).toEqual({ claimed: [], failed: [{ id: sha256(mine), reason: 'not-readable' }] })
      const fromMe = await ctx.app.inject({
        method: 'POST',
        url: `/api/projects/${b.p}/assets/claim`,
        cookies: b.editor.cookie,
        payload: { ids: [sha256(mine)], from: { personal: true } },
      })
      expect(fromMe.json()).toEqual({ claimed: [sha256(mine)], failed: [] })
      const rows = await ownerRows(ctx)
      expect(rows.personal).toEqual([{ owner_id: b.editor.user.id, sha256: sha256(mine) }])
      expect(rows.projects.map((row) => row.project_id).sort()).toEqual([b.p, b.q].sort())
      expect(rows.blobs).toEqual([sha256(mine)])
    })
  })

  it('가져오기는 세션만 · editor 이상 — 토큰 403 · viewer 403 · 비멤버 404', async () => {
    await withApi(async (ctx) => {
      const b = await board(ctx)
      const body = { ids: [PNG_ID], from: { personal: true } }
      const url = `/api/projects/${b.p}/assets/claim`
      expect(
        (await ctx.app.inject({ method: 'POST', url, headers: await token(ctx, b.editor.cookie, b.p), payload: body })).statusCode,
      ).toBe(403)
      expect((await ctx.app.inject({ method: 'POST', url, cookies: b.viewer.cookie, payload: body })).statusCode).toBe(403)
      expect((await ctx.app.inject({ method: 'POST', url, cookies: b.stranger.cookie, payload: body })).statusCode).toBe(404)
      const meToken = await ctx.app.inject({
        method: 'POST',
        url: '/api/me/assets/claim',
        headers: await token(ctx, b.editor.cookie, b.p),
        payload: { ids: [PNG_ID], from: { projectId: b.p } },
      })
      expect(meToken.statusCode).toBe(401)
    })
  })
})

describe('개인 몫 읽기 — 남의 개인 그림 · 없는 해시는 같은 답', () => {
  it('상태 · 몸 · 머리가 같다', async () => {
    await withApi(async (ctx) => {
      const b = await board(ctx)
      const theirs = png(6, 6, 31)
      await upload(ctx, b.q, theirs, { cookies: b.other.cookie })
      await ctx.app.inject({
        method: 'POST',
        url: '/api/me/assets/claim',
        cookies: b.other.cookie,
        payload: { ids: [sha256(theirs)], from: { projectId: b.q } },
      })
      const own = await ctx.app.inject({ method: 'GET', url: `/api/me/assets/${sha256(theirs)}`, cookies: b.other.cookie })
      expect(own.statusCode).toBe(200)
      expect(Buffer.compare(own.rawPayload, theirs)).toBe(0)
      const others = await ctx.app.inject({ method: 'GET', url: `/api/me/assets/${sha256(theirs)}`, cookies: b.editor.cookie })
      const missing = await ctx.app.inject({ method: 'GET', url: `/api/me/assets/${'0'.repeat(64)}`, cookies: b.editor.cookie })
      const shape = (res: typeof others) => ({
        status: res.statusCode,
        body: res.body,
        type: res.headers['content-type'],
        length: res.headers['content-length'],
      })
      expect(shape(others)).toEqual(shape(missing))
      expect(shape(others).status).toBe(404)
      // 토큰은 개인 몫에 닿지 않는다.
      expect(
        (await ctx.app.inject({ method: 'GET', url: `/api/me/assets/${sha256(theirs)}`, headers: await token(ctx, b.other.cookie, b.q) }))
          .statusCode,
      ).toBe(401)
    })
  })
})

describe('지우기 — 그림은 프로젝트 · 사람과 함께만 지운다', () => {
  it('프로젝트를 지우면 그 소유 행이 없다 · 남이 안 가진 덩이는 지워지고 남(프로젝트 · 사람)이 가진 덩이는 남는다', async () => {
    await withApi(async (ctx) => {
      const b = await board(ctx)
      const onlyP = png(2, 2, 41)
      const sharedQ = png(2, 2, 42)
      const sharedMe = png(2, 2, 43)
      for (const bytes of [onlyP, sharedQ, sharedMe]) await upload(ctx, b.p, bytes, { cookies: b.editor.cookie })
      await upload(ctx, b.q, sharedQ, { cookies: b.other.cookie })
      await ctx.app.inject({
        method: 'POST',
        url: '/api/me/assets/claim',
        cookies: b.viewer.cookie,
        payload: { ids: [sha256(sharedMe)], from: { projectId: b.p } },
      })
      expect((await ownerRows(ctx)).blobs.sort()).toEqual([onlyP, sharedQ, sharedMe].map(sha256).sort())
      expect((await ctx.app.inject({ method: 'DELETE', url: `/api/projects/${b.p}`, cookies: b.owner.cookie })).statusCode).toBe(204)
      const rows = await ownerRows(ctx)
      expect(rows.projects).toEqual([{ project_id: b.q, sha256: sha256(sharedQ) }])
      expect(rows.personal).toEqual([{ owner_id: b.viewer.user.id, sha256: sha256(sharedMe) }])
      expect(rows.blobs.sort()).toEqual([sharedQ, sharedMe].map(sha256).sort())
      // 사람이 지워지면(지금 그 길은 앱에 없다 — 행을 지운다) 개인 몫과 그 사람만 가진 덩이가 함께 간다.
      await ctx.db.deleteFrom('users').where('id', '=', b.viewer.user.id).execute()
      expect((await ownerRows(ctx)).personal).toEqual([])
      expect((await ownerRows(ctx)).blobs).toEqual([sha256(sharedQ)])
    })
  })
})

describe('번들 — 그 프로젝트가 가진 그림만 싣는다', () => {
  it('문서에 남의 프로젝트 그림의 해시를 적어도 그 바이트는 zip 에 없다 · 가진 그림은 바이트 그대로 · 페이지 표에 그것만', async () => {
    await withApi(async (ctx) => {
      const b = await board(ctx)
      const mine = png(12, 8, 7)
      const theirs = png(14, 9, 8)
      expect((await upload(ctx, b.p, mine, { cookies: b.owner.cookie })).statusCode).toBe(201)
      expect((await upload(ctx, b.q, theirs, { cookies: b.other.cookie })).statusCode).toBe(201)
      const menu = await createMenuNode(ctx, b.owner.cookie, b.p, { title: '메뉴' })
      const page = await createPage(ctx, b.owner.cookie, b.p, menu.id, { title: '그림' })
      const put = await ctx.app.inject({
        method: 'PUT',
        url: `/api/projects/${b.p}/pages/${page.id}/schema`,
        cookies: b.owner.cookie,
        payload: {
          schema: {
            version: 5,
            root: {
              id: 'n_root',
              type: 'Page',
              children: [
                { id: 'n_mine', type: 'Placeholder', props: { label: '내 것', image: sha256(mine) } },
                { id: 'n_theirs', type: 'Placeholder', props: { label: '남의 것', image: sha256(theirs) } },
              ],
            },
          },
        },
      })
      expect(put.statusCode, put.body).toBe(200)
      const res = await ctx.app.inject({ method: 'GET', url: `/api/projects/${b.p}/export`, cookies: b.owner.cookie })
      expect(res.statusCode).toBe(200)
      const files = unzipSync(new Uint8Array(res.rawPayload))
      const images = Object.keys(files).filter((name) => name.includes('/assets/images/'))
      expect(images.map((name) => name.split('/assets/images/')[1])).toEqual([`${sha256(mine)}.png`])
      expect(Buffer.from(files[images[0]!]!).equals(Buffer.from(mine))).toBe(true)
      // 남의 바이트가 어느 파일에도 없다(이름 · 내용).
      const theirsBytes = Buffer.from(theirs)
      expect(Object.values(files).filter((bytes) => Buffer.from(bytes).includes(theirsBytes))).toEqual([])
      const html = strFromU8(Object.entries(files).find(([name]) => name.endsWith('/index.html'))![1])
      expect(html).toContain(`assets/images/${sha256(mine)}.png`)
      expect(html).not.toContain(`${sha256(theirs)}.png`)
    })
  })
})
