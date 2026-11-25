# rv-vp — 표시 옵션(T5) 반증 리뷰

대상 `feat/view-prefs` `803a5454`(구현 `3df19d2c`) · 기준 main `f3acecc0` · 구현 보고 `docs/superpowers/plans/2026-11-25-vp-report.md`. 고치지 않았다 — 재현 값과 탐침 원문만 적는다.

## 판

- Node v24.21.0(`eval "$(mise env -s zsh)"` 뒤) · `pnpm db port postgres 5432` → `0.0.0.0:5545` · load 25 → 6.
- `orca terminal list` 에 이 워크트리 터미널 둘(내 세션 · 셋업 «초기 설정») — 다른 쓰는 자 없음.
- 시작 · 끝 `git ls-files -s | md5` = `deea708d5f2903073e52b34c830fbcb1` 둘 다 · `git status --short` 둘 다 빈 줄 · 끝에 `actor-census.test.ts:868` 의 `'project_view_prefs',` 있음 · 남은 vitest · 서버 없음.
- 탐침은 스크래치(테스트 글롭 밖)에서 api 하네스 설정(`root` 체크아웃 · `globalSetup` · `setupFiles` 는 api 프로젝트 것 · `resolve` 는 루트 설정)으로 돌렸다. api vitest 는 늘 한 번에 하나.
- 변조는 경로 전체 이름 백업 · `filecmp` 바이트 비교 복원 · `git checkout` 안 씀. 변조 묶음 스크립트의 첫 두 판은 스크립트 결함(`open(path,'w')` 가 바꿀 글을 읽기 전에 파일을 비워 맞은 수 0 · 복원은 원본 백업으로 됐다)으로 아무것도 안 돌았다 — 버리고 셋째 판만 센다.

## 발견

### M1 · 중간 — PUT 의 `lockProjectShared` 가 프로젝트 삭제와의 교착을 막는데, 그 줄을 잠그는 케이스가 없다

구현 보고 «안 잰 것» 은 이 줄을 떼면 «삭제 뒤의 500/404 만 갈린다» 고 적었다. **아니다 — 행이 이미 있는 판에서 교착이 선다.**

- 기전: 행이 있는 판의 upsert 는 FK 검사를 안 불러 프로젝트 행을 안 잡는다. PUT 이 자기 `project_view_prefs` 행을 쥔 채 재확인(멤버 행 `FOR SHARE`)에 서면, 삭제는 프로젝트 행 · 페이지 · 메뉴 · 모듈 · 토큰 · owner 행을 지나 CASCADE 에서 그 행에 서고, PUT 의 재확인은 삭제가 쥔(지운) 멤버 행에 선다.
- 지금 소스: 그 판에서 삭제가 `select "id" from "projects" … for update` 에 서고(PUT 이 `KEY SHARE` 를 쥠) PUT 200 · 삭제 204 · 교착 0 · 행 0. 네 판(editor/owner × 행 있음/없음) 모두 같다.
- 그 줄을 뗀 변조(V1 — `await lockProjectShared(trx, projectId)` → `void lockProjectShared`):

| 판 | 삭제가 선 질의 | PUT | 삭제 | 교착 | 남은 행 |
|---|---|---|---|---|---|
| editor · 행 있음 | `delete from "projects" where "id" = $1` | 200 | **500** | **+1** | `["subpage.b"]`(삭제가 롤백) |
| editor · 행 없음 | `… for update`(FK 가 `KEY SHARE`) | 200 | 204 | 0 | 0 |
| owner · 행 있음 | `delete from "projects" …` | 200 | **500** | **+1** | `["subpage.b"]` |
| owner · 행 없음 | `… for update` | 200 | 204 | 0 | 0 |

- 같은 V1 에서 `view-prefs.test.ts` · `guard-in-lock.test.ts` · `restore-lock-census.test.ts` · `permission-matrix.test.ts` 를 돌렸다 — **실행 556 · 실패 0.** `guard-in-lock` · `restore-lock-census` 의 줄은 처음 쓰는 판이라 FK 가 같은 잠금을 걸어 이 변조가 산다(구현 보고 말 그대로).
- 무게: 지금 소스는 맞다(교착 0). 교착을 막는 유일한 줄이 아무 케이스에도 안 잠겨 있어 중간이다 — 뒤 트랙이 «행이 있으면 FK 가 안 도니 이 잠금은 404 꾸밈» 으로 읽고 걷으면 owner 의 프로젝트 삭제가 500 이 된다.
- 넣을 케이스: 아래 탐침 원문의 «행 있음» 판을 `view-prefs.test.ts`(또는 `guard-in-lock.test.ts` 의 «잠금 순서» 절)에 `withProxiedRealApi` 로 — 교착 0 · 삭제 204 · 행 0 을 단언하고 V1 로 한 번 죽인다. 라우트 머리말 «프로젝트 행이 먼저다» 의 까닭에 «행이 있는 판의 교착» 을 더한다.

