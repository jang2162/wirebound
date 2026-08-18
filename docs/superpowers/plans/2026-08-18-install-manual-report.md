# 설치 매뉴얼 — 보고

> 계획: `2026-08-18-install-manual.md` · 이월은 새로 만들지 않고 `2026-08-17-p10-2-carryforward.md` §3을 갱신했다

**한 줄.** 저장소를 **막 받은 상태에서 처음부터 끝까지 두 번 세웠고**(T1 · T4), 그 관측으로
최상위 `README.md`를 썼으며, D4의 Chromium 자리는 **재고 나서 코드 한 줄을 열기로
판정했다**(`SCREEN_CHROMIUM_PATH`). 게이트 넷 전부 **0**이다.

**이 기계.** macOS 26.6.1 · Apple Silicon(arm64) · Node **22.23.1** · pnpm **10.0.0** ·
Docker **29.5.2** · git 2.50.1. 아래 값은 **이 기계에서 잰 것**이고, 남이 잰 값에는 귀속을 붙였다.

---

## 1. 산출물

| 무엇 | 왜 |
|---|---|
| **`README.md`**(새로) | D1. 저장소를 처음 여는 사람의 길 |
| `apps/api/README.md` | D1. **기동 절차 여섯 걸음을 걷어 내고** 최상위를 가리키게 했다. 남긴 것은 이 서버만의 사정 둘(env 를 읽는 방식 · `pnpm build`가 전제인 이유)이고 **명령 요약도 api 것만 남겼다** |
| `apps/api/src/config.ts` · `main.ts` · `.env.example` | D4. `SCREEN_CHROMIUM_PATH` |
| `apps/api/test/config-screen-chromium.test.ts`(새로) · `test/screen-renderer-census.test.ts` | 위 배선을 재는 자 |
| `docs/superpowers/plans/2026-08-17-p10-2-carryforward.md` | §3의 미결 장부 갱신 |

---

## 2. T1 — 처음부터 끝까지 한 번

**워크트리를 부트스트랩하지 않은 채로 받았다**(코디네이터가 일부러 안 했다). `node_modules`도
`apps/api/.env`도 없는 **막 받은 저장소**가 그대로 T1의 무대였다.

### 2.1 걸음마다 잰 값

| 걸음 | 종료 코드 | 시간 | 관측 |
|---|---|---|---|
| `node -v && pnpm -v && docker -v` | 0 | — | `engines`(≥22.9)와 `packageManager`(10.0.0)를 둘 다 만족했다 |
| `docker compose up -d` | — | — | **안 돌렸다.** 컨테이너가 이미 healthy 하게 떠 있고 공유 자원이다(§7) |
| `pnpm install` | 0 | **1.2초** | 패키지 **357개**. **`WARN` 둘**이 났다(§3.2) |
| `pnpm build` | 0 | **4.2초** | `packages/*` 여섯의 `dist` |
| `cp .env.example .env` | 0 | — | |
| `pnpm --filter @wirebound/api migrate` | 0 | **1.5초** | **빈 DB**에 마이그레이션 열하나 |
| `pnpm --filter @wirebound/api dev` | — | ~6초에 listening | `Server listening at http://127.0.0.1:3011` |
| `pnpm --filter @wirebound/web dev` | — | vite ready **81ms** | |

**`pnpm install` 1.2초는 스토어가 따뜻한 기계의 값이다** — 처음 받는 기계는 내려받는 시간이
더 든다. README 가 그렇게 적었다.

### 2.2 끝까지 갔다는 증거

