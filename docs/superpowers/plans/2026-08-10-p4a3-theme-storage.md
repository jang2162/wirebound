# P4a-3 테마·레이아웃 저장 구현 계획

> **에이전트에게:** 태스크 단위로 구현한다. 각 태스크는 실패하는 테스트 → 최소 구현 →
> 통과 → 커밋의 순환을 하나씩 갖는다. 단계는 체크박스(`- [ ]`)다.

**목표:** 테마가 프로젝트에 저장되고, 저장된 테마가 캔버스에 실린다. 파생 테마를 만들면
**그 프로젝트의 화면이 달라진다.**

**아키텍처:**

```
projects.default_layout_id ─> layouts.theme_id ─> themes
                                                    │
   GET /api/projects/:id/theme  ────────────────────┘
                                                    ▼
                        apps/web  ThemeSource ─> resolve ─> compile ─> <style>
```

설계 §4.2가 정한 참조 사슬이다. **테마는 프로젝트가 아니라 레이아웃이 가리킨다** —
그래서 이 슬라이스가 `layouts`를 함께 만든다. `layouts`는 **참조를 나르고 `Slot`을 담는
최소본**이고, 레이아웃을 **편집하는 화면은 만들지 않는다**(§4.4의 레이아웃 에디터는 뒤 단계다).

**스택:** 기존 그대로. `apps/api`의 의존에 `@wirebound/themes`가 더해진다.

## 전역 제약

- **`pages.schema`를 바꾸는 경로는 편집 파이프라인 하나뿐이다**(P1의 D1). 테마·레이아웃은
  그 문서를 건드리지 않는다.
- **권한: 테마 편집은 owner 전용이다**(§10·§6.10). 판정은 `auth/roles.ts`의 `projectGuard`
  하나가 전담한다 — 라우트가 역할을 직접 비교하지 않는다.
- **시스템 테마는 읽기 전용이다.** `project_id IS NULL`.
- **상속 깊이는 1단계다**(§6.9). 파생의 파생을 만들지 않는다.
- **`packages/themes`는 `schema`만 본다**(§3.3). 이 슬라이스가 그 방향을 바꾸지 않는다.
- **설계 문서를 고치지 않는다.** 예시가 규격과 어긋나면 규격이 이기고, 어긋난 사실을 보고한다.
- **api 테스트는 Postgres 하나(포트 5433)를 공유한다.** 컨테이너를 새로 띄우지 않는다.

---

## 확정한 결정

### D1. `severity`를 먼저 넣는다 — 이 슬라이스의 전제다

**오늘 `ValidationIssue`에 severity가 없어 모든 이슈가 §7.1의 게이트에서 편집을 막는다.**
P4a-2가 그 대가를 실측했다 — `edit-pipeline`이 `validatePage(after)`로 **문서 전체**를
검증하므로, `variant`가 한 번 들어간 문서는 **그 노드와 무관한 편집까지 422로 거부된다.**

테마가 서버 경계를 넘는 순간 같은 구분이 한 번 더 필요해진다: **저장을 거부할 이슈**와
**저장은 되지만 알려야 할 이슈**가 다르다. 그래서 severity가 이 슬라이스의 **첫** 태스크다.

`schema`의 `ValidationIssue`와 `themes`의 `ThemeIssue`를 **함께** 바꾼다. 한쪽만 바꾸면
API가 두 형태를 실어 나르게 된다.

### D2. 저장하는 것은 **파생 테마**다 — 병합 결과가 아니다

§4.2의 `themes` 테이블에 `extends_ref` 컬럼이 있다. **그 컬럼이 답이다** — 저장되는 것은
`extends`를 지닌 편집 대상이고, `mergeTheme`이 내는 **홀로 서는 결과는 저장하지 않는다.**

P4a-1이 이 둘을 갈라 두었다: *"유래는 파생 테마에 산다. `extends`를 잃는 것은 병합 결과뿐이고,
편집되는 파생 테마는 그대로 지닌다. 산출물이 둘이고 서로 다른 일을 한다."*

