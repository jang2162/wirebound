# 노드 구역(이름 붙은 자식 자리) — 설계

로드맵 `docs/superpowers/plans/2026-10-22-skala-roadmap.md` 의 «모자란 것» 1 · «정한 것» A · «단계» 2 다. **노드의 자식이 몸통 배열 하나뿐인 모델에 «구역» — 이름 붙은 자식 자리 — 을 더한다.**

이 문서는 발행 시점의 기록(spec)이다. 구현이 병합되면 정본 설계서(`docs/superpowers/specs/2026-08-03-wirebound-design.md`)의 «페이지 스키마 노드» · «컴포넌트 카탈로그» · «컴포넌트 정의 구조» · «노드 속성» · «설계서 화면 구조» · «모델»(상호작용) · «MCP 도구» · «`/llms.txt`» 와 `apps/api/README.md` 가 지금 참인 것을 갖는다. 이 설계는 정본을 고치지 않는다 — 구현 차수가 고친다.

---

## 왜

지금 노드의 자식은 `WbNode.children` 하나이고(`packages/schema/src/node.ts`), 카탈로그는 그것을 받는지만 말한다(`ComponentDef.children: 'none' | 'many'` — `packages/schema/src/component/define.ts`). 테마 뷰는 그 배열을 그린 것 하나(`ViewProps.children` — `packages/theme-sdk/src/types.ts`)를 받아 제 몸통 자리에 둔다. 그래서 SKALA 관리자 화면설계서가 매 화면 쓰는 자리를 둘 곳이 없다:

| 자리 | 지금 |
| --- | --- |
| 카드 머리줄 오른쪽 단추 · 제목 옆 배지/보조 글 · 바닥 단추줄 | 없다 — `CardView` 는 `header`(제목 · 부제 prop) 와 `body`(자식) 뿐이다 |
| 검색폼 `[초기화][검색]` · 입력폼 `[저장][취소]` | 뷰에 박힌 `<span>` 이다(`packages/theme-sdk/src/default-views/input.tsx` 의 `SearchFormView` · `EntryFormView` 의 `actions` 조각) — 바꾸거나 지우거나 표지를 달 수 없다 |
| 결과 머리줄 «검색결과 총 N건» + 오른쪽 단추 · 셀렉트 | 없다 — 그리드 위에 붙는 줄이다 |
| 탭마다 다른 내용 | 못 둔다 — `TabsView` 는 탭 이름(`tabs` prop) 줄과 패널 하나(자식 전부)를 그린다 |

로드맵 «정한 것» A 가 답의 꼴을 정했다 — **구역의 내용은 자식 노드다.** 그러면 구역 안 노드도 표지 · 별칭 · 상태 보임 · 끌어 넣기 · 모듈 저장 · 붙여넣기 · 잠금을 그대로 쓴다.

## 정한 것 (이 설계가 따른다)

1. **구역의 내용은 자식 노드다**(로드맵 A) — 속성 표가 아니다.
2. **옛 문서 호환은 짓지 않아도 된다** — 문서 판을 올리고 옛 판을 거절해도 된다. 고르는 것은 «사용자에게 물을 것» Q1.
3. **검색폼 · 입력폼의 단추는 새로 만들 때 기본 내용으로 실제 노드가 들어간다** — 지울 수 있는 보통 노드다.

## 이 설계가 고른 것 — 한눈에

| 물음 | 고른 것 | 이유(한 줄) |
| --- | --- | --- |
| 저장 꼴 | **몸통은 지금 `children` 그대로, 이름 붙은 구역은 `zones: { <이름>: WbNode[] }`** | 노드가 제 부모 사정을 안 들고(붙여넣기 · 모듈 그대로) 구역 사이 옮김이 `move` 하나이며, `/children/` 에 기대는 테스트 191 파일을 안 건드린다 |
| 식별자 | 필드 `zones` · 화면 말 «구역» · 몸통의 이름 `body` | `slot` 은 레이아웃 `Slot` · `ViewProps.slot` · `anchored-ops` 의 `kind: 'slot'` 과, `region` 은 끌기 층의 `RegionsContext` 와 겹친다. `zone` 도 끌기 층의 «띠»(`DropZone` — 앞 · 뒤 · 안)와 겹쳐, A 의 첫 커밋이 그 이름을 `DropBand` · `band` 로 바꾼다(주석은 이미 «띠» 라 부른다) |
| 카탈로그 | `children: 'none' \| 'many'` 를 **`zones: ZoneDef[]`** 로 바꾼다 — `body` 가 들면 지금의 `many` | 구역을 읽는 자리(트리 · 놓기 · 렌더러)가 «몸통 + 이름 붙은 것» 을 한 목록으로 돈다 |
| 탭 | **새 컴포넌트 «탭 패널»(`TabPanel`) 을 `Tabs` 의 몸통에 둔다** — 탭 이름은 패널의 `label` | 탭 더하기 · 지우기 · 옮기기 · 복제 · 잠금 · 상태 보임 · 표지 · 탭마다 상호작용이 노드 연산 그대로다. 두 배열을 번호로 짝 짓지 않는다 |
| 결과 머리줄 | **`List` 의 머리 구역 둘**(`headStart` · `headEnd`) | 그리드에 붙어 함께 움직인다. 떨어진 줄은 지금도 `Flex` 로 짓는다 |
| `Section` 제목줄 | **안 단다** — 소제목 + 오른쪽 단추는 `Card`(테두리 없는 변형)로 | Q4 |
| 뷰 계약 | `ViewProps` 에 `zones` · `items` 를 **더한다**(뺄 것 없음) · SDK `<Zone name>` 이 `data-wb-zone` 을 편다 | 기본 뷰도 테마 뷰도 구역 자리를 같은 속성으로 낸다 — 에디터가 놓을 자리를 그것으로 찾는다 |
| 나누기 | **A 모델(원자적 한 브랜치) → B 에디터 넣기 · 놓기** | 노드를 걷는 자리 하나라도 `zones` 를 안 보면 그 안 노드가 잠금을 지난다 — A 안에서 나누지 않는다 |

---

## 1. 저장 꼴

### 후보

- **(가) 자식마다 `zone` 칸** — 배열은 `children` 하나, 구역은 자식이 든다(`{ id, type: 'Button', zone: 'actions' }`).
- **(나) `zones` 맵 + 몸통은 `children`** — `{ children: [...몸통], zones: { actions: [...], footer: [...] } }`.
- **(나′) 전부 `zones`** — `children` 을 걷고 몸통도 `zones.body`.
- **(다) 구역 노드** — 구역을 숨은 노드로 둔다(`Card.children = [구역 노드(제목 옆), 구역 노드(머리 오른쪽), 구역 노드(몸통), 구역 노드(바닥)]`, 내용은 그 구역 노드의 `children`).

### 견줌

«같다» 는 지금 코드가 그대로 맞는다는 뜻이다. 셈은 «소비자 조사» 절의 명령으로 다시 잰다.

