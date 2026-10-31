# RB-WS 보고 — main(AC) 을 뼈대 브랜치에 합치기

브랜치 `feat/workspace-shell`, 합치기 전 머리 `79e71e6a`, main `8f542bef`(AC 병합), 기준 `20b398e2`. 브리프 `brief-rb-ws.md` · 공통 `common-w14.md`.
커밋: `b65a399f`(merge) · `8fa5e87a`(A7 — 한 함수) · `38f1028f`(링크 화면 × 뼈대 케이스) · 이 보고.

## 푼 충돌

`git merge --no-edit main`(rebase 아님). 충돌은 **한 파일 한 덩이**였다.

| 파일 | 덩이 | 푼 방식 |
|---|---|---|
| `docs/superpowers/specs/2026-08-03-wirebound-design.md` «셸 밖의 화면» 목록 | 이쪽: «계정 설정» 줄(폭 760px 를 뗌 — 뼈대가 내용 칸 폭을 정한다) · «테마 관리» 줄(«사이드바 «관리자 › 테마»»). main: 옛 두 줄 + «초대 가입 · 비밀번호 재설정» 줄 | 이쪽 두 줄 + main 의 «초대 가입» 줄. 세 줄이 원본(`git show 79e71e6a:` · `git show main:`)의 줄과 글자 그대로 같은지 파이썬으로 견줬다(셋 다 참 · 표지 0) |

같은 커밋에서 그 절의 머리 문장도 고쳤다 — «로그인 밖의 화면은 같은 뼈대 안에 선다» 가 가입 · 재설정을 뼈대 안으로 읽혀, 목록에 둘을 넣고
«로그인 · 초대 가입 · 재설정(로그인 전에 여는 화면) 밖의 화면은 같은 **뼈대** 안에 선다» 로 바꿨다(코드가 그렇다 — 아래 «서로 바꾼 자리» 1).

**git 이 조용히 합친 파일**: `README.md` · `apps/api/README.md` · `apps/web/src/api/client.ts` · `apps/web/src/api/http-client.ts` · `apps/web/src/app.tsx` ·
`apps/web/test/api/http-client.test.ts` · `apps/web/test/helpers.tsx`. 합친 뒤 `pnpm typecheck` 를 먼저 돌렸다 — **빨강 1**:
`apps/web/test/routes/invite.test.tsx(26,5)` — ac 의 픽스처가 `listProjects` 에 `ProjectDetail[]` 을 줬는데 ws 가 목록 항목에 `memberCount` · `updatedAt`
을 더해(`ProjectListItem`) 타입이 안 맞았다. ws 의 `listItem` 도우미(`test/helpers.tsx`)로 지어 고쳤다(merge 커밋에 함께). 고친 뒤 `pnpm typecheck` rc=0.
같은 꼴을 쓰는 `reset.test.tsx` 는 `listProjects` 를 안 불러 해당 없다. `pnpm exec ruler apply` 뒤 추적 파일 변경 0.

이 워크트리 DB(5511)에 `pnpm -C apps/api migrate` — `✓ Up 0034-accounts`.

## 모은 함수 — «멤버 수» · «최근 수정»(계획 A7)

`apps/api/src/repos/projects.ts` 의 **`projectActivityColumns(table)`** — 두 상관 하위 질의(`memberCount` · `updatedAt`)를 `table`(그 질의가 `projects` 에 붙인
이름 — 목록은 `projects`, 관리자는 `p`)로 지어 낸다. `listProjectsForUser`(`GET /api/projects`)와 `repos/admin-projects.ts` 의 `adminProjectRows`
(`GET /api/admin/projects` · owner 넘기기 응답)가 이것을 `select` 한다. 멤버 수도 두 식이 같아(그 프로젝트의 멤버 행 수 — 비활성 사용자 행 포함) 함께 모았다.
«최근 수정» 정의의 설명(무엇이 세이고 안 세이나 · `revisions` 를 버린 까닭)은 이 함수 머리말로 옮겼고, `listProjectsForUser` · `admin-projects.ts` 머리 ·
`apps/api/README.md` «프로젝트 응답 형태» · `apps/web/src/api/types.ts` 의 `ProjectListItem` 은 그 이름을 가리킨다.

