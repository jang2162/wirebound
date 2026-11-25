/**
 * **번들 장의 레이아웃 틀을 실브라우저로 잰다** — 서브페이지 장의 GNB · LNB 링크가 그 장 파일을 열고(번들 안 상대 경로 · `file://`), 메뉴의 링크는
 * 그 아래 첫 화면 페이지이며, 사람이 편집 캔버스에서 꺼 둔 영역(`PUT …/view-prefs`)이 있어도 번들은 다 켠다(설계
 * `docs/superpowers/specs/2026-11-25-page-layout-design.md` 「HTML 번들」 · 「정해진 것」 3). 틀 링크로 연 장에서 지금 페이지의 링크(`aria-current`)가
 * 0 아닌 상자로 창 안에 서는지, 방향 제어 글자를 든 메뉴 이름이 다음 항목을 뒤집지 않는지(`isolateBidi`)도 본다.
 *
 * 테마는 레이아웃 뷰를 낸 작은 픽스처(`layoutlx@1.0.0` — kit `buildTheme` 로 이 파일에서 짓는다)다 — 기본테마 2.1.0 은 레이아웃 뷰가 없다. 번들은
 * 저장소 빌드의 산출물(api 가 `packages/*\/dist` 를 읽는다)로 그린다 — `pnpm build` 가 먼저다. jsdom 판(내비 한 벌 · 링크 값)은
 * `packages/exporter/test/bundle-layout.test.tsx`, 표시 옵션이 zip 에 안 드는 것은 `apps/api/test/export-layout.test.ts` 가 잰다.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { isolateBidi } from '@wirebound/schema'
import { buildTheme } from '@wirebound/theme-kit'
import type { Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { exportBundle, openBundlePage, type UnpackedBundle } from './layout-bundle'
import { makeAdmin, putTheme, uploadRaw } from './theme-fixtures'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const SAMPLE_ROOT = fileURLToPath(new URL('../../../packages/theme-kit/test/fixtures/sample-theme/', import.meta.url))

/** 방향 제어 글자(U+202E)를 든 뿌리 메뉴 이름 — GNB 에서 그 뒤 항목(«설정»)의 글자 차례를 뒤집지 않아야 한다. */
const BIDI_MENU = '회원\u202E관리'

