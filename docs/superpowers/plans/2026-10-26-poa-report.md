# POA 보고 — 6단계 PO-A 팝업 페이지

기준: `feat/popup` 의 설계 커밋(`a5261076` · `c59c53c4`) 위에 main(`d4e92fd3` · `268f506d`)을 합친 `6b84cefc`. Node v24.21.0 · 자기 Postgres 5503.

## PO-B 와 겹친 파일 · 병합 때 B 가 다시 잴 것

설계 «나란히 돌릴 때 미리 나눈 것» 의 자리에 한 줄 · 한 묶음씩만 더했다(PO-B 몫 `input.ts` · `presets` · `fileList` · `fileAttachProblems` 는 안 지었다).

| 파일 | 이 트랙이 더한 것 |
| --- | --- |
| `packages/theme-sdk/src/version.ts` · `system-themes/admin/package.json` | 판 1.8.0 |
| `system-themes/admin/checksums.json` | `system-admin@1.8.0` 줄 — 이 트랙 빌드의 sha256(`3d36b429…5b39183`) |
| `system-themes/admin/src/theme.css` | `Popup` 규칙 · 보통 · 작은 팝업 안 폼 표 · 검색폼 접기 |
| `packages/schema/src/component/catalog/{structure,index}.ts` · `define.ts` | `PopupDef` · 등록 · `NodeSeed.interactions`(구역 `initial` 의 상호작용) |
| `packages/theme-sdk/src/{marks.ts,default-views/index.ts,default-views/structure.tsx}` | `Popup: { size }` 표지 · `PopupView` 등록 · 기본 CSS(팝업 · 덮개 층) |
| `packages/theme-kit/src/check.ts` | `popupProblems`(P1 ~ P4) · 오류 `source: 'popup'` |
| `packages/theme-gallery/src/{samples,gallery}.ts(x)` | `Popup` 표본 셋 · 뿌리 감싸기(`galleryItemDocument` — `Popup` 은 감싸지 않는다) |
| `packages/theme-kit/build-test/dev.test.ts` | `kinds` 36 |
| `packages/theme-kit/template/{SKILL.md,src/theme.css}` | 카탈로그 36 종 · `Popup` 절 · 빈 CSS 자리 |
| `apps/web/config/llms-txt.ts` · `apps/web/public/llms.txt` | `Popup` · `closeModal` · `openModal` 문장 줄 · 생성물 |
| `packages/mcp/skill/SKILL.md` | 팝업 페이지 절 |

**B 가 A 위로 옮긴 뒤 다시 잴 것:** 합친 판의 `.wbtheme` sha256 으로 `checksums.json` 의 1.8.0 줄 · `dev.test.ts` 의 `kinds`(37) · 생성물 `apps/web/public/llms.txt`(`pnpm vitest run apps/web/test/llms-txt.test.ts -u` 로 다시 짓는다) · 갤러리 · `check` 표본이 `Popup` 뿌리 감싸기 위에서 서는지(`packages/theme-kit/test/check.test.ts` 의 `FORM_TABLE_SAMPLES` 는 폼 팝업 표본을 든다 — B 의 표본이 폼 표를 들면 그 목록이 는다) · 스타터 `SKILL.md` 의 카탈로그 수.

## 바꾼 것

| 걸음 | 자리 |
| --- | --- |
| 1 카탈로그 | `Popup`(`title` · `size` · 몸통 + «바닥» · `initial` 바닥 `[취소 — 팝업 닫기][저장]`) · 뿌리 타입 둘(`ROOT_TYPES` — 레이아웃 뿌리는 `Page` 뿐) · `NodeSeed.interactions` · 표지 `size` · `LABEL_PROPS.Popup = 'title'` |
| 2 `closeModal` | 봉투 · `node.ts` · 판정(대상 없음) · 문장 «팝업이 닫힙니다» · `openModal` 문장 «… 팝업으로 열립니다» · 런타임 요청 · 붙이기 · 모듈 저장이 대상 없는 액션을 남긴다 · 상호작용 탭 «팝업 닫기» · 6종 |
| 3 덮개 층 · 캔버스 · 번들 | `renderer` 의 `PopupLayer` · `usePopupStack` · 캔버스 뷰 모드(`canvas-popups.tsx` — 트리로 풀어 페이지를 읽고 쌓기 · 문장 넷) · 번들(`page-data` 의 `popups` 닫힌 셈 · `mount.tsx` · 목차 «팝업» 표지) |
| 4 SDK · 기본테마 | `PopupView` · 기본 CSS(크기 셋 · 덮개 층 · 몸통 굴림) · 화면 모드 «줄지 않음»(`capture.ts`) · 1.8.0 · 기본테마 팝업 · 팝업 안 접기 |
| 5 `check` · 갤러리 · 스타터 | P1 ~ P4 · 표본 셋 · 템플릿 `SKILL.md` · 빈 CSS 자리 · `kinds` 36 |
| 6 입구 | 트리 `kind`(`root_type` 을 SQL 에서 읽는다) · `POST …/pages` 의 `kind`(`newPageDocument` — 스키마로 옮겨 웹 · 서버가 함께 쓴다) · 메뉴 줄 «팝업 페이지 추가» · 트리 줄 팝업 아이콘 · « — 팝업» · 페이지 정보 «종류» · 대상 고르개(팝업 먼저 · 화면 뒤 · 직접 적기 칸) |
| 7 lint · MCP · CLI · 문서 | `modal-target-not-popup` · `navigate-to-popup` · `close-outside-popup`(경고) · `list_pages` · `page get` 의 `kind` · 스킬 문서 · `/llms.txt` · 미리보기 `pages[].kind` |
| 8 `0033-modal-popup` | 풀이 사본 · 페이지 표 · 스냅샷 payload · `down` · 옮긴 수 한 줄 |
| 9 실브라우저 | `apps/web/build-test/popup-layer.test.ts` |
| 10 문서 | 정본 §5 `Popup` 줄 · §8.1 6종 · §8.3 덮개 층 · §9 메뉴 줄 · 팝업 페이지 · 페이지 정보 «종류» · §11.3 번들의 팝업 · §12.4 lint 셋 · `apps/api/README.md`(만들기 `kind` · 트리 `kind` · 미리보기 `kind` · `0033`) |

## 결정과 이유

- **덮개 층의 키는 층 요소의 React `onKeyDown` 이 받는다 — 캔버스 문서에 전역 리스너를 걸지 않았다.** 층은 캔버스 문서 안에 서고 포커스를 상자 안에 가두므로(열면 ✖ · Tab 은 상자 안을 돈다 · 덮개 누름은 포커스를 안 옮긴다) 키는 늘 층 안에서 난다. 전역으로 걸면 포커스가 셸(호스트)에 있을 때의 Escape 를 셸 모달과 다툰다 — 실브라우저 판 «셸의 대화 상자와 겹치면» 이 셸 상자만 닫히는 것을 잰다.
- **대상 고르개는 트리 응답의 `kind` 로 가른다** — 페이지 문서를 다 읽지 않는다. 남이 닫힌 페이지의 종류를 바꾸면 다음 트리 조회까지 옛 값이다(메뉴 트리의 상태 줄과 같은 길).
- **`newPageDocument` 를 `@wirebound/schema` 에 두었다** — 서버의 만들기와 에디터의 `createNode` 가 같은 꼴(바닥 `[취소][저장]` · «취소» 의 «팝업 닫기»)을 짓는지 `apps/web/test/edit/create-node.test.ts` 가 견준다.
- **`0033` 이 개인 모듈을 대상 출처로 셀 때 그 프로젝트 멤버의 것만 센다** — 개인 모듈은 프로젝트에 매이지 않아, 멤버가 아닌 사람의 묶음이 남의 프로젝트 페이지를 팝업으로 바꾸지 않게 했다(설계 «3» 이 안 정한 자리 — 좁은 쪽).
- **`0033` 의 `down` 은 `Popup` 뿌리를 전부 내린다** — 이 마이그레이션이 옮긴 것과 사람이 만든 팝업을 가를 기록이 없다(설계 «3» 그대로).
- **lint 는 둘 이상으로 풀리는 대상의 종류를 말하지 않는다** — 그 링크는 이미 안 이어지는 판이라 «대상 없음 · 겹침» 쪽이 말한다.
- **팝업 → 화면 바꾸기는 바닥 노드를 지우지 않고 몸통 끝으로 옮긴다**(설계 «8» · `0033` 의 `down` 과 같은 꼴). 바닥 밖 구역이 남으면 `zones` 를 통째로 걷지 않고 `footer` 만 걷는다.

## 잰 값

### 기준선(`6b84cefc` — 코드 고치기 전, `vitest list --json`)

| 갈래 | 케이스 | 파일 |
| --- | --- | --- |
| `pnpm test`(`--project '!build'`) | 8627 (unit 2587 · web 3400 · api 2640) | 539 (unit 164 · web 212 · api 163) |
| `--project build` | 175 | 18 |
| `-c vitest.browser.config.ts` | 598 | 92 |

### 소비자 조사(설계 «소비자 조사 — 다시 재는 법», 고치기 전)

- `openModal` 을 부르는 소스 21 · 케이스 11 파일 · 액션 종류를 가르는 소스(`switchTab`) 12 · `Page` 뿌리를 글자로 짓거나 견주는 소스 20 줄 — 설계의 셈과 같다.


