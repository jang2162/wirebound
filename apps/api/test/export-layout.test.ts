/**
 * **내보내기는 표시 옵션을 안 싣는다 — 라우트로 내려받은 zip 에서 잰다**(설계 `docs/superpowers/specs/2026-11-25-page-layout-design.md` 「정해진 것」 3 ·
 * 「HTML 번들」). 사람이 편집 캔버스에서 영역을 꺼 둬도(`PUT …/view-prefs`) 번들 · PPTX 는 늘 다 켠다 — 그 값이 내보내기 행(`ExportRows`)에 들면
 * 워커 경계를 지나 장 데이터에 닿을 수 있다. 그래서 같은 스레드의 `exportProjectBundle` 이 아니라 워커를 지나는 `GET …/export` 로 잰다(지침
 * «`ExportRows` 에 칸을 더하면 …»). PPTX 의 화면은 같은 행으로 지은 같은 번들(`export-bundle.ts` 의 `projectBundle`)의 장을 찍으므로 HTML 판이 그 몫도
 * 잰다 — PPTX zip 에는 번들의 데이터가 안 실려 거기서는 셀 것이 없다. 내비 한 벌(`assets/nav.js`)이 트리와 페이지마다의 레이아웃을 싣는지도 같은 zip 에서 본다. 다 켠 틀이 그려지는지
 * (실브라우저)는 `apps/web/build-test/bundle-layout.test.ts`.
 */
import { strFromU8, unzipSync } from 'fflate'
import type { PageDocument } from '@wirebound/schema'
import { describe, expect, it } from 'vitest'
import { createMenuNode, createPage, createProject, signup, withApi, type TestContext } from './helpers'

function subpage(rootId: string, label: string): PageDocument {
  return {
    version: 7,
    layout: 'subpage',
    root: { id: rootId, type: 'Page', children: [{ id: `${rootId}_b`, type: 'Button', props: { label } }] },
  } as PageDocument
}

async function putSchema(ctx: TestContext, cookie: { wb_session: string }, projectId: string, pageId: string, schema: PageDocument) {
  const res = await ctx.app.inject({
    method: 'PUT',
    url: `/api/projects/${projectId}/pages/${pageId}/schema`,
    cookies: cookie,
    payload: { schema },
  })
  if (res.statusCode !== 200) throw new Error(`putSchema ${res.statusCode}: ${res.body}`)
}

/** 끈 영역 — 열쇠 꼴은 «<레이아웃>.<영역 id>»(`apps/api/README.md` 의 view-prefs 줄). 글자가 zip 어디에도 없어야 한다. */
const HIDDEN = ['subpage.gnb', 'subpage.lnbHiddenProbe']

async function fixture(ctx: TestContext) {
  const user = await signup(ctx)
  const project = await createProject(ctx, user.cookie, { slug: 'layout-export' })
  const menu = await createMenuNode(ctx, user.cookie, project.id, { title: '회원관리' })
  const list = await createPage(ctx, user.cookie, project.id, menu.id, { title: '회원 목록' })
  const detail = await createPage(ctx, user.cookie, project.id, menu.id, { title: '회원 상세' })
  await putSchema(ctx, user.cookie, project.id, list.id, subpage('n_list', '검색'))
  await putSchema(ctx, user.cookie, project.id, detail.id, subpage('n_detail', '저장'))
  const prefs = await ctx.app.inject({
    method: 'PUT',
    url: `/api/projects/${project.id}/view-prefs`,
    cookies: user.cookie,
    payload: { hiddenRegions: HIDDEN },
  })
  expect(prefs.statusCode).toBe(200)
  return { cookie: user.cookie, projectId: project.id, menuId: menu.id, listId: list.id, detailId: detail.id }
}

