# RV-CI 보고 — 조합 입력(3단계 문제 1 · CI-A) 리뷰 — 2026-10-24

브리프: 코디네이터 `brief-rv-ci.md` · 공통 `common-w8.md`. 워크트리 `feat-compose-input` · 브랜치 `feat/compose-input` · 리뷰 대상 HEAD `83f05084`(구현 보고 `2026-10-24-ci-a-report.md`). node v24.21.0 · Postgres 5501(이 워크트리의 컨테이너). 이 워크트리에 붙은 터미널은 리뷰어 하나(`orca terminal list`).

리뷰는 고치지 않고 잰다. 탐침은 스크래치(`…/scratchpad/m29` 등 — 루트 vitest 설정의 `resolve` 를 싣고 `root` 를 체크아웃, `test.dir` 을 스크래치로 둔 설정)에서 돌렸다.

## 높은 무게

**없다.** 데이터를 잃음 · 엉뚱한 노드를 고침 · 남의 화면 · 권한 우회 · 잠금 우회 · 마이그레이션이 사용자 문서를 망침 — 어느 것도 재현되지 않았다.

- `0029` — 필드 968 개(놓인 자리 열한 곳)에서 판 4 검증 오류 0 · 옛 id 전부 그대로 · 봉투 그대로 · 코멘트 57 / 57 이 이어짐 · 실제 DB 에서 두 번 돌려도 같다(1).
- 종류 바꾸기 · 선택지 — 서버가 남이 쥔 조각 · 조상에 423(2) · «고름 둘» 은 페이지에 닿는 입구 전부에서 422(3) · 리베이스가 남의 노드 · 구조를 안 덮는다(2 · 3) · 상자 안 키가 뒤 트리로 안 샌다(2′).

## 중간 무게 — 병합 전에 정할 것

| # | 무엇 | 재현 값 | 절 |
| --- | --- | --- | --- |
| 1 | **`0029` 가 `dateRange` · `file` 필드의 `disabled` · `invalid` 를 바꾸던 상호작용을 첫 조각 하나에만 옮긴다** — 뷰 모드에서 그 상호작용을 누르면 둘째 날짜 칸 · «파일 선택» 단추는 켜진 채다. 검증 경고 없음 | `setProp` 대상 = 값 칸의 첫 조각(조각 2 · 3 개 중 1) | 1 |
| 2 | **기본테마의 `DateInput` 이 제 기본 안내 «YYYY-MM-DD» 를 모든 폭에서 두 줄로 꺾는다** — `0029` 가 옮기는 옛 날짜 필드 전부가 병합 직후 이 꼴 | 글자 줄 수 2(390 · 1280) · 칸 `9.5em` | 6 |
| 3 | **입력 조각이 접근성 트리에서 라벨을 잃었다**(판 3 은 `aria-label=라벨` · `aria-required`) — 조각은 안내 문구 · «입력» 으로 불리고 필수가 없다 | `textbox` «이름을 입력» · `spinbutton` «입력» · `textbox` «YYYY-MM-DD» × 2 · required false | 5 |

1 은 얼린 마이그레이션이라 **병합 전에만** 고칠 수 있다(사용자의 개발 DB 에서 한 번 돈다). 2 · 3 은 병합 뒤에도 고칠 수 있다.

## 1. `0029` — 넓힌 판 3 표본

표본: `control` 11 꼴(아홉 · 안 적음 · 모르는 값 `bogus`) × 안내(`''` · 글) × 비활성 × 오류 = 88 필드를 **놓인 자리 열한 곳**(페이지 몸통 · 카드 몸통 · 카드 `footer` · `headEnd` · `titleSide` · 검색폼 몸통 · 검색폼 `actions` · 입력폼 몸통 · `TabPanel` 몸통 · `List.headEnd` · `Flex > Grid`)에 — 필드 968 개 · 노드 982 개. 필드마다 판 3 편집기가 기본값을 적어 둔 판(빈 안내 · 거짓)을 섞고, 번호 · 별칭 · 상태 보임 · 몫 · 무시된 옛 변형(`variant: 'select'`) · 빈 `children: []` · 필드 자신의 상호작용을 차례로 붙였다. 단추 하나에 `setProp` 1 016 개(필드마다 `control` · `placeholder` · `disabled` · `invalid` · `label` · `required` 가운데 하나 + `dateRange` · `file` 필드마다 `disabled` 하나 더).

