/**
 * **프로젝트 하나를 §11.3의 번들로 만드는 자리**(P8-4 T2 · D1·D5).
 *
 * ## 무엇이 섞이면 안 되나 — 자리가 넷이다
 *
 * | 자리 | 섞이면 |
 * |---|---|
 * | 프로젝트 → 번들 | 남의 프로젝트 페이지가 실린다. **§10의 권한이 산출물로 새는 자리다** |
 * | 페이지 → 그 페이지의 코멘트 | 코멘트가 옆 페이지 것으로 붙는다 |
 * | 페이지 → 그 페이지의 `target` | 링크가 엉뚱한 페이지로 간다 |
 * | 페이지 → 그 페이지의 문서 | 모든 페이지가 같은 목업을 그린다 |
 *
 * **그래서 프로젝트 둘 · 메뉴 넷 · 페이지 다섯 · 코멘트 여럿으로 잰다.** 하나씩이면 위
 * 넷이 전부 *"자리 0"*이 되어 섞여도 안 죽는다(P8-2 이월 §10 · P8-3 이월 §5).
 *
 * ## 견줄 것들이 서로 다른 그림인지부터 센다
 *
 * 자리마다 견주는 검사는 **견줄 것들이 우연히 같으면 조용히 통과한다.** 그래서 페이지
 * 파일들이 서로 다른 글자인지 먼저 세는 카나리아를 둔다 — P8-2 보고서 §8.2가 이름 붙인
 * 자리다.
 */
import { describe, expect, it } from 'vitest'
import type { PageDocument } from '@wirebound/schema'
import { exportProjectBundle, EmptyProjectError } from '../src/services/export-bundle'
import { createMenuNode, createPage, createProject, signup, withApi, type TestContext } from './helpers'

/** 페이지 하나의 문서를 통째로 갈아 끼운다. `PUT .../schema`를 실제로 지난다. */
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

async function addComment(
  ctx: TestContext,
  cookie: { wb_session: string },
  projectId: string,
  pageId: string,
  nodeId: string,
  body: string,
): Promise<void> {
  const res = await ctx.app.inject({
    method: 'POST',
    url: `/api/projects/${projectId}/pages/${pageId}/comments`,
    cookies: cookie,
    payload: { nodeId, body },
  })
  if (res.statusCode !== 201) {
    throw new Error(`addComment 픽스처가 실패했습니다 (status ${res.statusCode}): ${res.body}`)
  }
}

/**
 * 문서 하나. `rootId`·`buttonId`가 페이지마다 달라야 **코멘트가 옆 페이지로 붙는 것**을
 * 잴 수 있다 — 같은 id를 쓰면 남의 코멘트가 붙어도 노드를 찾아 그럴듯하게 그려진다.
 */
function doc(
  rootId: string,
  buttonId: string,
  label: string,
  navigateTo?: string,
): PageDocument {
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
  ctx: TestContext
  cookie: { wb_session: string }
  projectId: string
  pageIds: Record<string, string>
}

/**
 * 프로젝트 하나를 세운다.
 *
 * ```
 * 관리자          (메뉴)
 *   대시보드      → page:관리자/대시보드
 *   회원          (메뉴)
 *     목록        → page:관리자/회원/목록   ①·② 코멘트 둘
 *     상세        → page:관리자/회원/상세   ③ 코멘트 하나
 * 마케팅          (메뉴)
 *   랜딩          → page:마케팅/랜딩
 * ```
 *
 * `목록`의 버튼이 `page:관리자/회원/상세`로 이동하고, `상세`의 버튼은 **번들에 없는**
 * 타겟을 겨눈다 — 못 이은 링크를 재는 자리다.
 */
