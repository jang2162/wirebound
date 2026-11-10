# RV-CC — 공통코드 리뷰 보고

브랜치 `feat/common-codes`(머리 `2b86145e`) · 기준 main `fb033e4a` · 설계 `docs/superpowers/specs/2026-11-10-common-codes-design.md` · 계획 `docs/superpowers/plans/2026-11-10-common-codes.md` · 구현 보고 `docs/superpowers/plans/2026-11-10-cc-report.md`.

리뷰어 판이다 — 소스는 안 고쳤다. 탐침은 스크래치(`…/scratchpad/probe/`)에서 돌렸고 원문을 아래에 옮긴다.

## 발견 (무게 차례)

«새 장치가 연 길 / 원래 있던 길» — 아래 발견은 모두 이 브랜치가 더한 `code` 칸 · 표에서 난다. main 에는 `WbNode.code` 가 없어(봉투가 모르는 키로 거절) main 사본으로 같은 판을 세울 수 없다 — **전부 새 장치가 연 길**이다. 그래서 main 사본 대조는 돌리지 않았다.

높은 무게(인가 우회 · 남의 화면 · 데이터를 잃음 · 겹친 잠금 · 사용처 누락)는 **찾지 못했다** — 사용처는 여섯 자리를 다 세고(P4 B), 권한 · 잠금 판은 맞았다(P4 A · D). 맨 위는 반-목표(«출력마다 다른 이름») 쪽의 중간 둘이다.

### M1 (중간) — 구조 트리 줄이 표를 안 받는다: 이름을 바꾸면 캔버스와 트리 줄이 갈린다

- **재현:** P3(jsdom 에디터) — 표의 이름 «새 이름», prop 대체 글 «옛 이름» 인 묶인 `Affix`. 캔버스 iframe 글은 «새 이름», 구조 트리 줄은 `Affix 옛 이름`.
- **까닭:** `apps/web/src/panels/structure-tree.tsx:460` 의 `nodeSummary(node)` 가 표 인자 없이 부른다(`nodeSummary(node, codes?)` — `packages/schema/src/display.ts`). 이 파일은 `useProjectCodes` 를 안 읽는다. 줄 단추의 접근 이름 · 줄 행동(`+` · `…`)의 이름도 같은 `rowLabel` 이라 함께 낡는다.
- **설계:** 「그리기」 «요약(`summary`) · 구조 트리 줄 · `nodeDisplayName` 도 풀린 이름을 쓴다». 구현 보고 «결정» 에 이 자리를 뺀다는 말이 없다.
- **같은 꼴의 다른 자리**(`nodeDisplayName` · `nodeSummary` · `nodeRowLabel` · `describeNode` 를 표 없이 부르는 곳 — `git grep -nP '\b(nodeDisplayName|nodeSummary|nodeRowLabel|describeNode)\('` 로 셈):
  - `apps/web/src/panels/interaction-panel.tsx:236` · `:695` — 상호작용 패널의 노드 이름 · 대상 목록(구현 보고 «남은 것» 의 문장 사슬과 한 뿌리).
  - `packages/exporter/src/bundle/comments.ts:105` — 번들 코멘트 칸의 노드 이름(낮음).
  - `apps/web/src/panels/remove-state-dialog.tsx:75` — 상태 지우기 상자의 줄 이름(낮음).
  - `packages/schema/src/lint/codes.ts:20` · `lint/design.ts:185` · `:211` — lint 문장의 노드 이름(낮음 — 끊긴 참조 문장은 대체 글이 맞다).
- **무게 까닭:** 반-목표 «서로 다른 이름» 의 한 꼴이다. 데이터는 안 잃고 캔버스 · 번들 · `page get` 은 맞다.

### M2 (중간) — 사용처 목록의 노드 이름이 대체 글이다(공통코드 화면 · CLI `codes usage` · MCP `code_usage`)

