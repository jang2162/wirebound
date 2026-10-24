# RV-CI-B 보고 — 자리표시자 · 그림 올리기(CI-B) 리뷰

대상: `feat/placeholder` HEAD `7736372a`(B1 `e12a139d` · B2 `df118fe0` · 구현 보고 `2026-10-24-ci-b-report.md`). CI-A 는 안 합친 판 그대로 쟀다. 브리프 `brief-rv-ci-b.md` · 공통 규칙 `common-w8.md`. 리뷰는 고치지 않고 쟀다.

탐침은 스크래치(테스트 글롭 밖)에 두고 api 하네스로 돌렸다 — 스크래치 vitest 설정의 `root` 가 이 워크트리, `globalSetup` · `setupFiles` 가 api 프로젝트의 것(AGENTS.md «스크래치 탐침을 테스트 글롭에 안 넣고 api 하네스로 돌리려면»). node v24.21.0 · DB 5502.

## 높은 무게

브리프의 높은 무게 여섯(남의 그림을 읽음 · 권한 우회 · 한도 우회 · 데이터를 잃음 · 그림 안의 스크립트가 에디터 origin 에서 돔 · 남의 화면) 가운데 **요청자 혼자 서는 판은 0** 이다(아래 «잰 값» 1 – 7). 하나가 **다른 사람의 붙여넣기를 거치면** 선다:

### H1 — 붙여넣기 봉투의 출처를 클립보드 글이 정한다: 해시를 아는 사람이 두 프로젝트에 다 든 사람의 손으로 그림을 옮기게 한다(조건부)

- **어디** — `apps/web/src/shell/editor-keys.tsx` 250 – 252: 붙이기가 `inspectNodesEnvelope(text)` 의 `source.projectId` 를 그대로 출처로 삼아, 지금 프로젝트와 다르고 노드가 그림을 들면 `claimNodeImages` → `POST <지금 프로젝트>/assets/claim { from: { projectId: <글에 적힌 id> } }` 를 부른다. 봉투는 OS 클립보드의 `text/plain` 글이라(`packages/schema/src/clipboard.ts` 머리말) 누구나 짓는다. 가져오기는 성공하면 말이 없다(못 가져온 것만 통지 — `edit/claim-images.ts` 의 `blank`). 글로 지은 봉투가 가져오기를 부르는 것은 `apps/web/test/edit/paste-images.test.tsx` 가 이미 그 꼴(`clip(writeNodesEnvelope(…, source))`)로 잰다.
- **재현 값**(`inject` · 스크래치 `deputy.probe.ts`): P 의 owner 가 R(mallory 의 프로젝트)의 editor. mallory 는 P 의 옛 viewer(빠짐 — 해시를 안다). mallory 가 지은 글 `{"wirebound":"nodes","version":3,"source":{"projectId":"<P>"},"nodes":[{…"Placeholder","props":{"image":"<X>"}}]}` 은 `inspectNodesEnvelope` 가 `kind: ok · source: { projectId: P }` 로 읽는다. owner 가 R 에 붙이면 웹이 부르는 가져오기와 같은 요청 → `claimed: [X]` · 그 뒤 mallory 의 `GET R/assets/X` **404 → 200 · 바이트 같음**.
- **조건** — ① 해시 X 와 P 의 id 를 안다(옛 멤버 · 페이지 JSON 을 받은 사람 — JSON 은 해시를 싣는다) ② 피해자가 P 의 멤버이고 R 의 editor 다 ③ 피해자가 그 글을 R 의 캔버스 · 트리에 붙인다. 피해자는 P 의 그림을 R 로 옮길 권한이 원래 있다 — 막힌 것은 «피해자가 그 일을 한다는 것을 모른다» 다.
- **고칠 방향(재지 않았다 — 대응 트랙 몫)** — 가) 봉투의 출처를 이 브라우저가 낸 복사에서만 믿는다(복사 때 `sessionStorage` 에 봉투의 표지를 적고, 붙일 때 맞을 때만 가져온다 — 아니면 «출처 없는 봉투» 와 같이 다룬다) 나) 출처가 다른 프로젝트면 가져오기 전에 «<프로젝트 이름>에서 그림 N 개를 가져옵니다» 를 묻는다. 가)는 다른 탭 · 다른 창의 정상 복사(같은 브라우저)를 지키고 바깥 글을 끊는다. 고친 판을 재는 판: 이 재현 + 같은 브라우저의 다른 탭에서 낸 정상 복사 · 붙이기.