### 실브라우저 판이 찾은 결함 셋(`apps/web/build-test/popup-layer.test.ts` — 고치기 전 빨강 · 고친 뒤 17/17)

| 결함 | 고치기 전 값 | 뿌리 | 고침 |
| --- | --- | --- | --- |
| **보통 팝업이 폭 192px 로 준다**(에디터 · 번들 · 크기 안 정한 팝업 전부 — 기본값이 `medium`) | 번들 화면 모드 1280 · 덮개 위 1280 에서 상자 폭 192(기대 720) | 입력 조각의 길이 표지 규칙 `:where([data-wb-size="medium"]) { width: min(12em, 100%) }`(SDK `input.tsx`)이 팝업의 `data-wb-size="medium"` 에도 걸린다 — 둘 다 특이도 0 이고 입력 규칙이 `views.css` 에서 뒤다 | 길이 규칙 셋에 `:not([data-wb-component="Popup"])` (특이도 그대로 0) |
| **에디터 뷰 모드에서 ✖ · «취소» 를 눌러도 안 닫힌다**(위를 고쳐 상자가 720 으로 넓어지자 드러났다) | 창 1440: iframe 은 기기 폭 1280 으로 x 296 ~ 1576, 보이는 캔버스 칸은 그보다 좁다 — 상자가 iframe 가운데(✖ x 1261)에 서서 칸 밖이고 누름이 셸로 갔다(30s 시간 초과 둘) | 덮개 구간(`usePopupArea`)이 보이는 구간의 세로만 재고 가로는 iframe 전체로 두었다 | 구간에 `left` · `width` 를 더한다(`PopupArea`) — 상자가 보이는 칸 가운데에 선다 |
| **겹 다섯에서 Escape 뒤 포커스가 `body` 로 간다**(자기를 다시 여는 팝업) | 실브라우저: 닫은 뒤 `activeElement` 가 `body` · jsdom: 아래(첫) 겹의 단추 | `popupOpener` 가 그 노드 id 의 첫 요소를 연 요소로 적는다 — 같은 팝업이 겹마다 서면 첫 겹(`inert`)의 단추다 | 포커스를 든 것 → `inert` 밖의 마지막 것(맨 위 겹) 차례로 고른다 · jsdom 케이스 «자기를 다시 여는 팝업 — 닫으면 바로 아래 겹의 그 단추로 돌아온다» |

케이스의 전제도 하나 틀렸다 — 번들 화면 모드(`#wb-screen`)는 «줄지 않음» 판이 아니다. 그 규칙(`CAPTURE_CSS` 의 `max-width: none`)은 PPTX 캡처가 다는 `html[data-wb-capture]` 에만 걸린다. 화면 모드 판은 `min(크기, 창)` 으로 고치고, 찍는 판(창 720 · `data-wb-capture` + `CAPTURE_CSS`)을 따로 세워 큰 팝업 960 · 문서 안을 잰다.


### 세 고침의 변조(실브라우저 판이 찾은 결함 — 그 케이스 파일만 돌림)

| id | 변조 | 실행 | 실패 | 죽은 케이스 · 값 |
| --- | --- | --- | --- | --- |
| F1 | 입력 길이 규칙의 `:not([data-wb-component="Popup"])` 를 뗌(빌드를 끼워 `views.css` 를 다시 지음) | 17 | 6 | 번들 «덮개 위 상자 — 창 1280» `expected 192 to be 720` · «화면 모드 창 390 · 720 · 1000 · 1280» `['관리자-등록', 192]` 외 |
| F3 | 덮개 구간에서 `left` · `width` 를 뗌 | 1(`-t`) | 1 | «✖ 로 닫으면 연 단추로 포커스가 돌아온다» `expected { x: false, y: true } to deeply equal { x: true, y: true }`(상자 가운데가 보이는 칸 안인가) |
| F2 | `popupOpener` 의 대체 갈래를 `found[0]` 으로 | 14 | 1 | jsdom «자기를 다시 여는 팝업 — 포커스 없이 눌러도 …» `expected false to be true` |
| F2c | `popupOpener` 의 «포커스를 든 것» 을 첫 노드에서만 찾음 | 14 | 1 | jsdom «자기를 다시 여는 팝업 — 연 노드 안의 둘째 단추를 든 채 …» `expected false to be true` |

첫판의 F2(대체 갈래만 되돌림)는 jsdom 12 · 실브라우저 «겹은 다섯까지» 1 둘 다에서 **살았다** — 그 케이스가 단추에 포커스를 준 채 눌러 «포커스를 든 것» 갈래만 지났고, 연 노드가 단추 하나면 두 갈래가 같은 요소를 낸다. 두 갈래를 따로 가르는 케이스 둘(포커스 없이 누름 · Card 안 둘째 단추를 든 채 누름)로 갈아 세우고, 어느 변조에서도 혼자 안 죽던 앞 케이스는 지웠다. 실브라우저 «겹은 다섯까지» 는 실클릭이 포커스를 주어 «포커스를 든 것» 갈래만 지난다 — 그 갈래의 고침(F2c)은 jsdom 케이스가 잰다.


### 기본테마 1.7.0 고정 프로젝트(SDK 기본 CSS · 카탈로그를 바꾼 트랙의 앞 판 판)

main 소스로 지은 `system-admin-1.7.0.wbtheme`(sha256 `b9eba8fe…74ab` — `checksums.json` 의 그 줄과 같다)을 `theme_packages` 에 넣고, 이 브랜치 api(빌드 `cf0302f7`)로 목록 페이지(«열기» → `page:관리자/등록`) · 팝업 페이지(2열 폼 표 · 쌍 넷)를 지어 1.7.0 에 고정했다. 스크래치 탐침(`editor-stack` · `layout-bundle` 을 체크아웃 경로로 부름).

| 판 | 값 |
| --- | --- |
| 내보내기 미리보기 html · pptx | `themeWarning` 없음 · 오류 없음 · 종류 `[목록 page, 등록 popup]` |
| 번들 덮개 위(창 1280) | 상자 폭 720 · 가운데(좌우 280) · ✖ 있음 · 오류 0 · 상자 밖 요소 0 · 상자 밖 글 0 · 라벨 꺾임 넷 다 1 줄 |
| 번들 화면 모드(창 720) | 상자 폭 720 · 문서 `scrollWidth` 720 · 오류 0 |
| 에디터 뷰 모드(창 1440) | 덮개 · 상자 섬 · 오류 0 · 배너 없음 |

**한 가지 다른 값:** 보통 팝업 안 2열 폼 표가 1.7.0 에서는 **2열 그대로**(한 줄에 쌍 둘 · 두 줄)다. «작은 · 보통 팝업은 한 줄에 쌍 하나» 는 기본테마 1.8.0 의 규칙(`system-themes/admin/src/theme.css` 의 `:where([data-wb-component="Popup"]:is(…small, …medium)) [data-wb-component="FormTable"]`)이라 앞 판 테마에는 없다. 상자 720 안에서 넘침 · 꺾임이 없어 결함으로 세지 않았다 — 테마를 1.8.0 으로 올리면 한 줄에 쌍 하나가 된다.


### 입구를 더한 뒤의 셈

- **행동 메뉴 목록 자리:** «팝업 페이지 추가» 는 메뉴 줄 `+` 목록(하위 메뉴 · 페이지 추가 · **팝업 페이지 추가** · JSON 에서 가져오기…)에 든다. `git grep "name: '삭제'" apps/web/build-test` 11 줄은 모두 `…` 목록이라 자리가 안 바뀐다. `+` 목록을 쓰는 실브라우저 판은 `action-menu-portal.test.ts:327` · `menu-realtime.test.ts:341`(`openRowAction` — 둘 다 `exact: true`)이라 «페이지 추가» 가 «팝업 페이지 추가» 와 부분 일치로 겹치지 않는다. jsdom 의 목록 단언(`menu-row-actions.test.tsx` · `test/panels/tree-row.ts` 의 `ADD_ITEMS`)은 새 목록으로 고쳤다.
- 실브라우저 전량은 아래 게이트의 `pnpm test:build` 둘째 갈래(`test:browser`)다.

## 혼자 죽는 변조

변조 도구는 항목마다 백업(경로 전체 이름) → 한 곳 바꿈(맞은 수 1 확인) → 그 케이스 파일만 → 바이트 비교 복원이다. 실행 수는 통과 + 실패.

### 스키마(`packages/schema/test/popup-root.test.ts` · `interaction-describe.test.ts`) · 덮개 층(`packages/renderer/test/popup-layer.test.tsx`)

