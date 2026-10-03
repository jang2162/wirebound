# E — 단축키 · 클립보드 · 여러 노드 선택 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 이 저장소에서는 `CLAUDE.md` 「메인 세션은 디스패치·판정·병합만 한다」가 실행 방식을 정한다 — 트랙마다 워크트리 하나 · Orca 워커 하나가 태스크를 차례로 하고, 리뷰어는 코디네이터가 따로 띄운다.

**Goal:** 에디터 어디서나 먹는 편집 단축키 · OS 클립보드로 주고받는 노드 복사 · 붙여넣기를 넣고(E1), 구조 노드를 여럿 골라 고른 서브트리마다 잠금을 쥔 채 일괄 삭제 · 복제 · 같은 타입 일괄 속성 편집을 하게 한다(E2).

**Architecture:** 단축키는 표 하나(`edit/editor-shortcuts.ts`)와 그 표를 호스트 · 캔버스 문서에 거는 훅 하나다 — 구조 트리의 지금 단축키 표도 거기로 옮긴다. 클립보드는 `copy` · `cut` · `paste` 이벤트로 `text/plain` 봉투를 주고받고, 봉투 읽기 · id 재발급 · 상호작용 대상 정리는 `packages/schema` 의 순수 함수다. 여러 개 선택은 스토어의 `selectedNodeId`(기준 노드 — 이름과 뜻을 그대로 둔다) 옆에 `selectedNodeIds`(기준 노드 포함)를 더하고, 서버 잠금 저장소는 연결마다 서브트리 여럿을 쥐며 `lock` 프레임이 «이 집합으로»를 나른다. 모든 편집은 지금 편집 전송 길(되돌리기 · 방송 · 409 리베이스 · 423 통지)의 연산 묶음 하나다.

**Tech Stack:** React 19 · vitest(jsdom) · playwright-core(`apps/web/build-test`) · Fastify WS(`apps/api/src/ws`) · `@wirebound/schema`.

**Spec:** `docs/superpowers/specs/2026-10-03-shortcuts-multiselect-design.md` — 모든 절. 앞 과제: `docs/superpowers/plans/2026-10-02-d4-report.md` · `2026-10-02-pj-report.md`(이월 장부).

## Global Constraints

- **편집은 새 종류를 만들지 않는다** — 넣기 `insertNodeOps(document, parentId, index, node)` · 지우기 `removeNodeOps(document, nodeId)` · 옮기기 `moveNodeOps` · 속성 `propOps` · `variantOps`(`apps/web/src/edit/ops.ts`). 여러 개는 그 연산들을 **차례로 적용한 문서 위에서** 이어 지어 한 묶음으로 보낸다(앞 연산이 미는 좌표 — `CLAUDE.md` 「편집의 포인터를 판정에 넣을 때」). 잠금 판정은 `lockConflictOfOps`(웹 `editBlockedBy`) 하나.
- **묶음 하나의 연산 수는 200 이하다**(`apps/api/src/http/patch-ops.ts` 의 `OpsBody` — `ops.max(200)`). 넘을 묶음은 화면이 보내기 전에 막고 이유를 말한다. 잠금 집합 상한도 200 으로 맞춘다(같은 수를 두 자리에 두지 말고 `@wirebound/schema` 에 상수 하나 — 서버의 `OpsBody` 도 그것을 읽게 바꾼다).
- **편집 권한은 지금 값 그대로** — `editable`(편집 모드 && `canEdit`). 새 부품은 역할을 직접 읽지 않는다.
- **캔버스 문서는 same-origin iframe 이다** — 전역 리스너는 `canvas/canvas-document.tsx` 의 `useCanvasDocument` 로 캔버스 문서에도 건다 · `instanceof` 대신 `nodeType`(`CLAUDE.md` 「캔버스 문서는 same-origin iframe 이다」).
- **글 입력 표면은 `panels/typing-surface.ts` 의 `isTypingSurface` 하나로 가른다** — 태그 이름 목록을 새로 짓지 않는다.
- **CSS 는 `apps/web/src/shell.css` 하나 · 셀렉터는 `.wb-shell-*` 클래스뿐.** 캔버스 문서에는 셸 CSS 를 넣지 않는다 — 외곽선 · 사각형은 셸 겹에 그린다.
- **웹 인구조사 명단에 오른다** — `test/api-consumers.test.ts` · `test/helpers.tsx` 의 `fakeApi` · `shell-css-coverage` · `shell-css-palette` · `shell-css` · `shell-css-narrow` · `role-access` · `one-verdict`. 태스크마다 어느 명단에 무엇을 더했는지 보고에 적는다.
- **접근 이름을 새로 지으면** 그 이름을 조각으로 품는 기존 playwright 찾기를 `git grep` 으로 세고 겹치면 `exact: true`(`CLAUDE.md` 「playwright 의 `getByRole(…, { name })` 은 부분 일치다」).
- `apps/web/src` 를 바꾸므로 게이트에 `pnpm test:browser` 와 `EDITOR_STACK_BUNDLE=build pnpm test:browser`. E2 는 api 를 바꾸므로 `pnpm test` 의 api 스위트가 자기 워크트리 DB 에 붙어 돈다.
- 주석 · 인용: `docs/guideline/base/03-comments.md` · `04-citation.md`. 테스트 보고: 실행 · 건너뜀 · 실패 수 · jsdom 값과 실브라우저 값을 가른다.

