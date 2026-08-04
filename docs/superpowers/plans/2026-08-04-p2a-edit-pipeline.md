# P2a 서버 편집 파이프라인 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 페이지 스키마의 모든 변경이 `revisions` 로그에 append되고, 클라이언트가 그 `inverse`를 되돌려 보내는 것만으로 개인 undo/redo를 할 수 있는 서버 파이프라인을 만든다.

**Architecture:** 편집 요청 하나 = 트랜잭션 하나다. `pages` 행을 `SELECT ... FOR UPDATE`로 잠그고 → `baseSeq`를 확인하고 → JSON Patch를 적용해 → 카탈로그 검증을 통과시킨 뒤 → `revisions`에 `(ops, inverse)`를 `head_seq + 1`로 넣고 → `pages.schema`·`pages.head_seq`를 함께 갱신한다. 그 순서 전체가 `services/edit-pipeline.ts` 함수 하나 안에 있고, HTTP를 모른다 — P3의 WebSocket이 같은 함수를 그대로 부른다.

**Tech Stack:** TypeScript(ESM, strict + `noUncheckedIndexedAccess`) · Fastify 5 · Kysely 0.28 + node-postgres · PostgreSQL · zod 4 · vitest 3 · `@wirebound/schema`(patch/inverse/validate)

## Global Constraints

설계 문서 `docs/superpowers/specs/2026-08-03-wirebound-design.md`와 `apps/api/README.md`의 규칙이 전부 그대로 유효하다. 이 단계에서 특히 구속력이 큰 것만 값과 함께 옮긴다.

- **계층 규칙.** `repos/`는 SQL만 안다(HTTP·zod를 모른다). `routes/`는 HTTP·zod만 다루고 SQL을 직접 쓰지 않는다. 이 단계가 `services/`를 새로 만든다 — SQL을 직접 쓰지 않고 HTTP도 모르는 계층이다(순수 도메인 함수와 repo 조율이 여기 산다).
- **camelCase / snake_case.** API가 주고받는 키는 camelCase, DB 컬럼은 snake_case. 변환은 `repos/`가 전담하고 API 밖으로 snake_case가 나가지 않는다.
- **역할 비교는 한곳뿐.** `auth/roles.ts`의 `roleAtLeast`. 프로젝트 하위 라우트는 전부 `projectGuard(minRole)` preHandler를 쓴다. 라우트 파일은 역할을 비교하지 않는다.
- **404 / 403.** 프로젝트가 없는 경우와 멤버가 아닌 경우를 구분하지 않고 둘 다 404. 멤버지만 역할이 모자라면 403. (설계 §10)
- **에러 봉투는 하나.** `{ error: { code, message, issues? } }`. 상태 코드 매핑은 `errors.ts`의 `ERROR_STATUS` 한 곳에만 있다. **이 단계는 새 에러 코드도, 새 봉투 필드도 만들지 않는다.**
- **제약 위반 가능 경로는 `withTransaction`.** DB 제약(유니크·FK·jsonb 캐스팅)으로 실패할 수 있는 조작은 반드시 `db/tx.ts`의 `withTransaction`을 거친다 — 세이브포인트 없이 실패하면 호출자 트랜잭션 전체가 `25P02`로 오염된다.
- **사용자 대면 메시지는 전부 한국어.** 에러 메시지·검증 메시지 포함.
- **`@wirebound/schema`는 zod 외 런타임 의존을 갖지 않는다.** 브라우저와 Node 양쪽에서 돌아야 한다. Postgres를 아는 방어(NUL 검사 등)는 `apps/api`에 둔다.
- **Node ≥ 22.9.0**, ESM only, `moduleResolution: bundler`, `verbatimModuleSyntax`.
- 테스트는 `apps/api/test/helpers.ts`의 `withApi()`로 감싼다. **예외는 태스크 9의 경합 테스트 하나뿐이고, 그 파일은 자기 데이터를 스스로 지운다.**

## 이 단계가 만들지 않는 것

의도적으로 뺀 것들이다. 리뷰어가 "왜 없냐"고 묻지 않도록 여기 적어 둔다.

- **WebSocket·브로드캐스트.** P3다. 이 단계의 편집 경로는 REST뿐이다.
- **소프트 잠금(노드 잠금·하트비트).** P3다. 이 단계의 유일한 동시성 방어는 `baseSeq`와 행 잠금이다.
- **서버 리베이스.** `baseSeq`가 어긋나면 무조건 409다(아래 "설계 결정" D2).
- **undo/redo 전용 엔드포인트.** 클라이언트가 revision의 `inverse`를 새 `ops`로 되돌려 보낸다(설계 §7.3). 서버에 undo 개념이 없다.
- **revision 압축·보관 정책.** 설계 §16의 열린 질문이다.
- **레이아웃·테마·코멘트·스냅샷·API 토큰.** 각각 P4a·P5·P6·P9다. `revisions.actor_type`은 `'mcp'`·`'cli'`를 미리 허용하지만 이 단계에서 그 값을 쓰는 코드는 없다.
- **에디터 UI(`apps/web`).** P2b다.

## 설계 결정 (계획 단계에서 확정)

구현자가 다시 고민하지 않도록 근거와 함께 못 박는다.

**D1. `pages.schema`를 바꾸는 모든 경로는 revision을 남긴다.** 예외 없다. 이것이 이 단계의 핵심 불변식이고, 깨지면 undo가 조용히 문서를 망가뜨린다.

> 구체적 실패: 사용자가 ops로 편집해 `head_seq = 5`가 된다. 그다음 누군가 `PUT .../schema`로 문서를 통째 교체하는데 revision을 남기지 않으면 `head_seq`는 5 그대로다. 사용자가 undo를 누르면 클라이언트는 `baseSeq = 5`로 revision 5의 `inverse`를 보내고, 서버는 `head_seq`가 5이므로 받아들여 **교체된 문서**에 그 inverse를 적용한다. 어긋난 경로에 적용되면 409로 튕기지만, 우연히 경로가 살아 있으면 조용히 엉뚱한 값이 들어간다.

따라서 `PUT .../schema`도 같은 파이프라인을 탄다(태스크 7). 그 경로의 ops는 `replace /root` + `replace /version` 두 개다.

**D2. `baseSeq` 불일치는 무조건 409다. 서버 리베이스는 하지 않는다.** 설계 §13 표의 "서버 리베이스 시도 → 실패 시 409"는 **P3에서 다시 본다** — 리베이스가 값을 갖는 것은 실시간 동시 편집이 실제로 존재할 때이고, 그때가 되어야 무엇을 리베이스할 수 있는지(같은 서브트리인지, 겹치지 않는 경로인지)가 정해진다. 지금 추측으로 만들면 검증할 시나리오가 없다. 설계 문서 §13을 이 결정에 맞춰 고친다(태스크 9).

**D3. 클라이언트는 요청을 직렬화한다.** 낙관적 편집이 연달아 일어나도 in-flight 요청은 항상 하나다 — 다음 요청은 앞 요청의 `seq` ack를 받은 뒤 그것을 `baseSeq`로 삼아 보낸다(설계 §7.1의 pending 큐). 서버는 이 규약을 강제하지 않는다. 어기면 두 번째 요청이 409를 받을 뿐이므로 안전하다. **P2b가 이 규약을 구현한다.**

**D4. `clientOpId`는 에코 전용이다. 멱등 키가 아니다.** 서버는 저장하지도, 중복 판정에 쓰지도 않는다. 네트워크 재시도로 같은 ops가 두 번 도착해도 두 번째는 `baseSeq`가 이미 낡아 409가 된다 — 멱등 키가 없어도 중복 적용이 막힌다.

**D5. `PatchError`는 전부 409다(400이 아니다).** 클라이언트는 항상 자기가 방금 본 문서를 기준으로 경로를 만든다. 그 경로가 서버에서 안 맞았다면 원인은 "요청 형식이 잘못됨"이 아니라 "상태가 어긋남"이고, 클라이언트 동작도 같다(재조회). 문법적으로 깨진 경로(예: `path`가 문자열이 아님, `/root` 밖을 가리킴)는 그보다 앞선 zod 단계에서 400으로 걸린다.

**D6. ops의 `path`·`from`은 `/root`이거나 `/root/`로 시작해야 한다.** 그 밖(`/version` 등)은 400이다. `version`은 마이그레이션이 소유하는 필드이지 편집 대상이 아니다. `PUT .../schema` 경로가 내부적으로 만드는 `replace /version`은 파이프라인 함수를 직접 부르므로 이 zod 제약을 거치지 않는다 — 제약은 **HTTP 본문**에만 건다.

> **P2a 최종 리뷰에서 개정: `/version`을 허용한다.** 위 원문은 `/version`을 zod에서 400으로 막았는데, 그러면 `PUT .../schema`가 만든 revision을 **문서화된 undo 경로로 되돌릴 수 없다.** 그 revision의 `ops`는 `[replace /root, replace /version]`이고 `invertOps`가 만드는 `inverse`에도 `/version`이 남으므로, README(§편집 파이프라인 4·5단계)가 정의한 대로 그 `inverse`를 `PATCH .../ops`로 되보내면 400으로 튕겼다(실측). 설계 §7.3은 undo를 보편 메커니즘으로 정의하고, P2b는 `GET .../revisions?mine=true` 응답만으로는 그 revision을 구분할 수 없다 — 되돌릴 수 없는 revision이 스택에 섞이는 것은 모델의 구멍이지 문서로 덮을 일이 아니다.
>
> **개정 후 규칙:** `path`·`from`은 `/root`이거나 `/root/`로 시작하거나, 정확히 `/version`이어야 한다. 그 밖은 여전히 400이다.
>
> **버전 변조 차단은 파이프라인 7단계가 담당한다**(`after.version !== before.version`이면 `invalid` → 422). 다른 값으로 바꾸면 거기서 막히고, 같은 값이면 무연산이라 PUT의 inverse만 통과한다. 즉 D6가 막으려던 실패("클라이언트가 버전을 바꿔 페이지를 영구히 못 열게 만든다")는 그대로 막힌다 — 상태 코드가 400에서 422로 바뀔 뿐이다. **대가:** `/version`에 관한 한 D5/D6의 400↔422 경계(본문 계약 위반 vs 내용 처리 불가)가 흐려진다.
>
> 고정하는 테스트: `revisions.test.ts`의 "`/version`을 다른 값으로 바꾸면 400이 아니라 422다"(앞쪽), `undo-redo.test.ts`의 "`PUT .../schema`가 만든 revision도 이력의 inverse로 되돌릴 수 있다"(뒤쪽, 라우트를 경유한다).

**D7. `add`·`replace`의 `value` 키는 반드시 존재해야 한다.** JSON 본문에는 `undefined`가 없으므로, 키가 빠지면 `op.value`가 `undefined`가 되고 `applyOp`가 그 값을 문서에 심는다. 그 문서를 `JSON.stringify`로 저장하면 그 키가 **사라진다** — 서버가 200을 돌려준 편집 결과와 실제 저장된 문서가 달라진다. 키가 없으면 400이다.

**D8. NUL(U+0000) 검사 대상은 "저장하는 것 전부"다.** `ops`·`inverse`·결과 문서 셋 다 검사한다. 결과 문서만 검사하면 `add` 후 `remove`처럼 값이 문서에 남지 않는 ops 쌍의 NUL을 놓치는데, 그 ops는 `revisions.ops`(jsonb)에 그대로 저장되므로 거기서 `22P05`로 죽는다.

**D9. `seq`·`head_seq`는 DB에서 `bigint`, 애플리케이션에서 `number`다.** `pg`는 int8(OID 20)을 정밀도 손실을 피하려고 **문자열**로 준다. `repos/`가 경계에서 `Number()`로 바꾼다. `Number.MAX_SAFE_INTEGER`(2^53)까지 안전하고, 페이지 하나에 그만큼의 revision이 쌓일 일은 없다. 전역 타입 파서(`pg.types.setTypeParser`)는 쓰지 않는다 — 프로세스 전역 부작용이라 다른 int8 컬럼이 생기는 순간 원격에서 동작이 바뀐다.

**D10. `revisions`는 페이지 삭제 시 `ON DELETE CASCADE`로 함께 사라진다.** 과거 상태 보존은 스냅샷(P6, payload를 통째로 저장)의 책임이지 revision 로그의 책임이 아니다.

**D11. revision 목록 응답은 배열 그대로다.** `{ revisions: [...] }` 같은 봉투를 만들지 않는다 — `/projects`·`/members`·`/menu`가 전부 배열이고, 두 번째 관용구를 늘리지 않는다(P1 이월 4번). 커서 페이지네이션이 실제로 필요해지면 그때 바꾼다.

## 파일 구조

**새로 만드는 것**

| 파일 | 책임 |
|---|---|
| `apps/api/src/db/migrations/0005-revisions.ts` | `revisions` 테이블 + `pages.head_seq` |
| `apps/api/src/db/nul-guard.ts` | `containsNulByte` — `routes/pages.ts`에서 추출 |
| `apps/api/src/repos/revisions.ts` | `revisions` 테이블 전용 SQL |
| `apps/api/src/services/menu-tree.ts` | `buildMenuTree` — `repos/menu.ts`에서 이동 |
| `apps/api/src/services/edit-pipeline.ts` | 편집 파이프라인 전체 |
| `apps/api/src/routes/revisions.ts` | `GET .../revisions` |
| `apps/api/test/revisions.test.ts` | `PATCH .../ops`·`GET .../revisions` 라우트 테스트 |
| `apps/api/test/edit-pipeline.test.ts` | 파이프라인 함수 직접 테스트 |
| `apps/api/test/revisions-concurrency.test.ts` | **실제로 커밋하는** 경합 테스트 |
| `apps/api/test/auth-timing.test.ts` | 로그인 타이밍 방어 회귀 테스트 |
| `packages/schema/build-test/dist-loadable.test.ts` | `test/`에서 이동 (빌드 전용 vitest 프로젝트) |

**고치는 것**

| 파일 | 무엇을 |
|---|---|
| `apps/api/src/db/types.ts` | `RevisionsTable` 추가, `PagesTable.head_seq` 추가 |
| `apps/api/src/repos/pages.ts` | `PageRecord.headSeq`, `lockPageForEdit`, `writePageSchemaAtSeq`. `updatePageSchema` 제거 |
| `apps/api/src/repos/menu.ts` | `buildMenuTree`·`MenuRow`·`PageRow` 제거(이동) |
| `apps/api/src/routes/pages.ts` | `toResponse`에 `headSeq`, `PATCH .../ops` 추가, `PUT .../schema`를 파이프라인으로, `containsNulByte` 제거(이동) |
| `apps/api/src/routes/tree.ts` | `buildMenuTree` import 경로 |
| `apps/api/src/app.ts` | `revisionRoutes` 등록 |
| `apps/api/README.md` | 엔드포인트 표·계층 규칙·"P1이 만들지 않은 것" |
| `vitest.config.ts`, `package.json` | `build` 프로젝트 분리 |
| `packages/schema/tsconfig.test.json` | `build-test` 포함 |
| `docs/superpowers/specs/2026-08-03-wirebound-design.md` | §13 baseSeq 행, §15 로드맵 P2 → P2a/P2b |

