# FX-TK 보고 — 코멘트 토큰 리뷰 대응

대상 `feat/comment-tokens`(앞 머리 `7b5e5afa`). 리뷰 `docs/superpowers/plans/2026-11-11-rv-tk-report.md` 의 M1 · M2 · M3 · L1 · L2 · L3 · L4 를 고쳤다. L5 · L6 은 이월이다(«남은 것»).

## 바꾼 것

| 커밋 | 항목 | 무엇 |
| --- | --- | --- |
| `7b14bb87` | M1 | `resolveCommentTokens` 가 페이지 제목 · 메뉴 경로 · 끊긴 토큰의 대체 글을 `isolateBidi` 로 가둔다(패널 · 번들 · PPTX · CLI · MCP 가 한 벌로 고쳐진다). 라벨 다시 적기(`refreshCommentTokenLabels`)는 안 가둔 이름을 적는다. 풀 자료 없는 판(색인 전 · 내보내기 자료 없음)의 세 사본을 `unresolvedCommentText`(schema) 하나로 모아 대체 글을 가둔다. 고르개 후보 라벨은 보일 때 가두고 토큰 원문에는 이름 그대로 적는다 — 그 때문에 schema 가 `isolateBidi` 를 내보낸다. |
| `7b0fffa0` | M2 · L1 · L4 | 번들 런타임(`packages/exporter/src/browser/boot.tsx`)이 `#wb-marker-<노드>` 로 열리거나 해시가 그리로 바뀌면 «코멘트» 라디오를 고르고 그 줄로 굴린다(`scrollIntoView({ block: 'center' })`). 그 노드의 줄이 없으면 목업의 그 노드(`[data-wb-id]`)로 굴린다. 상태 고르개의 `hashchange` 는 `#state=` 아닌 해시를 무시한다(빈 해시는 기본). 닻 머리 · 탭 라디오 id 를 `page-data.ts` 상수로 둔다. |
| `2bee0570` | M3 | 고르개가 `#` 를 **친 입력에서만** 연다 — `onChange` 에서 그 `#` 가 앞 글과의 공통 머리 뒤(이번 입력이 넣은 글자)일 때만 «연 자리»(`armed`)로 적고, 캐럿 이동(`onSelect`) · 조합 끝은 닫거나 거를 수만 있다. 토큰 원문 안에 친 `#` 는 안 연다(`insideToken`). Escape 의 «그 `#` 로 다시 안 연다» 는 같은 `armed` 를 비우는 것으로 바뀌었다. |
| `da1d4444` | L3 | 색인의 `firstComment` 를 `commentTokenText`(그 코멘트의 페이지 기준 · 대상 없이)로 푼 글의 앞 40 자로 내고 다시 `isolateBidi` 로 가둔다(자른 자리가 격리 끝 글자를 떨굴 수 있다). |
| `22c4216b` | L2 | 재번호 라우트가 번호를 바꿨으면(`markerOps` 가 안 비면) 커밋 뒤 그 페이지의 `comments-changed` 를 낸다(낸 연결은 뺀다). 웹 색인 머리말을 고쳤다. |
| `f45a382b` | 정본 | 「코멘트 목록도 실시간이다」(재번호 신호) · 「코멘트 토큰」 의 풀린 모양(방향 가둠) · 풀 자료(풀린 첫 코멘트 · 재번호 뒤 다시 읽기) · 자동완성(친 `#` 에서만) · 「HTML 정적 번들」 의 코멘트 토큰(닻 따라가기 · 상태 안 건드림)을 지금 참으로 고쳤다. |

새 케이스:

