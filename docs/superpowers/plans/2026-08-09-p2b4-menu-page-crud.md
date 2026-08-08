# P2b-4 메뉴·페이지 CRUD 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 에디터 안에서 메뉴와 페이지를 만들고 이름을 바꾸고 지우고 옮길 수 있게 한다.

**Architecture:** 구조 편집(P2b-2·P2b-3)과 **다른 경로다.** 서버가 revision을 남기지 않고 undo도 없으므로 낙관 적용·pending 큐·`ops`가 전부 없다. **요청 하나 → 성공하면 트리 재조회**가 전부이고, 그동안 조작을 잠근다. 새로 만드는 것은 (1) `ApiClient`의 CRUD 여섯, (2) 조작 가능 여부를 판정하는 순수 함수, (3) 메뉴 트리의 선택 상태와 하단 툴바다.

**Tech Stack:** TypeScript(ESM, strict + `noUncheckedIndexedAccess`) · React 19 · Vite 6 · react-router 7 · vitest 3 + React Testing Library + jsdom

## Global Constraints

근거 문서는 넷이다. **순서대로 읽어라.**

- `docs/superpowers/plans/2026-08-08-p2b3-carryforward.md` — 앞 단계의 이월. "반복된 결함과 그 대응"이 이 계획의 작업 규칙을 정한다.
- `docs/superpowers/plans/2026-08-07-p2b2-carryforward.md` — 편집 파이프라인의 계약. **이 단계는 그 파이프라인을 쓰지 않지만**, 같은 화면에 살고 실패 표시가 겹치는 자리가 있다.
- `apps/api/README.md` — 엔드포인트 계약표(줄 121~132가 이 단계의 전부다).
- `docs/superpowers/specs/2026-08-03-wirebound-design.md` §9 — *"메뉴 폴더와 페이지를 한 트리에 표시하고 드래그로 정렬한다. 한 메뉴 아래 여러 페이지를 둘 수 있어 '상황별 화면'이 자연스럽게 표현된다."*

제약:

- **서버는 건드리지 않는다.** `apps/api`에 필요한 것이 이미 다 있다. 서버를 고쳐야 한다고 판단되면 **고치지 말고 `orca orchestration ask`로 물어라** — 그 판단 자체가 이 계획의 전제를 뒤집는다.
- **의존 방향은 한 방향이다:** `schema` ← `renderer` ← `apps/web`. `apps/web`이 `apps/api`에서 타입을 import하지 않는다(`api/types.ts` 머리말의 근거).
- **`apps/web`에 새 런타임 의존을 들이지 않는다.** 지금 의존은 `react`·`react-dom`·`react-router`뿐이다.
- **사용자 대면 메시지와 주석은 전부 한국어.** 주변 코드의 주석 밀도·어투(무엇이 아니라 **왜**)를 따른다.
- Node ≥ 22.9.0, ESM only, TypeScript strict + `noUncheckedIndexedAccess`, `verbatimModuleSyntax`. `pnpm typecheck`가 exit 0이어야 한다.
- **`pnpm test`가 초록이어야 한다.** 이 계획을 쓴 시점은 **1302 tests / 72 files**다 — **기준선일 뿐 목표가 아니고, 웨이브마다 는다.**
- 커밋할 파일은 **경로로 명시해서** stage한다. `git add -A` 금지.
- **완결성을 주장하지 마라.** "전부"·"항상"·"유일"은 **측정한 뒤에만, 측정과 함께.**
- **인과 문장을 쓸 때는 그 X를 심어 Y를 관측한 뒤에 써라.** P2b-2에서 다섯, P2b-3에서 다섯(웨이브 1에 넷)이 재현되지 않았고 전부 "잰 것과 다른 조건을 적었다"였다. **자기 커밋이 만든 구조**에 대한 인과가 특히 위험하다. 못 쟀으면 **"재지 못했다"고 적어라.**
- **같은 사실을 말하는 다른 곳을 전부 찾아 함께 고쳐라.** P2b-3에서 이 규칙이 **세 번** 어겨졌다. **`grep`으로 같은 문장을 훑는 것이 유일하게 작동한 방법이었다** — 규칙을 아는 것만으로는 안 지켜진다.

## 이 단계가 만들지 않는 것

- **드래그 정렬.** 설계 §9가 적었지만 이 단계는 버튼·키보드로만 옮긴다. P2b-3이 구조 트리에서 같은 판단을 했고 근거도 같다 — **접근성상 버튼·키보드 경로가 먼저 있어야 한다.** 이 단계가 끝나면 드래그는 **새 기능이 없는 순수 편의 층**이 된다.
- **프로젝트 CRUD.** 프로젝트 만들기·이름 바꾸기·삭제는 다른 화면(`routes/project-list.tsx`)의 일이다.
- **멤버·권한 화면.** 서버에 `/members`가 있지만 별도 단계다.
- **페이지 설명(`description`) 편집.** 서버의 `PATCH /pages`가 받지만, 설계 §9는 그것을 **우측 패널의 "페이지 설명" 탭**에 두기로 했다. 트리에서 편집하지 않는다.
- **`viewer` 역할에서 조작을 감추는 것.** 지금 셸 어디에도 역할 분기가 없다(`ProjectDetail.role`을 읽는 자리가 0건 — **재라**). 이 단계가 그 첫 자리가 되면 규칙이 트리에만 생긴다. 서버가 403으로 막고 그 문장이 실패 표시에 그대로 나온다.
- **삭제한 것 되살리기.** 서버에 그런 경로가 없다.
- **여러 항목 선택.** 선택은 하나다.

---

## 설계 결정 (계획 단계에서 확정)

### D1. 낙관 적용을 하지 않는다 — 요청 → 재조회

구조 편집과 **다른 경로다.** 근거 셋:

1. **서버가 `sortOrder`를 재번호한다.** `repos/menu.ts` 머리말: *"`sort_order`는 형제(같은 `project_id`·`parent_id`) 안에서 0부터 시작하는 연속 정수다. 이 파일의 모든 쓰기 경로(생성·이동·재정렬·삭제)가 그 불변식을 유지한 채로 끝나야 한다."* 클라이언트가 낙관적으로 계산한 순서는 그 재번호와 어긋날 수 있다.
2. **생성 응답을 트리에 그대로 꽂을 수 없다.** `POST /menu`가 주는 것은 `{id, projectId, parentId, title, sortOrder}`이고 **`pages`·`children`이 없다** — 트리 노드(`TreeMenuNode`)와 다른 모양이다.
3. **undo가 없다.** 낙관 적용의 핵심 가치인 "즉시 되돌리기"가 이 경로에는 없다. 되돌릴 것이 트리 하나뿐이라 **재조회가 곧 수렴이다.**

### D2. 큐가 아니라 잠금이다

조작이 나가 있는 동안 툴바 전체가 비활성이다. 구조 편집의 직렬화(`edit-queue.ts` + 스토어의 펌프 가드)와 **다른 장치인 이유**: 그쪽은 `baseSeq`가 앞 응답에 달려 있어 순서를 지켜야 했지만, 여기는 요청끼리 의존이 없다. **막아야 하는 것은 같은 버튼 연타와 "재조회 중에 또 조작"뿐이다.**

잠금은 훅의 `useState`에 둔다. **P2b-2의 사고(펌프 가드를 훅의 `ref`에 두어 인스턴스가 둘이 되자 `maxInFlight`가 2가 됐다)는 여기서 성립하지 않는다** — 이 훅의 인스턴스는 메뉴 트리 하나뿐이다. **그것을 재라**: 훅을 두 번 부르는 자리가 생기면 잠금이 각자 것이 된다.