## 실행 시 유의 — 모든 디스패치에 붙일 것

P1이 남긴 프로세스 관찰(`docs/superpowers/plans/2026-08-04-p1-carryforward.md` 마지막 절)이 이 단계에도 그대로 적용된다. 요지만 옮긴다.

**P1에서 리뷰가 잡은 것의 대부분은 "코드가 틀렸다"가 아니라 "테스트가 이름이 주장하는 것을 검사하지 않는다"였다.** 실제 사례:

| 사례 | 초록이던 것 | 실제로 검사하지 않던 것 |
|---|---|---|
| 노드 id 해석 | 테스트 50개 | `nodeId`를 한 번도 단언 안 함 — 결함이 그 필드에 있었다 |
| 비밀번호 형식 | 형식 오류 14개 | 전부 "모양이 틀린" 것뿐 — **인증 우회가 44개 초록 뒤에 숨었다** |
| 페이지 재번호 | 재번호 테스트 전부 | 행 이동 분기가 스위트 전체에서 한 번도 실행 안 됨 |
| 중복 이메일 409 | 409 단언 | 409에서 멈춰 세이브포인트 누락을 탐지 불가 |

**따라서 모든 태스크에서 다음 둘을 요구한다.**

1. **자기 테스트마다 "이름이 가리키는 것이 깨져도 이 테스트가 통과하는가"를 묻고, 통과한다면 솔직히 보고한다.** 케이스 목록이 한쪽으로 쏠려 있으면 그 편향이 곧 사각지대다.
2. **변이 검사를 선제적으로 돌린다.** 구현의 핵심 줄을 일부러 깨뜨리고(주석 처리·조건 반전), 어느 테스트가 실패하는지 확인하고, 되돌린다. 보고서에 "무엇을 깨뜨렸고 무엇이 실패했는지"를 적는다. P1에서 이걸 한 두 태스크는 수정 라운드 0으로 통과했다.

**케이스 표 형식.** 반복적인 라우트 테스트는 이 계획이 "행 하나 = `it` 하나"인 표로 준다. 표의 행 수와 `it` 수가 일치해야 하고, 리뷰어가 행별 매핑을 확인한다.

**이 단계의 특별한 함정: 테스트 하네스가 동시성을 재현하지 못한다.** `withApi`는 테스트 하나를 **커넥션 하나, 트랜잭션 하나** 안에서 돌린다. `Promise.all`로 요청을 겹쳐도 직렬화되므로, 그런 테스트는 `SELECT ... FOR UPDATE`가 있든 없든 통과한다 — 실패할 수 없는 테스트다. **`withApi` 안에서 동시성을 주장하는 테스트를 쓰지 않는다.** 진짜 경합은 태스크 9의 전용 파일(실제로 커밋한다)에서만 검증한다.

---

### Task 1: 테스트 하네스·부채 정리

P1 이월 문서의 테스트 부채 8·9·10·11번을 닫는다. 뒤 태스크들이 `pnpm test`를 수십 번 돌리므로 **먼저** 한다 — 지금 `pnpm test`는 매번 두 패키지를 tsdown으로 재빌드한다(타임아웃 300초).

**Files:**
- Modify: `vitest.config.ts`
- Modify: `package.json` (루트)
- Move: `packages/schema/test/dist-loadable.test.ts` → `packages/schema/build-test/dist-loadable.test.ts`
- Modify: `packages/schema/tsconfig.test.json`
- Modify: `apps/api/test/password.test.ts`
- Modify: `apps/api/test/auth-routes.test.ts`
- Create: `apps/api/test/auth-timing.test.ts`

**Interfaces:**
- Consumes: 없음 (첫 태스크)
- Produces: `pnpm test`가 빌드를 타지 않는다. `pnpm test:build`가 빌드 검증을 담당한다.

- [ ] **Step 1: `dist-loadable` 테스트를 빌드 전용 프로젝트로 분리**

파일을 `packages/schema/test/` 밖으로 옮긴다 — `unit` 프로젝트의 `include`(`packages/*/test/**`)가 더 이상 매칭하지 않게 하기 위해서다. `exclude` 패턴을 추가하는 방식은 쓰지 않는다(include와 exclude 두 곳을 동기화해야 해서 조용히 어긋난다).

```bash
git mv packages/schema/test/dist-loadable.test.ts packages/schema/build-test/dist-loadable.test.ts
```

옮긴 파일 안의 상대 경로 두 개(`repoRoot`, `playground`)를 **한 단계 조정해야 한다** — 원래 `test/`에서 `../../..`가 저장소 루트였고, `build-test/`도 깊이가 같으므로 **그대로 맞는다**. 그래도 반드시 실행해서 확인한다(경로가 틀리면 `execFileSync`가 엉뚱한 cwd에서 돌아 조용히 이상하게 실패한다).

`vitest.config.ts`의 `projects` 배열에 세 번째 항목을 더한다:

```ts
      {
        ...shared,
        test: {
          name: 'build',
          include: ['packages/*/build-test/**/*.test.ts'],
          // tsdown 재빌드를 beforeAll에서 돈다. 기본 테스트 실행에서 분리한 이유:
          // pnpm test가 PATH의 pnpm과 전체 재빌드에 묶이면 개발 루프가 매번 수십 초씩
          // 느려진다. 이 프로젝트만 `pnpm test:build`로 따로 돌린다.
          testTimeout: 300_000,
          hookTimeout: 300_000,
        },
      },
```

`packages/schema/tsconfig.test.json`의 `include`를 넓힌다:

```json
  "include": ["test", "build-test"],
```

- [ ] **Step 2: 루트 스크립트 분리**

`package.json`(루트)의 `scripts`:

```json
    "test": "vitest run --project unit --project api",
    "test:watch": "vitest --project unit --project api",
    "test:build": "vitest run --project build",
```

`build` 프로젝트는 `pnpm test`에 포함되지 않는다. 대신 `pnpm test:build`가 담당하고, `apps/api/README.md`의 "명령 요약"에 한 줄 추가한다:

```
pnpm test:build                                    # dist 로드 가능성 검증 (패키지 재빌드 포함, 수십 초)
```

- [ ] **Step 3: 두 스크립트가 실제로 갈렸는지 확인**

```bash
pnpm test          # dist-loadable 테스트가 목록에 없어야 하고, 눈에 띄게 빨라야 한다
pnpm test:build    # dist-loadable 두 개만 돌아야 한다
pnpm typecheck     # build-test가 tsconfig에 들어갔는지
```

`pnpm test`의 출력에 `dist-loadable`이 남아 있으면 프로젝트 분리가 안 된 것이다.

- [ ] **Step 4: `password.test.ts`의 비판별 행을 교체**

현재 `it.each` 표(파일 41행 근처)는 네 행 모두 **Node의 `crypto.scrypt`가 자체적으로 거부하는 값**이라, `hashPassword`에서 `validateScryptParams(params)` 호출을 통째로 지워도 전부 통과한다. 즉 이 표는 "쓰기 경로도 읽기 경로와 같은 검증을 쓴다"는 자기 이름을 증명하지 못한다.

두 가지를 함께 고친다:

1. `N: 1000`(2의 거듭제곱이 아님 — Node가 거부한다) 행을 **메모리 상한 행**으로 바꾼다. 메모리 상한(`128 × N × r ≤ 512 MiB`)은 `validateScryptParams`에만 있는 규칙이다.
2. 단언을 **우리 에러 메시지에 매칭**시킨다. Node가 던지는 에러는 영문(`ERR_CRYPTO_INVALID_SCRYPT_PARAMS`)이므로, 이 정규식이 통과했다면 우리 검증이 돌았다는 뜻이다.

```ts
  it.each([
    ['N이 0', { N: 0, r: 8, p: 1 }],
    // Node가 자체적으로 거부하지 않는 유일한 규칙이 메모리 상한이다 —
    // scrypt() 헬퍼가 maxmem을 128*N*r의 두 배로 넉넉히 넘기므로 Node의 maxmem
    // 검사에 걸리지 않는다. 이 행이 표 전체의 판별력을 담당한다.
    ['N·r 조합이 메모리 상한을 넘음', { N: 2 ** 21, r: 8, p: 1 }],
    ['r이 0', { N: 1024, r: 0, p: 1 }],
    ['p가 0', { N: 1024, r: 8, p: 0 }],
  ])(
    '쓰기 경로도 읽기 경로와 같은 검증을 쓴다 — parseEncoded라면 거부할 파라미터(%s)는 해싱 전에 거부한다',
    async (_label, badParams) => {
      // 메시지까지 단언하는 이유: 그냥 rejects.toThrow()면 Node가 던진 영문 에러로도
      // 통과해 버려, validateScryptParams를 지워도 초록이 된다(실제로 P1에서 이 표
      // 전체가 그런 상태였다). 우리 검증 함수의 한국어 메시지를 고정한다.
      await expect(hashPassword('아무비번', badParams)).rejects.toThrow(
        /scrypt 파라미터가 올바르지 않습니다/,
      )
    },
  )
```

- [ ] **Step 5: 변이 검사 — 표가 실제로 판별하는지 확인**

`auth/password.ts`의 `hashPassword`에서 `validateScryptParams(params)` 호출을 주석 처리하고 이 표만 돌린다.

```bash
pnpm vitest run apps/api/test/password.test.ts -t '쓰기 경로도 읽기 경로와'
```

**네 행 전부 실패해야 한다.** 메모리 상한 행은 즉시(할당 시도 없이) 실패해야 한다 — `2**21 × 8 × 256`이 Node의 `maxmem` 허용치를 넘으므로 Node가 먼저 던진다. 만약 그 행이 오래 걸리거나 2GiB를 실제로 할당하려 들면 값을 조정한다(그 경우 보고서에 실제 관측을 적는다). 확인 뒤 주석을 되돌리고 다시 돌려 전부 통과시킨다.

- [ ] **Step 6: 로그인 타이밍 방어 회귀 테스트**

`routes/auth.ts`는 존재하지 않는 이메일로 로그인해도 더미 해시로 `verifyPassword`를 한 번 돌려 응답 시간을 맞춘다(97행 근처). 그 줄을 지워도 지금은 스위트가 초록이다. 타이밍 자체를 재는 단언은 flaky하므로, **그 호출이 실제로 일어나는지**를 스파이로 고정한다.

`apps/api/test/auth-timing.test.ts`를 새로 만든다. 별도 파일인 이유: `vi.mock`은 파일 전체에 적용되므로 `auth-routes.test.ts`의 나머지 테스트에까지 모듈 대체를 걸지 않기 위해서다.

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { signup, withApi } from './helpers'

/**
 * 존재하지 않는 이메일로 로그인해도 서버가 더미 해시로 verifyPassword를 한 번
 * 돌리는지 고정한다(routes/auth.ts). 그 호출이 이메일 존재 여부에 따른 응답
 * 시간 차이를 없애는 유일한 장치인데, 그 줄을 지워도 P1의 스위트는 전부 초록이었다.
 *
 * 시간을 재지 않는다 — 타이밍 단언은 CI 부하에 따라 흔들린다. 대신 "그 경로에서
 * verifyPassword가 정확히 한 번 불린다"는 관측 가능한 사실을 고정한다.
 */
const verifyCalls = vi.fn()

vi.mock('../src/auth/password', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/auth/password')>()
  return {
    ...actual,
    verifyPassword: async (password: string, encoded: string) => {
      verifyCalls(password, encoded)
      return actual.verifyPassword(password, encoded)
    },
  }
})

describe('로그인 타이밍 방어', () => {
  beforeEach(() => {
    verifyCalls.mockClear()
  })

  it('없는 이메일로 로그인해도 verifyPassword를 한 번 돈다', async () => {
    await withApi(async (ctx) => {
      verifyCalls.mockClear()

      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: 'nobody@example.com', password: 'password1234' },
      })

      expect(res.statusCode).toBe(401)
      expect(verifyCalls).toHaveBeenCalledTimes(1)
    })
  })

  it('있는 이메일에 틀린 비밀번호일 때와 호출 횟수가 같다', async () => {
    await withApi(async (ctx) => {
      const { user } = await signup(ctx)
      verifyCalls.mockClear()

      const res = await ctx.app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: user.email, password: '틀린비밀번호1234' },
      })

      expect(res.statusCode).toBe(401)
      expect(verifyCalls).toHaveBeenCalledTimes(1)
    })
  })
})
```

`verifyCalls.mockClear()`를 `withApi` **안에서** 한 번 더 부르는 이유: `signup` 픽스처가 그 전에 해싱 경로를 돌 수 있고, 앱 조립(`buildApp`)이 더미 해시를 만들 때 `hashPassword`를 부르기 때문이다. 실제 로그인 요청 직전에 카운터를 0으로 맞춘다.

- [ ] **Step 7: 변이 검사 — 타이밍 방어 테스트가 판별하는지**

`routes/auth.ts`의 `await verifyPassword(body.password, dummyHash)` 줄을 주석 처리하고 이 파일만 돌린다. **첫 번째 테스트가 실패해야 하고, 두 번째는 통과해야 한다**(있는 이메일 경로는 그 줄과 무관하다). 되돌린다.

- [ ] **Step 8: `password_hash` 부재 단언을 login·`/me`에도 건다**

P1 이월 10번. signup 응답에만 `Object.keys` 단언이 있다. login과 `/me`는 명시적 3컬럼 select라 구조상 안전하지만, 누군가 `selectAll()`로 바꾸는 순간을 잡는 것은 이 단언이다. `apps/api/test/auth-routes.test.ts`의 해당 성공 경로 테스트에 각각 한 줄씩 더한다:

```ts
      expect(Object.keys(res.json()).sort()).toEqual(['email', 'id', 'name'])
```

세 곳(signup·login·me) 모두 같은 형태가 되도록 맞춘다.

- [ ] **Step 9: 전체 확인 후 커밋**

```bash
pnpm test
pnpm test:build
pnpm typecheck
```

```bash
git add vitest.config.ts package.json packages/schema/tsconfig.test.json \
        packages/schema/build-test/dist-loadable.test.ts \
        apps/api/test/password.test.ts apps/api/test/auth-routes.test.ts \
        apps/api/test/auth-timing.test.ts apps/api/README.md
