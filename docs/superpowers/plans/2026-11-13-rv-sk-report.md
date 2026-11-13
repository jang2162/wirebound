# RV-SK 보고 — 기본테마 2.0.0 리뷰

대상: 브랜치 `feat/skala-theme`(기준 `8e2051d7` → `ad6a0c84`, 커밋 14). 구현 보고 `docs/superpowers/plans/2026-11-13-sk-report.md` · 계획
`docs/superpowers/plans/2026-11-13-skala-theme.md`. 고치지 않았다 — 탐침 · 변조는 전부 되돌렸다(아래 「게이트」).

기준 사본: `git archive 8e2051d7` 을 스크래치에 풀고 `pnpm install --frozen-lockfile --prefer-offline` · `pnpm build`(Node v24.21.0 · 둘 다 rc 0) —
`system-themes/admin/dist/system-admin-1.8.0.wbtheme` 의 sha256 `d5e4a1e6…baad` 가 `checksums.json` 의 1.8.0 줄과 같다.

## 발견

| # | 무게 | 무엇 | 연 길 |
| --- | --- | --- | --- |
| F1 | 중간 | 1.8.0 에서 색을 덮은 프로젝트를 2.0.0 으로 올리면 덮은 값은 이어지지만 제목 · 라벨 · 표 머리가 새 키(`textStrong` · `header`)의 기본값으로 서 덮은 팔레트를 벗어난다 — 어두운 팔레트에서 카드 제목 · 폼 표 라벨이 거의 안 보인다 | 이 브랜치 |
| F2 | 낮음 | 정본 §6.1 «폼 표» 문장과 `admin-look.test.ts` 의 «붙음» 케이스 이름이 «카드 몸통에 **홀로 든** 폼 표 · 그리드 · 조회 폼» 이 붙는다고 말한다 — «결정 17» 뒤로는 형제가 있어도 붙고 테두리 없는 카드에서는 안 붙는다 | 이 브랜치 |
| F3 | 낮음 | jsdom 인구조사 «배치를 바꾸는 규칙은 형제 구조로 안 가른다» 의 식이 `:has()` · `:empty` · 띄어 쓰지 않은 `+` · `~` 를 안 센다 — 자식 유무로 배치를 바꾸는 `:has()` 규칙(폼 표 `cells:not(:has(> *)) { border: 0 }`)이 그 셈 밖에 있다 | 원래 있던 길(1.8.0 에도 같은 `:has()` 규칙) |
| F4 | 낮음 | 원본과 다르게 그리는 꼴 둘 — 그리드 칸 안 링크(원본 `.adp-table__link` 는 짙은 굵은 밑줄 글, 2.0.0 은 주색 밑줄 글) · 카드 부제(원본 `.adp-card__sub` 는 제목 옆 같은 줄, 2.0.0 은 제목 아래 줄) | 이 브랜치(닮음의 빈자리) |
| F5 | 낮음 | `canvas-drop-below` «기록» 의 문턱 `pageEndBelowCell > 0` 은 같은 단언의 `scrolls` 와 거의 같은 말이다 — «값이 바뀌면 이 케이스가 알린다» 는 머리말의 기록 구실이 부호가 바뀔 때만 선다 | 이 브랜치 |
| F6 | 낮음 | 창 390 에서 머리 오른쪽에 단추 넷을 둔 카드의 제목 · 부제가 한 글자씩 꺾인다(«기본정보» 4줄 · «총 0건» 3줄) — 머리 오른쪽 구역이 `auto` 열로 줄을 다 먹는다 | 원래 있던 길(1.8.0 도 같은 판에서 4줄) |
| F7 | 낮음 | `space.unit` 을 키운 프로젝트(8px)에서 열 2 조회 폼 · 폼 표 값 칸의 세그먼트가 칸 밖으로 넘친다 — 2.0.0 은 카드에 붙은 표가 넘친 것을 잘라 숨겨(`overflow: hidden`) 고르개 칸이 말없이 사라진다(창 390 에서 «정지» 가 뿌리 밖 65px) | 넘침은 원래 있던 길(1.8.0 은 문서가 470/390 으로 넘친다) · 잘라 숨기는 꼴은 이 브랜치 |
| F8 | 낮음 | 본문 크기 토큰(`typography.body.fontSize`)을 키우면 제목 단계는 고정 px 라 안 따른다 — 16px 로 덮으면 카드 제목(14px)이 본문보다 작다 | 원래 있던 길(1.8.0 도 고정 px · 카드 제목 17px) — 2.0.0 은 본문과 제목의 차가 1px 라 먼저 뒤집힌다 |

### F1 · 중간 — 올린 프로젝트의 제목 · 라벨이 덮은 팔레트를 벗어난다

**무엇** — 2.0.0 은 토큰 셋을 새로 내고(`semantic.textStrong` `#1a1a1a` · `semantic.header` `#f2f4f7` · `semantic.borderFaint` `#e8eaee`), 1.8.0 이
옛 키로 칠하던 자리를 그 셋으로 옮겼다 — 폼 표 라벨 글(1.8.0 `text` → `textStrong`) · 상세 표 키 글(`textMuted` → `textStrong`) · 그리드 머리
(바탕 `canvas` → `header`, 글 `textMuted` → `textStrong`) · 카드 제목 · `Text` 제목 단계 · 팝업 제목줄. `migrateTokens` 는 옛 키 값을 옛 키에만
옮기므로(`kept 16 · defaulted 3`) 새 셋은 기본값으로 선다. 밝은 기본 바탕을 전제한 값이라, 바탕 · 글을 덮은 프로젝트(어두운 화면 설계서 등)에서
글이 바탕에 묻힌다.

