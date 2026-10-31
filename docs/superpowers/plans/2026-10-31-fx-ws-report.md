# FX-WS(뼈대 트랙 리뷰 대응) 보고

브랜치 `feat/workspace-shell`, 시작 머리 `b9d581c8`. 브리프 `brief-fx-ws.md` · 리뷰 보고 `docs/superpowers/plans/2026-10-31-rv-ws-report.md`. Node v24.21.0(`mise env`).

## 고치기 전 판 — skip 을 뗀 빨강

`apps/web/build-test/rv-ws-workspace.test.ts` 의 skip 셋(R-4b · R-5a · R-6b)을 «고친 판» describe 로 옮겨 떼고, 고치기 전 소스(`b9d581c8`)에서 그 묶음만
돌렸다(`-t '고친 판'` · 실브라우저 · dev 번들 · load 48). 실행 4 · 실패 3 · 건너뜀 10(이 파일의 나머지).

| 키 | 케이스 | 실패 값 |
| --- | --- | --- |
| R-4b | «창 320 — 설정 탭 줄에서 End 로 고른 탭이 탭 줄 안에 보인다 · …» | `expected false to be true`(`inRow` — 첫 단언에서 죽어 누름 판은 안 돌았다) |
| R-5a | «검색 칸에 한글을 조합해 치면 …» | `expected { value: 'ㄱ고고ㄱ개객객', q: 'ㄱ고고ㄱ개객객' } to deeply equal { value: '고객', q: '고객' }` |
| R-6b | «창 390 — 다른 탭에서 다른 사람이 로그인하면 전환 통지가 새 사람의 이름을 말하고 …» | `expected { named: false, inView: true } to deeply equal { named: true, inView: true }` — 통지 «다른 사람으로 로그인됐습니다 — 이 탭은 이제 머리의 사람의 화면입니다» |

역할 · 정렬(측정 케이스 — 고치기 전에도 초록): 사람 빠르기(하나 고르고 판이 선 뒤 다음) `{"role":"owner","sort":"name","q":["owner","name"]}`. 한 틱 안에 셋
(`change` 를 같은 태스크에서 셋 — 사람이 못 내는 빠르기): 고른 직후 `["all","updated","all"]`(React 가 칸을 옛 주소 값으로 되돌림) · 300ms 뒤
`["owner","updated"]` · 주소 `?role=owner` — **정렬 «이름» 을 잃는다.** 같은 기전(주소에 매인 `value` + 전이)이 고르는 컨트롤에도 걸린다는 값이다.

## 바꾼 것

- **R-5a — 검색 칸**(`apps/web/src/routes/project-list.tsx` 의 `ProjectCards`). 검색 글은 칸의 `useState` 가 들고(첫 값은 주소), 칠 때마다
  주소에 `replace` 로 싣는다. **조합 중(`compositionstart` ~ `compositionend`)에는 주소를 안 고치고** 끝날 때 끝낸 글을 싣는다. 위치(`location.key`)가
  바뀌면 주소의 글을 칸에 다시 넣는다 — 뒤로 · 앞으로 가기 · 사이드바 «프로젝트»(질의 없는 `/`)가 칸을 따르게 한다. 거름 · 수는 칸의 글로 센다.
  `change` 는 칸의 글 위에서 짓는다(역할 · 정렬을 고를 때 주소의 늦은 글로 덮지 않게). 역할 · 정렬은 그대로 주소에서 읽는다. `BrowserRouter` 의 전이는 안 바꿨다.
- **R-6b — 전환 통지**(`apps/web/src/session/session-menu.tsx`). 상수 `SWITCHED_NOTICE` 를 함수 `switchedNotice(name)` 로 —
  «다른 사람으로 로그인됐습니다 — 이 탭은 이제 <이름>의 화면입니다»(이름이 비면 «그 사람»). `SessionNotices` 가 세션 사용자의 이름을 싣는다(에디터 하단 바도 같은 함수).
- **R-4b — 설정 가로 탭**(`apps/web/src/routes/settings.tsx` 의 `choose`). 키로 고를 때만 `focus()` 뒤 `scrollIntoView?.({ block: 'nearest', inline: 'nearest' })`.
  누름으로 고를 때는 안 부른다. jsdom 에는 그 함수가 없어 있을 때만 부른다(`settings-tabs.test.tsx` 16 그대로 초록).
