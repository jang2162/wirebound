# FX-POB 보고 — RV-POB 발견 고치기(파일첨부 · 반복 행 표)

브리프: `.worktrees/.coord/brief-fx-pob.md`(공통 규칙 `common-w13.md` · 키 `fx-pob`). 대상 `feat/attach`(시작 HEAD `ce719e01`). 워크트리 `feat-attach` · Postgres 5504 · api 3104 · node v24.21.0(모든 판). 리뷰 보고 `2026-10-27-rv-pob-report.md` 의 M1 · L1 ~ L4 를 고쳤다 — 다섯 다 고치기 전 빨강(또는 변조가 사는 값)을 먼저 보이고 고쳤다.

스크래치 뿌리 `S` = `/private/tmp/claude-501/-Users-jang2162-IdeaProjects-wirebound--worktrees-feat-attach/bb9b9f8e-f052-4fc0-8b16-3a1382c080fb/scratchpad`(재부팅에 지워진다 — 값은 이 보고의 표가 전부다). 변조 도구 `S/mut.py` — 맞은 수 1 일 때만 걸고, 백업 이름은 경로 전체(`/` → `__`) + 변조 키, 풀 때 `filecmp` 바이트 비교. 변조마다 겨눈 케이스 파일만 돌렸다(`--maxWorkers=25%` · 실브라우저 `--maxWorkers=1`). «실패 / 실행» 은 그 실행의 통과 + 실패(`-t` 로 좁힌 판도 같다).

## 바꾼 것

| 발견 | 커밋 | 파일 |
| --- | --- | --- |
| M1 · L2 | `e6aabc08` | `packages/theme-kit/src/check.ts`(`fileAttachProblems` · `focusReceivers`) · `packages/theme-kit/test/check.test.ts` · `packages/theme-kit/template/SKILL.md` · 정본 §(파일첨부 뷰) |
| L4 | `51f23880` | `packages/schema/src/component/preset.ts`(`templateNode`) · `packages/schema/src/clone.ts`(머리말) · `packages/schema/test/component/preset.test.ts` |
| L3 | `23d84895` | `apps/web/config/llms-txt.ts`(`propType` · `length`) · `apps/web/public/llms.txt`(다시 냄) |
| L1 | `1d7ef003` · `54fa9abe`(실브라우저 판) | `packages/schema/src/component/text-max.ts`(새 `propTextMax`) · `apps/web/src/panels/property-panel.tsx`(`PropControl`) · `apps/web/src/panels/controls/text-control.tsx`(`maxUnits` · `clampUnits`) · `apps/web/src/panels/controls/list-control.tsx`(`textMax` · `ITEM_PATHS`) · 케이스 넷 파일 · 정본 §(파일 목록) |

## M1 · L2 — `wb-theme check` 의 파일 줄 자리 · 조각 이름

### 재현(고치기 전)

`packages/theme-kit/test/check.test.ts` 의 깨는 뷰 픽스처(`fileAttachView`)를 SDK 기본 `FileAttachView` 와 같은 꼴로 넓혔다(단추 구역 `actions` 조각 · 머리 `checkHead` 칸 안 `checkbox` · 줄의 `check` 칸 안 `checkbox`) — 앞 케이스 37 은 그대로 초록. 리뷰어의 깨는 꼴을 새 케이스로 실었다.

| 판 | 시각 · 부하 | 실행 · 통과 · 실패 | 값 |
| --- | --- | --- | --- |
| 고치기 전 | 10:55:31 ~ 10:55:50 · 11.3 | 46 · 37 · 9 | 새 9 케이스 모두 `expected [] to deeply equal [표본 …]`(오류 0) — 줄을 표 밖 `div` · `span` 형제로 · `fileName` · `fileSize` · `checkHead` · `actions` 이름 바꿈 · 이름 · 크기 글 맞바꿈 · 단추 구역을 표 안(`caption`)에 · 체크 조각을 `<input type="checkbox">` 로(포커스 경고 0) |
| 고친 뒤 | 11:03 · — | 48 · 48 · 0 | 위 9 + 둘(`check` 칸 이름 바꿈 · `actions` 조각을 빈 상자로 두고 구역은 따로) |

### 고친 것

