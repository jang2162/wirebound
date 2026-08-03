# P0 이월 사항

P0(스키마·렌더러 코어) 구현 중 발견됐으나 그 단계에서 고치지 않기로 판정한 항목들이다. 각 항목에는 어느 단계가 받아야 하는지가 붙어 있다. 다음 단계의 계획을 쓸 때 해당 항목을 태스크로 반영한다.

관련 문서: 설계 `docs/superpowers/specs/2026-08-03-wirebound-design.md`, 구현 계획 `docs/superpowers/plans/2026-08-03-p0-schema-renderer.md`

---

## P1 시작 전 필수

이 둘은 P1(서버·인증·권한·페이지 CRUD)이 시작되기 전에 해결되어야 한다. 미루면 서버가 미완성 게이트 위에 올라간다.

### 1. `packages/schema`가 순수 Node에서 로드되지 않는다

`package.json`의 `main`/`types`/`exports`가 전부 `./src/index.ts`를 가리키고, 상대 import에 확장자가 없다. Node 22가 타입은 벗겨내지만 첫 확장자 없는 상대 import에서 실패한다.

```
ERR_MODULE_NOT_FOUND: Cannot find module '.../packages/schema/src/node'
```

컴파일된 `dist`도 같은 문제다 — `dist/src/index.js`가 여전히 `export { createNodeId } from './node'`다.

P0에서는 소비자가 번들러뿐이라 무해했다. 그러나 **P1은 `apps/api`(Fastify, 순수 Node)** 이고, 설계 §3.3은 스키마가 "Node와 브라우저 양쪽에서" 동작해야 한다고 명시한다. 지금은 번들러 없이 어느 쪽에서도 동작하지 않는다.

빌드 방식을 P1 착수 전에 정한다 — `tsdown`/`tsup` + `publishConfig` exports 교체, 또는 `"development"` 조건부 export.

### 2. 검증기가 노드·문서 봉투를 런타임 검증하지 않는다

`validate.ts`는 `props`만 zod로 검사한다. `WbNode`와 `PageDocument`는 TypeScript 타입일 뿐이라 런타임에 아무것도 강제하지 않는다. 다음이 전부 `validatePage`에서 이슈 없음으로 통과한다:

| 입력 | 결과 |
|---|---|
| `root: { id: null, type: 'Page' }` | 통과 |
| `root: { type: 'Page' }` (id 없음) | 통과 |
| `root: { id: 42, type: 'Page' }` | 통과 |
| `root: { id: 'hello world' }` (id 형식) | 통과 |
| `marker: 'two'` | 통과 |
| `interactions: [{ on:'telepathy', actions:[{type:'rm -rf', target:1}] }]` | 통과 |
| `version: 'x'` 또는 version 없음 | 통과 |

설계 §7.1에서 서버의 게이트는 "적용 후 zod 검증" — 즉 이 함수다. §12.2에 따르면 입력에는 MCP 에이전트의 패치도 포함된다. 지금 상태로는 루트 노드에 id가 없는 페이지를 받아들이고, 그러면 "id는 코멘트·상호작용·잠금·패치 경로의 공통 앵커"(§4.3)라는 불변식이 깨진다. P2와 P5가 그 위에 얹힌다.

계획 자체의 공백이다 — `ValidationCode` 유니온에 봉투 위반용 코드가 없어서 어느 구현자도 추가하지 않았다. 재귀 `WbNodeSchema`와 `bad-node`/`bad-document` 코드를 추가한다.

---

## P1에서 함께 처리

### 3. `PageDocument`와 `LayoutDocument`가 구조적으로 동일하다

둘 다 `{ version: number; root: WbNode }`이고 판별자가 없어 상호 대입된다. 다음이 전부 컴파일된다:

- `renderComposed(page, layout)` — 인자 뒤바꿈. 조용히 렌더된다(3344자 대신 1885자의 엉뚱한 출력).
- `validatePage(layoutDoc)` — Slot 하나가 필수인 레이아웃에 "Slot 금지" 규칙을 적용한다.
- `renderDocument(doc: PageDocument)`는 이미 `compose.tsx`에서 `LayoutDocument`를 받고 있다. 타입이 구분되지 않아 동작할 뿐이라 시그니처가 거짓말을 하고 있다.

팬텀 판별자(`kind: 'page' | 'layout'` 또는 브랜드 타입)를 넣어 컴파일러가 뒤바꿈을 잡게 하고, `renderDocument`의 파라미터를 정직한 유니온으로 넓힌다.

### 4. `invertOps`가 입력보다 많은 연산을 반환할 수 있다

덮어쓰기 `move`의 역패치는 `[replace 대상=옛값, add 출발지=옮긴값]` 두 연산이다. 따라서 **연산과 역연산 사이에 1:1 인덱스 대응이 없다**. revision 로그, undo UI, API/WebSocket 계층 중 대응을 가정하는 것이 있으면 깨진다. 현재 in-repo 호출자는 테스트뿐이다.

덮어쓰기 move의 역패치는 옮긴 서브트리를 그대로 품으므로 해당 로그 항목이 커진다.

