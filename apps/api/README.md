# @wirebound/api

Fastify 5 기반 REST + WebSocket 서버. 설계서 편집을 지원하는 백엔드다.

필요한 것: Docker, Node ≥ 22.18, pnpm(까닭은 최상위 README 「필요한 것」 절).

## 기동 절차

**저장소를 세우는 순서는 최상위 [`README.md`](../../README.md)에 있다** — Postgres·설치·
빌드·`.env`·마이그레이션까지 한 자리다. **여기 두 벌로 적지 않는다.** 이 문서가 소유하는
것은 **이 서버의 계약**(아래 *"API 개요"* 이하)이고, 아래 두 절은 그 계약에 붙는
서버만의 사정이다.

```bash
pnpm --filter @wirebound/api dev            # tsx watch 로 띄운다
pnpm --filter @wirebound/api migrate        # 마이그레이션 최신화 + 계정 시딩 (아래)
pnpm --filter @wirebound/api migrate:down   # 가장 최근 것 하나만 내린다 (반복하면 0까지)
pnpm --filter @wirebound/api reset-password <이메일>   # 비밀번호를 바꾼다 — 터미널에서 숨겨 묻는다 (최상위 README 「비밀번호를 잊었다」)
```

### `migrate` 가 계정도 만든다 — **가입 라우트가 없기 때문이다**

`migrate` 는 마이그레이션을 **다 올린 뒤** `SEED_USER_EMAIL`·`SEED_USER_PASSWORD` 가
있으면 계정 하나를 만든다. **이것이 이 저장소에서 계정이 생기는 유일한 경로다**(값 셋의
설명은 `.env.example` 이 소유한다 — 여기 두 벌로 적지 않는다).

| 무엇이 있나 | 무엇을 하나 | 종료 코드 |
|---|---|---|
| 아무것도 없다 | 마이그레이션만 올리고 **건너뛴다고 한 줄 말한다** | 0 |
| 이메일·비밀번호 | 만든다. **만들었다고 말한다**(이메일까지) | 0 |
| 그 이메일이 이미 있다 | **그대로 둔다 — 비밀번호를 안 덮는다.** 그렇다고 말한다 | 0 |
| 하나만 줬다 / 값이 나쁘다 | **안 만든다.** *"마이그레이션은 올렸고 계정은 만들지 않았습니다"* 를 이유와 함께 찍는다 | **1** |

**비밀번호는 어느 갈래에서도 안 찍힌다** — 이메일은 찍는다. 그 성질은
`test/seed-user.test.ts` 가 출력 전문을 읽어 잰다.

**`migrate:down` 은 내린 마이그레이션이 만든 표 · 칸의 데이터를 버린다 — 되돌리기는 데이터를 잃는다.** 다시 올려도
돌아오지 않는다. 눈에 안 띄게 잃는 것이 묘비다: `0013-comment-tombstones` 까지 내렸다 올리면 지운 게시의 키가
사라져 같은 키 재전송이 **201**(지운 말이 되살아남)이다 — 내리기 전에는 409 `idempotency-key-deleted`(아래 «멱등 키»).
`0015-comment-revision-seq` 를 내리면 재생이 앞 게시의 번호 프레임을 다시 보내지 못한다.

**`migrate:down` 은 계정을 안 건드린다.** 시딩이 마이그레이션 **파일 안**이 아니라 CLI
진입점에 있기 때문이다 — 계정을 마이그레이션 파일로 만들면 롤백이 남의
계정을 지우게 된다(`src/db/seed-user.ts` 의 머리말이 그 판정을 든다).

### 이 서버가 env 를 읽는 방식

`dev`·`start`·`migrate`·`migrate:down`·`reset-password` 스크립트가 전부 `tsx`에
`--env-file-if-exists=.env`를 붙여 실행하므로(`apps/api/package.json` — 그 플래그는 Node 22.9 부터이고 이 저장소의 하한은 그보다 높다),
`apps/api/.env`가 있으면 자동으로 읽는다 — 이 프로젝트는 `dotenv` 같은 별도 패키지를
쓰지 않는다.

`.env` 파일 없이 셸에 직접 `export DATABASE_URL=...` 해도 그대로 동작한다
(`--env-file-if-exists`는 파일이 없어도 에러 없이 넘어가고, 파일이 있어도 **이미 셸에 있는
값을 덮어쓰지 않는다** — 둘 중 하나만 있어도, 둘 다 있어도 안전하다). 값 목록과 기본값은
`.env.example`에 있고, 검증하는 자는 `src/config.ts`의 `EnvSchema` 하나다.

**`DATABASE_URL`에 `query_timeout`을 붙이면 api 가 뜨지 않는다.** pg 는 접속 문자열의 검색 인자를 전부
설정으로 읽는데, 그 클라이언트 쪽 시간 제한은 서버의 일을 멈추지 않고 답을 기다리지 않을 뿐이라 COMMIT 의 결과를
모르게 하고 열린 트랜잭션을 안은 연결을 풀에 돌려준다 — 판정과 잰 값은 `src/db/client.ts`의 `createPool` 머리말이
갖는다. 시간 제한이 필요하면 **서버 쪽 `statement_timeout`**(`?options=-c%20statement_timeout%3D5000`)을 쓴다 — 서버가
문장을 멈추고 답한다.

**DB 연결에는 시간 제한 셋이 기본으로 걸린다** — 트랜잭션 도중 api 쪽 연결만 끊기면(네트워크
분할 · NAT 유휴 끊김) 서버에 남은 백엔드가 잠금을 쥔 채 풀을 다 먹어 **다른 사람의 세션 조회까지 매달린다.** 셋이 그것을 막는다.

| env | 기본 | 하는 일 |
|---|---|---|
| `DB_IDLE_IN_TRANSACTION_TIMEOUT_MS` | 10000 | 서버가 트랜잭션 안에서 이만큼 쉰 세션을 끝낸다 — 고아 백엔드가 이것으로 죽는다. **`DATABASE_URL`에 `?idle_in_transaction_session_timeout=`을 붙이면 api 가 뜨지 않는다**(값이 두 자리에서 오면 접속 문자열이 조용히 이긴다) |
| `DB_POOL_WAIT_TIMEOUT_MS` | 5000 | 풀에서 연결을 이만큼 못 얻으면 **503** |
| `DB_KEEPALIVE_IDLE_MS` | 10000 | DB 소켓의 TCP keepalive 첫 탐침까지. 진짜 분할에서 api 가 끊긴 줄을 아는 길이 이것뿐이다 — 걸리는 시간은 여기에 libuv 가 거는 간격 × 횟수(1s × 10)가 붙는다 — OS 의 기본값(리눅스 75s × 9)이 아니다. 잰 값과 재는 법은 `src/db/client.ts`의 `createPool` 머리말 «네트워크 분할» |

비우면 기본값, **0 은 싣지 않는다 — 서버·DB 설정을 따른다**(범위 밖이면 api 가 뜨지 않는다 — `config.ts`의 `dbTimeLimitEnv`).
**풀러(pgbouncer 부류) 뒤라면** 첫째 값은 기동 인자라 풀러가 거절하거나 버린다 — api·`migrate`가 기동 때 재서 거절이면
무엇을 하라고 말하고 멈추고, 버렸으면 경고하고 뜬다(`src/db/client.ts`의 `verifyDbTimeLimits`). DB 에 닿지 못해 재지 못했으면
(분할이면 `DB_POOL_WAIT_TIMEOUT_MS`만큼 쓴다) «기동 점검을 건너뜁니다»를 경고하고 뜬다 — 이 점검은 기동 때 한 번뿐이다. `lock_timeout`·`statement_timeout`은 **걸지 않는다** — 이 앱은 페이지 행 잠금에 일부러 줄을 서므로 정당한
기다림이 봉투 500 으로 끊긴다. 값의 근거(잰 값)와 판정은 `src/db/client.ts`의 `createPool` 머리말 «네트워크 분할»이 갖는다.

**그 플래그가 안 붙는 자리가 둘이고, 둘 다 이 파일을 따로 읽는다.**

| 누가 | 왜 안 붙나 | 어떻게 읽나 |
|---|---|---|
| `apps/web`의 vite | 다른 앱이다 | `vite.config.ts`가 `node:util`의 `parseEnv`로 읽어 **`PORT`만** 쓴다. 규칙은 `apps/web/config/api-proxy-target.ts` |
| `pnpm test`의 vitest | **루트에서 도는 vitest**라 이 패키지의 스크립트를 안 지난다 | `test/test-database-url.ts`가 같은 수단으로 읽어 **`TEST_DATABASE_URL`만** 쓴다 |

**둘 다 셸이 파일을 이기는 순서를 지킨다** — 그래야 `PORT=3011 …`을 건 사람이 서버와
에디터에서 같은 답을 본다. **가져가는 키를 하나씩으로 좁힌 것은 안전장치다**: 이 파일을
통째로 테스트 프로세스의 `process.env`에 얹으면 운영 `DATABASE_URL`이 거기 들어가는데,
아래 *"테스트"* 절이 말하는 **범위 없는 `DELETE`** 가 그때 무엇을 지우는지는 적을 필요도 없다.

**서버는 뜰 때 자기가 보는 DB와 스키마 상태를 말한다** —
`이 서버가 보는 DB: 127.0.0.1:5433/wirebound · 마이그레이션 N건`(다 올렸으면 N 은 `ls src/db/migrations/0*.ts | wc -l` 과 같다).
**빈 DB(0건)면 서버가 안 뜨고 그렇다고 말한다** — 절차는 최상위 README 「띄우기」 절이 소유한다.
`호스트:포트/이름`뿐이고 **자격 문자열은 안 찍는다**(`src/db/describe-target.ts`). 워크트리를
여럿 띄운 사람이 터미널을 나란히 놓고 가르는 값이 이것이다.

### 왜 `pnpm build` 가 이 서버의 전제인가

**최상위 [`README.md`](../../README.md) 「테스트는 통과하는데 서버만 안 뜬다」 절이 그 자리다** — 증상 문장·원인(`tsx`가 `exports`를
통해 `dist`를 본다)·조치·*"테스트는 통과하는데 서버만 안 뜬다"*가 값과 함께 한 자리에 있다.
**여기 두 벌로 적지 않는다.**

**api 자신은 빌드하지 않는다** — 운영(`start`)도 `tsx src/main.ts`로 소스를 돌리고 `packages/*`만 `dist`를 싣는다. 그래서
`tsx`는 런타임에 필요하다 — 내보내기 워커도 `tsx/esm`을 싣는다(`services/export-worker.ts`의 `workerExecArgv`). api 의 빌드
산출물을 `node`로 띄우는 길은 없다.

### 끄기 — 도는 요청을 끝까지 답하고 끝낸다

`SIGTERM` · `SIGINT` · `SIGHUP` 셋 다 «닫아라»다. 서버는 새 요청을 안 받고, **도는 요청(그리던 pptx 포함)을 끝까지 답한 뒤**
DB 풀을 닫고 종료 0 으로 끝낸다. 30s 안에 안 끝나면 도는 요청을 버리고 종료 1 이다. 같은 신호가 두 번 와도(`pnpm start` 아래의
Ctrl-C 한 번이 그렇다) 기다림을 끊지 않는다. 판정과 잰 값은 `src/shutdown.ts`의 머리말이, 브라우저가 신호를 안 받는 까닭은
`src/services/screen-render-chromium.ts`의 `LEAVE_SIGNALS_TO_SERVER`가 갖는다.

- **끄는 쪽의 한도가 먼저 오면 그 뒤는 SIGKILL 이다** — `pnpm dev`(`tsx watch`)는 다시 띄울 때 5s, `docker stop` 은 기본 10s.
  그때 도는 응답은 끊기지만 브라우저는 안 남는다(잰 값: 빈 페이지 200장 pptx 를 그리는 중에 `tsx watch` 가 다시 띄움 — 응답 끊김 ·
  새 서버 5.8s · 남은 브라우저 0. 40장이면 그림을 다 싣고 1.9s 에 새 서버).
- **띄운 터미널 창을 닫으면 그리던 서버가 안 끝난다** — 닫힌 터미널에 로그를 쓰려다 멈추고, 포트와 브라우저를 쥔 채 남는다(잰
  값: pty 에서 `pnpm start` · `tsx src/main.ts` 로 띄워 pptx 를 그리는 중에 pty 를 닫음 — 120s 뒤에도 응답 없음 · 서버와
  브라우저 셋이 남음. 쉬는 서버는 `tsx` 면 끝나고 `pnpm start` 면 남는다). 신호가 아니라 로그를 쓰는 자리가 막히는 것이라
  닫는 길은 로그 목적지의 쓰기 오류를 받는 것이다. 그때까지는 창을 닫기 전에 Ctrl-C 로 끈다.

## 테스트

api 프로젝트의 vitest 테스트는 실제 Postgres에 붙는다. 컨테이너가 healthy인
상태에서 돌려야 한다 — 컨테이너를 띄운 뒤(최상위 README 「세우기」 절) `pnpm vitest run --project api`
(또는 루트의 `pnpm test`)를 실행한다.

테스트 DB(`wirebound_test`)의 마이그레이션은 vitest의 `globalSetup`
(`test/global-setup.ts`)이 전체 실행 전 한 번 자동으로 올려준다(latest → none →
latest 한 사이클을 돌려 `down` 방향까지 검증한다) — 따로 `migrate`를 실행할
필요는 없다.

기본은 `test/helpers.ts`의 `withApi()`다. `withApi`는 테스트 하나를 트랜잭션으로
감싸고 끝나면 롤백하므로 그 테스트가 커밋하는 데이터는 없다 — 다음 테스트는 항상
깨끗한 스키마에서 시작한다.

**예외가 있다: `withRealApi` 하네스를 쓰는 파일들은 실제로 커밋한다.**
`withApi`는 커넥션 하나·트랜잭션 하나 안에서 도므로 그 안에서 요청을 겹쳐도 전부
직렬화된다 — 행 잠금과 `seq` 채번의 원자성은 **여러 커넥션이 실제로 커밋해야만**
검증된다(`test/revisions-concurrency.test.ts`가 그 대표다).

그 부류의 파일은 각 테스트 전후로 `helpers.ts`의 **`resetRealData`** 를 걸고, 그 함수가
`projects`·`users`를 **범위 없이** 지운다 — 자기가 만든 행만 고르지 않는다.

> **`DELETE FROM` 으로 grep 하면 0 건이다**(쟀다). Kysely 로 적혀 있다 —
> `db.deleteFrom('projects').execute()` / `db.deleteFrom('users').execute()`, `where` 없이.
> **그리고 그 파일은 하나가 아니다.**
>
> **몇 개인지는 여기 안 적는다** — 테스트 파일이 늘 때마다 적어 둔 수가 그 자리에서 낡는다. 대신 **`real-api-harness.test.ts` 가 불변식을 센다** —
> *"`withRealApi` 를 쓰는 파일은 전부 `resetRealData` 를 `beforeEach`·`afterEach` 양쪽에
> 건다"*. 목록이 필요하면 `grep -rl 'beforeEach(resetRealData)' test/` 다.

**그래서 테스트 DB 는 통째로 이 스위트의 것이다.** 다른 워크트리와 공유하면 서로의 판을
지운다 — 갈라 두는 절차는 최상위 [`README.md`](../../README.md) 「워크트리를 여럿 띄울 때」 절이 소유한다.

새 테스트를 그 형식으로 쓰기 전에 "여러 커넥션이 실제로 커밋해야만 드러나는
성질인가"를 먼저 확인한다. 아니면 `withApi`를 쓴다.

**그 예외를 성립시키는 것은 `vitest.config.ts`의 api 프로젝트에 걸린
`poolOptions.forks.singleFork`다 — 이 설정은 편의가 아니라 격리 전략의 일부다.**
그것이 사라지면 커밋된 행이 동시에 도는 다른 파일의 `withApi` 트랜잭션에 보이고,
그 파일의 정리 DELETE가 남의 데이터를 지운다(매 실행마다 서로 다른 파일 여럿이
깨진다 — 경쟁 상태다). 같은 목적으로 `fileParallelism: false`를 **쓰면 안 된다** —
프로젝트 설정에서는 에러도 경고도 없이 조용히 무시된다.

## API 개요

- 모든 요청/응답 본문은 JSON이다.
- 인증 수단은 **둘이다: 세션 쿠키(`wb_session`, httpOnly)와 API 토큰**(`Authorization: Bearer <토큰>`).
  토큰은 **프로젝트 하위 라우트(`/:projectId/…`)에서만** 인증된다 — 아래 *"API 토큰"* 참고.
  둘 다 실리면 **쿠키가 이긴다**.
- **요청한 탭이 아는 사용자**: 웹은 요청마다 `x-wb-known-user: <사용자 id>` 머리(WS 핸드셰이크는
  쿼리 `?knownUser=<id>`)를 싣는다. 쿠키로 인증된 요청이 **다른 사람을 실으면 409 `conflict`** + `issues: [{ path: "session",
  code: "session-user-changed", … }]` — 읽기 · 쓰기 · 핸드셰이크(101 전의 HTTP 409) 모두. **싣지 않은 요청**(CLI · MCP · 토큰 ·
  이 머리를 안 싣는 옛 웹)은 이 판정 없이 받고, `GET /api/auth/me` · `POST /api/auth/login` · `POST /api/auth/logout`은 보지 않는다(로그아웃은
  쿠키의 사람의 세션을 지운다). 쿼리 `knownUser`를 둘 이상 실으면 «다르다»(409)다 — 머리 둘과 같다. 판정은 `src/auth/plugin.ts` 한 자리다
  (머리말 «요청한 탭이 아는 사용자» — 왜 401 · 403 이 아닌지도 거기).
- 성공 응답은 리소스(또는 그 배열)를 그대로 반환한다. 실패 응답은 아래 "에러 형식"을 따른다.
- 요청 본문의 키는 camelCase다(`sortOrder`, `menuNodeId` 등). DB 컬럼(snake_case)과의
  변환은 서버 내부(`repos/`)에서만 일어난다 — API 밖으로 snake_case가 나가지 않는다.

### 에러 형식

```jsonc
{ "error": { "code": "not-found", "message": "대상을 찾을 수 없습니다", "issues": [ /* 있을 때만 */ ] } }
```

| code | HTTP 상태 | 의미 |
|---|---|---|
| `bad-request` | 400 | 요청 형식이 잘못됨(zod 검증 실패, 스키마 봉투 위반 등) |
| `unauthenticated` | 401 | 로그인이 필요함(세션 쿠키 없음/만료) |
| `forbidden` | 403 | 로그인은 했지만 이 작업에 필요한 역할이 아님 |
| `not-found` | 404 | 대상이 없음, **또는 프로젝트 멤버가 아님**(설계서 「권한 모델」 — 비멤버에게 프로젝트 존재 여부를 숨긴다) |
| `conflict` | 409 | 유니크 제약 위반, 마지막 owner 제거 시도, 자식이 있는 메뉴 삭제 시도, **스냅샷 태그 중복**, **스냅샷 수집 중 프로젝트 변경**, **복원의 네 갈래**(지문 불일치·안전망 태그 중복·레이아웃 불일치·코멘트 작성자 없음) 등 |
| `locked` | **423** | **다른 사용자가 편집 중인 노드**(설계서 「소프트 잠금」)를 건드렸다. `message`가 누가 잡고 있는지 말한다. **`conflict`(409)와 갈라 둔 것이 계약이다** — 아래 *"소프트 잠금"* 참고 |
| `validation-failed` | 422 | 봉투는 유효하지만 카탈로그 규칙(컴포넌트 타입·props·variant 등)을 위반함. `issues`에 `ValidationIssue[]` |
| `internal` | 500 | 예상하지 못한 서버 오류. **그 요청은 커밋 전이다**(웹의 코멘트 게시가 그렇게 읽는다) |
| `internal` | **503** | **DB 가 답하지 않았다** — 연결이 끊겼거나 닿지 못했거나, **COMMIT 에 서버의 답이 아닌 거절이 왔다**. **그 요청이 반영됐는지 모른다**(COMMIT 의 답만 잃었을 수 있다). 500 과 갈라 둔 것이 계약이다 — 경계는 `src/db/connection-loss.ts`, 번역은 `src/http/error-handler.ts`. **문장은 메서드로 갈린다** — 쓰는 요청은 «…요청이 반영됐는지 알 수 없습니다», GET · HEAD · OPTIONS 는 «…불러오지 못했습니다 — 잠시 뒤 다시 시도하세요»(읽기는 «반영»을 말하지 않는다). WS `patch`의 `patch-error`도 같은 판에 같은 `status` · 쓰기 문장이다(`http/error-handler.ts`의 `dbUnreachableFailure`). 가르는 값은 숫자다 — 문장은 사람에게만 간다. **편집(`PATCH .../ops` · WS `patch`)은 COMMIT 답을 잃으면 먼저 확인한다** — 아래 "편집 파이프라인"의 «COMMIT 답을 잃은 편집» |
| `internal` | **503** + `Retry-After` | **내보내기가 밀려 있다** — 떠 있는 내보내기가 한도(`EXPORT_JOB_LIMIT`)에 닿았거나 **그 사람의 것이** 한도(`EXPORT_PERSON_JOB_LIMIT`)에 닿아 **일을 받지 않았다**(내보내기 두 라우트만). 읽기뿐이라 `Retry-After`(초) 뒤 다시 보내도 안전하다. 두 한도는 문장으로 가른다(«내보내기가 밀려 있습니다 — …» · «내 내보내기가 이미 돌고 있습니다 — …»). 위 줄과는 머리와 문장으로 가른다 — 근거는 `src/services/export-worker.ts` 머리말 «줄은 길이로 묶는다» · «한 사람이 줄을 다 쥐지 않는다» |

