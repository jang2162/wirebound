# 사내 공용 운영 — 구현 계획

> **에이전트 작업자에게:** 이 저장소는 트랙마다 워크트리 하나 · Orca 워커 하나다(`AGENTS.md` 「워크트리 작업」). 워커는 자기 트랙 절과
> «공통 제약» · «리뷰 초점» · «API 계약»만 읽으면 된다. 단계는 체크박스(`- [ ]`)로 적는다.

**목표:** 에디터 밖 화면을 왼쪽 사이드바 뼈대로 묶어 폭 전체를 쓰게 하고, 초대 링크 가입 · 비활성화 · 재설정 링크 · 관리자 지정 ·
owner 넘기기 · 관리자 기록을 서버와 화면에 세운다.

**구조:** 세 트랙. S(뼈대 — 웹 + 목록 응답)와 A(계정 — 서버 + 뼈대 밖 화면)를 나란히 돌리고, 둘을 병합한 뒤 M(관리자 화면)을 돌린다.
트랙 사이의 이음은 아래 «API 계약»과 «웹 계약»이다.

**스택:** TypeScript · React 19 · react-router · Fastify · Kysely · PostgreSQL · vitest(jsdom · 실브라우저 `editor-stack`).

**설계:** `docs/superpowers/specs/2026-10-31-workspace-admin-design.md` — 계획은 설계를 근거로 한다. 둘을 함께 읽는다.

## 공통 제약

- 마이그레이션은 **A 트랙의 `0034-accounts` 하나**다. S · M 은 마이그레이션을 두지 않는다.
- 토큰(초대 · 재설정) 원문은 저장하지 않는다 — `auth/token-hash.ts` 의 `randomTokenValue` · `hashTokenValue` 를 쓴다.
- 비밀번호 자는 `auth/credentials.ts` 의 `RawPassword`(8 자 이상) 하나다. 화면도 그 길이를 말한다.
- 모든 관리자 쓰기: 핸들러 첫 줄 `requireInstanceAdmin`, 쓰기 트랜잭션 안 쓰는 문장 뒤 `recheckInstanceAdmin`(`auth/admin.ts`), 세션 전용
  (토큰 요청은 401 — `auth/session-only.ts` 의 `requireSessionUser` 꼴).
- 관리자 기록은 그 행동과 **같은 트랜잭션**에서 쓴다.
- 쓸 수 없는 초대 링크(없음 · 만료 · 거둠 · 다 씀)는 넷 다 **같은 상태 · 같은 문장**: 404 `not-found` «이 초대 링크는 더 쓸 수 없습니다 —
  관리자에게 새 링크를 받으세요». 재설정 링크도 같은 꼴: 404 «이 재설정 링크는 더 쓸 수 없습니다 — 관리자에게 새 링크를 받으세요».
- 비활성 사용자의 로그인은 틀린 비밀번호와 **같은** 401 · 같은 문장(`LOGIN_FAILURE_MESSAGE`).
- 초대 만료 기본 7 일 · 고를 수 있는 범위 1 – 90 일. 재설정 링크 24 시간.
- 정본 설계(`docs/superpowers/specs/2026-08-03-wirebound-design.md`)와 `apps/api/README.md` 의 엔드포인트 계약은 그 트랙이 바꾼 만큼 고친다
  (정본은 «언제 뒤집혔다» 없이 지금 참인 것만 — `AGENTS.md`).
- 화면 문안의 따옴표 · 말투는 기존 화면(`routes/settings.tsx` · `settings/members-section.tsx`)을 따른다.

## 리뷰 초점

설계가 함의하지만 아래 태스크의 케이스가 이름으로 덮지 않으면 사람이 먼저 밟을 것들이다. 각 줄은 그 케이스를 가진 태스크를 가리킨다.

1. **한 번짜리 초대 링크를 두 사람이 동시에 연다** — 하나만 가입되고 다른 쪽은 «더 쓸 수 없습니다». (A3 «동시 가입»)
2. **비활성화 직전에 열려 있던 WS 연결 · 편집 중인 에디터** — 비활성화 커밋 뒤 그 연결이 닫히고 다음 편집이 401. (A4 «열린 연결이 닫힌다»)
3. **퇴사한 관리자가 손에 쥔 «여러 명» 링크** — 비활성화 뒤 그 링크로 가입 불가, 화면은 거둔 수를 말한다. (A4 «그 사람의 링크를 거둔다»)
4. **마지막 남은 관리자가 자기를 해제 · 비활성화** — 막힌다(409). 동시에 서로를 해제하는 두 관리자도 하나는 막힌다. (A5 «마지막 관리자»)
5. **좁은 창(390px)에서 사이드바** — 내용이 가로로 넘치지 않고 메뉴에 닿을 수 있다. (S2 «좁은 창»)

