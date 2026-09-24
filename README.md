# wirebound

웹 화면 설계 도구. 관리자 화면을 시작점으로 하되 마케팅·포털·커머스 등 다양한 형태의 웹
설계서를 같은 도구로 작성한다. 설계서를 브라우저에서 편집하고, HTML 정적 번들과 PPTX로
내보내고, `wireb`(CLI)와 MCP 서버로 구현 리포에서 그 설계서를 읽는다.

**이 문서는 저장소를 처음 받은 사람이 처음부터 끝까지 따라가는 길이다.** 끝나면 웹 화면이
뜨고, `wireb`가 붙고, MCP가 등록되고, pptx가 나온다.

- **API 서버의 계약**(엔드포인트 표·에러 형식·권한·내보내기 응답 형태)은 [`apps/api/README.md`](apps/api/README.md)에 있다. 이 문서는 그것을 **가리키고 옮기지 않는다.**
- 설계 문서: `docs/superpowers/specs/2026-08-03-wirebound-design.md`
- 구현 계획·이월: `docs/superpowers/plans/`

> **적은 것은 전부 돌려 봤다.** 값에 *"이 기계에서 쟀다"*가 붙은 것은 macOS 26.6.1 ·
> Apple Silicon · Node 22.23.1 · pnpm 10.0.0 · Docker 29.5.2에서 실제로 관측한 것이다.
> **안 돌아본 것은 "못 잰 것"에 모아 뒀다** — 지어내지 않았다.

---

## 1. 필요한 것

| 무엇 | 요구 | 왜 |
|---|---|---|
| **Node** | **≥ 22.9** (`package.json`의 `engines`) | 스크립트가 `--env-file-if-exists`를 쓴다. 그 플래그가 22.9에서 들어왔다 |
| **pnpm** | **10.0.0** (`packageManager`) | 워크스페이스 심링크와 `node_modules` 배치가 이 저장소의 전제다. npm·yarn으로는 안 된다 |
| **Docker** | 아무 최신판 | Postgres 하나를 띄운다. DB를 직접 갖고 있으면 없어도 된다(「세우기」 절의 끝) |
| **Chromium** | **PPTX의 화면 이미지를 쓸 때만** | 저장소가 브라우저 바이너리를 안 들고 있다. 「PPTX 의 화면 이미지」 절이 그 자리다 |

```bash
node -v && pnpm -v && docker -v
```

---

## 2. 세우기 — 다섯 걸음

**순서가 있다.** 4번을 빼먹으면 테스트는 통과하는데 서버만 안 뜬다(같은 제목의 절). **환경 파일이
1번인 것도 순서다** — `docker compose` 가 그 파일을 읽으므로 없으면 2번이 죽는다.

```bash
# 1. API 의 환경 파일을 만든다 — 아래 2번이 이 파일을 읽는다
cp apps/api/.env.example apps/api/.env

# 2. Postgres 를 띄운다 — 저장소(또는 워크트리) 루트에서
docker compose --env-file apps/api/.env up -d     # 이 플래그를 빼지 마라 → 「컨테이너를 못 찾는다」
docker compose ps                                 # healthy 가 될 때까지 기다린다
                                                  # PORTS 칸에 포트가 보여야 한다 → 「컨테이너를 못 찾는다」
                                                  # healthy 가 아니면 5번과 테스트가 전부 접속 실패로 죽는다

# 3. 워크스페이스를 설치한다
pnpm install

# 4. packages/* 를 빌드한다 — 건너뛰지 마라
pnpm build

# 5. 마이그레이션을 올리면서 **계정을 만든다** — 가입 화면이 없다
SEED_USER_EMAIL=me@example.com SEED_USER_PASSWORD='고른-비밀번호' \
  pnpm --filter @wirebound/api migrate
```

> **5번의 두 환경변수가 이 저장소에서 계정을 만드는 유일한 길이다.** 공개 가입 경로가
> 없다 — **에디터에도 회원가입 화면이 없다.** 값을 비우고 돌리면 마이그레이션만 올리고
> *"계정 시딩 건너뜀"*을 한 줄 찍는다(그때 로그인할 계정이 없다).
>
> **`apps/api/.env` 에 적어도 된다**(그 파일은 gitignore 된다 — `migrate` 가 읽는다).
> **`.env.example` 에는 적지 마라** — 그 파일은 커밋된다. 그래서 템플릿의 세 줄은
> 값이 비어 있고, `apps/api/test/env-example-census.test.ts` 가 그것을 잰다.
>
> **다시 돌려도 안전하다.** 그 이메일이 이미 있으면 그대로 두고 **비밀번호를 덮어쓰지
> 않는다.** **값을 바꿔 다시 돌리면 계정이 하나 는다** — 두 번째 사람을 만드는 길이
> 이것이다(멤버 초대는 이미 계정이 있는 사람만 대상이다). 이름을 정하려면
> `SEED_USER_NAME` 을 함께 준다(비우면 이메일의 로컬 파트를 쓴다).
>
> **이메일 형식이나 비밀번호 길이(8자 이상)가 어긋나면 종료 1 이고, 무엇이 됐고 무엇이
> 안 됐는지 말한다** — 마이그레이션은 이미 올라간 뒤다. **비밀번호는 어느 갈래에서도
> 안 찍힌다.**

**이 기계에서 잰 값**

| 걸음 | 시간 | 관측 |
|---|---|---|
| `pnpm install` | **1.2초** | 패키지 수는 명령의 끝 줄이 말한다. **pnpm 스토어가 이미 따뜻한 기계다** — 처음 받는 기계는 내려받는 시간이 더 든다. `wireb` 관련 `WARN` 둘이 나오는데 **정상이다**(「`pnpm install`이 `wireb` 때문에 경고를 낸다」) |
| `pnpm build` | **4.2초** | `packages/*` 여섯의 `dist` |
| `migrate` | **1.5초** | 빈 DB 에 마이그레이션 전부(`ls apps/api/src/db/migrations/0*.ts \| wc -l` 개)를 올린 값이다. **시딩은 안 켠 값이다** — 켜면 scrypt 해시 한 번이 더 든다 |

다시 재려면 각 걸음 앞에 `time` 을 붙인다.

`docker compose … up -d`가 만드는 것은 Postgres 컨테이너 하나이고 **호스트 포트는
`apps/api/.env` 의 `POSTGRES_PORT` 다. 기본값은 5433**이다(5432가 아니다 — 기계에 이미
있는 Postgres 와 겹치지 않게 비켜 뒀다). 접속 문자열은 `.env.example`에 그 값으로 들어 있다.

**컨테이너 이름은 고정이 아니다.** compose 가 `<프로젝트>-postgres-1` 로 짓고 **프로젝트
이름은 디렉터리 이름**이다(**대문자는 소문자로 낮춘다** — `stageA` →
`stagea`) — 저장소 루트에서 띄우면 `wirebound-postgres-1`, 워크트리에서
띄우면 `<워크트리이름>-postgres-1`. **볼륨도 같은 규칙으로 갈린다**(`<프로젝트>_wirebound-pgdata`).
그래서 **워크트리마다 자기 컨테이너·자기 데이터**를 갖는다(「워크트리를 여럿 띄울 때」). 이름으로 컨테이너를 찾지
말고 `docker compose …` 를 쓴다(「컨테이너를 못 찾는다」). **`docker-compose.yml` 에 `container_name` 을 박지 않는다** —
박으면 둘째 워크트리의 `up` 이 `Conflict. The container name "/…" is already in use` 로 죽는다
(`apps/api/test/port-agreement.test.ts` 가 그 부재를 잰다).

> **`--env-file apps/api/.env` 를 빼면 포트가 기본값(5433)으로 되돌아간다.** 그러면
> 컨테이너가 그 포트로 **다시 만들어지고**, `apps/api/.env` 의 접속 문자열은 다른 수를
> 가리킨 채 남는다. `up` 에서는 그 플래그를 생략하지 않는다 — `ps`·`logs`·`exec`·`down` 은
> 프로젝트 이름으로 찾으므로 플래그가 없어도 된다(이 기계에서 쟀다).
>
> **어긋나면 서버도 테스트도 뜨지 않고 어디가 어긋났는지 말한다**(「워크트리를 여럿 띄울 때」 절의 «포트를 어긋나게 적으면 무엇이 보이나»). 그 검사는
> `POSTGRES_PORT` 가 있을 때만 돈다.

