/**
 * **내보낸 HTML 번들을 `file://` 로 연다** — 실브라우저 판(`packages/exporter/src/browser/` · `apps/api/src/services/export-source.ts`).
 *
 * jsdom 판(`packages/exporter/test/runtime-bundle.test.ts` · `bundle-theme.test.tsx`)은 테마 스크립트를 흉내 내 싣고 시트의 겹침 ·
 * 글꼴 · 좌표를 계산하지 않는다. 여기서 재는 것: 에디터 판(api · DB)에서 프로젝트 테마를 고정하고 내려받은 zip 을 풀어 **파일로 연**
 * 페이지가 그 테마로 서는가 — 테마 뷰 · 토큰 시트가 이긴 계산값 · 패키지 글꼴의 적재 · 한글 이름 페이지로의 이동 · 끊긴 대상의 상태 줄 ·
 * 마커 자리(렌더러의 `markerPoint` 규칙) · 등록하지 않는 번들의 기본 뷰와 까닭.
 *
 * 테마는 둘을 올린다. `sample@1.0.0` 은 kit 이 지은 것(`theme-fixtures.ts` 의 `sampleTheme`)에 글꼴 자산 하나와 그것을 쓰는 규칙을 더해
 * 다시 싼 것이다(패키지에 글꼴을 싣는 판 — kit 픽스처에는 글꼴이 없다). 마커 · 실패 판은 코드를 글자로 적은 작은 테마다(`handTheme`).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { ThemeManifest } from '@wirebound/theme-sdk'
import { packWbtheme, readWbtheme } from '@wirebound/themes'
import { unzipSync } from 'fflate'
import type { BrowserContext, Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { makeAdmin, putTheme, sampleTheme, uploadRaw } from './theme-fixtures'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

/**
 * 패키지에 실을 글꼴 — 이 기계에 있는 TrueType 하나. 저장소에 글꼴 파일을 두지 않는다(라이선스 · 크기). 없으면 던진다 — 건너뛰면 글꼴
 * 판이 조용히 빠진다.
 */
function machineFont(): Uint8Array {
  const candidates = [
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
    '/usr/share/fonts/dejavu/DejaVuSans.ttf',
  ]
  const found = candidates.find((path) => existsSync(path))
  if (found === undefined) throw new Error(`패키지에 실을 글꼴이 이 기계에 없다 — ${candidates.join(' · ')}`)
  return new Uint8Array(readFileSync(found))
}

/** 패키지 글꼴의 가족 이름 — 샘플 테마의 CSS 에 더한 `@font-face` 의 것. */
const FONT_FAMILY = 'WbExportProbe'

/**
 * kit 이 지은 샘플 테마에 글꼴 자산과 그것을 쓰는 규칙을 더해 다시 싼다. 판(`sample@1.0.0`)은 그대로다 — 번들이 등록하는 판과 같아야 한다.
 *
 * **`:root` 에 주색의 기본값을 적는다** — 시스템 테마(`system-themes/admin/src/theme.css`)처럼. 그래야 시트 차례(`theme.css` → `tokens.css`)가
 * 실제로 겨룬다: 토큰 시트가 뒤라야 저장한 값이 이 기본값을 이긴다. 안 적으면 변수를 적는 시트가 토큰 시트뿐이라 차례를 바꿔도 같다.
 */
async function fontedSample(): Promise<Uint8Array> {
  const files = readWbtheme(await sampleTheme()).files
  if (files === null) throw new Error('샘플 테마를 못 읽었다')
  const themeCss = `:root{--wb-color-primary:#e11d48}\n${files.themeCss ?? ''}@font-face{font-family:${FONT_FAMILY};src:url(./assets/probe.ttf)}\n[data-wb-component="Text"]{font-family:${FONT_FAMILY},sans-serif}\n`
  return packWbtheme({
    manifest: files.manifest,
    themeJs: files.themeJs,
    themeCss,
    assets: new Map([...files.assets, ['assets/probe.ttf', machineFont()]]),
  })
}

function manifestOf(id: string): ThemeManifest {
  return { id, name: `${id} 테마`, version: '1.0.0', sdk: '^1.0.0', tokens: { items: {} } } as ThemeManifest
}

