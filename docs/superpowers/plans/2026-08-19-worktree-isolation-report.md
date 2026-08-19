# 워크트리 격리 — 보고

> 계획: `2026-08-19-worktree-isolation.md` · 이월은 새로 만들지 않고
> `2026-08-17-p10-2-carryforward.md` §3을 갱신했다

**한 줄.** 갈래 넷을 **전부 재현**했고(조용한 둘 포함), 포트를 한 자리로 모으고 DB를
워크트리마다 갈랐으며, **문서만 보고 워크트리 둘을 띄워 되짚었다**. 게이트 넷 전부 **0**,
심은 변이 **여덟이 여덟 다 죽었다**(**그 여덟에 한해서다** — 리뷰가 안 덮인 배선에 심어
넷을 살렸고 **§10이 그것을 닫았다**). **D3은 하기로 판정했다** — 재 보니 비용이 사실상 0이라
`CLAUDE.md`의 *"api 테스트를 동시에 돌리지 않는다"*를 풀었다.

**이 기계.** macOS 26.6.1 · Apple Silicon · Node **22.23.1** · pnpm **10.0.0** ·
Docker(엔진 재시작 직후) · vite **6.4.3** · vitest **3.2.7**. 아래 값은 **이 기계에서 잰 것**이고
남이 잰 값에는 귀속을 붙였다.

**사용자 데이터.** 시작 `users=14 projects=16 pages=358`, 끝 **같다**. `wirebound`·
`wirebound_test`를 지우지 않았고 볼륨을 건드리지 않았다. 검증용 DB **아홉**을 새 이름으로
만들었고 **끝나고 전부 지웠다**(남은 DB는 `postgres`·`template0`·`template1`·`wirebound`·
`wirebound_test` 다섯뿐이다).

---

## 0. 시작 전에 — **브리프의 전제 하나가 틀려 있었다**

브리프는 *"Postgres 는 최상위에서 healthy 하게 떠 있다"*고 적었는데 **떠 있지 않았다.**

```
status=exited  ExitCode=255  FinishedAt=2026-08-19T02:27:17Z
```

같은 시각에 `base-redis`·`base-caddy`·`base-mariadb`도 전부 255로 죽어 있고 `erdd-db-1`만
`Up 3 minutes`였다 — **Docker 엔진이 재시작한 자국**으로 보인다(단정하지 않는다). 컨테이너는
`CLAUDE.md`가 메인 세션 소유라고 적은 공유 자원이라 손대지 않고 물었고, **코디네이터가
띄웠다.** 볼륨은 그대로였다.

**그 `docker inspect` 한 번이 이 슬라이스에서 가장 큰 값을 냈다 — §2.5.**

---

## 1. 산출물

| 무엇 | 왜 |
|---|---|
| `apps/web/config/api-proxy-target.ts`(새로) · `apps/web/test/api-proxy-target.test.ts`(새로) | D1·D6. 프록시 대상을 정하는 **순수한** 규칙과 그 자 |
| `apps/web/vite.config.ts` | D1·D4. `node:util`의 `parseEnv`로 `apps/api/.env`를 읽고, 뜰 때 대상을 말한다 |
| `apps/web/tsconfig.node.json`(새로) · `apps/web/tsconfig.json` · `package.json` | 브라우저 프로그램에 Node 타입이 새지 않게 가른다. `typecheck` 글롭을 `apps/*/tsconfig*.json`으로 넓혔다 |
| `apps/api/src/db/describe-target.ts`(새로) · `src/main.ts` · `test/db-target-log.test.ts`(새로) | D4. 서버가 **어느 DB를 보는지** 말한다. 자격 문자열은 안 찍는다 |
| `apps/api/test/test-database-url.ts`(새로) · `test/test-database-url.test.ts`(새로) · `test/helpers.ts` | D3. `TEST_DATABASE_URL`이 `apps/api/.env`에서도 온다 |
| `apps/api/test/global-setup.ts` | D3. 없는 DB(`3D000`)일 때 **만드는 한 줄**을 에러에 붙인다 |
| `apps/api/.env.example` | D2. 워크트리마다 갈라야 하는 값 셋 |
| `README.md` **§3.1(새로)** · §3 · §6.3 · §6.4 · §6.6 · §9 · §10 | D5. **절차를 소유하는 자리** |
| `CLAUDE.md` · `apps/api/README.md` | D5. 규칙을 갱신하고 절차는 README를 **가리킨다** |
| `docs/superpowers/plans/2026-08-17-p10-2-carryforward.md` | §3.7 — 미결 장부 갱신 |

