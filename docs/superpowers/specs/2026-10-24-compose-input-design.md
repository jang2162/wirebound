# 조합 입력 · 선택지 · 자리표시자 — 설계

로드맵 `docs/superpowers/plans/2026-10-22-skala-roadmap.md` 의 «모자란 것» 2 · R5 · «정한 것» A · «단계» 3 이다. 두 문제를 함께 적는다 — **문제 1 조합 입력**(한 값 칸에 조각 여럿 · 선택지 · 시간 · 세그먼트 · 칩)과 **문제 2 자리표시자 개선**(색 · 테두리 · 글 · 여백 · 그림 올리기 · 자식). 둘은 서로 기대지 않는다(«구현을 나누는 법»).

이 문서는 발행 시점의 기록(spec)이다. 구현이 병합되면 정본 설계서(`docs/superpowers/specs/2026-08-03-wirebound-design.md`)의 「페이지 스키마 노드」 · 「컴포넌트 카탈로그」 · 「컴포넌트 정의 구조」 · 「노드 속성」 · 「설계서 화면 구조」 · 「권한 모델」 · 「모듈」 · 「HTML 정적 번들」 · 「`/llms.txt`」 와 `apps/api/README.md` · `docs/guides/deploy-docker.md` 가 지금 참인 것을 갖는다. 이 설계는 정본을 고치지 않는다 — 구현 차수가 고친다.

2단계의 구역 모델(`docs/superpowers/specs/2026-10-23-node-slots-design.md` — `zones` · `childLists` · `accepts` · `initial` · `<Zone>`)이 병합된 판 위에 선다.

---

## 이 설계가 고른 것 — 한눈에

| 물음 | 고른 것 | 이유(한 줄) |
| --- | --- | --- |
| `Field` 의 꼴 | **(가) `Field` = 라벨(prop) + «값» 구역(몸통)** · 새로 만들면 값 구역에 `Input` 하나가 든다 | 흔한 꼴이 팔레트 한 걸음 그대로다(`initial`). 컴포넌트가 둘로 갈리지 않는다 |
| 조각 | 새 타입 아홉 — `Input` · `TextArea` · `Select` · `DateInput` · `TimeInput` · `CheckboxGroup` · `RadioGroup` · `Chip` · `Affix`(사이 글자). 단추는 `Button` 을 다시 쓴다 | 설계서 꼴 전부가 이 아홉 + `Button` 의 줄 세우기로 선다(«조각 목록» 표) |
| 세그먼트 · 체크 칩 | **테마 변형** — `RadioGroup` 의 `segment` · `CheckboxGroup` 의 `chip`(사용자에게 물을 것 Q1) | 자료 모양이 같고 다른 것은 모양뿐이다 — 정본 「테마의 범위」 의 «형태가 다른 구조는 테마가 variant 로» |
| 선택지 | `options: { label, selected }[]` — 고른 것이 항목에 붙는다 | 항목을 옮겨도 고른 것이 따라간다. 하나 · 여럿 · 없음을 한 모양으로 |
| 폭 | 채우기는 노드 **몫**(`weight` — 값 구역이 `Flex` 처럼 몫을 읽는다) · 고정 폭은 `size` 표지(`short` · `medium` · `long`) | 몫은 이미 있는 장치다. 고정 폭의 실제 값은 테마가 정한다 |
| 조건부 딤드 | 지금은 `disabled` 를 켠 판을 그리고 조건은 코멘트로 — 7단계 «상태별 속성» 을 앞당기지 않는다 | 앞당기면 L 크기 · 7단계 설계 전체가 따라 온다 |
| 옛 `Field` | 문서 판 4 · `0029` 가 `control` 을 조각으로 옮긴다(Q3) | 판 2 → 3 과 같은 크기(S) · 사용자의 로컬 볼륨이 그대로 열린다 |
| 자리표시자 스타일 | **이 컴포넌트만** 스타일 prop 을 갖는다 — 색은 `#rrggbb` 자유 값(Q4) · 길이는 px 정수 · 뷰가 `--wb-node-placeholder-*` 변수로 싣는다 | 자리표시자는 카탈로그가 못 덮는 것을 그리는 탈출구다. 값의 꼴을 좁혀 CSS 주입을 막는다 |
| 그림 저장 | **내용 주소(sha256) 덩이 + 소유 행** — `asset_blobs` · `project_assets` · `personal_assets` · DB `bytea` | 권한은 소유 행이 가르고, 프로젝트 · 개인 모듈 사이 복사는 바이트 없이 소유 행 하나다. 배포 compose 에 볼륨이 안 는다 |
| 그림 읽기 · 쓰기 | 올리기 editor 이상 · 읽기 viewer 이상 · 파일 5 MB · 프로젝트 200 MB · 사람 100 MB(환경 변수로 바꾼다) · PNG · JPEG · WebP · GIF · SVG(Q7) | 프로젝트 문서 권한과 같은 축 · 테마 패키지 상한(10 MB)보다 작게 |
| 그림 지우기 | 프로젝트 · 사람과 함께만 지운다(Q5) | 스냅샷 · 되돌리기 · 모듈이 가리킬 수 있어 «안 쓴다» 를 싸게 셀 길이 없다 |
| 나누기 | **CI-A 조합 입력 · CI-B 자리표시자**를 다른 워크트리에서 나란히 — CI-A 를 먼저 병합하고 CI-B 가 판 올림(테마 · SDK)만 다시 한다 | 겹치는 파일이 판 번호 · 표 한 줄 꼴이라 rebase 가 기계적이다 |

---

# 문제 1 — 조합 입력

## 지금 모델이 기대는 곳

| 자리 | 지금 |
| --- | --- |
| 카탈로그 `packages/schema/src/component/catalog/input.ts` 의 `FieldDef` | props `label` · `control`(enum 9) · `placeholder` · `required` · `disabled` · `invalid`, `variantFrom: 'control'`, `zones: []` — 자식이 없다 |
| 기본 뷰 `packages/theme-sdk/src/default-views/input.tsx` 의 `FieldView` | `label` 조각 + `control` 조각(입력 종류별 역할 · `aria-label` · `aria-required` · `aria-invalid` — 표 `FIELD_ROLES`). 입력은 실제 `<input>` 이 아니라 안내 문구를 든 `div` 다 |
| 기본테마 `system-themes/admin/src/theme.css` | `[data-wb-component="Field"][data-wb-variant="…"]` 로 입력 종류마다 꾸민다(고르개 꺾쇠 · 여러 줄 높이 · 체크 · 라디오), 입력폼 안의 필드는 라벨 칸 · 입력 칸 두 칸(`[data-wb-component="EntryForm"] [data-wb-component="Field"]`) |
| 스타터 테마 `packages/theme-kit/template/src/views/input.tsx` · `template/SKILL.md` | 제 `FieldView` · «`Field` 에는 variants 를 선언할 수 없다(`control` 에서 파생)» |
| 갤러리 `packages/theme-gallery/src/samples.ts` | `Field` 표본 셋(`control` 별) · 폼 표본 안의 `Field` |
| 폼 | `SearchForm` · `EntryForm` 의 몸통 구역은 `accepts` 가 없다 — 무엇이든 받는다. `Field` 를 요구하는 것은 lint `structural-gap`(`packages/schema/src/lint/design.ts` 의 `STRUCTURAL_GAPS` — 경고)뿐이다 |
| 몫 | `packages/renderer/src/render.tsx` 의 `weightRoom` — `Flex` 는 `flex`, `Grid` · 열을 정한 `SearchForm` 은 칸 수. 속성 패널의 «몫» 칸도 같은 함수로 선다(`apps/web/src/panels/property-panel.tsx`) |
| 배열 prop 편집기 | `EditorControl` 의 `stringList` · `pairList`(`packages/schema/src/component/define.ts`) — 위젯은 `apps/web/src/panels/controls/list-control.tsx`(추가 · 지우기 · 고치기, **옮기기 없음**, 배열을 통째로 `replace`) |
| 상호작용 | 트리거는 컴포넌트를 가리지 않는다(`packages/schema/src/interaction/check.ts` 에 트리거 × 타입 표가 없다). 런타임은 `click` · `select` 를 `onClick`, `change` 를 `onChange`, `submit` 을 `onSubmit` 에 건다(`render.tsx` 의 `DOM_EVENT`) |
| 상태 → 접근성 | `packages/theme-sdk/src/marks.ts` 의 `STATE_ARIA`(`disabled` · `loading` · `invalid` · `required`) · prop 표지 `MARKED_PROPS` |

## 1. `Field` 의 꼴

### 후보

- **(가) `Field` = 라벨 + «값» 구역** — `label` · `required` 는 prop, 값 칸은 몸통 구역(`body`, 화면 이름 «값»)이고 그 안에 조각 노드를 줄 세운다. 새로 만들면 값 구역에 `Input` 하나가 든다(`initial`).
- **(나) `Field` 를 두고 «조합 필드» 를 새로** — `Field` 는 `control` 하나짜리로 남기고, 조각을 받는 `ComposeField` 를 더한다.
- **(다) `Field` 를 걷고 폼에 조각을 바로** — 라벨도 `Label` 조각으로 두고 폼의 몸통에 조각을 바로 줄 세운다.

### 견줌

| | (가) | (나) | (다) |
| --- | --- | --- | --- |
| 흔한 꼴(라벨 + 입력 하나) 넣기 | 팔레트 한 걸음 — `createNode` 가 `initial` 로 `Input` 을 넣는다 | 한 걸음(`Field`) | 두 걸음(`Label` · `Input`) — 라벨과 값이 짝이 아니다 |
| 다른 종류 하나(셀렉트 필드) | 한 걸음 + 조각 바꾸기(Q2 — 줄 행동 «종류 바꾸기» 면 두 번 누름) | 한 걸음 + `control` 고르기 | 두 걸음 |
| 조합 꼴 | 값 구역에 조각을 더 넣는다 | `ComposeField` 를 넣고 조각을 채운다 · 한 칸이 커지면 `Field` 를 `ComposeField` 로 바꿀 길이 없다 | 폼 몸통에 조각을 늘어놓는다 — 어느 조각이 어느 라벨 몫인지 문서가 모른다 |
| 같은 뜻의 컴포넌트 | 하나 | 둘 — 팔레트 · `/llms.txt` · lint(`structural-gap` 이 둘 다 세야 한다)가 둘을 가르쳐야 한다 | 없음 |
| 4단계(라벨\|값 폼 표) | 라벨 조각 · 값 조각이 노드 하나 안에 짝으로 있다 — 표 칸에 둘을 나눠 놓을 수 있다(«검색폼 · 입력폼과의 관계») | 두 타입을 다 다뤄야 한다 | 짝이 없어 표의 한 쌍을 지을 근거가 없다 |
| 조각에 표지 · 별칭 · 상태 보임 · 상호작용 | 된다(조각이 노드다 — 로드맵 A) | `ComposeField` 안에서만 | 된다 |
| `control` enum | 걷는다 — 종류가 조각 타입이 된다 | 남는다(다시 커진다: 시간 · 세그먼트 · 칩) | 걷는다 |

