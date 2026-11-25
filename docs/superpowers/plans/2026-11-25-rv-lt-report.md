# rv-lt 보고 — 레이아웃 T4(테마 계약) 반증 리뷰

브리프: 코디네이터 `brief-rv-lt.md`. 대상 `feat/layout-theme` 머리 `effbafae`(구현 보고 `docs/superpowers/plans/2026-11-25-lt-report.md`). 판 Node v24.21.0(`mise env`). **고치지 않았다** — 소스 변조 없음(탐침은 모두 스크래치패드의 별도 vitest 설정 · `root` 는 체크아웃).

다른 쓰는 자: 시작 때 `orca terminal list` 의 이 워크트리 터미널 둘은 셸(에이전트 없음). 추적 파일 색인 md5 `be401886b2677ff9638b241ce33876f5` · `git status --short` 0 줄 — 시작 · 끝(보고 커밋 전) 같다. 끝에 이 워크트리 경로의 vitest · vite · tsx 프로세스 0. 실브라우저 탐침 동안 `gate-slots/rv-lt` 를 두었고(다른 자리 0 · load 1분 2.3 – 4.3) 끝에 지웠다.

## 요약

| # | 무엇 | 무게 | 새 장치가 연 길? |
|---|---|---|---|
| F1 | `wb-theme check` 를 오류 0 · 경고 0 으로 지나면서 페이지 내용이 사라지거나 두 번 서는 레이아웃 뷰 넷(V1 · V2 · V4 · V6) | **중간(지금) · T6 에서 높음** | 새 길 |
| F2 | `LayoutLink` 가 메뉴 · 페이지 이름을 격리 없이 그려, 방향 제어 글자(U+202E)가 든 메뉴 제목이 뒤따르는 구분 글자 · 지금 페이지 이름의 차례를 뒤집는다(실 Chromium) | 중간 | 새 길 |
| F3 | 빈 `LayoutRegion` 을 두고 진짜 GNB 는 그 밖에 그린 뷰가 check 를 지나 «끔» 이 아무것도 안 끈다(V3) | 낮음 | 새 길 |
| F4 | `p.lnb.children` 처럼 «페이지가 메뉴에 든다» 에 기댄 뷰가 check 를 지난다 — 메뉴 밖 페이지에서 던져 기본 틀로 떨어진다(V5) | 낮음 | 새 길 |
| F5 | 스타터 템플릿이 그대로 `wb-theme check` 를 못 지난다 — 안 쓰는 토큰 `density` | 낮음 | **원래 있던 길**(이 브랜치는 템플릿 manifest 의 토큰을 안 건드렸다) |

**높음 없음** — 앞 판 고정 프로젝트의 그림은 안 바뀌었고(항목 1), 캡처 · `@layer` · 판 · 체크섬은 맞다(항목 5 · 6). 다만 F1 은 T6(캔버스가 `LayoutFrame` 으로 감쌈)이 들어오는 순간 «캔버스 노드가 사라짐 / 겹침» 이 되는 길이라, T6 전에 check 를 넓히는 것을 권한다.

## 1 · SDK 기본 CSS 를 바꾼 트랙 — 앞 판 고정 프로젝트

**캔버스 · 번들 · PPTX 는 이 브랜치에서 `LayoutFrame` 을 안 지난다** — `git grep -n "LayoutFrame\|LayoutHostContext" -- 'apps/**' 'packages/**' ':!**/test/**'` 의 쓰는 자리는 `packages/theme-gallery/src/examples/theme-examples.tsx`(예제 장) · `packages/theme-kit/src/check.ts` 둘뿐이다(`apps/` 0). 새 SDK 규칙 둘(`[data-wb-layout-content]` · `[data-wb-layout="popup"]`)과 캡처 규칙은 그 속성을 겨누므로, 그 속성이 없는 캔버스 · 번들 · PPTX 에는 구성상 안 닿는다(구현 보고의 `bundle-stateless-bytes` 페이지 HTML 해시 불변과 같은 결론). 그래서 실측은 **이 브랜치에서 그림이 실제로 바뀌는 자리 — 테마 미리보기의 예제 장** 으로 했다.

