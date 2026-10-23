# FX-ZE 보고 — 구역 에디터 리뷰 대응 — 2026-10-24

브리프: 코디네이터 `brief-fx-ze.md` · 공통 `common-w6.md` · 리뷰 `2026-10-23-rv-ze-report.md`. 워크트리 `feat-zone-editor` · 브랜치 `feat/zone-editor` · 시작 HEAD `0d301bbb`. node v24.21.0 · Postgres 5491(이 워크트리의 컨테이너). 이 워크트리에 붙은 터미널은 이 워커 하나(`orca terminal list`).

## 바꾼 것

| 커밋 | 묶음 |
| --- | --- |
| `55176621` | **H1** — 들여쓰기 · 내어쓰기가 갈 자리의 받는 타입 · 설 자리를 본다. `structure-actions.ts` 의 `levelRefusals`(들여쓰기 = 앞 형제의 몸통 · 내어쓰기 = 부모가 선 구역 — 다른 입구와 같은 `fitRefusal`)를 `structureAbilities` 의 `indent` · `outdent` 가 지난다. 꺼진 항목의 이유(`toolbar-status.ts` 의 `structureItemReason` — `levels`)와 키 통지(`editor-keys.tsx` — 꺼진 키가 그 문장을 정보 통지로)가 같은 문장을 낸다. 케이스 `test/edit/indent-fit.test.tsx`(셸째 · 3) · `structure-actions.test.ts` 의 `levelRefusals`(3) |
| `3a8c8b7b` | **M1 · L3** — 리베이스(`store/anchored-ops.ts`). 맵이 있을 때 낸 키 `add …/zones/<k> [배열]` 을 맵째 op 과 같은 «구역 하나의 뜻» 으로 맵 경로에 붙잡는다(`newZoneKey`) — 남이 맵을 지웠으면 맵째 `add …/zones { k: … }` 로 되살린다. 남이 만들었다 비운 구역(`k: []`)에는 노드마다 `add …/zones/k/<i>`(빈 배열이면 op 없음 — 뒤 `move` 가 넣는다). 남의 노드가 든 구역은 지금처럼 못 얹는다. 케이스 `zone-rebase.test.ts` 의 «맵을 지운 판 · 빈 구역 키»(5) |
| `5627dc2c` | **L2** — 렌더러 `RenderOptions.reveal` 이 `{ nodeId, zone }`(`RevealTarget`)도 받아 그 부모 **자신**을 «그 구역 끝이 보인다» 로 덮는다. 캔버스는 고른 구역을 그 꼴로 넘긴다. 케이스 `packages/renderer/test/zones-editor-options.test.tsx` «구역을 보이면 그 부모 자신도 덮는다» |
| `abedbef0` | **L1** — `canvas/keep-drop-place.tsx`(`KeepDropPlace`). 칸이 서 있는 동안 `pointerup` 캡처에서 미리보기 위 끝 · 미리보기 id · 노드 id 를 적고, 칸이 걷힌 커밋 뒤(그리기 전 — `componentDidUpdate`) 놓인 노드(새 id · 옮기기면 미리보기가 베낀 id)를 그 자리에 맞춰 캔버스 칸을 굴린다. 놓지 않고 끝난 끌기는 `getSnapshotBeforeUpdate` 로 화면 위 끝에 걸친 노드를 붙잡는다 |
| `8a565bbb` · `d73f2bed` | 실브라우저 판 `apps/web/build-test/zone-editor-review.test.ts`(4 — H1 · M1 · L2 · L1) · H1 판의 기다림(아래 «재현») |
| `7f54b43f` | 정본 설계서 넷(들여쓰기 · 내어쓰기의 까닭 · 맵을 지운 판 · 빈 구역 키 · 구역 줄 펼치기 · 칸이 걷힐 때 자리) |
| (이 커밋) | 실브라우저 판 하나 더 — L1 «놓지 않고 끝낸 끌기(Escape)» · 이 보고 |

## 결정과 이유

