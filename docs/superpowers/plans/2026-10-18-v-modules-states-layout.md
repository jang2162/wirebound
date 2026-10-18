# V — 모듈 · 상태 트리 · 배치 몫 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 이 저장소에서는 `AGENTS.md` 「메인 세션은 디스패치·판정·병합만 한다」가 실행 방식을 정한다 — 트랙마다 워크트리 하나 · Orca 워커 하나.

**Goal:** SearchForm 열 · 모든 노드의 weight(V1), 구조 트리 추가를 걷고 하단 «모듈» 탭 · 프로젝트 모듈로 프리셋을 대신하며(V2), 화면 상태를 페이지마다의 상태 트리 + 노드별 보임으로 바꾸고 `StateSwitch` 를 걷는다(V3).

**Architecture:** weight 는 노드 필드이고 SDK `Root` 가 `--wb-node-weight` 로 싣고 SDK 기본 CSS 가 Flex · Grid 자식에 건다(테마 체크섬 무관). SearchForm 열만 테마 다섯의 CSS 를 고쳐 판을 올린다. 모듈은 `presets` 를 대신하는 프로젝트 단위 테이블 + 하단 판의 위층 탭이고, 넣기는 지금 붙여넣기 파이프라인(`prepareNodesForPaste` · `insertMany`)과 팔레트 자리 규칙(`paletteAddTarget`)을 쓴다. 상태는 `viewStates[].parent` + `WbNode.visibility` 이고 판정 함수 하나(`isVisibleIn`)를 모두가 쓴다. 옛 문서는 `migratePageDocument`(문서 판 1 → 2)가 들어오는 경계마다 옮긴다.

**Tech Stack:** `@wirebound/schema`(zod) · `@wirebound/theme-sdk` · `@wirebound/renderer` · `system-themes/*` · `apps/api`(Fastify · Kysely · Postgres) · `apps/web`(React 19) · `@wirebound/exporter` · `@wirebound/mcp` · `@wirebound/cli` · vitest · playwright-core(`apps/web/build-test`).

**Spec:** `docs/superpowers/specs/2026-10-18-modules-states-layout-design.md` — 결정은 사용자가 확인했다(2026-10-19).

## Global Constraints

- `WbNode.weight?: number` — 정수 1 ~ 12. `WbNode.visibility?: { mode: 'only' | 'except'; states: string[] }` — `states` 1개 이상 · 겹침 없음 · 페이지 `viewStates` 의 id 또는 `'default'`. 둘 다 `WbNodeSchema`(strictObject)에 더한다.
- `viewStates[]` 에 `parent?: string` — 목록의 다른 id · 고리 없음 · 깊이 3 이하. 나머지 상태 규칙(이름 1 ~ 30자 · 별칭과 같은 받지 않는 글자 · 페이지 안 이름 유일 · 20개 · `default` 금지)은 그대로.
- `PageDocument.version` 1 → 2. 옛 판은 `migratePageDocument` 로만 옮긴다 — 경계마다 따로 짜지 않는다.
- 모듈: 프로젝트 단위 · 이름 1 ~ 60자 · `nodes: WbNode[]` · 저장 때 `marker` · `visibility` · 바깥을 가리키는 상호작용을 걷는다.
- 렌더러 계약 속성(`data-wb-*` 여섯)은 늘리지 않는다. 테마 뷰의 인라인 `style` 은 커스텀 프로퍼티만(`theme-sdk/src/default-views/structure.tsx` 머리말).
- 테마 CSS · 뷰를 고치면 그 테마 판을 올리고 `system-themes/<이름>/checksums.json` 에 새 줄을 더한다(옛 줄 불변).
- `packages/schema` 는 zod 외 런타임 의존이 없고 브라우저 · Node 양쪽. 의존 방향 `schema` ← `renderer` ← 나머지.
- CSS 는 `apps/web/src/shell.css` 하나 · `.wb-shell-*`. 아이콘은 `apps/web/src/shell/icons.ts` 표. 접근 이름을 새로 짓거나 걷으면 그 이름을 조각으로 품는 기존 찾기를 `git grep` 으로 센다(AGENTS.md «playwright 의 `getByRole(…, { name })` 은 부분 일치다»).
- 편집은 새 종류를 만들지 않는다 — JSON Patch 묶음 · WS `patch` · 잠금 판정 · 개인 되돌리기(묶음 하나 = 되돌리기 한 번).

## Review Focus