| 소비자 | (가) `zone` 칸 | (나) `zones` 맵 | (나′) 전부 `zones` | (다) 구역 노드 |
| --- | --- | --- | --- | --- |
| JSON Patch 경로 | 같다 | 이름 붙은 구역만 `…/zones/<이름>/<i>` | 모든 경로가 바뀐다 | 같다 · 구역이 번호(`…/children/3/children/0`)라 읽어서는 뜻을 모른다 |
| 잠금 판정(`lock.ts`) | 같다 | `overlaps` · `lockConflictOfOps` 는 마디 단위라 같다 · `selectionConflicts` 의 손 순회만 구역을 돈다 | (나)와 같다 | 같다 — 다만 구역 노드를 고르면 무엇을 잡나를 새로 정해야 한다 |
| 트리 순회(`tree.ts` 의 `walkNodes` · 손 순회 다섯 벌) | 같다 | 구역을 돈다(자식 줄 읽기를 한 함수로 — 아래) | (나)와 같다 | 같다 |
| 구역 사이 옮기기 | `replace …/zone` + 구역 안 차례를 맞추는 `move` — 둘 | `move` 하나 | `move` 하나 | `move` 하나 |
| 붙여넣기 · 모듈 저장 · 복제 | 붙인 맨 위 노드의 `zone` 을 새 부모에 맞게 고치거나 걷어야 한다 — 노드가 제 부모 사정을 든다 | 같다(노드가 제 부모 사정을 안 든다) · 복사 함수가 구역을 돈다 | (나)와 같다 | 구역 노드는 복사 · 저장 · 붙이기를 막아야 한다 |
| 끌기 · 놓기 | «구역 안 i 번째» 를 배열 하나의 번호로 바꿔야 한다(구역이 섞여 있다) | (부모, 구역, i) 그대로 | (나)와 같다 | (구역 노드, i) · 구역 노드는 끌 수 없어야 한다 |
| 되돌리기(`patch/inverse.ts`) | 같다 | 같다(경로 일반) | 같다 | 같다 |
| 실시간 리베이스(`apps/web/src/store/anchored-ops.ts`) | 같다 | «넣을 자리» 인식이 `…/children/<i>` 에 더해 `…/zones/<이름>/<i>` 를 안다 · 빈 구역의 첫 자식(`add …/zones/<이름> [노드]` · `add …/zones {…}`)은 지금 `children` 의 «전제» 장치가 같은 꼴로 막는다 | (나)와 같다 | 같다 |
| 렌더러 | 자식을 구역으로 가른다 | 구역마다 그린다 | 구역마다 그린다 | 구역 노드를 그리지 않고 부모 뷰에 넘긴다 |
| 검증 | `zone` 이 부모가 선언한 이름인가 · 부모가 바뀌면 다시 본다 | `zones` 의 열쇠가 선언된 이름인가 | (나)와 같다 | 구역 노드의 수 · 차례 · 이름이 정확한가 · 구역 노드에 별칭 · 보임 · 표지 · 몫 · 상호작용이 없는가 |
| 노드를 세는 자리(이름 · 목록 · 문장 · 표지 · lint · 팔레트) | 같다 | 같다 | 같다 | **전부** 구역 노드를 빼야 한다 |
| 내보내기(HTML · PPTX) | 렌더러 그대로 | 렌더러 그대로 · `nodesOnly` 가 구역을 돈다 | (나)와 같다 | 구역 노드를 빼야 한다 |
| MCP · `/llms.txt` · CLI | `{type, zone}` 한 칸이라 쉽다 | 경로가 뜻을 말한다(`…/zones/actions/-`) | 경로가 길다 | 카드를 만들 때 구역 노드 넷을 id 와 함께 지어야 한다 — 빠뜨리면 검증 오류 |
| 기존 케이스 | 거의 같다 | 몸통 경로 그대로라 새 케이스만 | `/children` 이 든 191 파일 · 976 줄과 `children: [` 이 든 281 파일을 다시 쓴다 | 카드 · 폼 · 탭 픽스처를 다시 쓴다 |

### 고른 것 — (나)

**몸통은 지금 `children` 그대로 두고, 이름 붙은 구역은 `zones` 맵에 담는다.**

- (가)를 버린 까닭: **노드가 제 부모의 사정을 든다.** 붙여넣기 · 모듈 넣기 · 들여쓰기 · 다른 부모로 끌기마다 맨 위 노드의 `zone` 을 고쳐야 하고, 하나라도 빠뜨리면 노드가 새 부모에 없는 구역을 가리킨다. 한 배열에 구역이 섞여 «구역 안 차례» 가 배열 번호와 따로 놀아 끌기 · 순서 바꾸기 · 리베이스가 모두 그 환산을 하나 더 든다. 구역 사이 옮기기가 연산 둘이라 둘 사이에서 남의 편집이 끼면 반쯤 옮겨진 판이 선다.
- (나′)를 버린 까닭: 얻는 것은 «몸통도 이름 하나» 라는 대칭뿐인데, 값은 `/children` 에 기대는 케이스 191 파일 · 976 줄의 재작성과 모든 경로가 길어지는 것이다. 몸통을 `children` 에 두는 비대칭은 아래 «자식 줄 읽기» 함수 하나가 가린다.
- (다)를 버린 까닭: 경로 · 잠금 · 리베이스는 공짜지만 **노드를 세고 고르고 고치는 모든 자리가 «구역 노드는 노드가 아니다» 를 따로 지켜야 한다** — 별칭 · 보임 · 표지 · 몫 · 상호작용 · 삭제 · 끌기 · 복사 · 모듈 · 팔레트 · 이름 · 문장 · lint 가 다 그렇다. 하나라도 빠뜨리면 구조가 깨진 문서가 저장된다. MCP 로 카드를 만드는 에이전트는 구역 노드 넷을 id 와 함께 지어야 한다.

### 모양

```jsonc
{
  "id": "n_card", "type": "Card",
  "props": { "title": "회원 정보" },
  "children": [ { "id": "n_kv", "type": "KeyValue" } ],                 // 몸통(body)
  "zones": {
    "headEnd": [ { "id": "n_edit", "type": "Button", "props": { "label": "수정" } } ],
    "footer":  [ { "id": "n_list", "type": "Button", "props": { "label": "목록" } } ]
  }
}
```

- **`zones` 는 선택 필드이고 구역 배열도 선택이다** — 없는 열쇠는 빈 구역이다. `children` 이 없으면 빈 몸통인 지금 규칙과 같다. 빈 배열도 받는다.
- **구역 이름은 `^[a-z][A-Za-z0-9]{0,31}$`** 이고 `body` 일 수 없다(몸통은 `children` 에 산다 — 두 자리에 몸통이 서지 않게 봉투가 거절한다). JSON Pointer 이스케이프가 필요 없고 프로토타입 토큰(`__proto__` 등)이 꼴에서 빠진다.
- **열쇠 차례는 뜻이 없다** — 문서는 `jsonb` 에 살아 열쇠 차례가 저장 뒤 바뀐다. 차례가 필요한 자리(순회 · 화면)는 카탈로그의 구역 선언 차례를 쓴다(아래 «순회 차례»).
- **경로:** 몸통은 `…/children/<i>`, 이름 붙은 구역은 `…/zones/<이름>/<i>`. 구역 사이 옮기기는 `move` 하나다(`from: /root/children/0/children/2`, `path: /root/children/0/zones/footer/0`).

