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

### 3′. 접근 이름으로 조각을 찾던 케이스 · 번들 = 화면

| 센 것 | 식 | 맞은 줄 | 갈래 |
| --- | --- | --- | --- |
| 조각의 옛 이름(«입력» · «날짜» · «시간» · «셀렉트» · «여러 줄 입력» · «이름을 입력» · «YYYY-MM-DD» · «00:00» · «== 선택 ==») · 입력 역할(`textbox` · `spinbutton` · `combobox` · `radiogroup`)로 찾는 줄 — 케이스 · `apps/web/build-test/*.ts` | `git grep -nE "name: ?['\"](입력\|날짜\|…)['\"]\|aria-label[^\n]{0,40}(입력\|…)\|role: ?['\"](textbox\|…)['\"]"`(새 `field-a11y` 뺌) | 6 | **조각이 아니다** — 종류 바꾸기 상자의 단추 «날짜» · «셀렉트»(`compose-input.test.ts` 219 · 262 · `change-kind.test.tsx` 187 · 206 · 238) · 테마 픽스처의 실제 `<input aria-label="실제 입력">`(`theme-fixtures.ts` 50) |
| 패키지 케이스의 `aria-label` · `aria-required` 단언 | `git grep -nE "aria-label\|aria-required" -- 'packages/*/test/*' 'system-themes/*/test/*'` | 10 | 필드 밖 조각(`default-view-props` 215 «이름» — 필드 없이 그린 `Input` 의 안내) · `Field` 뿌리(`group`)의 `aria-required` 없음(`prop-marks` 290 – 294 — 자식 없는 `Field` 라 그대로 참) · 그 밖은 셸 · 상태 |
| `getByRole('textbox' …)` 등 셸 입력을 이름으로 찾는 줄 | 첫 인구조사의 넓은 식 | 50 여 | 셸 UI(«별칭» · «몫» · «페이지 이름» …)다. 캔버스는 iframe 이라 셸 쿼리에 안 섞인다 |

값으로 잰 것: `pnpm vitest run --project unit`(조각 · 고침 뒤) 577 파일 · 2 428 중 통과 2 428 · 실패 0 — 번들 = 화면 DOM 패리티 `packages/exporter/test/parity.test.tsx` · 번들 바이트 기준 `bundle-stateless-bytes.test.ts` 가 든다(`views.css` 는 안 바뀌었다). `pnpm vitest run --project web` 204 파일 · 3 321 중 통과 3 321 · 실패 0.

## 혼자 죽는 변조 표

러너: `…/scratchpad/mut.py` — 백업(경로 전체 이름) · 찾는 글자 맞은 수 1 확인 · 그 케이스 파일만 · 바이트 비교 복원. 실행 수는 `통과 + 실패`.

