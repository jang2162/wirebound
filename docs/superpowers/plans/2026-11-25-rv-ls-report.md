# rv-ls — 레이아웃 T9(기본테마 2.2.0 서브페이지 뷰) 반증 리뷰

대상 `feat/layout-subpage` 머리 `4084dfe9`(main `27ef2cc9` 위). 고치지 않았다 — 재현 값과 탐침 원문만 적는다. 판 Node v24.21.0(`mise env` 뒤 `node -v`) ·
자기 DB `0.0.0.0:5549`. 시작 때 `orca terminal list` 에 이 워크트리 터미널 둘(`..ayout-subpage` · «초기 설정» — 둘 다 셸 프롬프트, 에이전트 없음) ·
추적 파일 색인 md5 `740a57da2faa078fe6435867a71ba25a` · `git status --short` 는 `.build/` 한 줄. 끝 값은 «끝» 에.

실 Chrome 판은 `apps/web/build-test/admin-subpage.test.ts` 와 같은 정적 판이다 — `LayoutFrame` + `ADMIN_V0` 를 SSR 로 그려 SDK 기본 CSS · 테마 CSS(파일) ·
토큰 시트 차례로 싣고 `/Applications/Google Chrome.app` 헤드리스로 연다. 스크래치 vitest 설정(`root` = 체크아웃, `vitest.browser.config.ts` 를 펼침)으로
돌렸고 테스트 글롭에는 안 넣었다. 원문은 «탐침 원문» 절.

## 요약

| # | 무엇 | 무게 | 길 |
|---|---|---|---|
| F1 | 브레드크럼브 칸이 끊을 자리 없는 긴 이름에서 본문 칸 · 창을 넘친다(문서 폭 390 → 500 · 720 → 756) | 중간(꼴은 높음 — 글이 창 밖) | 새 장치 |
| F2 | GNB 메뉴 줄이 넘치면 스크롤바 없이 잘리고 «더 있다» 표지가 없다 — 창 720 에서 흔한 7 메뉴 중 2 개 · 고른 메뉴가 안 보인다 | 중간(PPTX 720 에서 높음 후보 — lx 합친 판에서 확정) | 새 장치 |
| F3 | 틀이 창 높이를 안 채운다 — 짧은 페이지에서 LNB · 회색 바탕이 중간에서 끊긴다 | 낮음 | 새 장치 |
| F4 | lms-skala 와 값이 갈리는 셋 — 본문 아래 패딩 24(원본 60) · 제목 색 #333(원본 #1A1A1A) · 깊이 5 이하가 깊이 4 와 같은 들여쓰기 | 낮음 | 새 장치(결정의 몫) |

높은 무게(앞 판 그림이 바뀜 · 캔버스 멈춤 · 판 체크섬 틀림)는 재현 못 했다 — 7 항목 나머지는 다 맞았다(아래).

## 1 · lms-skala 와 맞는가 — 맞음

창 1280 · 기본 토큰 · 기본 메뉴(뿌리 셋 · 하위 메뉴 · 지금 페이지 «공지사항»)의 실 Chrome 계산값:

| 자리 | 2.2.0 | lms-skala(`_tokens` · `_header` · `_lnb` · `_content`) |
|---|---|---|
| GNB 높이 | 60 | `$header-height: 60px` |
| LNB 폭 | 240 | `$lnb-width: 240px` |
| 고른 GNB 링크 | rgb(10,120,216) · 700 · 15px · 다른 링크 rgb(102,102,102) · 400 | `$c-primary` · 700 · 15px · `$c-neutral-strong` |
| 막대 `::after` | 높이 3px · bottom 2px · left/right 8px · 주색 | 같은 값 |
| LNB 고른 줄 | 바탕 rgb(216,233,250) · 주색 · 700 | `$c-bg-active: #D8E9FA` |
| LNB 둘째 단 | padding-left 12 · 14px · 위 10 · 오른 20 | `10px 20px 10px 12px` · 14px |
| 셋째 단 | padding-left 34px · 13px · 하위 바탕 rgb(243,244,246) | 34px · 13px · `$c-bg-sub: #F3F4F6` |
| 본문 패딩 | 24 / 28 / **24** / 28 | `24px 28px 60px` (F4) |
| 틀 바탕 | rgb(243,244,246) | #F3F3F3(보고 결정 2 — 한 단계 차) |
| 브레드크럼브 | 12.5px · gap 6 · 아래 8 · rgb(102,102,102) · 구분 `>` 셋 · 구분 색 rgb(153,153,153) · 마지막 600 rgb(51,51,51) | 12.5px · 6 · 8 · `$c-placeholder` · `b` 600 `$c-text` |
| 제목 | 22px · 700 · 아래 20 · rgb(51,51,51) | 22px · 700 · 20 · `$c-text-strong: #1A1A1A` (F4) |

