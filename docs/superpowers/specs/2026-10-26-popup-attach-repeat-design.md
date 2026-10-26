# 팝업 페이지 · 파일첨부 · 반복 행 입력 표 — 설계

로드맵 `docs/superpowers/plans/2026-10-22-skala-roadmap.md` 의 «모자란 것» 5 · 6 · 7 · «정한 것» A · B · C · «단계» 6 이다. 설계서의 팝업(제목줄 ✖ · 안의 스크롤 · 검색폼 · 선택 그리드 · 바닥 단추), 파일첨부 위젯(단추 셋 · 파일 목록 · 드롭 안내 · 한도 문구), 반복 행 입력 표(`[추가]` · 행마다 입력 · `[삭제]` · 합계)를 그리는 길을 정한다.

이 문서는 발행 시점의 기록(spec)이다. 구현이 병합되면 정본 설계서(`docs/superpowers/specs/2026-08-03-wirebound-design.md`)의 「페이지 스키마 노드」(뿌리 타입) · 「컴포넌트 카탈로그」(표 · 정의 구조의 프리셋) · 「노드 속성」(테마 뷰 계약 · 표지) · 「상호작용」 「모델」(액션 종류 수 · `closeModal`) · 「실행」(팝업이 뜨는 모양) · 「설계서 화면 구조」(메뉴 트리 · 페이지 정보 탭) · 「HTML 정적 번들」 · 「lint 규칙」 · 「`/llms.txt`」 가 지금 참인 것을 갖는다. 이 설계는 정본을 고치지 않는다 — 구현 차수가 고친다.

2단계 구역 모델(`docs/superpowers/specs/2026-10-23-node-slots-design.md`) · 3단계 조합 입력(`2026-10-24-compose-input-design.md`) · 4단계 폼 표(`2026-10-25-form-table-design.md`) · 5단계 그리드(`2026-10-25-grid-design.md`)가 병합된 판(main `afaf5687`) 위에 선다.

---

## 이 설계가 고른 것 — 한눈에

| 물음 | 고른 것 | 이유(한 줄) |
| --- | --- | --- |
| 팝업 페이지 모델 | **뿌리 타입 `Popup`** — 페이지의 «종류» 는 문서 뿌리의 타입이다(`Page` = 화면 · `Popup` = 팝업). DB 열을 더하지 않는다 | 렌더러 · 번들 · 캡처 · 되돌리기 · 스냅샷 · 실시간이 문서 하나만 받는다 — 종류가 문서 밖에 살면 그 전부에 따로 날라야 한다 |
| 제목 · 크기 · ✖ · 바닥 단추 | 제목 `title` · 크기 `size`(`small` · `medium` · `large`)는 `Popup` props, ✖ 는 뷰의 조각(`close`), 바닥 단추는 «바닥» 구역의 `Button` 노드 | 정한 것 A — 단추는 노드라 표지 · 상태 보임 · 상호작용이 그대로 붙는다 |
| 메뉴 트리 | 지금처럼 메뉴 밑 페이지 줄 — 줄에 «팝업» 표지(Q6) | 페이지는 늘 메뉴에 속하고(`pages.menu_node_id`) 대상 글자가 메뉴 경로다 |
| 캔버스(편집) · PPTX | **상자만** — 캔버스 왼쪽 위에 제 크기의 상자 | 설계서가 팝업을 그렇게 그린다(덮개 · 뒤 화면 없음) |
| 뷰 모드 · HTML 번들의 `openModal` | **연 화면 위에 덮개 + 가운데 상자**(Q3) — 몸통이 길면 상자 안에서 굴린다 · ✖ · Escape · «팝업 닫기» 규칙이 닫는다 | «누르면 팝업이 뜬다» 를 시연한다 — 지금은 에디터는 알리기만, 번들은 그 페이지로 옮긴다 |
| 닫기 | **새 액션 `closeModal`**(대상 없음 — 맨 위 팝업을 닫는다). 액션은 6종이 된다 | ✖ 밖의 바닥 «취소» · «닫기» 를 시연할 길이 없다 |
| 마이그레이션 | **`0033` 이 `openModal` 이 가리키는 페이지를 `Popup` 으로 옮긴다**(Q2) — 페이지 · 스냅샷 payload 의 페이지 | 지금 `openModal` 의 대상은 뜻으로 팝업이다 |
| 파일첨부 | **꼴만 그리는 컴포넌트 `FileAttach`**(Q1) — 파일 목록은 prop 배열(이름 · 크기), 단추 셋은 «단추» 구역의 `Button`, 안내 · 한도는 props | 설계서의 파일 목록은 표본 값이다. 실제 보관은 그림 저장소(이미지 꼴만 받음)를 다른 꼴로 넓히는 일이다 |
| 단순 파일 선택 줄 `[파일선택][선택된 파일 없음][…]` | **지금 조각**(`Button` · 읽기 전용 `Input`) | `0029` 가 옛 `file` 입력을 이미 그 꼴로 옮긴다 |
| 반복 행 입력 표 | **같은 `DataGrid` 노드** + 팔레트 카드 «반복 행 표»(프리셋 — 같은 타입의 다른 첫 내용)(Q5) | 5단계 설계 「뒤 단계를 막지 않는다」 가 같은 노드로 적었다 — 새로 그릴 것은 없고 걸음 수만 줄인다 |
| 좁은 창 · 넓은 상자 | 상자 폭은 `min(크기, 창 − 여백)` · 화면 모드(PPTX)는 제 크기 그대로. **팝업 크기가 폼 표 · 검색폼의 접기 문턱 노릇을 한다**(작은 · 보통 팝업 안은 한 줄에 쌍 하나) | 테마의 접기는 창 폭(`@media`)을 보고 상자 폭을 모른다 |
| 판 | SDK · 기본테마 1.8.0 · 문서 판 5 그대로 | 새 타입만 더한다 — 옛 문서는 그대로 뜻이 같다 |
| 나누기 | **두 트랙 — PO-A(팝업 · `0033`) · PO-B(파일첨부 · 반복 행 표)**, 나란히 돌리고 B 를 A 위로 옮겨 병합 | 셋 중 팝업만 크다. 겹치는 파일은 목록 끝에 한 줄씩 더하는 자리다 |

---

## 지금 모델이 기대는 곳

워크트리 뿌리에서 잰 것이다. 다시 재는 법은 끝 절.

| 자리 | 지금 |
| --- | --- |
| 페이지 행(`apps/api/src/repos/pages.ts` 의 `PageRecord`) | `id` · `menu_node_id`(늘 있다 — 페이지는 메뉴에 속한다) · `title` · `description` · `sort_order` · `schema` · `head_seq`. «종류» 칸이 없다 |
| 새 페이지 문서(`routes/pages.ts` 의 `POST /:projectId/pages` · `services/page-import.ts`) | `{ version, root: { id, type: 'Page', children: [] } }` |
| 뿌리 판정(`packages/schema/src/validate.ts`) | 뿌리 타입은 `Page` 여야 하고 `Page` 는 뿌리에만 선다. `Page` 를 글자로 짓거나 견주는 소스 자리 20 줄(레이아웃 기본 문서 · 클립보드 감싸개 · 팔레트 탐침 · 축소판 · 갤러리 · 픽스처) |
| 웹의 뿌리 가드 | 타입이 아니라 **뿌리 id** 로 가른다(`palette-add.ts` 의 `paletteAddTarget` · `structure-drop.ts` · `paste-ops.ts` · `structure-tree.tsx`) — 뿌리 타입이 바뀌어도 그대로 선다 |
| `Page` 정의(`catalog/structure.ts` 의 `PageDef`) | props 없음(`strictObject({})`) · 구역 `body` 하나 |
| 레이아웃 | 저장만 된다 — 캔버스 · 번들은 페이지 문서만 그린다(`repos/layouts.ts` 의 `defaultLayoutDocument` 머리말) |
| 액션(`packages/schema/src/envelope.ts` 의 `InteractionActionSchema`) | **고정 5종** — `setProp` · `setVisible` · `switchTab` · `navigate` · `openModal`(정본 「상호작용」 「모델」 «5종으로 고정한다»). 액션 종류를 가르는 소스 파일 12(`switchTab` 을 부르는 파일 수) · `openModal` 을 부르는 소스 21 · 케이스 11 |
| `openModal` 의 대상 | `"page:<메뉴 경로>/<페이지 제목>"` 글자. 상호작용 탭은 **자유 입력**(`interaction-panel.tsx` — «페이지 경로» 칸 · 고르개 없음). 글자 → 페이지 짝은 `@wirebound/schema` 의 `targetedPages` · `matchPageTargets` 가 짓고 웹에는 `edit/paste-ops.ts` 의 `pageTargetsOf(menu)` 가 있다 |
| 에디터 뷰 모드의 `openModal` | **실행하지 않고 알린다** — `canvas/canvas.tsx` 의 `noticesOf` 가 «… 모달 열기 규칙입니다. 이 화면에서는 모달을 열지 않습니다.» 를 낸다(`apps/web/test/canvas/interaction-runtime.test.tsx` «navigate·openModal은 알리고 움직이지 않는다» 2 케이스 — 실행해 통과 2) |
| HTML 번들의 `openModal` | **`navigate` 와 같은 길** — `exporter/src/browser/mount.tsx` 의 `onEvent` 가 요청 타입을 가르지 않고 `hrefs[target]` 로 그 페이지 파일에 옮긴다. 케이스(`packages/exporter/test/runtime-bundle.test.ts`)는 `navigate` 만 잰다 |
| PPTX | 페이지마다 슬라이드 한 장(`exporter/src/pptx/index.ts` 의 `exportPptx`) · 화면은 번들 페이지를 화면 모드(`#wb-screen`)로 찍는다 · 창 720 × 552 · 문서 전체를 잰 크기로(`apps/api/src/services/screen-render-chromium.ts` 의 `VIEWPORT`) |
| 문장(`interaction/describe.ts` 의 `describeAction`) | `openModal` → «{페이지} 페이지가 모달로 열립니다» |
| 메뉴 트리 응답(`repos/pages.ts` 의 `listPageRows` → `services/menu-tree.ts` 의 `TreePage`) | `id` · `title` · `sortOrder` · `viewStates`(`schema -> 'viewStates'` 로 문서에서 읽는다) |
| 메뉴 줄 `+`(`panels/tree-row-actions.tsx`) | «페이지 추가» · «JSON 에서 가져오기…». «팝업 페이지 추가» 는 없다 |
| 페이지 정보 탭(`panels/page-info.tsx`) | 이름 · 설명(`PageMeta`) · 상태(`PageStates`). «종류» 칸은 없다 |
| 파일 위젯 | 없다. 옛 `Field` 의 `file` 입력은 `0029` 가 읽기 전용 `Input`(«선택된 파일 없음») + `Button «파일 선택»` 으로 옮겼다(정본 「페이지 스키마 노드」 «문서 판 5») |
| 그림 저장소(3단계 CI-B · 정본 「그림」) | PNG · JPEG · WebP · GIF · SVG 만 받는다 · 파일 5 MB · 프로젝트 200 MB · 사람 100 MB · 프로젝트 멤버만 읽기 · 번들 `assets/images/` |
| 목록 편집 위젯(`panels/controls/list-control.tsx`) | `stringList` · `pairList`(`{ key, value }`) · `optionList`(`{ label, selected }`) — 배열을 통째로 `replace` |
| `DataGrid`(5단계) | 열 노드(머리 칸 + 셀 틀) · 행 노드(`repeat` · `kind` `total`) · 제 칸 · «머리 오른쪽» 구역 · «바닥» 기본 `Pagination` · 셀 틀 입력 조각의 접근 이름은 열 머리 이름 + « (n행)» |
| 팔레트 · 새 노드(`edit/create-node.ts` 의 `createNode`) | 카드는 카탈로그 타입마다 하나 · 첫 내용은 구역의 `initial`(타입 · props · 변형만 — 상호작용 · 자식 내용은 못 싣는다). 같은 타입의 다른 꼴(프리셋)은 없다 |
| 기본테마(`system-themes/admin`) | 뷰 없음(`src/views/index.ts` 의 `VIEWS` 가 빈 표) — SDK 기본 뷰에 CSS 만 얹는다. 접기는 `@media (max-width: 960px)` · `(max-width: 640px)` 두 문턱 — `@container` · `container-type` 은 저장소(문서 밖) 어디에도 없다 |
| `wb-theme check`(`packages/theme-kit/src/check.ts`) | 구역 그리기(`missingZones`) · 폼 표 쌍 격자(`pairGridProblems`) · 그리드 셈(`dataGridProblems`) · 포커스 받는 요소 · 뷰 키 · 안 쓴 토큰 |
| 판 | 문서 `CURRENT_DOCUMENT_VERSION` 5 · SDK `SDK_VERSION` 1.7.0 · 기본테마 1.7.0 · 마지막 마이그레이션 `0032-list-data-grid` |
| 개수 하한 | `apps/web/build-test/palette.test.ts` 카드 ≥ 17 · `packages/theme-kit/build-test/dev.test.ts` 의 `kinds` 35(카탈로그 타입 수) · `shots.test.ts` 폴백 0 |
| MCP · CLI | MCP 도구 `add_comment` · `get_page` · `list_pages` · `patch_page` · `validate` · CLI `export` · `init` · `lint` · `login` · `page get` · `pull` — 페이지를 만드는 도구는 없다 |