### 이슈의 severity — 무엇이 저장을 막는가

`ValidationIssue`는 `severity`를 갖는다(`"error"` 또는 `"warning"`).

```jsonc
{ "code": "ignored-variant", "severity": "warning", "nodeId": "n_…",
  "path": "/root/children/0/variant", "message": "…" }
```

- **`error`가 하나라도 있으면 422이고 아무것도 저장되지 않는다.**
- **`warning`만 있으면 저장된다.** 그 경고는 성공 응답의 `warnings`에 실린다(아래).
- **422 응답의 `issues`에는 경고까지 함께 실린다** — 받는 쪽이 `severity`로 가른다.

`warning`인 코드는 **`ignored-variant` 하나뿐**이다(`@wirebound/schema`의
`ISSUE_SEVERITY`가 코드마다 정한다). `variantFrom`을 가진 컴포넌트(`Text`·`Field`·
`Divider`)에 `node.variant`를 적으면 그 값이 버려지는데, 그것은 문서를 무효로 만드는
사실이 아니라 알림이다. 경고를 오류와 접으면 그 경고 하나가 문서 어딘가에 있을 때
**그 노드와 무관한 편집까지 422로 거부**된다 — 편집 파이프라인이 문서 **전체**를
검증하기 때문이다.

**404 vs 403의 원칙(설계서 「권한 모델」):** 프로젝트가 아예 없는 경우와 프로젝트는 있지만
호출자가 멤버가 아닌 경우를 **구분하지 않고 둘 다 404**를 낸다 — 다른 프로젝트의
id가 존재를 흘리면 안 되기 때문이다. 멤버이지만 역할이 모자란 경우에만 403이다.

### 권한(역할)

프로젝트 멤버는 `owner` > `editor` > `viewer` 중 하나다(숫자가 클수록 강한 권한).
아래 표의 "최소 역할"은 "이 역할 **이상**이면 허용"을 뜻한다.

### 엔드포인트

**이 표가 클라이언트(에디터 · CLI · MCP)가 이 API를 상대로 근거로 삼는 계약이다.**

> **계정을 만드는 엔드포인트는 없다** — `POST /api/auth/signup` 은 **404** 다
> (`test/auth-routes.test.ts` 가 그 부재를 든다). 계정은
> `migrate` 가 마이그레이션을 올린 뒤 환경변수로 만든다(위 *"기동 절차"*, 최상위
> README 「세우기」 절 5번). 그래서 **`POST .../members` 의 *"이미 계정이 있는 사람만"* 은
> *"이미 시딩된 사용자만"* 이라는 뜻이다** — 초대만으로는 계정이 생기지 않는다.

| 경로 | 메서드 | 최소 역할 | 요청 | 응답 |
|---|---|---|---|---|
| `/api/auth/login` | POST | (없음, 공개) | `{ email, password }` | 200 `{ id, email, name }`, 세션 쿠키 설정 |
| `/api/auth/logout` | POST | 로그인만 | — | 204 |
| `/api/auth/me` | GET | 로그인만 | — | 200 `{ id, email, name }` |
| `/api/auth/tokens` | GET | 로그인만(세션) | — | 200 `{ id, name, createdAt, lastUsedAt, projectId, projectName, member }[]` — **로그인한 사람의 토큰 전부**(프로젝트를 가리지 않는다), 오래된 것 먼저. 멤버가 아닌 프로젝트의 줄은 `projectName: null` · `member: false`. 아래 "API 토큰". 토큰으로 부르면 401 |
| `/api/auth/tokens/:tokenId` | DELETE | 로그인만(세션) | — | 204 — 어느 프로젝트의 것이든. 남의 토큰·없는 id는 404. 토큰으로 부르면 401 |
| `/api/auth/tokens` | DELETE | 로그인만(세션) | — | 200 `{ revoked }` — 그 순간의 내 토큰 전부를 폐기한 수. 토큰으로 부르면 401 |
| `/api/projects` | POST | 로그인만 | `{ name, slug, description? }` | 201 `{ ...프로젝트, role }` — 호출자가 owner가 되므로 `role`은 항상 `"owner"`다 |
| `/api/projects` | GET | 로그인만 | — | 200 `{ ...프로젝트, role }[]`(호출자가 속한 것만, `created_at` 오름차순). 각 항목의 `role`은 **그 호출자의** 역할이다 |
| `/api/projects/:projectId` | GET | viewer | — | 200 `{ ...프로젝트, role }` |
| `/api/projects/:projectId` | PATCH | owner | `{ name?, slug?, description? }`(하나 이상) | 200 `{ ...프로젝트, role }` |
| `/api/projects/:projectId` | DELETE | owner | — | 204 |
| `/api/projects/:projectId/members` | GET | viewer | — | 200 멤버 배열 — 항목은 `{ userId, email, name, role, invitedAt }` |
| `/api/projects/:projectId/members` | POST | owner | `{ email, role }`(**이미 계정이 있는 사람만** 초대 가능 — 없으면 404) | 201 멤버 |
| `/api/projects/:projectId/members/:userId` | PATCH | owner | `{ role }` | 200 멤버(마지막 owner의 강등은 409) |
| `/api/projects/:projectId/members/:userId` | DELETE | owner | — | 204(마지막 owner 제거는 409) |
| `/api/projects/:projectId/menu` | GET | viewer | — | 200 메뉴 트리(중첩 배열, `pages` 없음) |
| `/api/projects/:projectId/menu` | POST | editor | `{ parentId?, title }` | 201 `{ id, projectId, parentId, title, sortOrder }` — **트리 응답과 다른 모양이다**(`children`·`pages`가 없다) |
| `/api/projects/:projectId/menu/:nodeId` | PATCH | editor | `{ title?, parentId?, sortOrder? }`(하나 이상) | 200 `{ id, projectId, parentId, title, sortOrder }`(POST와 같은 키) |
| `/api/projects/:projectId/menu/:nodeId` | DELETE | editor | — | 204(자식 메뉴·페이지가 있으면 409) |
| `/api/projects/:projectId/pages` | POST | editor | `{ menuNodeId, title, description? }` | 201 **페이지 여덟 키**(아래 "페이지 응답 형태"). 기본 스키마는 빈 `Page`다 |
| `/api/projects/:projectId/pages/import` | POST | editor | `{ menuNodeId, file, title? }` | 201 `{ page, comments: { inserted, dangling }, ignoredLayoutRef?, warnings? }` — **페이지 JSON(설계서 「페이지 JSON」)으로 새 페이지를 만든다**(아래 "페이지 JSON 가져오기"). 봉투 위반·모르는 버전·NUL 400, 메뉴 없음 404, 카탈로그 **오류** 422 |
| `/api/projects/:projectId/pages/:pageId` | GET | viewer | — | 200 페이지(스키마 포함, 최신 버전으로 마이그레이션되어 옴). `headSeq`가 다음 편집의 `baseSeq`다 |
| `/api/projects/:projectId/pages/:pageId` | PATCH | editor | `{ title?, description?, menuNodeId?, sortOrder?, base? }`(하나 이상, `schema`는 여기서 못 바꾼다) — **`base`는 고치기 전 값**(아래 «페이지 메타의 충돌 모델») | 200 **페이지 여덟 키**(POST·GET과 같다) · **409** `page-meta-changed`(바탕이 지금 값과 다르다) |
| `/api/projects/:projectId/pages/:pageId/schema` | PUT | editor | `{ schema }`(문서 봉투 전체) | 200 페이지(봉투 위반 400, 카탈로그 **오류** 422, 실패 시 기존 스키마 보존). 경고가 있으면 `warnings`가 더 붙는다. 통째 교체도 revision을 남긴다 |
| `/api/projects/:projectId/pages/:pageId/ops` | PATCH | editor | `{ baseSeq, ops[], clientOpId? }` | 200 `{ seq, revisionId, inverse, schemaVersion, clientOpId?, warnings? }`(본문·경로 제약 위반과 지원하지 않는 문서 버전·NUL 문자는 400, 페이지 없음 404, baseSeq 불일치·패치 실패 409, 카탈로그 **오류** 422) |
| `/api/projects/:projectId/pages/:pageId/revisions` | GET | viewer | `?mine=true&limit=50` | 200 revision 배열(seq 내림차순). **`limit` 최대 200이 곧 도달 가능한 이력의 전부다** — 커서 페이지네이션이 없다 |
| `/api/projects/:projectId/pages/:pageId` | DELETE | editor | — | 204 |
| `/api/projects/:projectId/pages/:pageId/comments` | GET | viewer | — | 200 코멘트 배열(`created_at` 오름차순). 항목은 `{ id, nodeId, body, authorId, authorName, createdAt, updatedAt }` |
| `/api/projects/:projectId/pages/:pageId/comments` | POST | editor | `{ nodeId, body, idempotencyKey? }` | 201 `{ comment, marker, seq, markerOps }` — **번호가 없는 노드면 문서에 `marker`를 붙이고 revision을 남긴다**(아래 "코멘트와 번호"). 문서에 없는 노드는 404, 본문 1~2000자 밖·NUL은 400. 그 사이 남이 고쳤어도 409 가 아니다 — 번호는 잠근 뒤의 문서로 매긴다(아래 "코멘트와 번호"). **`idempotencyKey`**(영숫자·`-`·`_` 1~64자, 밖은 400): 같은 (페이지, 작성자, 키)로 **이미 달렸으면 200 으로 그 행을 그대로 돌려준다** — 새 행·새 번호·revision 이 없고 `markerOps: []`, `seq`는 지금의 `head_seq`, `marker`는 그 노드의 **지금** 번호(노드나 번호가 사라졌으면 `null`). **같은 키에 다른 `nodeId`·`body`면 409** — 이 409 에만 `issues: [{ path: "idempotencyKey", code: "idempotency-key-reused", … }]`가 실린다(게시의 다른 409 — 아래 묘비의 것 — 와 `code`가 같아 이것으로 가른다. 아래 "멱등 키"). **그 키의 행이 달렸다가 지워졌으면 409** + `code: "idempotency-key-deleted"`(같은 꼴 — 새 행을 세우지 않는다. 아래 "멱등 키"의 «묘비»). **키 판정은 인증 뒤 · 권한 가드 앞이다** — 첫 게시 뒤 역할이 내려가거나 멤버에서 빠져도 같은 키면 200 재생(아래 "멱등 키") |
| `/api/projects/:projectId/pages/:pageId/comments/:commentId` | PATCH | editor | `{ body }` | 200 코멘트. **작성자만 고칠 수 있다 — 남의 것은 403.** 문서를 안 바꾸므로 `seq`가 없다 |
| `/api/projects/:projectId/pages/:pageId/comments/:commentId` | DELETE | editor | — | 200 `{ seq, markerOps }`(**204가 아니다** — 문서 변화를 실어야 한다). **그 노드의 마지막이면 `marker`도 지운다.** 남의 코멘트도 지울 수 있다. 그 사이 남이 고쳤어도 409 가 아니다 — 지울 번호는 잠근 뒤의 문서로 센다(아래 "코멘트와 번호") |
| `/api/projects/:projectId/pages/:pageId/comments/renumber` | POST | editor | — | 200 `{ seq, markerOps }` — 문서 순서대로 1부터 재번호(설계서 「설계서 화면 구조」). **한 revision이다.** 바꿀 것이 없으면 `markerOps: []`이고 revision도 안 쌓인다. 그 사이 남이 고쳤어도 409 가 아니다 — 잠근 뒤의 문서를 매긴다 |
| `/api/projects/:projectId/tree` | GET | viewer | — | 200 `{ menu }` — 메뉴 트리 + 각 노드의 `pages`(스키마는 싣지 않는다) |
| `/api/projects/:projectId/theme` | GET | viewer | — | 200 `{ themeId, theme, issues }` — **이 프로젝트의 화면이 지금 써야 할 테마 하나**(아래 "프로젝트의 현재 테마"). 없으면 `theme: null` |
| `/api/projects/:projectId/theme` | PUT | **owner** | `{ themeId: string \| null }` | 200 `{ themeId, theme, issues }` — **GET과 같은 꼴**(같은 함수가 만든다). 기본 레이아웃의 `theme_id`를 바꾼다. `null`은 *"테마를 벗긴다"*. **목록 밖 `themeId`는 404**(남의 프로젝트 테마의 존재를 숨긴다), **기본 레이아웃이 없는 프로젝트는 409**, 봉투 위반 400 |
| `/api/projects/:projectId/themes` | GET | viewer | — | 200 테마 배열 — **시스템 테마가 함께 나온다**(아래 "테마 응답 형태"). 시스템 테마가 먼저, 그 안에서 `slug` 순 |
| `/api/projects/:projectId/themes` | POST | **owner** | `{ theme }` | 201 테마(봉투 위반 400, **오류** 422, 중복 id 409, NUL 400). 경고가 있으면 `warnings`가 더 붙는다 |
| `/api/projects/:projectId/themes/:themeId` | GET | viewer | — | 200 테마 — 파생 테마면 `base`가 더 붙는다. 시스템 테마는 어느 프로젝트에서나 읽힌다 |
| `/api/projects/:projectId/themes/:themeId` | PUT | **owner** | `{ theme }`(문서 전체) | 200 테마(통째 교체). 경고가 있으면 `warnings`가 더 붙는다. **시스템 테마는 403**, 남의 프로젝트 테마는 404 |
| `/api/projects/:projectId/themes/:themeId` | DELETE | **owner** | — | 204. **시스템 테마는 403**, 남의 프로젝트 테마는 404 |
| `/api/projects/:projectId/snapshot` | GET | viewer | — | 200 **프로젝트 payload 그 자체**(아래 "읽기 전용 프로젝트 덤프"). **행을 쓰지 않는다.** 수집 도중 프로젝트가 바뀌면 409 |
| `/api/projects/:projectId/snapshots` | POST | **editor** | `{ tag, description? }` | 201 스냅샷(아래 "스냅샷 응답 형태"). **지금 상태를 태그 하나로 얼린다**(설계서 「스냅샷」). 태그 중복 409, 수집 도중 프로젝트가 바뀌면 409(**문장이 다르다**), NUL 400, 태그 1~60자·설명 0~2000자 밖은 400 |
| `/api/projects/:projectId/snapshots` | GET | viewer | — | 200 스냅샷 배열(`created_at` 내림차순, 동률은 `tag` 오름차순). **`payload`가 없다** — 크기(`payloadBytes`)만 실린다 |
| `/api/projects/:projectId/snapshots/:snapshotId` | GET | viewer | — | 200 스냅샷 + `payload`. 남의 프로젝트의 id는 404(존재를 숨긴다) |
| `/api/projects/:projectId/snapshots/:snapshotId/restore` | POST | **owner** | — | 200 복원 결과(아래 "복원"). **그때로 되돌린다**(설계서 「스냅샷」). 본문이 없다 — 안전망 스냅샷의 태그는 서버가 짓는다. 갈래별 상태는 아래 오류 표 |
| `/api/projects/:projectId/presets` | GET | viewer | — | 200 프리셋 배열 — **내장 3종이 함께 나온다**(아래 "프리셋 응답 형태"). 내장이 먼저, 그 뒤로 프로젝트 프리셋이 만든 순서대로 |
| `/api/projects/:projectId/presets` | POST | **editor** | `{ name, schema: WbNode[], description? }` | 201 프리셋. **`schema`는 문서 봉투가 아니라 root의 `children`이다.** `marker`는 저장하며 버린다. 이름 1~60자·설명 0~2000자 밖과 노드 봉투 위반·NUL은 400. **이름 중복은 오류가 아니다** |
| `/api/projects/:projectId/presets/:presetId` | DELETE | **editor** | — | 204. 없는 id·남의 프로젝트의 id는 404, **내장 id(`builtin:…`)는 400**(경로가 uuid를 요구한다) |
| `/api/projects/:projectId/export/preview` | GET | viewer | `?format=html\|pptx`(기본 `html`) | 200 — **내려받기 전에 화면이 말할 것**(아래 "내보내기"). **형식마다 답이 다르다**: html은 `{ format, pages, duplicateTargets, brokenLinks, errors, themeId, fileName }`, pptx는 `{ format, pages, screenless, screenFailures, fontWarning, fileName }`. 페이지가 없으면 409, 모르는 형식은 400, 내보내기가 밀려 있으면 503 + `Retry-After` |
| `/api/projects/:projectId/export` | GET | viewer | `?format=html\|pptx`(기본 `html`) | 200 — html이면 `application/zip`(설계서 「HTML 정적 번들」), pptx면 `application/vnd.openxmlformats-officedocument.presentationml.presentation`(설계서 「로드맵」). 이름은 `Content-Disposition`에만 있다. 페이지가 없으면 409, 모르는 형식은 400, 내보내기가 밀려 있으면 503 + `Retry-After` |
| `/api/projects/:projectId/ws` | GET(업그레이드) | viewer | — | **101** — WebSocket. 아래 "실시간(WebSocket)" 참고. 업그레이드가 아닌 평범한 GET에도 같은 가드가 먼저 돈다(비멤버 404) |
| `/api/projects/:projectId/tokens` | POST | viewer | `{ name }`(1~60자) | 201 `{ id, name, createdAt, lastUsedAt, value }` — **`value`(원문)가 실리는 유일한 응답이다.** 아래 "API 토큰". 토큰으로 부르면 403 |
| `/api/projects/:projectId/tokens` | GET | viewer | — | 200 `{ id, name, createdAt, lastUsedAt }[]` — **자기가 만든 것만**, 오래된 것 먼저. **원문이 없다.** 토큰으로 부르면 403 |
| `/api/projects/:projectId/tokens/:tokenId` | DELETE | viewer | — | 204. 남의 토큰·없는 id는 404. 토큰으로 부르면 403 |
| `/health` | GET | (없음, 공개) | — | 200 `{ status: 'ok' }` |

### 내보내기

형식은 둘이다 — HTML 번들(설계서 「HTML 정적 번들」)과 PPTX(설계서 「확정된 설계 결정」의 내보내기 행 — 렌더 이미지 방식).

**라우트는 둘이고 형식은 `?format=`으로 고른다.** 자원이 같고 표현만 다르므로
형식마다 라우트를 늘리지 않는다 — 파일 이름은 이미 URL에 없으므로(아래 «URL에 파일 이름이 없다») 경로로 형식을
가르는 이득이 없고, 라우트를 늘리면 권한·actor 인구조사의 표가 형식마다 자란다.

**기본은 `html`이다** — 인자 없는 URL이 zip을 받는다. **모르는 값은
400이다**: 조용히 html로 떨어뜨리면 pptx를 부른 사람이 zip을 받고, 그 상태는 파일을 열어
봐야 보인다.

**두 형식이 같은 수집을 지난다**(`services/export-source.ts`). 같은 프로젝트를 **같은 순서로
같은 이름으로** 실어야 하고, 수집이 두 벌이면 그 갈림은 두 파일을 나란히 열어 본 사람에게만
보인다.

**조립 · 렌더 · 압축은 워커 스레드에서 돈다** — 큰 내보내기가 이벤트 루프를 멈추면 옆 사람의 편집 트랜잭션이 그
멈춤을 «트랜잭션 안의 쉼»으로 겪고 `idle_in_transaction_session_timeout`에 끊긴다(503). 메인이 쥐는 것은 DB 읽기와 pptx
화면 그리기(브라우저)뿐이다. **요청이 끊기면 그 일을 버린다** — 응답 전에 연결이 닫히면 워커를 끝내고 답하지 않는다.
**떠 있는 내보내기(읽는 중 · 줄 선 · 도는)는 `EXPORT_JOB_LIMIT`(8)까지 · 사람마다 `EXPORT_PERSON_JOB_LIMIT`(2)까지다** —
넘은 요청은 행을 읽기 전에 503 + `Retry-After`로 거절한다(위 「에러 형식」). 사람은 세션의 사용자이고, 토큰이면 그 토큰을
만든 사용자다 — 토큰을 더 만들어도 몫이 늘지 않는다. 근거 · 값 · 동시성은 `services/export-worker.ts` 머리말이 갖는다.

