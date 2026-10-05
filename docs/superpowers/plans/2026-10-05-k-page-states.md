# K — 페이지 화면 상태 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 이 저장소에서는 `CLAUDE.md` 「메인 세션은 디스패치·판정·병합만 한다」가 실행 방식을 정한다 — 트랙마다 워크트리 하나 · Orca 워커 하나.

**Goal:** 페이지에 화면 상태 목록을 두고, 고른 영역(`StateSwitch` · `StateCase`)만 상태마다 다르게 그리며 나머지는 기본을 따라가게 한다 — 편집 · 읽기 · 내보내기 · MCP 까지.

**Architecture:** 상태 목록은 페이지 문서의 `viewStates`, 영역은 카탈로그 구조 갈래의 투명 노드 둘(`StateSwitch` > `StateCase{ props.state }`). 렌더러가 `viewState` 옵션으로 가지 하나를 고른다. 편집은 새 종류 없이 JSON Patch 묶음(나누기 · 풀기 · 가지 복사 · 상태 삭제)을 내는 순수 함수로 짓고, 지금 편집 · 잠금 · 되돌리기 · 실시간 길을 그대로 탄다.

**Tech Stack:** `@wirebound/schema`(zod) · `@wirebound/renderer`(React 19) · `apps/api`(Fastify) · `apps/web` · `@wirebound/exporter` · `@wirebound/mcp` · vitest · playwright-core(`apps/web/build-test`).

**Spec:** `docs/superpowers/specs/2026-10-05-page-states-design.md`.

## Global Constraints

- 상태 목록: `PageDocument.viewStates?: { id: string; name: string }[]` — 이름 앞뒤 공백 걷은 1 ~ 30자 · 별칭과 같은 받지 않는 글자 집합(`packages/schema/src/alias.ts`) · 한 페이지 안에서 이름 유일 · 많아야 20개 · id 는 노드 id 규칙. 비거나 없으면 지금 페이지와 같다(마이그레이션 없음).
- `StateSwitch` 의 자식은 `StateCase` 만 · `StateCase.props.state` 는 `"default"` 또는 상태 id · `default` 가지 정확히 하나 · 상태당 가지 많아야 하나 · `StateCase` 는 `StateSwitch` 아래에만. 어기면 검증 오류. 목록에 없는 상태의 가지는 lint 경고이고 안 그린다.
- 두 타입은 테마가 그리지 않는다(렌더러의 투명 노드). 테마 manifest · 시스템 테마 다섯은 바꾸지 않는다.
- 편집은 새 종류를 만들지 않는다 — JSON Patch 묶음 · 지금 전송 길(WS `patch`) · 잠금 판정(`lockConflictOfOps` · 웹 `editBlockedBy`) · 개인 되돌리기(묶음 하나 = 되돌리기 한 번).
- 지금 고른 상태는 화면 상태다 — 서버에 안 가고, 페이지를 옮기면 기본으로 돌아간다. 읽기 주소는 `?state=<id>`.
- `packages/schema` 는 zod 외 런타임 의존이 없고 브라우저 · Node 양쪽. 의존 방향 `schema` ← `renderer` ← 나머지.
- CSS 는 `apps/web/src/shell.css` 하나 · `.wb-shell-*`. 아이콘은 `apps/web/src/shell/icons.ts` 표. 접근 이름을 새로 지으면 그 이름을 조각으로 품는 기존 찾기를 `git grep` 으로 센다.

## Review Focus

