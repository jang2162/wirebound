# rv-skt — 기본테마 2.1.0 반증 리뷰 · 보고

대상 `feat/skala-theme` 머리 `5873fecc`(main `f3acecc0` 위 10 커밋). 고치지 않았다 — 재고 값을 적었다. Node v24.21.0. 워크트리 추적 색인 md5(`git ls-files -s | md5`) 시작 · 끝 모두 `49d25e2245b3aaa2149e7006aa5d611f`, `git status --short` 시작 · 끝 모두 빈 줄. `orca terminal list` 에 이 워크트리의 터미널이 둘(구현 워커가 남긴 셸 · 셋업 셸) 보였고 둘 다 프롬프트에 서 있었다 — 작업 중 다른 쓰는 자는 없었다(md5 같음). `pmset -g log` 의 마지막 ` Sleep ` 줄이 09:34 — 실브라우저 판(15:12 – 15:17) 동안 잠든 적 없다.

## 결론

**높음 0 · 중간 0 · 낮음 2.** 이 트랙이 세운 장치 다섯은 겨눈 판에서 다 섰다. 2.0.0 고정 프로젝트의 번들은 2.0.0 그대로다(바이트로 같다). 게이트의 `layout-guides` 빨강은 이 판(load 19 – 26)에서 이 브랜치 · main 테마 모두 3/3 초록이라 재현이 안 됐다 — 이 트랙 탓으로 볼 값이 없다.

## 잰 판

- **탐침**(원문은 맨 아래): 일회용 `editor-stack` 하나에 2.0.0 패키지를 `theme_packages` 에 넣고, 같은 픽스처의 프로젝트 둘(`v21` = 시딩된 최신 2.1.0 · `v20` = `PUT /projects/:id/theme` 로 2.0.0 고정)을 세워 내보낸 번들을 화면 모드(`#wb-screen`)로 창 1280 · 720 · 390 에서 잰다. 페이지 여섯: `root`(뿌리에 카탈로그 타입 21 개) · `texts`(뿌리에 글 꼴이 번갈아) · `cont`(그리드 · 등록 폼을 그릇 열다섯에) · `sel`(셀렉트 21) · `num`(숫자칸 8) · `pop`(팝업 몸통에 그리드). 실행 1 · 통과 1(값을 모으는 판 — 카나리아만 던진다). 끝의 판 거둠 `{processes: 0, listeningPorts: [], databases: 0}`.
- **2.0.0 패키지**: `git archive f3acecc0` 의 `system-themes/admin` · `packages/{theme-sdk,schema,renderer,themes}` · `tsconfig.base.json` 을 스크래치에 풀고 지금 kit 로 지었다 — sha256 `52800973…a3b0` = `checksums.json` 의 2.0.0 줄.
- **혼자 돌린 파일 · main 테마 판**: 체인 스크립트 하나(`nohup nice -n 10 caffeinate -i`, 맨 아래 원문). 슬롯 파일 `gate-slots/rv-skt` 를 띄울 때 만들고 끝에 지웠다. main 테마 판은 `theme.css` · `manifest.ts` · `package.json` 을 경로 전체 이름으로 백업 → `git show f3acecc0:<경로>` 로 갈아 끼움 → 빌드(sha `52800973…` = 2.0.0) → 세 번 → 백업에서 `cp` · `cmp` 복원(셋 다 «restored») → 다시 빌드(sha `f2da81ae…` = 2.1.0 줄) → `git status` 0 줄. `apps/web/src` · `packages/*` 는 main 과 이 브랜치가 같아(`git diff --stat f3acecc0 HEAD -- packages` 빈 줄 · 브랜치 diff 는 테마 · 케이스 · 문서뿐) 이것이 main 사본 판과 같은 판이다.

## 항목

### 1. 페이지 뿌리 8px 쌓임 — 섰다 · 낮음 하나

뿌리에 든 타입마다의 여백(창 1280 · `root` 페이지 · 2.0.0 → 2.1.0, 계산된 값 `margin-top` / `margin-bottom` · 다음 형제 위끝 − 제 아래끝):

| 타입(태그 · display) | mt | mb | 다음까지 |
|---|---|---|---|
| SearchForm (form · flex) | 0 → 0 | 0 → 8 | 0 → 8 |
| DataGrid (div · block) | 0 → 0 | 0 → 8 | 0 → 8 |
| EntryForm (form · flex) | 0 → 0 | 0 → 8 | 0 → 8 |
| Card (div · block) | 0 → 0 | 0 → 8 | 0 → 8 |
| Section (section) | 0 → 0 | 0 → 0 | 0 → 0 (뺀 것 — 뜻대로) |
| Tabs (div) | 0 → 0 | 0 → 8 | 8 → 8 |
| Flex (div · flex) | 0 → 0 | 0 → 8 | 0 → 8 |
| Grid (div · grid) | 0 → 0 | 0 → 8 | 13 → 13 (뒤 `<p>` 위 13 과 겹침) |
| Text body (p) | 13 → 13 | 13 → 13 | 16 → 16 (뺀 것) |
| Text h3 (h3) | 16 → 16 | 16 → 16 | 19 → 19 (뺀 것) |
| Text caption (small · inline) | 0 → 0 | 0 → 0 | −15 → −15 (인라인 — 옆 링크와 한 줄) |
| Link (a · inline) | 0 → 0 | 0 → 8 | 2.5 → 2.5 (인라인이라 세로 여백이 안 먹는다) |
| KeyValue (table) | 0 → 0 | 0 → 8 | 0 → 8 |
| Divider (hr) | 0 → 0 | **0 → 0** | 0 → 0 |
| Media (figure) | 0 → 0 | **0 → 0** | 0 → 0 |
| Placeholder (div · flex) | 0 → 0 | 0 → 8 | 0 → 8 |
| Button (button · inline-flex) | 0 → 0 | 0 → 8 | 0 → 8 |
| Pagination (nav) | 0 → 0 | 0 → 8 | 0 → 8 |
| FormTable (div · grid) | 0 → 0 | 0 → 8 | 0 → 8 |
| Input (div · flex) | 0 → 0 | 0 → 8 | 0 → 8 |
| Tree (ul) | 0 → 0 | **0 → 0** | (끝) |

창 390 도 같은 여백 · 같은 간격이다(높이만 다르다). 2.0.0 열은 고정 프로젝트의 값이고 보고 «고치기 전 값» 의 «뿌리 사이 0» 과 같다.

