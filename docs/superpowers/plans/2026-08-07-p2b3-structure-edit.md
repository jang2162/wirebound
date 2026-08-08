# P2b-3 구조 편집 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 구조 트리에서 노드를 추가·삭제·이동할 수 있게 한다.

**Architecture:** P2b-2가 세운 편집 파이프라인 위에 **`ops`를 만드는 방법 셋**을 더한다. 낙관적 적용·직렬 전송·실패 수렴·undo는 전부 그대로 따라오므로 **이 단계가 새로 만드는 파이프라인은 없다.** 새로 만드는 것은 (1) 구조 `ops` 생성기, (2) 조작 가능 여부를 미리 판정하는 순수 함수, (3) 구조 트리 하단 툴바다.

**Tech Stack:** TypeScript(ESM, strict + `noUncheckedIndexedAccess`) · React 19 · Vite 6 · react-router 7 · vitest 3 + React Testing Library + jsdom · `@wirebound/schema`(`walkNodes`·`findNodePath`·`createNodeId`·`getComponent`·`applyOps`·`invertOps`)

## Global Constraints

근거 문서는 셋이다.

- `docs/superpowers/specs/2026-08-03-wirebound-design.md` (§9 — *"구조 변경은 구조 트리에서, 속성 변경은 속성 패널에서 한다. 캔버스 직접 드래그 편집은 지원하지 않는다"*)
- `docs/superpowers/plans/2026-08-07-p2b2-carryforward.md` (**먼저 읽어라** — 편집이 지나는 길·`ops` 세 갈래·관문·undo 규칙이 전부 거기 있다)
- `apps/api/README.md` ("편집 파이프라인" 절)

제약:

- **의존 방향은 한 방향이다:** `schema` ← `renderer` ← `apps/web`. `apps/web`이 `apps/api`를 import하지 않는다.
- **`apps/web`에 새 런타임 의존을 들이지 않는다.** 지금 의존은 `react`·`react-dom`·`react-router`뿐이다. **드래그 라이브러리는 이 단계가 다루지 않는다**(아래).
- **사용자 대면 메시지와 주석은 전부 한국어.** 주변 코드의 주석 밀도·어투(무엇이 아니라 왜)를 따른다.
- Node ≥ 22.9.0, ESM only, TypeScript strict + `noUncheckedIndexedAccess`, `verbatimModuleSyntax`. `pnpm typecheck`가 exit 0이어야 한다.
- **`pnpm test`가 초록이어야 한다.** 이 계획을 쓴 시점은 **1165 tests / 67 files**다 — **기준선일 뿐 목표가 아니고, 웨이브마다 는다.**
- 커밋할 파일은 **경로로 명시해서** stage한다. `git add -A` 금지.
- **완결성을 주장하지 마라.** "전부"·"항상"·"유일"은 측정한 뒤에만, 측정과 함께.
- **인과 문장을 쓸 때는 그 X를 심어 Y를 관측한 뒤에 써라.** P2b-2에서 재현되지 않는 인과가 **다섯** 났고 다섯 다 "잰 것과 다른 조건을 적었다"였다. 특히 **자기 커밋이 만든 구조**에 대한 인과가 위험하다.

## 이 단계가 만들지 않는 것

- **드래그 정렬.** 설계 §9가 드래그를 적었지만 이 단계는 **버튼·키보드로만** 이동한다. 라이브러리 도입 결정과 jsdom에서의 드래그 테스트 설계가 한 단계를 통째로 먹기 때문이고, **접근성상 버튼·키보드 경로가 먼저 있어야 한다.** 드래그는 P2b-4이고, **같은 `ops`를 만들므로 이 단계 위에 얹힌다.**
- **메뉴·페이지·프로젝트 CRUD.** 그쪽은 `POST/PATCH/DELETE /menu`·`/pages`로 **revision을 남기지 않는 다른 경로**다. undo도 없다. 별도 단계다.
- **캔버스에서의 구조 편집.** 설계 §9가 배제했다.
- **여러 노드 선택.** 선택은 여전히 `selectedNodeId` 하나다.
- **컴포넌트 그룹 분류.** 아래 D6 참조.
- **테마·상호작용·코멘트.** P4a·P5다.

## 설계 결정 (계획 단계에서 확정)

**D1. 구조 `ops`는 `edit/ops.ts`에 모은다.** P2b-2의 `propOps`와 같은 자리다. 그 파일은 순수 함수이고 React·DOM·`fetch`를 모른다 — 화면 없이 단위 테스트할 수 있어야 한다.

**D2. 이동은 `move` op 하나로 표현한다.** 소스를 읽어 확정했다 — `packages/schema/src/patch/inverse.ts`의 `inverseOfMove`는 **목적지가 배열이면 덮어쓸 값이 없으므로**(`overwrittenAt`이 배열 부모에 `null`을 낸다) **반대 방향 `move` 하나**를 낸다. 노드 이동의 목적지는 항상 `children` 배열이므로 undo가 op 하나로 끝난다.