/**
 * 코드를 글자로 적은 테마 — `theme.js` 가 공유 런타임(`__wirebound_runtime__`)의 SDK · React 로 등록한다(kit 이 짓는 번들과 같은 길).
 * `body` 는 `rt`(공유 런타임) · `h`(createElement) · `manifest` 를 쓰는 글자다.
 */
function handTheme(id: string, body: string, themeCss: string | null = null): Uint8Array {
  const manifest = manifestOf(id)
  const themeJs = `(() => { const rt = globalThis.__wirebound_runtime__; const h = rt.react.createElement; const manifest = ${JSON.stringify(manifest)}; ${body} })()`
  return packWbtheme({ manifest, themeJs, themeCss })
}

/** `marked@1.0.0` — 카드의 마커를 초점 요소의 오른쪽 아래에 어긋나게 둔다(`Root` 의 `marker` · `Focus`). */
const MARKED = handTheme(
  'marked',
  `const { Root, Focus, view, defineTheme } = rt.sdk
  const Card = view(({ props }) => h(Root, { as: 'section', className: 'marked-card', marker: { placement: 'bottom-end', offset: [7, -5] } },
    h('p', null, '머리'),
    h(Focus, null, h('div', { className: 'marked-focus' }, String(props.title ?? '')))))
  rt.register(defineTheme({ manifest, views: { Card } }))`,
  '.marked-card{padding:40px 60px}.marked-focus{width:120px;height:30px;margin-left:25px}',
)

/** `silent@1.0.0` — 번들이 적재되며 던져 등록하지 않는다. 시트는 싣는다 — 런타임이 그 시트를 걷는지 본다. */
const SILENT = handTheme('silent', `throw new Error('번들이 던진다')`, '.silent-probe{color:red}')

/**
 * `swapped@1.0.0` — 번들이 **다른 판**(`9.9.9`)을 등록한다. 번들 런타임이 서버 manifest 와 견줘(`adoptManifest`) 거절해야 한다 — 안
 * 견주면 등록한 뷰로 그대로 그린다.
 */
const SWAPPED = handTheme(
  'swapped',
  `const { Root, view, defineTheme } = rt.sdk
  const Card = view(({ props }) => h(Root, { as: 'section' }, '바꿔 친 카드'))
  rt.register(defineTheme({ manifest: { ...manifest, version: '9.9.9' }, views: { Card } }))`,
  '.swapped-probe{color:red}',
)

type Call = (method: string, path: string, body?: unknown) => Promise<{ status: number; body: any }>

/**
 * 프로젝트 하나 · 메뉴 «관리자» · 페이지 둘(«회원 목록» · «회원 상세»). 첫 페이지: 글 · 카드(코멘트 하나) · 상세로 가는 단추 · 없는
 * 페이지로 가는 단추.
 */