| 잰 것 | 값 |
| --- | --- |
| 판 4 검증 오류(`validatePage`) | **0** |
| 노드 수 | 982 → 2 214(새 조각 1 232) · id 2 214 개 모두 다름 |
| 옛 id 가 그대로 · 차례 그대로 | 참(옛 982 개 전부, 새 조각이 사이에 낄 뿐) |
| 봉투(번호 · 별칭 · 보임 · 몫 · 변형 · 필드 밖 상호작용) 바뀐 칸 | 0 |
| 남은 옛 prop · 빈 값 칸 필드 | 0 |
| 조각 꼴(안내 · 비활성 · 오류 없음) | 구현 보고 표 그대로 — `bogus` 도 `Input` |
| 다시 돌림 — 페이지 `liftDocument(판 4)` | `null`(건드리지 않음) |
| 다시 돌림 — 묶음 `liftNodes` 두 번 | 같은 글자 |
| 실제 DB — `0028` 판에 다섯 표(페이지 · 레이아웃 · 모듈 · 개인 모듈 · 스냅샷)를 넣고 `migrateToLatest` | 페이지 판 4 · 오류 0 · 레이아웃 오류 0 · 스냅샷 payload 규격 통과 · 코멘트 57 개가 가리키는 노드 57 개 모두 `Field` |
| 실제 DB — `migration.up` 을 손으로 한 번 더 | 다섯 표 글자 모두 같다 |
| 입력 객체를 고치는가 | 안 고친다(돌리기 전후 글자 같음) |

### 옛 값을 잃는 자리 — 설계 표대로

필드 88 개마다(놓인 자리 열한 곳 × 8 조합 중 그 값을 켠 것) 옛 값이 조각에 안 남는다 — 모두 설계 「문서 판 4」 표 · 구현 보고 표가 «안 옮긴다» 고 적은 것이다:

| 옛 `control` | 잃는 것 | 수(968 중) |
| --- | --- | --- |
| `dateRange` | 안내 문구 | 44 |
| `checkbox` · `radio` | 안내 문구 · 오류(`invalid: true`) | 44 · 44(각각) |
| `file` | 안내 문구(«선택된 파일 없음» 으로 바뀜) | 44 |

`checkbox` · `radio` 의 **오류 표시(빨간 상태)가 사라지는 것**은 설계서에서 «오류 판» 을 그린 화면이면 그림이 바뀐다 — 조각(`CheckboxGroup` · `RadioGroup`)에 `invalid` 가 없어서다. 낮은 무게(설계가 정한 것 · 문서는 열린다).

### `setProp` 이 어떻게 되나

| 옛 액션 | 판 4 에서 |
| --- | --- |
| `label` · `required` | 그대로 `Field`(정상) |
| `placeholder` · `disabled` · `invalid`(그 prop 을 가진 조각이 있는 `control`) | 값 칸의 **첫** 조각으로 |
| `control`(모든 `control`) | 그대로 `Field` — 경고 `invalid-interaction-prop` |
| `checkbox` · `radio` 의 `placeholder` · `invalid` | 그대로 `Field` — 같은 경고 |

경고로 남는 액션 221 개(`control` 162 · `placeholder` 30 · `invalid` 29) — 검증이 말하므로 «조용히» 는 아니다(편집 응답의 `warnings` 로 화면에 온다).

**조용히 반쪽만 도는 액션이 있다** — `dateRange` · `file` 필드의 `disabled` · `invalid` 를 바꾸던 액션은 첫 조각 **하나**(첫 `DateInput` · 파일의 `Input`)로 옮겨진다. 옛 판에서는 필드 전체가 꺼졌는데(두 날짜 칸 · 파일 단추), 판 4 에서 그 상호작용을 누르면 둘째 `DateInput` · «파일 선택» 단추는 그대로 켜져 있다. 검증 경고가 없다(대상 · prop 이 맞다). 중간 무게 — 문서는 안 잃지만 «N 이면 기간이 딤드» 같은 설계의 뜻이 뷰 모드에서 반만 선다. 고치려면 그 필드의 같은 prop 을 가진 조각마다 액션을 하나씩 늘린다(얼린 마이그레이션이라 병합 전에만 고칠 수 있다).

### 그 밖에

