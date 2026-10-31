# FX-AC(RV-AC 리뷰 대응) 보고

브리프 `.worktrees/.coord/brief-fx-ac.md` — RV-AC 보고(`2026-10-31-rv-ac-report.md`)의 **M1 만** 고친다. L1 은 이월. 머리 `46775c88` 에서 시작했다.
node v24.21.0 · 자기 DB `0.0.0.0:5512`. 같은 워크트리의 앞 터미널 둘(ac · rv-ac)은 멈춰 있었고 파일을 바꾸지 않았다(`git status` 깨끗에서 시작).

## 바꾼 것

- **`apps/api/src/http/log-mask.ts`(새 파일)** — 가림 함수 `maskLinkTokens` 하나와 그것을 부르는 pino 시리얼라이저 셋.
  - `serializeRequest` — Fastify 기본 `req` 시리얼라이저(`fastify/lib/logger-pino.js`)와 **같은 칸**(method · url · version · host ·
    remoteAddress · remotePort)만 내고 `url` 만 가린다. `headers` · 본문을 안 싣는 성질(`logging.test.ts` 셋이 기대는 것)은 그대로다.
  - `serializeError` — pino `stdSerializers.err` 위에 `message` · `stack` 만 가린다.
  - `msg` 시리얼라이저로 `maskLinkTokens` 를 그대로 건다 — 문장 칸.
- **`apps/api/src/app.ts` 의 `buildLoggerOptions`** — `serializers: { req, err, msg }` 를 더했다. `censor` 는 같은 상수(`LOG_MASK`)를 쓴다.
  머리말의 «기본 `req` 시리얼라이저» 문장을 `serializeRequest` 로 고쳤다.
- **`apps/api/test/rv-ac-link-exposure.test.ts`** — M1 의 `describe.skip` 을 뗐고 케이스 넷을 더했다(아래 «잰 값» 3). 머리말을 지금 참인
  것으로 고쳤다. L1 의 `describe.skip` 은 그대로 두고 그 위에 «이월(2026-10-31 사내 공용 운영 — 가입 성공 수 한도)» 주석을 달았다.
- **`apps/api/README.md`** «계정 — 초대 · 비활성화 · 재설정 · 기록» 에 «링크 원문은 api 로그에도 안 남는다» 한 줄.
- 경로 꼴(API 계약)은 안 바꿨다.

## 결정과 이유

1. **가림 규칙은 «`/auth/` + `invites|resets` + `/` 뒤 꼬리 전부» 다** — 원문 한 조각만이 아니라 `/signup` · 쿼리까지 가린다. 원문은
   base64url 이라 `/` 가 없지만, `%2F` 로 나뉘어 들어온 판에서도 조각이 안 남게 했다. 잃는 것은 `/signup` 뿐이고 메서드가 그 둘을 가른다
   (GET 은 확인, POST 는 가입 — `POST /api/auth/invites/:token` 라우트는 없다). 대소문자 · 겹친 빗금(`/API//Auth/Invites/…`)도 받는다 — 라우터는
   404 로 끝내지만 원문은 진짜 링크일 수 있다.
2. **퍼센트 인코딩을 풀고 견준다** — 잰 값(스크래치 탐침 · Fastify 5.11.2): `GET /api/auth/%69nvites/AbC` 는 **200** · `params.token` 이 `AbC`,
   `GET /api/auth/invites/A%62C` 도 200 · `AbC`. 풀지 않고 글자로 견주면 그 판의 원문이 남는다. 가린 경우만 푼 글자에서 가린 값을 내고,
   링크가 아닌 경로는 받은 글자 그대로 둔다(케이스 «링크가 아닌 경로는 …»).
3. **문장 칸은 `hooks.logMethod` 가 아니라 `serializers.msg` 로 덮는다** — 처음엔 `logMethod` 로 글자 인자를 가렸는데 `FST_ERR_REP_ALREADY_SENT`
   줄에서 원문 1 개가 남았다(잰 값). pino 는 문장 없이 오류만 실은 줄에 오류 문장을 `msg` 로 옮겨 적고(`pino/lib/proto.js` 의 `write`),
   그 글자는 로그 메서드의 인자가 아니다. `msg` 시리얼라이저는 `%s` 를 채운 뒤의 글자와 그 옮긴 문장을 다 받는다(`pino/lib/tools.js` 의
   `asJson`).