### 고른 것 — (가)

**`Field` 는 라벨과 값 구역을 갖고, 값 구역에 조각 노드를 줄 세운다. 새로 만들면 값 구역에 `Input` 하나가 든다.**

- (나)를 버린 까닭: 같은 «라벨 붙은 입력 칸» 이 두 타입이 되고, 한 칸이 자라면(입력 하나 → `[입력][중복확인]`) 타입을 갈아야 한다. 지금 `control` enum 이 맡는 종류도 결국 조각 타입과 겹친다.
- (다)를 버린 까닭: 라벨과 값의 짝이 문서에서 사라진다. 4단계 폼 표가 «한 줄 2쌍» 을 지을 근거가 없고, 접근성 이름(라벨 → 값)도 이을 데가 없다.

```jsonc
{ "id": "n_f1", "type": "Field", "props": { "label": "기간", "required": true },
  "children": [
    { "id": "n_d1", "type": "DateInput" },
    { "id": "n_a1", "type": "Affix", "props": { "text": "~" } },
    { "id": "n_d2", "type": "DateInput" },
    { "id": "n_b1", "type": "Button", "props": { "label": "이전주" } },
    { "id": "n_b2", "type": "Button", "props": { "label": "다음주" } }
  ] }
```

```ts
// packages/schema/src/component/catalog/input.ts
export const FieldDef = defineComponent({
  type: 'Field',
  label: '입력 필드',
  description: '라벨과 값 칸. 값 칸에 입력 조각을 줄 세운다.',
  group: 'input',
  props: z.strictObject({
    label: z.string().default('라벨'),
    required: z.boolean().default(false),
  }),
  editor: [
    { prop: 'label', control: 'text', label: '라벨' },
    { prop: 'required', control: 'switch', label: '필수' },
  ],
  summary: (props) => oneLine(props.label),
  states: ['required'],
  zones: [{ name: 'body', label: '값', initial: [{ type: 'Input' }] }],
})
```

- **`control` · `placeholder` · `disabled` · `invalid` 를 걷는다** — 조각으로 간다. `variantFrom` 을 걷는다 — `Field` 는 변형을 테마 manifest 에서 받는 보통 컴포넌트가 된다.
- **값 구역은 무엇이든 받는다**(`accepts` 없음) — 4단계의 «값 칸 안에 그리드 · 파일첨부 · 반복 행 표» 를 막지 않는다. `Field` 안의 `Field` 도 검증은 막지 않는다(지금 `Card` 안의 `Card` 와 같다).
- **값 구역은 몸통 하나라 구조 트리에 구역 줄이 안 선다**(2단계 «구역이 몸통 하나뿐인 노드는 지금과 같다»). 트리는 `입력 필드 '기간'` 밑에 조각 다섯을 바로 보인다.
- **값 구역은 가로로 줄 세우고 넘치면 줄을 바꾼다**(기본 뷰 · 기본테마). 몫이 듣는다 — 아래 «폭».
- **빈 값 구역** — 사람이 기본 `Input` 을 지우면 라벨만 남는다. 화면은 라벨 칸 + 빈 값 칸이다(4단계의 «빈 쌍»). lint 는 말하지 않는다.

## 2. 조각 컴포넌트

### 목록

설계서의 값 칸 꼴은 전부 아래 아홉과 `Button` 의 줄 세우기로 선다. 그룹은 `input`(파일 `catalog/input.ts` — 그룹과 파일이 같아야 한다는 규칙은 `packages/schema/src/component/group.ts`).

| 타입 | 이름(`label`) | props(기본값) | 상태 | 폭 |
| --- | --- | --- | --- | --- |
| `Input` | 입력 | `kind`(`text` · `number` · `password` — `text`) · `value`(`''`) · `placeholder`(`''`) · `size`(`short` · `medium` · `long` — `medium`) · `disabled` · `readonly` · `invalid` | `disabled` · `readonly` · `invalid` | `size` · 몫 |
| `TextArea` | 여러 줄 입력 | `value`(`''`) · `placeholder`(`''`) · `rows`(1 ~ 20 — 3) · `disabled` · `readonly` · `invalid` | 같다 | 값 칸을 채운다(몫 1 과 같은 기본) |
| `Select` | 셀렉트 | `options`(`[{label:'항목 1'},{label:'항목 2'}]`) · `placeholder`(`'== 선택 =='`) · `size`(`medium`) · `disabled` · `invalid` | `disabled` · `invalid` | `size` · 몫 |
| `DateInput` | 날짜 | `value`(`''`) · `placeholder`(`'YYYY-MM-DD'`) · `disabled` · `readonly` · `invalid` | `disabled` · `readonly` · `invalid` | 고정(테마) |
| `TimeInput` | 시간 | `value`(`''`) · `placeholder`(`'00:00'`) · `disabled` · `readonly` · `invalid` | 같다 | 고정(테마) |
| `CheckboxGroup` | 체크박스 | `options`(`[{label:'선택'}]`) · `disabled` | `disabled` | 내용 |
| `RadioGroup` | 라디오 묶음 | `options`(`[{label:'Y'},{label:'N'}]`) · `disabled` | `disabled` | 내용 |
| `Chip` | 칩 | `label`(`'칩'`) · `removable`(`true`) · `disabled` | `disabled` | 내용 |
| `Affix` | 사이 글자 | `text`(`'~'`) · `tone`(`default` · `muted` · `danger` · `primary` — `default`) | — | 내용 |

| 설계서의 꼴 | 조각 |
| --- | --- |
| `[입력][중복확인]` · `[readonly][사용자 검색]` | `Input` · `Button` / `Input{readonly}` · `Button` |
| `[셀렉트][계좌번호][계좌확인]` | `Select` · `Input` · `Button` |
| `[날짜]~[날짜]` · `[날짜]~[날짜][이전주][다음주]` | `DateInput` · `Affix ~` · `DateInput` (· `Button` · `Button`) |
| `[시간] 부터 [시간] 까지` | `TimeInput` · `Affix 부터` · `TimeInput` · `Affix 까지` |
| `[셀렉트][숫자] 일 후 [시간] 부터 [숫자] 일 후 [시간] 까지` | `Select` · `Input{number,short}` · `Affix 일 후` · `TimeInput` · `Affix 부터` · … |
| `[Y][N] + [숫자]` · `[Y][N] + [입력]% + [입력]점 이상` | `RadioGroup`(세그먼트) · `Input{number}` (· `Affix %` · `Input` · `Affix 점 이상`) |
| `[설문 검색] + 지울 수 있는 파란 칩 X` | `Button` · `Chip` |
| 체크박스 칩 묶음(13칸까지 · 체크된 칩 검정) | `CheckboxGroup`(칩) |
| `[읽기 전용 자동계산] + 빨간 안내 글` | `Input{readonly}` · `Affix{tone: danger}` |
| 세그먼트 토글 2 ~ 7칸(미선택 가능 · 고른 칸 검정) | `RadioGroup`(세그먼트) — 고른 항목 0 개도 받는다 |
| 사이 글자 `~` · 부터 · 까지 · % · 점 이상 · 일 후 · 시 · 분 · 초 · (px) | `Affix` |

### 넣지 않은 것과 까닭

- **날짜시간(`DateTimeInput`)** — 120쪽에 한 칸짜리 날짜시간이 없다. 있으면 `DateInput` · `TimeInput` 을 붙인다.
- **숫자 입력(`NumberInput`)** — `Input.kind: 'number'` 로 둔다. 화면이 같은 상자이고 다른 것은 역할(`spinbutton`)과 테마의 오른쪽 정렬뿐이다.
- **단일 체크박스(`Checkbox`)** — 항목 하나짜리 `CheckboxGroup` 이다(기본값이 그 꼴). 두 타입이면 «체크박스 하나 → 둘» 에 타입을 갈아야 한다.
- **읽기 전용 값(`ReadonlyValue`)** — `Input{readonly}` 다. 설계서의 «회색 채움 상자» 가 그것이고, 수정 화면에서 같은 칸이 읽기 전용이 되는 꼴(`readonly` 를 켜는 것)과 같은 노드로 이어진다.
- **단추** — `Button` 을 그대로 쓴다. 값 칸의 단추(«중복확인» · «사용자 검색»)는 보통 단추이고 변형(`primary` 검정)도 테마의 것이다.
- **파일** — 6단계 «파일첨부 위젯»(단추 셋 · 파일 목록 · 드롭 안내 · 한도 문구)의 몫이다. 이번에는 옛 `control: 'file'` 을 `Input{readonly, placeholder:'선택된 파일 없음'}` + `Button '파일 선택'` 으로 옮기기만 한다(«문서 판 4»). 그 위젯이 서면 값 칸에 그것을 넣는다 — 값 구역이 무엇이든 받아 막을 것이 없다.

### 공통 규칙

- **`value` 를 둔다**(입력 · 여러 줄 · 날짜 · 시간) — 설계서의 «수정 화면 = 같은 칸에 값이 채워진 판» 이다. `value` 가 있으면 그것을, 없으면 `placeholder` 를 흐리게 그린다. 둘 다 사람이 적는 설계 글이다.
- **`readonly` 는 새 상태다** — `STATE_ARIA` 에 `readonly → aria-readonly` 를 더한다. 기본테마는 회색 채움으로 그린다. `disabled`(딤드)와 다른 것을 그린다 — 설계서가 둘을 가른다(«readonly 입력(회색)» 과 «비활성 딤드»).
- **`required` 는 `Field` 에만 있다** — 라벨 앞 `*` 는 라벨의 것이다. 조각마다 두면 한 칸에 별이 여럿 선다.
- **조각은 어디에나 선다**(`placement` 없음) — 5단계 그리드 셀 안 셀렉트 · 입력 · 세그먼트 · 칩이 같은 타입을 쓴다. 폼 밖 결과 머리줄의 `[== 선택 ==▼][훈련상태변경]` 도 `Flex` 안의 `Select` · `Button` 이다.
- **`summary`**(구조 트리 줄 곁) — `Input` · `TextArea` · `DateInput` · `TimeInput` 은 `value` 가 있으면 그것, 없으면 `placeholder` · `Select` · `RadioGroup` · `CheckboxGroup` 은 고른 항목(없으면 첫 항목) · `Chip` 은 `label` · `Affix` 는 `text`.
- **사람이 부르는 이름**(`nodeDisplayName`) — 라벨성 prop 표(`packages/schema/src/interaction/describe.ts` 의 `LABEL_PROPS`)에 `Chip: 'label'` · `Affix: 'text'` 를 더한다. 입력 조각은 라벨이 없어 «입력» · «날짜» 같은 카탈로그 이름이 서고, 같은 필드 안에 둘이면 별칭으로 가른다(«시작일» · «종료일»).

