# P9 이월 — **P9이 닫힌다.** 주 독자는 *"다음에 이 저장소를 여는 사람"*

> 보고: `2026-08-17-p9-5-report.md` · 계획: `2026-08-17-p9-5-mcp-write.md`

이 문서는 P9-5만이 아니라 **P9 전체가 넘기는 것**을 적는다. §15의 로드맵에서 P9이 닫혔고
**남은 것은 P10(PPTX) 하나다.**

**P10만 읽는 문서가 아니다.** 아래 §3의 목록은 대부분 P10과 무관하고, *"이 저장소에서
다음에 무엇을 하든 알아야 하는 것"*이다.

짐작이 아니라 **잰 것만** 적는다. 남이 잰 값에는 귀속을 붙였다.

---

## 1. §12가 무엇으로 서 있나 — 한 자리

### 1.1 다섯 슬라이스가 세운 것

| 슬라이스 | 참이 된 문장 |
|---|---|
| **P9-1** | **lint 규칙이 선다**(§12.4). 규칙이 `packages/schema`·`packages/themes`에 있어 **웹·CLI·MCP가 공유한다** |
| **P9-2** | **`wireb`가 서고 토큰으로 붙는다**(§10·§12.1·§12.3). `login`·`init`·`pull` |
| **P9-3** | **CLI가 읽는다**(§12.3). `page get`·`lint`·`export` |
| **P9-4** | **MCP가 읽는다**(§12.2). stdio 서버 · `list_pages`·`get_page`·`validate` |
| **P9-5** | **MCP가 쓴다.** `patch_page`·`add_comment` · 스킬(§12.5) · **`actor_type='mcp'`**(§7.4) |

### 1.2 오늘의 지도 — 무엇이 어디 있나

```
packages/schema      lint 규칙(설계서) · pageTarget · pageView · patch 유틸       ← 순수
packages/themes      lint 규칙(테마) · SnapshotPayload 규격
packages/cli         wireb · 자격 · 바인딩 · callApi · io · 읽기 조립(read/)
   └ ./embed         MCP 가 쓰는 붙는 자리 (bin 은 안 나간다)
   └ ./test-support  가짜 io · 스냅샷 픽스처 — packages/mcp 도 이것을 본다
packages/mcp         도구 다섯 · stdio 서버 · skill/SKILL.md   ← 조립을 안 한다
apps/api             REST · WS · 편집 파이프라인 · actor 판정(auth/actor.ts)
```

**지켜야 하는 방향 셋:**

1. **조립은 `packages/cli/src/read/` 셋이 한다.** `wireb`도 MCP도 같은 함수를 부른다 —
   두 벌이 되는 길을 `assembly-census` 둘이 막는다.
2. **`packages/mcp`의 런타임 의존은 둘뿐이다**(`@wirebound/cli`·MCP SDK). `@wirebound/schema`를
   더하는 한 줄이 조립을 두 벌로 만드는 문이고, 그 한 줄에서 케이스가 죽는다.
3. **서버를 부르는 자리가 `packages/cli/src/client.ts`의 `send()` 하나다.** 자격·헤더·오류
   갈래가 한 벌로 남는 이유가 그것이고, `x-wb-client`를 빠뜨릴 수 없는 이유도 그것이다.

### 1.3 도구 다섯이 무엇을 지키나

| 성질 | 어디에 |
|---|---|
| **표가 분모다** — 도구를 더하면 목록·인자 검사·설계서 대조·토큰 훑기·리포 훑기가 함께 걸린다 | `packages/mcp/src/tools.ts`의 `TOOLS` |
| **인자에 **없는 것**이 판정이다** — `projectId`·`token`·`config`·`naming`이 없다 | 〃 머리말 · `test/tools.test.ts`의 `ALLOWED_ARGS` |
| **갈래 셋** — JSON-RPC 오류(인자가 틀렸다) · `isError` 결과(못 섰다·서버가 거절했다) · 정상 결과(결함을 찾은 것 포함) | `src/outcome.ts` |
| **`wireb` 종료 코드를 문장 앞에 단다** | 〃 (`[wireb 코드 N]`) |
| **재시도하지 않는다** | `src/handlers.ts`의 `patchPage` |
| **표준출력은 JSON-RPC 프레임뿐이다** | `src/bin.ts` · `build-test/dist-smoke.test.ts`가 **날 스트림을 읽어** 잰다 |

