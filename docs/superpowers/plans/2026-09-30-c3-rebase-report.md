# C3 을 main(C1 병합) 위로 올림 — 보고

계획: `docs/superpowers/plans/2026-09-30-c-editor-shell.md` 「D8」 · spec `docs/superpowers/specs/2026-09-30-editor-shell-design.md` 「화면 사이의 길」.
브랜치 `feat/c3-settings` 를 main `386e7ee1`(C1 병합) 위로 올렸다. 이 문서는 발행 시점의 기록이다(`docs/guideline/base/04-citation.md` 「이력 문서는 연대기 금지의 예외다」).

## 고른 것 — rebase

`git rebase main`(브리프 기본값). 까닭: C3 의 커밋 11개가 C1 이 바꾼 파일과 겹치는 곳이 두 테스트 파일뿐이라 커밋마다 풀어도 작다. merge 를 고르면 C1 머리로 바꾸는 커밋이 병합 커밋 뒤에 따로 서서 «C3 의 어느 판이 C1 부품을 쓰는가»가 이력에서 한 줄로 안 읽힌다. 올리기 전 끝을 로컬 브랜치 `c3-pre-rebase-backup`(`e40a3c5c`)에 남겼다 — 병합 뒤 지워도 된다.

### 새 커밋

| 옛 | 새 | 제목 |
|---|---|---|
| `e6cd8c52` | `a3dc33c2` | feat(api): change own password … |
| `50df0bc3` | `07464a1a` | feat(web): account settings page … |
| `b6794ca1` | `8c924645` | feat(web): project settings members section |
| `288f5d88` | `42215d0d` | feat(web): danger zone on project settings; project list rows no longer delete |
| `253efc22` | `c39ce0fa` | docs(plans): C3 report … |
| `7162082a` | `17e3f614` | test+docs(c3-review): … |
| `aadc9805` | `d8b0e48d` | fix(api): admin write recheck takes the user row before the credential … |
| `357d7c80` | `1ce9ff7e` | fix(api): login session only while the compared hash is still the user's … |
| `64070c34` | `c1260f5f` | fix(web): member removal confirm no longer stands where the ask was … |
| `98eff078` | `ade36ce3` | fix(web): project delete confirm compares … after NFC |
| `e40a3c5c` | `0f3b0645` | docs(plans): C3 review fix report … |
| — | `753ea508` | feat(web): settings, account and theme admin heads use the list head — logo, title and the … menu |
| — | (이 보고서) | docs(plans): C3 rebase report |

중간 커밋은 하나씩 따로 돌리지 않았다 — 게이트는 끝 판(`753ea508` + 이 보고서)에서만 쟀다.

## 충돌 표

텍스트 충돌은 둘이었다. 브리프가 예상한 나머지 자리는 git 이 저절로 합쳤다(아래 «저절로 합쳐진 자리»).

| 파일 | 커밋 | C1 쪽 | C3 쪽 | 합친 것 |
|---|---|---|---|---|
| `apps/web/test/routes/tokens.test.tsx` | `50df0bc3` → `07464a1a` | 목록 머리가 `…` 로 바뀌어 계정 묶음의 «API 토큰» 링크를 `/admin/themes`(관리자)에서 찾음 · 끝 주소 `/tokens` | `/tokens` 가 `/account` 로 넘어감 · 출발은 `/` | 출발 `/admin/themes`(관리자 사용자 · `listThemePackages`) + 끝 주소 `/account` · 절 이름 «API 토큰 절». 이 케이스는 `753ea508` 에서 다시 바뀐다(아래 «케이스») |
| `apps/web/test/routes/project-crud.test.tsx` | `288f5d88` → `42215d0d` | Tab 정지점 바탕 = 링크 2 + 새 프로젝트 · 삭제 2 + `…` 1 = 5 | 링크 2 + 새 프로젝트 1 + 계정 묶음 2 = 5(줄 삭제 뗌) | 링크 2 + 새 프로젝트 1 + `…` 1 = **4**. C3 보고의 이월 «project-crud 탭 멈춤 수 — C1 이 목록 머리를 `…` 로 바꾸면 다시 센다»가 이것으로 닫힌다 |

### 저절로 합쳐진 자리 — 합친 뒤 확인한 것

| 파일 | 합쳐진 모양 |
|---|---|
| `apps/web/src/routes/project-list.tsx` | C1 의 머리 `…`(`ActionMenu` · `useLogout` · `SessionNotices`)와 C3 의 줄 삭제 뗌(`DeleteConfirm` · `projectAbilities` import 없음 · `ProjectRow` 는 이름 · 설명 · «설정»)이 둘 다 섰다 — `git diff main -- apps/web/src/routes/project-list.tsx` 로 봤다 |
| `apps/web/src/shell.css` | 서로 다른 블록이라 겹침 없음 |
| `apps/web/test/api-consumers.test.ts` · `role-access.test.ts` · `shell-css-*` | 충돌 없음 — rebase 직후 web 141 파일 · 2600 케이스 통과(아래 게이트 전의 중간 값) |

## 머리 바꿈 — `753ea508`

