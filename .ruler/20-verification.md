# 검증 — wirebound

공용 「검증」(`base` 스택 `05-verification.md`) 위에 wirebound 가 더하는 것이다. 같은 제목의 절은 공용 절에 **덧붙는** 항목만 적는다.

## 「통과」를 보기 전에 몇 개가 실행됐는지 확인한다 — 덧붙임

- **건너뛴(skipped) 수도 적는다.** «없으면 건너뛰는» 자는 건너뛸 전제를 **실물로** 정한다 — 경로가 있는지가 아니라 띄워 보고(`apps/api/build-test/screen-chromium.test.ts` 의 `browserLaunches`). 경로로 정하면 문서대로 세운 기계에서 대부분을 건너뛴 채 통과로 끝난다.
- **셸은 zsh 다.** 따옴표 없는 `$VAR` 는 공백에서 안 쪼개져 테스트 경로 여럿이 한 경로로 읽히고 아무것도 안 돈다 — 배열(`"${T[@]}"`)을 쓴다. 줄바꿈 목록은 `F=("${(@f)$(…)}")` 배열로 받아 `"${F[@]}"` 로 넘긴다 — 따옴표 없는 `$F` 는 한 낱말이라 도구가 «대상 파일 없음» 으로 조용히 끝난다(`oxfmt` 는 `Expected at least one target file` 을 낸다). `=` 로 시작하는 낱말은 명령 경로로 바뀌어 `echo =====` 가 명령 줄 전체를 죽인다 — 따옴표로 싼다. `${v:+-e X=$v}` 처럼 조건부로 인자 둘을 만드는 확장도 한 낱말이다 — docker 가 `-e " X=…"` 로 읽고 스모크가 대부분을 건너뛴 채 «통과»로 끝났다. `local -a args=(); [[ -n $v ]] && args=(-e "X=$v")` 로 배열을 만든다. 명령 여럿을 변수 하나에 담아 부르지 않는다(`P='docker … psql'; $P -c …` → `command not found`) — 함수로 만든다. 그 줄의 `;` 뒤 명령은 앞이 안 돌아도 돈다(재려던 조작은 안 되고 뒤의 `migrate:down` 만 돌았다). 변조 결과가 «0 사망»이면 실행 수부터 본다.
- **게이트 · 변조 스크립트는 판의 런타임을 스스로 증명한다.** `cd` 뒤 `eval "$(mise env -s zsh)"` 를 두고 첫 줄에 `node -v` 를 상태 파일에 적는다 — 런타임이 다른 판은 결과와 무관하게 버린다. 신뢰 안 된 워크트리는 `mise` 가 설정을 거절해 PATH 의 다른 Node 가 잡히고(세팅 자체는 `10-worktree.md` 「생성 직후 세팅」 의 `mise trust && mise install`), Node 22 에서는 jsdom `Blob` 판정 넷(`apps/web/test/api/http-client.test.ts` · `theme-client.test.ts`)이 빨강이다. 판의 Node 를 안 적은 판은 뒤에서 못 가른다.

## 숨은 글자를 이스케이프로 쓴 파일은 쓴 뒤 바이트로 센다

제어 · 방향 제어 · 폭 없는 글자 · 서로게이트를 `\uXXXX` 로 쓴 파일은 도구 입력 층이 날글자로 풀어 쓰는 판이 있다.

- **Why:** 정규식 리터럴 안의 날 U+2028 은 구문 오류이고, 케이스 · 문서에는 안 보이는 방향 제어 글자가 섞인다. 변조 스크립트의 찾는 글자가 날글자가 되어 맞은 수 0 으로 변조가 안 돌았다.
- **How to apply:** 커밋 전에 바뀐 파일에서 그 글자 범위를 파이썬으로 세고, 0 이 아니면 이스케이프로 되돌린다. 스크립트로 넘길 때는 `chr(92) + 'u2028'` 처럼 글자 조합으로 짓는다. 새 파일도 같다 — `heredoc` 로 쓴 새 파일도 날글자로 풀려 정규식 안의 U+2028 은 구문 오류가 된다.

## build 프로젝트에서는 `*.css?raw` 가 빈 글자다

루트 `vitest.config.ts` 의 `css.include` 는 unit 프로젝트에만 있어 `--project build` 에서 `theme.css?raw` 는 빈 글자로 읽힌다.

