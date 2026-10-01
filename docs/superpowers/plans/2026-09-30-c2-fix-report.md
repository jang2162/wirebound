# C2 트리 — 리뷰 대응 보고

브랜치 `feat/c2-tree`. 리뷰 `2026-09-30-c2-review.md`(빨강 9 = schema 5 · api 4 · Chrome 빨강 4), 구현 보고 `2026-09-30-c2-report.md`. 브리프의 차례대로 main 위로 올림 → H1(잠금 판정의 좌표) → M1(드래그 `pointerId`) → L1(줄 `…` 삭제의 둘째 누름) — 발견 4 는 이월.

값의 출처: «Chrome» 은 `apps/web/build-test/`(editor-stack · dev 번들) · «api» 는 `withRealApi`(테스트 DB 5463) · «schema» 는 순수 함수 · «jsdom» 은 web 프로젝트.

## 새 커밋 목록(rebase 로 다시 쓰임)

| 옛 | 새 | 커밋 |
|---|---|---|
| `42e770d0` | `d77ff937` | test(api): drag sortOrder is the post-move index … |
| `b061123c` | `c12fecf8` | feat(web): pointer drag primitive … |
| `e5e528b7` | `b9892a8b` | feat(web): menu tree row actions and drag … |
| `4205ee4f` | `afa762db` | feat(web): structure tree row actions and drag … |
| `ed7121c5` | `46931082` | test(web): match the header more-menu by exact name … |
| `b959cdef` | `0567553b` | docs: C2 trees report … |
| `86bd598f` | `8b465b16` | test: red cases — lock check compares shifted op pointers … |
| `1b5717fd` | `78f86a24` | test+docs: C2 review — browser cases … |
| — | `3998d2ac` | fix(lock): edit lock check follows locked nodes op by op (H1) |
| — | `659ba805` | fix(web): drag listens only to the pointer that started it (M1) |
| — | `47044974` | test(web): carried-over two-client reorder case as it.fails (발견 4) |
| — | `f7fe75a6` | fix(web): action menu swallows the same-spot second press (L1) |
| — | `e1a71ef1` | docs(comments): state the lock, drag and menu cases as current rules |
| — | (이 보고의 커밋) | docs(plans): C2 review fix report |

## 1. main 위로 올림

`git rebase main`(main `0181fd04`) — **충돌 0**. 보고가 예상한 자리를 의미로 다시 봤다:

| 자리 | main(C3)이 바꿨나 | 결과 |
|---|---|---|
| `apps/web/src/shell.css` | 바꿈(PageHead · 계정 · 멤버 규칙) | 자동 병합 — 두 쪽 규칙이 다른 블록이라 겹치지 않았다 |
| `apps/web/src/routes/editor.tsx`(`ShellRegion` 의 `actionsRef`) | 안 바꿈 | C2 그대로 |
| `apps/web/src/shell/action-menu.tsx` | 안 바꿈 — C3 의 `shell/page-head.tsx` 가 같은 부품을 부른다 | C2 의 넷(`onOpen` · `compact` · 항목 `title` · `describedBy`)은 선택 속성이라 `PageHead` 의 호출이 그대로 맞다(`pnpm typecheck` 0 · `test/shell/page-head.test.tsx` 초록) |
| 인구조사 명단(`api-consumers` · `role-access` · `shell-css-narrow`) | C3 가 바꿈 | C2 는 그 셋을 안 건드렸다 — 자동 병합 |

합친 판(rebase 직후 · 내 고침 전): `pnpm typecheck` 0 · `pnpm build` 0 · web jsdom **147 파일 · 2679 통과** · `pnpm test:browser` **31 파일 · 166 실행 · 162 통과 · 0 건너뜀 · 4 실패 = 리뷰의 «(결함)» 넷뿐**. 첫 `test:browser` 판은 실행 도중 내가 schema 소스를 고쳐(`lockPointers` 를 걷음) 번들이 깨져 100 건너뜀 · 27 파일 실패였다 — 오염된 판이라 버렸고, 고친 파일을 스크래치로 빼고 HEAD 내용으로 되돌려 다시 잰 값이 위다(되살린 뒤 `cmp` 일치).

## 2. H1 — 잠금 판정의 좌표(리뷰 F2)

