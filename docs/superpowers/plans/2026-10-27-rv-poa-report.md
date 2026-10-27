# RV-POA 보고 — 6단계 PO-A 팝업 페이지 리뷰

기준: `feat/popup` `ae428fcb`(구현 끝) · 고치기 전 소스 `6b84cefc`. Node v24.21.0 · 자기 Postgres 5503. 리뷰라 소스를 고치지 않았다 — 재현 판은 스크래치에 두고 경로와 값을 적는다(스크래치는 재부팅에 지워지므로 값은 이 파일이 갖는다).

**요약:** 높은 무게 하나(H1 — `0033` 이 여러 프로젝트에 든 멤버의 개인 모듈로 남의 프로젝트 화면 페이지를 팝업으로 바꾼다) · 중간 셋(M1 번들의 팝업 안 «이동» 이 끊김 · M2 `check` 가 감싼 팝업 뷰를 지나 덮개 위 몸통이 안 구름 · M3 실브라우저 판이 덮개의 굴림 따라가기를 안 잼) · 낮음 넷. 겹친 잠금 · 남의 편집을 말없이 덮음 · 되돌리기 어긋남 · 인가 우회는 이 차수의 판에서 안 나왔다(종류 바꾸기의 리베이스 · 되돌리기 · 서버 판정은 «잰 값» 절). 전부 PO-A 가 연 길이고 L3 만 원래 있던 길 위에 PO-A 가 더한 것이다. PO-B 는 겨누지 않았다.

## 발견

