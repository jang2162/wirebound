# CI-A 보고 — 조합 입력(3단계 문제 1) — 2026-10-24

브리프: 코디네이터 `brief-ci-a.md` · 공통 `common-w8.md`. 워크트리 `feat-compose-input` · 브랜치 `feat/compose-input` · 기준 `96efb495`. node v24.21.0 · Postgres 5501(이 워크트리의 컨테이너). 설계 `docs/superpowers/specs/2026-10-24-compose-input-design.md` 「문제 1」.

## 바꾼 것

커밋 차례대로(`git log 96efb495..HEAD`):

| 커밋 | 묶음 |
| --- | --- |
| `e05321fc` | 카탈로그 — `Field` = `label` · `required` + «값» 구역(몸통 · `initial: [Input]`), `control` · `placeholder` · `disabled` · `invalid` 걷음. 조각 아홉(`Input`(`kind` text · number · password) · `TextArea` · `Select` · `DateInput` · `TimeInput` · `CheckboxGroup` · `RadioGroup` · `Chip` · `Affix`(`tone`)). 선택지 `options: { label, selected }[]`(하나 고르는 타입은 `refine` · 1 – 30). `EditorControl` `optionList` + `select: 'one' \| 'many'`. 문서 판 4. SDK 1.4.0 — 기본 뷰 아홉 · `FieldView`(뿌리 `group` · 라벨 조각 id 로 이름) · `readonly` → `aria-readonly` · 표지(`Affix.tone` · `size` 등) · `weightRoom('Field')`. 기본테마 1.4.0 — 조각 CSS · `RadioGroup.segment`(기본) · `CheckboxGroup.chip` 변형. 스타터 템플릿 · 갤러리 표본. 판 3 · 옛 `Field` 를 쓰던 케이스를 새 꼴로 |
| `3f24d10a` | `0029-compose-field`(페이지 · 레이아웃 · 두 모듈 표 · 스냅샷 payload 의 `pages[]` · `layouts[]`) · 속성 패널 `optionList` 위젯(고르기 · 풀기 · 하한 1 · 상한 30) · 배열 위젯 전부의 옮기기(↑ ↓) · 구조 트리 줄 `…` «종류 바꾸기…» 상자 · `/llms.txt` 영어 줄 · system-admin 1.4.0 checksum |
| `64b4739d` | 정본 설계서 · `apps/api/README.md`(0029 는 되돌릴 수 없다) · 설계 문서 Q2 문장(«상자») · 웹 케이스(속성 패널 · 잠금 · 페이지 JSON · 노드 만들기 · viewer 훑기) |
| `4ad4386f` | 실브라우저 판 `apps/web/build-test/compose-input.test.ts`(4) · api 경계 `apps/api/test/compose-input-boundary.test.ts`(4) · 옛 `Field.control` 을 쓰던 build-test 를 값 칸 조각으로 · 갤러리 타입 수 29 |
| `99c6ddf3` | schema 계약 케이스 `packages/schema/test/component/compose-input.test.ts`(값 구역 · 선택지 규칙 · `optionList` 의 `select` 가드) |
| `bd184185` | 종류 바꾸기 — 규격을 못 지나는 같은 이름 prop 만 버리는 케이스(변조 U2 가 살아 더함) |
| `6688e0a2` | 게이트 1차의 빨강 셋 — 고정 폭 `size` 를 `width: min(<n>em, 100%)` 로(SDK 기본 CSS · 기본테마 — 390 창에서 `long` 이 넘쳤다) · 1.4.0 checksum · 번들 `views.css` 해시 · `canvas-drop` 픽스처 필드에 값 칸 `Input` · `theme-prop-marks` 의 묶음 이름에 필수 별 |

### 겹침 표 밖에서 건드린 파일

설계 「구현을 나누는 법」 의 겹침 표에 없는 소스: `apps/web/src/panels/{structure-tree,structure-toolbar,tree-row-actions,toolbar-status,change-kind-dialog(새)}.tsx|ts` · `apps/web/src/edit/change-kind.ts`(새) · `apps/web/src/shell.css` · `apps/web/src/shell/icons.ts` · `packages/schema/src/{index,migrate}.ts` · `packages/schema/src/interaction/describe.ts` · `packages/theme-sdk/src/{index.ts,default-views/input.tsx}` · `packages/theme-sdk/package.json` · `apps/api/src/db/migrations/index.ts` · `apps/playground/src/{sample.ts,debug.css}`. CI-B 가 `controls/` 에 위젯을 더하면 `list-control.tsx`(옮기기 단추)와 겹칠 수 있다 — 같은 파일을 고치지 않으면 겹치지 않는다.

## 결정과 이유

### «종류 바꾸기» 는 하위 메뉴가 아니라 상자다 (물음 1 · 코디네이터 답)

설계 Q2 (가)는 줄 `…` 의 «종류 바꾸기 ▸ …» 하위 메뉴였다. 행동 메뉴(`shell/action-menu.tsx`)에 하위 메뉴가 없어 지으려면 중첩 portal · ← → · 바깥 누름을 그 메뉴에 새로 넣어야 했다 — 그 메뉴를 쓰는 판 전부가 영향권이다. `…` → «종류 바꾸기…» → 상자(`ShellDialog`)의 종류 단추로 지었다(누름 수는 같은 셋). 상자는 트리 상자의 형제로 그린다(`shell-dialog.tsx` 머리말 — 상자 안 키가 줄 행동으로 버블되지 않게). 대상 · 목적지는 값을 받는 일곱(`Chip` · `Affix` 는 입력이 아니다 · 물음 2). 정본 · 설계 문서의 Q2 문장을 «상자» 로 고쳤다. 항목 목록의 자리가 바뀌는 판을 셌다 — `git grep "name: '삭제'" apps/web/build-test` 는 7 파일 11 줄이고, 그 파일들 어디도 입력 조각 줄(`type: 'Input'` 등 일곱)을 안 싣는다(입력 조각을 싣는 build-test 는 `canvas-drop` · `compose-input` · `layout-weight` · `theme-prop-marks` · `theme-system-review`). «종류 바꾸기…» 는 입력 조각 줄에만 서므로 그 판들의 `…` 목록은 안 바뀐다 — 실브라우저 전량(게이트 2차)이 초록이다.

### 종류 바꾸기의 op 은 필드마다다 (`type` · `props` · `variant`)

노드째 `replace` 는 그 사이 남이 단 번호 · 별칭 · 상호작용을 덮는다. 필드 `replace` 는 남이 같은 필드를 고쳤으면 뒤의 것이 이긴다(리베이스가 원래 하던 일). `props` 는 통째다 — 새 타입의 규격에 맞는 한 덩이라, 남이 고친 옛 타입의 prop 하나를 얹으면 규격이 깨진다. **그래서 바꾸기 직전 남이 고친 prop 은 바꾸기에 덮인다** — 실브라우저 판에서 남(bob)의 «남의 안내» 가 내 바꾸기의 «옛 안내» 에 덮였다(화면 = 서버). 「남은 것」 1.