### L1 · 낮음 — 같은 사람의 겹친 PUT 둘은 보낸 차례가 아니라 커밋 차례로 선다

`withRealApi` 에서 `['blank.first']` · `['blank.second']` 를 차례로 쏘고 둘을 함께 기다린 판 다섯: 끝 값이 `first` 둘 · `second` 셋(둘 다 늘 200). 처음 쓰는 판 20 개를 한꺼번에: 전부 200 · 행 1 · GET 이 그 행 값(`["blank.v4"]`) — 500 · 겹친 행은 없다.

설계(«나중 쓰기가 이긴다 · revision 없음»)대로다. 다만 «보기» 메뉴(T7)가 빠르게 두 번 끄고 켜면 앞 요청이 나중에 커밋돼 화면과 서버가 갈릴 수 있다 — T7 이 PUT 을 줄 세우거나(앞 답 뒤 보냄) 마지막 값만 보내게 하는 몫이다. 응답 본문은 자기 값이라 클라이언트가 어느 것이 마지막인지 못 가른다.

### L2 · 낮음 — 주석 자리 둘이 밀렸다

- `apps/web/src/api/http-client.ts` 의 `SHAPES`: `viewPrefs` 줄과 그 머리말이 `codeTable` 의 머리말(«공통코드 표 — …») **아래**에 끼었다. 지금은 «공통코드 표» 주석이 `viewPrefs` 머리말 위에 서고 `codeTable` 에는 머리말이 없다.
- `apps/web/test/api/http-client.test.ts` 의 `ENDPOINTS`: «**공통코드 아홉.** …» 주석 바로 밑에 표시 옵션 두 줄이 들어가, 그 주석이 표시 옵션을 가리키는 꼴이다.

## 반증이 안 선 것(값)

### 1 · 인가 — 요청자 × 메서드 (`withApi` · PUT 본문 `{ hiddenRegions: ['blank.zz'] }`)

| 요청자 | GET | PUT |
|---|---|---|
| 비로그인 | 401 | 401 |
| 비멤버 | 404 | 404 |
| viewer · editor · owner | 200(자기 값) | 200 |
| 인스턴스 관리자(비멤버) | 404 | 404 |
| owner 의 그 프로젝트 토큰 | 403(«API 토큰으로는 보기 설정을…») | 403 |
| 남의 프로젝트(q)에 묶인 토큰으로 p | 404(가드 · 스코프) | 404 |
| 빠진 멤버의 세션 | 404 | 404 |
| 빠진 멤버의 토큰 | 401(제거가 토큰을 지움) | 401 |
| 비활성 계정의 세션 | 401 | 401 |

남의 값: editor 가 `?userId=<owner>&user_id=<owner>` 로 GET → 자기 값 · 본문에 `userId` → 400(«인식할 수 없는 키») · `?userId=` PUT · 헤더 `x-wb-user` PUT → 200 이고 자기 행만 바뀜(끝 행 표: owner `["blank.zz"]` 그대로 · editor `["blank.b"]`) · owner 가 남의 프로젝트 q → 404 · 꼴 밖 id → 400 · 대문자 uuid → 200 자기 값(uuid 정규화 — 같은 행) · DELETE · POST → 404(라우트 없음).

토큰 403 은 핸들러의 `requireSessionUser` 에서 난다(가드 뒤 — 비멤버 · 스코프 밖 토큰은 가드가 먼저 404). PUT 쪽 그 줄을 `request.currentUser!` 로 바꾼 변조(V2)는 `view-prefs.test.ts` 28 중 1 이 죽는다 — «그 프로젝트의 토큰으로 부르면 GET · PUT 둘 다 403 · 행이 안 바뀐다»(`expected 200 to be 403`). GET 쪽은 구현 보고 M2 가 잰다. 그 변조에서 토큰이 쓰는 행은 토큰 주인의 행이다(남의 행이 아니다).

### 2 · 경주 — 프로젝트 삭제 · 멤버 빼기 (`withProxiedRealApi` · PUT 을 재확인 `"user_id" = $2 for share` 에서 `holdQuery`)