/** 서브페이지 레이아웃 뷰를 낸 테마 — GNB 항목을 ` | ` 로 한 줄에 잇고(이름이 이어 붙는 자리), LNB 를 왼쪽 칸에 둔다. */
async function layoutTheme(): Promise<Uint8Array> {
  const dir = mkdtempSync(join(tmpdir(), 'wb-layout-theme-'))
  try {
    cpSync(SAMPLE_ROOT, dir, { recursive: true })
    writeFileSync(
      join(dir, 'theme.config.ts'),
      `import { defineManifest } from '@wirebound/theme-sdk'
export default defineManifest({
  id: 'layoutlx', name: '레이아웃 픽스처', version: '1.0.0', sdk: '^1.10.0', tokens: { items: {} },
  layouts: { subpage: { regions: [{ id: 'gnb', label: 'GNB' }, { id: 'lnb', label: 'LNB' }] } },
})
`,
    )
    writeFileSync(
      join(dir, 'src/index.tsx'),
      `import { defineTheme, LayoutLink, LayoutRegion, type LayoutViewProps } from '@wirebound/theme-sdk'
import manifest from '../theme.config'
const Subpage = (props: LayoutViewProps) => (
  <div data-probe="frame">
    <LayoutRegion id="gnb" as="nav" data-probe="gnb">
      {props.gnb.map((item, index) => <span key={item.id}>{index > 0 ? ' | ' : ''}<LayoutLink item={item} data-probe="gnb-link" /></span>)}
    </LayoutRegion>
    <div style={{ display: 'flex' }}>
      <LayoutRegion id="lnb" as="aside" data-probe="lnb" style={{ width: '240px', flex: 'none' }}>
        {(props.lnb?.children ?? []).map((item) => <div key={item.id}><LayoutLink item={item} data-probe="lnb-link" /></div>)}
      </LayoutRegion>
      <main style={{ minWidth: 0 }}>{props.children}</main>
    </div>
  </div>
)
export default defineTheme({ manifest, views: {}, layouts: { subpage: Subpage } })
`,
    )
    const built = await buildTheme({ root: dir, entry: 'src/index.tsx', outDir: join(dir, 'out') })
    return new Uint8Array(readFileSync(built.file))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

type Call = (method: string, path: string, body?: unknown) => Promise<{ status: number; body: any }>

function ok(response: { status: number; body: any }, what: string): any {
  if (response.status >= 300) throw new Error(`픽스처 ${what} ${response.status} ${JSON.stringify(response.body)}`)
  return response.body
}

/**
 * 뿌리 메뉴 «회원관리»(이름에 U+202E)(팝업 «회원 검색»이 먼저 · 화면 «회원 목록» · 하위 메뉴 «하위»(화면 «회원 상세»)) · 뿌리 메뉴 «설정»(화면 «환경»). 화면은
 * 서브페이지 레이아웃이다. 그 사람은 LNB · GNB 를 꺼 둔다.
 */
async function fixture(stack: EditorStack, owner: Session): Promise<string> {
  const call: Call = (method, path, body) => stack.request(owner, method, path, body)
  const project = ok(
    await call('POST', '/projects', { name: '틀', slug: `lx-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` }),
    '프로젝트',
  )
  await putTheme(call, project.id, { themeId: 'layoutlx', version: '1.0.0', tokens: {} })
  const member = ok(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: BIDI_MENU }), '메뉴')
  const settings = ok(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '설정' }), '메뉴')
  const sub = ok(await call('POST', `/projects/${project.id}/menu`, { parentId: member.id, title: '하위' }), '하위 메뉴')
  const page = async (menuNodeId: string, title: string, layout: 'subpage' | 'popup') => {
    const created = ok(await call('POST', `/projects/${project.id}/pages`, { menuNodeId, title, layout }), title)
    if (layout === 'subpage') {
      ok(
        await call('PATCH', `/projects/${project.id}/pages/${created.id}/ops`, {
          baseSeq: 0,
          ops: [
            {
              op: 'add',
              path: '/root/children/0',
              value: { id: `n_t_${created.id.slice(-6)}`, type: 'Text', props: { content: `${title} 본문` } },
            },
          ],
        }),
        `ops ${title}`,
      )
    }
  }
  await page(member.id, '회원 검색', 'popup')
  await page(member.id, '회원 목록', 'subpage')
  await page(sub.id, '회원 상세', 'subpage')
  await page(settings.id, '환경', 'subpage')
  ok(await call('PUT', `/projects/${project.id}/view-prefs`, { hiddenRegions: ['subpage.lnb', 'subpage.gnb'] }), '보기 설정')
  return project.id
}

/** 번들 안 장 파일 — 이름 끝으로 찾는다(메뉴 이름의 방향 제어 글자를 파일 이름이 어떻게 접는지에 안 기댄다). */
function fileOf(bundle: UnpackedBundle, tail: string): string {
  const found = Object.entries(bundle.pages).filter(([name]) => name.endsWith(tail))
  if (found.length !== 1) throw new Error(`장 파일 ${tail}: ${found.length} 개`)
  return found[0]![1]
}

/** 틀의 링크들 — 글 · `href` 의 파일 이름(디코드) · 지금 페이지 표지. */
async function links(page: Page, probe: string): Promise<[text: string, file: string | null, current: boolean][]> {
  return page.evaluate(
    (probe) =>
      [...document.querySelectorAll(`[data-probe="${probe}"]`)].map((element) => {
        const href = element.getAttribute('href')
        return [
          element.textContent ?? '',
          href === null ? null : decodeURIComponent(href.split('/').pop()!),
          element.getAttribute('aria-current') === 'page',
        ] as [string, string | null, boolean]
      }),
    probe,
  )
}

/** 지금 장 파일 이름(디코드). */
function fileName(page: Page): string {
  return decodeURIComponent(new URL(page.url()).pathname.split('/').pop()!)
}