- **`head_seq` 를 안 올린다**(17 → 17) — 설계가 적은 이월(`0028` 과 같은 길). 옛 좌표 편집이 판 4 문서에 얹혀도 옛 `Field` 에 자식이 없어 엉뚱한 노드가 안 고쳐진다는 설계의 판단은 표본에서 맞다(값 칸은 새 `children` · 다른 노드의 경로는 안 바뀐다 — 옛 id 차례가 그대로다).
- **무시된 옛 변형**(`Field.variant: 'select'` — 판 3 의 `variantFrom` 때문에 `ignored-variant` 였던 값)은 그대로 남고 판 4 검증이 아무 말도 안 한다. 판 3 편집기는 그 값을 안 적으므로 API 로 넣은 문서에만 있다. 낮은 무게.
- **`liftNodes` 는 판을 모른다** — 판 4 에서 사람이 기본 `Input` 을 지워 값 칸이 빈 필드를 넣으면 `Input` 하나를 더한다(`[{id:'e1',type:'Field',props:{label:'라벨만'}}]` → 값 칸에 `Input`). 마이그레이션은 한 번만 돌고 그때 모듈 표에 판 4 묶음이 없으므로 닿지 않는다. 이 함수를 다른 곳이 부르지 않는다(`git grep 0029-compose-field` — 마이그레이션 목록 · 그 케이스뿐). 낮은 무게 — 「두 번 돌려도 같은가」 의 답은 «판 3 묶음 · 판 4 페이지는 같다 · 판 4 묶음의 빈 값 칸 필드만 다르다» 다.

## 2. 종류 바꾸기

### 서버 잠금 — 남이 쥔 자리에 낸 op (api · `withRealApi` + WS `lock`)

값 칸 `[Input n_in][RadioGroup n_rg]` 를 든 필드 `n_f`. 보라(owner)가 WS 로 한 노드를 쥐고, 다혜(editor)가 REST 로 종류 바꾸기 op(`changeKindOps` 의 꼴 — `…/type` · `…/props` replace) · 선택지 옮기기 op(`…/props/options` 배열째)을 낸다.

| 보라가 쥔 것 | 종류 바꾸기(`n_in`) | 선택지 옮기기(`n_rg`) | 문서 |
| --- | --- | --- | --- |
| `n_in`(그 조각) | **423** | 200 | `n_in` 은 `Input` 그대로 |
| `n_f`(조상 필드) | **423** | **423** | 그대로 |
| `n_root` | **423** | **423** | 그대로 |
| `n_rg`(이웃 조각) | 200 | **423** | `n_in` 만 `Select` |
| `n_other`(필드 밖) | 200 | 200 | 둘 다 바뀜 |

서버의 2차 방어(`lockConflictOfOps`)가 새 op 꼴에도 그대로 선다 — 화면 판(줄 `…` 이 안 섬 · 상자를 연 뒤 잡히면 안 보냄)은 구현 보고 「잰 값」 2 의 실브라우저 · jsdom 판이 잰다.

### 42 쌍 — 봉투 · 검증 · 되돌리기

일곱 타입 × 여섯 목적지마다, 모든 prop 을 채운 노드(번호 · 별칭 · 몫 · 상태 보임 · 상호작용 · `RadioGroup` 은 `variant: 'radio'` · `CheckboxGroup` 은 `chip` · 체크 묶음은 둘을 고름)에 `changeKindOps` → `applyOps`, 그 위에 서버가 짓는 역연산(`invertOps`)을 얹었다.

- 판 4 검증 오류 0 · 봉투 다섯 칸 그대로 · 변형 걷힘 — **42 / 42**.
- **되돌리기가 바이트로 원래 노드** — 42 / 42(변형 · `props` 키가 없던 판 포함).
- 하나 고르는 목적지(`Select` · `RadioGroup`)로 간 체크 묶음은 고른 둘 가운데 첫째만 남는다(`['a']`). 체크 묶음으로 간 `Select` · 라디오는 고른 것 그대로.
- 잃는 prop 은 목적지 규격에 없는 것뿐이다(예: `Input → Select` 는 `kind` · `value` · `readonly`, `TextArea → Input` 은 `rows`, 선택지 타입 ↔ 글 타입은 `options` 또는 `value` · `placeholder` · `invalid`). 되돌리기가 다 돌려준다.

### 「남은 것」 1 — 덮이는 것의 범위 (리베이스 · 순수 함수)

`anchorOps(내 문서, changeKindOps(…, 'Select'))` 를 남의 편집이 얹힌 문서 위에 `rebaseAnchored` 로 다시 지었다(서버는 낡은 `baseSeq` 를 거절하고 다시 얹는 것은 이 함수다).

| 남이 그 사이 낸 편집 | 결과 |
| --- | --- |
| 그 조각의 안내 하나 | **덮인다**(`옛 안내`) |
| 그 조각의 안내 · 비활성 · 값 셋을 한 묶음으로 | **셋 다 덮인다** |
| REST 로 그 조각을 `Button{label}` 로 | **타입째 덮인다**(`Select{옛 안내}`) |
| `props` 가 없던 조각에 남이 `props` 를 처음 만듦 | 남의 것이 산다(내 op 이 `type` 하나라) |
| 앞에 형제 넣기 · 값 칸 앞에 조각 넣기 · 그 조각을 다른 필드로 옮김 | 내 op 이 id 를 따라간다 — 남의 구조 그대로 |
| 이웃 조각의 안내 · 필드 라벨 | 남의 것이 산다 |
| 그 조각을 지움 | 내 편집을 버린다(`null` — 부르는 쪽이 알린다) |