- 케이스: `apps/web/build-test/rv-ws-workspace.test.ts` — skip 셋을 «고친 판» describe(넷: R-4b · R-5a · 역할 · 정렬 측정 · R-6b)로 옮겼다. R-4b 에 «반쯤 보이는 탭을
  누르면 세로 스크롤이 그대로» 판(창 320×360 · 좌표 누름 · 스크롤 이벤트의 최댓값), R-5a 에 조합 걸음의 주소 · 영문 사이 없이 · CPU 8배 열 글자 · 사이드바 «프로젝트» ·
  뒤로 가기를 더했다. R-6b 는 «이름이 사이드바에 보인다» 대신 «통지가 새 사람의 이름을 말하고 창 안에 선다» 로 단언한다(이름을 통지에 싣는 고침이라).
  jsdom `test/routes/project-list.test.tsx` «검색 칸 — 한글 조합 중에는 주소를 안 고치고 …» 를 더했다. `test/session/known-user.test.tsx` 는 `switchedNotice(BOB.name)` 로 견준다.
- 이월 주석: 남은 skip 둘(R-6a · R-4a — R-4a 는 «M 트랙이 칸을 달면 저절로 풀린다 — M 이 skip 을 뗀다») · `test/rv-ws-admin.test.tsx` 의 R-3a skip ·
  `test/rv-ws-role-guard.test.ts` 머리말(R-2a — skip 은 없고 대신 잡는 자다) 맨 위에 «이월(2026-10-31 사내 공용 운영)» 과 키.
- 정본 설계 §9 «셸 밖의 화면»(세션 전환 통지가 이름을 말함) · «프로젝트 목록»(검색 글은 칸이 든다) · «프로젝트 설정»(키로 고른 탭은 줄 안으로 구름).

## 결정과 이유

- **«REPLACE 로 온 위치는 칸이 안 따른다» 거름을 세웠다가 걷었다.** 늦게 닿은 제 쓰기가 더 친 칸을 되돌리는 판을 막으려던 것인데, 그 거름만 뗀 변조(M6)가
  Chrome 에서 두 번(부하 60 · CPU 8배 · 15ms 간격 열 글자) 다 살았다 — React 가 같은 전이 줄의 위치 갱신을 묶어 마지막 것만 커밋한다. 재현 안 되는 장치라
  걷고, 위치가 바뀔 때마다 주소의 글을 넣는다(제 쓰기가 닿은 위치는 칸과 같은 글이다). 그 판이 생기면 이 케이스의 «CPU 8배» 걸음이 잡는다.
- **역할 · 정렬은 안 고쳤다(브리프).** 같은 기전이 걸리는 것은 쟀다 — 한 틱 안에 다른 둘을 고르면 앞 것을 잃는다(위 표). 사람의 빠르기(고르고 판이 선 뒤 다음)로는
  안 잃는다. 고르는 컨트롤은 조합이 없고 한 번 고름이 한 사건이라 이월로도 세지 않았다.
- **R-6b 는 이름을 통지에 싣는 쪽**(리뷰의 방향 그대로). 상수를 함수로 바꿔 가져오는 자리(`known-user.test.tsx` 하나)는 타입 오류로 잡혔다. 문장 셈:
  `git grep -l -F 'SWITCHED_NOTICE' -- ':!docs'` 고치기 전 3 파일(소스 · `known-user.test.tsx` · 리뷰 build-test) → 뒤 0. 조각 «머리의 사람» · «이 탭은 이제» 도 소스 · 케이스 밖 0.
  «다른 사람으로 로그인됐습니다» 조각은 서버 문장(«… 이 탭이 아는 사용자와 …» — `apps/api/src/auth/plugin.ts`)을 단언하는 자리들이라 손대지 않았다.
- **셸 밖 화면의 주소에 매인 글 칸 셈**: `git grep -n 'useSearchParams' apps/web/src` 4 자리 — `project-list.tsx`(검색 칸 — 고침) · `settings.tsx`(`?section=` 탭 — 고르는 컨트롤) ·
  `admin-themes.tsx`(`?theme=&version=` 고른 테마 — 글 칸 아님) · `shell/view-state-address.ts`(`?state=` — 에디터 안 · 글 칸 아님). `location.search` · `new URLSearchParams(` 로도 셌다 —
  `drag/drag-debug.ts`(진단 질의) 하나 더. 주소를 `value=` 에 싣는 글 칸은 검색 칸 하나였다.
- 원래 있던 낮음(리뷰 «7» — 붐빌 때 설정 탭 키를 빨리 누르면 걸음을 잃음)은 고치지 않았다 — 같은 기전(고른 탭이 주소에서 옴)이지만 브리프 밖이다.

## 잰 값 — 고친 뒤(Chrome · dev 번들)

`rv-ws-workspace.test.ts` 전체 한 판(load 36 – 39): 실행 12 통과 · 건너뜀 2(이월 skip). 로그:

- 설정 탭 320 누름: 반쯤 보임 `true` · 세로 `{"top":0,"room":151,"most":0}` → `{"top":0,"room":0,"most":0}`(누른 뒤 «위험 구역» 판이 짧아 `room` 0 — 그래서 최댓값으로 잰다).
- 검색 칸: 조합 걸음의 주소 `[null,null,"고","고","고","고","고객"]` · CPU 8배 `{"value":"abcdefghij","q":"abcdefghij"}` · 사이드바 «프로젝트» 뒤 «» · 뒤로 가기 뒤 «report».
- 전환 통지 390: «다른 사람으로 로그인됐습니다 — 이 탭은 이제 밥의 화면입니다» · 창 안 `true` · top 114 · bottom 131 · 창 844.

**흔들림 하나 — R-6b 케이스의 첫 판.** 통지가 서자마자 재던 첫 짜임은 아홉 판 가운데 셋(기준 · M4 · M6 — 그 변조가 겨누지 않은 판)에서 `inView: false` 였다. 전환은 탭을
목록으로 옮겨, 옮기는 도중에는 통지가 잠깐 창 밖이다. 목록(`list` «프로젝트»)이 선 뒤 300ms 를 두고 재게 고쳤다 — 그 뒤 다섯 판 모두 `true`.

## 혼자 죽는 변조

변조마다 그 변조가 겨누는 케이스 파일만 돌렸다 — Chrome `rv-ws-workspace.test.ts -t '고친 판'`(실행 4) · jsdom 은 표의 파일. 백업은 경로 전체 이름 · 복원은 `cp` 뒤 `cmp`
(여덟 판 모두 «같음»). load 35 – 59. 스크립트 상태 파일 첫 줄 Node v24.21.0.

| 변조 | 자리 | Chrome(실행 · 실패) · 죽은 케이스 · 실패 값 | jsdom |
| --- | --- | --- | --- |
| M1 `scrollIntoView` 줄을 `void 0` | `routes/settings.tsx` `choose` | 4 · 1 — R-4b `expected false to be true`(`inRow`) | — |
| M2 누름에도 `scrollIntoView({ block: 'start' })` | 같은 곳(`if (!focus) return` 앞) | 4 · 1 — R-4b `expected 128 to be +0`(누른 동안 세로 최댓값) | — |
| M3 칸 `value={fromAddress.text}`(고치기 전 꼴) | `routes/project-list.tsx` | 4 · 1 — R-5a `expected { value: '', q: null } to deeply equal { value: '고객', q: '고객' }` | — |
| M4 조합 중에도 주소에 씀 | 같은 파일 `type` | 4 · 2 — R-5a `expected [ 'ㄱ', '고', '고ㄱ', '고개', '고객' ] to deeply equal [ null, null, '고', '고', '고' ]` · R-6b `inView: false`(위 흔들림 — 고치기 전 짜임) | 16 · 1 — «검색 칸 — 한글 조합 중 …» `{ value: '고', search: '?q=%EA%B3%A0' }` ≠ `{ …, search: '' }` |
| M5b 위치가 바뀌어도 칸에 안 넣음 | 같은 파일(`setSeenKey` 뒤 `setText`) | 4 · 1 — R-5a `expected { away: 'report', back: 'report' } to deeply equal { away: '', back: 'report' }` | 16 · 1 — 같은 케이스 `expected '고' to be ''` |
| M7 통지에 이름을 안 실음(`switchedNotice(null)`) | `session/session-menu.tsx` `SessionNotices` | 4 · 1 — R-6b `expected { named: false, inView: true }` …(통지 «… 그 사람의 화면입니다») | 6 · 1 — `known-user` «다른 사람이면 …» `'… 그 사람의 화면입니다'` ≠ `'… 밥의 화면입니다'` |
| M6 (걷은 거름) | — | 살았다 — 위 «결정» | 살았다 |

M5 첫 판(걷기 전 거름 꼴 `if (navigation !== 'REPLACE') setText(…)` 를 뗌)은 Chrome 에서 `expect.poll` 시간 초과(«Matcher did not succeed in time»)로 죽어 구분력에서
뺐다 — 케이스가 칸 값을 기다리지 않고 주소가 바뀐 것만 기다린 뒤 한 번 읽게 고쳤고, M5 · M5b 둘 다 값으로 죽었다. 역할 · 정렬 측정 케이스는 고치기 전에도 초록인 측정 판이다
(사람 빠르기의 값만 단언한다 — 그것을 깨는 소스 변조는 이 트랙이 짓지 않았다).