## Review Focus

1. **입력 중 단축키가 서면 친 글이 사라지거나 노드가 지워진다** — 속성 패널 글 칸 · 코멘트 칸 · 트리 이름 입력 · 캔버스 iframe 안 테마의 입력(축소판 · 캔버스의 `<input>` 은 `inert` 이지만 포커스 경로를 센다) · 한글 조합 중 Backspace · 모달 안. 어느 것도 노드 편집을 내지 않는다. → Task 2(jsdom 표) · Task 4(실브라우저 — 캔버스 iframe 포커스 · 조합).
2. **다른 데서 복사해 온 봉투가 지금 문서에 안 맞는다** — 옛 version · 다른 프로젝트의 페이지를 가리키는 상호작용 · 지금 문서에 없는 노드를 가리키는 상호작용 · 부모가 그 타입을 자식으로 안 받는 자리 · 200 연산 넘는 묶음 · 봉투가 아닌 글. 붙여넣기는 묶음째 되거나 묶음째 안 되고, 버린 상호작용 수를 말한다. → Task 1 · Task 3.
3. **여럿 고르는 사이 남이 그중 하나를 잡는다** — 같은 순간 두 연결이 겹치는 집합을 청한다. 겹친 잠금은 서지 않고, 진 쪽은 그 노드만 선택에서 빠지며 나머지는 쥔다. → Task 5(api 경주 — 페이지 행 줄 서기) · Task 9(실브라우저 두 계정).
4. **일괄 편집 하나가 되돌리기 하나다** — 일괄 삭제 · 복제 · 붙여넣기 · 일괄 속성 뒤 Cmd+Z 한 번에 통째로 돌아오고 다시 하기도 통째. 묶음의 한 노드가 남의 잠금에 부딪히면 아무것도 안 바뀐다(화면 미리 묻기 · 서버 423). → Task 3 · Task 8 · Task 9.
5. **선택 목록이 문서와 어긋난다** — 고른 노드를 남이 지움 · 되돌리기로 사라짐 · 접힌 줄을 Shift 범위가 지남 · 조상과 자손을 함께 Cmd+클릭 · 줌 · 칸 스크롤 중 사각형. 목록에는 문서에 있는 · 조상/자손이 겹치지 않는 노드만 남는다. → Task 6 · Task 7.

---

## 확정한 결정

### E-D1. 단축키 표

```ts
// apps/web/src/edit/editor-shortcuts.ts
export type ShortcutCommand =
  | 'undo' | 'redo' | 'delete' | 'duplicate' | 'deselect'
  | 'moveUp' | 'moveDown' | 'outdent' | 'indent'
  | 'selectPrev' | 'selectNext' | 'selectParent' | 'selectFirstChild'
  | 'selectSiblings'   // Cmd+A — E2 에서 켠다(E1 은 표에 두고 하나 고른 판에서 기준 노드만)
  | 'help'
export type Shortcut = {
  command: ShortcutCommand
  /** 도움말 대화 상자에 그대로 쓰는 글자(예: '⌘Z' / 'Ctrl+Z' — 플랫폼에 따라). */
  keys: (platform: 'mac' | 'other') => string
  label: string
  match: (event: KeyboardEvent, platform: 'mac' | 'other') => boolean
  /** 편집을 내는가 — 뷰 모드 · viewer · 고른 노드를 남이 잡은 판에서 안 선다. */
  edits: boolean
}
export const EDITOR_SHORTCUTS: readonly Shortcut[]
export function platformOf(navigator: Pick<Navigator, 'platform' | 'userAgent'>): 'mac' | 'other'
export function shortcutFor(event: KeyboardEvent, platform: 'mac' | 'other'): Shortcut | null
```

- 복사 · 잘라내기 · 붙여넣기는 이 표에 **없다** — `copy` · `cut` · `paste` 이벤트가 받는다(E-D3). 도움말 대화 상자는 그 셋을 따로 한 줄씩 덧붙인다(표가 아닌 상수 `CLIPBOARD_SHORTCUT_LINES` — 같은 파일).
- Alt 조합은 `event.code` 로 읽는다(지금 `panels/structure-tree.tsx` 의 처리 그대로 옮김).
- 구조 트리의 `SHORTCUTS` 는 이 표로 옮기고 트리는 표를 읽는다 — 트리 포커스의 Delete 가 «두 번 누르기 확인»이던 것은 **바로 삭제**로 바뀐다(spec 「키」 — 키보드 Delete 는 확인 없이). 줄 `…` «삭제»의 확인은 그대로.

### E-D2. 단축키 리스너

```ts
// apps/web/src/edit/use-editor-shortcuts.ts
export function useEditorShortcuts(input: {
  canvasDocument: Document | null          // useCanvasDocument 가 준다
  editable: boolean
  run: (command: ShortcutCommand) => void   // 셸이 명령을 지금 함수에 잇는다
  blocked: () => boolean                    // 모달 열림 · 메뉴 트리 상자 포커스
}): void
```

