# @wirebound/api

Fastify 5 기반 REST 서버. 설계서 편집을 지원하는 백엔드다(P1·P2a 범위 — WebSocket은 P3).

필요한 것: Docker, Node ≥ 22.9, pnpm.

## 기동 절차

1. `docker compose up -d` — 저장소 루트에서. Postgres(호스트 포트 `5433`)를 띄운다.
   `docker compose ps`로 `healthy`가 될 때까지 기다린다. 컨테이너가 healthy가
   아니면 이후 마이그레이션·테스트가 전부 접속 실패로 죽는다.
   - `docker/postgres-init/01-test-db.sql`(`wirebound_test` 생성)은 Postgres 볼륨을
     **처음 만들 때만** 실행된다. `wirebound-pgdata` 볼륨이 이미 있는 상태로(예: 예전
     버전의 이미지를 쓰다가) 새로 받았다면 `wirebound_test`가 없을 수 있다 — 이 경우
     `docker compose down -v`로 볼륨까지 지우고 다시 `up -d`하거나, 컨테이너 안에서
     `CREATE DATABASE wirebound_test;`를 직접 실행한다. 그렇지 않으면 테스트
     `globalSetup`이 이유를 알기 어려운 접속 에러로 죽는다.
2. `pnpm install` — 저장소 루트에서. 워크스페이스 심링크(`@wirebound/*`)를 만든다.
3. `pnpm build` — `packages/schema`를 먼저 빌드한다. **`tsx`는 워크스페이스 패키지를
   `package.json`의 `exports`를 통해 해석하는데, 그 `exports`가 가리키는 대상이
   `dist`이기 때문이다(소스 `.ts`가 아니다).** 빌드하지 않으면 `@wirebound/schema`
   import가 깨져 서버가 뜨지 않는다(vitest는 `vitest.config.ts`의 alias로 소스를
   직접 보므로 이 제약이 없다 — `tsx`로 실행할 때만 해당한다).
   - 스키마를 함께 고치며 개발할 때는 `pnpm --filter @wirebound/schema build:watch`를
     별도 터미널에서 같이 돌린다.
4. `.env.example`을 `.env`로 복사하고 필요하면 값을 조정한다. `dev`·`start`·`migrate`·
   `migrate:down` 스크립트가 전부 `tsx`에 `--env-file-if-exists=.env`를 붙여
   실행하므로(Node 22.9+, `apps/api/package.json`), `apps/api/.env`가 있으면 자동으로
   읽는다 — 이 프로젝트는 `dotenv` 같은 별도 패키지를 쓰지 않는다. `.env` 파일 없이
   셸에 직접 `export DATABASE_URL=...` 해도 그대로 동작한다(`--env-file-if-exists`는
   파일이 없어도 에러 없이 넘어가고, 파일이 있어도 이미 셸에 있는 값을 덮어쓰지
   않는다 — 둘 중 하나만 있어도, 둘 다 있어도 안전하다).
5. `pnpm --filter @wirebound/api migrate` — 마이그레이션을 최신까지 올린다.
6. `pnpm --filter @wirebound/api dev` — `tsx watch`로 서버를 띄운다.

마이그레이션을 되돌리려면 `pnpm --filter @wirebound/api migrate:down`(가장 최근 것
하나만 내린다, 반복하면 0까지 내려간다).

## 테스트

api 프로젝트의 vitest 테스트는 실제 Postgres에 붙는다. 컨테이너가 healthy인
상태에서 돌려야 한다 — `docker compose up -d` 이후 `pnpm vitest run --project api`
(또는 루트의 `pnpm test`)를 실행한다.

테스트 DB(`wirebound_test`)의 마이그레이션은 vitest의 `globalSetup`
(`test/global-setup.ts`)이 전체 실행 전 한 번 자동으로 올려준다(latest → none →
latest 한 사이클을 돌려 `down` 방향까지 검증한다) — 따로 `migrate`를 실행할
필요는 없다.

기본은 `test/helpers.ts`의 `withApi()`다. `withApi`는 테스트 하나를 트랜잭션으로
감싸고 끝나면 롤백하므로 그 테스트가 커밋하는 데이터는 없다 — 다음 테스트는 항상
깨끗한 스키마에서 시작한다.

**예외가 하나 있다: `test/revisions-concurrency.test.ts`는 실제로 커밋한다.**
`withApi`는 커넥션 하나·트랜잭션 하나 안에서 도므로 그 안에서 요청을 겹쳐도 전부
직렬화된다 — 행 잠금과 `seq` 채번의 원자성은 **여러 커넥션이 실제로 커밋해야만**
검증된다. 그 파일은 각 테스트 전후로 `projects`·`users`를 **범위 없이** 지운다
(`DELETE FROM projects` / `DELETE FROM users` — 자기가 만든 행만 고르지 않는다).
새 테스트를 그 형식으로 쓰기 전에 "여러 커넥션이 실제로 커밋해야만 드러나는
성질인가"를 먼저 확인한다. 아니면 `withApi`를 쓴다.

**그 예외를 성립시키는 것은 `vitest.config.ts`의 api 프로젝트에 걸린
`poolOptions.forks.singleFork`다 — 이 설정은 편의가 아니라 격리 전략의 일부다.**
그것이 사라지면 커밋된 행이 동시에 도는 다른 파일의 `withApi` 트랜잭션에 보이고,
그 파일의 정리 DELETE가 남의 데이터를 지운다(실제로 겪었다: 매 실행마다 서로 다른
5~6개 파일이 깨졌다). 같은 목적으로 `fileParallelism: false`를 **쓰면 안 된다** —
프로젝트 설정에서는 에러도 경고도 없이 조용히 무시된다.

## API 개요

- 모든 요청/응답 본문은 JSON이다.
- 인증은 세션 쿠키(`wb_session`, httpOnly)로 한다. `Authorization` 헤더는 쓰지 않는다.
- 성공 응답은 리소스(또는 그 배열)를 그대로 반환한다. 실패 응답은 아래 "에러 형식"을 따른다.
- 요청 본문의 키는 camelCase다(`sortOrder`, `menuNodeId` 등). DB 컬럼(snake_case)과의
  변환은 서버 내부(`repos/`)에서만 일어난다 — API 밖으로 snake_case가 나가지 않는다.

### 에러 형식

```jsonc
{ "error": { "code": "not-found", "message": "대상을 찾을 수 없습니다", "issues": [ /* 있을 때만 */ ] } }
```

| code | HTTP 상태 | 의미 |
|---|---|---|
| `bad-request` | 400 | 요청 형식이 잘못됨(zod 검증 실패, 스키마 봉투 위반 등) |
| `unauthenticated` | 401 | 로그인이 필요함(세션 쿠키 없음/만료) |
| `forbidden` | 403 | 로그인은 했지만 이 작업에 필요한 역할이 아님 |
| `not-found` | 404 | 대상이 없음, **또는 프로젝트 멤버가 아님**(설계 §10 — 비멤버에게 프로젝트 존재 여부를 숨긴다) |
| `conflict` | 409 | 유니크 제약 위반, 마지막 owner 제거 시도, 자식이 있는 메뉴 삭제 시도, **스냅샷 태그 중복**, **스냅샷 수집 중 프로젝트 변경**, **복원의 네 갈래**(지문 불일치·안전망 태그 중복·레이아웃 불일치·코멘트 작성자 없음) 등 |
| `validation-failed` | 422 | 봉투는 유효하지만 카탈로그 규칙(컴포넌트 타입·props·variant 등)을 위반함. `issues`에 `ValidationIssue[]` |
| `internal` | 500 | 예상하지 못한 서버 오류 |

### 이슈의 severity — 무엇이 저장을 막는가

`ValidationIssue`는 `severity`를 갖는다(`"error"` 또는 `"warning"`).

```jsonc
{ "code": "ignored-variant", "severity": "warning", "nodeId": "n_…",
  "path": "/root/children/0/variant", "message": "…" }
```

- **`error`가 하나라도 있으면 422이고 아무것도 저장되지 않는다.**
- **`warning`만 있으면 저장된다.** 그 경고는 성공 응답의 `warnings`에 실린다(아래).
- **422 응답의 `issues`에는 경고까지 함께 실린다** — 받는 쪽이 `severity`로 가른다.

오늘 `warning`인 코드는 **`ignored-variant` 하나뿐**이다(`@wirebound/schema`의
`ISSUE_SEVERITY`가 코드마다 정한다). `variantFrom`을 가진 컴포넌트(`Text`·`Field`·
`Divider`)에 `node.variant`를 적으면 그 값이 버려지는데, 그것은 문서를 무효로 만드는
사실이 아니라 알림이다. 이 구분이 없던 시절에는 그 경고 하나가 문서 어딘가에 있으면
**그 노드와 무관한 편집까지 422로 거부**됐다 — 편집 파이프라인이 문서 **전체**를
검증하기 때문이다.

**404 vs 403의 원칙(설계 §10):** 프로젝트가 아예 없는 경우와 프로젝트는 있지만
호출자가 멤버가 아닌 경우를 **구분하지 않고 둘 다 404**를 낸다 — 다른 프로젝트의
id가 존재를 흘리면 안 되기 때문이다. 멤버이지만 역할이 모자란 경우에만 403이다.

### 권한(역할)

프로젝트 멤버는 `owner` > `editor` > `viewer` 중 하나다(숫자가 클수록 강한 권한).
아래 표의 "최소 역할"은 "이 역할 **이상**이면 허용"을 뜻한다.

### 엔드포인트