### 1.4 *"누가 고쳤나"* — 오늘의 규칙 (P9-5가 닫았다)

| 자격 | `x-wb-client` | `actor_type` | `actor_id` | `actor_label` |
|---|---|---|---|---|
| 세션 쿠키 | **무시** | `user` | `users.id` | 사람 이름 |
| API 토큰 | `mcp` | `mcp` | **`api_tokens.id`** | **토큰명** |
| API 토큰 | `cli` | `cli` | 〃 | 〃 |
| API 토큰 | 없음 | **`cli`** | 〃 | 〃 |
| 아무거나 | 그 밖 | — | — | **400** |

계약과 근거는 `apps/api/README.md`의 *"누가 고쳤나"* 절이고, 인구조사는
`apps/api/test/actor-census.test.ts`다. **예외 둘**(WS의 `patch` 프레임 · 복원의 revision)이
그 표에 이유와 함께 있다.

### 1.5 계약 목록

**여기 베끼지 않는다** — `2026-08-17-p9-5-report.md`의 §11에 *"어기면 어디서 막히나"*가
스물여섯 줄로 있고, 그 앞 슬라이스의 것은 각 이월의 같은 절에 있다.

---

## 2. 쓰기가 선 뒤에 알아야 할 것 — **바로 걸리는 자리**

| 무엇 | 어디 | 왜 |
|---|---|---|
| **`get_page`의 `headSeq`가 `patch_page`의 `baseSeq`다** | `packages/cli/src/read/page.ts`의 `PageLookup.found` | `PageView` 안이 **아니다**. 넣지 마라 — `pageView`가 만드는 것은 *"문서가 무엇인가"*이고 이것은 *"저장소가 어디까지 왔는가"*다. `wireb page get --json`은 `view`만 찍으므로 CLI·MCP 값 대조가 그대로 산다 |
| **`CliError.status`가 생겼다** | `packages/cli/src/exit.ts` | 409·423을 가르려고 더했다(D3). **종료 코드는 안 늘렸다** — `run`은 여전히 `error.code`만 본다. 문장에서 숫자를 되파지 마라 |
| **`ApiRequest.method`에 `PATCH`가 있다** | `packages/cli/src/client.ts` | P9-2 이월 §1이 예고한 자리를 P9-5가 닫았다 |
| **`Io.client`가 생겼다** | `packages/cli/src/io.ts` | 프로세스의 성질이지 요청의 성질이 아니다. `createNodeIo()`가 `'cli'`, MCP의 `bin.ts`가 `'mcp'`로 갈아 끼운다. **가짜에도 있다**(`FakeIoOptions.client`) — 버리면 자가 눈을 감는다 |
| **`ToolArgSchema`가 셋이다** | `packages/mcp/src/tools.ts` | 갈래를 더하면 `server.ts`의 `assertShape`가 **컴파일로 막는다**(`default` 없는 `switch`). 그 둘을 함께 늘려라 |
| **쓰기 응답 봉투** | `packages/mcp/src/handlers.ts` | 성공은 `applied`/`added` + `headSeq`, 실패는 `reason`·`status`·`message`·`next`. **`next`의 글자가 갈래마다 달라야 한다** — 케이스가 그것을 든다 |
| **스킬은 파일이다** | `packages/mcp/skill/SKILL.md` | `package.json`의 `files`에 `skill`이 있다. 고치면 `test/skill.test.ts`가 `TOOLS`·설계 문서와 대조한다 |

### 2.1 다음 도구를 만들 때 **먼저 죽는 자리** — 값과 함께

P9-5가 도구 둘을 더하고 **실제로 14건이 죽었다**(고치기 전에 세었다). 목록과 개수는 보고서
§1.1에 있다. **P9-4 이월 §4·§2.1이 그중 셋을 안 적었다** — 특히:

- **`packages/mcp/test/attach.test.ts`의 `READ_ARGS`**(2 사망). `no-token-in-response`의 같은
  표는 적혀 있었는데 이쪽만 빠졌다. **둘은 같은 부류다**(분모가 `TOOLS`인 인자 표).
- `tools.test.ts`·`protocol.test.ts`·`dist-smoke.test.ts`가 **`patch_page`를 *"모르는
  도구"*의 예로 쓰고 있었다**(3 사망). 이제 셋 다 `delete_project`를 쓴다 — **§12.2의 표에
  없는 이름**이라 표가 더 커져도 안 걸린다.

