# FX-VS 보고 — `setViewState` 리뷰 대응

브리프: 코디네이터 `brief-fx-vs.md` · 공통 `common-vs.md`. 워크트리 `feat-view-state-action`(브랜치 `feat/view-state-action` · 시작 HEAD `3ae448f2` · 끝 커밋은 이 보고). 출발점은 리뷰 보고 `2026-11-17-rv-vs-report.md` 「판정」 의 M1 · L1 – L5.

시작 때 잰 값: `node -v` v24.21.0 · `pnpm db port postgres 5432` → `0.0.0.0:5531` · `orca terminal list` 에 이 워크트리 경로의 터미널 없음(자기 세션도 안 보임 — 목록이 이 런타임을 못 본 것) · 추적 파일 색인 md5(`git ls-files -s apps packages | md5`) 시작 `8480f53377e5b7fefe570f8446594b2a` · `git status --short` 는 `.build/` 하나.

## 바꾼 것 — 항목마다 커밋

| 항목 | 커밋 | 고친 자리 | 잠근 케이스 |
| --- | --- | --- | --- |
| M1 나간 뒤 주소 | `38f69c7f` | `apps/web/src/shell/view-state-address.ts` — 쓰기가 멈추는 렌더(뷰 모드를 나감)에 그 렌더의 고름(되돌린 고름)으로 주소를 한 번 맞춘다(기본이면 질의를 걷는다) | `apps/web/build-test/set-view-state.test.ts` «RV-VS M1 …» 새 케이스 · «Focus 3 …» 에 `search` 를 더함 |
| L1 떠났다 돌아옴 | `4d43815f` | `apps/web/src/shell/use-view-state.ts` — 들어가기 전 고름을 페이지마다 적는 표(`Map`)로 바꾸고 머리말을 그 뜻으로 고침 | 같은 파일 «RV-VS L1 …» 새 케이스 · 픽스처에 페이지 «다른»(같은 id `s_detail` · 다른 이름 «B 상세») |
| 정본 | `304e11cf` · `5f68fffd` | `docs/superpowers/specs/2026-08-03-wirebound-design.md` — §8.3 «화면 상태 바꾸기» · §9 «화면 상태» 의 «지금 상태» · «읽기 — 주소» · «상태 삭제는 확인 상자다» · §모듈 «저장» · «넣기» | — |
| L2 번들 화면 모드 | `b8acca88` | `packages/exporter/src/browser/boot.tsx` 의 `reflect` — 화면 모드(`wb-export-screen` 클래스)면 해시를 안 쓰고 전환기 값만 싣는다 | `packages/exporter/test/bundle-view-states.test.ts` «런타임 — 상호작용이 상태를 바꾸면» 둘 · `apps/web/build-test/set-view-state.test.ts` «RV-VS L2 …» |
| L3 모듈 넣기 | `b0d287a3` | `apps/web/src/palette/module-insert.ts` — `prepareNodesForPaste` 에 `state: () => false` | `apps/web/test/edit/module-insert.test.ts` ««화면 상태 바꾸기» 의 상태 대상은 빼고 센다 …» |
| L4 상태 삭제 상자 | `686ff3b0` · `c32ad440`(케이스 타입 주석) | `apps/web/src/panels/remove-state-dialog.tsx` — 함께 지워지는 노드 밖에서 지우는 상태(와 하위 상태)로 바꾸는 동작이 든 노드 수를 «상호작용 N곳이 끊깁니다 — 지우는 상태로 바꾸는 동작이 남습니다.» 로 보인다 | `apps/web/test/panels/page-states.test.tsx` «지우는 상태 · 하위 상태로 바꾸는 상호작용이 든 노드 수를 …» |
| L5 그리드 떼어 내기 | `33b6f778` | `apps/web/src/edit/grid-row-actions.ts` 의 `targetedFromOutside` — `isViewStateAction` 이면 건너뛴다 | `apps/web/test/edit/grid-row-actions.test.ts` «바깥의 «화면 상태 바꾸기» 가 행 · 행 안 노드 id 와 같은 글자의 상태로 바꿔도 뗄 수 있다» |

## 결정과 이유

