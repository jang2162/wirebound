# RV-TP 보고 — 테마 패턴 제거 리뷰

브리프: `.worktrees/.coord/brief-rv-tp.md` · 공통 `common-w4.md`. 리뷰 대상 `feat/no-theme-patterns` HEAD `6758cc4e`(구현 보고 `2026-10-22-tp-report.md`). 리뷰는 고치지 않고 잰다. node v24.21.0 · 자기 DB 5471.

## 높은 무게

**없다.** 데이터를 잃는 길 · 서버가 죽는 길 · 남의 화면 · 인가 우회 모두 안 섰다. 기동이 멈추는 판은 «`patterns` 를 실은 **시스템 테마 산출물**» 하나인데, 그 산출물은 `wb-theme build` 가 먼저 거절해 지을 수 없고 시딩은 `package.json` 이 있는 테마 디렉터리만 읽는다(TH 로 걷힌 넷의 디렉터리에 남은 `dist` 는 줍지 않는다) — 닿는 길이 없다. DB 에 그런 행이 있어도 기동은 안 멈춘다(「1」 의 `seed-real-dir`).

## 판정에 올릴 것 — 중간

**R1. `patterns` 를 실은 저장된 패키지는 캔버스와 내보내기가 갈린다.** 캔버스 · 속성 패널은 그 테마로 그리고(서버 manifest 를 다시 검증하지 않는다), html 내보내기는 기본 뷰 + 미리보기 경고 한 줄, pptx 내보내기는 기본 뷰 · 경고 없음(pptx 미리보기에 그 칸이 원래 없다 — main 도 같다), CLI · MCP lint 는 테마 규칙만 빼고 돈다. **그런 행은 기존 DB 에 실제로 있다** — 옛 `system-commerce` · `system-portal` 의 판(숨김)이고, 판 3 스냅샷 복원이 프로젝트를 그 판으로 되돌린다(탐침 값은 「1」). 배포된 서비스는 없지만 사용자의 개발 DB(TH 앞에 시딩된 판)가 이 꼴일 수 있다 — 리뷰는 5433 을 안 본다. 고르는 길:
- (가) 그대로 받는다 — 브리프 «과거 호환은 고려하지 않는다». 그 프로젝트는 테마를 다른 판으로 바꾸면 풀린다.
- (나) 저장된 패키지의 다시 읽기(내보내기 · lint)만 `patterns` 를 걷고 읽는다 — 새로 들이는 입구(빌드 · 업로드)는 지금처럼 거절. 걷힌 `readNewWbtheme` 의 «새 패키지 · 다시 읽기» 둘로 가르던 모양으로 돌아간다.

## 바꾼 것 (리뷰 커밋 `861f9a55` — 주석 · 문장만)

| 파일 | 고친 것 |
|---|---|
| `apps/web/src/drag/use-placement.ts` | «(서버에서 다시 읽기 · 패턴 다시 전개)» → «(서버에서 다시 읽기)» |
| `apps/web/src/routes/editor.tsx` | «캔버스 · 속성 패널 · 패턴 고르개가 읽고» → «캔버스 · 속성 패널이 읽고» |
| `apps/web/src/store/anchored-ops.ts` | «모듈 · 패턴 넣기» 셋 → «모듈 넣기» |
| `apps/web/src/theme/bundle-loader.ts` | «선언(variant · 토큰 · 패턴)» · «속성 패널 · 패턴 고르개는» |
| `apps/web/src/theme/project-theme.tsx` | 머리말 «패턴 고르개가 읽는다» · «variant · 패턴 칸» |
| `apps/web/src/projects/project-actions.ts` | «노드(… · 모듈 · 패턴)» |
| `apps/web/test/api-consumers.test.ts` · `apps/web/build-test/theme-review.test.ts` | 주석의 «패턴 고르개» |
| `apps/web/test/store/anchored-ops.test.ts` | 케이스 이름 «op 이 여럿인 넣기(패턴)» → «(모듈)» |
| 정본 설계서 §6.0 | «빌드 · 업로드 · 다시 읽기가 모두 … 거절한다» → 빌드 · 업로드는 거절, 저장된 패키지의 다시 읽기는 자리마다(내보내기 기본 뷰 · lint 테마 규칙 뺌 · 캔버스는 그 테마) — 「1」 의 잰 값 그대로 |

## 잰 값