1. **weight 가 자손에 샌다** — `--wb-node-weight` 는 물려지는 커스텀 프로퍼티라, weight 를 준 Card 안의 Flex 자식이 그 값을 받아 함께 늘어난다. 노드마다 초기화하고 그 노드만 싣는지. → V1 Task 1(중첩 Flex 실브라우저 케이스).
2. **Grid 의 weight 가 `columns` 를 넘는다** — `span 5` 를 `columns: 3` 에 두면 암묵 열이 생겨 격자가 넓어진다. 잘리는지. → V1 Task 1.
3. **옛 `StateSwitch` 문서가 경계 하나에서 안 옮겨진다** — DB 의 페이지 · 모듈 · 스냅샷 복원 · 페이지 JSON 가져오기 · 옛 클립보드 봉투 · 중첩 영역 · 빈 가지 · 목록 밖 상태의 가지. 옮긴 뒤 상태마다 보이는 노드 집합이 옮기기 전 `visibleTree` 와 같은지. → V3 Task 2.
4. **상태 삭제의 확인 상자가 실제 지우는 것과 다르다** — 하위 상태 · `only` 가 비어 지워지는 노드 · 남이 그 노드를 잡은 판. id 집합으로 견주고 되돌리기 한 번에 돌아오는지. → V3 Task 3 · Task 4.
5. **모듈 저장 · 넣기가 남는 것을 싣는다** — 바깥을 가리키는 상호작용 · `marker` · `visibility` 가 모듈에 남거나, 남이 지운 모듈을 넣어 500 이 나거나, 프로젝트 삭제와 모듈 삭제가 교착한다(지금 `guard-in-lock` «E15» 가 프리셋으로 잰 자리). → V2 Task 1 · Task 3, V3 Task 5.

---

## 트랙

| 트랙 | 태스크 | 브랜치 | 리뷰 |
|---|---|---|---|
| V1 배치 | 1 ~ 3 | `feat/v1-layout-weight` | 리뷰어 · 스크린숏 |
| V2 넣기 · 모듈 | 1 ~ 5 | `feat/v2-modules` | 리뷰어 |
| V3 상태 트리 | 1 ~ 6 | `feat/v3-state-tree` | 리뷰어 · 스크린숏 |

- **V1 ∥ V2 를 나란히 돌린다** — 겹치는 파일이 거의 없다(V1: 노드 봉투 · SDK · 테마 · 속성 패널 / V2: api 모듈 · 하단 판 · 구조 트리 툴바). 전량 게이트 둘까지는 한 기계에서 함께 돈다(AGENTS.md «전량 게이트는 한 기계에서 동시에 둘까지만»).
- **V3 은 V1 · V2 병합 뒤** 그 위에서 시작한다 — V2 가 걷은 프리셋 코드(`preset-apply.ts` 의 상태 이름 맞춤)와 구조 트리 툴바를 V3 이 다시 고치고, V1 이 더한 노드 필드 곁에 `visibility` 를 더한다.
- 각 트랙은 원자적이다 — 서버 라우트를 걷는 것과 웹이 그 라우트를 안 부르게 하는 것, 카탈로그 타입을 걷는 것과 웹 · exporter 가 안 쓰게 하는 것을 한 브랜치에 둔다(AGENTS.md «한쪽만 병합되면 전부 죽는 변경»).

---

## V1 — 배치(weight · SearchForm 열)

### Task 1: weight 노드 필드와 SDK 배치

**Files:**
- Modify: `packages/schema/src/node.ts`(`WbNode.weight`) · `packages/schema/src/envelope.ts`(`WbNodeSchema`) · `packages/schema/src/preset/builtin.ts`(`copyNode` 화이트리스트) · `packages/themes/src/pattern/expand.ts`(복사 화이트리스트)
- Modify: `packages/renderer/src/render.tsx`(바인딩에 weight) · `packages/theme-sdk/src/context.tsx`(`NodeBinding`) · `packages/theme-sdk/src/root.tsx`(style 합치기) · `packages/theme-sdk/src/default-views/structure.tsx`(`structureCssBlocks`)
- Test: `packages/schema/test/weight.test.ts`(새) · `packages/theme-sdk/test/root-weight.test.tsx`(새) · `apps/web/build-test/layout-weight.test.ts`(새)

**Interfaces:**
- Produces: `WbNode.weight?: number` · `WEIGHT_MIN = 1` · `WEIGHT_MAX = 12`(`node.ts`) · `NodeBinding.weight?: number` · 변수 이름 `--wb-node-weight`.