`remove` + `add` 둘로 나누면 서버가 만들 `inverse`도 둘이 되고, 그 둘 사이에 다른 편집이 끼면 순서가 어긋난다. **다만 그 `inverse`가 실제로 무엇인지는 Task 2에서 재라** — 계획이 소스를 읽고 낸 추론이지 실측이 아니다.

> **정정(웨이브 1 실측) — 위 추론은 맞았고, 계획이 재지 않은 것이 하나 더 나왔다.**
>
> 1. **`inverse`는 반대 방향 `move` 하나가 맞다.** 네 경우(같은 배열 앞·뒤, 다른 부모로, 안쪽에서 밖으로)를 재서 전부 `move` 하나였고 왕복이 원본과 같았다.
> 2. **`move`의 목적지 경로는 "값을 뺀 뒤" 문서 기준이어야 한다.** 계획은 이 보정을 아래 Task 2 케이스 2에서 *"같은 배열 안에서 뒤로 옮길 때"*로 좁게 적었는데, **부모가 다를 때도 밀린다.** 소스가 목적지 부모보다 앞에 있으면 값을 뺀 순간 부모의 인덱스가 당겨진다.
>
>    ```
>    [n_x(0), n_y(1)] 에서 n_x 를 n_y 안으로
>      move /root/children/0 → /root/children/1/children/0   → PatchError 경로를 찾을 수 없습니다
>      move /root/children/0 → /root/children/0/children/0   → 통과 (뺀 뒤 n_y는 인덱스 0)
>    ```
>
>    `moveNodeOps`는 `applyOps(document, [remove from])`로 뺀 문서를 만들어 거기서 부모 경로를 다시 찾는다. **Task 6의 들여쓰기·내어쓰기가 정확히 이 성질에 하중을 건다.**
> 3. **목적지에 `children` 키가 없으면 `move` 하나로 불가능하다** — `insertNodeOps`와 같은 원인으로 던진다. `[add …/children 값 [], move]` 둘을 낸다. **그 둘의 경로 기준이 서로 다르다**: `add`는 첫 op이라 원본 문서 기준이고, `move`의 `path`는 remove가 지나간 뒤 기준이다. op이 둘이 되어도 D2를 어기지 않는 것은 **편집 하나 = revision 하나**이고 서버가 `invertOps(before, ops)`로 배열째 역을 만들기 때문이다 — 그 사이에 다른 편집이 끼지 않는다. D2가 막으려던 것은 이동을 **두 편집**으로 쪼개는 쪽이다.

**D3. 조작 가능 여부는 순수 함수가 미리 판정한다.** 보내 봐야 422를 받을 편집은 만들지 않는다(P2b-2의 D7과 같은 정신). 판정을 `edit/structure-actions.ts`에 모아 **UI 없이 단위 테스트**한다 — 버튼 비활성 로직이 컴포넌트 안에 흩어지면 케이스가 화면을 지나야만 재진다.

| 조작 | 가능 조건 |
|---|---|
| 안에 추가 | 선택 노드의 `def.children === 'many'` |
| 아래 추가 | 선택 노드가 루트가 **아니다** |
| 삭제 | 루트가 아니다 |
| 위로 / 아래로 | 그 방향에 형제가 있다 |
| 들여쓰기 | **앞 형제가 있고 그 형제가 `many`다** |
| 내어쓰기 | 부모가 루트가 아니다(= 조부모가 있다) |

**카탈로그를 보는 조작은 `안에 추가`·`들여쓰기` 둘뿐이다 — 나머지는 자리만 본다.**

> **정정(웨이브 1 실측).** 이 자리에 처음 적혀 있던 것은 *"카탈로그에 없는 타입·모양이 깨진 노드는 전부 불가다"*였다. **그대로 하면 사용자가 그 노드를 치울 수단이 없어진다.**
>
> | 문서에 `type: 'Nonexistent'` 노드가 있을 때 | `validatePage` 이슈 |
> |---|---|
> | 아무것도 안 함 | `unknown-type` |
> | 다른 노드의 prop을 바꾸는 편집 | `unknown-type` (남는다) |
> | 그 노드를 **옮기는** 편집 | `unknown-type` (남는다) |
> | 그 노드를 **지우는** 편집 | **없음** |
>
> 편집 파이프라인 6단계가 `validatePage(after)`의 이슈로 편집을 `invalid`(422)로 거절하므로(`apps/api/src/services/edit-pipeline.ts`), 그런 노드가 하나라도 있으면 **그 페이지의 모든 편집이 막힌다. 삭제가 유일한 탈출구다.**
>
> 그래서 `addInside`·`indent`만 카탈로그 조회에 걸고(둘은 "무엇을 담을 수 있는가"를 물으므로 타입을 알아야 한다 — `indent`가 보는 것은 **앞 형제의** 타입이다), `remove`·`moveUp`·`moveDown`·`addAfter`·`outdent`는 자리로만 판정한다. `removeNodeOps`·`moveNodeOps`는 타입을 읽지 않으므로 그래도 안전하다.
>
> **아래 케이스 표는 처음부터 이쪽과 맞았다** — 케이스 12가 `안에 추가`만 지목한다. 산문과 표가 어긋났고 표가 옳았다.

