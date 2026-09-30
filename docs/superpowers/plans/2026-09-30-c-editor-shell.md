# C — 에디터 셸 개편 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 이 저장소에서는 `CLAUDE.md` 「메인 세션은 디스패치·판정·병합만 한다」를 따른다 — 트랙마다 워크트리의 Orca 워커가 한다.

**Goal:** 에디터 머리의 도구를 `…` 메뉴와 하단 바로 나누고, 트리 툴바를 노드별 `+` · `…` 와 드래그로 바꾸고, 프로젝트 설정에 멤버 · 삭제를, 새 계정 설정 페이지에 비밀번호 바꾸기 · API 토큰을 둔다.

**Architecture:** 셸 쪽은 공용 부품 둘(행동 메뉴 `ActionMenu` · 모달 `ShellDialog`)을 먼저 세우고 머리 · 목록 머리 · 트리 줄이 그것을 쓴다. 스냅샷 · 내보내기는 팝오버의 몸체(`SnapshotsBody` · 내보내기 몸체)를 그대로 대화 상자에 넣어 복원 콜백 · 셸 세대 장치를 건드리지 않는다. 트리 드래그는 트리에 매이지 않는 포인터 드래그 부품(`usePointerDrag`)이 끌기 상태와 표시를 맡고, 놓을 자리 판정과 보낼 편집은 지금의 판정(`treeAbilities` · `structureAbilities`)과 편집(`moveNodeOps` · 메뉴/페이지 `PATCH {parentId|menuNodeId, sortOrder}`)을 쓴다. api 는 `POST /api/auth/password` 하나를 더한다.

**Tech Stack:** React 19 · react-router 7 · vitest(jsdom) · playwright-core(`apps/web/build-test`) · Fastify · Kysely.

**Spec:** `docs/superpowers/specs/2026-09-30-editor-shell-design.md` — 모든 절. 정본 `docs/superpowers/specs/2026-08-03-wirebound-design.md` 「설계서 화면 구조」 · 「권한 모델」 은 C4 가 고친다.

## Global Constraints

- **웹의 인구조사에 오른다** — `apps/web/test/api-consumers.test.ts`(`METHODS` · `EXPECTED` — 새 메서드와 기존 메서드의 새 호출자), `test/helpers.tsx` 의 `fakeApi`(새 메서드마다 `notStubbed`), `shell-css-coverage`(새 `wb-shell-*` 마다 규칙), `shell-css-palette`(`SCREEN_ROOTS` — 새 라우트 `/account`), `shell-css`(가드의 `WRAPPERS`), `shell-css-narrow`(`WRAPPING_GROUPS` — 머리 · 하단 바의 무리), `role-access`(`.role` 은 `projectAbilities` 인자로만). 태스크마다 어느 명단에 올렸는지 보고에 표로 적는다.
- **CSS 는 `apps/web/src/shell.css` 하나**, 셀렉터는 `.wb-shell-*` 클래스뿐이다.
- **모달은 `ShellDialog` 하나만 쓴다** — 이 과제가 앱의 첫 모달을 세운다(spec 「대화 상자」). 다른 확인은 지금처럼 인라인 확인이다(`projects/delete-confirm.tsx` 의 꼴).
- **캔버스 문서는 same-origin iframe 이다** — 전역 리스너 · `instanceof` 규칙은 `CLAUDE.md` 「캔버스 문서는 same-origin iframe 이다」. 메뉴 · 대화 상자의 «바깥 누름 닫기»와 드래그의 포인터 추적은 캔버스 문서의 이벤트도 받아야 한다(`useCanvasDocument`) — 드래그는 `setPointerCapture` 로 붙잡는다.
- **편집 권한 규칙은 지금 값 그대로** — `editable`(편집 모드 && `canEdit`) · `canEdit`(역할). 새 부품이 역할을 직접 읽지 않는다(`role-access`).
- **드래그는 새 편집 종류를 만들지 않는다** — 구조는 `moveNodeOps`, 메뉴는 `updateMenu(…, { parentId, sortOrder })`, 페이지는 `updatePage(…, { menuNodeId, sortOrder })`. 되돌리기 · 방송 · 거절 수습이 지금 길을 탄다.
- `apps/web/src` 를 바꾸므로 게이트에 `pnpm test:browser` 와 `EDITOR_STACK_BUNDLE=build pnpm test:browser` 가 든다.
- 주석 · 인용: `docs/guideline/base/03-comments.md` · `04-citation.md`. 테스트 보고: 실행 · 건너뜀 · 실패 수. jsdom 값과 실브라우저 값을 구분해 적는다.

## Review Focus