- 이름이 같고 새 타입의 규격을 지나는 prop 만 옮긴다(`Input.kind` 는 `Select` 에 없다). 하나만 고르는 타입으로 갈 때 고른 항목은 첫째만 남긴다 — 그대로 옮기면 규격이 거절해 `options` 가 통째로 빠진다.
- `variant` 는 걷는다 — 변형은 타입마다 테마가 선언한다(`RadioGroup` 의 세그먼트가 `Select` 에 없다).
- 보내기 직전에 `store.editBlockedBy` 를 한 번 더 묻는다 — 상자를 연 뒤 남이 그 조각(또는 조상)을 잡았으면 말하고 안 보낸다.

### `0029` 의 옮기는 표

| 판 3 `control` | 판 4 값 칸 | 까닭 |
| --- | --- | --- |
| `text`(없음 · 모르는 값) | `Input` | |
| `number` | `Input{kind:'number'}` | |
| `select` | `Select` | 선택지는 기본값 |
| `date` | `DateInput` | |
| `dateRange` | `DateInput` · `Affix '~'` · `DateInput` | 안내 문구는 안 옮긴다 — 두 칸에 같은 글이 선다 |
| `checkbox` | `CheckboxGroup` | 안내 · 오류 prop 이 없다 |
| `radio` | `RadioGroup` + `variant: 'radio'` | 기본테마의 기본이 세그먼트라 옛 라디오 모양을 지킨다 |
| `textarea` | `TextArea` | |
| `file` | `Input{readonly, placeholder:'선택된 파일 없음'}` · `Button '파일 선택'` | 파일 조각이 없다 — 설계 «조각 목록» 의 꼴 |

- `Field` 의 id · 번호 · 별칭 · 보임 · 상호작용은 그대로다 — 코멘트 · 표지가 그 id 를 가리킨다. 새 조각 id 는 그 문서(묶음)의 id 와 안 겹치게 새로 짓는다(`0028` 과 같은 꼴).
- `setProp` 이 옮긴 prop(`placeholder` · `disabled` · `invalid`)을 바꾸던 액션은 그 prop 을 가진 첫 조각을 가리킨다. `control` 을 바꾸던 액션은 그대로 둔다 — 검증 경고 `invalid-interaction-prop` 이 그 자리를 말한다.
- `revisions` 는 안 옮긴다 — 옮기기 전 편집의 되돌리기는 `/props/control` 을 가리켜 건너뛰어진다.
- **판 3 → 4 단계는 `0029` 에만 있다** — 런타임 사슬(`@wirebound/schema` 의 `MIGRATIONS`)에 안 넣었다. 가져오기 · 클립보드의 판 3 은 거절된다(배포된 서비스가 없어 옛 문서 호환은 안 본다 — 공통 규칙). `down` 은 행이 있으면 «백업에서 되돌린다» 로 거절한다(`0028` 과 같다).

### 접근성

- `Field` 뿌리는 `group` 이고 라벨 조각의 id(노드마다 갈린다)를 `aria-labelledby` 로 가리킨다. `required` 는 그룹에 `aria-required` 를 안 단다(그룹 역할에 그 속성이 없다) — 라벨의 별은 상태가 낸다.
- `readonly` 상태 → 조각 뿌리의 `aria-readonly`. 조각의 역할은 `Input`(kind 마다 textbox · spinbutton) · `TextArea` · `DateInput` · `TimeInput` 은 textbox, `Select` 는 combobox, 묶음 둘은 `group` 안의 checkbox · radio.

### 번들 바이트 기준값을 다시 지었다

`packages/exporter/test/bundle-stateless-bytes.test.ts` 의 기준 해시가 바뀌었다. 픽스처의 문서 판만 다르다는 주장을 재려고 픽스처 판을 잠깐 3 으로 되돌려 옛 해시가 그대로 서는 것을 보았다(되돌림은 바이트 비교로 복원).

### 고정 폭은 칸을 안 넘는다

`size` 의 폭(6 · 12 · 24em)을 `width: min(<n>em, 100%)` 로 둔다. 게이트 1차의 `shots` 픽스처(SDK 기본 CSS 만 실은 테마)에서 갤러리 표본 `Input — 비밀번호 · 길게` 가 390 창의 칸을 넘었다(`["Input//in3","div[data-wb-component=Input]"]`). `max-width: 100%` 는 기본테마의 «`max-width` 규칙은 가운데 정렬» 잠금(`system-themes/admin/test/admin.test.ts`)에 걸려 `min()` 으로 썼다.

### 필수 별은 묶음 이름에 든다

기본테마의 필수 별(`::after " *"`)은 라벨을 거쳐 `group` 의 접근 이름 끝에 든다 — Chrome 접근성 트리의 이름이 `'접근성 이름 *'` 이다(`apps/web/build-test/theme-prop-marks.test.ts`). 필수는 그 별 하나로 보조 기술에 닿는다(`group` 은 `aria-required` 를 안 받는다).

### 모듈 넣기는 `initial` 을 안 탄다

모듈 넣기는 저장된 노드를 그대로 넣는다 — 값 칸째 저장돼 있어 `initial` 이 안 낀다. 실브라우저 «넣기 입구» 판은 팔레트 · 구역 줄 넣기 · 끌어 놓기 · 붙여넣기 넷이다.

## 잰 값

### 1. 팔레트 한 걸음 · 넣기 입구 (실브라우저)

입구 넷(팔레트 «넣기» · 검색폼 «조건» 구역 줄을 고른 «넣기» · 카드 끌어 놓기 · 복사 → 붙여넣기)에서 서버 문서의 값 칸 = `[Input]`(props 없음) · 캔버스의 값 조각 안에 입력 상자가 보인다. 네 판이 같은 꼴.

### 2. 종류 바꾸기 — 되돌리기 · 두 사람 · 잠금

| 판 | 값 |
| --- | --- |
| `…` → «종류 바꾸기…» → «날짜» (실브라우저) | 서버 `{ id: 'n_input00001', type: 'DateInput', props: { placeholder: '옛 안내' } }`(`kind` 는 버림) · 되돌리기가 서버를 옛 `Input{placeholder, kind:'number'}` 로 |
| 남(bob)의 안내 문구 고침이 내 화면에 닿기 전(서버 → 브라우저 1.5s 지연 · 늦춘 덩어리 10)에 «셀렉트» | 서버 `{"id":"n_input00001","type":"Select","props":{"placeholder":"옛 안내"}}` · 캔버스 `["Select","옛 안내"]` — 화면 = 서버. 판 카나리아: 누른 때 `page-changed` 0 · 내 바꾸기가 WS `patch` 로 나감 |
| 남이 고른 조각 (실브라우저) | 줄 `…` 0 개 · «종류 바꾸기…» 0 개 · 누르면 안 골라짐. 남이 다른 노드로 옮기면 `…` 1 개 · 항목 켜짐 · 서버는 그대로 `Input` |
| 고른 뒤 남이 잡음 (jsdom) | 항목 꺼짐 · 이유에 «보라» |
| 상자를 연 뒤 남이 조상(`Field`)을 잡음 (jsdom) | 단추를 눌러도 편집 0 · 하단 바 «보라님이 …» |