- [ ] **Step 1: 실패 케이스** — 봉투: weight 0 · 13 · 1.5 · `"2"` 는 거절, 1 · 12 는 통과, 없음은 통과. `remapNodeIds` · `copyNode` · 패턴 전개 뒤 weight 가 남는다.
- [ ] **Step 2: `Root` 케이스** — weight 3 인 노드의 뿌리 요소 `style` 에 `--wb-node-weight: 3` 과 뷰가 준 커스텀 프로퍼티(예: Grid 의 `--wb-node-grid-columns`)가 **둘 다** 있다. weight 없는 노드는 그 변수를 안 싣는다. 렌더러 계약 속성 수는 그대로(`packages/renderer/test/contract-attrs.test.ts` 초록).
- [ ] **Step 3: 구현** — SDK 기본 CSS 에 특이도 0 규칙 셋: 모든 노드 뿌리 `:where([data-wb-id]) { --wb-node-weight: initial }`(상속 끊기 · 인라인이 이긴다), `:where([data-wb-component="Flex"]) > :where(*) { flex-grow: var(--wb-node-weight, 0) }`, `:where([data-wb-component="Grid"]) > :where(*) { grid-column: span min(var(--wb-node-weight, 1), var(--wb-node-grid-columns, 1)) }`. `span min(…)` 이 Chrome 에서 서는지 먼저 재고, 안 서면 렌더러 · SDK 에서 잘라 싣는다(어느 쪽인지 보고에 적는다).
- [ ] **Step 4: 실브라우저 케이스**(`layout-weight.test.ts`, 시스템 테마 다섯 × 판) — Flex(row) 안 형제 둘의 weight 1 · 2 → 폭 비 1 : 2(± 2px). Grid `columns: 3` 안 weight 2 → 두 칸 폭. Grid `columns: 3` 안 weight 5 → 세 칸이고 격자 열 수 3(Review Focus 2). weight 2 인 Card 안의 Flex 자식 둘(weight 없음)의 폭이 내용 폭 그대로(Review Focus 1). weight 없는 문서의 배치가 고치기 전과 같다(같은 판을 HEAD 와 견줌).
- [ ] **Step 5: 구분력** — 상속 끊기 규칙을 뗀 변조 → Review Focus 1 케이스만 죽는다. Grid 자르기를 뗀 변조 → Review Focus 2 케이스. 커밋.

### Task 2: SearchForm 열

**Files:**
- Modify: `packages/schema/src/component/catalog/input.ts`(`columns` prop · editor 줄) · `packages/theme-sdk/src/marks.ts`(SearchForm 표지) · `packages/theme-sdk/src/default-views/input.tsx`(뷰 · CSS)
- Modify: `system-themes/{admin,commerce,docs,portal,saas-marketing}/src/theme.css` · commerce · portal `views/SearchForm.tsx` · 다섯 `manifest.ts` 판 `1.2.0` · 다섯 `checksums.json` 새 줄
- Test: `packages/schema/test/catalog-searchform.test.ts`(새) · `apps/web/build-test/searchform-columns.test.ts`(새)

**Interfaces:**
- Consumes: Task 1 의 `--wb-node-weight`.
- Produces: `SearchForm.props.columns?: 1 | 2 | 3 | 4`(기본값 없음) · 뷰 변수 `--wb-node-searchform-columns`(선례 `nodeVar('keyvalue','columns')`).

- [ ] **Step 1: 실패 케이스** — 카탈로그: `columns` 0 · 5 거절, 없음 통과, 패널 editor 에 «열» 칸.
- [ ] **Step 2: 실브라우저 케이스**(테마 다섯) — 창 1440: `columns: 3` · 필드 여섯 → 줄 둘 · 줄마다 셋 · 칸 폭 같음(± 2px). 필드 하나 weight 2 → 그 칸이 두 칸 폭. `columns` 없음 → 고치기 전과 같은 배치(HEAD 견줌). 좁은 창(각 테마의 media 문턱 아래) → 한 줄에 하나.
- [ ] **Step 3: 구현** — 열을 정한 판만 grid 로 바꾸는 규칙을 테마마다 더한다(정하지 않은 판의 규칙은 건드리지 않는다). 판 올림 · 체크섬 새 줄(`apps/api/test/system-theme-checksums.test.ts` 초록).
- [ ] **Step 4: 구분력** — 테마 하나의 열 규칙을 뗀 변조 → 그 테마 칸만 죽는다. 커밋.

### Task 3: 패널 칸 · 정본 · 게이트 · 보고

**Files:** `apps/web/src/panels/property-panel.tsx` · `apps/web/src/edit/ops.ts`(`weightOps`) · `apps/web/test/panels/weight-field.test.tsx`(새) · 정본 `docs/superpowers/specs/2026-08-03-wirebound-design.md`(「페이지 스키마 노드」 · 「컴포넌트 카탈로그」 · 「설계서 화면 구조」 속성 패널)

- [ ] **Step 1: 실패 케이스** — 부모가 Flex · Grid · 열을 정한 SearchForm 이면 «몫(weight)» 칸이 서고, 그 밖이면 없다. 값을 넣으면 `add`/`replace …/weight`, 비우면 `remove`. 1 ~ 12 밖은 보내지 않고 칸 아래 까닭. 남이 잡은 노드면 꺼짐(지금 별칭 칸과 같은 판정).
- [ ] **Step 2: 구현 · 구분력 · 커밋.**
- [ ] **Step 3: 게이트** — `README.md` 「트랙 게이트」 표의 schema · theme-sdk · renderer · system-themes · web 줄을 합쳐 돈다(`pnpm test` → `test:build:serial` → `test:browser`). 스크린숏: 창 1440 · Flex weight 1 : 2 · Grid span · SearchForm 3열(테마 다섯).
- [ ] **Step 4: 보고** `docs/superpowers/plans/2026-10-18-v1-report.md`.

