# FX-CI 보고 — 조합 입력 리뷰 대응 — 2026-10-24

브리프: 코디네이터 `brief-fx-ci.md` · 공통 `common-w8.md`. 워크트리 `feat-compose-input` · 브랜치 `feat/compose-input` · 기준 `f0063067`(리뷰 보고 `2026-10-24-rv-ci-report.md`). node v24.21.0 · Postgres 5501(`pnpm db port postgres 5432` → `0.0.0.0:5501`). 이 워크트리에 붙은 터미널은 이 워커 하나(`orca terminal list`).

## 워크트리 뿌리의 `.build/`

`CACHEDIR.TAG`(«created by (Swift Package Manager)») · `.buildSystem_debug`(`swiftbuild`) 두 파일 — 만든 때 10-24 03:24:18 로 기준 `96efb495`(03:43) · 구현 · 리뷰보다 앞이다. 저장소에 Swift 가 없고(`Package.swift` 없음) 이 저장소의 도구가 만든 것이 아니다 — 그 시각 이 디렉터리에서 돈 Swift 도구의 찌꺼기다. 리뷰 탐침의 것도 아니고 도구가 늘 만드는 것도 아니어서 지웠다(`rm -rf .build` — 추적 파일 아님). `.gitignore` 에는 안 넣었다.

## 바꾼 것

### 1. `0029` — 옛 필드를 바꾸던 `setProp` 을 조각마다 (리뷰 중간 1)

- `apps/api/src/db/migrations/0029-compose-field.ts` — `placeholder` · `disabled` · `invalid` 를 바꾸던 액션을 그 prop 을 가진 조각(`HAS`)마다 하나씩, 조각 차례로 늘린다(`setPropActions` — `flatMap`). 그 prop 을 가진 조각이 없으면 그대로(`checkbox` · `radio` 의 `placeholder` · `invalid` — 경고 `invalid-interaction-prop`).
- 바뀌는 판: `dateRange` 의 `disabled` · `invalid` · `placeholder`(두 날짜 칸 — 사이 글자는 건너뜀) · `file` 의 `disabled`(입력 · 단추). `file` 의 `invalid` · `placeholder` 는 입력 하나(단추에 그 prop 이 없다). 나머지 `control` 은 조각이 하나라 그대로다.
- **`dateRange.placeholder` 도 두 칸으로 늘린다** — 브리프는 «`disabled` · `invalid`» 를 들었으나 단언 «같은 prop 을 가진 조각 수 = 액션 수» 는 prop 을 가리지 않는다. 물음 파일 1 에 적었고 코디네이터 답이 «기본값대로(prop 을 가리지 않고)» 였다. 옛 필드의 안내 문구를 바꾸던 액션은 옛 화면에서 그 필드의 칸 전부를 바꿨다.
- 케이스(`apps/api/test/compose-field-migration.test.ts`):
  - 새 «넓힌 표본 — 옛 필드를 바꾸던 setProp 은 그 prop 을 가진 조각마다 하나 · …» — 리뷰 「1」 의 표본(`control` 11 × 안내 × 비활성 × 오류 × 놓인 자리 11 = 필드 968) · 단추 하나가 필드마다 prop 하나 + `dateRange` · `file` 마다 `disabled` · `invalid` · `placeholder` 를 더 바꾼다. 기대 액션은 **판 4 카탈로그 규격(`propSchema`)에서** 짓는다 — 마이그레이션의 얼린 표 `HAS` 와 따로 선 오라클. 판 4 검증 오류 0 · 옛 id 차례 · 봉투(번호 · 별칭 · 보임 · 몫 · 변형 · 상호작용) 그대로 · 입력을 안 고침 · `liftDocument` 두 번째 `null` · `liftNodes` 두 번 같음. 카나리아: 덧붙인 액션의 퍼짐 수(`dateRange` 셋 2 · `file.disabled` 2 · `file.invalid` 1).
  - 새 «넓힌 표본 — 실제 DB 에서 up 을 한 번 더 돌려도 다섯 표의 글자가 같다» — 그 표본을 페이지 하나로 `0028` 판 DB 에 넣고 `0029` 뒤 `migration.up` 을 손으로 한 번 더.
  - 바꾼 «setProp — 옮긴 prop 은 그 prop 을 가진 조각마다 하나씩 …»(옛 «첫 조각으로») — `n_range` 의 `invalid` 가 두 날짜 칸으로.
  - «판 3 이 하나도 안 남는다» 의 표 · 필드 수 카나리아에 넓힌 표본을 더했다(행 7 · 필드 +968).
- 정본(`docs/superpowers/specs/2026-08-03-wirebound-design.md` 「문서 판 4」)과 `apps/api/README.md` 의 «첫 조각» 문장을 «조각마다 하나씩» 으로.

잰 값(고치기 전 · 뒤 — 같은 케이스 파일):

