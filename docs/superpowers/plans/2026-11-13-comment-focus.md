# 코멘트 포커스 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** «코멘트» 탭의 묶음에 포커스가 가면 캔버스의 그 노드에 고른 것과 같은 링을 세우고, 숨은 노드면 보이는 화면 상태로 바꾸며, 묶음 머리를 누르면 그 노드를 골라 «컴포넌트» 탭으로 간다.

**Architecture:** 셸이 «가리킨 노드» 값 하나(`CommentPointing`)를 들고 코멘트 패널이 쓰고 캔버스가 읽는다 — 스토어의 선택은 안 건드린다. 상태를 고르는 판정은 순수 함수(`stateShowingNode`)로 `shell/use-view-state.ts` 에 둔다. 탭 이동은 캔버스 누름 신호(`shell/canvas-pick.tsx`)를 같은 뜻의 이름으로 하나 더 내보내 쓴다.

**Tech Stack:** React 19 · vitest(jsdom `web` 프로젝트) · Playwright 실브라우저(`apps/web/build-test` · `editor-stack.ts`)

**Spec:** `docs/superpowers/specs/2026-11-13-comment-focus-design.md`

## Global Constraints

- 링은 진짜 선택이 아니다 — `selectedNodeId(s)` · 새 코멘트의 «달 곳» · 노드마다의 초안 · 소프트 잠금이 포커스만으로 바뀌면 안 된다.
- 상태 전환은 «고름»(묶음을 포인터로 누름 · 묶음 자체에 포커스가 선 채 Enter/Space)에서만 · 숨어 있을 때만 · «기본» → `viewStateOrder` 차례의 첫 «보이는» 상태. 없으면 안 바꾼다. 포커스가 떠나도 되돌리지 않는다.
- 머리 누름(진짜 선택 + «컴포넌트» 탭)은 편집 모드에서만.
- `present` 가 `'no'` · `'unknown'` 인 묶음은 링 · 상태 전환 · 머리 누름이 없다.
- `scope="node"`(«컴포넌트» 탭의 «코멘트» 묶음)에는 걸지 않는다.
- 정본 `docs/superpowers/specs/2026-08-03-wirebound-design.md` 를 «지금 참인 것»으로 고친다(연대기 없이) → 게이트는 README 「트랙 게이트」의 전량 넷(`pnpm typecheck` · `pnpm build` · `pnpm test` · `pnpm test:build`).
- 실브라우저 케이스의 playwright 타입은 `playwright-core` 에서 가져온다. 셸 고정 단추는 `exact: true` 로 찾는다.

## Review Focus

1. **묶음 안의 글 상자 · 단추에서 친 키** — 고치던 코멘트 상자의 Enter, «수정» · «삭제» 단추의 Enter/Space 가 상태를 바꾸면 안 된다(키 «고름»은 `event.target === 묶음 요소` 일 때만). → Task 3 케이스.
2. **묶음 안의 단추 · 링크 누름** — «수정» · «삭제» · 코멘트 토큰 링크를 누르면 상태를 안 바꾼다(그 누름은 다른 일이다). 포커스(링)는 서도 된다. → Task 3 케이스.
3. **편집 모드에서 다른 노드를 고른 채 링** — 고른 외곽선(`data-wb-selected-id`)은 그대로 · 링은 따로 선다 · 같은 노드면 링을 따로 안 그린다. → Task 2 케이스.
4. **어떤 상태에서도 안 보이는 노드** — 상태를 안 바꾸고 링도 없다(오류 없음). → Task 1 · Task 4 케이스.
5. **번호 토큰이 데려온 강조(`?node=&comment=1`)** — 기존 흐름(노드 고름 · 코멘트 탭 · 강조)이 그대로다. → Task 4 에서 기존 `comment-tokens.test.ts` 를 게이트로 돈다(새 케이스 없음).

---

### Task 1: 가리킴 값과 상태 판정

**Files:**
- Create: `apps/web/src/comments/comment-pointing.tsx`
- Modify: `apps/web/src/shell/use-view-state.ts` (함수 하나 더함)
- Modify: `apps/web/src/routes/editor.tsx` (`EditorShell` 이 provider 를 깐다 · 걷는 때 셋)
- Test: `apps/web/test/shell/state-showing-node.test.ts` · `apps/web/test/comments/comment-pointing.test.tsx`