- **H1 — 꺼진 키는 정보 통지로 말한다**(`info` — `shell/info-notice.tsx`). 여럿을 고른 판의 Alt+화살표(`MULTI_KEY_NOTICE`)와 같은 자리다 — «키가 아무것도 안 한 까닭» 이지 편집 실패가 아니다. 문장은 다른 입구와 같은 `fitRefusal` 의 것이다(«탭에는 탭 패널만 놓을 수 있습니다» · «탭 패널은 탭 안에만 놓을 수 있습니다»). 자리로 꺼진 판(첫 형제 · 부모가 뿌리)은 지금처럼 말없이 둔다.
- **H1 — 카탈로그에 없는 타입은 막지 않는다.** `fitRefusal` 은 모르는 타입을 받는 타입 · 설 자리 판정에 걸지 않는다 — `structure-actions.ts` 머리말 «치울 수단» 의 성질(카탈로그에 없는 노드도 옮길 수 있다)을 지킨다(`structure-actions.test.ts` «카탈로그에 없는 타입은 …» 이 잠근다).
- **H1 — 부모를 바꾸는 다른 `edits: true` 명령을 셌다**(`edit/editor-shortcuts.ts` 의 `EDITOR_SHORTCUTS` — `edits: true` 아홉: undo · redo · delete · duplicate · moveUp · moveDown · outdent · indent · alias). 부모를 바꾸는 것은 outdent · indent 둘뿐이다 — 위로 · 아래로는 같은 구역 안(`structureAbilities` 머리말 «형제는 그 노드가 선 구역 안»), 복제는 같은 부모 · 같은 구역에 같은 타입(이미 선 자리), 되돌리기 · 다시 실행은 서버 역연산, 삭제 · 별칭은 자리를 안 바꾼다. 붙여넣기(클립보드 이벤트)는 이미 `fitRefusal` 을 지난다(`paste-ops.ts`).
- **M1 — 키 `add` 를 맵째 op 과 같은 갈래에 붙잡았다**(`newZoneKey` — 만든 문서에서 맵이 객체이고 그 키가 없었던 `add …/zones/<k> [배열]`). 남이 맵을 지운 판의 뜻(«내가 만든 구역을 걷는다»)은 다른 구역이라 내 구역을 되살려도 겹치지 않는다. 남이 맵을 지운 뒤 같은 구역을 다시 만들었으면(B3) 지금처럼 못 얹는다.
- **L3 — 빈 배열만 «비었다» 로 읽는다.** 남이 그 구역에 노드를 넣었으면(하나라도) 못 얹는다 — 덮지 않는다(브리프). 다시 지은 op 은 노드마다 `add …/zones/k/<i>` 이고, 빈 구역으로 옮기기(`add …/zones/k []` + `move`)의 앞 op 은 없어진다(뒤 `move` 가 그 빈 구역 끝에 넣는다).
- **L2 — 노드 id 는 조상만 · 구역은 부모 자신도.** 검색폼 노드 자신을 고른 판은 지금처럼 접힌 채다(그 노드의 외곽선은 접힌 폼에 선다 — 펼칠 까닭이 없다). 넣을 자리로 고른 구역은 그 구역이 화면에 서야 하므로 부모를 덮는다. 렌더러가 타입 이름을 모르게 — 덮을지는 카탈로그의 `reveal(props, { zone, index: 그 구역 끝 })` 이 정한다.
- **L1 — 놓기 직전 자리를 `pointerup` 캡처에서 잰다.** 처음엔 칸이 걷히는 커밋의 `getSnapshotBeforeUpdate` 에서 미리보기를 붙잡으려 했으나, 놓기의 편집 · 미리보기 걷기 · 칸 걷기가 그리기 전 여러 커밋에 걸친다(놓기의 편집이 먼저 그려지고 — 미리보기가 옛 자리에 함께 선 채 — 끄는 쪽의 레이아웃 이펙트가 미리보기 · 끄는 것을 걷는 알림을 낸다 · `drag/use-placement.ts` 의 `usePublishDragging`). 어느 커밋의 직전도 사람이 본 화면이 아니다. 손 뗀 순간은 아무것도 안 바뀐 화면이다. 놓인 노드는 그 뒤 새로 선 id(넣기 · 모듈) · 미리보기가 베낀 id(옮기기 — `wb:preview:<id>`)로 찾는다 — 스토어의 고른 노드로 찾지 않았다 — 놓은 노드를 고르는 것은 입구의 일(`usePlacementDrop` 의 `selectNode` · 모듈은 미뤄 넣는다 — `onModuleDrop`)이라 거기 기대면 두 장치가 묶이고, 못 찾으면 화면 위 끝 노드로 물러선다.

## 재현 — 고치기 전

### H1 — jsdom(`apps/web/test/edit/indent-fit.test.tsx`, 고치기 전 소스)

실행 3 · 실패 2(대조군 «카드 안 글의 내어쓰기» 는 통과):

| 케이스 | 고치기 전 값 |
| --- | --- |
| 탭 패널 안 글 `n-t1` 내어쓰기 | `calls: 1` · 줄 `…` «내어쓰기» `[false, null]`(켜짐) · 정보 통지 `[]` |
| 탭 패널 `n-tp2` 들여쓰기 | `calls: 1` · «들여쓰기» `[false, null]` · 통지 `[]` |

### M1 · L3 — 스토어(`apps/web/test/store/zone-rebase.test.ts` 의 «맵을 지운 판 · 빈 구역 키», 고치기 전 소스)

실행 5 · 실패 4 — B5 둘(넣기 · 옮기기)과 B4 둘(맵째 첫 넣기 · 키 `add` / 옮기기)이 `rebaseAnchored` → `null`(버림). «남이 그 구역에 넣은 노드가 있으면 못 얹는다» 는 고치기 전에도 초록(성질 잠금).

### L2 — 렌더러(`packages/renderer/test/zones-editor-options.test.tsx`, 고치기 전 소스)

«구역을 보이면 그 부모 자신도 덮는다» — `reveal: [{ nodeId: 'form', zone: 'actions' }]` 에서 단추 `go` 가 `null`(`expected null not to be null`).

### 실브라우저 — 고친 것만 뗀 판(`apps/web/build-test/zone-editor-review.test.ts`)

케이스를 고친 뒤에 세워, 고치기 전 값은 HEAD 에서 그 고침만 떼는 변조로 얻었다(아래 «혼자 죽는 변조» 의 BH1 · BM1 · BL2 · BL1 — 각각 그 파일 4 케이스 가운데 제 케이스 하나만 죽었다). dev 번들.