1. **복원을 대화 상자에서 보내고 곧바로 닫거나 페이지를 옮긴다** — 복원 답 · «누가 복원했나» 통지 · 다시 읽기가 지금 팝오버 판과 같게 선다(대화 상자가 내려가도 답을 셸이 받는다 · 내려간 셸의 답은 `shellGeneration` 으로 버린다). → Task 2(jsdom) · Task 4(실브라우저 — 지금 복원 케이스를 대화 상자 판으로 옮겨 그대로 초록).
2. **노드를 끌다 놓을 수 없는 자리 · 남이 잡은 노드 · 자기 자손 위에서 놓는다** — 아무 편집도 안 나가고 표시가 걷힌다. 끄는 중 캔버스 iframe 위로 포인터가 지나가도 끌기가 끊기지 않는다. → Task 12 · Task 13.
3. **다른 부모로 끌어 놓은 메뉴 · 페이지의 자리** — `PATCH {parentId, sortOrder}` 가 놓은 자리(그 부모 안의 차례)에 선다. 서버가 `sortOrder` 를 «결과 기준» 으로 재번호하는 규칙(`use-tree-commands.tsx` 의 `move` 머리말 표)이 부모를 바꾸는 판에서도 같은지 먼저 잰다. → Task 12.
4. **비밀번호 바꾸기로 지금 비밀번호를 맞혀 본다** — 틀린 시도가 로그인 한도(계정 키 · 주소 키)에 함께 세이고, 한도를 넘으면 옳은 비밀번호도 429 다. 토큰으로 부르면 403. → Task 7.
5. **두 사이드바를 넓힌 채 창을 줄인다** — 캔버스 몫(`CANVAS_MIN_WIDTH`)이 남고 가로 스크롤이 안 생긴다 · 기억한 폭이 지금 창에 안 맞으면 조여 읽는다. → Task 3 · Task 4.

---

## 확정한 결정

### D1. 행동 메뉴 `ActionMenu`(`apps/web/src/shell/action-menu.tsx`)

- 단추(`aria-haspopup="menu"` · `aria-expanded`) + 목록(`role="menu"`) + 항목(`role="menuitem"`, 링크 항목은 `<Link role="menuitem">`). 선택적 머리(`heading` — 로그인한 사람 이름).
- 열기: 클릭 · Enter · Space · ↓ (첫 항목에 포커스). ↑ · ↓ · Home · End 로 옮기고 Enter 로 고른다. Escape · 바깥 누름 · 항목 고름 → 닫고 단추로 포커스를 돌려준다. 끈 항목(`disabled`)은 건너뛴다.
- 바깥 누름은 지금 `usePopoverDismiss` 를 쓴다(캔버스 문서 포함 여부를 그 훅의 계약대로). 자리는 `usePopoverSide` 로 창 밖으로 안 나가게 한다.
- 항목 모양: `{ key, label, onSelect?, to?, disabled?, danger? }`.

### D2. 대화 상자 `ShellDialog`(`apps/web/src/shell/shell-dialog.tsx`)

- `<dialog>` 의 `showModal()` / `close()`. props `{ open, title, onClose, children }` — 제목은 `<h2 id>` 로 `aria-labelledby`, 닫기 단추 하나.
- Escape(`cancel` 이벤트) · 닫기 단추 → `onClose`. 닫히면 연 요소로 포커스를 돌려준다(연 순간의 `document.activeElement` 를 쥔다 — 메뉴 항목에서 열었으면 메뉴가 닫히며 `…` 단추로 돌아간 뒤이므로 `…` 로 간다).
- jsdom 은 `HTMLDialogElement.showModal` 이 없다 — 없으면 `open` 속성으로 대신 세우는 갈래를 부품 안에 둔다(케이스는 두 갈래를 다 잰다).
- 바깥(backdrop) 누름으로는 닫지 않는다 — 스냅샷 폼에 친 글을 잃지 않게.

### D3. 머리와 `…`(에디터)

- 머리: `wb-shell-lead`(로고 링크 `aria-label="프로젝트 목록"` + 아이콘 SVG + «wirebound» · `<h1>` 이름) · 가운데 무리(`UndoTools` · 모드) · `ActionMenu`.
- 항목: 계정 설정(`to="/account"`) · 프로젝트 설정(`to=/projects/:id/settings`) · 스냅샷(대화 상자) · 프로젝트 내보내기(대화 상자) · 로그아웃(`danger` 아님, 지금 `SessionMenu` 의 `run` 흐름 — `settleEdits` 를 받는다).
- 머리에서 걷는 것: `SnapshotsPanel` 토글 · `ExportPanel` 토글 · «설정» 링크 · `SessionMenu` 묶음(이름 · API 토큰 · 로그아웃 단추). **로그아웃 로직과 세션 통지(`switched` · 실패 문장)는 옮긴다** — `session/session-menu.tsx` 의 `run` 을 훅(`useLogout(settle)`)으로 빼서 두 `…`(에디터 · 목록)가 함께 쓰고, 통지는 하단 바(에디터) · 목록 머리 아래(목록)에 선다.
- 스냅샷 대화 상자의 몸체는 `SnapshotsBody`(지금 팝오버 안의 것)에 지금 콜백 넷을 그대로 준다. `SnapshotsPanel` 의 팝오버 껍데기(토글 · `usePopoverDismiss` · `usePopoverSide`)는 걷는다. 내보내기도 같다(몸체를 빼 대화 상자에).

### D4. 하단 바(`apps/web/src/shell/shell-footer.tsx`)

- 그리드: `.wb-shell` 의 영역에 `footer` 줄을 더한다 — 캔버스 칸 아래, 좌 · 우 사이드바 사이(`grid-template-areas` 에서 `side canvas panel` 아래 `side footer panel`). D 가 캔버스와 하단 바 사이에 판을 끼울 수 있게 영역 이름으로 짓는다.
- 왼쪽 통지 무리: `EditAlert` · `EditWarnings` · `RemoteAlert` · `ThemeAlert` · 권한 바뀜(`roleNotice`) · 세션 통지(D3). `role` · 문안 그대로. 여럿이면 줄바꿈으로 위로 자란다(`flex-wrap`) — 잘라 숨기지 않는다.
- 오른쪽: 지금 `ShellTools` 에서 뷰포트 고르개 · 줌 무리를 옮긴다(모드는 머리에 남는다 — `ShellTools` 를 둘로 가른다).

