# D — 컴포넌트 드래그 배치 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 이 저장소에서는 `CLAUDE.md` 「메인 세션은 디스패치·판정·병합만 한다」를 따른다 — 트랙마다 워크트리의 Orca 워커가 한다.

**Goal:** 하단에 테마로 그린 축소판이 붙은 컴포넌트 목록을 두고 카드를 구조 트리 · 캔버스로 끌어 놓아 새 노드를 넣으며, 캔버스에서는 고른 노드의 손잡이를 끌어 옮긴다.

**Architecture:** 놓을 자리는 «끄는 것(`Placing` — 옮길 노드 id 또는 넣을 새 타입) + 대상 노드 + 구역 → 부모 id + 차례» 하나의 판정(C 의 `structureDropTarget` 을 넓힘)으로 트리와 캔버스가 함께 정한다. 끄는 출처(트리 줄 · 캔버스 손잡이 · 목록 카드)는 C 의 `usePointerDrag` 를 그대로 쓰고, 포인터가 트리 영역인지 캔버스 칸인지 가르는 얇은 경로 층(`usePlacementDrop`)이 그 판정과 표시 · 편집 전송을 잇는다. 캔버스 판정은 iframe 문서의 그려진 상자와 부모의 계산 배치(가로 · 세로)로 구역을 정한다. 목록은 판 하나에 iframe 하나로 갤러리 표본을 프로젝트 테마로 그려 카드에 잘라 보인다.

**Tech Stack:** React 19 · vitest(jsdom) · playwright-core(`apps/web/build-test`) · `@wirebound/theme-gallery` · `@wirebound/schema`.

**Spec:** `docs/superpowers/specs/2026-10-01-component-drag-design.md` — 모든 절. 앞 과제: `docs/superpowers/specs/2026-09-30-editor-shell-design.md`(C) · `docs/superpowers/plans/2026-09-30-c-report.md`(이월 장부 — N4 · N6 · N7 은 이 과제의 드래그에도 그대로 선다).

## Global Constraints

- **웹의 인구조사에 오른다** — `apps/web/test/api-consumers.test.ts` · `test/helpers.tsx` 의 `fakeApi` · `shell-css-coverage` · `shell-css-palette` · `shell-css`(`WRAPPERS`) · `shell-css-narrow`(`WRAPPING_GROUPS`) · `role-access` · `one-verdict`(판정 부르는 자리). 태스크마다 어느 명단에 올렸는지 보고에 표로.
- **CSS 는 `apps/web/src/shell.css` 하나 · 셀렉터는 `.wb-shell-*` 클래스뿐.** 캔버스 · 축소판 iframe 안 문서에는 셸 CSS 를 넣지 않는다 — 표시 · 손잡이는 iframe 위 셸 겹에 그린다.
- **캔버스 문서는 same-origin iframe 이다** — `CLAUDE.md` 「캔버스 문서는 same-origin iframe 이다」(전역 리스너 · `instanceof` 대신 `nodeType` · `useCanvasDocument`).
- **편집은 새 종류를 만들지 않는다** — 넣기는 `createNode(type)` + `insertNodeOps(document, parentId, index, node)`, 옮기기는 `moveNodeOps(document, nodeId, parentId, index)`. 지금 편집 전송 길(되돌리기 · 방송 · 409 리베이스 · 423 통지)을 탄다. 잠금 판정은 `lockConflictOfOps`(웹 `editBlockedBy`) 하나.
- **편집 권한은 지금 값 그대로** — `editable`(편집 모드 && `canEdit`). 새 부품은 역할을 직접 읽지 않는다.
- **드래그 부품 `drag/use-pointer-drag.ts` 는 손대지 않는다**(시작한 포인터만 · 4px 문턱 · Escape · 가장자리 스크롤). 고칠 일이 생기면 고치지 말고 보고에 적는다.
- `apps/web/src` 를 바꾸므로 게이트에 `pnpm test:browser` 와 `EDITOR_STACK_BUNDLE=build pnpm test:browser`.
- 주석 · 인용: `docs/guideline/base/03-comments.md` · `04-citation.md`. 테스트 보고: 실행 · 건너뜀 · 실패 수 · jsdom 값과 실브라우저 값을 가른다.

