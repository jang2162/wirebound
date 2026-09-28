# A3 리뷰 대응 보고 (2026-09-28)

대상: 브랜치 `feat/code-themes-a3`, 시작 HEAD `4eaece29`(리뷰 보고). 리뷰 `docs/superpowers/plans/2026-09-28-a3-review.md` · 빨강 `a9fc034c`.
이 문서는 발행 시점의 기록이다(`docs/guideline/base/04-citation.md` 「이력 문서는 연대기 금지의 예외다」).

## 커밋

| 항목 | 커밋 | 내용 |
|---|---|---|
| G1 | `1f95ed7c` · `9917eeb7` | `PUT …/theme` 이 읽은 바탕의 `rev` 와 요청의 `rev` 를 견준다(409) · README 의 동시성 행 |
| G2 | `716d78f6` | `checkTokenValue` 가 C0 · U+007F · 짝 없는 서로게이트를 `token-value-char` 로 거절한다 |
| G3 | `c279fea1` | 복원이 판 3 토큰을 그 판의 manifest 로 보고 이슈 난 키를 버린다 · `set-theme` 은 판 3 이상에서만 |
| G4 | `b02391d6` | `system-themes/admin` 의 `build` · api global-setup 이 `dist` 를 비우고 짓는다 |
| G5 | `919dedfe` · `db7c01a2` | `system-themes/checksums.json`(`id@version → sha256`)과 견주는 api 케이스 · README 의 다시 재는 법 |
| G6 | `8dcef935` | 0019 `down` 이 판 3 payload 를 판 2 로 적는다 |
| G7 | `28ad91ba` | `holdQuery` 머리말의 문장 |

## 재현 — 빨강 5

고치기 전 HEAD(`4eaece29`)에서 두 파일을 돌렸다: **5 실패**, 값은 리뷰가 적은 그대로다.

| 케이스 | 값 |
|---|---|
| 숨긴 판 경주 | `expected 200 not to be 200`(본문 `hidden-x@1.0.0 · rev 3`) |
| font 짝 없는 서로게이트 | `… to include 'put 200 · snapshot 500 · restore 500'` |
| font NUL | `… to include 'put 200 · snapshot 400 · restore 500'` |
| 복원 토큰 | `expected [ 'no.such' ] to not include 'no.such'` |
| 0019 down | `expected [ { version: 3, theme: true } ] to deeply equal [ { version: 2, theme: false } ]` |

## 변조 — 공통 절차

백업(경로 전체 이름 — `apps__api__src__repos__projects.ts`) → 변조(맞는 곳이 1 인지 `assert`) → 실행 → 백업에서 복사 · `cmp` 로 같음 확인 →
`git status` · `git diff --stat`. `git checkout` 으로 되돌린 변조는 없다. 아래 «죽음» 은 전부 단언의 값으로 죽은 것이다(시간 초과 0).

## G1 — 숨긴 판을 새로 고르는 경주

- **고침**: `routes/project-theme.ts` — 바탕(`current`)을 읽은 바로 뒤 `current.rev !== body.rev` 면 `current` 를 실은 기존 409. 갱신의
  `WHERE theme_rev` 는 그대로다. 잠금은 새로 안 잡았다.
- **새 케이스**: `project-theme.test.ts` «두 owner 의 동시 저장 › 바탕을 읽고 갱신 앞에 선 저장은, 그 사이 같은 rev 로 커밋된 저장 뒤에 409 다»
  — 리뷰 3a 의 판(A 를 `update "projects"` 에 붙잡고 B 를 커밋 · A 를 놓음). **리뷰 3a 판은 케이스로 없었다** — 세웠다. A 는 첫 겹(핸들러 견주기)을
  이미 지나 붙잡혀 있어 둘째 겹만 잰다.
- **변조**(두 겹을 하나씩 뗌):

  | 뗀 것 | 죽은 케이스 | 값 | 산 케이스 |
  |---|---|---|---|
  | 핸들러의 rev 견주기 | 리뷰 «숨긴 판 경주» **만** | `expected 200 not to be 200` | 새 3a 케이스 · «옛 rev 는 409» · «거절된 저장(409)은 방송하지 않는다» — `WHERE` 가 막는다 |
  | 갱신의 `WHERE theme_rev` | 새 3a 케이스 **만** | `expected 200 to be 409`(A 가 `#aaaaaa · rev 2` 로 덮음) | «옛 rev 는 409» · «409 방송 없음» · 경주 — 핸들러가 막는다 |

  구현 보고의 «앞에서 견주면 `WHERE` 를 떼는 변조가 순차 케이스에서 안 죽는다» 는 **그대로 참**이다(«옛 rev 는 409» 가 산다). 그 겹은
  이제 3a 케이스가 혼자 잰다 — 두 겹이 각각 혼자 죽는 케이스를 가진다.