git commit -m "test: 빌드 검증 프로젝트 분리, 비판별 테스트 교체"
```

---

### Task 2: 계층 정리 — `services/` 신설과 `buildMenuTree` 이동

P1 이월 5·6·7번을 닫으면서 `services/` 계층을 연다. 태스크 5의 편집 파이프라인이 그 계층에 들어간다.

**Files:**
- Create: `apps/api/src/services/menu-tree.ts`
- Modify: `apps/api/src/repos/menu.ts` (해당 코드 제거)
- Modify: `apps/api/src/routes/tree.ts` (import 경로)
- Modify: `apps/api/test/menu.test.ts` 또는 트리 관련 테스트의 import 경로
- Modify: `apps/api/test/members.test.ts` (`invitedAt` 형식 고정)
- Create/Modify: `packages/schema/test/validate.test.ts` (`assertValidLayout`)
- Modify: `apps/api/README.md` (계층 규칙)

**Interfaces:**
- Produces: `services/menu-tree.ts`가 `buildMenuTree`·`MenuRow`·`PageRow`·`TreeMenuNode`를 export한다. 시그니처는 **바뀌지 않는다** — 순수 이동이다.

- [ ] **Step 1: `buildMenuTree`를 옮긴다**

`repos/menu.ts`에서 `MenuRow`·`PageRow`·`TreeMenuNode`·`buildMenuTree`(그리고 그 넷만 쓰는 헬퍼가 있다면 함께)를 잘라 `apps/api/src/services/menu-tree.ts`로 옮긴다. **본문과 주석을 한 글자도 바꾸지 않는다** — 이동이 순수 이동인지 리뷰어가 `git diff -M`으로 확인할 수 있어야 한다.

새 파일 맨 위에 파일 헤더를 붙인다:

```ts
/**
 * 메뉴 트리 조립. `repos/menu.ts`에서 옮겨 왔다.
 *
 * 이 함수는 SQL을 한 줄도 쓰지 않는 **순수 함수**다 — 호출자가 이미 조회해 둔
 * 평평한 행 배열 두 개를 받아 메모리에서 트리를 만든다. 원래 `repos/menu.ts`에
 * 있었던 이유는 "라우트는 SQL을 직접 쓰지 않는다"는 계층 규칙을 만족시키기
 * 위해서였는데, SQL이 없으므로 그 규칙이 애초에 적용되지 않았다.
 *
 * `services/`는 SQL을 직접 쓰지 않고 HTTP도 모르는 계층이다 — 순수 도메인 함수와
 * repo 조율이 여기 산다.
 */
```

`repos/menu.ts`가 이 타입들을 내부에서 쓰고 있다면 `services/menu-tree.ts`에서 import한다(역방향 의존이 아니다 — `repos`가 순수 함수를 쓰는 것은 괜찮다). 쓰지 않는다면 import를 만들지 않는다.

- [ ] **Step 2: import 경로 갱신 후 확인**

```bash
pnpm typecheck
pnpm vitest run --project api
```

`routes/tree.ts`와 관련 테스트가 새 경로를 본다. **테스트 파일의 `describe` 이름이나 단언은 바꾸지 않는다** — 이동이므로 동작이 같아야 한다.

- [ ] **Step 3: `invitedAt`의 직렬화 형식을 고정한다**

P1 이월 6번. `apps/api/test/members.test.ts:98` 근처가 키 존재만 단언한다. P2b가 이 값을 파싱하므로 형식을 못 박는다. `repos/members.ts`가 `Date`를 그대로 돌려주고 Fastify의 JSON 직렬화가 ISO 8601로 만드는 구조이므로, 그 결과를 단언한다:

```ts
      // P2b가 이 값을 Date로 파싱한다. Fastify가 Date를 ISO 8601(UTC, `Z` 접미)로
      // 직렬화하는 데 의존하고 있으므로, 그 의존을 여기서 고정한다 — repos가
      // Date 대신 문자열이나 epoch 숫자를 돌려주도록 바뀌면 이 단언이 실패한다.
      expect(member.invitedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
      expect(Number.isNaN(Date.parse(member.invitedAt))).toBe(false)
```

- [ ] **Step 4: `assertValidLayout` 테스트**

P1 이월 7번. `assertValidPage`에는 테스트가 있고 `assertValidLayout`에는 없다. `packages/schema/test/validate.test.ts`에 `assertValidPage` 테스트 바로 옆에 대칭으로 붙인다:

```ts
  it('assertValidLayout은 Slot이 정확히 하나인 레이아웃을 통과시킨다', () => {
    const layout: LayoutDocument = {
      version: 1,
      root: { id: 'n_lay000000001', type: 'Page', children: [{ id: 'n_slot00000001', type: 'Slot' }] },
    }
    expect(() => assertValidLayout(layout)).not.toThrow()
  })

  it('assertValidLayout은 Slot이 없으면 첫 이슈를 메시지에 담아 던진다', () => {
    const layout: LayoutDocument = {
      version: 1,
      root: { id: 'n_lay000000002', type: 'Page', children: [] },
    }
    expect(() => assertValidLayout(layout)).toThrow(/slot-count/)
  })
```

기존 `assertValidPage` 테스트가 쓰는 노드 id 형식·import 관례를 그대로 따른다. `n_` + hex 12자가 아니어도 `NODE_ID_PATTERN`(`/^[A-Za-z0-9_-]{1,64}$/`)은 통과하지만, 파일의 기존 관례에 맞춘다.

- [ ] **Step 5: README의 계층 규칙에 `services/`를 넣는다**

`apps/api/README.md`의 "계층 규칙" 절 첫 번째 불릿을 갱신한다:

```md
- `repos/`는 SQL만 안다 — HTTP·zod를 모른다. `services/`는 SQL을 직접 쓰지 않고
  HTTP도 모른다 — 순수 도메인 함수(`menu-tree.ts`)와 여러 repo를 조율하는 로직
  (`edit-pipeline.ts`)이 여기 산다. `routes/`는 HTTP·zod만 다루고 SQL을 직접
  쓰지 않는다. API가 주고받는 키는 camelCase, DB 컬럼은 snake_case이고, 그 변환은
  항상 `repos/`가 전담한다.
```

(`edit-pipeline.ts`는 태스크 5가 만든다. 이 줄을 지금 쓰는 이유는 계층 정의가 한 번에 완결되게 하기 위해서다.)

- [ ] **Step 6: 확인 후 커밋**

```bash
pnpm test && pnpm typecheck
git add apps/api/src/services/menu-tree.ts apps/api/src/repos/menu.ts apps/api/src/routes/tree.ts \
        apps/api/test apps/api/README.md packages/schema/test/validate.test.ts
git status   # stage 목록에 내가 안 건드린 파일이 있으면 멈춘다
git commit -m "refactor: services 계층 신설, buildMenuTree 이동"
```

---

### Task 3: 마이그레이션 0005 — `revisions` 테이블과 `pages.head_seq`

**Files:**
- Create: `apps/api/src/db/migrations/0005-revisions.ts`
- Modify: `apps/api/src/db/migrations/index.ts`
- Modify: `apps/api/src/db/types.ts`
- Modify: `apps/api/src/repos/pages.ts` (`PageRecord.headSeq`, `PAGE_COLUMNS`, `toRecord`)
- Modify: `apps/api/src/routes/pages.ts` (`toResponse`)
- Modify: `apps/api/test/pages.test.ts` (응답 키 단언)
- Create: `apps/api/test/revisions-schema.test.ts`

**Interfaces:**
- Consumes: `db/tx.ts`의 `DbHandle`, `db/types.ts`의 `Database`
- Produces:
  - `RevisionsTable`·`RevisionActorType`(`db/types.ts`)
  - `PagesTable.head_seq`
  - `PageRecord.headSeq: number`
  - 페이지 응답에 `headSeq: number` 필드 추가

- [ ] **Step 1: 실패하는 테스트를 먼저 쓴다**

`apps/api/test/revisions-schema.test.ts`:

```ts
import { sql } from 'kysely'
import { describe, expect, it } from 'vitest'
import { withTransaction } from '../src/db/tx'
import { createMenuNode, createPage, createProject, signup, withApi } from './helpers'

/**
 * 마이그레이션 0005가 만든 스키마의 성질을 고정한다. 라우트가 아니라 **테이블**을
 * 검사하는 테스트다 — 제약이 실제로 DB에 걸려 있는지는 SQL을 직접 던져야만 알 수 있다.
 *
 * 제약 위반을 유발하는 조작은 전부 `withTransaction`으로 감싼다. 감싸지 않으면 그
 * 실패가 `withApi`의 트랜잭션 전체를 aborted(`25P02`)로 만들어, 같은 테스트 안의
 * 이후 단언이 실제 내용과 무관하게 전부 무너진다(`src/db/tx.ts` 참고).
 */
describe('revisions 스키마', () => {
  it('페이지를 만들면 head_seq가 0이다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const page = await createPage(ctx, owner.cookie, project.id, menu.id)

      const row = await ctx.db
        .selectFrom('pages')
        .select('head_seq')
        .where('id', '=', page.id)
        .executeTakeFirstOrThrow()

      // pg는 int8(bigint)을 정밀도 손실을 피하려고 문자열로 준다. 이 사실이
      // db/types.ts의 컬럼 타입(`ColumnType<string, ...>`)과 repos의 Number()
      // 변환이 서 있는 근거이므로, 추측이 아니라 여기서 고정한다.
      expect(typeof row.head_seq).toBe('string')
      expect(Number(row.head_seq)).toBe(0)
    })
  })

  it('(page_id, seq)가 유니크다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const page = await createPage(ctx, owner.cookie, project.id, menu.id)

      const insert = (seq: number) =>
        withTransaction(ctx.db, (trx) =>
          trx
            .insertInto('revisions')
            .values({
              page_id: page.id,
              seq,
              actor_type: 'user',
              actor_id: owner.user.id,
              actor_label: owner.user.name,
              ops: JSON.stringify([]),
              inverse: JSON.stringify([]),
            })
            .execute(),
        )

      await insert(1)
      await expect(insert(1)).rejects.toThrow()

      // 위 실패가 세이브포인트로 격리됐다는 증거: 같은 트랜잭션에서 다음 문장이 산다.
      // withTransaction이 없다면 이 조회가 25P02로 죽는다.
      const rows = await ctx.db.selectFrom('revisions').select('seq').where('page_id', '=', page.id).execute()
      expect(rows).toHaveLength(1)
    })
  })

  it("actor_type이 'user'인데 actor_id가 없으면 거부한다", async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const page = await createPage(ctx, owner.cookie, project.id, menu.id)

      await expect(
        withTransaction(ctx.db, (trx) =>
          trx
            .insertInto('revisions')
            .values({
              page_id: page.id,
              seq: 1,
              actor_type: 'user',
              actor_id: null,
              actor_label: '이름',
              ops: JSON.stringify([]),
              inverse: JSON.stringify([]),
            })
            .execute(),
        ),
      ).rejects.toThrow()
    })
  })

  it('actor_type이 세 값 밖이면 거부한다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const page = await createPage(ctx, owner.cookie, project.id, menu.id)

      await expect(
        withTransaction(ctx.db, (trx) =>
          sql`insert into revisions (page_id, seq, actor_type, actor_id, actor_label, ops, inverse)
              values (${page.id}, 1, 'robot', ${owner.user.id}, '이름', '[]'::jsonb, '[]'::jsonb)`.execute(trx),
        ),
      ).rejects.toThrow()
    })
  })

  it('페이지를 지우면 그 revision도 함께 사라진다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const page = await createPage(ctx, owner.cookie, project.id, menu.id)

      await ctx.db
        .insertInto('revisions')
        .values({
          page_id: page.id,
          seq: 1,
          actor_type: 'user',
          actor_id: owner.user.id,
          actor_label: owner.user.name,
          ops: JSON.stringify([]),
          inverse: JSON.stringify([]),
        })
        .execute()

      const res = await ctx.app.inject({
        method: 'DELETE',
        url: `/api/projects/${project.id}/pages/${page.id}`,
        cookies: owner.cookie,
      })
      expect(res.statusCode).toBe(204)

      const rows = await ctx.db.selectFrom('revisions').select('id').where('page_id', '=', page.id).execute()
      expect(rows).toHaveLength(0)
    })
  })
})
```

- [ ] **Step 2: 실패를 확인한다**

```bash
pnpm vitest run apps/api/test/revisions-schema.test.ts
```

기대: `revisions` 테이블도 `head_seq` 컬럼도 없으므로 타입 오류 또는 SQL 오류로 전부 실패.

- [ ] **Step 3: 마이그레이션을 쓴다**

`apps/api/src/db/migrations/0005-revisions.ts`:

```ts
import type { Kysely, Migration } from 'kysely'
import { sql } from 'kysely'

/**
 * `revisions` 테이블과 `pages.head_seq`를 만든다 — 설계 §4.2·§7.1의 편집 이력이다.
 *
 * `page_id`는 `pages(id)`를 `ON DELETE CASCADE`로 참조한다. 페이지를 지우면 그
 * 이력도 함께 사라진다 — 과거 상태의 보존은 스냅샷(P6, payload를 통째로 저장)의
 * 책임이지 revision 로그의 책임이 아니다. 이 CASCADE 덕분에 `repos/pages.ts`의
 * `deletePage`는 revision을 따로 지우지 않는다.
 *
 * `seq`는 페이지별 단조 증가 정수다. 전역 시퀀스를 쓰지 않는 이유: 클라이언트가
 * `baseSeq`로 보내는 값이 "이 페이지에서 내가 아는 마지막 변경"이어야 의미가
 * 있기 때문이다. 채번은 `services/edit-pipeline.ts`가 `pages` 행을
 * `SELECT ... FOR UPDATE`로 잠근 상태에서 `head_seq + 1`로 한다 — 그 행 잠금이
 * 페이지별 직렬화 지점이고, `(page_id, seq)` UNIQUE가 그 규약이 깨졌을 때의
 * 마지막 방어선이다.
 *
 * `bigint`인 이유는 설계 §4.2가 그렇게 정했기 때문이다. `pg`는 int8을 정밀도
 * 손실을 피하려고 **문자열**로 주므로, `db/types.ts`의 컬럼 타입이 그 비대칭을
 * 그대로 드러내고(`ColumnType<string, number, never>`) `repos/`가 경계에서
 * `Number()`로 바꾼다.
 *
 * CHECK 두 개:
 * - `actor_type`은 `'user'|'mcp'|'cli'`뿐이다(설계 §4.2). `'mcp'`·`'cli'`를 쓰는
 *   코드는 아직 없지만(P9), 값 집합을 지금 고정해 두면 나중에 마이그레이션이
 *   필요 없다.
 * - `actor_type = 'user'`면 `actor_id`가 반드시 있어야 한다. 사람의 편집인데
 *   누구인지 모르는 행은 개인 undo 스택을 재구성할 수 없게 만든다.
 *
 * `actor_id`에 FK를 걸지 않는다. `'user'`일 때는 `users(id)`를 가리키지만
 * `'mcp'`·`'cli'`일 때는 `api_tokens(id)`(P9)를 가리키게 되므로, 한 컬럼이 두
 * 테이블을 참조하는 형태에는 FK를 걸 수 없다.
 *
 * 인덱스 두 개:
 * - `(page_id, seq)` UNIQUE — 채번 규약이자 "이 페이지의 이력을 seq 순으로"라는
 *   기본 조회 패턴을 그대로 덮는다.
 * - `(page_id, actor_id, seq DESC)` — `GET .../revisions?mine=true`(설계 §7.3의
 *   새로고침 시 undo 스택 재구성)가 정확히 이 형태로 조회한다.
 */