**새 런타임 의존은 없다.** 더한 것은 `apps/web`의 `@types/node`(타입 전용 devDependency,
저장소의 나머지와 같은 `^26.1.2`) 하나이고 이유는 §3.3에 적었다.

---

## 2. T1 — **오늘 무엇이 어떻게 부딪히는가**

무대는 워크트리 **둘**이다. 포트 3001은 사용자 자리라 쓰지 않았고, **기전을 그대로 두고
수만 옮겨서** 쟀다(박혀 있던 3001 → 3031). 사용자 DB로는 아무것도 재지 않았다.

### 2.1 시끄러운 둘 — 그대로였다

| 갈래 | 관측 |
|---|---|
| **API 포트** | `Error: listen EADDRINUSE: address already in use 127.0.0.1:3031` · **종료 코드 1** |
| **에디터 포트** | **안 부딪힌다.** vite가 `Port 5173 is in use, trying another one...`을 찍고 5174로, 다음 것이 5173·5174를 모두 건너뛰고 5175로 떴다 |

> **재라 #5 — 사실이었다.** 계획서는 *"`strictPort`가 없는 것만 봤다"*고 적었는데 실제로
> 올려 뜬다. **그리고 이것이 사실 2의 말대로 조용한 교차를 더 잘 만든다** — 에디터끼리는
> 안 부딪히므로 사람은 *"둘 다 잘 떴다"*고 읽는다.

### 2.2 조용한 것 ① — **에디터가 옆 워크트리의 API에 붙는다**

무대: A의 api `3031`/DB `wb_probe_a`(사용자 `alice@a`), B의 api `3032`/DB `wb_probe_b`
(사용자 `bob@b`). 두 워크트리의 `vite.config.ts`는 **똑같이 3031을 박고 있다**(오늘의 상태).
B의 에디터는 5175에 떴다.

| 무엇을 했나 | 관측 |
|---|---|
| B의 에디터에 **B 자신의 계정**으로 로그인 | **401** `{"error":{"code":"unauthenticated","message":"이메일 또는 비밀번호가 올바르지 않습니다"}}` |
| B의 에디터에 **A의 계정**으로 로그인 | **200**, 그리고 `/api/auth/me`가 **A워크트리의 alice**를 돌려줬다 |
| B의 api(3032)가 그 로그인을 봤나 | **0건** |
| A의 api(3031)가 봤나 | **2건** |
| vite가 무슨 말을 했나 | **아무 말도 안 했다**(프록시가 성공했으므로) |

**진단.** 대상이 상수이고 포트가 변수라 **사람이 두 자리를 맞추는 구조**다. 어긋나면
연결이 *실패*하는 게 아니라 **성공한다** — 그래서 조용하다. 사람이 읽는 것은
*"내 비밀번호가 틀렸나?"*이고, 실제로 일어난 일은 *"내 화면이 남의 서버를 보고 있다"*이다.

### 2.3 조용한 것 ② — **한 워크트리의 마이그레이션이 다른 쪽 스키마를 바꾼다**

무대: B의 `DATABASE_URL`을 A의 DB(`wb_probe_a`)로 돌렸다. **오늘 그것을 막는 것은 없다.**
A의 서버는 계속 떠 있었고 A는 아무것도 안 했다.

```
# B 에서
$ pnpm --filter @wirebound/api migrate:down
  ✓ Down 0011-api-tokens
마이그레이션 완료                                    ← 종료 0. B 는 성공했다고 읽는다

# A 의 살아 있는 서버에 요청
$ curl .../api/projects/<id>/tokens
{"error":{"code":"internal","message":"서버 오류가 발생했습니다"}}   http=500
# A 의 로그에만:
{"level":50,…,"err":{"type":"DatabaseError","message":"relation \"api_tokens\" does not exist"}}
```

**진단.** `migrate`는 자기가 어느 DB를 바꾸는지 말하지 않고, 서버도 자기가 어느 DB를
보는지 말하지 않는다. 두 터미널을 나란히 놓아도 **가를 값이 화면에 없다.** 그래서 D4가
*"뜰 때 어느 DB를 보는지 말하게 하라"*를 든 것이 정확했다.

### 2.4 조용한 것 ③ — **동시 `pnpm test`** (재라 #3)

**먼저 계획서의 의심을 판정한다.**

| 계획서/문서의 문장 | 판정 |
|---|---|
| `apps/api/README.md`: *"`revisions-concurrency.test.ts`가 `projects`·`users`를 범위 없이 지운다"* | **뜻은 맞고 두 군데가 틀렸다** |
| 코디네이터: *"내 grep은 `DELETE FROM`을 못 찾았다"* | **맞다.** `grep -r "DELETE FROM" apps/api/test/` → **0건** |

