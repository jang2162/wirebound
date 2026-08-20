# 워크트리마다 컨테이너 — 독립 리뷰

> 대상: 브랜치 `fix/per-worktree-container`(`719f143`) · 계획
> `2026-08-19-per-worktree-container.md` · 구현자 보고 `…-report.md`
> **리뷰어는 코드도 문서도 안 고쳤다.** 아래는 전부 **이 리뷰어가 다시 잰 값**이고,
> 남이 잰 값을 옮긴 자리에는 귀속을 붙였다.

**판정: 병합 가능.** 게이트 넷을 다시 돌려 전부 **0**, 급소(D2)의 세 다리를 **네 갈래로**
흔들어 전부 죽는 것을 봤고, 문서만 보고 워크트리 둘에 각자 컨테이너를 띄워 격리가 서는 것을
**교차 로그인 200/200/401/401**로 봤다. **코드 결함은 못 찾았다.** 대신 **자가 없는 자리 둘**과
**문서 결함 셋**을 찾았다 — 그중 **R-1 은 병합 전에 고치는 쪽을 권한다**(잃어버린 데이터를
찾는 진단 규칙이 이 슬라이스로 거짓이 된다). 나머지는 병합 뒤에 해도 된다.

**이 기계.** macOS · Apple Silicon · Node **22.23.1** · **Docker Compose 5.1.4** · vitest 3.2.7.

**사용자 데이터.** 시작 `14|16|358`, 끝 `14|16|358`. `wirebound-postgres` 는 시작과 끝 모두
`Up (healthy) · 0.0.0.0:5433`. `docker compose down -v` 를 **한 번도 안 썼다.** 포트 3001·5433 을
**안 썼다**(쓴 것은 3031·3032·3041·3042·15533·15534·19021·19077). 만든 임시 컨테이너 여섯·볼륨
넷·워크트리 둘을 **전부 지웠다**(§9).

---

## 1. 게이트 넷 — 전부 0 (종료 코드를 파이프 없이 따로 찍었다)

돌리기 전에 `ps` 로 **다른 vitest 가 0 개**인 것을 확인했다.

| 게이트 | 종료 코드 | 관측 | 구현자 보고 |
|---|---|---|---|
| `pnpm test` | **0** | Test Files **279 passed (279)** · Tests **5166 passed (5166)** · Duration **110.29s** | 279 / 5166 / 113.01s — **같다** |
| `pnpm typecheck` | **0** | — | 0 |
| `pnpm build` | **0** | — | 0 |
| `pnpm test:build` | **0** | Test Files **6 (6)** · Tests **72 (72)** | 6 / 72 — **같다** |

이 게이트는 **이 워크트리의 컨테이너(15433)** 에 붙어서 돌았다. 사용자의 5433 이 아니다.

---

## 2. 급소(D2) — **세 다리를 네 갈래로 흔들었다. 어긋난 채로 도는 길을 못 찾았다**

구현자는 *"포트가 어긋나면 서버·migrate·pnpm test 가 전부 안 돌고 어디가 어긋났는지 말한다"*
고 했다. **셋 다 쟀고 참이다.** 그리고 **어긋남을 넣는 자리를 네 갈래로 갈라** 각각 쟀다.

| # | 어긋남을 어디에 넣나 | `pnpm start` | `pnpm migrate` | `pnpm test` |
|---|---|---|---|---|
| ⓐ | **셸** `POSTGRES_PORT=15999` (파일의 `DATABASE_URL` 은 15433) | **1** | **1** | **1** |
| ⓑ | **셸** `DATABASE_URL=…:15999` (파일의 `POSTGRES_PORT` 는 15433) | **1** | **1** | — |
| ⓒ | **`.env` 만** 고침 (`POSTGRES_PORT=15999`) | **1** | **1** | — |
| ⓓ | 둘 다 셸로 주고 **맞춤**(15433/15433) | 정상 | **0** · `마이그레이션 완료` | — |

**ⓑ 가 값이 있다** — 어긋남을 반대쪽에 넣어도 문장이 *"POSTGRES_PORT=15433 ← docker compose 가
이 포트를 연다 / DATABASE_URL → 127.0.0.1:15999/…"* 로 **양쪽 수를 다 든다.** 어디를 고칠지
사람이 고르게 되어 있다.

`pnpm test` 쪽은 다른 자리에서 죽는다 — 그것이 옳다:

```
 ❯ resolveTestDatabaseUrlFrom apps/api/test/test-database-url.ts:43:11
 ❯ apps/api/test/helpers.ts:22:79
```

**`resolveTestDatabaseUrlFrom` 이 유일한 입구인 것도 확인했다** — `helpers.ts:15` 의
`export const TEST_DATABASE_URL = resolveTestDatabaseUrlFrom(process.env)` 하나뿐이고,
검사를 안 지나는 `resolveTestDatabaseUrl` 을 부르는 자리는 **케이스 안에만** 있다.

