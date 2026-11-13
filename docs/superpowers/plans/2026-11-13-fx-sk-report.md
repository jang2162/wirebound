# FX-SK 보고 — 기본테마 2.0.0 리뷰 대응

대상: 브랜치 `feat/skala-theme`(시작 `8ea6d3b3`). 브리프 `fx-sk` · 리뷰 `docs/superpowers/plans/2026-11-13-rv-sk-report.md`(F1 – F8) ·
구현 보고 `docs/superpowers/plans/2026-11-13-sk-report.md`.

## 바꾼 것

| 항목 | 파일 | 무엇 |
| --- | --- | --- |
| F1 | `system-themes/admin/src/manifest.ts` · `theme.css`(`:root`) · `test/admin.test.ts` | `semantic.textStrong` = `{semantic.text}` · `semantic.header` = `{semantic.canvas}`(`borderFaint` 는 `#e8eaee` 그대로). 새 케이스 «2.0.0 이 더한 토큰 가운데 글 · 바탕에 쓰이는 것은 옛 키의 참조다» · `:root` 대조 케이스가 참조를 `var()` 로 견준다 · 소문자 hex 케이스가 참조를 뺀다 |
| F3 | `system-themes/admin/test/admin.test.ts` | «배치를 바꾸는 규칙은 형제 구조로 안 가른다» 의 식 — 속성 값 `[…]` 을 걷은 뒤 `:(first\|last\|only)-child\|:nth-\|-of-type\|:empty\|:has\(\|[+~]`. `:has()` 넷을 예외 목록에 까닭과 함께(빈 폼 표의 칸 선 1px · 여러 줄 입력 필드의 라벨 정렬 셋) |
| F2 | 정본 §6.1 «폼 표» 끝 · `apps/web/build-test/admin-look.test.ts` 머리말 · «붙음» 케이스 이름 | «카드 몸통에 홀로 든» → «테두리 있는 카드의 몸통에 곧바로 든 … 형제가 있어도» |
| F4 · F6 | `theme.css` 골격 · 액션 절 · 좁은 폭 | 카드 머리줄을 SDK 격자에서 줄 바꿈하는 가로 줄(`flex-wrap` · 기준선 · `align-content: center`)로 덮음 — 부제가 제목 옆 같은 줄(틈 6px), 안 들어가면 부제 → 머리 오른쪽 차례로 다음 줄. 640 아래는 머리 오른쪽 구역이 늘 제목 아래 줄(`flex-basis: 100%`). 그리드 칸 안 `Link`(옅은 변형 밖) — `textStrong` · 700 · 밑줄 · 올리면 주색 |
| F7 | `theme.css` 골격 · 입력 절 | 카드에 붙은 폼 표 · 그리드 · 조회 폼과 조회 폼 상자의 `overflow: hidden` 을 걷음(1px 민 끝 칸 선은 같은 색 테두리 위에 앉는다 — 원본 `_field-grid.scss` 와 같은 식). 그리드는 모서리를 스크롤 조각에 둥글림. 쌍 격자의 값 칸에 `position: relative`(옆 쌍의 라벨 바탕에 안 덮인다). 강조 카드는 밀지 않는다 |
| F8 | `theme.css`(`:root`) · `test/admin.test.ts` | 제목 단계 · 캡션 크기를 `calc(var(--wb-typography-body-fontSize) ± Npx)` 로(13px 에서 28 · 22 · 18 · 16 · 15 · 14 · 13 · 12). 새 케이스 «제목 단계 · 캡션의 글 크기는 본문 크기에서 셈한다» |
| F1 · F4 · F6 · F7 · F8 | `apps/web/build-test/admin-look.test.ts` | 페이지 «목록»(리뷰 «5» 의 문서 + 그리드 카드) · «덮은» 프로젝트(어두운 팔레트 · 간격 단위 8px · 본문 16px). 새 케이스 «머리줄 · 칸 링크» · «좁은 창 머리줄» × 4 · «덮은 팔레트» · «넘친 칸이 보인다» × 2, «넘침» 이 «목록» 도 잰다. `HEADER` 기대값이 `CANVAS`(F1 판정) |
| F5 | `apps/web/build-test/canvas-drop-below.test.ts` «기록» | 문턱 `pageEndBelowCell > 0` → `> cellHeight / 2`(«굴려야 닿는 화면 밖»). 머리말의 값을 지금 값으로(칸 높이 809 · 496px 밑 · 오른 243px · 1.8.0 은 648px) |
| 4 | `apps/web/build-test/admin-drag-sweep.test.ts`(새 파일) | 리뷰 «3 · 실브라우저 훑기» 탐침을 케이스로 — 다섯 판(화면 · 팔레트 `Button` · `Text` · 손잡이 `s_t4`, 팝업 · 팔레트 `Text` · 손잡이 `p_t3`)을 `it.each` 로, 창 1280 × 1100 하나(창 1000 판은 걷었다). 점 고르기는 끌기 뒤 `dragLayoutSettled` 로 기다린다(탐침은 80ms × 4). 판마다 죽음 · `Maximum update depth` · 뒤집힘 0 과 점 수 하한(20 · 15) |
| 10 | 정본 §6 «테마는 코드 패키지다» · `packages/theme-kit/template/SKILL.md` | 문장 둘 — 배치를 바꾸는 테마 규칙은 형제 구조(`+` · `~` · `:*-child` · `:nth-*` · `:has()` · `:empty`)로 가르지 않는다 · 판을 올리며 더한 토큰이 옛 키의 자리를 나눠 가지면 기본값은 옛 키의 참조. SKILL 은 «하지 않는 것» 과 «manifest › 토큰 값» 에 |
| 체크섬 | `system-themes/admin/checksums.json` | `system-admin@2.0.0` = `52800973…a3b0`(마지막 테마 변경 `93286477` 뒤에 지음 · 게이트의 `pnpm build` 산출물과 같다 — «게이트») |
| F1(게이트가 잡음) | `system-themes/admin/build-test/wbtheme.test.ts` «빌드 CSS 에 토큰마다 --wb-<키>: <기본값>; 이 있다» | 참조 기본값을 `var(--wb-<참조 키>)` 로 견준다 — 리터럴 글자로 찾아 `textStrong` · `header` 둘이 «없다» 로 죽었다(첫 `test:build:serial`) |

