# FX-CD — 프로젝트 카드 리뷰 대응 보고

대상: 브랜치 `feat/project-cards`, 리뷰 보고 `docs/superpowers/plans/2026-11-02-rv-cd-report.md` 의 M1 · L1. 브리프 `brief-fx-cd.md`.
node `v24.21.0` · 워크트리 Postgres 5514(`pnpm db port postgres 5432` → `0.0.0.0:5514`). 같은 워크트리에 붙은 다른 터미널 없음(`orca terminal list`).

## 바꾼 것

- `apps/web/src/projects/project-form.tsx` — 제출 순간 포커스가 있던 폼 안의 요소(Enter 를 친 칸 · 누른 «만들기», 폼 밖이면 첫 칸)를 적어 두고,
  `busy` 가 참 → 거짓으로 풀리는 커밋에서(레이아웃 이펙트) **포커스가 아직 빠진 채(`body` · `null`)면** 그 요소로 돌린다. 요청 중 `disabled` 잠금은 그대로다.
- `apps/web/src/projects/use-project-commands.tsx` — `closeForm` 이 `setFailure(null)` 로 조작 실패를 함께 걷는다. 조회 실패(`state.failure`)는 안 건드린다.
- `apps/web/build-test/rv-cd-cards.test.ts` — 두 케이스의 `.fails` 를 떼고 머리말을 지금 참인 글로 고쳤다.
- `apps/web/test/routes/project-crud.test.tsx` — jsdom 케이스 넷(아래 표).

## 결정과 이유

1. **M1 은 «실패 뒤 보냈던 칸으로 포커스를 돌린다» 를 골랐다 — `readOnly` 로 바꾸지 않았다.** `readOnly` 는 단추에 없어 «만들기» · «취소» 는 여전히
   `disabled` 라 마우스로 보낸 판(포커스가 «만들기» 에 섬)은 그대로 `body` 로 빠지고, 읽기 전용 칸에서도 Enter 가 폼을 제출해 «잠긴 칸이 보내는 길» 이
   하나 더 선다(훅의 `inFlight` 가 막긴 하지만 화면 잠금의 뜻이 흐려진다). 돌려주기는 두 판을 다 덮고 잠금 성질(두 번 보내기 막기)을 손대지 않는다.
2. **포커스가 빠진 채일 때만 돌린다.** 요청 중에 사람이 다른 곳(사이드바 링크 등)을 눌렀으면 실패 뒤에 그 자리를 뺏지 않는다 — jsdom 케이스가 잠근다.
3. **레이아웃 이펙트로 돌린다.** 칸이 풀리는 커밋과 같은 태스크에서 포커스를 옮겨 «풀렸는데 포커스는 `body`» 인 프레임이 없다 — 실브라우저 케이스가
   «칸이 풀릴 때까지 기다린 뒤 포커스를 읽는» 꼴이라 일반 이펙트면 경주가 생긴다.
4. **L1 — `closeForm` 이 걷는 실패는 폼의 것뿐이다.** 훅의 `failure` 를 내는 조작은 `run` 하나이고 `run` 을 부르는 자리는 `submitForm` 하나다
   (`git grep -n "run(" -- apps/web/src/projects/use-project-commands.tsx` → 정의 · 호출 각 1). 폼이 아닌 조작의 실패 알림은 지금 이 화면에 없다 —
   남은 다른 알림은 목록 조회 실패(`state.failure`)이고, 그것이 열고 닫기에 안 걷히는지를 jsdom 케이스로 잠갔다.

## 잰 값

### 실브라우저(dev 번들) — `rv-cd-cards.test.ts` 의 실패 갈래 판(3 갈래 × 창 1280×900 · 390×844 · 390×480 = 9 판)

| 판 | 실패 뒤 포커스 | «취소» 뒤 남은 알림 | 친 글 | 끊김 판 POST 끊은 수 |
| --- | --- | --- | --- | --- |
| 고치기 전(B0 — 고침 둘을 뗀 소스) | 9 판 모두 `body` | 9 판 모두 그 판의 실패 문장 1 개 | 9 판 남음 | 각 1 |
| 고친 판 | 9 판 모두 `input:슬러그` | 9 판 모두 0 | 9 판 남음 | 각 1 |