- **F1 에 자리** — `file` 조각은 `list` 표 몸통의 줄(`tbody > tr`, 그 `tbody` 의 부모가 그 `list` 표)이어야 한다. 아니면 «file 조각 N 개를 list 표의 몸통 줄(tbody > tr) 밖에 그렸습니다».
- **조각 이름** — 줄 수가 맞을 때 줄마다 `fileName` · `fileSize` 칸 하나씩이고 글이 그 파일의 이름 · 크기(문서 차례) · `check` 칸 안 `checkbox` 하나. 머리 줄에 `checkHead` 칸 안 `checkbox` 하나. «단추» 구역에 내용이 있으면 `actions` 조각 하나가 목록 표 밖에 있고 그 구역 상자(`data-wb-zone="actions"`)이거나 품는다.
- **체크 조각의 입력 칸은 포커스 경고** — 브리프의 두 길(기대 포커스 표에서 이 조각만 뺌 · 다른 길로 잼) 가운데 **다른 길**을 골랐다: `EXPECTED_FOCUS` 는 그대로 두고, 그림 조각(`[data-wb-component="FileAttach"] [data-wb-part="checkbox"]`)과 그 안의 요소가 단추 · 링크 · 입력 칸이면서 꺼지지 않았으면(`:disabled` 아님) 경고로 센다. 까닭: 표에서 `input` 을 빼면 값 칸의 입력 조각(입력 · 고르개 · 날짜) 전부가 경고로 서고, 그림 조각만 «입력 칸도 기대한 포커스가 아니다» 라는 판단이 이 자리에만 참이다. 꺼진 입력 칸은 포커스를 안 받아 경고가 아니다(경고 문장이 «누른 뒤 단축키가 막힌다» 라서 — 케이스가 꺼진 판 0 을 잠근다). 그리드의 선택 칸(`checkbox` · `radio` 조각)도 같은 그림 판단이지만 이 차수 밖이라 넓히지 않았다(«남은 것»).
- `check` 칸 규칙은 브리프의 다섯 조각 밖이다 — SDK 기본 CSS 가 `:is([data-wb-part="checkHead"], [data-wb-part="check"])` 로 폭을 잡아 같은 계약이라 넣었고 깨는 꼴 케이스를 함께 실었다.
- 1.8.0 기본테마는 파일첨부 뷰가 없어 SDK 기본 뷰로 그린다 — `system-themes/admin/build-test/wbtheme.test.ts` 의 «갤러리 칸 전부가 오류 없이»(`report.errors` = `[]`)가 새 규칙을 지나는지 잰다(«게이트»). 기본 뷰는 «기본 뷰 테마는 오류 0» · `focusables` `[]` 케이스가 잰다.

### 변조 표(`check.ts`)

| 변조 | 시각 · 부하 | 무엇 | 죽은 케이스 | 실패 / 실행 | 실패 값 |
| --- | --- | --- | --- | --- | --- |
| K1 | 10:58:59 ~ 10:59:20 · 21.4 | 표 밖 줄 규칙 끔(`astray.length > 0` → `false`) | 줄을 표 밖 `div` · `span` 둘 | 2 / 47 | `expected [] to deeply equal [표본 셋]` |
| K2 | 10:59:20 ~ 10:59:39 · 19.8 | `fileName` 칸 검사 뺌 | 이름 칸 조각 이름 | 1 / 47 | 같은 꼴 |
| K3 | 10:59:39 ~ 11:00:00 · 17.2 | `fileSize` 칸 검사 뺌 | 크기 칸 조각 이름 | 1 / 47 | 같은 꼴 |
| K4 | 11:00:00 ~ 11:00:23 · 19.0 | 칸 글 견줌을 «하나인가» 로(`got.length !== 1`) | 이름 · 크기 글 맞바꿈 | 1 / 47 | 같은 꼴 |
| K5 | 11:00:23 ~ 11:00:45 · 20.0 | 줄 `check` 칸 규칙 끔 | 줄 체크 칸 이름 | 1 / 47 | 같은 꼴 |
| K6 | 11:00:45 ~ 11:01:12 · 22.8 | 머리 `checkHead` 규칙 끔 | 머리 체크 칸 이름 | 1 / 47 | `expected [] to deeply equal [표본 다섯]` |
| K7 | 11:01:12 ~ 11:01:35 · 22.3 | `actions` 가 표 안인지 안 봄 | 단추 구역을 표 안에 | 1 / 47 | 같은 꼴 |
| K8 | 11:01:35 ~ 11:02:00 · 24.9 | `actions` 규칙 통째 끔 | 단추 구역 이름 · 표 안 둘 | 2 / 47 | 같은 꼴 |
| K9 | 11:02:00 ~ 11:02:23 · 25.6 | 그림 조각 경고 끔(`() => false`) | 체크 조각을 입력 칸으로 | 1 / 47 | `expected [] to deeply equal [표본 다섯]`(경고 0) |
| K10 | 11:02:23 ~ 11:03:03 · 21.7 | 꺼진 입력 칸도 셈(`:disabled` 거름 뺌) | 같은 케이스(꺼진 판) | 1 / 47 | `expected [ { type: 'FileAttach', … }, …(9) ] to deeply equal []` |
| K11 | 11:23:59 ~ 11:24:24 · 24.8 | `actions` 가 구역 상자인지 안 봄 | `actions` 조각을 빈 상자로 · 구역은 따로 | 1 / 48 | `expected [] to deeply equal [표본 다섯]` |

