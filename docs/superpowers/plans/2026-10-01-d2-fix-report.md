# D2 리뷰 대응 — 보고

대상: `feat/d2-palette` — 리뷰 `docs/superpowers/plans/2026-10-01-d2-review.md` 의 빨강 넷(F1 ~ F4). F5(창 700 · 통지 다섯에서 캔버스 칸 97px)는 코디네이터 판정대로 고치지 않았다(이월).
이 문서는 발행 시점의 기록이다(`docs/guideline/base/04-citation.md` 「이력 문서는 연대기 금지의 예외다」). 실브라우저 값은 `editor-stack.ts` 의 시스템 Chrome · 창 1440×900 이다.

## 요약

| # | 무엇 | 재현(고치기 전 `41ba8c0c`) | 고침 | 커밋 |
|---|---|---|---|---|
| F1 | 뿌리 선택 + 남의 잠금이면 클릭 추가 거절 | 문장 «밥님이 편집 중이라 고를 수도 바꿀 수도 없습니다» · 프레임 0 · 같은 편집 REST 200 | 고른 노드의 앞선 잠금 검사를 «그 뒤» 에 넣는 잎에만 — «안 끝»(뿌리 · 컨테이너)은 편집 판정(`editBlockedBy`)에 맡긴다 | `9e36e400` |
| F3 | Enter 누른 채 → 넣기 여럿 | 첫 keydown + 반복 다섯 → 넣기 6 · 프레임 6 | 카드 `onKeyDown` 이 `event.repeat` 인 Enter · Space 를 `preventDefault` 로 버린다 | `a1d518a8` |
| F4 | 거절 문장이 페이지를 넘어 남음 | 2쪽에서 `afterMove` = «밥님이 편집 중이라 바꿀 수 없습니다» | 문장에 세운 판(페이지 id · 고른 노드 id)을 적고, 렌더 때 지금 판과 다르면 비운다(한 번 어긋나면 비워 돌아와도 안 선다) | `049f4316` |
| F2 | 카드 끌기 표시가 밀린 노드를 안 따라감 | 표시 y 330 그대로 · `n_last` 443 · 떼면 편집 0 | 캔버스가 `layoutKey` 가 바뀔 때 경로 층 영역 칸으로 알리고(`useAnnounceCanvasRemeasure`) 판이 끌기 장치의 `refresh` 를 구독한다(`useCanvasRemeasured`) — 손잡이와 같은 `refresh` | `7ddca2bf` |

재현은 리뷰 케이스 넷을 고치기 전 소스에서 돌린 값이다(4 실패 · 24 건너뜀 / 28) — 리뷰가 적은 값과 같다.

## F1 — 앞선 잠금 검사를 잎에만

- **원인(리뷰 그대로):** `palette/palette-add.ts` 가 판정 앞에서 `lockedBy(고른 노드)` 를 봤다. `lockedBy` 는 고르기 판정이라 자손의 잠금도 센다 — 페이지를 연 그대로(뿌리 선택) 남이 아무 노드를 고르면 페이지 끝 넣기까지 거절했다.
- **고침:** 리뷰의 고칠 방향 — 앞선 검사는 `node !== undefined && !inside`(잎 «뒤») 에만. 컨테이너를 남이 잡은 판은 판정이 막고 문장은 `lockedNotice`(속성 패널 문장)로 바뀐다(머리말의 표를 고쳤다).
- **브리프 문구 그대로 짠 판**(«거절 판정이 `editBlockedBy(ops)` 만 보게» — 앞선 검사를 통째로 뗌)을 변조로 돌렸다: jsdom «고른 노드를 남이 잡았다 → 넣지 않음» 이 `[[{op:'add',…}]]` ≠ `[]` 로, «거절 문장은 다음 넣기가 걷는다» 가 `''` 로 죽는다 — 판정(`lockConflictOfOps`)은 잠긴 노드 **뒤** 넣기를 겹침으로 안 세서(구현 보고 발견 1) 잎 판은 앞선 검사가 있어야 막힌다. 그래서 리뷰 방향(잎에만)으로 했다.
- **새 jsdom 케이스**(`test/palette/palette-cards.test.tsx`): «뿌리를 고른 채 남이 자손을 잡았다 → 그래도 뿌리 끝» · «컨테이너를 고른 채 남이 그 안 노드를 잡았다 → 그래도 그 안 끝» · «고른 컨테이너를 남이 잡았다 → 넣지 않음 · 잠금 문장(판정이 막는다)».
- **리뷰 대조군:** 클릭 추가 묶음(고른 것 다섯 · 뒤 형제 잠김 · 부모를 bob 이 누름 · 검증 전 문서 · 두 번 누름 · 누르는 사이 지움) 그대로 초록 — 고친 뒤 «클릭» 으로 거른 실행에서 13 통과(F3 · F4 는 그때 아직 빨강).