**어디 있었나.** Kysely로 적혀 있다 — `apps/api/test/helpers.ts`의 `resetRealData`가
`db.deleteFrom('projects').execute()` / `db.deleteFrom('users').execute()`, **`where` 없이**.
**그리고 파일이 하나가 아니다:** `beforeEach(resetRealData)`를 거는 파일이 **열넷**이고
api 테스트 파일은 **예순여덟**이었다(이 판이 잰 시점의 값이다 — **그 뒤로 낡았다.**
수를 산문에 적은 것이 잘못이고 §10.3이 그 자리를 고쳤다). 문서는 *"그 파일"* 하나만
든다 — **고쳤다.**

**그 다음 실측.** 워크트리 둘이 **같은 시각에** `vitest run --project api`를 돌렸다.

| | Test Files | Tests | 종료 코드 | Duration |
|---|---|---|---|---|
| **같은 테스트 DB** A | **16 실패** / 52 통과 | **92 실패** / 1226 통과 | **1** | 98.10s |
| **같은 테스트 DB** B | **10 실패** / 58 통과 | **53 실패** / 1265 통과 | **1** | 91.80s |
| **가른 테스트 DB** A | 68 통과 | **1318 통과** | **0** | 91.25s |
| **가른 테스트 DB** B | 68 통과 | **1318 통과** | **0** | 91.10s |

**깨지는 꼴이 셋이고 원인이 각각 다르다.**

| 꼴 | 몇 | 원인 |
|---|---|---|
| `relation "themes" does not exist` | **29건** | 상대의 `globalSetup`이 `latest → none → latest`를 도는 중 **판을 내렸다** |
| `409 이미 가입된 이메일입니다` / `409 이미 사용 중인 슬러그입니다` | — | 상대가 **실제로 커밋한** 픽스처 행과 부딪혔다 |
| `violates foreign key constraint "project_members_user_id_fkey"` | 2건 | 상대의 `resetRealData`가 **내 트랜잭션이 보던 `users`를 지웠다** |

**진단.** 격리 전략이 `poolOptions.forks.singleFork` **한 프로세스 안에서만** 성립한다.
프로세스가 둘이면 그 직렬화가 닿지 않고, `globalSetup`의 전체 다운이 남의 판을 통째로
내린다. **`singleFork`가 잘못된 것이 아니라 범위가 프로세스라는 것**이 사실이다.

### 2.5 ✱ **컨테이너와 볼륨 — 사용자가 보고한 "컨테이너명 충돌"의 정체**

`docker compose`는 **디렉터리 이름**을 프로젝트 이름으로 쓴다. 이 기계에서 쟀다:

| 어디서 | compose 프로젝트 이름 |
|---|---|
| 저장소 루트 | `wirebound` |
| `.worktrees/fix-worktree-isolation` | `fix-worktree-isolation` |

**컨테이너 이름 충돌은 이미 문서에 있었다**(README §6.3). **이 판이 새로 잰 것은 볼륨이다.**

```
$ docker system df -v
VOLUME NAME                                LINKS   SIZE
feat-p1-api_wirebound-pgdata               1       145.9MB   ← 사용자의 설계서
feat-p2b1-editor-shell_wirebound-pgdata    0       0B
wirebound_wirebound-pgdata                 0       0B        ← 저장소 루트가 쓸 것
```

**즉 저장소 루트에서 `docker compose up -d` 가 성공하는 날 빈 DB가 뜬다.** 오늘 그 길을
막고 있는 것은 **`container_name`이 고정이라는 사실 하나뿐**이다 — 이름이 부딪혀 둘째
컨테이너가 안 뜨므로 빈 볼륨을 마운트하는 데까지 못 간다.

> **여기는 추론이 섞여 있다.** *"빈 DB가 뜬다"*를 **끝까지 재지 않았다** — 재려면 사용자의
> 컨테이너를 지워야 한다. **잰 것은** 볼륨 셋의 이름·크기·`LINKS`와 `container_name`이
> 고정이라는 것까지다. README §10에 그렇게 적었다.

**그리고 이 기계의 컨테이너는 이미 그 함정 위에 서 있다.**

```
com.docker.compose.project             = feat-p1-api
com.docker.compose.project.working_dir = …/.worktrees/feat-p1-api
```

- `git worktree list`에 **그 워크트리가 없다.** 남은 것은 compose의 바인드 마운트가
  되살린 **빈 `docker/postgres-init/`** 디렉터리뿐이다(`docker-compose.yml`도 없다).
- 그래서 저장소 루트의 `docker compose ps`는 **빈 표에 종료 0**이고,
  `docker compose -p feat-p1-api ps`는 컨테이너를 **찾는다**(둘 다 쟀다).
