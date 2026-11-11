/**
 * **코멘트 토큰 리뷰 대응 — 내보낸 HTML 번들 실브라우저 판**(리뷰 `docs/superpowers/plans/2026-11-11-rv-tk-report.md` M1 · M2 · L1 · L4 의 탐침
 * `probe-bundle.mjs` · `probe-bidi.mjs` · `anchor.mjs` 를 옮겼다). 번들은 api 가 패키지마다의 `dist` 로 짓는다 — `pnpm build` 가 먼저다.
 * jsdom 판(탭을 고르는지 · 상태를 안 건드리는지)은 `packages/exporter/test/bundle-view-states.test.ts` «런타임 — 번호 닻 해시».
 *
 * | 무엇이 거짓이면 죽나 |
 * |---|
 * | M1 페이지 제목의 방향 제어 글자(RLO)가 번들 코멘트의 토큰 뒤 글(«끝 글»)까지 뒤집는다 |
 * | M2 다른 장의 번호 닻(`#wb-marker-…`)으로 연 장에서 그 줄이 닫힌 «코멘트» 탭 안이라 안 보인다 · 창 밖이다 |
 * | L1 같은 장의 번호 토큰을 누르면 고른 화면 상태가 기본으로 돌아간다 |
 * | L4 번호 걷힌 노드로 가는 닻으로 연 장이 목업의 그 노드로 안 간다 |
 */