### 자식 줄 읽기는 한 함수다

지금 노드를 걷는 자리는 `tree.ts` 의 `walkNodes` 하나가 아니다 — 손으로 `node.children` 을 도는 자리가 따로 있다: `packages/schema/src/lock.ts` 의 `selectionConflicts`, `apps/api/src/lock/structure.ts` 의 `preorder`(`sameStructure` — `pages.structure_seq` 를 올릴지 정한다), `apps/web/src/edit/safe-walk.ts` 의 `walkSafely`, `packages/exporter/src/nodes.ts` 의 `nodesOnly`, `packages/themes/src/lint/index.ts` 의 `visit`, `packages/schema/src/tree.ts` 의 `rewrite` · `copyNode`, `packages/schema/src/visibility.ts`, `packages/renderer/src/render.tsx` 의 `renderNodeUncached`, `packages/schema/src/page-view.ts` 의 깊이(`path.split('/children/')`). **한 자리라도 `zones` 를 안 돌면 그 안 노드가 그 자리에서 사라진다** — 잠금 판정이면 구역 안 노드가 남의 잠금을 지나고, `sameStructure` 면 구역 사이 옮김이 `structure_seq` 를 안 올린다.

그래서 `packages/schema` 에 **자식 줄 읽기 하나**를 둔다:

```ts
/** 노드의 자식 줄 — 몸통(`children`)과 이름 붙은 구역(`zones`)을 순회 차례로. 검증 전 문서에서 던지지 않는다(배열이 아닌 줄은 빈 줄). */
export function childLists(node: unknown): { zone: string; pointer: string; list: readonly unknown[] }[]
// zone: 'body' | 구역 이름 · pointer: '/children' | '/zones/<이름>' (노드 경로 뒤에 붙는다)
```

위 자리는 전부 이것을 부른다. 케이스는 «`node.children` 을 직접 읽는 자리» 를 소스에서 세어(파서로 주석을 걷고) 이 함수와 그 허락된 자리 밖에서 0 인지 잰다 — 잠금 판정이 한 벌이라는 지금 케이스(`apps/web/test/lock/one-verdict.test.ts`)와 같은 꼴이다.

### 순회 차례

전위 순회에서 한 노드의 자식 줄은 **카탈로그가 구역을 선언한 차례**로 돈다(`Card` 면 제목 옆 → 머리 오른쪽 → 몸통 → 바닥 — 화면을 읽는 차례). 카탈로그가 모르는 열쇠(검증 전 문서 · 카탈로그를 안 깐 판 — `installCatalog` 전의 Node)는 선언된 것 뒤에 이름의 코드 단위 차례로 돈다. 그래서 `schema` 의 순회가 카탈로그 등록부를 본다 — 등록부가 순회를 import 하지 않는지 구현 때 고리를 확인한다.

차례가 판정을 바꾸지 않는 자리(잠금 — 집합만 본다)와 바꾸는 자리(뷰 모드 목록 · 내보낸 노드 목록 · 문장 차례 · CLI 출력)가 같은 차례를 본다.

---

## 2. 카탈로그 계약

```ts
interface ZoneDef {
  /** `body` 면 몸통(`children`), 그 밖은 `zones[name]`. 노드 안에서 겹치지 않는다. */
  name: string
  /** 화면 이름 — 구조 트리의 구역 줄 · 빈 구역 칸 · 이유 문장. 사람이 읽을 축(`label` 과 같은 검사). */
  label: string
  /** 받는 타입. 없으면 무엇이든(지금처럼 `Page` · `Slot` 은 검증이 따로 막는다). */
  accepts?: readonly string[]
  /** 새로 만들 때 넣는 내용 — 보통 노드다(지울 수 있다). id 는 만들 때 짓는다. */
  initial?: readonly NodeSeed[]
}

/** 기본 내용 한 개. props 는 그 타입의 규격을 지나야 한다(`defineComponent` 가 정의하는 자리에서 본다). */
interface NodeSeed {
  type: string
  props?: Record<string, unknown>
}

interface ComponentDef {
  // …지금 필드…
  /** 구역 선언 — 차례가 곧 순회 · 화면 차례다. 빈 목록이면 자식을 안 받는다(지금의 `children: 'none'`). */
  zones: readonly ZoneDef[]
  /** 이 타입이 설 수 있는 자리. 없으면 아무 데나. `TabPanel` 만 쓴다(`{ type: 'Tabs', zone: 'body' }`). */
  placement?: { type: string; zone: string }
  /** 몸통을 누가 그리나 — `'parent'` 면 이 타입의 뷰는 몸통을 안 받고 부모 뷰가 `items[i].content` 로 둔다(«테마 뷰 계약»). `TabPanel` 만 쓴다. */
  bodyHost?: 'self' | 'parent'
}
```

- **`children: 'none' | 'many'` 는 걷는다.** `zones` 에 `body` 가 있으면 지금의 `many` 다 — 지금 `many` 인 컴포넌트는 `zones: [{ name: 'body', label: '몸통' }]` 하나로 옮긴다. 읽던 자리(`apps/web/src/edit/structure-actions.ts` 의 `acceptsChildren` · `packages/schema/src/validate.ts` 의 `children-not-allowed` · `apps/web/src/palette/placeable.ts` · `apps/web/config/llms-txt.ts`)는 «그 구역이 있나» 로 묻는다.
- **받는 타입 제약은 필요하다 — 하나뿐이다.** `Tabs` 의 몸통은 `TabPanel` 만 받고 `TabPanel` 은 거기만 선다. 다른 구역(카드 바닥 · 폼 단추)은 무엇이든 받는다 — 단추줄에 단추만 온다는 근거가 없고, 링크 · 글 · 배치를 두는 화면을 막을 까닭도 없다. 제약을 두 쪽(`accepts` · `placement`)에 적는 까닭: `accepts` 만 두면 `TabPanel` 이 아무 `Flex` 안에 설 수 있고, `placement` 만 두면 `Tabs` 몸통에 단추가 선다.
- **비었을 때 화면에 서는 것:** 내보낸 번들 · PPTX · 뷰 모드에서는 **아무것도 없다** — 빈 바닥 구역이면 바닥줄째 없다(`<Zone>` 이 감싸는 요소째 안 그린다 — 아래 «뷰 계약»). 에디터 캔버스는 Q2.
- **기본 내용(`initial`)은 에디터가 노드를 새로 만들 때만 들어간다**(`apps/web/src/edit/create-node.ts` 의 `createNode` — 팔레트 · 끌기 · 하단 판 넣기). 기본값을 문서에 굽지 않는다는 지금 원칙(`createNode` 머리말)과 부딪히지 않는다 — 그 원칙은 prop 기본값의 것이고, 기본 내용은 사람이 지우고 고칠 **내용**이다. MCP · REST 로 쓰는 쪽은 받지 않는다(서버는 문서를 고쳐 쓰지 않는다 — 클라이언트의 낙관적 사본과 갈린다). `/llms.txt` 가 «만들 때 이 단추를 함께 넣으라» 를 컴포넌트마다 적는다.
- **기본 내용에 변형을 적지 않는다** — 카탈로그는 테마의 낱말을 모른다(정본 «컴포넌트 정의 구조» 의 «구조 · 조각 · 변형은 카탈로그에 없다»). «검색» 을 주 단추로 보이고 싶으면 사람이 고른다.
- **구역을 더하는 것은 판을 안 올린다** — 없는 열쇠가 빈 구역이라 옛 문서가 그대로 맞다. 구역을 빼거나 이름을 바꾸는 것은 판을 올린다.