## 게이트

체인 스크립트 하나(`nohup nice -n 10 caffeinate -i`) · 머리 `90d60171` · Node v24.21.0(상태 파일 첫 줄) · 시작 load 54. 이 기계는 코어 15 — 실행 내내 다른 워크트리의
일로 load 35 – 124 였다(코어 × 3 = 45 를 대부분 넘음). 실브라우저 전량은 슬롯(그때 0 개) · load ≤ 45 를 기다려 02:09 에 띄웠다.

| 단계 | 결과 | 실행 · 실패 · 건너뜀 |
| --- | --- | --- |
| `pnpm typecheck` | 0 | — |
| `pnpm build` | 0 | — |
| `pnpm vitest run --project web --maxWorkers=25%` | 1 | 3475 · 30 · 1 — 29 는 `STACK_TRACE_ERROR`(시간 한도 · load 56 – 76), 값 하나 `edit/editor-keys.test.tsx` «캔버스 문서에 포커스가 있어도 …» |
| ↳ 실패 16 파일만 다시(`--maxWorkers=25%` · load 54 – 102) | 1 | 359 · 11 · 0 — `editor-keys` · `settings-tabs` 포함 7 파일 통과, 남은 11 중 10 이 `STACK_TRACE_ERROR` · 1 이 `logout-farewell` «이메일 라벨을 못 찾음»(기본 1s 기다림) |
| ↳ 가드 둘(`role-access` · `rv-ws-role-guard` — `project-list.tsx` 줄을 센다) `--maxWorkers=1 --testTimeout=120000` | 0 | 6 · 0 · 0 |
| ↳ 남은 7 파일 `--maxWorkers=1 --testTimeout=300000`(load 88 – 97) | 1 | 102 · 1 · 0 — `viewer-readonly-reach` «editor 로 훑으면 …» 이 제 한도 `300_000` 을 넘음(`STACK_TRACE_ERROR`) |
| `pnpm vitest run --project build apps/web/build-test/export-bundle.test.ts` | 0 | 6 · 0 · 0 |
| `pnpm test:browser`(02:09 – 03:01 · load 35 → 84) | 1 | 649 · 15 · 23(98 파일 · 건너뛴 파일 1) — 실패 8 파일: `tree-drag-review`(8) · `canvas-drop-review` · `canvas-drop` · `canvas-preview` · `editor-down-delay` · `multiselect` · `palette-review` · `state-tree`(각 1). 넷은 «5000ms 안에 안 섰다» · `locator.waitFor` 시간 초과, 나머지는 끌기 · 지연 판의 값 |
| `pnpm lint` | 0(바꾼 파일에 경고 0) | — |
| `oxfmt`(바꾼 파일 여덟) | 적용 | — |
| 숨은 글자(제어 · 방향 제어 · 폭 없는 글자 · U+2028/9 · 서로게이트) | 바꾼 파일 열 모두 0 | — |
| 잠듦 | `pmset -g log` 의 마지막 Sleep 10-31 20:28 — 이 트랙의 실행(11-01 01:13 – )보다 앞 | — |

실패한 판들은 이 트랙이 바꾼 것(목록 검색 칸 · 설정 탭의 키 고름 · 전환 통지 문장)과 닿지 않는 에디터 끌기 · 지연 · 훑기 판이다 — 아래 «실패 파일 다시» 가 부하가
내려간 판의 값이다.

### 실패 파일 다시 — 부하가 내려간 판

- 실브라우저 실패 8 파일을 한 일꾼(`pnpm vitest run -c vitest.browser.config.ts --maxWorkers=1 <8 파일>`)으로 load ≤ 45 · 슬롯 0 을 기다려 03:39 – 03:51 에 돌렸다
  (load 36 → 58): **8 파일 · 122 통과 · 실패 0.**
- `viewer-readonly-reach.test.tsx` 혼자(web · 한 일꾼 · load 50 – 55): **1 통과.**
- 그래서 게이트의 빨강은 모두 부하의 몫으로 본다 — 같은 파일이 이 트랙의 소스 그대로 다시 돌아 초록이다. 고치기 전 사본(`b9d581c8`)과 견주지는 않았다.

## 남은 것

- 이월(브리프): **R-6a**(높음 · 원래 있던 길 — 셸 밖 로그아웃이 보낸 편집을 안 기다림) · **R-3a** · **R-2a** · **R-4a**(M 트랙이 칸을 달면 저절로 풀린다 — M 이 skip 을 뗀다).
  skip · 머리말에 «이월(2026-10-31 사내 공용 운영)» 과 키를 적었다.