| 판 | 고침을 뗀 값 | 고친 값 |
| --- | --- | --- |
| H1 — WS 올림 2s 지연 · `n_t1` 내어쓰기(Alt+Shift+←) → 300ms 안에 `n_bare` 바닥 구역 줄 «넣기»(구분선) → `n_tp2` 들여쓰기(Alt+Shift+→) | 나간 `move` 2 · `patch-error` 2 · 통지 «탭 패널은 탭 안에만 놓을 수 있습니다 — 페이지를 서버 상태로 다시 불러왔고, 편집 1개가 취소됐습니다.» · **서버 바닥 `[]`(줄 선 구분선이 버려짐)** · 정보 통지 없음 | `move` 0 · `patch-error` 0 · 정보 통지 «탭에는 탭 패널만 놓을 수 있습니다» · «탭 패널은 탭 안에만 놓을 수 있습니다» · 서버 바닥 `[Divider]` · 경보 없음 · 탭 구조 그대로 |
| M1 — 앨리스(내려오는 WS 1.8s 지연)가 밥의 맵(`headEnd`)을 받은 뒤 `n_bare` 바닥 구역 줄 «넣기» 직전 밥이 `remove /root/children/1/zones` | `patch-error` 뒤 다시 안 보냄 · 통지 «다른 사람의 변경과 겹쳐 아직 저장되지 않은 편집 1개를 버렸습니다.» · 서버 맵 없음 | 첫 편집 `add …/zones/footer`(키 `add`) → `patch-error` → `patch-ack` · 서버 `{ footer: [Divider] }` · 경보 없음 · 화면 = 서버 |
| L2 — 접힌 검색폼 `n_form` 의 구역 줄 `actions` 고름 | 캔버스 `n_s1` · `n_f1` 0 · 0 | 1 · 1 → `n_text` 고르면 0 · 0 · 문서 `{ collapsed: true }` · 편집 0 |
| L1 — 긴 문서 가장자리(아래 «잰 값») | 카드 문서 16 판 가운데 **16 판이 뛰었다**(놓인 노드 − 손 떼기 직전 미리보기: −26 ~ −344px) · 대조군 0 / 8 | 16 판 모두 0px · 대조군 0 / 8 |

처음 세운 H1 판은 내어쓰기 통지를 1.5s 기다린 뒤 넣어, 고침을 뗀 판에서도 422 되싣기가 넣기보다 먼저 끝나 구분선이 살았다(통지 · `move` 수로만 죽었다). 기다림을 300ms · 지연을 2s 로 바꿔 «뒤에 줄 선 편집이 함께 버려진다» 판이 서는 것을 위 값으로 확인했다.

## 리뷰 스토어 판 다시 돌리기(A1 – D4 · 잠금 L1 – L7)

리뷰의 탐침(`rebase.probe.ts` — 리뷰 세션 스크래치에서 옮김)을 고친 소스(new)와 시작 HEAD `0d301bbb` 의 `anchored-ops.ts` 사본(old)에 같은 판으로 돌렸다.

| # | 판 | 고친 뒤 | `0d301bbb` | 바뀜 |
| --- | --- | --- | --- | --- |
| A1 | 키 둘인 맵째 `add` · 남이 `headEnd` | 버림 | 버림 | — |
| A2 | 같음 · 남이 `titleSide` | 버림 | 버림 | — |
| A3 | `replace …/zones`(키 하나) · 남이 `headEnd` | 버림 | 버림 | — |
| B1 | 남이 맵을 만들고 되돌림 · 내 맵째 `footer` | `add …/zones` → `{footer:[x]}` | 같음 | — |
| B2 | 남이 지운 뒤 `headEnd` 로 다시 만듦 | `add …/zones/footer` → `{headEnd:[w], footer:[x]}` | 같음 | — |
| B3 | 남이 지운 뒤 `footer` 로 다시 만듦 | 버림 | 버림 | — (덮지 않음) |
| **B4** | 남이 `footer` 를 만들었다 비움(`[]`) · 내 맵째 `footer` | **`add …/zones/footer/0` → `{headEnd:[y], footer:[x]}`** | 버림 | **L3** |
| **B5** | 남의 맵을 받은 뒤 `footer` 키 `add` · 남이 맵을 되돌림 | **`add …/zones` → `{footer:[x]}`** | 버림 | **M1** |
| C1 | 같은 구역 첫 넣기 | 버림 | 버림 | — (덮지 않음) |
| D1 | 내 섹션 첫 넣기 되돌리기 · 남이 `headEnd` + 섹션 안 | `remove …/zones/footer` | 같음 | — |
| D1b | 같은 되돌리기 · 남이 섹션 안에만 | `remove …/zones` | 같음 | — |
| D2 | 같은 되돌리기 · 남이 `headEnd` + 내 `footer` 에 노드 | 버림 | 버림 | — |
| D3 | 같은 되돌리기 · 남이 내 섹션을 구역 밖으로(`footer: []`) | 버림 | 버림 | — |
| D4 | 같은 되돌리기 · 남이 내 섹션을 지우고 다른 노드 | 버림 | 버림 | — |
| E1 | 몸통 넣기 되돌리기 · 남이 섹션 안에 | 섹션째 지움 | 같음 | — |
| L1 – L7 | 잠금 판정(좁힌 op · 맵째 op · 되돌리기) | `null` · `n_y` · `n_card` · `n_card` · `null` · `n_y` · `n_in` | 같은 ops 라 같음 | — |

`zone-rebase.test.ts` 의 무작위 판(4000 판)은 고친 뒤에도 초록이다(게이트의 `pnpm test` 에 든다).

## 잰 값

### L1 — 놓은 뒤 자리(`zone-editor-review.test.ts` «L1»)

긴 문서(글 14 · 카드 또는 섹션 14 를 번갈아 · 끝 글) · 창 1500 × 720 · 시드 고정. 하단 판 단추 카드를 쥐고 칸 밀림(`dragLayoutSettled`) 뒤 캔버스 칸(`.wb-shell-canvas`) 아래 끝 띠(넷 중 하나는 맨 아래로 굴린 뒤 위 끝 띠)에 0.4 – 1.3s 머물러 스크롤시키고 안으로 한 걸음(40 – 100px) 들어와 250ms 뒤 놓는다. 손 떼기 직전 미리보기의 화면 위 끝과 놓은 뒤 150ms 의 새 노드 위 끝을 견준다(«자리 차») · 같은 사이 `scrollTop` 변화(«굴림»).

