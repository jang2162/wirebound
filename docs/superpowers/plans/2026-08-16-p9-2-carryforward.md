# P9-2 이월 — 주 독자는 **P9-3**(`page get` · `lint` · `export` · MCP)다

> 보고: `2026-08-16-p9-2-report.md` · 계획: `2026-08-16-p9-2-cli.md`

P9-2가 세운 것은 **자격과 바인딩과 읽기 경로**다. `wireb`가 서고, 토큰으로 붙고,
`wireb pull`이 프로젝트를 로컬 JSON으로 떨어뜨린다. **P9-3의 세 명령은 그 위에서 읽기만
한다** — 아래는 읽기 전에 정해야 하는 것과, 붙일 때 걸리는 자리다.

---

## 0. 첫 일은 이 슬라이스가 만든 것이 아니다 — **`pageTarget` 승격**

**P9-1 이월(`2026-08-16-p9-1-carryforward.md`)의 §2가 P9-3의 첫 일이다.** 그 문단을 여기
다시 쓰지 않는다 — **사본을 만들면 갈린다.** 거기로 가서 읽어라.

거기 있는 것을 이름으로만 가리킨다(내용은 그쪽이 소유한다):

- `pageTarget` · `pageBundleTitle` · `targetedPages` · `duplicateTargets` ·
  `PAGE_TARGET_PREFIX`를 `apps/api/src/services/page-target.ts`에서 `packages/schema`로
  올리는 일과 **그 순서**(먼저 옮기고 그 다음에 `wireb lint`를 짠다).