- **`Text` 를 뺀 거름은 다른 글 꼴로 안 샌다.** 제목 역할은 `Text`(variant `h1`…)라 함께 빠지고, `Link` 는 인라인이라 8px 이 계산돼도 상자를 안 민다. `KeyValue` 는 `table` 이라 2.0.0 에서도 문단 여백이 없었다(0 → 8 은 다른 블록과 같은 꼴). 글 사이(`texts` 페이지, 1280): 글 → 링크 15 → 15 · 링크 → 글 15.5 → 15.5 · 글 → KeyValue 13 → 13 · KeyValue → 글 13 → 13 · 글 → Divider 13 → 13 · h2 → KeyValue 14.94 → 14.94 · KeyValue → 카드 0 → 8 · 카드 → KeyValue 0 → 8. 글이 낀 간격은 하나도 안 바뀌었다(문단 여백이 8 보다 커서 겹침이 문단 쪽을 고른다).
- **형제 셀렉터** — 뿌리 줄은 `:not()` 하나라 형제 구조가 아니다. 새 `scroll:first-child` · `:last-child` 는 모서리(`border-*-radius`)만, 끝 줄 아래 선을 걷는 `tbody:last-child > tr:last-child` 는 1px 선 예외 — `system-themes/admin/test`(jsdom) 41/41 초록에 «배치를 바꾸는 규칙은 형제 구조로 안 가른다» 가 든다.
- **끌기 판** — `apps/web/build-test/admin-drag-sweep.test.ts` 혼자(`--maxWorkers=1`) 5/5 통과 · 실패 0 · 건너뜀 0(15:12:38 – 15:15:11 · load 23.8 → 26.3).
- 편집 모드에서 뿌리에 끼는 비노드 요소(끄는 동안만 서는 빈 구역 칸 · 미리보기 사본)도 이 규칙을 받지만 형제 구조가 아니라 끄는 동안 값이 안 뒤집힌다 — 코드로 본 것이고 끌기 판의 초록이 받친다.

**L1(낮음) — 뿌리 8px 이 `Tree` · `Media` · `Divider` 에는 안 선다.** 제 규칙의 `margin: 0`(`[data-wb-component="Tree"][data-wb-structure="indent"]` 588 줄 · `[data-wb-component="Media"][data-wb-structure="image"]` 1482 줄 · Divider 1499 줄 근처)이 뿌리 줄과 특이도가 같고(0,2,0) 파일에서 뒤라 이긴다. 재현 값: 뿌리 `Media → Placeholder` 0px · `Divider → Media` 0px(1280 · 390 둘 다). 같은 묶음의 구역 · 탭 패널 · 팝업 몸통 줄도 같은 특이도라 원래 있던 꼴이다 — 이 트랙이 연 길은 아니고 뿌리로 넓혀 한 자리가 늘었다. 머리말 «노드마다 자기 아래에 둔다» 와는 어긋난다. Divider 는 선이라 틈이 없어도 읽힌다 — 그림(Media) · 트리 뒤의 카드가 붙는 것만 눈에 띈다.

### 2. 그리드 · 입력 폼 카드 꼴 — 섰다

그릇 열다섯(`cont` 페이지): 카드 · 테두리 없는 카드 · 탭 패널 · 구역 · Grid 칸(머리 있는 것 · 없는 것) · FormTable 값 칸 · 머리 없음 · 쪽 넘김 없음 · 둘 다 없음 · 빈 그리드(`empty: true`) · `featured` · 열 열 개(머리 긴 글 + 단추 셋) · 카드 안 등록 폼 · 값 칸 안 빈 등록 폼.

- **넘침 0** — 창 1280 · 720 · 390 모두. 셈: 그리드 안 글자 노드마다 `Range.getClientRects()` 의 오른끝 · 왼끝을 그리드 상자 · 문서 폭과 견준다(스크롤 조각 안 글과 `text-overflow: ellipsis` 조상 아래 글은 뺀다 — 굴러가는 것 · 일부러 자른 것). 머리 · 바닥 `scrollWidth = clientWidth` 열다섯 모두, 문서 `scrollWidth = clientWidth`(1280 · 720 · 390). 좁은 칸에서 머리는 줄을 바꿔 선다(390 Grid 칸 머리 59.38px · 열 열 개 머리 59.38px — 2.0.0 54.38).
- **이중 선 0** — 그리드 왼끝 + 6px 의 세로 1px 띠를 찍어(`page.screenshot({ clip })` → 페이지 안 `Image` · `canvas` 로 풀기) 색 줄을 런 길이로 셌다. 모든 그리드 · 창 1280 · 390 에서 가로선은 길이 1 의 `204,204,204`(`semantic.border` #cccccc) 하나씩이고 붙은 둘이 없다. `featured` 는 위 2px 주색(`10,120,216`) 하나. 왼끝 · 오른끝 가로 띠(줄 높이 60% 자리)도 세로선 1px 하나씩. 카드 안 그리드는 제 테두리 0 · 카드 선 하나(띠의 첫 선이 그리드 위끝 −1 · 카드 몸통). 테두리가 있는 가장 가까운 조상과의 간격: 카드 0(그리드 테두리 0 — 한 선) · FormTable 값 칸 8px(상자 안 상자 — 겹침 아님) · 탭 패널 · 구역 · Grid 칸은 테두리 조상 없음.
- **머리 없는 · 쪽 넘김 없는 · 빈 그리드의 선** — 머리 없음: 위 선 = 그리드 테두리 하나(스크롤 조각 위 모서리 맞춤), 쪽 넘김 없음: 끝 줄 아래 선을 걷고 그리드 테두리 하나, 둘 다 없음: 위 · 아래 각 하나, 빈 그리드: 머리 밑선 · 머리 칸 밑선 · 빈 줄 · 바닥 윗선 각 하나.
- 대가(구현 보고가 적은 것)의 값: 테두리 없는 카드 · 탭 패널 · 구역 · Grid 칸에 든 그리드가 1px 테두리 4px 모서리 상자가 되고 높이가 223 → 237(머리 + 바닥 있는 판), 390 에서 250.5 → 264.5. 2.0.0 고정 프로젝트는 그대로(아래 6).

### 3. 셀렉트 한 줄 · 쉐브론 — 섰다

`sel` 페이지: `size` 셋(short 78 · medium 156 · long 312px) × 여섯 꼴(짧은 값 · 긴 값 · 안내 «- 전체 -» · 긴 안내 · 비활성 + 긴 값 · invalid + 긴 값), 몫(`Flex` 안 `weight: 2` 셀렉트 + `weight: 1` 입력), 2 열 폼 표의 long · short. 셀렉트에는 읽기 전용 prop 이 없다(카탈로그 `SelectDef` 는 `disabled` · `invalid` 뿐). 각 셀렉트 옆에 같은 `size` 의 입력칸을 두어 높이를 견줬다.

- **높이 = 입력칸 30px · 글 줄 1** — 21 개 × 창 셋 모두(2.0.0 은 짧은 칸 긴 값 166px 8줄 · 긴 안내 146.5px 7줄 · 보통 긴 값 68.5px 3줄 · 몫 셀렉트 390 에서 49px 2줄).
- **쉐브론과 글이 안 겹친다** — 글 조각 오른끝에서 쉐브론 상자 왼끝(셀렉트 오른끝 − 테두리 − 오른 여백 − `::after` 의 오른 여백 2px − 폭 7px)까지 6px, 모든 판에서 같다. 잘린 판의 보이는 글 오른끝도 그 6px 안이다.
- 안내 «- 전체 -» 는 짧은 칸에서 안 잘린다(`clipped: false` · 남는 10.75px). 긴 안내 · 긴 값은 짧은 · 보통 칸에서 말줄임(`clipped: true`).
- **접근 이름 · 번들 글은 안 잘린다** — `ariaSnapshot()`: `combobox "short long 1": 공지사항과 안내사항 전체 그리고 더 긴 값이 붙는 셀렉트` · `combobox "short ph 1": "- 전체 -"`. 글 조각의 `textContent` 도 원문 그대로다(말줄임은 CSS 그림뿐).

**L2(낮음) — PPTX 그림에서 긴 셀렉트 값의 꼬리가 안 보인다.** PPTX 의 화면은 Chromium 캡처 그림(`packages/exporter/src/pptx/slide.ts` 의 `image` · 캡처 폭 720)이라 화면과 같이 말줄임으로 선다 — 2.0.0 은 꺾여서 다 보였다. 번들 · 페이지 데이터 · 접근 이름은 다 든다. 원본 `<select>` 와 같은 꼴이고 구현 보고의 결정(«제목+…» 은 프로젝트 몫)과 같은 성질이라 결함이라기보다 알릴 것이다.

### 4. 숫자칸 안내 왼쪽 · 값 오른쪽 — 섰다

`num` 페이지(medium 칸) · 1280 · 390 같은 값. 왼끝 안쪽 / 오른끝 안쪽, 2.0.0 → 2.1.0:

| 상태 | 값 «120000» | 안내 «예) 2026» |
|---|---|---|
| 보통 | 102.69 / 9 → 102.69 / 9 | 97.09 / 9 → **9 / 97.09** |
| 읽기 전용 | 102.69 / 9 → 102.69 / 9 | 97.09 / 9 → 9 / 97.09 |
| 비활성 | 102.69 / 9 → 102.69 / 9 | 97.09 / 9 → 9 / 97.09 |
| invalid | 102.69 / 9 → 102.69 / 9 | 97.09 / 9 → 9 / 97.09 |

