# A3 — 테마 패키지 · 인스턴스 관리자 · 프로젝트 바인딩 (api) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 이 저장소에서는 `CLAUDE.md` 「메인 세션은 디스패치·판정·병합만 한다」를 따른다 — 태스크는 워크트리의 Orca 워커가 한다.

**Goal:** 인스턴스 관리자가 `.wbtheme` 를 올리고 숨기며, 로그인한 사용자가 패키지 파일을 받고, 프로젝트 owner 가 `테마@버전` 과 토큰 값을 고정 · 저장하며(방송 · 스냅샷 동결 포함), 시스템 테마가 기동 때 시딩된다 — REST 까지(화면은 A4).

**Architecture:** 새 표 `theme_packages`(zip 원본 bytea)와 `users.is_instance_admin`, `projects` 의 바인딩 네 칸. 검증은 A2 의 `readWbtheme` · `validateManifest` · `satisfiesSdk` · `tokensCss` 를 그대로 부른다. 시스템 테마는 `buildApp` 이 `system-themes/*/dist/*.wbtheme` 에서 «없는 `id@version` 만» 넣고, 비어 있는 프로젝트 바인딩을 `system-admin` 최신판으로 채운다. 바인딩 저장은 owner · `theme_rev` 낙관적 동시성 · 커밋 직전 재확인 · 커밋 뒤 `theme-changed` 방송. 스냅샷 payload 판 3 이 바인딩을 얼린다.

**Tech Stack:** Fastify · Kysely · PostgreSQL(bytea) · zod · fflate(A2 경유) · vitest.

**Spec:** `docs/superpowers/specs/2026-09-27-code-themes-design.md` — 「업로드 · 버전 · 인스턴스 관리자」 · 「프로젝트 쪽: 선택 · 토큰 · 스냅샷」 · 「CLI · MCP」. 앞 차수: `docs/superpowers/plans/2026-09-27-a2-report.md` · `-a2-review.md` · `-a2-review-2.md` · `-a2-fix-report.md`.

## Global Constraints

- **새 라우트는 인구조사에 오른다** — `apps/api/test/guard-in-lock.test.ts`(모든 non-GET: `PROBES` · `PROJECT_PROBES` · `NOT_LOCKED` 중 하나), `permission-matrix.test.ts`(`projectGuard` 라우트마다 `CASES` 한 줄), `restore-lock-census.test.ts`(가드 있는 non-GET 마다 `PROBES`), `token-route-census.test.ts`(`:projectId` 없는 라우트의 `requireAuth` 여부), `pre-guard-hook-census.test.ts`(가드 앞 preHandler 금지 — 관리자 판정은 **핸들러 안**에서), `actor-census.test.ts`(`TABLES` = `Database` 키). 태스크마다 어느 명단에 올렸는지 보고에 적는다.
- **`:projectId` 없는 라우트는 세션 전용이다**(토큰은 `:projectId` 라우트에서만 인증된다 — `auth/plugin.ts`). 관리자 라우트 · 패키지 읽기 라우트가 그렇다. CLI · MCP(토큰)가 읽어야 하는 것은 `:projectId` 라우트로 낸다.
- **쓰기는 커밋 직전에 권한과 자격을 다시 본다**(`CLAUDE.md` 의 재확인 절들 · `auth/roles.ts` 의 `recheckProjectRole`). 관리자 쓰기는 자격(세션 행) + `is_instance_admin` 을 같은 트랜잭션에서 다시 본다(D5).
- **방송은 커밋 뒤, 던지지 않는다**(`ws/notify.ts` 의 꼴). 새 서버 프레임은 api 와 웹 두 쪽 `ServerFrame` 에 같이 선다(`apps/web/test/realtime/protocol-parity.test.ts`) — 웹은 이 차수에 프레임을 **해석만** 하고 화면 동작은 A4.
- 새 프로덕션 런타임 의존을 더하지 않는다(`@fastify/multipart` 도 — D3).
- 사용자 DB(최상위 5433)는 이 차수에서 건드리지 않는다. 병합 뒤 코디네이터가 백업 · 확인 뒤 적용한다.
- 주석 · 인용: `docs/guideline/base/03-comments.md` · `04-citation.md`. 테스트 보고: 실행 · 건너뜀 · 실패 수.

## Review Focus

1. **관리자 권한을 잃는 순간과 겹친 업로드** — `admin revoke` 가 업로드 트랜잭션 도중 커밋되면 업로드는 403 으로 되돌아간다(행이 안 남는다). → Task 4 «강등과 겹친 업로드는 되돌아간다».
2. **고정한 버전을 숨긴 뒤의 저장** — owner 가 숨긴 버전에 고정된 채 **토큰만** 저장하면 받아진다. 숨긴 버전으로 **새로 바꾸는** 것은 거절된다. → Task 6 두 케이스.
3. **동시에 두 owner 가 저장** — 둘째는 409 와 지금 값(rev · 토큰)을 받는다. 같은 rev 로 두 번 보내면 둘째가 409. → Task 6.
4. **옛 스냅샷(판 2 — 테마 없음) 복원** — 바인딩을 건드리지 않는다. 판 3 복원은 바인딩을 되돌리고 숨긴 버전이어도 된다. → Task 7.
5. **시스템 테마 산출물이 없거나 바뀐 채 기동** — `dist` 가 없으면 기동이 까닭과 명령(`pnpm build`)을 말하고 멈춘다. 같은 `id@version` 인데 sha256 이 다르면 멈춘다. → Task 3.

