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
| **Docker** | 아무 최신판 | Postgres 하나를 띄운다. DB를 직접 갖고 있으면 없어도 된다(3절) |
| **Chromium** | **PPTX의 화면 이미지를 쓸 때만** | 저장소가 브라우저 바이너리를 안 들고 있다. 8절이 그 자리다 |

```bash
node -v && pnpm -v && docker -v
```

---

## 2. 세우기 — 다섯 걸음

**순서가 있다.** 3번을 빼먹으면 테스트는 통과하는데 서버만 안 뜬다(6.1).

```bash
# 1. Postgres 를 띄운다 — 저장소 루트에서
docker compose up -d                 # 이미 떠 있거나 표가 비면 → 6.3
docker compose ps                    # healthy 가 될 때까지 기다린다
                                     # healthy 가 아니면 5번과 테스트가 전부 접속 실패로 죽는다

# 2. 워크스페이스를 설치한다
pnpm install

# 3. packages/* 를 빌드한다 — 건너뛰지 마라
pnpm build

# 4. API 의 환경 파일을 만든다
cp apps/api/.env.example apps/api/.env

# 5. 마이그레이션을 올린다
pnpm --filter @wirebound/api migrate
```

**이 기계에서 잰 값**

| 걸음 | 시간 | 관측 |
|---|---|---|
| `pnpm install` | **1.2초** | 패키지 **357개**. **pnpm 스토어가 이미 따뜻한 기계다** — 처음 받는 기계는 내려받는 시간이 더 든다. `wireb` 관련 `WARN` 둘이 나오는데 **정상이다**(6.2) |
| `pnpm build` | **4.2초** | `packages/*` 여섯의 `dist` |
| `migrate` | **1.5초** | 빈 DB 에 마이그레이션 **열하나**를 올렸다 |

`docker compose up -d`가 만드는 것은 컨테이너 `wirebound-postgres` 하나이고 **호스트
포트는 5433**이다(5432가 아니다 — 기계에 이미 있는 Postgres 와 겹치지 않게 비켜 뒀다).
접속 문자열은 `.env.example`에 그 값으로 들어 있다.

**컨테이너를 안 쓰고 자기 Postgres 를 쓸 수도 있다.** `apps/api/.env`의 `DATABASE_URL`을
그쪽으로 바꾸면 된다. 그때 **DB 둘이 필요하다** — 운영용 하나와 테스트용
`wirebound_test`(9절).

---

## 3. 띄우기

서버는 **둘이고 함께 떠 있어야 한다.**

```bash
# 터미널 1 — API (기본 포트 3001)
pnpm --filter @wirebound/api dev

# 터미널 2 — 에디터
pnpm --filter @wirebound/web dev
```

두 번째 터미널이 낸 주소(기본 `http://localhost:5173/`)를 브라우저에서 연다. 로그인 화면이
뜨면 **회원가입**으로 계정을 만들고 프로젝트를 만든다.

**에디터가 `/api`를 API 서버로 프록시한다** — 그래야 세션 쿠키가 same-origin 으로 실리고
서버에 CORS 설정이 필요 없다. 그 대상이 `apps/web/vite.config.ts`에 **`127.0.0.1:3001`로
박혀 있다.**

> **`apps/api/.env`의 `PORT`를 바꾸면 `apps/web/vite.config.ts`의 `target`도 함께 바꿔야
> 한다. 자동으로 따라가지 않는다.** (이 기계에서 쟀다 — `PORT=3011`로 옮기고 프록시
> 대상을 안 바꾸면 에디터의 모든 요청이 실패하고, 둘을 함께 바꾸면 로그인부터 편집까지
> 그대로 돈다.)

띄운 뒤 서버만 따로 확인하려면:

```bash
curl http://127.0.0.1:3001/health        # {"status":"ok"}
```

> **`apps/api/.env`를 고쳤으면 API 서버를 다시 띄워라.** `tsx watch`는 **소스만 본다** —
> `.env`가 바뀌어도 다시 읽지 않는다. 이 기계에서 쟀다: `.env`에 없는 브라우저 경로를 심고
> 기다려도 응답이 그대로였고, 서버를 다시 띄우자 그 값이 들었다. **조용한 자리다** —
> 아무 로그도 안 난다.

---

## 4. 첫 프로젝트를 화면 없이 만들기 (선택)

에디터를 안 열고 확인하고 싶을 때. 아래는 **이 기계에서 그대로 돌려 본 것**이다.

