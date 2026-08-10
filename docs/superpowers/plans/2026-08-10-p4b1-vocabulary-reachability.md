# P4b-1 어휘와 도달성 구현 계획

> **에이전트에게:** 태스크 단위로 구현한다. 각 태스크는 실패하는 테스트 → 최소 구현 →
> 통과 → 커밋의 순환을 하나씩 갖는다. 단계는 체크박스(`- [ ]`)다.

**목표:** 테마가 쓸 수 있는 **어휘**와 노드가 도달할 수 있는 **표현**을 §6.8·§5.1의 선언과
맞춘다. 지금은 선언돼 있는데 **쓸 길이 없는 것**이 여럿이다.

**이것이 P4b의 첫 슬라이스다.** 다음 둘이 이 위에 얹힌다 — ② 구조 구현체 26개,
③ 시스템 테마 5종 + 고르개. **어휘를 먼저 넓히지 않으면 테마 다섯이 서로 비슷해 보이고
나중에 다시 만들게 된다.**

**바뀌는 화면은 하나다:** 속성 패널에 `variant`와 빠진 `states` 컨트롤이 생긴다.
캔버스의 외형은 이 슬라이스가 바꾸지 않는다.

**스택:** 기존 그대로. 새 런타임 의존을 더하지 않는다.

## 전역 제약

- **설계 문서(`docs/superpowers/specs/2026-08-03-wirebound-design.md`)를 고치지 않는다.**
  예시가 규격과 어긋나면 규격이 이기고, 어긋난 사실을 보고한다.
  **규격끼리 부딪히면** P4a-3이 세운 기준을 쓴다 — *"어느 규격이 다른 규격을 실행
  불가능하게 만드는가."*
- **§6.11의 여섯 속성 계약을 넓히지 않는다.** `data-wb-*`는 여섯뿐이다.
- **`packages/schema`는 zod 외의 런타임 의존을 갖지 않는다**(§3.3). 브라우저·Node 양쪽.
- **컴파일러는 `!important`를 쓰지 않는다.**
- **구조 구현체를 새로 만들지 않는다** — 그것은 P4b-2다. 이 슬라이스는 어휘와 카탈로그만 만진다.
- **시스템 테마를 새로 만들지 않는다** — 그것은 P4b-3이다. `admin` 하나를 필요한 만큼만 손본다.
- **api 테스트는 Postgres 하나(포트 5433)를 공유한다.** 컨테이너를 새로 띄우지 않는다.

---

## 확정한 결정

### D1. 어휘를 넓히는 근거는 **"선언은 있는데 쓸 길이 없다"**뿐이다

§6.8을 마음대로 늘리지 않는다. 이 슬라이스가 더하는 것은 **다른 규격이 이미 요구하는데
어휘가 없어 닿지 않는 것** 셋뿐이다.

| 무엇 | 무엇이 요구하는가 | 오늘 |
|---|---|---|
| `fontFamily` | §6.7의 `assets.fonts` **· §6.3의 `scale.typography.family`** | 폰트를 선언해도 **어느 테마도 컴포넌트에 걸 수 없다** |
| 그리드 트랙 → **`gridColumns`** | §6.11 예시의 `List:cardGrid` | **테마도 노드도 열 수를 못 정한다** (`List.columns`는 `visibleWhen:{structure:'table'}`인 **컬럼 이름 목록**이다) |
| 커스텀 프로퍼티 → **`treeIndent`** | 구조 기본 CSS의 `--wb-tree-indent` | 손잡이가 **죽어 있다** |

> **구현 결과:** 셋 다 열었다. 이름은 `STYLE_PROPERTIES_BEYOND_SPEC`에 근거와 함께 등록되고,
> `test/style.test.ts`의 §6.8 대조가 **양방향**으로 지킨다(절의 이름이 빠지지 않았는가 ·
> 절에 없는 것이 몰래 들어오지 않았는가). **`fontFamily`는 토큰이 이미 만들어지고 있었다** —
> `resolveTokens`가 `scale.typography.family`를 `typography.family.sans`로 펴는데 그것을
> 가리킬 프로퍼티가 없던 것이다.