4. **`version` 칸을 남겼다** — 리뷰 보고의 «기본의 칸» 목록(method · url · host · remoteAddress · remotePort)에 `version` 이 빠져 있지만 Fastify
   기본 시리얼라이저에는 있다(`accept-version` 헤더 하나). 기본과 칸을 같게 두는 것이 «redact 는 방어선» 전제를 안 바꾸는 쪽이다.
5. **원문이 로그에 닿는 자리 셈** — 아래 «잰 값» 2.

## 잰 값

### 1. 고치기 전 빨강

M1 의 `describe.skip` 만 뗀 판(`pnpm vitest run --project api apps/api/test/rv-ac-link-exposure.test.ts`): «초대 링크 원문이 로그에 없다» —
`expected 2 to be +0`, «재설정 링크 원문이 로그에 없다» — `expected 1 to be +0`. **리뷰가 적은 값과 같다.** 고친 뒤 둘 다 초록.

### 2. 원문이 로그에 닿는 자리

- **앱 코드:** `git grep -nE '\blog\.(info|warn|error|debug|trace|fatal|child)\b|logger\.(info|warn|error|debug)' -- apps/api/src` 0 줄.
  `request.log.*` 는 `http/error-handler.ts` 의 둘(`DbConnectionLostError` · 처리되지 않은 예외) — 둘 다 오류 객체만 싣는다(`req` 없음).
  `console.*` 은 CLI(`db/*` · `auth/unlock-login.ts`) · 기동(`main.ts`) · DB 풀 오류(`db/client.ts`) · 방송(`ws/broadcast.ts` — 연결 id) —
  요청 경로 · `params` 를 싣는 곳 0.
- **Fastify 5.11.2 가 경로를 싣는 자리**(`fastify/lib/*.js` 의 `log.*` 호출을 셌다):
  - `{ req: request }` — «incoming request»(`route.js` · `four-oh-four.js` 의 404 판) · 기본 오류 처리기의 5xx(`log-controller.js`
    `defaultErrorLog` — 이 앱은 `setErrorHandler` 로 갈아 끼웠지만 처리기가 던지면 돈다) · `writeHeadError` → **`req` 시리얼라이저**.
  - `FST_ERR_REP_ALREADY_SENT(url, method)` 를 `{ err }` 로(`reply.js` 의 `send`) → **`err` 시리얼라이저 + `msg`**(pino 가 오류 문장을 옮겨 적음).
  - 글자에 `raw.url` 을 넣는 경고(`reply.js` 의 `safeWriteHead` «Reply was already sent …») · 기본 404 처리기의 `Route …:<url> not found`
    (이 앱은 `setNotFoundHandler` 로 갈아 끼워 안 찍는다) → **`msg`**.
- 셋 다 `maskLinkTokens` 하나를 지난다.

### 3. 새 케이스(`rv-ac-link-exposure.test.ts` 의 M1 블록)

| 케이스 | 재는 것 · 카나리아 |
|---|---|
| «요청 줄은 남고 `url` 만 가린다 …» | 요청 줄이 `GET /api/auth/invites/[REDACTED]` · `POST /api/auth/invites/[REDACTED]` · `GET /api/auth/resets/[REDACTED]` 로 남고, `POST /api/admin/invites` · `/api/admin/users/<uuid>/reset-links` 는 그대로. 요청 줄의 칸은 기본의 여섯 안 |
| «못 쓰는 링크(404) · 400 · 429 · 500 과 인코딩 · 대소문자를 바꾼 경로 …» | 다 쓴 한 번짜리 초대 404 · 본문이 틀린 가입 400 · 못 쓰는 재설정 11 번째 429 · `%69nvites` 200 · `/API//Auth/Invites` 404 · 끝 빗금 404 · `password_resets` 이름을 바꾼 뒤 500(«처리되지 않은 예외» 줄이 선다). 원문 넷이 로그에 0. 가린 요청 줄 18(= `perAccount` + 8) |
| «Fastify 의 오류 문장 · 문장 칸 …» | `buildLoggerOptions` 만 실은 Fastify 에서 답을 두 번 보낸 라우트(`FST_ERR_REP_ALREADY_SENT`) · `log.warn('경로 %s', …)` · 경로를 인용한 경고 글. 원문 0 · 세 줄이 가린 꼴로 선다 |
| «링크가 아닌 경로는 받은 글자 그대로다» | `/api/projects/%EA%B0%80?q=%2F` · `/api/admin/invites/<uuid>/revoke` · `/api/auth/login` · `/api/auth/invites` 가 그대로 |

