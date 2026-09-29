# A5 리뷰 대응 보고 — K1 ~ K3

브랜치 `feat/code-themes-a5`. 리뷰 `2026-09-29-a5-review.md` 의 4a(높음) · 5(높음) · 3b(낮음)를 고쳤다. 이 문서는 발행 시점의 기록이다
(`docs/guideline/base/04-citation.md` 「이력 문서는 연대기 금지의 예외다」).

시작 때 이 워크트리에 붙은 다른 터미널 둘(구현자 · 리뷰어)은 유휴였다(`orca terminal list`). 실브라우저는 playwright-core 캐시의
헤드리스 셸(`SCREEN_CHROMIUM_PATH` 없음), DB 는 이 워크트리의 5445. 변조는 전부 경로 전체 이름 백업 → 글자 치환(맞은 수 1 확인) → 실행 →
백업으로 복원 → `cmp`(매번 `identical: True`). 탐침 스크립트는 스크래치(`…/scratchpad/fx-a5/`)에만 두었고, 픽셀 비교 탐침 두 파일은
저장소에 잠깐 두었다가 지웠다(게이트 전).

| 커밋 | 무엇 |
|---|---|
| `0a6b768a` | K1 — `page.evaluate` 전부를 한도 안에(`withinLimit`) |
| `d093cb57` | K2 — 소켓 채널을 브라우저 겹(주) · 페이지 겹(보조)으로 막음 |
| `fdc07dc4` | K3 — 대소문자 · NFC 만 다른 `.wbtheme` 항목 거절 |

---

## K1 — `data-wb-failed` 읽기에 한도가 없다

**재현(고치기 전):** 리뷰 케이스 「준비 뒤 data-wb-failed 읽기가 멈추면 …」 → `expected 'hung' to be 'returned'`(8s 가드). 리뷰 값 그대로.

**호출마다 한도를 받는지 — 값으로 잰 표.** 스크래치 탐침(`timeout-probe.mjs`): 컨텍스트 `setDefaultTimeout(1000)` · 그 호출을 붙잡는
페이지 · 6s 가드.

| 호출 | 붙잡는 법 | 결과 |
|---|---|---|
| `page.evaluate` | 끝나지 않는 Promise | **hung** 6002ms |
| `page.evaluate` | `getAttribute('data-wb-failed')` 를 thenable 로 덮음 | **hung** 6006ms |
| `page.waitForFunction` | `'false'` | TimeoutError 1008ms |
| `page.waitForSelector` | 없는 셀렉터 | TimeoutError 1009ms |
| `locator.getAttribute` | 없는 셀렉터 | TimeoutError 1007ms |
| `page.goto` | 응답을 영영 안 줌 | TimeoutError 1006ms |
| `page.setContent({ waitUntil: 'load' })` | 답 안 하는 `<img>` | TimeoutError 1004ms |
| `page.screenshot` | `document.fonts.ready.then` 을 덮음 | 돌아옴 33ms |
| `context.addInitScript` · `newPage` | — | 돌아옴 26ms |
| `context.close` | 떠 있는 `evaluate` 가 있어도 | 닫힘 ≤ 6ms |

**렌더러의 호출 자리**(`renderOne` · `renderAll` · `probeKoreanGlyphs`):

| 자리 | 호출 | 한도 |
|---|---|---|
| `renderOne` | `goto` · `waitForSelector` · `screenshot` | 옵션 `left()` — 원래 있었다 |
| `renderOne` | `measure` 의 `evaluate` ×2 | `Promise.race` — 원래 있었다(이제 `withinLimit`) |
| `renderOne` | **`data-wb-failed` 의 `evaluate`** | **없었다 → `withinLimit(…, left())`, 마감이면 `notReady`** |
| `probeKoreanGlyphs` | `setContent` | 컨텍스트 기본 한도(값으로 던짐 확인) |
| `probeKoreanGlyphs` | **`KOREAN_GLYPH_PROBE` 의 `evaluate`** | **없었다 → `withinLimit(…, timeoutMs)`, 마감이면 «못 물었다»** |
| `renderAll` | `renderOne` 들의 `Promise.all` | 각 장이 한도 안이면 한도 안 |
| 어디에도 | `waitForFunction` · `locator` | 쓰는 자리 0 |