- 호스트 `document` 와 캔버스 문서에 `keydown` 을 건다. 거르는 차례: `event.isComposing` → `isTypingSurface(event.target)` → `blocked()` → `shortcutFor` → `edits && !editable` 이면 안 섬 → `preventDefault` 후 `run`.
- **되돌리기 · 다시 하기는 머리 단추와 같은 함수다** — `routes/editor.tsx` 에서 `useEditCommit` 이 내는 `undo` · `redo` 를 셸 한 곳에서 받아 단추와 `run` 이 함께 쓴다(훅을 두 번 부르지 않는다 — 전송 루프 가드가 하나여야 한다).
- 삭제 · 순서 · 계층은 구조 트리 줄 행동이 부르는 같은 명령 훅의 함수를 부른다(판정을 새로 짓지 않는다).
- 선택 이동은 구조 트리의 **보이는 차례**(접힌 줄 건너뜀)를 그 트리가 이미 쓰는 펼침 목록 함수로 읽는다.

### E-D3. 클립보드 봉투 — `packages/schema`

```ts
// packages/schema/src/clipboard.ts
export const NODES_ENVELOPE_KIND = 'nodes'
export function writeNodesEnvelope(nodes: readonly WbNode[], version: number): string
/** 봉투가 아니면 null. 옛 version 은 문서 마이그레이션 체인으로 올린다. 노드는 봉투 검증기로 본다. */
export function readNodesEnvelope(text: string): { nodes: WbNode[] } | null
/**
 * 붙일 노드를 짓는다 — 노드들을 임시 뿌리 하나에 담아 **한 번에** id 를 새로 짓고(`remapNodeIds` · 형제를 가리키는
 * 대상도 따라간다 — `apps/web/src/edit/preset-apply.ts` 의 `remapForPage` 와 같은 까닭), 대상이 붙이는 노드 밖인
 * 노드 대상은 `keepNode(id)` 가 참일 때만(지금 문서에 그 노드가 있다), 페이지 대상은 `keepPage(id)` 가 참일 때만 남긴다.
 * 남기지 않은 동작은 빼고 수를 센다 — 동작이 다 빠진 상호작용은 상호작용째 뺀다.
 */
export function prepareNodesForPaste(
  nodes: readonly WbNode[],
  keep: { node: (id: string) => boolean; page: (id: string) => boolean },
  generate?: () => string,
): { nodes: WbNode[]; droppedActions: number }
export const MAX_OPS_PER_EDIT = 200   // 서버 `OpsBody` 도 이것을 읽는다
```

- **spec 의 «대상이 붙이는 노드들 밖을 가리키는 상호작용은 버린다»를 이렇게 좁힌다:** 붙이는 문서에 그 노드 · 그 페이지가 있으면 남긴다(같은 페이지에서 복사한 단추가 같은 페이지의 대화 상자를 여는 것은 그대로 맞다). spec 의 그 문장도 같은 커밋에서 고쳤다.
- 프리셋 적용의 `remapForPage` 는 이 함수로 옮겨 함께 쓴다(같은 규칙 두 벌을 두지 않는다) — 프리셋 케이스가 그대로 초록이어야 한다.

### E-D4. 클립보드 리스너 · 붙이기

```ts
// apps/web/src/edit/use-clipboard.ts
export function useClipboard(input: {
  canvasDocument: Document | null
  editable: boolean
  blocked: () => boolean
}): void
// apps/web/src/edit/paste-ops.ts — 순수 함수
export function pasteOps(document: PageDocument, anchorId: string | null, nodes: readonly WbNode[]):
  { ops: PatchOp[]; insertedIds: string[] } | { reason: string }
export function duplicateOps(document: PageDocument, nodeIds: readonly string[], generate?: () => string):
  { ops: PatchOp[]; insertedIds: string[] } | { reason: string }
export function removeManyOps(document: PageDocument, nodeIds: readonly string[]): PatchOp[] | null
```

- 호스트 · 캔버스 문서의 `copy` · `cut` · `paste` 를 받는다(거르는 차례는 E-D2 와 같고 `cut` · `paste` 는 `editable` 일 때만). `copy` 는 선택(문서 차례)을 `writeNodesEnvelope` 로 `clipboardData.setData('text/plain', …)` 하고 `preventDefault`. `cut` 은 복사 + `removeManyOps`.
- `paste`: `readNodesEnvelope` → `prepareNodesForPaste`(keep.node = 지금 문서에 있음 · keep.page = 지금 프로젝트의 페이지 목록에 있음) → `pasteOps` → `editBlockedBy` → 보냄 → `insertedIds` 를 고른다. 봉투가 아니면 아무것도 안 하고 통지도 없다. `reason` 이면 하단 바 통지. `droppedActions > 0` 이면 «상호작용 동작 N개는 대상이 없어 빼고 붙였습니다» 통지.
- 자리(spec «붙이기»): 기준 노드가 있고 루트가 아니면 그 뒤 형제로 차례대로, 아니면 루트 끝. 부모가 그 타입을 안 받으면 `reason`(지금 `+` 의 문장 상수를 가져다 쓴다 — 글자를 복사하지 않는다).
- Cmd+D(`duplicate`)는 클립보드를 거치지 않는다 — `duplicateOps` 가 노드마다 제 바로 뒤에 넣는다(id 재발급은 `prepareNodesForPaste` 와 같은 함수 · keep 은 늘 참).

### E-D5. 선택 모델