async function exportProject(stack: EditorStack, owner: Session): Promise<{ id: string; call: Call }> {
  const call: Call = (method, path, body) => stack.request(owner, method, path, body)
  const ok = (response: { status: number; body: any }, what: string): any => {
    if (response.status >= 300) throw new Error(`픽스처 ${what} ${response.status} ${JSON.stringify(response.body)}`)
    return response.body
  }
  const project = ok(
    await call('POST', '/projects', {
      name: '내보내기 판',
      slug: `export-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    }),
    '프로젝트',
  )
  const menu = ok(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '관리자' }), '메뉴')
  const list = ok(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '회원 목록' }), '목록')
  const detail = ok(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '회원 상세' }), '상세')
  const click = (target: string) => [{ on: 'click', actions: [{ type: 'navigate', target }] }]
  ok(
    await call('PATCH', `/projects/${project.id}/pages/${list.id}/ops`, {
      baseSeq: 0,
      ops: [
        { op: 'add', path: '/root/children/0', value: { id: 'n_text000001', type: 'Text', props: { content: '목록 글' } } },
        { op: 'add', path: '/root/children/1', value: { id: 'n_card000001', type: 'Card', props: { title: '카드' } } },
        {
          op: 'add',
          path: '/root/children/2',
          value: { id: 'n_go00000001', type: 'Button', props: { label: '상세로' }, interactions: click('page:관리자/회원 상세') },
        },
        {
          op: 'add',
          path: '/root/children/3',
          value: { id: 'n_gone000001', type: 'Button', props: { label: '없는 곳' }, interactions: click('page:관리자/없는 페이지') },
        },
      ],
    }),
    'ops 목록',
  )
  ok(
    await call('PATCH', `/projects/${project.id}/pages/${detail.id}/ops`, {
      baseSeq: 0,
      ops: [{ op: 'add', path: '/root/children/0', value: { id: 'n_text000002', type: 'Text', props: { content: '상세 글' } } }],
    }),
    'ops 상세',
  )
  ok(await call('POST', `/projects/${project.id}/pages/${list.id}/comments`, { nodeId: 'n_card000001', body: '카드 코멘트' }), '코멘트')
  return { id: project.id, call }
}

/** 푼 디렉터리 — 끝에 지운다. */
const unpacked: string[] = []

/** 내보내기 zip 을 받아 새 디렉터리에 푼다. 번들의 뿌리(`index.html` 이 있는 자리 — zip 은 번들을 한 디렉터리에 담는다)를 낸다. */
async function downloadBundle(stack: EditorStack, session: Session, projectId: string): Promise<string> {
  const response = await fetch(`${stack.apiUrl}/api/projects/${projectId}/export?format=html`, { headers: { cookie: session.cookie } })
  if (response.status !== 200) throw new Error(`내보내기 ${response.status} ${await response.text()}`)
  const entries = unzipSync(new Uint8Array(await response.arrayBuffer()))
  const dir = mkdtempSync(join(tmpdir(), 'wb-export-bundle-'))
  unpacked.push(dir)
  for (const [path, bytes] of Object.entries(entries)) {
    if (path.endsWith('/')) continue
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), bytes)
  }
  const index = Object.keys(entries)
    .filter((path) => path === 'index.html' || path.endsWith('/index.html'))
    .sort((a, b) => a.length - b.length)[0]
  if (index === undefined) throw new Error(`zip 에 index.html 이 없다: ${Object.keys(entries).join(' · ')}`)
  return join(dir, dirname(index))
}

/**
 * 화면 상태가 있는 페이지 하나(«회원 목록» — 상태 «관리자» > «운영» · «비로그인»). «보기»는 관리자에서 숨고(`except`), «승인»은 관리자에서만
 * 보인다(`only` — 제목을 숨기는 상호작용 · 코멘트). «운영»은 관리자의 하위 상태라 관리자의 보임을 물려받는다. 목록에서 «운영»이 끝에 있어도 고르개는
 * 트리 차례다.
 */
async function exportStateProject(stack: EditorStack, owner: Session): Promise<string> {
  const call: Call = (method, path, body) => stack.request(owner, method, path, body)
  const ok = (response: { status: number; body: any }, what: string): any => {
    if (response.status >= 300) throw new Error(`픽스처 ${what} ${response.status} ${JSON.stringify(response.body)}`)
    return response.body
  }
  const project = ok(
    await call('POST', '/projects', {
      name: '상태 판',
      slug: `states-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    }),
    '프로젝트',
  )
  const menu = ok(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '관리자' }), '메뉴')
  const page = ok(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: '회원 목록' }), '페이지')
  ok(
    await call('PATCH', `/projects/${project.id}/pages/${page.id}/ops`, {
      baseSeq: 0,
      ops: [
        {
          op: 'add',
          path: '/viewStates',
          value: [
            { id: 's_admin00001', name: '관리자' },
            { id: 's_guest00001', name: '비로그인' },
            { id: 's_ops0000001', name: '운영', parent: 's_admin00001' },
          ],
        },
        { op: 'add', path: '/root/children/0', value: { id: 'n_title00001', type: 'Text', props: { content: '회원 목록 제목' } } },
        {
          op: 'add',
          path: '/root/children/1',
          value: { id: 'n_view000001', type: 'Button', props: { label: '보기' }, visibility: { mode: 'except', states: ['s_admin00001'] } },
        },
        {
          op: 'add',
          path: '/root/children/2',
          value: {
            id: 'n_apprv00001',
            type: 'Button',
            props: { label: '승인' },
            visibility: { mode: 'only', states: ['s_admin00001'] },
            interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_title00001', value: false }] }],
          },
        },
      ],
    }),
    'ops',
  )
  ok(
    await call('POST', `/projects/${project.id}/pages/${page.id}/comments`, { nodeId: 'n_apprv00001', body: '관리자만 보는 단추' }),
    '코멘트',
  )
  return project.id
}

