# F — 트리 접기 · 별칭 · 줄 요약 · 목록 줄바꿈 · 배치 선 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 이 저장소에서는 `CLAUDE.md` 「메인 세션은 디스패치·판정·병합만 한다」가 실행 방식을 정한다 — 트랙마다 워크트리 하나 · Orca 워커 하나.

**Goal:** 구조 트리 줄을 `타입 (별칭) 요약` 으로 알아보게 하고(F2), 트리를 줄마다 접고, 컴포넌트 목록을 줄바꿈 배치로, 캔버스에 배치 선 토글을 더한다(F1).

**Architecture:** 별칭은 노드의 선택 필드 `alias` 이고 이름을 짓는 함수 `nodeDisplayName` 하나를 노드를 가리키는 모든 자리가 부른다. 요약은 카탈로그 정의의 순수 함수 `summary`. 접기는 화면 상태(스토어 밖의 트리 훅 상태 · 세션 메모리), 배치 선은 선택 외곽선과 같은 셸 겹 측정을 쓴다.

**Tech Stack:** React 19 · vitest(jsdom) · playwright-core(`apps/web/build-test`) · `@wirebound/schema` · `@wirebound/exporter` · `@wirebound/mcp`.

**Spec:** `docs/superpowers/specs/2026-10-04-tree-alias-guides-design.md`.

## Global Constraints

- 편집은 새 종류를 만들지 않는다 — 별칭은 JSON Patch `add` / `replace` / `remove` `/…/alias` 를 지금 편집 전송 길로. 잠금 판정은 `lockConflictOfOps`(웹 `editBlockedBy`).
- `packages/schema` 는 zod 외 런타임 의존이 없고 브라우저 · Node 양쪽. 노드 봉투(`WbNodeSchema` strictObject)에 `alias` 를 선택으로 더한다 — 서버 저장 경계 · 가져오기 · 클립보드 봉투가 같은 검증기를 쓴다.
- CSS 는 `apps/web/src/shell.css` 하나 · `.wb-shell-*` 클래스. 캔버스 문서에 셸 CSS 를 넣지 않는다. 아이콘은 `apps/web/src/shell/icons.ts` 표에서.
- 접근 이름을 바꾸면(구조 트리 줄 — 이제 `타입 (별칭) 요약`) 그 이름을 조각으로 품거나 정확히 견주는 기존 찾기(jsdom `getByRole(…, { name })` 은 정확 일치 · playwright 는 부분 일치)를 `git grep` 으로 세어 표로 적고 옮긴다. 줄 이름이 요약을 품어 생기는 겹침(`Button` 과 `Button 저장`)을 센다.
- 웹 인구조사 명단(`api-consumers` · `fakeApi` · `shell-css-*` · `role-access` · `one-verdict` · `icon-census`)에 오른다.
- 게이트: `pnpm typecheck` · `pnpm build` · `pnpm test --maxWorkers=25%`(두 트랙이 나란히) · `pnpm test:build` · `pnpm test:browser` · `EDITOR_STACK_BUNDLE=build pnpm test:browser`.

## Review Focus

1. **별칭이 이름이 되는 자리 하나를 빠뜨린다** — 상호작용 문장 · 대상 고르개 · 코멘트 표시 · 내보낸 설계서 · MCP · 속성 패널 제목 · 트리 줄 가운데 하나가 타입 이름으로 남는다. → F2 Task 4(이름 짓는 자리 인구조사 — `describeInteraction` · `nodeLabel` 류 호출자 전부).
2. **별칭에 들어오는 글** — 61자 · 공백만 · 줄바꿈 · `<script>` · 아주 긴 한 낱말 · RTL. 저장 거절 · 화면 넘침 · 내보낸 HTML 이스케이프. → F2 Task 1 · 4.
3. **접힌 줄 안의 노드에 닿는 길** — 캔버스에서 고름 · 붙여넣기 · 남의 편집 · 되돌리기가 접힌 줄 안 노드를 고르면 조상이 펴진다. 고른 노드를 남이 접힌 줄 안으로 옮긴 판. → F1 Task 1.
4. **줄바꿈 목록의 축소판이 카드에 안 맞는다** — 창 폭을 바꿈 · 판 높이를 바꿈 · 검색으로 카드 수가 바뀜 · 스크롤 중. → F1 Task 2.
5. **배치 선이 노드에 안 맞거나 남는다** — 줌 · 칸 스크롤 · 뷰포트 폭 · 남의 편집 · 미리보기 끌기 · 뷰 모드로 바꿈. → F1 Task 3.