async function zipOf(ctx: TestContext, cookie: { wb_session: string }, projectId: string, format: 'html' | 'pptx') {
  const res = await ctx.app.inject({ method: 'GET', url: `/api/projects/${projectId}/export?format=${format}`, cookies: cookie })
  expect(res.statusCode).toBe(200)
  return unzipSync(new Uint8Array(res.rawPayload))
}

/**
 * zip 의 엔트리 가운데 **데이터를 싣는 것**을 이은 글 — 코드(`assets/runtime.js` 의 렌더러 · 테마 패키지의 `assets/theme/**`)는 뺀다. 코드에는 칸 이름
 * (`hiddenRegions` — `LayoutFrame` 의 prop)이 늘 든다. 뺀 수를 카나리아로 낸다.
 */
function dataText(entries: Record<string, Uint8Array>): { text: string; skipped: number } {
  const kept = Object.entries(entries).filter(([name]) => !name.endsWith('/assets/runtime.js') && !name.includes('/assets/theme/'))
  return { text: kept.map(([, bytes]) => strFromU8(bytes)).join('\n'), skipped: Object.keys(entries).length - kept.length }
}

describe('내보내기는 사람의 표시 옵션을 안 싣는다', () => {
  it('HTML 번들 — 끈 영역의 열쇠 · 칸 이름이 zip 어디에도 없다', async () => {
    await withApi(async (ctx) => {
      const { cookie, projectId } = await fixture(ctx)
      // 판이 섰다 — 그 사람의 행이 저장돼 있다.
      const read = await ctx.app.inject({ method: 'GET', url: `/api/projects/${projectId}/view-prefs`, cookies: cookie })
      expect(read.json()).toEqual({ hiddenRegions: HIDDEN })

      const { text, skipped } = dataText(await zipOf(ctx, cookie, projectId, 'html'))
      expect(skipped).toBeGreaterThanOrEqual(1)
      expect(text).toContain('wb-export-page')
      for (const key of [...HIDDEN, 'lnbHiddenProbe', 'hiddenRegions', 'hidden_regions']) expect(text, key).not.toContain(key)
    })
  })
})

describe('번들의 내비 한 벌', () => {
  it('assets/nav.js 가 메뉴 트리 · 페이지마다의 레이아웃 · 장 경로를 싣고 장은 제 페이지 id 만 든다', async () => {
    await withApi(async (ctx) => {
      const { cookie, projectId, menuId, listId, detailId } = await fixture(ctx)
      const entries = await zipOf(ctx, cookie, projectId, 'html')
      const navPath = Object.keys(entries).find((name) => name.endsWith('/assets/nav.js'))
      expect(navPath).toBeDefined()
      const scope: Record<string, unknown> = {}
      new Function('globalThis', strFromU8(entries[navPath!]!))(scope)
      const nav = scope.__wirebound_export_nav__ as {
        menu: { id: string; title: string; pages: { id: string; title: string; layout: string }[] }[]
        paths: Record<string, string>
      }
      expect(nav.menu.map((menu) => [menu.id, menu.title, menu.pages.map((page) => [page.id, page.title, page.layout])])).toEqual([
        [
          menuId,
          '회원관리',
          [
            [listId, '회원 목록', 'subpage'],
            [detailId, '회원 상세', 'subpage'],
          ],
        ],
      ])
      expect(nav.paths).toEqual({ [listId]: 'pages/회원관리-회원-목록.html', [detailId]: 'pages/회원관리-회원-상세.html' })

      const page = strFromU8(entries[navPath!.replace('assets/nav.js', 'pages/회원관리-회원-상세.html')]!)
      const data = JSON.parse(/<script type="application\/json" id="wb-export-page">([\s\S]*?)<\/script>/.exec(page)![1]!) as Record<
        string,
        unknown
      >
      expect([data.pageId, data.pageTitle, data.path]).toEqual([detailId, '회원 상세', 'pages/회원관리-회원-상세.html'])
      expect(data).not.toHaveProperty('menu')
      expect(page).toContain('<script src="../assets/nav.js"></script>')
    })
  })
})
