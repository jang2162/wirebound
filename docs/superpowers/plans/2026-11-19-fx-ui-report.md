# FX-UI — 화면 다듬기 리뷰 대응(넷) 보고

브랜치 `feat/ui-polish` · 시작 머리 `8104fc85` · 트랙 키 `fx-ui`. 브리프 `.worktrees/.coord/brief-fx-ui.md` · 리뷰 보고 `docs/superpowers/plans/2026-11-19-rv-ui-report.md` ·
구현 보고 `docs/superpowers/plans/2026-11-18-ui-report.md`. node `v24.21.0` · 자기 DB 포트 5534.

작업 공간: `orca terminal list` 는 이 워크트리의 터미널을 하나도 안 냈다(자기 세션도 안 보임 — 목록이 이 런타임을 못 본 것). 그래서 시작 · 끝의
`git ls-files -s apps | md5` 와 `git status --short` 를 견준다 — 시작 `ac5b223f46cf5400f97edb77f6751b9a` · `?? .build/` 만.

## 1. 4b — 코멘트 무리 이름의 내부 id

**바꾼 것.** `apps/web/src/panels/comment-panel.tsx` — 무리 이름(머리 글 · 가리킬 수 있는 무리의 `aria-label` · 편집 모드 머리 단추의 이름)을 «달 곳» 과 같은
`nodeRowLabel`(구조 트리 줄 이름 `타입 (별칭) 요약`)로 짓는다(`rowLabelsOf` — 옛 `aliasesOf` 를 갈아 낌). 사라진 노드는 «사라진 노드», 문서를 못 읽은 무리는
«이름을 모르는 노드»(아래 결정). 내부 id 는 어느 갈래에도 없다.

**결정.** 문서를 못 읽은 무리(`present: 'unknown'`)는 그 노드가 무엇인지 모른다 — 옛 판은 id 를 말했다. «사라진 노드» 라고 단언하지 않는 규칙
(`Group.present` 머리말)을 지켜 «이름을 모르는 노드» 로 두었다. 같은 화면에 «문서를 읽지 못해 번호를 보일 수 없습니다» 가 함께 서서 까닭을 말한다. 그 판의
무리 둘은 같은 이름이다(코멘트가 달린 차례로 선다).

**기대값을 바꾼 케이스**(무리 이름으로 찾는 자리 — `git grep -n -P "['\"\`/][0-9–] n_" -- apps/web/test apps/web/build-test` 에 더해 `comment-group` · `사라진 노드` 셈):

| 파일 | 자리 | 옛 → 새 |
| --- | --- | --- |
| `apps/web/test/panels/comment-panel.test.tsx` | 번호 차례 · 한 무리 · 번호 없음/사라짐 · 고른 표시 · 재번호(D4) · 문서 못 읽음 | `'1 n_c'` → `'1 Text 다'` 등 · `'– 사라진 노드 (n_없음)'` → `'– 사라진 노드'` · `'– n_a'` → `'– 이름을 모르는 노드'` |
| `apps/web/test/panels/alias-naming.test.tsx` | 무리 머리 | `'2 회원 목록 (n_list)'` · `'– n_plain'` → `'2 DataGrid (회원 목록)'` · `'– Text 안내'` |
| `apps/web/test/panels/comment-focus.test.tsx` | 머리 단추 이름 둘 | `'2 n_b'` → `'2 Text 관리'` |

실브라우저(`apps/web/build-test`)는 무리를 `data-comment-node` 로 찾고 글은 «사라진 노드» 포함만 본다(`comment-focus.test.ts` 728줄) — 고칠 자리 0.

**새 케이스** `comment-panel.test.tsx` «무리의 이름은 «달 곳» 과 같은 이름이다 — 머리 글도 접근 이름도 내부 id 를 말하지 않는다»: 무리 `aria-label` = `'1 Text 가'` ·
같은 노드의 «달 곳» = `'달 곳: 1 Text 가'` · 머리 글 · 접근 이름에 `n_` 없음. (jsdom 값이다 — 접근 이름은 속성 글이라 실브라우저와 같은 글이다.)

**고치기 전 · 뒤**(jsdom, 세 파일): 고치기 전 9 실패(바꾼 기대값 8 + 새 케이스) → 고친 뒤 52 통과 · `apps/web/test/panels` + `apps/web/test/comments` 62 파일 955 통과.

