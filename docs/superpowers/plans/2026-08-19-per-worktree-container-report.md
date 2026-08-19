# 워크트리마다 컨테이너 — 보고

> 계획: `2026-08-19-per-worktree-container.md` · 이월은 새로 만들지 않고
> `2026-08-17-p10-2-carryforward.md` §3을 갱신했다(§3.10)

**한 줄.** `container_name` 고정을 걷고 호스트 포트를 `apps/api/.env`의 `POSTGRES_PORT`로
받게 했다. **재라 여섯 중 하나가 거짓이었고**(D2가 기대한 *"한 자리로 모으기"*는 **불가능**
하다 — Node도 compose도 서로의 값을 못 편다), **계획서 D3의 전제도 틀렸다**(*"빈 DB로 뜬
서버"*는 존재하지 않는다 — 빈 DB에서는 서버가 **뜨지 못한다**). 게이트 넷 전부 **0**,
심은 변이 **스물하나 중 넷이 살아남았다가 자를 세워 다 죽였다**. 문서만 보고 워크트리 둘에
각자 컨테이너를 띄워 되짚었고 **교차 로그인이 401**이었다.

**이 기계.** macOS 26.6.1 · Apple Silicon · Node **22.23.1** · pnpm **10.0.0** ·
**Docker 29.5.2** · vitest **3.2.7**. 아래 값은 **이 기계에서 잰 것**이고 남이 잰 값에는
귀속을 붙였다.

**사용자 데이터.** `wirebound-postgres` 컨테이너와 `feat-p1-api_wirebound-pgdata` 볼륨을
**읽지도 쓰지도 지우지도 않았다.** `docker compose down -v`를 **한 번도 안 썼다.** 포트
3001·5433을 **안 썼다**(쓴 것은 3021·3022·15433·15434·19011~19013이다). 만든 임시
컨테이너 넷·볼륨 넷·워크트리 하나를 **전부 지웠다** — 남긴 것 하나는 §9에 적었다.

---

## 0. 산출물

| 무엇 | 왜 |
|---|---|
| `docker-compose.yml` | D1. `container_name` 제거 · `'${POSTGRES_PORT:-5433}:5432'` |
| `apps/api/src/db/port-agreement.ts`(새로) · `apps/api/test/port-agreement.test.ts`(새로) | **D2 — 이 슬라이스의 급소.** 어긋남을 재는 순수 규칙과 그 자 |
| `apps/api/src/config.ts` | D2 배선①. `POSTGRES_PORT`를 **재기만 하고** `ApiConfig`에 안 싣는다. 어긋나면 **서버가 안 뜬다** |
| `apps/api/test/test-database-url.ts` | D2 배선②·D4. 기본 테스트 DB가 `POSTGRES_PORT`를 **따라간다**. 어긋나면 **스위트가 안 돈다** |
| `apps/api/src/db/describe-schema-state.ts`(새로) · `src/db/migrate.ts` · `src/main.ts` | D3. 뜬 뒤에는 `마이그레이션 N건`, **못 떴을 때는 빈 DB라고 말한다** |
| `apps/api/test/db-target-log.test.ts` | D3의 자 — 규칙·배선·**진짜 DB에서 세는 것**까지 |
| `apps/api/.env.example` · `apps/api/test/env-example-census.test.ts` | D2·D6. 값이 넷이 됐다 |
| `apps/api/test/missing-database-hint.ts`(+ 자) | 힌트가 **없어진 컨테이너 이름**을 권하고 있었다 |
| `apps/api/test/source-census.ts` | `stripYamlComments`(새로) — compose를 재는 자가 딛고 설 자리 |
| `README.md` §2·§3·**§3.1**·§6.3·§6.4·§6.6·§9·§10 · `CLAUDE.md` · `apps/api/README.md` | D5. **README가 소유하고 CLAUDE.md가 가리킨다** |

**새 의존은 없다.**

---

## 1. T1 — 재라 표: **여섯 중 하나가 거짓, 하나는 참인데 결론이 뒤집혔다**

| # | 계획서의 문장 | 판정 | 값 |
|---|---|---|---|
| **1** | compose가 자기 디렉터리의 `.env`를 읽고 `--env-file`로 바꿀 수 있다 | **참 — 다만 "자기 디렉터리"가 아니라 "compose 파일이 있는 디렉터리"다** | §1.1 |
| **2** | `container_name`을 지우면 `<project>-postgres-1`이 된다 | **참** | 실제로 띄워 `wbtmp-a-postgres-1`·`tmp-retrace-pwc-postgres-1`을 봤다 |
| **3** | 포트를 `${POSTGRES_PORT:-5433}`으로 열 수 있다 | **참** | §1.1의 표 |
| **4** | 볼륨이 새로 생기면 `01-test-db.sql`이 다시 돈다 | **참 — 그런데 그 값이 D4의 결론을 안 바꿨다** | §4 |
| **5** | 포트가 갈리면 DB 이름을 안 갈라도 된다 | **참인데 하면 안 된다** | §4 — **거짓에 가까운 참이다** |
| **6** | 기본값을 유지하면 아무도 안 깨진다 | **참** | §6 |

**그리고 계획서가 안 잰 문장 하나가 D2 전체를 뒤집었다** — §2.

### 1.1 재라 #1 — compose가 무엇을 읽나 (임시 프로젝트로 쟀다)

| 무엇 | 관측 |
|---|---|
| 기본 `.env`의 위치 | **compose 파일이 있는 디렉터리**다. `cwd`가 아니다 — `sub/`에서 `-f ../docker-compose.yml`로 불러도 **`../.env`를 읽었다**(`sub/.env`가 있는데도) |
| `--env-file X` | **기본 `.env`를 대체한다.** `X`에 그 키가 없으면 `.env`로 안 돌아가고 compose의 `:-` 기본값으로 간다 |
| `--env-file`을 여럿 주면 | **뒤엣것이 이긴다** |
| 셸 환경변수 | **파일을 이긴다** — api의 `--env-file-if-exists`와 **같은 순서다** |
| 없는 파일을 가리키면 | **종료 1** · `couldn't find env file: <절대경로>` |
| `--env-file`의 상대경로 기준 | **`cwd`다**(compose 파일 위치가 아니다) |
| `.env` 값에 `$`가 있으면 | compose가 **펴려고 하고 경고를 낸다**(`The "cd" variable is not set…`). 종료는 0 |
| 기본 프로젝트 이름 | **디렉터리 이름**(앞 판이 잰 것과 같다) |
| `COMPOSE_ENV_FILES`를 기본 `.env`에 적으면 | **안 먹는다**(기본값으로 물러났다) |

---

## 2. ✱ **D2가 기대한 "한 자리로 모으기"는 불가능하다 — 재고 확인했다**

계획서 D2는 *"한 자리에서 오게 하라. 못 모으면 자가 잡아라"*였다. **못 모은다.** 근거 둘:

1. **compose는 접속 문자열에서 포트를 뽑을 수 없다.** 그쪽이 아는 것은 `${VAR}` 치환뿐이다.
2. **Node는 `.env` 안에서 `${VAR}`를 안 편다.** 이 판이 쟀다 — `DATABASE_URL=…:${POSTGRES_PORT}/db`를
   `util.parseEnv`와 `node --env-file` 양쪽으로 읽으니 **`${POSTGRES_PORT}` 문자 그대로**였다.

**그래서 값은 두 자리에 남고, 남은 선택은 "어디에 두 자리를 둘 것인가"였다.** 갈래 둘을 쟀다:

| 길 | 값이 사는 곳 | 대가 |
|---|---|---|
| **ⓐ 저장소 루트의 `.env`** | compose가 **플래그 없이** 읽는다 | **API가 그 값을 못 본다** — `apps/api`의 `--env-file-if-exists=.env`는 자기 디렉터리를 본다. 검사를 서버 안에 못 둔다(런타임 코드가 저장소 루트로 `../../../.env`를 타야 한다) |
| **ⓑ `apps/api/.env` + `--env-file`** | 한 파일 | **`up`에서 플래그를 빼면** 포트가 기본값으로 되돌아가 **컨테이너가 그 포트로 다시 만들어진다** |

**ⓑ를 골랐다.** 결정적인 이유는 **검사를 어디에 둘 수 있느냐**다 — ⓑ에서는 `POSTGRES_PORT`가
`--env-file-if-exists`를 타고 `loadConfig`에 그대로 들어오므로 **서버·`migrate`·테스트가 전부
같은 규칙 하나를 지난다.** ⓐ였다면 검사가 테스트에만 남고 `pnpm start`·`migrate`는 못 지킨다.

**대가는 문서와 자로 갚았다:** `.env.example`이 그 명령을 본문에 들고(인구조사가 그 줄을
못박는다), README §2·§3.1·§6.3이 *"`up`에서 빼지 마라"*를 세 자리에서 든다.

### 2.1 자가 잡는다 — 규칙 하나, 배선 둘

```
POSTGRES_PORT 가 있으면, 루프백을 가리키는 접속 문자열의 포트가 그것과 같아야 한다.
```

- **`POSTGRES_PORT`가 없으면 아무것도 안 잰다** — 자기 Postgres를 쓰는 사람(README §2가 든
  길)이 깨지면 안 된다. 그래서 `.env.example`은 그 줄을 **주석이 아닌 채로** 실어 *"안 쓸
  사람은 지운다"*로 만들었다(인구조사가 그 상태를 못박는다 — 주석으로 두면 검사가 잠든다).
- **다른 호스트는 안 잰다** — `POSTGRES_PORT`는 이 기계에 여는 포트다.
- **나가는 문장에 자격 문자열이 없다**(D4의 규칙을 새 경로에도 세웠다).

**배선 둘을 행동으로 잰다** — 인구조사가 아니다. 앞 슬라이스가 배선에서 변이 넷을 살렸고
(귀속: 리뷰 §9) 그 교훈이 *"규칙에는 자가 촘촘한데 꽂는 한 줄에는 없다"*였다. 이번 둘은
**부를 수 있는 함수**라 글자 대신 행동으로 쟀다:

| 배선 | 무엇이 일어나나 | 실측 |
|---|---|---|
| `loadConfig`(서버·`migrate`) | **안 뜬다** | `pnpm start` **종료 1** · `migrate` **종료 1**, 둘 다 아래 문장 |
| `resolveTestDatabaseUrlFrom`(`pnpm test`) | **스위트가 안 돈다** | 임시 `.env` 파일로 쟀다(케이스) |

```
Error: POSTGRES_PORT 와 접속 문자열의 포트가 어긋납니다 — 이대로 두면 이 워크트리의 컨테이너가
아니라 옆 워크트리의 컨테이너에 붙습니다(붙는 데 성공하므로 아무 에러도 안 납니다).
  POSTGRES_PORT=15433  ← docker compose 가 이 포트를 연다
  DATABASE_URL → 127.0.0.1:15999/wb_fixpwc
apps/api/.env 에서 포트를 한 수로 맞춘다. 자기 Postgres 를 쓰면 POSTGRES_PORT 줄을 지운다.
```

### 2.2 ✱ **안 적은 사람의 기본값이 남의 컨테이너를 가리키고 있었다**

`DEFAULT_TEST_DATABASE_URL`이 **5433을 박고 있었다.** 자기 컨테이너를 5443에 띄운 사람이
`TEST_DATABASE_URL`을 **안 적으면** 스위트가 **5433 — 즉 옆 워크트리(또는 공용) 컨테이너**의
`wirebound_test`를 지우며 돈다. **그쪽에도 같은 이름의 DB가 있으므로 아무 에러도 안 난다.**

**기본값이 `POSTGRES_PORT`를 따라가게 했다.** 안 적은 사람은 이제 **자기 컨테이너의**
`wirebound_test`를 본다(§4 — 그 DB는 새 볼륨에 이미 있다). **기본값은 어긋날 수가 없으므로
검사도 자동으로 통과한다.**

---

## 3. ✱ **D3의 전제가 틀렸다 — 빈 DB로 뜬 서버는 존재하지 않는다**

계획서 D3은 *"서버가 뜰 때 마이그레이션이 0건인지 말하게 하라"*였다. **그 줄은 0건을 영영
못 본다.** 이 기계에서 쟀다 — 빈 DB를 가리킨 채 `pnpm start`:

```
error: relation "themes" does not exist        (SQLSTATE 42P01) · 종료 코드 1
```

**`buildApp`이 부팅 중에 `themes`에 쓴다.** 즉 스키마가 비면 `listen`까지 못 간다.
사람이 실제로 읽는 것은 **kysely 스택 트레이스 스무 줄**이고, 워크트리마다 컨테이너를 띄우면
**그것이 첫 실행의 정상 경로**가 된다. *"설계서가 사라졌다"*로 읽기 딱 좋다.

**그래서 말하는 자리를 둘로 갈랐다.**

| 언제 | 무엇을 말하나 | 실측 |
|---|---|---|
| **뜬 뒤** | `이 서버가 보는 DB: 127.0.0.1:15433/wb_fixpwc · 마이그레이션 11건` | 워크트리 둘이 각각 자기 수를 찍었다(§5) |
| **못 떴을 때** | 아래 문장 + `Caused by:`에 원문 | **종료 1** |

```
Error: 이 DB 는 비어 있습니다(마이그레이션 0건): 127.0.0.1:15433/wb_fixpwc
새 볼륨이면 정상입니다 — 마이그레이션을 올리십시오:
  pnpm --filter @wirebound/api migrate
데이터가 있어야 하는데 비었다면 지우지 말고 다른 이름의 볼륨을 찾으십시오: docker volume ls
```

- **0건일 때만 붙인다** — `missing-database-hint.ts`가 `3D000`에만 붙는 것과 같은 규칙이다.
  다른 실패는 원문 그대로 올라간다(케이스가 그 갈림을 문다).
- **세는 것이 아무것도 안 바꾼다.** kysely 0.28.17의 `getMigrations()`는 마이그레이션 표가
  없으면 **만들지 않는다**(소스에서 확인하고, 진짜 DB로 표 개수가 안 변하는 것도 쟀다).
- **못 읽은 것과 0건을 가른다** — *"빈 볼륨"*과 *"DB가 없다"*는 다음에 칠 명령이 다르다.

**이 자가 못 잡는 것.** *마이그레이션은 올렸는데 데이터만 없는* 볼륨은 안 걸린다(수가 0이
아니다). README §6.6에 ⓒ로 넣었다 — **`마이그레이션 N건`이 0이 아니면 그 갈래다.**

---

## 4. D4 — **DB 이름 가르기는 "필요 없다"가 참이지만, 그래서 하면 안 된다**

**재라 #4는 참이다.** 새 볼륨에서 `01-test-db.sql`이 돈다 — 이 기계에서 쟀다:

```
$ docker compose exec postgres psql -U wirebound -d postgres -tAc 'SELECT datname …'
postgres · template0 · template1 · wirebound · wirebound_test      ← 손으로 만든 것이 없다
```

> **재는 중에 스크립트가 안 도는 경우를 우연히 만들었고 그것이 §6.4의 값이 됐다.** 임시
> 무대를 `/private/tmp/...`(이 세션의 스크래치패드)에 세웠더니 바인드 마운트가 **빈
> 디렉터리로** 잡혀 컨테이너가 이렇게만 말하고 지나갔다: `ignoring /docker-entrypoint-initdb.d/*`
> — **테스트 DB 없이 healthy로 떴다.** 무대를 `/Users/...` 아래로 옮기니 정상이었다.
> 앞 판이 남긴 *"빈 `postgres-init/`이면 함정이 다시 온다"*의 **원문이 이것이다.**

**그러므로 §3.1의 `CREATE DATABASE` 두 줄은 지울 수 있었다. 안 지웠다.** 근거는 이 판이
새로 잰 것 하나다 — **compose가 조용해지는 길이 있다.**

### 4.1 ✱ **포트가 겹친 뒤 한 번 더 치면 컨테이너가 포트 없이 뜬다**

임시 프로젝트 둘로 쟀다. B를 A와 같은 포트로 띄우면 **첫 번째는 시끄럽다:**

```
Error response from daemon: failed to set up container networking:
  ... Bind for 0.0.0.0:19011 failed: port is already allocated
```

**그런데 그대로 한 번 더 치면 종료 0으로 `Started`를 찍는다.**

```
$ docker ps
wbtmp-b-postgres-1    (PORTS 칸이 비어 있다)     Up (healthy)
wbtmp-a-postgres-1    0.0.0.0:19011->5432/tcp    Up (healthy)
```

`docker compose ps`도 `Up (healthy)`에 **PORTS 빈 칸**이다. 그 포트에 붙는 것은 전부 **A의
컨테이너**다 — 내 서버가 남의 DB를 읽고 쓰는데 **아무도 안 운다.**

**포트 검사(§2)는 이것을 못 잡는다** — `POSTGRES_PORT`와 `DATABASE_URL`이 서로 맞기 때문이다.
**맞는데 그 포트가 남의 것이다.** 그것을 시끄럽게 만드는 것이 **DB 이름**이다: 이름이 같으면
남의 DB가 그냥 열리고, 다르면 `database "wb_<이름>" does not exist`로 죽는다.

**판정: 메커니즘을 지우지 않았고 절차에서도 안 걷었다.** 대신 README §3.1에 *"지울 수 있는데
왜 안 지우나"*를 인용문으로 적었고, §6.3에 **`PORTS` 칸을 보라**는 직접 관측을 넣었다.
`.env.example`의 `DATABASE_URL` 주석도 그 이유로 다시 썼다.

### 4.2 앞 슬라이스의 자들 — **하나만 낡았고 나머지는 그대로 선다**

| 앞 판의 자 | 판정 |
|---|---|
| `api-proxy-target`(에디터 프록시) | **그대로.** 포트가 갈려도 에디터→API 어긋남은 그대로 있다 |
| `test-database-url`(테스트 DB) | **그대로 + 강해졌다.** 기본값이 `POSTGRES_PORT`를 따라간다(§2.2) |
| `db-target-log`(서버가 보는 DB) | **그대로 + 스키마 상태가 붙었다** |
| `missing-database-hint` | **낡았다 — 고쳤다.** 권하던 명령이 `docker exec wirebound-postgres …`였는데 **그 이름이 이제 없다.** `docker compose exec postgres …`로 바꿨다(이름을 몰라도 되고, **자기 디렉터리의 컨테이너**를 고른다) |
| `env-example-census` | **그대로 + 넓혔다.** 값이 셋에서 넷이 됐고, `POSTGRES_PORT`가 주석이 아닌 것과 compose 명령이 본문에 있는 것을 잰다 |

---

## 5. T6 — **문서만 보고 워크트리 둘에 각자 컨테이너를 띄웠다**

무대: 이 워크트리(A)와 새로 만든 `tmp-retrace-pwc`(B). README §3.1을 **글자 그대로** 따랐다.
포트는 A `15433`/`3021`, B `15434`/`3022`.

| 걸음 | A | B |
|---|---|---|
| `up -d` | `fix-per-worktree-container-postgres-1` · `0.0.0.0:15433->5432` | `tmp-retrace-pwc-postgres-1` · `0.0.0.0:15434->5432` |
| 볼륨 | `fix-per-worktree-container_wirebound-pgdata` | `tmp-retrace-pwc_wirebound-pgdata` |
| `migrate` | 종료 0 | 종료 0 |
| 서버가 찍은 줄 | `이 서버가 보는 DB: 127.0.0.1:15433/wb_fixpwc · 마이그레이션 11건` | `… 127.0.0.1:15434/wb_retrace · 마이그레이션 11건` |

**교차 — 격리가 실제로 서는가**

| | 결과 |
|---|---|
| A 서버 + **A** 계정 | **200** |
| B 서버 + **B** 계정 | **200** |
| A 서버 + **B** 계정 | **401** |
| B 서버 + **A** 계정 | **401** |
| 각 DB의 `users` | `wb_fixpwc: a@pwc.example` / `wb_retrace: b@pwc.example` |

B에서 api 케이스 한 파일도 돌렸다 — **종료 0**, B의 `wb_retrace_test`에 표 **15개**가 섰고
**A의 컨테이너에는 그 DB가 아예 없다**(DB 목록으로 확인). 두 컨테이너가 같은 시각에 healthy.

### 5.1 되짚기가 찾은 구멍 — **하나**

**§3.1이 `<포트>`를 *"다른 워크트리가 안 쓰는 수"*라고만 적고 그것을 어떻게 아는지 안 들었다.**
문서에 없는 지식(`docker ps`로 훑기)을 쓰게 되는 자리라 **§3.1에 그 두 줄을 넣었다**
(`docker ps --format '{{.Names}}\t{{.Ports}}'` · `lsof -nP -iTCP -sTCP:LISTEN | grep node`).

그 밖에 문서에 없는 지식을 쓴 자리는 없었다. `--env-file`을 붙인 `up -d`, `docker compose
exec`로 DB 만들기, `PORTS` 칸 확인까지 전부 §3.1·§6.3이 들고 있었다.

---

## 6. D6 — **아무것도 안 바꾼 사람**

| 잰 것 | 관측 |
|---|---|
| compose 기본값 | `docker compose config`가 `published: 5433` (`.env` 없이) |
| `.env.example` 그대로 | `POSTGRES_PORT=5433` · `DATABASE_URL`도 `TEST_DATABASE_URL`도 5433 — **셋이 한 수다**(인구조사가 못박는다) |
| `POSTGRES_PORT`가 없는 `.env`(기존 사용자) | 검사가 **안 돈다.** `loadConfig`가 오늘과 같이 뜬다(케이스) |
| 자기 Postgres를 쓰는 사람 | `POSTGRES_PORT` 줄을 지우면 검사가 잠든다. README §2가 그 한 줄을 든다 |

**기존 사용자는 `POSTGRES_PORT`가 없는 `.env`를 갖고 있으므로 이 슬라이스로 아무것도 안 깨진다.**

---

## 7. 구분력 — **스물하나를 심어 넷이 살았고, 자를 세워 넷 다 죽였다**

`git checkout --`을 안 썼다 — 원본을 메모리에 들고 `finally`에서 **전문을 되썼다.**

| # | 심은 것 | 처음 | 자를 세운 뒤 |
|---|---|---|---|
| M1 | `POSTGRES_PORT` 없어도 재게 | 죽었다 | — |
| M2 | 루프백 제한 제거 | 죽었다 | — |
| M3 | 접속 문자열 원문을 싣게 | 죽었다 | — |
| M4 | **배선①** `loadConfig`가 안 던지게 | 죽었다 | — |
| M5 | **배선①**이 `TEST_DATABASE_URL`까지 재게 | 죽었다 | — |
| M6 | **배선②** 테스트 쪽이 안 던지게 | 죽었다 | — |
| M7 | 기본 테스트 URL이 `POSTGRES_PORT`를 무시하게 | 죽었다 | — |
| M8 | `container_name`을 되돌리기 | 죽었다 | — |
| M9 | 호스트 포트를 다시 박기 | 죽었다 | — |
| M10 | compose 기본값만 5434로 | 죽었다 | — |
| M11 | `.env.example`의 포트만 어긋나게 | 죽었다 | — |
| M12 | **배선** — 빈 DB 힌트를 `main.ts`에서 빼기 | **살았다** | **죽는다** |
| M13 | 빈 DB 힌트가 아무 수에나 뜨게 | **살았다** | **죽는다** |
| M14 | 실행된 것 말고 전체를 세게 | **살았다** | **죽는다** |
| M15 | 스키마 상태를 뜬 뒤 줄에서 빼기 | 죽었다 | — |
| M16 | `.env.example`의 `POSTGRES_PORT`를 주석 처리 | 죽었다 | — |
| M17 | 힌트가 옛 컨테이너 이름을 쓰게 | 죽었다 | — |
| M18 | **`stripYamlComments`를 무동작으로** | **살았다** | **죽는다** |
| M19 | `POSTGRES_PORT`가 셸을 안 보게 | 죽었다 | — |
| M20 | 빈 DB 문장에서 *"볼륨을 찾아라"*를 빼기 | 죽었다 | — |
| M21 | 배선②가 검사에 포트를 안 넘기게 | 죽었다 | — |

### 7.1 살아남은 넷이 말한 것 — **앞 판과 같은 꼴이 둘, 새 꼴이 둘**

| # | 진단 | 세운 자 |
|---|---|---|
| **M12** | **앞 슬라이스와 정확히 같은 꼴이다** — 규칙(`emptySchemaHint`)에는 자가 있는데 **`main.ts`의 꽂는 세 줄에는 없었다.** 그것을 빼면 사람은 다시 kysely 스택을 읽는다 | `main.ts` 인구조사에 그 세 줄을 더했다(**다른 실패는 원문 그대로 올라가는 것**까지 잰다) |
| **M13** | **내가 규칙 하나를 아예 안 쟀다.** `describeSchemaState`만 재고 `emptySchemaHint`에는 케이스가 **0개**였다 | 행동 케이스 셋(0건일 때만 뜬다 · 조치 둘을 든다 · 자격 문자열을 안 싣는다) |
| **M14** | **분모가 같아서 못 갈랐다.** 스위트가 도는 DB는 `globalSetup`이 latest까지 올려 둔 것이라 *"실행된 수"*와 *"전체 수"*가 **같다** — `migrations.length`로 바꿔도 통과한다 | **마이그레이션 표가 없는 DB로 잰다**(같은 컨테이너의 관리용 `postgres` DB) → **0이어야 한다** |
| **M18** | **자를 재는 자가 없었다.** compose 인구조사가 `stripYamlComments`를 믿고 서 있는데 그 함수에는 케이스가 없었고, **compose 파일의 주석이 한글이라 우연히 안 걸렸다**(`container_name`이라는 글자가 주석에 없다) | `stripYamlComments` 행동 케이스 넷(줄 주석 · 꼬리 주석 · **따옴표 안의 `#`은 안 걷는다** · 주석 없으면 그대로) |

**복구 확인.** 스물하나를 다 돌린 뒤 `git status`에 남은 것은 **내가 그 사이에 고친 파일
셋뿐**이었고(`README.md`·`db-target-log.test.ts`·`port-agreement.test.ts`), 변이를 심은
다른 파일은 **하나도 안 남았다.**

---

## 8. 게이트 넷 — **전부 0** (종료 코드를 파이프 없이 따로 찍었다)

돌리기 전에 `ps`로 **다른 vitest가 0개**인 것을 확인했다.

```
게이트 1  pnpm test        종료 코드 = 0     Test Files 279 passed (279) · Tests 5166 passed (5166) · 113.01s
게이트 2  pnpm typecheck   종료 코드 = 0
게이트 3  pnpm build       종료 코드 = 0
게이트 4  pnpm test:build  종료 코드 = 0     Test Files 6 passed (6) · Tests 72 passed (72)
```

**이 게이트는 이 워크트리의 컨테이너(15433)에 붙어서 돌았다** — 사용자의 5433이 아니다.

---

## 9. 공유 자원 — 무엇을 했고 무엇을 안 했나

| | |
|---|---|
| `docker compose down -v` | **안 썼다** — 한 번도 |
| `wirebound-postgres`(사용자 컨테이너) | **안 지웠고 안 다시 만들었다.** 시작·끝 모두 `Up (healthy)` · `0.0.0.0:5433->5432` |
| `feat-p1-api_wirebound-pgdata`(설계서) | **읽지도 쓰지도 않았다.** `docker volume ls`의 이름 목록에만 나온다 |
| 포트 3001·5433 | **안 썼다.** 쓴 것은 3021·3022·15433·15434·19011·19012·19013 |
| 만든 임시 컨테이너 | 넷(`wbtmp-a`·`wbtmp-b`·`tmp-retrace-pwc`·이 워크트리). **앞의 셋은 지웠다** |
| 만든 임시 볼륨 | 넷. **앞의 셋은 이름을 지목해 지웠다**(`docker volume rm <이름>`) |
| 임시 워크트리 | `tmp-retrace-pwc` 하나를 만들고 **지웠다**(브랜치도 삭제) |
| 최상위 체크아웃 | **아무것도 안 띄웠고 안 고쳤다.** 브랜치도 안 옮겼다 |
| 사용자의 `wirebound_test` | **한 번 건드렸다** — §9.1 |

### 9.1 ✱ **남긴 것 하나와 건드린 것 하나 — 코디네이터가 판정할 자리**

**남긴 것: 이 워크트리의 컨테이너.** `fix-per-worktree-container-postgres-1`(포트 **15433**)
과 볼륨 `fix-per-worktree-container_wirebound-pgdata`가 **아직 떠 있다.** 리뷰어가 게이트를
바로 돌 수 있게 남겨 뒀다. **이 워크트리를 폐기할 때 지운다** — 그 워크트리에서:

```bash
docker compose down
docker volume rm fix-per-worktree-container_wirebound-pgdata
```

**건드린 것: 사용자 컨테이너의 `wirebound_test`.** 이 워크트리의 `.env`를 자기 컨테이너로
돌리기 **전에** api 케이스를 세 번 돌렸고, 그때 `globalSetup`이 공용 `wirebound_test`에
`latest → none → latest`를 돌았다(앞 슬라이스도 같은 자리를 지났다 — 귀속: 그 판 §8).
**`wirebound`(설계서)는 안 건드렸고**, `wirebound_test`는 지금도 마이그레이션이 올라간
상태다. 그 뒤로는 전부 **15433의 내 컨테이너**로만 돌렸다.

---

## 10. **메인 세션이 병합 때 할 일 — 옛 볼륨을 새 이름으로 "복사"한다**

**이 판은 실행하지 않았다.** 아래는 절차와 검증 방법이다. **복사이지 이동이 아니다 — 옛
볼륨을 지우지 않는다.**

### 10.1 지금 상태

- 설계서가 사는 볼륨은 **`feat-p1-api_wirebound-pgdata`**이고 그것을 마운트한 컨테이너가
  `wirebound-postgres`(포트 5433)다. **그 컨테이너의 compose 프로젝트는 `feat-p1-api`이고
  그 워크트리는 이제 git이 모른다**(앞 판이 쟀다 — README §6.3).
- 병합 뒤 저장소 루트에서 `docker compose --env-file apps/api/.env up -d`를 치면 프로젝트가
  **`wirebound`**가 되므로 compose가 보는 볼륨은 **`wirebound_wirebound-pgdata`**(지금 0B)다.
  **그대로 띄우면 빈 DB가 뜬다** — 이제 그것을 서버가 말한다(§3).

### 10.2 절차 (사용자에게 확인받고 친다)

```bash
# 0. 지금 값을 적어 둔다 — 뒤에서 이 수와 대조한다
docker exec wirebound-postgres psql -U wirebound -d wirebound -tAc \
  'SELECT (SELECT count(*) FROM users), (SELECT count(*) FROM projects), (SELECT count(*) FROM pages);'

# 1. 두 볼륨을 잠깐 멈춘 컨테이너 없이 붙여 통째로 복사한다 (옛 것은 읽기 전용으로 연다)
docker stop wirebound-postgres                     # 복사 중에 쓰기가 없어야 한다
docker volume create wirebound_wirebound-pgdata    # 이미 있으면 넘어간다
docker run --rm \
  -v feat-p1-api_wirebound-pgdata:/from:ro \
  -v wirebound_wirebound-pgdata:/to \
  alpine sh -c 'cd /from && cp -a . /to/'

# 2. 새 이름으로 띄운다 — 저장소 루트에서
docker compose --env-file apps/api/.env up -d
docker compose ps                                  # healthy 이고 PORTS 에 5433 이 보여야 한다

# 3. 대조한다 — 0번과 같은 수여야 한다
docker compose exec postgres psql -U wirebound -d wirebound -tAc \
  'SELECT (SELECT count(*) FROM users), (SELECT count(*) FROM projects), (SELECT count(*) FROM pages);'
```

### 10.3 검증과 되돌리기

- **셋으로 확인한다:** ⓐ 위 세 수가 같다 ⓑ 서버가 `이 서버가 보는 DB: 127.0.0.1:5433/wirebound ·
  마이그레이션 11건`을 찍는다(0건이면 **빈 볼륨을 띄운 것이다 — 멈추고 되돌린다**)
  ⓒ `docker system df -v`에서 새 볼륨의 크기가 옛 것과 비슷하다.
- **되돌리기는 옛 컨테이너를 다시 켜는 것뿐이다** — `docker start wirebound-postgres`.
  **옛 볼륨을 안 지웠으므로 잃을 것이 없다.**
- **옛 볼륨은 한동안 그대로 둔다.** 지우는 것은 새 쪽에서 며칠 쓰고 난 뒤의 별개 결정이다.
- **`docker compose down -v`를 치지 마라** — 그 한 줄이 찾고 있는 볼륨까지 지운다.

> **이 절차를 이 판이 못 쟀다** — 사용자의 볼륨을 건드려야 재현된다. `cp -a`로 Postgres
> 데이터 디렉터리를 옮기는 것 자체는 흔한 길이지만 **이 기계에서 안 돌려 봤다.**
> 대안(더 안전한 쪽)은 **`pg_dump`/`pg_restore`**다 — 파일 복사가 아니라 논리 백업이라
> 버전·권한 문제가 안 생긴다. 대신 시간이 더 든다.

---

## 11. 계획서가 틀렸던 곳 · 이 판이 못 한 것

**틀린 문장 둘.** 둘 다 본문에 근거와 함께 적었다:

1. **D2의 첫 갈래(*"한 자리에서 오게 하라"*)는 불가능하다** — §2. 계획서는 재라 #1이 그것을
   가능하게 해 줄 것으로 봤는데, `--env-file`은 *"compose가 어느 파일을 읽나"*만 바꾸지
   **접속 문자열 안의 포트**를 없애 주지 않는다.
2. **D3의 *"빈 DB로 뜬 서버"*는 존재하지 않는다** — §3. 빈 DB에서는 **뜨지 못한다.**

**재라 #5(*"포트가 갈리면 DB 이름을 안 갈라도 된다"*)는 참이지만 결론이 반대로 났다** — §4.

**계획서가 안 정한 갈림길에서 판정한 것 넷:**

1. **`--env-file apps/api/.env`**(저장소 루트 `.env`가 아니라) — 검사를 서버 안에 둘 수 있는
   유일한 길이다(§2)
2. **DB 이름 가르기를 절차에 남겼다** — compose가 조용해지는 길을 새로 쟀기 때문이다(§4.1)
3. **빈 DB 문장을 실패 경로에 뒀다**(§3)
4. **`missing-database-hint`를 `docker compose exec`로 바꿨다** — 옛 컨테이너 이름이 없어졌다

**못 한 것 넷:**

- **옛 볼륨 복사를 안 돌려 봤다**(§10) — 사용자 데이터라 절차만 적었다.
- **`--env-file`을 뺀 `up -d`가 실제로 무엇을 하는지 안 쟀다** — 기본값이 5433이라 재려면
  사용자 컨테이너의 포트를 건드려야 한다. **잰 것은 `docker compose config`가 그때 5433을
  낸다는 것까지다.**
- **워크트리 셋 이상을 안 재 봤다** — 앞 판과 같다. 이 판의 값도 전부 **둘**에서 나왔다.
- **에디터(vite)를 이번엔 안 띄웠다** — 프록시 갈래는 앞 판이 이미 닫았고 이 슬라이스가
  건드리지 않았다. 교차 확인은 api 두 대에 직접 걸어서 했다(§5).

**0 사망은 없었다** — 스물하나 중 넷이 살아남았고 그 넷을 자로 닫아 다시 심으니 다 죽었다.