### 1. 거절이 입구마다 같게 서는가

탐침: 스크래치의 vitest 설정(root = 이 체크아웃 · `test.dir` = 스크래치 · api 프로젝트의 `globalSetup` · `setupFiles` · 루트 설정의 `resolve.alias`) 위 `withApi` 한 판. `patterns` 를 실은 manifest(`manifestOf('patterned','1.0.0',{ patterns: { 'hero.split': … } })`)를 `packed` 로 지은 `.wbtheme`.

| 입구 | 어떻게 쟀나 | 결과 |
|---|---|---|
| (가) `wb-theme build` | 샘플 픽스처 사본의 `theme.config.ts` 에 `patterns` 를 넣고 `node bin/wb-theme.js build` | 종료 1 · `✗ patterns — patterns 는 더 지원하지 않습니다 — …` · `dist` 없음 |
| (가′) `wb-theme check --file` | 위 `.wbtheme`(346 바이트) | 종료 1 · `✗ manifest.json:patterns — patterns 는 더 지원하지 않습니다 — …` |
| (나) 업로드 `POST /api/admin/theme-packages`(관리자) | inject | **422** `validation-failed` · issues `[{ code: manifest, path: manifest.json:patterns, manifestCode: shape, message: «patterns 는 더 지원하지 않습니다 — …» }]` · 행 0 |
| (다) DB 에 직접 넣은 행 — 목록 `GET /api/theme-packages` | inject | 200 · 목록에 `patterned` 가 선다 |
| (다) `GET …/patterned/1.0.0/manifest` | inject | 200 · 본문에 `patterns` 가 그대로 있다 |
| (다) `GET …/files/theme.js` | inject | 200 · 바이트 그대로(`;`) — 파일 라우트는 manifest 를 안 본다 |
| (다) 바인딩 `PUT …/theme` | inject | 200 — 고를 때 패키지를 다시 읽지 않는다 |
| (다) `GET …/theme`(캔버스 · 패널 · CLI 가 읽는 것) | inject | 200 · `manifest.patterns` 가 그대로 실린다 |
| (다) 내보내기 미리보기(html) | inject | 200 · `themeId: null` · `themeWarning: «테마 패키지를 읽지 못해 기본 뷰로 내보냅니다(patterned@1.0.0): patterns 는 더 지원하지 않습니다 — …»` |
| (다) 내보내기 zip(html) | inject | 200 · `assets/theme/` 항목 0 — 기본 뷰로 나간다 |
| (다) 내보내기 미리보기(pptx) | inject | 200 · 본문 칸에 `themeWarning` 이 없다(`format · pages · screenless · screenFailures · fontWarning · fileName`) — **기본 뷰로 조용히 나간다.** main `a091b5a9` 도 pptx 미리보기에 그 칸이 없다(`git grep themeWarning a091b5a9` — html 미리보기 · 작업 결과만) — 이 브랜치가 연 길이 아니다 |
| (다) 스냅샷 만들기 · 복원 | inject | 201 · 200 — manifest 를 다시 읽지 않는다 |
| (다) CLI lint 의 테마 받기(`fetchLintTheme` — 서버의 `GET …/theme` 본문을 가짜 io 로 그대로) | 요청 1 | `{ kind: 'unavailable', reason: «서버가 준 manifest 가 규격과 다릅니다: patterns 는 더 지원하지 않습니다 — …» }` — 테마 규칙(`theme-variant`)만 빠지고 lint 는 돈다 |
| 서버 | 위 전부 뒤 `GET /health` | 200 — 죽지 않는다 |
| 시딩 — 진짜 `system-themes/` | DB 에 `patterned` 행이 있는 채 `seedSystemThemes` | 성공 · `kept: [system-admin@1.2.1]` — **시딩은 디스크의 산출물만 읽고 DB 행을 다시 읽지 않는다.** DB 에 그런 행이 있어도 기동은 안 멈춘다 |
| 시딩 — `patterns` 를 실은 시스템 산출물 | 임시 디렉터리 `pat/{package.json, dist/system-pat-1.0.0.wbtheme}` | `SystemThemeError: 시스템 테마 패키지가 검증을 못 지났습니다(…) — manifest.json:patterns patterns 는 더 지원하지 않습니다 — …` → **기동이 멈춘다** |