```bash
B=http://127.0.0.1:3001
curl -c /tmp/wb.txt -X POST $B/api/auth/signup -H 'content-type: application/json' \
  -d '{"email":"me@example.com","name":"나","password":"비밀번호12345"}'
curl -b /tmp/wb.txt -X POST $B/api/projects -H 'content-type: application/json' \
  -d '{"name":"첫 설계서","slug":"first"}'
```

두 번째 응답의 `id`가 **프로젝트 id**이고, 그것이 5절 `wireb init`의 `--project` 인자다.
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
**pnpm 의 전역 저장소에 둘이 남는다**(이 기계에서 쟀다 — 이 자리를 리뷰가 지목했다:
귀속: 리뷰 §5 C6):

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
| **4** | 서버에 못 닿았다 — **같은 주소의 서버가 죽었을 때**다. `.wirebound.json`의 `server`를 **다른 주소로 바꾸면 4가 아니라 2**가 나온다: 자격이 `(server, projectId)`에 매여 있어 네트워크를 타기 전에 끊긴다(귀속: 리뷰 §5 C4) |
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
> 착각한다**(이 자리를 그렇게 잘못 적었다가 리뷰가 잡았다 — 귀속: 리뷰 §4 B2).

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
설치를 다시 돌지 않는다). `wireb`를 이름으로 부르려면 5.1의 ㉮·㉯를 쓴다.

### 6.3 `docker compose ps`가 빈 표를 내는데 컨테이너는 떠 있다

**원인.** `docker compose`는 **디렉터리 이름**을 프로젝트 이름으로 쓴다. 워크트리
(`.worktrees/<이름>/`)에서 부르면 그 워크트리 이름의 **다른 프로젝트**를 보게 된다.

**증상 둘.** `ps`가 비고, `up -d`는 이렇게 죽는다(이 기계에서 쟀다):

```
Conflict. The container name "/wirebound-postgres" is already in use by container "…"
```

`container_name`이 고정이라 **둘째 컨테이너가 안 뜬다** — 다행이다. 대신 그 워크트리
이름의 **빈 볼륨과 네트워크가 남는다**(`docker volume ls`로 보인다).

**조치.** **컨테이너는 한 번만 띄우고 워크트리들이 공유한다.** 상태는 compose 를 거치지 말고
컨테이너 이름으로 본다:

```bash
docker ps --filter name=wirebound-postgres
```

> **`docker compose -p <이름> ps`는 믿지 마라.** 그 `<이름>`은 **그 컨테이너를 실제로 띄운
> 디렉터리의 이름**이어야 한다 — 저장소 루트에서 띄웠으면 `wirebound`지만 누군가 워크트리
> 에서 먼저 띄웠으면 그 워크트리 이름이다. 이 기계에서 쟀다: 떠 있는 컨테이너의 프로젝트가
> `feat-p1-api`였고 `-p wirebound ps`가 **빈 표**를 냈다. `docker compose ls`가 어느 이름으로
> 떠 있는지 말해 준다.

### 6.4 테스트가 이유를 알기 어려운 접속 에러로 죽는다

**원인.** 테스트 DB `wirebound_test`가 없다. `docker/postgres-init/01-test-db.sql`이 그것을
만드는데 **그 스크립트는 볼륨을 처음 만들 때만 돈다.** `wirebound-pgdata` 볼륨이 이미 있는
상태로(예전 판을 쓰다가) 새로 받았다면 없을 수 있다.

**조치.** 컨테이너 안에서 직접 만든다.

```bash
docker exec wirebound-postgres psql -U wirebound -d postgres -c 'CREATE DATABASE wirebound_test;'
```

> **`docker compose down -v`로 볼륨을 지우는 길도 있지만 그것은 그 볼륨의 설계서를 전부
> 지운다.** 위 한 줄로 끝나는 일에 그것을 쓰지 마라.

### 6.5 pptx 는 나오는데 화면 이미지가 없다

슬라이드의 화면 자리에 **"화면 이미지가 실리지 않았습니다"**만 있다. 8절이 그 자리다.

### 6.6 에디터가 뜨는데 로그인이 안 된다 / 목록이 비어 있다

**원인.** API 서버가 안 떠 있거나, `PORT`를 바꿨는데 `apps/web/vite.config.ts`의 프록시
대상을 안 바꿨다(3절).