| 판 | 판 수 | 스크롤이 난 판 | 노드가 선 판 | 자리 차 ≠ 0 | 자리 차(px) | 굴림(px) |
| --- | --- | --- | --- | --- | --- | --- |
| 카드 — 고친 판 | 16 | 16 | 16 | **0** | 전부 0 | −26 ~ −370(16 판 모두 — 보정) |
| 카드 — 고침을 뗀 판(BL1) | 16 | 16 | 16 | **16** | −26 ~ −344 | 0(15 판) · −138(1 판 — 문서 바닥에서 잘림) |
| 섹션(구역 없음) — 고친 판 | 8 | 8 | 8 | 0 | 0 | 0 |
| 섹션 — 고침을 뗀 판 | 8 | 8 | 8 | 0 | 0 | 0 |

**놓지 않고 끝낸 끌기**(`zone-editor-review.test.ts` «L1 — 놓지 않고 끝낸 끌기(Escape)») — 같은 카드 문서 · 캔버스 칸을 900 · 1500 · 2100 으로 굴린 뒤 하단 판 카드를 쥐고(칸 42 개가 선다) 판 위에 머문 채 Escape. 칸 위 끝 아래 첫 노드(`n_ct4` · `n_fill8` · `n_fill11`)의 화면 자리 차: 고친 판 0 · 0 · 0, 붙잡기를 뗀 판(BL3) −105 · −210 · −288.

리뷰는 같은 꼴 60 판에서 `scrollTop` 이 바뀐 판(바닥에서 잘림)만 셌다(20 / 60). 화면 자리로 재면 칸이 놓인 노드 위에서 걷히는 판은 모두 뛴다 — 위 «고침을 뗀 판» 16 / 16. 고친 판에서는 바닥에서 잘리는 판도 자리 차 0 이었다(이 시드의 16 판 — 놓인 노드 아래 칸이 걷힌 높이가 굴린 만큼보다 작았다). `keep-drop-place.tsx` 머리말의 «남는 것»(아래 칸이 걷힌 만큼 바닥에서 잘림)은 이 판들에서 안 섰다.

## 혼자 죽는 변조

백업 이름은 경로 전체(`/` → `__`) · 맞은 수 1 확인 · 복원은 `cmp` · 유닛 변조는 새 · 바꾼 케이스가 든 여섯 파일(`indent-fit` · `structure-actions` · `toolbar-status` · `toolbar-status-reach` · `zone-rebase` · 렌더러 `zones-editor-options`)을 함께 돌렸다 — «실행» 은 그 여섯의 통과 + 실패(102). 실브라우저 변조(B…)는 `zone-editor-review.test.ts` 한 파일(4) · dev 번들. BH1 은 H1 판의 기다림을 고친 뒤 다시 잰 값이다.

