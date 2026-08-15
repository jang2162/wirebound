/**
 * **내보내기 라우트 둘**(P8-4 T4 · D4·D7).
 *
 * | 라우트 | 무엇 |
 * |---|---|
 * | `GET /:projectId/export/preview` | 내려받기 **전에** 화면이 말할 것 — 페이지·타겟·못 이은 링크·`errors` |
 * | `GET /:projectId/export` | zip 그 자체 |
 *
 * **URL에 파일 이름이 없다**(D7). 파일 이름은 안정한 열쇠가 아니라(P8-2 이월 §3) 페이지를
 * 하나 더하면 뒤에서 부딪히던 이름들의 번호가 밀린다 — 그것으로 URL을 만들면 남의
 * 북마크가 깨진다. 사람이 읽는 이름은 `Content-Disposition`에만 있다.
 *
 * 권한은 `test/permission-matrix.test.ts`가 전수로 잰다. 여기서는 **산출물이 화면보다 더
 * 담는 것이 없는지**(재라 #5)를 프로젝트 둘로 잰다.
 */
import { describe, expect, it } from 'vitest'
import { strFromU8, unzipSync } from 'fflate'
import type { PageDocument } from '@wirebound/schema'
import { createMenuNode, createPage, createProject, signup, withApi, type TestContext } from './helpers'

async function putSchema(
  ctx: TestContext,
  cookie: { wb_session: string },
  projectId: string,
  pageId: string,
  schema: PageDocument,
): Promise<void> {
  const res = await ctx.app.inject({
    method: 'PUT',
    url: `/api/projects/${projectId}/pages/${pageId}/schema`,
    cookies: cookie,
    payload: { schema },
  })
  if (res.statusCode !== 200) {
    throw new Error(`putSchema 픽스처가 실패했습니다 (status ${res.statusCode}): ${res.body}`)
  }
}

function doc(rootId: string, buttonId: string, label: string, navigateTo?: string): PageDocument {
  return {
    version: 1,
    root: {
      id: rootId,
      type: 'Page',
      children: [
        {
          id: buttonId,
          type: 'Button',
          props: { label },
          ...(navigateTo === undefined
            ? {}
            : { interactions: [{ on: 'click', actions: [{ type: 'navigate', target: navigateTo }] }] }),
        },
      ],
    },
  }
}

interface Fixture {
  cookie: { wb_session: string }
  projectId: string
  slug: string
}

/** 메뉴 둘 · 페이지 셋. `상세`가 번들에 없는 타겟을 겨눈다. */
async function 설계서(ctx: TestContext, slug: string): Promise<Fixture> {
  const user = await signup(ctx)
  const project = await createProject(ctx, user.cookie, { name: `설계서 ${slug}`, slug })
  const cookie = user.cookie

  const 관리자 = await createMenuNode(ctx, cookie, project.id, { title: '관리자' })
  const 회원 = await createMenuNode(ctx, cookie, project.id, { parentId: 관리자.id, title: '회원' })

  const 대시보드 = await createPage(ctx, cookie, project.id, 관리자.id, { title: '대시보드' })
  const 목록 = await createPage(ctx, cookie, project.id, 회원.id, { title: '목록' })
  const 상세 = await createPage(ctx, cookie, project.id, 회원.id, { title: '상세' })

  await putSchema(ctx, cookie, project.id, 대시보드.id, doc('n_d', 'n_db', `${slug} 대시보드`))
  await putSchema(ctx, cookie, project.id, 목록.id, doc('n_l', 'n_lb', `${slug} 목록`, 'page:관리자/회원/상세'))
  await putSchema(ctx, cookie, project.id, 상세.id, doc('n_s', 'n_sb', `${slug} 상세`, 'page:없는/것'))

  return { cookie, projectId: project.id, slug }
}