- **`docker compose down`을 최상위에서 쳐도 이 컨테이너를 못 찾는다.**
- **그 빈 `postgres-init/`은 볼륨이 다시 만들어질 때 `01-test-db.sql`이 안 돈다는 뜻이다** —
  README §6.4의 함정이 그때 다시 온다.

> **`docker compose up -d`를 워크트리에서 쳐서 에러 원문을 재는 것은 이 판이 못 했다** —
> 이 세션의 도구 정책이 그 명령을 막았다(공유 docker 상태를 건드리는 명령이라 막힌 것이고,
> 브리프의 금지와 같은 방향이라 우회하지 않았다). README §6.3의
> `Conflict. The container name "/wirebound-postgres" is already in use…`는
> **설치 매뉴얼 판이 이 기계에서 잰 값이다**(귀속: `2026-08-18-install-manual-report.md` §3.1).

---

## 3. 재라 표 — 여섯을 다 쟀다

| # | 계획서의 문장 | 판정 | 값 |
|---|---|---|---|
| **1** | 새 의존 없이 `vite.config.ts`가 `apps/api/.env`를 읽을 수 있다 | **참** | Node 22.23.1에서 `util.parseEnv`·`process.loadEnvFile` **둘 다 function**. §3.1 |
| **2** | 셸이 이기는 순서가 vite 쪽에서도 된다 | **참 — 그리고 두 실행자가 같은 답을 낸다** | §3.2 |
| **3** | 두 워크트리가 동시에 `pnpm test`를 돌리면 깨진다 | **참. 다만 문서의 두 군데가 틀렸다** | §2.4 |
| **4** | `docker exec`로 DB를 한 줄에 만들 수 있다 | **참. 권한·인코딩·소유자 문제 없다** | §3.4 |
| **5** | vite가 포트를 자동으로 올린다 | **참** | §2.1 |
| **6** | `.env`를 안 고친 사람이 안 깨진다 | **참 — 두 갈래로 쟀다** | §5.2 |

### 3.1 재라 #1 — Node의 수단 둘, **하나를 골랐다**

```
node v22.23.1
typeof process.loadEnvFile = function
typeof util.parseEnv       = function
```

**`util.parseEnv`를 골랐다.** 셋 다 쟀다:

| | 셸 값을 덮나 | `process.env`를 바꾸나 | 파일이 없으면 |
|---|---|---|---|
| `util.parseEnv` + `readFileSync` | (내가 정한다) | **안 바꾼다** | `readFileSync`가 던진다 → `catch` |
| `process.loadEnvFile(path)` | **안 덮는다**(`PORT=9999`가 살아남았다) | **통째로 바꾼다** | **ENOENT를 던진다** |

`loadEnvFile`도 순서는 맞지만 **`process.env`를 통째로 바꾼다** — vite 프로세스의 환경에
`DATABASE_URL`(비밀번호 포함)이 얹힌다. 그래서 안 썼다.

**같은 판정을 테스트 쪽에도 썼고 거기서는 더 중요하다** — `apps/api/.env`를 통째로 얹으면
**운영 `DATABASE_URL`이 테스트 프로세스에 들어간다.** §2.4가 센 **열넷**의 파일이 그때
무엇을 지우는지는 적을 필요도 없다. 그래서 **파일에서 가져오는 키를 하나로 좁혔다**
(vite는 `PORT`만, vitest는 `TEST_DATABASE_URL`만). 케이스가 그것을 지킨다.

### 3.2 재라 #2 — 두 실행자가 같은 답을 낸다

api 쪽을 실제로 쟀다. `.env`에 `PORT=3032`가 있는 워크트리에서:

```
$ PORT=3031 pnpm --filter @wirebound/api start
Error: listen EADDRINUSE: address already in use 127.0.0.1:3031     ← 셸이 이겼다
```

에디터 쪽은 같은 규칙을 `resolveApiPort`가 명시적으로 다시 적고 케이스가 잰다.
**"두 실행자"가 실제로 같은 답을 내는 것은 §5.1의 되짚기가 값으로 보인다.**

### 3.3 새 의존 — `@types/node` 하나, 그리고 **tsconfig 를 가른 이유**

`vite.config.ts`가 `node:fs`·`node:util`을 import 하려면 Node 타입이 필요한데
`apps/web/tsconfig.json`은 `types: ["vite/client"]`이고 `@types/node`가 그 패키지에 없었다.