**낮은 무게가 맞다 — 다만 «prop 하나» 가 아니라 «그 노드 하나의 `type` · `props` 전부»다.** 남의 노드 · 남의 구조를 덮는 판은 없다. 창은 좁다 — 노드를 고른 사람만 그 노드를 고칠 수 있고(서버 423 — 위 표), 남이 손을 뗀 뒤 아직 내 화면에 안 닿은 편집만 덮인다. 구현 보고의 «덮인 것은 안내 문구 한 칸» 은 그 판 하나의 값이다.

## 3. 선택지 편집 (`optionList`)

### «고름 둘» 의 입구 (api)

| 입구 | 하나 고르는 타입에 고른 것 둘 |
| --- | --- |
| `PATCH …/ops` 노드째 `add`(`Select` · `RadioGroup` · 필드 값 칸 안) | **422** · 422 · 422 |
| `PATCH` 항목 하나만 켬(`add …/options/1/selected true`) · 고른 항목을 끝에 더함(`add …/options/-`) — 위젯이 안 내는 꼴, REST · MCP 가 낼 수 있다 | **422** · **422** |
| `PUT …/schema` | **422** |
| `POST …/pages/import`(페이지 JSON) | **422** `validation-failed` — 이슈 `invalid-props` · `n_rg` |
| `POST …/modules` · `POST /api/me/modules` | 201 · 201 — 모듈 저장은 봉투만 본다(`routes/modules.ts` 머리말 «카탈로그 검증은 여기서 하지 않는다») |
| 그 모듈을 페이지에 넣기(웹이 내는 노드 `add`) | **422** |
| MCP `patch_page` | `PATCH …/ops` 와 같은 길(`packages/mcp/src/handlers.ts`) |
| `CheckboxGroup` 에 둘 | 200(여럿 타입) |

상한: `CheckboxGroup` 31 개 **422** · 30 개(둘 고름) 200 · 빈 배열 **422**. 페이지에 닿는 입구에서 «고름 둘» · 상한 밖이 서는 길은 없다. 모듈에는 설 수 있으나(기존 설계 — 넣을 때 판정) 넣는 순간 422 다.

### 두 사람의 옮기기 (리베이스)

`[A●, B, C]` 에서 내가 «A 아래로»(배열째 `[B, A●, C]`)를 보내는 사이 남이 «C 고름» · «B 이름 바꿈» · «맨 앞에 X» · REST 로 «B 지움» 을 먼저 커밋한 네 판 — 넷 다 결과가 `[B, A●, C]`(내가 본 판의 옮김) · 검증 오류 0. **엉뚱한 항목을 옮기지도, 고름 둘을 만들지도 않는다** — 대신 남의 그 편집은 덮인다(배열째 `replace` 의 «뒤의 것이 이긴다» — `stringList` · `pairList` 에도 원래 있던 꼴). 창은 2 와 같다(그 노드를 고른 사람만 고친다).

## 4. 필드 모델의 다른 입구

### 구역 규칙 — 서버와 웹이 같은 답

웹의 넣는 입구(끌어 놓기 · 하단 판 넣기 · 구역 줄 넣기 · 붙여넣기 · 모듈 넣기)는 `fitRefusal`(`apps/web/src/edit/structure-drop.ts` — 검증의 `zone-type-not-allowed` · `misplaced-component` 와 같은 규칙)을 묻고, 들여쓰기 · 내어쓰기는 `structureAbilities` · `levelRefusals`(같은 `fitRefusal`)를 지난다. 카탈로그에 `accepts` 는 `Tabs.body`(`TabPanel`) 하나 · `placement` 는 `TabPanel` 하나뿐이고(`git grep -n "placement\|accepts" -- packages/schema/src/component/catalog/`), `Field` 값 칸 · 조각 아홉에는 둘 다 없다 — 서버 · 웹 모두 «받는다» 다. `TabPanel` 을 값 칸에 넣는 판은 둘 다 거절한다(기존 규칙).

### 세 꼴 — 검증 · lint (순수 함수)

| 꼴 | 검증 오류 · 경고 | `lintDesign` |
| --- | --- | --- |
| 값 칸이 빈 필드 | 0 · 0 | 0 |
| 값 칸에 필드가 든 필드 | 0 · 0 | 0 |
| 값 칸에 카드가 든 필드 | 0 · 0 | 0 |
| (대조) 입력폼 몸통에 조각만 · 필드 없음 | 0 · 0 | `structural-gap` · `comment-missing` |