| 무엇 | 관측 |
|---|---|
| `/health` | `{"status":"ok"}` |
| 회원가입 · 프로젝트 · 메뉴 · 페이지 | 전부 201. 한글 이름·한글 비밀번호가 그대로 통했다 |
| **에디터가 뜨나** | 로그인 화면 → 로그인 → 프로젝트 목록 → **3분할 셸**(메뉴·페이지 트리 / 캔버스 / 속성·코멘트·상호작용). 헤드리스 브라우저로 실제 화면을 찍어 확인했다 |
| 프록시 | vite 를 지나 `POST /api/auth/login` → `GET /api/auth/me` → `GET .../tree` 가 전부 same-origin 세션으로 돌았다 |
| `wireb` 여섯 명령 | `init` · `login` · `lint` · `page get` · `pull` · `export --format html|pptx` 전부 0 |
| MCP | `initialize` · `tools/list`(도구 다섯) · `tools/call`(`list_pages` · `get_page`)이 **실제 데이터**로 답했다 |
| PPTX | 화면 이미지가 실린 파일(`ppt/media/image1.png`)이 나왔다 |

---

## 3. 막힌 자리 — **전부**(D3)

**이것이 이 문서의 값이다.** 순서대로 성공한 것만 적으면 아무도 안 읽는다.

### 3.1 `docker compose ps`가 빈 표를 낸다 — 컨테이너는 떠 있는데

- **증상.** 워크트리에서 `docker compose ps` → 헤더만 있는 빈 표. `docker ps`에는 `wirebound-postgres`가 **6일째 healthy**.
- **원인.** `docker compose`가 **디렉터리 이름**을 프로젝트 이름으로 쓴다. 이 워크트리에서는 `docs-install-manual`이 되어 다른 프로젝트를 본다. `docker compose config`가 `"name": "docs-install-manual"`을 그대로 낸다.
- **조치.** `docker ps --filter name=wirebound-postgres`.
- **더 잰 것.** 워크트리에서 `docker compose up -d`를 실제로 돌려 봤다:

  ```
  Network docs-install-manual_default        Created
  Volume  docs-install-manual_wirebound-pgdata  Created
  Container wirebound-postgres  Error response from daemon: Conflict.
    The container name "/wirebound-postgres" is already in use by container "5c997cee…"
  ```

  **`container_name`이 고정이라 둘째 컨테이너가 안 뜬다** — 다행이다. 대신 **빈 볼륨과
  네트워크가 남는다.** 만든 것은 즉시 지웠고(§7) 원래 컨테이너는 무사하다.

- **이 기계에는 그런 볼륨이 이미 셋 있었다** — `feat-p1-api_wirebound-pgdata` ·
  `feat-p2b1-editor-shell_wirebound-pgdata` · `wirebound_wirebound-pgdata`. **앞선 판들이
  워크트리에서 `up -d`를 돌린 자국이다.** 그리고 **지금 떠 있는 컨테이너의 프로젝트는
  `feat-p1-api`다**(`docker compose ls`) — 그래서 `-p wirebound ps`도 빈 표다. T4가 이것을
  잡았다(§6).

### 3.2 `pnpm install`이 `wireb` 때문에 경고를 낸다 — **첫 설치에서는 반드시**

```
WARN  Failed to create bin at …/packages/mcp/node_modules/.bin/wireb.
      ENOENT: … open '…/packages/cli/dist/bin.js'
```

- **원인.** `packages/mcp`가 `@wirebound/cli`를 의존으로 갖고 pnpm 이 그 `bin`을 링크하려는데 **아직 빌드 전이라 `dist/bin.js`가 없다.** 설치가 빌드보다 먼저 오므로 피할 수 없다.
- **관측.** `pnpm build` 뒤에도 **링크는 안 생긴다.** `pnpm install`을 다시 돌리면 `Already up to date`로 끝나고 아무것도 안 만든다.
- **조치.** 없다(무해). `wireb`를 이름으로 부르는 길은 §5.

### 3.3 `pnpm build`를 빼면 서버만 안 뜬다 — **게이트는 초록이다**

계획서의 사실 3을 **실제로 재 봤다**(`packages/*/dist`를 지우고).

| 무엇 | 결과 |
|---|---|
| `pnpm start`(api) | **종료 코드 1** · `Error [ERR_MODULE_NOT_FOUND]: Cannot find module '…/apps/api/node_modules/@wirebound/schema/dist/index.js' imported from …/apps/api/src/config.ts` |
| 같은 상태에서 api 테스트 한 파일 | **종료 코드 0** |

