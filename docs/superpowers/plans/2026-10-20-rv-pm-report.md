# 2026-10-20 rv-pm — 개인 모듈 리뷰 보고

브리프 `.worktrees/.coord/brief-rv-pm.md`. 설계 `docs/superpowers/specs/2026-10-20-personal-modules-design.md` · 구현 보고 `docs/superpowers/plans/2026-10-20-pm-report.md`. 브랜치 `feat/personal-modules`. 런타임 v24.21.0 · 자기 DB 5461.

시작할 때 `orca terminal list` — 이 워크트리에 붙은 터미널은 쉬는 구현자(`term_2eaf94b7…` — 입력 대기 `❯`)와 이 리뷰어 둘.

## 병합 결과

- `git merge main`(main `2dd49b23` — LT `/llms.txt` · 지침 커밋) — **충돌 없음**. `pnpm install` · `pnpm build` 0.
- `pnpm vitest run apps/web/test/llms-txt.test.ts apps/api/test/llms-rest-routes.test.ts` — **3 실행 · 3 통과 · 0 건너뜀**. 대조 케이스가 안 죽어 `-u` 로 다시 짓지 않았다(이 브랜치가 카탈로그 · 노드 필드 · MCP 도구를 안 바꿨다).
- `apps/web/public/llms.txt` 에 `me/` · `modules` 글자 0 줄 — 개인 모듈 경로가 안 실린다(REST 표는 `@wirebound/mcp` 의 `LLMS_REST_ROUTES` 가 고른 프로젝트 라우트만 싣는다).

## 1. 남의 개인 모듈에 닿는 길 — 입구 표

실물 HTTP(`withRealApi` — 포트를 연 앱 · `fetch`)로 사용자 셋(앨리스 = 소유자 · 프로젝트 owner, 밥 = 같은 프로젝트 editor, 앨리스의 프로젝트 API 토큰)이 낸 요청. 탐침은 스크래치(커밋 안 함 — 아래 «고친 것» 에서 케이스로 옮긴 것만 남긴다). «같은 바이트» 는 같은 사람이 모르는 id(`00000000-0000-4000-8000-000000000000`)로 낸 같은 요청의 응답 본문과 바이트로 견준 것이다.

| 입구 | 누가 | 결과 | 모르는 id 와 같은 바이트 |
|---|---|---|---|
| `GET/PATCH/DELETE /api/me/modules/<앨리스 id>` | 밥(다른 멤버) | 404 · 404 · 404 | 셋 다 같음 |
| 같은 셋 | 토큰 | 401 · 401 · 401(`unauthenticated`) | 셋 다 같음 |
| `GET /api/me/modules` · `POST /api/me/modules` | 토큰 | 401 · 401 | — |
| `GET/PATCH/DELETE /api/projects/:p/modules/<앨리스 개인 id>`(프로젝트 모듈 라우트에 개인 id) | 앨리스 · 밥 · 토큰 | 404 × 9 | 아홉 다 같음 — 개인 id 는 다른 표(`personal_modules`)라 프로젝트 모듈 repo 에 없는 행이다 |
| 복사의 «다시 읽기» 에 남의 개인 id | 밥 | 위 첫 줄과 같은 길(`getMyModule` = `GET /api/me/modules/:id`) — 404 | 같음 |
| `GET /api/projects/:p/snapshot`(덤프) · `/modules` · `/tree` · `/api/projects/:p` | 앨리스 | 200 · 개인 모듈 이름 글자 0 | — |
| WS(`/api/projects/:p/ws`) — 앨리스의 개인 POST · PATCH · DELETE 동안 | 밥 · 앨리스의 연결 | 600ms 조용한 창에 프레임 0 · 0 | — |
| 응답 시간 — 밥의 `GET /api/me/modules/<남의 id>` 대 `<모르는 id>` 200 번씩 | 밥 | 중앙값 3.70ms 대 3.81ms | — |