### 2.1 **어긋난 채로 도는 길** — 다섯 갈래를 따져 봤고 넷은 시끄럽다

| 길 | 무엇이 보이나 | 판정 |
|---|---|---|
| `--env-file` 을 뺀 `up -d` | compose 가 5433 을 열고 `.env` 는 다른 수를 가리킨다 → 그 포트에 아무것도 없으면 `Error: connect ECONNREFUSED 127.0.0.1:<포트>`(쟀다, 종료 1) | **시끄럽다** |
| 저장소 루트에서 `up -d` 를 치고 워크트리에서 붙기 | 프로젝트가 달라 **빈 볼륨**의 컨테이너가 뜬다 → `database "wb_<이름>" does not exist` | **시끄럽다 — DB 이름을 가른 덕이다** |
| `POSTGRES_PORT` 를 고치고 컨테이너를 안 다시 띄우기 | 옛 포트에만 컨테이너가 있다 → `ECONNREFUSED` | **시끄럽다**(README 3.1 이 그 줄을 든다) |
| **포트가 겹친 뒤 한 번 더 `up`** | 둘째 컨테이너가 **포트 없이** 뜨고 그 포트는 첫째가 잡고 있다 | **포트 검사가 못 잡는다 → §4** |
| 접속 문자열이 루프백이 아닌 호스트 | 검사가 **안 돈다**(설계다 — `POSTGRES_PORT` 는 이 기계에 여는 포트다) | 의도대로 |

**어긋난 채로 조용히 도는 길은 마지막 하나뿐이고, 그것을 시끄럽게 만드는 것이 DB 이름이다**
— 구현자의 §4 판정(이름 가르기를 안 걷었다)이 **옳다.** §4 에서 재현했다.

---

## 3. 계획서 문장 둘 — **구현자의 판정을 재고 하나는 고쳐 적는다**

### 3.1 *"빈 DB 로 뜬 서버는 존재하지 않는다"* — **참이다**

이 워크트리의 컨테이너에 빈 DB(`wb_rv_empty`)를 만들어 서버를 걸었다. **종료 코드 1**, 그리고
사람이 먼저 읽는 것이 새 문장이다:

```
Error: 이 DB 는 비어 있습니다(마이그레이션 0건): 127.0.0.1:15433/wb_rv_empty
새 볼륨이면 정상입니다 — 마이그레이션을 올리십시오:
  pnpm --filter @wirebound/api migrate
데이터가 있어야 하는데 비었다면 지우지 말고 다른 이름의 볼륨을 찾으십시오: docker volume ls
    [cause]: error: relation "themes" does not exist … code: '42P01'
```

**D3 이 걱정하던 조용한 상태는 애초에 없다** — 구현자 말이 맞다. 그리고 **말하는 자리를 실패
경로로 옮긴 판정이 옳다.** 원문(`42P01`)이 `cause` 로 남는 것도 확인했다 — 다른 갈래를 이 문장이
삼키지 않는다.

> **작은 관측 하나.** 새 문장 아래로 **kysely 스택이 마흔 줄쯤 그대로 따라온다.** 사람은
> 문장을 먼저 읽으므로 목적은 달성되지만, *"스택 스무 줄을 안 읽게 한다"* 는 아니다. 원인을
> 안 지운 것은 옳은 선택이라 **결함으로 안 세운다.**

정상 경로도 쟀다: `이 서버가 보는 DB: 127.0.0.1:15433/wb_fixpwc · 마이그레이션 11건`.

### 3.2 *"한 자리로 모으기는 불가능하다"* — **근거 둘은 참인데 결론이 과하다 (R-6)**

구현자가 든 근거 둘을 **각각 재현했다. 둘 다 참이다.**

| 근거 | 재현 |
|---|---|
| compose 는 접속 문자열에서 포트를 못 뽑는다 | `${DATABASE_URL##*:}` 를 넣으니 compose 가 **거부한다**: `invalid interpolation format for services.p.environment.A.` |
| Node 는 `.env` 안에서 `${VAR}` 를 안 편다 | Node **22.23.1**, `util.parseEnv` 와 `node --env-file` **양쪽** 모두 `postgres://…:${POSTGRES_PORT}/db` 를 **문자 그대로** 냈다 |

**그러나 그 둘이 배제하는 것은 "두 자리가 서로를 읽는 길"이지 "한 자리를 없애는 길"이 아니다.**
반대 방향 — **접속 문자열을 코드가 조립하는 것** — 은 열려 있고, 그 두 다리를 쟀다:

- **compose 는 같은 `--env-file` 에서 포트 말고도 받는다.** `POSTGRES_DB: ${POSTGRES_DB:-wirebound}`
  를 넣고 `docker compose --env-file … config` 를 치니 `C: wb_x` 가 나왔다.
- **Node 는 그 둘로 URL 을 만들 수 있다.** `postgres://…:${POSTGRES_PORT}/${POSTGRES_DB}` 를
  `util.parseEnv` 로 읽은 값에서 조립하는 데 아무것도 안 걸린다.