#### `?format=html` — 정적 번들

`GET .../export`가 설계서 「HTML 정적 번들」의 트리를 zip 하나로 낸다.

```
wirebound-export-<슬러그>/
  index.html            트리 네비 + 뷰어 셸 (첫 페이지를 담는다)
  pages/….html          페이지마다 셸을 통째로
  assets/shell.css      뷰어 셸의 CSS
  assets/theme.css      구조 기본 CSS + 테마 컴파일 결과
  assets/runtime.js     상호작용 런타임
```

**페이지의 이름에 조상 메뉴가 붙는다.** `<title>`·좌측 트리의
이름·파일 이름 셋이 전부 `조상 메뉴들 + 페이지 제목`이고, 그래서 「HTML 정적 번들」의 예시 파일 이름
(`관리자-회원-목록.html`)과 같은 꼴이 나온다. **붙이지 않으면 서로 다른 메뉴의 같은
제목이 좌측 트리에서 똑같은 두 줄이 된다** — 스모크에서 실측했다. 이름을 만드는 마디는
상호작용 타겟을 만드는 마디와 **같은 함수**에서 나온다(`@wirebound/schema`의 `page-target.ts`).

**미리보기 응답도 같은 이름으로 부른다**(`pages[].title` · `errors[].title` ·
`brokenLinks[].from`). 한 페이지를 두 이름으로 부르면 같은 화면의 위아래가 갈린다.
**다만 같은 메뉴 아래 같은 제목이면 조상도 같아 이름이 그대로 겹친다** — 그 상태는
`duplicateTargets`가 함께 낸다(타겟도 겹치기 때문이다).

**출처는 라이브 프로젝트다.** 페이지·문서는 `pages` 표의 지금 값, 코멘트는
`comments` 표의 살아 있는 값, 테마는 프로젝트가 지금 쓰는 것(`GET .../theme`와 **같은
사슬**)이다. 스냅샷의 *"그때"*를 내보내는 경로는 없다.

**URL에 파일 이름이 없다.** 파일 이름은 안정한 열쇠가 아니라 페이지를 하나 더하면
뒤에서 부딪히던 이름들의 번호가 밀린다 — 그것으로 URL을 만들면 남의 북마크가 깨진다.
사람이 읽는 이름은 `Content-Disposition`과 미리보기의 `fileName`에만 있다.

#### `GET .../export/preview` — 내려받기 전에 화면이 말할 것 (html)

**내려받기 버튼이 조용히 성공하면 안 된다.** 그리지 못한 노드가 있어도 폴백이 든 HTML은
눈으로는 그럴듯한 한 장이고, 번들은 그것을 남에게 전달한다.

| 키 | 무엇 |
|---|---|
| `pages` | `{ id, title, target }[]` — 번들에 실릴 순서다. **`title`은 조상 메뉴가 붙은 번들 이름**(맨 제목이 아니다 — 위 문단)이고, **`target`이 설계서 「상호작용」 「모델」의 페이지 경로**로 저작 화면의 `navigate`·`openModal`에 그대로 적는 문자열이다 |
| `duplicateTargets` | 둘 이상의 페이지가 든 타겟. **그 타겟을 겨눈 링크는 어디에도 안 생긴다** |
| `brokenLinks` | `{ target, from, reason }[]` — 어느 페이지도 가리키지 못한 링크. `from`은 그것을 겨눈 페이지들의 **번들 이름**이다. `reason`은 `missing`(그 타겟을 든 페이지가 없다) 또는 `ambiguous`(둘 이상이다) |
| `errors` | `{ path, title, error }[]` — 그리지 못한 노드. **`title`이 어느 페이지인지 말한다** |
| `themeId` | 번들이 실은 테마. `null`이면 구조 기본 CSS만으로 그려진 것이다 |
| `fileName` | 내려받을 때 붙을 이름. **화면이 지어내지 않는다** |

**이 응답이 담지 않는 것 하나:** 한 노드를 여러 규칙이 서로 다른 prop으로 겨누면 미리 그릴
판이 곱으로 늘고, 상한을 넘으면 그 페이지의 런타임이 꺼진다. 그 사실은 **번들 자신이
말한다**(그 페이지의 상태 줄에 이유가 뜬다) — 여기서 다시 세려면 그 상한을 두 벌로 갖게
되고, 둘이 갈리는 날 화면이 거짓을 말한다.

`format`을 응답에 되싣는다 — 화면이 어느 갈래를 받았는지 **키의 유무로 짐작하지 않는다.**

#### `?format=pptx` — PPTX

`GET .../export?format=pptx`가 **페이지마다 슬라이드 한 장**인 pptx 파일 하나를 낸다.
`Content-Disposition`의 이름은 `wirebound-export-<슬러그>.pptx`다.

```
[Content_Types].xml               ← **패키지 뿌리에 있어야 한다**
_rels/.rels
ppt/presentation.xml              슬라이드 목록 · 16:9 (12192000 × 6858000 EMU)
ppt/slideMasters/ · ppt/slideLayouts/ · ppt/theme/
ppt/slides/slideN.xml             페이지 N — 제목 · 화면 자리 · 코멘트 · 상호작용
ppt/notesSlides/notesSlideN.xml   같은 것의 **전문**
```

**응답 머리가 화면 이미지의 수를 싣는다** — 본문은 그대로 pptx 다.

| 머리 | 값 |
|---|---|
| `x-wb-screen-failures` | **그리려다 실패한** 장 수(`screenFailures`의 길이). 글꼴이 없어 안 그린 장도 여기다 |
| `x-wb-screenless` | **아무도 안 그린** 장 수(`screenless`의 길이) — 그리는 자가 없는 서버다 |

**늘 싣는다(0 도).** 받는 쪽이 «0 장»과 «이 머리를 모르는 서버»를 가른다. **이유는 싣지 않는다** — 머리는 ByteString 이라
한국어를 못 싣고, 이유는 미리보기가 갖는다. 미리보기를 안 부르는 `wireb export`가 이것을 읽어 경고한다. html 에는 없다.

**zip이지만 뿌리 폴더가 없다.** html 번들은 `wirebound-export-<슬러그>/` 아래에 담는데
(푼 자리에 파일이 흩뿌려지지 않게), pptx에 같은 폴더를 씌우면 받는 쪽이
`[Content_Types].xml`을 못 찾아 **파일이 통째로 안 열린다.**

| 무엇 | 값 |
|---|---|
| 배치 | 화면이 왼쪽, 코멘트와 상호작용 문장이 오른쪽 — **설계서 「설계서 화면 구조」의 저작 화면·「HTML 정적 번들」의 번들과 같다** |
| 페이지 이름 | **번들과 같은 이름**(조상 메뉴가 붙은 `bundleTitle`). 한 페이지를 두 이름으로 부르면 같은 설계서의 두 산출물이 갈린다 |
| 코멘트·상호작용 문장 | **번들과 같은 함수가 만든다**(`@wirebound/exporter`의 `commentEntries`·`pageSentences`). 설계서 「자동 문장화」가 *"우측 패널, HTML 번들, PPTX 모두 이 문장을 싣는다"*고 적는다 |
| 노트 | 슬라이드에 실린 것 **전부와 페이지 설명**. 슬라이드는 넘치면 잘리므로 **잘려도 사라지지 않게** 하는 자리다 |
| **화면 이미지** | **서버가 헤드리스 Chromium으로 그린다.** `exportPage`가 내는 그 페이지의 HTML을 그대로 띄워 PNG 한 장을 찍고, 슬라이드의 화면 자리에 **비율을 지켜** 넣는다. 못 그린 장은 그 자리에서 *"화면 이미지가 실리지 않았습니다"*가 되고 **미리보기가 이유를 말한다** |
| 테마 | **OOXML의 `a:clrScheme`으로 옮기지 않는다.** 설계서 「명시적으로 제외한 것」이 도형 변환을 포기했고 슬라이드에 실릴 화면은 래스터다 — 그 이미지가 이미 테마 색을 담으므로 여기서 다시 칠하면 같은 색이 두 자리에서 다르게 나온다. **다만 그 래스터를 그리는 입력으로는 읽는다**(번들과 같은 사슬: `currentProjectTheme` → `asResolvedTheme`) |

##### 화면 이미지를 그리는 조건

| 무엇 | 값 |
|---|---|
| 무엇으로 | `playwright-core` + 기계에 설치된 Chromium. **저장소가 브라우저 바이너리를 안 들고 있다** — 없으면 그리기가 전부 실패하고 pptx는 그림 없이 나온다(던지지 않는다) |
| 브라우저를 넣는 법 | `apps/api`에서 `node node_modules/playwright-core/cli.js install chromium`(저장소 루트에서 부르는 경로는 최상위 README 「넣는 법」 절) — **`playwright` 패키지를 안 들여도 된다.** `--only-shell`이면 headless shell만, `--with-deps`가 시스템 라이브러리를 함께 넣는다 |
| 어디서 | `apps/api`. **`@wirebound/exporter`는 브라우저를 모른다** — 그 패키지는 이미지를 **인자로** 받는다 |
| 채우는 자리 | **`main.ts` 하나다.** `buildApp`에 `screenRenderer`를 안 주면 안 그린다(`pnpm test`가 브라우저를 안 띄우는 이유) |
| 화소 | 뷰포트 720×552 · 배율 2배 → **1440×1104**. 페이지가 길면 **전체를 찍으므로 높이가 는다** |
| 상한 | 페이지 **200장**. 넘은 장은 실패가 되고 **이유가 분모를 함께 말한다** |
| 동시성·타임아웃 | 동시 **4장** · 한 장 **10초**. 브라우저는 내보내기 **한 번의 수명**이다 |
| **요청끼리는 둘까지** | 위의 4장은 **한 번의 내보내기 안**이다. 요청끼리는 `services/export-worker.ts`의 풀이 가른다 — **그리기 칸**(`EXPORT_RENDER_LIMIT` — 2)이 따로 있어 **동시에 뜨는 브라우저는 둘까지**이고, 넘은 pptx 는 **조립 전에** 줄을 선다(워커도 CPU 칸도 안 쥔다). **그리는 동안은 CPU 칸을 내놓는다** — pptx 가 몇이 그리거나 기다리든 다른 내보내기(html 미리보기 포함)는 CPU 칸(`EXPORT_WORKER_LIMIT` — 2, 코어가 둘 이하면 1)만 기다린다(그 파일 머리말 «칸이 둘이다»). 줄의 길이는 위 «떠 있는 내보내기» 한도가 묶는다 |
| **긴 페이지** | 화면 전체를 찍으므로 **높이가 내용을 따라간다.** 200행짜리 페이지는 1440×**16112**가 되고 슬라이드 위에서 폭 **≈37pt**(자리의 7%)로 줄어든다 — 던지지 않고 **조용히 실오라기가 된다.** 상한 200장이 재는 것은 **장 수이지 바이트가 아니다** |
| 바깥 요청 | **끊는다.** 테마의 `@font-face`·`url()`은 사용자가 적은 문자열이라 서버가 그것을 가져가면 안 된다. `data:`는 네트워크를 안 타므로 그대로 산다 |
| 한글 글꼴 | **없으면 한 장도 안 그린다**(두부를 내보내지 않는다). `fontWarning`이 그 사실을 낸다 |

#### `GET .../export/preview?format=pptx`

| 키 | 무엇 |
|---|---|
| `format` | `'pptx'` |
| `pages` | `{ id, title, target }[]` — **html 미리보기의 것과 같은 값이다** |
| `screenless` | **아무도 그리지 않은** 페이지들의 **번들 이름**. 그리는 자가 없으면 전부다 |
| `screenFailures` | **그리려다 죽은** 페이지들 — `{ title, reason }[]`. `screenless`와 **겹치지 않는다**: *"아직 아무도 안 만들었다"*와 *"만들려다 실패했다"*는 다른 말이다 |
| `fontWarning` | 그린 기계에 한글 글꼴이 없었다는 한 줄. 없으면 `null`이다 |
| `fileName` | `wirebound-export-<슬러그>.pptx` |

**미리보기도 페이지 N장을 그린다.** 내려받기와 **같은 판정**을 써야 하기 때문이다 —
미리보기가 싼 답을 따로 만들면 화면이 *"괜찮다"*고 한 뒤 파일이 그림 없이 나오는 날이 온다.

**`duplicateTargets`·`brokenLinks`·`errors`·`themeId`는 안 싣는다.** 그 넷은 HTML 번들의
성질이다 — PPTX는 페이지 사이 링크를 만들지 않고 설계서 「테마 시스템」의 테마도 안 쓴다. 그대로 실으면 값이
있는데 그 값이 **아무것도 안 가리킨다.**

### API 토큰

`wireb`(CLI)와 MCP가 붙을 자격이다(설계서 「권한 모델」). **세션 쿠키는 만료되는 브라우저 자격**이라 파일에
눌러 담으면 며칠 뒤 조용히 401이 된다.

```
Authorization: Bearer <발급 응답의 value>
```

| 성질 | 값 | 왜 |
|---|---|---|
| 발급 | **viewer 이상 누구나** | 설계서 「권한 모델」의 표(viewer 줄)가 그렇게 적는다. 같은 절의 불릿 *"editor가 만든 토큰으로는 스냅샷 복원이 안 된다"*도 owner 아닌 사람의 발급을 전제한다 — 토큰은 발급자의 권한을 넘지 않으므로(아래 «권한») 발급을 좁힐 이유가 없다 |
| 권한 | **요청 시점의 `project_members` 행** | 발급 시점의 역할을 얼리지 않는다. 얼리면 판정이 두 벌이 되고, 강등된 사람의 토큰이 옛 권한으로 계속 쓴다 |
| 스코프 | **프로젝트 하나** | 다른 프로젝트에 쓰면 **404**다(403이 아니다 — 「권한 모델」의 존재 숨김) |
| 닿는 라우트 | **`:projectId`를 가진 것만** | 그 밖의 라우트에서는 `currentUser`를 **채우지 않는다.** 인증이 필요한 것은 기존 `requireAuth`가 401을 내고, 공개 라우트(`/health`)는 토큰이 실려도 답이 달라지지 않는다 |
| WebSocket | **쓸 수 없다** | 「권한 모델」의 *"REST와 WS의 인증 경로가 하나다"*를 지킨다. 토큰이 실린 핸드셰이크는 401이다 |
| 저장 | **sha256 hex만** | 원문은 발급 응답에만 실린다. `sessions`와 같은 규칙이고 만드는 함수도 하나다(`auth/token-hash.ts`) |
| 수명 | **없다** | 「권한 모델」에 만료·회전을 정하는 줄이 없다. 자격을 거두는 수단은 **폐기**와 **멤버십 제거** 둘이다 — 멤버에서 빼면 그 사람의 **그 프로젝트 토큰이 같은 트랜잭션에서 지워진다**(제거가 거절되면 남는다). 남기면 비멤버인 동안 404 로 잠들었다가 다시 멤버가 되는 순간 되살아난다 |

**토큰 관리 셋(발급·목록·폐기)은 세션으로만 부를 수 있다 — 토큰으로 부르면 403이다.**
토큰으로 토큰을 만들 수 있으면 새어 나간 토큰 하나가 스스로 대체품을 남기고, 폐기가 그
사슬을 못 끊는다.

**목록·폐기는 자기 것만 본다.** 발급이 viewer에게 열려 있으므로 프로젝트 단위로 열면
조회 전용 역할이 owner의 자격을 거둘 수 있다. **프로젝트 차원의 회수는 멤버십 제거다** —
멤버에서 빼면 그 사람의 그 프로젝트 토큰이 지워지고(그 뒤 그 토큰은 401) 다시 멤버가 돼도 되살아나지 않는다.
그 사람의 다른 프로젝트 토큰은 그대로다. 제거는 빠지는 사람의 토큰 행을 owner 행보다 먼저 잡고, 프로젝트 삭제는
토큰 행을 CASCADE 전에 잡는다 — 까닭(교착)은 `src/repos/members.ts`의 `removeMember`와 `src/routes/projects.ts`의 삭제 주석.
지우는 것은 멤버 행을 지운 뒤라 **제거가 도는 사이 발급된 토큰도 지운다**. 예외는 발급하자마자 그 토큰으로 쓰는 요청이
그 순간 재확인 중인 판이다 — 그 행은 건너뛰어 남는다(기다리면 교착 — `src/repos/api-tokens.ts`의 `deleteMemberTokens`).

**계정 아래의 «내 토큰»(`/api/auth/tokens`)은 프로젝트를 가로지른다.** 멤버가 아닌 프로젝트에도 토큰이 남을 수 있다(위
경합 · 제거가 토큰을 안 지우는 판으로 빠진 멤버의 행) — 그 토큰은 다시 멤버가 되면 산다. 그 프로젝트 아래의 목록은 404 라
안 보이므로, 옛 비밀번호가 새었을 때 거두는 길이 여기다(웹의 «API 토큰» 화면이 부른다). **멤버가 아닌 프로젝트의 이름은 안
싣는다** — 빠진 뒤 바뀐 이름이 새지 않게. 판정과 숨기지 못하는 것(그 프로젝트가 아직 있다는 사실)은 `src/routes/tokens.ts`의
«내 토큰은 프로젝트를 가로지른다». 전부 폐기는 토큰 행을 id 순으로 잡는다 — 제거 · 프로젝트 삭제와 같은 순서(까닭은
`src/repos/api-tokens.ts`의 `deleteAllUserTokens`). 폐기는 재확인하지 않는다(권한을 줄이는 쓰기다).

**로그에 남지 않는다.** `buildLoggerOptions`의 `redact`가 `req.headers.authorization`을
이미 덮고 있다(그 함수의 머리말에 이유가 있다).

### 누가 고쳤나 — `x-wb-client`와 `revisions.actor_*`

`pages.schema`를 바꾸는 요청은 `revisions`에 **누가 했는지**를 남긴다. 그 값을 정하는
규칙은 하나다(`auth/actor.ts`의 `requestActor` — 구분 표시의 뜻은 설계서 「LLM 편집 경로」).

```
x-wb-client: cli | mcp
```

| 자격 | 헤더 | `actor_type` | `actor_id` | `actor_label` |
|---|---|---|---|---|
| **세션 쿠키** | `cli`·`mcp`·없음 | `user` | `users.id` | 사람 이름 — **헤더를 무시한다** |
| **API 토큰** | `mcp` | `mcp` | **`api_tokens.id`** | **토큰명** |
| **API 토큰** | `cli` | `cli` | 〃 | 〃 |
| **API 토큰** | 없음 | **`cli`** | 〃 | 〃 |
| 아무거나 | **그 밖의 값** | — | — | **400** — 세션도 마찬가지다 |

- **`actor_type`은 감사 기록이지 권한이 아니다.** 이 값으로 무엇도 막지 않으므로 자칭이
  허용된다 — 같은 토큰이 `cli`로도 `mcp`로도 똑같이 쓴다. 그것으로 무엇을 막으려 하면
  `test/actor-census.test.ts`의 *"자칭한 종류로 무엇도 막지 않는다"*가 말한다.
- **`actor_label`은 서버가 정한다.** **설계서 「LLM 편집 경로」**가 *"토큰명"*을 정했고 그것은 서버만 안다
  (「권한 모델」에는 그 문장이 없다 — `actor_label`의 값을 정하는 줄은 설계서 전문에서 「LLM 편집 경로」 하나다).
  **자칭할 수 있는 것은 *"cli냐 mcp냐"*뿐이고 신원이 아니다.**
- **`actor_id`가 `users.id`가 아니다.** `'mcp'`·`'cli'`일 때는 `api_tokens.id`다
  (마이그레이션 0005의 주석). 그래서 **`GET .../revisions?mine=true`가 도구의 편집을
  안 준다** — 설계서 「개인 undo/redo」의 undo 스택은 *"내가 이 브라우저에서 한 편집"*이고, 에이전트가 한
  것을 거기 섞으면 사람이 자기가 안 한 편집을 되돌린다.
- **모르는 값은 400이고 아무것도 쓰이지 않는다.** 대소문자도 접지 않는다(`MCP`는 오타다).
  조용히 접으면 그 오타가 **영영 `cli`로 기록된다.**