---

## 설계서가 요구하는 꼴

분석 파일(그룹 A ~ D — 저장소 밖)의 팝업 · 파일첨부 · 반복 행 절을 꼴로 일반화한 것이다. 쪽은 «그룹 문서 쪽».

| 꼴 | 어디서 | 얼마나 |
| --- | --- | --- |
| **팝업은 캔버스 왼쪽 위의 상자만** — 회색 제목줄(제목 왼쪽 · ✖ 오른쪽) + 흰 몸통. 덮개 · 뒤 화면은 안 그린다 | C 머리말 «팝업 표기» · A p13 · B 기수 p-05 · D 교강사 p5 | 모든 팝업 |
| 몸통 오른쪽 세로 스크롤바(«세로 영역 길어질 경우 스크롤 생성») | A p13 · p14 · p23 · B 교육일정 p-5 · C 교육 p-4 ~ 6 | 절반쯤 |
| 화면ID 를 따로 갖는 화면 — 화면명 «… 팝업» | 모든 문서의 화면 목록 | 120쪽에 스물 남짓 |
| 검색 팝업 — 머리줄 없는 검색폼 + `[초기화][검색]` → 구역 제목 → 라디오(드물게 체크) 선택 그리드 → 페이지네이션. 고르면 닫히고 부모 칸이 찬다(OD) | B 기수 p-05 · C 교육 p-4 · p-5 · D 교강사 p5 · 캠퍼스 p4 · 과목 p4 | 가장 흔함 |
| 담기 팝업 — 그리드 → 가운데 `[+ 선택추가]` → 둘째 그리드(행마다 `[- 제거]`) → `[취소][저장]` | C 교육 p-6 | 한 곳 |
| 일괄등록 팝업 — 정보표 → `[파일선택][선택된 파일 없음][데이터 정합성 체크]` → 번호 안내문 → 결과 그리드(가로 스크롤) → `[일괄등록]` | A p14 · B 교육일정 p-7 · 분반 p-8 | 셋 |
| 폼 팝업 — 정보표 · 폼 표 · `[취소][저장]` | A p26 · C 출결 p-3 · 훈련 p-6 · 교육 p-9 | 여럿 |
| 팝업 크기가 다르다(«다른 팝업보다 넓음») | B 분반 p-9 | 가끔 |
| 한 팝업의 두 상태(입력 전 → 후)를 화살표로 이어 그림 | A p13 · B 분반 p-3 · C 공가 p-2/3 | 셋 — 도구의 화면 상태로 그린다 |
| **파일첨부** — 테두리 상자: 오른쪽 위 `[파일추가][항목 제거][전체 항목 제거]` → 목록 머리 `□ \| 파일이름 \| 파일크기` → 빈 상태 «이곳을 더블클릭 또는 파일을 드래그 하세요»(두 낱말 파랑) → 바닥 «최대 N개 M MB 제한»(수 빨강). 채운 상태는 `□ \| 이름.PDF \| 2.1 MB` 행 | A p3 · p34 · B 기수 p-07 · C 교육 p-2 · 훈련 p-3 · p-4 · D 교강사 p3 · 캠퍼스 · 과목 · 강의실 | 등록 화면마다 · 한 화면에 아홉(폼 표 값 칸 안) |
| **반복 행 입력 표** — 값 칸 오른쪽 위 `[추가]` → 회색 머리 → 행마다 입력 · 날짜~날짜 · 셀렉트 · 글 + 끝 `[삭제]` → (가끔) 합계 행 | B 기수 p-02 · p-08 · C 교육 p-2 · 훈련 p-2 · D 교강사 p2 · 캠퍼스 p2 · p3 | 등록 화면의 하위 표 열 남짓 |
| 팝업으로 채우는 하위 표 — `[사용자 검색]` + 읽기 전용 행 + 빈 안내 행 | D 캠퍼스 p2 · p3 | 한 곳 — 그리드 + 머리 단추의 `openModal` |

**안 나온 것:** 팝업 안에서 다른 팝업을 여는 꼴 · 덮개 위에 뜬 모양 · 실제로 올린 파일을 내려받는 꼴(파일 행은 늘 이름 · 크기 표본이다).

---

## 1. 팝업 페이지 모델

### 후보

- **(가) 페이지 행에 «종류» 열** — `pages.kind`(`screen` · `popup`) · 크기 · 제목도 행에. 문서 뿌리는 `Page` 그대로.
- **(나) `Page` 의 prop** — `Page.props.kind` · `size` · `title`, 구역에 «바닥» 을 더한다. 뷰가 종류로 갈린다.
- **(다) 뿌리 타입 `Popup`** — 팝업 페이지의 문서 뿌리가 `Popup` 이다. 종류는 뿌리 타입에서 읽는다. `Popup` 은 뿌리에만 선다.
- **(라) 보통 컴포넌트 `Popup`** — 어느 페이지 몸통에나 놓는 상자. 종류는 따로(가 · 나) 둔다.

### 견줌

| | (가) 행의 열 | (나) `Page` prop | **(다) 뿌리 타입** | (라) 보통 컴포넌트 |
| --- | --- | --- | --- | --- |
| 렌더러 · 번들 · 캡처가 종류를 아는 길 | 문서 밖이라 소비자마다 따로 날라야 한다(캔버스 · 번들 페이지 데이터 · 캡처 · 갤러리) | 문서 안 | 문서 안 | 문서 안 |
| 되돌리기 · 스냅샷 · 실시간 | 행 쓰기라 안 탄다 — 따로 짓는다 | 탄다 | 탄다 | 탄다 |
| 테마 뷰 계약 | 상자를 누가 그리나가 비어 있다(셸이 그리면 테마가 못 바꾼다) | `Page` 뷰 하나가 화면 · 상자 둘을 그린다 — `check` 가 두 꼴을 한 뷰에서 갈라 재야 한다 | `Popup` 뷰가 따로 — 조각 · 접근성 · `check` 규칙이 그 뷰에만 붙는다 | 따로 |
| 구조 트리 | 그대로 | 모든 페이지에 «바닥» 구역 줄이 선다(화면 페이지에도) | 팝업 페이지에만 «몸통» · «바닥» 구역 줄 | 몸통 안 한 층이 더 깊다 |
| 바꿀 자리 | 행 · API · 트리 응답 · 번들 데이터 · 캡처 | `Page` 정의 · 뷰 · 기본 CSS | 뿌리 판정(`validate.ts`) · 새 정의 · 새 뷰 — 웹의 뿌리 가드는 id 로 가른다(«지금») | 새 정의 + 종류 장치(가 · 나 중 하나) — 두 벌 |
| 설계서와 | 맞다 | 맞다 | 맞다 — 팝업은 «화면ID 를 갖는 화면» | 팝업 안이 «페이지 안의 상자» 가 되어, «팝업 = 페이지» 와 «팝업 = 상자» 가 둘 다 선다 |

### 고른 것 — (다)

**팝업 페이지는 뿌리가 `Popup` 인 페이지다.** 페이지의 «종류» 는 문서 뿌리 타입이다 — `Page` 면 화면, `Popup` 이면 팝업. DB 에 열을 더하지 않는다.

- (가)를 버린 까닭: 종류는 그리는 모양을 바꾸는 값이다. 그리는 쪽(렌더러 · 내보내기 · 캡처)이 모두 문서 하나만 받는데, 종류가 행에 살면 그 전부에 새 통로를 내야 하고 되돌리기 · 스냅샷 · 실시간에서 빠진다.
- (나)를 버린 까닭: 한 뷰가 두 꼴을 그리면 테마 계약(`check` · `shots`)이 «종류마다» 를 따로 재야 하고, 화면 페이지에도 «바닥» 구역이 선다.
- (라)를 버린 까닭: 정한 것 B(팝업은 페이지 종류)와 «상자» 가 두 벌이 된다. 설계서는 화면 안에 팝업을 그리지 않는다(«안 나온 것»).

### 타입