**이 표가 P2(에디터)가 이 API를 상대로 구현될 때 근거로 삼는 계약이다.**

| 경로 | 메서드 | 최소 역할 | 요청 | 응답 |
|---|---|---|---|---|
| `/api/auth/signup` | POST | (없음, 공개) | `{ email, name, password }` | 201 `{ id, email, name }`, 세션 쿠키 설정 |
| `/api/auth/login` | POST | (없음, 공개) | `{ email, password }` | 200 `{ id, email, name }`, 세션 쿠키 설정 |
| `/api/auth/logout` | POST | 로그인만 | — | 204 |
| `/api/auth/me` | GET | 로그인만 | — | 200 `{ id, email, name }` |
| `/api/projects` | POST | 로그인만 | `{ name, slug, description? }` | 201 `{ ...프로젝트, role }` — 호출자가 owner가 되므로 `role`은 항상 `"owner"`다 |
| `/api/projects` | GET | 로그인만 | — | 200 `{ ...프로젝트, role }[]`(호출자가 속한 것만, `created_at` 오름차순). 각 항목의 `role`은 **그 호출자의** 역할이다 |
| `/api/projects/:projectId` | GET | viewer | — | 200 `{ ...프로젝트, role }` |
| `/api/projects/:projectId` | PATCH | owner | `{ name?, slug?, description? }`(하나 이상) | 200 `{ ...프로젝트, role }` |
| `/api/projects/:projectId` | DELETE | owner | — | 204 |
| `/api/projects/:projectId/members` | GET | viewer | — | 200 멤버 배열 — 항목은 `{ userId, email, name, role, invitedAt }` |
| `/api/projects/:projectId/members` | POST | owner | `{ email, role }`(이미 가입한 사용자만 초대 가능) | 201 멤버 |
| `/api/projects/:projectId/members/:userId` | PATCH | owner | `{ role }` | 200 멤버(마지막 owner의 강등은 409) |
| `/api/projects/:projectId/members/:userId` | DELETE | owner | — | 204(마지막 owner 제거는 409) |
| `/api/projects/:projectId/menu` | GET | viewer | — | 200 메뉴 트리(중첩 배열, `pages` 없음) |
| `/api/projects/:projectId/menu` | POST | editor | `{ parentId?, title }` | 201 `{ id, projectId, parentId, title, sortOrder }` — **트리 응답과 다른 모양이다**(`children`·`pages`가 없다) |
| `/api/projects/:projectId/menu/:nodeId` | PATCH | editor | `{ title?, parentId?, sortOrder? }`(하나 이상) | 200 `{ id, projectId, parentId, title, sortOrder }`(POST와 같은 키) |
| `/api/projects/:projectId/menu/:nodeId` | DELETE | editor | — | 204(자식 메뉴·페이지가 있으면 409) |
| `/api/projects/:projectId/pages` | POST | editor | `{ menuNodeId, title, description? }` | 201 **페이지 여덟 키**(아래 "페이지 응답 형태"). 기본 스키마는 빈 `Page`다 |
| `/api/projects/:projectId/pages/import` | POST | editor | `{ menuNodeId, file, title? }` | 201 `{ page, comments: { inserted, dangling }, ignoredLayoutRef?, warnings? }` — **§11.2의 페이지 JSON으로 새 페이지를 만든다**(아래 "페이지 JSON 가져오기"). 봉투 위반·모르는 버전·NUL 400, 메뉴 없음 404, 카탈로그 **오류** 422 |
| `/api/projects/:projectId/pages/:pageId` | GET | viewer | — | 200 페이지(스키마 포함, 최신 버전으로 마이그레이션되어 옴). `headSeq`가 다음 편집의 `baseSeq`다 |
| `/api/projects/:projectId/pages/:pageId` | PATCH | editor | `{ title?, description?, menuNodeId?, sortOrder? }`(하나 이상, `schema`는 여기서 못 바꾼다) | 200 **페이지 여덟 키**(POST·GET과 같다) |
| `/api/projects/:projectId/pages/:pageId/schema` | PUT | editor | `{ schema }`(문서 봉투 전체) | 200 페이지(봉투 위반 400, 카탈로그 **오류** 422, 실패 시 기존 스키마 보존). 경고가 있으면 `warnings`가 더 붙는다. 통째 교체도 revision을 남긴다 |
| `/api/projects/:projectId/pages/:pageId/ops` | PATCH | editor | `{ baseSeq, ops[], clientOpId? }` | 200 `{ seq, revisionId, inverse, schemaVersion, clientOpId?, warnings? }`(본문·경로 제약 위반과 지원하지 않는 문서 버전·NUL 문자는 400, 페이지 없음 404, baseSeq 불일치·패치 실패 409, 카탈로그 **오류** 422) |
| `/api/projects/:projectId/pages/:pageId/revisions` | GET | viewer | `?mine=true&limit=50` | 200 revision 배열(seq 내림차순). **`limit` 최대 200이 곧 도달 가능한 이력의 전부다** — 커서 페이지네이션이 없다(D11) |
| `/api/projects/:projectId/pages/:pageId` | DELETE | editor | — | 204 |
| `/api/projects/:projectId/pages/:pageId/comments` | GET | viewer | — | 200 코멘트 배열(`created_at` 오름차순). 항목은 `{ id, nodeId, body, authorId, authorName, createdAt, updatedAt }` |
| `/api/projects/:projectId/pages/:pageId/comments` | POST | editor | `{ nodeId, body }` | 201 `{ comment, marker, seq, markerOps }` — **번호가 없는 노드면 문서에 `marker`를 붙이고 revision을 남긴다**(아래 "코멘트와 번호"). 문서에 없는 노드는 404, 본문 1~2000자 밖·NUL은 400, 그 사이 남이 고쳤으면 409 |
| `/api/projects/:projectId/pages/:pageId/comments/:commentId` | PATCH | editor | `{ body }` | 200 코멘트. **작성자만 고칠 수 있다 — 남의 것은 403.** 문서를 안 바꾸므로 `seq`가 없다 |
| `/api/projects/:projectId/pages/:pageId/comments/:commentId` | DELETE | editor | — | 200 `{ seq, markerOps }`(**204가 아니다** — 문서 변화를 실어야 한다). **그 노드의 마지막이면 `marker`도 지운다.** 남의 코멘트도 지울 수 있다 |
| `/api/projects/:projectId/pages/:pageId/comments/renumber` | POST | editor | — | 200 `{ seq, markerOps }` — 문서 순서대로 1부터 재번호(§9). **한 revision이다.** 바꿀 것이 없으면 `markerOps: []`이고 revision도 안 쌓인다 |
| `/api/projects/:projectId/tree` | GET | viewer | — | 200 `{ menu }` — 메뉴 트리 + 각 노드의 `pages`(스키마는 싣지 않는다) |
| `/api/projects/:projectId/theme` | GET | viewer | — | 200 `{ themeId, theme, issues }` — **이 프로젝트의 화면이 지금 써야 할 테마 하나**(아래 "프로젝트의 현재 테마"). 없으면 `theme: null` |
| `/api/projects/:projectId/theme` | PUT | **owner** | `{ themeId: string \| null }` | 200 `{ themeId, theme, issues }` — **GET과 같은 꼴**(같은 함수가 만든다). 기본 레이아웃의 `theme_id`를 바꾼다. `null`은 *"테마를 벗긴다"*. **목록 밖 `themeId`는 404**(남의 프로젝트 테마의 존재를 숨긴다), **기본 레이아웃이 없는 프로젝트는 409**, 봉투 위반 400 |
| `/api/projects/:projectId/themes` | GET | viewer | — | 200 테마 배열 — **시스템 테마가 함께 나온다**(아래 "테마 응답 형태"). 시스템 테마가 먼저, 그 안에서 `slug` 순 |
| `/api/projects/:projectId/themes` | POST | **owner** | `{ theme }` | 201 테마(봉투 위반 400, **오류** 422, 중복 id 409, NUL 400). 경고가 있으면 `warnings`가 더 붙는다 |
| `/api/projects/:projectId/themes/:themeId` | GET | viewer | — | 200 테마 — 파생 테마면 `base`가 더 붙는다. 시스템 테마는 어느 프로젝트에서나 읽힌다 |
| `/api/projects/:projectId/themes/:themeId` | PUT | **owner** | `{ theme }`(문서 전체) | 200 테마(통째 교체). 경고가 있으면 `warnings`가 더 붙는다. **시스템 테마는 403**, 남의 프로젝트 테마는 404 |
| `/api/projects/:projectId/themes/:themeId` | DELETE | **owner** | — | 204. **시스템 테마는 403**, 남의 프로젝트 테마는 404 |
| `/api/projects/:projectId/snapshots` | POST | **editor** | `{ tag, description? }` | 201 스냅샷(아래 "스냅샷 응답 형태"). **지금 상태를 태그 하나로 얼린다**(§4.5). 태그 중복 409, 수집 도중 프로젝트가 바뀌면 409(**문장이 다르다**), NUL 400, 태그 1~60자·설명 0~2000자 밖은 400 |
| `/api/projects/:projectId/snapshots` | GET | viewer | — | 200 스냅샷 배열(`created_at` 내림차순, 동률은 `tag` 오름차순). **`payload`가 없다** — 크기(`payloadBytes`)만 실린다 |
| `/api/projects/:projectId/snapshots/:snapshotId` | GET | viewer | — | 200 스냅샷 + `payload`. 남의 프로젝트의 id는 404(존재를 숨긴다) |
| `/api/projects/:projectId/snapshots/:snapshotId/restore` | POST | **owner** | — | 200 복원 결과(아래 "복원"). **그때로 되돌린다**(§4.5). 본문이 없다 — 안전망 스냅샷의 태그는 서버가 짓는다. 갈래별 상태는 아래 오류 표 |
| `/api/projects/:projectId/presets` | GET | viewer | — | 200 프리셋 배열 — **내장 3종이 함께 나온다**(아래 "프리셋 응답 형태"). 내장이 먼저, 그 뒤로 프로젝트 프리셋이 만든 순서대로 |
| `/api/projects/:projectId/presets` | POST | **editor** | `{ name, schema: WbNode[], description? }` | 201 프리셋. **`schema`는 문서 봉투가 아니라 root의 `children`이다.** `marker`는 저장하며 버린다. 이름 1~60자·설명 0~2000자 밖과 노드 봉투 위반·NUL은 400. **이름 중복은 오류가 아니다** |
| `/api/projects/:projectId/presets/:presetId` | DELETE | **editor** | — | 204. 없는 id·남의 프로젝트의 id는 404, **내장 id(`builtin:…`)는 400**(경로가 uuid를 요구한다) |
| `/api/projects/:projectId/export/preview` | GET | viewer | — | 200 `{ pages, duplicateTargets, brokenLinks, errors, themeId, fileName }` — **내려받기 전에 화면이 말할 것**(아래 "HTML 정적 번들 내보내기"). 페이지가 없으면 409 |
| `/api/projects/:projectId/export` | GET | viewer | — | 200 `application/zip` — §11.3의 번들. 이름은 `Content-Disposition`에만 있다. 페이지가 없으면 409 |
| `/health` | GET | (없음, 공개) | — | 200 `{ status: 'ok' }` |

