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
 * 번들의 CSS 파일 하나(`suffix` 로 끝나는 경로 — `assets/views.css` · `assets/theme/theme.css`)에서 `needle` 이 든 규칙(셀렉터든 선언이든)을 걷어 다시 쓴다 —
 * 그 규칙이 없는 판을 같은 번들로 세운다. 걷은 규칙 수를 돌려준다(0 이면 아무것도 안 걷었다).
 *
 * **안쪽 규칙(`셀렉터 { 선언 }` — 본문에 중괄호가 없는 것)만 본다** — `@media` 안의 규칙도 그 꼴이라 함께 걷히고, 비게 된 `@media {}` 는 남아도 아무
 * 일도 안 한다. 줄인 CSS(테마 빌드 산출물)와 펼친 CSS(`css-tools` 의 `rule()`)를 같은 식으로 읽는다. **틀리면 덜 걷는 쪽은 거짓 초록이다** — 부르는
 * 쪽이 걷은 뒤 그 파일에 `needle` 이 안 남았는지를 함께 본다(`cssMentions`).
 */
export function stripCssRules(bundle: UnpackedBundle, suffix: string, needle: string): number {
  const file = bundleFile(bundle, suffix)
  let removed = 0
  const next = readFileSync(file, 'utf8').replace(/[^{};]*\{[^{}]*\}/g, (rule) => {
    if (!rule.includes(needle)) return rule
    removed += 1
    return ''
  })
  writeFileSync(file, next)
  return removed
}

/** 번들의 CSS 파일에 `needle` 이 몇 번 나오나 — 걷은 뒤의 카나리아. */
export function cssMentions(bundle: UnpackedBundle, suffix: string, needle: string): number {
  return readFileSync(bundleFile(bundle, suffix), 'utf8').split(needle).length - 1
}

function bundleFile(bundle: UnpackedBundle, suffix: string): string {
  const found = (readdirSync(bundle.dir, { recursive: true }) as string[]).filter((path) => path.endsWith(suffix))
  if (found.length !== 1) throw new Error(`번들에 ${suffix} 가 하나가 아니다: ${found.join(', ')}`)
  return join(bundle.dir, found[0]!)
}

/**
 * 번들 페이지를 연다. `screen` 이면 화면 모드(아래)로 연다. `docWidth` 를 주면 문서 뿌리의 폭이 그 값이 되게 창 폭을 맞춘다(뷰어는 좌 · 우 칸을 갖는다 — `theme-prop-marks.test.ts`).
 * 안 주면 `viewport` 그대로다.
 */
export async function openBundlePage(
  stack: EditorStack,
  file: string,
  options: { viewport: { width: number; height: number }; docWidth?: number; screen?: boolean },
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await stack.browser.newContext({ viewport: options.viewport })
  const page = await context.newPage()
  // `#wb-screen` — 셸을 숨기고 문서 폭이 창 폭 그대로인 판(`packages/exporter/src/bundle/shell-css.ts` 「화면 모드」). 번들의 문서는 iframe 이 아니라
  // 테마의 좁은 창 media 가 **창** 폭을 본다 — 셸이 서면 창 390 에서 문서 칸이 0 으로 눌린다.
  await page.goto(pathToFileURL(file).href + (options.screen === true ? '#wb-screen' : ''))
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