| 타입 | 이름(`label`) | 설 자리 | 뿌리 요소 | props | 몸통 · 구역 |
| --- | --- | --- | --- | --- | --- |
| `Popup` | 팝업 | **뿌리에만**(`Page` 와 같은 규칙 — `validate.ts` 의 뿌리 판정이 `Page` · `Popup` 둘을 받는다. 레이아웃 뿌리는 `Page` 그대로) | `section` | `title`(기본 «팝업» — «팝업 페이지 추가» 가 페이지 이름으로 채운다) · `size`(`small` · `medium` · `large` · 기본 `medium`) | 몸통 «내용»(무엇이든) · `footer` «바닥»(무엇이든 · 기본 `[취소][저장]` — Q4) |

```ts
// packages/schema/src/component/catalog/structure.ts — 꼴만
export const PopupDef = defineComponent({
  type: 'Popup',
  label: '팝업',
  description: '팝업 페이지의 뿌리. 제목줄 · 닫기 · 몸통 · 바닥 단추를 가진 상자.',
  group: 'structure',
  props: z.strictObject({
    title: z.string().default('팝업'),
    size: z.enum(['small', 'medium', 'large']).default('medium'),
  }),
  editor: [
    { prop: 'title', control: 'text', label: '제목' },
    { prop: 'size', control: 'select', label: '크기', options: ['small', 'medium', 'large'] },
  ],
  summary: (props) => oneLine(props.title),
  states: [],
  zones: [
    { name: 'body', label: '내용' },
    {
      name: 'footer',
      label: '바닥',
      initial: [
        { type: 'Button', props: { label: '취소' }, interactions: [{ on: 'click', actions: [{ type: 'closeModal' }] }] },
        { type: 'Button', props: { label: '저장' }, variant: 'primary' },
      ],
    },
  ],
})
```

- **제목은 페이지 이름과 따로다** — 설계서의 화면명(«등록 - 사용자 검색 팝업»)과 팝업 제목줄(«사용자 검색»)이 다르다. «팝업 페이지 추가» 가 처음 한 번 페이지 이름으로 채우고, 뒤에 페이지 이름을 바꿔도 제목은 그대로다.
- **크기는 enum 이다** — 길이는 테마가 정한다(SDK 기본 CSS 도 길이를 준다 — 5단계 이월 «SDK 기본 CSS 에는 열 폭의 길이가 없다» 를 되풀이하지 않는다): `small` 480px · `medium` 720px · `large` 960px. enum 이라 SDK 표지(`data-wb-size` 꼴 — `marks.ts`)다.
- **✖ 는 노드가 아니다** — 뷰의 조각(`data-wb-part="close"`, `<button>`)이다. 설계서 OD 가 ✖ 에 표지를 다는 일이 없다. 7단계가 ✖ 에 표지를 달아야 하면 4단계 «조각 기준 표지» 자리로 단다(«10»).
- **바닥의 첫 `initial` 에 상호작용을 싣는다** — `[취소]` 가 처음부터 «팝업 닫기» 를 든다. 지금 `initial` 은 타입 · props · 변형만 싣는다 — `interactions` 를 더한다(`createNode` 가 노드에 그대로 싣는다 · 카탈로그 검사 `assertZoneReferences` 가 액션 꼴을 본다).
- **화면 상태 · 상태 보임 · 표지는 화면 페이지와 같다** — 페이지 문서의 `viewStates` 는 뿌리 타입과 무관하다. 뿌리에는 상태 보임을 못 둔다(`bad-root`)는 규칙도 같다.

### 메뉴 트리 · 페이지 정보 · 화면ID

- **팝업 페이지는 지금처럼 메뉴 밑 페이지 줄이다**(Q6). 줄 이름 앞에 «팝업» 표지(아이콘 + 접근 이름 « — 팝업»)를 단다. 트리 응답의 `TreePage` 에 `kind`(`page` · `popup`)를 더한다 — `listPageRows` 가 `schema -> 'viewStates'` 를 읽는 자리에서 `schema -> 'root' ->> 'type'` 을 함께 읽는다(문서 전체를 고르지 않는다).
- **열린 페이지의 표지는 문서에서, 닫힌 페이지의 표지는 트리 응답에서 읽는다** — 상태 줄(`panels/state-rows.tsx`)이 `viewStates` 를 읽는 길과 같다. 남이 닫힌 페이지의 종류를 바꾸면 다음 트리 조회까지 표지가 옛 값이다 — 상태 줄과 같은 대가다(종류 바꾸기는 드물다).
- **페이지 정보 탭에 «종류» 줄** — `[화면] [팝업]` 단추 꼴 라디오. 바꾸면 뿌리를 갈아 끼우는 편집 묶음 하나(«8»).
- **화면ID(7단계)** — 화면 정보는 페이지의 것이다(로드맵 R4 «화면 정보(11)도 뒤에 이 탭에 둔다»). 팝업도 페이지라 같은 자리에 붙는다 — 막지 않는다.

---

## 2. 팝업을 여는 길과 보이는 모양

### 자리마다

| 자리 | 팝업 페이지를 열면 | 다른 페이지가 `openModal` 로 열면 |
| --- | --- | --- |
| 에디터 캔버스(편집) | 캔버스 왼쪽 위에 제 크기의 상자(덮개 없음). 캔버스가 상자보다 좁으면 상자가 캔버스 폭으로 준다 | 상호작용은 돌지 않는다(정본 「실행」) |
| 에디터 뷰 모드 | 위와 같은 상자. ✖ · «팝업 닫기» 를 누르면 «열린 팝업이 없습니다 — 이 팝업 페이지를 바로 열었습니다» 한 줄 | **연 화면 위에 덮개 + 가운데 상자**(Q3). 대상 글자를 트리로 풀어(`pageTargetsOf` · `matchPageTargets`) 그 페이지 문서를 읽어 와 같은 렌더러 · 같은 테마로 그린다 |
| HTML 번들 | 그 페이지 파일 — 상자만(캔버스와 같다). 목차의 줄에 «팝업» 표지 | **덮개 + 가운데 상자** — 여는 페이지의 데이터에 팝업 문서가 실려 있다(아래). 페이지를 옮기지 않는다 |
| PPTX | 슬라이드 한 장 — 화면 그림은 상자만, 제 크기 그대로(창보다 넓으면 넓은 그림 — 5단계 Q2 «펼쳐 찍기» 와 같은 길) | 슬라이드 사이 이동이 없다 — 노트의 상호작용 문장이 말한다 |

**덮개 위 상자의 규칙**(뷰 모드 · 번들 공통 — 한 곳에서 짓는다):

- 덮개는 연 화면 전체를 덮고 누름을 막는다. 덮개 누름으로는 닫지 않는다(앱의 대화 상자와 같다 — 정본 「설계서 화면 구조」 «대화 상자»).
- 상자는 가운데, 폭 `min(크기, 창 − 2 × 여백)`, 높이는 창 − 2 × 여백까지 — 넘치면 **몸통 조각만** 굴린다(제목줄 · 바닥은 그대로 보인다). 설계서의 «세로 영역 길어질 경우 스크롤 생성» 이다.
- `role="dialog"` · `aria-modal="true"` · 제목으로 이름. 포커스를 안에 가두고 닫히면 연 요소로 돌려준다. Escape · ✖ · `closeModal` 이 맨 위 상자를 닫는다.
- 팝업 안의 상호작용은 팝업 문서의 겹layer 에서 돈다(정본 「실행」의 «문서를 바꾸지 않는다») — 닫으면 그 겹layer 가 사라진다. 다시 열면 처음 판이다.
- 팝업 안에서 다시 `openModal` 하면 위에 쌓는다(설계서에 없는 꼴이지만 막을 까닭이 없다). 깊이는 5 까지 — 서로를 여는 둘이 끝없이 쌓이지 않게. 넘으면 «팝업은 다섯 겹까지 엽니다» 한 줄.
- 팝업 안 `navigate` 는 지금처럼(에디터는 알리고 · 번들은 옮긴다).
- 덮개 위 상자에는 팝업 페이지의 코멘트 번호를 세우지 않는다 — 번호는 그 페이지를 바로 연 판에 선다.
- 대상을 못 풀면(없는 페이지 · 둘 이상) 지금 문장 그대로 한 줄(`mount.tsx` 의 `missingPage` · `ambiguousPage` 와 같은 문장 — 에디터도 그 문장을 쓴다).
- 대상이 **팝업 페이지가 아니면** 지금 동작 그대로다(에디터는 알리고 · 번들은 옮긴다) — lint 가 경고한다(«9»). 화면 페이지를 상자에 우겨 넣으면 그 페이지의 폭 가정(좁은 창 접기)이 깨진다.

**에디터 뷰 모드의 조회** — 열 때마다 그 페이지를 읽는다(`GET …/pages/:id` — viewer 이상이 읽는다). 연 동안 남이 그 팝업을 고쳐도 상자는 그대로이고, 닫았다 열면 새 판이다. 읽기가 실패하면 «팝업을 불러오지 못했습니다» 한 줄.

**번들의 팝업 문서** — 여는 페이지의 데이터(`ExportPageData`)에 그 페이지에서 닿는 팝업 문서(대상 → 문서 · 제목 · 그림 주소 표)를 싣는다. 팝업이 연 팝업까지(닫힌 셈 · 겹치지 않게 한 벌씩). 번들은 `file://` 로도 열려 `fetch` 로 다른 파일을 못 읽는다(정본 「HTML 정적 번들」 «모든 스크립트가 일반 스크립트») — 싣거나 `<script>` 파일로 내야 한다. **싣는다** — 팝업은 작고(검색폼 + 그리드 하나), 페이지마다 따로 서는 번들 꼴을 지킨다. 무게는 «9» 의 판으로 잰다.

### `closeModal`

```jsonc
{ "type": "closeModal" }   // 대상이 없다 — 맨 위 팝업을 닫는다
```

- **액션은 6종이 된다** — 정본 「상호작용」 「모델」의 «5종으로 고정한다» 를 «6종» 으로 고친다. 고정 목록 · 스크립트 없음 · 정적 검증 · 문장화의 뜻은 그대로다.
- 판정(`interaction/check.ts`) — 대상이 없어 늘 맞다. 문장(`describe.ts`) — «팝업이 닫힙니다». `openModal` 문장은 «{페이지} 페이지가 팝업으로 열립니다» 로 바꾼다(«9» — 옛 문안 단언을 센다).
- 런타임(`renderer/src/interaction/runtime.ts`) — `InteractionRequest.type` 에 `closeModal` 을 더한다(`target` 없음). 실행하지 않고 알리는 것은 `navigate` · `openModal` 과 같고, 받는 쪽(덮개 층)이 맨 위를 닫는다. 받는 쪽이 없으면(편집 캔버스 · 팝업 페이지를 바로 연 판) 위의 한 줄.
- 상호작용 탭 — 액션 고르개에 «팝업 닫기». 대상 칸이 없다.

### 덮개 층은 렌더러에 산다