**컨테이너를 안 쓰고 자기 Postgres 를 쓸 수도 있다.** `apps/api/.env`의 `DATABASE_URL`을
그쪽으로 바꾸고 **`POSTGRES_PORT` 줄을 지운다**(그 줄은 compose 가 여는 포트라 자기
Postgres 와는 상관이 없다 — 남겨 두면 포트가 어긋났다며 서버가 안 뜬다). 그때 **DB 둘이
필요하다** — 운영용 하나와 테스트용 `wirebound_test`(「게이트」 절).

---

## 3. 띄우기

서버는 **둘이고 함께 떠 있어야 한다.**

```bash
# 터미널 1 — API (기본 포트 3001)
pnpm --filter @wirebound/api dev

# 터미널 2 — 에디터
pnpm --filter @wirebound/web dev
```

두 번째 터미널이 낸 주소(기본 `http://localhost:5173/`)를 브라우저에서 연다. **로그인
화면뿐이고 회원가입 화면은 없다** — 「세우기」 절 5번에서 만든 계정으로 로그인해 프로젝트를 만든다.
계정을 안 만들었으면 지금 만든다(그 명령 하나면 되고, 서버를 내릴 필요도 없다):

```bash
SEED_USER_EMAIL=me@example.com SEED_USER_PASSWORD='고른-비밀번호' \
  pnpm --filter @wirebound/api migrate
```

**에디터가 `/api`를 API 서버로 프록시한다** — 그래야 세션 쿠키가 same-origin 으로 실리고
서버에 CORS 설정이 필요 없다. **그 대상은 `apps/api/.env`의 `PORT`를 따라간다** —
`apps/web/vite.config.ts`가 그 파일을 읽는다(`node:util`의 `parseEnv`, 새 의존 없음).
**두 자리를 손으로 맞추지 않는다.**

두 터미널이 각각 자기가 어디를 보는지 말한다(이 기계에서 쟀다):

```
# 터미널 1 (API)
{"level":30,…,"msg":"Server listening at http://127.0.0.1:3001"}
{"level":30,…,"msg":"이 서버가 보는 DB: 127.0.0.1:5433/wirebound · 마이그레이션 N건"}

# 터미널 2 (에디터)
  ➜  Local:   http://localhost:5173/
  ➜  API 프록시:  http://127.0.0.1:3001
```

> **값의 순서는 셸 → `apps/api/.env` → 기본값(3001)이다.** api 서버가 쓰는
> `--env-file-if-exists`와 같은 순서라 **두 실행자가 같은 답을 낸다.** 셸에
> `PORT=3011`을 걸면 서버도 에디터도 3011 이다. `.env`가 없으면 둘 다 3001 이다.
>
> **`PORT`에 숫자가 아닌 값이 들어 있으면 에디터가 뜨지 않고 그렇다고 말한다.** 조용히
> 3001 로 물러나면 api 는 (같은 값을 거부해서) 안 뜨는데 에디터만 떠서 원래 없애려던
> 어긋남을 그대로 다시 만들기 때문이다.

> **뒤에 붙는 `마이그레이션 N건` 은 이 DB 의 스키마 상태다**(다 올렸으면
> `ls apps/api/src/db/migrations/0*.ts | wc -l` 과 같다). 워크트리마다 컨테이너를
> 띄우면 **빈 볼륨으로 뜨는 것이 정상 경로**가 되므로 그 갈림이 화면에 있어야 한다.
> **0 건이면 서버가 아예 안 뜬다** — 부팅 중에 `themes` 에 쓰기 때문이다. 그때 나오는
> 문장은 원문(`relation "themes" does not exist`)이 아니라 이것이다(이 기계에서 쟀다,
> 종료 코드 1):
>
> ```
> Error: 이 DB 는 비어 있습니다(마이그레이션 0건): 127.0.0.1:5433/wirebound
> 새 볼륨이면 정상입니다 — 마이그레이션을 올리십시오:
>   pnpm --filter @wirebound/api migrate
> 데이터가 있어야 하는데 비었다면 지우지 말고 다른 이름의 볼륨을 찾으십시오: docker volume ls
> ```
>
> **원문은 `Caused by:` 로 그대로 붙어 있다.** 그리고 *마이그레이션은 올렸는데 데이터만
> 없는* 볼륨은 이 줄로 안 갈린다 — 그쪽은 「에디터가 뜨는데 로그인이 안 된다」 절이 든다.

띄운 뒤 서버만 따로 확인하려면:

```bash
curl http://127.0.0.1:3001/health        # {"status":"ok"}
```

### 3.1 워크트리를 여럿 띄울 때 — **워크트리마다 자기 컨테이너를 띄운다**

git 워크트리를 여럿 두고 각자 서버를 띄우면 **부딪히는 자리가 여섯**이다. 둘은 시끄럽고
**넷은 조용하다** — 조용한 쪽이 이 절이 있는 이유다.

| 부딪히는 것 | 어떻게 드러나나 | 가르는 법 |
|---|---|---|
| API 포트 | `EADDRINUSE` — **시끄럽다**(종료 코드 1) | `PORT` |
| 에디터 포트 | vite 가 **자동으로 올려 뜬다**(5173 → 5174 → …). 안 부딪힌다 | — |
| DB 컨테이너 | 포트가 같으면 `port is already allocated` — **시끄럽다**. 다만 **다시 치면 조용해진다**(「컨테이너를 못 찾는다」) | `POSTGRES_PORT` |
| 운영 DB | **조용하다.** 한쪽 마이그레이션이 다른 쪽 스키마를 바꾼다 | `DATABASE_URL` 의 **포트와 DB 이름** |
| 테스트 DB | **조용하다.** 동시에 `pnpm test` 를 돌리면 서로의 판을 지운다 | `TEST_DATABASE_URL` |
| 에디터 → API | **가장 조용하다.** B 의 화면이 A 의 API 에 붙는다 | (자동 — `PORT` 를 따라간다) |
| 세션 쿠키 | **조용하다.** 쿠키는 포트를 가르지 않아서 한 브라우저로 B 에 로그인하면 A 의 세션이 덮인다 | `SESSION_COOKIE_NAME` |

**컨테이너를 가른다.** 워크트리마다 `docker compose … up -d` 를 자기 디렉터리에서 친다 —
컨테이너 이름도 볼륨도 **프로젝트 이름(디렉터리 이름)을 따라 저절로 갈린다**(「컨테이너를 못 찾는다」).
**데이터가 완전히 별개다.** 새 볼륨이므로 **처음에는 비어 있다**(그것이 정상이다 — 「띄우기」 절의
`마이그레이션 0건` 문장이 그것을 말한다).

**워크트리를 *만드는* 규칙은 [`CLAUDE.md`](CLAUDE.md)가 소유한다**(위치·이름·브랜치 —
`git worktree add -b <브랜치> .worktrees/<이름>`). 아래는 **만든 뒤**의 순서다.
`<이름>` 자리에 워크트리 이름을, `<포트>` 자리에 **다른 워크트리가 안 쓰는 수**를 넣는다.

**무슨 수가 이미 쓰이는지는 이렇게 본다** — 아래 둘이 각각 컨테이너와 API 서버 쪽이다.

```bash
docker ps --format '{{.Names}}\t{{.Ports}}'   # 떠 있는 컨테이너가 연 포트
lsof -nP -iTCP -sTCP:LISTEN | grep node       # 떠 있는 API·에디터가 연 포트
```

```bash
# 1. 설치와 빌드 — 워크트리마다 따로 필요하다 (「테스트는 통과하는데 서버만 안 뜬다」)
pnpm install && pnpm build

# 2. 환경 파일
cp apps/api/.env.example apps/api/.env

# 3. apps/api/.env 의 값 다섯을 그 워크트리 것으로 바꾼다
#      POSTGRES_PORT=<포트>                          ← compose 가 여는 포트
#      DATABASE_URL=…<포트>/wb_<이름>                 ← 포트를 위와 같게
#      TEST_DATABASE_URL=…<포트>/wb_<이름>_test       ← 주석 처리되어 있다. 주석을 푼다
#      PORT=3002                                     ← 워크트리마다 다른 수
#      SESSION_COOKIE_NAME=wb_session_3002           ← PORT 를 붙인다 — 에디터는 손댈 곳이 없다

# 4. 이 워크트리의 컨테이너를 띄운다 — 이 디렉터리에서
docker compose --env-file apps/api/.env up -d
docker compose ps          # healthy 이고 PORTS 칸에 <포트> 가 보여야 한다 (「컨테이너를 못 찾는다」)

# 5. DB 둘을 만든다 — 방금 띄운 내 컨테이너 안에서 한 줄씩
docker compose exec postgres psql -U wirebound -d postgres -c 'CREATE DATABASE wb_<이름>;'
docker compose exec postgres psql -U wirebound -d postgres -c 'CREATE DATABASE wb_<이름>_test;'

# 6. 마이그레이션 — 계정도 여기서 만든다(「세우기」 절 5번과 같다)
SEED_USER_EMAIL=me@example.com SEED_USER_PASSWORD='고른-비밀번호' \
  pnpm --filter @wirebound/api migrate
```