**셸 밖 화면의 머리를 한 부품으로 뺐다** — `apps/web/src/shell/page-head.tsx` 의 `PageHead`(제목 · `brand`). 왼쪽은 로고(`shell/brand-link.tsx` — 접근 이름 «프로젝트 목록»)와 `<h1>`, 오른쪽 끝은 `ActionMenu`(`label` «더 보기» · 머리에 사람 이름) — 항목은 계정 설정(`/account`) · 테마 관리(`/admin/themes`, 인스턴스 관리자만) · 로그아웃(`useLogout()` — `settle` 없음). 세션 통지(`SessionNotices` · `.wb-shell-project-alert`)는 머리 아래 형제다. 목록 머리에 있던 항목 · 훅을 그대로 옮겼다 — 목록도 이 부품을 쓴다(`brand={false}` — 로고가 가는 곳이 그 화면이다).

| 화면 | 전 | 후 |
|---|---|---|
| 프로젝트 목록 `routes/project-list.tsx` | 제자리의 `ActionMenu` + 항목 표 + `useLogout` | `<PageHead title="프로젝트" brand={false} />` — 모양 같음 |
| 프로젝트 설정 `routes/settings.tsx` | 제목 + `SessionMenu` · 아래 줄 «에디터로 돌아가기» · «프로젝트 목록» | `<PageHead … brand />` · 아래 줄 «에디터로 돌아가기»(프로젝트를 받은 뒤에만 — 줄째) |
| 계정 설정 `routes/account.tsx` | 제목 + `SessionMenu` · 아래 줄 «프로젝트 목록» | `<PageHead title="계정 설정" brand />` |
| 테마 관리 `routes/admin-themes.tsx` | 제목 + `SessionMenu` · 아래 줄 «프로젝트 목록» | `<PageHead title="테마 관리" brand />` |

- **아래 줄의 «프로젝트 목록» 글자 링크를 뗐다** — 로고와 접근 이름이 같아 한 화면에 같은 이름의 링크가 둘이 된다. 이 링크를 이름으로 찾던 케이스(`settings.test.tsx` 의 뼈대 · 404, `admin-themes.test.tsx` 의 비관리자)는 이제 로고를 찾아 그대로 초록이다(`href` `/`).
- **`SessionMenu` 를 부르는 자리 — `git grep -n "SessionMenu" -- apps/web/src`:** 바꾸기 전 src 3(설정 · 계정 · 테마 관리) → 바꾼 뒤 0. 테스트 한 자리(`test/session/tab-session.test.tsx` 의 작은 라우트 표)가 그것을 머리로 썼다 — `PageHead` 로 바꾸고 로그아웃 누름을 `…` → «로그아웃» 메뉴 항목으로. 부르는 자리가 0 이라 **컴포넌트를 걷었다**(`session/session-menu.tsx` 에는 `useLogout` · `SessionNotices` · `SWITCHED_NOTICE` 가 남는다).
- **CSS:** `.wb-shell-session` · `-session-user` · `-session-logout`(+`:disabled`) · `-session-tokens` · `.wb-shell-tokens-lead` 를 걷었다(쓰는 자리 0). `.wb-shell-session-alert` 는 남는다 — 에디터 하단 바의 `SessionNotices` 가 쓴다(주석을 그 자리로 고침). 새 `.wb-shell-page-lead`(로고 · 제목 — `baseline` · `flex-wrap`). `test/shell-css-narrow.test.ts` 의 줄 바꾸는 무리 명단에서 `wb-shell-session` 을 `wb-shell-page-lead` 로 바꿨다.
- **낡은 가리킴:** C3 이 `routes/tokens.tsx` 를 옮긴 뒤 남은 가리킴 7(`api/client.ts` · `api/http-client.ts` · `routes/admin-themes.tsx` · `routes/settings.tsx` · `shell.css` 셋)을 `account/tokens-section.tsx`(설정은 `routes/account.tsx`)로, «계정 묶음»을 말하던 주석(`app.tsx` · `shell.css` · `api-consumers.test.ts` · `logout-farewell.test.tsx`)을 지금 모양으로 고쳤다. `git grep -n "routes/tokens.tsx\|계정 묶음" -- apps/web/src` → 0.
- **spec** `2026-09-30-editor-shell-design.md` 「화면 사이의 길」: 표에 «설정 두 페이지 · 테마 관리의 머리 `…`» 줄을 더하고, 머리가 한 부품이며 계정 묶음이 없다는 문장으로 바꿨다.

## 케이스

### 새 파일 — `apps/web/test/shell/page-head.test.tsx` 19

`describe.each` 로 세 화면(프로젝트 설정 · 계정 설정 · 테마 관리) × 6 + 1. `<App />` 을 라우트째 그린다.