**`types`에 `"node"`를 그냥 더하지 않았다** — 그러면 `apps/web/src`의 **브라우저 코드가
`process`·`Buffer`를 보게 된다.** 이 저장소는 그 반대 방향을 이미 지키고 있다
(`packages/schema`에서 DOM 전역을 일부러 배제한다). 그래서:

- `apps/web/tsconfig.node.json`(새로) — `vite.config.ts` **하나만** 들고 `types: ["node"]`
- `apps/web/tsconfig.json` — `include`가 `["src", "test", "config"]`, `vite.config.ts`를 뺐다
- 결정 규칙은 `apps/web/config/api-proxy-target.ts`에 **순수하게** 산다 → 브라우저 프로그램
  안에 있어도 되고, **`node:` import 없이 자를 받는다**
- 루트 `typecheck` 글롭을 `apps/*/tsconfig.json` → **`apps/*/tsconfig*.json`**

> **그 새 tsconfig 가 진짜로 검사받는지 확인했다** — `apps/api/tsconfig.json`의 주석이
> *"안 들면 그 파일이 타입검사를 아예 안 받는다"*고 경고하는 자리다. `vite.config.ts`에
> 명백한 타입 오류를 심으니 **종료 코드 2**와
> `apps/web/vite.config.ts(26,7): error TS2322`가 나왔고, 복구하니 **0**이었다.

### 3.4 재라 #4 — `docker exec` 한 줄

```
$ docker exec wirebound-postgres psql -U wirebound -d postgres -c 'CREATE DATABASE wb_probe_a;'
CREATE DATABASE      (종료 0)
```

만들어진 DB가 기존 것과 **소유자·인코딩·콜레이션이 같다**:

| DB | owner | encoding | collate |
|---|---|---|---|
| `wirebound` | `wirebound` | UTF8 | en_US.utf8 |
| `wb_probe_a`(새로) | `wirebound` | UTF8 | en_US.utf8 |

**계획서의 추론이 맞았다** — 권한·인코딩·소유자에 손댈 것이 없다.

---

## 4. D3 — **판정: 가른다**

**근거는 §2.4의 표 하나다.** 가르는 비용이 **음수에 가깝다**:

- 값 하나(`TEST_DATABASE_URL`)와 `CREATE DATABASE` 한 줄
- 벽시계가 **안 늘어난다**(가른 쪽 91.25s·91.10s vs 공유한 쪽 98.10s·91.80s)
- 안 가르면 **파일 16개·케이스 92개**가 죽는다

그래서 **`CLAUDE.md`의 *"api 테스트를 도는 작업끼리도 Postgres 하나를 공유하므로 동시에
돌리지 않는다"*를 풀었다.** 다만 **조건부로** 풀었다 — *"가르지 않았으면 옛 규칙이 그대로
선다"*를 같은 문단에 적었다. 부트스트랩에서 `.env`를 안 고친 워크트리는 여전히 기본값
`wirebound_test`를 보기 때문이다.

**그 DB가 없으면 무엇이 보이는가**(D3이 물은 것):

```
error: database "wb_없는DB" does not exist
Serialized Error: { … severity: 'FATAL', code: '3D000', … }     종료 코드 1
```

**이미 보인다** — 이름을 말한다. README §6.4가 걱정한 *"이유를 알기 어려운 접속 에러"*
부류가 아니다. **그래도 조치를 붙였다:**

```
테스트 DB "wb_아직없다" 가 없습니다.
컨테이너 안에서 한 줄로 만든다:
  docker exec wirebound-postgres psql -U wirebound -d postgres -c 'CREATE DATABASE wb_아직없다;'
TEST_DATABASE_URL 은 셸 → apps/api/.env → 기본값 순서로 정해진다.
```

이 슬라이스가 **"워크트리마다 DB를 만든다"를 흔한 첫걸음으로 만들었기 때문**이다.
**`3D000`일 때만 붙인다** — 다른 실패에까지 붙이면 엉뚱한 곳을 보게 된다.

> **여기서 버그를 하나 만들고 잡았다.** 처음 판은 DB 이름을 `URL.pathname`에서 그대로
> 뽑아 **퍼센트 인코딩된 채로** 찍었다 — `CREATE DATABASE wb_%EC%95%84%EC%A7%81%EC%97%86%EB%8B%A4;`.
> **권하는 명령이 실제로는 못 쓰는 명령이었다.** 디코딩을 넣고 케이스를 세웠다.

---

## 5. T6 — **문서만 보고 워크트리 둘을 띄웠다**

무대: 워크트리 둘(`fix-worktree-isolation`, 새로 만든 `tmp-retrace`). README §3.1을
**글자 그대로** 따랐다.

### 5.1 네 터미널이 각각 자기를 말한다