> **워크트리마다 DB 가 다르므로 계정도 워크트리마다 따로 만든다.** 옆 워크트리에서 만든
> 계정으로는 이 워크트리의 서버에 로그인되지 않는다 — 「에디터가 뜨는데 로그인이 안 된다」 절의 ⓑ 가 그 증상이다.

**만든 DB 는 `wirebound` 와 소유자·인코딩·콜레이션이 같다**(이 기계에서 쟀다:
`wirebound` / `UTF8` / `en_US.utf8`).

> **5번이 왜 있나 — 볼륨이 새것이면 `wirebound`·`wirebound_test` 는 이미 있다.**
> (이 기계에서 쟀다: 새 볼륨의 `psql \l` 에 둘 다 있다. `docker/postgres-init/01-test-db.sql`
> 이 **볼륨을 처음 만들 때 돈다** — 「테스트가 이유를 알기 어려운 접속 에러로 죽는다」 절의 함정이 워크트리마다 새 볼륨에서는 안 온다.)
> 그 이름을 그대로 쓰면 5번을 지울 수 있다. **그래도 이름을 가르는 이유는 하나다:
> 포트를 잘못 짚어 남의 컨테이너에 붙었을 때 그것을 시끄럽게 만드는 것이 이 이름이다.**
> 이름이 같으면 남의 DB 가 그냥 열리고, 다르면 `database "wb_<이름>" does not exist` 로
> 죽는다. 한 컨테이너를 공유하기로 한 사람에게는 이 이름이 격리 그 자체다.

**포트를 어긋나게 적으면 무엇이 보이나.** `POSTGRES_PORT` 와 접속 문자열의 포트는 **두
자리에 있고 한 자리로 못 모은다**(compose 는 URL 에서 포트를 못 뽑고, Node 의 `--env-file`
은 `${...}` 를 안 편다 — 둘 다 이 기계에서 쟀다). 그래서 **어긋나면 실행되기 전에 죽는다**
(이 기계에서 쟀다 · 종료 코드 1 · `pnpm start` 도 `migrate` 도 같다):

```
Error: POSTGRES_PORT 와 접속 문자열의 포트가 어긋납니다 — 이대로 두면 이 워크트리의 컨테이너가
아니라 옆 워크트리의 컨테이너에 붙습니다(붙는 데 성공하므로 아무 에러도 안 납니다).
  POSTGRES_PORT=15433  ← docker compose 가 이 포트를 연다
  DATABASE_URL → 127.0.0.1:15999/wb_fixpwc
apps/api/.env 에서 포트를 한 수로 맞춘다. 자기 Postgres 를 쓰면 POSTGRES_PORT 줄을 지운다.
```

**`pnpm test` 는 `TEST_DATABASE_URL` 에 같은 검사를 건다**(그 값은 서버가 안 쓰므로 서버는
그것 때문에 안 죽는다). **`TEST_DATABASE_URL` 을 아예 안 적으면 기본값이
`POSTGRES_PORT` 를 따라간다** — 즉 **자기 컨테이너의** `wirebound_test` 다.
**워크트리에 `apps/api/.env` 가 아예 없으면 `pnpm test` 가 돌지 않고 멈춘다** — 그때 기본값은 compose 기본
포트, 곧 **최상위 체크아웃의 컨테이너**를 가리켜 그 `wirebound_test` 를 지우기 때문이다. 멈추는 문장이 이 절을
가리킨다. DB 가 필요 없으면 `pnpm test --project '!api'` 로 돈다. 셸에 `TEST_DATABASE_URL` 을 주면(CI) 이 검사를 지난다.

3·5번을 빼먹으면 **먼저 6번이 죽는다.** 둘이 죽는 모양이 다르다(이 기계에서 쟀다):

| 무엇 | 종료 코드 | 무엇을 찍나 |
|---|---|---|
| **6번** `pnpm --filter @wirebound/api migrate` | 1 | 첫 줄 `마이그레이션(latest) 대상 DB: 127.0.0.1:<포트>/wb_<이름>` 뒤에 `마이그레이션 실패: error: database "…" does not exist` — **어느 DB 인지는 말하고 만드는 줄은 안 찍는다** |
| `pnpm test` | 1 | 같은 문장에 **위 `CREATE DATABASE` 한 줄을 붙여서** 찍는다 |

**절차대로 가면 6번을 먼저 만나므로 위 5번의 명령을 손에 들고 있어야 한다.** 조치가
붙는 자리는 테스트 쪽 하나다(`apps/api/test/missing-database-hint.ts` — 없는 DB 를 뜻하는
`3D000` 일 때만 붙고, 접속 문자열은 안 싣는다).

**값을 안 가르면 무엇이 보이나** — 전부 이 기계에서 쟀다.

| 안 가른 값 | 관측 |
|---|---|
| `PORT` | 둘째 서버가 `Error: listen EADDRINUSE: address already in use 127.0.0.1:3031` 로 죽는다. **종료 코드 1** |
| `POSTGRES_PORT` | 둘째 `up -d` 가 `Bind for 0.0.0.0:<포트> failed: port is already allocated` 로 죽는다. **그런데 그대로 한 번 더 치면 종료 0 으로 "Started" 를 찍고 컨테이너가 뜬다 — 포트 없이.** 그때 `docker compose ps` 의 `PORTS` 칸이 **비어 있고**, 그 포트에 붙는 것은 전부 **옆 워크트리의 컨테이너**다(「컨테이너를 못 찾는다」) |
| `DATABASE_URL` | 워크트리 B 에서 `migrate:down` 을 한 번 돌리자 **A 의 살아 있는 서버가** `500 {"error":{"code":"internal"}}` 을 내기 시작했다. A 의 로그에만 `relation "api_tokens" does not exist` 가 남았고 **B 는 아무 말도 안 했다**(한 컨테이너를 공유할 때의 값이다 — 워크트리마다 컨테이너를 가르면 이 갈래는 포트가 먼저 막는다) |
| `SESSION_COOKIE_NAME` | 한 브라우저로 워크트리의 에디터에 로그인하자 같은 호스트에 있던 `wb_session`(다른 체크아웃의 세션)이 **새 세션으로 바뀌었다** — 에러도 경고도 없다. 이름을 가르면 그 쿠키가 그대로 남고, 에디터는 로그인 200 · 새로고침 뒤 `/api/auth/me` 200 이다(헤드리스 Chrome · 에디터 프록시 경유). **에디터는 이름을 몰라도 된다** — 같은 출처로 쿠키를 싣기만 한다(`credentials: 'same-origin'`) |
| `TEST_DATABASE_URL` | 워크트리 둘이 동시에 `pnpm test` 를 돌리면 **둘 다 종료 코드 1**로 죽는다. **가르면 둘 다 전 케이스 통과 · 종료 0** 이고, 벽시계가 **혼자 돌리는 것보다 길지 않게 나오기도 한다** — 느려지는지는 기계와 부하가 정한다(재는 법: 두 워크트리에서 `time pnpm test` 를 동시에 돌려 혼자 돌린 값과 견준다). 깨지는 꼴은 셋이다 — 상대의 `globalSetup` 이 판을 내려서 나는 `relation "…" does not exist` · 상대가 커밋한 행과 부딪히는 `409` · 상대의 정리가 지워서 나는 FK 위반. **몇 개가 죽는지는 판마다 다르다**(경쟁 상태다) — **안 낡는 값은 종료 코드뿐이라 그것만 적는다** |

> **`apps/api/.env`를 고쳤으면 서버 둘을 **다** 다시 띄워라.** `tsx watch`는 **소스만 본다** —
> `.env`가 바뀌어도 다시 읽지 않는다. 이 기계에서 쟀다: `.env`에 없는 브라우저 경로를 심고
> 기다려도 응답이 그대로였고, 서버를 다시 띄우자 그 값이 들었다. **조용한 자리다** —
> 아무 로그도 안 난다.
>
> **`POSTGRES_PORT` 를 고쳤으면 컨테이너도 다시 띄워라** — `docker compose --env-file
> apps/api/.env up -d` 를 다시 치면 compose 가 포트가 바뀐 것을 보고 다시 만든다.
> **그 볼륨은 그대로다**(이름이 프로젝트를 따라가지 포트를 따라가지 않는다).
>
> **에디터도 같다.** `vite.config.ts`가 그 파일을 읽는 것은 **뜰 때 한 번**이다. vite 는
> 자기 설정 파일이 바뀌면 스스로 다시 뜨지만 `apps/api/.env`는 **감시 대상이 아니다**
> (이 기계에서 쟀다: `PORT`를 바꿔도 에디터는 옛 대상을 그대로 잡고 있었고, 다시 띄우자
> 새 대상을 찍었다). 다시 띄웠는지는 **`➜  API 프록시:` 줄의 값**으로 확인한다.