---

## API 계약 (A 가 짓고 M 이 쓴다)

모든 응답의 시각은 ISO 문자열. 오류는 지금의 `{ error: { code, message, issues? } }` 봉투.

### 로그인 안 한 요청 — `/api/auth` 아래

| 메서드 · 경로 | 본문 | 성공 | 실패 |
|---|---|---|---|
| `GET /invites/:token` | — | 200 `{ usable: true }` | 404(공통 제약의 문장) |
| `POST /invites/:token/signup` | `{ email, name, password }` | 201 — `/login` 과 같은 몸 · 같은 세션 쿠키 | 404(링크) · 409 «이미 계정이 있는 이메일입니다 — 로그인하세요» · 400(형식) · 429(한도) |
| `GET /resets/:token` | — | 200 `{ email, name }` | 404 |
| `POST /resets/:token` | `{ password }` | 204 — 그 사람의 세션 전부 삭제 · WS 연결 닫힘 | 404 · 400 · 429 |

- 가입 · 재설정 POST 는 로그인 한도(`auth/login-limit.ts`)를 **주소 키로** 센다. 계정 키는 가입에서 본문 이메일, 재설정에서 링크의 대상.

### 관리자 — `/api/admin` 아래 (세션 전용)

| 메서드 · 경로 | 본문 | 성공 | 실패 |
|---|---|---|---|
| `GET /users` | — | 200 `AdminUser[]` | 403 |
| `POST /users/:userId/deactivate` | — | 200 `{ user: AdminUser, revokedLinks: number, ownerlessProjects: number }` | 409 자기 자신 · 마지막 관리자 · 이미 비활성 |
| `POST /users/:userId/activate` | — | 200 `{ user: AdminUser }` | 409 이미 활성 |
| `POST /users/:userId/admin` | — | 200 `{ user: AdminUser }` | 409 비활성 · 이미 관리자 |
| `DELETE /users/:userId/admin` | — | 200 `{ user: AdminUser, revokedLinks: number }` | 409 자기 자신 · 마지막 관리자 · 관리자 아님 |
| `POST /users/:userId/reset-links` | — | 201 `{ token: string, expiresAt }` | 409 비활성 |
| `GET /invites` | — | 200 `AdminInvite[]` | |
| `POST /invites` | `{ name: string(1–60), kind: 'single' \| 'multi', expiresInDays?: 1–90 }` | 201 `{ invite: AdminInvite, token: string }` | 400 |
| `POST /invites/:inviteId/revoke` | — | 200 `{ invite: AdminInvite }` | 409 이미 못 씀 |
| `GET /projects` | — | 200 `AdminProject[]` | |
| `POST /projects/:projectId/owner` | `{ userId }` | 200 `{ project: AdminProject }` | 409 활성 owner 있음 · 400 대상 비활성 · 404 |
| `GET /audit` | 질의 `?action=&actorId=&before=<ISO>&limit=<1–200, 기본 50>` | 200 `{ entries: AuditEntry[], next: string \| null }` | |

```ts
interface AdminUser {
  id: string; email: string; name: string
  isInstanceAdmin: boolean
  active: boolean            // deactivated_at IS NULL
  createdAt: string
  lastSeenAt: string | null  // users.last_seen_at (아래 0034)
  projectCount: number
  invite: { id: string; name: string } | null
}
type InviteState = 'usable' | 'expired' | 'revoked' | 'used-up'
interface AdminInvite {
  id: string; name: string; kind: 'single' | 'multi'
  expiresAt: string; state: InviteState
  signups: number; createdAt: string
  createdBy: { id: string; name: string }
}
interface AdminProject {
  id: string; name: string; slug: string
  owners: { id: string; name: string; active: boolean }[]
  hasActiveOwner: boolean; memberCount: number; updatedAt: string
}
type AuditAction =
  | 'invite.create' | 'invite.revoke' | 'invite.signup'
  | 'reset.create' | 'reset.use'
  | 'user.deactivate' | 'user.activate' | 'admin.grant' | 'admin.revoke'
  | 'project.owner' | 'theme.upload' | 'theme.hide' | 'theme.unhide'
interface AuditEntry {
  id: string; at: string; action: AuditAction
  actor: { kind: 'user'; id: string; name: string } | { kind: 'cli' }
  targetUser: { id: string; name: string; email: string } | null
  project: { id: string; name: string } | null
  invite: { id: string; name: string } | null
  detail: Record<string, string | number | boolean>
}
```