에디터 뷰 모드와 번들이 같은 모양 · 같은 키 처리 · 같은 겹 쌓기를 가져야 한다 — 정본 「상호작용」 「실행」이 런타임을 `renderer` 에 둔 까닭(«렌더러가 하나뿐이라 결과가 어긋날 수 없다»)과 같다. **`renderer` 에 `PopupLayer`(열린 팝업 문서 목록 · 닫기 · 연 요소)를 두고** 캔버스(`canvas.tsx`)와 번들(`mount.tsx`)이 그것을 그린다. 문서를 어디서 얻는지(에디터는 API · 번들은 페이지 데이터)만 둘이 다르다. 덮개 · 가운데 놓기 · 굴림 상한은 테마 밖 셸 CSS(SDK 기본 CSS 의 `[data-wb-popup-layer]` 규칙)가, 상자 안은 `Popup` 뷰가 그린다.

---

## 3. 마이그레이션 `0033-modal-popup`(Q2)

**`openModal` 이 가리키는 페이지를 `Popup` 뿌리로 옮긴다.** 문서 판은 올리지 않는다(5 그대로) — 새 타입을 쓸 뿐 옛 문서의 뜻은 같고, 판 단계(`migrate-document.ts`)로는 할 수 없다(어느 페이지가 대상인지는 프로젝트 전체를 봐야 안다).

| 자리 | 옮기나 |
| --- | --- |
| `pages.schema` | 그 프로젝트 모든 문서의 `openModal` 대상 글자를 모아, 그 프로젝트 트리로 푼 페이지 가운데 하나로 풀리는 것만 옮긴다 |
| `snapshots.payload` 의 `pages[]` | 같은 셈을 payload 안의 메뉴 · 페이지로 — 복원하면 팝업으로 되살아난다 |
| `layouts.schema` · payload 의 `layouts[]` | 안 옮긴다 — 레이아웃 뿌리는 늘 `Page` 다 |
| `modules.nodes` · `personal_modules.nodes` | 안 옮긴다 — 뿌리 없는 노드 묶음이다(뿌리는 모듈에 안 든다) |
| `revisions` | 안 옮긴다 — 뿌리의 `type` · `props` 만 바뀌고 몸통 좌표(`/root/children/…`)는 그대로라 옛 편집의 되돌리기가 그대로 맞는다 |

- 옮기기: `root.type = 'Popup'` · `root.props = { title: <페이지 제목> }`. 몸통은 그대로(`Popup` 도 몸통이 `children`). «바닥» 구역은 안 만든다 — 지금 내용이 이미 단추를 들고 있을 수 있다(바닥 단추를 몸통 끝에 둔 판).
- **`head_seq` · `structure_seq` 를 안 올린다** — 좌표가 안 바뀐다(`0032` 머리말의 «판 번호만 오른 문서는 좌표가 그대로라 안 올린다» 와 같은 판단). 옮기기 전에 연 탭은 뿌리를 `Page` 로 그리다 새로고침에 팝업으로 그린다.
- **풀이는 마이그레이션 안에 얼린다** — 대상 글자 조립(`targetedPages` 의 메뉴 경로 · 같은 이름 가르기)을 그 판의 사본으로 둔다. 뒤에 `page-target.ts` 가 바뀌어도 이 마이그레이션의 뜻은 그대로다(`0028` ~ `0032` 가 «이 파일은 판 … 의 뜻으로 얼어 있다» 로 지킨 것과 같다).
- 둘 이상으로 풀리는 대상(같은 경로의 페이지 둘)은 안 옮긴다 — lint 의 «대상이 팝업이 아님» 이 그 자리를 말한다. 빈 대상 · 못 푸는 대상도 그렇다.
- `navigate` 의 대상이기도 한 페이지도 옮긴다 — lint «팝업으로 이동» 이 말한다(«9»).
- **`down`** — `Popup` 뿌리를 `Page` 로: `props` 를 걷고 «바닥» 구역의 노드를 몸통 끝에 차례로 붙인다(지우지 않는다). 새로 만든 팝업 페이지도 내려간다(배포된 서비스가 없어 받는다).
- 사용자 개발 DB 에 그런 페이지가 몇인지는 이 설계가 안 쟀다(그 DB 는 워커가 안 읽는다). 병합 전 덤프 뒤 적용 · 옮긴 페이지 수를 마이그레이션이 로그로 낸다.

Q2 를 (나)로 고르면 `0033` 은 없다 — 사람이 페이지 정보 탭 «종류» 로 바꾸고, lint 가 «대상이 팝업이 아님» 을 말한다.

---

## 4. 파일첨부 위젯

### 꼴만인가, 실제 보관인가(Q1)

| | **(가) 꼴만** | (나) 실제 파일 보관 |
| --- | --- | --- |
| 파일 행 | 사람이 적는 표본 값(이름 · 크기) | 올린 파일의 이름 · 크기 |
| 서버 | 없음 | 그림 저장소(`asset_blobs`)를 다른 꼴(PDF · 엑셀 · 한글 · zip …)로 넓힌다 · 받는 꼴 판정 · 크기 한도 · 바이러스 걱정 · 내려받기 라우트 · 번들에 파일째 싣기 · PPTX 에는 못 실음 |
| 설계서와 | 맞다 — 설계서의 파일 행은 늘 표본(«이름.PDF \| 2.1 MB»)이다 | 설계서에 없는 일(파일을 열어 보는 것) |
| 크기 | S ~ M | L(3단계 CI-B 만큼) |

**(가)를 고른다** — 이 도구는 화면 설계서를 그린다. 파일첨부는 «이 칸에 파일을 붙인다» 는 꼴이고, 칸 안의 파일은 표본이다.

### 파일 행은 무엇인가

| | 자식 노드(`FileAttachItem`) | 안에 `DataGrid` | **prop 배열** |
| --- | --- | --- | --- |
| 행 하나 더하기 | 팔레트 · 복제 1 + 이름 · 크기 2 | 행 «되풀이» 또는 «한 행 떼어 내기» + «열 틀로 칸 짓기» + 칸 둘 | 목록 위젯의 «추가» + 칸 둘 |
| 행마다 표지 · 상호작용 | 된다 | 된다 | 안 된다 |
| 구조 트리 | 행마다 줄 | 열 · 행 줄 | 줄 없음 |
| 정한 것 A(«셀 안 컨트롤 · 조각 · 구역의 내용은 자식 노드») | 맞지만 행은 컨트롤이 아니다 | — | 선택지(`OptionSchema` — «항목은 노드가 아니다 — 표지 · 상호작용을 항목마다 달 수 없다»)와 같은 꼴 |

**prop 배열을 고른다** — 파일 행은 컨트롤이 아니라 표본 값이고, 설계서 OD 가 파일 행에 표지를 단 적이 없다. 선택지와 같은 판단이다. 단추 셋은 컨트롤이라 구역의 노드다(정한 것 A).

### 타입

| 타입 | 이름 | 설 자리 | 뿌리 요소 | props | 구역 |
| --- | --- | --- | --- | --- | --- |
| `FileAttach` | 파일첨부 | 아무 데나(흔히 `Field` 값 칸) | `div role="group"` | `files`(0 ~ 20 · `{ name, size }` · 기본 빈 배열) · `maxFiles`(0 ~ 99 · 기본 1 — 0 이면 개수 글 없음) · `maxSize`(글 0 ~ 20 자 · 기본 «100 MB» — 빈 글이면 크기 글 없음) · `hint`(기본 «이곳을 더블클릭 또는 파일을 드래그 하세요» — 빈 목록 행의 글) · `disabled` | `actions` «단추»(무엇이든 · 기본 `[파일추가][항목 제거][전체 항목 제거]`) |

```ts
// packages/schema/src/component/catalog/input.ts — 꼴만
export const FileEntrySchema = z.strictObject({ name: z.string().min(1).max(200), size: z.string().max(20) })

export const FileAttachDef = defineComponent({
  type: 'FileAttach',
  label: '파일첨부',
  description: '파일을 붙이는 칸. 단추 · 파일 목록 · 빈 목록 안내 · 한도 글.',
  group: 'input',
  props: z.strictObject({
    files: z.array(FileEntrySchema).max(20).default([]),
    maxFiles: z.number().int().min(0).max(99).default(1),
    maxSize: z.string().max(20).default('100 MB'),
    hint: z.string().default('이곳을 더블클릭 또는 파일을 드래그 하세요'),
    disabled: z.boolean().default(false),
  }),
  editor: [
    { prop: 'files', control: 'fileList', label: '파일' },
    { prop: 'maxFiles', control: 'number', label: '최대 개수' },
    { prop: 'maxSize', control: 'text', label: '최대 크기' },
    { prop: 'hint', control: 'text', label: '빈 목록 안내' },
    { prop: 'disabled', control: 'switch', label: '비활성' },
  ],
  summary: (props) => /* «파일 2개 · 최대 3개» */,
  states: ['disabled'],
  zones: [
    {
      name: 'actions',
      label: '단추',
      initial: [
        { type: 'Button', props: { label: '파일추가' } },
        { type: 'Button', props: { label: '항목 제거' } },
        { type: 'Button', props: { label: '전체 항목 제거' } },
      ],
    },
  ],
})
```

- **한도 글은 수에서 짓는다** — 뷰가 «최대 {maxFiles}개 {maxSize} 제한» 을 짓고 두 값을 조각(`limitCount` · `limitSize`)으로 감싼다. 기본테마가 그 조각을 빨간 굵은 글로 그린다 — 설계서의 «수 빨강» 이 따로 장치 없이 선다. 둘 다 비면 한도 줄째 없다.
- **빈 목록 안내의 «더블클릭» · «드래그» 파랑은 이 단계에 없다** — 자유 글 안 낱말 강조는 로드맵 9(글 부분 강조)의 몫이다. 그때 `hint` 에 같은 장치를 쓴다.
- **표는 파일 목록이다** — 머리 `□ | 파일이름 | 파일크기` 는 뷰가 고정 글로 그린다(설계서에서 늘 같다). 행의 체크는 그림이다(고르는 상태를 들지 않는다 — 설계서의 행은 늘 빈 체크).
- **값 칸 안에서 이름을 받는다** — `Field` 값 칸의 `FileAttach` 는 렌더러가 필드 이름(«통장사본»)을 준다(`fieldNames` 를 넓힌다 — 지금 값 조각 일곱만 받는다). 그룹의 접근 이름이 된다. 값 칸 밖이면 «파일첨부».
- **`Field` 의 값 조각(`VALUE_PIECES`)이 아니다** — 조합 입력의 조각은 한 값을 받는 입력이고 이 위젯은 목록 · 단추 · 글을 품은 상자다. 값 칸이 무엇이든 받아(4단계 「뒤 단계를 막지 않는다」) 그대로 선다.
- **목록 편집 위젯 `fileList`** — `list-control.tsx` 에 넷째 꼴(칸 둘 — 이름 · 크기)을 더한다. 배열 통째 교체 · 추가 · 삭제 · 옮기기는 지금 셋과 같다. `pairList`(`{ key, value }`)를 쓰지 않는 까닭: 문서 JSON 이 MCP · `/llms.txt` 로 사람과 에이전트에게 읽히는데 `key` · `value` 는 파일 이름 · 크기로 안 읽힌다.

