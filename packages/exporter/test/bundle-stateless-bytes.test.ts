/**
 * **상태가 없는 페이지의 번들은 화면 상태 전의 바이트 그대로다**(설계서 「HTML 정적 번들」 — «상태가 없는 페이지는 지금 모양 그대로»).
 *
 * 화면 상태가 번들에 들면서 셸(전환기) · `assets/shell.css`(전환기 규칙) · 런타임이 바뀐다. 이 케이스는 그 변경이 상태 없는 페이지에
 * 새지 않는 것을 바이트로 잰다 — 페이지 HTML · 기본 뷰 CSS · 테마 파일 · 토큰 CSS 는 해시가 그대로이고, `assets/shell.css` 는 옛 글자가
 * 그대로 앞에 서고 뒤에 붙은 것이 전환기 규칙(`.wb-export-state`)뿐이다. `assets/runtime.js` 는 호출자가 넘기는 글자라 여기서 재지 않는다.
 *
 * **해시는 화면 상태를 번들에 싣기 전 소스로 지었다** — 셸 · 데이터 모양을 일부러 바꾸면 그 값을 새로 짓는다(`WB_PRINT_DIGEST=1` 로 돌려 찍은 값을 옮긴다).
 * 그때는 상태 없는 페이지에서 무엇이 바뀌었는지 그 커밋이 말해야 한다. `assets/views.css` 는 노드 몫(`WbNode.weight`)의 기본 규칙 셋과 열을 정한
 * 조회 폼(`[data-wb-columns]`)의 규칙 둘을 더하며 새로 지었다 — 몫 · 열이 없는 노드에는 안 닿는 특이도 0 규칙이다(`apps/web/build-test/layout-weight.test.ts`
 * «몫이 없는 문서» · `searchform-columns.test.ts` «열을 안 정한 조회 폼»). 페이지 HTML 은 첫 탭 이름을 에디터와 같은 «페이지 정보»로 바꾸며 새로
 * 지었다 — 그 낱말 말고 바뀐 바이트가 없다(다시 재는 법: 페이지 HTML 의 «페이지 정보» 하나를 «페이지 설명»으로 되돌려 해시하면 그 앞 값이 선다 —
 * `docs/superpowers/plans/2026-10-22-fx-pi-report.md` 의 L3 표). 노드 구역(문서 판 3)을 들이며 다시 지었다 — `assets/views.css` 는 기본 뷰의 구역 규칙,
 * «넓은 표본»(과 그 사본 `index.html`)은 픽스처가 구역 · 탭 패널을 싣게 바뀌었고, «슬롯» · «글» 은 문서 JSON 의 판 번호(1 → 3)만 다르다(다시 재는 법:
 * 두 페이지의 문서를 `version: 1` 로 되돌려 해시하면 앞 값이 선다 — `docs/superpowers/plans/2026-10-23-ns2-report.md`). 조합 입력(문서 판 4)을 들이며
 * 다시 지었다 — `assets/views.css` 는 값 칸 · 입력 조각의 기본 규칙(고정 폭 `size` 는 칸 폭을 안 넘는 `min(…, 100%)`), «넓은 표본» 은 픽스처의 `Field` 가 값 칸에 조각을 싣게 바뀌었고, «슬롯» · «글» 은
 * 문서 JSON 의 판 번호(3 → 4)만 다르다(`docs/superpowers/plans/2026-10-24-ci-a-report.md`).
 * 자리표시자의 그리기 값(SDK 1.5.0)을 들이며 `assets/views.css` 만 다시 지었다 — 자리표시자 뿌리의 변수 끊기 · 배치 · 표지(`data-wb-border` ·
 * `data-wb-align`) 규칙이 더해졌고 페이지 HTML 은 그대로다(다시 재는 법: `packages/theme-sdk/src/default-views/document.tsx` 의 자리표시자 규칙을 걷고 해시). 그림(`image` 조각 · `data-wb-frame` · `data-wb-image-fit`)의 규칙도 `assets/views.css` 에만 든다 — 그림이 없는 페이지의 데이터에는 `images` 키가 없어 페이지 HTML 이 그대로다.
 * 폼 표(SDK 1.6.0)를 들이며 다시 지었다 — `assets/views.css` 는 쌍 격자(폼 표 · 열을 정한 조회 폼)와 그 좁은 창(`@media`) · 폼 표 머리줄 · 옆 칸 규칙, «넓은 표본»(과 그 사본 `index.html`)은
 * 픽스처의 입력폼 필드를 폼 표 하나(2열 · 머리 오른쪽 단추)로 감쌌다. «슬롯» · «글» · «깨진 문서» 는 그대로다(`docs/superpowers/plans/2026-10-25-ft2-report.md`).
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

/** 상태 없는 페이지의 해시(파일마다 sha256 앞 16자) — 지은 때는 머리말. */
const BEFORE = {
  plain: {
    'index.html': '7a59ec8bc902e94c',
    'pages/넓은-표본.html': '67c2fa8dc72c5d67',
    'pages/슬롯.html': '4e8bd0e4f441ced8',
    'pages/글.html': 'abed474c8d552b49',
    'pages/깨진-문서.html': '9ab11048c5f61199',
    'assets/views.css': '038aa7f8e8da7ca7',
  },
  themed: {
    'index.html': '290fae2c4edca9bf',
    'pages/넓은-표본.html': '74e0f8e3c725d869',
    'pages/슬롯.html': 'd95293b9a6b0d653',
    'pages/글.html': 'f6e6876dde5919f0',
    'pages/깨진-문서.html': '0cf1fd266dd8dd82',
    'assets/views.css': '038aa7f8e8da7ca7',
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