| id | 무게 | 무엇 | 재현 값 | 재현 법 | 연 길 |
| --- | --- | --- | --- | --- | --- |
| H1 | 높음 | **`0033` 이 남의 프로젝트의 화면 페이지를 팝업으로 바꾼다** — 개인 모듈은 프로젝트에 안 매이는데, «그 프로젝트 멤버의 개인 모듈» 을 대상 출처로 세어, 두 프로젝트에 다 든 멤버가 한쪽(P)에서 쓰려고 저장한 묶음이 다른 쪽(Q)의 같은 경로 페이지를 옮긴다. Q 안에서는 아무도 그 페이지를 «팝업 열기» 로 안 연다 | P(앨리스 owner) «목록» → `openModal page:관리자/등록` · Q(앨리스 editor · 캐럴 owner)의 같은 경로 «등록»(화면 · Q 안에서 아무도 안 엶) · 앨리스의 개인 모듈 하나(`openModal page:관리자/등록` · Q 에 안 넣음): 0033 뒤 P «등록» `Popup` · **Q «등록» `Popup`** · 로그 «팝업으로 옮긴 페이지 2». 대조: Q 를 떠난 캐럴의 개인 모듈만 여는 Q «상세» 는 `Page` 그대로 | 스크래치 `probe/mig0033.probe.ts`(제 DB `wb_rvpoa_0033_<pid>` · 0032 까지 올린 뒤 0033) | PO-A 가 연 길 — `0033` 의 출처 판정(`apps/api/src/db/migrations/0033-modal-popup.ts` 의 `personal_modules … where owner_id in (select user_id from project_members where project_id = …)`). 구현 «결정» 4 가 막으려던 «멤버가 아닌 사람» 은 막았으나 «여러 프로젝트의 멤버» 는 안 갈랐다. 케이스(`modal-popup-migration.test.ts`)의 Q 는 앨리스가 멤버가 아니라 이 판이 안 선다. 넣지 않은 개인 모듈의 대상은 어느 프로젝트의 것인지 알 수 없다 — 가장 좁은 고침은 개인 모듈을 출처에서 빼는 것이다(넣은 묶음은 이미 `pages.schema` 에 있다) |
| M1 | 중간 | **번들에서 덮개 위 팝업 안의 «이동» · 화면 페이지를 겨눈 «팝업 열기» 가 «이 번들에 없는 페이지입니다» 로 끊긴다** — 팝업 안 요청을 여는 페이지의 `hrefs` 로 푸는데, `hrefs` 는 여는 페이지 문서가 겨눈 대상만 싣는다(`packages/exporter/src/bundle/index.ts` 의 `hrefsFor(page.document, …)` — 실린 팝업 문서의 대상은 안 센다) | 목록(→ `openModal page:검색`) · 팝업 «검색»(`navigate page:상세` · `openModal page:상세`) · 화면 «상세» 번들의 `pages/목록.html`: `hrefs` = `{"page:검색": …}` 뿐 · 덮개 1 겹 · 팝업 안 «이동» 누름 → 옮김 0 · 상태 줄 «이 번들에 없는 페이지입니다: page:상세» · 화면 대상 «팝업 열기» 도 같은 줄 | 스크래치 `probe/bundle-nav.probe.tsx`(아래 «재현 판») | PO-A 가 연 길 — `6b84cefc` 에서는 «팝업 열기» 가 그 페이지 파일로 옮겨, 그 파일의 `hrefs` 가 제 대상을 실었다 |
| M2 | 중간 | **`wb-theme check` P1 ~ P4 가 «body 조각이 뿌리의 직계» 를 안 재 — 감싸는 요소 하나를 더한 팝업 뷰가 깨끗하게 지나고, 덮개 위에서 몸통이 안 굴러 바닥 단추가 창 밖으로 간다** — 덮개 층의 굴림 규칙은 `[data-wb-popup-frame] > [data-wb-component="Popup"] > [data-wb-part="body"]`(SDK `structure.tsx` 의 `zeroRule`)로 직계에만 걸린다. P3 는 «몸통 자식이 body 안 · body 하나» 만 센다 | ① `check`: 기본 꼴 뷰 0 건 · **제목줄 · body · 바닥을 `<div class="inner">` 하나로 감싼 뷰 0 건** · body 만 `<div>` 로 감싼 뷰 0 건(대조: ✖ 를 `<span data-wb-part="close">` 안 단추로 둔 뷰는 P1 3 건). ② 실 Chrome(창 1280 × 600 · SDK 기본 CSS · 몸통 40 줄): 기본 꼴 body `overflow-y: auto` · clientHeight 474 / scrollHeight 1440 · «저장» 아래 끝 567(창 안). **감싼 꼴 body `visible` · 1384 / 1384 · «저장» 아래 끝 1554 · 문서 scrollHeight 600**(층이 `position: fixed` 라 굴릴 길이 없다) | 스크래치 `probe/check-wrap.probe.ts`(`checkTheme` — `check.test.ts` 의 `files` 도우미) · `bprobe/wrap-css.probe.ts`(`defaultViewsCss()` 를 실은 정적 판) | PO-A 가 연 길 — 새 계약(P3)과 새 층 CSS |
| M3 | 중간 | **실브라우저 판(`apps/web/build-test/popup-layer.test.ts`)이 «캔버스를 굴려도 덮개가 보이는 칸을 따라온다» 를 안 잰다** — 덮개 구간(`usePopupArea`)의 굴림 리스너를 뗀 변조(VB13)에 17/17 초록. 그 변조 판에서 탐침은 굴린 뒤 ✖ 가 칸 밖(y −1884)으로 가고, 칸 왼아래 점의 맨 위 요소가 **뒤 화면의 «아래 열기» 단추**(덮개가 안 덮음 — 뒤 화면을 누를 수 있다)다 | 고치기 전(지금 소스): 굴림 2240 뒤 ✖ y 331(칸 49 ~ 858 안) · 왼아래 점 = 층. VB13: ✖ y −1884.75 · 왼아래 점 = `n_open_bottom` · 판 17/17 초록 | 스크래치 `bprobe/layer.probe.ts` «scroll host while open»(뒤 화면 80 줄 + 맨 아래 여는 단추) · 변조 표 VB13 · VB13p | PO-A 가 연 길(새 장치를 재는 판이 없다) — 지금 소스는 옳다 |
| L1 | 낮음 | **에디터 뷰 모드에서 «팝업 열기» 단추를 더블클릭하면 같은 팝업이 두 겹 쌓인다** — 열기가 트리 · 페이지 조회를 기다리는 동안 덮개가 아직 없어 둘째 누름도 열기를 낸다(번들은 덮개가 곧바로 서서 안 난다) | 실 Chrome 창 1440: `dblclick` 뒤 1.5s 겹 수 **2** | 스크래치 `bprobe/layer.probe.ts` «double click opener» | PO-A 가 연 길 |
| L2 | 낮음 | **실브라우저 판이 상자 안 Tab 순환을 안 잰다 — jsdom 만 잰다** — 층의 Tab 처리를 통째로 뗀 변조(VB1)에 실브라우저 17/17 초록 · jsdom(V1)은 «Tab 은 맨 위 상자 안을 돈다» 하나가 값으로 죽는다. 지금 소스의 실 Chrome 값은 옳다(Tab 9 번 · Shift+Tab 9 번 모두 상자 안을 돈다 — ✖ → «하나» → «상세를 팝업으로» → «취소» → «저장» → ✖) | VB1 17/17 · V1 53 중 1 · 탐침 «Tab cycle» | 스크래치 `bprobe/layer.probe.ts` «Tab cycle» | PO-A 가 연 길 — 지침 «jsdom 값은 실브라우저 값이 아니다» 의 포커스 자리 |
| L3 | 낮음 | **사람이 적은 대상 글자(공백 · 접두 없음)를 에디터 뷰 모드는 풀어 팝업을 열고, 번들 · lint 는 «없는 페이지» 라 한다** — 에디터는 `matchPageTargets`(마디마다 공백을 걷고 접두를 안 따진다), 번들의 `popups` · `hrefs` 는 타겟 글자와 **글자 그대로** 견준다(`exporter/src/bundle/index.ts` 의 `popupDocs.get(target)` · `targets.has`), lint 도 `targets.has(action.target)` 이다. `0033` 은 에디터 쪽(공백을 걷는 풀이)이라 옮긴다 | 번들 탐침의 `page: 검색 `(공백 낀 글자): `pages/목록.html` 의 `popups` 키 = `['page:검색']` 뿐 · `hrefs` 키도 `page:검색` 뿐 → 번들 «이 번들에 없는 페이지입니다» 의 길 · 같은 글자에 `matchPageTargets` = 1 건(에디터는 연다) | `probe/bundle-nav.probe.tsx` 의 `n_open_sp` · `EDITOR match spaced` 줄 | 원래 있던 길(`navigate` 의 `hrefs` · lint 가 글자 그대로였다 — 에디터는 옮기지 않아 안 보였다). PO-A 가 에디터에서 그 글자로 «연다» 를 더해 둘이 다른 말을 하게 됐다 |
| L4 | 낮음 | **`0033` 이 페이지 표와 스냅샷 payload 에서 다른 출처로 센다** — 페이지 표는 프로젝트 모듈 · 개인 모듈까지 세고, 스냅샷은 payload 의 페이지 · 레이아웃만 센다. 모듈만 여는 페이지는 지금 문서가 팝업이 되고 그 스냅샷 안의 판은 화면으로 남아, 그 스냅샷을 복원하면 화면으로 돌아간다(이웃의 «팝업 열기» 는 그대로 — lint `modal-target-not-popup`) | P «모듈대상»(프로젝트 모듈 하나만 연다) · 그 페이지가 든 스냅샷: 0033 뒤 지금 문서 `Popup` · **스냅샷 안 판 `Page`** | `probe/mig0033.probe.ts`(확장 판 — 로그 «팝업으로 옮긴 페이지 3 · 스냅샷 0 개») | PO-A 가 연 길 |

