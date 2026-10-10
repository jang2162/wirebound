# N16 — 테스트 비용 측정 보고

코드와 지침은 고치지 않았다. 이 보고가 만든 것은 이 문서와 `vitest.browser.config.ts`(B-3 — `package.json` 에 연결하지 않았다)뿐이다.
값은 **다시 재는 명령을 같은 절에** 적었다. 원본 JSON · 로그는 스크래치 `.worktrees/.coord/n16/` 에 있다.

## 읽는 법

- **다시 잼:** 코디네이터 추가 알림 구간(Colima · 사용자 DB · dev 서버를 올리던 동안)에 잰 `unit` · `web` · (`api` 앞부분) 값은 버리고 `uptime` 1분 load 가 가라앉은 뒤 네 프로젝트를 처음부터 다시 쟀다. 아래 값은 전부 다시 잰 값이다.
- **기계는 쉬어도 load 가 4~5.5 다.** 코어 15 · 다른 일이 없을 때도 `npm exec ccstatusline@latest`(Claude 상태줄) · Colima VM · 사용자 Chrome 이 CPU 를 먹는다. 측정 체인은 시작 전 load < 2.5(A) 또는 < 5.5(B~E)를 기다렸고 값 옆에 그때의 load 를 적었다. **load 가 이보다 높은 구간(B 의 전량 N=3/4 는 평균 8.9 · 11.4)의 값은 «붐비는 기계에서의 값»이다.**
- **덮개 잠듦 없음:** `pmset -g log | grep -E ' Sleep +Entering|Clamshell'` 의 마지막 줄이 측정 전의 것이다(측정 구간에 Sleep 줄이 없다).
- 시간은 ms · s. «벽시계»는 `vitest` 한 번의 실행 시간(실행 직전 · 직후 `date +%s` 의 차), «케이스 합»은 JSON `assertionResults[].duration` 의 합이다.

## A. 프로젝트별 시간 지도

재는 명령(프로젝트마다 하나씩, 겹치지 않게):

```bash
pnpm vitest run --project <unit|web|api|build> --maxWorkers=25% --reporter=default --reporter=json --outputFile.json=<경로>.json
python3 -I analyze.py <경로>.json 30     # 파일 · 케이스 합산은 JSON 의 testResults[].assertionResults[].duration
```

| 프로젝트 | 벽시계 | 시작 전 load(1분) | 파일 | 케이스 | 케이스 합 | vitest 요약(워커 합) |
|---|---:|---:|---:|---:|---:|---|
| `unit` | 10s | 2.31 | 149 | 2433 | 10.6s | transform 1.24s · setup 0 · collect 9.59s · tests 10.71s · environment 3.80s · prepare 3.43s |
| `web`(jsdom) | 83s | 2.19 | 187 | 3222 | 185.0s | transform 2.11s · setup 25.62s · collect 16.35s · tests 185.22s · environment 23.25s · prepare 4.52s |
| `api` | 308s | 2.46 | 141 | 2297(1 건너뜀) | 298.0s | transform 1.02s · setup 4.51s · collect 2.98s · tests 298.31s · environment 0 · prepare 22ms |
| `build` | 1561s | 2.34 | 92 | 727(1 건너뜀) | 1214.4s | transform 0.96s · setup 0 · collect 27.47s · tests 1532.88s · environment 0.14s · prepare 0.06s |

실행 수: `unit` 2433 통과 · `web` 3222 통과 · `api` 2296 통과 + 1 건너뜀 · `build` 726 통과 + 1 건너뜀(모두 0 실패). 케이스 합계 8679.

### 고정 비용(파일마다 드는 비용)

- **`web`:** 파일마다 `setup + environment + collect + transform` ≈ (25.6 + 23.3 + 16.4 + 2.1) ÷ 187 ≈ **0.36s CPU** — 케이스 합(185s)의 36%(워커 합이라 벽시계로는 그 몫이 4개 워커에 나뉜다). 파일 하나가 케이스 1~2개뿐인 `web` 파일은 13 개고 케이스 합이 2.4s 다(`view-state-fork-oracle` 1.4s 하나가 대부분) — 합칠 이득이 없다.
- **`web` 벽시계 83s 의 98%가 파일 하나다:** `apps/web/test/routes/viewer-readonly.test.tsx`(케이스 4 · 81.3s) — 나머지 186 파일 합이 104s 라 4 워커에 나눠도 ≈ 26s 면 끝나는데 이 파일 하나가 임계 경로다(케이스 41.3 · 13.7 · 13.3 · 12.9s — 각각 명시한 제한 300_000ms 의 14%).
- **`api`:** `singleFork` 라 벽시계 = 케이스 합 + setup(4.5s). 파일 고정 비용은 거의 없다(`collect` 3.0s).
- **`build`:** `tests`(1532.9s, 훅 포함) − 케이스 합(1214.4s) = **318.5s ≈ 벽시계의 20%** 가 훅(`beforeAll` · `afterAll`)이다. 그 중 실브라우저 판의 일회용 스택 기동 · 거둠이 `69 파일 × 3.4s ≈ 235s`(아래 B-1), 나머지 ≈ 84s 는 `packages/*` · `apps/api/build-test` 의 훅이다(**어느 훅인지는 안 쟀다 — 추정**).
- **느린 파일 30 · 느린 케이스 30** 은 문서 끝 「부록」에 있다(같은 명령).

## B. 실브라우저 판(`apps/web/build-test`, 69 파일)

### B-1. 고정 비용

재는 법(커밋하지 않는다): `apps/web/build-test/editor-stack.ts` 를 같은 디렉터리의 임시 사본(`zz-timed-stack.ts`)으로 복사해 `startEditorStack` 의 `await` 자리(`create database` · `migrate` 뒤 · `api 기동` 뒤 · `웹 기동` 뒤 · `웹 → api 프록시` 뒤 · `chromium.launch` 뒤 · 워밍 페이지 뒤)에 `performance.now()` 를 찍고, `startEditorStack` → `close()` 를 부르는 드라이버를 `apps/api/node_modules/.bin/tsx --conditions=development` 로 세 번 돌렸다. 임시 두 파일은 지웠고 `git status` 에 남지 않는다.

| 단계 | 3회(ms) |
|---|---|
| `create database` | 14 · 15 · 14 |
| 마이그레이션(사용자 둘 → `tsx` 프로세스 둘) | 615 · 618 · 629 |
| api 기동(`/health`) | 620 · 620 · 622 |
| 웹(vite dev) 기동 | 213 · 213 · 216 |
| 웹 → api 프록시 확인 | 136 · 123 · 146 |
| Chrome 띄우기 | 206 · 216 · 227 |
| 워밍 페이지(vite 첫 변환) | 980 · 993 · 1085 |
| **기동 합** | **2784 · 2799 · 2940** |
| 거두기(`close`) | 619 · 619 · 612 |

**파일마다 ≈ 3.4s(기동 2.8 + 거둠 0.6)** 다. load 5.2~6.2 에서 쟀다. 파일 시간(케이스 합)에서 차지하는 몫은 `3.4 ÷ (3.4 + 케이스 합)`:

| 대표 | 파일 | 케이스 합 | 고정 몫 |
|---|---|---:|---:|
| 가장 짧은 | `menu-reason-reach.test.ts` | 0.93s | 79% |
| 가장 짧은 | `editor-page-move.test.ts` | 1.00s | 77% |
| 중간 | `editor-recovery-races.test.ts` | 7.98s | 30% |
| 중간 | `canvas-preview.test.ts` | 8.24s | 29% |
| 가장 긴 | `view-states-review.test.ts` | 64.03s | 5% |
| 가장 긴 | `keyboard-holes.test.ts` | 72.50s | 4.5% |

재는 명령(몫): `python3 -I analyze.py build.json` 의 파일 시간(케이스 합) 열 + 위 3.4s.
전체로는 69 × 3.4 ≈ **235s** 가 직렬 `test:build` 의 실브라우저 부분이다(`build` 훅 318.5s 의 74%).

### B-2. 파일 병렬

**별도 설정 파일** `vitest.browser.config.ts`(루트, 이 브랜치에 커밋 — `package.json` 에는 안 이었다). 새 vitest 프로젝트가 아니다. `fileParallelism` · `maxWorkers` 는 루트 설정만 읽으므로 이 파일이 자기 루트다. `esbuild` · `resolve.alias` 는 루트 `vitest.config.ts` 의 `build` 프로젝트에서 읽어 온다(별칭 목록이 두 벌이 되지 않게).

```bash
# 표본 12 파일 (export-bundle 제외)
S=(apps/web/build-test/keyboard-holes.test.ts apps/web/build-test/tree-drag-review.test.ts apps/web/build-test/canvas-drop-review.test.ts apps/web/build-test/members-confirm.test.ts apps/web/build-test/multiselect.test.ts apps/web/build-test/editor-undo-before-ack.test.ts apps/web/build-test/drag-pointer-kinds.test.ts apps/web/build-test/n1-layout.test.ts apps/web/build-test/menu-realtime.test.ts apps/web/build-test/palette.test.ts apps/web/build-test/canvas-drop.test.ts apps/web/build-test/editor-post-between.test.ts)
pnpm vitest run -c vitest.browser.config.ts --maxWorkers=<N> --reporter=default --reporter=json --outputFile.json=<경로>.json "${S[@]}"
# 전량(export-bundle 제외)
pnpm vitest run -c vitest.browser.config.ts --maxWorkers=<N> --exclude apps/web/build-test/export-bundle.test.ts
```