## Review Focus

1. **끄는 사이 대상이 바뀐다** — 남이 대상 노드를 지우거나 잡거나, 내 앞 편집이 거절돼 문서가 리베이스됐다. 놓는 순간 판정을 다시 해 편집 0 · 표시가 걷힌다(서버도 423 으로 막는다). → Task 3 · Task 4(두 클라이언트 실브라우저).
2. **가로로 늘어놓는 테마 뷰 안에 놓는다** — 카드 그리드 · 가로 무리 · `row-reverse` 에서 왼 · 오른쪽이 문서의 앞 · 뒤로 맞게 선다. 다섯 시스템 테마 각각. → Task 2(순수 함수) · Task 4(실브라우저 다섯 테마).
3. **줌 · 스크롤 · 페이지 옮김** — 줌 0.5 · 1 · 1.5 와 스크롤된 캔버스에서 표시가 포인터 아래 노드에 맞고, 끄는 중 페이지가 바뀌거나 iframe 이 새로 서면 끌기가 취소된다. → Task 2 · Task 4.
4. **카드 클릭(Enter) 추가의 자리** — 고른 것 없음 · 뿌리 · 컨테이너 · 잎 · 잠긴 노드 · 자식을 안 받는 부모의 잎 — 넣는 자리와 거절 문장이 spec 대로. → Task 8.
5. **축소판이 프로젝트 테마를 따라간다** — 남이 토큰 · 테마를 저장하면 축소판도 바뀌고, 번들을 못 실으면 기본 뷰로 선다. 축소판 안의 단추 · 입력은 눌리지 않는다. → Task 7.

---

## 확정한 결정

### D1. `Placing` 과 넓힌 판정

```ts
// apps/web/src/edit/structure-drop.ts
export type Placing = { kind: 'node'; id: string } | { kind: 'new'; type: string }
// DropZone 은 지금 `tree/tree-drop.ts` 의 것('before' | 'after' | 'inside')을 그대로 가져온다
export function structureDropTarget(
  document: PageDocument,
  placing: Placing,
  overId: string,
  zone: DropZone,
  blockedBy: (ops: readonly PatchOp[]) => NodeLock | null,
): StructureDrop | null
export function pageEndTarget(document: PageDocument, placing: Placing, blockedBy: …): StructureDrop | null  // 뿌리 끝
export function dropOps(document: PageDocument, placing: Placing, drop: StructureDrop, node?: WbNode): PatchOp[] | null
```

- `kind: 'new'` 는 자기 · 자손 검사가 없고, «안으로» 는 카탈로그의 자식 허용(`acceptsChildren` 이 새 타입이 아니라 **대상**을 본다 — 지금 그대로), 잠금은 `insertNodeOps` 로 지은 연산을 `blockedBy` 에 넣어 본다.
- `dropOps` 는 `node` 가 `kind: 'new'` 일 때 넣을 노드(호출자가 `createNode(type)` 으로 짓는다 — id 가 판정 · 전송에서 같게).
- 지금 부르는 자리(`panels/structure-tree.tsx`)는 `{ kind: 'node', id }` 로 바꾼다 — 기존 케이스가 그대로 초록.

### D2. 캔버스 판정 `canvas/canvas-drop.ts`

```ts
export type CanvasHit = { overId: string; zone: DropZone } | { pageEnd: true }
/** 순수: 상자 · 축 · 포인터 → 구역. */
export function zoneOf(rect: Rect, axis: 'x' | 'y', reversed: boolean, point: Point, acceptsChildren: boolean, empty: boolean): DropZone
/** 순수: 부모의 계산 스타일 조각 → 축 · 뒤집힘. 형제 상자로 «같은 줄» 을 본다(grid). */
export function axisOf(style: { display: string; flexDirection: string }, siblings: readonly Rect[], self: Rect): { axis: 'x' | 'y'; reversed: boolean }
/** DOM 층: 호스트 좌표 → iframe 좌표(줌 · 스크롤 · `frameOffset`) → elementFromPoint → 가장 가까운 [data-wb-id] → CanvasHit. */
export function canvasHitAt(frame: Window, frameOffset: Offset, zoom: number, hostPoint: Point, catalog: …): CanvasHit | null
```