- 삭제: 위 M1 의 «지금 소스» 줄 — 네 판 교착 0.
- 멤버 빼기(bob editor · 행 `["subpage.a"]`): 제거 204 · 붙잡힌 PUT 404 · 교착 0 · 행은 `["subpage.a"]` 로 남는다(설계 «멤버에서 빠져도 남는다» 그대로 · 붙잡힌 쓰기는 롤백).
- 복원 · 강등은 `guard-in-lock` 의 줄(구현 보고 M7 · M8)이 잰다 — 다시 안 쟀다. 가드가 viewer 라 «강등» 은 멤버 빼기뿐이다.

### 3 · 값 검사 (`withRealApi`)

32 개 200 · 33 개 400 · id 32 자 200 · 33 자 400 · 겹침 31+1 400(겹침 문장) · 32+1 400(개수 문장이 먼저) · U+202E · NUL · 홀로 선 서러게이트 · 꼬리 줄바꿈 · 대문자 레이아웃 · 점 둘 · 모르는 레이아웃 `modal.` · 전각 숫자 · 100k 자 id → 전부 400 · 2MB 본문 413 · `null` · 문자열 · 숫자 항목 · 본문 없음 · `text/plain` → 400 · `__proto__` · `constructor.prototype` 키 → 400(«요청 형식이 올바르지 않습니다» — JSON 파서) · 같은 키 `hiddenRegions` 둘 → 200 · 뒤의 값(JSON 파서의 보통 동작) · 빈 배열 200.

### 4 · 스냅샷 · 복원 · 수명

`git grep project_view_prefs` 의 소스 자리는 마이그레이션 · `db/types.ts` · `repos/view-prefs.ts` 뿐 — `repos/snapshots.ts` · `services/restore.ts` 가 안 읽는다(구현 케이스 «스냅샷 payload 에 안 실리고, 복원이 행을 안 바꾼다» 가 성질 잠금으로 든다). 프로젝트 삭제의 CASCADE 는 구현 M5 가 잰다. 사용자 행을 지우는 길은 `src/` 에 없다 — 비활성화는 행을 남긴다(위 표 «비활성 계정» · 끝 행 표에 `deact` 의 행이 남음). 설계가 비활성 계정의 행을 말하지 않는다 — 다시 활성화하면 그대로 읽는다.

### 5 · 웹 클라이언트 (실물 `createHttpClient` · 답하지 않는 `fetch` · 가짜 시계)

| 호출 | fetch 수 | 결말 |
|---|---|---|
| `getViewPrefs` | 2(한도 뒤 한 번 더) | `ApiError` internal «서버가 응답하지 않습니다 — 잠시 뒤 새로고침하세요» |
| `listCodes`(대조) | 2 | 같음 |
| `putViewPrefs` | 1 | 끝없음(170s 진행 뒤 미결) |
| `putProjectTheme`(대조) | 1 | 같음 |
| `getViewPrefs`(부른 쪽 signal) | 1 | 미결(부른 쪽이 잰다) |

`READ_DEADLINE_MS` = 10000. 오류 꼴 400 · 403 · 404 · 500(본문 깨짐)은 `getViewPrefs` · `putViewPrefs` · `listCodes` 가 같은 `ApiError`(상태 · code · 문장)를 낸다. 다른 조회 · 쓰기와 같다.

### 6 · 인구조사 넷 — 줄을 뗀 변조

| | 변조 | 돌린 것 | 실행 | 죽은 케이스 |
|---|---|---|---|---|
| T1 | `actor-census` 의 `TABLES` 에서 `'project_view_prefs'` | 그 파일 | 27 | 1 — «표 목록이 `Database` 를 하나도 안 빠뜨린다» |
| T2 | `permission-matrix` 의 두 줄 | 그 파일 | 296 | 1 — «projectGuard가 걸린 라우트가 전부 표에 있다» |
| T3 | `restore-lock-census` 의 줄 | 그 파일 | 43 | 1 — «쓰기 라우트가 하나도 빠지지 않았다» |
| T4 | `guard-in-lock` 의 `PROJECT_PROBES` 줄 | 그 파일 | 176 | 1 — «쓰기가 하나도 빠지지 않았다» |
| T5 | 소스: PUT 가드 `viewer` → `editor` | `permission-matrix` | 306 | 2 — «표의 allowed가 가드의 최소 역할과 일치한다» · «표시 옵션 저장 — viewer → 허용»(403) |
| T6 | `restore-lock-census` 줄의 `blocked: true` → `false` | 그 파일 | 44 | 2 — 그 줄의 «안 막힌다» · «막히지 않는 줄의 목록이 고정돼 있다» |
| V1 | 소스: PUT 의 `lockProjectShared` | 넷 | 556 | **0**(M1) |
| V2 | 소스: PUT 의 `requireSessionUser` | `view-prefs.test.ts` | 28 | 1(위 1) |