- 두 트랙의 케이스: `project-list-fields` · `rv-ws-project-list` · `admin-projects` 세 파일 **19/19**(통과 + 실패 = 19 · 건너뜀 0).
- **한 벌임을 보이는 변조**(공용 함수 한 곳만 바꿈 · 세 파일만 돌림 · 백업 `bak__apps__api__src__repos__projects.ts` · `cmp` 복원):

| 변조 | 바꾼 것 | 결과 | 죽은 케이스(실패 값) |
|---|---|---|---|
| A7-1 | `updatedAt` 에서 `max(pages.updated_at)` 를 뗌(프로젝트 행 시각만) | 17 · **2 실패** | `admin-projects` «페이지 편집 뒤 그 프로젝트의 `updatedAt` 만 늦어지고 …»(`expected 1793473325184 to be greater than 1793473325184`) · `project-list-fields` «페이지 편집(ops 하나) 뒤 …»(같은 꼴) — **두 응답이 함께** |
| A7-2 | `memberCount` 를 `count(*) + 1` 로 | 14 · **5 실패** | `admin-projects` 둘(`memberCount` 단언) · `project-list-fields` «멤버 수가 멤버 추가 · 제거를 따라간다»(`expected 2 to be 1`) · `rv-ws-project-list` 둘(수 표 · 질의 수 판) — 두 응답이 함께 |

## 서로 바꾼 자리 셈

1. **ac 의 링크 화면(`/invite/:token` · `/reset/:token`) × ws 의 뼈대 · 라우트 표.** 합친 `app.tsx` 에서 두 라우트는 `RequireAuth` 레이아웃 **밖**,
   `RedirectWhenAuthenticated` 로 감싼 로그인과 같은 자리다 — 뼈대(`WorkspaceLayout`)는 화면 컴포넌트가 스스로 그리므로(목록 · 설정 · 계정 · 관리자 넷) 두
   화면에는 사이드바가 없다. 이 맞물림을 재는 케이스가 어느 쪽에도 없어 `apps/web/test/routes/rb-ws-link-screens.test.tsx`(jsdom · 가짜 api) 다섯을 세웠다:
   로그인한 사람이 초대 · 재설정 링크를 열면 링크를 확인하지 않고(`checkInvite` · `getPasswordReset` 0 회) `/` 의 뼈대 안 목록에 선다(둘) · 로그인 안 한 사람의
   가입 · 재설정 화면에 사이드바(«작업 공간» 내비 · «로그아웃»)가 없다(둘) · 가입 뒤 사이드바 바닥이 가입 응답의 이름을 그리고 «관리자» 묶음이 없다(하나).
   고치기 전도 초록이다(성질 잠금). 실브라우저로는 안 쟀다 — 라우트 표와 렌더 갈래만의 성질이라 jsdom 값으로 적는다.
2. **ac 의 인구조사 · 지침 케이스가 ws 의 새 라우트를 세는가.** ws 의 새 라우트는 웹 라우트(`/admin/:section` «준비 중» — `routes/admin-pending.tsx`)뿐이고 api
   라우트는 없다(ws 는 목록 응답에 칸을 더했다). 웹 인구조사(`api-consumers` · `role-access` · `rv-ws-role-guard` · `store-access` · `shell-css-coverage` ·
   `one-verdict`)는 모두 `../src/**` 글롭 · 디렉터리 훑기라 `admin-pending.tsx` 가 든다. api 인구조사(`user-creation-census` · `permission-matrix` ·
   `token-route-census` · `actor-census`)는 api 라우트를 세어 ws 가 더한 것이 없다 — 합친 판 전량에서 초록인지는 «게이트» 의 api · web 수.
   웹 `/admin/users` · `/admin/invites` · `/admin/projects` · `/admin/audit` 은 ac 가 api 만 지어 지금도 «준비 중» 이다(웹 화면은 다음 트랙 몫).
