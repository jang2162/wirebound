# FX-GR 보고 — 그리드 GR-A 리뷰 대응

브리프: `.worktrees/.coord/brief-fx-gr.md`(공통 규칙 `common-w10.md` · 키 `fx-gr`). 대상 `feat/grid` `00880e0d`(리뷰 보고 `docs/superpowers/plans/2026-10-25-rv-gr-report.md` 의 H1 · M1 ~ M4 · L2). 설계 `docs/superpowers/specs/2026-10-25-grid-design.md`.

스크래치 뿌리 `S` = `/private/tmp/claude-501/-Users-jang2162-IdeaProjects-wirebound--worktrees-feat-grid/e3738542-a7dc-45d3-b1f0-be19697cb6e9/scratchpad`. 변조는 `S/mut.py`(백업 이름은 경로 전체 · 맞은 수 1 확인 · 복원 뒤 `cmp`) · 한 판은 `S/vt.zsh`(mise 런타임 · 기본 + json 보고 · node 를 찍는다).

## H1 — 사본을 누르면 원본을 고른다(설계 GR-B «1»)

### 재현(고치기 전 · 18:41)

`apps/web/build-test/grid-editor.test.ts` 첫 케이스(사본 → 그리드)를 두 케이스로 갈았다. 고치기 전 소스에서 둘 다 빨강:

| 케이스 | 고치기 전 실패 값 |
| --- | --- |
| 사본을 누르면 원본을 고르고 Delete · Cmd+D · Cmd+V · 범위 선택이 원본에 걸린다 · 틀 칸 빈 자리는 그 열이다 | `expected 'h_g' to be 'h_b0'` — 사본 단추를 누르면 그리드가 골라진다 |
| 남이 원본을 쥐었으면 사본 누름도 원본 누름과 같게 막히고 · 다른 열의 사본은 골라진다 | `expected { selected: 'h_tail', alerts: [] } to deeply equal { selected: 'h_b0', … }` — 밥이 셀 틀 글을 쥔 동안 다른 열의 사본 단추를 누르면 그리드를 고르려다(밥의 글을 품어) 막힌다. 같은 케이스의 «사본 글 누름 = 원본 글 누름» 은 고치기 전에도 같다(둘 다 막힘 — 리뷰 «2» 의 값) |

### 바꾼 것

- **캔버스 누름**(`apps/web/src/canvas/canvas.tsx` 의 `nodeIdAt`) — 가까운 조상부터 `data-wb-id` · `data-wb-copy-of` · `data-wb-column-of` 를 읽는다. 사본은 원본 id 로, 셀 틀 · 번호 칸의 빈 자리는 그 열로 고른다. 고른 뒤의 판정(남의 잠금 · Cmd/Shift 더하기)은 원본을 누른 것과 같은 길(`selectNode` · `toggleSelect`)이다.
- **틀 칸 → 열**(`packages/theme-sdk/src/default-views/data.tsx` 의 `columnOf`) — 셀 틀 · 번호 칸 `td` 에 `data-wb-column-of="<열 id>"`. 스타터 템플릿은 SDK 파일을 옮겨 저절로 온다(`SKILL.md` 에 한 줄).
- **범위 선택**(`apps/web/src/canvas/use-canvas-marquee.ts` 의 `drawnNodes` · `canvas-marquee.ts` 의 `nodesInRect`) — 노드마다 원본 상자 뒤에 사본 상자를 같은 id 로 잇고, 하나라도 사각형 안이면 그 노드가 든다(같은 id 는 한 번).
- 정본 §6.1(`data-wb-copy-of` 줄 · `data-wb-column-of` 줄) · §9 «선택 — 고르는 법»(클릭 · 사각형).

### 결정 — 설계의 `data-wb-copy-of="<열 id>"` 대신 `data-wb-column-of`

설계 «8» 은 틀 칸 `td` 에 `data-wb-copy-of="<열 id>"` 를 단다고 적었다. **칸은 열의 사본이 아니라 열의 몸 칸이다** — 사본으로 읽으면 범위 선택이 «그 노드의 상자 하나라도 사각형 안이면 든다» 라서 한 줄을 덮는 사각형이 그 줄의 칸으로 열을 고르고(열 머리 · 다른 줄은 사각형 밖인데), 열이 들면 그 셀 틀 조각은 «조상이 든 것» 으로 빠진다. `check` 의 사본 셈(`[data-wb-copy-of="<id>"]`)과 SDK 몫 초기화(`[data-wb-copy-of]`)도 칸을 노드 뿌리로 센다. 그래서 이름을 갈랐다 — 누름(`nodeIdAt`)만 읽고 범위 선택 · 사본 셈은 안 읽는다.