모양이 깨진 노드도 같은 규칙이다. 다만 `children`이 **배열이 아닌** 노드에는 `addInside`가 불가다 — `insertNodeOps`가 그 경우 `null`을 내므로(깨진 문서를 조용히 덮지 않는다) 버튼을 열어 두면 눌러도 아무 일이 없다. 그런 노드가 스토어에 실린다는 것은 P2b-2가 이미 확인했다.

**D4. 조작 버튼은 구조 트리 하단 툴바에 둔다.** 선택 노드 하나에 작동한다. 각 줄에 버튼을 흩으면 좁은 좌측 패널에서 트리가 읽히지 않고, 툴바면 키보드 단축키와 짝이 맞는다(D8).

**D5. 삭제는 서브트리째이고 확인 대화상자가 없다.** undo가 있다(P2b-2) — 확인 창은 undo가 없던 시절의 관습이다. **삭제 후 선택을 부모로 옮긴다** — 그러지 않으면 선택이 사라진 노드를 가리키고 사용자는 트리에서 자기 위치를 잃는다.

**D6. 타입 목록은 이름순 한 목록이고 그룹을 만들지 않는다.** 카탈로그 파일이 `action`·`data`·`document`·`input`·`structure`로 나뉘지만 **그 분류가 런타임에 없다**(`ComponentDef`에 group 필드가 없다 — 소스 확인). `apps/web`에 그룹 표를 손으로 두면 카탈로그가 늘 때 어긋나는 자리가 하나 더 생기고, **그것이 이 저장소가 반복해 겪은 결함 부류다.**

**대신 런타임 정보로 가르는 것은 한다** — `def.children === 'many'`인지를 목록에 표시하면 사용자가 "안에 무언가를 담을 수 있는 것"을 고를 수 있다.

**D7. 새 노드는 `{ id, type }`이 기본이고, 필요한 기본 props만 채운다.** `createNodeId()`가 id를 만든다. **카탈로그에 `.default()` 없는 필수 prop이 있는지 Task 4에서 재라** — 있으면 그 타입만 기본값을 채워야 하고, 없으면 `{ id, type }`으로 끝난다. 계획은 재지 않았다.

**D8. 키보드 단축키는 툴바 버튼과 같은 함수를 부른다.** 두 경로가 갈리면 한쪽만 고쳐지는 자리가 생긴다. 단축키는 **구조 트리에 포커스가 있을 때만** 듣는다 — 전역에 걸면 속성 패널에서 타이핑하는 중에 노드가 지워진다.

## 파일 구조

**새로 만드는 것**

| 파일 | 책임 |
|---|---|
| `apps/web/src/edit/structure-actions.ts` | 조작 가능 여부 판정(D3). 순수 함수 |
| `apps/web/src/edit/create-node.ts` | 타입에서 새 노드 하나(D7). 순수 함수 |
| `apps/web/src/panels/structure-toolbar.tsx` | 툴바(D4) — 버튼과 비활성 상태 |
| `apps/web/src/panels/type-picker.tsx` | 타입 목록(D6) |

**고치는 것**

| 파일 | 무엇 |
|---|---|
| `apps/web/src/edit/ops.ts` | `insertNodeOps`·`removeNodeOps`·`moveNodeOps` 추가 |
| `apps/web/src/panels/structure-tree.tsx` | 툴바 배치, 포커스 컨테이너 |
| `apps/web/src/shell.css` | 툴바·타입 목록 스타일(`wb-shell-` 접두어, D7 검사 통과) |

## 실행 시 유의 — 모든 디스패치에 붙일 것

- **P2b-2 이월 문서를 먼저 읽어라.** 편집이 지나는 길·관문·undo 규칙이 거기 있다.
- **스토어를 직접 읽지 마라.** `useOpenPage(pageId)`가 관문이고, `test/store-access-guard.ts`가 우회를 잡는다. 새 필드가 필요하면 `use-editor-store.tsx`에 관문을 더하는 것이 합법 경로다.
- **가드는 오탐을 낸다.** 페이지 필드와 같은 이름이 스토어가 아닌 것에 붙은 인라인 selector도 걸린다. 걸렸는데 스토어 필드가 아니면 그 사실을 그 자리에 적고 넘어가라.
- **`applyEdit`은 `selectedNodeId`를 건드리지 않는다.** undo가 문서를 갈아 끼울 때 위젯은 마운트된 채 남는다 — 새 UI가 로컬 state를 들면 옛 값이 남는다.
- **속성 패널·구조 트리는 오류 경계 밖이다.** 던지면 셸 전체가 흰 화면이다.
- **커밋 창을 재려면 `MutationObserver`를 써라.** `CommitProbe`는 주소가 그대로인 커밋을 못 본다.

---

### Task 1: 삽입·삭제 `ops`

**Files:**
- Modify: `apps/web/src/edit/ops.ts`
- Test: `apps/web/test/edit/ops.test.ts`(기존)

