# 개인 모듈 · 기본 모듈 걷기 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans 로 이 세션에서 실행한다(서브에이전트 금지 — 코디네이터 공통 규칙). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기본 모듈을 걷고, 하단 «모듈» 탭을 «개인 모듈» · «프로젝트 모듈» · «테마 패턴» 셋으로 세우며, 개인 ↔ 프로젝트 복사 길과 편집할 수 없는 판의 두 입구를 연다.

**Architecture:** 개인 모듈은 새 표 `personal_modules`(소유자 = 사용자, 프로젝트 FK 없음)와 세션 전용 라우트 `/api/me/modules` 다섯이 갖는다. 복사는 서버 엔드포인트를 새로 두지 않고 화면이 «원본 하나를 다시 읽고 → 대상 쪽 저장 엔드포인트로 새로 저장» 한다 — 그래서 복사가 저장과 같은 가드 · 거름 · 한도 · 재확인을 그대로 지난다. 화면은 «판이 보이는가»(늘) · «넣을 수 있는가»(편집 모드 && `canEdit`) · «프로젝트 모듈을 쓸 수 있는가»(`canEdit`) 셋으로 가른다.

**Tech Stack:** Fastify · kysely · PostgreSQL · zod · React 19 · vitest · playwright-core(`apps/web/build-test`).

**Spec:** `docs/superpowers/specs/2026-10-20-personal-modules-design.md`

## Global Constraints

- 묶음 차례: «개인 모듈» · «프로젝트 모듈» · «테마 패턴». «기본 모듈» 묶음 · `BUILTIN_MODULES` 는 코드 · 지금 문서에서 0.
- 개인 모듈 빈 문장: «구조 트리에서 노드를 골라 '모듈로 저장'에서 '개인 모듈'을 고르면 여기에 섭니다».
- 남의 개인 모듈 id → 모르는 id 와 **같은 답**(같은 자격으로 견준다). 세션만 — 토큰은 개인 모듈을 읽지도 쓰지도 못한다.
- 프로젝트 삭제 · 멤버 빠짐 · 역할 바뀜이 개인 모듈을 안 건드린다. 소유자 칸은 `users` 에 `ON DELETE CASCADE`.
- 이름 1 ~ 60자(`MODULE_NAME_MAX`) · 노드 1개 이상 · `Page` 422 `nested-page` · NUL / 짝 없는 서로게이트 400 · 개수 상한 없음 — 프로젝트 모듈과 같다. 저장은 서버에서도 `moduleNodesForSave`.
- «프로젝트 모듈로 복사» 는 editor 이상(서버가 `POST …/modules` 의 editor 가드로 막는다). «개인 모듈로 복사» 는 viewer 이상.
- 복사 뒤 통지: «'이름' 을 프로젝트 모듈로 복사했습니다» · «'이름' 을 개인 모듈로 복사했습니다».
- 역할 읽기는 `projectAbilities(…)` 인자 자리만(`apps/web/test/role-access.test.ts`). 테마 픽스처는 `system-admin` 만.
- 정본 설계서는 §9 «트리의 줄 행동» · «하단 판의 탭» · §11.1 만 고친다(`th` · `lt` 트랙이 다른 절을 고친다).

## Review Focus

