# 그리드 · 페이지네이션 바 — 설계

로드맵 `docs/superpowers/plans/2026-10-22-skala-roadmap.md` 의 «모자란 것» 4(· 10 마스터-디테일) · «정한 것» A · C · «단계» 5 다. 목록 · 팝업 · 상세 화면의 자료 표(열마다 셀 종류 · 선택 열 · 병합 머리 · 합계 행 · 빈 결과 행 · 행 강조 · 고정 열 + 가로 스크롤 · 정렬 표시)와 그 아래 페이지네이션 바를 그리는 길을 정한다.

이 문서는 발행 시점의 기록(spec)이다. 구현이 병합되면 정본 설계서(`docs/superpowers/specs/2026-08-03-wirebound-design.md`)의 §4.3 「페이지 스키마 노드」(예 노드) · §5 「컴포넌트 카탈로그」(표 · 정의 예) · §6.1 「노드 속성」(`data-wb-cell` · 표지 목록 · 기본 뷰 문단 · 테마 뷰 계약) · §9 「설계서 화면 구조」(그림의 `List`) · §12.4 「lint 규칙」(주요 컴포넌트) · §12.6 「`/llms.txt`」 가 지금 참인 것을 갖는다. 이 설계는 정본을 고치지 않는다 — 구현 차수가 고친다.

2단계 구역 모델(`docs/superpowers/specs/2026-10-23-node-slots-design.md` — `zones` · `accepts` · `placement` · `bodyHost`) · 3단계 조합 입력(`docs/superpowers/specs/2026-10-24-compose-input-design.md`) · 4단계 폼 표(`docs/superpowers/specs/2026-10-25-form-table-design.md`)가 병합된 판(main `665ddd27`) 위에 선다.

---

## 이 설계가 고른 것 — 한눈에

| 물음 | 고른 것 | 이유(한 줄) |
| --- | --- | --- |
| 노드 모델 | **(다) 섞음 — 열 노드(머리 칸 + 셀 틀) × 행 노드(되풀이 수 · 행 꼴 · 필요할 때만 제 칸)** | 설계서는 «대표 몇 행 + 나머지는 같은 꼴» 이다. 같은 꼴은 열 틀이, «첫 행 강조 · 합계 행 · 휴일 행» 은 행 노드가 든다. 행 50 × 열 10 이 노드 스물 남짓이다 |
| 되풀이 행 | **렌더러가 «사본» 으로 그린다** — 노드 속성 · 표지 · 상태 · 상호작용은 같고 `data-wb-id` 대신 `data-wb-copy-of` | 같은 노드를 DOM 에 여럿 두면 에디터의 노드 찾기(첫 일치) · HTML `id` · 마커가 겹친다 |
| `List` 와의 관계 | **`List` 를 걷고 새 `DataGrid` 를 둔다 — `0032` 가 옮긴다**(Q5) | 열이 노드가 되면 props · 구역 · 뷰가 다 바뀐다. 구조 트리 줄이 타입 이름을 보여 «List» 가 표를 부르면 헷갈린다 |
| 팔레트 이름 | **«그리드»** — 배치 `Grid` 는 «격자 배치» 로(Q1) | 설계서 · OD 가 쓰는 낱말이다 |
| 셀 종류 | **지금 조각 그대로**(`Text` · `Link` · `Button` · `Select` · `Input` · `RadioGroup` 세그먼트 · `CheckboxGroup` · `Chip` · `Affix` · `Placeholder`) — 새 조각 없음. «No» 열만 열의 `numbering` | 정한 것 A. 배지 · 상태 칩은 9 의 몫이고 지금 조각으로 대신 선다 |
| 병합 머리 | **열 묶음 노드(`GridColumnGroup`)** — 트리 깊이가 머리 단이다. `colspan` · `rowspan` 을 사람이 안 적는다 | 들여쓰기로 묶고 내어쓰기로 푼다. 묶음 머리 칸에도 표지가 붙는다 |
| 선택 열 | `DataGrid.select`(`none` · `check` · `radio`) — 뷰가 맨 앞 칸을 그린다 | 머리 «모두 고르기» · 행 꼴 «강조» 가 그 행 칸을 켠다 |
| 합계 행 · 생략 띠 | 행 노드의 `kind`(`total` · `gap`) | 행 노드 하나로 선다 |
| 빈 결과 행 | `empty` 상태 + `emptyText`(«검색 결과가 없습니다.») | `List` 의 꼴 그대로 · 문구만 prop |
| 행 강조 · 딤드 · 음영 | 행 `tone`(`selected` · `dimmed` · `shaded`) · 열 `tone`(`shaded` — 주말 열) | enum 이라 SDK 표지다 |
| 고정 열 + 가로 스크롤 | `fixedColumns`(수 — 표지가 아니라 조각 속성) · 표는 스크롤 상자 안 | 왼쪽 N 열이 가로 스크롤에 제자리다 |
| 정렬 표시 | 열 `sort`(`none` · `sortable` · `asc` · `desc`) — 머리 `▼` · `aria-sort` | |
| 페이지네이션 바 | **새 컴포넌트 `Pagination`** — 그리드의 «바닥» 구역 기본 내용 | 그리드와 함께 움직이고 표지 · 상태 보임 · 모듈 단위가 된다 |
| 범위 글 | `Pagination` props(`total` · `pageSize` · `page`)로 셈한다(Q3) | 쪽 번호 · 범위 · 행 수가 한 셈에서 나와 서로 안 어긋난다 |
| 좁은 창 | **접지 않는다** — 표 칸만 가로 스크롤(테마의 몫) | 열을 카드로 접으면 열 머리 · 병합 머리 · 고정 열의 뜻이 사라진다 |
| PPTX | **찍을 때 스크롤 상자를 풀어 표 전체 폭으로**(Q2) | 설계서도 넓은 표를 화면 틀 밖까지 그린다 |
| 표 의미론 | `<table>` — `th scope` · `colspan` · `rowspan` · `aria-sort` | 자료 표다(폼 표와 반대 — 4단계 «표 의미론») |
| 나누기 | **두 트랙, 차례로** — GR-A(모델 · 렌더 · 테마 · `0032`) → GR-B(에디터 입구) | A 만으로 L 이다. B 는 A 의 타입 · 사본 장치에 기댄다 |

---

## 지금 모델이 기대는 곳

워크트리 뿌리에서 다시 잰 것이다(코디네이터가 센 것과 맞다). 다시 재는 법은 끝 절.

| 자리 | 지금 |
| --- | --- |
| `packages/schema/src/component/catalog/data.ts` 의 `ListDef` | props `items`(0 ~ 50 · 기본 5) · `columns`(`string[]` · 기본 `['컬럼 1', '컬럼 2']`) · `pagination`(기본 참) · `selectable` · `selected` · `disabled` · `loading` · `empty`. 상태 넷(`selected` · `disabled` · `loading` · `empty`). 구역 `headStart` · `headEnd` 만 — 몸통이 없다 |
| `packages/theme-sdk/src/default-views/data.tsx` 의 `ListView` | `Root as="table"` > `caption[data-wb-part=head]`(두 구역) · `thead` 열 이름 · `tbody` 행 `items` 개(칸마다 `—` · 홀수 행 `rowAlt`) · `selectable` 이면 `data-wb-cell="check"` 칸 · `empty` 면 «데이터가 없습니다» 한 줄 · `loading` 이면 `skeleton` · `pagination` 이면 `tfoot` «1 2 3» |
| 표지 `packages/theme-sdk/src/marks.ts` 의 `MARKED_PROPS` | `List: { pagination: 'flag', selectable: 'flag' }`. 새 불리언 · enum prop 이 표 · 상태 · 변형 어디에도 없으면 `packages/renderer/test/prop-marks.test.tsx` 가 죽는다 |
| 기본테마 `system-themes/admin/src/manifest.ts` · `theme.css` | `List` 변형 `default` · `featured` · `compact`. `[data-wb-component="List"]` 규칙(바깥 선 · 행 아래 선 · 머리 `canvas` 바탕 · `rowAlt` · 가운데 페이지네이션 · 체크 칸 · 빈 줄 · 막대 · 강조 · 촘촘 · 선택 · 비활성). 판 1.6.0 |
| `bodyHost: 'parent'` | `TabPanel` 만 — 뷰는 `children` 을 `null` 로 받고 렌더러가 몸통을 부모의 `items[i].content` 로 넘긴다(`packages/renderer/src/render.tsx` 의 `renderNodeUncached`) |
| `ViewProps.items` · `ViewItem`(`packages/theme-sdk/src/types.ts`) | **몸통 자식만** 든다(`nodeId` · `index` · `element` · `content` · `span`). 이름 붙은 구역은 `zones[name]`(그린 것)뿐 — 자식마다 갈라 받는 길이 없다 |
| `placement`(`packages/schema/src/component/define.ts` 의 `ComponentDef`) | `{ type, zone }` **하나** — `TabPanel` 만 쓴다 |
| 몫 `weightRoom` | `Flex` · `Field` → `flex`, `Grid` · `FormTable` · 열을 정한 `SearchForm` → `span` |
| 필드 이름 `fieldNames`(`render.tsx`) | `Field` 몸통의 값 조각(`VALUE_PIECES`)만 이름(`ViewProps.field`)을 받는다 |
| 캔버스의 노드 찾기 | `apps/web/src/canvas/canvas.tsx` 의 `findNodeElement` · `packages/exporter/src/browser/mount.tsx` 의 `findNode` 모두 **문서 차례의 첫 일치**. 끌기 판정 · 범위 선택 · 안내선 · 놓은 자리 지키기(`canvas-drop.ts` · `use-canvas-marquee.ts` · `layout-guides.tsx` · `keep-drop-place.tsx`)는 `[data-wb-id]` 를 훑는다 |
| 빈 구역 칸 `apps/web/src/canvas/empty-zones.tsx` | 끄는 것이 그 구역에 설 수 있을 때만(`fitRefusal`) 그 구역 자리에 `div` 칸을 넣는다 |
| 부모를 바꾸는 입구 | 끌기 · 팔레트 넣기 · 붙이기 · 모듈 넣기 · 들여쓰기 · 내어쓰기 모두 `apps/web/src/edit/structure-drop.ts` 의 `fitRefusal`(받는 타입 · 설 자리)을 지난다 — `structure-drop.ts` · `palette/palette-add.ts` · `edit/paste-ops.ts` · `edit/structure-actions.ts` |
| 팔레트 넣기 대상(`palette-add.ts` 의 `paletteAddTarget`) | 구역 줄을 골랐으면 그 구역 끝 · 몸통이 있는 노드면 «안»(몸통 끝) · 잎이면 «뒤». **«안» 이 거절되면 «뒤» 로 물러서지 않는다** |
| lint `packages/schema/src/lint/design.ts` 의 `MAJOR_COMPONENTS` | `['List', 'EntryForm', 'SearchForm']` — 정본 §12.4 의 줄을 `test/lint-rules.test.ts` 가 글자 그대로 대조한다 |
| 편집 칸 `stringList` | `List.columns` · `Tree.items` 가 쓴다 |
| 화면 캡처 `apps/api/src/services/screen-render-chromium.ts` | 창 `VIEWPORT` 720 × 552 · 문서 전체(`scrollWidth` · `scrollHeight`)를 잰 크기로 찍는다 · 넓이 상한 720 × 8192 px² |
| 비용 축 | 잠금 판정 케이스 `apps/api/test/ws-lock-cost.test.ts` 가 `Text` 7000(538KB — 노드 하나 77B 꼴) 한 페이지를 잰다. 편집 한 번의 연산 상한 `MAX_OPS_PER_EDIT` 200(`packages/schema/src/clipboard.ts`) |
| `List` 를 부르는 코드 | 86 파일(소스 8) · 그 가운데 `List` 의 props(`columns` · `items` …)를 쓰는 것 33 |
| 판 | 문서 `CURRENT_DOCUMENT_VERSION` 4 · SDK `SDK_VERSION` 1.6.0 · 기본테마 1.6.0 · 마지막 마이그레이션 `0031-entry-form-table` |
| 개수 하한 | `apps/web/build-test/palette.test.ts` 카드 ≥ 17 · `packages/theme-kit/build-test/dev.test.ts` 의 `kinds` 30(카탈로그 타입 수) · `.sample-card` 수 · `shots.test.ts` 폴백 항목 목록 |