**Interfaces:**
- Consumes: `@wirebound/schema`의 `findNodePath`·`walkNodes`·`PatchOp`·`WbNode`
- Produces:

```ts
/** 새 노드를 부모의 children 안 `index` 자리에 넣는 op. 부모가 없으면 `null`(D7 — 요청을 만들지 않는다). */
export function insertNodeOps(
  document: PageDocument,
  parentId: string,
  index: number,
  node: WbNode,
): PatchOp[] | null

/** 노드와 그 서브트리를 지우는 op. 루트이거나 문서에 없으면 `null`. */
export function removeNodeOps(document: PageDocument, nodeId: string): PatchOp[] | null
```

- [ ] **Step 1: 테스트를 먼저 쓴다**

`apps/web/test/edit/ops.test.ts`에 `describe`를 더한다. 기존 파일의 관례(왕복 대조 — `applyOps`에 넣어 결과를 본다)를 따르라.

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `루트의 자식으로 넣는다` | `add /root/children/0` |
| 2 | `중간 자리에 넣으면 뒤 형제가 밀린다` | 인덱스 1에 넣고 `applyOps` 뒤 순서 확인 |
| 3 | `끝에 넣는다` | 인덱스가 `children.length` |
| 4 | `깊이 중첩된 부모에도 넣는다` | 손자 |
| 5 | `없는 부모면 null이다` | 요청을 만들지 않는 신호 |
| 6 | `넣은 뒤 문서가 그 노드를 담는다` | **왕복 대조** — `applyOps` 결과에서 `findNode`로 찾는다 |
| 7 | `노드를 지우면 서브트리째 사라진다` | 자식 둘을 단 노드를 지우고 `collectNodeIds` 확인 |
| 8 | `루트는 지울 수 없다` | `null` |
| 9 | `없는 노드면 null이다` | |
| 10 | `지운 뒤 뒤 형제의 인덱스가 당겨진다` | 배열 `remove`의 성질 |

**케이스 6·7이 이 태스크의 핵심이다** — 경로를 손으로 적은 단언만 있으면 오프바이원을 못 잡는다.

- [ ] **Step 2: 실패를 확인한다**

Run: `pnpm vitest run apps/web/test/edit/ops.test.ts --project web`
Expected: 두 함수가 없어 실패.

- [ ] **Step 3: 구현한다**

```ts
export function insertNodeOps(
  document: PageDocument,
  parentId: string,
  index: number,
  node: WbNode,
): PatchOp[] | null {
  const parentPath = findNodePath(document.root, parentId)
  if (parentPath === undefined) return null
  // `children`이 없는 노드에 넣는 경우가 있다 — 카탈로그가 `many`여도 문서에 키가 없을 수
  // 있다(`props`와 같은 사정, `ops.ts` 머리말의 표). 그때는 배열째 만든다.
  // **어느 쪽이 맞는지 재고 그 결과를 여기 적어라.**
  ...
}
```

**재라:** `children`이 없는 노드에 `add /…/children/0`을 하면 `applyOps`가 어떻게 되는가. `propOps`의 세 갈래와 같은 성질이면 배열째 `add`해야 한다. **추측하지 말고 실측한 값을 주석에 적어라.**

- [ ] **Step 4: 통과를 확인하고 커밋**

```bash
pnpm vitest run --project web && pnpm typecheck
git add apps/web/src/edit/ops.ts apps/web/test/edit/ops.test.ts
git commit -m "feat(web): 노드 삽입·삭제 ops를 만든다"
```

---

### Task 2: 이동 `ops`와 `inverse` 실측

**Files:**
- Modify: `apps/web/src/edit/ops.ts`
- Test: `apps/web/test/edit/ops.test.ts`(기존)

**Interfaces:**
- Produces:

```ts
/**
 * 노드를 다른 부모의 `index` 자리로 옮기는 op. 같은 부모 안 순서 변경도 이것이다.
 * 옮길 수 없으면 `null` — 노드가 없거나, 루트이거나, **자기 자신의 자손 안으로** 옮기려 할 때다.
 */
export function moveNodeOps(
  document: PageDocument,
  nodeId: string,
  parentId: string,
  index: number,
): PatchOp[] | null
```

- [ ] **Step 1: 테스트를 쓴다**

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `같은 부모 안에서 앞으로 옮긴다` | 순서가 바뀐다 |
| 2 | `같은 부모 안에서 뒤로 옮긴다` | **인덱스 보정이 필요한 자리다**(아래) |
| 3 | `다른 부모로 옮긴다` | |
| 4 | `자기 자손 안으로는 옮길 수 없다` | `null` — **그 op은 `applyOps`가 던진다**(정정: 끊어진 트리가 만들어지는 것이 아니다. `move`가 `from`을 먼저 뺀다 — 웨이브 1 실측) |
| 5 | `자기 자신을 부모로 삼을 수 없다` | `null` |
| 6 | `루트는 옮길 수 없다` | `null` |
| 7 | `옮긴 뒤 서브트리가 통째로 따라간다` | 자손 id가 새 자리 밑에 있다 |
| 8 | `서버가 만들 inverse를 여기서 재 둔다` | **실측 케이스**(아래) |

