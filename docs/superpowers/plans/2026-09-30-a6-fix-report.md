# A6 리뷰 대응 보고 — H1 ~ H7

리뷰: `docs/superpowers/plans/2026-09-30-a6-review.md`(빨강 `apps/web/build-test/theme-system-review.test.ts`). 브랜치 `feat/a6-review`.
이 문서는 발행 시점의 기록이다(`docs/guideline/base/04-citation.md` 「이력 문서는 연대기 금지의 예외다」).

## 요약

| # | 리뷰 | 고친 자리 | 커밋 | 리뷰 빨강 |
|---|---|---|---|---|
| H1 | D1 세로 Divider | `system-themes/{commerce,docs,saas-marketing}/src/theme.css` | `bb0f00f8` | 3 → 초록 |
| H2 | D3 quirks 모드 | `apps/web/src/canvas/canvas-iframe.tsx` | `53156d71` | 1 → 초록 |
| H3 | D2 긴 낱말 | `packages/theme-sdk/src/default-views/index.ts`(`defaultViewsCss`) | `edcf15d0` | 5 → 초록 |
| H4 | D4 docs Card 마커 | `system-themes/docs/src/views/Card.tsx` | `5b1c04d2` | 1 → 초록 |
| H5 | D5 미리보기에서 안 바뀌는 토큰 | docs · saas-marketing `theme.css` · `packages/theme-gallery/src/samples.ts` | `a38fc745` | 2 → 초록 |
| H6 | G1 번들 뷰 케이스 | `system-themes/{admin,commerce,docs,saas-marketing}/build-test/bundle-views.test.tsx` | `c73e2277` | — |
| H7 | T1 shots 넘침 판정 | `packages/theme-kit/src/shots.ts` · `build-test/shots.test.ts` · 갤러리 긴 낱말 표본 | `e0f2d4b6` | — |

리뷰 케이스 **21 · 초록 21 · 빨강 0**(`pnpm test:build` 안 — 아래 게이트).

**판 · 체크섬.** 코디네이터가 사용자 DB 를 읽어 `1.0.0` 이 어디에도 시딩되지 않았음을 확인했다(`system-admin@0.1.0` 만 있다) — 그래서 판을 올리지 않고 **`1.0.0` 줄을 새 바이트로 고쳐 썼다.** 바이트가 바뀐 것은 셋이다: commerce `abb8f97f…` → `7e144fa9…` · docs `872b1639…` → `5ef3e312…` · saas-marketing `59398c7c…` → `4b348f88…`. admin(`9a34736b…`) · portal(`541cb598…`)은 그대로다 — SDK 기본 CSS(H3)는 `.wbtheme` 에 안 든다(번들의 `assets/views.css` 는 exporter 가 낸다). 이 판을 이미 넣은 DB 가 있으면 기동이 멈춘다(`apps/api/test/system-theme-checksums.test.ts` 머리말) — 없음을 전제로 한 고침이다.

## 재현

`pnpm build` 뒤 `pnpm vitest run --project build apps/web/build-test/theme-system-review.test.ts` → **21 · 빨강 12 · 초록 9** — 리뷰 값 그대로:
Divider commerce `4445 → 19445` · docs `4536 → 19416` · saas `4842 → 20935`(번들 높이 `0 · 0`) / 좁은 폭 다섯(admin `b_h2 +46px` · `b_kv +21px` …) / 캔버스 = 번들 `a_new 269.2 대 255.2` 외 셋(`BackCompat`) / docs PPTX `[1468, 1468]` / 토큰 칸 docs `section.paddingY` · saas `display` · `h1` · `section.paddingY`.

## H1 — 세로 Divider (D1)

- **고침:** commerce · docs · saas-marketing 의 `[data-wb-component="Divider"][data-wb-variant="vertical"]` 를 admin · portal 꼴로 — `align-self: stretch` · `width: 1px` · `min-height: 1.5em`(`100%` 를 걷음). 각 테마의 좌우 `margin` 은 그대로 뒀다.
- **네 자리에서 잰 값**(스크래치 탐침 `fx-a6/probe-h1.test.ts` — Flex 안 `dv` · Page 바로 밑 `dv2`, `[폭, 높이]`):