코드 셈: `personal_modules` 를 만지는 코드는 `repos/personal-modules.ts` 하나(`git grep -n 'personal_modules' -- apps/api/src` — 마이그레이션 · 타입 · repo 만). 라우트(`routes/personal-modules.ts`)는 방송 · 활동 기록을 안 부른다. MCP · CLI · 내보내기(`packages/exporter` 는 스냅샷 payload 를 쓴다)에 개인 모듈 길 0.

**판정: 높은 무게 없음.** 남의 것과 모르는 것이 상태 · 바이트 · 시간에서 갈리지 않는다.

## 3. 잠금 · 교착

- 개인 쓰기는 한 문장 자동 커밋(`app.db` — 트랜잭션 없음)이라 잡은 채 기다리는 자리가 없다 — 고리를 만들 수 없다.
- 사용자 행을 고치는 쓰기 셋(`repos/users.ts` 의 `setPasswordHash` · `setInstanceAdmin`, `db/reset-password.ts` 의 `writeReset`)은 모두 키 아닌 칸이라 `FOR NO KEY UPDATE` 다 — 삽입의 FK `KEY SHARE` 와 안 부딪힌다. `forUpdate()` 로 사용자 행을 잡는 자리 0.
- 실측(탐침 — 테스트 트랜잭션으로 앨리스의 사용자 행을 쥔 채 앨리스의 `POST /api/me/modules`):
  | 쥔 것 | 결과 |
  |---|---|
  | `update users set password_hash = password_hash`(비밀번호 바꾸기와 같은 모드) | 201 · 5ms |
  | `select … for share`(`recheckInstanceAdmin` 의 모드) | 201 · 5ms |
  | `select … for update`(카나리아 — 쥔 것이 진짜 잠금인가) | 1.5s 안에 안 끝남(`stood`) |
- «프로젝트 모듈로 복사» 는 화면이 `api.createModule` 로 기존 `POST /api/projects/:p/modules` 를 부른다(`apps/web/src/palette/module-tab.tsx` 의 복사 갈래) — 그 라우트는 이 브랜치에서 안 바뀌었다(`git diff 084d7027 -- apps/api/src/routes/modules.ts` 는 본문 · 거름 함수를 export 로 꺼낸 것뿐). 잠금 차례는 그대로다.

**판정: 교착 없음.**

## 4. 마이그레이션 `0026-personal-modules`

자기 dev DB(`127.0.0.1:5461/wb_personal` — 시작 때 0025 까지였다)에서 `pnpm -C apps/api migrate` → 행 하나 넣기 → `migrate:down` → `migrate`.

| 단계 | 잰 값 |
|---|---|
| up | 마지막 마이그레이션 `0026-personal-modules` · 칸 여섯(`id` uuid 기본 `gen_random_uuid()` · `owner_id` · `name` · `nodes` jsonb · 두 시각 `clock_timestamp()`) · FK `personal_modules_owner_id_fkey` `confdeltype = c`(CASCADE) |
| 넣기 | 시딩된 사용자 소유로 1 행 |
| down | `✓ Down 0026-personal-modules` · 마지막 `0025-state-visibility` · `to_regclass('personal_modules')` 빈 값 · 다른 표(`modules` · `pages`) 그대로 |
| up 다시 | `0026` · `personal_modules` 0 행(down 이 넣은 1 행을 잃었다) · 인덱스 `personal_modules_pkey` · `personal_modules_owner_created_idx` |

`down` 이 잃는 것은 담긴 개인 모듈 전부다 — 머리말 «`down` 은 표를 지운다 — 담긴 개인 모듈은 되돌릴 수 없다» 와 맞다. 기본 모듈은 서버 데이터가 없어 마이그레이션이 없다(설계 그대로).

## 2. 편집할 수 없는 판에서 문서가 바뀌는 길

### 실브라우저(스크래치 탐침 — `editor-stack` · dev 번들 · Chrome)

기존 케이스(`apps/web/build-test/module-tab.test.ts` «넣을 수 없는 판»)는 viewer · 뷰 모드에서 «넣기» 단추 수 · 카드 끌어 놓기 · 카드 첫 단추의 Enter/Space 를 잰다. 그 밖의 판을 쟀다. `sent` 는 WS 로 나간 `patch` 프레임 수 + REST `PATCH …/ops` 수, `nodes` 는 서버 문서의 노드 수(앞 · 뒤).