- 화면이 링크 주소를 짓는다: `${location.origin}/invite/${token}` · `${location.origin}/reset/${token}`.
- 멤버 화면의 멤버 목록 항목(`GET /api/projects/:id/members`)에 `active: boolean` 을 더한다(A 가 서버, M 이 표지).

## 웹 계약 (S 가 짓고 M 이 쓴다)

- `apps/web/src/shell/workspace-layout.tsx` — `export function WorkspaceLayout(props: { title: string; crumbs?: { label: string; to: string }[]; actions?: ReactNode; children: ReactNode }): ReactElement`.
  사이드바 + 머리(빵부스러기 · `<h1>` · 오른쪽 `actions`) + 내용. `PageHead` 를 대신한다.
- `apps/web/src/shell/workspace-nav.ts` — `export const ADMIN_NAV: readonly { key: 'users' | 'invites' | 'projects' | 'themes' | 'audit'; label: string; to: string }[]`
  (`/admin/users` · `/admin/invites` · `/admin/projects` · `/admin/themes` · `/admin/audit`). S 는 다섯 링크를 다 두고, 아직 없는 넷은 M 이 라우트를 단다
  (S 단계에서 그 넷은 «준비 중» 빈 화면 라우트 하나가 받는다).
- 클래스 접두는 `wb-shell-workspace-`.

---

## 트랙 S — 뼈대 (브랜치 `feat/workspace-shell`)

게이트(README «트랙 게이트» — 웹 + api 둘에 걸친다): 전량 넷(`pnpm typecheck` · `pnpm build` · `pnpm test` · `pnpm test:build`).

### S1: 프로젝트 목록 응답에 멤버 수 · 최근 수정

**Files:**
- Modify: `apps/api/src/repos/projects.ts` (`listProjectsForUser`)
- Modify: `apps/api/src/routes/projects.ts` (`GET /`)
- Modify: `apps/web/src/api/types.ts` · `apps/web/src/api/http-client.ts` · `apps/web/src/api/client.ts`
- Test: `apps/api/test/project-list-fields.test.ts` (새)

**Interfaces:**
- Produces: `GET /api/projects` 항목 = `ProjectDetail & { memberCount: number; updatedAt: string }`. 웹 타입 `ProjectListItem extends ProjectDetail`.
  `updatedAt` = `greatest(projects.updated_at, max(pages.updated_at))`(그 프로젝트의 페이지 — 없으면 `projects.updated_at`). 질의 하나(집계 조인 ·
  프로젝트마다 질의 금지). 정렬은 지금처럼 `created_at` 오름차순 — 화면이 정렬한다.
- `api/types.ts` 머리말의 «프로젝트를 내는 응답은 넷이고 전부 이 형태다» 표와 그 실측을 고친다 — 목록만 두 칸이 더 있다.

- [ ] **Step 1:** 케이스 — `memberCount` 가 멤버 추가 · 제거를 따라간다 · 페이지 편집(ops 하나) 뒤 그 프로젝트의 `updatedAt` 이 편집 전보다 크고
  다른 프로젝트의 것은 그대로다 · 페이지 없는 프로젝트는 `projects.updated_at`.
- [ ] **Step 2:** 실패 확인 → 구현 → 통과. 먼저 페이지 편집이 `pages.updated_at` 을 실제로 올리는지 재고, 안 올리면 그 사실을 보고하고 정의를
  `max(revisions.created_at)`(페이지 조인)로 바꾼다.
- [ ] **Step 3:** 커밋 `feat(api): project list carries member count and last update`

### S2: 뼈대 — 사이드바 · 폭 전체

**Files:**
- Create: `apps/web/src/shell/workspace-layout.tsx` · `apps/web/src/shell/workspace-nav.ts`
- Modify: `apps/web/src/shell.css` (`.wb-shell-workspace-*` 더함 · `.wb-shell-project-list` 720 · `.wb-shell-home` 960 · `.wb-shell-settings` 1280 ·
  `.wb-shell-account` 760 의 `max-width` 를 이 화면들에서 걷는다)