### D5. 우측 패널 폭(`shell/sidebar-layout.ts`)

- `StoredLayout` 에 `panelWidth` 를 더한다(없으면 기본 — 옛 저장값 호환). 상수 `PANEL_WIDTH_DEFAULT = 300` · `PANEL_WIDTH_MIN = 300`.
- `SIDE_RESERVED_WIDTH`(우측 300 고정 전제)를 걷고 `sideWidthMax(shellWidth, panelWidth)` · `panelWidthMax(shellWidth, sideWidth)` — 둘 다 `shellWidth - 상대폭 - 손잡이 둘 - CANVAS_MIN_WIDTH` 를 넘지 않는다. 창이 줄면(`resize`) 둘을 차례로 조인다(우측 먼저 최소까지, 그다음 좌측).
- 손잡이는 `ShellResizer`(`orientation="vertical"` · 라벨 «우측 패널 폭») — 끄는 방향이 좌측 손잡이와 반대(왼쪽으로 끌면 넓어진다).
- 그리드의 패널 트랙은 좌측처럼 `auto` + `.wb-shell-panel` 인라인 `width`.

### D6. 트리 줄 행동과 드래그

- **줄 행동:** `panels/tree-row-actions.tsx` — `+` 는 `ActionMenu`(항목: 메뉴 트리 «하위 메뉴 · 페이지 추가», 구조 트리 «안에 추가 · 아래 추가»), `…` 는 `ActionMenu`(spec 「트리」 표). 항목은 지금 명령(`TreeCommands` · `StructureCommands`)을 부른다 — 명령은 **선택된 줄**에 대해 도므로, 줄의 `+` · `…` 를 누르면 먼저 그 줄을 고른다(`select`) 뒤 명령을 부른다.
- 서는 조건: `editable` 이고 (줄에 마우스가 올라옴 || 선택된 줄 || 줄 안 포커스). CSS `:hover` · `:focus-within` + 선택 클래스로 — 상태를 더하지 않는다. 키보드: 줄에 포커스가 있으면 Tab 으로 `+` · `…` 에 닿는다.
- 뿌리 `+`: 트리 제목 줄(`ShellRegion` 머리)에 둔다 — 메뉴 «최상위 메뉴 추가», 구조 «페이지에 추가»(뿌리 노드를 고른 뒤 «안에 추가»).
- 타입 · 패턴 · 프리셋 고르개(`TypePicker` · `PatternPicker` · `PresetPicker`)는 지금 툴바 아래가 아니라 그 줄 바로 아래에 연다(지금 `visiblePicker` 판정 그대로).
- 이름 변경 입력(`tree-input.tsx`) · 옮기기 목록 · 삭제 두 번 누르기 확인은 지금처럼 트리 영역 안에 선다(자리만 줄 곁으로).
- **드래그 부품:** `apps/web/src/drag/use-pointer-drag.ts` — `pointerdown` 뒤 4px 넘게 움직이면 시작, `setPointerCapture`, 끄는 동안 `onOver(point) → DropTarget | null` 을 불러 표시를 세우고, `pointerup` 에 `onDrop(target)`, Escape · `pointercancel` 에 취소. 트리 영역 끝 24px 안이면 초당 일정 속도로 스크롤. 표시(가는 선 · 줄 강조)는 부품이 그리는 겹(`drag/drop-indicator.tsx`)이다. **트리를 모른다** — D 가 같은 부품을 목록 → 트리 · 캔버스에 쓴다.
- **놓을 자리 판정:** 줄 높이의 위 25% → 앞 형제, 아래 25% → 뒤 형제, 가운데 → 자식. 판정 함수는 순수 함수로 둔다 — 메뉴 `tree/tree-drop.ts` 의 `menuDropTarget(menu, dragged, over, zone)`, 구조 `edit/structure-drop.ts` 의 `structureDropTarget(document, draggedId, overId, zone, catalog)`. 못 놓으면 `null`(자기 · 자손 · 자식을 안 받는 컴포넌트 · 페이지 위에 메뉴 · 남이 잡은 노드).
- **놓으면:** 구조 — `moveNodeOps(document, draggedId, parentId, index)` 를 지금 편집 전송 길로. 메뉴 — 메뉴는 `updateMenu(id, { parentId, sortOrder })`, 페이지는 `updatePage(id, { menuNodeId, sortOrder })`(부모가 같으면 `sortOrder` 만). 성공 · 실패 처리는 지금 `move` · `reparentTo` 의 길을 쓴다(`use-tree-commands.tsx` 에 `dropTo(target)` 명령을 더한다).

### D7. 비밀번호 api(`apps/api/src/routes/auth.ts`)