| 판 | 잰 값 | 카나리아 |
|---|---|---|
| P1 끄는 중 강등 — editor 밥이 개인 모듈 카드를 빈 카드 위로 끌어 표시가 선 채, owner 가 `PATCH …/members/:id {role: viewer}` → 밥의 하단 바 토글이 «모듈» 로 바뀐 뒤 놓음 | 표시 1 → 0 · `sent` 0 · 노드 5 → 5 | 강등 전 표시 1(놓을 자리 위였다) |
| P2 끄는 중 뷰 모드 — owner 가 끄는 중 키보드로 «뷰 모드» 단추(포커스 · Space — `aria-pressed=true`)를 누른 뒤 놓음 | 표시 1 → 0 · `sent` 0 · 노드 5 → 5 | 같은 탭에서 편집 모드로 돌아와 같은 끌기 → `sent` 1 · 노드 6 |
| P3 뷰 모드의 키 — 편집 모드에서 Cmd+C 로 노드를 복사해 두고 뷰 모드로 바꾼 뒤, 포커스를 «모듈 찾기» 칸 · 카드의 첫 단추 · 캔버스 노드에 두고 Cmd+V · Cmd+D · Delete · Backspace · Enter(15 번) | `sent` 0 · 노드 5 → 5 | 편집 모드로 돌아와 캔버스에서 Cmd+V → `sent` 1 · 노드 6 |

(P3 의 첫 판은 검색 칸의 Cmd+V 가 복사한 노드 JSON 을 검색어로 붙여 카드가 0 이 된 탐침의 결함으로 멈췄다 — 검색 칸을 비우고 다시 쟀다. 붙여넣기가 문서가 아니라 칸의 글자로 간 것이라 그 자체가 «편집 안 남» 이다.)

강등 직후의 «넣기» 단추 · 토글은 `apps/web/build-test/palette-review.test.ts` 의 강등 케이스(구현 트랙이 «모듈 목록 · 모듈 토글이 선다» 로 고침)가, 다시 읽는 사이의 강등 · 뷰 모드는 jsdom `apps/web/test/palette/module-tab.test.tsx` «다시 읽는 사이 뷰 모드»(구현 보고 W2)가 잰다.

### 서버 — viewer 의 프로젝트 모듈 쓰기(화면 밖 요청)

같은 프로젝트의 viewer 캐럴(세션) · 캐럴의 API 토큰으로 실물 HTTP:

| 요청 | 세션 | 토큰 |
|---|---|---|
| `POST …/modules`(«프로젝트 모듈로 복사» 의 저장) | 403 | 403 |
| `PATCH …/modules/:id` | 403 | 403 |
| `DELETE …/modules/:id` | 403 | 403 |
| `GET …/modules/:id`(«개인 모듈로 복사» 의 다시 읽기) | 200 | — |
| `POST /api/me/modules`(그 복사의 저장) | 201 | — |

원본 프로젝트 모듈은 그 뒤에도 그대로(이름 그대로).

**판정: 높은 무게 없음.**

## 5. 문서

- 정본 §9 «트리의 줄 행동» — «뷰 모드 · viewer 에게는 없다 — 하나만 빼고: viewer 의 구조 트리 줄 `…` 에는 «모듈로 저장…» 한 항목이 선다 … 구조 트리는 뷰 모드에는 없다» · 줄 표 «viewer 는 모듈로 저장… 하나». 구현(`panels/structure-tree.tsx` 의 `saveOnly` — `editable` 이 거짓인 트리, 트리는 편집 모드에만 있다)과 맞다. 구현 보고의 «구조 트리의 편집할 수 없는 판은 viewer 뿐이다» 가 바르게 옮겨졌다.
- 정본 §9 «하단 바» · «하단 판의 탭»(단추 표 — 개인은 늘 · 프로젝트는 editor 이상 · 모드와 무관) · §11.1(개인 / 프로젝트 표 · 저장 · 넣기 · 복사 · 방송 없음 · 관리 화면 없음) · 권한 표의 viewer 줄 — 코드와 맞다. 연대기 문장 없음.
- `apps/api/README.md` — `/api/me/modules` 다섯 줄 · 모듈 절(세션만 · 남의 것 404 · 복사는 엔드포인트가 아니다). 위 입구 표의 잰 값과 맞다.
- «기본 모듈» · `BUILTIN_MODULES` — 이력 문서(`docs/superpowers/plans/*` · `docs/superpowers/specs/2026-10-1*` · 이 트랙의 설계 spec)를 뺀 `git grep -nF '기본 모듈'` 0 · `git grep -nwF BUILTIN_MODULES` 0(이력 밖).