## 결정

1. **F1 — 기본 화면이 한 단계 옅어진다(코디네이터 판정)** — 라벨 · 제목 · 그리드 머리 글이 `#1a1a1a` → `#333333`, 머리 바탕이 `#f2f4f7` → `#f3f4f6`.
   번들 · 캔버스는 manifest 로 지은 토큰 시트를 테마 시트 뒤에 싣으므로 `:root` 에서 원본의 짙은 값을 따로 둘 길이 없다. 설정 화면의 두 칸은 참조
   글자(`{semantic.text}`)를 보이고 색 고르개를 안 띄운다(`apps/web/src/settings/token-field.tsx` 의 `HEX6` — 스타터 템플릿의 `color.primaryHover`
   와 같은 꼴).
2. **F7 — 자르지 않고 겹쳐 앉힌다** — 브리프의 «겹선 1px 만 자르게» 는 한 상자로 못 한다: Chrome 에서 한 축만 자르면(`overflow-x: visible` ·
   `overflow-y: clip`) 둥근 모서리 자르기가 안 선다(스크래치 탐침 — 둥근 상자의 모서리 픽셀이 자식 색). `overflow-clip-margin` 은 사방을 함께 넓혀
   1px 밖의 넘침도 못 보인다. 그래서 원본 사이트(`_field-grid.scss` «`overflow: hidden` 이 없다»)처럼 자르기를 걷고 민 1px 선을 같은 색 테두리 위에
   앉혔다. 대가: 카드 · 조회 폼 상자의 둥근 모서리(반지름 4px) 구간에서 곧은 칸 선 · 라벨 바탕이 곡선 밖으로 1px 남는다(원본도 받아들인 자국). 그리드는
   스크롤 조각이 이미 자르는 상자(`overflow-x: auto`)라 그 조각의 모서리를 둥글려 자국이 없다. 강조 카드(`featured` — 테두리가 주색)는 민 회색 선이
   주색 테두리를 끊으므로 밀지 않는다(주색 테두리 안쪽에 칸 선이 한 줄 더 선다).
3. **F7 — 자르기만 걷으면 반만 풀린다** — 창 1000 · 간격 단위 8px 에서 넘친 세그먼트가 카드 밖이 아니라 **옆 쌍** 위로 넘치고, 뒤에 그려지는 옆 쌍의
   라벨 칸 바탕이 그것을 덮어 «탈퇴 · 정지» · «취소» 가 여전히 안 보였다(스크린숏 — 아래 «잰 값»). 값 칸을 `position: relative` 로 둬 넘친 조각이 옆
   칸 위에 그려지게 했다(`z-index` 없음 — 쌓임 맥락이 안 선다). 넘친 조각이 옆 라벨 글과 겹쳐 보이는 것이 넘침을 알린다.