- **Why:** 빈 글자와 견주는 단언(`toContain(css.slice(0, 200))`)은 `toContain('')` 이 되어 늘 참이다 — system-admin build-test 가 그렇게 아무것도 안 쟀다.
- **How to apply:** build-test 에서 소스 CSS 가 필요하면 `readFileSync` 로 읽고 `length > 0` 카나리아를 함께 둔다. 빌드된 `theme.css` 는 줄인 글자라 소스와 글자로 견주지 않는다 — 토큰 기본값(`--wb-<키>: <값>;`)처럼 뜻이 같은 조각으로 잰다.

## `apps/*`·`packages/*` 바로 밑에 `tsconfig*.json` 을 새로 두지 않는다

루트 `pnpm typecheck` 는 `tsc --build --force packages/*/tsconfig*.json apps/*/tsconfig*.json` 이다 — **그 글롭에 걸리는 파일은 전부 빌드된다.**

- **Why:** 도구가 읽으려고 둔 설정(워커 로더용 tsconfig 등)이 그 이름이면 `pnpm typecheck` 가 그것까지 `tsc --build` 하고, `outDir` 이 없으면 **소스 옆에 `.js`·`.d.ts`·`.map` 을 수백 개 흘린다.** `git status` 에 뜨지만 수백 줄에 묻힌다.
- **How to apply:** 타입검사 · 빌드용이 아닌 tsconfig 는 그 글롭에 안 걸리는 이름(예: `export-worker.tsconfig.json`)으로 두고 `noEmit` 을 건다.

## 타이머로 이벤트 루프 멈춤을 잴 때는 끝에서 한 번 더 잰다

`setInterval` 은 **다음에 불릴 때** 간격을 적는다.

- **Why:** 일의 **맨 끝**에 선 멈춤은 `clearInterval` 이 먼저 와서 적히지 않는다 — 그 자리를 멈추게 하는 변조가 살아남는다.
- **How to apply:** 재는 구간이 끝나는 자리에서 마지막 간격을 한 번 더 재서 최댓값에 넣는다.

## 목 · 계측은 불린 수를 값으로 확인하고, 재는 요청이 잴 대상을 건드리지 않게 한다

목 팩토리 · 감싼 함수가 **한 번도 안 불려도** 테스트는 오류 없이 돈다 — 그 목이 세는 수는 초기값에 머물러 «0 건»이 통과로 읽힌다. 재는 요청(폴링 · 헬스 체크 · 탐침)이 잴 대상과 연결 · 캐시 · 잠금을 나눠 쓰면 잴 현상을 스스로 없앤다.