- `POST /api/auth/password` `{ currentPassword: string, newPassword: string }` · `preHandler: app.requireAuth`.
- 토큰이면 403(`routes/tokens.ts` 의 `requireSessionUser` 꼴 — 공용으로 옮겨 `auth/session-only.ts` 에서 둘이 쓴다).
- `limiter.begin(currentUser.email, requestAddressKey(…))` — `limited` 면 429 + `Retry-After`. 견준 뒤 틀리면 401 `LOGIN_FAILURE_MESSAGE` 와 같은 문장(«비밀번호가 맞지 않습니다» 꼴 — 실제 상수를 쓴다) — 세션은 그대로 둔다(401 이지만 웹이 로그아웃으로 읽지 않게 오류 코드 `wrong-password` 를 싣는다). 맞으면 `succeeded()`.
- 새 비밀번호: `NewPassword` 로 검사(실패 400 · 이유 문장), `hashPassword`.
- 트랜잭션: `recheckCredential(trx, { kind: 'session', id })` → `users.password_hash` 갱신 → `sessions` 에서 그 사용자의 **이 세션이 아닌** 행 삭제. 답 `204`.
- 지운 세션의 WS 는 지금 세션 삭제 길로 끊긴다(무엇이 끊는지 먼저 센다 — 폴링 · 프레임 재확인).
- README 「인증」 절에 한 줄 · 오류 코드 표에 `wrong-password`.

### D8. 계정 설정 · 프로젝트 설정

- `/account`(`routes/account.tsx`): 절 셋 — 내 정보(`useSessionUser` — 이름 · 이메일), 비밀번호(`settings/password-section.tsx`), API 토큰(지금 `routes/tokens.tsx` 몸체를 `account/tokens-section.tsx` 로 옮김). `/tokens` 는 `<Navigate to="/account" replace />`.
- 비밀번호 폼: 지금 · 새 · 새 확인. 새 둘이 다르면 요청 없이 문장. 성공 → «비밀번호를 바꿨습니다. 다른 기기의 로그인은 끊겼습니다.» · 칸 비움. `wrong-password` · 429 · 400 은 칸 곁 문장.
- 웹 클라이언트: `changePassword(current, next)` · `listMembers` · `addMember(email, role)` · `updateMemberRole(userId, role)` · `removeMember(userId)`(api 계약은 `apps/api/README.md` 「멤버」).
- 프로젝트 설정 멤버 절(`settings/members-section.tsx`) · 위험 구역(`settings/danger-section.tsx` — `projects/delete-confirm.tsx` 를 옮겨 씀). 목록 줄의 삭제(`routes/project-list.tsx` · `projects/use-project-commands.tsx`)는 뗀다.
- 프로젝트 설정 머리: 로고 · «에디터로 돌아가기»(지금 «편집기로» 링크를 이 문안으로).

---

## 파일 구조

```
apps/web/src/shell/action-menu.tsx                 (신규) D1
apps/web/src/shell/shell-dialog.tsx                (신규) D2
apps/web/src/shell/shell-footer.tsx                (신규) D4
apps/web/src/shell/brand-link.tsx                  (신규) 로고 링크 + SVG
apps/web/src/shell/snapshots-panel.tsx · export-panel.tsx   팝오버 껍데기 걷고 몸체 내보냄
apps/web/src/shell/sidebar-layout.ts · shell-resizer.tsx    D5
apps/web/src/session/session-menu.tsx               useLogout 로 가름(묶음 컴포넌트는 걷음)
apps/web/src/routes/editor.tsx                      머리 · 하단 바 · 우측 손잡이
apps/web/src/routes/project-list.tsx                목록 머리 `…` · 줄 삭제 뗌
apps/web/src/drag/use-pointer-drag.ts · drop-indicator.tsx   (신규) D6
apps/web/src/tree/tree-drop.ts · edit/structure-drop.ts      (신규) 놓을 자리 판정
apps/web/src/panels/tree-row-actions.tsx            (신규) 줄 `+` · `…`
apps/web/src/panels/menu-tree.tsx · menu-toolbar.tsx · structure-tree.tsx · structure-toolbar.tsx   툴바 걷고 줄 행동 · 드래그
apps/web/src/tree/use-tree-commands.tsx             dropTo
apps/web/src/routes/account.tsx · account/tokens-section.tsx · settings/password-section.tsx   (신규) D8
apps/web/src/routes/tokens.tsx                       몸체 옮김 · Navigate
apps/web/src/settings/members-section.tsx · danger-section.tsx   (신규) D8
apps/web/src/routes/settings.tsx                     절 둘 · 머리
apps/web/src/api/{client,http-client,types}.ts      D8 메서드
apps/web/src/app.tsx                                 /account
apps/web/src/shell.css                               새 블록
apps/api/src/routes/auth.ts · auth/session-only.ts · routes/tokens.ts   D7
apps/api/README.md                                   D7
apps/web/build-test/editor-shell-*.test.ts · tree-drag.test.ts   (신규) 실브라우저 판
```

---

## 트랙

| 트랙 | 태스크 | 선행 |
|---|---|---|
| **C1 셸** | 1 ~ 6 | main |
| **C3 설정 · 계정** | 7 ~ 10 | main — C1 과 나란히(겹치는 파일은 `routes/project-list.tsx` 하나: C1 은 머리, C3 은 줄 삭제) |
| **C2 트리** | 11 ~ 13 | C1 병합(`ActionMenu`) |
| **C4 문서 · 게이트** | 14 | 셋 병합 |

C1 의 `…` 는 `/account` 로 링크한다 — 그 라우트는 C3 이 세운다. 둘이 병합되기 전 main 에서는 링크가 «찾을 수 없음» 라우트로 간다(C1 · C3 을 이어서 병합한다).

---

## Task 1: `ActionMenu` · `ShellDialog`

**Files:** `shell/action-menu.tsx` · `shell/shell-dialog.tsx` · `shell.css` · Test `test/shell/action-menu.test.tsx` · `test/shell/shell-dialog.test.tsx`