4. **F4 · F6 — 머리줄을 격자 대신 줄 바꿈하는 가로 줄로** — SDK 기본 CSS 의 격자(`minmax(0, 1fr) auto`)는 부제를 제목 밑 줄에 두고 머리 오른쪽(`auto`)이
   줄을 바꾸기 전에 늘어나 제목 칸을 0 에 가깝게 줄인다. 가로 줄은 둘을 한꺼번에 푼다 — 부제는 제목 옆 기준선, 안 들어가는 조각은 다음 줄로. 640 아래는
   브리프대로 머리 오른쪽을 늘 아래 줄로 내린다(단추 하나여도 — 창 390 에서 제목 옆에 들어가도). 641 이상은 들어가면 같은 줄이다.
5. **F8 — 배수가 아니라 덧셈** — `calc(본문 + Npx)`. 본문과 제목의 차가 1 – 2px 인 단계가 많아 배수로 지으면 반올림이 차를 지운다. 캡션(부제 · 그림 설명)도
   본문을 따른다(`본문 − 1px`).
6. **그리드 칸 안 옅은 링크(`Link:muted`)는 옅은 그대로다** — 원본에는 그 꼴이 없다. 규칙을 `:not([data-wb-variant="muted"])` 로 걸렀다.
7. **«좁은 창 머리줄» 은 641 에서 제목 · 부제의 줄 수만 잰다** — 641 은 640 판 밖이라 단추 넷이 들어가면 제목 옆에 선다(«기본» 판이 그렇다). F6 의 결함은
   «한 글자씩 꺾임» 이라 그것을 641 · 390 두 프로젝트에서 잰다. 아래 줄 내림은 640 아래(390)에서만 단언한다.
8. **F1 재현은 «올리기» 결과를 곧바로 저장한 판이다** — 리뷰가 남긴 1.8.0 manifest(`m180.json`)와 새 2.0.0 manifest 로 `migrateTokens` 를 돌리면 DARK
   다섯 키가 그대로 이어진다(`kept 5 · dropped 0` — 탐침 `migrate.mjs`). 그래서 «덮은» 프로젝트는 2.0.0 에 그 다섯 키(+ 간격 단위 · 본문 크기)를 저장해
   세웠다 — 1.8.0 을 시딩하는 기준 사본 api 를 띄우지 않았다.
9. **4 — 판 수를 줄였다** — 리뷰 판은 창 1280 · 1000 × 다섯(363 점)이었고, 케이스는 창 1280 × 다섯(183 점 · 93s)이다. 변조 판(`ec71f22b` 테마)에서
   죽은 넷은 모두 창 1280 판이었다(리뷰 «카나리아» 줄).

## 잰 값

실브라우저(`apps/web/build-test/admin-look.test.ts` · 내보낸 번들 · 화면 모드)의 계산 값. 빌드는 `pnpm -C system-themes/admin build` 뒤.

| 무엇 | 값 |
| --- | --- |
| «목록» 창 1280 — «기본정보» 머리줄 | 제목 14px 한 줄 · 부제 12px `rgb(102, 102, 102)` 한 줄 · 기준선 같음(229.9 · 229.9) · 틈 6px(제목 오른끝 89.4 → 부제 왼끝 95.4) |
| «목록» 창 1280 — 그리드 칸 링크 | `rgb(51, 51, 51)` · 700 · `underline` · 올리면 `rgb(10, 120, 216)` |
| «덮은» 창 1280 — F1 | 폼 표 라벨 글 `rgb(230, 230, 230)` / 바탕 `rgb(42, 42, 42)` · 카드 제목 `rgb(230, 230, 230)` · 그리드 머리 글 `rgb(230, 230, 230)` / 바탕 `rgb(42, 42, 42)` — 리뷰 판(2.0.0 리터럴)은 라벨 `rgb(26,26,26)` / `rgb(42,42,42)`(대비 1.21) · 머리 바탕 `rgb(242,244,247)` · 카드 제목 `rgb(26,26,26)` |
| «덮은» 창 1280 — F8 | 본문 16px · 카드 제목 17px · 라벨 16px · 부제 15px(리뷰 판: 카드 제목 14px · 라벨 13px) |
| «덮은» 창 1000 · 390 — F7 | «정지» 가 값 칸 밖으로 넘친다(카나리아 `past > 8`) · 자르는 조상 0 · 창 1000 에서 그 칸 가운데에 그 칸이 선다(덮이지 않음) |
| «목록» · «덮은» 창 641 · 390 — F6 | «기본정보» 1줄 · «총 0건» 1줄(리뷰 판 · 변조 B12: 4줄 · 3줄). 390 은 머리 오른쪽이 제목 아래 줄(단추 넷 · 단추 하나 카드 둘 다) |
| F5 — «기록»(창 1440 · 프리셋 375) | 줌 100% `{ left 243, right 243, top 24, pageEndBelowCell 496, cellHeight 809, scrolls true }` · 줌 50% `{ left 336, right 336, pageEndBelowCell -145, scrolls false }` |
| F1 대비(WCAG 상대 휘도) — «덮은» | 라벨 11.5 · 카드 제목(면 `rgb(30,30,30)` 위) 13.36 · 그리드 머리 11.5 — 리뷰 판(리터럴): 라벨 1.21 · 카드 제목 1.04 · 머리는 어두운 표에 흰 띠(`rgb(242,244,247)`) |
| 4 — 훑기(창 1280 × 1100) | 점 34 · 34 · 65 · 25 · 25(화면 Button · Text · 손잡이 s_t4 · 팝업 Text · 손잡이 p_t3) · 죽음 0 · 뒤집힘 0 · `Maximum update depth` 0 |