### 폭

설계서는 칸마다 폭이 다르다 — 전폭 · 절반 · 1/3 · 셀렉트 고정폭 · 짧은 칸(약 1/4). 두 장치로 덮는다.

- **채우기는 몫(`weight`)** — `Field` 의 값 구역을 `Flex` 처럼 몫을 읽는 자리로 둔다(`weightRoom('Field', …)` 이 `flex` 를 낸다). 몫을 준 조각이 남는 폭을 몫대로 나눠 갖는다 — `[입력 몫 1][중복확인]` 이면 입력이 단추 앞까지 찬다. 속성 패널의 «몫» 칸도 같은 함수로 저절로 선다.
- **고정 폭은 `size` 표지** — 몫이 없는 `Input` · `Select` 는 `size`(`short` · `medium` · `long`)의 폭으로 선다. 값은 테마가 정한다(기본테마: 6em · 12em · 24em 꼴 — 구현이 설계서 표본과 견줘 정한다). `DateInput` · `TimeInput` 은 글자 수가 정해져 있어 테마의 고정 폭이다.
- **«절반 · 1/3» 은 필드의 폭이다** — 열을 정한 `SearchForm`(몫이 칸 수)이나 4단계 폼 표의 칸이 정한다. 값 칸 안의 입력 하나를 «필드 폭의 절반» 으로 두는 꼴은 `[입력 몫 1][빈 Affix 몫 1]` 로 지을 수 있으나 설계서에서 드물어 장치를 더하지 않는다.
- `size` 는 정본 「노드 속성」 의 prop 표지(`data-wb-size`)로 나간다 — 스타일 값이 아니라 «짧은 칸 · 보통 · 긴 칸» 이라는 설계의 낱말이고, 실제 길이는 테마에 있다(`Section.compact` 와 같은 자세).

## 3. 선택지(options)

### 모양

```ts
const OptionSchema = z.strictObject({ label: z.string(), selected: z.boolean().optional() })
// Select · RadioGroup — 고른 항목은 0 개 또는 1 개
options: z.array(OptionSchema).min(1).max(30).refine(atMostOneSelected, '하나만 고를 수 있습니다').default([...])
// CheckboxGroup — 여럿
options: z.array(OptionSchema).min(1).max(30).default([...])
```

- **고른 것이 항목에 붙는다**(`selected`) — 항목 번호(`value: 2`)로 두면 항목을 옮기거나 지울 때 번호를 함께 고쳐야 하고, 남이 그 사이 항목 배열을 바꾸면 번호가 다른 항목을 가리킨다. 항목에 붙이면 배열 하나를 통째로 바꾸는 지금 위젯의 규칙(`list-control.tsx` 머리말 «배열을 통째로 `replace`한다»)으로 고른 것까지 한 연산이다.
- **고르지 않은 판**(세그먼트의 «미선택» · 셀렉트의 «== 선택 ==») — `selected` 가 다 없거나 거짓이다. `Select` 는 그때 `placeholder` 를, 세그먼트는 고른 칸 없이 그린다.
- **하나만 고르는 두 타입**(`Select` · `RadioGroup`)은 둘 이상 고른 배열을 검증이 거절한다(`refine` — 이슈는 그 prop 경로 · 저장 경계 422). 화면 위젯이 그 판을 못 만든다(아래).
- **상한 30** — 13칸 체크 칩 묶음 · 7칸 세그먼트 · 행 수 셀렉트 «10/20/50/100/300/500/1000» 을 덮고, 패널 위젯이 한 화면에 든다.
- **항목은 노드가 아니다** — 표지 · 상호작용을 항목마다 달 수 없다(«세그먼트의 N 칸 클릭 시» 를 따로 못 건다). 설계서의 Object Description 은 선택지 갈래를 묶음 하나의 설명 안에 «[Y]/[N]» 으로 적는다 — 묶음에 표지 하나면 그 꼴이 선다. 항목마다 노드로 두면 13칸 칩 묶음이 노드 13 개가 되고, 항목을 더하는 것이 트리 작업이 된다. 로드맵 A(«조각은 자식 노드다»)의 «조각» 은 값 칸에 줄 서는 것이고 묶음 안의 항목은 `List.columns` 와 같은 prop 이다.

### 속성 패널 — 선택지 위젯

새 편집 컨트롤 `optionList` 를 둔다 — `EditorField` 에 `select: 'one' | 'many'` 를 더해 위젯이 고르는 칸을 라디오처럼(하나) · 체크처럼(여럿) 그린다.

```
선택지   ◉ [ Y          ] [↑][↓][✕]
         ○ [ N          ] [↑][↓][✕]
         [+ 항목 추가]   [고른 것 풀기]
```

- **지금 `list-control.tsx` 를 넓힌다** — 같은 파일의 커밋 규칙(추가 · 지우기 · 고르기 · 옮기기는 곧바로 · 글 고치기는 blur 에)과 잠금 · 초안(`onLeave`) 규칙을 그대로 탄다. 세 번째 원소 꼴(`{ label, selected }`)을 `toItems` · `toValue` 에 더한다.
- **옮기기(↑ ↓)를 더한다** — `stringList` · `pairList` 도 함께 얻는다(`List.columns` · `Tree.items` · `KeyValue.pairs` — 지금은 지우고 다시 쳐야 차례가 바뀐다). 배열을 통째로 바꾸는 연산이라 새 동시성 문제가 없다.
- **`select: 'one'`** 위젯은 고른 칸을 누르면 다른 항목의 `selected` 를 함께 걷는다(한 연산). «고른 것 풀기» 는 전부 걷는다. 그래서 위젯이 «둘 이상 고른 하나 고르기 배열» 을 만들 수 없다.
- 지금 배열 위젯이 있는 자리는 `stringList` 둘(`List.columns` · `Tree.items`)과 `pairList` 하나(`KeyValue.pairs`)다. `Tabs` 에는 배열 편집기가 없다(탭은 `TabPanel` 노드다). 다시 재는 법: `git grep -n -E "control: '(stringList|pairList)'" -- packages/schema/src`.

## 4. «N 이면 뒤가 딤드»

설계서의 `[Y][N] + [입력]% + [입력]점 이상`(N 이면 뒤 입력이 딤드) · «출결종류 값에 따라 시간 입력 활성/딤드» 는 **한 노드의 prop 이 화면 상태마다 다른 것**이다. 지금 화면 상태는 노드를 숨기고 보일 뿐이다(정본 「페이지 스키마 노드」 의 상태 보임).

| 선택지 | 무엇이 되나 | 크기 |
| --- | --- | --- |
| **(가) 지금 장치로 그린다(고른 것)** | 설계서처럼 «N 고른 판» 을 그릴 때 뒤 입력의 `disabled` 를 켜고, 조건은 세그먼트의 표지 · 코멘트(«N 이면 우측 입력 딤드»)에 적는다. 두 판을 다 보이고 싶으면 상태 «N 선택» 을 두고 딤드 판 · 활성 판을 상태 보임으로 나눈다(같은 칸을 둘 둔다) | 0 |
| (나) 7단계 «상태별 속성» 을 앞당긴다 | 노드에 «상태 S 에서 이 prop 은 V» 를 단다 — 봉투(새 필드) · 렌더러 · 검증(prop 값) · 상호작용 런타임과의 겹침 · 속성 패널(상태마다 값) · 리베이스 · 내보내기 상태 전환기 · 모듈 저장의 거름까지 | L — 7단계 설계 전체(«단추 이름 · 숨김이 상태마다» 도 같은 장치다) |

**(가)다.** 7단계를 앞당기면 그 설계를 이 단계 안에서 해야 하고, 그 장치는 조합 입력과 무관한 «상태마다 단추 이름» 까지 덮어야 해서 이 단계를 L 만큼 늘린다. 설계서도 대부분 딤드를 설명 칸의 글로 적고 그림은 한 판만 그린다. 상태 보임으로 두 판을 나누는 꼴은 지금 바로 되고, 7단계가 서면 같은 칸 둘을 하나로 줄이는 옮기기가 그 단계의 몫이다.

## 5. 검색폼 · 입력폼과의 관계

- **받는 규칙은 바뀌지 않는다** — 두 폼의 몸통은 `accepts` 가 없다(무엇이든). 조합 필드도 `Field` 라 `structural-gap`(«`EntryForm` 안에 `Field` 가 하나도 없다») 그대로다. 표(`STRUCTURAL_GAPS`)를 고치지 않는다.
- **조각을 폼 몸통에 바로 둔 판** — 막지 않는다(5단계 그리드 셀 · 결과 머리줄에서 조각이 `Field` 밖에 서야 한다). 폼 안에 `Field` 가 하나라도 있으면 lint 도 말하지 않는다. 막을 근거가 생기면 lint 경고 하나(«`EntryForm` 몸통에 라벨 없는 입력 조각»)로 더한다 — 이 단계에서는 안 둔다.
- **열을 정한 `SearchForm`** — 필드의 몫이 칸 수인 지금 규칙 그대로다. 필드 안 조각의 몫은 값 구역(`Field`)이 읽는 별개의 몫이다 — 부모가 다르면 몫의 뜻이 다르다는 정본 「페이지 스키마 노드」 의 몫 규칙과 같다.
- **4단계(라벨\|값 폼 표)를 막지 않는다** — `Field` 의 뿌리 바로 밑에 `label` 조각과 `value` 조각(값 구역을 감싼 요소)이 형제로 선다. 4단계의 표가 격자(라벨 · 값 · 라벨 · 값)라면 `Field` 뿌리를 `display: contents` 로 풀어 두 조각을 격자 칸에 바로 놓을 수 있고, 표 컴포넌트가 제 뷰에서 자식 `Field` 의 두 조각을 칸에 나눠 그릴 수도 있다(뷰의 `items` — 2단계 「테마 뷰 계약」). colspan(«전폭 행») · rowspan(«사진 칸») · 빈 쌍은 4단계가 그 표의 prop · 몫으로 정한다. 이 설계는 라벨과 값을 한 노드 안의 두 조각으로 나눠 두는 것까지만 한다.

## 6. 테마 뷰 계약 · 기본테마

### 기본 뷰(SDK)

