# FX-GR 보고 — 그리드 GR-A 리뷰 대응

브리프: `.worktrees/.coord/brief-fx-gr.md`(공통 규칙 `common-w10.md` · 키 `fx-gr`). 대상 `feat/grid` `00880e0d`(리뷰 보고 `docs/superpowers/plans/2026-10-25-rv-gr-report.md` 의 H1 · M1 ~ M4 · L2). 설계 `docs/superpowers/specs/2026-10-25-grid-design.md`.

스크래치 뿌리 `S` = `/private/tmp/claude-501/-Users-jang2162-IdeaProjects-wirebound--worktrees-feat-grid/e3738542-a7dc-45d3-b1f0-be19697cb6e9/scratchpad`. 변조는 `S/mut.py`(백업 이름은 경로 전체 · 맞은 수 1 확인 · 복원 뒤 `cmp`) · 한 판은 `S/vt.zsh`(mise 런타임 · 기본 + json 보고 · node 를 찍는다).

## H1 — 사본을 누르면 원본을 고른다(설계 GR-B «1»)

### 재현(고치기 전 · 18:41)

`apps/web/build-test/grid-editor.test.ts` 첫 케이스(사본 → 그리드)를 두 케이스로 갈았다. 고치기 전 소스에서 둘 다 빨강:

| 케이스 | 고치기 전 실패 값 |
| --- | --- |
| 사본을 누르면 원본을 고르고 Delete · Cmd+D · Cmd+V · 범위 선택이 원본에 걸린다 · 틀 칸 빈 자리는 그 열이다 | `expected 'h_g' to be 'h_b0'` — 사본 단추를 누르면 그리드가 골라진다 |
| 남이 원본을 쥐었으면 사본 누름도 원본 누름과 같게 막히고 · 다른 열의 사본은 골라진다 | `expected { selected: 'h_tail', alerts: [] } to deeply equal { selected: 'h_b0', … }` — 밥이 셀 틀 글을 쥔 동안 다른 열의 사본 단추를 누르면 그리드를 고르려다(밥의 글을 품어) 막힌다. 같은 케이스의 «사본 글 누름 = 원본 글 누름» 은 고치기 전에도 같다(둘 다 막힘 — 리뷰 «2» 의 값) |

### 바꾼 것

- **캔버스 누름**(`apps/web/src/canvas/canvas.tsx` 의 `nodeIdAt`) — 가까운 조상부터 `data-wb-id` · `data-wb-copy-of` · `data-wb-column-of` 를 읽는다. 사본은 원본 id 로, 셀 틀 · 번호 칸의 빈 자리는 그 열로 고른다. 고른 뒤의 판정(남의 잠금 · Cmd/Shift 더하기)은 원본을 누른 것과 같은 길(`selectNode` · `toggleSelect`)이다.
- **틀 칸 → 열**(`packages/theme-sdk/src/default-views/data.tsx` 의 `columnOf`) — 셀 틀 · 번호 칸 `td` 에 `data-wb-column-of="<열 id>"`. 스타터 템플릿은 SDK 파일을 옮겨 저절로 온다(`SKILL.md` 에 한 줄).
- **범위 선택**(`apps/web/src/canvas/use-canvas-marquee.ts` 의 `drawnNodes` · `canvas-marquee.ts` 의 `nodesInRect`) — 노드마다 원본 상자 뒤에 사본 상자를 같은 id 로 잇고, 하나라도 사각형 안이면 그 노드가 든다(같은 id 는 한 번).
- 정본 §6.1(`data-wb-copy-of` 줄 · `data-wb-column-of` 줄) · §9 «선택 — 고르는 법»(클릭 · 사각형).

### 결정 — 설계의 `data-wb-copy-of="<열 id>"` 대신 `data-wb-column-of`

설계 «8» 은 틀 칸 `td` 에 `data-wb-copy-of="<열 id>"` 를 단다고 적었다. **칸은 열의 사본이 아니라 열의 몸 칸이다** — 사본으로 읽으면 범위 선택이 «그 노드의 상자 하나라도 사각형 안이면 든다» 라서 한 줄을 덮는 사각형이 그 줄의 칸으로 열을 고르고(열 머리 · 다른 줄은 사각형 밖인데), 열이 들면 그 셀 틀 조각은 «조상이 든 것» 으로 빠진다. `check` 의 사본 셈(`[data-wb-copy-of="<id>"]`)과 SDK 몫 초기화(`[data-wb-copy-of]`)도 칸을 노드 뿌리로 센다. 그래서 이름을 갈랐다 — 누름(`nodeIdAt`)만 읽고 범위 선택 · 사본 셈은 안 읽는다.