- **그 400은 `projectGuard`가 낸다 — 곧 핸들러 본문보다 먼저다.** `:projectId`를 가진
  라우트는 **읽기까지 전부** 그 가드를 지나므로, 잘못된 헤더를 실은 요청은 **아무것도 만지지
  못하고** 끝난다. 검사를 핸들러 안에 두면 조작이 먼저 커밋되는 라우트가 생긴다. `test/actor-census.test.ts`의 라우트 인구조사가
  **Fastify가 아는 라우트 목록**을 분모로 그것을 전수로 잰다.
- **`:projectId` 밖 라우트는 이 검사를 안 지난다**(`/api/auth/*`·`/health`). 가드가 없는
  자리이고, 그 라우트들은 `actor`를 만들지 않는다.
- **`page-changed`·`restored` 프레임의 `actor`도 같은 값이다** — 화면이 *"이건
  에이전트가 고친 것"*을 실시간으로 본다(설계서 「LLM 편집 경로」).
- **예외 둘.** WS의 `patch` 프레임은 언제나 `user`다(**WS는 쿠키만이다** — 위 표).
  복원이 만드는 revision도 `user` + `복원: <태그>`다 — 그 actor는 *"누가 고쳤나"*가 아니라
  *"무슨 사건인가"*를 든다. 판정과 근거는 `test/actor-census.test.ts`의 표에 한 줄씩
  적혀 있고, 그 표의 분모는 **소스에서 센 `actor:` 자리 전부**다.

### 읽기 전용 프로젝트 덤프 (`GET .../snapshot`)

**단수다.** 복수(`POST .../snapshots`)와 갈리는 것이 계약이다.

| | `GET .../snapshot`(단수) | `POST .../snapshots`(복수) |
|---|---|---|
| 남기는 것 | **없다** | 지울 수 없는 태그 한 줄(설계서 「스냅샷」) |
| 역할 | viewer | editor |
| 응답 | **payload 그 자체** | `{ …메타, payload }` |

`wireb pull`이 부르는 것이 단수다. 리포를 동기화할 때마다 복수를 부르면 태그가 무한히
쌓이고 viewer는 아예 못 쓴다.

**payload는 복수와 같은 함수(`captureSnapshot`)가 만든다** — 절 구성과 값이 같다(위
"스냅샷 응답 형태"의 표가 그대로 적용된다). 갈리면 CLI·MCP가 읽는 것과 스냅샷이 얼리는
것이 두 벌이 된다.

**감싸지 않는 이유:** 감쌀 메타가 없다(행이 없으므로 태그도 만든 사람도 id도 없다).
payload는 `payloadVersion`·`capturedAt`을 스스로 들어 자기를 설명한다.

### 프로젝트 응답 형태

위 표의 **`프로젝트`는 다섯 키다.** 프로젝트를 내는 네 응답(`POST /api/projects` ·
`GET /api/projects`의 각 항목 · `GET /api/projects/:projectId` · `PATCH /api/projects/:projectId`)이
**전부 같은 키 집합**을 낸다 — `role`을 포함해서다.

```jsonc
{ "id": "…", "name": "…", "slug": "…", "description": null, "role": "owner" }
```

**`role`은 응답에만 있고 요청 본문에는 없다.** `CreateProjectBody`·`UpdateProjectBody`가
`z.strictObject`라 **응답을 그대로 되보내면 400**이다
(`{"code":"bad-request", issues:[{"path":"","message":"인식할 수 없는 키: \"id\", \"role\""}]}`).

**슬러그가 형식을 어기면 400인데 문장이 하나뿐이다** — 형식·길이·빈 문자열이 전부
`"슬러그는 소문자·숫자·하이픈만 쓸 수 있고, 하이픈으로 시작하거나 끝날 수 없습니다"`로 온다
(길이 상한 64는 정규식 안에 있고 별도 메시지가 없다). **중복은 409
`"이미 사용 중인 슬러그입니다"`다.**

### 페이지 응답 형태

위 표의 **`페이지 여덟 키`는 이것이다.** 페이지를 내는 세 응답(`POST /pages` ·
`PATCH /pages/:pageId` · `GET /pages/:pageId`)이 **전부 같은 키 집합**을 낸다 —
서버의 `toResponse` 하나가 셋을 다 만든다.

```jsonc
{ "id": "…", "menuNodeId": "…", "title": "…", "description": null,
  "sortOrder": 0, "schemaVersion": 1, "headSeq": 0, "schema": { /* 문서 봉투 */ } }
```

**`PUT .../schema`만 아홉 번째 키를 낼 수 있다: `warnings`.** 저장된 문서에 경고가 있을
때만 붙고, **없으면 키 자체가 없다**(`clientOpId`를 조건부로 싣는 것과 같은 관례).
`POST /pages`·`GET /pages/:pageId`는 검증을 돌리지 않으므로 이 키를 내지 않는다 —
**즉 경고가 있는 페이지를 GET으로 읽어도 그 사실을 알 수 없다.** 알아야 하는 클라이언트는
받은 `schema`에 `validatePage`를 직접 돌린다(`@wirebound/schema`가 브라우저에서도 돈다).

**메뉴 노드는 다섯 키다**(`POST /menu` · `PATCH /menu/:nodeId`가 같다):

```jsonc
{ "id": "…", "projectId": "…", "parentId": null, "title": "…", "sortOrder": 0 }
```

**프로젝트와 같은 이유로 응답을 그대로 요청 본문에 되보낼 수 없다.** 넷 다 `z.strictObject`라
요청이 받지 않는 키가 섞이면 400이다 — 실측:

```
POST  /menu        응답 그대로 → 400 인식할 수 없는 키: "id", "projectId", "sortOrder"
PATCH /menu/:id    응답 그대로 → 400 인식할 수 없는 키: "id", "projectId"
POST  /pages       응답 그대로 → 400 인식할 수 없는 키: "id", "sortOrder", "schemaVersion", "schema", "headSeq"
PATCH /pages/:id   응답 그대로 → 400 인식할 수 없는 키: "id", "schemaVersion", "schema", "headSeq"
```

### 페이지 메타의 충돌 모델 — `base`

`PATCH /pages/:pageId`가 **고치기 전 값**(`base` — 그 사람이 고치기 시작한 바탕)을 받는다. 바탕 없이 나중에 저장한 쪽이
이기면 창 둘이 같은 설명을 고칠 때 뒤의 것이 앞의 것을 조용히 덮는다.

```jsonc
{ "description": "앨리스의 글", "base": { "description": "처음 설명" } }   // base 의 칸은 바꾸는 메타 칸과 같은 집합이다
```

| 지금 값 | 답 |
|---|---|
| `base`와 같다 | 200 — 쓴다 |
| `base`와 다르다 | **409** — 쓰지 않는다. 아래 봉투 |
| `base`를 안 보냈다 | 200 — 나중이 이긴다(호환) |
| 바꾸지 않는 칸의 바탕만 왔다(`{ description, base: { title } }`) | 400 `바탕(base)은 바꾸는 칸에만 줄 수 있습니다` |
| 바꾸는 제목 · 설명의 바탕이 빠졌다(`{ description, base: {} }` · `{ title, description, base: { title } }`) | 400 `바탕(base)을 주면 바꾸는 제목 · 설명마다 바탕이 있어야 합니다` |
| 바탕과 순서 · 메뉴 이동을 한 본문에 실었다(`{ title, sortOrder, base: { title } }`) | 400 `순서 · 메뉴 이동은 바탕(base)과 함께 보낼 수 없습니다 — 따로 보내십시오` — 한 본문이면 이 행을 먼저 잡고 형제 행을 잡아, 바탕 없는 자리 옮기기와 잠금 순서가 거꾸로 선다(교착) |

```jsonc
// 409 — 칸마다 이슈 하나. current 는 서버가 견준 바로 그 값이다(다시 읽지 않아도 된다).
{ "error": { "code": "conflict", "message": "다른 사람이 이 페이지를 먼저 바꿨습니다",
  "issues": [ { "path": "description", "code": "page-meta-changed",
                "message": "다른 사람이 이 페이지를 먼저 바꿨습니다", "current": "밥의 글" } ] } }
```

- **값으로 가른다** — 이슈 코드 `page-meta-changed`(문장이 아니다). 코멘트의 `idempotency-key-reused`와 같은 자세다.
- **견주기와 쓰기는 한 잠금 안이다** — 페이지 행을 `FOR UPDATE`로 잡고 읽고, 같은 트랜잭션이 쓴다. 둘이 같은 바탕으로
  동시에 오면 하나만 200 이고 다른 하나는 앞의 것이 커밋한 값을 `current`로 받는다(`test/page-meta-conflict.test.ts`).
- **권한 재확인(아래 "계층 규칙")이 비교보다 먼저다** — 잠금을 기다리는 동안 멤버에서 빠지면 404 다. 409 로 지금 값을 흘리지 않는다.
- **글자 그대로 견준다 — 빈 값 하나만 뺀다**: `null`과 `""`는 **같다**(`@wirebound/schema`의 `samePageMeta` — 웹의 판정도
  같은 함수를 부른다). 저장은 둘을 가른다(`""`는 `""`로 되읽힌다) — 화면에서 둘이 똑같이 «설명 없음»이라, 견주기가 가르면
  볼 수 없는 차이로 충돌이 선다. 바탕은 바꿀 값의 규칙(길이 상한)으로 재지 않는다 — 모양만 본다.
- **순서 · 소속 메뉴(`sortOrder`·`menuNodeId`)는 이 모델 밖이다** — 바탕을 받지 않고 나중이 이긴다. 바탕과 한 본문에 못 싣는다(위 표).
  바탕 없는 자리 옮기기 둘이 동시에 오면 교착이 날 수 있다(재시도 없이 500).
- **방송하지 않는다** — 이 라우트는 다른 창에 바뀐 것을 알리지 않는다. 남이 바꾼 것은 저장할 때 409 로 안다.

**누가 바탕을 보내는가.** 웹의 «페이지 설명» 탭(설명)과 메뉴 트리의 이름 변경(페이지 제목)이 보낸다 — 그 판정과 화면은
`apps/web/src/api/page-meta.ts`가 소유한다. **CLI · MCP 는 이 라우트를 부르지 않는다**(페이지 문서는 `PATCH .../ops`로
고친다). 가져오기(`POST .../pages/import`)는 새 페이지를 만들 뿐이다. 웹의 순서 · 메뉴 이동은 바탕 없이 보낸다.

### 페이지 JSON 가져오기

`POST .../pages/import`는 **파일 한 벌로 새 페이지를 만든다.** 절대 덮지 않는다 —
대상은 **메뉴 노드**이고 페이지는 그 형제 그룹의 맨 끝에 붙는다.

본문의 `file`이 설계서 「페이지 JSON」의 봉투다. **눈여겨볼 자리 둘**(아래 ①②)의 근거는 그 절과
`packages/schema/src/page-json/envelope.ts`의 머리말에 있다:

```jsonc
{
  "wireboundVersion": "1",
  "page": { "title": "회원 목록", "layoutRef": "admin-lnb", "description": null },
  // ① root 노드가 아니라 **문서 봉투**다 — 문서 버전을 적을 자리가 필요하다
  "schema": { "version": 1, "root": { "id": "n_root", "type": "Page", "children": [] } },
  // ② `marker`는 받지 않는다(400) — 번호는 `schema` 안의 노드가 든다
  "comments": [{ "nodeId": "n_7f3a", "body": "검색 조건은 AND 결합" }]
}
```

- **id를 전부 재발급하고 참조 둘을 함께 옮긴다** — 코멘트의 `nodeId`와 상호작용 `target`.
  트리 밖 참조(`page:…`)는 그대로 둔다.
- **파일의 트리에 없는 노드를 가리키는 코멘트는 버리지 않고 넣는다.** 그 수가 응답의
  `comments.dangling`이고, 들어간 뒤 화면은 그것을 *"사라진 노드"* 무리로 보인다.
- **`layoutRef`는 쓰지 않는다** — 페이지가 레이아웃을 고르는 경로가 없다
  (`pages`에 레이아웃 컬럼이 없다). 조용히 버리지 않고 응답의 `ignoredLayoutRef`로 말한다.
- **문서 쓰기는 편집 파이프라인을 지난다** — 가져오기 하나가 revision 하나를 남기고,
  그 역은 **빈 페이지**로 되돌린다.
- **한 트랜잭션이다.** 어느 갈래에서 끊기든 페이지도 문서도 코멘트도 남지 않는다 —
  갈래별로 *"무엇을 되돌리는가"*는 `services/page-import.ts`의 머리말에 표로 있다.
- **코멘트 작성자는 가져온 사람이다.** 파일에 작성자가 없고, 있어도 `comments.author_id`가
  `users`를 참조하므로 남의 서버의 id는 쓸 수 없다.

### 코멘트와 번호

**번호(`marker`)는 코멘트 표가 아니라 페이지 문서의 노드가 든다.** 설계서 「페이지 스키마 노드」가
`"marker": 2, // 우측 코멘트 번호 (없으면 코멘트 없음)`이라 적고, 그래야 내보낸 HTML
번들(설계서 「HTML 정적 번들」)이 문서만 들고 마커를 그린다. 본문·작성자·시각은 `comments` 표다.

| 규칙 | 어디서 |
|---|---|
| 한 노드의 코멘트들이 **같은 번호를 공유**한다(스레드) | `POST`가 노드에 번호가 있으면 그대로 쓴다 |
| **첫 코멘트가 번호를 만들고**, 새 번호는 문서에서 쓰이는 **최댓값 + 1**이다 | 지운 번호를 재사용하지 않는다 — 옛 번호를 가리키던 말이 다른 노드를 가리키게 되기 때문이다 |
| **마지막 코멘트를 지우면 번호가 사라진다** | 「페이지 스키마 노드」의 *"없으면 코멘트 없음"* |
| 번호를 바꾸는 셋이 **전부 편집 파이프라인을 지난다** | 그래야 revision이 남아 undo가 되고(설계서 「개인 undo/redo」), `head_seq`가 올라 그 뒤 편집의 `baseSeq`가 안 틀어진다 |

**`markerOps`는 그 요청이 문서에 낸 변화다**(`PatchOp[]`). 클라이언트는 자기 문서에 같은
ops를 적용하고 `headSeq`를 `seq`로 맞춘다 — **문서를 통째로 돌려주지 않는 이유는 아직
보내지 않은 낙관적 편집이 화면에서 사라지기 때문이다.** 문서가 안 바뀐 경우(이미 번호가
있는 노드에 코멘트를 더 다는 것, 마지막이 아닌 코멘트를 지우는 것, 바꿀 것 없는 재번호)에는
`markerOps: []`이고 `seq`는 현재 `head_seq` 그대로다.

**`baseSeq`는 서버가 읽는다.** 게시 · 삭제 · 재번호 셋 다 **페이지 행을 잠근 뒤의 문서**로 센다 — 붙일 번호(최댓값 + 1)도
*"노드에 번호가 이미 있는가"*도, 지울 번호 · 다시 매길 번호와 그 노드의 경로도 거기서 센다. 그래서 서로 다른 두 노드에 동시에
달린 첫 코멘트는 둘 다 201 이고 번호가 겹치지 않으며(1 · 2), 그 사이 남이 마지막 코멘트를 지워 번호를 없앴으면 새 번호를 받고,
서로 다른 노드의 마지막 코멘트를 동시에 지우면 둘 다 200 이며, 재번호가 기다리는 동안 남의 편집이 커밋되면 그 편집 뒤의 문서를
다시 매긴다. 셋 다 낡음(409)을 내지 않는다 — 문서에 내는 변화는 서버가 지금 문서에서 계산하므로 밀어붙일 남의 편집이 없다.
잰 값은 `test/comments-concurrency.test.ts`(두 요청이 페이지 행에 줄 선 판만 센다).

**응답의 `markerOps`·`seq`는 보낸 화면이 아직 못 받은 revision 뒤의 것일 수 있다** — 겹친 쓰기의 뒤 요청이
그렇다. 받는 쪽은 사이의 revision 프레임을 먼저 얹은 뒤에 이 응답을 얹어야 한다(웹은 `seq`가 제 다음 번호가 아니면 그
프레임을 기다린다 — `apps/web/src/store/editor-store.ts`의 `applyMarkerChange`). 앞 쓰기의 프레임은 그 커밋 직후에 나가고
뒤 쓰기의 응답은 제 트랜잭션을 마친 뒤에 나가므로 대개 프레임이 먼저 닿는다. 문서가 안 바뀐 응답의 `seq`는 그 요청이 본
`head_seq`다.

**성립하는 어긋난 상태 둘.** 서버는 이것을 고쳐 주지 않는다.

- **번호는 있는데 코멘트 행이 없는 노드.** undo가 번호 부여를 되돌렸거나, JSON을
  가져왔거나(설계서 「페이지 JSON」), 사람이 `marker`를 직접 편집한 경우다. **문서가 진실이므로 캔버스는
  그 번호를 그린다.** 그 노드에 코멘트를 달면 **있던 번호를 그대로 쓴다.**
- **코멘트 행은 있는데 노드가 문서에 없는 경우.** 코멘트가 달린 노드를 지우면 그 행이
  남는다(`comments.node_id`에 FK가 없다 — 노드는 테이블이 아니라 jsonb 안의 값이다).
  그 행은 GET에 그대로 실려 나간다.

### 멱등 키 — 같은 게시를 두 번 커밋하지 않는다

클라이언트는 응답을 못 받은 게시가 **달렸는지 모른다.** 서버는 브라우저가 끊은 요청도 끝까지
처리하므로(실측 — 새로고침이 끊은 게시가 커밋됐다), 「안 달렸다」고 보고 다시 보내면 **같은 글이
두 행**이 된다. 그래서 `POST .../comments`가 `idempotencyKey`를 받는다.

| 규칙 | 왜 |
|---|---|
| 같은 (페이지, **작성자**, 키)면 앞 행을 **200** 으로 돌려준다 | 작성자를 빼면 남이 내 키를 실어 **내 행을 제 게시의 결과로** 받는다 — 멱등이 아니라 남의 것을 받는 길이다 |
| 재생은 문서를 안 바꾼다 — `markerOps: []` · `seq`는 지금의 `head_seq` | 번호가 두 번 오르면 안 된다. 받는 쪽은 빈 `markerOps`면 아무것도 안 건드린다 |
| 재생은 앞 게시가 번호를 붙이며 만든 revision 을 **룸 전체에 `page-changed`로 다시 보낸다** — 발신 연결도 빼지 않는다. 앞 게시가 번호를 새로 붙이지 않았거나, **그 revision 이 지금 페이지의 머리(`head_seq`)가 아니거나, 가드 앞 재생인데 그 사람이 지금 게시의 가드를 못 지나면** 아무것도 안 보낸다 | COMMIT 답을 잃은 게시는 커밋됐는데 503 으로 끝나 그 방송을 못 한다 — 재생마저 안 보내면 그 프레임은 아무 연결에도 안 가고, 남의 화면은 다음 변경의 `seq`가 건너뛸 때 «연결이 끊긴 사이…»를 띄운다(원인이 틀린 문장). 재생은 앞 게시가 방송했는지 모르므로 다시 보낸다 — 받는 쪽은 `seq`가 제 `headSeq` 이하인 프레임을 건너뛴다. **뒤에 revision 이 더 있으면 안 보낸다** — 그 번호 프레임을 놓친 연결은 뒤의 `seq`가 건너뛰는 것을 보고 이미 `gap`(다시 읽기 대기)이고, 받는 쪽은 옛 `seq`를 «다음 번호»로 얹어 `gap`을 풀어 뒤의 revision 이 빠진 화면을 최신으로 둔다. 머리를 읽은 뒤 남의 편집이 커밋되면 두 방송이 연결마다 앞서거니 뒤서거니 할 수 있다 — 두 방송이 겹치면 늘 있는 성질이다. **권한을 잃은 사람의 재생은 200 이지만 프레임을 안 낸다** — 프레임을 내는 것은 룸에 쓰는 일이다(안 보면 멤버에서 빠진 사람이 재생마다 룸에 프레임을 낸다). 잠금 안 재생은 가드를 이미 지났다. COMMIT 답을 잃은 사람이 재생 전에 권한까지 잃으면 그 번호 프레임은 아무 데도 안 가고 룸은 다음 프레임에서 `gap`으로 안다 — 두 사건이 겹쳐야 서는 판이라 그렇게 둔다. 프레임은 revision 의 `seq` · `ops` · actor 를 싣고 `warnings`는 빈 배열 · `clientOpId`는 없다. 게시와 revision 을 잇는 칸은 `comments.revision_seq`(`src/db/migrations/0015-comment-revision-seq.ts`). 잰 값은 `test/comment-replay-broadcast.test.ts` |
| 재생의 `marker`는 그 노드의 **지금** 번호, 없으면 `null` | 첫 게시 뒤 노드가 지워졌어도 게시는 있다 — 그래서 **노드를 보기 전에** 키를 본다 |
| 같은 키에 **다른 `nodeId`·`body`**면 **409** | 앞 행을 돌려주면 새 글이 조용히 버려지고, 새 행을 만들면 한 키 아래 게시가 둘이 된다 |
| 키를 **잠금 안에서 한 번 더** 본다 | 같은 키가 동시에 오면 둘 다 가드 앞 확인을 지나(아직 커밋 전이다) 페이지 행에 줄을 선다. 뒤의 요청이 잠근 뒤 키를 안 보면 같은 키로 둘째 행을 넣으려다 유일 색인에 걸려 500 이다 |
| 키를 **권한 가드 앞에서** 본다 — 인증 뒤(`preValidation`의 `replayBeforeGuard`) | 가드 뒤에서 보면, 첫 게시가 커밋된 뒤 역할이 내려가면 403 · 멤버에서 빠지면 404 가 재생을 가린다. 웹은 다시 보낸 것의 4xx 를 «안 달림» 확정으로 읽으므로 권한을 되찾아 고쳐 달면 **두 행**이 된다. 재생할 **자기 행이 없으면** 가드가 401·403·404 를 먼저 낸다 |
| 그 키의 행이 **달렸다가 지워졌으면 409** + 이슈 코드 `idempotency-key-deleted` | 키가 행과 함께 사라지면 같은 키 재전송이 **새 행을 세운다**(지운 말이 되살아남 · 통지 없음). 아래 «묘비» |
| 키가 없으면 멱등 판정이 없다 — 보낼 때마다 새 행이다 | 같은 말을 일부러 두 번 다는 사람의 둘째 행을 지우지 않는다 |