500 은 «저장소를 끊는» 프록시(`pg-fault-proxy.ts`) 판이 503(`DbConnectionLostError`)으로 가서, 테스트 트랜잭션 안에서 표 이름을 바꿔 서버가
답한 오류로 세웠다(`withApi` 가 롤백한다).

## 혼자 죽는 변조

백업은 경로 전체 이름 · 복원은 바이트 비교(`filecmp`) · 찾는 글자의 맞은 수가 1 이 아니면 안 돌림 · 변조마다 `rv-ac-link-exposure.test.ts` +
`logging.test.ts` 만(실행 10 · 건너뜀 1 — L1). node v24.21.0. 실패 값은 json 보고서의 첫 줄.

| id | 바꾼 자리 | 값으로 죽은 케이스(실패 값) |
|---|---|---|
| V1 | `maskLinkTokens` 의 가림 한 줄(`decoded.replace(LINK_PATH, …)` → `decoded`) | 원래 M1 둘(`2` · `1` ≠ `0`) · «요청 줄» · «갈래»(원문 `2` ≠ `0`) · «Fastify 문장»(가린 꼴이 없다) — 다섯 |
| V2 | 이스케이프 풀기를 뗌 | «갈래» **혼자**(`1` ≠ `0` — `%69nvites` 판) |
| V3 | `serializeRequest` 가 `url` 을 그대로 | V1 과 같은 다섯 |
| V4 | `msg` 시리얼라이저를 항등으로 | «Fastify 문장» **혼자**(가린 꼴의 경고 줄이 없다) |
| V5 | `err` 시리얼라이저를 `stdSerializers.err` 로 | «Fastify 문장» **혼자**(`2` ≠ `0` — 오류의 `message` · `stack`) |
| V6 | 링크가 없어도 푼 글자를 냄 | «링크가 아닌 경로» **혼자**(`'/api/projects/가?q=/'`) |
| V7 | 요청 줄에 `headers` 칸을 더함 | «요청 줄» **혼자**(`[ 'headers' ]` ≠ `[]`) |

- 원래 M1 둘은 늘 함께 죽는다(같은 앱 판 · 다른 링크) — 축의 주인은 «갈래»(V2 로 혼자 죽는다)다. `logging.test.ts` 셋은 어느 변조에서도 안
  죽었다(V7 의 `headers` 칸은 쿠키 · 인증 헤더가 `redact` 에 가려진다 — 그 파일 머리말의 «방어선»).
- V2 의 첫 판은 «갈래» 가 원문 단언이 아니라 가린 줄 수 카나리아(`17` ≠ `18`)로 먼저 죽었다 — 원문 단언을 앞으로 옮겨 다시 쟀다(위 표).

## 게이트

(아래에 채운다)

## 남은 것

- **L1(가입 성공 수 한도)** — 이월. `describe.skip('L1 — …')` 위 주석.
- 앞단 프록시의 접근 로그 · 링크 화면 주소의 `Referer` 는 이 저장소 밖이라 안 쟀다(리뷰 보고 «못 잰 것» 그대로).
- 웹 경로(`/invite/<원문>` · `/reset/<원문>`)는 api 가 아니라 정적 입구가 낸다 — 입구 Caddy 는 접근 로그를 안 켠다(`docker/web/Caddyfile` 에
  `log` 0 줄).

## 지침

(아래에 채운다)