### D3. 선택은 파생값이다 — 이펙트를 두지 않는다

- **열림은 주소다**(`pageId`). 지금 규칙 그대로 — `<Link>` + `aria-current="page"`.
- **선택은 트리 안 상태다.** 메뉴 또는 페이지 하나.

```ts
type TreeSelection = { kind: 'menu'; id: string } | { kind: 'page'; id: string }

// picked가 null이면 "열린 페이지가 선택된 것"으로 본다.
const selection: TreeSelection | null =
  picked ?? (pageId !== undefined ? { kind: 'page', id: pageId } : null)
```

- 메뉴를 누르면 `setPicked({ kind: 'menu', id })`
- 페이지를 누르면 `setPicked(null)` — **주소가 그 페이지를 말하므로 상태로 또 적지 않는다**

**이펙트로 동기화하지 않는 것이 요점이다.** `useEffect(() => setPicked(pageId), [pageId])` 형태면 뒤로 가기·새로고침·주소 직접 입력마다 렌더가 한 번 더 돌고, 선택이 주소보다 한 프레임 늦는 창이 생긴다. 파생이면 그 창이 없다.

**`picked`가 사라진 항목을 가리킬 수 있다**(삭제·다른 세션의 변경 뒤). 그 경우 판정이 전부 `false`여야 한다 — `structureAbilities`가 문서에 없는 노드에 `NOTHING`을 내는 것과 같은 계약이다.

### D4. 메뉴 제목은 `<button>`이 된다 — 지금 주석의 전제가 바뀐다

`panels/menu-tree.tsx`의 지금 주석:

> *"메뉴 제목은 누를 수 없다. 메뉴에는 열 문서가 없고(설계 §9의 트리에서 문서를 가진 것은 페이지뿐이다), 누를 수 있게 보이는 것은 그 자체로 거짓말이다."*

**그 문장은 "누르는 것 = 여는 것"을 전제한다.** 이 단계에서 누르는 것은 **가리키는 것**이고 그 효과(툴바가 활성화된다)가 실재하므로 전제가 바뀐다. `<span>` → `<button type="button">`으로 바꾸고 **주석도 함께 고친다** — 옛 근거를 남기면 다음 사람이 그것을 지키려다 되돌린다.

페이지는 `<Link>` 그대로다. 주소가 있는 이동이라 새 탭·주소 공유가 되어야 한다(지금 주석의 근거가 여전히 참이다).

### D5. 판정은 `tree/tree-actions.ts`가 한다 — 구조 트리와 공유하지 않는다

`edit/structure-actions.ts`가 형태의 선례다. **재사용하지 않는 이유:** 구조 트리는 `children` 배열 **하나**와 카탈로그 제약을 보고, 메뉴 트리는 `pages`·`children` **두 배열**과 서버 제약을 본다. 판정 규칙이 겹치지 않는다.

| 조작 | 메뉴를 선택했을 때 | 페이지를 선택했을 때 |
|---|---|---|
| `addMenu` (하위 메뉴 추가) | 언제나 | **불가** |
| `addPage` (페이지 추가) | 언제나 | **불가** |
| `rename` | 언제나 | 언제나 |
| `remove` | `pages`와 `children`이 **둘 다 비었을 때** | 언제나 |
| `moveUp` / `moveDown` | 앞/뒤 형제 메뉴가 있을 때 | 같은 메뉴 안 앞/뒤 페이지가 있을 때 |
| `indent` | 앞 형제 메뉴가 있을 때 | **언제나 불가** |
| `outdent` | 부모가 있을 때 | **언제나 불가** |
| `reparent` (소속 메뉴 고르기) | **불가** | 메뉴가 **둘 이상**일 때 |

**페이지의 `indent`·`outdent`가 불가한 근거:** 들여쓰기는 *"바로 앞 형제의 마지막 자식이 된다"*이다(P2b-3의 정의를 그대로 쓴다). 트리는 페이지를 먼저, 자식 메뉴를 나중에 그리므로 **페이지의 앞 형제는 항상 페이지이고 페이지는 자식을 갖지 못한다.** 내어쓰기는 그 역이라 같이 성립하지 않는다. 그래서 페이지를 다른 메뉴로 옮기는 길은 `reparent` 하나다.

**`remove`가 서버 판정과 겹치는 것은 의도다.** 서버가 FK 제약으로 409를 내지만(`repos/menu.ts`의 `HasChildrenError`), 눌러 봐야 실패할 버튼을 활성으로 두지 않는다 — P2b-2 D7·P2b-3 D3과 같은 정신이다. **겹치므로 클라이언트 판정만 지워도 사용자에게는 오류 문장으로 보인다** — 즉 이 판정의 구분력을 재려면 클라이언트 쪽 케이스가 따로 있어야 한다.

### D6. 입력은 인라인 `<input>` — Enter만 확정, Esc·blur는 취소

`window.prompt`는 jsdom에 없어 모킹이 필요하고 스타일·접근성을 다룰 수 없다.

**blur에 커밋하지 않는 것이 P2b-2와 다른 점이다.** 속성 편집은 blur/Enter 둘 다에서 커밋했는데(P2b-2의 결정) **그것은 undo가 받쳐 줬기 때문이다.** 여기는 undo가 없어 "취소하려고 다른 곳을 눌렀는데 이름이 바뀌었다"가 복구 불가한 사고다.

**빈 문자열은 보내지 않는다.** 서버의 `Title`이 `z.string().min(1)`이라 400이 되지만, 그 왕복을 만들지 않는다.

### D7. 삭제는 두 번 누르기

`삭제`를 누르면 그 버튼이 `정말 삭제합니까?`로 바뀌고, 한 번 더 눌러야 나간다. 취소되는 조건 셋: **Esc**, **선택이 바뀔 때**, **다른 조작을 시작할 때**.

모달을 쓰지 않는 근거: 지금 앱에 모달 선례가 0건이라 포커스 가두기·Esc·반환 포커스를 이 단계가 처음부터 만들게 되고, 그것을 재는 케이스가 이 단계의 나머지보다 커진다. **두 번 누르기는 같은 버튼 안에서 끝나므로 포커스가 움직이지 않는다.**

### D8. 연 페이지를 지우면 프로젝트 루트로 보낸다

`/projects/:projectId`로 `replace`한다. `replace`인 것은 뒤로 가기가 지워진 페이지로 돌아가면 404를 만나기 때문이다.

**이 단계가 앱의 첫 `useNavigate`다.** 지금 앱의 이동은 전부 렌더 시점 판정(`<Navigate>` 컴포넌트, `api/failure.tsx`의 *"컴포넌트인 것이 요점이다"*)인데, 이것은 **비동기 조작이 끝난 뒤의 명령형 이동**이라 그 관용구로 표현되지 않는다. `useNavigate`를 쓰고 그 차이를 주석에 적어라. 새 페이지를 만든 뒤 그 페이지로 가는 것도 같은 자리다.

### D9. 실패는 트리 안에 낸다 — `EditAlert`와 섞지 않는다

`shell/edit-alert.tsx`는 **편집 파이프라인의 상태**(pending·실패)를 읽는다. CRUD 실패는 그 상태와 무관하므로 섞으면 두 개의 다른 실패가 한 문장 자리를 다툰다.