`invertOps`의 공개 JSDoc에 이 성질이 적혀 있지 않다(본문 주석과 private 함수에만 있음). 호출부 hover에서 보이도록 한 문장 추가한다.

### 5. `invertOps`의 성능 특성

`inverseOfMove`가 이제 모든 `move`에서 문서 전체를 클론한다(이전에는 `-` 대상만). 400노드 문서에서 `move` 50건 = 30.88ms vs `replace` 50건 = 15.07ms, 약 2배. revision 로그 쓰기 경로가 핫패스이므로 P1에서 측정 대상으로 둔다.

---

## P2 (에디터·revision 로그·개인 undo)

### 6. 렌더러가 검증기를 우회한다

`render.tsx`의 `def.props.parse(...)`가 raw `ZodError`를 던진다. 메시지는 영문(`Too small: expected number to be >=0`)이고 `ValidationIssue` 형태가 아니며 노드 id도 경로도 없다. 두 가지 문제:

- **로케일 불일치.** zod 메시지를 한국어로 내보내는 결정은 `validate.ts`에만 적용됐다. 렌더러는 영문을 낸다. props 검증 경로가 둘인데 출력 언어와 에러 타입이 다르다.
- **점진적 degradation 없음.** `parse`가 던지면 한 노드가 React 서브트리 전체를 죽인다. P2는 서버 검증 **전에** 낙관적 로컬 패치를 적용하므로(§7.1), 일시적으로 유효하지 않은 문서가 정상 상태다. 에러 경계도 노드 단위 폴백도 없다.

`safeParse` + 한국어 로케일로 바꾸고 실패 시 눈에 보이는 폴백 노드를 렌더한다. `requireComponent`가 알 수 없는 타입에 던지는 것도 같다.

---

## P4a (테마 엔진)

### 7. 구조가 inline style을 방출해 테마가 캐스케이드에서 진다

```
Flex        style="display:flex;flex-direction:row;align-items:stretch;..."
Grid        style="display:grid;grid-template-columns:repeat(2, 1fr);--wb-grid-columns:2"
Tree        style="padding-left:0px"
Media       style="aspect-ratio:16/9"
Placeholder style="height:120px"
```

설계 §3.2는 명시적이다: "렌더러는 스타일을 갖지 않고 … DOM 구조와 `data-wb-*` 속성만 생성한다. 스타일은 전부 `themes`가 컴파일한 CSS가 담당한다." inline 선언은 모든 셀렉터를 이기므로, P4a 테마의 `[data-wb-component="Flex"]{display:grid}`는 매 속성마다 `!important` 없이는 진다. §6.0의 전제 — 같은 `List` 노드가 테마에 따라 테이블로도 카드 그리드로도 렌더된다 — 가 여기 걸린다.

`GridDefault`가 증상을 그대로 보여준다: `--wb-grid-columns`(올바른 방식, 테마 CSS가 소비 가능)를 내면서 바로 옆에 `grid-template-columns`를 inline으로 박아 무력화한다. 옳은 패턴과 틀린 패턴이 같은 함수 안 세 줄 거리에 있다.

**계획 유래 결함이다** — 코드가 계획 그대로다. 구조적 props를 CSS 커스텀 프로퍼티로만 내보내고 선언은 P4a 컴파일러가 소유하게 한다. P0의 시각적 충실도는 `apps/playground/src/debug.css`가 이미 담당한다.

### 8. 6속성 계약 밖의 data 속성 3종

`data-wb-role`(Text), `data-control`(Field), `data-direction`(Divider). 설계 §6.11: "이 여섯이 렌더러와 테마 사이의 전체 계약이다."

`data-wb-role`이 특히 문제다 — 예약된 `data-wb-*` 네임스페이스를 차지해 일곱 번째 공식 속성처럼 읽히므로, 테마 작성자가 여기에 셀렉터를 걸 것이고 테마 검증기(§12.4)는 대조할 선언이 없다. `TextDefault`는 이미 `ROLE_TAG`로 태그를 role에 따라 바꾸므로 `data-wb-role`은 부분적으로 중복이다.

역시 계획 유래. `ComponentDef`에 선언 채널(`dataAttrs`/`modifiers`, `parts`처럼 `defineComponent`가 검사)을 만들거나 7번의 CSS 커스텀 프로퍼티 채널로 접는다.

`packages/renderer/test/structures.test.tsx`의 가드 테스트가 이 세 개를 명시적 allowlist로 잡아두고 있다. 부채를 갚으면 그 테스트가 깨지므로 목록이 썩지 않는다.

---

## P4b (구조 구현체 확장)

### 9. 세 컴포넌트의 상태를 속성 패널에서 설정할 수 없다

| 컴포넌트 | 선언된 state | `editor`에 있나 |
|---|---|---|
| `List` | `selected`, `disabled` | 없음 |
| `Tree` | `selected`, `disabled` | 없음 |
| `Link` | `disabled` | 없음 |