| 실행 | N | 벽시계 | 실행 파일 · 케이스 | 실패 | 실행 중 load 1분 평균 · 최대 | 케이스 합 | 직렬 대비 |
|---|---:|---:|---|---:|---|---:|---:|
| 표본 12 | 1 | 502s | 12 · 177 | 0 | 4.84 · 8.19 | 452.3s | 1.00× |
| 표본 12 | 2 | 259s | 12 · 177 | 0 | 5.48 · 7.45 | 461.8s | 1.94× |
| 표본 12 | 3 | 183s | 12 · 177 | 0 | 6.31 · 7.20 | 476.2s | 2.74× |
| **전량 68 파일** | 3 | **575s** | 68 · 516 | **0** | 8.90 · 13.37 | — | ≈ 2.4× |
| **전량 68 파일** | 4 | **449s** | 68 · 516 | **0** | 11.44 · 16.89 | — | ≈ 3.1× |
| `export-bundle` 혼자 | 1 | 8s | 1 · 6 | 0 | 6.29 | — | — |

- **전량의 «직렬 기준»** 은 측정한 직렬 실행이 아니라 A 의 `build.json` 에서 낸 추정이다: `68 파일 합 1143.9s + 68 × 3.4s ≈ 1375s`(`apps/web/build-test` 에서 `export-bundle` 을 뺀 파일 시간 합 + B-1 의 고정 비용). 직렬을 같은 방식으로 한 번 더 돌려 확인하지 않았다 — 비율은 «≈»다.
- **실패 0** — 표본 3 판 · 전량 2 판 모두. 그래서 «실패가 났으면 혼자 다시 돌린 값과 비교»할 대상이 없다. 대신 **케이스별 느려짐**을 N=1 대비로 봤다(500ms 이상 케이스): 중앙값 N=2 ×1.03 · N=3 ×1.06, 최대 ×1.34(`menu-realtime` «복원 — bob 의 트리가 곧바로 되돌아가고 복원 배너는 남는다» 870 → 1164ms). **케이스 시간은 거의 안 늘고 파일 수만큼 겹쳐 돈다** — 시간 상한 단언이 있는 케이스가 이 표본에 없다는 뜻이기도 하다.
- 전량 N=3/4 의 load(평균 8.9 · 11.4, 최대 13.4 · 16.9)는 코어 15 에 가깝거나 넘는다. 이 붐빔에서도 0 실패였지만 **한 판씩이다**(아래 「못 잰 것」).
- **같은 `dist` 를 쓰는 파일은 하나뿐이다.** 센 방법 둘이 같다:
  - `git grep -lE "build:runtime|tsdown|vite build" -- 'apps/web/build-test/*.test.ts'` → `export-bundle.test.ts`(제 `beforeAll` 에서 `pnpm --filter @wirebound/exporter build:runtime` — `packages/exporter/dist/runtime.js` 를 덮는다).
  - 파이썬(`re.search("build:runtime|tsdown|vite\\s+build|rmSync\\(|writeFileSync\\(")`)은 위에 더해 `theme-system` · `theme-system-review` · `theme-prop-marks` · `label-bidi` 를 냈다 — **전부 `mkdtemp` 으로 만든 임시 디렉터리를 쓰고 지운다**(`for (const dir of unpacked) rmSync(dir …)` — 읽는 `system-themes/*/dist/*.wbtheme` 는 읽기만 한다). 두 방법의 갈림은 그 넷이고 열어 보고 정리했다.
  - `stack-leftovers.test.ts` 는 `ps -A -o pgid=,stat=` 로 남은 프로세스 그룹을 센다, 전량 N=3/4 에서 통과했다.
- **`export-bundle` 은 병렬 표에서 뺀다.** 혼자 8s(6 케이스).
- **B-3:** `vitest.browser.config.ts` 를 커밋했다(머리말에 쓰는 법 · `export-bundle` 을 `--exclude` 로 빼는 이유). `package.json` · `vitest.config.ts` 는 그대로다. **이 설정을 `pnpm test:build` 와 겹쳐 연결하려면 `build` 프로젝트에서 `apps/web/build-test` 를 빼야 한다**(안 빼면 같은 파일이 두 번 돈다) — 연결은 코디네이터의 판단이다.

## C. api 샤드

```bash
# 샤드마다 테스트 DB 를 같은 컨테이너에 만든다
docker compose exec -T postgres psql -U wirebound -d postgres -Atc "create database wb_n16measu_test_<i>"
# 셋을 동시에(셸의 TEST_DATABASE_URL 이 .env 를 이긴다)
for i in 1 2 3; do TEST_DATABASE_URL=postgres://wirebound:wirebound@127.0.0.1:5519/wb_n16measu_test_$i pnpm vitest run --project api --maxWorkers=25% --shard=$i/3 &; done; wait
```

| | 벽시계 | 파일 · 케이스 | 실패 | 가장 긴 파일 |
|---|---:|---|---:|---|
| 한 줄(A) | 308s | 141 · 2297 | 0 | `restore-lock-census` 45.3s |
| 샤드 1/3 | 79s | 47 · 724(1 건너뜀) | 0 | `export-abort-slot` 13.5s |
| 샤드 2/3 | **178s** | 47 · 765 | 0 | `restore-lock-census` 46.3s · `guard-in-lock` 22.1s · `late-commit-watch` 17.2s |
| 샤드 3/3 | 86s | 47 · 808 | 0 | `permission-matrix` 10.7s |
| **셋 동시** | **179s**(가장 느린 샤드) | 141 · 2297 | **0** | load 1분 평균 5.75 · 최대 7.00 |

- **샤드마다 제 DB 에서 `global-setup` 이 돈다:** `latest → none → latest` 를 샤드의 DB(`…_test_<i>`)에서 따로 돌고(각 DB 가 비어 있었다) 실패가 없었다. 마이그레이션 · 시딩이 샤드 사이에서 겹치지 않는다.
- **깨진 파일 0** — «DB 를 공유한다고 가정한 케이스»는 이 한 판에서 안 나왔다. 샤드가 파일을 `--shard=i/3` 로 나누는 방식이라(파일 단위) 한 샤드 안에서는 지금처럼 `singleFork` 로 돈다.
- **불균형이 벽시계를 정한다.** 샤드 2 가 178s 인 것은 느린 파일 셋(`restore-lock-census` · `guard-in-lock` · `late-commit-watch`)이 한 샤드에 몰렸기 때문이다. 시간으로 균형을 맞추면 이론값은 `308 ÷ 3 ≈ 103s` 에 가깝지만 **그 샤딩은 안 재봤다**(`--shard` 는 파일 경로로 나누므로 시간 균형 샤딩은 vitest 밖의 도구가 파일 목록을 나눠 줘야 한다).
- **구조적 경주가 하나 있다 — 이 한 판에서는 안 터졌다:** 샤드마다 `global-setup` 이 **같은** `system-themes/*/dist` 를 지웠다 다시 짓고(`rmSync(dist)` → `buildTheme`) 같은 `packages/exporter/dist/runtime.js` 를 다시 짓는다(샤드 로그: «시스템 테마 5 개 빌드 188–190ms · 내보내기 런타임 빌드 847–867ms»). 한 샤드가 빌드하는 동안 다른 샤드의 `buildApp` 시딩이 `dist` 를 읽으면 `ENOENT` 가 날 수 있다. 연결한다면 «빌드는 샤드 밖에서 한 번 · 샤드의 `globalSetup` 은 마이그레이션만»이 필요하다. 이 한 판은 그 수의 시간 창이 좁아(~1s) 통과했을 뿐이다.
- **DB 수 · 컨테이너 부하:** 샤드 셋이 한 Postgres 컨테이너를 쓴다. 다른 워크트리와 동시에 돌리지 않았다.

## D. 줄일 후보 목록(지우지 않는다)

센 수는 두 번 셌다(`grep -E`/`git grep` 와 파이썬 — 아래 각 항목에 방법).

### D1. `apps/web/test`(jsdom) 와 `apps/web/build-test`(실브라우저)의 겹치는 쌍

`apps/web/build-test` 파일 34 개가 jsdom 쪽에 이름이 겹치는 짝을 갖는다(`basename` 낱말 겹침). 그 중 **이름이 같은 13 쌍의 케이스 제목을 대조**했고(나머지 21 은 «못 잰 것»), **같은 성질을 재는 것으로 보이는(제목 낱말 자카드 ≥ 0.3) 케이스 쌍은 아래 일곱 행**이다. 나머지 이름 겹침은 jsdom 에 레이아웃 · 포커스 · 연결 순서가 없어 **다른 성질**을 잰다(`CLAUDE.md` 「jsdom 값은 실브라우저 값이 아니다」). 재는 명령: A 의 두 JSON(`web.json` · `build.json`)에서 파일 쌍마다 케이스 제목의 낱말 집합 자카드를 계산(스크래치 `n16/` 의 파이썬 한 장).