| 뷰 | DOM(조각 이름) |
| --- | --- |
| `FieldView` | `Root div[role=group][aria-labelledby=<label id>]` > `label[data-wb-part=label]`(+ 필수면 `data-wb-state~=required` 로 별) · `div[data-wb-part=value]`(몸통) |
| `InputView` | `Root div[role=textbox \| spinbutton][aria-label]` > `span[data-wb-part=text]`(값 또는 흐린 안내 — 안내면 `data-wb-placeholder`) |
| `TextAreaView` | 같다 · `aria-multiline` · 높이 `--wb-node-textarea-rows` |
| `SelectView` | `Root div[role=combobox][aria-expanded=false]` > `span[data-wb-part=text]` · 꺾쇠는 CSS(`::after` — 지금 `Field` 고르개와 같다) |
| `DateInputView` · `TimeInputView` | `InputView` 꼴 + `span[data-wb-part=glyph][aria-hidden]`(달력 · 시계 표지 — 글자 표지이고 테마가 덮는다) |
| `CheckboxGroupView` | `Root div[role=group]` > `span[data-wb-part=option][role=checkbox][aria-checked]` 마다 `span[data-wb-part=mark]` · 글 |
| `RadioGroupView` | `Root div[role=radiogroup]` > `span[data-wb-part=option][role=radio][aria-checked]` 마다 `span[data-wb-part=mark]` · 글 |
| `ChipView` | `Root span` > 글 · `removable` 이면 `span[data-wb-part=remove][aria-hidden]`(«×») |
| `AffixView` | `Root span` > 글 · `tone` 은 표지(`data-wb-tone`) |

- **실제 `<input>` · `<select>` · `<button>` 을 그리지 않는다** — 지금 `FieldView` 와 같다. 설계 그림이고, 정본 「노드 속성」 의 «테마 뷰가 그리는 포커스 받는 요소» 규칙(단추 · 링크 · 입력 칸만 — 그 밖은 단축키를 막는다)을 지키며, 캔버스에서 누르면 노드가 골라져야 한다.
- **고른 칸 · 칩의 X 는 조각 + 속성이다** — 고른 항목은 `[data-wb-part="option"][aria-checked="true"]`, 칩의 X 는 `[data-wb-part="remove"]`. 테마 CSS 가 그것을 겨냥한다(세그먼트의 검정 채움 · 칩의 파란 바탕). 항목은 노드가 아니라 `data-wb-id` 가 없다.
- **`Field` 의 접근성** — `aria-required` · `aria-invalid` 를 `control` 조각에 두던 규칙(정본 「노드 속성」 표의 `aria-*` 줄 · `STATE_ARIA` 머리말)이 바뀐다: `Field` 는 `group` 과 라벨 이름을 내고, `invalid` 는 조각이 제 뿌리에 낸다(조각의 역할이 `textbox` · `combobox` 라 `aria-invalid` 를 받는다). `required` 는 라벨의 별과 `data-wb-state` 뿐이다 — `group` 은 `aria-required` 를 받는 역할이 아니다. 조각마다 필드의 필수를 내리려면 렌더러가 부모 상태를 자식에 넘기는 길이 새로 들어 이 단계에서 안 짓는다.
- **SDK 판을 올린다**(1.3.0 → 1.4.0) — 카탈로그 타입이 늘면 테마의 `views` 키 검사가 새 타입을 알아야 하고, `Field` 의 DOM 이 바뀐다. 지금 manifest 의 `sdk` 범위가 가른다.

### 기본테마(`system-admin`)

- **뷰 없이 `theme.css` 로 꾸민다**(지금처럼). `[data-wb-component="Field"][data-wb-variant="…"]` 규칙을 조각 타입 규칙으로 옮긴다 — 고르개 꺾쇠는 `Select`, 여러 줄은 `TextArea`, 체크 · 라디오는 두 묶음.
- **변형을 manifest 에 선언한다** — `RadioGroup`: `radio`(라디오) · `segment`(세그먼트 — 붙은 칸 · 고른 칸 검정 바탕 흰 글), `defaultVariant: 'segment'`. `CheckboxGroup`: `checkbox`(체크박스) · `chip`(칩 — 칸마다 테두리 · 체크되면 검정 바탕 흰 체크), `defaultVariant: 'checkbox'`. 세그먼트를 기본으로 두는 까닭: 120쪽의 단일 선택 대부분이 세그먼트이고 라디오는 팝업의 선택 열(5단계 그리드 몫)에 몰려 있다. 기본이면 팔레트 한 걸음으로 세그먼트가 선다.
- **입력폼 안 필드의 «라벨 칸 · 값 칸»** — 지금 `[data-wb-component="EntryForm"] [data-wb-component="Field"]` 규칙이 `control` 조각 대신 `value` 조각을 칸으로 둔다. 여러 줄 값의 라벨 위 정렬(지금 `[data-wb-variant="textarea"]`)은 `:has([data-wb-component="TextArea"])` 로 옮긴다.
- **`Affix` 의 `tone`** — `danger` 는 `--wb-semantic-danger`, `primary` 는 `--wb-semantic-primary`, `muted` 는 `--wb-semantic-textMuted`.
- **판을 올리고 `checksums.json` 에 새 줄을 더한다**(정본 「테마의 범위」 의 시스템 테마 시딩 규칙).

### 스타터 테마 · 갤러리 · `wb-theme check`

- **스타터 템플릿**(`packages/theme-kit/template`) — 제 `FieldView` 를 새 꼴로 다시 짓고, 조각 아홉은 뷰를 안 짓는다(SDK 기본 뷰로 선다 — 뷰가 없는 컴포넌트의 지금 규칙). `SKILL.md` 의 카탈로그 목록 · «`Text` · `Field` · `Divider` 에는 variants 를 선언할 수 없다» 줄(→ `Text` · `Divider`)을 고친다.
- **갤러리 표본**(`packages/theme-gallery/src/samples.ts`) — 새 타입마다 표본(값 · 안내 · 상태 켬 · 고른 항목 · 칩 X)과 `Field` 표본을 조합 꼴(`[날짜]~[날짜]` · `[세그먼트][입력]%`)로 다시 짓는다. 폼 표본 안의 `Field` 도 값 구역에 조각을 넣는다.
- **`wb-theme check`** — 갤러리 칸 전부를 그리므로 새 타입을 저절로 잰다(«그리지 않는 타입» 오류). `Field` 표본의 값 구역에 조각을 넣으므로 «내용이 든 구역을 뷰가 안 그렸다» 규칙이 테마의 `FieldView` 가 값 구역을 그리는지 잰다(`Field` 의 값 구역은 몸통이라 `children` 을 안 그리면 잡힌다 — 그 규칙이 몸통도 세는지 구현이 확인한다).

## 7. 그 밖의 소비자

| 소비자 | 바뀌는 것 |
| --- | --- |
| 봉투 | 없다 — 새 필드가 없다 |
| 검증(`validate.ts`) | 새 타입의 props 규격(카탈로그가 든다) · `options` 의 «하나만» `refine`. `ignored-variant` 는 `Field` 에서 사라진다(`variantFrom` 을 걷는다) |
| 카탈로그 검사 | `assertZoneReferences`(`catalog/index.ts`)가 `Field.body.initial` 의 `Input` 을 본다 · `defineComponent` 의 도달성 검사가 새 상태(`readonly`)를 `editor` 에서 찾는다 |
| lint | `structural-gap` 그대로. «현재 테마에 없는 variant» 는 `RadioGroup` · `CheckboxGroup` 의 변형도 센다(스타터 테마가 `segment` · `chip` 을 선언 안 하면 경고 — 그 테마의 기본 변형으로 그린다) |
| 상호작용 | 트리거는 조각에도 붙는다(트리거 × 타입 표가 없다). 뷰 모드에서 **`click` · `select` 는 조각을 누르면 돈다**(`onClick`). **`change` 는 기본 뷰에서 안 돈다** — 실제 입력이 없어 `onChange` 가 안 난다. 지금 `Field` 의 `change` 와 같은 판이고, 고치려면 «`change` 를 입력 조각의 누름에도 건다» 를 정하는 별 트랙이다(이 단계에서 안 바꾼다). 항목은 노드가 아니라 «N 칸 클릭 시» 는 못 건다(«선택지») |
| 몫(`render.tsx` 의 `weightRoom`) | `Field` → `flex` 를 더한다. 속성 패널의 «몫» 칸이 같은 함수라 저절로 선다 |
| prop 표지(`marks.ts` 의 `MARKED_PROPS`) | `Input`: `kind` · `size` · `Select`: `size` · `Chip`: `removable` · `Affix`: `tone` · `STATE_ARIA` 에 `readonly`. `packages/renderer/test/prop-marks.test.tsx` 가 prop 마다 «표 · 상태 · 변형 가운데 하나» 와 «바꾸면 기본 뷰 DOM 이 바뀐다» 를 센다 |
| 사람이 부르는 이름(`interaction/describe.ts` 의 `LABEL_PROPS`) | `Chip: 'label'` · `Affix: 'text'` 를 더한다 |
| 내보내기(HTML · PPTX) | 렌더러 그대로. `nodesOnly` · 문장은 `childLists` 를 지나 값 구역의 조각을 저절로 돈다. PPTX 는 번들을 찍으므로 따로 없다 |
| 팔레트 · 축소판 | 카탈로그에서 짓는다 — 표본은 갤러리 첫 표본(`palette-thumbs.tsx`). `input` 갈래가 3 → 12 개가 된다 |
| MCP · CLI | 도구 변화 없음. `get_page` · `page get` 출력은 트리를 그대로 돈다 |
| `/llms.txt` | props · 구역 · «Create with»(`initial`)는 정의에서 저절로 지어진다. **영어 한 줄 표(`apps/web/config/llms-txt.ts` 의 컴포넌트 → 영어 설명)는 손으로 더한다** — 표의 키가 `CATALOG_DEFS` 와 같아야 한다는 케이스가 빠짐을 잡는다. 생성 파일 `apps/web/public/llms.txt` 를 다시 낸다 |
| 붙이기 · 모듈 · 복제 | 그대로 — 조각은 보통 노드다 |
| 실시간 · 잠금 · 리베이스 | 그대로 — 값 구역은 몸통(`children`)이라 2단계 이전부터 있던 경로다 |

### 문서 판 4

`Field` 의 모양이 바뀐다(`control` 등이 모르는 prop 이 되어 `strictObject` 가 거절한다). **문서 판을 4 로 올린다**(`packages/schema/src/migrate.ts` 의 `CURRENT_DOCUMENT_VERSION`). 판 3 문서를 어떻게 하는지는 Q3 — 추천은 `0029-compose-field` 가 2단계 `0028-node-zones.ts` 와 같은 자리(페이지 · 레이아웃 · 프로젝트 모듈 · 개인 모듈 · 스냅샷 payload 의 `pages[]` · `layouts[]`)를 같은 꼴로 옮기는 것이다.