`WB_ADMIN_LOOK_SHOTS` 로 찍은 «덮은» 창 1000 그림: 자르기만 걷은 판에서 «수강 상태» 의 «취소» · «회원 상태» 의 «탈퇴 · 정지» 가 옆 쌍의 라벨 칸 바탕
밑에 숨었고(«결정» 3), 값 칸을 자리 잡힌 상자로 둔 판에서 «취소» 가 «교육 기간» 라벨 위에 겹쳐 보인다. 같은 그림에서 어두운 팔레트의 읽기 전용 입력칸이
밝은 바탕(`--wb-input-readonly` 상수 `#f3f4f6`)이고 그리드 세로선이 밝은 선(`borderFaint` 리터럴 `#e8eaee`)이다 — «남은 것».

## 혼자 죽는 변조

### jsdom — `system-themes/admin/test/admin.test.ts`

| 변조 | 죽은 케이스 | 실패 값 | 실행 |
| --- | --- | --- | --- |
| F1a `textStrong` 을 리터럴 `#1a1a1a` 로(manifest · `:root`) | «2.0.0 이 더한 토큰 가운데 글 · 바탕에 쓰이는 것은 옛 키의 참조다» | `expected { 'semantic.header': '옛 키의 참조', …(1) } to deeply equal …`(`textStrong` 칸이 `#1a1a1a`) | 35 + 1 |
| F1b `header` 를 리터럴 `#f2f4f7` 로(manifest · `:root`) | 같은 케이스 | `expected { 'semantic.header': '#f2f4f7', …(1) } to deeply equal { 'semantic.header': '옛 키의 참조', …(1) }` | 35 + 1 |
| U1 구역 안 `*+* { margin-top: 8px }`(리뷰 U1) | «배치를 바꾸는 규칙은 형제 구조로 안 가른다» | `expected [ Array(1) ] to deeply equal []` | 35 + 1 |
| U2 구역 안 `:not(:has(~ *)) { margin-bottom: 0 }`(리뷰 U2) | 같은 케이스 | 같은 꼴 | 35 + 1 |
| U3 `* + * { margin-top: 8px }`(대조 — 고치기 전에도 죽던 꼴) | 같은 케이스 | 같은 꼴 | 35 + 1 |
| U4 구역 안 `:empty { display: none }` | 같은 케이스 | 같은 꼴 | 35 + 1 |
| U5(대조 — 자를 약하게) 속성 값 걷기를 뗌 | 같은 케이스(거짓 빨강 — `[data-wb-state~="…"]` 의 `~` 가 결합자로 세져 배치 속성 여섯 줄이 걸린다) | `expected [ …(6) ] to deeply equal []` | 35 + 1 |

리뷰 판에서 U1 · U2 는 35 통과로 살았다(`docs/superpowers/plans/2026-11-13-rv-sk-report.md` F3). U5 는 걷기가 장식이 아니라는 대조다.

| F8a h5 를 `14px` 리터럴로 | «제목 단계 · 캡션의 글 크기는 본문 크기에서 셈한다» | `expected { display: true, h1: true, …(6) } to deeply equal …`(h5 칸 `false`) | 36 + 1 |
| F8b(대조) h1 을 `+ 8px` 로 | 같은 케이스 · «Text 의 제목 단계는 … h1 은 22px» | `expected { display: 28, h1: 21, … }` · `expected 21 to be 22` | 35 + 2 |