### 그 밖(중간 · 낮음)

| # | 무게 | 무엇 | 값 |
| --- | --- | --- | --- |
| M1 | 중간 | **개인 몫 한도 자물쇠를 잠그는 케이스가 없다** — `repos/assets.ts` `addPersonalAsset` 의 `quotaLock(trx, 'personal', …)` 을 뗀 변조에 그림 · 권한 케이스 6 파일 480 개가 다 초록이다. 지금 소스는 맞다 — 스크래치 탐침 R2(두 출처에서 겹친 개인 몫 가져오기 · 줄 2 를 본 뒤 놓음)가 고친 소스 `claimed 하나 · quota 하나 · 쓴 1500/2000`, 변조 `claimed 둘 · 3000/2000` 이다. 프로젝트 쪽은 `assets-race.test.ts` 가 잠근다(아래 6 의 N4) | 아래 «잰 값» 3 · 6 |
| L1 | 낮음 | **모듈 두 표(개인 · 프로젝트)는 노드 props 를 카탈로그로 검증하지 않고 저장한다** — 꼴 밖의 색(`expression(…)` · `#2563eb;…` 류) · 길이 · 그림 id 가 201. 이 브랜치가 안 바꾼 원래 길(`routes/modules.ts` 의 `ModuleBody`)이다. 렌더러가 검증을 못 지난 노드를 폴백으로 그려(`render.tsx` 499 – 508) 테마 뷰에 안 닿고, 넣기는 편집이라 422 다 — 그 모듈은 못 쓰는 모듈로 남는다(REST · MCP 로 지은 판만) | «잰 값» 5 |
| L2 | 낮음 | 한도 문장이 한도를 0.05 MB 밑으로 둔 판(env)에서 «그림은 0 MB 까지 … (이 파일 0 MB)» 다 — `megabytes` 가 소수 한 자리라. 기본값(5 · 200 · 100 MB)에서는 맞다 | «잰 값» 3 |
| L3 | 낮음 | **올리기 본문을 가드보다 먼저 읽는다** — 로그아웃 · 없는 프로젝트에도 파일 한도를 넘는 본문은 413(길이 머리 1001 → 413 · chunked 1001 → 413), 한도 밑이면 401. 본문 파서가 `preHandler` 가드 앞이다. 테마 업로드(`admin-themes.ts` 의 `zipOnly`)와 같은 꼴 — 413 은 한도 말고는 아무것도 안 알린다. 로그인 없이 5 MB 까지 받아 버퍼에 싣는다 | «잰 값» 3 |
| L4 | 정보 | 빠진 멤버가 빠지기 전에 개인 몫으로 가져간 그림은 남는다(설계 — 그때 읽을 수 있었다). 빠진 뒤의 가져오기는 둘 다 `not-readable` | «잰 값» 2 · B6 |

## 잰 값

### 1. 그림 읽기 — 입구 × 요청자

판: P(owner · viewer) 가 그림 X(PNG 74 바이트)를 올렸다. Q 의 owner(P 비멤버)가 **Q 페이지 문서 · 자기 개인 모듈 · Q 프로젝트 모듈에 X 의 해시를 적었다**(PUT 200 · 개인 모듈 201 · 프로젝트 모듈 201 — 적는 것은 막지 않는다). `inject` · 같은 판. «바이트» 는 응답 몸에 X 의 바이트가 들었는가, «zip» 은 번들 zip 의 어느 파일에 X 의 바이트가 들었는가.