| 변조 | 자리 | 바꿈 | 실행 · 실패 | 죽은 케이스 «실패 값» |
| --- | --- | --- | --- | --- |
| S1 | `validate.ts` | `export const ROOT_TYPES: readonly string[] = ['Page', 'Popup` → `export const ROOT_TYPES: readonly string[] = ['Pag` | 10 · 3 | 뿌리 타입 — Page · Popup Popup 뿌리는 이슈가 없다 — 몸통 · 바닥 구역째 «AssertionError: expected [ { code: 'bad-root', …(4) } ] to deeply equal []» / 뿌리 타입 — Page · Popup Popup 은 뿌리 밖에 못 선다 — 화면 안의 팝업 · 팝업 안의 Page 둘 다 nested-page «AssertionError: expected [] to deeply equal [ 'nested-page n_pop' ]» / 뿌리 타입 — Page · Popup 다른 뿌리 타입은 bad-root — 문장이 받는 둘을 말한다 «AssertionError: expected [ '루트는 Page여야 합니다 (현재: Card)' ] to deeply equal [ Array(1) ]» |
| S2 | `validate.ts` | `if (isRootType(node.type) && parent !== null) {` → `if (node.type === 'Page' && parent !== null) {` | 10 · 1 | 뿌리 타입 — Page · Popup Popup 은 뿌리 밖에 못 선다 — 화면 안의 팝업 · 팝업 안의 Page 둘 다 nested-page «AssertionError: expected [] to deeply equal [ 'nested-page n_pop' ]» |
| S3 | `validate.ts` | `const LAYOUT_ROOT_TYPES: readonly string[] = ['Page']` → `const LAYOUT_ROOT_TYPES: readonly string[] = ['Pag` | 10 · 1 | 뿌리 타입 — Page · Popup 레이아웃 뿌리는 Page 뿐이다 — Popup 뿌리는 bad-root «AssertionError: expected [] to deeply equal [ Array(1) ]» |
| S4 | `clipboard.ts` | `    if (isTargetlessAction(action)) return true` → `    if (isTargetlessAction(action)) return false` | 10 · 1 | closeModal — 대상이 없는 액션 붙이기가 남긴다 — 밖을 가리키지 않는다 «AssertionError: expected 1 to be +0 // Object.is equality» |
| S5 | `save.ts` | `    if (isTargetlessAction(action)) return true` → `    if (isTargetlessAction(action)) return false` | 10 · 1 | closeModal — 대상이 없는 액션 모듈 저장이 남긴다 «AssertionError: expected 1 to be +0 // Object.is equality» |
| S6 | `envelope.ts` | `const CloseModalActionSchema = z.strictObject({` → `const CloseModalActionSchema = z.object({` | 10 · 2 | 구역의 첫 내용이 싣는 상호작용 노드를 겨냥하는 액션 · 봉투 밖 꼴은 카탈로그를 모을 때 던진다 «AssertionError: expected [Function] to throw an error» / closeModal — 대상이 없는 액션 봉투가 받는다 — 대상을 실으면 거절한다 «AssertionError: expected true to be false // Object.is equality» |
| S7 | `describe.ts` | `      return '팝업이 닫힙니다'` → `      return '팝업을 닫습니다'` | 37 · 1 | 액션 6종 closeModal — 대상이 없다 «AssertionError: expected '실행 버튼 클릭 시 팝업을 닫습니다' to be '실행 버튼 클릭 시 팝업이 닫힙니다' // Object.is equality» |
| S8 | `structure.ts` | `{ type: 'Button', props: { label: '취소' }, interactions: [{ o` → `{ type: 'Button', props: { label: '취소' } },` | 10 · 1 | Popup 정의 — 바닥의 첫 내용 바닥은 [취소][저장] 이고 «취소» 가 처음부터 «팝업 닫기» 를 든다 «AssertionError: expected [ { type: 'Button', …(1) }, …(1) ] to deeply equal [ { type: 'Button', …(2) }, …(1) ]» |
| S9 | `describe.ts` | `} 팝업으로 열립니다`` → `} 모달로 열립니다`` | 37 · 1 | 액션 6종 openModal «AssertionError: expected '실행 버튼 클릭 시 관리자/회원/등록 페이지가 모달로 열립니다' to be '실행 버튼 클릭 시 관리자/회원/등록 페이지가 팝업으로 열립니다' // Object.is equality» |
| S10 | `index.ts` | `!interaction.actions.every(isTargetlessAction)` → `false` | 10 · 1 | 구역의 첫 내용이 싣는 상호작용 노드를 겨냥하는 액션 · 봉투 밖 꼴은 카탈로그를 모을 때 던진다 «AssertionError: expected [Function] to throw an error» |
| S11 | `validate.ts` | `${rootTypes.join(' 또는 ')}` → `${rootTypes.join(' · ')}` | 10 · 1 | 뿌리 타입 — Page · Popup 다른 뿌리 타입은 bad-root — 문장이 받는 둘을 말한다 «AssertionError: expected [ Array(1) ] to deeply equal [ Array(1) ]» |
| S12 | `structure.ts` | `size: z.enum(['small', 'medium', 'large']).default('medium')` → `size: z.enum(['small', 'medium']).default('medium'` | 10 · 1 | 뿌리 타입 — Page · Popup Popup 뿌리는 이슈가 없다 — 몸통 · 바닥 구역째 «AssertionError: expected [ { code: 'invalid-props', …(4) } ] to deeply equal []» |
| R1 | `popup-layer.tsx` | `if (event.nativeEvent.isComposing \|\| composing.current) retu` → `if (composing.current) return` | 11 · 1 | PopupLayer — 쌓기 · 닫기 Escape 는 맨 위 하나만 닫는다 — 한글 조합 중의 Escape 는 닫지 않는다 «AssertionError: expected [ …(1) ] to have a length of 2 but got 1» |
| R2 | `popup-layer.tsx` | `if (event.nativeEvent.isComposing \|\| composing.current) retu` → `if (event.nativeEvent.isComposing) return` | 11 · 1 | PopupLayer — 쌓기 · 닫기 조합 구간(compositionstart ~ end)의 Escape 도 닫지 않는다 — isComposing 이 없는 판 «AssertionError: expected [] to have a length of 1 but got +0» |
| R4 | `popup-layer.tsx` | `restore.current = top.opener` → `restore.current = null` | 11 · 3 | PopupLayer — 쌓기 · 닫기 ✖ 를 누르면 맨 위를 닫고 연 요소로 포커스를 돌려준다 «AssertionError: expected <body><button></button>» / PopupLayer — 쌓기 · 닫기 «팝업 닫기» 규칙이 맨 위를 닫는다 — 요청은 부른 쪽에 간다 «AssertionError: expected <body><button></button>» / PopupLayer — 쌓기 · 닫기 팝업 안에서 연 팝업을 닫으면 그것을 연 팝업 안의 단추로 포커스가 돌아온다 «AssertionError: expected <body><button></button>» |
| R5 | `popup-layer.tsx` | `    restore.current = null⏎    if (live.current.length > 0) ` → `    restore.current = live.current[0]?.opener ?? n` | 11 · 1 | PopupLayer — 쌓기 · 닫기 모두 걷기(clear)는 포커스를 돌려주지 않는다 «AssertionError: expected <button></button> not to be <button></button> // Object.is equality» |
| R6 | `popup-layer.tsx` | `if (live.current.length >= POPUP_DEPTH_MAX) return false` → `if (live.current.length > POPUP_DEPTH_MAX) return ` | 11 · 1 | PopupLayer — 쌓기 · 닫기 겹은 다섯까지 — 여섯째는 쌓지 않는다 · 아래 겹은 inert «AssertionError: expected [ true, true, true, true, true, true ] to deeply equal [ true, true, true, true, true, false ]» |
| R7 | `popup-layer.tsx` | `inert={popup.key !== topKey}` → `inert={false}` | 11 · 1 | PopupLayer — 쌓기 · 닫기 겹은 다섯까지 — 여섯째는 쌓지 않는다 · 아래 겹은 inert «AssertionError: expected [ false, false, false, false, false ] to deeply equal [ true, true, true, true, false ]» |
| R8 | `popup-layer.tsx` | `      event.preventDefault()⏎      last.focus()⏎    } else i` → `      event.preventDefault()⏎      first.focus()⏎ ` | 11 · 1 | PopupLayer — 쌓기 · 닫기 Tab 은 맨 위 상자 안을 돈다 «AssertionError: expected <button type="button" …(2)></button> to be <button …(4)>…(1)</button> // Object.is equality» |
| R9 | `popup-layer.tsx` | `overlay={overlays[popup.key] ?? EMPTY_OVERLAY}` → `overlay={EMPTY_OVERLAY}` | 11 · 1 | PopupLayer — 쌓기 · 닫기 팝업마다 제 겹layer — 닫았다 다시 열면 처음 판이다 «AssertionError: expected <p data-wb-structure="default" …(3)></p> to be null» |
| R10 | `popup-layer.tsx` | `onMouseDown={(event) => event.preventDefault()}` → `onMouseDown={() => {}}` | 11 · 1 | PopupLayer — 쌓기 · 닫기 덮개 누름은 막는다 — 포커스가 상자 밖으로 안 나가고 닫지도 않는다 «AssertionError: expected false to be true // Object.is equality» |
| R11 | `popup-layer.tsx` | `?.setAttribute('aria-modal', 'true')` → `?.setAttribute('data-x', 'true')` | 11 · 1 | PopupLayer — 쌓기 · 닫기 쌓은 팝업을 덮개 위 상자로 그리고 상자 뿌리에 aria-modal 을 단다 · 포커스가 상자 안 첫 요소(✖)로 간다 «AssertionError: expected null to be 'true' // Object.is equality» |
| R12 | `popup-layer.tsx` | `frame?.querySelector<HTMLElement>(FOCUSABLE)?.focus()` → `void frame` | 11 · 3 | PopupLayer — 쌓기 · 닫기 쌓은 팝업을 덮개 위 상자로 그리고 상자 뿌리에 aria-modal 을 단다 · 포커스가 상자 안 첫 요소(✖)로 간다 «AssertionError: expected null to be 'close' // Object.is equality» / PopupLayer — 쌓기 · 닫기 Escape 는 맨 위 하나만 닫는다 — 한글 조합 중의 Escape 는 닫지 않는다 «AssertionError: expected [ <div …(2)>…(2)</div>, …(1) ] to have a length of 1 but got 2» / PopupLayer — 쌓기 · 닫기 조합 구간(compositionstart ~ end)의 Escape 도 닫지 않는다 — isComposing 이 없는 판 «AssertionError: expected [ …(1) ] to have a length of +0 but got 1» |
| R13 | `popup-layer.tsx` | `if (frame?.contains(event.target as Node) === true) onClose(` → `void frame` | 11 · 1 | PopupLayer — 쌓기 · 닫기 ✖ 를 누르면 맨 위를 닫고 연 요소로 포커스를 돌려준다 «AssertionError: expected [ …(1) ] to have a length of +0 but got 1» |
| R14 | `popup-layer.tsx` | `      serial.current += 1⏎      restore.current = null` → `      serial.current += 0⏎      restore.current = ` | 11 · 1 | PopupLayer — 쌓기 · 닫기 겹은 다섯까지 — 여섯째는 쌓지 않는다 · 아래 겹은 inert «AssertionError: expected [ false, false, false, false, false ] to deeply equal [ true, true, true, true, false ]» |