**예제 장 A/B(실 Chromium · `editor-stack`)** — 얼린 1.5.0 · 1.6.0 · 1.7.0 을 `theme_packages` 에 넣고 지금 판 2.1.0 과 함께 프로젝트마다 고정 · 창 1600×1000 · 설정 «테마» 의 «예제 페이지» 장 넷. 장마다 ① 그대로 잰 `[data-wb-id]` 상자 전부(0.5px 반올림)와 iframe 스크린숏 sha1 ② `[data-wb-layout]` 를 그 `[data-wb-layout-content]` 의 자식들로 바꿔 끼운 판(= main 의 DOM 꼴 — main 은 `renderDocument` 결과를 `[data-wb-examples]` 에 곧바로 두었다)에서 같은 셈.

| 판 | 장 | 노드 | 내용 상자 `display` | 벗긴 틀 | 상자 차이 | 스크린숏 같음 | 카나리아 |
|---|---|---|---|---|---|---|---|
| 1.5.0 · 1.6.0 · 1.7.0 · 2.1.0 | 대시보드 · 주문 목록 · 주문 상세 · 주문 등록 | 80 · 103 · 31 · 42 | `contents` | 1 | **0** (16 판 모두) | 참 (16) | 80 · 103 · 31 · 42 |

- 카나리아: 벗긴 판에서 뿌리 앞에 1px 상자를 끼우면 그 장의 노드 상자가 전부 바뀌었다(위 수) — 자가 1px 를 본다.
- 판이 섰는지: iframe 의 테마 시트 주소가 `…/system-admin/<판>/files/theme.css` 로 판마다 달랐고, 대시보드 상자 해시가 1.5.0 = 1.6.0 `755dc2d1b4` · 1.7.0 `6386ff4ac4` · 2.1.0 `a2eefa0313` 로 갈렸다(같은 판을 네 번 잰 것이 아니다).
- 팝업: 예제의 팝업은 `PopupLayer`(덮개 층)로 서고 `LayoutFrame` 을 안 지난다 — 렌더러 diff 는 `layout-frame.tsx` · `index.ts` 뿐이라 덮개 층과 막이 안 겹친다.
- **안 잰 것:** 2.0.0(얼린 산출물이 없다 — 2.1.0 과 1.7.0 사이 판). 0.1.0. 번들 · PPTX 의 픽셀 A/B 는 위 까닭(구성상 안 닿음)으로 안 돌렸다 — T6 · T8 이 감싸기를 넣을 때 그 트랙이 잰다.

탐침 원문(요지 — `scratchpad/b/preview-ab.probe.ts`):

```ts
const MEASURE = `(() => { const out = {}; for (const el of document.querySelectorAll('[data-wb-id]')) { const r = el.getBoundingClientRect();
  out[el.getAttribute('data-wb-id') + '#' + (out[el.getAttribute('data-wb-id')] ? 2 : 1)] = [r.x, r.y, r.width, r.height].map((v) => Math.round(v * 2) / 2).join(',') } return out })()`
const UNWRAP = `(() => { let n = 0; for (const f of [...document.querySelectorAll('[data-wb-layout]')]) {
  const c = f.querySelector('[data-wb-layout-content]'); if (!c) continue; f.replaceWith(...c.childNodes); n++ } return n })()`
// 판마다: insert into theme_packages(…얼린 .wbtheme…) → themeProject → putTheme(version) → /projects/<id>/settings?section=theme
// → «미리보기 보기» 예제 페이지 → 장 단추 → 800ms · fonts.ready → MEASURE + iframe screenshot → UNWRAP → 두 프레임 → MEASURE + screenshot
```

## 2 · `LayoutFrame`

- 던지는 뷰: 구현 케이스 그대로 맞다(`data-wb-error` · 기본 틀). 노드 뷰가 던지는 것은 노드마다의 경계(`packages/renderer/src/view-host.tsx`)가 먼저 받아 틀의 경계까지 안 온다.
- `children` 을 안 두거나 두 번: **다 켠 판의 내용 수만 센다** — 끈 판 · 다른 내비에서의 수는 안 센다. → F1.

## 3 · `LayoutLink` · `LayoutRegion`

