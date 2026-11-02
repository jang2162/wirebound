# FX-PV · 테마 미리보기 리뷰 대응 + main 합치기 — 보고

브랜치 `feat/theme-preview` · 브리프 `.coord/brief-fx-pv.md` · 리뷰 보고 `2026-11-02-rv-pv-report.md`(«남은 것» 표의 H1 · M1 · M2 · M2b · L1 · L2).
L3(문턱 높이의 깜빡임)은 손대지 않았다(이월).

## 바꾼 것

### 1단계 — 리뷰 대응

| 결함 | 고친 자리 | 무엇 |
| --- | --- | --- |
| H1 | `apps/web/src/canvas/canvas-popups.tsx` 의 `usePopupArea` | 덮개 셈을 iframe 요소의 크기 바뀜(`ResizeObserver`)에도 다시 부른다. 에디터 캔버스와 함께 쓰는 훅이다 |
| M1 | `apps/web/src/settings/theme-preview.tsx` 의 `useTopOnPageChange` | 장(`page` 상태)이 바뀌면 상자 `scrollTop` 을 0 으로, 틀 위 끝이 바깥 스크롤 칸(없으면 창) 위로 나가 있으면 틀을 그 칸 안으로 내린다. 장 이름 줄 · 예제 안 이음이 같은 상태를 바꾸므로 둘 다 덮는다 |
| M2 · M2b | `apps/web/src/settings/token-editor.tsx` | 저장이 끝나면(성공 · 409 · 422 · 실패 모두) 그 커밋 뒤 답(표지 `data-wb-token-answer` — 409 나란히 보기 · «고칠 칸이 있습니다» · 알림 문장)을 감싼 구간의 아래 끝이 보이는 구간 밑이면 그만큼 굴린다(`revealBelow`) |
| L1 | `packages/theme-gallery/src/examples/theme-examples.tsx` | 예제 뿌리가 `auxclick` 도 막는다(`onAuxClick={keepInside}`) |
| L2 | `apps/web/src/settings/token-editor.tsx` | 무리가 0 이면 `role="tablist"` 를 안 그린다(«토큰 저장» · «전부 기본값으로» 는 그대로 — 늘 꺼짐) |

`scrollParent`(`canvas-popups.tsx`)를 내보내 M1 · M2 가 함께 쓴다.

케이스(`apps/web/build-test/rv-pv-preview.test.ts` · `rv-pv-themes.test.ts`): `it.fails` 여섯에서 `.fails` 를 떼고 머리말을 지금 참인 글로 고쳤다. 더한 것:

- M1 을 넓혔다 — 이음으로 옮긴 뒤 이어서 긴 대시보드를 끝까지 굴린 채 **장 이름 줄** «주문 상세» 로 옮긴 판도 잰다.
- **M1b**(새) — 390 에서 바깥 칸을 굴려 틀 위 끝이 창 밖(−200)일 때 이음으로 옮기면 틀 위 끝이 창 안(≥ 0)이다. 설정 화면은 틀이 맨 끝이고 높이가
  창에 묶여(`max-height: 60vh` · 넓으면 `100vh − 32px`) 끝까지 굴려도 틀 위 끝이 창 안에 남는다 — 틀 밑 내용은 바깥 칸의 아래 여백(2000px)으로
  흉내 냈다.
- **M2c**(새) — 390 에서 «토큰 저장» 이 성공하면 «토큰을 저장했습니다» 가 창 안이다(M2 의 «저장 문장» 갈래 — 리뷰 케이스에 없었다).

### 2단계 — main 합치기

`git merge main`(트랙 C `77041409`) → 커밋 `ad5bc186`. **충돌 없이 git 이 셋을 조용히 합쳤다**(`apps/web/src/shell.css` ·
`docs/superpowers/specs/2026-08-03-wirebound-design.md` · `apps/web/build-test/rv-ws-workspace.test.ts`). 셋 다 «양쪽이 바꾼 줄이 합친 판에 글자
그대로 들었나» 를 쟀다 — 합친 판 대 main 의 바뀐 줄(`+`/`-`)이 기준 `88c4505d` 대 이 브랜치의 바뀐 줄과 같고(md5), 합친 판 대 이 브랜치의 바뀐 줄이
기준 대 main 의 바뀐 줄과 같다. 셋 다 «같음». 합친 판을 커밋 전에 `pnpm typecheck` 로 쟀다(rc 0).

