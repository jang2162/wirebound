# FX-TH 보고 — 기본테마 리뷰 대응

브랜치 `feat/default-theme` · 기준 `c3c10eb2` · 브리프 `.worktrees/.coord/brief-fx-th.md` · 리뷰 `2026-10-20-rv-th-report.md` · node v24.21.0 · 이 워크트리의 구현자 · 리뷰어 터미널은 쉬는 중(`orca terminal list`).

## L1 — 설정 «테마» 요약의 이름

### 바꾼 것

- 서버 `GET · PUT …/theme`(409 의 `current` 도)에 칸 **`latestName`** 을 더했다 — `latest` 판의 이름 · `latest` 가 `null` 이면 `null`(`apps/api/src/routes/project-theme.ts` 의 `themeView`). 판과 이름을 한 질의로 고른다(`repos/theme-packages.ts` 의 `latestVisiblePackage` — `latestVisibleVersion` 은 그것의 `version`). 테마 목록(`GET /api/theme-packages`)의 테마 `name` 이 «숨기지 않은 최신판의 이름» 이라 고르개의 테마 칸과 같은 판이다.
- 웹 `CurrentTheme`(`apps/web/src/settings/theme-section.tsx`)이 `latestName ?? manifest.name ?? themeId` 를 그린다 — 숨기지 않은 판이 없으면 지금처럼 고정판의 이름.
- 웹 응답 모양(`http-client.ts` 의 `isProjectThemeView`)이 `latestName` 을 글 · `null` 로 본다 · 타입 `ProjectThemeView.latestName`.
- `apps/api/README.md` 의 GET 줄 · 정본 설계서 §설정 «테마» 의 «지금 테마 요약».
- 바인딩 · 스냅샷 · 관리 화면 판 줄은 안 건드렸다. 데이터 올림(길 2)은 안 했다.

**왜 서버 칸인가(웹만으로 목록을 읽는 길 대신):** 요약은 viewer 에게도 서고, 목록을 따로 읽으면 요약이 두 응답 사이에서 이름을 바꿔 그린다(먼저 manifest 이름 → 목록이 오면 테마 이름). 한 응답 안에서 `latest` 와 같은 행의 이름을 실으면 «새 버전» 과 이름이 늘 한 판에서 온다.

### 고치기 전 값

- 웹 단위: 고정판 manifest 이름 «옛 이름» · 최신판 이름 «새 이름» 인 바인딩에서 요약 첫 줄이 «새 이름 system-admin@0.1.0» 이 아니다(케이스 «이름은 테마 줄의 것 …» 이 고치기 전 소스에서 빨강 — `Unable to find … 새 이름 system-admin@0.1.0`). 같은 판의 둘째 케이스(«숨기지 않은 판이 없으면 …»)는 고치기 전에도 초록(«옛 이름 system-admin@0.1.0»)이다 — 원래 성질을 잠근다.
- 실브라우저: 리뷰 보고 항목 3 의 «관리자 system-admin@1.2.0» + «새 버전 1.2.1».

### 변조

| 변조 | 자리 | 실행 · 죽은 케이스 | 실패 값 |
|---|---|---|---|
| M1 요약이 `latestName` 을 안 본다(고치기 전) | `theme-section.tsx` 의 `CurrentTheme` | `theme-chooser.test.tsx` 15 · 1 — «이름은 테마 줄의 것 …» | `Unable to find … 새 이름 system-admin@0.1.0` |
| M2 `latestName ?? themeId`(manifest 이름 뗌) | 같은 자리 | 15 · 1 — «숨기지 않은 판이 없으면(latest 가 null) …» | `Unable to find … 옛 이름 system-admin@0.1.0` |
| M3 모양 검사에서 `latestName` 뗌 | `http-client.ts` 의 `isProjectThemeView` | `http-client.test.ts` 115 · 1 — «각 shape는 계약 밖 응답을 ApiError로 끊는다»(새 줄 `latestName: 1`) | `ApiError가 아니라 [object Object]가 나왔다` |
| M4 `latestName` 을 고정판 manifest 이름으로 | `project-theme.ts` 의 `themeView` | `project-theme.test.ts` 28 · 1 — «latestName 은 latest 판의 이름이다 …» | `expected { … } to match object { version: '1.2.1', …(2) }` |
| M5 PUT 응답만 `latestName` 을 대상 manifest 이름으로 | PUT 핸들러의 `return themeView(…)` | 28 · 1 — «고정한 판을 숨긴 뒤 토큰만 저장하는 것은 받는다» | `expected { themeId: 'sample', … } to match object { rev: 2, …(2) }` |
| M6 고정판 = 최신판이면 `latestName: null` | `themeView` | 28 · 1 — «viewer 가 읽는다 — 새 프로젝트는 …»(바꾼 케이스) | `expected … to deeply equal …` |

백업은 경로 전체 이름 · 복원 `cmp` 같음(변조마다).

## L4 — 고르개의 판이 다 숨은 테마

### 바꾼 것

- `theme-chooser.tsx` 의 `themeOptions` 가 **켜진 판이 없는 테마**를 뺀다(`versions.some((v) => !v.disabled)`). 지금 테마는 지금 판이 늘 켜져 있어(`disabled: v.hidden && !pinned`) 따로 갈래 없이 남는다 — 처음엔 «지금 테마면 남긴다» 갈래를 함께 두었는데, 그것을 뗀 변조가 살아 쓸데없는 조건임을 보고 걷었다(아래 M8).
- 고르개 머리말에 «판이 다 숨은 테마는 테마 칸에도 안 선다(지금 테마는 빼고)».

### 고치기 전 값