- K11 첫 판(11:03:40 · 부하 35.2)은 부하로 버리고 위 값으로 다시 쟀다(같은 케이스 · 같은 값). K1 ~ K10 은 부하 17 ~ 26.

## L4 — `templateNode` 의 props 얕은 복사

- **재현** — `packages/schema/test/component/preset.test.ts` «배열 · 객체 prop 도 깊게 베낀다» 를 먼저 실었다(지금 카탈로그 프리셋은 글 · 수 값뿐이라 테스트 안에서 `FileAttach` 템플릿에 `files` 배열을 실음). 고치기 전: 19 · 18 · 1 — `expected { files: [ {…}, {…} ], …(1) } to deeply equal { …(2) }`(넣은 노드의 목록에 더한 줄이 템플릿에 섰다). 첫 판(11:05:31)은 부하 55 라 고침을 되돌린 변조(P1 — 아래)로 11:23:39 · 부하 22.1 에 다시 쟀다 — 같은 값.

| 변조 | 시각 · 부하 | 무엇 | 죽은 케이스 | 실패 / 실행 | 실패 값 |
| --- | --- | --- | --- | --- | --- |
| P1 | 11:23:39 ~ 11:23:41 · 22.1 | 얕은 복사로 되돌림(`{ ...template.props }`) | «배열 · 객체 prop 도 깊게 베낀다» | 1 / 19 | 위 값 |
- **고친 것** — `node.props = cloneJsonValue(template.props)`. 브리프 문구는 `structuredClone` 등이었으나 노드 JSON 값을 베끼는 자리는 `packages/schema/src/clone.ts` 의 `cloneJsonValue` 하나로 둔다는 그 파일의 규칙(머리말 «왜 한 곳인가» — 한쪽만 깊어지는 갈림)을 따랐다. 머리말의 자리 목록에 `templateNode` 를 더했다.

## L3 — `/llms.txt` 의 글 한도

- **재현** — 고치기 전에 한도 상수를 바꾸는 변조가 대조 케이스(`apps/web/test/llms-txt.test.ts` «public/llms.txt 가 정의에서 지은 글과 같다» — 파일 스냅숏)에서 산다. 고치기 전 판은 `propType` 의 글 줄과 생성물의 두 줄을 함께 되돌린 변조로 세웠다(`S/mut2.py` — 같은 파일의 변조 여럿은 파일마다 백업 하나).

| 판 | 시각 · 부하 | 무엇 | 실패 / 실행 |
| --- | --- | --- | --- |
| 고치기 전 대조 | 11:25:21 ~ 11:25:23 · 20.1 | 되돌리기만 | 0 / 2(판이 맞게 섰다) |
| 고치기 전 + 이름 한도 200 → 199 | 11:25:23 ~ 11:25:24 · 20.1 | | **0 / 2 — 산다** |
| 고치기 전 + 크기 한도 20 → 19 | 11:25:24 ~ 11:25:26 · 20.1 | | **0 / 2 — 산다** |
| 고치기 전 + `maxSize` 한도 20 → 19 | 11:25:26 ~ 11:25:28 · 19.4 | | **0 / 2 — 산다** |

고친 뒤(같은 세 변조 + `propType` 의 글 줄 뗌):

| 변조 | 시각 · 부하 | 실패 / 실행 | 실패 값(스냅숏 차이 줄) |
| --- | --- | --- | --- |
| L3a 이름 200 → 199 | 11:25:35 ~ 11:25:37 · 19.1 | 1 / 2 | `name: string (≤ 199 chars)` |
| L3b 크기 20 → 19 | 11:25:37 ~ 11:25:39 · 18.9 | 1 / 2 | `size: string (≤ 19 chars)` |
| L3c `maxSize` 20 → 19 | 11:25:39 ~ 11:25:41 · 18.9 | 1 / 2 | `maxSize` 줄 |
| L3d `propType` 의 글 줄 뗌 | 11:25:41 ~ 11:25:42 · 18.9 | 1 / 2 | `{ name: string, size: string }` |