**캔버스 — 실브라우저**(스크래치 탐침을 `apps/web/build-test/` 에 잠시 두고 `pnpm vitest run -c vitest.browser.config.ts <그 파일>` · 1 파일 2 케이스 통과 · 돈 뒤 스크래치로 옮겼다). kit 의 `sample-theme` 사본을 id `patterned` 로 `buildTheme` 한 뒤 manifest 에 `patterns` 를 더해 다시 싸고(`readWbtheme` 은 `files: null` · 이슈 «patterns 는 더 지원하지 않습니다 — …»), 그 바이트를 `theme_packages` 에 SQL 로 넣고 `PUT …/theme` 로 고정했다.

| 잰 것 | 값 |
|---|---|
| `GET …/theme` | `themeId: patterned` · `manifest.patterns` 있음 |
| 캔버스가 테마 뷰로 그렸나(`sampleCard` — «샘플 카드») | **참** |
| 캔버스 `:root` 의 `--wb-color-primary` | `#e11d48`(그 테마의 기본값) |
| 셸 머리 통지(`role=alert · status`) · 콘솔 오류 · `pageerror` | 0 · 0 · 0 |
| 같은 프로젝트의 내보내기 미리보기 | `themeId: null` · «테마 패키지를 읽지 못해 기본 뷰로 내보냅니다(patterned@1.0.0): patterns 는 더 지원하지 않습니다 — …» |

→ **캔버스는 그 테마로 그리고 내보내기만 기본 뷰다.** 서버 manifest(`GET …/theme` · `…/manifest`)와 파일 라우트는 저장된 행을 다시 검증하지 않고, 웹의 모양 검사(`api/http-client.ts` 의 `isThemeManifest`)는 `id` · `tokens.items` 만 본다. 구현 보고 「남은 것」 의 «그 프로젝트의 캔버스 · 내보내기가 테마 읽기에서 깨진다» 는 절반만 맞다(캔버스는 안 깨진다).

**그런 행이 실제로 있다.** 옛 시스템 테마 넷 가운데 `system-commerce` · `system-portal` 의 manifest 가 `patterns` 를 실었다(`git grep -n patterns 1aba0566^ -- system-themes/*/src/manifest.ts` — 둘). TH 마이그레이션(`0027-retire-system-themes`)은 그 행을 지우지 않고 숨기며, 판 3 스냅샷 복원은 숨긴 판도 받는다. 탐침(api 하네스): `system-portal@1.0.0`(patterns) 고정 → 스냅샷 201 → `system-admin` 으로 옮기고 행을 숨김 → 복원 **200** → 바인딩이 `system-portal@1.0.0` 으로 돌아오고(`manifest.patterns` 있음) 내보내기 미리보기가 위와 같은 경고로 기본 뷰다. main(`a091b5a9`)에서는 그 판이 `validateManifest` 를 지나 그 테마로 내보냈다 — **이 브랜치가 연 차이**다(브리프 «과거 호환은 고려하지 않는다» 의 결과).

### 2. «모듈» 탭 — 실브라우저

| 판 | 결과 |
|---|---|
| 모듈 0 개로 탭을 연다 | 묶음 둘 `개인 모듈` · `프로젝트 모듈`. 빈 줄 «구조 트리에서 노드를 골라 '모듈로 저장'에서 '개인 모듈'을 고르면 여기에 섭니다» · «구조 트리에서 노드를 골라 '모듈로 저장'하면 여기에 섭니다». 탭 영역 글에 «패턴» **없음** |
| 개인 1 · 프로젝트 1 을 만들고 탭을 다시 연다 | `개인 모듈: [내 묶음]` · `프로젝트 모듈: [팀 묶음]` |
| «내 묶음 넣기» 단추 | 서버 문서 맨 위 자식 2 → 3(`+Text`) |
| «팀 묶음 넣기» 에 포커스 · Enter | 3 → 5(`+Button` · `+Card` — 묶음 하나가 편집 하나) |
| 검색 «팀» | `개인 모듈` 빈 줄 «맞는 모듈이 없습니다» · `프로젝트 모듈: [팀 묶음]` — 두 묶음을 함께 거른다 |
| 콘솔 오류 · `pageerror` | 0 |
| 기존 `apps/web/build-test/module-tab.test.ts`(이 HEAD) | **6/6 통과** — 끌어 놓기(캔버스 빈 카드 안 · 트리 줄 안 · 되돌리기 둘) · 넣을 수 없는 판(viewer · 뷰 모드의 끌기 · Enter) · 끄는 중 강등 · 다른 프로젝트의 개인 모듈(이 프로젝트에 없는 페이지를 가리키는 동작을 빼고 그 수를 말함) · 탭 기억 · 막힌 저장소 |