### 3. viewer · 뷰 모드

| 판 | 값 |
| --- | --- |
| viewer — 화면 (jsdom) | 줄 `…` 에 «모듈로 저장…» 만 · «종류 바꾸기…» 없음 · 편집 0 |
| viewer — api | 종류 바꾸기 op(`replace …/type` · `…/props`) 403 · 문서 그대로. editor 이상 200 · 같은 id · 번호 · 별칭 |
| 뷰 모드 (jsdom) | 구조 트리 · 속성 탭(선택지 위젯) 없음 · 편집 0 |
| 선택지 경계 — api | 하나 고르는 타입에 고른 것 둘 → 422 «하나만 고를 수 있습니다» · 빈 배열 · 31 개 → 422 · 30 개 200 |

### 4. `0029`

판 3 표본(아홉 `control` · `placeholder` · `disabled` · `invalid` · 구역 안의 `Field` · `setProp` 액션 · 코멘트) → 판 4:

- 남은 판 3 문서 0 — 페이지 · 레이아웃 · 스냅샷 문서(판 2 · 3 · 4 문서 · 레이아웃) · 두 모듈 표(옛 필드 prop · 값 칸 없는 필드).
- 페이지 노드 id 목록 29 개(옛 id 전부 + 새 조각) · 조각 타입 · 순서가 표대로 · 번호 · 별칭 · 보임 그대로 · 판 4 검증 오류 0.
- 코멘트가 가리키는 `Field` id 가 남는다.
- 한 번 더 돌려도 그대로(판 4 문서 `null` · 값 칸이 든 필드는 조각을 안 더함).
- `down` — 행이 있으면 거절 · 다 비면 내려간다.

사용자의 개발 DB 에서는 병합 때 돈다 — 이 워크트리에서는 테스트 DB 의 표본으로만 잰다.

### 5. 카탈로그 타입 수

카탈로그 20 → 29. `packages/theme-kit/build-test/dev.test.ts` 의 갤러리 타입 수 단언을 29 로 고쳤다. `.sample-card` 6 · `apps/web/build-test/palette.test.ts` 의 카드 ≥ 17 · `shots.test.ts` 의 폴백 0 은 그대로 참이다(게이트 「`test:build:serial`」 에서 잰다).

### 6. 옛 `Field` 로 판을 만들던 케이스

- 기준(`96efb495`)에서 `control` 키를 든 케이스 파일 21 개. HEAD 에서 `Field.control` 을 쓰는 것은 `0029` 케이스(판 3 표본)와 «`control` 을 거절한다» 단언 하나뿐이다 — 남은 `control:` 줄은 편집 칸의 위젯 종류(`EditorField.control`)다.
- 판 3 리터럴을 4 로 바꾼 케이스 · 옛 `Field` prop 을 단언하던 케이스는 「바꾼 것」 의 커밋 둘(`e05321fc` · `64b4739d`)과 build-test(`4ad4386f`)에 있다 — 155 파일 중 케이스 파일이 대부분이다.

### 숨은 글자

바뀐 155 파일에서 숨은 글자(제어 · 방향 제어 · 폭 없음 · U+2028/2029) 1 개 — `packages/schema/test/node-alias.test.ts` 51 줄의 U+2028 은 기준(`96efb495`)에도 있던 케이스 값이다(날글자로 들어 있다 — 기준에서 숨은 글자 1 개, 이 트랙이 더한 것 0).

## 혼자 죽는 변조 표

러너: 백업(경로 전체 이름) · 찾는 글자 맞은 수 1 확인 · 그 케이스 파일만 · 바이트 비교 복원. 실행 수는 `통과 + 실패`.