| 테마 | 캔버스 iframe(0.5s → 3s) | 설정 미리보기 iframe(0.5s → 3s) | 캔버스 dv · dv2 | 미리보기 dv2 | 번들 dv · dv2 | 화면 모드 720 dv · dv2 |
|---|---|---|---|---|---|---|
| admin | 320 → 320 | 9664 → 9664 | 1×50 · 1×21 | 1×21 | 1×50 · 1×21 | 1×50 · 1×21 |
| commerce | 320 → 320 | 17883 → 17883 | 1×42 · 1×24 | 1×24 | 1×42 · 1×24 | 1×42 · 1×24 |
| docs | 320 → 320 | 12182 → 12182 | 1×62 · 1×24 | 1×24 | 1×62 · 1×24 | 1×62 · 1×24 |
| portal | 320 → 320 | 11877 → 11877 | 1×26 · 1×23 | 1×23 | 1×26 · 1×23 | 1×26 · 1×23 |
| saas-marketing | 320 → 320 | 22790 → 22790 | 1×67 · 1×27 | 1×27 | 1×67 · 1×27 | 1×67 · 1×27 |

  (H2 전 · 캔버스는 아직 `BackCompat` 인 판에서 잰 값 — H1 만으로 자람이 멎는다.) 화면 모드 720 은 PPTX 그리는 자(`#wb-screen`)와 같은 판이다.
- **변조(HEAD 에서 commerce 만 옛 꼴로):** 「세로 Divider」 commerce 빨강 — `캔버스 iframe 높이 320 → 320 · 번들 Divider 높이 0 · 0`. H2 뒤라 캔버스는 더는 안 자라고 번들의 선이 안 보이는 쪽으로 죽는다.

## H2 — 캔버스 · 설정 미리보기 iframe 의 quirks 모드 (D3)

- **고침:** `CanvasIframe` 이 `doc.body === null || doc.compatMode !== 'CSS1Compat'` 이면 doctype 을 써서 문서를 다시 연다. 설정 미리보기(`settings/theme-preview.tsx`)도 같은 컴포넌트라 함께 표준 모드다. `theme/bundle-loader.ts` 의 realm iframe 은 그리지 않아 그대로 뒀다.
- **높이 재기는 안 바뀐다:** 실 Chromium 에서 600×500 iframe · 내용 150px 을 두 모드로 잼 — `documentElement.scrollHeight` 가 quirks 500 · 표준 500(둘 다 뷰포트가 바닥). `document.open` 뒤 같은 `Document` · `Window` 객체.
- **좌표(같은 폭 1280 · 문서 뿌리 기준, 스크래치 `fx-a6/probe-same.test.ts` — 리뷰의 목록 · 상세 문서 · 코멘트 12):** 다섯 테마 × 두 페이지 모두 **노드 상자(`left · top · width · height`) 최대 차 0px · 마커 중심 최대 차 0px**(마커 수 캔버스 6 = 번들 6). 리뷰 판은 최대 18px 였다. 캔버스 · 번들 둘 다 `CSS1Compat`.
- **캔버스 전체 판:** H2 만 넣은 트리에서 `pnpm test:browser` → 25 파일 · 110 중 **102 통과 · 8 빨강** — 8 은 전부 아직 안 고친 리뷰 빨강(좁은 폭 5 · docs PPTX · 토큰 칸 2). 다른 캔버스 케이스는 안 깨졌다. 끝 게이트는 아래.
- **변조(HEAD 에서 조건을 `doc.body === null` 로):** 「캔버스 = 번들」 빨강 — `캔버스 문서 모드 BackCompat: [ 'a_new 269.2 대 255.2', …(3) ]`.