---

## V2 — 넣기 · 모듈 · 프리셋 걷기

### Task 1: 모듈 api 와 프리셋 옮기기

**Files:**
- Create: `apps/api/src/db/migrations/0024-modules.ts`(번호는 그때의 다음 번호) · `apps/api/src/repos/modules.ts` · `apps/api/src/routes/modules.ts`
- Modify: `apps/api/src/db/migrations/index.ts` · `apps/api/src/db/types.ts` · `apps/api/src/app.ts` · `apps/api/src/routes/projects.ts`(삭제 잠금 순서) · `apps/api/README.md`
- Delete: `apps/api/src/routes/presets.ts` · `apps/api/src/repos/presets.ts` · 프리셋 전용 테스트(`presets.test.ts` · `presets-view-states.test.ts`)
- Test: `apps/api/test/modules.test.ts`(새) · `apps/api/test/modules-migration.test.ts`(새) · `guard-in-lock.test.ts` · `restore-lock-census.test.ts` · `permission-matrix` · `nested-page-entries` · `n41-failure-recheck` · `lone-surrogate-inputs` 의 프리셋 자리

**Interfaces:**
- Produces (REST, `/api/projects/:projectId/modules`):
  - `GET` (viewer) → `{ modules: { id, name, nodes: WbNode[], nodeCount, createdBy, createdAt }[] }` — 최근 것 먼저.
  - `POST` (editor) `{ name, nodes }` → 201 `{ module }`. 400: 이름 · 노드 모양 · 노드가 뿌리 아래 페이지 항목을 품음(지금 `nestedPagesUnderRoot` 422 그대로).
  - `PATCH /:moduleId` (editor) `{ name }` → 200.
  - `DELETE /:moduleId` (editor) → 204 · 없으면 404.
  - `lockProjectModules(trx, projectId)` — 프로젝트 삭제 잠금 순서에서 `lockProjectPresets` 자리.

- [ ] **Step 1: 실패 케이스** — 권한 표(viewer 읽기만) · 이름 0 · 61자 · NUL · 짝 없는 서로게이트 거절 · 노드 모양 400 · 저장한 `nodes` 에 `marker` 없음 · 남의 프로젝트 id 404 · 지운 모듈 PATCH · DELETE 404.
- [ ] **Step 2: 옮기기 케이스** — 프리셋 행(상태 영역 · `view_states` 를 품은 것 포함) 셋을 심은 DB 에 마이그레이션 → 같은 이름 · 같은 프로젝트의 모듈 셋 · 상태 영역은 기본 가지로 풀림(모듈에는 상태가 없다) · `presets` 테이블 없음. `down` → 빈 `presets`.
- [ ] **Step 3: 잠금 케이스** — `guard-in-lock` «E15» 를 모듈로 옮겨 «모듈 DELETE → 재확인» 과 프로젝트 삭제의 교착 0 · 줄에 섰는가를 함께 적는다(AGENTS.md «교착을 잴 때는 누가 먼저 잡느냐를 뒤집은 판과 옛 판을 함께»). `restore-lock-census` 의 «막히지 않는 줄의 목록»을 새 라우트로 다시 센다.
- [ ] **Step 4: 구현 · 구분력**(마커 걷기를 뗀 변조 · 잠금 순서를 바꾼 변조) **· 커밋.**

### Task 2: schema 정리 — 프리셋 걷기 · 공용 함수 옮기기

**Files:** `packages/schema/src/preset/builtin.ts`(→ `packages/schema/src/module/builtin.ts` · 내장 셋을 «기본 모듈»로) · `packages/schema/src/index.ts` · `stripMarkers` 를 `packages/schema/src/tree.ts` 로 · `packages/schema/test/preset.test.ts` → `builtin-modules.test.ts`

**Interfaces:**
- Produces: `BUILTIN_MODULES: readonly { key: 'search-list' | 'detail' | 'entry-form'; name: string; nodes: WbNode[] }[]` · `stripMarkers(nodes: WbNode[]): WbNode[]`(`tree.ts`).

- [ ] **Step 1:** 내장 셋이 검증 오류 0 · 노드 수가 옮기기 전과 같음 · `stripMarkers` 를 쓰던 곳(`view-state-ops.ts` · 웹 `paste-ops.ts`)이 새 자리를 import. 커밋.

### Task 3: 하단 판 «컴포넌트 | 모듈» 탭과 넣기