1. **편집 → 뷰 모드 전환 · 강등이 끌기 도중에 온다** — 판이 이제 남으므로(전에는 판째 내려가 끌기가 끊겼다) 놓기가 편집을 내면 안 된다 → 넣기 함수가 «넣을 수 있는가» 를 그 순간 값으로 다시 보고, 카드 판을 그 값으로 다시 마운트한다. Task 5 의 jsdom 케이스 «끄는 중 뷰 모드로 바꾸고 놓으면 편집 0».
2. **넣기 · 복사 직전 원본이 지워졌다** — 개인 모듈 넣기 · 두 복사 모두 원본을 다시 읽고 404 면 «이 모듈은 지워졌습니다» · 목록 다시 읽기 · 쓰기 0. Task 4 케이스.
3. **다른 프로젝트에서 저장한 개인 모듈의 `navigate` 대상 페이지가 이 프로젝트에 없다** — 넣기 거름이 빼고 «상호작용 동작 N개는 대상이 없어 빼고 넣었습니다». Task 7 실브라우저.
4. **viewer 가 저장 상자에서 프로젝트를 고를 길** — 고르기에 프로젝트가 아예 없고, 손으로 낸 POST 는 서버 403. Task 1 · Task 6 케이스.
5. **두 탭(같은 사람)에서 개인 모듈을 바꾼다** — 방송이 없으므로 탭을 열 때 · 쓰기 뒤에 다시 읽는 것으로 족하다(설계의 «아닌 것»). 다른 탭이 지운 것을 넣으면 2번 길. 케이스는 2번이 갖는다.

---

### Task 1: 서버 — `personal_modules` 표 · `/api/me/modules`

**Files:**
- Create: `apps/api/src/db/migrations/0026-personal-modules.ts` · `apps/api/src/repos/personal-modules.ts` · `apps/api/src/routes/personal-modules.ts` · `apps/api/test/personal-modules.test.ts`
- Modify: `apps/api/src/db/migrations/index.ts` · `apps/api/src/db/types.ts`(`PersonalModulesTable` · `Database.personal_modules`) · `apps/api/src/app.ts`(등록 `prefix: '/api/me'` · 주석의 «기본 모듈» 걷기) · `apps/api/src/routes/modules.ts`(머리말의 내장 모듈 절) · `apps/api/src/repos/modules.ts`(목록 주석)
- 인구조사(죽으면 고친다): `apps/api/test/guard-in-lock.test.ts` 의 `NOT_LOCKED` · `actor-census.test.ts` 의 `TABLES` · `real-api-harness.test.ts` 의 `CLEARED_TABLES` · 그 밖에 등록 라우트 · 표 · 마이그레이션 디렉터리를 세는 자(`git grep -lE 'MIGRATIONS_DIR|db/migrations' apps/api/test`, `token-route-census` · `pre-guard-hook-census` · `guarded-routes`)

**Interfaces:**
- Produces(HTTP): `GET /api/me/modules` → 200 `{ modules }`(최근 것 먼저) · `GET /api/me/modules/:moduleId` → 200 `{ module }` · `POST /api/me/modules` `{ name, nodes }` → 201 `{ module }` · `PATCH /api/me/modules/:moduleId` `{ name }` → 200 `{ module }` · `DELETE /api/me/modules/:moduleId` → 204. 응답 모양은 프로젝트 모듈과 같다(`id · name · nodes · nodeCount · createdBy(=소유자) · createdAt · updatedAt`).
- Produces(repo): `insertPersonalModule(db, { ownerId, name, nodes })` · `listPersonalModules(db, ownerId)` · `findPersonalModule(db, ownerId, moduleId)` · `renamePersonalModule(db, ownerId, moduleId, name)` · `deletePersonalModule(db, ownerId, moduleId)` — 전부 `owner_id` 를 질의 조건에 둔다(남의 것 = 없음).
- 표: `id uuid pk default gen_random_uuid()` · `owner_id uuid not null references users(id) on delete cascade` · `name text not null` · `nodes jsonb not null` · `created_at` · `updated_at` `clock_timestamp()` · 색인 `(owner_id, created_at)`. `down` 은 표를 지운다.
- 검증 · 거름 · 오류 문장은 `routes/modules.ts` 의 `ModuleBody` · `RenameBody` · `rejectUnstorable` · `nested-page` 와 같다 — 공유할 것은 `routes/modules.ts` 에서 export 해 두 라우트가 같은 것을 쓴다(두 벌 금지).
- 인증: `preHandler: app.requireAuth` + `requireSessionUser(request, '…')`(토큰이면 `/api/me` 는 프로젝트 라우트가 아니라 토큰이 사람을 안 채워 401 이 먼저 난다).