---

## 확정한 결정

### F-D1. 별칭 · 이름 · 요약 — `packages/schema`

```ts
// node.ts — WbNode 에 더함
alias?: string               // 앞뒤 공백 걷은 1 ~ 60자 · 봉투 검증
export const NODE_ALIAS_MAX = 60
// display.ts(새)
export function nodeSummary(node: WbNode): string | null            // 카탈로그 정의의 summary 를 부름 · 없으면 null
export function nodeDisplayName(node: WbNode): string                // 별칭이 있으면 별칭, 없으면 카탈로그 한국어 이름(지금 상호작용 문장이 쓰는 이름)
export function nodeRowLabel(node: WbNode): string                   // `타입 (별칭) 요약` — 트리 줄 · MCP
```

- 카탈로그 정의(`component/catalog/*.ts`)에 `summary?: (props) => string | null` — spec 표 그대로. 글을 줄이는 상수(Text 20자 · 앞 셋)는 그 파일 머리에.
- `remapNodeIds` · 클립보드 봉투 · 프리셋은 `alias` 를 그대로 옮긴다(선언된 키 계약 — `tree.ts` 머리말).

### F-D2. 별칭 고치기 — web

- `edit/ops.ts` 에 `aliasOps(document, nodeId, alias: string | null): PatchOp[] | null`(빈 값 → `remove` · 있으면 `replace` · 없으면 `add` · 같으면 `null`).
- 속성 패널 맨 위 «별칭» 칸(하나 고른 판 · 칸을 떠날 때 커밋 — 지금 글 칸과 같은 길) · 구조 트리 줄 더블클릭 · F2 · 줄 `…` «별칭 바꾸기»(메뉴 트리 «이름 변경»의 줄 안 입력 꼴). F2 는 단축키 표(`edit/editor-shortcuts.ts`)에 더한다 — 구조 트리 포커스 · 캔버스 포커스 둘 다.

### F-D3. 트리 접기 — web

- 접힘 상태: 트리 훅마다 `collapsed: ReadonlySet<string>`(구조 — 페이지마다 · 메뉴 — 프로젝트마다) · 세션 메모리(모듈 스코프 `Map`). 새로 고침 뒤 빈 집합.
- 보이는 차례(`edit/selection-move.ts` 의 `visibleNodeOrder`)가 접힘을 받는다 — 화살표 · Shift 범위가 같은 것을 쓴다.
- 저절로 펴짐: 선택 목록(`selectedNodeIds`)이 바뀔 때 그 조상들을 집합에서 뺀다.
- 끌기 중 접힌 줄 위 0.7s → 편다(드래그 부품 `drag/use-pointer-drag.ts` 의 `onOver` 를 받는 쪽에서 타이머 — 부품은 안 바꾼다).

### F-D4. 컴포넌트 목록 줄바꿈 — web

- 카드 줄(`.wb-shell-palette-cards`)을 `flex-wrap` / 그리드로 · 판이 세로 스크롤. 축소판 iframe(`palette/palette-thumbs.tsx`)은 카드 판의 스크롤 크기(폭 · 높이)로 서고 표본을 카드 자리에 2차원으로 놓는다 — 카드 좌표 = 표본 상자(D2 의 «카드 좌표 = 표본 상자» 판정 그대로).

### F-D5. 배치 선 — web