### 캔버스 «두 번 눌러 글 고치기» 는 없다

브리프의 «두 번 누르기(글 바로 고치기)» — `apps/web/src/` 의 `dblclick` · `onDoubleClick` 은 구조 트리(별칭 바꾸기 · `panels/structure-tree.tsx`)와 셸 크기 손잡이뿐이다(`git grep -n -E "dblclick|onDoubleClick" -- apps/web/src`). 캔버스의 두 번 누름은 클릭 둘이라 원본을 두 번 고른다. 끌기 시작은 손잡이(`canvas-drag-handle.tsx` — 고른 노드에 선다)뿐이라 사본을 누른 뒤의 손잡이가 원본에 서고 원본을 끈다.

### 훑기 자리 × 사본을 읽는 법

`git grep -n -E "data-wb-id|dataset\.wbId"` 로 다시 센 자리(리뷰 «2» 의 목록). «원본 하나» 는 첫 `data-wb-id` 요소 하나만 본다는 뜻이다.

| 자리 | 하는 일 | 사본을 읽는 법 | 이 차수 |
| --- | --- | --- | --- |
| `apps/web/src/canvas/canvas.tsx` `nodeIdAt` | 캔버스 누름 · Cmd/Shift 클릭 | **사본 = 원본 · 틀/번호 칸 빈 자리 = 열** | 바꿈 |
| `canvas.tsx` `findNodeElement` | 고른 외곽선 · 손잡이 · 번호 마커 · 코멘트 핀 · 놓은 뒤 자리 | 원본 하나 — 외곽선 · 손잡이 · 마커 · 핀은 원본에만 선다(사본 줄에는 안 선다) | 그대로 |
| `apps/web/src/canvas/use-canvas-marquee.ts` `drawnNodes` | 범위 선택 | **사본 상자도 원본의 상자** — 사본 줄만 덮어도 원본이 든다 | 바꿈 |
| `apps/web/src/canvas/canvas-drop.ts` `canvasHitAt` · `nearestChild` · `firstNodeElement` | 끌어 놓기 판정 | 사본은 안 읽는다 — 사본 위는 가장 가까운 `data-wb-id` 조상(사본 `tr` 도 `data-wb-id` 가 없어 **그리드**)의 앞 · 뒤 · 안으로 읽힌다. 설계 «8» «사본에 놓기» 는 «그 행(`tr`)으로 읽는다» 고 적었는데 사본 `tr` 은 노드 뿌리가 아니다. 거절 문장 «첫 행의 칸에 놓으세요» 와 함께 GR-B 4 의 몫 | 그대로(GR-B) |
| `apps/web/src/canvas/layout-guides.tsx` | 고른 노드 안 배치 선 | 원본 하나 | 그대로 |
| `apps/web/src/canvas/keep-drop-place.tsx` | 빈 구역 칸이 걷힐 때 놓인 노드의 화면 자리 | 원본 · 미리보기 id 만 | 그대로 |
| `apps/web/src/canvas/canvas-preview.ts` `elementOf` | 배치 미리보기 요소 | 원본 · 미리보기 id 만 | 그대로 |
| `apps/web/src/palette/palette-thumbs.tsx` | 팔레트 축소판의 노드 찾기 | 원본 하나 | 그대로 |
| `apps/web/src/shell/editor-keys.tsx` `revealNode` | 고른 노드를 창 안으로 굴림 | 원본 하나 | 그대로 |
| `apps/web/src/drag/drag-debug.ts` `describeElement` | 끌기 진단 줄의 요소 이름 | 사본은 태그 이름만(진단 줄 — 답을 안 바꾼다) | 그대로 |
| `packages/exporter/src/browser/mount.tsx` `findNode` | 번들의 번호 마커 · 코멘트 앵커 | 원본 하나 | 그대로 |
| `packages/renderer/src/marker.ts` `focusElement` | 외곽선 · 마커의 기준 상자 | 제 뿌리 기준(사본이면 사본 뿌리) — 외곽선은 원본에만 서므로 원본 | 그대로 |