| 판 3 `Field.control` | 판 4 값 구역 |
| --- | --- |
| `text` | `Input{placeholder, disabled, invalid}` |
| `number` | `Input{kind:'number', …}` |
| `select` | `Select{placeholder, disabled, invalid}`(선택지 기본값) |
| `date` | `DateInput{placeholder, disabled, invalid}` |
| `dateRange` | `DateInput` · `Affix '~'` · `DateInput`(둘 다 같은 `disabled` · `invalid`) |
| `checkbox` | `CheckboxGroup{disabled}` |
| `radio` | `RadioGroup{disabled}` + `variant: 'radio'`(기본테마의 기본이 세그먼트라 옛 라디오 모양을 지킨다) |
| `textarea` | `TextArea{placeholder, disabled, invalid}` |
| `file` | `Input{readonly, placeholder:'선택된 파일 없음'}` · `Button '파일 선택'` |

`label` · `required` 는 `Field` 에 남고 `control` · `placeholder` · `disabled` · `invalid` 를 걷는다. 빈 `placeholder` 는 옮기지 않는다(조각의 기본값). 새 조각 id 는 그 문서(묶음) 안에서 안 겹치게 짓는다(`0028` 의 규칙). `revisions` 는 안 옮긴다 — 옮기기 전 편집의 되돌리기는 `/props/control` 을 가리켜 건너뛰어진다(`0028` 과 같다). `0028` 이 `head_seq` 를 안 올린 것(2단계 이월 — `2026-10-23-rv-ns-report.md` 발견 7)은 이 마이그레이션에서도 같은 길이 열린다 — 배포를 걸친 판 3 좌표 편집이 판 4 문서에 얹힐 수 있다. 값 구역은 새 `children` 이라 옛 좌표가 가리킬 자리가 없어(`Field` 는 판 3 에서 자식이 없었다) 그 길로 엉뚱한 노드가 고쳐지지는 않는다.

---

# 문제 2 — 자리표시자 개선(R5)

## 지금 모델이 기대는 곳

| 자리 | 지금 |
| --- | --- |
| `packages/schema/src/component/catalog/document.ts` 의 `PlaceholderDef` | props `label`(«미정 영역») · `height`(20 ~ 1000 · 120) · `zones: []` |
| 기본 뷰 `default-views/document.tsx` 의 `PlaceholderView` | `Root div` 에 `--wb-node-placeholder-height` 를 인라인 변수로 · 글은 라벨 |
| 기본테마 | `[data-wb-component="Placeholder"]` — 바탕 · 점선 테두리 · 모서리 · 흐린 글을 토큰으로 |
| 봉투 `envelope.ts` 의 `WbNodeSchema` | 선언 안 한 키를 거부한다 — «노드는 스타일을 갖지 않는다»(정본 「페이지 스키마 노드」)를 런타임에서 지키는 자리. **props 의 값은 보지 않는다**(카탈로그 규격이 본다) |
| 바이트를 받는 라우트 | 테마 패키지 업로드(`apps/api/src/routes/admin-themes.ts`) — multipart 없이 본문 바이트 그대로 · 이 라우트만 `bodyLimit` 을 넓힌다 · 바이트는 `theme_packages.files` `bytea` |
| 파일을 내주는 라우트 | 테마 패키지 파일(`routes/theme-packages.ts`) — `cache-control: immutable` · `x-content-type-options: nosniff` |
| 화면 캡처 | `apps/api/src/services/screen-render-chromium.ts` — 번들 파일을 가짜 origin 에서 메모리로 내주고(`newRenderContext` 의 `context.route`) 그 밖은 끊는다 · `data:` 는 산다 |
| 개인 모듈 | `personal_modules` — 프로젝트를 가리키는 칸이 없다(`0026-personal-modules.ts` 머리말) |
| 클립보드 봉투 | `packages/schema/src/clipboard.ts` 의 `writeNodesEnvelope` — `{ wirebound, version, nodes, viewStates? }` · 다른 프로젝트의 봉투도 붙는다 |

## 8. 스타일 값의 꼴

### 원칙과 맞추기

정본은 «노드는 스타일을 갖지 않는다 — "이 버튼만 빨갛게" 는 지원하지 않는다» 고 한다. 자리표시자는 그 반대편의 자리다 — **카탈로그가 못 덮는 요소를 사람이 손으로 그리는 탈출구**이고, 사용자가 색 · 테두리 · 글 · 여백을 prop 으로 두기로 정했다(로드맵 R5).

- **예외는 이 컴포넌트 하나다** — 봉투는 그대로(스타일 키를 노드에 두지 않는다), 값은 `Placeholder` 의 props 다. 다른 컴포넌트는 지금처럼 변형만 고른다. 정본 「페이지 스키마 노드」 의 원칙 문단에 «`Placeholder` 만 그리기 값(색 · 테두리 · 글 · 여백 · 그림)을 prop 으로 든다 — 카탈로그 밖 요소를 그리는 자리다» 를 더한다.
- **값의 꼴을 좁힌다** — 색은 `^#[0-9a-f]{6}$`(소문자로 정규화) 또는 빈 값, 길이는 정수 px. 자유 CSS 글자를 받지 않는다 — 뷰가 값을 인라인 변수로 싣는데, 글자를 받으면 `url(…)` 이 캔버스(편집자의 브라우저)에서 바깥 요청을 내고(화면 캡처는 막혀도 캔버스 · 내보낸 번들은 안 막힌다) `;` · `}` 로 꾸밈을 넘길 길이 생긴다.
- **빈 값은 «테마 기본» 이다** — 테마가 지금처럼 바탕 · 점선 · 흐린 글을 정한다. 사람이 값을 정한 것만 테마를 이긴다.
- **테마는 정한 값을 따라야 한다** — 기본 뷰가 `--wb-node-placeholder-<이름>` 변수로 싣고 기본 CSS(특이도 0)가 `var(--wb-node-placeholder-background, <테마 몫>)` 꼴로 읽는다. 테마 CSS 가 그 변수를 무시하고 덮으면 사람이 고른 색이 그 테마에서 사라진다 — 갤러리의 «값을 정한 자리표시자» 표본으로 둘이 잰다: `wb-theme check`(jsdom)는 뷰 뿌리가 그 변수를 싣는지(오류), `wb-theme shots`(실 Chromium)는 계산된 바탕 · 테두리 · 글 색이 정한 값인지(문제 줄). jsdom 은 특이도를 안 보고 `var()` 를 안 풀어 계산 색을 못 잰다(CI-B 구현 · 코디네이터 답 Q-B1). 색을 테마 토큰으로 고르는 판은 Q4.

### props

| prop | 꼴(기본값) | 뜻 |
| --- | --- | --- |
| `label` | 글(«미정 영역») | 자식 · 그림이 없을 때 가운데 서는 글 |
| `width` | 정수 px 20 ~ 2000 · 없음 | 없으면 부모의 배치를 따른다(블록이면 가득 · `Flex` 면 내용 · 몫) |
| `height` | 정수 px 20 ~ 2000 · 없음 | 없으면 내용 높이 — 자식 · 그림 · 라벨이 없으면 테마의 최소 높이(기본테마 120px) |
| `background` | 색 · 빈 값 | 바탕 |
| `border` | `dashed` · `solid` · `none`(`dashed`) | 테두리 꼴 — 지금 모양이 점선이다 |
| `borderColor` | 색 · 빈 값 | 테두리 색 |
| `radius` | 정수 px 0 ~ 999 · 없음 | 모서리(999 면 알약 꼴 — 칩 · 배지) |
| `color` | 색 · 빈 값 | 글 색(라벨 · 안의 `Text` · `Affix` 가 물려받는다) |
| `fontSize` | 정수 px 10 ~ 72 · 없음 | 글 크기 |
| `align` | `start` · `center` · `end`(`center`) | 글 정렬 · 자식의 가로 정렬 |
| `padding` | 정수 px 0 ~ 200 · 없음 | 안쪽 여백(네 방향 같다) |
| `image` | 그림 id(소문자 hex 64) · 빈 값 | «그림 저장» |
| `imageFit` | `cover` · `contain`(`cover`) | 크기를 정한 칸에서 그림을 채우는 법 |

- **크기는 px 이고 몫과 섞인다** — `width` 가 있으면 그 폭이 기준(`flex-basis`)이고, `Flex` 안에서 몫을 주면 남는 폭을 몫대로 더 받는다(몫은 노드 필드 — 지금 규칙 그대로). `Grid` 안이면 칸 수(몫)가 폭을 정하고 `width` 는 상한이다. 높이에는 몫이 없다.
- **그림과 크기** — `width` · `height` 를 다 정하면 그 칸에 `imageFit` 으로 맞춘다. 하나만 정하거나 안 정하면 그림의 비율로 선다(그림 원래 크기는 올릴 때 서버가 재서 둔다 — 아래 표 `width` · `height`). 그림 위에 라벨은 안 선다(`alt` 로 간다). 자식은 그림 위에 겹친다(그림이 바탕).
- **enum 셋(`border` · `align` · `imageFit`)은 prop 표지**로 나간다(`data-wb-border` 등 — `MARKED_PROPS`). 색 · 길이는 표지가 아니다(셀렉터로 셀 수 없다 — 정본 「노드 속성」 의 수 prop 규칙).
- 상태가 없다 — 상호작용 `setProp` 은 아무 prop 이나 바꾼다(뷰 모드에서 바탕색을 바꾸는 시연이 된다).

### 자식

- **구역은 몸통 하나**(`body` · 화면 이름 «내용») — 구조 트리에 구역 줄이 안 선다. 기본 내용(`initial`)은 없다 — 새 자리표시자는 지금처럼 라벨이 선 빈 칸이다.
- **배치** — 몸통은 가로로 줄 세우고 넘치면 줄을 바꾸며 세로 가운데에 선다. `align` 이 가로 정렬이다. 세로로 쌓으려면 안에 `Flex`(세로)를 넣는다 — 배치 장치를 두 벌 두지 않는다.
- **자식이 있으면 라벨이 안 선다** — 라벨은 «아직 정하지 않은 자리» 의 글이고, 안을 채웠으면 채운 것이 그 자리를 말한다.
- 칩 · 배지를 짓는 꼴: `Placeholder{background:#2563eb, color:#ffffff, radius:999, padding:4}` > `Affix '퀴즈'` · `Affix '×'` → 구조 트리 줄 `…` «모듈로 저장…».

