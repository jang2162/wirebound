# 상호작용 «화면 상태 바꾸기»(`setViewState`) 구현 계획

설계서: 브랜치의 `docs/superpowers/specs/2026-11-17-set-view-state-design.md`(태스크 0 이 들인다). 브랜치 `feat/view-state-action` · 워크트리 `.worktrees/feat-view-state-action`.

**목표:** 상호작용 액션 일곱째 `setViewState`(`target` = 그 문서의 상태 id 또는 `"default"`)를 넣어, 뷰 모드 · HTML 번들 · 팝업 겹에서 누르면 그 문서의 화면 상태가 바뀌게 한다.

**사람이 걸려 넘어질 판(Review Focus — 각각 케이스로 잠근다):**
1. 상태가 숨긴 상세를 [등록] 이 열고 [취소] 가 `default` 로 닫는다 — 뷰 모드 · 번들 둘 다 실브라우저로.
2. 팝업 안의 `setViewState` 는 그 팝업 겹만 바꾸고 연 화면의 상태는 그대로 · 팝업을 닫았다 다시 열면 기본.
3. 뷰 모드에서 바꾼 상태는 모드를 나가면 들어가기 전 고름으로 돌아간다(시연이 편집 화면의 고름을 안 바꾼다).
4. 대상 상태를 지운 뒤: 저장은 되고(warning), 누르면 끊김 이슈가 서고 화면은 그대로.
5. 방향 제어 글자를 든 상태 이름이 문장(패널 · 번들 · PPTX) 뒤 글을 뒤집지 않는다.

## 태스크

0. **설계서 들이기** — 코디네이터 쪽 `.worktrees/.coord/2026-11-17-set-view-state-design.md` 를 `docs/superpowers/specs/2026-11-17-set-view-state-design.md` 로 옮겨 커밋.
1. **스키마** — `packages/schema/src/node.ts` · `envelope.ts` 의 액션 합 · `validate.ts` 에 `setViewState` 를 더한다. `interaction/check.ts` 에 대상 판정(`view-state-missing` · warning — 문서의 `viewStates` 를 받는다), `interaction/describe.ts` 에 문장(`isolateBidi`). 레이아웃 문서는 `"default"` 만 맞다. lint 규칙을 더하면 그 커밋에서 정본 「lint 규칙」 줄을 함께 고친다(`packages/schema/test/lint-rules.test.ts`).
2. **렌더러 런타임** — `packages/renderer/src/interaction/runtime.ts` 의 `InteractionRequest` 에 `{ kind: 'viewState', target }` 을 더하고 검사는 1 의 함수를 쓴다. 런타임은 상태를 들지 않는다.
3. **웹 뷰 모드** — 받는 자리(`apps/web/src/canvas/canvas-popups.tsx` 의 `handle` 과 캔버스)가 요청을 받아 그 페이지의 상태를 바꾼다. 셸 고르개(`useViewState`)와 같은 상태를 보이되, 뷰 모드를 나가면 들어가기 전 값으로 되돌린다. 팝업 겹은 제 상태를 들고 닫으면 버린다. Focus 1 · 2 · 3 을 `apps/web/build-test/` 에 실브라우저 케이스로.
4. **HTML 번들** — `packages/exporter/src/browser/mount.tsx` 의 `handle` 이 뷰어 상태 고르개를 바꾼다(팝업 겹 규칙은 3 과 같게). 번들 실브라우저 케이스(Focus 1 · 2). 번들 셸 마크업을 건드리면 `git grep -n 'wb-export-' apps/api/test` 의 글자 정규식 케이스를 함께 돈다. PPTX 는 문장만(4 의 describe 그대로).
5. **에디터 패널** — `apps/web/src/panels/interaction-panel.tsx` 에 «화면 상태 바꾸기» 액션과 상태 트리 고르개(기본 + 상태, 깊이 들여쓰기 · 상태가 없으면 안내). jsdom 케이스.
6. **바깥 표면** — `packages/mcp/skill/SKILL.md` · `apps/web/config/llms-txt.ts`(생성물 다시 짓기) · `apps/api/README.md` 의 상호작용 표. MCP · CLI 의 페이지 쓰기가 새 액션을 받는지 api 케이스 하나.
7. **정본 · 게이트** — 정본 「8. 상호작용」(6종 → 7종 · 8.3 실행). 정본을 고쳤으니 게이트는 전량 넷(`pnpm test` · `pnpm test:build` · `pnpm typecheck` · `pnpm lint` + `pnpm fmt`).

태스크마다: 실패 케이스 먼저 → 구현 → 그 케이스가 혼자 죽는 변조 한 번 → 커밋. 보고는 `docs/superpowers/plans/2026-11-17-vs-report.md`.