```ts
// apps/web/src/store/editor-store.ts — 상태
selectedNodeId: string | null          // 기준 노드 — 지금 이름 · 뜻 그대로(쓰는 자리 14 파일 · 181 줄을 안 바꾼다)
selectedNodeIds: readonly string[]     // 기준 노드 포함 · 문서 차례 · 조상/자손이 함께 없음 · 루트는 혼자일 때만
// 명령
readonly select: (nodeId: string | null) => void                  // 지금 것 — 하나로
readonly toggleSelect: (nodeId: string) => void                    // Cmd+클릭
readonly selectRange: (toId: string, visibleOrder: readonly string[]) => void   // Shift+클릭
readonly selectMany: (nodeIds: readonly string[], mode: 'replace' | 'add') => void  // Cmd+A · 사각형
```

- 규칙은 순수 함수 `store/selection-set.ts` 의 `normalizeSelection(document, ids, anchor)` 하나 — 문서에 없는 것 빼기 · 조상/자손이면 새로 누른 것이 관련된 쪽을 대신 · 루트는 혼자일 때만 · 문서 차례 · 상한(`MAX_OPS_PER_EDIT`).
- 문서가 바뀌는 자리(`#selectionFor` 를 부르는 자리)는 목록에도 `normalizeSelection` 을 건다 — «사라진 노드는 놓는다»가 목록에 그대로 선다.
- `selectionBlockedBy(nodeId)` 는 그대로 — 남이 잡은 노드는 목록에 못 든다.

### E-D6. 잠금 집합 — 서버

```ts
// apps/api/src/ws/protocol.ts
const LockFrame = z.strictObject({
  type: z.literal('lock'),
  pageId: z.uuid(),
  /** 이 연결이 쥘 서브트리 뿌리 전부. 하나면 지금과 같다. 빈 배열은 `unlock` 과 같다. */
  nodeIds: z.array(z.string().regex(NODE_ID_PATTERN)).max(MAX_OPS_PER_EDIT),
  lockId: …optional(),   // 지금 그대로
})
// `nodeId`(하나)는 받아 `[nodeId]` 로 읽는다 — 에이전트 · 옛 화면 호환(둘 다 오면 400)
// ServerFrame 'lock-denied' — `nodeIds: string[]`(거절된 것만) · `lockId`. «이 연결은 이제 아무것도 쥐지 않는다» 가 아니라
//   «거절된 것만 안 쥔다 — 나머지(받은 것 · 앞서 쥔 것 가운데 집합에 남은 것)는 쥔다» 로 뜻이 바뀐다.
```

- `apps/api/src/lock/store.ts` 는 연결 → 서브트리 여럿. 한 `lock` 프레임은 페이지 행을 쥔 채(지금처럼) **집합에 새로 드는 것만** `selectionVerdict`(`lock/check.ts`)로 묻고, 빠지는 것은 놓고, 남는 것은 TTL 을 갱신한다(하트비트 = 같은 집합을 다시 보냄).
- `locks` 프레임의 `LiveLock` 은 서브트리 하나에 하나 — 연결 하나가 여러 줄을 낸다. 「연결 하나가 드는 잠금은 하나다」를 적은 주석 · README 를 센다(`git grep -n "하나다" apps/api/src/ws apps/api/src/lock apps/api/README.md`).
- 2차 방어(`lockConflictOfOps`)는 바꾸지 않는다 — 남의 잠금 여럿을 이미 다룬다. 잠금을 «안 기다린다»고 적은 자리(`restore-lock-census` 등 — `CLAUDE.md` 「잠금 순서를 바꾸는 고침은…」)를 먼저 센다.
- MCP · CLI 가 `lock` 을 보내는지 센다(`git grep -n "'lock'" packages/mcp packages/cli`) — 보내면 `nodeId` 호환으로 그대로 선다.

### E-D7. 잠금 집합 — 화면

- `realtime/lock-channel.ts` · `use-node-lock.ts` 는 «기준 노드 하나» 대신 `selectedNodeIds` 를 보낸다(목록이 바뀔 때 · 하트비트). `lock-denied` 의 `nodeIds` 는 목록에서 빼고 «○○님이 편집 중이라 고를 수 없습니다» 를 하단 바에 한 줄로(누가인지는 `locks` 목록에서 읽는다 — 지금 출처 하나 규칙).
- `lockId` 짝짓기(«내가 마지막으로 보낸 것의 거절인가»)는 그대로.

### E-D8. 사각형 고르기

- `canvas/canvas-marquee.ts`(순수 — 사각형 · 노드의 그려진 상자 → 고를 id 들) · 캔버스 표면의 포인터 처리(누름 → 4px → 사각형 · 뗌 → `selectMany`). 노드 상자는 지금 선택 외곽선이 쓰는 측정(줌 · 칸 스크롤 반영)을 함께 쓴다. 끝 스크롤은 `drag/use-pointer-drag.ts` 의 `edgeScroll` 을 쓴다 — 드래그 부품의 동작을 바꾸지 않는다.
- 4px 안에서 떼면 지금 클릭(고르기 — Cmd · Shift 몸짓 포함)이다. 손잡이 · 미리보기 끌기 중에는 사각형이 안 선다.

### E-D9. 일괄 속성