- [ ] **Step 1: 실패하는 케이스** — `personal-modules.test.ts`:
  - «저장 · 목록 · 하나 · 이름 · 삭제 — 내 것» (201 · 목록 최근 먼저 · `createdBy` = 나 · 200 · 204 · 이름 1~60자 400 · 노드 0개 400 · `Page` 422 `nested-page` · NUL 400 · `marker` 와 묶음 밖 액션이 걷힘)
  - «남의 개인 모듈은 모르는 id 와 같은 답» — 다른 사용자 세션 · 같은 프로젝트의 다른 멤버(owner 가 만든 것을 editor 가) · 프로젝트 API 토큰(남의 것 id 와 모르는 id 둘 다 같은 상태 · 같은 본문) · 읽기 · 이름 · 삭제 셋 다. 끝에 원본이 그대로.
  - «프로젝트를 지우거나 멤버에서 빠져도 개인 모듈이 남는다» — 그 프로젝트에서 저장한 노드를 가진 개인 모듈.
  - «복사 — 원본 그대로»: 개인 → 프로젝트(개인 하나 읽고 그 노드로 `POST …/modules`) · 프로젝트 → 개인. 새 id · 새 `createdBy` · 원본 행 바이트 같음 · 원본을 지워도 사본이 남음.
  - «viewer 의 프로젝트 모듈로 복사는 403 · 프로젝트 모듈 수 그대로», «viewer 는 개인 모듈을 저장한다 · 프로젝트 모듈을 개인으로 복사한다».
  - «프로젝트 삭제를 쥔 동안에도 개인 모듈 쓰기는 서지 않는다» — 테스트 트랜잭션이 `deleteProject` 까지 커밋 전에 쥔 채 POST · PATCH · DELETE 가 2s 안에 끝난다(`NOT_LOCKED` 판정의 잰 값).
- [ ] **Step 2:** `pnpm vitest run apps/api/test/personal-modules.test.ts` — 404 로 실패.
- [ ] **Step 3:** 마이그레이션 · 타입 · repo · 라우트 · 등록.
- [ ] **Step 4:** 위 케이스 + 인구조사 파일 통과. `NOT_LOCKED` 셋(`POST /api/me/modules` · `PATCH …/:moduleId` · `DELETE …/:moduleId`)에 까닭: «프로젝트 밖 — `personal_modules` 행만. FK 는 소유자 사용자 행 `KEY SHARE`(비밀번호 바꾸기의 `NO KEY UPDATE` 와 안 부딪힌다). 재확인하지 않는다 — 세션 전용 · 자기 데이터».
- [ ] **Step 5:** 커밋.

### Task 2: 기본 모듈 걷기(schema)

**Files:** Delete `packages/schema/src/module/builtin.ts` · `packages/schema/test/builtin-modules.test.ts`. Modify `packages/schema/src/index.ts`(두 export 줄) · `packages/schema/src/module/save.ts`(«모듈은 프로젝트 단위라 그 페이지는 같은 프로젝트의 페이지» 문장 — 개인 모듈은 다른 프로젝트에서 왔을 수 있다) · `packages/schema/src/tree.ts:58`(«기본 모듈 같은 모듈 상수»).

- [ ] Step 1: 지우고 고친다. Step 2: `pnpm vitest run packages/schema` 통과 · `pnpm typecheck` 는 웹이 아직 import 해 실패(Task 4 에서 닫힌다 — 커밋은 Task 4 와 함께). 

### Task 3: 웹 API — 개인 모듈 다섯

**Files:** `apps/web/src/api/client.ts` · `http-client.ts`(경로 `/me/modules` · SHAPES 는 모듈 봉투 그대로 · `BODY_KEYS`) · `types.ts`(`ProjectModule` 주석 · `export type PersonalModule = ProjectModule`) · `apps/web/test/helpers.tsx` 의 가짜 api · `apps/web/test/api-consumers.test.ts` · `apps/web/test/api/http-client.test.ts`.