| # | 자리 | 바꾼 것 | 실행 · 사망 | 죽은 케이스 — 실패 값 | 복원 |
| --- | --- | --- | --- | --- | --- |
| K1 | `apps/web/src/shell/editor-keys.tsx` | 꺼진 내어쓰기 키의 정보 통지를 뗌 | 실행 102 · 사망 1 | 들여쓰기 · 내어쓰기 — 받는 타입 · 설 자리(리뷰 RV-ZE H1) > 탭 패널 안 글의 내어쓰기는 탭 몸통(탭 패널만 받는다)이라 꺼지고, 키는 편집 없이 다른 입구와 같은 까닭을 말한다 — `AssertionError: expected { calls: +0, …(2) } to deeply equal { calls: +0, …(2) }` | cmp True |
| K2 | `apps/web/src/shell/editor-keys.tsx` | 꺼진 들여쓰기 키의 정보 통지를 뗌 | 실행 102 · 사망 1 | 들여쓰기 · 내어쓰기 — 받는 타입 · 설 자리(리뷰 RV-ZE H1) > 탭 패널의 들여쓰기는 앞 탭 패널 몸통(탭 안에만 선다)이라 꺼지고, 키는 편집 없이 까닭을 말한다 — `AssertionError: expected { calls: +0, …(2) } to deeply equal { calls: +0, …(2) }` | cmp True |
| K3 | `apps/web/src/shell/editor-keys.tsx` | 켜진 내어쓰기 키가 들여쓰기 까닭이 있을 때만 돈다 | 실행 102 · 사망 1 | 들여쓰기 · 내어쓰기 — 받는 타입 · 설 자리(리뷰 RV-ZE H1) > 설 수 있는 자리면 그대로 나간다 — 카드 안 글의 내어쓰기는 뿌리 몸통으로 편집 하나 — `AssertionError: expected { calls: [], …(2) } to deeply equal { calls: [ [ { …(3) } ] ], …(2) }` | cmp True |
| A1 | `apps/web/src/edit/structure-actions.ts` | 뿌리 몸통으로 나가는 내어쓰기의 설 자리 판정을 뗌(`holder.parent.type !== 'Page'`) | 실행 102 · 사망 1 | levelRefusals — 들여쓰기 · 내어쓰기가 갈 자리의 받는 타입 · 설 자리(리뷰 RV-ZE H1) > 갈 자리가 그 노드를 안 받으면 다른 입구와 같은 문장이고 판정이 꺼진다 — 받으면 `null` 이고 켜진다 — `AssertionError: expected { t1: { indent: null, …(2) }, …(2) } to deeply equal { t1: { indent: null, …(2) }, …(2) }` | cmp True |
| A2 | `apps/web/src/edit/structure-drop.ts` | `fitRefusal` 이 모르는 타입을 거절 | 실행 102 · 사망 1 | levelRefusals — 들여쓰기 · 내어쓰기가 갈 자리의 받는 타입 · 설 자리(리뷰 RV-ZE H1) > 카탈로그에 없는 타입은 받는 타입 · 설 자리 판정에 안 걸린다 — 자리로만 판정한다(치울 길을 막지 않는다) — `AssertionError: expected { indent: '알 수 없는 타입', …(1) } to deeply equal { indent: null, outdent: null }` | cmp True |
| A3 | `apps/web/src/edit/structure-actions.ts` | 고른 것 없음(`at === null`)에 들여쓰기 까닭을 냄 | 실행 102 · 사망 1 | levelRefusals — 들여쓰기 · 내어쓰기가 갈 자리의 받는 타입 · 설 자리(리뷰 RV-ZE H1) > 없는 노드 · 루트 · 고른 것 없음 · 문서 없음은 둘 다 `null` 이다 — `AssertionError: expected [ …(4) ] to deeply equal [ …(4) ]` | cmp True |
| A4 | `apps/web/src/edit/structure-actions.ts` | `structureAbilities` 의 `outdent` 에서 `levelRefusals` 를 뗌 | 실행 102 · 사망 2 | 들여쓰기 · 내어쓰기 — 받는 타입 · 설 자리(리뷰 RV-ZE H1) > 탭 패널 안 글의 내어쓰기는 탭 몸통(탭 패널만 받는다)이라 꺼지고, 키는 편집 없이 다른 입구와 같은 까닭을 말한다 — `AssertionError: expected { calls: 1, …(2) } to deeply equal { calls: +0, …(2) }`<br>levelRefusals — 들여쓰기 · 내어쓰기가 갈 자리의 받는 타입 · 설 자리(리뷰 RV-ZE H1) > 갈 자리가 그 노드를 안 받으면 다른 입구와 같은 문장이고 판정이 꺼진다 — 받으면 `null` 이고 켜진다 — `AssertionError: expected { t1: { indent: null, …(2) }, …(2) } to deeply equal { t1: { indent: null, …(2) }, …(2) }` | cmp True |
| A5 | `apps/web/src/edit/structure-actions.ts` | `structureAbilities` 의 `indent` 에서 `levelRefusals` 를 뗌 | 실행 102 · 사망 2 | 들여쓰기 · 내어쓰기 — 받는 타입 · 설 자리(리뷰 RV-ZE H1) > 탭 패널의 들여쓰기는 앞 탭 패널 몸통(탭 안에만 선다)이라 꺼지고, 키는 편집 없이 까닭을 말한다 — `AssertionError: expected { calls: 1, …(2) } to deeply equal { calls: +0, …(2) }`<br>levelRefusals — 들여쓰기 · 내어쓰기가 갈 자리의 받는 타입 · 설 자리(리뷰 RV-ZE H1) > 갈 자리가 그 노드를 안 받으면 다른 입구와 같은 문장이고 판정이 꺼진다 — 받으면 `null` 이고 켜진다 — `AssertionError: expected { t1: { indent: null, …(2) }, …(2) } to deeply equal { t1: { indent: null, …(2) }, …(2) }` | cmp True |
| Z1 | `apps/web/src/store/anchored-ops.ts` | 맵이 없으면 못 얹음 | 실행 102 · 사망 3 | 리베이스 — 구역이 든 문서의 무작위 판 > 내 편집이 남의 편집 뒤에 같은 뜻으로 얹힌다 — 못 얹는 것은 둘이 같은 구역을 함께 만든 판뿐 — `AssertionError: expected [ …(5) ] to deeply equal []`<br>맵을 지운 판 · 빈 구역 키 — 정해진 판(리뷰 RV-ZE M1 · L3) > B5 — 맵이 있을 때 낸 키 `add` 는 남이 맵을 지웠으면 맵째로 되살아난다 — `AssertionError: expected undefined to deeply equal [ { op: 'add', …(2) } ]`<br>맵을 지운 판 · 빈 구역 키 — 정해진 판(리뷰 RV-ZE M1 · L3) > B5 — 빈 구역으로 옮기기(키 `add` 빈 배열 + `move`)도 남이 맵을 지웠으면 맵째로 되살아난다 — `AssertionError: expected undefined to deeply equal { op: 'add', …(2) }` | cmp True |
| Z2 | `apps/web/src/store/anchored-ops.ts` | 빈 배열 키 `add` 는 붙잡지 않음 | 실행 102 · 사망 2 | 맵을 지운 판 · 빈 구역 키 — 정해진 판(리뷰 RV-ZE M1 · L3) > B5 — 빈 구역으로 옮기기(키 `add` 빈 배열 + `move`)도 남이 맵을 지웠으면 맵째로 되살아난다 — `AssertionError: expected undefined to deeply equal { op: 'add', …(2) }`<br>맵을 지운 판 · 빈 구역 키 — 정해진 판(리뷰 RV-ZE M1 · L3) > B4 — 키 `add` 도 · 빈 구역으로 옮기기도 남이 남긴 빈 구역에 얹힌다 — `AssertionError: expected undefined to deeply equal [ { op: 'move', …(2) } ]` | cmp True |
| Z3 | `apps/web/src/store/anchored-ops.ts` | 노드가 든 키 `add` 는 붙잡지 않음 | 실행 102 · 사망 2 | 맵을 지운 판 · 빈 구역 키 — 정해진 판(리뷰 RV-ZE M1 · L3) > B5 — 맵이 있을 때 낸 키 `add` 는 남이 맵을 지웠으면 맵째로 되살아난다 — `AssertionError: expected undefined to deeply equal [ { op: 'add', …(2) } ]`<br>맵을 지운 판 · 빈 구역 키 — 정해진 판(리뷰 RV-ZE M1 · L3) > B4 — 키 `add` 도 · 빈 구역으로 옮기기도 남이 남긴 빈 구역에 얹힌다 — `AssertionError: expected undefined to deeply equal [ { op: 'add', …(2) } ]` | cmp True |
| Z4 | `apps/web/src/store/anchored-ops.ts` | 빈 구역에 넣을 노드가 있으면 못 얹음 | 실행 102 · 사망 2 | 맵을 지운 판 · 빈 구역 키 — 정해진 판(리뷰 RV-ZE M1 · L3) > B4 — 남이 만들었다 비운 구역에 오는 내 맵째 첫 넣기는 `add …/zones/k/0` 으로 얹힌다 — `AssertionError: expected undefined to deeply equal [ { op: 'add', …(2) } ]`<br>맵을 지운 판 · 빈 구역 키 — 정해진 판(리뷰 RV-ZE M1 · L3) > B4 — 키 `add` 도 · 빈 구역으로 옮기기도 남이 남긴 빈 구역에 얹힌다 — `AssertionError: expected undefined to deeply equal [ { op: 'add', …(2) } ]` | cmp True |
| Z5 | `apps/web/src/store/anchored-ops.ts` | 노드 하나 든 구역도 «비었다» | 실행 102 · 사망 2 | 맵째 op 을 구역 키로 좁힌다 — 정해진 판 > 남이 같은 구역을 먼저 만들었으면 못 얹는다 — 남의 노드를 덮지 않는다 — `AssertionError: expected { ops: [ { op: 'add', …(2) } ], …(1) } to be null`<br>맵을 지운 판 · 빈 구역 키 — 정해진 판(리뷰 RV-ZE M1 · L3) > 남이 그 구역에 넣은 노드가 있으면 지금처럼 못 얹는다 — 키 `add` 도 덮지 않는다 — `AssertionError: expected { ops: [ { op: 'add', …(2) } ], …(1) } to be null` | cmp True |
| Z6 | `apps/web/src/store/anchored-ops.ts` | 빈 구역에 빈 배열(옮기기)은 못 얹음 | 실행 102 · 사망 1 | 맵을 지운 판 · 빈 구역 키 — 정해진 판(리뷰 RV-ZE M1 · L3) > B4 — 키 `add` 도 · 빈 구역으로 옮기기도 남이 남긴 빈 구역에 얹힌다 — `AssertionError: expected undefined to deeply equal [ { op: 'move', …(2) } ]` | cmp True |
| Z7 | `apps/web/src/store/anchored-ops.ts` | 맵이 없을 때 키 `add`(노드 든 것)만 못 얹음 | 실행 102 · 사망 1 | 맵을 지운 판 · 빈 구역 키 — 정해진 판(리뷰 RV-ZE M1 · L3) > B5 — 맵이 있을 때 낸 키 `add` 는 남이 맵을 지웠으면 맵째로 되살아난다 — `AssertionError: expected undefined to deeply equal [ { op: 'add', …(2) } ]` | cmp True |
| Z8 | `apps/web/src/store/anchored-ops.ts` | 맵이 없을 때 키 `add`(빈 배열)만 못 얹음 | 실행 102 · 사망 1 | 맵을 지운 판 · 빈 구역 키 — 정해진 판(리뷰 RV-ZE M1 · L3) > B5 — 빈 구역으로 옮기기(키 `add` 빈 배열 + `move`)도 남이 맵을 지웠으면 맵째로 되살아난다 — `AssertionError: expected undefined to deeply equal { op: 'add', …(2) }` | cmp True |
| Z9 | `apps/web/src/store/anchored-ops.ts` | 빈 구역 채우기를 맵째 op 에서만 뗌 | 실행 102 · 사망 1 | 맵을 지운 판 · 빈 구역 키 — 정해진 판(리뷰 RV-ZE M1 · L3) > B4 — 남이 만들었다 비운 구역에 오는 내 맵째 첫 넣기는 `add …/zones/k/0` 으로 얹힌다 — `AssertionError: expected undefined to deeply equal [ { op: 'add', …(2) } ]` | cmp True |
| Z10 | `apps/web/src/store/anchored-ops.ts` | 키 `add` 만 노드 하나 든 구역도 «비었다» | 실행 102 · 사망 1 | 맵을 지운 판 · 빈 구역 키 — 정해진 판(리뷰 RV-ZE M1 · L3) > 남이 그 구역에 넣은 노드가 있으면 지금처럼 못 얹는다 — 키 `add` 도 덮지 않는다 — `AssertionError: expected { ops: [ { op: 'add', …(2) } ], …(1) } to be null` | cmp True |
| R1 | `packages/renderer/src/render.tsx` | 구역 대상의 부모 덮기(`cover`)를 뗌 | 실행 102 · 사망 1 | 펼쳐 보이기(`reveal`) > 구역을 보이면 그 부모 자신도 덮는다 — 접힌 검색폼의 단추 구역(리뷰 RV-ZE L2) · 지금 탭이 아닌 패널 안이면 그 탭도 연다 — `AssertionError: expected null not to be null` | cmp True |
| BH1 | `apps/web/src/edit/structure-actions.ts` | `levelRefusals` 가 늘 `null`(H1 고침을 뗌) | 실행 4 · 사망 1 | 구역 에디터 리뷰 — 실브라우저 > H1 — 받는 타입 · 설 자리를 넘는 내어쓰기 · 들여쓰기는 편집 없이 다른 입구와 같은 까닭을 말한다 · WS 를 늦춘 판에서 그 뒤에 곧바로 넣은 편집이 산다 — `AssertionError: expected { outdentNotice: [], …(6) } to deeply equal { …(7) }` | cmp True |
| BM1 | `apps/web/src/store/anchored-ops.ts` | `newZoneKey` 가 늘 `null`(M1 고침을 뗌) | 실행 4 · 사망 1 | 구역 에디터 리뷰 — 실브라우저 > M1 거울 — 남이 맵을 만든 넣기를 되돌리는 사이 내가 그 맵의 다른 구역에 넣으면 맵째로 되살아 선다 · 통지 없음 · 화면 = 서버 — `AssertionError: expected { made: 200, removed: 200, …(5) } to deeply equal { made: 200, removed: 200, …(5) }` | cmp True |
| BL2 | `apps/web/src/canvas/canvas.tsx` | 캔버스가 고른 구역을 부모 id 로만 넘김(L2 고침을 뗌) | 실행 4 · 사망 1 | 구역 에디터 리뷰 — 실브라우저 > L2 — 접힌 검색폼 자신의 구역 줄을 고르면 캔버스가 그 폼을 펼친다 · 문서는 그대로 · 다른 것을 고르면 접힌 화면 — `AssertionError: expected { before: [ +0, +0 ], …(4) } to deeply equal { before: [ +0, +0 ], …(4) }` | cmp True |
| BL3 | `apps/web/src/canvas/keep-drop-place.tsx` | 놓지 않고 끝난 끌기의 붙잡을 노드를 안 찾음(`topmostVisible` 을 뗌) | 실행 5 · 사망 1 | L1 — 놓지 않고 끝낸 끌기(Escape)도 … 제자리다 — `AssertionError: expected [ -105, -210, -288 ] to deeply equal [ +0, +0, +0 ]` | cmp True |
| BL1 | `apps/web/src/canvas/keep-drop-place.tsx` | `KeepDropPlace` 가 안 굴림(L1 고침을 뗌) | 실행 4 · 사망 1 | 구역 에디터 리뷰 — 실브라우저 > L1 — 긴 문서 가장자리에서 스크롤해 놓은 노드는 칸이 걷혀도 보인 자리에 선다(구역 없는 대조군과 같다) — `AssertionError: expected { cards: 16, sections: +0 } to deeply equal { cards: +0, sections: +0 }` | cmp True |