- **Why:** api 프로젝트의 `setupFiles` 가 앱 모듈 그래프를 테스트 파일보다 먼저 적재하므로 테스트 파일의 `vi.mock` 은 이미 적재된 모듈에 닿지 않는다 — 잠금 경주의 «정확 표지 0»이 그렇게 나왔다. keep-alive 로 남은 연결이 `close()` 를 붙잡는 현상은 폴링이 같은 연결을 재사용하자 닫는 중인 서버가 그 연결을 끊어 사라졌다.
- **How to apply:** api 테스트에서 모듈 목이 필요하면 `vi.resetModules()` 뒤 `helpers` 를 동적으로 다시 적재한다(지금 그 꼴을 쓰는 파일은 없다 — 옛 예는 `git show 74528d6b:apps/api/test/theme-choose-gone.test.ts` 의 `vi.resetModules()` · `await import('./helpers')`. 그 꼴로 받은 `signup` 을 픽스처로 세는 자는 `apps/api/test/user-creation-census.test.ts`). 목 · 계측을 쓴 값은 **호출 수를 함께 적고**, 계측이 가르는지 **없애야 할 것을 되살린 변조**로 한 번 센다(0 이 아니게 나와야 한다). 세는 자에는 «재는 동안 0 이면 죽는» 카나리아를 둔다 — 세는 도구가 없는 기계에서 자가 0 과 0 을 견주게 된다(`ps` 가 없는 `node:22-slim` 에서 프로세스 수가 늘 0 이라 수명 케이스가 초록이었다). 탐침은 잴 대상과 **다른 연결 · 다른 세션**으로 보낸다. 스크래치 탐침이 체크아웃의 패키지를 직접 부르면(`kysely` 등) 맨 이름 `import` 는 스크래치에서 안 풀린다 — 체크아웃의 `apps/api/node_modules/<패키지>` 절대 경로로 동적 `import` 한다. **스크래치 탐침을 테스트 글롭에 안 넣고 api 하네스로 돌리려면** 스크래치에 vitest 설정을 두고 `root` 를 체크아웃, `test.dir` 을 스크래치로, `globalSetup` · `setupFiles` 를 api 프로젝트의 것으로 준다(`resolve.alias` 는 루트 설정에서 읽어 싣는다) — 전량 게이트가 도는 중에도 그 실행이 탐침을 줍지 않는다. 고치기 **전** 값이 예상과 다르면 먼저 재는 자가 대상을 건드리는지 본다. **`waitFor` 콜백 안에 DOM 을 바꾸는 읽기(메뉴를 열고 닫는 도우미)를 두지 않는다** — 단언이 끝내 안 서면 그 변경이 관찰자를 다시 깨워 마이크로태스크가 끝없이 돌고 시간 한도도 못 와 값 없이 멈춘다. DOM 을 안 바꾸는 값(불린 수)을 기다린 뒤 한 번 읽는다(`apps/web/test/panels/menu-crud.test.tsx` 의 `sent`). `pg_stat_activity` 로 다른 연결을 기다릴 때는 `pid <> pg_backend_pid()` 를 걸고, 트리거 · 함수 안의 잠은 `query` 글자가 아니라 `wait_event = 'PgSleep'` 으로 본다(`query` 는 최상위 문장이고 자기 조회문에 걸려 늘 1 을 센다). «읽은 값으로 뒤에 행동하는» 창을 넓힐 때는 그 질의의 **응답 바이트만** 늦춘다 — 잠금으로 읽기를 막으면 스냅숏이 대기 뒤에 잡혀 창이 사라진다. COMMIT 만 느리게 하려면 `DEFERRABLE INITIALLY DEFERRED` 제약 트리거에서 `pg_sleep` 을 부른다. **이벤트로 풀리는 상태를 잴 때는 판을 세우기 전에 앞 동작의 이벤트까지 받는다** — 결과가 보이는 것(파일의 글자 · 응답 본문)은 그 동작의 콜백이 돈 것이 아니다. 늦게 온 앞 이벤트가 재려던 장치 대신 상태를 풀면 그 장치를 뗀 변조에도 초록이다(`apps/api/test/log-destination.test.ts` 의 «공간이 차면»). **`WsProbe.waitForCount` 처럼 프레임이 N 개까지 안 찼다고 던지는 기다림으로 «신호가 안 간다» 를 재지 않는다** — 그 신호를 끈 변조가 값이 아니라 시간 초과로 죽는다. 커밋 같은 앞선 사건은 DB 값으로 기다리고, 프레임 목록은 던지지 않는 짧은 기다림 뒤 `toEqual` 로 견준다(`apps/api/test/late-commit-stale.test.ts` 의 `expectStale`). **가득 찬 디스크를 `/dev/full` 로 흉내 내지 않는다** — `/dev/full` 은 0 바이트 쓰기도 ENOSPC 로 거절하지만 가득 찬 파일시스템은 0 바이트를 받고 1 바이트만 거절한다. 0 바이트로 살아 있는지 확인하는 코드는 두 판에서 다른 길로 간다(되풀이 멈춤은 tmpfs 로만 선다). tmpfs 판은 `apps/api/build-test/log-destination-full-disk.test.ts` 가 잰다(자식을 한 파일로 묶어 `docker cp` — 이미지는 받지 않고, 없으면 건너뛴다). **비멤버의 요청은 가드에서 끝나 재확인까지 못 간다** — 멤버십이 바뀌는 순간의 겹침은 가드의 멤버 조회(잠그지 않는 판) 앞에 세운다(`apps/api/test/guard-in-lock.test.ts` 의 `GUARD_MEMBERSHIP`). **가짜 시계로 재는 코드는 시계를 부를 때마다 찾게 둔다** — 기본 인자 `now = Date.now` 는 만든 순간의 진짜 함수를 쥐어, 앱을 세운 뒤 건 `vi.useFakeTimers({ toFake: ['Date'] })` 를 못 본다. `() => Date.now()` 로 둔다(`apps/api/src/auth/login-limit.ts` 의 `createLoginLimiter`). **파일 권한으로 인가하는 입구(유닉스 소켓 · 공유 디렉터리)는 서버와 클라이언트가 둘 다 자리의 주인을 본다** — 서버만 막으면 공유 `/tmp` 에서 남이 먼저 만든 자리에 클라이언트가 붙어 본문을 넘기고 가짜 답을 믿는다(`apps/api/src/auth/unlock-socket.ts` 의 `privatePlaceProblem` — Linux 비루트 둘로 잰다). **«포트를 쥐었으니 같은 것이 없다»로 자리를 지우는 장치는 HOST 가 다른 판을 센다** — 남은 파일은 지우기 전에 붙어 본다. **스크래치패드 아래에는 유닉스 소켓을 못 연다**(경로 한도 macOS 103 · Linux 107 바이트) — `os.tmpdir()` 아래에 연다. **Node http 의 `requestTimeout` 은 `connectionsCheckingInterval`(기본 30s) 주기로만 검사된다** — 한도를 그보다 짧게 두면 주기를 함께 준다. **프로세스 여럿의 메모리는 RSS 합이 아니라 cgroup `memory.current` 로 잰다**(chromium 은 페이지를 나눠 RSS 합이 세 배로 나온다). **클라이언트 주소는 이 기계의 게시 포트로 못 잰다** — Colima 가 넘긴 요청은 전부 네트워크 게이트웨이 하나로 보인다. 앞단 뒤 주소 키는 같은 compose 네트워크에 고정 주소를 준 컨테이너 둘로 잰다. **일마다 따로 서는 시계(쉬는 시간 · 만료)를 재는 케이스는 일 여럿이 같은 때 끝난다고 기대지 않는다** — 붐빌 때 두 일의 끝이 그 시간보다 벌어져 앞 것이 먼저 만료된다. 그 시계만 가짜로 둔다 — `toFake` 에 `setImmediate` 를 넣지 않는다(일 경로의 양보가 그것이면 안 풀린다 · `apps/api/test/export-worker.test.ts` «쉬는 워커»). **목록의 수로 «끝냈다»를 재면 목록에서 빼고 안 끝내는 변조가 산다** — 끝내는 호출을 함께 센다. **가짜 origin(https)에서 바깥 요청 차단을 잴 때는 서버 적중만 세지 않는다** — 브라우저가 루프백 http 하위 요청을 스스로 막아(혼합 콘텐츠 · Local Network Access) 차단을 뗀 변조에도 초록이다. 차단이 끊은 주소(`Route.abort` 를 감싼 수)를 함께 세고, **`context.route` 가 아예 안 보는 채널**(WebSocket · WebRTC STUN/TURN · WebTransport · 공유 워커 · 서비스 워커)은 채널마다 다른 127.0.0.1 포트의 리스너가 받은 연결 · UDP 바이트로 센다(`apps/api/build-test/screen-sandbox-review.test.ts`). 헤드리스 셸과 전체 Chromium 은 같은 인자에 다르게 선다 — 운영 갈래 바이너리로도 잰다. **Fastify `inject` 는 요청 경로의 점 구간(`..` · `./` · `%2e`)을 라우팅 전에 WHATWG 규칙으로 풀어 서버가 받지 않는다** — 경로 우회를 재는 케이스는 `withRealApi` 위 원시 `node:http` 요청으로 보내고, 같은 길로 정확한 이름이 200 인 카나리아를 함께 둔다(`apps/api/test/theme-packages-read.test.ts`). **`HTMLElement.prototype.addEventListener` 를 엿보면 React 가 뿌리 · portal 컨테이너에 거는 모든 이벤트(캡처 포함)가 함께 잡힌다** — 그 요소에 건 것만 `mock.contexts[i] === 요소` 로 거른다(`apps/web/test/drag/drag-debug.test.tsx` «꺼진 판»). jsdom 의 `window.addEventListener` 를 `mockImplementation` 으로 감싸 `EventTarget.prototype.addEventListener.apply(window, …)` 로 넘기면 `not a valid instance of EventTarget` 으로 던진다 — 감싸지 말고 엿보기만 한다. **호출자를 스택으로 세는 계측은 `Error.stackTraceLimit` 를 올리고 센다**(기본 10 이 테스트 프레임을 자른다) — 서버 요청 안처럼 스택에 테스트 프레임이 안 남는 자리는 값(노드 id)으로 가르고, «프레임 없음» 이 남으면 그 수를 함께 적는다.