안내 글 조각에만 `data-wb-placeholder` 가 섰고(값 판 `false`) 값은 어느 상태에서도 오른쪽이다.

### 5. 팝업 닫기 26px — 섰다

- 번들 팝업(`pop` · 1280 · 720 · 390): 제목줄 51px · 닫기 26×26 · 닫기 세로 가운데 − 제목 세로 가운데 0. 팝업 몸통 그리드 넘침 0 · 문서 넘침 0.
- `apps/web/build-test/popup-attach.test.ts` 혼자 4/4 통과 · 실패 0 · 건너뜀 0(15:15:11 – 15:15:31 · load 26.3 → 25.2). `popup-layer.test.ts` 혼자 20/20 · 실패 0 · 건너뜀 0(15:15:31 – 15:16:01 · load 25.2 → 26.5).

### 6. 2.0.0 고정 프로젝트 — 그대로다

- 바인딩 `version: "2.0.0"` · `rev: 1` 인 프로젝트를 이 브랜치 api 로 내보낸 번들의 `assets/theme/theme.css` sha256 `406d84b1…71fb` = 2.0.0 `.wbtheme` 안 `theme.css` 의 sha256(바이트로 같다). 2.1.0 프로젝트는 `82714a59…db1e`. `views.css`(SDK 기본 뷰) 는 두 번들이 `556341d0…255a` 로 같다 — 이 트랙은 `packages/*` 를 안 바꿨다.
- 그림 값도 2.0.0 그대로다 — 위 표의 2.0.0 열(뿌리 사이 0 · 그리드 테두리 0 · 머리 38px · 셀렉트 여러 줄 · 숫자 안내 오른쪽)이 구현 보고의 «고치기 전 값» 과 같다.

### 7. 게이트의 `layout-guides` 빨강 — 재현 안 됨(이 트랙 탓 아님)

`apps/web/build-test/layout-guides.test.ts` 를 `-t '남이 Flex 를 세로로'` · `--maxWorkers=1` 로 혼자. 실행 수는 통과 + 실패(파일의 나머지 7 은 필터가 건너뜀).

| 판 | 시각 | load(1분) | 통과 + 실패 |
|---|---|---|---|
| 이 브랜치 1 · 2 · 3 | 15:16:01 – 15:16:35 | 26.5 · 24.9 · 22.8 | 1 + 0 · 1 + 0 · 1 + 0 |
| main 테마(2.0.0) 1 · 2 · 3 | 15:16:36 – 15:17:01 | 21.4 · 20.5 · 19.0 | 1 + 0 · 1 + 0 · 1 + 0 |

이 load(기계 15 코어 — 코어 수의 두 배 아래)에서는 두 판 모두 6/6 초록이라 갈리는 값이 없다. 구현 보고의 «동시 넷 두 번 · 2.0.0 테마 4/16 빨강» 과 맞물리면 원래 있던 부하 흔들림으로 읽는다 — 이 판은 그 동시 판을 다시 세우지 않았다. 덧: 이 케이스의 픽스처는 뿌리에 Flex 둘 · Grid · 빈 Flex · 글 스물이라 새 뿌리 8px 을 받는다 — Flex 끼리 자리를 바꿔도 같은 8px 이라 «문서 높이 그대로» 전제가 깨지지 않는다(초록이 받친다).

### 8. 판 · 체크섬 — 맞다

- `pnpm -C system-themes/admin build` 산출물 `system-admin-2.1.0.wbtheme` sha256 `f2da81ae5cf965d7…199f` = `checksums.json` 의 2.1.0 줄. 2.0.0 줄은 브랜치 diff 에서 쉼표만 붙었다(값 `52800973…a3b0` 그대로 · 그 값으로 main 에서 다시 지은 판과 같다).
- `git grep -n '2\.0\.0\|2\.1\.0' -- system-themes packages/test-support apps`(체크섬 파일 밖): 판 이름을 쓰는 케이스는 `system-themes/admin/test/admin.test.ts:148`(`2.1.0`)뿐이고 맞다 · `package.json` · `manifest.ts` 2.1.0. `packages/test-support` 는 판을 글자로 안 쓴다. 나머지는 무관(다른 테마 이름 · IP 대역) 또는 주석 둘 — `apps/web/build-test/canvas-drop-below.test.ts:502`(«기본테마 2.0.0 에서 칸 높이 809 · 496px» — 뿌리 글 마흔 판이라 2.1.0 에서도 같은 값일 것 · 안 잼) · `apps/web/build-test/rv-pv-preview.test.ts:145`(«2.0.0 의 «주문 목록» 은 264px» — 그리드 꼴이 바뀌어 2.1.0 에서는 다를 수 있다 · 안 잼). 둘 다 그 판에서 잰 이력 값을 적은 주석이고 단언이 아니다.
- jsdom `pnpm vitest run system-themes/admin/test` 2 파일 · 41/41.

