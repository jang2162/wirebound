/**
 * **프로젝트 하나를 §11.3의 번들로 만드는 자리**(P8-4 T2 · D1·D5).
 *
 * ## 무엇이 섞이면 안 되나 — 자리가 여섯이다
 *
 * | 자리 | 섞이면 |
 * |---|---|
 * | 프로젝트 → 번들 | 남의 프로젝트 페이지가 실린다. **§10의 권한이 산출물로 새는 자리다** |
 * | 페이지 → 그 페이지의 코멘트 | 코멘트가 옆 페이지 것으로 붙는다 |
 * | 페이지 → 그 페이지의 `target` | 링크가 엉뚱한 페이지로 간다 |
 * | 페이지 → 그 페이지의 문서 | 모든 페이지가 같은 목업을 그린다 |
 * | 페이지 → 그 페이지의 **설명** | 남의 설명이 실린다 |
 * | 코멘트 → 그 코멘트의 **노드·작성자·시각** | 코멘트가 엉뚱한 노드에 붙고 남이 한 말이 된다 |
 *
 * **뒤의 둘은 P8-4 리뷰가 뚫었다**(발견 ⑤⑥ — 변이 다섯이 살아남았다). 앞의 넷과 원인이
 * 같지 않다: 앞의 넷은 *"자리가 하나뿐이라 섞을 수 없었다"*였고, 이 둘은 **케이스가 그
 * 축을 아예 안 쟀다.** 설명은 픽스처가 한 번도 안 줬고(모든 페이지가 `null`이라 섞어도
 * 같다), 코멘트는 `body` 문자열만 봤다(나머지 셋은 아무도 안 봤다).
 *
 * **그래서 프로젝트 둘 · 메뉴 넷 · 페이지 다섯 · 코멘트 여럿 · 작성자 둘 · 서로 다른
 * 설명으로 잰다.** 하나씩이면 위 여섯이 전부 *"자리 0"*이 되어 섞여도 안 죽는다
 * (P8-2 이월 §10 · P8-3 이월 §5).
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
import {
  addMember,
  createMenuNode,
  createPage,
  createProject,
  signup,
  withApi,
  type TestContext,
} from './helpers'

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
 * 그 페이지의 코멘트를 **viewer가 화면에서 보는 응답으로** 받는다.
 *
 * **기대값을 여기서 만드는 것이 요점이다.** 번들이 담는 코멘트 필드 넷은 전부 이 응답에
 * 이미 있고(`routes/export.ts` 머리말의 표 — 재라 #5), 그러므로 *"번들이 화면보다 더도
 * 덜도 담지 않는다"*를 견줄 자가 이 응답이다. 기대값을 케이스가 글자로 들면 `authorName`·
 * `createdAt`처럼 **실행마다 달라지는 값**은 애초에 잴 수 없다.
 */
async function 코멘트응답(
  fixture: Fixture,
  pageId: string,
): Promise<{ nodeId: string; body: string; authorName: string; createdAt: string }[]> {
  const res = await fixture.ctx.app.inject({
    method: 'GET',
    url: `/api/projects/${fixture.projectId}/pages/${pageId}/comments`,
    cookies: fixture.cookie,
  })
  if (res.statusCode !== 200) {
    throw new Error(`코멘트 조회 픽스처가 실패했습니다 (status ${res.statusCode}): ${res.body}`)
  }
  return res.json()
}

/**
 * 프로젝트 하나를 세운다.
 *
 * ```
 * 관리자          (메뉴)
 *   대시보드      → page:관리자/대시보드      설명 있음
 *   회원          (메뉴)
 *     목록        → page:관리자/회원/목록   ①·② 코멘트 둘 — **노드도 작성자도 다르다**
 *     상세        → page:관리자/회원/상세   ③ 코멘트 하나
 * 마케팅          (메뉴)
 *   랜딩          → page:마케팅/랜딩         **설명 없음**
 * ```
 *
 * `목록`의 버튼이 `page:관리자/회원/상세`로 이동하고, `상세`의 버튼은 **번들에 없는**
 * 타겟을 겨눈다 — 못 이은 링크를 재는 자리다.
 *
 * **설명은 페이지마다 다르고 하나는 없다.** 전부 주면 *"없을 때 무엇을 그리는가"*가 안
 * 재지고, 하나도 안 주면 자리를 섞어도 `null`끼리 바뀌어 아무것도 안 죽는다(리뷰 발견 ⑤).
 *
 * **코멘트 작성자가 둘이다.** 하나뿐이면 작성자 자리를 섞는 변이가 안 죽는다 —
 * `addMember`로 넣는다(초대 API에 기대지 않는 것은 그 함수의 머리말이 적은 이유다).
 */