B0 판: 8 실행 · 6 통과 · 2 실패 — 둘 다 값으로 죽었다(`expected { '409@1280x900': 'body', … } to deeply equal { … 'input:슬러그' … }` ·
`expected { …(9) } to deeply equal { '409@1280x900': [], … }`). 시간 초과 아님.

### jsdom 값과 실브라우저 값의 갈림

jsdom 은 포커스가 선 칸에 `disabled` 를 걸어도 포커스를 그 칸에 그대로 두고, 잠긴 칸의 `blur()` 도 받지 않는다(첫 판에서 잠긴 뒤 `blur()` 를 불러도
`activeElement` 가 칸이었다). 그래서 jsdom 케이스는 요청이 나가는 순간(칸이 잠기기 전) 칸을 `blur` 해 Chrome 의 떨굼을 흉내 내고, 잠긴 동안
`activeElement === body` 를 카나리아로 단언한다. 흉내가 맞는지는 위 실브라우저 판(고치기 전 `body`)이 대조한다.

## 혼자 죽는 변조

스크래치 `mut.py` — 백업 이름은 경로 전체(`apps__web__src__projects__…`) · 첫 바꿈 전에 파일마다 한 번 · `filecmp` 바이트 비교 복원 · 맞은 수 1 확인.
jsdom 변조는 `apps/web/test/routes/project-crud.test.tsx` 하나만(21 케이스) 돌렸다. 끝의 `git status` 에 뜻한 네 파일과 보고뿐.

| 변조 | 무엇 | 죽은 케이스(그것만) | 실패 값 |
| --- | --- | --- | --- |
| J1 | 폼의 포커스 돌리기 `target.focus()` → `void target` | jsdom «실패한 뒤 포커스가 보냈던 칸으로 돌아온다» (20 통과 · 1 실패) | `expected <body> to be <input>` |
| J2 | «빠진 채일 때만» 조건 → `true` | jsdom «요청 중에 다른 곳으로 옮긴 포커스는 실패 뒤에 뺏지 않는다» (20 · 1) | `expected <input> to be <a class="wb-shell-brand">` |
| J3 | `closeForm` 의 `setFailure(null)` 뗌 | jsdom «실패 뒤 «취소» 로 닫으면 그 폼의 실패 알림이 걷힌다» (20 · 1) | `expected <p> to be null` |
| J4 | `closeForm` 이 조회 실패까지 걷음(`state` 를 `ready` 로) | jsdom «폼을 열고 닫아도 목록 조회 실패 알림은 남는다» (20 · 1) | 알림 글 «목록 조회 실패 [FX-CD]» 를 못 찾음 |
| B0 | J1 + J3(고치기 전 소스와 같은 동작) | 실브라우저 «실패 갈래 — 실패한 뒤 포커스가 …» · «… «취소» 로 폼을 닫으면 …» (6 · 2) | 위 «잰 값» 표 |

## 게이트

체인 스크립트 하나(`nohup nice -n 10 caffeinate -i` · 단계마다 `rc=$?`). node `v24.21.0`. 시작 load 37.7(코어 15).

| 단계 | 시각 | 결과 | 실행 · 건너뜀 |
| --- | --- | --- | --- |
| B0(고치기 전 판 · 위 변조) | 13:09:53 – 13:10:37 | 2 실패(값) — 기대대로 | 8 실행 · 0 건너뜀 |
| `pnpm typecheck` | 13:10:37 – 13:11:14 | rc 0 | — |
| `pnpm vitest run --project web --maxWorkers=25%` | 13:11:14 – 13:22:12 | rc 1 — 1 실패 | 228 파일 · 3578 케이스 = 3576 통과 · 1 실패 · 1 건너뜀 |
| `pnpm vitest run -c vitest.browser.config.ts` 세 파일 | 13:22:12 – 13:24:20 | rc 0 | 26 케이스 = 25 통과 · 1 건너뜀(`rv-cd-cards` 8 · `project-cards` 4 · `rv-ws-workspace` 14) |