## H3 — 긴 낱말 넘침 (D2)

- **고침:** SDK 기본 CSS 에 한 규칙 — `[data-wb-component="Text"], [data-wb-component="KeyValue"], [data-wb-component="List"] { overflow-wrap: anywhere; }`(`LONG_WORD_CSS`, 특이도 (0,1,0)).
- **브리프와 달라진 것:** 조각(Text · KeyValue 값 · 표 칸)이 아니라 **컴포넌트 뿌리**에 걸었다 — `overflow-wrap` 은 상속되므로 테마가 뷰로 바꾼 조각(commerce `cardGrid` 의 값 · docs · portal `dd` · saas `tiles`)에도 닿는다. 그래서 **테마 `theme.css` 는 한 줄도 안 고쳤다**(탐침 결과 다섯 모두 넘침 0). `break-word` 가 아니라 `anywhere` — 최소 폭에 끊을 자리를 세야 표 칸이 낱말 폭까지 안 버틴다.
- **잰 값(`fx-a6/probe-same.test.ts`):** 캔버스 375 · 번들 390 에서 넘친 글자 노드 — 다섯 테마 × 두 페이지 **0**(고치기 전: admin `b_h2 +61 · b_kv +25` · commerce `+179 · +154` · docs `+159` · portal `+67 · +53` · saas `b_h2 +313` — saas 는 `Section` 의 `overflow: hidden` 이 잘라 숨기던 판). 캔버스 375 문서 `scrollWidth` 다섯 모두 375.
- **`defaultViewsCss` 를 쓰는 곳의 기대값:** 캔버스(`canvas/canvas.tsx`) · 번들(`packages/exporter/src/bundle/index.ts`) · kit(`client/frame.tsx`) · playground. 글자로 견주는 기대값은 `packages/exporter/test/bundle.test.tsx` 의 `toBe(defaultViewsCss())` 하나이고 스스로를 견준다 — 고칠 기대값 0. sdk · renderer · exporter · kit · gallery · web · playground 단위 173 파일 3110 통과.
- **변조(HEAD 에서 `LONG_WORD_CSS` 를 뺌 → exporter 까지 빌드):** 「좁은 폭」 다섯 빨강 — 넘친 노드 admin · commerce · portal 둘씩, docs · saas 하나씩. vitest 가 같은 실패 문장을 묶어 값은 묶음의 첫 줄만 찍었다: admin `b_h2 +46px` · `b_kv +21px`, docs `b_h2 +152px`(리뷰 값과 같다).

## H4 — docs Card 마커 (D4)

- **고침:** `CardView` 의 `marker` 에 `offset: [-16, 0]`. 번들 마커(`.wb-export-marker` — 최소 폭 1.25rem + 좌우 0.25rem = 28px)의 절반 14px 보다 안이다. 머리말에 까닭과 −12 가 2px 모자람을 적었다. docs 단위 케이스에 `data-wb-marker-offset` `-16,0` 한 줄.
- **잰 값:** 「PPTX 화면 폭」 다섯 초록 — docs `[1468, 1468]` → 1440 이하. 화면 모드 720 문서 `scrollWidth` 상세 734 → 720.
- **변조(HEAD 에서 offset 을 뗌):** docs 「PPTX 화면 폭」 빨강 `[1468, 1468]`.

## H5 — 미리보기에서 안 바뀌는 토큰 (D5)

- **고침:**
  - `section.paddingY` — docs `@media (max-width: 900px)` 의 영역 여백을 `calc(var(--wb-section-paddingY) * 0.6)`(기본값 40 → 24 = 옛 `--wb-space-6`), saas-marketing `(max-width: 768px)` `* 0.6`(80 → 48 = 옛 `--wb-space-12`) · `(max-width: 640px)` `* 0.5`(80 → 40 = 옛 `--wb-space-10`). 기본값에서 px 가 같다.
  - 갤러리 Text 표본에 `display` · `h1` 역할(`text4` · `text5`). 토큰은 안 뺐다.
  - **브리프에 없던 것:** 표본을 더해도 saas 의 `typography.display.fontSize` 는 조용했다 — `(max-width: 640px)` 규칙이 `display` 를 **`h1` 토큰 크기로** 덮고 있었다(미리보기 640 폭이 걸림). 같은 꼴로 `calc(var(--wb-typography-display-fontSize) * 0.75)`(64 → 48 = 옛 `h1` 기본값)로 바꿨다.