**Interfaces:**
- Produces:
  - `export function stateShowingNode(document: Pick<PageDocument, 'root' | 'viewStates'> | null, nodeId: string, current: string | null): { change: false } | { change: true; state: string | null }` — `current` 에서 보이면(또는 문서 · 노드가 없으면) `{ change: false }`. 숨었으면 `null`(기본) → `viewStateOrder(viewStates)` 차례로 `hiddenNodeIds(document, s).has(nodeId)` 가 거짓인 첫 `s`. 없으면 `{ change: false }`.
  - `export interface CommentPointing { nodeId: string | null; point: (nodeId: string | null) => void }`
  - `export function CommentPointingProvider(props: { pageId: string | undefined; children: ReactNode }): ReactElement` — 페이지가 바뀐 렌더에서 곧바로 `null`(ViewStateProvider 의 `seenPage` 꼴).
  - `export function useCommentPointing(): CommentPointing` — provider 가 없으면 `{ nodeId: null, point: () => {} }`.

- [ ] **Step 1: 실패하는 케이스** — `state-showing-node.test.ts`: 상태 `s_login`(부모 없음) · `s_admin`(부모 `s_login`), 노드 `A`(보임 없음) · `B`(`only: ['s_admin']`) · `C`(`except: ['default', 's_login']`) · `D`(부모가 `B`) · `E`(`only: ['default']`).
  - `stateShowingNode(doc, 'A', null)` → `{ change: false }`
  - `stateShowingNode(doc, 'B', null)` → `{ change: true, state: 's_admin' }`
  - `stateShowingNode(doc, 'D', 's_login')` → `{ change: true, state: 's_admin' }` (부모가 숨으면 자식도)
  - `stateShowingNode(doc, 'E', 's_admin')` → `{ change: true, state: null }`
  - `C` 는 `s_login` 에서 숨고 하위 `s_admin` 도 숨는다 → `{ change: false }`(보이는 상태 없음)
  - 없는 노드 · `document === null` → `{ change: false }`
  - `comment-pointing.test.tsx`: `point('A')` 뒤 `nodeId === 'A'` · provider 의 `pageId` 를 바꾼 첫 렌더에서 `null`.
- [ ] **Step 2:** `pnpm vitest run apps/web/test/shell/state-showing-node.test.ts apps/web/test/comments/comment-pointing.test.tsx` → 수입 오류로 FAIL.
- [ ] **Step 3:** 두 파일을 짓는다. `EditorShell` 이 `<CommentPointingProvider pageId={props.pageId}>` 로 캔버스 · 우측 패널을 감싼다(둘 다 그 안). 우측 패널이 접히면(`layout.panelFolded`) `point(null)`.
- [ ] **Step 4:** 같은 명령 → PASS. `pnpm typecheck`.
- [ ] **Step 5:** 커밋 `feat(web): comment pointing value and the state that shows a node`.

### Task 2: 캔버스가 링을 그린다

**Files:**
- Modify: `apps/web/src/canvas/canvas.tsx` (외곽선 이펙트 · 렌더 · 누름에서 걷기 — 링은 `.wb-shell-selection` 꼴을 그대로 써 CSS 는 안 바꾼다)
- Test: `apps/web/test/canvas/comment-pointing-ring.test.tsx`

**Interfaces:**
- Consumes: `useCommentPointing()` (Task 1)
- Produces: DOM 계약 — 링 요소는 `div.wb-shell-selection[data-wb-comment-pointed="<노드 id>"]`. `data-wb-selected-id` 를 달지 않는다(고른 것을 세는 케이스가 그 속성을 센다).