**파일 수의 등식**(`git ls-tree` 로 프로젝트마다 include 글롭을 센 것 — 실행 수는 «게이트»):

| 프로젝트 | 기준 `88c4505d` | + C | + P | = | 합친 판 |
| --- | --- | --- | --- | --- | --- |
| unit | 170 | 0 | 1 | 171 | 171 |
| api | 181 | 0 | 0 | 181 | 181 |
| web | 228 | 0 | 1 | 229 | 229 |
| build(`test:build:serial`) | 18 | 0 | 0 | 18 | 18 |
| 실브라우저(`apps/web/build-test/**` — `export-bundle` 포함 글롭) | 102 | 2 | 4 | 108 | 108 |

## 결정과 이유

- **M2 는 «답이 서면 그 자리를 창 안으로» 를 골랐다(답을 탭 줄 곁으로 옮기지 않았다).** 처음에 답 셋을 탭 줄 바로 밑으로 옮겨 봤는데, 그러면
  칸에 검사에 걸리는 값을 치는 동안 서는 «고칠 칸이 있습니다» 가 격자 위에 끼어 **치던 칸이 아래로 밀린다**(1280 에서도). 굴리기는 저장이 끝난
  그 한 번뿐이고(치는 동안의 문장은 안 굴린다) 이미 보이면 아무것도 안 하므로 1280 판은 안 굴린다(리뷰가 잰 1280×900 의 답 위 끝 611 · 627 은 창 안이다 — «다른 탭의 422» 의 1280 판이 그 자리를 창 안으로 단언한다).
- **`scrollIntoView` 를 안 쓴다**(M1 · M2) — 굴릴 수 있는 `overflow: hidden` 조상(미리보기 틀)까지 굴린다(리뷰 «혼자 죽는 변조» T4b 가 케이스에서
  겪은 것). 가장 가까운 세로 스크롤 칸의 `scrollTop` 을 직접 고친다.
- **굴리는 양은 «아래 끝을 보이는 구간 안으로, 위 끝이 위로 나가지 않는 데까지»** — 409 나란히 보기가 창보다 길면 위 끝(제목)을 맞춘다.
- **L2 에서 단추 둘은 남겼다** — 브리프가 짚은 것은 빈 `tablist` 뿐이고, 단추를 걷으면 owner 화면의 꼴이 토큰 수에 따라 갈린다.

## 잰 값

실브라우저(`pnpm vitest run -c vitest.browser.config.ts <파일>`) · node v24.21.0 · 고친 소스 · 갤러리 `dist` 는 고친 소스로 다시 지은 판.

| 파일 | 실행 · 결과 | 시각 · load |
| --- | --- | --- |
| `rv-pv-preview.test.ts` | 9 통과(H1 · M1 · M1b · L1 · 기록 · 다른 탭의 422 · M2b · M2c · M2) · 건너뜀 0 | 15:15 – 15:19 |
| `rv-pv-themes.test.ts` | 6 통과(L2 포함) · 건너뜀 0 | 15:18 – 15:19 · 28 → 43 |
| `rv-pv-canvas-popup.test.ts` | 7 통과 — 덮개 = «칸 ∩ iframe ∩ 창» 을 1px 안에서 단언하므로 리뷰 표와 같은 값 | 같은 실행 |
| `popup-layer.test.ts`(에디터 팝업 판 — `git grep -ln "data-wb-popup-layer" -- apps/web/build-test` 의 나머지 하나) | 20 통과 | 같은 실행 |
| `theme-preview.test.ts` | 5 통과 | 같은 실행 |

**고치기 전 소스로 같은 케이스**(Z0 — 고친 파일 넷을 고치기 전 판으로 끼우고 갤러리를 다시 지어 `rv-pv-preview` · `rv-pv-themes`): 15 가운데 8 이
값으로 죽는다 — H1 `expected 'MAIN' to be 'IFRAME'` · M1 `{ byLink: false, byRow: false }` · M1b `expected -200 to be greater than or equal to 0` ·
L1 `got 2`(탭) · M2b `expected 863 to be less than 844` · M2c `expected 879 to be less than 844` · M2 `expected 863 to be less than 844` · L2
`expected true to be false`. 나머지 7 은 고치기 전에도 서는 성질(기록 · 다른 탭의 422 · 탭 꼴 · 판 옮김 · 던지는 뷰 · 좁은 창 · 폭 따라가기)이다.
리뷰가 적은 값(H1 `MAIN` · M2 · M2b 863)과 같다.