- **`check`:** 다섯 모두 오류 0 · 갤러리 칸 admin 55 · commerce 65 · docs 62 · portal 66 · saas 63(각 +2 — Text 는 variant 를 선언한 테마가 없어 표본마다 한 칸). H7 뒤 최종은 아래.
- **변조(HEAD 에서 하나씩):** docs 여백 옛 상수 → docs 「토큰 칸」 `['section.paddingY(영역 위아래 여백)']` · saas `display` 옛 규칙 → `['typography.display.fontSize(가장 큰 제목 크기)']` · saas 640 여백 옛 상수 → `['section.paddingY(섹션 세로 여백)']` · 갤러리 `h1` 표본 뺌 → `['typography.h1.fontSize(제목 1 크기)']`. 넷 다 그 칸 하나로 죽는다.

## H6 — 번들 뷰 케이스 (G1)

- **고침:** 네 테마에 `build-test/bundle-views.test.tsx` — portal 꼴(저장소 빌드의 `theme.js` 를 공유 런타임으로 싣고 뿌리 태그 · 구조)에 **조각 칸** 하나를 더했다: 기본 뷰에 없는 `data-wb-part` 가 있어야 한다. admin 의 뷰는 기본 뷰와 태그 · 구조가 같고(`TABLE` · `table`) docs 의 뷰는 `data-wb-structure` 를 안 달아, 태그 · 구조만으로는 뷰를 잃어도 못 가른다. 머리말은 portal 머리말을 가리키고 옮겨 적지 않았다. 케이스 admin 4 · commerce 10 · docs 9 · saas 10(portal 10 과 합쳐 43 통과).
- **어느 칸을 골랐나:** 스크래치 탐침 `fx-a6/probe-views.test.tsx` — 뷰 타입 × variant × props 마다 번들 뷰와 기본 뷰의 DOM 을 견줌(`fx-a6/views.txt`). admin List 는 `selectable` · `loading` 일 때만, KeyValue 는 `columns` 로 행을 가를 때만(`filler`) 기본 뷰와 갈린다.
- **변조(테마마다 뷰 표에서 하나를 뗌 → 빌드 → 그 파일):** admin `List` 뗌 → List 세 줄 빨강 `expected null not to be null`(조각 칸 — `checkbox` · `skeleton`) · commerce `Tree` → Tree 한 줄 `expected 'indent' to be 'accordion'` · docs `Card` → Card 두 줄 `expected 'plain' to be null` · saas `Media` → Media 한 줄 `expected 'image' to be 'illustration'`. 뗀 뷰의 줄만 죽는다.

## H7 — shots 넘침 판정 (T1)