트리 안에 `role="alert"`로 낸다 — `wb-shell-tree-notice`가 이미 그 자리다. **`signed-out`은 지금대로 `<SignedOut />`이다**(`api/failure.tsx`의 규칙을 다시 판정하지 않는다).

### D10. 트리 조회 상태와 조작이 한 훅에 있다

지금 `MenuTree`가 `useEffect`로 조회하고 `useState`로 상태를 든다. **그것을 `tree/use-tree-commands.tsx`로 옮긴다** — 조작이 끝나면 재조회해야 하는데, 조회가 컴포넌트 안에 있으면 툴바가 그것을 부를 길이 없다.

`MenuTree`는 훅이 준 것을 그리기만 한다. `useStructureCommands` / `StructureToolbar`의 분리와 같은 모양이다.

---

## 계획이 재지 않은 것 — 구현자가 재야 한다

**추측으로 채우지 마라.** P2b-3에서 이 자리에 남긴 여섯 중 **다섯이 계획의 추측과 갈렸다.**

| # | 무엇 | 왜 중요한가 | 어느 태스크 |
|---|---|---|---|
| 1 | **`PATCH {sortOrder: n}`의 `n`이 결과 배열의 자리인가, 원본 배열의 자리인가.** `[A,B,C]`에서 A에 `2`를 주면 `[B,C,A]`인가 `[B,A,C]`인가 | 위/아래 버튼의 목적지 계산이 여기 달렸다. **P2b-3에서 `moveNodeOps`가 정확히 이 성질로 갈렸다**(결과 기준이었다) | Task 7 |
| 2 | **`PATCH {parentId}`만 주고 `sortOrder`를 안 주면 어디에 놓이는가** | 들여쓰기·내어쓰기가 목적지 인덱스를 줘야 하는지 갈린다 | Task 8 |
| 3 | **트리 응답의 `sortOrder`가 배열 인덱스와 같은가**(0부터 연속인가) | 같으면 `sortOrder ± 1`이 곧 목적지다. 아니면 `byOrder` 정렬 뒤의 인덱스를 써야 한다 | Task 2 |
| ~~4~~ | ~~**`DELETE /menu`의 409가 자식 메뉴와 페이지 둘 다에서 나는가**~~ **닫혔다(웨이브 1 수정).** 자식 메뉴만·페이지만 **둘 다 409**(`conflict` / `하위 메뉴나 페이지가 있어 삭제할 수 없습니다`), 둘 다 없으면 204. 잰 값은 `tree/tree-actions.ts`의 `remove` 주석과 `api/client.ts`의 `deleteMenu` 주석에 있다 | ~~Task 6~~ |
| 5 | **`PATCH /pages`에 `menuNodeId`와 `sortOrder`를 함께 주면** 새 메뉴 안의 그 자리로 가는가 | `reparent`가 인덱스를 줄지 말지 | Task 9 |
| 6 | **`SHAPES.treeEnvelope`가 정말 재귀로 `pages`·`children`을 검사하는가, 그 관문을 지나지 않고 트리가 화면에 닿는 경로가 있는가** | 있으면 `tree-actions.ts`가 `edit/safe-walk.ts` 같은 방어를 해야 한다. **메뉴 트리도 오류 경계 밖이다** | Task 2 |
| 7 | **`ProjectDetail.role`을 읽는 자리가 지금 0건인가** | "이 단계가 만들지 않는 것"의 근거다. **아니면 그 절을 고쳐라** | Task 1 |

1·2·4·5는 서버 동작이다. `apps/api/test/`의 하네스로 재는 것이 가장 싸다 — **다만 api 테스트는 Postgres 하나를 공유하므로 다른 워커와 동시에 돌리지 마라.** 잰 값을 **`apps/web` 쪽 주석에 옮겨 적어라**(그 값을 믿는 코드가 거기 있다).

---

## 파일 구조

**Create:**

| 파일 | 책임 |
|---|---|
| `apps/web/src/tree/tree-actions.ts` | 판정·자리 찾기. **순수 함수, React·DOM·`fetch`를 모른다** |
| `apps/web/src/tree/use-tree-commands.tsx` | 조회·재조회·잠금·조작 묶음. 화면이 부르는 유일한 관문 |
| `apps/web/src/panels/menu-toolbar.tsx` | 트리 하단 툴바. **판정을 갖지 않는다** |
| `apps/web/src/panels/tree-input.tsx` | 인라인 입력(생성·이름 변경 공용) |
| `apps/web/src/panels/menu-picker.tsx` | 소속 메뉴 고르기 |

**Modify:**

| 파일 | 무엇 |
|---|---|
| `apps/web/src/api/types.ts` | `MenuNode` 응답 타입 |
| `apps/web/src/api/client.ts` | CRUD 여섯 |
| `apps/web/src/api/http-client.ts` | 구현 + `SHAPES.menuNode` |
| `apps/web/src/panels/menu-tree.tsx` | 선택·툴바·훅으로의 이전 |
| `apps/web/src/shell.css` | 새 클래스(**`wb-shell-` 접두어 필수** — `shell-css-guard`가 본다) |

**Test:**

`apps/web/test/api/http-client.test.ts`(수정) · `apps/web/test/tree/tree-actions.test.ts` · `apps/web/test/panels/menu-crud.test.tsx` · `apps/web/test/panels/menu-move.test.tsx` · `apps/web/test/panels/menu-keyboard.test.tsx` · `apps/web/test/panels/menu-tree.test.tsx`(수정)

---

## Task 1: `ApiClient`에 CRUD 여섯을 더한다

**Files:**
- Modify: `apps/web/src/api/types.ts`
- Modify: `apps/web/src/api/client.ts`
- Modify: `apps/web/src/api/http-client.ts`
- Test: `apps/web/test/api/http-client.test.ts`

**Interfaces (Produces):**

```ts
// api/types.ts
/**
 * `POST /api/projects/:projectId/menu`·`PATCH .../menu/:nodeId`의 응답.
 * **트리 노드(`TreeMenuNode`)와 다른 모양이다** — `pages`·`children`이 없다.
 */
export interface MenuNode {
  id: string
  projectId: string
  parentId: string | null
  title: string
  sortOrder: number
}

// api/client.ts — ApiClient에 추가
createMenu(projectId: string, body: { parentId: string | null; title: string }): Promise<MenuNode>
updateMenu(
  projectId: string,
  nodeId: string,
  body: { title?: string; parentId?: string | null; sortOrder?: number },
): Promise<MenuNode>
deleteMenu(projectId: string, nodeId: string): Promise<void>
createPage(projectId: string, body: { menuNodeId: string; title: string }): Promise<PageDetail>
updatePage(
  projectId: string,
  pageId: string,
  body: { title?: string; menuNodeId?: string; sortOrder?: number },
): Promise<PageDetail>
deletePage(projectId: string, pageId: string): Promise<void>
```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`apps/web/test/api/http-client.test.ts`에 더한다. 그 파일의 기존 관례(가짜 `fetch`를 만들어 인자를 단언한다)를 따라라.