### 실브라우저 — `apps/web/build-test/admin-look.test.ts`(15 케이스)

변조마다 `pnpm -C system-themes/admin build` 뒤 그 파일만 돌리고, 복원 · 바이트 비교 뒤 다시 지었다(`mut.py` — 변조마다 «same» · rebuild rc 0).

| 변조 | 죽은 케이스 | 실패 값 | 실행 |
| --- | --- | --- | --- |
| B7 그리드 칸 링크 규칙을 걷음 | «머리줄 · 칸 링크» | `expected { color: 'rgb(10, 120, 216)', …(2) } to deeply equal { color: 'rgb(51, 51, 51)', …(2) }` | 14 + 1 |
| B8 640 아래 `headEnd { flex-basis: 100% }` 를 걷음 | «좁은 창 머리줄» «기본» 390 · «덮은» 390 | `expected { info: true, grid: false } to deeply equal { info: true, grid: true }` | 13 + 2 |
| B9 h5 를 `14px` 리터럴로 | «덮은 팔레트» | `expected { title: false, label: true } to deeply equal { title: true, label: true }` | 14 + 1 |
| B10 붙은 노드에 `overflow: hidden` 을 되살림 | «넘친 칸이 보인다» 390 | `expected [ 'l_sf hidden' ] to deeply equal []` | 14 + 1 |
| B13 값 칸의 `position: relative` 를 뗌 | «넘친 칸이 보인다» 1000 | `expected { clippers: [], covered: 'label' } to deeply equal { clippers: [], covered: null }` | 14 + 1 |
| B11(F1 대조) `header` 를 리터럴 `#f2f4f7` 로 | «꼴» · «팝업» · «덮은 팔레트» | `expected 'rgb(242, 244, 247)' to be 'rgb(243, 244, 246)'` 외 | 12 + 3 |
| B12(F4 · F6 대조) 머리줄을 격자로 되돌림(`display: flex` → SDK 격자) | «머리줄 · 칸 링크» · «좁은 창 머리줄» 셋 | `{ sameLine: false, gap: -48, … }` · `expected { title: 4, sub: 3 } to deeply equal { title: 1, sub: 1 }` | 11 + 4 |

B10 은 창 1000 판을 안 죽인다 — 그 창에서 «정지» 는 카드 밖이 아니라 옆 쌍 위로 넘쳐 자르는 조상이 원래 없다. 그 판은 B13 이 죽인다(«결정» 3).
B11 이 «꼴» · «팝업» 을 함께 죽이는 것은 두 케이스가 머리 바탕(`HEADER = CANVAS`)을 함께 재서다.

### 실브라우저 — `apps/web/build-test/canvas-drop-below.test.ts` «기록»

| 변조 | 죽은 케이스 | 실패 값 | 실행 |
| --- | --- | --- | --- |
| F5a 페이지 끝으로 잴 노드를 `n_t39` → `n_t32`(값 268 — 옛 문턱 `> 0` 은 지나는 판) | «기록 — …» | `expected { fullWide: false, halfWide: true } to deeply equal { fullWide: true, halfWide: true }`(`pageEndBelowCell 268 · cellHeight 809`) | 0 + 1(`-t 기록`) |

### build — `system-themes/admin/build-test/wbtheme.test.ts`

| 변조 | 죽은 케이스 | 실패 값 | 실행 |
| --- | --- | --- | --- |
| W1 `:root` 의 `--wb-semantic-textStrong` 을 `#333333` 리터럴로(manifest 는 참조 그대로 · 테마를 지음) | «빌드 CSS 에 토큰마다 …» | `expected [ 'semantic.textStrong' ] to deeply equal []` | 3 + 1 |

### 실브라우저 — `apps/web/build-test/admin-drag-sweep.test.ts`(5 케이스)

| 변조 | 죽은 케이스 | 실패 값 | 실행 |
| --- | --- | --- | --- |
| SW1 `theme.css` 를 `git show ec71f22b:system-themes/admin/src/theme.css`(리뷰 탐침이 쓴 사본과 바이트가 같다)로 바꿔 테마를 지음 | 화면 · 팔레트 `Button` · 화면 · 팔레트 `Text` · 팝업 · 팔레트 `Text` · 팝업 · 손잡이 `p_t3` | `dead: ["s_t1 top-1 (444,97)"]` · `depthErrors: 1`(화면 둘) · `dead: ["p_t1 bot-1 (429,164)"]` · `depthErrors: 1`(팝업 둘) — 리뷰 원문의 점과 같다 | 1 + 4 |