## 혼자 죽는 변조

스크래치 `mutate.py` — 변조마다 파일을 경로 전체 이름으로 첫 바꿈 전에 한 번 백업 · 맞은 수 1 확인 · 그 케이스 파일 하나만 · `filecmp` 로 복원(아홉 판
모두 «같음») · 갤러리를 건드린 판은 복원 뒤 `dist` 를 다시 지었다. node v24.21.0 · load 57 → 50.

| 변조 | 파일 | 죽은 케이스(실행) | 실패 값 |
| --- | --- | --- | --- |
| X1 iframe 요소 관찰(`observer?.observe(element)`)을 뗌 | `canvas-popups.tsx` | H1 하나(9) | `expected 'MAIN' to be 'IFRAME'` |
| X2 장이 바뀔 때 상자 `scrollTop = 0` 을 뗌 | `theme-preview.tsx` | M1 하나(9) | `{ byLink: false, byRow: false }` — 이음 · 장 이름 줄 둘 다 |
| X3 틀을 바깥 칸 안으로 내리는 갈래를 뗌 | `theme-preview.tsx` | M1b 하나(9) | `-200 ≥ 0` 이 거짓 |
| X4 예제 뿌리의 `onAuxClick` 을 뗌(갤러리 재빌드) | `theme-examples.tsx` | L1 하나(9) | 탭 수 2 |
| X5 409 나란히 보기의 답 표지를 뗌 | `token-editor.tsx` | M2 하나(9) | `863 < 844` 가 거짓 |
| X6 «고칠 칸이 있습니다» 의 답 표지를 뗌 | `token-editor.tsx` | M2b 하나(9) | `863 < 844` 가 거짓 |
| X7 알림 문장의 답 표지를 뗌 | `token-editor.tsx` | M2c 하나(9) | `879 < 844` 가 거짓 |
| X8 빈 무리 거름을 `>= 0` 으로 | `token-editor.tsx` | L2 하나(6 — `rv-pv-themes`) | `expected true to be false` |

X6 첫 판은 찾는 글이 포매터가 접은 꼴과 달라 «안 돎: 맞은 수 0» 이었다 — 찾는 글을 접힌 꼴로 고쳐 혼자 다시 돌렸다.
«다른 탭의 422» 는 390 의 문장 자리를 M2b 에 맡긴다(그 축의 주인 — 케이스 안 주석). 그 케이스를 혼자 죽이는 변조는 리뷰의 P2(사유 탭 `aria-label` 뗌)다 — 이번에 다시 돌리지 않았다(그 케이스의 단언은 1280 · 390 에서 그대로다).

## 게이트

node v24.21.0(판마다 상태 파일 첫 줄). 잠듦: `pmset -g log` 의 마지막 ` Sleep ` 은 09:35 — 이 작업(15:08 – 18:12)과 안 겹친다. 15 코어 · load 문턱 45.
끝에 이 워크트리의 vitest · vite · tsx · Chrome 0(남은 것은 codegraph MCP 뿐) · `gate-slots/pv` 지움.

### 1단계(고친 소스 `df1c5aa0` 의 작업 트리)

| 무엇 | 시각 · load | 결과 |
| --- | --- | --- |
| `pnpm typecheck` | 15:29 · 52 | rc 0 |
| `pnpm vitest run --project web --maxWorkers=25%` | 15:29 – 15:37 · 52 → 52 | rc 1 — 229 파일 · 3566 통과 · 6 실패 · 1 건너뜀. **실패 6 은 모두 `STACK_TRACE_ERROR`**(시간 한도) |
| ↳ 그 6 파일 혼자(`--maxWorkers=1`) | 15:37 · 60 → 71 | 80 케이스 중 78 통과 · `theme-chooser` 둘이 또 5s 한도 |
| ↳ `theme-chooser` 혼자 `--testTimeout=30000` | 15:38 · 74 → 69 | 17/17 — 그 케이스 417ms(앞 판 5436ms) |
| 실브라우저 `rv-pv-preview` | 15:15 – 15:19 | 9/9 |
| 실브라우저 `rv-pv-themes` · `rv-pv-canvas-popup` · `popup-layer` · `theme-preview` | 15:18 – 15:19 · 28 → 43 | 6 · 7 · 20 · 5 — 38/38 |
| `pnpm lint` · `oxfmt --check`(바꾼 파일) | 15:27 | rc 0 · 0 |