/** 번들의 첫 페이지를 파일로 연 탭. 콘솔 오류 · 페이지 오류를 모은다. `hash` 를 주면 그 해시로 연다. */
async function openBundle(
  stack: EditorStack,
  dir: string,
  options: { hash?: string; viewport?: { width: number; height: number } } = {},
): Promise<{ context: BrowserContext; page: Page; errors: string[] }> {
  const context = await stack.browser.newContext(options.viewport === undefined ? {} : { viewport: options.viewport })
  const page = await context.newPage()
  const errors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${pathToFileURL(join(dir, 'index.html')).href}${options.hash ?? ''}`)
  await page.waitForSelector('html[data-wb-ready]', { state: 'attached', timeout: 10_000 })
  return { context, page, errors }
}

describe.skipIf(!전제.ok)('내보낸 번들을 파일로 연다', () => {
  let stack: EditorStack

  beforeAll(async () => {
    if (!전제.ok) return
    /**
     * **번들 런타임을 소스에서 다시 짓는다.** 이 판의 api 는 번들에 `@wirebound/exporter` 의 `dist/runtime.js` 를 싣는다
     * (`apps/api/src/services/export-runtime.ts`) — 에디터 판의 다른 파일과 달리 `dist` 를 읽는다. 안 지으면 `src/browser` 를 고친
     * 뒤에도 낡은 런타임을 잰다(api 스위트의 `test/global-setup.ts` 가 같은 까닭으로 짓는다).
     */
    execFileSync('pnpm', ['--filter', '@wirebound/exporter', 'build:runtime'], { stdio: 'ignore' })
    stack = await startEditorStack(전제)
    const alice = await stack.login(stack.users.alice)
    await makeAdmin(stack, stack.users.alice)
    for (const bytes of [await fontedSample(), MARKED, SILENT, SWAPPED]) expect(await uploadRaw(stack, alice, bytes)).toBe(201)
  })

  afterAll(async () => {
    for (const dir of unpacked) rmSync(dir, { recursive: true, force: true })
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  })

  it('샘플 테마의 뷰 · 저장한 토큰 · 패키지 글꼴로 선다 — 콘솔 오류 없이', async () => {
    const alice = await stack.login(stack.users.alice)
    const project = await exportProject(stack, alice)
    await putTheme(project.call, project.id, { themeId: 'sample', version: '1.0.0', tokens: { 'color.primary': '#0a7d33' } })
    const dir = await downloadBundle(stack, alice, project.id)
    const { context, page, errors } = await openBundle(stack, dir)
    try {
      expect(await page.evaluate(() => document.documentElement.getAttribute('data-wb-failed'))).toBeNull()
      expect(await page.locator('.wb-export-canvas', { hasText: '샘플 카드' }).count()).toBe(1)
      // 토큰 시트(`tokens.css`)가 테마의 기본값(`#e11d48`)을 이겼다 — 변수와, 그 변수로 그린 테두리의 계산값.
      expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--wb-color-primary').trim())).toBe(
        '#0a7d33',
      )
      expect(await page.locator('.sample-card').evaluate((el) => getComputedStyle(el).borderTopColor)).toBe('rgb(10, 125, 51)')
      // 패키지 글꼴이 파일에서 실렸다.
      const fonts = await page.evaluate(async () => {
        await document.fonts.ready
        return [...document.fonts].map((face) => `${face.family}:${face.status}`)
      })
      expect(fonts).toContain(`${FONT_FAMILY}:loaded`)
      expect(errors).toEqual([])
    } finally {
      await context.close()
    }
  })

  it('한글 이름 페이지로 가는 단추가 그 파일을 열고, 끊긴 대상은 상태 줄에 말한다', async () => {
    const alice = await stack.login(stack.users.alice)
    const project = await exportProject(stack, alice)
    await putTheme(project.call, project.id, { themeId: 'sample', version: '1.0.0', tokens: {} })
    const dir = await downloadBundle(stack, alice, project.id)
    const { context, page, errors } = await openBundle(stack, dir)
    try {
      await page.locator('[data-wb-id="n_gone000001"]').click()
      await expect.poll(() => page.locator('.wb-export-status').innerText()).toContain('page:관리자/없는 페이지')
      expect(page.url()).toMatch(/index\.html$/)

      await Promise.all([page.waitForURL(/%EC%83%81%EC%84%B8|상세/), page.locator('[data-wb-id="n_go00000001"]').click()])
      await page.waitForSelector('html[data-wb-ready]', { state: 'attached' })
      expect(decodeURIComponent(new URL(page.url()).pathname)).toMatch(/\/pages\/[^/]*회원[^/]*상세[^/]*\.html$/)
      expect(await page.locator('.wb-export-canvas').innerText()).toContain('상세 글')
      expect(errors).toEqual([])
    } finally {
      await context.close()
    }
  })

  /**
   * **마커는 렌더러의 `markerPoint` 가 말하는 자리에 선다**(`packages/renderer/src/marker.ts`) — 초점 요소(`[data-wb-focus]`)의 상자에서
   * 배치(`data-wb-marker`)의 모서리를 잡고 어긋남(`data-wb-marker-offset`)을 더한다. 페이지에서 렌더러를 부를 수 없으니 같은 규칙을
   * 여기서 DOM 값으로 센다 — 테마가 세 속성을 다 달았는지 먼저 본다(안 달았으면 뿌리 상자의 왼쪽 위로 셈이 같아져 못 가른다).
   */
  it('코멘트 마커가 초점 요소 · 배치 · 어긋남으로 센 자리에 선다', async () => {
    const alice = await stack.login(stack.users.alice)
    const project = await exportProject(stack, alice)
    await putTheme(project.call, project.id, { themeId: 'marked', version: '1.0.0', tokens: {} })
    const dir = await downloadBundle(stack, alice, project.id)
    const { context, page, errors } = await openBundle(stack, dir)
    try {
      const seen = await page.evaluate(() => {
        const node = document.querySelector('[data-wb-id="n_card000001"]')!
        const focus = node.querySelector('[data-wb-focus]')!
        const root = node.getBoundingClientRect()
        const box = focus.getBoundingClientRect()
        const [dx, dy] = node.getAttribute('data-wb-marker-offset')!.split(',').map(Number) as [number, number]
        const marker = document.querySelector('.wb-export-marker[data-wb-marker-for="n_card000001"]')!.getBoundingClientRect()
        return {
          placement: node.getAttribute('data-wb-marker'),
          focusIsRoot: box.left === root.left && box.top === root.top,
          expected: [box.left + box.width + dx, box.top + box.height + dy],
          center: [marker.left + marker.width / 2, marker.top + marker.height / 2],
        }
      })
      expect(seen.placement).toBe('bottom-end')
      expect(seen.focusIsRoot).toBe(false)
      expect(seen.center[0]).toBeCloseTo(seen.expected[0]!, 0)
      expect(seen.center[1]).toBeCloseTo(seen.expected[1]!, 0)
      expect(errors).toEqual([])
    } finally {
      await context.close()
    }
  })

  it.each([
    ['등록하지 않는 번들', 'silent', '테마 번들이 등록하지 않았습니다(silent@1.0.0)'],
    ['다른 판을 등록한 번들', 'swapped', '테마 번들이 다른 테마를 등록했습니다(swapped@1.0.0 — 번들은 swapped@9.9.9)'],
  ])('%s로 고정하면 기본 뷰로 그리고 까닭을 말한다 — data-wb-failed', async (_what, themeId, reason) => {
    const alice = await stack.login(stack.users.alice)
    const project = await exportProject(stack, alice)
    await putTheme(project.call, project.id, { themeId, version: '1.0.0', tokens: {} })
    const dir = await downloadBundle(stack, alice, project.id)
    const { context, page } = await openBundle(stack, dir)
    try {
      expect(await page.evaluate(() => document.documentElement.getAttribute('data-wb-failed'))).toBe(reason)
      expect(await page.locator('.wb-export-status').innerText()).toContain(reason)
      // 기본 뷰 — 카드가 SDK 의 Card 로 그려졌다(테마 시트도 걷혔다).
      expect(await page.locator('[data-wb-id="n_card000001"]').innerText()).toContain('카드')
      expect(await page.locator('.wb-export-canvas', { hasText: '바꿔 친 카드' }).count()).toBe(0)
      expect(await page.locator('link[data-wb-sheet="theme"]').count()).toBe(0)
    } finally {
      await context.close()
    }
  })

  /**
   * **화면 상태 전환기**(설계서 「HTML 정적 번들」) — 셸의 `select#wb-export-state` 는 트리 차례로 하위 상태를 들여 쓰고, 고르면 목업이 그 상태에서
   * 숨은 노드를 빼고 다시 서며 주소 해시가 따라간다. 하위 상태는 부모의 보임을 물려받는다. 해시로 연 파일은 그 상태로 서고, 목록에 없는 id 는
   * 기본이다. `WB_SHOTS_DIR` 를 주면 관리자 상태의 화면을 찍어 둔다.
   */
  it('상태가 있는 페이지는 전환기로 상태를 바꾸고, 해시로 연 파일은 그 상태로 선다', async () => {
    const alice = await stack.login(stack.users.alice)
    const dir = await downloadBundle(stack, alice, await exportStateProject(stack, alice))
    const viewport = { width: 1440, height: 900 }
    const canvas = (page: Page): Promise<string> => page.locator('.wb-export-canvas').innerText()

    const first = await openBundle(stack, dir, { viewport })
    try {
      const { page, errors } = first
      expect(await page.locator('#wb-export-state option').allInnerTexts()).toEqual(['기본', '관리자', '\u00a0\u00a0운영', '비로그인'])
      expect(await canvas(page)).toContain('보기')
      expect(await canvas(page)).not.toContain('승인')
      expect(await page.locator('.wb-export-marker').count()).toBe(0)

      await page.locator('#wb-export-state').selectOption('s_admin00001')
      expect(await canvas(page)).toContain('승인')
      expect(await canvas(page)).not.toContain('보기')
      expect(new URL(page.url()).hash).toBe('#state=s_admin00001')
      // 관리자 가지의 노드에 단 코멘트의 마커가 그 상태에서 선다.
      expect(await page.locator('.wb-export-marker[data-wb-marker-for="n_apprv00001"]').count()).toBe(1)
      // 상호작용 탭의 문장이 노드에 상태를 붙인다.
      await page.locator('label[for="wb-export-tab-interactions"]').click()
      expect(await page.locator('#wb-export-panel-interactions').innerText()).toContain("'승인 버튼'(관리자 상태)")
      if (process.env.WB_SHOTS_DIR) await page.screenshot({ path: join(process.env.WB_SHOTS_DIR, 'k3-bundle-switcher.png') })

      // 그 상태의 상호작용이 돈다.
      await page.locator('[data-wb-id="n_apprv00001"]').click()
      expect(await canvas(page)).not.toContain('회원 목록 제목')

      // 하위 상태는 관리자의 보임을 물려받는다 — «승인»이 서고 «보기»가 숨는다.
      await page.locator('#wb-export-state').selectOption('s_ops0000001')
      expect(await canvas(page)).toContain('승인')
      expect(await canvas(page)).not.toContain('보기')
      expect(new URL(page.url()).hash).toBe('#state=s_ops0000001')

      await page.locator('#wb-export-state').selectOption('default')
      expect(new URL(page.url()).hash).toBe('')
      expect(await canvas(page)).toContain('보기')
      expect(errors).toEqual([])
    } finally {
      await first.context.close()
    }

    const linked = await openBundle(stack, dir, { viewport, hash: '#state=s_admin00001' })
    try {
      expect(await linked.page.locator('#wb-export-state').inputValue()).toBe('s_admin00001')
      expect(await canvas(linked.page)).toContain('승인')
    } finally {
      await linked.context.close()
    }

    const unknown = await openBundle(stack, dir, { viewport, hash: '#state=s_nope' })
    try {
      expect(await unknown.page.locator('#wb-export-state').inputValue()).toBe('default')
      expect(await canvas(unknown.page)).toContain('보기')
      expect(await canvas(unknown.page)).not.toContain('승인')
    } finally {
      await unknown.context.close()
    }
  })
})