1. **상태 목록 편집이 루트 잠금에 막히거나, 잠금 판정이 `/viewStates` 경로를 모른다** — 남이 페이지 안 노드를 편집 중일 때 «상태 추가 · 이름 바꾸기»가 423 이 되면 안 된다. 반대로 상태 삭제가 지우는 가지가 남에게 잠겼으면 막혀야 한다. → K1 Task 2(`lock.ts` 의 문서 경로 판정 케이스) · K2 Task 2(실브라우저 두 사람 판).
2. **«복사 + 편집»이 기본 가지를 건드린다** — 상태를 고른 채 영역 안을 처음 고칠 때 편집 포인터가 기본 가지를 가리키면 모든 상태가 바뀐다. 복사 뒤 편집의 포인터를 새 가지로 옮기는 변환을 잠근다. → K1 Task 3(`forkCaseOps` + 포인터 옮김) · K2 Task 3.
3. **가지가 없는 상태에서 고른 노드 · 잠금 · 마커 · 상호작용 대상이 «흐린 기본 가지»의 노드를 가리킨다** — 그 노드는 기본 가지의 것이라 고치면 기본이 바뀐다. 흐린 가지 안 노드를 고르면 편집이 «복사 + 편집»을 타는지, 상호작용 대상 고르개가 그 노드를 어느 상태의 것으로 이름 짓는지. → K2 Task 3.
4. **상태를 지울 때 그 상태를 가리키는 상호작용 · 코멘트 · 별칭이 든 노드가 함께 사라진다** — 확인 상자의 수 · 이름 목록이 실제 지우는 것과 같아야 하고(H1 의 «같은 수 · 다른 것» 교훈 — id 집합으로), 한 번의 되돌리기로 돌아와야 한다. → K1 Task 3 · K2 Task 2.
5. **붙여넣기 · 프리셋 · 가져오기가 대상 페이지에 없는 상태의 가지를 싣는다** — 빼고 통지해야 하며, 뺀 결과가 `default` 가지 없음 · 빈 `StateSwitch` 같은 검증 오류를 만들지 않아야 한다. → K1 Task 4 · K3 Task 3.

---

## 확정한 결정

### K-D1. 모델 — `packages/schema`

```ts
// node.ts
export interface ViewState { id: string; name: string }
export interface PageDocument { version: number; root: WbNode; viewStates?: ViewState[] }
export const VIEW_STATE_NAME_MAX = 30
export const VIEW_STATES_MAX = 20
export const DEFAULT_CASE = 'default'
// component/catalog/structure.ts — StateSwitchDef(children 'many' · 자식은 StateCase 만) · StateCaseDef(props: { state: string })
// view-state.ts(새)
export function caseFor(sw: WbNode, viewState: string | null): WbNode | null    // 그 상태의 가지 · 없으면 default
export function nodeViewState(doc: PageDocument, nodeId: string): string | null // 가장 가까운 StateCase 조상의 state · 밖이면 null
export function visibleTree(doc: PageDocument, viewState: string | null): WbNode // 그 상태에서 보이는 트리(가지 하나씩만 남김) — MCP · exporter · 트리 표시가 쓴다
```

- 봉투(`envelope.ts`) · `validatePage`(`validate.ts`)가 Global Constraints 의 규칙을 본다. 비튼 값은 400(500 없음).
- **문서 경로 편집:** `viewStates` 는 `/viewStates/...` JSON Patch 로 고친다. `patch/apply.ts` · 서버 ops 검증 · 잠금 판정이 `/root` 밖 경로를 지금 받는지 **먼저 잰다**. 안 받으면 `/viewStates` 를 «노드 잠금과 무관한 문서 경로»로 더한다(잠금 판정은 `/root` 아래만 노드 판정, `/viewStates` 는 늘 통과 — 다만 같은 묶음 안의 노드 연산은 그대로 판정). 이 결정이 안 서면(서버 경로 · 감사 기록이 `/root` 를 가정) 멈추고 `q-k1.md` 에 묻는다.

### K-D2. 연산 — `packages/schema/src/view-state-ops.ts`(새)

