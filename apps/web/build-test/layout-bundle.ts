/**
 * 배치 실브라우저 판(`layout-weight.test.ts` · `searchform-columns.test.ts`)이 함께 쓰는 픽스처 — 한 판(`editor-stack.ts`) 위에 프로젝트 ·
 * 페이지를 세우고, 내보낸 HTML 번들을 풀어 페이지 파일을 연다.
 *
 * 번들에서 재는 까닭은 `theme-prop-marks.test.ts` 머리말과 같다 — 캔버스와 같은 CSS(기본 뷰 → 테마 → 토큰)를 싣고, 에디터 셸 없이 문서만 서서
 * 값이 흔들리지 않는다. 테마는 저장소 빌드가 낸 산출물을 api 가 기동 때 넣은 것이다 — `pnpm build` 가 먼저다.
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { unzipSync } from 'fflate'
import type { BrowserContext, Page } from 'playwright-core'
import type { EditorStack, Session } from './editor-stack'

export type Call = (method: string, path: string, body?: unknown) => Promise<{ status: number; body: any }>

function ok(response: { status: number; body: any }, what: string): any {
  if (response.status >= 300) throw new Error(`픽스처 ${what} ${response.status} ${JSON.stringify(response.body)}`)
  return response.body
}

/** 프로젝트 하나 · 메뉴 하나(`menu`) · 페이지들(제목 → 노드). */
export async function layoutProject(
  stack: EditorStack,
  owner: Session,
  menu: string,
  pages: Record<string, unknown[]>,
): Promise<{ projectId: string; call: Call }> {
  const call: Call = (method, path, body) => stack.request(owner, method, path, body)
  const project = ok(
    await call('POST', '/projects', { name: '배치', slug: `layout-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` }),
    '프로젝트',
  )
  const menuNode = ok(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: menu }), '메뉴')
  for (const [title, nodes] of Object.entries(pages)) {
    const page = ok(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menuNode.id, title }), title)
    ok(
      await call('PATCH', `/projects/${project.id}/pages/${page.id}/ops`, {
        baseSeq: 0,
        ops: nodes.map((value, i) => ({ op: 'add', path: `/root/children/${i}`, value })),
      }),
      `ops ${title}`,
    )
  }
  return { projectId: project.id, call }
}

/** 내보낸 번들을 풀어 둔 자리와 페이지 파일(«메뉴-제목» → 경로). `dispose` 가 지운다. */
export interface UnpackedBundle {
  dir: string
  pages: Record<string, string>
  dispose(): void
}

export async function exportBundle(stack: EditorStack, owner: Session, projectId: string): Promise<UnpackedBundle> {
  const response = await fetch(`${stack.apiUrl}/api/projects/${projectId}/export?format=html`, { headers: { cookie: owner.cookie } })
  if (response.status !== 200) throw new Error(`내보내기 ${response.status}`)
  const entries = unzipSync(new Uint8Array(await response.arrayBuffer()))
  const dir = mkdtempSync(join(tmpdir(), 'wb-layout-bundle-'))
  const pages: Record<string, string> = {}
  for (const [path, bytes] of Object.entries(entries)) {
    if (path.endsWith('/')) continue
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), bytes)
    const page = /\/pages\/([^/]+)\.html$/.exec(path)
    if (page !== null) pages[page[1]!] = join(dir, path)
  }
  return { dir, pages, dispose: () => rmSync(dir, { recursive: true, force: true }) }
}

/**
 * 번들의 기본 뷰 CSS(`assets/views.css`)에서 `needle` 을 품은 규칙을 걷어 다시 쓴다 — 그 규칙이 없는 판을 같은 번들로 세운다. 걷은 규칙 수를
 * 돌려준다(0 이면 아무것도 안 걷은 것이다). `views.css` 는 SDK `css-tools` 의 `rule()` 이 지은 꼴(`셀렉터 {\n  선언\n}`)이라 블록으로 가를 수 있다.
 */
export function stripViewsCssRules(bundle: UnpackedBundle, needle: string): number {
  const found = (readdirSync(bundle.dir, { recursive: true }) as string[]).filter((path) => path.endsWith('assets/views.css'))
  if (found.length !== 1) throw new Error(`번들의 views.css 가 하나가 아니다: ${found.join(', ')}`)
  const file = join(bundle.dir, found[0]!)
  const blocks = readFileSync(file, 'utf8').split(/(?<=\n\})\n/)
  const kept = blocks.filter((block) => !block.includes(needle))
  writeFileSync(file, kept.join('\n'))
  return blocks.length - kept.length
}

/**
 * 번들 페이지를 연다. `docWidth` 를 주면 문서 뿌리의 폭이 그 값이 되게 창 폭을 맞춘다(뷰어는 좌 · 우 칸을 갖는다 — `theme-prop-marks.test.ts`).
 * 안 주면 `viewport` 그대로다.
 */
export async function openBundlePage(
  stack: EditorStack,
  file: string,
  options: { viewport: { width: number; height: number }; docWidth?: number },
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await stack.browser.newContext({ viewport: options.viewport })
  const page = await context.newPage()
  await page.goto(pathToFileURL(file).href)
  await page.waitForSelector('html[data-wb-ready]', { state: 'attached', timeout: 15_000 })
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  const want = options.docWidth
  if (want !== undefined) {
    for (let i = 0; i < 3; i++) {
      const now = await page.evaluate(() => document.querySelector('.wb-export-canvas [data-wb-id]')!.getBoundingClientRect().width)
      if (Math.abs(now - want) < 0.5) break
      await page.setViewportSize({ width: Math.round(page.viewportSize()!.width + (want - now)), height: options.viewport.height })
      await page.waitForTimeout(200)
    }
  }
  return { context, page }
}