## 남은 것

- L1 · L2 는 판단 몫(고치지 않음). L1 을 닫으려면 뿌리 줄의 특이도를 올리거나 Tree · Media 의 제 `margin: 0` 을 `margin-top: 0` 으로 좁힌다 — 같은 꼴이 구역 · 탭 패널 · 팝업 몸통에도 있어 한 자리만 고치면 갈린다.
- 못 잰 것: 레이아웃(`Page > … Slot …`)에 든 페이지 — 셀렉터로 보면 레이아웃 뿌리의 `Slot` 도 8px 을 받는다(그 밑에 바닥 띠 구역이 있으면 8px 틈이 설 것이다 — 코드로 본 것). 이 탐침은 레이아웃을 세우지 않아 값이 없다. 캔버스(편집 모드) 판은 번들과 같은 CSS 라 따로 안 쟀다 — 끌기 · 팝업 파일 셋의 초록이 받친다.
- 서버 · vitest 는 남지 않았다(체인 끝 `ps` 에 이 워크트리의 vitest 0 · 판 거둠 0).

## 탐침 원문

설정(`vitest.probe.config.ts` — 스크래치에 `node_modules` 심링크):

```ts
import { defineConfig } from 'vitest/config'
import base from '/Users/jang2162/orca/workspaces/wirebound/feat-skala-theme/vitest.browser.config.ts'
export default defineConfig({
  ...base,
  root: '/Users/jang2162/orca/workspaces/wirebound/feat-skala-theme',
  test: { ...base.test, dir: '/private/tmp/claude-501/-Users-jang2162-orca-workspaces-wirebound-feat-skala-theme/feb0d8aa-3a03-4eed-a120-5ab49040e4f7/scratchpad/probe', include: ['**/*.probe.ts'], exclude: ['**/node_modules/**'], maxWorkers: 1 },
})
```

탐침(`rvskt.probe.ts` — `RVSKT_OUT` 결과 json · `RVSKT_V200` 2.0.0 `.wbtheme`):