### 입구 표

| 입구 | 판정 | 비고 |
|---|---|---|
| REST `PATCH …/ops`(세션) | `lockConflictError` → **`lockConflictOfOps`** | `routes/pages.ts` |
| MCP `patch_page` | 같은 REST `PATCH …/ops`(토큰) | `packages/mcp` 는 판정을 갖지 않는다 |
| WS `patch` | `lockConflictError` → **`lockConflictOfOps`** | `ws/patch.ts` |
| `PUT …/schema` | `lockConflictError` → **`lockConflictOfOps`**(`replace /root` · `replace /version`) | 첫 연산 `/root` 가 모든 잠금 경로의 조상이라 **남의 잠금이 하나라도 있으면 423** — 뜻이 그대로다(`lock-census` «PUT …/schema» 줄 초록) |
| 코멘트 번호 셋(`routes/comments.ts`) | 안 본다 | `lock-census` 의 `false` 줄 그대로(설계서 «코멘트는 잠금 대상이 아니다») |
| 복원(`services/restore.ts`) | 안 본다 | `lock-census` 의 `false` 줄 그대로 |
| 가져오기(`services/page-import.ts`) | 안 본다 | 새 페이지 — 잠금이 설 수 없다 |
| 웹 — 끌어 놓기(`editBlockedBy`) | 스토어 `#editConflict` → **`lockConflictOfOps`** | `structure-drop.ts` 의 둘째 물음(옮기기 전 좌표)은 걷었다 |
| 웹 — 되돌리기 · 다시 실행(`#startFrom`) | 스토어 `#editConflict` → **`lockConflictOfOps`** | 역연산 묶음 그대로 |
| 웹 — 노드 고르기(`lockedBy`) · 서버 획득(`selectionVerdict`) | `findLockConflict`(`findNodePath` 하나) | 편집이 아니다 — 그대로 |

새 함수를 안 거치는 **편집** 입구: 코멘트 · 복원 · 가져오기 — 셋 다 잠금을 안 보는 것이 판정이다(`lock-census` 표). `one-verdict.test.ts` 에 «편집의 판정도 선언은 schema 에 하나 · 양쪽이 부른다»(api `lock/check.ts` · web `store/editor-store.ts`)와 «`lockPointers` 가 schema · api · web 어디에도 없다»를 더했다.

### 고침(`3998d2ac`)

`@wirebound/schema` 의 `lockConflictOfOps({ document, locks, ops, viewerUserId })`(`packages/schema/src/lock.ts`). `lockPointers` 는 걷었다.