```
############ 워크트리 A ############        ############ 워크트리 B ############
"msg":"Server listening at http://127.0.0.1:3051"   "msg":"Server listening at http://127.0.0.1:3052"
"msg":"이 서버가 보는 DB: 127.0.0.1:5433/wb_isolation"  "msg":"이 서버가 보는 DB: 127.0.0.1:5433/wb_retrace"
  ➜  Local:   http://localhost:5174/                  ➜  Local:   http://localhost:5175/
  ➜  API 프록시:  http://127.0.0.1:3051                ➜  API 프록시:  http://127.0.0.1:3052
```

**프록시 대상을 손으로 맞춘 자리가 없다.** 고친 것은 `.env`의 값 셋뿐이다.

### 5.2 교차가 닫혔는지 — **§2.2와 같은 자를 다시 댔다**

| | 결과 |
|---|---|
| A 에디터 + **A** 계정 | **200** |
| B 에디터 + **B** 계정 | **200** |
| A 에디터 + **B** 계정 | **401** |
| B 에디터 + **A** 계정 | **401** |

§2.2에서 **200이 나오던 자리가 401**이다. 각 DB의 `users`도 하나씩만 들어 있었다
(`wb_isolation: a@iso.example` / `wb_retrace: b@rt.example`).

### 5.3 D6 — **`.env`를 안 고친 사람** (재라 #6)

| 상태 | 관측 |
|---|---|
| `apps/api/.env`가 **아예 없다** | `➜  API 프록시:  http://127.0.0.1:3001` — **오늘과 같다** |
| `.env.example`을 **복사만** 하고 안 고쳤다 | `➜  API 프록시:  http://127.0.0.1:3001`, api 테스트 한 파일 **18 통과 · 종료 0**(기본 `wirebound_test`를 봤다) |

### 5.4 되짚기가 찾은 구멍 — **하나**

**§3.1이 워크트리를 *만드는* 법을 안 들었다.** 절차가 *"만든 뒤"*부터 시작해서, 문서만 가진
사람은 `git worktree add`를 어디서 얻는지 모른다. 그 규칙은 `CLAUDE.md`가 소유하므로
**§3.1이 그것을 가리키게 고쳤다**(두 벌로 안 적었다).

그 밖에 문서에 없는 지식을 쓴 자리는 없었다. `pnpm install`의 `WARN` 둘은 §6.2가 이미
들고 있었고, 에디터 포트가 5174·5175로 밀린 것도 §3.1의 표가 예고한 그대로였다.

### 5.5 ✱ **되짚다가 새로 잰 것 — 에디터도 다시 띄워야 한다**

`.env`를 고치고 **에디터를 안 다시 띄우면 옛 대상을 잡고 있다.**

```
# .env 를 3041 → 3042 로 고치고 5초 뒤
  ➜  API 프록시:  http://127.0.0.1:3041     ← 그대로다. vite 는 다시 안 떴다
$ curl .../api/auth/me   →  http=500
  [vite] http proxy error … ECONNREFUSED 127.0.0.1:3041
# 다시 띄우면
  ➜  API 프록시:  http://127.0.0.1:3042
```

**vite는 자기 설정 파일이 바뀌면 스스로 다시 뜨지만 `apps/api/.env`는 감시 대상이 아니다.**
`tsx watch`가 `.env`를 안 보는 것과 **같은 결이고 같은 조치**(다시 띄운다)라 README의
그 인용문을 확장해 한 자리에 뒀다. **다시 띄웠는지 확인하는 값도 그 `➜  API 프록시:` 줄이다.**

---

## 6. 구분력 — **여덟을 심어 여덟이 죽었다**

프로덕션(과 그에 준하는) 파일을 고쳐 새 케이스가 **실제로** 죽는지 확인하고 **전부 복구했다.**

| # | 무엇을 심었나 | 결과 |
|---|---|---|
| M1 | `fromShell ?? fromFile` → **뒤집기**(파일이 셸을 이기게) | **죽었다**(1) |
| M2 | `PORT` 숫자 검사를 `if (false)` 로 | **죽었다**(1) |
| M3 | 빈 문자열을 *"줬다"*로 치게 | **죽었다**(1) |
| M4 | `describeDatabaseTarget`이 **접속 문자열을 통째로** 내게 | **죽었다**(1) |
| M5 | 퍼센트 디코딩을 빼기 | **죽었다**(1) |
| M6 | `main.ts`가 DB를 **안 말하게**(그 줄 삭제) | **죽었다**(1) |
| M7 | `TEST_DATABASE_URL`이 `apps/api/.env`를 **안 읽게**(오늘로 되돌리기) | **죽었다**(1) |
| M8 | 셸 값을 무시하게(순서 깨기) | **죽었다**(1) |