export const migration: Migration = {
  async up(db: Kysely<unknown>): Promise<void> {
    await db.schema
      .createTable('revisions')
      .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
      .addColumn('page_id', 'uuid', (col) => col.notNull().references('pages.id').onDelete('cascade'))
      .addColumn('seq', 'bigint', (col) => col.notNull())
      .addColumn('actor_type', 'text', (col) => col.notNull())
      .addColumn('actor_id', 'uuid')
      .addColumn('actor_label', 'text', (col) => col.notNull())
      .addColumn('ops', 'jsonb', (col) => col.notNull())
      .addColumn('inverse', 'jsonb', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull().defaultTo(sql`now()`))
      .addCheckConstraint('revisions_actor_type_check', sql`actor_type in ('user', 'mcp', 'cli')`)
      .addCheckConstraint('revisions_user_actor_id_check', sql`actor_type <> 'user' or actor_id is not null`)
      .execute()

    await db.schema
      .createIndex('revisions_page_seq_idx')
      .on('revisions')
      .columns(['page_id', 'seq'])
      .unique()
      .execute()

    await sql`create index revisions_page_actor_seq_idx on revisions (page_id, actor_id, seq desc)`.execute(db)

    // 기존 행은 DEFAULT 0으로 채워진다 — "이력이 비어 있다"의 정의가 head_seq = 0이다.
    await db.schema
      .addColumn('head_seq', 'bigint', (col) => col.notNull().defaultTo(0))
      .alterTable('pages')
      .execute()
  },

  // 인덱스는 테이블과 함께 사라지므로 따로 DROP하지 않는다. `pages.head_seq`는
  // 테이블이 남으므로 명시적으로 되돌린다.
  async down(db: Kysely<unknown>): Promise<void> {
    await db.schema.dropTable('revisions').execute()
    await db.schema.alterTable('pages').dropColumn('head_seq').execute()
  },
}
```

**주의:** 위 `up`의 `addColumn(...).alterTable('pages')` 순서는 Kysely의 빌더 API에 맞지 않을 수 있다. 올바른 형태는 `db.schema.alterTable('pages').addColumn('head_seq', 'bigint', (col) => col.notNull().defaultTo(0)).execute()`다. **구현자가 실제로 컴파일·실행해 확인하고 맞는 형태로 고친다.** `createIndex(...).unique()`의 위치, `addCheckConstraint`의 존재 여부도 마찬가지로 실제 Kysely 0.28 API로 확인한다 — 계획의 빌더 체인을 그대로 믿지 말고 타입 체크와 실제 마이그레이션 실행으로 검증한다.

`index.ts`에 등록한다:

```ts
import { migration as m0005 } from './0005-revisions'
// ...
  '0005-revisions': m0005,
```

- [ ] **Step 4: `db/types.ts`에 테이블을 더한다**

```ts
/** revision을 만든 주체의 종류. 설계 §4.2. `'mcp'`·`'cli'`는 P9가 쓴다. */
export type RevisionActorType = 'user' | 'mcp' | 'cli'

/**
 * 페이지 편집 이력(태스크 3). append-only다 — UPDATE도 DELETE도 하지 않는다
 * (페이지 삭제 시의 CASCADE만 예외).
 *
 * `seq`는 `bigint`다. `pg`가 int8을 문자열로 주므로 select 타입이 `string`이고,
 * insert는 `number`를 받는다(Postgres가 캐스트한다). update는 `never`다 —
 * 이 컬럼은 만들어진 뒤 절대 바뀌지 않으므로, 바꾸려는 코드를 컴파일러가 막는다.
 *
 * `ops`·`inverse`는 `JSONColumnType<PatchOp[]>`, 즉 `ColumnType<PatchOp[], string, string>`이다 —
 * `PagesTable.schema`와 같은 비대칭이다: 삽입 시엔 `JSON.stringify`한 문자열,
 * 조회 시엔 파싱된 배열.
 */
export interface RevisionsTable {
  id: Generated<string>
  page_id: string
  seq: ColumnType<string, number, never>
  actor_type: RevisionActorType
  /** `actor_type`이 `'user'`면 `users.id`. FK는 걸지 않는다(마이그레이션 0005 주석 참고). */
  actor_id: string | null
  /** 편집 시점의 표시 이름 스냅샷. 사용자가 이름을 바꿔도 이력의 표시는 그대로다. */
  actor_label: string
  ops: JSONColumnType<PatchOp[]>
  inverse: JSONColumnType<PatchOp[]>
  created_at: Generated<Date>
}
```

`PatchOp`를 `@wirebound/schema`에서 import한다(`import type { PageDocument, PatchOp } from '@wirebound/schema'`).

`PagesTable`에 컬럼을 더한다:

```ts
  /**
   * 이 페이지의 최신 revision seq. 클라이언트가 patch를 보낼 때 `baseSeq`로 쓴다
   * (설계 §4.2). `0`은 "아직 편집 이력이 없다"는 뜻이다. `seq`와 같은 이유로
   * select 타입이 `string`이고, insert는 생략 가능하다(DEFAULT 0).
   */
  head_seq: ColumnType<string, number | undefined, number>
```

`Database`에 `revisions: RevisionsTable`을 더한다.

- [ ] **Step 5: `PageRecord`에 `headSeq`를 노출한다**

`repos/pages.ts`:
- `PAGE_COLUMNS`에 `'head_seq'`를 더한다.
- `PageRow`에 `head_seq: string`을 더한다.
- `PageRecord`에 `headSeq: number`를 더한다.
- `toRecord`에 `headSeq: Number(row.head_seq)`를 더한다. **주석으로 왜 `Number()`인지 한 줄 남긴다**(D9).

`routes/pages.ts`의 `toResponse`에 `headSeq: page.headSeq`를 더한다.

- [ ] **Step 6: 기존 테스트를 맞춘다**

`apps/api/test/pages.test.ts`에 페이지 응답의 키 집합을 단언하는 테스트가 있다면 `headSeq`를 넣어 갱신한다. 없다면 **하나 추가한다** — 응답 계약이 지금부터 P2b의 근거가 되므로 고정할 값이 있다:

```ts
  it('페이지 응답은 계약된 키만 담는다', async () => {
    await withApi(async (ctx) => {
      const owner = await signup(ctx)
      const project = await createProject(ctx, owner.cookie)
      const menu = await createMenuNode(ctx, owner.cookie, project.id)
      const page = await createPage(ctx, owner.cookie, project.id, menu.id)

      const res = await ctx.app.inject({
        method: 'GET',
        url: `/api/projects/${project.id}/pages/${page.id}`,
        cookies: owner.cookie,
      })

      expect(res.statusCode).toBe(200)
      expect(Object.keys(res.json()).sort()).toEqual(
        ['description', 'headSeq', 'id', 'menuNodeId', 'schema', 'schemaVersion', 'sortOrder', 'title'].sort(),
      )
      // projectId가 새어 나가지 않는다 — 경로에 이미 있고, 응답 계약에 없다.
      expect(res.json()).not.toHaveProperty('projectId')
      expect(res.json().headSeq).toBe(0)
    })
  })
```

- [ ] **Step 7: 마이그레이션 up/down 왕복을 확인한다**

`test/global-setup.ts`가 전체 실행 전 latest → none → latest를 한 사이클 돈다. 즉 `down`이 깨져 있으면 스위트 전체가 죽는다. 직접 확인한다:

```bash
pnpm vitest run --project api
```

- [ ] **Step 8: 변이 검사**

- `revisions_user_actor_id_check` CHECK 제약을 마이그레이션에서 지우고 → 세 번째 테스트가 실패해야 한다.
- `(page_id, seq)`의 `.unique()`를 지우고 → 두 번째 테스트가 실패해야 한다.
- `toRecord`의 `Number(row.head_seq)`를 `row.head_seq`로 바꾸고 → 응답 키 테스트의 `toBe(0)`이 실패해야 한다(`'0' !== 0`).

전부 되돌리고 다시 초록을 확인한다.

- [ ] **Step 9: 커밋**

```bash
pnpm test && pnpm typecheck
git add apps/api/src/db apps/api/src/repos/pages.ts apps/api/src/routes/pages.ts apps/api/test
git status
git commit -m "feat(db): revisions 테이블과 pages.head_seq 추가"
```

---

### Task 4: `repos/revisions.ts`와 페이지 편집용 저장소 함수

파이프라인(태스크 5)이 쓸 SQL 조각들을 만든다. 이 태스크는 **SQL만** 다룬다 — 검증도, 패치 적용도, HTTP도 없다.

**Files:**
- Create: `apps/api/src/repos/revisions.ts`
- Create: `apps/api/src/db/nul-guard.ts`
- Modify: `apps/api/src/repos/pages.ts` (`lockPageForEdit`·`writePageSchemaAtSeq` 추가. `updatePageSchema`는 그대로 둔다 — 태스크 7이 지운다)
- Modify: `apps/api/src/routes/pages.ts` (`containsNulByte` 정의를 제거하고 `db/nul-guard.ts`에서 import. 그 밖에는 손대지 않는다)
- Create: `apps/api/test/repos-revisions.test.ts`

**Interfaces:**
- Consumes: `db/tx.ts`의 `DbHandle`·`withTransaction`, `db/types.ts`의 `RevisionActorType`
- Produces:

```ts
// db/nul-guard.ts
export function containsNulByte(value: unknown): boolean

// repos/revisions.ts
export interface RevisionActor {
  type: RevisionActorType
  id: string | null
  label: string
}

export interface RevisionRecord {
  id: string
  seq: number
  actorType: RevisionActorType
  actorId: string | null
  actorLabel: string
  ops: PatchOp[]
  inverse: PatchOp[]
  createdAt: Date
}

export interface InsertRevisionInput {
  pageId: string
  seq: number
  actor: RevisionActor
  ops: PatchOp[]
  inverse: PatchOp[]
}

export async function insertRevision(trx: DbHandle, input: InsertRevisionInput): Promise<RevisionRecord>

export interface ListRevisionsOptions {
  /** 주면 `actor_type = 'user' AND actor_id = <이 값>`으로 좁힌다. */
  actorId?: string
  limit: number
}

export async function listRevisions(
  db: DbHandle,
  pageId: string,
  options: ListRevisionsOptions,
): Promise<RevisionRecord[]>

// repos/pages.ts (추가)
export interface LockedPage {
  id: string
  schema: PageDocument
  schemaVersion: number
  headSeq: number
}

export async function lockPageForEdit(
  trx: DbHandle,
  projectId: string,
  pageId: string,
): Promise<LockedPage | null>

export async function writePageSchemaAtSeq(
  trx: DbHandle,
  pageId: string,
  schema: PageDocument,
  schemaVersion: number,
  headSeq: number,
): Promise<void>
```

- [ ] **Step 1: `containsNulByte`를 옮긴다**

`routes/pages.ts`의 `NUL_CHAR` 상수와 `containsNulByte` 함수(그리고 그 둘의 독스트링 전체)를 `apps/api/src/db/nul-guard.ts`로 **그대로** 옮긴다. `containsNulByte`를 export한다. `routes/pages.ts`는 import로 바꾼다.

새 파일 헤더:

```ts
/**
 * Postgres의 text/jsonb가 NUL(U+0000)을 담지 못하는 제약을 애플리케이션 경계에서
 * 막는다. 브라우저에서도 도는 `@wirebound/schema`가 아니라 여기(Postgres를 아는
 * 계층)에 있는 이유이기도 하다.
 *
 * `db/`에 두는 이유: 이 함수의 존재 이유가 순전히 Postgres의 저장 제약이고,
 * 호출자는 `routes/`와 `services/` 양쪽이기 때문이다.
 */