**사실 3이 맞다.** README §6.1이 그 문장과 두 줄을 함께 든다.

### 3.4 `wireb`가 어디에도 없다

- **관측.** 설치 뒤 루트 `node_modules/.bin`에 있는 것은 `tsc`·`tsserver`·`vitest` **셋뿐**이다. `pnpm exec wireb`도 `pnpm --filter @wirebound/cli exec wireb`도 **`Command "wireb" not found"`**다(패키지 자기 `bin`은 자기 `.bin`에 안 들어간다).
- §5가 그 자리다.

### 3.5 `wireb login`이 tty 가 아니면 멈춘다

```
비밀번호를 읽을 수 없습니다. tty가 아니면 표준입력으로 주거나 WIREB_PASSWORD를 설정하세요
```

**명령이 스스로 무엇을 해야 하는지 말한다.** `echo "$비밀번호" | wireb login --email …`로 통했다.

### 3.6 `.env`를 고쳐도 서버가 안 읽는다 — **조용하다**

T4가 잡았다. §6.3.

### 3.7 이월이 적은 브라우저 설치 명령이 이 저장소에서 안 돈다

§4.2.

### 3.8 전역 링크 명령을 `--dir`/`-C`로 쓰면 **엉뚱한 것이 걸리고 성공으로 끝난다**

T4가 잡았다. §6.2.

### 3.9 내가 만든 스크립트가 `playwright-core`를 못 찾았다 (검증 도중)

scratchpad 에 둔 `.mjs`에서 `import … from 'playwright-core'`가 죽었다 —
**모듈 해석이 cwd 가 아니라 그 파일의 위치를 기준으로 한다.** pnpm 의 엄격한 배치라
`playwright-core`는 `apps/api/node_modules` 아래에만 있다. 절대경로로 import 해서 넘겼다.
**매뉴얼 본문에는 안 적었다** — 저장소를 세우는 길에 있는 자리가 아니다.

---

## 4. T2 — Chromium 자리 판정 (D4)

### 4.1 먼저 쟀다 — **브라우저가 없으면 사람에게 무엇이 보이나**

계획서의 재라 #2가 *"없는 상태를 만들 수 있는지 안 쟀다"*였다. **만들 수 있었다** —
`PLAYWRIGHT_BROWSERS_PATH`를 빈 디렉터리로 두면 된다(사용자의 캐시를 안 건드린다).

| 어디 | 무엇이 보이나 |
|---|---|
| `GET .../export?format=pptx` | **HTTP 200** · 파일 **8,008 B** · `ppt/media/` **비어 있다** · 슬라이드의 화면 자리에 **"화면 이미지가 실리지 않았습니다"** |
| `GET .../export/preview?format=pptx` | **여기에만 이유가 있다** — `screenFailures: [{ title, reason }]`, `reason` = `브라우저를 띄우지 못했습니다: browserType.launch: Executable doesn't exist at /…/chromium_headless_shell-1234/chrome-headless-shell-mac-arm64/chrome-headless-shell` |
| `screenless` | **`[]`** — 겹치지 않는다는 P10-2 D5가 실제로 그렇게 돈다 |
| 에디터 | **아무것도 안 보인다**(`apps/web`이 pptx 미리보기를 아직 안 그린다 — 이월 §3.4) |

**대조군**(브라우저 있음): 파일 **27,764 B** · `ppt/media/image1.png` **27,816 B**.

**두 가지가 값으로 드러났다.**

1. **오류 문장이 자기가 찾던 경로와 리비전을 그대로 말한다** — 사람이 무엇을 채워야 하는지 안다.
2. **`chromium.launch()`가 찾는 것은 headless shell 이다**(`chromium_headless_shell-1234`). 그래서 `--only-shell`로 충분하다 — 이월이 *"`--only-shell`이면 headless shell 만"*이라 적었는데 **그것이 서버가 실제로 쓰는 것**이라는 말은 없었다.