## F3 — 키 반복 버림

`palette/component-palette.tsx` 의 `moveCard`(카드 `onKeyDown`) 머리에서 `event.repeat && (Enter || ' ')` 면 `preventDefault` 하고 끝낸다. 고친 뒤 리뷰 케이스: 넣기 1 · 프레임 1. 구현의 «Enter 로 넣고 · 끌어 놓은 뒤의 클릭은 한 번 더 넣지 않는다» 초록. jsdom 케이스는 안 세웠다 — jsdom 은 keydown 에서 단추 `click` 을 안 내 반복을 못 흉내 낸다(실브라우저 케이스가 잰다).

## F4 — 거절 문장을 판에 매단다

`PaletteBody` 의 `notice` 가 `{ text, pageId, selected }` 다. 넣기가 거절되면 그때의 페이지 id · `store.getState().selectedNodeId` 를 함께 적고, 렌더 때 지금 `props.pageId` · 구독한 `selectedNodeId` 와 하나라도 다르면 `setNotice(null)`(렌더 중 상태 조정). 비교만 하고 안 비우면 떠났다 돌아온 판에서 다시 선다 — 아래 변조 MF4b. 다음 누름이 걷는 것은 그대로다. 걷는 입구(페이지 옮김 · 고르기)를 세지 않고 판에 매단 것은 리뷰의 방향 · `CLAUDE.md` «통지를 지우는 조건은 입구를 세지 말고 세대에 매단다» 그대로다.

새 jsdom 케이스 «거절 문장은 고른 노드가 바뀌면 걷히고, 앞 노드로 돌아와도 다시 서지 않는다» — 잠금이 남으면 앞 노드로 못 돌아오므로(고르기 = 잠금 · `selectNode` 가 거절) 잠금을 걷은 뒤 돌아오고, 돌아온 선택이 `n-text` 인지도 단언한다(처음 짠 판은 선택이 안 돌아와 «돌아옴» 을 안 쟀다 — 그 단언을 더해 고쳤다).

## F2 — 캔버스가 다시 잴 때 판의 끌기도 다시 묻는다

- **고침:** 경로 층(`drag/use-placement.ts`)의 영역 칸에 `remeasured: Set<() => void>` 를 두고, 캔버스(`canvas/canvas.tsx`)가 `layoutKey`(손잡이에 내리는 그 값)가 바뀔 때 `useAnnounceCanvasRemeasure` 로 부른다. 판(`palette/component-palette.tsx`)은 `useCanvasRemeasured(drag.refresh)` 로 구독한다 — `refresh` 는 D1 이 손잡이에 쓴 끌기 장치의 그것이다(새 판정 · 새 끌기 장치를 짓지 않았다. 더한 것은 캔버스 → 형제 판의 알림 칸 하나).
- **고친 뒤:** 리뷰 케이스 `afterShift` `[]` · 떼면 편집 0(ORIGINAL).
- **대조군을 더했다**(`build-test/palette-review.test.ts` «bob 이 표시한 노드를 안 미는 편집을 하면 표시가 남고 놓으면 보인 자리에 선다») — 위 글을 짧게 고쳐(`n_last` y 331 → 331) 캔버스는 다시 재지만 자리는 그대로인 판. 표시 `['before']` 가 남고 놓으면 `n_empt, +Divider, n_last`. 리뷰 케이스만으로는 «다시 묻지 않고 걷기만» 하는 판도 초록이라 세웠다(D1 의 손잡이 대조군 «아래 다른 노드의 글을 고쳐도» 와 같은 성질).

## 변조

백업(경로 전체 이름 · 스크래치 `fx-d2/bak/`) → 한 곳 치환(맞은 수 1 확인 — `fx-d2/mutate.py`) → 겨눈 케이스만 → 백업으로 되돌림 · `cmp` 일치. `git checkout` 은 안 썼다. 실패 값은 단언이 재는 값이다.