**복구 확인.** `git status`에 남은 것은 `M README.md`(§5.4의 수정) 하나였고
`git diff --stat -- apps/web/config apps/api/src apps/api/test`가 **비었다.**

**게이트를 심은 것도 하나 있다** — §3.3의 tsconfig 확인(종료 2 → 복구 후 0).

---

## 7. 게이트 넷 — **전부 0** (종료 코드를 파이프 없이 따로 찍었다)

```
게이트 1  pnpm test        종료 코드 = 0     Test Files 276 passed (276) · Tests 5082 passed (5082) · 104.74s
게이트 2  pnpm typecheck   종료 코드 = 0
게이트 3  pnpm build       종료 코드 = 0
게이트 4  pnpm test:build  종료 코드 = 0     Test Files 6 passed (6) · Tests 72 passed (72) · 8.26s
```

돌리기 전에 `ps`로 **다른 vitest가 없는 것**을 확인했고, 사용자의 vite(ERDD, 5173)는
처음부터 끝까지 건드리지 않았다. `test:build`가 **13 skipped가 아닌 72 통과**인 것은 이
기계에 브라우저가 있기 때문이다(빈 캐시의 값은 귀속: 리뷰 §7 — README §9).

---

## 8. 공유 자원 — 무엇을 했고 무엇을 안 했나

| | |
|---|---|
| `docker compose down -v` | **안 썼다** |
| 컨테이너 | **새로 안 띄웠다.** 죽어 있는 것을 발견해 **물었고 코디네이터가 띄웠다** |
| 포트 3001 | **안 썼다**(3031·3032·3041·3042·3051·3052를 썼다) |
| `wirebound` DB | 시작 `14/16/358`, 끝 **같다** |
| `wirebound_test` | 안 지웠다. 마이그레이션 열하나가 그대로다 |
| 검증용 DB | **아홉을 새 이름으로 만들고 전부 지웠다.** 남은 DB는 다섯(시스템 셋 + `wirebound` + `wirebound_test`) |
| 볼륨 | **하나도 안 만들고 안 지웠다**(§2.5는 전부 읽기 명령이다) |
| 임시 워크트리 | 둘을 만들고 **둘 다 지웠다**(브랜치도 삭제). `git worktree list`가 셋 → 둘 |
| 최상위 체크아웃 | **아무것도 안 띄웠다.** 두 번째 무대는 `.worktrees/` 아래에 만들었다 |
| `apps/api/.env` | 되짚기 뒤 `.env.example` 그대로 되돌렸다 |

---

## 9. 계획서가 틀렸던 곳 · 이 판이 못 한 것

**틀린 문장은 하나였다** — 계획서 자체가 아니라 그것이 인용한 `apps/api/README.md`다
(§2.4). 계획서의 재라 표는 **여섯이 여섯 다 맞았다.**

**계획서가 안 정한 갈림길에서 판정한 것 셋** — 전부 근거를 본문에 적었다:

1. `loadEnvFile` 대신 `parseEnv`, **가져가는 키를 하나로 좁혔다**(§3.1)
2. `types: ["node"]`를 더하지 않고 **tsconfig 를 갈랐다**(§3.3)
3. 없는 DB 에러에 **조치 한 줄을 붙였다**(§4)

**못 한 것 셋** — README §10에 같은 목록을 뒀다:

- **워크트리에서 `docker compose up -d`의 에러 원문**을 이 판이 직접 못 쟀다(도구 정책).
  값은 설치 매뉴얼 판의 것을 귀속을 붙여 옮겼다.
- **이름 충돌이 사라진 뒤 빈 볼륨이 마운트되는 것**을 끝까지 못 쟀다(§2.5). 추론이라고 적었다.
- **워크트리 셋 이상**은 안 재 봤다. 모든 값이 **둘**에서 나온 것이다.

**0 사망은 없었다** — 심은 여덟이 여덟 다 죽었다.

---

## 10. 리뷰 대응 — **변이 넷이 살아 있었다**

> 리뷰: `2026-08-19-worktree-isolation-review.md`(판정 **병합 가능** · 막는 것 없음) ·
> 미결 장부는 `2026-08-17-p10-2-carryforward.md` **§3.8**이 갱신했다.

**§6의 *"여덟이 여덟 다 죽었다"*는 그 여덟에 한해 참이다.** 리뷰가 겹치지 않는 자리에
아홉을 심어 **넷이 살았고**, 살아남은 자리가 전부 한 꼴이었다(귀속: 리뷰 §9.1):

> **순수한 규칙에는 자가 촘촘한데, 그 규칙을 꽂는 배선 한 줄에는 자가 없다.**