- **남의 잠금 표시** — 캔버스는 남의 잠금을 안 그린다(트리 자물쇠만 — 리뷰 «2»). 사본 누름은 원본을 누른 것과 같은 판정을 지나 막힌다(위 둘째 케이스).

## L2 — 쪽 번호의 첫 · 끝 쪽과 «…»

`packages/theme-sdk/src/default-views/data.tsx` 의 `paginationRange` · `PaginationView`. **쪽 번호는 자리 아홉**(번호와 «…» 를 함께 센다) — 쪽 수 ≤ 9 면 다, 넘으면 첫 쪽 · 끝 쪽이 늘 서고 지금 쪽 ± 2 와의 사이가 «…»(`span[data-wb-part=ellipsis]`). 지금 쪽이 앞 다섯 · 끝 다섯 안이면 그쪽 일곱을 이어 자리 수가 늘 아홉이다. `pages` 는 보이는 번호만 싣는다(이웃이 1 보다 벌어진 자리가 «…» — API 꼴은 그대로 `number[]`).

| 총 · 쪽 크기 · 지금 쪽 | 쪽 번호(고친 뒤) |
| --- | --- |
| 90 · 10 · 1 / 9 | 1 … 9 다(«…» 없음) |
| 100 · 10 · 1 | 1 2 3 4 5 6 7 … 10 |
| 1000 · 10 · 2 / 5 | 1 2 3 4 5 6 7 … 100 |
| 1000 · 10 · 6 | 1 … 4 5 6 7 8 … 100 |
| 1000 · 10 · 50 | 1 … 48 49 50 51 52 … 100 |
| 1000 · 10 · 95 | 1 … 93 94 95 96 97 … 100 |
| 1000 · 10 · 96 / 100 | 1 … 94 95 96 97 98 99 100 |
| 1,000,000 · 1 · 500,000 | 1 … 499998 … 500002 … 1000000 |
| 1,000,000 · 10 · 99,999 | 1 … 99994 … 100000 |

케이스: `packages/theme-sdk/test/grid-layout.test.ts` «페이지네이션 바의 수» 셋(경계 · 1,000,000 건) · `packages/renderer/test/default-view-props.test.tsx` «페이지네이션 쪽 번호 — 첫 쪽 · «…» · …»(DOM 차례 `first · prev · 1 · … · 48 ~ 52 · … · 100 · next · last`). 고치기 전 셋 다 빨강(18:52 — 둘레 아홉만 서서 `[46 … 54]`). 기본테마는 `[data-wb-part="pages"] > *` 규칙이 «…» 에도 듣는다.

## M4 — `wb-theme check` 가 칸 차례를 본다

`packages/theme-kit/src/check.ts` 의 `dataGridProblems` 에 규칙 ④ — 칸 수 · `colspan` 합이 맞은 줄은 **칸마다 든 노드**(`nodeIn` — 칸 자신의 `data-wb-id` · `data-wb-copy-of`, 없으면 문서 차례로 첫 노드 자손: 머리 칸은 열 · 열 묶음, 몸 칸은 제 칸 · 셀 틀의 첫 조각)를 `gridLayout` 의 차례와 견준다. 노드가 없는 칸(선택 · 번호 · 빈 칸 · 생략 띠)에는 노드가 없어야 한다. 머리 줄 · 몸 줄 둘 다다.

- **«칸에 노드가 없다» 와 «다른 노드가 섰다» 를 가른다** — 셀 틀을 안 그린 뷰는 «칸 N 에 노드가 없습니다 — … 노드 X(template)», 차례를 바꾼 뷰는 «칸 N 에 선 노드는 Y 입니다 — … 노드가 없는 칸(number)». 칸 수가 어긋난 줄은 ② 문장만 낸다(④ 를 안 본다 — 겹친 문장을 안 낸다).
- **0 이 옳은 판** — 숨은 열은 `items` 에 없어 셈에서 빠지고(셈과 DOM 이 같은 목록), 열이 없거나 빈 상태 · 불러오는 중이면 견줄 몸 줄이 없다. jsdom 판이라 창 폭이 하나다(좁은 창의 접힘은 테마 CSS 의 몫 — DOM 차례는 안 바뀐다).
- **«칸 뿌리 대신 감싼 요소에 노드가 든 판»** — `nodeIn` 은 칸 안 첫 노드 자손을 읽어 셀 틀을 `div` · `span` 으로 감싼 뷰도 그 조각으로 읽는다(감쌈 자체는 오류가 아니다 — SDK 기본 뷰도 `pieces` 조각으로 감싼다).