**F2 — 방향 제어 글자(중간 · 새 길).** `LayoutLink` 는 `children ?? item.title` 을 `<a>` 에 그대로 둔다(`packages/theme-sdk/src/layout.tsx`). `<a>` 는 bidi 격리가 아니라, 짝 없는 U+202E 가 요소 끝을 넘어 문단 끝까지 간다. 지침 「사람이 지은 이름을 다른 글에 이어 붙이는 새 자리는 `isolateBidi` 를 지나게 하고, U+202E 를 든 제목으로 그 뒤 글자의 x 차례를 실브라우저에서 잰다」.

SKILL.md 가 권하는 꼴 그대로(«이름마다 따로 요소로 둔다») — 브레드크럼브 `trail.flatMap((i, n) => [n > 0 ? <span> > </span> : null, <LayoutLink item={i}/>])`, 메뉴 제목 «주문 + U+202E + AB», 지금 페이지 «목록XY». 실 Chromium(headless shell 1234 · 16px sans-serif)에서 글자마다 `Range` 의 x:

| 판 | 주 | 문 | A | B | > | 목 | 록 | X | Y |
|---|---|---|---|---|---|---|---|---|---|
| 그대로(`LayoutLink` 기본) | 8 | 22 | **114** | **103** | **89** | **71** | **57** | **46** | **36** |
| `<a>` 안을 `<bdi>` 로 감싼 판 | 8 | 22 | 46 | 36 | 61 | 75 | 89 | 103 | 114 |

그대로인 판은 메뉴 제목 뒤의 구분 글자와 **다른 항목(지금 페이지 이름)까지** 오른쪽에서 왼쪽으로 뒤집혀 선다. `<bdi>` 판은 뒤집힘이 제 이름 안에 갇힌다. «따로 요소로 둔다» 는 막지 못한다 — SKILL.md 의 그 문장은 틀렸다. SDK 는 schema 를 못 싣지만 `LayoutLink` 가 기본 글을 `<bdi>` 로 감싸면 된다(뷰가 `children` 을 준 판은 작성자 몫 — SKILL.md 를 «`<bdi>` 로 감싼다» 하나로). 지금은 레이아웃 뷰를 내는 테마가 없어(기본테마 2.1.0 · SDK 기본 = 내용만) 사용자 화면에 안 선다 — 테마를 올린 사람 · T9 의 기본테마부터 선다.

```ts
const RLO = String.fromCharCode(0x202e)
const crumbs = (p) => h('div', null, h('nav', { id: 'bc' }, p.trail.flatMap((i, n) => [n > 0 ? h('span', { key: 's' + n }, ' > ') : null, h(LayoutLink, { key: i.id, item: i })])), p.children)
const menu = [{ id: 'm1', title: `주문${RLO}AB`, pages: [{ id: 'p1', title: '목록XY', layout: 'subpage' }], children: [] }]
// renderToStaticMarkup(LayoutFrame{ layouts.subpage: crumbs, nav: buildLayoutNav(menu, { id: 'p1', … }) }) → page.setContent
// → nav#bc 의 글자 노드마다(공백 · U+202E 빼고) Range(t, i, i + 1).getBoundingClientRect().x
// 대조: html.replace(/(<a [^>]*>)(.*?)(<\/a>)/g, '$1<bdi>$2</bdi>$3')
```

- `pageId: null` → `<span aria-disabled>` · 지금 페이지 `aria-current="page"` — 구현 케이스대로 맞다.
- **위험한 `href` 길 없음** — `href` 는 호스트 함수(`LayoutHost.href`)의 값만 실리고 뷰의 나머지 속성(`...rest`)보다 뒤에 펴져 뷰가 덮지 못한다. 호스트가 안 주면 `#`. (뷰의 `onClick` 도 같은 까닭으로 덮인다 — 테마가 제 누름 처리를 못 단다. 결함 아님 · 낮음 메모.)
- 끈 영역은 `null` 을 돌려 **DOM 에서 빠진다**(숨김 아님) — 탐침 `offGnb` · `offTitle` 판의 HTML 에서 그 영역 속성 0.

## 4 · manifest `layouts` · `wb-theme check`