---

## 3. 컴포넌트별 구역

| 컴포넌트 | 구역(차례대로 · `이름` 화면 이름) | 받는 것 | 기본 내용 |
| --- | --- | --- | --- |
| `Card` | `titleSide` 제목 옆 · `headEnd` 머리 오른쪽 · `body` 몸통 · `footer` 바닥 | 무엇이든 | 없음 |
| `SearchForm` | `body` 조건 · `actions` 단추 | 무엇이든 | `actions`: 버튼 «초기화» · 버튼 «검색» |
| `EntryForm` | `body` 항목 · `actions` 단추 | 무엇이든 | `actions`: 버튼 «저장» · 버튼 «취소» |
| `List` | `headStart` 머리 왼쪽 · `headEnd` 머리 오른쪽 | 무엇이든 | 없음 |
| `Tabs` | `body` 탭 | `TabPanel` 만 | `body`: 탭 패널 «탭 1» · 탭 패널 «탭 2» |
| `TabPanel` (새) | `body` 내용 | 무엇이든 | 없음 |
| `Page` · `Section` · `Flex` · `Grid` | `body` 몸통 | 무엇이든 | 없음 |
| 그 밖 | 없음 | — | — |

### 카드

- `title` · `subtitle` prop 은 그대로 둔다 — 제목은 글이고 노드가 아니다. **제목 옆**은 제목 줄 안 제목 뒤(배지 · «필수» 표시 · 보조 글), **머리 오른쪽**은 머리줄 오른끝(단추 · 링크 · 셀렉트), **바닥**은 몸통 밑의 줄이다.
- 머리줄은 제목 · 부제 · 제목 옆 · 머리 오른쪽 가운데 하나라도 있으면 선다 — 지금은 `title` 이 빈 글이어도 머리줄이 선다(`CardView` 의 `header`). 구현 때 «다 비면 머리줄째 없다» 로 맞춘다.

### 검색폼 · 입력폼

- **단추줄이 `actions` 구역이 된다** — 뷰의 `<span>조회</span><span>초기화</span>` · `<span>저장</span><span>취소</span>` 는 걷는다. 새 폼은 기본 내용으로 단추 둘이 든다. 지운 폼은 단추줄째 없다(설계서의 «조회 전용 폼»).
- **접기 단추(`collapsed` 일 때의 «검색 조건 ▸» 머리줄)는 뷰 몫이다** — 그 줄은 `collapsed` prop 이 낳는 표시이지 사람이 놓는 내용이 아니다. 접히면 `body` · `actions` 둘 다 DOM 에서 빠진다(지금 «자식도 DOM 에서 빠진다» 규칙을 구역 전부로 넓힌다).
- **검색폼 머리 구역은 안 둔다.** 로드맵 표 1 행이 «검색폼 머리» 를 든다 — 접기 줄이면 위처럼 뷰 몫이고, 접기 줄 오른쪽에 사람이 놓는 내용(«상세검색» 등)이 설계서에 있으면 `headEnd` 를 더한다. 구역을 더하는 것은 판을 안 올리므로(위) 뒤로 미뤄도 비용이 없다.
- 입력폼의 `title` prop 과 그 `label` 조각은 그대로다.
- `structural-gap`(«`EntryForm` 안에 `Field` 가 하나도 없다») 은 구역까지 센다 — 기본 단추만 든 새 폼은 그대로 경고다.

### 결과 머리줄 — `List` 의 머리 구역

설계서의 «검색결과 총 N건» + 오른쪽 단추 · 셀렉트는 그리드 위에 붙어 그리드와 한 덩어리로 움직인다. 그래서 **`List` 가 머리 구역 둘을 갖는다** — `headStart`(«총 N건» 글 · 범례) · `headEnd`(엑셀 다운로드 단추 · 행 수 셀렉트). 둘 다 비면 머리줄째 없다. 기본 내용은 없다 — 모든 목록에 머리줄이 서지 않는다.

- 따로 «결과 머리줄» 컴포넌트를 두지 않는 까닭: 그리드와 떨어진 줄은 지금도 `Flex`(`justify: between`) 에 글 · 단추를 넣어 짓는다 — 새 컴포넌트가 더하는 것은 «그리드에 붙는다» 뿐이고, 그것이 구역이 하는 일이다.
- «총 N건» 의 N 을 `items` 에서 지어 그리지 않는다 — 설계서의 수는 설계 글이고 사람이 적는다.
- 페이지네이션 바(로드맵 «모자란 것» 4)는 5 단계가 `List` 와 함께 짓는다. 그때 바의 구역(행 수 셀렉트 자리 등)이 필요하면 같은 장치로 더한다.

### 탭 — `TabPanel`

- **`Tabs.props.tabs`(탭 이름 배열)를 걷고 탭마다 `TabPanel` 노드를 몸통에 둔다.** 탭 이름은 `TabPanel.props.label`(기본 «탭»)이고 패널의 내용은 그 몸통이다. 짝 짓기가 없다 — 패널 하나가 탭 하나다.
- `Tabs.props.active` 는 그대로 «몇째 패널» 이다(0 부터). 그 자리의 패널이 지금 상태에서 숨었거나 없으면 보이는 첫 패널을 그린다.
- **더하기 · 지우기 · 옮기기는 노드 연산이다** — 패널을 넣고(팔레트 · 복제 Cmd+D) 지우고 끌어 옮긴다. 지운 패널의 내용은 함께 지워진다(되돌리기 한 번). 이름 고치기는 그 패널을 골라 속성 패널에서 한다.
- 얻는 것: 탭마다 **상태 보임**(«관리자에게만 보이는 탭»), **표지**(«③ 상세정보 탭»), **상호작용**(«③ 상세정보 탭 클릭 시 …» — 지금은 `Tabs` 하나에 걸어 어느 탭인지 못 가른다), **별칭 · 잠금 · 모듈 저장**.
- **`switchTab` 은 패널을 가리킨다** — `{ type: 'switchTab', target: '<TabPanel id>' }`(`tab` 번호를 걷는다). 패널을 옮겨도 대상이 따라가고, 복사 · 모듈 넣기의 id 다시 짓기(`remapNodeIds`)가 대상을 함께 바꾼다. 검증은 대상이 `TabPanel` 인지 본다(지금은 `Tabs` 인지 — `packages/schema/src/interaction/check.ts`). 런타임은 그 패널의 부모 `Tabs` 의 `active` 를 그 패널의 차례로 덮는다. 문장은 «'상세정보' 탭으로 바꾼다».
- 패널의 화면은 «뷰 계약» 의 `items` 로 그린다 — 패널 노드의 뿌리 요소는 **탭 머리**(탭 이름)이고, 패널의 내용은 `Tabs` 뷰가 패널 칸에 둔다. 그래서 캔버스에서 탭 머리를 누르면 그 패널이 골라지고 번호 마커가 탭 머리에 선다. 고른 패널이 지금 탭이 아니면 캔버스가 그 탭을 펼쳐 보이는지는 Q3.