```

- [ ] **Step 2: 저장소 테스트를 먼저 쓴다**

`apps/api/test/repos-revisions.test.ts`. 라우트를 거치지 않고 저장소 함수를 직접 부른다.

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `insertRevision은 넣은 값을 그대로 돌려준다` | 반환 `RevisionRecord`의 모든 필드가 입력과 일치. `seq`가 `number`(문자열 아님) |
| 2 | `insertRevision이 넣은 ops·inverse는 조회 시 배열로 돌아온다` | `listRevisions`로 다시 읽어 `toEqual` 비교 (jsonb 왕복) |
| 3 | `listRevisions는 seq 내림차순이다` | seq 1,2,3을 넣고 `[3,2,1]` |
| 4 | `listRevisions는 limit을 지킨다` | 5개 중 `limit: 2` → 2개, 그리고 그 둘이 `[5,4]` |
| 5 | `listRevisions의 actorId는 그 사용자 것만 고른다` | 두 사용자 것을 섞어 넣고 한쪽만 |
| 6 | `listRevisions는 다른 페이지의 revision을 섞지 않는다` | 페이지 두 개 |
| 7 | `lockPageForEdit은 다른 프로젝트의 페이지에 null을 준다` | `projectId`를 바꿔 호출 |
| 8 | `lockPageForEdit이 준 headSeq는 number다` | `typeof === 'number'` |
| 9 | `writePageSchemaAtSeq는 schema·schema_version·head_seq·updated_at을 함께 갱신한다` | 네 컬럼 전부 확인. `updated_at`은 이전보다 크거나 같다 |
| 10 | `writePageSchemaAtSeq는 title·menu_node_id를 건드리지 않는다` | 두 값이 그대로 |

**케이스 3·4의 판별력에 주의.** seq를 `1,2,3` 순서로 넣고 `[3,2,1]`을 기대하면 `ORDER BY` 절을 지웠을 때 Postgres가 우연히 삽입 순서로 돌려줘 통과할 수 있다. **삽입 순서를 정렬 순서와 다르게** 만든다 — 예: seq를 `2, 5, 1, 4, 3` 순서로 넣고 `[5,4,3,2,1]`을 기대한다.

각 `it`은 `withApi`로 감싸고, `signup`/`createProject`/`createMenuNode`/`createPage` 픽스처로 페이지를 만든다.

- [ ] **Step 3: 실패를 확인한다**

```bash
pnpm vitest run apps/api/test/repos-revisions.test.ts
```

- [ ] **Step 4: `repos/revisions.ts`를 구현한다**

계약:

- 파일 헤더에 "이 파일은 SQL만 안다"와 "`revisions`는 append-only다 — UPDATE·DELETE 문장이 이 파일에 없다"를 적는다.
- `insertRevision`은 `withTransaction(trx, ...)`으로 감싼다. `(page_id, seq)` UNIQUE 위반과 `ops`/`inverse` jsonb 캐스팅 실패(NUL) 둘 다 제약 위반이므로, 세이브포인트 없이 실패하면 호출자 트랜잭션이 오염된다(Global Constraints).
- `ops`·`inverse`는 `JSON.stringify`해서 넣는다(컬럼 타입이 그 비대칭을 명시한다).
- `.returning([...])`으로 넣은 행을 그대로 받아 `RevisionRecord`로 변환한다 — 별도 SELECT를 돌지 않는다.
- `seq`는 반환·조회 모두 `Number(row.seq)`로 바꾼다. 그 이유를 한 줄 주석으로 남긴다.
- `listRevisions`는 `options.actorId`가 있으면 `.where('actor_type', '=', 'user').where('actor_id', '=', options.actorId)`를 건다. `actor_type` 조건을 함께 거는 이유: `actor_id`는 `'mcp'`·`'cli'`일 때 `api_tokens.id`를 가리키므로(마이그레이션 0005), 값이 우연히 겹치면 남의 이력이 섞인다. **오늘은 겹칠 수 없지만 P9에서 겹칠 수 있다.**
- `listRevisions`는 `.orderBy('seq', 'desc').limit(options.limit)`.

- [ ] **Step 5: `repos/pages.ts`에 편집용 함수 둘을 더한다**

`lockPageForEdit` 계약:
- **`withTransaction`으로 감싸지 않는다.** 이 함수는 `trx`를 받아 그 트랜잭션 안에서 잠금을 건다 — 세이브포인트로 감싸면 안 되는 게 아니라(잠금은 세이브포인트 롤백으로 풀리지 않는다) 감쌀 이유가 없다. SELECT 하나뿐이라 제약 위반이 날 수 없다. 파라미터 이름을 `db`가 아니라 `trx`로 두어 "이미 트랜잭션 안"이라는 전제를 드러낸다.
- `SELECT id, schema, schema_version, head_seq FROM pages WHERE id = ? AND project_id = ? FOR UPDATE`. Kysely에서는 `.forUpdate()`.
- 없으면 `null`.
- **호출자가 트랜잭션 밖에서 부르면 잠금이 즉시 풀린다.** 이 사실을 독스트링에 크게 적는다. 방어적으로 `if (!trx.isTransaction) throw new Error(...)`를 넣는다 — 잘못 쓰면 조용히 동시성 방어가 사라지는 종류의 실수이므로 크게 실패하게 만든다.

`writePageSchemaAtSeq` 계약:
- 역시 `trx`를 받고 트랜잭션 전제를 확인한다.
- `schema`·`schema_version`·`head_seq`·`updated_at = now()` 넷을 갱신한다.
- 반환값 없음(`void`). 호출자(파이프라인)가 이미 결과 문서를 갖고 있다.
- `withTransaction`으로 감싼다 — `schema::jsonb` 캐스팅이 NUL로 실패할 수 있다(`updatePageSchema`가 그랬던 것과 같은 이유). 파이프라인이 사전에 막지만, 방어선은 남긴다.

**`updatePageSchema`는 이 태스크에서 손대지 않는다.** 그대로 남겨 둔다 — `routes/pages.ts`의 `PUT .../schema`가 아직 그것을 쓰고 있고, 태스크 7이 그 라우트를 파이프라인으로 옮기면서 함수까지 함께 지운다.

> **왜 지금 지우지 않는가.** 지금 지우면 라우트가 임시로 `withTransaction`·`lockPageForEdit`·`writePageSchemaAtSeq`를 직접 부르게 되는데, 그것은 Global Constraints의 계층 규칙("`routes/`는 SQL을 직접 쓰지 않는다")을 정면으로 어긴다. 한 태스크의 편의를 위해 프로젝트의 계층 규칙을 임시로 깨뜨리는 것은 값이 없다 — 태스크 7의 Step 3이 "`updatePageSchema`가 코드베이스에 남아 있지 않다"를 명시적으로 확인하므로, 잊힐 위험은 그쪽에서 닫힌다.

`updatePageSchema`의 독스트링에 담긴 지식(NUL → `22P05`, 세이브포인트가 필요한 이유)은 **복사해서** `writePageSchemaAtSeq`에도 남긴다. 태스크 7이 원본을 지울 때 그 지식이 함께 사라지면 안 된다.

- [ ] **Step 6: 테스트를 통과시키고 변이 검사**

```bash
pnpm vitest run apps/api/test/repos-revisions.test.ts
pnpm test && pnpm typecheck
```

변이 검사:
- `listRevisions`의 `.orderBy('seq', 'desc')`를 지우고 → 케이스 3·4가 실패해야 한다. (실패하지 않으면 삽입 순서가 정렬 순서와 같다는 뜻이므로 Step 2로 돌아가 데이터를 고친다.)
- `listRevisions`의 `actor_type` 조건만 지우고 → 케이스 5는 오늘 통과한다(값이 겹치지 않으므로). **이건 예상된 결과다** — 보고서에 "이 조건은 P9를 위한 방어이고 오늘 판별하는 테스트가 없다"고 적는다.
- `lockPageForEdit`의 `.forUpdate()`를 지우고 → **어떤 테스트도 실패하지 않아야 정상이다**(`withApi`가 단일 트랜잭션이므로). 이 사실을 보고서에 적는다. 태스크 9가 이것을 진짜로 검증한다.

- [ ] **Step 7: 커밋**

```bash
git add apps/api/src/db/nul-guard.ts apps/api/src/repos apps/api/src/routes/pages.ts apps/api/test
git status
git commit -m "feat(repos): revision 저장소와 페이지 편집용 잠금·기록 함수"
```

---

### Task 5: `services/edit-pipeline.ts`

이 단계의 핵심이다. 편집 요청 하나가 거치는 전 과정이 이 함수 하나에 있다.

**Files:**
- Create: `apps/api/src/services/edit-pipeline.ts`
- Create: `apps/api/test/edit-pipeline.test.ts`

**Interfaces:**
- Consumes: `repos/pages.ts`의 `lockPageForEdit`·`writePageSchemaAtSeq`, `repos/revisions.ts`의 `insertRevision`·`RevisionActor`, `db/nul-guard.ts`의 `containsNulByte`, `db/tx.ts`의 `withTransaction`, `@wirebound/schema`의 `applyOps`·`invertOps`·`migrateDocument`·`validatePage`·`PatchError`·`PatchOp`·`ValidationIssue`
- Produces:

```ts
export interface ApplyEditInput {
  projectId: string
  pageId: string
  /** 클라이언트가 아는 마지막 seq. 페이지의 현재 head_seq와 정확히 같아야 한다. */
  baseSeq: number
  ops: PatchOp[]
  actor: RevisionActor
}

export type EditOutcome =
  | {
      ok: true
      seq: number
      revisionId: string
      inverse: PatchOp[]
      schema: PageDocument
      schemaVersion: number
    }
  | { ok: false; reason: 'not-found' }
  | { ok: false; reason: 'stale'; headSeq: number }
  | { ok: false; reason: 'patch-failed'; path: string; message: string }
  | { ok: false; reason: 'invalid'; issues: ValidationIssue[] }
  | { ok: false; reason: 'unsupported-version'; message: string }
  | { ok: false; reason: 'nul-byte' }

export async function applyEdit(db: DbHandle, input: ApplyEditInput): Promise<EditOutcome>
```

**왜 예외가 아니라 판별 유니온인가.** 실패 사유가 여섯 가지이고 각각 다른 HTTP 상태로 간다. 예외 클래스를 여섯 개 만들면 호출자가 `instanceof` 사슬을 타야 하고, 하나를 빠뜨려도 컴파일러가 잡아 주지 않는다. 판별 유니온이면 `switch (outcome.reason)`의 누락을 컴파일러가 잡는다. **P3의 WebSocket 핸들러도 같은 매핑을 해야 하므로 이 성질이 중요하다.**

- [ ] **Step 1: 실패하는 테스트를 먼저 쓴다**

`apps/api/test/edit-pipeline.test.ts`. 라우트를 거치지 않고 `applyEdit`을 직접 부른다 — HTTP 매핑과 파이프라인 규칙을 분리해서 검사하기 위해서다.

공통 픽스처: `withApi` 안에서 사용자·프로젝트·메뉴·페이지를 만들고, 페이지에 노드 하나를 심어 둔다. 기본 페이지는 `{ version: 1, root: { id, type: 'Page', children: [] } }`이므로, 대부분의 케이스는 먼저 `add /root/children/0`으로 `Text` 노드를 넣은 상태에서 시작한다. **그 준비 자체도 `applyEdit`으로 한다** — 픽스처가 검사 대상 경로를 거치므로, 준비가 성공한다는 사실이 이미 첫 번째 신호다.

| # | `it` 이름 | 입력 | 기대 |
|---|---|---|---|
| 1 | `첫 편집은 seq 1을 받는다` | 빈 페이지에 `add /root/children/0` | `ok: true`, `seq === 1` |
| 2 | `연속 편집은 seq가 1씩 오른다` | 세 번 연속 | `1, 2, 3` |
| 3 | `성공하면 pages.schema와 head_seq가 함께 바뀐다` | 편집 1회 | DB의 `schema`가 새 문서, `head_seq`가 `seq`와 같다 |
| 4 | `성공하면 revision 행이 ops와 inverse를 함께 담는다` | 편집 1회 | `revisions`에 1행, `ops`가 보낸 그대로, `inverse`가 반환값과 같다 |
| 5 | `inverse를 적용하면 원래 문서로 정확히 돌아온다` | 편집 1회 후 `applyOps(after, inverse)` | `toEqual(before)` |
| 6 | `없는 페이지는 not-found다` | 임의 uuid | `reason: 'not-found'` |
| 7 | `다른 프로젝트의 페이지는 not-found다` | 프로젝트 두 개 | `reason: 'not-found'` |
| 8 | `baseSeq가 낡으면 stale이고 현재 head_seq를 알려준다` | 편집 2회 후 `baseSeq: 1` | `reason: 'stale'`, `headSeq === 2` |
| 9 | `baseSeq가 앞서 있어도 stale이다` | 새 페이지에 `baseSeq: 5` | `reason: 'stale'`, `headSeq === 0` |
| 10 | `stale이면 아무것도 쓰지 않는다` | 위 8번 직후 | `head_seq`가 그대로 2, `revisions`가 2행 |
| 11 | `없는 경로를 replace하면 patch-failed다` | `replace /root/children/99/props/x` | `reason: 'patch-failed'`, `path`가 그 경로 |
| 12 | `patch-failed면 아무것도 쓰지 않는다` | 위 직후 | `head_seq` 불변, `revisions` 행 수 불변 |
| 13 | `카탈로그를 위반하면 invalid다` | 알 수 없는 타입 노드를 `add` | `reason: 'invalid'`, `issues[0].code === 'unknown-type'` |
| 14 | `invalid면 아무것도 쓰지 않는다` | 위 직후 | `head_seq` 불변, DB `schema` 불변 |
| 15 | `NUL이 결과 문서에 들어가면 nul-byte다` | `replace .../props/content`에 NUL 포함 문자열 | `reason: 'nul-byte'` |
| 16 | `NUL이 ops에만 있고 문서에 안 남아도 nul-byte다` | `add`로 NUL 값을 넣고 같은 요청에서 `remove` | `reason: 'nul-byte'` |
| 17 | `지원하지 않는 버전이 저장돼 있으면 unsupported-version이다` | DB에 `version: 999` 문서를 직접 심고 편집 | `reason: 'unsupported-version'` |
| 18 | `actor 정보가 revision에 그대로 남는다` | `actor: { type: 'user', id, label: '홍길동' }` | 행의 세 컬럼이 일치 |
| 19 | `ops가 빈 배열이어도 revision을 남긴다` | `ops: []` | `ok: true`, `seq` 증가, `inverse: []` |

**케이스 16이 D8을 증명하는 지점이다.** 결과 문서만 검사하면 통과해 버린다.

**케이스 10·12·14가 "실패해도 안 쓴다"를 증명하는 지점이다.** 이 셋이 없으면 파이프라인이 순서를 어겨 먼저 쓰고 나중에 검증해도 초록이 된다.

**케이스 15의 NUL 문자를 소스에 직접 타이핑하지 않는다.** `String.fromCharCode(0)`으로 만든다 — `routes/pages.ts`의 `NUL_CHAR` 주석이 설명하는 사고를 이 파일에서도 피한다.

**케이스 17의 준비:** `withTransaction(ctx.db, (trx) => trx.updateTable('pages').set({ schema: JSON.stringify({ version: 999, root: {...} }) })...)`로 직접 심는다. `withTransaction`으로 감싸는 이유는 관례(제약 위반 가능 경로)다.

- [ ] **Step 2: 실패를 확인한다**

```bash
pnpm vitest run apps/api/test/edit-pipeline.test.ts
```

- [ ] **Step 3: 파이프라인을 구현한다**

파일 헤더 독스트링에 **순서 자체가 규격**임을 적는다:

```
0. 트랜잭션을 연다(withTransaction).
1. lockPageForEdit — 없으면 not-found.
2. 저장된 문서를 migrateDocument로 최신 버전까지 올린다. 던지면 unsupported-version.
   (클라이언트는 GET이 이미 올려서 내보낸 문서를 기준으로 ops를 만들었으므로,
    서버도 같은 기준으로 맞춰야 경로가 일치한다.)