---

## 설계서가 요구하는 꼴

분석 파일(그룹 A ~ D — 저장소 밖)의 그리드 · 페이지네이션 절을 꼴로 일반화한 것이다. 쪽은 «그룹 문서 쪽».

| 꼴 | 어디서 | 얼마나 |
| --- | --- | --- |
| 링크 셀(굵은 밑줄) · 셀 안 단추(채움 · 테두리) | A p1 · p2 · p15 · B 기수 p-01 · C 교육 p-1 · D 공통 | 거의 모든 목록 |
| «No» 열(역순 번호) | A p1 · p2 · D 공통 | 거의 모든 목록 |
| 라디오 선택 열(«선택») · 체크 열 + 머리 «모두 고르기» | A p1 · p23 · B 기수 p-05 · C 출결 p-2 · 훈련 p-1 | 팝업 · 일괄 동작 목록 |
| 셀 안 입력 · 셀렉트 · 세그먼트 · `[readonly][검색]` · 숫자 + `[설정]` | A p4 · p22 · B 교육일정 p-2 · p-5 · 분반 p-2 | 편집 그리드 · 반복 행 표 |
| 두 줄 셀(«2026-07-04 / ~2026-12-18») · 말줄임 | B 기수 p-01 · C 출결 p-1 · 공가 p-1 · D 교강사 p4 | 흔함 |
| 색 글자(오류 빨강 · 정상 파랑 · 상태 색) · 기호 셀(○ ✕ ◎ …) | A p14 · B 교육일정 p-7 · C 출결 p-2 · p-4 | 일괄등록 결과 · 출석부 |
| 칩 · 배지(셀 안 여러 칩 · `[OFF]` 알약 + 링크) | B 교육일정 p-2 · C 공가 p-3 | 가끔 |
| 2 ~ 3단 병합 머리(왼쪽 열 rowspan · 묶음 colspan) | A p22 · B 교육일정 p-2 · C 출결 p-2 · p-5 · D 교강사 p1 | 문서마다 한둘 |
| 머리의 필수 `*` · 정렬 `▼` | A p14 · B 교육일정 p-5 · C 출결 p-1 · 훈련 p-1 · D 과목 p1 | 흔함 |
| 합계 행(앞 칸 병합 «합계» + 수치 열) | B 기수 p-03 · p-08 · C 교육 p-7 | 편집 그리드 |
| 빈 결과 행(전폭 한 줄 «검색결과가 없습니다.» · «등록된 …이 없습니다.») | A p25 · p33 · B 분반 p-6 · D 교강사 p4 | 흔함 |
| 행 강조(고른 행 연한 파랑) · 휴일 행(빨간 글 · 비활성 체크) · 열 음영(주말 · 공휴일) | B 분반 p-6 · B 교육일정 p-2 · C 출결 p-2 · p-5 | 가끔 |
| 고정 열 + 가로 스크롤 · 표가 화면 틀 밖까지 넘침 | A p14 · B 교육일정 p-3 · p-7 · C 출결 p-2 | 넓은 표 |
| 출석부 매트릭스(고정 열 열둘 + 월 › 일 › 요일 3단 머리) | C 출결 p-2 | 한 곳 — 가장 넓은 표 |
| 행렬 표(행 머리 rowspan · 전체 rowspan 한 칸) | A p22 · B 기수 p-10 · C 교육 p-3 | 세 곳 |
| 행 생략 지그재그 띠 | C 출결 p-4 · p-5 | 두 곳 |
| 페이지네이션 바 — 왼쪽 행 수 셀렉트(10 ▼) · 가운데 `<< < 1 2 … 9 > >>`(지금 쪽 밑줄) · 오른쪽 «1 - 50 (총 72 항목 중)» | 모든 목록 · 팝업 | 행 수 목록은 OD 에만(10 · 20 · 50 · 100 · 300 · 500 · 1000) |
| 페이지네이션 없는 그리드(건수만) | C 출결 p-4 · p-5 | 팝업 |
| 결과 머리줄(«검색결과 총 N건» + 오른쪽 단추 · 셀렉트 · 범례) | 모든 목록 | 2단계가 `List` 구역으로 지었다 |
| 마스터-디테일 2분할(각자 머리줄 · 그리드 · 바닥줄 · 미선택 안내 상자) | A p25 – p36 · B 분반 p-2 · p-6 | 두 문서 |
| 폼 표 값 칸 안 하위 그리드(`[추가]` + 행마다 `[삭제]` + 합계) | B 기수 p-02 · p-08 · C 훈련 p-2 | 등록 화면 |
| 대표 몇 행 + 나머지 같은 꼴 · 행마다 다른 표본 값 | 모든 그리드 | 늘 |
| OD 표지 자리 — 머리 칸 안 · **첫 행** 셀(링크 옆 · 단추 옆) · 행 수 셀렉트 옆 · 그리드 왼쪽 위 | A p1 · p14 · C 출결 p-2 · D 공통 | 늘 |

**안 나온 것:** 행 펼침 · 행 안의 트리 · 열 끌어 폭 바꾸기 · 셀 편집 상태(누르면 입력) — 120쪽에 없다.

---

## 1. 노드 모델

### 후보

- **(가) 열 노드만** — `DataGrid` > 열 노드(머리 칸 + 셀 틀). 행은 수(prop)다 — 모든 행이 같은 꼴이다. 행마다 다른 것(강조 · 딤드)은 그리드의 배열 prop(`rowTones: ['selected', 'dimmed']`)으로 적는다.
- **(나) 행 노드 × 셀 노드** — `DataGrid` > 머리 행(머리 칸 노드) · 몸 행 노드 × 칸 노드 × 내용. 설계서의 «행마다 다른 값» 을 그대로 그린다. 열은 노드가 아니다 — 열 폭 · 정렬 · 고정은 머리 칸 노드가 들고 몸 칸은 자리(차례)로 따른다.
- **(다) 섞음 — 열 틀 + 행마다 덮어쓰기** — `DataGrid` > 열 노드(머리 칸 + 셀 틀) · 행 노드(되풀이 수 · 행 꼴). 행 노드가 칸을 갖지 않으면 열 틀을 되풀이 수만큼 그리고, 칸을 가지면(합계 · 휴일 · 표본 값을 손으로 적은 행) 제 칸을 그린다.

### 견줌

노드 하나를 77B 로 셈한다(«지금 모델» 의 비용 축). 열 묶음 · 페이지네이션은 셈에서 뺀다(셋 다 같다).

| | (가) 열만 | (나) 행 × 칸 | **(다) 섞음** |
| --- | --- | --- | --- |
| «열 7 · 행 5 · 첫 행 강조 · 둘째 행 딤드» 를 짓는 걸음 | 팔레트 «그리드»(열 셋 · 행 다섯이 선다) → 열을 골라 복제 넷 → 머리 이름 일곱 → `rowTones` 배열 칸에 둘 = **14**(배열 칸 위젯을 새로 짓는다) | 팔레트 «그리드» → «열 더하기» 넷(행마다 칸을 더하는 새 행동) → 머리 이름 일곱 → 행 복제 둘(셋 → 다섯) → 행 꼴 둘 = **16** — 칸 35 개는 기본 «—» | 팔레트 «그리드» → 열 복제 넷 → 머리 이름 일곱 → 행 «한 행 떼어 내기» 둘 → 행 꼴 둘 = **16** |
| 열 하나 더하기 | 1(복제 — 셀 틀까지) | 1(«열 더하기» — 연산 행 수 + 1 개) · 손으로는 행 수 + 1 | 1(복제) · 제 칸을 가진 행이 있으면 그 행마다 칸 하나를 손으로 |
| 셀 종류 바꾸기(열 «과정명» 을 링크로) | 셀 틀 하나 | **칸 다섯을 하나씩**(또는 «열 전체에» 새 행동) | 셀 틀 하나 |
| 노드 수 — 행 5 × 열 7 | 1 + 7 + 7 = 15 | 1 + 7 + 5 + 35 + 35 = 83 | 1 + 7 + 7 + 3 = 18 |
| 노드 수 — 행 50 × 열 10 | 21 · 1.6KB | 1 + 10 + 50 + 500 + 500 = **1061 · 82KB** | 22 · 1.7KB(제 칸을 가진 행 하나마다 + 20) |
| 구조 트리 줄(행 50 × 열 10) | 21 | 1061 — 그리드 하나가 트리를 덮는다 | 22 |
| 잠금 | 열 하나를 고르면 그 열(머리 + 틀)만 | 열을 바꾸는 행동은 모든 행의 칸을 쥔다 — 남이 아무 행이나 고치면 막힌다 | 열 · 행 하나씩 |
| 실시간 방송(열 더하기 한 번) | 연산 1 | 연산 51 — 행 199 를 넘으면 `MAX_OPS_PER_EDIT` 에 걸린다 | 연산 1 |
| 캔버스 그림 수(뷰 렌더) | 행 × 열 | 행 × 열 | 행 × 열 — 셋이 같다(되풀이 행도 그린다) |
| 행마다 다른 값(표본 이름 · 날짜) | **못 한다** — 모든 행이 같은 글 | 칸마다 | 그 행만 제 칸을 갖는다 |
| 합계 행 · 휴일 행 | 못 한다(새 prop 장치를 따로) | 행 하나 | 행 하나(`kind: total` · 제 칸) |
| OD 표지 «첫 행의 링크 셀 옆» | 셀 틀 조각 — 사본이 아닌 첫 그림에 선다 | 그 칸의 조각 | 셀 틀 조각(첫 그림) |
| 새 개념 | 열 · 배열 칸 | 머리 행 · 몸 행 · 칸 · «열 더하기 · 열 전체에» 행동 | 열 · 행 · 칸 · 사본 |

### 고른 것 — (다)

**열은 노드다(머리 칸 + 셀 틀). 행도 노드다(되풀이 수 · 행 꼴). 칸은 행이 제 칸을 가질 때만 노드다.**