```ts
export function splitIntoStatesOps(doc: PageDocument, nodeIds: string[], viewState: string | null, newId: () => string): PatchOp[] | null
export function unsplitStatesOps(doc: PageDocument, switchId: string): PatchOp[] | null
export function forkCaseOps(doc: PageDocument, switchId: string, viewState: string, newId: () => string): { ops: PatchOp[]; remap: Map<string, string> } | null
export function addViewStateOps(doc: PageDocument, name: string, newId: () => string): PatchOp[] | null
export function renameViewStateOps(doc: PageDocument, stateId: string, name: string): PatchOp[] | null
export function moveViewStateOps(doc: PageDocument, stateId: string, toIndex: number): PatchOp[] | null
export function removeViewStateOps(doc: PageDocument, stateId: string): { ops: PatchOp[]; removedCaseIds: string[]; removedNodeIds: string[] } | null
```

- `splitIntoStatesOps` — 같은 부모의 이어진 형제만(아니면 `null`). 기본이 아닌 상태면 그 상태의 가지를 기본 가지 복사(id 다시 짓기 — `remapNodeIds`)로 함께.
- `forkCaseOps` 의 `remap` 은 기본 가지 노드 id → 복사 노드 id. 화면은 «흐린 기본 가지 노드에 내려던 편집»의 포인터 · 대상 id 를 이 표로 옮겨 같은 묶음에 잇는다(Review Focus 2 · 3).
- `removeViewStateOps` 는 그 상태를 가리키는 모든 가지를 지우고 목록에서 뺀다 — 화면 확인 상자는 `removedCaseIds` · `removedNodeIds` 로 수 · 목록을 짓는다.

### K-D3. 그리기 · 이름 — `packages/renderer` · `display.ts`

- `RenderOptions.viewState?: string | null` — `renderNode` 가 `StateSwitch` 를 만나면 `caseFor` 의 가지 하나만, `StateCase` 는 자식만(감싸는 요소 없음 — 마커 · 외곽선 측정은 자식이 받는다). 목록에 없는 상태의 가지는 안 그림.
- `nodeDisplayName(node, ctx?: { viewStateName?: string })` — 상태 영역 안 노드면 «'승인 버튼'(관리자 상태)». 부르는 자리(상호작용 문장 · 대상 고르개 · exporter · MCP)는 `nodeViewState` 로 이름을 찾아 넘긴다. `nodeSummary` — `StateSwitch` «가지 N», `StateCase` 상태 이름(기본이면 «기본»).

### K-D4. 화면 — `apps/web`

- 지금 상태: 에디터 스토어 밖의 화면 상태(`EditorShell` 범위 · 페이지 id 가 바뀌면 `null`). 주소 `?state=` 는 뷰 모드 · viewer 에서 읽고 쓴다(편집 모드는 읽기만).
- 전환기는 에디터 머리(`routes/editor.tsx` 의 `wb-shell-head-tools` — 페이지 이름 옆) · `ActionMenu` 부품. «상태 관리…» 는 `ShellDialog`.
- 캔버스 꼬리표 · 테두리는 배치 선과 같은 셸 겹(`canvas/layout-guides.tsx` 의 측정 길).
- 구조 트리는 `visibleTree` 를 기본으로 그리고 «모든 가지 보기» 토글로 원 트리를 그린다.
- 흐린 기본 가지: 지금 상태의 가지가 없는 `StateSwitch` 는 기본 가지를 그리되 셸 겹에 «기본과 같음» 표시 · 그 안 노드를 고쳐 내는 편집은 `forkCaseOps` 를 앞에 붙인 묶음.

### K-D5. 읽기 · 내보내기 · LLM

