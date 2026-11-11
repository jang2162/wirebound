# RV-TK 보고 — 코멘트 토큰 리뷰

대상 `feat/comment-tokens` 머리 `3a68db45`(구현 보고 `docs/superpowers/plans/2026-11-11-tk-report.md`). 설계 `docs/superpowers/specs/2026-11-11-comment-tokens-design.md` · 계획 `docs/superpowers/plans/2026-11-11-comment-tokens.md`.
리뷰어 트랙이다 — 소스를 고치지 않았다. 바꾼 것은 이 보고 하나다. 탐침은 전부 스크래치에서 돌렸고 원문을 맨 끝 「탐침 원문」 에 옮겼다.

## 요약

높은 무게(인가 우회 · 남의 프로젝트 노출 · 스크립트 주입 · 엉뚱한 곳으로 이동)는 **없다.** 중간 셋 · 낮음 여섯.

| # | 무게 | 무엇 | 길 | 잰 판 |
| --- | --- | --- | --- | --- |
| M1 | 중간 | 페이지 · 메뉴 제목의 방향 제어 글자(U+202E)가 토큰의 풀린 글에 그대로 실려 **코멘트의 뒤따르는 글까지 뒤집는다** — 웹 패널 · 번들(PPTX · CLI 도 같은 글) | 새 장치가 연 길 | Chrome(웹 · 번들) · 함수 값 |
| M2 | 중간 | 번들에서 **다른 장의 번호 토큰**을 누르면 그 장이 «설명» 탭으로 서서 닻(`#wb-marker-…`)이 숨은 «코멘트» 탭 안에 있다 — 번호가 안 보인다 | 새 장치가 연 길 | Chrome(번들 file://) |
| M3 | 중간 | `#` 자동완성이 **이미 든 토큰의 라벨(`[#1](…)`) · 보통 글 `#12` 뒤에 캐럿을 두기만 해도 열리고**, 줄바꿈으로 친 Enter 가 후보를 골라 본문이 `[[#1](wb:…)](wb:…)` 로 깨진다 — 저장하면 읽는 자리에 **날 id 가 보인다** | 새 장치가 연 길 | Chrome(웹 고치는 상자) · 함수 값 |
| L1 | 낮음 | 번들의 **같은 장** 번호 토큰을 누르면 해시가 바뀌어 고른 화면 상태가 기본으로 돌아간다 | 새 링크 + 원래 있던 해시 장치 | Chrome(번들) |
| L2 | 낮음 | 남이 **다른 페이지**에서 재번호하면 열린 탭의 «상세 #2» 가 5 s 넘게 남는다(서버는 #1) — 누르면 같은 노드로 간다 | 구현 보고 «남은 것» 그대로 | Chrome(웹) |
| L3 | 낮음 | 자동완성 덧말의 «첫 코멘트 앞머리» 가 원문이라 토큰 원문 · **날 id** 가 보인다 | 새 장치 | Chrome(웹) |
| L4 | 낮음 | 번들에서 **번호 걷힌 노드**로 가는 링크의 닻(`#wb-marker-<노드>`)이 그 장에 없다 — 장 머리로 간다 | 새 장치 | 함수 값(번들 HTML) |
| L5 | 낮음 | 자동완성 후보 짓기가 열린 문서가 바뀔 때마다(편집마다) 상자 둘에서 다시 돈다 — 300 페이지 · 번호 1000 · 코드 1000 에서 한 번 14.5 ms | 새 장치 | node 계측 |
| L6 | 낮음 | 페이지 JSON 가져오기의 토큰 다시 잇기 없음 — 설계 «들이는 입구» 의 «끊김» 갈래와 맞다 | 설계대로 | 코드 |

## 1. 남의 프로젝트가 새는가 — 새지 않는다

스크래치 api 탐침(`leak.probe.test.ts` — api 하네스 · `withApi`). O 가 A · B 의 owner, M 은 A 의 editor · B 의 비멤버, V 는 A 의 viewer, X 는 아무 데도 아니다. B 에 «B비밀» 이 든 메뉴 · 페이지 · 노드 · 코멘트 · 코드 그룹 · 항목을 두고, M 이 A 의 코멘트에 **B 의 페이지 · 번호 · 그룹 · 항목** 토큰과 같은 꼴의 **없는 id** 토큰(없는 uuid · 키 `NOPE`)을 짝으로 넣었다. M 이 보는 출력마다 «B비밀» 글자 수 · B 페이지 id 수를 셌다.

| 출력 | «B비밀» | B 페이지 id | 끊김의 꼴(B 토큰 \| 없는 id 토큰) |
| --- | --- | --- | --- |
| `GET …/comments/index` | 0 | 0 | — |
| HTML 번들 zip 전부(라우트로 내려받음) | 0 | 0 | `<span class="wb-export-token-broken">Qpage<span …> 찾을 수 없음</span></span>` 두 쪽 같다(넷 다) |
| PPTX zip 전부 | 0 | 0 | `Qcomment (찾을 수 없음) \| Qcomment (찾을 수 없음)` |
| `GET …/snapshot` | 0 | 2 | M 이 친 원문(`body`)의 id 둘뿐 |
| CLI `page get` 사람 출력(`renderPageView`) | 0 | 0 | `page: Qpage (찾을 수 없음) \| Qpage (찾을 수 없음) / …` |
| CLI `--json` · MCP `get_page`(같은 `lookupPage`) | 0 | 2 | 원문 `body` 의 id 둘 · `resolved` 에 B 대상 없음 |
| lint `comment-token-broken` | 0 | 0 | 8 건 — B 넷 · 없는 id 넷이 같은 문장(«…찾을 수 없습니다: Q…») |

색인 라우트 권한: viewer 200 · 비멤버 404 · M 이 B 로 404 · M 의 A 토큰 200 · 그 토큰으로 B 404 · viewer 로 강등 뒤 토큰 200(viewer 라우트라 맞다) · 멤버에서 뺀 뒤 토큰 401 · 쿠키 404.

까닭(코드): 풀 자료를 짓는 자리가 모두 그 프로젝트의 행만 읽는다 — 서버 색인(`listMenuRows` · `listPages` · `listProjectComments` · `readCodeTable` 에 `projectId`), 번들 · PPTX(`ExportRows`), CLI · MCP(스냅샷 payload). 남의 id 는 맵에 없어 `resolveTarget` 이 `null` → 대체 글. 웹은 그 서버 색인 + 열린 문서다.

## 2. 사람 글이 마크업으로 박히는가 — 안 박힌다(방향 제어는 M1)

번들(`probe-bundle.mjs` · Chrome file://): 페이지 제목 `<img src=x onerror=alert(1)>"'` + U+202E 의 장으로 가는 번호 토큰과 `[x](javascript:alert(1)) [y](wb:page/../..) [z](wb:page/<id>?a)` 를 넣었다. 본문 HTML 은 `&lt;img …&gt;` 로 이스케이프 · `img[src=x]` 0 · `pageerror` · `dialog` 0. 링크 `href` 둘 다 번들 안 상대 주소(`%ED%9A%8C…목록.html#wb-marker-n_f39` · `img-src%3Dx-onerror%3Dalert(1)-'%E2%80%AErev.html#wb-marker-n_d`). 가짜 토큰 셋은 원문 글자 그대로.

웹(`web.probe.test.ts` W1 · Chrome): 같은 제목의 페이지 토큰 — 코멘트 패널에 글로 서고 `img[src="x"]` 0 · 대화 상자 0. `href` 는 `commentTokenHref` 가 uuid(검증된 꼴) · `URLSearchParams` 로 짓는다(코드).

### M1 — 방향 제어 글자가 코멘트를 뒤집는다(중간 · 새 장치가 연 길)

- **재현:** 페이지 제목을 U+202E 로 시작하게 두고(서버 `Title` 은 `min(1).max(200)` 뿐 — 방향 제어를 안 막는다), 다른 페이지 코멘트에 `방향 [x](wb:page/<그 페이지>) 끝 글` 을 단다.
- **값:** 웹 패널(Chrome) — «끝 글» 에서 «끝» 의 x 1529 · «글» 의 x 1319 → **«글 끝» 으로 뒤집혀 선다**, 본문에 FSI(U+2068) 없음. 번들(Chrome) — 같은 판에서 «끝» 1081 · «글» 1065 · 스크린숏에 뒤따르는 가짜 토큰 원문 셋까지 거꾸로 섰다. 함수 값 — `commentTokenText` 결과에 U+202E 가 그대로 있고 격리 글자가 없다.
- **까닭:** `resolveTarget`(`packages/schema/src/comment-tokens.ts`)이 페이지 제목 · 메뉴 경로를 그대로 잇는다. 저장소는 이름을 문장에 이을 때 `isolateBidi`(`packages/schema/src/bidi.ts`)로 가두는 것을 규칙으로 둔다(상호작용 문장의 페이지 경로 · 노드 요약 · 별칭) — 토큰 풀기만 빠졌다. 코드 이름은 서버가 방향 제어를 거절해(`codeText` 의 `hasRejectedAliasChar`) 안 걸린다. 노드 이름은 `nodeDisplayName` 이 가둔다.
- **고칠 자리(제안):** `pageName` 의 결과(제목 · 메뉴 경로)를 `isolateBidi` 로 감싼다 — 패널 · 번들 · PPTX · CLI · MCP 가 한 벌로 고쳐진다. 라벨 갱신(`refreshCommentTokenLabels`)이 그 글을 라벨에 적으므로 격리 글자가 원문에 들어가는지 함께 정한다.

## 3. 이동이 정확한가

웹: 남의 재번호 뒤(W3) 누르면 `n_form` 이 골라졌다 — 낡은 번호를 보여도 이동은 노드 id 라 맞다. 같은 제목 · 번호 걷힌 노드 · 노드째 지움은 schema 케이스(`comment-tokens-resolve.test.ts`)와 jsdom 이 잰다 — 이 리뷰는 다시 안 쟀다. viewer 역할 이동은 jsdom 판(«뷰 모드에서도 간다»)만 있다 — 실브라우저로 안 쟀다.

### M2 — 번들의 다른 장 번호 토큰이 번호를 안 보인다(중간 · 새 장치가 연 길)

- **재현:** 번들의 장 A 코멘트에서 «회원 상세 #1» 을 누르거나, 장 파일을 `#wb-marker-n_f39` 해시로 연다.
- **값(Chrome):** 연 장의 고른 탭 `wb-export-tab-description` · 닻 요소의 상자 0×0(`visible: false`) — **번호 줄이 «코멘트» 탭(`display: none`) 안이라 굴러가지도 보이지도 않는다.** 같은 장 안에서 «코멘트» 탭을 연 채 누른 판만 닻이 창 안에 섰다(top 520 · bottom 586 / 창 600).
- **까닭:** 탭은 라디오 + CSS(`defaultChecked={index === 0}` — 첫 탭이 설명)이고, 해시가 탭을 고르지 않는다(`packages/exporter/src/browser/boot.tsx` 의 해시는 `#state=` 만 읽는다). 구현 케이스 «닻이 선다» 는 `id` 가 있는지만 잰다.
- **고칠 자리(제안):** 장이 `#wb-marker-…` 로 열리면(그리고 `hashchange`) «코멘트» 라디오를 고르고 그 줄을 굴린다 — 런타임이 없는 판(스크립트 없음)은 `:target` 으로 못 연다(라디오 상태라). 또는 번호 닻을 탭 밖에 두는 꼴.

### L1 — 같은 장 번호 링크가 화면 상태를 되돌린다(낮음)

- **값(Chrome):** 상태 고르개를 `s_admin` 으로 둔 뒤 «코멘트» 탭의 같은 장 «#41» 을 누르면 해시 `#wb-marker-n_f39` · 고르개 `default` — 캔버스가 기본 상태로 돌아간다.
- **까닭:** `wireStatePicker` 의 `hashchange` 가 `#state=` 아닌 해시를 «기본» 으로 읽는다. 원래 있던 장치에 새 해시 링크가 닿은 판이다.

### L4 — 번호 걷힌 노드의 번들 닻이 없다(낮음)

- **값:** 장 «상세» 에 코멘트 · 번호 없는 노드 `n_bare` 로 가는 토큰 → 링크 `상세.html#wb-marker-n_bare`(글 «상세 › 저장 버튼») · 그 장 HTML 에 `id="wb-marker-n_bare"` 없음(`anchor.mjs`). 설계 «누르면 그 노드로 간다» 의 번들 몫이 장 머리에서 멈춘다. `commentEntries` 가 코멘트 · 번호 있는 노드만 줄을 낸다.

## 4. 출력이 갈리는가 — 안 갈린다

- 같은 본문이 번들(`Qpage 찾을 수 없음`) · PPTX · CLI 사람 · `--json` · lint 에서 같은 대체 글로 풀렸다(위 1 표). 산 토큰 «A목록» 도 번들 · PPTX · CLI 가 같다 · `resolved` 만 `(page:<id>)` 를 붙인다.
- 본문을 내는 자리 셈(`git grep -n "comment\.body\|entry\.body" -- apps/web/src 'packages/*/src/**' apps/api/src`): 풀기를 안 거치고 사람에게 내는 자리는 **웹 자동완성 덧말의 `firstComment`(L3)** 하나다. 그 밖은 저장 · 복원 · 스냅샷 · 가져오기 · 페이지 JSON 내보내기 · 원문 `body` 칸(MCP · `--json`)이다.
- 코드로 본 작은 갈림(안 잼): 웹 색인의 `pages` 는 프로젝트의 모든 페이지 행이고 CLI · 번들은 `targetedPages` 결과다 — 메뉴를 잃은 페이지(`menu-detached`)는 웹에서 풀리고 CLI 에서 끊긴다(번들은 그 판에서 내보내기 자체를 멈춘다). lint 는 메뉴 경로를 `''` 로 둬 «메뉴 › 제목» 갈래가 없다(문장은 라벨만 싣는다 — 글이 갈리지 않는다).

## 5. 자동완성

### M3 — 캐럿만 두어도 열리고 줄바꿈 Enter 가 고른다(중간 · 새 장치가 연 길)

- **재현(Chrome · 고치는 상자):** 본문 `[#1](wb:comment/<목록>/n_a) 뒤 글` 의 «수정» → 상자를 누르고 ← → 로 캐럿을 «#1» 뒤(3)에 둔다 → 목록이 선다(후보 `#1` · 제목 페이지 · `상세 #1`) → Enter.
- **값:** 상자 글 `[[#1](wb:comment/<목록>/n_a)](wb:comment/<목록>/n_a) 뒤 글`. 저장하면 풀린 조각이 `[` · 링크 «#1» · 글 `](wb:comment/7ef4…/n_a) 뒤 글` 이다 — **읽는 자리에 날 id 가 글로 선다**(`w2.mjs`). 함수 값 — `hashQuery('보세요 [#3](wb:…) 끝', 캐럿 «#3» 뒤)` = `{ start: 5, query: '3' }` · `hashQuery('이슈 #12 참고', «#12» 뒤)` = `{ start: 3, query: '12' }` — 보통 글 `#12` 뒤에서 Enter 로 줄을 바꾸려 해도 «#12» 로 걸리는 후보가 있으면 고른다.
- **까닭:** `onSelect`(캐럿 이동)도 `sync` 를 불러 연다 · `hashQuery` 가 `[` 뒤의 `#` 를 연다 · Escape 로 닫은 자리 하나만 기억한다.
- **고칠 자리(제안):** 캐럿 이동으로는 열지 않고 `#` 를 **친** 입력(`onChange` 에서 `#` 가 새로 든 때)에서만 연다. 토큰 원문 안(파서가 토큰으로 읽는 구간)의 `#` 는 열지 않는다.

### 나머지(재현 안 됨 · 구현 판으로 충분)

- 한글 조합 중 Enter — 변조 M4(아래)로 Chrome 이 값으로 가른다.
- 길이 한도 · 저장 직전 라벨 갱신 — 구현 변조 T5d · T5e 가 잰다. 남이 이름을 바꾼 뒤 `menu-changed` 가 닿기 전에 저장하면 라벨이 옛 이름으로 남는다 — 라벨은 대체 글이라 끊긴 뒤에만 보인다(무게 없음 · 안 잼).
- **입력 지연(Chrome · W5):** 페이지 300 · 번호 1000 · 첫 코멘트 1000 개. 색인 응답 11 ms · 168 613 바이트. `#페이지 29` 를 30 ms 간격으로 친 동안 Event Timing 의 16 ms 넘은 키 이벤트 — `keydown` 16 · `input` 16(처리 3 ms) · 목록 21 개. 지연은 안 보인다.

### L3 — 덧말에 원문 · 날 id(낮음)

`w2hints` 첫 줄: `목록 글 텍스트 · 방향 [x](wb:page/cb00104c-2195-4f1f-86a9-f` — 서버 색인의 `firstComment` 가 원문 40 자다. 설계 «날 id 가 사람에게 보이는 것(읽는 자리에서)» 의 쓰는 자리 판이다. `firstComment` 를 `resolveCommentTokens` 로 편 글(또는 라벨로 편 글)로 내면 닫힌다.

### L5 — 후보 짓기 비용(낮음)

`tokenCandidates`(node · 위 규모 + 코드 50 그룹 × 20 항목 = 후보 2349) 한 번 14.5 ms · 거르기 0.5 – 0.6 ms · 2000 노드 문서의 `buildMarkerIndex` 0.64 ms. `useCommentTokenContext` 가 열린 문서에 매여 편집마다 새 컨텍스트 → 코멘트 탭이 서 있는 동안 상자 둘(`draftPicker` · `editPicker`)이 편집마다 다시 짓는다(약 29 ms). 후보를 목록이 열릴 때만 짓거나 상자 하나만 지으면 닫힌다.

## 6. 구현 보고 «남은 것» 의 무게

### ① 남의 다른 페이지 재번호 — L2(낮음)

- **값(Chrome · W3):** «상세» 의 코멘트 `n_top`(#1) · `n_form`(#2), «목록» 코멘트에 «상세 #2» 토큰. 남(같은 사람의 REST)이 `n_top` 코멘트를 지운 1.5 s 뒤 «상세 #2»(번호는 그대로가 맞다) → 재번호(`n_form` → 1) 5 s 뒤에도 **«상세 #2»**, 서버 색인은 `marker: 1`. 그 사이 누르면 «상세» 가 서고 `n_form` 이 골라졌다.
- **얼마나 남나:** 다음 다시 읽기 — 이 탭의 페이지 옮김 · 프로젝트 안 아무 코멘트 신호(`comments-changed` 는 어느 페이지든 색인을 다시 읽는다 — `signals.subscribe` 가 `pageId` 를 안 본다) · 메뉴 · 공통코드 · 다시 붙음. 조용한 프로젝트면 끝이 없다.
- **무게:** 이동은 맞다. 다만 그 사이 «상세» 의 다른 노드가 #2 를 받으면(뒤에 코멘트를 단 노드) 글 «상세 #2» 가 캔버스의 ②(다른 노드)와 맞는 것처럼 읽힌다 — 글과 대상이 갈린다. 재번호 라우트가 `comments-changed` 를 내면 닫힌다(구현 보고의 제안과 같다).

### ② 페이지 JSON 가져오기의 다시 잇기 — L6(낮음 · 설계대로)

가져오기는 늘 노드 id 를 다시 짓는다(`planPageImport` → `remapNodeIds` 가 트리 전체에 새 id). 설계 «들이는 입구» 의 «가져오기가 노드 id 를 다시 지으면 «끊김» 으로 남기고 보고에 적는다» 갈래에 맞다. 덧붙임: 같은 프로젝트에서 내보냈다 다시 가져온 «복제» 판의 자기 번호 토큰(`[#3](wb:comment/<원본>/…)`)은 원본 페이지의 #3 으로 풀리고 간다(«원본 #3» 으로 보여 글이 대상을 말한다 — 엉뚱하지 않다).

## 7. Review Focus 다섯 — 혼자 죽는 변조

변조는 스크래치 `mut.py`(백업 이름은 경로 전체 · 끝에 바이트 비교 복원 · 맞은 수 1 확인)로 걸고 그 케이스 파일만 돌렸다. 일곱 판 모두 «복원 1 파일 · 바이트 같음».

| RF | 변조 | 돌린 파일 | 죽은 케이스 | 실패 값 |
| --- | --- | --- | --- | --- |
| 1 재번호 | M6 `useCommentTokenContext` memo 의존에서 `document` 뗌 | web `comment-tokens.test.tsx` | «재번호 편집 뒤 «#3» 이 «#1» 로» **1/10** | `expected '#3' to be '#1'` |
| 1 (참고) | M1 열린 문서 몫(`live`) 덧씌우기 뗌 | web `comment-tokens` · `comment-token-picker` | 8/20 — 목록 · 자동완성 넷까지 | 판 카나리아(`'회원 상세' to be '#3'`)부터 — 열린 페이지 번호는 jsdom 픽스처에서 서버 색인에 없다. 구분력 판정에 안 쓴다 |
| 2 남의 id | M2 `pageName` 이 없는 id 를 `?<id>` 로 | schema resolve · lint · exporter · mcp · cli · web | 여러 파일 함께 — schema resolve 4/15 · lint 2/3 · exporter 4/5 · mcp + cli 3/3 · web 2/10 | 대체 글 대신 `?9999…` |
| 3 보통 글 | M3 `parseTarget` 의 page `parts.length === 2` 뗌 | schema parse · resolve | «꼴이 깨진 대상은 토큰이 아니다 — `[a](wb:page/<id>/extra)`» **1/45** | 글이 토큰으로 읽힘 |
| 4 조합 Enter | M4 `onKeyDown` 의 조합 가드 뗌 | 실브라우저 `comment-token-picker.test.ts` | **1/1**(Chrome) | `expected '[#1](wb:comment/…' not to contain '](wb:'` |
| 5 걷힌 번호 | M7 번호 없는 노드 글 «› 노드 이름» → `#?` | schema resolve · web · exporter | schema «번호가 걷힌 노드는 …» + web «토큰을 … 링크로» 2/30 | 글 차이 |
| 5 (참고) | M5 `buildMarkerIndex` 가 번호 없음을 0 으로 | 같은 셋 | 3/30 — 위 둘 + «모든 노드를 «페이지/노드» 열쇠로» | `#0` · `marker: +0` |

RF2 는 혼자 죽는 케이스가 없다 — 성질이 넓어(남의 id → 끊김) 소비자마다 케이스가 하나씩 쥔다. 끝에서 끝으로는 이 리뷰의 api 탐침(1 절)이 잰다. RF5 는 schema 파일 안에서 혼자 · 웹 표시 케이스가 같은 글을 함께 단언한다.

## 잰 값

- 탐침: api `leak.probe.test.ts` 1/1 통과(0.56 s · 값은 1 절) · 웹 `web.probe.test.ts` W1 – W3 1/1 통과(9.2 s) · W5 1/1 통과(16.4 s · 첫 판 — 둘째 판은 W3 의 응답 꼴을 고친 뒤 W5 를 건너뛰고 W1 – W3 만 다시 돌렸다) · 번들 `probe-bundle.mjs` · `probe-bidi.mjs` · `anchor.mjs` · 함수 `probe-schema.mjs` · `w2.mjs` · `hq.mts` · `perf.mts`.
- 함수 값(덧붙임): 대문자 uuid 토큰(`wb:page/ABCDEF12-…`)은 어디서나 끊김(맵 열쇠가 소문자) — 일관돼 무게 없다. 라벨 `a]b` · `a[b` · `a\` · `a\]` · `(x)` · `x)](wb:page/…)` · 줄바꿈과 코드값 `A B/C` · `a)b` · `100%` · `(` · `%` · 공백 · `\` 가 다 왕복했다.

## 게이트

전량 넷 + `pnpm fmt:check` · `pnpm lint` 를 한 판(`3a68db45`) 다시 돌았다. 체인은 스크립트 하나(`nohup nice -n 10 caffeinate -i`) · 단계마다 `rc=$?` · 슬롯 0 개에서 띄움(`rv-tk` 슬롯을 만들고 끝에 지움).

| 단계 | 시각 | rc | 실행 · 건너뜀 |
| --- | --- | --- | --- |
| `pnpm typecheck` | 11:37 – 11:38 | 0 | — |
| `pnpm build` | 11:38 | 0 | — |
| `pnpm test --maxWorkers=25%` | 11:38 – 11:50 | 0 | 625 파일(unit 189 · web 244 · api 192) · 9474 통과 · 3 건너뜀 · 0 실패 |
| `pnpm test:build` | 11:50 – 12:10 | 0 | serial 18 파일 · 178 통과 · 1 건너뜀 / 실브라우저 127 파일 · 771 통과 · 2 건너뜀 |
| `pnpm fmt:check` · `pnpm lint` | 12:10 | 0 · 0 | 포맷 1439 파일 맞음 · lint 경고는 이 트랙이 안 고친 줄(트랙 파일의 경고 7 줄도 바뀐 덩이 밖) |

- node `v24.21.0`. load(1 분) 18.15(시작) → 2.50(test 끝) → 9.77(끝) · 코어 15.
- 잠듦: `pmset -g log` 의 마지막 Sleep 은 09:35 — 실행 시각과 안 겹친다.
- 구현 2판에서 깨졌던 실브라우저(vite-node 캐시 ENOENT)는 이 판에서 127 파일이 다 돌았다.
- 숨은 글자: 이 트랙이 바꾼 61 파일과 이 보고에서 U+2028 · U+2029 · 방향 제어 셈 0.
- 변조 뒤 `git status` 깨끗 · `git diff --stat` 은 이 보고 하나.

## 남은 것

- M1 · M2 · M3(중간) — 위 «고칠 자리(제안)». 셋 다 새 장치가 연 길이라 병합 전에 고치거나 이월로 받을지 코디네이터가 정한다.
- L1 – L5 — 이월 후보. L2 는 재번호 라우트의 `comments-changed` 한 줄로 닫힌다.
- 이 리뷰가 안 잰 것: viewer 역할의 실브라우저 이동 · PPTX 의 방향 제어(PowerPoint 렌더 — 같은 글이라 같다고 봄) · `EDITOR_STACK_BUNDLE=build` 판 · 메뉴를 잃은 페이지의 웹 · CLI 갈림(4 절 끝).
- 이 리뷰는 결함 판을 케이스로 잠그지 않았다(리뷰어 — 소스 금지). 고치는 트랙이 위 탐침 원문을 `apps/web/build-test/` · `packages/exporter/test/` 케이스로 옮긴다.

## 지침

- **무엇이 틀렸나:** 이름(사람이 지은 글)을 다른 글에 잇는 새 자리를 세울 때 `isolateBidi` 를 거치라는 규칙이 `packages/schema/src/bidi.ts` 머리말에만 있고 지침 · 브리프 체크리스트에 없다 — 토큰 풀기(M1)가 그대로 빠졌다. **어느 문서 어느 절:** `.ruler/wirebound/` 검증 덧붙임(`AGENTS.md` 「수를 셀 때는 두 번 세고 표본을 열어 본다 — 덧붙임」 근처) 또는 워커 브리프 덧붙임. **넣을 문장:** «사람이 지은 이름(페이지 · 메뉴 제목 · props 글)을 다른 글에 이어 붙이는 새 자리는 `isolateBidi`(`packages/schema/src/bidi.ts`)를 지나게 하고, U+202E 를 든 제목으로 그 뒤 글자의 x 차례를 실브라우저에서 잰다 — 서버의 `Title` 은 방향 제어를 안 막는다.»
- **무엇이 틀렸나:** 번들 닻 케이스가 «`id` 가 있다» 만 재면 닻이 숨은 탭 안이라 이동이 안 보이는 판(M2)이 초록이다. **어느 문서 어느 절:** `.ruler/wirebound/` 검증 덧붙임 «번들 페이지에서 그린 글은 목업 칸의 글로만 잰다» 줄 뒤. **넣을 문장:** «번들 안 링크 · 닻을 더하면 그 해시로 장을 연 실브라우저 판에서 닻 요소의 상자가 0 이 아닌지 · 창 안에 서는지를 잰다 — 패널 탭은 라디오 + CSS 라 숨은 탭 안의 닻은 `id` 가 있어도 안 보인다.»
- **무엇이 틀렸나:** 스크래치에 둔 vitest 설정 · 탐침이 `vitest/config` · `vitest` 를 맨 이름으로 못 찾아 `ERR_MODULE_NOT_FOUND` 로 수집 전에 죽었다(스크래치는 체크아웃 밖이다). **어느 문서 어느 절:** `.ruler/wirebound/` 검증 덧붙임 «목 · 계측은 …» 의 «스크래치 탐침을 테스트 글롭에 안 넣고 api 하네스로 돌리려면» 문장 끝. **넣을 문장:** «스크래치 디렉터리에 체크아웃의 `node_modules` 심링크(`ln -sfn <체크아웃>/node_modules <스크래치>/node_modules`)를 두면 설정 · 탐침의 맨 이름 `import` 가 풀린다.»

## 탐침 원문

### `probe-bundle.mjs` — 번들 실브라우저 — 2 절 · M2 · L1(`node probe-bundle.mjs`, 스크래치에서)

```js
// 번들 실브라우저 탐침 — B1(번호 닻이 숨은 코멘트 탭 안) · B2(같은 장 번호 링크가 화면 상태를 기본으로 되돌림) · X(마크업 · href) · BIDI
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
const W = '/Users/jang2162/IdeaProjects/wirebound/.worktrees/feat-comment-tokens'
const schema = await import(`${W}/packages/schema/dist/index.js`)
const exporter = await import(`${W}/packages/exporter/dist/index.js`)
const { chromium } = await import(`${W}/apps/web/node_modules/playwright-core/index.mjs`)
schema.installCatalog()
const t = schema.formatCommentToken
const L = '11111111-1111-4111-8111-111111111111'
const D = '22222222-2222-4222-8222-222222222222'
const RLO = String.fromCharCode(0x202e)
const listDoc = {
  version: 5,
  viewStates: [{ id: 's_admin', name: '관리자' }],
  root: { id: 'n_root', type: 'Page', children: [
    { id: 'n_a', type: 'Text', marker: 1, props: { content: '가' } },
    ...Array.from({ length: 40 }, (_, i) => ({ id: `n_f${i}`, type: 'Text', marker: i + 2, props: { content: `줄 ${i}` } })),
  ] },
}
const detailDoc = { version: 5, root: { id: 'n_root', type: 'Page', children: [{ id: 'n_d', type: 'Text', marker: 1, props: { content: '상' } }] } }
const XSS_TITLE = `<img src=x onerror=alert(1)>"'${RLO}rev`
const many = Array.from({ length: 40 }, (_, i) => ({ nodeId: `n_f${i}`, body: `채움 ${i}` }))
const body = [
  `같은 ${t('옛', { kind: 'comment', pageId: L, nodeId: 'n_f39' })}`,
  `다른 ${t('옛', { kind: 'comment', pageId: D, nodeId: 'n_d' })}`,
  `가짜 [x](javascript:alert(1)) [y](wb:page/../..) [z](wb:page/${L}?a)`,
  `끝 글`,
].join(' / ')
const pages = [
  { id: L, title: '회원 목록', pageTitle: '회원 목록', menuPath: ['회원'], document: listDoc, comments: [{ nodeId: 'n_a', body }, ...many] },
  { id: D, title: XSS_TITLE, pageTitle: XSS_TITLE, menuPath: ['회원'], document: detailDoc, comments: [{ nodeId: 'n_d', body: '상세 코멘트' }] },
]
const runtimeJs = readFileSync(`${W}/packages/exporter/dist/runtime.js`, 'utf8')
const bundle = exporter.exportBundle({ pages, runtimeJs })
const dir = join(process.cwd(), 'pb', 'out')
rmSync(dir, { recursive: true, force: true })
for (const f of bundle.files) { const p = join(dir, f.path); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, f.content) }
const [lp, dp] = bundle.pagePaths
const out = {}
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 600 } })
  const errors = []; page.on('pageerror', (e) => errors.push(String(e))); page.on('dialog', (d) => { errors.push('DIALOG ' + d.message()); d.dismiss() })
  await page.goto(pathToFileURL(join(dir, lp)).href)
  await page.waitForTimeout(500)
  out.links = await page.$$eval('[data-wb-marker-for="n_a"] .wb-export-entry-body a', (as) => as.map((a) => [a.textContent, a.getAttribute('href')]))
  out.bodyText = await page.$eval('[data-wb-marker-for="n_a"] .wb-export-entry-body', (p) => p.textContent)
  out.bodyHtml = await page.$eval('[data-wb-marker-for="n_a"] .wb-export-entry-body', (p) => p.innerHTML)
  out.checkedTab = await page.$eval('input.wb-export-tab-radio:checked', (i) => i.id)
  // B2: 상태를 관리자로 바꾼 뒤, 같은 장 번호 링크를 누른다 — 코멘트 탭을 먼저 열어 링크를 보이게
  await page.click('label.wb-export-tab-comments')
  await page.selectOption('#wb-export-state', 's_admin').catch((e) => (out.selectErr = String(e).slice(0, 200)))
  out.stateBefore = await page.$eval('#wb-export-state', (s) => s.value).catch(() => 'none')
  await page.evaluate(() => { const el = document.querySelector('.wb-export-tabpanel#wb-export-panel-comments'); if (el) el.scrollTop = 0 })
  const same = page.locator('[data-wb-marker-for="n_a"] .wb-export-entry-body a').first()
  await same.click()
  await page.waitForTimeout(300)
  out.hashAfter = await page.evaluate(() => location.hash)
  out.stateAfter = await page.$eval('#wb-export-state', (s) => s.value).catch(() => 'none')
  out.targetInView = await page.evaluate(() => { const el = document.getElementById('wb-marker-n_f39'); const box = el?.getBoundingClientRect(); const panel = el?.closest('.wb-export-tabpanel')?.getBoundingClientRect(); return { exists: !!el, top: box?.top, bottom: box?.bottom, panelTop: panel?.top, panelBottom: panel?.bottom, h: innerHeight } })
  // B1: 다른 장의 번호 링크를 새 탭에서 연다 — 그 장 파일은 기본 탭으로 선다
  const page2 = await browser.newPage({ viewport: { width: 1280, height: 600 } })
  await page2.goto(pathToFileURL(join(dir, lp)).href + '#wb-marker-n_f39')
  await page2.waitForTimeout(500)
  out.b1 = await page2.evaluate(() => { const el = document.getElementById('wb-marker-n_f39'); const r = el.getBoundingClientRect(); return { checked: document.querySelector('input.wb-export-tab-radio:checked').id, visible: r.width > 0 && r.height > 0, top: r.top } })
  out.detailTitle = await (async () => { const p3 = await browser.newPage(); await p3.goto(pathToFileURL(join(dir, dp)).href); await p3.waitForTimeout(300); return p3.evaluate(() => ({ title: document.title, imgs: document.querySelectorAll('img[src="x"]').length })) })()
  out.errors = errors
} finally { await browser.close() }
console.log(JSON.stringify(out, null, 1))
```

### `probe-bidi.mjs` — 번들 방향 제어 — M1(앞 탐침이 쓴 `pb/out` 을 연다)

```js
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { readdirSync } from 'node:fs'
const W = '/Users/jang2162/IdeaProjects/wirebound/.worktrees/feat-comment-tokens'
const { chromium } = await import(`${W}/apps/web/node_modules/playwright-core/index.mjs`)
const dir = join(process.cwd(), 'pb', 'out', 'pages')
const file = readdirSync(dir).find((f) => decodeURIComponent(f).startsWith('회원'))
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1400, height: 600 } })
await page.goto(pathToFileURL(join(dir, file)).href)
await page.click('label.wb-export-tab-comments')
const el = page.locator('[data-wb-marker-for="n_a"] .wb-export-entry-body')
await el.screenshot({ path: join(process.cwd(), 'pb', 'bidi.png') })
// «끝 글» 의 «끝» 이 «글» 의 왼쪽에 서는가 — 글자 노드 둘의 x 로 잰다
const order = await page.evaluate(() => {
  const p = document.querySelector('[data-wb-marker-for="n_a"] .wb-export-entry-body')
  const last = p.lastChild
  const text = last.textContent
  const i = text.indexOf('끝 글')
  const r = (a) => { const range = document.createRange(); range.setStart(last, a); range.setEnd(last, a + 1); return range.getBoundingClientRect().left }
  return { endX: r(i), geulX: r(i + 2) }
})
console.log(JSON.stringify(order))
await browser.close()
```

### `anchor.mjs` — 번들 번호 걷힌 노드 닻 — L4

```js
const W = '/Users/jang2162/IdeaProjects/wirebound/.worktrees/feat-comment-tokens'
const s = await import(`${W}/packages/schema/dist/index.js`)
const e = await import(`${W}/packages/exporter/dist/index.js`)
s.installCatalog()
const L = '11111111-1111-4111-8111-111111111111', D = '22222222-2222-4222-8222-222222222222'
const doc = (kids) => ({ version: 5, root: { id: 'n_root', type: 'Page', children: kids } })
const b = e.exportBundle({ runtimeJs: '', pages: [
  { id: L, title: '목록', pageTitle: '목록', menuPath: ['회원'], document: doc([{ id: 'n_a', type: 'Text', marker: 1, props: { content: 'a' } }]), comments: [{ nodeId: 'n_a', body: `[x](wb:comment/${D}/n_bare)` }] },
  { id: D, title: '상세', pageTitle: '상세', menuPath: ['회원'], document: doc([{ id: 'n_bare', type: 'Button', props: { label: '저장' } }]), comments: [] },
] })
const [lp, dp] = b.pagePaths
const lh = String(b.files.find((f) => f.path === lp).content), dh = String(b.files.find((f) => f.path === dp).content)
console.log(/<p class="wb-export-entry-body">(.*?)<\/p>/s.exec(lh)[1])
console.log('anchor in detail:', dh.includes('id="wb-marker-n_bare"'))
```

### `probe-schema.mjs` — 함수 값 — 파서 왕복 · 방향 제어

```js
const W = '/Users/jang2162/IdeaProjects/wirebound/.worktrees/feat-comment-tokens'
const s = await import(`${W}/packages/schema/dist/index.js`)
const RLO = String.fromCharCode(0x202e)
const P = '11111111-1111-4111-8111-111111111111', Q = '22222222-2222-4222-8222-222222222222'
const ctx = { currentPageId: P, pages: new Map([[P, { title: '회원 목록', menuPath: '회원' }], [Q, { title: `${RLO}상세`, menuPath: '회원' }]]), markers: new Map([[`${Q}/n_a`, { marker: 3, nodeName: '버튼' }]]) }
const cases = {
  plainLinks: '[링크](https://x.y) [a](wb:) [b](wb:page/) 닫히지 [ 않음 wb: 만',
  upperUuid: `[u](wb:page/${Q.toUpperCase()})`,
  bidi: `[x](wb:comment/${Q}/n_a) 끝 글`,
  extraSeg: `[x](wb:page/${Q}/extra)`,
  emptyLabel: `[](wb:page/${Q})`,
  badPct: '[c](wb:code/STATUS/%E0%A4%A)',
}
for (const [k, b] of Object.entries(cases)) console.log(k, JSON.stringify(s.resolveCommentTokens(b, ctx)))
console.log('bidiText', JSON.stringify(s.commentTokenText(cases.bidi, ctx, false)), [...s.commentTokenText(cases.bidi, ctx, false)].map((c) => c.codePointAt(0).toString(16)).filter((h) => h.startsWith('20')))
// round-trip: formatCommentToken → parse 에서 라벨이 같은가 (어려운 라벨)
for (const label of ['a]b', 'a[b', 'a\\', 'a\\]', '(x)', 'x)](wb:page/' + Q + ')', '줄\n바꿈']) {
  const raw = s.formatCommentToken(label, { kind: 'page', pageId: Q })
  const seg = s.parseCommentBody(raw)
  console.log('rt', JSON.stringify(label), JSON.stringify(raw), seg.length, seg[0].type, JSON.stringify(seg[0].label))
}
for (const item of ['A B/C', 'a)b', '100%', '(', '%', ' ', '\\']) {
  const raw = s.formatCommentToken('l', { kind: 'code', group: 'G', item })
  const seg = s.parseCommentBody(raw)
  console.log('code', JSON.stringify(item), raw, seg[0].type, JSON.stringify(seg[0].target))
}
```

### `w2.mjs` — 깨진 본문의 풀린 조각 — M3

```js
const s = await import('/Users/jang2162/IdeaProjects/wirebound/.worktrees/feat-comment-tokens/packages/schema/dist/index.js')
const P = '7ef46553-a40a-4538-9667-34cff2652734'
const body = `[[#1](wb:comment/${P}/n_a)](wb:comment/${P}/n_a) 뒤 글`
const ctx = { currentPageId: P, pages: new Map([[P, { title: '목록', menuPath: '회원' }]]), markers: new Map([[`${P}/n_a`, { marker: 1, nodeName: '목록 글' }]]) }
console.log(JSON.stringify(s.resolveCommentTokens(body, ctx)))
console.log(s.commentTokenText(body, ctx, false))
console.log(s.refreshCommentTokenLabels(body, ctx))
```

### `hq.mts` — `hashQuery` — M3(`apps/api/node_modules/.bin/tsx`)

```ts
const W = '/Users/jang2162/IdeaProjects/wirebound/.worktrees/feat-comment-tokens'
const p = await import(`${W}/apps/web/src/panels/comment-token-picker.tsx`)
const body = '보세요 [#3](wb:comment/11111111-1111-4111-8111-111111111111/n_a) 끝'
console.log(JSON.stringify(p.hashQuery(body, body.indexOf('#3') + 2)))
const plain = '이슈 #12 참고'
console.log(JSON.stringify(p.hashQuery(plain, plain.indexOf('#12') + 3)))
```

### `perf.mts` — 후보 짓기 비용 — L5(`tsx`)

```ts
const W = '/Users/jang2162/IdeaProjects/wirebound/.worktrees/feat-comment-tokens'
const picker = await import(`${W}/apps/web/src/panels/comment-token-picker.tsx`)
const schema = await import(`${W}/packages/schema/dist/index.js`)
const uuid = (i: number) => `${i.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000`
const pages = new Map<string, { title: string; menuPath: string }>()
for (let i = 0; i < 300; i++) pages.set(uuid(i), { title: `페이지 ${i % 150}`, menuPath: `메뉴 ${i % 7} › 하위 ${i % 3}` })
const markers = new Map<string, { marker: number | null; nodeName: string }>()
const index = { pages: [], markers: [] as any[] }
for (let i = 0; i < 1000; i++) {
  const pid = uuid(i % 300)
  markers.set(schema.markerKey(pid, `n_${i}`), { marker: (i % 40) + 1, nodeName: `버튼 «저장 ${i}»` })
  index.markers.push({ pageId: pid, nodeId: `n_${i}`, marker: (i % 40) + 1, nodeName: '', firstComment: `첫 코멘트 내용 ${i} 길게 적은 앞머리 사십 자를 채우려는 글` })
}
const codes = new Map()
for (let g = 0; g < 50; g++) codes.set(`G${g}`, { key: `G${g}`, name: `그룹 ${g}`, items: Array.from({ length: 20 }, (_, j) => ({ value: `V${j}`, name: `항목 ${g}-${j}`, active: true })) })
const ctx = { currentPageId: uuid(0), pages, markers, codes }
const time = (f: () => unknown, n = 20) => { const t0 = performance.now(); for (let i = 0; i < n; i++) f(); return ((performance.now() - t0) / n).toFixed(2) }
const all = picker.tokenCandidates(ctx, index)
console.log('candidates', all.length)
console.log('tokenCandidates ms', time(() => picker.tokenCandidates(ctx, index)))
for (const q of ['', '페', '페이지 1', '저장 99', 'zzz']) console.log('filter', JSON.stringify(q), 'ms', time(() => picker.filterCandidates(all, q), 50), 'hits', picker.filterCandidates(all, q).length)
// 열린 문서 번호 색인 — 노드 2000 개 문서
const doc = { version: 5, root: { id: 'n_root', type: 'Page', children: Array.from({ length: 2000 }, (_, i) => ({ id: `n_x${i}`, type: 'Text', marker: i + 1, props: { content: `글 ${i}` } })) } }
schema.installCatalog()
console.log('buildMarkerIndex 2000 nodes ms', time(() => schema.buildMarkerIndex([{ id: uuid(0), document: doc }], codes), 10))
```

### `apiprobe/probe.config.mts` — api 하네스 스크래치 설정(스크래치에 `node_modules` 심링크)

```ts
import root from '/Users/jang2162/IdeaProjects/wirebound/.worktrees/feat-comment-tokens/vitest.config.ts'
import { defineConfig } from 'vitest/config'
const W = '/Users/jang2162/IdeaProjects/wirebound/.worktrees/feat-comment-tokens'
const S = '/private/tmp/claude-501/-Users-jang2162-IdeaProjects-wirebound--worktrees-feat-comment-tokens/607967d1-cf60-4932-95a8-419ba4a25844/scratchpad/apiprobe'
export default defineConfig({
  root: W,
  resolve: (root as any).resolve,
  esbuild: (root as any).esbuild,
  server: { fs: { allow: [W, S] } },
  test: {
    dir: S,
    include: [`${S}/**/*.probe.test.ts`],
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    testTimeout: 120_000,
    globalSetup: [`${W}/apps/api/test/global-setup.ts`],
    setupFiles: [`${W}/apps/api/test/setup.ts`],
  },
})
```

### `apiprobe/leak.probe.test.ts` — 남의 프로젝트 누수 — 1 절(`pnpm vitest run -c <스크래치>/apiprobe/probe.config.mts`)

```ts
/**
 * RV-TK 탐침 1 — 남의 프로젝트가 새는가. M 은 A 의 editor 이고 B 의 비멤버다. A 의 코멘트에 B 의 페이지 · 번호 · 공통코드를 든 토큰과
 * 같은 꼴의 «없는 id» 토큰을 넣고, M 이 보는 출력마다 B 의 글자 수와 두 끊김의 꼴을 센다.
 */