1. **L1 — 브리프 문장 그대로 짠 판은 고치기 전 소스와 화면 값이 같다.** «뷰 모드 동안 건드린 페이지마다 들어가기 전 고름을 적고, 나갈 때 그 페이지들을 모두 되돌린다» 를 페이지마다의 표로 짰다(들어간 페이지 = 그때의 고름 · 뷰 모드에서 처음 연 페이지 = 기본 · 페이지를 옮겨도 앞 페이지의 기록을 안 버림 · 나갈 때 선 페이지가 그 기록으로 돌아감). 고름은 페이지를 옮기면 기본으로 돌아가므로(편집 모드 규칙) 들어간 페이지 밖의 기록은 늘 «기본» 이고, 결과는 고치기 전의 `beforeView.pageId === props.pageId ? beforeView : null` 과 같다 — 리뷰 ②b(떠났다 돌아와 나가면 «상세 열림»)는 **이 방향에서 옳은 값**이고, 리뷰가 «머리말과 다르다» 고 한 것은 머리말 쪽이 틀린 것이었다. 그래서 L1 의 실질 고침은 머리말 · 정본 문장이고, 케이스는 그 동작을 잠근다(고치기 전 소스에서 L1 케이스의 화면 칸은 이미 초록 · 주소 칸만 빨강 — 주소는 M1 몫). Focus 3 케이스는 이 판에서 안 죽었다(멈출 조건 아님).
   - «모두 되돌린다» 의 다른 페이지 몫은 화면에 들 자리가 없다(고름은 셸 하나 · 열린 페이지 하나). 남는 것은 **그 페이지들의 브라우저 기록 항목**이다 — 뷰 모드가 `replace` 로 쓴 `?state=` 가 남아, 나간 뒤 뒤로 가기가 편집 모드에서 뷰 모드의 상태를 연다(리뷰 «원래 있던 길» ①a). 다른 기록 항목은 고칠 수 없어 손대지 않았다 — 「남은 것」.
2. **M1 은 «쓰기를 멈추는 렌더에 한 번» 으로 짰다** — 리뷰 제안의 첫 길(`writes` 참 → 거짓 전환에서 그 렌더의 `state` 로 `replace` 한 번). 둘째 길(들어갈 때의 주소 질의를 적어 나갈 때 되돌림)은 떠났다 돌아온 판 · 뷰 모드에서 처음 연 페이지에서 나갈 때 맞출 값이 없어 고르지 않았다. viewer 는 늘 쓰므로 전환이 없다.
3. **L2 의 화면 모드 판정은 해시가 아니라 클래스로 한다** — 부팅이 `#wb-screen` 이면 `wb-export-screen` 을 단다(`boot.tsx`). 해시로 보면 한 번 덮인 뒤에는 화면 모드를 잃는다.
4. **L4 의 수는 열쇠(네 집합)에 넣지 않았다** — 열쇠는 «보인 것 = 보낼 묶음» 을 견주는 것이고 끊기는 동작은 묶음이 안 고친다. 남이 연 상자 밑에서 그 상태로 바꾸는 동작을 더하면 그 줄만 따라 고쳐 선다(«목록이 바뀌었습니다» 를 안 세운다). 수는 «곳»(노드) 단위 — 한 노드에 그런 동작이 둘이어도 한 곳이다. 함께 지워지는 노드 안의 동작은 노드째 사라져 안 센다.
5. **L3 은 기본(`default`) 대상을 남긴다** — `prepareNodesForPaste` 가 `default` 는 `keep.state` 를 안 묻고 남긴다(모듈 저장 `moduleNodesForSave` 와 같은 결과).

## 잰 값

### M1 · L1 — 실브라우저(`editor-stack` · vite dev — 소스를 읽어 빌드 무관)

`pnpm vitest run -c vitest.browser.config.ts apps/web/build-test/set-view-state.test.ts -t '에디터 뷰 모드'`