```ts
/**
 * rv-skt 탐침 — 같은 픽스처를 2.1.0(시딩된 최신) 프로젝트와 2.0.0 고정 프로젝트로 세워 내보낸 번들(화면 모드)에서 잰다.
 * 결과는 OUT(json)에 쓴다. 단언하지 않는다(값을 모은다) — 카나리아만 던진다.
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { unzipSync } from '/Users/jang2162/orca/workspaces/wirebound/feat-skala-theme/apps/web/node_modules/fflate/esm/index.mjs'
import { afterAll, beforeAll, describe, it } from 'vitest'
import {
  editorStackPrerequisite,
  startEditorStack,
  type EditorStack,
  type Session,
} from '/Users/jang2162/orca/workspaces/wirebound/feat-skala-theme/apps/web/build-test/editor-stack'
import { exportBundle, openBundlePage, type UnpackedBundle } from '/Users/jang2162/orca/workspaces/wirebound/feat-skala-theme/apps/web/build-test/layout-bundle'

const OUT = process.env.RVSKT_OUT!
const V200 = process.env.RVSKT_V200!
const 전제 = await editorStackPrerequisite()
if (!전제.ok) throw new Error('전제 없음 ' + 전제.reason)

type N = { id: string; type: string; props?: Record<string, unknown>; children?: N[]; zones?: Record<string, N[]>; variant?: string; weight?: number }
const T = (id: string, content: string, role?: string): N => ({ id, type: 'Text', props: { content, ...(role ? { role } : {}) } })
const B = (id: string, label: string, variant?: string): N => ({ id, type: 'Button', props: { label }, ...(variant ? { variant } : {}) })
const col = (id: string, label: string, c: N): N => ({ id, type: 'GridColumn', props: { label }, children: [c] })
const F = (id: string, label: string, pieces: N[]): N => ({ id, type: 'Field', props: { label }, children: pieces })

function grid(p: string, opts: { head?: boolean; foot?: boolean; empty?: boolean; variant?: string; wide?: boolean } = {}): N {
  const { head = true, foot = true } = opts
  const cols = opts.wide
    ? Array.from({ length: 10 }, (_, i) => col(`${p}_c${i}`, `긴열이름${i}`, T(`${p}_c${i}t`, `값-${i}-2026-11-10`)))
    : [col(`${p}_c1`, '번호', T(`${p}_c1t`, '3')), col(`${p}_c2`, '제목', T(`${p}_c2t`, '공지 제목')), col(`${p}_c3`, '등록일', T(`${p}_c3t`, '2026-11-10'))]
  const zones: Record<string, N[]> = { rows: [{ id: `${p}_r`, type: 'GridRow', props: { repeat: 3 } }] }
  if (head) {
    zones.headStart = [T(`${p}_h`, opts.wide ? '아주긴결과제목검색결과총삼백이십건입니다' : '검색결과 총 3건')]
    zones.headEnd = opts.wide
      ? [B(`${p}_b1`, '엑셀 다운로드'), B(`${p}_b2`, '일괄 삭제'), B(`${p}_b3`, '등록', 'primary')]
      : [B(`${p}_b1`, '등록', 'primary'), B(`${p}_b2`, '삭제')]
  }
  if (foot) zones.footer = [{ id: `${p}_pg`, type: 'Pagination', props: { total: 320, pageSize: 10 } }]
  return { id: p, type: 'DataGrid', props: { ...(opts.empty ? { empty: true } : {}) }, children: cols, zones, ...(opts.variant ? { variant: opts.variant } : {}) }
}

const ROOT: N[] = [
  { id: 'r_sf', type: 'SearchForm', props: {}, children: [F('r_sf_f', '키워드', [{ id: 'r_sf_i', type: 'Input', props: {} }])], zones: { actions: [B('r_sf_go', '검색', 'primary')] } },
  grid('r_grid', { head: false, foot: false }),
  { id: 'r_ef', type: 'EntryForm', props: { title: '등록' }, children: [{ id: 'r_ef_ft', type: 'FormTable', props: {}, children: [F('r_ef_f', '이름', [{ id: 'r_ef_i', type: 'Input', props: {} }])] }] },
  { id: 'r_card', type: 'Card', props: { title: '카드' }, children: [T('r_card_t', '카드 글')] },
  { id: 'r_sec', type: 'Section', props: {}, children: [T('r_sec_t', '구역 글')] },
  { id: 'r_tabs', type: 'Tabs', props: {}, children: [{ id: 'r_tab1', type: 'TabPanel', props: { label: '탭1' }, children: [T('r_tab1_t', '탭 글')] }] },
  { id: 'r_flex', type: 'Flex', props: {}, children: [B('r_flex_b1', '가'), B('r_flex_b2', '나')] },
  { id: 'r_gridl', type: 'Grid', props: { columns: 2 }, children: [T('r_gl_1', '칸1'), T('r_gl_2', '칸2')] },
  T('r_tb', '본문 글'),
  T('r_th', '제목 글', 'h3'),
  T('r_tc', '캡션 글', 'caption'),
  { id: 'r_link', type: 'Link', props: { label: '뿌리 링크' } },
  { id: 'r_kv', type: 'KeyValue', props: {} },
  { id: 'r_div', type: 'Divider', props: {} },
  { id: 'r_media', type: 'Media', props: {} },
  { id: 'r_ph', type: 'Placeholder', props: {} },
  B('r_btn', '뿌리 단추'),
  { id: 'r_pg', type: 'Pagination', props: {} },
  { id: 'r_ft', type: 'FormTable', props: {}, children: [F('r_ft_f', '라벨', [{ id: 'r_ft_i', type: 'Input', props: {} }])] },
  { id: 'r_in', type: 'Input', props: {} },
  { id: 'r_tree', type: 'Tree', props: {} },
]

// 글 꼴 사이 — 뿌리의 Text 와 다른 글 꼴이 번갈아 선다.
const TEXTS: N[] = [
  T('t1', '글 하나'),
  { id: 't_link', type: 'Link', props: { label: '링크 하나' } },
  T('t2', '글 둘'),
  { id: 't_kv', type: 'KeyValue', props: {} },
  T('t3', '글 셋'),
  { id: 't_div', type: 'Divider', props: {} },
  T('t4', '글 넷'),
  T('t5', '큰 제목', 'h2'),
  { id: 't_kv2', type: 'KeyValue', props: {} },
  { id: 't_card', type: 'Card', props: { title: '카드' }, children: [T('t_card_t', '카드 글')] },
  { id: 't_kv3', type: 'KeyValue', props: {} },
  T('t6', '끝 글'),
]

const CONTAINERS: N[] = [
  { id: 'c_card', type: 'Card', props: { title: '카드' }, children: [grid('g_card')] },
  { id: 'c_cardb', type: 'Card', variant: 'borderless', props: { title: '테두리 없는 카드' }, children: [grid('g_cardb')] },
  { id: 'c_tabs', type: 'Tabs', props: {}, children: [{ id: 'c_tab', type: 'TabPanel', props: { label: '탭' }, children: [grid('g_tab')] }] },
  { id: 'c_sec', type: 'Section', props: {}, children: [grid('g_sec')] },
  { id: 'c_grid', type: 'Grid', props: { columns: 2 }, children: [grid('g_cell'), grid('g_cell2', { head: false })] },
  { id: 'c_ft', type: 'FormTable', props: { columns: 1 }, children: [F('c_ft_f', '목록', [grid('g_ft')])] },
  grid('g_nohead', { head: false }),
  grid('g_nofoot', { foot: false }),
  grid('g_bare', { head: false, foot: false }),
  grid('g_empty', { empty: true }),
  grid('g_feat', { variant: 'featured' }),
  grid('g_wide', { wide: true }),
  { id: 'c_efcard', type: 'Card', props: { title: '폼 카드' }, children: [{ id: 'g_ef', type: 'EntryForm', props: { title: '등록 폼' }, children: [{ id: 'g_ef_ft', type: 'FormTable', props: {}, children: [F('g_ef_f', '이름', [{ id: 'g_ef_i', type: 'Input', props: {} }])] }], zones: { actions: [B('g_ef_s', '저장', 'primary')] } }] },
  { id: 'c_efft', type: 'FormTable', props: { columns: 1 }, children: [F('c_efft_f', '폼', [{ id: 'g_ef2', type: 'EntryForm', props: { title: '값 칸 폼' }, children: [] }])] },
]

const LONG = '공지사항과 안내사항 전체 그리고 더 긴 값이 붙는 셀렉트'
const SEL_FIELDS: N[] = []
for (const size of ['short', 'medium', 'long'] as const) {
  const cases: [string, Record<string, unknown>][] = [
    ['val', { options: [{ label: 'A', selected: true }] }],
    ['long', { options: [{ label: LONG, selected: true }] }],
    ['ph', { placeholder: '- 전체 -' }],
    ['phlong', { placeholder: '== 아주 긴 안내 문구를 넣은 셀렉트입니다 ==' }],
    ['dis', { options: [{ label: LONG, selected: true }], disabled: true }],
    ['inv', { options: [{ label: LONG, selected: true }], invalid: true }],
  ]
  for (const [name, props] of cases) {
    SEL_FIELDS.push(F(`sf_${size}_${name}`, `${size} ${name}`, [
      { id: `s_${size}_${name}`, type: 'Select', props: { size, ...props } },
      { id: `i_${size}_${name}`, type: 'Input', props: { size, value: 'x', ...(name === 'dis' ? { disabled: true } : {}), ...(name === 'inv' ? { invalid: true } : {}) } },
    ]))
  }
}
const SELECTS: N[] = [
  { id: 's_ft', type: 'FormTable', props: { columns: 1 }, children: SEL_FIELDS },
  { id: 's_flex', type: 'Flex', props: {}, children: [
    { id: 's_w2', type: 'Select', weight: 2, props: { options: [{ label: LONG, selected: true }] } },
    { id: 's_w1', type: 'Input', weight: 1, props: { value: 'x' } },
  ] },
  { id: 's_ft2', type: 'FormTable', props: { columns: 2 }, children: [
    F('s2a', '두열 셀렉트', [{ id: 's_c2', type: 'Select', props: { size: 'long', options: [{ label: LONG, selected: true }] } }, { id: 'i_c2', type: 'Input', props: { size: 'long', value: 'x' } }]),
    F('s2b', '둘째', [{ id: 's_c2b', type: 'Select', props: { size: 'short', placeholder: '- 전체 -' } }]),
  ] },
]

const NUMS: N[] = [
  { id: 'n_ft', type: 'FormTable', props: { columns: 1 }, children: ['normal', 'readonly', 'disabled', 'invalid'].flatMap((st) => [
    F(`nf_${st}_v`, `${st} 값`, [{ id: `n_${st}_v`, type: 'Input', props: { kind: 'number', size: 'medium', value: '120000', ...(st !== 'normal' ? { [st]: true } : {}) } }]),
    F(`nf_${st}_p`, `${st} 안내`, [{ id: `n_${st}_p`, type: 'Input', props: { kind: 'number', size: 'medium', placeholder: '예) 2026', ...(st !== 'normal' ? { [st]: true } : {}) } }]),
  ]) },
]

const POPUP_BODY: N[] = [grid('g_pop')]

const ROOT_LOOK = `(() => {
  const root = document.querySelector('.wb-export-canvas [data-wb-component="Page"]')
  const kids = Array.from(root.children)
  const r = (n) => Math.round(n * 100) / 100
  return kids.map((el, i) => {
    const cs = getComputedStyle(el), b = el.getBoundingClientRect()
    const next = kids[i + 1]
    return { id: el.getAttribute('data-wb-id'), type: el.getAttribute('data-wb-component'), tag: el.tagName.toLowerCase(), display: cs.display,
      mt: cs.marginTop, mb: cs.marginBottom, h: r(b.height), gapToNext: next ? r(next.getBoundingClientRect().top - b.bottom) : null }
  })
})()`

// 그리드 하나의 상자 · 넘침. 줄임표로 자르는 요소 · 스크롤 조각 안 글은 넘침에서 뺀다(스크롤 조각은 굴러가는 것이 계약).
const GRID_LOOK = `((ids) => {
  const r = (n) => Math.round(n * 100) / 100
  const out = {}
  const docW = document.documentElement.clientWidth
  for (const id of ids) {
    const g = document.querySelector('.wb-export-canvas [data-wb-id="' + id + '"]')
    if (!g) { out[id] = 'none'; continue }
    const gb = g.getBoundingClientRect(), cs = getComputedStyle(g)
    const head = g.querySelector(':scope > [data-wb-part="head"]'), foot = g.querySelector(':scope > [data-wb-part="footer"]'), scroll = g.querySelector(':scope > [data-wb-part="scroll"]')
    const past = []
    const walker = document.createTreeWalker(g, NodeFilter.SHOW_TEXT)
    let n
    while ((n = walker.nextNode())) {
      if (!n.textContent.trim()) continue
      const el = n.parentElement
      if (el.closest('[data-wb-part="scroll"]')) continue
      let clipped = false
      for (let a = el; a && a !== g; a = a.parentElement) { const s = getComputedStyle(a); if (s.textOverflow === 'ellipsis' && s.overflow !== 'visible') clipped = true }
      if (clipped) continue
      const range = document.createRange(); range.selectNodeContents(n)
      for (const rect of range.getClientRects()) {
        if (rect.width === 0) continue
        if (rect.right > gb.right + 0.5 || rect.left < gb.left - 0.5 || rect.right > docW + 0.5) past.push(n.textContent.trim().slice(0, 20) + ' ' + r(rect.right - gb.right))
      }
    }
    // 그리드 밖 그릇(테두리가 있는 가장 가까운 조상)과의 간격
    const sides = {}
    for (const side of ['Top', 'Bottom', 'Left', 'Right']) {
      let a = g.parentElement, found = null
      while (a && !a.classList.contains('wb-export-canvas')) {
        const s = getComputedStyle(a)
        if (parseFloat(s['border' + side + 'Width']) > 0) { found = a; break }
        a = a.parentElement
      }
      if (found) {
        const ab = found.getBoundingClientRect()
        const bw = parseFloat(getComputedStyle(found)['border' + side + 'Width'])
        const k = side.toLowerCase()
        const gap = side === 'Top' || side === 'Left' ? gb[k] - (ab[k] + bw) : (ab[k] - bw) - gb[k]
        sides[side] = (found.getAttribute('data-wb-component') || found.tagName) + '/' + (found.getAttribute('data-wb-part') || '') + ' gap ' + r(gap)
      }
    }
    out[id] = {
      box: [r(gb.left), r(gb.top), r(gb.width), r(gb.height)],
      border: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth].join(' '), radius: cs.borderTopLeftRadius,
      head: head ? { h: r(head.getBoundingClientRect().height), sw: head.scrollWidth, cw: head.clientWidth, line: getComputedStyle(head).borderBottomWidth } : null,
      foot: foot ? { h: r(foot.getBoundingClientRect().height), sw: foot.scrollWidth, cw: foot.clientWidth, line: getComputedStyle(foot).borderTopWidth } : null,
      scroll: scroll ? { sw: scroll.scrollWidth, cw: scroll.clientWidth } : null,
      past, sides,
    }
  }
  out.__doc = { scrollWidth: document.documentElement.scrollWidth, clientWidth: docW }
  return out
})`

// 세로 띠(그리드 왼끝 + 6px)의 색 줄 — 런 길이로.
const STRIP = `(async ([b64, w, h]) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode()
  const c = document.createElement('canvas'); c.width = w; c.height = h
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0)
  const d = ctx.getImageData(0, 0, w, h).data
  const runs = []
  const px = (i) => d[i] + ',' + d[i + 1] + ',' + d[i + 2]
  if (w === 1) {
    let prev = null, start = 0
    for (let y = 0; y < h; y++) { const p = px(y * 4); if (p !== prev) { if (prev !== null) runs.push([start, y - start, prev]); prev = p; start = y } }
    runs.push([start, h - start, prev])
  } else {
    let prev = null, start = 0
    for (let x = 0; x < w; x++) { const p = px(x * 4); if (p !== prev) { if (prev !== null) runs.push([start, x - start, prev]); prev = p; start = x } }
    runs.push([start, w - start, prev])
  }
  return runs
})`

const SELECT_LOOK = `((ids) => {
  const r = (n) => Math.round(n * 100) / 100
  const q = (id) => document.querySelector('.wb-export-canvas [data-wb-id="' + id + '"]')
  const lines = (el) => { const range = document.createRange(); range.selectNodeContents(el); return new Set(Array.from(range.getClientRects()).filter((x) => x.width > 0).map((x) => Math.round(x.top))).size }
  const out = {}
  for (const id of ids) {
    const s = q(id); if (!s) { out[id] = 'none'; continue }
    const t = s.querySelector(':scope > [data-wb-part="text"]')
    const cs = getComputedStyle(s), sb = s.getBoundingClientRect(), tb = t.getBoundingClientRect()
    const after = getComputedStyle(s, '::after')
    const inp = q(id.replace(/^s_/, 'i_'))
    const contentRight = sb.right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight)
    const arrowLeft = contentRight - parseFloat(after.marginRight) - parseFloat(after.width)
    const range = document.createRange(); range.selectNodeContents(t)
    const rects = Array.from(range.getClientRects()).filter((x) => x.width > 0)
    const textRight = rects.length ? Math.max(...rects.map((x) => x.right)) : null
    out[id] = { h: r(sb.height), w: r(sb.width), inputH: inp ? r(inp.getBoundingClientRect().height) : null, lines: lines(t), clipped: t.scrollWidth > t.clientWidth + 0.5,
      textBoxRight: r(tb.right), visibleTextRightVsArrow: r(arrowLeft - Math.min(tb.right, textRight ?? tb.right)), arrowGapFromBox: r(arrowLeft - tb.right),
      text: t.textContent, color: getComputedStyle(t).color, arrowColor: after.borderRightColor, opacity: cs.opacity, bg: cs.backgroundColor, display: cs.display }
  }
  return out
})`

const NUM_LOOK = `((ids) => {
  const r = (n) => Math.round(n * 100) / 100
  const out = {}
  for (const id of ids) {
    const s = document.querySelector('.wb-export-canvas [data-wb-id="' + id + '"]')
    const t = s.querySelector(':scope > [data-wb-part="text"]')
    const sb = s.getBoundingClientRect(), tb = t.getBoundingClientRect()
    out[id] = { left: r(tb.left - sb.left), right: r(sb.right - tb.right), text: t.textContent, ph: t.hasAttribute('data-wb-placeholder'), tag: s.tagName }
  }
  return out
})`

const POPUP_LOOK = `(() => {
  const r = (n) => Math.round(n * 100) / 100
  const q = (s) => document.querySelector('.wb-export-canvas ' + s)
  const bar = q('[data-wb-component="Popup"] > [data-wb-part="titlebar"]'), close = q('[data-wb-part="close"]'), title = q('[data-wb-part="title"]')
  const bb = bar.getBoundingClientRect(), cb = close.getBoundingClientRect(), tb = title.getBoundingClientRect()
  return { bar: r(bb.height), close: [r(cb.width), r(cb.height)], closeCenterVsTitle: r((cb.top + cb.bottom) / 2 - (tb.top + tb.bottom) / 2), titleH: r(tb.height) }
})()`

describe('rv-skt', () => {
  let stack: EditorStack
  let alice: Session
  const bundles: Record<string, UnpackedBundle> = {}
  const result: Record<string, any> = {}

  beforeAll(async () => {
    stack = await startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
    const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)
    const ok = (res: { status: number; body: any }, what: string) => {
      if (res.status >= 300) throw new Error(`픽스처 ${what} ${res.status} ${JSON.stringify(res.body)}`)
      return res.body
    }
    // 2.0.0 을 넣는다
    const bytes = readFileSync(V200)
    const sha256 = createHash('sha256').update(bytes).digest('hex')
    const zip = unzipSync(new Uint8Array(bytes))
    const manifest = JSON.parse(new TextDecoder().decode(zip['manifest.json']))
    result.v200 = { sha256, version: manifest.version }
    await stack.query(
      `insert into theme_packages (theme_id, version, name, description, sdk_range, manifest, files, size, sha256, uploaded_by) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,null)`,
      [manifest.id, manifest.version, manifest.name, manifest.description ?? null, manifest.sdk, JSON.stringify(manifest), bytes, bytes.byteLength, sha256],
    )
    result.packages = await stack.query(`select theme_id, version, sha256 from theme_packages order by version`)
    for (const key of ['v21', 'v20']) {
      const project = ok(await call('POST', '/projects', { name: key, slug: `rvskt-${key}-${Date.now().toString(36)}` }), '프로젝트')
      if (key === 'v20') {
        const now = ok(await call('GET', `/projects/${project.id}/theme`), '바인딩')
        ok(await call('PUT', `/projects/${project.id}/theme`, { themeId: 'system-admin', version: '2.0.0', tokens: {}, rev: now.rev }), '2.0.0 고정')
      }
      result[`binding_${key}`] = ok(await call('GET', `/projects/${project.id}/theme`), '바인딩')
      const menu = ok(await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: 'm' }), '메뉴')
      const add = (nodes: N[]) => nodes.map((value, i) => ({ op: 'add', path: `/root/children/${i}`, value }))
      for (const [title, nodes] of Object.entries({ root: ROOT, texts: TEXTS, cont: CONTAINERS, sel: SELECTS, num: NUMS })) {
        const page = ok(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title, kind: 'page' }), title)
        ok(await call('PATCH', `/projects/${project.id}/pages/${page.id}/ops`, { baseSeq: 0, ops: add(nodes) }), `ops ${title}`)
      }
      const popup = ok(await call('POST', `/projects/${project.id}/pages`, { menuNodeId: menu.id, title: 'pop', kind: 'popup' }), 'pop')
      ok(await call('PATCH', `/projects/${project.id}/pages/${popup.id}/ops`, { baseSeq: 0, ops: add(POPUP_BODY) }), 'ops pop')
      bundles[key] = await exportBundle(stack, alice, project.id)
      const css = (readdirSync(bundles[key].dir, { recursive: true }) as string[]).filter((p) => p.endsWith('theme/theme.css'))
      result[`themeCss_${key}`] = css.map((p) => createHash('sha256').update(readFileSync(join(bundles[key].dir, p))).digest('hex'))
      const views = (readdirSync(bundles[key].dir, { recursive: true }) as string[]).filter((p) => p.endsWith('views.css'))
      result[`viewsCss_${key}`] = views.map((p) => createHash('sha256').update(readFileSync(join(bundles[key].dir, p))).digest('hex'))
    }
    result.wbthemeCss_v200 = createHash('sha256').update(zip['theme.css']).digest('hex')
  }, 300_000)

  afterAll(async () => {
    writeFileSync(OUT, JSON.stringify(result, null, 1))
    for (const b of Object.values(bundles)) b.dispose()
    if (stack) result.teardown = await stack.close()
    writeFileSync(OUT, JSON.stringify(result, null, 1))
  }, 120_000)

  it('잰다', async () => {
    const GRIDS = ['g_card', 'g_cardb', 'g_tab', 'g_sec', 'g_cell', 'g_cell2', 'g_ft', 'g_nohead', 'g_nofoot', 'g_bare', 'g_empty', 'g_feat', 'g_wide', 'g_ef', 'g_ef2']
    const SELS = [...['short', 'medium', 'long'].flatMap((s) => ['val', 'long', 'ph', 'phlong', 'dis', 'inv'].map((c) => `s_${s}_${c}`)), 's_w2', 's_c2', 's_c2b']
    const NUMIDS = ['normal', 'readonly', 'disabled', 'invalid'].flatMap((s) => [`n_${s}_v`, `n_${s}_p`])
    for (const key of ['v21', 'v20']) {
      const b = bundles[key]
      result[`pages_${key}`] = Object.keys(b.pages)
      for (const width of [1280, 720, 390]) {
        const tag = `${key}_${width}`
        const open = (name: string) => openBundlePage(stack, b.pages[`m-${name}`]!, { viewport: { width, height: 1000 }, screen: true })
        {
          const { context, page } = await open('root')
          result[`root_${tag}`] = await page.evaluate(ROOT_LOOK)
          await context.close()
        }
        {
          const { context, page } = await open('texts')
          result[`texts_${tag}`] = await page.evaluate(ROOT_LOOK)
          await context.close()
        }
        {
          const { context, page } = await open('cont')
          result[`cont_${tag}`] = await page.evaluate(`${GRID_LOOK}(${JSON.stringify(GRIDS)})`)
          if (width !== 720) {
            const strips: Record<string, any> = {}
            for (const id of GRIDS) {
              const el = page.locator(`.wb-export-canvas [data-wb-id="${id}"]`)
              await el.scrollIntoViewIfNeeded()
              const box = (await el.boundingBox())!
              const x = Math.round(box.x + 6)
              const y0 = Math.max(0, Math.round(box.y - 6))
              const h = Math.round(box.height + 12)
              const shot = await page.screenshot({ clip: { x, y: y0, width: 1, height: h } })
              const vruns = await page.evaluate(`${STRIP}(${JSON.stringify([shot.toString('base64'), 1, h])})`)
              // 가로 띠 — 표 몸 줄 높이(그리드 위끝 + 높이의 60%)에서 왼끝 · 오른끝 주변
              const yy = Math.round(box.y + box.height * 0.6)
              const lx = Math.max(0, Math.round(box.x - 6))
              const left = await page.screenshot({ clip: { x: lx, y: yy, width: 14, height: 1 } })
              const rx = Math.round(box.x + box.width - 8)
              const right = await page.screenshot({ clip: { x: rx, y: yy, width: 14, height: 1 } })
              strips[id] = {
                top: y0 - Math.round(box.y),
                v: vruns,
                left: await page.evaluate(`${STRIP}(${JSON.stringify([left.toString('base64'), 14, 1])})`),
                leftX0: lx - Math.round(box.x),
                right: await page.evaluate(`${STRIP}(${JSON.stringify([right.toString('base64'), 14, 1])})`),
                rightX0: rx - Math.round(box.x + box.width),
              }
            }
            result[`strips_${tag}`] = strips
          }
          await context.close()
        }
        {
          const { context, page } = await open('sel')
          result[`sel_${tag}`] = await page.evaluate(`${SELECT_LOOK}(${JSON.stringify(SELS)})`)
          if (width === 1280) {
            const names: Record<string, string> = {}
            for (const id of ['s_short_long', 's_short_ph', 's_medium_long']) names[id] = await page.locator(`.wb-export-canvas [data-wb-id="${id}"]`).ariaSnapshot()
            result[`selAria_${key}`] = names
          }
          await context.close()
        }
        {
          const { context, page } = await open('num')
          result[`num_${tag}`] = await page.evaluate(`${NUM_LOOK}(${JSON.stringify(NUMIDS)})`)
          await context.close()
        }
        {
          const { context, page } = await open('pop')
          result[`pop_${tag}`] = await page.evaluate(POPUP_LOOK)
          result[`popgrid_${tag}`] = await page.evaluate(`${GRID_LOOK}(["g_pop"])`)
          await context.close()
        }
      }
    }
    writeFileSync(OUT, JSON.stringify(result, null, 1))
  }, 600_000)
})
```