| 실브라우저(`build-test`) | jsdom(`test`) | 자카드 | 지우면 잃는 성질(한 줄) |
|---|---|---:|---|
| `editor-undo-before-ack` «누른 때의 마지막 편집이 ack 없이 큐를 떠나면 앞 편집을 되돌리지 않는다 — 앞 편집의 ack 가 맨 위를 바꿔 놓은 채 리베이스가 마지막 편집을 버린 판» 11.4s | `edit/undo-before-ack` «마지막 편집이 ack 아닌 길로 떠나면 앞 편집의 ack 가 맨 위를 바꿔 놓아도 앞 편집을 되돌리지 않는다» 55ms | 0.80 | WS(ack)와 REST 응답 두 연결의 **실제 도착 순서**(앞섬 ms) — jsdom 의 가짜 api 는 순서가 늘 보내는 순서다 |
| `editor-undo-before-ack` «키보드 Cmd+Z 와 머리 «되돌리기» 단추를 함께 눌러도 한 단계만 나간다 — 페이지가 비지 않는다» 4.1s | 같은 파일 «키보드와 머리 단추를 함께 눌러도 한 단계만 나간다» 49ms | 0.40 | 실제 키보드 · 포커스 · 클릭 차례 |
| `canvas-iframe` «내용이 자라면 iframe 이 따라 자란다 — 안쪽 세로 스크롤이 없다» 0.57s | `canvas/canvas-iframe` «내용이 자라면 iframe 이 따라 자란다» 5ms | 0.80 | iframe 의 실제 레이아웃 높이(jsdom 은 레이아웃이 없다). 실브라우저 쪽이 0.57s 라 줄일 이득이 작다 |
| `tree-fold` «캔버스에서 접힌 줄 안의 노드를 누르면 그 조상이 펴지고 그 줄이 고른 줄이다» 0.55s | `panels/tree-fold` «캔버스에서 접힌 줄 안의 노드를 고르면 그 조상이 펴진다» 69ms | 0.38 | iframe 안 실제 누름 → 호스트 상태 |
| `menu-realtime` «열린 페이지 — alice 가 지우면 캔버스가 «대상을 찾을 수 없습니다»로 간다(ms)» 0.83s | `panels/menu-realtime` «캔버스가 서버에 묻고, 서버에도 없으면 «대상을 찾을 수 없습니다»로 간다» 32ms | 0.33 | 지움 신호가 닿는 **실제 시간**(ms)과 캔버스 iframe 의 표시 |
| `menu-realtime` «내 쓰기 · 늦은 신호 — 트리를 한 번만 받는다 · 앞섬(ms)» 3.9s | `panels/menu-realtime` «다시 붙으면 트리를 한 번 다시 받는다 — 끊긴 동안의 신호는 다시 안 온다» 28ms | 0.40 | 두 연결(WS · REST)의 **도착 앞섬** — 제목이 같은 성질이 아니라 이웃 성질일 수 있다 |
| `editor-restore-own-signal` «다시 붙은 소켓이 내 복원의 신호를 받아도 남의 복원 배너가 서지 않는다» 2.8s(+ 스택 3.4s) | `store/restore-own-signal` «답을 잃은 복원의 신호를 «반영됐다»로 읽지 않는다» 0ms | 0.43 | 실제 소켓 재연결(`startCutProxy`) 뒤의 신호 |

그 밖에 이름이 같은 쌍(`canvas-preview` · `canvas-drop` · `menu-cascade-delete` · `node-alias` · `layout-guides` · `multiselect` · `clipboard`)은 제목 겹침이 0.3 미만이다 — 실브라우저는 `elementFromPoint` · 레이아웃 · 포커스 · 연결 순서를, jsdom 은 로직을 잰다. **권장하지 않는다.** 가장 큰 `editor-undo-before-ack`(33.8s)는 케이스를 지우는 것이 아니라 그 안의 기다림(`DELAYMS * 3~8`, D4)을 줄이는 쪽이다.

### D2. 제목이 정확히 같은 케이스

- 재는 명령: `build.json` 등 네 JSON 의 `assertionResults[].title` 을 합쳐 두 파일 이상에 나오는 제목을 센다(파이썬) — 전체 케이스 8679 · 서로 다른 제목 8409 · **둘 이상의 파일에 나오는 제목 77 개(200 케이스 · 케이스 시간 합 9.1s)**.
- 시간이 큰 것: «폭 360/1280/390 — 확정이 묻던 자리에서 단추 한 높이 이상 떨어져 선다(거리)» 셋이 `members-confirm` · `tokens-confirm` 두 파일에 같은 제목으로 있다(각 1.46–1.55s 합). 같은 파일 쌍에 «폭 390/1280/360 — 연타 · 따로 두 번이 어느 점에서도 안 지운다 / 안 뺀다» 가 있다(각 11–15s — 제목이 «지운다»/«뺀다»로 달라 정확히 같은 제목은 아니다). **같은 몸짓을 서로 다른 UI(토큰 · 멤버)에 재는 것이라 지우면 그 UI 의 확인 단추 배치를 잃는다** — 줄이려면 공통 도우미로 합치되 지우지 않는다.
- 나머지 대부분은 일반 문장(«editor는 403이다» 5 · «비멤버는 404다» 4 · «Escape로 닫힌다» 3 …)이라 파일마다 다른 대상이고, **«훑을 소스를 실제로 읽는다»(15 파일 · 1.57s)는 `CLAUDE.md` 가 말하는 카나리아다 — 지우면 빈 소스를 훑어 거짓 초록이 된다.**

### D3. 케이스 1~2개인데 고정 비용이 큰 파일(합칠 수 있는지)

- 센 방법: `build.json` 에서 `apps/web/build-test` 이고 `assertionResults.length ≤ 2` → **11 개**(케이스 시간 합 25.3s, 고정 비용 11 × 3.4 ≈ **37s**).
- 가장 고정 몫이 큰 것: `menu-reason-reach`(0.93s) · `editor-page-move`(1.00s) · `theme-admin`(1.67s) · `editor-export-open-edits`(1.78s) · `clipboard`(1.82s) · `editor-down-delay`(2.09s) · `theme-settings`(2.28s) · `editor-restore-unanswered`(2.59s) · `editor-restore-own-signal`(2.79s) · `editor-marker-diverged`(3.70s) · `editor-banner-reload`(4.62s).
- **같은 영역끼리 합칠 수 있어 보이는 것:** `editor-restore-own-signal` + `editor-restore-unanswered` → `editor-restore-signal-order`(스택 · 판 만들기가 같다). **지우면 잃는 것은 없지만** 합치면 한 스택에서 이전 케이스의 상태가 새는지 봐야 한다(`CLAUDE.md` 「혼자 안 죽는 케이스가 늘 지울 것은 아니다」 — 파일을 나눈 것이 케이스끼리 상태를 막는 격벽일 수 있다). **병렬(B-2)로 가면 이 이득은 N 으로 나뉘어 작아진다** — 우선순위가 낮다.
- `web`(jsdom)의 ≤2 케이스 파일은 13 개(케이스 합 2.4s)고 대부분 짧다 — 합칠 이득이 없다.
- **임계 경로가 하나인 파일은 합치기의 반대다:** `viewer-readonly.test.tsx` 는 케이스 4 개가 파일 하나에 있어 `web` 벽시계의 98%(81s)가 이 파일이다. **네 파일로 쪼개면** 케이스가 병렬로 돈다(제안 순위 3).

### D4. `sleep` · 고정 대기가 든 케이스

**두 가지를 셌다. 둘 다 정적 합이다 — 반복문 안의 호출은 배수가 안 곱해졌고, 안 도는 갈래도 센다.**

```bash
python3 -I d4.py   # git ls-files 의 테스트 파일에서 waitForTimeout(<숫자>) · setTimeout(...,<숫자>) · sleep|delay|wait|pause|nap|settle(<숫자>) 의 숫자를 합산
git grep -cE 'waitForTimeout\(' -- apps packages system-themes     # 파일별 호출 수(두 번째 방법)
```