즉 `.env` 가 **포트와 DB 이름만** 들고 `DATABASE_URL` 을 `config.ts` 가 조립하면 **어긋날 자리가
애초에 생기지 않는다.** 그것이 더 나은 설계다.

**그래도 이 슬라이스를 막지 않는다.** 세 가지 때문이다:
ⓐ `DATABASE_URL` 을 직접 적는 사람(자기 Postgres·원격 DB)에게는 검사가 **여전히 필요하다** —
그 길을 없앨 수는 없다. ⓑ `DATABASE_URL` 을 필수에서 선택으로 바꾸는 것은 이 슬라이스의 범위
밖이고 기존 사용자의 계약을 건드린다. ⓒ 구현자가 고른 ⓑ(`--env-file apps/api/.env` + 검사)는
**검사를 서버 안에 둘 수 있는 유일한 길**이라는 근거가 옳다.

**고쳐 적을 문장은 이것이다:** *"불가능하다"* 가 아니라 **"두 자리가 서로를 읽는 길은 없다.
한 자리를 없애는 길(접속 문자열을 코드가 조립하는 것)은 있으나 이 슬라이스에서 안 골랐다"**.
보고서 §2·§11 과 `port-agreement.ts` 머리말이 그 자리다. **미결 장부에 한 줄로 남기는 것으로
충분하다.**

---

## 4. `container_name` 을 걷은 대가 — **아무것도 안 막는 것이 맞다. 재현했다**

임시 프로젝트 둘(`stagea`·`stageb`, 포트 19021)로 **사용자 자원을 안 건드리고** 쟀다.

| 걸음 | 관측 |
|---|---|
| A `up -d` | 종료 **0** · `stagea-postgres-1` · `0.0.0.0:19021->5432` |
| B `up -d` **첫 번째** | 종료 **1** · `Bind for :::19021 failed: port is already allocated` |
| B `up -d` **그대로 한 번 더** | 종료 **0** · `Container stageb-postgres-1 Started` |
| 그때 B 가 보는 것 | `stageb-postgres-1` · **PORTS 칸이 빈 칸** · `Up (healthy)` |

**그 포트에 붙으면 누가 답하나 — 직접 쟀다.** A 의 `wirebound` 에 `whoami='STAGE_A'` 를 심고
호스트 포트 19021 로 물으니 **`STAGE_A`** 가 나왔다. **B 의 서버는 A 의 DB 를 읽고 쓴다.**

**그리고 시끄럽게 만드는 것이 DB 이름인 것도 쟀다.** 같은 포트에 **다른 이름**으로 붙으니:

```
FATAL:  database "wb_b" does not exist
```

**두 컨테이너의 DB 목록이 글자 하나까지 같다**(`wirebound`·`wirebound_test`). 이름을 안 가르면
**아무 에러도 안 난다.** → **구현자의 D4 판정(이름 가르기를 절차에서 안 걷는다)이 옳다.**

### 4.1 **문서가 그것을 맞게 적었나 — 하나가 틀렸다 (R-1)**

**맞게 적은 것.** README §6.3 은 *"이름 충돌이 막아 준다"* 를 **완전히 걷었고**, 프로젝트 이름이
**격리 기전**이라는 것과 볼륨이 `<프로젝트>_wirebound-pgdata` 로 갈린다는 것을 든다. ⓑ 에 위
*"한 번 더 치면 조용해진다"* 가 **직접 관측으로** 들어가 있고 *"`up -d` 뒤에 `PORTS` 칸을 보라"*
까지 있다. §3.1 의 표에도 같은 줄이 있다. **여기는 정확하다.**

**틀린 것 — 잃어버린 데이터를 찾는 진단 규칙이다.** §6.3 이 이렇게 못박는다:

> **읽을 것은 크기가 아니라 모양이다: `LINKS` 가 1 인 것이 지금 쓰이는 볼륨이고 나머지는 `0` · `0B` 다.**

**오늘 이 기계에서 그것이 거짓이다** — `docker system df -v` 를 쳤다:

```
VOLUME NAME                                    LINKS   SIZE
feat-p2b1-editor-shell_wirebound-pgdata          0      0B
fix-per-worktree-container_wirebound-pgdata      1      150.9MB     ← 리뷰용 워크트리
feat-p1-api_wirebound-pgdata                     1      186.5MB     ← 설계서
wirebound_wirebound-pgdata                       0      0B
```

**`LINKS` 가 1 인 것이 둘이다.**

> **지금 다시 치면 하나로 보인다** — 리뷰가 끝나며 그 워크트리의 컨테이너를 지웠기 때문이다
> (§11). **결함은 그대로다:** 워크트리 컨테이너가 하나라도 떠 있으면 다시 둘이 되고, 이
> 슬라이스는 그것이 **떠 있는 것을 정상으로** 만든다.