**Files:**
- Create: `apps/web/src/palette/module-tab.tsx` · `apps/web/src/palette/module-insert.ts`
- Modify: `apps/web/src/palette/component-palette.tsx`(위층 탭) · `apps/web/src/edit/structure-drop.ts`(`Placing` 에 `kind: 'module'` · 여러 노드) · `apps/web/src/drag/use-placement.ts` · `apps/web/src/api/client.ts` · `http-client.ts` · `types.ts` · `apps/web/src/shell.css`
- Test: `apps/web/test/palette/module-tab.test.tsx`(새) · `apps/web/test/edit/module-insert.test.ts`(새) · `apps/web/build-test/module-tab.test.ts`(새)

**Interfaces:**
- Consumes: Task 1 REST · Task 2 `BUILTIN_MODULES` · 지금 `paletteAddTarget` · `prepareNodesForPaste` · `insertMany` · 패턴 넣기(`edit/pattern-insert.ts`).
- Produces: `moduleInsertOps(doc: PageDocument, nodes: WbNode[], target: PaletteTarget, newId: () => string): { ops: PatchOp[]; insertedIds: string[]; droppedActions: number } | { reason: string }` · `Placing = { kind: 'node' | 'new' | 'module'; … }`.

- [ ] **Step 1: 실패 케이스** — 탭 둘(`role="tablist"`) · 모듈 탭의 묶음 셋(프로젝트 모듈 · 기본 모듈 · 테마 패턴) · 프로젝트 모듈 0개면 «구조 트리에서 노드를 골라 '모듈로 저장'» 안내 한 줄. 넣기: 고른 것 없음 → 페이지 끝, 컨테이너 → 안 끝, 잎 → 바로 뒤(팔레트와 같은 표) · 편집 하나 · 넣은 노드들이 골라짐 · 되돌리기 한 번. 테마 패턴은 지금 패턴 넣기와 같은 묶음 · 첫 슬롯 고름. 남이 잡은 자리면 «넣기» 꺼짐과 까닭(팔레트와 같은 판정). 남이 지운 모듈의 넣기 → 404 → «이 모듈은 지워졌습니다» · 목록 다시 읽음(Review Focus 5).
- [ ] **Step 2: 실브라우저** — 카드 끌기를 캔버스 · 구조 트리 줄에 놓기(미리보기 · 놓은 자리) · 마지막 탭 기억(새로고침 뒤) · 저장소가 막힌 판(`localStorage` 던짐)에도 «컴포넌트»로 선다.
- [ ] **Step 3: 구현 · 구분력 · 커밋.**

### Task 4: 구조 트리 — 추가 입구 걷기 · «모듈로 저장…»

**Files:**
- Modify: `apps/web/src/panels/structure-toolbar.tsx`(`OpenPicker` · `PickerBox` · `addNode` · `addPattern` · `applyPreset` 걷기) · `structure-tree.tsx`(뿌리 `+` · `TREE_SHORTCUTS` Alt+Shift+I/P · `presetName`) · `tree-row-actions.tsx`(줄 `+` 걷기 · `…` 에 «모듈로 저장…») · `apps/web/src/edit/toolbar-status.ts`(`presetReason`) · `apps/web/src/shell/icons.ts` · `apps/web/src/shell.css`
- Create: `apps/web/src/panels/save-module-dialog.tsx`
- Delete: `apps/web/src/panels/preset-picker.tsx` · `apps/web/src/edit/preset-apply.ts`(상태 이름 맞춤 둘은 붙여넣기 쪽 `apps/web/src/edit/paste-states.ts` 로 옮긴다 — `shell/editor-keys.tsx` 가 쓴다) · `pattern-picker.tsx` · `type-picker.tsx` 의 고르개 부품(`placeableGroups` 는 남긴다) · `edit/add-abilities.ts`(쓰는 곳이 툴바뿐이면)
- Test: 지울 · 고칠 web 테스트 약 30 파일(조사 목록: `panels/structure-toolbar` · `structure-row-actions` · `structure-keyboard` · `structure-pattern` · `structure-preset` · `type-picker*` · `lock/toolbar-abilities` · `lock/soft-lock` …) · build-test 일곱(`editor-shortcuts-review(-2)` · `view-states-review` · `view-states-editor` · `action-menu-portal` · `palette-review` · `keyboard-holes`) · 새 `apps/web/test/panels/save-module.test.tsx`

- [ ] **Step 1: 인구조사 먼저** — 걷는 입구마다 그것으로 **판을 세우는** 테스트를 `git grep` 으로 센다(«안에 추가»로 노드를 만들어 다른 것을 재는 케이스). 그런 케이스는 지우지 말고 판 세우기를 팔레트 넣기 · 문서 시드로 바꾼다 — 바꾼 수를 보고에 적는다(AGENTS.md «동작을 바꾸는 트랙의 브리프에 … 판 만들기를 센다»).
- [ ] **Step 2: 실패 케이스** — 트리 어디에도 «안에 추가» · «아래 추가» · «페이지에 추가» · «패턴 넣기» · «프리셋»이 없다(접근 이름으로 셈) · Alt+Shift+I/P 가 아무것도 안 하고 도움말에 없다. «모듈로 저장…»: 여럿 고른 판 · 조상과 자손을 함께 고른 판(조상만) · 뿌리만 고른 판(항목 없음) · 이름 칸 규칙 · 저장한 `nodes` 에 바깥 상호작용 · `marker` 없음과 뺀 수 문장(Review Focus 5) · 저장 뒤 모듈 탭에 선다.
- [ ] **Step 3: 구현 · 구분력 · 커밋.**

