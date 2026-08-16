# P9-4 이월 — 주 독자는 **P9-5(`patch_page`·`add_comment`·스킬)**다

> 보고: `2026-08-17-p9-4-report.md` · 계획: `2026-08-17-p9-4-mcp-read.md`

P9-4가 세운 것은 **MCP 서버와 읽기 도구 셋**이다. 서버가 stdio로 서고
`list_pages`·`get_page`·`validate`가 `packages/cli`의 읽기 층을 부른다. **P9-5의 쓰기 둘은
그 위에 붙는다** — 아래는 붙이기 전에 알아야 하는 것과, 이번에도 안 갚은 빚이다.

---

## 1. P9-5가 통째로 져야 하는 판정 셋 — **여기 베끼지 않는다**

계획서가 ④와 ⑤를 가른 이유가 이 셋이다. **각 문단이 소유하는 문서로 가라.**

### 1.1 §7.4의 잠금 — **`P3-3 이월 §3.1`이 소유한다**

`2026-08-16-p3-3-carryforward.md`의 §3.1 제목이 *"MCP는 잠금을 걸지 않지만 **남의 잠금에는
막힌다** — 이 판정을 다시 보라"*이고, 무엇이 막히고 무엇이 안 막히는지가 값과 함께 거기 있다.
**그 절이 P9에게 다시 보라고 남긴 것 둘**(요청자가 누구인가 · 에이전트가 423을 어떻게 다루나)이
`patch_page`의 자리다.

**P9-4가 그 절에 더하는 것 하나 — 근거를 쟀다.** *"읽기는 잠금과 안 만난다"*가 왜 참인지가
어디에도 안 적혀 있었다. 근거는 **호출자 인구조사**다: `lockConflictError`를 부르는 자리가
`routes/pages.ts` 둘과 `ws/patch.ts` 하나뿐이고 전부 쓰기다. `routes/snapshots.ts`는
`lock/check`를 **import조차 안 한다.** 값은 보고서 §1.7에 있다.

**§7.4가 409에 대해서만 재시도를 적었다는 것**도 그 절이 든다 — 423은 재조회해도 안 풀린다
(문서가 아니라 사람이 막고 있다). 그 규칙이 **도구 쪽**에 필요하다.

### 1.2 `actor_type`·`actor_label` — **`P9-2 이월 §4`가 소유한다**

`2026-08-16-p9-2-carryforward.md` §4의 *"`revisions.actor_type`이 여전히 `user`다"* 절이다.
후보 둘과 각각의 대가가 그 표에 있고, **그 둘을 한 커밋에서 닫으라는 근거**도 거기 있다
(따로 하면 이력에 *"누가 고쳤나"*가 두 규칙으로 적힌 구간이 남고, 그 구간은 나중에 어느
쪽 규칙으로 읽어야 하는지 아무도 모른다). P9-3 이월 §2가 그것을 다시 가리켰고 여기가 셋째다.

**P9-4가 안 닫은 이유는 P9-3과 같다** — 도구 셋이 전부 읽기라 `revisions`에 행을 만드는
자리가 없었다. **`patch_page`·`add_comment`가 그 자리다.**

**P9-4가 더하는 값 하나:** 그 표의 둘째 길(`x-wb-client` 헤더)을 고르면 **헤더를 싣는 자리가
`packages/cli/src/client.ts`의 `ApiRequest` 하나다** — MCP가 자기 HTTP 클라이언트를 안 갖고
그것을 부르기 때문이다(D3). 첫째 길(토큰에 종류를 담는다)을 고르면 `wireb login`과
`POST .../tokens`가 함께 바뀐다.

### 1.3 423을 에이전트가 어떻게 다루나

§1.1의 둘째다. **P9-4가 세운 갈래 표가 그 답의 자리다** — 보고서 §1.3의 셋(JSON-RPC 오류 ·
`isError` 결과 · 정상 결과). 423은 *"명령이 서지 못했다"*도 *"제대로 서서 결과를 냈다"*도
아니라 **기다렸다 다시 하거나 포기해야 하는 상태**이므로, 그 표에 넷째 줄이 서는지부터
판정해야 한다.