- 뷰 모드 · viewer: 같은 전환기 · 영역 표지(«상태에 따라 다름» — 누르면 가지 목록).
- exporter: 상태가 있는 페이지는 상태마다 화면을 담고 번들 런타임에 전환기 · 주소 해시. 상호작용 목록은 상태를 붙인 문장.
- MCP: 트리 읽기에 `viewStates` · 가지마다 상태 이름. 쓰기 도구는 더하지 않는다 — 스킬 문서(`packages/mcp/skill/SKILL.md`)에 꼴.
- lint(`packages/schema/src/lint`): `view-state-unknown`(경고) · `view-state-unused`(정보) · `view-state-nested`(정보).
- 붙여넣기(`clipboard.ts` 의 `prepareNodesForPaste`) · 프리셋 · 페이지 JSON 가져오기: 대상에 없는 상태의 가지를 빼고 센다 — 통지 문장은 «상태 "X" 가지 N개를 뺐습니다». 프리셋 · 가져오기로 새 페이지를 만들면 `viewStates` 를 싣는다.

## 트랙

| 트랙 | 태스크 | 브랜치 | 리뷰 |
|---|---|---|---|
| K1 | 1 ~ 5 | `feat/k1-view-states-core` | 리뷰어 |
| K2 | 1 ~ 5 | `feat/k2-view-states-editor` | 리뷰어 |
| K3 | 1 ~ 4 | `feat/k3-view-states-read` | 스크린숏 |

K1 이 먼저 병합되고 K2 · K3 는 그 위에서 나란히 돈다(J1 ~ J3 병합 뒤 시작). K2 · K3 가 겹치는 자리(머리 전환기 부품 · `?state=`)는 K2 가 부품을 소유하고 K3 는 그것을 쓴다 — K3 가 먼저 끝나면 K2 위로 리베이스.

## K1 태스크 — schema · renderer · api

1. **모델 · 검증 · 카탈로그**(K-D1) — 실패 케이스 먼저: `viewStates` 경계(0 · 30 · 31자 · 겹침 · 21개 · 받지 않는 글자 · 비문자열 id) · 상태 영역 규칙(기본 가지 0 · 2 · 상태 중복 · `StateCase` 가 다른 부모 아래 · `StateSwitch` 아래 다른 타입) · `CATALOG_TYPES` 에 둘 · 카탈로그 인구조사 자(테마 manifest · 갤러리 · 팔레트가 두 타입을 «테마가 안 그리는 구조»로 다루는지 — 팔레트에 «상태 영역» 카드를 둘지 정하고 적는다: 기본값 **안 둔다**, 나누기는 명령으로만). 구분력 → 커밋.
2. **문서 경로 편집 · 잠금**(K-D1 «문서 경로 편집») — `/viewStates` 편집이 적용 · 서버 ops · WS · 감사 · 되돌리기 역연산에서 서는지 재고, 잠금 판정 케이스: 남의 노드 잠금이 있어도 `/viewStates` 단독 편집 통과 · 같은 묶음 안 노드 삭제는 그대로 판정(Review Focus 1). 구분력 → 커밋.
3. **연산**(K-D2) — 함수마다 실패 케이스 먼저(적용한 뒤 `validatePage` 오류 0 · 되돌리기 역연산으로 원래 문서). `forkCaseOps` 의 `remap` 으로 옮긴 편집이 기본 가지를 안 건드림(Review Focus 2 — 기본 가지의 깊은 복사와 견줌). `removeViewStateOps` 의 지운 id 집합 = 실제 지운 노드 집합(Review Focus 4). 구분력 → 커밋.
4. **이름 · 요약 · 붙여넣기**(K-D3 이름 · K-D5 붙여넣기 schema 몫) — `nodeViewState` · `nodeDisplayName` 상태 붙임 · `nodeSummary` 두 타입 · `visibleTree` · `prepareNodesForPaste` 의 가지 빼기와 그 뒤 검증 오류 0(Review Focus 5 — 가지를 빼서 `default` 가 없어지는 판은 `StateSwitch` 째 기본 가지 내용으로 풀어 붙인다: 기본값). 구분력 → 커밋.
5. **renderer · api 경계 · 정본 · 게이트 · 보고** — `RenderOptions.viewState` · 가지 고르기 · 목록 밖 가지 안 그림 · 마커 · 외곽선이 가지 안 노드에 서는지(렌더 케이스). api: 저장 경계 · WS 편집 · 연쇄 삭제 · 스냅샷 복원이 `viewStates` 를 싣는지 · 비튼 값 400. 정본 「페이지 스키마 노드」 · 「컴포넌트 카탈로그」 · `apps/api/README.md`. 게이트 여섯 · 보고 `docs/superpowers/plans/2026-10-05-k1-report.md`.