`module-insert.ts` 리팩터는 `{ kind: 'nodes', nodes }` → `nodes` 와 패턴 갈래를 뗀 것뿐이다(diff 로 읽었다 — 남은 갈래의 `prepareNodesForPaste` · `insertMany` · `selectIds` · `droppedActions` 는 글자 그대로). 넣기 · 거름 · 개수 문장이 안 바뀐 것은 위 판들이 값으로 잰다.

### 3. 걷힌 이름 셈 (HEAD `6758cc4e` · 줄 수 · «이력» = `docs/superpowers/plans/*` · 정본 밖 날짜 spec · 마이그레이션 `0006` · `0018`)

| 이름 | `-nwF` 전체 · 이력 · 그 밖 | 부분 문자열 전체 · 이력 · 그 밖 | 구현 보고(`2ac0f3a1`)와 |
|---|---|---|---|
| `pattern` | 121 · 85 · 36 | 270 · 199 · 71 | 그 밖 같음(36 · 71). 이력이 +2 · +5 — 구현 보고 파일 자신 |
| `Pattern` | 4 · 2 · 2 | 97 · 90 · 7 | 그 밖 같음 |
| `patterns` | 145 · 112 · 33 | 145 · 112 · 33 | 그 밖 같음 |
| `PatternNode` | 11 · 11 · 0 | 16 · 16 · 0 | 같음(이력 +1) |
| `expandPattern` | 24 · 24 · 0 | 24 · 24 · 0 | 같음(이력 +1) |
| `readNewWbtheme` | 11 · 11 · 0 | 11 · 11 · 0 | 구현 보고에 없던 칸 — 그 밖 0 |
| `newManifestIssues` | 2 · 2 · 0 | 2 · 2 · 0 | 같은 — 그 밖 0 |
| `ThemeIssue` | 19 · 19 · 0 | 36 · 36 · 0 | 같은 — 그 밖 0 |
| `테마 패턴` | 42 · 42 · 0 | 42 · 42 · 0 | 같음(이력 +1) |
| **`패턴`(한글 맨 낱말)** | 367 · 307 · 60 | 같음 | **구현 보고가 안 센 칸.** 그 밖 60 줄을 열어 갈래를 나눴다 — 아래 |

`패턴` 그 밖 60 줄(고친 뒤 `861f9a55` 에서 47 = 43 + 3 + 1): **무관한 낱말 43**(라우트 경로 패턴 · 정규식 · 노드 id 패턴 · APG 메뉴 · 탭 패턴 · 지침 문장 · «include 패턴» 등) · **걷은 입구를 걷혔다고 말하는 줄 3**(`editor-keys.test.tsx:296` · `toolbar-abilities.test.tsx:24` · `structure-row-actions.test.tsx:100` 의 `REMOVED_ENTRANCES` — 옛 «패턴 넣기» 입구가 없음을 지키는 자 · 남긴다) · **옛 측정 기록 1**(`shell/sidebar-layout.ts:74` «옛 패턴 · 프리셋 고르개를 연 판» — 잰 판의 이름 · 남긴다) · **낡은 주석 · 이름 13 자리(10 파일) — 고쳤다**(아래 「바꾼 것」).

문서: 정본 설계서 · `apps/api/README.md` · 스타터 `SKILL.md` 에 `패턴` 0 줄 · `patterns` 는 거절 장치 줄만. §6 은 6.0 · 6.1 만 남고 `§6.2` 가리킴 0(`§6.0` 2 · `§6.1` 4). `SKILL.md` 의 표 · 절에 끊긴 가리킴(「패턴」) 0 · 범주 목록 0. «다섯 범주» 같은 낡은 수 — 정본의 «manifest 거부 표(참조 · 순환 · 카탈로그 · variant · `patterns` 키)» 는 다섯이 지금 검사와 맞는다(토큰 참조 · 순환 · 카탈로그 · variant 는 `checkTokens` · `checkComponents`). **§6.0 의 한 문장은 거짓이었다** — «실은 manifest 는 빌드 · 업로드 · 다시 읽기가 모두 … 거절한다» 는 「1」 의 캔버스 판에서 서지 않는다. 지금 참인 문장으로 고쳤다.