### 영역(`Section`) — 제목줄을 안 단다

`Section` 은 «화면 전체 폭 배경 + 가운데 칼럼» 이라는 사이트 레이아웃의 띠다(정본 «컴포넌트 카탈로그»). 설계서에 자주 나오는 «소제목 + 오른쪽 단추» 줄은 띠가 아니라 블록의 머리라, 그 줄을 `Section` 에 달면 띠와 블록이 한 컴포넌트에 섞인다. **그 줄은 `Card` 의 제목 · 머리 오른쪽으로 짓고, 시스템 테마에 테두리 없는 카드 변형을 더한다**(Q4). 블록과 떨어진 소제목 줄은 지금처럼 `Flex` 다.

### 아직 아닌 것

팝업 제목줄 · 바닥(로드맵 «정한 것» B — 팝업은 페이지 종류다)은 6 단계다. 팝업 페이지의 뿌리가 구역(`header` · `footer`)을 갖는 꼴이 이 장치로 그대로 선다 — 이 설계는 그 자리를 막지 않는다.

---

## 4. 테마 뷰 계약

```ts
interface ViewProps<P> {
  nodeId: string
  type: string
  props: P
  states: readonly string[]
  variant: string | undefined
  /** 몸통 구역을 그린 것 — 지금과 같다. */
  children: ReactNode
  /** 이름 붙은 구역마다 그린 것. 빈 구역은 `null`. 뷰는 직접 두지 않고 `<Zone name>` 으로 둔다. */
  zones: Readonly<Record<string, ReactNode>>
  /** 몸통의 자식을 하나씩 — 탭처럼 자식마다 머리와 내용을 가르는 뷰가 쓴다. 지금 보이는 자식만 든다. */
  items: readonly ViewItem[]
  slot: ReactNode
}

interface ViewItem {
  nodeId: string
  /** 몸통 배열의 자리(숨은 형제를 센다 — `Tabs.active` 와 같은 축). */
  index: number
  /** 그 자식을 그린 것(뿌리 요소). */
  element: ReactNode
  /** 그 자식의 몸통을 그린 것 — 자식이 제 몸통을 부모에게 맡기는 타입(`TabPanel`)일 때만, 아니면 `null`. */
  content: ReactNode
}
```

- **더하기만 한다** — `children` · `slot` 은 그대로다. 구역을 모르는 뷰(앞 SDK 로 짠 테마)는 이름 붙은 구역을 안 그린다 — 그 내용이 화면에서 사라진다. 그래서 SDK 판을 올리고(manifest 의 `sdk` 범위가 가른다), `wb-theme check` 가 «내용이 든 구역을 뷰가 안 그렸다» 를 오류로 잰다(갤러리 칸마다 구역에 표본 노드를 넣어 그린 뒤 `[data-wb-id=<노드>] [data-wb-zone=<이름>]` 이 있는지). 배포된 서비스가 없어 올라간 남의 테마는 없다.
- **`<Zone name="footer" as="div" data-wb-part="footer" />`** — SDK 의 새 부품. `view()` 가 내린 노드 문맥에서 그 구역의 그린 것을 읽고, 비었으면 **감싸는 요소째 안 그리며**, 있으면 `data-wb-zone="footer"` 를 단 요소로 감싼다. `Root` 가 표지를 펴는 것과 같은 자세다 — 뷰가 속성을 빠뜨리거나 잘못 적을 수 없다. `data-wb-part` 는 뷰가 함께 준 조각 이름이다(테마 CSS 가 겨냥한다).
- **`data-wb-zone` 은 노드 속성 표(정본 «노드 속성»)에 한 줄 더한다** — 값은 구역 이름, 싣는 것은 SDK `Zone`. 에디터는 이 속성으로 캔버스의 구역 상자를 찾는다(놓을 자리 · 축 · 빈 구역 칸). `data-wb-part` 는 뷰마다 다른 마크업 훅이라 에디터가 기댈 수 없다.
- **`TabPanel` 은 제 몸통을 부모에게 맡긴다** — 카탈로그에 적는다(`ComponentDef.bodyHost: 'parent'` — 그 타입의 뷰는 `children` 을 `null` 로 받고, 렌더러는 그 몸통을 부모의 `items[i].content` 로 넘긴다). 패널 노드의 뿌리 요소(탭 머리)와 그 내용이 DOM 에서 부모 · 자식이 아니다 — 에디터의 놓을 자리는 문서로 부모를 찾고(`structure-drop.ts`) 축만 DOM 부모로 읽으므로(`canvas-drop.ts` 의 `axisOf`) 그대로 선다. 그 밖에 «DOM 의 포함 = 문서의 포함» 에 기대는 자리가 있는지는 구현 A 가 센다(선택 외곽선 · 범위 선택 `use-canvas-marquee.ts` · 잠금 배지).

### 기본 뷰 · 기본테마(system-admin)

`system-admin` 은 뷰가 없고 SDK 기본 뷰 위에 `theme.css` 만 얹는다(`system-themes/admin/src/views/index.ts`). 그래서 구역의 자리는 **기본 뷰가 정하고 `theme.css` 가 꾸민다.**

| 뷰 | 구역의 자리 |
| --- | --- |
| `CardView` | `header` 조각 = `title` · `Zone titleSide` · `subtitle` · `Zone headEnd`(오른끝) · 그 밑 `body` · 밑 `Zone footer`(오른쪽 정렬 단추줄) |
| `SearchFormView` | 펴진 판: `fields`(몸통) 뒤 `Zone actions`(지금 `actions` 조각 자리) · 접힌 판: `toggle` 줄만 |
| `EntryFormView` | `label`(제목) · `row`(몸통) · `Zone actions` |
| `ListView` | 표 위에 `head` 조각(`Zone headStart` · `Zone headEnd` 양끝) — 둘 다 비면 조각째 없다 |
| `TabsView` | `list` 조각 = `items` 마다 `<span data-wb-part="tab" aria-selected>{item.element}</span>` · `panel` 조각 = 지금 패널의 `item.content` |
| `TabPanelView` | `<Root as="span">{label}</Root>` — 탭 머리 |