```ts
it('선언되지 않은 키를 만들지 않는다 — undefined인 필드는 본문에서 빠진다', async () => {
  const calls: RequestInit[] = []
  const client = createHttpClient(async (_url, init) => {
    calls.push(init as RequestInit)
    return jsonResponse(200, { id: 'm1', projectId: 'p1', parentId: null, title: '가', sortOrder: 0 })
  })

  await client.updateMenu('p1', 'm1', { title: '가' })

  // 서버의 UpdateMenuBody는 z.strictObject다 — 선언되지 않은 키는 그 자체로 400이고,
  // `undefined`를 실은 키가 오늘 통과하는 것은 JSON.stringify가 지워 주는 우연이다
  // (`patchOps`가 같은 이유로 키를 만들지 않는다).
  expect(JSON.parse(String(calls[0]?.body))).toEqual({ title: '가' })
})

it('메뉴 만들기는 parentId를 null로도 싣는다', async () => {
  // parentId는 `z.uuid().nullable().optional()`이라 null이 유효한 값이다 —
  // "루트에 만든다"는 뜻이므로 키를 빼면 안 된다.
})

it('삭제는 204를 본문 없이 받는다', async () => {
  // 204에서 request가 조기 반환하므로 shape 검사에 닿지 않는다.
})

it('메뉴 응답이 계약과 다른 모양이면 ApiError를 던진다', async () => {
  // sortOrder가 문자열인 응답. **그 값을 읽는 자리가 생긴다고 적지 마라** — 아래 Step 3의
  // 정정을 보라. 검사를 두는 근거는 소비자가 아니라 `request`의 필수 shape 설계다.
})
```

- [ ] **Step 2: 실패를 확인한다**

```bash
pnpm vitest run apps/web/test/api/http-client.test.ts
```
Expected: FAIL — `client.updateMenu is not a function`

- [ ] **Step 3: 구현한다**

`SHAPES`에 한 줄을 더한다. **`request`가 shape를 필수로 받으므로 빠뜨리면 컴파일 에러다**(그 파일 머리말의 근거).

```ts
/**
 * 메뉴 노드 하나. `id`가 문자열인지·`sortOrder`가 숫자인지까지 본다.
 * **근거는 소비자가 아니다** — 아래 정정을 읽어라.
 */
menuNode: (value) =>
  isRecord(value) && typeof value['id'] === 'string' && typeof value['sortOrder'] === 'number',
```

> **정정(웨이브 1 리뷰가 잡았다 — F1).** 이 자리에 원래 *"그 `sortOrder`가 위/아래 이동의
> 목적지 계산에 그대로 들어간다(Task 7)"*라고 적혀 있었고 **그것은 거짓이다.** 같은 계획서의
> **Task 7 케이스 7**이 *"`treeSpot.index`를 쓰지 `node.sortOrder`를 쓰지 않는다"*로 정반대를
> 못박는다. 구현자가 이 산문을 그대로 코드 주석과 테스트로 옮겼고, 리뷰가 세 자리에서
> 그것을 찾았다. **P2b-3 이월의 "산문과 표가 어긋나면 표가 옳다 — 산문은 아무도 재지 않는다"가
> 이 계획서 안에서 다시 났다.**
>
> 검사 자체는 남긴다(변이 `() => true`가 2 사망). **다만 근거는 "미래의 소비자"가 아니라
> `request`가 shape를 필수로 받는다는 설계와, F2가 보여 준 "새 소비자가 붙을 때 표를
> 갱신하지 않는" 부류다.** 잴 수 없는 인과를 근거로 세우지 마라.

본문을 만들 때 **`undefined`인 키를 만들지 않는다.** `patchOps`가 `clientOpId`에 쓴 것과 같은 형태다.

- [ ] **Step 4: 통과를 확인한다**

- [ ] **Step 5: `ProjectDetail.role`을 읽는 자리를 센다**

```bash
rg -n "\.role" apps/web/src
```

**0건이 아니면 이 계획의 "이 단계가 만들지 않는 것"이 틀렸다.** 센 값을 보고에 적어라.

- [ ] **Step 6: 구분력 실증**

`SHAPES.menuNode`를 `() => true`로 바꿔 새 케이스가 죽는지 확인하고 복구한다. **죽지 않으면 덮지 말고 그대로 보고하라.**

- [ ] **Step 7: 커밋**

```bash
git add apps/web/src/api/types.ts apps/web/src/api/client.ts apps/web/src/api/http-client.ts apps/web/test/api/http-client.test.ts
git commit -m "feat(web): 메뉴·페이지 CRUD를 ApiClient에 더한다"
```

---

## Task 2: `tree/tree-actions.ts` — 판정과 자리 찾기

**Files:**
- Create: `apps/web/src/tree/tree-actions.ts`
- Test: `apps/web/test/tree/tree-actions.test.ts`

**Interfaces:**
- Consumes: `TreeMenuNode`·`TreePage` (`api/types.ts`)
- Produces:

```ts
export type TreeSelection = { kind: 'menu'; id: string } | { kind: 'page'; id: string }

export interface TreeAbilities {
  addMenu: boolean
  addPage: boolean
  rename: boolean
  remove: boolean
  moveUp: boolean
  moveDown: boolean
  indent: boolean
  outdent: boolean
  reparent: boolean
}

/** 선택 대상의 자리. 조작을 실행할 때 부모와 인덱스가 필요하다. */
export interface TreeSpot {
  /** 메뉴면 부모 메뉴 id(루트면 `null`). 페이지면 소속 메뉴 id(항상 있다). */
  parentId: string | null
  /** `sortOrder` 오름차순 형제 배열에서의 자리. */
  index: number
  siblingCount: number
}

export function treeAbilities(menu: TreeMenuNode[] | null, selection: TreeSelection | null): TreeAbilities
export function treeSpot(menu: TreeMenuNode[], selection: TreeSelection): TreeSpot | null
/** 들여쓰기 목적지 — `sortOrder` 순으로 바로 앞의 형제 메뉴. 없으면 `null`. */
export function previousMenuSibling(menu: TreeMenuNode[], menuId: string): TreeMenuNode | null
/** 내어쓰기 목적지 — 부모의 부모 id와 부모 자신의 자리. 부모가 없으면 `null`. */
export function menuOutdentTarget(menu: TreeMenuNode[], menuId: string): { parentId: string | null; index: number } | null
/** 소속 메뉴 고르기 목록. 트리 순서로 평평하게, 조상 제목을 이어 붙인 경로와 함께. */
export function flattenMenus(menu: TreeMenuNode[]): { id: string; path: string }[]
```

**케이스** (전부 `apps/web/test/tree/tree-actions.test.ts`):

1. 선택이 `null`이면 전부 `false`
2. 트리가 `null`이면 전부 `false`
3. **선택이 트리에 없는 id를 가리키면 전부 `false`** — D3의 계약
4. 루트 메뉴 하나만 있을 때: `addMenu`·`addPage`·`rename`·`remove`가 `true`, 이동은 전부 `false`
5. 페이지를 가진 메뉴: `remove`가 `false`
6. 자식 메뉴를 가진 메뉴: `remove`가 `false`
7. 형제 메뉴 셋 중 가운데: `moveUp`·`moveDown`·`indent` 전부 `true`
8. 형제 메뉴 셋 중 첫째: `moveUp`·`indent` 둘 다 `false`
9. 루트 메뉴: `outdent`가 `false`. 자식 메뉴: `true`
10. 페이지 선택: `addMenu`·`addPage`·`indent`·`outdent`가 전부 `false`, `reparent`가 `true`
11. **메뉴가 하나뿐일 때 페이지의 `reparent`가 `false`** — 옮길 곳이 자기 부모뿐이다
12. `treeSpot`이 페이지에 소속 메뉴 id를 준다
13. `treeSpot`이 루트 메뉴에 `parentId: null`을 준다
14. **`sortOrder`가 배열 순서와 다를 때 `treeSpot.index`가 `sortOrder` 정렬 기준이다** — 서버가 순서대로 준다는 것에 기대지 않는다
15. `flattenMenus`가 트리 순서로 평평하게 내고 경로에 조상 제목이 들어간다
16. **깨진 트리를 넣어도 던지지 않는다** — 아래 참조