| 케이스(`packages/theme-kit/test/check.test.ts`) | 깨는 뷰 | 고치기 전 | 고친 뒤 |
| --- | --- | --- | --- |
| 칸 차례를 뒤집는 행 뷰 | `cells.slice().reverse()`(리뷰 N1) | 오류 0(빨강) | «몸 줄 1(행 dg1-r)의 칸 1 에 선 노드는 dg1-act-b 입니다 — … 노드가 없는 칸(number)» |
| 첫 칸을 끝으로 돌리는 행 뷰 | `[...cells.slice(1), cells[0]]`(리뷰 N1b) | 오류 0(빨강) | «… 칸 1 에 선 노드는 dg1-link …» |
| 셀 틀 칸을 비우는 행 뷰 | 셀 틀 `td` 를 빈 채로 | ③ 만(빨강 — 이 문장 없음) | «… 칸 2 에 노드가 없습니다 — … 노드 dg1-link(template)» |
| 머리 칸 차례를 뒤집는 그리드 뷰 | 그리드 뷰가 머리 줄을 거꾸로 | (새 케이스 — 변조 m4h 로 빨강) | «머리 줄 1의 칸 1 에 선 노드는 dg3-state 입니다 — … 노드 dg3-name(GridColumn)» |
| 기본 뷰 테마 · 기본 차례 행 뷰 | — | 0 | 0 |

기본테마 · 스타터 템플릿의 0 은 build 갈래(`system-themes/admin/build-test/wbtheme.test.ts` · `packages/theme-kit/build-test/check.test.ts`)가 잰다 — «게이트».

## M2 — 칸 글이 한 글자 폭까지 눌린다

### 바꾼 것(SDK 기본 CSS — `packages/theme-sdk/src/default-views/`)

- **표 칸** `[data-wb-part="table"] > * > tr > *` 에 `overflow-wrap: normal` · `word-break: keep-all` — 칸 글은 낱말(공백) 사이에서만 꺾인다.
- **칸 안 `Text`** 는 긴 낱말 규칙(`LONG_WORD_CSS` 의 `overflow-wrap: anywhere` — `Text` 뿌리에 바로 선다)에서 뺀다: `[data-wb-component="Text"]:not(:where([data-wb-component="DataGrid"] [data-wb-part="table"] *))` — `:where` 라 특이도는 그대로 (0,1,0).
- **표 폭** `width: 100%` → `width: max-content; min-width: 100%` — 표는 칸 글이 줄을 안 바꾼 폭(상자보다 좁으면 상자 폭)이다.

### 결정 — 브리프의 «고칠 방향»(keep-all · normal)만으로는 날짜가 붙임표 뒤에서 꺾인다

브리프 문장대로(표 칸 `word-break: keep-all` · `overflow-wrap: normal` + 칸 안 `Text` 를 긴 낱말 규칙에서 뺌 — 표 폭은 `100%` 그대로) 짠 판(19:04 · 빌드 뒤)에서 «2026-07-04» 가 **창 390 · 720 · 찍는 판에서 2 줄**(기본테마 · SDK 둘 다)이었다 — Chrome 은 `-` 뒤를 끊을 자리로 보고, 표가 상자보다 넓어지면 자동 배치가 열을 최소 폭(«2026-07-»)까지 누른다. 링크 «AI 엔지니어 양성 과정 12기» 는 5 줄(낱말마다)이었다. 그래서 표 폭을 칸 글 폭(`max-content`)으로 두었다 — 열 폭을 안 정한 열은 한 줄이고, 표가 넘치면 표 칸이 굴러간다. **열 폭(`size`)을 정한 열은 그 폭 안에서 낱말 사이로 꺾인다**(기본테마 `short` 6em 의 «교육 과정 이름 표본» 2 줄). 대가: 열 폭을 안 정한 긴 문장 칸은 한 줄로 길어진다(표 칸이 굴러간다 — 꺾으려면 열 폭을 정한다). 변조 m2a(표 폭만 `100%` 로 되돌림)가 이 결정을 잠근다.

### 잰 값 — 글 칸(`apps/web/build-test/data-grid.test.ts` «글 칸» · 열 7 + 열 폭 정한 열 둘 · 열 20 · 번들 화면 모드)

