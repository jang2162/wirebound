# 라벨|값 폼 표 — 설계

로드맵 `docs/superpowers/plans/2026-10-22-skala-roadmap.md` 의 «모자란 것» 3 · «정한 것» A · C · «단계» 4 다. 등록 · 수정 화면의 라벨|값 표(1쌍 행 · 2쌍 행 · 전폭 행 · 빈 쌍 · 사진 칸 · 필수 `*` · 값 칸 안의 그리드 · 파일첨부 · 하위 표)를 그리는 길을 정한다.

이 문서는 발행 시점의 기록(spec)이다. 구현이 병합되면 정본 설계서(`docs/superpowers/specs/2026-08-03-wirebound-design.md`)의 §4.3 「페이지 스키마 노드」(몫) · §5 「컴포넌트 카탈로그」 · §6.1 「노드 속성」 · 「테마 뷰 계약」 · §12.4 「lint 규칙」 · §12.6 「`/llms.txt`」 와 속성 탭 문단이 지금 참인 것을 갖는다. 이 설계는 정본을 고치지 않는다 — 구현 차수가 고친다.

2단계 구역 모델(`docs/superpowers/specs/2026-10-23-node-slots-design.md`)과 3단계 `Field`(라벨 prop + 값 구역 — `docs/superpowers/specs/2026-10-24-compose-input-design.md` 「1. `Field` 의 꼴」)가 병합된 판(main `8769757a`) 위에 선다.

---

## 이 설계가 고른 것 — 한눈에

| 물음 | 고른 것 | 이유(한 줄) |
| --- | --- | --- |
| 컴포넌트의 꼴 | **(나) 새 컴포넌트 `FormTable`(폼 표)** — `EntryForm` 은 그것을 품는다. 새 입력폼은 몸통에 폼 표 하나(1쌍 · 필드 셋)를 들고 선다 | 설계서의 등록 화면은 폼 표 여럿 · 구역 제목 · 그리드가 한 폼 안에 쌓이고 단추줄은 맨 아래 하나다 — 표와 폼을 한 노드로 묶으면 그 꼴이 안 선다 |
| 행 · 칸 모델 | **칸 흐름** — `columns`(쌍 수 1 ~ 4 · 기본 1) + 자식의 몫(`weight`) = 차지할 쌍 수. 행은 노드가 아니다 | `SearchForm.columns` 와 같은 꼴이고 몫 · 속성 패널 «몫» 칸 · 렌더러의 자르기가 이미 있다 |
| 전폭 행 | 몫 ≥ 열 수(렌더러가 열 수로 자른다) | 새 장치가 없다 |
| 빈 쌍 | **뷰가 저절로 채운다** — 행 끝 · 넓은 칸이 다음 줄로 넘어가며 남긴 구멍에 빈 쌍(`filler`)을 그린다. 가운데의 빈 쌍은 라벨이 빈 `Field` | 흔한 꼴(«칸이 모자라 오른쪽 쌍이 빈칸»)이 걸음 0 이다 |
| 라벨 rowspan | 설계서의 «세로로 긴 라벨» 은 키 큰 행이다(값 칸의 그리드가 행을 키운다) — 장치가 없다. 여러 값 줄을 덮는 라벨은 한 `Field` 의 값 칸에 세로 `Flex` | 진짜 rowspan 은 사진 칸 한 곳뿐이다 |
| 사진 칸 | **폼 표의 «옆 칸» 구역(`aside`)** — 표 왼쪽에서 모든 행을 덮는다(Q3) | 칸 선이 표와 이어진다 |
| 라벨|값 칸과 `Field` | **라벨 칸 · 값 칸은 `Field` 의 `label` · `value` 조각이다** — 같은 노드 · 같은 뷰. 폼 표 안의 `Field` 뿌리는 CSS subgrid 로 표의 두 트랙에 두 조각을 놓는다 | `display: contents` 는 `Field` 뿌리의 상자를 없애 에디터의 외곽선 · 놓기 판정 · 마커 자리를 깬다. 뷰가 나눠 그리는 길은 부모 뷰가 자식 뷰 속을 못 열어 계약을 크게 바꾼다 |
| 표 의미론 | `<table>` 이 아니라 격자 `div` + `Field` 마다 이름 붙은 `group` | `Field` 뿌리가 `<tr>`/`<td>` 가 될 수 없고, 값 칸에 그리드 · 하위 표가 든다 — 자료 표가 아니라 폼 배치다 |
| 검색폼 | **같은 격자 규칙을 나눈다** — 열을 정한 `SearchForm` 도 쌍 격자(라벨 왼쪽)로 그린다(Q1). 문서 모델은 이미 같아 옮길 것이 없다 | 설계서의 검색폼 몸통이 `라벨\|컨트롤\|라벨\|컨트롤` 격자다 |
| 표 밖 구역 제목 | **폼 표의 `title` + «머리 오른쪽» 구역(`headEnd`)**(Q4) | 한 노드에 표지(Object Description)가 붙고, `List` 의 결과 머리줄 · `Card` 머리와 같은 꼴이다 |
| 좁은 창 | **테마의 몫** — 계약은 «빈 쌍은 `filler` 조각» 만 정한다. 기본테마는 640px 아래에서 한 줄에 쌍 하나 · 라벨 위 · 값 아래 · 빈 쌍 숨김 · 옆 칸은 표 위 | 지금 `EntryForm` · `KeyValue` · 열을 정한 `SearchForm` 의 좁은 창 규칙과 같은 자리 |
| 기존 입력폼 | `0031` 이 `EntryForm` 몸통의 잇단 `Field` 를 폼 표 하나로 감싼다(Q2) | 사용자 개발 DB 의 입력폼이 표 모양으로 열린다 |
| 나누기 | **한 트랙(FT)** — 에디터 몫이 작다 | 겹치는 파일이 카탈로그 · SDK · 기본테마 판이라 둘로 나누면 판 올림만 두 번이다 |

---

## 지금 모델이 기대는 곳

워크트리 뿌리에서 다시 잰 것이다(코디네이터가 센 것과 맞다).