**재현(원문)** — 이 워크트리 DB(5462)에서: 기준 사본 api 로 1.8.0 을 시딩 → 프로젝트를 만들어 `PUT /api/projects/:id/theme`
`{ themeId: 'system-admin', version: '1.8.0', tokens: DARK }` → 이 브랜치 api 로 다시 띄워 같은 라우트로 `version: '2.0.0'` · `tokens` 는
`migrateTokens(1.8.0 manifest, 2.0.0 manifest, DARK)`(웹의 «바꾸기» 가 싣는 값 — `apps/web/src/settings/theme-chooser.tsx`) → 번들
(`GET /api/projects/:id/export`)을 풀어 Chrome 으로 `pages/*.html#wb-screen` 을 열고 계산값을 읽었다.

```
DARK = { semantic.surface: #1e1e1e, semantic.canvas: #2a2a2a, semantic.text: #e6e6e6, semantic.textMuted: #aaaaaa, semantic.border: #444444 }
문서: FormTable(columns 1) > Field '이름' > Input · DataGrid > GridColumn '머리' · Card '카드 제목' > Text
읽은 요소: [data-wb-id="f1"] > [data-wb-part="label"] · [data-wb-id="c1"](그리드 머리 칸) · [data-wb-id="card"] [data-wb-part="title"] · [data-wb-id="card"]
```

**잰 값**

| 자리 | 1.8.0 고정(글 / 바탕) | 2.0.0 으로 올린 뒤(글 / 바탕) |
| --- | --- | --- |
| 폼 표 라벨 | `rgb(230,230,230)` / `rgb(42,42,42)` — 대비 11.5 | `rgb(26,26,26)` / `rgb(42,42,42)` — 대비 1.21 |
| 그리드 머리 | `rgb(170,170,170)` / `rgb(42,42,42)` | `rgb(26,26,26)` / `rgb(242,244,247)` — 어두운 표에 흰 띠 |
| 카드 제목 | `rgb(230,230,230)` / 면 `rgb(30,30,30)` | `rgb(26,26,26)` / 면 `rgb(30,30,30)` |

대비는 WCAG 상대 휘도로 셈했다. 확인 상자는 «기본값으로 서는 토큰 3» 을 수로만 말한다.

**연 길** — 이 브랜치(키 셋은 2.0.0 이 처음 낸다). 1.8.0 고정 판은 그대로다(아래 «1»).

**고칠 방향** — 새 셋의 기본값을 옮겨 간 옛 키의 참조로 둔다(`textStrong: {semantic.text}` · `header: {semantic.canvas}` · `borderFaint:
{semantic.border}` — 토큰 문법이 같은 타입 참조를 받는다, `packages/themes/src/manifest/tokens.ts`). 원본의 짙은 값은 그때 `:root` 에서 덮을 수
없으니(번들이 manifest 로 지은 토큰 시트를 뒤에 싣는다) 기본 화면이 원본보다 한 단계 옅어지는 것을 받아들이는 판정이 필요하다 — 코디네이터 몫.

## 1 · 고정된 옛 판은 그대로인가 — 확인함

이 워크트리 DB(5462 · `wb_skala` — 처음에 테마 · 프로젝트 · 계정 0)에서 쟀다. 계정은 `migrate` 의 `SEED_USER_*`(비밀번호는 스크립트 안에서 지음).

| 걸음 | 값 |
| --- | --- |
| 기준 사본 api 기동 → `theme_packages` | `system-admin@1.8.0` 하나 |
| 프로젝트(단추 둘 — variant 없음 · `primary`)를 1.8.0 에 두고 열여섯 키를 전부 기본값과 다른 값으로 덮음 | `PUT …/theme` 200 · 토큰 16 · 번들 `assets/theme/theme.css` sha256 `ff786302…ca11` · `assets/tokens.css` 에 덮은 값 16/16 |
| 이 브랜치 api 기동(`migrate` 뒤 `start`) | 2.0.0 시딩 · 로그의 `SystemThemeError` 0 · level ≥ 50 줄 0 |
| 그 프로젝트 `GET …/theme` | `system-admin` · `1.8.0` · `latest` `2.0.0` · 토큰 16 = 덮은 값 그대로 |
| 그 프로젝트 번들 | `theme.css` sha256 `ff786302…ca11`(앞과 같다) · 덮은 값 16/16 |
| `GET …/theme/impact?version=2.0.0` | `tokens { kept 16, dropped 0, defaulted 3 }` · `variants []` |
| «바꾸기» 와 같은 길 — `migrateTokens(1.8.0, 2.0.0, 토큰)` → `PUT` `version 2.0.0` | `kept 16 · dropped 0` · 200 · 저장 토큰 16 = 덮은 값 · 번들 `theme.css` 가 2.0.0 의 것(`e51a402d…6a07`) · 덮은 값 16/16 |

덮은 값은 열여섯 다 이어진다. 화면이 그 값을 다 따르는지는 «F1».

## 2 · 바꾼 기존 케이스가 약해지지 않았나 — 확인함

변조마다 백업(경로 전체 이름) → 글자 바꿈(맞은 수 1 확인) → 그 파일만 `pnpm exec vitest run -c vitest.browser.config.ts <파일> -t <케이스>` → 복원 ·
바이트 비교(다섯 다 «같음»). 실행 수는 `통과 + 실패` 다. 실패 값은 json 과 기본 보고서를 함께 받아 칸까지 읽었다.