| 변조 | 돌린 것 | 결과 |
| --- | --- | --- |
| M1 무리 이름을 옛 식(`present === 'no' ? 사라진 노드 (id) : id`)으로 되돌림 | 새 케이스 하나(`-t`) | 1 실패 · 통과 0 — `expected '1 n_a' to be '1 Text 가'`(접근 이름 값) |

## 2. 1b — 바닥(25%) 아래의 «축소»

**바꾼 것.** `apps/web/src/routes/editor.tsx` 의 `useZoomCommands` `zoomOut` — 바닥 아래(`zoom <= ZOOM_OUT_FLOOR`)에서 돌아가지 않고 `setZoom(zoom)` 을 부른다.
배율은 그대로이고 폭 맞춤(`zoomFit`)이 꺼진다(방향 (가) — 누름은 «이 배율로 두라»).

**입구를 센 것.** `zoomOut` 을 부르는 자리는 머리 줌 묶음의 «축소» 단추(`CanvasTools` · `commands.zoomOut`)와 접힌 머리 `…` 의 «축소» 항목(`menuItems` 의
`zoom-out` · `zoomCommands.zoomOut`) 둘이고 같은 함수다. 배율 단축키는 없다(리뷰 «1» 의 셈 그대로 — `edit/editor-shortcuts.ts` 에 배율 명령 0). 그래서 고칠 자리는
함수 하나다.

**정본.** 754줄 «축소는 25% 에서 멈춘다 — 그 아래는 «화면 맞춤»만 간다» · «축소 · 확대 · «화면 맞춤» 을 누르면 그 페이지에서 그 배율로 남는다» 가 이 판에서도
참이 된다(배율은 안 내려가고, 누른 뒤 창을 바꿔도 그대로). **정본은 안 고쳤다** — 그래서 게이트는 영역 게이트다.

**케이스** `apps/web/build-test/ui-zoom-fit.test.ts` «25% 아래로 맞춘 판에서 «축소» 를 누르면 그 배율로 남는다 — 창을 줄이고 늘려도 그대로다»(실브라우저): 창 760 ·
프리셋 1280 → 맞춘 배율 < 0.25 · `…` 배율 줄에 «폭 맞춤» → `…` › «축소» → 배율 그대로 · 배율 줄에서 «폭 맞춤» 이 걷힘 → 창 700 · 820 에도 그 배율. 접힌 머리에는
배율 글(`wb-shell-zoom-value`)이 없어 표지는 `…` 의 배율 줄로 읽는다(첫 판이 그것을 몰라 판 카나리아로 죽었다 — 결함 아님).

| 판 | 맞춘 배율 | 누른 뒤 | 창 700 | 창 820 | 결과 |
| --- | --- | --- | --- | --- | --- |
| 고치기 전 | 0.153 | 0.153 | **0.106** | **0.2** | 빨강(값 단언) |
| 고친 뒤 | 0.153 | 0.153 | 0.153 | 0.153 | 초록 · 파일 4 통과 |
| 변조 M2 — 바닥 아래 `return` 을 되살림(고침만 뗌) | 0.153 | 0.153 | 0.106 | 0.2 | 새 케이스 1 실패 · 통과 0 — `toEqual` 값(창 700 · 820 배율 · 배율 줄 «폭 맞춤») |

곁: jsdom `apps/web/test/routes/editor-shell.test.tsx` «축소는 25% 에서 멈추고 …» 의 머리말 «축소가 아무것도 안 하고» 를 «배율을 안 바꾸고(폭 맞춤만 끈다)» 로
고쳤다(단언은 배율만 본다 — 그대로 초록). 실브라우저 `editor-narrow-canvas` «줌 하한» 도 배율만 본다 — 실브라우저 전량에서 잰다.

## 3. 2b — 보인 채 제출이 실패하면 보인 채 남음

**바꾼 것.** `apps/web/src/account/password-input.tsx` — 칸이 든 폼(`input.form`)의 `submit` 을 직접 들어 `flushSync` 로 다시 가린다. 세 화면(로그인 · 가입 ·
재설정)이 같은 `PasswordInput` 을 쓰므로(`routes/login.tsx` · `account/new-password-fields.tsx` — 초대 · 재설정) 한 자리에서 셋이 닫힌다. 폼의 리스너는 React 의
`onSubmit`(뿌리에서 받음)보다 먼저 돌아, 제출을 받는 쪽이 `type` password 인 칸을 본다.