- [ ] **Step 1: 케이스 1~3을 쓴다**

```ts
import { describe, expect, it } from 'vitest'
import { treeAbilities } from '../../src/tree/tree-actions'
import type { TreeMenuNode } from '../../src/api/types'

/** 케이스마다 손으로 만들지 않도록 최소 트리를 만드는 도우미. */
function menu(id: string, over: Partial<TreeMenuNode> = {}): TreeMenuNode {
  return { id, title: id, sortOrder: 0, pages: [], children: [], ...over }
}

describe('treeAbilities', () => {
  it('고른 것이 없으면 아무 조작도 못 한다', () => {
    expect(treeAbilities([menu('m1')], null)).toEqual({
      addMenu: false, addPage: false, rename: false, remove: false,
      moveUp: false, moveDown: false, indent: false, outdent: false, reparent: false,
    })
  })

  it('트리를 아직 받지 못했으면 아무 조작도 못 한다', () => {
    expect(treeAbilities(null, { kind: 'menu', id: 'm1' }).rename).toBe(false)
  })

  it('트리에 없는 것을 가리키면 아무 조작도 못 한다', () => {
    // 삭제 직후·다른 세션의 변경 뒤에 실제로 생기는 상태다(D3).
    expect(treeAbilities([menu('m1')], { kind: 'menu', id: 'gone' }).remove).toBe(false)
  })
})
```

- [ ] **Step 2: 실패를 확인한다.** Expected: FAIL — 모듈 없음

- [ ] **Step 3: 구현한다**

머리말에 **왜 구조 트리와 공유하지 않는지**(D5)와 **던지지 않는 계약**을 적어라.

- [ ] **Step 4: 케이스 4~15를 채우고 통과시킨다**

- [ ] **Step 5: 재라 #3 — 트리 응답의 `sortOrder`가 인덱스와 같은가**

`apps/api/test/`의 하네스로 메뉴 셋·페이지 셋을 만들고 `GET /tree`를 받아 `sortOrder` 값을 그대로 적어라. **잰 값을 `tree-actions.ts`의 `treeSpot` 주석에 옮겨라.**

- [ ] **Step 6: 재라 #6 — 깨진 트리가 화면에 닿는 경로가 있는가**

`api/http-client.ts`의 `SHAPES.treeEnvelope`·`isTreeMenuNode`를 읽고, `pages`·`children`이 배열이 아닌 트리가 `getTree`를 통과할 수 있는지 확인해라. **그다음 실제로 그런 트리를 `treeAbilities`에 넣어 던지는지 재라.**

- **던지지 않으면** 그 사실과 근거(관문이 막는다)를 주석에 적어라. `edit/safe-walk.ts` 같은 것을 만들지 마라.
- **던지면** 케이스 16을 그 입력으로 쓰고 값으로 다뤄라. **메뉴 트리도 오류 경계 밖이다** — `apps/web/src` 전체에서 경계는 캔버스의 `CanvasBoundary` 하나뿐이다.

두 갈래 중 무엇이었는지 보고에 적어라.

- [ ] **Step 7: 구분력 실증**

`remove` 판정에서 `pages.length === 0`을 지워 케이스 5가 죽는지, `children.length === 0`을 지워 케이스 6이 죽는지 각각 확인하고 복구한다. **`indent`의 "앞 형제가 있을 때"도 따로 재라** — 케이스 8이 그것을 잡아야 한다.

- [ ] **Step 8: 커밋**

```bash
git add apps/web/src/tree/tree-actions.ts apps/web/test/tree/tree-actions.test.ts
git commit -m "feat(web): 메뉴 트리 조작 가능 여부를 판정한다"
```

---

## Task 3: 선택 상태와 조회를 훅으로 옮긴다

**Files:**
- Create: `apps/web/src/tree/use-tree-commands.tsx`
- Modify: `apps/web/src/panels/menu-tree.tsx`
- Create: `apps/web/src/panels/menu-toolbar.tsx`
- Modify: `apps/web/src/shell.css`
- Test: `apps/web/test/panels/menu-tree.test.tsx`(수정)

**Interfaces (Produces):**

```ts
export type TreeLoadState =
  | { status: 'loading' }
  | { status: 'ready'; menu: TreeMenuNode[] }
  | { status: 'failed'; failure: Failure }

export interface TreeCommands {
  state: TreeLoadState
  selection: TreeSelection | null
  /** 메뉴를 고른다. `null`이면 "열린 페이지가 선택된 것"으로 되돌아간다(D3). */
  select: (selection: TreeSelection | null) => void
  abilities: TreeAbilities
  /** 조작이 하나 나가 있는 동안 `true`. 툴바 전체가 비활성이다(D2). */
  busy: boolean
  /** 마지막 조작의 실패. 다음 조작이 시작되면 `null`이 된다. */
  failure: Failure | null
}
```

이 태스크가 만드는 것은 **뼈대까지다.** 생성·이름 변경·삭제·이동은 다음 태스크들이 더한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

```tsx
it('메뉴 제목을 누르면 선택된다', async () => {
  // 지금은 <span>이라 누를 수 없다(D4).
  renderTree({ menu: [tree.menu('m1', { title: '관리' })] })
  await userEvent.click(await screen.findByRole('button', { name: '관리' }))
  expect(screen.getByRole('button', { name: '관리' })).toHaveAttribute('aria-pressed', 'true')
})

it('열린 페이지가 선택으로 시작한다', async () => {
  // picked가 null일 때 주소가 선택을 말한다(D3) — 아무것도 누르지 않아도 툴바가 산다.
  renderTree({ menu: [...], pageId: 'pg1' })
  expect(await screen.findByRole('button', { name: '이름 변경' })).toBeEnabled()
})

it('페이지를 누르면 메뉴 선택이 풀린다', async () => {
  // 주소가 그 페이지를 말하므로 picked를 null로 되돌린다(D3).
})

it('트리 조회가 실패하면 그 자리에 이유가 남는다', async () => {
  // 지금 있는 성질이다. 훅으로 옮기면서 깨지지 않는지 본다.
})
```

`renderTree` 도우미는 `apps/web/test/helpers.tsx`·`editor-harness.tsx`의 관례를 따라 만들어라. **주소를 바꿔야 하므로 라우터가 필요하다.**

- [ ] **Step 2: 실패를 확인한다.** Expected: FAIL — `button` role을 찾지 못한다

- [ ] **Step 3: `use-tree-commands.tsx`를 만든다**

`menu-tree.tsx`의 `useEffect` 조회를 **그대로 옮긴다**(`alive` 플래그·`try/catch`·`setState({status:'loading'})`의 근거 주석도 함께). 재조회 함수를 밖으로 낸다.

- [ ] **Step 4: `menu-tree.tsx`를 훅 소비자로 바꾼다**

- `<span className="wb-shell-tree-menu">` → `<button type="button" aria-pressed={...}>`
- **머리말과 그 자리의 주석을 D4대로 고친다.** 옛 근거를 남기지 마라.
- 페이지 링크에 `onClick={() => select(null)}`

- [ ] **Step 5: `menu-toolbar.tsx`를 만든다 — 버튼은 아직 전부 비활성**

`StructureToolbar`의 형태를 따른다: `WHY_DISABLED` 표, `ToolButton`, `role="group" aria-label="메뉴 편집"`. **판정을 갖지 않는다.**