- **새 · 바꾼 케이스마다 혼자 죽는 변조가 있다** — `indent-fit` 셋(K1 · K2 · K3) · `levelRefusals` 셋(A1 · A2 · A3) · `zone-rebase` 다섯(Z7 · Z8 · Z9 · Z6 · Z10) · 렌더러 하나(R1) · 실브라우저 다섯(BH1 · BM1 · BL2 · BL1 · BL3 — BL3 은 Escape 판을 더한 뒤라 그 파일 5 케이스).
- **함께 죽는 것.** A4 · A5(판정에서 `levelRefusals` 를 뗌)는 셸째 판과 `levelRefusals` 판을 함께 죽인다 — 같은 판정의 두 겹이다. Z1 은 무작위 판(맵이 없는 문서의 맵째 첫 넣기)과 B5 둘, Z2 – Z5 는 B4 · B5 의 넣기 · 옮기기 쌍을 함께 죽인다 — 갈래를 좁힌 Z6 – Z10 이 하나씩 가른다. Z5 의 «같은 구역» 케이스는 앞 차수의 맵째 판이다.
- A2 는 `fitRefusal` 을 바꿔 «카탈로그에 없는 타입» 케이스만 죽였다 — 같은 문서를 쓰는 다른 입구의 케이스(`zone-insert` · `paste-ops`)는 이 묶음에 안 들었다(그 파일들은 게이트의 `pnpm test` 가 돈다).
- 유닛 · 실브라우저 변조를 돌린 뒤 `git status` 는 이 보고 파일 하나(추적 밖)였고 `git diff --stat` 은 비었다.