### 4. `ignoredVariantMessage` export 를 걷은 것

`git grep -nwF ignoredVariantMessage -- apps packages system-themes` 에서 `packages/schema/src/validate.ts` 밖 **0 줄**(안은 정의 · 부름 둘). main `a091b5a9` 에서도 웹 · mcp · cli 는 0 이었고 쓰던 곳은 걷힌 `packages/themes/src/spec/patterns.ts` · `issue.ts` · `test/issue-severity.test.ts` 뿐이다.

### 5. 구현 보고의 «혼자 죽는 변조» 다시 돌리기

스크래치 `mutate.py` — 경로 전체 이름의 백업 · `filecmp.cmp(shallow=False)` 복원 · 맞은 수 1 확인 · 겨누는 파일만 · `--reporter=default --reporter=json`. 앞뒤 `git diff --stat` 같음.

| 변조 | 심은 것 | 실행 (통과 + 실패) | 죽은 케이스 · 실패 값 | 구현 보고와 |
|---|---|---|---|---|
| M2 빈 patterns 못 봄 | `withoutPatterns` 에서 값이 빈 객체면 짚지 않고 원문을 돌려줌 | 4 (3 + 1) | «빈 patterns 도 거절한다 — 값이 아니라 키를 본다» — `expected [ { code: 'shape', path: '', …(1) } ] to deeply equal [ { code: 'shape', …(2) } ]` | 같음 |
| M8 묶음 셋째 되살림 | `groups` 에 빈 «테마 패턴» 묶음을 더함 | 24 (23 + 1) | «개인 모듈 · 프로젝트 모듈 — 차례대로 · …» — `expected [ '개인 모듈', '프로젝트 모듈', '테마 패턴' ] to deeply equal [ '개인 모듈', '프로젝트 모듈' ]` | 같음 |

### 덧 — 구현 보고의 «남은 것» 하나를 잰 값

`packages/themes/src/globals.d.ts` 는 아직 있다(`structuredClone` 선언). 구현 보고는 «쓰는 곳 0 · 걷은 뒤 `pnpm typecheck` 한 번» 이라 했는데 `packages/themes/test/manifest.test.ts:34` 가 `structuredClone` 을 쓴다. 그 파일을 백업하고 지운 채 `tsc --build --force packages/themes/tsconfig.json packages/themes/tsconfig.test.json` → **종료 0**(바이트 비교 복원 · 다시 종료 0). 테스트 컴파일은 vitest 를 거쳐 `@types/node/globals.d.ts` 를 싣는다(`--listFilesOnly` 에 그 파일과 `manifest.test.ts` 가 함께 선다). 구현 보고가 맞다 — 지워도 된다(사용자 한 줄은 `q-tp.md` 「2」).

## 게이트

리뷰 커밋 `861f9a55` 가 주석 · 문장 · 케이스 이름 하나만 바꿨다 — 「트랙 게이트」 표의 «문서 · 주석만» 줄: `pnpm typecheck` + 그 글을 읽는 케이스. 읽는 케이스를 `git grep` 으로 셌다 — 정본을 읽는 `packages/mcp/test/{skill,tools}.test.ts` · `packages/schema/test/lint-rules.test.ts`, `apps/web/src` 를 훑는 web 케이스(`role-access` · `store-access` · `api-consumers` · `shell-css-*` · `one-verdict` 등 — web 전량으로 덮었다), 고친 파일 이름을 적은 `packages/themes/test/public-api.test.ts` · api `snapshots` · `project-theme`(+ 이 트랙의 `admin-themes` · `export-theme`). 실브라우저 `theme-review.test.ts` 는 주석 한 줄이라 돌리지 않았다.

체인 하나(`nohup nice -n 10 caffeinate -i` · 상태 파일 첫 줄 `node v24.21.0 · HEAD 861f9a55`) · 16:16:15 → 16:18:57. 영역 게이트라 자리(`gate-slots`)는 잡지 않았다(그때 `pi` 하나).