**고침:** `withinLimit(pending, ms)` 하나 — `evaluate` 전부를 감싼다(`measure` 도 그것을 쓴다). 두부 물음이 마감이면
`한글 글꼴을 확인하지 못했습니다: <ms>ms 안에 답이 없습니다`(배치 전체의 «못 물었다» — `fontWarning` 은 안 세운다).

**새 케이스:** 「두부 물음이 답하지 않으면 한도 안에 «못 물었다»로 돌아온다」 — 물음 페이지는 테마 코드를 안 싣으므로 `Page.prototype.evaluate`
를 감싸 `KOREAN_GLYPH_PROBE` 호출만 붙잡는다(붙잡은 수 1 을 값으로 단언).

**변조:**

| 변조 | 죽은 케이스 · 값 | 산 케이스 |
|---|---|---|
| `data-wb-failed` 읽기의 감싸기를 뗌 | 리뷰 케이스 `expected 'hung' to be 'returned'` | 두부 물음 |
| 두부 물음의 감싸기를 뗌 | 두부 물음 `expected 'guard' to deeply equal [ … ]` | 리뷰 케이스 |

**브리프와 달라진 것:** 없음(두부 물음은 «빠진 것이 있으면 함께 감싼다»에 해당 — 테마 코드를 안 싣는 페이지라 무게는 낮다).

---

## K2 — 테마 코드가 바깥으로 소켓을 연다

**재현(고치기 전):** 리뷰 케이스 「테마 코드의 WebSocket · WebRTC 는 …」 → `expected { tcp: 2, udp: 1 } to deeply equal { tcp: 0, udp: 0 }`.
리뷰 값 그대로.

### 먼저 잰 것(스크래치 탐침 — `egress-probe.mjs` · `dns-probe.mjs` · `v6.mjs` · `wt-check*.mjs`)

1. **리뷰가 못 본 채널 하나 더 — 공유 워커(SharedWorker)의 요청은 `context.route` 가 전혀 못 본다.** fetch · EventSource 까지 리스너에 닿았다.
   전용 워커의 fetch 는 가로채기가 끊었다.
2. **WebTransport 는 루프백 리스너로는 못 잰다.** 가짜 origin(공개 주소 공간)에서 127.0.0.1 로 가는 WebTransport 를 Chromium 의 Local Network
   Access 검사가 스스로 막았다(`ERR_BLOCKED_BY_LOCAL_NETWORK_ACCESS_CHECKS` · UDP 0). 운영의 대상은 공인 주소라 그 검사가 안 선다. 그래서 판에
   `--disable-features=LocalNetworkAccessChecks` 를 더해 루프백이 공인 주소를 대신하게 했다 — 끄자 WebTransport 가 UDP 로 나갔다.
3. **판 격자**(LNA 끔 · 채널 7 × 자리 5 × 주소 꼴 2 에서 겹 없이 소켓이 열리는 37 칸) — 인자 · 겹 조합마다 열린 칸 수:

| 조합 | 열린 칸 | 남은 것 |
|---|---|---|
| 겹 없음 | 37 | — |
| 페이지 겹만 | 10 | 워커 · 공유 워커의 칸 전부 |
| 프록시만 | 12 | WebRTC UDP(STUN · TURN-UDP) — IP · 이름 |
| WebRTC 정책(`--force-…=disable_non_proxied_udp`)만 | 25 | |
| 이름 풀이 막기(`MAP * ~NOTFOUND`)만 | 6 | WebRTC UDP 의 IP 리터럴 |
| `--disable-quic` 만 | **37** | 아무것도 안 막음(WebTransport 도 그대로) |
| 프록시 + `--webrtc-ip-handling-policy=…` | **12** | 이 인자는 아무것도 안 막음 |
| 프록시 + `--force-webrtc-ip-handling-policy` (값 없이) | 12 | 값이 있어야 선다 |
| 프록시 + WebRTC 정책 | 0 | |
| WebRTC 정책 + 이름 풀이 막기 | 0 | 프록시 없이도 0 |
| 브라우저 인자 넷 | 0 | |
| 브라우저 인자 넷 + 페이지 겹 | 0 | |

   - 프록시 주소를 `http://127.0.0.1:9`(닫힌 포트) 대신 풀리지 않는 이름(`.invalid`)으로 둬도 같다 — 프록시가 실패해도 곧장 나가지 않는다.
   - 페이지 겹은 about:blank · blob · srcdoc · data iframe · blob 창의 문서에서도 섰다(겹 없이 27 칸 → 페이지 겹만 0).
   - IPv6 리터럴(`[::1]`)도 이름 풀이 막기에 걸린다(그것만이면 STUN 만 남음).
   - **DNS 질의(NetLog 의 `HOST_RESOLVER_*`)**: 겹 없이 `ws` · `wt` · `sharedws` · `sharedfetch` · `workerws` · `turn` 이름을 풀었다.
     프록시 + WebRTC 정책이어도 공유 워커의 fetch 이름을 풀려 들었다(`MANAGER_REQUEST` — 3/3 같음). 이름 풀이 막기를 더하면 0.

### 고침

- **브라우저 겹(주) — `NO_EGRESS_ARGS`:** `--proxy-server=http://no-egress.wirebound.invalid:9` · `--proxy-bypass-list=<-loopback>` ·
  `--force-webrtc-ip-handling-policy=disable_non_proxied_udp` · `--host-resolver-rules=MAP * ~NOTFOUND`.
- **페이지 겹(보조) — `NO_SOCKETS_INIT`:** 움직임 끄기 옆 초기화 스크립트가 `WebSocket` · `WebTransport` · `RTCPeerConnection` ·
  `webkitRTCPeerConnection` · `EventSource` 를 `configurable: false` 로 `undefined` 에 묶는다. 번들 런타임 · 시스템 테마 · kit 템플릿 ·
  픽스처에 이 다섯을 쓰는 자리 0(`git grep`).
- `screen-render-chromium.ts` 머리말 「바깥으로 나가는 요청을 막는다」에 막는 셋과 각각이 못 보는 길의 표. spec(`2026-09-27-code-themes-design.md`
  「PPTX」) · `apps/api/README.md` «바깥 요청» · 최상위 README 「알아 둘 것」을 같은 뜻으로 고쳤다.

### 새 케이스(`apps/api/build-test/screen-sandbox-review.test.ts` — 「테마 코드의 소켓」)

**판 도구:** 렌더러를 그대로 부르되 `chromium.launch` 를 감싸 인자를 걷고(`strip`), `BrowserContext.addInitScript` 를 감싸 페이지 겹을 안
싣는다(`dropPageLayer`). 걷은 수를 값으로 단언한다. LNA 끔을 늘 더하고, 가짜 origin 을 연 컨텍스트는 닫기 전에 2.5s 기다린다(늦은 TURN 이
닫힘에 잘리지 않게). 두 겹이 문서에서 겹치므로 **소스를 안 바꾸고 한 겹 · 한 인자씩 걷은 판을 따로 돌린다** — 그래야 겹마다 혼자 죽는 판이 있다.

| 케이스 | 기대 |
|---|---|
| 격자 — 온전 | 0 칸 |
| 격자 — 페이지 겹 없이 | 0 |
| 격자 — 페이지 겹 · 프록시 없이 | 0 |
| 격자 — 페이지 겹 · 이름 풀이 막기 없이 | 0 |
| 격자 — 브라우저 겹 없이 | **워커 · 공유 워커의 10 칸만** |
| 격자 — 겹 없음(카나리아) | **37 칸 전부** · 가로채기가 끊은 주소에 격자 포트 0 |
| 페이지 겹 — 온전 | 문서 · about:blank iframe · 창에 생성자 0(테마가 `data-wb-failed` 로 알림) |
| 페이지 겹 — 페이지 겹 없이(카나리아) | 세 자리 × 다섯 이름 15 개가 알려짐 |
| NetLog — 온전 | 테마가 고른 이름의 풀이 사건 0 |
| NetLog — 겹 없음(카나리아) | `sharedfetch` · `sharedws` · `workerws` · `ws` 포함 |