설계 「1. `Field` 의 꼴」 의 «값 구역은 무엇이든 받는다 · 빈 값 구역은 lint 가 말하지 않는다» 그대로다. 붙여넣기 · 복제 · 모듈 넣기 · MCP · REST 는 모두 노드째 `add` 라 같은 판정을 탄다 — **`initial` 을 타는 것은 «새 노드» 입구뿐이다**: MCP `patch_page` · REST 로 `{type:'Field', props:{label}}` 을 넣으면 값 칸이 빈 필드가 선다(오류 · 경고 0). 모듈 넣기가 `initial` 을 안 타는 것은 구현 보고 「결정과 이유」 그대로다.

**들여쓰기가 필드 안으로 들어간다** — 판 3 의 `Field` 는 자식을 안 받아 «앞 형제가 필드» 면 들여쓰기가 꺼졌다. 판 4 에서는 받으므로 폼의 둘째 필드를 들여쓰면 첫 필드의 값 칸 안으로 들어간다(필드 안 필드 — 검증이 막지 않는 설계의 꼴). 끌기의 «안에 넣기» 띠도 같다(구현 보고 게이트 1차 `canvas-drop` 빨강이 그 띠다). 설계가 고른 것이라 결함이 아니다 — 낮은 무게의 관찰로 적는다.

## 5. 접근성 (실브라우저 — Chrome 접근성 트리)

기본 뷰(`renderDocument` — 시스템 테마는 뷰가 없다) + 기본테마 `theme.css` 를 실은 정적 페이지를 Chrome(headless · `/Applications/Google Chrome.app`)에 열고 `Accessibility.getFullAXTree` 로 읽었다. 입력폼에 필드 여섯.

| 필드(값 칸) | 묶음 | 조각 |
| --- | --- | --- |
| `이름`(필수) `[Input 안내 «이름을 입력»]` | `group` «이름 *» | `textbox` «**이름을 입력**» · required false |
| `나이` `[Input number]` | `group` «나이» | `spinbutton` «**입력**» |
| `기간`(필수) `[DateInput ~ DateInput]` | `group` «기간 *» | `textbox` «**YYYY-MM-DD**» × 2(같은 이름) |
| `상태` `[Select 나● ]` | `group` «상태» | `combobox` «**== 선택 ==**»(고른 «나» 가 화면에 서도 이름은 안내 문구) |
| `여부` `[RadioGroup]` | `group` «여부» | `radiogroup` «» > `radio` «Y» · «N» |
| `요일` `[CheckboxGroup]` | `group` «요일» | `group` «» > `checkbox` «월» · «화» |

- **필수 별은 묶음 이름에 든다** — 구현 보고 그대로 맞다(`이름 *` · `기간 *`). 조각의 `required` 는 모두 false.
- **라벨이 조각과 짝 지어지지 않는다** — 조각의 이름은 라벨이 아니라 안내 문구 · 카탈로그 이름(`pieceName`)이다. 묶음을 지나며 읽는 판(둘러보기)에서는 «이름 * 그룹» 뒤에 조각이 오지만, **입력 칸만 훑는 판(양식 목록 · 다음 입력 칸으로 건너뛰기)에서는 «이름을 입력» · «입력» · «YYYY-MM-DD» 둘만 들리고 어느 라벨의 칸인지가 없다.**
- **판 3 보다 나빠졌다** — 판 3 의 `FieldView` 는 입력 조각에 `aria-label = 라벨` 과 `aria-required` · `aria-invalid` 를 달았다(`git show 96efb495:packages/theme-sdk/src/default-views/input.tsx` 69 – 78 줄). 판 4 의 `textbox` 는 이름에서 라벨을 잃고 필수를 잃었다. 설계 「6. 테마 뷰 계약」 은 필수를 조각에서 거두는 것만 정했고(«렌더러가 부모 상태를 자식에 넘기는 길이 새로 들어 이 단계에서 안 짓는다»), 조각의 이름이 라벨을 잃는 것은 적지 않았다.
- 중간 무게 — 문서 · 권한과 무관하고 설계 그림의 접근성이다. 고치는 길: 값 칸 조각이 하나뿐인 필드에서는 조각이 라벨 id 를 `aria-labelledby` 로 함께 가리키게 한다(`labelledby="<필드>-label <조각>"` 꼴 — 렌더러가 부모 id 를 자식 뷰에 넘기는 길이 든다), 여럿이면 «기간 시작» 처럼 별칭을 이름에 싣는다. 이 리뷰는 고치지 않는다.