| 변조 | 무엇을 되살렸나 | 죽은 케이스 | 실패 값 | 실행 | 판정 |
| --- | --- | --- | --- | --- | --- |
| MA | `settings/theme-preview.tsx` 의 `useTopOnPageChange` 에서 `element.scrollTop = 0` 을 뗌(M1 이 막는 결함) | `rv-pv-preview` «M1 — …» | `{ byLink: false, byRow: false }` ≠ `{ true, true }` | 0 + 1 | 카나리아 300 → 200 뒤에도 재려던 값으로 죽는다 |
| MB | `useBoxWidth` 가 세로 막대가 없을 때만 iframe 을 16px 넓힘(문턱 높이에서만 서는 고리를 노림) | `rv-pv-themes` «폭 따라가기 — …» | 판 카나리아 `expected 8 to be greater than 10`(재는 문턱 `612`) | 0 + 1 | **구분력 아님** — 변조가 문턱을 재는 걸음(높은 창의 상자 높이)까지 바꿔 판이 안 섰다. 아래 «문턱» |
| MC | `palette/palette-thumbs.tsx` 가 축소판 시트에 프로젝트 토큰 대신 `{}` 를 실음 | `palette` «축소판 — 프로젝트 테마 …» · `canvas-cost` «축소판 — …» | `after` 가 옛 주색 · `changed: false` | 0 + 1 · 0 + 1 | 링크 글 색 표지가 토큰을 따르는지 가른다 |
| MD | 같은 자리에서 `bundled: false`(테마 시트를 안 실음) | `palette` «축소판 — 프로젝트 테마 …» | `before: 'rgb(0, 0, 238)'`(브라우저 기본 링크 색) | 0 + 1 | 표지가 «테마로 그렸나» 도 가른다 |
| ME | `multiselect` 케이스의 점을 옛 자리(`card.x - 20`)로 | `multiselect` «사각형 — … 칸 여백의 빈 사각형 …» | `inPane: false` · `drawn: [1, 1, 1, 0]` | 0 + 1 | 카나리아가 손잡이 위 점을 «칸 여백» 판과 가른다 |

**문턱(`rv-pv-themes` «폭 따라가기»)** — 고친 케이스는 문턱을 «높은 창(1400)의 상자 제 높이 + (낮은 창 420 − 그때 상자 높이)» 로 잰다. 변조 없이 같은
케이스를 돌리면 2.0.0 은 `상자 제 높이 522 · 창 420 에서 345 → 문턱 597`(보고 «기대가 바뀐 케이스» 의 «640» 과 다르다 — 그 사이 테마가 더 바뀐 것으로
보인다), **같은 새 케이스 파일을 기준 사본(1.8.0)에 얹어 돌리면 `651 · 345 → 726`** — 옛 케이스가 글자로 박았던 726 을 그대로 다시 낸다(재는 법이 맞다 ·
두 판 모두 통과 1 · 건너뜀 5). 문턱이 빗나가면 판 카나리아(`bounced > 10`)가 시끄럽게 죽는 짜임이라 조용히 약해질 길은 없다 — MB 가 바로 그 꼴로
죽었다. 문턱에서만 서는 고리를 되살리는 변조는 못 지었다(MB 는 재는 걸음까지 바꿨다) — «고리 없음» 단언 자체의 구분력은 이 리뷰가 못 쟀다.

**기록(`canvas-drop-below` «기록 — 프리셋 375 …»)** — 변조 없이 돌린 값: 2.0.0 `pageEndBelowCell 496`(줌 50% −145) · 기준 사본 648(−68). 이 케이스는
결함을 막는 케이스가 아니라 설계 판단의 근거 값을 적는 «기록» 이라 되살릴 결함이 없다(변조 안 함). 문턱 `> 0` 은 같은 단언의 `scrolls`(칸이 구른다)와
거의 같은 말이라 «값이 바뀌면 이 케이스가 알린다» 가 부호가 바뀔 때만 선다(F5 · 낮음). **고칠 방향** — 칸 높이에 기대 «칸 높이의 절반 넘게 밑» 처럼
뜻을 지닌 문턱으로 두거나, 값을 머리말에 적고 ± 범위로 단언한다.

변조 없이 돈 판(같은 케이스 · 같은 `-t`)은 «게이트» 에 적었다.

## 3 · «결정 17» — 형제 구조와 끌기 고리 — 확인함

### 파서로 센 형제 구조 규칙

postcss 8.5.25 로 `system-themes/admin/src/theme.css` 를 읽어 선택자마다(쉼표로 가른 것 각각 · 속성 값 `[…]` 은 걷고) `:first|last|only-child` ·
`:nth-` · `:*-of-type` · `:empty` · `:has(` · `+` · `~`(띄어 씀 무관)를 셌다. 2.0.0 은 규칙 257 · 그 선택자 13, 1.8.0(기준 사본)은 222 · 8.