### Task 5: 정본 · 게이트 · 보고

- [ ] 정본 「설계서 화면 구조」(구조 트리 · 하단 판) · 「프리셋」 절을 「모듈」로 · `apps/api/README.md` 엔드포인트 표 · 단축키 표. 프리셋을 가리키는 정본 문장을 `git grep -n '프리셋'` 으로 전부 센다(`VIEWPORT_PRESETS` · «뷰포트 프리셋»은 다른 기능 — 뺀다).
- [ ] 게이트: api · schema · web 줄 합(`pnpm test` → `test:build:serial` → `test:browser`) · 보고 `docs/superpowers/plans/2026-10-18-v2-report.md`.

---

## V3 — 상태 트리 · 노드별 보임 · `StateSwitch` 걷기

### Task 1: 모델과 판정

**Files:**
- Modify: `packages/schema/src/node.ts`(`ViewState.parent` · `WbNode.visibility` · 문서 판 2) · `envelope.ts`(`ViewStatesSchema` · `WbNodeSchema`) · `validate.ts`(보임이 목록 밖 상태를 가리킴 · 깊이 · 고리) · `view-state.ts`
- Test: `packages/schema/test/view-state-tree.test.ts`(새) · `visibility.test.ts`(새)

**Interfaces:**
- Produces:
  - `interface ViewState { id: string; name: string; parent?: string }`
  - `type NodeVisibility = { mode: 'only' | 'except'; states: string[] }` · `VIEW_STATE_DEPTH_MAX = 3`
  - `isVisibleIn(node: WbNode, viewState: string | null, viewStates: readonly ViewState[]): boolean` — 노드 자신의 규칙만(조상은 부르는 쪽이 걷는다).
  - `stateLineage(viewStates, id): string[]` — 그 상태와 조상들(물려받기 판정용).
  - `visibleTree(doc, viewState): WbNode` — 숨은 노드를 뺀 트리(MCP · exporter 가 쓴다).
  - `viewStateOrder(viewStates): { state: ViewState; depth: number }[]` — 트리 차례(전환기 · 번들 고르개 · CLI).

- [ ] **Step 1: 실패 케이스** — 목록: `parent` 가 없는 id · 자기 자신 · 고리 · 깊이 4 거절. 보임: `states` 빈 배열 · 겹침 · 모르는 id 거절, `'default'` 통과. 판정 표(상태 «로그인 > 관리자», 기본): `only [로그인]` → 기본 ✗ · 로그인 ✓ · 관리자 ✓ / `except [관리자]` → 기본 ✓ · 로그인 ✓ · 관리자 ✗ / `only [default]` → 기본만 ✓.
- [ ] **Step 2: 구현 · 구분력**(물려받기를 뗀 변조 → 관리자 칸만 죽음) **· 커밋.**

### Task 2: 옛 문서 옮기기와 `StateSwitch` 걷기

**Files:**
- Create: `packages/schema/src/migrate-document.ts` · `apps/api/src/db/migrations/0025-state-visibility.ts`(그때의 다음 번호)
- Modify: `clipboard.ts`(봉투 판 올림 · 읽을 때 옮김) · `page-json/import.ts` · `apps/api/src/services/restore.ts` · `services/page-import.ts` · `component/catalog/structure.ts`(두 타입 걷기) · `node.ts`(`THEMELESS_TYPES`) · `packages/themes/src/manifest/schema.ts` · `packages/renderer/src/render.tsx`(투명 노드 걷기 · 숨은 노드 안 그림) · `lint/rules.ts`(`view-state-nested` 걷기 · `view-state-unknown` 새 뜻)
- Delete: `view-state-ops.ts` 의 나누기 · 풀기 · 가지 복사 · 복사 + 편집(상태 목록 연산은 남긴다) · `view-state-touch.ts`
- Test: `packages/schema/test/migrate-document.test.ts`(새) · `apps/api/test/state-visibility-migration.test.ts`(새) · 걷는 타입을 쓰는 schema 13 · renderer 4 · exporter 5 · mcp 3 · cli 1 · themes 2 · theme-kit 1 · theme-gallery 1 · api 8 파일

**Interfaces:**
- Produces: `migratePageDocument(doc: unknown): PageDocument` — 판 2 면 그대로, 판 1 이면 설계서 C4 규칙으로 옮긴 판 2. 같은 id 가 겹치면 `MigrationError`(페이지 id 를 싣는다).