async function 설계서(ctx: TestContext, name: string, slug: string): Promise<Fixture> {
  const user = await signup(ctx)
  const project = await createProject(ctx, user.cookie, { name, slug })
  const cookie = user.cookie
  const projectId = project.id

  const 둘째사람 = await signup(ctx)
  await addMember(ctx, projectId, 둘째사람.user.id, 'editor')

  const 관리자 = await createMenuNode(ctx, cookie, projectId, { title: '관리자' })
  const 회원 = await createMenuNode(ctx, cookie, projectId, { parentId: 관리자.id, title: '회원' })
  const 마케팅 = await createMenuNode(ctx, cookie, projectId, { title: '마케팅' })

  const 대시보드 = await createPage(ctx, cookie, projectId, 관리자.id, {
    title: '대시보드',
    description: `${slug} 대시보드 설명`,
  })
  const 목록 = await createPage(ctx, cookie, projectId, 회원.id, {
    title: '목록',
    description: `${slug} 목록 설명`,
  })
  const 상세 = await createPage(ctx, cookie, projectId, 회원.id, {
    title: '상세',
    description: `${slug} 상세 설명`,
  })
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
  // **다른 사람이 다른 노드에 단다.** 한 페이지 안에서 노드·작성자·시각 셋이 전부 갈린다.
  await addComment(ctx, 둘째사람.cookie, projectId, 목록.id, 'n_list', `${slug} 목록 코멘트 둘`)
  await addComment(ctx, cookie, projectId, 상세.id, 'n_detail_btn', `${slug} 상세 코멘트`)

  return {
    ctx,
    cookie,
    projectId,
    pageIds: { 대시보드: 대시보드.id, 목록: 목록.id, 상세: 상세.id, 랜딩: 랜딩.id },
  }
}

/**
 * 번들이 **실제로 이은 링크.** 페이지 HTML의 `<script>`에 심긴 런타임 계획에서 읽는다.
 *
 * **왜 이것을 따로 재는가:** 미리보기의 `brokenLinks`는 `targetedPages`가 낸 값으로
 * 세지만, 번들의 링크는 `exportBundle`에 넘긴 `BundlePage.target`으로 만들어진다.
 * **둘이 다른 값에서 나오므로 갈릴 수 있다** — 변이 M8(모든 페이지가 첫 페이지의 타겟을
 * 든다)이 살아남은 것이 그 증거였다. 미리보기는 멀쩡한데 번들의 링크가 전부 죽어 있었다.
 */
function runtimeRequests(
  content: string,
): { type: string; target: string; href: string | null; problem: string | null }[] {
  const match = /<script type="application\/json" id="wb-export-runtime-data">(.*?)<\/script>/s.exec(content)
  if (!match) throw new Error('페이지에 런타임 데이터가 없습니다')
  const plan = JSON.parse(match[1]!) as { events?: { requests?: unknown[] }[] }
  return (plan.events ?? []).flatMap((event) => (event.requests ?? []) as never[])
}

/**
 * 페이지 HTML의 **코멘트 탭 줄들.** 산출물 자체를 읽는다(이월 §13의 규율).
 *
 * `<li class="wb-export-entry" data-wb-marker-for="<노드 id>" …>` 안의 라벨·본문·메타를
 * 꺼낸다. 상호작용 탭도 같은 클래스를 쓰지만 `data-wb-interaction-for`라 안 걸린다.
 */
function commentEntries(
  content: string,
): { nodeId: string; label: string; body: string | null; meta: string | null }[] {
  const entries: { nodeId: string; label: string; body: string | null; meta: string | null }[] = []
  const re = /<li class="wb-export-entry" data-wb-marker-for="([^"]*)"[^>]*>(.*?)<\/li>/gs
  for (const match of content.matchAll(re)) {
    const inner = match[2]!
    entries.push({
      nodeId: match[1]!,
      label: /<span class="wb-export-entry-label">(.*?)<\/span>/s.exec(inner)?.[1] ?? '',
      body: /<p class="wb-export-entry-body">(.*?)<\/p>/s.exec(inner)?.[1] ?? null,
      meta: /<p class="wb-export-entry-meta">(.*?)<\/p>/s.exec(inner)?.[1] ?? null,
    })
  }
  return entries
}