import { describe, expect, it } from 'vitest'
const W = '/Users/jang2162/IdeaProjects/wirebound/.worktrees/feat-comment-tokens'
const H = await import(`${W}/apps/api/test/helpers.ts`)
const { unzipSync, strFromU8 } = await import(`${W}/apps/web/node_modules/fflate/esm/index.mjs`)
const schema = await import('@wirebound/schema')
const cli = await import(`${W}/packages/cli/src/read/page.ts`)
const pageGet = await import(`${W}/packages/cli/src/commands/page-get.ts`)
const themes = await import('@wirebound/themes')

const SECRET = 'B비밀'
const doc = (nodes: { id: string; label: string }[]) => ({
  version: 5,
  root: { id: 'n_root', type: 'Page', children: nodes.map((n) => ({ id: n.id, type: 'Button', props: { label: n.label } })) },
})

describe('남의 프로젝트 토큰', () => {
  it('출력마다 B 가 안 샌다 · 끊김의 꼴이 없는 id 와 같다', async () => {
    await H.withApi(async (ctx: any) => {
      const inject = (method: string, url: string, who: any, payload?: Record<string, unknown>) =>
        ctx.app.inject({ method, url, ...(who.authorization ? { headers: who } : { cookies: who }), ...(payload === undefined ? {} : { payload }) })
      const ok = async (p: Promise<any>, code = 200) => { const r = await p; expect(r.statusCode, r.body).toBe(code); return r }
      const O = await H.signup(ctx)
      const M = await H.signup(ctx)
      const V = await H.signup(ctx)
      const X = await H.signup(ctx)
      const A = await H.createProject(ctx, O.cookie)
      const B = await H.createProject(ctx, O.cookie)
      await H.addMember(ctx, A.id, M.user.id, 'editor')
      await H.addMember(ctx, A.id, V.user.id, 'viewer')
      const am = await H.createMenuNode(ctx, O.cookie, A.id, { title: '회원' })
      const ap = await H.createPage(ctx, O.cookie, A.id, am.id, { title: 'A목록' })
      await ok(inject('PUT', `/api/projects/${A.id}/pages/${ap.id}/schema`, O.cookie, { schema: doc([{ id: 'n_a', label: '가' }]) }))
      await ok(inject('POST', `/api/projects/${A.id}/codes`, O.cookie, { key: 'ACODE', name: 'A코드' }), 201)
      const bm = await H.createMenuNode(ctx, O.cookie, B.id, { title: `${SECRET}메뉴` })
      const bp = await H.createPage(ctx, O.cookie, B.id, bm.id, { title: `${SECRET}페이지` })
      await ok(inject('PUT', `/api/projects/${B.id}/pages/${bp.id}/schema`, O.cookie, { schema: doc([{ id: 'n_s', label: `${SECRET}노드` }]) }))
      await ok(inject('POST', `/api/projects/${B.id}/pages/${bp.id}/comments`, O.cookie, { nodeId: 'n_s', body: `${SECRET}코멘트` }), 201)
      await ok(inject('POST', `/api/projects/${B.id}/codes`, O.cookie, { key: 'BSECRET', name: `${SECRET}그룹` }), 201)
      await ok(inject('POST', `/api/projects/${B.id}/codes/BSECRET/items`, O.cookie, { value: 'X', name: `${SECRET}항목` }), 201)
      const NONE = '0f0f0f0f-0000-4000-8000-000000000000'
      const t = schema.formatCommentToken
      const pairs: [string, any, any][] = [
        ['page', { kind: 'page', pageId: bp.id }, { kind: 'page', pageId: NONE }],
        ['comment', { kind: 'comment', pageId: bp.id, nodeId: 'n_s' }, { kind: 'comment', pageId: NONE, nodeId: 'n_s' }],
        ['group', { kind: 'code', group: 'BSECRET' }, { kind: 'code', group: 'NOPE' }],
        ['item', { kind: 'code', group: 'BSECRET', item: 'X' }, { kind: 'code', group: 'NOPE', item: 'X' }],
      ]
      const body = pairs.map(([k, b, n]) => `${k}: ${t('Q' + k, b)} | ${t('Q' + k, n)}`).join(' / ') + ` / 산 ${t('옛', { kind: 'page', pageId: ap.id })}`
      await ok(inject('POST', `/api/projects/${A.id}/pages/${ap.id}/comments`, M.cookie, { nodeId: 'n_a', body }), 201)
      const out: Record<string, unknown> = {}
      const count = (s: string) => ({ secret: s.split(SECRET).length - 1, bPage: s.split(bp.id).length - 1 })

      // 1. 색인
      const idx = await ok(inject('GET', `/api/projects/${A.id}/comments/index`, M.cookie))
      out.index = count(idx.body)
      // 2. 번들 zip 전부
      const zip = await ok(inject('GET', `/api/projects/${A.id}/export`, M.cookie))
      const files = unzipSync(new Uint8Array(zip.rawPayload))
      const all = Object.values(files).map((b: any) => strFromU8(b)).join('\n')
      out.bundle = count(all)
      const pageHtml = Object.entries(files).find(([n]) => n.includes('/pages/') && n.includes('A'))
      const entry = /<p class="wb-export-entry-body">(.*?)<\/p>/s.exec(strFromU8(pageHtml![1] as any))?.[1] ?? ''
      out.bundleEntry = entry
      out.bundlePageDataHasRawB = strFromU8(pageHtml![1] as any).includes(bp.id)
      // 3. PPTX
      const pptx = await ok(inject('GET', `/api/projects/${A.id}/export?format=pptx`, M.cookie))
      const xml = Object.values(unzipSync(new Uint8Array(pptx.rawPayload))).map((b: any) => strFromU8(b)).join('\n')
      out.pptx = count(xml)
      out.pptxLine = /comment[^<]*?: Q[^<]*/.exec(xml)?.[0] ?? (xml.match(/page: [^<]*/)?.[0] ?? null)
      // 4. snapshot → CLI page get(사람 · --json) · MCP 같은 길
      const snap = await ok(inject('GET', `/api/projects/${A.id}/snapshot`, M.cookie))
      out.snapshot = count(snap.body)
      const payload = snap.json()
      const found = cli.lookupPage(payload, `${'회원'}/A목록`)
      expect(found.kind).toBe('found')
      const human = pageGet.renderPageView(found.view).join('\n')
      out.cliHuman = count(human)
      out.cliHumanLine = human.split('\n').find((l: string) => l.includes('page:'))
      const json = JSON.stringify(found.view)
      out.cliJson = count(json)
      out.resolved = found.view.comments[0].resolved
      // 5. lint
      schema.installCatalog()
      const plan = themes.snapshotToLintInput(payload)
      const issues = schema.lintDesign(plan.input.project).filter((i: any) => i.rule === 'comment-token-broken' || i.code === 'comment-token-broken' || JSON.stringify(i).includes('comment-token-broken'))
      out.lint = { n: issues.length, sample: issues.map((i: any) => i.message), secret: count(JSON.stringify(issues)) }
      // 6. 색인 라우트의 권한
      const tok = await ok(inject('POST', `/api/projects/${A.id}/tokens`, M.cookie, { name: 't' }), 201)
      const bearer = { authorization: `Bearer ${tok.json().value}` }
      const st = async (who: any, pid: string) => (await inject('GET', `/api/projects/${pid}/comments/index`, who)).statusCode
      out.auth = {
        viewer: await st(V.cookie, A.id),
        stranger: await st(X.cookie, A.id),
        mOnB: await st(M.cookie, B.id),
        token: await st(bearer, A.id),
        tokenOnB: await st(bearer, B.id),
      }
      await ok(inject('PATCH', `/api/projects/${A.id}/members/${M.user.id}`, O.cookie, { role: 'viewer' }))
      ;(out.auth as any).tokenAfterDemote = await st(bearer, A.id)
      await ok(inject('DELETE', `/api/projects/${A.id}/members/${M.user.id}`, O.cookie), 204)
      ;(out.auth as any).tokenAfterRemove = await st(bearer, A.id)
      ;(out.auth as any).cookieAfterRemove = await st(M.cookie, A.id)
      console.log('LEAK-PROBE ' + JSON.stringify(out, null, 1))
    })
  })
})
```

### `webprobe/browser.config.mts` — 실브라우저 스크래치 설정

```ts
import { defineConfig } from 'vitest/config'
import base from '/Users/jang2162/IdeaProjects/wirebound/.worktrees/feat-comment-tokens/vitest.config.ts'
const W = '/Users/jang2162/IdeaProjects/wirebound/.worktrees/feat-comment-tokens'
const S = '/private/tmp/claude-501/-Users-jang2162-IdeaProjects-wirebound--worktrees-feat-comment-tokens/607967d1-cf60-4932-95a8-419ba4a25844/scratchpad/webprobe'
const build = (base.test?.projects as any[]).find((p) => p.test?.name === 'build')
export default defineConfig({
  root: W,
  esbuild: build.esbuild,
  resolve: build.resolve,
  server: { fs: { allow: [W, S] } },
  test: { dir: S, include: [`${S}/**/*.probe.test.ts`], pool: 'forks', fileParallelism: false, testTimeout: 600_000, hookTimeout: 300_000 },
})
```

### `webprobe/web.probe.test.ts` — 웹 실브라우저 — M1 · M3 · L2 · L3 · W5(`pnpm vitest run -c <스크래치>/webprobe/browser.config.mts` — 실은 판은 W5 를 `it.skip` 으로 둔 둘째 판이고 첫 판은 W5 를 돌렸다)

```ts
/**
 * RV-TK 실브라우저 탐침(웹) — W1 방향 제어 · W2 고치는 상자의 기존 토큰 라벨 안 캐럿 + Enter · W3 남의 다른 페이지 재번호 뒤 낡은 번호 · W5 후보가 많은 프로젝트의 입력 지연.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
const E = await import('/Users/jang2162/IdeaProjects/wirebound/.worktrees/feat-comment-tokens/apps/web/build-test/editor-stack.ts')
const 전제 = await E.editorStackPrerequisite()
const RLO = String.fromCharCode(0x202e)
const out: Record<string, unknown> = {}

describe.skipIf(!전제.ok)('rv-tk web', () => {
  let stack: any
  let alice: any
  beforeAll(async () => {
    stack = await E.startEditorStack(전제)
    alice = await stack.login(stack.users.alice)
  })
  afterAll(async () => {
    console.log('WEB-PROBE ' + JSON.stringify(out, null, 1))
    if (stack !== undefined) await stack.close()
  })
  const call = (m: string, p: string, b?: unknown) => stack.request(alice, m, p, b)
  async function seedPage(projectId: string, menuId: string, title: string, nodes: unknown[]): Promise<string> {
    const res = await call('POST', `/projects/${projectId}/pages`, { menuNodeId: menuId, title })
    if (res.status >= 300) throw new Error(`page ${res.status} ${JSON.stringify(res.body)}`)
    const pageId = res.body.id as string
    if (nodes.length > 0) {
      const seeded = await call('PATCH', `/projects/${projectId}/pages/${pageId}/ops`, { baseSeq: 0, ops: nodes.map((value, at) => ({ op: 'add', path: `/root/children/${at}`, value })) })
      if (seeded.status >= 300) throw new Error(`seed ${seeded.status} ${JSON.stringify(seeded.body)}`)
    }
    return pageId
  }
  const post = async (projectId: string, pageId: string, nodeId: string, body: string) => {
    const res = await call('POST', `/projects/${projectId}/pages/${pageId}/comments`, { nodeId, body })
    if (res.status !== 201) throw new Error(`comment ${res.status} ${JSON.stringify(res.body)}`)
    return res.body.comment.id as string
  }

  it('W1 W2 W3', async () => {
    const project = (await call('POST', '/projects', { name: 'rv-tk', slug: `rvtk-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '회원' })).body
    const list = await seedPage(project.id, menu.id, '목록', [{ id: 'n_a', type: 'Text', props: { content: '목록 글' } }])
    const detail = await seedPage(project.id, menu.id, '상세', [
      { id: 'n_top', type: 'Text', props: { content: '위 글' } },
      { id: 'n_form', type: 'Text', props: { content: '상세 글' } },
    ])
    const evil = await seedPage(project.id, menu.id, `<img src=x onerror=alert(1)>"'${RLO}뒤집`, [{ id: 'n_e', type: 'Text', props: { content: 'e' } }])
    await post(project.id, detail, 'n_top', '위')
    await post(project.id, detail, 'n_form', '폼')
    await post(project.id, list, 'n_a', `방향 [x](wb:page/${evil}) 끝 글`)
    await post(project.id, list, 'n_a', `낡음 [x](wb:comment/${detail}/n_form) 끝`)
    const editable = await post(project.id, list, 'n_a', `[#1](wb:comment/${list}/n_a) 뒤 글`)

    const { context, page: tab } = await stack.openTab(stack.users.alice, { viewport: { width: 1600, height: 900 } })
    try {
      tab.on('dialog', (d: any) => { out.dialogs = ((out.dialogs as number) ?? 0) + 1; void d.dismiss() })
      await tab.goto(`/projects/${project.id}/pages/${list}`)
      await E.canvasFrame(tab).locator('[data-wb-id="n_a"]').waitFor()
      await tab.getByRole('tab', { name: '코멘트', exact: true }).click()
      await tab.locator('.wb-shell-comments .wb-shell-comment-body a').first().waitFor()
      // W1: «끝 글» 의 두 글자 x
      out.w1 = await tab.evaluate(() => {
        const p = [...document.querySelectorAll('.wb-shell-comments .wb-shell-comment-body')].find((el) => el.textContent!.startsWith('방향'))!
        const last = p.lastChild as Text
        const i = last.textContent!.indexOf('끝 글')
        const x = (a: number) => { const r = document.createRange(); r.setStart(last, a); r.setEnd(last, a + 1); return r.getBoundingClientRect().left }
        return { text: p.textContent, endX: x(i), geulX: x(i + 2), hasFSI: p.textContent!.includes(String.fromCharCode(0x2068)) }
      })
      // W3: 남이 다른 페이지(상세)의 번호를 지움 → 재번호 — 열린 탭의 «상세 #2» 가 얼마나 남는가
      const linkText = () => tab.evaluate(() => [...document.querySelectorAll('.wb-shell-comments .wb-shell-comment-body')].find((el) => el.textContent!.startsWith('낡음'))?.querySelector('a')?.textContent ?? null)
      out.w3before = await linkText()
      const comments = ((r: any) => (Array.isArray(r) ? r : r.comments))((await call('GET', `/projects/${project.id}/pages/${detail}/comments`)).body) as { id: string; nodeId: string }[]
      const topId = comments.find((c) => c.nodeId === 'n_top')!.id
      const del = await call('DELETE', `/projects/${project.id}/pages/${detail}/comments/${topId}`)
      out.w3delete = del.status
      await tab.waitForTimeout(1500)
      out.w3afterDelete = await linkText()
      const ren = await call('POST', `/projects/${project.id}/pages/${detail}/comments/renumber`, {})
      out.w3renumber = [ren.status, JSON.stringify(ren.body).slice(0, 120)]
      const t0 = Date.now()
      await tab.waitForTimeout(5000)
      out.w3after5s = await linkText()
      out.w3serverIndex = (await call('GET', `/projects/${project.id}/comments/index`)).body.markers.filter((m: any) => m.pageId === detail)
      // 그 사이 누르면 어디로 가나
      await tab.locator('.wb-shell-comments .wb-shell-comment-body a', { hasText: '상세 #' }).click()
      await E.poll('상세로', async () => new URL(tab.url()).pathname, (p: string) => p.endsWith(detail))
      await E.canvasFrame(tab).locator('[data-wb-id="n_form"]').waitFor()
      await tab.waitForTimeout(800)
      out.w3selected = await tab.evaluate(() => document.querySelector('.wb-shell-region[aria-label="구조 트리"] .wb-shell-structure-node[aria-current="true"]')?.closest('[data-tree-row]')?.getAttribute('data-tree-id') ?? null)
      out.w3ms = Date.now() - t0

      // W2: 고치는 상자 — 기존 토큰 라벨 «#1» 뒤에 캐럿을 두고 Enter(줄바꿈 뜻)
      await tab.goto(`/projects/${project.id}/pages/${list}`)
      await E.canvasFrame(tab).locator('[data-wb-id="n_a"]').waitFor()
      await tab.getByRole('tab', { name: '코멘트', exact: true }).click()
      const row = tab.locator('.wb-shell-comment', { hasText: '뒤 글' })
      await row.getByRole('button', { name: '수정' }).click()
      const box = tab.locator(`#wb-comment-edit-${editable}`)
      await box.waitFor()
      const raw = await box.inputValue()
      await box.click()
      await tab.keyboard.press('Home')
      await tab.keyboard.press('Meta+ArrowUp')
      for (let i = 0; i < raw.indexOf('#1') + 2; i++) await tab.keyboard.press('ArrowRight')
      await tab.waitForTimeout(300)
      out.w2caret = await box.evaluate((el: HTMLTextAreaElement) => el.selectionStart)
      out.w2listOpen = await tab.locator('[role="listbox"][aria-label="넣을 토큰"]').count()
      out.w2hints = await tab.locator('[role="listbox"][aria-label="넣을 토큰"] [role="option"] .wb-shell-comment-picker-hint').allTextContents()
      out.w2options = await tab.locator('[role="listbox"][aria-label="넣을 토큰"] [role="option"] .wb-shell-comment-picker-label').allTextContents()
      await tab.keyboard.press('Enter')
      await tab.waitForTimeout(300)
      out.w2before = raw
      out.imgs = await tab.evaluate(() => document.querySelectorAll('img[src="x"]').length)
      out.w2after = await box.inputValue()
    } finally {
      await context.close()
    }
  })

  it.skip('W5 후보가 많은 프로젝트', async () => {
    const project = (await call('POST', '/projects', { name: 'rv-tk 큰', slug: `rvtkbig-${Date.now().toString(36)}` })).body
    const menu = (await call('POST', `/projects/${project.id}/menu`, { parentId: null, title: '큰' })).body
    const nodes = Array.from({ length: 10 }, (_, i) => ({ id: `n_${i}`, type: 'Text', props: { content: `글 ${i}` } }))
    const ids: string[] = []
    const t0 = Date.now()
    for (let p = 0; p < 300; p++) ids.push(await seedPage(project.id, menu.id, `페이지 ${p}`, p < 100 ? nodes : []))
    // 번호 1000 개 — 페이지 100 × 노드 10
    for (let p = 0; p < 100; p++) for (let n = 0; n < 10; n++) await post(project.id, ids[p]!, `n_${n}`, `코멘트 ${p}-${n} 앞머리를 길게 적은 첫 코멘트 글입니다`)
    out.w5seedMs = Date.now() - t0
    const it0 = Date.now()
    const idx = await call('GET', `/projects/${project.id}/comments/index`)
    out.w5indexMs = Date.now() - it0
    out.w5indexBytes = JSON.stringify(idx.body).length
    const { context, page: tab } = await stack.openTab(stack.users.alice, { viewport: { width: 1600, height: 900 } })
    try {
      await tab.goto(`/projects/${project.id}/pages/${ids[0]}`)
      await E.canvasFrame(tab).locator('[data-wb-id="n_0"]').waitFor()
      await tab.getByRole('tab', { name: '코멘트', exact: true }).click()
      const box = tab.getByLabel('새 코멘트', { exact: true })
      await E.poll('상자', () => box.isEnabled(), Boolean)
      await tab.evaluate(() => {
        ;(window as any).__ev = []
        new PerformanceObserver((list) => { for (const e of list.getEntries() as any[]) (window as any).__ev.push([e.name, Math.round(e.duration), Math.round(e.processingEnd - e.processingStart)]) }).observe({ type: 'event', durationThreshold: 16, buffered: false } as any)
      })
      await box.click()
      const k0 = Date.now()
      await tab.keyboard.type('#페이지 29', { delay: 30 })
      await tab.locator('[role="listbox"][aria-label="넣을 토큰"] [role="option"]').first().waitFor()
      out.w5typeMs = Date.now() - k0
      out.w5options = await tab.locator('[role="listbox"][aria-label="넣을 토큰"] [role="option"]').count()
      await tab.waitForTimeout(500)
      out.w5events = await tab.evaluate(() => (window as any).__ev)
    } finally {
      await context.close()
    }
  })
})
```

### `mut.py` — 변조 실행기 — 7 절(스펙 JSON 은 `{name, edits:[{file, find, replace}], cmd}`)

```python
#!/usr/bin/env python3
"""변조 하나: 파일 · 찾을 글 · 바꿀 글 · 돌릴 명령. 백업은 경로 전체 이름 · 끝에 바이트 비교 복원."""
import json, os, shutil, subprocess, sys, filecmp, time
W = '/Users/jang2162/IdeaProjects/wirebound/.worktrees/feat-comment-tokens'
S = os.path.dirname(os.path.abspath(__file__))
spec = json.load(open(sys.argv[1]))
name = spec['name']
edits = spec['edits']  # [{file, find, replace}]
backups = {}
try:
    for e in edits:
        path = os.path.join(W, e['file'])
        src = open(path, encoding='utf-8').read()
        n = src.count(e['find'])
        if n != 1:
            print(f"{name} 안 돎: 맞은 수 {n} ({e['file']})", flush=True)
            raise SystemExit(3)
        if path not in backups:
            b = os.path.join(S, 'backups', path.replace('/', '__'))
            os.makedirs(os.path.dirname(b), exist_ok=True)
            shutil.copyfile(path, b)
            backups[path] = b
        open(path, 'w', encoding='utf-8').write(src.replace(e['find'], e['replace']))
    out = os.path.join(S, f'mut-{name}.json')
    log = os.path.join(S, f'mut-{name}.log')
    cmd = spec['cmd'] + ['--reporter=default', '--reporter=json', f'--outputFile.json={out}']
    t0 = time.time()
    rc = subprocess.call(cmd, cwd=W, stdout=open(log, 'w'), stderr=subprocess.STDOUT)
    r = json.load(open(out)) if os.path.exists(out) else {}
    failed = [(t['fullName'], (t.get('failureMessages') or [''])[0][:300]) for f in r.get('testResults', []) for t in f['assertionResults'] if t['status'] == 'failed']
    passed = sum(1 for f in r.get('testResults', []) for t in f['assertionResults'] if t['status'] == 'passed')
    print(json.dumps({'name': name, 'rc': rc, 'secs': round(time.time() - t0), 'passed': passed, 'failed': len(failed), 'dead': failed}, ensure_ascii=False, indent=1), flush=True)
finally:
    for path, b in backups.items():
        shutil.copyfile(b, path)
        assert filecmp.cmp(path, b, shallow=False), path
    print(f'{name} 복원 {len(backups)} 파일 · 바이트 같음', flush=True)
```