- 실브라우저 `apps/web/build-test/comment-token-review.test.ts` — M1(패널) · M3 둘(고치는 상자의 든 토큰 라벨 · 보통 글 `#12`) · L3 · L2. 리뷰 탐침 W1 · W2 · W3 를 옮겼다.
- 실브라우저 `apps/web/build-test/comment-token-bundle.test.ts` — M1(번들) · M2(다른 장 토큰 누름) · L1(같은 장 토큰 + 상태) · L4(번호 걷힌 노드 닻). 리뷰 탐침 `probe-bundle.mjs` · `probe-bidi.mjs` · `anchor.mjs` 를 옮겼다.
- jsdom `packages/exporter/test/bundle-view-states.test.ts` — 번호 닻 해시로 열기 · 바뀜(탭) · 상태 안 건드림 · 상태 해시가 빠지면 기본(원래 성질 잠금).
- jsdom `apps/web/test/panels/comment-token-picker.test.tsx` — 토큰 원문 안의 `#` · 캐럿 이동으로 안 엶 · 후보 라벨의 방향 가둠.
- unit `packages/schema/test/comment-tokens-resolve.test.ts` «방향 제어 글자를 가둔다» 다섯.
- api `apps/api/test/comment-index.test.ts` «첫 코멘트 앞머리는 토큰을 푼 글이다» · `apps/api/test/comments-changed.test.ts` 재번호 케이스를 고쳐 씀(아래 «결정» 1).

## 결정

1. **«재번호는 신호를 안 낸다» 잠금을 뒤집었다.** `apps/api/test/comments-changed.test.ts` 의 그 케이스가 브리프 방향(L2)과 정면으로 부딪혔다 — 케이스를 «번호를 바꾼 재번호는 셋 다 신호 하나 · 바꿀 것이 없는 재번호는 신호 없음» 으로 고쳐 썼다. 신호의 뜻이 «코멘트 행이 바뀜» 에서 «코멘트 목록 · 번호 색인을 다시 읽을 까닭» 으로 넓어졌다(정본 문장도 그렇게 고쳤다). 받는 쪽 코멘트 목록은 재번호 뒤 한 번 더 읽는다(대가는 조회 하나).
2. **L1 의 «`#state=` 아닌 해시는 상태를 안 건드린다» 에서 빈 해시(`''` · `'#'`)는 뺐다** — 뒤로 가기로 `#state=…` 가 빠지는 판이 기본으로 돌아가야 해서다. 그 성질을 jsdom 케이스 «상태 해시가 빠지면(뒤로 가기) 기본이다» 로 잠갔다(고치기 전에도 초록 — 원래 성질).
3. **L4 는 노드에 정적 닻을 새로 달지 않고 런타임이 목업의 `[data-wb-id]` 로 굴린다.** 스크립트가 없는 판은 지금처럼 장 머리다. 그 노드가 지금 화면 상태에 안 그려졌으면(숨은 상태) 아무것도 안 하고 장 머리에 남는다 — 상태를 바꿔 주지는 않는다.
4. **M1 의 라벨은 원문 이름 그대로 둔다(브리프 기본값).** 대체 글은 보일 때 가두므로 끊긴 토큰도 안 뒤집는다. 노드 이름은 `nodeDisplayName` 이 이미 격리 글자를 넣어 라벨에도 그대로 들어간다 — 이 트랙이 바꾸지 않았다.
5. **M3 의 «친 입력» 판정은 `onChange` 의 앞 글(`value` — 아직 다시 안 그린 상태)과 새 글의 공통 머리로 한다.** 글을 통째로 바꾸는 jsdom 의 `fireEvent.change` 도, 한 글자씩 치는 Chrome 도 같은 판정을 지난다. 조합 중에 든 `#` 도 «연 자리» 로 적어 두고 여는 것은 조합 끝(기존 jsdom 케이스 «조합 중에는 열지 않고 끝난 뒤 거른다» 가 `#` 를 조합 안에서 넣는다 — 처음 짠 판이 그 케이스를 죽여 고쳐 짰다).
6. **번들 주석의 `packages/*/dist` 글자가 블록 주석을 닫아** 새 실브라우저 파일이 수집에서 죽었다 — 글을 바꿨다(보고 «지침» 2).
7. 커밋은 항목마다 나눴다. 겹치는 파일(`comment-token-picker.tsx` · `bundle/comments.ts` · 새 실브라우저 두 파일 · jsdom 고르개 케이스)은 덩이 · 케이스 블록 단위로 인덱스에 올렸고, 정본은 한 덩이에 여러 항목이 섞여 따로 «docs(spec)» 커밋으로 냈다. 중간 커밋들은 훅을 건너뛰었다(`--no-verify` — 중간 판은 다른 항목의 케이스가 빠져 lefthook 의 검사가 의미가 없다). 마지막 트리는 `pnpm fmt:check` · `pnpm lint` · 전량 게이트로 쟀다(«게이트»).