첫 판(11:06 ~ 11:07 · 부하 47 ~ 57)은 같은 값이었으나 부하로 버렸다.
- **고친 것** — `propType` 이 글(`type: 'string'`)에 `minLength` · `maxLength` 를 편다(`string (≤ 200 chars)` · 둘 다면 `(a–b chars)`). 브리프 문구는 «`schemaOf` 가 편다» 였는데 `schemaOf`(zod `toJSONSchema`)는 이미 `maxLength` 를 내고 있었다 — 버린 것은 그 값을 글로 옮기는 `propType` 이라 거기를 고쳤다. 생성물은 `pnpm vitest run apps/web/test/llms-txt.test.ts -u` 로 다시 냈다 — 바뀐 줄은 둘(`files` · `maxSize`) 뿐이다.
- 대조 케이스는 한도를 정의(`FileEntrySchema` · `FileAttachDef`)에서 읽어 싣는다 — 글자로 옮겨 적은 자리가 없다.

### 카탈로그의 글 한도 셈(셋으로)

| 방법 | 값 |
| --- | --- |
| `git grep -nP 'z\.string\(\)[^,)]*\.(max\|min\|length)\(' -- packages/schema/src/component/catalog` | 2 줄(`input.ts:379` 이름 · 크기 한 줄 · `input.ts:400` `maxSize`) = 자리 3 |
| 파이썬 정규식(`catalog/*.ts` 의 `z.string()….(max\|min\|length\|nonempty)(`) | 3 |
| 실물 — 정의 36 개의 `toJSONSchema({ io: 'input' })` 를 걸어 `type: string` 에 `maxLength` · `minLength` 가 있는 자리(`S/walk.ts` · `tsx`) | 3 — `FileAttach/files/items/name` 200 · `…/size` 20 · `maxSize` 20 |

다른 카탈로그 prop 에는 글 한도가 없다(셋 다 파일첨부 셋). `llms.txt` 의 `chars)` 도 2 줄 · 3 자리.

## L1 — 에디터 칸이 글 한도를 미리 막는다

### 고친 것

- **한도는 정의에서 읽는다** — `packages/schema` 의 새 `propTextMax(def, path)`: 정의의 zod 를 `toJSONSchema({ io: 'input' })` 로 한 번 지어(정의마다 `WeakMap`) prop 이름 뒤 `'[]'`(배열 원소) · 칸 이름 경로의 `maxLength` 를 돌려준다. 글자로 옮겨 적지 않는다.
- **단위는 UTF-16 이다** — zod `.max()` 는 `length`(UTF-16)로 센다(`node_modules/.pnpm/zod@4.4.3/…/v4/core/checks.js` 의 `$ZodCheckMaxLength`). 그래서 별칭 칸의 코드 포인트 장치(`maxLength` · `clampPoints`)를 쓰지 않고 `TextControl` 에 `maxUnits` 를 더했다: 입력창의 `maxLength` 를 그 값 그대로 걸고(같은 단위), `onChange` 가 `clampUnits`(넣은 글만 자름 · 끝 글자를 안 밀어냄 · 글자를 반으로 안 가름 — `clampPoints` 와 한 몸 `clampBy`)로 막는다. 코드 포인트로 막으면 한도 근처의 이모지가 칸을 지나 422 다.
- **속성 패널** — `PropControl` 이 정의(`def`)를 받아 글 칸(`text` · `textarea`)에 `maxUnits={propTextMax(def, [prop])}`, 목록 칸에 `textMax` 를 넘긴다. 목록 위젯은 칸(`key` · `value`)이 원소의 어느 자리인지 표(`ITEM_PATHS` — 파일 `name` · `size` · 키-값 `key` · `value` · 선택지 `label` · 글 목록 원소 자신)로 물어 입력창 `maxLength` 와 `clampUnits` 를 건다. 한 번 고른 판 · 일괄 편집 둘 다다.
- 정본 §(파일 목록) 에 한 문장(«이름 · 크기와 `maxSize` 는 글 한도가 있다 … 속성 패널의 글 칸 · 목록 칸은 … 그 한도에서 막고 … `/llms.txt` 도 같은 한도를 싣는다»).

### 재현 · 잰 값(jsdom)

`apps/web/test/panels/file-list-control.test.tsx` 새 케이스 둘 — 한도는 `FileEntrySchema.shape.{name,size}.maxLength` · `FileAttachDef` 의 `maxSize` 에서 읽는다.

| 판 | 시각 · 부하 | 실행 · 통과 · 실패 | 값 |
| --- | --- | --- | --- |
| 고치기 전 | 11:10:18 · 33.7(버림) → 11:23:45 ~ 11:23:59 · 20.9(고침의 배선 `textMax` 를 «늘 없음» 으로 되돌린 변조) | 8 · 6 · 2 | 칸 `maxLength` `[-1, -1]`(≠ `[200, 20]`) · «최대 크기» `-1`(≠ 20) |
| 고친 뒤 | 11:11 · 25.7 | 21 · 21 · 0(이 파일 + `text-clamp` + `text-max`) | — |