### 단순 파일 선택 줄

`[파일선택][선택된 파일 없음] [데이터 정합성 체크]`(일괄등록 팝업)는 **지금 조각**이다 — `Button` + 읽기 전용 `Input` + `Button`(값 칸 · `Flex`). `0029` 가 옛 `file` 입력을 이미 그 꼴로 옮긴다. 갤러리 표본 하나로 보인다.

---

## 5. 반복 행 입력 표

**새 노드가 아니다 — `DataGrid` 다.** 5단계 설계 「뒤 단계를 막지 않는다」 가 적은 대로 `[추가]` 는 «머리 오른쪽» 구역의 `Button`, 행마다 입력은 셀 틀의 입력 조각, `[삭제]` 는 «삭제» 열의 셀 틀 `Button`, 합계는 `GridRow { kind: 'total' }` 의 제 칸이다. 행마다 입력의 접근 이름은 열 머리 + « (n행)» 이 이미 준다.

### «대표 행 + 되풀이» 로 충분한가

충분하다 — 설계서의 반복 행 표는 행마다 같은 입력 꼴이고(행 사이 차이는 표본 값뿐), 되풀이 행은 같은 셀 틀을 사본으로 그린다. 표본 값을 행마다 다르게 적으려면 «열 틀로 칸 짓기»(5단계 GR-B)를 쓴다.

### 따로 선 컴포넌트 · 변형 · 프리셋 — 걸음 수

예 둘: **«자격사항»**(값 칸 안 · 입력 셋 · 날짜 · `[삭제]` · `[추가]` · 행 둘 · 합계 없음)과 **«단위기간 설정»**(입력 · 날짜~날짜 · 글 셋 · `[삭제]` · `[추가]` · 합계 행). 걸음은 5단계 「노드 모델」 「견줌」 과 같은 어림 셈이다(고르기 + 행동 한 번 = 한 걸음 · 이름 짓기는 칸마다 한 걸음 · 칸 안 조각 갈기는 지우기 + 넣기 둘 · 합계 행은 «행» 구역 줄 고르기 · 팔레트 «행» · «열 틀로 칸 짓기» · 종류 · 가로 칸 수 · 글 둘 = 7).

| 짓는 길 | «자격사항» | «단위기간 설정» | 새 개념 |
| --- | --- | --- | --- |
| **그리드 카드로 손으로** — 값 칸의 `Input` 지우기 · 팔레트 «그리드» · 바 지우기 · 열 복제 · 머리 이름 · 셀 틀 갈기 · 되풀이 · «머리 오른쪽» 에 `[추가]` | 25 = 2 + 1 + 2 + 5 + 11 + 1 + 3 | 32 = 2 + 1 + 3 + 6 + 9 + 1 + 3 + 합계 7 | 없음 |
| **팔레트 카드 «반복 행 표»(프리셋)** — 열 둘(`Input`) · «삭제» 열(`Button «삭제»`) · 행 하나 `repeat 2` · «머리 오른쪽» `[추가]` · 바 없음으로 선다 | **10** = 2 + 2 + 4 + 2 | **28** = 2 + 3 + 5 + 4 + 6 + 1 + 합계 7 | 프리셋 |
| 따로 선 `RepeatTable` | 프리셋과 같다 + 열 · 셀 틀 장치를 다시 짓는다 | 같다 | 그리드 장치 두 벌 |
| `DataGrid` 테마 변형 «편집» | 손으로와 같다 — 변형은 모양만 바꾼다 | 같다 | 없음 |
| 모듈로 저장해 넣기 | 첫 하나는 손으로 · 뒤는 넣기 1 + 열 고치기 4 ~ 8 | 같다 | 없음 |

**같은 노드 + 프리셋 카드를 고른다(Q5).** 설계서의 반복 행 표 열 남짓 가운데 입력 칸이 대부분인 것(학력 · 자격 · 경력 · Wi-Fi · 시설관리)이 다섯이고, 그 꼴에서 25 → 10 이다. 글 칸이 많은 표(단위기간 · 과목설정)는 덜 준다(32 → 28). 따로 선 컴포넌트는 그리드의 열 · 행 · 사본 · 병합 머리를 다시 짓는다. 테마 변형은 걸음을 못 줄인다 — 기본테마의 셀 안 입력 높이는 그리드 그대로 재고(«6»), 낮춰야 하면 그리드의 규칙을 고친다.

### 프리셋 장치

```ts
// packages/schema/src/component/define.ts — ComponentDef 에 더한다
presets?: readonly { key: string; label: string; description: string; node: NodeTemplate }[]
// NodeTemplate = id 없는 WbNode(재귀) — createNode(type, presetKey) 가 id 를 짓는다
```

- `DataGrid` 에 `repeatRows` «반복 행 표» 하나. 템플릿: `headEnd` `[Button «추가»]` · 몸통 `GridColumn «항목 1»`{`Input`} · `GridColumn «항목 2»`{`Input`} · `GridColumn «삭제» size short · align center`{`Button «삭제»`} · `rows` `[GridRow repeat 2]` · `footer` 빈 배열(바 없음).
- 팔레트는 카드마다 «타입 + 프리셋» 이다 — «그리드» 다음에 «반복 행 표». 축소판은 갤러리의 같은 표본. 넣는 길(«안» · «뒤» · 끌기)은 카드가 만든 노드의 타입(`DataGrid`)으로 판정한다 — 받는 규칙이 안 바뀐다.
- 카탈로그 검사(`assertZoneReferences`)가 템플릿을 검증한다 — 템플릿이 그 판의 카탈로그로 `validatePage` 를 지나야 설치된다.
- `/llms.txt` 의 «Create with» 에 프리셋 한 줄(에이전트는 `patch_page` 로 같은 꼴을 적는다 — 프리셋은 웹 팔레트의 장치다).

Q5 를 (나)로 고르면 프리셋 장치를 짓지 않는다 — 갤러리 표본 · MCP 스킬 문서(`packages/mcp/skill/SKILL.md`)의 꼴 하나만 더한다.

### 팝업으로 채우는 하위 표

`[사용자 검색]`(«머리 오른쪽» `Button` + `openModal`) · 읽기 전용 글 행 · 빈 안내 행(`DataGrid.empty` · `emptyText` «등록된 … 이 없습니다.»)이다. 등록 · 수정의 빈 / 채운 대비는 화면 상태 둘이다. 새 것이 없다.

---

## 6. 좁은 창 · 넓은 상자

창 390 · 720(PPTX 캡처 폭) · 1280 과 **문턱 바로 위 폭**(961 · 1000 — 기본테마의 접기 문턱 960 바로 위에서는 열 수가 그대로라 칸이 가장 좁다)에서 잰다. «좁은 칸 안에 넣은 판»(격자 배치 2열 · 2열 폼 표 값 칸 · 카드)도 잰다.

| 무엇 | 꼴 | 잴 것 |
| --- | --- | --- |
| 팝업 상자 — 덮개 위 | 폭 `min(크기, 창 − 2 × 여백)` · 높이 상한 · 몸통만 굴림 | 390: 상자 폭 ≤ 창 − 2 × 여백 · 문서 `scrollWidth` = 창 · ✖ 가 창 안 · 몸통을 끝까지 굴려 마지막 내용과 바닥 단추가 창 안(`scrollIntoView` 뒤 — «접히지 않는다» 는 «보인다» 가 아니다) · 1280: 가운데 · 덮개가 창 전체 |
| 팝업 상자 — 페이지로 연 판(캔버스 · 번들) | 폭 `min(크기, 캔버스 폭)` · 굴림 없음(제 높이) | 390 · 720 · 1280: 넘친 요소 0 · 글자 노드 `Range.getClientRects()` 오른끝 ≤ 상자 오른끝(`TEXT_PAST_ROOT`) |
| 팝업 상자 — 화면 모드(PPTX) | **제 크기 그대로**(줄지 않는다) — `large` 960 이면 문서가 960 + 여백으로 넓어지고 캡처가 넓게 찍는다 | 창 720 에서 `large` 팝업 캡처 폭 ≥ 960 · 잘림 0 |
| **팝업 안의 폼 표 · 열을 정한 검색폼** | **팝업 크기가 접기 문턱 노릇을 한다** — 기본테마의 «960px 아래 한 줄에 쌍 하나» 규칙을 `small` · `medium` 팝업 안에도 건다(`[data-wb-component="Popup"][data-wb-size="small"] …` 꼴의 정적 규칙 — `@container` 를 새로 들이지 않는다). `large` 는 창 규칙만 | 창 1280 에서 `small` · `medium` 팝업 안 2열 폼 표가 한 줄에 쌍 하나 · 칸 밖 글 0 · 칸 폭 하한. 대조군: `large` 팝업 안은 2열 그대로 |
| 파일첨부 — 2열 폼 표의 값 칸 안 | 단추 줄은 접혀 다음 줄로 · 파일 이름은 칸 안에서 꺾임(`overflow-wrap: anywhere`) · 크기 칸은 꺾이지 않음 | 961 · 1000 · 1280 · 720 · 390: 넘친 요소 0 · 칸 밖 글 0 · «100.5 MB» 줄 수 1 · 긴 이름(하이픈 없는 낱말 · 띄어 쓰지 않은 한글) 꺾인 줄 수 ≥ 2 이고 칸 안. 좁은 칸 판: 격자 배치 2열 · 카드 · 팝업 `small` 안 |
| 반복 행 표 — 값 칸 안 | 표는 값 칸 폭의 스크롤 상자 안(5단계 그대로) — 칸이 좁으면 표만 가로로 굴린다 | 같은 폭들: 문서 `scrollWidth` = 창 · 표 상자 폭 ≤ 값 칸 · 셀 안 입력의 높이 ≤ 행 높이(입력이 행을 키우지 않는다) |
| 덮개 위 팝업 안의 그리드 | 그리드 스크롤 상자가 상자 몸통 폭을 따른다 | 390 · 1280: 상자 밖 넘침 0 |

---

## 7. 테마 뷰 계약 · 기본테마

### 기본 뷰(SDK)

**`Popup`**

```tsx
// packages/theme-sdk/src/default-views/structure.tsx — 꼴만
export const PopupView = view(({ nodeId, props, children }) => (
  <Root as="section" role="dialog" aria-labelledby={`${nodeId}-title`} data-wb-structure="default">
    <div data-wb-part="titlebar">
      <h2 data-wb-part="title" id={`${nodeId}-title`}>{String(props.title)}</h2>
      <button type="button" data-wb-part="close" aria-label="닫기">✖</button>
    </div>
    <div data-wb-part="body">{children}</div>
    <Zone name="footer" data-wb-part="footer" />
  </Root>
))
```