`theme.css` 는 지금 `[data-wb-part="actions"]` · `[data-wb-part="tab"]` 를 겨냥하는 규칙을 구역 자리에 맞춰 옮기고, 새 조각(`head` · `footer`)을 더한다. 갤러리(`packages/theme-gallery`)의 표본이 구역에 노드를 넣은 칸을 갖는다 — 테마 작성자가 그 자리를 본다.

---

## 5. 에디터

### 구조 트리

- **구역이 몸통 하나뿐인 노드는 지금과 같다** — 구역 줄을 안 세운다(`Flex` · `Grid` · `Section` · `Page` · `TabPanel`).
- **구역이 둘 이상이거나 이름 붙은 구역이 있는 노드는 자식 줄 위에 구역 줄을 세운다** — 카탈로그 차례대로 전부(빈 구역 포함). 빈 구역 줄은 흐리게 «비어 있음».

```
▾ 카드 '회원 정보'
    제목 옆 · 비어 있음
  ▾ 머리 오른쪽
      버튼 '수정'
  ▾ 몸통
      키-값 목록
    바닥 · 비어 있음
```

- **구역 줄은 노드가 아니다** — 고르면 «넣을 자리» 가 그 구역이 된다(팔레트 넣기 · 붙여넣기의 대상). 노드 선택이 아니라 잠금을 잡지 않고, 속성 패널은 구역 이름과 «이 구역에 넣을 것을 하단 판에서 고르세요» 한 줄을 보인다. 줄 행동(`…`)이 없다.
- 키보드: 구역 줄도 트리 항목이라 ↑↓ 로 지나고 ← → 로 접고 편다. 구역 줄에서 Delete · Cmd+C · Cmd+D 는 아무 일도 안 한다.
- **위로 · 아래로는 구역 안에서만** — 구역 경계를 넘지 않는다(첫 자식의 «위로» 는 꺼진다). 들여쓰기는 앞 형제의 **몸통** 끝으로 간다(앞 형제에 몸통이 없으면 꺼진다). 내어쓰기는 부모의 뒤 — 부모가 든 구역에 선다.

### 캔버스의 놓을 자리

- **구역 안에 형제가 있으면 지금 규칙 그대로다** — 형제의 앞 · 뒤 띠. 축은 그 형제의 DOM 부모(구역 요소 `[data-wb-zone]`)의 배치로 읽는다.
- **노드 «안» 은 몸통이다** — 지금 «자식을 받는 컴포넌트의 안 = 마지막 자식» 은 «몸통의 끝» 으로 읽는다. 몸통이 없는 노드(`List`)는 «안» 이 없다(앞 · 뒤만).
- **빈 구역에 놓기** — 빈 구역은 DOM 에 없다(위 «비었을 때»). 끌기 동안 빈 구역 칸이 서는지는 Q2. 칸이 서면 그 칸이 «안» 띠 하나다.
- **구역 사이 옮기기** — 같은 노드의 다른 구역으로 끌면 `move` 하나가 나간다.
- 받는 타입 제약에 걸리면(`Tabs` 몸통에 단추 · `TabPanel` 을 `Flex` 에) 놓을 자리가 안 서고, 이유는 «탭에는 탭 패널만 넣을 수 있습니다» · «탭 패널은 탭 안에만 놓을 수 있습니다». 판정은 지금처럼 검증 탐침이다(`palette/placeable.ts` — 넣은 문서를 검증해 새 오류가 나면 못 놓는다).

### 넣기 · 붙여넣기 · 모듈 넣기의 대상

지금 규칙(«고른 것이 컨테이너면 그 안 끝, 잎이면 그 뒤» — `palette/palette-add.ts` · `edit/paste-ops.ts`)을 구역으로 넓힌다.

| 고른 것 | 넣는 자리 |
| --- | --- |
| 구역 줄 | 그 구역의 끝 |
| 몸통이 있는 노드 | 몸통의 끝(지금과 같다) |
| 몸통이 없는 노드(구역만 있는 `List` · 잎) | 그 노드의 뒤 — 그 노드가 든 구역 |
| 없음 · 뿌리 | 페이지 끝 |

모듈 · 붙여넣기의 묶음이 그 구역의 받는 타입 제약에 걸리면 지금 «넣을 부모가 자식을 안 받음» 과 같은 길로 이유 문장을 낸다.

### 속성 패널

- 구역은 속성 패널의 칸이 아니다 — 구역 안 노드는 트리 · 캔버스로 고른다.
- `Tabs` 의 «탭 목록»(`stringList`) 칸이 걷히고 «활성 탭»(수) 칸이 남는다. 탭 이름은 패널을 골라 고친다.
- 몫(`weight`)은 부모의 배치를 본다 — 구역 안 노드의 몫은 그 구역의 배치가 정한다. 지금 몫이 듣는 자리(`Flex` · `Grid` · 열을 정한 `SearchForm` 의 몸통)만 칸이 선다. 단추줄 구역은 몫이 안 듣는다.

---

## 6. 그 밖의 소비자