- 같은 타입이면 `panels/property-panel.tsx` 가 기준 노드의 패널을 그리되 칸마다 «모두 같은 값인가»를 보고 다르면 «여러 값»(빈 칸 + 자리표 — 칸 종류마다: 글 · 수 · 고르개 · 켬/끔)을 보인다. 바꾼 칸은 모든 노드에 `propOps` / `variantOps` 를 차례로 지어 묶음 하나로 보낸다.
- 타입이 섞이면 «N개 고름 — 일괄 속성 편집은 같은 타입끼리만»과 삭제 단추. 상호작용 · 코멘트 탭은 하나일 때만.

## 파일 구조

| 파일 | 새 / 바꿈 | 책임 |
|---|---|---|
| `packages/schema/src/clipboard.ts` | 새 | 봉투 쓰기 · 읽기 · 붙일 노드 짓기 · `MAX_OPS_PER_EDIT` |
| `apps/web/src/edit/preset-apply.ts` | 바꿈 | `remapForPage` → `prepareNodesForPaste` |
| `apps/web/src/edit/editor-shortcuts.ts` | 새 | 단축키 표 · 플랫폼 |
| `apps/web/src/edit/use-editor-shortcuts.ts` | 새 | 호스트 · 캔버스 리스너 |
| `apps/web/src/edit/use-clipboard.ts` · `paste-ops.ts` | 새 | 클립보드 이벤트 · 붙이기 · 복제 · 여럿 지우기 연산 |
| `apps/web/src/shell/shortcut-help.tsx` | 새 | `?` 대화 상자(`ShellDialog`) |
| `apps/web/src/panels/structure-tree.tsx` | 바꿈 | `SHORTCUTS` 걷음 · 표 읽기 · 여러 줄 강조 · Cmd/Shift+클릭 |
| `apps/web/src/routes/editor.tsx` | 바꿈 | 두 훅 · `undo`/`redo` 공유 · 도움말 상자 |
| `apps/web/src/store/editor-store.ts` · `store/selection-set.ts`(새) | 바꿈 | 선택 목록 |
| `apps/api/src/lock/*` · `ws/lock.ts` · `ws/protocol.ts` · `ws/routes.ts` · `http/patch-ops.ts` | 바꿈 | 잠금 집합 · 상수 |
| `apps/web/src/realtime/lock-channel.ts` · `use-node-lock.ts` | 바꿈 | 집합 보내기 · 부분 거절 |
| `apps/web/src/canvas/canvas-marquee.ts`(새) · `canvas.tsx` | 새 · 바꿈 | 사각형 · 외곽선 여럿 |
| `apps/web/src/panels/property-panel.tsx` | 바꿈 | «여러 값» · 일괄 |

## 트랙

| 트랙 | 태스크 | 브랜치 | 리뷰 |
|---|---|---|---|
| E1 | 1 ~ 4 | `feat/e1-shortcuts` | 리뷰어 한 번(단축키가 입력을 먹는 길 · 클립보드 봉투 · 붙이기 자리) |
| E2 | 5 ~ 9 | `feat/e2-multiselect`(E1 병합 뒤 main 에서) — api + web 한 브랜치 | 리뷰어 한 번 + 고친 장치만 겨누는 좁은 반증 |
| E3 | 10 | 코디네이터가 띄우는 문서 워커 | — |

---

## Task 1: 클립보드 봉투(schema)

**Files:** Create `packages/schema/src/clipboard.ts` · Modify `packages/schema/src/index.ts`(내보내기) · `apps/web/src/edit/preset-apply.ts` · `apps/api/src/http/patch-ops.ts`(`MAX_OPS_PER_EDIT`) · Test `packages/schema/test/clipboard.test.ts`

**Interfaces:** Produces E-D3 의 넷.

- [ ] 실패 케이스 먼저: 봉투 왕복(쓰기 → 읽기가 같은 노드) · 봉투 아닌 글(빈 글 · 일반 JSON · `{wirebound:"page"}` · 잘린 JSON) → `null` · 옛 version 봉투가 마이그레이션되어 읽힘 · 검증 실패 노드(없는 타입 · 중복 id) → `null` · 노드 둘을 함께 붙이면 형제를 가리키는 대상이 새 id 로 따라감 · 붙이는 밖의 노드 대상 — 문서에 있으면 남김 / 없으면 동작째 뺌(수 1) · 동작이 다 빠진 상호작용은 상호작용째 뺌 · 페이지 대상도 같음 · `props` · `setProp.value` 가 입력과 공유되지 않음.
- [ ] 돌려서 실패 확인 → 구현 → 통과.
- [ ] `preset-apply.ts` 의 `remapForPage` 를 `prepareNodesForPaste(nodes, { node: () => true, page: () => true }, generate)` 로 바꾸고 프리셋 케이스(`apps/web/test/edit/preset-apply*.test.ts`)가 그대로 초록인지 돌린다(`generate` 를 세는 케이스의 «임시 뿌리 몫 1»이 그대로인지 값으로 적는다).
- [ ] `OpsBody` 의 `200` 을 `MAX_OPS_PER_EDIT` 로 — api 케이스 그대로 초록.
- [ ] 구분력: id 를 한 번에 짓지 않고 노드마다 짓는 변조(형제 대상 케이스가 값으로 죽음) · keep 을 늘 참으로 둔 변조(뺌 케이스가 죽음).
- [ ] 커밋.