- **`waitForTimeout(<숫자 리터럴>)`:** 39 파일 · **245 호출 · 합 131.6s** — 전부 `apps/web/build-test`. 상위: `editor-restore-signal-order` 14.5s(12 호출) · `multiselect` 14.1s(21) · `canvas-drop-review` 14.0s(22) · `tree-drag-review` 13.3s(29) · `palette-review` 11.8s(25) · `palette` 8.1s(15) · `view-states-editor` 5.4s(9) · `n1-layout` 5.3s(11). 숫자가 아닌 인자(`BEYONDWAITMS` · `DELAYMS * 4` · `TWOCLICKGAPMS` · `dwell` …)를 쓰는 호출이 파일 6 개에 13 개 더 있다(합 안 셈).
- **그 밖의 고정 대기(`setTimeout(r, N)` · `sleep(N)` 꼴) 238 곳 · 합 58.9s:** `apps/web/build-test` 39.3s(`keyboard-holes` 9.8s · `editor-shortcuts-review` 7.1s · `editor-shortcuts-review-2` 6.8s · `editor-post-between` 6.0s) · `apps/api/test` 14.9s(`guard-in-lock` 4.1s · `login-unlock` 2.5s · `export-abort-slot` 1.5s) · `apps/api/build-test` 3.7s · `apps/web/test` 1.0s. `pg_sleep` 은 api 테스트 7 파일(`db-connection-loss` 4 · `snapshot-capture` 3 · `edit-lost-commit` 2 · `menu-changed` 2 …)의 느린 COMMIT 흉내다.
- **`apps/web/build-test` 의 고정 대기 ≈ 131.6 + 39.3 ≈ 171s ≈ 케이스 합(1144s)의 15%.** 상위 일곱 파일(`editor-restore-signal-order` · `multiselect` · `canvas-drop-review` · `tree-drag-review` · `palette-review` · `keyboard-holes` · `palette`)이 그 절반 넘게다.
- **지우면 잃는 성질:** 대부분 **«아무 일도 안 일어난다»를 보이는 음성 대기**(떠난 뒤 통지가 안 선다 · 두 번 누름이 안 지운다 · 한도 뒤에야 배너가 선다 — `BEYONDWAITMS`)다. 대기를 줄이면 거짓 초록이 가능한 성질이다. **상태 폴링으로 바꿀 수 있는 것은 «양성 대기»**(무언가가 서길 기다리는 `waitForTimeout`)뿐이다 — 어느 호출이 양성인지는 호출마다 열어 봐야 하고 이 트랙이 분류하지 않았다(못 잰 것).

## E. 시간 상한 케이스

각 케이스를 **혼자 세 번**(다른 일 없이, 시작 전 load 4.0–5.2) 돌렸다. 재는 명령은 케이스마다:

```bash
pnpm vitest run --project api apps/api/test/ws-lock-cost.test.ts          # 출력의 `BEATS {...}` · `EDITS {...}` 줄(테스트가 찍는다)
pnpm vitest run --project api apps/api/test/edit-lost-commit.test.ts      # 한도 · elapsed 는 아래 «계측»
pnpm vitest run --project web apps/web/test/lock/one-verdict.test.ts
pnpm vitest run --project build apps/api/build-test/screen-chromium.test.ts   # peak 는 아래 «계측»
pnpm vitest run -c vitest.browser.config.ts --maxWorkers=1 apps/web/build-test/canvas-drop-below.test.ts
```

| 케이스 | 3 판 값 | 한도 | 최대 ÷ 한도 |
|---|---|---|---:|
| `ws-lock-cost` 하트비트 p50 | 2.63 · 2.32 · 2.56ms | 200ms(`HEARTBEAT_LIMIT_MS`) | 1.3% |
| `ws-lock-cost` 하트비트 max | 3.69 · 2.74 · 2.71ms | 2000ms(`HEARTBEAT_WORST_LIMIT_MS`) | 0.18% |
| `ws-lock-cost` 루프 멈춤 | 1.74 · 2.02 · 2.06ms | 1000ms(`LOOP_STALL_LIMIT_MS`) | 0.21% |
| `ws-lock-cost` 남의 편집 p50 | 81.0 · 77.7 · 77.7ms | 1000ms(`EDIT_LIMIT_MS`) | 8.1% |
| `ws-lock-cost` 남의 편집 max | 92.2 · 84.6 · **310.1**ms | 5000ms(`EDIT_WORST_LIMIT_MS`) | 6.2% |
| `edit-lost-commit` 확인 · 503 «모름»까지(세 자리 · 각 3 판 중 최대) | 1008–1015ms | 1500ms(`LOST_COMMIT_PROBE_MS` 1000 + 500) | **67.7%** |
| `one-verdict` 가장 긴 케이스 | 1507 · 1660 · 1568ms | 60 000ms(`describe` 의 `timeout`) | 2.8% |
| `screen-chromium` 최고 프로세스 수(`peak`) | 5 · 5 · 5(둘째 케이스 `적게`/`많이` 모두 5) | `적게.peak + 2` = 7 | **71%**(수, 시간이 아니다) |
| `canvas-drop-below` 가장 긴 케이스 | 2417 · 2489 · 2452ms | 케이스 시간의 한도 300 000ms · `poll` 기본 10 000ms | 0.8% · 24.9% |

- **계측(커밋하지 않았다):** `edit-lost-commit.test.ts` 의 `expect(elapsed).toBeLessThan(PROBE_LIMIT_MS)` 앞 세 곳 · `screen-chromium.test.ts` 의 `peak` 단언 앞에 `console.log` 를 심어 세 번씩 돌린 뒤 **백업과 바이트 비교(`cmp`)로 복원**했고 `git status` 로 확인했다.
- **`edit-lost-commit` 은 한도의 2/3 에서 이미 선다:** 확인의 한도(`LOST_COMMIT_PROBE_MS` = 1000)가 케이스의 «경과»가 되므로 **경과 ≈ 1008–1015ms · 한도 1500ms — 여유가 485ms**다. 이 여유는 붐빔에서 가장 먼저 줄어드는 몫이다(load 가 높으면 한도를 넘긴 뒤 연결을 버리는 데 드는 시간이 얹힌다). 다른 케이스(ws-lock-cost 6–8%)는 한도의 한 자리 퍼센트라 솔로에서는 안전하고, 거짓 빨강은 부하(load 11 이상)에서만 나는 쪽이다 — **그 부하 값은 이 트랙이 재지 않았다.**
- **A 에서 «제 한도의 절반 넘게 걸린» 케이스:** 프로젝트 기본 한도(`web` 5s · `api` 20s · `build` 300s) 기준으로 `web` 4 · `api` 3 이 절반을 넘었으나 **전부 케이스 · `describe` 에 명시한 한도가 있다** — `viewer-readonly` 4 케이스 41.3/13.7/13.3/12.9s ÷ 300 s = 14% · `restore-lock-census` 22.1s ÷ 300s = 7% · `late-commit-watch` 14.6s ÷ 60s = 24% · `export-abort-slot` 13.4s ÷ 120s = 11%. **명시한 한도 기준으로 절반을 넘은 케이스는 0** 이다. `unit` · `build` 는 기본 한도의 절반을 넘은 케이스가 없다. 재는 명령: `analyze.py` 의 느린 케이스 목록 + `grep -nE "[0-9]{2,3}_000" <파일>`.
- **`ws-lock-cost` 의 부하 값(동시 샤드 중):** 샤드 2 의 한 판 — 하트비트 p50 3.45ms · max 4.11ms · 루프 멈춤 1.78ms · 남의 편집 p50 79.7ms · max 97.2ms(load 평균 5.75). 한도의 8% 이내다.

## 제안 순위 — 절약 시간 ÷ 위험

(코디네이터가 정한다 — 아래는 이 트랙이 잰 값으로 매긴 순서다.)

| 순위 | 제안 | 절약(측정) | 위험 | 근거 |
|---:|---|---|---|---|
| 1 | **실브라우저 판 파일 병렬(`vitest.browser.config.ts`, N=3)** | 직렬 ≈ 1375s → **575s**(≈ −800s, 추정 기준) · N=4 는 449s | 낮음~중간 — 표본 3 판 + 전량 2 판 **0 실패**, 케이스 느려짐 중앙값 ×1.03–1.06. 한 번씩이라 붐비는 날의 시간 상한 케이스는 못 쟀다 | 위 B-2 |
| 2 | **`viewer-readonly.test.tsx` 의 네 케이스를 네 파일로** | `web` 벽시계 83s → ≈ 41s(가장 긴 케이스) 근처(≈ −40s, 추정) | 매우 낮음 — 케이스를 지우지 않는다. 공통 도우미(`sweepEditor`)를 모듈로 빼야 한다 | 위 A · D3 |
| 3 | **api 샤드 3(`TEST_DATABASE_URL` 샤드별)** | 308s → **179s**(−129s). 시간 균형 샤딩이면 더(안 재봄) | 중간 — 샤드마다 DB · `global-setup` 의 `dist` 재빌드 경주(위 C). 빌드를 샤드 밖 한 번으로 빼야 안전 | 위 C |
| 4 | **일회용 DB 를 템플릿 DB 로** (`create database … template`, 마이그레이션 1회) | 파일마다 마이그레이션 0.62s × 69 ≈ **−43s**(직렬) | 낮음~중간 — 안 재봤다(산술) | 위 B-1 |
| 5 | **고정 대기를 상태 폴링으로**(양성 대기만) | 정적 합 171s 중 일부 — **안 재봤다** | 중간~높음 — 음성 대기를 줄이면 거짓 초록 | 위 D4 |
| 6 | 케이스 1~2개 파일을 영역별로 합치기 | 직렬 ≤ 37s, 병렬이면 N 으로 나뉘어 작다 | 중간 — 격벽 | 위 D3 |
| — | jsdom ↔ 실브라우저 쌍 · 제목이 같은 케이스 지우기 | 작다 | 높음 — 다른 성질을 잰다 | 위 D1 · D2 |

**지우지 말 것:** 위 D1 의 다섯 쌍과 D2 의 «훑을 소스를 실제로 읽는다» 카나리아.

## 측정으로 닫힌 것 / 못 잰 것