저장은 `comments.idempotency_key`(NULL 허용)와 유일 색인 `(page_id, author_id, idempotency_key)`다
(`src/db/migrations/0012-comment-idempotency-key.ts`). 키 없는 행(가져오기 · 복원이 되살린 행)은
`NULL`이라 여럿 들어간다.

**다시 보낸 게시의 4xx·500 이 뜻하는 것 — 이 절이 서버의 판정 순서를 소유한다**(웹이 그것을 어떻게 가르는지는
`apps/web/src/panels/comment-panel.tsx`의 `knownRejection` 표가 소유하고 여기를 가리킨다). 웹은 같은 키로 다시
보낸 것의 4xx 를 «안 달림» 확정으로 읽는다. 그것이 참이려면 4xx 가 **그 키를
보고** 난 것이어야 한다. 키 판정 앞에 남는 4xx 와 그 성질(요율 제한·잠금 423 은 이
라우트에 없다. 423 은 `PUT .../schema`·`PATCH .../ops`의 소프트 잠금뿐이다):

| 키 판정 앞의 4xx | 상태에 따라 바뀌는가 | 다시 보낸 것에서 |
|---|---|---|
| 400 — 경로 파라미터 · `x-wb-client` · 본문 · NUL · 키 글자 | 아니다 — 요청 바이트가 정한다 | 다시 보낸 것은 첫 보내기와 같은 바이트다. 첫 것이 통과했으면 이것도 통과한다 |
| 401 — 세션이 없다 | 그렇다 | **그대로 먼저다.** 웹은 «세션 끝»으로 따로 가고 초안을 버린다(«안 달림»으로 읽지 않는다). **세션 조회가 DB 오류로 실패한 것은 401 이 아니다** — 500·503 이다(`src/auth/plugin.ts`의 머리말 «자격이 없다 · 확인하지 못했다») |
| 404 — 토큰이 다른 프로젝트에 묶였다 | 아니다 — 토큰의 프로젝트는 안 바뀐다 | 가드가 낸다(재생도 스코프를 먼저 본다 — `outOfTokenScope`) |
| 403 · 404 — 역할이 모자라다 · 멤버가 아니다 | 그렇다 | **자기 행이 있으면 여기 안 온다** — 재생이 가드 앞이다. 행이 없을 때만 가드가 낸다. 첫 게시가 아직 잠금 뒤에서 커밋 중이면 **그 게시도** 커밋 전 재확인에서 같은 답으로 되돌아간다(아래 «커밋 중 틈») |
| 404 — 페이지가 없다 | 그렇다(페이지를 지웠다) | 코멘트 행도 함께 지워졌다 — «안 달림»이 지금의 사실이고 둘째 행을 달 페이지도 없다. **복원이 그 페이지를 되살리면** 키 판정이 다시 선다 — 페이지 삭제가 키 있는 행을 묻고 묘비가 프로젝트에 매이므로(아래 «묘비») 되살린 행은 200 재생, 되살리지 않은 행은 409 `idempotency-key-deleted` |
| 400 — 문서를 못 읽는다(지원하지 않는 버전) | 이론상 그렇다 — 저장 경로가 버전을 검사해 첫 게시 뒤에 이렇게 바뀌는 길을 못 찾았다 | 재생도 문서를 읽어야 번호를 낸다 — 못 읽으면 가드·핸들러로 넘긴다 |

**다시 보낸 것의 500 은 앞 게시에 대해 아무것도 말하지 않는다.** 키를 보기 **전이나
도중에** 도는 질의 — 가드 앞 재생의 `findCommentByIdempotencyKey`·`findPageById` · 가드의 `findMembership` ·
핸들러의 `loadDocument`·`lockPageForEdit` — 가 던지면 오류 처리기가 봉투 500(`internal`)을 낸다(DB 가 답하지 않았으면
503 — 둘 다 웹에서 «모름»이다. `migrateDocument`만
잡혀서 가드로 넘어간다). 잰 값(`comments` 표 이름을 바꿔 둔 동안 같은 키로 다시 보냈다): editor · 비멤버 둘 다 봉투
500, 익명은 401(`currentUser`가 없으면 질의 전에 빠진다). 첫 보내기의 봉투 500 은 «**그 요청이** 커밋 전»이라
확정이지만 다시 보낸 것에서는 **모름**이다 — 이것도 «안 달림»으로 읽으면 첫 게시가 커밋된 뒤 고쳐 달 때
DB 두 행이 된다.

**첫 보내기의 봉투 500 이 «커밋 전»인 것은 DB 가 COMMIT 에 답했을 때의 말이다.** COMMIT 이
커밋됐는데 그 답만 잃은 판은 **봉투를 실은 503** 이다(`src/db/connection-loss.ts`) — 봉투 500 이 되지 않는다.
**COMMIT 이 서버의 답이 아닌 것으로 거절된 판도 503 이다** — 연결의 `'error'`를 동반하지 않는 거절
(pg 의 클라이언트 쪽 `query_timeout`이 그 예다)까지 «서버의 답인가»만 보고 가른다. 이 판을 봉투 500 으로 내면
웹이 «커밋 전»으로 읽어, 고쳐 달 때 두 행이 된다.

Chrome(route — 첫 게시를 서버에 보내 커밋시키고, 그 사이 상태를 바꾼 뒤 브라우저에는 502 → 웹이 곧바로 같은
키로 다시 보낸다):

| 그 사이 | 다시 보낸 것 | 화면 | DB |
|---|---|---|---|
| 역할 editor → viewer | **200(재생)** | 초안 비움 · 목록 `["밥의 말"]` · 장부 `[]` · «번호를 화면에 반영하지 못했습니다»(재생 응답의 `markerOps`는 빈 배열이다 — 번호는 재생이 이 셸에도 다시 보내는 번호 프레임으로 선다. 이 문장을 낼지는 웹이 정한다) | 1행 |
| 멤버에서 뺌 | **200(재생)** | 초안 비움 · 장부 `[]` · 목록 다시 받기가 «프로젝트를 찾을 수 없습니다»(이제 멤버가 아니다) | 1행 |