- 편집 전 문서에서 잠긴 노드마다 경로를 찾고, 연산마다 **그 자리를 따라간다** — 배열에 넣거나 뺀 자리보다 뒤에 선 잠긴 자리의 번호를 민다. 연산의 포인터는 그 연산이 선 문서에서 읽는다(`move` 는 `from` 을 그 문서에서, `path` 를 `from` 을 뺀 문서에서). 겹침은 `findLockConflict` 와 같은 `overlaps`(한쪽이 다른 쪽의 조상이거나 같다).
- **리뷰의 F2(연산마다 노드 id 로 다시 찾기)와 다른 점** — id 로 다시 찾으면 앞 연산이 다른 노드의 `id` 를 잠긴 id 로 바꾼 묶음에서 잠금이 가짜를 가리킨다. 자리를 따라가면 그 일이 없다(케이스 «다른 노드의 id 를 잠긴 id 로 바꾼 뒤 진짜 n_b 를 지움» — 옛 판정도 이 판은 막았다 · 설계를 잠그는 케이스).
- **포인터를 적용이 읽는 대로 읽는다** — 배열 번호는 `Number(token)`(`readMember` · `arrayIndex`) · 넣는 자리의 `-` 는 길이. **리뷰 밖에서 찾은 원래 있던 길:** 옛 판정은 글자로 견줘 `remove /root/children/01` · `replace /root/children/1.0/…` 가 잠긴 `n_b` 를 지나갔다(schema 스크래치 탐침 — 옛 `pass` · 새 423, api MCP `remove …/01` 옛 판 `{ status: 200, b: null }`).
- **적용이 실패하는 묶음의 답 — `null`(판정하지 않음)**: 실패하는 연산에 닿기 전에 부딪친 잠금이 있으면 그 잠금, 실패하는 연산 자체가 잠긴 자리와 겹치면 그 잠금(적용 전에 잰다), 아니면 `null` — 파이프라인이 `patch-failed` 로 거절한다. 뿌리 자체(`''`)는 모든 잠금과 겹쳐 423. 읽을 수 없는 포인터 · 프로토타입 토큰 · 검증 전 문서(`children` 안 `null`)에서 **던지지 않는다**. 옛 판정과 갈리는 판: `[remove /root/children/9, remove /root/children/1]` 옛 423 → 새 `null`(어차피 `patch-failed`).
- **C11(잠긴 노드 자리에 형제를 끼움 → 423)** 은 그대로다 — 지금 설계(`structure-actions.ts` 표).
- 웹: 스토어 `#editConflict`(웹의 `lockConflictOfOps` 부르는 자리 하나) · `editBlockedBy` · `#startFrom`. `structure-drop.ts` 의 둘째 물음 · `structure-drop.test.ts` 의 «편집의 포인터가 잠긴 자리의 지금 경로에 닿으면 null»(거짓 거절을 잠그던 케이스)을 걷고 «잠긴 노드 뒤 형제 앞으로 옮기는 것은 선다»로 바꿨다. 서버 대역을 든 웹 케이스 셋(`props-lock` · `toolbar-abilities` · `undo-locks`)도 같은 함수를 부른다.
- 설계서 「소프트 잠금」 2차 방어 줄에 «편집의 자리는 연산마다 그 연산이 선 문서의 좌표로 잰다 …»를 더했다.

### 케이스 · 재현 값

| 파일 | 수 | 고치기 전(옛 판정) | 고친 뒤 |
|---|---|---|---|
| `packages/schema/test/lock-shifted-pointers.test.ts` | 28(리뷰 5 + 표 17 + C11 1 + 실패 묶음 5) | 리뷰 5 빨강 · 표의 C1 · C2 · C5 · C6 · C7 · C10 · C12 · C14 · `01` · `1.0` 빨강 · «실패하는 연산 뒤는 재지 않는다» · «검증 전 문서에서 안 던진다» 빨강(MH1 값) | 28 초록 |
| `apps/api/test/lock-shifted-pointers.test.ts` | 5(리뷰 4 + `01` 1) | 리뷰 4 그대로(REST · WS `{200, [n_b1, n_b2, n_a]}` · MCP `{200, null}` · 거짓 거절 423) · `01` `{200, null}` | 5 초록 |
| `packages/schema/test/lock.test.ts` | 27 | `lockPointers` 절 → `lockConflictOfOps` 절(입력 문서 안 바꿈 포함) · «선택이 편집보다 엄격하다»의 편집을 `replace …/type` 로 | 27 초록 |
| `apps/web/test/lock/undo-locks.test.tsx` | +2 | Divider «위로»를 되돌림 · 잠긴 Card 가 뒤 — 옛: 나가지 않음 `{calls: 1}` / `editBlockedBy` 옛: 잠긴 노드 뒤로 옮기기가 막힘 | 초록 `{calls: 2, status: [200, 200]}` · `null` |
| `apps/web/test/lock/one-verdict.test.ts` | +2 | — | 초록 |

기존 잠금 케이스: schema `lock` · api `ws-lock` 33 · `lock-census` 22 · `pages` 59 · `ws-patch` 24 · web `lock/*` · `store/editor-store` 102 · `edit/structure-drop` — 14 파일 416 초록(고친 직후 한 판).

### 변조(H1)

백업(경로 전체 이름 — `scratchpad/fx-c2/bak/<경로의 / 를 __ 로>`) → 한 곳 치환(맞은 수 1) → schema 를 거치면 `pnpm --filter @wirebound/schema build` → vitest(json) → `cmp` 복원 → schema 다시 빌드(스크래치 `mutate.py`).