- 조각: `titlebar` · `title` · `close`(`<button>`) · `body`(몸통의 직계 그릇 — 덮개 층이 이 조각만 굴린다) · `footer`(몸통 밖).
- `aria-modal` 은 뷰가 안 단다 — 덮개 층이 단다(페이지로 연 판은 모달이 아니다).
- ✖ 를 누르면 덮개 층이 닫는다 — 덮개 층은 상자 안에서 `[data-wb-part="close"]` 를 찾는다. 테마가 조각 이름을 바꾸면 ✖ 가 안 닫는다 — `check` 가 잡는다(아래 P1).

**`FileAttach`**

```tsx
// packages/theme-sdk/src/default-views/input.tsx — 꼴만
<Root as="div" role="group" aria-label={field ?? '파일첨부'} data-wb-structure="default">
  <Zone name="actions" data-wb-part="actions" />
  <table data-wb-part="list">
    <thead><tr><th scope="col" data-wb-part="checkHead"><input type="checkbox" aria-label="모두 고르기" disabled /></th>
      <th scope="col">파일이름</th><th scope="col">파일크기</th></tr></thead>
    <tbody>
      {files.length === 0
        ? <tr><td colSpan={3} data-wb-part="drop">{hint}</td></tr>
        : files.map((file, i) => <tr key={i} data-wb-part="file"><td><input type="checkbox" aria-label={`${file.name} 고르기`} disabled /></td>
            <td data-wb-part="fileName">{file.name}</td><td data-wb-part="fileSize">{file.size}</td></tr>)}
    </tbody>
  </table>
  {limit ? <p data-wb-part="limit">최대 <span data-wb-part="limitCount">{maxFiles}개</span> <span data-wb-part="limitSize">{maxSize}</span> 제한</p> : null}
</Root>
```

- 체크는 그림이라 `disabled` 다(5단계 선택 열과 같은 판단 — 캔버스에서 고르는 상태를 들지 않는다). 포커스 받는 요소 수 규칙(`focusReceivers`)에 안 걸린다.
- `disabled` 는 노드 상태(`data-wb-state`)로 실린다 — 단추는 제 노드의 `disabled` 를 따른다(설계서의 딤드에서 단추도 회색이다 — 7단계 상태별 속성이 두 노드를 함께 바꾼다).

### SDK 기본 CSS(특이도 0)

- `Popup` — 제목줄 · 몸통 · 바닥의 세로 배치, 크기 셋의 폭(480 · 720 · 960), 페이지로 연 판의 `max-width: 100%`, 화면 모드(`CAPTURE_CSS`)의 «줄지 않음».
- 덮개 층 `[data-wb-popup-layer]` — 덮개 · 가운데 · 높이 상한 · 몸통 굴림. 테마 밖 셸의 규칙이라 테마가 덮개 색만 토큰으로 바꾼다.
- `FileAttach` — 머리 단추 줄 오른쪽 · 목록 표 · 크기 칸 꺾지 않음 · 이름 칸 꺾음.

### 기본테마(`system-admin`)

- `Popup` — 회색 제목줄 바탕 · 흰 몸통 · 테두리 · 그림자(덮개 위에서만) · 바닥 단추 오른쪽 정렬. 크기 셋. 작은 · 보통 팝업 안의 폼 표 · 검색폼 접기(«6»).
- `FileAttach` — 테두리 상자 · 머리 단추 작은 크기 · 목록 머리 회색 · 빈 목록 행 가운데 · 한도 수 빨간 굵은 글.
- 반복 행 표는 그리드 규칙 그대로 — 셀 안 입력의 높이를 «6» 에서 재고, 행을 키우면 그리드 규칙에서 줄인다.
- 판 1.8.0 · `checksums.json`.

### `wb-theme check` 와 `shots` — 깨는 뷰로 잰다

4단계 M1 · 5단계 M4 처럼 «자가 재는 척» 이 되지 않게, 규칙마다 **그 규칙만 어기는 테마 뷰**를 픽스처로 두고 그 판에서 그 규칙만 죽는지 본다(기본 뷰에서는 0). 규칙은 `check.ts` 에 노드 타입마다 함수 하나(`popupProblems` · `fileAttachProblems`).

| 규칙 | 재는 것 | 깨는 뷰 표본 |
| --- | --- | --- |
| P1 닫기 | 상자 안에 `[data-wb-part="close"]` 가 정확히 하나이고 `<button>` 이며 접근 이름이 있다 | ✖ 를 빼거나 · `<span>` 으로 · 조각 이름을 `x` 로 |
| P2 이름 | 뿌리가 `role="dialog"` 이고 `aria-labelledby` 가 가리키는 요소의 글이 `title` 이다 | `aria-labelledby` 를 빼거나 · 다른 id 로 · 제목을 `title` 조각 밖 글로 |
| P3 몸통 | 몸통 자식(`[data-wb-id]`)이 모두 `body` 조각 안이고 `body` 조각이 하나다 | 몸통 자식을 `body` 밖 형제로 · `body` 둘 |
| P4 바닥 | «바닥» 구역 자식이 `body` 조각 **밖**이다 | `<Zone name="footer">` 를 `body` 안에 |
| F1 행 수 | `file` 조각 수 = `files` 길이 | 첫 행을 빼고 그리기 · 같은 행 두 번 |
| F2 빈 목록 | `files` 가 비면 `drop` 조각 하나 · 차면 0 | `drop` 을 늘 그리기 · 빈 목록에 안 그리기 |
| F3 한도 | 한도가 있으면 `limitCount` · `limitSize` 조각의 글이 그 값 · 없으면 `limit` 0 | 한도 글을 조각 없이 한 줄로 · 한도가 없어도 줄을 그리기 |
| F4 목록 의미 | `list` 조각이 `table` 이고 머리 칸이 `th scope="col"` 셋 | `div` 목록 · `td` 머리 |
| 구역 | `actions` · `footer` 구역을 그린다 — 지금 `missingZones` 가 잰다 | 구역을 안 그리는 뷰(지금 규칙의 픽스처 꼴) |

- **`check` 가 그리는 표본** — `files` 0 · 2 판, 한도 있음 · 없음 판, 바닥 있음 · 없음 판을 함께 그린다(한 표본만 그리면 F2 · F3 의 한쪽 갈래가 안 잰다).
- **`shots`** — 갤러리 표본을 세 폭으로 찍는다(폴백 0 · 콘솔 오류 0).

### 갤러리 · 스타터 템플릿

- 갤러리(`packages/theme-gallery/src/samples.ts`): `Popup` 셋(빈 · 검색 팝업 꼴 — 검색폼 + 라디오 그리드 + 바 · 폼 팝업 꼴 — 폼 표 + 바닥), `FileAttach` 넷(빈 · 셋 · 한도 없음 · `Field` 값 칸 안), 반복 행 표 둘(프리셋 · 합계 행), 단순 파일 선택 줄 하나. 갤러리는 `Page` 가 아닌 표본을 `Page` 로 감싼다(`gallery.tsx`) — **`Popup` 표본은 감싸지 않고 뿌리로 그린다**(`Page` 안 `Popup` 은 뿌리 판정에 걸린다).
- 스타터 템플릿(`wb-theme` `pack-template`) — `Popup` · `FileAttach` 의 빈 CSS 자리와 조각 이름 주석.

### 판

SDK · 기본테마 1.8.0. 문서 판 5 그대로(«3»).

---

## 8. 에디터

이름으로 적는 입구는 `git grep` 으로 센 지금 것이다(끝 절).

| 하는 일 | 입구 | 지금 있나 |
| --- | --- | --- |
| 팝업 페이지 만들기 | 메뉴 줄 `+` «팝업 페이지 추가» — 이름 입력(«페이지 추가» 와 같은 상자) → 뿌리 `Popup { title: 이름 }` + 바닥 `[취소][저장]` | **새로 짓는다** — 줄 `+` 에는 «페이지 추가» · «JSON 에서 가져오기…» 뿐(`tree-row-actions.tsx`). 만들기 요청 `POST /:projectId/pages` 에 `kind`(`page` · `popup`)를 더한다 |
| 종류 바꾸기 | 페이지 정보 탭 «종류» `[화면] [팝업]` | **새로 짓는다**. 화면 → 팝업: `replace /root/type` · `add /root/props`(제목 = 페이지 이름). 팝업 → 화면: «바닥» 노드를 몸통 끝으로 `move` · `/root/zones/footer` · `/root/props` 를 걷고 `replace /root/type`. 묶음 하나 = 되돌리기 한 번. 뿌리를 쥔 사람이 있으면 잠금이 막는다(뿌리 경로를 고치는 편집이다) |
| 팝업 제목 · 크기 | 뿌리를 고르고 속성 패널 | 있다(속성 칸) |
| 바닥 단추 | 구조 트리 «바닥» 구역 줄을 고르고 팔레트 «버튼» · 단추 복제 | 있다(2단계 구역 줄) |
| `openModal` 대상 고르기 | 상호작용 탭 «페이지 경로» — **팝업 페이지 고르개** + «직접 적기» | **새로 짓는다** — 지금은 자유 입력뿐(«페이지 경로는 목록에서 고를 수 없다» 주석). 트리(`getTree`)를 `pageTargetsOf` 로 풀어 팝업 페이지를 먼저, 화면 페이지를 뒤에 보인다(`navigate` 도 같은 고르개). 고르개에서 «새 팝업 만들기» 는 짓지 않는다 — 메뉴 트리에서 만든다 |
| 팝업 닫기 규칙 | 상호작용 탭 액션 «팝업 닫기» | **새로 짓는다**(액션 고르개 한 줄 · 대상 칸 없음) |
| 파일 목록 줄 더하기 · 지우기 · 옮기기 | 속성 패널 «파일» 목록 위젯 | **위젯 꼴 `fileList` 를 더한다**(`list-control.tsx`) |
| 파일첨부 단추 | «단추» 구역 줄 · 단추 복제 · 지우기 | 있다 |
| 반복 행 표 넣기 | 팔레트 «반복 행 표» | **프리셋 카드 새로**(Q5 (가)) |
| 반복 행 더하기 · 줄이기 · 합계 행 | 행 «되풀이» · «한 행 떼어 내기» · «열 틀로 칸 짓기» | 있다(5단계) |