- 구역: 축 방향 앞 25% `before` · 뒤 25% `after` · 가운데 `inside`(받을 때만 — 아니면 앞 · 뒤 반씩). 빈 컨테이너는 전체 `inside`. `reversed` 면 `before` ↔ `after`.
- `[data-wb-id]` 가 없는 바탕(문서 몸 · 노드 사이의 빈 곳이 뿌리의 상자 안)은 `{ pageEnd: true }`.
- 표시용 상자(선 · 강조)는 같은 함수가 호스트 좌표로 돌려준다 — `DropIndicator` 에 넘긴다.

### D3. 경로 층 `drag/use-placement.ts`

```ts
export function usePlacementDrop(input: {
  treeRegion: () => HTMLElement | null          // 구조 트리 영역
  canvas: () => { frame: Window; surface: HTMLElement; zoom: number } | null
}): {
  onOver: (placing: Placing, point: DragPoint) => DropHint<PlacementDrop> | null
  onDrop: (placing: Placing, drop: PlacementDrop) => void
}
export interface PlacementDrop { target: StructureDrop; node?: WbNode }
```

- 포인터가 트리 영역 안이면 트리 판정(지금 `structure-tree.tsx` 의 줄 → 구역 계산을 함수로 빼서 씀), 캔버스 칸 안이면 `canvasHitAt` → `structureDropTarget`/`pageEndTarget`, 둘 다 아니면 `null`.
- `onDrop` 은 **지금 스토어 문서로 판정을 다시 한다**(끄는 사이 바뀜 — Review Focus 1). 다시 한 판정이 `null` 이면 편집 0. 아니면 `dropOps` → 지금 편집 전송(구조 편집이 쓰는 스토어 입구 — `useStructureCommands` 가 부르는 그것). 새 노드면 보낸 뒤 그 노드를 고른다.
- 트리 줄 끌기(C)는 지금 그대로 둔다 — 이 층은 캔버스 손잡이 · 목록 카드가 쓴다. 트리 줄 끌기를 이 층으로 옮길지는 고르고 적는다(옮기면 트리 줄을 캔버스로도 놓을 수 있다 — 기본값: 옮기지 않는다).
- 끄는 중 `pageId` 가 바뀌거나 캔버스 iframe 이 새로 서면 끌기를 취소한다(`usePointerDrag` 를 손대지 않고 — 이 층이 `onOver` 에서 `null` 을 내고, 놓아도 `onDrop` 이 판정 다시 하기에서 버린다. 표시가 걷히는지 실브라우저로 잰다).

### D4. 캔버스 손잡이 `canvas/canvas-drag-handle.tsx`

- 선택 외곽선 겹(`.wb-shell-selection`)의 왼쪽 위 모서리에 단추(`aria-label="<이름> 옮기기"` · `⠿`) — 편집 모드 · `canEdit` · 고른 노드가 뿌리 아님 · 남이 안 잡음.
- 겹은 `pointer-events: none` 이므로 손잡이만 `pointer-events: auto`.
- `usePointerDrag<Placing, PlacementDrop>` 에 `{ kind: 'node', id }` 를 묶는다. 표시는 캔버스 칸 위 `DropIndicator`.

### D5. 하단 판 `palette/component-palette.tsx`