- (가)를 버린 까닭: 설계서 그리드는 거의 다 «첫 행 강조 · 합계 행 · 행마다 다른 표본 값» 가운데 하나를 갖는다. 행이 노드가 아니면 그 꼴마다 배열 prop 장치를 따로 짓고, 그 자리에 표지(7단계 Object Description)를 못 단다.
- (나)를 버린 까닭: 설계서가 «대표 몇 행 + 나머지 같은 꼴» 로 그리는 것을 노드 1000 개로 짓게 된다 — 트리가 덮이고, 열 하나를 고치는 일이 모든 행을 쥔다. 열이 노드가 아니라 열 폭 · 고정 · 정렬을 머리 칸이 들고 몸 칸은 자리로 따르는데, 그 자리 규칙이 모든 행에 걸린다(열을 옮기면 모든 행).
- (다)의 값: 흔한 그리드(행이 다 같은 꼴)는 (가)처럼 작고, 다른 행만 (나)처럼 그린다. 자리로 따르는 규칙(제 칸 ↔ 열)은 **제 칸을 가진 행에만** 걸린다 — 설계서에서 한 그리드에 한둘이다.

### 타입

| 타입 | 이름(`label`) | 설 자리(`placement`) | 뿌리 요소 | props | 몸통 · 구역 |
| --- | --- | --- | --- | --- | --- |
| `DataGrid` | 그리드(Q1) | 아무 데나 | `div` | `select`(`none` · `check` · `radio` · 기본 `none`) · `fixedColumns`(0 ~ 20 · 기본 0) · `empty` · `emptyText`(기본 «검색 결과가 없습니다.») · `loading` | `headStart` «머리 왼쪽» · `headEnd` «머리 오른쪽» · 몸통 «열»(`accepts` 열 · 열 묶음 · 기본 열 셋) · `rows` «행»(`accepts` 행 · 기본 행 하나 `repeat: 5`) · `footer` «바닥»(기본 `Pagination`) |
| `GridColumnGroup` | 열 묶음 | `DataGrid` 몸통 · `GridColumnGroup` 몸통 | `th`(묶음 머리) | `label` | 몸통 «열»(`accepts` 열 · 열 묶음 · `bodyHost: 'parent'`) |
| `GridColumn` | 열 | `DataGrid` 몸통 · `GridColumnGroup` 몸통 | `th`(머리 칸) | `label` · `required` · `align`(`start` · `center` · `end`) · `size`(`auto` · `short` · `medium` · `long`) · `sort`(`none` · `sortable` · `asc` · `desc`) · `tone`(`default` · `shaded`) · `numbering`(`off` · `asc` · `desc`) | 몸통 «셀»(무엇이든 · 기본 `Text «—»` · `bodyHost: 'parent'` — 셀 틀) |
| `GridRow` | 행 | `DataGrid` 의 `rows` | `tr`(첫 행) | `repeat`(1 ~ 50 · 기본 1) · `kind`(`data` · `total` · `gap`) · `tone`(`default` · `selected` · `dimmed` · `shaded`) | 몸통 «칸»(`accepts` 칸 — 비면 열 틀) |
| `GridCell` | 칸 | `GridRow` 몸통 | `td` | `span`(1 ~ 50 · 가로 칸 수) · `rowSpan`(1 ~ 50 · 세로) | 몸통 «내용»(무엇이든) |
| `Pagination` | 페이지네이션 | 아무 데나 | `nav` | `total`(0 ~ 1,000,000 · 기본 72) · `pageSize`(1 ~ 1000 · 기본 10) · `page`(1 ~ · 기본 1) · `sizeSelect`(기본 참) · `range`(기본 참) | 없다 |

```ts
// packages/schema/src/component/catalog/data.ts — 꼴만
export const DataGridDef = defineComponent({
  type: 'DataGrid',
  label: '그리드',
  description: '여러 건을 열과 행으로 늘어놓는 자료 표.',
  group: 'data',
  props: z.strictObject({
    select: z.enum(['none', 'check', 'radio']).default('none'),
    fixedColumns: z.number().int().min(0).max(20).default(0),
    empty: z.boolean().default(false),
    emptyText: z.string().default('검색 결과가 없습니다.'),
    loading: z.boolean().default(false),
  }),
  states: ['empty', 'loading'],
  zones: [
    { name: 'headStart', label: '머리 왼쪽' },
    { name: 'headEnd', label: '머리 오른쪽' },
    { name: 'body', label: '열', accepts: ['GridColumn', 'GridColumnGroup'],
      initial: [{ type: 'GridColumn', props: { label: '컬럼 1' } }, { type: 'GridColumn', props: { label: '컬럼 2' } }, { type: 'GridColumn', props: { label: '컬럼 3' } }] },
    { name: 'rows', label: '행', accepts: ['GridRow'], initial: [{ type: 'GridRow', props: { repeat: 5 } }] },
    { name: 'footer', label: '바닥', initial: [{ type: 'Pagination' }] },
  ],
})
```

- **열이 그리드의 몸통이다** — 그리드를 고르고 팔레트 «열» 을 누르면 몸통(«열») 끝에 선다(지금 넣기 규칙 «몸통이 있는 노드면 안»). 노드 «안» 띠에 끌어 놓는 것도 열이다. 행은 이름 붙은 구역이라 구조 트리 «행» 구역 줄을 고르고 넣는다.
- **셀 틀은 열의 몸통이다**(`bodyHost: 'parent'` — `TabPanel` 꼴). 열 뷰는 머리 칸만 그리고, 셀 틀은 그리드 뷰가 행마다 칸에 둔다. 셀 틀은 여러 조각을 받는다(`Field` 값 칸처럼 가로로 줄 선다 — `[OFF][홍길동]` · `[2][설정]`).
- **행이 칸을 안 가지면 열 틀이다.** 행이 칸을 하나라도 가지면 **제 칸만 그린다** — 칸이 열을 앞에서부터 차례로 덮고(`span` · `rowSpan`), 모자란 열은 빈 칸이다(합계 행의 뒤 빈 칸이 그 꼴이다). 한 행 안에서 «앞 칸은 제 것 · 뒤 칸은 틀» 로 섞지 않는다 — 합계 행이 틀을 물려받으면 안 되고, 섞으면 칸 하나를 지운 것이 «틀로 돌아간다» 인지 «빈 칸» 인지 갈린다.
- **`placement` 를 자리 여럿으로 넓힌다** — `{ type, zone } | readonly { type, zone }[]`. 열 · 열 묶음은 그리드 몸통과 열 묶음 몸통 두 자리에 선다. 검증(`misplaced-component`) · `fitRefusal` · 팔레트 탐침(`palette/placeable.ts` — 첫 자리에 놓아 잰다)이 목록을 읽는다.
- **열 묶음의 깊이가 머리 단이다** — 묶음 › 묶음 › 열이면 3단. 깊이 한도를 두지 않는다(셈이 깊이를 가리지 않는다) — 설계서의 가장 깊은 머리가 3단이다.
- **`fixedColumns` 는 수다 — 표지가 아니다.** 표 조각에 `data-wb-fixed-columns` 와 `--wb-node-datagrid-fixed`(SDK `dataGridTableAttrs` — `searchFormFieldsAttrs` 꼴)로 싣는다. `GridRow.repeat` · `GridCell.span` · `rowSpan` · `Pagination` 의 수도 그렇다(`prop-marks.test.tsx` 의 «불리언 · enum 만 표지» 규칙에 안 든다). enum(`select` · `align` · `size` · `sort` · `tone` · `numbering` · `kind`)과 불리언(`required` · `sizeSelect` · `range`)은 표지다.

### 되풀이 행 — 사본

행 노드 `repeat: 5` 는 화면에 행 다섯이고, 열 틀은 행마다 다시 그려진다. 같은 노드를 DOM 에 여럿 두면:

- 에디터의 노드 찾기가 첫 일치라(`findNodeElement`) 외곽선 · 마커는 첫 것에 서지만, `[data-wb-id]` 를 훑는 판정(`canvas-drop.ts` 의 형제 상자 · 범위 선택 · 안내선)이 같은 노드를 여러 상자로 센다.
- 뷰가 노드 id 로 짓는 HTML `id`(`Field` 의 `<id>-label` · 폼 표 제목)가 겹친다 — `aria-labelledby` 가 첫 것을 가리킨다.

**그래서 렌더러가 «사본» 을 그린다.**

| 무엇 | 원본(첫 그림) | 사본 |
| --- | --- | --- |
| `data-wb-id` | 있다 | **없다** — `data-wb-copy-of="<원본 id>"` |
| `data-wb-component` · `-variant` · `-state` · 표지 | 있다 | **같다** — 테마 CSS 가 같게 듣는다 |
| 뷰가 받는 `nodeId` | 노드 id | `<노드 id>~<사본 열쇠>` — 뷰가 짓는 HTML `id` 가 안 겹친다 |
| 상호작용 핸들러(뷰 모드 · 내보낸 번들) | 있다 | **같다** — 셋째 행의 링크를 눌러도 그 상호작용이 돈다 |
| 마커 · 외곽선 · 끌기 판정 | 선다 | 안 선다(훑기에 안 걸린다) |
| 렌더러 노드 캐시(`nodeCacheFor`) | 탄다 | 사본 열쇠를 캐시 열쇠에 넣는다(구현이 정한다) |

- **원본이 서는 자리** — 셀 틀의 원본은 **칸을 안 가진 첫 데이터 행**의 그 열 칸이다. 그런 행이 없으면(모든 행이 제 칸을 가짐 · `empty` · `loading`) 셀 틀은 캔버스에 원본이 없다 — 구조 트리로 고른다. 칸을 가진 행이 `repeat` 2 이상이면 첫 줄이 원본, 나머지가 사본이다.
- 설계서의 OD 표지가 «첫 행 셀» 에 붙는 꼴과 맞는다 — 셀 틀 조각에 단 표지가 첫 행에 선다.
- **계약에 더하는 것**(«7»): `ViewItem.copy(key)` — 그 자식(과 몸통을 부모에게 맡긴 자식이면 그 몸통)을 사본으로 다시 그린 것을 돌려준다.

### 비용 — 다시 잴 판

| 축 | 잴 판 | 견줄 것 |
| --- | --- | --- |
| 캔버스 그림 | 행 50 × 열 10 그리드 한 판에서 셀 틀 글 하나를 고친 뒤 화면이 서기까지(`apps/web/build-test/canvas-cost.test.ts` 꼴) | 같은 페이지의 `Text` 500 판 |
| 문서 크기 · 방송 | 행 50 × 열 10 · 제 칸 행 둘 — 문서 JSON 바이트 · 열 더하기의 연산 수 | (나) 꼴 문서(1061 노드) |
| 잠금 판정 | `ws-lock-cost` 꼴 판에 그리드 열 개 · 열 하나씩 쥔 사람 다섯 | 지금 상한 |

---

## 2. `List` 와의 관계

### 후보

- **(가) `List` 를 넓힌다** — 타입 이름 `List` 를 두고 `columns: string[]` 을 열 노드로, `items` 를 행 노드로 바꾼다. 이름을 «그리드» 로.
- **(나) 새 `DataGrid` 를 두고 `List` 를 걷는다** — `0032` 가 사용자 개발 DB 의 `List` 를 옮긴다.
- **(다) 둘 다 둔다** — `List`(열 이름 · «—») 옆에 `DataGrid`.