- [ ] **Step 1: 실패하는 테스트**
  - 메뉴: 단추 클릭 → `role=menu` · 첫 항목 포커스 · `aria-expanded=true`. ↓ ↑ Home End 가 끈 항목을 건너뛴다. Enter → `onSelect` 한 번 · 닫힘 · 포커스가 단추. 링크 항목 Enter → 주소 이동(`MemoryRouter` 의 위치). Escape · 바깥 `pointerdown` → 닫힘 · 포커스 단추 · `onSelect` 0. 머리(`heading`)가 목록 위에.
  - 대화 상자: `open` true → `role=dialog`(또는 `<dialog open>`) · 이름이 제목 · 첫 포커스가 대화 상자 안. Escape(`cancel`) · 닫기 단추 → `onClose` 한 번. 닫히면 연 요소로 포커스. `showModal` 이 없는 판(jsdom 기본)과 있는 판(스텁) 둘 다.
- [ ] **Step 2 ~ 4:** 실패 확인 → 구현(D1 · D2) → `pnpm vitest run apps/web/test/shell/action-menu.test.tsx apps/web/test/shell/shell-dialog.test.tsx` 통과 · typecheck.
- [ ] **Step 5: 구분력** — 끈 항목 건너뛰기를 뗀 판 · 포커스 돌려주기를 뗀 판 · Escape 처리를 뗀 판에서 각 케이스가 값으로 죽는지.
- [ ] **Step 6: 커밋** — `feat(web): shell action menu and modal dialog primitives`

## Task 2: 머리 · `…` · 스냅샷/내보내기 대화 상자

**Files:** `routes/editor.tsx` · `shell/brand-link.tsx` · `shell/snapshots-panel.tsx` · `shell/export-panel.tsx` · `session/session-menu.tsx` · `shell.css` · 인구조사 테스트 · Test `test/shell/editor-header.test.tsx`, `test/shell/snapshots-panel.test.tsx`(토글 → 대화 상자로 옮김), `test/shell/restore-banner-lift.test.tsx` · `test/edit/reload-sent-edits.test.tsx`(여는 길 바꿈)

- [ ] **Step 1: 실패하는 테스트**
  - 머리에 링크 «프로젝트 목록»(`href="/"`) · `<h1>` 이름 · 모드 · (편집 · editor 이상) 되돌리기 · `…`. 머리에 «스냅샷» · «내보내기» · «설정» · «API 토큰» · «로그아웃» 단추 · 링크 없음.
  - `…` 항목 차례와 이름: 계정 설정 · 프로젝트 설정 · 스냅샷 · 프로젝트 내보내기 · 로그아웃. viewer 도 같다. 메뉴 머리에 사람 이름.
  - «스냅샷» → 대화 상자 «스냅샷» 안에 지금 목록 · 폼. 복원 콜백 넷이 지금처럼 스토어에 닿는다(지금 `snapshots-panel.test.tsx` 의 복원 케이스를 대화 상자로 여는 판으로 옮겨 그대로 초록). 대화 상자를 닫은 뒤 온 복원 답도 `ownRestoreAnswered` 에 닿는다.
  - «프로젝트 내보내기» → 대화 상자 안의 지금 내보내기 몸체.
  - «로그아웃» → 지금 `SessionMenu` 케이스(보낸 편집을 기다림 · 실패 문장 · 세션 전환 통지)를 옮긴 판이 그대로 초록.
- [ ] **Step 2 ~ 4.** web 전량(`pnpm vitest run --project web`) — 옮긴 케이스 수 · 지운 케이스와 까닭을 보고에.
- [ ] **Step 5: 구분력** — 대화 상자에 복원 콜백 하나(`onRestored`)를 안 넘긴 판 · 셸 세대 거름을 뗀 판.
- [ ] **Step 6: 커밋** — `feat(web): editor header with brand link and a … menu; snapshots and export open as dialogs`

## Task 3: 하단 바

**Files:** `shell/shell-footer.tsx` · `routes/editor.tsx`(`ShellTools` 가름 · 통지 옮김) · `shell.css` · `test/shell-css-narrow.test.ts` · Test `test/shell/shell-footer.test.tsx`

- [ ] **Step 1: 실패하는 테스트**
  - 하단 바(`<footer className="wb-shell-footer" aria-label="하단 바">` — 셸 그리드 안이라 `contentinfo` 랜드마크가 아니다)에 뷰포트 고르개 · 줌 − 값 + 화면 맞춤. 머리에는 없음.
  - 통지 다섯 종이 하단 바 안에 선다(편집 실패 `alert` · 경고 · 남의 변경 · 테마 못 실음 · 권한 바뀜). 머리 안에는 없음. 둘 이상이 함께 설 때 모두 보인다(잘림 없음 — jsdom 은 DOM 에 둘 다 있는지, 실브라우저는 Task 4).
- [ ] **Step 2 ~ 4.**
- [ ] **Step 5: 커밋** — `feat(web): editor footer bar with notices, viewport and zoom`

## Task 4: 우측 폭 · 화면 맞춤 · 머리 폭 · 실브라우저 판

