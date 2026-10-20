# RV-LT 보고 — `/llms.txt` 리뷰

브리프 `rv-lt` · 브랜치 `feat/llms-txt` · 리뷰 대상 `084d7027..c3da87f9`(구현 `lt`). 시작 때 node v24.21.0 · `pnpm db port postgres 5432` →
`0.0.0.0:5463` · `orca terminal list` 에서 이 워크트리의 다른 터미널은 구현자(`term_f4f7c236…`) 하나 — 프롬프트가 비어 쉬는 상태(«done 2:52 PM»)였다.

## 발견

| # | 무게 | 무엇 | 재현 | 고쳤나 |
| --- | --- | --- | --- | --- |
| F1 | 낮음–중간 | 인용 요약이 «agents read …, comment on them and edit them through an MCP server **or the `wireb` CLI**» — CLI 는 읽기만 한다(`init` · `login` · `pull` · `export` · `lint` · `page get`) | `node packages/cli/dist/bin.js --help` 에 코멘트 · 편집 명령이 없다 · `wireb comment` → `모르는 명령입니다: comment` | 고침 `dbdc855d` — «… through an MCP server. The `wireb` CLI only reads them (`wireb --help`).» 손으로 쓴 문장이라 케이스로 잠그지 않았다(아래 «못 재는 것») |
| F2 | 낮음 | 노드 `id` 줄의 패턴 `[A-Za-z0-9_-]{1,64}` 이 손으로 쓴 글이라 `NODE_ID_PATTERN` 을 바꿔도 대조 케이스가 초록 | 변조 C(아래) — 고치기 전 두 케이스 모두 통과 | 고침 `dd256f3d` — `NODE_ID_PATTERN.source` 에서 `^` · `$` 를 걷어 싣는다(글은 같은 바이트). 고친 뒤 변조 C 가 대조 케이스만 죽인다 |
| F3 | 낮음 | 정본 「12.6」 이 대조 케이스가 **안 재는 것**(손으로 쓴 머리글 · 붙이는 법 · 인증 문장 · 영어 설명의 뜻)을 말하지 않았다 — 「검증」 «도구가 보지 않는 것을 같은 자리에 적는다» | 문서 읽기 | 고침 `ee46d3dd` — 「12.6」 끝에 한 줄 |
| F4 | 낮음 · 보고만 | llmstxt.org 의 꼴은 H2 절을 «링크 목록(file lists)» 으로 두는데 이 글의 H2 는 본문(H3 · H4 포함)이다. 사람 · 에이전트가 마크다운으로 읽기에는 지장이 없고, `llms_txt2ctx` 같은 파서는 H2 절의 링크만 줍는다 — 이 글에는 링크가 없어 그 파서에는 거의 빈 글이다 | 형식 대조 | 안 고침 — 링크로 가리킬 다른 공개 문서가 없다. 정본은 «H1 · 인용 요약 · 절» 만 말해 거짓이 아니다 |

**높은 무게(틀린 명령 · 비밀 노출 · 낡음을 못 잡음)는 없었다.**

## 1. 글이 참인가 — 대조 표

사실을 말하는 줄을 코드와 대조했다. 틀린 줄은 F1 하나(«맞음» 줄은 근거만 적는다).