**닫힌 것(값이 있다)**
- 프로젝트별 벽시계 · 파일 · 케이스 · 고정 비용(A) — 네 프로젝트 모두 알림 구간을 피해 다시 잼.
- 실브라우저 스택 기동 2.8s · 거둠 0.6s(파일마다 3.4s) — 단계별 값(B-1).
- 병렬 N=1·2·3(표본)과 N=3·4(전량): 모두 0 실패(B-2). `export-bundle` 만 `dist` 를 덮는다(센 방법 둘이 같다).
- api 샤드 3 동시: 0 실패 · 벽시계 179s(C). `global-setup` 이 샤드의 DB 에서 도는 것 확인.
- 시간 상한 케이스 다섯의 솔로 값 · 한도 · 비율(E). 거짓 빨강의 근접 후보는 `edit-lost-commit`(67.7%)와 `screen-chromium` 프로세스 수(71%)다.

**못 잰 것**
- **붐비는 기계에서의 거짓 빨강:** E 는 솔로(load 4–5)에서만 잰 값이다. 거짓 빨강이 나는 load(≥ 11 · 코어 15)에서의 값은 재지 않았다. 전량 N=4 평균 load 11.4 에서도 0 실패였으나 그 판에는 시간 상한 케이스가 `ws-lock-cost` 처럼 안 들어 있다(실브라우저 판만).
- **전량 병렬의 반복:** 전량 N=3 · N=4 는 각 한 판이다. 흔들림(같은 설정의 두 번째 판)은 안 쟀다.
- **직렬의 전량 기준값:** 68 파일의 직렬 시간을 같은 방식으로 다시 재지 않았다(추정: 파일 시간 합 + 3.4s × 파일 수).
- **api 시간 균형 샤딩 · `global-setup` 의 `dist` 경주의 재현**(한 판은 통과했다). 샤드 수 N ≠ 3.
- **`waitForTimeout` 의 양성/음성 분류 · 상태 폴링으로 바꿨을 때의 절약.**
- **D1 의 이름이 겹치는 나머지 21 파일**(낱말 겹침만 있고 이름이 다른 쌍 — 예 `palette-review` ↔ `palette-cards`)의 케이스 제목 대조.
- **병렬 두 워크트리가 한 Postgres 컨테이너에서 겹칠 때**(이 워크트리는 자기 컨테이너 하나만 썼다).
- **첫 `n3` 실행:** 표본 N=3 의 첫 실행이 `exit 143`(SIGTERM)으로 68s 에 끝났다 — 원인을 모른다(외부에서 온 신호로 보인다. 이 세션의 어느 명령도 그 시각에 `kill` 을 보내지 않았다). 그 판의 값은 쓰지 않고 `n3b` 로 **다시 재** 위 표에 넣었다. 남은 `wb_browser_*` DB 셋은 지웠다.

## 환경 메모(코디네이터가 알아야 할 것)

- 세션 시작 때 **Colima 가 «instance already running» 이면서 SSH 가 거절**하는 반쯤 죽은 상태였다. 나는 `colima stop -f` → `colima start` 로 살렸다(기계가 다시 켜진 뒤였다). 그때 **사용자 DB 컨테이너 `wirebound-postgres-1`(5433)이 `Exited (255)` 로 보였다** — 코디네이터가 알림대로 다시 올렸다. 나는 최상위 컨테이너 · 5433 · 3001 · 5173 · 다른 워크트리를 건드리지 않았다.
- 이 워크트리의 Postgres(5519)는 측정 뒤 `docker compose down` 으로 내린다(볼륨 `feat-n16-measure_wirebound-pgdata` 는 지우지 않았다 — 워크트리 폐기 때 코디네이터가 지운다).
- `docs/guideline` 에 고칠 것을 하나 발견했다: **`CLAUDE.md` 의 «`pnpm test:build` 는 build 프로젝트가 파일을 차례로 돌리므로…»** 문단은 `apps/web/build-test` 가 `dist` 를 안 읽는다고 이미 적고 있다. B-2 의 값(전량 병렬 0 실패)이 그 문단의 뒷받침이 되므로 연결을 정한다면 `README.md` 「게이트 — 무엇을 돌려 확인하나」 절의 «트랙 게이트» 표에 «실브라우저 판은 `vitest.browser.config.ts` 로 N=3 병렬»의 한 줄을 넣는다(판단은 코디네이터).

## 부록 — 느린 파일 30 · 느린 케이스 30

재는 명령은 위 A 절 그대로다(`analyze.py` 가 `JSON.testResults[].endTime - startTime` 으로 파일 시간을, `assertionResults[].duration` 으로 케이스 시간을 낸다).

### unit — 느린 파일 30 (파일 시간 ms · 케이스 수)

| ms | 케이스 | 파일 |
|---:|---:|---|
| 1168 | 10 | `packages/themes/test/wbtheme-reader-divergence.test.ts` |
| 1078 | 9 | `packages/theme-kit/test/check.test.ts` |
| 1069 | 37 | `packages/exporter/test/runtime-bundle.test.ts` |
| 1056 | 1 | `packages/schema/test/lock-selection-oracle.test.ts` |
| 900 | 1 | `packages/schema/test/view-state-fork-random.test.ts` |
| 705 | 15 | `packages/schema/test/lock-ops-identity.test.ts` |
| 407 | 19 | `packages/themes/test/wbtheme.test.ts` |
| 372 | 4 | `packages/schema/test/patch/equivalence.property.test.ts` |
| 350 | 60 | `packages/schema/test/view-state-ops.test.ts` |
| 198 | 13 | `packages/exporter/test/bundle-theme.test.tsx` |
| 185 | 8 | `packages/exporter/test/bundle-view-states.test.ts` |
| 174 | 3 | `packages/exporter/test/bundle-parity.test.tsx` |
| 159 | 8 | `packages/theme-gallery/test/gallery.test.tsx` |
| 146 | 6 | `packages/cli/test/assembly-census.test.ts` |
| 144 | 6 | `packages/theme-kit/test/build.test.ts` |
| 140 | 8 | `packages/cli/test/io-boundary.test.ts` |
| 131 | 7 | `packages/renderer/test/contract-attrs.test.ts` |
| 126 | 43 | `packages/exporter/test/parity.test.tsx` |
| 123 | 9 | `packages/cli/test/client-kind.test.ts` |
| 119 | 62 | `packages/exporter/test/escape.test.ts` |
| 113 | 8 | `packages/mcp/test/assembly-census.test.ts` |
| 101 | 44 | `packages/exporter/test/bundle.test.tsx` |
| 93 | 20 | `packages/exporter/test/runtime-sentences.test.ts` |
| 93 | 36 | `packages/schema/test/view-state-guard.test.ts` |
| 84 | 6 | `packages/mcp/test/io-boundary.test.ts` |
| 83 | 80 | `packages/renderer/test/prop-marks.test.tsx` |
| 82 | 5 | `packages/exporter/test/bundle-size.test.ts` |
| 71 | 7 | `packages/exporter/test/browser-mount.test.tsx` |
| 71 | 17 | `system-themes/saas-marketing/test/saas-marketing.test.ts` |
| 66 | 44 | `packages/schema/test/alias-chars.test.ts` |

### unit — 느린 케이스 30