### 2단계(합친 판 `ad5bc186`)

| 무엇 | 시각 · load | 결과 · 실행 · 건너뜀 |
| --- | --- | --- |
| 합친 직후 `pnpm typecheck`(커밋 전) | 15:41 | rc 0 |
| `pnpm typecheck` | 15:56 – 15:57 · ≤ 45(앞 13 분은 load 103 → 기다림) | rc 0 |
| `pnpm build` | 15:57 – 15:58 | rc 0 |
| `pnpm test --maxWorkers=25%` | 16:33 – 16:41 · 38 → 33 | rc 1 — **안 잰 판(api)**: `[vitest-worker]: Timeout calling "onTaskUpdate"` 로 **api 0 파일**. unit 171 파일 · 2724 실행 / web 229 파일 · 3585 실행 · 실패 2(`lock-ops-identity` · `lock-zones` — 둘 다 `STACK_TRACE_ERROR`) · 건너뜀 1 |
| ↳ `pnpm vitest run --project api` | 17:29 – 17:43 · 44 → 27 | rc 0 — **181 파일 · 2758 통과 · 건너뜀 2** |
| ↳ schema 둘 혼자 | 17:46 · 31 | 27/27 |
| `pnpm test:build:serial` | 16:41 – 16:46 · 33 → 62 | rc 1 — **안 잰 판**: 같은 RPC 시간 초과로 16 파일 중 1(`theme-kit` `shots` 12/12)만 |
| ↳ 다시 | 17:43 – 17:46 · 27 → 31 | rc 1 — 또 `shots` 12/12 뒤 같은 RPC 시간 초과(load 30 판에서도 — RB-WS 보고와 같은 꼴) |
| ↳ `shots` 를 뺀 15 파일 | 17:51 – 18:07 · 19 → 21 | rc 1 — 111 통과 · 26 실패 · 7 건너뜀. 실패는 `screen-chromium` 14 · `screen-sandbox-review` 12(«한글 글꼴을 확인하지 못했습니다: N ms 안에 답이 없습니다» · 글꼴 · 준비 한도) · `export-bundle` 판 세우기(`page.goto` 30s) |
| ↳ 그 셋 혼자 | 18:07 – 18:11 · 20 → 63 → 35 | `screen-sandbox-review` 13/13 · `export-bundle` 6/6 · `screen-chromium` 32/34(첫 두 케이스가 10s 글꼴 한도 — 그 순간 load 63) |
| ↳ `screen-chromium` 다시 혼자 | 18:11 – 18:12 · 29 → 23 | **34/34** |
| ↳ 끊긴 판이 모으지 못한 둘(`packages/exporter/build-test/runtime-dist.test.ts` · `system-themes/admin/build-test/bundle-views.test.tsx`) | 18:13 · 18 → 35 | **22/22** |
| `pnpm test:browser` | 16:46 – 17:26 · 62 → 50 | rc 1 — 107 파일 · 691 통과 · 3 실패 · 11 건너뜀 + `tree-drag` 판 세우기(`page.goto` 30s). 실패: `file-attach-narrow`(`+0 ≠ 3`) · `multiselect` · `tree-drag-review` |
| ↳ 그 넷 혼자 | 17:46 – 17:49 · 31 → 40 | **61/61** |

`screen-*` · `export-bundle` · `file-attach-narrow` · `multiselect` · `tree-*` 은 두 트랙이 안 건드린 영역이다 — `git diff --stat 88c4505d HEAD -- apps/api
packages/exporter packages/renderer packages/theme-sdk packages/themes` 가 빈다. 합친 판에서 값으로 남은 실패는 0 이다.

**실행 파일 수와 등식:** unit 171 · web 229 · api 181(다시 돈 판) · build 18(`shots` 1 + 15 + 2 — 끊긴 판의 json 은 16 파일만 실어 둘을 놓쳤다;
git 글롭으로 센 18 과 견줘 찾았다) · 실브라우저 107(`export-bundle` 은 serial 몫이라 글롭 108 − 1). 위 «파일 수의 등식» 표의 합친 판과 같다.