| 소비자 | 바뀌는 것 |
| --- | --- |
| 봉투(`envelope.ts` 의 `WbNodeSchema`) | `zones: z.record(구역 이름, z.array(WbNodeSchema)).optional()` · 이름 꼴 · `body` 거절 |
| 검증(`validate.ts`) | 새 코드 — `zone-not-allowed`(그 타입이 선언 안 한 구역 · 구역이 없는 타입의 `zones`) · `zone-type-not-allowed`(받는 타입 밖) · `misplaced-component`(`placement` 밖 — `TabPanel` 이 `Tabs` 몸통 밖). `children-not-allowed` 는 «몸통이 없는 타입의 `children`» 으로 남는다. 이슈 경로는 그 구역 경로다 |
| 잠금 | 판정 규칙은 그대로다 — 구역 안 노드의 경로도 조상 관계로 겹친다. 노드를 고르면 그 서브트리(구역 전부)를 잡는다. 바뀌는 것은 손 순회 셋(`selectionConflicts` · `apps/api/src/lock/structure.ts` · `walkSafely`)이 `childLists` 를 부르는 것뿐 |
| 구조 번호(`apps/api/src/lock/structure.ts` 의 `sameStructure`) | 전위 열에 구역 이름을 더한다 — 구역 사이 옮김이 `structure_seq` 를 올린다(판정이 안 바뀌어도 «다시 판정하는 쪽으로 틀린다» 는 지금 규칙) |
| 되돌리기 · 리베이스 | 서버 역연산은 경로 일반이라 그대로다. 웹 `anchored-ops.ts` 는 «넣을 자리» 의 부모 id 에 구역 이름을 더하고, 빈 구역 · 빈 `zones` 를 만드는 `add` 를 지금 `children` 의 «전제»(`premise.had` · `kids`)로 막는다 |
| 웹 편집 연산(`edit/ops.ts`) | 넣기 · 옮기기 · 지우기의 자리가 `{ parentId, zone, index }` 가 된다(`zone` 기본 `body`). 빈 구역의 첫 넣기는 `add …/zones/<이름> [노드]` 또는 `zones` 가 없으면 `add …/zones { <이름>: [노드] }` — 지금 `children` 이 없는 부모에 배열째 넣는 갈래와 같은 꼴 |
| 복사 · id 다시 짓기(`tree.ts` 의 `remapNodeIds` · `stripMarkers`) | 구역을 돈다 — 선언된 키만 옮기는 계약에 `zones` 를 더한다 |
| 모듈 저장 · 붙여넣기 · 클립보드 | 노드가 제 부모 사정을 안 들어 그대로다(묶음 밖 대상 거르기 · 상태 보임 맞추기는 순회만 넓힌다). `TabPanel` 을 맨 위로 든 묶음은 `Tabs` 몸통에만 넣힌다(검증 탐침) |
| 상호작용 | `switchTab` 이 패널을 가리킨다(위 «탭»). `setProp` · `setVisible` 은 구역 안 노드도 그대로 대상이다 |
| 렌더러 | 구역마다 그려 `zones` 로, 몸통 자식마다 `items` 로 넘긴다. 숨김(상태 · 겹layer)은 지금처럼 그리기 전에 거른다. 노드 캐시(`nodeCacheFor`)의 열쇠는 그대로 — 구역도 노드 객체 안이다 |
| 표지 좌표(`renderer` 의 마커 함수) | 그대로 — 구역 안 노드도 제 `Root` 를 갖는다. 지금 탭이 아닌 패널의 내용 · 접힌 폼의 내용은 DOM 에 없어 번호가 안 선다(상태에서 숨은 노드와 같은 판 — 내보내기의 코멘트 목록이 그 노드를 어떻게 적는지는 지금 규칙을 따른다) |
| 내보내기(HTML 번들 · PPTX) | 렌더러 그대로. `packages/exporter/src/nodes.ts` 의 `nodesOnly` · `sentences.ts` 가 구역을 돈다 |
| lint | `structural-gap` 은 서브트리 전부(구역 포함)를 센다. 테마 lint(`packages/themes/src/lint`)의 순회가 구역을 돈다. «현재 테마에 없는 variant» 는 구역 안 노드도 센다 |
| 뷰 모드 목록 · CLI · MCP(`page-view.ts` 의 `pageView`) | 목록의 노드에 `zone`(이름 붙은 구역일 때)을 싣고, 깊이는 노드 마디 수로 센다(`/children/` 셈을 걷는다). CLI `page get` 은 구역 노드 앞에 구역 화면 이름을 붙인다 |
| `/llms.txt`(`apps/web/config/llms-txt.ts`) | 컴포넌트마다 구역(이름 · 받는 것 · 기본 내용)과 경로 꼴(`…/zones/<이름>/-`)을 적는다 · `children: many/none` 문구를 걷는다 · 생성 파일 `apps/web/public/llms.txt` 를 다시 낸다 |
| 새 페이지 · 레이아웃(`apps/api/src/routes/pages.ts` · `repos/layouts.ts`) | 그대로(`Page` 의 몸통) |

---

## 7. 문서 판

`Tabs` 의 모양이 바뀌고(`tabs` prop → `TabPanel` 노드) 폼의 단추가 문서로 옮겨 가므로 **문서 판을 3 으로 올린다**(`packages/schema/src/migrate.ts` 의 `CURRENT_DOCUMENT_VERSION`). 판 2 문서를 어떻게 하는지는 Q1.

- 판 2 문서가 판 3 에서 달라지는 것은 둘뿐이다 — `Tabs`(`tabs` 가 모르는 prop 이 되어 폴백으로 그려진다) · `SearchForm` · `EntryForm`(단추가 사라진다). 그 밖은 판 3 에서도 맞는 문서다(`zones` 가 없으면 빈 구역).

---

## 8. 구현을 나누는 법

**A 가 한 브랜치에서 원자적으로 들어가고, B 가 A 위에서 뒤따른다.** 둘은 나란히 돌지 않는다(B 의 놓을 자리 타입 `{ parentId, zone, index }` 를 A 가 정한다).

### A — 모델 (원자적)

**나누지 않는 까닭:** 봉투가 `zones` 를 받는 순간부터 MCP · REST 가 구역에 노드를 넣을 수 있다. 그때 노드를 걷는 자리 하나라도 구역을 안 돌면 — 잠금 판정이면 구역 안 노드가 남의 잠금을 지나고, `sameStructure` 면 잠금 판정이 낡은 구조로 돌고, 웹 리베이스면 남의 편집 뒤 내 편집이 엉뚱한 자리에 얹힌다. 뷰에서 단추를 걷는 것과 기본 내용으로 단추를 넣는 것도 한쪽만 들어가면 새 폼에 단추가 없다. 지침 «한쪽만 병합되면 전부 죽는 변경은 트랙을 나누지 않는다» 에 든다.

| 묶음 | 내용 |
| --- | --- |
| schema | `WbNode.zones` · 봉투 · `childLists` · 순회 차례 · `walkNodes` · `selectionConflicts` · `remapNodeIds` · `stripMarkers` · `visibility.ts` · 검증 코드 셋 · `ZoneDef` · `placement` · `bodyHost` · 카탈로그 열아홉의 `zones` · `TabPanel` · `Tabs` · `switchTab` · 문장 · `page-view` · lint · 판 3(+ Q1) |
| renderer · theme-sdk | `ViewProps.zones` · `items` · `<Zone>` · 기본 뷰 여섯(`Card` · `SearchForm` · `EntryForm` · `List` · `Tabs` · `TabPanel`) · 기본 CSS · SDK 판 |
| system-admin · gallery · kit | `theme.css` 의 구역 자리 · 판 올림과 `checksums.json` · 갤러리 표본 · `wb-theme check` 의 구역 규칙 |
| api | `sameStructure` · 노드를 걷는 자리(`routes/comments.ts` · `services/export-bundle.ts`) |
| web (모델만) | 끌기 층 «띠» 이름 바꾸기(`DropZone` → `DropBand` — 첫 커밋) · `walkSafely` · `edit/ops.ts` 의 자리 · `anchored-ops.ts` · `structure-actions.ts` 의 형제(구역 안) · `create-node.ts` 의 기본 내용 · 구조 트리의 구역 줄(**보이기만** — 고르기 · 넣기 대상은 B) · 속성 패널의 `Tabs` 칸 |
| exporter · mcp · cli · llms | `nodesOnly` · 문장 · CLI 출력 · `/llms.txt` 와 생성물 |

A 만 들어간 판의 에디터: 구역 안 노드가 트리 · 캔버스에 서고 고르고 고치고 지우고 구역 안에서 순서를 바꾼다. 폼은 단추를 든 채 새로 서고, 탭은 패널로 선다. **이름 붙은 빈 구역에 새 노드를 넣는 길만 없다**(MCP 는 된다).