- [ ] **Step 6: `shell.css`에 클래스를 더한다**

**`wb-shell-` 접두어가 필수다.** `apps/web/test/shell-css.test.ts`가 그것을 본다 — 규칙과 검사가 보지 못하는 것은 `shell-css-guard.ts` 머리말에 있다.

- [ ] **Step 7: 케이스를 통과시키고 `pnpm test`·`pnpm typecheck`를 돌린다**

- [ ] **Step 8: 구분력 실증**

`aria-pressed`를 항상 `undefined`로 바꿔 첫 케이스가 죽는지, `select(null)`을 지워 셋째가 죽는지 확인하고 복구한다.

- [ ] **Step 9: 커밋**

---

## Task 4: 메뉴·페이지 만들기

**Files:**
- Create: `apps/web/src/panels/tree-input.tsx`
- Modify: `apps/web/src/tree/use-tree-commands.tsx`, `apps/web/src/panels/menu-toolbar.tsx`
- Test: `apps/web/test/panels/menu-crud.test.tsx`

**Interfaces (Produces, `TreeCommands`에 추가):**

```ts
/** 인라인 입력이 열려 있으면 무엇을 위한 것인지. 닫혀 있으면 `null`. */
editing: { kind: 'new-menu' | 'new-page' | 'rename'; initial: string } | null
openInput: (kind: 'new-menu' | 'new-page' | 'rename') => void
/** Enter로 확정. 빈 문자열이면 아무것도 하지 않는다(D6). */
submitInput: (title: string) => void
cancelInput: () => void
```

**케이스:**

1. `하위 메뉴`를 누르면 입력이 열리고 **포커스가 거기로 간다**
2. Enter로 확정하면 `createMenu(projectId, { parentId: 선택한 메뉴 id, title })`가 나간다
3. **성공하면 트리를 다시 받는다** — 두 번째 `getTree` 호출을 센다
4. **Esc는 취소다** — `createMenu`가 나가지 않는다
5. **blur는 취소다**(D6) — 다른 곳을 누르면 `createMenu`가 나가지 않는다
6. 빈 문자열로 Enter를 누르면 나가지 않고 입력이 열린 채다
7. `페이지 추가`는 `createPage(projectId, { menuNodeId: 선택한 메뉴 id, title })`를 낸다
8. **페이지를 만들면 그 페이지로 이동한다**(D8) — 응답의 `id`가 주소에 들어간다
9. **실패하면 서버 문장이 트리 안에 남고 트리를 다시 받지 않는다**
10. **요청이 나가 있는 동안 툴바가 전부 비활성이다**(D2)
11. 페이지를 선택한 상태에서는 `하위 메뉴`·`페이지 추가`가 비활성이다(D5)

- [ ] **Step 1: 케이스 1~3을 쓴다**

```tsx
it('하위 메뉴를 만들면 고른 메뉴 아래로 들어가고 트리를 다시 받는다', async () => {
  const api = fakeApi({ tree: [tree.menu('m1', { title: '관리' })] })
  render(...)

  await userEvent.click(await screen.findByRole('button', { name: '관리' }))
  await userEvent.click(screen.getByRole('button', { name: '하위 메뉴' }))

  const input = screen.getByRole('textbox', { name: '이름' })
  expect(input).toHaveFocus()

  await userEvent.type(input, '사용자{Enter}')

  expect(api.createMenu).toHaveBeenCalledWith('p1', { parentId: 'm1', title: '사용자' })
  // 재조회가 수렴이다(D1) — 낙관 적용이 없으므로 이것이 화면이 갱신되는 유일한 길이다.
  expect(api.getTree).toHaveBeenCalledTimes(2)
})
```

- [ ] **Step 2: 실패를 확인한다**
- [ ] **Step 3: `tree-input.tsx`와 훅의 `openInput`/`submitInput`/`cancelInput`을 구현한다**

**포커스는 `autoFocus`가 아니라 `ref` + `useEffect`로 준다** — 같은 입력이 용도만 바꿔 다시 열릴 때 `autoFocus`가 다시 걸리지 않는다. **그것을 재고 어느 쪽이었는지 주석에 적어라.**

- [ ] **Step 4: 케이스 4~11을 채운다**
- [ ] **Step 5: 구분력 실증**

`submitInput`의 빈 문자열 가드를 지워 케이스 6이 죽는지, blur 취소를 커밋으로 바꿔 케이스 5가 죽는지, `busy` 잠금을 지워 케이스 10이 죽는지 각각 재라.

- [ ] **Step 6: 커밋**

---

## Task 5: 이름 변경

**Files:** Modify: `apps/web/src/tree/use-tree-commands.tsx`, `apps/web/src/panels/menu-toolbar.tsx` · Test: `apps/web/test/panels/menu-crud.test.tsx`

**케이스:**

1. 메뉴를 고르고 `이름 변경`을 누르면 **지금 제목이 입력에 들어 있다**
2. Enter로 `updateMenu(projectId, id, { title })`가 나간다 — **다른 키가 본문에 없다**(Task 1의 계약)
3. 페이지를 고르면 `updatePage(projectId, id, { title })`가 나간다
4. Esc·blur는 취소다
5. **바꾸지 않고 Enter를 눌러도 요청이 나간다** — 값이 같은지 비교하지 않는다. 비교를 넣으면 "공백만 다른 제목"에서 갈리고, 서버가 그것을 정규화하는지 재지 않았다. **재고 그 결과를 주석에 적어라**(정규화한다면 비교가 오히려 사용자를 막는다)
6. 실패하면 이유가 남고 트리를 다시 받지 않는다

- [ ] **Step 1~2: 케이스 1·2를 쓰고 실패를 확인한다**
- [ ] **Step 3: 구현한다.** `editing.kind === 'rename'`이면 `initial`을 선택 대상의 제목으로 채운다
- [ ] **Step 4: 케이스 3~6을 채운다**
- [ ] **Step 5: 구분력 실증** — 메뉴/페이지 분기를 한쪽으로 고정해 케이스 2·3 중 하나가 죽는지 재라
- [ ] **Step 6: 커밋**

---

## Task 6: 삭제

**Files:** Modify: `apps/web/src/tree/use-tree-commands.tsx`, `apps/web/src/panels/menu-toolbar.tsx` · Test: `apps/web/test/panels/menu-crud.test.tsx`

**Interfaces (Produces):**

```ts
/** 삭제 확인이 걸려 있으면 `true`(D7). */
confirmingRemove: boolean
askRemove: () => void
confirmRemove: () => void
cancelRemove: () => void
```

**케이스:**

1. `삭제`를 한 번 누르면 **요청이 나가지 않고** 버튼 이름이 `정말 삭제합니까?`로 바뀐다
2. 한 번 더 누르면 `deleteMenu`(또는 `deletePage`)가 나간다
3. **Esc로 확인이 풀린다**
4. **선택을 바꾸면 확인이 풀린다** — 다른 항목에 대고 두 번째 클릭이 되는 것을 막는다
5. **다른 조작을 시작하면 확인이 풀린다**
6. 성공하면 트리를 다시 받는다
7. **메뉴를 지우면 선택이 부모 메뉴로 간다.** 루트 메뉴였으면 `null`
8. **연 페이지를 지우면 `/projects/:projectId`로 `replace` 이동한다**(D8)
9. **열지 않은 페이지를 지우면 주소가 그대로다**
10. 서버가 409를 내면 그 문장이 남는다
11. 자식이 있는 메뉴는 `삭제`가 비활성이다(Task 2의 판정)