---

## 확정한 결정

### D1. 표와 칸 — 마이그레이션 0019

```sql
ALTER TABLE users ADD COLUMN is_instance_admin boolean NOT NULL DEFAULT false;

CREATE TABLE theme_packages (
  theme_id    text        NOT NULL,
  version     text        NOT NULL,
  name        text        NOT NULL,
  description text,
  sdk_range   text        NOT NULL,
  manifest    json        NOT NULL,          -- json: 작성자가 적은 키 순서를 지킨다(0006 과 같은 판정)
  files       bytea       NOT NULL,          -- .wbtheme zip 원본
  size        integer     NOT NULL,
  sha256      text        NOT NULL,
  uploaded_by uuid        REFERENCES users(id) ON DELETE SET NULL,   -- NULL = 시스템 테마 · 지워진 사용자
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  hidden_at   timestamptz,
  PRIMARY KEY (theme_id, version)
);

ALTER TABLE projects
  ADD COLUMN theme_id      text,
  ADD COLUMN theme_version text,
  ADD COLUMN theme_tokens  json    NOT NULL DEFAULT '{}',
  ADD COLUMN theme_rev     integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT projects_theme_fk FOREIGN KEY (theme_id, theme_version)
      REFERENCES theme_packages (theme_id, version) ON DELETE RESTRICT,
  ADD CONSTRAINT projects_theme_pair CHECK ((theme_id IS NULL) = (theme_version IS NULL));
```

바인딩 칸이 **null 을 받는 까닭**: 마이그레이션은 `.wbtheme` 를 못 본다(시딩은 기동 때). null 은 «아직 고정 안 됨» 이고 기동 시딩 직후 채워진다(D2). spec 의 `NOT NULL` 과 다르다 — 보고에 적는다.

### D2. 시스템 테마 시딩은 `buildApp` 안에서

`seedSystemThemes(db, dir)`: `dir`(설정 `SYSTEM_THEMES_DIR`, 기본은 저장소의 `system-themes`) 아래 `*/dist/*.wbtheme` 를 읽어 → `readWbtheme` 이슈 0 · `id` 가 `system-` 로 시작 · `satisfiesSdk(manifest.sdk, SDK_VERSION)` → 같은 `id@version` 이 없으면 넣고(`uploaded_by NULL`), 있으면 sha256 을 견줘 **다르면 던진다**(기동 멈춤 — «이미 올린 버전의 내용이 바뀌었습니다: system-admin@0.1.0 — 판을 올리십시오»). 파일이 **하나도 없으면 던진다**(«시스템 테마 산출물이 없습니다 — `pnpm build` 를 먼저»). 그 뒤 `backfillProjectThemes(db)`: `theme_id IS NULL` 인 프로젝트를 `system-admin` 의 최신(숨기지 않은 semver 최대)으로 채운다. 둘 다 멱등이다. A1b 가 걷은 `syncSystemThemes` 자리(`ensureCatalog()` 바로 뒤)에 둔다 — 테스트 앱도 `buildApp` 으로 서므로 같은 길을 탄다.

테스트: `apps/api/test/global-setup.ts` 가 실행마다 `system-themes/admin` 을 kit 의 `buildTheme` 로 **다시 빌드**한다(낡은 산출물을 믿지 않는다 — `CLAUDE.md` 「생성물을 직접 편집하지 않는다」). 운영: `Dockerfile` 이 `pnpm build` 뒤 `system-themes/*/dist` 를 이미지에 넣는지 확인하고, 없으면 더한다.

### D3. 업로드 본문은 zip 바이트 그대로

`POST /api/admin/theme-packages` 는 `Content-Type: application/zip`(또는 `application/octet-stream`) 본문을 받는다. 그 라우트에만 `bodyLimit: WBTHEME_LIMITS.zipBytes` 와 `parseAs: 'buffer'` 파서를 건다(라우트 플러그인 안에서 `addContentTypeParser`). spec 은 multipart 였다 — 의존을 늘리지 않고 웹(A4)은 `fetch(url, { body: file })` 로 보낸다. 413 은 기존 오류 처리가 «요청 본문이 너무 큽니다» 로 말한다.

### D4. 라우트