워크트리마다 컨테이너를 띄우는 것이 정상이 된 순간 *"LINKS=1
인 것 하나를 고른다"* 는 규칙이 무너진다 — **이 슬라이스가 만드는 세계에서 정확히 안 서는 규칙**
이고, 하필 **사람이 *"설계서가 사라졌다"* 고 놀란 자리에서 읽는 문장**이다.

바로 위 문장(*"`LINKS` 가 붙어 있거나 크기가 있는 쪽을 고른다"*)은 아직 맞다. 고칠 것은 굵은
한 줄이다. 예: *"`LINKS` 가 1 인 것은 지금 어떤 컨테이너가 마운트한 볼륨이고, 워크트리마다
컨테이너를 띄우면 그런 볼륨이 여럿이다 — 찾는 것은 **크기가 있는 것 중 내 워크트리 이름이 아닌
것**이다."* **표의 예시도 LINKS=1 이 둘인 모양으로 바꿔야 한다.**

### 4.2 아주 작은 것 — **compose 는 프로젝트 이름을 소문자로 낮춘다 (R-8)**

쟀다: 디렉터리 `stageA` → 프로젝트 `stagea` → 컨테이너 `stagea-postgres-1` · 볼륨
`stagea_wirebound-pgdata`. README §2·§6.3 은 *"디렉터리 이름"* 이라고만 적는다. `CLAUDE.md` 가
워크트리 이름을 소문자 슬러그로 강제하므로 **실무 영향은 없다.** 적어 둘 뿐이다.

---

## 5. D6 — **아무것도 안 바꾼 사람은 안 깨진다**

| 잰 것 | 관측 |
|---|---|
| `.env` 없이 `docker compose config` | `published: "5433"` |
| `.env.example` 의 세 수 | `POSTGRES_PORT=5433` · `DATABASE_URL=…:5433/wirebound` · `#TEST_DATABASE_URL=…:5433/wirebound_test` — **한 수다** |
| `POSTGRES_PORT` 가 **없는** 사람 + 어긋난 URL | 검사가 **안 돈다** — 나온 것은 `Error: connect ECONNREFUSED 127.0.0.1:15999`(종료 1)이지 어긋남 문장이 아니다 |
| `POSTGRES_PORT` 가 **없는** 사람 + 정상 URL | **정상 기동** · `이 서버가 보는 DB: … · 마이그레이션 11건` |

**빈 문자열이 "안 줬다"와 같은지도 쟀다** — `FOO= node --env-file=…` 은 파일의 값을 **덮지 않고
빈 문자열을 지킨다.** 그래서 위 셋째·넷째 줄이 *"`POSTGRES_PORT` 줄이 아예 없는 사람"* 과 같은
길이다(코드의 `pick()` 이 둘을 같게 본다).

**이 수정의 위험 방향은 닫혀 있다.** 기존 사용자는 `POSTGRES_PORT` 가 없는 `.env` 를 갖고 있고,
그때 새 검사는 잠들며 compose 기본값도 오늘과 같은 5433 이다.

---

## 6. 앞 슬라이스를 부수지 않았는가 (D4)

**지운 파일도 이름 바꾼 파일도 없다** — `git diff 76ff67c..HEAD --diff-filter=DR` 이 **빈 표**다.
새로 생긴 것은 다섯(`port-agreement.ts`·`describe-schema-state.ts`·`port-agreement.test.ts`·
계획서·보고서)뿐이다.

| 앞 판의 자 | 리뷰어 판정 |
|---|---|
| `api-proxy-target`(에디터 프록시) | **그대로 선다.** 포트가 갈려도 에디터→API 어긋남은 남는다 |
| `test-database-url` | **그대로 + 강해졌다.** 기본값이 `POSTGRES_PORT` 를 따라간다 — 옛 기본값(5433 고정)은 자기 컨테이너를 5443 에 띄운 사람의 스위트를 **남의 `wirebound_test` 로** 보냈다. **닫은 것이 맞다** |
| `db-target-log` | **그대로 + 스키마 상태.** `main.ts` 인구조사가 **꽂는 줄까지** 잰다 |
| `missing-database-hint` | **낡은 것을 정확히 걷었다.** `docker exec wirebound-postgres …` 는 이제 없는 이름이다 — `docker compose exec postgres …` 로 바뀐 것이 옳고, 케이스가 그 한 줄을 문다 |
| `env-example-census` | **그대로 + 넓혔다.** 값이 넷이 됐고 `POSTGRES_PORT` 가 **주석이 아닌 것**과 compose 명령이 본문에 있는 것까지 잰다 |
| 인구조사가 주석을 걷는지 | `stripYamlComments` 가 새로 서고 **자가 넷** 붙었다. TS 쪽 `stripComments` 도 아직 물린다(§7 R7) |

**낡았다고 지운 것 중 옳지 않은 것은 없다.**

---

## 7. 0 사망 사냥 — **열을 심어 일곱이 죽고 셋이 살았다**