- 셸 그리드 영역에 `palette` 줄(캔버스와 하단 바 사이). 토글은 하단 바(`shell/shell-footer.tsx`)의 «컴포넌트» 단추(`aria-expanded` · `aria-controls`).
- 높이 · 열림은 `localStorage`(사이드바 레이아웃과 같은 저장 꼴 — `shell/sidebar-layout.ts` 의 `StoredLayout` 에 `paletteHeight` · `paletteOpen` 을 더하거나 따로 키 하나 — 고르고 적는다). 손잡이는 `ShellResizer`(`orientation="horizontal"`).
- 서는 조건: 편집 모드 && `canEdit`. 아니면 판 · 토글 둘 다 없음(열림 기억은 그대로).
- 탭: 카탈로그 `group` 차례. 검색: 한국어 `label` · 영문 타입 · 대소문자 무시 · NFC.
- 카드: `<button>` · 로빙 탭 인덱스(목록 안 화살표 · Home/End). 클릭 · Enter → D6. 끌기 → `usePointerDrag<Placing, PlacementDrop>` 에 `{ kind: 'new', type }`. 끄는 동안 이름표(포인터 곁 · 셸 겹).

### D6. 클릭 추가의 자리

| 고른 것 | 넣는 자리 |
|---|---|
| 없음 · 뿌리 | 뿌리 끝(`pageEndTarget`) |
| 자식을 받는 컴포넌트 | 그 안 끝 |
| 잎(자식을 안 받음) | 그 뒤(같은 부모) |
| 잠김(나 아닌 사람) · 판정 `null` | 넣지 않음 — 카드 곁에 이유 문장(지금 `+` 의 거절 문장과 같은 문장을 쓴다) |

### D7. 축소판 `palette/palette-thumbs.tsx`

- 판 하나에 숨지 않은 iframe 하나(`CanvasIframe` 를 쓴다 — 시트 차례 · 테마 정의 · 토큰이 캔버스와 같은 공급자 `useProjectTheme`). 그 문서에 갤러리 표본(`galleryItemDocument`)을 카드 차례로 그린다(표본이 없는 타입은 `createNode(type)` 한 개).
- 잘라 보이기: 표본마다 그린 상자를 재서(`getBoundingClientRect`) 카드 칸에 맞춰 줄여 보이는 방법 — 고르고 적는다(후보: 카드마다 같은 iframe 을 `transform` 으로 옮겨 겹친 칸 · 또는 iframe 하나를 카드 줄 뒤에 깔고 표본을 카드 자리에 배치하는 «같은 좌표» 판). 어느 쪽이든 카드 · 축소판 좌표가 실브라우저에서 맞는지 잰다.
- 축소판은 `inert`(안의 단추 · 입력이 포커스 · 누름을 안 받음). 테마 · 토큰이 바뀌면 다시 그린다.

---

## 파일 구조

```
apps/web/src/edit/structure-drop.ts                 Placing · pageEndTarget · dropOps (넓힘)
apps/web/src/canvas/canvas-drop.ts                  (신규) D2
apps/web/src/drag/use-placement.ts                  (신규) D3
apps/web/src/canvas/canvas-drag-handle.tsx          (신규) D4
apps/web/src/canvas/canvas.tsx                      손잡이 · 캔버스 표시 겹
apps/web/src/panels/structure-tree.tsx              Placing 으로 · 줄 → 구역 계산을 함수로 뺌
apps/web/src/palette/component-palette.tsx          (신규) D5 · D6
apps/web/src/palette/palette-thumbs.tsx             (신규) D7
apps/web/src/shell/shell-footer.tsx                 «컴포넌트» 토글
apps/web/src/shell/sidebar-layout.ts                판 높이 · 열림 기억
apps/web/src/routes/editor.tsx                      그리드 palette 줄 · 경로 층 공급
apps/web/src/shell.css                              새 블록
apps/web/build-test/canvas-drop.test.ts · palette.test.ts   (신규) 실브라우저 판
docs/superpowers/specs/2026-08-03-wirebound-design.md   D3 트랙
```

---

## 트랙

| 트랙 | 태스크 | 선행 |
|---|---|---|
| **D1 판정 · 캔버스** | 1 ~ 5 | main |
| **D2 목록** | 6 ~ 9 | D1 병합 |
| **D3 문서 · 게이트** | 10 | D2 병합 |