### 4.2 절차가 성립하는가 — **성립한다. 다만 이월의 명령이 틀렸다**

```bash
# 이월(§3.2)이 적은 것 — 이 저장소에서 안 된다
node node_modules/playwright-core/cli.js install chromium
#   → Error: Cannot find module '…/node_modules/playwright-core/cli.js'

# 되는 것
node apps/api/node_modules/playwright-core/cli.js install chromium
```

pnpm 의 엄격한 배치라 `playwright-core`는 루트 `node_modules`에 없다.
**이월의 그 줄이 틀렸고 README 가 바로잡았다.**

**빈 캐시에 실제로 내려받아 왕복을 닫았다:**

| 무엇 | 값 |
|---|---|
| `install chromium --only-shell` | 내려받기 **94.7 MiB** + FFmpeg **1 MiB** · **6.4초** |
| 디스크 | `chromium_headless_shell-1234` **196M** + `ffmpeg-1011` **2.5M** |
| 넣은 뒤 | `screenFailures: []` · pptx 에 `ppt/media/image1.png` |
| 이미 있으면 | **출력 없이 종료 코드 0** |

**이월의 "196MB"는 디스크 크기이고 내려받기는 94.7 MiB 다** — 둘 다 값이라 README 가 둘을 나눠 적었다.

### 4.3 그런데도 코드를 열었다 — 근거

D4는 *"성립하는 절차가 「캐시 경로에 손으로 넣어라」 뿐이면 코드가 옳다"*고 했다.
**§4.2가 성립하므로 그 조건은 안 맞는다.** 그래도 열었고, 근거는 셋이다.

1. **기계에 이미 있는 브라우저를 쓸 길이 오늘 없다.** `playwright-core` **1.62.1**의 `lib/` 전체에서 `PLAYWRIGHT_*` 이름을 훑었다 — `*_EXECUTABLE_PATH`는 **`PLAYWRIGHT_MCP_EXECUTABLE_PATH` 하나**이고 그것은 **Playwright MCP 서버의 것**이지 `chromium.launch()`의 것이 아니다. `PLAYWRIGHT_BROWSERS_PATH`는 *캐시 디렉터리*라 **그 안이 playwright 의 `chromium_headless_shell-<리비전>/…` 배치여야 한다** — 그 자리에 배포판 chromium 을 넣는 것은 **절차가 아니라 손질이다.** D4가 말한 그 모양이 이 audience 에 대해서는 성립한다.
2. **`executablePath` 옵션은 이미 있었고 채우는 자만 없었다.** `chromiumScreenRenderer`가 처음부터 들고 있는데 `main.ts`가 인자 없이 부르므로 **바깥에서 닿을 수 없는 값**이었다. 배선은 한 줄이다.
3. **이월 §3.2가 남긴 세 줄의 audience 가 바로 이쪽이다** — `Dockerfile`을 만드는 사람. `apt-get install -y chromium fonts-noto-cjk` + `SCREEN_CHROMIUM_PATH=/usr/bin/chromium`이 그 이미지에서 훨씬 싸다.

**실제로 되는 것을 값으로 확인했다** — `playwright-core`가 자기 캐시로 **빈 디렉터리**를 보게 두고 `executablePath`에 캐시 밖 브라우저를 준 상태에서 PNG 가 나왔다(먼저 라이브러리 수준에서, 다음에 `.env`를 통해 서버 수준에서).

### 4.4 무엇을 고쳤나