---

## 2. P9-5가 곧바로 쓸 수 있는 것

| 있는 것 | 어디 | 무엇에 쓰나 |
|---|---|---|
| 도구 표 하나 | `packages/mcp/src/tools.ts`의 `TOOLS` | 줄을 더하면 목록·인자 검사·설계서 대조가 함께 걸린다. **분모가 그 배열이다** |
| 구현 등록 | `packages/mcp/src/handlers.ts`의 `HANDLERS` | 표에 줄만 더하고 지나가는 경로가 없다(`test/tools.test.ts`가 양쪽에서 분모를 만든다) |
| 갈래 짓기 | `packages/mcp/src/outcome.ts` | `CliError` → `isError` 결과. **`wireb` 종료 코드를 문장 앞에 단다** |
| 프로젝트 열기 | `packages/mcp/src/session.ts`의 `openProject` | 바인딩·자격·스냅샷 두 걸음 |
| 붙는 자리 | `@wirebound/cli/embed` | `callApi`·`requireProject`·`Io`·읽기 층. **`bin`은 안 나간다** |
| 케이스 하네스 | `packages/mcp/test/harness.ts` + `@wirebound/cli/test-support` | 가짜 `io`·스냅샷 픽스처가 `wireb`의 케이스와 **같은 것**이다 |
| 스모크 | `packages/mcp/build-test/dist-smoke.test.ts` | `node:http` 서버와 임시 리포를 이미 세운다. 쓰기 라우트를 더하면 그 자리에 붙는다 |

### 2.1 `patch_page`를 만들 때 **먼저 걸리는 자리**

| 무엇 | 어디 | 왜 |
|---|---|---|
| **`ApiRequest.method`에 `PATCH`가 없다** | `packages/cli/src/client.ts` | 유니온이 `GET`·`POST`·`DELETE`뿐이다(P9-2 이월 §1이 예고했고 P9-3 이월 §6이 옮겼다). **컴파일이 막힌다** |
| **`Io`에 필드를 더하면 가짜도 함께 고쳐야 한다** | `packages/cli/test/fake-io.ts` | 타입이 그 자리를 지킨다(P9-3 이월 §5). **이제 그 가짜를 `packages/mcp`도 본다** — 한 벌이라 한 번만 고치면 된다 |
| **도구 표에 줄을 더하면 설계서 대조가 먼저 죽는다** | `packages/mcp/test/tools.test.ts` | *"쓰기 둘은 아직 없다 — P9-5가 그 자리다"*가 뒤집힌다. **그 케이스를 지우지 말고 뒤집어라** |
| **`no-token-in-response`의 인자 표** | `packages/mcp/test/no-token-in-response.test.ts` | 분모가 `TOOLS`다. 도구를 더하고 그 표에 안 적으면 *"표가 도구를 하나도 안 빠뜨린다"*가 **먼저** 죽는다 |
| **`assembly-census`의 의존 목록** | `packages/mcp/test/assembly-census.test.ts` | 런타임 의존이 둘로 고정돼 있다. `@wirebound/schema`를 더하면 죽는다 — **더해야 하면 그때 판정하라** |
| **`io-boundary`의 목록이 비어 있다** | `packages/mcp/test/io-boundary.test.ts` | `packages/mcp/src`에서 `node:*`·`process.`·전역 `fetch`를 부르면 죽는다 |

### 2.2 §12.5의 스킬을 쓸 때

흐름 다섯 중 **1·2·5가 오늘 돈다.** 스킬이 가르칠 문장에 쓸 값:

- 1단계는 `list_pages`이고 **그 응답의 `pages[].path`가 2·5단계의 인자다.** 다른 이름으로
  부르게 가르치지 마라 — 그 문자열이 §8.1의 타겟이다.
- `validate`의 응답에서 **`failing`만 읽게 가르치면 안 된다.** `notes`가 비어 있지 않으면
  *"결함 0건"*이 *"깨끗하다"*가 아니고, 경로를 줬으면 `outsideErrors`·`droppedProjectIssues`가
  같은 뜻이다(보고서 §3).