살아남은 하나(화면 · 손잡이 `s_t4` — 점 62)는 리뷰 판에서도 살았다. 복원(`cmp` 0) 뒤 다시 지은 `.wbtheme` sha256 은 변조 전과 같다(`52800973…a3b0`).

## 4 · 그리드 열 · 행 끌기의 까닭 — 한 번 가림

리뷰 «남은 것» 첫째(그리드 열 · 행 끌기가 미리보기를 안 세움 — 그래서 «결정 17» 의 1px 선 예외 둘을 못 쟀다)를 끌기 진단 줄(`?debugDrag=1` —
`docs/guides/drag-debug.md`)로 한 번 쟀다. 탐침: 스크래치 vitest 설정(뿌리 = 체크아웃 · 루트 설정 `build` 프로젝트의 `esbuild` · `resolve`)으로
`startEditorStack` → 문서 `Section > [Card c1 > DataGrid dg(열 dg_c1 · dg_c2 · 행 dg_r1 · dg_r2 — 칸 없는 행), Text]` · 창 1600 × 1100. 끄는 것 둘 —
팔레트 카드 `GridColumn`(검색어 «열» — 카드 `GridColumn` · `GridColumnGroup`)을 쥐고 위로 200px, 손잡이 `dg_r1`(구조 트리 줄을 눌러 고름). 점은 끌기 전에
잰 머리 칸 `dg_c2` 의 오른끝 −4 · 가운데 · 왼끝 +4, 행 `dg_r1` 의 위 +2 · 아래 −2 · 가운데(x = 왼끝 + 40)에 steps 4 · 200ms 머묾.

| 끄는 것 | 진단 줄(요지) | 판 |
| --- | --- | --- |
| 손잡이 `GridRow dg_r1` | 끌기 시작부터 놓을 때까지 `over result=none why=not-accepted` 하나(머리 · 행 모든 점) · 머리 오른끝 점은 `outside-canvas` | 행 위의 점은 행이 아니라 열의 셀 틀 칸(`data-wb-cell="template"` · `data-wb-column-of`)에 닿는다 — `canvasHitAt`(`apps/web/src/canvas/canvas-drop.ts`)이 그 칸을 열의 몸통 구역으로 읽고, 열 몸통은 `GridRow` 를 안 받는다(코드로 읽은 경로 — 진단 줄은 까닭 `not-accepted` 만 낸다). 칸을 안 가진 행 위에서는 행을 놓을 자리가 안 선다 |
| 팔레트 `GridColumn` | 머리 칸 사이 같은 점(x 1077.2 · y 146)에서 `over result=canvas parent=dg index=1 placement=before over=dg_c2` → `none why=not-accepted` → 다시 `canvas` 가 17ms 안에 번갈았고(1010.6 에서도 한 번 더), 200ms 머문 뒤 `data-wb-preview` 는 `null` · 행 위는 `not-accepted` | 같은 포인터에서 답이 뒤집힌다 — 미리보기 열이 서면 `withoutPreview` 가 숨기는 것은 `data-wb-id` · `data-wb-copy-of` 가 미리보기 id 인 요소뿐인데, 그 열의 셀 틀 칸(`td`)은 미리보기 id 를 `data-wb-column-of` 로만 싣는다 — 숨긴 판에서도 표에 열이 하나 더 남아 머리 칸 자리가 옮겨진다(**의심 — 안 잼**). 형제 셀렉터와 무관한 에디터 쪽 성질이다 |

판이 안 섰으므로(행은 자리가 없고, 열은 미리보기가 머물지 않는다) 1px 선 예외 둘은 여전히 못 쟀다 — 여기서 멈췄다(브리프). 열의 뒤집힘은 «하지 않는 것»
(에디터 쪽)이라 고치지 않았다 — «남은 것».

## 게이트

Node `v24.21.0`(상태 파일 첫 줄). 체인 하나(`nohup nice -n 10 caffeinate -i` · 슬롯 `fx-sk` 를 잡고 끝에 지움). load 띄울 때 3.3 · `test` 뒤 5.4 ·
`serial` 뒤 6.4 · 끝 14.5(15 코어 · 한도 45). 잠듦: `pmset -g log` 의 마지막 ` Sleep ` 이 19:29 라 이 차수(22:35 –)와 안 겹친다.