- **받는 규칙(`accepts`)은 새로 안 생긴다** — `Popup` 의 두 구역 · `FileAttach` 의 «단추» 는 무엇이든 받는다. 부모를 바꾸는 입구(끌기 · 팔레트 넣기 · 붙이기 · 모듈 넣기 · 들여쓰기 · 내어쓰기 — `edit/editor-shortcuts.ts` 의 `edits: true` 포함)는 그대로 `fitRefusal` 을 지난다. **뿌리 타입이 둘이 된다** — `Popup` 은 어디에도 놓이지 않아야 한다. 지금 `Page` 를 붙이기 · 모듈 넣기 · 팔레트가 어떻게 거르는지(뿌리 고르기는 복사 · 모듈 저장 대상에서 빠지는가)를 구현이 먼저 재고, `Page` 를 거르는 자리가 `Popup` 도 거르게 한다 — 걸러지지 않으면 붙이기가 422 로 되싣는다.
- **팔레트 «안» 거절 시 «뒤»(5단계 GR-B)** — `Popup` 뿌리를 골랐으면 «안»(몸통 끝)이다 — 뿌리 고르기는 지금도 몸통 끝이다(`paletteAddTarget`). `FileAttach` 를 골랐으면 몸통이 없어 «뒤» 다(값 칸 안 다음 자리). 프리셋 카드는 만든 노드의 타입으로 판정한다.
- **캔버스** — 팝업 페이지의 뿌리 상자를 누르면 뿌리를 고른다(지금 `Page` 와 같다). ✖ 는 편집 모드에서 눌러도 뿌리를 고를 뿐이다(상호작용이 돌지 않는다).
- **빈 구역 칸** — 끄는 동안 팝업의 빈 «바닥», 파일첨부의 빈 «단추» 칸이 선다(2단계 장치 그대로). 4단계 이월 L6(끄는 동안 빈 칸이 겨눈 칸을 민다)은 팝업 페이지에서 한 칸(바닥)이 늘 뿐이다 — 겨눔 상자는 `dragLayoutSettled` 뒤에 잰다.

---

## 9. 그 밖의 소비자

| 소비자 | 바뀌는 것 |
| --- | --- |
| 봉투 · 문서 판 | 액션 `closeModal`(봉투의 `InteractionActionSchema` · `node.ts` 의 타입). 문서 판 5 그대로 |
| 카탈로그 · 검증(`validate.ts`) | 새 타입 둘 · 뿌리 타입 둘(`Page` · `Popup` — 둘 다 뿌리에만) · `initial` 의 `interactions` · 프리셋(`ComponentDef.presets`) |
| 상호작용 판정 · 문장 | `closeModal` 판정(늘 맞음) · 문장 «팝업이 닫힙니다» · `openModal` 문장 «… 팝업으로 열립니다». **옛 문안을 단언한 자리를 문장 전체와 조각으로 센다** — «모달로 열립니다» 2 파일 · «모달 열기 규칙» 2 · «모달을 열지 않습니다» 2 · 고르개 «모달 열기» 2 · «open another page as a modal» 2(끝 절의 셈) |
| 런타임 · 덮개 층 | `InteractionRequest` 에 `closeModal` · `renderer` 의 `PopupLayer` · 캔버스 `noticesOf` · 번들 `mount.tsx` 의 `onEvent` |
| lint(`lint/design.ts`) | 새 규칙 셋(경고): `modal-target-not-popup`(`openModal` 이 화면 페이지를 가리킴) · `navigate-to-popup`(`navigate` 가 팝업 페이지를 가리킴) · `close-outside-popup`(화면 페이지의 `closeModal`). ④ 의 대상 집합 옆에 팝업 대상 집합을 넘긴다. 정본 「lint 규칙」 줄과 `test/lint-rules.test.ts` 를 함께 |
| 사람이 부르는 이름(`describe.ts` 의 `LABEL_PROPS`) | `Popup: 'title'` · `FileAttach` 는 타입 이름 |
| prop 표지(`marks.ts`) | `Popup: { size }` · `FileAttach: { disabled }` |
| 필드 이름(`fieldNames`) | `Field` 값 칸의 `FileAttach` 에 필드 이름(«4») |
| 트리 응답 · 페이지 만들기 | `TreePage.kind` · `POST /:projectId/pages` 의 `kind` · 웹 `api/types.ts` · `http-client.ts` 의 꼴 검사(`isTreePage`) |
| 페이지 JSON 가져오기 · 내보내기 | 뿌리 `Popup` 문서를 그대로 받는다(가져오기는 문서를 검증하므로 뿌리 판정만 넓으면 선다) |
| 내보내기 — HTML 번들 | 페이지 데이터의 팝업 문서(«2») · 목차 줄 «팝업» 표지 · 미리보기 응답 `pages[]` 에 `kind`. 무게: 팝업 다섯을 여는 페이지 하나의 데이터 바이트를 잰다 |
| 내보내기 — PPTX | 팝업 페이지도 슬라이드 한 장(상자만) · 노트의 문장이 새 문장 |
| 화면 캡처 | 화면 모드의 팝업은 제 크기 — 넓이 상한(720 × 8192 px²) 안 |
| MCP · CLI | `list_pages` · `page get` 에 종류. 스킬 문서(`packages/mcp/skill/SKILL.md`)에 팝업 페이지 · 파일첨부 · 반복 행 표 꼴. 페이지를 만드는 도구가 없어 «팝업 페이지 만들기» 는 사람의 일이다(에이전트는 있는 팝업 페이지의 뿌리를 고친다) |
| `/llms.txt` | 정의에서 저절로 나는 줄(props · 구역) + 영어 한 줄 표(`apps/web/config/llms-txt.ts`)를 손으로 — `Popup` · `FileAttach` · `closeModal` · `openModal` 문장 · 프리셋 한 줄. 생성물 `apps/web/public/llms.txt` 를 다시 낸다 |
| 팔레트 · 축소판 | `FileAttach` 카드(`input` 갈래) · 프리셋 카드 «반복 행 표». `Popup` 은 카드가 없다(뿌리 전용 — 팔레트 탐침이 `Page` 안에 놓아 거절된다) |
| 붙이기 · 모듈 · 복제 | 파일첨부 · 반복 행 표는 그대로. 팝업 뿌리는 «8» |
| 화면 상태 · 상태 보임 | 바닥 단추 · 파일첨부가 노드라 상태마다 숨긴다 |
| 개수 하한 | `dev.test.ts` 의 `kinds` 35 → 37 · `.sample-card` 수 · `palette.test.ts` 카드 하한(≥ 17 — 카드가 늘어 그대로 선다) · `shots.test.ts` 폴백 목록 |
| 마이그레이션 `0033` | «3» · `apps/api/README.md` 의 마이그레이션 목록 |

---

## 10. 뒤 단계를 막지 않는다

| 뒤 단계 | 들어갈 자리 | 막는가 |
| --- | --- | --- |
| 7 상태별 속성 — 팝업 바닥 단추 이름이 상태마다 | 바닥 단추는 `Button` 노드 · 이름은 그 prop | 아니다 |
| 7 상태별 속성 — 팝업 제목 · 크기 · 파일 목록 · 파일첨부 딤드 | `Popup.title` · `size` · `FileAttach.files` · `disabled` 가 보통 prop | 아니다 |
| 7 화면 정보 — 팝업 페이지의 화면ID | 페이지 정보 탭(페이지의 것 — 뿌리 타입과 무관) | 아니다 |
| 7 Object Description — 팝업 · 바닥 단추 · 파일첨부 단추 · 반복 행 표의 칸 | 모두 노드 — 지금 표지 자리 | 아니다 |
| 7 Object Description — ✖ · 파일 행 · 한도 글 | 노드가 아닌 조각 — 4단계 «조각 기준 표지»(노드 + 조각 이름)로 단다 | 아니다 — 조각 이름(`close` · `file` · `limit`)을 계약으로 고정해 둔다 |
| 9 글 부분 강조 — 빈 목록 안내의 «더블클릭» · «드래그» | `FileAttach.hint` 에 같은 장치 | 아니다 |
| 9 작은 요소 — 팝업 안 안내 띠 · `※` 글 | 팝업 몸통은 무엇이든 받는다 | 아니다 |
| 실제 파일 보관(Q1 (나)를 뒤에 고르면) | `files` 항목에 선택 칸 `asset` 을 더한다 — 표본 행과 올린 행이 한 배열에 선다 | 아니다 |

---

## 11. 구현을 나누는 법

**셋 가운데 팝업만 크다.** 팝업(모델 · 액션 · 덮개 층 · 번들 · 트리 · 입구 · 마이그레이션)은 파일첨부 · 반복 행 표와 서로 기대지 않는다 — 파일첨부 · 반복 행 표는 팝업 안에서도 밖에서도 선다. 파일첨부와 반복 행 표도 서로 기대지 않지만 둘 다 작아 한 트랙으로 묶는다.

### PO-A — 팝업 페이지(L)

1. 카탈로그 — `Popup` · 뿌리 타입 둘 · `initial` 의 `interactions` · 표지 · `LABEL_PROPS`.
2. 액션 `closeModal` — 봉투 · 판정 · 문장(`openModal` 문장 포함 · 옛 문안 단언 셈) · 런타임 요청 · 상호작용 탭 고르개 · 정본 «6종».
3. 렌더러 `PopupLayer` · 캔버스 뷰 모드(대상 풀기 · 조회 · 알림 문장) · 번들(`mount.tsx` · 페이지 데이터의 팝업 문서 · 목차 표지).
4. SDK `PopupView` · 기본 CSS · 덮개 층 CSS · 화면 모드 규칙 · 표지 · 판 1.8.0. 기본테마 CSS(팝업 · 팝업 안 접기) · 판 · `checksums.json`.
5. `check` P1 ~ P4(깨는 뷰 넷) · 갤러리 표본(뿌리 그대로) · 스타터 템플릿 · `shots`.
6. 트리 `kind` · 만들기 `kind` · 메뉴 줄 «팝업 페이지 추가» · 트리 줄 표지 · 페이지 정보 «종류» · 대상 고르개.
7. lint 셋 · MCP · CLI 종류 · 스킬 문서 · `/llms.txt`.
8. `0033`(Q2) — 풀이 사본 · 두 자리 · `down` · 옮긴 수 로그.
9. 실브라우저 판 — 뷰 모드 · 번들의 열기 · 닫기(✖ · Escape · `closeModal`) · 포커스 돌려줌 · 겹 쌓기 다섯 · 390 · 720 · 1280 · 팝업 안 폼 표 접기(«6») · PPTX 넓은 팝업.
10. 정본(서문의 절) · `apps/api/README.md`.

### PO-B — 파일첨부 · 반복 행 표(M)