async function 설계서(ctx: TestContext, name: string, slug: string): Promise<Fixture> {
  const user = await signup(ctx)
  const project = await createProject(ctx, user.cookie, { name, slug })
  const cookie = user.cookie
  const projectId = project.id

  const 관리자 = await createMenuNode(ctx, cookie, projectId, { title: '관리자' })
  const 회원 = await createMenuNode(ctx, cookie, projectId, { parentId: 관리자.id, title: '회원' })
  const 마케팅 = await createMenuNode(ctx, cookie, projectId, { title: '마케팅' })

  const 대시보드 = await createPage(ctx, cookie, projectId, 관리자.id, { title: '대시보드' })
  const 목록 = await createPage(ctx, cookie, projectId, 회원.id, { title: '목록' })
  const 상세 = await createPage(ctx, cookie, projectId, 회원.id, { title: '상세' })
  const 랜딩 = await createPage(ctx, cookie, projectId, 마케팅.id, { title: '랜딩' })

  await putSchema(ctx, cookie, projectId, 대시보드.id, doc('n_dash', 'n_dash_btn', `${slug} 대시보드 버튼`))
  await putSchema(
    ctx,
    cookie,
    projectId,
    목록.id,
    doc('n_list', 'n_list_btn', `${slug} 목록 버튼`, 'page:관리자/회원/상세'),
  )
  await putSchema(
    ctx,
    cookie,
    projectId,
    상세.id,
    doc('n_detail', 'n_detail_btn', `${slug} 상세 버튼`, 'page:없는/페이지'),
  )
  await putSchema(ctx, cookie, projectId, 랜딩.id, doc('n_land', 'n_land_btn', `${slug} 랜딩 버튼`))

  await addComment(ctx, cookie, projectId, 목록.id, 'n_list_btn', `${slug} 목록 코멘트 하나`)
  await addComment(ctx, cookie, projectId, 목록.id, 'n_list', `${slug} 목록 코멘트 둘`)
  await addComment(ctx, cookie, projectId, 상세.id, 'n_detail_btn', `${slug} 상세 코멘트`)

  return {
    ctx,
    cookie,
    projectId,
    pageIds: { 대시보드: 대시보드.id, 목록: 목록.id, 상세: 상세.id, 랜딩: 랜딩.id },
  }
}

/** `pages/….html` 파일들만, 번들이 낸 순서 그대로. */
function pageFiles(files: readonly { path: string; content: string }[]): { path: string; content: string }[] {
  return files.filter((file) => file.path.startsWith('pages/'))
}