- [ ] **Step 1: 옮기기 케이스** — 기본 가지만 · 기본 + 상태 둘 · 빈 가지 · 목록 밖 상태의 가지(버림 · 셈) · 영역 안 영역 · 영역이 뿌리 직계와 깊은 자리. **성질로 단언한다:** 상태마다(기본 포함) 옮기기 전 `visibleTree`(옛 함수 — 케이스 파일 안의 사본 픽스처로 둔다)의 노드 id 차례 = 옮긴 뒤 숨은 노드를 뺀 트리의 차례(Review Focus 3).
- [ ] **Step 2: 경계 케이스** — DB 마이그레이션이 모든 `pages.schema` 를 옮기고 `modules.nodes` 의 상태 영역은 기본 가지만 남겨 풀며(설계서 B4 — V2 와 같은 규칙) `down` 은 거절(되돌릴 수 없음을 README 에 적는다) · 판 1 스냅샷 복원 · 판 1 페이지 JSON 가져오기 · 판 1 클립보드 봉투 붙여넣기가 모두 판 2 로 선다.
- [ ] **Step 3: 걷기** — 카탈로그 · 렌더러 · 테마 manifest 거절 · lint. `CATALOG_TYPES` 수를 쓰는 자(`apps/web/build-test/palette.test.ts` 등 — AGENTS.md «하드코딩된 개수 하한 단언»)를 `git grep` 으로 센다.
- [ ] **Step 4: 렌더러** — `RenderOptions.viewState` 에서 숨은 노드 · 그 자손을 안 그림(`hiddenByOverlay` 자리) · 마커 · 외곽선이 숨은 노드에 안 섬.
- [ ] **Step 5: 구분력**(옮기기의 바깥 조건 합치기를 뗀 변조 → 영역 안 영역 케이스만) **· 커밋.**

### Task 3: 상태 목록 연산과 서버 경계

**Files:** `packages/schema/src/view-state-ops.ts`(add · rename · move 에 `parent` · `removeViewStateOps` 새 뜻) · `validate.ts` 의 `checkViewStateRemoval` · `apps/api/src/services/edit-pipeline.ts` · `apps/api/src/routes/tree.ts`(페이지마다 `viewStates`) · `apps/web/src/api/types.ts` · `apps/web/src/api/failure.tsx`(422 문장)

**Interfaces:**
- Produces:
  - `addViewStateOps(doc, name, parent: string | null, newId)` · `moveViewStateOps(doc, stateId, toIndex)`(형제 안에서만).
  - `removeViewStateOps(doc, stateId): { ops; removedStateIds: string[]; removedNodeIds: string[]; clearedNodeIds: string[] } | null` — 하위 상태째 · `only` 가 비면 노드 삭제(`removedNodeIds`) · `except` 가 비면 보임 걷기(`clearedNodeIds`).
  - 트리 응답 `TreePage.viewStates: ViewState[]`.

- [ ] **Step 1: 실패 케이스** — 연산마다 적용 뒤 `validatePage` 오류 0 · 역연산으로 원래 문서. 삭제의 세 집합 = 실제로 바뀐 노드 집합(Review Focus 4). 저장 경계 422: 목록에서 뺀 상태를 노드 보임이 가리킴. 남이 지울 노드를 잡았으면 423. 트리 응답에 `viewStates` · 상태 없는 페이지는 `[]`.
- [ ] **Step 2: 구현 · 구분력 · 커밋.**

### Task 4: 에디터 — 메뉴 트리 상태 줄 · 전환기 · 패널 · 구조 트리 · 캔버스

**Files:**
- Modify: `apps/web/src/panels/menu-tree.tsx`(페이지 줄 접힘 · 상태 줄 · `TreeRow` 종류 `'state'`) · `apps/web/src/tree/tree-actions.ts`(`TreeSelection.kind`) · `apps/web/src/shell/view-state-switcher.tsx`(고르기만 · 들여쓰기) · `shell/use-view-state.ts`(`useAllCases` · `HiddenSelectionPrune` 걷기) · `apps/web/src/panels/property-panel.tsx`(«상태 보임» 칸) · `apps/web/src/edit/ops.ts`(`visibilityOps`) · `panels/structure-tree.tsx`(흐림 · 표지 · «모든 가지 보기» 걷기) · `apps/web/src/canvas/canvas.tsx`
- Create: `apps/web/src/panels/state-rows.tsx` · `apps/web/src/panels/remove-state-dialog.tsx`
- Delete: `shell/view-states-dialog.tsx` · `panels/unsplit-dialog.tsx` · `edit/view-state-fork.ts` · `edit/view-state-actions.ts` · `canvas/view-state-regions.ts` · `canvas/state-badges.tsx`
- Test: web `test/` 16 · build-test 전용 셋(`view-states-editor` · `view-states-read` · `view-states-review` — 새 모델로 다시 쓴다) · 부수 넷(`action-menu-place` · `export-bundle` · `n19-notices` · `n36-badge-stack`) · 새 `apps/web/build-test/state-tree.test.ts`