| 판 | 실행 · 실패 | 넓힌 표본의 액션 수 |
| --- | --- | --- |
| 고치기 전(케이스만 더함) | 10 · 1 | 1 496(기대 1 906) |
| 고친 뒤 | 10 · 0 | 1 906 |

### 2. 기본테마 `DateInput` 이 제 기본 안내를 두 줄로 꺾는다 (리뷰 중간 2)

- **셈**(Chrome · 기본테마 토큰의 `system-ui …` 14px — 이 기계에서 잰 글 폭): «YYYY-MM-DD» 106.7px(7.6em) · «00:00» 36.5px · 표지 ▦ 16.0px · ◷ 9.6px · 셀렉트 안내 «== 선택 ==» 76.1px. 글 칸 = 칸 폭 − 안쪽 여백 24 − 테두리 2 − 틈 8 − 표지.

  | 조각 | 고치기 전 폭 → 글 칸 | 고친 뒤 폭 → 글 칸 | 기본 안내 |
  | --- | --- | --- | --- |
  | `DateInput` | 9.5em 133px → 83px | `min(12em, 100%)` 168px → 118px | 106.7px |
  | `TimeInput` | 9.5em 133px → 89px | 그대로(`min(9.5em, 100%)`) | 36.5px |
  | `Select` `medium`(기본) | 12em 168px → 약 124px(꺾쇠 ▾ · 그 앞 여백 8 을 뺌) | 그대로 | 76.1px |
  | `Select` `short` | 6em 84px → 약 41px | 그대로 — 「남은 것」 | 76.1px |

  `TimeInput` 은 폭을 안 바꿨고 `DateInput` 과 같은 «칸보다 넓지 않다»(`min(…, 100%)`)만 얹었다(갤러리 · 좁은 칸에서 넘치지 않게 — 기본테마의 `size` 폭과 같은 꼴).
- `system-themes/admin/src/theme.css` — 날짜 · 시간 규칙을 갈라 `DateInput` 12em · `TimeInput` 9.5em. 기본테마 판 1.4.0 → **1.4.1**(`package.json` · `manifest.ts` · `admin.test.ts`) · `checksums.json` 에 새 줄 `system-admin@1.4.1`(1.4.0 줄은 그대로 — 배포 안 한 판도 새 줄을 더하는 설계 「구현을 나누는 법」 의 관례).
- **잠금 — `wb-theme shots` 의 «꺾임»**(`packages/theme-kit/src/shots.ts`): 한 줄 입력 조각(`ONE_LINE_PIECES` — `Input` · `Select` · `DateInput` · `TimeInput`)의 글자 노드마다 `Range.getClientRects()` 의 서로 다른 `top` 수를 세어 2 이상이면 `report.json` 의 `wrapped` 에 적고 종료 코드 1(`✗ <폭>px 꺾임 <칸>: <조각> "<글>" (<n>줄)`). 지금 재는 «칸을 넘는가»(`overflow`)와 다른 셈이다 — 칸 안에서 꺾인 글은 넘치지 않는다.
- 케이스(`packages/theme-kit/build-test/shots.test.ts`):
  - 바꾼 «system-admin 을 두 폭으로 찍는다 …» — 폭마다 `wrapped` = `[]` · 종료 코드가 넘침 · 꺾임을 함께 센다.
  - 새 «한 줄 입력 조각의 글이 칸 안에서 꺾이면 report.json 에 적고 1 로 끝난다 …» — 자가 0 만 내지 않는지의 카나리아. 픽스처 테마에 `DateInput { width: 3em }` 을 얹어 `DateInput//date` 의 «YYYY-MM-DD» 가 `wrapped` 에 들고 넘침은 0 · 종료 1.

잰 값(`pnpm vitest run --project build packages/theme-kit/build-test/shots.test.ts`):

| 판 | 실행 · 실패 | `wrapped`(390) |
| --- | --- | --- |
| 고치기 전(셈만 더함) | 5 · 1 | `Field//field2` · `DateInput//date` 의 «YYYY-MM-DD» 2 줄 — 케이스가 390 에서 멈춰 1280 은 이 판에서 안 읽었다(리뷰 「6」 은 1280 도 2 줄) |
| 고친 뒤 | 5 · 0 | 0(390 · 1280) |

### 3. 입력 조각이 접근 이름에서 필드 라벨 · 필수를 잃었다 (리뷰 중간 3)