### HTML 정적 번들 내보내기 (§11.3 — P8-4)

`GET .../export`가 §11.3의 트리를 zip 하나로 낸다.

```
wirebound-export-<슬러그>/
  index.html            트리 네비 + 뷰어 셸 (첫 페이지를 담는다)
  pages/….html          페이지마다 셸을 통째로
  assets/shell.css      뷰어 셸의 CSS
  assets/theme.css      구조 기본 CSS + 테마 컴파일 결과
  assets/runtime.js     상호작용 런타임
```

**페이지의 이름에 조상 메뉴가 붙는다**(P8-2 이월 §2의 판정 ②). `<title>`·좌측 트리의
이름·파일 이름 셋이 전부 `조상 메뉴들 + 페이지 제목`이고, 그래서 §11.3의 예시 파일 이름
(`관리자-회원-목록.html`)과 같은 꼴이 나온다. **붙이지 않으면 서로 다른 메뉴의 같은
제목이 좌측 트리에서 똑같은 두 줄이 된다** — 스모크에서 실측했다. 이름을 만드는 마디는
상호작용 타겟을 만드는 마디와 **같은 함수**에서 나온다(`services/page-target.ts`).

**출처는 라이브 프로젝트다**(P8-4 D1). 페이지·문서는 `pages` 표의 지금 값, 코멘트는
`comments` 표의 살아 있는 값, 테마는 프로젝트가 지금 쓰는 것(`GET .../theme`와 **같은
사슬**)이다. 스냅샷의 *"그때"*를 내보내는 경로는 아직 없다.

**URL에 파일 이름이 없다**(D7). 파일 이름은 안정한 열쇠가 아니라 페이지를 하나 더하면
뒤에서 부딪히던 이름들의 번호가 밀린다 — 그것으로 URL을 만들면 남의 북마크가 깨진다.
사람이 읽는 이름은 `Content-Disposition`과 미리보기의 `fileName`에만 있다.

#### `GET .../export/preview` — 내려받기 전에 화면이 말할 것

**내려받기 버튼이 조용히 성공하면 안 된다.** 그리지 못한 노드가 있어도 폴백이 든 HTML은
눈으로는 그럴듯한 한 장이고, 번들은 그것을 남에게 전달한다.

| 키 | 무엇 |
|---|---|
| `pages` | `{ id, title, target }[]` — 번들에 실릴 순서다. **`target`이 §8.1의 페이지 경로**이고, 저작 화면의 `navigate`·`openModal`에 그대로 적는 문자열이다 |
| `duplicateTargets` | 둘 이상의 페이지가 든 타겟. **그 타겟을 겨눈 링크는 어디에도 안 생긴다** |
| `brokenLinks` | `{ target, from, reason }[]` — 어느 페이지도 가리키지 못한 링크. `reason`은 `missing`(그 타겟을 든 페이지가 없다) 또는 `ambiguous`(둘 이상이다) |
| `errors` | `{ path, title, error }[]` — 그리지 못한 노드. **`title`이 어느 페이지인지 말한다** |
| `themeId` | 번들이 실은 테마. `null`이면 구조 기본 CSS만으로 그려진 것이다 |
| `fileName` | 내려받을 때 붙을 이름. **화면이 지어내지 않는다** |

**이 응답이 담지 않는 것 하나:** 한 노드를 여러 규칙이 서로 다른 prop으로 겨누면 미리 그릴
판이 곱으로 늘고, 상한을 넘으면 그 페이지의 런타임이 꺼진다. 그 사실은 **번들 자신이
말한다**(그 페이지의 상태 줄에 이유가 뜬다) — 여기서 다시 세려면 그 상한을 두 벌로 갖게
되고, 둘이 갈리는 날 화면이 거짓을 말한다.

### 프로젝트 응답 형태

위 표의 **`프로젝트`는 다섯 키다.** 프로젝트를 내는 네 응답(`POST /api/projects` ·
`GET /api/projects`의 각 항목 · `GET /api/projects/:projectId` · `PATCH /api/projects/:projectId`)이
**전부 같은 키 집합**을 낸다 — `role`을 포함해서다.

```jsonc
{ "id": "…", "name": "…", "slug": "…", "description": null, "role": "owner" }
```

**`role`은 응답에만 있고 요청 본문에는 없다.** `CreateProjectBody`·`UpdateProjectBody`가
`z.strictObject`라 **응답을 그대로 되보내면 400**이다
(`{"code":"bad-request", issues:[{"path":"","message":"인식할 수 없는 키: \"id\", \"role\""}]}`).

**슬러그가 형식을 어기면 400인데 문장이 하나뿐이다** — 형식·길이·빈 문자열이 전부
`"슬러그는 소문자·숫자·하이픈만 쓸 수 있고, 하이픈으로 시작하거나 끝날 수 없습니다"`로 온다
(길이 상한 64는 정규식 안에 있고 별도 메시지가 없다). **중복은 409
`"이미 사용 중인 슬러그입니다"`다.**

### 페이지 응답 형태

위 표의 **`페이지 여덟 키`는 이것이다.** 페이지를 내는 세 응답(`POST /pages` ·
`PATCH /pages/:pageId` · `GET /pages/:pageId`)이 **전부 같은 키 집합**을 낸다 —
서버의 `toResponse` 하나가 셋을 다 만든다.

```jsonc
{ "id": "…", "menuNodeId": "…", "title": "…", "description": null,
  "sortOrder": 0, "schemaVersion": 1, "headSeq": 0, "schema": { /* 문서 봉투 */ } }
```

**`PUT .../schema`만 아홉 번째 키를 낼 수 있다: `warnings`.** 저장된 문서에 경고가 있을
때만 붙고, **없으면 키 자체가 없다**(`clientOpId`를 조건부로 싣는 것과 같은 관례).
`POST /pages`·`GET /pages/:pageId`는 검증을 돌리지 않으므로 이 키를 내지 않는다 —
**즉 경고가 있는 페이지를 GET으로 읽어도 그 사실을 알 수 없다.** 알아야 하는 클라이언트는
받은 `schema`에 `validatePage`를 직접 돌린다(`@wirebound/schema`가 브라우저에서도 돈다).

**메뉴 노드는 다섯 키다**(`POST /menu` · `PATCH /menu/:nodeId`가 같다):

```jsonc
{ "id": "…", "projectId": "…", "parentId": null, "title": "…", "sortOrder": 0 }
```

**프로젝트와 같은 이유로 응답을 그대로 요청 본문에 되보낼 수 없다.** 넷 다 `z.strictObject`라
요청이 받지 않는 키가 섞이면 400이다 — 실측:

```
POST  /menu        응답 그대로 → 400 인식할 수 없는 키: "id", "projectId", "sortOrder"
PATCH /menu/:id    응답 그대로 → 400 인식할 수 없는 키: "id", "projectId"
POST  /pages       응답 그대로 → 400 인식할 수 없는 키: "id", "sortOrder", "schemaVersion", "schema", "headSeq"
PATCH /pages/:id   응답 그대로 → 400 인식할 수 없는 키: "id", "schemaVersion", "schema", "headSeq"
```

### 페이지 JSON 가져오기 (P7-3 — §11.2)

`POST .../pages/import`는 **파일 한 벌로 새 페이지를 만든다.** 절대 덮지 않는다 —
대상은 **메뉴 노드**이고 페이지는 그 형제 그룹의 맨 끝에 붙는다.

본문의 `file`이 §11.2의 봉투다. **구현이 §11.2의 예시와 갈리는 자리 둘**은
`packages/schema/src/page-json/envelope.ts`의 머리말에 근거와 함께 있다:

```jsonc
{
  "wireboundVersion": "1",
  "page": { "title": "회원 목록", "layoutRef": "admin-lnb", "description": null },
  // ① 예시는 root 노드를 싣지만 여기는 **문서 봉투**다 — 문서 버전을 적을 자리가 필요하다
  "schema": { "version": 1, "root": { "id": "n_root", "type": "Page", "children": [] } },
  // ② 예시의 `marker`는 받지 않는다 — 번호는 `schema` 안의 노드가 든다(P5-1 D1)
  "comments": [{ "nodeId": "n_7f3a", "body": "검색 조건은 AND 결합" }]
}
```

- **id를 전부 재발급하고 참조 둘을 함께 옮긴다** — 코멘트의 `nodeId`와 상호작용 `target`.
  트리 밖 참조(`page:…`)는 그대로 둔다.
- **파일의 트리에 없는 노드를 가리키는 코멘트는 버리지 않고 넣는다.** 그 수가 응답의
  `comments.dangling`이고, 들어간 뒤 화면은 그것을 *"사라진 노드"* 무리로 보인다.
- **`layoutRef`는 쓰지 않는다** — 오늘 페이지가 레이아웃을 고르는 경로가 없다
  (`pages`에 레이아웃 컬럼이 없다). 조용히 버리지 않고 응답의 `ignoredLayoutRef`로 말한다.
- **문서 쓰기는 편집 파이프라인을 지난다**(D1) — 가져오기 하나가 revision 하나를 남기고,
  그 역은 **빈 페이지**로 되돌린다.
- **한 트랜잭션이다.** 어느 갈래에서 끊기든 페이지도 문서도 코멘트도 남지 않는다 —
  갈래별로 *"무엇을 되돌리는가"*는 `services/page-import.ts`의 머리말에 표로 있다.
- **코멘트 작성자는 가져온 사람이다.** 파일에 작성자가 없고, 있어도 `comments.author_id`가
  `users`를 참조하므로 남의 서버의 id는 쓸 수 없다.

### 코멘트와 번호 (P5-1)

**번호(`marker`)는 코멘트 표가 아니라 페이지 문서의 노드가 든다.** 설계 §4.3이
`"marker": 2, // 우측 코멘트 번호 (없으면 코멘트 없음)`이라 적었고, 그래야 내보낸 HTML
번들(§11.3)이 문서만 들고 마커를 그린다. 본문·작성자·시각은 `comments` 표다.

| 규칙 | 어디서 |
|---|---|
| 한 노드의 코멘트들이 **같은 번호를 공유**한다(스레드) | `POST`가 노드에 번호가 있으면 그대로 쓴다 |
| **첫 코멘트가 번호를 만들고**, 새 번호는 문서에서 쓰이는 **최댓값 + 1**이다 | 지운 번호를 재사용하지 않는다 — 옛 번호를 가리키던 말이 다른 노드를 가리키게 되기 때문이다 |
| **마지막 코멘트를 지우면 번호가 사라진다** | §4.3의 *"없으면 코멘트 없음"* |
| 번호를 바꾸는 셋이 **전부 편집 파이프라인을 지난다** | 그래야 revision이 남아 undo가 되고(§7.3), `head_seq`가 올라 그 뒤 편집의 `baseSeq`가 안 틀어진다 |

**`markerOps`는 그 요청이 문서에 낸 변화다**(`PatchOp[]`). 클라이언트는 자기 문서에 같은
ops를 적용하고 `headSeq`를 `seq`로 맞춘다 — **문서를 통째로 돌려주지 않는 이유는 아직
보내지 않은 낙관적 편집이 화면에서 사라지기 때문이다.** 문서가 안 바뀐 경우(이미 번호가
있는 노드에 코멘트를 더 다는 것, 마지막이 아닌 코멘트를 지우는 것, 바꿀 것 없는 재번호)에는
`markerOps: []`이고 `seq`는 현재 `head_seq` 그대로다.

**`baseSeq`는 서버가 읽는다** — 요청이 도착한 시점에 `head_seq`를 읽어 파이프라인에
넘긴다(**잠근 뒤가 아니다**). 그래서 그 사이 다른 편집이 커밋되면 409가 나가고,
*"남이 고쳤어도 밀어붙이는"* 일이 없다. 낙관적 잠금이 필요한 이유는 번호의 유일성이다 —
없으면 서로 다른 두 노드에 동시에 달린 첫 코멘트가 둘 다 1번을 받는다.

**성립하는 어긋난 상태 둘.** 서버는 이것을 고쳐 주지 않는다.

- **번호는 있는데 코멘트 행이 없는 노드.** undo가 번호 부여를 되돌렸거나, JSON을
  가져왔거나(§11.2), 사람이 `marker`를 직접 편집한 경우다. **문서가 진실이므로 캔버스는
  그 번호를 그린다.** 그 노드에 코멘트를 달면 **있던 번호를 그대로 쓴다.**
- **코멘트 행은 있는데 노드가 문서에 없는 경우.** 코멘트가 달린 노드를 지우면 그 행이
  남는다(`comments.node_id`에 FK가 없다 — 노드는 테이블이 아니라 jsonb 안의 값이다).
  그 행은 GET에 그대로 실려 나간다.

### 트리 응답 형태 (`GET /api/projects/:projectId/tree`)

메뉴 폴더와 페이지를 한 트리로 합쳐 좌측 패널에 그대로 쓸 수 있게 낸다(설계 §9).
`menu`만 있다 — `pages.menu_node_id`가 `NOT NULL`이라 페이지는 항상 메뉴 노드에
속하므로 별도의 `rootPages` 같은 필드는 없다.

```jsonc
{
  "menu": [
    {
      "id": "…", "title": "회원관리", "sortOrder": 0,
      "pages": [ { "id": "…", "title": "목록", "sortOrder": 0 } ],
      "children": [
        { "id": "…", "title": "권한", "sortOrder": 0, "pages": [], "children": [] }
      ]
    }
  ]
}
```

페이지 항목에는 `id`·`title`·`sortOrder`만 있다 — `schema`는 실리지 않는다(트리는
목록을 훑는 용도이고, 스키마를 포함하면 프로젝트가 커질수록 응답이 무거워진다).
페이지 본문(스키마 포함)이 필요하면 `GET /api/projects/:projectId/pages/:pageId`를
따로 호출한다.

### 테마 응답 형태

테마를 내는 응답(목록의 각 항목 · `POST` · `GET` · `PUT`)의 **바탕은 네 키**다.

```jsonc
{ "id": "…", "system": false, "updatedAt": "2026-08-10T…Z",
  "theme": { "meta": { "id": "brand", "name": "브랜드", "version": "1.0.0" }, "tokens": { … } } }
```

**여기에 조건부로 붙는 키가 둘이다** — 아래 `base`와 `warnings`. 둘 다 **없으면 키 자체가
없다**(페이지 쪽 `warnings`·`clientOpId`와 같은 관례).

- **`id`는 행의 uuid, `theme.meta.id`는 slug다.** 경로에 쓰는 것은 `id`다.
- **`system: true`면 읽기 전용이다**(§6.10). 그 테마는 `project_id IS NULL`이고,
  수정·삭제 시도는 owner여도 **403**이다 — 목록·조회가 이미 그 존재를 보여 주므로
  숨길 것이 없고, 말해야 하는 것은 "읽기 전용"이라는 사실이다. 반대로 **남의 프로젝트
  테마는 404**다(설계 §10의 존재 숨김).
- **상세 조회(`GET .../themes/:themeId`)만 `base`를 낼 수 있다.**
  그 테마가 `meta.extends`를 선언했을 때만 붙고, 값은 **상속 대상 시스템 테마 전문**이다.
  `resolveTheme(document, base)`가 base 없이는 파생 문서의 해석 자체를 거부하므로,
  base를 빼고 내면 클라이언트가 쓸 수 없는 것을 받는다. **목록에는 붙지 않는다** —
  파생 항목마다 시스템 테마 전문이 붙어 응답이 항목 수만큼 부푼다.

- **쓰기 둘(`POST .../themes` · `PUT .../themes/:themeId`)만 `warnings`를 낼 수 있다**
  (P4c-1). 저장된 테마에 **경고**가 있을 때만 붙고 값은 `ThemeIssue[]`다. 페이지 쪽
  `PUT .../schema`의 `warnings`와 같은 형식이고 만드는 함수도 하나다(`http/warnings.ts`).
  **읽기(`GET`)와 목록은 이 키를 내지 않는다** — 그 라우트들은 테마를 해석하지 않기
  때문이다. 경고를 알아야 하는 클라이언트는 받은 `theme`(파생이면 `base`와 함께)에
  `resolveTheme`을 직접 돌린다(`@wirebound/themes`가 브라우저에서도 돈다). 캔버스가
  이미 그렇게 한다(`apps/web`의 `use-theme-css.ts`).

**저장되는 것은 파생 테마 그대로다.** `extends`를 지닌 채 왕복하고, 병합 결과(홀로
서는 테마)는 저장하지 않는다 — 그것이 저장될 자리는 §4.5의 스냅샷 하나뿐이고 아직 없다.

#### 테마 본문 검증 — 400과 422가 갈린다

`PUT .../pages/:pageId/schema`의 §7.1 게이트와 같은 모양이다.

| 무엇 | 상태 |
|---|---|
| `{ theme }` 봉투 위반(절 이름 오타, `meta` 없음, `meta.id`가 `[A-Za-z0-9_-]{1,64}` 밖, `extends`가 `system:<id>` 꼴이 아님) | **400** |
| 테마에 NUL 문자(U+0000) | **400** |
| 상속 대상 시스템 테마가 **없음**(꼴은 맞지만 그런 이름이 없다) | **422** `bad-extends` |
| 토큰 참조가 안 풀림, 카탈로그에 없는 컴포넌트/구조/조각/변형/상태, 화이트리스트 밖 스타일 프로퍼티 등(**`error`**) | **422**, `issues`에 `ThemeIssue[]`(경고까지 함께) |
| **`warning`만 있음** | **저장된다.** 경고는 성공 응답의 `warnings`에 실린다(위) |
| `(project_id, meta.id)` 중복 | **409** |