| 변조 | 시간 | 실행 · 죽음 | 실패 값(대표) |
|---|---|---|---|
| MH1 새 함수를 옛 판정(`findLockConflict` + 포인터 모음)으로 | 21:05 | 84 · 26 | api 5 전부 — `{status: 200, b: [n_b1, n_b2, n_a]}` · MCP `{200, null}` · `01` `{200, null}` · 거짓 거절 `{423, …}` / web `undo-locks` 2(`{calls: 1}` · 잠금 ≠ null) · `structure-drop` 2 / schema 17 |
| MH2 **웹만** 옛 판정(스토어 `#editConflict`) | 21:07:12–26 | 917 · 3 | `undo-locks` 2(위 값) · `one-verdict` 1(웹 호출 자리 `[]`). `structure-drop.test.ts` 는 안 죽는다 — 자기 대역(`lockOn`)으로 함수를 직접 부른다. 스토어 길은 `undo-locks` 의 새 둘이 소유한다 |
| MH3 포인터 정규화 뗌 | 21:07:37–43 | 73 · 3 | api `01` `{200, null}` · schema `01` · `1.0` |
| MH4 잠긴 자리 밀기 뗌 | 21:07:43–48 | 73 · 18 | api 4 · web 2 · schema 12. C14 는 우연히 산다(밀지 않은 옛 자리 `1` 이 `-` 의 정규화 `1` 과 겹친다) — MH1 이 죽인다 |
| MH5 적용 실패 뒤 계속 잼 | 21:07:48–53 | 73 · 1 | «실패하는 연산 뒤의 연산은 재지 않는다» — `BORA` ≠ `null` |

«id 바꿔치기» 케이스는 옛 판정에도 초록이다 — id 로 다시 찾는 설계를 막는 성질 잠금(그 설계를 심은 변조는 돌리지 않았다).

## 3. M1 — 드래그가 `pointerId` 를 안 가른다

**재현(Chrome, 리뷰 판 · 합친 판 `browser2`):** «둘째 포인터의 뗌(합성 `pointerId` 77)» · «마우스로 끄는 중 CDP 터치 한 번» 둘 다 빨강 — 요청 1 · 끌기가 그 자리에 놓임(리뷰 값과 같음).

**고침(`659ba805`):** `use-pointer-drag.ts` 의 창 리스너 셋(`pointermove` · `pointerup` · `pointercancel`)이 누른 포인터의 `pointerId` 가 아니면 돌아간다(머리말 «시작한 포인터만 듣는다»). **jsdom 흉내 `PointerEvent`(`test/pointer-events.ts`)가 `pointerId` 를 버렸다** — 모든 이벤트가 `undefined` 로 같아 가드를 잴 수 없었다. 흉내가 init 의 `pointerId`(없으면 0 — 브라우저 기본값)를 싣게 했다. web 전량이 그대로 초록(2686).

| 케이스 | 고치기 전 | 고친 뒤 |
|---|---|---|
| jsdom `use-pointer-drag` +3(다른 포인터의 move · up · cancel) | (가드 없는 판 = M1 변조 값) | 초록 |
| Chrome «둘째 포인터의 뗌 …» · «… 터치로 한 번 쳐도 … 놓이지 않는다»(«(결함)» 걷음) | 빨강 | 초록(`tree-drag-review` + `tree-drag` 32 중 30 — 남은 둘은 L1 · 발견 4) |

| 변조 | 시간 | 실행 · 죽음 | 실패 값 |
|---|---|---|---|
| M1 가드를 늘 참으로(jsdom) | 21:10:28–36 | 714 · 3 | `'inside'` ≠ `'before'` · `{drops: 1, dragging: ''}` ≠ `{0, '가'}` · `''` ≠ `'가'` |
| M1 같은 변조(Chrome) | 21:10:36–11:36 | 32 · 4 | 리뷰 M1 둘(요청 · 놓임 값) + 그때 아직 안 고친 L1 · 발견 4 |

## 4. L1 — 줄 `…` «삭제»의 둘째 누름

**재현(Chrome · 합친 판):** 리뷰 판 빨강 — 1440 · 1024 가져오기 칸 열림, 800 내보내기 받기.