| 입구 | P viewer | P owner | Q owner | 로그아웃 | P 토큰 | Q 토큰 |
| --- | --- | --- | --- | --- | --- | --- |
| `GET P/assets/X` | 200 · 바이트 | 200 · 바이트 | 404(82) | 401 | 200 · 바이트 | 404(82) |
| `GET Q/assets/X`(Q 문서에 해시) | 404(82) | 404(82) | 404(76) | 401 | 404(82) | 404(76) |
| `GET me/assets/X` | 404(76) | 404(76) | 404(76) | 401 | 401 | 401 |
| `GET P/assets`(목록) | 200 · X 있음 | 200 · X 있음 | 404 | 401 | 200 · X 있음 | 404 |
| `GET Q/assets`(목록) | 404 | 404 | 200 · X 없음 | 401 | 404 | 200 · X 없음 |
| `GET P/export`(zip) | 200 · zip 에 X | 200 · zip 에 X | 404 | 401 | 200 · zip 에 X | 404 |
| `GET Q/export`(zip · 문서에 X) | 404 | 404 | 200 · **zip 에 X 없음** | 401 | 404 | 200 · zip 에 X 없음 |
| `HEAD P/assets/X` | 200 · 몸 0 · 머리 같음 | 〃 | 404 | 401 | 200 | 404 |

- 404 의 몸 길이 82 는 가드의 «프로젝트 없음», 76 은 «그림을 찾을 수 없습니다» 다 — Q owner 가 Q 에서 X 를 물으면 «없는 해시» 와 같은 76 이다(해시가 남의 프로젝트에 있는지 안 샌다).
- `HEAD` 응답 머리(200): `content-type: image/png` · `content-security-policy: default-src 'none'; style-src 'unsafe-inline'; sandbox` · `x-content-type-options: nosniff` · `cross-origin-resource-policy: same-origin` · `content-disposition: inline; filename="image.png"; filename*=UTF-8''image.png`.
- 페이지 · 스냅샷 · 모듈 · 개인 모듈 응답은 해시(글자)만 싣고 바이트를 안 싣는다 — 바이트를 내는 서버 입구는 위 넷(`GET …/assets/:id` · `GET me/assets/:id` · 번들 zip · 번들을 찍는 PPTX)뿐이다(`git grep` — `readProjectAsset` · `readPersonalAsset` · `readProjectAssetsForBundle` 의 호출 자리가 라우트 둘 · `readExportImages` 하나). PPTX 는 같은 `readExportRows` 를 지난다. MCP · CLI 는 그림 도구가 없고 REST 를 부른다 — 같은 가드다.

### 2. 가져오기(claim) — 남의 해시를 내 문서 · 개인 모듈에 적은 판

Q owner(P 비멤버)가 X 의 해시를 Q 문서에 적은 뒤:

| 판 | 응답 |
| --- | --- |
| B1 `POST Q/assets/claim` from P(비멤버) | 200 `failed: [X not-readable]` |
| B2 `POST Q/assets/claim` from 개인(개인 행 없음) | 200 `not-readable` |
| B3 `POST me/assets/claim` from P(비멤버) | 200 `not-readable` |
| B4 `POST me/assets/claim` from Q(문서에만 해시) | 200 `not-readable` |
| B5 Q 토큰으로 `Q/assets/claim` | 403 `forbidden`(«API 토큰으로는 …») |
| B6 P viewer 로 넣었다가 뺀 뒤(`DELETE …/members` 204) from P — 프로젝트로 · 개인으로 | 둘 다 `not-readable` |
| B7 `Q/assets/claim` from Q 자기 | 200 `not-readable` |
| B9 대문자 id | 400 `bad-request` |
| 끝 — `GET Q/assets/X` · `GET me/assets/X` | 404 · 404(바이트 없음) · Q 소유 행 0 · 개인 행 0 |

### 3. 한도

판(`inject` · 한도 env 를 줄인 설정 — 프로젝트 1000 · 사람 1000 · 파일 1000 바이트):