**결정.** 리뷰가 든 둘 가운데 «칸의 `form` 에 `submit` 리스너» 를 골랐다 — «부모가 `reset` 키를 넘김» 은 세 화면의 제출 함수를 다 고쳐야 하고 새 화면이 빠뜨릴 수 있다.

**케이스** `apps/web/build-test/ui-login.test.ts`(실브라우저):

- «보인 채 로그인이 실패하면 칸이 다시 가려진다 — 오류 뒤 `type` password»: 이메일 · «abcdXef» → «비밀번호 보기» → Enter → `alert` 뒤 `type` · 토글 이름 · 값.
- «보인 채 가입이 실패하면 두 칸이 다 다시 가려진다(초대 화면)»: `makeAdmin` 뒤 `POST /admin/invites` · `/invite/<token>` · 두 칸에 치고 둘 다 보기 → 이메일 빈 채
  Enter(화면이 «이메일을 입력하세요» 로 거절 — 제출은 제출이다) → 두 칸 `type`.

| 판 | 로그인 실패 뒤 `type` · 토글 | 초대 실패 뒤 두 칸 | 결과 |
| --- | --- | --- | --- |
| 고치기 전 | text · «비밀번호 숨기기» | text · text | 두 케이스 빨강(값 단언) |
| 고친 뒤 | password · «비밀번호 보기» · 값 `abcdXef` 그대로 | password · password | 파일 4 통과 |
| 변조 M3 — `form.addEventListener('submit', hide)` 를 뗌 | text · «비밀번호 숨기기» | text · text | 두 케이스 실패 · 통과 0 — `toEqual` 의 `type` 값 |

M3 는 두 케이스를 함께 죽인다 — 둘은 같은 장치의 다른 입구(로그인 칸 · 새 비밀번호 두 칸)라 혼자 죽는 변조가 따로 없다. 두 화면이 같은 부품을 쓰는지를 재는
몫이라 남겼다. jsdom `apps/web/test/routes` 265 통과(로그인 · 초대 · 재설정 화면의 칸 구조 · 이름 · `type` — 고친 뒤).

**곁의 관찰 — 실패 뒤 커서 `[0,0]`.** 재현되지 않았다: 같은 걸음(`fill` → 토글 → Enter)으로 누르기 전 `[7,7]` · 실패 뒤 `[7,7]`(고치기 전 · 고친 뒤 둘 다 —
고친 판은 `type` 이 text → password 로 바뀌어도 고른 자리가 그대로다). 재현이 안 되어 main 과 견주지 않았고 고친 것도 없다. 리뷰 판이 무엇을 달리했는지(재는
때 · 포커스)는 리뷰 보고의 탐침 원문에 커서를 읽은 줄이 없어 못 가른다.

## 4. 5b — 카드 호버 화살표가 «설정» 밑에 깔림

**바꾼 것.** `apps/web/src/shell.css` — 화살표(`.wb-shell-home-name::before`)를 카드에 붙인 절대 자리(오른쪽 16 · 아래 20 — 보조 단추 줄 안)에서 **이름 바로
뒤**(머리 줄 안)로 옮겼다: 이름 링크를 `inline-flex`(가로 · 글줄 맞춤 · 틈 6px · `min-width: 0`)로 두고 `::before` 에 `order: 1` · `flex: none`. `::after` 는
늘인 링크가 쓰므로 `::before` 를 `order` 로 글 뒤에 세운다. 안 보이는 동안(`opacity: 0`)에도 자리를 지켜 호버로 이름이 다시 접히지 않는다. 머리말을 고쳤고
구현 보고(`2026-11-18-ui-report.md` «5» 의 «바꾼 것»)의 «오른쪽 아래 «→»» 를 맞췄다.