| 선택자(줄여 적음) | 선언 | 갈래 |
| --- | --- | --- |
| `Card:not(borderless) > body:first-child > :is(FormTable, DataGrid, SearchForm)` | `border-top-*-radius` | 그림 — `body` 의 형제는 조각(머리줄 · 바닥)이다 |
| `Card:not(borderless) > body:last-child > :is(…)` | `border-bottom-*-radius` | 그림 |
| `DataGrid … tr > [data-wb-part]:last-child` | `border-right: 0` | 1px 선 — 예외(보고 «남은 것») |
| `Card:not(borderless) > body > DataGrid … tbody:last-child > tr:last-child > [data-wb-part]` | `border-bottom: 0` | 1px 선 — 예외 |
| `SearchForm > fields[columns]:last-child` | `margin-bottom: -1px` | 조각의 차례(예외) — `fields` · `actions` 는 조각이다 |
| `SearchForm > fields[columns] + actions` | `flex · justify-content · margin-top: -1px · border-top` | 조각의 차례(예외) |
| `RadioGroup[segment] > option:first-child` | `margin-left: 0` · 모서리 | 조각의 차례(예외) — 칸은 노드가 아니다 |
| `RadioGroup[segment] > option:last-child` | 모서리 | 조각의 차례(예외) |
| `FileAttach > list > tbody > tr:last-child > *` | `border-bottom: 0` | 조각의 차례(예외) — 줄은 `file` 조각이다 |
| `FormTable > cells:not(:has(> *))` | `border: 0` | **`:has()` — 인구조사 밖**(F3) · 1.8.0 에도 있다 |
| `FormTable > cells > Field:has(> value > TextArea) > label` | `align-content: start` | `:has()` — 칸 안 정렬만 · 1.8.0 에도 있다 |
| `EntryForm > row > Field:has(> value > TextArea)` | `align-items: start` | `:has()` · 1.8.0 에도 있다 |
| `EntryForm > row > Field:has(…) > label` | `padding-top` | `:has()` · 1.8.0 에도 있다(값만 `space-2` → `space-1`) |

예외 일곱은 보고의 말대로다 — 다섯은 노드가 아닌 조각 사이의 차례라 끄는 동안의 미리보기(노드)가 그 형제가 될 수 없고, 둘은 1px 선이다. 빈 구역(조회 폼
`actions`)은 `<Zone>` 이 비면 감싸는 요소째 안 그리지만 끄는 동안은 스토어 문서로 정한 빈 구역 칸이 그 자리에 서 있어(`apps/web/src/canvas/empty-zones.tsx`
머리말) 미리보기가 들어와도 `fields:last-child` 판이 안 바뀐다. 남은 1px 선 둘은 아래 «촘촘한 판» 에서 재려 했으나 판이 안 섰다(안 잰 것).

**F3 · 낮음 — 인구조사의 식이 꼴 셋을 놓친다** — `system-themes/admin/test/admin.test.ts` «배치를 바꾸는 규칙은 형제 구조로 안 가른다» 의
`STRUCTURAL = /:(first|last|only)-child|:nth-|:(first|last|only)-of-type|\s[+~]\s/` 는 결합자 양옆의 공백을 요구하고 `:has()` · `:empty` 를 안 센다.
`theme.css` 끝에 규칙 하나를 붙여 그 파일만 돌렸다(백업 · 바이트 복원 · jsdom):

| 변조 | 붙인 규칙 | 결과 |
| --- | --- | --- |
| U0 | (없음) | 35 통과 |
| U1 | `[data-wb-component="Section"] > [data-wb-part="inner"] > *+* { margin-top: 8px; }` | **35 통과 — 살았다** |
| U2 | `[data-wb-component="Section"] > [data-wb-part="inner"] > :not(:has(~ *)) { margin-bottom: 0; }` | **35 통과 — 살았다** |
| U3(대조) | `… > * + * { margin-top: 8px; }` | 34 + 1 — 그 케이스 하나가 죽는다 |

U1 은 «결정 17» 이 고친 결함과 같은 규칙을 공백만 빼고 쓴 것이다. 실브라우저에서 그 고리를 잠근 케이스는 없다(구현 보고 «남은 것» 첫째 — M1c 에
`zone-editor` 가 살았다). **고칠 방향** — 식을 `/:(first|last|only)-child|:nth-|-of-type|:empty|:has\(|[+~]/`(속성 값 `[…]` 을 걷은 뒤)로 넓히고,
지금의 `:has()` 넷은 예외 목록에 까닭(칸 안 정렬 · 칸이 하나도 없는 표)과 함께 올린다. 위 «실브라우저 훑기» 판을 케이스로 옮기면 기하와 무관하게
그 고리를 잡는다(카나리아 판이 넷을 죽였다).

### 실브라우저 훑기

탐침: 스크래치 vitest 설정(뿌리 = 체크아웃 · 루트 설정 `build` 프로젝트의 `esbuild` · `resolve` · `editor-stack` 은 체크아웃 절대 경로)으로
`startEditorStack` 를 띄웠다. 원문 요지:

```
문서(화면): Section > [Text s_t1, Text s_t2,
  Card c1 > [Text, FormTable(columns 2 · Field 셋), Text, DataGrid(열 둘 · GridRow repeat 2), SearchForm(columns 2 · Field 셋 · actions Button), Text],
  Tabs > TabPanel tp1 > [Text, FormTable, DataGrid, Text, SearchForm],
  Card cb(variant borderless) > [FormTable, Text, DataGrid, Text],
  Card c2 > [FormTable](홀로),
  Text s_t3, s_t4, s_t5]
문서(팝업 페이지 몸통): [Text, FormTable, Text, DataGrid, Text]
끄는 것: 팔레트 카드 Button · Text(카드를 쥐고 위로 200px 끈 뒤), 캔버스 손잡이(구조 트리 줄을 눌러 고른 글 s_t4 · p_t3)
점: 끌기를 세우고 80ms × 4 기다린 뒤 잰 노드(그릇 · 그 안의 노드 전부)마다 x = 왼끝 + min(폭/2, 120),
    y = 위끝 −1 · +1 · 아래끝 −1 · +1 · 다음 형제와의 틈 가운데(마지막이면 아래끝 +4 · +12). 캔버스 칸(`.wb-shell-canvas`) 안 점만.
머묾: steps 4 로 옮긴 뒤 60ms × 6 번 «surface 의 data-wb-preview | 미리보기 부모 id @ 차례» 를 읽는다.
  iframe 이 없으면 «죽음», 뒤 넷이 둘 이상의 값이면 «뒤집힘». pageerror · console 의 `Maximum update depth` 를 센다.
```