## Task 2: 단축키 표 · 리스너 · 되돌리기 · 삭제 · 순서 · 선택 이동 · 도움말

**Files:** Create `apps/web/src/edit/editor-shortcuts.ts` · `edit/use-editor-shortcuts.ts` · `shell/shortcut-help.tsx` · Modify `panels/structure-tree.tsx` · `routes/editor.tsx` · `shell.css` · Test `apps/web/test/edit/editor-shortcuts.test.ts` · `test/edit/use-editor-shortcuts.test.tsx`

**Interfaces:** Produces E-D1 · E-D2. Consumes 구조 트리 명령 훅의 삭제 · 순서 · 계층 함수, `useEditCommit` 의 `undo` · `redo`, `useCanvasDocument`.

- [ ] 실패 케이스(jsdom) 먼저 — 표: 키마다 `shortcutFor` 가 그 명령(mac · other 각각 — Cmd 와 Ctrl 이 엇갈려 안 섬) · Alt+문자가 특수문자가 되는 판(`code` 로 읽음) · `?` 는 Shift+/.
- [ ] 리스너: 입력 칸 · `contenteditable` · 조합 중(`isComposing`) · 모달 열림 · 메뉴 트리 상자 포커스 · 뷰 모드에서 편집 명령 — 어느 것도 `run` 을 안 부름. 캔버스 문서에서 난 키도 `run` 을 부름(jsdom 에서 iframe 문서를 넘겨 잰다). `preventDefault` 를 선 명령에만.
- [ ] Cmd+Z / Cmd+Shift+Z 가 머리 단추와 **같은 함수**를 부른다 — 단추와 키 각각으로 되돌린 판이 같은 스토어 상태(되돌리기 스택 · 큐)를 낸다.
- [ ] 구조 트리: `SHORTCUTS` 를 걷고 표를 읽는다. 트리 포커스의 Delete 가 확인 없이 바로 지운다(기존 «삭제 확인» 케이스를 세어 옮긴다 — 줄 `…` «삭제»의 두 번 누르기 확인 케이스는 그대로 초록). Alt 조합 케이스 그대로 초록.
- [ ] 선택 이동: ↑/↓ 이 접힌 줄을 건너뛰고 · ← 가 부모 · → 가 첫 자식(펼친 줄일 때) · 남이 잡은 노드는 건너뛴다(`selectionBlockedBy`).
- [ ] 도움말: `?` 로 열고 표 + 클립보드 세 줄을 그린다(플랫폼 글자) · Escape 로 닫힘.
- [ ] 구현 → 통과 → 구분력(`isTypingSurface` 거름을 뗀 변조 · 캔버스 문서 리스너를 뗀 변조 · 트리 Delete 를 확인으로 되돌린 변조 — 각각 혼자 죽는 케이스) → 커밋.

## Task 3: 클립보드 · 붙이기 · 복제 · 잘라내기

**Files:** Create `apps/web/src/edit/use-clipboard.ts` · `edit/paste-ops.ts` · Modify `routes/editor.tsx` · Test `apps/web/test/edit/paste-ops.test.ts` · `test/edit/use-clipboard.test.tsx`

**Interfaces:** Consumes Task 1 · Task 2 의 거름(같은 판정 함수를 export 해 둘이 쓴다 — `edit/editor-shortcuts.ts` 의 `shortcutsBlocked(event, …)`). Produces E-D4.

- [ ] 실패 케이스 먼저 — `pasteOps`: 기준 노드 뒤 차례대로(노드 셋) · 기준 없음/루트 → 루트 끝 · 부모가 그 타입을 안 받음 → `reason`(`+` 의 상수와 같은 글자 — `toBe(상수)`) · 연산 수 > 200 → `reason` · 만든 연산을 차례로 적용한 문서가 검증을 지남.
- [ ] `duplicateOps`: 노드마다 제 바로 뒤 · 사본 id 가 새 것 · 형제 대상 따라감. `removeManyOps`: 형제 셋 지우기 · 앞 연산이 미는 좌표를 따라감(차례로 적용해 남은 것이 맞는지).
- [ ] 리스너(jsdom — `ClipboardEvent` 흉내에 `clipboardData` 를 실어): 복사가 봉투를 `text/plain` 에 싣고 `preventDefault` · 입력 칸의 복사는 건드리지 않음 · 붙이기가 편집 하나를 보내고 붙인 노드를 고름 · 봉투 아닌 글은 편집 0 · 통지 0 · 뺀 동작 수 통지 · 잠긴 자리(`editBlockedBy`)면 편집 0 + 통지 · 잘라내기 = 봉투 + 지우기 편집 하나 · 뷰 모드에서 붙이기 · 잘라내기 안 섬(복사는 섬).
- [ ] 되돌리기: 붙이기 · 복제 · 잘라내기 뒤 Cmd+Z 한 번에 그 편집이 통째로 돌아옴(스토어 문서 값).
- [ ] 구현 → 통과 → 구분력 → 커밋.

## Task 4: E1 실브라우저 · 정본 · 게이트 · 보고

**Files:** Create `apps/web/build-test/editor-shortcuts.test.ts` · `build-test/clipboard.test.ts` · Modify 정본 `docs/superpowers/specs/2026-08-03-wirebound-design.md` 「설계서 화면 구조」(단축키 표 · 클립보드) · 보고 `docs/superpowers/plans/2026-10-03-e1-report.md`