## 2′. 종류 바꾸기 상자 — 실브라우저(`editor-stack`)

스크래치 탐침(`startEditorStack` — 일회용 DB · api · vite · Chrome). 값 칸 `[Input n_input00001][Input n_input00002]` 필드, alice(owner) · bob(viewer).

| 판 | 값 |
| --- | --- |
| 줄 `…` → «종류 바꾸기…» → «날짜»(되돌릴 거리 하나) 뒤, 상자를 다시 열고 상자 안 단추에 포커스(`activeElement` 가 `dialog` 안 — 열 판 모두 참)를 둔 채 키 하나 · 800ms 기다림 | `Delete` · `Backspace` · `Cmd+Z` · `Cmd+Shift+Z` · `Cmd+D` · `Alt+Shift+→` · `Alt+↓` · `Cmd+X` · `Cmd+V` — **서버 문서 그대로 · 상자 열린 채**(9 / 9). `Enter`(첫 포커스 단추) — 서버 그대로 · 상자 닫힘 |
| 카나리아 — 상자를 닫고 고른 줄에서 같은 `Cmd+Z` | 되돌린다(서버가 `Input` 으로) — 키가 원래 듣는 판에서 상자만 막는다 |
| `Escape` 뒤 포커스 | 그 줄의 «… 더 보기» 단추(`DateInput 옛 안내 더 보기`) |
| viewer(bob) — 같은 줄을 고르고 `…` | 줄 `…` 1 개 · 항목 «모듈로 저장…» 하나 — «종류 바꾸기…» 없음 |
| 스택 거둠 | 프로세스 0 · 포트 0 · DB 0 |

상자 안 키가 뒤 트리로 버블돼 노드를 지우거나 되돌리는 길은 없다(상자를 단축키 상자의 형제로 그린 결정이 실브라우저에서 선다). 뷰 모드는 이 판에서 다시 안 쟀다 — 구현 보고 jsdom 판(구조 트리째 없음)과 서버 403 · 423 이 덮는다.

## 6. 내보내기 · 테마

### 그려지는가 (실브라우저 — Chrome)

조각 아홉 · 세그먼트 7 칸 · 칩 13 칸 · `size: long` + 긴 안내 · 고른 항목 · `Affix.tone` 을 든 문서를 `renderDocument` + 토큰 CSS(`tokensCss(manifest)`) + SDK 기본 CSS(`defaultViewsCss`) + 테마 CSS 로 열었다. 스타터 테마는 템플릿 manifest(`packages/theme-kit/template/theme.config.ts`)에 뷰 `{}` — 템플릿의 `FieldView` 는 `packTemplate` 이 SDK 기본 뷰를 옮긴 사본이고 조각은 뷰가 없다.

| 판 | 폴백(`data-wb-error`) | 크기 0 · 창 밖 조각 | 창을 넘는 글자 | 문서 폭 | 세그먼트 칸 사이 |
| --- | --- | --- | --- | --- | --- |
| 기본테마 390 | 0 | 0 | 0 | 390 | −1px(붙은 칸) |
| 기본테마 1280 | 0 | 0 | 0 | 1280 | −1px |
| 스타터 390 | 0 | 0 | 0 | 390 | 12px(라디오 모양 — 변형을 선언 안 함) · 줄 바꿈 |
| 스타터 1280 | 0 | 0 | 0 | 1280 | 12px |

**깨지지는 않는다.** 다만 눈으로 보이는 셋:

1. **기본테마의 `DateInput` 이 제 기본 안내 «YYYY-MM-DD» 를 두 줄로 꺾는다 — 390 · 1280 모두**(글자 노드의 줄 수 2 · 2). 칸 폭 `9.5em`(14px → 133px)에서 안쪽 여백 · 달력 표지 · 틈을 빼면 글 칸이 «YYYY-MM-DD» 보다 좁다. 글꼴은 테마 토큰의 시스템 글꼴(`system-ui …`)이라 실제 판과 같다. **`0029` 가 옮기는 옛 `date` · `dateRange` 필드가 모두 이 꼴로 선다** — 사용자의 설계서가 병합 직후 이렇게 보인다. 중간 무게(그림 결함 · 데이터는 그대로). 구현의 `shots` 는 글자가 칸을 넘는지만 재고 칸 안의 꺾임은 안 재 초록이다.
2. **기본테마 390 에서 세그먼트 7 칸의 글이 «선/택1» 로 쪼개진다**(칸마다 줄 2 · 1280 은 1). `flex-wrap: nowrap` 이라 칸이 줄을 안 바꾸고 좁아진다. 낮은 무게.
3. **스타터 테마(SDK 기본 CSS)에서 빈 `Input` 이 높이 6px 의 납작한 선이다**(기본테마는 34px). 팔레트 한 걸음의 필드(`[Input]` · props 없음)가 바로 이 꼴이다 — SDK 기본 CSS 의 글 받는 조각 규칙에 최소 높이가 없다. 낮은 무게(스타터에서 새로 짓는 테마의 첫 모습).