| 케이스(화면마다) | 목록 머리의 대응 |
|---|---|
| 머리의 조작은 로고 · `…` 둘(`['프로젝트 목록', '더 보기']`) — «API 토큰» 링크 · «로그아웃» 단추 없음 · 이름은 머리에 안 섬 | `project-list.test.tsx` «계정 설정 · 로그아웃 — 메뉴 머리에 이름 …»의 `controls` |
| 로고를 누르면 `/` · «프로젝트» 제목 | (목록은 로고 없음) · 에디터는 `shell-nav.test.tsx` «눌러서 실제로 목록에 닿는다» |
| `…` = 계정 설정 · 로그아웃 · 메뉴 머리에 이름 · 계정 설정 `href` `/account` | 같은 케이스의 `openMenu()` |
| 관리자에게 «테마 관리»가 가운데 · `href` `/admin/themes` | «인스턴스 관리자에게는 «테마 관리»가 가운데에 선다» |
| «로그아웃» → `logout` 1 번 · `/login` | `shell-nav.test.tsx` «눌러서 로그인 화면으로 나간다» |
| 로그아웃 실패 → 서버 문장 `role="alert"` 가 머리 **아래 형제** · 주소 그대로 | 에디터판 «실패하면 이유를 하단 바에 내고 셸에 남는다» |
| (설정만) «에디터로 돌아가기» — 프로젝트 응답 전 없음 · 뒤 `href` `/projects/p-1` | — |

### 옮기거나 바꾼 케이스

- `test/routes/tokens.test.tsx` «계정 묶음의 «API 토큰» 링크가 …» → «머리 `…` 의 «계정 설정»이 계정 설정으로 가고 그 안에 토큰 절이 선다» — 옛 링크가 없어졌다. 출발 `/admin/themes` · 끝 `/account` · `listMyTokens` 1 번은 그대로.
- `test/routes/project-crud.test.tsx` Tab 정지점 5 → 4(충돌 표).
- `test/session/tab-session.test.tsx` — 라우트 표의 머리를 `PageHead` 로, 로그아웃 누름을 메뉴로(케이스 수 그대로).
- 지운 케이스 0.

### 변조 — 백업 → 바꿈 → 돌림 → `cmp` 복원

| 변조 | 돌린 것 | 결과 |
|---|---|---|
| M1 설정 · 계정 · 테마 관리 · `session-menu.tsx` 를 HEAD 전 판(옛 계정 묶음)으로 되돌림 | `page-head.test.tsx` | 18/19 실패. 핵심은 값으로 죽음: `expected [ 'API 토큰', '로그아웃' ] to deeply equal [ '프로젝트 목록', '더 보기' ]`. 나머지 머리 케이스는 `…`·로고를 못 찾아 죽음. 산 1 은 «에디터로 돌아가기» — 옛 판도 응답 뒤에만 그렸다(성질 잠금 · 고치기 전에도 초록) |
| M2 `PageHead` 가 로고를 안 그림(`props.brand` → `false`) | `page-head.test.tsx` + `project-list.test.tsx` | 6 실패(세 화면 × 조작 · 로고) — `expected [ '더 보기' ] to deeply equal [ '프로젝트 목록', '더 보기' ]` |
| M3 목록에도 로고(`props.brand` → `true`) | `project-list.test.tsx` + `project-crud.test.tsx` | 2 실패 — `expected [ '더 보기', '프로젝트 목록' ] to deeply equal [ '더 보기' ]` · Tab 정지점 `expected 5 to be 4` |

복원은 셋 다 `cmp` 일치. 끝의 `git status` 는 커밋할 파일만 보였다.

## 게이트 — 끝 판

`753ea508` 위에서 차례로 돌렸다(나란히 C2 워커가 돌아 전량은 `--maxWorkers=25%`). Postgres 는 이 워크트리 컨테이너(5462 — `docker compose port postgres 5432` 로 확인).

| 게이트 | 종료 | 실행 | 건너뜀 | 실패 |
|---|---|---|---|---|
| `pnpm typecheck` | 0 | — | — | 0 |
| `pnpm build` | 0 | — | — | 0 |
| `pnpm test --maxWorkers=25%` | 0 | 파일 383 · 케이스 6533 | 1(`apps/api/test/log-destination.test.ts` — 원래 있던 건너뜀) | 0 |
| `pnpm test:build` | 0 | 파일 52 · 케이스 323 | 1(`packages/theme-kit/build-test/template.test.ts` — 원래 있던 건너뜀) | 0 |
| `pnpm test:browser` | 0 | 파일 29 · 케이스 134 | 0 | 0 |
| `EDITOR_STACK_BUNDLE=build pnpm test:browser` | 0 | 파일 29 · 케이스 134 | 0 | 0 |

`pnpm build` 뒤 `git status` 는 비어 있었다(시스템 테마 `checksums.json` 변화 없음).

## 이월 · 지침

- `docs/superpowers/specs/2026-08-03-wirebound-design.md` 558 줄(에디터 머리 — «오른쪽은 … 스냅샷 · 내보내기 · **설정** … 계정 묶음이다»)은 C1 뒤의 머리(`…` 메뉴)와 맞지 않는다. C1 의 몫이라 여기서 안 고쳤다 — 그 절을 「셸의 머리」(`2026-09-30-editor-shell-design.md`)를 가리키게 고칠 것.
- 로컬 브랜치 `c3-pre-rebase-backup` — 병합 뒤 지운다.