**결정.** 브리프 기본(머리 줄 오른쪽)의 자리는 역할 표지가 쓴다 — 표지 폭(owner · editor · viewer)이 갈려 그 곁에 절대 자리로 세울 수 없고, 셸 CSS 는 결합자를
막아(`.wb-shell-home-card:hover …` 불가) 형제 요소로 둘 수도 없다. 그래서 같은 머리 줄 안의 «이름 곁» 으로 골랐다. 끊을 자리 없는 긴 이름은 `overflow-wrap:
anywhere` 가 최소 폭에도 들어 글 조각이 줄어 접힌다(«눌리는 크기» 의 긴 이름 카드 · 창 390 에서 넘침 0 · 창 밖 글자 0 그대로).

**케이스** `apps/web/build-test/project-cards.test.ts` «호버하면 «→» 가 보이는 자리에 선다 — 가운데의 맨 위 요소가 이름 링크다»(실브라우저): 창 1280 · 390 · 카드
«고객 포털»(설명 있음) · «Report» — 카드 왼쪽 가운데에 포인터 → `::before` 의 `opacity` 1 · 크기 > 0 · 상자가 카드 안 · 그 가운데의 `elementFromPoint` 가 이름
링크. 화살표 상자는 놓인 꼴마다 셈한다(절대 자리면 카드 상자와 `right` · `bottom`, 흐름이면 링크 오른끝 · 위끝) — 고치기 전 · 뒤를 같은 자로 잰다.

| 판 | 화살표 가운데의 맨 위 요소 | 결과 |
| --- | --- | --- |
| 고치기 전 | `a.wb-shell-home-settings`(«고객 포털»@1280 에서 첫 단언) | 빨강(값 단언) |
| 고친 뒤 | 넷 다 `a.wb-shell-home-name`(1280: (350,336) · (676,157) · 390: (102,729) · (95,402)) | 초록 · 파일 5 통과 — «눌리는 크기» 도 그대로(열기 점 23/23 · 넘침 0 · 글자 33 · 30) |
| 변조 M4 — `::before` 에 옛 `position: absolute; right: 16px; bottom: 20px` 를 되살림 | `a.wb-shell-home-settings` | 새 케이스 1 실패 · 통과 0 |

jsdom `shell-css` · `shell-css-palette` · `routes/project-list` 3 파일 97 통과(셸 CSS 규칙 — 결합자 없음).

## 게이트

정본을 안 고쳐 영역 게이트다(web 단위 전량 + `pnpm test:browser` 전량 + typecheck · lint · fmt). node `v24.21.0`(상태 파일 첫 줄). 머리 `12e797c4`.
사슬은 스크립트 하나 · `nohup nice -n 10 caffeinate -i` · 단계마다 `rc=$?`.

| 단계 | 시각 | 결과 |
| --- | --- | --- |
| `pnpm typecheck` | 12:42 – 12:43 | rc 0 |
| `pnpm lint` | 12:43 | rc 0 |
| `pnpm fmt` | 12:43 | rc 0 · 바뀐 파일 0 |
| `pnpm vitest run --project web --maxWorkers=25%` | 12:43 – 12:51 (load 시작 27.7 · 끝 47.7) | 250 파일 · 3774 케이스 — 통과 3771 · 실패 2 · 건너뜀 1. 실패 둘은 `STACK_TRACE_ERROR`(시간 한도): `api-consumers.test.ts` «부르는 자리가 표와 같다» · `role-access.test.ts` «.role을 읽는 코드는 …». load 45.9 에서 둘만 `--testTimeout=60000` 으로 다시 돌려 9 통과 — 케이스 시간 3.9s · 3.8s(기본 한도 5s 의 4/5 — 부하). 이 트랙이 안 건드린 소스 셈 케이스다 |
| `pnpm test:browser` 첫 판 | 12:59 – 13:29 (load 38.3 → 24.2) | 137 파일 · 859 케이스 — 통과 849 · 실패 8 · 건너뜀 2. **버린 판** — `pmset -g log` 에 13:18:27 `Clamshell Sleep` → 13:19:23 Wake 가 실행 안에 있다. 실패 여덟은 전부 내보낸 PPTX 의 화면 그림 수가 0 인 단언(`file-attach-narrow` · `form-table-mid-width` · `form-table` · `placeholder-images` · `theme-system-review` · `tree-old-theme` ×3)이다 |
| `pnpm test:browser` 둘째 판 | 13:30 – 13:53 (load 17.4 → 29.1) | 137 파일 · 859 케이스 — 통과 849 · **실패 8** · 건너뜀 2. 잠듦 없음(`pmset -g log` 의 `Sleep` 줄은 13:18 하나뿐 — 이 판 앞). 실패는 첫 판과 같은 여덟이다 |