### `theme-variant` lint — 설계와 갈린다

`lintProject` 에 세그먼트 · 옮긴 라디오(`variant: 'radio'`) · 칩을 든 문서를 넣었다: 기본테마 0 건(셋 다 선언) · **스타터 0 건**. 설계 「7. 그 밖의 소비자」 lint 줄은 «스타터 테마가 `segment` · `chip` 을 선언 안 하면 경고 — 그 테마의 기본 변형으로 그린다» 인데, 규칙(`packages/themes/src/lint/index.ts` 의 `themeVariantIssues`)은 **테마가 그 컴포넌트를 선언했을 때만** 센다 — 스타터는 `RadioGroup` · `CheckboxGroup` 을 선언하지 않아 말이 없다. 그리는 결과는 설계가 말한 대로다(기본 뷰 모양). 낮은 무게 — 설계 문장을 규칙에 맞추거나(이력 문서라 정본에서) 규칙을 «선언 안 한 컴포넌트의 변형» 까지 넓힐지 정할 일이다.

### 문장 · `/llms.txt`

- 번들 · PPTX 의 문장(`describeNode`) — `broadFixture` 의 조각: «셀렉트» · «체크박스» · «날짜» × 2 · «~ 사이 글자» · «시간» · «라디오 묶음» · «입력» · «설문 칩» · «여러 줄 입력», 필드는 «등급 입력 필드» 꼴. 설계 「공통 규칙」 의 이름 규칙(입력 조각은 카탈로그 이름 · 같은 필드의 둘은 별칭으로 가른다)대로다. `packages/exporter/src` 는 이 트랙에서 안 바뀌었다(`git diff --stat 96efb495..HEAD -- packages/exporter/src` 0).
- 번들 = 화면의 DOM 패리티는 `packages/exporter/test/parity.test.tsx` 가 카탈로그 타입 전부(`CATALOG_TYPES` 를 표본이 덮는지까지)로 잰다 — `broadFixture` 가 조각 아홉을 다 싣는다.
- `/llms.txt` 의 `Field` · 조각 아홉 줄 — props · 기본값 · 범위(1–30 · «at most one option selected») · 구역(«create with `Input`») · 영어 한 줄이 카탈로그와 맞다. `control` 낱말은 파일에 0.

## 7. 구현 보고의 변조 둘 — 다시 돌림

러너: 경로 전체 이름 백업 · 찾는 글자 맞은 수 1 확인 · 그 케이스 파일만 · 바이트 비교 복원(뒤 `git status` 에 추적 파일 변경 0).

| 변조 | 바꾼 곳 | 실행 · 죽음 | 죽은 케이스 ⟶ 값 | 구현 보고와 |
| --- | --- | --- | --- | --- |
| K1 하나 고르는 타입으로 갈 때 고른 것 그대로(`firstPickOnly(raw)` 걷음) | `apps/web/src/edit/change-kind.ts` | 8 · 1 | 여럿 고른 체크 묶음 → 하나만 고르는 타입이면 고른 것은 첫째만 남는다 ⟶ `expected {} to deeply equal { options: [ { label: '월' }, …(2) ] }` | 같은 값(실행 7 → 8 은 `bd184185` 가 그 파일에 케이스를 더한 몫) |
| M2 0029 `setProp` 안 옮김(`return action`) | `apps/api/src/db/migrations/0029-compose-field.ts` | 8 · 2 | «setProp — 옮긴 prop 은 …» ⟶ `expected [ { prop: 'placeholder', …(3) }, …(4) ] to deeply equal [ { type: 'setProp', …(3) }, …(4) ]` · «판 4 페이지 · 레이아웃 · …» ⟶ `expected [ { prop: 'disabled', …(3) } ] to deeply equal [ { type: 'setProp', …(3) } ]` | 같은 값 |

## 낮은 무게 — 이월로 넘겨도 되는 것