### 캔버스 «두 번 눌러 글 고치기» 는 없다

브리프의 «두 번 누르기(글 바로 고치기)» — `apps/web/src/` 의 `dblclick` · `onDoubleClick` 은 구조 트리(별칭 바꾸기 · `panels/structure-tree.tsx`)와 셸 크기 손잡이뿐이다(`git grep -n -E "dblclick|onDoubleClick" -- apps/web/src`). 캔버스의 두 번 누름은 클릭 둘이라 원본을 두 번 고른다. 끌기 시작은 손잡이(`canvas-drag-handle.tsx` — 고른 노드에 선다)뿐이라 사본을 누른 뒤의 손잡이가 원본에 서고 원본을 끈다.

### 훑기 자리 × 사본을 읽는 법

`git grep -n -E "data-wb-id|dataset\.wbId"` 로 다시 센 자리(리뷰 «2» 의 목록). «원본 하나» 는 첫 `data-wb-id` 요소 하나만 본다는 뜻이다.

| 자리 | 하는 일 | 사본을 읽는 법 | 이 차수 |
| --- | --- | --- | --- |
| `apps/web/src/canvas/canvas.tsx` `nodeIdAt` | 캔버스 누름 · Cmd/Shift 클릭 | **사본 = 원본 · 틀/번호 칸 빈 자리 = 열** | 바꿈 |
| `canvas.tsx` `findNodeElement` | 고른 외곽선 · 손잡이 · 번호 마커 · 코멘트 핀 · 놓은 뒤 자리 | 원본 하나 — 외곽선 · 손잡이 · 마커 · 핀은 원본에만 선다(사본 줄에는 안 선다) | 그대로 |
| `apps/web/src/canvas/use-canvas-marquee.ts` `drawnNodes` | 범위 선택 | **사본 상자도 원본의 상자** — 사본 줄만 덮어도 원본이 든다 | 바꿈 |
| `apps/web/src/canvas/canvas-drop.ts` `canvasHitAt` · `nearestChild` · `firstNodeElement` | 끌어 놓기 판정 | 사본은 안 읽는다 — 사본 위는 가장 가까운 `data-wb-id` 조상(사본 `tr` 도 `data-wb-id` 가 없어 **그리드**)의 앞 · 뒤 · 안으로 읽힌다. 설계 «8» «사본에 놓기» 는 «그 행(`tr`)으로 읽는다» 고 적었는데 사본 `tr` 은 노드 뿌리가 아니다. 거절 문장 «첫 행의 칸에 놓으세요» 와 함께 GR-B 4 의 몫 | 그대로(GR-B) |
| `apps/web/src/canvas/layout-guides.tsx` | 고른 노드 안 배치 선 | 원본 하나 | 그대로 |
| `apps/web/src/canvas/keep-drop-place.tsx` | 빈 구역 칸이 걷힐 때 놓인 노드의 화면 자리 | 원본 · 미리보기 id 만 | 그대로 |
| `apps/web/src/canvas/canvas-preview.ts` `elementOf` | 배치 미리보기 요소 | 원본 · 미리보기 id 만 | 그대로 |
| `apps/web/src/palette/palette-thumbs.tsx` | 팔레트 축소판의 노드 찾기 | 원본 하나 | 그대로 |
| `apps/web/src/shell/editor-keys.tsx` `revealNode` | 고른 노드를 창 안으로 굴림 | 원본 하나 | 그대로 |
| `apps/web/src/drag/drag-debug.ts` `describeElement` | 끌기 진단 줄의 요소 이름 | 사본은 태그 이름만(진단 줄 — 답을 안 바꾼다) | 그대로 |
| `packages/exporter/src/browser/mount.tsx` `findNode` | 번들의 번호 마커 · 코멘트 앵커 | 원본 하나 | 그대로 |
| `packages/renderer/src/marker.ts` `focusElement` | 외곽선 · 마커의 기준 상자 | 제 뿌리 기준(사본이면 사본 뿌리) — 외곽선은 원본에만 서므로 원본 | 그대로 |

- **남의 잠금 표시** — 캔버스는 남의 잠금을 안 그린다(트리 자물쇠만 — 리뷰 «2»). 사본 누름은 원본을 누른 것과 같은 판정을 지나 막힌다(위 둘째 케이스).