- **재현:** P2(`codeUsage` 직접) — 표 «입금 대기» · prop «결제 대기» 인 `Button` 의 사용처 이름이 `결제 대기 버튼`. P4 B(REST `GET …/codes/usage`) — 여섯 노드 모두 «옛 이름 …».
- **까닭:** `packages/schema/src/codes-usage.ts:43` 의 `nodeDisplayName(node)` 가 표를 안 받는다(`codeUsage(sources, group, item?)` 에 표 인자가 없다). 서버 · CLI · MCP 가 이 한 벌을 지나므로 셋이 함께 낡는다.
- **왜 중간인가:** 사용처 목록은 이 기능의 목적(«고칠 곳 찾기») 그 화면이다. 이름을 바꾼 직후 사람이 보는 목록이 화면에 없는 옛 이름으로 노드를 부른다. 노드 id · 링크는 맞아 찾아가는 데는 지장이 없다.

### M3 (중간) — 묶인 입력 노드의 «종류 바꾸기» 가 `invalid-code-ref` 문서를 만들어 서버가 422 로 거절한다

- **재현:** P1 — `changeKindOps`(`apps/web/src/edit/change-kind.ts`)는 봉투 필드를 안 건드려 `code` 가 그대로 남는다. 다섯 판 중 넷이 편집 전 오류 0 → 편집 뒤 `invalid-code-ref`: 묶인 `Select` → `TextArea`(받지 않는 타입) · → `Input`(대표 글 타입인데 `item` 없음) · `CheckboxGroup` 고름 둘 → `RadioGroup`(하나 고르는 타입) · 묶인 `Input` → `Select`(`item` 이 든 참조). `Select` → `CheckboxGroup` 만 산다.
- **서버:** `apps/api/src/services/edit-pipeline.ts` 6단계 — `validatePage(after)` 의 error 면 `invalid`(422). 그래서 종류 바꾸기 상자(`panels/structure-toolbar.tsx:383`)가 낸 편집이 거절된다. 실브라우저로 거절 · 되싣기 · 뒤에 줄 선 편집의 운명은 안 쟀다(남은 것).
- **고칠 방향(제안):** 종류 바꾸기가 `code` 를 새 타입의 선언에 맞춰 옮기거나(같은 `kind` 이고 하나 고르기 규칙을 지나면 남기고, 아니면 `remove …/code` + 그때 표의 이름을 prop 으로 — 풀기와 같은 묶음) 묶인 동안 상자에서 그 종류를 끈다. 어느 쪽이든 설계 판단이라 코디네이터 몫이다.

### M4 (중간 · 읽기로만) — 공통코드 화면의 지우기가 화면을 연 때의 사용 수로 «묻지 않고 지울지»를 정한다

- **까닭:** `apps/web/src/codes/codes-screen.tsx` 의 `askDelete` 가 `counts`(목록을 읽을 때 · 이 화면의 쓰기 뒤 다시 읽음)가 0 이면 사용처를 다시 묻지 않고 곧바로 지운다. 이 화면은 룸에 안 든다(구현 보고 «결정» «이 화면은 룸에 안 든다»). 화면을 연 뒤 다른 탭 · 다른 사람이 그 항목을 묶으면 사용 수가 낡은 0 이라 확인 없이 지워진다.
- **설계:** «쓰이는 항목 · 그룹을 지울 때는 영향 목록을 보이고 확인을 받는다». 끊긴 참조는 캔버스 · lint 에 보이므로 «조용히 끊김» 은 아니다.
- **재현은 안 했다**(코드가 한 갈래라 읽기로 적는다). 다음 차수가 잴 판: 화면을 연 뒤 행을 직접 넣어 묶고(`PATCH …/ops`) «삭제» → 확인 상자가 안 서고 `DELETE` 가 나가는지.
- **고칠 방향(제안):** 지우기 전에 늘 `codeUsage` 를 한 번 묻는다(0 이면 묻지 않고 지운다).

### L1 (낮음) — 묶기 · 고르기 · 풀기의 전제(노드 값 `test`)가 자손까지 덮는다 — `TabPanel` 은 탭 안의 남의 편집에도 버려진다