## 변조 표

리뷰어는 하나다. 변조마다 백업(경로 전체 이름 — `packages__renderer__src__popup-layer.tsx` 꼴) → 한 곳 바꿈(맞은 수 1 확인) → 그 케이스 파일만 → 바이트 비교 복원(`cmp` 같음 확인)이다. 실행 수는 통과 + 실패. 시각은 2026-10-27(건 시각 ~ 푼 시각), 부하는 건 순간의 1분 load.

| id | 자리 | 바꿈 | 건 ~ 푼 | load | 돌린 것 | 실행 · 실패 | 죽은 케이스 «실패 값» |
| --- | --- | --- | --- | --- | --- | --- | --- |
| V1 | `packages/renderer/src/popup-layer.tsx` | `if (event.key !== 'Tab') return` → `return`(층이 포커스를 안 가둠) | 11:38:51 ~ 11:38:56 | 10.1 | `renderer/test/popup-layer.test.tsx` · `web/test/canvas/interaction-runtime.test.tsx` · `exporter/test/bundle-popups.test.tsx` | 53 · 1 | «Tab 은 맨 위 상자 안을 돈다» «expected null to be 'close'» |
| V2 | 같은 파일 | `POPUP_DEPTH_MAX = 5` → `6` | 11:38:56 ~ 11:39:01 | 9.6 | 같음 | 53 · 2 | 번들 «서로를 여는 팝업은 다섯 겹에서 멈추고 …» «expected …(6) to have a length of 5 but got 6» · 층 «겹은 다섯까지 …» «expected [ true ×5, …(2) ] to deeply equal [ true ×5, false ]» |
| V4b | `apps/api/src/db/migrations/0033-modal-popup.ts` | `down` 이 바닥을 몸통 **앞**에(`[...footer, ...children]`) | 11:39:01 ~ 11:39:05 | 9.7 | `api/test/modal-popup-migration.test.ts` | 6 · 1 | «down — 옛 문서로 돌아간다 · …바닥 노드를 몸통 끝에 붙여 내린다» «expected { root: … } to deeply equal { version: 5, root: … }» |
| V3b | 같은 파일 | 스냅샷 payload 의 `pages[]` 를 대상 출처에서 뺌 | 11:39:05 ~ 11:39:10 | 9.7 | 같음 | 6 · 3 | «한 페이지로 풀리는 대상만 옮긴다 …»(옮긴 수 줄) · «스냅샷 — payload 의 메뉴로 풀어 …» · «down …» — 셋 다 값 |
| V5 | `packages/theme-kit/src/check.ts` | `body` 조각을 노드 소유로 거르지 않고 첫 하나만(`[...querySelectorAll].slice(0, 1)`) | 11:39:10 ~ 11:39:25 | 9.7 | `theme-kit/test/check.test.ts` | 31 · 1 | «P3 — … body 가 둘이면 팝업마다 선다 …» «expected [] to deeply equal [ Array(3) ]» |
| VB0 | (대조 — 바꿈 없음) | — | 11:39:40 ~ 11:39:58 | 11.9 | `-c vitest.browser.config.ts --maxWorkers=1 apps/web/build-test/popup-layer.test.ts` | 17 · 0 | — |
| VB1 | `popup-layer.tsx` | V1 과 같음 | 11:39:58 ~ 11:40:17 | 11.8 | 실브라우저 같은 파일 | **17 · 0** | 없음 — L2 |
| VB13 | `apps/web/src/canvas/canvas-popups.tsx` | 덮개 구간의 `scroller?.addEventListener('scroll', measure, …)` 를 뗌 | 11:40:17 ~ 11:40:35 | 10.7 | 실브라우저 같은 파일 | **17 · 0** | 없음 — M3 |
| VB13p | 같음 | 같음 | 11:41:03 ~ 11:41:12 | 12.1 | 스크래치 탐침 `bprobe/layer.probe.ts -t scroll` | 1 · 0 | (탐침은 값을 찍는다) ✖ y 331 → **−1884.75** · 왼아래 점 층 → **`n_open_bottom`** |