| 변조 | 바꾼 곳 | 돌린 파일 | 실행 · 죽음 | 죽은 케이스 ⟶ 값 |
| --- | --- | --- | --- | --- |
| M1 첫 조각만(`pieces.slice(0, 1)`) | `apps/api/src/db/migrations/0029-compose-field.ts` | `compose-field-migration.test.ts` | 10 · 2 | «setProp — 옮긴 prop 은 그 prop 을 가진 조각마다 하나씩 …» ⟶ `expected [ { prop: 'placeholder', …(3) }, …(4) ] to deeply equal [ { type: 'setProp', …(3) }, …(5) ]`<br>«넓힌 표본 — 옛 필드를 바꾸던 setProp 은 …» ⟶ `expected [ …(1495) ] to deeply equal [ …(1905) ]` |
| M1b 안내 문구만 첫 칸 | 같은 파일 | 같은 파일 | 10 · 1 | «넓힌 표본 — 옛 필드를 바꾸던 setProp 은 …» ⟶ `expected [ …(1803) ] to deeply equal [ …(1905) ]` |
| M1c 값 칸 든 필드에도 조각을 더함(`length > 99`) | 같은 파일 | 같은 파일 | 10 · 3 | «넓힌 표본 — 실제 DB 에서 up 을 한 번 더 …» ⟶ `expected [ …(7) ] to deeply equal [ …(7) ]`<br>«한 번 더 돌려도 그대로다 …» ⟶ `expected [ { id: 'x', type: 'Field', …(2) } ] to deeply equal …`<br>«넓힌 표본 — 옛 필드를 바꾸던 setProp 은 …» ⟶ `expected [ { id: 'f0001', …(3) }, …(95) ] to deeply equal …`(`liftNodes` 두 번) |
| M2 옛 폭(`DateInput` 9.5em) | `system-themes/admin/src/theme.css` | `packages/theme-kit/build-test/shots.test.ts` | 5 · 1 | «system-admin 을 두 폭으로 찍는다 …» ⟶ `390px [{"item":"Field//field2",…"lines":2},{"item":"DateInput//date",…"lines":2}]: expected [ …(2) ] to deeply equal []` |
| M2b 꺾임 셈을 끔(`tops.size > 99`) | `packages/theme-kit/src/shots.ts` | 같은 파일 | 5 · 1 | «한 줄 입력 조각의 글이 칸 안에서 꺾이면 …» ⟶ 종료 코드 0(기대 1 — 실패 문장의 첫 줄은 명령 출력 `✓ …/wrap/sample-390-1.png`) |
| M3a 이름을 안 넘김(`fields[index]` → `undefined`) | `packages/renderer/src/render.tsx` | `field-a11y.test.ts` · `field-name.test.tsx` | 5 · 4 | 두 테마 판 ⟶ `expected [ { role: 'combobox', …(2) }, …(10) ] to deeply equal …`<br>«상태로 숨은 형제 …» ⟶ `expected { d1: [ 'YYYY-MM-DD', null ] } to deeply equal { d1: [ '기간', 'true' ] }`<br>«라벨을 고치면 …» ⟶ `expected { i: [ '입력', null ] } to deeply equal { i: [ '이름', null ] }` |
| M3b 별칭을 안 봄(늘 차례) | 같은 파일 | 같은 둘 | 5 · 2 | 두 테마 판(«근무 시작 · 끝» 대신 «근무 1 · 2») |
| M3c 숨은 형제도 셈 | 같은 파일 | 같은 둘 | 5 · 1 | «상태로 숨은 형제는 안 센다 …» ⟶ `expected { d1: [ '기간 1', 'true' ] } to deeply equal { d1: [ '기간', 'true' ] }` |
| M3d 필드 이름을 받는 조각도 캐시(열쇠에 이름 없음 · 캐시 길도 이름을 넘김) | 같은 파일 | 같은 둘 | 5 · 1 | «라벨을 고치면 조각의 이름도 바뀐다 …» ⟶ `expected { i: [ '이름', null ] } to deeply equal { i: [ '성명', 'true' ] }` |
| M3a′ 이름을 안 넘김 — 번들 판(변조를 건 채 `pnpm build` · 복원 뒤 다시 빌드) | `packages/renderer/src/render.tsx` | `apps/web/build-test/theme-prop-marks.test.ts` | 3 · 1 | «system-admin — 필드는 이름 붙은 묶음 · 조각의 오류 · 읽기 전용은 접근성 트리에 선다» ⟶ `expected { groups: [ '접근성 이름 *' ], hits: [] } to deeply equal { groups: [ '접근성 이름 *' ], …(1) }` |
| M3e 빈 라벨도 싣음 | 같은 파일 | 같은 둘 | 5 · 1 | «빈 라벨이면 조각은 제 이름 …» ⟶ `expected { a: [ '', null ], …(1) } to deeply equal { a: [ '안내', null ], …(1) }` |

- **함께만 죽는 것** — 바꾼 «setProp — 옮긴 prop 은 그 prop 을 가진 조각마다 하나씩 …» 은 M1 에서 넓힌 표본과 함께 죽는다. 그 축(조각마다 퍼짐)은 넓힌 표본이 소유하고, 이 케이스는 작은 표본에서 차례 · `control` 액션의 경고를 잰다. 두 테마 판(`field-a11y`)은 같은 단언을 테마만 바꿔 싣는다 — 늘 함께 죽는다(축은 «이름은 CSS 와 무관하다»).
- **바꾼 `theme-prop-marks` «필드는 이름 붙은 묶음 …»** — 내보낸 번들을 열어 빌드한 런타임을 본다. 소스만 바꾼 M3a 에는 살았고(3 · 0 — 변조가 `dist` 에 안 닿음) 변조를 건 채 빌드한 M3a′ 에 값으로 죽었다. 게이트 전 판에서 이 케이스가 빨강이었던 것은 조각 이름이 안내 문구(«접근성 칸»)에서 필드 라벨(«접근성 이름»)로 바뀐 몫이다 — 새 이름으로 찾고 필드의 `required` 까지 단언하게 고쳤다. 축(이름 · 필수)은 `field-a11y` 가 소유하고 이 케이스는 내보낸 번들에서 그 이름에 상태 속성이 함께 실리는지를 잰다.
- **첫 M3d 는 재려던 값이 아니었다** — 우회만 걷자 캐시 길이 `field` 를 안 넘겨 이름이 통째로 빠졌다(«입력» — M3a 와 같은 값). 캐시 길도 이름을 넘기는 꼴로 다시 짜 «옛 이름 «이름» 이 캐시에서 나옴» 으로 죽는 것을 보았다(표의 M3d).
- 고치기 전 빨강 — 1: 넓힌 표본 1 496 ≠ 1 906(10 · 1). 2: shots 5 · 1(위 M2 와 같은 값). 3: `field-a11y` 2 · 2(조각 이름이 안내 문구 · 종류 이름 · 라디오 묶음 «» · 필수 false — 「3」 표의 «고치기 전»).

### 3″. 스타터 템플릿 — `import type` 을 못 옮긴다