**고침(`f7fe75a6`):** `shell/action-menu.tsx` — 항목을 **포인터로** 고르면(`click` 의 `detail` ≥ 1) `DOUBLE_CLICK_MS`(500) 안에 **첫 누름 자리에서 `DOUBLE_CLICK_SLOP`(8px) 안**에 오는 `click` 하나를 붙잡는 단계에서 막는다 — 호스트 문서와 캔버스 iframe 문서 둘 다(iframe 좌표는 iframe 상자만큼 옮겨 견줌). 키보드(`click()` · `detail` 0)는 안 삼킨다. 링크 항목도 같다.

**브리프와 달라진 것 — 자리를 본다.** 시간만 보는 첫 판(«500ms 안의 클릭 하나»)은 `pnpm test:browser` 에서 **13 판이 30s 시간 초과**로 죽었다(`editor-restore-*` · `editor-recovery-races` · `editor-shell-modal` — 메뉴 항목을 누른 뒤 곧바로 다른 자리의 확인 · 대화 상자 단추를 누르는 판). 사람이 곧바로 확인을 누르는 것도 먹는다는 뜻이라 자리를 보게 좁혔다 — 그 다섯 파일 + 리뷰 파일 42 초록.

| 케이스 | 고친 뒤 |
|---|---|
| Chrome «삭제 두 번 누르기 — 한 몸짓에 지우지 않는다» · «둘째 누름이 그 밑 단추를 누르지 않는다»(«(결함)» 걷음) — **폭 셋 × 왼끝 · 가운데 · 오른끝 × 더블클릭 · 따로 두 번(350ms) = 18 판** | 18 판 모두 `{deleted: false, confirm: 1, importOpen: 0, downloads: 0}` |
| jsdom `action-menu` +4(같은 자리 둘째 누름 삼킴 · 다른 자리 안 삼킴 · 간격 뒤 안 삼킴 · 키보드 안 삼킴) | 초록 |

| 변조 | 시간 | 실행 · 죽음 | 실패 값 |
|---|---|---|---|
| L1a 삼키기 뗌(jsdom) | 21:36:40–41 | 17 · 1 | `{outside: 1}` ≠ `{outside: 0}` |
| L1a 같은 변조(Chrome) | 21:36:43–37:43 | 23 · 1 | 18 칸 중 10 칸이 0 아님 — 1440 · 1024 왼끝 내보내기 1 · 가운데 가져오기 1 · 800 가운데 내보내기 1(오른끝은 단추 밖 `div` 라 0) |
| L1b 키보드도 삼킴 | 21:36:41–42 | 17 · 4 | 키보드 케이스 `{outside: 0}` ≠ `1` 외 키보드 셋. (시간만 보던 판에서 같은 변조는 web 1161 중 217 을 죽였다 — 메뉴를 키보드로 고른 뒤 곧바로 클릭하는 jsdom 판들) |
| L1c 시간 만료 뗌 | 21:36:42 | 17 · 1 | 간격 뒤 클릭 0 회 ≠ 1 |
| L1d 자리 무시(어디든 삼킴) | 21:36:42–43 | 17 · 1 | «다른 자리의 클릭 …» 0 회 ≠ 1 |

iframe 좌표 옮김(`frameElement` 상자)을 혼자 재는 케이스는 없다 — 캔버스 위에 뜬 메뉴를 두 번 누르는 판을 세우지 않았다(이월 3).

## 5. 발견 4 — 이월(`47044974`)

`tree-drag-review.test.ts` «(이월 · 결함) 두 사람이 같은 부모를 번갈아 끌면 …» 을 `it.fails` 로(코디네이터 Q1 답). **값으로 죽는 것을 봤다**(합친 판 `browser2` 의 실패 값): `second` · `bobSeesAfter` = `[나3, 나1, 나2]`(단언 `[나3, 나2, 나1]`) — 판 만들기 실패가 아니다.

## 변조 뒷정리

변조마다 `cmp` 복원 확인(스크립트가 단언). schema 를 거친 변조는 복원 뒤 다시 빌드. 끝의 `git status` 깨끗 · `git diff --stat` 빈 값(커밋 전에 매번 경로로 stage).

## 게이트(최종 코드 `e1a71ef1`)