3. baseSeq !== headSeq면 stale — 현재 headSeq를 함께 돌려준다.
4. invertOps(before, ops) → PatchError면 patch-failed.
5. applyOps(before, ops)  → PatchError면 patch-failed.
6. validatePage(after) → 이슈가 있으면 invalid.
7. containsNulByte(ops) || containsNulByte(inverse) || containsNulByte(after) → nul-byte.
8. insertRevision(seq = headSeq + 1)
9. writePageSchemaAtSeq(after, after.version, seq)
```

계약과 근거:

- **1~7 중 어디서든 실패하면 8·9에 도달하지 못한다.** 그것이 케이스 10·12·14가 고정하는 성질이다. 실패 결과를 `return`하면 `withTransaction`의 콜백이 정상 종료하므로 트랜잭션은 커밋된다 — 하지만 그 시점까지 쓴 것이 없으므로 무해하다. **던져서 롤백시키지 않는 이유:** 실패 사유를 값으로 돌려주는 설계(판별 유니온)와 예외를 섞으면 호출자가 두 경로를 모두 다뤄야 한다.
- **4를 5보다 먼저 한다.** `invertOps`는 `before`(적용 전 문서)를 필요로 하고, 두 함수 모두 같은 조건에서 `PatchError`를 던진다. `invertOps`가 미묘하게 더 엄격하다 — 값이 `undefined`인 키를 `replace`하려 하면 `invertOps`만 던진다. jsonb에서 읽은 문서에는 `undefined`가 있을 수 없으므로 실무적으로는 같지만, 더 엄격한 쪽을 먼저 돌려 두 함수가 서로 다른 판정을 내리는 상황 자체를 없앤다.
- **두 함수가 각각 문서를 복제하므로 적용을 두 번 하는 셈이다.** 페이지 문서는 작고 편집 빈도는 사람의 타이핑 속도이므로 문제되지 않는다. 최적화하지 않는다.
- **`PatchError`를 잡을 때 `error.path`를 그대로 결과에 싣는다.** 사용자가 어느 경로에서 어긋났는지 알아야 클라이언트가 undo 스택에서 그 항목을 버릴지 판단할 수 있다. `PatchError`가 아닌 예외는 잡지 않는다 — 그대로 위로 던져 500이 되게 둔다.
- **`schemaVersion`은 `after.version`에서 파생시킨다.** 저장된 `schema_version` 컬럼을 흘려보내면 마이그레이션이 버전을 올린 순간 두 값이 어긋난다(`routes/pages.ts`의 GET이 같은 이유로 그렇게 한다).
- `insertRevision`은 `withTransaction`으로 감싸져 있으므로(태스크 4), 그 실패가 이 트랜잭션을 오염시키지 않는다. 다만 여기서 실패하면 예외가 그대로 위로 던져진다 — `(page_id, seq)` UNIQUE 위반은 행 잠금이 제대로 걸렸다면 발생할 수 없으므로, 발생했다는 것 자체가 버그이고 500이 맞다.

- [ ] **Step 4: 통과 확인과 변이 검사**

```bash
pnpm vitest run apps/api/test/edit-pipeline.test.ts
pnpm test && pnpm typecheck
```

변이 검사 — 각각 따로 깨뜨리고 어느 테스트가 실패하는지 기록한다:

| 깨뜨릴 것 | 실패해야 하는 케이스 |
|---|---|
| `baseSeq !== headSeq` 검사를 지운다 | 8·9·10 |
| 7단계에서 `containsNulByte(ops)`만 빼고 결과 문서만 검사 | 16 |
| 6단계(`validatePage`)를 3단계 앞으로 옮긴다(= 적용 전 검증) | 13 (적용 전 문서는 유효하므로) |
| 8·9단계를 6단계보다 앞으로 옮긴다 | 14 |
| 2단계(`migrateDocument`)를 지운다 | 17 |
| `insertRevision`의 `seq`를 `headSeq`로(+1 없이) | 1·2 |

되돌리고 초록을 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add apps/api/src/services/edit-pipeline.ts apps/api/test/edit-pipeline.test.ts
git status
git commit -m "feat(services): 편집 파이프라인 - 적용·검증·inverse·기록을 한 트랜잭션으로"
```

---

### Task 6: `PATCH /api/projects/:projectId/pages/:pageId/ops`

파이프라인에 HTTP 얼굴을 붙인다.

**Files:**
- Modify: `apps/api/src/routes/pages.ts`
- Create: `apps/api/test/revisions.test.ts`

**Interfaces:**
- Consumes: `services/edit-pipeline.ts`의 `applyEdit`·`EditOutcome`
- Produces: `PATCH .../ops` 엔드포인트. 성공 응답:

```jsonc
{
  "seq": 3,
  "revisionId": "…",
  "inverse": [ /* PatchOp[] */ ],
  "schemaVersion": 1,
  "clientOpId": "c_1"     // 요청에 있었을 때만
}
```

- [ ] **Step 1: 본문 스키마를 정한다**

`routes/pages.ts`에 더한다:

```ts
/**
 * ops의 경로 제약. `/root`이거나 `/root/`로 시작해야 한다.
 *
 * `version`은 마이그레이션이 소유하는 필드이지 편집 대상이 아니다(설계 §13.1).
 * 문서 루트 자체(`""`)는 `applyOp`가 애초에 거부한다. 이 제약을 **HTTP 본문에만**
 * 거는 이유: `PUT .../schema`(태스크 7)가 파이프라인을 부를 때 만드는
 * `replace /version`은 서버가 스스로 만든 것이라 신뢰할 수 있고, 이 zod를 거치지 않는다.
 */
const PatchPath = z
  .string()
  .max(2000, '경로가 너무 깁니다')
  .refine((path) => path === '/root' || path.startsWith('/root/'), {
    message: '경로는 /root 아래여야 합니다',
  })
```

`add`·`replace`의 `value` 키 존재 요구(D7)는 **zod의 어떤 관용구를 쓰든 무방하다.** 다만 아래 두 가지를 반드시 만족해야 한다:

1. `{ "op": "add", "path": "/root/children/0" }`(`value` 키 없음)은 400이다.
2. `{ "op": "add", "path": "/root/children/0", "value": null }`은 통과한다 — `null`은 정당한 JSON 값이다.

**구현자가 먼저 두 케이스를 테스트로 쓰고, zod 4에서 실제로 동작하는 관용구를 실험으로 확정한다.** 출발점 후보는 `z.custom<unknown>((v) => v !== undefined, { message: 'value가 필요합니다' })`이지만, zod가 `unknown` 계열 필드를 선택적으로 취급해 키가 없을 때 검사를 건너뛸 가능성이 있다 — **확인 없이 쓰지 않는다.** 통하지 않으면 `parseBody` 전에 원본 본문을 직접 훑는 방법도 정당하다(그 경우 이유를 주석으로 남긴다).

나머지 본문:

```ts
const OpsBody = z.strictObject({
  /** 클라이언트가 아는 마지막 seq. 새 페이지(이력 없음)는 0이다. */
  baseSeq: z.int().min(0),
  /**
   * 최대 200개. 상한을 두는 이유는 요청 하나가 임의로 큰 문서 변형을 일으켜
   * 메모리·CPU를 소진하는 것을 막기 위해서다 — 파이프라인은 ops마다 문서를
   * structuredClone하므로 비용이 ops 수에 선형이다. 사람의 한 동작이 만드는
   * ops는 많아야 몇 개이고, 큰 변형은 `PUT .../schema`(통째 교체)의 몫이다.
   */
  ops: z.array(PatchOpSchema).max(200, 'ops는 200개 이하여야 합니다'),
  /**
   * 클라이언트의 pending 큐 식별자. 서버는 저장하지 않고 응답에 그대로 되돌려
   * 준다 — 멱등 키가 아니다(설계 결정 D4). 중복 적용은 baseSeq가 막는다.
   */
  clientOpId: z.string().min(1).max(64).optional(),
})
```

`ops: []`(빈 배열)를 허용한다 — 파이프라인 케이스 19가 그것을 정의한다. `.min(1)`을 걸지 않는다.

- [ ] **Step 2: 라우트 테스트를 먼저 쓴다**

`apps/api/test/revisions.test.ts`의 첫 번째 `describe`. 파이프라인 테스트(태스크 5)가 이미 검증한 것을 되풀이하지 않는다 — **여기서 검사하는 것은 HTTP 매핑과 zod 경계뿐이다.**

| # | `it` 이름 | 요청 | 기대 |
|---|---|---|---|
| 1 | `유효한 ops는 200과 seq·inverse를 준다` | 정상 | 200, `seq === 1`, `inverse`가 배열 |
| 2 | `응답은 계약된 키만 담는다` | `clientOpId` 없이 | 키 집합 `['inverse','revisionId','schemaVersion','seq']` |
| 3 | `clientOpId를 그대로 되돌려 준다` | `clientOpId: 'c_1'` | 응답에 `clientOpId: 'c_1'` |
| 4 | `baseSeq가 낡으면 409다` | 편집 후 옛 baseSeq | 409, `error.code === 'conflict'`, 메시지에 현재 seq |
| 5 | `없는 경로는 409다` | `replace /root/children/9/props/x` | 409 |
| 6 | `카탈로그 위반은 422이고 issues를 담는다` | 알 수 없는 타입 | 422, `error.issues[0].code === 'unknown-type'` |
| 7 | `NUL 문자는 400이다` | NUL 포함 값 | 400 |
| 8 | `지원하지 않는 버전은 400이다` | DB에 999 심고 | 400 |
| 9 | `baseSeq가 없으면 400이다` | 필드 누락 | 400 |
| 10 | `baseSeq가 음수면 400이다` | `-1` | 400 |
| 11 | `선언 안 된 키가 있으면 400이다` | `{ baseSeq, ops, foo: 1 }` | 400 |
| 12 | `op가 다섯 종류 밖이면 400이다` | `op: 'copy'` | 400 |
| 13 | `path가 /root 밖이면 400이다` | `replace /version` | 400 |
| 14 | `move의 from이 /root 밖이면 400이다` | `move` with `from: '/version'` | 400 |
| 15 | `add에 value 키가 없으면 400이다` | `{ op:'add', path:'/root/children/0' }` | 400 |
| 16 | `add의 value가 null이면 통과한다` | 노드 props에 `null` | 200 |
| 17 | `ops가 200개를 넘으면 400이다` | 201개 | 400 |
| 18 | `ops가 빈 배열이면 200이고 seq가 오른다` | `ops: []` | 200, `seq === 1` |
| 19 | `없는 페이지는 404다` | 임의 uuid | 404 |
| 20 | `viewer는 403이다` | viewer 쿠키 | 403 |
| 21 | `비멤버는 404다` | 남의 프로젝트 | 404 |
| 22 | `미인증은 401이다` | 쿠키 없이 | 401 |
| 23 | `editor는 편집할 수 있다` | editor 쿠키 | 200 |
| 24 | `revision의 actor가 요청한 사용자다` | editor가 편집 | 행의 `actor_id`가 그 사용자, `actor_label`이 그 이름 |

**케이스 20·21·22가 P1이 확립한 인가 규칙(404/403)을 이 새 라우트에도 건다.** `permission-matrix.test.ts`에 이 엔드포인트 행이 이미 있는 형식으로 들어가야 한다면 그쪽에도 추가한다 — 구현자가 그 파일의 구조를 보고 판단하되, **어느 쪽이든 세 케이스는 반드시 존재해야 한다.**

- [ ] **Step 3: 실패 확인 → 핸들러 구현**

핸들러 계약:

- `preHandler: projectGuard('editor')`.
- `parseParams(PageParams, ...)` → `parseBody(OpsBody, ...)`.
- `request.currentUser`에서 actor를 만든다: `{ type: 'user', id: currentUser.id, label: currentUser.name }`. `projectGuard('editor')`가 이미 인증을 요구하므로 `currentUser`는 non-null이다 — 그래도 없으면 `unauthenticated()`를 던져 타입을 좁힌다(`as`를 쓰지 않는다).
- `applyEdit`의 결과를 `switch (outcome.reason)`으로 매핑한다. **`default` 절을 두지 않는다** — 새 reason이 추가되면 컴파일 오류가 나야 한다.

| `reason` | 응답 |
|---|---|
| (성공) | 200 + 본문 |
| `not-found` | `throw notFound()` |
| `stale` | `throw conflict(\`페이지가 이미 변경되었습니다 (요청 baseSeq ${baseSeq}, 현재 ${outcome.headSeq})\`)` |
| `patch-failed` | `throw conflict(\`편집을 적용할 수 없습니다: ${outcome.message}\`)` |
| `invalid` | `throw validationFailed('스키마 검증에 실패했습니다', outcome.issues)` |
| `unsupported-version` | `throw badRequest(outcome.message)` |
| `nul-byte` | `throw badRequest('문서에 NUL 문자(U+0000)를 포함할 수 없습니다')` |

`stale`이 `headSeq`를 **에러 봉투의 새 필드가 아니라 메시지에** 싣는 이유(D2·Global Constraints): 봉투는 하나뿐이고 클라이언트는 409를 받으면 어차피 페이지를 재조회하기 때문이다. 재조회 응답의 `headSeq`가 권위 있는 값이다. 메시지의 숫자는 사람이 로그를 읽을 때를 위한 것이다.

응답 조립: `clientOpId`는 요청에 있었을 때만 넣는다(`...(body.clientOpId !== undefined ? { clientOpId: body.clientOpId } : {})`).

- [ ] **Step 4: 통과 확인과 변이 검사**

변이 검사:
- `projectGuard('editor')`를 `projectGuard('viewer')`로 → 케이스 20이 실패해야 한다.
- `PatchPath`의 `refine`을 지우고 → 13·14가 실패해야 한다.
- `value` 키 요구를 지우고 → 15가 실패해야 한다. **16(`null`)은 계속 통과해야 한다.**
- `clientOpId`를 항상 넣도록 바꾸고 → 2가 실패해야 한다.

- [ ] **Step 5: 커밋**

```bash
pnpm test && pnpm typecheck
git add apps/api/src/routes/pages.ts apps/api/test/revisions.test.ts apps/api/test/permission-matrix.test.ts
git status
git commit -m "feat(api): PATCH .../ops - JSON Patch 편집 엔드포인트"
```

---

### Task 7: `PUT .../schema`를 파이프라인에 태운다

D1(모든 스키마 변경이 revision을 남긴다)을 완성한다.

**Files:**
- Modify: `apps/api/src/routes/pages.ts`
- Modify: `apps/api/src/repos/pages.ts` (`updatePageSchema` 제거)
- Modify: `apps/api/test/pages.test.ts`

**Interfaces:**
- Consumes: `services/edit-pipeline.ts`의 `applyEdit`
- Produces: `PUT .../schema`가 revision을 남기고 `head_seq`를 올린다. 응답 형태는 **바뀌지 않는다**(페이지 객체 그대로, 이제 `headSeq` 포함). `repos/pages.ts`에서 `updatePageSchema`가 사라진다.

- [ ] **Step 1: 테스트를 먼저 쓴다**

`apps/api/test/pages.test.ts`의 `PUT .../schema` 절에 더한다.