**병합 결과가 저장될 자리는 스냅샷 하나뿐이다**(§4.5: *"상속 테마는 병합된 결과를 저장한다"*).
스냅샷은 이 슬라이스 밖이다 — **여기서 만들지 마라.**

**`ResolvedTheme`은 어디에도 저장하지 않는다.** 직렬화되지 않는다(P4a-1이 쟀다).

### D3. 컬럼은 §4.2 그대로 쪼갠다

```sql
themes(id, project_id, slug, name, description, extends_ref, version,
       tokens jsonb, primitives jsonb, components jsonb,
       patterns jsonb, assets jsonb, updated_at)
```

`Theme` 객체를 통째로 한 컬럼에 넣지 않는다. §4.2가 절마다 컬럼을 두었고, `slug`·
`extends_ref`에 제약과 인덱스가 걸려야 하기 때문이다(`UNIQUE (project_id, slug)`).

**`meta`는 컬럼으로 흩어진다** — `meta.id`는 `slug`, `meta.extends`는 `extends_ref`,
나머지는 각 컬럼이다. 읽을 때 다시 `Theme` 모양으로 조립한다.

### D4. 시스템 테마는 코드가 진실이고 DB는 그 사본이다

`packages/themes/src/system/`이 오늘 `admin`을 갖고 있다. §4.2는 `project_id IS NULL`로
DB에도 두라고 한다. **둘이 갈리면 코드가 이긴다** — 시스템 테마는 배포에 실려 오고 사용자가
고칠 수 없으므로(§6.10 읽기 전용), DB의 행은 **참조 무결성(`extends_ref`)을 위한 사본**이다.

마이그레이션이 아니라 **기동 시 동기화**로 넣는다. 마이그레이션에 박으면 테마를 고칠 때마다
새 마이그레이션이 필요하다.

### D5. 프로젝트를 만들 때 기본 레이아웃을 함께 만든다

`projects.default_layout_id`가 §4.2에 있다. 프로젝트 생성이 **레이아웃 하나와 그것이 가리킬
테마**를 함께 정해야 사슬이 끊기지 않는다.

기본 레이아웃의 `schema`는 **`Page` 하나와 그 안의 `Slot` 하나**다 — 오늘 화면을 바꾸지 않는
최소본이고, 그래야 이 슬라이스가 외형을 건드리지 않는다.

### D6. 캔버스는 `renderComposed`로 그린다 — **구현 중 반증됐다**

> **이 결정은 틀렸다.** 재보니 `renderComposed(Page>Slot 레이아웃, page)`의 결과가
> `renderDocument(page)`와 **같지 않다.** 측정과 그 결과는
> `packages/renderer/test/compose-identity.test.tsx`가 케이스로 들고 있다.
>
> **원인:** `renderComposed`는 페이지를 그려 `slot`으로 넘기고 **레이아웃 문서를 다시
> 그린다**. 레이아웃의 루트 `Page`와 그 안의 `Slot`이 **각각 자기 엘리먼트를 낸다** —
> `Slot`은 구멍이 아니라 그 자리에 그려지는 노드다. 즉 `Page > Slot`은 "아무것도 더하지
> 않는 껍데기"가 아니라 **노드 둘을 더하는 껍데기**다.
>
> **그래서 캔버스를 합성으로 바꾸지 않았다.** 바꿨다면 결과가 셋이었다:
> (1) `[data-wb-component="Page"]` 테마 규칙이 두 자리에 맞아 여백·배경이 중첩된다,
> (2) 캔버스의 `nodeIdAt`이 **페이지 문서에 없는 id**(레이아웃 루트·슬롯)를 골라 선택이
> 유령 노드를 가리킨다, (3) 아웃라인이 그 노드를 못 찾는다. 셋 다 이 슬라이스가 감당할
> 크기가 아니다 — 선택 모델을 다시 정해야 하고, 그것은 §4.4의 레이아웃 에디터가 올 때의 일이다.

원래 적혀 있던 것: 레이아웃이 생겼으므로 합성 경로를 쓴다. 기본 레이아웃이 `Page > Slot`이라
**오늘 결과는 지금과 같아야 한다** — 그것이 이 태스크의 판정이다.