| 판 | 고치기 전 소스 | 고친 뒤 |
| --- | --- | --- |
| 실행 · 통과 · 실패 · 건너뜀 | 6 · 3 · 3 · 2 | 6 · 6 · 0 · 2 |
| Focus 3 — 나간 뒤 `search` | `''`(기대 `?state=s_detail`) | `?state=s_detail` |
| M1 — 나간 뒤 `search` · 새로고침 화면 | `?state=s_detail` · 상세 열림 | `''` · 기본 |
| L1 — 돌아와 나간 뒤 화면 · `search` | 상세 열림 · `''` | 상세 열림 · `?state=s_detail` |
| L1 — «다른» 에서 나간 뒤 화면 · `search` | 기본 · `?state=s_detail` | 기본 · `''` |

### L2

- jsdom(`packages/exporter/test/bundle-view-states.test.ts`): 고치기 전 화면 모드 판의 해시 `#state=s_admin`(기대 `#wb-screen`) — 실행 16 · 실패 1. 고친 뒤 16 · 16.
- 실브라우저(`set-view-state.test.ts -t 'HTML 번들'` · `pnpm build` 뒤 — 고치기 전 판은 고침을 뗀 변조 E1 을 건 채 `pnpm build` 한 dist): 실행 3 · 실패 1(«RV-VS L2») · 건너뜀 6 → 고친 dist 로 다시 빌드한 뒤 3 · 3 · 0.

### L3 · L4 · L5 — jsdom · node

| 항목 | 파일 | 고치기 전 | 고친 뒤 |
| --- | --- | --- | --- |
| L3 | `apps/web/test/edit/module-insert.test.ts` | 10 · 실패 1 — `{ targets: ['s_admin', 'default'], dropped: 0 }`(기대 `['default']` · 1) | 10 · 10 |
| L4 | `apps/web/test/panels/page-states.test.tsx` | 문장 2개(셋째 «상호작용 2곳이 끊깁니다 …» 없음 — 문장 함수만 먼저 두고 잰 판) | 18 · 18 |
| L5 | `apps/web/test/edit/grid-row-actions.test.ts` | 14 · 실패 1 — 거절 문장 «이 행을 가리키는 상호작용이 있어 뗄 수 없습니다 …»(기대 `null`) | 14 · 14 |

### L5 — 노드 id 로 읽는 다른 자리 셈

브리프의 식 `git grep -n -E 'isPageTargetAction|isTargetlessAction' -- apps packages ':!*.md'`(테스트 빼고) 은 23 줄 — 모두 페이지 대상 · 대상 없음을 가르는 자리이고 노드 갈래가 있는 곳(`clipboard.ts` · `module/save.ts` · `validate.ts` · `renderer/src/interaction/runtime.ts`)은 그 앞에 `isViewStateAction` 갈래가 있다. 그 식은 대상을 타입 없이 읽는 자리를 못 세므로 `action.target` · `actionTarget(` · `target?: unknown` · 상호작용을 도는 루프(`interactions` 의 `for` · `.map` · `.some` · `.flatMap`)로 한 번 더 셌다:

- 노드 id 로 읽고 상태 대상을 안 가르던 자리: **`apps/web/src/edit/grid-row-actions.ts` 의 `targetedFromOutside` 하나**(L5 — 고침).
- `actionTarget(` 을 부르는 소스는 0(정의뿐 · 테스트만 쓴다).
- 마이그레이션 `0024-modules.ts`(`inside.has(action.target)`) · `0028` · `0029` · `0032` 는 `setViewState` 가 생기기 전 판의 문서만 지난다(앞 판 DB 를 올릴 때만 돈다) — `0028` · `0029` · `0032` 는 타입(`switchTab` · `setProp`)으로 고른다.
- 나머지(`paste-states.ts` — 상태 이름 옮김 · `interaction-panel.tsx` — 편집 칸 · `describe.ts` — 타입마다 갈래 · `tree.ts:92` — 재발급이 이미 건너뜀 · `exporter/src/browser/mount.tsx` — 수만 셈 · `lint/design.ts` — 페이지 · 팝업 닫기만)는 노드로 안 읽는다.

## 혼자 죽는 변조

`mut.py`(스크래치 — 백업 이름 = 경로 전체 · 맞은 수 1 확인 · 바이트 비교 복원). 실패 값은 모두 `AssertionError`(재려던 값) — 시간 초과 · 판 카나리아로 죽은 것 없음.