- Modify: `apps/web/src/app.tsx` (라우트 — `/admin/:section` 의 «준비 중»)
- Retire: `apps/web/src/shell/page-head.tsx` — 부르는 자리가 0 이 되면 걷는다(걷기 한 줄은 지침 «추적 파일을 걷는 브리프»)
- Test: `apps/web/test/shell/workspace-layout.test.tsx` (새) · `apps/web/build-test/workspace-layout.test.ts` (새, 실브라우저)

**Interfaces:** 위 «웹 계약».

- [ ] **Step 1 (jsdom):** 관리자 아닌 사람 — 사이드바에 «프로젝트» · «계정» · 이름 · 로그아웃, 관리자 링크 0. 관리자 — 다섯 링크가 `ADMIN_NAV` 차례로.
  지금 주소의 링크에 `aria-current="page"`. 로그아웃은 `session/session-menu.tsx` 의 `useLogout` 을 그대로 쓴다.
- [ ] **Step 2 (실브라우저):** 창 1280 · 1920 에서 내용 칸 폭 = 창 폭 − 사이드바 폭 − 좌우 여백(±2px). 창 390 에서 문서 `scrollWidth` ≤ 390,
  사이드바 메뉴에 키보드 · 누름으로 닿는다(좁은 창의 접기 꼴은 워커 재량 — 설계 «빌더에게 남긴 것»). 넘침은 지침 «화면 넘침은 요소 상자로만
  세지 않는다»대로 잰다.
- [ ] **Step 3:** 구현 → 통과 → 커밋 `feat(web): workspace sidebar layout`

### S3: 프로젝트 목록 — 카드 격자

**Files:**
- Modify: `apps/web/src/routes/project-list.tsx` · `apps/web/src/projects/use-project-commands.tsx`(필요하면) · `apps/web/src/shell.css`
- Create: `apps/web/src/projects/project-filter.ts` — `export function filterProjects(items: ProjectListItem[], q: { text: string; role: ProjectRole | 'all'; sort: 'updated' | 'name' }): ProjectListItem[]`
- Test: `apps/web/test/projects/project-filter.test.ts` (새) · 기존 `project-list` 케이스 갱신

- [ ] **Step 1:** `filterProjects` 케이스 — 글은 이름 · 슬러그 · 설명에서 대소문자 무시 부분 일치 · 역할 거름 · `updated` 는 `updatedAt` 내림차순,
  같으면 이름 · `name` 은 `localeCompare(…, 'ko')`.
- [ ] **Step 2:** 화면 케이스 — 카드에 역할 표지 · 멤버 수 · 상대 시각 · «설정» 링크 · 기본 정렬 «최근 수정» · 검색 결과 0 일 때 «검색 결과가 없습니다»
  (빈 목록의 «참여 중인 프로젝트가 없습니다»와 다른 문장). 거름 · 정렬 · 검색어는 주소 질의(`?q=&role=&sort=`)에 둔다 — 뒤로 가기로 돌아오면 남게.
- [ ] **Step 3:** 구현(격자 `repeat(auto-fill, minmax(260px, 1fr))`) → 통과 → 커밋 `feat(web): project list cards with search, role filter and sort`

### S4: 프로젝트 설정 · 계정 · 관리자 테마를 뼈대 안으로

**Files:**
- Modify: `apps/web/src/routes/settings.tsx` (`SettingsTabs` 가로 — `aria-orientation="horizontal"`, ← → Home End 는 그대로) ·
  `apps/web/src/routes/account.tsx` · `apps/web/src/routes/admin-themes.tsx` · `apps/web/src/shell.css`
- Test: 기존 `settings` · `account` · `admin-themes` 케이스 갱신, `apps/web/build-test/workspace-layout.test.ts` 에 판 더함

- [ ] **Step 1:** 설정 머리 — 빵부스러기 «프로젝트 › <이름>», 제목 «<이름> 설정», `actions` 에 «에디터 열기»(`/projects/:id`). 탭 키보드 · `?section=` ·
  owner 아니면 «위험 구역» 없음 케이스가 그대로 초록.
- [ ] **Step 2 (실브라우저):** 창 1920 «테마» 절에서 미리보기 폭이 S 전(1280 제한) 판보다 넓다 — 기준값은 고치기 전 소스로 한 번 재어 케이스 머리말에 적는다.
- [ ] **Step 3:** 셋을 옮긴 뒤 `git grep -n 'PageHead' apps/web/src` 가 0 이면 `page-head.tsx` 를 걷는다. 커밋 `feat(web): settings, account and admin themes in the workspace layout`

### S5: 문서