- **web 의 실패 하나는 시간 초과다** — `apps/web/test/store-access.test.ts` «지금 트리에는 우회가 없다», `failureMessages` 가 `Error: STACK_TRACE_ERROR`. 그 판 끝의
  load 는 114(1분). load 36 – 39 로 내려간 뒤 그 파일만 두 번 다시 돌렸다: **42 실행 · 42 통과 · 0 건너뜀**(4.7s · 4.5s). 이 고침이 안 건드리는 파일이다.
- 건너뜀 둘은 원래 있던 `describe.skip`(이월) — `apps/web/test/rv-ws-admin.test.tsx` «RV-WS 항목 3 …» · `apps/web/build-test/rv-ws-workspace.test.ts`
  «skip — 지금 빨강(이월)».
- 실브라우저 세 파일 판 끝 load 71 – 114 — 그래도 시간 초과 없음.
- 잠듦: `pmset -g log` 의 마지막 ` Sleep ` 은 09:35:18 — 실행(13:04 – 13:37)과 안 겹친다.
- 슬롯: 브리프의 작은 게이트(세 파일 · web 프로젝트)는 전량 · `test:browser` 가 아니라 `gate-slots/` 를 쓰지 않았다.
- `oxfmt` · `oxlint` 바뀐 네 파일에 rc 0 · 경고 0. 숨은 글자(방향 제어 · 폭 없는 글자 · U+2028 · U+2029 · 서로게이트 · 제어) 네 파일 모두 0
  — `rv-cd-cards.test.ts` 의 U+202E 는 이스케이프 꼴 그대로다.
- `pnpm build` · `pnpm test:browser` 전량 · `export-bundle` 은 브리프의 작은 게이트에 없어 돌리지 않았다.

## 남은 것

- **요청 중에 폼을 닫을 길이 생기면** 닫은 뒤 실패한 요청이 알림을 다시 세운다(`run` 의 `setFailure` 는 폼이 열려 있는지 안 본다). 지금은 요청 중
  «취소» 가 `disabled` 이고 Esc 는 포커스가 `body` 라 폼에 안 닿아 그 길이 없다 — 재현 안 함, 고치지 않았다.
- 마우스로 «만들기» 를 눌러 보낸 판의 실패 뒤 포커스(«만들기» 단추로 돌아감)는 실브라우저로 안 쟀다 — 리뷰 판이 키보드(Enter) 길만 잰다.
- 리뷰 보고의 L2 · L3 · L4 는 브리프 밖이라 그대로다.
- 운영 번들(`EDITOR_STACK_BUNDLE=build`)로는 안 돌렸다 — 레이아웃 이펙트 하나를 더한 것이라 이펙트 차례가 바뀌지 않는다고 보았다(재지 않음).

## 지침

1. **무엇이 틀렸나:** jsdom 은 포커스가 선 칸에 `disabled` 를 걸어도 포커스를 그대로 두고, 잠긴 칸의 `blur()` 도 받지 않는다(포커스 가능 요소만 blur 한다).
   그래서 «잠그면 포커스가 `body` 로 빠진다» 를 jsdom 에서 흉내 내려고 잠근 뒤 `blur()` 를 부르면 아무 일도 없어 판이 안 선다. 지금 지침은 jsdom 의
   `fireEvent.click` 포커스 차이만 말한다.
   **어느 문서 어느 절:** `.ruler/30-delegation.md` 「jsdom 값은 실브라우저 값이 아니다 …」 단락, «jsdom 의 `fireEvent.click` 은 포커스를 옮기지 않아 …» 문장 뒤.
   **넣을 문장:** «**jsdom 은 포커스가 선 요소에 `disabled` 를 걸어도 포커스를 떨구지 않는다** — Chrome 은 `body` 로 떨군다. 잠긴 요소의 `blur()` 도 jsdom 에서는
   아무 일도 안 해, 흉내는 잠기기 전(요청을 보내는 자리)에 `blur` 하고 잠긴 동안 `activeElement === body` 를 카나리아로 둔다
   (`apps/web/test/routes/project-crud.test.tsx` 의 `failWhileFocusLost`).»