| ms | 파일 | 케이스 |
|---:|---|---|
| 1161 | `wbtheme-reader-divergence.test.ts` | deflate 항목의 원래 크기를 작게 적은 zip 이 읽기를 오래 쥐지 않는다 — 적힌 크기를 넘는 순간 멈춘다 |
| 1056 | `lock-selection-oracle.test.ts` | 무작위 트리 × 무작위 잠금 4000 판에서 노드마다 같은 잠금을 낸다 |
| 900 | `view-state-fork-random.test.ts` | 기본 가지 = 깊은 복사 · 검증 오류 0 · 역연산 왕복 · 새 가지 = 바로 낸 편집 — 6000 시드 |
| 705 | `lock-ops-identity.test.ts` | 적용이 성공하는 무작위 묶음에서 판정이 «건드림»과 한 판도 안 갈린다 — 번호 꼴 · op 넷 · 묶음 · 잠금 둘 |
| 389 | `wbtheme.test.ts` | 풀린 크기가 상한을 넘으면 풀기 전에 거절한다 |
| 371 | `equivalence.property.test.ts` | 문서 · 역연산 · 오류가 같고, 입력 문서와 ops 는 그대로다 |
| 336 | `view-state-ops.test.ts` | 무작위 문서 — 상태마다 지운 뒤 검증 오류 0 · 역연산 왕복 · 말한 집합 = 사라진 집합 |
| 326 | `check.test.ts` | 기본 뷰 테마는 오류 0 — 갤러리 칸 전부를 그렸다 · 끝나면 DOM 전역을 걷는다 |
| 131 | `assembly-census.test.ts` | 목록이 `read/` 셋으로 고정돼 있다 — 명령이 다시 조립하면 여기가 먼저 죽는다 |
| 126 | `check.test.ts` | 던지는 뷰는 그 컴포넌트의 칸마다 폴백 오류로 선다 — 다른 컴포넌트는 깨끗하다 |
| 123 | `io-boundary.test.ts` | 목록이 둘로 고정돼 있다 — 새 자리가 생기면 여기가 먼저 죽는다 |
| 120 | `client-kind.test.ts` | `io.fetch(` 를 부르는 파일이 `client.ts` 하나다 |
| 110 | `bundle-parity.test.tsx` | 페이지 셋이 각각 자기 문서와 같다 |
| 106 | `check.test.ts` | CSS · 뷰 어디서도 안 쓰는 토큰을 센다 — :root 의 정의는 쓰임이 아니고, 쓰는 토큰의 기본값이 가리키는 토큰은 쓰 |
| 106 | `check.test.ts` | 카탈로그에 없는 타입의 뷰 키는 오류로 선다 — 있는 타입의 뷰 키는 깨끗하다 |
| 105 | `check.test.ts` | 포커스 받는 요소는 경고로 선다 — tabindex · summary · controls 영상, 단추 · 링크 · 입력 칸은  |
| 103 | `check.test.ts` | 패턴이 선언 안 한 variant 를 쓰면 센다 — 선언한 것은 안 센다 |
| 103 | `check.test.ts` | 테마가 안 그리는 타입(StateSwitch)의 뷰 키는 오류로 선다 — 문장도 그 키를 말한다 |
| 101 | `check.test.ts` | Root 를 안 그리는 뷰는 콘솔 오류로 선다 |
| 89 | `view-state-guard.test.ts` | 묶음 · 역연산 일곱 꼴 × 남의 편집 넷 — 4000 판 |
| 75 | `build.test.ts` | 검증된 .wbtheme 를 <id>-<version>.wbtheme 로 낸다 |
| 66 | `io-boundary.test.ts` | 목록이 비어 있다 — 새 자리가 생기면 여기가 먼저 죽는다 |
| 66 | `assembly-census.test.ts` | 조립을 부르는 자리가 하나도 없다 — 부르는 것은 `@wirebound/cli`의 읽기 층이다 |
| 66 | `runtime-bundle.test.ts` | 반대 순서로 눌러도 같은 화면이다 |
| 63 | `alias-chars.test.ts` | 봉투와 한 벌이다 — 기본 다국어 평면의 글자 하나를 끼운 `a?b` 를 봉투가 받는 것과 다듬기가 그대로 두는 것이 같다 |
| 58 | `contract-attrs.test.ts` | src의 data-* 속성이 계약 넷과 이름 있는 예외뿐이다 |
| 49 | `gallery.test.tsx` | 테마 뷰로 그리고 항목마다 이름표를 단다 |
| 46 | `runtime-bundle.test.ts` | 런타임을 돌려도 좌측 트리와 우측 탭이 그대로다 |
| 43 | `runtime-bundle.test.ts` | 숨긴 노드를 다시 보이게 하면 돌아온다 |
| 41 | `runtime-bundle.test.ts` | setProp·switchTab·setVisible이 한 번에 반영된다 |

### web (jsdom) — 느린 파일 30 (파일 시간 ms · 케이스 수)

| ms | 케이스 | 파일 |
|---:|---:|---|
| 81274 | 4 | `apps/web/test/routes/viewer-readonly.test.tsx` |
| 7584 | 13 | `apps/web/test/lock/one-verdict.test.ts` |
| 4889 | 74 | `apps/web/test/panels/write-ledger.test.tsx` |
| 3884 | 43 | `apps/web/test/edit/reload-sent-edits.test.tsx` |
| 3430 | 62 | `apps/web/test/panels/menu-crud.test.tsx` |
| 2737 | 47 | `apps/web/test/shell/snapshots-panel.test.tsx` |
| 2337 | 42 | `apps/web/test/shell/export-panel.test.tsx` |
| 2312 | 31 | `apps/web/test/panels/draft-store.test.tsx` |
| 2301 | 59 | `apps/web/test/panels/property-panel.test.tsx` |
| 2053 | 38 | `apps/web/test/panels/structure-preset.test.tsx` |
| 1993 | 35 | `apps/web/test/panels/structure-toolbar.test.tsx` |
| 1698 | 30 | `apps/web/test/lock/toolbar-abilities.test.tsx` |
| 1675 | 23 | `apps/web/test/edit/editor-keys.test.tsx` |
| 1636 | 31 | `apps/web/test/panels/comment-panel.test.tsx` |
| 1563 | 29 | `apps/web/test/edit/undo-restore-history.test.tsx` |
| 1527 | 30 | `apps/web/test/panels/menu-keyboard.test.tsx` |
| 1482 | 23 | `apps/web/test/lock/props-lock.test.tsx` |
| 1453 | 42 | `apps/web/test/panels/page-json.test.tsx` |
| 1442 | 1 | `apps/web/test/edit/view-state-fork-oracle.test.ts` |
| 1418 | 38 | `apps/web/test/lock/soft-lock.test.tsx` |
| 1303 | 22 | `apps/web/test/palette/palette-cards.test.tsx` |
| 1288 | 21 | `apps/web/test/panels/type-picker.test.tsx` |
| 1246 | 26 | `apps/web/test/panels/node-alias.test.tsx` |
| 1233 | 21 | `apps/web/test/panels/interaction-panel.test.tsx` |
| 1214 | 19 | `apps/web/test/panels/page-description-edit.test.tsx` |
| 1189 | 17 | `apps/web/test/edit/undo-before-ack.test.tsx` |
| 1186 | 27 | `apps/web/test/canvas/interaction-runtime.test.tsx` |
| 1165 | 42 | `apps/web/test/store-access.test.ts` |
| 1159 | 19 | `apps/web/test/panels/structure-keyboard.test.tsx` |
| 1158 | 15 | `apps/web/test/edit/reconnect-resync.test.tsx` |

### web (jsdom) — 느린 케이스 30

| ms | 파일 | 케이스 |
|---:|---|---|
| 41322 | `viewer-readonly.test.tsx` | editor 로 훑으면 입구마다 쓰기가 나온다 — 훑기가 닿는다는 대조 |
| 13744 | `viewer-readonly.test.tsx` | viewer 로 훑으면 HTTP 쓰기 0 · WS 쓰기 프레임 0 |
| 13262 | `viewer-readonly.test.tsx` | editor 로 연 화면을 실행 중에 viewer 로 내린 뒤 훑어도 HTTP 쓰기 0 · WS 쓰기 프레임 0 |
| 12946 | `viewer-readonly.test.tsx` | 저장소에 editor 때의 초안 칸 다섯을 둔 채 viewer 로 다시 열어 훑어도 HTTP 쓰기 0 · WS 쓰기 프레임 0 |
| 1579 | `one-verdict.test.ts` | 편집의 판정도 선언은 `packages/schema`에 하나이고 **양쪽이** 그것을 부른다 |
| 1442 | `view-state-fork-oracle.test.ts` | 무작위 묶음에서 지킬 가지가 바뀌는 `plain` · `fork` 가 0, 괜히 막는 `refused` 가 0, `fork`  |
| 1266 | `one-verdict.test.ts` | 선언은 `packages/schema`에 하나다 — 앱이 자기 것을 갖지 않는다 |
| 941 | `one-verdict.test.ts` | **양쪽이** 그것을 부른다 — 한쪽이 0이면 그 방어는 자기 판정을 쓰고 있다 |
| 859 | `one-verdict.test.ts` | 노드마다 따로 묻는 판정(`findLockConflict`)을 앱이 부르지 않는다 |
| 837 | `one-verdict.test.ts` | 편집을 포인터로 바꿔 넣는 옛 길이 앱에 없다 |
| 806 | `one-verdict.test.ts` | 소유자 비교가 `packages/schema` 밖에 없다 |
| 714 | `role-access.test.ts` | .role을 읽는 코드는 전부 판정 함수의 호출부다 |
| 713 | `api-consumers.test.ts` | 부르는 자리가 표와 같다 |
| 612 | `store-access.test.ts` | 지금 트리에는 우회가 없다 |
| 441 | `one-verdict.test.ts` | 화면이 잠금 목록을 손에 쥐는 자리도 하나다 — 판정은 스토어 안에서 끝난다 |
| 441 | `icon-census.test.tsx` | 에디터 · 셸 밖 화면 넷 · 하단 바 통지 — 이름 · title 이 빈 것이 없다 |
| 333 | `menu-crud.test.tsx` | 조작이 나가 있는 동안에는 입력이 열리지 않는다 |
| 312 | `props-lock.test.tsx` | 위젯 일곱이 종류마다 꺼진다 — 잠긴 노드 자신을 골라 둔 판 |
| 300 | `one-verdict.test.ts` | 검사가 진짜로 무언가를 본다 — 음성 대조 |
| 296 | `icon-census.test.tsx` | 에디터 · 셸 밖 화면의 메뉴를 전부 열어 — 아이콘 없는 항목이 없다 |
| 283 | `editor-keys.test.tsx` | Ctrl+Z 는 머리의 «되돌리기» 단추와 같은 요청 · 같은 화면 · 같은 단추 상태를 낸다 |
| 281 | `menu-crud.test.tsx` | 조작이 나가 있는 동안에는 소속 메뉴 목록도 열리지 않는다 |
| 275 | `one-verdict.test.ts` | **살아 있는 잠금 목록을 읽는 자리는 둘뿐이다** — 셋째 판정은 여기서 먼저 보인다 |
| 274 | `one-verdict.test.ts` | 목록을 좁히는 자리도 하나다 — 판정하는 파일이 `locksAgainst`를 부른다 |
| 264 | `menu-crud.test.tsx` | 앞 요청이 끝나면 다음 조작이 다시 나간다 |
| 223 | `write-ledger.test.tsx` | 설명 — 에디터를 떠났다 와도 잠금이 남는다: 둘째 저장이 나갈 수 없다 |
| 214 | `editor-keys.test.tsx` | Ctrl+Shift+Z · Ctrl+Y 는 «다시 실행» 단추와 같다 |
| 209 | `leave-refusal-reopened.test.tsx` | 서버가 거절했으면 저장되지 않았다고만 말한다 — 다시 열라고 하지 않는다 |
| 208 | `api-proxy-abort.test.ts` | 끊지 않은 요청은 끝까지 간다 — 본문을 다 보내고 상류의 답을 다 받는다 |
| 205 | `loss-notice-merge.test.tsx` | 복원 다시 읽기의 잃음 뒤에 판을 못 정한 수습의 답이 와도 둘 다 말한다 (P2) |