**커밋 중 틈.** 재생은 잠그지 않고 본다. 첫 게시가 서버에 쥐인 채(페이지 행
잠금) 다시 보낸 것이 오면 행이 아직 없어 가드로 넘어가고, 그 사이 역할이 바뀌었으면 403·404 를 받는다. 가드가
잠금 밖에서 한 번만 돌면 **그 뒤에 첫 게시가 커밋된다** — 작성자가 이미 viewer·비멤버인 행이 서고, «안 달림»을
믿고 고쳐 달면 두 행이다. **그래서 첫
게시도 잠금을 잡은 뒤 권한을 다시 본다**(`auth/roles.ts`의 `recheckProjectRole` — 가드와 같은 술어, 아래 "계층
규칙") — 같은 403·404 로 되돌아가 **다시 보낸 것의 4xx 가 앞 게시에 대해서도 참이 된다.** 가드 앞에서 잠금을
기다리지는 않는다 — 잠금 줄에 서는 것은 가드를 지난 요청뿐이다. 권한이 그대로면 다시 보낸 것은 잠금 안에서
재생이다. 잰 값은 `test/guard-in-lock.test.ts`의 «커밋 중 틈»(api).

**재생이 권한을 잃은 사람에게 돌려주는 것** — 그 사람이 그 키로 단 자기 행과, 그 페이지의 **지금**
`head_seq`·그 노드의 번호다. 앞의 것은 새로 드러나는 것이 아니고 뒤의 둘은 드러난다(같은 키 · 같은 글을
되풀이하면 빠진 뒤에도 그 페이지가 바뀌었는지를 읽는다). 그 행을 스스로 단 사람에게만이다. 같은 되풀이로
드러나는 것이 둘 더 있다(api 로 잰 값):

- **그 노드가 지워졌는지** — 지워지면 재생의 `marker`가 `null`이 된다.
- **자기 행이나 그 페이지가 지워졌는지** — 누가 그 코멘트를 지우면 200 재생이 409(`idempotency-key-deleted`)로, 페이지를 지우면(CASCADE) 404 로 바뀐다. 묘비 판정도 재생과 같은 자리(가드 앞)라 권한을 잃은 뒤에도 같다. «지워졌다» 자체는 묘비가 없어도 «200 이 가드의 403·404 로 바뀐다»로 드러난다 — **묘비가 더 드러내는 것은 «코멘트가 지워졌나 · 페이지가 지워졌나»의 구분 하나**다(409 와 404). 누가 지웠는지는 드러나지 않는다.

**스냅샷 복원은 키를 통째로 비우지 않는다** — 복원은 차이 계획이다(`src/services/restore-plan.ts`: 행을
지우고 · 만들고 · 고친다). 잰 값(실제 HTTP,
같은 키 · 같은 글로 복원 뒤에 다시 보냈다):

| 그 행은 | 복원 뒤 행의 키 | 같은 키를 다시 보내면 |
|---|---|---|
| 스냅샷 **앞**에 달렸고 그 뒤로 남아 있었다 | **그대로** | **200** · 같은 행 |
| 스냅샷 **뒤**에 달렸다 — 복원이 지운다 | (행이 없다 — 묘비가 선다) | **409** `idempotency-key-deleted` |
| 스냅샷 **앞**에 달렸고 그 뒤 지워졌다 — 복원이 되살린다 | **돌아온다**(묘비에서) | **200** · 같은 행 |
| 그 **페이지째** 지워졌고(라우트 `DELETE` · 복원의 `delete-page`) 복원이 페이지를 되살린다 | 스냅샷에 든 행은 **돌아온다** · 스냅샷에 없던 행은 묘비로 남는다(`0014`) | 든 행 **200** · 같은 행 / 없던 행 **409** `idempotency-key-deleted`. 페이지가 없는 동안은 **404** |

**재생의 비교는 지금 행과 한다 — 알려진 한계다.** 첫 게시 뒤 그 코멘트가 **고쳐졌으면**, 처음과 똑같은 것을 다시
보내도 409 `같은 멱등 키로 다른 코멘트가 이미 달렸습니다`다(잰 값: 게시 201 → 본문 PATCH 200 → 같은 키 ·
처음 글 → 409). 웹에서는 다시 보내기가 판정일 때만 나가고(`apps/web/src/panels/comment-panel.tsx`의
`submit`) 그동안 상자는 잠겨 있어 이 화면이 고칠 수는 없다 — 같은 사람이 **다른 탭**에서 그 사이 고친
판이다. **이 409 는 이슈 코드 `idempotency-key-reused`를 싣는다.** 게시가 내는 409 는
둘이고(같은 키 · 다른 글 · 아래 «묘비») 둘 다 `code: "conflict"`라 이슈 코드가 없으면 문장 말고는 가를 값이 없다. 웹은 이
이슈 코드가 실린 409 를 첫 보내기든 다시 보낸 것이든 **«그 키의 게시는 이미 달렸고 그 뒤 고쳐졌다»**로 읽어
초안과 키를 버리고 목록을 다시 받는다(`apps/web/src/panels/comment-panel.tsx`의 `keyVerdict`). 이것을
«달리지 않음»으로 확정하면 초안과 키가 남고, 초안이 탭의 저장소에 비친 뒤로는 **새로고침마다 같은 글 · 같은
키가 되살아나** 누를 때마다 409 다. 잰 값: `test/comments.test.ts`의 «첫 게시 뒤 그 코멘트가 고쳐졌으면 …».
**그래도 서버는 처음 글이 무엇이었는지 모른다** — 고치는 길은 키에 처음 본문의 지문을 남겨 그것과 견주는
것이다. **그 지문은 짓지 않는다** — 웹에서 보이는 해가 없다. Chrome(route — 첫 게시를
서버에 커밋시키고 브라우저엔 연결 끊김 → 같은 키 재전송을 붙잡은 사이 같은 사람이 다른 탭에서 고침): 재전송 409 ·
이 이슈 코드 → «이미 달렸고 그 뒤 고쳐졌습니다» · 상자 비움 · 탭 저장소 `{}` · DB 고친 글 1행.

**묘비 — 그 사이 행이 지워져도 되살리지 않는다.** 키는 **행에** 산다(`comments.idempotency_key`) —
묘비가 없으면 행이 지워질 때 키도 사라져, 같은 키 재전송이 «앞 게시가 없다»로 보고 **새로 커밋한다(201 · 새 id)** —
제 손 · 남의 손 · 복원이 지운 판 전부. 그래서 키가 있던 행을 지울 때 서버가 그 키를 **`comment_tombstones`**에
남기고(`src/db/migrations/0013-comment-tombstones.ts`), 같은 (페이지, 작성자, 키)가 다시 오면 새 행을 세우지 않고 **409 +
이슈 코드 `idempotency-key-deleted`**로 답한다 — 위 `idempotency-key-reused`와 같은 꼴이다. 웹은 그 코드 하나로 «이미 달렸고
그 뒤 지워졌습니다»로 끝낸다(초안 · 키 버림 · 목록 다시 받기 — `apps/web/src/panels/comment-panel.tsx`의 `keyVerdict`).

| 정한 것 | 무엇 | 왜 |
|---|---|---|
| 자리 | **새 테이블** — `comments`의 soft-delete 가 아니다 | soft-delete 면 코멘트를 읽는 자리 전부(목록 · 한 행 · 프로젝트 전량 · 번호의 «남은 수» · 복원 계획 · 캡처 해시)가 지운 행을 걸러야 한다. 여기 두면 읽는 자리가 키 판정 둘뿐이다 |
| 범위 | (페이지, 작성자, 키) — 키와 같다 | 작성자를 빼면 남의 같은 키 게시가 내 묘비에 걸린다 |
| 수명 | **프로젝트가 사는 동안**(`project_id` CASCADE · `page_id`는 FK 가 아니다 — `0014`) — 시간 제한 없음 | 키에 시간 제한이 없다. 페이지는 복원으로 **같은 id 로 되살아나므로** 묘비가 페이지보다 오래 산다(페이지에 매달면 페이지 삭제의 CASCADE 가 묘비를 데려가, 되살린 페이지에서 같은 키가 **201** · 새 행을 세운다). 페이지가 없는 동안의 재전송은 묘비를 보고도 404 다(가드 앞 판정이 페이지를 **뒤에** 본다). 트리거로 CASCADE 까지 묻지 않은 까닭은 `0014`의 머리말 |
| 남기는 자리 | `repos/comments.ts`의 `deleteAndBury` 하나 — **지우기와 묻기가 한 문장**(데이터를 바꾸는 CTE) | 코멘트 하나를 지우는 길(라우트 `DELETE` · 복원의 `delete-comment`)은 `deleteComment`로, 페이지를 지우는 길(`repos/pages.ts`의 `deletePage`)은 CASCADE **전에** `deletePageComments`로 같은 문장을 지난다. 복원의 `delete-page`는 1단계(`delete-comment`)가 그 페이지의 코멘트를 이미 묻었다. 프로젝트 삭제의 CASCADE 는 안 묻는다 — 묘비도 함께 간다 |
| 복원이 같은 id 로 되살리면 | 묘비를 지우며 **키를 되붙인다**(`insertCommentWithId`) | 스냅샷 payload 에는 키가 없다. 되붙이지 않으면 행이 서 있는데 «그 뒤 지워졌다»가 된다 |
| 보는 자리 | 가드 앞(`replayBeforeGuard`) · 잠금 안 — **재생 바로 뒤** | 재생과 같은 이유다. 가드 앞: 권한을 잃은 뒤에도 «안 달림»이 거짓이 되지 않게. 잠금 안: 가드 앞에서 둘 다 못 본 것은 첫 게시가 커밋 중이었을 때뿐이고, 그 뒤 첫 게시와 삭제가 먼저 커밋했으면 여기서 본다 |
| 글 | **견주지 않는다** — 묘비는 본문을 들지 않는다 | 지문은 짓지 않는다(위 «재생의 비교는 지금 행과 한다»). 웹은 글을 고치면 새 키를 짓는다 |
| 누가 지웠나 | **말하지 않는다** — 묘비에 지운 사람이 없다 | 제 손(다른 탭) · 남의 손 · 복원이 같은 답이다 |

**잠금 순서 — 프로젝트 행 → 페이지 행 → 코멘트 행.** 묘비의 FK 가 프로젝트를 가리키므로
묘비 삽입은 프로젝트 행에 `FOR KEY SHARE`를 건다 — 그래서 **묻는 길은 그것을 페이지 행보다 먼저 잡는다**
(코멘트 삭제는 `repos/comments.ts`의 `lockProjectForBurial` · 페이지 삭제는 트리 쓰기의 첫 잠금 `lockProjectTree`). 코멘트
삭제(라우트)는 프로젝트 행(`KEY SHARE`) → 페이지 행(`lockPageForEdit` — `FOR UPDATE`) → 코멘트 행 삭제 + 묘비 삽입(한 문장).
페이지 삭제는 프로젝트 행(`NO KEY UPDATE` — 제 FK `KEY SHARE`와 안 부딪힌다) → 페이지 행(`FOR UPDATE`) → 그
페이지의 코멘트 삭제 + 묘비 삽입 → 페이지 행 삭제. 복원은 프로젝트 행(`FOR UPDATE`) → 페이지 행들 → 코멘트 행들
(`lockProjectForRestore`) → 같은 문장. 게시는 페이지 행 → 키의 행 → 묘비(묘비를 넣지 않으므로 프로젝트 행을 안 잡는다).
코멘트 **수정**은 묻지 않지만 같은 줄에 선다 — 프로젝트 행(`KEY SHARE` · `lockProjectShared`) → 페이지 행(`KEY SHARE` ·
`repos/pages.ts`의 `lockPageShared`) → 멤버 행(재확인) → 코멘트 행 `UPDATE`. 페이지 행을 건너뛰면 코멘트
삭제(재확인 → 코멘트 행)와 페이지 삭제(코멘트 행 → 재확인)가 코멘트 행 · 멤버 행을 **반대 순서로** 잡으므로 어느 순서를 골라도
하나와 엇갈려, 다른 owner 의 역할 변경(`lockOwnerIds`)이 끼면 3자 교착이 선다 — 잰 값은 `test/guard-in-lock.test.ts`의 F3 · F3′.
프로젝트 행을 나중에 잡으면 복원 · 프로젝트 삭제(프로젝트 → 페이지)와 **고리**가 된다 — 잰 값: 코멘트 삭제의
`lockProjectForBurial` · 페이지 삭제의 `lockProjectTree`를 각각 떼면 `test/comment-tombstone.test.ts`의 «코멘트 삭제 ∥ 복원» ·
«페이지 삭제 ∥ 복원»이 각자 교착(`40P01` → 500)으로 죽는다.
**넷 다 페이지 행을 먼저 잡은 뒤에 코멘트를 보거나 지우므로** 삭제와 같은 키 게시는 겹칠 수 없다 — 게시가 잠금을 잡았을 때 삭제는
아직 안 했거나(행이 보여 재생) 이미 커밋했다(묘비가 보여 409). 페이지 삭제가 페이지 행을 **먼저** 쥐는 것도 같은 이유다 — 쥐지 않고
묻으면 줄을 선 게시가 묻기 **뒤에** 커밋해 묘비 없이 CASCADE 로 간다(같은 파일의 «페이지 삭제가 쥐인 첫 게시 뒤에 줄을 서면»).
잠그지 않는 가드 앞 확인은 행 → 묘비 순의 두 조회이고, 둘 사이에 삭제가 커밋되면 묘비를 본다(삭제는 한 문장이라 «행도 묘비도
없는» 순간이 없다). 잰 값은 `test/comment-tombstone.test.ts`의 동시성 판(첫 게시 · 삭제 · 다시 보낸 것 순으로 페이지 행에
줄을 세웠다 — 잠금 안의 묘비 조회를 떼면 201 · 되살림).

**웹이 키를 어디에 드는지**(초안이 성공할 때까지 같은 키 · 초안을 고치면 새 키 · 페이지를 떠나면
버림)는 `apps/web/src/panels/comment-panel.tsx`의 `POST_KEYS`가 갖는다.

### 트리 응답 형태 (`GET /api/projects/:projectId/tree`)

메뉴 폴더와 페이지를 한 트리로 합쳐 좌측 패널에 그대로 쓸 수 있게 낸다(설계서 「설계서 화면 구조」).
`menu`만 있다 — `pages.menu_node_id`가 `NOT NULL`이라 페이지는 항상 메뉴 노드에
속하므로 별도의 `rootPages` 같은 필드는 없다.

```jsonc
{
  "menu": [
    {
      "id": "…", "title": "회원관리", "sortOrder": 0,
      "pages": [ { "id": "…", "title": "목록", "sortOrder": 0 } ],
      "children": [
        { "id": "…", "title": "권한", "sortOrder": 0, "pages": [], "children": [] }
      ]
    }
  ]
}
```

페이지 항목에는 `id`·`title`·`sortOrder`만 있다 — `schema`는 실리지 않는다(트리는
목록을 훑는 용도이고, 스키마를 포함하면 프로젝트가 커질수록 응답이 무거워진다).
페이지 본문(스키마 포함)이 필요하면 `GET /api/projects/:projectId/pages/:pageId`를
따로 호출한다.

### 테마 응답 형태

테마를 내는 응답(목록의 각 항목 · `POST` · `GET` · `PUT`)의 **바탕은 네 키**다.

```jsonc
{ "id": "…", "system": false, "updatedAt": "2026-08-10T…Z",
  "theme": { "meta": { "id": "brand", "name": "브랜드", "version": "1.0.0" }, "tokens": { … } } }
```

**여기에 조건부로 붙는 키가 둘이다** — 아래 `base`와 `warnings`. 둘 다 **없으면 키 자체가
없다**(페이지 쪽 `warnings`·`clientOpId`와 같은 관례).

- **`id`는 행의 uuid, `theme.meta.id`는 slug다.** 경로에 쓰는 것은 `id`다.
- **`system: true`면 읽기 전용이다**(설계서 「테마 관리」). 그 테마는 `project_id IS NULL`이고,
  수정·삭제 시도는 owner여도 **403**이다 — 목록·조회가 이미 그 존재를 보여 주므로
  숨길 것이 없고, 말해야 하는 것은 "읽기 전용"이라는 사실이다. 반대로 **남의 프로젝트
  테마는 404**다(설계서 「권한 모델」의 존재 숨김).
- **상세 조회(`GET .../themes/:themeId`)만 `base`를 낼 수 있다.**
  그 테마가 `meta.extends`를 선언했을 때만 붙고, 값은 **상속 대상 시스템 테마 전문**이다.
  `resolveTheme(document, base)`가 base 없이는 파생 문서의 해석 자체를 거부하므로,
  base를 빼고 내면 클라이언트가 쓸 수 없는 것을 받는다. **목록에는 붙지 않는다** —
  파생 항목마다 시스템 테마 전문이 붙어 응답이 항목 수만큼 부푼다.

- **쓰기 둘(`POST .../themes` · `PUT .../themes/:themeId`)만 `warnings`를 낼 수 있다**
  저장된 테마에 **경고**가 있을 때만 붙고 값은 `ThemeIssue[]`다. 페이지 쪽
  `PUT .../schema`의 `warnings`와 같은 형식이고 만드는 함수도 하나다(`http/warnings.ts`).
  **읽기(`GET`)와 목록은 이 키를 내지 않는다** — 그 라우트들은 테마를 해석하지 않기
  때문이다. 경고를 알아야 하는 클라이언트는 받은 `theme`(파생이면 `base`와 함께)에
  `resolveTheme`을 직접 돌린다(`@wirebound/themes`가 브라우저에서도 돈다). 캔버스가
  이미 그렇게 한다(`apps/web`의 `use-theme-css.ts`).

**저장되는 것은 파생 테마 그대로다.** `extends`를 지닌 채 왕복하고, 병합 결과(홀로
서는 테마)는 저장하지 않는다 — 그것이 저장되는 자리는 스냅샷(설계서 「스냅샷」) 하나뿐이다.

#### 테마 본문 검증 — 400과 422가 갈린다

`PUT .../pages/:pageId/schema`의 게이트(설계서 「정방향 흐름」)와 같은 모양이다.

| 무엇 | 상태 |
|---|---|
| `{ theme }` 봉투 위반(절 이름 오타, `meta` 없음, `meta.id`가 `[A-Za-z0-9_-]{1,64}` 밖, `extends`가 `system:<id>` 꼴이 아님) | **400** |
| 테마에 NUL 문자(U+0000) | **400** |
| 상속 대상 시스템 테마가 **없음**(꼴은 맞지만 그런 이름이 없다) | **422** `bad-extends` |
| 토큰 참조가 안 풀림, 카탈로그에 없는 컴포넌트/구조/조각/변형/상태, 화이트리스트 밖 스타일 프로퍼티 등(**`error`**) | **422**, `issues`에 `ThemeIssue[]`(경고까지 함께) |
| **`warning`만 있음** | **저장된다.** 경고는 성공 응답의 `warnings`에 실린다(위) |
| `(project_id, meta.id)` 중복 | **409** |

**`ThemeIssue`도 `severity`를 갖는다**(`"error"` 또는 `"warning"`) — 페이지의
`ValidationIssue`와 같은 값 집합이고 선을 긋는 것은 `partitionIssues` 하나다.
**`warning`인 테마 이슈는 둘이다**(`@wirebound/themes`의
`THEME_ISSUE_SEVERITY`가 코드마다 정한다):

| 코드 | 언제 | 왜 막지 않는가 |
|---|---|---|
| `suspicious-literal` | 값이 참조처럼 생겼는데 이름공간이 목록 밖이다(`"spce.4"`) | 값이 **적힌 그대로** CSS에 실리고 테마는 선다. 멀쩡한 CSS 리터럴이 그 모양일 수 있어 판정이 확실하지 않다 |
| `node-handle-overwrite` | 테마 스타일이 같은 셀렉터에서 **노드 손잡이**가 내는 CSS 프로퍼티를 낸다 | **테마가 이기는 것이 옳다고 읽는다** — 설계서 「components — 구조 + 스킨」에서 스킨이 구조를 입힌다(그 절은 노드 손잡이와의 순서를 따로 말하지 않는다 — 해석은 `packages/themes/src/spec/handles.ts` 머리말). 결함은 그것이 조용하다는 것뿐이다 |

**상속 깊이는 1단계다**(설계서 「상속과 병합」). `extends`가 가리킬 수 있는 것은 **코드의 시스템 테마**뿐이라
파생 테마를 다시 상속하려 하면 그런 시스템 테마가 없어 422가 된다.

### 프로젝트의 현재 테마 (`GET /api/projects/:projectId/theme`)

설계서 「테이블 정의」의 사슬 `projects.default_layout_id → layouts.theme_id → themes`를 한 번에
따라가 **캔버스가 그대로 쓸 수 있는 테마 하나**를 낸다.

```jsonc
{ "themeId": "…", "theme": { "meta": { … }, "tokens": { … }, … }, "issues": [] }
```

**`themeId`는 고르개를 위한 것이다.** `theme`은 파생을 **합친** 문서라
`meta.extends`가 지워져 있고, `meta.id`(=slug)로 목록과 맞대는 것은 **성립하지 않는다** —
유일성 단위가 `(project_id, slug)`라 시스템 테마와 프로젝트 테마가 같은 slug를 가질 수 있다.
캔버스는 이 값을 읽지 않는다.

**`theme: null`인데 `themeId`가 있을 수 있다** — 상속이 끊긴 파생을 고른 상태다. 반대로
테마 행 자체가 사라졌으면 둘 다 `null`이다.

**`.../themes/:themeId`와 다른 것을 낸다 — 소비자가 다르기 때문이다.**

| 엔드포인트 | 소비자 | 내는 것 |
|---|---|---|
| `.../themes/:themeId` | 테마 저작 UI | **파생 문서 그대로 + `base`** — 편집 대상은 사람이 적은 것이다 |
| `.../theme` | 캔버스·내보내기 | **홀로 서는 테마 하나** — 파생이면 `mergeTheme`으로 합쳐 낸다 |

합쳐 내는 이유: `resolveTheme(document, base)`가 base를 요구하므로 합치지 않고 내면
받는 쪽이 두 인자를 스스로 맞춰야 한다. **합친 결과를 저장하지는 않는다** — 읽을 때
계산할 뿐이고 저장되는 것은 파생 그대로다.

**`theme`이 `null`인 경우가 셋이고 전부 정상이다:** 기본 레이아웃이 없다 · 레이아웃이
테마를 고르지 않았다 · 테마 행이 사라졌다. 그때 화면은 **구조 기본 CSS만으로** 그려진다.
해석 이슈가 나도 422가 아니라 `issues`에 실어 200으로 낸다 — 그리기를 막는 것보다
테마 없이 그리는 편이 낫다.

### 레이아웃

**프로젝트를 만들면 기본 레이아웃이 함께 생긴다**(같은 트랜잭션). 그 문서는 `Page`
하나와 `Slot` 하나이고, `theme_id`는 시스템 `admin`을 가리킨다.

- **레이아웃을 편집하는 엔드포인트는 없다.** 레이아웃은 참조를 나르고 `Slot`을
  담는 그릇이다(설계서 「레이아웃」의 레이아웃 에디터는 없다 — 아래 "이 서버가 만들지 않은 것").
- **저장된 `schema`를 그리는 코드는 없다 — 캔버스는 페이지 문서만 그린다.**
  쓰는 자리는 프로젝트 생성 하나이고, 읽는 쪽이 실제로 쓰는 것은 `theme_id`뿐이다.
  `renderComposed`로 합치면 레이아웃의 루트 `Page`와 `Slot`이 **노드 둘을 더 그려**
  페이지 문서에 없는 `data-wb-id`가 DOM에 섞인다(`packages/renderer/test/compose-identity.test.tsx`).
  그리는 코드가 생기는 것은 레이아웃 에디터가 올 때이고, 그쪽은 **선택 모델부터** 정해야 한다.
- `projects.default_layout_id`와 `layouts.project_id`가 **서로를 가리키는 순환**이라
  `default_layout_id`가 nullable이다. 생성은 프로젝트 → 레이아웃 → 프로젝트 UPDATE
  세 문장으로 닫는다.
- **`layouts.theme_id`는 `ON DELETE RESTRICT`다.** 쓰이고 있는 테마를 지우려 하면
  **409**다. `SET NULL`로 두면 화면이 말없이 달라지므로 실패하는 쪽을 골랐다.
- 마이그레이션 0007 **이전에 만들어진 프로젝트**는 `default_layout_id`가 `NULL`로
  남는다(마이그레이션이 만들어 주지 않는다 — 그 시점엔 `themes`가 비어 있어 테마 없는
  레이아웃만 만들 수 있고, 그것은 레이아웃이 없는 것과 관찰 결과가 같다). 그런 프로젝트에
  레이아웃을 주는 경로는 없다.

### 스냅샷 응답 형태

**스냅샷은 삭제 없는 태그다**(설계서 「스냅샷」). 얼리는 쪽이 이 절, 되돌리는 쪽이 아래 "복원"이다.

응답은 **일곱 키**이고, 상세·생성에만 여덟째(`payload`)가 붙는다.

```jsonc
{ "id": "…", "tag": "v1", "description": "첫 릴리스 직전", "createdBy": "…",
  "createdByName": "장병현", "createdAt": "2026-08-12T…", "payloadBytes": 8123,
  "payload": { /* 상세·생성에만 */ } }
```

`payload`가 담는 것(규격은 `@wirebound/themes`의 `snapshot/payload.ts`가 소유한다):

| 절 | 담는 것 |
|---|---|
| `payloadVersion` | payload **형식**의 버전. `PageDocument.version`과 **다른 축**이다 |
| `capturedAt` | 캡처 시각(ISO) — **Postgres의 `clock_timestamp()`**이고, 뜻은 *"캡처가 payload의 내용을 그대로임을 마지막으로 확인한 순간"*이다. **`snapshots.created_at`과 같은 값이다**(서버가 이 값을 그 컬럼에 심는다) |
| `menu` | 메뉴 노드 평평한 목록(`parentId`가 구조를 나른다) |
| `pages` | 페이지 + **저장된 문서 그대로** + `headSeq`(설계서 「스냅샷」의 요구) |
| `layouts` | 레이아웃 **전부**(프로젝트당 하나라고 가정하지 않는다) |
| `themes` | 레이아웃별 **병합이 끝난 홀로 서는 테마**. 고르지 않았으면 `null` |
| `comments` | 코멘트 + 그 시점의 작성자 이름 |

**겹layer(런타임 상태)는 담지 않는다.** payload 규격이 `z.strictObject`라 선언되지 않은
절이 실리면 그 자리에서 파싱이 죽는다.

**저장된 문서를 마이그레이션하지 않는다.** `CURRENT_DOCUMENT_VERSION`보다 큰 버전의
페이지가 하나 있어도 캡처는 성공한다 — 캡처는 읽기이고, 읽기가 실패하면 사용자는 얼릴
수단 자체를 잃는다(그 페이지의 `GET`은 여전히 400이다).

**테마는 병합된 결과로 얼린다.** 참조만 저장하면 테마가 나중에 바뀌었을 때 스냅샷이 다른
모습으로 복원된다(설계서 「스냅샷」). `mergeTheme` 결과에는 `extends`가 남지 않는다.

**`payloadBytes`는 `octet_length(payload::text)`다** — DB가 들고 있는 문서의 옥텟 수이고,
생성·목록·상세 셋이 같은 식을 쓴다. 설계서 「열린 질문」의 스냅샷 보관 정책을 닫을 관측이라 **상한은
두지 않는다.**

**두 409의 문장이 다르다.** 태그 중복은 *"같은 태그의 스냅샷이 이미 있습니다"*(할 일:
이름을 바꾼다), 지문 불일치는 *"스냅샷을 뜨는 동안 프로젝트가 바뀌었습니다. 다시 시도해
주세요"*(할 일: 다시 시도한다). 코드는 둘 다 `conflict`이므로 **문장이 갈라야** 화면이
가른다.

### 복원

`POST /api/projects/:projectId/snapshots/:snapshotId/restore` · **owner 전용**(설계서 「권한 모델」 — editor는
생성만 한다) · **본문이 없다.**

**이력을 지우지 않는다.** 페이지 문서는 편집 파이프라인(`applyEdit`)을 타므로 되돌림 자체가
**새 revision으로 append**된다(설계서 「스냅샷」). 그 revision의 `actorLabel`은 `복원: <원본 태그>`라
평범한 편집과 구분된다.

```jsonc
{
  "summary": {
    "menu":     { "created": 0, "updated": 1, "deleted": 0 },
    "pages":    { "created": 1, "metaUpdated": 0, "schemaChanged": 2, "schemaUnchanged": 3, "deleted": 1 },
    "comments": { "created": 0, "updated": 0, "deleted": 2 },
    "layouts":  { "themeRefChanged": 1 }
  },
  "safetySnapshot": { "id": "…", "tag": "복원 전 2026-08-12T09:24:30.443Z" },
  "themes": [{ "layoutId": "…", "themeId": "…", "differs": false }]
}
```

**바뀐 페이지 수와 그대로인 페이지 수를 따로 센다.** 내용이 같은 페이지는 `applyEdit`을
아예 부르지 않는다 — 안 바뀐 페이지까지 revision을 만들면 *"복원이 무엇을 바꿨나"*를
이력에서 읽을 수 없다. 비교는 **내용**으로 한다(`headSeq`가 같아도 그 사이 편집했다가
되돌렸을 수 있다).

#### 복원은 먼저 안전망 스냅샷을 뜬다

복원은 **파괴적**이다 — 스냅샷 이후에 만들어진 페이지를 지우면 `revisions.page_id`의
CASCADE가 그 페이지의 이력을 함께 데려간다. 그래서 복원은 **자기 트랜잭션 안에서 먼저
캡처를 부르고** 그 id·태그를 응답에 싣는다. 태그는 `복원 전 <capturedAt>`이고 설명에 원본
태그와 id가 들어간다.

- **바꿀 것이 없어도 만든다.** 안전망은 *"계획이 틀렸을 때"*를 위한 보험인데 만들지 말지를
  그 계획으로 판정하면 보험의 뜻이 사라진다. 대가: 스냅샷은 지울 수 없으므로(설계서 「스냅샷」) 복원
  횟수만큼 태그가 쌓인다.
- **태그가 부딪히면 409다.** 조용히 덮으면 앞 복원의 안전망이 사라지고, 조용히 이름을
  바꾸면 응답이 가리키는 태그와 사용자가 예상하는 태그가 갈린다. 부딪히려면 같은 밀리초에
  같은 프로젝트를 두 번 복원해야 한다 — 재시도로 풀린다.
- **되살아난 페이지는 `head_seq` 0에서 다시 시작한다.** 이력은 되살아나지 않는다(지워질 때
  CASCADE가 데려갔다). 복원이 되살릴 수 있는 것은 **문서**다.

#### 테마는 되돌리지 않는다 — 다름을 말한다

payload의 테마는 **병합 결과**다. 그것을 `themes` 행에 쓰면 파생 테마가 평탄화되어 상속이
영구히 사라지고, 시스템 테마는 애초에 쓸 수 없다(설계서 「테마 관리」). 그래서 복원은 레이아웃의
`theme_id` **참조만** 되돌리고, 그 참조가 지금 내는 병합 결과가 payload의 동결본과 다르면
`themes[].differs`로 말한다. 테마를 되돌리는 경로는 따로 있다(고르개·가져오기).

**`differs`는 키 순서 변경을 보지 못한다.** `snapshots.payload`가 `jsonb`라 캡처가 무엇을
담든 저장되는 순간 키가 정렬되는 반면 `themes`의 절은 `json`이라 원문 순서를 들고 있어서,
순서를 보는 비교는 *"항상 다르다"*만 낸다(실측: 같은 테마의 `meta`가 한쪽 `{id,name,version,
description}`, 다른 쪽 `{id,name,description,version}`). 순서까지 보려면 캡처가 순서를
**값으로** 실어야 하고 그것은 `payloadVersion` 2다.

#### 레이아웃 개수가 다르면 복원하지 않는다

`layouts`에는 `project_id` 유니크가 없어 프로젝트에 레이아웃이 둘 이상일 수 있다. *"하나를
찾아 payload의 하나로 덮는다"*로 짜면 그런 프로젝트에서 **하나를 조용히 버린다.** 레이아웃을
만들거나 지우는 것은 설계서 「레이아웃」의 레이아웃 에디터가 할 일이므로, **id 집합이 다르면 409로 끊고
조용히 맞추지 않는다.**

#### 미지원 버전 탈출구 — **만들지 않는다**

설계서 「스키마 마이그레이션」의 열린 항목(미지원 버전 문서의 복구 경로)을 스냅샷 복원이 떠맡지 **않는다.** 근거는
추측이 아니라 실측한 구조다:

| 조건 | 파이프라인이 어디서 막나 | 실측 |
|---|---|---|
| **저장된** 문서가 미지원 버전 | 2단계 `migrateDocument`가 던진다 | `unsupported-version` — *"지원하지 않는 문서 버전: 999"* |
| **payload의** 문서가 미지원 버전 | 7단계 `after.version !== before.version` | `invalid` — *"version은 편집으로 바꿀 수 없습니다"* |

두 방향 모두 파이프라인이 거부하고, 우회하려면 **파이프라인을 타지 않는 두 번째 쓰기
경로**가 필요하다 — 그것이 정확히 «모든 스키마 변경이 revision을 남긴다»(설계서 「핵심 원칙」)가 두지
않는 것이다. 복원은 그 경로를 되살릴 이유가 되지 못한다: 복원 자체가 저장된 문서를 읽어야
하기 때문이다.

**대신 응답이 원인을 말한다.** 「스키마 마이그레이션」이 *"400 응답이 최소한 원인을 말해 주는 상태로 둔다"*고
한 것을 한 단계 밀어, **어느 페이지가 어떤 버전이라 막혔는지**를 싣는다. 복원 전체가
실패한다(부분 성공을 만들지 않는다).

```
400 지원하지 않는 문서 버전이라 복원할 수 없습니다: 사용자 목록(현재 버전 999)
400 지원하지 않는 문서 버전이라 복원할 수 없습니다: 사용자 목록(스냅샷 버전 999)
```

**막는 술어는 *"복원이 그 페이지의 문서를 쓰는가"*다 — 좁힘이 두 칸이다.**

| 그 페이지를 | 막나 | 왜 |
|---|---|---|
| **지운다**(payload에 없다) | 안 막는다 | 지우는 데 마이그레이션이 필요 없다 |
| **양쪽 문서가 같다**(복원이 건너뛴다 — 위 «바뀐 페이지 수와 그대로인 페이지 수를 따로 센다») | 안 막는다 | 쓰지 않는 페이지를 버전 때문에 막는 것은 같은 페이지를 건너뛰는 규칙과 일관되지 않는다 |
| **되살린다**(`create-page`) | 막는다 | 쓰기다 — 열 수 없는 페이지를 복원이 **만들어 내는** 셈이 된다 |
| **문서를 되돌린다**(`write-page-schema`) | 막는다 | 쓰기다 — 파이프라인도 어차피 거부한다 |

둘째 칸이 없으면 **미지원 버전 페이지가 하나 생긴 프로젝트는 어떤 스냅샷으로도 되돌아갈 수
없다** — 그 페이지를 아무도 건드리지 않는 복원까지 전부 400이다. 「스키마 마이그레이션」이 걱정하는 것은
*"그 페이지를 복구하려는 순간"*이지 *"그 페이지와 무관한 복원"*이 아니다.

#### 복원의 오류 표 — 갈래마다 한 줄

| 상황 | 상태 | 문장(요지) |
|---|---|---|
| 없는 스냅샷 / 남의 프로젝트의 스냅샷 | 404 | 스냅샷을 찾을 수 없습니다 |
| `payloadVersion`이 이 서버보다 크다 | 400 | 이 서버가 읽을 수 없는 스냅샷 형식입니다 (형식 N, 지원 M) |
| 복원 도중 프로젝트가 바뀌었다 | 409 | 복원하는 동안 프로젝트가 바뀌었습니다. 다시 시도해 주세요 |
| 안전망 태그가 이미 있다 | 409 | 복원 전 상태를 저장할 태그(…)가 이미 있습니다. 다시 시도해 주세요 |
| 레이아웃 id 집합이 다르다 | 409 | 레이아웃 구성이 스냅샷과 다릅니다 … 복원하지 않았습니다 |
| 코멘트 작성자가 더 이상 없다 | 409 | 스냅샷의 코멘트를 남긴 사용자가 더 이상 없습니다 (N명) |
| 미지원 문서 버전 | 400 | 지원하지 않는 문서 버전이라 복원할 수 없습니다: 제목(현재\|스냅샷 버전 N) |
| payload 안의 참조가 끊겼다 | 400 | 스냅샷 안의 참조가 끊겨 있습니다: … |
| 만들 페이지의 문서가 검증에 걸렸다 | 422 | 복원할 페이지의 스키마 검증에 실패했습니다: 제목 |
| `applyEdit` 실패 | 파이프라인 표 | **문장 앞에 페이지 제목이 붙는다.** 상태 코드는 `http/edit-outcome.ts` 하나가 소유한다(`stale` 409 · `patch-failed` 409 · `invalid` 422 · …) |

**400과 409를 가르는 선은 *"다시 보내면 풀리는가"*다.** 409 넷은 지금 상태와의 충돌이라
재시도나 프로젝트 수정으로 풀리고, 400 셋은 그 스냅샷·그 배포로는 풀리지 않는다.

**어느 갈래에서 끊기든 아무것도 바뀌지 않는다.** 판정과 다섯 자원의 쓰기가 전부 한
트랜잭션 안에서 돌고, `applyEdit`의 실패는 **값으로 돌려주지 않고 던져서** 롤백시킨다
(값으로 `return`하면 바깥 트랜잭션이 커밋된다).

#### 복원은 자기가 쓰는 동안 남이 못 고치게 한다

트랜잭션 안에서 **프로젝트 행과 메뉴·페이지·레이아웃·코멘트 행을 `FOR UPDATE`로 잠근
뒤** 캡처를 부른다(잠그기 **전에** 읽으면 *"서버가 값을 읽어 밀어붙인다"*가 성립한다).

**무엇이 막히는지 실측했다**(실제 커밋하는 두 커넥션, 음성 대조 포함).
**수를 여기 적지 않는다 — `test/restore-lock-census.test.ts`가 센다.** 그 파일이 분모를
등록된 라우트에서 만들므로 쓰기 라우트가 하나 늘면 먼저 죽는다. 세는 단위와 갈래별 값도
거기 있다.

> **분모를 손으로 적지 않는다** — 손으로 고른 라우트 목록은 **빠진 항목이 결과를 바꿔도
> 아무도 모른다.**

그 파일이 고정하는 성질 셋:

| 성질 | 뜻 |
|---|---|
| **복원이 되돌리는 행을 쓰는 라우트는 하나도 빠짐없이 막힌다** | 복원의 잠금이 실제로 주장하는 명제다 |
| 막히지 않는 줄의 **목록이 고정돼 있다** | 새 줄이 그리로 들어오면 사람이 *"이것이 정말 안 막혀도 되나"*를 다시 판정한다 |
| 잠금 없이는 같은 요청들이 전부 창 안에 끝난다 | *"막힌다"*와 *"그냥 느리다"*를 가르는 음성 대조 |

`FOR UPDATE`는 이미 있는 행에만 걸리고 Postgres에 술어 잠금이 없으므로 *"새 행 삽입"*은
원래 막히지 않아야 한다. 대부분이 막힌 것은 **FK 때문**이다 — 자식 행을 넣으면 Postgres가
참조되는 부모 행에 `FOR KEY SHARE`를 걸고 그것이 `FOR UPDATE`와 충돌한다. 남는 구멍은
*"잠긴 어떤 행도 참조하지 않는 삽입"*이고(네 표만 잠그면 `parent_id`가 `NULL`인
메뉴 삽입), `projects` 행을 잠그면 그것도 닫힌다 — 모든 프로젝트 자원이 `project_id`로
그 행을 참조한다.

**무엇이 막히지 않는지는 `test/restore-lock-census.test.ts`의 «막히지 않는 줄의 목록이 고정돼 있다»가 갖는다** — 목록과 줄마다의
까닭이 거기 있고, 여기 옮겨 적지 않는다(옮겨 적은 목록은 쓰기 하나의 잠금이 바뀔 때 조용히 낡는다).

#### 캡처는 자기가 본 것이 한 시점인지 확인한다

수집 **전후로 지문을 읽어** 다르면 409다. 지문은 payload에 실릴 내용 자체이고
(`readCaptureFingerprint`), 다섯 테이블을 덮는다. **재시도 루프는 없다** —
`PUT .../schema`가 `stale`에서 한 판단과 같다.

**지문이 개수 + `max(updated_at)` 꼴이 아니라 내용인 까닭 — 그 꼴로는 못 잡는 자리가 둘이다:**
`menu_nodes`에는 `updated_at` 컬럼이 아예 없어 제목만 바뀌면 아무 값도 안 움직이고,
`themes.updated_at`은 `now()`(트랜잭션 시작 시각)라 한 트랜잭션 안에서는 얼어 있다.

**실패해도 아무것도 쓰지 않는다** — 캡처는 읽기뿐이고 삽입은 그 결과를 받은 뒤에 한다.

#### `capturedAt`과 `created_at`은 **같은 값**이다

수집 **후** 지문을 읽는 그 문장에서 `clock_timestamp()`를 함께 읽어 `capturedAt`에 담고,
삽입이 그 값을 `created_at`에 심는다. **따로 두면 어긋난다:** `capturedAt`을 Node의 `new Date()`로, `created_at`을 컬럼 기본값 `now()`로
두면 두 값이 어긋난다(수집에 든 시간과 트랜잭션 시작 시각의 차이만큼 — 수십~백 ms 대). `now()`는
`transaction_timestamp()`라 트랜잭션 안에서 얼어 있고, 두 값은 애초에 다른 순간(수집 끝 vs
삽입 트랜잭션 시작)이며, 시계도 둘(Node·Postgres)이다.

**복원이 *"그때"*로 읽어야 하는 값은 `payload.capturedAt`이다.** `created_at`은 그
값의 사본이고, 목록 정렬이 쓰는 것이 그쪽이다.

#### 시스템 테마는 코드가 진실이다

`packages/themes/src/system/`이 시스템 테마를 갖고 있고, 서버가 **기동할 때마다**
그것을 `themes` 테이블에 `project_id IS NULL`로 upsert한다(`services/system-themes.ts`).
DB의 행과 코드가 갈리면 **코드가 이긴다** — 다음 기동이 되돌린다.

**코드에서 사라진 시스템 테마의 행은 지우지 않는다.** `layouts.theme_id`가 그 행을
참조하고 파생 테마의 `extends_ref`가 그 slug를 가리키므로, 코드 한 줄을 지운 결과가
사용자 데이터에 닿아서는 안 된다. 대가로 **해석할 수 없는 낡은 행이 목록에 남을 수
있다**(그 테마를 상속한 파생은 422가 된다).

### 프리셋 응답 형태

프리셋은 **프로젝트가 소유한 페이지 통째 템플릿**이고 테마를 바꿔도 그대로다(설계서 「페이지 프리셋」).
테마 패턴(설계서 「patterns — 테마가 소유한 구성 레시피」)과 다른 것이다 — 패턴은 테마가 소유한 **섹션 단위** 레시피다.

**목록은 내장과 프로젝트 것을 함께 낸다.** `GET .../themes`가 시스템 테마를 함께 내는
것과 같은 형태이고, 뜻도 같다 — *"이 프로젝트에서 **고를 수 있는** 것"*.

`source`가 판별자이고 **키 집합이 갈린다:**

| `source` | `id` | 키 |
|---|---|---|
| `"builtin"` | `builtin:<키>`(`builtin:search-list` 등) | `id` · `source` · `name` · `description` · `nodes` |
| `"project"` | uuid | 위의 다섯 + `createdBy` · `createdByName` · `createdAt` |

**내장 항목에 `createdBy`를 `null`로 싣지 않는다** — 없는 값을 `null`로 말하면 받는 쪽이
*"만든 사람이 지워졌다"*와 가르지 못한다.

**`nodes`는 `WbNode[]`이고 문서 봉투가 아니다.** 적용이 root의 `children`만 바꾸기
때문이다 — root의 `id`·`type`·`props`는 그 페이지의 것이지 프리셋의 것이 아니다.
**목록에도 `nodes`가 실린다**(스냅샷의 `payload`와 갈리는 자리다): 크기가 페이지 하나의
트리라 목록이 이미 나르는 것과 같고, 고른 직후 적용하는 화면이 그것을 반드시 쓴다.

**상세 엔드포인트가 없다.** 목록이 `nodes`를 함께 내므로 고른 뒤 다시 물을 것이 없다.

#### 저장은 `marker`를 버리고 id는 그대로 담는다

- **`marker`를 담지 않는다.** 담으면 적용된 문서에 번호가 있는데 그것을 가리키는 코멘트
  행이 없다 — 코멘트는 `(page_id, node_id)`로 매달려 있고 프리셋은 페이지를 건너 다닌다.
  버리는 자리가 **서버**인 것은 저장 경로가 웹 하나가 아니어도(MCP·CLI) 규칙이
  그쪽에도 저절로 걸리게 하려는 것이다.
- **노드 `id`는 저장 시점 그대로 담는다.** 재발급은 **적용**이 한다(설계서 「페이지 프리셋」). 저장에서
  재발급하면 같은 프리셋을 두 번 적용했을 때 두 페이지가 같은 id를 갖는다.
- **카탈로그 검증을 하지 않는다.** *"이것을 페이지에 놓을 수 있는가"*는 **적용 시점에
  결과 문서 전체로** 판정한다. 여기서 보는 것은 봉투(`WbNodeSchema`)뿐이다.
- **빈 배열이 유효한 본문이다.** 빈 프리셋은 *"치우기"*라는 정상 조작이 된다.

#### 이름에 유일 제약이 없다 — 스냅샷 태그와 갈린다

태그는 *"그때"*를 지목하는 이름이라 유일해야 하고 지울 수도 없다(설계서 「스냅샷」). **프리셋은
지울 수 있고 고르는 것은 id다** — 같은 이름 둘은 사용자의 실수이지 시스템의 모순이 아니다.
그래서 409가 나올 자리 자체가 없다.

### 편집 파이프라인 (`PATCH .../ops`)

`pages.schema`를 바꾸는 **모든** 경로는 `revisions`에 한 행을 append하고
`pages.head_seq`를 그 `seq`로 올린다. 예외는 없다(`PUT .../schema`도 그렇다).

1. 클라이언트는 `GET .../pages/:pageId`로 문서와 `headSeq`를 받는다.
2. 편집을 로컬에 낙관적으로 적용하고, `PATCH .../ops`로 `{ baseSeq: headSeq, ops }`를 보낸다.
3. 서버는 페이지 행을 잠그고, `baseSeq`가 현재 `head_seq`와 같은지 확인하고,
   ops를 적용해 검증한 뒤, `(ops, inverse)`를 `head_seq + 1`로 기록한다.
4. 응답의 `seq`가 다음 요청의 `baseSeq`다. 응답의 `inverse`를 그대로 다시
   `ops`로 보내면 그 편집이 취소된다 — 이것이 undo다. 서버에 undo 개념은 없다.
5. 새로고침 후에는 `GET .../revisions?mine=true`로 자기 revision을 받아
   undo 스택을 복원한다.

**`PUT .../schema`가 만든 revision도 같은 방식으로 되돌린다 — 예외가 아니다.** 그
revision의 `ops`는 `[replace /root, replace /version]`이고 `inverse`에도 `/version`이
남지만, 그것을 그대로 `PATCH .../ops`로 되보내면 200이다. undo가 싣는 `/version`은
같은 값이므로 무연산으로 지나가기 때문이다.

**`version`을 실제로 건드리는 편집은 전부 422다** — 다른 값으로 `replace`하는 것뿐
아니라 `remove`하거나 `move`로 옮기는 것도 그렇다(`version`은 마이그레이션이 소유하는
필드이지 편집 대상이 아니다). 앞의 둘은 파이프라인 7단계가, 뒤의 둘은 봉투 검증이
막는다.

**적용 비용 — 잠금 안에서 도는 몫.** 3단계의 역 계산 · 적용은 페이지 행 잠금을 쥔 트랜잭션
안에서 이벤트 루프를 붙잡는다. `invertOps` · `applyOps`(`packages/schema`)가 문서를 **각각 한 번**
복제하고 ops 는 그 사본에 제자리로 적용하므로, 비용은 «문서 복제 두 번 + ops 수»다 — «ops 수 × 문서
크기»가 아니다. 작은 노드가 많은 1MB 문서에 ops 200줄이 요청 91ms · 옆 요청(`/health`)의 최장 지연
37ms 이고, `taskpolicy -b` 로 느린 CPU 를 흉내 내면 192ms · 104ms 다. 다시 재는 법: `withRealApi` 로
연 앱에 **다른 프로세스**가 `/health` 를 20ms 마다 치게 두고, 문서를 `pages.schema` 에 직접 써 넣은
뒤(1MB 는 본문 한도를 넘는다) `PATCH .../ops` 한 번 동안 가장 긴 `/health` 응답 시간을 본다.

**COMMIT 답을 잃은 편집.** `PATCH .../ops`와 WS `patch`는 COMMIT 의 답을 잃으면(위 "에러 형식"의 503 판) 새 연결로 그 편집의
revision 이 보이는지 **1초 안에** 본다. 보이면 커밋된 것이라 **원래 성공 응답**(`seq` · `revisionId` · `inverse`)을 내고, 그
revision 이 아직 페이지의 머리(`head_seq`)면 **방송한다** — 머리가 더 나아갔으면 방송하지 않는다(룸은 뒤의 `seq`에서 이것을
놓친 줄 이미 안다. 늦게 온 옛 번호를 받는 쪽이 «다음 번호»로 얹으면 뒤 revision 이 빠진 화면이 최신이 된다). 안 보이거나
확인하지 못했거나 1초를 넘기면 503 «모름» 그대로다 — «안 보인다»는 «커밋 안 됨»이 아니다(끊긴 연결의 COMMIT 이 아직 돌 수
있다). 1초를 넘긴 확인은 그 연결째 버린다 — 기다리기만 멈추면 그 연결이 응답 뒤에도 풀 칸을 쥐어, 되풀이되면 풀이 찬다
(`src/db/client.ts`의 `readWithin`). 다시 보낸 것을 알아보는 재생 키를 두지 않은 것은 편집을 내는 쪽이 다시 보내지 않기 때문이다 — 웹은 «모름»이면 페이지를
다시 읽고, MCP 는 재시도하지 않는다. 근거는 `src/services/lost-commit.ts`, 잰 값은 `test/edit-lost-commit.test.ts`.

**편집 밖의 쓰기 넷도 같다** — `PUT .../schema` · 코멘트 삭제 · 재번호는 그 쓰기가 남긴 revision 을, 복원은 안전망 스냅샷을 같은
한도로 확인한다(잰 값은 `test/lost-commit-writes.test.ts`). 보이면 원래 성공 응답이고, 방송은 앞의 셋이 그 revision 이 머리일
때만 · 복원의 `restored`는 늘 보낸다(`seq`를 싣지 않고 받는 쪽이 다시 읽게 하는 프레임이다). 문서를 안 바꾼 삭제 · 재번호는
확인할 행이 없어 503 «모름» 그대로다. **게시는 확인하지 않는다** — 웹이 같은 멱등 키로 다시 보내면 재생이 번호 프레임을 다시
보낸다(위 "멱등 키").

**요청은 직렬화한다.** in-flight 요청은 항상 하나여야 한다 — 앞 요청의 `seq`를
받아야 다음 `baseSeq`가 정해지기 때문이다. 어기면 두 번째 요청이 409를 받는다.
409를 받으면 페이지를 재조회해 `headSeq`와 문서를 다시 맞춘다.

`GET .../revisions`의 항목은 아래 여덟 키를 담는다. `ops`·`inverse`는 저장된 그대로
실려 나온다 — 5단계의 스택 복원이 `inverse`만으로 성립해야 하기 때문이다.

```jsonc
[
  { "id": "…", "seq": 3, "actorType": "user", "actorId": "…", "actorLabel": "홍길동",
    "ops": [ /* … */ ], "inverse": [ /* … */ ], "createdAt": "2026-08-04T09:00:00.000Z" }
]
```

`mine=true`는 `actorType`이 `user`이고 `actorId`가 호출자인 revision만 고른다(생략하면
그 페이지의 이력 전체). `limit`은 1~200이고 기본값은 50이다 — 벗어나면 400이다.
**선언하지 않은 쿼리 키는 그 자체로 400이다**(본문 스키마와 같은 `z.strictObject` 관례).
`?_=1` 같은 캐시 버스터도 거부되므로 이 두 키 외에는 아무것도 붙이지 않는다.

**`PUT .../schema`는 복구 경로가 아니다.** 이 서버가 아는 버전보다 높은 문서가 저장돼
있으면 `GET`·`PATCH .../ops`·`PUT .../schema` 세 경로가 전부 400이다(파이프라인이
**저장된** 문서를 마이그레이션에 태우기 때문에 PUT도 예외가 아니다). 파이프라인을
우회해 스키마를 덮어쓰는 쓰기 경로는 일부러 두지 않았다 — 그것을 되살리면 "모든
스키마 변경이 revision을 남긴다"가 다시 뚫린다.

**복구는 스냅샷 복원의 몫도 아니다.** 복원도 같은 파이프라인을
타므로 미지원 버전 문서를 되살리지 못하고, 오히려 **쓰기 전에 400으로 끊으며 어느 페이지가
어떤 버전인지 말한다**(아래 "복원"). 근거와 실측은 그 절에 있다.

### 실시간 (WebSocket)

`GET /api/projects/:projectId/ws` 하나다(설계서 「정방향 흐름」·「소프트 잠금」). **룸은 프로젝트 단위 하나**이고, 페이지 사건은
프레임에 `pageId`를 실어 받는 쪽이 거른다.

**인증은 REST와 같은 경로다(설계서 「권한 모델」).** 핸드셰이크가 같은 세션 쿠키를 읽고 같은
`projectGuard('viewer')`를 통과한다 — 로그인하지 않았거나 멤버가 아니면 101이 오지 않는다.
**뷰어도 붙는다**: 조회 전용 사용자도 남이 고친 화면을 봐야 한다.

**서버 → 클라이언트**

| `type` | 언제 | 실리는 것 |
|---|---|---|
| `joined` | 붙은 직후, **그 연결에게만** | `projectId` · `connectionId` · `userId` · `role` |
| `presence` | 누가 들어오거나 나갈 때, 룸 전체에 | `projectId` · `participants[{ connectionId, userId, userName }]` |
| `page-changed` | `applyEdit`이 성공했을 때 | `projectId` · `pageId` · `seq` · `ops` · `warnings` · `actor` |
| `restored` | 스냅샷 복원이 성공했을 때 | `projectId` · `snapshotId` · `actor` |
| `patch-ack` | `patch` 프레임이 성공했을 때, **낸 사람에게만** | `projectId` · `pageId` · `clientOpId` · `seq` · `revisionId` · `inverse` · `warnings` |
| `patch-error` | `patch` 프레임이 실패했을 때, **낸 사람에게만** | `projectId` · `pageId` · `clientOpId` · `status` · `code` · `message` · `issues` — **REST 에러 봉투와 같은 값이다** |
| `locks` | 잠금이 바뀌었을 때와 **누가 들어올 때**, 룸 전체에 | `projectId` · `locks[{ pageId, nodeId, userId, userName }]` |
| `lock-denied` | `lock` 프레임을 받지 않았을 때, **낸 사람에게만**(아래 «소프트 잠금») | `projectId` · `pageId` · `nodeId` · (`lock`이 실어 왔으면) `lockId` |
| `pong` | `ping`에 대한 답 | — |

**클라이언트 → 서버**

| `type` | 무엇 | 실어 보내는 것 | 최소 역할 |
|---|---|---|---|
| `ping` | 하트비트 | — | viewer |
| `patch` | 편집 하나(설계서 「정방향 흐름」) | `pageId` · `baseSeq` · `ops` · `clientOpId`(**필수**) | editor |
| `lock` | 노드 하나를 잡는다(설계서 「소프트 잠금」). **같은 노드를 다시 보내는 것이 하트비트다** | `pageId` · `nodeId` | editor |
| `unlock` | 잡고 있는 것을 놓는다 | — (연결 하나가 드는 잠금은 하나다) | editor |

**규격을 어긴 프레임은 연결을 닫는다**(`4400`). 잠금 프레임도 같다 — 하트비트 하나가 규격을
어기면 **편집 채널까지 함께 끊긴다.** 다시 붙으면 서버가 살아 있는 잠금 전부를 흘리므로
배지는 스스로 되찾아진다.

**`patch`의 `clientOpId`가 필수인 것은 ack가 프레임이기 때문이다** — REST에서는 응답이 요청과
짝지어져 오지만 여기서는 이 값 말고 짝지을 것이 없다.

**`page-changed`는 문서 전체가 아니라 `ops`를 싣는다.** 받는 쪽에 아직 보내지 않은 낙관적
편집이 있을 수 있고, 서버 문서로 갈아 끼우면 그것이 화면에서 사라진다. `seq`가 받는 쪽의
새 `headSeq`이고, 그 값이 다음 편집의 `baseSeq`가 된다.

**자기 편집은 자기에게 돌아오지 않는다 — 헤더로 가른다.** 편집 요청에
`x-wb-connection-id: <joined의 connectionId>`를 실으면 그 연결만 브로드캐스트에서 빠진다.
안 실어도 동작한다 — 그때는 자기 편집이 한 번 더 오고, 그 프레임이 HTTP 응답보다 먼저
도착할 수 있다.

**빠지는 것은 그 요청과 같은 세션의 연결뿐이다**(`src/ws/broadcast.ts`의 `sentBy`). 남의 연결
id 를 실으면 **아무도 안 빠진다.** 쿠키 없이 토큰만 든 요청도 아무도 안 뺀다 — WS 는 쿠키로만 열리므로 그
요청을 낸 연결이 없다(같은 사람의 연결을 빼면 에이전트의 편집을 그 사람의 브라우저가 못 받는다). 연결 id 는 무작위다
(`wsc_<uuid>` — `src/ws/connection-id.ts`) — 형식에 기대지 마라. id 만 견주고 id 가 카운터면,
웹이 게시를 다시 보낼 때 싣는 첫 보내기의 id 가 api 재기동 뒤 **남의 새 연결**의 id 가 되어 그 사람이
방송을 못 받는다. 세션까지 견줘도 id 가 카운터면 재기동 뒤 **같은 사람의 새 연결**이 옛 id 를 받아, 옛 셸이
낸 게시의 방송에서 새 셸이 빠진다. id 는 `presence`로 룸의 모두에게 보이므로 무작위여도 id 만 견주면 위조로
남을 뺄 수 있다 — 그래서 **무작위 id 와 세션 대조 둘 다**다.

**연결 도중 권한이 사라지면 그 연결이 닫힌다**(코드 `4403`). 확인 지점은 둘이다: 클라이언트가
프레임을 보낼 때, 그리고 서버가 브로드캐스트를 흘릴 때. 읽을 수 없는 프레임은 `4400`이다.

**하트비트는 앱 수준이다.** 브라우저 `WebSocket`은 프로토콜 ping을 보낼 수 없으므로, 연결이
살아 있는지 재려면 `{"type":"ping"}`을 보내고 `pong`을 기다린다. **재연결도 클라이언트
몫이다** — 브라우저 `WebSocket`은 스스로 다시 붙지 않는다.

#### 소프트 잠금

노드를 고르면 **그 서브트리**에 잠금이 걸린다(설계서 「소프트 잠금」). `lock` 프레임을 보내면 서버가 룸 전체에
`locks` 목록을 흘리고(**낸 사람도 받는다**), 받는 쪽은 자기가 연 페이지의 것만 걸러 배지를 그리고
선택을 막는다.

**서버가 획득을 거절한다**(`src/ws/lock.ts`). 그 자리(또는 겹치는 서브트리 — 조상이든
자손이든)를 **다른 사람**이 쥐고 있으면 `lock`을 받지 않고 **낸 연결에만** `lock-denied`로 답하며, 그
연결이 앞서 쥐고 있던 것도 놓는다. 판정은 화면이 선택을 막는 것과 같은 함수다(`@wirebound/schema`의
`findLockConflict`). **같은 사람의 다른 탭은 막지 않는다**(잠금 소유자는 사람이다). 자격을 보는 사이 그
사람의 멤버십이 잠금을 쥘 수 없게(viewer · 제거) 바뀌어도, **서버가 DB 오류(풀 대기 초과 · 연결 잃음)로 판정까지 못 갔어도**
같은 답이다(그 `lock`이 그 연결의 마지막 `lock`·`unlock`일 때 — 뒤 프레임이 있으면 그것이 답한다). 그래서 `lock`의 답은 둘이다 — 섰으면
`locks` 목록, 안 섰으면 `lock-denied`. **한 연결의 `lock`은 한 번에 하나씩 처리한다** — 처리 중에 온 것은 마지막 것만 남고 밀려난
것은 답이 없다(마지막 `lock`이 답을 받는다). `lock`에 `lockId`(음 아닌 정수 — 선택)를 실으면 거절이 그것을 되돌려준다
— 화면은 마지막으로 보낸 `lock`의 거절만 받는다. **`lockId`를 안 싣는 클라이언트는 거절을 자리로 짝지을 수밖에 없는데, 그것은
틀린다** — 같은 자리를 다시 보낸 뒤에 앞 `lock`의 거절이 닿고 뒤 `lock`은 서는 순서가 난다(남이 그 사이 놓았다 — [api] 쥔 사람이
놓는 사이 같은 자리를 두 번 보낸 150회에 50–59회). 그런 클라이언트는 거절 뒤에 오는 `locks` 목록으로 판정한다. **편집과 획득은 페이지 행에 줄 선다**(`src/lock/check.ts`) —
획득은 편집(그리고 코멘트 게시 · 복원처럼 그 행을 `FOR UPDATE`로 쥐는 쓰기)이 끝날 때까지 기다린다. 그래서 판정을 지난
편집이 방금 선 잠금 아래로 커밋되지 않는다. **그 기다림은 2초까지다**(`src/ws/lock.ts`의 `LOCK_ROW_WAIT_MS` — 값의 근거가 거기 있다) —
넘으면 `lock-denied`다. 한 페이지에서 여럿이 함께 고르는 동안 행이 오래 쥐이면 고르는 연결마다 DB 연결을 하나씩 쥐고 기다려 서버
전체가 503 이 되기 때문이다(편집 자신은 한도 없이 기다린다). **`unlock`은 DB 오류로 끝내지 못해도 놓는다.** TTL 로 걷힌 잠금은 그 방에 `locks`로
알린다(스위퍼 주기는 `src/lock/store.ts`의 `LOCK_SWEEP_MS`).

| 규칙 | 값 |
|---|---|
| TTL | **30초.** 편집이 나갈 때마다 갱신된다(같은 `lock` 프레임을 다시 보내는 것이 하트비트다) |
| 연결이 끊기면 | **즉시 해제된다.** 클라이언트가 할 일이 없다 |
| 연결 하나가 드는 잠금 | **하나.** 새로 잡으면 앞의 것이 그 자리에서 대체된다 |
| `locks` 목록 | **프로젝트의 살아 있는 잠금 전부**다(증분이 아니다). 다음 프레임이 언제나 앞의 것을 고친다 |
| 저장소 | 서버 **인메모리**. 프로세스가 죽으면 함께 사라진다 |

**서버는 편집을 받을 때 잠금을 재확인한다(2차 방어).** 남의 잠긴 서브트리를 건드리는 편집은
**`locked`(423)** 로 거절된다 — `PATCH .../ops`·`PUT .../schema`·`patch` 프레임 셋 다 같다.

> **왜 409가 아닌가 — 이것이 계약이다.**
>
> 409는 *"문서가 내 밑에서
> 움직였다"*는 뜻이고 그 대응은 **재조회 후 재시도**인데, 잠금 충돌은 **재조회해도 안 풀린다**
> (문서가 아니라 사람이 막고 있다). 두 코드를 접으면 클라이언트가 재시도 루프를 돌고,
> 그 사이 잠금이 풀리면 **사용자가 자기가 막힌 줄 모른 채 남의 구역을 편집한 것**이 된다.
>
> **423을 받은 클라이언트가 할 일은 기다렸다 다시 하거나 포기하는 것이다.** 자동 재시도를
> 짜지 마라.

**잠금을 걸지 않고 편집해도 된다**(설계서 「LLM 편집 경로」의 에이전트가 그 길이다). 다만 **남의 잠금에는
막힌다** — 2차 방어는 접속 방식에 따라 갈리지 않는다. 소유자 판정은 **사람 단위**이므로 같은
사용자의 다른 연결이 잡은 잠금에는 막히지 않는다.

**코멘트·복원·가져오기는 잠금을 보지 않는다.** 판정과 근거는
`test/lock-census.test.ts`의 표에 한 줄씩 적혀 있다.

## DB 계층

- `src/db/types.ts` — Kysely `Database` 스키마 인터페이스. 새 테이블은 여기에 추가한다.
- `src/db/client.ts` — `createPool`·`createDb`. 풀의 생명주기는 호출자가 소유한다
  (`main.ts`가 운영에서, 테스트 하네스가 테스트에서 각각 정확히 한 번 닫는다).
- `src/db/tx.ts` — `withTransaction`. 중첩 트랜잭션 처리와 그 한계(JSDoc 참고).
- `src/db/migrations/` — 정적 마이그레이션 레지스트리. `index.ts`가 각 마이그레이션
  파일을 static import로 모은다(동적 `import()` 기반 `FileMigrationProvider`를
  쓰지 않는 이유는 `index.ts`의 주석 참고).
- `src/db/migrate.ts` — `migrate`/`migrate:down` CLI이자 `migrateToLatest` export.
- `src/db/reset-password.ts` — `reset-password` CLI. 서버와 같은 규칙 · 해시 · 세션 삭제를 부른다.

## 계층 규칙

- `repos/`는 SQL만 안다 — HTTP·zod를 모른다. `services/`는 SQL을 직접 쓰지 않고
  HTTP도 모른다 — 순수 도메인 함수(`menu-tree.ts`)와 여러 repo를 조율하는 로직
  (`edit-pipeline.ts`)이 여기 산다. `routes/`는 HTTP·zod만 다루고 SQL을 직접
  쓰지 않는다. API가 주고받는 키는 camelCase, DB 컬럼은 snake_case이고, 그 변환은
  항상 `repos/`가 전담한다.
- 역할(`owner`/`editor`/`viewer`)을 비교하는 코드는 `auth/roles.ts`의
  `roleAtLeast` 하나뿐이다. 다른 곳에서 역할 순위를 다시 비교하지 않는다.
- 프로젝트 하위 라우트는 전부 `auth/roles.ts`의 `projectGuard(minRole)`
  preHandler로 권한을 판정한다(404/403 규칙 포함) — 라우트 파일 자체는 역할을
  비교하지 않는다.
- **페이지 잠금에 서는 쓰기는 커밋 전에 권한과 자격을 한 번 더 본다**(`auth/roles.ts`의
  `recheckProjectRole` · WS 는 같은 몸통 `recheckAtCommit`). 가드는 잠금 **밖**에서
  한 번 돌므로, 재확인이 없으면 잠금을 기다리는 동안 강등·제외된 사람이나 로그아웃·폐기된 세션·토큰의 쓰기가 그 사람 이름으로 커밋된다.
  재확인은 잠금을 잡은 뒤 같은 트랜잭션 안에서 요청의 세션·토큰 행을 `FOR KEY SHARE`로 보고(죽었으면 401 — 가드가 로그인하지
  않은 요청에 내는 값), 가드와 같은 술어·입력으로 멤버 행을 `FOR SHARE`로 잡는다(동시 역할 변경 · 재확인 뒤의 로그아웃이 그
  커밋을 기다린다 — 잠금을 기다리는 동안의 로그아웃은 안 기다린다). **어느 라우트가 대상인지는
  `test/guard-in-lock.test.ts`의 표와 «분모» 절이 소유한다** — **등록된** 쓰기 라우트(Fastify 의
  `onRoute` 값 — 소스 글자가 아니다)와 WS 프레임 종류를 «페이지 잠금에 선다 / 안 선다» 둘로
  빠짐없이 가른다. 안 서는 쓰기도 **다른 잠금**(복원의 프로젝트 잠금 · 자기 행의 행 잠금)에는
  설 수 있다 — 그 틈은 열려 있다.
- **프로젝트를 통째로 다루는 트랜잭션은 프로젝트 행을 먼저 잠근다**(`repos/projects.ts`의
  `lockProjectRow` — 복원과 프로젝트 삭제). 그다음이 페이지다. 한쪽이 페이지를 먼저 잡으면 둘이
  서로를 기다린다 — `test/guard-in-lock.test.ts`의 «잠금 순서» 절이 잰다.
- **그 밖의 프로젝트 쓰기는 프로젝트 행을 `KEY SHARE`로 먼저 잡는다**(`repos/projects.ts`의
  `lockProjectShared` — 테마 고르기 · 수정 · 삭제 · 코멘트 수정 · FK 삽입 다섯). 순서는 «프로젝트 행 →
  자기 행 → 멤버 행(재확인)»이다 — 자기 행부터 잡으면 재확인이 프로젝트 삭제의 CASCADE 와 고리가 되고,
  남의 쓰기가 건 잠금(복원의 레이아웃 행 · 테마 행 `KEY SHARE`)에 선 대기가 재확인보다 늦게 끝난다.
- **프로젝트 행을 안 잡고 «자기 행 → 재확인»으로 가는 쓰기는 프로젝트 삭제가 그 표의 행을 CASCADE 전에 먼저 잡는다** —
  메뉴 제목 쓰기(`lockProjectMenuNodes`) · 프리셋 삭제(`lockProjectPresets`), 둘 다 owner 행 · 재확인 앞이다(`routes/projects.ts`의
  삭제 주석). 안 잡으면 삭제의 CASCADE 가 멤버 행을 쥔 채 그 행에 서서 재확인과 고리가 된다(한쪽 500). 재확인을 쓰기
  **앞**으로 옮기는 것으로는 못 닫는다 — CASCADE 가 표를 지우는 순서(FK 트리거 이름 순)에 기대게 된다. 이 모양의 쓰기를 새로
  세우면 여기에 더한다.
- **멤버 역할 변경 · 제거는 «자격 행 → owner 행 → 멤버 행» 순으로 잡는다**(`repos/members.ts`의 `OwnerRecheck`). 요청한
  사람의 **자격**(세션 · 토큰 행 `KEY SHARE`)은 첫 잠금이고 — 제거는 빠지는 사람의 토큰 행과 요청의 토큰을 한 문장으로 id 순
  잡는다(`repos/api-tokens.ts`의 `lockMemberTokens`) — **역할**은 owner 행을 잡은 뒤 · 쓰기 전에 다시 본다. 자격을 owner 행
  뒤에 보면 토큰으로 낸 멤버 쓰기가 그 토큰의 주인을 빼는 제거 · 프로젝트 삭제(둘 다 토큰 행을 owner 행 앞에서 잡는다)와
  고리가 된다(한쪽 500). 역할을 owner 행 뒤에 보는 까닭: 다른 owner 가 요청한 사람을 내리는 쓰기가 먼저 owner 행을 쥐었으면
  요청은 그 뒤에 서고, 그때 요청한 사람은 이미 owner 가 아니다 — 403(빠졌으면 404). 쓰기 **뒤에** 보지 않는 까닭: owner 가
  자기를 내리거나 빼는 정당한 요청이 자기 쓰기에 막힌다. 쓰기 전이어도 판정은 최종이다 — 요청한 사람이 owner 면 그 행을
  이미 쥐었다.

## 이 서버가 만들지 않은 것

아래는 의도적으로 빠져 있다.

- **서버 리베이스**: `baseSeq`가 어긋나면 서버가 리베이스를 시도하지 않고 곧바로 409를 낸다
  (위 "편집 파이프라인"). 리베이스는 클라이언트가 한다(설계서 「정방향 흐름」).
- **레이아웃 편집**: 레이아웃 문서를 만들고 고치는 엔드포인트. 프로젝트마다 기본
  레이아웃(`Page` 하나 + `Slot` 하나) 하나가 자동으로 생길 뿐, 그것을 바꿀 방법이 없다.
  설계서 「테이블 정의」가 적은 `pages.layout_id`도 없다 — 페이지가 레이아웃을 고르는 경로가 없다.
- **복원이 되돌리지 않는 것**: **레이아웃 생성·삭제**(개수가 다르면 409로 끊는다 — 설계서 「레이아웃」의
  레이아웃 에디터가 올 때 함께 연다)와 **테마 문서 되돌리기**(복원은 참조만 되돌리고 다름을
  보고한다 — 위 "복원").
- **테마의 동시 편집 방어**: `pages`는 `head_seq`로 닫혀 있는데 `themes`에는 그런 것이
  없다. 마지막 쓰기가 이긴다.
- **API 토큰의 만료·회전**: 설계서 「권한 모델」에 그 줄이 없어 근거 없이 정하지 않았다(위 "API 토큰").

## 명령 요약

**이 서버의 것만 든다.** 저장소를 세우는 명령(컨테이너 띄우기·`pnpm install`·
`pnpm build`)과 게이트 넷(`pnpm test`·`typecheck`·`build`·`test:build`)은 최상위
[`README.md`](../../README.md)에 있다 — **두 벌로 적지 않는다.**

```bash
pnpm --filter @wirebound/api dev                   # 개발 서버 (tsx watch)
pnpm --filter @wirebound/api start                 # 개발 서버 없이 한 번 띄운다
pnpm --filter @wirebound/api migrate               # 마이그레이션 최신화
pnpm --filter @wirebound/api migrate:down          # 마이그레이션 하나 내리기(반복 시 0까지)
pnpm --filter @wirebound/api reset-password <이메일>  # 비밀번호 바꾸기(터미널에서 숨겨 묻는다)
pnpm vitest run --project api                      # api 테스트만 실행 (컨테이너 필요)
```

에디터(`pnpm --filter @wirebound/web dev`)는 `/api`를 이 서버로 프록시하므로 **함께
띄운다** — 프록시 대상은 `apps/api/.env`의 `PORT`를 따라간다(최상위 README 「띄우기」 절).