**케이스 2가 함정이다.** `move`는 remove 후 add이므로, 같은 배열에서 뒤로 옮기면 목적지 인덱스가 하나 당겨진다. `[A,B,C]`에서 A를 인덱스 2로 옮기면 결과가 `[B,A,C]`인지 `[B,C,A]`인지 **재서 확정하고 주석에 적어라.**

**케이스 8은 `propOps`의 선례를 따른다.** 그 파일에 이미 `서버가 만들 inverse를 여기서 재 둔다`가 있다 — 서버는 `packages/schema`의 `invertOps`를 그대로 쓰므로(`apps/api/src/services/edit-pipeline.ts`) 여기서 잴 수 있다. **계획서 D2는 "목적지가 배열이라 반대 방향 `move` 하나"라고 추론했다 — 그것이 맞는지 재고, 다르면 잰 값을 적어라.**

- [ ] **Step 2: 실패를 확인하고 구현한다**

자손 판정은 `walkNodes`로 한다 — 옮길 노드의 서브트리에 `parentId`가 있으면 `null`.

- [ ] **Step 3: 통과를 확인하고 커밋**

```bash
pnpm vitest run --project web && pnpm typecheck
git add apps/web/src/edit/ops.ts apps/web/test/edit/ops.test.ts
git commit -m "feat(web): 노드 이동 ops를 만들고 inverse를 잰다"
```

---

### Task 3: 조작 가능 여부 판정

**Files:**
- Create: `apps/web/src/edit/structure-actions.ts`
- Test: `apps/web/test/edit/structure-actions.test.ts`

**Interfaces:**
- Consumes: `@wirebound/schema`의 `walkNodes`·`getComponent`·`PageDocument`
- Produces:

```ts
/** 선택 노드에 지금 할 수 있는 조작. 화면은 이것으로 버튼을 비활성한다. */
export interface StructureAbilities {
  addInside: boolean
  addAfter: boolean
  remove: boolean
  moveUp: boolean
  moveDown: boolean
  indent: boolean
  outdent: boolean
}

/** 고른 노드가 없거나 문서에 없으면 전부 `false`다. */
export function structureAbilities(document: PageDocument | null, nodeId: string | null): StructureAbilities

/** 선택 노드의 자리. 조작을 실행할 때 부모·인덱스가 필요하다. */
export interface NodeSpot {
  parentId: string
  index: number
  siblingCount: number
}

/** 루트이거나 문서에 없으면 `null`. */
export function nodeSpot(document: PageDocument, nodeId: string): NodeSpot | null
```

- [ ] **Step 1: 테스트를 쓴다**

**이 태스크는 화면 없이 돈다** — `apps/web/test/edit/` 아래 순수 단위 테스트다.

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `고른 것이 없으면 아무것도 못 한다` | 전부 `false` |
| 2 | `문서가 없으면 아무것도 못 한다` | 전부 `false` |
| 3 | `루트는 안에만 추가할 수 있다` | `addInside`만 `true` |
| 4 | `children이 none인 타입에는 안에 추가할 수 없다` | `Text` 같은 것 |
| 5 | `children이 many인 타입에는 안에 추가할 수 있다` | `Card` 같은 것 |
| 6 | `첫 형제는 위로 못 간다` | `moveUp === false` |
| 7 | `막내는 아래로 못 간다` | |
| 8 | `앞 형제가 many면 들여쓸 수 있다` | |
| 9 | `앞 형제가 none이면 들여쓸 수 없다` | **D3의 핵심 제약** |
| 10 | `첫 형제는 들여쓸 수 없다` | 앞 형제가 없다 |
| 11 | `부모가 루트면 내어쓸 수 없다` | |
| 12 | `카탈로그에 없는 타입은 안에 추가할 수 없다` | 검증 전 문서가 스토어에 실린다 |
| 13 | `모양이 깨진 노드도 던지지 않는다` | `type`이 객체·`children`이 배열 아님 — **셸이 죽지 않아야 한다** |
| 14 | `nodeSpot이 부모와 인덱스를 낸다` | |
| 15 | `루트의 nodeSpot은 null이다` | |

**케이스 13이 방어선이다.** 이 함수는 렌더 중에 불리고 구조 트리에는 오류 경계가 없다.

- [ ] **Step 2: 실패를 확인하고 구현한다**

`walkNodes`로 한 번 훑어 선택 노드의 `parent`·`index`를 찾는다. 카탈로그 조회는 `getComponent(type)`이고 **`type`이 문자열이 아닐 수 있으므로** 먼저 모양을 본다(`panels/node-shape.ts`의 `nodeType`이 같은 일을 한다 — 그것을 쓸지 새로 쓸지는 재보고 정하라).

- [ ] **Step 3: 통과를 확인하고 커밋**

```bash
pnpm vitest run --project web && pnpm typecheck
git add apps/web/src/edit/structure-actions.ts apps/web/test/edit/structure-actions.test.ts
git commit -m "feat(web): 구조 조작 가능 여부를 순수 함수로 판정한다"
```