- **`isError`가 선 응답은 재시도할 것이 아니라 사람이 고칠 것이다** — 문장 앞의
  `[wireb 코드 N]`이 무엇을 해야 하는지를 말한다(2는 `wireb init`/`wireb login`, 3은 권한,
  4는 서버).

---

## 3. 남긴 구멍 — 옮겨 적는다

| 무엇 | 다음 사람이 알아야 할 것 |
|---|---|
| **`bin.ts`의 표준출력 리다이렉트를 지키는 자가 0이다** | 보고서 §4.2에 값이 있다(M17 — `pnpm test`·`test:build` 둘 다 **0 사망**). 원인은 오늘 도구가 지나는 경로에 `io.out`을 부르는 자리가 하나도 없다는 것이다. **쓰기 도구가 무엇이든 `out`으로 찍는 순간 그 줄이 하중을 받는다** — 그때 케이스를 세워라 |
| **못 올린 문서 버전 문장이 두 자리에 있다** | `packages/themes`의 `currentDocument`(비공개)와 `packages/cli/src/read/page.ts`. 합치려면 `packages/themes`가 그 판정을 함수로 내줘야 한다. **`packages/schema`의 `'page:'`가 세 자리에 있던 것과 같은 부류**(P9-1 이월 §2) |
| **MCP SDK가 안 쓰는 것을 92개 끌고 온다** | 보고서 §1.2에 표가 있다. stdio 경로에서 로드되는 것은 5개다. **`express`·`hono`·`cors`·`jose`·`express-rate-limit`이 하드 의존이라 `pnpm install`이 무조건 받는다** — 이 저장소에는 67개가 새로 왔다(`zod`를 이미 갖고 있었다) |
| **도구마다 스냅샷을 다시 받는다 — 비용을 안 쟀다** | `session.ts`의 머리말에 근거가 있다(낡은 판으로 답하지 않는다 — `wireb lint`가 `pull` 출력을 안 읽는 것과 같다). **P9-2 이월 §4의 *"비용을 안 쟀다"*가 그대로 살아 있고 사정이 나빠졌다** — 에이전트가 사람보다 자주 부른다. `payloadBytes`가 재는 자리다 |
| **`validate`가 `--rule`·`--severity`를 못 거른다** | P9-1 이월 §6이 예고하고 P9-3 이월 §6이 옮겼다. **여전히 `filterLintIssues`가 `pageIds`만 받는다.** 더할 자리는 `packages/schema/src/lint/filter.ts` 하나이고 **CLI에도 MCP에도 두지 마라** |
| **`lint`가 겹치는 타겟을 규칙으로 안 본다** | P9-3 이월 §6 그대로. **다만 `list_pages`가 이제 그것을 값으로 낸다**(`duplicatePaths`) — 규칙을 더하면 그 필드와 규칙이 같은 것을 두 자리에서 말하게 되므로 그때 어느 쪽이 소유할지 정하라 |
| **`structuredContent`를 안 쓴다** | 보고서 §3.7에 판정과 여는 날의 조건이 있다 |
| **응답 크기 상한이 없다** | `get_page`가 문서 전문을 싣고 `validate`가 이슈 전부를 싣는다. 페이지가 수백 개인 프로젝트에서 `list_pages`가 얼마나 큰지 **안 쟀다** — 모델 문맥에 들어가는 값이라 CLI의 `CANDIDATE_LIMIT` 같은 자름이 필요해질 수 있다. **자르면 분모를 함께 말해야 한다** |
| **`payloadVersion`이 높을 때의 경고가 에이전트에게 안 간다** | `fetchSnapshot`이 `io.err`로 말하는데 stdio 서버의 `err`는 **호스트의 로그**로 간다. 응답에 실리지 않으므로 **에이전트는 자기가 모르는 절이 있는 payload를 읽었다는 것을 모른다.** P9-3 이월 §6이 *"MCP도 같은 태도를 쓸지 정하라"*고 물었고, 태도는 같게 했지만 **통로가 다르다는 것은 안 닫았다** |
| **`comments-concurrency`의 B5 케이스가 흔들린다** | **이 슬라이스가 `apps/` 아래를 한 파일도 안 건드렸는데** `pnpm test` 전체가 5번 중 1번 그 케이스에서 빨갰다(파일 하나만 돌리면 5/5 초록). 값과 진단은 보고서 §10에 있다. 요지: 두 요청이 **실제로 겹쳤는지**를 케이스가 강제하지 않아, 직렬화되면 둘 다 200이 되고 그것이 옳은 동작이다. **고치려면 `apps/api` 쪽 판정이 선다** |
| **Windows 경로** | P9-2 이월 §6 · P9-3 이월 §6 그대로. `packages/cli/src/paths.ts`가 POSIX 문자열 조작만 한다. **MCP가 그 표면을 안 넓혔다** — 읽기뿐이라 파일을 안 쓴다 |