| 판 | 응답 |
| --- | --- |
| P(이미 600) ← Q 의 [b 401 · c 400] 가져오기 | `claimed: [c]` · `failed: [b quota]` — 앞의 것이 넘으면 그것만 `quota`, 뒤의 것은 든다 · P 쓴 용량 1000(= 한도) |
| 개인 ← Q [b · c](801) 다음 개인 ← P [a 600] | 앞 `claimed` 둘 · 뒤 `quota` |
| 파일 1001 바이트 올리기 | 413 `too-large` · 문장 «그림은 0 MB 까지 올릴 수 있습니다(이 파일 0 MB)» — 아래 L2 |

### 4. 지우기

P 의 그림 X 를 R(같은 owner 의 다른 프로젝트)이 가져오고 · P viewer(다른 사람)가 개인 몫으로 가져오고 · Q 는 해시만 적은 뒤 P 를 지웠다(204):

| 뒤 | 값 |
| --- | --- |
| `GET R/assets/X` | 200 · 바이트 같음 |
| `GET me/assets/X`(개인) | 200 · 바이트 같음 |
| `GET Q/assets/X`(해시만 — 지우기 전에도 404) | 404 |
| R 도 지운 뒤 개인 | 200 · 덩이 1 |
| 사람(행)을 지운 뒤 | 덩이 0 |

«지우기 때문에 다른 몫의 그림이 깨지는 판» 은 가져오기(소유 행)를 지난 것에서는 0 이다. 깨지는 것은 처음부터 소유 행이 없던 문서(해시만 적힘 — 출처 없는 붙여넣기 · 페이지 JSON 가져오기)이고, 그것은 지우기 전에도 404 다.

### 5. 그리기 값 · 그림 id — 쓰기 입구마다

| 값 | `PUT …/schema` | `POST /api/me/modules` | `POST …/modules` |
| --- | --- | --- | --- |
| `background: expression(alert(1))` · `#2563eb\n` · `' #2563eb'` · `'#2563eb '` · `#ｆｆｆｆｆｆ` · `#2563eb/*` · `\23 2563eb` · `borderColor: #2563eb!important` · `color: inherit` · `color: 12` | 422 | **201** | **201** |
| `width: 2001` · `width: 19` · `radius: -1` · `padding: 1.5` · `fontSize: '12px'` | 422 | **201** | **201** |
| `image`: 대문자 64 자 · 63 자 · `../…` · `imageFit: fill` · `border: dotted` | 422 | **201** | **201** |

모듈 두 표는 노드 props 를 카탈로그로 검증하지 않고 저장한다(이 브랜치가 안 바꾼 `routes/modules.ts` 의 `ModuleBody` — 원래 있던 길). 그 값이 테마 뷰에 닿는지: 렌더러가 노드마다 `def.props.safeParse` 를 지나지 못하면 폴백을 그린다(`packages/renderer/src/render.tsx` 499 – 508) — 뷰는 꼴 밖 값을 못 받는다. 넣기는 편집(ops)이라 422 다. 아래 L1.

### 6. SVG — 실 Chromium(headless · playwright-core 1.62 의 chromium-1234)

`withRealApi`(실 포트) 위에 에디터 origin 을 흉내 낸 같은 origin 의 빈 페이지(`/probe/host`)를 얹고, 그 페이지에서 그림 주소를 연다. 스크립트가 놓는 것: 전역 표지(`window.__wbSvgRan` · `top.__wbSvgTop`) · 127.0.0.1 의 리스너로 `fetch` · `Image` · `sendBeacon`. 꼴 넷:

- S1 스크립트 · `onload` 든 SVG — **이름 `photo.png` · `Content-Type: image/png`** 으로 올림 → 201 · `mime: image/svg+xml`(바이트로 가른다)
- S2 접두어 뿌리 `<html:svg xmlns:html="…xhtml">` 안의 `html:script`(«svg 안의 html») → 201 · `image/svg+xml`
- S3 `foreignObject` 안의 XHTML `script` · `iframe` · `<image href>`
- S4 스크립트 없이 바깥 자원만(`@import` · `fill:url()` · `<image href>`)