R3 은 정의 단계에서 뺐다(R4 와 같은 줄을 겨눠 겹쳤다).

### `wb-theme check` P1 ~ P4(`packages/theme-kit/test/check.test.ts` — 깨는 뷰 열하나 · 대조 하나)

| 변조 | 자리 | 바꿈 | 실행 · 실패 | 죽은 케이스 «실패 값» |
| --- | --- | --- | --- | --- |
| C2 | `check.ts` | `} else if (closes[0]!.tagName !== 'BUTTON') {` → `} else if (false) {` | 31 · 1 | checkTheme P1 — close 조각이 없거나 · 이름이 다르거나 · 단추가 아니거나 · 이름이 없으면 팝업마다 선다 «AssertionError: expected undefined to deeply equal [ '빈 팝업', …(1) ]» |
| C3 | `check.ts` | `} else if (accessibleName(closes[0]!) === '') {` → `} else if (false) {` | 31 · 1 | checkTheme P1 — close 조각이 없거나 · 이름이 다르거나 · 단추가 아니거나 · 이름이 없으면 팝업마다 선다 «AssertionError: expected [] to deeply equal [ Array(3) ]» |
| C4 | `check.ts` | `if (element.getAttribute('role') !== 'dialog') {` → `if (false) {` | 31 · 1 | checkTheme P2 — 뿌리가 dialog 가 아니거나 · aria-labelledby 가 없거나 · 없는 id 를 가리키거나 · 제목 글이 title 조각 밖이면 선다 «AssertionError: expected undefined to deeply equal [ '폼 팝업(2열 폼 표 · 바닥 · 넓게)', …(1) ]» |
| C5 | `check.ts` | `if (ids.length === 0) out.push(` → `if (false) out.push(` | 31 · 1 | checkTheme P2 — 뿌리가 dialog 가 아니거나 · aria-labelledby 가 없거나 · 없는 id 를 가리키거나 · 제목 글이 title 조각 밖이면 선다 «AssertionError: expected [ '빈 팝업', …(1) ] to deeply equal [ '빈 팝업', …(1) ]» |
| C6 | `check.ts` | `else if (named !== title) out.push(` → `else if (false) out.push(` | 31 · 1 | checkTheme P2 — 뿌리가 dialog 가 아니거나 · aria-labelledby 가 없거나 · 없는 id 를 가리키거나 · 제목 글이 title 조각 밖이면 선다 «AssertionError: expected undefined to deeply equal [ '검색 팝업(검색폼 · 라디오 그리드 · 바)', …(1) ]» |
| C7 | `check.ts` | `if (bodies.length !== 1) {` → `if (bodies.length === 0) {` | 31 · 1 | checkTheme P3 — 몸통을 body 조각 밖에 두면 몸통 노드마다 · body 가 둘이면 팝업마다 선다(빈 팝업은 몸통이 없어 앞 것에 안 걸린다) «AssertionError: expected [] to deeply equal [ Array(3) ]» |
| C8 | `check.ts` | `if (drawn !== null && !body.contains(drawn)) {` → `if (false) {` | 31 · 1 | checkTheme P3 — 몸통을 body 조각 밖에 두면 몸통 노드마다 · body 가 둘이면 팝업마다 선다(빈 팝업은 몸통이 없어 앞 것에 안 걸린다) «AssertionError: expected [] to deeply equal [ [ …(2) ], [ …(2) ], [ …(2) ] ]» |
| C9 | `check.ts` | `if (drawn !== null && body.contains(drawn)) {` → `if (false) {` | 31 · 1 | checkTheme P4 — «바닥» 구역을 body 안에 두면 바닥 노드마다 선다(바닥 없는 빈 팝업은 안 걸린다) «AssertionError: expected [] to deeply equal [ [ …(2) ], [ …(2) ], [ …(2) ], …(1) ]» |
| C10 | `check.ts` | `        for (const message of popupProblems(container, galle` → `` | 31 · 4 | checkTheme P1 — close 조각이 없거나 · 이름이 다르거나 · 단추가 아니거나 · 이름이 없으면 팝업마다 선다 «AssertionError: expected [] to deeply equal [ Array(3) ]» / checkTheme P2 — 뿌리가 dialog 가 아니거나 · aria-labelledby 가 없거나 · 없는 id 를 가리키거나 · 제목 글이 title 조각 밖이면 선다 «AssertionError: expected undefined to deeply equal [ '폼 팝업(2열 폼 표 · 바닥 · 넓게)', …(1) ]» / checkTheme P3 — 몸통을 body 조각 밖에 두면 몸통 노드마다 · body 가 둘이면 팝업마다 선다(빈 팝업은 몸통이 없어 앞 것에 안 걸린다) «AssertionError: expected [] to deeply equal [ [ …(2) ], [ …(2) ], [ …(2) ] ]» / checkTheme P4 — «바닥» 구역을 body 안에 두면 바닥 노드마다 선다(바닥 없는 빈 팝업은 안 걸린다) «AssertionError: expected [] to deeply equal [ [ …(2) ], [ …(2) ], [ …(2) ], …(1) ]» |
| C1b | `check.ts` | `const closes = owned('[data-wb-part="close"]')` → `const closes = owned('button')` | 31 · 1 | checkTheme P1 — close 조각이 없거나 · 이름이 다르거나 · 단추가 아니거나 · 이름이 없으면 팝업마다 선다 «AssertionError: expected [] to deeply equal [ Array(3) ]» |

C1(`!== 1` → `> 1`)은 `close` 가 없는 판에서 `TypeError` 로 죽어 값이 아니라 뺐고, C1b(조각 이름 대신 단추를 센다)로 갈음했다.

### 마이그레이션 `0033`(`apps/api/test/modal-popup-migration.test.ts` — 제 DB · 0032 에서 판을 세워 올리고 내린다)

