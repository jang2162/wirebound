/**
 * **`?format=pptx`가 붙은 내보내기 라우트 둘**(P10-1 T5 · D7).
 *
 * | 무엇 | 어디 |
 * |---|---|
 * | 형식 인자·미리보기 갈래·헤더·본문 | 여기 |
 * | 권한 전수 | `test/permission-matrix.test.ts` — 라우트가 안 늘었으므로 그 표는 그대로다 |
 * | 패키지가 닫혀 있는가 | `packages/exporter/test/pptx-package.test.ts` |
 * | 받는 쪽이 여는가 | `packages/exporter/build-test/dist-pptx.test.ts` (`pnpm test:build`) |
 *
 * **여기서 재는 것은 배선이다** — 라우트가 pptx 바이트를 내고, 그 바이트가 zip으로 풀리고,
 * 그 안에 페이지마다 슬라이드가 있는가.
 */
import { unzipSync, strFromU8 } from 'fflate'
import type { PageDocument } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
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

function doc(rootId: string, buttonId: string, label: string): PageDocument {
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
          marker: 1,
          interactions: [
            { on: 'click', actions: [{ type: 'navigate', target: 'page:관리자/회원/상세' }] },
          ],
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

/** 메뉴 둘 · 페이지 셋 · 코멘트 하나. **하나짜리로 재지 않는다.** */
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
  await putSchema(ctx, cookie, project.id, 목록.id, doc('n_l', 'n_lb', `${slug} 목록`))
  await putSchema(ctx, cookie, project.id, 상세.id, doc('n_s', 'n_sb', `${slug} 상세`))

  const comment = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${project.id}/pages/${목록.id}/comments`,
    cookies: cookie,
    payload: { nodeId: 'n_lb', body: '검색 조건은 AND 결합' },
  })
  if (comment.statusCode !== 201) throw new Error(`코멘트 픽스처 실패: ${comment.body}`)

  return {
    cookie,
    projectId: project.id,
    slug,
    pageIds: { 대시보드: 대시보드.id, 목록: 목록.id, 상세: 상세.id },
  }
}

/** 응답 바이트를 pptx 패키지로 푼다. */
function unpack(body: Buffer): Record<string, string> {
  const entries = unzipSync(new Uint8Array(body))
  const out: Record<string, string> = {}
  for (const [path, bytes] of Object.entries(entries)) out[path] = strFromU8(bytes)
  return out
}

describe('GET /:projectId/export?format=pptx', () => {
  it('pptx 를 낸다 — 콘텐츠 타입과 이름', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, 'pptx-one')
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fixture.projectId}/export?format=pptx`,
        cookies: fixture.cookie,
      })

      expect(res.statusCode).toBe(200)
      expect(res.headers['content-type']).toBe(
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      )
      expect(res.headers['content-disposition']).toBe(
        'attachment; filename="wirebound-export-pptx-one.pptx"',
      )
    })
  })

  it('본문이 zip 이고 패키지 뿌리에 [Content_Types].xml 이 있다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, 'pptx-two')
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fixture.projectId}/export?format=pptx`,
        cookies: fixture.cookie,
      })

      const files = unpack(res.rawPayload)
      // **뿌리 폴더가 있으면 받는 쪽이 이 파일을 못 찾아 통째로 안 열린다.**
      expect(Object.keys(files)).toContain('[Content_Types].xml')
      expect(Object.keys(files)).toContain('ppt/presentation.xml')
    })
  })

  it('페이지 수만큼 슬라이드가 있다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, 'pptx-three')
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fixture.projectId}/export?format=pptx`,
        cookies: fixture.cookie,
      })

      const slides = Object.keys(unpack(res.rawPayload)).filter((path) =>
        /^ppt\/slides\/slide\d+\.xml$/.test(path),
      )
      expect(slides).toHaveLength(3)
    })
  })

  it('번들과 같은 이름으로 페이지를 부른다 — 조상 메뉴가 붙는다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, 'pptx-four')
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fixture.projectId}/export?format=pptx`,
        cookies: fixture.cookie,
      })
      const files = unpack(res.rawPayload)
      const 제목들 = [1, 2, 3].map((n) => files[`ppt/slides/slide${n}.xml`]!)
      expect(제목들[0]).toContain('관리자 대시보드')
      expect(제목들[1]).toContain('관리자 회원 목록')
      expect(제목들[2]).toContain('관리자 회원 상세')
    })
  })

  it('코멘트와 상호작용 문장을 싣는다 — §8.2', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, 'pptx-five')
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fixture.projectId}/export?format=pptx`,
        cookies: fixture.cookie,
      })
      const 목록슬라이드 = unpack(res.rawPayload)['ppt/slides/slide2.xml']!
      expect(목록슬라이드).toContain('검색 조건은 AND 결합')
      expect(목록슬라이드).toContain('클릭 시')
    })
  })

  it('노트가 슬라이드마다 붙는다 — 잘려도 전문이 남는다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, 'pptx-six')
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fixture.projectId}/export?format=pptx`,
        cookies: fixture.cookie,
      })
      const notes = Object.keys(unpack(res.rawPayload)).filter((path) =>
        /^ppt\/notesSlides\/notesSlide\d+\.xml$/.test(path),
      )
      expect(notes).toHaveLength(3)
    })
  })

  it('인자가 없으면 그대로 zip 이다 — 옛 URL 이 안 깨진다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, 'pptx-seven')
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fixture.projectId}/export`,
        cookies: fixture.cookie,
      })
      expect(res.headers['content-type']).toBe('application/zip')
      expect(Object.keys(unpack(res.rawPayload)).some((path) => path.endsWith('index.html'))).toBe(true)
    })
  })

  it('모르는 형식은 400 이다 — 조용히 html 로 떨어지지 않는다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, 'pptx-eight')
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fixture.projectId}/export?format=pdf`,
        cookies: fixture.cookie,
      })
      expect(res.statusCode).toBe(400)
    })
  })

  it('페이지가 없으면 409 다 — html 과 같은 코드다', async () => {
    await withApi(async (ctx) => {
      const user = await signup(ctx)
      const project = await createProject(ctx, user.cookie, { name: '빈 것', slug: 'empty-pptx' })
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/export?format=pptx`,
        cookies: user.cookie,
      })
      expect(res.statusCode).toBe(409)
      expect(res.json().error.code).toBe('conflict')
    })
  })

  it('제 프로젝트의 페이지만 싣는다', async () => {
    await withApi(async (ctx) => {
      const 하나 = await 설계서(ctx, 'pptx-mine')
      await 설계서(ctx, 'pptx-yours')

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${하나.projectId}/export?format=pptx`,
        cookies: 하나.cookie,
      })
      const 전문 = Object.values(unpack(res.rawPayload)).join('')
      expect(전문).toContain('pptx-mine')
      expect(전문).not.toContain('pptx-yours')
    })
  })
})

describe('GET /:projectId/export/preview?format=pptx', () => {
  it('pptx 이름과 화면 없는 페이지를 낸다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, 'pptx-preview')
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fixture.projectId}/export/preview?format=pptx`,
        cookies: fixture.cookie,
      })

      expect(res.statusCode).toBe(200)
      expect(res.json().format).toBe('pptx')
      expect(res.json().fileName).toBe('wirebound-export-pptx-preview.pptx')
      // **오늘은 전부다** — 이미지를 만드는 자리가 P10-2다.
      expect(res.json().screenless).toEqual([
        '관리자 대시보드',
        '관리자 회원 목록',
        '관리자 회원 상세',
      ])
    })
  })

  /**
   * **HTML 번들의 성질을 pptx 응답에 싣지 않는다**(D7). PPTX는 페이지 사이 링크를 만들지
   * 않고 §6의 테마도 안 쓴다 — 값이 있는데 그 값이 아무것도 안 가리키면 화면이 거짓을 말한다.
   */
  it('html 전용 필드를 안 싣는다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, 'pptx-preview-2')
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fixture.projectId}/export/preview?format=pptx`,
        cookies: fixture.cookie,
      })
      expect(Object.keys(res.json()).sort()).toEqual(['fileName', 'format', 'pages', 'screenless'])
    })
  })

  it('페이지 이름이 html 미리보기와 같다 — 한 페이지를 두 이름으로 부르지 않는다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, 'pptx-preview-3')
      const url = `/api/projects/${fixture.projectId}/export/preview`
      const html = await ctx.app.inject({ method: 'GET', url, cookies: fixture.cookie })
      const pptx = await ctx.app.inject({ method: 'GET', url: `${url}?format=pptx`, cookies: fixture.cookie })
      expect(pptx.json().pages).toEqual(html.json().pages)
    })
  })

  it('인자가 없으면 html 갈래이고 format 을 되싣는다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, 'pptx-preview-4')
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fixture.projectId}/export/preview`,
        cookies: fixture.cookie,
      })
      expect(res.json().format).toBe('html')
      expect(res.json().fileName).toBe('wirebound-export-pptx-preview-4.zip')
      expect(res.json()).toHaveProperty('brokenLinks')
    })
  })

  it('모르는 형식은 400 이다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, 'pptx-preview-5')
      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${fixture.projectId}/export/preview?format=pdf`,
        cookies: fixture.cookie,
      })
      expect(res.statusCode).toBe(400)
    })
  })
})