### D2. 도달성은 `defineComponent`가 강제한다

§5.1은 속성 패널이 `editor`에서 **자동 생성**된다고 한다. 그러면 `editor`에 없는 것은
**UI에서 도달 불가**다. 오늘 그런 것이 둘 있다.

- **`states`** — `List.selected`·`List.disabled`·`Tree`·`Link.disabled` (P0 이월 #9)
- **`variants`** — `Button`·`Link`·`List`·`Section`·`Card`. **하나도 도달할 수 없다**
  (어느 컴포넌트의 `editor`에도 `variant` 항목이 없다)

**케이스를 하나씩 더하는 것으로 끝내지 않는다.** `defineComponent`가 검사하면 P4b-2·P4b-3이
카탈로그를 키울 때 같은 구멍이 다시 나지 않는다. **부류를 닫는다.**

> **구현 중 반증 — 뒤쪽(`variants`)은 성립하지 않는다.** 재라 #4를 A안(패널이 특수 취급)으로
> 정하면서 **패널이 `variants.length > 0 && variantFrom === undefined`를 보고 자동으로
> 여닫게 되어** 어긋날 자리 자체가 없어졌다. 늘 참인 단언을 검사로 두면 규칙만 는다.
>
> **대신 예외 쪽이 실제 구멍이었다** — `variantFrom`을 가진 컴포넌트에는 패널이 변형
> 컨트롤을 내지 않으므로 **그 prop이 유일한 길**인데, 그것이 `editor`에 있어야 한다는 것을
> 강제하는 것이 없었다. 오늘 셋(Text·Divider·Field)은 통과하지만 우연이었다.
> 그래서 `defineComponent`가 검사하는 것은 **`states`와 `variantFrom`이 가리키는 prop** 둘이다.

### D3. `variant`는 prop이 아니다 — 그것이 이 슬라이스의 핵심 난점이다

`EditorField.prop`은 **props의 키**를 가리키는데 `variant`는 **노드 봉투의 필드**다
(§4.3: `{ id, type, props, variant, marker, interactions, children }`).

즉 오늘 체계로는 `editor`에 `variant`를 적을 수 없다. `defineComponent`가
*"editor가 스키마에 없는 prop을 가리킵니다"*로 던진다.

**어떻게 열지는 재서 정한다**(재라 #4). 셋 다 대가가 있다.

### D4. `!important`도 `data-wb-*` 확장도 쓰지 않는다

전역 제약 그대로. 어휘를 넓히는 것과 계약을 넓히는 것은 다른 일이다.

### D5. 완전성을 세는 절을 먼저 놓는다

P4a-3이 `permission-matrix.test.ts`에 그것을 얻었다(소스를 훑어 분모를 만든다). 같은 절이
없는 표가 둘 남아 있다 — `http-client.test.ts`의 **경로·메서드 표**와 **응답 모양 케이스**.

**P4b-3이 고르개 엔드포인트를 더한다.** 그 전에 닫아 두지 않으면 같은 부류가 또 남는다 —
P4a-3에서 정확히 그렇게 여섯째 자리가 생겼다.

---

## 파일 구조

**고치는 것**

| 파일 | 무엇 |
|---|---|
| `packages/themes/src/resolve/style.ts` | `fontFamily`·그리드 트랙·커스텀 프로퍼티 어휘 |
| `packages/themes/src/spec/assets.ts`·`emit/index.ts` | `@font-face`를 낼지(재라 #1) |
| `packages/schema/src/component/define.ts` | 도달성 검사 · `variant` 채널 |
| `packages/schema/src/component/catalog/*.ts` | 빠진 `editor` 항목 |
| `apps/web/src/panels/property-panel.tsx` | `variant` 컨트롤 |
| `apps/web/test/api/http-client.test.ts` | 완전성을 세는 절 둘 |

**만드는 것**은 재라 결과에 따른다. 파일을 미리 정하지 않는다.

---

## Task 1: 완전성을 세는 절 둘 — **먼저 놓는다**

**Files:**
- Modify: `apps/web/test/api/http-client.test.ts`
- Test: 같은 파일

- [ ] **Step 1: 빠진 것을 세는 케이스를 쓴다**

`permission-matrix.test.ts`가 이 사이클에서 얻은 방법을 그대로 쓴다 — **소스를 훑어 분모를
만든다.** 클라이언트 쪽 분모는 `ApiClient` 인터페이스이고, `api-consumers.test.ts`가 이미
메서드 목록을 만들고 있다 — **재사용할 수 있는지 먼저 보라.**

두 표에 각각 붙인다:
- **경로·메서드 표** — `ApiClient`의 모든 메서드가 표에 있는가
- **응답 모양 케이스** — `SHAPES`가 다루는 모든 응답이 케이스에 있는가

- [ ] **Step 2: 지금 빠진 것이 있는지 확인한다**

**있으면 그것이 발견이다.** P4a-3이 `getProjectTheme` 하나를 뒤늦게 넣었는데, **그때
빠진 것이 그것뿐이었는지는 아무도 세지 않았다.**

- [ ] **Step 3: 구분력 실증**

표에서 한 줄을 지우고 새 케이스가 죽는지 본다. **양방향으로 재라** — 표에 없는 메서드를
더했을 때와, 표에 있는데 소스에 없는 메서드를 남겼을 때 둘 다.

- [ ] **Step 4: 커밋**

```bash
git add apps/web/test/api/http-client.test.ts
git commit -m "test(web): 클라이언트 표 둘에 완전성을 세는 절을 놓는다"
```

---

## Task 2: `fontFamily` 어휘

**Files:**
- Modify: `packages/themes/src/resolve/style.ts`
- Test: `packages/themes/test/style.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

테마가 `components.Text.base.fontFamily`를 선언하면 CSS에 `font-family` 선언이 나간다.

**값이 무엇을 받는가를 함께 정하라** — 토큰 참조(`typography.family`)인가, 리터럴인가, 둘 다인가.
§6.3의 `typography` 이름공간에 `family`가 있는지 **먼저 읽어 보고** 정하라.

- [ ] **Step 2: 실패를 확인한다**

- [ ] **Step 3: 어휘를 더한다**

`STYLE_PROPERTIES`에 한 줄. **`test/style.test.ts`가 §6.8 절을 읽어 대조하므로 그 케이스가
함께 죽는다** — 설계 문서를 고치지 말고, **어긋난 사실을 보고하라.** §6.8에 없는 어휘를
더하는 것이므로 그 대조가 깨지는 것이 정상이고, **그 케이스를 어떻게 할지 재서 정하라**
(재라 #2).

- [ ] **Step 4: `@font-face`를 낼지 정한다 (재라 #1)**

P4a-1이 *"P8이 URL을 다시 쓰므로 지금 만들면 되돌려야 한다"*로 안 냈고, P4a-2가
*"§6.8에 `fontFamily`가 없어 내도 걸 방법이 없다"*를 더했다. **이 태스크가 뒤쪽 근거를
없앤다.** 앞쪽 근거만으로 여전히 서는지 재서 정하라.

**내지 않기로 하면 그 사실을 케이스로 고정하라** — 산문으로만 남기면 아무도 다시 재지 않는다.

- [ ] **Step 5: 통과를 확인하고 커밋**

---

## Task 3: 그리드 트랙 어휘

**Files:**
- Modify: `packages/themes/src/resolve/style.ts`
- Test: `packages/themes/test/style.test.ts`

**§6.11의 예시가 요구한다:**
`[data-wb-component="List"][data-wb-structure="cardGrid"] { display: grid; gap: … }` —
**트랙 선언이 없어 CSS에서 1열이다.**

- [ ] **Step 1: 무엇을 더할지 재서 정한다 (재라 #3)**

`grid-template-columns`를 그대로 열지, `gridColumns: 3` 같은 좁은 어휘를 열지,
`repeat(auto-fill, minmax(…))`를 표현할 수 있게 할지.

**§6.8의 제한 이유 둘을 지켜야 한다** — *"값을 검증할 수 있고 GUI 편집이 가능하다"*,
*"설계서가 무제한 스타일 튜닝의 장이 되는 것을 막는다"*. `grid-template-columns`를 그대로
열면 임의 문자열이 되어 둘 다 깨진다.

**곁들여 판정할 것:** §6.6 예시의 **`Grid.props.gap`** — 카탈로그가 `gap`을 선언하지 않아
예시가 이슈가 된다(P4a-1이 남긴 판정). 이 태스크에서 함께 답하라.

- [ ] **Step 2: 실패하는 테스트를 쓴다**
- [ ] **Step 3: 구현한다**
- [ ] **Step 4: 구조 기본 CSS와 어긋나지 않는지 확인하라**

`GridDefault`가 `--wb-node-grid-columns`를 내고 구조 기본 CSS가
`repeat(var(--wb-node-grid-columns, 1), 1fr)`로 읽는다. **테마가 트랙을 선언하면 그 둘이
같은 프로퍼티를 두고 다툰다** — 어느 쪽이 이기는지 계산된 스타일로 재고 근거를 남겨라.

- [ ] **Step 5: 통과를 확인하고 커밋**

---

## Task 4: 커스텀 프로퍼티 채널

**Files:**
- Modify: `packages/themes/src/resolve/style.ts` 또는 `spec/components.ts`
- Test: `packages/themes/test/*`

구조 기본 CSS가 `--wb-tree-indent`를 손잡이로 남겼는데 **테마가 그것을 낼 길이 없다.**
P4a-2가 계획서에 *"테마의 손잡이가 된다"*고 적었다가 **구현 중 반증했다.**

- [ ] **Step 1: 어떻게 열지 재서 정한다 (재라 #5)**

임의 커스텀 프로퍼티를 열면 §6.8의 화이트리스트가 무의미해진다(무엇이든 `--x`로 낼 수 있다).
**선언된 이름만** 받는 쪽이 그 제한을 지킨다 — 그 목록을 어디가 소유하는가가 문제다
(`renderer`가 손잡이를 만드는데 `themes`는 `renderer`를 볼 수 없다, §3.3).

**이름 충돌도 보라** — `--wb-node-*`는 렌더러가 노드마다 내는 값이고 `cssVarName`이 만드는
이름은 토큰이다. 새 채널이 그 둘과 겹치지 않아야 한다(P4a-2의 재라 #5가 정확히 이 부류였다).

- [ ] **Step 2: 실패하는 테스트를 쓴다**
- [ ] **Step 3: 구현한다**
- [ ] **Step 4: `--wb-tree-indent`가 실제로 살아나는지 잰다**

테마가 값을 주면 `Tree`의 들여쓰기가 바뀌는 것을 **계산된 스타일로** 확인하라.
이것이 이 태스크의 판정이다.

- [ ] **Step 5: 통과를 확인하고 커밋**

---

## Task 5: `variant`가 속성 패널에 도달한다

**Files:**
- Modify: `packages/schema/src/component/define.ts`, `apps/web/src/panels/property-panel.tsx`
- Test: `packages/schema/test/component/*`, `apps/web/test/panels/property-panel.test.tsx`

**Interfaces:**
- Produces: 재라 #4의 결과에 따른다

- [ ] **Step 1: 셋 중 하나를 재서 고른다 (재라 #4)**

| 갈래 | 대가 |
|---|---|
| **패널이 `variant`를 특수 취급한다** | `editor`가 단일 진실이라는 §5.1이 깨진다 — 패널이 카탈로그 밖의 지식을 갖는다 |
| **`ComponentDef`에 `variantField`를 선언한다** | 선언이 하나 늘지만 `editor`와 나란히 산다. `variantFrom`(P4a-2)과의 관계를 정해야 한다 |
| **`variant`를 가상 prop으로 다룬다** | `EditorField.prop`을 그대로 쓸 수 있지만 **props에 없는 이름**이라 `defineComponent`의 기존 검사와 부딪힌다 |

**`variantFrom`을 가진 셋(Text·Field·Divider)은 어떻게 되는가를 함께 정하라** — 그쪽은
prop이 이미 변형을 정하므로 `variant` 컨트롤이 **나오면 안 된다**(나오면 P4a-3이 만든
`ignored-variant` 이슈를 UI가 유도하는 셈이다).

- [ ] **Step 2: 실패하는 테스트를 쓴다**
- [ ] **Step 3: 구현한다**
- [ ] **Step 4: `variantFrom` 컴포넌트에 컨트롤이 안 나오는 것을 케이스로 고정한다**
- [ ] **Step 5: 통과를 확인하고 커밋**

---

## Task 6: 빠진 `states`가 도달한다 (P0 이월 #9)

**Files:**
- Modify: `packages/schema/src/component/catalog/data.ts`·`action.ts`
- Test: `packages/schema/test/component/*`

| 컴포넌트 | 선언된 state | `editor`에 있나 |
|---|---|---|
| `List` | selected · disabled · loading · empty | **selected·disabled 없음** |
| `Tree` | selected · disabled | **둘 다 없음** |
| `Link` | disabled | **없음** |

**위 표는 P0 이월에서 옮긴 것이고 `List`의 것만 이 계획이 확인했다.** 카탈로그를 직접 읽어
맞춰라 — 어긋나면 카탈로그가 맞다.

- [ ] **Step 1: 실패하는 테스트를 쓴다** (Task 7의 검사가 이것을 대신할 수도 있다 — 순서를 정하라)
- [ ] **Step 2: 실패를 확인한다**
- [ ] **Step 3: `editor` 항목을 더한다**
- [ ] **Step 4: 통과를 확인하고 커밋**

---

## Task 7: `defineComponent`가 도달성을 검사한다 — **부류를 닫는다**

**Files:**
- Modify: `packages/schema/src/component/define.ts`
- Test: `packages/schema/test/component/*`

- [ ] **Step 1: 검사를 테스트로 쓴다**

```
states의 모든 항목이 editor에서 도달 가능해야 한다
variants가 비어 있지 않으면 그것도 도달 가능해야 한다
```

**`variantFrom`을 가진 컴포넌트는 예외다** — 그쪽은 prop이 변형을 정한다.

- [ ] **Step 2: 실패를 확인한다** — Task 6을 안 했으면 여기서 여럿이 죽는다
- [ ] **Step 3: 검사를 넣는다**
- [ ] **Step 4: 구분력 실증**

`editor`에서 한 줄을 빼고 `defineComponent`가 던지는지 확인하라. **카탈로그 전체가
그 검사를 지나는지도 확인하라** — 오늘 통과하지 못하는 컴포넌트가 있으면 그것이 발견이다.

- [ ] **Step 5: 통과를 확인하고 커밋**

---

## Task 8: `Media.kind` vs `Media.structures` 판정

`Media`의 `kind` prop과 `structures`가 **같은 이름 넷**이다(`image`·`video`·`illustration`·`chart`).
하나는 노드가 정하고 하나는 **테마가 고른다.**

**Files:**
- Modify: 판정 결과에 따른다
- Test: `packages/schema/test/component/*` 또는 `packages/renderer/test/*`

- [ ] **Step 1: 오늘 무엇이 일어나는지 재라**

노드가 `kind: 'video'`인데 테마가 `image`를 고르면 무엇이 그려지는가. `kind`는
`data-wb-*` 어디에도 안 나가므로 **구조 구현체 안에서만 쓰인다** — 실제로 쓰이는지 확인하라.

- [ ] **Step 2: 셋 중 하나를 정한다 (재라 #6)**

| 갈래 | 뜻 |
|---|---|
| **`kind`를 지운다** | 구조가 그것을 정한다. 노드는 테마가 고른 대로 그려진다 |
| **`kind`를 `variantFrom`으로 접는다** | `data-wb-variant`와 `data-wb-structure`가 **같은 값**을 갖는다. 설계가 그 상태를 말하지 않는다 |
| **둘을 다른 이름으로 가른다** | 겹치는 것이 우연이라고 보고 `kind`의 값을 바꾼다 |

**P4b-2가 `Media`의 구조 넷을 만든다.** 그 전에 정해야 그쪽이 헛일을 하지 않는다.

- [ ] **Step 3: 구현하고 케이스로 고정한다**
- [ ] **Step 4: 커밋**

---

## Task 9: `--wb-container-max` 판정 (P4a-1이 남긴 것)

§6.11의 컴파일 예시에 `--wb-container-max`가 있는데 **규격 경로 `container.maxWidth`에서
어느 규칙으로도 나오지 않는다**(`cssVarName`은 `--wb-container-maxWidth`를 만든다).

- [ ] **Step 1: 오늘 무엇이 나오는지 재라**
- [ ] **Step 2: 판정한다**

예시의 축약으로 보고 두는가, 이름 규칙에 예외를 두는가. **설계 문서는 고치지 않는다** —
판정과 근거를 코드 주석에 남기고 보고하라.

- [ ] **Step 3: 케이스로 고정하고 커밋**

---

## Task 10: 전체 회귀

```bash
pnpm test
pnpm typecheck
pnpm build
```

**그리고 `admin` 테마가 새 어휘를 하나도 안 쓰는 것을 확인하라** — 이 슬라이스는 어휘를
열 뿐이고 쓰는 것은 P4b-3이다. `admin`이 바뀌었으면 그 이유를 보고하라.

---

## 재라 — 이 계획이 정하지 않고 넘기는 것

| # | 무엇 | **잰 답** |
|---|---|---|
| 1 | `@font-face`를 낼 것인가 | **내지 않는다 — 근거를 갈아 끼웠다.** P4a-1의 남은 근거("P8이 URL을 다시 쓴다")도 **서지 않는다**: `compileTheme`이 순수 함수라 P8은 `Theme` **문서**의 `src`를 고쳐 다시 컴파일하면 되고 CSS를 후처리할 이유가 없다. **대신 이번에 잰 것으로 바꿨다** — `assets.fonts`의 `family`·`src`가 **아무 값 검증도 지나지 않아**(이슈 0건, 원문 그대로 실린다) CSS로 내면 임의 CSS 주입이 열린다. 그 값 규칙은 §6.7·§6.8 어디에도 근거가 없다 |
| 2 | §6.8 대조 케이스를 어떻게 할 것인가 | **대조를 둘로 갈랐다.** *"절의 이름을 하나도 빠뜨리지 않는다"*(누락)와 *"절에 없는 어휘는 `STYLE_PROPERTIES_BEYOND_SPEC`에 등록된 것뿐이다"*(몰래 확장). 하나로 두면 어휘를 더할 때 케이스를 지우게 되고 §6.8과의 연결이 통째로 끊긴다 |
| 3 | 그리드 트랙 어휘의 모양 | **`gridColumns: <양의 정수>` 하나.** `repeat(N, 1fr)`로 펼친다. `grid-template-columns`를 그대로 열면 임의 문자열이라 §6.8의 제한 이유 둘이 동시에 깨진다. **`auto-fill`/`minmax`를 표현하지 못하는 것을 알고 골랐다** — 반응형은 §6.5의 `responsive`가 브레이크포인트마다 다른 열 수를 주는 길로 닿는다 |
| 4 | `variant`를 패널에 어떻게 여는가 | **A안(패널이 특수 취급).** 패널이 읽는 것이 전부 카탈로그의 값이고 새로 갖는 지식은 *"variant는 봉투의 필드다"* 하나인데 그것은 모델의 사실이다. B안이 담을 정보는 **라벨 하나**뿐이라 §5.1의 계약을 넓힐 값어치가 없다. `variantFrom` 셋에는 내지 않는다 |
| 5 | 커스텀 프로퍼티 채널의 소유자 | **갈랐다.** 어휘 이름과 그것이 내는 CSS 이름은 `themes`, 읽는 규칙은 `renderer`, **두 문자열이 같은지는 `apps/web`의 케이스**(둘 다 보는 자리가 거기뿐이다). `schema`로 옮기면 대조가 없어지지만 `ComponentDef`를 넓혀야 해서 전역 제약에 걸린다. **임의 커스텀 프로퍼티는 열지 않는다 — 손잡이마다 별칭 하나다** |
| 6 | `Media.kind` | **지우지 않는다.** 실측으로 `MediaImage`가 그 값을 한 번도 읽지 않아 **오늘 죽어 있다**. 그러나 **P4b-2가 Media 구조 넷을 만들며 답을 낸다** — 구조가 없는 지금 정하는 것은 근거 없이 정하는 것이고, `z.strictObject`에서 prop을 빼는 것은 문서 마이그레이션이 필요한 파괴적 변경이다(§13.1). **"죽어 있다"를 케이스로 고정했다** |
| 7 | `--wb-container-max` | **예시가 줄여 쓴 것이다. 이름 규칙에 예외를 두지 않는다.** 근거를 같은 예시 안에서 셌다 — 그 `:root`의 변수 넷 중 **셋은 규칙과 일치하고 그 하나만 어긋난다** |
| 8 | `Grid.props.gap` | **더하지 않는다. §6.6 예시가 틀렸다.** `gap`은 §6.8이 이미 가진 **테마의** 어휘이고, 노드 props는 토큰 해석기를 지나지 않아 `"space.10"`을 통과시켜도 무효 선언이 된다. 예시를 그대로 넣으면 `invalid-props`인 것을 실측했다 |
| 9 | 새 어휘가 구조 기본 CSS와 다투는 자리 | **테마가 이기고 노드가 나른 `--wb-node-grid-columns`는 읽히지 않는다**(계산된 스타일로 쟀다). 인라인으로 실리는 것은 변수 값이지 선언이 아니다. `Grid`에서 그 조합은 **침묵**이므로 P4b-2·P4b-3이 알아야 한다 |
| 10 | `http-client.test.ts`에서 지금 빠진 것 | **경로·메서드 표에 열하나, 응답 모양 케이스에 셋**(`sessionUser`·`revisionList`·`patchResult`). **뒤의 셋은 무방비였다** — 그 shape를 통과 함수로 퇴행시켜도 0건이 죽었다(실측). 지금은 각 1건 |

---

## 계획이 재지 않은 것

| # | 무엇 |
|---|---|
| 1 | **속성 패널이 커진다.** `variant` + `states` 컨트롤이 붙으면 컴포넌트당 항목이 는다. 그 화면이 쓸 만한지 재지 않았다 |
| 2 | **`variants`에 값을 넣으면 `unknown-variant` 검증과 맞물린다.** 패널이 카탈로그의 목록만 보여 주면 도달할 수 없지만, 자유 입력이면 도달한다 |
| 3 | **어휘가 늘면 컴파일 결과가 커진다.** P4a-2가 `admin` 전체를 70규칙·19KB로 쟀는데 다섯 종이 되면 다시 재야 한다 |
| 4 | **`Section`·`Card`의 `variants`가 오늘 무엇을 뜻하는지** 카탈로그가 이름만 선언하고 어느 테마도 정의하지 않았다 |
| 5 | ~~**P0 이월 #10**(parts 가드가 기본 props로만 렌더)은 P4a-2·P4a-3이 `forEachVariation`으로 닫았을 수 있다. **확인하지 않았다**~~ → **확인했다: 절반만 닫혀 있었다.** P4a-2가 `data-*`와 `style` 가드를 옮기면서 **part 이름 계약은 기본 props에 남겼다** — 조건부 조각이 카탈로그에 없는 part 이름을 내도 **0건이 죽었다**(대조군 2건). P4b-1이 셋째 가드도 `forEachVariation`으로 옮겨 닫았다 |
| 6 | 커스텀 프로퍼티 채널이 열리면 **테마가 구조 기본 CSS의 어느 손잡이든 건드릴 수 있다.** 손잡이 목록이 계약이 되는데 그것을 누가 지키는지 정하지 않았다 |