| # | `it` 이름 | 기대 |
|---|---|---|
| 1 | `PUT .../schema도 revision을 남긴다` | 호출 후 `revisions` 1행, `head_seq === 1` |
| 2 | `그 revision의 ops는 replace /root와 replace /version 둘이다` | `ops.map(o => o.path)`가 `['/root','/version']` |
| 3 | `그 revision의 inverse를 적용하면 이전 문서로 돌아온다` | `applyOps(after, inverse)`가 `toEqual(before)` |
| 4 | `PUT 후 ops로 편집하려면 baseSeq가 1이어야 한다` | `baseSeq: 0`은 409, `baseSeq: 1`은 200 |
| 5 | `봉투가 깨지면 400이고 revision을 남기지 않는다` | 400, `revisions` 0행, `head_seq` 0 |
| 6 | `카탈로그 위반이면 422이고 revision을 남기지 않는다` | 422, `revisions` 0행 |
| 7 | `응답의 headSeq가 새 seq와 같다` | `res.json().headSeq === 1` |

기존 `PUT .../schema` 테스트(400/422/성공 경로)는 **그대로 통과해야 한다** — 이 태스크는 동작을 추가할 뿐 기존 계약을 바꾸지 않는다.

- [ ] **Step 2: 핸들러를 파이프라인으로 바꾼다**

현재 핸들러의 1~3단계(봉투 파싱 → 마이그레이션 → `validatePage`)는 **그대로 둔다.** 그 뒤 4단계(저장)를 파이프라인 호출로 바꾼다.

> **왜 검증을 두 번 하나.** 파이프라인도 6단계에서 `validatePage`를 돈다. 그런데 라우트가 먼저 검증하는 이유는 **에러 품질**이다. 파이프라인이 만드는 ops는 `replace /root`이므로, 그 결과가 유효하지 않을 때 파이프라인이 돌려주는 이슈의 경로는 그대로지만 클라이언트가 "봉투는 통과했는데 카탈로그에서 걸렸다"는 구분을 잃는다. 라우트가 먼저 걸러 400(봉투)과 422(카탈로그)를 구분해 내는 지금의 계약을 유지한다. 파이프라인의 검증은 **`PATCH .../ops`와 공유하는 마지막 방어선**으로 남는다.

핸들러 4단계:

```ts
      // 4단계: 파이프라인에 태운다. `PUT`은 "통째 교체"이므로 baseSeq를 받지 않고
      // 항상 현재 head_seq를 기준으로 이긴다 — 이 엔드포인트의 실제 사용자는
      // JSON 가져오기(P7)와 스냅샷 복원(P6)이고, 그 둘은 마지막 쓰기가 이기는 것이
      // 옳다. 에디터(P2b)는 이 엔드포인트를 쓰지 않는다.
      //
      // ops를 두 개로 만드는 이유: `applyOp`는 문서 루트(`""`)에 연산을 적용하지
      // 못하므로(`resolveSlot`이 거부한다) `{version, root}` 전체를 한 번에 갈아
      // 끼울 수 없다. `/root`와 `/version`을 따로 replace한다. `/version`이 같은
      // 값이어도 생략하지 않는다 — 두 필드를 항상 함께 기록해야 inverse가
      // 마이그레이션으로 올라간 버전까지 정확히 되돌린다.
```

- **잠금과 `baseSeq`.** 파이프라인은 `baseSeq`를 요구하므로, 라우트가 현재 `head_seq`를 먼저 읽어 넘겨야 한다. **그러면 읽기와 파이프라인 사이에 경합 창이 생긴다** — 그 사이 다른 편집이 들어오면 파이프라인이 `stale`을 돌려준다. 그 경우 라우트는 **409를 낸다.** 통째 교체가 항상 이겨야 한다고 해서 재시도 루프를 넣지 않는다: 그 창은 매우 좁고, 409를 받은 호출자(가져오기 도구)가 다시 시도하면 된다. `stale`을 조용히 삼키면 "덮어썼는데 무엇을 덮어썼는지 모르는" 상황이 된다.
  - 라우트가 `head_seq`를 읽는 방법: `findPageById`가 이미 `headSeq`를 담아 온다(태스크 3). 없으면 `notFound()`.
- 파이프라인 결과 매핑은 `PATCH .../ops`와 같다. `patch-failed`는 `replace /root`에서 발생할 수 없지만(경로가 항상 존재한다) `switch`의 모든 가지를 채운다.
- 성공 시 응답은 **페이지 객체**다(형태 불변). 파이프라인이 돌려준 `schema`·`schemaVersion`·`seq`로 `toResponse`에 넘길 레코드를 조립한다 — DB를 다시 조회하지 않는다.

- [ ] **Step 3: `updatePageSchema`를 지운다**

이 핸들러가 파이프라인을 쓰게 되면 `repos/pages.ts`의 `updatePageSchema`는 호출자가 없어진다. **그 함수를 지운다** — D1을 우회하는 두 번째 쓰기 경로(revision 없이 `pages.schema`를 갱신하는 경로)가 코드베이스에 남아 있으면, 나중에 누군가 그것을 다시 부르는 순간 `head_seq`와 문서가 조용히 어긋난다.

확인 방법 두 가지를 모두 만족해야 한다:

```bash
rg 'updatePageSchema' apps/api          # 결과가 0건이어야 한다
rg 'withTransaction|lockPageForEdit|writePageSchemaAtSeq' apps/api/src/routes  # 결과가 0건이어야 한다
```

두 번째는 계층 규칙의 확인이다 — 라우트는 SQL도 트랜잭션도 직접 다루지 않는다.

- [ ] **Step 4: 통과 확인과 변이 검사**

변이 검사:
- ops에서 `replace /version`을 빼고 → 케이스 2가 실패해야 한다.
- `stale`을 200으로 삼키게 바꾸고 → **실패하는 테스트가 없을 수 있다**(`withApi`에서 경합을 못 만든다). 그렇다면 보고서에 적는다. 태스크 9가 이 경로를 진짜 경합으로 다루지는 않지만, 리뷰어가 코드로 확인한다.
- `validatePage`를 라우트에서 지우고 → 기존 422 테스트가 계속 통과하는지 본다. 통과한다면 파이프라인이 잡은 것이고, **그때 상태 코드가 422인지 확인한다.** 422가 아니면 라우트의 사전 검증이 실제로 필요하다는 증거이므로 보고서에 적는다.

- [ ] **Step 5: 커밋**

```bash
pnpm test && pnpm typecheck
git add apps/api/src/routes/pages.ts apps/api/test/pages.test.ts
git status
git commit -m "feat(api): PUT .../schema도 revision을 남긴다"
```

---

### Task 8: `GET /api/projects/:projectId/pages/:pageId/revisions`

설계 §7.3의 "새로고침: 서버에서 내 actor의 최근 revision 50개를 받아 스택을 재구성한다".

**Files:**
- Create: `apps/api/src/routes/revisions.ts`
- Modify: `apps/api/src/app.ts`
- Modify: `apps/api/test/revisions.test.ts`

**Interfaces:**
- Consumes: `repos/revisions.ts`의 `listRevisions`, `repos/pages.ts`의 `findPageById`
- Produces: `GET .../revisions?mine=true&limit=50` → `RevisionResponse[]`

```jsonc
[
  { "id": "…", "seq": 3, "actorType": "user", "actorId": "…", "actorLabel": "홍길동",
    "ops": [ … ], "inverse": [ … ], "createdAt": "2026-08-04T09:00:00.000Z" }
]
```

- [ ] **Step 1: 테스트를 먼저 쓴다**

`apps/api/test/revisions.test.ts`의 두 번째 `describe`.

| # | `it` 이름 | 요청 | 기대 |
|---|---|---|---|
| 1 | `기본은 그 페이지의 모든 revision을 seq 내림차순으로 준다` | 편집 3회 후 | `[3,2,1]` |
| 2 | `배열을 그대로 낸다 (봉투가 없다)` | | `Array.isArray(res.json())` |
| 3 | `각 항목은 계약된 키만 담는다` | | 키 집합 7개 |
| 4 | `createdAt은 ISO 8601이다` | | 정규식 매치 + `Date.parse` |
| 5 | `mine=true는 내 revision만 준다` | 두 사용자가 각각 편집 | 내 것만 |
| 6 | `mine=false는 전부 준다` | | 둘 다 |
| 7 | `limit을 지킨다` | 편집 5회, `limit=2` | 2개, `[5,4]` |
| 8 | `limit 기본값은 50이다` | 편집 3회, limit 생략 | 3개 (그리고 51회 편집 후 50개인지는 검사하지 않는다 — 느리다) |
| 9 | `limit이 200을 넘으면 400이다` | `limit=201` | 400 |
| 10 | `limit이 0이면 400이다` | `limit=0` | 400 |
| 11 | `limit이 숫자가 아니면 400이다` | `limit=abc` | 400 |
| 12 | `없는 페이지는 404다` | | 404 |
| 13 | `다른 프로젝트의 페이지는 404다` | | 404 |
| 14 | `viewer도 읽을 수 있다` | viewer 쿠키 | 200 |
| 15 | `비멤버는 404다` | | 404 |
| 16 | `미인증은 401이다` | | 401 |
| 17 | `이력이 없으면 빈 배열이다` | 새 페이지 | `[]` |
| 18 | `inverse를 그대로 실어 준다` | 편집 1회 | PATCH 응답의 `inverse`와 `toEqual` |

**케이스 18이 이 엔드포인트의 존재 이유를 고정한다** — 새로고침한 클라이언트가 여기서 받은 `inverse`만으로 undo 스택을 복원할 수 있어야 한다.

**케이스 8의 `limit` 기본값 검사가 약하다는 것을 인정한다.** 51개를 만들어 50을 확인하는 것이 진짜 검사지만 느리다. 대신 `limit` 파싱 기본값을 `repos` 호출 인자로 확인하는 방법이 없으므로, **이 행은 "생략해도 200이고 전부 온다"만 증명한다.** 보고서에 그렇게 적는다.

- [ ] **Step 2: 실패 확인 → 라우트 구현**

`routes/revisions.ts`. `routes/tree.ts`와 같은 팩토리 형태(`export function revisionRoutes()`)를 쓰고 `app.ts`가 `{ prefix: '/api/projects' }`로 등록한다.

쿼리 스키마:

```ts
const RevisionQuery = z.strictObject({
  /**
   * `'true'`면 호출자 자신의 revision만 고른다(설계 §7.3의 개인 undo 스택 복원).
   * 쿼리스트링은 언제나 문자열이므로 `z.boolean()`이 아니라 리터럴 두 개를 받는다.
   */
  mine: z.enum(['true', 'false']).optional(),
  /**
   * 상한 200. 설계 §7.3이 요구하는 것은 50이고, 그 몇 배까지 열어 둔다.
   * jsonb 두 컬럼(ops·inverse)을 함께 싣기 때문에 응답이 항목 수에 비례해 무거워진다.
   */
  limit: z.coerce.number().int().min(1).max(200).default(50),
})
```

핸들러 계약:

- `preHandler: projectGuard('viewer')` — 이력 조회는 읽기이므로 viewer도 된다(설계 §10의 "조회 전용").
- **페이지 존재를 먼저 확인한다.** `findPageById(app.db, projectId, pageId)`가 `null`이면 404. 이 확인이 없으면 남의 프로젝트 페이지 id로 조회했을 때 빈 배열이 나가 "그 페이지에 이력이 없다"와 "그 페이지가 내 프로젝트에 없다"를 구분할 수 없다 — 후자는 404여야 한다(설계 §10).
- `mine === 'true'`면 `actorId: request.currentUser.id`를 넘긴다. `currentUser`가 없으면(도달 불가) `unauthenticated()`.
- `RevisionRecord` → 응답 변환은 이 파일의 `toResponse`가 한다. `createdAt`은 `Date`를 그대로 넘긴다(Fastify가 ISO로 직렬화한다 — `invitedAt`과 같은 관례, 태스크 2에서 그 형식을 고정했다).

`app.ts`에 등록한다. 등록 순서는 다른 `/api/projects` 라우트들 뒤, `healthRoutes` 앞이다.

- [ ] **Step 3: README의 엔드포인트 표를 갱신한다**

`apps/api/README.md`의 엔드포인트 표에 두 행을 더한다(`pages` 관련 행들 사이 적절한 자리):

```md
| `/api/projects/:projectId/pages/:pageId/ops` | PATCH | editor | `{ baseSeq, ops[], clientOpId? }` | 200 `{ seq, revisionId, inverse, schemaVersion, clientOpId? }`(baseSeq 불일치·패치 실패 409, 카탈로그 위반 422) |
| `/api/projects/:projectId/pages/:pageId/revisions` | GET | viewer | `?mine=true&limit=50` | 200 revision 배열(seq 내림차순) |
```

`GET .../pages/:pageId` 행의 응답 설명에 `headSeq`를 언급하고, `PUT .../schema` 행에 "revision을 남긴다"를 더한다.

"P1이 만들지 않은 것" 절의 **리비전 항목을 지운다** — 이제 있다. 대신 그 자리에 P2a가 만들지 않은 것을 적는다:

```md
- **실시간 동기화**: WebSocket, 브로드캐스트, 소프트 잠금(P3). 편집은 REST뿐이고,
  동시 편집 방어는 `baseSeq`와 행 잠금이 전부다. `baseSeq`가 어긋나면 서버가
  리베이스를 시도하지 않고 곧바로 409를 낸다.
```

편집 파이프라인을 설명하는 짧은 절을 "API 개요" 아래에 새로 넣는다 — P2b가 이것을 근거로 구현한다:

```md
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

**요청은 직렬화한다.** in-flight 요청은 항상 하나여야 한다 — 앞 요청의 `seq`를
받아야 다음 `baseSeq`가 정해지기 때문이다. 어기면 두 번째 요청이 409를 받는다.
409를 받으면 페이지를 재조회해 `headSeq`와 문서를 다시 맞춘다.
```

- [ ] **Step 4: 통과 확인과 변이 검사**

변이 검사:
- 페이지 존재 확인(`findPageById` → 404)을 지우고 → 케이스 13이 실패해야 한다. (12는 빈 배열이 나가 실패할 것이고, 13은 **다른 프로젝트의 실재하는 페이지**를 써야 판별된다 — 케이스를 그렇게 만든다.)
- `mine` 분기를 지우고 → 5가 실패해야 한다.
- `.default(50)`을 `.default(1)`로 → 8이 실패해야 한다.

- [ ] **Step 5: 커밋**

```bash
pnpm test && pnpm typecheck
git add apps/api/src/routes/revisions.ts apps/api/src/app.ts apps/api/test/revisions.test.ts apps/api/README.md
git status
git commit -m "feat(api): GET .../revisions - undo 스택 복원용 이력 조회"
```

---

### Task 9: 왕복·경합 통합 테스트와 문서 갱신