## 스크래치패드를 `docker run -v` 로 붙이지 않는다

스크래치패드(`/private/tmp/…`)는 도커 런타임의 공유 경로가 아니다(이 기계의 런타임은 `docker context ls` 로 본다 — 지금은 Colima).

- **Why:** `-v` 로 붙이면 **오류 없이 빈 디렉터리**가 붙는다 — 탐침 스크립트가 파일을 못 찾고 출력 디렉터리가 빈 채 끝나, 아무것도 안 잰 판이 결과처럼 보인다.
- **How to apply:** 공유 경로는 런타임마다 다르니, 붙이기 전에 `docker run --rm -v <경로>:/m alpine ls /m` 가 빈 줄을 내는지 본다. 파일은 `docker create` → `docker cp` → `docker start -a` 로 넣고 뺀다. 저장소를 컨테이너에서 잴 때는 `git archive HEAD | docker run -i … tar xf -` 로 넘긴다 — 마운트가 비면 `packageManager` 를 못 읽은 corepack 이 다른 pnpm 을 받아 엉뚱한 곳에서 죽는다.

## 사람이 칠 셸 절차는 대화형 셸에 사람처럼 쳐서 잰다

`bash script.sh` 로 돌리면 사람이 칠 때 나는 일이 안 보인다.