설계 §5.1에 따라 속성 패널은 `editor`에서 자동 생성되므로, `editor` 항목이 없는 prop은 UI에서 도달 불가다. §6.5가 필요하다고 명시한 "선택된 행 강조", "필수값 미입력 시 저장 버튼 비활성" 같은 서술을 목업에서 보여줄 수 없다. `Button`과 `Field`는 제대로 되어 있다.

구조적 재발 방지: `defineComponent`에 `states`의 모든 항목이 `editor`에도 있어야 한다는 규칙을 추가한다. 이미 `states`를 props와 대조하고 있으므로 한 줄이다. P4b가 카탈로그를 키우기 전에 넣는 편이 싸다.

### 10. parts 가드 테스트가 기본 props로만 렌더한다

조건부로 렌더되는 조각들이 아직 검증되지 않는다: `Card.subtitle`, `Media.caption`, `Field.help`, `List.item`/`media`/`title`/`meta`, `EntryForm.label`/`control`.

`EntryFormLabelLeft`가 이미 압력을 보여준다 — 폼의 `title` prop을 `part('label')` 안에 렌더하는데, `EntryForm`이 `title` part를 선언하지 않기 때문이다. P4a 테마가 `[data-wb-component="EntryForm"] [data-wb-part="label"]`을 "label-left 행의 라벨 칸"으로 기대하고 스타일링하면 폼 제목을 받는다. 한편 선언된 `control`은 방출되지 않는다.

---

## 사소한 것들 (아무 때나)

- `packages/schema` tsconfig의 `include: ["src","test"]` + `composite`가 `dist/test/*.d.ts`를 방출한다. gitignore되어 무해하나 퍼블리싱 설정 시 놀라게 된다. `tsconfig.json`(src, composite)과 `tsconfig.test.json` 분리로 닫힌다.
- `tsconfig.base.json`의 `lib: ["ES2022","DOM"]`을 세 프로젝트가 공유하므로, `packages/schema`의 새 파일이 `document`나 `window`를 참조해도 typecheck를 통과한다. 스키마 로컬 `"lib": ["ES2022"]` 오버라이드가 §3.3 규칙을 컴파일러 강제로 바꾼다.
- `z.ZodTypeAny`는 zod 4.4.3에서 `ZodType`의 순수 별칭이며 `@deprecated`다. `z.ZodType`으로 바꾸면 계획이 승인한 유일한 `any`가 무비용으로 사라진다.
- `resetRegistry`/`resetStructures`가 "테스트 전용"이면서 두 패키지의 공개 `index.ts`에서 export된다. `apps/api`가 한 프로세스를 공유하면 실수 한 번이 카탈로그를 지운다. `@wirebound/schema/testing` 서브패스로 옮기는 것을 검토.
- `apply.ts`의 `add`/`replace`가 `op.value`를 **참조로** 삽입한다. `applyOp`이 입력 문서를 변형하지는 않으나, 반환 문서가 호출자의 op 객체와 구조를 공유하므로 문서와 revision 로그 항목이 메모리를 aliasing한다. 삽입 시 `structuredClone(value)`이면 불변성 보장이 완전해진다.
- `apply.ts`가 배열 인덱스에 `Number(key)`를 쓰므로 RFC 6902 §4가 금지하는 철자가 전부 같은 원소로 해석된다: `/children/00`, `/children/1.0`, `/children/0x1`, `/children/1e0`. 오염 벡터는 아니다(비숫자는 `NaN`이 되어 범위를 벗어남). 포인터 문자열 동등 비교를 하는 곳이 생기면 문제가 된다 — append-only 로그나 패치 병합에서 그럴 법하다.
- `assertValidPage`에 대응하는 `assertValidLayout`이 없다.
- `migrateDocument`가 `PageDocument`로만 타입되어 있다. §13.1은 가져오기와 스냅샷 복원이 이 경로를 공유한다고 하고 둘 다 레이아웃을 실어 나른다. 3번 때문에 지금은 동작한다.
- 구조 레지스트리 키가 `` `${type}:${structure}` `` 이고 이스케이프가 없다. 이름에 콜론이 들어가면 충돌한다. `Map<string, Map<string, StructureRenderer>>`가 부류를 제거한다.
- `invertOps`가 `from`이 해석되지 않는 `move`에 대해 이제 던진다(이전에는 엉뚱한 swap을 반환하고 나중에 실패). 개선이지만 어느 테스트도 고정하지 않는다.
- `structures.test.tsx`의 비계약 속성 스캔 정규식이 속성 **값** 안의 `data-` 유사 토큰도 잡는다(`title="x data-fake=y"`). 선재하는 한계.

---

## 프로세스 관찰

최종 리뷰가 짚은 것: **7번·8번·2번·6번은 전부 계획이 리터럴 구현 코드를 지정한 데서 왔다.** 태스크별 리뷰는 "코드가 계획과 일치하는가"를 검사하므로 이런 결함을 구조적으로 잡을 수 없다 — 코드가 계획과 정확히 일치하기 때문이다.

다음 단계의 계획은 **계약과 테스트를 이 수준으로 상세히 쓰되 구조 본문은 구현자에게 남기는** 편이 낫다. 그래야 스펙 준수 리뷰가 밀어붙일 대상이 생긴다.