### 변조 표(L1)

겨눈 파일: `file-list-control.test.tsx` · `text-clamp.test.ts` · `packages/schema/test/component/text-max.test.ts`.

| 변조 | 시각 · 부하 | 무엇 | 죽은 케이스 | 실패 / 실행 | 실패 값 |
| --- | --- | --- | --- | --- | --- |
| T1 | 11:12:57 ~ 11:13:02 · 22.1 | 글 칸에 한도 안 넘김(`maxUnits={undefined}`) | «최대 크기» 칸 | 1 / 21 | `expected -1 to be 20` |
| T2 | 11:13:02 ~ 11:13:06 · 21.2 | 목록 칸에 한도 안 물음(`textMax?.(path)` → `undefined`) | 이름 · 크기 칸 | 1 / 21 | `expected [ -1, -1 ] to deeply equal [ 200, 20 ]` |
| T3 | 11:13:06 ~ 11:13:12 · 20.9 | 목록 칸의 `clampUnits` 뗌(입력창 `maxLength` 는 남김) | 이름 · 크기 칸 | 1 / 21 | `… to have a length of 200 but got 205` |
| T4 | 11:13:12 ~ 11:13:17 · 20.1 | 글 칸의 `clampUnits` 뗌 | «최대 크기» 칸 | 1 / 21 | 낸 값 `'m' × 21` |
| T5 | 11:13:17 ~ 11:13:22 · 19.5 | 글 칸의 입력창 `maxLength` 뗌 | «최대 크기» 칸 | 1 / 21 | `expected -1 to be 20` |
| T6 | 11:13:22 ~ 11:13:31 · 19.7 | `clampUnits` 를 코드 포인트로 셈 | 이름 · 크기 칸(이모지 줄) · `clampUnits` 둘 | 3 / 21 | 이모지가 한 단위 남은 칸에 들어감 |
| T7 | 11:13:31 ~ 11:13:38 · 21.7 | `propTextMax` 가 `'[]'` 를 못 걸음 | 이름 · 크기 칸 · `propTextMax` 글 셋 · 셈 | 3 / 21 | `[ undefined, undefined, 20 ]` · `[ 'FileAttach.maxSize' ]` |
| T8 | 11:13:38 ~ 11:13:43 · 22.3 | 파일 칸 경로를 맞바꿈(이름 ↔ 크기) | 이름 · 크기 칸 | 1 / 21 | `expected [ 20, 200 ] to deeply equal [ 200, 20 ]` |
| T9 | 11:14:04 ~ 11:14:06 · 22.2 | 카탈로그에 글 한도 하나 더함(`Button.label` `.max(30)`) | `propTextMax` 셈(파일첨부 셋뿐) | 1 / 3 | 넷째 자리 |
| T10 | 11:14:06 ~ 11:14:08 · 22.2 | 정의 없음 가드 뗌 | `propTextMax` «정의 없음은 undefined» | 1 / 3 | `TypeError: Cannot read properties of undefined (reading 'props')` |

- `propTextMax` «파일첨부의 글 셋» 은 혼자 죽는 변조가 없다 — `propTextMax` 를 깨는 변조는 웹 칸 케이스와 함께 죽는다(T7). 그 케이스는 `propTextMax` 가 정의의 zod 값(`FileEntrySchema` · `FileAttachDef`)과 같은 값을 내는지를 패키지 안에서 잰다 — 웹 칸 쪽 축은 «이름 · 크기 칸은 스키마의 글 한도에서 막는다» 가 갖는다.
- T10 은 값이 아니라 `TypeError` 로 죽는다 — 그 케이스가 재는 성질(정의가 없으면 던지지 않고 `undefined`)이 바로 그것이다.

### 실브라우저(`apps/web/build-test/palette-preset.test.ts` «파일 이름 · 크기 · «최대 크기» 칸은 글 한도에서 멈춘다»)

파일 하나(`통장사본.pdf` · `2.1 MB`)인 파일첨부를 고르고: ① 이름 칸에 한도 + 5 자를 클립보드로 붙여 넣고(`ControlOrMeta+A` → `ControlOrMeta+V`) Enter ② 크기 칸에 한도 + 3 자를 한 글자씩 치고 Enter ③ «최대 크기» 칸(문서에 없는 prop)에 한도 + 1 자를 붙여 넣고 Enter ④ 이름 칸을 `가` × (한도 − 1)로 채우고 이모지 하나를 `insertText` 로 친 뒤 Enter. 걸음마다 서버 값이 바뀌거나 `patch-error` 프레임이 올 때까지 기다리고(거절 수는 누르기 전에 센다), 끝에 칸 글 · 서버 값 · 거절 수를 한 번에 견준다. 한도는 정의에서 읽는다.