**`ThemeIssue`도 `severity`를 갖는다**(`"error"` 또는 `"warning"`) — 페이지의
`ValidationIssue`와 같은 값 집합이고 선을 긋는 것은 `partitionIssues` 하나다.
**오늘 `warning`인 테마 이슈는 둘이다**(P4c-1, `@wirebound/themes`의
`THEME_ISSUE_SEVERITY`가 코드마다 정한다):

| 코드 | 언제 | 왜 막지 않는가 |
|---|---|---|
| `suspicious-literal` | 값이 참조처럼 생겼는데 이름공간이 목록 밖이다(`"spce.4"`) | 값이 **적힌 그대로** CSS에 실리고 테마는 선다. 멀쩡한 CSS 리터럴이 그 모양일 수 있어 판정이 확실하지 않다 |
| `node-handle-overwrite` | 테마 스타일이 같은 셀렉터에서 **노드 손잡이**가 내는 CSS 프로퍼티를 낸다 | §6.5대로 **테마가 이기는 것이 옳다.** 결함은 그것이 조용하다는 것뿐이다 |

**상속 깊이는 1단계다**(§6.9). `extends`가 가리킬 수 있는 것은 **코드의 시스템 테마**뿐이라
파생 테마를 다시 상속하려 하면 그런 시스템 테마가 없어 422가 된다.

### 프로젝트의 현재 테마 (`GET /api/projects/:projectId/theme`)

설계 §4.2의 사슬 `projects.default_layout_id → layouts.theme_id → themes`를 한 번에
따라가 **캔버스가 그대로 쓸 수 있는 테마 하나**를 낸다.

```jsonc
{ "themeId": "…", "theme": { "meta": { … }, "tokens": { … }, … }, "issues": [] }
```

**`themeId`는 고르개를 위한 것이다**(P4b-3). `theme`은 파생을 **합친** 문서라
`meta.extends`가 지워져 있고, `meta.id`(=slug)로 목록과 맞대는 것은 **성립하지 않는다** —
유일성 단위가 `(project_id, slug)`라 시스템 테마와 프로젝트 테마가 같은 slug를 가질 수 있다.
캔버스는 이 값을 읽지 않는다.

**`theme: null`인데 `themeId`가 있을 수 있다** — 상속이 끊긴 파생을 고른 상태다. 반대로
테마 행 자체가 사라졌으면 둘 다 `null`이다.

**`.../themes/:themeId`와 다른 것을 낸다 — 소비자가 다르기 때문이다.**

| 엔드포인트 | 소비자 | 내는 것 |
|---|---|---|
| `.../themes/:themeId` | 테마 저작 UI | **파생 문서 그대로 + `base`** — 편집 대상은 사람이 적은 것이다 |
| `.../theme` | 캔버스·내보내기 | **홀로 서는 테마 하나** — 파생이면 `mergeTheme`으로 합쳐 낸다 |

합쳐 내는 이유: `resolveTheme(document, base)`가 base를 요구하므로 합치지 않고 내면
받는 쪽이 두 인자를 스스로 맞춰야 한다. **합친 결과를 저장하지는 않는다** — 읽을 때
계산할 뿐이고 저장되는 것은 파생 그대로다.

**`theme`이 `null`인 경우가 셋이고 전부 정상이다:** 기본 레이아웃이 없다 · 레이아웃이
테마를 고르지 않았다 · 테마 행이 사라졌다. 그때 화면은 **구조 기본 CSS만으로** 그려진다.
해석 이슈가 나도 422가 아니라 `issues`에 실어 200으로 낸다 — 그리기를 막는 것보다
테마 없이 그리는 편이 낫다.

### 레이아웃

**프로젝트를 만들면 기본 레이아웃이 함께 생긴다**(같은 트랜잭션). 그 문서는 `Page`
하나와 `Slot` 하나이고, `theme_id`는 시스템 `admin`을 가리킨다.

- **레이아웃을 편집하는 엔드포인트는 없다.** 이 단계의 레이아웃은 참조를 나르고 `Slot`을
  담는 그릇이다(§4.4의 레이아웃 에디터는 뒤 단계다).
- **저장된 `schema`를 오늘 그리는 코드는 없다 — 캔버스는 페이지 문서만 그린다(D6 반증).**
  쓰는 자리는 프로젝트 생성 하나이고, 읽는 쪽이 실제로 쓰는 것은 `theme_id`뿐이다.
  `renderComposed`로 합치면 레이아웃의 루트 `Page`와 `Slot`이 **노드 둘을 더 그려**
  페이지 문서에 없는 `data-wb-id`가 DOM에 섞인다(`packages/renderer/test/compose-identity.test.tsx`).
  그리는 코드가 생기는 것은 레이아웃 에디터가 올 때이고, 그쪽은 **선택 모델부터** 정해야 한다.
- `projects.default_layout_id`와 `layouts.project_id`가 **서로를 가리키는 순환**이라
  `default_layout_id`가 nullable이다. 생성은 프로젝트 → 레이아웃 → 프로젝트 UPDATE
  세 문장으로 닫는다.
- **`layouts.theme_id`는 `ON DELETE RESTRICT`다.** 쓰이고 있는 테마를 지우려 하면
  **409**다. `SET NULL`로 두면 화면이 말없이 달라지므로 실패하는 쪽을 골랐다.
- 마이그레이션 0007 **이전에 만들어진 프로젝트**는 `default_layout_id`가 `NULL`로
  남는다(마이그레이션이 만들어 주지 않는다 — 그 시점엔 `themes`가 비어 있어 테마 없는
  레이아웃만 만들 수 있고, 그것은 레이아웃이 없는 것과 관찰 결과가 같다). 그런 프로젝트에
  레이아웃을 주는 경로는 아직 없다.

### 스냅샷 응답 형태 (§4.5 — P6-1)

**스냅샷은 삭제 없는 태그다.** 얼리는 쪽이 P6-1, 되돌리는 쪽이 P6-2다(아래 "복원").

응답은 **일곱 키**이고, 상세·생성에만 여덟째(`payload`)가 붙는다.

```jsonc
{ "id": "…", "tag": "v1", "description": "첫 릴리스 직전", "createdBy": "…",
  "createdByName": "장병현", "createdAt": "2026-08-12T…", "payloadBytes": 8123,
  "payload": { /* 상세·생성에만 */ } }
```

`payload`가 담는 것(규격은 `src/services/snapshot-payload.ts`가 소유한다):

| 절 | 담는 것 |
|---|---|
| `payloadVersion` | payload **형식**의 버전. `PageDocument.version`과 **다른 축**이다 |
| `capturedAt` | 캡처 시각(ISO) — **Postgres의 `clock_timestamp()`**이고, 뜻은 *"캡처가 payload의 내용을 그대로임을 마지막으로 확인한 순간"*이다. **`snapshots.created_at`과 같은 값이다**(서버가 이 값을 그 컬럼에 심는다) |
| `menu` | 메뉴 노드 평평한 목록(`parentId`가 구조를 나른다) |
| `pages` | 페이지 + **저장된 문서 그대로** + `headSeq`(§4.5의 요구) |
| `layouts` | 레이아웃 **전부**(프로젝트당 하나라고 가정하지 않는다) |
| `themes` | 레이아웃별 **병합이 끝난 홀로 서는 테마**. 고르지 않았으면 `null` |
| `comments` | 코멘트 + 그 시점의 작성자 이름 |

**겹layer(런타임 상태)는 담지 않는다.** payload 규격이 `z.strictObject`라 선언되지 않은
절이 실리면 그 자리에서 파싱이 죽는다.

**저장된 문서를 마이그레이션하지 않는다.** `CURRENT_DOCUMENT_VERSION`보다 큰 버전의
페이지가 하나 있어도 캡처는 성공한다 — 캡처는 읽기이고, 읽기가 실패하면 사용자는 얼릴
수단 자체를 잃는다(그 페이지의 `GET`은 여전히 400이다).

**테마는 병합된 결과로 얼린다.** 참조만 저장하면 테마가 나중에 바뀌었을 때 스냅샷이 다른
모습으로 복원된다(§4.5). `mergeTheme` 결과에는 `extends`가 남지 않는다.

**`payloadBytes`는 `octet_length(payload::text)`다** — DB가 들고 있는 문서의 옥텟 수이고,
생성·목록·상세 셋이 같은 식을 쓴다. §16의 열린 항목(보관 정책)을 닫을 관측이라 **상한은
두지 않는다.**

**두 409의 문장이 다르다.** 태그 중복은 *"같은 태그의 스냅샷이 이미 있습니다"*(할 일:
이름을 바꾼다), 지문 불일치는 *"스냅샷을 뜨는 동안 프로젝트가 바뀌었습니다. 다시 시도해
주세요"*(할 일: 다시 시도한다). 코드는 둘 다 `conflict`이므로 **문장이 갈라야** 화면이
가른다.

### 복원 (§4.5 — P6-2)

`POST /api/projects/:projectId/snapshots/:snapshotId/restore` · **owner 전용**(§10 — editor는
생성만 한다) · **본문이 없다.**