- 관리자 응답에 판이 다 숨은 테마 `ghost`(«유령») 를 더하면 테마 칸이 `['Acme', '관리자', '유령']` — 새 케이스 «판이 다 숨은 테마는 테마 칸에 안 선다» 가 고치기 전 소스에서 빨강.
- 지금 테마의 판이 다 숨은 판(«지금 테마는 판이 다 숨었어도 …»)은 고치기 전에도 초록(테마 칸 `['Acme', '관리자']` · 판 칸 `['0.2.0 (숨김) [off]', '0.1.0 (지금 · 숨김)']`) — 원래 성질을 잠근다.

### 변조

| 변조 | 자리 | 실행 · 죽은 케이스 | 실패 값 |
|---|---|---|---|
| M7 거르기를 뗀다(고치기 전) | `themeOptions` 의 `themes` | `theme-chooser.test.tsx` 17 · 1 — «판이 다 숨은 테마는 테마 칸에 안 선다» | `expected [ 'Acme', '관리자', '유령' ] to deeply equal [ 'Acme', '관리자' ]` |
| M8 (첫 판) «지금 테마면 남긴다» 갈래를 뗀다 | 같은 자리 | 17 · 0 — **살았다** | 지금 판은 `disabled` 가 늘 거짓이라 그 갈래가 아무것도 안 갈랐다 → 갈래를 걷었다 |
| M8 (둘째 판) `v.hidden` 으로 거른다 | 같은 자리 | 17 · 1 — «판이 다 숨은 테마는 …» | **무효** — `VersionOption` 에 `hidden` 칸이 없어 `!undefined` 가 늘 참(vitest 는 타입을 안 본다). 표에 남기고 셈에 안 넣는다 |
| M8b 테마의 `latest !== null` 로 거른다(숨김으로 거르는 꼴) | 같은 자리 | 17 · 1 — «지금 테마는 판이 다 숨었어도 테마 칸에 선다» | `expected [ '0.1.0 (지금)' ] to deeply equal [ '0.2.0 (숨김) [off]', …(1) ]` |

## L5 — 웹 단위 목의 `system-admin` 이름

### 셈(바꾸기 전)

`git grep -n "관리자" -- apps/web/test` 를 열어 테마 이름인 줄만 골랐다(나머지는 인스턴스 관리자 · 화면 상태 · 메뉴 제목 · 프로젝트 이름 «관리자 콘솔» · 사람 이름 «관리자님»).

| 파일 | 목(이름 글자) | 그 글자를 단언하는 자리 |
|---|---|---|
| `apps/web/test/admin-theme.ts`(`ADMIN_FIXTURE`) | 1 | **1** — `theme-chooser.test.tsx` «지금 고정한 판이 목록에 없으면 …» 의 테마 칸(목록에 없는 지금 테마의 이름은 고정판 manifest 에서 짓는다 — `themeOptions` 의 `currentName`). 글자 셈은 그 줄을 `PACKAGES` 몫으로 읽어 0 으로 셌고, 아래 M9 가 바로잡았다 |
| `apps/web/test/api/http-client.test.ts` | 1 | 0 |
| `apps/web/test/api/theme-client.test.ts` | 1 | 0 |
| `apps/web/test/settings/token-editor.test.tsx`(리뷰 셈 밖) | 1 | 0 |
| `apps/web/test/settings/theme-chooser.test.tsx`(리뷰 셈 밖) | 3(`CURRENT.latestName` · `PACKAGES` · `ADMIN_PACKAGES`) | 4(요약 1 · 테마 칸 3) — 테마 칸 하나는 위 `ADMIN_FIXTURE` 몫 |
| `apps/web/test/routes/admin-themes.test.tsx`(리뷰 셈 밖) | 2 | 5(`/^관리자/` 3 · 줄 글 2) |

리뷰가 든 셋 가운데 `ADMIN_FIXTURE` 만 단언 1 곳이 있고, 나머지 단언 9 곳은 리뷰 셈 밖의 두 파일이 **제 목**에서 읽는다. 이름을 맞추는 것이 일이라 여섯 파일의 목 9 곳과 단언 10 곳을 모두 `'기본테마'` 로 바꿨다(`description` «관리자 화면용 기본 테마» 는 설명이라 그대로 — 실물 manifest 의 설명도 «관리자 화면 기본 테마 …» 다).

### 변조(셈 확인)

| 변조 | 자리 | 실행 · 죽은 케이스 | 실패 값 |
|---|---|---|---|
| M9 `ADMIN_FIXTURE` 이름을 `'ZZ-목-이름'` 으로 | `admin-theme.ts` | 그것을 가져오는 9 파일 + `http-client.test.ts` · `theme-client.test.ts` — 283 · 1 — `theme-chooser.test.tsx` «지금 고정한 판이 목록에 없으면 …» | `expected [ 'Acme', 'ZZ-목-이름' ] to deeply equal [ 'Acme', '기본테마' ]` — 단언하는 자리가 그 하나뿐이다 |
| M10 `admin-themes.test.tsx` 의 목록 목을 `'관리자'` 로 되돌림 | 그 파일의 `PACKAGES` | 19 · 4 — 목록 · 고르기 · 올리기 케이스 | `Unable to find … name /^기본테마/` · 줄 글 `toEqual` — 바꾼 단언이 그 목을 본다 |

L5 는 목 값만 바꿨다 — 새 케이스가 없다.

### 웹 단위 판

- L5 직후 `pnpm vitest run --project web`(일꾼 수 기본)을 한 번 돌렸을 때 195 파일 · 3259 통과 · **2 실패** 였다. dot 출력이라 어느 케이스인지 안 남았다.
- 같은 소스를 `--maxWorkers=25% --reporter=json` 으로 다시 돌리자 3261 통과 · 0 실패. 첫 판은 일꾼 수를 안 묶은 판이라 부하로 본다 — 전량 게이트(아래)가 다시 잰다.