**여덟의 까닭 — 이 트랙과 무관한 환경.** 실패 값(`theme-system-review` 의 `screenFailures`)이 «브라우저를 띄우지 못했습니다: browserType.launch: Executable doesn't exist at
`~/Library/Caches/ms-playwright/chromium_headless_shell-1234/…`» 다 — api 의 화면 캡처(`apps/api/src/services/screen-render-chromium.ts`)가 띄우는 헤드리스 셸이
없다. 그 캐시 디렉터리는 13:04 에 바뀌어(첫 판 실행 중) 지금 `b` 하나만 들었다 — 이 워크트리 밖의 무엇이 비웠다. 이 트랙은 `apps/api` · `packages` 를 안
건드렸다(`git diff --stat 8104fc85 HEAD -- apps/api packages` 빈 줄). 공유 캐시라 다시 깔지 않았다 — 깐 뒤 그 여섯 파일(`file-attach-narrow` ·
`form-table-mid-width` · `form-table` · `placeholder-images` · `theme-system-review` · `tree-old-theme`)을 다시 돌려야 한다(«남은 것» 1).

이 트랙이 바꾼 · 더한 실브라우저 파일은 둘째 판에서 전부 초록이다 — `ui-zoom-fit` 4 · `ui-login` 4 · `project-cards` 5 · `comment-focus` 26 ·
`editor-narrow-canvas` 8(«줌 하한» 포함).

작업 공간: 끝의 `git ls-files -s apps | md5` 는 이 트랙의 커밋으로 바뀌었고(시작 값과 다름 — 내 커밋 다섯), 커밋 사이 `git status --short` 는 내가 쓴 파일만
보였다. 끝에 이 워크트리 경로의 vitest · vite · chrome 프로세스 0.

## 남은 것

1. **PPTX 화면 그림 여덟** — Playwright 의 `chromium_headless_shell-1234` 를 다시 깐 뒤(`pnpm exec playwright install chromium-headless-shell` 류 — 코디네이터 · 사람의 몫)
   위 여섯 파일을 `pnpm vitest run -c vitest.browser.config.ts <경로>` 로 다시 돈다.
2. **3c**(리뷰 «남은 것» 5) — 구역 선택에서 ↓ 가 페이지 뿌리로 가는 `selectNext`. 이 트랙 몫이 아니라 안 건드렸다.
3. **2b 곁의 커서 `[0,0]`** — 재현 안 됨(위 «3»). 리뷰 판의 재는 법을 알면 다시 잰다.
4. **`change-kind-code` 경주**(구현 보고 «남은 것» 6) — 이 트랙과 무관 · 그대로.
5. 정본 «설계서 화면 구조» 843줄 «묶음 머리(번호 · 이름)» 는 이름이 무엇인지 안 적는다 — 279줄(«코멘트의 노드 표시» 가 `nodeDisplayName` 줄 이름을 거친다)이 이제 참이라
   고치지 않았다. 적으려면 «이름은 «달 곳» 과 같은 구조 트리 줄 이름 — 사라진 노드는 «사라진 노드», 문서를 못 읽었으면 «이름을 모르는 노드»» 를 넣는다(정본을 고치는 트랙이라 전량 넷).

## 지침

1. **`.ruler/20-verification.md` 「「통과」를 보기 전에 몇 개가 실행됐는지 확인한다 — 덧붙임」 끝에** 넣을 문장: «**실브라우저 전량의 PPTX 판이 한꺼번에 «화면 그림 0» 으로
   죽으면 먼저 Playwright 캐시를 본다** — api 의 화면 캡처는 `~/Library/Caches/ms-playwright/chromium_headless_shell-<판>` 을 띄우고, 그 캐시는 이 기계의 모든
   저장소가 나눠 써 다른 일이 비울 수 있다. 실패 값은 단언의 수(0)가 아니라 `screenFailures` 의 «Executable doesn't exist» 에 있다 — 그 판은 결함이 아니라 안 잰 것이다
   (`docs/superpowers/plans/2026-11-19-fx-ui-report.md` «게이트»).»