- `apps/web/src/edit/code-ops.ts` 의 `premise` 가 `structuredClone(node)` 통째(자식 포함)를 `test` 한다. 대표 글 타입 가운데 `TabPanel` 만 몸통이 있어, 그 사이 남이 탭 안의 아무 노드를 고쳐도 묶기 · 풀기가 리베이스에서 버려진다. 안전 쪽의 거짓 거절이라 낮음. 안 쟀다.
- 그 전제를 `id` 하나로 줄인 변조(E1)는 죽지만, 죽인 것은 연산 꼴 단언(`toMatchObject({ op: 'test', path })`)이다 — 겹친 편집을 재는 케이스가 없어, 전제의 **값**(자손까지 · 칸 하나만)을 바꾸는 변조는 재는 자가 없다. AGENTS.md «문서 편집 묶음에 `test` 를 더하는 고침의 경주 케이스는 …» 가 바라는 판(남의 설명이 내 화면에 닿기 전에 · 있던 칸을 바꾸는 픽스처)이 이 묶음에는 없다.

### L2 (낮음) — `ViewItem.props` 는 표로 안 푼다

- `packages/renderer/src/render.tsx` 의 `itemOf` 가 자식 props 를 `rawProps` 로 파싱한다 — 부모 뷰가 묶인 자식의 대표 글을 `items[i].props` 로 읽으면 대체 글이다. 지금 SDK 기본 뷰 · 기본테마는 탭 머리를 `item.element`(풀린 그림)로 그려 화면엔 안 나온다(`git grep -nP '(item|entry|child)\.props'` — 읽는 것은 그리드 열 · 셀의 비묶음 칸뿐). 테마 계약의 빈칸으로만 적는다.

### L3 (낮음) — 시연의 `setProp` 이 묶인 prop 을 덮어도 표가 이긴다

- `render.tsx` 의 `codeProps` 가 겹layer 뒤에 표의 이름을 덮는다(주석 «상호작용 겹layer 가 묶인 prop 을 덮어도 표가 이긴다»). 묶인 `Button.label` 을 `setProp` 으로 바꾸는 상호작용은 뷰 모드 · 번들에서 아무 일도 안 보인다. 설계가 정하지 않은 자리다.

### L4 (낮음) — 패널의 «이 코드를 쓰는 곳 N» 은 막 묶은 편집보다 먼저 물을 수 있다

- `panels/code-binding.tsx` 의 `UsageLink` 는 그 칸이 설 때 한 번 `codeUsageCounts` 를 묻는다. 묶기 편집(WS)의 커밋보다 조회가 먼저 닿으면 N − 1 을 보이고, 다시 고를 때까지 그대로다. 안 쟀다.

### 맞은 것(확인한 판)