3. **멤버 목록의 `active`(ac).** 서버는 멤버 줄에 `active` 를 싣는데(`repos/members.ts`) 웹 `ProjectMember` 타입(`api/types.ts`)에 칸이 없고 멤버 화면
   (`settings/members-section.tsx`)이 **그리지 않는다**. 그대로 뒀다(M 트랙 몫).
4. **세션 사용자 꼴.** ac 는 웹 `SessionUser` 를 안 바꿨고 서버의 세 응답(`/me` · 로그인 · 초대 가입 `201`)이 모두 `{ id, email, name, isInstanceAdmin }` 이다
   (가입은 `isInstanceAdmin: false`). ws 의 사이드바(이름 · «관리자» 묶음)와 전환 통지(R-6b — 이름)가 그 꼴을 그대로 읽는다 — 1 의 다섯째 케이스가 가입 응답
   쪽을 잰다. 꼴과 어긋난 **주석** 셋을 고쳤다: `api/types.ts` 의 `isInstanceAdmin`(«프로젝트 목록 머리의 «테마 관리» 링크 · 두 응답» → 사이드바 · 세 응답),
   `shell/workspace-layout.tsx` 머리(밖에 서는 화면에 가입 · 재설정 · 판정 값의 출처에 가입 응답), `apps/api/src/routes/auth.ts` 로그인 응답 주석(«목록 머리의
   관리자 링크» → 사이드바의 «관리자» 묶음).

### 혼자 죽는 변조 — `rb-ws-link-screens.test.tsx`

그 파일만 돌렸다(5 케이스). 백업은 경로 전체 이름 · 바이트 비교 복원.

| 변조 | 바꾼 것 | 결과 | 죽은 케이스 |
|---|---|---|---|
| M3a | `app.tsx` 초대 라우트의 `RedirectWhenAuthenticated` 를 뗌 | 3 · 2 실패 | «로그인한 사람이 invite 링크를 열면 …» · «가입하면 …»(둘 다 목록 글을 못 찾음 — 가입 뒤 목록으로 가는 것도 그 리다이렉트다) |
| M3b | 재설정 라우트의 `RedirectWhenAuthenticated` 를 뗌 | 4 · 1 | «… reset 링크를 열면 …» |
| M3c | 초대 화면을 `WorkspaceLayout` 으로 감쌈 | 4 · 1 | «로그인하지 않은 사람의 가입 화면에는 사이드바 …»(`expected <nav …> to be null`) |
| M3d | 재설정 화면을 `WorkspaceLayout` 으로 감쌈 | 4 · 1 | «… 재설정 화면에도 사이드바가 없다» |
| M3e | `invite.tsx` 가 가입 응답의 `isInstanceAdmin` 을 참으로 바꿔 확정 | 4 · 1 | «가입하면 …»(«관리자» 내비가 섬) |
| M3f | `invite.tsx` 가 가입 응답의 `name` 을 비워 확정 | 4 · 1 | «가입하면 …»(이름을 못 찾음) |

## 게이트

합친 머리 `38f1028f`, 판마다 node v24.21.0(체인 첫 줄), 체인은 `nohup nice -n 10 caffeinate -i <스크립트> & disown` · 슬롯 파일 `gate-slots/rb-ws`.
잠듦: `pmset -g log` 의 마지막 ` Sleep ` 은 2026-10-31 20:28(열 비상) — 게이트(11-01 04:18 – 05:05)와 안 겹친다.

