# @wirebound/api

Fastify 5 기반 REST 서버. 설계서 편집을 지원하는 백엔드다(P1 범위 — WebSocket은 P3).

필요한 것: Docker, Node ≥ 22, pnpm.

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
4. `.env.example`을 `.env`로 복사하고 필요하면 값을 조정한다.
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

각 테스트는 `test/helpers.ts`의 `withApi()`로 감싼다. `withApi`는 테스트 하나를
트랜잭션으로 감싸고 끝나면 롤백하므로, 테스트가 커밋하는 데이터는 없다 — 다음
테스트는 항상 깨끗한 스키마에서 시작한다.

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
| `conflict` | 409 | 유니크 제약 위반, 마지막 owner 제거 시도, 자식이 있는 메뉴 삭제 시도 등 |
| `validation-failed` | 422 | 봉투는 유효하지만 카탈로그 규칙(컴포넌트 타입·props·variant 등)을 위반함. `issues`에 `ValidationIssue[]` |
| `internal` | 500 | 예상하지 못한 서버 오류 |

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
| `/api/projects` | POST | 로그인만 | `{ name, slug, description? }` | 201 프로젝트(호출자가 owner) |
| `/api/projects` | GET | 로그인만 | — | 200 호출자가 속한 프로젝트 목록 |
| `/api/projects/:projectId` | GET | viewer | — | 200 `{ ...프로젝트, role }` |
| `/api/projects/:projectId` | PATCH | owner | `{ name?, slug?, description? }`(하나 이상) | 200 `{ ...프로젝트, role }` |
| `/api/projects/:projectId` | DELETE | owner | — | 204 |
| `/api/projects/:projectId/members` | GET | viewer | — | 200 멤버 목록 |
| `/api/projects/:projectId/members` | POST | owner | `{ email, role }`(이미 가입한 사용자만 초대 가능) | 201 멤버 |
| `/api/projects/:projectId/members/:userId` | PATCH | owner | `{ role }` | 200 멤버(마지막 owner의 강등은 409) |
| `/api/projects/:projectId/members/:userId` | DELETE | owner | — | 204(마지막 owner 제거는 409) |
| `/api/projects/:projectId/menu` | GET | viewer | — | 200 메뉴 트리(중첩 배열, `pages` 없음) |
| `/api/projects/:projectId/menu` | POST | editor | `{ parentId?, title }` | 201 메뉴 노드 |
| `/api/projects/:projectId/menu/:nodeId` | PATCH | editor | `{ title?, parentId?, sortOrder? }`(하나 이상) | 200 메뉴 노드 |
| `/api/projects/:projectId/menu/:nodeId` | DELETE | editor | — | 204(자식 메뉴·페이지가 있으면 409) |
| `/api/projects/:projectId/pages` | POST | editor | `{ menuNodeId, title, description? }` | 201 페이지(기본 스키마: 빈 `Page`) |
| `/api/projects/:projectId/pages/:pageId` | GET | viewer | — | 200 페이지(스키마 포함, 최신 버전으로 마이그레이션되어 옴) |
| `/api/projects/:projectId/pages/:pageId` | PATCH | editor | `{ title?, description?, menuNodeId?, sortOrder? }`(하나 이상, `schema`는 여기서 못 바꾼다) | 200 페이지 |
| `/api/projects/:projectId/pages/:pageId/schema` | PUT | editor | `{ schema }`(문서 봉투 전체) | 200 페이지(봉투 위반 400, 카탈로그 위반 422, 실패 시 기존 스키마 보존) |
| `/api/projects/:projectId/pages/:pageId` | DELETE | editor | — | 204 |
| `/api/projects/:projectId/tree` | GET | viewer | — | 200 `{ menu }` — 메뉴 트리 + 각 노드의 `pages`(스키마는 싣지 않는다) |
| `/health` | GET | (없음, 공개) | — | 200 `{ status: 'ok' }` |

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

- `repos/`는 SQL만 안다 — HTTP·zod를 모른다. `routes/`는 HTTP·zod만 다루고 SQL을
  직접 쓰지 않는다. API가 주고받는 키는 camelCase, DB 컬럼은 snake_case이고, 그
  변환은 항상 `repos/`가 전담한다.
- 역할(`owner`/`editor`/`viewer`)을 비교하는 코드는 `auth/roles.ts`의
  `roleAtLeast` 하나뿐이다. 다른 곳에서 역할 순위를 다시 비교하지 않는다.
- 프로젝트 하위 라우트는 전부 `auth/roles.ts`의 `projectGuard(minRole)`
  preHandler로 권한을 판정한다(404/403 규칙 포함) — 라우트 파일 자체는 역할을
  비교하지 않는다.

## P1이 만들지 않은 것

이 서버는 P1(1단계) 범위만 구현한다. 아래는 의도적으로 빠져 있다 — 이후 단계의 몫이다.

- **리비전(revision)**: 페이지 스키마의 변경 이력·되돌리기. 지금은 `PUT .../schema`가
  현재 스키마를 덮어쓸 뿐, 과거 버전을 보관하지 않는다.
- **레이아웃**: 여러 페이지가 공유하는 헤더·사이드바 같은 레이아웃 문서·`Slot` 합성.
  `@wirebound/schema`에 `validateLayout`은 있지만 이 API는 레이아웃 리소스·엔드포인트를
  갖지 않는다.
- **테마**: 테마 선택·적용·CSS 컴파일. `@wirebound/themes`와 연결되지 않는다.
- **WebSocket**: 실시간 공동 편집, 방 입장, 패치 브로드캐스트(설계 §12, P3 범위).
  지금은 REST뿐이다.
- **API 토큰**: 세션 쿠키 외의 인증 수단(서비스 간 호출, CLI/MCP용 토큰 등)이 없다.

## 명령 요약

```bash
docker compose up -d                              # Postgres 기동 (저장소 루트)
pnpm install && pnpm build                         # 워크스페이스 설치 + schema 빌드
pnpm --filter @wirebound/api migrate               # 마이그레이션 최신화
pnpm --filter @wirebound/api migrate:down          # 마이그레이션 하나 내리기(반복 시 0까지)
pnpm --filter @wirebound/api dev                   # 개발 서버 (tsx watch)
pnpm vitest run --project api                       # api 테스트만 실행 (컨테이너 필요)
pnpm test                                          # 전체 워크스페이스 테스트
pnpm typecheck                                     # 전체 타입 체크
```