- **사용처(항목 1):** 페이지 · 레이아웃 · 프로젝트 모듈 · 구역(`Card.headEnd` — schema 케이스) · 숨은 상태 · 탭 패널(묶인 패널 + 안) · 그리드 열 셀 틀 · 그리드 행 › 칸을 REST 사용처 · 사용 수가 같은 수(6)로 센다(P4 B). 개인 모듈은 안 센다(api 케이스). 서버 · CLI · MCP · 번들 장이 `codeUsage` · `codeUsageCounts` 한 벌을 지난다 — CLI `packages/cli/src/codes.ts` 가 `GET …/usage` · `…/usage-counts` 를 부르고 MCP `code_usage` · `list_codes` 가 그 함수를 부른다(`git grep -n 'codeUsage'`).
- **권한(항목 4):** P4 A — editor 토큰 쓰기 201 · viewer 토큰 쓰기 403 · 다른 프로젝트의 토큰 404 · editor → viewer 강등 뒤 같은 토큰 쓰기 403(읽기 200) · 멤버에서 뺀 viewer 토큰 404. 코드 라우트는 토큰을 받아야 하는 라우트(CLI · MCP)라 `:projectId` 가 맞다(`auth/plugin.ts` 머리말 표).
- **잠금(항목 3):** 쓰기의 차례 «프로젝트 행 `FOR NO KEY UPDATE` → 코드 행 → 재확인» 은 트리 쓰기와 같은 방향이고, 복원 · 프로젝트 삭제는 프로젝트 행 `FOR UPDATE` 가 먼저다. 삭제 뒤에 선 쓰기 셋이 404(P4 D). 강등 겹침은 `guard-in-lock`(구현 보고 변조 12 · 24), 복원 중 막힘은 `restore-lock-census` 가 잰다. 고리를 만드는 차례는 찾지 못했다 — 순서를 뒤집은 판은 코드 쓰기에 «자기 행 먼저» 길이 없어 세울 것이 없었다.
- **들이는 입구(항목 6):** 붙여넣기(`shell/editor-keys.tsx`) · 모듈 넣기(`palette/module-tab.tsx`) · 페이지 JSON 가져오기(`panels/page-json-notices.tsx`) 셋이 통지를 낸다(`pasteOps` · `moduleInsertOps` 의 부르는 자리는 그 하나씩). 다른 프로젝트 클립보드는 붙여넣기와 같은 길이다. 모듈 저장(`module/save.ts`)은 `marker` · `visibility` 만 걷고 `code` 를 남긴다. 복제 · 붙여넣기 사본(`copyNode` · `remapNodeIds`)이 `code` 를 옮긴다.
- **스냅샷(항목 7):** 판 4 복원 · 판 3 복원 · 안전망이 덮기 전 표를 담음은 api 케이스, 안전망을 다시 복원하면 표가 복원 전으로 돌아옴은 P4 C.
- **풀기(항목 5):** 표에서 이름을 바꾼 뒤 풀면 새 이름이 prop 에 남는다(웹 케이스 · 구현 보고 변조 9). 끊긴 참조를 풀면 prop 이 그대로다(`unbindCodeOps` 의 `label !== null` 갈래).

## 혼자 죽는 변조

Review Focus 다섯 + 편집 묶음 전제. 대본 `…/scratchpad/probe/mut/run.py`(백업 이름 = 경로 전체 · 찾는 글자 맞은 수 1 확인 · `cp` 복원 뒤 `cmp`), 변조마다 그 케이스 파일만. 끝에 `git status` 는 이 보고 파일뿐(`.build/` 는 앞부터 있던 것).

| # | 변조 | 돌린 파일 | 실행 | 죽은 케이스 | 실패 값 |
| --- | --- | --- | --- | --- | --- |
| F1a | `shell/editor-keys.tsx` 붙이기 통지의 `brokenCodesNotice(…)` → `''` | `code-binding` · `module-tab` · `page-json`(web) | 81 | 붙이기 «끊긴 공통코드 1개» 1 | `expected '컴포넌트' to contain '끊긴 공통코드 1개'` |
| F1b | `palette/module-tab.tsx` 넣기 통지의 같은 줄 → `''` | 같은 셋 | 81 | 모듈 넣기 «끊긴 공통코드 1개» 1 | `expected '' to contain …` |
| F2 | `codes/project-codes.tsx` 의 `setTable(groups)` → 첫 조회만 싣기 | `codes-canvas` | 4 | «codes-changed 를 받으면 …» · «다시 붙으면 …» 2 | `expected null to be ''` · `'결제 대기'` ≠ `'새 이름'` — 다시 읽기를 두 길이 나눠 써 함께 죽는 것이 맞다 |
| F3 | `codes-resolve.ts` — 고른 값이 다 빠지면 첫 항목을 고름 | renderer `codes` · schema `codes-resolve` | 19 | resolve 둘 · renderer «Select … 다른 항목을 골라 보이지 않는다» 3 | `'결제 대기'` ≠ `'== 선택 =='` — 풀기 한 벌을 두 층이 재 함께 죽는다 |
| F4 | `snapshot-capture.ts` 의 표를 빈 배열로 | api `snapshot-codes` | 5 | «캡처한 payload …» · «판 4 복원 … 안전망 …» 2 | `expected [] to deeply equal [ …(2) ]` — 캡처 · 안전망이 한 함수라 안전망만 혼자 죽는 변조는 없다 |
| F5 | `lint/codes.ts` 의 `code-choices-empty` 를 끔 | `lint-codes` · `lint-project` · `lint-design` | 60 | `code-choices-empty` 1 + 규칙 표 인구조사 둘 | `expected [] to deeply equal [ 'code-choices-empty' ]` |
| E1 | `edit/code-ops.ts` 의 전제를 `test …/id` 로 | web `code-binding` | 6 | «Affix 를 묶으면 …» 1 | 연산 꼴 단언 — 겹친 편집 판이 아니다(L1) |