| 경로 | 메서드 | 누가 | 요청 | 응답 |
|---|---|---|---|---|
| `/api/admin/theme-packages` | POST | 관리자(세션) | zip 본문 | 201 `{ themeId, version, name, sha256, size }` · 422 `{ issues }` · 409(같은 `id@version`) |
| `/api/admin/theme-packages/:themeId/:version` | PATCH | 관리자 | `{ hidden: boolean }` | 200 그 버전 |
| `/api/admin/theme-template.zip` | GET | 관리자 | — | 200 zip(없으면 404 «템플릿이 빌드되지 않았습니다 — `pnpm build:template`») |
| `/api/theme-packages` | GET | 로그인(세션) | — | 200 `[{ themeId, name, description, latest, versions: [{ version, preview, hidden, size, uploadedAt, uploadedBy: {id,name}|null }] }]` — 숨긴 버전은 **관리자에게만** 실린다(spec 「읽기 경로」) · 비관리자에게는 모든 버전이 숨은 테마가 통째로 없다 |
| `/api/theme-packages/:themeId/:version/manifest` | GET | 로그인 | — | 200 manifest(숨긴 버전도) |
| `/api/theme-packages/:themeId/:version/files/*` | GET | 로그인 | — | 200 파일(`theme.js` · `theme.css` · `assets/**`), `Cache-Control: private, max-age=31536000, immutable`, 내용에 맞는 `Content-Type` |
| `/api/projects/:projectId/theme` | GET | viewer | — | 200 `{ themeId, version, tokens, rev, manifest, latest }`(`latest`: 같은 테마의 숨기지 않은 최신 판 — «새 버전 있음» 표시용) |
| `/api/projects/:projectId/theme` | PUT | owner | `{ themeId, version, tokens, rev }` | 200 위와 같은 모양 · 409 `{ current }` · 422 `{ issues }` |
| `/api/projects/:projectId/theme/impact` | GET | viewer | `?themeId&version` | 200 `{ tokens: { kept, dropped, defaulted }, variants: [{ pageId, title, count }] }` |

`GET /api/auth/me`(또는 지금 로그인 사용자를 돌려주는 라우트 — 이름을 코드에서 확인)의 응답에 `isInstanceAdmin: boolean` 을 더한다(A4 의 관리자 링크). `GET /api/projects/:projectId` 의 응답에 `themeRev: number` 를 더한다 — 방송을 놓친 탭이 다시 읽을 때 따라잡는 값(spec 「실시간」).

템플릿 zip 은 A2 의 `wb-theme pack-template` 산출물(`packages/theme-kit/dist/wirebound-theme-starter.zip` — 스타터 + SDK · kit tarball 동봉)을 그대로 내준다. `Dockerfile` 은 `/app` 을 통째로 옮기므로 `pnpm build` 뒤 `build:template` 만 더하면 이미지에 실린다(`system-themes/*/dist` 도 같은 까닭으로 실린다 — Task 3 에서 값으로 확인).

### D5. 관리자 판정

- 입구: `preHandler: app.requireAuth` 하나(가드 앞 훅 금지 — `pre-guard-hook-census`), 핸들러 첫 줄 `await requireInstanceAdmin(app.db, request)` — DB 에서 그 사용자의 `is_instance_admin` 을 읽어 거짓이면 403(`forbidden('인스턴스 관리자만 할 수 있습니다')`). `routes/tokens.ts` 의 `requireSessionUser` 와 같은 꼴.
- 쓰기(업로드 · 숨김)는 트랜잭션 안에서 커밋 직전 `recheckInstanceAdmin(trx, request)`: 자격(세션 행 `FOR KEY SHARE` — `recheckAtCommit` 의 자격 부분을 함수로 떼어 함께 쓴다) + `SELECT is_instance_admin FROM users WHERE id = $1 FOR SHARE` 가 거짓이면 403 으로 되돌린다.
- `admin revoke` 명령은 `UPDATE users SET is_instance_admin = false` 한 줄(행 잠금을 잡는다) — 업로드의 `FOR SHARE` 와 줄을 선다.

### D6. 바인딩 저장의 규칙

- `PUT …/theme` 은 `{ themeId, version, tokens, rev }`. `rev` 가 저장값과 다르면 409 `{ current: <GET 과 같은 모양> }`.
- 대상 패키지가 없으면 404. **숨긴 버전은 지금 고정된 것과 같은 `id@version` 일 때만** 받는다(토큰만 고치는 저장) — 다른 판으로 바꾸는 대상이 숨긴 것이면 422(`hidden-version`).
- 토큰: `tokensCss(manifest, tokens)` 의 이슈가 있으면 422. 저장 전에 **기본값과 같은 값은 뺀다**(«기본값과 다른 것만» — spec). 값 하나 200 글자 · 전체 JSON 16 KB 상한(A2 이월 — «토큰 값의 길이 한도는 A4 api 가 정한다» 를 이 차수가 정한다) — 넘으면 422.
- 커밋 직전 `recheckProjectRole`(owner). `theme_rev = theme_rev + 1`. 커밋 뒤 `notifyThemeChanged(app, { projectId, themeId, version, tokens, rev, actor })` — 보낸 연결도 받는다(`notifyRestored` 와 같이 — 다른 탭이 같은 사람일 수 있다).
- 프로젝트를 새로 만들면 `system-admin` 최신판 · 빈 토큰 · rev 0 으로 선다(`insertProject` 안에서 찾음 — 시딩이 안 됐으면 null 로 두고 다음 기동의 채우기가 채운다).

### D7. 스냅샷 payload 판 3

`SNAPSHOT_PAYLOAD_VERSION = 3`, `SnapshotPayload.theme: { themeId: string; version: string; tokens: Record<string, string | number> } | null`. 캡처는 `projects` 의 바인딩을 읽고, 지문(`readCaptureFingerprint`)에 `projects.theme_rev` 를 더한다. 복원: 판 3 이면 새 계획 단계 `set-theme`(바인딩 · 토큰을 되돌리고 `theme_rev + 1` — 숨긴 버전이어도 된다, 패키지 행이 없으면 계획 실패 `missing-theme`), 판 2 이하면 바인딩을 건드리지 않는다. 판 3 복원은 값이 같아도 `theme_rev` 를 올리고 `notifyRestored` 에 더해 `notifyThemeChanged` 를 보낸다(spec 「스냅샷」 — 늘). `SnapshotPayloadSchema` 는 `z.strictObject` 그대로(`theme` 칸은 판 2 payload 에 없으므로 `.optional()`) — 판 3 을 옛 CLI 가 못 읽는 것은 받아들인다(저장소 안 소비자는 같이 바뀐다).