구현 변조 표에 이미 있는 꼴은 다시 안 돌렸다: «`0033` 이 스냅샷 `layouts[]` 를 건너뜀» = 구현 G6(6 · 3) · «`down` 이 바닥을 지움» = 구현 G8(6 · 1). V4b 는 G8 의 옆 꼴(차례)이다. «P 규칙에 감싸는 요소 하나 더한 깨는 뷰» 는 소스 변조가 아니라 깨는 뷰 픽스처라 M2 에 적었다 — **어느 P 케이스도 안 죽는다**(`check` 0 건).

## 잰 값 — 결함이 아닌 것

판마다 같은 워크트리 · 같은 소스(`ae428fcb`, 변조 없음)다. 실브라우저 판은 `editor-stack`(일회용 DB · api · vite dev · headless Chrome)을 스크래치 설정(`root` = 체크아웃 · `test.dir` = 스크래치 · 루트 설정의 `build` 프로젝트 `esbuild` · `resolve`)으로 띄웠다.

| 확인할 것 | 판 | 값 |
| --- | --- | --- |
| 5 종류 바꾸기 — 리베이스 | 스크래치 `probe/kind-rebase.probe.ts` — 팝업(몸통 1 · 바닥 [취소][저장]) → 화면 묶음을 `anchorOps` 로 붙잡고 남의 문서에 `rebaseAnchored` | 묶음 = `test /root/type` · `move` 둘 · `remove /root/zones` · `remove /root/props` · `replace /root/type`. 남이 **바닥에 단추를 더함 → `null`(못 얹음 — 말없이 안 걷는다)** · 남이 바닥 단추를 뺌 → `null` · 남이 바닥 단추 이름을 고침 → 고친 이름이 몸통 끝으로 따라옴 · 남이 몸통에 더함 → 둘 다 남음 · 남이 제목을 고침 → 제목째 걷힘(팝업 → 화면이 `props` 를 걷는 뜻 그대로) |
| 5 종류 바꾸기 — 되돌리기 | 스크래치 `bprobe/kind.probe.ts` — 실 Chrome · 팝업(`size: large` · 몸통 1 · 바닥 둘) → 페이지 정보 «종류» «화면» → «되돌리기» 한 번 | 화면 뒤 서버 문서: 몸통 [본문, 취소, 저장] · `zones` · `props` 없음 · head 2. **되돌리기 한 번 뒤 서버 문서 = 처음 문서(JSON 글자 같음)**. 다시 «화면» → «팝업» 의 왕복은 `size` 를 잃고 바닥 단추가 몸통에 남는다(설계 «8» 의 화면 → 팝업은 바닥을 안 짓는다 — 설계대로). 트리 줄 «등록 — 팝업» |
| 4 뿌리 `Popup` 의 자리 규칙 — 서버 판정 | 스크래치 `probe/ops.probe.ts` — 팝업 문서에 ops 를 얹고 `validatePage` | 몸통에 `Popup` 넣기 · 바닥에 `Popup` 넣기 → `nested-page` · `replace /root/type Card` → `bad-root` · 바닥을 둔 채 `replace /root/type Page` → `invalid-props`(`title`) + `zone-not-allowed`(footer) · `props` 만 걷음 → `zone-not-allowed` — 바닥 노드를 숨긴 화면 페이지는 서버가 안 받는다 |
| 2 덮개 층 — Tab 순환(실 Chrome) | `bprobe/layer.probe.ts` «Tab cycle» — 창 1440 · 팝업(«하나» · 읽기 전용 입력 · «상세를 팝업으로» · 바닥 둘) | Tab 9 번 · Shift+Tab 9 번 모두 상자 안(✖ → 하나 → 상세를 팝업으로 → 취소 → 저장 → ✖ …) |
| 2 덮개 층 — 굴림 | 같은 파일 «scroll host while open» — 뒤 화면 80 줄 | 캔버스 칸 굴림 2240 뒤 ✖ y 331(칸 49 ~ 858 안) · 칸 왼아래 점의 맨 위 요소 = 층 |
| 2 덮개 층 — 편집 모드로 · 다시 뷰 모드로 | 같은 파일 «mode switch …» | 편집 모드에서 겹 0 · 뷰 모드로 돌아와도 0 · 팝업 안 화면 대상 «팝업 열기» 는 «관리자/상세 페이지 팝업 열기 규칙입니다. 팝업 페이지가 아니라 이 화면에서는 열지 않습니다.» |
| 7 기본테마 1.7.0 고정 | `bprobe/pin17.probe.ts` — main(`d4e92fd3`)의 `system-themes/admin` · `packages/{theme-sdk,schema,renderer,themes}` · `tsconfig.base.json` 을 `git archive` 로 풀고 지금 kit(`packages/theme-kit/dist/bin.js build`)로 지음 → **sha256 `b9eba8fe…74ab` = `checksums.json` 의 1.7.0 줄** · `theme_packages` 에 넣고 프로젝트를 1.7.0 에 고정. 표본은 구현의 2열 폼 표가 아니라 **갤러리 «검색 팝업»**(검색폼 · 라디오 그리드 · 페이지네이션 · 바닥 [취소][선택] — 보통) | 미리보기 html · pptx `themeWarning` 없음 · `pages[].kind` [page, popup] · 오류 0. 번들 덮개 위(셸 · 화면 모드 둘): 1280 상자 x 280 · 폭 720 · 상자 밖 글 0 · 상자 밖 요소 0 · 노드 오류 0 · 1.7.0 의 제목줄 바탕 투명(1.8.0 은 `rgb(226, 232, 240)` — 팝업 규칙이 1.8.0 테마에만 있다) · 390 상자 폭 342(= 390 − 48) · 상자 밖 글 0 · «선택» 아래 끝 693(창 800 안). 대조: 셸 판 390 의 문서 `scrollWidth` 608 은 **열기 전에도 608**(1.7.0 · 1.8.0 같음 — 번들 셸의 것 · 팝업과 무관) · 화면 모드 390 은 열기 전후 390 |
| 1 `head_seq` 를 안 올림 — 열려 있던 탭 | `bprobe/stale.probe.ts` — 화면 페이지를 탭에 연 채 0033 의 `liftRoot` 와 같은 쓰기(뿌리 `Popup` · `props.title` · 번호 그대로)를 DB 에 직접 | 탭은 `Page` 로 그린 채(캔버스 `Popup` 0) 지우기 편집이 서버에 닿고 서버 뿌리는 `Popup` 그대로(head 2). 그 탭의 «종류» 는 «화면» 이 골라져 있고, «팝업» 을 누르면 `test /root/type` 이 걸려 «편집을 적용할 수 없습니다: 값이 기대와 다릅니다: /root/type — 페이지를 서버 상태로 다시 불러왔고, 편집 1개가 취소됐습니다.» 뒤 캔버스가 `Popup` 으로 선다 — 설계 «3» 이 받은 대가 그대로 · 남의 편집을 덮지 않는다 |
| 1 개인 모듈 — 떠난 멤버 | `probe/mig0033.probe.ts` | 떠난 캐럴의 개인 모듈만 여는 Q «상세» 는 `Page` 그대로(좁은 쪽) |