| 판 | 시각 · 부하 | 칸 글 길이(①②③ · ④ 이모지 안 들어감) | 서버 값 | 거절(`patch-error`) |
| --- | --- | --- | --- | --- |
| 고친 뒤 | 11:18:16 ~ 11:18:31 · 24.8 | 200 · 20 · 20 · 참 | `n` × 200 · `s` × 20 · `m` × 20 · `가` × 199 | 0 |
| 고치기 전(B1 — `PropControl` 의 `textMax` 를 «늘 없음» 으로) | 11:22:24 ~ 11:22:39 · 24.2 | **205 · 23 · 21 · 거짓**(이모지가 들어가 201 단위) | **`통장사본.pdf` · `2.1 MB` · 없음 · 거짓**(넷 다 안 바뀜) | **4** |

- 고치기 전 판은 걸음마다 422 → 다시 불러오기로 친 글이 사라진다 — 리뷰 보고 «잰 값» 3 의 B · D 판과 같은 길. 이모지 판(④)이 UTF-16 단위의 하중을 보인다: 코드 포인트로 막으면 `가` × 199 + 이모지 = 200 코드 포인트 · 201 단위라 칸을 지나 422 다(jsdom 변조 T6 이 같은 자리를 잰다).
- B1 의 첫 두 판은 버렸다 — 11:18:42(부하 29.0)는 폴이 거절 수를 누른 뒤에 세어 거절 프레임이 폴보다 먼저 닿아 값 없는 시간 초과로 죽었고(케이스를 고쳐 누르기 전에 세게 했다), 11:19:51 은 부하 41.4 였다(값은 같았다).
- 실행 1 · 건너뜀 3(같은 파일의 다른 케이스 — `-t` 로 좁힘).

## 브리프 문구를 고친 방향

| 발견 | 브리프 문구 | 고친 방향 · 까닭 | 문구 그대로의 판 |
| --- | --- | --- | --- |
| M1 | 파일 줄이 `list` 표의 몸통 줄(`tr`) 안에 있는지 | 그대로 — `file` 조각 자신이 `tbody > tr` 이고 그 `tbody` 가 그 `list` 표의 것 | — |
| L2 | 조각 이름을 그 자리에서 센다 · 체크 입력 칸은 경고 | 그대로 + `check` 칸(SDK CSS 가 같은 셀렉터로 잡는다). 체크 입력 칸은 **기대 포커스 표를 안 바꾸고** 그림 조각 안만 따로 센다 · 꺼진 입력 칸은 뺀다(«고친 것» 의 까닭) | 표에서 `input` 을 빼면 기본 뷰 테마의 «`focusables` `[]`» 케이스가 죽을 꼴이다(값 칸 입력 조각) — 그 판은 짓지 않았다(표 밖 선택) |
| L1 | 스키마의 글 한도를 `TextControl` 의 `maxLength` 로 | `maxUnits`(UTF-16)를 새로 두고 그쪽으로 — `maxLength` 는 코드 포인트(별칭용 · 입력창 속성 2 ×)라 zod 한도와 단위가 다르다 | 변조 BL(11:33:25 ~ 11:33:29 · 부하 9.5): «최대 크기» 칸 `maxLength` `40`(≠ 20) — 1 / 8. 코드 포인트로 막으면 이모지 섞인 글이 한도 근처에서 칸을 지나 422 다(실브라우저 B1 의 ④ · jsdom T6) |
| L3 | `schemaOf` 가 문자열 최대 길이를 편다 | `propType` — `schemaOf` 는 이미 `maxLength` 를 냈고 글로 옮기는 자리가 버렸다 | `schemaOf` 를 고칠 자리가 없다(바꿀 것 없음) |
| L4 | `structuredClone` 등 | `cloneJsonValue` — 노드 JSON 값 복사는 한 곳(`clone.ts` 머리말) | `structuredClone` 도 같은 케이스를 지난다(템플릿은 JSON 값뿐) — 짓지 않았다 |

## 게이트