| 변조 | 자리 · 바꾼 글 | 돌린 파일 | 실행 · 실패 | 죽은 케이스 |
| --- | --- | --- | --- | --- |
| V1 나갈 때 주소를 안 맞춤 | `view-state-address.ts` — `if (!(writes \|\| leftWriting) \|\| pageId` → `if (!writes \|\| pageId` | `set-view-state.test.ts -t '에디터 뷰 모드'` | 6 · 3 | Focus 3 · RV-VS M1 · RV-VS L1(셋 다 `search` 칸) |
| V2 페이지를 옮기면 기록을 버림(리뷰가 제안한 다른 길) | `use-view-state.ts` — 새 페이지 기록을 `before = null` · `setBeforeView(null)` 로 | 같은 판 | 6 · 1 | RV-VS L1 혼자 |
| E1 화면 모드에도 해시를 씀 | `boot.tsx` — 가드를 떼고 `writeHash(state)` | `bundle-view-states.test.ts` / 실브라우저 `-t 'HTML 번들'`(변조 dist) | 16 · 1 / 3 · 1 | 화면 모드 판 혼자 / RV-VS L2 혼자 |
| E2 상호작용이 해시를 안 씀 | `boot.tsx` — 가드 줄을 `void 0` | `bundle-view-states.test.ts` | 16 · 1 | «전환기와 주소 해시가 따라간다» 혼자 |
| W3 모듈 넣기가 상태 대상을 남김 | `module-insert.ts` — `state: () => false` 를 뗌 | `module-insert.test.ts` | 10 · 1 | L3 케이스 혼자 |
| W4a 함께 지워지는 노드의 동작도 셈 | `remove-state-dialog.tsx` — `else if (` → `if (` | `page-states.test.tsx` | 18 · 1 | L4 케이스 혼자 |
| W4b 지우는 상태가 아닌 대상도 셈 | 같은 파일 — `isViewStateAction(action) && goneStates.has(action.target)` → `isViewStateAction(action)` | 같은 파일 | 18 · 1 | L4 케이스 혼자 |
| W5 떼어 내기가 상태 대상을 노드로 읽음 | `grid-row-actions.ts` — `\|\| isViewStateAction(…)` 를 뗌 | `grid-row-actions.test.ts` | 14 · 1 | L5 케이스 혼자 |

- **주소 축(V1)은 늘 셋이 함께 죽는다** — 셋 다 나간 뒤 `search` 를 본다. 그 축은 «RV-VS M1» 이 갖고(기본으로 나가 질의를 걷는 판 · 새로고침), 케이스 파일 머리말에 그렇게 적었다. Focus 3 의 화면 축은 리뷰의 W2(`back = current`)가 잰다 — 이 차수에 다시 안 돌렸다(그 변조는 Focus 3 · M1 · L1 을 함께 죽일 것이다 — 셋 다 나간 뒤 화면을 본다).

## 게이트

정본을 고쳤으므로 **전량 넷**(+ 그 앞 `pnpm fmt` · `pnpm lint`)을 돌았다. 체인은 스크래치 `gate.sh` 하나(`nohup nice -n 10 caffeinate -i` · 단계마다 `rc=$?`). node v24.21.0(`mise env` 뒤). 게이트 슬롯은 `pnpm test` · `test:build` 앞에서 0 개를 세고 `fx-vs` 를 만들었다 지웠다(끝에 비어 있다).

| 단계 | 시각 | rc | 실행 · 통과 · 실패 · 건너뜀 |
| --- | --- | --- | --- |
| `pnpm fmt` | 12:27:53 | 0 | 뒤 `git status` 는 `.build/` 뿐 |
| `pnpm lint` | 12:27:53 | 0 | |
| `pnpm typecheck` | 12:28:06 | **2** | `apps/web/test/panels/page-states.test.tsx(449,61)` TS2322 — L4 케이스의 `children` 배열이 `WbNode[]` 로 안 읽힘. 타입 주석 한 자리로 고쳐(`c32ad440`) 다시 돌린 판 rc 0 |
| `pnpm build` | 12:28:10 | 0 | |
| `pnpm test --maxWorkers=25%` | 12:28:11 – 12:38:33 | 0 | 634 파일 · 9585 · 9582 · 0 · 3(경로로 가름: `apps/api` 193 파일 2883 · 2 건너뜀 / `apps/web` 249 파일 3762 · 1 / 나머지 192 파일 2940 · 0) |
| `pnpm test:build:serial` | – 12:41:20 | 0 | 18 파일 · 179 · 178 · 0 · 1 |
| `pnpm test:browser` | – 12:57:21 | 0 | 133 파일 · 837 · 835 · 0 · 2 |