| 줄 | 글 | 실제 |
| --- | --- | --- |
| 3 | CLI 로도 코멘트 · 편집 | **틀림(F1)** — CLI 는 읽기 전용 |
| 11 | `node packages/cli/dist/bin.js` · `node packages/mcp/dist/bin.js` · `pnpm link --global` 은 그 디렉터리 안에서 | 맞음 — 두 `package.json` 의 `bin`(`wireb` · `wireb-mcp`), README 「부르는 길」 «`cd` 해서 부르는 것이 아니면 안 된다». 전역 링크는 사용자 전역을 건드려 이 리뷰에서 안 돌렸다 — dist 경로로 따라 했다 |
| 12 | 편집기 URL `/projects/<project id>` · 멤버(viewer 이상) | 맞음 — `apps/web/src/app.tsx` 의 `/projects/:projectId` · 토큰 발급 `projectGuard('viewer')` |
| 13 | `wireb init --server … --project …` 가 `.wirebound.json` 을 쓴다 · 비밀 없음 | 맞음 — 아래 e2e |
| 14 | `wireb login --email` 이 비밀번호를 묻고 그 프로젝트 토큰을 `~/.wirebound/credentials.json`(600)에 · `WIREB_TOKEN` 이 덮음 · 계정 설정 «API 토큰» 절 · 멤버 제거로 폐기 | 맞음 — e2e(파일 600 · 디렉터리 700) · `credentials.ts` 의 `findToken` · `apps/web/src/account/tokens-section.tsx` 제목 «API 토큰» · `repos/members.ts` 의 `deleteMemberTokens` |
| 15 | `claude mcp add wirebound -- wireb-mcp` · `.mcp.json` 꼴 | 맞음 — README 「7」 이 같은 명령 · 꼴을 «✔ Connected» 와 함께 싣는다(이 리뷰는 SDK 클라이언트로 같은 stdio 기동을 했다) |
| 21–53 | 도구 다섯과 인자 · 필수 여부 · `integer ≥ 0` · copy 안 받음 · 상한 200 | 맞음 — 정의(`packages/mcp/src/tools.ts`)에서 읽고, e2e 의 `listTools` 가 같은 이름 · 인자를 냈다 |
| 43 | 번호를 붙이면 `headSeq` 가 오른다 | 맞음 — e2e: 편집 1 + 코멘트(번호) 뒤 `get_page` 의 `headSeq` 2 |
| 59–74 | 문서 판 2 · 노드 필드 · 상한 | 맞음 — 정의 · 상수에서 읽는다(`id` 패턴은 F2 로 이제 상수에서) |
| 250 | 토큰은 자기 프로젝트의 `/api/projects/:projectId/` 아래만 · 남의 프로젝트 404 · 토큰 관리 불가 | 맞음 — e2e: 남의 프로젝트 `GET` 404 · 토큰으로 `GET …/tokens` 403. WS 거절은 `auth/plugin.ts` 머리말 · `test/api-tokens.test.ts` «WS는 쿠키만이다» |
| 251 | 오류 봉투 `{ error: { code, message, issues? } }` | 맞음 — `apps/api/src/errors.ts` |
| 254–264 | REST 11 줄 | 맞음 — e2e 에서 줄마다 토큰으로 불렀다(아래) · 역할은 `llms-rest-routes.test.ts` 가 가드와 잰다 · `revisions` 의 `limit` · `beforeSeq` · 최신순, 코멘트 `asc`, 스냅샷 payload(`menu` · `pages` · `layouts` · `comments` · 테마) 확인 |

### 글 그대로 따라 한 판(자기 api 3063)

스크립트 `run.sh`(스크래치): 시딩 계정(비밀번호는 스크립트 안에서 생성) → `pnpm -C apps/api start`(3063) → 세션으로 프로젝트 하나(글 밖의 판
세우기) → 글의 2~5 단계. `HOME` 을 스크래치로 돌려 사용자 홈을 안 건드렸다.

| 단계 | 값 |
| --- | --- |
| `migrate`(시딩) | 종료 0 · «계정 시딩: 만들었습니다» |
| 3 `wireb init --server http://127.0.0.1:3063 --project <id>` | 종료 0 · `.wirebound.json` = `{ server, projectId }` |
| 4 `wireb login --email …`(비밀번호는 표준입력) | 종료 0 · `~/.wirebound/credentials.json` 모드 600 · 디렉터리 700 |
| 5 리포 디렉터리에서 `node packages/mcp/dist/bin.js` 를 stdio 로(SDK `StdioClientTransport`) | `listTools` = `list_pages[]` · `get_page[path]` · `patch_page[path,baseSeq,ops]` · `add_comment[path,nodeId,body]` · `validate[path]` |
| `list_pages` | `isError` 없음 · 빈 프로젝트의 `menu: []` · `pages: []` |
| 메뉴 `Admin` · 페이지 `List` 를 세운 뒤 `get_page { path: 'Admin/List' }` | `isError` 없음 · `found: true` · `headSeq: 2` · `nodes[].path` `/root` … |
| REST 11 줄을 `Authorization: Bearer <token>` 으로 | `GET` 9 줄 200(내보내기 `application/zip`) · `PATCH …/ops` 200(`seq` 1) · `POST …/comments` 201 |