## K2 태스크 — 에디터

1. **지금 상태 · 전환기**(K-D4) — 머리 전환기 · 페이지를 옮기면 기본 · 캔버스가 `viewState` 로 그림 · 구조 트리 `visibleTree` + «모든 가지 보기». 실브라우저: 전환 뒤 캔버스 · 트리가 그 상태의 가지. 접근 이름 인구조사. 구분력 → 커밋.
2. **상태 관리 · 삭제 확인** — 추가 · 이름 · 순서 · 삭제(확인 상자: `removeViewStateOps` 의 id 집합으로 «가지 N개 · 노드 목록», 보낼 때 그 집합을 함께 실어 서버 쪽 대조가 필요하면 H1 의 id 집합 대조 꼴로 — 기본값: 삭제는 WS 편집 묶음이라 서버 잠금 판정이 막고, 그사이 가지가 바뀌면 편집 409 → 상자를 새 목록으로 다시 세움). 두 사람 판(Review Focus 1 · 4). 구분력 → 커밋.
3. **나누기 · 풀기 · 상태별 편집**(K-D4 흐린 기본 가지) — 줄 `…` · 캔버스 · Cmd+K «상태별로 나누기» / «상태 나누기 풀기» · 여러 선택의 이어진 형제 판정과 꺼진 이유 · 흐린 가지 안 노드를 고친 편집이 «fork + 옮긴 편집» 한 묶음 · 되돌리기 한 번 · 기본 가지 그대로(Review Focus 2 · 3) · 가지 줄 «이 상태 가지 지우기». 실브라우저 판 · 두 사람이 다른 상태를 보며 같은 영역 편집(잠금). 구분력 → 커밋.
4. **캔버스 표지** — 상태 영역 테두리 · 꼬리표(«관리자 · 기본에서 다름» / «기본과 같음») · 줌 · 스크롤 · 남의 편집 뒤 맞음(차 ≤ 1px) · 문서에 아무것도 안 넣음. 구분력 → 커밋.
5. **정본 · 게이트 · 보고** — 「설계서 화면 구조」 · 게이트 여섯 · 스크린숏(창 1440 · 900: 전환기 · 상태 관리 · 나눈 영역 · 흐린 가지 · 트리 두 보기) · 보고 `docs/superpowers/plans/2026-10-05-k2-report.md`.

## K3 태스크 — 읽기 · 내보내기 · LLM

1. **뷰 모드 · viewer** — 전환기(K2 부품) · `?state=` 읽고 쓰기 · 없는 id 는 기본 · 영역 표지와 가지 목록. 실브라우저. 구분력 → 커밋.
2. **HTML 번들** — 상태마다 화면 · 번들 전환기 · 상호작용 문장의 상태 붙임 · 상태 없는 페이지는 지금 바이트와 같음(스냅샷). build-test(번들을 Chrome 으로 열어 전환). 구분력 → 커밋.
3. **MCP · lint · 페이지 JSON · 프리셋** — 트리 읽기 · 스킬 문서 · lint 셋 · 가져오기 · 프리셋이 `viewStates` 를 싣고 없는 상태 가지를 빼며 통지(Review Focus 5). 구분력 → 커밋.
4. **정본 · 게이트 · 보고** — 「HTML 정적 번들」 · 「MCP 도구」 · 「lint 규칙」 · 게이트 여섯 · 스크린숏(뷰 모드 전환기 · 영역 표지 · 내보낸 번들) · 보고 `docs/superpowers/plans/2026-10-05-k3-report.md`.