**이력을 지우지 않는다.** 페이지 문서는 편집 파이프라인(`applyEdit`)을 타므로 되돌림 자체가
**새 revision으로 append**된다(§4.5). 그 revision의 `actorLabel`은 `복원: <원본 태그>`라
평범한 편집과 구분된다.

```jsonc
{
  "summary": {
    "menu":     { "created": 0, "updated": 1, "deleted": 0 },
    "pages":    { "created": 1, "metaUpdated": 0, "schemaChanged": 2, "schemaUnchanged": 3, "deleted": 1 },
    "comments": { "created": 0, "updated": 0, "deleted": 2 },
    "layouts":  { "themeRefChanged": 1 }
  },
  "safetySnapshot": { "id": "…", "tag": "복원 전 2026-08-12T09:24:30.443Z" },
  "themes": [{ "layoutId": "…", "themeId": "…", "differs": false }]
}
```

**바뀐 페이지 수와 그대로인 페이지 수를 따로 센다.** 내용이 같은 페이지는 `applyEdit`을
아예 부르지 않는다 — 안 바뀐 페이지까지 revision을 만들면 *"복원이 무엇을 바꿨나"*를
이력에서 읽을 수 없다. 비교는 **내용**으로 한다(`headSeq`가 같아도 그 사이 편집했다가
되돌렸을 수 있다).

#### 복원은 먼저 안전망 스냅샷을 뜬다

복원은 **파괴적**이다 — 스냅샷 이후에 만들어진 페이지를 지우면 `revisions.page_id`의
CASCADE가 그 페이지의 이력을 함께 데려간다. 그래서 복원은 **자기 트랜잭션 안에서 먼저
캡처를 부르고** 그 id·태그를 응답에 싣는다. 태그는 `복원 전 <capturedAt>`이고 설명에 원본
태그와 id가 들어간다.

- **바꿀 것이 없어도 만든다.** 안전망은 *"계획이 틀렸을 때"*를 위한 보험인데 만들지 말지를
  그 계획으로 판정하면 보험의 뜻이 사라진다. 대가: 스냅샷은 지울 수 없으므로(§4.5) 복원
  횟수만큼 태그가 쌓인다.
- **태그가 부딪히면 409다.** 조용히 덮으면 앞 복원의 안전망이 사라지고, 조용히 이름을
  바꾸면 응답이 가리키는 태그와 사용자가 예상하는 태그가 갈린다. 부딪히려면 같은 밀리초에
  같은 프로젝트를 두 번 복원해야 한다 — 재시도로 풀린다.
- **되살아난 페이지는 `head_seq` 0에서 다시 시작한다.** 이력은 되살아나지 않는다(지워질 때
  CASCADE가 데려갔다). 복원이 되살릴 수 있는 것은 **문서**다.

#### 테마는 되돌리지 않는다 — 다름을 말한다

payload의 테마는 **병합 결과**다. 그것을 `themes` 행에 쓰면 파생 테마가 평탄화되어 상속이
영구히 사라지고, 시스템 테마는 애초에 쓸 수 없다(§6.10). 그래서 복원은 레이아웃의
`theme_id` **참조만** 되돌리고, 그 참조가 지금 내는 병합 결과가 payload의 동결본과 다르면
`themes[].differs`로 말한다. 테마를 되돌리는 경로는 따로 있다(고르개·가져오기).

**`differs`는 키 순서 변경을 보지 못한다.** `snapshots.payload`가 `jsonb`라 캡처가 무엇을
담든 저장되는 순간 키가 정렬되는 반면 `themes`의 절은 `json`이라 원문 순서를 들고 있어서,
순서를 보는 비교는 *"항상 다르다"*만 낸다(실측: 같은 테마의 `meta`가 한쪽 `{id,name,version,
description}`, 다른 쪽 `{id,name,description,version}`). 순서까지 보려면 캡처가 순서를
**값으로** 실어야 하고 그것은 `payloadVersion` 2다.

#### 레이아웃 개수가 다르면 복원하지 않는다

`layouts`에는 `project_id` 유니크가 없어 프로젝트에 레이아웃이 둘 이상일 수 있다. *"하나를
찾아 payload의 하나로 덮는다"*로 짜면 그런 프로젝트에서 **하나를 조용히 버린다.** 레이아웃을
만들거나 지우는 것은 §4.4의 레이아웃 에디터가 할 일이므로, **id 집합이 다르면 409로 끊고
조용히 맞추지 않는다.**

#### §13.1의 미지원 버전 탈출구 — **만들지 않는다** (P6-2가 닫았다)

§13.1이 *"유력한 자리는 P6 스냅샷 복원이다"*라며 열어 둔 항목이다. 판정은 **만들지
않는다**이고, 근거는 추측이 아니라 실측한 구조다:

| 조건 | 파이프라인이 어디서 막나 | 실측 |
|---|---|---|
| **저장된** 문서가 미지원 버전 | 2단계 `migrateDocument`가 던진다 | `unsupported-version` — *"지원하지 않는 문서 버전: 999"* |
| **payload의** 문서가 미지원 버전 | 7단계 `after.version !== before.version` | `invalid` — *"version은 편집으로 바꿀 수 없습니다"* |

두 방향 모두 파이프라인이 거부하고, 우회하려면 **파이프라인을 타지 않는 두 번째 쓰기
경로**가 필요하다 — 그것이 정확히 P2a가 D1(모든 스키마 변경이 revision을 남긴다)을 위해
없앤 것이다. 복원은 그 경로를 되살릴 이유가 되지 못한다: 복원 자체가 저장된 문서를 읽어야
하기 때문이다.

**대신 응답이 원인을 말한다.** §13.1이 *"400 응답이 최소한 원인을 말해 주는 상태로 둔다"*고
한 것을 한 단계 밀어, **어느 페이지가 어떤 버전이라 막혔는지**를 싣는다. 복원 전체가
실패한다(부분 성공을 만들지 않는다).

```
400 지원하지 않는 문서 버전이라 복원할 수 없습니다: 사용자 목록(현재 버전 999)
400 지원하지 않는 문서 버전이라 복원할 수 없습니다: 사용자 목록(스냅샷 버전 999)
```

**막는 술어는 *"복원이 그 페이지의 문서를 쓰는가"*다 — 좁힘이 두 칸이다.**

| 그 페이지를 | 막나 | 왜 |
|---|---|---|
| **지운다**(payload에 없다) | 안 막는다 | 지우는 데 마이그레이션이 필요 없다 |
| **양쪽 문서가 같다**(D4가 건너뛴다) | 안 막는다 | 쓰지 않는 페이지를 버전 때문에 막는 것은 D4와 일관되지 않는다 |
| **되살린다**(`create-page`) | 막는다 | 쓰기다 — 열 수 없는 페이지를 복원이 **만들어 내는** 셈이 된다 |
| **문서를 되돌린다**(`write-page-schema`) | 막는다 | 쓰기다 — 파이프라인도 어차피 거부한다 |

둘째 칸이 없으면 **미지원 버전 페이지가 하나 생긴 프로젝트는 어떤 스냅샷으로도 되돌아갈 수
없다** — 그 페이지를 아무도 건드리지 않는 복원까지 전부 400이다. §13.1이 걱정하는 것은
*"그 페이지를 복구하려는 순간"*이지 *"그 페이지와 무관한 복원"*이 아니다.

#### 복원의 오류 표 — 갈래마다 한 줄

| 상황 | 상태 | 문장(요지) |
|---|---|---|
| 없는 스냅샷 / 남의 프로젝트의 스냅샷 | 404 | 스냅샷을 찾을 수 없습니다 |
| `payloadVersion`이 이 서버보다 크다 | 400 | 이 서버가 읽을 수 없는 스냅샷 형식입니다 (형식 N, 지원 M) |
| 복원 도중 프로젝트가 바뀌었다 | 409 | 복원하는 동안 프로젝트가 바뀌었습니다. 다시 시도해 주세요 |
| 안전망 태그가 이미 있다 | 409 | 복원 전 상태를 저장할 태그(…)가 이미 있습니다. 다시 시도해 주세요 |
| 레이아웃 id 집합이 다르다 | 409 | 레이아웃 구성이 스냅샷과 다릅니다 … 복원하지 않았습니다 |
| 코멘트 작성자가 더 이상 없다 | 409 | 스냅샷의 코멘트를 남긴 사용자가 더 이상 없습니다 (N명) |
| 미지원 문서 버전 | 400 | 지원하지 않는 문서 버전이라 복원할 수 없습니다: 제목(현재\|스냅샷 버전 N) |
| payload 안의 참조가 끊겼다 | 400 | 스냅샷 안의 참조가 끊겨 있습니다: … |
| 만들 페이지의 문서가 검증에 걸렸다 | 422 | 복원할 페이지의 스키마 검증에 실패했습니다: 제목 |
| `applyEdit` 실패 | 파이프라인 표 | **문장 앞에 페이지 제목이 붙는다.** 상태 코드는 `http/edit-outcome.ts` 하나가 소유한다(`stale` 409 · `patch-failed` 409 · `invalid` 422 · …) |

**400과 409를 가르는 선은 *"다시 보내면 풀리는가"*다.** 409 넷은 지금 상태와의 충돌이라
재시도나 프로젝트 수정으로 풀리고, 400 셋은 그 스냅샷·그 배포로는 풀리지 않는다.

**어느 갈래에서 끊기든 아무것도 바뀌지 않는다.** 판정과 다섯 자원의 쓰기가 전부 한
트랜잭션 안에서 돌고, `applyEdit`의 실패는 **값으로 돌려주지 않고 던져서** 롤백시킨다
(값으로 `return`하면 바깥 트랜잭션이 커밋된다).