### D7. 레이아웃을 편집하는 화면은 만들지 않는다

§4.4는 레이아웃 에디터가 페이지 에디터와 같은 UI를 쓴다고 한다. 그것은 화면 하나를 새로
여는 일이고 이 슬라이스가 감당할 크기가 아니다. **여기서 레이아웃은 참조를 나르고 `Slot`을
담는 그릇이다.**

### D8. 테마를 고르는 UI도 만들지 않는다

오늘 시스템 테마가 **하나**다(P4a-2의 D7). 선택지가 하나인 고르개는 아무것도 증명하지 않는다.
다섯 종은 P4b이고, 고르개는 그때 온다.

**대신 이 슬라이스의 판정은 파생 테마다** — API로 파생 테마를 만들면 그 프로젝트의 캔버스가
달라지는 것을 실증한다.

---

## 파일 구조

**만드는 것**

| 파일 | 책임 |
|---|---|
| `apps/api/src/db/migrations/0006-themes.ts` | `themes` 테이블 |
| `apps/api/src/db/migrations/0007-layouts.ts` | `layouts` 테이블 + `projects.default_layout_id` |
| `apps/api/src/repos/themes.ts` | 테마 SQL. `Theme` ↔ 행 변환 |
| `apps/api/src/repos/layouts.ts` | 레이아웃 SQL |
| `apps/api/src/routes/themes.ts` | 테마 CRUD (owner 전용) |
| `apps/api/src/services/system-themes.ts` | 기동 시 시스템 테마 동기화 |
| `apps/web/src/theme/use-project-theme.ts` | 서버에서 테마를 읽는 `ThemeSource` |

**고치는 것**

| 파일 | 무엇 |
|---|---|
| `packages/schema/src/validate.ts` | `ValidationIssue.severity` |
| `packages/themes/src/issue.ts` | `ThemeIssue.severity` |
| `apps/api/src/services/edit-pipeline.ts` | `error`만 거부한다 |
| `apps/api/src/db/types.ts` | `ThemesTable`·`LayoutsTable`·`projects.default_layout_id` |
| `apps/api/src/repos/projects.ts` | 생성 시 기본 레이아웃 |
| `apps/api/src/app.ts` | 라우트 등록 · 기동 동기화 |
| `apps/api/README.md` | 엔드포인트 계약 |
| `apps/web/src/api/client.ts`·`http-client.ts`·`types.ts` | 테마 엔드포인트 |
| `apps/web/src/canvas/canvas.tsx` | `renderComposed` · 프로젝트 테마 |

---

## Task 1: `severity` — 경고와 거부를 가른다

**Files:**
- Modify: `packages/schema/src/validate.ts`, `packages/schema/src/index.ts`,
  `packages/themes/src/issue.ts`, `apps/api/src/services/edit-pipeline.ts`
- Test: `packages/schema/test/validate.test.ts`, `packages/themes/test/*`,
  `apps/api/test/pages-edit.test.ts`(또는 해당 파일)

**Interfaces:**
- Produces: `ValidationIssue.severity`, `ThemeIssue.severity`

- [ ] **Step 1: 무엇이 경고인지 정하는 테스트를 먼저 쓴다**

**오늘 `warning`이 될 자격이 있는 것은 하나뿐이다: `ignored-variant`.** 그것이 이 필드를
만든 이유다(P4a-2가 남긴 이월). **나머지를 함부로 경고로 내리지 마라** — 무엇이 편집을
막아야 하는지는 §7.1이 정한 것이고, 이 태스크는 그 목록을 줄이는 것이 아니라 **표현할 수
있게** 만드는 것이다.

```ts
it('ignored-variant는 경고이고 편집을 막지 않는다', () => { … })
it('그 밖의 이슈는 전부 error다', () => { … })   // 코드 유니온을 훑어 센다
```

두 번째가 중요하다. **새 코드가 생겼을 때 severity를 정하지 않고 지나가면 죽어야 한다.**

- [ ] **Step 2: 실패를 확인한다**

- [ ] **Step 3: 필드를 더한다**