실행 수는 통과 + 실패.

## 탐침 원문

### 경주(M1 · 2) — `race.probe.ts`

```ts
const MEMBER_SHARE = '"user_id" = $2 for share'
async function deadlocks() { /* select deadlocks from pg_stat_database where datname = current_database() — getTestDb() 연결 */ }
async function waiters() { /* select pid, left(query,90), pg_blocking_pids(pid) from pg_stat_activity
  where datname = current_database() and wait_event_type = 'Lock' and pid <> pg_backend_pid() */ }

for (const role of ['editor', 'owner']) for (const existing of [true, false]) {
  await withProxiedRealApi(async (ctx) => {           // beforeEach/afterEach(resetRealData)
    const alice = await signup(ctx); const bob = await signup(ctx)
    const p = await createProject(ctx, alice.cookie); await addMember(ctx, p.id, bob.user.id, role)
    const url = `/api/projects/${p.id}/view-prefs`
    if (existing) await ctx.app.inject({ method: 'PUT', url, cookies: bob.cookie, payload: { hiddenRegions: ['subpage.a'] } })
    const before = await deadlocks()
    const hold = ctx.proxy.holdQuery(MEMBER_SHARE)
    const put = ctx.app.inject({ method: 'PUT', url, cookies: bob.cookie, payload: { hiddenRegions: ['subpage.b'] } })
    await hold.held                                     // PUT 이 재확인 앞에 섰다(upsert 뒤)
    const del = ctx.app.inject({ method: 'DELETE', url: `/api/projects/${p.id}`, cookies: alice.cookie })
    const w = await waitWaiters(1)                       // 잠금 대기자 하나(25ms 폴 · 5s)
    hold.release()
    const [pr, dr] = await Promise.all([put, del])
    // 적는 것: w 의 질의 · 두 상태 · deadlocks − before · 그 프로젝트의 project_view_prefs 행
  })
}
// 멤버 빼기: 같은 판에서 del 대신 DELETE /api/projects/${p.id}/members/${bob.user.id} (alice) · 300ms 뒤 release
```

### 인가(1) — `authz.probe.ts`

`withApi` 하나에 owner · editor · viewer · 비멤버 · 관리자(`users.is_instance_admin = true` 를 직접) · 빠질 멤버 · 비활성될 멤버를 세우고, 빠질 멤버는 PUT 뒤 토큰을 받고 `DELETE …/members/:id`(204), 비활성은 PUT 뒤 `POST /api/admin/users/:id/deactivate`(200). 요청자마다 GET · PUT(`['blank.zz']`)을 보내 상태 · 본문 앞 60 자를 적고, 밀수 넷(쿼리 · 본문 · 헤더 · 남의 프로젝트)을 보낸 뒤 `project_view_prefs` 전 행을 사람 이름으로 찍는다.

### 값(3) — `values.probe.ts`

`withRealApi` · `beforeEach/afterEach(resetRealData)`. 위 «3» 의 입력을 차례로 PUT(원문 JSON 셋은 `content-type: application/json` 글자로) · 처음 쓰는 판 20 개 `Promise.all` · 쌍 다섯(`first` 를 먼저 · `second` 를 뒤에 쏘고 함께 기다린 뒤 DB 행).

### 웹 한도(5) — `deadline.probe.ts`

`environment: 'node'` 스크래치 설정 · `createHttpClient` 를 체크아웃 절대 경로로 동적 import · `fetch` 는 `signal` 의 abort 에만 거절하는 영원한 Promise · `vi.useFakeTimers()` 뒤 `advanceTimersByTimeAsync` 9999 · 1 · 10000 · 30000 · 120000.

## 지침

- **`AGENTS.md` 「검증 — wirebound」 «수를 셀 때는…» 또는 「워커에게 맡길 때」 의 변조 백업 문단** — 파이썬 변조 스크립트에서 `open(path, 'w').write(make())` 는 `open` 이 먼저 돌아 파일을 비운 뒤 `make()` 가 빈 글을 읽는다(맞은 수 0 으로 멈춤 — 복원은 됐다). 넣을 문장(«변조는 백업 …» 문단 끝): «바꾼 글은 파일을 쓰려고 열기 전에 다 짓는다 — `open(path, 'w').write(f(open(path).read()))` 꼴은 쓰기 열기가 먼저 파일을 비워 찾는 글자가 늘 0 개다.»