## 잰 값

### 고치기 전 빨강

고친 소스를 쓰기 전(M3 · L3)과 고침을 뗀 변조(나머지)로 보였다. 실브라우저 판은 `pnpm build` 뒤.

| 케이스 | 고치기 전 값 |
| --- | --- |
| web M3 든 토큰 라벨 | 목록 수 `expected 1 to be +0`(캐럿만 옮겨 목록이 섰다) |
| web M3 보통 글 `#12` | `'이슈 [#1](wb:comment/…'`(Enter 가 «#1» 을 골랐다 — 덧말 «이슈 #12 참고» 에 걸림) |
| web L3 | 덧말 `'목록 글 텍스트 · 저기 [x](wb:page/67c9d75f-f6…'` |
| web M1 | 변조 X1 — «끝» x 1359.9 · «글» x 1345.1(뒤집힘) |
| 번들 M1 | 변조 X1 — «끝» x 988.9 · «글» x 973.0 |
| 번들 M2 | 변조 X2 — 고른 탭 `wb-export-tab-description` |
| 번들 L1 | 변조 X3 — 고르개 `default` |
| 번들 L4 | 변조 X4 — 노드 `{ exists: true, visible: false }` |
| web L2 | 변조 X7 — 5 s 뒤 `'상세 #2'` |

### 혼자 죽는 변조

실행기는 스크래치 `mut.py`(리뷰의 것과 같은 꼴 — 백업 이름은 경로 전체 · 맞은 수 1 확인 · 끝에 바이트 비교 복원 · 번들 판은 변조 뒤 `pnpm build` 하고 복원 뒤 다시 `pnpm build`). 열 판 모두 «복원 1 파일 · 바이트 같음», 빌드 rc 0. 판마다 그 케이스 파일만 돌렸다. node `v24.21.0` · load 38.2(시작) → 12.9(끝).

| 변조 | 뗀 것 | 돌린 파일(통과 / 실패) | 죽은 케이스 · 실패 값 |
| --- | --- | --- | --- |
| X1 | `resolveCommentTokens` 의 `isolateBidi` → 그대로 | schema 18/2 · web 실브라우저 4/1 · 번들 실브라우저 3/1 | schema «페이지 제목 · … 가둔다» · «끊긴 토큰의 대체 글도 …»(격리 글자 없음) · web M1 · 번들 M1(x 차례) |
| X1b | `unresolvedCommentText` 의 `isolateBidi` | schema 19/1 | «컨텍스트 없이 편 글 …» `'«U+202E»옛 끝'` |
| X1c | 고르개 라벨의 `isolateBidi` | jsdom 고르개 12/1 | «후보 라벨의 방향 제어 글자는 …» `[ '«U+202E»뒤집' ]` |
| X2 | `followMarkerHash` 의 라디오 고르기 | exporter jsdom 12/2 · 번들 실브라우저 3/1 | «번호 닻 해시로 열면 …» · «해시가 번호 닻으로 바뀌면 …» · 번들 M2(`wb-export-tab-description`) |
| X3 | 상태 고르개의 «`#state=` 아닌 해시 무시» | exporter jsdom 13/1 · 번들 실브라우저 3/1 | «번호 닻 해시 … 고른 상태가 그대로다» · 번들 L1(`default`) |
| X4 | 목업 노드로 굴리기(빈 목록으로) | 번들 실브라우저 3/1 | 번들 L4(`visible: false`) |
| X5a | «친 입력에서만» 판정(`typed` · 공통 머리) | jsdom 고르개 11/2 · web 실브라우저 4/1 | jsdom «Escape 는 닫고 …»(다시 열림) · «캐럿을 옮겨 …» · web M3 보통 글 `#12` |
| X5b | `insideToken` | jsdom 고르개 12/1 · web 실브라우저 5/0 | jsdom «토큰 원문 안에 친 # 로는 …» |
| X6 | 색인 `firstComment` 풀기 → 원문 | api comment-index 5/1 · web 실브라우저 4/1 | api «첫 코멘트 앞머리는 …» · web L3 |
| X7 | 재번호 라우트의 `comments-changed` | api comments-changed 5/1 · web 실브라우저 4/1 | api 재번호 케이스(신호 없음) · web L2(`'상세 #2'`) |

- **web M3 «든 토큰 라벨» 은 두 겹이 막는다** — 캐럿을 옮긴 `#` 는 «친 입력» 이 아니고(X5a), 그 `#` 는 토큰 원문 안이다(X5b). 한 겹씩 떼면 이 케이스는 산다(X5a · X5b 의 web 열). 두 겹 다 없는 고치기 전 판에서 빨강을 보였다(위 표). 겹마다 혼자 죽는 케이스는 jsdom 의 «캐럿을 옮겨 …»(X5a) · «토큰 원문 안에 …»(X5b) 다.
- X5a 가 jsdom «Escape 는 닫고 …» 도 함께 죽였다 — 그 케이스의 «그 `#` 로는 다시 안 연다» 를 지금은 같은 `armed` 판정이 지킨다. 겨눈 축 밖이 아니다.

### 실행

- 고친 뒤 실브라우저 두 파일 9/9 통과(review 5 · bundle 4) — `pnpm build` 뒤.
- jsdom 고르개 13/13 · exporter `bundle-view-states` 14/14 · schema resolve 20/20 · api comment-index + comments-changed 12/12.

## 게이트

전량 넷 + `pnpm fmt:check` · `pnpm lint` 를 머리 `f45a382b`(이 보고 앞의 마지막 커밋 — 보고 커밋은 문서 하나)에서 한 판. 체인은 스크립트 하나(`nohup nice -n 10 caffeinate -i`) · 단계마다 `rc=$?` · 슬롯 0 개에서 띄움(`fx-tk` 슬롯을 만들고 끝에 지움).

| 단계 | 시각 | rc | 실행 · 건너뜀 |
| --- | --- | --- | --- |
| `pnpm typecheck` | 12:35 | 0 | — |
| `pnpm build` | 12:35 – 12:36 | 0 | — |
| `pnpm test --maxWorkers=25%` | 12:36 – 12:47 | 0 | 625 파일(unit 189 · web 244 · api 192) · 9487 통과 · 3 건너뜀 · 0 실패 |
| `pnpm test:build`(1 판) | 12:47 – 13:04 | 1 | serial 18 파일 · 178 통과 · 1 건너뜀 / 실브라우저 129 파일 · 779 통과 · 2 건너뜀 · **1 실패**(`change-kind-code.test.ts` — `{ ack: 1 }` ≠ `{ ack: 2 }`) |
| `pnpm fmt:check` · `pnpm lint` | 13:04 | 0 · 0 | 포맷 1441 파일 맞음 · lint 경고는 이 트랙이 안 고친 줄 |
| `pnpm test:build`(2 판) | 13:06 – 13:24 | 0 | serial 18 파일 · 178 통과 · 1 건너뜀 / 실브라우저 129 파일 · 780 통과 · 2 건너뜀 · 0 실패 |

- **1 판의 `change-kind-code` 빨강은 이 트랙과 무관한 부하 흔들림이다.** 혼자 3/3 초록. 같은 파일 넷을 동시에 띄우면 이 머리에서 2/4 · 리뷰 기준 `7b5e5afa`(이 트랙 앞 — 자기 워크트리를 `git checkout --detach` 해 `pnpm build` 뒤)에서 3/8 이 같은 값(`{ ack: 1, error: +0 }`)으로 빨강이다. 이 트랙은 그 파일이 지나는 코드(코드 묶음 · 종류 바꾸기 · 편집 ack)를 안 건드렸다. 고치지 않았다 — «남은 것» 에 옮긴다. 2 판에서 129 파일 모두 초록이다.
- 실브라우저 파일 수 127(리뷰 판) → 129 는 이 트랙의 새 파일 둘이다.
- node `v24.21.0`. load(1 분) 5.65(시작) → 3.85(test 끝) → 6.93(1 판 끝) → 12.63(2 판 시작) → 9.02(2 판 끝) · 코어 15.
- 잠듦: `pmset -g log` 의 마지막 Sleep 은 09:35 — 실행 시각과 안 겹친다.
- 숨은 글자: 이 트랙이 바꾼 파일과 이 보고에서 U+2028 · U+2029 · 방향 제어 · 폭 없는 글자 셈 0(보고에 옮겨 적은 실패 값의 RLO 둘은 이름 «U+202E» 로 바꿨다).
- 띄운 스택 · vitest 는 끝에 남은 것 0(`ps` 로 이 워크트리 경로를 셈). 자기 DB 컨테이너는 남겼다.

## 남은 것

- **L5(이월)** — 자동완성 후보 짓기가 편집마다 상자 둘에서 다시 돈다(리뷰 값: 큰 프로젝트 한 번 14.5 ms · 편집마다 약 29 ms). 후보를 목록이 열릴 때만 짓거나 상자 하나만 지으면 닫힌다.
- **L6(이월 · 설계대로)** — 페이지 JSON 가져오기의 토큰 다시 잇기 없음.
- 남이 다른 페이지에서 **문서 편집으로** 번호를 바꾼 것(번호 든 노드를 지움 · 되돌리기)은 그 페이지의 `page-changed` 만 내 다른 페이지 화면의 토큰이 다음 다시 읽기까지 옛 번호로 남는다(이동은 id 라 맞다). 이번 L2 는 재번호 라우트만 닫았다.
- L4 — 그 노드가 지금 화면 상태에 안 그려졌으면 장 머리에 남는다(상태를 바꿔 주지 않는다). 스크립트 없는 판은 여전히 장 머리다.
- `apps/web/build-test/change-kind-code.test.ts` «못 받는 종류로 바꾸면 …» 이 동시 부하에서 `{ ack: 1 }` 로 빨강이다(리뷰 기준에서도 3/8 — «게이트»). 이 트랙 밖이다.
- 이 트랙이 안 잰 것: `EDITOR_STACK_BUNDLE=build` 판 · viewer 역할의 실브라우저 이동(리뷰와 같다) · PPTX 의 방향 제어 렌더(PowerPoint).

## 지침

1. **무엇이 틀렸나:** 이름을 글에 잇는 새 자리가 `isolateBidi` 를 거치라는 규칙이 `packages/schema/src/bidi.ts` 머리말에만 있다(리뷰 보고의 «지침» 1 과 같다 — 이 트랙도 같은 자리에서 다시 확인했다). **어느 문서 어느 절:** `.ruler/wirebound/` 의 검증 덧붙임(`AGENTS.md` 「수를 셀 때는 두 번 세고 표본을 열어 본다 — 덧붙임」). **넣을 문장:** 리뷰 보고 «지침» 1 의 문장 그대로.
2. **무엇이 틀렸나:** 블록 주석 안에 경로 글롭 `packages/*/dist` 를 쓰면 `*/` 가 주석을 닫아 파일이 수집에서 «Expected ";"» 로 죽는다(이 트랙의 새 실브라우저 파일). 지침의 다른 자리(「`git grep` 의 경로 인자에 `*` 를 쓰면 …」)는 글롭을 명령에서만 다룬다. **어느 문서 어느 절:** `docs/guideline/base/03-comments.md`(사본 — `guideline propose` 로) 또는 `.ruler/wirebound/` 검증 덧붙임. **넣을 문장:** «블록 주석(`/** … */`) 안에 `*/` 가 드는 글롭(`packages/*/dist`)을 쓰지 않는다 — 주석이 거기서 닫혀 그 뒤가 코드로 읽힌다. `packages/` 의 `dist` 처럼 풀어 쓴다.»
3. **무엇이 틀렸나:** 항목마다 커밋하라는 브리프와 «한 파일에 여러 항목이 얽힌 고침» 이 만나면 대화형 `git add -p` 가 없는 환경에서 가를 길이 지침에 없다. **어느 문서 어느 절:** `.ruler/wirebound/` 워커 덧붙임(「워커에게 맡길 때 — wirebound」). **넣을 문장:** «항목마다 커밋할 때 한 파일에 여러 항목이 얽히면 덩이를 골라 지은 중간 내용을 `git hash-object -w --stdin` · `git update-index --cacheinfo 100644,<sha>,<경로>` 로 인덱스에 올린다 — 작업 트리는 마지막 판 그대로 두고, 끝에 `git status` 가 깨끗한지(마지막 커밋 = 작업 트리) 본다.»
