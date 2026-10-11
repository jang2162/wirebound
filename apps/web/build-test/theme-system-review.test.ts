/**
 * **시스템 테마 다섯이 같은 설계서를 캔버스 · 내보낸 번들 · PPTX 화면에서 깨지지 않게 그리는가** — 실브라우저 판.
 *
 * 테마 build-test(`checkTheme` · `wb-theme shots`)는 갤러리 칸을 **표준 모드 문서 한 장**에 그린다. 여기서 재는 것은 그 자가 못 보는
 * 자리다 — 에디터 캔버스(same-origin iframe · 문서 높이를 따라 자람) · 설정 미리보기 · 번들의 3분할 뷰어 · PPTX 화면(720 폭).
 *
 * | 케이스 | 재는 성질 | 값 |
 * |---|---|---|
 * | 세로 Divider | 캔버스 iframe 이 시간이 지나도 안 자라고, 번들에서 선이 보인다 | iframe 높이 두 번 · 번들 Divider 높이 |
 * | 좁은 폭 | 문서 폭 390 에서 글자가 문서 뿌리 밖으로 안 나간다(잘려 숨는 것도 나간 것이다) | 글자 노드의 `Range` 사각 오른끝 |
 * | 캔버스 = 번들 | 같은 문서 폭(1280)에서 노드의 세로 자리가 같다 — 번호 마커가 그 자리를 따른다 | 뿌리 기준 `top` |
 * | PPTX 화면 폭 | 화면 이미지가 720 폭(×2 화소)을 안 넘는다 — 번호 마커까지 | pptx 의 `ppt/media/*.png` 폭 |
 * | 토큰 칸 | 설정 페이지의 토큰 칸마다 값을 바꾸면 미리보기의 계산값이 바뀐다 | 미리보기 요소의 계산 스타일 |
 *
 * 테마는 저장소 빌드가 낸 산출물(`system-themes/<이름>/dist`)을 api 가 기동 때 넣은 것이다 — `pnpm build` 가 먼저다.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { unzipSync } from 'fflate'
import type { BrowserContext, Frame, Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { putTheme, seededVersion } from './theme-fixtures'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const THEMES = ['system-admin', 'system-commerce', 'system-docs', 'system-portal', 'system-saas-marketing'] as const

/** 끊을 자리가 없는 긴 낱말 — 관리자 화면의 이메일 · 주소는 흔히 이 꼴이다. */
const LONG_EMAIL = 'hong.gildong.very.long.account@example-company.co.kr'

const text = (id: string, content: string, role?: string) => ({
  id,
  type: 'Text',
  props: role === undefined ? { content } : { content, role },
})

/** 관리자 목록 — 폼(SearchForm) 뒤에 노드가 이어진다. variant 는 달지 않는다(테마의 `defaultVariant` 로 선다). */
const LIST_NODES = [
  {
    id: 'a_sec',
    type: 'Section',
    props: {},
    children: [text('a_h1', '회원 관리', 'h1'), text('a_lead', '가입한 회원을 찾고 상태를 바꿉니다.')],
  },
  {
    id: 'a_search',
    type: 'SearchForm',
    props: {},
    children: [
      { id: 'a_f1', type: 'Field', props: { label: '검색어', placeholder: '이름 · 이메일' } },
      { id: 'a_f2', type: 'Field', props: { label: '상태', control: 'select' } },
    ],
  },
  { id: 'a_new', type: 'Button', variant: 'primary', props: { label: '회원 등록' } },
  { id: 'a_list', type: 'List', props: { items: 4, columns: ['이름', '이메일', '가입일', '상태'], selectable: true } },
  { id: 'a_card', type: 'Card', props: { title: '신규 가입', subtitle: '이번 달' }, children: [text('a_card_t', '312명')] },
]