- 인구조사: `guard-in-lock` · `restore-lock-census` · `permission-matrix` · `snapshot-theme` 390 통과(고친 뒤).
- **브리프와 달라진 것**: 없음. README 의 «동시성» 행이 «먼저 읽고 견주지 않는다» 라 거짓이 돼 함께 고쳤다(`9917eeb7`).

## G2 — 토큰 값의 글자

- **고침**: `packages/themes/src/manifest/tokens.ts` 의 `checkTokenValue` 가 문자열이면 타입 문법보다 먼저 `BAD_CHAR`(C0 · U+007F · 짝 없는
  상위 · 하위 서로게이트)를 보고 `token-value-char` 를 낸다. 함수가 이유 문장 대신 `{ code, reason }` 을 돌려주게 바꿨고, 이슈 코드를 짓던 두
  자리(`checkTokens` · `effectiveValues`)가 그 코드를 쓴다. `ManifestIssueCode` 에 `token-value-char`. README 바인딩 규칙 표에 «글자» 한 줄.
- **한 자리인지**: `checkTokenValue` 를 부르는 곳은 `checkTokens`(← `validateManifest` ← 업로드 `readWbtheme` · kit `config.ts` · CLI) 와
  `effectiveValues`(← `tokensCss` · `tokenValues` ← api `PUT`(G3 뒤 `checkBindingTokens`) · kit dev 프레임) 둘뿐이다(`git grep`).
- **브리프와 달라진 것**:
  - 짝 없는 서로게이트를 `!s.isWellFormed()` 가 아니라 정규식으로 본다 — 이 패키지의 `lib` 가 ES2022 라 타입에 없다. 같은 꼴의 선례가
    `packages/exporter/src/pptx/xml.ts` 에 있다.
  - **탭 · 줄바꿈도 이제 거절한다**(C0). 앞에서는 글꼴 목록의 낱말 사이 탭(`Arial,\tserif`)을 받았다. 기존 `FONT_BAD` 의 `'Arial\nx'` 는
    코드가 `token-default-type` → `token-value-char` 로 바뀌어 새 표로 옮겼다.
- **새 케이스**: themes `token-value-char` 표(font 기본값 · 받은 값 × 8 글자, color · select 기본값 × 8, 이모지 쌍 통과, 걸린 키는 기본값) ·
  api `project-theme.test.ts` «NUL 이 든 값» · «짝 없는 서로게이트가 든 값» → 422 `token-value-char`.
- **변조**(`BAD_CHAR` 검사를 `if (false)`): 이 변조로 **21 죽음** — 리뷰 빨강 2(옛 값 `put 200 · snapshot 500/400 · restore 500`) · api 표 2
  (`['token-default-type'] ≠ ['token-value-char']`) · themes 17(`[] ≠ ['token-value-char']` 또는 코드 차이 · `--wb-t: "a\u0000b"` 가 `serif`
  아님). 실행의 실패 수는 22 — 나머지 1 은 그때 아직 고치기 전이던 G3 의 리뷰 빨강이다. 이모지 쌍 케이스는 산다(성질 잠금).
- 템플릿 · `system-admin`: `pnpm test:build` 의 `template.test.ts`(템플릿 설치 · 빌드 · 읽기 검증) · `wbtheme.test.tsx` 통과, `pnpm build` 산출물
  sha256 `5ff20aed…` 그대로.

## G3 — 복원이 규격 밖 토큰을 쓴다

- **고침**:
  - PUT 의 토큰 검사를 `apps/api/src/services/theme-tokens.ts` 의 `checkBindingTokens` 로 옮겼다(한 벌). 이슈에 `key` 를 싣고, 이슈 난 키를
    뺀 `tokens` 를 돌려준다. PUT 은 이슈가 하나라도 있으면 422(`routes/project-theme.ts` 의 `cleanTokens`).
  - `services/restore.ts` 6′단계 — 패키지를 찾은 뒤(첫 쓰기 전) 그 manifest 로 `checkBindingTokens`, `set-theme` 단계의 토큰을 거른 값으로
    바꾼다. 버린 키는 `RestoreResult.droppedThemeTokens` 로 라우트에 가고, 라우트가 `request.log.warn` 한 줄을 남긴다. 응답은 그대로다.
  - `services/restore-plan.ts` — `payloadVersion >= 3` 일 때만 `set-theme`.
  - README 스냅샷 판 3 문단 · 정본 설계서 「스냅샷」 한 문장.