| 자리 | 지금 |
| --- | --- |
| `packages/schema/src/component/catalog/input.ts` 의 `EntryFormDef` | props `title` · 구역 `body`(«항목» — `accepts` 없음 · 기본 내용 없음) · `actions`(«단추» — 기본 내용 `저장`(`primary`) · `취소`) |
| 같은 파일의 `SearchFormDef` | props `collapsed` · `columns`(1 ~ 4 · 기본값 없음) · 구역 `body`(«조건») · `actions`(`초기화` · `검색`(`primary`)) |
| 같은 파일의 `FieldDef` | props `label` · `required` · 몸통 구역 «값»(`initial: [{ type: 'Input' }]` · `accepts` 없음) · 상태 `required` |
| `catalog/data.ts` 의 `KeyValueDef` | props `pairs`(`{key, value}[]`) · `columns`(1 ~ 4 · 기본 1) · 구역 없음 — 읽기 전용 라벨|값 |
| `catalog/structure.ts` 의 `GridDef` · `SectionDef` | `Grid.columns`(1 ~ 12 · 기본 2) · 몸통. `Section.compact` · 몸통 |
| 몫 — `packages/renderer/src/render.tsx` 의 `weightRoom` · `weightIn` | `Flex` · `Field` → `flex`, `Grid` · 열을 정한 `SearchForm` → `span`(열 수로 자른다). 속성 패널 «몫» 칸이 같은 함수로 선다(`apps/web/src/panels/property-panel.tsx` 의 `WEIGHT_FIELD`) |
| 몫 변수 — `packages/theme-sdk/src/root.tsx` · `css-tools.ts` 의 `WEIGHT_VAR` | 몫이 있는 노드 뿌리에 `--wb-node-weight` 를 인라인으로 싣는다. `@property` 등록은 없고, SDK 기본 CSS(`structureCssBlocks`)가 모든 노드 뿌리(`[data-wb-id]`)에서 `initial` 로 끊어 자손 노드에 안 물려진다 — 노드가 아닌 요소만 물려받는다(«7» «몫 변수») |
| 기본 뷰 `packages/theme-sdk/src/default-views/input.tsx` | `EntryFormView`(`label`(제목) · `row`(몸통) · `actions`) · `SearchFormView`(`fields` + `searchFormFieldsAttrs(columns)` · `actions`) · `FieldView`(`Root div[role=group][aria-labelledby]` > `label[data-wb-part=label]` · `div[data-wb-part=value]`) · `inputCssBlocks`(열을 정한 검색폼 격자 · 몫 칸 수 · 값 칸 가로 줄) |
| `default-views/data.tsx` 의 `KeyValueView` | `<table>` — 쌍을 `columns` 개씩 한 행, 모자라면 `filler` 칸 하나(`colSpan`) |
| 뷰 계약 `packages/theme-sdk/src/types.ts` | `ViewProps.items: ViewItem[]`(`nodeId` · `index` · `element` · `content`) — 몫이 없다 |
| 기본테마 `system-themes/admin/src/theme.css` | `EntryForm` 은 세로 줄(`row`) · 단추줄 왼쪽 여백 = 라벨 폭. `[EntryForm] [Field]`(**자손** 셀렉터)가 라벨 칸 `--wb-form-labelWidth`(8rem — CSS 변수, manifest 토큰 아님) + 값 칸 두 칸 격자. `Field` 는 라벨 위 · 필수 별은 라벨 **뒤**(`::after " *"`). 열을 정한 `SearchForm` 은 필드마다 한 칸(라벨 위). `KeyValue` 키 칸은 `canvas` 바탕 · 굵은 글. 640px 아래: 입력폼 라벨 위 · 검색폼 한 줄에 필드 하나 · `KeyValue` 쌍마다 한 줄(`filler` 숨김) |
| lint `packages/schema/src/lint/design.ts` 의 `STRUCTURAL_GAPS` | `EntryForm` · `SearchForm` 이 자손에 `Field` 를 요구한다(`hasDescendant` — 손자도 센다) |
| 캔버스 놓기 `apps/web/src/canvas/canvas-drop.ts` 의 `axisOf` | 부모가 flex 면 방향, 아니면 형제 상자가 같은 줄에 있는지로 가로 · 세로를 정한다 — 격자도 형제 상자로 읽는다 |
| 마이그레이션 | 마지막 `0030-assets`. 이 단계의 번호는 `0031` |

---

## 1. 컴포넌트의 꼴

### 후보

- **(가) `EntryForm` 몸통이 폼 표가 된다** — `EntryForm` 에 `columns` 를 두고 몸통의 `Field` 를 쌍 격자로 깐다.
- **(나) 폼 표 컴포넌트를 새로 두고 `EntryForm` 은 그것을 품는다** — `FormTable`(폼 표 · `columns` · 몸통) · `EntryForm` 은 제목 · 몸통(폼 표 · 구역 제목 · 그리드 …) · 단추.
- **(다) `Grid` · `KeyValue` 를 넓힌다** — `Grid` 에 «표» 변형, 또는 `KeyValue` 의 쌍을 노드로.
- **(라) `EntryForm` 몸통을 칸 흐름으로 두고 폼 표가 아닌 자식(구역 제목 · 그리드)이 표를 끊는다.**

### 견줌

설계서의 등록 화면 꼴(분석 파일 «폼 레이아웃» · «라벨|값 폼 표» 절): 2쌍 표 → 표 밖 구역 제목 → 2쌍 표 → 단추줄 / 1쌍 표 → 구역 제목 + 오른쪽 단추 → 그리드 → 구역 제목 → 그리드 → 단추줄 / 사진 칸 + 2쌍 표 → 반복 하위 표 행 → 구역 제목 → 2쌍 표 … → 단추줄. **단추줄은 화면 맨 아래 하나**이고 그 위에 덩어리가 여럿이다.

| | (가) | (나) | (다) | (라) |
| --- | --- | --- | --- | --- |
| 흔한 꼴(1쌍 행 다섯 줄 + 저장 · 취소) | 팔레트 «입력폼» 1 + 필드 넣기 2(기본 셋이면) | 같다 — 새 입력폼이 폼 표(필드 셋)를 들고 선다(`initial` 이 겹으로 돈다 — `apps/web/src/edit/create-node.ts`) | `Grid` + `Field` 다섯 + 단추 둘 — 단추줄을 손으로 · 표 모양이 테마의 `Grid` 몫이 아니다 | (가)와 같다 |
| 2쌍 행 + 전폭 행 섞기(쌍 여섯 · 전폭 둘) | 입력폼 1 · 열 수 2 · 필드 넣기 5 · 전폭 둘의 몫 2 | 같다(열 수는 폼 표에) | `Grid.columns` 4(트랙 수) — 쌍이 아니라 트랙을 센다. 전폭 몫 4 | (가)와 같다 |
| 표 여럿 + 사이 구역 제목 + 단추줄 하나 | **못 짓는다** — 표마다 입력폼이면 단추줄이 표마다 선다(단추를 지우면 «단추» 구역 없는 폼이 여럿) | 입력폼 몸통에 폼 표 · 구역 제목 · 폼 표 · 그리드를 쌓는다 | 같은 문제 + 단추줄을 손으로 | 구역 제목 행이 표의 칸 선 안에서 끊어야 한다 — 칸마다 선을 긋는 테마 CSS 가 «선 없는 행» 을 다뤄야 해 테마마다 어렵다 |
| 폼 밖의 표(팝업의 정보표 · 상세 화면) | 입력폼을 써야 한다(단추 · `form` 의미가 따라 온다) | 폼 표를 바로 둔다 | `Grid` | (가)와 같다 |
| 검색폼과 같은 규칙 | 둘 다 «폼» 이 열을 갖는다 | 폼 표와 열을 정한 검색폼이 같은 쌍 격자 | 다른 규칙 | (가)와 같다 |
| 표지 · 별칭 · 상태 보임 · 모듈 저장 단위 | 폼째 | **표 하나씩** — «계정상태 정보 표» 를 상태로 숨기고 모듈로 재사용한다 | 그리드째 | 폼째 |
| 새 개념 | 없음 | 타입 하나 | `Grid` 에 «표» 뜻 — 범용 배치가 폼 규칙을 품는다 | «표를 끊는 자식» 규칙 |

### 고른 것 — (나)

**`FormTable`(폼 표)을 새로 두고, `EntryForm` 은 폼 표를 품는다. 새 입력폼은 몸통에 1쌍 폼 표 하나(필드 셋)와 단추 둘(저장 · 취소)을 들고 선다.**

- (가)를 버린 까닭: 설계서의 등록 화면은 «표 여럿 · 단추줄 하나» 다. 표와 폼을 한 노드로 묶으면 그 꼴이 안 선다.
- (다)를 버린 까닭: `Grid` 는 범용 배치다 — 트랙을 세는 열 수와 쌍을 세는 열 수가 한 prop 에서 갈리고, 라벨 칸 바탕 · 칸 선 같은 폼 표 모양을 `Grid` 의 테마 규칙이 떠안는다. `KeyValue` 는 쌍이 노드가 아니라(`pairs` prop) 값 칸에 그리드 · 파일첨부 · 입력 조각을 넣을 수 없다(로드맵 A).
- (라)를 버린 까닭: 칸 선을 칸마다 긋는 표에서 «선 없는 행» 을 테마마다 다뤄야 한다. 폼 표를 덩어리로 두면 구역 제목 · 그리드는 표 밖 형제다.