describe.skipIf(!전제.ok)('번들 장의 레이아웃 틀 — 실브라우저', () => {
  let stack: EditorStack
  let bundle: UnpackedBundle

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    await makeAdmin(stack, stack.users.alice)
    const alice = await stack.login(stack.users.alice)
    expect(await uploadRaw(stack, alice, await layoutTheme())).toBe(201)
    const projectId = await fixture(stack, alice)
    bundle = await exportBundle(stack, alice, projectId)
  }, 180_000)

  afterAll(async () => {
    bundle?.dispose()
    if (stack === undefined) return
    const { after } = await stack.close()
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  async function open(tail: string, run: (page: Page) => Promise<void>): Promise<void> {
    const { context, page } = await openBundlePage(stack, fileOf(bundle, tail), { viewport: { width: 1280, height: 800 } })
    try {
      // 판 카나리아 — 테마가 섰다(번들 런타임이 테마를 못 쓰면 기본 뷰라 틀이 내용만이다).
      expect(await page.evaluate(() => document.documentElement.getAttribute('data-wb-failed'))).toBeNull()
      expect(await page.locator('[data-probe="frame"]').count()).toBe(1)
      await run(page)
    } finally {
      await context.close()
    }
  }

  it('사람이 꺼 둔 영역이 있어도 번들은 GNB · LNB 를 다 켠다', async () => {
    await open('회원-상세', async (page) => {
      const regions = await page.evaluate(() =>
        [...document.querySelectorAll('[data-wb-layout-region]')].map((element) => element.getAttribute('data-wb-layout-region')),
      )
      expect(regions).toEqual(['gnb', 'lnb'])
    })
  })

  it('LNB — 팝업은 안 서고 하위 메뉴는 그 첫 화면 · 링크를 누르면 그 장 파일이 열리고 그 장의 지금 링크가 창 안에 선다', async () => {
    await open('회원-상세', async (page) => {
      const before = await links(page, 'lnb-link')
      expect(before.map(([text, , current]) => [text, current])).toEqual([
        ['회원 목록', false],
        ['하위', false],
      ])
      const listFile = before[0]![1]!
      expect(listFile.endsWith('회원-목록.html')).toBe(true)
      expect(before[1]![1]!.endsWith('회원-상세.html')).toBe(true)

      await page.locator('[data-probe="lnb-link"]', { hasText: '회원 목록' }).click()
      await page.waitForURL((url) => decodeURIComponent(url.pathname).endsWith(listFile))
      await page.waitForSelector('html[data-wb-ready]', { state: 'attached', timeout: 15_000 })
      expect(fileName(page)).toBe(listFile)
      const current = await page.evaluate(() => {
        const element = document.querySelector('[data-probe="lnb-link"][aria-current="page"]')
        if (element === null) return null
        const box = element.getBoundingClientRect()
        return {
          text: element.textContent,
          width: box.width,
          height: box.height,
          inView: box.top >= 0 && box.bottom <= innerHeight && box.left >= 0 && box.right <= innerWidth,
        }
      })
      expect(current?.text).toBe('회원 목록')
      expect(current!.width * current!.height).toBeGreaterThan(0)
      expect(current!.inView).toBe(true)
    })
  })

  it('GNB — 뿌리 메뉴의 링크는 그 아래 첫 화면 페이지 장이다(앞선 팝업을 건너뛴다) · 누르면 그 장이 열린다', async () => {
    await open('회원-상세', async (page) => {
      const gnb = await links(page, 'gnb-link')
      expect(gnb.map(([text, , current]) => [text, current])).toEqual([
        [isolateBidi(BIDI_MENU), false],
        ['설정', false],
      ])
      expect(gnb[0]![1]!.endsWith('회원-목록.html')).toBe(true)
      expect(gnb[1]![1]!.endsWith('환경.html')).toBe(true)
      await page.locator('[data-probe="gnb-link"]', { hasText: '설정' }).click()
      await page.waitForURL((url) => decodeURIComponent(url.pathname).endsWith(gnb[1]![1]!))
      await page.waitForSelector('html[data-wb-ready]', { state: 'attached', timeout: 15_000 })
      expect(await links(page, 'lnb-link')).toEqual([['환경', gnb[1]![1]!, true]])
    })
  })

  it('방향 제어 글자를 든 메뉴 이름이 다음 항목(«설정»)의 글자 차례를 뒤집지 않는다', async () => {
    await open('회원-상세', async (page) => {
      const xs = await page.evaluate(() => {
        const link = [...document.querySelectorAll('[data-probe="gnb-link"]')].find((element) => element.textContent === '설정')!
        const text = link.firstChild!
        const range = document.createRange()
        const at = (index: number): number => {
          range.setStart(text, index)
          range.setEnd(text, index + 1)
          return range.getBoundingClientRect().left
        }
        return [at(0), at(1)]
      })
      // «설» 이 «정» 보다 왼쪽 — 짝 없는 U+202E 가 메뉴 이름 밖으로 새면 이 줄의 끝까지 뒤집혀 차례가 바뀐다.
      expect(xs[0]!).toBeLessThan(xs[1]!)
    })
  })
})