/**
 * **`errors`가 나는 상태를 실제로 만든다.** 정상 경로(`PUT .../schema`)는 모르는 컴포넌트를
 * **422로 막으므로** 그 길로는 못 만든다. 그래서 `pages.schema`에 직접 심는다 —
 * **카탈로그에서 컴포넌트가 빠지는 날 실제로 생기는 상태**이고, P8-4 리뷰가 이 값을 재서
 * 그 갈래가 닿는다는 것을 보였다(발견 ④).
 */
async function 그리지못할노드를심는다(
  ctx: TestContext,
  pageId: string,
  nodeId: string,
  type: string,
): Promise<void> {
  await ctx.db
    .updateTable('pages')
    .set({
      schema: JSON.stringify({
        version: 1,
        root: { id: 'n_broken_root', type: 'Page', children: [{ id: nodeId, type }] },
      }),
    })
    .where('id', '=', pageId)
    .execute()
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

  /**
   * **이름은 번들이 부르는 이름이다**(조상이 붙어 있다). 맨 제목을 내면 내려받기 화면의
   * 페이지 목록이 `목록`·`목록`으로 보이는데, 그것이 번들의 좌측 트리에서 고친 그
   * 결함이다(P8-4 리뷰 발견 ①). 같은 응답의 `errors[].title`도 이 이름이다(발견 ③).
   */
  it('트리 순서대로 싣고 이름에 조상이 붙어 있다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, '설계서 하나', 'one')
      const bundle = await exportProjectBundle(ctx.db, fixture.projectId)

      expect(bundle.pages.map((page) => page.title)).toEqual([
        '관리자 대시보드',
        '관리자 회원 목록',
        '관리자 회원 상세',
        '마케팅 랜딩',
      ])
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
   * **설명도 자리가 있다**(리뷰 발견 ⑤). `routes/export.ts`의 머리말이 *"페이지 설명"*을
   * 번들이 담는 것 여섯 중 하나로 세어 놓고, 앞 판의 픽스처는 그것을 한 번도 주지 않아
   * 모든 페이지가 `null`이었다 — **자리를 섞어도 `null`끼리 바뀌었다.**
   */
  it('자리마다 제 설명을 싣는다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, '설계서 하나', 'one')
      const bundle = await exportProjectBundle(ctx.db, fixture.projectId)
      const files = pageFiles(bundle.files)

      // 0=대시보드 1=목록 2=상세 3=랜딩(설명 없음)
      const 설명들 = ['one 대시보드 설명', 'one 목록 설명', 'one 상세 설명']
      for (const [index, 설명] of 설명들.entries()) {
        expect(files[index]!.content, `${index}번째 파일`).toContain(설명)
        for (const [other, 남의설명] of 설명들.entries()) {
          if (other === index) continue
          expect(files[index]!.content, `${index}번째 파일에 ${other}번째 설명`).not.toContain(남의설명)
        }
      }

      // **없는 것은 없다고 그린다.** 빈 자리를 두면 *"설명이 없는 페이지"*와 *"설명을 안
      // 실은 경로"*가 같은 화면이 된다(`shell.tsx`의 `DescriptionTab`).
      expect(files[3]!.content).toContain('페이지 설명이 없습니다')
      expect(files[3]!.content).not.toContain('설명이다')
    })
  })

  /**
   * **코멘트가 드는 것은 `body`만이 아니다**(리뷰 발견 ⑥). `BundleComment`는 넷을 드는데
   * 앞 판의 케이스는 `body` 문자열만 봤다 — 노드·작성자·시각을 지어내는 변이 셋이 전부
   * 살아남았고, **산출물은 실제로 바뀌었다.**
   *
   * `nodeId`가 특히 D5의 부류다: 그것이 섞이면 코멘트가 **엉뚱한 노드에** 붙고(문서에 없는
   * 노드면 *"사라진 노드"*로 그려진다) 그 설계서도 눈으로는 그럴듯하다. 앞의 케이스가
   * 재는 것은 *"페이지 사이"*이고 여기가 **노드 사이**다.
   *
   * **기대값은 화면이 보는 응답에서 만든다** — `authorName`·`createdAt`은 실행마다 다르다.
   */
  it('코멘트마다 제 노드·제 작성자·제 시각을 든다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, '설계서 하나', 'one')
      const bundle = await exportProjectBundle(ctx.db, fixture.projectId)

      const 코멘트들 = await 코멘트응답(fixture, fixture.pageIds.목록!)
      expect(코멘트들).toHaveLength(2)
      // 카나리아: 셋이 서로 다른 값이어야 자리를 섞는 변이가 잡힌다.
      expect(new Set(코멘트들.map((comment) => comment.nodeId)).size).toBe(2)
      expect(new Set(코멘트들.map((comment) => comment.authorName)).size).toBe(2)
      expect(new Set(코멘트들.map((comment) => comment.createdAt)).size).toBe(2)

      // 0=대시보드 1=목록 2=상세 3=랜딩
      const entries = commentEntries(pageFiles(bundle.files)[1]!.content)
      for (const comment of 코멘트들) {
        const entry = entries.find((line) => line.body === comment.body)
        expect(entry, comment.body).toBeDefined()
        expect(entry!.nodeId, `${comment.body}가 붙은 노드`).toBe(comment.nodeId)
        expect(entry!.meta, `${comment.body}의 작성자·시각`).toBe(
          `${comment.authorName} · ${comment.createdAt}`,
        )
      }

      // 붙을 노드를 못 찾은 코멘트가 하나도 없다(`MISSING_NODE_LABEL`).
      expect(entries.map((line) => line.label)).not.toContain('사라진 노드')
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

  /**
   * **`errors`가 나는 상태를 실제로 만들어 잰다**(리뷰 발견 ④). *"비어 있다"*만 재면
   * `errors`를 통째로 버리는 변이도 그것을 만족한다 — D6(*"내려받기 버튼이 조용히 성공하면
   * 안 된다"*)이 기대는 값이 이것이므로 **값이 실제로 흐르는 것**을 잰다.
   */
  it('그리지 못한 노드를 페이지의 번들 이름으로 말한다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, '설계서 하나', 'one')
      await 그리지못할노드를심는다(ctx, fixture.pageIds.목록!, 'n_gone', '없는컴포넌트')

      const bundle = await exportProjectBundle(ctx.db, fixture.projectId)

      expect(bundle.errors).toHaveLength(1)
      // **파일 경로가 아니라 이름으로 말한다** — 화면이 이것을 그대로 보인다.
      expect(bundle.errors[0]!.title).toBe('관리자 회원 목록')
      expect(bundle.errors[0]!.path).toBe('pages/관리자-회원-목록.html')
      expect(bundle.errors[0]!.error.nodeId).toBe('n_gone')
      expect(bundle.errors[0]!.error.message).toContain('없는컴포넌트')

      // 다른 페이지는 멀쩡하다 — 한 장이 깨져도 나머지는 그대로 나간다.
      expect(pageFiles(bundle.files)).toHaveLength(4)
    })
  })

  /**
   * **`buildMenuTree`가 페이지를 잃으면 멈춘다** — 조용히 빠지는 것이 이 산출물에서 가장
   * 나쁜 실패다.
   *
   * **이 상태는 도달 가능하다.** `pages_menu_node_id_fkey`는 `menu_nodes(id)`만 참조하고
   * **프로젝트를 안 본다**(P8-4 리뷰가 재서 보였다 — 발견 ⑦). 그래서 남의 프로젝트의 메뉴를
   * 가리키는 페이지 행이 FK를 통과하고, `listMenuRows`가 그 메뉴를 안 내므로 그 페이지가
   * 트리에서 고아가 된다. 스냅샷 복원·가져오기처럼 페이지 행을 직접 쓰는 경로가 닿는다.
   */
  it('메뉴 트리가 페이지를 잃으면 번들을 안 낸다', async () => {
    await withApi(async (ctx) => {
      const 하나 = await 설계서(ctx, '설계서 하나', 'one')
      const 둘 = await 설계서(ctx, '설계서 둘', 'two')

      const 남의메뉴 = await ctx.db
        .selectFrom('menu_nodes')
        .select('id')
        .where('project_id', '=', 둘.projectId)
        .executeTakeFirstOrThrow()
      await ctx.db
        .updateTable('pages')
        .set({ menu_node_id: 남의메뉴.id })
        .where('id', '=', 하나.pageIds.목록!)
        .execute()

      await expect(exportProjectBundle(ctx.db, 하나.projectId)).rejects.toThrow(
        /메뉴 트리가 페이지를 잃었습니다/,
      )
    })
  })

  /**
   * **번들이 실제로 링크를 이었는가.** 위 `brokenLinks` 검사들은 미리보기의 값을 재는데,
   * 그 값과 번들의 링크는 **서로 다른 자리에서** 나온다. 여기서 번들 쪽을 잰다.
   */
  it('이어진 타겟이 번들 안에서 그 페이지 파일을 가리킨다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, '설계서 하나', 'one')
      const bundle = await exportProjectBundle(ctx.db, fixture.projectId)

      // 0=대시보드 1=목록 2=상세 3=랜딩
      const 목록 = runtimeRequests(pageFiles(bundle.files)[1]!.content)
      const 상세로 = 목록.find((request) => request.target === 'page:관리자/회원/상세')

      expect(상세로).toBeDefined()
      expect(상세로!.href).not.toBeNull()
      expect(decodeURIComponent(상세로!.href!)).toBe('관리자-회원-상세.html')
      expect(상세로!.problem).toBeNull()
    })
  })

  it('못 이은 타겟은 번들 안에서 링크가 없고 이유가 실린다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, '설계서 하나', 'one')
      const bundle = await exportProjectBundle(ctx.db, fixture.projectId)

      const 상세 = runtimeRequests(pageFiles(bundle.files)[2]!.content)
      const 없는곳으로 = 상세.find((request) => request.target === 'page:없는/페이지')

      expect(없는곳으로).toBeDefined()
      expect(없는곳으로!.href).toBeNull()
      expect(없는곳으로!.problem).not.toBeNull()
    })
  })

  describe('못 이은 링크', () => {
    it('번들에 없는 타겟을 겨눈 링크를 이름으로 말한다', async () => {
      await withApi(async (ctx) => {
        const fixture = await 설계서(ctx, '설계서 하나', 'one')
        const bundle = await exportProjectBundle(ctx.db, fixture.projectId)

        // `from`도 **번들 이름**이다 — 화면이 한 페이지를 한 이름으로 부른다(발견 ①).
        expect(bundle.brokenLinks).toEqual([
          { target: 'page:없는/페이지', reason: 'missing', from: ['관리자 회원 상세'] },
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
          from: ['관리자 회원 목록'],
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

  /**
   * **테마가 실제로 실렸는가.** `assets/theme.css`가 비어 있지 않은 것으로는 못 잰다 —
   * 그 파일에는 **구조 기본 CSS**가 늘 들어 있어서 테마가 없어도 길이가 0이 아니다
   * (변이 M14가 그 자리를 뚫고 살아남았다). 그래서 **테마를 벗긴 같은 프로젝트와 견준다.**
   */
  it('테마를 벗기면 assets/theme.css가 달라진다', async () => {
    await withApi(async (ctx) => {
      const fixture = await 설계서(ctx, '설계서 하나', 'one')
      const 테마있음 = await exportProjectBundle(ctx.db, fixture.projectId)

      const res = await ctx.app.inject({
        method: 'PUT',
        url: `/api/projects/${fixture.projectId}/theme`,
        cookies: fixture.cookie,
        payload: { themeId: null },
      })
      expect(res.statusCode).toBe(200)
      const 테마없음 = await exportProjectBundle(ctx.db, fixture.projectId)

      const css = (bundle: { files: { path: string; content: string }[] }) =>
        bundle.files.find((file) => file.path === 'assets/theme.css')!.content

      expect(css(테마있음)).not.toBe(css(테마없음))
      // 카나리아: 둘 다 비어 있으면 위 견주기가 아무것도 안 지킨다.
      expect(css(테마있음).length).toBeGreaterThan(0)
      expect(css(테마없음).length).toBeGreaterThan(0)
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