## 게이트

건드린 곳이 `apps/web/**` 와 `packages/renderer` 라 `README.md` 「트랙 게이트」 의 «그 밖» 줄 — 전량 넷에 운영 번들 실브라우저(L1 이 커밋 · 레이아웃 차례에 기댄다)를 더했다. 스크립트 하나 · `nohup nice -n 10 caffeinate -i` · `pnpm test` 는 `--maxWorkers=25%` · 띄우기 전 `gate-slots` 0 개(자기 키 파일을 만들고 끝에 지웠다).

| 단계 | HEAD | node | 결과 |
| --- | --- | --- | --- |
| `pnpm fmt` · `pnpm lint` · `pnpm typecheck` · `pnpm build` | `7f54b43f` | v24.21.0 | 0 · 0 · 0 · 0 |
| `pnpm test` | 같음 | 같음 | 510 파일 · **8207 통과 · 실패 0 · 건너뜀 1**(앞 판 509 파일 · 8195 + 새 케이스 12) |
| `pnpm test:build:serial` | 같음 | 같음 | 17 파일 · **156 통과 · 실패 0 · 건너뜀 1** |
| `pnpm test:browser`(dev) | 같음 | 같음 | 85 파일 · **509 통과 · 실패 0 · 건너뜀 1**(02:12 – 02:24) |
| `EDITOR_STACK_BUNDLE=build pnpm test:browser` | 같음 | 같음 | 85 파일 · **509 통과 · 실패 0 · 건너뜀 1**(02:24 – 02:33) |