```ts
// packages/schema/src/component/catalog/input.ts
export const FormTableDef = defineComponent({
  type: 'FormTable',
  label: '폼 표',
  description: '라벨|값 칸을 표로 깐다. 한 줄에 쌍을 열 수만큼 놓는다.',
  group: 'input',
  props: z.strictObject({
    title: z.string().default(''),          // 표 밖 구역 제목(빈 글이면 머리줄째 없다 — Q4)
    columns: z.number().int().min(1).max(4).default(1),
  }),
  editor: [
    { prop: 'title', control: 'text', label: '제목' },
    { prop: 'columns', control: 'number', label: '열 수' },
  ],
  summary: (props) => joined(oneLine(props.title), columnsWord(props.columns)), // «계정상태 정보 · 2열»
  states: [],
  zones: [
    { name: 'headEnd', label: '머리 오른쪽' },  // Q4
    { name: 'aside', label: '옆 칸' },         // Q3 — 사진 칸
    { name: 'body', label: '칸', initial: [{ type: 'Field' }, { type: 'Field' }, { type: 'Field' }] },
  ],
})

export const EntryFormDef = defineComponent({
  // … 그대로 + 몸통의 기본 내용
  zones: [
    { name: 'body', label: '항목', initial: [{ type: 'FormTable' }] },
    { name: 'actions', label: '단추', initial: [/* 저장(primary) · 취소 — 그대로 */] },
  ],
})
```

- **몸통은 무엇이든 받는다**(`accepts` 없음) — 폼 표 안에 `Field` 가 아닌 자식(안내 글 · 그리드 · 단추)이 서면 그 자식은 몫만큼의 쌍 폭을 라벨 없는 한 칸으로 차지한다. 받는 타입을 좁히지 않는 까닭: 좁히면 «값 칸에 넣을 그리드를 표 몸통에 끌어 놓은» 판이 거절되고, 받는 규칙이 생기면 부모를 바꾸는 입구 전부(끌기 · 넣기 · 붙이기 · 모듈 넣기 · 들여쓰기 · 내어쓰기)가 그 규칙을 봐야 한다(«8. 에디터»). 폼 표에 `Field` 가 하나도 없으면 lint 가 말한다(«9»).
- **열 수 기본값 1** — 설계서에서 1쌍 표가 가장 흔하고(그룹 A · D 의 등록 화면 대부분) 2쌍은 문서에 따라 고른다.
- **기본 내용 셋** — 지금 갤러리의 입력폼 표본이 필드 둘이고, 설계서의 짧은 등록 화면이 셋 ~ 다섯 줄이다. 셋이면 넣고 바로 «표» 로 보이고 지우는 걸음이 적다.
- **`EntryForm` 은 남는다** — `form` 의미 · 제목 · «단추» 구역이 그것의 몫이다. 몸통의 기본 내용만 더한다.
- **구역 차례**(`zones` 선언 차례 = 순회 · 트리 차례): 머리 오른쪽 → 옆 칸 → 칸. 화면을 읽는 차례(제목줄 → 왼쪽 사진 → 칸)다.

### 흔한 꼴의 걸음(견줌의 바탕)

| 꼴 | 걸음 |
| --- | --- |
| 1쌍 행 다섯 줄 + 저장 · 취소 | 팔레트 «입력폼» 넣기(표 · 필드 셋 · 단추 둘이 선다) → 필드를 고르고 팔레트 «입력 필드» 넣기 두 번(고른 노드 뒤) → 라벨 다섯 고치기 |
| 2쌍 행 여섯 + 전폭 행 둘 | 팔레트 «입력폼» → 폼 표의 «열 수» 2 → 필드 넣기 다섯 → 전폭 둘을 골라 «몫» 2 → 라벨 고치기 |
| 사진 칸 + 2쌍 표 | 위 + 팔레트 «자리표시자» 를 폼 표의 «옆 칸» 에 끌어 놓기 |
| 표 밖 구역 제목 + 오른쪽 단추 + 표 | 폼 표 «제목» 칸에 글 + 팔레트 «단추» 를 «머리 오른쪽» 에 끌어 놓기 |

## 2. 행 · 칸 모델

### 후보

- **행 노드** — `FormRow`(행) 안에 `Field` 둘. 행 노드가 «2쌍 행 · 전폭 행» 을 든다.
- **칸 흐름** — 폼 표의 `columns`(쌍 수) + 자식의 몫(차지할 쌍 수). `SearchForm.columns` 와 같은 꼴.

### 고른 것 — 칸 흐름

| | 행 노드 | 칸 흐름 |
| --- | --- | --- |
| 1쌍 표 | 행 다섯 · 필드 다섯 — 노드 열 | 필드 다섯 |
| 쌍 넣기 · 옮기기 | 행 안에 넣을지 새 행을 지을지 갈린다 · 다른 행으로 옮기면 빈 행이 남는다 | 필드 하나를 형제 사이로 옮긴다 — 나머지가 흐른다 |
| 2쌍 → 1쌍 바꾸기 | 행마다 둘을 풀어 새 행 — 트리 작업 | 열 수 하나 |
| 전폭 행 | 행에 필드 하나 + «전폭» 표지 | 몫 ≥ 열 수 |
| 구조 트리 | 행 줄이 끼어 깊이 하나 더 | 필드가 바로 표 밑 |
| 이미 있는 장치 | 없음 — 행 타입 · 받는 규칙(행은 필드만) · 빈 행 lint | 몫 · 렌더러 자르기(`weightIn`) · «몫» 칸 · 캔버스 가로 놓기(`axisOf` 의 형제 상자) |

**행은 노드가 아니다.** 행은 칸이 흐르며 생긴다 — 표가 `columns` 개 쌍을 한 줄에 놓고, 넘치면 다음 줄이다.

### 무엇을 무엇으로 적나

| 꼴 | 적는 것 |
| --- | --- |
| 한 줄의 쌍 수 | `FormTable.columns`(1 ~ 4). 수 prop 이라 표지가 아니다 — `cells` 조각의 `data-wb-columns` 와 `--wb-node-formtable-columns` 로 싣는다(`SearchForm.columns` 의 `searchFormFieldsAttrs` 와 같은 꼴 — SDK `formTableCellsAttrs`). `packages/renderer/test/prop-marks.test.tsx` 의 «불리언 · enum 만 표지» 규칙에 안 든다 |
| 쌍 폭 | 자식의 몫(`weight`) = 차지할 쌍 수. 렌더러가 열 수로 자른다(`weightRoom('FormTable')` → `span`) |
| 전폭 행 | 몫 ≥ 열 수. 몫 12 를 주면 어느 열 수에서나 전폭이다(자르기). 열 수를 바꿔도 몫은 안 바뀐다 |
| 빈 쌍(행 끝 · 넓은 칸이 남긴 구멍) | **뷰가 채운다** — 아래 «빈 쌍» |
| 빈 쌍(행 가운데 — 왼쪽 쌍이 비고 오른쪽이 찬 꼴) | 라벨이 빈 `Field`(값 구역의 기본 `Input` 을 지운다). 뷰는 빈 라벨이면 이름 없는 `group` 을 안 낸다(`role` 을 거둔다) |
| 라벨 폭 | 테마의 몫 — 기본테마 `--wb-form-labelWidth`(지금 값 8rem · CSS 변수). 노드 prop 을 두지 않는다(«노드는 스타일을 갖지 않는다» — 정본 §4.3) |
| 키 큰 행(«세로로 긴 라벨») | 장치 없음 — 값 칸에 그리드가 들면 행이 커지고 같은 행의 라벨 칸이 늘어난다(격자 `align-items: stretch`) |
| 한 라벨 · 여러 값 줄 | 한 `Field` 의 값 칸에 세로 `Flex`(줄마다 조각) |
| 사진 칸(왼쪽에서 모든 행을 덮음) | `aside` 구역(Q3) |