**Files:** `shell/sidebar-layout.ts` · `routes/editor.tsx` · `shell.css` · Test `test/shell/sidebar-layout.test.ts`(더함), `build-test/editor-shell-layout.test.ts`(신규), 스냅샷 토글을 여는 build-test 넷(`editor-restore-signal-order` · `canvas-iframe-host-events` · `editor-restore-own-signal` · `editor-restore-unanswered` — `git grep -n "wb-shell-snapshots-toggle\|name: '스냅샷'" apps/web/build-test` 로 다시 센다)

- [ ] **Step 1: 화면 맞춤 재현 먼저** — 이 태스크의 변경 전 트리(Task 3 까지)에서 뷰포트 프리셋 여섯(1920 · 1440 · 1280 · 1024 · 768 · 375) × 좌측 폭(기본 · 최대) × 창 1440×900 · 1280×800 에서 «화면 맞춤» 뒤 `.wb-shell-canvas` 의 `scrollWidth - clientWidth` 를 표로. 0 이 아닌 칸이 있으면 원인(`fitZoom` 의 여백 · 세로 스크롤바 폭 · 반올림)을 값으로 가른다. 재현이 안 되면 표만 보고에 적고 고치지 않는다.
- [ ] **Step 2: 실패하는 테스트**
  - 순수 함수: `sideWidthMax(shell, panel)` · `panelWidthMax(shell, side)` 가 캔버스 몫을 남김 · 창 축소 조임 차례(우측 먼저) · 옛 저장값(`panelWidth` 없음) → 기본 300.
  - 실브라우저 `editor-shell-layout`: 우측 손잡이 끌기 · 화살표 · 두 번 눌러 기본값 · 새로고침 뒤 폭 유지. 두 폭 최대 + 창 1024 로 줄임 → 캔버스 폭 ≥ 320 · `.wb-shell` 가로 스크롤 0. 통지 둘이 함께 선 하단 바가 둘 다 보이고 캔버스가 준다. (재현됐으면) 화면 맞춤 가로 스크롤 0.
  - 스냅샷 토글을 쓰던 build-test 넷을 `…` → «스냅샷» 으로 여는 판으로 바꾼다 — 단언은 그대로 초록.
- [ ] **Step 3 ~ 5:** 구현 · 통과 · `pnpm test:browser` 두 판(dev · `EDITOR_STACK_BUNDLE=build`).
- [ ] **Step 6: 머리 폭 표** — `shell.css` 의 «머리가 한 줄에 들어가는 폭» 표를 새 머리로 다시 잰다(다시 재는 명령을 표 곁에 둔다).
- [ ] **Step 7: 구분력** — 조임 차례를 뒤집은 판 · 옛 `SIDE_RESERVED_WIDTH` 로 되돌린 판 · (고쳤으면) 화면 맞춤 고침을 뗀 판.
- [ ] **Step 8: 커밋** — `feat(web): resizable right panel sharing the width budget; fit-to-screen without horizontal scroll`

## Task 5: 프로젝트 목록 머리의 `…`

**Files:** `routes/project-list.tsx` · `session/session-menu.tsx`(`useLogout`) · `shell.css` · Test `test/routes/project-list.test.tsx`(더함)

- [ ] **Step 1: 실패하는 테스트** — 목록 머리 `…` 항목: 계정 설정 · (인스턴스 관리자만) 테마 관리 · 로그아웃. 목록 머리에 옛 계정 묶음 · «테마 관리» 링크 없음. 다른 탭 로그인 소식으로 들어온 관리자에게도 «테마 관리» 항목(`tab-channel` 의 `isInstanceAdmin` 길).
- [ ] **Step 2 ~ 4.** — [ ] **Step 5: 커밋** — `feat(web): project list header … menu`

## Task 6: C1 게이트 · 보고

- [ ] `pnpm typecheck` · `pnpm build` · `pnpm test` · `pnpm test:build` · `pnpm test:browser` · `EDITOR_STACK_BUNDLE=build pnpm test:browser`.
- [ ] 보고 `docs/superpowers/plans/2026-09-30-c1-report.md` — 태스크별 케이스 · 변조 · 인구조사 표 · 화면 맞춤 재현 표 · 게이트 수.

---

## Task 7: 비밀번호 api

**Files:** `apps/api/src/routes/auth.ts` · `auth/session-only.ts`(신규 — `requireSessionUser` 를 옮김) · `routes/tokens.ts`(가져옴) · `apps/api/README.md` · Test `apps/api/test/auth-password.test.ts`

- [ ] **Step 1: 실패하는 테스트**
  - 옳은 지금 · 규칙에 맞는 새 → 204 · 새 비밀번호로 로그인 200 · 옛 비밀번호 로그인 401.
  - 이 세션은 그대로(`/me` 200) · 같은 사용자의 다른 세션 둘은 401 · 다른 사용자의 세션은 그대로 · 그 사용자의 API 토큰은 그대로(토큰 요청 200).
  - 틀린 지금 → 401 `wrong-password` · 이 세션은 그대로(`/me` 200).
  - 한도: 틀린 시도를 계정 한도만큼 → 다음 요청(옳은 지금이어도) 429 + `Retry-After`. 비밀번호 바꾸기의 실패가 같은 계정의 **로그인** 한도에도 세인다(로그인 429).
  - 새 비밀번호 규칙 밖 → 400 · 이유.
  - 토큰으로 부름 → 403 · 토큰 관리와 같은 문장 꼴.
  - 재확인: 요청이 재확인 질의에 선 사이 그 세션을 지운다 → 401 · 비밀번호 안 바뀜(`holdQuery` — `CLAUDE.md` «재확인 자리의 순서를 재는 케이스»).
  - 다른 세션의 WS 연결이 끊기는지(지금 세션 삭제가 WS 를 끊는 길을 먼저 세고, 그 길로 잰다).