- **Why:** README 의 비밀번호 재설정 절차가 스크립트로는 맞았는데, 대화형 셸에서는 붙여 넣은 다음 줄을 `read` 가 먹어 빈 비밀번호로 잠갔고 · 대화형 zsh 가 `#` 줄을 명령으로 읽어 구문 오류를 냈고 · Ctrl-D 에도 다음 줄이 돌아 빈 해시를 넣었다.
- **How to apply:**
  - pty 에 한 줄씩 친 판과 **통째로 붙여 넣은 판**(브래킷 · raw)을 함께 잰다. 통째로 붙여 넣은 판은 **한 번에 도착한 판**과 **조각으로 늦게 도착하는 판**(예: 16바이트/125ms)으로 나눈다 — 물음 전 입력을 시간 창으로 버리는 장치는 창 뒤에 온 줄을 답으로 먹고, 조각 경계에서 잘린 줄을 셸로 넘긴다.
  - 신호 판은 스크립트 프로세스 하나에만 보내지 말고 **전경 그룹째**(`kill -HUP -<pgid>`)로도 보낸다 — 부모(`tsx`)가 tty 를 되돌려 가리는 결함이 그룹 판에서만 보인다.
  - pty 하네스는 master 쓰기를 비차단으로 하고, 막히면 출력을 읽으며 기다린다 — 막는 쓰기는 되비춤 출력이 차는 순간 셸과 서로 기다린다. **조건을 기다리는 동안에도 master 를 읽는다** — 포트 · 헬스만 폴링하고 안 읽으면 zsh 가 명령 줄을 다 그리지 못해 명령이 안 돌고, 뒤에 보낸 줄과 함께 풀려 다른 판을 잰다. 명령이 돌기 시작했는지(서버 pid 의 부모가 그 셸인지)를 값으로 확인한다.
  - **pnpm 아래의 신호 판은 저장소 안에서 잰다** — 깔린 pnpm 판이 `packageManager` 와 다르면 바깥 pnpm 이 그 판을 자식으로 띄우고, 터미널이 닫혀도 서버에 SIGHUP 이 안 간다. 저장소 밖 빈 패키지로 만든 탐침은 받는다.
  - **기동 방식에 따라 스스로 닫히는 장치(부모 · 터미널 감시)는 부모가 먼저 끝나는 정상 기동을 전부 잰다** — `nohup … &` 뒤 셸 종료 · `disown` · 준비 대기 래퍼 · `docker exec` 래퍼 · 이중 fork · 서비스 관리자. «부모가 바뀌었다»만 보는 감시는 그 기동들에서 정상 서버를 1초 안에 껐다.
  - **터미널을 닫는 판은 신호로 흉내 내지 말고 pty master 를 닫아 잰다** — 닫힌 tty 로의 쓰기가 EIO 로 막혀, 흉내 판에서 초록인 서버가 영영 안 끝났다. 그리고 **같은 신호가 두 번 오는 것을 정상 경로로 센다** — `pnpm start` 아래에서 터미널의 Ctrl-C 하나가 node 에 두 번 닿는다(전경 그룹 + pnpm 의 되전달).
  - 값을 받는 절차는 셸 조각보다 **명령**으로 만든다 — 터미널에서 숨겨 받고, 물음 전에 와 있던 입력을 버리고, 서버와 같은 함수를 부른다(`apps/api/src/db/reset-password.ts`). 셸 조각으로 남겨야 하면 서브셸 `( … )` 하나로 묶고 `&&` 로 잇는다.