---

## 3. **아직 안 닫힌 구멍 — P9 전체에서 모았다**

가리키고 베끼지 않는다. **소유하는 문서로 가라.** ✱는 P9-5가 값이나 사정을 더한 것이다.

### 3.1 순수 스택 · 조립

| 무엇 | 소유 | 상태 |
|---|---|---|
| **`resolveThemeBase` 승격** | P9-1 이월 §3 | **다섯 번째로 넘어간다.** P9-2·P9-3·P9-4가 각각 *"그것 없이 돈다"*로 넘겼고 P9-5도 그렇다 — 쓰기 둘이 테마를 안 본다. **아무도 그것 없이 못 도는 일이 아직 없다** |
| **`filterLintIssues`가 `pageIds`만 받는다** (`--rule`·`--severity`) | P9-3 이월 §6 · P9-4 이월 §3 | 열림. 더할 자리는 `packages/schema/src/lint/filter.ts` **하나**이고 CLI·MCP 어디에도 두지 마라 |
| **`lint`가 겹치는 타겟을 규칙으로 안 본다** | P9-1 이월 §9 · P9-3 이월 §6 · P9-4 이월 §3 | 열림. **`list_pages`가 그것을 값으로 낸다**(`duplicatePaths`) — 규칙을 더하면 두 자리가 같은 것을 말하므로 어느 쪽이 소유할지 정하라 ✱ `patch_page`·`add_comment`도 `ambiguous`로 그 상태를 답한다(셋째 자리다) |
| **lint가 레이아웃 문서를 안 본다** | P9-1 이월 §9 | 열림. `validateLayout`이 있고 payload가 레이아웃을 나르는데 §12.4에 줄이 없다 |
| **⑪이 파생 변형을 안 본다** · **⑥의 표가 둘뿐** · **`themes[].pages`에만 있는 페이지** | P9-1 이월 §9 | 전부 열림 |
| **못 올린 문서 버전 문장이 두 자리에 있다** | P9-4 이월 §3 | 열림(`packages/themes`의 `currentDocument` · `packages/cli/src/read/page.ts`) |
| **`사라진 노드` 문자열이 세 자리에 있다** | P9-3 이월 §6 | 열림. 남은 둘이 `packages/exporter`·`apps/web`이다 |
| **`packages/schema` 쪽 `'page:'`에 census가 없다** | P9-3 이월 §6 | 열림. `promotion-census`가 `apps/api/src`만 훑는다 |

### 3.2 MCP · CLI

| 무엇 | 소유 | 상태 |
|---|---|---|
| **도구마다 스냅샷을 다시 받는다 — 비용을 안 쟀다** | P9-2 이월 §4 · P9-4 이월 §3 | 열림. ✱ **사정이 또 나빠졌다:** `patch_page`가 409를 받으면 스냅샷을 **한 번 더** 읽는다(D4의 재조회). 즉 실패한 쓰기 하나가 전체 payload 두 벌이다. 재는 자리는 여전히 `payloadBytes` |
| **응답 크기 상한이 없다** | P9-4 이월 §3 | 열림. ✱ `patch_page`의 `ops`는 서버가 200개로 자르지만(`OpsBody`) **응답 쪽은 여전히 상한이 없다** |
| **`payloadVersion` 경고가 에이전트에게 안 간다** | P9-3 이월 §6 · P9-4 이월 §3 | 열림. `fetchSnapshot`이 `io.err`로 말하고 stdio 서버의 `err`는 호스트 로그로 간다 |
| **`structuredContent`를 안 쓴다** | P9-4 보고 §3.7 | 열림. ✱ 쓰기 응답도 글자 하나로 나간다 |
| **MCP SDK가 안 쓰는 것을 92개 끌고 온다** | P9-4 이월 §3 | 열림(관측) |
| **`wireb lint`에 `--json`이 없다** | P9-3 이월 §6 | 열림. §12.3에 줄이 없다 |
| **읽을 수 없는 자격 파일이 70으로 나간다** · **`-o`의 조상이 파일이면 70** | P9-2 이월 §6 · P9-3 이월 §6 | 둘 다 열림. 같은 부류다 |
| **`export`가 zip을 통째로 메모리에 올린다** · **바이너리 항목을 못 다룬다** | P9-3 이월 §6 | 열림. **뒤엣것이 P10의 자리다** — PPTX·이미지 자산이 `BundleFile.content: string`에 안 들어간다 |
| **받는 쪽의 `unzip`이 한글 이름을 깬다** | P9-3 이월 §7 | 열림(관측). macOS 기본 `unzip`이 UTF-8 플래그를 안 본다 |
| **Windows 경로** | P9-2 이월 §6 → P9-3 → P9-4 | 열림. ✱ 쓰기 둘도 파일을 안 쓰므로 표면이 안 넓어졌다 |
| **토큰 수명·회전** · **`wireb logout`·`token ls`** | P9-2 이월 §4·§6 | 열림. §10·§12.3에 줄이 없다 |
| **`.gitignore`에 `wirebound-snapshot.json`을 넣을지** | P9-2 이월 §6 | 정하지 않았다 |