describe('GET /:projectId/export/preview', () => {
  it('페이지마다 이름과 타겟을 낸다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, 'one')
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fixture.projectId}/export/preview`,
        cookies: fixture.cookie,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().pages).toEqual([
        { id: expect.any(String), title: '대시보드', target: 'page:관리자/대시보드' },
        { id: expect.any(String), title: '목록', target: 'page:관리자/회원/목록' },
        { id: expect.any(String), title: '상세', target: 'page:관리자/회원/상세' },
      ])
    })
  })

  it('못 이은 링크를 미리 말한다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, 'one')
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fixture.projectId}/export/preview`,
        cookies: fixture.cookie,
      })

      expect(res.json().brokenLinks).toEqual([
        { target: 'page:없는/것', reason: 'missing', from: ['상세'] },
      ])
    })
  })

  it('내려받을 파일 이름을 함께 낸다 — 화면이 그것을 지어내지 않는다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, 'one')
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fixture.projectId}/export/preview`,
        cookies: fixture.cookie,
      })
      expect(res.json().fileName).toBe('wirebound-export-one.zip')
    })
  })

  it('건강한 설계서에서는 errors가 비어 있다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, 'one')
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fixture.projectId}/export/preview`,
        cookies: fixture.cookie,
      })
      expect(res.json().errors).toEqual([])
    })
  })

  it('페이지가 없으면 409다', async () => {
    await withApi(async (ctx) => {
      const user = await signup(ctx)
      const project = await createProject(ctx, user.cookie, { name: '빈 것', slug: 'empty-preview' })
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/export/preview`,
        cookies: user.cookie,
      })
      expect(res.statusCode).toBe(409)
      expect(res.json().error.code).toBe('conflict')
    })
  })

  /** 남의 프로젝트 것이 새면 §10이 산출물에서 깨진다. */
  it('제 프로젝트의 페이지만 낸다', async () => {
    await withApi(async (ctx) => {
      const 하나 = await 설계서(ctx, 'one')
      await 설계서(ctx, 'two')

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${하나.projectId}/export/preview`,
        cookies: 하나.cookie,
      })
      expect(res.json().pages).toHaveLength(3)
    })
  })
})

describe('GET /:projectId/export', () => {
  it('zip을 낸다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, 'one')
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fixture.projectId}/export`,
        cookies: fixture.cookie,
      })

      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toBe('application/zip')
      // 앞 네 바이트가 zip의 로컬 파일 헤더 서명(`PK\x03\x04`)이다.
      expect([...res.rawPayload.subarray(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04])
    })
  })

  it('사람이 읽는 이름은 Content-Disposition에만 있다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, 'one')
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fixture.projectId}/export`,
        cookies: fixture.cookie,
      })
      expect(res.headers['content-disposition']).toContain('attachment')
      expect(res.headers['content-disposition']).toContain('wirebound-export-one.zip')
    })
  })

  it('§11.3의 트리를 담는다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, 'one')
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fixture.projectId}/export`,
        cookies: fixture.cookie,
      })

      const names = Object.keys(unzipSync(new Uint8Array(res.rawPayload)))
      expect(names).toContain('wirebound-export-one/index.html')
      expect(names).toContain('wirebound-export-one/assets/theme.css')
      expect(names).toContain('wirebound-export-one/assets/runtime.js')
      expect(names.filter((name) => name.includes('/pages/'))).toHaveLength(3)
    })
  })

  /**
   * **zip 엔트리 → 그 파일의 내용**(P8-2 이월 §10의 다섯째). 이름과 내용이 어긋나도 눈으로는
   * 그럴듯하므로, 페이지 셋을 넣고 **자리마다** 견준다.
   */
  it('엔트리마다 제 페이지가 들어 있다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, 'one')
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fixture.projectId}/export`,
        cookies: fixture.cookie,
      })

      const files = unzipSync(new Uint8Array(res.rawPayload))
      const 페이지 = Object.entries(files)
        .filter(([name]) => name.includes('/pages/'))
        .map(([name, bytes]) => ({ name, content: strFromU8(bytes) }))

      // 카나리아: 셋이 서로 다른 글자여야 아래 견주기가 뜻을 갖는다.
      expect(new Set(페이지.map((file) => file.content)).size).toBe(3)

      for (const { name, content } of 페이지) {
        // 파일 이름이 그 페이지의 제목에서 나온다(`pageFileNames`). 그러므로 이름에 든
        // 제목과 본문에 든 라벨이 같은 페이지를 가리켜야 한다.
        for (const [제목, 라벨] of [
          ['대시보드', 'one 대시보드'],
          ['목록', 'one 목록'],
          ['상세', 'one 상세'],
        ]) {
          if (name.includes(제목!)) {
            expect(content, name).toContain(라벨!)
          } else {
            expect(content, name).not.toContain(라벨!)
          }
        }
      }
    })
  })

  it('남의 프로젝트가 안 실린다', async () => {
    await withApi(async (ctx) => {
      const 하나 = await 설계서(ctx, 'one')
      await 설계서(ctx, 'two')

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${하나.projectId}/export`,
        cookies: 하나.cookie,
      })

      const files = unzipSync(new Uint8Array(res.rawPayload))
      const 전문 = Object.values(files).map((bytes) => strFromU8(bytes)).join('\n')
      expect(전문).toContain('one 목록')
      expect(전문).not.toContain('two 목록')
    })
  })

  it('페이지가 없으면 409다', async () => {
    await withApi(async (ctx) => {
      const user = await signup(ctx)
      const project = await createProject(ctx, user.cookie, { name: '빈 것', slug: 'empty-zip' })
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/export`,
        cookies: user.cookie,
      })
      expect(res.statusCode).toBe(409)
    })
  })
})