- `describePageTarget`이 그 상수를 안 쓴다는 경고(`interaction/describe.ts`의 `pageName`).
- **`targetedPages`의 입력에 lint 입력형을 재사용하지 말라는 경고 — `sortOrder`가 없다.**
  그리고 그 구멍을 지키는 케이스 **둘**:
  `apps/api/test/page-target.test.ts:181`(*"형제 순서는 sortOrder다 — 입력 배열 순서가
  아니다"*)와 `:191`(*"하위 메뉴 형제 순서도 sortOrder다"*). **그 둘을 지우지 마라** —
  지우는 순간 §11.3의 보증을 지키는 자가 0이 된다.

**P9-2는 그 자리를 건드리지 않았다.** 계획서가 *"이 슬라이스는 안 건드린다"*로 못박았고,
지금 두 벌을 만들 이유가 없었다.

---

## 1. `wireb lint`·`wireb page get`이 붙을 자리 — 이미 서 있는 것

### 명령을 더하는 자리는 `COMMANDS` 한 곳이다

`packages/cli/src/run.ts`의 `COMMANDS` 배열에 줄을 더한다. **쓰임말이 그 표에서 나오고**,
`test/args.test.ts`의 *"쓰임말이 명령을 하나도 빠뜨리지 않는다"*가 분모를 그 표에서 만들므로
줄만 더하고 쓰임말을 빠뜨리는 경로가 없다.

**여러 마디 명령이 이미 된다.** `matchCommand`가 **긴 마디를 먼저** 맞추고, 마디 뒤의 위치
인자와 옵션이 함께 잡히는 것을 두 마디 명세(`['page','get']`)로 재 두었다(재라 #8). 그래서
`wireb page get <경로> [--json]`은 `COMMANDS`에 줄 하나다.

**주의 하나:** 옵션 표는 **마디를 뗀 뒤**에 걸린다. `wireb --json page get x`는 안 된다 —
명령 마디가 맨 앞에 와야 한다(`git`과 같은 규칙이고, 그러지 않으면 `--server https://x init`의
값이 명령으로 읽힌다).

### 서버를 부르는 자리도 하나다

`packages/cli/src/client.ts`의 `callApi(io, server, request)`. **세 갈래를 그것이 가른다**
(못 닿음 4 · 거절 3 · 됐다 0) — 명령마다 다시 짜지 마라.

**`GET`·`POST`·`DELETE`만 선언돼 있다.** `PATCH`가 필요해지면(MCP의 `patch_page`) 그
유니온에 더한다.

### 종료 코드 표

`packages/cli/src/exit.ts`. 0 · 1(사용법) · 2(설정·자격) · 3(서버가 거절) · 4(못 닿음) ·
70(버그).

**`wireb lint`의 코드를 P9-1 이월 §6이 물었다.** 그 물음(*"`error`가 있으면 1인가,
`warning`도 1인가"*)은 **여전히 열려 있다** — P9-2는 lint를 만들지 않았으므로 정할 근거가
없었다. 다만 **위 표에 그 자리를 쓰지 마라**: 1~4는 *"명령이 서지 못했다"*이고 lint의
발견은 *"명령이 제대로 서서 결함을 찾았다"*다. 둘을 같은 번호에 두면 스크립트가
*"lint가 못 돌았다"*와 *"lint가 결함을 찾았다"*를 못 가른다. **새 번호를 쓰거나
(`grep`이 1을 쓰는 관례를 따르려면) 그 판정을 명시하고 표에 줄을 더해라.**

---

## 2. `.wirebound.json`의 lint 절 — 키는 `lint`다 (판정)

P9-1 이월 §5가 *"어느 키로 오는가"*를 P9-2에게 물었다.

**판정: 최상위 `lint` 키.**

```jsonc
{
  "server": "https://wirebound.example.com",
  "projectId": "prj_a1b2",
  "lint": { "naming": { "page": "…", "menu": "…" } }
}
```

- **`LintConfig`의 모양을 그대로 실는다.** 중간에 이름을 바꾸면 파일과 타입이 두 벌이 된다.
- **§12.1의 예시에 그 키가 없다.** 예시가 `server`·`projectId` 둘뿐이라 어긋남이다 —
  **설계서를 고치지 말고 P9-3 보고서에 적어라.**
- **파서가 모르는 키를 이미 보존한다.** `binding.ts`가 `server`·`projectId` 둘만 보고
  나머지는 건드리지 않으며, `wireb init --force`도 남은 절을 그대로 되쓴다.
  `test/init.test.ts`가 **`lint` 절을 실제 값으로 넣어** 그것을 고정한다 — P9-3이 그 키를
  쓰기 시작해도 이 케이스가 먼저 말해 준다.
- **`init`은 그 키를 만들지 않는다.** P9-1 D5가 *"기본값이 없다"*로 정했으므로 빈 절을
  써 두면 *"안 줬다"*와 *"빈 것을 줬다"*가 섞인다.

**정규식 원문을 그대로 컴파일하는 것의 신뢰 경계**(P9-1 이월 §5.2)는 **여전히 열려 있다.**
P9-2는 그 설정을 읽지 않으므로 판정할 근거가 없었다. **MCP가 같은 설정을 받게 되는 날
다시 봐라** — 그때는 리포의 파일이 아니라 세션이 그 값을 준다.

---

## 3. `wireb pull`의 출력을 lint에 그대로 넣지 마라

**`GET .../snapshot`이 내는 것은 `SnapshotPayload`다.** `POST .../snapshots`가 얼리는 것과
**같은 함수**(`captureSnapshot`)에서 나오므로 절 구성이 같다 — 그것이 D8이 지키려던 성질이고
`apps/api/test/project-dump.test.ts`가 값까지 대조해 고정한다.

**그러므로 P9-1 이월 §1의 매핑 표가 그대로 걸린다.** 그 표(payload의 어느 절이 lint의
어느 절과 이름이 맞고 어디가 안 맞는지)를 여기 베끼지 않는다 — 거기로 가라. 요지만:

- `SnapshotPage`는 문서를 **`schema`**로 들고 lint는 **`document`**로 받는다.
- `target`은 payload에 **아예 없다**(위 §0의 승격이 그것을 만드는 자리다).
- 테마 절은 `{ layoutId, themeId, theme }`이라 `id`도 `document`도 없다.
- **`schemaVersion`을 잊지 마라** — payload는 저장된 문서를 **마이그레이션 없이** 담는다.

**`wireb lint`가 `pull`의 출력 파일을 읽을지 서버를 직접 부를지는 P9-3이 정한다.**
`wirebound-snapshot.json`은 사람이 커밋할 수도 있는 산출물이라 **낡을 수 있다** — 파일을
읽는 쪽을 고르면 *"언제 뜬 것인가"*를 출력이 말해야 한다(`capturedAt`이 payload에 있다).

---

## 4. 토큰에 대해 정하지 않은 것

### 수명·회전이 없다

§10에 그 줄이 없어 **근거 없이 정하지 않았다.** `api_tokens`에 `expires_at` 컬럼이 없다.

- **자격을 거두는 수단은 둘이다:** 폐기(`DELETE .../tokens/:tokenId`)와 **멤버십 제거**.
  뒤엣것이 프로젝트 차원의 회수다(D3대로 역할이 요청 시점에 정해지므로 멤버에서 빼면 그
  사람의 토큰 전부가 그 프로젝트에서 404가 된다).
- **정하려면 무엇이 필요한가:** §10에 줄을 더하는 판정. 컬럼을 더하는 마이그레이션과
  `findApiTokenByValue`에 조건 한 줄이면 되므로 **구현은 작고 판정이 크다.**
- **오늘의 `last_used_at`이 그 판정의 관측이다.** 한 번도 안 쓴 토큰과 오래 안 쓴 토큰이
  갈려 있다(`null`이 앞엣것이다).

### `revisions.actor_type`이 여전히 `user`다

그 컬럼은 `'user' | 'mcp' | 'cli'`를 담을 수 있는데 **채우는 경로가 없다** — 토큰으로 편집을
불러도 `routes/*`가 전부 `{ type: 'user', … }`를 리터럴로 적는다(쟀다).

**P9-3이 그 자리다.** `request.authKind`가 `'token'`인지 이미 알지만 **토큰만으로는
`cli`인지 `mcp`인지 모른다.** 가르려면 값이 하나 더 필요하다 — 후보 둘:

| 길 | 대가 |
|---|---|
| 토큰에 종류를 담는다(`kind: 'cli' \| 'mcp'`) | 발급 시점에 정해지므로 같은 토큰을 둘 다에 쓸 수 없다. `wireb`와 MCP가 같은 자격을 공유하는 오늘의 모양이 깨진다 |
| 요청 헤더로 말한다(`x-wb-client`) | 클라이언트가 스스로 말하는 것이라 **신뢰할 수 없다.** 다만 `actorLabel`은 원래 그런 값이다(사람 이름도 세션이 준다) |

**`actorType`은 감사 기록이지 권한이 아니다.** 그것으로 무엇을 막지 않는 한 뒤엣길이
싸다 — 다만 **그 판단을 명시하고 넘어가라.**

### 비용을 안 쟀다 (재라 #3)

*"`captureSnapshot`을 viewer가 부르는 것이 안전하다"*의 **권한** 쪽은 참이다(읽기뿐이고
내보내기·미리보기도 이미 viewer다). **비용은 여전히 안 쟀다** — 페이지가 수백 개인
프로젝트에서 `GET .../snapshot`이 얼마나 도는지. 그런 프로젝트가 이 저장소에 없다.

**CLI가 그것을 반복해서 부를 수 있는 것이 새로 생긴 사정이다.** `wireb pull`은 사람이
치지만 P9-3의 MCP는 에이전트가 부른다. 재는 자리는 `payloadBytes`가 이미 있다
(`snapshots` 표의 그 열은 §16의 보관 정책을 닫을 관측으로 남겨 둔 값이다).

---

## 5. CLI를 늘릴 때 걸리는 자리

| 무엇 | 어디 | 왜 걸리나 |
|---|---|---|
| **`node:*`를 명령에서 부르면 죽는다** | `test/io-boundary.test.ts` | 목록이 `bin.ts`·`node-io.ts` 둘로 고정돼 있다. `node:util` 같은 **순수한 것**은 안 센다(술어가 *"바깥 세계를 만지는가"*다) |
| **리포에 토큰을 쓰면 죽는다** | `test/no-token-in-repo.test.ts` | 명령 셋을 돌린 뒤 **리포 아래 파일 전부**를 훑는다. 파일이 하나 늘면 그 목록 단언이 먼저 말한다 |
| **`bin`이 안 서면 죽는다** | `build-test/dist-bin.test.ts` | `pnpm test`가 아니라 **`pnpm test:build`**가 돌린다. `tsdown.config.ts`의 `fixedExtension: false`를 지우면 여기서 9건이 죽고 `pnpm test`는 0건이 죽는다(실측) |
| **쓰임말에 안 실리면 죽는다** | `test/args.test.ts` | 분모를 `COMMANDS`에서 만든다 |

**가짜 `io`는 `test/fake-io.ts` 하나다.** 명령마다 지역 사본을 만들지 마라 — 무엇보다 D6의
census가 *"리포에 쓴 파일 전부"*를 훑으려면 그 기록이 한 곳에 모여 있어야 한다.

**`Io`에 필드를 더할 때:** `promptSecret`·`readStdin`이 tty 여부를 **`null`로** 말한다
(예외가 아니다). 새 필드도 그 결을 따라라 — 명령이 `try/catch`로 정상 갈래를 다루게 되면
`io`를 인자로 받은 뜻이 흐려진다.

---

## 6. 안 다룬 것 — 근거와 함께

| 무엇 | 왜 |
|---|---|
| **Windows 경로** | `packages/cli/src/paths.ts`가 POSIX 문자열 조작만 한다(`node:path`를 안 쓴다 — D9의 경계). `engines`가 플랫폼을 좁히지 않으므로 **언젠가 걸린다.** 재 본 것은 macOS·Linux다 |
| **`wireb`를 npm에 내는 것** | 패키지가 전부 `private: true`다. 계획서가 슬라이스 밖으로 뒀다 |
| **`wireb logout` / `wireb token ls`** | 폐기 라우트는 **서버에 있다**(`DELETE .../tokens/:tokenId`). CLI 명령을 안 만든 것은 §12.3에 그 줄이 없기 때문이다 — 만들려면 §12.3에 줄을 더하는 판정이 선다 |
| **토큰 여러 벌 중 고르기** | 자격 파일이 `(server, projectId)`로 여러 벌을 담지만 **한 리포는 한 프로젝트다**(§12.1). 고르개가 필요해지는 것은 한 리포가 여러 프로젝트를 보게 되는 날이고 §12.1이 그것을 허용하지 않는다 |
| **`.gitignore`에 `wirebound-snapshot.json`을 넣을지** | **정하지 않았다.** 커밋할지 말지는 그 리포의 판단이고(설계서를 리뷰에 싣고 싶은 팀이 있다) `wireb`가 남의 `.gitignore`를 고치는 것은 과하다. **다만 P9-3이 `lint`를 그 파일에서 읽는 쪽을 고르면 그때 다시 봐라** — 낡은 파일로 lint를 돌리는 사고가 그때 생긴다 |