| 단계 | rc | 실행(통과 + 실패 + 건너뜀) | 앞 판(`docs/superpowers/plans/2026-11-13-sk-report.md` «게이트» 최종) · 등식 |
| --- | --- | --- | --- |
| `pnpm fmt` · `pnpm lint` | 0 · 0 | 경고만(이 트랙이 안 고친 파일 · `admin.test.ts` 의 앞서 있던 `m` 한 줄) | |
| `pnpm typecheck` | 0 | — | 마지막 커밋(`5bcc0d4f`) 뒤에 한 번 더 rc 0 |
| `pnpm build` | 0 | `system-admin-2.0.0.wbtheme` sha256 `52800973…a3b0` = 체크섬 줄 | |
| `pnpm test --maxWorkers=25%` unit | 0 | 189 파일 · 2918 + 0 + 0 | 2916 + 2(`admin.test.ts` 35 → 37 — F1 · F8 케이스) = 2918 |
| 〃 web | 0 | 244 파일 · 3711 + 0 + 1 | 같다(3712) |
| 〃 api | 0 | 192 파일 · 2879 + 0 + 2 | 2881 — 앞 판의 시간 상한 빨강 하나(`edit-lost-commit`)가 이번엔 초록 |
| `pnpm test:build:serial`(첫 판) | 1 | 18 파일 · 177 + 1 + 1 | 빨강 하나 — `wbtheme.test.ts` «빌드 CSS 에 토큰마다 …»(참조 기본값 · «바꾼 것» 마지막 줄). 고쳐 `5bcc0d4f` |
| `pnpm test:build:serial`(고친 뒤 · 혼자) | 0 | 18 파일 · 178 + 0 + 1 | 179 = 앞 판 179 |
| `pnpm test:browser` | 0 | 131 파일 · 800 + 0 + 2 | 789 + 8(`admin-look` 7 → 15) + 5(`admin-drag-sweep` 새 파일) = 802 · 파일 130 + 1 |

`pnpm test` 는 build 프로젝트를 안 돌아(`--project '!build'`) `wbtheme.test.ts` 고침 뒤 다시 돌지 않았다. 끝에 그 워크트리 경로의 vitest · vite · Chrome 0.

## 남은 것

- **그리드 열 끌기의 뒤집힘(에디터 쪽 · 이월 후보)** — 팔레트 `GridColumn` 을 머리 칸 사이에 두면 같은 점에서 답이 `canvas` ↔ `none` 으로 번갈고 미리보기가
  안 머문다(«4 · 그리드 열 · 행 끌기의 까닭»). 이번 판에서 `Maximum update depth` 는 안 셌다(탐침이 오류를 안 모았다). 기전은 의심만 적었다.
- **칸 없는 행 위에 행을 놓을 자리가 없다(에디터 쪽)** — 같은 절. 설계 판단일 수도 있다(행 사이는 구조 트리로 옮긴다).
- **«결정 17» 의 1px 선 예외 둘은 여전히 못 쟀다** — 위 두 판이 안 서서다.
- **F7 의 모서리 1px 자국을 픽셀로 안 쟀다** — 원본 사이트의 실측(1 CSS px)과 같은 식이라는 것까지다. 카드 · 조회 폼 상자의 둥근 모서리 구간을 `deviceScaleFactor`
  를 올린 스크린숏으로 재 볼 수 있다.
- **어두운 팔레트에서 토큰을 안 따르는 것 셋** — 읽기 전용 · 비활성 칸 바탕과 안내 글(`:root` 상수 `--wb-input-readonly` · `--wb-input-disabled` ·
  `--wb-text-placeholder` — 사다리를 토큰과 안 묶는 것은 설계다)과 그리드 세로선(`borderFaint` 리터럴 `#e8eaee` — 코디네이터 판정). «덮은» 창 1000
  그림에서 읽기 전용 칸이 밝은 바탕, 세로선이 밝은 선이다. 판정이 필요하면 코디네이터 몫.
- **설정 화면의 두 칸(«글자(짙게)» · «머리 바탕»)이 참조 글자를 보인다** — 색 고르개가 안 뜬다(«결정» 1). 템플릿의 `color.primaryHover` 와 같은 꼴이다.
- **이 워크트리 개발 DB(5462 · `wb_skala`)에 옛 2.0.0 행(`fe8a70e1…`)과 그 판에 고정된 프로젝트 둘이 남았다** — 리뷰 탐침이 이 브랜치 api 로 시딩한 것이다.
  이 브랜치 api 를 이 DB 로 띄우면 `SystemThemeError`(«이미 올린 버전의 내용이 바뀌었습니다»)로 멈춘다. 띄우기 전에 그 행 · 프로젝트를 지우거나 DB 를
  다시 세운다(테스트 DB 는 global-setup 이 새로 시딩해 무관하다). 이 트랙은 api 를 띄우지 않아 건드리지 않았다.