- **새 케이스**(`snapshot-theme.test.ts`): «이슈가 난 키(없는 키 · 한도 밖 · 문법 밖)만 버리고 나머지를 쓴다» · «남긴 것이 전체 한도를
  넘으면 모두 기본값으로 선다» · «서버가 지은 판 3 payload 는 아무것도 버리지 않는다»(성질 잠금) · «판 2 payload 에 theme 가 있어도(손댄 DB)
  바인딩을 안 건드린다». 앞 둘은 `restoreSnapshot` 을 직접 불러 `droppedThemeTokens` 까지 본다.
- **변조**:
  - 판 게이트를 뗌 → «판 2 + theme» **만** — `{ theme_id: 'sample', … } ≠ { theme_id: 'system-admin', … }`.
  - 걸러 쓰기를 뗌(`steps[index] = …` 한 줄) → 리뷰 «복원 토큰»(`['no.such']`) · «섞인 토큰»(`tokens` 에 버릴 키가 남음) · «전체 한도»
    (`tokens: { …(90) } ≠ {}`) 셋.
  - **처음 판은 섞인 토큰 · 전체 한도 두 케이스가 이 변조에 살았다** — `toMatchObject` 가 중첩 `theme_tokens` 를 부분 비교해 남은 키를 못
    봤다. `toEqual` 로 고친 뒤 다시 돌려 위 값으로 죽었다.
- **브리프와 달라진 것**:
  - 걸리는 글자(NUL · 짝 없는 서로게이트)는 payload 에 못 선다 — `snapshots.payload` 가 `jsonb` 라 그 글자를 받지 않는다. 그래서 케이스는
    없는 키 · 한도 밖 · 문법 밖 · 전체 한도로 잰다.
  - 전체 한도(16 KB)에 걸리면 한 키의 탓이 아니라 **모두 버린다**(`{}`, 기본값으로 선다) — PUT 이 받은 적 없는 모양이라 가장 보수적인 쪽을 골랐다.
  - PUT 의 422 이슈 목록이 조금 넓어졌다 — 앞에서는 `token-too-long` 이 있으면 그것만 냈고, 지금은 같은 요청의 다른 키 이슈도 함께 싣는다.
    그 모양을 단언한 기존 케이스는 없다(`project-theme.test.ts` 통과).
  - 로그 한 줄은 케이스로 재지 않았다(로거 스트림을 세우지 않음) — 로그에 싣는 값(`droppedThemeTokens`)을 케이스가 본다.

## G4 — `dist` 에 남은 옛 산출물

- **고침**: `system-themes/admin/package.json` 의 `build` = `node -e "require('node:fs').rmSync('dist', { recursive: true, force: true })" && wb-theme build …`.
  api `test/global-setup.ts` 도 짓기 전에 `dist` 를 지운다(그 판이 `buildTheme` 을 직접 불러 스크립트를 안 탄다). kit 의 `wb-theme build` 는 그대로.
  README 한 문장.
- **값**: `dist` 에 `system-admin-9.9.9.wbtheme` · `notes.txt` 를 심고 루트 `pnpm build` → 종료 0, `dist` 에 `system-admin-0.1.0.wbtheme` **하나**
  (sha256 `5ff20aed…`). global-setup 판: 9.9.9 를 심고 api 파일 하나를 돌림 → 끝난 뒤 `dist` 에 0.1.0 하나.
- **새 케이스**: `system-themes/admin/build-test/wbtheme.test.tsx` «저장소 빌드는 dist 를 비우고 낸다 — 앞에 남은 산출물이 없다»(`beforeAll` 이
  빌드 전에 옛 판 이름 파일을 심는다 · `pnpm test:build`).
- **변조**(`build` 에서 비우기를 뗌) → 그 케이스 **만** `[ 'system-admin-0.1.0.wbtheme', …(1) ] ≠ [ 'system-admin-0.1.0.wbtheme' ]`.
- **못 재는 것**: global-setup 의 `rmSync` 를 떼는 변조를 잡는 케이스는 없다 — 테스트 하네스의 동작이라 위 손 측정으로만 봤다.