| 판 | 창 | 점 | 뒤집힘 | 캔버스 죽음 | `Maximum update depth` |
| --- | --- | --- | --- | --- | --- |
| 2.0.0(이 브랜치) | 1280 · 1000 × 높이 1100 | 363 | 0 | 0 | 0 |
| 2.0.0(이 브랜치) | 1280 · 1000 × 높이 2000(아래 그릇까지) | 678 | 0 | 0 | 0 |
| 1.8.0(기준 사본) | 1280 · 1000 × 높이 1100 | 323 | 0 | 0 | 0 |
| **자의 카나리아** — `theme.css` 를 `ec71f22b`(형제 셀렉터를 쓰던 처음 판)로 바꿔 지음 | 1280 × 1100 | 181 | 0 | **4**(다섯 판 가운데 넷 — `s_t1 top-1 (444,97)` · `p_t1 bot-1 (429,164)`) | **4** |

카나리아 판은 «결정 17» 이 고친 결함을 자가 잡는다는 증거다(백업 · 바이트 복원 · 다시 지은 `.wbtheme` sha256 `fe8a70e1…4f73` = 체크섬 줄). 2.0.0 · 1.8.0
모두 그 판에서 결함이 안 선다 — 보고의 «1.8.0 은 안 섰다» 와 같다.

**촘촘한 판(0.5px 걸음)** — 카드 c1 > DataGrid(열 둘 · 행 둘) · 카드 c2 > 빈 FormTable(`ft0` · 칸 0) + Text · 끝 Text, 창 1600 × 1100.

| 겨눈 규칙 | 끄는 것 · 점 | 2.0.0 | 1.8.0 |
| --- | --- | --- | --- |
| `:has()` — 빈 폼 표 칸 선 | 팔레트 `Field` · `ft0` 위끝 −6 ~ 아래끝 +6 | 189 점 · 답 셋(`inside ft0` · `inside c2` · `before 뿌리@1`) · 뒤집힘 0 · 죽음 0 | 197 점 · 답 넷 · 0 · 0 |
| 그리드 끝 칸 세로선 | 팔레트 `GridColumn` · 머리 높이에서 표 오른끝 ±8 | **안 잰 것** — 33 점 모두 미리보기 없음(`null`) | 같다 |
| 카드에 붙은 그리드 끝 줄 아래 선 | 손잡이 `dg_r1` · 표 아래끝 ±8 | **안 잰 것** — 33 점 모두 미리보기 없음 | 같다 |

그리드 열 · 행 판은 끌기가 캔버스에 미리보기를 한 번도 세우지 않았다(열은 팔레트 카드 · 행은 손잡이 — 그 끌기가 캔버스에서 무엇을 내는지 못 갈랐다).
«남은 것» 으로 넘긴다.

## 4 · 닮음 — 확인함

원본 SCSS(`_tokens` · `_card` · `_table` · `_form` · `_field-grid` · `_search`) 와 표본 마크업 셋(`sample/list.html` · `form.html` · `detail.html` — 쓰인
`adp-*` 클래스를 세어 46 가지)을 읽고, 카탈로그로 지을 수 있는 꼴마다 2.0.0 의 규칙과 견줬다(화면은 안 띄웠다). «결정» 11 · 12 와 «참고 값 견줌»
셋은 뺐다.

- 견줘 같은 것 — 페이지네이션(현재 쪽 짙은 글 · 굵게 · 밑줄 — 굵게 · 밑줄은 SDK 기본 `[aria-current="page"]` · 카드에 붙은 그리드 바닥의 윗선 ·
  여백 8px 12px), 파일첨부(작은 단추 26px · 12px · 머리 바탕 · 옅은 바탕 한도 줄 · 비활성 바탕), 빈 표 안내(가운데 · 여백 32px), 카드 머리줄 단추
  틈 6px.
- **F4 · 낮음** — 그리드 칸 안 링크: 원본 `.adp-table__link` 는 `$c-text-strong` · 700 · 밑줄(hover 에 주색). 2.0.0 은 칸 밖과 같은 `Link`
  규칙(`theme.css` 의 `[data-wb-component="Link"][data-wb-structure="default"]` — 주색 · 밑줄)이다. 카드 부제: 원본은 제목 안의 `<span
  class="adp-card__sub">`(제목 옆 같은 줄 · 기준선 맞춤 · 틈 6px — `list.html` «검색결과 총 0건»), 2.0.0 은 SDK 기본 배치 그대로 제목 아래 줄이다
  (`[Card] > header > subtitle` 에 `grid-column: 1` 만). 둘 다 테마 CSS 로 고칠 수 있다(그리드 안 `Link` 규칙 · 부제를 첫 줄로). **연 길** — 이
  브랜치(닮음의 빈자리). 카탈로그로 못 짓는 것(작은 단추 `adp-btn--sm` · 진도 막대 `adp-progress` · 붙은 입력 묶음 `adp-inpgrp` 의 상자 꼴 덧붙임 —
  `Affix` 는 «사이 글자» 라 상자가 아니다)은 세지 않았다.

## 5 · 좁은 폭 · 토큰 — 확인함

탐침: 스크래치 vitest 설정으로 `startEditorStack` → 프로젝트 둘(토큰 그대로 · 토큰을 바꿈)에 같은 문서를 넣고 번들을 내보내(`exportBundle`) 화면 모드
(`openBundlePage(…, { screen: true })`)로 창 1280 · 1000 · 961 · 720 · 641 · 390 에서 쟀다. 같은 탐침을 기준 사본(1.8.0)으로 한 번 더 돌렸다.