**판정: 고칠 것 없음.**

## 발견

**높은 무게(남의 것에 닿음 · 편집할 수 없는 판의 편집 · 교착 · 데이터를 잃음) — 없음.** 위 1 ~ 5 절의 잰 값이 근거다.

| # | 무게 | 무엇 | 재현 | 고쳤나 |
|---|---|---|---|---|
| F1 | 낮음(잠금 빈칸) | «끄는 중 강등 · 끄는 중 뷰 모드» 판을 재는 케이스가 없었다 — 하단 판이 이제 넣을 수 없는 판에도 남아 쥔 카드를 놓을 수 있는 판이 새로 생겼다. 막는 겹 셋(카드 판 다시 마운트 · 넣기 첫 줄 · 보내기 직전의 `insertable`)이 모두 서 있어 지금 결함은 아니다 | 탐침 P1 · P2(위 2 절) — 겹 셋을 다 떼면 뷰 모드 판의 문서가 5 → 6(편집 1), 다시 마운트만 떼면 강등 판의 표시가 놓기 전까지 남는다 | 케이스로 잠갔다: `apps/web/build-test/module-tab.test.ts` «끄는 중 강등 · 뷰 모드로 …» |
| F2 | 낮음(잠금 빈칸) | 프로젝트 모듈 라우트에 개인 모듈 id 를 싣는 입구를 재는 케이스가 없었다(구조로 막혀 있다 — 표가 다르다) | 탐침(위 1 절) 404 × 9 · 바이트 같음 | 케이스로 잠갔다: `apps/api/test/personal-modules.test.ts` «프로젝트 모듈 라우트에 개인 모듈 id …» |
| F3 | 낮음(고치지 않음) | «모듈로 저장…» 상자를 «프로젝트 모듈» 로 고른 채 강등되면 고르기에서 프로젝트가 사라지고 «저장» 이 개인 모듈로 저장한다(`panels/save-module-dialog.tsx` 의 `to`) | 코드 읽기 — 라디오가 «개인 모듈» 하나로 바뀌어 보이고 통지가 «개인 모듈 '이름'…» 이라 말한다 | 아니오 — 남에게 안 보이는 쪽으로 가는 바뀜이고 화면이 말한다. 프로젝트로 저장하려던 사람은 권한이 없어 어차피 403 이다 |
| F4 | 낮음(고치지 않음) | `apps/api/README.md` 의 `GET` · `PATCH /api/me/modules/:moduleId` 줄은 «uuid 가 아닌 id 는 400» 을 안 적는다(`DELETE` 줄만 적는다) | 라우트는 셋 다 `z.uuid()` 로 400 | 아니오 — 프로젝트 모듈 줄(`…/modules/:moduleId` 셋)과 같은 관례다. 고치려면 두 표를 함께 고친다 |

## 고친 것 — 새 케이스 둘

