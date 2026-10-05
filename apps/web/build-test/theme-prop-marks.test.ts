/**
 * **화면을 바꾸는 prop 이 시스템 테마 다섯에서 실제로 화면을 바꾸는가** — 실브라우저 판. 표지(`data-wb-<prop>`)와 상태의 접근성 속성이
 * DOM 에 실리는지는 jsdom(`packages/renderer/test/prop-marks.test.tsx`)이 잰다. 여기서는 그 표지 · 상태를 테마 CSS 가 읽어 **상자가
 * 바뀌는지**를 켬/끔 두 노드를 나란히 두고 잰다.
 *
 * | 짝 | 재는 값 | 성질 |
 * |---|---|---|
 * | `Section` compact | 루트의 `padding-top` · 높이 | 켜면 여백이 준다 |
 * | `SearchForm` collapsed | 루트 높이 · 안의 필드 수 | 켜면 낮아지고 필드가 DOM 에서 빠진다 |
 * | `Field` disabled · invalid · `List` loading | 루트 · 조각의 계산 스타일 | 꺼진 판과 다른 속성이 하나 이상 |
 * | `Media` kind | 틀 안 표지(`glyph`)의 글자 · 상자 | `video` 는 보이는 표지이고 `image` 의 것(없거나 다른 글자)과 다르다 |
 * | `List` selectable | 체크 칸 상자 | 값만 적는다 — 표가 아닌 variant 는 체크 칸을 안 그린다(이월) |
 *
 * 내보낸 번들(HTML · 문서 폭 1280)에서 잰다 — 캔버스와 같은 CSS 를 싣고(`theme-system-review.test.ts` «캔버스 = 번들»), 에디터 셸 없이
 * 문서만 서서 값이 흔들리지 않는다. 테마는 저장소 빌드가 낸 산출물을 api 가 기동 때 넣은 것이다 — `pnpm build` 가 먼저다.
 *
 * `WB_PROP_MARKS_SHOTS=<디렉터리>` 를 주면 짝마다 켬/끔을 한 장에 담은 스크린숏을 그 디렉터리에 남긴다(`<테마>-<짝>.png`).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { unzipSync } from 'fflate'
import type { BrowserContext, Page } from 'playwright-core'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { editorStackPrerequisite, startEditorStack, type EditorStack, type Session } from './editor-stack'
import { putTheme, seededVersion } from './theme-fixtures'

const 전제 = await editorStackPrerequisite()
if (!전제.ok) {
  // eslint-disable-next-line no-console
  console.log(`[에디터 실브라우저 판] 건너뛴다 — ${전제.reason}`)
}

const THEMES = ['system-admin', 'system-commerce', 'system-docs', 'system-portal', 'system-saas-marketing'] as const
const SHOTS = process.env.WB_PROP_MARKS_SHOTS

const text = (id: string, content: string) => ({ id, type: 'Text', props: { content } })
const fields = (prefix: string) => [
  { id: `${prefix}_1`, type: 'Field', props: { label: '검색어', placeholder: '이름 · 이메일' } },
  { id: `${prefix}_2`, type: 'Field', props: { label: '상태', control: 'select' } },
]

/** 켬/끔 짝. variant 는 달지 않는다 — 테마의 `defaultVariant` 로 선다. */
const NODES = [
  { id: 's_off', type: 'Section', props: {}, children: [text('s_off_t', '회원 관리')] },
  { id: 's_on', type: 'Section', props: { compact: true }, children: [text('s_on_t', '회원 관리')] },
  { id: 'q_off', type: 'SearchForm', props: {}, children: fields('q_off') },
  { id: 'q_on', type: 'SearchForm', props: { collapsed: true }, children: fields('q_on') },
  { id: 'f_plain', type: 'Field', props: { label: '이름', placeholder: '홍길동' } },
  { id: 'f_disabled', type: 'Field', props: { label: '이름', placeholder: '홍길동', disabled: true } },
  { id: 'f_invalid', type: 'Field', props: { label: '이름', placeholder: '홍길동', invalid: true } },
  { id: 'm_image', type: 'Media', props: { kind: 'image', ratio: '4/3' } },
  { id: 'm_video', type: 'Media', props: { kind: 'video', ratio: '4/3' } },
  { id: 'l_off', type: 'List', props: { items: 2, columns: ['이름', '상태'], pagination: false } },
  { id: 'l_on', type: 'List', props: { items: 2, columns: ['이름', '상태'], pagination: false, selectable: true } },
  { id: 'l_loading', type: 'List', props: { items: 2, columns: ['이름', '상태'], pagination: false, loading: true } },
]