---

### Task 4: 새 노드 만들기

**Files:**
- Create: `apps/web/src/edit/create-node.ts`
- Test: `apps/web/test/edit/create-node.test.ts`

**Interfaces:**
- Produces:

```ts
/**
 * 타입 이름에서 새 노드 하나. 카탈로그에 없는 타입이면 `null`.
 * id 생성기를 주입할 수 있다 — 테스트가 결정적인 id를 쓴다(스토어의 `nextOpId`와 같은 이유).
 */
export function createNode(type: string, nextId: () => string = createNodeId): WbNode | null
```

- [ ] **Step 1: 카탈로그를 재라 (테스트보다 먼저)**

**`.default()`가 없는 필수 prop이 있는 컴포넌트가 있는가.** `packages/schema/src/component/catalog/*.ts`를 훑고, 확실히 하려면 각 `def.props.safeParse({})`를 돌려 보라. **재서 나온 목록을 이 태스크의 주석에 적어라** — 계획은 재지 않았다.

- 없으면: 모든 타입이 `{ id, type }`으로 검증을 통과한다. `createNode`가 그것만 만든다.
- 있으면: 그 타입만 기본값을 채운다. **`props.parse({})`가 주는 기본값을 그대로 쓰는 것이 가장 정확하다** — 손으로 표를 만들면 카탈로그와 어긋난다(D6와 같은 이유).

- [ ] **Step 2: 테스트를 쓴다**

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `타입과 id를 가진 노드를 만든다` | |
| 2 | `id가 매번 다르다` | 두 번 불러 비교 |
| 3 | `카탈로그에 없는 타입이면 null이다` | |
| 4 | `만든 노드가 검증을 통과한다` | **핵심** — `validatePage`에 넣어 이슈 0 |
| 5 | `모든 카탈로그 타입에 대해 검증을 통과한다` | `listComponents()`를 훑는다 — **분모를 손으로 적지 마라** |
| 6 | `children이 many인 타입은 빈 children을 갖는다(또는 갖지 않는다)` | **재서 정하고 그대로 단언하라** |

**케이스 5가 이 태스크의 값어치다.** 카탈로그에 컴포넌트가 늘면 거기서 죽는다.

- [ ] **Step 3: 구현하고 커밋**

```bash
pnpm vitest run --project web && pnpm typecheck
git add apps/web/src/edit/create-node.ts apps/web/test/edit/create-node.test.ts
git commit -m "feat(web): 타입에서 새 노드를 만든다"
```

---

### Task 5: 툴바 — 삭제와 순서 이동

**Files:**
- Create: `apps/web/src/panels/structure-toolbar.tsx`
- Modify: `apps/web/src/panels/structure-tree.tsx`, `apps/web/src/shell.css`
- Test: `apps/web/test/panels/structure-toolbar.test.tsx`

**Interfaces:**
- Consumes: Task 1~3의 함수, P2b-2의 `useEditCommit`
- Produces: `<StructureToolbar pageId={…} projectId={…} />`

**추가는 Task 7이다.** 이 태스크는 **새 노드를 만들 필요가 없는 조작**만 붙인다 — 그래야 UI가 작고, 파이프라인이 실제로 도는 것을 먼저 확인할 수 있다.

- [ ] **Step 1: 테스트를 쓴다**

**`<App />`을 라우트째 렌더한다**(`editor-harness.tsx`의 관례).

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `노드를 고르지 않으면 버튼이 전부 비활성이다` | |
| 2 | `삭제하면 트리에서 사라진다` | 낙관적 적용이 화면까지 |
| 3 | `삭제하면 서버로 remove op이 나간다` | `patchOps` 본문 |
| 4 | `삭제 뒤 선택이 부모로 옮겨진다` | **D5** — 선택이 사라진 노드를 가리키지 않는다 |
| 5 | `루트는 삭제 버튼이 비활성이다` | |
| 6 | `위로 옮기면 형제 순서가 바뀐다` | 트리에서 확인 |
| 7 | `위로 옮기면 move op이 나간다` | |
| 8 | `첫 형제는 위로 버튼이 비활성이다` | |
| 9 | `아래로도 같다` | 6~8의 짝 |
| 10 | `undo하면 삭제한 노드가 돌아온다` | **P2b-2 파이프라인이 그대로 돈다는 증거** |
| 11 | `편집이 실패하면 재조회로 되돌아간다` | 409 → 서버 문서 |

**케이스 10·11이 "새 파이프라인이 없다"는 주장의 하중이다.**

- [ ] **Step 2: 실패를 확인하고 구현한다**

버튼은 `disabled`와 함께 **왜 비활성인지 알 수 있어야 한다** — `title`이나 `aria-describedby`로. 다만 **문안을 지어내지 말고** 조건을 그대로 옮겨라(예: "앞 형제가 자식을 담을 수 없습니다").

- [ ] **Step 3: 구분력을 실증하고 커밋**