| | (가) | **(나)** | (다) |
| --- | --- | --- | --- |
| 구조 트리 줄(`타입 (별칭) 요약`) | «List 과정명 · 기수» — 팔레트 «그리드» 와 이름이 갈린다 | «DataGrid» | 둘 |
| props · 구역 · 뷰 | 전부 바뀐다(옛 `columns` · `items` · `pagination` · `selectable` · `selected` · `disabled` 가 사라진다) | 새로 | 새로 + 옛 것 그대로 |
| 고칠 코드 | `List` 의 props 를 쓰는 33 파일 | 86 파일(`type: 'List'` 를 맨 노드로 쓰는 픽스처까지 이름을 바꾼다) | 0 |
| 팔레트 | «그리드» 하나 | «그리드» 하나 | «목록» · «그리드» 둘 — 무엇을 써야 하나 묻게 된다 |
| 정본 | §5.1 의 정의 예(`ListDef`)가 옛 모양으로 남지 않게 고친다 | 같다 + 예를 새 타입으로 | 둘 다 적는다 |
| `0032` | 같은 타입 안에서 props · 구역을 옮긴다 | 타입째 옮긴다(노드 id 를 지킨다) | 없다 |

### 고른 것 — (나)

**`DataGrid` 를 새로 두고 `List` 를 걷는다. `0032-list-data-grid` 가 옮긴다(Q5).**

- (가)를 버린 까닭: 바뀌지 않는 것이 이름뿐이다. 그 이름이 구조 트리 줄 · MCP 노드 개요(`rowLabel`) · 페이지 JSON 에 서서 «List» 가 표를 부른다. 고칠 파일 수의 차(33 ↔ 86)는 대부분 픽스처의 타입 글자다.
- (다)를 버린 까닭: «—» 만 그리는 `List` 를 남길 까닭이 없다. 정본 §4.3 의 «같은 `List` 노드가 한 테마에서는 테이블로, 다른 테마에서는 카드 그리드로» 는 테마 뷰가 `DataGrid` 를 카드로 그리는 문장으로 옮긴다(열 머리 · 셀 틀이 노드라 카드 뷰도 짓는다).
- **이름 겹침** — 배치 `Grid` 의 `label` 을 «격자 배치» 로 바꾼다(Q1). 타입 이름은 그대로(`Grid`). 바뀌는 자리: 팔레트 카드 · 상호작용 문장(`describe.ts` 가 `label` 을 쓴다) · `/llms.txt` · `label: '그리드'` 를 단언하는 케이스(`packages/cli/test/snapshot-fixture.ts`).

### `0032-list-data-grid`(Q5)

| 옛 `List` | 새 `DataGrid` |
| --- | --- |
| 노드 id · 별칭 · 표지 · 상태 보임 · 상호작용 · 몫 · 변형 | 그대로(같은 id — 상호작용의 `target` 이 그대로 맞다). 변형 `featured` · `compact` 는 기본테마가 `DataGrid` 에 같은 이름으로 선언한다 |
| `headStart` · `headEnd` | 그대로 |
| `columns: string[]` | 열마다 `GridColumn { label }` + 셀 틀 `Text «—»`(빈 배열이면 열 없음) |
| `items: n` | `n ≥ 1` 이면 `GridRow { repeat: n }` 하나, 0 이면 행 없음 |
| `pagination: true` | `footer` 에 `Pagination`(기본 props) |
| `selectable: true` | `select: 'check'` |
| `selected: true` | 그 행 `tone: 'selected'` |
| `disabled: true` | 그 행 `tone: 'dimmed'` |
| `loading` · `empty` | 그대로(`emptyText` 는 기본값 — 옛 문구 «데이터가 없습니다» 는 뷰에 박혀 있었다) |

- **자리** — 문서가 사는 자리 전부: 페이지 · 레이아웃 · 프로젝트 모듈 · 개인 모듈 · 스냅샷 payload 의 `pages[]` · `layouts[]`(`0028` · `0029` · `0031` 과 같은 자리 — 남은 옛 판 0 셈은 키를 가리지 않고 걷는다 · `apps/api/test/node-zones-migration.test.ts` 의 `formsIn` 꼴).
- **`head_seq` 를 올린다** — 옛 바탕의 `…/props/columns` 편집이 새 문서에 `stale` 로 거절되게(`0031` 과 같다). 새 노드 id 는 그 문서 안에서 안 겹치게(`n_` + 소문자 hex 12).
- **되돌리기(`down`)** — 열 이름 · 행 수(첫 행의 `repeat` 합) · `select` · `footer` 유무 · 행 꼴로 `List` 를 다시 짓는다. 셀 틀 · 제 칸 · 열 묶음 · 열 props 는 버린다(배포가 없어 받는다).
- **사용자 개발 DB** — 병합 전에 덤프를 뜨고 `0032` 를 적용한다(코디네이터 몫 — 로드맵 진행 기록의 절차).
- **판 올림** — 타입을 걷어 옛 문서가 맞지 않으므로 `CURRENT_DOCUMENT_VERSION` 을 4 → 5 로 올린다(구역 · 타입을 빼는 것은 판을 올린다 — 2단계 «카탈로그 계약»). `0029` 의 판 4 와 같은 길이다 — **판 4 → 5 단계는 런타임 사슬(`packages/schema/src/migrate.ts` 의 `MIGRATIONS`)에 없다.** 저장된 문서는 `0032` 가 한 번 옮기고, 옛 판을 들고 오는 입구(페이지 JSON 가져오기 · 클립보드 봉투)는 거절된다.
- **배포 전에 연 옛 클라이언트 탭** — `0032` 뒤 «알 수 없는 컴포넌트 타입: DataGrid» 를 그린다(4단계 이월 L2 와 같은 꼴 — 새로고침이 푼다).

---

## 3. 셀 종류

**셀 안은 지금 조각이다 — 새 조각을 짓지 않는다.**

| 설계서의 셀 | 짓는 것 |
| --- | --- |
| 글 · 두 줄 | `Text`(내용에 줄바꿈 — `content` 는 여러 줄 칸) · 말줄임은 테마(`DataGrid` 칸의 `text-overflow`) |
| 링크(굵은 밑줄) | `Link` |
| 단추(채움 · 테두리) · `[이력조회]` | `Button`(변형 `primary` · `default`) |
| 셀렉트 · 검색 셀렉트 | `Select` |
| 입력 · 숫자 · 날짜 · `[readonly][검색]` · 숫자 + `[설정]` | `Input` · `DateInput` · `Input readonly` + `Button` · `Affix` + `Button` — 셀 틀에 조각 여럿 |
| 세그먼트 `[오프라인][온라인]` | `RadioGroup`(기본테마 변형 `segment`) |
| 체크 · 라디오(정답 열) | `CheckboxGroup` · `RadioGroup radio` |
| 칩 묶음 `[질병 1][경조사 1]` | `Chip`(`removable` 끔) 여럿 |
| 배지 `[OFF]` · `[ON]` 알약 | **지금은** `Chip` 또는 `Placeholder`(바탕색 · 모서리 · 글 색) — 9(작은 요소 · 배지)가 지을 때 셀 안에서도 그대로 쓴다(셀은 무엇이든 받는다) |
| 색 글자(오류 빨강 · 정상 파랑) | `Affix`(`tone` `danger` · `primary`) — 넷째 색(초록 · 보라)부터는 `Placeholder` 글 색. 9 가 `Text` 에 색조를 더하면 그것으로 옮긴다 |
| 기호 ○ ✕ ◎ … (색) | `Placeholder`(테두리 없음 · 글 색 · 글) 또는 `Affix` |
| «-» 빈 값 | `Text «-»` |
| «No» 역순 번호 | **열의 `numbering`(`asc` · `desc`)** — 행마다 다른 수라 셀 틀로 못 짓는다. 켜면 셀 틀을 안 그리고(lint `ignored-template`) 데이터 행(`kind: data`)을 위에서부터 센 번호를 그린다. `desc` 는 데이터 행 수에서 거꾸로 |

- **입력 조각의 접근 이름** — 칸 안의 값 조각(`VALUE_PIECES`)은 렌더러가 그 열의 머리 이름을 필드 이름으로 준다(`fieldNames` 를 넓힌다 — `Field` 값 칸과 같은 길). 사본은 « (n행)» 을 붙인다. 표 칸 안 입력만 훑는 보조 기술이 «단위기간명 (2행)» 을 읽는다.
- **흔한 다른 꼴로 바꾸기**(`Text` → `Link`) — «종류 바꾸기…»(`apps/web/src/edit/change-kind.ts` 의 `KIND_TYPES`)는 입력 조각 일곱만 바꾼다. 글 조각(`Text` · `Link` · `Button` · `Chip` · `Affix`) 사이 바꾸기는 이 단계에 넣지 않는다 — 지우고 넣는다(prop 이름이 갈려 옮길 규칙이 따로 든다 — `content` ↔ `label`).

## 4. 머리 · 행 꼴

| 꼴 | 무엇으로 | prop · 노드 · 테마 |
| --- | --- | --- |
| 머리 이름 · 필수 `*` · 정렬 `▼` | 열의 `label` · `required` · `sort` | prop — `required` · `sort` 는 표지(`sort` 의 `asc` · `desc` 는 `aria-sort` 도) |
| 머리 두 줄(«* 분류 / 아이디») | 테마가 머리 글을 접는다 · 손으로 끊으려면 `label` 에 줄바꿈(편집 칸은 한 줄 — 이 단계는 접힘만) | 테마 |
| 2 ~ 3단 병합 머리 | `GridColumnGroup` 노드 — 묶음 머리 칸 `colspan` = 아래 열 수, 묶음 아닌 열의 `rowspan` = 남은 단 수. 셈은 SDK `gridLayout`(«7») | 노드 |
| 열 폭 | 열의 `size`(`auto` · `short` · `medium` · `long`) — 실제 길이는 테마(`Input.size` 와 같은 낱말) | prop · 표지 |
| 정렬(칸 안 글) | 열의 `align` | prop · 표지 |
| 열 음영(주말 · 공휴일) | 열의 `tone: shaded` — 머리 · 그 열 칸 전부 | prop · 표지 |
| 선택 열(체크 · 라디오) | 그리드의 `select` — 뷰가 맨 앞에 칸(`data-wb-cell="check"` · `"radio"`)을 그린다. 머리: 체크면 «모두 고르기» 체크(접근 이름), 라디오면 «선택» 글. 행 칸은 그 행 `tone: selected` 면 켜지고 `dimmed` 면 꺼진 모양 | prop |
| 합계 행 | `GridRow { kind: 'total' }` + 제 칸(«합계» `span` 5 · 수치 칸). 선택 칸 · 번호는 비운다 | 노드 |
| 행 생략 띠(지그재그) | `GridRow { kind: 'gap' }` — 칸 · `repeat` 를 안 읽고 전폭 한 줄(«⋯» · 테마가 지그재그로) | 노드 · 테마 |
| 빈 결과 행 | 그리드 `empty` 상태 — 행 노드를 안 그리고 전폭 한 줄 `emptyText`(`data-wb-part="empty"`). 상태라 7단계 «상태별 속성» 이전에도 화면 상태로 켠다(상태 보임) | 상태 + prop |
| 불러오는 중 | 그리드 `loading` 상태 — 칸마다 막대(`skeleton`) | 상태 |
| 행 강조 · 딤드 · 음영 | 행의 `tone` — `selected`(연한 강조 · 선택 칸 켬) · `dimmed`(흐림 · 선택 칸 끔 — 휴일 행의 비활성 체크) · `shaded`(회색) | prop · 표지. 7단계가 상태마다 바꾼다 |
| 휴일 행의 빨간 글 · «-» | 그 행이 제 칸을 갖는다(`Affix danger` · `Text «-»`) | 노드 |
| 행렬 표(행 머리 rowspan 3 · 전체 rowspan 한 칸) | 행마다 제 칸 + `GridCell.rowSpan` — 아래 행의 칸은 위에서 덮인 열을 건너뛰고 앞에서부터 덮는다(HTML 표와 같은 규칙) | 노드 |
| 고정 열 + 가로 스크롤 | 그리드의 `fixedColumns` — 선택 열 · 번호 열을 포함해 왼쪽부터 센 잎 열 수. 표는 `data-wb-part="scroll"` 상자 안(`overflow-x: auto`) | prop(수) |
| 행 줄무늬 | 테마(지금 `rowAlt` 꼴) | 테마 |