## 9. 그림 저장

### 표

```sql
asset_blobs(sha256 text PK, bytes bytea, mime text, size int, width int, height int, created_at)
  sha256 = 바이트의 sha256 소문자 hex — 내용이 이름이다(같은 그림은 한 행)
  width · height = 올릴 때 잰 원래 크기(px · SVG 는 viewBox)

project_assets(project_id FK→projects ON DELETE CASCADE, sha256 FK→asset_blobs RESTRICT,
               name text, uploaded_by FK→users ON DELETE SET NULL, created_at)
  PK (project_id, sha256)

personal_assets(owner_id FK→users ON DELETE CASCADE, sha256 FK→asset_blobs RESTRICT, created_at)
  PK (owner_id, sha256)
```

- **노드는 `image: <sha256>` 을 든다** — 그림 id 가 곧 내용 해시다. 같은 그림을 두 번 올리면 같은 덩이에 소유 행만 있다(이미 있으면 그대로). 프로젝트 · 개인 모듈 사이 복사가 바이트를 안 옮기고 소유 행 하나다.
- **권한은 소유 행이 가른다** — 해시를 안다고 읽을 수 없다. 프로젝트 P 의 읽기는 `project_assets(P, sha)` 가 있어야 선다. 남의 프로젝트 그림의 해시를 문서에 적어도 그 프로젝트에 소유 행이 없으면 404 다 — 같은 바이트를 그 프로젝트에서 올린 사람만 소유 행을 만든다(그때 그 사람은 이미 그 그림을 가졌다).
- **저장 자리는 DB `bytea`** — 테마 패키지(`theme_packages.files`)와 같은 자리다. 고른 까닭: 배포 compose 에 볼륨이 안 늘고(`compose.yaml` 그대로 · `pg_dump` 백업이 그림을 함께 든다), 소유 행과 바이트가 한 트랜잭션에 서서 «행은 있는데 파일이 없다» 판이 없다. 대가는 DB 볼륨이 그림만큼 자라는 것이고, 한도(아래)가 그것을 묶는다. 디스크 볼륨으로 옮기는 것은 덩이 표의 `bytes` 를 경로로 바꾸는 일이라 뒤에 필요해지면 그 표 안에서 끝난다. `docs/guides/deploy-docker.md` 에 «그림은 DB 에 산다 — 백업 크기가 그만큼 는다» 한 줄을 더한다.
- **마이그레이션 번호는 `0030`**(CI-A 의 `0029` 와 나눠 둔다).

### 라우트

| 라우트 | 권한 | 하는 일 |
| --- | --- | --- |
| `POST /api/projects/:projectId/assets` | editor 이상 · 세션 · 그 프로젝트의 API 토큰 | 본문이 그림 바이트 그대로(`Content-Type: image/png` 등 · multipart 아님 — 테마 업로드와 같은 꼴) · 헤더 `X-Asset-Name`(파일 이름 · 선택). 꼴 확인 → 해시 → 덩이 · 소유 행 → `{ id, mime, size, width, height }`. 같은 프로젝트에 이미 있으면 200 · 같은 답 |
| `GET /api/projects/:projectId/assets/:id` | viewer 이상 · 세션 · 토큰 | 바이트. 헤더는 아래 «받는 꼴» |
| `GET /api/projects/:projectId/assets` | viewer 이상 | 목록 `{ id, name, mime, size, width, height, createdAt }` · 쓴 용량 · 한도 — 속성 패널의 «올린 그림에서 고르기» 와 한도 문장이 쓴다 |
| `POST /api/projects/:projectId/assets/claim` | editor 이상 · 세션만 | 본문 `{ ids: [...], from: { projectId } \| { personal: true } }` — 출처에서 읽을 수 있는 그림만 이 프로젝트에 소유 행을 더한다(«그림과 다른 기능의 경계»). 답은 옮긴 id · 못 옮긴 id 와 까닭 |
| `POST /api/me/assets/claim` | 세션만 | 본문 `{ ids, from: { projectId } }` — 그 프로젝트의 viewer 이상이면 개인 몫에 소유 행을 더한다 |
| `GET /api/me/assets/:id` | 세션만 · 그 사람 | 개인 몫 바이트(개인 모듈 카드의 축소판) |

- 쓰기는 커밋 직전에 권한 · 자격을 다시 본다(정본 「권한 모델」 의 쓰기 규칙 · `routes/modules.ts` 의 꼴). 프로젝트 삭제와의 순서는 모듈과 같다 — 삭제가 `project_assets` 행을 CASCADE 전에 잡는지 센다(`lockProjectModules` 와 같은 앞 잠금 · AGENTS.md 「검증 — wirebound」 의 «자기 행을 잡고 → 재확인» 절).
- **그림 바이트에는 실시간 방송이 없다** — 그림을 고른 것은 노드 prop 편집이라 그 편집이 지금처럼 방송된다. 남의 캔버스는 새 id 를 받고 그 그림을 읽는다.

### 한도

| 한도 | 기본값 | 넘으면 |
| --- | --- | --- |
| 파일 하나 | 5 MB(`ASSET_FILE_MAX_BYTES`) | 413 · «그림은 5 MB 까지 올릴 수 있습니다(이 파일 7.2 MB)» |
| 프로젝트 전체 | 200 MB(`ASSET_PROJECT_MAX_BYTES`) — 그 프로젝트 소유 행의 덩이 크기 합 | 409 `asset-quota` · «이 프로젝트의 그림 공간 200 MB 가 찼습니다» |
| 사람 하나(개인 몫) | 100 MB(`ASSET_PERSONAL_MAX_BYTES`) | 409 `asset-quota` |
| 그림 크기 | 가로 · 세로 각 8192px · 넓이 4천만 px | 422 · 화면 캡처 한 장의 넓이 상한(뷰포트 폭 × 8192)과 맞춘다 |

환경 변수로 바꾼다(`apps/api/.env.example` · `docs/guides/deploy-docker.md`). 같은 덩이를 두 프로젝트가 가지면 두 프로젝트에 다 센다 — 바이트는 한 벌이지만 프로젝트의 몫은 그 프로젝트가 가진 것의 합이다(남의 프로젝트가 지운다고 내 몫이 바뀌지 않는다).

### 받는 꼴

- **PNG · JPEG · WebP · GIF** — 머리 바이트로 가른다(`Content-Type` 을 믿지 않는다). 크기는 머리에서 읽는다(새 런타임 의존 없이 — 네 꼴 다 고정 위치다). 머리가 꼴과 안 맞으면 415.
- **SVG(Q7)** — XML 로 읽어 뿌리가 `svg` 인지 본다. 받는다면 위험은 «같은 origin 에서 문서로 열리면 스크립트가 돈다» 하나다(`<img>` 로 그리면 SVG 의 스크립트 · 바깥 자원이 안 돈다 — 캔버스 · 번들 · 캡처가 다 `<img>` 다). 그래서 읽기 라우트가 그림 응답 전부에 `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox` · `X-Content-Type-Options: nosniff` · `Content-Disposition: inline; filename=…` 를 싣는다 — 주소를 직접 열어도 스크립트가 안 돈다. 내보낸 번들의 SVG 파일을 사람이 `file://` 로 직접 열면 그 origin 에서 돈다(쿠키 · 세션이 없는 로컬 파일 origin). 그것까지 막으려면 SVG 를 안 받는다(Q7 (나)).
- 캐시는 `cache-control: private, max-age=31536000, immutable` — 내용이 이름이라 바뀌지 않는다. `private` 는 프록시가 멤버 아닌 사람에게 내주지 않게.

### 지우기(Q5)

그림을 «아무 노드도 안 쓴다» 로 지우려면 그 프로젝트의 페이지 · 레이아웃 · 프로젝트 모듈 · 스냅샷 payload · 편집 이력(`revisions` 의 `inverse` — 되돌리기가 지운 노드를 되살린다)과 **멤버들의 개인 모듈**(개인 몫이 따로 소유 행을 들어 이건 상관없다)까지 세야 한다. 하나라도 빠뜨리면 복원 · 되돌리기 뒤 그림이 깨진다.

- **추천: 프로젝트 · 사람과 함께만 지운다.** 프로젝트를 지우면 소유 행이 CASCADE 로 빠지고, 같은 트랜잭션 끝에서 소유 행이 하나도 없는 덩이를 지운다(`asset_blobs` 에서 `project_assets` · `personal_assets` 어디에도 없는 해시). 사람이 지워지면(지금 길은 없다) 개인 몫도 같다.
- 쓰지 않는 그림이 한도를 먹는 판은 목록 라우트가 보이는 용량으로 알 수 있다. 정리 단추는 뒤에 필요해지면 그 셈(위 다섯 자리를 다 읽는 것)과 함께 더한다.

## 10. 그림과 다른 기능의 경계