### 빈 쌍 — 뷰가 채운다

설계서의 빈 쌍은 거의 다 «칸이 모자라 오른쪽 쌍을 빈칸으로» 다(검색폼 · 정보표 · 2쌍 폼 표). 사람이 빈 노드를 넣지 않아도 서야 한다.

- **CSS 만으로는 못 채운다** — 격자의 남는 트랙에는 상자가 없어 칸 선 · 라벨 바탕이 안 선다. 의사 요소(`::after { grid-column: auto / -1 }`)는 마지막 줄이 꽉 찼을 때 빈 줄 하나를 더 만든다.
- **뷰가 줄을 센다** — 렌더러가 몸통 자식마다 **자른 몫**을 `ViewItem.span` 으로 싣는다(새 필드 — 부모가 `span` 자리일 때만 · 몫이 없으면 1). SDK 함수 `pairRows(items, columns)` 가 격자의 자동 배치와 같은 셈으로 줄을 짓고, 줄 끝과 «넓은 칸이 다음 줄로 넘어가며 남긴 구멍» 에 빈 쌍을 끼운 차례를 돌려준다. 기본 뷰 · 테마 뷰가 그 차례로 그린다.
- 빈 쌍의 DOM: `div[data-wb-part=filler][aria-hidden=true]` > `div[data-wb-part=label]` · `div[data-wb-part=value]` — `Field` 와 같은 두 조각이라 테마의 라벨 칸 바탕 · 칸 선 규칙이 그대로 듣는다. `data-wb-id` 가 없다(노드가 아니다 — 2단계의 빈 구역 칸과 같은 자세).
- **상태 보임에 따라 다시 센다** — `items` 는 그 상태에서 보이는 자식만 든다(`render.tsx` 의 `items` · `shownIn`). 상태로 숨은 필드의 자리는 다음 칸이 채우고 빈 쌍은 끝으로 간다.
- `KeyValueView` 의 `filler`(남은 쌍 전부를 한 칸으로)와 다르다 — 폼 표는 쌍마다 빈 라벨 칸 · 빈 값 칸을 둔다(설계서의 빈 쌍이 라벨 바탕까지 선 그림이다). `KeyValue` 는 바꾸지 않는다.

## 3. 3단계 `Field` 와 맞물림

### 라벨 칸 · 값 칸 = `Field` 의 `label` · `value` 조각

3단계는 두 길을 남겼다 — (1) `Field` 뿌리를 `display: contents` 로 풀어 두 조각을 격자 칸에 바로 놓기 (2) 표 뷰가 자식 `Field` 의 두 조각을 칸에 나눠 그리기. **이 설계는 셋째 길 — CSS subgrid — 을 고른다.**

| | (1) `display: contents` | (2) 표 뷰가 나눠 그림 | **(3) subgrid** |
| --- | --- | --- | --- |
| `Field` 뿌리의 상자 | **없다** — `getBoundingClientRect` 가 0 이다 | 뿌리를 안 그린다 | 있다 — 쌍 폭(트랙 둘 × 몫)을 덮는다 |
| 에디터(고른 노드 외곽선 · 놓기 판정 `canvas-drop.ts` 의 노드 상자 · 끌기 손잡이) | 상자가 0 이라 깨진다 | 노드 뿌리가 없어 `data-wb-id` 를 걸 요소가 없다 | 그대로 |
| 마커(코멘트 번호 · 7단계 Object Description) | 기준 상자가 없다 | 같다 | 뿌리 상자 그대로 · 조각 기준도 된다 |
| 접근성(`group` + 라벨 이름) | 상자 없는 요소의 역할을 브라우저가 판마다 다르게 다룬다(재야 한다) | 뷰마다 다시 지어야 한다 | DOM 이 그대로다 — FX-CI 의 조각 접근 이름(`packages/theme-kit/build-test/field-a11y.test.ts`)이 그대로 선다 |
| 계약 변화 | 없음(CSS) | 큼 — 부모 뷰가 자식 뷰 속(조각)을 못 연다. 렌더러가 `Field` 를 조각째 넘기는 새 길이 든다 | 없음(CSS) + `Field` 뷰는 두 조각을 뿌리의 직계로 그려야 한다(지금 그렇다 — `wb-theme check` 로 잰다) |
| 브라우저 | — | — | `grid-template-columns: subgrid` — Chrome 117 · Safari 16 · Firefox 71 |

```css
/* SDK 기본 CSS(특이도 0) — 꼴만. subgrid 의 `Field` 에는 `align-items` 를 안 건다(격자 기본 `stretch` — 라벨 칸이 줄 높이를 채운다). */
[FormTable] > [data-wb-part=cells] {
  display: grid;
  grid-template-columns: repeat(var(--wb-node-formtable-columns, 1), var(--wb-form-labelWidth, 8rem) minmax(0, 1fr));
}
[FormTable] > [cells] > * { grid-column: span calc(2 * var(--wb-node-weight, 1)); }   /* 아래 «몫 변수» */
[FormTable] > [cells] > [Field], [FormTable] > [cells] > [filler] {
  display: grid; grid-template-columns: subgrid;
}
[FormTable] > [cells] > [Field] > [data-wb-part=value] { grid-column: 2 / -1; }
```

- **같은 노드 · 같은 뷰다** — 표 밖에 선 `Field`(카드 · 열을 안 정한 검색폼 · 배치 안)는 지금처럼 라벨 위 · 값 아래다. 폼 표 안의 `Field` 만 부모 규칙(subgrid)이 두 조각을 트랙에 놓는다. `Field` 의 DOM · 뷰 계약은 안 바뀐다.
- **`Field` 가 아닌 자식**(빈 쌍 · 단추 · 글 · 그리드)은 쌍 폭을 한 칸으로 덮는다(subgrid 없이 블록).
- **필수 `*`** — 라벨의 것 그대로(`data-wb-state~="required"`). 설계서는 별을 라벨 **앞**에 붙인다 — 기본테마가 `Field` 별을 `::before` 로 옮긴다(표 안팎 모두 — 설계서 전부가 앞붙임이다).
- **접근 이름** — 바뀌지 않는다. `Field` 는 라벨 이름의 `group`, 값 칸의 입력 조각은 렌더러가 지은 필드 이름(`ViewProps.field`)을 제 이름 · `aria-required` 로 편다(`render.tsx` 의 `fieldNames`). 폼 표 뿌리는 역할 없는 `div` 다 — 제목이 있으면 `role=group` + `aria-labelledby`(제목 조각)로 표 하나를 이름 붙은 묶음으로 낸다.
- **마커** — `Field` 뿌리 상자가 있어 지금 자리 규칙 그대로다. 7단계가 라벨 칸 · 값 칸에 따로 표지를 붙이려면 `Field` 의 조각을 기준 상자로 삼는 길(`<Focus>` 꼴)을 그 단계가 정한다 — 두 조각이 뿌리의 직계라 막을 것이 없다.

## 4. 검색폼과의 관계

**문서 모델은 이미 같다** — `SearchForm.columns`(1 ~ 4 · 기본값 없음) = 한 줄의 필드 수, 필드의 몫 = 차지할 칸 수, 렌더러가 열 수로 자른다(`weightRoom` 의 `span`). 폼 표의 `columns` · 몫과 뜻이 같다. **옮길 문서가 없다.**

다른 것은 그림이다 — 지금 열을 정한 검색폼은 필드마다 한 칸(라벨 위)이고, 설계서의 검색폼은 `라벨|컨트롤|라벨|컨트롤` 격자(라벨 흰 바탕 굵은 글 · 칸 선 없음 · 빈 쌍은 비워 둠)다.