**조치.** `curl http://127.0.0.1:3001/health`로 API 를 먼저 확인한다.

**가장 빠른 자리는 브라우저가 아니라 에디터를 띄운 터미널이다** — vite 가 **틀린 대상을 이름까지**
말한다(이 기계에서 쟀다):

```
[vite] http proxy error: /api/auth/me
Error: connect ECONNREFUSED 127.0.0.1:3001
```

개발자 도구의 네트워크 탭에서는 `/api/...` 요청이 **500(본문 0 바이트)**이면 프록시 대상이 틀린
것이고, **401**이면 서버는 붙었고 로그인만 안 된 것이다. **502가 아니다** — vite 는 프록시 실패를
500으로 낸다.

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

`wireb-mcp`를 전역에 안 걸었으면(5.1 ㉯) 명령을 절대경로로 준다:

```jsonc
{ "mcpServers": { "wirebound": {
  "command": "node", "args": ["/절대/경로/wirebound/packages/mcp/dist/bin.js"] } } }
```

### 7.2 다른 호스트 — **안 해 봤다**

Claude Desktop·Cursor·Zed 등은 **이 슬라이스가 등록해 보지 않았다.** stdio 서버를 받는
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
| `GET .../export/preview?format=pptx` | **여기에만 이유가 있다** — `screenFailures[].reason`:<br>`브라우저를 띄우지 못했습니다: browserType.launch: Executable doesn't exist at <경로>` |
| 에디터 화면 | **아무것도 안 보인다.** `apps/web`이 아직 pptx 미리보기를 그리지 않는다 |
| **서버 로그** | **아무것도 안 남는다**(쟀다 — `chromium`·`browser`·`screen`·`화면` 매치 **0** · `warn`·`error` 줄 **0**). 운영자가 지켜보는 자리에도 안 간다 |

> **그래서 이유는 `GET .../export/preview?format=pptx`를 직접 불러야 보인다.**
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

> **`node node_modules/playwright-core/cli.js …`는 이 저장소에서 안 된다.** pnpm 의 엄격한
> 배치라 `playwright-core`가 루트 `node_modules`에 없다 — 그대로 부르면
> `Cannot find module`이다(이 기계에서 쟀다. 이 저장소의 앞선 문서가 루트 기준으로 적어
> 뒀는데 그 줄이 틀렸다 — `docs/superpowers/plans/2026-08-17-p10-2-carryforward.md` §3.2).

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

비우면 8.2의 기본 길로 돌아간다. **빈 문자열은 안 준 것과 같다.**
**고쳤으면 API 서버를 다시 띄워라**(3절) — `.env`는 기동 때만 읽힌다.

> **경로를 틀리게 적으면 브라우저가 없는 것과 똑같이 보인다.** 이 기계에서 쟀다 — 없는 경로를
> 주면 `export`는 **HTTP 200**에 **8,008 B**, `ppt/media` **0개**, 슬라이드는
> *"화면 이미지가 실리지 않았습니다"* 뿐이다. **8.1의 「브라우저가 없을 때」와 바이트까지 같다.**
> **서버 로그에도 안 남는다**(그 요청 뒤 로그에서 `chromium|browser|screen|화면` 매치 **0**,
> `warn`·`error` 레벨 줄 **0**).
>
> 다른 것은 `export/preview`의 `reason` 하나다:
> *"Failed to launch chromium because executable doesn't exist at `<네가 적은 경로>`"*.
>
> **그리고 이 값은 8.2의 캐시를 이긴다** — 캐시가 멀쩡해도 이 경로가 틀리면 실패한다(그 상태로
> 쟀다). 그래서 **`install chromium`을 다시 돌려도 안 낫는다**(이미 있으니 출력 없이 0이다).
> **증상이 8.1과 같으면 이 줄부터 지우고 다시 띄워 봐라.**

### 8.4 알아 둘 것