| 무엇 | 절 |
| --- | --- |
| 「남은 것」 1 의 범위는 «prop 하나» 가 아니라 «그 노드 하나의 `type` · `props` 전부» — 남의 노드 · 구조는 안 덮는다 · 창은 남이 손 뗀 뒤 아직 안 닿은 편집뿐 | 2 |
| 선택지 옮기기의 두 사람 판도 같은 꼴(배열째 «뒤의 것이 이긴다» — 원래 있던 꼴) | 3 |
| `0029` 가 `checkbox` · `radio` 의 오류(`invalid`) · 안내, `dateRange` · `file` 의 안내를 버린다 — 설계 표대로 | 1 |
| 판 3 의 무시된 `Field.variant` 가 남고 판 4 검증 · lint 가 말이 없다(API 로 넣은 문서에만 있다) | 1 |
| `liftNodes` 가 판 4 의 빈 값 칸 필드에 `Input` 을 더한다 — 마이그레이션 안에서는 닿지 않는다 | 1 |
| 들여쓰기 · «안에 넣기» 가 앞 필드의 값 칸으로 들어간다(설계가 받는 꼴) | 4 |
| 기본테마 390 의 세그먼트 7 칸 글 쪼개짐 · 스타터의 빈 `Input` 6px | 6 |
| `theme-variant` lint 가 선언 안 한 컴포넌트의 변형을 안 센다 — 설계 문장과 갈림 | 6 |

## 게이트

이 리뷰는 보고 파일 하나(`docs/superpowers/plans/2026-10-24-rv-ci-report.md`)만 더했다 — README 「트랙 게이트」 의 «문서 · 주석만» 줄: `pnpm typecheck` + 그 글을 읽는 케이스. 추적 파일 전부를 읽는 케이스는 `apps/api/test/source-control-bytes.test.ts`(`git grep -nE "(readFileSync|readdirSync|glob)[^\n]*docs" -- '*.test.ts' '*.test.tsx'` 와 `?raw` 로 정본을 읽는 셋 — 정본은 안 건드림). 결과는 아래 «게이트 값».

탐침은 모두 스크래치에서 돌았고 저장소에 안 들였다. 변조 둘은 바이트 비교로 되돌렸다(`git status` 추적 변경 0). 실브라우저 탐침의 스택은 거둠 카나리아가 «프로세스 0 · 포트 0 · DB 0» 이다.

## 지침

| 무엇이 틀렸나(비었나) | 어느 문서 어느 절 | 넣을 문장 |
| --- | --- | --- |
| 스크래치 vitest 설정에 루트 설정의 `resolve` · `esbuild` 만 실으면 `@wirebound/system-theme-admin` 의 `ADMIN_V0_CSS`(`theme.css?raw`)가 빈 글자다 — 이 리뷰의 첫 판이 기본테마 CSS 없이 «세그먼트 규칙이 안 먹는다» 로 읽혔다(`cssLen 0` 으로 갈랐다). 지침은 build 프로젝트의 같은 함정만 적는다 | `.ruler/wirebound/` 의 「검증 — wirebound」 소스 · 「build 프로젝트에서는 `*.css?raw` 가 빈 글자다」 | «**스크래치 탐침 설정도 같다** — 루트 설정에서 `resolve` · `esbuild` 만 실은 스크래치 설정은 `css.include` 가 없어 `ADMIN_V0_CSS` 같은 `?raw` CSS 가 빈 글자다. 탐침은 테마 CSS 를 `readFileSync` 로 읽고 `length > 0` 카나리아를 둔다.» |
| 실브라우저로 그림을 재는 판은 테마 토큰 CSS 를 함께 실어야 크기가 실제와 같다 — 테마 CSS 의 글자 크기 · 여백이 전부 `var(--wb-…)` 라 토큰이 없으면 브라우저 기본값(16px)으로 잰다. 이 리뷰는 두 판을 견줘 갈랐다 | 같은 절 뒤 새 문단(또는 「수를 셀 때는 …」 의 화면 넘침 항목 옆) | «**테마 CSS 만 실은 정적 판은 토큰이 비어 크기가 실제와 다르다** — 테마 규칙은 `var(--wb-…)` 로 크기를 읽는다. `@wirebound/themes` 의 `tokensCss(manifest)` 를 먼저 싣고 잰다.» |

### 게이트 값

| 단계 | 값 |
| --- | --- |
| node | v24.21.0 |
| `pnpm typecheck` | rc 0 (08:09) |
| `pnpm vitest run --project api apps/api/test/source-control-bytes.test.ts`(보고 파일을 stage 한 판) | 4 중 통과 4 · 실패 0 · 건너뜀 0 |
| 보고 파일의 숨은 글자(제어 · 방향 제어 · 폭 없음 · U+2028/2029 · 서로게이트 · BOM) | 0 |
| 잠듦 | `pmset -g log` 의 마지막 `Sleep` 이 2026-10-23 20:47 — 이 리뷰의 탐침(10-24 05:48 –)과 게이트(08:09)와 안 겹친다 |
| 끝에 이 워크트리 경로의 vitest · vite · tsx · chrome | 0 |