**열을 정한 검색폼을 폼 표와 같은 쌍 격자로 그린다(Q1).**

| 무엇 | 바뀌는 것 |
| --- | --- |
| SDK 기본 CSS(`inputCssBlocks`) | **안 바뀐다**(필드 하나 = 같은 폭 칸 하나). 쌍으로 바꾸면 «필드 하나 = 트랙 하나» 로 덮어 둔 SDK 1.5.0 이하 테마(기본테마 1.5.0 에 고정된 프로젝트)에서 필드가 두 트랙씩 덮어 열이 깨진다 — main 시딩 DB 판에서 쟀다(«상태» 필드 폭 26px). 쌍 격자는 테마의 몫이다 |
| 기본테마 | 열을 정한 검색폼을 쌍 격자로 — 트랙 `repeat(열 수, 라벨 폭 minmax(0, 1fr))` · 자식 `span calc(2 * var(--wb-node-weight, 1))` · `Field` subgrid · 값 칸 `2 / -1`. 라벨은 흰 바탕 굵은 글 · 칸 선 없음. 640px 아래는 지금처럼 한 줄에 필드 하나(라벨 위) |
| 빈 쌍 | 검색폼 뷰는 채우지 않는다 — 검색폼의 빈 쌍은 선 없는 빈자리라 그릴 것이 없다(`pairRows` 를 쓰지 않는다) |
| `SearchFormView` · `searchFormFieldsAttrs` | 안 바뀐다 — 셀렉터가 이미 `[data-wb-columns]` 다 |
| 열을 안 정한 검색폼 | 안 바뀐다(필드가 옆으로 서고 넘치면 접힌다) |
| 케이스 | `apps/web/build-test/searchform-columns.test.ts`(칸 폭 · 몫 칸 수 단언이 쌍 폭으로) · 갤러리 표본 |
| 정본 | §5 표의 `SearchForm` 줄(«필드를 그 수의 같은 폭 칸» → «쌍 격자») · §6.1 의 `data-wb-columns` 줄 |


## 5. 표 밖 구역 제목

설계서의 «구역 제목 + 오른쪽 단추» 는 폼 표 위(«계정상태 정보» · «처리정보 [처리이력조회]» · «과정정보 [교육일정 생성]»), 그리드 위(«강의 이력 [엑셀다운로드]»), 팝업 안 목록 위에 선다. 굵은 큰 글이고 상자가 없다.

| 길 | 무엇이 되나 |
| --- | --- |
| **(가) 폼 표의 `title` + «머리 오른쪽» 구역(Q4)** | 폼 표 하나가 제 머리줄을 갖는다 — `title` 이 비면 머리줄째 없다(`CardView` 의 규칙). 그리드 위 제목은 `List` 의 결과 머리줄 구역이 이미 맡는다(2단계) — 덩어리마다 제 머리를 갖는 꼴이 하나로 선다. 표지 하나가 «구역 제목» 에 붙는다 |
| (나) 지금 장치 — `Flex`(양끝) > `Text` + `Button` | 노드 셋 · 짓는 것 없음. 모듈로 저장해 다시 쓴다. 표와 제목이 따로 움직인다(제목만 상태로 숨는 판이 생긴다) |
| (다) `Card` 머리 | 상자 · 테두리가 선다 — 설계서의 «상자 없는 구역 제목» 과 다르다 |
| (라) `Section` | 머리 구역이 없다 |

- 머리줄 DOM: `div[data-wb-part=header]` > `div[data-wb-part=title]` · `<Zone name="headEnd" data-wb-part=headEnd>` — `CardView` 의 조각 이름과 같다.
- 제목 없이 오른쪽 단추만인 머리줄도 선다(`headEnd` 가 차면 머리줄이 선다 — `CardView` 와 같다).

## 6. 좁은 창

**테마의 몫이다.** 계약이 정하는 것은 둘이다 — 빈 쌍은 `filler` 조각이라 테마가 숨길 수 있다 · 옆 칸은 `aside` 조각이다.

기본테마(640px 아래 — 지금 문턱):

| 꼴 | 390 에서 |
| --- | --- |
| 쌍 격자(1쌍 · 2쌍 · 전폭) | 한 줄에 쌍 하나 — 트랙을 `minmax(0, 1fr)` 하나로, 몫을 걷는다(`grid-column: auto`). 라벨 위 · 값 아래(지금 `EntryForm` 안 `Field` 의 좁은 창 규칙과 같다 — 라벨 칸 8rem 이 390 폭의 값 칸을 반으로 줄인다) |
| 빈 쌍 | 숨긴다(`display: none`) — 안 숨기면 빈 줄이 된다(`KeyValue` 의 `filler` 와 같은 까닭) |
| 옆 칸(사진) | 표 위로 — 머리줄 · 옆 칸 · 칸이 세로로 쌓인다 |
| 값 칸 안의 그리드 · 하위 표 | 그 컴포넌트의 좁은 창 규칙(5 · 6단계) |
| 열을 정한 검색폼 | 지금 그대로 한 줄에 필드 하나 |

**SDK 기본 CSS 도 같은 판을 특이도 0 으로 둔다**(`@media (max-width: 640px)`) — 테마가 쌍 격자를 안 꾸민 판(스타터 테마의 첫 모습)에서 390 폭의 2열 표가 라벨 칸 8rem 둘로 값 칸을 눌러 한 줄 조각이 꺾이고 날짜 칸이 넘친다. 쌍 격자를 꾸미는 테마는 제 규칙으로 덮는다.

넘침은 `wb-theme shots` 가 실 Chromium 에서 잰다(«7»).

## 7. 테마 뷰 계약 · 기본테마

### 기본 뷰(SDK)

| 뷰 | DOM |
| --- | --- |
| `FormTableView`(새) | `Root div`(제목이 있으면 `role=group` · `aria-labelledby`) > [`div[data-wb-part=header]` > `div[data-wb-part=title]` · `Zone headEnd`] · [`Zone aside data-wb-part=aside`] · `div[data-wb-part=cells]{...formTableCellsAttrs(columns)}` > `pairRows(items, columns)` 차례로 자식 · 빈 쌍 |
| `FieldView` | 안 바뀐다(빈 라벨이면 `role` · `aria-labelledby` 를 거둔다) |
| `EntryFormView` · `SearchFormView` | 안 바뀐다 |

- **계약에 더하는 것** — `ViewItem.span`(자른 몫 · 부모가 `span` 자리일 때만) · `pairRows(items, columns)` · `formTableCellsAttrs(columns)` · `FORMTABLE_COLUMNS_VAR`. SDK 판을 올린다(1.5.0 → 1.6.0 — 카탈로그 타입이 늘어 테마의 `views` 키 검사가 새 타입을 알아야 한다).
- **`<table>` 이 아니다** — `Field` 뿌리가 `<tr>` · `<td>` 가 될 수 없고(뷰가 `Root div[role=group]` 이다), 값 칸에 그리드 · 하위 표가 들어 표 안의 표가 된다. 자료 표가 아니라 폼 배치라 «이름 붙은 묶음의 줄» 이 맞는 의미다. 칸 선은 테마 CSS 가 긋는다.
- **subgrid 가 기대는 것** — `Field` 뷰가 `label` · `value` 조각을 뿌리의 **직계**로 그린다. 감싸는 요소를 끼운 테마 `FieldView` 는 폼 표 안에서 두 조각이 트랙에 안 선다 → `wb-theme check` 규칙으로 잰다(아래).

### 몫 변수

