# P2b-5 프로젝트 CRUD 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로젝트 목록에서 프로젝트를 만들고, 이름·슬러그·설명을 바꾸고, 지울 수 있게 한다.

**Architecture:** P2b-4의 메뉴·페이지 CRUD와 **같은 경로다** — 요청 하나 → 성공하면 목록 재조회, 낙관 적용·undo 없음. 새로 만드는 것은 (1) `ApiClient`의 CRUD 셋, (2) **역할 판정 순수 함수**(앱의 첫 역할 분기), (3) 목록 화면의 폼·확인이다.

**Tech Stack:** TypeScript(ESM, strict + `noUncheckedIndexedAccess`) · React 19 · Vite 6 · react-router 7 · vitest 3 + React Testing Library + jsdom

## Global Constraints

근거 문서는 셋이다. **순서대로 읽어라.**

- `docs/superpowers/plans/2026-08-09-p2b4-carryforward.md` — **바로 앞 단계의 이월.** 이 계획이 기대는 사실이 거기 다 있다.
- `apps/api/README.md` — 엔드포인트 계약표의 `/api/projects` 줄들.
- `docs/superpowers/specs/2026-08-03-wirebound-design.md` §10 — 권한 모델. *"프로젝트 멤버가 아닌 사용자에게는 404를 준다(프로젝트 존재 자체를 숨긴다). 멤버지만 역할이 모자라면 403이다."*

제약:

- **서버는 건드리지 않는다.** 필요한 것이 이미 다 있다. 고쳐야 한다고 판단되면 **고치지 말고 `orca orchestration ask`로 물어라.**
- **의존 방향은 한 방향이다:** `schema` ← `renderer` ← `apps/web`. `apps/web`이 `apps/api`에서 타입을 import하지 않는다.
- **`apps/web`에 새 런타임 의존을 들이지 않는다.** 지금 의존은 `react`·`react-dom`·`react-router`뿐이다.
- **사용자 대면 메시지와 주석은 전부 한국어.** 주변 코드의 어투(무엇이 아니라 **왜**)를 따른다.
- Node ≥ 22.9.0, ESM only, TypeScript strict + `noUncheckedIndexedAccess`, `verbatimModuleSyntax`. `pnpm typecheck`가 exit 0이어야 한다.
- **`pnpm test`가 초록이어야 한다.** 이 계획을 쓴 시점은 **1440 tests / 77 files**다 — **기준선일 뿐 목표가 아니다.**
- 커밋할 파일은 **경로로 명시해서** stage한다. `git add -A` 금지.
- **완결성을 주장하지 마라.** "전부"·"항상"·"유일"은 **측정한 뒤에만, 측정과 함께.**
- **수를 적으면 그 수가 틀린다.** P2b-4에서 **네 번** 그랬다. 세려면 재고, 재기 싫으면 **부류로 적어라.**
- **인과 문장을 쓸 때는 그 X를 심어 Y를 관측한 뒤에 써라.** **특히 고치면서 새로 적는 문장이 위험하다** — P2b-4에서 원본 코드의 인과는 웨이브당 1·3·1이 반증됐는데 **1차 수정 커밋 하나에서만 넷**이 반증됐다.
- **환경 단서를 빼지 마라.** *"jsdom에서만 쟀다"*·*"`fireEvent` 환경에서만 참이다"*가 그 부류다.

## 이 단계가 만들지 않는 것

- **멤버 초대·역할 변경.** 서버에 `/members`가 있지만 P2b의 목표는 *"혼자서 설계서를 작성할 수 있다"*이고 멤버는 P3(여럿이 동시 작업)에 가깝다.
- **회원가입 화면.** 서버에 `POST /auth/signup`이 있지만 설계 §10이 *"팀이 자체 호스팅하는 도구"*라고 못박았고 계정 발급은 수동이다(P2b-1의 결정 그대로).
- **드래그 정렬.** 메뉴·구조 트리의 드래그는 별도 단계다.
- **프로젝트 목록의 정렬·검색·페이지네이션.** 서버가 `GET /projects`에 쿼리를 받지 않는다.
- **삭제 취소·휴지통.** 서버에 그런 경로가 없다.

---

## 설계 결정 (계획 단계에서 확정)

**아래 "확정"은 P2b-4에서 실측된 것에 근거한다. 근거가 실측이 아닌 자리는 그렇게 적었고, 그런 자리는 "계획이 재지 않은 것" 표로 보냈다.**

### D1. 요청 → 재조회. 낙관 적용은 없다

P2b-4와 **같은 경로다.** 근거 둘:

1. ~~**생성 응답을 목록에 그대로 꽂을 수 없다.** `POST /projects`가 주는 것은 `{id, name, slug, description}`이고 **`role`이 없다** — 목록 항목(`ProjectDetail`)과 다른 모양이다. (소스로 확인했다: `repos/projects.ts`의 `insertProject`가 `.returning(['id','name','slug','description'])`. **실측은 Task 1이 한다.**)~~ **→ 이 근거는 실측으로 반증됐다. 아래 정정을 보라.**
2. **undo가 없다.** 되돌릴 것이 목록 하나뿐이라 재조회가 곧 수렴이다.