- [ ] **Step 1~2: 케이스 1·2를 쓰고 실패를 확인한다**
- [ ] **Step 3: 구현한다**

선택을 부모로 옮기는 것은 **지우기 전 트리에서 자리를 먼저 읽어야 한다**(지운 뒤에는 `treeSpot`이 `null`이다). `StructureToolbar`의 `removeSelected`가 같은 형태다.

- [ ] **Step 4: 케이스 3~11을 채운다**
- [x] ~~**Step 5: 재라 #4 — `DELETE /menu`의 409**~~ — **웨이브 1 수정에서 닫혔다.**

(a) 자식 메뉴만 있는 메뉴 → **409**, (b) 페이지만 있는 메뉴 → **409** (코드·문장 같음:
`conflict` / `하위 메뉴나 페이지가 있어 삭제할 수 없습니다`), (c) 둘 다 없는 메뉴 → **204**.
**둘 다 409이므로 `remove`가 두 배열을 다 보는 것이 옳고, (c)가 과하게 막지도 않음을 보인다.**
잰 값은 `tree-actions.ts`의 `remove` 주석과 `api/client.ts`의 `deleteMenu` 주석에 있다.

- [ ] **Step 6: 구분력 실증**

두 번 누르기를 한 번으로 바꿔 케이스 1이 죽는지, 선택 변경 시 확인 해제를 지워 케이스 4가 죽는지, D8의 이동을 지워 케이스 8이 죽는지 각각 재라. **케이스 11의 판정은 클라이언트 쪽만 지워도 죽어야 한다**(D5의 겹침) — 죽지 않으면 그렇게 보고하라.

- [ ] **Step 7: 커밋**

---

## Task 7: 위/아래 순서 이동

**Files:** Modify: `apps/web/src/tree/use-tree-commands.tsx`, `apps/web/src/panels/menu-toolbar.tsx` · Test: `apps/web/test/panels/menu-move.test.tsx`

- [ ] **Step 1: 재라 #1 — `sortOrder`가 결과 기준인가 원본 기준인가**

**이것을 먼저 재라. 구현이 여기 달렸다.**

`apps/api/test/`에서 형제 메뉴 셋 `[A,B,C]`(sortOrder 0·1·2)을 만들고 A에 `PATCH { sortOrder: 2 }`를 보낸 뒤 `GET /tree`의 순서를 적어라.

- `[B,C,A]`면 **결과 배열 기준**이고 `index ± 1`이 그대로 목적지다(P2b-3의 `moveNodeOps`와 같다)
- `[B,A,C]`면 **원본 배열 기준**이라 아래로 갈 때 보정이 필요하다

**같은 것을 페이지에서도 재라** — 메뉴와 페이지는 다른 저장소 함수를 지난다(`repos/menu.ts` vs `repos/pages.ts`). **한쪽만 재고 양쪽에 대해 쓰지 마라.**

잰 값을 `use-tree-commands.tsx`의 이동 함수 주석에 **양쪽 다** 적어라.

- [ ] **Step 2: 케이스를 쓴다**

1. 형제 셋 중 가운데를 `위로` → `updateMenu(p, id, { sortOrder: <잰 값에 따른 목적지> })`
2. `아래로`도 같은 형태
3. **페이지의 위/아래는 `updatePage`를 부르고 `menuNodeId`를 본문에 싣지 않는다**
4. 첫째의 `위로`, 막내의 `아래로`가 비활성이다
5. 성공하면 트리를 다시 받는다
6. **선택은 그대로다** — id가 바뀌지 않으므로 저절로 따라간다
7. **`sortOrder`가 0부터 연속이 아닌 트리에서도 목적지가 맞는다** — Task 2의 `treeSpot.index`를 쓰지 `node.sortOrder`를 쓰지 않는다. **재라 #3의 결과가 "언제나 연속"이었더라도 그 값에 기대지 마라** — 그것은 서버의 불변식이지 이 화면이 지킬 수 있는 것이 아니다

- [ ] **Step 3~4: 구현하고 통과시킨다**
- [ ] **Step 5: 구분력 실증**

목적지를 `index`(보정 없음)로 바꿔 케이스 1·2 중 어느 쪽이 죽는지 재라. **한쪽만 죽으면 다른 방향의 케이스가 모자란 것이다.**

- [ ] **Step 6: 커밋**

---

## Task 8: 메뉴 들여쓰기·내어쓰기

**Files:** Modify: `apps/web/src/tree/use-tree-commands.tsx`, `apps/web/src/panels/menu-toolbar.tsx` · Test: `apps/web/test/panels/menu-move.test.tsx`

- [ ] **Step 1: 재라 #2 — `parentId`만 주면 어디에 놓이는가**

`apps/api/test/`에서 부모 M1(자식 둘)과 M2를 만들고 M2에 `PATCH { parentId: 'm1' }`(sortOrder 없이)을 보내 어디에 놓이는지 재라. **맨 뒤라면 들여쓰기가 인덱스를 줄 필요가 없다.**

이어서 `PATCH { parentId, sortOrder }`를 함께 준 경우도 재라 — 그 `sortOrder`가 **새 부모의 형제 배열 기준**인지 확인한다.

- [ ] **Step 2: 케이스를 쓴다**

1. **들여쓰기는 앞 형제 메뉴의 마지막 자식이 된다** — `previousMenuSibling`이 준 id가 `parentId`로 나간다
2. 첫 형제는 `들여쓰기`가 비활성이다
3. **내어쓰기는 부모의 다음 형제가 된다** — `menuOutdentTarget`의 `parentId`와 `index + 1`
4. 부모가 루트 목록이면 `parentId: null`이 나간다
5. 루트 메뉴는 `내어쓰기`가 비활성이다
6. 페이지 선택에서는 둘 다 비활성이다(D5)
7. **내어쓴 뒤 들여쓰면 제자리가 아니다** — 들여쓰기가 언제나 앞 형제의 **마지막** 자식으로 가기 때문이다. **P2b-3에서 구조 트리가 같은 성질을 케이스로 못박았다.** 여기서도 재서 못박아라. 다르면 잰 값을 적어라

- [ ] **Step 3~4: 구현하고 통과시킨다**

**`previousMenuSibling`이 `null`인 경우를 막는 가드가 0 사망이면 진단까지 하라.** P2b-3에서 같은 자리가 0 사망이었고, 덮고 있던 것은 버튼의 `disabled`와 단축키의 판정 통과였다. **Task 10의 단축키가 그 방벽을 벗기는지 재라** — 계획을 읽은 것과 잰 것을 구분해서 적어라.

- [ ] **Step 5: 구분력 실증** — 들여쓰기 목적지를 부모로, 내어쓰기 목적지를 `index`로 각각 바꿔 재라
- [ ] **Step 6: 커밋**

---

## Task 9: 페이지의 소속 메뉴 고르기

**Files:** Create: `apps/web/src/panels/menu-picker.tsx` · Modify: `apps/web/src/tree/use-tree-commands.tsx`, `apps/web/src/panels/menu-toolbar.tsx` · Test: `apps/web/test/panels/menu-move.test.tsx`

**Interfaces (Produces):**

```ts
reparenting: boolean
openReparent: () => void
reparentTo: (menuId: string) => void
cancelReparent: () => void
```

- [ ] **Step 1: 재라 #5 — `menuNodeId`와 `sortOrder`를 함께 주면**