/** 짝마다 스크린숏에 담을 두 노드. */
const PAIRS: Record<string, [string, string]> = {
  compact: ['s_off', 's_on'],
  collapsed: ['q_off', 'q_on'],
  'field-disabled': ['f_plain', 'f_disabled'],
  'field-invalid': ['f_plain', 'f_invalid'],
  'media-kind': ['m_image', 'm_video'],
  selectable: ['l_off', 'l_on'],
  'list-loading': ['l_off', 'l_loading'],
}

/** 계산 스타일 견주기에 쓰는 속성 — 상자 좌표는 넣지 않는다(옆 노드가 좌표를 흔든다). */
const STYLE_PROPS = [
  'color', 'backgroundColor', 'opacity', 'borderTopColor', 'borderBottomColor', 'borderLeftColor', 'borderTopWidth', 'borderBottomWidth',
  'boxShadow', 'outlineColor', 'outlineStyle', 'textDecorationLine', 'cursor', 'fontWeight',
]

/**
 * 페이지 안에서 값을 잰다 — 노드마다 루트의 높이 · `padding-top`, 루트와 자손(앞 12 개)의 계산 스타일, 안의 필드 수, 표지 조각의 상자, 표지
 * 속성. 글로 넘긴다 — vitest 가 함수 안의 이름을 바꿔 페이지에서 죽지 않게.
 */
const MEASURE = `(input) => {
  const out = {}
  for (const id of input.ids) {
    const el = document.querySelector('[data-wb-id="' + id + '"]')
    if (el === null) { out[id] = null; continue }
    const cs = getComputedStyle(el)
    const rect = el.getBoundingClientRect()
    const styles = [el, ...el.querySelectorAll('*')].slice(0, 13).map((n) => {
      const s = getComputedStyle(n)
      return input.props.map((k) => s[k]).join('|')
    })
    const box = (sel) => { const n = el.querySelector(sel); if (n === null) return null; const r = n.getBoundingClientRect(); return { text: n.textContent, width: Math.round(r.width * 10) / 10, height: Math.round(r.height * 10) / 10 } }
    out[id] = {
      height: Math.round(rect.height * 10) / 10,
      paddingTop: parseFloat(cs.paddingTop),
      styles,
      fields: el.querySelectorAll('[data-wb-component="Field"]').length,
      glyph: box('[data-wb-part="glyph"]'),
      checkbox: box('[data-wb-part="checkbox"]'),
      marks: [...el.attributes].filter((a) => /^data-wb-(compact|collapsed|selectable|kind)$|^aria-(disabled|invalid|busy)$/.test(a.name)).map((a) => a.name + '=' + a.value),
    }
  }
  return out
}`

interface Measured {
  height: number
  paddingTop: number
  styles: string[]
  fields: number
  glyph: { text: string; width: number; height: number } | null
  checkbox: { text: string; width: number; height: number } | null
  marks: string[]
}

/** 같은 자리의 계산 스타일 줄끼리 견줘 다른 속성 수를 센다(자손 수가 다르면 짧은 쪽까지). */
function styleDiff(a: Measured, b: Measured): number {
  let count = 0
  for (let i = 0; i < Math.min(a.styles.length, b.styles.length); i++) {
    const left = a.styles[i]!.split('|')
    const right = b.styles[i]!.split('|')
    count += left.filter((value, k) => value !== right[k]).length
  }
  return count
}

type Call = (method: string, path: string, body?: unknown) => Promise<{ status: number; body: any }>

const unpacked: string[] = []