| 게이트 | 결과 |
|---|---|
| `pnpm typecheck` | 종료 0 |
| `pnpm build` | 종료 0 |
| `pnpm test --maxWorkers=50%` | 391 파일 · 6643 실행 · 6642 통과 · 1 건너뜀(`apps/api/test/log-destination.test.ts` — 기존) · 0 실패. 리뷰 빨강 9(schema 5 · api 4) 초록 |
| `pnpm test:build` | 54 파일 · 356 실행 · 355 통과 · 1 건너뜀(`packages/theme-kit/build-test/template.test.ts` — 기존) · 0 실패 |
| `pnpm test:browser` | 31 파일 · 166 실행 · 166 통과 · 0 건너뜀 · 0 실패(발견 4 의 `it.fails` 포함 — 리뷰 Chrome 빨강 셋 초록) |
| `EDITOR_STACK_BUNDLE=build pnpm test:browser` | 31 파일 · 166 실행 · 166 통과 · 0 건너뜀 · 0 실패 |

web jsdom 만 따로(L1 고친 뒤 · 좁히기 전 한 판 · 좁힌 뒤 전량 게이트에 포함): 147 파일 · 2689 통과.

첫 게이트 판(같은 HEAD)은 무효다 — 실행 중 기계가 배터리로 잠들어(`pmset -g log`) `pnpm test` 의 케이스들이 시간 초과(한 케이스 489s)로 죽고 백그라운드 한도(2h)에 걸렸다. `caffeinate -i` 로 다시 돌린 값이 위다.

## 이월

1. **발견 4** — 메뉴 트리가 남의 변경을 실시간으로 안 받아 둘째 사람의 재정렬이 사라진다(원래 있던 길 · `it.fails`). 리뷰 항목 2 «남이 페이지를 지우면 404 뒤 트리를 다시 안 받음»과 같은 뿌리. C4 가 `2026-09-30-c-report.md` 장부로 옮긴다.
2. 리뷰 이월 4 — 창 전환(진짜 `blur`)의 끌기는 헤드리스로 못 낸다.
3. L1 의 캔버스 iframe 갈래(좌표 옮김)를 재는 실브라우저 판 없음.
4. `one-verdict` 의 «웹만 옛 판정» 행동 소유는 `undo-locks` 둘이다 — 구조 트리 끌어 놓기를 스토어 경로로 재는 jsdom 판(놓을 자리 표시가 서는지)은 없다(Chrome `tree-drag.test.ts` «남이 잡은 노드 …» 가 잠긴 쪽만 잰다).

## 지침 제안

- `CLAUDE.md` 「검증」 → «jsdom 값은 실브라우저 값이 아니다 …» 문단 끝: «**jsdom 흉내 이벤트는 흉내 낸 필드만 나른다** — `test/pointer-events.ts` 의 `PointerEvent` 가 `pointerId` 를 버리면 모든 이벤트가 같은 포인터로 보여 «다른 포인터» 가드를 뗀 변조가 산다. 가드가 새 필드를 읽으면 흉내에 그 필드를 브라우저 기본값으로 더한다.»
- `CLAUDE.md` 「검증」 → «전량 게이트가 도는 동안 …» 근처: «**긴 게이트는 `caffeinate -i` 아래에서 돌린다** — 배터리에서 덮개가 닫히면 기계가 잠들어 케이스가 시간 초과로 죽고, 그 판은 «실패»가 아니라 «안 잰 것»이다(`pmset -g log` 의 Sleep 줄로 가른다).»
- `CLAUDE.md` 「검증」 → «편집의 포인터를 판정에 넣을 때 그 좌표가 어느 문서의 것인지 센다»(리뷰 제안 5)에 덧붙여: «**포인터를 글자로 견주지 않는다** — 적용은 배열 번호를 `Number(token)` 으로 읽어 `01` · `1.0` 도 `1` 이다. 판정은 적용과 같은 규칙으로 읽는다(`packages/schema/src/lock.ts` 의 `canonicalAt`).»
- 클릭을 삼키는 장치(L1 · 끌기의 `swallowNextClick`)를 세울 때: «**뒤따르는 클릭을 삼키는 장치는 시간만으로 가르지 않는다** — 고른 항목이 연 확인 · 대화 상자를 곧바로 누르는 판을 먹는다. 첫 누름 자리를 함께 본다.» — `CLAUDE.md` 「검증」 «jsdom 은 좌표 · 상속 계산도 없다» 문단 끝.