| 파일 | 무엇 |
|---|---|
| `config.ts` | `SCREEN_CHROMIUM_PATH` → `ApiConfig.screenChromiumPath`. **빈 문자열은 안 준 것과 같다** — `.env.example`이 주석으로 든 줄을 주석만 풀고 값을 안 채우는 자리이고, 그대로 넘기면 `executablePath: ''`가 되어 *"Executable doesn't exist at "*라는 **끝이 잘린 문장**이 사람에게 간다 |
| `main.ts` | 값이 있으면 `{ executablePath }`, 없으면 인자 자체를 안 준다 |
| `.env.example` | 주석 넷 + 꺼진 줄 하나 |
| `test/config-screen-chromium.test.ts` | 없음 · 값 · **빈 문자열** · 공백만 든 값(**눌러 주지 않는다** — 경로의 일부일 수 있다) |
| `test/screen-renderer-census.test.ts` | 기존 케이스가 `screenRenderer: chromiumScreenRenderer()`를 **글자 그대로** 요구해 인자가 붙으면 죽는다. `(`까지만 재도록 느슨하게 하고 **그만큼을 새 케이스가 메운다** — `executablePath: config.screenChromiumPath`가 `main.ts`에 있는지 |

### 4.5 그 케이스들이 실제로 구분하는가 — **실증했고 복구했다**

프로덕션을 변조해 재고 `finally`에서 원본 전문을 되썼다(`git checkout --`을 안 썼다).

| 변이 | 결과 |
|---|---|
| `main.ts`를 `chromiumScreenRenderer()`로 되돌린다(배선 끊기) | **종료 코드 1** — `× main.ts 가 config.screenChromiumPath 를 그리는 자에게 넘긴다` **하나만** 빨강, 나머지 6 초록 |
| `config.ts`의 빈 문자열 가드를 뺀다 | **종료 코드 1** — `× 빈 문자열은 안 준 것과 같다` **하나만** 빨강, 나머지 3 초록 |

복구 뒤 `git status`로 작업 트리를 확인했다.

---

## 5. D6 — `wireb`와 MCP 를 부르는 길

### 5.1 `wireb` — 두 길을 재고 정했다