describe.skipIf(!전제.ok)('시스템 테마 다섯 — 화면을 바꾸는 prop 의 켬/끔', () => {
  let stack: EditorStack
  let alice: Session
  let call: Call
  let projectId: string

  beforeAll(async () => {
    if (!전제.ok) return
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    call = (method, path, body) => stack.request(alice, method, path, body)
    const ok = (r: { status: number; body: any }, what: string): any => {
      if (r.status >= 300) throw new Error(`픽스처 ${what} ${r.status} ${JSON.stringify(r.body)}`)
      return r.body
    }
    const project = ok(await call('POST', '/projects', { name: '표지 설계서', slug: `marks-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` }), '프로젝트')
    projectId = project.id
    const menu = ok(await call('POST', `/projects/${projectId}/menu`, { parentId: null, title: '표지' }), '메뉴')
    const page = ok(await call('POST', `/projects/${projectId}/pages`, { menuNodeId: menu.id, title: '켬끔' }), '페이지')
    ok(await call('PATCH', `/projects/${projectId}/pages/${page.id}/ops`, { baseSeq: 0, ops: NODES.map((value, i) => ({ op: 'add', path: `/root/children/${i}`, value })) }), 'ops')
    if (SHOTS !== undefined) mkdirSync(SHOTS, { recursive: true })
  }, 180_000)

  afterAll(async () => {
    for (const dir of unpacked) rmSync(dir, { recursive: true, force: true })
    if (stack === undefined) return
    const { before, after } = await stack.close()
    expect(before.processes).toBeGreaterThan(0)
    expect(after).toEqual({ processes: 0, listeningPorts: [], databases: 0 })
  }, 120_000)

  /** 그 테마로 내보낸 번들의 그 페이지 파일. */
  async function bundlePage(): Promise<string> {
    const response = await fetch(`${stack.apiUrl}/api/projects/${projectId}/export?format=html`, { headers: { cookie: alice.cookie } })
    if (response.status !== 200) throw new Error(`내보내기 ${response.status}`)
    const entries = unzipSync(new Uint8Array(await response.arrayBuffer()))
    const dir = mkdtempSync(join(tmpdir(), 'wb-marks-bundle-'))
    unpacked.push(dir)
    let file: string | null = null
    for (const [path, bytes] of Object.entries(entries)) {
      if (path.endsWith('/')) continue
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), bytes)
      if (/\/pages\/표지-켬끔\.html$/.test(path)) file = join(dir, path)
    }
    if (file === null) throw new Error(`번들에 페이지가 없다: ${Object.keys(entries).join(', ')}`)
    return file
  }

  /** 번들 페이지를 연다 — 문서 뿌리의 폭이 1280 이 되게 창 폭을 맞춘다(뷰어는 좌 · 우 칸을 갖는다). */
  async function open(file: string): Promise<{ context: BrowserContext; page: Page }> {
    const context = await stack.browser.newContext({ viewport: { width: 1980, height: 1400 } })
    const page = await context.newPage()
    await page.goto(pathToFileURL(file).href)
    await page.waitForSelector('html[data-wb-ready]', { state: 'attached', timeout: 15_000 })
    await page.evaluate(() => document.fonts.ready.then(() => undefined))
    for (let i = 0; i < 3; i++) {
      const now = await page.evaluate(() => document.querySelector('.wb-export-canvas [data-wb-id]')!.getBoundingClientRect().width)
      if (Math.abs(now - 1280) < 0.5) break
      await page.setViewportSize({ width: Math.round(page.viewportSize()!.width + (1280 - now)), height: 1400 })
      await page.waitForTimeout(200)
    }
    return { context, page }
  }

  /**
   * 짝 둘을 한 장에 — 두 상자를 덮는 사각에 8px 여백. 번들의 문서는 뷰어 칸 안에서 스크롤되므로 앞 노드를 보이는 자리로 올린 뒤 뷰포트
   * 좌표로 자른다(짝은 뷰포트 높이 안에 든다).
   */
  async function shoot(page: Page, theme: string, name: string, [a, b]: [string, string]): Promise<void> {
    const clip = await page.evaluate(
      ([x, y]) => {
        document.querySelector(`[data-wb-id="${x}"]`)!.scrollIntoView({ block: 'start' })
        const rects = [x, y].map((id) => document.querySelector(`[data-wb-id="${id}"]`)!.getBoundingClientRect())
        const left = Math.max(0, Math.min(...rects.map((r) => r.left)) - 8)
        const top = Math.max(0, Math.min(...rects.map((r) => r.top)) - 8)
        const right = Math.max(...rects.map((r) => r.right)) + 8
        const bottom = Math.max(...rects.map((r) => r.bottom)) + 8
        return { x: left, y: top, width: right - left, height: bottom - top }
      },
      [a, b] as const,
    )
    await page.screenshot({ path: join(SHOTS!, `${theme.replace(/^system-/, '')}-${name}.png`), clip })
  }

  it.each(THEMES)('%s — 켬/끔이 상자를 바꾼다', async (themeId) => {
    await putTheme(call, projectId, { themeId, version: seededVersion(themeId), tokens: {} })
    const { context, page } = await open(await bundlePage())
    let m: Record<string, Measured | null>
    try {
      expect(await page.evaluate(() => document.documentElement.getAttribute('data-wb-failed'))).toBeNull()
      m = await page.evaluate(`(${MEASURE})(${JSON.stringify({ ids: NODES.map((n) => n.id), props: STYLE_PROPS })})`)
      if (SHOTS !== undefined) for (const [name, pair] of Object.entries(PAIRS)) await shoot(page, themeId, name, pair)
    } finally {
      await context.close()
    }
    const at = (id: string): Measured => {
      const v = m[id]
      if (v === null || v === undefined) throw new Error(`${themeId} — ${id} 가 안 그려졌다`)
      return v
    }
    // 값은 실패 문장에 함께 싣는다 — 보고가 그 값을 옮긴다.
    const values = {
      compact: { paddingTop: [at('s_off').paddingTop, at('s_on').paddingTop], height: [at('s_off').height, at('s_on').height] },
      collapsed: { height: [at('q_off').height, at('q_on').height], fields: [at('q_off').fields, at('q_on').fields] },
      disabled: styleDiff(at('f_plain'), at('f_disabled')),
      invalid: styleDiff(at('f_plain'), at('f_invalid')),
      loading: styleDiff(at('l_off'), at('l_loading')),
      kind: [at('m_image').glyph, at('m_video').glyph],
      selectable: [at('l_off').checkbox, at('l_on').checkbox],
      marks: [at('s_on').marks, at('q_on').marks, at('f_disabled').marks, at('f_invalid').marks, at('m_video').marks, at('l_on').marks, at('l_loading').marks],
    }
    const [image, video] = [at('m_image').glyph, at('m_video').glyph]
    // eslint-disable-next-line no-console
    console.log(`[표지 화면 차] ${themeId} ${JSON.stringify(values)}`)
    // 카나리아 — 표지가 안 실리면 아래는 테마 CSS 가 아니라 다른 것을 잰다.
    expect(values.marks, `${themeId} 표지`).toEqual([
      ['data-wb-compact='],
      ['data-wb-collapsed='],
      ['aria-disabled=true'],
      ['aria-invalid=true'],
      ['data-wb-kind=video'],
      ['data-wb-selectable='],
      ['aria-busy=true'],
    ])
    expect(
      {
        compactNarrower: values.compact.paddingTop[1]! < values.compact.paddingTop[0]!,
        compactShorter: values.compact.height[1]! < values.compact.height[0]!,
        collapsedShorter: values.collapsed.height[1]! < values.collapsed.height[0]!,
        collapsedFields: values.collapsed.fields,
        disabledDiffers: values.disabled > 0,
        invalidDiffers: values.invalid > 0,
        loadingDiffers: values.loading > 0,
        videoGlyphVisible: video !== null && video.width > 0 && video.height > 0,
        videoGlyphDiffers: video?.text !== image?.text,
      },
      `${themeId} ${JSON.stringify(values)}`,
    ).toEqual({
      compactNarrower: true,
      compactShorter: true,
      collapsedShorter: true,
      collapsedFields: [2, 0],
      disabledDiffers: true,
      invalidDiffers: true,
      loadingDiffers: true,
      videoGlyphVisible: true,
      videoGlyphDiffers: true,
    })
  }, 180_000)
})