`README.md` 「트랙 게이트」 의 `packages/*` 줄은 전량 넷이지만 브리프가 이 차수의 전량을 막았다(PO-A 병합 뒤 옮기는 차수에서 돈다) — 건드린 경로(`packages/theme-kit` · `packages/schema` · `apps/web`)의 영역 게이트를 돌았다. 체인 `S/gate.zsh`(`nohup nice -n 10 caffeinate -i` · 단계마다 1분 부하 30 미만을 기다림 · `rc` 를 명령 바로 뒤에 잡음).

| 단계 | 시각 | 부하(시작 → 끝) | rc | 실행 · 통과 · 실패 · 건너뜀 |
| --- | --- | --- | --- | --- |
| `pnpm typecheck` | 11:25:56 ~ 11:26:15 | 17.0 → 16.0 | 0 | — |
| `pnpm build` | 11:26:15 ~ 11:26:22 | 16.0 → 16.0 | 0 | — |
| `pnpm vitest run --project unit --maxWorkers=25%` | 11:26:22 ~ 11:26:49 | 16.0 → 15.9 | 0 | 167 파일 · 2647 · 2647 · 0 · 0 |
| `pnpm vitest run --project web --maxWorkers=25%` | 11:26:49 ~ 11:29:14 | 15.9 → 17.0 | 0 | 213 파일 · 3415 · 3415 · 0 · 0 |
| `pnpm vitest run --project build packages/theme-kit/build-test system-themes/admin/build-test apps/web/build-test/export-bundle.test.ts` | 11:29:14 ~ 11:30:52 | 17.0 → 13.3 | 0 | 8 파일 · 58 · 57 · 0 · 1(`template.test.ts` «저장소 밖에서 설치하고 빌드한다» — `WB_TEMPLATE_INSTALL=1` 일 때만) |
| 실브라우저 `-c vitest.browser.config.ts` `palette-preset` · `file-attach-narrow` · `node-alias` · `n19-notices` · `compose-input` · `layout-weight` `--maxWorkers=1` | 11:30:52 ~ 11:32:43 | 13.3 → 12.8 | 0 | 6 파일 · 34 · 33 · 0 · 1(`layout-weight` «스크린숏 —» — 스크린숏 경로를 줄 때만) |
| `pnpm lint` | 11:32:43 | 12.8 | 0 | 경고 넷 — 모두 이 트랙이 안 건드린 파일 |

- node v24.21.0(체인 상태 파일 첫 줄 · 변조 판도 같은 셸).
- 1.8.0 기본테마의 새 규칙 통과 — `system-themes/admin/build-test/wbtheme.test.ts` 4 · 4(«갤러리 칸 전부가 오류 없이 그려진다» = `report.errors` `[]`). SDK 기본 뷰 — `packages/theme-kit/test/check.test.ts` «기본 뷰 테마는 오류 0»(`focusables` `[]` 포함).
- 실브라우저 여섯 파일 가운데 `palette-preset` · `file-attach-narrow` 는 파일첨부 판, `node-alias` · `n19-notices` 는 `TextControl` 의 코드 포인트 한도(`clampPoints` 를 `clampBy` 로 옮겼다), `compose-input` · `layout-weight` 는 속성 패널의 목록 칸 · 글 칸 판이다.
- 잠듦: `pmset -g log | grep ' Sleep '` 의 마지막 줄은 10:23:55 · 10:24:07(덮개 — 이 세션 시작 10:52 전)이라 이 보고의 모든 판(10:55 ~ 11:33)과 안 겹친다. 끝에 잰 전원은 AC(충전 중).
- `pnpm fmt` 는 커밋마다 lefthook `pre-commit` 이 바뀐 파일에 돌렸다.
- 끝(11:34)에 이 워크트리 경로의 vitest · vite · tsx · Chrome 0 · 포트 3104 LISTEN 0 · 게이트 · 변조 스크립트 0. 실브라우저 판은 `editor-stack` 이 판마다 스택을 세우고 거뒀다(`afterAll` 의 `after` = `{ processes: 0, listeningPorts: [], databases: 0 }`). DB 컨테이너(5504)는 남겼다.

## 남은 것