체인(`chain.zsh`):

```zsh
#!/bin/zsh
S=/private/tmp/claude-501/-Users-jang2162-orca-workspaces-wirebound-feat-skala-theme/feb0d8aa-3a03-4eed-a120-5ab49040e4f7/scratchpad
W=/Users/jang2162/orca/workspaces/wirebound/feat-skala-theme
G=/Users/jang2162/Projects/Personal/wirebound/.worktrees/.coord/gate-slots
ST=$S/chain.status
cd $W; eval "$(mise env -s zsh)"
echo "pgid $(ps -o pgid= -p $$ | tr -d ' ')" > $ST
echo "node $(node -v)" >> $ST
touch $G/rv-skt
step() { echo "$(date +%T) load $(uptime | awk -F'load averages: ' '{print $2}') start $1" >> $ST; }
done_() { echo "$(date +%T) done $1 rc=$2" >> $ST; }
# 1 탐침
step probe
RVSKT_OUT=$S/probe-out.json RVSKT_V200=$S/v200/system-themes/admin/dist/system-admin-2.0.0.wbtheme pnpm vitest run -c $S/probe/vitest.probe.config.ts --reporter=default > $S/probe.log 2>&1; rc=$?; done_ probe $rc
# 2 혼자 도는 파일들
for f in admin-drag-sweep popup-attach popup-layer; do
  step $f
  pnpm vitest run -c vitest.browser.config.ts apps/web/build-test/$f.test.ts --maxWorkers=1 --reporter=default --reporter=json --outputFile.json=$S/$f.json > $S/$f.log 2>&1; rc=$?; done_ $f $rc
done
# 3 layout-guides 세 번(이 브랜치)
for i in 1 2 3; do
  step lg-branch-$i
  pnpm vitest run -c vitest.browser.config.ts apps/web/build-test/layout-guides.test.ts --maxWorkers=1 -t '남이 Flex 를 세로로' --reporter=default --reporter=json --outputFile.json=$S/lg-branch-$i.json > $S/lg-branch-$i.log 2>&1; rc=$?; done_ lg-branch-$i $rc
done
# 4 main 테마로 갈아 끼움(백업 · 바이트 비교 복원)
B=$S/backup; mkdir -p $B
for p in system-themes/admin/src/theme.css system-themes/admin/src/manifest.ts system-themes/admin/package.json; do
  cp $W/$p $B/${p//\//__}
  git show f3acecc0:$p > $W/$p
done
step build-main; pnpm -C system-themes/admin build > $S/build-main.log 2>&1; rc=$?; done_ build-main $rc
echo "main sha $(shasum -a 256 system-themes/admin/dist/*.wbtheme)" >> $ST
for i in 1 2 3; do
  step lg-main-$i
  pnpm vitest run -c vitest.browser.config.ts apps/web/build-test/layout-guides.test.ts --maxWorkers=1 -t '남이 Flex 를 세로로' --reporter=default --reporter=json --outputFile.json=$S/lg-main-$i.json > $S/lg-main-$i.log 2>&1; rc=$?; done_ lg-main-$i $rc
done
for p in system-themes/admin/src/theme.css system-themes/admin/src/manifest.ts system-themes/admin/package.json; do
  cp $B/${p//\//__} $W/$p; cmp $B/${p//\//__} $W/$p && echo "restored $p" >> $ST || echo "RESTORE FAIL $p" >> $ST
done
step build-back; pnpm -C system-themes/admin build > $S/build-back.log 2>&1; rc=$?; done_ build-back $rc
echo "back sha $(shasum -a 256 system-themes/admin/dist/*.wbtheme)" >> $ST
echo "status: $(git status --short | wc -l)" >> $ST
rm -f $G/rv-skt
echo "$(date +%T) load $(uptime | awk -F'load averages: ' '{print $2}') END" >> $ST
```