구현자의 M1–M21 과 **겹치지 않는 자리**를 골랐다. `git checkout --` 을 안 썼다 — 원본을 메모리에
들고 `finally` 에서 **전문을 되썼다**. 매 회 뒤 `git status` 가 **비어 있었다.**

| # | 심은 것 | 결과 |
|---|---|---|
| R1 | `loopbackPortOf` — **포트가 없는 접속 문자열**을 안 재게(`5432` 대신 `undefined`) | **죽었다** |
| R2 | `POSTGRES_PORT` 가 **숫자가 아닐 때** 조용히 넘기게 | **죽었다** |
| R3 | `COMPOSE_DEFAULT_POSTGRES_PORT` 를 `'5432'` 로 | **죽었다** |
| R4 | compose 보간에서 **콜론만** 빼기(`${POSTGRES_PORT-5433}`) | **죽었다** |
| R7 | `stripComments`(TS) 를 **무동작**으로 | **죽었다**(다른 인구조사가 잡았다) |
| R8 | `EMPTY_SCHEMA = 0` → `-1` | **죽었다** |
| R10 | 루프백 집합에서 **`localhost` 만** 빼기 | **죽었다** |
| **R5** | **README §2 의 `up` 명령에서 `--env-file` 을 빼기** | ***살았다*** |
| **R6** | **README 가 든 기본 포트를 5432 로** | ***살았다*** |
| **R9** | **`resolvePostgresPort` 에서 파일이 셸을 이기게** | ***살았다 — 전체 스위트에서도*** |

### 7.1 R9 — **`POSTGRES_PORT` 의 "셸이 파일을 이긴다" 에 자가 없다 (R-2)**

`test-database-url.ts` 는 그 순서를 **계약으로 적는다**: *"`POSTGRES_PORT` 도 셸이 파일을 이긴다
— 같은 순서를 두 값이 함께 쓴다."* README(`apps/api/README.md`)도 두 자리가 그 순서를 지킨다고
든다. **그런데 그 한 줄을 재는 케이스가 없다.** 순서를 뒤집어도 `pnpm test` 가 **종료 0**이다.

**왜 기존 케이스가 못 잡나 — 진단.** `port-agreement.test.ts` 의 배선② 케이스 셋은
ⓐ 파일에만 `POSTGRES_PORT` 가 있는 경우와 ⓑ 셸에만 있는 경우를 각각 잰다. **셸과 파일에 서로
다른 값이 동시에 있는 경우가 없다** — 그래서 어느 쪽이 이기든 결과가 같다.

**실제 영향.** `POSTGRES_PORT=15434 pnpm test` 로 다른 컨테이너를 겨냥한 사람의 셸 값이
**조용히 무시된다.** 그리고 서버 쪽(`config.ts`)은 `--env-file-if-exists` 를 타므로 **셸이
이긴다** — 즉 서버와 스위트가 **서로 다른 값을 authoritative 로** 삼게 된다. **이 슬라이스가
닫으려던 "값이 두 자리에 있다" 부류 그 자체다.**

**닫는 자 한 줄**(`port-agreement.test.ts` 의 배선② describe 안):

```ts
it('`POSTGRES_PORT` 도 셸이 파일을 이긴다 — 두 값이 같은 순서를 쓴다', () => {
  expect(resolvePostgresPort({ shellEnv: { POSTGRES_PORT: '5443' }, fileEnv: { POSTGRES_PORT: '5433' } })).toBe('5443')
})
```

### 7.2 R5·R6 — **README 가 든 명령과 수에 자가 없다 (R-3)**

`.env.example` 은 인구조사가 **글자까지** 지킨다(`expect(EXAMPLE).toContain('docker compose
--env-file apps/api/.env up -d')`). **README 는 안 지킨다.** 그래서:

- §2 의 `docker compose --env-file apps/api/.env up -d` 에서 **플래그를 지워도** 게이트 넷 초록.
- §2 가 든 *"기본값은 5433**이다"* 를 **5432 로 바꿔도** 게이트 넷 초록.

**D5 가 "README 가 소유하고 CLAUDE.md 가 가리킨다" 로 정했는데 소유자만 안 재는 비대칭이다.**
그리고 R5 는 **README 자신이 세 자리에서 경고하는 바로 그 실수**다 — 문서가 그 플래그를 잃으면
§2 를 따르는 모든 사람이 컨테이너를 5433 으로 다시 만든다.

**닫는 자**(둘이면 충분하고 `.env.example` 인구조사와 같은 결이다):

```ts
const README = readFileSync(new URL('../../../README.md', import.meta.url), 'utf8')
it('README 의 `up` 명령이 --env-file 을 든다', () => {
  for (const line of README.split('\n').filter((l) => /docker compose.*\bup -d/.test(l))) {
    expect(line).toContain('--env-file apps/api/.env')
  }
})
it('README 가 든 기본 포트가 COMPOSE_DEFAULT_POSTGRES_PORT 와 같다', () => {
  expect(README).toContain(`기본값은 ${COMPOSE_DEFAULT_POSTGRES_PORT}`)
})
```