| 단계 | 시각 · load(1분) | 결과 | 실행 · 건너뜀 |
|---|---|---|---|
| `pnpm typecheck` | 04:18 – 04:19 · 32 | rc=0 | — |
| `pnpm build` | – 04:19 | rc=0(`system-admin-1.8.0.wbtheme` 까지) | — |
| `pnpm test --maxWorkers=25%` | 04:19 – 04:38 · 37 → 26 | rc=1 — 8949 통과 · **3 실패** · 3 건너뜀 / 8955 | unit 170 파일 2708 · api 180 파일 2752(건너뜀 2) · web 220 파일 3489 + 3 실패(건너뜀 1) |
| ↳ 실패 셋 혼자 다시 | 04:58 · 11 | rc=0 — **51/51** | `api-consumers` 1.2s · `role-access` 1.1s · `store-access` 1.6s |
| `pnpm test:build:serial` | 04:38 – 04:39 · 26 → 34 | rc=1 — **안 잰 판**: `Timeout calling "onTaskUpdate"` 로 풀이 끊겨 16 파일 중 1 파일 · 11 케이스만 돌았다 | — |
| ↳ 다시 | 04:58 – 05:03 · 11 → 31 | rc=1 — 174 통과 · **1 실패** · 1 건너뜀 / 176(18 파일) | |
| ↳ 그 실패 혼자 | 05:04 · 35 | rc=0 — `screen-chromium` **34/34** | |
| `pnpm test:browser`(워커 3) | 04:39 – 04:57 · 34 → 12 | rc=0 — 646 통과 · 3 건너뜀 / 649(98 파일) | |

- **web 실패 셋**은 모두 `STACK_TRACE_ERROR`(시간 한도 — 7.4s · 9.3s · 12.4s)였다. 셋 다 `../src/**` 를 글롭으로 통째로 읽는 인구조사이고 load 37 판이었다. load 11 에서
  혼자 돌린 판은 1 – 2s · 51/51 이다. 합친 판의 값 실패는 0 이다.
- **serial 의 실패 하나**는 `apps/api/build-test/screen-chromium.test.ts` «끝나면 프로세스가 시작값으로 돌아온다»(`expected +0 to be 3` — 시작 3 · 끝 0). 이 파일 ·
  `apps/api/src/services` 는 기준에서 두 트랙 다 안 바꿨다(`git diff --stat 20b398e2 HEAD` 0). 앞 파일이 남긴 브라우저 자식이 재는 사이 내려간 꼴로 읽고, 혼자 돌린
  판 34/34 를 함께 적는다.
- 실행 수 − 건너뜀이 «수의 등식» 의 list 수와 맞는다: unit 2708 · api 2754 − 2 = 2752 · web 3493 − 1 = 3492 · serial 176 − 1 = 175 · 실브라우저 649 − 3 = 646.
- `pnpm fmt` · `pnpm lint` 는 커밋마다 lefthook 이 돌렸다(경고만 — 합쳐 들어온 ac 파일의 `no-useless-spread` 등, 새 오류 0).

## 수의 등식

`vitest list --json` 으로 셌다(실행 없음). 패키지 · 시스템 테마 · lockfile · vitest 설정이 네 판(`20b398e2` · `79e71e6a` · `8f542bef` · 합친 머리
`38f1028f`)에서 같아(`git diff --stat` 0) 스크래치 사본 대신 **이 워크트리를 그 판으로 잠깐 옮겨**(`git checkout --detach`) 같은 `dist` 로 셌고 끝에
브랜치로 돌아왔다(`back rc=0 38f1028f`). api 는 `globalSetup` 을 뗀 스크래치 설정(테스트 DB 에 안 닿는다), build · 실브라우저는 `DATABASE_URL`(5511)을 줬다.
`list` 는 건너뛰는 판을 안 센다 — 실행 수 − 건너뜀과 견준다. 판마다 node v24.21.0.