- **그리드 선택 칸의 그림 조각**(`DataGrid` 의 `checkbox` · `radio`)도 같은 «체크는 그림» 판단인데 입력 칸으로 그린 뷰는 경고가 없다 — 원래 있던 규칙(`EXPECTED_FOCUS`)이고 이 차수 밖이라 넓히지 않았다. 넓히면 `PICTURE_PART` 에 그 셀렉터를 더하고 그리드 깨는 뷰 케이스를 함께 싣는다(L).
- **빈 목록 안내(`drop`)의 자리** — 표 밖 `<p>` 로 그려도 지난다. 열 머리와 이어질 데이터가 아니라 표 밖 안내도 뜻이 서서 규칙으로 안 막았다(L · 설계가 정하면 F2 에 자리를 더한다).
- **정본의 별칭 칸 문장이 낡았다** — `docs/superpowers/specs/2026-08-03-wirebound-design.md` «별칭 고치기» 의 «칸은 UTF-16 단위로 세어 이모지 같은 글자는 둘로 센다 — 서버의 코드 포인트 한도보다 빡빡한 쪽이라 받은 글이 잘리는 일은 없다» 는 지금 코드와 다르다 — 별칭 칸은 코드 포인트로 막는다(`apps/web/src/panels/controls/text-control.tsx` 의 `maxLength` 머리말 · `clampPoints` · L-241). 이 트랙 밖이라 고치지 않았다. 넣을 문장: «속성 패널의 별칭 칸은 61자째를 받지 않고 «60자까지» 를 자리표로 말한다(칸은 서버와 같은 코드 포인트로 센다 — 이모지 하나가 한 글자).»
- 리뷰 보고 «결함으로 세지 않은 것» · 이월 줄(겹침 · 한도 넘음의 꼴 · 격자 2열 390 꺾임)은 그대로다.

## 지침

1. **한 변조가 같은 파일을 여러 곳 바꾸면 백업은 파일마다 한 번, 첫 변경 전에 뜬다.** 변경마다 같은 이름(경로 + 변조 키)으로 뜨면 둘째 백업이 반쯤 바뀐 판을 덮어 쓰고, 바이트 비교도 그 판과 해 틀린 복원이 «같음» 으로 통과한다 — 생성물 `apps/web/public/llms.txt` 의 한 줄이 되돌린 채 남았고 `git status` 로 잡았다. `.ruler/30-delegation.md` 「변조를 `git checkout` 으로 되돌리지 않게 한다」 문단의 «백업 이름은 경로 전체로 짓는다 — … 틀린 복원이 통과한다.» 뒤에 넣을 문장:
   > **한 변조가 같은 파일 여러 곳을 바꾸면 백업은 파일마다 한 번, 첫 바꿈 전에 뜬다** — 바꿈마다 같은 이름으로 뜨면 둘째 백업이 반쯤 바뀐 판을 덮고 바이트 비교도 그 판과 해 «같음» 으로 통과한다(`docs/superpowers/plans/2026-10-27-fx-pob-report.md` 「지침」).
2. **생성물과 견주는 케이스의 «고치기 전» 판은 생성물도 고치기 전으로 되돌린다.** 고친 생성물(`llms.txt` 스냅숏)을 둔 채 생성기만 되돌리면 어느 변조든 스냅숏 차이로 죽어 «고치기 전에도 잡았다» 로 읽힌다(첫 재측정이 그렇게 섰다). 같은 문서 「고치기 전 값이 필요한데 케이스가 이미 고친 소스에 맞춰 있으면 …」 문장 뒤에 넣을 문장:
   > 그 케이스가 생성물(스냅숏 파일)과 견주면 생성물의 바뀐 줄도 같은 변조에서 고치기 전으로 되돌린다 — 고친 생성물을 둔 판은 무엇을 바꿔도 스냅숏 차이로 죽는다.
3. **실패 쪽 신호를 끝 조건에 넣는 폴은 그 신호의 수를 누르기 전에 센다.** 거절 프레임(`patch-error`)이 폴을 부르기 전에 닿아, 폴 안에서 센 기준이 이미 그 거절을 품고 «안 섰다» 시간 초과로 값 없이 죽었다(`apps/web/build-test/palette-preset.test.ts` «글 한도» 의 `landed`). 같은 문서 「실브라우저 판은 `apps/web/build-test/` 에 케이스로 잠근다」 문단의 «서버에 닿기를 기다리는 폴은 실패 쪽 신호(건너뜀 · 거절 통지)도 끝 조건에 넣는다 — …» 뒤에 넣을 문장:
   > 그 신호의 기준 수는 누르기 전에 센다 — 거절 프레임은 폴을 부르기 전에 닿을 수 있다(`apps/web/build-test/palette-preset.test.ts` 의 `landed`).
4. **카탈로그 prop 의 글 한도와 에디터 칸의 셈 단위가 다르다** — zod `.max()` 는 UTF-16(`length`)이고 별칭 · 상태 이름 한도는 코드 포인트다. 지침 문장이 아니라 코드가 든다(`packages/schema/src/component/text-max.ts` 머리말 · `TextControl` 의 `maxUnits`). 새 글 한도를 카탈로그에 두면 `packages/schema/test/component/text-max.test.ts` «… 파일첨부 셋뿐이다» 가 죽어 칸이 막는지 보게 한다.