- [ ] 실브라우저 판: 캔버스 iframe 안을 눌러 포커스를 캔버스 문서에 둔 채 Cmd+Z · Delete · Alt+↑ · 화살표 이동 · `?` 가 선다 · 속성 패널 글 칸에서 Backspace · Cmd+Z 가 칸의 것이다(노드 편집 0 — 서버 `headSeq` 그대로) · 한글 조합 중 Backspace(CDP `Input.imeSetComposition`) · 실제 OS 클립보드로 복사 → **다른 탭(같은 브라우저 컨텍스트) · 다른 프로젝트 페이지**에 붙여넣기 → 서버 문서에 새 id 로 들어감 · 다른 프로젝트의 페이지를 가리키던 동작은 빠지고 통지. 클립보드 권한: playwright `context.grantPermissions(['clipboard-read','clipboard-write'])` 가 없는 판에서도 `copy`/`paste` 이벤트 길이 서는지 값으로 적는다.
- [ ] 정본 「설계서 화면 구조」에 단축키 표 · 클립보드 문단(지금 참인 것만 — `04-citation.md`). 「권한 모델」의 «화면이 편집을 미리 묻는 자리»에 붙이기 · 복제 · 키보드 삭제를 더한다.
- [ ] 게이트(`caffeinate -i` · 차례로): `pnpm typecheck` · `pnpm build` · `pnpm test --maxWorkers=50%` · `pnpm test:build` · `pnpm test:browser` · `EDITOR_STACK_BUNDLE=build pnpm test:browser` — 수마다 실행 · 건너뜀 · 실패.
- [ ] 보고: 태스크별 케이스 · 변조 표(변조 · 죽은 케이스 · 실패 값) · 인구조사 명단 · 접근 이름 인구조사 · 브리프와 달라진 것 · 게이트 수 · 이월 후보 → 커밋.

## Task 5: 잠금 집합 — 서버

**Files:** Modify `apps/api/src/lock/store.ts` · `lock/check.ts` · `ws/lock.ts` · `ws/protocol.ts` · `ws/routes.ts` · `apps/api/README.md`(WS 계약) · Test `apps/api/test/ws-lock-set.test.ts`(새) · 기존 잠금 케이스

**Interfaces:** Produces E-D6.

- [ ] 먼저 센다: «연결 하나가 드는 잠금은 하나» 를 전제로 한 자리(코드 · 주석 · README · 테스트) · 잠금을 «안 기다린다»고 적은 자리 · MCP · CLI 의 `lock` 송신. 표로 보고에 적는다.
- [ ] 실패 케이스 먼저: 집합 셋을 청해 셋 다 받음(`locks` 에 세 줄) · 그중 하나를 남이 쥠 → 둘만 받고 `lock-denied.nodeIds` 가 그 하나 · 집합을 줄이면 빠진 것만 놓임 · 같은 집합 다시 보냄 = 하트비트(TTL 갱신 — 가짜 시계) · 빈 배열 = 다 놓음 · `nodeId` 하나 프레임 호환 · `nodeId` 와 `nodeIds` 둘 다 → 400 류 거절 · 201 개 → 거절 · 연결 종료 → 집합 전부 해제 · 내 집합 안에서 조상/자손이 함께 오면(화면이 안 보내지만) 서버가 무엇을 하는지 정해 잠근다(겹침을 자기 것과 견주지 않음 — 둘 다 받음).
- [ ] **경주:** 두 연결이 겹치는 집합을 같은 순간 청함 — 페이지 행에 둘이 줄 선 것을 본 뒤 놓는다(`withPageRowHeld` 꼴 — `CLAUDE.md` 「경주를 재는 케이스는 두 요청이 겹친 판만 센다」). 겹친 잠금 0 · 진 쪽의 `lock-denied` 에 겹친 노드만.
- [ ] 2차 방어 케이스(편집 423) 그대로 초록 · 남의 잠금 여럿 판에서 묶음 하나가 그중 하나에 닿으면 423.
- [ ] 구현 → 통과 → 구분력(«새로 드는 것만 판정»을 «전부 판정»으로 · 빠지는 것 안 놓음 · 페이지 행 안 쥠 — 각각 값으로 죽는 케이스) → README WS 계약 → 커밋.

## Task 6: 선택 목록 · 잠금 집합 — 화면

**Files:** Create `apps/web/src/store/selection-set.ts` · Modify `store/editor-store.ts` · `realtime/lock-channel.ts` · `realtime/use-node-lock.ts` · `realtime/protocol.ts` · Test `apps/web/test/store/selection-set.test.ts` · 기존 잠금 · 선택 케이스

**Interfaces:** Produces E-D5 · E-D7. Consumes Task 5 의 프레임.