- 토글은 `shell/page-head.tsx` 머리(편집 모드 · 아이콘 표 — `LayoutDashboard` 류) · 상태는 `localStorage`(try/catch — 실패면 끔).
- 그리기는 캔버스 셸 겹(`canvas/canvas.tsx` 의 외곽선 · 마커 측정 자리) — Flex · Grid 노드의 그려진 상자 · 방향은 `canvas/canvas-drop.ts` 의 `axisOf`(그려진 배치로 읽는 함수)를 함께 쓴다.

## 트랙

| 트랙 | 태스크 | 브랜치 | 리뷰 |
|---|---|---|---|
| F1 | 1 ~ 4 | `feat/f1-tree-guides` | 스크린숏(창 1440 · 900 · 700) |
| F2 | 1 ~ 5 | `feat/f2-alias` | 리뷰어 한 번 |

## F1 태스크

1. **트리 접기**(F-D3) — 실패 케이스 먼저: 펼침 단추 · 모두 접기/펴기 · 저절로 펴짐(캔버스 고름 · 붙여넣기 · 남의 편집 · 사각형) · ← → · 보이는 차례 · Shift 범위 · 끌기 0.7s 펼침(실브라우저) · 접힌 줄에 «안». 메뉴 트리도 같음. 구분력 → 커밋.
2. **컴포넌트 목록 줄바꿈**(F-D4) — 실패 케이스 먼저(실브라우저): 창 1440 · 900 · 700 에서 카드가 여러 줄 · 판 높이를 바꿔도 카드 크기 그대로 · 축소판 표본이 카드 창에 맞음(좌표 차 ≤ 1px) · 스크롤 · 검색 · 끌기 · «넣기». 구분력 → 커밋.
3. **배치 선**(F-D5) — 실패 케이스 먼저: 토글 · 기억 · 편집 모드에서만 · 실브라우저로 시스템 테마 다섯에서 선이 Flex · Grid 상자에 맞음(줌 0.5 · 1 · 1.5 · 칸 스크롤 · 폭 바꿈 · 남의 편집 뒤) · 미리보기 노드에 안 그림. 구분력 → 커밋.
4. **정본 · 게이트 · 보고** — 「설계서 화면 구조」(트리 접기 · 목록 · 배치 선 — 지금 참인 것만) · 게이트 여섯 · 스크린숏 · 보고 `docs/superpowers/plans/2026-10-04-f1-report.md`.

## F2 태스크

1. **schema** — `alias` 봉투 검증 · `NODE_ALIAS_MAX` · 카탈로그 `summary` · `display.ts` 셋(F-D1) · `remapNodeIds` · 클립보드가 별칭을 옮김. 실패 케이스 먼저(요약 표 칸마다 · 0 · 61자 · 공백만 · 줄바꿈 · 이름 · 줄 글). 구분력 → 커밋.
2. **별칭 고치기 — web**(F-D2) — `aliasOps` · 속성 패널 칸 · 트리 F2 · 더블클릭 · `…` «별칭 바꾸기» · 되돌리기 한 번 · 잠긴 노드면 막힘 · 남의 화면에 방송. 구분력 → 커밋.
3. **트리 줄 `타입 (별칭) 요약`** — `nodeRowLabel` · 흐린 요약 · 줄임표 · 접근 이름 인구조사(Global Constraints) · 좁은 칸 넘침(실브라우저 — 글자 노드 `Range` 로). 구분력 → 커밋.
4. **이름 짓는 자리 전부** — 상호작용 문장 · 대상 고르개 · 코멘트 표시 · 속성 패널 제목 · exporter(`packages/exporter/src/sentences.ts` · `nodes.ts`) · MCP 트리 읽기(`packages/mcp/src`). 먼저 노드 이름을 짓는 자리를 전부 센다(`git grep -n -E "catalog.*label|labelOf|describeInteraction|typeLabel" -- packages apps`) — 표로. 내보낸 HTML 의 별칭 이스케이프 · MCP 응답에 `alias` 와 `rowLabel`. 구분력 → 커밋.
5. **정본 · README · 게이트 · 보고** — 노드 모델 절 · 「설계서 화면 구조」 · api README(봉투) · MCP 문서 · 게이트 여섯 · 보고 `docs/superpowers/plans/2026-10-04-f2-report.md`.