- 역할 · 정렬을 한 틱 안에 다른 둘 고르면 앞 것을 잃는다(위 «결정» — 사람의 빠르기로는 안 선다). 고친다면 둘도 칸 상태로 들거나 `change` 가 마지막으로 쓴 질의 위에서 짓는다.
- 리뷰 «7» 의 설정 탭 빠른 키 걸음 잃음(원래 있던 낮음) · «8» 의 `members-section` 흔들림 — 그대로 이월.
- 운영 번들(`EDITOR_STACK_BUNDLE=build`)로는 안 쟀다 — 바꾼 것은 이펙트 · 마운트 순서가 아니라 렌더 안의 상태라 dev 판만 돌렸다. Firefox · Safari 의 IME 차례(Safari 는
  `compositionend` 가 마지막 `input` 보다 먼저 온다 — 그때도 `compositionend` 와 다음 `onChange` 가 함께 끝낸 글을 싣는 꼴이지만 재지 않았다)도 안 쟀다.

## 지침

1. **무엇이 비었나** — 리뷰 보고 «지침 1»(주소 질의를 값으로 쓰는 입력 칸은 실브라우저 한글 조합으로 잰다)에 더할 것: 칸이 제 상태를 들고 주소에 `replace` 로 싣는 꼴에서
   «늦게 닿은 제 쓰기가 칸을 되돌린다» 는 판은 안 선다 — React 가 같은 전이 줄의 위치 갱신을 묶는다(CPU 8배 · 15ms 간격에도). 그 판을 막는 거름은 재현이 안 되는 장치다.
   **어디** — `.ruler/30-delegation.md`(생성물 `AGENTS.md` «워커에게 맡길 때 — wirebound») 의 jsdom · 실브라우저 문단 끝(리뷰 «지침 1» 의 문장 바로 뒤).
   **넣을 문장** — «**주소에 싣는 글 칸은 글을 컴포넌트 상태로 들고, 위치가 바뀔 때마다 주소의 글을 칸에 넣는다** — 제 `replace` 가 늦게 닿아 칸을 되돌리는 판은 Chrome 에서
   안 섰다(같은 전이 줄의 위치 갱신이 묶인다 · CPU 8배). 조합 중(`compositionstart` ~ `compositionend`)에는 주소를 안 고친다(`apps/web/src/routes/project-list.tsx` 의
   `ProjectCards` · `build-test/rv-ws-workspace.test.ts` «검색 칸에 한글을 …»).»
2. **무엇이 비었나** — 누른 뒤 판이 짧아지면 스크롤 상자의 `scrollTop` 이 0 으로 잘려, 누름 사이의 «튐» 이 끝 값에 안 남는다(변조 M2 를 끝 값으로 재면 산다). **어디** —
   `.ruler/30-delegation.md` 의 «스크롤 장치가 «한 번» 굴리는지는 `scroll` 이벤트가 아니라 …» 문장 뒤. **넣을 문장** — «**누름 · 키가 판을 바꾸는 판의 «튐» 은 끝 값이
   아니라 그 사이의 최댓값으로 잰다** — 바뀐 판이 짧으면 `scrollTop` 이 잘려 끝 값은 늘 그대로다. 스크롤 상자에 `scroll` 리스너를 걸고 최댓값을 모은다
   (`apps/web/build-test/rv-ws-workspace.test.ts` 의 `verticalScroll`). 판에 구를 자리가 있는지(`scrollHeight − clientHeight > 0`)를 카나리아로 둔다 — 320×700 의 설정
   «일반» 은 구를 자리가 0 이었다.»
3. **무엇이 비었나** — 브리프의 «전량 슬롯 규칙은 `pnpm test:browser` 에 적용» 대로 web 프로젝트(`--project web --maxWorkers=25%`)는 load 를 안 기다리고 띄웠는데, load 56 – 76
   에서 3475 가운데 29 가 시간 한도로 죽었다(같은 파일들이 한 일꾼 · 긴 한도로 초록). **어디** — `.ruler/30-delegation.md` 의 «띄우기 전과 끝난 뒤 `uptime` 의 load 를
   상태 파일에 적는다 — 코어 수의 세 배를 넘으면 띄우지 않고 기다린다» 문장. **넣을 문장** — 그 문장 끝에 «web 프로젝트 하나(`pnpm vitest run --project web`)도 같다 —
   영역 게이트라 슬롯에는 안 들지만 load 를 기다린다(load 56 – 76 에서 29 케이스가 `STACK_TRACE_ERROR` 였다 — `docs/superpowers/plans/2026-10-31-fx-ws-report.md` 「게이트」).»