Focus 3 · 5 의 나머지 갈래(31 개 자름 · 판 3 복원)는 구현 보고 변조 표가 혼자 죽임을 보였다.

## 게이트

체인 하나(`nohup nice -n 10 caffeinate -i` · 슬롯 `gate-slots/rv-cc` — 띄울 때 0 · 끝나고 지움). node v24.21.0 · load 시작 3.27(14:09) → `pnpm test` 끝 2.71 → `test:browser` 끝 9.06(14:37). 잠듦: `pmset -g log` 의 마지막 Sleep 은 10:40 — 게이트(14:09 – 14:37) 안에 없음.

| 단계 | rc | 파일 | 실행 | 통과 | 실패 | 건너뜀 |
| --- | --- | --- | --- | --- | --- | --- |
| `pnpm typecheck` · `pnpm build` | 0 · 0 | — | — | — | — | — |
| `pnpm test --maxWorkers=25%` | 0 | 612(unit 182 · api 190 · web 240) | 9362 | 9359 | 0 | 3 |
| `pnpm test:build:serial` | 0 | 18 | 179 | 178 | 0 | 1 |
| `pnpm test:browser` | 0 | 124 | 769 | 767 | 0 | 2 |
| `pnpm fmt:check` · `pnpm lint` | 0 · 0 | — | — | — | — | — (lint 경고 94 줄은 앞부터 있던 것 — 새 파일 경고 없음은 안 셈) |

구현 보고의 게이트 고침(빨강 다섯) 뒤 전량이 이것으로 한 판 섰다. 탐침 · 변조는 게이트가 끝난 뒤(api 탐침은 `pnpm test` 끝난 뒤 · build 갈래와 겹침 — build 갈래는 테스트 DB 를 안 쓴다) 돌렸다.

## 남은 것

- M1 · M2 · M3 · M4 를 고칠 트랙(코디네이터 판정). M1 · M2 는 «표를 받는 자리» 한 뿌리라 `nodeSummary` · `codeUsage` 에 표를 꿰는 한 트랙, M3 은 종류 바꾸기의 설계 판단, M4 는 화면 한 줄이다.
- M3 의 실브라우저 판(거절 통지 · 되싣기 · 뒤에 줄 선 편집)과 M4 의 재현은 안 쟀다.
- 겹친 편집 판(L1 — 남이 같은 노드의 다른 칸을 고침 · 옮김 · 지움 × 묶기 · 고르기 · 풀기)은 케이스가 없다. 실브라우저 `startWsDelay` 판으로 세울 자리다.
- 구현 보고 «남은 것» 의 상호작용 문장 · 복원 상자 조건문은 그대로다.

## 지침

1. **무엇이 비었나:** «표 · 맥락을 받는 이름 함수» 를 더한 트랙이 그 함수를 표 없이 부르는 자리를 안 셌다(M1 · M2 — 트리 줄 · 사용처 이름). **어디:** `.ruler/wirebound/` 워커 위임 덧붙임 «판정 · 풀이를 바꾸는 트랙은 그 판정을 «같다» 고 적은 사본을 함께 센다» 곁. **넣을 문장:** «**이름 · 요약 함수에 선택 인자(표 · 맥락)를 더하면 그 함수를 부르는 자리를 전부 세고 인자를 안 넘기는 자리를 보고에 갈래로 적는다**(`git grep -nP '\b(nodeDisplayName|nodeSummary|nodeRowLabel|describeNode)\('`) — 선택 인자라 타입 검사가 빈 자리를 안 잡는다(구조 트리 줄 · 사용처 목록이 그렇게 옛 이름을 냈다 — `docs/superpowers/plans/2026-11-10-rv-cc-report.md` M1 · M2).»
2. **무엇이 비었나:** 노드 봉투에 칸을 더하는 트랙이 노드 타입을 바꾸는 입구(종류 바꾸기)를 안 셌다(M3). **어디:** 같은 덧붙임 «놓을 자리의 규칙 … 부모를 바꾸는 입구를 … 센다» 곁. **넣을 문장:** «**타입에 매인 봉투 칸(`code` 처럼 카탈로그 선언과 맞아야 서는 칸)을 더하면 타입을 바꾸는 입구(`apps/web/src/edit/change-kind.ts`)가 그 칸을 어떻게 옮기는지 센다** — 봉투 필드를 안 건드리는 입구는 새 타입이 거절하는 칸을 남겨 편집이 422 다(`docs/superpowers/plans/2026-11-10-rv-cc-report.md` M3).»