- **수 prop 은 표지가 아니다** — `fixedColumns` · `repeat` · `span` · `rowSpan` 은 조각 속성 · 변수(«1» «타입»)다. `rowSpan` · `span` 은 칸 뷰가 `td` 의 `rowSpan` · `colSpan` 으로 바로 싣는다.
- **고정 열의 `left`** — 고정 열이 둘 이상이면 앞 열 폭의 합을 CSS 만으로 모른다. SDK 기본 뷰가 첫 줄 칸 폭을 재어(레이아웃 이펙트) 고정 열 칸마다 `left` 를 싣는다. `position: sticky` 는 스크롤 상자 기준이다.

## 5. 페이지네이션 바

### 후보

- **(가) 그리드의 prop**(`List.pagination` 의 넓힘) — `pagination` · `total` · `pageSize` · `page` 를 그리드가 들고 뷰가 바를 그린다.
- **(나) 그리드의 «바닥» 구역 + 새 컴포넌트 `Pagination`** — 바는 노드다. 새 그리드는 바닥에 바 하나를 들고 선다.
- **(다) 바의 세 구역을 노드로** — `Pagination` 이 구역 셋(행 수 셀렉트 · 쪽 번호 · 범위 글)을 갖고 셋이 다 노드다.

| | (가) | **(나)** | (다) |
| --- | --- | --- | --- |
| 바를 누르면 | 그리드가 골라진다 — 속성 패널에 그리드 props 와 바 props 가 섞인다 | 바가 골라진다 | 셀렉트 · 글이 따로 골라진다 |
| 바 없는 그리드(건수만인 팝업) | 끄는 스위치 | 바를 지운다 | 같다 |
| 상태로 바만 숨기기 · 모듈 · 표지 | 못 한다 | 바 하나 | 조각마다 |
| 범위 글의 수 | 그리드 props | 바 props | 셀렉트 노드의 고른 값과 범위 글이 서로를 못 읽는다 — 두 값이 어긋난다 |
| 노드 | 0 | 1 | 4 |

### 고른 것 — (나)

**`Pagination` 은 따로 선 컴포넌트이고, 새 그리드의 «바닥» 구역에 하나 든다.** 바는 그리드와 함께 옮겨지고 숨는다. 그리드 밖(마스터-디테일의 패널 바닥)에도 선다.

- **세 구역은 조각이다**(노드가 아니다) — `div[data-wb-part=size]`(행 수 셀렉트 모양 «10 ▼» — `sizeSelect` 를 끄면 없다) · `div[data-wb-part=pages]`(`« ‹ 1 2 … 9 › »` — 지금 쪽 `aria-current="page"` · 밑줄) · `div[data-wb-part=range]`(`range` 를 끄면 없다). 뿌리는 `nav[aria-label="쪽 넘김"]`.
- **OD 표지 «행 수 셀렉트 옆»** 은 조각 기준 표지다 — 4단계가 `Field` 의 라벨 칸 · 값 칸에 남긴 것과 같은 자리(«7단계가 조각 기준 상자를 정한다»). 바 노드에 다는 표지는 지금도 선다.
- **범위 글의 수는 바의 props 로 셈한다**(Q3) — `from = (page − 1) × pageSize + 1` · `to = min(page × pageSize, total)` · «`from` - `to` (총 `total` 항목 중)». `total` 0 이면 «0 - 0 (총 0 항목 중)». 쪽 수 = `max(1, ⌈total / pageSize⌉)` · 쪽 번호는 지금 쪽 둘레 아홉까지. 행 수 셀렉트가 보이는 값은 `pageSize`.
- **그리드의 행 수와 잇지 않는다** — 설계서는 행 셋 · «총 3건» 을 그리면서 바에 «1 - 50 (총 72 항목 중)» 을 적는다. 그리드 행은 «대표 행» 이고 바의 수는 «검색 결과 전체» 다 — 다른 뜻이다.
- 결과 머리줄의 «검색결과 총 N건» 은 지금처럼 `headStart` 의 `Text` 다(바의 `total` 과 잇지 않는다 — 머리줄은 범례 · 복합 요약 «총 10명 · 공가합계 30.5회» 도 든다).

## 6. 좁은 창 · 넓은 표

**접지 않는다 — 표 칸만 가로로 스크롤한다.** 결과 머리줄 · 바는 스크롤 밖이다(창 폭을 따른다).

| 창 | 열 열둘인 목록 | 출석부(잎 열 쉰) |
| --- | --- | --- |
| 1280 | 대개 한 화면 — 넘치면 스크롤 | 고정 열 열둘 + 날짜 열 스크롤 |
| 720(PPTX 캡처 폭) | 스크롤 상자 | 같다 |
| 390 | 스크롤 상자 · 고정 열이 창의 대부분을 먹으면 테마가 고정을 푼다(기본테마: 640px 아래에서 `fixedColumns` 를 안 듣는다) | 같다 |

- **테마의 몫이다** — 계약이 정하는 것은 «표는 `scroll` 조각 안 · 머리줄 · 바는 밖» 뿐이다. 카드로 접는 테마도 짓는다(열 머리 · 셀 틀이 노드라 뷰가 «라벨 | 값» 카드로 그릴 수 있다).
- **HTML 번들** — 같은 스크롤 상자다(가로로 굴린다).
- **PPTX — 펼쳐 찍는다(Q2).** 캡처는 문서 폭을 재어 찍는다(«지금 모델»). 스크롤 상자를 그대로 두면 문서 폭이 720 이라 표가 오른쪽에서 잘리고 스크롤 막대가 찍힌다. 찍는 판(`screen-render-chromium.ts`)이 문서에 표지(`<html data-wb-capture>`)를 달며 SDK 의 찍는 판 시트(`CAPTURE_CSS` — `@layer`)를 싣고, 그 시트가 표지 아래에서 스크롤 상자를 푼다(`overflow: visible` · 고정 열 `position: static`). 기본 뷰 CSS 에 넣지 않는 까닭은 jsdom 이 `@layer` 든 시트를 통째로 버려서다 — 표가 문서를 넓히고 그림이 그 폭으로 찍힌다(슬라이드에서는 줄어 보인다). **넓이 상한**(720 × 8192 px²)이 넓은 표의 긴 화면을 거절할 수 있다 — 폭 2000px 이면 높이 2949px 까지다(넘으면 지금처럼 그 화면만 «화면이 너무 큽니다» 로 빠진다).
- **고정 열의 뜻** — 가로 스크롤해도 왼쪽 `fixedColumns` 열(선택 · 번호 포함)이 제자리다. 찍은 그림 · 스크롤 0 에서는 고정과 아닌 열이 같아 보인다.

넘침은 `wb-theme shots` 가 실 Chromium 에서 잰다(«7»).

## 7. 테마 뷰 계약 · 기본테마

### 기본 뷰(SDK)

| 뷰 | DOM |
| --- | --- |
| `DataGridView`(새) | `Root div` > [`div[data-wb-part=head]` > `Zone headStart` · `Zone headEnd`] · `div[data-wb-part=scroll]` > `table[data-wb-part=table]{...dataGridTableAttrs}` > `thead`(`gridLayout` 의 머리 줄마다 `tr` — 선택 머리 칸 · 열 · 열 묶음의 원소) · `<Zone name="rows" as="tbody">`(행 원소) — `empty` 면 `tbody` > 전폭 `td[data-wb-part=empty]` · [`Zone footer data-wb-part=footer`]. 행 뷰 · 열 뷰가 읽을 배치를 `<GridProvider value={gridLayout(...)}>` 로 내린다 |
| `GridColumnView`(새) | `Root th scope=col`(`useGridHead()` 의 `colSpan` · `rowSpan` · `aria-sort`) > 머리 글 · `span[data-wb-part=required]` · `span[data-wb-part=sort]` |
| `GridColumnGroupView`(새) | `Root th scope=colgroup`(`useGridHead()` 의 `colSpan` · `rowSpan`) > 머리 글 |
| `GridRowView`(새) | `useGridRow()` 의 줄마다 — 첫 줄 `Root tr`, 나머지 `tr` 사본(`copyAttrs`). 칸은 선택 칸 · 번호 칸 · 셀 틀(원본 · 사본) · 제 칸(원본 · 사본) · 빈 칸. `gap` 이면 전폭 `td[data-wb-part=gap]` |
| `GridCellView`(새) | `Root td colSpan rowSpan` > 몸통 |
| `PaginationView`(새) | `Root nav[aria-label]` > `size` · `pages` · `range` 조각(«5») |
| `ListView` | 걷는다 |

**계약에 더하는 것**(SDK 1.6.0 → 1.7.0 — 카탈로그 타입이 바뀌어 테마의 `views` 키 검사가 새 타입을 알아야 하고, 사본 · 구역 자식이 새 계약이다):

| 더하는 것 | 뜻 |
| --- | --- |
| `ViewProps.zoneItems: Record<구역, ViewItem[]>` | 이름 붙은 구역도 자식마다(보이는 것만 · 문서 차례) — `items` 가 몸통의 것이듯. 그리드 뷰가 행 노드의 props 를 읽어 배치를 셈한다 |
| `ViewItem.props` | 그 자식의 검증을 지난 props(겹layer 가 덮은 값) |
| `ViewItem.items` | 그 자식이 몸통을 부모에게 맡긴 타입이면 그 몸통의 자식(다시 `ViewItem`) — 열 묶음 › 열 › 셀 틀, 행 › 칸 |
| `ViewItem.copy(key)` | 그 자식(맡긴 몸통 포함)을 사본으로 다시 그린 `{ element, content }`(«1» «사본») |
| `gridLayout(columns, rows, props)` · `GridProvider` · `useGridHead()` · `useGridRow()` · `copyAttrs` · `dataGridTableAttrs` | 머리 줄(`colspan` · `rowspan`) · 몸 줄(행마다 · 되풀이마다 칸 차례 · 원본 자리 · 번호 · `rowSpan` 덮임)을 한 셈으로. 폼 표의 `pairRows` 와 같은 자세 — 순수 함수 · 단위 케이스 |