- 게이트 뒤 더한 것은 실브라우저 케이스 하나(Escape 판 · 테스트 파일만)다 — 그 케이스를 dev 번들로 따로 돌렸다(1 통과) · 그 뒤 `pnpm typecheck` · `pnpm lint` 0.
- 운영 번들 갈래의 로그에는 번들 표지가 안 찍힌다 — 게이트 스크립트는 `EDITOR_STACK_BUNDLE=build step …`(zsh 함수 앞 환경 변수)로 넘겼고, 같은 꼴이 값을 넘기는 것을 따로 쟀다(`X=build f sh -c 'echo $X'` → `build`). 두 갈래의 벽시계도 갈린다(11.4 분 · 9.6 분).
- 건너뜀 셋은 이 트랙 앞부터다(구현 보고 «게이트» — `log-destination` 의 Linux 판 · `theme-kit` 템플릿 하나 · `layout-weight` 하나).
- 잠듦: `pmset -g log` 의 마지막 ` Sleep ` 은 2026-10-23 20:47 — 게이트(2026-10-24 02:01 – 02:33) · 변조 묶음과 안 겹친다.
- 끝에 이 워크트리 경로의 `vitest` · `vite` · `tsx` · Chrome 프로세스 0(`ps`). DB 컨테이너(5491)는 남겼다.

## 남은 것

- **O1**(리뷰 — 재현 안 됨)은 진단 줄을 켠 판을 다시 돌리지 않았다 — 이 트랙 밖이고 시간을 게이트에 썼다.
- **끌기를 시작하면 화면이 한 번 밀린다**(구현 보고 «빈 구역 칸은 끌기 시작에 배치를 민다» — Q2 (가) 의 값)는 그대로다. L1 은 그 끝 쪽(칸이 걷힐 때)만 닫았다.
- **관찰 — REST 로 나간 낡은 편집은 리베이스하지 않는다.** M1 판을 처음 세울 때 `joined` 전에 넣어 편집이 REST(`PATCH …/ops`)로 나갔고, 서버 409 에 «페이지가 이미 변경되었습니다 (요청 baseSeq 2, 현재 3) — 페이지를 서버 상태로 다시 불러왔고, 편집 1개가 취소됐습니다.» 로 버려졌다. WS 길의 `stale` 은 리베이스로 다시 얹는다. 실시간 채널이 없는 판(연결 전 · 끊김)의 길이고 이 트랙의 장치와 무관하다 — 원래 있던 길인지는 고치기 전 소스로 재지 않았다.

## 지침

1. **무엇이 비었나:** «앞 편집의 거절이 뒤에 줄 선 편집까지 버린다» 를 재는 실브라우저 판은 앞 편집의 답이 오기 **전에** 다음 편집을 줄 세워야 선다. 이 트랙의 첫 H1 판은 앞 키의 통지를 1.5s 기다린 뒤 넣어(지연 1.2s), 고침을 뗀 판에서도 422 되싣기가 먼저 끝나 줄 선 편집이 살았다 — 케이스는 다른 값(통지 · `move` 수)으로 죽어 그 사각이 안 보였다. **어디:** `.ruler/30-delegation.md` 의 «WS 를 늦춘 탭(`startWsDelay`)도 `joined` 를 받은 뒤에 누른다 …» 문장 뒤. **넣을 문장:** «**«뒤에 줄 선 편집도 버려진다» 를 재는 판은 앞 편집과 다음 편집 사이의 기다림(통지 · 화면 `settle`)의 합을 늦춘 지연보다 짧게 둔다** — 길면 고치기 전 판에서도 거절 · 되싣기가 먼저 끝나 다음 편집이 줄 서지 않고, 케이스는 다른 값으로 죽어 그 판이 안 선 것이 안 보인다. 고침을 뗀 판에서 다음 편집이 실제로 버려지는지(서버 값)를 한 번 본다(`apps/web/build-test/zone-editor-review.test.ts` «H1» — 지연 2s · 통지 300ms).»
2. **무엇이 비었나:** 놓은 뒤 화면이 튀는지를 `scrollTop` 으로 재면 문서 바닥에서 잘린 판만 센다. 리뷰는 같은 꼴 60 판에서 20 을 셌고, 놓인 노드의 화면 자리로 재면 칸이 그 노드 위에서 걷히는 판은 모두 뛰었다(16 / 16). **어디:** 리뷰 보고 «지침» 1(가장자리 자동 스크롤 판의 카나리아)이 들어갈 자리의 바로 뒤 — `.ruler/30-delegation.md` 의 «스크롤바를 누르는 판은 이 기계(macOS)의 헤드리스 Chrome 에서 기본으로 못 잰다 …» 문단. **넣을 문장:** «**놓은 뒤 · 끌기를 그만둔 뒤 화면이 튀는지는 `scrollTop` 이 아니라 그 노드의 화면 자리로 잰다** — 문서 위쪽 높이가 줄면 `scrollTop` 은 그대로인 채 노드가 뛰고, `scrollTop` 이 바뀌는 것은 바닥에서 잘린 판뿐이다. 손 떼기 직전 미리보기의 화면 위 끝과 놓은 뒤 새 노드의 위 끝을 견주고, 구역 없는 대조군을 함께 둔다(`apps/web/build-test/zone-editor-review.test.ts` «L1»).»