**내 여덟이 전부 덮인 쪽에 심겨 있었다** — 그래서 여덟이 다 죽은 것이 자의 촘촘함을
증명하지 못했다. 안 덮인 배선에 심으면 **게이트 넷이 전부 초록인 채로** 회귀가 지나간다.
가장 무거운 것은 `helpers.ts` 쪽이다: `fileEnv` 인자 하나를 빼면 이 슬라이스가 산 것이
통째로 사라지는데 **70 파일·1333 케이스가 전부 통과한다**(귀속: 리뷰 §9 R4).

### 10.1 닫았다 — 넷 다

| 리뷰 # | 무엇 | 세운 자 | 재심기 |
|---|---|---|---|
| R3 | `vite.config.ts` 배선 | `?raw` 인구조사 — 인자 객체를 키→값으로 대조 | **죽는다**(1) |
| R4 | `helpers.ts` 배선 | 읽기+순서를 `resolveTestDatabaseUrlFrom`으로 내리고 **임시 파일로 행동을 잰다** + 인구조사 | **죽는다**(1) |
| R5 | 힌트의 관문(`3D000`) | `missing-database-hint.ts`로 꺼내 직접 잰다 | **죽는다**(1) |
| R6 | 힌트의 **자격 문자열 유출** | 같은 파일 — 케이스 넷이 문다(D4) | **죽는다**(1) |
| R7 | `.env.example` | `EnvSchema`를 소스에서 세어 대조 | **죽는다**(1) |

**자를 어디에 세울지 판정한 근거.** 배선은 앱이 갈려 있어 한 자리에 못 모은다
(`apps/web`이 `apps/api`를 import 할 수 없다). **행동을 잴 수 있는 쪽은 행동으로**
(api — 경로를 인자로 받게 해 임시 파일을 준다), **못 재는 쪽은 인구조사로**
(web — 브라우저 프로그램에 `node:fs`가 없어 `?raw`로 원문을 읽는다. `shell-css`·
`store-access`가 쓰는 이 저장소의 관용구다). **인구조사는 글자를 보는 자라 뒤집기·삭제는
잡고 같은 뜻의 다른 표기는 못 잡는다** — 그 한계를 안고 쓴다.

### 10.2 이 판이 틀렸던 곳 — 셋

| 무엇 | 판정 |
|---|---|
| **§3.3의 tsconfig 근거** | **거짓이었다.** *"`types`에 `node`를 더하면 브라우저 코드가 `process`·`Buffer`를 보게 된다"*고 적었는데, `apps/web/src/main.tsx`에 그 둘을 심어도 `pnpm typecheck` **종료 0**이다 — `@types/node`가 없던 main 에서도 같았다(귀속: 리뷰 §9 R8, 이쪽에서 다시 쟀다). **주석을 고쳤고 구조는 안 건드렸다**(장부 §3.8) |
| **§4의 비용 근거** | **기준이 틀렸다.** *"가른 쪽이 공유한 쪽보다 짧다"*로 댔는데 **공유한 쪽은 실패하는 판이라 일이 덜 든다.** 옳은 기준은 **단독 실행**이다 — 리뷰어 판에서 단독 94.02초 vs 동시 두 판이 각각 90.9초(귀속: 리뷰 §5). **결론은 그대로 서고 근거가 더 좋아진다** |
| **깨지는 개수를 한 번 잰 값으로 단정했다** | 경쟁 상태라 **판마다 다르다.** 내 판 16/92·10/53, 리뷰어 판 13/57·18/82. 꼴도 갈렸다 — 내 판의 `relation "themes" does not exist` 29건이 리뷰어 판에는 **한 번도 안 났다**. **문서에서 개수를 걷어 내고 종료 코드만 남겼다** |

### 10.3 문서 — 리뷰가 든 셋을 고쳤다

**A** README §3.1의 *"5번과 `pnpm test` 가 그 한 줄을 함께 찍는다"*가 `migrate`에서 거짓이었다
(다시 쟀다: 종료 1 · `마이그레이션 실패: error: database "…" does not exist` · **힌트 0 줄**).
**B** 68·1318·예순여덟이 **이 판에서** 낡았다 — 수를 다시 적지 않고 안 낡는 값만 남겼으며,
`apps/api/README.md`의 개수는 **`real-api-harness.test.ts`의 불변식**이 대신 든다.
**C** `CLAUDE.md`가 가리키면서 동시에 베꼈다(D5 위반) — 값 복창을 걷어 냈다.

**§7.1의 교훈을 한 줄로:** **산문에 적어도 되는 수는 안 낡는 것뿐이다.**