- **길 — 렌더러가 필드 이름을 값 칸 자식 뷰에 넘긴다**(리뷰가 적은 길). SDK `ViewProps` 에 선택 칸 `field?: ViewField`(`{ name, required }`)를 더하고, 렌더러(`packages/renderer/src/render.tsx` 의 `fieldNames`)가 `Field` 몸통의 **입력 조각**(`VALUE_PIECES` — `Input` · `TextArea` · `Select` · `DateInput` · `TimeInput` · `CheckboxGroup` · `RadioGroup`)에만 싣는다. 이름은 그 판에 서는 입력 조각이 하나면 라벨, 여럿이면 «라벨 + 별칭», 별칭이 없으면 «라벨 + 차례(1부터)». 단추 · 사이 글자 · 칩은 안 받는다(제 글이 이름). 라벨이 비면 안 싣는다.
- **다른 길(React 문맥 — `FieldView` 가 공급하고 조각 뷰가 읽음)을 안 고른 까닭:** 테마의 `FieldView` 가 그 공급자를 그려야만 서고(스타터 템플릿 사본 · 남의 테마), 라벨 요소 id 를 가리키는 `aria-labelledby` 는 테마의 `FieldView` 가 그 id 를 그리는지에 기댄다. 글로 넘기면 어느 `FieldView` 아래서도 같은 이름이 선다.
- SDK 기본 뷰(`packages/theme-sdk/src/default-views/input.tsx` 의 `pieceAria`) — 받은 이름을 `aria-label` 로, 필수면 `aria-required="true"`(그 속성을 받는 역할만 — `textbox` · `spinbutton` · `combobox` · `radiogroup`. 체크 묶음 `group` 은 이름만). 필드 밖 조각은 지금 그대로(안내 문구 · 종류 이름). 라디오 · 체크 묶음은 필드 밖에서 이름이 없는 것도 그대로다.
- **캐시** — 필드 이름을 받는 조각은 노드 캐시를 지나친다(`renderNodeIn`). 이름이 부모(라벨 · 형제 수)에서 오고 조각 객체는 그대로라, 열쇠에 이름을 넣으면 라벨을 고칠 때마다 열쇠가 쌓인다. 조각은 잎이고 부모 `Field` 는 제 캐시를 쓴다 — 부모가 다시 그릴 때만 조각이 다시 그려진다. 누락 판정의 입력(`view-host.tsx` 의 `inputsKey`)에 `field` 를 더했다.
- **SDK 판은 안 올렸다(1.4.0 그대로)** — 1.4.0 은 이 브랜치에서 처음 서는 판이고(main 은 1.3.0) 칸이 선택이라 더하기만 한 계약이다. CI-B 가 그 위로 1.5.0 을 올린다(설계 「구현을 나누는 법」).
- **따르는가** — SDK 기본 뷰가 짓는다. 기본테마(`system-admin`)는 뷰를 안 내 SDK 기본 뷰로 선다. 스타터 템플릿은 `packTemplate` 이 SDK `default-views/*.tsx` 를 빌드 때 `src/views/` 로 옮기고 조각 아홉은 등록하지 않아(`template/src/index.tsx`) SDK 기본 뷰로 선다 — 템플릿 소스에는 고칠 사본이 없다.
- 케이스:
  - 새 실브라우저 판 `packages/theme-kit/build-test/field-a11y.test.ts` — 리뷰 「5」 의 표(필드 여섯)에 별칭 둔 시간 둘 · `[Input][단추]` · 여러 줄 · 필드 밖 입력을 더해, 기본테마(토큰 · SDK 기본 CSS · `theme.css`)와 SDK 기본 CSS 만 실은 판 두 갈래로 Chrome `Accessibility.getFullAXTree` 를 읽는다. 입력 조각 열하나의 (역할 · 이름 · 필수)를 견주고(트리의 노드 차례는 DOM 차례가 아니라 늘어놓고 견준다), 체크 묶음 `group` «요일» · 단추 «중복확인» 이 선다.
  - 새 jsdom 판 `packages/renderer/test/field-name.test.tsx` — 상태로 숨은 형제(그 판의 하나만 세어 «기간» · 펴면 «기간 1 · 2») · 라벨 고침(조각 객체 그대로 · 이름이 바뀜) · 빈 라벨 · 필드 안 카드 속 조각(필드 이름을 안 받음).

잰 값 — Chrome 접근성 트리(이 판의 표본 · 두 갈래 같은 값):

| 조각 | 고치기 전 | 고친 뒤 |
| --- | --- | --- |
| `이름`(필수) `Input` 안내 «이름을 입력» | `textbox` «이름을 입력» · required false | `textbox` «이름» · **true** |
| `나이` `Input number` | `spinbutton` «입력» | `spinbutton` «나이» |
| `기간`(필수) `DateInput` × 2 | `textbox` «YYYY-MM-DD» × 2 · false | «기간 1» · «기간 2» · **true** |
| `근무` `TimeInput` 별칭 «시작» · «끝» | «00:00» × 2 | «근무 시작» · «근무 끝» |
| `상태` `Select` | `combobox` «== 선택 ==» | «상태» |
| `여부`(필수) `RadioGroup` | `radiogroup` «» · false | «여부» · **true** |
| `아이디` `[Input][중복확인]` | `textbox` «입력» | «아이디»(단추는 «중복확인» 그대로) |
| `소개` `TextArea` | `textbox` «여러 줄 입력» | «소개» |
| 필드 밖 `Input` 안내 «필드 밖» | «필드 밖» | 그대로 |