**F1 — check 를 지나는 계약 위반(중간 · T6 에서 높음 · 새 길).** 지침 «기본 뷰를 한 곳만 바꾼 테마 뷰로 깬다» 대로, 구현 케이스의 서브페이지 뷰 꼴에서 한 곳씩 바꿨다. manifest `layouts.subpage.regions = [gnb, title]`(둘 다 끌 수 있음). 각 뷰를 `checkTheme` 에 번들로 넣은 결과와, 같은 뷰를 `LayoutFrame` 으로 그려 센 내용 상자 수 · 문서 뿌리(`data-wb-id="<root>"`) 수:

| 뷰 | check 오류 · 경고 | 다 켬 | `gnb` 끔 | `title` 끔 | 메뉴 밖 페이지 |
|---|---|---|---|---|---|
| C0 대조 — `children` 없음 | **오류 1**(«두지 않았습니다») | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 |
| V1 `children` 을 끌 수 있는 영역 `title` 안에 둠 | 0 · 0 | 1 · 1 | 1 · 1 | **0 · 0** | 1 · 1 |
| V2 `p.lnb !== null ? children : null` | 0 · 0 | 1 · 1 | 1 · 1 | 1 · 1 | **0 · 0** |
| V4 `p.regions.gnb !== false ? <R gnb/> : children` + `children` | 0 · 0 | 1 · 1 | **2 · 2** | 1 · 1 | 1 · 1 |
| V6 `children` 대신 빈 `<div data-wb-layout-content>` | 0 · 0 | 1 · **0** | 1 · 0 | 1 · 0 | 1 · 0 |

(«메뉴 밖 페이지» = `buildLayoutNav(EXAMPLE_MENU, { id: 'not-in-menu', … })` — 메뉴 트리에 안 든 페이지. 실제 프로젝트에 흔하다.)

- 기전: `checkTheme` 은 내용 수를 **다 켠 판 하나**(예제 첫 장 = 메뉴에 든 서브페이지)에서만 세고, 끈 판(`draw([region.id])`)에서는 영역 속성만 본다. 내용 상자를 «속성이 붙은 요소 수» 로 세어 속성 흉내(V6)도 지난다 — 구현이 영역의 속성 흉내(M13)는 막았는데 내용 쪽은 안 막았다.
- 결과: V1 은 에디터에서 그 영역을 끄면 페이지 전체가, V2 는 메뉴에 안 든 모든 페이지에서 내용이 사라진다. V4 는 끄면 노드 id 가 겹친다. **지금은** 캔버스 · 번들이 틀을 안 그려 사용자 화면에 안 선다(미리보기 예제는 `hiddenRegions` 를 안 넘기고 장이 다 메뉴에 들어 V1 · V2 · V4 가 안 선다). T6 이 캔버스를 감싸면 그대로 «캔버스 노드가 사라짐 · 겹침» 이다.
- 닫는 방향(제안 — 코디네이터 판정): 그린 판마다(다 켬 · 하나씩 끔 · 메뉴 밖 페이지 내비 · 빈 내비) 내용 상자 수와 **문서 뿌리 노드 수**(`[data-wb-id="<뿌리 id>"]`)가 정확히 1 인지 센다. 뿌리 노드로 세면 V6 이 죽는다.

**F3 — 빈 영역 + 밖의 진짜 GNB(낮음).** `h(R, { id: 'gnb' })` 를 비워 두고 GNB 링크는 그 밖 `<nav>` 에 그린 뷰 — check 오류 0 · 경고 0, 끈 판에도 `<nav>` 가 남는다(표의 `probeNav` 모든 판 참). check 는 «영역 속성이 서고 끄면 빠진다» 만 본다. 의도한 흉내라 낮음.

**F4 — «메뉴에 든다» 에 기댄 뷰(낮음).** `p.lnb.children.map(…)` — check 오류 0(검사 장이 메뉴에 든다). 메뉴 밖 페이지에서 `TypeError: Cannot read properties of null (reading 'children')` — 클라이언트에서는 `LayoutBoundary` 가 받아 기본 틀(내용만) + `data-wb-error` 로 떨어진다(내용은 산다). F1 의 «메뉴 밖 페이지 판» 을 더하면 함께 잡힌다.