**토큰을 따라가는가** — `semantic.primary` #ff0000 · `primarySoft` #00ff00 · `space.unit` 5px · `typography.body.fontSize` 15px · `semantic.canvas` #123456
판: 고른 GNB 글 · 막대 rgb(255,0,0) · GNB 글 17px · 막대 들임 10px · LNB 고른 바탕 rgb(0,255,0) · 둘째 단 15px/16px · 셋째 단 42.5px/15px · 하위 · 틀 바탕
rgb(18,52,86) · 본문 패딩 30/35 · 브레드크럼브 14.5px · gap 7.5 · 제목 24px · 아래 25 — 다 따라간다. GNB 60 · LNB 240 은 그대로다(밀도와 무관한 상수 — 보고 결정 2, 토큰이 아니다).

## 2 · 영역 끄기 — 맞음

기본 메뉴 · 작은 문서(조회 폼 · 카드 둘)로 넷 각각 · 넷 다 끈 판 × 창 390 · 720 · 1280. `content` 상자 [left, top, width, height]:

| 끈 것 | 1280 | 720 | 390 |
|---|---|---|---|
| 없음 | [240, 60, 1040] | [240, 60, 480] | [0, 370, 390](LNB 가 위) |
| gnb | [240, **0**, 1040] | [240, 0, 480] | [0, 310, 390] |
| lnb | [**0**, 60, 1280] | [0, 60, 720] | [0, 60, 390] |
| breadcrumb | 첫 노드 top 159 → 133 | 같음 | 같음 |
| title | 첫 노드 top 159 → 111 | 같음 | 같음 |
| 넷 다 | [0, 0, 1280] · 첫 노드 (28, 24) | [0, 0, 720] · (28, 24) | [0, 0, 390] · (12, 16) |

18 판 모두 문서 `scrollWidth` = 창 · 글자 노드 `Range` 오른끝 넘침 0(LNB 안 글은 LNB 끝 · 본문 글은 본문 칸 끝과 견줌). 남는 `LayoutRegion` 목록이 끈 것만큼
줄었다. 예제 장 넷(`EXAMPLE_PAGES` · `EXAMPLE_MENU`) × 같은 창 셋도 넘침 0(구르는 상자 안 글 — 그리드 `scroll` · GNB — 은 상자째).

## 3 · 긴 사람 글

픽스처 — 뿌리 메뉴 이름 `LONG`(끊을 자리 없는 영문 85 자), 하위 메뉴 U+202E 이름, 깊이 3 · 4 · 5 메뉴 `셋째LONG` · `넷째LONG` · `다섯째LONG`, 지금 페이지 `LONG×2`,
둘째 뿌리 띄어 쓰지 않은 한글 39 자.

- **LNB 머리 · 항목 · 제목** — 넘침 0(`overflow-wrap: anywhere`). 깊이 표지는 2 · 2 · 3 · 3 · 4 · 4 · 4 — 깊이 5 메뉴와 그 아래 페이지가 깊이 4 와 같은 46px(F4).
- **U+202E** — `buildLayoutNav` · `LayoutFrame` 이 이름마다 `isolateBidi` 를 지나 FSI · PDI 로 가둔다. 창 1280 의 x 차례: 브레드크럼브 «홈» 268 · `>` 284 ·
  이름 298 · `>` 368 · 지금 페이지 382 / GNB 이름 79 · 뒤 메뉴 188 — 뒤 글자가 앞으로 안 온다.
- **F1 브레드크럼브** — 아래.
- **F2 GNB** — 아래.

### F1 브레드크럼브가 넘친다 — 중간

| 창 | 문서 `scrollWidth` | 넘친 글(오른끝 → 끝) |
|---|---|---|
| 390 | 1035 | `LONG` 칸 · `셋째…` · `넷째…` · `다섯째…` → 500 (본문 칸 끝 391) · 지금 페이지 → 1035 |
| 720 | 1291 | 같은 넷 → 756 (721) · 지금 페이지 → 1291 |
| 1280 | 1291 | 지금 페이지(`LONG×2` 170 자) → 1291 (1281) |