- `pnpm test` 는 타입 주석을 고치기 전 파일로 돌았다 — 고침은 타입 주석뿐이라 실행 값이 같다(jsdom 판 `page-states.test.tsx` 18 · 18 은 고친 뒤에도 같다).
- load: 시작 6.23 · `pnpm test` 끝 4.61 · 끝 12.21(다른 저장소 일 — 45 아래). 시간 초과로 죽은 파일 없음.
- 잠듦: `pmset -g log` 의 마지막 ` Sleep ` 줄이 2026-11-16 02:48 — 이 차수의 실행(2026-11-17 12:16 – 12:57)과 안 겹친다.
- 추적 파일 색인 md5(`git ls-files -s apps packages | md5`) 끝 `9945fec92ee54db1c42f90c6ff103f35` — 시작값과 다른 것은 이 차수의 커밋 몫이다(작업 중 다른 쓰는 자를 본 적 없음 · `orca terminal list` 는 이 워크트리를 못 봤다).
- 끝에 이 워크트리 경로의 `vitest` · `vite` · Chrome 0. 실브라우저 판은 매 실행 `editor-stack` 이 제 DB · 포트를 띄우고 거뒀다(자기 Postgres 5531 은 남긴다).

## 남은 것

- **뷰 모드가 쓴 다른 기록 항목의 `?state=`** — 뷰 모드 동안 연 페이지들의 브라우저 기록 항목에 `?state=` 가 남아, 나간 뒤 뒤로 가기가 편집 모드에서 뷰 모드의 상태를 연다(리뷰 «원래 있던 길» ①a). «시연은 어느 페이지의 편집 화면에도 남지 않는다» 의 이 몫은 지금 판이 못 닫는다 — 닫으려면 편집 모드의 주소 읽기가 «뷰 모드가 쓴 질의» 를 알아보고 건너뛰어야 한다(그 판의 링크 · 메뉴 트리 상태 줄과 가를 값이 필요하다). 이월.
- 리뷰 «원래 있던 길» 의 나머지 셋(붙이기의 같은 id · 다른 뜻 · 번들의 다른 해시 덮기 · 경고 문장의 대상 글자)은 손대지 않았다.
- L4 는 jsdom 으로만 쟀다(상자 화면 · 실브라우저 판 없음).

## 지침

1. **무엇이 비어 있나:** 리뷰가 «머리말과 다르다» 로 짚은 항목(RV-VS L1)을 브리프가 «방향 문장 + 머리말도 고친다» 로 넘겼는데, 그 방향을 그대로 짜니 코드의 화면 값은 고치기 전과 같았다 — 틀린 것은 코드가 아니라 머리말이었다. 지금 지침의 «고칠 방향이 기존 함수의 동작을 결과로 기대면 … 한 줄 확인» 은 코드가 방향을 못 따르는 판만 말하고, 코드가 이미 방향대로인 판(고침이 문장뿐)은 말하지 않는다.
   - **어느 문서 어느 절:** `.ruler/30-delegation.md` — «브리프의 «고쳐라»도 재현이 먼저다» 문단 끝.
   - **넣을 문장:** «**리뷰가 «머리말 · 정본과 코드가 다르다» 로 짚은 항목은 정한 방향이 어느 쪽과 맞는지 먼저 가른다** — 방향이 코드 쪽이면 고침은 머리말 · 정본 문장이고, 케이스는 그 동작을 잠그되 «고치기 전 빨강» 이 없다고 보고에 적는다(`docs/superpowers/plans/2026-11-17-fx-vs-report.md` «결정» 1).»