/** 관리자 상세 — 긴 이메일이 제목 · 키-값에 든다. 카드는 전체 폭이다(오른쪽 모서리 마커가 문서 끝에 선다). */
const DETAIL_NODES = [
  { id: 'b_sec', type: 'Section', props: {}, children: [text('b_h2', `홍길동 (${LONG_EMAIL})`, 'h2')] },
  {
    id: 'b_kv',
    type: 'KeyValue',
    props: {
      columns: 2,
      pairs: [
        { key: '이름', value: '홍길동' },
        { key: '이메일', value: LONG_EMAIL },
        { key: '주소', value: '서울특별시 강남구 테헤란로 123 12층' },
        { key: '등급', value: 'VIP' },
      ],
    },
  },
  {
    id: 'b_form',
    type: 'EntryForm',
    props: { title: '회원 정보 수정' },
    children: [
      { id: 'b_f1', type: 'Field', props: { label: '이름', required: true } },
      { id: 'b_f2', type: 'Field', props: { label: '메모', control: 'textarea' } },
    ],
  },
  { id: 'b_card', type: 'Card', props: { title: '상담 메모' }, children: [text('b_memo', '배송 지연 문의 — 부분 환불 처리.')] },
  { id: 'b_save', type: 'Button', variant: 'primary', props: { label: '저장' } },
]

/** 세로 구분선 둘 — 가로 Flex 안 하나 · 블록 부모(Page) 바로 밑 하나. 갤러리 표본(`Divider — 세로`)은 뒤의 꼴이다. */
const DIVIDER_NODES = [
  {
    id: 'd_bar',
    type: 'Flex',
    props: { align: 'center' },
    children: [text('d_l', '왼쪽'), { id: 'd_in', type: 'Divider', props: { direction: 'vertical' } }, text('d_r', '오른쪽')],
  },
  { id: 'd_root', type: 'Divider', props: { direction: 'vertical' } },
  text('d_after', '아래 글'),
]

type Call = (method: string, path: string, body?: unknown) => Promise<{ status: number; body: any }>

interface Fixture {
  id: string
  call: Call
  pages: { list: string; detail: string; divider: string }
}