| 꼴 | `<img>` | `<iframe>` | `<object>` | `<embed>` | `window.open` | 직접 열기(`goto`) | 카나리아 직접 열기 | 카나리아 `<iframe>` |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| S1 | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 | **2 · 6 연결** | **표지 2(top 까지 2) · 6 연결** |
| S2 | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 | 1 · 4 | 1 · 4 |
| S3 | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 | 1 · 5 | 1 · 5 |
| S4 | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 0 | 0 · 3 | 0 · 3 |

칸은 «전역 표지 · 리스너 연결 수». 카나리아는 같은 바이트를 같은 origin 의 다른 주소에서 `image/svg+xml` 로만(격리 머리 없이) 낸 판이다 — 그 판에서는 스크립트가 돌고 같은 origin 의 `top` 에까지 쓴다(격리 머리가 막는 것이 그것이다). 직접 연 응답의 머리는 위 1 의 `HEAD` 와 같다. 테마가 `useAsset` 주소를 `<iframe>` · `<object>` · `<embed>` 로 그려도 그림 응답의 CSP 가 그 문서에 걸려 돈 판이 0 이다.

### 3 덧. 한도 — 겹친 판 · 실 HTTP

겹친 판만 센다 — 테스트 트랜잭션이 프로젝트 행을 `FOR UPDATE` 로 쥐고, 두 요청이 그 백엔드에 줄 선 것(`pg_blocking_pids` · 2)을 본 뒤 놓는다. 소유 행 삽입의 커밋을 `pg_sleep(0.5)` 제약 트리거로 늦춰 창을 넓혔다(`assets-race.test.ts` 와 같은 꼴 · `withRealApi`).

| 판 | 한도 | 줄 | 고친 소스 | 변조(자물쇠를 뗌) |
| --- | --- | --- | --- | --- |
| R1 올리기(1500) + 가져오기(1500) 가 같은 프로젝트로 | 프로젝트 2000 | 2 | 올리기 201 · 가져오기 `quota` · 쓴 1500 | (재지 않음 — 같은 자물쇠 · 아래 N4) |
| R2 개인 몫 가져오기 둘(1500 · 1500)이 다른 출처에서 | 사람 2000 | 2 | 하나 `claimed` · 하나 `quota` · 쓴 1500 | **둘 다 `claimed` · 쓴 3000** |

실 포트로 낸 파일 한도(1000 바이트 설정): 길이 머리 1000 → 201 · 1001 → 413 · chunked 1000 → 201 · chunked 1001 → 413 · 길이 머리를 900 으로 줄여 1001 을 보냄 → 400(Node 파서 · 행 0) · 로그아웃 999 → 401 · 로그아웃 1001 → 413(또는 연결 끊김 `ECONNRESET`) · 로그아웃 · 없는 프로젝트 1001 → 413. 소유 행은 201 둘만.

### 7. 그리기 값 — 캔버스 · 번들 · PPTX(실 Chromium · editor-stack · 기본테마 `system-admin`)

한 페이지에 자리표시자 다섯(정한 값 전부 · 점선 + 테두리 색 · 테두리 없음 + 바탕 · 기본 · 몸통에 `Text` 둘 + 글 색 · 바탕). 캔버스는 1440×900 탭의 iframe, 번들은 `file://` 로 연 페이지에서 `getComputedStyle`.