- [ ] **Step 2 ~ 4.** `pnpm vitest run apps/api/test/auth-password.test.ts` · api 전량 · `pre-guard-hook-census` 등 인구조사가 새 라우트를 요구하면 올린다.
- [ ] **Step 5: 구분력** — 한도 `begin` 을 뗀 판 · 다른 세션 삭제를 뗀 판 · 이 세션까지 지우는 판 · 재확인을 뗀 판.
- [ ] **Step 6: 커밋** — `feat(api): change own password with the current one, counted by the login limiter; other sessions end`

## Task 8: 계정 설정 페이지

**Files:** `routes/account.tsx` · `account/tokens-section.tsx` · `settings/password-section.tsx` · `routes/tokens.tsx` · `app.tsx` · `api/*`(`changePassword`) · `shell.css` · 인구조사 · Test `test/routes/account.test.tsx`, `test/routes/tokens.test.tsx`(옮김)

- [ ] **Step 1: 실패하는 테스트**
  - `/account`: 이름 · 이메일 · 비밀번호 폼 · 토큰 절(지금 `/tokens` 케이스를 옮긴 판이 그대로 초록).
  - 비밀번호: 새 둘이 다름 → 요청 0 · 문장. 성공 → 문장 · 칸 비움. `wrong-password`(401) → 칸 곁 문장 · **로그아웃되지 않음**(세션 만료 401 과 가른다). 429 → 기다릴 시간 문장. 400 → 이유.
  - `/tokens` → `/account` 로 넘어감.
- [ ] **Step 2 ~ 4.** — [ ] **Step 5: 구분력** — `wrong-password` 를 세션 만료로 읽는 판(로그아웃됨)이 죽는지.
- [ ] **Step 6: 커밋** — `feat(web): account settings page with profile, password change and API tokens`

## Task 9: 프로젝트 설정 — 멤버 절

**Files:** `settings/members-section.tsx` · `routes/settings.tsx` · `api/*`(멤버 넷) · `shell.css` · 인구조사 · Test `test/settings/members-section.test.tsx`

- [ ] **Step 1: 실패하는 테스트**
  - 목록(이름 · 이메일 · 역할) — 모든 역할.
  - owner: 초대(이메일 · 역할) → `addMember` · 목록 갱신 · 404 «가입된 계정이 없습니다» 꼴 · 409 «이미 멤버» 꼴(api 봉투 문장). 역할 바꾸기 → `updateMemberRole` · 마지막 owner 강등 거절 문장. 제외 → 인라인 확인 → `removeMember` · 마지막 owner 거절 문장.
  - editor · viewer: 폼 · 바꾸기 · 제외 없음.
  - 내가 나를 강등 · 제외한 뒤 설정 페이지가 권한을 다시 읽는다(owner 칸이 닫힘).
- [ ] **Step 2 ~ 4.** — [ ] **Step 5: 커밋** — `feat(web): project settings members section`

## Task 10: 프로젝트 설정 — 위험 구역 · 목록 줄 삭제 뗌 · C3 게이트

**Files:** `settings/danger-section.tsx` · `routes/settings.tsx`(머리 «에디터로 돌아가기» · 로고) · `routes/project-list.tsx` · `projects/use-project-commands.tsx` · `projects/delete-confirm.tsx`(자리 옮김) · Test `test/settings/danger-section.test.tsx`, `test/projects/*`(삭제 케이스 옮김)

- [ ] **Step 1: 실패하는 테스트** — owner 에게만 위험 구역 · 이름을 정확히 쳐야 확정 · 삭제 → 목록으로 이동 · 목록에 그 프로젝트 없음. 목록 줄에 삭제 없음.
- [ ] **Step 2 ~ 4.** — [ ] **Step 5: 게이트** — C1 과 같은 여섯. **Step 6: 보고** `docs/superpowers/plans/2026-09-30-c3-report.md`. **Step 7: 커밋** — `feat(web): danger zone on project settings; project list rows no longer delete`

---

## Task 11: 포인터 드래그 부품

**Files:** `drag/use-pointer-drag.ts` · `drag/drop-indicator.tsx` · `shell.css` · Test `test/drag/use-pointer-drag.test.tsx`(`test/pointer-events.ts` 도구)

- [ ] **Step 1: 실패하는 테스트** — 4px 안 움직임은 클릭(드래그 안 섬 · `onDrop` 0). 넘으면 시작 · `onOver` 가 준 표시가 선다 · `null` 이면 표시 없음 · `pointerup` 에 그 자리로 `onDrop` 한 번 · `null` 자리에서 놓으면 0. Escape · `pointercancel` → 취소 · 표시 걷힘 · `onDrop` 0. 끝 24px 안 → 스크롤(가짜 시계).
- [ ] **Step 2 ~ 4.** — [ ] **Step 5: 커밋** — `feat(web): pointer drag primitive with drop indicator and edge scroll`

## Task 12: 메뉴 트리 — 줄 행동 · 드래그

