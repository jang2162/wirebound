# RV-TH 보고 — 기본테마 리뷰

브랜치 `feat/default-theme` · 리뷰 기준 `65325712` · 브리프 `.worktrees/.coord/brief-rv-th.md` · node v24.21.0 · 구현자 터미널은 쉬는 중(`orca terminal list` — 이 워크트리에 구현자 하나 · 리뷰어 하나).

## 발견

높은 무게(데이터를 잃음 · 기동이 멈춤 · 프로젝트가 안 열림 · 복원이 깨짐)는 **0** 이다 — 항목 1 의 판에서 옮김 · 토큰 · 숨김 · 편집기 · 옛 스냅샷 복원 · 복원 뒤 기본테마로 바꾸기가 모두 섰다.

| # | 무게 | 무엇 | 재현 | 고쳤나 |
|---|---|---|---|---|
| L1 | 낮음(이름) | `system-admin@1.2.0` 에 고정한 프로젝트 — 이미 `1.2.0` 을 넣은 서버의 **모든** 기존 프로젝트와 `0027` 이 옮긴 프로젝트 — 의 설정 «테마» 요약이 **«관리자 system-admin@1.2.0»** 이다(«새 버전 1.2.1» 이 함께 선다). 고르개 · 관리 화면의 테마 이름은 «기본테마» | 항목 3 의 표 · 실브라우저 `p-commerce` · `p-u2` | 아니오 — 브리프대로 보고만. 아래 «고칠 길» |
| L2 | 낮음(운영 문장) | `SYSTEM_THEMES_DIR` 아래 테마 디렉터리에 `package.json` 이 없으면 산출물이 있어도 «시스템 테마 산출물이 없습니다(…/*/dist/*.wbtheme)» 로 기동이 멈추고, 문장이 그 조건을 말하지 않는다 | 새 케이스(아래)가 고치기 전 문장에서 빨강 | 예 — 문장에 «`package.json` 이 있는 테마 디렉터리만 읽는다» · `apps/api/README.md` 표의 고치는 법에 한 줄 |
| L3 | 낮음(문서) | `apps/api/README.md` 가 «`0027` 이 `system-admin` 최신판으로 옮긴다» 고 적었는데 운영에서는 `migrate` 가 시딩보다 먼저라 그 판이 이미 들어 있던 판(`1.2.0`)이다 | 항목 1 · 3 | 예 — «그때 DB 에 있는 … 숨기지 않은 최신판» 과 그 까닭을 적었다 |
| L4 | 낮음(앞부터 있던 것) | 인스턴스 관리자인 owner 의 테마 고르개에 판이 다 숨은 넷이 테마 칸으로 선다. 고르면 판 칸이 «1.2.0 (숨김)»(꺼짐) 하나인데 그 판이 골라지고 «바꾸기» 가 켜져 누르면 «이 판은 숨겨져 고를 수 없습니다»(422 `hidden-version` · 바인딩 그대로) | 실브라우저 `p-docs`: 판 `["1.2.0:1.2.0 (숨김):off"]` · 골라진 판 `1.2.0` · 단추 켜짐 · 뒤 바인딩 `system-admin@1.2.0 rev 2` | 아니오 — `theme-chooser.tsx` 의 `themeOptions` · `pickTheme` 은 이 브랜치가 안 건드렸다(main 그대로). 이 트랙이 판이 다 숨은 테마 넷을 늘 세워 눈에 띄게 됐을 뿐이다. 고칠 길: `themeOptions` 가 지금 테마가 아닌 테마 가운데 고를 판이 0 인 것을 뺀다 |
| L5 | 낮음(목) | 웹 단위 목 셋(`apps/web/test/admin-theme.ts:12` · `test/api/http-client.test.ts:68` · `test/api/theme-client.test.ts:28`)이 `system-admin` 의 이름을 `'관리자'` 로 든다 | 항목 4 | 아니오 — 실물과 견주는 케이스가 아니다. 이름을 맞추려면 셋을 `'기본테마'` 로(단언이 그 글자를 보는지 함께 센다) |

### L1 고칠 길(고르지 않았다 — 코디네이터 · 사용자 결정)

1. **웹 문안만**: `CurrentTheme`(`apps/web/src/settings/theme-section.tsx`)이 고정판의 `manifest.name` 대신 테마 줄의 이름(최신판 — `GET /api/theme-packages` 의 `name`, 또는 `GET …/theme` 에 실을 새 칸)을 그린다. 바인딩 · 스냅샷은 그대로이고 «관리자» 는 관리 화면의 판 줄(그 판의 이름 — 그 판에서는 참)에만 남는다. 가장 작다.
2. **데이터를 올림**: 기동 시딩 뒤 `system-admin@1.2.0` 에 고정한 프로젝트를 `1.2.1` 로 올린다(`theme_rev` + 1). 두 판의 내용은 이름 · 판 글자만 다르다(항목 3) — 화면이 같다. 마이그레이션으로는 못 한다(`migrate` 때 `1.2.1` 행이 아직 없다). «판 고정» 의 예외를 정본 §6 에 적어야 한다.
3. **그대로**: owner 가 설정의 «새 버전 1.2.1» 로 올린다 — 프로젝트마다 손이 든다.

## 1 운영 DB 를 흉내 낸 판의 `0027`

### 판

- main `084d7027` 을 `git archive` 로 스크래치에 풀고 `pnpm install --frozen-lockfile --prefer-offline` · `pnpm build`(테마 다섯 `1.2.0` 산출물).
- 이 워크트리 컨테이너(5462)에 새 DB `wb_rvth` 를 만들어 main 사본으로 `migrate`(0025 까지) → main api 를 3062 에 띄워 다섯을 시딩.
- 그 api 에 REST 로: 넷 각각에 고정한 프로젝트 넷(`p-commerce` · `p-docs` · `p-portal` · `p-saas`) · 옛 스냅샷을 찍은 `p-snap`(saas-marketing · 토큰 하나 · 페이지 하나 · 스냅샷 `before`, payload 의 `theme` 는 `{ themeId: system-saas-marketing, version: 1.2.0, tokens }`) · 대조 `p-admin`(admin · 토큰 하나) · 일반 사용자 `u2` 의 `p-u2`(docs). 프로젝트마다 페이지 하나.
- **대조군 — 화면의 «테마 바꾸기» 와 같은 길**: 넷 + `p-snap` 과 같은 테마 · 토큰의 복제 프로젝트(`c-p-*`)를 세우고, 웹 `ThemeChooser.apply` 와 같게 `migrateTokens(옛 manifest, admin@1.2.0 manifest, 토큰)` 뒤 `PUT …/theme`(admin@1.2.0)으로 바꿨다. 옮기기 전 `GET …/theme/impact?themeId=system-admin&version=1.2.0` 도 적었다.
- main api 를 내리고 **이 브랜치로 `migrate`**(`0026-personal-modules` · `0027-retire-system-themes` 올라감) → **이 브랜치 api** 를 3062 에 띄웠다(기동 시 `system-admin@1.2.1` 만 새로 넣음 — 이 워크트리에 남은 걷은 넷의 `dist` 는 이미 행이 있어 시딩이 안 건드리는 판이다 · 새 DB 판은 항목 2).

### 잰 값

| 프로젝트 | 옮기기 전 토큰 | impact(admin@1.2.0) kept · dropped · defaulted | 옮긴 뒤 바인딩 | 토큰 = 대조군 | rev · `themeRev` |
|---|---|---|---|---|---|
| p-commerce | primary `#111111` · price `#ff0000` · radius.md `6px` · body.fontSize `15px` | 3 · 1 · 13 | `system-admin@1.2.0` · primary · body.fontSize | 같음 | 1 → 2 · 2 |
| p-docs | primary `#222222` · body.lineHeight `2` | 1 · 1 · 15 | `system-admin@1.2.0` · primary | 같음 | 1 → 2 · 2 |
| p-portal | surface `#fefefe` · space.unit `5px` | 2 · 0 · 14 | `system-admin@1.2.0` · 둘 다 | 같음 | 1 → 2 · 2 |
| p-saas | 없음 | 0 · 0 · 16 | `system-admin@1.2.0` · 없음 | 같음 | 1 → 2 · 2 |
| p-snap | primary `#333333` | 1 · 0 · 15 | `system-admin@1.2.0` · primary | 같음 | 1 → 2 · 2 |
| p-u2(일반 사용자) | 없음 | — | `system-admin@1.2.0` · 없음 | — | 1 → 2 |
| p-admin(대조) | primary `#444444` | — | 그대로 | — | 1 → 1 |

- p-commerce 의 `radius.md: 6px` 은 admin 기본값과 같아 impact 는 «kept» 로 세지만 저장값에서는 빠진다 — 대조군(화면 길의 `PUT`)도 같은 값을 뺐다. 화면이 보이는 값(그 토큰의 값 `6px`)은 같다.
- `theme_packages` 숨김: 넷의 `1.2.0` 이 모두 `hidden_at` = 마이그레이션 시각. admin `1.2.0`(«관리자») · `1.2.1`(«기본테마») 은 숨김 없음.
- 목록 `GET /api/theme-packages`:
  - 관리자: `system-admin(기본테마) latest=1.2.1 [1.2.1:기본테마, 1.2.0:관리자]` + 넷이 `latest=null` · 판 `1.2.0:…:hidden` 으로 선다.
  - 일반 사용자 `u2`: `system-admin(기본테마) latest=1.2.1 [1.2.1:기본테마, 1.2.0:관리자]` 하나 — **넷이 안 선다.**
- **옛 스냅샷 복원**(`p-snap` · `before`, 판 3): 200. 바인딩이 `system-saas-marketing@1.2.0`(숨긴 판) · 토큰 `#333333` · rev 3 으로 돌아갔다. 그 판의 `theme.js` 조회 200 · 내보내기 미리보기 200 · `themeId: system-saas-marketing@1.2.0` · `themeWarning: null`. `GET …/theme` 의 `latest` 는 `null`(같은 테마에 숨기지 않은 판이 없다). admin@1.2.1 로의 impact 200(kept 1 · dropped 0 · defaulted 15).
- **실브라우저**(이 브랜치 웹 vite 5862 → api 3062 · headless Chromium · `playwright-core`):
  - 옮긴 `p-commerce` 의 편집기: 알림 0 · 캔버스 iframe 에 `system-admin/1.2.0/files/theme.css` 가 실림 · `--wb-semantic-primary: #111111`(이어진 토큰).
  - 복원한 `p-snap` 의 편집기: 알림 0 · `system-saas-marketing/1.2.0/files/theme.css` · `--wb-semantic-primary: #333333` — 숨긴 판으로 그린다.
  - `p-snap` 설정 «테마»(관리자 = owner): 요약 «마케팅 system-saas-marketing@1.2.0 · 바꾼 토큰 1 / 21개», 판 «1.2.0 (지금 · 숨김)». 테마를 «기본테마» 로 고르면 판 «1.2.1» 이 골라지고 «이어짐 1 · 버려짐 0 · 기본값 15» → «바꾸기» → «테마를 바꿨습니다» · 요약 «기본테마 system-admin@1.2.1 · 바꾼 토큰 1 / 16개». 그 뒤 편집기: `system-admin/1.2.1/files/theme.css` · primary `#333333`.
  - 일반 사용자 `u2` 의 `p-u2` 설정: 테마 칸이 «기본테마» 하나 · 판 «1.2.1» · «1.2.0 (지금)».
  - 관리자 테마 관리 화면(`/admin/themes`): «기본테마 system-admin · 2판» · 넷이 «커머스 system-commerce · 1판 · 숨김 1» 꼴로 선다. 기본테마의 판 줄은 «1.2.1 기본테마» · «1.2.0 관리자».

## 2 기동 시딩 가드

- **이 워크트리의 새 DB**: 걷은 넷의 `system-themes/{commerce,docs,portal,saas-marketing}/dist/*.wbtheme` 가 남아 있고(`package.json` 은 admin 하나) 새 DB `wb_rvth2` 에 이 브랜치로 `migrate` 뒤 api 를 띄우자 `theme_packages` 가 `system-admin|1.2.1|기본테마` **하나**다 — 넷이 안 들어온다.
- **운영 이미지**: `Dockerfile` 의 `build` 단계는 `COPY . .` 로 문맥을 통째 싣고 `api` 단계는 `/app` 을 통째 옮긴다 — 시딩이 읽는 `/app/system-themes/admin/package.json` 은 추적 파일(`git ls-files system-themes | grep -c package.json` = 1)이라 실린다. `.dockerignore` 의 `**/dist` · `**/node_modules` · `**/.tsbuild*` 가 서버 체크아웃에 남는 걷은 넷의 산물을 문맥에서 뺀다 — 이미지의 `system-themes` 에는 admin 하나만 빌드된다.
- **`SYSTEM_THEMES_DIR` 의 운영 쓰임**: `compose.yaml` · `Dockerfile` · `docs/guides/*` · `docker/` 에서 0 곳(`git grep -c SYSTEM_THEMES_DIR` 종료 1) — 배포는 기본값(`/app/system-themes`)을 쓴다. 바깥 디렉터리를 주는 판(손으로 세운 서버)은 그 아래 테마 디렉터리마다 `package.json` 이 있어야 한다. 없으면 «산출물이 없습니다» 로 기동이 멈추는데 문장이 그 조건을 말하지 않았다 — 발견 L2 로 고쳤다.

## 3 판 올림 `1.2.0` → `1.2.1`

- 이미 `1.2.0` 을 시딩한 DB(`wb_rvth` — 최상위 사용자 DB 와 같은 꼴)에서 이 브랜치 api 가 선다 · 기동이 `system-admin@1.2.1` 만 새로 넣는다(`1.2.0` 은 그대로 · sha256 견줌 통과).
- 두 판의 내용 차이: `manifest.json` 의 `name` · `version` 과 `theme.js` 안의 같은 두 글자(`'관리자'` → `'기본테마'` · `0` → `1`)뿐이다(풀어 `diff -r` · `theme.css` 와 자산은 같은 바이트).
- **프로젝트는 고정한 `1.2.0` 에 그대로 있다** — `p-admin`(대조) · `p-u2` · `0027` 이 옮긴 다섯 모두 `system-admin@1.2.0`. 운영에서 `migrate` 는 api 기동의 시딩보다 먼저 돌므로(`compose.yaml` 의 `migrate` → `api`) `0027` 이 옮기는 판도 `1.2.0` 이다.
- «관리자» 가 보이는 자리(셈: 웹 `manifest?.name` · `pkg.name` · `row.name` 을 그리는 곳 — `git grep` 으로 `theme-section.tsx:116` · `theme-chooser.tsx:42` · `admin-themes.tsx:301,324,330`. CLI · MCP · 내보내기는 테마 이름을 안 그린다):

  | 자리 | `1.2.0` 에 고정한 프로젝트에서 | 근거 |
  |---|---|---|
  | 설정 «테마» 의 지금 테마 요약 | **«관리자 system-admin@1.2.0»** + «새 버전 1.2.1» | 고정판의 `manifest.name`(`theme-section.tsx` 의 `CurrentTheme`) |
  | 테마 고르개의 테마 칸 | «기본테마» | 테마 줄의 이름 = 최신판의 것(`GET /api/theme-packages` 의 `name`) |
  | 테마 고르개의 판 칸 | «1.2.1» · «1.2.0 (지금)» — 이름 없음 | |
  | 관리자 테마 관리 화면 | 테마 «기본테마» · 판 줄 «1.2.0 관리자» | 판 줄은 그 판의 이름(그 판에서는 참) |

  → 발견 L1.

## 4 남은 «관리자» · «다섯»

다시 센 법: 추적 파일 가운데 이력(`docs/superpowers/plans/*` · 날짜 붙은 앞 spec) · 사본(`docs/guideline/` · `.ruler/<스택>/`) 밖에서 파이썬으로 ① 넷의 id · 경로 ② «테마 · theme» 와 «다섯 · 5종 · 5개 · five» 가 20 글자 안 ③ «관리자» 와 테마가 15 글자 안 · `'관리자'` 리터럴.

- ① 넷의 id · 경로: 4 파일 — `apps/api/README.md:73`(걷은 넷을 말하는 절) · `apps/api/src/db/migrations/0027-…` · `apps/api/test/migration-0027.test.ts` · 정본 설계서 `:369`(«저장소가 더는 내지 않는 시스템 테마» 가 숨겨져 남는다는 절). 모두 지금 참.
- ② «다섯»: `apps/web/build-test/canvas-drop-review.test.ts:268`(«테마가 하나라» — 참) · `v4-settings-ui.test.ts:8`(«다섯 화면» — 테마 아님) · `apps/api/build-test/screen-sandbox-review.test.ts:450`(«소켓 생성자 다섯» — 테마 아님) · 날짜 붙은 앞 spec 4 파일(이력). **지금 문서에 테마 다섯은 0.**
- ③ «관리자» 가 테마 이름인 자리: 지금 문서(README · 정본 · `apps/api/README.md` · `.ruler/AGENTS.md` · `docs/guides/*` · `packages/theme-kit/**/*.md` · `/llms.txt`(`apps/web/public/llms.txt` · `apps/web/config/llms-txt.ts`)) 0 — 나머지 «관리자» 는 인스턴스 관리자 · 화면 상태 · 메뉴 제목이다. 코드에는 웹 단위 목 셋(`apps/web/test/admin-theme.ts:12` · `api/http-client.test.ts:68` · `api/theme-client.test.ts:28`)이 테마 이름을 `'관리자'` 로 든다 — 목 값이고 실물 manifest 와 견주지 않는다(발견 L5).
- `.ruler/AGENTS.md:21` 의 `system-themes/*` 줄이 «admin 하나 — id 는 system-<이름> · 보이는 이름 «기본테마»» 이고 생성물 `AGENTS.md:25` 가 같은 줄이다(생성물 시각 17:33 > 소스 13:36 — `ruler apply` 가 소스를 고친 뒤 돌았다).

## 변조

| 변조 | 자리 | 실행 · 죽은 케이스 | 실패 값 |
|---|---|---|---|
| V1 문장에서 `package.json` 조건을 뗀다(고치기 전 문장) | `apps/api/src/services/system-themes.ts` 의 `seedSystemThemes` 첫 `throw` | `apps/api/test/system-themes.test.ts` 15 실행 · 1 실패 — «산출물이 package.json 없는 디렉터리에만 있으면 던지고 그 규칙을 말한다» 만 | «expected … to throw error including '(백틱)package.json(백틱) 이 있는 테마 디렉터리만' but got '시스템 테마 산출물이 없습니다(/var/folders/…'» |

백업은 경로 전체 이름(`backup__apps__api__src__services__system-themes.ts`) · 복원 `cmp` 같음. 고친 뒤 그 파일 15 실행 · 15 통과 · 0 건너뜀.

## 게이트

`f1b20cd9`(구현 `65325712` + 이 리뷰의 고침 · 보고) · node v24.21.0 · 자리(`gate-slots`) 0 개에서 `rv-th` 를 만들고 띄움 · 끝나고 지움 · `nohup nice -n 10 caffeinate -i`.

| 단계 | 결과 | 실행 · 건너뜀 | 시간 |
|---|---|---|---|
| `pnpm typecheck` | 통과 | — | 14s |
| `pnpm build` | 통과 | — | 5s |
| `pnpm lint` | 오류 0 · 경고 90(모두 이 리뷰가 안 건드린 줄 — 고친 두 파일 0) | — | 0s |
| `pnpm fmt:check` | 통과 | 1173 파일 | 0s |
| `pnpm test --maxWorkers=25%` | 통과 | 501 파일 · 8152 통과 · 1 건너뜀 (8153 — 구현 게이트보다 새 케이스 1) | 566s |
| `pnpm test:build:serial` | 통과 | 17 파일 · 156 통과 · 1 건너뜀 | 134s |
| `pnpm test:browser` | 통과 | 81 파일 · 487 통과 · 1 건너뜀 | 635s |

- 게이트 18:15:17–18:37:51 · `pmset -g log` 의 마지막 Sleep 은 10:08 — 안 겹친다.
- 숨은 글자(제어 · 폭 없는 글자 · 방향 제어 · U+2028/9 · 서로게이트) 바뀐 파일 0.
- 측정 스택: main 사본 api · 이 브랜치 api(3062) · vite(5862)를 내렸고 측정 DB `wb_rvth` · `wb_rvth2` 를 지웠고 main 사본 · 비밀번호가 든 스크래치 env 를 지웠다. 자기 DB 컨테이너(5462)는 남겼다. 이 워크트리 경로의 vitest · vite · api 프로세스 0.

## 지침

1. **시스템 테마 판을 올리는 트랙의 데이터 마이그레이션이 «최신판» 을 겨누면 옛 판을 얻는다.**
   - 무엇이 비었나: 배포는 `migrate` → api 기동(시딩) 차례라 마이그레이션이 도는 때 DB 에는 그 트랙이 새로 낸 판이 아직 없다. `0027` 이 «`system-admin` 최신판» 으로 옮긴 프로젝트가 «관리자 system-admin@1.2.0» 으로 섰다(발견 L1). 구현 케이스는 테스트 DB 의 global-setup 이 새 판을 먼저 시딩한 판이라 이것을 못 본다.
   - 어디: `.ruler/20-verification.md` 「수를 셀 때는 두 번 세고 표본을 열어 본다 — 덧붙임」 의 «마이그레이션을 새로 두면 …» 줄 뒤.
   - 넣을 문장: «**시스템 테마를 고르는 데이터 마이그레이션은 앞 판만 시딩된 DB 에서 잰다** — 배포는 `migrate` 가 api 기동의 시딩보다 먼저라 마이그레이션이 보는 «최신판» 은 이 트랙이 새로 낸 판이 아니라 이미 든 판이다. 테스트 DB 는 global-setup 이 새 판을 먼저 넣어 이 판을 못 낸다 — main 사본으로 시딩한 DB 에 이 브랜치로 `migrate` 하고 바인딩의 판을 적는다(`docs/superpowers/plans/2026-10-20-rv-th-report.md` 항목 3).»
2. **경로로 찾는 프로세스 정리는 cwd 로 띄운 서버를 놓친다.**
   - 무엇이 비었나: 「워크트리 폐기」 의 `ps -eo pid,etime,command | grep '<워크트리명>'` 는 명령 줄에 경로가 있는 것만 찾는다. 그 디렉터리에 들어가 `node --import tsx src/main.ts`(상대 경로)로 띄운 api 는 명령 줄에 워크트리 이름이 없어 안 걸린다 — 이 리뷰에서 main 사본 api 를 `pkill -f <경로>` 로 내렸다고 믿은 채 다음 단계(`migrate`)를 돌았다(포트로 다시 세어 알았다 · 측정 값에는 영향 없음).
   - 어디: `.ruler/10-worktree.md` 「워크트리 폐기」 의 «워커가 띄운 dev 서버가 남아 있는지 본다» 항목.
   - 넣을 문장: «명령 줄에 경로가 없는 서버(그 디렉터리에서 상대 경로로 띄운 것)는 `ps … | grep` 에 안 걸린다 — 그 워크트리의 포트로 `lsof -nP -t -iTCP:<PORT> -sTCP:LISTEN` 을 세고, pid 의 cwd(`lsof -p <pid> -a -d cwd`)가 그 워크트리인지 본 뒤 내린다.»