## 게이트

리뷰라 전량 게이트는 안 돌렸다(브리프). 쓴 판은 모두 이 워크트리 · Node v24.21.0(`mise env` 뒤 `node -v`) · 자기 Postgres 5503 이다. **잠듦 대조:** `pmset -g log | grep ' Sleep '` 의 마지막 줄이 2026-10-27 10:23:55(`Clamshell Sleep`)이고 그 뒤 0 줄 — 아래 판(11:31 ~ 11:48)과 안 겹친다. 1분 load 는 판마다 9.5 ~ 19.3(30 을 넘은 판 없음 — 버린 판 없음).

| 판 | 시각 | load | 실행 · 실패 · 건너뜀 |
| --- | --- | --- | --- |
| `probe/kind-rebase.probe.ts`(node) | 11:31 | 14.9 | 1 · 0 · 0 |
| `probe/bundle-nav.probe.tsx`(jsdom) | 11:33 | — | 1 · 0 · 0(앞의 두 판은 판 세우기 오류 — 포함 글롭 · 맨 이름 `react` — 실행 0) |
| `probe/mig0033.probe.ts`(제 DB) | 11:34 · 11:47 | 10.6 | 1 · 0 · 0 두 판(첫 판은 `.env` 에 `TEST_DATABASE_URL` 이 없어 실행 0 — «지침» 1) |
| `probe/check-wrap.probe.ts` | 11:37 | — | 1 · 0 · 0(앞의 두 판은 픽스처 도우미 잘림 — 실행 0) |
| `probe/ops.probe.ts` | 11:43 | — | 1 · 0 · 0 |
| `bprobe/layer.probe.ts`(실 Chrome · `--maxWorkers=1`) | 11:35 ~ 11:36 | 9.5 → 11.6 | 4 · 0 · 0 |
| `bprobe/wrap-css.probe.ts`(실 Chrome) | 11:37 | — | 1 · 0 · 0 |
| `bprobe/kind.probe.ts` | 11:42 | 11.9 | 1 · 0 · 0 |
| `bprobe/pin17.probe.ts` | 11:44 ~ 11:46 | 19.3 → 12.3 | 1 · 0 · 0 두 판(앞의 셋은 탐침 오류 — `galleryItems` 인자 · `PUT schema` 본문 꼴 · 값 0) |
| `bprobe/stale.probe.ts` | 11:47 | 10.1 | 1 · 0 · 0 |
| 변조 V1 ~ V5 · VB0 · VB1 · VB13 · VB13p | 11:38 ~ 11:41 | 9.6 ~ 12.1 | «변조 표» |