---

## Task 1: `Placing` 과 넓힌 판정

**Files:** `edit/structure-drop.ts` · `panels/structure-tree.tsx` · Test `test/edit/structure-drop.test.ts`(더함)

- [ ] **Step 1: 실패하는 테스트**
  - `{ kind: 'new', type: 'Text' }` 를 컨테이너 `inside` · 잎 `before`/`after` · 뿌리 `before` → `null`(뿌리는 형제가 없다) · 자식을 안 받는 대상 `inside` → `null` · 남이 잡은 노드 `inside`/`before`(잠금 판정이 막는 자리) → `null`.
  - `pageEndTarget`: 빈 문서 → `{ parentId: 뿌리, index: 0 }` · 자식 셋 → `index: 3` · 뿌리가 잠김 → `null`.
  - `dropOps`: `new` + 노드 → `insertNodeOps` 와 같은 연산 · `node` → `moveNodeOps` 와 같은 연산.
  - 기존 `{ kind: 'node' }` 케이스(지금 `structure-drop.test.ts`)가 그대로 초록.
- [ ] **Step 2 ~ 4:** 실패 확인 → 구현(D1) → `pnpm vitest run apps/web/test/edit/structure-drop.test.ts apps/web/test/panels` 통과 · typecheck.
- [ ] **Step 5: 구분력** — `new` 에서 잠금 판정을 뗀 판 · `pageEndTarget` 의 뿌리 잠금을 뗀 판.
- [ ] **Step 6: 커밋** — `feat(web): drop target accepts a new component type and the page end`

## Task 2: 캔버스 판정 `canvas-drop`

**Files:** `canvas/canvas-drop.ts` · Test `test/canvas/canvas-drop.test.ts`

- [ ] **Step 1: 실패하는 테스트**(순수 함수 — jsdom 에 레이아웃이 없으므로 상자 · 스타일을 값으로 준다)
  - `zoneOf`: 세로 축 상자 100 높이 — y 10 → `before` · 90 → `after` · 50 → `inside`(받음) / `after`(안 받음 · 뒤 반) · 빈 컨테이너 y 10 → `inside` · 가로 축 x 로 같은 표 · `reversed` 면 뒤집힘.
  - `axisOf`: `display: flex` + `row` → `x` · `row-reverse` → `x` · reversed · `column` → `y` · `block` → `y` · `grid` + 형제 둘이 같은 `top` → `x` · 다른 `top` → `y`.
  - `canvasHitAt` 의 좌표 환산: 줌 0.5 · 1 · 1.5 와 `frameOffset` · 칸 스크롤에서 호스트 점 → iframe 점(환산 함수를 따로 빼서 값으로 잰다).
- [ ] **Step 2 ~ 4.** — [ ] **Step 5: 구분력** — `reversed` 무시 판 · 줌 환산을 뺀 판.
- [ ] **Step 6: 커밋** — `feat(web): canvas drop zones from drawn boxes and the parent's layout axis`

## Task 3: 경로 층 `usePlacementDrop`

**Files:** `drag/use-placement.ts` · `panels/structure-tree.tsx`(줄 → 구역 함수 빼기) · `routes/editor.tsx`(공급) · Test `test/drag/use-placement.test.tsx`

- [ ] **Step 1: 실패하는 테스트**(jsdom — 트리 영역은 실제 DOM, 캔버스 칸은 `canvasHitAt` 을 목 대신 **주입 함수**로 받게 해 값으로 준다)
  - 트리 영역 위 → 트리 판정 결과 · 캔버스 칸 위 → 캔버스 판정 결과 · 둘 밖 → `null`.
  - `onDrop`: 놓기 전 스토어 문서를 바꿈(대상 노드를 지움 · 남의 잠금을 넣음) → 편집 0 · 그대로면 편집 1(구조 편집 입구가 불린 수 · 보낸 연산).
  - `new` 를 놓으면 보낸 뒤 새 노드가 고른 노드.