| 변조 | 돌린 것 | 죽은 케이스 · 실패 값 | 산 케이스 |
|---|---|---|---|
| MF1a 옛 판 — 고른 노드면 언제나 `lockedBy` | jsdom palette-cards · 실브라우저 «뿌리 선택» | jsdom «뿌리 … 자손» `path: null`(≠ `/root/children/2`) · «컨테이너 … 그 안 노드» `path: null` · «고른 컨테이너를 남이 잡았다» 문장 «…고를 수도 바꿀 수도 없습니다» ≠ `lockedNotice` / 실브라우저 F1 `notice` «밥님이 편집 중이라 고를 수도 바꿀 수도 없습니다» · `sent` 0 | 나머지 jsdom 14 |
| MF1b 브리프 문구 그대로 — 앞선 검사 통째로 뗌 | jsdom palette-cards · 실브라우저 «클릭 추가» 묶음 | jsdom «고른 노드를 남이 잡았다» `[[{op:'add',…}]]` ≠ `[]` · «거절 문장은 다음 넣기가 걷는다» `''` | 실브라우저 클릭 추가 11 (F3 · F4 는 그때 아직 고치기 전이라 빨강 — 이 변조와 무관) |
| MF3 반복 거름 뗌 | 실브라우저 «Enter» 둘 | F3 케이스 넣기 6 · `sent` 6 | 구현의 «Enter 로 넣고 …» |
| MF4a 판 비교 뗌(비우지 않음) | jsdom palette 둘 · 실브라우저 «거절 문장» | jsdom «… 돌아와도» · 실브라우저 F4 `afterMove` «밥님이 편집 중이라 바꿀 수 없습니다» | jsdom 22 |
| MF4b 비교만 하고 안 비움(렌더에서 가림) | jsdom palette 둘 | jsdom «… 돌아와도» `back.notice` «보라님이 편집 중이라 고를 수도 바꿀 수도 없습니다»(`back.selected` `n-text` · `moved` `''`) | jsdom 22 |
| MF2a 판의 구독 뗌 | 실브라우저 «밀리면» · «안 미는» | F2 `afterShift` `[{before, y 330}]` · `lastNow` 443 | 대조군(`stillShown` `['before']`) |
| MF2b 다시 묻지 않고 걷기만(알림이 오면 그 끌기의 표시를 숨김) | 실브라우저 «밀리면» · «안 미는» | 대조군 `stillShown` `[]` ≠ `['before']` | F2(`afterShift` `[]`) |
| MF2c 캔버스의 알림 뗌 | 실브라우저 «밀리면» · «안 미는» · D1 손잡이 «아래 다른 노드» | F2 `afterShift` `[{before, y 330}]` | 대조군 · D1 손잡이 넷 |

F2 의 두 케이스는 각각 혼자 죽는 변조가 있다(MF2a/c ↔ MF2b).

## 게이트

`caffeinate -i` 아래에서 차례로(스크래치 `fx-d2/gates.sh`) · 여섯 다 `7ddca2bf` 에서(이 보고 커밋은 문서만 더한다). 수는 vitest 의 실행 · 건너뜀 · 실패. 도는 동안 `apps/web/src` 는 안 고쳤다.

| 게이트 | 종료 | 실행 | 건너뜀 | 실패 |
|---|---|---|---|---|
| `pnpm typecheck` | 0 | — | — | — |
| `pnpm build` | 0 | — | — | — |
| `pnpm test` | 0 | 6740(파일 397) | 1 | 0 |
| `pnpm test:build` | 0 | 418(파일 58) | 1 | 0 |
| `pnpm test:browser` | 0 | 228(파일 35) | 0 | 0 |
| `EDITOR_STACK_BUNDLE=build pnpm test:browser` | 0 | 228(파일 35) | 0 | 0 |

리뷰 빨강 4 는 두 실브라우저 게이트에서 초록이다 — `palette-review.test.ts` 29(리뷰 28 + 대조군 1) 모두 통과 · `palette.test.ts` 10 통과.

## 이월

1. F5 — 판 최대와 하단 바의 자람(리뷰 «고칠 방향(고를 일)»). 이번에 안 고쳤다.
2. `+` 의 «안에 추가» 도 뿌리 선택 + 남의 잠금에서 꺼진다(리뷰 이월 3 — `structureAbilities`). 원래 있던 길이라 이 트랙 밖. 이번 F1 은 판만 고쳤다.
3. 리뷰 이월 4(축소판의 `createNode` 갈래 · 실제 컨트롤을 그리는 테마 뷰의 `inert`) 그대로.
4. 트리 줄 끌기는 캔버스의 다시 잼을 안 받는다(`panels/structure-tree.tsx` 머리말 — 이번 알림 칸을 트리에는 안 걸었다). 트리 줄의 상자는 캔버스와 무관해 지금 판은 없다.

## 지침 보고

없음.