**Interfaces — Produces:** `listMyModules(options?)` · `getMyModule(moduleId, options?)` · `createMyModule({ name, nodes })` · `renameMyModule(moduleId, { name })` · `deleteMyModule(moduleId)` — 반환은 `ProjectModule` 꼴.

- [ ] Step 1: http-client 케이스(경로 · 메서드 · 봉투 벗김 · 선언 밖 키를 안 싣는다). Step 2: 실패. Step 3: 구현. Step 4: 통과. 커밋은 Task 4 와 함께.

### Task 4: «모듈» 탭 — 세 묶음 · 카드 행동 · 복사

**Files:** `apps/web/src/palette/module-tab.tsx` · `apps/web/src/palette/module-insert.ts`(머리말 표) · `apps/web/src/edit/structure-drop.ts:56`(키 표 `personal:<id>`) · `apps/web/src/shell.css:657` 주석 · `apps/web/test/palette/module-tab.test.tsx` · `apps/web/test/edit/module-insert.test.ts:173`.

**Interfaces:**
- `ModuleTab` props 에 `insertable: boolean`(넣기 단추 · 끌기) · `projectWritable: boolean`(프로젝트 모듈 이름 · 삭제 · «프로젝트 모듈로 복사»).
- 바뀜 알림을 하나로: `announceModulesChanged(scope: { kind: 'project'; projectId: string } | { kind: 'personal' })`.
- export 상수: `NO_PERSONAL_MODULES`(Global Constraints 의 문장) · `copiedNotice(name, to: 'project' | 'personal')`.
- 카드 행동(접근 이름 `<이름> 넣기` · `<이름> 이름 바꾸기` · `<이름> 삭제` · `<이름> 프로젝트 모듈로 복사` · `<이름> 개인 모듈로 복사`). 이름 바꾸기 · 삭제 부품은 하나로 두고 api 함수를 받는다.

- [ ] Step 1: 케이스 — 묶음 차례 셋 · 개인 빈 문장 · 개인 카드 넣기(편집 하나 · 다시 읽기 `getMyModule`) · 지워진 개인 모듈 404 → 통지 · 다시 읽기 · 두 복사(원본 다시 읽기 → 저장 · 대상 목록 다시 읽기 · 통지) · 복사 원본 404 · 개인 이름 · 삭제 · 검색이 세 묶음을 거름. 기본 모듈을 쓰던 케이스는 개인 모듈 · 테마 패턴으로 옮긴다.
- [ ] Step 2: 실패. Step 3: 구현(기본 모듈 갈래 걷기 포함). Step 4: 통과 · `pnpm typecheck`. Step 5: Task 2 · 3 과 함께 커밋.

### Task 5: 하단 판 — «보이는가» / «넣을 수 있는가»

**Files:** `apps/web/src/routes/editor.tsx`(`paletteEditable` → `paletteInsertable = mode === 'edit' && canEdit` · 판과 토글은 늘) · `apps/web/src/palette/component-palette.tsx`(`ComponentPalette` · `PaletteBody` 에 `insertable` · `projectWritable` — 넣을 수 없으면 위층 탭은 «모듈» 하나 · 기억한 탭을 안 읽고 안 쓴다 · 판 이름 «모듈 목록» · 높이 손잡이 «모듈 목록 높이» · 토글 «모듈») · `PaletteToggle` · 테스트: `apps/web/test/palette/module-tab.test.tsx`(역할 · 모드 표) · 지금 «판이 편집할 수 있을 때만 선다» 를 단언한 jsdom 케이스(`git grep` 으로 센 목록을 보고에 적는다).