```
문서: Section > [
  Card '검색영역' > SearchForm(columns 2) > [Field '회원 상태' > RadioGroup(세그먼트 다섯), Field '가입 기간' > DateInput · Affix '~' · DateInput,
     Field '검색 구분' > Select · Input, Field '사용여부' > RadioGroup(셋)] + actions [Button '초기화', Button(primary) '검색'],
  Card '기본정보'(subtitle '총 0건' · headEnd 단추 넷 — 엑셀다운로드 · 일괄 등록 · 선택 삭제(danger) · 등록(primary)) > FormTable(columns 2) > [
     Field 세그먼트 넷, Field 기간, Field(weight 2) '차시 정보' > FormTable(columns 2 — 하위 표: Input · Input · 세그먼트 셋), Field 세그먼트 둘, Field 읽기 전용 Input]]
토큰을 바꾼 판: semantic.primary #00aa11 · semantic.border #ff0000 · semantic.canvas #ffeecc · space.unit 8px · typography.body.fontSize 16px
잰 것: 문서 scrollWidth/창 · 뿌리 밖 글자(Range.getClientRects 오른끝) · 꺾인 글(글 노드 하나의 서로 다른 top 수 > 1, 14 글자 이하) ·
       뿌리 밖 노드 상자 · 부모 노드 상자 밖 자식 노드(카드가 잘라 숨기는 넘침)
```

| 판 | 1280 | 1000 · 961 | 720 · 641 | 390 |
| --- | --- | --- | --- | --- |
| 2.0.0 · 토큰 그대로 | 넘침 0 · 꺾임 0 | 넘침 0 · 꺾임 0 | 넘침 0 · 꺾임 0 | 문서 넘침 0 · 뿌리 밖 0 · **카드 제목 «기본정보» 4줄 · 부제 3줄**(F6) |
| 2.0.0 · 토큰 바꿈 | 세그먼트가 칸 밖 17px(잘려 숨음) | 세그먼트 칸 밖 157 · 176px · «수강중» · «미수료» 2줄 | 하위 표 세그먼트 칸 밖 56px · 카드 제목 4줄(641) | 문서 넘침 0 · **뿌리 밖 글자 65px «정지»** · 노드 상자 뿌리 밖 95px(F7) |
| 1.8.0 · 토큰 그대로 | 넘침 0 | 넘침 0 | 넘침 0 | 카드 제목 4줄 · 단추 넷 2줄씩 |
| 1.8.0 · 토큰 바꿈 | 세그먼트 칸 다섯 2줄씩 | 세그먼트 칸 밖 93 · 113px | 칸 밖 62px | **문서 470/390** · 뿌리 밖 47 · 80px |

어느 판에서나 «부모 상자 밖 +1px» 이 카드에 붙은 폼 표 · 조회 폼의 칸마다 선다 — «결정 2» 의 «격자를 1px 넓혀 밀고 그 노드가 자른다» 그대로라 셈에서 뺐다.

**토큰을 따르는가(2.0.0 · 토큰 바꿈 · 창 1280)** — 폼 표 라벨 칸 선 · 카드 테두리 · 머리줄 밑선 · 초기화 단추 테두리 · 입력 테두리가 `rgb(255, 0, 0)`,
고른 세그먼트 칸 · 검색 단추가 `rgb(0, 170, 17)`, 라벨 칸 여백 24px · 머리줄 여백 24px 12px · 구역 좌우 56px(= 단위 × 7) · 단추 높이 60 · 입력 높이 66,
본문 16px. 간격은 전부 `space.unit` 을 따른다(`:root` 밖 선언에서 1px · 0 밖의 px 리터럴은 체크 상자 14px 셋뿐 — postcss 셈). 1.8.0 은 같은 토큰에서
머리줄 밑선 · 고른 세그먼트가 글 색이라 안 따랐다 — 2.0.0 이 더 잘 따른다. 안 따르는 것은 제목 단계 글 크기(F8 — 카드 제목 14px 그대로)와 «F1» 의 새
키 셋이다.

**F6 · 낮음(원래 있던 길)** — 머리줄 격자(`minmax(0, 1fr) auto` — SDK 기본)에서 머리 오른쪽(`auto`)이 단추 넷의 내용 폭을 다 먹어 제목 칸이 0 에 가깝게
준다. 2.0.0 의 `headEnd` 에는 `flex-wrap: wrap` 이 있지만 `auto` 열은 줄을 바꾸기 전에 늘어난다. **고칠 방향** — 640 판에서 머리 오른쪽을 제목 아래
줄(`grid-column: 1 / -1`)로 내린다(조회 폼 단추줄을 아래 줄로 내린 것과 같은 꼴).

**F7 · 낮음** — 세그먼트는 칸이 줄을 안 바꾸는 붙은 칸이라 값 칸보다 넓으면 넘친다. 기본 토큰에서는 이 문서의 어느 창에서도 안 넘치고, 단위를 두 배로
키운 판에서 넘친다. 2.0.0 은 카드에 붙은 폼 표 · 조회 폼이 `overflow: hidden` 으로 자르므로 문서 넘침 셈(`scrollWidth`)에는 안 걸리고 칸이 말없이
사라진다(그림 `tuned-1000` — «탈퇴 · 정지» 가 안 보인다). **고칠 방향** — 세그먼트에 줄 바꿈(`flex-wrap`)을 주거나, 자르는 상자를 «겹선 1px» 만
자르게(`overflow: clip` + `overflow-clip-margin`) 좁힌다.