- **행 · 열 뷰는 그리드 뷰가 내린 배치를 읽는다** — 행의 `tr` 은 그 행 노드의 뿌리라 그리드 뷰가 칸을 끼울 수 없다(남의 뷰 속을 못 연다). 그래서 칸 차례를 행 뷰가 `useGridRow()` 로 읽어 제 `tr` 안에 그린다. 머리 칸의 `colspan` · `rowspan` 도 같은 까닭으로 `useGridHead()`.
- **`<table>` 이다** — 자료 표라 `th scope` · `aria-sort` 가 뜻을 낸다. 셀 안 컨트롤은 «3» 의 필드 이름을 받는다. 폼 표(4단계)가 `<table>` 을 버린 까닭(값 칸에 하위 표 · `Field` 뿌리가 `td` 가 못 됨)은 여기 없다 — 칸 뿌리가 `td` 인 노드(`GridCell`)이고 셀 틀은 `td` 안의 조각이다.
- **빈 구역 칸** — «열» · «행» 구역은 받는 타입이 있어 열 · 행을 끌 때만 칸이 선다. 그 칸이 `thead` · `tbody` 안에 `div` 로 서는 판을 실브라우저로 잰다(표 배치가 익명 칸으로 감싼다 — 깨지면 그 구역의 칸을 `tr > td colspan` 꼴로 그린다).

### 기본테마(`system-admin`)

- **뷰 없이 `theme.css` 로 꾸민다** — `[data-wb-component="List"]` 규칙을 `DataGrid` · `GridColumn` · `GridRow` · `GridCell` · `Pagination` 으로 옮기고 넓힌다: 머리 `--wb-semantic-canvas` 바탕 · 머리 글 `h6` · 칸 선 `--wb-semantic-border` · 강조 행 `--wb-semantic-primarySoft` · 딤드 행 흐림 · 음영 `--wb-semantic-canvas` · 합계 행 굵은 글 + 윗선 · 생략 띠 · 정렬 `▼` · 필수 `*`(빨강 — 머리 글 앞) · 바 세 구역(왼쪽 · 가운데 · 오른쪽 · 지금 쪽 밑줄) · 640px 아래 고정 풀기.
- **새 토큰은 두지 않는다** — 지금 semantic 토큰으로 선다(폼 표와 같다).
- 변형 `featured` · `compact` 를 `DataGrid` 에 선언한다(`0032` 가 옮긴 변형). 배치 `Grid` 의 이름만 바뀌고 CSS 는 그대로다.
- 판을 올리고(1.6.0 → 1.7.0) `checksums.json` 에 새 줄을 더한다.
- **옛 판 기본테마(1.6.0 이하)에 고정된 프로젝트** — 그 테마는 `List` 를 그리던 CSS 만 있어 `DataGrid` 가 SDK 기본 CSS 로만 선다(칸 선 · 머리 바탕 없이 읽을 수 있는 표). 테마를 올리면 닫힌다(4단계 이월 L4 와 같은 꼴).

### SDK 기본 CSS(특이도 0)

`table` 꽉 참 · 칸 안쪽 여백 · 스크롤 상자 · 고정 열 `position: sticky` · 머리 칸 아래 정렬 · 셀 틀 조각 가로 줄(`Field` 값 칸과 같은 꼴) · 선택 칸 폭 1px · 생략 띠 · 바 세 구역 양끝 정렬 (찍는 판의 스크롤 풀기는 따로 낸 `CAPTURE_CSS` — «6»).

### 스타터 템플릿 · 갤러리 · `wb-theme check` · `shots`

- **스타터 템플릿**(`packages/theme-kit/template`) — `template/src/views/data.tsx` 가 SDK 파일을 옮긴 것이라 새 뷰가 저절로 온다. `src/index.tsx` 의 `views` 표 · `SKILL.md` 의 카탈로그 목록에 새 타입을 적고 «행 · 열 뷰는 `useGridRow` · `useGridHead` 로 읽는다» 한 줄을 더한다.
- **갤러리**(`packages/theme-gallery/src/samples.ts`) — `DataGrid` 표본: ① 흔한 목록(No · 링크 · 글 두 줄 · 단추 열 · 행 다섯 · 결과 머리줄 · 바) ② 체크 선택 + 강조 행 + 딤드 행 + 합계 행 ③ 2단 병합 머리 + 정렬 · 필수 머리 ④ 넓은 표(잎 열 서른 · `fixedColumns` 3 · 열 음영 · 기호 셀) ⑤ 빈 결과 ⑥ 라디오 선택 팝업 그리드(바 없음) ⑦ 편집 그리드(셀 틀에 입력 · 셀렉트 · `[삭제]` · 머리 오른쪽 `[추가]`). `Pagination` 표본(쪽 1 · 지금 쪽 가운데 · 0 건). `List` 표본은 걷는다.
- **`wb-theme check`**(jsdom — `packages/theme-kit/src/check.ts`) — 새 규칙: ① 머리 칸 수 · `colspan` 합이 `gridLayout` 셈과 같다(머리 줄마다) ② 행 `tr` 의 칸 수(`colspan` 합)가 잎 열 수(+ 선택 칸)와 같다(되풀이마다) ③ 원본 셀 틀이 한 번만 `data-wb-id` 로 서고 사본은 `data-wb-copy-of` 다 ④ `rows` · `footer` 구역이 내용이 들면 그려진다(2단계 규칙이 저절로 잰다). 규칙마다 «뷰를 한 곳만 바꾼 테마 뷰»(칸 하나 빼기 · `colspan` 안 싣기 · `Root` 를 되풀이마다 그리기)로 깬다(4단계 RV-FT M1 의 교훈 — `docs/superpowers/plans/2026-10-25-rv-ft-report.md`).
- **`wb-theme shots`**(실 Chromium) — ① 넓은 표가 문서를 안 넓힌다(`scrollWidth` = 창 폭 · 1280 · 720 · 390) ② 스크롤 상자를 끝까지 굴려도 고정 열의 화면 자리가 그대로다 ③ 머리 · 칸 글이 칸 밖으로 넘치지 않는다(글자 노드 `Range` 오른끝) ④ 찍는 판 표지에서 표 전체 폭이 문서 폭이다.
- **개수 하한** — `dev.test.ts` 의 `kinds` 30 → 35(− `List` + 여섯) · `.sample-card` 수 · `shots.test.ts` 폴백 항목 목록. `palette.test.ts` 카드 ≥ 17 은 그대로 참(둘 다 `test:build:serial` 갈래 — AGENTS.md 「수를 셀 때」 덧붙임).

## 8. 에디터

이름으로 적는 입구는 `git grep` 으로 센 지금 것이다(끝 절) — 편집 단축키(`apps/web/src/edit/editor-shortcuts.ts` 의 `edits: true`): 되돌리기 · 다시 실행 · 고른 노드 삭제 · 복제(바로 뒤에 — Cmd+D) · 위로 · 아래로(Alt+↑ ↓) · 내어쓰기 · 들여쓰기(Alt+Shift+← →) · 별칭 바꾸기(F2). 구조 트리 줄 `…`(`apps/web/src/panels/tree-row-actions.tsx`): 별칭 바꾸기 · 종류 바꾸기…(입력 조각만) · 모듈로 저장… · 위로 · 아래로 · 들여쓰기 · 내어쓰기 · 삭제. 팔레트 넣기의 대상 표(`palette/palette-add.ts` 머리말).

| 하는 일 | 걸음 | 새로 짓나 |
| --- | --- | --- |
| 그리드 넣기 | 팔레트 «그리드» — 열 셋(셀 틀 `Text «—»`) · 행 하나(`repeat` 5) · 바가 선다(`initial` 이 겹으로 돈다 — `apps/web/src/edit/create-node.ts`) | 없음 |
| 열 더하기 | 열을 골라 Cmd+D(셀 틀째 복제) · 그리드를 골라 팔레트 «열»(몸통 끝) · 구조 트리 «열» 구역 줄을 골라 팔레트 «열» | **열을 골라 팔레트 «열»** — 지금은 «안»(셀 틀)에 넣으려다 설 자리에 걸려 거절된다. «안» 이 받는 타입 · 설 자리에 걸리면 «뒤» 로 물러선다(`paletteAddTarget`) |
| 열 지우기 · 옮기기 | Delete · Alt+↑ ↓ · 트리 끌기 · 머리 칸 캔버스 끌기(머리 칸들이 한 `tr` 안 형제라 가로 띠) | 없음 |
| 열 묶기 · 풀기 | 묶을 첫 열 앞에 팔레트 «열 묶음» → 뒤 열들을 들여쓰기(앞 형제 «열 묶음» 몸통으로 — 열 → 열 들여쓰기는 설 자리에 걸려 거절) · 내어쓰기로 푼다 | 없음 |
| 셀 틀 바꾸기 | 틀 행의 칸 안 조각을 고르고 지우고 · 팔레트로 넣기 · 첫 행 칸에 끌어 놓기 | **사본 칸을 누르면 원본을 고른다** · **칸의 빈 자리를 누르면 그 열을 고른다** — 틀 칸 `td` 에 `data-wb-copy-of="<열 id>"` 를 달고 캔버스의 고르기가 그것을 원본으로 맞춘다 |
| 행 수 | 행을 골라 «되풀이» 칸 | 없음 |
| 첫 행 강조 · 둘째 행 딤드 | 행을 골라 **«한 행 떼어 내기»**(`repeat` n → 앞에 `repeat` 1 행 + 뒤 n − 1) 두 번 → 앞 둘의 «행 꼴» | **줄 행동 «한 행 떼어 내기» 새로 짓는다**(행 줄 `…` · `repeat` ≥ 2 일 때만) |
| 행마다 다른 표본 값 · 휴일 행 · 합계 행 | 행을 골라 **«열 틀로 칸 짓기»**(빈 행에 열마다 `GridCell` + 셀 틀 복사) → 칸 고치기 · 합계면 «종류» 합계 + 앞 칸 «가로 칸 수» | **줄 행동 «열 틀로 칸 짓기» 새로 짓는다**(행 줄 `…` · 칸 없는 행만) |
| 선택 열 · 고정 열 · 빈 결과 | 그리드의 «선택 열» · «고정 열 수» · «빈 상태» | 없음 |
| 바 | 바를 골라 «총 건수» · «쪽 크기» · «지금 쪽» · 지우기 | 없음 |