- [ ] `apps/web` 머리말 · 정본 설계 「화면 사이의 길」(지금 `PageHead` 를 말하는 자리 — `git grep -n '화면 사이의 길'`)을 뼈대로 고친다. 커밋 `docs: workspace layout`.

---

## 트랙 A — 계정 (브랜치 `feat/accounts`)

게이트: 전량 넷(api + 웹의 가입 · 재설정 화면).

### A1: 마이그레이션 `0034-accounts`

**Files:** Create `apps/api/src/db/migrations/0034-accounts.ts` · Modify `apps/api/src/db/types.ts` · `apps/api/src/db/migrations/index.ts`
Test: `apps/api/test/accounts-migration.test.ts` (새)

**Interfaces — Produces (컬럼 이름 고정):**
- `users.deactivated_at timestamptz null` · `users.invite_id uuid null → invites(id) on delete set null` · `users.last_seen_at timestamptz null`
  (세션 `resolveSession` 이 `last_seen_at` 을 고칠 때 함께 고친다 — 세션이 지워져도 남는 «마지막 접속»).
- `invites(id uuid pk, name text, kind text check in ('single','multi'), token_hash text unique, expires_at timestamptz, revoked_at timestamptz null, created_by uuid → users(id), created_at)`
- `password_resets(id uuid pk, user_id uuid → users(id) on delete cascade, token_hash text unique, expires_at, used_at null, created_by uuid → users(id), created_at)`
- `admin_audit(id uuid pk, at timestamptz default clock_timestamp(), action text, actor_id uuid null → users(id), target_user_id uuid null, project_id uuid null, invite_id uuid null, detail jsonb default '{}')`
  — `actor_id` null 은 CLI. `target_user_id` · `project_id` · `invite_id` 는 FK 를 걸지 않는다(대상이 지워져도 기록은 남는다 — `revisions.actor_id` 와 같은 까닭).
  이름은 읽을 때 조인하고, 없으면 `detail` 에 행동 때 적어 둔 이름을 쓴다.
- `down` 은 셋을 지우고 컬럼을 뗀다.

- [ ] 케이스: up 뒤 컬럼 · 표가 있다, down 뒤 없다. 지침 «마이그레이션을 새로 두면 디렉터리를 글자로 세는 자»를 게이트에 넣는다
  (`git grep -lE 'MIGRATIONS_DIR|db/migrations' apps/api/test`). 커밋.

### A2: 관리자 기록 · 테마 라우트에 기록

**Files:** Create `apps/api/src/repos/admin-audit.ts` — `export async function recordAdminAction(trx: DbHandle, entry: { action: AuditAction; actorId: string | null; targetUserId?: string; projectId?: string; inviteId?: string; detail?: Record<string, string | number | boolean> }): Promise<void>`
· `export async function listAdminActions(db: DbHandle, q: { action?: AuditAction; actorId?: string; before?: Date; limit: number }): Promise<{ entries: AuditEntry[]; next: string | null }>`.
Modify `apps/api/src/routes/admin-themes.ts`(올리기 · 숨기기) · `apps/api/src/db/admin.ts`(CLI 지정 · 해제 → `actorId: null`). Create `apps/api/src/routes/admin-audit.ts`(`GET /audit`).
Test: `apps/api/test/admin-audit.test.ts`

- [ ] 케이스: 테마 올리기 성공 → 기록 1 · 재확인 실패로 되돌린 올리기 → 기록 0(같은 트랜잭션) · CLI grant → `actor.kind === 'cli'` · 관리자 아님 → 403 ·
  토큰 요청 → 401 · `before` 로 쪽 넘김 · `limit` 201 → 400. 커밋.

### A3: 초대 링크 · 가입

**Files:** Create `apps/api/src/repos/invites.ts` · `apps/api/src/routes/admin-invites.ts` · `apps/api/src/routes/invite-signup.ts` ·
`apps/web/src/routes/invite.tsx`(`/invite/:token` — 뼈대 밖, `RedirectWhenAuthenticated` 아래, `routes/login.tsx` 꼴). Modify `apps/api/src/app.ts` ·
`apps/web/src/app.tsx` · `apps/web/src/api/*` · `apps/api/test/user-creation-census.test.ts`(계정을 만드는 길 «시딩 + 초대 가입» 둘 — 사슬 층마다).
Test: `apps/api/test/invites.test.ts` · `apps/api/test/invite-signup-race.test.ts` · `apps/web/test/routes/invite.test.tsx`