- **한글 글꼴이 없으면 한 장도 안 그린다.** 두부를 내보내지 않는 판정이고, 미리보기의 `fontWarning`이 그 사실을 낸다. 리눅스 컨테이너에는 보통 없다 — `fonts-noto-cjk` 부류를 넣어야 한다(**이 기계에서는 재지 못했다** — 10절).
- **바깥으로 나가는 요청을 끊는다.** 테마의 `@font-face`·`url()`은 사용자가 적은 문자열이라 서버가 그것을 가져가면 안 된다. **대가:** 원격 웹폰트를 든 테마는 에디터 캔버스와 다르게 그려진다.
- **긴 페이지는 조용히 실오라기가 된다.** 화면 전체를 찍으므로 높이가 내용을 따라가고, 슬라이드 위에서 폭이 줄어든다. 상한은 **페이지 장 수**이지 바이트가 아니다.
- 자세한 값(화소·동시성·타임아웃·상한·요청끼리의 방벽 없음)은 [`apps/api/README.md`의 *"화면 이미지를 그리는 조건"*](apps/api/README.md#화면-이미지를-그리는-조건-p10-2)에 있다.

---

## 9. 게이트 — 무엇을 돌려 확인하나

**넷이고 서로를 대신하지 않는다.**

```bash
pnpm test          # 규격·값·인구조사.  Postgres 가 필요하다 (브라우저는 안 띄운다)
pnpm typecheck     # 컴파일
pnpm build         # packages/* 의 dist
pnpm test:build    # 받는 쪽이 받는 것 — 빌드된 dist · 진짜 브라우저 (없으면 건너뛴다)
```

- **`pnpm test`는 실제 Postgres 에 붙는다.** 컨테이너가 healthy 여야 하고 `wirebound_test`가 있어야 한다(6.4).
- **`pnpm test`는 브라우저를 안 띄운다.** 진짜 브라우저를 재는 것은 `pnpm test:build` 하나이고, 브라우저가 없으면 **건너뛰고 그렇다고 말한다.**
- 파일 하나만 돌리려면 `pnpm vitest run <경로>`, api 만 돌리려면 `pnpm vitest run --project api`.

---

## 10. 못 잰 것 — **이 문서가 확인하지 않은 것들**

**지어내지 않았다.** 아래는 *"안 해 봤다"*이지 *"안 된다"*가 아니다.

| 무엇 | 사정 |
|---|---|
| **리눅스·Windows** | 이 문서의 값은 전부 **macOS · Apple Silicon** 에서 쟀다. `packages/cli`의 경로 처리가 POSIX 문자열 조작만 하므로 **Windows 의 역슬래시 구분자는 다뤄지지 않았다**(`packages/cli/src/paths.ts`가 그렇게 적고 있다) |
| **컨테이너의 한글 글꼴** | 8.4 의 *"없으면 한 장도 안 그린다"*를 **글꼴이 없는 기계에서 재 보지 못했다.** 이 기계에는 있다 |
| **`Dockerfile`·배포** | **없다.** 배포 절차를 지어내지 않았다. 이미지를 만드는 사람은 **브라우저 바이너리와 한글 글꼴 둘 다** 넣어야 하고, 그 둘이 들었는지 재는 자를 함께 만들어야 한다 (`docs/superpowers/plans/2026-08-17-p10-2-carryforward.md` §3.2) |
| **npm 배포** | 패키지가 전부 `private`이다. `npm i -g wirebound` 같은 길은 **없다** — 5.1 이 그래서 두 길을 든다 |
| **Claude Code 밖의 MCP 호스트** | 7.2 |
| **`--with-deps`** | 리눅스에서만 의미가 있어 이 기계에서 안 썼다 |
| **첫 설치의 내려받기 시간** | 2절의 `pnpm install` 값은 **스토어가 따뜻한 기계**의 것이다 |
| **`SCREEN_CHROMIUM_PATH`의 성공 방향에 자동 케이스가 없다** | *"틀린 경로면 실패한다"*는 `apps/api/build-test/screen-chromium.test.ts`가 잰다. ***"옳은 경로를 주면 그 실행 파일로 뜬다"*는 손으로만 쟀다** — 브라우저 둘이 있어야 세울 수 있는 자리다(이쪽과 리뷰어가 각각 손으로 확인했다) |

---

## 11. 더 읽을 것

| 하려는 일 | 어디 |
|---|---|
| **API 를 부른다** — 엔드포인트·에러 형식·권한·응답 형태 | [`apps/api/README.md`](apps/api/README.md) |
| **에이전트에게 설계서를 읽힌다** | [`packages/mcp/skill/SKILL.md`](packages/mcp/skill/SKILL.md) |
| **저장소 규칙**(워크트리·커밋·병렬 작업) | [`CLAUDE.md`](CLAUDE.md) |
| **무엇이 왜 그렇게 서 있나** | `docs/superpowers/plans/2026-08-17-p10-2-carryforward.md` — 로드맵 전체와 미결 장부 |
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