## 수를 셀 때는 두 번 세고 표본을 열어 본다 — 덧붙임

- **넷째 함정:** ④ **`\b` 는 도구마다 뜻이 다르다** — `git grep -E` 는 `\b` 를 지원하지 않아 조용히 적게 세고, `git grep -P` 는 한글을 낱말 글자로 봐 `F1이` 에서 경계가 안 서며, 파이썬 `re.ASCII` 와 node(JS) 정규식은 선다(JS 는 `u` 플래그를 줘도 ASCII 경계다). `git grep -E` 는 `\s` 도 지원하지 않아 그 식이 아무 줄에도 안 맞는다(오류 없음).
- `git grep` 이면 공백은 `-P` 나 `[[:space:]]*` 로 흡수한다.
- 단어 경계가 든 식은 `git grep -E` 로 세지 않는다(`-P` 를 쓴다). 두 방법으로 셀 때는 **경계의 뜻을 같게 맞추고**(파이썬이면 유니코드 기본값), 수가 갈리면 갈린 줄을 열어 본다.
- **문자열 속이나 주석 밖을 셀 때는 줄 머리로 주석을 거르지 말고 파서로 센다** — 템플릿 문자열 안의 CSS 주석(`/* … */`)이 줄 머리 거르개에게는 주석으로 보여 통째로 빠진다(②의 한 꼴).
- **화면 넘침은 요소 상자로만 세지 않는다** — 끊을 자리 없는 낱말은 제 요소 상자 안에 선 채 글자만 넘치고(`overflow-wrap: normal`), `overflow: hidden` 조상은 넘친 글자를 잘라 숨겨 문서 `scrollWidth` 에도 안 뜬다. 글자 노드의 `Range.getClientRects()` 오른끝으로 잰다(`apps/web/build-test/theme-system-review.test.ts` 의 `TEXT_PAST_ROOT`). 넘침을 보일 표본 낱말에는 하이픈을 넣지 않는다 — 브라우저가 하이픈 뒤에서 줄을 바꿔 넘침이 사라진다.
- **«접히지 않는다» 는 «보인다» 가 아니다** — 통지 · 알림을 숨기지 않는 설계는 접힘(`scrollHeight`)만이 아니라 **창 안에 닿는지**(`scrollIntoView` 뒤 창 안 · 실브라우저)도 잰다. 그릇이 `overflow: visible` 인 채 창을 넘으면 접힘 0 이어도 마지막 항목이 닿을 길이 없다(`apps/web/build-test/n36-notice-floor.test.ts`)
- **글자가 몇 줄인지는 글자 노드 하나의 `Range.getClientRects()` 서로 다른 `top` 수로 센다** — 요소의 `getClientRects()` 는 블록 상자 하나를 내 접힘을 0 으로 세고, 컨트롤을 품은 요소의 범위는 그 컨트롤의 상자가 섞여 거짓 두 줄을 낸다.
- **카탈로그 타입 목록은 `CATALOG_TYPES` 로 읽는다** — `@wirebound/schema` 를 Node 에서 바로 적재하면 `listComponents()` 는 `installCatalog` 를 부르기 전이라 빈 배열이고, 그 목록을 도는 탐침은 아무것도 안 재고 오류 없이 끝난다.
- **하드코딩된 개수 하한 단언(`카드 ≥ 18`)은 분모를 바꾸는 변경에서 `git grep` 으로 같이 센다** — 카탈로그 타입 수를 쓰는 build-test 가 있다(`apps/web/build-test/palette.test.ts`).