**정정(Task 1의 재라 #1, api 하네스 실측).** `POST /projects` 201 응답의 키 집합은 **`["description","id","name","role","slug"]`이고 `role: "owner"`가 실려 온다.** `GET /projects` 항목·`GET /projects/:id`·`PATCH /projects/:id`와 **키 집합이 같다.** 원인은 `insertProject`가 `.returning([…])`으로 고른 **뒤** `{ ...project, role: 'owner' as const }`로 감싸는 것인데, 이 계획은 `.returning` 줄만 읽고 확정했다. **생성 응답은 `ProjectSummary`가 아니라 `ProjectDetail`이다.**

**그래도 D1의 결론(요청 → 재조회, 낙관 적용 없음)은 선다.** 근거 2가 그대로다. 여기에 정렬을 덧붙일 수 있고, **이번에는 쟀다.**

> **앞 판이 여기 적은 측정 방법은 틀렸다(리뷰 F3).** *"프로젝트 둘을 만들어 목록의 순서를 보면 된다"*는 **`apps/api/test/`의 `withApi` 하네스에서 성립하지 않는다.** 그 하네스는 테스트 하나를 **트랜잭션 하나**로 감싸고, `projects.created_at`의 기본값은 `now()`인데 **Postgres의 `now()`는 트랜잭션 시작 시각이라 그 안에서 얼어 있다.** 실측(마이크로초까지 봤다 — JS `Date`의 `toString`은 초까지만 찍어 차이를 숨기므로 `created_at::text`로 받았다): 한 테스트에서 만든 프로젝트 셋의 `created_at`이 **`2026-08-09 09:33:59.572208+00` 하나로 같고 distinct가 1**이다. **대조로 시간이 실제로 흘렀다는 것도 확인했다** — 같은 트랜잭션에서 `now()`를 두 번 부르면 값이 같고 `clock_timestamp()`는 다르다(`.646329` vs `.64705`). 그러므로 그 방법으로 얻는 `["A","B","C"]`는 **동점에서 나온 물리적 순서**이지 정렬이 판정된 것이 아니다. **고치면서 새로 적는 문장이 가장 위험하다는 P2b-4의 관측이 바로 이 문단에서 재현됐다.**

**되는 방법(재서 확인했다).** 프로젝트 셋을 만든 뒤 `created_at`을 **삽입 순서와 반대로** 갈라 놓고 목록을 받는다 — 정렬이 실제로 판정되면 뒤집힌 순서가 나오고, 물리적 순서를 따르는 것뿐이면 삽입 순서가 나온다.

```sql
update projects set created_at = '2026-01-03 00:00:00+00' where id = <A>;  -- 첫째로 만든 것
update projects set created_at = '2026-01-02 00:00:00+00' where id = <B>;
update projects set created_at = '2026-01-01 00:00:00+00' where id = <C>;  -- 마지막에 만든 것
```

**결과: `GET /projects`가 `["C","B","A"]`를 냈다**(distinct 3). **`listProjectsForUser`의 `.orderBy('projects.created_at','asc')`가 실제로 응답 순서를 정한다.** 리뷰어는 *"트랜잭션 밖에서 커밋하며 만들어야 한다(`revisions-concurrency.test.ts`의 방식)"*고 했는데, **`withApi` 안에서 `created_at`을 손으로 갈라 놓는 편이 더 싸고 더 강하다** — 뒤집어 보므로 "정렬이 판정됐다"와 "물리적 순서와 우연히 같다"를 가른다.

**그래서 "만든 것이 목록 맨 뒤에 온다"는 참이다**(새 프로젝트의 `created_at`이 가장 크므로). **정렬이 바뀌면 화면과 서버가 갈리고**, 재조회는 그 갈림이 생기지 않는다. **다만 "모양이 달라서 꽂을 수 없다"는 더 이상 근거가 아니다** — 꽂을 수는 있고, 꽂지 않기로 하는 것이다. 그 판단은 이 층(`ApiClient`)이 아니라 목록 화면(Task 4)의 것이다.

~~**이것은 P2b-4의 `MenuNode` vs `TreeMenuNode`와 같은 부류다.**~~ **아니다** — 그쪽은 생성 응답에 `pages`·`children`이 정말로 없어서 꽂을 수 **없었다**. 여기는 꽂을 수 있는데 안 꽂는 것이다.

### D2. 잠금은 처음부터 `ref`다

**P2b-4의 실측:** `useState`로 든 잠금은 **같은 렌더 클로저의 두 번째 호출을 막지 못한다** — 같은 tick에 두 번 부르면 요청이 두 번 나갔다. 핸들러가 매 렌더 만들어지며 그 렌더의 값을 닫기 때문이다.

**표시(`busy`, state)와 잠금(`inFlight`, ref)을 갈라 둔다.** P2b-4에서 둘이 **서로 다른 케이스를 죽이는 것**으로 실증됐다.

> **P2b-4의 사고를 반복하지 마라:** 조작을 **여는** 것(`openCreate`·`askDelete`)도 잠겨야 한다. 그쪽 하나가 빠져 있어 잠금 중에 삭제 확인이 걸리고 **잠금이 풀린 뒤 클릭 한 번에 지워졌다.**

### D3. 역할 판정은 순수 함수 하나 — **앱의 첫 역할 분기다**

`PATCH`·`DELETE`가 **owner 전용**이다. `viewer`·`editor`에게 버튼을 보여 주면 반드시 403이다.

**`apps/web/src/projects/project-actions.ts`에 순수 함수를 둔다.** `edit/structure-actions.ts`·`tree/tree-actions.ts`가 형식의 선례다 — React·DOM을 모르고 화면 없이 단위 테스트된다.

```ts
export interface ProjectAbilities {
  rename: boolean   // 이름·슬러그·설명 수정
  remove: boolean
}
export function projectAbilities(role: ProjectRole | undefined): ProjectAbilities
```

**`role`을 읽는 자리가 여기 하나여야 한다.** ~~P2b-4 **이월**이~~ **→ 출처가 틀렸다(Task 7에서 찾았다).** 그 문장은 이월 문서에 없다 — **`2026-08-09-p2b4-menu-page-crud.md`(P2b-4 *계획서*)**의 두 자리다: *"지금 셸 어디에도 역할 분기가 없다(`ProjectDetail.role`을 읽는 자리가 0건 — **재라**)"*(그 단계가 역할 분기를 만들지 않는 근거)와 재라 표 #7. **이월 문서는 그 사실을 실어 나르지 않았다** — 다음 단계가 기대는 사실을 담는 문서인데 빠져 있었다.

그 수가 1이 되는 것이 이 단계의 변화다. **웨이브 2 실측: `apps/web/src`에서 `.role`을 읽는 **코드**는 `routes/project-list.tsx`의 `projectAbilities(project.role)` 한 곳이다.**

**웨이브 1 실측:** 판정 함수를 만든 뒤에도 **코드에서 `.role`을 읽는 자리는 0건이다** — 이 함수를 부르는 자리가 아직 없기 때문이다(웨이브 1은 화면을 만들지 않는다). **"1"은 목록 화면이 이 함수를 부르는 웨이브 2에서 참이 된다.** `rg`가 히트를 내더라도 그것이 `project-actions.ts`의 머리말 주석인지 코드인지 갈라서 세라.

~~**서버가 낼 코드는 재야 한다** — 설계 §10은 *"멤버지만 역할이 모자라면 403"*이라 하지만 **이 계획은 그것을 재지 않았다**(아래 표 #6).~~ **쟀다(재라 #6, Task 2):** `editor`·`viewer` 멤버는 `PATCH`·`DELETE` 둘 다 **403 `forbidden` / "이 작업을 수행할 권한이 없습니다"**, 멤버가 아닌 사용자는 둘 다 **404 `not-found` / "프로젝트를 찾을 수 없습니다"**이고 **없는 프로젝트 id와 코드·문장이 같다**(§10이 존재를 숨기려는 목적 그대로다). **설계 §10이 문서로 적은 것과 잰 것이 일치한다.** 그러므로 이 판정이 막는 것은 **403이 될 요청**이고, 404 쪽은 애초에 목록에 그 프로젝트가 실려 오지 않아 판정이 닿지 않는다.

### D4. 생성 폼은 목록 위 인라인이고 필드가 셋이다

`panels/tree-input.tsx`가 인라인 입력의 선례이지만 **그것은 필드 하나짜리다.** 여기는 이름·슬러그·설명 셋이라 **별도 컴포넌트**를 만든다.

- **`<form>`으로 감싼다.** Enter 제출이 브라우저가 주는 동작이라 키 핸들러를 만들지 않아도 된다.
- **Esc·취소로 닫는다.** blur로 닫지 않는다 — 필드 사이를 이동하는 것이 blur이기 때문이다. **P2b-4의 D6(blur는 취소)이 여기서는 성립하지 않는다.** 그 차이를 주석에 적어라.

### D5. 슬러그는 사용자가 친다 — 자동 생성하지 않는다

서버의 형식이 `^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$`다. **한글 이름에서 그 형식을 만들 방법이 없다**(음역은 새 의존이고 결과가 사람마다 다르다).

**형식 검사를 클라이언트에서 다시 하지 않는다.** 서버가 400과 함께 문장을 준다(*"슬러그는 소문자·숫자·하이픈만 쓸 수 있고…"*). 규칙을 두 곳에 두면 어긋난다 — P2b-4에서 `structureAbilities`가 카탈로그 규칙을 겹으로 갖지 않기로 한 것과 같은 판단이다.

> **정정(Task 4에서 재서 잡았다 — 계획서가 반증된 둘째 자리다).** 위 문장은 **그 문장이 어디에 오는지를 빠뜨렸다.** 서버는 이유를 `error.message`가 아니라 **`issues[]`에 넣고** 봉투에는 갈래만 적는다. 실측:
>
> ```
> POST /projects {name:'', slug:'BAD'} → 400
>   봉투   = "요청을 처리할 수 없습니다"
>   issues = [{path:'name', message:'이름을 입력하세요'},
>             {path:'slug', message:'슬러그는 소문자·숫자·하이픈만 …'}]
> ```
>
> `api/failure.tsx`의 `toFailure`는 `caught.message`만 읽었으므로 **화면에 오는 것은 "요청을 처리할 수 없습니다" 하나였다** — 즉 D5가 클라이언트 검사를 두지 않는 근거로 든 그 문장이 **화면에 닿지 않았다.** 근거가 없으면 D5는 서지 않는다.
>
> **그래서 `toFailure`가 `issues`를 쓰게 고쳤다**(코디네이터 판정 A — 폼 전용 변환을 따로 두면 같은 위험에 규칙이 둘 생긴다). **`issues`를 쓰는 것이 다른 자리에도 이로운지 재고 확정했다:** 편집 파이프라인의 422는 봉투가 *"스키마 검증에 실패했습니다"*인데 issues가 *"알 수 없는 컴포넌트 타입: 없는타입"*이라 **issues 쪽이 낫다.** `issues`가 비면(409·404·403) 봉투로 되돌아간다 — 그 폴백을 지우면 **21 사망**이라 살아 있는 자리가 많다.
>
> **여럿이면 이어 붙인다** — 서버가 폼 필드 셋을 한 번에 낸다(실측). **`path`를 필드에 붙이지는 않았다:** `issues[].path`가 필드 이름을 담고 있어 가능은 하지만, 폼이 `path`↔필드 대응표를 갖게 되어 규칙이 두 곳에 생긴다. 이 단계는 한 줄로 모아 보인다.

**중복은 409다**(실측: `{"code":"conflict","message":"이미 사용 중인 슬러그입니다"}`). 그 문장도 서버 것을 그대로 보인다.

> **한계를 재서 적는다(재라 #3, 리뷰 F8).** 서버가 주는 슬러그 문장은 **하나뿐이다** — 형식·길이·빈 문자열이 전부 `"슬러그는 소문자·숫자·하이픈만 쓸 수 있고, 하이픈으로 시작하거나 끝날 수 없습니다"`로 온다(실측: `a`×65·`""`·`Abc`·`-abc`·`가나` 전부 같은 문장, `a`×64는 201). **길이 상한 64가 정규식 `{0,62}` 안에 들어 있고 별도 메시지가 없다.** 그래서 **65자를 친 사용자는 그 문장만 보고 무엇이 틀렸는지 알 수 없다.**
>
> **그래도 D5를 뒤집지 않는다** — 클라이언트에 형식 규칙을 겹으로 두면 어긋나는 쪽의 손해가 더 크다. **Task 4가 이 한계를 안고 간다.** 서버 문장을 바꾸는 것은 `apps/api` 변경이라 이 단계의 범위 밖이고, 그렇게 하기로 한다면 별도 판단이다.

### D6. 삭제는 프로젝트 이름을 입력해야 한다

**메뉴 삭제와 손해의 크기가 다르다.** 메뉴는 자식이 있으면 서버가 409로 막지만, 프로젝트는 **아무것도 막지 않고 `ON DELETE CASCADE`로 메뉴·페이지·revision·멤버가 전부 딸려 간다**(마이그레이션 `0002`·`0003`·`0004`에서 확인했다. **실측은 Task 6이 한다**).

- `삭제`를 누르면 **그 자리에 입력이 열리고** 프로젝트 이름을 요구한다.
- **정확히 일치할 때만** `삭제` 버튼이 활성이다.
- Esc·취소·**선택이 바뀔 때**·**다른 조작을 시작할 때** 닫힌다.
- **모달을 쓰지 않는다.** 지금 앱에 모달 선례가 0건이라(P2b-4에서 센 값) 포커스 가두기·반환 포커스를 이 단계가 처음부터 만들게 된다.

### D7. 만든 뒤 그 프로젝트로 간다 — 주소가 되는 `id`를 shape가 막는다

**P2b-4가 만든 규칙 그대로다:** 주소가 되는 `id`는 **빈 문자열도 막는다.** 빈 문자열이 지나면 `/projects/`가 되고 `app.tsx`에 `*` 라우트가 없어 **화면이 통째로 빈다**(실측: `innerHTML` 0자).

`POST /projects` 응답의 `id`가 **새로 주소가 되는 값**이므로 그 shape가 막아야 한다.

> **이월 문서의 규칙:** *"shape에 새 소비자를 붙일 때 '모양이 같은가'가 아니라 **'읽는 필드가 같은가'**를 보라."*

### D8. 실패는 목록 안에 낸다

`role="alert"`. `signed-out`은 `<SignedOut />`이다(`api/failure.tsx`의 규칙을 다시 판정하지 않는다).

**조회 실패(`state.failure`)와 조작 실패(`failure`)를 갈라 둔다** — P2b-4에서 그 둘이 독립 상태라 *"재조회하면 실패 문장이 덮인다"*가 **재조회가 실패할 때만** 참이었다. 같은 실수를 하지 마라.

---

## 계획이 재지 않은 것 — 구현자가 재야 한다

**추측으로 채우지 마라.** P2b-4에서 이 표에 남긴 일곱 중 여섯이 실측으로 정해졌고, **계획이 확정해 적은 산문은 네 번 자기 케이스와 어긋났다.**

| # | 무엇 | 왜 중요한가 | 어느 태스크 |
|---|---|---|---|
| 1 | ~~**`POST /projects` 응답에 정말 `role`이 없는가.**~~ **닫혔다 — `role`이 있다.** 키 집합 `["description","id","name","role","slug"]`, `role: "owner"` | D1의 근거 하나가 반증됐고 타입이 `ProjectDetail`로 갈렸다 | Task 1(완료) |
| 2 | ~~**슬러그 중복이 409인가.**~~ **닫혔다 — 409다.** `{"code":"conflict","message":"이미 사용 중인 슬러그입니다"}` | Task 4가 그 문장을 보인다 | Task 1 수정(완료) |
| 3 | ~~**슬러그 형식 위반이 400인가. 어떤 문장인가**~~ **닫혔다 — 400이고 문장이 하나뿐이다.** `issues[0].path="slug"`, message `"슬러그는 소문자·숫자·하이픈만 쓸 수 있고, 하이픈으로 시작하거나 끝날 수 없습니다"`. **`a`×65·`""`·`Abc`·`-abc`·`가나`가 전부 같은 문장**이고 `a`×64는 201이다 — **길이 초과에서 그 문장은 원인을 말하지 않는다**(D5 참고) | D5가 클라이언트 검사를 안 두는 근거다 | Task 1 수정(완료) |
| 4 | ~~**빈 갱신 본문이 400인가.**~~ **닫혔다(Task 1이 미리 쟀다) — 400이다.** `PATCH /projects/:id {}` → `bad-request` / issues `[{"path":"","message":"변경할 값이 없습니다"}]`로 메뉴·페이지와 **같은 코드·문장**이다. `updateBody` 가드를 그대로 재사용했다 | Task 5의 케이스 8이 이 값을 쓴다 | Task 1(완료) |
| 5 | **`DELETE /projects` 뒤 그 프로젝트의 메뉴·페이지·revision이 정말 사라지는가** | D6이 이름 입력을 요구하는 근거다. **CASCADE를 소스로만 읽었다** | Task 6 |
| 6 | ~~**owner가 아닌 멤버가 `PATCH`/`DELETE`를 부르면 403인가 404인가**~~ **닫혔다 — 403이다.** `editor`·`viewer` 멤버가 `PATCH`·`DELETE` 넷 다 `403 forbidden`, 멤버가 아닌 사용자는 넷 다 `404 not-found`(없는 프로젝트 id와 같은 코드·문장) | 설계 §10과 일치한다 | Task 2(완료) |
| 7 | ~~**`apps/web/src`에서 `.role`을 읽는 자리가 이 단계 뒤에 몇인가**~~ **닫혔다 — 1이다.** `routes/project-list.tsx`의 `projectAbilities(project.role)` 하나(웨이브 1 시점에는 0이었다 — 부르는 자리가 없었다) | ~~이월 문서가~~ **P2b-4 계획서가** "0건"을 근거로 판단을 세웠다(출처를 Task 7에서 정정했다) | Task 2 → **웨이브 2(완료)** |

1~6은 서버 동작이다. `apps/api/test/`의 하네스로 재는 것이 가장 싸다 — **api 테스트는 Postgres 하나(호스트 포트 5433)를 공유하므로 다른 워커와 동시에 돌리지 마라.**

**잰 값을 `apps/web` 쪽 주석에 옮겨 적어라** — 그 값을 믿는 코드가 거기 있다.

---

## 파일 구조

**Create:**

| 파일 | 책임 |
|---|---|
| `apps/web/src/projects/project-actions.ts` | 역할 판정. **순수 함수, React·DOM·`fetch`를 모른다** |
| `apps/web/src/projects/use-project-commands.tsx` | 조회·재조회·잠금·조작 묶음. 화면이 부르는 유일한 관문 |
| `apps/web/src/projects/project-form.tsx` | 생성·수정 폼(필드 셋) |
| `apps/web/src/projects/delete-confirm.tsx` | 이름 입력 확인 |

**Modify:**

| 파일 | 무엇 |
|---|---|
| `apps/web/src/api/types.ts` | **`ProjectDetail`이 생성·갱신 응답 타입이기도 하다**(실측: 재라 #1 — 네 응답의 키 집합이 같다). 원래 이 줄은 *"`ProjectSummary`를 응답 타입으로 쓴다"*였고 틀렸다 |
| `apps/web/src/api/client.ts` | CRUD 셋 |
| `apps/web/src/api/http-client.ts` | 구현. **새 shape를 만들지 않고 `SHAPES.projectDetail`을 지난다** — 원래 이 줄은 `SHAPES.projectSummary`였는데, 응답이 `ProjectDetail`이고 `createProject`의 하중 `id`가 그 검사가 이미 보는 것의 부분집합이라 둘로 나눌 근거가 없다(같은 내용의 shape 둘은 한쪽만 고쳐지는 자리가 된다) |
| `apps/web/src/routes/project-list.tsx` | 훅 소비자로. 폼·확인 붙이기 |
| `apps/web/src/shell.css` | 새 클래스(**`wb-shell-` 접두어 필수**) |

**Test:** `apps/web/test/api/http-client.test.ts`(수정) · `apps/web/test/projects/project-actions.test.ts` · `apps/web/test/routes/project-crud.test.tsx` · `apps/web/test/routes/project-list.test.tsx`(수정)

---

## Task 1: `ApiClient`에 CRUD 셋을 더한다

**Files:**
- Modify: `apps/web/src/api/types.ts`, `apps/web/src/api/client.ts`, `apps/web/src/api/http-client.ts`
- Test: `apps/web/test/api/http-client.test.ts`

**Interfaces (Produces):**

```ts
// api/client.ts — ApiClient에 추가
/**
 * **응답에 `role: "owner"`가 실려 온다 — 목록 항목과 같은 모양이다(실측: 재라 #1).**
 * 이 자리는 원래 `Promise<ProjectSummary>`로 적혀 있었고 그것은 틀렸다.
 */
createProject(body: { name: string; slug: string; description?: string | null }): Promise<ProjectDetail>
updateProject(
  projectId: string,
  body: { name?: string; slug?: string; description?: string | null },
): Promise<ProjectDetail>
deleteProject(projectId: string): Promise<void>
```

- [x] **Step 1: 재라 #1 — `POST /projects` 응답의 키 집합** — **쟀다. `role`이 있다**(위 D1의 정정).

`apps/api/test/` 하네스로 프로젝트를 만들어 **응답의 키를 그대로 적어라.** `role`이 있으면 이 태스크의 타입이 틀린 것이고 **D1의 근거도 하나 없어진다** — 그렇게 보고하라.

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`http-client.test.ts`의 기존 관례(가짜 `fetch`로 `init`을 단언한다)를 따른다.

```ts
it('만든 프로젝트의 id가 계약과 다르면 ApiError를 던진다', async () => {
  // 그 값이 곧 주소가 된다(D7). 빈 문자열이 지나면 /projects/ 가 되고 app.tsx에
  // `*` 라우트가 없어 화면이 통째로 빈다 — P2b-4가 같은 부류를 셋 막았다.
  for (const bad of [undefined, 42, null, '']) { /* … 각각 ApiError */ }
})

it('설명을 주지 않으면 그 키를 만들지 않는다', async () => {
  // 서버의 CreateProjectBody는 z.strictObject다 — 선언되지 않은 키는 그 자체로 400이고,
  // `undefined`를 실은 키가 통과하는 것은 JSON.stringify가 지워 주는 우연이다.
  expect(JSON.parse(String(init.body))).toEqual({ name: '가', slug: 'ga' })
})

it('빈 갱신 본문은 그 자리에서 거절한다', async () => {
  // P2b-4의 updateBody 가드와 같은 자리다. **재라 #4를 여기서 미리 쟀다** —
  // `PATCH /projects/:id {}` → 400 bad-request / "변경할 값이 없습니다"로 메뉴·페이지와
  // 코드·문장이 같다. 그래서 `updateBody`를 그대로 재사용한다.
})
```

- [ ] **Step 3: 실패를 확인한다**

```bash
pnpm vitest run apps/web/test/api/http-client.test.ts
```
Expected: FAIL — `client.createProject is not a function`

- [ ] **Step 4: 구현한다**

`SHAPES`에 한 줄을 더한다. **`request`가 shape를 필수로 받으므로 빠뜨리면 컴파일 에러다.**

~~**`SHAPES.projectDetail`을 그대로 쓰지 마라** — 그것은 `role`을 요구하지 않지만 **읽는 필드가 다르다**(D7).~~ **전제가 반증돼 반대로 갔다(코디네이터 판정).** `createProject`의 하중은 `id`(주소가 된다) 하나이고 그것은 `isProjectDetail`이 **이미 보는 것의 부분집합**이다(그 검사가 `id !== ''`를 막는다). 별도 shape를 두면 내용이 같은 둘이 생겨 한쪽만 고쳐지는 자리가 되고 더 약한 쪽이 같은 계약을 통과시키게 된다. **P2b-4가 "재사용하지 마라"고 한 근거는 "읽는 필드가 다른데 표를 갱신하지 않았다"였다 — 규칙이 아니라 그 근거를 따랐다.** 다만 **소비자별 하중은 표로 적는다**(그것이 원래 요구의 알맹이다): `listProjects`·`getProject` → `id`(주소)·`name`, `createProject` → **`id`가 주소가 된다**, `updateProject` → 읽는 필드 없음. **`name`까지 요구하는 것이 `createProject`에게는 넓다는 사실도 함께 적는다.**

`updateBody`(빈 본문 가드)는 P2b-4가 만든 것을 재사용하라 — **새로 만들지 마라.**

- [ ] **Step 5: 통과를 확인한다**

- [ ] **Step 6: 구분력 실증**

`id` 빈 문자열 검사를 지워 새 케이스가 죽는지, 본문 만들기를 항등으로 바꿔 죽는지 각각 확인하고 복구한다. **죽지 않으면 덮지 말고 그대로 보고하라.**

- [ ] **Step 7: 커밋**

```bash
git add apps/web/src/api/types.ts apps/web/src/api/client.ts apps/web/src/api/http-client.ts apps/web/test/api/http-client.test.ts
git commit -m "feat(web): 프로젝트 CRUD를 ApiClient에 더한다"
```

---

## Task 2: 역할 판정 순수 함수

**Files:**
- Create: `apps/web/src/projects/project-actions.ts`
- Test: `apps/web/test/projects/project-actions.test.ts`

**Interfaces (Produces):** 위 D3 참조.

**케이스:**

1. `role`이 `undefined`면 전부 `false`
2. `viewer`면 전부 `false`
3. `editor`면 전부 `false`
4. `owner`면 전부 `true`
5. **계약에 없는 문자열이 오면 전부 `false`** — 서버가 새 역할을 더해도 조용히 열리지 않는다
6. **`ProjectRole` 유니온의 모든 값이 케이스에 나온다** — 손목록을 쓰지 말고 유니온에서 만들어 대조하라. **역할이 늘면 여기서 죽어야 한다**(P2b-4의 `listComponents` 대조와 같은 근거)

- [ ] **Step 1: 케이스 1~4를 쓰고 실패를 확인한다**

```ts
import { describe, expect, it } from 'vitest'
import { projectAbilities } from '../../src/projects/project-actions'

describe('projectAbilities', () => {
  it('역할을 모르면 아무것도 못 한다', () => {
    expect(projectAbilities(undefined)).toEqual({ rename: false, remove: false })
  })
  it('owner만 이름을 바꾸고 지울 수 있다', () => {
    expect(projectAbilities('owner')).toEqual({ rename: true, remove: true })
    expect(projectAbilities('editor')).toEqual({ rename: false, remove: false })
    expect(projectAbilities('viewer')).toEqual({ rename: false, remove: false })
  })
})
```

- [ ] **Step 2: 구현한다.** 머리말에 **왜 판정이 한 자리여야 하는지**(D3)를 적어라

- [x] **Step 3: 재라 #6 — owner가 아닌 멤버의 `PATCH`/`DELETE`** — **쟀다. 멤버는 403, 비멤버는 404**(위 D3의 정정).

`apps/api/test/` 하네스로 `editor`·`viewer` 멤버를 만들어 `PATCH`·`DELETE`를 부르고 **상태 코드와 `code`를 그대로 적어라.** 설계 §10은 403이라 하지만 **그것은 문서를 읽은 것이지 잰 것이 아니다.**

**멤버가 아닌 사용자**도 재라 — §10은 404라고 한다.

- [ ] **Step 4: 재라 #7 — `.role`을 읽는 자리를 센다**

```bash
rg -n "\.role\b" apps/web/src
```

**이 파일 하나가 아니면 판정이 흩어진 것이다.** 센 값을 주석과 보고에 적어라.

- [ ] **Step 5: 케이스 5·6을 채운다**

- [ ] **Step 6: 구분력 실증** — `owner` 비교를 항상 참으로 바꿔 케이스 2·3이 죽는지 재라

- [ ] **Step 7: 커밋**

---

## Task 3: 목록 조회·잠금을 훅으로 옮긴다

**Files:**
- Create: `apps/web/src/projects/use-project-commands.tsx`
- Modify: `apps/web/src/routes/project-list.tsx`
- Test: `apps/web/test/routes/project-list.test.tsx`(수정)

**Interfaces (Produces):**

```ts
export type ProjectLoadState =
  | { status: 'loading' }
  | { status: 'ready'; projects: ProjectDetail[] }
  | { status: 'failed'; failure: Failure }

export interface ProjectCommands {
  state: ProjectLoadState
  /** 조작이 나가 있는 동안 `true`. 버튼 표시용이다(D2). */
  busy: boolean
  /** 마지막 조작의 실패. **조회 실패와 다른 상태다**(D8). */
  failure: Failure | null
}
```

이 태스크가 만드는 것은 **뼈대까지다.**

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```tsx
it('조회 실패와 조작 실패가 서로를 덮지 않는다', async () => {
  // D8 — P2b-4에서 이 둘을 한 상태로 보다 근거가 어긋났다.
})
```

- [ ] **Step 2: 실패를 확인한다**

- [ ] **Step 3: `use-project-commands.tsx`를 만든다**

`project-list.tsx`의 `useEffect` 조회를 **그대로 옮긴다**(`alive` 플래그·try/catch·`setState({status:'loading'})`의 근거 주석도 함께). 재조회 함수를 밖으로 낸다.

**잠금은 `useRef`, 표시는 `useState`다**(D2). **P2b-4의 실측을 주석에 근거로 적어라 — 여기서 다시 잴 필요는 없지만, "state로는 왜 안 되는가"를 적어야 다음 사람이 되돌리지 않는다.**

- [ ] **Step 4: `project-list.tsx`를 훅 소비자로 바꾼다.** **머리말의 *"읽기 전용이다"*를 고쳐라** — 옛 근거를 남기면 다음 사람이 그것을 지키려다 되돌린다(P2b-4의 D4와 같은 자리)

- [ ] **Step 5: 통과시키고 `pnpm test`·`pnpm typecheck`를 돌린다**

- [ ] **Step 6: 구분력 실증** — 두 실패를 한 상태로 합쳐 새 케이스가 죽는지 재라

- [ ] **Step 7: 커밋**

---

## Task 4: 프로젝트 만들기

**Files:**
- Create: `apps/web/src/projects/project-form.tsx`
- Modify: `apps/web/src/projects/use-project-commands.tsx`, `apps/web/src/routes/project-list.tsx`, `apps/web/src/shell.css`
- Test: `apps/web/test/routes/project-crud.test.tsx`

**케이스:**

1. `새 프로젝트`를 누르면 폼이 열리고 **포커스가 첫 필드로 간다**
2. 세 필드를 채워 제출하면 `createProject({name, slug, description})`이 나간다
3. **설명을 비우면 그 키가 본문에 없다**(Task 1의 계약)
4. **성공하면 목록을 다시 받는다** — 두 번째 `listProjects` 호출을 센다
5. **만든 프로젝트로 이동한다**(D7) — 응답의 `id`가 주소에 들어간다
6. **Esc·취소로 닫히고 요청이 나가지 않는다**
7. **필드 사이를 옮겨도 닫히지 않는다**(D4 — blur로 닫지 않는다)
8. **이름이나 슬러그가 비면 제출되지 않는다**
9. **슬러그가 중복이면 서버 문장이 남고 목록을 다시 받지 않는다**(재라 #2의 값)
10. **슬러그 형식이 틀리면 서버 문장이 남는다**(재라 #3 — 클라이언트가 미리 막지 않는다, D5). **그 문장은 `issues[0].message`에서 온다**(위 D5의 정정) — 봉투 문장(`요청을 처리할 수 없습니다`)이 아니라 `슬러그는 소문자·숫자·하이픈만 …`이 남아야 한다. **길이 초과(65자)도 같은 문장이다** — 그 문장이 원인을 말하지 않는다는 것을 케이스로 고정해 두면 서버 문구가 나아질 때 여기가 알려 준다
11. **요청이 나가 있는 동안 폼과 버튼이 잠긴다**(D2) — **여는 것도 잠긴다**

- [ ] **Step 1: 재라 #2·#3을 먼저 재라.** 케이스 9·10이 그 값을 쓴다

- [ ] **Step 2: 케이스 1~5를 쓰고 실패를 확인한다**

- [ ] **Step 3: `project-form.tsx`와 훅의 조작을 구현한다**

**포커스는 `ref` + `useEffect`로 준다.** **P2b-4의 실측:** `autoFocus`와 동치인 경우가 있었다(툴바가 `key`로 새 인스턴스를 만들면 다시 걸린다). **여기서 어느 쪽인지 재고 주석에 적어라** — 이 폼은 `key`로 다시 마운트되지 않을 수 있다.

- [ ] **Step 4: 케이스 6~11을 채운다**

- [ ] **Step 5: 구분력 실증**

빈 필드 가드를 지워 케이스 8이, 잠금을 지워 11이, 재조회를 지워 4가 죽는지 각각 재라. **11은 "여는 것"과 "제출"을 따로 재라** — P2b-4에서 여는 쪽 하나가 빠져 사고가 났다.

- [ ] **Step 6: 커밋**

---

## Task 5: 이름·슬러그·설명 수정

**Files:** Modify: `apps/web/src/projects/use-project-commands.tsx`, `apps/web/src/routes/project-list.tsx`, `apps/web/src/projects/project-form.tsx` · Test: `apps/web/test/routes/project-crud.test.tsx`

**케이스:**

1. **`owner`인 항목에만 `수정` 버튼이 있다**(D3) — `viewer`·`editor` 항목에는 없다
2. 누르면 폼이 **지금 값으로 채워져** 열린다
3. 제출하면 `updateProject(id, {name, slug, description})`이 나간다
4. **바꾸지 않은 필드도 함께 보낸다** — 값이 같은지 비교하지 않는다. **P2b-4의 실측:** 서버는 제목을 정규화하지 않으므로 비교가 사용자를 막지 않지만, **여기서는 필드가 셋이라 부분 갱신과 전체 갱신이 갈린다.** **어느 쪽으로 할지 재서 정하고 근거를 적어라**
5. **성공하면 목록을 다시 받는다**
6. **중복 슬러그 409의 문장이 남는다**
7. Esc·취소로 닫힌다
8. **빈 본문이 만들어지는 경로가 없다**(재라 #4) — 있으면 Task 1의 가드가 던진다

> **케이스 2·4가 만드는 모양을 조심하라(리뷰 F2, Task 1 수정에서 닫았다).** *"지금 값으로 채워져"* + *"바꾸지 않은 필드도 함께 보낸다"*는 `updateProject(id, { ...project, name: 새이름 })`을 쓰기 쉽게 만든다. **그 스프레드에는 `id`·`role`이 딸려 오고, 서버는 그것을 `400 인식할 수 없는 키: "id", "role"`로 거절한다**(실측).
>
> **타입이 그것을 막지 못한다 — 쟀다.** 초과 속성 검사는 **리터럴에 직접 적은 키**에만 걸린다: 변수로 넘기면 `tsc` 0 에러, 키를 적은 리터럴만 `TS2353`, **스프레드 리터럴은 0 에러**다.
>
> **그래서 `http-client.ts`의 `declaredOnly`가 선언된 키만 골라 담는다**(키 목록은 `BODY_KEYS`).** 즉 위 모양을 써도 요청은 정상이다. **다만 그 사실에 기대어 응답 객체를 그대로 넘기는 코드를 쓰지는 마라** — 화면이 무엇을 보내는지가 폼 상태에 남아 있어야 케이스가 그것을 읽을 수 있다.

- [ ] **Step 1: ~~재라 #4를 재라~~ 닫혔다(Task 1이 쟀다) — `PATCH {}` → 400 `변경할 값이 없습니다`**

- [ ] **Step 2: 케이스 1~3을 쓰고 실패를 확인한다**

- [ ] **Step 3: 구현한다.** 생성 폼을 **재사용할지 나눌지 정하라** — 두 폼의 필드가 같고 제출만 다르다. **나누면 한쪽만 고치는 자리가 생기고, 합치면 분기가 는다.** 정한 근거를 적어라

- [ ] **Step 4: 케이스 4~8을 채운다**

- [ ] **Step 5: 구분력 실증** — `owner` 판정을 지워 케이스 1이 죽는지 재라

- [ ] **Step 6: 커밋**

---

## Task 6: 삭제

**Files:**
- Create: `apps/web/src/projects/delete-confirm.tsx`
- Modify: `apps/web/src/projects/use-project-commands.tsx`, `apps/web/src/routes/project-list.tsx`
- Test: `apps/web/test/routes/project-crud.test.tsx`

**케이스:**

1. **`owner`인 항목에만 `삭제` 버튼이 있다**
2. 누르면 **입력이 열리고 요청이 나가지 않는다**
3. **이름이 정확히 일치할 때만 확정 버튼이 활성이다**
4. **앞뒤 공백이 붙으면 활성이 아니다** — **재라: 그것이 옳은가.** 서버는 이름을 정규화하지 않는다(P2b-4의 실측). 판단과 근거를 적어라
5. 일치하는 이름을 넣고 확정하면 `deleteProject(id)`가 나간다
6. **Esc·취소로 닫힌다**
7. **다른 항목의 삭제를 시작하면 앞의 확인이 닫힌다**
8. **다른 조작을 시작하면 닫힌다**
9. 성공하면 목록을 다시 받는다
10. **잠금 중에는 확인이 열리지 않는다**(D2 — P2b-4의 사고 자리)
11. 실패하면 서버 문장이 남고 목록을 다시 받지 않는다

- [ ] **Step 1: 재라 #5 — CASCADE 실측**

`apps/api/test/` 하네스로 **메뉴·페이지·revision이 있는 프로젝트**를 만들고 `DELETE` 뒤 각 테이블의 행 수를 세어라. **잰 값을 `delete-confirm.tsx`의 머리말에 적어라** — 이름 입력을 요구하는 근거가 그것이다.

**사용자에게 보이는 문안에도 무엇이 사라지는지 적어라.** 다만 **수를 적지 마라**(세지 않았다면). 부류로 적어라.

- [ ] **Step 2: 케이스 1~3을 쓰고 실패를 확인한다**

- [ ] **Step 3: 구현한다**

- [ ] **Step 4: 케이스 4~11을 채운다**

- [ ] **Step 5: 구분력 실증**

이름 비교를 항상 참으로 바꿔 케이스 3이, 잠금을 지워 10이, 확인 해제를 지워 7·8이 죽는지 각각 재라.

- [ ] **Step 6: 커밋**

---

## Task 7: 통합과 마지막 훑기

**Files:** Test: `apps/web/test/routes/project-crud.test.tsx` · 필요하면 위 파일들

**케이스:**

1. **만들기 → 수정 → 삭제를 한 화면에서 이어서 한다.** 각 단계 뒤 목록이 새 상태를 보인다
2. **`viewer`·`editor`·`owner`가 섞인 목록에서 버튼이 역할대로 나온다**
3. **조회 실패·조작 실패·`signed-out`이 각자 자리에 나온다**(D8)
4. **`shell-css.test.ts`·`store-access.test.ts`가 통과한다**
5. **Tab 정지점을 센다** — 폼 열림/닫힘, 확인 열림/닫힘 각각. **P2b-4가 그 수로 설계를 갈랐다**

- [ ] **Step 1: 케이스를 쓰고 통과시킨다**

- [ ] **Step 2: 마지막 훑기 — 같은 사실을 말하는 다른 곳**

```bash
rg -n "읽기 전용|role 을 읽는 자리|\.role\b" apps/web docs
rg -n "0건" docs/superpowers/plans/2026-08-09-p2b4-carryforward.md
```

~~**P2b-4 이월의 *"`.role`을 읽는 자리 0건"*이 이 단계로 거짓이 된다.** 그 문서를 고쳐라~~ — **출처가 틀렸다.** 훑어 보니 그 문장은 **이월 문서에 없고** P2b-4 *계획서*(`2026-08-09-p2b4-menu-page-crud.md`)의 39행·156행에 있다. 그쪽은 **그 단계 시점의 기록**이고 자기 범위를 정한 근거라 고치지 않았다 — 대신 **이월 문서에 오늘의 값을 실어** 다음 단계가 기대는 사실로 남겼다(그것이 이월 문서의 일이다).

**이것이 이 사이클에서 "문서의 한 줄만 보고 확정했다"의 셋째 사례다**(D1의 `role`, D5의 issues 위치에 이어). 셋 다 **원문을 열어 보지 않고 인용했다.**

**P2b-4에서 "한 곳만 고치고 다른 곳을 놓치는" 패턴이 반복됐고 `grep`이 유일하게 작동한 방법이었다.**

- [ ] **Step 3: 커밋**

---

## 실행 시 유의

**웨이브는 둘이다.** Task 1·2는 화면 없이 돌고 서로 독립이다. Task 3~7은 목록 화면이다.

**웨이브 1이 끝나면 화면에는 아무 변화가 없다.** 정상이다.

**api 테스트를 도는 워커를 동시에 여럿 띄우지 않는다.** Postgres 하나를 공유한다.

**계획서가 틀렸다고 판단되면 `orca orchestration ask`로 물어라.** **P2b-4에서 계획서 산문이 자기 케이스와 네 번 어긋났고 네 번 다 케이스가 옳았다.**

**리뷰 지적을 그대로 받아 적지 마라.** P2b-4에서 구현자가 리뷰·판정의 범위를 **다섯 번** 넓혔고 다섯 번 다 옳았다.

**0 사망 변이는 진단까지 하라.** "케이스를 더하자"가 항상 답은 아니지만, **"잉여니 걷어내자"도 항상 답은 아니다** — P2b-4에서 0 사망이던 가드가 **다음 웨이브에 2 사망이 됐다**(단축키가 `disabled`를 우회하면서).

## Self-Review

**Spec 대조.** 설계 §10의 권한 모델(owner만 수정·삭제)이 D3·Task 2·5·6에 있다. §10의 *"멤버지만 역할이 모자라면 403"*은 **재라 #6으로 보냈고 Task 2가 쟀다 — 문서와 실측이 일치했다**(403/404). 멤버 초대는 "이 단계가 만들지 않는 것"에 근거와 함께 적었다.

**타입 일관성.** ~~`ProjectSummary`(생성 응답)와 `ProjectDetail`(목록 항목)이 **다른 타입이고 그 사실을 D1이 근거로 쓴다**~~ — **반증됐다(재라 #1).** 프로젝트를 내는 응답 넷(`POST`·`GET` 목록 항목·`GET :id`·`PATCH`)이 전부 `ProjectDetail`이고 키 집합이 같다. `ProjectSummary`는 `ProjectDetail`이 상속하는 공통 필드로만 남는다 — **그것만 오는 응답은 없다.** `ProjectAbilities`(Task 2)가 Task 5·6에서 같은 이름으로 쓰인다. `ProjectCommands`는 Task 3에서 뼈대가 서고 Task 4·5·6이 필드를 더한다.

**산문과 케이스 대조**(P2b-4의 반복 결함에 대한 대응). 이 계획이 **확정해 적은 근거**는 D1~D8이고, 각각을 케이스와 맞대 본 결과:

- **D1**은 Task 1 Step 1(재라 #1)이 검증한다 — 산문이 틀리면 거기서 죽는다.
- **D2**는 Task 4 케이스 11·Task 6 케이스 10이 지킨다.
- **D3**은 Task 5 케이스 1·Task 6 케이스 1이 지킨다.
- **D4의 "blur로 닫지 않는다"**는 Task 4 케이스 7이 지킨다.
- **D5의 "클라이언트에서 형식을 다시 보지 않는다"**는 Task 4 케이스 10이 지킨다.
- **D6**은 Task 6 케이스 3·4가 지키고, 그 근거(CASCADE)는 재라 #5가 검증한다.
- **D7**은 Task 1의 `id` 케이스와 Task 4 케이스 5가 지킨다.
- **D8**은 Task 3 Step 1과 Task 7 케이스 3이 지킨다.

**지키는 케이스가 없는 확정 산문은 없다.** 있으면 그것이 다음 사이클의 다섯 번째 사례가 된다.