**형제 구조 CSS 검사 미구현(구현 보고 «남은 것») — 지금 캔버스를 죽이는 테마 없음.** 끌기는 캔버스에서만 돌고 캔버스는 아직 틀을 안 그린다. 틀이 들어온 뒤에도 틀 CSS 가 문서 안 노드에 형제 셀렉터를 거는 것(`[data-wb-layout-content] [data-wb-component]:first-child`)은 지금 노드 뷰 CSS 의 같은 열린 성질과 같은 길이다(지침 «테마 CSS 가 배치를 형제 구조로 바꾸면 …» — 올린 테마에 열려 있음). T6 이 감쌀 때 `admin-drag-sweep` 꼴로 잰다 — 이 차수는 안 잼.

manifest 검증: `label` 은 `z.string().min(1).max(20)` 라 공백만 · 방향 제어 글자가 든 이름도 받는다(«보기» 메뉴 항목 — T6 이 그 글을 그릴 때 격리). 영역 id `constructor` · `toString` 이 꼴을 지나지만 `layoutRegions` 는 제 칸에 쓰고 `LayoutRegion` 은 `=== false` 로만 보아 무해했다(낮음 메모 · 안 잰 저장 열쇠는 T6).

## 5 · `@layer` · 캡처

- `defaultViewsCss()` 17736 자 안의 `@layer` **0** · `CAPTURE_CSS` 는 층 안(따로 싣는다) — 지침대로다.
- 실 Chromium(1280×800 · `defaultViewsCss` + `CAPTURE_CSS` + 팝업 예제 문서를 `LayoutFrame layout="popup"` 으로):

| 판 | `display` | `padding-top` | 바탕 | 상자 x · 폭 |
|---|---|---|---|---|
| 화면 | flex | 24px | rgba(0, 0, 0, 0.45) | 400 · 480 |
| 찍는 판(`html[data-wb-capture]`) | block | 0px | 투명 | 0 · 480 |
| 찍는 판 + 테마 층 밖 `!important`(padding 40px · 바탕 빨강) | block | 0px | 투명 | 0 · 480 |
| 화면 + 같은 테마 규칙 | flex | 40px | 빨강 | 400 · 480 |

캡처 규칙이 막을 실제로 안 그리고, 층 밖 `!important` 를 이긴다. 결함 없음.

## 6 · 판

- `SDK_VERSION = '1.10.0'` · `packages/theme-sdk/package.json` 1.10.0.
- 이 워크트리 `system-themes/admin/dist/system-admin-2.1.0.wbtheme` sha256 `f2da81ae5cf965d7de2030e88a946ccdccc251921c534851bd6a1173a1b0199f` = `checksums.json` 의 2.1.0 줄(`shasum -a 256`). 2.0.0 줄 그대로(`52800973…`).
- 스타터 템플릿(빌드한 kit `dist` 의 `packTemplate` → 풀어 `buildTheme` → `checkTheme`):
  - 그대로: 레이아웃 오류 0 · **안 쓰는 토큰 `density` 1 → ok 거짓**(F5). 토큰은 `theme.config.ts` 에 선언되고 SKILL.md 의 예시에만 쓰인다 — 이 브랜치의 템플릿 diff 는 `layouts` 주석 · SKILL.md 절뿐이라 원래 있던 길이다(`packages/theme-kit/build-test/template.test.ts` 는 `check` 를 안 돌린다).
  - `layouts` 주석을 풀고 `sdk: '^1.10.0'`: 레이아웃 오류 4(gnb · lnb · breadcrumb · title «LayoutRegion 으로 그리지 않았습니다») — 뷰 없이 선언만 푼 판이라 의도대로다(주석이 «뷰는 src/index.tsx 의 defineTheme({ layouts }) 로» 를 말한다).

## 지침

- **틀렸다:** `packages/theme-kit/template/SKILL.md` 「레이아웃 뷰」 의 «이름마다 따로 요소로 두거나 `<bdi>` 로 감싼다» — «따로 요소» 는 막지 못한다(F2 표). 고칠 문장: «메뉴 · 페이지 이름은 `<bdi>` 로 감싼다 — 따로 요소(`<a>` · `<span>`)는 bidi 격리가 아니라 방향 제어 글자가 요소 끝을 넘어 뒤 항목까지 뒤집는다». (템플릿 문서라 구현 트랙이 고친다 — 이 리뷰는 고치지 않음.)
- 저장소 지침(`.ruler/*`)은 고칠 것 없음.