- [ ] **Step 2 ~ 4.** — [ ] **Step 5: 구분력** — 놓는 순간 다시 판정을 뗀 판(대상을 지운 케이스가 편집 1 로 죽는지).
- [ ] **Step 6: 커밋** — `feat(web): placement drop routes a pointer over the tree or the canvas to one verdict`

## Task 4: 캔버스 손잡이 · 표시 · 실브라우저 판

**Files:** `canvas/canvas-drag-handle.tsx` · `canvas/canvas.tsx` · `shell.css` · 인구조사 · Test `test/canvas/canvas-drag-handle.test.tsx` · `build-test/canvas-drop.test.ts`(신규)

- [ ] **Step 1: 실패하는 테스트**
  - jsdom: 손잡이가 서는 조건(편집 · `canEdit` · 뿌리 아님 · 남이 안 잡음) · 접근 이름.
  - 실브라우저 `canvas-drop`:
    - 손잡이로 노드를 다른 컨테이너 안 · 형제 앞뒤로 → 서버 문서 · 되돌리기로 원래 자리.
    - 손잡이를 클릭만 → 편집 0.
    - 두 클라이언트: 끄는 중 bob 이 대상을 잡음 → 놓아도 편집 0 · 표시 걷힘 / bob 이 대상을 지움 → 같음.
    - 시스템 테마 다섯 × 가로 배치가 있는 페이지(카드 그리드 · 가로 무리 — 테마마다 그 판을 서게 하는 문서를 케이스가 짓는다)에서 왼 · 오른쪽 놓기가 문서 차례로 맞음.
    - 줌 0.5 · 1 · 1.5 · 캔버스 칸을 스크롤한 판에서 표시 상자가 포인터 아래 노드의 상자와 맞음(픽셀 허용 오차를 적는다).
    - 끄는 중 단축키로 페이지 옮김 → 표시 걷힘 · 편집 0.
    - 끄는 중 트리 영역을 지나 캔버스로 돌아와 놓음 → 정상.
- [ ] **Step 2 ~ 4.** `pnpm test:browser` 두 판.
- [ ] **Step 5: 구분력** — 축 판정을 늘 `y` 로 둔 판(가로 테마 판이 값으로 죽는지) · 줌 환산을 뺀 판 · 손잡이의 잠금 조건을 뗀 판.
- [ ] **Step 6: 커밋** — `feat(web): move a canvas node by its selection handle with layout-aware drop zones`

## Task 5: D1 게이트 · 보고

- [ ] 게이트 여섯. 보고 `docs/superpowers/plans/2026-10-01-d1-report.md` — 태스크별 케이스 · 변조 표 · 인구조사 표 · 계획과 달라진 것(D3 의 «트리 줄 끌기를 이 층으로 옮길지» 판정 포함) · 게이트 수 · 이월 후보.

---

## Task 6: 하단 판 — 열고 접기 · 높이

**Files:** `palette/component-palette.tsx`(껍데기) · `shell/shell-footer.tsx` · `shell/sidebar-layout.ts` · `routes/editor.tsx` · `shell.css` · 인구조사 · Test `test/palette/palette-shell.test.tsx` · `test/shell/sidebar-layout.test.ts`(더함)

- [ ] **Step 1: 실패하는 테스트**
  - 편집 모드 · editor: 하단 바에 «컴포넌트»(`aria-expanded=false`) → 누르면 판(`region` 이름 «컴포넌트 목록») · `aria-expanded=true` → 다시 누르면 닫힘.
  - 뷰 모드 · viewer: 토글 · 판 없음. 편집 모드로 돌아오면 기억한 열림대로.
  - 높이 기억: 저장값 없음 → 기본 · 옛 저장값(키 없음 · 음수 · 문자열) → 기본 · 창보다 큰 값 → 조임.
- [ ] **Step 2 ~ 4.** — [ ] **Step 5: 커밋** — `feat(web): component palette panel toggled from the footer with a remembered height`

## Task 7: 축소판