| 기능 | 그림이 가는 법 |
| --- | --- |
| 붙여넣기 · 복제(같은 프로젝트) | `image` 는 id 라 그대로다 — 할 일이 없다 |
| 붙여넣기(다른 프로젝트) | 클립보드 봉투에 출처를 싣는다(`source: { projectId }` — `writeNodesEnvelope` 의 새 칸 · 없으면 옛 봉투). 붙일 프로젝트의 그림 목록에 없는 id 가 들면 **붙이기 편집 전에** `claim(from: 출처)` 를 부른다. 옮긴 것은 그대로, 못 옮긴 것(출처의 멤버가 아님 · 출처가 지워짐 · 한도)은 `image` 를 비우고 «그림 2개를 가져오지 못해 비웠습니다 — 출처 프로젝트에 들어갈 수 없습니다» 를 정보 통지로 말한다. 기다리는 동안의 규칙은 페이지 대상이 든 봉투가 페이지 목록을 읽은 뒤 붙는 지금 규칙(정본 「설계서 화면 구조」 «클립보드» 의 «자리»)을 따른다 |
| 모듈 저장(프로젝트 모듈) | 같은 프로젝트라 할 일이 없다 |
| 모듈 저장(개인 모듈) | 저장 전에 `POST /api/me/assets/claim(from: 지금 프로젝트)` — 개인 몫에 소유 행을 더한다. 한도에 걸리면 저장하지 않고 까닭을 말한다(그림 없이 저장하면 다른 프로젝트에서 넣을 때 깨진다) |
| 모듈 넣기(개인 → 프로젝트) | 넣기 편집 전에 `claim(from: personal)`. 못 옮긴 것은 비우고 말한다(붙이기와 같은 문장 꼴) |
| 복사(개인 ↔ 프로젝트 모듈) | 같은 claim 을 복사 라우트 안에서 서버가 한다(원본을 다시 읽는 지금 길에 소유 행 더하기를 넣는다) — 사본이 원본과 이어지지 않는다는 규칙 그대로(소유 행이 따로다) |
| 페이지 JSON 가져오기 · 내보내기 | 페이지 JSON 은 그림을 안 싣는다 — 같은 프로젝트로 다시 가져오면 id 가 그대로 산다. 다른 프로젝트에서는 그림이 깨진다(빈 그림 표지). 실으려면 페이지 JSON 판을 올려야 해서 이 단계에서 안 한다 |
| 스냅샷 · 복원 | payload 는 id 를 든다. 그림은 프로젝트와 함께만 지워지므로(Q5 (가)) 복원한 문서의 그림이 늘 있다 |
| 프로젝트 삭제 | 소유 행 CASCADE · 덩이 정리(«지우기») |
| HTML 번들 | 내보낼 페이지 · 레이아웃의 문서를 걸어 `image` id 를 모으고 `assets/images/<id>.<ext>` 로 싣는다. 렌더러는 그림 주소를 옵션으로 받는다(아래 «렌더러 · SDK») — 번들 런타임은 페이지의 깊이에 맞춘 상대 주소(`pages/…html` 이면 `../assets/images/…`)를 준다. `file://` 로 열어도 선다 |
| PPTX | 번들 페이지를 찍으므로 따로 없다 — `screen-render-chromium.ts` 가 번들 파일 전부를 가짜 origin 에서 내주는 지금 길(`newRenderContext`)에 그림 파일이 함께 든다. 바깥 요청 차단은 그대로다 |
| 캔버스 | same-origin iframe 이 `GET …/assets/:id` 를 세션 쿠키로 읽는다 |
| 축소판 · 갤러리 · `wb-theme dev` | 그림 없는 표본 + 저장소 안 표본 그림 하나를 `data:` 로(테마 작성자가 그림 든 자리표시자를 본다) |
| MCP | **도구를 안 더한다** — 노드에 이미 올린 그림의 id 를 적는 것은 `patch_page` 로 된다(`/llms.txt` 가 «`image` 는 이 프로젝트에 올린 그림의 id» 를 적는다). 올리기 도구는 로컬 파일 경로를 받아야 해서 MCP 서버가 사람의 파일을 읽는 새 권한이 된다 — 필요해지면 그때 정한다. REST 라우트는 API 토큰으로 열려 있다 |

### 렌더러 · SDK

- `RenderOptions.assetUrl?: (id: string) => string | null` — 캔버스는 `/api/projects/:p/assets/:id`, 번들 런타임은 상대 주소, 갤러리는 표본 `data:`. 없으면(`null`) 뷰는 «그림 없음» 표지를 그린다.
- SDK `useAsset(id)` — 뷰가 그 함수를 문맥에서 읽는다(`view()` 가 내리는 노드 문맥 옆에 렌더 문맥으로). 자리표시자를 제 뷰로 그리는 테마가 쓴다. SDK 판에 든다(CI-A 의 1.4.0 위로 1.5.0 — «구현을 나누는 법»).
- 기본 뷰는 `<img data-wb-part="image" alt={label}>` 를 그린다 — 포커스를 안 받는 요소라 정본 「노드 속성」 의 포커스 규칙에 안 걸린다. 그림을 못 읽으면(404 · 깨짐) `onError` 에서 «그림을 불러올 수 없음» 표지로 바꾼다.

## 11. 에디터

### 속성 패널

| 칸 | 위젯 |
| --- | --- |
| 색(`background` · `borderColor` · `color`) | 새 편집 컨트롤 `color` — 견본 칸 + `#rrggbb` 글 칸 + 지우기(«테마 기본») · 견본 팔레트 12 색(설계서에 자주 나오는 파랑 · 노랑 · 빨강 · 초록 · 회색 계열 — 구현이 정한다). 브라우저 `<input type="color">` 를 견본 칸 뒤에 둔다(새 의존 없음). 글 칸은 blur 에 커밋 · 견본 · 고르개는 곧바로 |
| 길이(`width` · `height` · `radius` · `fontSize` · `padding`) | 지금 `number` 컨트롤 · 비우면 prop 을 지운다 |
| `border` · `align` · `imageFit` | 지금 `select` |
| 그림(`image`) | 새 편집 컨트롤 `image` — 아래 |

- 칸이 열셋이라 길다 — 묶음 머리(«크기» · «바탕과 테두리» · «글» · «그림»)를 두는지는 구현이 정한다(지금 패널에 묶음 장치가 없으면 차례만 그 꼴로 둔다).

### 그림 칸

```
그림   [ 축소판 120×80 ]   파일이름.png · 1200×800 · 340 KB
       [그림 고르기…] [올린 그림에서] [지우기]
       여기에 파일을 끌어 놓거나 붙여 넣으세요
```

- **고르기** — 숨은 `<input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml">`.
- **끌어 놓기** — 그림 칸이 OS 파일 놓기를 받는다. 칸 밖(패널의 나머지)에 놓인 파일을 브라우저가 열지 않게 막는다(정본 「설계서 화면 구조」 의 대화 상자 규칙 «상자 밖에 놓은 파일을 브라우저가 열지 않는다» 와 같은 장치 — 실브라우저 `Input.dispatchDragEvent` 로 잰다).
- **붙여넣기** — 그림 칸에 포커스가 있을 때의 `paste` 에서 `clipboardData.files` 의 그림을 받는다. 캔버스의 노드 붙이기(`text/plain` 봉투)와 가르는 기준은 이벤트 대상의 문서 · `activeElement` 다(정본 «클립보드» 의 대상 규칙). 캔버스에 그림을 붙여 자리표시자를 새로 짓는 것은 이 단계에서 안 한다.
- **올린 그림에서** — 목록 라우트의 그림을 축소판 격자로 보이고 고른다(같은 그림을 다시 올리지 않게).
- **진행** — 올리는 동안 칸에 «올리는 중 …%»(`XMLHttpRequest.upload.onprogress` — `fetch` 는 올리기 진행을 못 준다)와 취소. 끝나면 `image` prop 하나를 바꾸는 편집을 낸다(되돌리기 한 번). 올린 그림은 편집이 거절돼도 프로젝트에 남는다(올리기와 편집은 따로다 — 다시 고르면 같은 id 다).
- **올리는 사이 판이 바뀌면** — 그 노드를 남이 잠그거나 지웠으면 편집을 안 내고 «그림은 올렸지만 이 칸이 잠겨(지워져) 넣지 못했습니다 — "올린 그림에서" 고를 수 있습니다» 를 말한다. 다른 노드를 골랐으면 처음 고른 노드에 낸다(편집 자리는 누른 때의 노드 — 붙이기의 규칙과 같다). 그 사이 페이지를 옮겼으면 안 낸다.
- **실패 문장** — 크기(«그림은 5 MB 까지 …») · 꼴(«PNG · JPEG · WebP · GIF · SVG 만 올릴 수 있습니다») · 한도(«이 프로젝트의 그림 공간 200 MB 가 찼습니다») · 권한(viewer 는 칸이 꺼진다 — 지금 편집 칸 규칙) · 끊김(«올리지 못했습니다 — 연결을 확인하세요» + 다시 시도). 칸 밑 한 줄에 선다(패널 칸의 지금 오류 자리).
- **잠금** — 남이 잠근 노드면 고르기 · 놓기 · 붙여넣기 · 지우기가 다 꺼진다(지금 `list-control.tsx` 의 «칸뿐 아니라 버튼도 함께 꺼진다»).

### 자식 넣기

- 몸통 하나라 지금 컨테이너(`Flex` · `Card` 몸통)와 같다 — 팔레트 «넣기» 는 고른 자리표시자의 몸통 끝, 캔버스 끌기는 «안» 띠, 빈 몸통은 끄는 동안 빈 구역 칸(2단계 Q2 (가) — 몸통은 지금도 «안» 띠다).

---

# 12. 구현을 나누는 법

**문제 1(CI-A)과 문제 2(CI-B)는 서로 기대지 않는다** — CI-A 는 새 타입 · `Field` · 선택지 위젯 · 문서 판 4, CI-B 는 `Placeholder` 의 props · 몸통 · 그림 저장 · 에디터 그림 칸이다. 서로의 산출물을 안 쓴다. **다른 워크트리에서 나란히 돌리고 CI-A 를 먼저 병합한다.**

### 겹치는 파일

| 파일 | CI-A | CI-B | 병합 |
| --- | --- | --- | --- |
| `packages/schema/src/component/define.ts` 의 `EditorControl` · `EditorField` | `optionList` · `select` | `color` · `image` | 한 줄 꼴 겹침 — 손으로 합친다 |
| `catalog/index.ts` 의 `CATALOG_DEFS` | 아홉 더함 | 없음 | 겹침 없음 |
| `catalog/input.ts` · `catalog/document.ts` | `input.ts` | `document.ts` | 겹침 없음 |
| `packages/theme-sdk/src/version.ts` · `default-views/index.ts` · `marks.ts` | 1.4.0 · 뷰 아홉 등록 · 표지 | 1.5.0 · `useAsset` · 표지 | **CI-B 가 rebase 때 판을 1.5.0 으로** · 표 줄 합치기 |
| `system-themes/admin` 의 `theme.css` · `manifest.ts` · `package.json` 판 · `checksums.json` | 판 올림 · 줄 | 판 올림 · 줄 | **CI-B 가 rebase 때 판을 다시 올리고 산출물 sha256 을 새로 적는다**(배포 안 한 판의 줄이라 CI-A 의 줄을 고치지 않고 새 줄을 더한다) |
| `packages/theme-gallery/src/samples.ts` | 새 타입 · `Field` | 자리표시자 표본 | 손으로 합친다 |
| `packages/theme-kit/template`(`views/input.tsx` · `views/document.tsx` · `SKILL.md`) | input · SKILL 목록 | document · SKILL 의 `useAsset` | 파일이 갈린다 · SKILL 은 손으로 |
| `packages/renderer/src/render.tsx` | `weightRoom` 한 줄 | `assetUrl` 옵션 | 손으로 |
| `apps/web/src/panels/property-panel.tsx` · `controls/` | `optionList` | `color` · `image` 위젯 | 새 위젯은 파일이 갈린다 · 고르는 자리 한 곳 |
| `apps/web/config/llms-txt.ts` · `apps/web/public/llms.txt` | 영어 표 아홉 | 그림 문장 | 병합 뒤 생성물을 다시 낸다 |
| 마이그레이션 | `0029-compose-field` | `0030-assets` | 번호를 미리 나눴다 |
| `packages/renderer/test/prop-marks.test.tsx` · `packages/theme-sdk` 테스트 | 표 | 표 | 손으로 |
| 개수 하한(`apps/web/build-test/palette.test.ts` 의 카드 ≥ 17 · `packages/theme-kit/build-test/dev.test.ts` 의 표본 수 · `shots.test.ts` 의 폴백 목록) | 타입이 20 → 29 로 는다 — 하한은 그대로 참(늘기만 한다) · 표본 수를 단언하는 자는 센다 | 표본 하나 더 | CI-A 가 센다 · CI-B 는 rebase 뒤 다시 센다 |