**Interfaces — Produces:** API 계약의 초대 행 다섯. 가입은 한 트랜잭션에서 `invites` 행 `FOR UPDATE` → 쓸 수 있는지(만료 · 거둠 · `single` 이고 가입 1 이상 ·
**만든 사람이 지금 활성 관리자**) → 사용자 삽입(`invite_id`) → `recordAdminAction('invite.signup', actorId: 새 사용자)` → 세션.
만들기 · 거두기도 `invite.create` · `invite.revoke` 로 같은 트랜잭션에서 남긴다.

- [ ] **Step 1:** 케이스 — 만들기 201 이 `token` 을 내고 DB 에는 해시만(원문 글자가 어느 칸에도 없다) · 목록에 `token` 칸 없음 · 넷의 404 가 같은 몸 ·
  `single` 은 둘째 가입 404 · `multi` 는 만료 전 여러 번 · 거둔 뒤 404 · 같은 이메일 409 · 가입 응답에 쿠키 · `/me` 200 · 한도 초과 429.
- [ ] **Step 2 — «동시 가입»:** 한 번짜리 링크로 다른 이메일 둘이 겹친 판 — 지침 «경주를 재는 케이스는 두 요청이 겹친 판만 센다»대로 `holdQuery` 로
  둘을 `invites` 행에 줄 세운 뒤 놓는다. 201 하나 · 404 하나 · 사용자 하나. 줄이 안 서면 던진다. 행 잠금을 뗀 변조로 한 번 죽인다.
- [ ] **Step 3 (웹):** 가입 화면 — 칸 넷 · 비밀번호 확인 불일치는 보내지 않고 문장 · 8 자 미만 문장 · 404 면 폼 대신 공통 문장 · 409 문장 · 성공하면 `/`.
- [ ] 커밋 `feat: invite links and signup`

### A4: 비활성화 · 다시 활성화

**Files:** Modify `apps/api/src/repos/users.ts` · `apps/api/src/auth/session.ts`(`createLoginSession` 조건에 `deactivated_at IS NULL` — 같은 `FOR SHARE` 문장) ·
`apps/api/src/routes/auth.ts`(로그인) · `apps/api/src/repos/members.ts`(이메일로 추가가 비활성을 거절 · 멤버 목록에 `active`). Create `apps/api/src/routes/admin-users.ts`.
Test: `apps/api/test/admin-deactivate.test.ts` · `apps/api/test/admin-deactivate-race.test.ts`

**Interfaces — Produces:** `deactivate` 한 트랜잭션: 대상 사용자 행 잠금 → (대상이 관리자면) 마지막 관리자 검사 → `deactivated_at = now()` · `is_instance_admin = false` →
그 사람이 만든 쓸 수 있는 초대 거둠 · 안 쓴 재설정 무효 → 세션 전부 · API 토큰 전부 삭제 → 기록 → `recheckInstanceAdmin`. 커밋 뒤 지운 세션들의 WS 연결을
닫는다(`ws/notify.ts` 의 `closeSessionConnections`). `ownerlessProjects` 는 그 커밋 뒤 «활성 owner 0 이 된 프로젝트 수».

- [ ] **Step 1:** 케이스 — 자기 자신 409 · 이미 비활성 409 · 비활성 뒤 로그인 401 이 틀린 비밀번호와 같은 몸 · 그 사람의 쿠키로 `/me` 401 · 그 사람의 API 토큰 401 ·
  **«열린 연결이 닫힌다»**(비활성화 전 WS 를 연 `WsProbe` 가 커밋 뒤 닫힘을 받고, 다시 붙으면 401) · **«그 사람의 링크를 거둔다»**(그가 만든 `multi` 링크로
  가입 404, 응답 `revokedLinks` 1) · 다시 활성화 뒤 로그인 성공 · 관리자 아님 · 멤버 «이메일로 추가»가 비활성을 400 으로 거절 · 마지막 활성 owner 를 끄면
  `ownerlessProjects` 1.
- [ ] **Step 2 — 겹침:** 지침 ««다른 세션을 끝낸다»는 그 쓰기의 커밋 뒤에 태어나는 세션을 센다» — 견준 뒤 · 넣기 전의 로그인과 비활성화를 겹친 판에서
  세션이 남지 않는다(`createLoginSession` 의 조건을 뗀 변조로 죽인다). 비활성화와 그 사람의 비밀번호 바꾸기 · 그 사람이 낸 관리자 쓰기를 겹친 판에서
  교착 0(지침 «교착을 잴 때» — 순서를 뒤집은 판까지).