- [ ] 실패 케이스 먼저 — `normalizeSelection`: 문서에 없는 id 빼기 · 조상 뒤 자손을 누르면 자손이 대신 · 자손 뒤 조상을 누르면 조상이 대신(그 조상의 다른 자손도 빠짐) · 루트는 혼자 · 문서 차례 · 상한 200.
- [ ] 스토어: `toggleSelect` · `selectRange`(보이는 차례 · 접힌 줄 · 남이 잡은 줄은 건너뜀) · `selectMany` · 문서가 바뀌면 목록 정리(남이 하나를 지움 · 되돌리기로 사라짐) · 기준 노드가 빠지면 목록의 마지막 · `selectedNodeId` 를 읽는 기존 케이스가 그대로 초록(하나 고른 판).
- [ ] 잠금: 목록이 바뀌면 `lock` 프레임 `nodeIds` 로 · 하트비트가 집합 · `lock-denied.nodeIds` 를 목록에서 뺌 + 하단 바 한 줄(이름은 `locks` 목록에서) · `lockId` 짝짓기 그대로.
- [ ] 구현 → 통과 → 구분력 → 커밋.

## Task 7: 고르는 몸짓 — 트리 · 캔버스 · Cmd+A · 사각형

**Files:** Create `apps/web/src/canvas/canvas-marquee.ts` · Modify `panels/structure-tree.tsx` · `canvas/canvas.tsx` · `edit/editor-shortcuts.ts`(`selectSiblings` 켬) · `shell.css` · Test `apps/web/test/canvas/canvas-marquee.test.ts` · 트리 · 캔버스 케이스

**Interfaces:** Consumes Task 6 의 명령. Produces E-D8.

- [ ] 실패 케이스 먼저 — `canvas-marquee`(순수): 완전히 든 상자만 · 조상이 든 자손은 뺌 · 루트 뺌 · 줌 · 칸 스크롤 반영한 좌표.
- [ ] 트리: Cmd+클릭 더함 · 뺌 · Shift+클릭 범위 · 고른 줄 모두 강조 · 클릭 하나가 하나로 돌아감. 캔버스: Cmd+클릭 · 외곽선 여럿(기준 노드 진하게) · 손잡이는 하나일 때만. Cmd+A 형제 모두.
- [ ] 사각형: 4px 안 뗌은 클릭 · 넘으면 사각형 · Shift 로 더함 · 손잡이 · 카드 끌기 중엔 안 섬 · 끝 스크롤.
- [ ] 구현 → 통과 → 구분력 → 커밋.

## Task 8: 일괄 동작 · 일괄 속성

**Files:** Modify `edit/paste-ops.ts`(여럿) · `panels/property-panel.tsx` · `panels/tree-row-actions.tsx`(여럿일 때 끔 · 이유) · `edit/use-clipboard.ts` · `shell.css` · Test 해당 케이스

- [ ] 실패 케이스 먼저 — 여럿 삭제 · 복사(문서 차례) · 잘라내기 · 복제가 각각 편집 하나 · Cmd+Z 한 번에 통째로 · 그중 하나가 남의 잠금 자리면 편집 0 + 통지 · 연산 200 넘으면 미리 막음 · 위로/아래로/들여쓰기/내어쓰기/화살표 이동이 여럿에서 꺼지고 이유가 섬.
- [ ] 속성 패널: 같은 타입 둘 — 같은 값 칸은 값, 다른 칸은 «여러 값»(글 · 수 · 고르개 · 켬/끔 각각) · 한 칸을 바꾸면 그 칸만 모두에(다른 칸은 노드마다 제 값 그대로 — 서버 문서로 단언) · 타입 섞임 — 안내 + 삭제 · 상호작용 · 코멘트 탭은 하나일 때만.
- [ ] 구현 → 통과 → 구분력 → 커밋.

## Task 9: E2 실브라우저 · 정본 · 게이트 · 보고

**Files:** Create `apps/web/build-test/multiselect.test.ts` · Modify 정본 「설계서 화면 구조」 · 「소프트 잠금」 · 「개인 undo/redo」(일괄 편집 하나 = 되돌리기 하나) · 보고 `docs/superpowers/plans/2026-10-03-e2-report.md`

- [ ] 실브라우저 판: 두 계정 — alice 가 셋을 고른 채 bob 화면에 배지 셋 · bob 이 그중 하나를 고르려 하면 막힘 · bob 이 먼저 쥔 노드를 alice 가 사각형에 넣으면 그것만 빠지고 한 줄 · alice 가 일괄 속성을 바꾸면 bob 화면에 한 번에 반영 · Cmd+Z 한 번에 통째로 · 사각형(줌 0.5 · 1.5 · 칸 스크롤 · 끝 스크롤) · 일괄 삭제 뒤 되돌리기.
- [ ] 정본 · README(Task 5 에서 고친 WS 계약과 맞춤) — 지금 참인 것만.
- [ ] 게이트 여섯(Task 4 와 같음) · 보고(Task 4 와 같은 꼴 + 잠금 전제 인구조사 표) → 커밋.

## Task 10: E3 — 문서 맞춤

코디네이터가 E2 병합 뒤 띄운다: 정본 · api README · 두 보고의 이월을 장부로 모은 마무리 보고 `docs/superpowers/plans/2026-10-03-e-report.md`.

## 이 계획이 정하지 않고 넘기는 것

- 잠금 상한 200 이 실브라우저 · 서버에서 감당되는지(Task 5 · 9 가 재서 바꿀 수 있다 — 바꾸면 `MAX_OPS_PER_EDIT` 와 갈라 상수를 둘로).
- 여럿 고른 판의 손잡이 끌기 · 타입 섞인 공통 속성 · 메뉴 트리 여럿 선택 · 단축키 사용자 정의(spec 범위 밖).