격자 칸: 문서 셋(최상위 · about:blank iframe · `window.open` 창) × {ws · STUN · TURN-TCP · TURN-UDP}(IP · 이름) + WebTransport(IP) = 27,
전용 워커 {ws}(IP · 이름) + WebTransport(IP) = 3, 공유 워커 {ws · EventSource · fetch}(IP · 이름) + WebTransport(IP) = 7. 뺀 것: 문서 · 전용
워커의 fetch · EventSource(가로채기가 끊는다 — 「일곱 길」), 워커의 RTCPeerConnection(없다), 이름으로 된 WebTransport(겹 없이도 안 나감).

### 변조(겹마다 · 인자마다 — `screen-render-chromium.ts` 에서 그 인자를 `--wb-off-*` 로 바꿔 자리를 지킴)

| 변조 | 값으로 죽은 케이스 | 걷은 수로 죽은 케이스(판 카나리아) |
|---|---|---|
| 페이지 겹을 뗌 | 격자 «브라우저 겹 없이» — 37 칸(기대 10) · 페이지 겹 «온전» — 15 이름 | 격자 넷(«페이지 겹 없이» 등) — `dropped: 0`(기대 1) |
| `--proxy-server` 를 뗌 | 격자 «페이지 겹 · 이름 풀이 막기 없이» — 25 칸 | — |
| `--proxy-bypass-list=<-loopback>` 를 뗌 | 격자 «페이지 겹 · 이름 풀이 막기 없이» — 25 칸 | — |
| WebRTC 정책을 뗌 | 격자 «페이지 겹 없이» 6 칸 · «… 프록시 없이» 6 칸 · «… 이름 풀이 막기 없이» 12 칸(전부 STUN · TURN-UDP) | — |
| 이름 풀이 막기를 뗌 | 격자 «페이지 겹 · 프록시 없이» — 25 칸 · NetLog «온전» — `['sharedfetch']` | — |
| 브라우저 겹 전부를 뗌(`args: []`) | 격자 «온전» — 워커 10 칸 · «페이지 겹 없이» — 37 칸 · NetLog «온전» — 3 이름 | 격자 넷 — `stripped: 0` |
| 두 겹을 다 뗌 | 위 전부 + **리뷰 케이스 `{ tcp: 2, udp: 1 }`** | 격자 다섯 |
| (참고) 가로채기의 `abort` → `continue` | 「일곱 길」 — 끊은 주소 `[]`(기대 17) · 서버 적중은 여전히 `[]` | — |

- **겹마다 혼자 죽는 판이 있다** — 브라우저 겹만 막는 판(워커 칸)과, 페이지 겹만 재는 판(생성자 알림)이 따로 선다. 다만 **소켓을 막는 데서는
  브라우저 겹만으로 37 칸 전부가 0** 이다 — 페이지 겹이 혼자 막는 소켓 칸은 없다. 그래서 머리말에 «브라우저 겹이 주 · 페이지 겹은 보조»로 적었다
  (브라우저 겹이 Chromium 의 인자 해석에 기대므로, 판이 바뀌어 인자가 조용히 무시되어도 문서의 채널은 막힌다).
- **리뷰 케이스는 두 겹을 다 떼야 죽는다**(격자의 부분집합) — 케이스 머리말이 격자를 가리킨다. 남겼다(리뷰가 세운 판 그대로).
- 「일곱 길」 머리말의 «`route.continue()` 판에서 서버에 닿은 것은 팝업 둘뿐»에 «브라우저 겹이 선 뒤로는 0»을 더했다(위 참고 변조가 값).