**CI-A 를 먼저 병합하는 까닭:** 겹치는 자리 가운데 손이 많이 드는 쪽(카탈로그 · 갤러리 · 테마 CSS 의 `Field` 규칙)이 CI-A 다. CI-B 의 rebase 일은 판 번호 · checksum · 생성물 다시 내기로 기계적이다. 두 트랙의 테스트 DB 는 워크트리마다 따로라 api 게이트도 나란히 돈다(마이그레이션 번호가 갈려 있어 각자의 DB 에서 충돌이 없다 — 병합 전에 CI-B 워크트리의 `kysely_migration` 이 `0029` 없이 `0030` 을 기록한 판을 내린다: AGENTS.md 「검증 — wirebound」 의 «마이그레이션 번호를 옮기면» 줄).

### 크기

| 트랙 | 크기 | 근거 |
| --- | --- | --- |
| CI-A 조합 입력 | **L** | 카탈로그 아홉 + `Field` · 기본 뷰 아홉 + CSS · 기본테마 CSS · manifest 변형 · 갤러리 · 스타터 템플릿 · `optionList`(+ 옮기기) · `weightRoom` · 표지 · `/llms.txt` · 문서 판 4 + `0029`(S — `0028` 꼴). 기존 케이스: 케이스 파일(`*.test.*` · `test/` · `build-test/`)에서 `Field` 의 `control` 값을 적은 줄 26 · 14 파일, `type: 'Field'` 가 든 케이스 31 파일(대부분 `{ type: 'Field', props: { label } }` 픽스처라 그대로 맞다 — `control` · `placeholder` · `disabled` · `invalid` 를 단언하는 것만 바뀐다). 셈은 «소비자 조사 — 다시 재는 법». Q2 (가) «종류 바꾸기» 를 넣으면 + M |
| CI-B 자리표시자 | **L ~ XL** | B1(props · 몸통 · 기본 뷰 · 색 칸 — M)과 B2(표 셋 · 라우트 다섯 · 한도 · 꼴 검사 · claim 셋(붙이기 · 모듈 넣기 · 저장 · 복사) · 번들 수집 · 렌더러 옵션 · 그림 칸(고르기 · 놓기 · 붙이기 · 진행 · 실패) — L)로 나뉜다. 실브라우저 판(놓기 · 붙이기 · 캡처에 그림이 서는가 · 번들 `file://`)이 많다 |

CI-B 를 B1 · B2 로 나눠 차례로 돌려도 된다 — B1 만 들어간 판은 그림 칸이 없는 자리표시자다(모듈 저장 · 붙이기가 그림을 몰라도 깨질 것이 없다).

---

# 사용자에게 물을 것

### Q1. 세그먼트 · 체크 칩을 무엇으로 두나

| 선택지 | 무엇이 되나 |
| --- | --- |
| **(가) 테마 변형(추천)** | `RadioGroup` 의 변형 `segment` · `CheckboxGroup` 의 변형 `chip`. 기본테마는 `RadioGroup` 의 기본을 세그먼트로 둬 팔레트 한 걸음이다. 다른 테마가 `segment` 를 선언 안 하면 lint 경고 + 그 테마의 기본(라디오)으로 그린다 |
| (나) 별개 타입 | `Segment` · `CheckChips` 를 카탈로그에 더한다(타입 11 개). 어느 테마에서나 세그먼트로 그려진다 — 테마는 그 타입을 그려야 한다 |

추천 까닭: 자료 모양(선택지 · 하나 · 여럿)이 같고 다른 것은 모양뿐이라, 정본 「테마의 범위」 의 «형태가 다른 구조는 테마가 variant 로 더한다» 에 든다(`List` 가 표 · 카드 그리드인 것과 같다). 대가는 다른 테마로 바꿨을 때 세그먼트가 라디오로 보일 수 있다는 것이다 — 설계의 낱말로 «세그먼트» 를 꼭 지키고 싶으면 (나)다.

### Q2. 셀렉트 필드 · 날짜 필드처럼 «입력 하나가 아닌 흔한 꼴» 을 몇 걸음에 짓나

새 `Field` 는 `Input` 하나를 들고 선다. 셀렉트 필드는 지금(넣고 → `control` 고르기 — 두 걸음)보다 걸음이 는다.

| 선택지 | 무엇이 되나 |
| --- | --- |
| **(가) 조각의 «종류 바꾸기»(추천)** | 구조 트리 줄 `…` 에 «종류 바꾸기 ▸ 셀렉트 · 날짜 · 시간 · …» — 입력 조각끼리만, 노드 id · 표지 · 별칭 · 보임 · 상호작용 · 몫을 지키고 이름이 같은 prop(`placeholder` · `disabled` · `readonly` · `invalid`)을 옮긴다. 셀렉트 필드 = 넣기 + 바꾸기(누름 셋). CI-A + M |
| (나) 팔레트에 필드 꼴 카드 | «셀렉트 필드» · «날짜 필드» · «기간 필드» 카드 — `Field` 에 다른 기본 내용을 넣는 꼴. 한 걸음이다. 카탈로그에 «같은 타입의 다른 시작» 이라는 새 개념이 들고, 카드가 는다 |
| (다) 없음 | `Input` 을 지우고 `Select` 를 넣는다(셋 · 끌기 하나) |

### Q3. 판 3 문서(옛 `Field`)를 어떻게 하나

| 선택지 | 무엇이 되나 |
| --- | --- |
| **(가) 판 4 + `0029` 옮기기(추천)** | `control` 마다 조각으로(«문서 판 4» 표). 크기 S(`0028` 꼴). 로컬 볼륨의 설계서가 그대로 열린다 |
| (나) 판 4 + 판 3 거절 | 짓는 것이 없다 — 판 3 페이지를 읽는 자리가 다 오류라 로컬 DB 를 비워야 한다(설계서가 든 볼륨을 지운다) |

### Q4. 자리표시자의 색을 무엇으로 고르나

| 선택지 | 무엇이 되나 |
| --- | --- |
| **(가) 자유 색 `#rrggbb` + 견본 팔레트(추천)** | 설계서의 «파란 칩» · «노란 배지» 를 그 색 그대로. 테마를 바꿔도 색이 그대로다 |
| (나) 테마 토큰에서 고르기 | `semantic.primary` 같은 그 테마의 색 이름을 적는다 — 테마를 바꾸면 그 테마의 색으로 바뀐다. 토큰 이름은 테마마다 달라(카탈로그 · SDK 가 정한 공통 이름이 없다) 다른 테마에서 없는 이름이면 테마 기본으로 선다 |

### Q5. 아무 노드도 안 쓰는 그림을 언제 지우나

| 선택지 | 무엇이 되나 |
| --- | --- |
| **(가) 프로젝트와 함께만(추천)** | 복원 · 되돌리기 · 모듈이 늘 그림을 찾는다. 안 쓰는 그림도 프로젝트 한도(200 MB)를 먹는다 — 목록에서 보인다 |
| (나) 정리 단추(owner) | «안 쓰는 그림 지우기» — 페이지 · 레이아웃 · 프로젝트 모듈 · 스냅샷 payload · 편집 이력을 다 읽어 안 가리키는 그림만. 그 뒤의 복원 · 되돌리기는 그 그림이 깨질 수 없다(셈에 든다). + M |
| (다) 자동 정리 | 정해진 때 (나)를 저절로. 지운 것을 사람이 모른다 |

### Q6. 개인 모듈에 든 그림을 어떻게 하나

| 선택지 | 무엇이 되나 |
| --- | --- |
| **(가) 사람 몫으로 함께 간다(추천)** | 개인 모듈을 저장할 때 그림을 사람 몫(한도 100 MB)에 더한다 — 다른 프로젝트에 넣어도 그림이 선다. 출처 프로젝트를 지워도 남는다 |
| (나) 그림을 빼고 저장한다 | 개인 모듈 저장이 `image` 를 비우고 «그림 N개는 개인 모듈에 담지 않았습니다» 를 말한다. 사람 몫 표 · 한도가 없다(CI-B − S) |

### Q7. SVG 를 받나

| 선택지 | 무엇이 되나 |
| --- | --- |
| **(가) 받는다 — 격리 헤더로(추천)** | 그림 응답마다 `CSP sandbox` · `nosniff`. 에디터 · 번들 · 캡처는 다 `<img>` 라 스크립트가 안 돈다. 남는 길은 내보낸 번들의 SVG 파일을 사람이 `file://` 로 직접 여는 것(세션 없는 로컬 origin) |
| (나) 안 받는다 | PNG · JPEG · WebP · GIF 만. 벡터 아이콘은 PNG 로 바꿔 올린다 |

---

## 소비자 조사 — 다시 재는 법

워크트리 뿌리에서.

```bash
# Field 의 control 값을 적은 케이스 줄 · 파일(편집 정의 `control: 'text', label` 꼴은 뺀다)
python3 - <<'PY'
import subprocess, re
fs = [f for f in subprocess.run(['git', 'ls-files'], capture_output=True, text=True).stdout.split()
      if ('.test.' in f or '/test/' in f or '/build-test/' in f) and f.endswith(('.ts', '.tsx'))]
pat = re.compile(r"control:\s*'(text|number|select|date|dateRange|checkbox|radio|textarea|file)'(?!\s*,\s*label)")
hits = [(f, l) for f in fs for l in open(f, encoding='utf-8').read().split('\n') if pat.search(l)]
print(len(hits), len({f for f, _ in hits}))
print(len([f for f in fs if re.search(r"type:\s*'Field'", open(f, encoding='utf-8').read())]))
PY
# 폼 몸통이 받는 타입(accepts 가 없음을 본다)
git grep -n -A3 "name: 'body'" -- packages/schema/src/component/catalog/input.ts
# 배열 편집 컨트롤을 쓰는 자리
git grep -n -E "control: '(stringList|pairList)'" -- packages/schema/src
# 트리거 → DOM 이벤트
git grep -n -A6 'const DOM_EVENT' -- packages/renderer/src/render.tsx
# 개수 하한 단언
git grep -n -E 'toBeGreaterThanOrEqual\([0-9]+\)' -- apps/web/build-test/palette.test.ts packages/theme-kit/build-test
```