**Files:** `palette/palette-thumbs.tsx` · `palette/component-palette.tsx` · `shell.css` · Test `build-test/palette.test.ts`(신규 — 축소판 판)

- [ ] **Step 1: 잘라 보이기 방법을 실브라우저로 먼저 잰다**(D7 의 후보 둘 — 카드 좌표와 표본 상자가 맞는지 · 카드 30 개 판의 첫 그림 시간 · 스크롤 중 어긋남). 고른 방법과 값을 보고에.
- [ ] **Step 2: 실패하는 테스트**(실브라우저)
  - 카드마다 그 타입의 표본이 축소판에 선다(카드 상자 안에 그 타입의 `[data-wb-component]` 가 있다 · 빈 카드 0).
  - 테마 표지: 프로젝트 테마가 `system-portal` 이면 축소판의 단추 바탕이 그 테마 주색(A6 `theme-system.test.ts` 의 표지 꼴).
  - 남이 토큰(주색)을 저장 → 축소판의 단추 바탕이 새 값.
  - 번들을 못 실음(번들 응답을 404 로) → 축소판이 기본 뷰로 선다 · 빈 판이 아니다.
  - 축소판 안의 단추를 누름 · Tab → 포커스 · 클릭이 안 닿는다(`inert`).
- [ ] **Step 3 ~ 5.** — [ ] **Step 6: 구분력** — `inert` 를 뗀 판 · 테마 공급자를 안 쓰고 기본 뷰만 쓴 판.
- [ ] **Step 7: 커밋** — `feat(web): palette thumbnails drawn once in the project theme`

## Task 8: 카드 — 탭 · 검색 · 클릭 추가 · 끌어 놓기

**Files:** `palette/component-palette.tsx` · `shell.css` · Test `test/palette/palette-cards.test.tsx` · `build-test/palette.test.ts`(더함)

- [ ] **Step 1: 실패하는 테스트**
  - jsdom: 탭 차례 = 카탈로그 갈래 차례 · 검색(한국어 · 영문 · 대소문자 · NFC) · 로빙 탭 인덱스(Tab 한 번 · 화살표 · Home/End).
  - jsdom 클릭 추가 — D6 표의 여섯 줄 각각 보낸 연산 · 거절 문장 · 넣은 뒤 고른 노드.
  - 실브라우저: 카드를 캔버스의 컨테이너 안 · 형제 사이 · 페이지 끝 · 구조 트리 줄로 끌어 놓음 → 서버 문서 · 되돌리기 · 못 놓는 자리(잎 안 · 남이 잡은 노드) → 편집 0.
- [ ] **Step 2 ~ 4.** — [ ] **Step 5: 구분력** — 클릭 추가의 «잎이면 뒤» 를 «안» 으로 바꾼 판 · 검색의 NFC 를 뗀 판.
- [ ] **Step 6: 커밋** — `feat(web): palette cards add by click or drag onto the tree and canvas`

## Task 9: D2 게이트 · 보고

- [ ] 게이트 여섯. 보고 `docs/superpowers/plans/2026-10-01-d2-report.md`.

---

## Task 10: 문서 · 전량 게이트(D3)

- [ ] 정본 `2026-08-03-wirebound-design.md` 「설계서 화면 구조」: «캔버스 직접 드래그 편집은 지원하지 않는다» 를 지금 참인 것으로(목록에서 끌어 넣기 · 손잡이로 옮기기 · 놓을 자리 판정이 트리와 같음) · 하단 바와 컴포넌트 판 · 그림. 지금 참인 것만.
- [ ] spec 머리 문장을 지금 참인 것으로.
- [ ] 게이트 여섯 · 보고 `docs/superpowers/plans/2026-10-01-d-report.md`(트랙별 병합 · 판정 요약 · D 이월 장부).

---

## 이 계획이 정하지 않고 넘기는 것

- 테마 패턴 · 페이지 프리셋을 목록에 싣기 · 여러 노드 끌기 · 복사해 놓기 · 노드 아무 데서나 끌기(spec 「범위 밖」).
- 터치 끌기 — C 이월 N6.