이름 하나(`LONG` 메뉴 · 지금 페이지 «목록»)만 둔 판: 390 → 문서 500, 720 → 756, 1280 → 0. 넘친 글의 가운데 `elementFromPoint` 는 그 글 자신(가려지지 않음 — 창 밖에
선다). 문턱(창 720 · 본문 칸 안 424px): 끊을 자리 없는 40 · 55 · 60 · 70 자는 안 넘침(오른끝 566 · 657 · 680 · 681) — 대략 74 자부터다.

**원인** — `crumb` · `crumbCurrent` 조각에 `overflow-wrap` · `min-width: 0` 이 없다(제목 · LNB 는 `overflow-wrap: anywhere` 가 있다). 탐침에서
`[data-wb-layout="subpage"] [data-wb-part="crumb"], … [data-wb-part="crumbCurrent"] { overflow-wrap: anywhere; min-width: 0 }` 를 덧붙이면 세 창 다 문서 폭 = 창 ·
넘침 0. flex 항목의 자동 최소 폭이 낱말 폭이라 `flex-wrap` 만으로는 안 꺾인다.

`admin-subpage.test.ts` 의 넘침 케이스는 `LONG` 이 51 자라 창 390 · 720 의 본문 칸 안에 들어 이 판을 안 낸다(브레드크럼브 칸 문턱 아래). 무게: 끊을 자리 없는
74 자 이상의 메뉴 · 페이지 이름은 드물다 — 그래서 «높음» 이 아니라 «중간» 으로 적는다. 글이 창 밖으로 나가 PPTX(720)에서는 잘린다.

### F2 GNB 메뉴 줄이 표지 없이 잘린다 — 중간

GNB 메뉴 줄은 `overflow-x: auto` · `scrollbar-width: none` 이다 — 넘친 메뉴는 굴려야 보이고 «더 있다» 는 표지가 없다. lms-skala 는 같은 감춘 스크롤에 오른쪽
흐림(`.adm-gnb-wrap.has-more-right::after` — 주석 «이게 없으면 '잘렸다'로 보인다»)을 둔다.

| 판 | 메뉴 줄 폭 | `scrollWidth` | 보이는 링크 | 고른 메뉴 |
|---|---|---|---|---|
| 흔한 한글 7 메뉴(홈페이지관리 · 사용자관리 · 교육운영관리 · 과정관리 · 통계 · 게시판관리 · 시스템관리) · 창 720 | 524 | 648 | 5 / 7 | 마지막(시스템관리) — 안 보임 |
| 같음 · 창 1024 | 828 | 829 | 7 / 7 | 보임 |
| 메뉴 30 · 창 720 | 524 | 2550 | 6 / 30 | 26 번째 — left 2188, 그 자리 `elementFromPoint` = `gnb` 바탕 |
| 메뉴 30 · 창 1280 | 1084 | 2550 | 13 / 30 | 안 보임 |
| 기본 메뉴 셋 · 창 390 | ~150(로고 · 사용자 칸 사이) | — | 1 / 3 | — |

GNB 높이는 늘 60, 문서 폭은 창 그대로(넘침이 창을 안 넓힌다 — 의도대로). 문제는 정적 판이다 — PPTX 캡처 폭이 720 그대로라(사용자가 정한 것) 7 메뉴 프로젝트의
모든 서브페이지 장에서 GNB 의 끝 둘과 고른 막대가 안 서고, 그림에는 굴릴 길도 표지도 없다. 번들(lx) · PPTX 가 틀을 그린 합친 판에서 그림으로 확정할 것 —
이 브랜치의 정적 판에서는 «높음» 후보로만 적는다.

### F3 틀이 창 높이를 안 채운다 — 낮음

창 1280×900: 작은 문서의 틀 높이 477 · LNB 417, 예제 «주문 상세» 틀 436 · LNB 376 — 그 아래는 `body` 흰 바탕이다. 원본 셸은 LNB 가 창 끝까지 선다. 캔버스 · 번들이
틀을 그린 판(lc · lx)에서 iframe · 장 높이가 문서 높이면 안 보이고, 창이 더 크면 보인다.

### F4 lms-skala 와 갈리는 값 — 낮음