| 단계 | 종료 | 파일 | 케이스(통과 · 실패 · 건너뜀) |
|---|---|---|---|
| `pnpm typecheck` | 0 | — | — |
| `pnpm vitest run --project web --maxWorkers=25%` | 0 | 193 | 3237 · 0 · 0 |
| `pnpm vitest run --project unit packages/mcp/test packages/schema/test/lint-rules.test.ts packages/themes/test` | 0 | 25 | 357 · 0 · 0 |
| `pnpm vitest run --project api snapshots · project-theme · admin-themes · export-theme` | 0 | 4 | 92 · 0 · 0 |
| `pnpm lint` | 0 | — | 경고는 고친 줄 밖(`use-placement.ts:206 · 256 · 262` 의 `no-useless-spread`) |

리뷰 탐침(커밋 안 함): api 하네스 탐침 2 파일 각 1 케이스 통과 · 실브라우저 탐침 1 파일 2 케이스 통과 · 기존 `module-tab.test.ts` 실브라우저 1 파일 6 케이스 통과 · 변조 둘(위 표). `pmset -g log` 의 ` Sleep ` — 마지막 11:57:48 · 이 리뷰의 실행(탐침 · 변조 · 게이트 16:0x ~ 16:19)과 안 겹친다. 바뀐 파일 11 의 숨은 글자 0.

## 남은 것

- **R1 의 판정**(위 「판정에 올릴 것」) — (가) 그대로 / (나) 다시 읽기만 `patterns` 를 걷고 읽기.
- **pptx 내보내기에 테마 경고 칸이 없다**(main 도 같다 — 이 브랜치가 연 길이 아니다). 테마 패키지를 못 읽은 프로젝트의 pptx 는 기본 뷰로 말없이 나간다. 낮음 · 이월.
- `packages/themes/src/globals.d.ts` — 지워도 된다(「덧」). 사용자 한 줄이 필요하다.
- 탐침 · dev 서버 · 측정 스택은 모두 내렸다(실브라우저 판은 `editor-stack` 이 거둔다). 자기 DB 컨테이너(5471)는 남긴다.

## 지침

1. **무엇이 틀렸나.** 걷힌 이름 셈이 영문 식별자와 화면 이름(`테마 패턴`)만 세어, 주석이 기능을 한글 맨 낱말로 부른 자리(«패턴 고르개» · «모듈 · 패턴 넣기» · «선언(variant · 토큰 · 패턴)»)가 열 파일 13 줄 남았다 — 브리프 · 구현 보고의 셈 목록에 `패턴` 이 없었다.
   - **어느 문서 어느 절.** `.ruler/20-verification.md` 「수를 셀 때는 두 번 세고 표본을 열어 본다 — 덧붙임」 의 «**«걷혔나» 를 세는 식은 부분 문자열이 아니라 낱말 단위로도 센다**» 문단.
   - **넣을 문장.** 그 문단 끝에 붙인다: «기능을 걷을 때는 식별자 · 화면 이름에 더해 **주석이 그 기능을 부르는 한글 맨 낱말**(`패턴` 처럼 화면 이름의 꼬리)도 센다 — 주석은 기능을 맨 낱말로 불러 `테마 패턴` 셈에 안 걸린다(TP 뒤 열 파일 13 줄이 남았다). 맨 낱말은 무관한 뜻(경로 패턴 · 정규식)과 섞이므로 그 밖의 줄을 열어 갈래로 나눈다.»
2. **무엇이 틀렸나.** 정본 설계서에 «다시 읽기가 모두 거절한다» 처럼 **입구 여럿을 한 문장으로 묶은 주장**이 그 입구를 하나씩 재지 않고 들어갔다 — 캔버스는 저장된 manifest 를 다시 검증하지 않아 거짓이었다.
   - **어느 문서 어느 절.** `.ruler/30-delegation.md` 「워커에게 맡길 때 — wirebound」 의 «**입구 표가 있는 성질(…)을 닫는 장치는 «입구 × 값의 출처» 칸마다 판을 하나씩 세운다**» 문단.
   - **넣을 문장.** 그 문단 끝에 붙인다: «정본 · README 에 «모든 입구가 …» 를 적을 때도 같다 — 그 성질을 지나는 입구를 `git grep`(그 검증 함수를 부르는 자리)으로 세고, 그 함수를 **안** 부르는 입구(저장된 값을 그대로 내주는 라우트 · 클라이언트의 모양 검사)가 있으면 문장을 입구마다 가른다.»
