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
 * 폼 표(SDK 1.6.0)를 들이며 다시 지었다 — `assets/views.css` 는 폼 표의 쌍 격자와 그 좁은 창(`@media`) · 머리줄 · 옆 칸 규칙(열을 정한 조회 폼의 규칙은 그대로다), «넓은 표본»(과 그 사본 `index.html`)은
 * 픽스처의 입력폼 필드를 폼 표 하나(2열 · 머리 오른쪽 단추)로 감쌌다. «슬롯» · «글» · «깨진 문서» 는 그대로다(`docs/superpowers/plans/2026-10-25-ft2-report.md`).
 * 폼 표의 중간 폭 판(960px 아래 한 줄에 쌍 하나)과 값 칸 안 폼 표(하위 표)의 규칙을 더하며 `assets/views.css` 만 다시 지었다 — 페이지 HTML 은 그대로다
 * (`docs/superpowers/plans/2026-10-25-fx-ft-report.md` M2 · M3).
 * 그리드(문서 판 5 · SDK 1.7.0)를 들이며 다시 지었다 — `assets/views.css` 는 그리드 · 열 · 행 · 칸 · 페이지네이션 바의 기본 규칙, «넓은 표본»(과 그 사본
 * `index.html`)은 픽스처의 목록을 그리드 부품 여섯을 다 쓰는 그리드로 바꿨고, «깨진 문서» 는 props 가 틀린 노드의 타입(`List` → `DataGrid`)이 바뀌었다.
 * «슬롯» · «글» 은 문서 JSON 의 판 번호(4 → 5)만 다르다(다시 재는 법: 두 페이지의 문서를 `version: 4` 로 되돌려 해시하면 앞 값이 선다 —
 * `docs/superpowers/plans/2026-10-25-gr2-report.md`). 찍는 판의 층(`CAPTURE_CSS`)은 기본 뷰 CSS 밖이라 `assets/views.css` 에 안 든다. 몫 초기화가
 * 사본(`[data-wb-copy-of]`)도 덮게 넓히며 `assets/views.css` 만 다시 지었다. 그리드 칸 글의 낱말 단위 꺾기 · 칸 글 폭 표 · 바 접힘 · 고정 풀기
 * 규칙을 더하며 `assets/views.css` 만 다시 지었다(`docs/superpowers/plans/2026-10-25-fx-gr-report.md` M1 ~ M3).
 * 팝업(SDK 1.8.0)을 들이며 `assets/views.css` 만 다시 지었다 — 팝업 상자 · 크기 셋 · 덮개 층(`[data-wb-popup-layer]`) 규칙이다. 팝업이 없는 페이지의
 * 데이터에는 `popups` 키가 없고 목차 줄에 표지가 없어 페이지 HTML 은 그대로다. `assets/shell.css` 는 목차의 팝업 표지 규칙을 끝에 덧붙였다(아래
 * 셋째 케이스). 입력 조각의 길이 규칙(`data-wb-size`)에서 팝업 뿌리를 빼며 `assets/views.css` 만 다시 지었다 — 팝업의 크기 표지도
 * `data-wb-size` 라 보통 팝업이 입력 폭으로 줄었다(`docs/superpowers/plans/2026-10-26-poa-report.md` «실브라우저 판이 찾은 결함 셋»).
 * 파일첨부(같은 1.8.0)를 들이며 다시 지었다 — `assets/views.css` 는 파일첨부의 기본 규칙(단추 줄 · 목록 표 · 빈 목록 안내 · 한도 글), «넓은 표본»(과 그 사본
 * `index.html`)은 픽스처의 폼 표에 파일첨부 필드 하나를 더했다(카탈로그를 전부 쓰는 픽스처 — `parity.test.tsx` «무엇을 덮었나»). «슬롯» · «글» · «깨진 문서» 는
 * 그대로다(`docs/superpowers/plans/2026-10-26-pob-report.md`). 두 판을 한 1.8.0 에 실으며 `assets/views.css` 만 다시 지었다 — 팝업 · 파일첨부 규칙을 함께
 * 든 시트다(`docs/superpowers/plans/2026-10-27-rb-pob-report.md`).
 * 트리 항목 계층(문서 판 6 · SDK 1.9.0)을 들이며 다시 지었다 — `assets/views.css` 는 트리의 단 규칙(항목마다 단 변수 → 자식 목록의 들여쓰기 · 표지 칸
 * 폭), «넓은 표본»(과 그 사본 `index.html`)은 픽스처의 트리가 펼친 항목 · 접힌 항목 · 맨 위 잎을 싣게 바뀌었고, «슬롯» · «글» 은 문서 JSON 의 판 번호(5 → 6)만 다르다(다시 재는 법: 두 페이지의
 * 문서를 `version: 5` 로 되돌려 해시하면 앞 값이 선다 — `docs/superpowers/plans/2026-11-03-tr-report.md`). «깨진 문서» 는 그대로다.
 * 공통코드를 들이며 «넓은 표본»(과 그 사본 `index.html`)만 다시 지었다 — 픽스처의 칩 하나가 `code`(공통코드 참조)를 싣게 바뀌어 문서 JSON 이 그만큼
 * 길다. 표를 넘기지 않는 번들이라 페이지 데이터에 `codes` 키 · 좌측 트리의 «공통코드» 절 · `codes.html` 이 없고, 나머지 페이지 · 시트는 그대로다(다시 재는 법:
 * `test-support/fixtures.ts` 의 그 칩에서 `code` 를 떼고 해시하면 앞 값이 선다 — `docs/superpowers/plans/2026-11-10-cc-report.md`).
 * 코멘트 토큰을 들이며 «글» 만 다시 지었다 — 코멘트 칸의 줄이 번호 닻(`id="wb-marker-<노드 id>"` — 토큰이 그 번호로 오는 자리)을 단다. 코멘트가 없는
 * 페이지 · 시트는 그대로다(다시 재는 법: `bundle/shell.tsx` 의 `CommentTab` 에서 `id` 를 떼고 해시하면 앞 값이 선다 — `docs/superpowers/plans/2026-11-11-tk-report.md`).
 * 카탈로그에서 `Slot` 을 걷으며 «슬롯» 장을 뺐다 — 남은 장 HTML · `index.html` 은 목차(장 넷 → 셋)만 달라 다시 지었고 시트는 그대로다(다시 재는 법: 장 하나를
 * 더 넣고 해시하면 목차가 다시 늘어 값이 바뀐다 — `docs/superpowers/plans/2026-11-25-ly2-report.md`).
 * 레이아웃 틀(SDK 1.10.0)을 들이며 `assets/views.css` 만 다시 지었다 — 내용 상자(`[data-wb-layout-content]`)와 팝업 레이아웃의 막(`[data-wb-layout="popup"]`)
 * 규칙 둘이다. 번들이 아직 장을 틀로 감싸지 않아 페이지 HTML 은 그대로다(다시 재는 법: `packages/theme-sdk/src/default-views/layout.tsx` 의
 * `layoutCssBlocks` 를 빈 목록으로 두고 해시하면 앞 값이 선다 — `docs/superpowers/plans/2026-11-25-lt-report.md`).
 * 번들이 장을 틀로 감싸며 장 HTML 을 다시 지었다 — 스크립트에 번들 한 벌의 내비(`<script src="…assets/nav.js">`)가 더해지고 페이지 데이터에 칸 셋
 * (`pageId` · `pageTitle` · `path`)이 붙었다. 시트는 그대로이고 `assets/nav.js` 가 새 파일이다(이 번들은 메뉴 트리를 안 넘겨 빈 트리다). 다시 재는 법: 장 HTML
 * 에서 그 스크립트 한 줄과 데이터의 세 칸을 걷고 해시하면 앞 값이 선다(`docs/superpowers/plans/2026-11-25-lx-report.md`).
 */
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { exportBundle, type BundlePage, type BundleTheme } from '../src/bundle/index'
import { broadFixture, brokenFixture, EMPTY_MANIFEST, SAMPLE_PAGE } from '../test-support/fixtures'

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
    'index.html': 'd98de1a79806e177',
    'pages/넓은-표본.html': 'fee250c1d58ededf',
    'pages/글.html': 'c2431bd40c38d97c',
    'pages/깨진-문서.html': 'aa46080e5ff78705',
    'assets/views.css': '3620a5c4630e6ae4',
    'assets/nav.js': '62616a8c3a28e33e',
  },
  themed: {
    'index.html': '6b17e8150c9b3911',
    'pages/넓은-표본.html': '39982fe8d34c5998',
    'pages/글.html': 'e030075146f42bc2',
    'pages/깨진-문서.html': '0c4fd53e0f160ba9',
    'assets/views.css': '3620a5c4630e6ae4',
    'assets/nav.js': '62616a8c3a28e33e',
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

  it('assets/shell.css 는 옛 글자가 그대로 앞에 서고, 뒤에 붙은 규칙은 전환기(.wb-export-state…) · 목차의 팝업 표지(.wb-export-nav-kind · .wb-export-hidden) · «공통코드» 장 · 코멘트 토큰(.wb-export-token…)을 겨누는 것뿐이다', () => {
    const css = String(exportBundle({ pages: pages(), runtimeJs: '' }).files.find((file) => file.path === 'assets/shell.css')!.content)
    expect(hash(css.slice(0, SHELL_CSS_BEFORE.length))).toBe(SHELL_CSS_BEFORE.hash)
    const added = css.slice(SHELL_CSS_BEFORE.length)
    const selectors = [...added.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{[^}]*\}/g)].map((match) => match[1]!.trim())
    expect(selectors.length).toBeGreaterThan(0)
    // 팝업 표지는 팝업 페이지 줄에만 선다 — 그 클래스는 다른 줄에 안 붙는다(`bundle/shell.tsx`).
    // «공통코드» 장의 규칙은 표가 있는 번들에만 서는 요소(좌측 트리의 둘째 절 · `codes.html`)를 겨눈다. 코멘트 토큰의 규칙은 본문에 토큰이 든 코멘트에만
    // 서는 요소(`bundle/shell.tsx` 의 `TokenSegments`)를 겨눈다.
    for (const selector of selectors) {
      expect(selector).toMatch(
        /\.wb-export-state|^\.wb-export-nav-kind$|^\.wb-export-hidden$|^\.wb-export-(codes|chapter|nav-heading-next)\b|^\.wb-export-token(-broken|-note)?$|^(\.wb-export-screen )?\.wb-export-canvas$/,
      )
    }
    // 장 상자를 겨눈 덧붙은 규칙은 레이아웃 틀의 높이 변수 하나만 싣는다 — 틀이 없는 장에는 그 변수를 읽는 자리가 없다(설계서 §6.0 「레이아웃 틀」).
    const canvas = [...added.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)].filter((match) =>
      /\.wb-export-canvas\s*$/.test(match[1]!),
    )
    expect(canvas.map((match) => match[2]!.trim().replace(/:.*$/s, ''))).toEqual(['--wb-frame-min-height', '--wb-frame-min-height'])
  })
})