- 본문 아래 패딩 24(`var(--wb-space-6)`) — 원본 `.adm-content { padding: 24px 28px 60px }` 의 60.
- 제목 · 고른 탭 · 사용자 이름 색 `semantic.textStrong` = `var(--wb-semantic-text)`(#333) — 원본 `$c-text-strong: #1A1A1A`. 테마의 토큰 기본값 몫이다(2.2.0 이 바꾼 것 아님).
- `LnbList` 가 깊이를 4 에서 자른다(`Math.min`) — 깊이 5 이하가 깊이 4 와 같은 46px · 12.5px 로 서 단이 안 갈린다. 원본은 4 단까지다.

## 4 · 2.1.0 규칙과의 맞물림 — 맞음

- `[data-wb-layout-content]` 의 `display` = `contents` · 문서 뿌리의 부모가 그 상자다.
- 페이지 뿌리에 곧바로 든 조회 폼 · 카드 둘: margin-top 0 · margin-bottom 8px · 테두리 1px · 흰 바탕(top 159/262/357 · 틈 8). skt 의 «뿌리 8px» 은
  `[data-wb-component="Page"] > …` 라 틀이 끼어도 그대로다.
- 틀 규칙이 노드 조각에 닿는지 — 테마 CSS 에서 조각 이름으로 **시작**하는 셀렉터(조상 없음)를 셌다: 다섯, 전부 `:not(…)` 안의 조각(`radio` · `filler` ·
  `limitSize`)이다. 틀 조각(`frame` · `gnb` · `body` · `content` · `title` · `logo` · `user`)을 맨 이름으로 겨누는 앞 판 규칙은 없다. SDK 기본 레이아웃 CSS 는
  `[data-wb-layout-content]` · `[data-wb-layout="popup"]` 둘뿐이다.
- **팝업 레이아웃 페이지** — 예제 «주문 삭제»(`EXAMPLE_POPUPS[0]`)를 `LayoutFrame layout="popup"` 으로 창 1280×700 에 그려, 테마 CSS 만 main 의
  `theme.css`(2.1.0)와 이 브랜치(2.2.0)로 갈아 찍었다: PNG 바이트가 같다(13937 · 13937 · `Buffer.equals` 참). 2.2.0 이 더한 셀렉터는 33 개 전부
  `[data-wb-layout="subpage"]` 로 시작하고(그 밖은 `:root` 의 `--wb-layout-*` 다섯), 레이아웃 뷰도 `subpage` 하나라 팝업 · 빈 레이아웃은 바뀔 길이 없다.
- 덮개 층 팝업 — 갤러리 `ThemeExamples` 는 `PopupLayer` 를 `LayoutFrame` 의 형제로 둔다(틀 밖). 픽셀로 견주지 않았다 — 2.1.0 예제는 문서 안 틀이 달라
  같은 판이 아니다. 덮개가 보이는 구간에 서는지는 구현 보고의 `rv-pv-preview` · `theme-preview` 20/20 이 2.2.0 시딩 판으로 쟀다.

## 5 · 형제 구조 금지 — 0

`theme.css` 에서 주석을 걷고 `[data-wb-layout` 이 든 셀렉터 33 개를 모아(`@media` 안 셋 포함) 속성 값(`[…]`)을 `[]` 로 걷은 뒤
`/[+~]|:(first|last|nth|only)-|:has\(|:empty|:not\(/` 로 셌다: **0**. 자의 구분력 — `…[data-wb-part="a"]+[data-wb-part="b"]`(공백 없는 결합자) · `*~*` 는
참, `[data-wb-part~="x"]`(속성 값 안의 `~`)는 거짓.

**한계(남은 것)** — 끌기 훑기의 서브페이지 판 둘(`admin-drag-sweep.test.ts`)은 이 브랜치에서 틀을 안 지난다: `git grep -n LayoutFrame -- apps/web/src packages/exporter/src`
가 0 건이다(캔버스는 T6 · lc). 그 판은 빈 화면 판과 같은 DOM 이고, 틀에 형제 셀렉터 배치 규칙을 넣은 변조(구현 보고 J6)는 jsdom `admin.test.ts` 만 죽인다. lc 병합 뒤
그 판에 틀 카나리아(`[data-wb-layout="subpage"]` 가 캔버스에 섰다)를 달고 J6 꼴 변조로 그 판이 죽는지 한 번 돈다.

## 6 · 예제 장 — 장 이동 · 옮긴 케이스

- 문서 안 이음(장 넷 · 팝업 하나): 대시보드 → 주문 목록(`ex-d-all` «전체 보기») · 대시보드 표의 주문번호 → 주문 상세 · 목록의 «주문 등록» → 주문 등록 · 상세의
  «목록» · «수정» · «삭제»(팝업) · 등록의 «취소» · «저장» · 팝업 «삭제» → 목록. **대시보드로 가는 문서 안 이음은 없다** — 레이아웃 뷰가 없는 테마(2.1.0 이하 · 작성자
  템플릿)에서는 호스트의 장 이름 줄로만 간다(낮음 · 결정 3 의 몫 — 장 이름 줄이 늘 있다).
- 작성자 템플릿 판 — `packages/theme-kit/build-test/template.test.ts` 혼자 1 회: 통과 10 · 실패 0 · 건너뜀 1(`WB_TEMPLATE_INSTALL=1` 갈래), «템플릿이 그대로 wb-theme check 를
  지난다» 초록.
- **옮긴 케이스가 옛 성질을 잃지 않았나** — `apps/web/test/settings/theme-preview.test.tsx` «예제 안의 이동이 장 이름 줄을 따라 바꾼다»(옛: `ex-l-go-orders` · 새: `ex-d-all`).
  변조 M6: `packages/theme-gallery/src/examples/theme-examples.tsx` 의 `navigate` 갈래 `if (next.id !== shown.id) props.onPageChange(next.id)` 를 `void next` 로(맞은 수 1).
  옛 판은 main 의 케이스 파일과 main 의 `documents.ts` 를 같은 자리에 끼워 돌렸다(세 파일 백업 · 바이트 비교 복원 — 끝에 `git status` 깨끗).

  | 판 | 변조 없음 | M6 |
  |---|---|---|
  | 이 브랜치(새 케이스 · 새 문서) | 통과 1 | 실패 1 — `expected 'dashboard' to be 'orders'` |
  | main(옛 케이스 · 옛 문서) | 통과 1 | 실패 1 — 같은 값 |

  둘 다 재려던 값(보인 장)으로 죽는다. 실브라우저로 옮긴 `rv-pv-preview` · `theme-preview` · kit `dev.test.ts` 는 이 차수에 안 돌렸다(구현 보고의 둘째 게이트 초록).

## 7 · 판 · 체크섬 · 시딩 — 맞음

- `pnpm --filter @wirebound/system-theme-admin build`(머리 `4084dfe9`) → `system-admin-2.2.0.wbtheme` sha256 `8389108177c23435359c1f466e1680ef7af50aab5fc447172ac8a30f9667449b`
  = `checksums.json` 2.2.0 줄.
- `git diff main...HEAD -- system-themes/admin/checksums.json` — 2.1.0 줄은 값이 같고 쉼표만 붙었다.
- `packages/test-support/src/system-admin.ts` 는 판을 산출물 manifest 에서 읽는다(`readManifest(theme).version`) — 빌드 뒤 2.2.0.
- `pnpm -C system-themes/admin check` — «갤러리 칸 130 개 · ✓ 오류 없음».
- 스타터 템플릿 `check` — 6 의 template 판.

## 탐침 원문

스크래치 설정(`vitest.probe.config.ts`, 스크래치에 `apps/web/node_modules` 심링크):

```ts
import base from '/Users/jang2162/orca/workspaces/wirebound/feat-layout-subpage/vitest.browser.config.ts'
import { defineConfig } from 'vitest/config'
export default defineConfig({ ...base, root: '<체크아웃>', test: { ...base.test, dir: '<스크래치>/probe', include: ['**/*.probe.ts'], exclude: ['**/node_modules/**'], maxWorkers: 1 } })
```

판 짓기(셋 다 공용):

```ts
const LONG = 'Administrationconsolesettingsandpermissionsoverviewforallregisteredorganizationunits' // 85자
const KLONG = '홈페이지운영관리및게시판권한설정종합관리화면메뉴이름이매우깁니다'
const RLO = /* U+202E 한 글자 */ RLO_CHAR + '정상메뉴' + 'abc'
function html(o: Opt = {}): string {
  installCatalog()
  const markup = renderToStaticMarkup(h(LayoutFrame, { theme: ADMIN_V0, layout: 'subpage', title: current.title,
    nav: buildLayoutNav(menu, current), hiddenRegions: o.hidden ?? [], children: renderDocument(o.doc ?? DOC, { theme: ADMIN_V0 }) }))
  const tokens = tokensCss(ADMIN_V0.manifest, o.tokens ?? {}).css
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${defaultViewsCss()}</style><style>${THEME_CSS}</style><style>${tokens}</style><style>body{margin:0}${o.extraCss ?? ''}</style></head><body>${markup}</body></html>`
}
// 열기: browser.newPage({ viewport: { width, height: 900 } }) → page.setContent(html(o))
// DOC: Page > SearchForm(columns 2 · 칸 둘 · 검색 단추) · Card «결과» · Card «둘째»
// 기본 메뉴: m1 «홈페이지 관리»(배너관리 · 하위 m2 «게시판관리»(공지사항 · 하위 m3 «답글»)) · «사용자 관리» · «교육운영», 지금 페이지 p-list «공지사항»
```

넘침 셈(브리프 2 · 3):

```ts
// 글자 노드마다 Range.getClientRects() 오른끝. overflow-x 가 auto|scroll|hidden 인 가장 가까운 조상이 있으면 그 상자 끝과 견줘 «상자 안 숨음» 으로 따로 세고,
// 없으면 LNB 안은 LNB 끝 · 본문 안은 min(창, 본문 칸 끝) · 그 밖은 창 끝(+0.5)과 견준다. 넘친 글은 마지막 rect 가운데의 elementFromPoint 로 가려짐을 본다.
// 문서 폭은 document.documentElement.scrollWidth.
```

GNB(F2): 메뉴 줄 `[data-wb-part="gnbNav"]` 상자와 각 `gnbLink` 상자를 견줘 `right <= nav.right + 0.5` 인 수 · `nav.scrollWidth` · 고른 링크 가운데(창 안으로 자름)의
`elementFromPoint`. 팝업(4): `EXAMPLE_POPUPS[0].document` 를 `LayoutFrame layout="popup"` · `buildLayoutNav(EXAMPLE_MENU, { id: 'order-delete', … })` 로 그리고
테마 CSS 자리만 `git show main:system-themes/admin/src/theme.css` 와 갈아 `page.screenshot()` 두 장을 `Buffer.equals`. 인구조사(5)는 파이썬 — 주석 `/\*.*?\*/` 를 걷고
`([^{}]+)\{` 머리 가운데 `@` 로 시작하지 않는 것을 쉼표로 갈라 모았다.

## 게이트

리뷰라 전량 게이트는 안 돌렸다(구현 보고의 두 판). 돌린 것: 탐침 셋(실 Chrome · 27 + 20 + 6 케이스 · 다 돎) · `theme-preview.test.tsx` 한 케이스 × 4 판(통과 + 실패
= 1 씩) · `template.test.ts`(통과 10 · 건너뜀 1) · `system-themes/admin` 빌드 · check. 시작 load 11.31 · template 판 앞 19.33(코어 15 · 45 아래). 게이트 자리는 안
썼다. `pmset` 잠듦 — 탐침 시각(01:49 – 01:56) 무렵 Sleep 줄을 따로 안 맞춰 봤다: 값은 시간과 무관한 계산값이라 버릴 판이 없다.

## 남은 것

- F1 · F2 · F3 · F4 — 고칠지 정하는 것은 코디네이터 · 사용자 몫. F1 은 조각 두 셀렉터에 `overflow-wrap: anywhere; min-width: 0` 이 탐침에서 닫았다(판이 바뀌므로
  2.2.0 체크섬 다시 짓기와 함께). F2 는 PPTX 720 을 둔 채면 원본의 «더 있음» 흐림 같은 그림 표지가 필요하다 — 정적 판에서는 스크롤 위치로 붙이는 원본의 기전이 안 선다.
- 5 의 한계 — lc 병합 뒤 끌기 훑기 서브페이지 판의 틀 카나리아 · J6 꼴 변조.
- 2 · 3 의 720 판은 정적 판이다 — 번들 · PPTX(lx)가 틀을 그린 합친 판에서 F2 를 그림으로 확정한다.

## 지침

- 고칠 지침 없음.

## 끝

추적 파일 색인 md5 — 커밋 전 `740a57da2faa078fe6435867a71ba25a`(시작과 같음 — 다른 쓰는 자 없음). 이 보고 커밋 뒤 `git status --short` 는 `.build/` 한 줄. 이
워크트리 경로의 vitest · Chrome · dev 서버 프로세스 0(`ps`). 자기 DB 컨테이너는 남긴다.