| 변조 | 바꾼 곳 | 돌린 파일 | 실행 · 죽음 | 죽은 케이스 ⟶ 값 |
| --- | --- | --- | --- | --- |
| S1 Field 기본 내용 걷음 | `packages/schema/src/component/catalog/input.ts` | `compose-input.test.ts` · `create-node.test.ts` | 20 · 2 | 기본 내용 — 구역의 `initial` 이 실제 노드로 들고 id 는 같은 생성기에서 차례로 나온다 ⟶ AssertionError: expected [ 'EntryForm', 'SearchForm', 'Tabs' ] to deeply equal [ 'EntryForm', 'Field', …(2) ]<br>값 구역은 몸통 하나이고 무엇이든 받으며 새로 만들면 Input 하나가 든다 · 입력의 prop 은 없다 ⟶ AssertionError: expected [ { name: 'body', label: '값' } ] to deeply equal [ { name: 'body', label: '값', …(1) } ] |
| S2 하나만 refine 걷음 | `packages/schema/src/component/catalog/input.ts` | `compose-input.test.ts` · `compose-input-boundary.test.ts` | 13 · 3 | 하나만 고르는 타입에 둘을 고른 배열은 422 이고 그 prop 경로를 말한다 · 하나는 200 ⟶ AssertionError: {"seq":2,"revisionId":"7957e9c9-a385-45c3-98c2-de021ca17272","inverse":[{"op":"replace","path":"/root/children/0/children/1/props/options","valu<br>Select — 고른 것 0 · 1 개는 받고 2 개는 «하나만 고를 수 있습니다» 로 거절한다 ⟶ AssertionError: expected true to be false // Object.is equality<br>RadioGroup — 고른 것 0 · 1 개는 받고 2 개는 «하나만 고를 수 있습니다» 로 거절한다 ⟶ AssertionError: expected true to be false // Object.is equality |
| S3 여럿 고르는 상한 걷음 | `packages/schema/src/component/catalog/input.ts` | `compose-input.test.ts` | 9 · 1 | CheckboxGroup — 하나 이상 · 30 개 이하 · 모르는 키는 거절 ⟶ AssertionError: expected true to be false // Object.is equality |
| S4 optionList select 가드 걷음 | `packages/schema/src/component/define.ts` | `compose-input.test.ts` | 9 · 1 | optionList 에 select 가 없으면 · 다른 칸에 select 가 있으면 정의하는 자리에서 던진다 ⟶ AssertionError: expected [Function] to throw an error |
| S5 LABEL_PROPS Chip 걷음 | `packages/schema/src/interaction/describe.ts` | `interaction-describe.test.ts` | 36 · 1 | labelProp을 가진 타입이 열하나다 ⟶ AssertionError: expected [ 'Affix', 'Button', 'Card', …(7) ] to deeply equal [ 'Affix', 'Button', 'Card', …(8) ] |
| S6 요약이 고른 항목을 안 봄 | `packages/schema/src/component/catalog/input.ts` | `node-display.test.ts` | 58 · 2 | Select {"options":[{"label":"10"},{"label":"20","selected":true}]} → 2 ⟶ AssertionError: expected '10' to be '20' // Object.is equality<br>CheckboxGroup {"options":[{"label":"월","selected":true},{"label":"화"}, ⟶ AssertionError: expected '월' to be '월 · 수' // Object.is equality |
| R1 표지 Affix.tone 걷음 | `packages/theme-sdk/src/marks.ts` | `prop-marks.test.tsx` | 135 · 3 | SDK 의 표지 표(MARKED_PROPS)가 인구조사의 mark 칸과 같고 꼴이 맞다(불리언 flag · enum value ⟶ AssertionError: expected [ 'Chip.removable:flag', …(13) ] to deeply equal [ 'Affix.tone:value', …(14) ]<br>'Affix.tone'('mark') — 바꾸면 기본 뷰의 DOM 이 바뀐다 ⟶ AssertionError: expected '<span data-wb-structure="default" dat…' not to be '<span data-wb-structure="default" dat…' // Object.is equality<br>'Affix.tone' — 표지 'danger' ⟶ AssertionError: expected null to be 'danger' // Object.is equality |
| R2 readonly → aria-readonly 걷음 | `packages/theme-sdk/src/marks.ts` | `prop-marks.test.tsx` · `default-view-props.test.tsx` | 167 · 6 | Input {} → role=textbox · invalid · readonly 가 뿌리에 ⟶ AssertionError: expected null to be 'true' // Object.is equality<br>Input {"kind":"number"} → role=spinbutton · invalid · readonly 가 뿌리에 ⟶ AssertionError: expected null to be 'true' // Object.is equality<br>Input {"kind":"password"} → role=textbox · invalid · readonly 가 뿌리에 ⟶ AssertionError: expected null to be 'true' // Object.is equality<br>TextArea {} → role=textbox · invalid · readonly 가 뿌리에 ⟶ AssertionError: expected null to be 'true' // Object.is equality<br>DateInput {} → role=textbox · invalid · readonly 가 뿌리에 ⟶ AssertionError: expected null to be 'true' // Object.is equality<br>TimeInput {} → role=textbox · invalid · readonly 가 뿌리에 ⟶ AssertionError: expected null to be 'true' // Object.is equality |
| R3 Field 뿌리 aria-required 거둠 걷음 | `packages/theme-sdk/src/default-views/input.tsx` | `prop-marks.test.tsx` · `default-view-props.test.tsx` | 167 · 2 | 필수는 상태 · 별(라벨)이고 group 에 aria-required 를 안 단다 ⟶ AssertionError: expected true to be false // Object.is equality<br>Field.required — 뿌리(group)에 aria-required 가 없고 라벨의 별은 상태가 낸다 ⟶ AssertionError: expected true to be false // Object.is equality |
| R4 Field 라벨 이름 걷음 | `packages/theme-sdk/src/default-views/input.tsx` | `default-view-props.test.tsx` | 32 · 2 | 뿌리는 group 이고 라벨 조각의 id 를 이름으로 가리킨다 · 라벨 · 값 조각이 형제다 ⟶ AssertionError: expected null to be 'f1-label' // Object.is equality<br>라벨 id 는 노드마다 갈린다 — 한 문서에 필드가 둘이어도 이름이 섞이지 않는다 ⟶ AssertionError: expected 1 to be 2 // Object.is equality |
| R5 weightRoom Field 걷음 | `packages/renderer/src/render.tsx` | `default-view-props.test.tsx` | 32 · 1 | 몫을 준 조각의 뿌리에 --wb-node-weight 가 선다 · 기본 CSS 가 값 칸 자식에 flex 를 건다 ⟶ AssertionError: expected '' to be '1' // Object.is equality |
| T1 RadioGroup 기본 변형 radio | `system-themes/admin/src/manifest.ts` | `admin.test.ts` | 16 · 1 | 0.1.0 이 선언한 variant 를 전부 그대로 선언한다 · 카드의 테두리 없는 변형 · 선택지 묶음의 변형을 더한다 ⟶ AssertionError: expected { Section: 'default', …(6) } to deeply equal { Section: 'default', …(6) } |
| T2 세그먼트 규칙 이름 어긋남 | `system-themes/admin/src/theme.css` | `admin.test.ts` | 16 · 1 | default · Button primary 밖의 선언한 variant 마다 그 variant 를 겨냥한 규칙이 있다 ⟶ AssertionError: expected [ 'RadioGroup/segment' ] to deeply equal [] |
| M1 0029 dateRange 사이 글자 걷음 | `apps/api/src/db/migrations/0029-compose-field.ts` | `compose-field-migration.test.ts` | 8 · 2 | 페이지 — control 마다 표대로 조각 · 노드 수 · 옛 id · 번호 · 별칭 · 보임 · 판 4 검증을 지난다 ⟶ AssertionError: expected [ 'n_root', 'n_sf', 'n_text', …(25) ] to have a length of 29 but got 28<br>판 4 페이지 · 레이아웃 · 두 모듈 표 · 스냅샷(판 2 · 3 · 4 문서와 레이아웃) ⟶ AssertionError: expected [ 'DateInput', 'DateInput' ] to deeply equal [ 'DateInput', 'Affix', 'DateInput' ] |
| M2 0029 setProp 안 옮김 | `apps/api/src/db/migrations/0029-compose-field.ts` | `compose-field-migration.test.ts` | 8 · 2 | setProp — 옮긴 prop 은 그 prop 을 가진 첫 조각으로 · control 과 남은 prop 은 그대로 ⟶ AssertionError: expected [ { prop: 'placeholder', …(3) }, …(4) ] to deeply equal [ { type: 'setProp', …(3) }, …(4) ]<br>판 4 페이지 · 레이아웃 · 두 모듈 표 · 스냅샷(판 2 · 3 · 4 문서와 레이아웃) ⟶ AssertionError: expected [ { prop: 'disabled', …(3) } ] to deeply equal [ { type: 'setProp', …(3) } ] |
| M3 0029 스냅샷 레이아웃 안 옮김 | `apps/api/src/db/migrations/0029-compose-field.ts` | `compose-field-migration.test.ts` | 8 · 2 | 판 3 이 하나도 안 남는다 — 페이지 · 레이아웃 · 스냅샷 문서 · 두 모듈 표(옛 필드 prop · 값 칸 없는 필드) ⟶ AssertionError: expected { pages: +0, layouts: +0, …(2) } to deeply equal { pages: +0, layouts: +0, …(2) }<br>판 4 페이지 · 레이아웃 · 두 모듈 표 · 스냅샷(판 2 · 3 · 4 문서와 레이아웃) ⟶ AssertionError: expected 3 to be 4 // Object.is equality |
| M4 0029 라디오 변형 걷음 | `apps/api/src/db/migrations/0029-compose-field.ts` | `compose-field-migration.test.ts` | 8 · 2 | 페이지 — control 마다 표대로 조각 · 노드 수 · 옛 id · 번호 · 별칭 · 보임 · 판 4 검증을 지난다 ⟶ AssertionError: expected [ { type: 'RadioGroup' } ] to deeply equal [ { type: 'RadioGroup', …(1) } ]<br>판 4 페이지 · 레이아웃 · 두 모듈 표 · 스냅샷(판 2 · 3 · 4 문서와 레이아웃) ⟶ AssertionError: expected [ { type: 'RadioGroup' } ] to deeply equal [ { type: 'RadioGroup', …(1) } ] |
| M5 0029 안내 문구를 가리지 않고 옮김 | `apps/api/src/db/migrations/0029-compose-field.ts` | `compose-field-migration.test.ts` | 8 · 2 | 페이지 — control 마다 표대로 조각 · 노드 수 · 옛 id · 번호 · 별칭 · 보임 · 판 4 검증을 지난다 ⟶ AssertionError: expected [ …(3) ] to deeply equal []<br>판 4 페이지 · 레이아웃 · 두 모듈 표 · 스냅샷(판 2 · 3 · 4 문서와 레이아웃) ⟶ AssertionError: expected [ …(3) ] to deeply equal [] |
| K1 하나 고르는 타입으로 갈 때 고른 것 그대로 | `apps/web/src/edit/change-kind.ts` | `change-kind.test.ts` | 7 · 1 | 여럿 고른 체크 묶음 → 하나만 고르는 타입이면 고른 것은 첫째만 남는다(항목은 다 옮긴다) ⟶ AssertionError: expected {} to deeply equal { options: [ { label: '월' }, …(2) ] } |
| K2 변형을 안 걷음 | `apps/web/src/edit/change-kind.ts` | `change-kind.test.ts` | 7 · 1 | 노드 봉투(id · 번호 · 별칭 · 보임 · 상호작용 · 몫)는 그대로 · 변형은 걷는다 ⟶ AssertionError: expected { id: 'n_p', type: 'Select', …(6) } to deeply equal { id: 'n_p', type: 'Select', …(5) } |
| W1 하나 고르기가 다른 고름을 안 걷음 | `apps/web/src/panels/controls/list-control.tsx` | `option-list.test.tsx` | 8 · 1 | 하나만 고르는 선택지 — 라디오 · 고르면 다른 항목의 고름을 같은 편집에서 걷는다 ⟶ AssertionError: expected [ { op: 'replace', …(2) } ] to deeply equal [ { op: 'replace', …(2) } ] |
| W2 마지막 선택지도 지움 | `apps/web/src/panels/controls/list-control.tsx` | `option-list.test.tsx` | 8 · 1 | 하나뿐인 선택지는 못 지운다 ⟶ AssertionError: expected false to be true // Object.is equality |
| W3 상한에서도 더함 | `apps/web/src/panels/controls/list-control.tsx` | `option-list.test.tsx` | 8 · 1 | 상한(30)에 찬 선택지는 «항목 추가» 가 꺼진다 ⟶ AssertionError: expected false to be true // Object.is equality |
| W4 옮기기가 초안을 안 실음 | `apps/web/src/panels/controls/list-control.tsx` | `option-list.test.tsx` | 8 · 1 | 고치던 칸의 글은 옮기기에 실려 나간다 — 칸을 안 떠나고 단추를 눌러도 잃지 않는다 ⟶ AssertionError: expected [ { op: 'replace', …(2) } ] to deeply equal [ { op: 'replace', …(2) } ] |
| W5 풀기가 안 걷음 | `apps/web/src/panels/controls/list-control.tsx` | `option-list.test.tsx` | 8 · 1 | «고른 것 풀기» — 전부 걷는다 · 고른 것이 없으면 꺼진다 ⟶ AssertionError: expected [ { op: 'replace', …(2) } ] to deeply equal [ { op: 'replace', …(2) } ] |
| W6 옮기기 · 지우기 단추가 잠금에 안 꺼짐 | `apps/web/src/panels/controls/list-control.tsx` | `props-lock.test.tsx` | 23 · 2 | 위젯 여덟이 종류마다 꺼진다 — 잠긴 노드 자신을 골라 둔 판 ⟶ AssertionError: stringList이 꺼져야 한다: expected [ true, true, true, false, true ] to deeply equal [ true, true, true, true, true ]<br>목록 위젯은 칸뿐 아니라 추가·삭제 버튼도 꺼진다 — 그 둘은 즉시 커밋이다 ⟶ AssertionError: expected [ true, true, false, true ] to deeply equal [ true, true, true, true ] |
| W7 종류 바꾸기가 모든 줄에 | `apps/web/src/panels/structure-tree.tsx` | `change-kind.test.tsx` | 8 · 1 | 입력 조각 줄에만 선다 — 사이 글자 · 필드 · 뿌리 줄에는 없다 ⟶ AssertionError: Affix: expected <button type="button" …(6)>…(1)</button> to be null |
| W8 종류 바꾸기의 보내기 전 잠금 물음 걷음 | `apps/web/src/panels/structure-toolbar.tsx` | `change-kind.test.tsx` | 8 · 1 | 상자를 연 뒤 남이 그 조각을 잡으면 단추를 눌러도 편집이 안 나간다 — 이유를 하단 바에 말한다 ⟶ AssertionError: expected [ [ { op: 'replace', …(2) }, …(1) ] ] to deeply equal [] |
| W9 종류 바꾸기 끔이 잠금을 안 봄 | `apps/web/src/panels/structure-toolbar.tsx` | `change-kind.test.tsx` | 8 · 1 | 고른 조각을 남이 잡으면 항목이 꺼지고 잡은 사람의 이름을 말한다 ⟶ AssertionError: the given combination of arguments (null and string) is invalid for this assertion. You can use an array, a map, an object, a set, a string, or  |
| W10 llms 배열 한도 안 적음 | `apps/web/config/llms-txt.ts` | `llms-txt.test.ts` | 2 · 1 | public/llms.txt 가 정의에서 지은 글과 같다 ⟶ Error: Snapshot `public/llms.txt 가 정의에서 지은 글과 같다 1` mismatched |
| B1 새 노드가 Input 씨앗을 안 심음 | `apps/web/src/edit/create-node.ts` | `vitest.browser.config.ts` · `compose-input.test.ts` | 1 · 1 | 넣기 입구 넷(팔레트 · 구역 줄 · 끌어 놓기 · 붙여넣기)이 모두 «라벨 + 입력 하나» 를 같은 꼴로 세운다 ⟶ AssertionError: expected [ { props: null, pieces: [] }, …(3) ] to deeply equal [ { props: null, …(1) }, …(3) ] |
| B2 종류 바꾸기가 prop 을 안 옮김 | `apps/web/src/edit/change-kind.ts` | `vitest.browser.config.ts` · `compose-input.test.ts` | 1 · 1 | «종류 바꾸기…» → 날짜 — 서버에서 같은 id 의 DateInput · Cmd+Z 가 옛 Input 으로 돌린다 ⟶ AssertionError: expected { id: 'n_input00001', …(1) } to deeply equal { id: 'n_input00001', …(2) } |
| B3 리베이스가 얹은 문서를 버림 | `apps/web/src/store/anchored-ops.ts` | `vitest.browser.config.ts` · `compose-input.test.ts` | 1 · 1 | 남의 안내 문구 고침이 닿기 전에 셀렉트로 바꿔도 끝에 화면 = 서버(타입 · 캔버스의 안내 글) ⟶ AssertionError: expected [ 'Input', '남의 안내' ] to deeply equal [ 'Select', '옛 안내' ] |
| B4a 남이 잡은 노드도 골라짐 | `apps/web/src/store/editor-store.ts` | `vitest.browser.config.ts` · `compose-input.test.ts` | 1 · 0 | — |
| B4b 종류 바꾸기가 늘 꺼짐 | `apps/web/src/panels/structure-toolbar.tsx` | `vitest.browser.config.ts` · `compose-input.test.ts` | 1 · 1 | 남이 고른 조각은 줄 `…` 가 안 서 «종류 바꾸기…» 에 닿을 길이 없다 — 눌러도 안 골라진다 ⟶ AssertionError: expected 'true' to be null // Object.is equality |
| U1 칩도 바꿀 종류 | `apps/web/src/edit/change-kind.ts` | `change-kind.test.ts` | 7 · 1 | 입력 조각 일곱은 나머지 여섯으로 · 사이 글자 · 칩 · 단추 · 필드는 없다 ⟶ AssertionError: expected [ 'Input', 'TextArea', 'Select', …(5) ] to have a length of 7 but got 8 |
| U2 규격을 못 지나는 prop 도 옮김 | `apps/web/src/edit/change-kind.ts` | `change-kind.test.ts` | 8 · 1 | 같은 이름이어도 새 규격을 못 지나는 값은 그것만 버리고 나머지는 옮긴다 ⟶ AssertionError: expected {} to deeply equal { placeholder: '입력' } |
| U3 옮길 것이 없어도 props 를 안 걷음 | `apps/web/src/edit/change-kind.ts` | `change-kind.test.ts` | 7 · 1 | 옮길 것이 없으면 props 를 걷고 · props 키가 없던 노드에서는 타입만 바꾼다 ⟶ AssertionError: expected [ { op: 'replace', …(2) } ] to deeply equal [ { op: 'replace', …(2) }, …(1) ] |
| U4 같은 종류도 op | `apps/web/src/edit/change-kind.ts` | `change-kind.test.ts` | 7 · 1 | 입력 조각이 아니거나 · 같은 종류거나 · 없는 노드면 null ⟶ AssertionError: expected [ { op: 'replace', …(2) } ] to be null |
| U5 props 를 늘 add | `apps/web/src/edit/change-kind.ts` | `change-kind.test.ts` | 7 · 1 | Input → Select — 타입만 바꾸고 같은 이름의 prop(안내 · 비활성 · 오류 · 폭)을 옮기고 없는 prop(k ⟶ AssertionError: expected [ { op: 'replace', …(2) }, …(1) ] to deeply equal [ { op: 'replace', …(2) }, …(1) ] |
| P1 고른 뒤 상자가 안 닫힘 | `apps/web/src/panels/structure-tree.tsx` | `change-kind.test.tsx` | 8 · 1 | 상자의 «셀렉트» 하나로 편집 하나 — 같은 id · 번호 · 별칭, 안내 · 오류는 옮기고 kind 는 버린다 · 상자가 닫 ⟶ AssertionError: expected <dialog …(4)>…(2)</dialog> to be null |
| P2 되돌리기 스택에 안 쌓음 | `apps/web/src/store/editor-store.ts` | `change-kind.test.tsx` | 8 · 1 | 되돌리기(Cmd+Z)가 옛 종류 · props 로 돌린다 — 서버 문서 = 바꾸기 전 ⟶ AssertionError: expected [ [ { op: 'replace', …(2) }, …(1) ] ] to have a length of 2 but got 1 |
| P3 취소가 첫 종류를 고름 | `apps/web/src/panels/change-kind-dialog.tsx` | `change-kind.test.tsx` | 8 · 1 | 취소는 편집을 안 낸다 ⟶ AssertionError: expected [ [ { op: 'replace', …(2) }, …(1) ] ] to deeply equal [] |
| V1 viewer 줄에도 편집 행동 | `apps/web/src/panels/structure-tree.tsx` | `change-kind.test.tsx` | 8 · 1 | viewer — 줄 `…` 에 «종류 바꾸기…» 가 없다(모듈로 저장만) ⟶ AssertionError: expected <button type="button" …(3)>…(1)</button> to be null |
| O1 여럿 고르기가 다른 고름을 걷음 | `apps/web/src/panels/controls/list-control.tsx` | `option-list.test.tsx` | 8 · 1 | 여럿 고르는 선택지 — 체크 · 그 항목만 뒤집는다 ⟶ AssertionError: expected [ { op: 'replace', …(2) } ] to deeply equal [ { op: 'replace', …(2) } ] |
| O2 맨 위 «위로» 가 켜짐 | `apps/web/src/panels/controls/list-control.tsx` | `option-list.test.tsx` | 8 · 1 | 옮기기 — 고른 것이 항목을 따라간다 · 맨 위의 «위로» · 맨 아래의 «아래로» 는 꺼진다 ⟶ AssertionError: expected false to be true // Object.is equality |
| O3 옮기기가 선택지에만 | `apps/web/src/panels/controls/list-control.tsx` | `option-list.test.tsx` | 8 · 2 | 컬럼 «2번째 아래로» — 이웃과 자리를 바꾼 배열 하나 ⟶ TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "2번째 아래로"<br>고치던 칸의 글은 옮기기에 실려 나간다 — 칸을 안 떠나고 단추를 눌러도 잃지 않는다 ⟶ TestingLibraryElementError: Unable to find an accessible element with the role "button" and name "1번째 아래로" |
| A1 하나 고르는 선택지의 하한 걷음 | `packages/schema/src/component/catalog/input.ts` | `compose-input-boundary.test.ts` | 4 · 1 | 빈 배열 · 31 개는 422 ⟶ AssertionError: expected 200 to be 422 // Object.is equality |
| C1 0029 가 필드 id 를 새로 지음 | `apps/api/src/db/migrations/0029-compose-field.ts` | `compose-field-migration.test.ts` | 8 · 5 | 페이지 — control 마다 표대로 조각 · 노드 수 · 옛 id · 번호 · 별칭 · 보임 · 판 4 검증을 지난다 ⟶ AssertionError: expected [ 'n_root', 'n_sf', 'n_b1', …(3) ] to deeply equal [ 'n_root', 'n_sf', 'n_text', …(13) ]<br>setProp — 옮긴 prop 은 그 prop 을 가진 첫 조각으로 · control 과 남은 prop 은 그대로 ⟶ TypeError: Cannot read properties of undefined (reading 'node')<br>코멘트가 가리키는 노드가 남는다 — id 가 그대로라 코멘트가 안 끊긴다 ⟶ TypeError: Cannot read properties of undefined (reading 'node')<br>판 4 페이지 · 레이아웃 · 두 모듈 표 · 스냅샷(판 2 · 3 · 4 문서와 레이아웃) ⟶ TypeError: Cannot read properties of undefined (reading 'node')<br>한 번 더 돌려도 그대로다 — 판 4 문서 · 값 칸이 든 필드 ⟶ AssertionError: expected [ { id: 'n_413977ee853d', …(3) } ] to deeply equal [ { id: 'n_e165a7ab91b9', …(3) } ] |
| I1 0029 가 값 칸이 든 필드에도 조각을 더함 | `apps/api/src/db/migrations/0029-compose-field.ts` | `compose-field-migration.test.ts` | 8 · 1 | 한 번 더 돌려도 그대로다 — 판 4 문서 · 값 칸이 든 필드 ⟶ AssertionError: expected [ { id: 'x', type: 'Field', …(2) } ] to deeply equal [ { id: 'x', type: 'Field', …(2) } ] |
| D1 0029 down 이 행이 있어도 내려감 | `apps/api/src/db/migrations/0029-compose-field.ts` | `compose-field-migration.test.ts` | 8 · 1 | down — 행이 있으면 «백업에서 되돌린다»로 거절하고 아무것도 안 바꾼다 ⟶ AssertionError: the given combination of arguments (undefined and string) is invalid for this assertion. You can use an array, a map, an object, a set, a string |
| D2 0029 down 이 비어도 거절 | `apps/api/src/db/migrations/0029-compose-field.ts` | `compose-field-migration.test.ts` | 0 · 0 | — |
| B4c 남이 잡은 줄에도 행동 | `apps/web/src/panels/structure-tree.tsx` | `vitest.browser.config.ts` · `compose-input.test.ts` | 1 · 1 | 남이 고른 조각은 줄 `…` 가 안 서 «종류 바꾸기…» 에 닿을 길이 없다 — 눌러도 안 골라진다 ⟶ AssertionError: expected 1 to be +0 // Object.is equality |

53 변조 — 51 이 값으로 죽었다(U2 는 케이스를 더한 뒤 — 아래). B4a 는 살았고(다른 겹이 막는다 — 아래 · B4c 가 그 겹을 잰다) D2 는 판이 안 섰다.

- **U2 는 처음에 살았다** — 같은 이름 prop 은 일곱 타입 모두 규격이 같아(전부 `string` · 같은 `size` enum) 기존 케이스가 «규격을 못 지나는 값» 을 안 실었다. 저장된 문서의 규격 밖 값(`value: 7`)을 싣는 케이스 «같은 이름이어도 새 규격을 못 지나는 값은 그것만 버리고 …» 를 더해(`bd184185`) 다시 돌린 값이다.
- **D2 는 안 잰다** — api 프로젝트의 global-setup 이 테스트 DB 마이그레이션을 내렸다 올리는 길에 `0029` 의 `down` 을 지나, «비어도 거절» 변조에서 판 세우기가 죽어 실행 0 이다. «비면 내려간다» 케이스는 `0028` 의 같은 케이스와 같은 꼴이다.
- **B4a(스토어의 고르기 가드 뗌)는 살았다** — 남이 잡은 줄은 줄 단추가 꺼지고(`blockedOf`) 줄 행동의 `open` 도 `blockedOf` 를 본다(`structure-tree.tsx` 의 `StructureNode`). 그 `open` 가드를 뗀 B4c 가 값(줄 `…` 1 개)으로 죽인다 — 그 판의 «안 골라진다» 반쪽은 두 겹이 막는다.
- **함께 죽는 것** — C1(필드 id 를 새로)은 다섯 케이스를 함께 죽인다. 코멘트 케이스는 혼자 죽는 변조가 없다 — id 축은 «페이지 — control 마다 …» 가 소유한다(코멘트 케이스는 그 id 가 코멘트 행에서 이어진다는 것을 잰다). O3(옮기기 단추를 선택지에만)은 «컬럼 2번째 아래로» 와 «고치던 칸의 글은 …» 을 함께 죽인다 — 뒤의 것은 W4 가 혼자 죽인다. W6 은 잠금 판 둘을 함께 죽인다(둘 다 «목록 위젯 버튼이 꺼진다» 를 잰다).
- **실패 값이 단언의 인자 오류로 보이는 둘** — W9 의 `rowReason(…)` 이 `null` 이고 D1 의 `error?.message` 가 `undefined` 다. 둘 다 재려던 값(이유 없음 · 거절 없음)이 `toContain` 에 들어간 것이다.
- **게이트 1차 뒤 고친 것** — 고정 폭 `min(<n>em, 100%)`(SDK) 의 고치기 전 값은 게이트 1차 `shots` «넘치는 칸 …» 의 빨강(`Input//in3` 넘침)이다. 기본테마 쪽 같은 규칙은 `24em` 으로 되돌린 변조에도 `shots` 가 초록이었다(「남은 것」 3). `canvas-drop` · `theme-prop-marks` 는 픽스처 · 기대값만 고쳤다 — 재는 장치는 그대로다(`theme-prop-marks` 의 묶음 이름은 R4 «Field 라벨 이름 걷음» 과 같은 축).
- **성질 잠금(혼자 죽는 새 장치가 없는 것)** — api «editor 이상은 200 …»(종류 바꾸기 op 을 서버가 받는다) · «viewer 는 403 …»(기존 역할 가드) · jsdom «뷰 모드 — 구조 트리째 없고 …»(기존 뷰 모드). 셋 다 이 트랙이 세운 장치가 아니라 기존 가드가 새 op · 새 위젯에도 서는지를 잰다. 뷰 모드에서 구조 트리를 빼는 축은 `apps/web/test/routes/viewer-readonly-harness.tsx` 를 쓰는 훑기가 소유한다.


## 게이트

전량 넷(README 「트랙 게이트」 — 이 트랙은 `packages/*` · `system-themes/*` · 두 앱에 걸친다) + `pnpm fmt` · `pnpm lint`. 스크립트 하나로 `nohup nice -n 10 caffeinate -i` · 단계마다 `rc=$?` · `pnpm test --maxWorkers=25%` · 띄우기 전 `gate-slots` 의 파일 수 0 → 1(1차) · 1 → 2(2차 — 다른 트랙 하나). node v24.21.0.

| 판 | HEAD | fmt · lint · typecheck · build | `pnpm test` | `test:build:serial` | `test:browser` |
| --- | --- | --- | --- | --- | --- |
| 1차 04:44 – 05:07 | `bd184185` | rc 0 · 0 · 0 · 0(fmt 뒤 바뀐 파일 0) | 516 파일 · 8326 중 통과 8325 · 실패 0 · 건너뜀 1 | 17 파일 · 158 중 통과 156 · **실패 1** · 건너뜀 1 | 86 파일 · 515 중 통과 512 · **실패 2** · 건너뜀 1 |
| **2차 05:15 – 05:41** | **`6688e0a2`** | rc 0 · 0 · 0 · 0(바뀐 파일 0) | **516 파일 · 8326 중 통과 8325 · 실패 0 · 건너뜀 1** | **17 파일 · 158 중 통과 157 · 실패 0 · 건너뜀 1** | **86 파일 · 515 중 통과 514 · 실패 0 · 건너뜀 1** |

1차의 빨강 셋과 고친 것(`6688e0a2`):

| 케이스 | 실패 값 | 까닭 · 고침 |
| --- | --- | --- |
| `packages/theme-kit/build-test/shots.test.ts` «넘치는 칸 · 던지는 뷰를 …» | 넘침 목록에 `Card/…` 밖의 `["Input//in3","div[data-wb-component=Input]"]` | `size: long`(24em)이 390 창의 칸을 넘었다 — 고정 폭을 `min(<n>em, 100%)` 로(결함 · 고침). 실패 문장에 넘친 항목을 싣게 했다 |
| `apps/web/build-test/canvas-drop.test.ts` «그리드 칸의 오른쪽 · 왼쪽 … 검색폼 필드 줄도 가로다» | `beforeF1: ['inside:null']`(기대 `['before:x']`) | 픽스처 필드에 값 칸이 비어, 자식을 받게 된 `Field` 의 왼끝 8% 가 «안에 넣기» 로 읽혔다 — 픽스처 필드에 값 칸 `Input` 을 싣는다(새 `Field` 의 실제 꼴) |
| `apps/web/build-test/theme-prop-marks.test.ts` «필드는 이름 붙은 묶음 …» | `groups: 0` | 묶음 이름이 `'접근성 이름 *'`(필수 별이 이름에 든다) — 이름 목록을 값으로 견준다 |

건너뜀 셋은 이 트랙과 무관한 전제 판이다 — `log-destination` «Linux `/dev/full`»(macOS) · `template` «저장소 밖에서 설치하고 빌드한다(`WB_TEMPLATE_INSTALL=1`)» · `layout-weight` «스크린숏 …»(스크린숏 환경 변수).

잠듦: `pmset -g log` 의 마지막 `Sleep` 이 2026-10-23 20:47 — 두 판(10-24 04:44 – 05:41)과 안 겹친다. 끝에 이 워크트리 경로의 vitest · vite · tsx · chrome 0. 변조 묶음도 그 잠듦 뒤에 돌았다.

`EDITOR_STACK_BUNDLE=build pnpm test:browser` 는 안 돌렸다 — 「남은 것」 4.

## 남은 것

1. **종류 바꾸기가 그 사이 남이 고친 prop 을 덮는다** — op 이 바꾸기를 지은 판의 props 를 통째로 싣는다(「결정과 이유」). 리베이스 때 얹을 문서의 props 로 `carriedProps` 를 다시 지으면 남의 고침이 살아남는다 — 리베이스가 op 의 값을 다시 짓는 장치가 지금 없어(`store/anchored-ops.ts` 는 값을 그대로 옮긴다) 새 장치다. 낮은 무게(덮인 것은 안내 문구 한 칸 · 화면 = 서버).
2. 모듈 넣기 입구는 `initial` 을 안 타 실브라우저 판에서 뺐다(저장된 값 칸째 들어간다).
3. **기본테마의 고정 폭 규칙은 재는 케이스가 없다** — 기본테마의 글자 크기에서 24em 이 390 창의 갤러리 칸 안에 들어, `min(24em, 100%)` 를 `24em` 으로 되돌린 변조에도 `shots` 가 초록이었다(넘침 0). 좁은 칸(열이 많은 `Grid` · 검색폼)에서 넘침을 막는 방어 규칙이다. SDK 쪽은 `shots` 픽스처가 잰다(게이트 1차의 빨강이 고치기 전 값).
4. **`EDITOR_STACK_BUNDLE=build pnpm test:browser` 는 안 돌렸다** — 이 트랙의 웹 소스 변경에 이펙트 · 마운트 순서 변경이 없다(`git diff 96efb495..HEAD -- apps/web/src` 에 새 `useEffect` · `useLayoutEffect` 0).

## 지침

| 무엇이 틀렸나(비었나) | 어느 문서 어느 절 | 넣을 문장 |
| --- | --- | --- |
| 마이그레이션 `down` 을 바꾸는 변조는 api 프로젝트로 못 잰다 — global-setup 이 판을 세우며 `migrateToNone` 으로 모든 `down` 을 지나(`apps/api/test/global-setup.ts`), «비어도 거절» 변조가 판 세우기를 죽여 실행 0 이 됐다(D2). 지침은 «실행마다 global-setup 이 마이그레이션을 내렸다 올린다» 를 겹친 실행의 문제로만 적는다 | `.ruler/wirebound/` 의 「검증 — wirebound」 소스 · 「「통과」를 보기 전에 몇 개가 실행됐는지 확인한다 — 덧붙임」 | «**마이그레이션의 `down` 을 바꾸는 변조는 api 프로젝트로 판이 안 선다** — global-setup 이 `migrateToNone` 으로 모든 `down` 을 지나(`apps/api/test/global-setup.ts`) 빈 DB 에서도 거절하게 바꾼 변조는 실행 0 으로 끝난다. 그 `down` 의 «비면 내려간다» 는 변조 표에 «안 잼» 으로 적는다.» |
| 실브라우저 파일 하나를 `pnpm vitest run <경로>` 로 돌린 변조 묶음이 다섯 다 실행 0 으로 끝났다 — README 「트랙 게이트」 는 `-c vitest.browser.config.ts` 를 적고 있었다(지침 결함이 아니라 읽기 누락). 변조 러너가 실행 0 을 «안 돎» 이 아니라 «실행 0 · 죽음 0» 으로 적어 한 줄에서 갈렸다 | 없음(이미 적혀 있다) | — |