### api — 느린 파일 30 (파일 시간 ms · 케이스 수)

| ms | 케이스 | 파일 |
|---:|---:|---|
| 45284 | 34 | `apps/api/test/restore-lock-census.test.ts` |
| 18414 | 140 | `apps/api/test/guard-in-lock.test.ts` |
| 17200 | 2 | `apps/api/test/late-commit-watch.test.ts` |
| 16150 | 12 | `apps/api/test/edit-lost-commit.test.ts` |
| 13376 | 1 | `apps/api/test/export-abort-slot.test.ts` |
| 10496 | 8 | `apps/api/test/lock-set-deadlock.test.ts` |
| 9715 | 33 | `apps/api/test/ws-lock.test.ts` |
| 9416 | 28 | `apps/api/test/export-worker.test.ts` |
| 8803 | 17 | `apps/api/test/menu-cascade-concurrency.test.ts` |
| 8486 | 20 | `apps/api/test/menu-changed.test.ts` |
| 8349 | 21 | `apps/api/test/ws-lock-set.test.ts` |
| 7686 | 216 | `apps/api/test/permission-matrix.test.ts` |
| 7576 | 20 | `apps/api/test/menu-broadcast-census.test.ts` |
| 6149 | 7 | `apps/api/test/lost-commit-writes.test.ts` |
| 5220 | 11 | `apps/api/test/db-connection-loss.test.ts` |
| 4326 | 13 | `apps/api/test/db-partition.test.ts` |
| 4257 | 18 | `apps/api/test/export-pptx-screens.test.ts` |
| 3918 | 1 | `apps/api/test/ws-lock-cost.test.ts` |
| 3650 | 9 | `apps/api/test/tree-order-concurrency.test.ts` |
| 3619 | 6 | `apps/api/test/comment-replay-broadcast.test.ts` |
| 3274 | 16 | `apps/api/test/user-creation-census.test.ts` |
| 3104 | 8 | `apps/api/test/ws-membership.test.ts` |
| 3025 | 22 | `apps/api/test/lock-census.test.ts` |
| 2945 | 21 | `apps/api/test/ws-broadcast.test.ts` |
| 2816 | 15 | `apps/api/test/export-pptx-route.test.ts` |
| 2651 | 13 | `apps/api/test/export-routes.test.ts` |
| 2644 | 14 | `apps/api/test/api-db-errors.test.ts` |
| 2372 | 13 | `apps/api/test/broadcast-census.test.ts` |
| 2124 | 43 | `apps/api/test/restore.test.ts` |
| 2112 | 5 | `apps/api/test/cascade-safety-keep.test.ts` |

### api — 느린 케이스 30