## 남은 것

| 무게 | 무엇 | 왜 남나 |
| --- | --- | --- |
| 낮음 | L3 문턱 높이(726)에서 창을 끌 때 예제가 폭마다 두 번 그려진다(깜빡임 · 고리 아님) | 브리프가 이월로 정했다 — 손대지 않음 |
| 낮음 | M1b 판은 «틀 밑에 내용이 더 있는 화면» 을 바깥 칸의 아래 여백으로 흉내 낸다 | 설정 › 테마는 틀이 맨 끝이고 높이가 창에 묶여(390 에서 끝까지 굴려도 틀 위 끝 265) 틀 위 끝이 창 밖으로 나갈 길이 없다. 관리자 › 테마에서 틀 밑에 내용이 있는지는 재지 않았다 |
| 낮음 | 저장의 답을 굴리는 장치는 jsdom 케이스가 없다 | jsdom 은 좌표가 0 이라 굴릴 것이 없다 — 실브라우저 M2 · M2b · M2c 가 잰다 |

못 잰 것: 세로 모니터(1080×1920)의 H1 판은 다시 재지 않았다 — 케이스(1280×1500)와 같은 까닭(덮개가 앞 장 높이로 남음)을 같은 장치가 닫는다.

## 지침

1. **빈 것:** 공용 `common-w15.md` 는 «`pnpm test` 는 `--maxWorkers=25%`» 를 적지만 web 프로젝트 영역 게이트도 load 50 이상에서는 25% 로도 시간 초과가
   난다(이번 1단계: 6 파일 `STACK_TRACE_ERROR` · 혼자 다시 돌려 4 초록 · `theme-chooser` 는 한 일꾼에서도 5s 한도에 걸려 `--testTimeout=30000` 으로
   17 초록 — 같은 케이스 5436ms → 417ms). 이미 `.ruler/30-delegation.md` «변이마다 전량을 돌리게 하지 않는다» 문단이 «web 프로젝트 하나도 같다» 로
   적고 있어 새 문장은 필요 없다 — 다만 «혼자 다시 돌려도 load 가 높으면 같은 한도에 또 걸린다» 가 빠져 있다.
   **어디:** `.ruler/30-delegation.md` 같은 문단의 «… 시간 한도(`STACK_TRACE_ERROR`)로 죽는다» 뒤.
   **넣을 문장:** «혼자 다시 돌린 판도 load 가 높으면 기본 한도(5s)에 또 걸린다 — 그때는 `--testTimeout=30000` 으로 한 번 더 돌려 케이스 시간을
   적고(한도의 몇 분의 일인지), 그 수로 «부하» 와 «느려진 코드» 를 가른다.»
2. **빈 것:** 변조 스크립트가 찾는 글을 소스에서 옮겨 적을 때 포매터가 접은 꼴(JSX 속성이 줄을 넘으면 한 줄에 하나)을 놓쳐 «맞은 수 0» 이 났다.
   «맞은 수 1 확인» 은 이미 지침에 있다(`.ruler/30-delegation.md` «글자로 찾아 바꾸는 변조는 코드 자리를 고른다»). 새 문장 없음 — 그 장치가 제 몫을 했다.
3. **빈 것:** RPC 시간 초과로 끊긴 `test:build:serial` 판의 json 은 **모은 파일 전부를 싣지 않는다** — 18 파일 프로젝트에서 16 만 실었다(1 돎 · 15 «안 돎»).
   그 16 으로 «나머지» 목록을 지어 다시 돌리면 두 파일(`runtime-dist` · `bundle-views`)이 아무 경고 없이 빠진다.
   **어디:** `.ruler/30-delegation.md` 의 «`pnpm test:build:serial` 도 같은 시간 초과로 첫 파일 뒤에 멈춘다 …» 문장 뒤.
   **넣을 문장:** «끊긴 판에서 «남은 파일» 을 골라 다시 돌릴 때는 그 판의 json 이 아니라 프로젝트 include 글롭(`git ls-files` 에 같은 글롭)으로 목록을
   짓는다 — 끊긴 판의 json 은 모은 파일 일부만 싣는다(18 중 16 — `docs/superpowers/plans/2026-11-02-fx-pv-report.md` «게이트»).»