게이트 전 `test:build:serial` 에서 `packages/theme-kit/build-test/template.test.ts` 가 파일째 죽었다 — `input.tsx: 옮기지 못한 상대 import 가 남았습니다`(9 케이스 건너뜀). 3 에서 기본 뷰에 `import type { ViewField } from '../types'` 를 더했는데 `packTemplate` 의 `templateView` 는 `import { … } from '../…'` 만 `@wirebound/theme-sdk` 한 줄로 옮긴다. 기본 뷰의 `pieceAria` 가 그 모양(`{ name: string; required: boolean } | undefined`)을 그 자리에 적게 고쳤다(다른 기본 뷰도 타입을 import 하지 않는다 — 주석에 까닭을 적었다). 이 편집은 `test:browser` 가 돌던 중이었다 — 타입 자리만 바뀌어 esbuild 가 내는 JS 가 같다.

## 남은 것

이 트랙에서 안 고친 것:

1. **기본테마 `Select` `short`(6em = 84px)에 기본 안내 «== 선택 ==»(76px)가 안 든다** — 글 칸 약 41px 이라 두 줄로 꺾인다. 기본 크기(`medium`)는 들고 갤러리에 `short` 셀렉트 표본이 없어 `shots` 는 초록이다. «짧은 칸» 은 고른 항목이 짧은 꼴(행 수 «10 · 20 · 50»)에 쓰여 고르면 안 꺾인다. 고치려면 `short` 셀렉트의 폭을 안내에 맞추거나 갤러리에 그 표본을 더해 `shots` 가 재게 한다.
2. **`wb-theme shots` 의 «꺾임» 은 한 줄 입력 조각 넷(`ONE_LINE_PIECES`)만 센다** — 단추 · 칩 · 사이 글자의 꺾임은 안 센다(글이 길면 꺾이는 것이 그 꼴의 정상일 수 있다).
3. **SDK 판 1.4.0 그대로** — `ViewProps.field` 는 선택 칸으로 더했다(1.4.0 은 아직 main 에 없다). CI-B 의 1.5.0 이 그 위에 선다.
4. 브리프의 이월(리뷰 «낮은 무게» 표 전부 — 고치지 않았다):
   - 종류 바꾸기의 덮임 범위는 «prop 하나» 가 아니라 «그 노드 하나의 `type` · `props` 전부»(남의 노드 · 구조는 안 덮는다 · 창은 남이 손 뗀 뒤 아직 안 닿은 편집뿐).
   - 선택지 옮기기의 두 사람 판도 같은 꼴(배열째 «뒤의 것이 이긴다»).
   - `0029` 가 `checkbox` · `radio` 의 오류(`invalid`) · 안내, `dateRange` · `file` 의 안내를 버린다(설계 표대로).
   - 판 3 의 무시된 `Field.variant` 가 남고 판 4 검증 · lint 가 말이 없다.
   - `liftNodes` 가 판 4 의 빈 값 칸 필드에 `Input` 을 더한다(마이그레이션 안에서는 안 닿는다).
   - 들여쓰기 · «안에 넣기» 가 앞 필드의 값 칸으로 들어간다(설계가 받는 꼴).
   - 기본테마 390 의 세그먼트 7 칸 글 쪼개짐 · 스타터의 빈 `Input` 6px.
   - `theme-variant` lint 가 선언 안 한 컴포넌트의 변형을 안 센다 — 설계 문장과 갈림.

## 지침

| 무엇이 틀렸나(비었나) | 어느 문서 어느 절 | 넣을 문장 |
| --- | --- | --- |
| Chrome `Accessibility.getFullAXTree` 의 노드 차례는 DOM 차례가 아니다 — 첫 판이 필드 밖 입력(문서 끝)을 맨 앞에 받아 차례째 견준 단언이 값과 무관하게 빨강이었다 | `.ruler/wirebound/` 의 「검증 — wirebound」 소스 · 「수를 셀 때는 두 번 세고 표본을 열어 본다 — 덧붙임」 | «**접근성 트리(`Accessibility.getFullAXTree`)의 노드 차례는 DOM 차례가 아니다** — 이름 · 역할을 견주는 케이스는 (역할 · 이름)으로 늘어놓고 견주거나 `backendDOMNodeId` 로 DOM 과 짝짓는다(`packages/theme-kit/build-test/field-a11y.test.ts`).» |
| 캐시를 지나치는 갈래를 떼는 변조는 그 갈래만 값을 넘기던 경우 «값이 통째로 빠짐» 으로 죽는다 — 재려던 «캐시가 옛 값을 냄» 이 아니다(M3d 첫 판) | 「워커에게 맡길 때 — wirebound」 소스 · 「변조를 `git checkout` 으로 되돌리지 않게 한다 …」 문단 끝 | «**캐시 우회를 떼는 변조는 캐시 길도 같은 입력을 넘기는지 본다** — 우회한 갈래만 값을 넘기면 우회를 뗀 변조가 «캐시가 옛 값을 냄» 이 아니라 «값이 빠짐» 으로 죽는다. 캐시 길에도 그 값을 넘기는 꼴로 짠다(`docs/superpowers/plans/2026-10-24-fx-ci-report.md` M3d).» |