`structureAbilities`의 판정을 무시하고 전부 활성으로 바꾸면 어떤 케이스가 죽는가. **0 사망이면 비활성이 고정돼 있지 않은 것이니 케이스를 더해라.**

```bash
pnpm vitest run --project web && pnpm typecheck
git add apps/web/src/panels/structure-toolbar.tsx apps/web/src/panels/structure-tree.tsx apps/web/src/shell.css apps/web/test/panels/structure-toolbar.test.tsx
git commit -m "feat(web): 구조 트리에서 노드를 지우고 순서를 바꾼다"
```

---

### Task 6: 툴바 — 들여쓰기와 내어쓰기

**Files:**
- Modify: `apps/web/src/panels/structure-toolbar.tsx`
- Test: `apps/web/test/panels/structure-toolbar.test.tsx`(기존)

- [ ] **Step 1: 테스트를 쓴다**

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `들여쓰면 앞 형제의 마지막 자식이 된다` | 트리 구조 확인 |
| 2 | `앞 형제가 none이면 버튼이 비활성이다` | **D3의 핵심 제약** |
| 3 | `첫 형제는 들여쓰기가 비활성이다` | |
| 4 | `내어쓰면 부모의 다음 형제가 된다` | 위치가 부모 바로 뒤 |
| 5 | `부모가 루트면 내어쓰기가 비활성이다` | |
| 6 | `들여쓴 뒤 내어쓰면 제자리로 돌아온다` | **왕복 대조** — 인덱스 계산의 오프바이원을 잡는다 |
| 7 | `서브트리가 통째로 따라간다` | 자손이 함께 옮겨진다 |
| 8 | `undo하면 되돌아간다` | |

**케이스 6이 이 태스크의 핵심이다.** "부모의 **다음** 형제"의 인덱스를 손으로 적으면 틀리기 쉽다.

- [ ] **Step 2~3: 구현하고 커밋**

```bash
pnpm vitest run --project web && pnpm typecheck
git add apps/web/src/panels/structure-toolbar.tsx apps/web/test/panels/structure-toolbar.test.tsx
git commit -m "feat(web): 노드를 들여쓰고 내어쓴다"
```

---

### Task 7: 타입 목록과 노드 추가

**Files:**
- Create: `apps/web/src/panels/type-picker.tsx`
- Modify: `apps/web/src/panels/structure-toolbar.tsx`, `apps/web/src/shell.css`
- Test: `apps/web/test/panels/type-picker.test.tsx`

**Interfaces:**
- Produces: `<TypePicker onPick={(type: string) => void} onCancel={() => void} />`

- [ ] **Step 1: 테스트를 쓴다**

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `페이지에 둘 수 있는 모든 타입이 목록에 있다` + `페이지에 둘 수 없는 타입은 목록에 없다` | `listComponents()`로 대조 — **분모를 손으로 적지 마라** |

> **정정(웨이브 3 구현).** 처음에는 `카탈로그의 모든 타입이 목록에 있다` 하나였는데, 그대로 하면 **`Slot`이 목록에 실린다.** `Slot`은 페이지 문서 어디에 넣어도 `slot-count`가 나므로(설계 §4.4 — 레이아웃 전용, 웨이브 1 실측) 고르는 순간 서버가 422를 낸다. **보내 봐야 실패할 편집은 만들지 않는다**(D7)에 걸리므로 케이스를 둘로 갈랐다. 거르는 판정은 이름이 아니라 **`validatePage`를 실제로 돌려** 한다 — 이름 목록을 손으로 두면 같은 성질의 타입이 생길 때 어긋난다(D6과 같은 근거).
| 2 | `목록은 이름순이다` | D6 |
| 3 | `자식을 담을 수 있는 타입이 표시된다` | `def.children === 'many'` |
| 4 | `안에 추가로 고르면 선택 노드의 마지막 자식이 된다` | |
| 5 | `아래 추가로 고르면 선택 노드의 다음 형제가 된다` | |
| 6 | `추가하면 add op이 나간다` | |
| 7 | `추가한 노드가 선택된다` | 사용자가 방금 만든 것을 바로 편집할 수 있다 |
| 8 | `취소하면 아무것도 나가지 않는다` | **양성 대조** |
| 9 | `children이 none인 노드에는 안에 추가가 비활성이다` | |
| 10 | `추가한 노드에 속성 패널이 그 타입의 필드를 보인다` | **P2b-2와 이어진다는 증거** |
| 11 | `undo하면 추가한 노드가 사라진다` | |

**케이스 1이 D6의 하중이다** — 그룹 표를 손으로 두지 않았다는 것이 여기서 지켜진다.

- [ ] **Step 2~3: 구현하고 커밋**

목록은 접근 가능한 형태여야 한다 — `role="listbox"`나 버튼 목록. **`select` 요소를 쓸지 버튼 목록을 쓸지는 재보고 정하고 근거를 적어라.**

```bash
pnpm vitest run --project web && pnpm typecheck
git add apps/web/src/panels/type-picker.tsx apps/web/src/panels/structure-toolbar.tsx apps/web/src/shell.css apps/web/test/panels/type-picker.test.tsx
git commit -m "feat(web): 카탈로그에서 타입을 골라 노드를 추가한다"
```