**Files:** `panels/tree-row-actions.tsx` · `panels/menu-tree.tsx` · `panels/menu-toolbar.tsx`(걷음 또는 줄 행동으로 바꿈) · `tree/tree-drop.ts` · `tree/use-tree-commands.tsx`(`dropTo`) · `shell.css` · Test `test/tree/tree-drop.test.ts` · `test/panels/menu-tree*.test.tsx`(툴바 케이스를 줄 행동으로 옮김) · `build-test/tree-drag.test.ts`(메뉴 판)

- [ ] **Step 1: 서버 순서 규칙 먼저** — `PATCH menu {parentId, sortOrder}` · `PATCH page {menuNodeId, sortOrder}` 가 «옮긴 뒤 그 부모 안 차례» 로 서는지 api 케이스로 잰다(`use-tree-commands.tsx` 의 `move` 머리말 표의 부모 바꿈 판). 다르면 드래그의 `sortOrder` 계산을 그 규칙에 맞추고 보고에 적는다.
- [ ] **Step 2: 실패하는 테스트**
  - `menuDropTarget`: 메뉴 → 메뉴의 위 · 아래 · 안, 페이지 → 메뉴 안 · 페이지의 위 · 아래, 자기 · 자손 안 → `null`, 메뉴 → 페이지 안 → `null`, 반환 `{ parentId, index }`.
  - 줄 `+` · `…`: 메뉴 줄 `+`(하위 메뉴 · 페이지 추가) · `…`(spec 표) · 페이지 줄 `…` · 뿌리 `+`. 누르면 그 줄이 선택되고 지금 명령이 돈다(지금 툴바 케이스를 옮긴 판이 그대로 초록 — 지운 케이스와 까닭을 보고에). 뷰 모드 · viewer → `+` · `…` 없음.
  - 실브라우저 `tree-drag`(메뉴): 페이지를 다른 메뉴 둘째 자리로 끌어 놓음 → 서버 트리에서 그 메뉴의 둘째 페이지 · 메뉴를 다른 메뉴 안으로 → 서버 `parentId` · 자기 자손 위에 놓음 → 요청 0 · Escape → 요청 0 · 끄는 중 캔버스 위를 지나 돌아와 놓음 → 정상.
- [ ] **Step 3 ~ 5.** — [ ] **Step 6: 구분력** — 자손 판정을 뗀 판 · 부모를 바꾸며 `sortOrder` 를 안 싣는 판.
- [ ] **Step 7: 커밋** — `feat(web): menu tree row actions and drag to reorder or reparent`

## Task 13: 구조 트리 — 줄 행동 · 드래그 · C2 게이트

**Files:** `panels/structure-tree.tsx` · `panels/structure-toolbar.tsx` · `edit/structure-drop.ts` · `panels/tree-row-actions.tsx` · `shell.css` · Test `test/edit/structure-drop.test.ts` · `test/panels/structure-*.test.tsx`(옮김) · `build-test/tree-drag.test.ts`(구조 판)

- [ ] **Step 1: 실패하는 테스트**
  - `structureDropTarget`: 자식을 받는 컴포넌트 안 · 형제 앞뒤 · 자기 · 자손 · 자식을 안 받는 컴포넌트 안 → `null` · 뿌리 앞뒤 → `null`(뿌리는 형제가 없다) · 남이 잡은 노드(잠금 목록) → `null`.
  - 줄 `+`(안에 추가 · 아래 추가 — 고르개가 그 줄 곁) · `…`(위로 · 아래로 · 들여쓰기 · 내어쓰기 · 삭제). 지금 툴바 케이스를 옮긴 판이 초록.
  - 실브라우저 `tree-drag`(구조): 노드를 다른 컨테이너 안으로 → 서버 문서 · 되돌리기 → 원래 자리 · 남이 잡은 노드는 안 끌림(두 클라이언트) · 자식을 안 받는 컴포넌트 위 → 요청 0.
- [ ] **Step 2 ~ 4.** — [ ] **Step 5: 구분력** — 카탈로그 자식 판정을 뗀 판 · 잠금 판정을 뗀 판.
- [ ] **Step 6: 게이트** — 여섯. **Step 7: 보고** `docs/superpowers/plans/2026-09-30-c2-report.md`. **Step 8: 커밋** — `feat(web): structure tree row actions and drag to move nodes`

---

## Task 14: 문서 · 전량 게이트(C4)

- [ ] 정본 `2026-08-03-wirebound-design.md` 「설계서 화면 구조」: 그림 · 머리 · 하단 바 · `…` · 트리의 줄 행동 · 드래그 · 우측 폭 · 셸 밖의 화면(계정 설정 · 프로젝트 설정의 멤버 · 위험 구역). 「권한 모델」: 비밀번호 바꾸기(세션만 · 한도 공유 · 다른 세션 끊김 · 토큰 유지). 지금 참인 것만.
- [ ] `apps/api/README.md`: 새 라우트 · 오류 코드 `wrong-password`.
- [ ] spec 머리 문장(«병합될 때 … 고친다»)을 지금 참인 것으로.
- [ ] 게이트 여섯 · 보고 `docs/superpowers/plans/2026-09-30-c-report.md`(트랙별 병합 · 이월 장부).

---

## 이 계획이 정하지 않고 넘기는 것

- 하단 컴포넌트 목록과 끌어 놓는 배치 — D. D 는 `usePointerDrag` · `grid-template-areas` 의 하단 영역을 쓴다.
- 이름 · 이메일 바꾸기 · 비밀번호 찾기.
- 설정 페이지의 실시간(A4 이월) — 멤버 절도 남의 변경을 다시 읽기로만 만난다.