### B — 에디터 넣기 · 놓기

구역 줄을 «넣을 자리» 로 고르기 · 팔레트 · 붙여넣기 · 모듈 넣기의 대상 구역 · 캔버스 놓기의 구역 축 · 빈 구역 칸(Q2) · 구역 사이 끌기 · 고른 노드를 펼쳐 보이기(Q3) · 받는 타입 제약의 이유 문장. 대부분 실브라우저 판(`apps/web/build-test/`)으로 잰다.

### 크기

| 트랙 | 크기 | 근거 |
| --- | --- | --- |
| A | **L ~ XL** | 걷는 자리 열 남짓 · 카탈로그 열아홉 · 뷰 여섯 · 웹 편집 연산 · 리베이스. 몸통 경로가 그대로라 기존 케이스 대부분은 안 바뀐다(바뀌는 것: `Tabs` · 폼 단추 · `children: 'many'` · `switchTab` 을 단언하는 케이스). 새 케이스: 순회 한 벌 인구조사 · 구역 안 잠금 · 구역 사이 `move` 의 리베이스 · 봉투 · 검증 셋 · 뷰 계약 · `check` |
| B | **L** | 트리 · 캔버스 · 팔레트 · 붙여넣기 · 키보드 — 실브라우저 판이 많다 |

---

## 사용자에게 물을 것

### Q1. 판 2 문서를 어떻게 하나

| 선택지 | 무엇이 되나 |
| --- | --- |
| **(가) 판 3 + 작은 옮기기 한 단계(추천)** | 판 2 → 3 단계 하나(`liftStateRegions` 옆): `Tabs` 는 `tabs` 이름마다 `TabPanel` 을 짓고 옛 자식을 `active` 자리 패널에 넣는다 · 폼에는 기본 단추를 넣는다. DB 마이그레이션이 부른다. 크기 S. 로컬 볼륨의 설계서가 그대로 열린다 |
| (나) 판 3 + 판 2 거절 | 짓는 것이 없다. 대신 판 2 페이지를 읽는 모든 자리가 오류다 — 로컬 DB 를 비워야 한다(설계서가 든 볼륨을 지운다) |

추천 까닭: 로드맵의 «호환을 고려하지 않는다» 는 짓지 않아도 된다는 허락이고, 여기서는 짓는 값(S)보다 비우는 값(사용자의 볼륨)이 크다. 사용자가 로컬 데이터를 버려도 된다고 하면 (나)다.

### Q2. 빈 구역을 캔버스에 어떻게 보이나

| 선택지 | 무엇이 되나 |
| --- | --- |
| **(가) 끄는 동안만(추천)** | 끌기를 시작하면 끄는 것을 받을 수 있는 빈 구역마다 점선 칸(구역 이름)이 선다 · 놓거나 그만두면 걷힌다. 끌지 않을 때의 캔버스가 내보낸 화면과 같다(정본 «테마의 범위» 의 «같은 폭에서 노드 · 번호 마커가 같은 자리»). 끌지 않고 넣을 때는 트리의 구역 줄을 고른다 |
| (나) 편집 중 늘 | 빈 구역마다 늘 점선 칸 — 찾기 쉽지만 캔버스 모양이 내보낸 화면과 갈린다(카드마다 빈 제목 옆 · 머리 오른쪽 · 바닥 칸) |
| (다) 캔버스에는 없다 | 빈 구역은 트리로만 넣는다 |

끌기 동안 칸이 서면 배치가 한 번 밀리는데, 지금도 끌기 미리보기(`canvas/canvas-preview.ts`)가 문서에 노드를 끼워 배치를 민다 — 같은 성질이다.

### Q3. 고른 노드가 숨은 자리에 있으면 캔버스가 펼쳐 보이나

지금 탭이 아닌 패널 · 접힌 검색폼(`collapsed`) 안의 노드를 트리에서 고르면 캔버스에 그 노드가 없다. 접힌 검색폼은 지금도 같은 판이다.

| 선택지 | 무엇이 되나 |
| --- | --- |
| **(가) 펼쳐 보인다 — 문서는 안 바꾼다(추천)** | 렌더러에 «보일 노드» 를 넘기면(`RenderOptions.reveal`) 그 조상의 `Tabs.active` · `SearchForm.collapsed` 를 그 화면에서만 덮는다. 문서 · 내보내기 · 뷰 모드는 그대로 |
| (나) 안 보인다 | 사람이 `active` · `collapsed` 를 바꿔야 보인다(그 바꿈은 문서 편집이라 남에게도 간다) |

### Q4. «소제목 + 오른쪽 단추» 줄을 무엇으로 짓나

| 선택지 | 무엇이 되나 |
| --- | --- |
| **(가) `Card` 의 테두리 없는 변형(추천)** | 시스템 테마에 `Card` 변형 «테두리 없음» 을 더한다 — 제목 · 머리 오른쪽 · 몸통이 그대로 쓰인다. 카탈로그는 안 바뀐다 |
| (나) `Section` 에 제목줄 | `Section` 에 `title` prop · `headEnd` 구역 — 띠와 블록이 한 컴포넌트에 섞인다 |
| (다) 새 «머리줄» 컴포넌트 | 왼쪽 · 오른쪽 구역을 든 줄 하나 — 지금 `Flex`(between) 로 짓는 것과 거의 같다 |

설계서를 저장소에서 볼 수 없어(로드맵 머리말) 이 판단은 로드맵 표 1 행의 문구로만 했다 — 설계서의 그 줄이 블록에 붙는 머리인지 떨어진 소제목인지에 따라 답이 갈린다.

---

## 소비자 조사 — 다시 재는 법

이 설계의 셈은 아래 명령으로 다시 잰다(워크트리 뿌리에서).

```bash
# children 을 읽는 자리 — 패키지마다(케이스 제외)
git grep -c -E '\.children\b|children:|/children' -- packages/schema/src apps/web/src apps/api/src ':!*.test.*'
# /children 경로에 기대는 케이스
git grep -l '/children' -- '*.test.*' | wc -l ; git grep -c '/children' -- '*.test.*' | awk -F: '{s+=$2}END{print s}'
git grep -l -E 'children: \[' -- '*.test.*' '*/test/*' | wc -l
# 카탈로그의 자식 판정을 읽는 자리
git grep -n -E "acceptsChildren|children === 'many'|children !== 'none'|children === 'none'|children !== 'many'" -- packages apps ':!*.test.*'
# 노드 순회를 쓰는 자리
git grep -l -E 'walkSafely|walkNodes|findNodePath|findVisit' -- packages apps ':!*.test.*' ':!*/test/*' ':!*/build-test/*'
# 이름이 겹치는지 — slot · region · zone
for w in slot slots region regions zone zones; do echo "$w $(git grep -niwF $w -- packages apps system-themes ':!*.md' | wc -l)"; done
```