## 탐침 원문

### P1 — 종류 바꾸기(`kind.probe.ts` · node 환경 · 스크래치 vitest 설정 `root` = 체크아웃)

```ts
import { beforeAll, expect, it } from 'vitest'
import { installCatalog, resetRegistry, validatePage, applyOps } from '@wirebound/schema'
import { changeKindOps } from '<체크아웃>/apps/web/src/edit/change-kind.ts'
beforeAll(() => { resetRegistry(); installCatalog() })
const doc = (node: any) => ({ version: 1, root: { id: 'n_root', type: 'Page', children: [node] } })
const cases: [any, string][] = [
  [{ id: 'n_a', type: 'Select', props: { options: [{ label: 'A' }] }, code: { group: 'G', selected: ['A'] } }, 'TextArea'],
  [{ id: 'n_a', type: 'Select', props: { options: [{ label: 'A' }] }, code: { group: 'G', selected: ['A'] } }, 'Input'],
  [{ id: 'n_a', type: 'CheckboxGroup', props: { options: [{ label: 'A' }, { label: 'B' }] }, code: { group: 'G', selected: ['A', 'B'] } }, 'RadioGroup'],
  [{ id: 'n_a', type: 'Input', props: { value: 'x' }, code: { group: 'G', item: 'A' } }, 'Select'],
  [{ id: 'n_a', type: 'Select', props: { options: [{ label: 'A' }] }, code: { group: 'G' } }, 'CheckboxGroup'],
]
it('change kind of bound node', () => {
  for (const [node, to] of cases) {
    const d = doc(node)
    const before = validatePage(d as never).filter((i) => i.severity === 'error').map((i) => i.code)
    const after = applyOps(d as never, changeKindOps(d as never, 'n_a', to)!) as any
    const res = validatePage(after as never).filter((i) => i.severity === 'error').map((i) => i.code)
    console.log(`${node.type}${JSON.stringify(node.code)} -> ${to}: before=${JSON.stringify(before)} after=${JSON.stringify(res)}`)
  }
})
```

값:

```
Select{"group":"G","selected":["A"]} -> TextArea: before=[] after=["invalid-code-ref"]
Select{"group":"G","selected":["A"]} -> Input: before=[] after=["invalid-code-ref"]
CheckboxGroup{"group":"G","selected":["A","B"]} -> RadioGroup: before=[] after=["invalid-code-ref"]
Input{"group":"G","item":"A"} -> Select: before=[] after=["invalid-code-ref"]
Select{"group":"G"} -> CheckboxGroup: before=[] after=[]
```

### P2 — 표를 안 받는 이름(`names.probe.ts` · node 환경)

```ts
const table = [{ key: 'ORDER_STATUS', name: '주문 상태', items: [{ value: 'WAIT', name: '입금 대기', active: true }] }]
const affix = { id: 'n_affix', type: 'Affix', props: { text: '결제 대기' }, code: { group: 'ORDER_STATUS', item: 'WAIT' } }
const btn = { id: 'n_btn', type: 'Button', props: { label: '결제 대기' }, code: { group: 'ORDER_STATUS', item: 'WAIT' } }
// codeUsage([{ kind: 'page', id: 'p', title: 'P', nodes: [{ id: 'n_root', type: 'Page', children: [affix, btn] }] }], 'ORDER_STATUS', 'WAIT')
// nodeSummary(affix) / nodeSummary(affix, indexCodes(table)) …
```