- [ ] 커밋 `feat(api): deactivate and reactivate users`

### A5: 관리자 지정 · 해제

**Files:** Modify `apps/api/src/routes/admin-users.ts` · `apps/api/src/repos/users.ts`(`setInstanceAdmin` 재사용 — CLI 와 같은 함수). Test: `apps/api/test/admin-grant.test.ts`

- [ ] 케이스 — 지정 · 해제 · 비활성 지정 409 · 자기 해제 409 · **«마지막 관리자»**: 관리자 둘이 서로를 동시에 해제하는 판에서 하나만 성공(활성 관리자 행 전부를 id 순
  `FOR UPDATE` 로 잡고 센다 — 그 잠금을 뗀 변조로 둘 다 성공하는 것을 한 번 보인다) · 해제가 그 사람의 쓸 수 있는 링크를 거둔다 · 해제된 사람의 다음 관리자 요청 403.
- [ ] 커밋 `feat(api): grant and revoke instance admin from the API`

### A6: 비밀번호 재설정 링크

**Files:** Create `apps/api/src/repos/password-resets.ts` · `apps/api/src/routes/password-reset.ts` · `apps/web/src/routes/reset.tsx`(`/reset/:token`).
Modify `apps/api/src/routes/admin-users.ts`. Test: `apps/api/test/password-reset-links.test.ts` · `apps/web/test/routes/reset.test.tsx`

**Interfaces:** 쓰기는 «사용자 행 → 세션» 차례(`db/reset-password.ts` 와 같은 함수를 부른다 — 두 벌로 짓지 않는다). 새로 만들면 그 사람의 안 쓴 앞 링크를 `used_at` 으로 막는다.

- [ ] 케이스 — 원문은 해시만 · 24 시간 뒤 404 · 한 번 쓰면 404 · 새 링크가 앞 링크를 막음 · 쓰면 그 사람의 세션 전부 401 · 열린 WS 닫힘 · 비활성 대상 409 ·
  기록 `reset.create` · `reset.use` · 만든 관리자가 비활성화되면 그 링크 404. 웹 — 두 칸 · 불일치 · 성공하면 `/login` 과 «비밀번호를 바꿨습니다» 한 줄.
- [ ] 커밋 `feat: admin password reset links`

### A7: 관리자 › 사용자 · 프로젝트 목록 · owner 넘기기

**Files:** Modify `apps/api/src/routes/admin-users.ts`(`GET /users`). Create `apps/api/src/routes/admin-projects.ts` · `apps/api/src/repos/admin-projects.ts`. Modify `apps/api/src/repos/members.ts`.
Test: `apps/api/test/admin-projects.test.ts`

**Interfaces:** owner 넘기기 한 트랜잭션: 프로젝트 행 잠금 → owner 행 잠금(`repos/members.ts` 의 지금 차례) → 활성 owner 있으면 409 → 대상 활성 확인 →
멤버 아니면 owner 로 넣기(`deleteStaleMemberTokens` 먼저 — `insertMember` 와 같은 길), 멤버면 owner 로 올리기 → 기록 → 재확인.
관리자는 이 라우트 말고 프로젝트 내용 라우트를 지나지 못한다 — 지금 `projectGuard` 가 그렇고, 이 트랙은 그것을 바꾸지 않는다.
`memberCount` · `updatedAt` 은 S1 과 **같은 정의**다(`greatest(projects.updated_at, max(pages.updated_at))`). S1 과 나란히 돌아 그 식을 못 보므로
`repos/admin-projects.ts` 에 따로 짓고, 병합 때 두 식을 한 함수로 모은다(지침 «판정 · 풀이를 바꾸는 트랙은 그 판정을 «같다» 고 적은 사본을 함께 센다»).

- [ ] 케이스 — `GET /users` 칸들(`projectCount` · `invite` · `lastSeenAt` 이 세션 삭제 뒤에도 남음) · `GET /projects` 가 관리자가 멤버 아닌 프로젝트도 냄 ·
  활성 owner 있음 409 · 자기에게 넘기기 200 · 넘긴 뒤 그 관리자가 `GET /api/projects/:id` 200 · 넘기기 전에는 404(비멤버) · 비활성 owner 행은 그대로 ·
  프로젝트 삭제와 겹친 넘기기 교착 0. 커밋.

### A8: 문서