지금까지의 조각이 실제로 undo/redo를 이루는지, 그리고 행 잠금이 진짜 경합에서 동작하는지 확인한다.

**Files:**
- Create: `apps/api/test/undo-redo.test.ts`
- Create: `apps/api/test/revisions-concurrency.test.ts`
- Modify: `docs/superpowers/specs/2026-08-03-wirebound-design.md`

**Interfaces:**
- Consumes: 태스크 1~8 전부
- Produces: 없음(테스트와 문서)

- [ ] **Step 1: undo/redo 왕복 테스트**

`apps/api/test/undo-redo.test.ts`. `withApi`를 쓴다(순차 시나리오이므로 단일 트랜잭션으로 충분하다).

| # | `it` 이름 | 시나리오 | 기대 |
|---|---|---|---|
| 1 | `세 번 편집한 뒤 inverse를 역순으로 보내면 최초 문서로 정확히 돌아온다` | 편집 3회(각각 add·replace·move) → 각 revision의 `inverse`를 seq 역순으로 ops로 전송 | 최종 `GET`의 `schema`가 최초 `schema`와 `toEqual` |
| 2 | `undo도 새 revision을 만든다 — head_seq는 되돌아가지 않는다` | 위 시나리오 | 최종 `head_seq === 6` |
| 3 | `undo revision의 inverse를 보내면 redo가 된다` | 편집 1회(seq 1) → undo(seq 2) → seq 2의 inverse 전송(seq 3) | seq 1 직후 문서와 `toEqual` |
| 4 | `GET .../revisions?mine=true의 inverse만으로 왕복이 성립한다` | 편집 3회 → **PATCH 응답을 버리고** `GET .../revisions?mine=true`의 inverse만 써서 undo | 최초 문서와 `toEqual` |
| 5 | `대상 노드가 이미 지워졌으면 undo는 409다` | A가 노드를 추가(seq 1) → 그 노드를 지움(seq 2) → seq 1의 inverse를 전송 | 409 (클라이언트가 스택에서 제거하라는 신호) |
| 6 | `409를 받은 뒤에도 문서와 head_seq는 멀쩡하다` | 위 직후 | `head_seq === 2`, 문서가 seq 2 직후 상태 |

**케이스 1의 편집 셋에 `move`를 반드시 포함한다.** `invertOps`의 독스트링이 경고하듯 덮어쓰기 `move`의 역패치는 연산 **두 개**라 ops와 inverse 사이에 1:1 인덱스 대응이 없다 — 파이프라인이나 응답 조립이 그 대응을 가정하고 있으면 여기서 깨진다.

**케이스 4가 태스크 8의 존재 이유를 끝에서 확인하는 지점이다.**

- [ ] **Step 2: 진짜 경합 테스트**

`apps/api/test/revisions-concurrency.test.ts`. **이 파일만 `withApi`를 쓰지 않는다.**

파일 맨 위에 크게 적는다:

```ts
/**
 * ⚠️ 이 파일은 테스트 DB에 **실제로 커밋한다.** 저장소의 다른 모든 api 테스트와
 * 다르다.
 *
 * 이유: `withApi`는 테스트 하나를 커넥션 하나·트랜잭션 하나 안에서 돌린다. 그
 * 안에서 `Promise.all`로 요청을 겹쳐도 전부 같은 트랜잭션 위에서 직렬화되므로,
 * `SELECT ... FOR UPDATE`가 있든 없든 똑같이 통과한다 — 실패할 수 없는 테스트다.
 * 행 잠금과 seq 채번의 원자성은 서로 다른 커넥션이 실제로 커밋해야만 검증된다.
 *
 * 격리: 각 테스트 전후로 `projects`·`users`를 지운다. `projects` 삭제는
 * `menu_nodes`·`pages`(CASCADE) → `revisions`(CASCADE)까지 지우고, `users`
 * 삭제는 `sessions`(CASCADE)를 지운다. vitest의 api 프로젝트는
 * `fileParallelism: false`이므로 이 파일이 도는 동안 다른 파일이 같은 DB를
 * 만지지 않는다.
 *
 * 이 파일에 새 테스트를 더할 때는 반드시 "여러 커넥션이 실제로 커밋해야만
 * 검증되는 성질"인지 먼저 확인한다. 그렇지 않으면 `withApi`를 쓴다.
 */
```

구조:

```ts
const db = getTestDb()

async function reset(): Promise<void> {
  await db.deleteFrom('projects').execute()
  await db.deleteFrom('users').execute()
}

beforeEach(reset)
afterEach(reset)
```

`beforeEach`와 `afterEach` 양쪽에서 지우는 이유: 테스트가 중간에 죽으면 `afterEach`가 안 돌 수 있고, 그 잔여 데이터가 다음 테스트를 오염시킨다.

앱은 `buildApp({ db, config: testConfig() })`로 만든다(트랜잭션이 아니라 풀 핸들을 넘긴다). 각 테스트가 끝나면 `app.close()`한다.

| # | `it` 이름 | 시나리오 | 기대 |
|---|---|---|---|
| 1 | `같은 baseSeq로 동시에 두 편집이 오면 하나만 성공한다` | 두 요청을 `Promise.all`로, 둘 다 `baseSeq: 0` | 상태 코드가 `[200, 409]`의 순열. `head_seq === 1`. `revisions` 1행 |
| 2 | `동시 편집 열 개 중 정확히 하나만 성공한다` | 열 개 동시, 전부 `baseSeq: 0` | 200이 1개, 409가 9개, `head_seq === 1` |
| 3 | `직렬로 보내면 열 개가 모두 성공하고 seq에 구멍이 없다` | 앞 응답의 seq를 다음 baseSeq로 | seq가 1..10, `head_seq === 10` |
| 4 | `서로 다른 페이지의 동시 편집은 서로를 막지 않는다` | 페이지 두 개에 각각 동시 편집 | 둘 다 200, 각 `head_seq === 1` |

**케이스 4가 중요하다.** 잠금 범위가 페이지 행이 아니라 테이블이면(예: 누군가 `LOCK TABLE`을 쓰거나 잠금 대상 조건을 잘못 잡으면) 이 테스트가 느려지거나 실패한다.

**케이스 1의 단언 방법에 주의.** `expect(codes).toEqual([200, 409])`로 쓰면 순서에 의존해 flaky해진다. `expect(codes.slice().sort()).toEqual([200, 409])`로 쓴다.

**풀 크기를 확인한다.** `createPool`은 `new Pool({ connectionString })`이고 `pg`의 기본 `max`는 10이다. 케이스 2가 열 개를 동시에 던지므로 정확히 상한이다 — 커넥션이 모자라면 대기할 뿐 실패하지는 않지만, 구현자가 실행해서 타임아웃(20초)에 걸리지 않는지 확인한다. 걸리면 동시 요청 수를 5로 줄이고 그 이유를 주석으로 남긴다.

- [ ] **Step 3: 두 파일을 돌려 통과시킨다**

```bash
pnpm vitest run apps/api/test/undo-redo.test.ts
pnpm vitest run apps/api/test/revisions-concurrency.test.ts
pnpm test        # 전체. 경합 테스트가 다른 파일을 오염시키지 않는지 여기서 드러난다
```

**전체 스위트를 두 번 연달아 돌린다.** 경합 테스트의 정리가 불완전하면 두 번째 실행에서 다른 파일이 깨진다.

- [ ] **Step 4: 경합 테스트의 변이 검사 — 이 태스크의 핵심**

`repos/pages.ts`의 `lockPageForEdit`에서 `.forUpdate()`를 지우고 경합 테스트만 돌린다.

**케이스 1 또는 2가 실패해야 한다.** 실패하지 않으면 그 테스트는 아무것도 증명하지 못하는 것이므로, 실패할 때까지 시나리오를 고친다(동시 요청 수를 늘리거나, 파이프라인 안에서 인위적 지연을 넣을 수 있는 테스트 훅을 검토한다). **"통과하니까 됐다"로 넘어가지 않는다** — P1의 지배적 실패가 정확히 그것이었다.

지운 것을 되돌리고 다시 초록을 확인한다. 보고서에 실제 관측(어느 케이스가 어떻게 실패했는지)을 적는다.

- [ ] **Step 5: 설계 문서를 갱신한다**

`docs/superpowers/specs/2026-08-03-wirebound-design.md`:

**§13 에러 처리 표**의 `baseSeq 불일치` 행을 고친다:

```md
| baseSeq 불일치 | 409 | 페이지 재조회 후 재시도 |
```

그 표 아래에 문단을 더한다:

```md
`baseSeq` 불일치에 대한 서버 리베이스는 **P3에서 다시 본다.** P2a는 불일치를
곧바로 409로 돌려준다 — 리베이스가 값을 갖는 것은 실시간 동시 편집이 실제로
존재할 때이고, 그때가 되어야 무엇을 리베이스할 수 있는지(겹치지 않는 경로인지,
같은 서브트리인지)가 정해진다. 클라이언트 쪽 리베이스(§7.1의 "타인 ops 수신 →
자기 pending 위에 리베이스")는 그와 별개로 P3의 몫이다.
```

**§15 로드맵**의 P2 행을 둘로 나눈다:

```md
| **P2a** | 편집 파이프라인 — revision 로그, JSON Patch 엔드포인트, 개인 undo/redo의 서버 쪽 | 편집 이력이 쌓이고 되돌릴 수 있다 |
| **P2b** | 에디터 3분할 셸 — 메뉴·구조 트리, 캔버스, 속성 패널, 낙관적 편집 | 혼자서 설계서를 작성할 수 있다 |
```

그 표 아래 P4 분할을 설명하는 문단 옆에 한 문장을 더한다:

```md
P2를 둘로 쪼갠 이유는 P4와 같다. P2a는 서버(편집 파이프라인과 이력)이고 P2b는
그 위에 얹히는 에디터 UI다. 테스트 방식이 서로 다르고(vitest + Postgres vs.
컴포넌트 테스트), P2a만으로도 REST로 편집·되돌리기가 동작하는 상태가 된다.
```

**§7.1**의 정방향 흐름 다이어그램 아래에 한 줄 더한다:

```md
P2a는 이 흐름의 서버 쪽만 REST(`PATCH .../ops`)로 구현한다. WS 전송·ack·브로드캐스트는
P3가 같은 파이프라인 위에 얹는다 — 서버의 검증·기록 절차는 두 경로가 공유한다.
```

- [ ] **Step 6: 이월 문서를 갱신한다**

`docs/superpowers/plans/2026-08-04-p1-carryforward.md`에서 이 단계가 닫은 항목에 표시를 남긴다. 항목을 지우지 않고 각 항목 제목 옆에 `— ✅ P2a에서 처리`를 붙인다(닫힌 것: 5·6·7·8·9·10·11번, 그리고 2번의 경합 테스트 중 페이지 편집 부분).

2번(진짜 경합 테스트)은 **부분적으로만** 닫혔다. 남은 것을 명시한다:

```md
P2a가 `apps/api/test/revisions-concurrency.test.ts`로 실제 커밋 기반 격리 전략을
도입했고, 페이지 편집의 seq 채번 경합을 그것으로 검증했다. **남은 것**: owner 동시
강등, 메뉴 삭제 중 자식 삽입. P3가 같은 파일 형식으로 이어서 쓴다.
```

- [ ] **Step 7: 최종 확인과 커밋**

```bash
pnpm test
pnpm test:build
pnpm typecheck
```

```bash
git add apps/api/test/undo-redo.test.ts apps/api/test/revisions-concurrency.test.ts \
        docs/superpowers/specs/2026-08-03-wirebound-design.md \
        docs/superpowers/plans/2026-08-04-p1-carryforward.md
git status
git commit -m "test: undo/redo 왕복과 실제 경합 검증, 설계 문서 갱신"
```

---

## 자체 리뷰

계획을 다 쓴 뒤 스펙과 대조한 결과다.

**스펙 커버리지.** 설계 §4.2의 `revisions` 스키마 전 컬럼 → 태스크 3. §7.1의 서버 절차(권한 → 적용 후 검증 → seq 부여 → revision insert → pages 갱신) → 태스크 5. §7.1의 "inverse는 서버가 적용 직전 상태를 보고 생성한다" → 태스크 5의 4단계. §7.3의 개인 undo/redo(스택, 적용 불가 시 정상 흐름, 새로고침 복원) → 태스크 8·9. §13의 에러 표 중 이 단계에 해당하는 네 행(422·409·403·baseSeq) → 태스크 6. §13.1의 마이그레이션 경로 → 태스크 5의 2단계.

**스펙에서 이 단계가 손대지 않고 남긴 것과 그 이유.** §7.2 소프트 잠금(P3), §7.4 MCP 편집 경로(P9 — 다만 `actor_type`이 `'mcp'`를 미리 허용한다), §13의 "WS 연결 끊김" 행(P3), §16의 revision 압축(실측 이후).

**타입 일관성 확인.** `PatchOp`(`@wirebound/schema`)이 `db/types.ts`·`repos/revisions.ts`·`services/edit-pipeline.ts`·`routes/pages.ts` 넷에서 같은 타입으로 흐른다. `ValidationIssue`가 `EditOutcome`의 `invalid`와 `ApiErrorIssue`에 구조적으로 들어맞는다(P1이 확인한 성질 — `code`가 `ValidationCode` 리터럴이고 `nodeId`가 `string | null`이라 캐스트가 필요 없다). `seq`가 DB 경계에서만 `string`이고 그 밖 어디에서도 `number`다.

**계획이 스스로 인정하는 약한 지점 셋** — 구현자·리뷰어가 알고 있어야 한다.

1. **태스크 3의 Kysely 빌더 체인을 믿지 말 것.** `alterTable`/`addColumn` 순서, `createIndex().unique()`의 위치, `addCheckConstraint`의 존재를 계획이 확인하지 않았다. 태스크 3의 Step 3이 이것을 명시적으로 지시한다.
2. **태스크 6의 `value` 키 요구(D7)에 확정된 zod 관용구가 없다.** 요구 동작과 테스트 케이스는 확정이고, 관용구는 구현자가 실험으로 정한다.
3. **태스크 9의 경합 테스트가 `.forUpdate()` 제거에 실제로 반응하는지 계획이 모른다.** Postgres의 격리 수준(기본 READ COMMITTED)에서 `.forUpdate()` 없이도 두 트랜잭션이 같은 `head_seq`를 읽고 둘 다 `seq: 1`로 insert하면 `(page_id, seq)` UNIQUE가 두 번째를 죽인다 — 즉 **500이 나올 뿐 409가 아니다.** 그러면 케이스 1의 `sort()` 단언이 `[200, 500]`이 되어 실패한다. 그것이 기대하는 실패다. 태스크 9 Step 4가 이것을 실제로 확인하게 한다.