## 지침

1. **무엇이 틀렸나** — «보이는가» 를 자르는 조상(`overflow`)으로만 재면 넘친 조각이 **뒤에 그려지는 형제의 바탕**에 덮인 판을 못 본다 — F7 을 자르기만
   걷어 고친 판에서 창 1000 의 «정지» · «취소» 가 옆 쌍의 라벨 칸 밑에 숨었고, 자르는 조상 셈은 0 이었다(변조 B13).
   **어느 문서 어느 절** — `.ruler/20-verification.md` 「수를 셀 때는 두 번 세고 표본을 열어 본다 — 덧붙임」 의 ««접히지 않는다» 는 «보인다» 가 아니다»
   항목 끝.
   **넣을 문장** — «**잘리지 않는다도 «보인다» 가 아니다** — 넘친 조각은 뒤에 그려지는 형제의 바탕(격자의 다음 칸)에 덮일 수 있다. 그 조각의 가운데에서
   `elementFromPoint` 가 그 조각(의 자손)인지를 함께 잰다(`apps/web/build-test/admin-look.test.ts` 의 `CLIPPED` — `docs/superpowers/plans/2026-11-13-fx-sk-report.md`
   «결정» 3).»
2. **무엇이 틀렸나** — 리뷰 · 탐침이 워크트리 개발 DB 에 그 브랜치 api 를 띄워 시스템 테마 판을 시딩하면, 뒤 차수가 같은 판 이름으로 테마를 고치는 순간 그
   행이 낡는다(이 워크트리의 2.0.0 `fe8a70e1`). 지금 지침은 «사용자 개발 DB» 의 같은 꼴만 적었다.
   **어느 문서 어느 절** — `.ruler/20-verification.md` 의 «뒤에 병합하는 트랙의 `checksums.json` 새 줄은 합친 판에서 다시 짓는다» 항목 끝.
   **넣을 문장** — «**같은 워크트리의 개발 DB 도 같다** — 리뷰 탐침이 이 브랜치 api 로 배포 안 한 판을 시딩한 뒤 대응 트랙이 같은 판 이름으로 테마를
   고치면 그 DB 의 행이 낡아 api 기동이 멈춘다. 대응 트랙의 보고 «남은 것» 에 그 행을 적고, api 를 띄우는 차수가 먼저 지운다
   (`docs/superpowers/plans/2026-11-13-fx-sk-report.md` «남은 것»).»
3. **무엇이 틀렸나** — 토큰 기본값의 꼴을 바꾸는(리터럴 → 참조) 고침이 그 값을 글자로 찾는 자(`system-themes/admin/build-test/wbtheme.test.ts`)를
   안 세어 첫 `test:build:serial` 에서야 걸렸다. 지침의 «판정 · 풀이를 바꾸는 트랙은 그 판정을 «같다» 고 적은 사본을 함께 센다» 가 토큰 값에는 닿지 않는다.
   **어느 문서 어느 절** — `.ruler/20-verification.md` 「수를 셀 때는 두 번 세고 표본을 열어 본다 — 덧붙임」 의 그 항목 끝.
   **넣을 문장** — «토큰 기본값을 참조(`{키}`)로 바꾸면 manifest 기본값과 CSS 변수를 글자로 견주는 자를 `git grep -n 'decl.default\|\.default}' -- '*test*'`
   로 세어 참조를 `var(--wb-…)` 로 푸는지 본다 — jsdom(`test/`)과 build(`build-test/`) 두 벌이 있다(`docs/superpowers/plans/2026-11-13-fx-sk-report.md` «게이트»).»
4. **브리프 10 의 두 문장은 이 브랜치에서 넣었다** — 정본 §6 «테마는 코드 패키지다» · `packages/theme-kit/template/SKILL.md`(«하지 않는 것» · «manifest ›
   토큰 값»). `packages/theme-kit` 의 build-test 는 템플릿 zip 에 `SKILL.md` 가 있는지만 보고 글자는 안 읽는다(`build-test/template.test.ts` «뼈대가
   있다»). 구현 보고 «지침» 1 · 리뷰 보고 «지침» 3 은 이것으로 닫힌다 — `.ruler/*` 에 같은 문장을 둘지는 코디네이터 몫.