실브라우저 케이스 파일 `apps/web/build-test/popup-layer.test.ts` 대조 판(VB0) 17 · 0 · 건너뜀 0. 끝에 이 워크트리 경로 · cwd 의 vitest · Chrome 0 · 3103 리스너 0 · 테스트 DB 밖 `wb_*` DB 0(`wb_popup` · `wb_popup_test` 만)을 셌다. 소스 변경 0 — `git diff --stat` 빈 판에서 이 보고 파일만 커밋한다.

## 지침

1. **무엇이 비었나:** 스크래치 api 탐침이 테스트 DB 주소를 `apps/api/.env` 의 `TEST_DATABASE_URL` 줄로 읽으면 워크트리에서는 그 줄이 없어(코디네이터 부트스트랩은 `POSTGRES_PORT` 만 적고 주소는 `test-database-url.ts` 가 짓는다) 판 세우기에서 죽는다(실행 0).
   **어디:** `.ruler/20-verification.md` 「목 · 계측은 불린 수를 값으로 확인하고 …」 문단의 «스크래치 탐침을 테스트 글롭에 안 넣고 api 하네스로 돌리려면» 문장 뒤.
   **넣을 문장:** «하네스 없이 제 DB 를 만드는 스크래치 탐침은 테스트 DB 주소를 `.env` 글자로 읽지 말고 `apps/api/test/test-database-url.ts` 의 `resolveTestDatabaseUrl({ shellEnv: process.env, fileEnv: readApiEnvFile() })` 로 짓는다 — 워크트리의 `.env` 에는 `TEST_DATABASE_URL` 줄이 없을 수 있다(`POSTGRES_PORT` 에서 짓는다).»
2. **무엇이 비었나:** 프로젝트마다 도는 판정에 **프로젝트에 안 매이는 출처**(개인 모듈 · 사람의 설정)를 «그 프로젝트 멤버의 것» 으로 넣으면, 두 프로젝트에 다 든 사람의 출처가 양쪽에 다 선다(H1). 지침은 «남이 지을 수 있는 입력이 권한 있는 사람의 요청을 부르는 자리» 만 짚고 이 꼴을 안 짚는다.
   **어디:** `.ruler/20-verification.md` 「수를 셀 때는 두 번 세고 표본을 열어 본다 — 덧붙임」 의 «마이그레이션을 새로 두면 …» 항목 뒤.
   **넣을 문장:** «프로젝트마다 도는 마이그레이션 · 판정이 프로젝트에 안 매이는 출처(개인 모듈 · 사람의 설정)를 «그 프로젝트 멤버의 것» 으로 세면, 픽스처에 **두 프로젝트에 다 든 사람**을 두고 한쪽에서만 쓴 출처가 다른 쪽을 바꾸는지 센다 — 멤버 거름은 «멤버가 아닌 사람» 만 막는다(`docs/superpowers/plans/2026-10-27-rv-poa-report.md` H1).»
3. **무엇이 비었나:** 다른 문서를 실어 그리는 층(덮개 위 팝업)의 요청을 **여는 페이지의 표**(`hrefs`)로 풀면, 표를 짓는 자리가 실린 문서의 대상을 안 걷는 한 그 요청이 «없는 페이지» 로 끊긴다(M1). 지침의 «입구 표가 있는 성질 … 입구 × 값의 출처 칸마다 판» 이 가깝지만 «실린 문서» 를 출처로 안 센다.
   **어디:** `.ruler/30-delegation.md` 「워커에게 맡길 때 — wirebound」 의 «입구 표가 있는 성질(판을 싣는 입구 · 편집을 내는 입구)을 닫는 장치는 …» 문장 뒤.
   **넣을 문장:** «한 화면에 다른 문서를 실어 그리는 층(덮개 위 팝업 · 미리보기)은 그 문서 안의 요청도 같은 표로 푼다 — 표(번들 `hrefs` · 페이지 데이터)를 짓는 자리가 실린 문서까지 걷는지, 실린 문서 안의 요청마다(이동 · 열기 · 닫기) 판을 하나씩 세운다.»
4. 지침이 이미 맞은 것: «테마가 지나야 할 자는 … 기본 뷰를 한 곳만 바꾼 테마 뷰(감싸는 요소 · 조각 이름 · 형제 자리)로 깬다»(`.ruler/30-delegation.md`)가 M2 를 짚는다 — 구현 P1 ~ P4 의 깨는 뷰 열하나에 «감싸는 요소» 꼴이 없었다. 지침 고칠 것 없음.

## 재현 판(스크래치 원문 — 재부팅에 지워지므로 옮겨 둔다)