| 노드 | 캔버스 = 번들 | 값 |
| --- | --- | --- |
| 정한 값 전부 | **같다**(16 속성 · 상자 · 라벨) | 바탕 `rgb(18, 52, 86)` · 테두리 `rgb(171, 0, 0)` `solid` 1px · 모서리 12px · 글 `rgb(0, 170, 17)` 18px · 여백 24px · 300×140 · `justify-content: flex-end` · 라벨 글 색 · 크기 같음 |
| 점선 · 테두리 없음 · 기본 · 몸통 | 그리기 값은 같다 — 다른 것은 **너비뿐**(캔버스 문서 폭 1280 · 번들 뷰어 칸 744)과 그에 따른 몸통 자식의 자리 | 점선 `dashed` + `rgb(171, 0, 0)` · 없음 `none` 0px + 바탕 · 기본 바탕 `rgb(248, 250, 252)` `dashed` `rgb(148, 163, 184)` · 몸통: 라벨 없음 · 자식 둘이 같은 `y`(가로 줄) · 자식 `Text` 글 색 `rgb(0, 170, 17)`(물려받음) |
| PPTX 화면(1440×1104 한 장) | — | 바탕 `#123456` 화소 507,569 · 테두리 `#ab0000` 6,645 · 몸통 바탕 `#fedcba` 143,788 — 셋 다 있다(PPTX 는 번들 페이지를 찍는다) |

### 8. 몸통 구역 — 다른 구역과 같은 규칙인가

`Placeholder` 의 몸통은 다른 그릇과 같은 선언(`zones: [{ name: 'body', … }]` — `Card` · `Section` 등과 같은 꼴)이고, 잠금 · 고르기 · 그림 걷기는 `childLists` 로 일반화돼 있다. 판정 함수로 잰 값(대조군 `Card`):

| 판 | 자리표시자 | `Card`(대조) |
| --- | --- | --- |
| 남이 그 노드를 잠금 · 몸통에 넣기 | 부딪침(그 노드) | 부딪침 |
| 남이 몸통 자식을 잠금 · 그 노드를 지움 | 부딪침(자식) | 부딪침 |
| 남이 몸통 자식을 잠금 · 밖으로 옮김 | 부딪침(자식) | — |
| 남이 몸통 자식을 잠금 · 그 노드를 고름 | 부딪침(자식) | — |
| 남이 몸통 자식을 잠금 · 그 노드의 props 를 고침 | 안 부딪침(자식 밖) | — |
| 몸통 안 자리표시자의 그림 — `imageIdsIn` · `clearImages` | 찾음 · 비운 수 1 | — |

끌기 · 붙여넣기 · 모듈 저장은 같은 `childLists` · `edit/ops.ts` 의 몸통 길(`children`)을 지난다 — 따로 잰 판은 없다(실브라우저 끌기 판 없음 — «남은 것»).

## 혼자 죽는 변조 — 구현 보고에서 둘을 다시

복원은 경로 이름 백업(`apps__api__src__repos__assets.ts`) · `cmp` 바이트 비교. 끝에 `git status` 는 이 보고 하나.

| 변조 | 자리 | 돌린 것 | 구현 보고의 값 | 다시 잰 값 |
| --- | --- | --- | --- | --- |
| N1 읽기가 프로젝트를 안 가린다(`readProjectAsset` 의 `project_id` 조건을 뗌 · 맞은 수 1) | `repos/assets.ts` | `assets.test.ts -t 채널마다`(1 실행 · 1 실패 · 16 건너뜀) | Q 멤버 · Q 토큰이 해시로 200 | **같다** — `otherOnQ` · `qTokenOnQ` 가 `404 · same: false` → `200 · same: true` |
| N4 한도 자물쇠를 뗀다(`addProjectAsset` 의 `quotaLock` · 맞은 수 1) | 〃 | `assets-race.test.ts` 세 번(각 1 · 1) | 세 번 다 `[201, 201]` | **같다** — 세 번 다 `[201, 201]`(`[201, 409]` 이어야) |
| (더함) 개인 몫 자물쇠를 뗀다 | 〃 `addPersonalAsset` | 그림 · 권한 6 파일(480 실행) · 스크래치 R2 | — | 6 파일 480 통과(잡는 케이스 없음 — M1) · R2 둘 다 `claimed` · 3000 |

## 게이트