- **몫 변수는 자손 노드에 안 물려진다** — `@property` 등록은 없지만 SDK 기본 CSS 가 모든 노드 뿌리에서 `--wb-node-weight: initial` 로 끊는다(특이도 0 · 몫이 있는 노드만 인라인으로 다시 싣는다). 열을 정한 검색폼에서 몫 2 필드 안의 `Input{size: short}` 는 몫 없는 필드 안의 같은 조각과 폭이 같다(실 Chromium — `apps/web/build-test/searchform-columns.test.ts` «몫을 준 필드 안의 조각은 그 몫을 물려받지 않는다» · 그 초기화 규칙을 걷으면 조각이 칸을 채운다). `@property` 를 더하지 않는다.
- **노드가 아닌 요소는 물려받는다** — 폼 표의 빈 쌍(`filler`)이 그렇다(몫을 준 폼 표 안의 빈 쌍). 그래서 빈 쌍 규칙은 몫 변수를 안 읽고 `span 2` 다.
- 쌍 폭은 몫 변수를 그대로 쓴다(`span calc(2 * var(--wb-node-weight, 1))` — Chrome 이 `span` 에 수식을 받는다: `apps/web/build-test/form-table.test.ts` «칸 흐름» 의 전폭 · 자른 몫).

### 기본테마(`system-admin`)

- **뷰 없이 `theme.css` 로 꾸민다** — 폼 표: 바깥 선 · 칸 선(`--wb-semantic-border`), 라벨 칸 `--wb-semantic-canvas` 바탕 · 굵은 글(`KeyValue` 키 칸과 같은 토큰), 값 칸 흰 바탕, 머리줄 제목 `h5` 글. 빈 쌍은 라벨 바탕 · 칸 선만.
- **`[EntryForm] [Field]`(자손) 규칙을 직계로 좁힌다**(`[EntryForm] > [row] > [Field]`) — 자손이면 폼 표 안 `Field` 와 값 칸 안 `Field` 에 두 칸 격자가 겹친다. 입력폼 몸통에 바로 선 필드는 지금처럼 라벨 칸 + 값 칸(칸 선 없음)이다.
- **필수 별을 앞으로** — `Field[data-wb-state~=required] > label::before`.
- 입력폼 단추줄의 왼쪽 여백(라벨 폭)을 걷는다 — 설계서의 단추줄은 표 아래 **오른쪽**이다(`justify-content: flex-end`).
- 판을 올리고 `checksums.json` 에 새 줄을 더한다.

### 스타터 템플릿 · 갤러리 · `wb-theme check` · `shots`

- **스타터 템플릿**(`packages/theme-kit/template`) — `FormTable` 뷰를 안 짓는다(SDK 기본 뷰로 선다). `template/src/views/input.tsx` 는 SDK 파일을 옮긴 것이라 새 뷰가 저절로 온다 — `src/index.tsx` 의 `views` 표에 넣을지는 구현이 그 파일의 관례(SDK 뷰를 다 적는다)를 따른다. `SKILL.md` 의 카탈로그 목록 · «`Field` 뷰는 두 조각을 직계로» 한 줄을 더한다.
- **갤러리**(`packages/theme-gallery/src/samples.ts`) — `FormTable` 표본 넷: 1쌍 다섯 줄(필수 · 조합 입력 · 여러 줄) · 2쌍 + 전폭 + 끝 빈 쌍 + 넓은 칸 구멍 · 제목 + 머리 오른쪽 단추 · 옆 칸(자리표시자). `EntryForm` 표본은 몸통을 폼 표로. 열을 정한 `SearchForm` 표본(Q1).
- **`wb-theme check`**(`packages/theme-kit/src/check.ts` — jsdom) — 새 규칙 «폼 표 안 `Field` 의 직계에 `label` · `value` 조각» 과 «빈 쌍 수가 `pairRows` 셈과 같다»(테마 뷰가 빈 쌍을 안 그리면 잡힌다). 새 타입은 갤러리를 그리며 저절로 잰다.
- **`wb-theme shots`**(`packages/theme-kit/src/shots.ts` — 실 Chromium) — 2쌍 표의 긴 라벨 · 긴 값이 칸 밖으로 넘치는지 · 칸 안에서 꺾이는지(3단계가 잡게 한 «칸 안에서 꺾이는 글»)를 1280 · 390 에서. subgrid 판에서 라벨 칸 높이 = 같은 행 값 칸 높이(키 큰 행)를 한 표본으로.

## 8. 에디터

이름으로 적는 입구는 `git grep` 으로 센 지금 것이다 — 구조 트리 줄 `…`(`apps/web/src/panels/tree-row-actions.tsx`): 별칭 바꾸기 · 종류 바꾸기… · 위로 · 아래로 · 들여쓰기 · 내어쓰기 · 삭제 · 모듈로 저장…. 편집 단축키(`apps/web/src/edit/editor-shortcuts.ts` 의 `edits: true`): 되돌리기 · 다시 실행 · 고른 노드 삭제 · 복제(바로 뒤에) · 위로 · 아래로 · 내어쓰기 · 들여쓰기 · 별칭 바꾸기.

| 하는 일 | 걸음 | 새로 짓나 |
| --- | --- | --- |
| 쌍 더하기 | 팔레트 «입력 필드» — 필드를 고르면 그 뒤에, 폼 표를 고르면 몸통 끝에(지금 «넣기» 규칙) · 캔버스 끌기 · 복제 Cmd+D | 없음 |
| 쌍 옮기기 | 구조 트리 끌기 · 캔버스 끌기(2쌍이면 가로 띠 — `axisOf` 가 형제 상자로 읽는다) · 위로 / 아래로(Alt+↑ ↓) | 없음 |
| 2쌍 ↔ 1쌍 | 폼 표 «열 수» | 없음 |
| 전폭 행 | 필드 «몫» = 열 수(또는 12) | **«몫» 칸의 안내 한 줄** — 부모가 쌍 격자(폼 표 · 열을 정한 검색폼)면 칸 밑에 «차지할 쌍 수 — 열 수 이상이면 한 줄 전체» |
| 사진 칸 | 팔레트 «자리표시자» 를 «옆 칸» 에 끌어 놓기(끄는 동안 빈 구역 칸) · 구조 트리의 «옆 칸» 구역 줄 | 없음 — 2단계 구역 줄 · 빈 구역 칸 |
| 구역 제목 단추 | «머리 오른쪽» 구역에 끌어 놓기 | 없음 |
| 사진 칸 · 라벨 rowspan 의 속성 칸 | — | 없음(rowspan prop 이 없다) |

- **받는 규칙(`accepts`)이 안 생긴다** — 폼 표 몸통 · 옆 칸 · 머리 오른쪽 모두 무엇이든 받는다. 그래서 부모를 바꾸는 입구 전부(끌기 · 넣기 · 붙이기 · 모듈 넣기 · 들여쓰기 · 내어쓰기 — `docs/superpowers/plans/2026-10-23-rv-ze-report.md` H1 의 셈)를 다시 셀 일이 없다.
- **들여쓰기는 앞 필드의 값 칸으로 들어간다** — 폼 표에서 필드를 들여쓰면 앞 필드 값 칸 안의 필드가 된다(3단계 이월 «설계가 받는 꼴»). 폼 표에서 이 꼴이 더 자주 난다 — 이월에 남긴다(바꾸려면 «`Field` 의 값 칸은 들여쓰기 대상이 아니다» 를 정하는 별 결정).
- **구조 트리** — 폼 표는 구역이 셋이라 «머리 오른쪽» · «옆 칸» · «칸» 구역 줄이 선다(2단계 «몸통 하나뿐인 노드는 지금과 같다» 의 반대편). 입력폼 > «항목» > 폼 표 > «칸» > 필드 > 조각 — 깊이 다섯.
- **빈 구역 칸** — 끄는 동안 폼 표마다 «머리 오른쪽» · «옆 칸» 빈 칸이 선다(2단계 Q2 (가)). 끌기 시작에 배치를 한 번 미는 2단계 이월이 폼 표에서도 선다. 옆 칸이 표 왼쪽에 서면 칸 폭이 그만큼 준다 — 끌기 판의 겨눔 상자는 `dragLayoutSettled` 뒤에 잰다(AGENTS.md 「워커에게 맡길 때」 의 «끄는 동안만 서는 캔버스 그림»).
- **캔버스 레이아웃 안내선**(`apps/web/src/canvas/layout-guides.tsx`) — 폼 표의 칸 흐름은 `Grid` 처럼 칸 경계를 보일지 구현이 정한다(없어도 막히지 않는다).