- **받는 규칙(`accepts`)이 생긴다** — 그리드 몸통(열 · 열 묶음) · «행»(행) · 열 묶음 몸통(열 · 열 묶음) · 행 몸통(칸). 부모를 바꾸는 입구 전부(끌기 · 팔레트 넣기 · 붙이기 · 모듈 넣기 · 들여쓰기 · 내어쓰기)는 이미 `fitRefusal` 을 지난다(«지금 모델») — 새 입구 «한 행 떼어 내기» · «열 틀로 칸 짓기» 는 부모를 안 바꾼다(같은 구역 안 · 자기 몸통). 거절 문장(카탈로그 라벨로 짓는 공용 꼴): «그리드에는 열 · 열 묶음만 놓을 수 있습니다» · «그리드 행에는 행만 놓을 수 있습니다» · «행에는 칸만 놓을 수 있습니다» · «열은 그리드 · 열 묶음 안에만 놓을 수 있습니다».
- **들여쓰기가 열 묶음을 짓는 길이 된다** — `structure-actions.ts` 의 들여쓰기는 앞 형제의 몸통으로 넣는다. 앞 형제가 열이면 그 셀 틀(무엇이든 받는다)이 아니라 열의 설 자리에 걸려 거절된다 — 셀 틀에 열이 들어가지 않는다. 앞 형제가 열 묶음이면 그 안으로 들어간다.
- **구조 트리** — 그리드 > «머리 왼쪽» · «머리 오른쪽» · «열» · «행» · «바닥» 구역 줄(2단계 구역 줄). 열 > 셀 틀 조각. 행 줄의 요약은 «×5» · «강조 · ×1» · «합계» · «생략». 행 50 이 트리 줄 하나다 — 트리를 덮지 않는다. 출석부(잎 열 쉰 · 열 묶음 스물둘)는 열 줄 쉰 남짓 — 묶음 줄을 접으면 준다.
- **빈 구역 칸** — 끄는 동안 그리드마다 빈 «머리 왼쪽» · «머리 오른쪽» 칸이 선다(지금 `List` 와 같다). «열» · «행» 칸은 열 · 행을 끌 때만, «바닥» 칸은 바를 지운 그리드에서만이다. **4단계 이월 L6(끄는 동안 빈 칸 · 미리보기가 겨눈 칸을 민다)은 지금 `List` 보다 나빠지지 않는다** — 늘 서는 칸이 같은 둘이다. 머리줄 칸 둘이 표 위에 서면 표가 한 줄 내려간다 — 끌기 판의 겨눔 상자는 `dragLayoutSettled` 뒤에 잰다(AGENTS.md 「워커에게 맡길 때」 의 «끄는 동안만 서는 캔버스 그림»).
- **사본에 놓기** — 사본은 `[data-wb-id]` 가 아니라 끌기 판정이 그 위를 그 행(`tr`)으로 읽는다 — 행 «앞 · 뒤» 띠에 조각을 놓으면 «행» 구역이 받지 않아 거절된다. 셀 틀에 놓으려면 틀 행(첫 행)의 칸이다. 거절 문장에 «첫 행의 칸에 놓으세요» 를 싣는다(GR-B).
- **잠금** — 열 하나를 고르면 그 열(머리 + 셀 틀)을, 행을 고르면 그 행(+ 제 칸)을 쥔다. 열 둘을 두 사람이 고치는 것이 막히지 않는다.

## 9. 그 밖의 소비자

| 소비자 | 바뀌는 것 |
| --- | --- |
| 봉투 · 문서 판 | `CURRENT_DOCUMENT_VERSION` 을 올린다(«2» `0032`) |
| 카탈로그 · 검증(`validate.ts`) | 새 타입 여섯 · `List` 걷기 · `placement` 목록 · 받는 타입. `assertZoneReferences` 가 `DataGrid` · `GridColumn` 기본 내용을 본다 |
| lint | `MAJOR_COMPONENTS` 의 `List` → `DataGrid`(정본 §12.4 줄과 `test/lint-rules.test.ts` 를 함께). 새 규칙 셋: `ignored-template`(번호 열 · `gap` 행의 무시되는 내용) · `grid-row-cells`(제 칸을 가진 행의 칸 폭 합 ≠ 잎 열 수 — 열을 더하거나 옮긴 뒤 따로 그린 행이 어긋남) · `structural-gap` 에 `{ container: 'DataGrid', requires: 'GridColumn' }`(열 없는 그리드) |
| 상호작용 | 트리거 × 타입 표가 없다 — 그대로. 셀 틀 조각(링크 · 단추)의 `openModal`(팝업 페이지 — 6단계)이 사본에서도 돈다(«1» «사본»). 문장은 원본 노드 이름 하나다 |
| 사람이 부르는 이름(`describe.ts` 의 `LABEL_PROPS`) | `GridColumn: 'label'` · `GridColumnGroup: 'label'` — 행 · 칸 · 그리드 · 바는 타입 이름 |
| prop 표지(`marks.ts`) | `DataGrid: { select }` · `GridColumn: { required, align, size, sort, tone, numbering }` · `GridRow: { kind, tone }` · `Pagination: { sizeSelect, range }`. `List` 줄을 걷는다 |
| 몫(`weightRoom`) | 그대로 — 그리드 · 행은 몫 자리가 아니다(칸 폭은 `span`) |
| 필드 이름(`fieldNames`) | 셀 틀 · 칸의 값 조각에 열 머리 이름(«3») |
| 내보내기 — HTML 번들 | 렌더러 그대로 — 사본이 번들에도 선다. 마커는 첫 일치(`mount.tsx` 의 `findNode`)라 원본에 선다 |
| 내보내기 — PPTX | 화면 그림이라 표는 그림으로 실린다 — 넓은 표는 펼쳐 찍는다(Q2 · «6») |
| 화면 캡처 | 찍는 판 표지(«6») |
| MCP · CLI | 도구 변화 없음 — `get_page` · `page get` 이 트리를 돈다(행 50 이 노드 하나라 개요가 짧다). MCP 스킬 문서(`packages/mcp/skill/SKILL.md`)에 «그리드 — 열 · 행 · 칸» 꼴 하나를 더한다 |
| `/llms.txt` | props · 구역 · «Create with» 는 정의에서 저절로. **영어 한 줄 표(`apps/web/config/llms-txt.ts`)를 손으로** — 새 여섯 · `List` 걷기 · `Grid` 의 이름. 생성 파일 `apps/web/public/llms.txt` 를 다시 낸다 |
| 팔레트 · 축소판 | 카탈로그에서 짓는다. `data` 갈래: «목록» → «그리드» · «페이지네이션» · «열» · «열 묶음» · «행» · «칸»(설 자리가 있는 넷은 `TabPanel` 처럼 그 자리에 놓아 재 본다). 축소판은 갤러리 첫 표본 |
| 편집 칸 `stringList` | `Tree.items` 만 남는다 — 칸은 그대로 |
| 붙이기 · 모듈 · 복제 | 그대로 — 열 · 행을 다른 그리드로 붙이면 받는 규칙이 판정한다. 모듈 저장 단위가 그리드 · 열 · 행이다 |
| 실시간 · 잠금 · 리베이스 | 그대로 — 구역은 2단계 경로 |
| 화면 상태 · 상태 보임 | 열 · 행 · 칸 · 바가 노드라 상태마다 숨긴다(«생성 후 상태에서 `[삭제]` 열 숨김»). 숨은 열은 `items` 에 없어 `gridLayout` 이 다시 센다(병합 머리의 `colspan` 이 준다) |
| 개수 하한 | «7» |
| 마이그레이션 `0032` | «2» |

## 10. 뒤 단계를 막지 않는다

| 뒤 단계 | 들어갈 자리 | 막는가 |
| --- | --- | --- |
| 6 팝업 페이지(라디오 선택 그리드) | 팝업 페이지 몸통의 `DataGrid { select: 'radio' }` · 칸의 링크 · 단추의 `openModal` · 바 | 아니다 — 그리드는 아무 데나 선다 |
| 6 반복 행 입력 표(`[추가]` + 행마다 입력 · `[삭제]` + 합계) | **같은 노드다** — 셀 틀에 입력 조각 · `[삭제]` 열 · 머리 오른쪽 `[추가]` · 합계 행. 6단계는 그 꼴의 표본 · 모듈만 더한다 | 아니다 |
| 6 파일첨부 위젯(체크 · 파일이름 · 크기 소그리드) | 위젯의 뷰가 그린다(그리드 노드가 아니다) — 또는 위젯 몸통에 그리드 | 아니다 |
| 7 상태별 속성 | 행 `tone` · `repeat` · 그리드 `empty` · 열 `sort` 가 보통 prop 이다 | 아니다 |
| 7 Object Description | 머리 칸(열 · 열 묶음) · 셀 틀 조각(첫 행) · 제 칸 · 행 · 바가 노드다. 바의 «행 수 셀렉트 옆» · 그리드 «왼쪽 위 모서리» 는 조각 기준 표지(4단계와 같은 자리) | 아니다 |
| 9 작은 요소(배지 · 상태 칩 · 툴팁) | 셀 틀 · 칸은 무엇이든 받는다 | 아니다 |
| 10 마스터-디테일 2분할 | `Grid`(격자 배치) 2열 > 칸마다 `DataGrid`(제 머리줄 · 바) · 미선택 안내는 `Placeholder` · `Text` | 아니다 — 행 강조로 «고른 행» 을 보인다 |
| 4 폼 표 값 칸 안 하위 그리드 | `Field` 값 칸(`accepts` 없음)의 `DataGrid` — 스크롤 상자가 값 칸 폭(`minmax(0, 1fr)`)을 따른다 | 아니다 — 값 칸 안 넓은 표는 그 칸 안에서 스크롤한다 |

---

## 11. 구현을 나누는 법

**두 트랙, 차례로 — GR-A 를 병합한 뒤 GR-B.** A 만으로 4단계(FT)보다 크고(타입 여섯 · 렌더러 사본 · 뷰 계약 넷 · `gridLayout` · 기본테마 · `0032` · `List` 픽스처 86 파일), B 는 A 의 타입 · 사본 표지에 기댄다. A 만 병합해도 쓸 수 있다 — 열은 복제(Cmd+D) · 그리드를 골라 팔레트로, 행 꼴은 «되풀이» 를 고쳐 행을 복제해 짓는다.

### GR-A — 모델 · 렌더 · 테마 · `0032`(L)

1. 카탈로그 — 새 타입 여섯 · `List` 걷기 · `placement` 목록 · `Grid` 이름 · `MAJOR_COMPONENTS` · `STRUCTURAL_GAPS` · `LABEL_PROPS` · 새 lint 규칙 둘 · 문서 판.
2. 렌더러 — `zoneItems` · `ViewItem.props` · `ViewItem.items` · `ViewItem.copy`(사본 — `data-wb-copy-of` · 뷰 `nodeId` 꼬리 · 캐시 열쇠) · `fieldNames` 넓히기.
3. SDK — `gridLayout`(단위 케이스 — 병합 머리 · `rowSpan` 덮임 · 숨은 열 · 원본 자리 · 번호) · `GridProvider` · `useGridHead` · `useGridRow` · `copyAttrs` · 뷰 여섯 · 기본 CSS · 찍는 판 시트(`CAPTURE_CSS`) · 표지 · 판 1.7.0.
4. 기본테마 CSS · 변형 · 판 · `checksums.json`.
5. 갤러리 표본 · 스타터 템플릿 · `wb-theme check` 규칙 넷(깨는 테마 뷰로) · `shots` 표본 · 개수 하한.
6. 화면 캡처의 찍는 판 표지(Q2).
7. `/llms.txt` 영어 표 · 생성물 · MCP 스킬 한 꼴.
8. `0032`(Q5) — 다섯 자리 · `head_seq` · `down`.
9. `List` 픽스처 86 파일을 `DataGrid` 로(맨 노드로 쓰는 것은 타입 글자만 · props 를 쓰는 33 은 새 꼴로).
10. 실브라우저 판 — 사본(외곽선 · 고르기 · HTML `id`) · 병합 머리 · 고정 열 스크롤 · 넓은 표 390 · 720 · 1280 · 빈 구역 칸이 `tbody` 안에 서는 판 · 비용 판(«1» «비용»).
11. 정본(서문의 절) · `apps/api/README.md` 의 마이그레이션 목록.

### GR-B — 에디터 입구(M)