- [ ] **Step 1: 실패하는 케이스**(jsdom — 상자 크기는 0 이어도 요소가 서는지로 잰다. 이 저장소의 캔버스 jsdom 케이스 꼴을 따른다):
  - 편집 모드 · 아무것도 안 고름 · `point('n_grid')` → `[data-wb-comment-pointed="n_grid"]` 1개 · `[data-wb-selected-id]` 0개 · `store.getState().selectedNodeIds` 가 그대로.
  - 편집 모드 · `n_form` 고름 · `point('n_grid')` → 링 1 · `[data-wb-selected-id="n_form"]` 1.
  - 편집 모드 · `n_grid` 고름 · `point('n_grid')` → 링 0 · `[data-wb-selected-id="n_grid"]` 1(같은 노드면 하나).
  - 뷰 모드 · `point('n_grid')` → 링 1 · `[data-wb-selected-id]` 0.
  - 지금 상태에서 숨은 노드를 가리킴 → 링 0.
  - 링이 선 채 캔버스 노드를 누름 · 빈 자리를 누름 → 링 0(`point(null)`).
- [ ] **Step 2:** `pnpm vitest run apps/web/test/canvas/comment-pointing-ring.test.tsx` → FAIL.
- [ ] **Step 3:** 외곽선 이펙트가 재는 목록을 `outlinedIds` + (가리킨 노드가 그 안에 없으면) 가리킨 노드로 넓힌다 — 두 벌의 측정을 짓지 않는다. 렌더는 기준 외곽선 · 옅은 외곽선 목록에서 가리킨 노드(고른 것이 아닐 때)를 빼고 링 하나를 따로 그린다. 캔버스의 노드 누름(`onClick` 의 고름 자리)과 `onBackgroundClick` 에서 두 모드 다 `point(null)`.
- [ ] **Step 4:** 같은 명령 → PASS. `pnpm vitest run --project web apps/web/test/canvas` 가 초록.
- [ ] **Step 5:** 커밋 `feat(web): canvas draws the comment pointing ring`.

### Task 3: 코멘트 패널 — 포커스 · 고름 · 머리 누름

**Files:**
- Modify: `apps/web/src/panels/comment-panel.tsx` (묶음 `li` 와 머리 `h3` · `scope === 'page'` 일 때만)
- Modify: `apps/web/src/shell/canvas-pick.tsx` (같은 신호를 `useShowComponentTab` 이름으로도 내보내고 머리말에 두 호출자를 적는다)
- Modify: `apps/web/src/routes/editor.tsx` (`RightPanel` 이 «코멘트» 아닌 탭으로 가면 `point(null)`)
- Test: `apps/web/test/panels/comment-focus.test.tsx`

**Interfaces:**
- Consumes: `useCommentPointing` · `stateShowingNode`(Task 1), `useViewState(pageId).choose`
- Produces: `export function useShowComponentTab(): () => void` (canvas-pick.tsx — `useTellCanvasPick` 과 같은 함수). DOM — `present === 'yes'` 인 묶음 `li` 는 `tabIndex={0}` · `aria-label` 은 머리의 글. 편집 모드의 그 묶음 머리는 `h3 > button.wb-shell-comment-group-pick`(접근 이름 = 머리 글).

- [ ] **Step 1: 실패하는 케이스**(`renderEditor` 하네스 · 상태 둘이 있는 문서 · 코멘트가 `A`(늘 보임) · `B`(`only: ['s_admin']`) · 사라진 노드 `Z` 에 달림):
  - `B` 묶음에 `focus()`(focusin) → `useCommentPointing().nodeId === 'B'` · 화면 상태 그대로(기본) · `selectedNodeIds` 그대로.
  - `B` 묶음을 누름 → 화면 상태 `s_admin`(머리 전환기 이름 · `useViewState`).
  - `A` 묶음을 누름(상태 `s_admin` 에서) → 상태 그대로 `s_admin`.
  - `B` 묶음 요소에 포커스 · Enter → `s_admin`. 같은 묶음 안 «수정» 단추에서 Enter · 고치는 상자에서 Enter · «삭제» 단추 누름 → 상태 그대로(Review Focus 1 · 2).
  - `Z` 묶음 · 문서를 못 읽은 묶음: `tabIndex` 없음 · 누름에도 `nodeId === null` · 머리 단추 없음.
  - 편집 모드 · `B` 머리 단추 누름 → `selectedNodeId === 'B'` · 우측 탭 «컴포넌트» 가 `aria-selected="true"` · 가리킴 `null`. 남이 잠근 노드(`selectNode` 가 안 고름)면 탭을 안 옮긴다.
  - 뷰 모드 → 머리 단추 0개 · 링 · 상태 전환은 위와 같다.
  - «컴포넌트» 탭의 «코멘트» 묶음(`scope="node"`) 의 `li` 에는 `tabIndex` 가 없다.