---

## 4. 이 슬라이스가 만든 계약 — 어기면 어디서 막히나

| 계약 | 어기면 |
|---|---|
| 조립 원시를 부르는 자리가 `packages/cli/src/read/` 셋이다 | `packages/cli/test/assembly-census.test.ts`가 죽는다 |
| `packages/mcp`는 조립을 안 하고 의존이 둘뿐이다 | `packages/mcp/test/assembly-census.test.ts`가 죽는다 |
| `packages/mcp/src`가 `node:*`·`process.`·전역 `fetch`를 안 부른다 | `packages/mcp/test/io-boundary.test.ts`가 죽는다 |
| `TOOLS`의 이름·용도가 §12.2의 표와 글자 그대로 같다 | `packages/mcp/test/tools.test.ts`가 **설계 문서를 읽어** 죽는다 |
| 도구 인자에 `config`·`naming`·`projectId`·`token` 자리가 없다 | 〃 (D4·D5) |
| 응답 글자에 토큰 원문이 없다 | `packages/mcp/test/no-token-in-response.test.ts`가 죽는다 |
| `wireb page get --json`과 `get_page`가 같은 값을 낸다 | `packages/mcp/test/read-tools.test.ts`가 죽는다 |
| `bin`이 `dist/bin.js`이고 실행 권한과 shebang이 있다 | `packages/mcp/build-test/dist-smoke.test.ts`가 죽는다(`pnpm test`는 초록이다 — 실측) |
| `packages/cli`가 `./embed`을 내준다 | 〃 (`pnpm test`는 **0 사망** — 실측) |

---

## 5. 안 다룬 것 — 근거와 함께

| 무엇 | 왜 |
|---|---|
| **`patch_page`·`add_comment`** | P9-5. 판정 셋(§1)을 그 슬라이스가 통째로 진다 |
| **스킬(§12.5)** | P9-5. 흐름의 4단계가 `add_comment`이므로 쓰기가 선 뒤라야 가르칠 수 있다 |
| **§12.2에 없는 도구(번들 내주기 등)** | 표에 그 줄이 없다. P9-3 이월 §7이 그때 걸릴 자리(받는 쪽의 `unzip`이 한글 이름을 깬다)를 적어 뒀다 |
| **`packages/cli`의 붙는 자리를 공유 패키지로 올리는 것** | 소비자가 **둘**이고 셋째가 안 보인다. 올리는 것은 셋째가 생기는 날이다 — 이름이 `cli`인 것이 어색하다는 이유만으로 옮기지 마라(D3) |
| **HTTP·SSE 전송** | D4가 전송을 정한다(보고서 §1.4): `.wirebound.json`을 찾으려면 서버가 에이전트의 cwd에서 도는 로컬 프로세스여야 한다. **원격 호스트가 필요해지는 날 D4부터 다시 본다** |
| **`resolveThemeBase` 승격** | P9-1 이월 §3 → P9-2 → P9-3 → 여기. **읽기 셋도 그것 없이 돈다**(스냅샷 payload가 병합된 결과를 담는다) |
| **토큰 수명·회전 · `wireb logout`·`token ls`** | §10·§12.3에 줄이 없다. P9-2 이월 §4·§6 그대로 |
| **P3-3 이월 §5의 열두 자리** | P3의 뒷정리다 |