| 케이스 | 기준선 | 혼자 죽는 변조 | 실패 값 |
|---|---|---|---|
| `apps/api/test/personal-modules.test.ts` «프로젝트 모듈 라우트에 개인 모듈 id 를 실어도 …» | 파일 11 통과 · 0 실패 | **S8** `repos/modules.ts` 의 `findModuleById` 가 프로젝트 행이 없으면 `personal_modules` 를 id 로만 찾아 돌려준다(표를 합쳐 id 로만 거르는 판의 흉내) | 파일 10 통과 · 1 실패 — 그 케이스만, `소유자 앨리스: read [200, …]` ≠ `[404, …]` |
| `apps/web/build-test/module-tab.test.ts` «끄는 중 강등 · 뷰 모드로 넣을 수 없게 되면 표시가 걷히고 놓아도 편집이 안 나간다 — 편집 모드의 같은 끌기는 바꾼다» | 파일 6 통과 · 0 실패 | **B4** `palette/module-tab.tsx` 의 `ModuleCards` `key`(다시 마운트)를 뗌 | 파일 5 통과 · 1 실패 — 그 케이스만, `demoted.after` 0 → 1 |
| 같은 케이스 | — | **B5** B4 + 넣기 첫 줄의 `!live.current.input.insertable` + 보내기 직전의 그 확인을 뗌 | 파일 5 통과 · 1 실패 — 그 케이스만, `demoted` 의 `after` 0 → 1 · `sent` 0 → 1, `viewMode` 의 `sent` 0 → 1 · 문서에 `+Button` |

변조는 겨눈 파일 하나만 돌렸다(스크립트 하나 · 백업 이름은 경로 전체 · 복원 뒤 `cmp` 같음 셋). 런타임 v24.21.0.

탐침에서만 잰 겹 가르기(실브라우저 탐침 · 같은 P1 / P2):

| 뗀 겹 | P1 강등 | P2 뷰 모드 |
|---|---|---|
| A 다시 마운트 | 표시 남음(1) · 편집 0 | 편집 0 |
| B 넣기 첫 줄 | 편집 0 | 편집 0 |
| C 보내기 직전 | 편집 0 | 편집 0 |
| A + B | 표시 남음 · 편집 0 | 편집 0 |
| A + B + C | 표시 남음 · 편집 1(서버가 viewer 의 편집을 거절해 문서는 그대로) | 편집 1 · 문서 5 → 6 |

B · C 를 하나씩 떼면 남은 겹이 막아 케이스가 산다 — 그 둘은 혼자 재는 케이스가 없다(C 는 jsdom «다시 읽는 사이 뷰 모드»(구현 보고 W2)가 잰다. B 만 뗀 변조는 C 가 받친다). 케이스 머리말에 «셋을 다 떼야 편집이 나간다» 를 적었다.

## 게이트

main 을 합쳤으므로 전량 넷(`README.md` 「트랙 게이트」). 체인 하나(`nohup nice -n 10 caffeinate -i`) · 칸 파일 `gate-slots/rv-pm`(띄울 때 칸 0) · 런타임 v24.21.0 · 커밋 `39ead2da`(새 케이스 둘 포함). 단계의 종료 코드는 명령 바로 뒤 `rc=$?` 로 잡았고, 수는 각 단계의 json 으로 셌다.

| 단계 | 구간 | 실행 | 통과 | 실패 | 건너뜀 |
|---|---|---|---|---|---|
| `pnpm typecheck` | 15:57:55 – 15:58:34 | — | rc 0 | — | — |
| `pnpm build` | 15:58:34 – 15:58:40 | — | rc 0 | — | — |
| `pnpm test --maxWorkers=25%` | 15:58:40 – 16:08:35 | 8267 / 507 파일 | 8265 | 1 | 1 |
| `pnpm test:build:serial` | 16:08:35 – 16:11:43 | 221 / 25 파일 | 220 | 0 | 1 |
| `pnpm test:browser` | 16:11:43 – 16:24:04 | 547 / 81 파일 | 546 | 0 | 1 |

`pnpm fmt` 0(바뀐 파일 없음) · `pnpm lint` 기존 파일의 경고만(`apps/api/test/restore.test.ts` 둘).

**실패 하나** — `apps/api/test/guard-in-lock.test.ts` «F3′ — 코멘트 수정 ∥ 그 페이지의 삭제 ∥ 삭제자를 내리는 역할 변경 … 교착 0» 이 `waitForLockWaiter` 의 «잠금을 기다리는 트랜잭션이 나타나지 않았습니다 — 시나리오가 성립하지 않았습니다» 로 죽었다 — 단언 값이 아니라 판이 안 선 것이다. 이 트랙 · 이 리뷰가 안 건드린 경로다(`git diff 084d7027 -- apps/api/test/guard-in-lock.test.ts` 는 개인 모듈 쓰기 셋의 `NOT_LOCKED` 줄뿐). 그 파일을 혼자 세 번: **148 / 148 · 148 / 148 · 148 / 148**.