## G5 — 판을 안 올린 시스템 테마 변경

- **고침**: `system-themes/checksums.json`(`{ "system-admin@0.1.0": "5ff20aed…c431" }`) · `apps/api/test/system-theme-checksums.test.ts`(api
  스위트 — global-setup 이 그 실행에서 다시 빌드한 `system-themes/*/dist/*.wbtheme` 를 표와 견줌. 줄이 없으면 «새 판이면 표에 줄을 더한다»,
  다르면 «version 을 올리고 표에 새 줄을 더한다(이미 배포한 판의 줄은 고치지 않는다)»). 표 모양 케이스 하나(키 `system-…@semver` · 값 64 자
  16진). 산출물 0 개면 죽는 카나리아. README 에 표 · 케이스 · Docker 값(`5ff20aed…` 가 macOS 와 같음 — 구현 보고 Task 4 인용)과 다시 재는 법.
- **변조**(리뷰와 같이 `src/theme.css` 끝에 규칙 한 줄) → 그 케이스가 `system-admin@0.1.0 의 바이트가 표와 다르다(표 5ff20aed… · 빌드
  fe4e4da8…)` 로 죽음. 복원 뒤 `pnpm --filter @wirebound/system-theme-admin build` 로 다시 지어 sha256 `5ff20aed…` 확인.
- **브리프와 달라진 것**: 없음. 파일 이름 · 자리는 `system-themes/checksums.json`(기동 시딩의 탐색은 `*/dist` 만 보므로 이 파일을 안 읽는다).
- 다시 재는 법의 `docker run … sha256sum` 명령은 이 차수에서 돌리지 않았다(값은 구현 보고의 것).

## G6 — 0019 `down`

- **고침**: `down` 첫 문장 `UPDATE snapshots SET payload = (payload - 'theme') || '{"payloadVersion": 2}'::jsonb WHERE (payload->>'payloadVersion')::int = 3`.
- **변조**(`WHERE false`) → 리뷰 빨강이 `[ { version: 3, theme: true } ] ≠ [ { version: 2, theme: false } ]`. `migration-0019` · `migration-0018` 통과.
- 새 케이스 없음(리뷰 빨강이 잰다).

## G7 — 지침 문장

`apps/api/test/pg-fault-proxy.ts` 의 `holdQuery` 머리말에 넣었다. **문장을 한 곳 고쳤다** — 리뷰 문장은 «`release()` 로 칸을 거둔다» 인데
코드는 칸을 지우지 않고 약속만 푼다: 푼 칸도 다음 같은 글자 질의 하나에 쏴지고 사라지되 붙잡지 않고 곧바로 넘긴다. 그래서 «칸을 푼다» 로
쓰고 그 동작을 한 문장 더했다.

## 게이트(마지막 커밋 `db7c01a2` 앞 · 소스는 같음)

| 명령 | 결과 |
|---|---|
| `pnpm typecheck` | 종료 0 |
| `pnpm build` | 종료 0 — `system-themes/admin/dist` 에 `system-admin-0.1.0.wbtheme` 하나 · sha256 `5ff20aed…` |
| `pnpm test`(DB 5443) | 353 파일 · **6130 통과 · 1 건너뜀 · 실패 0** · 267.2s. 건너뜀 1 은 앞 차수부터의 `log-destination.test.ts` «Linux /dev/full» |
| `pnpm test:build` | 30 파일 · **178 통과 · 1 건너뜀 · 실패 0** · 309.5s. 건너뜀 1 은 `template.test.ts` 의 «저장소 밖에서 설치하고 빌드한다»(`WB_TEMPLATE_INSTALL=1` 일 때만) |

리뷰의 빨강 5 는 전부 초록이다. 수의 등식: 구현 보고 6099 + 리뷰 5 = 6104 → 6130(+26 = G1 1 · G2 themes 17(새 18 − 옮긴 `FONT_BAD` 1) ·
G2 api 2 · G3 4 · G5 2). `test:build` 177 → 178(G4 1). `pnpm test:browser` 는 돌리지 않았다 — `apps/web/src` 를 안 바꿨다.

## 띄운 것

서버 · 컨테이너를 따로 띄우지 않았다. 워크트리 DB 5443 만 썼다(최상위 5433 은 안 건드림). 끝에 이 워크트리 경로의 프로세스 0,
`git status` 깨끗.

## 지침 보고

없음.