> **반론을 하나 적어 둔다.** 산문을 인구조사로 못박으면 문장을 못 고치게 된다. 그래서 **수와
> 명령 두 가지만** 재기를 권한다 — 지금 `.env.example` 에 거는 것과 정확히 같은 폭이다.

---

## 8. 되짚기 — **문서만 보고 워크트리 둘에 각자 컨테이너를 띄웠다**

임시 워크트리 둘(`tmp-rv-a`·`tmp-rv-b`, 브랜치 `tmp/rv-a`·`tmp/rv-b`)을 만들고 **README §3.1 만
보고** 걸었다. 포트 A `15533`/`3041`, B `15534`/`3042`, DB `wb_rva`·`wb_rvb`.

| 걸음 | A | B |
|---|---|---|
| §3.1 이 시키는 포트 훑기 | `docker ps --format …` · `lsof … \| grep node` 로 15433·5433·5432·5173 이 잡힌 것을 봤다 | 〃 |
| 1 `pnpm install && pnpm build` | 종료 0 | 종료 0 |
| 2·3 `.env` 복사 · 값 넷 | — | — |
| 4 `up -d`(그 디렉터리에서) | 종료 0 · `tmp-rv-a-postgres-1` · `0.0.0.0:15533->5432` | 종료 0 · `tmp-rv-b-postgres-1` · `0.0.0.0:15534->5432` |
| 볼륨 | `tmp-rv-a_wirebound-pgdata` | `tmp-rv-b_wirebound-pgdata` |
| 5 DB 둘 만들기 | `CREATE DATABASE` ×2 | `CREATE DATABASE` ×2 |
| 6 `migrate` | 종료 **0** | 종료 **0** |
| 서버가 찍은 줄 | `이 서버가 보는 DB: 127.0.0.1:15533/wb_rva · 마이그레이션 11건` | `… 127.0.0.1:15534/wb_rvb · 마이그레이션 11건` |

**교차 — 격리가 실제로 서는가** (§4 의 curl 두 줄을 그대로 썼다)

| | 결과 |
|---|---|
| A 서버 + A 계정 | **200** |
| B 서버 + B 계정 | **200** |
| A 서버 + **B** 계정 | **401** |
| B 서버 + **A** 계정 | **401** |
| 각 DB 의 `users` | `wb_rva: a@rv.example` / `wb_rvb: b@rv.example` |

**동시에 `pnpm test` 를 돌렸다 — `CLAUDE.md` 가 이번에 뒤집은 규칙이 그것이다.**

| | 종료 코드 | 관측 |
|---|---|---|
| A `pnpm vitest run --project api` | **0** | Test Files **73 (73)** · Tests **1408 (1408)** · **98.55s** |
| B (같은 시각) | **0** | Test Files **73 (73)** · Tests **1408 (1408)** · **98.70s** |

**두 컨테이너가 같은 시각에 healthy 였고 둘 다 자기 DB 만 봤다.** *"api 테스트를 도는 작업끼리도
동시에 돌려도 된다 — 붙는 DB 가 다르면"* 은 **선다.**

### 8.1 문서에 없는 지식을 쓰게 된 자리 — **없었다**

`--env-file` 을 붙인 `up -d`, `docker compose exec` 로 DB 만들기, `PORTS` 칸 확인, 포트를 훑는
두 줄, *"`TEST_DATABASE_URL` 은 주석 처리되어 있다 — 주석을 푼다"* 까지 전부 §3.1 이 들고 있었다.
**구현자가 §5.1 에서 메운 구멍(무슨 포트가 이미 쓰이는지 아는 법)이 실제로 메워져 있다.**

> **딱 하나 걸린 자리를 적어 둔다 — 문서 결함은 아니다.** `.env.example` 을 스크립트로 치환할 때
> `DATABASE_URL=…:5433/wirebound` 가 `#TEST_DATABASE_URL=…:5433/wirebound_test` 의 **부분
> 문자열**이라 한 번에 둘이 바뀐다. 손으로 편집하는 사람에게는 안 생기는 일이라 결함으로 안
> 세운다. 적어 두는 이유는 **자동화하는 에이전트가 같은 데를 밟는다**는 것뿐이다.

---

## 9. 볼륨 복사 절차(보고서 §10) — **따라 할 만하다. 다만 되돌리기가 그대로는 실패한다**

**따라 할 만한 것.** 0 번이 대조할 수를 먼저 적게 하고, `:ro` 로 옛 볼륨을 열고, `cd /from &&
cp -a . /to/` 라 **점파일이 함께 간다**(PGDATA 는 그것이 중요하다). 이미지가 `postgres:16-alpine`
로 고정이라 메이저 버전이 어긋날 일도 없다. 검증이 **셋**(수 대조 · `마이그레이션 N건` · 크기)
이고 *"옛 볼륨을 안 지운다"* 가 세 자리에서 반복된다. **메인 세션이 그대로 칠 수 있다.**