- [ ] **Step 1: 인구조사** — 걷는 접근 이름(«상태 관리…» · «상태 추가»(머리) · «모든 가지 보기» · «상태별로 나누기» · «상태 나누기 풀기» · «이 상태 가지 지우기» · «상태에 따라 다름»)을 조각으로 품는 찾기 · 판 세우기를 센다.
- [ ] **Step 2: 실패 케이스** — 메뉴 트리: 상태 줄이 트리 차례 · 깊이로 서고, 누르면 그 페이지가 열리고 그 상태가 골라짐 · 고른 줄 `aria-current` · 줄 `…` 항목 다섯(editor · 편집 모드만) · viewer 는 줄만. 열린 페이지에서 남이 상태를 더하면 곧바로 선다(WS). 전환기: 항목이 트리 차례 · 관리 항목 없음. 패널: «상태 보임» 칸의 세 갈래 · 여럿 고르기 · 상태 없는 페이지의 한 줄. 구조 트리: 숨은 노드 흐림 · 고를 수 있음. 캔버스: 숨은 노드 안 그림 · 고른 숨은 노드에 외곽선 없음. 상태 삭제 상자: 세 집합의 수 · 노드 이름 · 연 뒤 바뀌면 다시 섬(지금 «새 목록 확인» 꼴) · 되돌리기 한 번(Review Focus 4).
- [ ] **Step 3: 실브라우저**(`state-tree.test.ts`) — 상태 트리를 만들고(로그인 > 관리자) 노드 셋에 보임을 걸어 상태마다 캔버스에 선 노드 집합 · 두 사람 판(한 사람이 상태를 지우는 사이 남이 그 노드를 잡음) · `?state=` 링크 · 뷰 모드 · viewer.
- [ ] **Step 4: 구현 · 구분력 · 커밋.**

### Task 5: 붙여넣기 · 모듈 · 읽기 · 내보내기 · LLM

**Files:** `packages/schema/src/clipboard.ts`(`prepareNodesForPaste` — 보임의 상태를 이름으로 맞추고 없는 상태는 빼고 셈 · `only` 가 비면 보임째 걷고 셈) · `apps/web/src/edit/paste-states.ts` · 모듈 저장(V2 `save-module-dialog.tsx` · `apps/api/src/routes/modules.ts` — `visibility` 걷기) · `interaction/describe.ts`(`namingContexts`) · `page-view.ts` · `packages/exporter/src/bundle/shell.tsx` · `browser/boot.tsx` · `bundle/comments.ts` · `packages/mcp/skill/SKILL.md` · `packages/cli/src/commands/page-get.ts`

- [ ] **Step 1: 실패 케이스** — 붙여넣기: 다른 페이지로 옮긴 노드의 보임이 같은 이름의 상태로 맞춰짐 · 없는 상태는 빠지고 통지 · `only` 가 빈 노드는 보임 없이 들어가고 통지. 모듈 저장 · api POST 가 `visibility` 를 걷음(웹이 걷지 않은 본문을 보내도 서버가 걷음 — Review Focus 5). 이름: `only [관리자]` → «'X'(관리자 상태)» · `only` 둘 → «'X'(관리자 · 손님 상태)» · `except` → 붙지 않음. 번들: 고르개가 트리 차례로 들여 쓴 이름 · 고르면 숨은 노드가 안 보임(Chrome) · `#state=`. MCP `get_page` 의 `nodes[].visibility` · 상태의 `parent`. CLI 한 줄.
- [ ] **Step 2: 구현 · 구분력 · 커밋.**

### Task 6: 정본 · 게이트 · 보고

- [ ] 정본 「페이지 스키마 노드」 «화면 상태» · 「컴포넌트 카탈로그」(두 타입 걷음) · 「설계서 화면 구조」 «화면 상태» 전체 · 「HTML 정적 번들」 · 「MCP 도구」 · 「lint 규칙」 · `apps/api/README.md`. 정본은 «늘 지금 참인 설계»만 적는다(AGENTS.md 머리 — «언제 뒤집혔다» 없이).
- [ ] 게이트: 모든 줄(schema · renderer · themes · exporter · mcp · cli · api · web — 사실상 전량) · `EDITOR_STACK_BUNDLE=build pnpm test:browser`(이펙트 · 마운트 순서를 바꾼다). 스크린숏: 창 1440 · 900 — 메뉴 트리 상태 줄 · 패널 «상태 보임» · 상태 셋에서 같은 페이지 · 상태 삭제 상자 · 내보낸 번들 고르개.
- [ ] 보고 `docs/superpowers/plans/2026-10-18-v3-report.md`.