| 변조 | 자리 | 바꿈 | 실행 · 실패 | 죽은 케이스 «실패 값» |
| --- | --- | --- | --- | --- |
| G1 | `0033-modal-popup.ts` | `        where owner_id in (select user_id from project_membe` → `⏎` | 6 · 3 | 0033 — «팝업 열기» 대상 페이지를 팝업 페이지로 한 페이지로 풀리는 대상만 옮긴다 — 모으는 자리 넷(페이지 · 레이아웃 · 모듈 · 멤버의 개인 모듈) · 옮긴 수를 한 줄로 «AssertionError: expected [ Array(1) ] to deeply equal [ Array(1) ]» / 0033 — «팝업 열기» 대상 페이지를 팝업 페이지로 안 옮기는 것 — 둘로 풀리는 대상 · 없는 대상 · 빈 대상 · navigate · 남의 프로젝트의 같은 경로 · 멤버가 아닌 사람의 개인 모듈 «AssertionError: d195dd43-a743-4e88-bf72-a2abf27f0177: expected 'Popup' to be 'Page' // Object.is equality» / 0033 — «팝업 열기» 대상 페이지를 팝업 페이지로 down — 옛 문서로 돌아간다 · 새로 만든 팝업 페이지는 바닥 노드를 몸통 끝에 붙여 내린다 «AssertionError: expected [ Array(1) ] to deeply equal [ Array(1) ]» |
| G2 | `0033-modal-popup.ts` | `if (found.length === 1) chosen.add(found[0]!)` → `if (found.length >= 1) chosen.add(found[0]!)` | 6 · 3 | 0033 — «팝업 열기» 대상 페이지를 팝업 페이지로 한 페이지로 풀리는 대상만 옮긴다 — 모으는 자리 넷(페이지 · 레이아웃 · 모듈 · 멤버의 개인 모듈) · 옮긴 수를 한 줄로 «AssertionError: expected [ Array(1) ] to deeply equal [ Array(1) ]» / 0033 — «팝업 열기» 대상 페이지를 팝업 페이지로 안 옮기는 것 — 둘로 풀리는 대상 · 없는 대상 · 빈 대상 · navigate · 남의 프로젝트의 같은 경로 · 멤버가 아닌 사람의 개인 모듈 «AssertionError: 166a48dc-dc80-4a6a-962f-2839283cac16: expected 'Popup' to be 'Page' // Object.is equality» / 0033 — «팝업 열기» 대상 페이지를 팝업 페이지로 down — 옛 문서로 돌아간다 · 새로 만든 팝업 페이지는 바닥 노드를 몸통 끝에 붙여 내린다 «AssertionError: expected [ Array(1) ] to deeply equal [ Array(1) ]» |
| G3 | `0033-modal-popup.ts` | `  return path⏎    .split('/')⏎    .map((segment) => segment.` → `  return path` | 6 · 2 | 0033 — «팝업 열기» 대상 페이지를 팝업 페이지로 한 페이지로 풀리는 대상만 옮긴다 — 모으는 자리 넷(페이지 · 레이아웃 · 모듈 · 멤버의 개인 모듈) · 옮긴 수를 한 줄로 «AssertionError: expected [ Array(1) ] to deeply equal [ Array(1) ]» / 0033 — «팝업 열기» 대상 페이지를 팝업 페이지로 down — 옛 문서로 돌아간다 · 새로 만든 팝업 페이지는 바닥 노드를 몸통 끝에 붙여 내린다 «AssertionError: expected [ Array(1) ] to deeply equal [ Array(1) ]» |
| G4 | `0033-modal-popup.ts` | `      select schema as body from layouts where project_id = ` → `      select nodes as body from modules` | 6 · 2 | 0033 — «팝업 열기» 대상 페이지를 팝업 페이지로 한 페이지로 풀리는 대상만 옮긴다 — 모으는 자리 넷(페이지 · 레이아웃 · 모듈 · 멤버의 개인 모듈) · 옮긴 수를 한 줄로 «AssertionError: expected [ Array(1) ] to deeply equal [ Array(1) ]» / 0033 — «팝업 열기» 대상 페이지를 팝업 페이지로 down — 옛 문서로 돌아간다 · 새로 만든 팝업 페이지는 바닥 노드를 몸통 끝에 붙여 내린다 «AssertionError: expected [ Array(1) ] to deeply equal [ Array(1) ]» |
| G5 | `0033-modal-popup.ts` | `if (value.type === 'openModal' && typeof value.target === 's` → `if ((value.type === 'openModal' \|\| value.type === ` | 6 · 4 | 0033 — «팝업 열기» 대상 페이지를 팝업 페이지로 한 페이지로 풀리는 대상만 옮긴다 — 모으는 자리 넷(페이지 · 레이아웃 · 모듈 · 멤버의 개인 모듈) · 옮긴 수를 한 줄로 «AssertionError: expected [ Array(1) ] to deeply equal [ Array(1) ]» / 0033 — «팝업 열기» 대상 페이지를 팝업 페이지로 안 옮기는 것 — 둘로 풀리는 대상 · 없는 대상 · 빈 대상 · navigate · 남의 프로젝트의 같은 경로 · 멤버가 아닌 사람의 개인 모듈 «AssertionError: 33188118-9552-4625-af50-c4673c1dc9a8: expected 'Popup' to be 'Page' // Object.is equality» / 0033 — «팝업 열기» 대상 페이지를 팝업 페이지로 스냅샷 — payload 의 메뉴로 풀어 «등록»(페이지가 연다) · «상세»(레이아웃이 연다)만 옮긴다 «AssertionError: expected [ [ '목록', 'Page' ], …(3) ] to deeply equal [ [ '목록', 'Page' ], …(3) ]» / 0033 — «팝업 열기» 대상 페이지를 팝업 페이지로 down — 옛 문서로 돌아간다 · 새로 만든 팝업 페이지는 바닥 노드를 몸통 끝에 붙여 내린다 «AssertionError: expected [ Array(1) ] to deeply equal [ Array(1) ]» |
| G6 | `0033-modal-popup.ts` | `if (Array.isArray(payload.layouts)) for (const layout of pay` → `` | 6 · 3 | 0033 — «팝업 열기» 대상 페이지를 팝업 페이지로 한 페이지로 풀리는 대상만 옮긴다 — 모으는 자리 넷(페이지 · 레이아웃 · 모듈 · 멤버의 개인 모듈) · 옮긴 수를 한 줄로 «AssertionError: expected [ Array(1) ] to deeply equal [ Array(1) ]» / 0033 — «팝업 열기» 대상 페이지를 팝업 페이지로 스냅샷 — payload 의 메뉴로 풀어 «등록»(페이지가 연다) · «상세»(레이아웃이 연다)만 옮긴다 «AssertionError: expected [ [ '목록', 'Page' ], …(3) ] to deeply equal [ [ '목록', 'Page' ], …(3) ]» / 0033 — «팝업 열기» 대상 페이지를 팝업 페이지로 down — 옛 문서로 돌아간다 · 새로 만든 팝업 페이지는 바닥 노드를 몸통 끝에 붙여 내린다 «AssertionError: expected [ Array(1) ] to deeply equal [ Array(1) ]» |
| G7 | `0033-modal-popup.ts` | `return { ...schema, root: { ...schema.root, type: 'Popup', p` → `return { ...schema, root: { ...schema.root, type: ` | 6 · 1 | 0033 — «팝업 열기» 대상 페이지를 팝업 페이지로 옮긴 뿌리 — 제목은 페이지 제목 · 몸통 · 번호는 그대로 · 바닥 구역은 안 만든다 · 검증을 지난다 «AssertionError: expected { root: { id: 'n_root', …(3) }, …(1) } to deeply equal { version: 5, root: { …(4) } }» |
| G8 | `0033-modal-popup.ts` | `const next: Raw = { ...root, type: 'Page', children: [...chi` → `const next: Raw = { ...root, type: 'Page', childre` | 6 · 1 | 0033 — «팝업 열기» 대상 페이지를 팝업 페이지로 down — 옛 문서로 돌아간다 · 새로 만든 팝업 페이지는 바닥 노드를 몸통 끝에 붙여 내린다 «AssertionError: expected { root: { id: 'n_root', …(2) }, …(1) } to deeply equal { version: 5, root: { …(3) } }» |
| G9 | `0033-modal-popup.ts` | `select id, menu_node_id as "menuNodeId", title, schema from ` → `select id, menu_node_id as "menuNodeId", title, sc` | 6 · 3 | 0033 — «팝업 열기» 대상 페이지를 팝업 페이지로 한 페이지로 풀리는 대상만 옮긴다 — 모으는 자리 넷(페이지 · 레이아웃 · 모듈 · 멤버의 개인 모듈) · 옮긴 수를 한 줄로 «AssertionError: expected [ Array(1) ] to deeply equal [ Array(1) ]» / 0033 — «팝업 열기» 대상 페이지를 팝업 페이지로 안 옮기는 것 — 둘로 풀리는 대상 · 없는 대상 · 빈 대상 · navigate · 남의 프로젝트의 같은 경로 · 멤버가 아닌 사람의 개인 모듈 «AssertionError: ba86d3c7-b026-45b9-b153-b5f0fcfb7174: expected 'Popup' to be 'Page' // Object.is equality» / 0033 — «팝업 열기» 대상 페이지를 팝업 페이지로 down — 옛 문서로 돌아간다 · 새로 만든 팝업 페이지는 바닥 노드를 몸통 끝에 붙여 내린다 «AssertionError: expected [ Array(1) ] to deeply equal [ Array(1) ]» |
| G10 | `0033-modal-popup.ts` | `pathOf.set(node.id, [...ancestors, node.title.trim()])` → `pathOf.set(node.id, [...ancestors, node.title])` | 6 · 4 | 0033 — «팝업 열기» 대상 페이지를 팝업 페이지로 한 페이지로 풀리는 대상만 옮긴다 — 모으는 자리 넷(페이지 · 레이아웃 · 모듈 · 멤버의 개인 모듈) · 옮긴 수를 한 줄로 «AssertionError: expected [ Array(1) ] to deeply equal [ Array(1) ]» / 0033 — «팝업 열기» 대상 페이지를 팝업 페이지로 옮긴 뿌리 — 제목은 페이지 제목 · 몸통 · 번호는 그대로 · 바닥 구역은 안 만든다 · 검증을 지난다 «AssertionError: expected { root: { id: 'n_root', …(2) }, …(1) } to deeply equal { version: 5, root: { …(4) } }» / 0033 — «팝업 열기» 대상 페이지를 팝업 페이지로 스냅샷 — payload 의 메뉴로 풀어 «등록»(페이지가 연다) · «상세»(레이아웃이 연다)만 옮긴다 «AssertionError: expected [ [ '목록', 'Page' ], …(3) ] to deeply equal [ [ '목록', 'Page' ], …(3) ]» / 0033 — «팝업 열기» 대상 페이지를 팝업 페이지로 down — 옛 문서로 돌아간다 · 새로 만든 팝업 페이지는 바닥 노드를 몸통 끝에 붙여 내린다 «AssertionError: expected [ Array(1) ] to deeply equal [ Array(1) ]» |
| G11 | `0033-modal-popup.ts` | ``     if (count === 0) continue⏎    await sql`update snapshots `` → ``     if (count >= 0) continue⏎    await sql`update  `` | 6 · 1 | 0033 — «팝업 열기» 대상 페이지를 팝업 페이지로 down — 옛 문서로 돌아간다 · 새로 만든 팝업 페이지는 바닥 노드를 몸통 끝에 붙여 내린다 «AssertionError: expected [ Array(1) ] to deeply equal [ Array(1) ]» |
| G12 | `0033-modal-popup.ts` | `` await sql`update pages set schema = ${JSON.stringify(lifted) `` → `` await sql`update pages set schema = ${JSON.stringi `` | 6 · 1 | 0033 — «팝업 열기» 대상 페이지를 팝업 페이지로 옮긴 뿌리 — 제목은 페이지 제목 · 몸통 · 번호는 그대로 · 바닥 구역은 안 만든다 · 검증을 지난다 «AssertionError: expected [ '8', '5' ] to deeply equal [ '7', '5' ]» |
| G13 | `0033-modal-popup.ts` | `if (!isRecord(schema) \|\| !isRecord(schema.root) \|\| schema.ro` → `if (!isRecord(schema) \|\| !isRecord(schema.root)) r` | 6 · 1 | 0033 — «팝업 열기» 대상 페이지를 팝업 페이지로 한 번 더 돌려도 그대로다 — 이미 팝업인 뿌리는 안 센다 «AssertionError: expected { pages: 4, snapshots: 1, …(1) } to deeply equal { pages: +0, snapshots: +0, …(1) }» |

G2 의 첫 판은 붐빌 때 첫 케이스가 기본 한도(5s)를 넘겨 `STACK_TRACE_ERROR` 로 죽었다 — 값이 아니라 버리고, 오르내림 케이스 둘에 60s 한도를 준 뒤 다시 돌린 판(위 줄)이 값으로 죽었다.

### 캔버스 · 입구 · 번들 · lint · CLI · MCP · api(K · P · Q · N · B · Y · L · C · A)

각 변조는 그 케이스 파일만 돌렸다(N3 은 셋, P1 은 둘). K7 은 `popups.handle(event.requests)` 둘 가운데 첫째(캔버스 문서의 것)다.

| 변조 | 자리 | 바꿈 | 실행 · 실패 | 죽은 케이스 «실패 값» |
| --- | --- | --- | --- | --- |
| K1 | `canvas-popups.tsx` | `if (!isPopupDocument(page.schema)) {` → `if (false) {` | 33 · 1 | 뷰 모드의 «팝업 열기» · «팝업 닫기» 화면 페이지는 열지 않고 그렇다고 말한다 «AssertionError: expected [] to deeply equal [ Array(1) ]» |
| K2 | `canvas-popups.tsx` | `say(matches.length === 0 ? popupMissingPage(request.target) ` → `say(popupAmbiguousPage(request.target))` | 33 · 1 | 뷰 모드의 «팝업 열기» · «팝업 닫기» 없는 대상 · 읽기 실패는 한 줄로 말한다 «AssertionError: expected [ Array(1) ] to deeply equal [ '이 프로젝트에 없는 페이지입니다: page:없는/곳' ]» |
| K3 | `canvas-popups.tsx` | `if (latest.current.runtimeKey === key) say(POPUP_LOAD_FAILED` → `void key` | 33 · 1 | 뷰 모드의 «팝업 열기» · «팝업 닫기» 없는 대상 · 읽기 실패는 한 줄로 말한다 «AssertionError: expected [] to deeply equal [ '팝업을 불러오지 못했습니다' ]» |
| K4 | `canvas-popups.tsx` | `latest.current.say(latest.current.rootIsPopup ? NO_OPEN_POPU` → `latest.current.say(NO_OPEN_POPUP, latest.current.r` | 33 · 1 | 뷰 모드의 «팝업 열기» · «팝업 닫기» 팝업 페이지를 바로 열면 상자만 그리고 ✖ · «팝업 닫기» 는 바로 연 판이라고 말한다 «AssertionError: expected [ '열린 팝업이 없습니다' ] to deeply equal [ '열린 팝업이 없습니다 — 이 팝업 페이지를 바로 열었습니다' ]» |
| K5 | `canvas.tsx` | `    popupStack.clear()⏎  }, [runtimeKey, popupStack.clear])` → `    void 0⏎  }, [runtimeKey, popupStack.clear])` | 33 · 1 | 뷰 모드의 «팝업 열기» · «팝업 닫기» 편집 모드로 나가면 열린 팝업이 닫힌다 «AssertionError: expected 1 to be +0 // Object.is equality» |
| K6 | `canvas.tsx` | `mode === 'view' && isPopupClose(event.target)` → `false && isPopupClose(event.target)` | 33 · 1 | 뷰 모드의 «팝업 열기» · «팝업 닫기» 팝업 페이지를 바로 열면 상자만 그리고 ✖ · «팝업 닫기» 는 바로 연 판이라고 말한다 «AssertionError: expected [] to deeply equal [ '열린 팝업이 없습니다 — 이 팝업 페이지를 바로 열었습니다' ]» |
| K7 | `canvas.tsx` | `popups.handle(event.requests)` → `void event.requests` | 33 · 7 | 뷰 모드의 «팝업 열기» · «팝업 닫기» 팝업 페이지면 덮개 위에 그 문서를 그린다 — 알림 없이 «AssertionError: expected [] to have a length of 1 but got +0» / 뷰 모드의 «팝업 열기» · «팝업 닫기» «팝업 닫기» 규칙 · ✖ · Escape 가 맨 위를 닫는다 «AssertionError: expected [] to have a length of 1 but got +0» / 뷰 모드의 «팝업 열기» · «팝업 닫기» 화면 페이지는 열지 않고 그렇다고 말한다 «AssertionError: expected [] to deeply equal [ Array(1) ]» / 뷰 모드의 «팝업 열기» · «팝업 닫기» 없는 대상 · 읽기 실패는 한 줄로 말한다 «AssertionError: expected [] to deeply equal [ '이 프로젝트에 없는 페이지입니다: page:없는/곳' ]» / 뷰 모드의 «팝업 열기» · «팝업 닫기» 열린 팝업이 없는 «팝업 닫기» 는 그렇다고 말한다 — 팝업 페이지를 바로 연 판의 ✖ 도 «AssertionError: expected [] to deeply equal [ '열린 팝업이 없습니다' ]» / 뷰 모드의 «팝업 열기» · «팝업 닫기» 팝업 페이지를 바로 열면 상자만 그리고 ✖ · «팝업 닫기» 는 바로 연 판이라고 말한다 «AssertionError: expected [] to deeply equal [ '열린 팝업이 없습니다 — 이 팝업 페이지를 바로 열었습니다' ]» / 뷰 모드의 «팝업 열기» · «팝업 닫기» 편집 모드로 나가면 열린 팝업이 닫힌다 «AssertionError: expected [] to have a length of 1 but got +0» |
| P1 | `interaction-panel.tsx` | `  { value: 'closeModal', label: '팝업 닫기' },⏎` → `` | 27 · 2 | 상호작용 탭 — 고정 6종 · 4종을 화면이 보인다 액션 선택지가 상호작용 모델의 6종이다 «AssertionError: expected [ '속성 바꾸기', '보이기·숨기기', '탭 전환', …(2) ] to deeply equal [ '속성 바꾸기', '보이기·숨기기', '탭 전환', …(3) ]» / 상호작용 탭 — 팝업 열기 · 닫기 «팝업 닫기» 는 대상이 없다 — 대상 칸 · 페이지 칸이 서지 않고 { type: closeModal } 이 나간다 «TypeError: Cannot read properties of undefined (reading 'type')» |
| P2 | `interaction-panel.tsx` | `          {choices.some((choice) => choice.kind === 'popup')` → `          {choices.some((choice) => choice.kind ==` | 6 · 1 | 상호작용 탭 — 팝업 열기 · 닫기 페이지 고르개는 팝업 페이지를 먼저 · 화면 페이지를 뒤에 보이고, 고르면 그 대상 글자가 나간다 «AssertionError: expected [ …(2) ] to deeply equal [ [ '팝업 페이지', …(1) ], …(1) ]» |
| P3 | `page-kind-ops.ts` | `const ops: PatchOp[] = [{ op: 'test', path: '/root/type', va` → `const ops: PatchOp[] = []` | 6 · 2 | 페이지 정보 «종류» 화면 → 팝업: 뿌리 타입 · 제목(페이지 이름)을 바꾸는 묶음 하나 — 앞에 뿌리 타입의 test «AssertionError: expected [ { op: 'replace', …(2) }, …(1) ] to deeply equal [ { op: 'test', …(2) }, …(2) ]» / 페이지 정보 «종류» 팝업 → 화면: 바닥 노드를 몸통 끝으로 옮기고(지우지 않는다) 바닥 · props 를 걷는다 «AssertionError: expected [ { op: 'move', …(2) }, …(4) ] to deeply equal [ { op: 'test', …(2) }, …(5) ]» |
| P4 | `page-kind-ops.ts` | `  for (let i = 0; i < footer.length; i += 1) ops.push({ op: ` → `` | 6 · 1 | 페이지 정보 «종류» 팝업 → 화면: 바닥 노드를 몸통 끝으로 옮기고(지우지 않는다) 바닥 · props 를 걷는다 «AssertionError: expected [ { op: 'test', …(2) }, …(3) ] to deeply equal [ { op: 'test', …(2) }, …(5) ]» |
| P5 | `page-kind-ops.ts` | `path: '/root/props', value: { title } })` → `path: '/root/props', value: { title: '팝업' } })` | 6 · 1 | 페이지 정보 «종류» 화면 → 팝업: 뿌리 타입 · 제목(페이지 이름)을 바꾸는 묶음 하나 — 앞에 뿌리 타입의 test «AssertionError: expected [ { op: 'test', …(2) }, …(2) ] to deeply equal [ { op: 'test', …(2) }, …(2) ]» |
| P6 | `menu-tree.tsx` | `{popup && <span className="wb-shell-hidden-text"> — 팝업</span` → `` | 6 · 2 | 메뉴 트리 — 팝업 표지 팝업 페이지 줄은 이름 뒤에 « — 팝업» 을 읽는다 · 화면 페이지 줄은 그대로다 «Error: Unable to find role="link" and name "회원 상세 — 팝업"» / 메뉴 트리 — 팝업 표지 열린 페이지는 열린 문서의 뿌리로 읽는다 — 트리 응답이 화면이라 해도 «Error: Unable to find role="link" and name "회원 목록 — 팝업"» |
| P7 | `menu-tree.tsx` | `if (document !== null) return pageKindOf(document)` → `void document` | 6 · 1 | 메뉴 트리 — 팝업 표지 열린 페이지는 열린 문서의 뿌리로 읽는다 — 트리 응답이 화면이라 해도 «Error: Unable to find role="link" and name "회원 목록 — 팝업"» |
| Q1 | `use-tree-commands.tsx` | `...(pageKind === 'popup' ? { kind: pageKind } : {})` → `...{}` | 63 · 1 | 메뉴·페이지 만들기 팝업 페이지 추가는 종류를 실어 createPage 를 내고 만든 페이지로 이동한다 «AssertionError: expected "spy" to be called with arguments: [ 'p-1', …(1) ]» |
| Q2 | `tree-row-actions.tsx` | `      menuItem(commands, 'addPage', {⏎        key: 'add-popu` → `` | 17 · 1 | 줄 행동의 항목 — spec 「트리」 표 메뉴 줄: `+` 하위 메뉴 · 페이지 추가 · 팝업 페이지 추가 · JSON 에서 가져오기…, `…` 이름 변경 · 위로 · 아래로 · 들여쓰기 · 내어쓰기 · 삭제 «AssertionError: expected [ '하위 메뉴', '페이지 추가', 'JSON 에서 가져오기…' ] to deeply equal [ Array(4) ]» |
| N1 | `new-page.ts` | `    ...(seed.interactions === undefined ? {} : { interaction` → `` | 12 · 1 | createNode 서버가 짓는 새 팝업 페이지의 뿌리는 에디터가 짓는 팝업 노드와 같은 꼴이다 — 제목 · 빈 몸통만 더한다 «AssertionError: expected { id: 'n_test1', type: 'Popup', …(3) } to deeply equal { id: 'n_test1', type: 'Popup', …(3) }» |
| N2 | `create-node.ts` | `          ...(seed.interactions === undefined ? {} : { inter` → `` | 12 · 2 | createNode 기본 내용 — 구역의 `initial` 이 실제 노드로 들고 id 는 같은 생성기에서 차례로 나온다 «AssertionError: expected { id: 'n_test1', type: 'Popup', …(1) } to deeply equal { id: 'n_test1', type: 'Popup', …(1) }» / createNode 서버가 짓는 새 팝업 페이지의 뿌리는 에디터가 짓는 팝업 노드와 같은 꼴이다 — 제목 · 빈 몸통만 더한다 «AssertionError: expected { id: 'n_test1', type: 'Popup', …(3) } to deeply equal { id: 'n_test1', type: 'Popup', …(3) }» |
| N3 | `validate.ts` | `export const ROOT_TYPES: readonly string[] = ['Page', 'Popup` → `export const ROOT_TYPES: readonly string[] = ['Pag` | 37 · 3 | createNode 페이지에 바로 둘 수 없는 타입은 뿌리 Page · Popup · Slot · 탭 안의 TabPanel · 그리드의 부품 넷이다 «AssertionError: expected [ 'Page', 'Slot', 'TabPanel', …(4) ] to deeply equal [ 'Page', 'Popup', 'Slot', …(5) ]» / pasteOps 팝업 뿌리(Popup)도 붙이지 않는다 — 보내기 전에 같은 판정으로 막는다 «AssertionError: expected [] to include 'Popup는 루트에만 둘 수 있습니다'» / placeableGroups 페이지에 둘 수 없는 타입은 목록에 없다 — 뿌리 · 레이아웃 전용 «AssertionError: expected [ 'Page', 'Slot' ] to deeply equal [ 'Page', 'Popup', 'Slot' ]» |
| B1 | `index.ts` | `      queue.push(popup)⏎` → `` | 7 · 3 | 페이지 데이터의 팝업 문서 «팝업 열기» 로 닿는 팝업만 — 팝업이 연 팝업까지 한 벌씩 · 화면 페이지 · 안 닿는 팝업은 없다 «AssertionError: expected [ 'page:가' ] to deeply equal [ 'page:가', 'page:나' ]» / 런타임 — 덮개 위 팝업 실린 팝업은 쌓고, 팝업 안 «팝업 닫기» · ✖ 가 맨 위를 닫는다 — 옮기지 않는다 «AssertionError: expected <div data-wb-popup-level="1">…(2)</div> to have a length of 2 but got 1» / 런타임 — 덮개 위 팝업 서로를 여는 팝업은 다섯 겹에서 멈추고 그렇다고 말한다 «AssertionError: expected <div data-wb-popup-level="1">…(2)</div> to have a length of 5 but got 1» |
| B2 | `index.ts` | `if (modalOnly && action.type !== 'openModal') continue` → `if (false) continue` | 7 · 1 | 페이지 데이터의 팝업 문서 «팝업 열기» 로 닿는 팝업만 — 팝업이 연 팝업까지 한 벌씩 · 화면 페이지 · «이동» 으로만 가리키는 팝업은 없다 «AssertionError: expected [ 'page:가', 'page:나', 'page:다' ] to deeply equal [ 'page:가', 'page:나' ]» |
| B3 | `index.ts` | `...(Object.keys(popups).length === 0 ? {} : { popups }),` → `popups,` | 7 · 1 | 페이지 데이터의 팝업 문서 팝업이 없는 페이지는 키째 없다 — 그 번들의 바이트가 그대로다 «AssertionError: expected true to be false // Object.is equality» |
| B4 | `shell.tsx` | `{item.popup === true && <span className="wb-export-hidden"> ` → `` | 7 · 1 | 페이지 데이터의 팝업 문서 목차의 팝업 줄은 표지와 « — 팝업» 이름을 단다 · 화면 줄은 그대로다 «AssertionError: expected [ [ '목록', false ], …(4) ] to deeply equal [ [ '목록', false ], …(4) ]» |
| B5 | `mount.tsx` | `if (!popups.pop()) added.push(isPopupDocument(input.document` → `if (!popups.pop()) added.push(NO_OPEN_POPUP)` | 7 · 1 | 런타임 — 덮개 위 팝업 팝업 페이지를 바로 연 판의 ✖ · «팝업 닫기» 는 그렇다고 말한다 «AssertionError: expected [ '열린 팝업이 없습니다' ] to deeply equal [ '열린 팝업이 없습니다 — 이 팝업 페이지를 바로 열었습니다' ]» |
| B6 | `mount.tsx` | `if (!pushed) added.push(POPUP_DEPTH_NOTICE)` → `if (!pushed) void 0` | 7 · 1 | 런타임 — 덮개 위 팝업 서로를 여는 팝업은 다섯 겹에서 멈추고 그렇다고 말한다 «AssertionError: expected [] to deeply equal [ '팝업은 다섯 겹까지 엽니다' ]» |
| B7 | `mount.tsx` | `const popup = request.type === 'openModal' ? input.popups?.[` → `const popup = undefined as ExportPopup \| undefined` | 7 · 2 | 런타임 — 덮개 위 팝업 실린 팝업은 쌓고, 팝업 안 «팝업 닫기» · ✖ 가 맨 위를 닫는다 — 옮기지 않는다 «AssertionError: expected  to have a length of 1 but got +0» / 런타임 — 덮개 위 팝업 서로를 여는 팝업은 다섯 겹에서 멈추고 그렇다고 말한다 «TypeError: Cannot read properties of null (reading 'querySelector')» |
| Y1 | `shell-css.ts` | `.wb-export-nav-kind {` → `.wb-export-nav-badge {` | 4 · 1 | 상태 없는 페이지의 번들 바이트 assets/shell.css 는 옛 글자가 그대로 앞에 서고, 뒤에 붙은 규칙은 전환기(.wb-export-state…) · 목차의 팝업 표지(.wb-export-nav-kind · .wb-export-hidden)를 겨누는 것뿐이다 «AssertionError: expected '.wb-export-nav-badge' to match /\.wb-export-state\|^\. |
| L1 | `design.ts` | `if (action.type === 'openModal' && kind.has('page')) {` → `if (false) {` | 46 · 2 | 표를 덮는다 (D6) schema가 소유한 규칙이 하나도 빠짐없이 실제로 난다 «AssertionError: expected [ 'close-outside-popup', …(13) ] to deeply equal [ 'close-outside-popup', …(14) ]» / 팝업 — 대상의 종류 · 닫기의 자리 팝업 열기가 팝업 페이지를 가리키면 조용하다 · 화면 페이지를 가리키면 경고 «AssertionError: expected [] to deeply equal [ [ 'modal-target-not-popup', …(2) ] ]» |
| L2 | `design.ts` | `if (action.type === 'navigate' && kind.has('popup')) {` → `if (false) {` | 46 · 2 | 표를 덮는다 (D6) schema가 소유한 규칙이 하나도 빠짐없이 실제로 난다 «AssertionError: expected [ 'close-outside-popup', …(13) ] to deeply equal [ 'close-outside-popup', …(14) ]» / 팝업 — 대상의 종류 · 닫기의 자리 페이지 이동이 팝업 페이지를 가리키면 경고 · 화면 페이지는 조용하다 «AssertionError: expected [] to deeply equal [ 'navigate-to-popup' ]» |
| L3 | `design.ts` | `if (pageKindOf(page.document) !== 'popup') issues.push(...cl` → `issues.push(...closeOutsidePopup(node, path, where` | 46 · 1 | 팝업 — 대상의 종류 · 닫기의 자리 팝업 닫기는 팝업 페이지 안에서만 조용하다 «AssertionError: expected [ 'close-outside-popup' ] to deeply equal []» |
| L4 | `design.ts` | `if (targets.has(action.target)) {` → `if (true) {` | 46 · 4 | ④ navigate/openModal 대상 페이지가 존재하지 않음 입력의 어느 페이지 타겟과도 같지 않으면 낸다 «AssertionError: expected [] to have a length of 1 but got +0» / ④ navigate/openModal 대상 페이지가 존재하지 않음 openModal도 같은 규칙으로 낸다 — navigate 하나만 보지 않는다 «AssertionError: expected [] to deeply equal [ 'n_000000000038', 'n_000000000039' ]» / 표를 덮는다 (D6) schema가 소유한 규칙이 하나도 빠짐없이 실제로 난다 «AssertionError: expected [ 'close-outside-popup', …(13) ] to deeply equal [ 'close-outside-popup', …(14) ]» / 팝업 — 대상의 종류 · 닫기의 자리 없는 대상은 종류를 말하지 않는다 — 대상이 없다는 경고 하나 «AssertionError: expected [] to deeply equal [ 'page-target-missing' ]» |
| C1 | `page-get.ts` | `${view.kind === 'popup' ? ' · 팝업' : ''}` → `` | 29 · 1 | 팝업 페이지 — 종류 사람이 읽는 판은 팝업 페이지의 이름 뒤에 종류를 말한다 — 화면 페이지 줄은 그대로다 «AssertionError: expected '  상세 · 20000000-0000-4000-8000-000000…' to be '  상세 · 팝업 · 20000000-0000-4000-8000-0…' // Object.is equality» |
| C2 | `page-view.ts` | `kind: pageKindOf(input.document),` → `kind: 'page' as const,` | 29 · 2 | 팝업 페이지 — 종류 사람이 읽는 판은 팝업 페이지의 이름 뒤에 종류를 말한다 — 화면 페이지 줄은 그대로다 «AssertionError: expected '  상세 · 20000000-0000-4000-8000-000000…' to be '  상세 · 팝업 · 20000000-0000-4000-8000-0…' // Object.is equality» / 팝업 페이지 — 종류 --json 은 kind 를 싣는다 «AssertionError: expected 'page' to be 'popup' // Object.is equality» |
| C3 | `page.ts` | `const kind = pageKindOf(payload.pages.find((item) => item.id` → `const kind = 'page' as const` | 24 · 1 | list_pages — 다음 도구의 인자를 낸다 페이지마다 종류를 낸다 — 뿌리가 Popup 이면 popup «AssertionError: expected [ [ '관리자/회원/목록', 'page' ], …(2) ] to deeply equal [ [ '관리자/회원/목록', 'page' ], …(2) ]» |
| A1 | `pages.ts` | `schema: newPageDocument(body.kind ?? 'page', body.title),` → `schema: newPageDocument('page', body.title),` | 5 · 4 | POST /api/projects/:projectId/pages — kind kind: popup 이면 뿌리가 Popup 이고 제목이 페이지 이름 · 바닥이 [취소][저장] — «취소» 는 «팝업 닫기» 를 든다 «AssertionError: expected { id: 'n_648bc55f9f4b', …(2) } to match object { type: 'Popup', …(3) }» / 트리 · 내보내기 미리보기의 kind 트리 응답의 페이지마다 종류를 문서 뿌리에서 읽는다 «AssertionError: expected [ [ '목록', 'page' ], [ '검색', 'page' ] ] to deeply equal [ [ '목록', 'page' ], [ '검색', 'popup' ] ]» / 트리 · 내보내기 미리보기의 kind 내보내기 미리보기(html)의 pages[] 가 종류를 싣는다 «AssertionError: expected [ [ '회원 목록', 'page' ], …(1) ] to deeply equal [ [ '회원 목록', 'page' ], …(1) ]» / 트리 · 내보내기 미리보기의 kind 내보내기 미리보기(pptx)의 pages[] 가 종류를 싣는다 «AssertionError: expected [ [ '회원 목록', 'page' ], …(1) ] to deeply equal [ [ '회원 목록', 'page' ], …(1) ]» |
| A2 | `pages.ts` | `kind: z.enum(PAGE_KINDS).optional(),` → `kind: z.string().optional() as never,` | 5 · 1 | POST /api/projects/:projectId/pages — kind kind 를 빼면 화면 페이지 · 모르는 종류는 400 «AssertionError: expected 201 to be 400 // Object.is equality» |
| A3 | `menu-tree.ts` | `kind: row.root_type === 'Popup' ? 'popup' : 'page',` → `kind: 'page' as const,` | 5 · 1 | 트리 · 내보내기 미리보기의 kind 트리 응답의 페이지마다 종류를 문서 뿌리에서 읽는다 «AssertionError: expected [ [ '목록', 'page' ], [ '검색', 'page' ] ] to deeply equal [ [ '목록', 'page' ], [ '검색', 'popup' ] ]» |
| A4 | `export-bundle.ts` | `kind: pageKindOf(documentById.get(page.id)),` → `kind: 'page' as const,` | 5 · 1 | 트리 · 내보내기 미리보기의 kind 내보내기 미리보기(html)의 pages[] 가 종류를 싣는다 «AssertionError: expected [ [ '회원 목록', 'page' ], …(1) ] to deeply equal [ [ '회원 목록', 'page' ], …(1) ]» |
| A5 | `export-pptx.ts` | `kind: pageKindOf(documentById.get(page.id)),` → `kind: 'page' as const,` | 5 · 1 | 트리 · 내보내기 미리보기의 kind 내보내기 미리보기(pptx)의 pages[] 가 종류를 싣는다 «AssertionError: expected [ [ '회원 목록', 'page' ], …(1) ] to deeply equal [ [ '회원 목록', 'page' ], …(1) ]» |

B2 는 첫 판에 살았다 — fixture 에 «이동» 으로만 팝업 페이지를 가리키는 단추가 없었다. 단추를 더하고(`n_go_c`) 다시 돌린 판이 위 줄이다. K5 의 첫 판은 chai 가 iframe 요소 목록을 찍다 던진 `TypeError` 였다 — 단언을 수로 바꾼 뒤의 판이 위 줄이다(«지침» 2). P6 · P7 의 실패 값 «Unable to find role=link and name …» 은 접근 이름이 재려던 값이라 값으로 센다. B7 은 둘째 케이스가 `TypeError` 로 함께 죽었고 첫째가 값으로 죽었다.

## 지침

1. **무엇이 비었나:** vitest json 보고서의 `failureMessages` 첫 줄이 `Error: STACK_TRACE_ERROR` 이면 그 케이스는 값이 아니라 시간 한도로 죽었다(이 차수에 붐빌 때 `check.test.ts` 넷 · 무작위 판 둘 · 변조 G2 가 그랬다) — 지침은 «실패 값을 본다» 만 말하고 이 꼴을 안 짚어, 변조 표에 «죽음» 으로 옮기기 쉽다.
   **어디:** `.ruler/30-delegation.md` 「워커에게 맡길 때 — wirebound」 의 «전체가 죽는다는 이 케이스가 죽는다가 아니다» 문단 끝.
   **넣을 문장:** «vitest json 의 `failureMessages` 가 `Error: STACK_TRACE_ERROR` 로 시작하면 시간 한도로 죽은 것이다 — 구분력이 아니다. 붐비지 않을 때 그 변조만 다시 돌리거나 그 케이스에 한도를 준 뒤 센다.»
2. **무엇이 비었나:** jsdom 케이스가 iframe 문서의 요소 목록을 `toHaveLength` 로 견주다 실패하면 chai 가 다른 realm 의 요소를 글로 찍다 `TypeError: Cannot read properties of undefined (reading 'name')`(`inspectClass`)를 던진다 — 실패 값이 사라져 «값이 아니라 TypeError 로 죽었다» 로 읽힌다(변조 K5).
   **어디:** `.ruler/20-verification.md` 「목 · 계측은 불린 수를 값으로 확인하고 …」 문단의 jsdom 줄 곁.
   **넣을 문장:** «캔버스 iframe 문서의 요소(다른 realm)를 `toHaveLength` · `toEqual` 로 견주지 않는다 — 실패하면 chai 가 그 요소를 찍다 `TypeError`(`inspectClass`)를 던져 실패 값이 사라진다. 수 · 글로 바꿔 견준다(`expect(list.length).toBe(0)`).»