`<스크래치>/probe/vitest.config.ts` 는 루트 설정의 `esbuild` · `resolve` 를 싣고 `root` 를 체크아웃, `test.dir` 을 스크래치로 둔 설정이다(`bprobe/` 는 루트 설정의 `build` 프로젝트 것). 돌리기: `pnpm exec vitest run -c <스크래치>/probe/vitest.config.ts <이름>`.

### H1 — `probe/mig0033.probe.ts`

```ts
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { createDb, createPool } from '<워크트리>/apps/api/src/db/client'
import { migrationProvider } from '<워크트리>/apps/api/src/db/migrations/index'

const kysely = await import('<워크트리>/apps/api/node_modules/kysely/dist/esm/index.js')
const { Migrator, sql } = kysely as any
const { resolveTestDatabaseUrl, readApiEnvFile } = await import('<워크트리>/apps/api/test/test-database-url.ts')
const TEST = resolveTestDatabaseUrl({ shellEnv: process.env, fileEnv: readApiEnvFile() } as any)
const NAME = 'wb_rvpoa_0033_' + process.pid
const u = new URL(TEST); u.pathname = '/' + NAME
let admin: any, db: any
beforeAll(async () => {
  admin = createDb(createPool(TEST)); await sql.raw('CREATE DATABASE "' + NAME + '"').execute(admin); db = createDb(createPool(u.toString()))
}, 60000)
afterAll(async () => { await db?.destroy(); await sql.raw('DROP DATABASE IF EXISTS "' + NAME + '" WITH (FORCE)').execute(admin); await admin?.destroy() })
const must = async (n: string) => { const r = await new Migrator({ db, provider: migrationProvider }).migrateTo(n); if (r.error) throw r.error }
const opener = (id: string, target: string) => ({ id, type: 'Button', props: { label: id }, interactions: [{ on: 'click', actions: [{ type: 'openModal', target }] }] })
const page = (children: unknown[]) => ({ version: 5, root: { id: 'n_root', type: 'Page', children } })

it('personal module of a member of two projects', async () => {
  await must('0032-list-data-grid')
  const alice = randomUUID(), carol = randomUUID()
  for (const [id, n] of [[alice, 'a'], [carol, 'c']]) await sql`insert into users (id, email, name, password_hash) values (${id}, ${'u-' + id + '@x.com'}, ${n}, 'x')`.execute(db)
  const mk = async (title: string) => {
    const pid = randomUUID(), root = randomUUID()
    await sql`insert into projects (id, name, slug) values (${pid}, ${title}, ${'p-' + pid.slice(0, 8)})`.execute(db)
    await sql`insert into menu_nodes (id, project_id, title, sort_order) values (${root}, ${pid}, '관리자', 0)`.execute(db)
    const ins = async (t: string, s: unknown) => { const id = randomUUID(); await sql`insert into pages (id, project_id, menu_node_id, title, sort_order, schema, schema_version, head_seq, structure_seq) values (${id}, ${pid}, ${root}, ${t}, 0, ${JSON.stringify(s)}::jsonb, 5, 3, 3)`.execute(db); return id }
    return { pid, ins }
  }
  const P = await mk('P'), Q = await mk('Q')
  await sql`insert into project_members (project_id, user_id, role) values (${P.pid}, ${alice}, 'owner'), (${Q.pid}, ${alice}, 'editor'), (${Q.pid}, ${carol}, 'owner')`.execute(db)
  // P: 목록이 등록을 연다. Q: 같은 경로의 «등록» 은 화면 — Q 안에서 아무도 «팝업 열기» 로 안 연다.
  const pList = await P.ins('목록', page([opener('n_o', 'page:관리자/등록')]))
  const pReg = await P.ins('등록', page([]))
  const qReg = await Q.ins('등록', page([{ id: 'n_q', type: 'Text', props: { content: 'Q 의 등록 화면' } }]))
  // 앨리스의 개인 모듈(P 에서 쓰려고 저장) — Q 에는 넣지 않았다.
  await sql`insert into personal_modules (owner_id, name, nodes) values (${alice}, '내 것', ${JSON.stringify([opener('m_o', 'page:관리자/등록')])}::jsonb)`.execute(db)
  // 떠난 멤버: 캐럴의 개인 모듈만 Q 의 «상세» 를 연다 — 캐럴이 Q 를 떠난 판.
  const qDet = await Q.ins('상세', page([]))
  await sql`insert into personal_modules (owner_id, name, nodes) values (${carol}, 'c', ${JSON.stringify([opener('c_o', 'page:관리자/상세')])}::jsonb)`.execute(db)
  await sql`delete from project_members where project_id = ${Q.pid} and user_id = ${carol}`.execute(db)
  // 프로젝트 모듈만 P 의 «모듈대상» 을 연다 — 스냅샷에도 그 페이지가 든다.
  const pMod = await P.ins('모듈대상', page([]))
  await sql`insert into modules (project_id, name, nodes, created_by) values (${P.pid}, 'm', ${JSON.stringify([opener('pm_o', 'page:관리자/모듈대상')])}::jsonb, ${alice})`.execute(db)
  const menuRow = (await sql`select id from menu_nodes where project_id = ${P.pid}`.execute(db)).rows[0] as any
  const snap = randomUUID()
  const payload = { payloadVersion: 3, capturedAt: new Date().toISOString(), menu: [{ id: menuRow.id, parentId: null, title: '관리자', sortOrder: 0 }], pages: [{ id: pMod, menuNodeId: menuRow.id, title: '모듈대상', description: null, sortOrder: 0, schemaVersion: 5, schema: page([]), headSeq: 3 }], layouts: [], comments: [] }
  await sql`insert into snapshots (id, project_id, tag, payload, created_by) values (${snap}, ${P.pid}, '판', ${JSON.stringify(payload)}::jsonb, ${alice})`.execute(db)
  await must('0033-modal-popup')
  const sp = (await sql`select payload->'pages'->0->'schema'->'root'->>'type' as t from snapshots where id = ${snap}`.execute(db)).rows[0] as any
  const roots = await sql`select id, title, schema->'root'->>'type' as t from pages`.execute(db)
  const by = Object.fromEntries(roots.rows.map((r: any) => [r.id, r.t]))
  console.log('P등록', by[pReg], 'Q등록', by[qReg], 'Q상세(떠난 멤버만 연다)', by[qDet], 'P목록', by[pList], 'P모듈대상(live)', by[pMod], '스냅샷 안 모듈대상', sp.t)
})
```