#### 복원은 자기가 쓰는 동안 남이 못 고치게 한다

트랜잭션 안에서 **프로젝트 행과 메뉴·페이지·레이아웃·코멘트 행을 `FOR UPDATE`로 잠근
뒤** 캡처를 부른다(잠그기 **전에** 읽으면 *"서버가 값을 읽어 밀어붙인다"*가 성립한다).

**무엇이 막히는지 실측했다**(실제 커밋하는 두 커넥션, 음성 대조 포함).
**수를 여기 적지 않는다 — `test/restore-lock-census.test.ts`가 센다.** 그 파일이 분모를
`src/routes/`에서 만들므로 쓰기 라우트가 하나 늘면 먼저 죽는다. 세는 단위와 갈래별 값도
거기 있다.

> **앞 판은 이 자리에 *"오늘의 쓰기 라우트 아홉"*이라 적었고 그 아홉은 census가 아니었다** —
> 손으로 고른 아홉이었다. 빠진 여섯은 재 보니 전부 막혀 결론이 오히려 강해졌지만, **분모를
> 손으로 적으면 빠진 항목이 결과를 바꿔도 아무도 모른다.**

그 파일이 고정하는 성질 셋:

| 성질 | 뜻 |
|---|---|
| **복원이 되돌리는 행을 쓰는 라우트는 하나도 빠짐없이 막힌다** | D8이 실제로 주장하는 명제다 |
| 막히지 않는 줄의 **목록이 고정돼 있다** | 새 줄이 그리로 들어오면 사람이 *"이것이 정말 안 막혀도 되나"*를 다시 판정한다 |
| 잠금 없이는 같은 요청들이 전부 창 안에 끝난다 | *"막힌다"*와 *"그냥 느리다"*를 가르는 음성 대조 |

`FOR UPDATE`는 이미 있는 행에만 걸리고 Postgres에 술어 잠금이 없으므로 *"새 행 삽입"*은
원래 막히지 않아야 한다. 대부분이 막힌 것은 **FK 때문**이다 — 자식 행을 넣으면 Postgres가
참조되는 부모 행에 `FOR KEY SHARE`를 걸고 그것이 `FOR UPDATE`와 충돌한다. 남는 구멍은
*"잠긴 어떤 행도 참조하지 않는 삽입"*이었고(네 표만 잠갔을 때는 `parent_id`가 `NULL`인
메뉴 삽입), `projects` 행을 잠그면 그것도 닫힌다 — 모든 프로젝트 자원이 `project_id`로
그 행을 참조한다.

**막히지 않는 것 셋(전부 복원이 되돌리지 않는 것이다):**

- **테마 문서 수정·삭제** — 복원이 테마 **행**을 쓰지 않으므로 그 표를 잠그지 않는다.
  복원이 도는 동안 고치면 **그 편집이 이긴다**(`differs` 판정은 그 순간의 값이다).
  **`POST .../themes`는 막힌다** — `themes.project_id`가 `projects`를 참조한다.
  *"테마 표를 안 잠근다"*를 *"테마 라우트는 안 막힌다"*로 읽으면 틀린다.
- **바꿀 번호가 없는 `renumber`** — `applyEdit`을 아예 부르지 않는다. 쓰지 않으므로 해가 없다.
- **멤버 수정·삭제** — `project_members`의 UPDATE·DELETE는 부모 행을 안 잡는다.

#### 캡처는 자기가 본 것이 한 시점인지 확인한다

수집 **전후로 지문을 읽어** 다르면 409다. 지문은 payload에 실릴 내용 자체이고
(`readCaptureFingerprint`), 다섯 테이블을 덮는다. **재시도 루프는 없다** —
`PUT .../schema`가 `stale`에서 한 판단과 같다.

**개수 + `max(updated_at)` 꼴로는 못 잡는 자리가 둘 있어서 내용 지문으로 바꿨다:**
`menu_nodes`에는 `updated_at` 컬럼이 아예 없어 제목만 바뀌면 아무 값도 안 움직이고,
`themes.updated_at`은 `now()`(트랜잭션 시작 시각)라 한 트랜잭션 안에서는 얼어 있다.

**실패해도 아무것도 쓰지 않는다** — 캡처는 읽기뿐이고 삽입은 그 결과를 받은 뒤에 한다.

#### `capturedAt`과 `created_at`은 **같은 값**이다

수집 **후** 지문을 읽는 그 문장에서 `clock_timestamp()`를 함께 읽어 `capturedAt`에 담고,
삽입이 그 값을 `created_at`에 심는다. **따로 두면 어긋난다 — 재서 알았다:** 앞 판은
`capturedAt`을 Node의 `new Date()`로, `created_at`을 컬럼 기본값 `now()`로 두었고 실측
**+103ms**(api 하네스)·**+25ms**(라우트 경로, 리뷰어 실측) 어긋났다. `now()`는
`transaction_timestamp()`라 트랜잭션 안에서 얼어 있고, 두 값은 애초에 다른 순간(수집 끝 vs
삽입 트랜잭션 시작)이며, 시계도 둘(Node·Postgres)이었다.

**복원(P6-2)이 *"그때"*로 읽어야 하는 값은 `payload.capturedAt`이다.** `created_at`은 그
값의 사본이고, 목록 정렬이 쓰는 것이 그쪽이다.

#### 시스템 테마는 코드가 진실이다

`packages/themes/src/system/`이 시스템 테마를 갖고 있고, 서버가 **기동할 때마다**
그것을 `themes` 테이블에 `project_id IS NULL`로 upsert한다(`services/system-themes.ts`).
DB의 행과 코드가 갈리면 **코드가 이긴다** — 다음 기동이 되돌린다.

**코드에서 사라진 시스템 테마의 행은 지우지 않는다.** `layouts.theme_id`가 그 행을
참조하고 파생 테마의 `extends_ref`가 그 slug를 가리키므로, 코드 한 줄을 지운 결과가
사용자 데이터에 닿아서는 안 된다. 대가로 **해석할 수 없는 낡은 행이 목록에 남을 수
있다**(그 테마를 상속한 파생은 422가 된다).

### 프리셋 응답 형태 (§11.1 — P7-2)

프리셋은 **프로젝트가 소유한 페이지 통째 템플릿**이고 테마를 바꿔도 그대로다(§11.1).
테마 패턴(§6.6)과 다른 것이다 — 패턴은 테마가 소유한 **섹션 단위** 레시피다.

**목록은 내장과 프로젝트 것을 함께 낸다.** `GET .../themes`가 시스템 테마를 함께 내는
것과 같은 형태이고, 뜻도 같다 — *"이 프로젝트에서 **고를 수 있는** 것"*.

`source`가 판별자이고 **키 집합이 갈린다:**

| `source` | `id` | 키 |
|---|---|---|
| `"builtin"` | `builtin:<키>`(`builtin:search-list` 등) | `id` · `source` · `name` · `description` · `nodes` |
| `"project"` | uuid | 위의 다섯 + `createdBy` · `createdByName` · `createdAt` |

**내장 항목에 `createdBy`를 `null`로 싣지 않는다** — 없는 값을 `null`로 말하면 받는 쪽이
*"만든 사람이 지워졌다"*와 가르지 못한다.

**`nodes`는 `WbNode[]`이고 문서 봉투가 아니다.** 적용이 root의 `children`만 바꾸기
때문이다(P7-2 D3) — root의 `id`·`type`·`props`는 그 페이지의 것이지 프리셋의 것이 아니다.
**목록에도 `nodes`가 실린다**(스냅샷의 `payload`와 갈리는 자리다): 크기가 페이지 하나의
트리라 목록이 이미 나르는 것과 같고, 고른 직후 적용하는 화면이 그것을 반드시 쓴다.

**상세 엔드포인트가 없다.** 목록이 `nodes`를 함께 내므로 고른 뒤 다시 물을 것이 없다.

#### 저장은 `marker`를 버리고 id는 그대로 담는다

- **`marker`를 담지 않는다.** 담으면 적용된 문서에 번호가 있는데 그것을 가리키는 코멘트
  행이 없다 — 코멘트는 `(page_id, node_id)`로 매달려 있고 프리셋은 페이지를 건너 다닌다.
  버리는 자리가 **서버**인 것은 저장 경로가 웹 하나가 아니게 될 때(P9의 MCP·CLI) 규칙이
  그쪽에도 저절로 걸리게 하려는 것이다.
- **노드 `id`는 저장 시점 그대로 담는다.** 재발급은 **적용**이 한다(§11.1). 저장에서
  재발급하면 같은 프리셋을 두 번 적용했을 때 두 페이지가 같은 id를 갖는다.
- **카탈로그 검증을 하지 않는다.** *"이것을 페이지에 놓을 수 있는가"*는 **적용 시점에
  결과 문서 전체로** 판정한다(P7-2 D5). 여기서 보는 것은 봉투(`WbNodeSchema`)뿐이다.
- **빈 배열이 유효한 본문이다.** 빈 프리셋은 *"치우기"*라는 정상 조작이 된다.

#### 이름에 유일 제약이 없다 — 스냅샷 태그와 갈린다

태그는 *"그때"*를 지목하는 이름이라 유일해야 했고 지울 수도 없었다(§4.5). **프리셋은
지울 수 있고 고르는 것은 id다** — 같은 이름 둘은 사용자의 실수이지 시스템의 모순이 아니다.
그래서 409가 나올 자리 자체가 없다.

### 편집 파이프라인 (`PATCH .../ops`)

