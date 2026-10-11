/**
 * **상태가 없는 페이지의 번들은 화면 상태 전의 바이트 그대로다**(설계서 「HTML 정적 번들」 — «상태가 없는 페이지는 지금 모양 그대로»).
 *
 * 화면 상태가 번들에 들면서 셸(전환기) · `assets/shell.css`(전환기 규칙) · 런타임이 바뀐다. 이 케이스는 그 변경이 상태 없는 페이지에
 * 새지 않는 것을 바이트로 잰다 — 페이지 HTML · 기본 뷰 CSS · 테마 파일 · 토큰 CSS 는 해시가 그대로이고, `assets/shell.css` 는 옛 글자가
 * 그대로 앞에 서고 뒤에 붙은 것이 전환기 규칙(`.wb-export-state`)뿐이다. `assets/runtime.js` 는 호출자가 넘기는 글자라 여기서 재지 않는다.
 *
 * **해시는 화면 상태를 번들에 싣기 전 소스로 지었다** — 셸 · 데이터 모양을 일부러 바꾸면 그 값을 새로 짓는다(`WB_PRINT_DIGEST=1` 로 돌려 찍은 값을 옮긴다).
 * 그때는 상태 없는 페이지에서 무엇이 바뀌었는지 그 커밋이 말해야 한다.
 */
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { exportBundle, type BundlePage, type BundleTheme } from '../src/bundle/index'
import { broadFixture, brokenFixture, EMPTY_MANIFEST, SAMPLE_PAGE, slotFixture } from '../test-support/fixtures'

const THEME: BundleTheme = {
  ref: { themeId: 'test', version: '0.0.0' },
  manifest: {
    ...EMPTY_MANIFEST,
    tokens: { items: { 'color.primary': { type: 'color', label: '주색', default: '#2563eb' } } },
  } as BundleTheme['manifest'],
  tokens: { 'color.primary': '#0a7d33' },
  themeJs: '/* theme.js */',
  themeCss: '.t{color:red}',
  assets: [['assets/a.bin', new Uint8Array([1, 2, 3])]],
}

function pages(): BundlePage[] {
  return [
    { title: '넓은 표본', document: broadFixture(), description: '설명', target: 'page:넓은' },
    { title: '슬롯', document: slotFixture() },
    { title: '글', document: SAMPLE_PAGE, comments: [{ nodeId: 'n_text', body: '코멘트', authorName: '갑', createdAt: '2026-01-01' }] },
    { title: '깨진 문서', document: brokenFixture() },
  ]
}

function digest(withTheme: boolean): Record<string, string> {
  const bundle = exportBundle({ pages: pages(), runtimeJs: '/* runtime */', theme: withTheme ? THEME : null })
  const out: Record<string, string> = {}
  for (const file of bundle.files) {
    if (file.path === 'assets/runtime.js' || file.path === 'assets/shell.css') continue
    out[file.path] = hash(file.content)
  }
  return out
}

/** 화면 상태 전 소스의 해시(파일마다 sha256 앞 16자). */
const BEFORE = {
  plain: {
    'index.html': '257df31e66529a96',
    'pages/넓은-표본.html': '4a6cec2bef49de7c',
    'pages/슬롯.html': '681f803bd957006e',
    'pages/글.html': '84b26fe335a70579',
    'pages/깨진-문서.html': '887683844a0a5cb9',
    'assets/views.css': '57255a65bf3dc798',
  },
  themed: {
    'index.html': 'e61f7db03415ae1f',
    'pages/넓은-표본.html': '7eb7c94ccaa43c10',
    'pages/슬롯.html': '27f2f0b80889417c',
    'pages/글.html': '8a1e77b21772c0f0',
    'pages/깨진-문서.html': '0579d7f72b4430c0',
    'assets/views.css': '57255a65bf3dc798',
    'assets/theme/theme.js': 'e0bf77dea1cc3295',
    'assets/theme/theme.css': '174b2602178ea0cd',
    'assets/theme/assets/a.bin': '039058c6f2c0cb49',
    'assets/tokens.css': '20e261fcb531d82f',
  },
}

/** 화면 상태 전 `SHELL_CSS` 의 길이와 해시. */
const SHELL_CSS_BEFORE = { length: 5576, hash: 'c68c6a197ccbb768' }

function hash(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

describe('상태 없는 페이지의 번들 바이트', () => {
  it.each([
    ['테마 없음', false, BEFORE.plain],
    ['테마 있음', true, BEFORE.themed],
  ] as const)('%s — 페이지 HTML · 기본 뷰 CSS · 테마 · 토큰 파일이 화면 상태 전과 같다', (_what, withTheme, before) => {
    const now = digest(withTheme)
    // `WB_PRINT_DIGEST=1` 이면 지금 값을 찍는다 — 위 `BEFORE` 를 새로 지을 때 쓴다.
    // eslint-disable-next-line no-console
    if (process.env.WB_PRINT_DIGEST) console.log(JSON.stringify(now, null, 2))
    expect(now).toEqual(before)
  })

  it('상태 목록이 빈 페이지도 전환기를 싣지 않는다 — 문서 JSON 의 빈 목록만 다르다', () => {
    const without = exportBundle({ pages: [{ title: '글', document: SAMPLE_PAGE }], runtimeJs: '' })
    const empty = exportBundle({ pages: [{ title: '글', document: { ...SAMPLE_PAGE, viewStates: [] } }], runtimeJs: '' })
    const html = (bundle: typeof without): string => String(bundle.files.find((file) => file.path === 'pages/글.html')!.content)
    expect(html(empty)).not.toContain('wb-export-state')
    expect(html(empty).replace(',"viewStates":[]', '')).toBe(html(without))
  })

  it('assets/shell.css 는 옛 글자가 그대로 앞에 서고, 뒤에 붙은 규칙은 전환기(.wb-export-state…)를 겨누는 것뿐이다', () => {
    const css = String(exportBundle({ pages: pages(), runtimeJs: '' }).files.find((file) => file.path === 'assets/shell.css')!.content)
    expect(hash(css.slice(0, SHELL_CSS_BEFORE.length))).toBe(SHELL_CSS_BEFORE.hash)
    const added = css.slice(SHELL_CSS_BEFORE.length)
    const selectors = [...added.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{[^}]*\}/g)].map((match) => match[1]!.trim())
    expect(selectors.length).toBeGreaterThan(0)
    for (const selector of selectors) expect(selector).toMatch(/\.wb-export-state/)
  })
})