이 리뷰가 더한 커밋은 이 보고(문서) 하나다 — `README.md` 「트랙 게이트」 «문서 · 주석만» 줄: `pnpm typecheck` + 그 글을 읽는 케이스. `docs/superpowers/plans` 를 이름으로 드는 테스트 15 파일은 주석에서 가리킬 뿐 디스크에서 읽지 않는다(`readFileSync` · `readdirSync` 0) — 읽는 케이스 0. 탐침은 전량이 아니라 스크래치 판이라 슬롯을 잡지 않았다.

- 탐침 실행 수(전부 node v24.21.0 · 건너뜀 0): 서버 5 · SVG 1(판 32) · 경주 3(+ R3 다시 1 · R2 변조 1) · 잠금 1 · 대리 1 · 그리기(실브라우저) 1. 변조 N1 1 실행(16 건너뜀 — `-t`) · N4 3 × 1 · 개인 몫 자물쇠 480.
- `pnpm typecheck` — rc 0(`tsc --build --force` 전량 · 08:08).
- 잠듦 — `pmset -g log` 의 마지막 ` Sleep ` 줄은 2026-10-23 20:49 — 탐침 · 변조 시각(2026-10-24 05:53 – 08:08)과 안 겹친다.

## 남은 것

- **H1 은 대응 트랙 몫** — 고칠 방향 가) · 나) 가운데 고르는 것은 코디네이터 · 사용자 판단이다(가)는 사람에게 묻는 것이 없고 나)는 묻는 상자가 는다).
- **M1** — 개인 몫 겹친 가져오기 케이스(`assets-race.test.ts` 에 R2 꼴)를 대응 트랙이 세운다.
- **재지 않은 것** — 그림 칸의 «올리는 사이 남이 잠금 · 지움»(구현 보고와 같음 · 서버 잠금 검사가 2차로 막는다) · 몸통 안 끌기의 실브라우저 판 · 스타터 테마의 캔버스 판(구현 보고의 `shots` 가 잰다) · 붙여넣기 대리 판의 실브라우저(웹 길은 jsdom 케이스와 소스 줄로, 서버 길은 값으로 쟀다).
- CI-A 병합 뒤 다시 재는 것은 구현 보고 «남은 것» 첫 줄 그대로.

## 지침

1. **비어 있던 것** — `.ruler/30-delegation.md` 「보안 경계를 반증하는 브리프는 «우회 기법을 찾아라» 가 아니라 «채널마다 소켓 수를 재라» 로 쓴다」 절. 입구 × 요청자 표는 요청자 **한 사람**의 판만 잰다 — 이번 H1 은 표의 모든 칸이 맞는데 «남이 지은 글을 다른 사람이 붙인다» 에서 섰다. **넣을 문장**: «입구 × 요청자 표에 더해 **남이 지을 수 있는 입력이 권한 있는 사람의 요청을 부르는 자리**(클립보드 봉투의 출처 · 주소의 쿼리 · 가져온 파일의 필드)를 센다 — 그 자리는 요청자가 피해자라 표의 모든 칸이 맞아도 선다(`docs/superpowers/plans/2026-10-24-rv-ci-b-report.md` H1).»
2. **틀린 것(재확인)** — 구현 보고 지침 1 과 같은 자리: `.ruler/20-verification.md` 「「통과」를 보기 전에 몇 개가 실행됐는지 확인한다 — 덧붙임」 의 zsh 항목. `T=("${(@f)$(git grep -l …)}")` 배열로 `pnpm vitest run "${T[@]}"` 를 친 명령도 에이전트 셸의 안전 검사가 «rm 을 읽을 수 없다» 로 거절했다(명령에 `rm` 이 없었다 · `git add` 만이 아니다). **넣을 문장**(구현 보고 지침 1 의 문장을 넓혀): «줄바꿈 목록을 명령에 넘길 때는 `"${(@f)…}"` 배열 확장을 명령 줄에 쓰지 말고 목록을 스크래치 파일에 쓴 뒤 그 파일을 읽는 스크립트 파일로 부른다 — 배열 확장이 든 명령 줄은 에이전트 셸의 안전 검사가 못 읽어 거절한다(`git add` · `pnpm vitest run` 둘 다).»