1. 사본 → 원본 고르기 · 틀 칸 빈 자리 → 열 고르기(`canvas.tsx` 의 고르기 · 범위 선택이 `data-wb-copy-of` 를 원본으로).
2. 팔레트 넣기 «안» 이 거절되면 «뒤» 로(`paletteAddTarget`) — 열을 골라 «열» · 행을 골라 «행».
3. 행 줄 `…` «한 행 떼어 내기» · «열 틀로 칸 짓기»(연산 묶음 · 잠금 · 되돌리기 한 번).
4. 거절 문장 «첫 행의 칸에 놓으세요».
5. 속성 패널 편집 칸 문구(«되풀이» · «가로 칸 수» · «세로 칸 수» · «고정 열 수» — 안내 한 줄씩).
6. 실브라우저 판 — 열 복제 · 묶기 들여쓰기 · 떼어 내기 · 칸 짓기 · 사본 고르기 · 끄는 동안 빈 칸.

### 겹치는 파일(다른 트랙이 나란히 돌 때)

| 파일 | 왜 겹치나 |
| --- | --- |
| `packages/schema/src/component/catalog/{data,structure,index}.ts` · `define.ts` | 카탈로그 타입 · `placement` · `Grid` 이름 |
| `packages/theme-sdk/src/{types,version,marks}.ts` · `default-views/{index,data}.tsx` | 계약 · 판 · 표지 · 뷰 등록 |
| `packages/renderer/src/render.tsx` | 사본 · 구역 자식 |
| `system-themes/admin/{src/theme.css,src/manifest.ts,package.json,checksums.json}` | 기본테마 판 — 뒤에 병합하는 쪽이 합친 판에서 sha256 을 다시 잰다 |
| `packages/theme-gallery/src/samples.ts` | 표본 |
| `apps/api/src/db/migrations/0032-*` · `CURRENT_DOCUMENT_VERSION` | 번호 · 판 |
| `packages/theme-kit/build-test/{dev,shots}.test.ts` · `apps/web/build-test/palette.test.ts` | 개수 하한 |
| `apps/web/config/llms-txt.ts` · `apps/web/public/llms.txt` | 영어 표 · 생성물 |
| `type: 'List'` 를 쓰는 케이스 86 파일 | 픽스처 |

6단계(팝업 페이지 · 파일첨부 · 반복 행 표)를 A 와 나란히 돌리면 위 표가 거의 다 겹친다 — 차례로 돈다. B 는 6단계와 겹치는 것이 팔레트 넣기 · 줄 행동뿐이다.

### 크기

**GR-A L(4단계보다 크다) · GR-B M.** 기존 케이스 셈: `List` 를 부르는 코드 86 파일 · 그 props 를 쓰는 33(끝 절의 셈). `createNode('List')` 결과를 단언하는 케이스(`apps/web/test/edit/create-node.test.ts`) · `label: '그리드'` 를 단언하는 자리(`packages/cli/test/snapshot-fixture.ts`)가 바뀐다.

---

# 정한 것

다섯 물음 모두 (가)로 정했다(사용자 답 · 2026-10-25). 고르지 않은 선택지와 고른 까닭은 비교를 위해 남긴다.

### Q1. 팔레트에서 이 표를 무엇이라 부르나

| 선택지 | 화면에서 |
| --- | --- |
| **(가) «그리드» — 배치용 `Grid` 는 «격자 배치» 로 바꾼다(정함)** | 팔레트 «데이터» 갈래에 «그리드», «구조» 갈래의 배치 카드가 «격자 배치» 로 바뀐다. 상호작용 문장도 «격자 배치» 로 부른다 |
| (나) «표» — 배치 `Grid` 는 «그리드» 그대로 | 팔레트에 «표» 와 «그리드»(배치)가 함께 선다. 설계서 OD 의 «그리드 영역» 과 이름이 갈린다 |

고른 까닭: 설계서 · OD 가 자료 표를 «그리드» 라 부른다(«그리드 영역에 "검색결과가 없습니다." 노출»). 배치 `Grid` 는 화면 이름이 아니라 짜임 도구라 이름을 바꿔도 설계서와 안 갈린다.

### Q2. PPTX 에서 화면보다 넓은 표를 어떻게 찍나

| 선택지 | 화면에서 |
| --- | --- |
| **(가) 표 전체 폭으로 펼쳐 찍는다(정함)** | 슬라이드 그림에 출석부 같은 넓은 표가 끝 열까지 다 보인다. 그 화면의 그림이 넓어져 슬라이드에서는 작게 줄어 보인다. HTML 번들 · 에디터는 그대로 가로 스크롤이다 |
| (나) 화면 그대로 찍는다 | 표가 오른쪽에서 잘리고 아래에 스크롤 막대가 찍힌다. 그림 크기는 다른 화면과 같다 |

고른 까닭: 설계서가 넓은 표를 화면 틀 밖까지 그린다 — 잘린 그림은 검토자가 뒤 열을 못 본다.

### Q3. 페이지네이션 바의 «1 - 50 (총 72 항목 중)» 수를 어디서 얻나

| 선택지 | 화면에서 |
| --- | --- |
| **(가) 바의 «총 건수» · «쪽 크기» · «지금 쪽» 으로 셈한다(정함)** | 기본 바가 «1 - 10 (총 72 항목 중)» 이다(쪽 크기 10). 총 건수를 바꾸면 쪽 번호 수와 범위 글이 함께 바뀐다. 설계서처럼 «1 - 50» 을 보이려면 쪽 크기를 50 으로 한다 |
| (나) 범위 글을 글자로 적는다 | 바에 글 칸이 생기고 적은 그대로 선다(«1 - 50 (총 72 항목 중)»). 쪽 번호 · 행 수 셀렉트와 수가 어긋나도 그대로다 |
| (다) 그리드의 행 수로 셈한다 | 행 다섯이면 «1 - 5 (총 5 항목 중)» — 설계서의 «대표 행 셋 · 총 72 항목» 꼴을 못 그린다 |

### Q4. 되풀이 행에 첫 행과 같은 글이 서도 되나

| 선택지 | 화면에서 |
| --- | --- |
| **(가) 같은 글이 선다(정함)** | 셀 틀에 «홍길동» 을 적으면 다섯 행이 다 «홍길동» 이다. «No» 열만 1 · 2 · 3 … 으로 다르다. 행마다 다른 값이 필요하면 그 행을 «열 틀로 칸 짓기» 로 따로 그린다 |
| (나) 첫 행만 글, 둘째 행부터 «—» | 표본 값이 첫 행에만 서고 나머지는 대시다 — «같은 꼴» 이 덜 보인다 |

### Q5. 지금 만든 «목록» 을 새 그리드로 옮기나

| 선택지 | 화면에서 |
| --- | --- |
| **(가) `0032` 가 옮긴다(정함)** | 사용자 개발 DB 의 목록이 새 그리드로 열린다 — 열 이름은 그대로, 칸은 «—», 행 수 그대로, 페이지네이션이 새 바(«1 - 10 (총 72 항목 중)»)로, 빈 상태 문구가 «검색 결과가 없습니다.» 로 |
| (나) 옮기지 않는다 | 목록이 든 페이지가 «알 수 없는 컴포넌트 타입: List» 폴백으로 열린다 — 손으로 지우고 다시 짓는다 |

---

## 소비자 조사 — 다시 재는 법

워크트리 뿌리에서.

```bash
# 지금 List 의 정의 · 기본 뷰 · 표지 · 기본테마 규칙
git grep -n -A40 'export const ListDef' -- packages/schema/src/component/catalog/data.ts
git grep -n -A70 'export const ListView' -- packages/theme-sdk/src/default-views/data.tsx
git grep -n 'List:' -- packages/theme-sdk/src/marks.ts system-themes/admin/src/manifest.ts
git grep -c 'data-wb-component="List"' -- system-themes/admin/src/theme.css
# List 를 부르는 코드 — 파일 수
git grep -l -E "'List'|\"List\"" -- '*.ts' '*.tsx' '*.json' | wc -l
# 그 가운데 List 의 props 를 쓰는 것 — 노드 글자 뒤 300 자 안에 prop 이름(git grep -E 는 \s 를 모른다 — 파이썬으로 센다)
python3 - <<'EOF'
import re, subprocess
files = subprocess.run(['git', 'grep', '-l', '-E', r"'List'|\"List\"", '--', '*.ts', '*.tsx', '*.json'], capture_output=True, text=True).stdout.split()
props = r"(columns|items|pagination|selectable|empty|loading)"
hits = [f for f in files if re.search(r"type:\s*['\"]List['\"][^}]{0,300}?" + props, open(f, encoding='utf-8').read(), re.S)
        or re.search(r"\bList\b[^\n]{0,80}(columns|items):", open(f, encoding='utf-8').read())]
print(len(files), len(hits))
EOF
# 몸통을 부모에게 맡기는 타입 · 설 자리(지금 TabPanel 하나)
git grep -n -E "bodyHost: 'parent'|placement: \{" -- packages/schema/src/component/catalog
# 구역 자식을 뷰가 받는 길(지금 items 는 몸통만)
git grep -n -E 'items\.push|const items: ViewItem' -- packages/renderer/src/render.tsx
# 노드 찾기가 첫 일치인 자리 · [data-wb-id] 훑기
git grep -n -E "querySelectorAll\('\[data-wb-id\]'\)" -- apps/web/src packages/exporter/src packages/theme-kit/src
# 부모를 바꾸는 입구가 지나는 판정
git grep -n 'fitRefusal(' -- apps/web/src
# 팔레트 넣기의 «안» · «뒤»
git grep -n -E "inside \? 'inside' : 'after'" -- apps/web/src/palette/palette-add.ts
# 편집 단축키 · 구조 트리 줄 행동
git grep -n -B4 'edits: true' -- apps/web/src/edit/editor-shortcuts.ts | grep label
git grep -n -E "item\('" -- apps/web/src/panels/tree-row-actions.tsx
# 종류 바꾸기의 대상(입력 조각만)
git grep -n 'export const KIND_TYPES' -- apps/web/src/edit/change-kind.ts
# 화면 캡처의 창 · 넓이 상한
git grep -n -E 'const VIEWPORT|maxArea' -- apps/api/src/services/screen-render-chromium.ts
# 비용 축 — 잠금 판정 판의 노드 수 · 편집 연산 상한
git grep -n -E 'const TEXTS|MAX_OPS_PER_EDIT = ' -- apps/api/test/ws-lock-cost.test.ts packages/schema/src/clipboard.ts
# lint 주요 컴포넌트 · 구조 공백
git grep -n -A4 -E 'MAJOR_COMPONENTS: |const STRUCTURAL_GAPS' -- packages/schema/src/lint/design.ts
# 문서 판 · 런타임 사슬
git grep -n -E 'CURRENT_DOCUMENT_VERSION = |export const MIGRATIONS' -- packages/schema/src/migrate.ts
# 배치 Grid 의 이름을 단언하는 자리
git grep -n -F "'그리드'"
# 판 · 마지막 마이그레이션 · 개수 하한
git grep -n 'SDK_VERSION =' -- packages/theme-sdk/src/version.ts
git grep -n '"version"' -- system-themes/admin/package.json
ls apps/api/src/db/migrations | tail -2
git grep -n -E 'toBeGreaterThanOrEqual\([0-9]+\)|kinds\)\.toBe' -- apps/web/build-test/palette.test.ts packages/theme-kit/build-test
```