### 3.3 `apps/api` · P3의 뒷정리

| 무엇 | 소유 | 상태 |
|---|---|---|
| **흔들리는 케이스 둘**(`comments-concurrency` B5 · `comments`의 순서) | P9-4 이월 §3.1(ⓐ~ⓓ) | 열림. ✱ **P9-5에서 14회 관측 · 빨강 0회**(보고서 §7). 누적 무재현 **40회**(P9-4의 26 + 여기 14). ✱ 이 브랜치는 **`routes/comments.ts`를 건드렸고** B5가 그 파일을 지난다 — 그럼에도 안 나왔다 |
| **에러 코드 거울에 parity 검사가 없다** | P3-3 이월 §5.1 | 열림. ✱ P9-5가 `ApiErrorCode`를 안 늘렸다(`bad-request`·`locked`·`conflict`를 그대로 썼다) |
| **끊긴 것을 화면이 말하지 않는다** · **`presence` 소비자가 없다** · **선택이 편집보다 엄격하다** · **권한이 깎인 연결의 잠금 30초** · **끊김 없는 갭** · **`applyMarkerChange`가 갭 검사 밖** · **재전송 순서** · **코멘트 라우트가 `warnings`를 안 싣는다** | P3-3 이월 §5.2~§5.9 | 전부 열림. **P3의 뒷정리 열두 자리** |
| **`page-changed`의 `actor`를 화면이 안 그린다** | P3-3 이월 §3.2 | 열림. ✱ **이제 그릴 값이 있다** — 프레임이 `{ type: 'mcp', label: '<토큰명>' }`를 실제로 나른다(보고서 §2.2). *"이건 에이전트가 고친 것"*을 실시간으로 보이는 것이 그 자리다 |
| **되받기 가드가 `clientOpId`가 있을 때만 돈다** | P3-3 이월 §3.3 | 열림. **MCP가 낙관적 pending을 만드는 클라이언트를 갖게 되면 다시 봐라** — 오늘 도구는 소켓을 안 연다 |
| **in-flight는 하나라는 전제** | P3-3 이월 §3.4 | 열림. ✱ **P9-5가 그 문장을 값으로 확인했다** — 아래 §4.1 |

---

## 4. P9-5가 새로 남긴 것

### 4.1 **쓰기를 겹쳐 보내면 409다** — 스모크가 냈다

MCP 서버는 도구 호출을 **동시에** 처리한다(SDK의 `Server`가 요청마다 독립으로 답한다).
프레임 여섯을 한 번에 써 넣었더니 응답이 `3 · 4 · 8 · 6 · 7 · 5` 순서로 왔고, 겹쳐 보낸
쓰기 둘 중 하나가 `baseSeq`가 낡아 409를 받았다(값은 보고서 §5.3).

**서버에서 직렬화하지 않기로 판정했다.** 큐에 넣으면 뒤엣것이 **에이전트가 읽은 적 없는
문서** 위에 적용되고, 그것이 D4가 막으려는 상태다. 대신 스킬이 *"쓰기를 겹쳐 보내지 마라"*를
말하고 `skill.test.ts`가 그것을 든다.

**다시 볼 조건:** 호스트가 도구 호출을 자동으로 파이프라인하는 판이 흔해지면, 스킬 한 줄로는
못 막는다. 그때는 **`patch_page`가 자기 in-flight를 아는 것**이 후보다(같은 페이지에 대한
두 번째 호출을 `isError`로 즉시 끊는다) — 서버 쪽 큐가 아니다.