**F8 · 낮음(원래 있던 길)** — 제목 단계 글 크기(`--wb-typography-h*-fontSize`)가 `:root` 의 고정 px 다. 본문을 16px 로 덮으면 카드 제목 14px ·
라벨 13px 이 본문보다 작다. **고칠 방향** — 제목 단계를 본문 토큰의 배수(`calc(var(--wb-typography-body-fontSize) + …)`)로 짓는다.

## 6 · 정본 — 확인함

`git diff 8e2051d7..HEAD -- docs/superpowers/specs/2026-08-03-wirebound-design.md` 의 바뀐 문장 셋(§6 «시스템 테마는 하나다» · §6.1 «폼 표는 쌍
격자다» 끝 · «파일첨부는 …» 끝)을 `theme.css` 와 견줬다. 연대기 표현(«앞 판» · «바뀌었다» 류)은 바뀐 문장에 없다.

- §6 «모양은 관리자 화면이다 — …» — 참(여백 없는 카드 · 밑선 머리줄 · 라벨 칸 옅은 바탕 · 머리 바탕 그리드 · 13px · 4px · 흰 단추와 `primary` 만 채움 ·
  잠금 사다리).
- «파일첨부» 끝 — 참(단추 26px · 12px · `thead` 머리 바탕 · `limit` 옅은 바탕 · 한도 수 위험 색 700 · 꺼진 상자 `--wb-input-disabled`).
- **F2 · 낮음** — §6.1 «폼 표» 끝의 «카드 몸통에 홀로 든 폼 표 · 그리드 · 조회 폼은 카드에 붙어 제 바깥 선을 걷는다» 는 지금 거짓이다 — 붙는 규칙은
  `[Card]:not([data-wb-variant="borderless"]) > body > :is(FormTable, DataGrid, SearchForm)` 로 형제가 있어도 붙고(«결정 17» · jsdom «… 형제가
  있어도 같다»), 테두리 없는 카드에서는 안 붙는다. 같은 말이 `apps/web/build-test/admin-look.test.ts` 머리말 표 «붙음» 줄과 케이스 이름에 있다(케이스
  픽스처는 홀로 든 판만 잰다 — 형제가 있는 판은 jsdom 이 잰다). **고칠 방향** — «테두리 있는 카드의 몸통에 곧바로 든 폼 표 · 그리드 · 조회 폼은 카드에
  붙어 …» 로 고친다.
- `git grep -n '기본테마' docs/superpowers/specs/2026-08-03-wirebound-design.md` 의 나머지 줄(105 · 367 · 368 · 371 · 418 · 444 · 485 · 487 · 499) —
  모양을 말하는 문장(세그먼트 «붙은 칸 · 고른 칸 채움» · 한도 수 빨간 글 · `borderless` 줄 · `Placeholder` 몸통 `Text` 의 글 색 물려받기
  — `theme.css` 1437 줄)은 2.0.0 에서도 참이다. 판 번호를 든 문장(1.5.0 · 1.6.0)은 고정된 옛 판의 말이라 그대로 참이다.

## 게이트

전량은 돌지 않았다(리뷰 — 이 트랙은 보고 하나만 커밋한다). 돈 것은 아래뿐이다. Node v24.21.0(판마다 상태 파일 첫 줄) · 15 코어 · load 3 – 16(마지막
몇 분은 다른 일로 38 — 그때 도는 판은 없었다). 잠듦: `pmset -g log` 의 마지막 ` Sleep ` 이 19:29 라 이 리뷰(22:06 – 22:35)와 안 겹친다.

| 무엇 | 판 | 실행(통과 + 실패) · 건너뜀 |
| --- | --- | --- |
| 기준 사본 `pnpm install --frozen-lockfile --prefer-offline` · `pnpm build` | 8e2051d7 | rc 0 · rc 0 |
| 1 — api 두 판 기동 · HTTP 탐침 | 이 워크트리 DB 5462 | 기준 api · 이 브랜치 api 각 한 번 |
| 2 — 변조 MA – ME(그 파일만 `-t`) | 이 브랜치 | 표 «2» — 각 0 + 1 |
| 2 — 변조 없이 같은 케이스 | 이 브랜치 | `rv-pv-preview` 1 + 0 · 8 · `palette` 1 + 0 · 14 · `canvas-cost` 1 + 0 · 2 · `multiselect` 1 + 0 · 20 · `rv-pv-themes` 1 + 0 · 5 · `canvas-drop-below` 1 + 0 · 6 |
| 2 — 새 `rv-pv-themes` · `canvas-drop-below` «기록» | 기준 사본(새 케이스 파일을 얹고 끝에 되돌림) | 1 + 0 · 5 · 1 + 0 · 6 |
| 3 — 훑기(스크래치 탐침) | 2.0.0 · 2.0.0 높은 창 · 1.8.0 · 카나리아(`ec71f22b` 테마) | 1 + 0 씩(카나리아 판도 케이스는 통과 — 결과는 출력 파일의 수) |
| 3 — 촘촘한 판 | 2.0.0 · 1.8.0 | 1 + 0 씩 |
| 3 — jsdom 인구조사 변조 U0 – U3(`system-themes/admin/test/admin.test.ts`) | 이 브랜치 | 35 + 0 · 35 + 0 · 35 + 0 · 34 + 1 |
| 5 — 좁은 폭 · 토큰 탐침 | 2.0.0 · 1.8.0 | 1 + 0 씩 |