async function reviewProject(stack: EditorStack, owner: Session): Promise<Fixture> {
  const call: Call = (method, path, body) => stack.request(owner, method, path, body)
  const ok = (r: { status: number; body: any }, what: string): any => {
    if (r.status >= 300) throw new Error(`픽스처 ${what} ${r.status} ${JSON.stringify(r.body)}`)
    return r.body
  }
  const project = ok(
    await call('POST', '/projects', {
      name: '회원 관리 설계서',
      slug: `sysrv-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    }),
    '프로젝트',
  )
  const menu = ok(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '관리자' }), '메뉴')
  const pages: Record<string, string> = {}
  for (const [key, title, nodes] of [
    ['list', '회원 목록', LIST_NODES],
    ['detail', '회원 상세', DETAIL_NODES],
    ['divider', '구분선', DIVIDER_NODES],
  ] as const) {
    const page = ok(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title }), title)
    ok(
      await call('PATCH', `/projects/${project.id}/pages/${page.id}/ops`, {
        baseSeq: 0,
        ops: nodes.map((value, i) => ({ op: 'add', path: `/root/children/${i}`, value })),
      }),
      `ops ${title}`,
    )
    pages[key] = page.id
  }
  for (const nodeId of ['a_search', 'a_list', 'a_card'])
    ok(await call('POST', `/projects/${project.id}/pages/${pages.list}/comments`, { nodeId, body: '코멘트' }), '코멘트')
  for (const nodeId of ['b_kv', 'b_form', 'b_card'])
    ok(await call('POST', `/projects/${project.id}/pages/${pages.detail}/comments`, { nodeId, body: '코멘트' }), '코멘트')
  return { id: project.id, call, pages: pages as Fixture['pages'] }
}

const unpacked: string[] = []

/** 내보내기 zip 을 풀고 페이지 제목 → 파일 경로를 낸다(파일 이름은 `메뉴-제목.html`). */
async function bundleFiles(stack: EditorStack, session: Session, projectId: string): Promise<Record<string, string>> {
  const response = await fetch(`${stack.apiUrl}/api/projects/${projectId}/export?format=html`, { headers: { cookie: session.cookie } })
  if (response.status !== 200) throw new Error(`내보내기 ${response.status}`)
  const entries = unzipSync(new Uint8Array(await response.arrayBuffer()))
  const dir = mkdtempSync(join(tmpdir(), 'wb-sysrv-bundle-'))
  unpacked.push(dir)
  const files: Record<string, string> = {}
  for (const [path, bytes] of Object.entries(entries)) {
    if (path.endsWith('/')) continue
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), bytes)
    const title = /\/pages\/관리자-(.+)\.html$/.exec(path)?.[1]
    if (title !== undefined) files[title] = join(dir, path)
  }
  return files
}

/** 번들의 한 페이지를 연다 — 문서 뿌리(첫 `[data-wb-id]`)의 폭이 `width` 가 되게 창 폭을 맞춘다(뷰어는 좌 · 우 칸을 갖는다). */
async function openBundlePage(stack: EditorStack, file: string, width: number): Promise<{ context: BrowserContext; page: Page }> {
  const context = await stack.browser.newContext({ viewport: { width: width + 700, height: 1000 } })
  const page = await context.newPage()
  await page.goto(pathToFileURL(file).href)
  await page.waitForSelector('html[data-wb-ready]', { state: 'attached', timeout: 15_000 })
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  for (let i = 0; i < 3; i++) {
    const now = await page.evaluate(() => document.querySelector('.wb-export-canvas [data-wb-id]')!.getBoundingClientRect().width)
    if (Math.abs(now - width) < 0.5) break
    await page.setViewportSize({ width: Math.round(page.viewportSize()!.width + (width - now)), height: 1000 })
    await page.waitForTimeout(200)
  }
  return { context, page }
}

/** 에디터에서 그 페이지를 열고 캔버스 iframe 을 낸다 — 테마 시트가 실린 뒤. */
async function openCanvas(
  page: Page,
  projectId: string,
  pageId: string,
  anchor: string,
): Promise<{ iframe: import('playwright-core').ElementHandle; frame: Frame }> {
  await page.goto(`/projects/${projectId}/pages/${pageId}`)
  const iframe = await page.waitForSelector('iframe.wb-shell-canvas-iframe')
  const frame = (await iframe.contentFrame())!
  await frame.waitForSelector(`[data-wb-id="${anchor}"]`, { state: 'attached' })
  await frame.waitForFunction(() =>
    [...document.querySelectorAll('link[data-wb-style="theme"]')].every((l) => (l as HTMLLinkElement).sheet !== null),
  )
  await frame.evaluate(() => document.fonts.ready.then(() => undefined))
  return { iframe, frame }
}

/** 뿌리(첫 `[data-wb-id]`)를 기준으로 노드마다 세로 자리. `scope` 는 뿌리를 찾는 셀렉터 접두. */
const NODE_TOPS = `(scope) => {
  const nodes = [...document.querySelectorAll(scope + '[data-wb-id]')]
  const root = nodes[0].getBoundingClientRect()
  return Object.fromEntries(nodes.map((n) => [n.getAttribute('data-wb-id'), Math.round((n.getBoundingClientRect().top - root.top) * 10) / 10]))
}`

/** 뿌리 오른끝을 넘는 글자 노드 — 잘려 숨은 것(`overflow: hidden` 조상)도 센다. */
const TEXT_PAST_ROOT = `(scope) => {
  const root = document.querySelector(scope + '[data-wb-id]')
  const right = root.getBoundingClientRect().right
  const out = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (!n.textContent.trim()) continue
    const range = document.createRange()
    range.selectNodeContents(n)
    let max = -Infinity
    for (const r of range.getClientRects()) max = Math.max(max, r.right)
    if (max > right + 0.5) out.push(n.parentElement.closest('[data-wb-id]').getAttribute('data-wb-id') + ' +' + Math.round(max - right) + 'px ' + n.textContent.slice(0, 24))
  }
  return out
}`

/** 미리보기 문서의 요소마다 계산 스타일 — 상자 좌표는 넣지 않는다(자라는 요소가 좌표를 흔든다). */
const STYLE_PROPS = [
  'color',
  'backgroundColor',
  'backgroundImage',
  'borderTopColor',
  'borderBottomColor',
  'borderLeftColor',
  'borderTopWidth',
  'borderTopLeftRadius',
  'borderBottomRightRadius',
  'boxShadow',
  'fontFamily',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'paddingTop',
  'paddingLeft',
  'marginTop',
  'rowGap',
  'columnGap',
  'maxWidth',
  'gridTemplateColumns',
]
const STYLE_SNAPSHOT = `(props) => [...document.body.querySelectorAll('*')].map((el) => [null, '::before', '::after'].map((p) => { const cs = getComputedStyle(el, p); return p && (cs.content === 'none' || cs.content === 'normal') ? '' : props.map((k) => cs[k]).join('|') }).join('#'))`

/** 칸에 넣을 다른 값 — 640 폭 미리보기에서 보일 만큼 크게 바꾼다(폭 토큰은 640 아래로). */
function otherValue(type: string, value: string | number, options?: string[]): string | number {
  const text = String(value)
  if (type === 'color') return text.toLowerCase() === '#ff00aa' ? '#00aa55' : '#ff00aa'
  if (type === 'length') {
    const m = /^(-?[\d.]+)([a-z%]+)$/.exec(text)
    if (m === null) return '13px'
    const n = Number(m[1])
    return m[2] === 'px' && n >= 100 ? '200px' : `${n === 0 ? 8 : Math.round(n * 300) / 100}${m[2]}`
  }
  if (type === 'number') return Number(text) >= 100 ? (Number(text) >= 700 ? 300 : 900) : Math.round(Number(text) * 200) / 100
  if (type === 'font') return text.includes('monospace') ? 'serif' : 'monospace'
  if (type === 'shadow') return '0 0 0 8px #ff00aa'
  return options?.find((o) => o !== text) ?? text
}

describe.skipIf(!전제.ok)('시스템 테마 다섯 — 캔버스 · 번들 · PPTX', () => {
  let stack: EditorStack
  let alice: Session
  let fixture: Fixture

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    fixture = await reviewProject(stack, alice)
  }, 180_000)

  afterAll(async () => {
    for (const dir of unpacked) rmSync(dir, { recursive: true, force: true })
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  }, 120_000)

  /**
   * 세로 Divider 의 `min-height: 100%` 는 높이가 정해지지 않은 부모에서 표준 모드면 0(번들 · PPTX 에서 선이 안 보임)이고, 캔버스
   * iframe(quirks 모드 — 아래 «캔버스 = 번들») 에서는 뷰포트(= iframe) 높이가 되어 iframe 이 문서 높이를 따라 자라는 고리가 선다.
   */
  it.each(THEMES)(
    '%s — 세로 Divider 가 캔버스를 키우지 않고 번들에서 보인다',
    async (themeId) => {
      await putTheme(fixture.call, fixture.id, { themeId, version: seededVersion(themeId), tokens: {} })
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1600, height: 900 } })
      let heights: number[]
      try {
        const { iframe } = await openCanvas(page, fixture.id, fixture.pages.divider, 'd_after')
        const height = () => iframe.evaluate((el) => Math.round((el as HTMLIFrameElement).getBoundingClientRect().height))
        await page.waitForTimeout(500)
        const first = await height()
        await page.waitForTimeout(2000)
        heights = [first, await height()]
      } finally {
        await context.close()
      }
      const files = await bundleFiles(stack, alice, fixture.id)
      const bundle = await openBundlePage(stack, files['구분선']!, 1280)
      let drawn: number[]
      try {
        drawn = await bundle.page.evaluate(() =>
          ['d_in', 'd_root'].map((id) => Math.round(document.querySelector(`[data-wb-id="${id}"]`)!.getBoundingClientRect().height)),
        )
      } finally {
        await bundle.context.close()
      }
      expect(
        { canvasGrowth: heights[1]! - heights[0]!, bundleDividerVisible: drawn.map((h) => h > 0) },
        `캔버스 iframe 높이 ${heights.join(' → ')} · 번들 Divider 높이 ${drawn.join(' · ')}`,
      ).toEqual({
        canvasGrowth: 0,
        bundleDividerVisible: [true, true],
      })
    },
    120_000,
  )

  it.each(THEMES)(
    '%s — 문서 폭 390 에서 글자가 문서 밖으로 안 나간다(번들)',
    async (themeId) => {
      await putTheme(fixture.call, fixture.id, { themeId, version: seededVersion(themeId), tokens: {} })
      const files = await bundleFiles(stack, alice, fixture.id)
      const { context, page } = await openBundlePage(stack, files['회원-상세']!, 390)
      try {
        expect(
          await page.evaluate(() => document.querySelector('.wb-export-canvas [data-wb-id]')!.getBoundingClientRect().width),
        ).toBeCloseTo(390, 0)
        expect(await page.evaluate(`(${TEXT_PAST_ROOT})('.wb-export-canvas ')`)).toEqual([])
      } finally {
        await context.close()
      }
    },
    120_000,
  )

  /**
   * 캔버스 iframe 은 `about:blank` 이 이미 `body` 를 가져 doctype 을 안 쓰고 quirks 모드(`BackCompat`)로 선다
   * (`src/canvas/canvas-iframe.tsx` 의 `doc.body === null` 갈래). 번들은 `<!doctype html>` 이라 표준 모드다 — quirks 의
   * `form { margin-block-end: 1em }` 이 폼 뒤의 노드를 캔버스에서만 1em 내린다. 번호 마커는 노드 자리를 따르므로 함께 어긋난다.
   * 테마와 무관한 틀의 성질이라 system-admin 한 테마로 잰다.
   */
  it('system-admin — 같은 문서 폭(1280)에서 캔버스와 번들의 노드 세로 자리가 같다', async () => {
    await putTheme(fixture.call, fixture.id, { themeId: 'system-admin', version: seededVersion('system-admin'), tokens: {} })
    const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1600, height: 900 } })
    let canvas: Record<string, number>
    let mode: string
    try {
      const { frame } = await openCanvas(page, fixture.id, fixture.pages.list, 'a_card')
      expect(await frame.evaluate(() => document.documentElement.clientWidth)).toBe(1280)
      canvas = (await frame.evaluate(`(${NODE_TOPS})('')`)) as Record<string, number>
      mode = await frame.evaluate(() => document.compatMode)
    } finally {
      await context.close()
    }
    const files = await bundleFiles(stack, alice, fixture.id)
    const bundle = await openBundlePage(stack, files['회원-목록']!, 1280)
    let exported: Record<string, number>
    try {
      exported = (await bundle.page.evaluate(`(${NODE_TOPS})('.wb-export-canvas ')`)) as Record<string, number>
    } finally {
      await bundle.context.close()
    }
    expect(Object.keys(canvas).length).toBeGreaterThan(5)
    const apart = Object.keys(canvas)
      .filter((id) => Math.abs(canvas[id]! - exported[id]!) > 1)
      .map((id) => `${id} ${canvas[id]} 대 ${exported[id]}`)
    expect(apart, `캔버스 문서 모드 ${mode}`).toEqual([])
  }, 120_000)

  it.each(THEMES)(
    '%s — PPTX 화면 이미지가 720 폭을 넘지 않는다(번호 마커 포함)',
    async (themeId) => {
      await putTheme(fixture.call, fixture.id, { themeId, version: seededVersion(themeId), tokens: {} })
      const preview = await fixture.call('GET', `/projects/${fixture.id}/export/preview?format=pptx`)
      expect({ screenless: preview.body.screenless, screenFailures: preview.body.screenFailures }).toEqual({
        screenless: [],
        screenFailures: [],
      })
      const response = await fetch(`${stack.apiUrl}/api/projects/${fixture.id}/export?format=pptx`, { headers: { cookie: alice.cookie } })
      const entries = unzipSync(new Uint8Array(await response.arrayBuffer()))
      const widths = Object.entries(entries)
        .filter(([path]) => path.startsWith('ppt/media/') && path.endsWith('.png'))
        .map(([, bytes]) => new DataView(bytes.buffer, bytes.byteOffset).getUint32(16))
      expect(widths.length).toBe(3)
      // 그리는 자는 720 CSS px 를 기기 배율 2 로 찍는다 — 넘친 장은 그 폭보다 넓게 찍힌다(`screen-render-chromium.ts` 의 `PAGE_SIZE`).
      expect(widths.filter((w) => w > 1440)).toEqual([])
    },
    120_000,
  )

  it.each(THEMES)(
    '%s — 토큰 칸마다 값을 바꾸면 미리보기의 계산 스타일이 바뀐다',
    async (themeId) => {
      await putTheme(fixture.call, fixture.id, { themeId, version: seededVersion(themeId), tokens: {} })
      const manifest = (await fixture.call('GET', `/projects/${fixture.id}/theme`)).body.manifest
      const { context, page } = await stack.openTab(stack.users.alice, { viewport: { width: 1600, height: 1000 } })
      const silent: string[] = []
      try {
        await page.goto(`/projects/${fixture.id}/settings`)
        const form = page.getByRole('group', { name: '토큰' })
        await form.locator('fieldset').first().waitFor()
        const handle = await page.waitForSelector('.wb-shell-settings-preview iframe')
        const frame = (await handle.contentFrame())!
        await frame.waitForSelector('[data-wb-gallery-item]')
        await frame.evaluate(() => document.fonts.ready.then(() => undefined))
        const snapshot = async (): Promise<string[]> =>
          (await frame.evaluate(`(${STYLE_SNAPSHOT})(${JSON.stringify(STYLE_PROPS)})`)) as string[]
        for (const [key, decl] of Object.entries<any>(manifest.tokens.items)) {
          const next = otherValue(decl.type, decl.default, decl.options)
          const cssVar = `--wb-${key.replace(/\./g, '-')}`
          const field = form.getByLabel(decl.label, { exact: true })
          const before = await snapshot()
          if (decl.type === 'select') await field.selectOption(String(next))
          else if (decl.type === 'length' && /^-?[\d.]+[a-z%]+$/.test(String(decl.default)))
            await field.fill(String(next).replace(/[a-z%]+$/, ''))
          else await field.fill(String(next))
          // 미리보기의 토큰 시트가 새 값을 실은 뒤에 잰다 — 안 실렸으면 이 칸은 잰 것이 아니다.
          await expect
            .poll(() => frame.evaluate((v) => getComputedStyle(document.documentElement).getPropertyValue(v).replace(/\s/g, ''), cssVar), {
              timeout: 5000,
            })
            .toBe(String(next).replace(/\s/g, ''))
          await page.waitForTimeout(150)
          const after = await snapshot()
          if (!after.some((row, i) => row !== before[i])) silent.push(`${key}(${decl.label})`)
          await field.locator('xpath=ancestor::div[@class="wb-shell-settings-token"]').getByRole('button', { name: '기본값으로' }).click()
        }
      } finally {
        await context.close()
      }
      expect(Object.keys(manifest.tokens.items).length).toBeGreaterThan(10)
      expect(silent).toEqual([])
    },
    240_000,
  )
})