### 4.2 **`actor_type='cli'`를 오늘 만들 수 있는 것은 우리 클라이언트가 아니다**

`wireb`가 `x-wb-client: cli`를 싣지만 **§12.3의 표에 쓰기 명령이 없어** 읽기 요청에만
실린다. 그러므로 DB에 `cli`가 들어가는 길은 **헤더를 안 싣는 남의 클라이언트**(기본값)
하나뿐이다. 값의 뜻이 좁다는 것을 알고 읽어라. `wireb`에 쓰기 명령이 생기는 날 넓어진다.

### 4.3 **스킬을 호스트가 읽는다는 보증이 없다**

파일을 골랐고(보고서 §4) 그 대가가 이것이다. 호스트가 스킬을 설치하지 않으면 에이전트는
`baseSeq`를 지어내고 423에 재시도 루프를 돌 수 있다. **도구 `description`이 그 셋을 짧게
다시 말한다**(*"이 도구는 재시도하지 않습니다"* 등) — 그것이 프로토콜을 타고 반드시
가는 유일한 글자이므로, `description`을 줄일 때 그 문장을 먼저 지우지 마라.

### 4.4 복원의 actor를 안 건드렸다

`services/restore.ts`의 revision actor는 여전히 `user` + `복원: <태그>`다(D10). 바꾸려면
`actor_id`가 `api_tokens.id`가 돼야 하는데 **`?mine=true`가 `actor_type='user'`로 좁히므로
복원 revision이 부른 사람의 undo 스택에서 빠진다** — §7.3을 다시 여는 일이다. 판정과 근거는
`actor-census.test.ts`의 표에 한 줄로 있고, 케이스가 오늘 동작을 고정해 두었으므로 **바꾸는
일은 그 케이스를 다시 여는 일이다.**

### 4.5 헤더 이름이 두 자리에 있다

`apps/api/src/auth/actor.ts`의 `CLIENT_KIND_HEADER`와 `packages/cli/src/client.ts`의 같은
이름. `apps/*`와 `packages/*`가 서로 의존하지 않으므로 손으로 맞추는 자리이고,
`actor-census.test.ts`가 **두 소스에서 글자를 읽어 맞댄다**(`protocol-parity.test.ts`와 같은
자세). **셋째 자리를 만들지 마라** — 그 케이스는 둘만 본다.

### 4.6 `?mine=true`의 뜻이 좁아졌다

토큰 편집이 `cli`·`mcp`가 되면서 그 목록에서 빠진다(보고서 §2.4). **의도한 것이고 케이스가
값으로 고정했다.** 화면이 *"에이전트가 한 편집도 내 이력에서 보고 싶다"*를 요구하면
`?actor=all` 같은 갈래를 더하는 판정이 선다 — `repos/revisions.ts`의 `actorId` 조건 한 줄이
그 자리다.

---

## 5. 안 다룬 것 — 근거와 함께

| 무엇 | 왜 |
|---|---|
| **PPTX** | P10. §15의 마지막 줄이다. §3.2의 *"`export`가 바이너리 항목을 못 다룬다"*가 그 슬라이스의 첫 자리다 |
| **§12.2에 없는 도구**(번들 내주기 등) | 표에 그 줄이 없다. 만들려면 설계서에 줄을 더하는 판정이 선다. 걸릴 자리는 P9-3 이월 §7(한글 이름을 깨는 `unzip`) |
| **`wireb`의 쓰기 명령** | §12.3에 그 줄이 없다. 만들면 §4.2가 닫힌다 |
| **HTTP·SSE 전송** | P9-4 D4가 정한다: `.wirebound.json`을 찾으려면 서버가 에이전트의 cwd에서 도는 로컬 프로세스여야 한다. **원격 호스트가 필요해지는 날 그 D4부터 다시 본다** |
| **`packages/cli`의 붙는 자리를 공유 패키지로 올리는 것** | 소비자가 **둘**이고 셋째가 안 보인다. 이름이 `cli`인 것이 어색하다는 이유만으로 옮기지 마라(P9-4 D3) |
| **도구가 자기 in-flight를 아는 것** | §4.1의 *"다시 볼 조건"*이 서는 날이다. 오늘은 스킬 한 줄로 족하다 |
| **`apps/web`이 `actor`를 그리는 것** | 이 슬라이스는 `apps/web`을 안 건드린다. 값은 이제 프레임에 실려 있다(§3.3) |
