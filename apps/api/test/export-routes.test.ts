/**
 * **내보내기 라우트 둘**.
 *
 * | 라우트 | 무엇 |
 * |---|---|
 * | `GET /:projectId/export/preview` | 내려받기 **전에** 화면이 말할 것 — 페이지·타겟·못 이은 링크·`errors` |
 * | `GET /:projectId/export` | zip 그 자체 |
 *
 * **URL에 파일 이름이 없다**. 파일 이름은 안정한 열쇠가 아니라 페이지를
 * 하나 더하면 뒤에서 부딪히던 이름들의 번호가 밀린다 — 그것으로 URL을 만들면 남의
 * 북마크가 깨진다. 사람이 읽는 이름은 `Content-Disposition`에만 있다.
 *
 * 권한은 `test/permission-matrix.test.ts`가 전수로 잰다. 여기서는 **산출물이 화면보다 더
 * 담는 것이 없는지**를 프로젝트 둘로 잰다.
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
    version: 4,
    root: {
      id: rootId,
      type: 'Page',
      children: [
        {
          id: buttonId,
          type: 'Button',
          props: { label },
          ...(navigateTo === undefined ? {} : { interactions: [{ on: 'click', actions: [{ type: 'navigate', target: navigateTo }] }] }),
        },
      ],
    },
  }
}

interface Fixture {
  cookie: { wb_session: string }
  projectId: string
  slug: string
  pageIds: Record<string, string>
}

/**
 * **`errors`가 나는 상태를 만든다.** 정상 경로(`PUT .../schema`)는 모르는 컴포넌트를 422로
 * 막으므로 편집 파이프라인을 우회해 `pages.schema`에 직접 심는다 — **카탈로그에서
 * 컴포넌트가 빠지는 날 실제로 생기는 상태**다.
 */
async function 그리지못할노드를심는다(ctx: TestContext, pageId: string, nodeId: string): Promise<void> {
  await ctx.db
    .updateTable('pages')
    .set({
      schema: JSON.stringify({
        version: 4,
        root: { id: 'n_broken_root', type: 'Page', children: [{ id: nodeId, type: '없는컴포넌트' }] },
      }),
    })
    .where('id', '=', pageId)
    .execute()
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

  return {
    cookie,
    projectId: project.id,
    slug,
    pageIds: { 대시보드: 대시보드.id, 목록: 목록.id, 상세: 상세.id },
  }
}

describe('GET /:projectId/export/preview', () => {
  /**
   * **이름은 조상이 붙은 번들 이름이다**. 맨 제목이면 화면의 목록이
   * `목록`·`목록`으로 보이고, 같은 응답의 `errors[].title`(늘 번들 이름)과도 갈린다.
   */
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
        { id: expect.any(String), title: '관리자 대시보드', target: 'page:관리자/대시보드' },
        { id: expect.any(String), title: '관리자 회원 목록', target: 'page:관리자/회원/목록' },
        { id: expect.any(String), title: '관리자 회원 상세', target: 'page:관리자/회원/상세' },
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

      expect(res.json().brokenLinks).toEqual([{ target: 'page:없는/것', reason: 'missing', from: ['관리자 회원 상세'] }])
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

  /**
   * **내려받기 전 경고가 기대는 배선을 여기서 누른다**. 위 케이스는 `errors`가 **비어 있는
   * 것**만 재는데, 그것은 `errors`를 통째로 버리는 라우트도 만족한다 —
   * *"내려받기 버튼이 조용히 성공하면 안 된다"*를 지키는 값이 이것이므로 **값이 실제로
   * 흐르는 것**을 잰다. 화면 쪽 케이스는 미리보기를 스텁으로 넣으므로 그쪽도 이 배선을
   * 안 지난다.
   */
  it('그리지 못한 노드가 있으면 그대로 흘려보낸다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, 'one')
      await 그리지못할노드를심는다(ctx, fixture.pageIds.목록!, 'n_gone')

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fixture.projectId}/export/preview`,
        cookies: fixture.cookie,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().errors).toHaveLength(1)
      // 화면이 이 `title`로 *"어느 페이지인지"*를 말한다. 파일 경로가 아니다.
      expect(res.json().errors[0].title).toBe('관리자 회원 목록')
      expect(res.json().errors[0].error.nodeId).toBe('n_gone')
      expect(res.json().errors[0].error.message).toContain('없는컴포넌트')
      // 그래도 페이지 목록은 그대로 낸다 — 한 장이 깨져도 내보낼 수는 있다.
      expect(res.json().pages).toHaveLength(3)
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

  /** 남의 프로젝트 것이 새면 설계서 「권한 모델」이 산출물에서 깨진다. */
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

  it('설계서 「HTML 정적 번들」의 트리를 담는다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, 'one')
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fixture.projectId}/export`,
        cookies: fixture.cookie,
      })

      const names = Object.keys(unzipSync(new Uint8Array(res.rawPayload)))
      expect(names).toContain('wirebound-export-one/index.html')
      expect(names).toContain('wirebound-export-one/assets/views.css')
      expect(names).toContain('wirebound-export-one/assets/runtime.js')
      expect(names.filter((name) => name.includes('/pages/'))).toHaveLength(3)
    })
  })

  /**
   * **zip 엔트리 → 그 파일의 내용**. 이름과 내용이 어긋나도 눈으로는
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
      const 전문 = Object.values(files)
        .map((bytes) => strFromU8(bytes))
        .join('\n')
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