**정상 테마의 화면:** K1 커밋의 렌더러 사본과 K2 렌더러로 같은 잡(system-admin · 샘플 테마 · 테마 없음)을 그려 견줬다 — 세 장 모두 **PNG 바이트가
같다**(1440×1136 · 1440×1146 · 1440×1146). 가짜 origin(`route.fulfill`)은 프록시 · 이름 풀이 막기와 무관하게 선다(모든 판에서 `ok`).

### 브리프와 달라진 것

- **`--disable-quic` 을 안 실었다** — 혼자 37 칸 그대로(WebTransport 도 안 막음), 넷에 더해도 바뀌는 것 0. 재는 것이 없는 장치라 뺐다.
- **WebRTC 인자는 `--force-webrtc-ip-handling-policy=disable_non_proxied_udp` 하나** — `--webrtc-ip-handling-policy=…` 는 이 셸에서 아무것도 안
  막았다(프록시와 함께여도 12 칸), `--force-…` 는 값이 있어야 섰다.
- **«닫힌 포트»가 아니라 풀리지 않는 이름**(`no-egress.wirebound.invalid:9`) — 포트를 고르면 그 포트에 누가 들을 때 그것이 프록시가 된다.
- **playwright 의 `proxy` 옵션 대신 날 인자** — playwright 는 환경 변수 `PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK` 가 있으면
  `<-loopback>` 을 안 붙인다(그러면 루프백 — api · DB — 가 곧장 나간다).
- **프록시와 이름 풀이 막기가 겹친다** — `MAP * ~NOTFOUND` 가 IP 리터럴(v4 · v6)의 연결까지 막아, 소켓만 보면 둘 중 하나로 충분하다. 둘 다 남기고,
  한쪽씩 걷은 판을 따로 세워 각자의 하중을 잰다(위 표). 이름 풀이 막기만의 하중은 DNS 질의(NetLog)다.
- **브리프가 더하라고 한 판 가운데 WebTransport 의 이름 꼴은 격자에 없다** — 겹 없이도 소켓이 안 열려(카나리아가 못 세움) 재는 척이 된다.
- **판에 `--disable-features=LocalNetworkAccessChecks` 를 더한다**(위 «먼저 잰 것» 2) — 안 끄면 WebTransport 칸은 겹 없이도 0 이다.

---

## K3 — 대소문자 · NFC 만 다른 자산 이름

**재현(고치기 전):** 새 케이스 셋(`packages/themes/test/wbtheme.test.ts`) — `assets/Case.png` · `assets/case.png`, `assets/Img/a.png` ·
`assets/img/a.png`, NFC · NFD `assets/한글.png` — 전부 `readWbtheme` 가 받았다(`expected { Object (manifest, themeJs, ...) } to be null`).

**고침:** `readWbtheme` 가 파일 항목마다 «접은 이름»(`normalize('NFC').toLowerCase()`)을 세고, 먼저 온 것과 같으면 둘째를 `bad-path`
(`대소문자나 유니코드 정규화만 다른 항목이 있습니다(<앞 이름>)`)로 거절한다 — 같은 경로가 둘인 항목과 같은 코드. 디렉터리 항목은 접지 않는다
(같은 디렉터리로 풀릴 뿐 덮지 않는다). spec 「업로드 검증」의 2 에 한 문장.

**kit:** `packages/theme-kit/src/build.ts` 의 `assetFileNames` 가 `assets/[name]-[hash][extname]` 라 이름에 내용 해시가 붙고, `buildTheme` 이
자기 산출물을 `readWbtheme` 로 다시 읽는다 — 대소문자만 다른 원본 둘이 **바이트까지 같을 때만** 같은 해시로 겹칠 수 있고, 그 판은 이제
`BuildError` 로 빌드가 멈춘다(내보내지 않는다).

**변조:**