**고쳐야 할 것 둘.**

**R-4 — §10.3 의 되돌리기가 그대로는 안 된다.** *"되돌리기는 옛 컨테이너를 다시 켜는 것뿐이다 —
`docker start wirebound-postgres`"* 라고 적혀 있는데, 그때 **새 컨테이너가 5433 을 잡고 있다.**
사용자 자원을 안 건드리고 **임시 컨테이너 둘로 같은 모양을 재현했다**:

```
$ docker start rv-old            # rv-new 가 같은 포트를 잡고 있는 채로
Error response from daemon: failed to set up container networking: … Bind for 0.0.0.0:19077
  failed: port is already allocated
failed to start containers: rv-old
                                                            ← 종료 코드 1
```

**한 줄이 앞에 있어야 한다:**

```bash
docker compose down                 # 저장소 루트에서 — 새로 띄운 것을 내린다
docker start wirebound-postgres     # 그 다음에 옛것을 켠다
```

**R-5 — 복사 대상 볼륨이 비어 있는지 확인하는 걸음이 없다.** `docker volume create` 는 이미
있으면 조용히 넘어가고, 그 볼륨이 비어 있지 않으면 `cp -a . /to/` 가 **남의 PGDATA 위에 섞인다.**
**오늘은 비어 있다 — 쟀다**(`wirebound_wirebound-pgdata`: entries **0**, `0B`). 그래도 걸음
하나를 넣기를 권한다:

```bash
docker run --rm -v wirebound_wirebound-pgdata:/t:ro alpine sh -c 'ls -A /t | wc -l'   # 0 이어야 한다
```

**적어 둘 것 하나(결함 아님).** 복사한 볼륨에는 `wirebound_test` 가 옛 볼륨의 상태 그대로 온다.
`01-test-db.sql` 은 **PGDATA 가 빈 경우에만** 도므로 복사 뒤에는 **안 돈다** — 옛 볼륨에 그 DB 가
있으므로 문제는 없지만, 절차가 그 사실을 안 든다. §10.3 의 검증 목록에 한 줄이면 충분하다.

---

## 10. `01-test-db.sql` 이 다시 도는가 — **돈다. 그리고 문서가 맞게 적었다**

임시 프로젝트의 **새 볼륨**에서 쟀다:

```
$ docker compose exec postgres psql -U wirebound -d postgres -tAc 'SELECT datname …'
postgres · template0 · template1 · wirebound · wirebound_test      ← 손으로 만든 것이 없다
```

**문서가 맞다.** README §6.4 는 *"워크트리마다 컨테이너를 띄우면 볼륨이 새로 생기므로 그
스크립트가 매번 돈다"* 와 **함정이 남는 두 경우**(옛 볼륨을 그대로 쓰는 경우 · `postgres-init/`
이 빈 경우)를 정확히 든다. §3.1 은 *"그래서 5 번을 지울 수 있는데 왜 안 지우나"* 를 인용문으로
들고 그 근거가 §4 의 관측이다 — **그 판정이 옳다는 것을 §4 에서 재현했다.**

`port-agreement.test.ts` 가 그 사실을 **자로도** 든다: `01-test-db.sql` 이 만드는 이름을 읽어
`defaultTestDatabaseUrl()` 이 그것을 가리키는지 잰다. 손으로 만드는 걸음이 사라진 근거가
**낡지 않는 형태로** 박혀 있다.

---

## 11. 사용자 자원 — 무엇을 했고 무엇을 안 했나

| | |
|---|---|
| `docker compose down -v` | **안 썼다** — 한 번도 |
| `wirebound-postgres` | **안 지웠고 안 멈췄고 안 다시 만들었다.** 시작·끝 모두 `Up (healthy)` · `0.0.0.0:5433` |
| `feat-p1-api_wirebound-pgdata` | **`docker volume ls`·`docker system df -v` 의 목록으로만 봤다.** 마운트한 적 없다 |
| `wirebound_wirebound-pgdata` | **읽기 전용(`:ro`)으로 한 번 열어 비었는지만 봤다**(§9 R-5) |
| 사용자 데이터 | 시작 **14\|16\|358** · 끝 **14\|16\|358** |
| 포트 3001·5433 | **안 썼다.** 쓴 것은 3031·3032·3041·3042·15533·15534·19021·19077 |
| 만든 임시 컨테이너 | 여섯(`stagea`·`stageb`·`tmp-rv-a`·`tmp-rv-b`·`rv-old`·`rv-new`) — **전부 지웠다** |
| 만든 임시 볼륨 | 넷 — **이름을 지목해 전부 지웠다** |
| 만든 임시 워크트리 | 둘 — `docker compose down` → `git worktree remove` → 브랜치 삭제 순서로 **전부 지웠다**(`git worktree list` 로 확인) |
| 최상위 체크아웃 | **브랜치를 안 옮겼고 파일을 안 고쳤다.** 친 것은 `git worktree add/remove/list`·`log`·`show` 뿐이다 |
| 이 워크트리의 작업 트리 | 리뷰 끝 시점 **clean**(변이 열 번을 심고 되쓴 뒤 매번 확인했다) |
| 이 워크트리의 dev DB | `wb_rv_empty` 를 만들고 **지웠다**. `migrate latest` 를 한 번 돌렸다(이미 최신이라 무동작) |