| 길 | 결과 |
|---|---|
| `pnpm exec wireb` · `pnpm --filter @wirebound/cli exec wireb` | **안 된다** — `Command "wireb" not found` |
| `node packages/cli/dist/bin.js` | **된다.** 설치할 것이 없다. `pnpm build` 뒤 바로 |
| `cd packages/cli && pnpm link --global` | **된다** — **0.18초** · `~/Library/pnpm/wireb`가 생기고 저장소 밖에서 돈다. **`private` 패키지여도 막지 않는다**(계획서 재라 #4의 답) |
| `pnpm --dir packages/cli link --global` · `pnpm -C packages/cli link --global` | **워크스페이스 뿌리를 건다**(§6.2) |

**둘 다 README 에 적었다** — 저장소 안에서 부르는 길과 어디서나 부르는 길이 다르기 때문이다.

### 5.2 MCP — **실제로 등록해서 도는 것을 확인했다**

계획서 재라 #3의 답: **할 수 있었다.** 호스트는 **Claude Code 2.1.234**다.

```bash
claude mcp add wirebound -- wireb-mcp
claude mcp list
#  wirebound: wireb-mcp  - ✔ Connected
```

**T1 과 T4 에서 각각 한 번씩, 서로 다른 리포에서 등록해 둘 다 `✔ Connected`를 봤다.**
등록만이 아니라 **도구가 실제 데이터로 답하는 것까지** 확인했다(stdio 로 `initialize` →
`tools/list` → `tools/call`).

| 잰 것 | 값 |
|---|---|
| `tools/list` | 도구 **다섯** — `list_pages` · `get_page` · `patch_page` · `add_comment` · `validate`. SKILL.md 의 표와 같다 |
| `list_pages` | 메뉴·페이지·`duplicatePaths`를 실제 프로젝트에서 냈다 |
| `get_page` | `headSeq` · `nodes[].path` 포함 |
| `.wirebound.json` 없는 자리에서 부르면 | `isError: true` · `[wireb 코드 2] .wirebound.json을 찾을 수 없습니다…` **+ 어디서부터 위로 찾았는지 말한다** |
| 리포의 `.mcp.json`(프로젝트 스코프) | `⏸ Pending approval (run \`claude\` to approve)` — **바로 안 붙는다** |

**다른 호스트(Claude Desktop·Cursor·Zed 등)는 안 해 봤다.** README §7.2가 그렇게 적었다.

**`.wirebound.json` 해석이 작업 디렉터리 기준**이라는 것이 등록 시 가장 중요한 값이다 —
README 가 그것을 §7 머리에 뒀다.

### 5.3 스킬

`packages/mcp/skill/SKILL.md`를 README §7.3이 가리킨다. **내용을 옮기지 않았다** —
그 문서가 소유한다.

---

## 6. T4 — 되짚기가 잡은 것 **셋 + 하나**

**T3의 문서만 보고** 처음부터 다시 세웠다. `node_modules`·`dist`·`.env`·`~/.wirebound`·
전역 링크·MCP 등록·검증용 DB 를 전부 지우고 시작했다. **문서에 없는 지식을 쓰게 된 자리가
문서의 구멍이고, 넷을 되먹였다.**

### 6.1 `docker compose -p wirebound ps`가 빈 표를 냈다 — **내가 적은 조치가 틀렸다**

T3 초고의 §6.3이 *"프로젝트 이름을 명시한다: `docker compose -p wirebound ps`"*라 적었다.
**그것이 안 된다** — 지금 떠 있는 컨테이너를 만든 디렉터리가 저장소 루트가 아니라
**`feat-p1-api` 워크트리**이기 때문이다(`docker compose ls`가 그렇게 말한다).
**되먹임:** `docker ps --filter name=wirebound-postgres`를 유일한 조치로 올리고,
`-p <이름>`이 왜 못 미더운지를 함께 적었다.

### 6.2 `pnpm --dir packages/cli link --global`이 **엉뚱한 것을 걸었다**

T3 초고가 그렇게 적었는데(T1 에서는 `cd`로 쟀으면서) **`--dir`도 `-C`도 워크스페이스 뿌리를
건다** — 둘 다 `+ wirebound <- …/docs-install-manual`을 내고 **성공으로 끝난다.**
`wireb`는 `PATH`에 안 생긴다. **오류가 아니라 성공이라 다음 명령이 `not found`일 때까지
모른다.** **되먹임:** `(cd packages/cli && pnpm link --global)` 형태로 바꾸고 그 함정을
경고로 적었다. 잘못 걸린 것을 지우는 명령도 함께(`pnpm uninstall --global wirebound`).

### 6.3 `.env`를 고쳐도 서버가 안 읽는다 — **조용하다**

`SCREEN_CHROMIUM_PATH`에 없는 경로를 심고 기다려도 응답이 그대로였다. **`tsx watch`는
소스만 본다.** 서버를 다시 띄우자 그 값이 들었다(`… executable doesn't exist at /없는/경로/chromium`).
**아무 로그도 안 난다.** **되먹임:** README §3에 인용구로 넣었다.

### 6.4 브라우저가 이미 있으면 설치 명령이 **아무것도 안 낸다**

출력 없이 종료 코드 0. *"실패했나"*로 읽힐 수 있어 **되먹임**했다.

### 6.5 T4 에서 **이탈한 것 둘** — 문서의 구멍이 아니라 공유 자원 보호다

| 이탈 | 왜 | 문서가 그것을 덮나 |
|---|---|---|
| `PORT=3011` (README 는 3001) | 사용자의 dev 서버가 3001에 있을 수 있다(브리프) | **그렇다.** README §3의 *"PORT 를 바꾸면 `vite.config.ts`의 `target`도 바꿔라"*를 **그대로 따라 했고 그대로 됐다** — 오히려 그 경고를 재는 실행이 됐다 |
| `DATABASE_URL`을 새 DB(`wirebound_t4`)로 | 기본 `wirebound` DB 에 **사용자 데이터 14 users · 16 projects · 358 pages**가 있다 | **그렇다.** README §2의 *"자기 Postgres 를 쓸 수도 있다 — `DATABASE_URL`을 바꾸면 된다"* |

**그 밖에는 문서 밖 지식을 안 썼다.**

---

## 7. 공유 자원 — 무엇을 건드렸고 어떻게 되돌렸나

**`docker compose down -v`를 안 썼다. 컨테이너를 새로 안 띄웠다. 포트 3001을 안 썼다.**

| 자원 | 한 일 | 되돌림 |
|---|---|---|
| Postgres 컨테이너 | `docker exec`로 DB 생성·조회만 | 그대로. **6일째 healthy** |
| `wirebound` DB(사용자 데이터) | **읽기만**(테이블 목록·마이그레이션 상태·행 수) | **14 users · 16 projects · 358 pages — 처음과 같다** |
| 검증용 DB | `wirebound_manual`·`wirebound_t4`를 만들어 씀 | **둘 다 DROP.** 남은 DB 는 `wirebound`·`wirebound_test` 둘뿐 |
| `wirebound_test` | `pnpm test`가 쓴다(정상 경로) | — |
| 볼륨 | 워크트리 `up -d` 실증이 `docs-install-manual_wirebound-pgdata`를 만듦 | **즉시 `docker volume rm`.** 네트워크도 `compose down`으로 제거 |
| 포트 | api **3011** · vite **5199**(3001·5173·5174를 피했다) | 프로세스 전부 종료 |
| `~/.wirebound` | `wireb login`이 만들었다(원래 **없었다**) | **`rm -rf`.** 없다 |
| pnpm 전역 링크 | `wireb`·`wireb-mcp`(+ 실수로 걸린 `wirebound`) | **전부 `uninstall --global`.** 전역 bin 에 남은 것 없음 |
| `~/.claude.json` MCP 등록 | local 스코프 둘 | **둘 다 `claude mcp remove`.** 남은 등록 0 |
| playwright 캐시 | **안 건드렸다** — 내려받기는 `/tmp`의 빈 디렉터리로 유도 | `/tmp` 임시 디렉터리 삭제 |
| `apps/web/vite.config.ts` | 프록시 대상을 두 번 임시 변경 | **원본 전문 복구.** `git status`로 확인 |
| `apps/api/.env` | 만들어 씀(gitignore 대상) | 삭제 |

---

## 8. 계획서에 대한 답

### 8.1 재라 표 — 다섯 전부

| # | 계획서의 문장 | 결과 |
|---|---|---|
| 1 | 워크트리가 *"막 받은 저장소"*의 무대가 된다. **`~/.wirebound`는 안 지워진다** | **맞다.** 워크트리는 무대가 됐고, 기계에 남는 것(`~/.wirebound`·전역 링크·MCP 등록)은 **T4 시작 전에 손으로 지웠다** — 그래서 T4 는 진짜로 빈 상태에서 시작했다(§6) |
| 2 | 브라우저가 없을 때 무엇이 보이는지 **잴 수 있다** | **잴 수 있었다** — `PLAYWRIGHT_BROWSERS_PATH`를 빈 디렉터리로 두면 사용자의 캐시를 안 건드리고 그 상태가 된다(§4.1) |
| 3 | MCP 를 **실제로 등록해 볼 수 있다** | **할 수 있었다.** Claude Code 2.1.234 에서 두 번, `✔ Connected` + 실제 도구 호출(§5.2) |
| 4 | `wireb`를 저장소 **밖에서 부르는 길**이 있다 | **있다.** `pnpm link --global`이 `private` 패키지에도 통한다(§5.1). `pnpm exec`·`--filter exec`는 **안 된다** |
| 5 | 최상위 README 와 `apps/api/README.md`를 **안 겹치게 가를 수 있다** | **갈랐다.** 겹친 것은 **기동 절차 여섯 걸음과 명령 요약 열 줄**이었고 둘 다 최상위로 **옮겼다**(가리키지만 두지 않았다). api 쪽에 남긴 것은 이 서버만의 사정 둘이다 |

### 8.2 계획서·이월의 문장 중 **틀린 것**

| 어디 | 무엇 | 오늘 값 |
|---|---|---|
| **P10-2 이월 §3.2** | *"브라우저를 넣는 명령: `node node_modules/playwright-core/cli.js install chromium`"* | **이 저장소에서 안 된다** — 루트에 그 패키지가 없다. `node apps/api/node_modules/…`가 맞다(§4.2) |
| **P10-2 이월 §3.2** | *"Chromium 이 **356MB**(전체) 또는 **196MB**(headless shell)"* | **디스크는 맞다**(196M 확인). **내려받기는 94.7 MiB 다** — 둘이 다른 값인데 한 줄로 적혀 있었다 |
| 계획서 사실 6·7·8 | `playwright-core`가 브라우저를 안 내려받는다 / `main.ts`가 인자 없이 부른다 / `.env.example`에 관련 값이 없다 | **셋 다 맞았다.** 8은 이 슬라이스가 닫았다 |
| 계획서 사실 1·2·3·5 | 최상위 README 없음 / `wireb`·`wireb-mcp` 호출법 문서 없음 / 빌드 누락 / 프록시 3001 | **넷 다 맞았다** |
| 계획서 사실 4 | 볼륨 초기화 스크립트가 처음에만 돈다 | **재지 못했다** — 이 기계의 볼륨에는 `wirebound_test`가 이미 있고, 없는 상태를 만들려면 볼륨을 지워야 한다(금지). **문서에는 남겼고 조치(`CREATE DATABASE`)는 파괴적이지 않은 쪽을 앞세웠다** |

---

## 9. 못 잰 것 (D5)

**README §10이 같은 목록을 든다.** 여기서는 왜 못 쟀는지를 적는다.

| 무엇 | 왜 |
|---|---|
| **리눅스 · Windows** | 이 기계는 macOS arm64 하나다. `packages/cli/src/paths.ts`가 **POSIX 문자열 조작만 한다**는 것은 그 파일 머리말이 스스로 적고 있다(귀속: P9 이월) |
| **컨테이너의 한글 글꼴** | 글꼴이 없는 기계를 만들 수 없었다. `fontWarning`이 서는 갈래를 **이 기계에서는 못 본다**(늘 `null`이었다). 이월 §3.2가 남긴 그대로 열려 있다 |
| **`Dockerfile`·배포** | **없다.** 지어내지 않았다 |
| **`--with-deps`** | 리눅스에서만 의미가 있다 |
| **다른 MCP 호스트** | §5.2 |
| **npm 배포** | 전부 `private` |
| **첫 설치의 내려받기 시간** | 이 기계의 pnpm 스토어가 따뜻하다 |
| **`wirebound_test`가 없는 상태** | §8.2 |

---

## 10. 게이트

**넷 다 파이프 없이 따로 돌려 종료 코드를 읽었다.**

| 게이트 | 종료 코드 | 값 |
|---|---|---|
| `pnpm test` | **0** | 파일 **273** · 케이스 **5060** · **118.02초** |
| `pnpm typecheck` | **0** | |
| `pnpm build` | **0** | |
| `pnpm test:build` | **0** | 파일 **6** · 케이스 **72** · 10.02초. **진짜 브라우저를 띄웠다** |

**앞 판(P10-2 이월 §6)이 272 파일 · 5055 케이스였다.** 늘어난 것은 이 슬라이스가 더한
파일 하나와 케이스 다섯(새 파일 넷 + census 하나)이다.

**흔들리는 api 케이스 둘(P9-4 이월 §3.1 · P10-2 이월 §3.3)은 이번 `pnpm test` 실행에서
빨강이 없었다.** 표본 하나이므로 **아무것도 단정하지 않는다** — 그 절의 두 축 관측에
한 줄을 더한다(이월 §3.3).

**돌린 뒤 남은 chromium 프로세스 0 · 남은 wirebound vitest 0.**
`pnpm test` 중 다른 저장소(ERDD)의 vitest 가 돌고 있었으나 **Postgres 를 공유하지 않는다.**