### D8. CLI · MCP lint — «현재 테마에 없는 variant»

`wireb lint` · MCP `validate` 는 스냅샷에 더해 `GET /api/projects/:projectId/theme` 으로 manifest 를 받는다(토큰으로 닿는 `:projectId` 라우트). `packages/themes` 의 `lintProject` 가 `themeManifest?` 를 받아, `components` 선언이 있는 컴포넌트의 노드 `variant` 가 선언 밖이면 규칙 `theme-variant`(경고) 이슈를 낸다. `variantFrom` 컴포넌트는 보지 않는다. 규칙 등록(`packages/schema/src/lint/rules.ts` — 그룹 · 소유 유니온을 넓힌다)과 정본 설계서 「lint 규칙」 줄을 함께 더한다(`packages/schema/test/lint-rules.test.ts` 가 둘을 견준다).

---

## 파일 구조

```
apps/api/src/db/migrations/0019-theme-packages.ts        (신규) D1
apps/api/src/db/migrations/index.ts · db/types.ts         등록 · ThemePackagesTable · users · projects 칸
apps/api/src/db/admin.ts                                  (신규) admin grant|revoke|list 명령
apps/api/src/db/seed-user.ts                              SEED_USER_ADMIN
apps/api/src/repos/theme-packages.ts                      (신규) insert · find · list · setHidden · latestVisible
apps/api/src/repos/users.ts                               setInstanceAdmin · isInstanceAdmin
apps/api/src/repos/projects.ts                            바인딩 읽기 · 쓰기 · insertProject 기본 바인딩
apps/api/src/services/system-themes.ts                    (신규) seedSystemThemes · backfillProjectThemes
apps/api/src/auth/admin.ts                                (신규) requireInstanceAdmin · recheckInstanceAdmin
apps/api/src/auth/roles.ts                                recheckCredential 을 떼어 냄(공유)
apps/api/src/routes/admin-themes.ts                       (신규) /api/admin/*
apps/api/src/routes/theme-packages.ts                     (신규) /api/theme-packages/*
apps/api/src/routes/project-theme.ts                      (신규) /api/projects/:projectId/theme(+ /impact)
apps/api/src/services/theme-impact.ts                     (신규)
apps/api/src/ws/protocol.ts · ws/notify.ts                theme-changed · notifyThemeChanged
apps/web/src/realtime/protocol.ts                         theme-changed 해석(동작 없음)
packages/themes/src/snapshot/payload.ts · lint-input.ts   판 3 · theme
apps/api/src/services/snapshot-capture.ts · restore*.ts · repos/snapshots.ts
packages/themes/src/lint/index.ts · packages/schema/src/lint/rules.ts · packages/cli/src/read/lint.ts · commands/lint.ts · mcp
apps/api/src/config.ts · .env.example                     SYSTEM_THEMES_DIR · THEME_TEMPLATE_ZIP
apps/api/test/global-setup.ts                              system-admin 빌드
Dockerfile · package.json(루트 build:template)
apps/api/README.md                                         엔드포인트 표 · 관리자 절
```

---

## Task 1: 마이그레이션 0019

**Files:** Create `apps/api/src/db/migrations/0019-theme-packages.ts` · Modify `migrations/index.ts`, `db/types.ts`, `test/actor-census.test.ts`(`TABLES` 에 `theme_packages`), `test/helpers.ts`(`resetRealData` — 새 FK 가 지우는 순서를 막지 않는지 보고 필요하면 고침) · Test `apps/api/test/migration-0019.test.ts`

- [ ] **Step 1: 실패하는 테스트** — `migration-0018.test.ts` 의 꼴(별도 DB · `Migrator.migrateTo`)을 따른다:
  - 0018 까지 올리고 프로젝트 하나를 넣은 뒤 0019 → 그 프로젝트의 바인딩이 `null` · `theme_tokens` `{}` · `theme_rev` 0, `users.is_instance_admin` false.
  - `projects_theme_pair`: `theme_id` 만 채운 UPDATE 는 거절(23514).
  - FK: 없는 `(theme_id, version)` 을 가리키는 UPDATE 는 거절(23503). 가리키는 패키지 행 DELETE 는 거절(RESTRICT).
  - `uploaded_by` 의 사용자를 지우면 NULL 이 된다.
  - 왕복: 0019 → 0018 → 0019.
- [ ] **Step 2: 실패를 본다.** — [ ] **Step 3: 구현**(D1 의 SQL 을 Kysely 스키마 빌더로 — bytea 는 `sql\`bytea\``, 타입은 `files: ColumnType<Buffer, Buffer | Uint8Array, never>`). `down` 은 역순으로 걷는다.
- [ ] **Step 4: 통과**(`pnpm vitest run apps/api/test/migration-0019.test.ts` · actor-census) · typecheck.
- [ ] **Step 5: 커밋** — `feat(api): migration 0019 — theme_packages, users.is_instance_admin, project theme binding columns`