- [ ] Step 1: 케이스 — viewer(편집 · 뷰 모드) · editor 뷰 모드: 토글 «모듈» · 판 «모듈 목록» · 위층 탭 «모듈» 하나 · «넣기» 단추 0 · 카드에 끌기 표지 없음 · 개인 이름 · 삭제 섬 · 프로젝트 «개인 모듈로 복사» 섬 · viewer 는 프로젝트 이름 · 삭제 · «프로젝트 모듈로 복사» 0 · editor 뷰 모드는 섬. editor 편집 모드는 지금 그대로. Review Focus 1(끄는 중 뷰 모드 → 놓기 편집 0).
- [ ] Step 2 ~ 4: 실패 → 구현 → 통과. Step 5: 커밋.

### Task 6: «모듈로 저장…» — 개인 / 프로젝트 고르기 · 편집할 수 없는 트리의 한 항목

**Files:** `apps/web/src/panels/save-module-dialog.tsx`(라디오 «개인 모듈» · «프로젝트 모듈» — 기본값 «개인 모듈» · 프로젝트는 `projectWritable` 일 때만 선다 · 통지 `savedModuleNotice(name, to)`) · `apps/web/src/panels/structure-tree.tsx`(편집할 수 없는 판에도 줄 `…` 에 «모듈로 저장…» 한 항목 — 뿌리 줄 없음) · `tree-row-actions.tsx` · `apps/web/test/panels/save-module.test.tsx` · `structure-toolbar.test.tsx:647` 류.

- [ ] Step 1: 케이스 — 고르기 둘 · 기본값 개인 · 개인 저장은 `createMyModule` · 프로젝트는 `createModule` · viewer 트리 줄 `…` 에 항목이 «모듈로 저장…» 하나 · 고르기에 프로젝트 없음 · 저장 뒤 해당 목록이 다시 읽힘.
- [ ] Step 2 ~ 4. Step 5: 커밋.

### Task 7: 실브라우저

**Files:** `apps/web/build-test/module-tab.test.ts` · `apps/web/build-test/palette-review.test.ts`(뷰 모드 · 강등 케이스의 기대) · 이름 · 역할로 판을 찾는 다른 판(`git grep "컴포넌트 목록"` · `name: '컴포넌트'`).

- [ ] Step 1: 케이스 — (가) 끌어 놓기 케이스의 기본 모듈을 개인 모듈로 · (나) viewer bob · editor alice 뷰 모드: 판에 «넣기» 0, 카드를 캔버스에 끌어 놓기 · 카드에 포커스 두고 Enter · 서버 문서 그대로 · 보낸 patch 0(카나리아: 같은 끌기를 편집 모드 alice 가 하면 문서가 바뀐다) (다) 다른 프로젝트에서 저장한 개인 모듈(`navigate` → 그 프로젝트에만 있는 페이지 + 묶음 안 대상)을 넣으면 «상호작용 동작 1개는 대상이 없어 빼고 넣었습니다».
- [ ] Step 2: 고치기 전 소스로 (나) · (다) 빨강을 보인다(백업 · 바이트 비교). Step 3: 통과. Step 4: 커밋.

### Task 8: 문서 · 셈 · 게이트 · 보고

**Files:** `docs/superpowers/specs/2026-08-03-wirebound-design.md` §9 «트리의 줄 행동» · «하단 판의 탭» · §11.1 · `apps/api/README.md`(엔드포인트 · 오류 표 · 응답 형태) · 그 밖에 «기본 모듈» 을 말하는 지금 문서 · `docs/superpowers/plans/2026-10-20-pm-report.md`.

- [ ] Step 1: 문서. Step 2: `git grep -nwF BUILTIN_MODULES` · `git grep -nF '기본 모듈'`(이력 문서 `docs/superpowers/plans/*` · 날짜 붙은 앞 spec 은 뺀다) 0. Step 3: 혼자 죽는 변조 표. Step 4: `pnpm fmt` · `pnpm lint` · `pnpm typecheck` · 실브라우저 전량 · 게이트 전량. Step 5: 보고 · 커밋.