- [ ] `apps/api/README.md` 엔드포인트 계약 · 정본 설계 「권한 모델」 · 계정을 만드는 길(README 「세우기」 5 번 — «유일한 길» 문장) · `db/admin.ts` 머리말
  («API 에는 관리자를 만드는 라우트가 없다») · `auth/admin.ts` 머리말을 고친다. 커밋 `docs: accounts and admin API`.

---

## 트랙 M — 관리자 화면 (브랜치 `feat/admin-screens`, S · A 병합 뒤 main 에서)

게이트: 웹 영역(`pnpm typecheck` · `pnpm build` · `pnpm vitest run --project web` · `pnpm test:browser` · `pnpm vitest run --project build apps/web/build-test/export-bundle.test.ts`).

공통: 표 하나 · 위 줄(검색 · 거름 · 단추) · 줄 «…»(`shell/action-menu.tsx`). 실패 문장은 `api/failure` 의 `toFailure`. 쓰기 뒤 목록을 다시 받는다
(`settings/members-section.tsx` 의 `write` 꼴).

### M1: 사용자 (`/admin/users`)
Create `apps/web/src/admin/users-section.tsx` · `apps/web/src/admin/link-reveal.tsx`(`export function LinkReveal(props: { url: string; expiresAt: string; onClose: () => void }): ReactElement` — 링크 · «복사» · «이 링크는 지금만 보입니다»).
- [ ] 케이스 — 칸 · 검색 · 상태 거름 · 관리자 표지 · 비활성 줄 흐림 · «…» 항목이 상태에 맞게(비활성엔 «다시 활성화»만 · 자기 줄엔 비활성화 · 해제 없음) ·
  비활성화 확인 상자가 «로그인 · 세션 · API 토큰이 바로 끊깁니다»와 그 사람이 마지막 활성 owner 인 수를 말함 · 응답의 `revokedLinks` · `ownerlessProjects` 를
  한 줄로 · 재설정 링크가 `LinkReveal` 로 · 409 문장.

### M2: 초대 링크 (`/admin/invites`)
Create `apps/web/src/admin/invites-section.tsx`.
- [ ] 케이스 — 만들기 상자(이름 · 종류 · 만료 7 기본) → `LinkReveal` · 목록에 «복사» 없음(설계 — 원문은 만든 직후만) · 상태 넷의 글 · 거두기 확인 · 이미 못 씀 409.
  «사용자» 칸의 «초대 링크 만들기»가 이 상자를 연다.

### M3: 프로젝트 (`/admin/projects`)
Create `apps/web/src/admin/projects-section.tsx`.
- [ ] 케이스 — «활성 owner 가 없는 프로젝트 N» 경고와 거름 · «owner 넘기기»는 `hasActiveOwner === false` 줄에만 · 대상 고르기는 활성 사용자 목록(자기 포함) ·
  409(그새 생김) 문장 · 이름은 멤버일 때만 링크.

### M4: 기록 (`/admin/audit`)
Create `apps/web/src/admin/audit-section.tsx`.
- [ ] 케이스 — 최신이 위 · 행동 · 사람 거름 · «더 보기»가 `next` 로 · `cli` 행위자는 «서버 명령» · 행동마다 한 줄 문장(13 종 표를 케이스로).

### M5: 멤버 화면의 비활성 표지 · 실브라우저
- [ ] `settings/members-section.tsx` 에 «비활성» 표지. 실브라우저(`apps/web/build-test/admin-screens.test.ts`): 관리자가 링크를 만들어 다른 컨텍스트로 가입 →
  사용자 표에 «초대 <이름>» · 그 사람을 비활성화 → 그 사람의 열린 에디터 탭이 로그인 화면으로 · 창 390 에서 네 칸 넘침 0.

---

## 진행 순서

1. 설계 문서를 main 에 들인다.
2. S · A 워크트리를 만들고 부트스트랩(`AGENTS.md` 「생성 직후 세팅」 — A 는 `.env` 값 다섯을 갈라 자기 DB 를 띄운다). 워커 둘을 띄운다.
3. 각 트랙 끝에 리뷰어(무엇을 볼지 «리뷰 초점»과 그 트랙의 겹침 케이스로 지목) → 고침 → 병합. A 를 먼저 병합하면 S 를 그 위로 옮긴다(반대도 같다).
4. 합친 판 전량 게이트 → M 계획의 이름 · 타입을 합친 코드와 대조해 필요한 만큼 고친 뒤 M 워크트리.
5. 사용자 개발 DB 는 `0034` 병합 전에 덤프한다(로드맵의 앞 단계와 같은 자리 `.worktrees/.coord/backups/`).