| 변조 | 죽은 케이스(값 — `files` 가 null 이 아님) |
|---|---|
| NFC 를 뗌 | NFC · NFD 만 다름(혼자) |
| 소문자를 뗌 | 대소문자만 다름 · 디렉터리의 대소문자만 다름 |
| 마지막 조각만 접음 | 디렉터리의 대소문자만 다름(혼자) |
| 디렉터리 부분만 접음 | 대소문자만 다름(혼자) |
| 검사를 뗌 | 셋 다 |

**브리프와 달라진 것:** 없음.

---

## 게이트

K3 커밋(`fdc07dc4`) 위에서 차례로 돌렸다(겹쳐 돌리지 않음). 수는 실행 · 건너뜀 · 실패.

| 게이트 | 결과 |
|---|---|
| `pnpm build` | 종료 0 |
| `pnpm typecheck` | 종료 0 |
| `pnpm test`(DB 5445) | 파일 364 · **6254 통과 · 1 건너뜀 · 0 실패** |
| `pnpm test:build` | 파일 36 · **215 통과 · 1 건너뜀 · 0 실패**(건너뜀은 `packages/theme-kit/build-test/template.test.ts` 의 하나 — 이 작업 전과 같은 자리) |
| `pnpm test:browser` | 파일 24 · **89 통과 · 0 건너뜀 · 0 실패** |
| `EDITOR_STACK_BUNDLE=build pnpm test:browser` | 파일 24 · **89 통과 · 0 건너뜀 · 0 실패** |

리뷰 빨강 둘(`screen-sandbox-review.test.ts` 의 «data-wb-failed» · «WebSocket · WebRTC»)은 초록 — 그 파일은 이제 케이스 13 개(리뷰 둘 + K1 하나 +
K2 열)다.

## 정리 확인

- 띄운 것: 탐침 · 케이스가 띄운 Chromium 은 전부 `finally` 에서 닫았다. 서버 · 컨테이너를 새로 띄우지 않았다(DB 는 이 워크트리의 5445 그대로).
- 변조: 전부 `cmp` 복원 `identical: True`. 끝의 `git status` 깨끗 · `git diff --stat` 빈 판.

## 지침 보고

코디네이터가 병합 때 넣는다(워커는 `CLAUDE.md` 를 안 건드렸다). 제안 — `CLAUDE.md` 「검증」의 «목 · 계측은 불린 수를 값으로 확인하고 …» 절 끝:

> **playwright 의 `context.route` 는 WebSocket · WebRTC(STUN · TURN) · WebTransport · 공유 워커의 요청을 못 본다** — 브라우저에서 남의 코드를
> 돌리며 바깥을 막을 때는 브라우저의 네트워크 층(띄우는 인자)에서 막고, 채널마다 다른 루프백 포트로 소켓이 열리는지 센다. **루프백 리스너는
> 공개 origin 에서 오는 WebTransport 를 못 받는다** — Chromium 의 Local Network Access 검사가 먼저 막아 겹 없이도 0 이다. 판에서는
> `--disable-features=LocalNetworkAccessChecks` 로 끄고, 겹 없는 판을 카나리아로 둔다. **겹치는 막음 둘은 한쪽씩 걷은 판으로 따로 잰다** —
> 온전한 판만 재면 어느 한쪽을 떼도 초록이다(`apps/api/build-test/screen-sandbox-review.test.ts` 의 판 도구).

그리고 spec `2026-09-27-code-themes-design.md` 「이 설계가 다루지 않는 것」의 «테마 코드의 보안 격리(샌드박스). 신뢰 경계를 «관리자만 업로드»로
세웠다.»는 그대로 두었다 — 이번 막음은 테마 코드를 격리하는 것이 아니라 **서버가 테마가 고른 주소로 연결을 여는 것**을 막는 것이다. 읽는 사람이 둘을
헷갈릴 수 있으면 그 줄 끝에 «(서버의 그리기 브라우저가 바깥으로 나가지 않는 것은 다룬다 — 「PPTX」)»를 붙이는 것을 제안한다.