## 9. 그 밖의 소비자

| 소비자 | 바뀌는 것 |
| --- | --- |
| 봉투 · 문서 판 | 없다 — 새 필드가 없고 옛 꼴(입력폼 몸통의 필드)이 그대로 맞다. `CURRENT_DOCUMENT_VERSION` 을 안 올린다 |
| 검증(`validate.ts`) | 새 타입의 props 규격(카탈로그) |
| 카탈로그 검사(`catalog/index.ts` 의 `assertZoneReferences`) | `FormTable.body.initial` 의 `Field` · `EntryForm.body.initial` 의 `FormTable` 을 본다 |
| lint `structural-gap` | `STRUCTURAL_GAPS` 에 `{ container: 'FormTable', requires: 'Field' }` 를 더한다. 입력폼 줄은 그대로 참이다(`hasDescendant` 가 손자를 센다) |
| 상호작용 | 트리거 × 타입 표가 없다 — 그대로 |
| 몫(`weightRoom`) | `FormTable` → `span`(열 수). 속성 패널 «몫» 칸이 같은 함수라 저절로 선다 |
| prop 표지(`marks.ts`) | 없다 — `columns` 는 수, `title` 은 글 |
| 사람이 부르는 이름(`interaction/describe.ts` 의 `LABEL_PROPS`) | `FormTable: 'title'` — 비면 «폼 표» |
| 내보내기 — HTML 번들 | 렌더러 그대로. `nodesOnly` · 문장은 `childLists` 를 지나 세 구역을 돈다 |
| 내보내기 — PPTX | 화면 이미지(번들을 브라우저로 찍은 것 — `packages/exporter/src/pptx/index.ts` 머리말)라 표는 그림으로 실린다. 따로 없다 |
| 화면 캡처(`apps/api/src/services/screen-render-chromium.ts`) | 렌더러 그대로 — subgrid 를 Chromium 이 그린다 |
| MCP · CLI | 도구 변화 없음 — `get_page` · `page get` 이 트리를 돈다 |
| `/llms.txt` | props · 구역 · «Create with»(`initial`)는 정의에서 저절로. **영어 한 줄 표(`apps/web/config/llms-txt.ts`)는 손으로 더한다** — 표 키가 `CATALOG_DEFS` 와 같아야 한다는 케이스가 빠짐을 잡는다. 생성 파일 `apps/web/public/llms.txt` 를 다시 낸다 |
| 팔레트 · 축소판 | 카탈로그에서 짓는다 — 축소판은 갤러리 첫 표본(`palette-thumbs.tsx`). `input` 갈래가 12 → 13 |
| 개수 하한 | `apps/web/build-test/palette.test.ts` 의 카드 ≥ 17 은 그대로 참. `packages/theme-kit/build-test/dev.test.ts` 의 `kinds` 29 → 30 · `.sample-card` 수, `shots.test.ts` 의 폴백 항목 목록(둘은 `test:build:serial` 갈래 — AGENTS.md 「수를 셀 때」 덧붙임) |
| 붙이기 · 모듈 · 복제 | 그대로 — 폼 표는 보통 노드 |
| 실시간 · 잠금 · 리베이스 | 그대로 — 구역은 2단계 경로 |
| 마이그레이션 `0031` | Q2 — 아래 |

### `0031-entry-form-table`(Q2)

- **무엇** — `EntryForm` 몸통에서 **잇단 `Field` 의 묶음마다** 그 묶음을 `FormTable`(`columns` 없음 = 1) 하나로 감싼다. `Field` 가 아닌 몸통 자식은 그 자리에 그대로 둔다(묶음을 끊는다). `Field` 노드 자체(id · props · 값 칸 · 몫 · 표지 · 별칭 · 상태 보임 · 상호작용)는 그대로 옮긴다. 새 폼 표 id 는 그 문서(묶음) 안에서 안 겹치게(`n_` + 소문자 hex 12 — `0028` · `0029` 와 같은 꼴).
- **몫** — 입력폼 몸통은 몫을 안 읽어(`weightRoom` 이 `undefined`) 필드에 몫이 있었어도 화면에 뜻이 없었다. 폼 표 안에서는 1쌍 표라 자르기로 1 이 된다 — 화면이 안 바뀐다. 값은 그대로 둔다.
- **자리** — 문서가 사는 자리 전부: 페이지 · 레이아웃 · 프로젝트 모듈 · 개인 모듈 · 스냅샷 payload 의 `pages[]` · `layouts[]`(`0028` · `0029` 와 같은 자리 — 남은 옛 판 0 셈은 `apps/api/test/node-zones-migration.test.ts` 의 `formsIn` 처럼 키를 가리지 않고 걷는다).
- **좌표** — 필드의 경로가 바뀐다(`…/children/i` → `…/children/k/children/j`). `revisions` 는 안 옮긴다(옮기기 전 편집의 되돌리기는 옛 좌표라 건너뛰거나 거절된다 — `0028` 과 같다). **`head_seq` 를 올린다** — 2단계 이월(«`0028` 이 `head_seq` 를 안 올린다» — `2026-10-23-rv-ns-report.md` 발견 7)과 같은 길이 여기서는 **엉뚱한 노드를 고칠 수 있다**(감싼 뒤 옛 `…/children/1` 이 다른 노드를 가리킨다). 옮긴 문서의 `head_seq` 를 하나 올려 옛 바탕의 편집이 `stale` 로 거절되게 한다(구현이 그 열 · 레이아웃 · 모듈 표의 판 열을 센다).
- **되돌리기(`down`)** — 감싼 폼 표를 푼다(이 마이그레이션이 지은 표만 — 표지 열이 없으면 «제목 없음 · 열 수 없음 · 자식이 다 `Field`» 인 폼 표). 사람이 지은 같은 꼴의 표도 풀린다 — 배포가 없어 받는다.
- **사용자 개발 DB** — 병합 전에 덤프를 뜨고(`0029` · `0030` 과 같은 절차 — 로드맵 진행 기록) `0031` 을 적용한다(코디네이터 몫).

## 10. 뒤 단계를 막지 않는다

| 뒤 단계 | 들어갈 자리 | 막는가 |
| --- | --- | --- |
| 5 그리드 · 페이지네이션 | `Field` 값 칸(`accepts` 없음) · 폼 표 몸통의 전폭 자식 | 아니다 — 값 칸이 키 큰 행을 만들면 라벨 칸이 늘어난다 |
| 6 파일첨부 위젯 | `Field` 값 칸 | 아니다 |
| 6 반복 행 표 · 팝업으로 채우는 하위 표 | `Field` 값 칸(설계서의 «라벨 칸 + 값 칸 안 [추가] + 하위 그리드») | 아니다 |
| 6 팝업 페이지 | 팝업 안 폼 표 · 정보표 | 아니다 — 폼 표는 입력폼 밖에도 선다 |
| 7 상태별 속성 | 폼 표의 `columns` · `title` · 필드의 `required` 가 상태마다 다른 꼴 | 아니다 — 보통 prop 이다 |
| 7 화면 정보 | 쪽 머리 메타 표(`화면명 \| 값 \| 화면ID \| 값 …`)는 페이지 정보 탭의 몫(로드맵 R4) — 폼 표로 그리지 않는다 | — |
| 7 Object Description | 표지가 `Field`(라벨 · 값 칸) · 폼 표 머리 제목 · 값 칸 조각에 붙는다 — 모두 노드 | 아니다 — 조각 기준 자리는 «3» |
| 읽기 전용 정보표 | 지금 `KeyValue`(값이 글뿐 · 칸마다 표지 못 닮)와 폼 표 + 값 칸 `Text`(칸마다 표지) 둘 다 선다 | 아니다 — 둘을 합칠지는 7단계가 표지를 칸에 붙일 때 정한다 |