## Task 2: 인스턴스 관리자 — 칸 · 명령 · 시딩 · 응답

**Files:** Modify `repos/users.ts`(`setInstanceAdmin(db, email, value): Promise<'changed'|'unchanged'|'missing'>` · `isInstanceAdmin(db, userId, lock?: 'share')`), `db/seed-user.ts`(`SEED_USER_ADMIN` — `'1'` 이면 **새로 만든** 계정에 켠다. 이미 있는 계정이면 바꾸지 않고 «관리자로 만들려면 `pnpm --filter @wirebound/api admin grant <email>`» 를 말한다), `apps/api/.env.example`(주석 줄 `#SEED_USER_ADMIN=`), `apps/api/package.json`(`"admin": "tsx --env-file-if-exists=.env src/db/admin.ts"`), 지금 사용자 응답 라우트(D4 끝) · Create `src/db/admin.ts` · Test `test/admin-command.test.ts`, `test/seed-user.test.ts`(더함), `test/env-example-census.test.ts`(자동)

- [ ] **Step 1: 실패하는 테스트** — `runAdmin(rawArgs, target, io): Promise<number>`(꼴은 `db/reset-password.ts` 의 `runResetPassword`):
  - `grant a@x` → 0 · 대상 DB 를 먼저 찍음 · 켜짐. 다시 `grant` → 1 «이미 관리자입니다 — 아무것도 바꾸지 않았습니다.»
  - `revoke a@x` → 0, 다시 → 1. 없는 이메일 → 1 «그 이메일의 계정이 없습니다».
  - `list` → 관리자 이메일을 줄마다 · 0.
  - 모르는 동사 · 인자 수 틀림 → 2 와 사용법.
  - 이메일은 `findUserByEmail` 과 같은 정규화로 찾는다(대소문자).
  - 시딩: `SEED_USER_ADMIN=1` 로 새 계정 → 켜짐. 이미 있는 계정 → 안 바뀜 + 안내 문장.
  - `GET` 지금 사용자 → `isInstanceAdmin` 이 켠 뒤 true.
- [ ] **Step 2 ~ 4: 실패 → 구현 → 통과** · typecheck.
- [ ] **Step 5: 커밋** — `feat(api): instance admin flag — admin grant|revoke|list command, SEED_USER_ADMIN, isInstanceAdmin on the session user`

## Task 3: 패키지 저장소와 시스템 테마 시딩

**Files:** Create `repos/theme-packages.ts`, `services/system-themes.ts` · Modify `app.ts`(`ensureCatalog()` 뒤 `await seedSystemThemes(db, config.systemThemesDir)`), `config.ts`(`SYSTEM_THEMES_DIR` — 기본 `fileURLToPath(new URL('../../../system-themes', import.meta.url))`, `EnvSchema` · `.env.example`), `repos/projects.ts`(`insertProject` 기본 바인딩 — D6 끝), `test/global-setup.ts`(시작에 `buildTheme({ root: <system-themes/admin>, entry: 'src/theme.tsx' })`), `Dockerfile` · Test `test/system-themes.test.ts`

**Interfaces:**
```ts
export interface ThemePackageRow { themeId: string; version: string; name: string; description: string | null; sdkRange: string; manifest: ThemeManifest; size: number; sha256: string; uploadedBy: string | null; uploadedAt: Date; hiddenAt: Date | null }
export async function insertThemePackage(db: DbHandle, input: { manifest: ThemeManifest; bytes: Uint8Array; sha256: string; uploadedBy: string | null }): Promise<ThemePackageRow>   // 같은 PK 면 DuplicatePackageError
export async function findThemePackage(db: DbHandle, themeId: string, version: string): Promise<ThemePackageRow | null>
export async function readThemePackageFiles(db: DbHandle, themeId: string, version: string): Promise<Uint8Array | null>
export async function listThemePackages(db: DbHandle, opts: { includeHidden: boolean }): Promise<ThemePackageRow[]>
export async function latestVisibleVersion(db: DbHandle, themeId: string): Promise<string | null>   // semver 최대(compareVersions)
export async function setThemePackageHidden(db: DbHandle, themeId: string, version: string, hidden: boolean): Promise<ThemePackageRow | null>
export async function seedSystemThemes(db: DbHandle, dir: string): Promise<{ inserted: string[]; kept: string[] }>
export async function backfillProjectThemes(db: DbHandle): Promise<number>
```

- [ ] **Step 1: 실패하는 테스트**
  - 빈 표에서 시딩 → `system-admin@0.1.0` 한 줄 · `uploaded_by` null · `manifest.id` 일치 · `files` 의 sha256 이 산출물 파일과 같다.
  - 두 번 시딩 → `inserted` 0 · `kept` 1(멱등).
  - 같은 `id@version` 인데 바이트가 다른 파일(임시 디렉터리에 `system-x/dist/system-x-1.0.0.wbtheme` 두 판) → 두 번째 시딩이 던지고 문장에 `id@version` 이 있다.
  - `id` 가 `system-` 로 안 시작 → 던짐. `sdk` 범위 밖 → 던짐. 산출물이 하나도 없는 디렉터리 → 던짐(문장에 `pnpm build`).
  - `backfillProjectThemes`: `theme_id` null 인 프로젝트 둘 → 둘 다 `system-admin@<최신>`, 반환 2. 숨긴 판은 «최신» 에서 빠진다.
  - 새 프로젝트(`createProject` 도우미) → 바인딩이 `system-admin@0.1.0`.
  - `buildApp` 을 산출물 없는 `SYSTEM_THEMES_DIR` 로 세우면 던진다.