`pnpm test` 를 한 번 더(16:26:34 – 16:37:20 · 칸 파일 같음): **8267 / 507 파일 · 통과 8266 · 실패 0 · 건너뜀 1.**

잠듦: `pmset -g log` 의 마지막 ` Sleep ` 은 10:08:27 — 게이트 구간(15:57 – 16:37)과 안 겹친다.

## 남은 것

- F3 · F4(위 «발견») — 낮음, 고치지 않았다.
- 넣기 겹 B(넣기 첫 줄의 `insertable`)만 떼는 변조는 어느 케이스로도 안 죽는다 — 보내기 직전의 확인(C)이 같은 판을 막는다. 구현 보고의 «못 죽이는 두 겹» 과 같은 꼴이라 남긴다.
- 끝에 dev 서버 · vitest · 측정 스택 0(`ps` 로 이 워크트리 경로). 자기 DB 컨테이너(5461)는 남긴다. dev DB 는 이 리뷰의 `migrate` 로 `0026` 까지 올라가 있다.

## 지침

1. **Docker VM 디스크가 차면 판 세우기가 «No space left on device» 로 죽고, 떠 있던 워크트리 Postgres 는 다음 재기동에서 WAL redo 중 멈춘다** — 이 리뷰 중 VM(`/dev/vdb1` 97.9G)이 100% 가 되어 실브라우저 판(`editor-stack` 의 일회용 DB)이 «판을 못 세웠다 … could not create directory … No space left on device» 로 죽었고, 자기 컨테이너가 `Exited (1)`(«could not extend file … No space left on device») 였다. 이미지 정리는 공유 자원이라 코디네이터가 했다(`docker image prune -f` · 볼륨은 안 건드림).
   - 문서: `.ruler/30-delegation.md` 의 «예외는 메인 세션만 조작할 수 있는 공유 자원이다» 문단 끝.
   - 넣을 문장: «**Docker VM 디스크도 그 공유 자원이다** — 차면 판 세우기가 `No space left on device` 로 죽고(실브라우저 `editor-stack` · api 의 테스트 DB), 떠 있던 워크트리 Postgres 는 재기동 때 WAL redo 에서 `Exited (1)` 로 멈춘다. 워커는 `docker run --rm alpine df -h /` 로 잰 값과 `docker system df` 를 붙여 코디네이터에게 올리고 이미지 · 볼륨을 지우지 않는다(볼륨에 사용자의 설계서가 있다). 그동안 DB 없는 일을 한다. 비운 뒤 `pnpm db up -d` · `pnpm db port postgres 5432` 로 자기 컨테이너를 다시 세운다.»
2. **포커스 자리를 여럿 훑으며 키를 치는 탐침은 자리마다 판을 되돌린다** — 뷰 모드에서 «모듈 찾기» 칸 · 카드 단추 · 캔버스를 차례로 돌며 Cmd+V 를 쳤더니 검색 칸이 복사해 둔 노드 JSON 을 검색어로 받아 뒤 자리의 카드가 0 이 되었고, 다음 자리의 `focus` 가 값 없이 시간 초과로 죽었다.
   - 문서: `.ruler/20-verification.md` 「목 · 계측은 불린 수를 값으로 확인하고, 재는 요청이 잴 대상을 건드리지 않게 한다」 의 How to apply 끝.
   - 넣을 문장: «**키를 여러 포커스 자리에서 훑는 탐침은 자리마다 판을 되돌린다** — 앞 자리의 키가 뒤 자리의 판을 바꾼다(검색 칸의 Cmd+V 가 복사한 노드 JSON 을 검색어로 받아 카드가 0 이 되고 다음 자리의 `focus` 가 시간 초과로 죽었다). 자리를 옮기기 전에 칸을 비우고, 자리마다 그 판이 섰는지(카드 수)를 카나리아로 적는다.»