- **고침:** `measure` 가 글자 노드마다 `Range.getClientRects()` 를 창과 잘라 숨기는 조상(`overflow-x` `hidden` · `clip`)의 상자에 대 본다. 스크롤 조상(`auto` · `scroll`) · `text-overflow` 로 자른 것 · 이미 넘친 요소 뿌리 안은 뺀다. `report.json` 폭마다 `compatMode` 를 싣고, `CSS1Compat` 가 아니면 `shotsProblems` 가 한 줄을 낸다.
- **브리프에 없던 것 — 갤러리 긴 낱말 표본:** 갤러리 표본이 전부 짧은 글이라 H3 전 소스로도 shots 에 넘칠 것이 없었다. `Text — 긴 낱말`(`text6`)을 더하고 KeyValue 표본에 긴 값 한 쌍을 더했다(`쌍 셋 · 2열 · 긴 값`). **낱말에 하이픈을 안 넣는다** — Chromium 은 하이픈 뒤에서 줄을 바꿔 `…@example-` 까지가 390 폭 본문에 들어간다(16px 에서 하이픈 있는 판 오른끝 309px · 없는 판 407px). 리뷰 케이스의 `LONG_EMAIL`(하이픈 있음)은 큰 글자(h2) · 좁은 칸(KeyValue 값)이라 그대로 넘친다.
- **kit 케이스:** `shots.test.ts` 첫 케이스에 `compatMode` 단언 · 새 케이스 «잘려 숨는 글자도 넘침으로 적는다»(표본 theme 에 `overflow-wrap: normal` · Page `overflow: hidden` — 문서 `scrollWidth` 는 창과 같고 적힌 것은 전부 글자 노드).
- **구분력(H3 을 뗀 SDK, 390 폭, 다섯 테마 — 스크래치 `fx-a6/h7-disc.sh`):**

| 테마 | 새 판정(넘침 수) | 옛 판정(`HEAD~` 의 `shots.ts`) |
|---|---|---|
| admin | 1 — KeyValue 값 `td "hong.gildong…"` | 0 |
| commerce | 3 — KeyValue 표 상자 · `cardGrid` 값 · Text 긴 낱말 | 1 — KeyValue 표 상자 |
| docs | 3 — 표 상자 · `definition` 의 `dd` · Text | 1 — 표 상자 |
| portal | 3 — 표 상자 · `definitionList` 의 `dd` · Text | 1 — 표 상자 |
| saas-marketing | 2 — 표 상자 · Text | 1 — 표 상자 |

  H3 이 있는 판에서는 다섯 모두 넘침 0(아래 «shots»).
- **변조:** 글자 판정을 비움(`TreeWalker` 를 빈 요소에) → 새 케이스 빨강 `expected 0 to be 1`(종료 코드) · 잘라 숨기는 조상을 스크롤 조상처럼 뺌 → 같은 값으로 빨강 · kit 프레임의 doctype 을 뗌 → 첫 케이스 `expected 'BackCompat' to be 'CSS1Compat'`.

## 게이트

| 명령 | 결과 |
|---|---|
| `pnpm typecheck` | 종료 0 |
| `pnpm build` | 종료 0 · 다섯 `.wbtheme` sha256 = 각 `checksums.json` 의 `@1.0.0` 줄 |
| `pnpm test`(DB 5452) | 373 파일 · **6400 통과 · 1 건너뜀 · 실패 0** |
| `pnpm test:build` | 48 파일 · **299 통과 · 1 건너뜀 · 실패 0**(리뷰 케이스 21 · 새 `bundle-views` 넷 · kit `shots` 포함) |
| `pnpm test:browser` | 25 파일 · **110 통과 · 실패 0** |
| `EDITOR_STACK_BUNDLE=build pnpm test:browser` | 25 파일 · **110 통과 · 실패 0** |
| 다섯 테마 `check` | 오류 0 · 갤러리 칸 admin 56 · commerce 66 · docs 63 · portal 67 · saas 64 |

건너뜀 둘은 환경 조건이다: `apps/api/test/log-destination.test.ts` «Linux `/dev/full`» · `packages/theme-kit/build-test/template.test.ts` «저장소 밖에서 설치하고 빌드한다»(`WB_TEMPLATE_INSTALL=1`). 브라우저 두 판은 차례로 돌렸다.

**shots:** 다섯 테마를 기본 폭(390 · 1280)으로 다시 찍어 코디네이터 스크래치 `a6-shots/<이름>/` 를 덮어썼다(옛 PNG · `report.json` 을 지운 뒤). 다섯 × 두 폭 모두 콘솔 오류 0 · 폴백 0 · 넘침 0 · `CSS1Compat` · `scrollWidth = clientWidth`. PNG 는 admin 2+2 · commerce 3+3 · docs 2+2 · portal 2+2 · saas 3+3.