---

### Task 8: 키보드 단축키

**Files:**
- Modify: `apps/web/src/panels/structure-tree.tsx`, `apps/web/src/panels/structure-toolbar.tsx`
- Test: `apps/web/test/panels/structure-keyboard.test.tsx`

- [ ] **Step 1: 테스트를 쓴다**

| # | `it` 이름 | 검사 |
|---|---|---|
| 1 | `구조 트리에 포커스가 있을 때 Delete가 노드를 지운다` | |
| 2 | `속성 패널에서 타이핑 중에는 Delete가 노드를 지우지 않는다` | **D8의 핵심** — 전역 리스너의 함정 |
| 3 | `Alt+위/아래가 순서를 바꾼다` | |
| 4 | `Tab이 트리 안에서 들여쓰기를 하지 않는다` | Tab은 포커스 이동이다 — **빼앗지 마라** |
| 5 | `단축키가 비활성 조작을 실행하지 않는다` | 버튼과 같은 판정을 지난다(D8) |
| 6 | `단축키와 버튼이 같은 op을 만든다` | 두 경로가 갈리지 않는다 |

**케이스 2가 없으면** 속성 패널에서 텍스트를 지우려고 Delete를 누른 사용자가 노드를 잃는다.
**케이스 4는 함정 방지다** — 들여쓰기 단축키로 Tab을 쓰고 싶어지지만 그러면 키보드 사용자가 트리를 빠져나갈 수 없다.

- [ ] **Step 2~3: 구현하고 커밋**

단축키를 무엇으로 할지는 위 표가 정한 것(Delete·Alt+화살표) 외에는 **재보고 골라라** — 브라우저·OS와 충돌하지 않는지 확인하고 근거를 적어라. **못 쟀으면 "재지 못했다"고 적어라.**

```bash
pnpm vitest run --project web && pnpm typecheck && pnpm test && pnpm test:build
git add apps/web/src/panels/ apps/web/test/panels/structure-keyboard.test.tsx
git commit -m "feat(web): 구조 편집에 키보드 단축키를 붙인다"
```

---

## 자체 리뷰

**설계 §9 커버리지**

| §9의 요구 | 어디서 |
|---|---|
| 노드 선택 | P2b-1이 이미 함 |
| 노드 추가 | Task 7 |
| 노드 삭제 | Task 5 |
| 노드 이동 | Task 5(순서)·Task 6(계층) |
| 이동(드래그) | **P2b-4** — "만들지 않는 것"에 적었다 |
| 구조 변경은 구조 트리에서 | Task 5~8이 전부 구조 트리 안이다 |

**P2b-2 이월 커버리지**

| 이월 항목 | 어디서 |
|---|---|
| `ops`를 만들면 파이프라인이 따라온다 | Task 5 케이스 10·11이 그것을 실증한다 |
| 관문(`useOpenPage`) | "실행 시 유의"에 적었다 |
| 오류 경계 밖 | Task 3 케이스 13 |
| `applyEdit`이 선택을 안 건드린다 | Task 5 케이스 4가 선택을 직접 옮긴다 |

**계획이 재지 않은 것 — 구현자가 재야 한다**

1. ~~**`children`이 없는 노드에 `add /…/children/0`을 하면 어떻게 되는가**(Task 1).~~ **잼(웨이브 1):** 던진다(`경로를 찾을 수 없습니다`) — `propOps`의 첫 갈래와 같은 성질이라 배열째 `add`한다. `inverse`는 `[remove /…/children]` 하나다.
2. ~~**같은 배열 안에서 뒤로 옮길 때의 인덱스 보정**(Task 2 케이스 2).~~ **잼(웨이브 1):** `[A,B,C]`에서 A를 인덱스 2로 옮기면 `[B,C,A]`다. `moveNodeOps`의 `index`는 **결과 배열에서의 자리**로 계약했다. **보정이 필요한 범위는 계획이 적은 것보다 넓다 — D2의 정정 참고.**
3. ~~**`move`의 `inverse`가 정말 반대 방향 `move` 하나인가**(Task 2 케이스 8).~~ **잼(웨이브 1):** 맞다(D2의 정정 참고).
4. ~~**`.default()` 없는 필수 prop이 있는 컴포넌트가 있는가**(Task 4 Step 1).~~ **잼(웨이브 1): 0개다.** 카탈로그 전부가 `props.safeParse({})`를 통과하므로 `createNode`는 `{ id, type }`만 만든다. `children`도 만들지 않는다.
5. **타입 목록을 `select`로 할지 버튼 목록으로 할지**(Task 7).
6. **단축키 선택이 브라우저·OS와 충돌하지 않는지**(Task 8).

**분모를 적지 않은 것**

완료 후 테스트 총수를 예측하지 않았다. 케이스는 구현 중에 늘고, 그 수를 계획에 못박으면 다음 사람이 그것을 목표로 삼는다.