---

## 11. 구현을 나누는 법

**한 트랙(FT)이다.** 에디터 몫이 «몫» 칸 안내 한 줄뿐이고, 나머지(카탈로그 · 렌더러 · SDK · 기본테마 · 갤러리 · 템플릿 · check · `/llms.txt` · lint · `0031`)는 서로의 산출물을 차례로 쓴다. 둘로 나누면 겹치는 파일(아래)에서 SDK · 기본테마 판 올림과 `checksums.json` 줄을 두 번 하게 된다.

### 차례(트랙 안)

1. 몫 변수 상속 재현(열을 정한 검색폼 · 실브라우저) → `@property` 고침 — 지금 main 에서도 서는 결함이라 먼저 잠근다.
2. 카탈로그 `FormTableDef` · `EntryForm.body.initial` · `STRUCTURAL_GAPS` · `LABEL_PROPS`.
3. 렌더러 `weightRoom('FormTable')` · `ViewItem.span`.
4. SDK `FormTableView` · `pairRows` · `formTableCellsAttrs` · 기본 CSS(폼 표의 쌍 격자 · subgrid · 좁은 창 — 열을 정한 검색폼의 쌍 격자는 기본테마가 건다(Q1 · 옛 테마 호환)) · 판 1.6.0.
5. 기본테마 CSS(폼 표 · 검색폼 쌍 격자 · 별 앞으로 · 입력폼 직계 규칙 · 단추줄 오른쪽 · 640px) · 판 · `checksums.json`.
6. 갤러리 표본 · 스타터 템플릿 · `wb-theme check` 규칙 · `shots` 표본 · 개수 하한(`dev.test.ts` · `shots.test.ts`).
7. `/llms.txt` 영어 표 · 생성물.
8. 속성 패널 «몫» 안내.
9. `0031`(Q2).
10. 정본 · `apps/api/README.md`(마이그레이션 목록이 있으면).

### 겹치는 파일(다른 트랙이 나란히 돌 때)

| 파일 | 왜 겹치나 |
| --- | --- |
| `packages/schema/src/component/catalog/{input,index}.ts` | 카탈로그 타입 · 기본 내용 |
| `packages/theme-sdk/src/version.ts` · `default-views/{index,input}.tsx` · `types.ts` | SDK 판 · 뷰 등록 · `ViewItem` |
| `system-themes/admin/{src/theme.css,package.json,checksums.json}` | 기본테마 판 — 뒤에 병합하는 쪽이 합친 판에서 sha256 을 다시 잰다(AGENTS.md 「수를 셀 때」 덧붙임) |
| `packages/theme-gallery/src/samples.ts` | 표본 |
| `apps/api/src/db/migrations/0031-*` | 번호 |
| `packages/theme-kit/build-test/{dev,shots}.test.ts` · `apps/web/build-test/palette.test.ts` | 개수 하한 |
| `apps/web/config/llms-txt.ts` · `apps/web/public/llms.txt` | 영어 표 · 생성물 |

5단계(그리드)를 나란히 돌리면 위 표가 거의 다 겹친다 — 차례로 돈다.

### 크기

**M ~ L.** 카탈로그 한 타입 + 뷰 하나 + `pairRows`(셈 · 단위 케이스) + 기본 CSS · 테마 CSS(subgrid · 640px) + 실브라우저 판(쌍 폭 · 키 큰 행 · 빈 쌍 · 옆 칸 · 390 접힘 · 검색폼 쌍 격자 · 몫 상속) + `0031`(S — `0028` 꼴, 감싸기라 더 작다) + 개수 하한. 기존 케이스 셈: `type: 'EntryForm'` 이 든 케이스 파일은 대부분 몸통을 손으로 짓는 픽스처라(`createNode` 를 거치지 않는다) 그대로 맞다 — `createNode('EntryForm')` 의 결과를 단언하는 케이스(`apps/web/test/edit/create-node.test.ts` · `apps/web/build-test/form-primary-button.test.ts`)와 입력폼 안 필드의 라벨 칸 폭 · 별 자리를 재는 실브라우저 판이 바뀐다(«소비자 조사 — 다시 재는 법»).

---

# 정한 것(사용자 답)

넷 다 (가)다.

| 물음 | 정한 것 | 화면에서 |
| --- | --- | --- |
| Q1 열을 정한 검색폼도 «라벨 왼쪽 쌍 격자» 인가 | 그렇다 — 폼 표와 같은 격자 | 열 수를 정한 검색폼의 라벨이 입력칸 왼쪽에 서고 쌍마다 칸이 맞는다. 칸 선 · 회색 라벨 바탕은 없다. 열을 안 정한 검색폼은 그대로 |
| Q2 지금 입력폼의 필드를 폼 표로 옮기나 | 옮긴다 — `0031` | 사용자 개발 DB 의 입력폼이 칸 선 · 회색 라벨 칸 표로 열린다(필드는 그대로 · 1쌍 표) |
| Q3 사진 칸 | 폼 표의 «옆 칸» 구역 | 자리표시자 · 단추를 «옆 칸» 에 넣으면 표 왼쪽에 모든 행 높이로 서고 칸 선이 이어진다. 끄는 동안 모든 폼 표 왼쪽에 빈 «옆 칸» 칸이 선다 |
| Q4 표 밖 구역 제목 | 폼 표 «제목» + «머리 오른쪽» 구역 | 제목이 표 위 굵은 줄로 서고 단추가 그 줄 오른쪽에 선다. 끄는 동안 폼 표마다 빈 «머리 오른쪽» 칸이 선다 |

---

## 소비자 조사 — 다시 재는 법

워크트리 뿌리에서.

```bash
# 폼 몸통 · 필드 값 구역이 받는 타입(accepts 가 없음을 본다)
git grep -n -B1 -A3 "name: 'body'" -- packages/schema/src/component/catalog/input.ts
# 몫이 듣는 부모
git grep -n -A8 'export function weightRoom' -- packages/renderer/src/render.tsx
# 몫 변수의 상속 장치(없으면 0 줄)
git grep -n -E '@property|inherits' -- packages/theme-sdk/src system-themes/admin/src
# 입력폼 안 필드를 자손으로 잡는 테마 규칙
git grep -n '\[data-wb-component="EntryForm"\] \[data-wb-component="Field"\]' -- system-themes packages/theme-kit/template
# lint 구조 공백 표
git grep -n -A3 'const STRUCTURAL_GAPS' -- packages/schema/src/lint/design.ts
# 부모를 바꾸는 편집 단축키 · 구조 트리 줄 행동
git grep -n -B3 'edits: true' -- apps/web/src/edit/editor-shortcuts.ts | grep label
git grep -n -E "item\('|label: '" -- apps/web/src/panels/tree-row-actions.tsx
# createNode('EntryForm') 결과에 기대는 케이스
git grep -n -l -E "createNode\('EntryForm'" -- '*.test.ts' '*.test.tsx'
# 개수 하한
git grep -n -E 'toBeGreaterThanOrEqual\([0-9]+\)|kinds\)\.toBe' -- apps/web/build-test/palette.test.ts packages/theme-kit/build-test
# 마지막 마이그레이션
ls apps/api/src/db/migrations | tail -2
```