## 변조 절차

스크래치 `fx-a6/mutate.py` — 원본을 경로 전체 이름으로 백업 → 한 곳 치환(맞은 수 1 확인) → 필요한 빌드 · 그 케이스만(`-t`) → 백업 복원 · `filecmp` 같음. 빌드를 거친 변조는 복원 뒤 `pnpm build` 로 dist 를 되돌리고 다섯 sha256 이 체크섬 표와 같은지 봤다. 끝에 `git status` 깨끗 · `git diff --stat` 빔.

한 번 오염된 판: 「갤러리 h1 표본 뺌」 을 앞 변조(saas 640 여백)가 지은 saas dist 위에서 돌려 `section.paddingY` 가 함께 떴다 — 복원이 소스만 되돌리고 dist 는 변조 판으로 남은 탓이다. 전체 빌드 뒤 다시 돌린 값(`h1` 하나)을 위에 적었다.

## 관찰 · 이월 후보

- **캔버스 iframe 은 줄지 않는다(두 모드 같음).** 높이를 `documentElement.scrollHeight` 로 재는데 그 값이 뷰포트(= iframe 높이)를 바닥으로 잡아, 내용이 줄어도 iframe 이 제 높이에 머문다. H2 가 바꾼 것이 아니다(quirks 도 500). 페이지를 옮기면 새 iframe 이라 대개 안 보인다. 낮음.
- **D1 의 «끝없이 자람» 은 H2 뒤 서지 않는다** — 표준 모드에서 백분율 높이는 0 이 된다. 그래서 리뷰가 제안한 `packages/theme-kit/template/SKILL.md` 문장은 앞 절반(«표준 모드는 0 — 선이 안 보임 · `1.5em` 바닥 · `align-self: stretch`»)만 참이다.

## 지침 — 넣을 문장

- `CLAUDE.md` 「메인 세션은 디스패치·판정·병합만 한다」 절 «변조를 `git checkout` 으로 되돌리지 않게 한다» 문단 끝에: «**빌드 산출물을 거치는 변조는 소스를 복원한 뒤 다시 빌드하고 다음 변조로 간다** — 바이트 비교 복원은 소스만 되돌려, 다음 변조가 앞 변조의 dist(테마 `.wbtheme` · 패키지 `dist`)를 물고 돈다. 두 변조의 증상이 한 실패 값에 섞여 어느 것이 죽였는지 못 가른다.»
- 리뷰의 `packages/theme-kit/template/SKILL.md` 제안 문장은 앞 절반만 넣는다: «세로 `Divider` 에 백분율 높이(`min-height: 100%`)를 걸지 않는다 — 높이가 정해지지 않은 부모에서 0 이 되어 선이 안 보인다. 한 줄 높이(`1.5em`)를 바닥으로 두고 `align-self: stretch`.»
- 리뷰의 `CLAUDE.md` «화면 넘침은 요소 상자로만 세지 않는다» 문장에 한 줄을 붙인다: «넘침을 보일 표본 낱말에는 하이픈을 넣지 않는다 — 브라우저는 하이픈 뒤에서 줄을 바꿔 넘침이 사라진다.»

## 띄운 것 · 치운 것

에디터 판(api · vite · Chromium · 판 DB)은 케이스 · 탐침마다 띄우고 거뒀다 — 탐침의 거두기 값 `{ processes: 0, listeningPorts: [], databases: 0 }`. 끝에 `ps` 로 이 워크트리 경로 · headless Chrome 0 건, `wb_browser_*` DB 0 건, `packages/theme-kit/.tmp` 없음. 탐침 파일은 `apps/web/build-test/zz-fx-*` · `system-themes/admin/build-test/zz-fx-*` 로 잠깐 두고 돌린 뒤 걷었다(원본은 스크래치 `fx-a6/`). 이 워크트리의 Postgres(5452)는 그대로 둔다.