값:

```
USAGE [{"kind":"page","id":"p","title":"P","nodes":[{"nodeId":"n_affix","name":"결제 대기 사이 글자"},{"nodeId":"n_btn","name":"결제 대기 버튼"}]}]
TREE(no codes) 결제 대기 | with codes 입금 대기
ROW Button 결제 대기 | with Button 입금 대기
DISPLAY 결제 대기 버튼 | with 입금 대기 버튼
```

### P3 — 구조 트리 줄(`tree.webprobe.tsx` · jsdom · `apps/web/test/setup.ts` · `editor-harness` 의 `openPage`)

```tsx
const doc = pageDoc({ id: 'n-root', type: 'Page', children: [{ id: 'n-affix', type: 'Affix', props: { text: '옛 이름' }, code: { group: 'ORDER_STATUS', item: 'WAIT' } }] })
await openPage(doc, { apiOverrides: { listCodes: async () => [{ key: 'ORDER_STATUS', name: '주문 상태', items: [{ value: 'WAIT', name: '새 이름', active: true }] }] } })
// 캔버스 iframe 글에 «새 이름» 이 설 때까지 기다린 뒤
const rows = [...document.querySelectorAll('.wb-shell-region[aria-label="구조 트리"] [data-tree-row]')].map((el) => el.textContent)
```

값(jsdom): `ROWS ["Page","Affix 옛 이름"]` · `CANVAS has 새 이름 true`.

### P4 — api 넷(`api/codes.apiprobe.ts` · api 하네스 — 스크래치 설정이 `globalSetup` · `setupFiles` 를 api 프로젝트의 것으로 싣는다)

A 토큰 × 코드 라우트(`withApi` · 사람: owner · editor · viewer, 토큰은 `POST …/tokens` 로 발급, 강등 · 제외는 `project_members` 를 직접 고침):

```
ed-token POST group 201 · ed-token POST item 201 · vw-token GET 200 · vw-token POST 403 · vw-token PATCH item 403
other-project-token GET 404 · other-project-token POST 404
demoted ed-token POST 403 · demoted ed-token DELETE item 403 · demoted ed-token GET usage 200 · removed vw-token GET 404
```

B 사용처 — 탭 패널(묶인 `TabPanel` + 그 안 `Affix`) · 묶이지 않은 둘째 탭 안 `Affix` · 숨은 상태(`visibility: only s_x`) · 그리드 열 셀 틀(`GridColumn` 몸통) · 그리드 행(`GridRow repeat 5` › `GridCell`) 안 `Affix`. 표의 이름은 «새 이름», prop 대체 글은 «옛 이름»:

```
USAGE2 nodes: n_tp «옛 이름 탭 패널» · n_in_tab · n_in_tab2 · n_hidden · n_coltpl · n_cell (모두 «옛 이름 사이 글자»)
COUNTS2 {"S":{"group":6,"items":{"A":6}}}
```

여섯 자리 다 센다(행 사본 넷은 노드가 아니라 한 번 — 고칠 곳은 하나다). 이름은 표가 아니라 대체 글이다(발견 M2).

C 안전망 되복원 — 스냅샷 v1(«처음») → 이름 «나중» · 그룹 T 더함 → v1 복원(200 · 표 = v1) → 그 안전망 복원(200): 표가 복원 전과 같다(`sameAsBefore: true`).

D 프로젝트 삭제 뒤에 선 코드 쓰기(`withRealApi` · 다른 연결이 프로젝트 행 `FOR UPDATE` 를 쥔 채 요청을 쏘고, `pg_stat_activity` 에 `Lock` 대기가 서면 `DELETE FROM projects` · 커밋): 그룹 만들기 · 그룹 고치기 · 항목 만들기 셋 다 `404 «프로젝트를 찾을 수 없습니다»`(500 아님).