되돌림: 변조한 파일 넷(`apps/web/src/settings/theme-preview.tsx` · `apps/web/src/palette/palette-thumbs.tsx` · `apps/web/build-test/multiselect.test.ts` ·
`system-themes/admin/src/theme.css`)은 백업과 바이트가 같다(`cmp`). 테마를 다시 지은 카나리아 판 뒤 `system-admin-2.0.0.wbtheme` sha256 은
`fe8a70e1…4f73`(체크섬 줄과 같다). 띄운 api · vite · vitest 는 끝에 0 이다(`ps` · `lsof :3062`). 이 워크트리 DB(5462)에는 1번 탐침이 만든 계정 하나 ·
프로젝트 셋이 남았다(자기 컨테이너).

## 남은 것

- **그리드 끝 칸 · 끝 줄의 1px 선(«결정 17» 의 예외 둘)은 못 쟀다** — 팔레트 `GridColumn` 끌기와 행 손잡이 끌기가 캔버스에 미리보기를 한 번도 안
  세웠다(33 점씩 · 두 테마 같음). 그 끌기가 캔버스에서 어떤 답을 내는지부터 가려야 한다.
- **«폭 따라가기» 의 «고리 없음» 단언 자체의 구분력은 못 쟀다** — 문턱 높이에서만 고리를 세우는 변조(MB)가 문턱을 재는 걸음까지 바꿔 판 카나리아로
  죽었다. 재는 법이 옛 상수(726)를 다시 낸다는 것과 문턱이 빗나가면 카나리아가 시끄럽게 죽는다는 것까지만 섰다.
- **3 의 훑기 · 5 의 탐침은 케이스가 아니다** — 훑기는 «결정 17» 의 고리를 기하와 무관하게 잡았다(카나리아 판 넷). 다음 차수가 `apps/web/build-test/` 로
  옮겨 잠글 수 있다(원문은 «3» · «5» 의 코드 블록 · 탐침 파일은 스크래치에만 있다).
- **4 는 읽기로만 견줬다** — 화면을 안 띄웠다. 표본 마크업의 꼴 가운데 카탈로그로 못 짓는 것(작은 단추 · 진도 막대 · 붙은 입력 묶음의 상자)은 세지
  않았다.
- 터치 · 줌 · 팝업 덮개 위 끌기는 훑지 않았다.

## 지침

1. **무엇이 틀렸나** — 선택자 글자로 «형제 구조» 를 세는 자가 결합자 양옆 공백을 요구해 `*+*` 를 놓쳤고, 자식 · 형제 유무로 판을 가르는 `:has()` ·
   `:empty` 를 안 셌다(F3 — U1 · U2 가 살았다). 수를 세는 함정 목록에 이 꼴이 없다.
   **어느 문서 어느 절** — `.ruler/20-verification.md` 「수를 셀 때는 두 번 세고 표본을 열어 본다 — 덧붙임」(함정 목록 끝).
   **넣을 문장** — «**열째 함정:** ⑩ **CSS 선택자를 글자로 세는 식은 결합자 양옆의 공백을 가정하지 않는다** — `\s[+~]\s` 는 `*+*` 를 놓치고, 자식 ·
   형제 유무로 판을 가르는 `:has()` · `:empty` 도 같은 성질이다. 속성 값(`[…]`)을 걷은 뒤 `[+~]` 로 세고 공백을 뺀 변조로 한 번 센다
   (`docs/superpowers/plans/2026-11-13-rv-sk-report.md` F3).»
2. **무엇이 틀렸나** — 케이스가 글자로 박은 문턱을 «잰 값» 으로 바꾸는 고침이 그 재는 법이 옛 판에서 옛 상수를 다시 내는지 보지 않았다(이번에는 맞았다
   — 726). 재는 법이 빗나가도 판 카나리아가 받쳐 주면 시끄럽게 죽지만, 카나리아가 없는 판은 조용히 다른 판을 잰다.
   **어느 문서 어느 절** — `.ruler/20-verification.md` 「목 · 계측은 불린 수를 값으로 확인하고, 재는 요청이 잴 대상을 건드리지 않게 한다」 끝.
   **넣을 문장** — «**글자로 박은 문턱 · 기대값을 잰 값으로 바꾸는 고침은 그 재는 법을 기준 사본에서 한 번 돌려 옛 상수를 다시 내는지 적는다** —
   새 케이스 파일을 사본에 얹어 돌리고 되돌린다(`docs/superpowers/plans/2026-11-13-rv-sk-report.md` «2 · 문턱» — 1.8.0 에서 726).»
3. **무엇이 틀렸나** — 테마의 새 판이 토큰을 더하고 옛 키가 칠하던 자리를 새 키로 옮기면, 옛 키를 덮은 프로젝트가 올릴 때 새 키가 기본값으로 서 덮은
   팔레트가 끊긴다(F1). 판을 올리는 계약(정본 §6 «테마는 코드 패키지다» 의 토큰 이어짐)이 «키가 남으면 값이 이어진다» 만 말한다.
   **어느 문서 어느 절** — `docs/superpowers/specs/2026-08-03-wirebound-design.md` §6 의 토큰 이어짐(«토큰 이어짐 · 버려짐 · 기본값 수») 문장 곁과
   `packages/theme-kit/template/SKILL.md` 의 토큰 절.
   **넣을 문장** — «새 판이 토큰을 더해 옛 키가 칠하던 자리를 나눠 가지면, 새 키의 기본값은 그 옛 키의 참조(`{semantic.text}`)로 둔다 — 리터럴로 두면 옛
   키를 덮은 프로젝트가 판을 올릴 때 새 키만 기본값으로 서 덮은 색과 어긋난다.» (판정은 코디네이터 몫 — 정본은 이 트랙이 안 고친다.)