- [ ] **Step 2 ~ 4.** `pnpm vitest run apps/api` 전량(시딩이 모든 테스트 앱에 선다 — 다른 스위트가 깨지지 않는지). typecheck.
- [ ] **Step 5: 구분력** — sha256 견주기를 뗀 판 · 멱등 판정을 뗀 판 각각 무엇이 죽는지.
- [ ] **Step 6: 커밋** — `feat(api): theme package store and boot-time system theme seeding with project binding backfill`

## Task 4: 관리자 라우트 — 업로드 · 목록 · 숨김 · 템플릿

**Files:** Create `auth/admin.ts`, `routes/admin-themes.ts` · Modify `auth/roles.ts`(자격 재확인을 `recheckCredential(trx, request)` 로 떼어 `recheckAtCommit` 이 부른다 — 동작 불변), `app.ts`(`/api/admin` 접두), `config.ts`(`THEME_TEMPLATE_ZIP` — 기본 `packages/theme-kit/dist/wirebound-theme-starter.zip`), 루트 `package.json`(`"build:template": "pnpm --filter @wirebound/theme-kit build && node packages/theme-kit/bin/wb-theme.js pack-template"`), `Dockerfile`(`build:template` 을 돌려 zip 을 싣는다) · Test `test/admin-themes.test.ts` · 인구조사(`guard-in-lock` 의 `NOT_LOCKED` 또는 새 `ADMIN_PROBES` — 관리자 쓰기는 프로젝트 잠금이 없다: 이유 문장과 함께 `NOT_LOCKED`, `token-route-census`(requireAuth 있음), `pre-guard-hook-census`(preHandler 는 `requireAuth` 하나 — 추가 없음))

- [ ] **Step 1: 실패하는 테스트**
  - 비로그인 401 · 비관리자 403 · 토큰(Authorization) 401.
  - 관리자가 system-admin 산출물이 아닌 **A2 픽스처로 빌드한** `.wbtheme`(kit `buildTheme` 로 테스트 안에서) 업로드 → 201 · 행 · `uploaded_by` = 그 사람.
  - 같은 것 다시 → 409. `id` 가 `system-` 로 시작 → 422(`reserved-id`). 검증 이슈(판 `1.0`) → 422 `issues[].code` 에 `manifest`. 10 MB + 1 바이트 → 413. `Content-Type: application/json` → 415.
  - `sdk` 범위 밖 manifest → 422(`sdk-incompatible`).
  - 목록 `GET /api/theme-packages`(관리자) → 숨긴 버전 포함(`hidden: true`) · `uploadedBy` 이름. 같은 목록을 비관리자가 읽으면 숨긴 버전이 없다(Task 5 가 모양을, 여기서는 관리자 판을 잰다).
  - 숨김 PATCH → `hidden: true` · 되살림.
  - **강등과 겹친 업로드는 되돌아간다**(Review Focus 1): 업로드 트랜잭션의 재확인 질의를 `holdQuery`(`apps/api/test/pg-fault-proxy.ts`)로 붙잡은 채 `admin revoke`(다른 연결)를 커밋하고 놓는다 → 403 · 행 0. 판 카나리아: 붙잡힌 것을 값으로 확인한다.
  - 템플릿: 파일이 있으면 200 `application/zip` · 없으면 404 문장.
- [ ] **Step 2 ~ 4.** 구현: 라우트 플러그인 안에서 `app.addContentTypeParser(['application/zip','application/octet-stream'], { parseAs: 'buffer', bodyLimit: WBTHEME_LIMITS.zipBytes }, (_req, body, done) => done(null, body))`. 업로드 핸들러: `requireInstanceAdmin` → `readWbtheme(body)` → 이슈면 422 → `reserved-id` · `sdk-incompatible` → `withTransaction`: `insertThemePackage`(중복이면 409) → `recheckInstanceAdmin` → 201.
- [ ] **Step 5: 구분력** — `recheckInstanceAdmin` 을 뗀 판에서 «강등과 겹친 업로드» 가 무슨 값으로 죽는지(행이 남음 · 201).
- [ ] **Step 6: 커밋** — `feat(api): admin theme routes — upload .wbtheme, hide, starter template download`

## Task 5: 패키지 읽기 라우트

**Files:** Create `routes/theme-packages.ts` · Modify `app.ts` · Test `test/theme-packages-read.test.ts` · 인구조사(`token-route-census`)