| 판 | 고치기 전(19:02 · 부트스트랩 빌드) | 고친 뒤(19:06) |
| --- | --- | --- |
| 기본테마 390 | «2026-07-04» 8 줄 · 링크 11 · `unbrokenidentifier_…` 13 · «No» 2 · «홍길동» 3 · 머리 «과정명» 3 | 모두 1 줄(«교육 과정 이름 표본» — 열 폭 6em — 2 줄) |
| 기본테마 720 | «2026-07-04» 2 · 링크 2 · «No» 2 · 열 20 머리 «항목 이름 N» 5 ~ 6 | 같음(1 줄 · 열 폭 정한 칸 2) |
| 기본테마 1280 | 열 20 머리 2 ~ 3 | 같음 |
| 기본테마 찍는 판(720 · 표지 + `CAPTURE_CSS`) | 문서 765 · «2026-07-04» 2 · 머리 5 ~ 6 | 문서 1924(표 전체가 문서 안) · 1 줄 |
| SDK 390 | «2026-07-04» 4 · 링크 6 · 긴 낱말 5 · «교육기간» 4 | 모두 1 줄 |
| SDK 720 · 1280 · 찍는 판 | 2 · 머리 5 / 2 ~ 3 / 문서 720(안 펼쳐짐) | 모두 1 줄 · 찍는 판 문서 2036 |

칸 밖 글 0 · 문서 `scrollWidth` = 창(찍는 판 밖) — 고치기 전 · 뒤 같다. 고치기 전 판의 «낱말 수» 셈은 케이스의 정규식 글이 템플릿 문자열 안에서 `\s` → `s` 로 풀린 결함으로 1 이었다 — 줄 수 값은 그대로 맞고, 고친 케이스(`\\s`)로 고친 뒤 판을 잰다.

### PPTX 그림(`apps/api/build-test/screen-chromium.test.ts` «글 칸 그리드는 …» — 셀 틀이 날짜 글인 열 20 · 열 2 그리드 · 배율 2)

| 판 | SDK 열 20 | SDK 열 2 | 기본테마 열 20 | 기본테마 열 2 |
| --- | --- | --- | --- | --- |
| 고치기 전(변조 m2all — M2 셋 다 되돌림) | 1440 × 1104(안 펼쳐짐) | 1440 × 1104 | 1452 × **1766**(날짜가 꺾여 길어짐) | 1440 × 1104 |
| 고친 뒤 | **4042** × 1104 | 1440 × 1104 | **4192** × 1104 | 1440 × 1104 |

넓고 긴 그리드(상한 판)는 그대로 «2112×4427px» 로 빠진다(19:08).

## M3 — 좁은 칸 안의 바

SDK 기본 CSS 의 `Pagination` 뿌리에 `flex-wrap: wrap`, 쪽 번호 조각에 `flex-wrap: wrap` · `justify-content: center` · `min-width: 0` — 바는 창이 아니라 제 폭에 맞춰 줄을 바꾼다(컨테이너 쿼리는 안 쓴다 — `container-type` 은 바의 고유 폭을 0 으로 만들어 가로 배치 안의 바가 접힌다). 기본테마는 고치지 않았다(창 640 아래의 «쪽 번호 줄 먼저» 배치는 그대로 · 칸 폭 접힘은 SDK 규칙이 한다).

`apps/web/build-test/data-grid.test.ts` «좁은 칸의 바» — 격자 배치 2열(쪽 8 · 쪽 50 / 100) · 폼 표 값 칸 · 카드. «넘침» 은 바 조각이 그리드 상자 밖으로 나간 px(그리드 넷).

| 판 | 고치기 전(19:03 · L2 를 지은 빌드) | 고친 뒤(19:05) |
| --- | --- | --- |
| 기본테마 390 | 문서 574 · 155 / 184 / 47 / 21 | 390 · 0 |
| 기본테마 720 | 문서 940 · 160 / 220 / 46 / 0 | 720 · 0 |
| 기본테마 1000 | 문서 1080 · 20 / 80 / 244 / 0 | 1000 · 0 |
| 기본테마 1280 | 1280 · 0 / 0 / 104 / 0(폼 표 값 칸) | 1280 · 0 |
| SDK 390 | 문서 406 · 0 / 15 / 0 / 0 | 390 · 0 |
| SDK 720 · 1000 · 1280 | 창 · 0 | 창 · 0 |