1. 카탈로그 — `FileAttach` · `FileEntrySchema` · 표지 · `fieldNames`.
2. 목록 위젯 `fileList`.
3. SDK `FileAttachView` · 기본 CSS. 기본테마 CSS.
4. `check` F1 ~ F4(깨는 뷰 넷 · 표본 갈래).
5. 프리셋 장치(Q5 (가)) — `ComponentDef.presets` · `createNode(type, preset)` · 팔레트 카드 · 축소판 · 카탈로그 검사 · `DataGrid` 의 `repeatRows`.
6. 갤러리 표본(파일첨부 넷 · 반복 행 표 둘 · 단순 파일 줄) · 스타터 · `shots`.
7. `/llms.txt` · 스킬 문서.
8. 실브라우저 판 — 값 칸 안 파일첨부 · 반복 행 표의 좁은 창 판(«6») · 프리셋 넣기 · 목록 위젯.

### 나란히 돌릴 때 미리 나눈 것

| 겹치는 파일 | 나눔 |
| --- | --- |
| `packages/theme-sdk/src/version.ts` · `system-themes/admin/package.json` · `checksums.json` | **둘 다 1.8.0** — A 가 판을 올리고 B 는 같은 판에 더한다(배포 전이라 한 판에 둘). 뒤에 병합하는 B 가 합친 판에서 `.wbtheme` sha256 을 다시 잰다 |
| 마이그레이션 번호 | `0033` 은 A 만. B 는 마이그레이션이 없다 |
| `packages/schema/src/component/catalog/{structure,input,index}.ts` · `define.ts` | A 는 `structure.ts` · 뿌리 판정 · `initial` 의 `interactions`, B 는 `input.ts` · `presets` — `define.ts` 의 `ComponentDef` 에 둘이 한 줄씩 더한다 |
| `packages/theme-sdk/src/{marks,types}.ts` · `default-views/{index,structure,input}.tsx` | 표 · 등록에 한 줄씩 |
| `packages/theme-kit/src/check.ts` | 함수 하나씩(`popupProblems` · `fileAttachProblems`) |
| `packages/theme-gallery/src/samples.ts` · `gallery.tsx` | 표본 끝에 한 묶음씩 · `gallery.tsx` 의 뿌리 감싸기는 A |
| `packages/theme-kit/build-test/dev.test.ts` 의 `kinds` | A 36 · B 37(B 가 A 위로 옮긴 뒤) |
| `apps/web/config/llms-txt.ts` · `apps/web/public/llms.txt` | 표에 한 줄씩 · 생성물은 뒤에 병합하는 쪽이 다시 낸다 |
| `packages/mcp/skill/SKILL.md` | 꼴 한 절씩 |

**차례** — 둘을 나란히 돌리고 **A 를 먼저 병합, B 를 A 위로 옮겨 병합**한다. 합친 판은 수만이 아니라 통과를 다시 잰다(B 의 갤러리 · `check` 표본이 A 의 뿌리 감싸기 위에서 선다).

### 크기

**PO-A L(5단계 GR-A 보다 작다 — 타입 하나 · 픽스처 옮기기 없음 · 대신 런타임 덮개 층과 번들 데이터) · PO-B M.** 기존 케이스 셈: `openModal` 을 부르는 케이스 11 파일 · 옛 문안 단언(«9») · `Page` 뿌리를 단언하는 검증 케이스(`validate` 의 뿌리 판정).

---

# 사용자에게 물을 것

물음마다 하나만 묻는다. 고른 것이 화면에서 무엇을 바꾸는지 한 줄씩 적었다.

### Q1. 파일첨부는 그림만 그리나, 실제 파일을 올려 보관하나

- **(가) 그림만 — 파일 목록은 사람이 적는 표본(이름 · 크기)이다(추천).** 화면: 속성 패널에서 «파일» 줄을 더하고 이름 · 크기를 적는다. 번들 · PPTX 에 그 목록이 그대로 그려진다.
- (나) 실제 파일을 올린다. 화면: 칸에 파일을 끌어 놓으면 서버에 올라가고 목록에 이름 · 크기가 선다. 번들에서 내려받을 수 있다. 그림 저장소를 문서 꼴(PDF · 엑셀 …)로 넓히는 큰 일이 더해진다.

### Q2. 지금 «모달 열기» 가 가리키는 페이지를 팝업 페이지로 옮기나

- **(가) 옮긴다 — `0033` 이 그 페이지들을 팝업으로 바꾼다(추천).** 화면: 마이그레이션 뒤 그 페이지들이 메뉴 트리에 «팝업» 표지를 달고, 캔버스에 제목줄 · ✖ 가 있는 상자로 그려진다. 제목은 페이지 이름으로 선다 — 지금 내용에 제목을 따로 그려 두었으면 제목이 두 번 보인다.
- (나) 안 옮긴다. 화면: 그 페이지들은 지금 모양 그대로이고, 페이지 정보 탭 «종류» 를 눌러 하나씩 바꾼다. 바꾸기 전에는 lint 가 «팝업이 아닌 페이지를 팝업으로 엽니다» 를 말한다.

### Q3. 뷰 모드 · HTML 번들에서 «팝업 열기» 를 누르면

- **(가) 연 화면 위에 어두운 덮개가 깔리고 가운데 팝업 상자가 뜬다(추천).** 화면: ✖ · Escape · «취소» 로 닫으면 연 화면으로 돌아온다. 상자 안이 길면 상자 안에서 굴린다.
- (나) 지금처럼 그 팝업 페이지로 옮긴다(번들) · 알리기만 한다(에디터). 화면: 번들에서 팝업 상자만 있는 페이지로 넘어가고 브라우저 «뒤로» 로 돌아온다.

### Q4. 새 팝업 페이지의 바닥에 처음부터 단추를 두나

- **(가) `[취소][저장]` 을 둔다 — «취소» 는 처음부터 «팝업 닫기» 규칙을 든다(추천).** 화면: 새 팝업 상자 아래 오른쪽에 두 단추가 서 있다. 검색 팝업처럼 바닥이 없는 팝업은 둘을 지운다.
- (나) 빈 바닥으로 시작한다. 화면: 새 팝업은 제목줄과 빈 몸통뿐이다. 단추는 구조 트리 «바닥» 줄을 골라 넣는다.

### Q5. 반복 행 입력 표를 팔레트 카드로 두나

- **(가) 팔레트에 «반복 행 표» 카드를 둔다 — 누르면 입력 열 둘 · «삭제» 열 · 행 둘 · `[추가]` 가 든 그리드가 선다(추천).** 화면: 팔레트 «그리드» 옆에 카드가 하나 는다. 흔한 입력 표가 걸음 25 → 10 이다.
- (나) 카드를 안 둔다 — «그리드» 를 넣고 열 · 칸을 손으로 바꾼다(한 번 지은 표는 모듈로 저장해 다시 쓴다). 화면: 팔레트는 지금 그대로다.

### Q6. 팝업 페이지는 메뉴 트리 · 번들 목차의 어디에 보이나

- **(가) 지금처럼 그 팝업을 쓰는 메뉴 밑에 — 줄 앞에 «팝업» 표지를 단다(추천).** 화면: 메뉴 트리 · 번들 목차에서 화면 페이지 사이에 «팝업» 표지가 붙은 줄로 선다. 설계서의 화면 목록(같은 메뉴의 «… 팝업» 화면)과 같은 차례다.
- (나) 메뉴 밖 «팝업» 묶음에 모은다. 화면: 메뉴 트리 맨 아래 «팝업» 묶음 하나에 모든 팝업이 선다. 페이지가 메뉴 없이 서는 장치(지금 페이지는 늘 메뉴에 속한다)와 대상 글자 꼴을 새로 지어야 한다.

---

## 소비자 조사 — 다시 재는 법

워크트리 뿌리에서 돈다(zsh). 셈은 두 길로 했다 — `git grep -l` 과 파이썬 글자 셈이 같았다(`openModal` 소스 21 · `switchTab` 소스 12).

```bash
# openModal 을 부르는 소스 · 케이스 파일 수
git grep -l -F openModal -- apps packages ':!**/test/**' ':!**/build-test/**' ':!**/test-support/**' ':!*.test.*' | wc -l
git grep -l -F openModal -- '**/test/**' '**/build-test/**' '*.test.*' | sort -u | wc -l
# 액션 종류를 가르는 소스 파일(switchTab 을 부르는 곳)
git grep -l switchTab -- apps packages ':!**/test/**' ':!**/build-test/**' ':!*.test.*'
# Page 뿌리를 글자로 짓거나 견주는 소스 줄
git grep -n -E "type === 'Page'|type !== 'Page'|type: 'Page'" -- apps packages system-themes ':!*.test.*' ':!**/test/**' ':!**/build-test/**' | wc -l
# 웹의 뿌리 가드(id 로 가른다)
git grep -n -E "root\.id|rootId" -- apps/web/src/edit apps/web/src/palette apps/web/src/panels/structure-tree.tsx
# 지금 openModal 이 도는 길
git grep -n -A10 "function noticesOf" -- apps/web/src/canvas/canvas.tsx
git grep -n -A20 "const onEvent = useCallback" -- packages/exporter/src/browser/mount.tsx
pnpm vitest run apps/web/test/canvas/interaction-runtime.test.tsx -t 'navigate·openModal'
# 옛 문안 — 바꾸면 단언을 고칠 자리(docs 는 뺀다 — 이력 문서는 안 고친다)
for w in '모달로 열립니다' '모달 열기 규칙' '모달을 열지 않습니다' "'모달 열기'" 'open another page as a modal'; do echo "$w: $(git grep -l -F "$w" -- ':!docs' | wc -l)"; done
# 메뉴 줄 + · 페이지 정보 탭 · 대상 칸
git grep -n "item('addPage'" -- apps/web/src/panels/tree-row-actions.tsx
git grep -n -A8 "export function PageInfoPanel" -- apps/web/src/panels/page-info.tsx
git grep -n "페이지 경로는 목록에서 고를 수 없다" -- apps/web/src/panels/interaction-panel.tsx
# 트리 응답이 문서에서 읽는 것
git grep -n -A8 "export async function listPageRows" -- apps/api/src/repos/pages.ts
# 목록 위젯 꼴 · 편집 칸 종류
git grep -n "type Kind" -- apps/web/src/panels/controls/list-control.tsx
git grep -h -o -E "control: '[a-zA-Z]+'" -- packages/schema/src | sort | uniq -c
# 판 · 마지막 마이그레이션 · 개수 하한
git grep -n "SDK_VERSION =" -- packages/theme-sdk/src/version.ts
git grep -n "CURRENT_DOCUMENT_VERSION =" -- packages/schema/src
ls apps/api/src/db/migrations | tail -2
git grep -n "expect(kinds).toBe" -- packages/theme-kit/build-test/dev.test.ts
git grep -n "expect(cards).toBeGreaterThanOrEqual" -- apps/web/build-test/palette.test.ts
# 기본테마의 접기 문턱 · container 질의
git grep -n "@media" -- system-themes/admin/src/theme.css
git grep -l -E '@container|container-type' -- ':!docs' | wc -l
# 화면 캡처의 창
git grep -n "const VIEWPORT" -- apps/api/src/services/screen-render-chromium.ts
```