| ms | 파일 | 케이스 |
|---:|---|---|
| 22080 | `restore-lock-census.test.ts` | 잠금이 없으면 표의 모든 요청이 창 안에 끝난다 — 음성 대조 |
| 14630 | `late-commit-watch.test.ts` | 잃은 트리 쓰기 10 — 지켜보기는 칸 하나까지 · 남의 프로젝트 GET 200 · 조건이 풀리면 곧 신호 |
| 13376 | `export-abort-slot.test.ts` | 앞의 둘을 곧바로 끊고 셋째를 부르면 셋째가 돈다 — «내 내보내기» 503 이 아니다 |
| 4148 | `edit-lost-commit.test.ts` | 확인이 한도를 넘기면 그 연결을 버린다 — 응답 뒤에 풀 칸을 쥐지 않는다 |
| 3918 | `ws-lock-cost.test.ts` | Text 7000 · 고른 200 · 남의 잠금 801 — 하트비트 판정 · 루프 멈춤 · 남의 편집 왕복이 상한 안이다 |
| 3877 | `menu-broadcast-census.test.ts` | 트리 쓰기의 호출 자리가 하나도 빠지지 않았다 |
| 3436 | `ws-lock-set.test.ts` | 겹친 두 잠금의 하트비트가 행에 함께 줄 서도 하나만 거절되고 겹침이 풀린다 |
| 3125 | `menu-changed.test.ts` | 한도를 넘겨 커밋된 잃은 COMMIT — 503 «모름» 뒤 커밋되면 룸이 그 번호의 신호를 받는다 |
| 3085 | `edit-lost-commit.test.ts` | 결말을 묻는 간격은 늘어난다 — 한도를 넘겨 도는 COMMIT 하나에 묻는 수가 늘어나는 간격의 몫 이하다 |
| 3083 | `edit-lost-commit.test.ts` | 끊긴 연결의 COMMIT 이 한도를 넘겨 돌면 503 «모름»이다 — 한도에서 멈춘다 |
| 2569 | `late-commit-watch.test.ts` | 닫기 — 답을 기다리는 묻기가 있어도 `db.destroy` 가 곧바로 끝나고, 닫은 뒤에는 묻지 않는다 |
| 2083 | `ws-lock.test.ts` | 행을 한도 넘게 기다린 `lock`은 그동안 거절된다 — 풀 칸을 놓고 앞서 쥔 것도 놓는다 |
| 2051 | `menu-cascade-concurrency.test.ts` | 밀려날 안전망으로 복원 — 연쇄가 먼저면 복원이 404 · 복원이 먼저면 둘 다 성공하고 그 뒤에 지워진다 · 줄에 선 동안  |
| 2046 | `ws-shutdown.test.ts` | 닫힘에 답하지 않는 연결은 한도 뒤 끊어 `app.close()`가 끝난다 |
| 1943 | `menu-cascade-concurrency.test.ts` | 프로젝트 삭제 — 어느 차례든 교착이 없다 · 프로젝트 삭제가 먼저면 연쇄가 404 |
| 1880 | `menu-broadcast-census.test.ts` | `helper` 는 제 파일 밖에서 불리지 않는다 |
| 1818 | `db-connection-loss.test.ts` | 트랜잭션 중간 문장이 서버의 답 없이 거절되면 확정 실패로 두고 그 연결을 버린다 — 빠진 ROLLBACK 의 트랜잭션이 다음 |
| 1628 | `db-partition.test.ts` | 트랜잭션 안에서 시간 제한보다 오래 쉬면 서버가 그 세션을 끝낸다 — 그 거절은 «연결을 잃었다»(503 쪽)이고 커밋은 0  |
| 1609 | `db-partition.test.ts` | 게시 도중 api 쪽만 끊겨 남은 고아 백엔드를 서버가 idle 시간 제한으로 끝낸다 — 잠금이 풀리고 같은 페이지의 다음 게 |
| 1534 | `db-connection-loss.test.ts` | 그 COMMIT 뒤 Kysely 가 보내는 ROLLBACK 도 답을 못 받으면 — 덮는 그 거절도 «잃었다»다(COMMIT 의 |
| 1429 | `export-worker.test.ts` | 워커로 도는 동안 메인의 루프가 서지 않는다 — 같은 스레드에서 돈 시간보다 한참 짧게만 선다 |
| 1401 | `lost-commit-writes.test.ts` | 코멘트 삭제 — 확인 전에 남의 revision 이 머리가 되면 200 이지만 옛 revision 을 방송하지 않는다 |
| 1378 | `api-db-errors.test.ts` | 게시의 COMMIT 이 클라이언트 쪽 시간 제한으로 거절되면 503 이다 — 커밋은 됐고(1행) 같은 키로 다시 보내면 재생된 |
| 1376 | `lost-commit-writes.test.ts` | PUT .../schema — 확인 전에 남의 revision 이 머리가 되면 200 이지만 옛 revision 을 방송하지  |
| 1324 | `lock-set-deadlock.test.ts` | 메뉴 연쇄 삭제 · lock 먼저 |
| 1323 | `db-connection-loss.test.ts` | COMMIT 이 서버의 답 없이 거절되면(클라이언트 쪽 시간 제한) «잃었다»다 — `'error'` 표지가 없어도 · 커밋은 |
| 1317 | `lock-set-deadlock.test.ts` | 스냅샷 복원 · lock 먼저 |
| 1316 | `lock-set-deadlock.test.ts` | 메뉴 연쇄 삭제 · 쓰기 먼저 |
| 1313 | `lock-set-deadlock.test.ts` | 스냅샷 복원 · 쓰기 먼저 |
| 1312 | `lock-set-deadlock.test.ts` | 편집 커밋(PATCH …/ops) · 쓰기 먼저 |

### build — 느린 파일 30 (파일 시간 ms · 케이스 수)

| ms | 케이스 | 파일 |
|---:|---:|---|
| 72496 | 23 | `apps/web/build-test/keyboard-holes.test.ts` |
| 64032 | 16 | `apps/web/build-test/view-states-review.test.ts` |
| 59122 | 25 | `apps/web/build-test/tree-drag-review.test.ts` |
| 58789 | 16 | `apps/web/build-test/canvas-drop-review.test.ts` |
| 57880 | 3 | `apps/web/build-test/editor-shortcuts-review-2.test.ts` |
| 57569 | 9 | `apps/web/build-test/editor-restore-signal-order.test.ts` |
| 55788 | 33 | `apps/web/build-test/palette-review.test.ts` |
| 48671 | 21 | `apps/web/build-test/theme-system-review.test.ts` |
| 41897 | 21 | `apps/web/build-test/multiselect.test.ts` |
| 41110 | 9 | `apps/web/build-test/members-confirm.test.ts` |
| 37071 | 13 | `apps/api/build-test/screen-sandbox-review.test.ts` |
| 33784 | 7 | `apps/web/build-test/editor-undo-before-ack.test.ts` |
| 31680 | 5 | `apps/web/build-test/tokens-confirm.test.ts` |
| 31608 | 17 | `apps/web/build-test/drag-pointer-kinds.test.ts` |
| 30784 | 20 | `apps/web/build-test/view-states-editor.test.ts` |
| 29720 | 9 | `apps/web/build-test/n1-layout.test.ts` |
| 28888 | 19 | `apps/web/build-test/menu-realtime.test.ts` |
| 27742 | 8 | `apps/web/build-test/editor-narrow-canvas.test.ts` |
| 26347 | 10 | `apps/web/build-test/editor-shortcuts-review.test.ts` |
| 25305 | 31 | `apps/api/build-test/screen-chromium.test.ts` |
| 22543 | 15 | `apps/web/build-test/palette.test.ts` |
| 21282 | 16 | `apps/web/build-test/layout-guides.test.ts` |
| 15455 | 12 | `apps/web/build-test/canvas-drop.test.ts` |
| 14916 | 7 | `apps/web/build-test/view-states-read.test.ts` |
| 14543 | 4 | `apps/web/build-test/action-menu-delete.test.ts` |
| 13607 | 5 | `apps/web/build-test/editor-undo-restore.test.ts` |
| 13178 | 6 | `apps/web/build-test/action-menu-portal.test.ts` |
| 12425 | 4 | `apps/web/build-test/editor-post-between.test.ts` |
| 10388 | 4 | `apps/web/build-test/editor-logout-edits.test.ts` |
| 10201 | 6 | `apps/web/build-test/editor-leave-unsent.test.ts` |

### build — 느린 케이스 30

| ms | 파일 | 케이스 |
|---:|---|---|
| 34737 | `editor-shortcuts-review-2.test.ts` | R4 붙이는 사이 같은 페이지를 다시 실으면 누른 때의 기준 노드 뒤에 붙고 앞 통지를 덮지 않는다 — 재연결 · 복원 다시  |
| 22804 | `canvas-drop-review.test.ts` | 다섯 테마 × 줌 셋 · 칸을 민 판 · 뒤집힌 가로 무리에서 뗀 순간의 미리보기가 선 자리가 서버 문서의 자리다 |
| 21885 | `tree-drag-review.test.ts` | 삭제 두 번 누르기 — 더블클릭 · 따로 두 번이 한 몸짓에 지우지 않는다(폭 셋 · 왼끝 · 가운데 · 오른끝) |
| 17116 | `keyboard-holes.test.ts` | 거절된 삭제가 노드를 돌려놓으면 고른 노드도 돌아온다 — 줄 … · 키보드 단일 · 일괄이 같다 · 남이 지웠거나 옮겼으면 비 |
| 14836 | `tokens-confirm.test.ts` | 폭 390 — 연타 · 따로 두 번이 어느 점에서도 안 지운다 |
| 14636 | `tokens-confirm.test.ts` | 폭 1280 — 연타 · 따로 두 번이 어느 점에서도 안 지운다 |
| 14069 | `editor-restore-signal-order.test.ts` | 흉내 낸 신호 · 내 답이 매달림 — 한도 뒤 배너가 서고, 답의 다시 읽기가 화면을 서버와 맞춘다 |
| 13909 | `palette-review.test.ts` | 통지가 판을 조인 동안 손잡이를 만져도 기억한 높이가 통지에 안 눌린다 — 줄이는 몸짓은 그린 높이에서 움직인다 |
| 13321 | `editor-restore-signal-order.test.ts` | 답을 받음 · 답이 한도보다 늦음 — 거짓 배너가 한 번 서고 답의 다시 읽기가 걷는다 |
| 13076 | `editor-shortcuts-review-2.test.ts` | R2 · R3 고르개가 선 동안 고르개 밖 · 우측 패널 탭에서 Delete · ↓ · Escape 가 선다 — 고르개 안의  |
| 11479 | `n1-layout.test.ts` | 창 크기 표 — 판이 최소 위면 캔버스 칸이 최소를 지키고 하단 바가 창 안이다(Q7 (다): 판 최소가 캔버스 몫보다 앞선다 |
| 11439 | `editor-undo-before-ack.test.ts` | 누른 때의 마지막 편집이 ack 없이 큐를 떠나면 앞 편집을 되돌리지 않는다 — 앞 편집의 ack 가 맨 위를 바꿔 놓은 채  |
| 11305 | `members-confirm.test.ts` | 폭 390 — 연타 · 따로 두 번이 어느 점에서도 안 뺀다 |
| 11206 | `members-confirm.test.ts` | 폭 1280 — 연타 · 따로 두 번이 어느 점에서도 안 뺀다 |
| 11126 | `members-confirm.test.ts` | 폭 360 — 연타 · 따로 두 번이 어느 점에서도 안 뺀다 |
| 10176 | `canvas-drop-review.test.ts` | 끄는 중 남의 잠금이 닿으면 손잡이 · 표시가 곧바로 걷히고 떼도 편집 0 이다 |
| 10066 | `editor-shortcuts-review-2.test.ts` | R1 열린 줄 메뉴 — 선택을 옮기는 길은 메뉴를 닫고, 선택이 그대로인 길에서는 «삭제»가 연 줄을 지운다 |
| 9649 | `editor-restore-signal-order.test.ts` | 복원이 도는 사이 다른 프로젝트로 갔다 돌아옴 · 답이 먼저 — 커밋 뒤 화면이 서버와 같거나 배너가 선다 |
| 9452 | `view-states-review.test.ts` | H2 트리 이름 입력 중 · F2 중 — 입력이 닫히고 친 별칭을 안 쓰며 떠남을 말한다 · «모든 가지 보기»를 켜도 묻지  |
| 8196 | `editor-shortcuts-review.test.ts` | L4 붙이는 사이 페이지를 떠났으면 붙이지 않고 한 줄로 말한다 — 떠나 머묾 · 떠났다 돌아옴 |
| 7593 | `keyboard-holes.test.ts` | 타입 · 패턴 · 프리셋 고르개 안의 Delete · Backspace · 누름은 고른 노드를 안 지우고 고르개는 열린 채다 |
| 7467 | `canvas-drop-review.test.ts` | 끄는 중 내 앞 편집이 리베이스돼도 표시가 남고 놓으면 보인 자리에 선다 |
| 7460 | `multiselect.test.ts` | bob 이 먼저 쥔 노드를 늦게 안 alice 가 사각형에 넣으면 그것만 빠지고 하단 바 한 줄 |
| 7188 | `multiselect.test.ts` | 일부 거절 — 친 글이 남은 노드에 가고 거절의 한 줄은 남는다 |
| 6998 | `editor-narrow-canvas.test.ts` | 좁은 창 — 창 다섯 × 편집 · 뷰의 칸 폭, 접으면 그 쪽 트랙째 빠지고 새로 고쳐도 기억하며 펴면 돌아온다 |
| 6868 | `action-menu-delete.test.ts` | 구조 트리 줄 `…` — 첫 항목 · 둘째 항목 · 단추에 포커스가 있어도 Delete · Backspace · 누름은 노드를 |
| 6817 | `view-states-review.test.ts` | H1 여럿 Delete — `n_pre` · `n_dt` 를 함께 고른 Delete(고른 차례 둘)는 보내지 않고 까닭을 말한 |
| 6303 | `editor-post-between.test.ts` | 로그아웃 한도 뒤 번호가 와 다시 낸 편집을 «저장되지 않았다»로 말하지 않는다 |
| 6299 | `keyboard-holes.test.ts` | Escape · «취소»로 닫으면 포커스가 고르개를 연 자리로 돌아온다 |
| 6166 | `editor-narrow-canvas.test.ts` | 손잡이 — 오른 끝에서 오른쪽으로 · 왼 끝에서 왼쪽으로 밀고, 민 뒤에 보인 자리에 놓인다 |