끝에 api(pnpm · tsx · node 셋)를 내렸다 — 3063 리스너 0.

## 2. 실으면 안 되는 것

`apps/web/public/llms.txt` 를 파이썬 정규식과 `grep -cE` 두 길로 셌다(줄 수).

| 식 | 파이썬 | `grep -cE` | 맞은 줄 |
| --- | --- | --- | --- |
| 테마 id · 이름 `system-\|commerce\|portal\|saas\|관리자` | 0 | 0 | — |
| `\badmin\b`(대소문자 무시) | 1 | — | 31 `Admin/Members/List` — 페이지 경로 예(테마 아님) |
| UUID `[0-9a-f]{8}-[0-9a-f]{4}-` | 0 | 0 | — |
| 이메일 | 0 | 0 | — |
| URL · 호스트 · 포트 `https?://\|localhost\|127.0.0.1\|:\d{4,5}` | 0 | 0(포트 제외 식) | — |
| `password\|secret\|cookie\|session\|DATABASE_URL\|SEED_` | 2 | — | 13 «it holds no secret» · 14 «asks for the password» — 안내 문장 |
| `module\|personal\|/me` | 0 | 0 | — |
| `/api/` 가 `/api/projects/:projectId` 밖 | 0 | 12 = 12 | 전부 프로젝트 라우트(11 줄 + 인증 줄) |
| 숨은 글자(U+2028 · 방향 제어 · 폭 없음 · BOM) | 0 | — | — |

글을 짓는 함수는 정의 · 상수만 읽고(카탈로그 기본값의 한국어 «탭 1» 같은 값은 정의다) DB · 환경 변수 · 테마 레지스트리를 안 부른다.

## 3. 낡음을 잡는 자 — 변조 표

구현 보고의 M1 ~ M4 밖의 축. 변조마다 `apps/web/test/llms-txt.test.ts` 만 돌렸다(백업 `bak__<경로 전체>` · 바이트 비교 복원 · 끝의 `git status` 깨끗).
기준선: 두 케이스 파일 3/3 통과.

| 변조 | 자리 | 죽은 케이스 | 실패 값 | 함께 돈 케이스 |
| --- | --- | --- | --- | --- |
| A | `add_comment` 인자 `body` → `text`(`properties` · `required`) | 대조 | `llms.txt: add_comment arguments 의 영어 설명이 정의와 다르다 — 설명 없음: [text] · 정의에 없음: [body]` | dev 서버 통과 |
| B1 | 카탈로그에 `Spacer`(document 그룹) — 영어 설명 없음 | 대조 | `llms.txt: catalog 의 영어 설명이 정의와 다르다 — 설명 없음: [Spacer] · 정의에 없음: []` — **짓기가 던진다** | dev 서버 통과 |
| B2 | B1 + `COMPONENT_SUMMARIES` 에 `Spacer` 한 줄 | 대조 | `Snapshot … mismatched` — 글이 따라 바뀌어 커밋된 파일과 갈린다 | dev 서버 통과 |
| C(고치기 전) | `NODE_ID_PATTERN` `{1,64}` → `{1,80}` | **없음** — 둘 다 통과 | — | — |
| C(고친 뒤 `dd256f3d`) | 같다 | 대조 | `Snapshot … mismatched` | dev 서버 통과 |

## 4. 운영 판

`Dockerfile` 의 `web` 단계는 `caddy:2.11.4` 에 `apps/web/dist` 를 `/srv` 로 싣고, `docker/web/Caddyfile` 은 `/api/*` · `/health` 밖을
`try_files {path} /index.html` + `file_server` 로 낸다. `/llms.txt` 만의 설정은 없다 — 다른 정적 파일과 같다:

- **압축:** `encode` 지시가 어디에도 없어 어느 파일도 압축하지 않는다 → 구현 보고의 `Content-Length: 12934`(파일 크기 그대로)와 맞다.
- **캐시 머리:** `header` 지시가 없다 — `file_server` 기본(ETag · Last-Modified, `Cache-Control` 없음). `assets/` 의 해시 파일과도 같은 대우다.
- **`Content-Type`:** 확장자로 정한다 — `.txt` → `text/plain; charset=utf-8` · 보고의 값과 맞다(`text/markdown` 이 아니다 — llmstxt.org 도 `/llms.txt` 경로만 정하고 형식은 마크다운 글이다).
- **파일이 없으면** `try_files` 가 `index.html` 로 돌려 200 `text/html` 이다 — 운영 판에서 그것을 재는 케이스는 없다(이미지 단계). 개발 판은 dev 서버 케이스가 `text/plain` 으로 재고(M3), 배포 문서 「확인」 의 `curl` 줄이 «text/html 이면 번들에 그 파일이 없다» 를 말한다.

## 5. 문서

정본 「12.6」 · README 「7.4」 · 「10.4」 한 줄 · `docs/guides/deploy-docker.md` 「확인」 · 「잰 값」 — 지금 참인 것만 적고 «바뀌었다 · 앞 판» 같은 연대기
문장이 없다. 구현 보고의 «처음에 생성기를 `packages/mcp` 에 두었다가» 는 이력 문서(plans)라 그 자리가 맞다. 「12.6」 에 F3 한 줄을 더했다.

## 게이트

브리프가 정한 게이트(전량은 안 돈다). node v24.21.0.

| 무엇 | 결과 |
| --- | --- |
| `pnpm vitest run apps/web/test/llms-txt.test.ts apps/api/test/llms-rest-routes.test.ts`(마지막 고침 뒤) | 2 파일 · 3 케이스 통과 · 건너뜀 0 |
| `pnpm typecheck` | 종료 0 |
| 커밋 훅(fmt · lint) | 통과 |
| 바뀐 파일의 숨은 글자 | `llms-txt.ts` 0 · `llms.txt` 0 |

## 남은 것

- **못 재는 것(정본 「12.6」 에 적었다):** 손으로 쓴 머리글 · 붙이는 법 · 인증 문장 · 영어 설명의 뜻. F1 이 그 꼴이었다 — CLI 에 쓰기 명령이 생기거나
  인증 규칙이 바뀌면 그 줄을 함께 고친다.
- F4(llmstxt.org 의 H2 = 링크 목록 관례) — 보고만.
- `pnpm link --global` 단계는 사용자 전역을 건드려 안 돌렸다(README 의 잰 절이 근거).
- 병합 순서: 구현 보고 «남은 것» 그대로 — `pm` · `th` 를 합친 판에서 `-u` 로 다시 짓는다.

## 지침

- **무엇이 비었나:** 생성물을 «정의에서 지은 글과 같다» 로 잠그는 케이스는 정의에서 읽지 **않은** 손 글 속 사실(상수를 글자로 옮겨 적은 패턴 · 한도)의
  낡음을 못 잡는다 — 변조 C 가 그랬다. 손 글에 정의의 값이 들면 그 상수를 읽어 싣는다.
- **어느 문서 어느 절:** `.ruler/20-verification.md`(wirebound 「검증」) 「수를 셀 때는 두 번 세고 표본을 열어 본다 — 덧붙임」 끝, 또는 생성물을 다루는
  절이 생기면 그 자리.
- **넣을 문장:** «**생성물을 정의와 대조하는 케이스는 손으로 쓴 글 속의 값을 못 잰다** — 손 글에 정의의 상수(패턴 · 한도)를 글자로 옮겨 적지 말고
  그 상수를 읽어 싣는다. 리뷰는 그 상수를 바꾸는 변조로 대조 케이스가 죽는지 본다(`apps/web/config/llms-txt.ts` 의 `NODE_ID_PATTERN`).»