- [ ] **Step 2:** `pnpm vitest run apps/web/test/panels/comment-focus.test.tsx` → FAIL.
- [ ] **Step 3:** `li` 의 `onFocus`(focusin) → `point(nodeId)`. `onClick` → 대상이 `button` · `a` · `textarea` · `input` 의 안이 아니면 `stateShowingNode(document, nodeId, state)` 가 바꾸라면 `choose`. `onKeyDown` → `event.target === event.currentTarget` 이고 Enter/Space 일 때만 같은 일(`preventDefault`). 머리 단추 → `store.selectNode(nodeId)` 뒤 `store.getState().selectedNodeId === nodeId` 일 때만 `useShowComponentTab()()`. 묶음 `li` 의 포커스 링(`:focus-visible`)은 `shell.css` 에 기존 셸 포커스 꼴로 더한다.
- [ ] **Step 4:** 같은 명령 → PASS. `pnpm vitest run --project web apps/web/test/panels` 초록(기존 코멘트 패널 케이스가 `li` 의 새 속성에 안 깨지는지).
- [ ] **Step 5:** 커밋 `feat(web): comment groups point at their node, pick a showing state and open the component tab`.

### Task 4: 실브라우저 잠금 · 정본

**Files:**
- Create: `apps/web/build-test/comment-focus.test.ts`
- Modify: `docs/superpowers/specs/2026-08-03-wirebound-design.md` — 「설계서 화면 구조」의 «코멘트» 탭 문단 · 뷰 모드 외곽선 문장(지금: 뷰 모드에는 외곽선이 없다 → 고른 노드의 외곽선이 없고 코멘트 포커스 링만 선다)

**Interfaces:**
- Consumes: Task 2 · 3 의 DOM 계약(`data-wb-comment-pointed` · `.wb-shell-comment-group` · `wb-shell-comment-group-pick`)

- [ ] **Step 1: 케이스**(`editor-stack.ts` 판 · 페이지에 상태 `s_admin` 과 `only: ['s_admin']` 노드 `B` · 늘 보이는 `A` · 둘에 코멘트):
  - Tab 으로 `A` 묶음에 듦 → 링이 `A` 의 iframe 상자와 같은 자리(±1px · 줌 1).
  - Tab 으로 `B` 묶음에 듦 → 머리 전환기 «기본» 그대로 · 링 0(숨어서 그릴 요소가 없다). 그 뒤 그 묶음을 누름 → 전환기 `s_admin` 이름 · 링 1 · `B` 의 iframe 요소가 보임.
  - 편집 모드 · `A` 를 캔버스에서 고른 채 `B` 묶음 누름 → `[data-wb-selected-id]` 는 `A` · 링은 `B`.
  - `B` 머리 단추 누름 → «컴포넌트» 탭 `aria-selected="true"` · `[data-wb-selected-id="B"]` · 링 0.
  - 뷰 모드 → 머리 단추 0 · 묶음 누름이 링 · 상태 전환.
  - 캔버스 빈 자리 누름 · «페이지 정보» 탭으로 옮김 → 링 0.
  - 고치기 전 소스(`git merge-base main HEAD`)를 끼워 첫 케이스가 빨강인지 한 번 보이고 바이트 비교로 복원한다.
- [ ] **Step 2:** `pnpm test:browser apps/web/build-test/comment-focus.test.ts` → 통과 수 · 건너뜀 수를 적는다(0 이면 전제부터 본다).
- [ ] **Step 3:** 정본을 고친다. `git grep -l "wirebound-design.md" -- '*.test.ts'` 의 케이스를 돈다.
- [ ] **Step 4:** 전량 넷(`pnpm typecheck` · `pnpm build` · `pnpm test` · `pnpm test:build`) — 실행 수 · 건너뜀 · 판의 `node -v` 를 보고에 적는다. `comment-tokens.test.ts` 가 그 안에서 초록인지(Review Focus 5).
- [ ] **Step 5:** 커밋 `test(web): lock comment focus in the browser` · `docs(spec): comment focus in the canonical design`.