import { pathToFileURL } from 'node:url'
import type { BrowserContext, Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { exportBundle, type UnpackedBundle } from './layout-bundle'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const RLO = String.fromCharCode(0x202e)
const FILLER = 40

describe.skipIf(!전제.ok)('코멘트 토큰 번들 — 실브라우저', () => {
  let stack: EditorStack
  let alice: Session
  let bundle: UnpackedBundle
  let listFile: string
  let detailFile: string

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)
    const ok = (res: { status: number; body: any }, what: string): any => {
      if (res.status >= 300) throw new Error(`픽스처 ${what} ${res.status} ${JSON.stringify(res.body)}`)
      return res.body
    }
    const project = ok(await call('POST', '/projects', { name: '토큰 번들', slug: `tkb-${Date.now().toString(36)}` }), '프로젝트')
    const menu = ok(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '회원' }), '메뉴')
    const page = async (title: string, document: unknown): Promise<string> => {
      const id = ok(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title }), title).id as string
      ok(await call('PUT', `/projects/${project.id}/pages/${id}/schema`, { schema: document }), `문서 ${title}`)
      return id
    }
    const doc = (children: unknown[], extra: Record<string, unknown> = {}) => ({
      version: 5,
      ...extra,
      root: { id: 'n_root', type: 'Page', children },
    })
    const list = await page('목록', doc([{ id: 'n_a', type: 'Text', props: { content: '목록 글' } }]))
    const detail = await page(
      '상세',
      doc(
        [
          ...Array.from({ length: FILLER }, (_, i) => ({ id: `n_f${i}`, type: 'Text', props: { content: `상세 줄 ${i}` } })),
          { id: 'n_bare', type: 'Button', props: { label: '맨 아래 저장' } },
        ],
        { viewStates: [{ id: 's_admin', name: '관리자' }] },
      ),
    )
    const evil = await page(`${RLO}뒤집`, doc([{ id: 'n_e', type: 'Text', props: { content: 'e' } }]))
    const post = async (pageId: string, nodeId: string, body: string) =>
      ok(await call('POST', `/projects/${project.id}/pages/${pageId}/comments`, { nodeId, body }), `코멘트 ${nodeId}`)
    await post(list, 'n_a', `방향 [x](wb:page/${evil}) 끝 글`)
    await post(list, 'n_a', `저기 [x](wb:comment/${detail}/n_f${FILLER - 1}) 보세요`)
    for (let i = 0; i < FILLER; i++) await post(detail, `n_f${i}`, `채움 ${i}`)
    await post(detail, 'n_f0', `같은 장 [x](wb:comment/${detail}/n_f${FILLER - 1}) 보세요`)

    bundle = await exportBundle(stack, alice, project.id)
    const file = (title: string): string => {
      const found = Object.entries(bundle.pages).filter(([name]) => decodeURIComponent(name).endsWith(title))
      if (found.length !== 1) throw new Error(`번들 장 ${title}: ${Object.keys(bundle.pages).join(', ')}`)
      return found[0]![1]
    }
    listFile = file('목록')
    detailFile = file('상세')
  })

  afterAll(async () => {
    bundle?.dispose()
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  async function open(file: string, hash = ''): Promise<{ context: BrowserContext; page: Page }> {
    const context = await stack.browser.newContext({ viewport: { width: 1280, height: 600 } })
    const page = await context.newPage()
    await page.goto(pathToFileURL(file).href + hash)
    await page.waitForSelector('html[data-wb-ready]', { state: 'attached', timeout: 15_000 })
    return { context, page }
  }

  /** 그 요소가 창 안에 보이는가 — 상자가 있고, 가운데 점의 맨 위 요소가 그 요소 안이다. */
  const shown = (page: Page, selector: string) =>
    page.evaluate((sel) => {
      const el = document.querySelector(sel)
      if (el === null) return { exists: false, visible: false }
      const r = el.getBoundingClientRect()
      const hit = r.width > 0 && r.height > 0 ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null
      return { exists: true, visible: hit !== null && (el === hit || el.contains(hit)) }
    }, selector)

  const checkedTab = (page: Page) => page.$eval('input.wb-export-tab-radio:checked', (input) => input.id)

  it('M1 — 페이지 제목의 방향 제어 글자가 토큰 뒤의 글을 뒤집지 않는다', async () => {
    const { context, page } = await open(listFile)
    try {
      await page.click('label.wb-export-tab-comments')
      const order = await page.evaluate(() => {
        const body = [...document.querySelectorAll('.wb-export-entry-body')].find((el) => el.textContent!.startsWith('방향'))!
        const last = body.lastChild as Text
        const at = last.textContent!.indexOf('끝 글')
        const x = (i: number): number => {
          const range = document.createRange()
          range.setStart(last, i)
          range.setEnd(last, i + 1)
          return range.getBoundingClientRect().left
        }
        return { links: body.querySelectorAll('a').length, at, end: x(at), geul: x(at + 2) }
      })
      // 판 카나리아 — 토큰이 링크로 풀렸다.
      expect(order.links).toBe(1)
      expect(order.at).toBeGreaterThanOrEqual(0)
      expect(order.end).toBeLessThan(order.geul)
    } finally {
      await context.close()
    }
  })

  it('M2 — 다른 장의 번호 토큰을 누르면 그 장이 «코멘트» 탭으로 서고 그 줄이 창 안에 보인다', async () => {
    const { context, page } = await open(listFile)
    try {
      await page.click('label.wb-export-tab-comments')
      const link = page.locator('.wb-export-entry-body a', { hasText: `상세 #${FILLER}` })
      await link.click()
      await page.waitForURL((url) => url.hash === `#wb-marker-n_f${FILLER - 1}`)
      await page.waitForSelector('html[data-wb-ready]', { state: 'attached', timeout: 15_000 })
      // 판 카나리아 — 그 장의 그 줄이다.
      expect(decodeURIComponent(new URL(page.url()).pathname)).toContain('상세')
      expect(await checkedTab(page)).toBe('wb-export-tab-comments')
      expect(await shown(page, `#wb-marker-n_f${FILLER - 1}`)).toEqual({ exists: true, visible: true })
    } finally {
      await context.close()
    }
  })

  it('L1 — 같은 장의 번호 토큰을 누르면 고른 화면 상태가 그대로이고 그 줄이 보인다', async () => {
    const { context, page } = await open(detailFile)
    try {
      await page.selectOption('#wb-export-state', 's_admin')
      // 판 카나리아 — 상태가 섰다(해시가 따라왔다).
      expect(new URL(page.url()).hash).toBe('#state=s_admin')
      await page.click('label.wb-export-tab-comments')
      await page.locator('.wb-export-entry-body a', { hasText: `#${FILLER}` }).click()
      await page.waitForURL((url) => url.hash === `#wb-marker-n_f${FILLER - 1}`)
      await page.waitForTimeout(200)
      expect(await page.$eval('#wb-export-state', (select) => (select as HTMLSelectElement).value)).toBe('s_admin')
      expect(await shown(page, `#wb-marker-n_f${FILLER - 1}`)).toEqual({ exists: true, visible: true })
    } finally {
      await context.close()
    }
  })

  it('L4 — 번호 걷힌 노드의 닻으로 연 장은 목업의 그 노드로 간다', async () => {
    const { context, page } = await open(detailFile, '#wb-marker-n_bare')
    try {
      // 판 카나리아 — 그 노드에는 코멘트 줄(닻)이 없다 · 처음 자리(맨 위)에서는 창 밖이다.
      expect(await page.$('#wb-marker-n_bare')).toBeNull()
      expect(await shown(page, '.wb-export-canvas [data-wb-id="n_bare"]')).toEqual({ exists: true, visible: true })
      await page.evaluate(() => {
        window.scrollTo(0, 0)
        for (const el of document.querySelectorAll('*')) if (el.scrollTop > 0) el.scrollTop = 0
      })
      expect(await shown(page, '.wb-export-canvas [data-wb-id="n_bare"]')).toEqual({ exists: true, visible: false })
    } finally {
      await context.close()
    }
  })
})