- [ ] **Step 1: 실패하는 테스트**
  - 목록(비관리자 로그인) → 숨긴 버전은 없고, 모든 버전이 숨은 테마는 통째로 없다 · `latest` 는 숨기지 않은 semver 최대(`1.10.0` > `1.9.0`). 관리자 → 숨긴 버전이 `hidden: true` 로 실리고 `latest` 는 같다. 관리자 판정은 요청마다 DB 에서(`isInstanceAdmin`) — 강등 직후 다음 요청부터 숨긴 것이 빠진다.
  - manifest → 숨긴 버전도 200. 없는 판 404.
  - 파일: `theme.js` → `text/javascript; charset=utf-8` · `theme.css` → `text/css; charset=utf-8` · `assets/x.svg` → `image/svg+xml` · `Cache-Control: private, max-age=31536000, immutable`. `manifest.json` 도 내준다(`application/json`). 없는 경로 404. `files/../x` · `files/%2e%2e/x` · 빈 경로 → 404(zip 안 이름과 정확히 같을 때만 낸다). 숨긴 버전도 200.
  - 비로그인 401 · 토큰 401.
- [ ] **Step 2 ~ 4.** 구현: 행의 `files` 를 `unzipSync` 로 풀지 않고 **요청한 한 항목만** 푼다(`unzipSync(bytes, { filter: (f) => f.name === path })`). 저장 때 이미 `readWbtheme` 을 지난 바이트다.
- [ ] **Step 5: 커밋** — `feat(api): theme package read routes — list, manifest, immutable files`

## Task 6: 프로젝트 바인딩 · impact · `theme-changed`

**Files:** Create `routes/project-theme.ts`, `services/theme-impact.ts` · Modify `repos/projects.ts`(바인딩 읽기 · `updateProjectTheme(trx, projectId, input, expectedRev)` — `WHERE theme_rev = $rev` 로 갱신하고 0 행이면 충돌), `ws/protocol.ts`(`{ type: 'theme-changed'; themeId: string; version: string; tokens: Record<string, string | number>; rev: number; actor: EventActor }`), `ws/notify.ts`(`notifyThemeChanged`), `apps/web/src/realtime/protocol.ts`(같은 모양 · `parseServerFrame` 의 case — 동작 없음), `app.ts` · Test `test/project-theme.test.ts` · 인구조사(`permission-matrix` `CASES` 세 줄 · `restore-lock-census` `PROBES` 한 줄 · `guard-in-lock` `PROJECT_PROBES` 한 줄 — `PATCH /:projectId` 의 판과 같은 꼴: `bobRole: 'owner', demotion: 'role', holders: ['restore','tree'], okStatus: 200`)

- [ ] **Step 1: 실패하는 테스트**
  - GET(viewer) → `{ themeId: 'system-admin', version: '0.1.0', tokens: {}, rev: 0, manifest, latest: '0.1.0' }`.
  - PUT(owner) 토큰 하나 → 200 · rev 1 · 저장된 토큰에 그 키. 기본값과 같은 값을 보내면 저장에서 빠진다.
  - PUT 옛 rev → 409 · `current.rev` 1. editor · viewer → 403.
  - 판 바꾸기: 업로드한 `sample@1.0.0` 으로 → 200 · 이전 테마에만 있던 토큰은 빠진다(클라이언트가 보낸 대로 저장 — 서버는 새 manifest 로 검증만).
  - **숨긴 버전**(Review Focus 2): 고정된 판을 숨긴 뒤 토큰만 PUT → 200. 다른 테마의 숨긴 판으로 바꾸기 → 422 `hidden-version`.
  - 토큰 검증 이슈(`color` 에 `red;}`) → 422. 값 201 글자 → 422. 없는 패키지 → 404.
  - 방송: PUT 뒤 룸의 viewer 연결이 `theme-changed`(rev 1)를 받는다 · 보낸 사람의 다른 연결도 받는다.
  - 강등과 겹친 PUT → 403(guard-in-lock 판이 잰다).
  - `GET /api/projects/:projectId` → `themeRev` 가 PUT 뒤 1.
  - impact: 현재 `{Button: variant 'primary'}` 가 든 페이지 둘 · `sample` 이 `Button` 을 선언하지 않으면 → `variants` 0(선언이 없으면 모든 값 통과). 선언하고 `primary` 가 없으면 → 페이지마다 count. 토큰: 이어지는 · 버려지는 · 기본값으로 서는 키 수.
- [ ] **Step 2 ~ 4.** `pnpm vitest run apps/api` · 웹 `protocol-parity` · typecheck.
- [ ] **Step 5: 구분력** — `WHERE theme_rev` 조건을 뗀 판(동시 저장이 조용히 덮임)에서 409 케이스가 죽는지 · `recheckProjectRole` 을 뗀 판에서 guard-in-lock 줄이 죽는지.
- [ ] **Step 6: 커밋** — `feat(api): project theme binding — owner PUT with rev, token limits, impact, theme-changed broadcast`

## Task 7: 스냅샷 판 3

**Files:** Modify `packages/themes/src/snapshot/payload.ts`(D7), `lint-input.ts`(필요하면), `apps/api/src/services/snapshot-capture.ts`, `repos/snapshots.ts`(`readCaptureFingerprint` 에 `projects.theme_rev`), `services/restore-plan.ts`(`set-theme` · 실패 `missing-theme`), `services/restore.ts`, `routes/snapshots.ts`(복원 뒤 `notifyThemeChanged`), `apps/api/test/repos-snapshots.test.ts`(자원 · 지문 키 고정 줄 갱신) · Test `test/snapshot-theme.test.ts`