값 집합과 기본값을 **재서 정한다**(재라 #2). `severity?: 'error' | 'warning'`로 두고 없으면
`error`로 볼지, 필수로 둘지. **선택으로 두면 안 적은 곳이 조용히 error가 된다** — 그것이
안전한 기본값이지만 Step 1의 두 번째 케이스가 필요한 이유이기도 하다.

- [ ] **Step 4: `edit-pipeline`이 `error`만 거부하게 한다**

`validatePage(after)`의 결과에서 `error`가 하나라도 있으면 `invalid`, 없으면 통과한다.
**경고는 응답에 실어 보낸다** — 삼키면 이 필드를 만든 이유가 사라진다.

`EditOutcome`이 성공 경로에서 경고를 나를 수 있어야 한다. 시그니처가 바뀌면 P3의
WebSocket 핸들러가 같은 함수를 부를 것이므로 **주석에 그 사실을 적어라.**

- [ ] **Step 5: `ThemeIssue`에도 같은 필드를 준다**

`packages/themes`의 `resolveTheme`은 **이슈가 하나라도 있으면 `theme`을 `null`로 낸다**
(P4a-1의 D2). 경고가 생기면 그 규칙이 바뀌어야 하는지 **재서 정하라** — 오늘 `themes`에
경고가 될 이슈가 있는가. 없으면 필드만 더하고 규칙은 그대로 두고, **그 사실을 주석에 적어라.**

- [ ] **Step 6: 구분력 실증**

`ignored-variant`가 담긴 문서로 무관한 편집을 보내 **고치기 전에는 422, 고친 뒤에는 통과**
하는 것을 확인하라. **변이를 심을 때 심어졌는지부터 확인한다**(P4a-2가 배운 것).

- [ ] **Step 7: 커밋**

```bash
git add packages/schema/src packages/themes/src apps/api/src/services packages/schema/test packages/themes/test apps/api/test
git commit -m "feat(schema,themes,api): 이슈에 severity를 두어 경고와 거부를 가른다"
```

---

## Task 2: `themes` 테이블

**Files:**
- Create: `apps/api/src/db/migrations/0006-themes.ts`
- Modify: `apps/api/src/db/migrations/index.ts`, `apps/api/src/db/types.ts`
- Test: `apps/api/test/migrations.test.ts`(있으면) 또는 새 파일

- [ ] **Step 1: 테이블이 생기고 제약이 서는지 보는 테스트를 쓴다**

`UNIQUE (project_id, slug)`가 실제로 막는지. `project_id IS NULL`이 여럿 있을 때
그 UNIQUE가 어떻게 도는지 — **Postgres에서 NULL은 서로 같지 않으므로 표준 UNIQUE로는
시스템 테마의 slug 중복이 막히지 않는다.** 재서 확인하고 필요하면 부분 인덱스를 쓴다(재라 #4).

- [ ] **Step 2: 실패를 확인한다**
- [ ] **Step 3: 마이그레이션과 `db/types.ts` 인터페이스를 쓴다**

`0004-pages.ts`의 주석 밀도와 형식을 따른다. jsonb 컬럼은
`JSONColumnType<…>` — 삽입에는 `JSON.stringify` 문자열, 조회에는 파싱된 객체다.

`down`이 실제로 되돌리는지 확인한다 — `test/global-setup.ts`가 매 실행 latest → none →
latest를 왕복한다.

- [ ] **Step 4: 통과를 확인하고 커밋**

---

## Task 3: jsonb가 키 순서를 지운다 — 계약을 어떻게 할 것인가

**이 태스크가 이 슬라이스에서 가장 결정적이다.** P4a-1이 컨테이너에서 직접 쟀다:

```
'{"selected":1,"disabled":2,"loading":3,"empty":4}'::jsonb
  → {"empty": 4, "loading": 3, "disabled": 2, "selected": 1}
```

키가 **(길이, 바이트)로 정규화**된다. 그런데 `compileTheme`의 계약은 **문서 순서가 곧
우선순위**다(`states`·`variants`·`parts`·`components`). **저장을 거치면 그 계약이 무너진다.**
P4a-2가 여기에 하나 더 얹었다 — `bgGradient`/`bgImage`도 **같은 부류**다(같은 CSS 프로퍼티로
가고 문서 키 순서가 이긴다).

**Files:**
- Test: `apps/api/test/theme-order.test.ts` (새 파일 — 실제 DB를 쓴다)
- Modify: 재서 정한 결과에 따라

- [ ] **Step 1: 무엇이 실제로 노출되는지 DB로 재라**

`states`·`variants`·`parts`·`components`, 그리고 한 스타일 맵 안의 프로퍼티 순서
(`bgGradient`/`bgImage`)를 **각각** 넣었다 빼서 순서가 보존되는지 본다.
**`jsonb`와 `json` 둘 다 재라** — `json`은 원문을 그대로 보관한다.

- [ ] **Step 2: 세 갈래를 재서 하나를 고른다**

| 갈래 | 대가 |
|---|---|
| **`json` 컬럼을 쓴다** | 순서가 보존된다. 그러나 `jsonb` 연산자·인덱스를 잃고 §4.2가 `jsonb`라고 적었다 |
| **순서를 배열로 옮긴다** | 규격이 바뀐다(§6.5의 객체 표기). 저작 UI와 설계 문서가 함께 움직여야 한다 |
| **순서 계약을 버린다** | `compileTheme`이 이름 정렬 등 **결정적이고 저장을 견디는** 순서를 쓴다. 재라 #7(상태가 변형을 이긴다)의 근거가 순서였으므로 그것을 다시 세워야 한다 |

**정답을 적지 않았다. 재서 정하고 근거를 남겨라.** 무엇을 고르든 **설계 문서는 고치지 말고**
어긋난 사실을 보고하라.

- [ ] **Step 3: 고른 것을 구현하고 왕복을 케이스로 고정한다**

**저장 → 조회 → 컴파일이 저장 전 컴파일과 같은 CSS를 내는가.** 이것이 이 태스크의 판정이다.

- [ ] **Step 4: 구분력 실증 — 순서를 바꿔 CSS가 갈리는 것을 보여라**
- [ ] **Step 5: 커밋**

---

## Task 4: 테마 레포 — `Theme` ↔ 행

**Files:**
- Create: `apps/api/src/repos/themes.ts`
- Test: `apps/api/test/repos-themes.test.ts`

**Interfaces:**
- Produces: `listThemes` · `findThemeBySlug` · `findThemeById` · `insertTheme` ·
  `updateTheme` · `deleteTheme` (정확한 시그니처는 구현자가 정한다 — `repos/pages.ts`의
  형식을 따른다)

- [ ] **Step 1: 왕복 테스트를 먼저 쓴다**

`Theme` 객체를 넣고 꺼내면 **같은 객체인가.** `meta`가 컬럼으로 흩어졌다 다시 조립되므로
(D3) 이 왕복이 그 조립을 지킨다.

**빈 절과 없는 절을 갈라라** — `patterns`가 `{}`인 것과 없는 것이 왕복 후에도 구별되는가.
구별되지 않아도 되는지 **재서 정하고 근거를 남겨라.**

- [ ] **Step 2: 실패를 확인한다**
- [ ] **Step 3: 구현한다**

**NUL 바이트를 조심하라.** `db/nul-guard.ts`가 이미 있다 — 테마의 문자열 값(토큰 값·설명)에도
그것이 필요한지 재서 정하라(재라 #10). Postgres는 `jsonb`에 ` `을 거부한다.

- [ ] **Step 4: 통과를 확인하고 커밋**

---

## Task 5: 시스템 테마 동기화

**Files:**
- Create: `apps/api/src/services/system-themes.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/package.json`(`@wirebound/themes` 의존)
- Test: `apps/api/test/system-themes.test.ts`

- [ ] **Step 1: 테스트를 쓴다**

- 기동 후 `project_id IS NULL`인 행이 코드의 시스템 테마와 **같은가.**
- **두 번 돌려도 늘지 않는가**(멱등).
- 코드에서 테마가 바뀌면 DB가 따라오는가(**코드가 이긴다** — D4).
- 코드에서 테마가 **사라지면** DB의 행은 어떻게 되는가. **재서 정하라**(재라 #5) —
  지우면 그것을 상속한 파생 테마가 끊긴다.

- [ ] **Step 2: 실패를 확인한다**
- [ ] **Step 3: 구현한다**

**여러 인스턴스가 동시에 기동할 때 경합하지 않는가**를 재서 정하라. `ON CONFLICT`로 닫히면
그것으로 족하다.

- [ ] **Step 4: 통과를 확인하고 커밋**

---

## Task 6: 테마 라우트 — CRUD

**Files:**
- Create: `apps/api/src/routes/themes.ts`
- Modify: `apps/api/src/app.ts`, `apps/api/README.md`
- Test: `apps/api/test/routes-themes.test.ts`

- [ ] **Step 1: 권한부터 테스트로 쓴다**

| 역할 | 목록·조회 | 생성·수정·삭제 |
|---|---|---|
| owner | 가능 | 가능 |
| editor | 가능 | **403** |
| viewer | 가능 | **403** |
| 비멤버 | **404** | **404** |

**시스템 테마는 owner도 못 고친다** — 별도 케이스로 고정하라.
비멤버가 404인지 403인지는 **기존 라우트의 관례를 따른다** — `routes/pages.ts`·
`auth/roles.ts`를 읽고 같게 하라. 어긋나면 그것이 발견이다.

- [ ] **Step 2: 본문 검증을 테스트로 쓴다**

`ThemeSchema`(또는 `ThemePatchSchema`)를 통과하지 못하면 **400**,
`resolveTheme`이 `error` 이슈를 내면 **422**에 `issues`를 그대로 싣는다.
**이 갈래는 `routes/pages.ts`의 §7.1 게이트와 같은 모양이다** — 그 파일의 주석을 읽고
같은 순서로 써라(봉투 → 규격 → 의미).

**경고만 있으면 저장된다**(Task 1). 응답에 경고를 실어라.

- [ ] **Step 3: 실패를 확인한다**
- [ ] **Step 4: 구현한다** — 권한은 `projectGuard`가 전담한다. 라우트가 역할을 비교하지 않는다.
- [ ] **Step 5: `apps/api/README.md`에 계약을 적는다**
- [ ] **Step 6: 통과를 확인하고 커밋**

---

## Task 7: 파생 테마 — `extends_ref`

**Files:**
- Modify: `apps/api/src/repos/themes.ts`, `apps/api/src/routes/themes.ts`
- Test: `apps/api/test/routes-themes.test.ts`

- [ ] **Step 1: 테스트를 쓴다**

- `extends_ref`가 가리키는 시스템 테마가 **없으면** 400/422 중 무엇인가. 재서 정하라.
- **깊이 2를 막는가**(§6.9) — 파생을 상속하는 테마를 만들려 하면 거부된다.
- **저장되는 것은 파생 그대로**다(D2) — `extends`를 지닌 채 왕복한다.
- 조회 시 **해석에 필요한 base를 함께 주는가**, 아니면 클라이언트가 두 번 부르는가.
  `resolveTheme(document, base)`가 base를 요구한다(P4a-1). **재서 정하라**(재라 #6).

- [ ] **Step 2: 실패를 확인한다**
- [ ] **Step 3: 구현한다**
- [ ] **Step 4: 통과를 확인하고 커밋**

---

## Task 8: `layouts` 테이블과 기본 레이아웃

**Files:**
- Create: `apps/api/src/db/migrations/0007-layouts.ts`, `apps/api/src/repos/layouts.ts`
- Modify: `apps/api/src/db/types.ts`, `apps/api/src/repos/projects.ts`,
  `apps/api/src/db/migrations/index.ts`
- Test: `apps/api/test/repos-layouts.test.ts`, 기존 프로젝트 생성 테스트

- [ ] **Step 1: 테스트를 쓴다**

- 프로젝트를 만들면 **기본 레이아웃이 함께 생기고** `default_layout_id`가 그것을 가리킨다.
- 그 레이아웃의 `schema`가 **`Page` 하나와 `Slot` 하나**이고 `validateLayout`을 통과한다.
- `theme_id`가 **시스템 `admin`**을 가리킨다.
- 프로젝트를 지우면 레이아웃도 지워진다(`ON DELETE CASCADE`).
- **`default_layout_id`와 `layouts.project_id`가 순환 참조다** — 어느 쪽을 먼저 넣는가.
  재서 정하고 트랜잭션 안에서 닫아라.
- **이미 있는 프로젝트는 어떻게 되는가**(재라 #8). 마이그레이션이 만들어 주는가,
  없으면 없는 대로 두는가.

- [ ] **Step 2: 실패를 확인한다**
- [ ] **Step 3: 구현한다**
- [ ] **Step 4: 통과를 확인하고 커밋**

---

## Task 9: 웹이 서버에서 테마를 읽는다

**Files:**
- Create: `apps/web/src/theme/use-project-theme.ts`
- Modify: `apps/web/src/api/client.ts`·`http-client.ts`·`types.ts`,
  `apps/web/src/canvas/canvas.tsx`
- Test: `apps/web/test/theme/use-project-theme.test.tsx`

- [ ] **Step 1: 테스트를 쓴다**

- 프로젝트의 테마를 **한 번** 읽어 `ThemeSource`로 넘긴다.
- **`ThemeSource`가 안정 참조여야 한다**(P4a-2의 이월). 매 렌더 새 함수를 넘기면
  `useThemeCss`의 `useMemo`가 **매번 재컴파일**한다 — **그것을 케이스로 고정하라**
  (컴파일 횟수를 세는 방법을 재서 정하라).
- **조회 중·실패에 빈 화면이 되지 않는다.** 테마가 없으면 구조 기본 CSS만으로 그린다 —
  이미 그 경로가 있다(`theme-source.ts`의 `null`).
- 서버가 이슈를 내면 **콘솔에만** 남긴다(P4a-2의 재라 #12 결정 그대로).

- [ ] **Step 2: 실패를 확인한다**
- [ ] **Step 3: 구현한다**

`defaultThemeSource`를 **지우지 마라** — 서버가 테마를 주지 못하는 상태의 폴백이고,
`use-theme-css.ts`의 기본 인자다. 지금 관계를 주석에 적어라.

- [ ] **Step 4: 통과를 확인하고 커밋**

---

## Task 10: 캔버스가 레이아웃과 합성한다 + 파생 테마 판정

**Files:**
- Modify: `apps/web/src/canvas/canvas.tsx`
- Test: `apps/web/test/theme/project-theme-cascade.test.tsx`

- [x] **Step 1: 합성이 오늘 결과를 바꾸지 않는 것을 테스트로 쓴다 → 결과가 달랐다**

**다르다. 그것이 발견이다**(위 D6 참고). 캔버스는 `renderDocument`를 그대로 쓰고,
합성이 노드 둘을 더 그린다는 사실을 `compose-identity.test.tsx`가 케이스로 고정한다.

**재라 #9 — 인자 뒤바꿈은 컴파일되지 않는다.** `node.ts`의 팬텀 판별자
(`declare const documentKind: unique symbol`)가 잡는다. `document-kind.test-d.ts`가
재고 있던 것은 **스텁**이었고 실제 `renderComposed`는 아무도 재지 않고 있었다 —
`compose-identity.test.tsx`의 `@ts-expect-error` 한 줄이 그 자리를 메운다.

**곁들여: 판별자가 무음으로 꺼지는 경로가 있다.** `PageDocument`를 소스 경로
(`packages/schema/src/node`)에서, `renderComposed`를 패키지(`@wirebound/renderer` → `dist`)
에서 가져오면 **뒤바꿈이 통과한다** — `unique symbol` 선언이 둘이면 서로 다른 키가 되어
두 문서 타입이 똑같이 `{version, root}`로 접힌다. 첫 프로브가 그 함정에 걸렸다.

- [ ] **Step 2: 이 슬라이스의 판정을 쓴다**

**파생 테마를 만들면 그 프로젝트의 화면이 달라진다.**

`system:admin`을 상속해 `semantic` 색 하나를 덮는 파생 테마를 API로 만들고,
같은 페이지의 계산된 스타일이 **갈리는 것**을 확인한다. 이것이 이 슬라이스 전체의 판정이다.

- [ ] **Step 3: 통과를 확인하고 커밋**

- [ ] **Step 4: 전체 회귀**

```bash
pnpm test
pnpm typecheck
pnpm build
```

---

## 재라 — 이 계획이 정하지 않고 넘기는 것

**정답을 적지 않았다. 재고 나서 정하고 근거를 코드 주석에 남겨라.**

| # | 무엇 | 어떻게 재는가 |
|---|---|---|
| 1 | **jsonb 키 순서 계약** | Task 3 전체. **이 슬라이스에서 가장 큰 것이다** |
| 2 | `severity`의 값 집합과 기본값 | 선택으로 두고 없으면 `error`인가, 필수인가. 없는 곳이 조용히 지나가는 경로가 생기는지 |
| 3 | `themes`에 경고가 될 이슈가 있는가 | 없으면 `resolveTheme`의 "이슈가 있으면 `null`" 규칙을 그대로 둔다 |
| 4 | `UNIQUE (project_id, slug)`가 시스템 테마에 서는가 | Postgres에서 NULL은 서로 같지 않다. 부분 인덱스가 필요한지 |
| 5 | 코드에서 시스템 테마가 사라지면 DB 행은 | 지우면 그것을 상속한 파생이 끊긴다 |
| 6 | 파생 테마 조회가 base를 함께 주는가 | `resolveTheme(document, base)`가 base를 요구한다. 라운드트립 하나로 끝낼지 |
| 7 | `layouts.theme_id`가 `null`이면 | 허용하는가. 허용하면 화면은 구조 기본 CSS만으로 그려진다 |
| 8 | 이미 있는 프로젝트의 기본 레이아웃 | 마이그레이션이 만드는가, 없으면 없는 대로 두는가 |
| 9 | `renderComposed`의 인자 뒤바꿈이 아직 컴파일되는가 | P0 이월 #3. 재서 보고하라 |
| 10 | 테마 문자열 값의 NUL 바이트 | `db/nul-guard.ts`가 필요한 자리인지 |
| 11 | 깊이 상한 | `safeParse`가 깊은 트리에서 **던진다**(P4a-1). 서버가 깊은 본문을 받으면 500이 되는가 |
| 12 | `meta.version`을 서버가 강제하는가 | P4a-1이 형식을 강제하지 않았다. 저장 경계에서도 그대로인지 |

---

## 계획이 재지 않은 것

| # | 무엇 |
|---|---|
| 1 | **테마를 고르는 UI가 없다**(D8). 시스템 테마가 하나뿐이라 고르개를 만들 이유가 없고, 파생 테마는 API로만 만들 수 있다. **사용자가 이 기능에 도달할 경로가 없다** — P4b가 다섯 종과 함께 연다 |
| 2 | **레이아웃을 편집할 수 없다**(D7). 모든 프로젝트가 `Page > Slot` 하나를 갖는다 |
| 3 | 스냅샷(§4.5)을 만들지 않는다. **병합 결과가 저장될 유일한 자리**가 아직 없다는 뜻이다 |
| 4 | 테마가 큰 경우의 비용을 재지 않았다 — jsonb 컬럼 다섯, 조회마다 파싱 |
| 5 | 여러 사용자가 같은 테마를 동시에 고칠 때. `pages`는 `head_seq`로 닫혀 있는데 테마에는 그런 것이 없다 |
| 6 | 테마를 지울 때 그것을 가리키는 레이아웃이 어떻게 되는가 — `ON DELETE`를 무엇으로 둘지 |
| 7 | `apps/api`가 `@wirebound/themes`를 의존하면 **`dist` 빌드가 필요하다**(`tsx`로 도는 `dev`·`migrate`가 그것을 본다). 워크트리에서 `pnpm build`를 빠뜨리면 서버만 안 뜬다 |