`pages.schema`를 바꾸는 **모든** 경로는 `revisions`에 한 행을 append하고
`pages.head_seq`를 그 `seq`로 올린다. 예외는 없다(`PUT .../schema`도 그렇다).

1. 클라이언트는 `GET .../pages/:pageId`로 문서와 `headSeq`를 받는다.
2. 편집을 로컬에 낙관적으로 적용하고, `PATCH .../ops`로 `{ baseSeq: headSeq, ops }`를 보낸다.
3. 서버는 페이지 행을 잠그고, `baseSeq`가 현재 `head_seq`와 같은지 확인하고,
   ops를 적용해 검증한 뒤, `(ops, inverse)`를 `head_seq + 1`로 기록한다.
4. 응답의 `seq`가 다음 요청의 `baseSeq`다. 응답의 `inverse`를 그대로 다시
   `ops`로 보내면 그 편집이 취소된다 — 이것이 undo다. 서버에 undo 개념은 없다.
5. 새로고침 후에는 `GET .../revisions?mine=true`로 자기 revision을 받아
   undo 스택을 복원한다.

**`PUT .../schema`가 만든 revision도 같은 방식으로 되돌린다 — 예외가 아니다.** 그
revision의 `ops`는 `[replace /root, replace /version]`이고 `inverse`에도 `/version`이
남지만, 그것을 그대로 `PATCH .../ops`로 되보내면 200이다. undo가 싣는 `/version`은
같은 값이므로 무연산으로 지나가기 때문이다.

**`version`을 실제로 건드리는 편집은 전부 422다** — 다른 값으로 `replace`하는 것뿐
아니라 `remove`하거나 `move`로 옮기는 것도 그렇다(`version`은 마이그레이션이 소유하는
필드이지 편집 대상이 아니다). 앞의 둘은 파이프라인 7단계가, 뒤의 둘은 봉투 검증이
막는다.

**요청은 직렬화한다.** in-flight 요청은 항상 하나여야 한다 — 앞 요청의 `seq`를
받아야 다음 `baseSeq`가 정해지기 때문이다. 어기면 두 번째 요청이 409를 받는다.
409를 받으면 페이지를 재조회해 `headSeq`와 문서를 다시 맞춘다.

`GET .../revisions`의 항목은 아래 여덟 키를 담는다. `ops`·`inverse`는 저장된 그대로
실려 나온다 — 5단계의 스택 복원이 `inverse`만으로 성립해야 하기 때문이다.

```jsonc
[
  { "id": "…", "seq": 3, "actorType": "user", "actorId": "…", "actorLabel": "홍길동",
    "ops": [ /* … */ ], "inverse": [ /* … */ ], "createdAt": "2026-08-04T09:00:00.000Z" }
]
```

`mine=true`는 `actorType`이 `user`이고 `actorId`가 호출자인 revision만 고른다(생략하면
그 페이지의 이력 전체). `limit`은 1~200이고 기본값은 50이다 — 벗어나면 400이다.
**선언하지 않은 쿼리 키는 그 자체로 400이다**(본문 스키마와 같은 `z.strictObject` 관례).
`?_=1` 같은 캐시 버스터도 거부되므로 이 두 키 외에는 아무것도 붙이지 않는다.

**`PUT .../schema`는 복구 경로가 아니다.** 이 서버가 아는 버전보다 높은 문서가 저장돼
있으면 `GET`·`PATCH .../ops`·`PUT .../schema` 세 경로가 전부 400이다(파이프라인이
**저장된** 문서를 마이그레이션에 태우기 때문에 PUT도 예외가 아니다). 파이프라인을
우회해 스키마를 덮어쓰는 쓰기 경로는 일부러 두지 않았다 — 그것을 되살리면 "모든
스키마 변경이 revision을 남긴다"가 다시 뚫린다.

**복구는 스냅샷 복원의 몫도 아니다 — P6-2가 그렇게 판정했다.** 복원도 같은 파이프라인을
타므로 미지원 버전 문서를 되살리지 못하고, 오히려 **쓰기 전에 400으로 끊으며 어느 페이지가
어떤 버전인지 말한다**(아래 "복원"). 근거와 실측은 그 절에 있다.

## DB 계층

- `src/db/types.ts` — Kysely `Database` 스키마 인터페이스. 새 테이블은 여기에 추가한다.
- `src/db/client.ts` — `createPool`·`createDb`. 풀의 생명주기는 호출자가 소유한다
  (`main.ts`가 운영에서, 테스트 하네스가 테스트에서 각각 정확히 한 번 닫는다).
- `src/db/tx.ts` — `withTransaction`. 중첩 트랜잭션 처리와 그 한계(JSDoc 참고).
- `src/db/migrations/` — 정적 마이그레이션 레지스트리. `index.ts`가 각 마이그레이션
  파일을 static import로 모은다(동적 `import()` 기반 `FileMigrationProvider`를
  쓰지 않는 이유는 `index.ts`의 주석 참고).
- `src/db/migrate.ts` — `migrate`/`migrate:down` CLI이자 `migrateToLatest` export.

## 계층 규칙

- `repos/`는 SQL만 안다 — HTTP·zod를 모른다. `services/`는 SQL을 직접 쓰지 않고
  HTTP도 모른다 — 순수 도메인 함수(`menu-tree.ts`)와 여러 repo를 조율하는 로직
  (`edit-pipeline.ts`)이 여기 산다. `routes/`는 HTTP·zod만 다루고 SQL을 직접
  쓰지 않는다. API가 주고받는 키는 camelCase, DB 컬럼은 snake_case이고, 그 변환은
  항상 `repos/`가 전담한다.
- 역할(`owner`/`editor`/`viewer`)을 비교하는 코드는 `auth/roles.ts`의
  `roleAtLeast` 하나뿐이다. 다른 곳에서 역할 순위를 다시 비교하지 않는다.
- 프로젝트 하위 라우트는 전부 `auth/roles.ts`의 `projectGuard(minRole)`
  preHandler로 권한을 판정한다(404/403 규칙 포함) — 라우트 파일 자체는 역할을
  비교하지 않는다.

## P1·P2a가 만들지 않은 것

이 서버는 P1(1단계)과 P2a(서버 편집 파이프라인) 범위만 구현한다. 아래는 의도적으로
빠져 있다 — 이후 단계의 몫이다.

- **실시간 동기화**: WebSocket, 브로드캐스트, 소프트 잠금(설계 §12, P3). 편집은 REST뿐이고,
  동시 편집 방어는 `baseSeq`와 행 잠금이 전부다. `baseSeq`가 어긋나면 서버가
  리베이스를 시도하지 않고 곧바로 409를 낸다.
- **레이아웃 편집**: 레이아웃 문서를 만들고 고치는 엔드포인트. 프로젝트마다 기본
  레이아웃(`Page` 하나 + `Slot` 하나) 하나가 자동으로 생길 뿐, 그것을 바꿀 방법이 없다.
  `pages.layout_id`(§4.2)도 아직 없다 — 페이지가 레이아웃을 고르는 것은 뒤 단계다.
- **테마를 고르는 UI**: 프로젝트의 레이아웃이 가리키는 테마를 바꾸는 엔드포인트가 없다.
  파생 테마는 API로 만들 수 있지만 **그것을 화면에 거는 것은 DB를 직접 고쳐야 한다**
  (시스템 테마가 하나뿐이라 고르개를 만들 이유가 아직 없다 — P4b가 다섯 종과 함께 연다).
- ~~**테마 스냅샷**(§4.5)~~ — **P6-1이 만들었다.** `POST .../snapshots`가 병합 결과를
  payload에 얼린다(위 "스냅샷 응답 형태").
- ~~**스냅샷 복원**(§4.5)~~ — **P6-2가 만들었다.** `payloadVersion` 게이트와 owner 가드도
  함께 섰고, **§13.1의 미지원 버전 탈출구는 "만들지 않는다"로 닫혔다**(아래 "복원").
  남은 것은 **레이아웃 생성·삭제**(개수가 다르면 409로 끊는다 — §4.4의 레이아웃 에디터가
  올 때 함께 연다)와 **테마 문서 되돌리기**(복원은 참조만 되돌리고 다름을 보고한다)다.
- **테마의 동시 편집 방어**: `pages`는 `head_seq`로 닫혀 있는데 `themes`에는 그런 것이
  없다. 마지막 쓰기가 이긴다.
- **API 토큰**: 세션 쿠키 외의 인증 수단(서비스 간 호출, CLI/MCP용 토큰 등)이 없다.
  `revisions.actor_type`은 `mcp`·`cli`를 이미 담을 수 있지만 그 행을 만드는 경로는 없다.

## 명령 요약

```bash
docker compose up -d                              # Postgres 기동 (저장소 루트)
pnpm install && pnpm build                         # 워크스페이스 설치 + schema 빌드
pnpm --filter @wirebound/api migrate               # 마이그레이션 최신화
pnpm --filter @wirebound/api migrate:down          # 마이그레이션 하나 내리기(반복 시 0까지)
pnpm --filter @wirebound/api dev                   # 개발 서버 (tsx watch)
pnpm --filter @wirebound/web dev                   # 에디터 개발 서버 (/api를 위 API 서버로 프록시 — 함께 띄운다)
pnpm vitest run --project api                       # api 테스트만 실행 (컨테이너 필요)
pnpm test                                          # 전체 워크스페이스 테스트
pnpm test:build                                    # dist 로드 가능성 검증 (패키지 재빌드 포함, 수십 초)
pnpm typecheck                                     # 전체 타입 체크
```