### M1 · L3 — `probe/bundle-nav.probe.tsx`

```tsx
// @vitest-environment jsdom
import { NO_THEME } from '@wirebound/renderer'
import { installCatalog, matchPageTargets, type PageDocument, type WbNode } from '@wirebound/schema'
import { act } from '<워크트리>/packages/exporter/node_modules/react/index.js'
import { beforeAll, expect, it } from 'vitest'
import { exportBundle, type BundlePage } from '<워크트리>/packages/exporter/src/bundle/index'
import { mountExportDocument } from '<워크트리>/packages/exporter/src/browser/mount'
import { PAGE_DATA_ID, type ExportPageData } from '<워크트리>/packages/exporter/src/page-data'

beforeAll(() => { installCatalog(); (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true })
const btn = (id: string, type: string, target: string): WbNode => ({ id, type: 'Button', props: { label: id }, interactions: [{ on: 'click', actions: [{ type, target } as any] }] })
const pages: BundlePage[] = [
  { title: '목록', target: 'page:목록', document: { version: 5, root: { id: 'n_list', type: 'Page', children: [btn('n_open', 'openModal', 'page:검색'), btn('n_open_sp', 'openModal', 'page: 검색 ')] } } },
  { title: '검색', target: 'page:검색', document: { version: 5, root: { id: 'n_pop', type: 'Popup', props: { title: '검색' }, children: [btn('n_go', 'navigate', 'page:상세'), btn('n_modal_screen', 'openModal', 'page:상세')], zones: { footer: [] } } } as PageDocument },
  { title: '상세', target: 'page:상세', document: { version: 5, root: { id: 'n_detail', type: 'Page', children: [] } } },
]
function data(path: string): ExportPageData {
  const b = exportBundle({ pages, runtimeJs: '' })
  const html = String(b.files.find((f) => f.path === path)!.content)
  return JSON.parse(new DOMParser().parseFromString(html, 'text/html').getElementById(PAGE_DATA_ID)!.textContent!) as ExportPageData
}
it('navigate inside popup in bundle', () => {
  const d = data('pages/목록.html')
  console.log('HREFS', JSON.stringify(d.hrefs), 'POPUPS', Object.keys(d.popups ?? {}))
  const canvas = document.createElement('div'); const status = document.createElement('div'); document.body.append(canvas, status)
  const navigated: string[] = []
  act(() => { mountExportDocument(canvas, { theme: NO_THEME, tokens: {}, window, hrefs: d.hrefs, popups: d.popups, document: d.document, markers: [], status, navigate: (to: string) => navigated.push(to) } as any) })
  act(() => { (canvas.querySelector('[data-wb-id="n_open"] button, [data-wb-id="n_open"]') as HTMLElement).click() })
  console.log('LAYERS', document.querySelectorAll('[data-wb-popup-level]').length)
  act(() => { (document.querySelector('[data-wb-popup-layer] [data-wb-id="n_go"]') as HTMLElement).click() })
  console.log('NAV', JSON.stringify(navigated), 'STATUS', JSON.stringify(status.textContent))
  act(() => { (document.querySelector('[data-wb-popup-layer] [data-wb-id="n_modal_screen"]') as HTMLElement).click() })
  console.log('NAV2', JSON.stringify(navigated), 'STATUS2', JSON.stringify(status.textContent))
  console.log('EDITOR match spaced', matchPageTargets([{ id: 'x', title: '검색', menuPath: [], target: 'page:검색', bundleTitle: '검색' }], 'page: 검색 ').length)
})
```