---

## 4. 첫 프로젝트를 화면 없이 만들기 (선택)

에디터를 안 열고 확인하고 싶을 때. 아래는 **이 기계에서 그대로 돌려 본 것**이다.

**계정은 curl 로 못 만든다** — 가입 엔드포인트가 없다. 「세우기」 절 5번의 `migrate` 가 그 자리이고,
아래는 **그렇게 만든 계정으로 로그인**해서 시작한다.

```bash
B=http://127.0.0.1:3001
curl -c /tmp/wb.txt -X POST $B/api/auth/login -H 'content-type: application/json' \
  -d '{"email":"me@example.com","password":"고른-비밀번호"}'
curl -b /tmp/wb.txt -X POST $B/api/projects -H 'content-type: application/json' \
  -d '{"name":"첫 설계서","slug":"first"}'
```

첫 응답이 **401**이면 그 계정이 없거나 비밀번호가 다른 것이다(로그인은 둘을 구분하지
않는다 — 설계서 「권한 모델」). 계정을 만든 적이 없으면 「세우기」 절 5번을 먼저 돌린다.

두 번째 응답의 `id`가 **프로젝트 id**이고, 그것이 「`wireb` — CLI 를 부르는 길」 절 `wireb init`의 `--project` 인자다.
나머지 엔드포인트는 [`apps/api/README.md`의 엔드포인트 표](apps/api/README.md#엔드포인트)에 있다.

---

## 5. `wireb` — CLI 를 부르는 길

`wireb`는 설계서를 **구현 리포 쪽에서** 읽고 내보내는 명령이다.

```
wireb init --server <주소> --project <id>    .wirebound.json 생성 (네트워크를 타지 않는다)
wireb login --email <메일> [--name <꼬리표>]  토큰 발급 및 저장
wireb pull [-o <파일>]                       프로젝트 스냅샷을 로컬 JSON 으로 (읽기 전용)
wireb export --format html|pptx -o <dir>    번들 또는 pptx 를 그 디렉터리에
wireb lint [경로] [--fail-on warning]        규칙 검증 (결함이 있으면 코드 10)
wireb page get <경로> [--json]               페이지 하나를 스키마·코멘트·상호작용 문장으로
```

### 5.1 부르는 길이 둘이고, **`pnpm install`만으로는 둘 다 안 생긴다**

**`wireb`·`wireb-mcp`는 `node_modules/.bin`에 들어오지 않는다.** 두 패키지가 `private`이라
npm 에 안 나가고, 루트 `package.json`이 그것들을 의존으로 갖지 않기 때문이다. (이 기계에서
쟀다 — 설치 뒤 루트 `.bin`에 있는 것은 `tsc`·`tsserver`·`vitest` 셋뿐이고, `pnpm exec wireb`
는 `Command "wireb" not found`다.)

**길 ㉮ — 저장소 안에서 (설치할 것이 없다)**

```bash
node packages/cli/dist/bin.js --help
node packages/mcp/dist/bin.js            # MCP 서버 (stdio)
```

`pnpm build` 뒤에 바로 된다. 자주 쓸 것이면 셸에 별칭을 둔다:

```bash
alias wireb="node $(pwd)/packages/cli/dist/bin.js"
```

**길 ㉯ — 어디서나 (`wireb`라는 이름으로)**

```bash
(cd packages/cli && pnpm link --global)
(cd packages/mcp && pnpm link --global)
```

**`private` 패키지여도 된다**(이 기계에서 쟀다 — 0.2초에 `~/Library/pnpm/wireb`가 생기고
저장소 밖에서 `wireb --help`가 돈다). pnpm 의 전역 bin 디렉터리가 `PATH`에 있어야 한다
(`pnpm bin -g`로 확인, 없으면 `pnpm setup`).

> **`cd` 해서 부르는 것이 아니면 안 된다.** `pnpm --dir packages/cli link --global`도
> `pnpm -C packages/cli link --global`도 **네가 가리킨 곳이 아니라 셸이 서 있는 쪽의 워크스페이스
> 뿌리를 건다** — 이 기계에서 쟀다: 둘 다 `+ wirebound <- …/wirebound`를 내고 `wireb`는 `PATH`에
> 안 생긴다. **신호가 없지는 않다** — 그 자리에 ` WARN  wirebound has no binaries`가 찍힌다.
> 다만 성공으로 끝나므로 놓치기 쉽다. 잘못 걸었으면 `pnpm uninstall --global wirebound`.

> **㉯는 저장소를 가리키는 심링크다.** 저장소를 옮기거나 워크트리를 지우면 `wireb`가 깨진다.

**되돌리기 — 명령 하나로 안 끝난다.**

```bash
pnpm uninstall --global @wirebound/cli @wirebound/mcp
```

이것이 지우는 것은 `PATH`에 놓인 `wireb`·`wireb-mcp`뿐이다(`command -v wireb` → 없음).
**pnpm 의 전역 저장소에 둘이 남는다**(이 기계에서 쟀다):

| 남는 것 | 무엇이 담겨 있나 |
|---|---|
| `$(pnpm bin -g)/global/*/package.json` | `pnpm.overrides`에 `"@wirebound/cli": "link:…/packages/cli"` 두 줄 |
| `$(pnpm bin -g)/global/*/node_modules/.bin/` | `wireb`·`wireb-mcp` 셸 스크립트 |

**`pnpm ls --global`로는 안 보인다** — 그것도 아무것도 안 낸다(쟀다). 저장소를 옮기거나
워크트리를 지우면 그 두 줄이 **죽은 경로**를 가리킨 채 남는다. 완전히 지우려면 그 파일의
`overrides`를 비우고 `.bin`의 둘을 지워라.

### 5.2 붙이기

```bash
cd <구현 리포>
wireb init --server http://127.0.0.1:3001 --project <프로젝트 id>
wireb login --email me@example.com
```

- `.wirebound.json`은 **커밋되는 파일이고 토큰이 안 담긴다.** 자격은 `~/.wirebound/credentials.json`(퍼미션 `600`)에 따로 저장된다. `WIREB_TOKEN`·`WIREB_CREDENTIALS`가 그것을 덮는다.
- 토큰은 **프로젝트 하나에만** 쓴다. 다른 프로젝트에 쓰면 404 다.
- **tty 가 아니면 비밀번호를 못 읽는다.** CI 에서는 표준입력으로 주거나 `WIREB_PASSWORD`를 쓴다 — 명령이 그렇게 말한다(이 기계에서 쟀다: *"비밀번호를 읽을 수 없습니다. tty가 아니면 표준입력으로 주거나 WIREB_PASSWORD를 설정하세요"*).

```bash
echo "$비밀번호" | wireb login --email me@example.com
```

### 5.3 종료 코드

| 코드 | 뜻 |
|---|---|
| **0** | 정상. **`lint`는 결함이 있어도 0 이다** — 결함이 있는 것은 오류가 아니다 |
| **2** | 설정·자격이 없다 → `wireb init` 또는 `wireb login` |
| **3** | 서버가 거절했다(권한·잠금·검증) |
| **4** | 서버에 못 닿았다 — **같은 주소의 서버가 죽었을 때**다. `.wirebound.json`의 `server`를 **다른 주소로 바꾸면 4가 아니라 2**가 나온다: 자격이 `(server, projectId)`에 매여 있어 네트워크를 타기 전에 끊긴다 |
| **10** | `lint --fail-on warning`에 걸렸다 (이 기계에서 쟀다) |

---

## 6. 막히는 자리 — 증상 → 원인 → 조치

### 6.1 **테스트는 통과하는데 서버만 안 뜬다**

**증상**

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module
  '…/apps/api/node_modules/@wirebound/schema/dist/index.js'
  imported from …/apps/api/src/config.ts
```

**원인.** `pnpm build`를 안 했다. `apps/api`는 `tsx`로 도는데 `tsx`는 워크스페이스 패키지를
`package.json`의 `exports`를 통해 해석하고, **그 `exports`가 가리키는 대상이 `dist`다**
(소스 `.ts`가 아니다). `dist/`는 gitignore 대상이라 **새로 받은 저장소·새 워크트리에는 없다.**

**vitest 는 안 걸린다** — `vitest.config.ts`의 alias 로 소스를 직접 보기 때문이다. 그래서
이 사고는 *"게이트는 초록인데 서버만 안 뜬다"*는 모양으로 온다. (이 기계에서 쟀다:
`packages/*/dist`를 지우면 **`pnpm --filter @wirebound/api start`**가 위 문장과 함께
**종료 코드 1**, 같은 상태에서 api 테스트 한 파일은 **종료 코드 0**.)

> **`--filter`를 빼지 마라.** 루트 `package.json`에 `start`가 없다 — 저장소 루트에서 그냥
> `pnpm start`를 치면 `ERR_PNPM_NO_SCRIPT_OR_SERVER  Missing script start or file server.js`이고
> **그것도 종료 코드 1이다.** 두 실패의 코드가 같아서 **위 문장을 확인해 본 사람이 확인했다고
> 착각한다** — 종료 코드가 아니라 찍힌 문장으로 가른다.

**조치.** `pnpm build`. 스키마를 함께 고치며 개발할 때는 별도 터미널에
`pnpm --filter @wirebound/schema build:watch`.

### 6.2 `pnpm install`이 `wireb` 때문에 경고를 낸다

**증상**

```
WARN  Failed to create bin at …/packages/mcp/node_modules/.bin/wireb.
      ENOENT: … open '…/packages/cli/dist/bin.js'
```

**원인.** `packages/mcp`가 `@wirebound/cli`를 의존으로 갖고, pnpm 이 그 `bin`을 링크하려는데
**아직 빌드 전이라 `dist/bin.js`가 없다.** 설치가 빌드보다 먼저 오므로 **처음 설치에서는
반드시 난다.**

**같은 자리에 이상해 보이는 줄이 하나 더 있다** — `The following dependencies have build scripts
that were ignored: esbuild`. `WARN`이 아니고 **정상이다**(pnpm 10 이 빌드 스크립트를 기본으로
막는다). `esbuild`는 플랫폼별 바이너리를 의존으로 받으므로 그 스크립트가 없어도 돌아간다 —
게이트 넷이 그것을 증명한다.

**조치.** 없다 — `pnpm build`가 그 파일을 만든다. **다만 링크는 그때 안 생긴다**(pnpm 이
설치를 다시 돌지 않는다). `wireb`를 이름으로 부르려면 「부르는 길이 둘이고」 절의 ㉮·㉯를 쓴다.

### 6.3 컨테이너를 못 찾는다 / 포트가 이미 잡혀 있다 / 빈 DB 가 떴다

**원인 하나에서 갈래가 셋 나온다.** `docker compose`는 **디렉터리 이름**을 프로젝트 이름으로
쓴다(이 기계에서 쟀다: 저장소 루트 → `wirebound`, `.worktrees/<이름>` → `<이름>`).
**컨테이너 이름도 볼륨 이름도 그것을 따른다** — `<프로젝트>-postgres-1` ·
`<프로젝트>_wirebound-pgdata`. **그것이 워크트리마다 컨테이너를 가르는 기전이고**, 동시에
아래 셋의 원인이다.

**ⓐ `ps` 가 빈 표를 낸다.** 컨테이너를 띄운 디렉터리가 아닌 곳에서 물었다. **상태는 그
디렉터리에서 묻는다** — 워크트리의 컨테이너는 그 워크트리에서, 루트의 것은 루트에서.

```bash
docker compose ps                    # 이 디렉터리의 것
docker compose ls                    # 어떤 프로젝트들이 떠 있나
docker ps --filter name=postgres     # 이 기계의 전부
```

> **`docker compose -p <이름> ps`의 `<이름>`은 그 컨테이너를 실제로 띄운 디렉터리의 이름**
> 이어야 한다. 이 기계에서 쟀다: 프로젝트가 `feat-p1-api` 인 컨테이너에 `-p wirebound ps` 를
> 치면 **빈 표**다.

**ⓑ `up -d` 가 포트 충돌로 죽는다.** 다른 워크트리가 같은 `POSTGRES_PORT` 를 이미 열었다
(이 기계에서 쟀다):

```
Error response from daemon: failed to set up container networking:
  ... Bind for 0.0.0.0:19011 failed: port is already allocated
```

**조치는 `apps/api/.env` 의 `POSTGRES_PORT` 를 다른 수로 바꾸고 다시 치는 것이다**
(접속 문자열의 포트도 함께 — 안 맞추면 서버가 그렇다고 말하고 안 뜬다. 「워크트리를 여럿 띄울 때」).

> **✱ 그대로 한 번 더 치면 조용해진다 — 이 절에서 가장 위험한 줄이다.** 이 기계에서 쟀다:
> 같은 명령을 다시 치면 **종료 0** 으로 `Started` 를 찍고 컨테이너가 `Up (healthy)` 가
> 되는데 **포트가 하나도 안 열려 있다.** `docker compose ps` 의 `PORTS` 칸이 **빈 칸**이다.
> 그 포트에 붙는 것은 전부 **먼저 잡은 워크트리의 컨테이너**다 — 내 서버가 남의 DB 를
> 읽고 쓰는데 **아무도 안 운다.**
>
> **그래서 `up -d` 뒤에는 `docker compose ps` 의 `PORTS` 칸을 본다.** 비어 있으면 위
> 충돌이 났던 것이다: `docker compose down` 하고 포트를 바꿔 다시 띄운다.
> (DB 이름을 워크트리마다 가르는 것이 이 사고를 시끄럽게 만드는 두 번째 자다 — 「워크트리를 여럿 띄울 때」.)

**ⓒ 컨테이너는 떴는데 DB 가 비었다.** **워크트리마다 볼륨이 따로 생기므로 그것이
정상이다.** 새 볼륨에는 `wirebound`·`wirebound_test` 만 있고 스키마는 비어 있다 —
`pnpm --filter @wirebound/api migrate` 를 올린다. 서버는 그 상태에서 **안 뜨고 그렇다고
말한다**(「띄우기」 절의 `마이그레이션 0건` 문장).

> **데이터가 있어야 하는데 비었으면 지우지 마라.** 데이터는 없어진 것이 아니라 **다른
> 이름의 볼륨**에 있다. 프로젝트 이름이 다르면 compose 가 보는 볼륨도 다르기 때문이다.
> 예시 출력이다 — **워크트리 컨테이너가 하나 떠 있는 기계**의 모양이다:
>
> ```
> $ docker system df -v
> VOLUME NAME                                    LINKS   SIZE
> feat-p1-api_wirebound-pgdata                     1     186.5MB   ← 설계서가 여기 있다
> fix-per-worktree-container_wirebound-pgdata      1      88.1MB   ← 지금 이 워크트리 것
> feat-p2b1-editor-shell_wirebound-pgdata          0      0B
> wirebound_wirebound-pgdata                       0      0B
> ```
>
> **`LINKS` 로 고르지 마라 — 1 인 것이 여럿이다.** `LINKS` 는 *"지금 어떤 컨테이너가 이
> 볼륨을 물고 있다"* 는 뜻일 뿐이고, **워크트리마다 컨테이너를 띄우는 것이 정상이므로
> 그런 볼륨이 여럿인 것도 정상이다**(위 표가 그 모양이다). **크기도 사는 수다** — 같은
> 볼륨을 다시 재면 크기가 달라진다(Postgres 가 회수하는 공간이 그때그때 다르다).
>
> **고르는 법은 이름이다.** 볼륨 이름의 `_` 앞이 **그 볼륨을 만든 디렉터리 이름**이다.
>
> 1. `docker system df -v` 로 `*_wirebound-pgdata` 를 전부 본다. **`0B` 는 후보가 아니다.**
> 2. 남은 것에서 **지금 워크트리·저장소 루트의 이름으로 시작하는 것은 내 것이다** — 찾는
>    것은 **그 밖의**, 크기가 있는 볼륨이다.
> 3. 어느 컨테이너가 물고 있는지는 이름으로 되짚는다(이 기계에서 쟀다):
>
> ```bash
> docker ps -a --filter volume=<볼륨이름> --format '{{.Names}} ({{.Status}})'
> ```
>
> **`docker compose down -v` 를 치지 마라** — 그 한 줄이 지금 보고 있는 빈 볼륨이 아니라
> **찾고 있는 볼륨까지** 지운다.
>
> **옛 볼륨의 데이터를 새 이름으로 옮기는 것은 복사이지 이동이 아니다** — 옛 볼륨을 지우지
> 않는 절차가 `docs/superpowers/plans/2026-08-19-per-worktree-container-report.md` 「선택 — 옛 볼륨을 새 이름으로 "복사"한다」 절에 있다.

> **`--env-file apps/api/.env` 는 `up` 에서 빼지 마라.** 빼면 포트가 기본값(5433)으로
> 되돌아가 컨테이너가 **그 포트로 다시 만들어진다.** `ps`·`logs`·`exec`·`down` 은 프로젝트
> 이름으로 찾으므로 플래그가 없어도 된다(이 기계에서 쟀다). **`POSTGRES_PORT` 를 바꿔
> 다시 띄우면 컨테이너는 `Recreated` 되고 볼륨은 그대로다**(이 기계에서 쟀다 — 임시
> 프로젝트에 표를 하나 만들어 두고 포트를 바꿔 다시 띄웠더니 그 표가 그대로 있었다).

> **워크트리를 지운 뒤 남은 컨테이너는 저장소 루트의 `docker compose down` 으로 못 찾는다.**
> 라벨 `com.docker.compose.project=<워크트리명>` · `project.working_dir=…/.worktrees/<워크트리명>` 이
> git 이 모르는 디렉터리를 가리킨다 — `docker-compose.yml` 은 없고, 그 컨테이너를 다시 띄운 적이
> 있으면 compose 의 바인드 마운트가 되살린 빈 `docker/postgres-init/` 만 있다. 다루려면
> `docker compose -p <워크트리명> …` 이거나 `docker start/stop <컨테이너이름>` 이다(둘 다 이
> 기계에서 확인했다). **그 빈 `postgres-init/` 은 그 프로젝트로 볼륨을 다시 만들면
> `01-test-db.sql` 이 안 돈다는 뜻이기도 하다** — 「테스트가 이유를 알기 어려운 접속 에러로 죽는다」 절의 함정이 그때 온다.

### 6.4 테스트가 이유를 알기 어려운 접속 에러로 죽는다

**원인.** 테스트 DB(기본 `wirebound_test`)가 없다. `docker/postgres-init/01-test-db.sql`이
그것을 만드는데 **그 스크립트는 볼륨을 처음 만들 때만 돈다.**

**워크트리마다 컨테이너를 띄우면 볼륨이 새로 생기므로 그 스크립트가 매번 돈다** — 이 기계
에서 쟀다(새 볼륨의 `psql \l` 에 `wirebound_test` 가 있다). **그래서 이 함정은 두 경우에만
온다:** 옛 볼륨을 그대로 쓰는 경우, 그리고 **`docker/postgres-init/` 이 비어 있는 경우**다.
뒤엣것도 이 기계에서 쟀다 — 그 디렉터리가 비면 컨테이너 로그가 이렇게만 말하고 지나간다:

```
/usr/local/bin/docker-entrypoint.sh: ignoring /docker-entrypoint-initdb.d/*
```

**조치.** 컨테이너 안에서 직접 만든다 — **자기 디렉터리에서** 친다.

```bash
docker compose exec postgres psql -U wirebound -d postgres -c 'CREATE DATABASE wirebound_test;'
```

> **그 에러가 이 줄을 스스로 들고 온다.** `globalSetup` 이 SQLSTATE `3D000` 을 잡아
> **없는 DB 이름을 넣은 `CREATE DATABASE` 한 줄**을 붙여 던진다(이 기계에서 쟀다 —
> 종료 코드 1). 워크트리마다 테스트 DB 를 가르면(「워크트리를 여럿 띄울 때」) 이 자리를 자주 지나기 때문이다.
> **`3D000` 일 때만 붙인다** — 다른 실패에까지 붙이면 엉뚱한 곳을 보게 된다.

> **`docker compose down -v`로 볼륨을 지우는 길도 있지만 그것은 그 볼륨의 설계서를 전부
> 지운다.** 위 한 줄로 끝나는 일에 그것을 쓰지 마라.

### 6.5 pptx 는 나오는데 화면 이미지가 없다

슬라이드의 화면 자리에 **"화면 이미지가 실리지 않았습니다"**만 있다. 「PPTX 의 화면 이미지」 절이 그 자리다.

### 6.6 에디터가 뜨는데 로그인이 안 된다 / 목록이 비어 있다

**갈래 넷이고 가르는 법이 다르다.** 앞의 셋은 *"로그인이 안 된다"*이고 마지막 하나는
*"로그인은 되는데 목록만 비어 있다"*이다.

**ⓞ 그 계정이 애초에 없다.** **가입 화면도 가입 엔드포인트도 없으므로**
계정은 「세우기」 절 5번의 `migrate` 로만 생긴다 — 그 걸음에서 환경변수를 안 준 사람은 **DB 에
사용자가 0명**인 채로 로그인 화면을 보고 있다.

**가르는 법.** `migrate` 를 돌린 터미널이 그때 무엇을 했는지 한 줄로 말했다:
*"계정 시딩 건너뜀 — SEED_USER_EMAIL·SEED_USER_PASSWORD 가 없습니다"*. 그 줄을
지나쳤으면 지금 다시 돌려도 된다(**이미 있는 계정은 안 건드린다**):

```bash
SEED_USER_EMAIL=me@example.com SEED_USER_PASSWORD='고른-비밀번호' \
  pnpm --filter @wirebound/api migrate
```

**이 갈래는 아래 ⓑ 와 화면에서 똑같이 보인다** — 둘 다 *"이메일 또는 비밀번호가
올바르지 않습니다"* 다(로그인은 *"없는 계정"* 과 *"틀린 비밀번호"* 를 구분하지 않는다 —
설계서 「권한 모델」). 그래서 화면이 아니라 터미널에서 가른다.

**ⓐ API 서버가 안 떠 있다(또는 다른 포트에 떠 있다).** 프록시 대상은 `apps/api/.env`를
따라가므로 **손으로 어긋나게 만들 수는 없지만**, `.env`를 고치고 **에디터를 다시 안 띄우면**
옛 대상을 잡고 있다(「워크트리를 여럿 띄울 때」 절의 마지막 인용문).

**가장 빠른 자리는 브라우저가 아니라 에디터를 띄운 터미널이다** — vite 가 **틀린 대상을 이름까지**
말한다(이 기계에서 쟀다):

```
[vite] http proxy error: /api/auth/me
Error: connect ECONNREFUSED 127.0.0.1:3041
```

**뜰 때 찍은 `➜  API 프록시:` 줄과 API 터미널의 `Server listening at` 줄을 나란히 놓고 본다.**
두 수가 같아야 한다.

개발자 도구의 네트워크 탭에서는 `/api/...` 요청이 **500(본문 0 바이트)**이면 프록시 대상이 틀린
것이고, **401**이면 서버는 붙었고 로그인만 안 된 것이다. **502가 아니다** — vite 는 프록시 실패를
500으로 낸다(이 기계에서 쟀다: 대상이 죽어 있을 때 `http=500`).

**ⓑ 붙기는 붙었는데 *옆 워크트리* 의 API 다.** 워크트리를 여럿 띄웠고 `PORT`를 안 갈랐을 때다.
**이쪽은 아무 에러도 안 난다** — 이 기계에서 쟀다: B 의 에디터에서 **B 의 계정이 401
(*"이메일 또는 비밀번호가 올바르지 않습니다"*)**, **A 의 계정이 200**, `/api/auth/me` 가
A 의 사용자를 돌려줬고 **B 의 API 는 그 로그인을 0 번 봤다.**

**가르는 법.** API 터미널의 **`이 서버가 보는 DB:`** 줄을 본다 — 워크트리마다 **포트와 DB
이름이** 다르므로(「워크트리를 여럿 띄울 때」) 그 한 줄이 *"내가 지금 누구의 서버를 보고 있나"*를 답한다. 값을
가르는 절차는 「워크트리를 여럿 띄울 때」 절이다.

**ⓒ 붙는 것은 다 붙는데 *목록만* 비어 있다.** 워크트리마다 컨테이너를 띄우면 **볼륨이 새것**
이라 그렇다 — 스키마는 올렸고(그래서 서버가 떴다) 행이 없다. **정상이다.** 옛 설계서는
사라진 것이 아니라 **다른 이름의 볼륨**에 있다(「컨테이너를 못 찾는다」 절의 ⓒ). **`이 서버가 보는 DB:` 줄의
`마이그레이션 N건` 이 0 이 아니면 이 갈래다** — 0 이면 서버가 아예 안 떴을 것이다.

---

## 7. MCP 서버 등록

`wireb-mcp`는 **stdio MCP 서버**다. 도구 다섯(`list_pages`·`get_page`·`patch_page`·
`add_comment`·`validate`)을 낸다. **프로젝트·서버·토큰은 도구의 인자가 아니다** — 리포의
`.wirebound.json`과 `~/.wirebound/credentials.json`이 정한다.

**그러므로 등록할 때 작업 디렉터리가 `.wirebound.json`이 있는 리포여야 한다.** MCP 서버는
그 자리에서부터 위로 올라가며 찾는다. 못 찾으면 도구 호출이 이렇게 답한다(이 기계에서 쟀다):

```
[wireb 코드 2] .wirebound.json을 찾을 수 없습니다. 리포 뿌리에서 `wireb init`을 먼저 실행하세요
(MCP 서버가 /private/tmp 에서부터 위로 찾았습니다)
```

### 7.1 Claude Code — **이 기계에서 실제로 등록해서 도는 것을 확인했다**

```bash
cd <구현 리포>                       # .wirebound.json 이 있는 자리
claude mcp add wirebound -- wireb-mcp
claude mcp list
```

```
wirebound: wireb-mcp  - ✔ Connected
```

**리포에 `.mcp.json`으로 두는 길도 된다**(팀이 공유할 때). 다만 **처음 열 때 승인이
필요하다** — 이 기계에서 쟀다: `claude mcp list`가 ``⏸ Pending approval (run `claude` to
approve)``를 낸다.

```jsonc
// <구현 리포>/.mcp.json
{ "mcpServers": { "wirebound": { "command": "wireb-mcp", "args": [] } } }
```

`wireb-mcp`를 전역에 안 걸었으면(「부르는 길이 둘이고」 절의 ㉯) 명령을 절대경로로 준다:

```jsonc
{ "mcpServers": { "wirebound": {
  "command": "node", "args": ["/절대/경로/wirebound/packages/mcp/dist/bin.js"] } } }
```

### 7.2 다른 호스트 — **안 해 봤다**

Claude Desktop·Cursor·Zed 등은 **이 문서가 등록해 보지 않았다.** stdio 서버를 받는
호스트라면 위와 같은 모양(`command` + `args` + 작업 디렉터리)일 것이나 **확인한 값이
아니다.** 등록해 본 사람이 여기 한 줄을 더해라.

### 7.3 에이전트에게 무엇을 가르치나

[`packages/mcp/skill/SKILL.md`](packages/mcp/skill/SKILL.md)가 그 문서다 — 도구 다섯의
인자, 경로 다루는 법, `patch_page`의 `baseSeq`·`stale`·`locked` 갈래, `validate`의
`notes`·`outsideErrors`를 왜 함께 읽어야 하는지가 있다. **호스트에 스킬로 설치하거나
에이전트 지침에 그대로 실어라.**

---

## 8. PPTX 의 화면 이미지 — 브라우저를 넣는 자리

**저장소가 브라우저 바이너리를 안 들고 있다.** `apps/api`는 `playwright-core`에 기대는데
그 패키지는 **브라우저를 안 내려받는다**(의존 0 · 설치 스크립트 0). 기계에 있어야 한다.

### 8.1 없으면 무엇이 보이나 (이 기계에서 쟀다)

| 어디 | 무엇이 보이나 |
|---|---|
| `GET .../export?format=pptx` | **HTTP 200 이고 파일은 나온다.** 던지지 않는다. 슬라이드의 화면 자리에 **"화면 이미지가 실리지 않았습니다"**가 있고 `ppt/media/`가 **비어 있다** |
| `GET .../export/preview?format=pptx` | **이유는 이 응답에만 있다** — `screenFailures[].reason`:<br>`브라우저를 띄우지 못했습니다: browserType.launch: Executable doesn't exist at <경로>` |
| 에디터 화면 | 내보내기 패널에서 pptx 를 고르면 **위 미리보기의 `fontWarning`·`screenFailures`를 보인다**(`apps/web/src/shell/export-panel.tsx`) |
| **서버 로그** | **아무것도 안 남는다**(쟀다 — `chromium`·`browser`·`screen`·`화면` 매치 **0** · `warn`·`error` 줄 **0**). 운영자가 지켜보는 자리에도 안 간다 |

> **그래서 이유는 미리보기(에디터의 내보내기 패널, 또는 `GET .../export/preview?format=pptx` 직접 호출)로만 보인다.**
> **`wireb export`로도 안 보인다** — 그 명령은 `/export` 하나만 부르므로 `screenFailures`가
> **CLI 에 도달할 길이 없다**(`packages/cli/src` 전체에 그 이름이 **0건**이다). 이 기계에서
> 쟀다: 실패 상태에서도 *"1개 파일을 썼습니다"* · **종료 코드 0** · **표준에러 0 바이트**이고
> 그림 없는 pptx 가 그대로 나온다. **파일만 받은 사람은 *"그림이 없다"*까지만 안다.**

**오류 문장이 자기가 찾던 경로와 리비전을 그대로 말한다** — 그것이 아래 명령이 채우는
자리다.

### 8.2 넣는 법 — **`apps/api`에서 부른다**

```bash
node apps/api/node_modules/playwright-core/cli.js install chromium
```

> **저장소 루트에서 `node node_modules/playwright-core/cli.js …`는 안 된다.** pnpm 의 엄격한
> 배치라 `playwright-core`가 루트 `node_modules`에 없다 — 그대로 부르면
> `Cannot find module`이다(이 기계에서 쟀다).

| 무엇 | 값 (이 기계에서 쟀다) |
|---|---|
| `install chromium --only-shell` | 내려받기 **94.7 MiB** + FFmpeg 1 MiB · **6.4초** · 디스크 **196MB** + 2.5MB |
| `install chromium` | 위 대신 **전체 Chromium**(디스크 ~356MB). **헤드리스로만 쓰므로 `--only-shell`로 충분하다** — 서버가 부르는 것이 headless shell 이다(오류 문장의 경로가 `chromium_headless_shell-<리비전>`이다) |
| `--with-deps` | 시스템 라이브러리를 함께 넣는다. **리눅스에서 필요하다**(이 기계에서는 안 썼다) |
| 어디에 들어가나 | macOS 는 `~/Library/Caches/ms-playwright/`. `PLAYWRIGHT_BROWSERS_PATH`로 옮길 수 있다 |

**이미 있으면 아무것도 안 낸다** — 출력 없이 종료 코드 0 이다(이 기계에서 쟀다). *"실패했나"*가
아니라 *"받을 것이 없다"*는 뜻이다.

넣은 뒤 미리보기가 `screenFailures: []`가 되고 pptx 안에 `ppt/media/image1.png`가 생긴다.
**이 기계에서 그 왕복을 그대로 돌려 확인했다** — 빈 캐시로 실패시키고, 위 명령으로 채우고,
같은 요청이 이미지를 실었다.

### 8.3 기계에 이미 있는 브라우저를 쓰기 — `SCREEN_CHROMIUM_PATH`

배포판 chromium(`/usr/bin/chromium` 부류)이 이미 있으면 그 경로를 준다.

```bash
# apps/api/.env
SCREEN_CHROMIUM_PATH=/usr/bin/chromium
```

**이 줄이 없으면 그 브라우저를 쓸 길이 없다.** `playwright-core`(1.62.1)는 실행 파일을
가리키는 환경변수를 **스스로 내지 않고**(쟀다 — `lib/` 전체에서 `PLAYWRIGHT_*`를 훑으면
`*_EXECUTABLE_PATH`는 Playwright MCP 서버의 것 하나뿐이다), `PLAYWRIGHT_BROWSERS_PATH`는
*캐시 디렉터리*라 그 안이 playwright 의 `chromium_headless_shell-<리비전>/…` 배치여야 한다.

비우면 「넣는 법」 절의 기본 길로 돌아간다. **빈 문자열은 안 준 것과 같다.**
**고쳤으면 API 서버를 다시 띄워라**(「띄우기」 절) — `.env`는 기동 때만 읽힌다.

> **경로를 틀리게 적으면 브라우저가 없는 것과 똑같이 보인다.** 이 기계에서 쟀다 — 없는 경로를
> 주면 `export`는 **HTTP 200**에 **8,008 B**, `ppt/media` **0개**, 슬라이드는
> *"화면 이미지가 실리지 않았습니다"* 뿐이다. **「없으면 무엇이 보이나」 절의 브라우저가 없는 판과 바이트까지 같다.**
> **서버 로그에도 안 남는다**(그 요청 뒤 로그에서 `chromium|browser|screen|화면` 매치 **0**,
> `warn`·`error` 레벨 줄 **0**).
>
> 다른 것은 `export/preview`의 `reason` 하나다:
> *"Failed to launch chromium because executable doesn't exist at `<네가 적은 경로>`"*.
>
> **그리고 이 값은 「넣는 법」 절의 캐시를 이긴다** — 캐시가 멀쩡해도 이 경로가 틀리면 실패한다(그 상태로
> 쟀다). 그래서 **`install chromium`을 다시 돌려도 안 낫는다**(이미 있으니 출력 없이 0이다).
> **증상이 「없으면 무엇이 보이나」와 같으면 이 줄부터 지우고 다시 띄워 봐라.**

### 8.4 알아 둘 것

- **한글 글꼴이 없으면 한 장도 안 그린다.** 두부를 내보내지 않는 판정이고, 미리보기의 `fontWarning`이 그 사실을 낸다. 리눅스 컨테이너에는 보통 없다 — `fonts-noto-cjk` 부류를 넣어야 한다(**이 기계에서는 재지 못했다** — 「못 잰 것」 절).
- **바깥으로 나가는 요청을 끊는다.** 테마의 `@font-face`·`url()`은 사용자가 적은 문자열이라 서버가 그것을 가져가면 안 된다. **대가:** 원격 웹폰트를 든 테마는 에디터 캔버스와 다르게 그려진다.
- **긴 페이지는 조용히 실오라기가 된다.** 화면 전체를 찍으므로 높이가 내용을 따라가고, 슬라이드 위에서 폭이 줄어든다. 상한은 **페이지 장 수**이지 바이트가 아니다.
- 자세한 값(화소·동시성·타임아웃·상한·요청끼리의 상한)은 [`apps/api/README.md`의 *"화면 이미지를 그리는 조건"*](apps/api/README.md#화면-이미지를-그리는-조건)에 있다.

---

## 9. 게이트 — 무엇을 돌려 확인하나

**넷이고 서로를 대신하지 않는다.**

```bash
pnpm test          # 규격·값·인구조사.  Postgres 가 필요하다 (브라우저는 안 띄운다)
pnpm typecheck     # 컴파일
pnpm build         # packages/* 의 dist
pnpm test:build    # 받는 쪽이 받는 것 — 빌드된 dist · 진짜 브라우저 (없으면 건너뛴다)
```

- **`pnpm test`는 실제 Postgres 에 붙는다.** 컨테이너가 healthy 여야 하고 테스트 DB(기본 `wirebound_test`)가 있어야 한다(「테스트가 이유를 알기 어려운 접속 에러로 죽는다」).
- **워크트리 둘이 `pnpm test`를 동시에 돌려도 된다 — 붙는 DB 가 다르면.** 워크트리마다 자기
  컨테이너를 띄우면 그것이 저절로 갈린다(포트가 다르므로). 한 컨테이너를 공유한다면
  `TEST_DATABASE_URL` 을 갈라야 한다. 「워크트리를 여럿 띄울 때」 절이 그
  절차다. 같으면 깨진다(그 절의 «값을 안 가르면 무엇이 보이나» 표에 값이 있다). 가른 상태로 동시에 돌리면 **둘 다 전 케이스
  통과 · 종료 0** 이다.
- **`pnpm test`는 브라우저를 안 띄운다.** 진짜 브라우저를 재는 것은 `pnpm test:build` 하나이고, 브라우저가 없으면 **건너뛰고 그렇다고 말한다**(빈 캐시로 돌리면 **종료 0** 이고 건너뛴 수를 `skipped` 로 찍는다).
- **`pnpm test:build`는 시작할 때 패키지를 다시 빌드한다**(`vitest.config.ts`가 *"tsdown 재빌드를 `beforeAll`에서 돈다"*고 적는다). 그래서 넷 중 이것만 다른 셋과 결이 다르다 — 이미 빌드된 자리에서도 **10초 남짓** 든다(`time pnpm test:build` 로 잰다).
- 파일 하나만 돌리려면 `pnpm vitest run <경로>`, api 만 돌리려면 `pnpm vitest run --project api`.

> **브라우저가 없을 때 `test:build`가 찍는 줄은 `npx playwright install chromium`을 권한다.**
> **그 명령을 쓰지 마라** — 이 저장소는 `playwright` 패키지를 일부러 안 들인다(그것이 브라우저를
> 내려받는 postinstall 을 달고 온다). 브라우저를 넣는 자리는 **「넣는 법」** 절 하나다. 그 안내 문구
> (`apps/api/build-test/screen-chromium.test.ts`)가 이 길과 어긋나 있다 — 문구를 믿지 말고 「넣는 법」 절을 따른다.

---

## 10. 못 잰 것 — **이 문서가 확인하지 않은 것들**

**지어내지 않았다.** 아래는 *"안 해 봤다"*이지 *"안 된다"*가 아니다.

| 무엇 | 사정 |
|---|---|
| **리눅스·Windows** | 이 문서의 값은 전부 **macOS · Apple Silicon** 에서 쟀다. `packages/cli`의 경로 처리가 POSIX 문자열 조작만 하므로 **Windows 의 역슬래시 구분자는 다뤄지지 않았다**(`packages/cli/src/paths.ts`가 그렇게 적고 있다) |
| **컨테이너의 한글 글꼴** | 「알아 둘 것」 절의 *"없으면 한 장도 안 그린다"*를 **글꼴이 없는 기계에서 재 보지 못했다.** 이 기계에는 있다 |
| **`Dockerfile`·배포** | **없다.** 배포 절차를 지어내지 않았다. 이미지를 만드는 사람은 **브라우저 바이너리와 한글 글꼴 둘 다** 넣어야 하고, 그 둘이 들었는지 재는 자를 함께 만들어야 한다 |
| **npm 배포** | 패키지가 전부 `private`이다. `npm i -g wirebound` 같은 길은 **없다** — 「부르는 길이 둘이고」 절이 그래서 두 길을 든다 |
| **Claude Code 밖의 MCP 호스트** | 「다른 호스트」 절 |
| **`--with-deps`** | 리눅스에서만 의미가 있어 이 기계에서 안 썼다 |
| **첫 설치의 내려받기 시간** | 「세우기」 절의 `pnpm install` 값은 **스토어가 따뜻한 기계**의 것이다 |
| **워크트리 셋 이상** | 「워크트리를 여럿 띄울 때」 절의 값은 전부 **워크트리 둘**로 쟀다 |
| **옛 볼륨을 새 이름으로 옮기기** | 절차만 있고 **이 기계에서 안 돌렸다** — `docs/superpowers/plans/2026-08-19-per-worktree-container-report.md` 「선택 — 옛 볼륨을 새 이름으로 "복사"한다」 절이 든다(복사이지 이동이 아니다) |
| **`--env-file` 을 뺀 `up -d` 가 무엇을 하는가** | **안 쟀다.** 기본값이 5433 이라 재려면 사용자의 컨테이너가 쓰는 포트를 건드려야 한다. **잰 것은 `docker compose config` 가 그때 5433 을 낸다는 것까지다** |
| **`SCREEN_CHROMIUM_PATH`의 성공 방향에 자동 케이스가 없다** | *"틀린 경로면 실패한다"*는 `apps/api/build-test/screen-chromium.test.ts`가 잰다. ***"옳은 경로를 주면 그 실행 파일로 뜬다"*는 손으로만 쟀다** — 브라우저 둘이 있어야 세울 수 있는 자리다 |

---

## 11. 더 읽을 것

| 하려는 일 | 어디 |
|---|---|
| **API 를 부른다** — 엔드포인트·에러 형식·권한·응답 형태 | [`apps/api/README.md`](apps/api/README.md) |
| **에이전트에게 설계서를 읽힌다** | [`packages/mcp/skill/SKILL.md`](packages/mcp/skill/SKILL.md) |
| **저장소 규칙**(워크트리·커밋·병렬 작업) | [`CLAUDE.md`](CLAUDE.md) |
| **무엇이 왜 그렇게 서 있나** | `docs/superpowers/plans/` — 계획과 이월 장부. **시점 기록이다** — 지금 참인 규칙은 이 문서들과 설계 규격이 말한다 |
| **설계 규격** | `docs/superpowers/specs/2026-08-03-wirebound-design.md` |

### 저장소 배치

```
packages/schema     노드 타입·컴포넌트 카탈로그·검증·JSON Patch   ← 단일 진실
packages/renderer   스키마 → React 렌더링 (headless)
packages/themes     테마 규격·검증·CSS 컴파일
packages/exporter   HTML 정적 번들 · PPTX
packages/cli        wireb
packages/mcp        MCP 서버 · 스킬
apps/web            설계서 에디터
apps/api            REST + WebSocket
```

의존 방향은 한 방향이다: `schema` ← `renderer` ← 나머지.