| 프로젝트 | 기준 | ws 가 더함 | ac 가 더함 | 이번(RB-WS) | 등식 | 합친 판 list |
|---|---|---|---|---|---|---|
| unit | 2708 | 0 | 0 | 0 | 2708 | 2708 |
| api | 2655 | +9 | +88(더함 93 · 뺌 5 — `user-creation-census` 다섯을 다시 지음) | 0 | 2752 | 2752 |
| web | 3430 | +44(더함 75 · 뺌 31 — `page-head` 19 등) | +13 | +5 | 3492 | 3492 |
| build(serial) | 175 | 0 | 0 | 0 | 175 | 175 |
| 실브라우저 | 631 | +15(더함 18 · 뺌 3) | 0 | 0 | 646 | 646 |

(파일 · 이름 쌍의 집합으로도 견줬다: 합친 판 = 기준∩ws∩main ∪ (ws−기준) ∪ (main−기준) ∪ 이번 다섯, 빠진 것 0 · 남는 것은 이번 다섯뿐. web 의 날 수와
집합 수가 2 갈리는 것은 같은 이름의 케이스 둘이 기준부터 있어서다.)

## 남은 것

- 멤버 화면이 `active` 를 안 그린다(M 트랙 · 위 3).
- 관리자 웹 화면(사용자 · 초대 링크 · 프로젝트 · 기록)은 «준비 중» 그대로다 — ac 는 api 만 지었다.
- ws 이월(R-6a · R-3a · R-2a · R-4a · 역할 · 정렬 한 틱 잃음 · 리뷰 7 · 8)과 ac 이월은 이 합치기가 안 건드렸다.
- 링크 화면 × 뼈대는 jsdom 값만이다(실브라우저 판 없음).

## 지침

1. **«기준선 · 옆 브랜치의 수는 … `vitest list --json` 으로 센다» 의 절차가 판마다 사본 + `pnpm build` 를 요구하는데, 판들 사이에 `packages/*` ·
   `system-themes/*` · lockfile · vitest 설정이 같으면 필요 없다.** 이번에 그 넷의 `git diff --stat` 이 0 인 것을 본 뒤 워크트리를 그 판으로 `git checkout
   --detach` 해 같은 `dist` 로 셌다(세 판 15 분 · 빌드 0). 어디: `.ruler/30-delegation.md` 「워커에게 맡길 때 — wirebound」 의 «기준선 · 옆 브랜치의 수는 …»
   문장 끝. 넣을 문장: «견줄 판들 사이에 `packages/*` · `system-themes/*` · `pnpm-lock.yaml` · `vitest*.config.ts` 의 `git diff --stat` 이 비면 사본 대신 자기 워크트리를
   그 판으로 `git checkout --detach` 해 세고 브랜치로 돌아온다 — `dist` 가 같아 다시 빌드할 것이 없다(세는 동안 소스를 고치지 않는다 · 끝에 `git status` 가 깨끗하고
   머리가 브랜치인지 본다).»
2. **RPC 시간 초과(`Timeout calling "onTaskUpdate"`)는 `test:build:serial` 도 끊는다.** 지침은 unit · web 일꾼이 끊는 판(api 가 시작도 안 함)만 적는다 — serial 은 rc=1 ·
   «1 passed (16)» · 실패 케이스 0 으로 끝나 실패 목록만 보면 «실패 없음» 이다. 어디: `.ruler/30-delegation.md` 같은 절의 «unit · web 일꾼 하나의 RPC 시간 초과 …»
   문장 뒤. 넣을 문장: «`pnpm test:build:serial` 도 같은 시간 초과로 첫 파일 뒤에 멈춘다(16 파일 중 1 · 케이스 11 · 실패 0 · `Errors 1`) — 파일 수를 기준선과 견주고,
   모자라면 그 판은 안 잰 것이라 load 가 내려간 뒤 다시 돈다.»
3. 틀린 지침은 없었다 — «합친 판은 충돌이 난 파일과 함께 git 이 조용히 합친 파일도 `pnpm typecheck` 로 먼저 잰다» 가 이번 판의 유일한 빨강(`invite.test.tsx`
   픽스처 타입)을 잡았다.