**남긴 것 — 코디네이터가 판정할 자리.** 구현자가 남긴 이 워크트리의 컨테이너
`fix-per-worktree-container-postgres-1`(포트 15433)과 볼륨
`fix-per-worktree-container_wirebound-pgdata`(150.9MB)를 **리뷰 끝에 지웠다**(브리프의 지시다).
다시 필요하면 이 워크트리에서 한 줄이면 선다 — `docker compose --env-file apps/api/.env up -d`
뒤에 `CREATE DATABASE wb_fixpwc; wb_fixpwc_test;` 와 `migrate`(README §3.1 의 4·5·6 번).

---

## 12. 판정과 할 일

**병합 가능하다.** 코드는 재는 대로 동작하고, 게이트 넷이 재현되며, 앞 슬라이스를 안 부쉈고,
문서만 보고 두 워크트리를 세우는 데 성공했다. 아래는 **고칠 것의 목록**이고 병합을 막는 것은
**R-1 하나뿐이다**(그것도 문서 한 문단이다).

| # | 무엇 | 어디 | 병합 전? |
|---|---|---|---|
| **R-1** | *"`LINKS` 가 1 인 것이 지금 쓰이는 볼륨이고 나머지는 0·0B"* 가 **거짓이 됐다** — 오늘 LINKS=1 이 **둘**이다(`feat-p1-api` 186.5MB · `fix-per-worktree-container` 150.9MB). 잃어버린 데이터를 찾는 문장이다 | `README.md` §6.3 — 굵은 한 줄과 그 위의 예시 표 | **권한다** |
| **R-2** | `POSTGRES_PORT` 의 **셸 > 파일** 순서에 자가 없다(변이 R9 가 전체 스위트에서 살았다). 셸과 파일에 **다른 값이 동시에** 있는 케이스가 없다 | `apps/api/test/port-agreement.test.ts` 배선② — §7.1 에 한 줄 | 뒤에도 됨 |
| **R-3** | README 가 든 `--env-file` 플래그와 기본 포트 5433 에 자가 없다(변이 R5·R6 생존) | 인구조사 둘 — §7.2 | 뒤에도 됨 |
| **R-4** | 되돌리기 `docker start wirebound-postgres` 가 **종료 1** 로 실패한다(포트를 새것이 잡고 있다 — 임시 컨테이너로 재현했다). 앞에 `docker compose down` 이 필요하다 | 보고서 §10.3 | **병합 때 그 절차를 치기 전** |
| **R-5** | 복사 대상 볼륨이 비었는지 확인하는 걸음이 없다(오늘은 비어 있다 — 쟀다) | 보고서 §10.2 | **병합 때 그 절차를 치기 전** |
| **R-6** | *"한 자리로 모으기는 불가능하다"* → **"두 자리가 서로를 읽는 길이 없다. 한 자리를 없애는 길은 있으나 안 골랐다"** 로 고쳐 적기(근거 둘은 참이다 — 재현했다) | 보고서 §2·§11 · `port-agreement.ts` 머리말 · 미결 장부 §3.10 | 뒤에도 됨 |
| **R-7** | 컨테이너를 띄우는 규칙을 **불릿 둘이 두 벌로** 든다(프로젝트 이름 기전·`up -d`를 그 디렉터리에서 — 둘 다 두 번 나온다). 사이의 빈 줄이 목록도 끊는다 | `CLAUDE.md` 워크트리 세팅 절 | 뒤에도 됨 |
| **R-8** | compose 가 프로젝트 이름을 **소문자로 낮춘다**(쟀다: `stageA` → `stagea`). 실무 영향은 없다 | `README.md` §2·§6.3 — 한 마디 | 안 해도 됨 |

**미결 장부(§3.10)에 더할 것 둘:** R-2·R-3(자가 없는 자리 둘) · R-6(*"불가능"* 의 정확한 판정).
**§3.10 이 이미 든 것 중 이 리뷰가 재확인한 것:** compose 가 조용해지는 길(§4 — 재현했다) ·
`--env-file` 을 뺀 `up -d` 를 안 쟀다는 것(이 리뷰도 사용자 포트를 건드리지 않으려 안 쟀다 —
**대신 어긋났을 때 무엇이 보이는지는 §2.1 에서 쟀다**) · 워크트리 셋 이상은 여전히 안 쟀다.