- [ ] **Step 1: 실패하는 테스트**
  - 캡처 → `payloadVersion` 3 · `theme` = 지금 바인딩.
  - 캡처 도중 바인딩을 PUT → 지문 불일치(409 — 기존 `hooks.afterPages` 로 끼운다).
  - 판 3 스냅샷 → 바인딩을 바꾼 뒤 복원 → 바인딩 · 토큰이 되돌아오고 rev 가 오른다 · `theme-changed` 방송. 바인딩을 안 바꾼 채 복원해도 rev 가 오르고 방송이 간다.
  - 스냅샷이 가리킨 판을 숨긴 뒤 복원 → 200(숨김은 복원을 막지 않는다).
  - **판 2 payload**(`theme` 없음 — 저장된 행을 SQL 로 판 2 로 고쳐 만든다) 복원 → 바인딩 그대로.
  - CLI `fetchSnapshot` 이 판 3 을 파싱한다(`packages/cli` 케이스).
- [ ] **Step 2 ~ 4.** `pnpm vitest run apps/api packages/themes packages/cli packages/mcp`.
- [ ] **Step 5: 커밋** — `feat(api): snapshot payload v3 freezes the project theme binding; restore sets it back`

## Task 8: lint «현재 테마에 없는 variant»

**Files:** Modify `packages/schema/src/lint/rules.ts`(`theme-variant` · 그룹 · 소유 유니온), `packages/themes/src/lint/index.ts`(`ProjectLintInput.themeManifest?`), `packages/cli/src/project.ts`(`fetchProjectTheme`), `packages/cli/src/read/lint.ts` · `commands/lint.ts`, `packages/mcp/src/handlers.ts` · `session.ts`, `docs/superpowers/specs/2026-08-03-wirebound-design.md` 「lint 규칙」(한 줄) · Test `packages/themes/test/lint-theme-variant.test.ts`, cli · mcp 케이스

- [ ] **Step 1: 실패하는 테스트** — manifest 가 `List` 에 `table` · `cards` 를 선언하고 노드 `variant: 'grid'` → 경고 한 건(nodeId · 페이지). 선언이 없는 컴포넌트의 variant → 없음. `variantFrom` 컴포넌트 → 없음. `themeManifest` 없음 → 이 규칙은 돌지 않고, CLI 는 그 사실을 노트로 말한다(`theme-unavailable`). CLI 가 `/theme` 조회에 실패해도 나머지 lint 는 돈다.
- [ ] **Step 2 ~ 4.** — [ ] **Step 5: 커밋** — `feat(lint): theme-variant rule — node variants the bound theme does not declare`

## Task 9: 문서 · 게이트 · 보고

- [ ] `apps/api/README.md`: 엔드포인트 표(D4 의 줄들), 오류 표(415 · 422 코드), «인스턴스 관리자» 절(`admin` 명령 · `SEED_USER_ADMIN`), «시스템 테마» 절(산출물 · 기동 시딩 · sha256 불일치로 멈춤 · `pnpm build` · `build:template`).
- [ ] 코드 테마 spec(`2026-09-27-code-themes-design.md`)에 「spec 과 달라지는 것」 세 줄을 지금 참인 문장으로 반영한다(연대기 없이).
- [ ] 정본 설계서(`2026-08-03-wirebound-design.md`) 테마 절 · 테이블 정의 · 권한 모델 · 스냅샷 절을 **지금 참인 것**으로(업로드 · 관리자 · 바인딩 · 판 3 — 화면은 아직 없다).
- [ ] 게이트: `pnpm typecheck` · `pnpm build` · `pnpm test`(DB 5443) · `pnpm test:build` · `pnpm test:browser`(웹 프로토콜을 건드렸다). 실행 · 건너뜀 · 실패.
- [ ] 사용자 DB 적용 연습: 워크트리에 main 사본의 DB(프로젝트 몇 · 스냅샷 판 2 하나)를 세워 이 브랜치로 `migrate` → 기동(시딩 · 채우기) → 프로젝트 바인딩 · 옛 스냅샷 복원을 값으로 확인한다.
- [ ] 보고 `docs/superpowers/plans/2026-09-28-a3-report.md` — 태스크마다 커밋 · 실행 수 · 구분력 · 인구조사에 올린 줄 · 계획과 달라진 것(특히 지금 사용자 라우트 이름 · `recheckCredential` 떼기 · Dockerfile).

---

## spec 과 달라지는 것 (병합 때 spec 을 지금 참인 것으로 고친다 — Task 9)

- 바인딩 칸 null 허용(D1) — 기동 시딩이 채운다.
- 업로드 본문이 multipart 가 아니라 zip 바이트(D3).
- 토큰 값 한도(값 200 글자 · 전체 16 KB — D6)와 `reserved-id` · `sdk-incompatible` · `hidden-version` 오류 코드.

## 이 계획이 정하지 않고 넘기는 것

- 관리자 화면 · 설정 페이지의 테마 절 · 토큰 편집기 · 캔버스가 프로젝트 `id@버전` 을 싣는 것 — A4(이 차수의 라우트 · `theme-changed` 를 쓴다).
- 내보내기에 프로젝트 테마를 싣는 것 — A5.
- A2 이월: 설치판 · npm 워크스페이스 dev 케이스, 셸 Host 판정의 `*.localhost`, 전각 점 자산 이름(이 차수의 파일 라우트가 **정확히 같은 이름**만 내므로 경로가 바뀌지 않는다 — 보고에 그 값을 적는다), `oklch` · `calc` · `deg`.