`apps/api/test/`에서 페이지를 다른 메뉴로 옮기며 `sortOrder`를 함께 줘 어디에 놓이는지 재라. **`sortOrder` 없이 준 경우도 재라.** 둘 중 무엇을 쓸지는 잰 결과가 정한다 — 이 계획은 정하지 않는다.

- [ ] **Step 2: 케이스를 쓴다**

1. `옮기기`를 누르면 **모든 메뉴가 목록에 뜬다** — `flattenMenus`로 만들고, 트리에 있는 메뉴 수와 대조한다. **손목록을 쓰지 마라**(P2b-3의 실증: 손목록은 카탈로그가 늘 때 죽는다)
2. **지금 소속 메뉴는 목록에 없다** — 고를 이유가 없다
3. 고르면 `updatePage(projectId, pageId, { menuNodeId })`가 나간다
4. `취소`로 닫히고 요청이 나가지 않는다
5. 메뉴 선택에서는 `옮기기`가 비활성이다
6. 메뉴가 하나뿐이면 비활성이다(Task 2의 케이스 11)
7. **닫혀 있을 때 목록이 DOM에 없다** — 남기면 Tab 순서에 정지점이 남는다(`StructureToolbar`가 `TypePicker`에 쓴 것과 같은 근거)
8. 성공하면 트리를 다시 받는다

- [ ] **Step 3: `<select>`인지 버튼 목록인지 정한다 — 세서 정하라**

`TypePicker`가 **Tab 정지점 수로 갈랐다**(18 vs 1). 여기서는 그 수가 프로젝트의 메뉴 수라 고정이 아니다. **어느 쪽을 골랐든 근거를 세어 적어라** — "일관성"만으로는 근거가 아니다.

- [ ] **Step 4: 구현하고 통과시킨다**
- [ ] **Step 5: 구분력 실증** — 목록을 손목록으로 바꿔 케이스 1이 죽는지, "지금 소속 제외"를 지워 케이스 2가 죽는지 재라
- [ ] **Step 6: 커밋**

---

## Task 10: 키보드 단축키와 통합

**Files:** Modify: `apps/web/src/panels/menu-tree.tsx` · Test: `apps/web/test/panels/menu-keyboard.test.tsx`

`panels/structure-tree.tsx`의 `SHORTCUTS` 표가 선례다. **그 파일을 읽고 같은 형태를 쓰되, 표는 따로 둔다** — 두 트리가 한 화면에 있고 조작이 다르다.

- [ ] **Step 1: 케이스를 쓴다**

1. 트리에 포커스가 있을 때 `Delete`/`Backspace`가 **삭제 확인을 건다**(바로 지우지 않는다 — D7이 단축키에도 걸린다)
2. `Alt+↑`/`Alt+↓`가 위/아래 이동을 낸다
3. `Alt+Shift+→`/`Alt+Shift+←`가 들여/내어쓰기를 낸다
4. **비활성인 조작은 단축키로도 실행되지 않는다** — `if (!abilities[shortcut.ability]) return`
5. **입력이 열려 있는 동안에는 단축키가 걸리지 않는다** — 제목에 `Backspace`를 치는 것이 삭제가 되면 안 된다. **재라: `structure-tree.tsx`가 이 상황을 어떻게 다루는지 먼저 보고, 같은 방법이 여기서도 통하는지 확인하라**(구조 트리에는 인라인 입력이 없다)
6. **`busy`인 동안 단축키가 걸리지 않는다**(D2)
7. **단축키와 버튼이 같은 요청을 만든다** — `structure-keyboard.test.tsx`의 `단축키와 버튼이 같은 op을 만든다`가 선례다

- [ ] **Step 2~3: 구현하고 통과시킨다**
- [ ] **Step 4: 통합 케이스**

8. **만들기 → 이름 변경 → 옮기기 → 삭제를 한 화면에서 이어서 한다.** 각 단계 뒤 트리가 새 상태를 보인다
9. **구조 편집과 섞어도 서로를 방해하지 않는다** — 메뉴 CRUD가 `busy`인 동안 속성 편집이 나가고, 그 반대도 된다. **재라: 두 경로가 정말 독립인가**(공유 상태가 있는지 소스로 확인하고, 실제로 섞어서 재라)
10. **`shell-css.test.ts`·`store-access.test.ts`가 여전히 통과한다** — 새 파일이 스토어의 페이지 상태를 우회해 읽지 않는지 본다

- [ ] **Step 5: 마지막 훑기 — 같은 사실을 말하는 다른 곳**

```bash
rg -n "메뉴 제목은 누를 수 없다|누를 수 있게 보이는 것은" apps/web docs
rg -n "읽기 전용|프로젝트·메뉴·페이지 생성" docs/superpowers/plans
```

**P2b-3에서 한 곳만 고치고 다른 곳을 놓치는 패턴이 세 번 났고, `grep`이 유일하게 작동한 방법이었다.** 계획서(이 파일)에 남은 거짓도 함께 고쳐라.

- [ ] **Step 6: 커밋**

---

## 실행 시 유의

**웨이브는 셋이다.** Task 1·2는 화면 없이 돌고 서로 독립이다. Task 3~6은 트리 화면, Task 7~10은 이동과 키보드다.

**웨이브 1이 끝나면 화면에는 아무 변화가 없다.** 정상이다.

**api 테스트를 도는 워커를 동시에 여럿 띄우지 않는다.** Postgres 컨테이너 하나(호스트 포트 5433)를 공유한다.

**계획서가 틀렸다고 판단되면 `orca orchestration ask`로 물어라.** P2b-2에서 구현자가 계획서 오류를 두 번 잡았고 둘 다 옳았다. P2b-3에서는 계획서 산문이 케이스 표와 어긋났고 **표가 옳았다** — 산문은 아무도 재지 않기 때문이다.

**리뷰 지적을 그대로 받아 적지 마라.** P2b-3에서 구현자가 리뷰 지적의 범위를 재서 넓힌 적이 두 번, 리뷰어가 자기 지적을 철회한 적이 한 번 있었다. **범위를 스스로 재라.**

**0 사망 변이는 진단까지 하라.** "케이스를 더하자"가 항상 답은 아니다 — 잉여인 가드를 지우는 쪽이 맞을 때가 있다. P2b-3에서 열 번 넘게 나왔고 둘은 코드에서 걷어냈다.

## Self-Review

**Spec 대조.** 설계 §9의 *"메뉴 폴더와 페이지를 한 트리에 표시하고 **드래그로 정렬**한다"* 중 드래그는 이 단계 밖이다("이 단계가 만들지 않는 것"에 근거와 함께 적었다). *"한 메뉴 아래 여러 페이지"*는 Task 4·9가 만든다. §10의 역할 분기는 이 단계 밖이고 근거를 적었다.

**타입 일관성.** `MenuNode`(Task 1)와 `TreeMenuNode`(기존)는 **다른 타입이고 그 사실을 D1이 근거로 쓴다.** `TreeSelection`·`TreeAbilities`·`TreeSpot`(Task 2)이 Task 3~9에서 같은 이름으로 쓰인다. `TreeCommands`는 Task 3에서 뼈대가 서고 Task 4·6·9가 필드를 더한다 — 각 태스크의 Interfaces 블록에 무엇이 더해지는지 적었다.

**빈 자리.** `apps/api/README.md`의 엔드포인트 표(줄 121~132) 중 이 단계가 쓰지 않는 것은 `GET /menu`(트리가 `/tree`를 쓴다)와 `PUT /pages/:id/schema`(P2a의 경로다)뿐이다.