describe('exportProjectBundle', () => {
  it('페이지가 하나도 없으면 EmptyProjectError다', async () => {
    await withApi(async (ctx) => {
      const user = await signup(ctx)
      const project = await createProject(ctx, user.cookie, { name: '빈 것', slug: 'empty-one' })
      await expect(exportProjectBundle(ctx.db, project.id)).rejects.toBeInstanceOf(EmptyProjectError)
    })
  })

  it('§11.3의 파일 넷과 페이지마다 한 장을 낸다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, '설계서 하나', 'one')
      const bundle = await exportProjectBundle(ctx.db, fixture.projectId)

      expect(bundle.files.map((file) => file.path).filter((path) => !path.startsWith('pages/'))).toEqual([
        'index.html',
        'assets/shell.css',
        'assets/theme.css',
        'assets/runtime.js',
      ])
      expect(pageFiles(bundle.files)).toHaveLength(4)
    })
  })

  it('트리 순서대로 싣는다 — 그 메뉴의 페이지가 먼저이고 하위 메뉴가 뒤다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, '설계서 하나', 'one')
      const bundle = await exportProjectBundle(ctx.db, fixture.projectId)

      expect(bundle.pages.map((page) => page.title)).toEqual(['대시보드', '목록', '상세', '랜딩'])
    })
  })

  /**
   * **번들의 파일 이름이 §11.3의 예시 꼴이다**(P8-2 이월 §2의 판정 ②). `BundlePage.title`이
   * `<title>`·좌측 트리의 이름·파일 이름 셋의 재료이므로 조상이 붙으면 셋이 함께 붙는다.
   */
  it('파일 이름에 조상 메뉴가 붙는다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, '설계서 하나', 'one')
      const bundle = await exportProjectBundle(ctx.db, fixture.projectId)

      expect(pageFiles(bundle.files).map((file) => file.path)).toEqual([
        'pages/관리자-대시보드.html',
        'pages/관리자-회원-목록.html',
        'pages/관리자-회원-상세.html',
        'pages/마케팅-랜딩.html',
      ])
    })
  })

  it('좌측 트리와 <title>에도 조상이 붙는다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, '설계서 하나', 'one')
      const bundle = await exportProjectBundle(ctx.db, fixture.projectId)
      const index = bundle.files.find((file) => file.path === 'index.html')!

      expect(index.content).toContain('<title>관리자 대시보드</title>')
      for (const name of ['관리자 대시보드', '관리자 회원 목록', '관리자 회원 상세', '마케팅 랜딩']) {
        expect(index.content, name).toContain(`>${name}</a>`)
      }
    })
  })

  /**
   * **이것이 조상을 붙인 이유다.** D8 스모크에서 잰 것: 조상 없이는 좌측 트리가
   * `['목록','목록']`이 되어 읽는 사람이 둘을 구분할 수 없었다.
   */
  it('다른 메뉴의 같은 제목이 트리에서 갈린다', async () => {
    await withApi(async (ctx) => {
      const user = await signup(ctx)
      const project = await createProject(ctx, user.cookie, { name: '중복', slug: 'same-title' })
      const 관리자 = await createMenuNode(ctx, user.cookie, project.id, { title: '관리자' })
      const 회원 = await createMenuNode(ctx, user.cookie, project.id, { parentId: 관리자.id, title: '회원' })
      const 권한 = await createMenuNode(ctx, user.cookie, project.id, { parentId: 관리자.id, title: '권한' })
      await createPage(ctx, user.cookie, project.id, 회원.id, { title: '목록' })
      await createPage(ctx, user.cookie, project.id, 권한.id, { title: '목록' })

      const bundle = await exportProjectBundle(ctx.db, project.id)

      // 파일 이름이 자리 순서 접미사(`-2`)로 갈리는 것이 아니라 **이름 자체로** 갈린다.
      expect(pageFiles(bundle.files).map((file) => file.path)).toEqual([
        'pages/관리자-회원-목록.html',
        'pages/관리자-권한-목록.html',
      ])
      expect(bundle.duplicateTargets).toEqual([])
    })
  })

  /**
   * **경로까지 같으면 두 자리가 함께 무너진다.** 같은 메뉴 아래 같은 제목이면 타겟이 겹쳐
   * **둘 다 링크를 잃고**, 이름도 겹쳐 파일 이름이 자리 순서로 갈린다(`-2`). **원인이
   * 하나**이므로 화면이 그 하나(겹친 경로)를 말하면 된다.
   */
  it('경로까지 같으면 타겟이 겹치고 파일 이름만 자리 순서로 갈린다', async () => {
    await withApi(async (ctx) => {
      const user = await signup(ctx)
      const project = await createProject(ctx, user.cookie, { name: '완전중복', slug: 'same-path' })
      const 메뉴 = await createMenuNode(ctx, user.cookie, project.id, { title: '관리자' })
      await createPage(ctx, user.cookie, project.id, 메뉴.id, { title: '목록' })
      await createPage(ctx, user.cookie, project.id, 메뉴.id, { title: '목록' })

      const bundle = await exportProjectBundle(ctx.db, project.id)

      expect(bundle.duplicateTargets).toEqual(['page:관리자/목록'])
      expect(pageFiles(bundle.files).map((file) => file.path)).toEqual([
        'pages/관리자-목록.html',
        'pages/관리자-목록-2.html',
      ])
    })
  })

  it('페이지마다 §8.1의 제 타겟을 든다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, '설계서 하나', 'one')
      const bundle = await exportProjectBundle(ctx.db, fixture.projectId)

      expect(bundle.pages.map((page) => page.target)).toEqual([
        'page:관리자/대시보드',
        'page:관리자/회원/목록',
        'page:관리자/회원/상세',
        'page:마케팅/랜딩',
      ])
    })
  })

  /**
   * **카나리아.** 아래 자리별 검사들은 견줄 것들이 우연히 같으면 조용히 통과한다.
   * 네 장이 서로 다른 글자인지부터 센다.
   */
  it('페이지 파일 넷이 서로 다른 글자다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, '설계서 하나', 'one')
      const bundle = await exportProjectBundle(ctx.db, fixture.projectId)

      const contents = pageFiles(bundle.files).map((file) => file.content)
      expect(new Set(contents).size).toBe(4)
    })
  })

  it('자리마다 제 문서를 그린다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, '설계서 하나', 'one')
      const bundle = await exportProjectBundle(ctx.db, fixture.projectId)
      const files = pageFiles(bundle.files)

      const labels = ['one 대시보드 버튼', 'one 목록 버튼', 'one 상세 버튼', 'one 랜딩 버튼']
      for (const [index, label] of labels.entries()) {
        expect(files[index]!.content, `${index}번째 파일`).toContain(label)
        for (const [other, otherLabel] of labels.entries()) {
          if (other === index) continue
          expect(files[index]!.content, `${index}번째 파일에 ${other}번째 라벨`).not.toContain(otherLabel)
        }
      }
    })
  })

  it('자리마다 제 코멘트를 싣는다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, '설계서 하나', 'one')
      const bundle = await exportProjectBundle(ctx.db, fixture.projectId)
      const files = pageFiles(bundle.files)

      // 0=대시보드 1=목록 2=상세 3=랜딩
      expect(files[1]!.content).toContain('one 목록 코멘트 하나')
      expect(files[1]!.content).toContain('one 목록 코멘트 둘')
      expect(files[1]!.content).not.toContain('one 상세 코멘트')

      expect(files[2]!.content).toContain('one 상세 코멘트')
      expect(files[2]!.content).not.toContain('one 목록 코멘트 하나')

      expect(files[0]!.content).not.toContain('one 목록 코멘트 하나')
      expect(files[3]!.content).not.toContain('one 상세 코멘트')
    })
  })

  /**
   * **§10의 권한이 산출물로 새는 자리다.** 남의 프로젝트가 같은 메뉴·제목을 갖고 있어도
   * 번들에는 제 것만 실려야 한다.
   */
  it('남의 프로젝트가 안 실린다', async () => {
    await withApi(async (ctx) => {
      const 하나 = await 설계서(ctx, '설계서 하나', 'one')
      await 설계서(ctx, '설계서 둘', 'two')

      const bundle = await exportProjectBundle(ctx.db, 하나.projectId)
      const 전문 = bundle.files.map((file) => file.content).join('\n')

      expect(전문).toContain('one 목록 버튼')
      expect(전문).not.toContain('two')
      expect(bundle.pages).toHaveLength(4)
    })
  })

  it('건강한 문서에서는 errors가 비어 있다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, '설계서 하나', 'one')
      const bundle = await exportProjectBundle(ctx.db, fixture.projectId)
      expect(bundle.errors).toEqual([])
    })
  })

  describe('못 이은 링크', () => {
    it('번들에 없는 타겟을 겨눈 링크를 이름으로 말한다', async () => {
      await withApi(async (ctx) => {
        const fixture = await 설계서(ctx, '설계서 하나', 'one')
        const bundle = await exportProjectBundle(ctx.db, fixture.projectId)

        expect(bundle.brokenLinks).toEqual([
          { target: 'page:없는/페이지', reason: 'missing', from: ['상세'] },
        ])
      })
    })

    it('이어진 타겟은 말하지 않는다', async () => {
      await withApi(async (ctx) => {
        const fixture = await 설계서(ctx, '설계서 하나', 'one')
        const bundle = await exportProjectBundle(ctx.db, fixture.projectId)

        expect(bundle.brokenLinks.map((link) => link.target)).not.toContain('page:관리자/회원/상세')
      })
    })

    /**
     * **두 페이지가 같은 타겟을 들면 둘 다 링크를 잃는다**(P8-3 이월 §3.4). 조립 규칙이
     * 그 상태를 만들 수 있으므로(같은 메뉴 아래 같은 제목) 화면이 **미리** 말해야 한다.
     */
    it('두 페이지가 같은 타겟을 들면 ambiguous다', async () => {
      await withApi(async (ctx) => {
        const fixture = await 설계서(ctx, '설계서 하나', 'one')
        // `관리자/회원` 아래에 `상세`를 하나 더 만든다 — 타겟이 겹친다.
        const tree = await ctx.app.inject({
          method: 'GET',
          url: `/api/projects/${fixture.projectId}/tree`,
          cookies: fixture.cookie,
        })
        const 회원 = tree.json().menu[0].children[0]
        await createPage(ctx, fixture.cookie, fixture.projectId, 회원.id, { title: '상세' })

        const bundle = await exportProjectBundle(ctx.db, fixture.projectId)
        expect(bundle.brokenLinks).toContainEqual({
          target: 'page:관리자/회원/상세',
          reason: 'ambiguous',
          from: ['목록'],
        })
      })
    })

    it('빈 타겟은 못 이은 링크가 아니다 — 아직 안 고른 것이다', async () => {
      await withApi(async (ctx) => {
        const user = await signup(ctx)
        const project = await createProject(ctx, user.cookie, { name: '빈 타겟', slug: 'blank-target' })
        const menu = await createMenuNode(ctx, user.cookie, project.id, { title: '메뉴' })
        const page = await createPage(ctx, user.cookie, project.id, menu.id, { title: '페이지' })
        await putSchema(ctx, user.cookie, project.id, page.id, doc('n_r', 'n_b', '버튼', ''))

        const bundle = await exportProjectBundle(ctx.db, project.id)
        expect(bundle.brokenLinks).toEqual([])
      })
    })

    it('겹치는 타겟을 그대로 낸다', async () => {
      await withApi(async (ctx) => {
        const user = await signup(ctx)
        const project = await createProject(ctx, user.cookie, { name: '겹침', slug: 'dupes' })
        const menu = await createMenuNode(ctx, user.cookie, project.id, { title: '메뉴' })
        await createPage(ctx, user.cookie, project.id, menu.id, { title: '같은 이름' })
        await createPage(ctx, user.cookie, project.id, menu.id, { title: '같은 이름' })

        const bundle = await exportProjectBundle(ctx.db, project.id)
        expect(bundle.duplicateTargets).toEqual(['page:메뉴/같은 이름'])
      })
    })
  })

  it('테마를 프로젝트가 지금 쓰는 것으로 싣는다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, '설계서 하나', 'one')
      const bundle = await exportProjectBundle(ctx.db, fixture.projectId)

      const themeCss = bundle.files.find((file) => file.path === 'assets/theme.css')
      expect(themeCss).toBeDefined()
      // 새 프로젝트의 기본 레이아웃은 시스템 `admin`을 가리킨다(`repos/projects.ts`).
      // **수를 여기 적지 않는다** — 시트가 비어 있지 않다는 것만 잰다.
      expect(themeCss!.content.length).toBeGreaterThan(0)
      expect(bundle.themeId).not.toBeNull()
    })
  })

  it('테마를 벗긴 프로젝트도 번들이 나온다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, '설계서 하나', 'one')
      const res = await ctx.app.inject({
        method: 'PUT',
        url: `/api/projects/${fixture.projectId}/theme`,
        cookies: fixture.cookie,
        payload: { themeId: null },
      })
      expect(res.statusCode).toBe(200)

      const bundle = await exportProjectBundle(ctx.db, fixture.projectId)
      expect(bundle.themeId).toBeNull()
      expect(pageFiles(bundle.files)).toHaveLength(4)
    })
  })
})
