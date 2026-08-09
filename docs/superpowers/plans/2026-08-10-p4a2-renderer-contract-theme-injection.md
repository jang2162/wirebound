# P4a-2 렌더러 계약 정리 · 캔버스 테마 주입 구현 계획

> **에이전트에게:** 이 계획은 태스크 단위로 구현한다. 각 태스크는 실패하는 테스트 → 최소 구현 →
> 통과 → 커밋의 순환을 하나씩 갖는다. 단계는 체크박스(`- [ ]`)다.

**목표:** 테마 JSON이 실제 화면의 외형을 결정한다. 렌더러는 DOM 구조와 §6.11의 여섯 속성만
내고, `packages/themes`가 컴파일한 CSS가 캔버스에서 **이긴다.**

**아키텍처:**

```
                     구조 기본 CSS (renderer 소유, 정적)
                              │  먼저 깔린다
theme JSON ─resolveTheme─> ResolvedTheme ─compileTheme─> 테마 CSS
                                                          │  나중에 깔려서 이긴다
                                                          ▼
                                   apps/web  <style> 둘  →  캔버스
```

구조 구현체는 `style=`에 **CSS 커스텀 프로퍼티만** 싣는다. 일반 선언은 하나도 남지 않는다.
구조가 성립하기 위한 선언(`display:flex` 따위)은 `packages/renderer`가 **구조 기본 CSS**
문자열로 소유하고, 노드마다 달라지는 값은 커스텀 프로퍼티로 넘겨 그 CSS가 `var()`로 읽는다.

**스택:** 기존 그대로. `apps/web`의 의존에 `@wirebound/themes`가 더해진다.
`postcss`·`jsdom`은 **테스트 프로브로만** 쓴다(런타임 의존이 아니다 — P4a-1이 세운 관례).

## 전역 제약

- **렌더러가 방출하는 `data-*` 속성은 §6.11의 여섯뿐이다.** `data-wb-id`·`data-wb-component`·
  `data-wb-structure`·`data-wb-variant`·`data-wb-part`·`data-wb-state`.
- **컴파일러는 `!important`를 쓰지 않는다.** P4a-1의 D9 그대로다. 이 계획이 걷어내는 것이
  바로 `!important`가 필요했던 이유이므로, 여기서 쓰면 고친 것을 되돌리는 셈이다.
- **`packages/themes`는 `schema`만 본다. `renderer`를 보지 않는다**(§3.3).
  구조 기본 CSS가 `renderer`에 있는 이유가 이것이다 — 반대 방향이면 의존이 뒤집힌다.
- **새 프로덕션 런타임 의존을 더하지 않는다.**
- **시스템 테마는 하나만 만든다.** §6.10이 다섯을 열거하지만 다섯 종 제작은 P4b다.
- **설계 문서(`docs/superpowers/specs/2026-08-03-wirebound-design.md`)를 고치지 않는다.**
  예시가 규격과 어긋나면 규격이 이기고, 어긋난 사실을 보고한다(P4a-1이 세운 원칙).

---

## 확정한 결정

### D1. 구조 기본 CSS는 `renderer`가 소유한다

구조 구현체와 **그것이 성립하기 위한 선언**은 같은 패키지에 있어야 둘이 갈리지 않는다.
`themes`가 가지면 구조를 늘릴 때마다(P4b) 두 패키지를 함께 고쳐야 하고, 무엇보다
`themes`는 `renderer`를 볼 수 없다(§3.3).

**"스타일은 전부 `themes`가 컴파일한 CSS가 담당한다"(§3.2)와 어긋나지 않는다.** 여기서
`renderer`가 갖는 것은 **스킨이 아니라 구조가 서기 위한 최소 선언**이고, 테마가 그것을
덮을 수 있어야 한다는 것이 D2·D3의 요구다. 덮지 못하면 이 계획은 실패한 것이다.

### D2. 렌더러의 `style=`에는 커스텀 프로퍼티만 남는다

일반 선언 **0개**. 이것이 P0 이월 #7의 본체다. 커스텀 프로퍼티는 그 자체로 아무것도
그리지 않으므로 캐스케이드에서 이길 것이 없다 — 값을 나르는 통로일 뿐이다.

### D3. 노드마다 달라지는 값은 커스텀 프로퍼티로 넘긴다

~~`--wb-flex-direction`·`--wb-grid-columns`·… 이름 규칙은 `--wb-<컴포넌트 소문자>-<prop>`이다.~~

> **[구현 중 반증됨 — 재라 #5]** 이 이름 규칙은 테마가 내는 변수 이름과 **실제로 충돌한다.**
> `cssVarName('grid.columns')`가 `--wb-grid-columns`를 만드는데(`primitives.grid.columns`),
> 그것이 `Grid` 노드에 주려던 이름과 **정확히 같다.** `primitives.section.*`도 컴포넌트
> `Section`과 이름공간이 겹친다. 그래서 노드가 나르는 값에만 `--wb-node-` 접두어를 준다:
> `--wb-node-flex-direction`·`--wb-node-grid-columns`·`--wb-node-media-ratio`·
> `--wb-node-placeholder-height`·`--wb-node-tree-level`.
> 근거는 `packages/renderer/src/structure-css.ts`의 `NODE_VAR_PREFIX` 주석,
> 대조는 `apps/web/test/theme/system-theme.test.ts`.

`GridDefault`가 이미 `--wb-grid-columns`를 내면서 바로 옆에 `grid-template-columns`를
inline으로 박아 무력화하고 있다(P0 이월 #7이 지목한 그 세 줄). **옳은 절반이 이미 있으므로
틀린 절반을 지우는 일이다.**

### D4. 계약 밖 세 속성은 `data-wb-variant`로 접는다

`data-wb-role`(Text)·`data-control`(Field)·`data-direction`(Divider)은 **한 부류다** —
셋 다 "노드의 enum prop에서 파생되는 표현 변형"인데 계약에 채널이 없어 각자 속성을 만들었다.

§5.1은 이미 같은 모양의 채널을 하나 갖고 있다: **boolean prop → `data-wb-state`.**
빠진 것은 **enum prop → `data-wb-variant`**다. 그래서 `ComponentDef`에 `variantFrom`을 더한다.

```ts
variantFrom?: string   // 이 prop의 값이 data-wb-variant가 된다. variants에 그 값들이 선언돼야 한다.
```

**선언 채널을 새로 만드는 대안을 택하지 않은 이유:** §6.11이 *"이 여섯이 렌더러와 테마
사이의 전체 계약이다"*라고 못박았다. 일곱 번째를 만들면 테마 검증기(§12.4)가 대조할 선언이
또 늘고, `packages/themes`의 `checkThemeComponents`가 보는 어휘도 함께 넓어진다.

### D5. 주입은 `<style>` 둘이고 순서가 고정이다

구조 기본 CSS가 먼저, 테마 CSS가 나중. 둘을 한 장으로 합치지 않는 이유는 **테마가 없을 때
구조 기본 CSS만 남아야** 하고(에디터가 그때도 쓸 만해야 한다), 재컴파일 대상이 뒤쪽뿐이기
때문이다.

### D6. 주입 자리는 `document.head`다

캔버스 안에 `<style>`을 넣어도 **범위가 좁아지지 않는다** — CSS는 삽입 위치로 범위를 갖지
않고, 컴파일 결과의 첫 블록이 `:root`다. 좁아지지 않을 바에는 P5 내보내기가 넣을 자리
(§6.11: *"웹 앱은 컴파일된 CSS를 `<style>`로 주입하고, 내보낸 번들은 `assets/theme.css`로
담는다"*)와 같은 곳이 낫다.

### D7. 시스템 테마는 하나, 최소본으로 만든다

`system:admin` 하나. **오늘 구현체가 있는 구조**(`packages/renderer/src/structures/index.ts`의
`DEFAULTS` 19개)만 다룬다. 없는 구조를 고르는 테마를 쓰면 렌더러가 폴백을 그린다.

### D8. `!important`를 쓰지 않는다

전역 제약에 적은 그대로다. **이 계획의 성공 판정이 곧 이것이다** — `!important` 없이
테마가 이기면 P0 이월 #7이 닫힌 것이고, 이기지 못하면 아직 안 닫힌 것이다. `!important`로
덮으면 판정 자체가 사라진다.

### D9. 실증은 jsdom의 계산된 스타일로 한다

P4a-1의 리뷰어가 `test/emit-parse.test.ts`에서 이미 이 방법을 썼다 — jsdom은 캐스케이드를
계산한다. 실제 브라우저에서 재지 않은 것은 그대로 이월한다(아래 "재라" #9).

---

## 파일 구조

**만드는 것**

| 파일 | 책임 |
|---|---|
| `packages/renderer/src/structure-css.ts` | 구조 기본 CSS 한 장. `structureBaseCss(): string` |
| `packages/themes/src/system/admin.ts` | 내장 시스템 테마 하나 |
| `packages/themes/src/system/index.ts` | 내장 테마 조회 |
| `apps/web/src/theme/theme-source.ts` | 지금 쓸 테마를 고른다(P4a-3이 저장소로 바꾼다) |
| `apps/web/src/theme/use-theme-css.ts` | 컴파일 결과를 `<style>` 둘로 주입 |
| `apps/web/src/theme/theme-structures.ts` | 테마의 `structure` 선택 → `RenderOptions.structures` |

**고치는 것**

| 파일 | 무엇 |
|---|---|
| `packages/renderer/src/structures/structure.tsx` | Flex·Grid의 inline 선언 제거 |
| `packages/renderer/src/structures/document.tsx` | Media·Placeholder의 inline 선언, `data-wb-role`·`data-direction` 제거 |
| `packages/renderer/src/structures/data.tsx` | Tree의 inline 선언 제거 |
| `packages/renderer/src/structures/input.tsx` | `data-control` 제거 |
| `packages/renderer/src/attrs.ts` | `variantFrom` 소비 |
| `packages/schema/src/component/define.ts` | `ComponentDef.variantFrom` |
| `packages/schema/src/component/catalog/document.ts`·`input.ts` | Text·Divider·Field의 `variants`·`variantFrom` |
| `packages/renderer/test/structures.test.tsx` | 비계약 속성 allowlist 비움 |
| `apps/web/src/canvas/canvas.tsx` | 주입 · `structures` 배선 |
| `apps/web/package.json` | `@wirebound/themes` 의존 |

---

## Task 1: 캐스케이드 층을 정한다

구조 기본 CSS가 생기는 순간 질문이 하나 생긴다 — **테마가 그것을 어떻게 이기는가.**
이 태스크는 그 방법을 **재서** 정하고, 이후 태스크 전부가 그 결정 위에 얹힌다.

**Files:**
- Create: `packages/renderer/src/structure-css.ts`
- Test: `packages/renderer/test/structure-css.test.ts`
- Modify: `packages/renderer/src/index.ts` (export)

**Interfaces:**
- Produces: `export function structureBaseCss(): string`

- [ ] **Step 1: 두 방식을 jsdom에 넣어 어느 쪽이 서는지 잰다**

두 후보가 있다.

- **(A) `@layer`** — `@layer wb.structure, wb.theme;`로 순서를 못박고 각 시트를 층에 넣는다.
  특이도와 무관하게 테마가 이긴다. 구조 기본 CSS가 아무리 구체적인 셀렉터를 써도 안전하다.
- **(B) 순서 + 같은 특이도** — 구조 기본 CSS의 셀렉터를 `compileTheme`이 내는 것과 **같은
  모양**(`[data-wb-component="X"][data-wb-structure="Y"]`)으로 맞추고, 나중에 오는 테마가 이기게 한다.

**측정 코드를 먼저 쓴다.** 프로브는 테스트 안에서만 쓴다:

```ts
// packages/renderer/test/structure-css.test.ts
import { JSDOM } from 'jsdom'

function computed(css: string, html: string, selector: string, property: string): string {
  const dom = new JSDOM(`<style>${css}</style><body>${html}</body>`)
  const element = dom.window.document.querySelector(selector)!
  return dom.window.getComputedStyle(element).getPropertyValue(property)
}
```

재는 것은 셋이다.

1. **jsdom이 `@layer`를 해석하는가.** `@layer a, b;` + `@layer a { … }` + `@layer b { … }`를
   넣고 `getComputedStyle`이 b의 값을 내는지. **블록 안의 규칙이 통째로 무시되면(값이 빈
   문자열이면) (A)는 이 저장소에서 실증할 수 없다** — 그러면 (B)로 간다.
2. **(B)에서 순서가 실제로 이기는가.** 같은 셀렉터 두 벌을 순서만 바꿔 넣고 값이 뒤집히는지.
3. **`<style>` 두 개로 나눠도 같은가.** 한 문자열 안의 순서와 시트 두 개의 순서가 같은
   결과인지. D5가 시트를 둘로 나누므로 이것이 전제다.

- [ ] **Step 2: 잰 것을 케이스로 고정한다**

세 측정을 그대로 테스트 케이스로 남긴다. **`@layer`가 안 되면 "jsdom이 `@layer` 안의 규칙을
반영하지 않는다"를 케이스로 남기고 (B)로 간다** — 나중에 누가 (A)로 바꾸려 할 때 이 케이스가
근거가 된다.

- [ ] **Step 3: `structure-css.ts`를 만든다**

이 시점에는 `Flex`만 담는다. 나머지는 Task 2·3이 채운다.

```ts
/**
 * 구조 구현체가 서기 위한 최소 CSS. **스킨이 아니다** — 테마가 이 선언을 덮을 수 있어야
 * 하고, 그것을 `test/structure-css.test.ts`가 계산된 스타일로 지킨다.
 */
export function structureBaseCss(): string { … }
```

셀렉터 모양은 Step 1의 결과가 정한다.

- [ ] **Step 4: 테마가 이기는 것을 케이스로 고정한다**

`structureBaseCss()`가 낸 `display:flex`를 손으로 쓴 테마 CSS의 `display:grid`가 덮는지
계산된 스타일로 확인한다. **이 케이스가 이 계획 전체의 성공 판정이다.**

- [ ] **Step 5: 커밋**

```bash
git add packages/renderer/src/structure-css.ts packages/renderer/src/index.ts packages/renderer/test/structure-css.test.ts
git commit -m "feat(renderer): 구조 기본 CSS를 만들고 테마가 그것을 이기는 층을 잰다"
```

---

## Task 2: Flex·Grid의 inline 선언을 걷어낸다

**Files:**
- Modify: `packages/renderer/src/structures/structure.tsx`, `packages/renderer/src/structure-css.ts`
- Test: `packages/renderer/test/structures.test.tsx`, `packages/renderer/test/structure-css.test.ts`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

두 가지를 요구한다.

```tsx
it('Flex는 style에 커스텀 프로퍼티만 싣는다', () => {
  const html = renderToStaticMarkup(renderNode(flexNode({ direction: 'column', wrap: true })))
  const style = /style="([^"]*)"/.exec(html)?.[1] ?? ''
  expect(style).not.toBe('')                       // 값은 여전히 나간다
  for (const declaration of style.split(';').filter((s) => s.trim() !== '')) {
    expect(declaration.trim().startsWith('--')).toBe(true)
  }
})

it('Flex의 direction이 계산된 스타일까지 간다', () => {
  // 구조 기본 CSS + 렌더된 HTML을 jsdom에 넣고 flex-direction이 column인지 잰다
})
```

두 번째가 중요하다. **첫 번째만 있으면 값을 그냥 지워도 초록이 된다.**

- [ ] **Step 2: 실패를 확인한다**

```bash
pnpm vitest run packages/renderer/test/structures.test.tsx
```

기대: 첫 케이스가 `display:flex`에서 실패.

- [ ] **Step 3: 구현한다**

`FlexDefault`는 `--wb-flex-direction`·`--wb-flex-align`·`--wb-flex-justify`·`--wb-flex-wrap`만
낸다. `mapAlign`·`mapJustify`가 하던 이름 변환(`start` → `flex-start`)은 **어디로 갈지 정해야
한다** — 커스텀 프로퍼티에 변환된 값을 담을지, 원래 값을 담고 CSS가 알아서 할지. 후자는
CSS에 `start`가 그대로 들어가는데 `align-items: start`는 유효한 값이라 동작이 미묘하게
다르다(`flex-start`와 `start`는 flexbox에서 같지만 grid에서 다르다). **재서 정하고 주석에
근거를 남긴다.**

`GridDefault`는 이미 있는 `--wb-grid-columns`만 남기고 `display`·`gridTemplateColumns`를 지운다.
`structure-css.ts`가 `grid-template-columns: repeat(var(--wb-grid-columns, 1), 1fr)`을 소유한다.

- [ ] **Step 4: 통과를 확인한다**

- [ ] **Step 5: 커밋**

```bash
git add packages/renderer/src/structures/structure.tsx packages/renderer/src/structure-css.ts packages/renderer/test/
git commit -m "fix(renderer): Flex·Grid가 선언 대신 커스텀 프로퍼티만 내게 한다"
```

---

## Task 3: Tree·Media·Placeholder의 inline 선언을 걷어낸다

**Files:**
- Modify: `packages/renderer/src/structures/data.tsx`, `packages/renderer/src/structures/document.tsx`,
  `packages/renderer/src/structure-css.ts`
- Test: `packages/renderer/test/structures.test.tsx`

`Tree`가 다르다 — **inline style이 노드가 아니라 `part('node')`인 `<li>`마다 붙는다.**
`(index % depth) * 16px`이 들여쓰기인데, 커스텀 프로퍼티는 그 `<li>`에 실린다:
`--wb-tree-level: 2`. 기본 CSS는
`padding-left: calc(var(--wb-tree-level, 0) * var(--wb-tree-indent, 16px))`으로 읽는다.

~~**`--wb-tree-indent`가 테마의 손잡이가 된다** — 들여쓰기 폭을 테마가 정할 수 있다.~~

> **[구현 중 반증됨]** 오늘은 성립하지 않는다. 테마가 낼 수 있는 선언은 §6.8의 화이트리스트
> (`STYLE_PROPERTIES`)가 거르므로 **임의의 커스텀 프로퍼티를 내보내는 어휘가 아예 없다** —
> 이 이름에 값을 넣을 수 있는 것이 오늘 아무것도 없고 늘 기본값 `16px`이 쓰인다. 그래도
> 이름을 남긴 근거(폭이 본문에 박혀 있던 것보다 낫다)는 `structure-css.ts`의
> `TREE_INDENT_VAR` 주석에 있다. **어휘를 넓혀 이 손잡이를 여는 것은 §6.8을 건드리는
> 일이라 P4b가 판정한다.**

- [ ] **Step 1: 세 구조에 대해 Task 2와 같은 두 케이스를 쓴다** (커스텀 프로퍼티만 · 계산된 스타일까지 간다)
- [ ] **Step 2: 실패를 확인한다**
- [ ] **Step 3: 구현한다** — `--wb-tree-level`·`--wb-media-ratio`·`--wb-placeholder-height`
- [ ] **Step 4: 통과를 확인한다**
- [ ] **Step 5: 커밋**

```bash
git add packages/renderer/src/structures/data.tsx packages/renderer/src/structures/document.tsx packages/renderer/src/structure-css.ts packages/renderer/test/
git commit -m "fix(renderer): Tree·Media·Placeholder의 inline 선언을 커스텀 프로퍼티로 옮긴다"
```

---

## Task 4: 일반 선언이 남지 않는 것을 가드로 못박는다

Task 2·3은 다섯 구조를 손으로 고쳤다. **P4b가 구조를 늘릴 때 같은 실수가 반복되지 않게
하는 것이 이 태스크다.**

**Files:**
- Test: `packages/renderer/test/structures.test.tsx`

- [ ] **Step 1: 전수 가드를 쓴다**

`listStructureKeys()`가 든 **모든** 구조를 기본 props로 렌더하고, 나온 HTML의 모든 `style`
속성에 `--`로 시작하지 않는 선언이 없는지 본다.

```tsx
it('어떤 구조도 style에 일반 선언을 내지 않는다', () => {
  const offenders: string[] = []
  for (const key of listStructureKeys()) {
    // … 렌더하고 style 속성을 전부 모아 --로 시작하지 않는 선언을 offenders에 담는다
  }
  expect(offenders).toEqual([])
})
```

- [ ] **Step 2: 가드가 실제로 잡는지 실증한다**

`FlexDefault`에 `display: 'flex'` 한 줄을 **되살려** 이 케이스가 실패하는지 본다.
**실패하지 않으면 되돌리지 말고 그대로 보고한다** — 가드가 안 잡는다는 뜻이다.
확인한 뒤 되살린 줄을 지우고 `git status`로 작업 트리가 깨끗한지 확인한다.

- [ ] **Step 3: `fallback.tsx`를 어떻게 할지 정한다 (재라 #3)**

`FallbackNode`는 `containerStyle`·`messageStyle`로 일반 선언을 낸다. **이것은 문서 노드가
아니라 오류 표시**라 테마의 대상이 아니지만, 문서 안에 그려지고 `data-wb-id`를 단다.
걷어낼지, 가드의 명시적 예외로 둘지 **정하고 근거를 주석에 남긴다.** 예외로 둘 때는
그 이름을 목록에 적어 썩지 않게 한다.

- [ ] **Step 4: 커밋**

---

## Task 5: enum prop → `data-wb-variant` 채널

**Files:**
- Modify: `packages/schema/src/component/define.ts`, `packages/schema/src/component/catalog/document.ts`,
  `packages/schema/src/component/catalog/input.ts`, `packages/renderer/src/attrs.ts`,
  `packages/renderer/src/structures/document.tsx`, `packages/renderer/src/structures/input.tsx`
- Test: `packages/schema/test/component.test.ts`, `packages/renderer/test/attrs.test.ts`

**Interfaces:**
- Consumes: `ComponentDef`(Task 없음 — 기존)
- Produces: `ComponentDef.variantFrom?: string`

- [ ] **Step 1: `defineComponent`의 검사부터 테스트로 쓴다**

`variantFrom`이 가리키는 prop이 스키마에 없으면 던진다. 그 prop의 enum 값이 `variants`에
전부 선언돼 있지 않으면 던진다. 후자가 핵심이다 — **선언되지 않은 값이 `data-wb-variant`로
나가면 테마 검증기가 대조할 것이 없다.**

```ts
it('variantFrom이 가리키는 prop이 없으면 던진다', () => { … })
it('variantFrom의 enum 값이 variants에 없으면 던진다', () => { … })
```

zod enum에서 값 목록을 꺼내는 방법은 **재서 정한다** — `propKeys`가 이미 `shape`를 캐스팅으로
읽고 있으므로 같은 계열이지만, zod 4에서 enum의 옵션을 읽는 정확한 경로는 확인이 필요하다.
읽지 못하면 `variants`와 대조하는 검사를 포기하지 말고 **다른 방법으로 같은 것을 지킨다**
(예: `variantFrom` 선언 시 `variants`가 비어 있지 않을 것 + 런타임에 없는 값이면 속성을 안 냄).

- [ ] **Step 2: 실패를 확인한다**

- [ ] **Step 3: `define.ts`에 검사를 넣는다**

- [ ] **Step 4: `nodeAttrs`가 `variantFrom`을 소비하게 한다**

**충돌 규칙을 정해야 한다(재라 #4).** `variantFrom`이 있는 컴포넌트의 노드가 `node.variant`를
직접 들고 오면 어느 쪽이 이기는가. 셋 중 하나를 **재서** 고른다.

- (a) `variantFrom`이 이긴다 — prop이 단일 진실
- (b) `node.variant`가 이긴다 — 명시가 파생을 덮는다
- (c) 둘 다 있으면 검증 이슈

지금 `node.variant`가 `variants`에 있는지 검사하는 곳이 있는지 먼저 확인한다. 없으면
그 사실도 함께 보고한다.

- [ ] **Step 5: 카탈로그 셋을 고친다**

| 컴포넌트 | `variantFrom` | `variants` |
|---|---|---|
| `Text` | `role` | `display`·`h1`~`h6`·`body`·`caption` |
| `Field` | `control` | `text`·`number`·`select`·`date`·`dateRange`·`checkbox`·`radio`·`textarea`·`file` |
| `Divider` | `direction` | `horizontal`·`vertical` |

**`Field`의 값 목록은 카탈로그에서 직접 읽어 옮긴다.** 위 표는 설계 §5의 문장에서 옮긴
것이고 **재지 않았다** — `packages/schema/src/component/catalog/input.ts`의 실제 enum과
다르면 실제 것이 맞다.

- [ ] **Step 6: 세 구조 구현체에서 계약 밖 속성을 지운다**

`TextDefault`의 `data-wb-role`, `DividerDefault`의 `data-direction`,
`FieldOutlined`의 `data-control`.

`TextDefault`의 `ROLE_TAG`는 **그대로 둔다** — 태그를 바꾸는 것은 접근성과 문서 구조의
문제이지 스타일 채널이 아니다.

- [ ] **Step 7: 가드의 allowlist를 비운다**

`packages/renderer/test/structures.test.tsx`의 `DEFERRED_NON_CONTRACT_ATTRS`를 `[]`로
만들고, 그 위 주석의 세 줄 목록도 함께 지운다. **allowlist가 비었는데도 가드가 도는지**
확인한다(빈 배열이면 검사를 건너뛰는 구현이면 아무것도 안 지킨다).

- [ ] **Step 8: 통과를 확인하고 커밋**

```bash
git add packages/schema/src/component/ packages/renderer/src/ packages/schema/test/ packages/renderer/test/
git commit -m "feat(schema,renderer): enum prop을 data-wb-variant로 접어 계약을 여섯으로 되돌린다"
```

---

## Task 6: 여섯 속성 계약을 세는 가드

Task 5가 셋을 지웠다. **이 태스크는 일곱 번째가 다시 생기지 않게 한다.**

**Files:**
- Test: `packages/renderer/test/contract-attrs.test.ts` (새 파일)

- [ ] **Step 1: 계약 밖 속성이 0인 것을 세는 테스트를 쓴다**

**세는 파일이 세는 대상 안에 들어가면 안 된다.** 이 저장소가 P2b-4·P2b-5에서 같은 사고를
세 번 겪었다 — `rg` 개수를 적은 주석이 자기를 세거나, 범위를 좁혔더니 좁힌 파일의 주석이
세어졌다. 그래서 대상 glob은 `../src/**`이고 이 파일은 `test/`에 둔다.

`src`의 구조 구현체 원문을 읽어 `data-`로 시작하는 속성 리터럴을 모으고, 여섯과
`data-wb-error`(폴백 — Task 4 Step 3의 판정에 따른다) 밖의 것이 있으면 실패한다.
**주석은 걷어내고 센다**(`stripComments`) — 주석에 적힌 옛 이름이 세어지면 거짓 실패다.

- [ ] **Step 2: 가드가 잡는지 실증한다**

아무 구조에 `data-wb-foo="1"`을 심어 실패하는지 본다. **실패하지 않으면 그대로 보고한다.**
확인 후 되돌리고 `git status`로 깨끗한지 확인한다.

- [ ] **Step 3: 커밋**

---

## Task 7: 내장 시스템 테마 하나

**Files:**
- Create: `packages/themes/src/system/admin.ts`, `packages/themes/src/system/index.ts`
- Test: `packages/themes/test/system.test.ts`
- Modify: `packages/themes/src/index.ts`

**Interfaces:**
- Produces: `export function systemTheme(id: string): Theme | undefined`,
  `export const SYSTEM_THEME_IDS: readonly string[]`

- [ ] **Step 1: 테마가 검증을 통과하는지 보는 테스트부터 쓴다**

```ts
it('내장 테마는 이슈 없이 해석된다', () => {
  for (const id of SYSTEM_THEME_IDS) {
    const { theme, issues } = resolveTheme(systemTheme(id)!)
    expect(issues).toEqual([])          // 실패하면 어떤 이슈인지 메시지가 보이게 둔다
    expect(theme).not.toBeNull()
  }
})

it('내장 테마가 고른 구조는 렌더러가 전부 구현하고 있다', () => { … })
```

두 번째가 D7을 지킨다. `listStructureKeys()`와 대조한다. **`packages/themes`가 `renderer`를
import하면 안 되므로**(§3.3) 이 케이스는 `packages/renderer/test/` 또는 `apps/web/test/`에
둔다 — 어디가 맞는지 정하고 근거를 남긴다.

- [ ] **Step 2: 실패를 확인한다**

- [ ] **Step 3: 테마를 쓴다**

최소본이되 **외형이 실제로 바뀌는 것이 보여야 한다.** 담을 것:

- `meta` — ~~`id: 'system:admin'`~~ → **`id: 'admin'`**, `extends` 없음

  > **[구현 중 반증됨]** `THEME_ID_PATTERN`이 `[A-Za-z0-9_-]`라 **콜론을 받지 않는다.**
  > `system:`은 가리키는 쪽의 문법이고(`EXTENDS_PATTERN`) 테마 자신의 이름이 아니다.
  > `test/fixtures/minimal.ts`가 이미 그 꼴이다(`id: 'portal'` ← `extends: 'system:portal'`).
  > `systemTheme`이 두 꼴을 다 받아 자르기가 부르는 쪽마다 흩어지지 않게 했다.
- `tokens` — palette 몇 개, semantic(`primary`·`surface`·`border`·`text`), `space.unit` + 스케일,
  `radius`, `shadow`, `typography`
- `primitives` — `container`·`grid`·`section`·`breakpoints`
- `components` — 오늘 구현체가 있는 것들. `List`(table)·`Card`(plain)·`Button`(solid)·
  `Field`(outlined)·`Text`(default)·`Section`(contained)·`Flex`·`Grid`는 최소한 넣는다.
  `Text`는 Task 5가 만든 `variants`로 타이포 스케일을 건다 — **그것이 D4가 실제로 쓸모
  있는지 보이는 자리다.**

**`resolveTheme`이 내는 이슈를 하나씩 읽고 고친다.** 규격을 넓히지 말고 테마를 고친다.
규격이 막는 것이 설계 §6의 예시와 어긋나면 **그 사실을 보고한다**(P4a-1이 네 번 겪었다).

- [ ] **Step 4: 통과를 확인하고 커밋**

---

## Task 8: 캔버스에 CSS를 주입한다

**Files:**
- Create: `apps/web/src/theme/theme-source.ts`, `apps/web/src/theme/use-theme-css.ts`
- Modify: `apps/web/src/canvas/canvas.tsx`, `apps/web/package.json`
- Test: `apps/web/test/theme/use-theme-css.test.tsx`

**Interfaces:**
- Consumes: `systemTheme`(Task 7), `resolveTheme`·`compileTheme`(P4a-1), `structureBaseCss`(Task 1)
- Produces: ~~`export function useThemeCss(): void`~~ → **`export function useThemeCss(source?): ResolvedTheme | null`**

  > **[구현 중 바뀜]** `void`로 두면 캔버스가 Task 9의 `themeStructures`에 넘길
  > `ResolvedTheme`을 얻으려 **해석을 한 번 더** 해야 하고, 그러면 두 결과가 갈릴 수 있는
  > 자리가 생긴다(테마 소스가 저장소가 되는 P4a-3에서 실재한다).

- [ ] **Step 1: 주입을 보는 테스트부터 쓴다**

```tsx
it('구조 기본 CSS와 테마 CSS가 순서대로 head에 실린다', () => { … })
it('두 번 그려도 style 태그가 늘지 않는다', () => { … })
it('테마 해석이 실패해도 화면이 사라지지 않는다', () => { … })
```

세 번째가 이 프로젝트가 반복해 겪은 **빈 화면 부류**다. `resolveTheme`이 `null`을 내면
테마 CSS를 넣지 않고 구조 기본 CSS만 남긴다 — 던지지 않는다.

- [ ] **Step 2: 실패를 확인한다**

- [ ] **Step 3: 구현한다**

`apps/web/package.json`에 `"@wirebound/themes": "workspace:*"`를 더한다.
**루트 vitest 설정에 alias가 이미 있다** — 더하지 않아도 테스트는 돈다. 그래도 의존을 적는
것은 `vite build`가 그것을 본다.

컴파일은 **테마가 바뀔 때만** 한다. 매 렌더마다 문자열을 다시 만들면 `<style>`의
`textContent`가 매번 갈린다.

- [ ] **Step 4: 통과를 확인하고 커밋**

```bash
git add apps/web/src/theme/ apps/web/src/canvas/canvas.tsx apps/web/package.json apps/web/test/
git commit -m "feat(web): 구조 기본 CSS와 컴파일된 테마 CSS를 캔버스에 주입한다"
```

---

## Task 9: 테마가 고른 구조를 렌더러에 넘긴다

§6.0의 약속 — *"같은 페이지 스키마가 테마에 따라 데이터 테이블로도, 카드 그리드로도"* —
의 배선이다. **오늘은 컴포넌트마다 구현체가 하나씩뿐이라 갈아 끼울 것이 없다**(P4b가
채운다). 그래도 배선을 지금 하는 것은, 없으면 P4b가 테마를 만들어도 렌더러가 못 보기
때문이다.

**Files:**
- Create: `apps/web/src/theme/theme-structures.ts`
- Modify: `apps/web/src/canvas/canvas.tsx`
- Test: `apps/web/test/theme/theme-structures.test.ts`

**Interfaces:**
- Produces: `export function themeStructures(theme: ResolvedTheme | null): Record<string, string>`

- [ ] **Step 1: 테스트를 쓴다**

`components[type].structure`가 `RenderOptions.structures`로 간다. 테마가 없으면 빈 객체이고
렌더러가 카탈로그의 첫 구조를 쓴다(`resolveStructureOf`).

**렌더러가 없는 구조에 폴백을 그리는 것을 확인한다** — 테마가 `List: { structure: 'cardGrid' }`를
고르면 오늘은 구현이 없어 `구현되지 않은 구조: List:cardGrid` 폴백이 뜬다. 그 문장이
사용자에게 보이는 것이 맞는지 판정하고 근거를 남긴다.

- [ ] **Step 2: 실패를 확인한다**
- [ ] **Step 3: 구현한다**
- [ ] **Step 4: 통과를 확인하고 커밋**

---

## Task 10: 테마를 바꾸면 외형이 바뀌는 것을 실증한다

**이 태스크가 이 계획의 판정이다.** 앞의 아홉이 전부 초록이어도 여기가 실패하면 P0 이월
#7은 닫히지 않은 것이다.

**Files:**
- Test: `apps/web/test/theme/cascade.test.tsx`

- [ ] **Step 1: 실증 테스트를 쓴다**

같은 페이지 문서를 **테마 둘**로 그려 계산된 스타일이 갈리는지 본다. 두 번째 테마는
테스트가 손으로 만든다(내장 테마를 둘 만들지 않는다 — D7).

재는 것 최소 넷:

| 무엇 | 왜 |
|---|---|
| `Flex`의 `flex-direction`을 테마가 덮는다 | inline 선언이 이기던 자리(P0 #7의 본체) |
| ~~`Grid`의 `grid-template-columns`를 테마가 덮는다~~ → **`Grid`의 `display`를 테마가 덮는다** | 옳은 절반과 틀린 절반이 함께 있던 자리. **[반증됨]** §6.8의 화이트리스트에 트랙 목록을 적을 어휘가 **없다**(`display`·`gap`은 있고 `gridTemplateColumns` 계열은 없다). 테마가 덮을 수 있는 것은 `display`이고 그것이 P0 이월 #7이 막고 있던 자리다 |
| `Card`의 `background`가 테마마다 다르다 | 평범한 스킨 경로 |
| `Text[data-wb-variant="h1"]`의 `font-size`가 테마마다 다르다 | D4가 만든 채널이 실제로 쓰인다 |

- [ ] **Step 2: `!important`가 없는 것을 확인한다**

컴파일된 CSS와 구조 기본 CSS 어디에도 `!important`가 없는지 센다(D8).

- [ ] **Step 3: 통과를 확인하고 커밋**

- [ ] **Step 4: 전체 회귀**

```bash
pnpm test
pnpm typecheck
pnpm build
```

---

## 재라 — 이 계획이 정하지 않고 넘기는 것

**정답을 적지 않았다. 재고 나서 정하고, 근거를 코드 주석에 남긴다.**
P4a-1에서 이 표에 있던 자리는 **매번 걸렸고**, 확정해 적은 산문은 구현 중에 반증됐다.

| # | 무엇 | 어떻게 재는가 |
|---|---|---|
| 1 | `@layer`인가 순서인가 | **잰 결과: 순서.** jsdom 25는 `@layer`가 든 **시트를 통째로 버린다**(밖의 규칙도 함께 죽고 `sheet`가 `null`). 층으로 가면 CSS가 먹히는지조차 잴 수 없다 |
| 2 | 커스텀 프로퍼티의 기본값 자리 | `var(--x, 기본)`로 CSS가 갖는가, 렌더러가 항상 방출하는가. 노드가 값을 안 줄 때 무엇이 그려지는지로 가른다 |
| 3 | 폴백 노드의 inline style | 걷어내는가, 가드의 이름 있는 예외로 두는가 (Task 4) |
| 4 | `variantFrom`과 `node.variant`가 함께 올 때 | 어느 쪽이 이기는가. 지금 `node.variant`를 `variants`와 대조하는 곳이 있는지 먼저 본다 (Task 5) |
| 5 | 커스텀 프로퍼티 이름 충돌 | `--wb-flex-direction` 같은 이름이 `cssVarName`이 만드는 토큰 변수 이름과 겹칠 수 있는가. 겹치면 접두어를 가른다 |
| 6 | `bgGradient` + `bgImage` | 한 스타일 맵에 둘 다 있으면 `background-image` 선언이 둘 나간다. **어느 쪽이 이기는지 재고**, 이슈로 낼지 그대로 둘지 판정한다 |
| 7 | `@media`가 `states`를 덮는다 | `pushResponsive`가 맨 뒤라 `responsive.base`가 앞의 `states`를 덮는다. **실제로 덮는지 재고**, 순서를 바꿀지 판정한다. §6.5가 이 상호작용을 말하지 않는다 |
| 8 | **`@media`가 캔버스 폭이 아니라 창 폭을 본다** — **잰 결과: 정말 창 폭을 본다** (아래 §측정 결과) | 캔버스는 `transform: scale`과 폭 지정으로 그리므로 **뷰포트 프리셋을 바꿔도 `@media`는 브라우저 창을 본다.** §6.4는 *"뷰포트 프리셋을 바꾸면 테마가 정의한 브레이크포인트 스타일이 적용되어 확인만 가능하다"*고 적었다. **재서 어긋나는지 확인하고 보고한다 — 여기서 고치지 마라**(컨테이너 쿼리로 바꾸는 것은 §6.11의 컴파일 계약과 P5 내보내기를 함께 건드린다) |
| 9 | 위험 문자를 실제 브라우저에서 재지 않았다 | P4a-1이 `<`·`>`를 jsdom으로만 쟀다. 캔버스에 실제로 주입되는 지금 무엇이 관측되는지 |
| 10 | `assets.fonts` | 지금 아무 데도 안 쓰인다. 주입 시점에 `@font-face`를 낼 것인가 — **P8이 URL을 다시 쓰므로 지금 만들면 되돌려야 한다**는 것이 P4a-1의 판단이었다. 그 판단이 여전히 서는지 |
| 11 | `url()`의 대상 | 외부 호스트·`data:` URI가 그대로 나간다. 캔버스에서 실제로 로드되는지, CSP가 무엇을 막는지 |
| 12 | 이슈 폭포 | 토큰 하나가 깨지면 그것을 가리키는 스타일마다 이슈가 따라 나온다. 주입이 실패했을 때 사용자가 무엇을 보는가 |

---

## 계획이 재지 않은 것

**여기 적힌 것은 재지 않았다. 구현 중에 어긋나면 이 문장이 틀린 것이다.**

| # | 무엇 |
|---|---|
| 1 | **`Media.kind`와 `Media.structures`가 같은 이름 넷이다**(`image`·`video`·`illustration`·`chart`). 하나는 노드 prop이고 하나는 **테마가 고른다.** 노드가 `kind: 'video'`인데 테마가 `image`를 고르면 어느 쪽이 그려져야 하는지 설계가 답하지 않는다 |
| 2 | 구조 기본 CSS가 `data-wb-structure`로 갈리면 P4b가 구조를 늘릴 때마다 이 파일이 함께 큰다. 지금 19개가 몇 줄이 되는지 재지 않았다 |
| 3 | 주입 **전** 첫 프레임에 무엇이 보이는가. `useEffect`로 넣으면 한 프레임은 CSS 없이 그려진다 |
| 4 | 셸 CSS와 테마 CSS가 같은 `:root`를 쓴다. `--wb-shell-*`와 `--wb-*`가 접두어로 갈리지만 **`:root` 블록 자체가 둘이 되는 것**은 재지 않았다 |
| 5 | `compileTheme`이 매번 같은 문자열을 낸다는 것(P4a-1의 결정성)이 **주입에서 실제로 재사용을 만드는지** 재지 않았다 |
| 6 | `Text`의 `variants`가 아홉이 되면 `Text` 테마 절이 아홉 벌 나간다. CSS 크기를 재지 않았다 |
| 7 | 카탈로그의 `variants`가 오늘 대부분 `[]`다. `Button`·`Link`·`List`·`Section`·`Card`만 갖고 있고, 그것들이 **노드의 `variant`로 실제로 도달 가능한지**(속성 패널에 있는지) 재지 않았다 — P0 이월 #9와 같은 부류일 수 있다 |

---

## 실제 브라우저 측정 결과 (P4a-2 구현 중)

**jsdom이 못 재는 것 둘**(`var()` 치환, `@media`)을 확인하려고 Chromium에서 한 번 쟀다.
컴파일된 `admin` 테마 + 구조 기본 CSS + 렌더된 문서를 정적 페이지로 만들어 계산된 스타일을 읽었다.
**테스트가 아니라 일회성 측정이다** — 자동 회귀에 들어가지 않는다.

| 무엇 | 관측값 |
|---|---|
| `var()` 치환이 끝까지 가는가 | **간다.** `flex-direction: column`·`align-items: start`·`justify-content: space-between`·`display: flex` |
| `Grid`의 트랙 | `133.328px × 3` — `repeat(var(--wb-node-grid-columns), 1fr)`이 열 3개로 풀렸다 |
| `Text[variant=h1]`의 `font-size` | **24px** — 토큰 → `:root` 변수 → `var()`가 끝까지 이어졌다 |
| `Tree`의 들여쓰기 | **0px · 16px · 32px** — `calc(var(단계) * var(폭))`이 실제로 계산됐다 |
| `Placeholder`의 높이 | **240px** |
| `align-items: start`가 유효한가 | **유효하다** (계산값 `start`). `flex-start`로 바꾸지 않은 결정이 선다 |
| **재라 #7** — `@media` vs `states` | **`@media`가 이긴다** (상태 0.5 · 반응형 0.9 → 계산값 **0.9**) |
| **재라 #8** — `@media`가 무엇을 보는가 | **창 폭을 본다.** 캔버스 프레임이 `width:400px`+`scale(0.5)`인데 창이 1200px일 때 `(max-width:768px)`가 **안 맞았고**, 창만 700px로 줄이니 프레임 폭은 그대로 400px인데 **맞았다.** §6.4의 *"뷰포트 프리셋을 바꾸면 … 브레이크포인트 스타일이 적용되어 확인만 가능하다"*는 **성립하지 않는다.** `@container`도 함께 재봤는데 `container-type`을 선언한 조상이 없어 아무것도 맞지 않았다 — 컨테이너 쿼리로 가려면 컴파일 계약을 건드려야 한다는 뜻이고, 그래서 **여기서 고치지 않았다** |
| **재라 #9** — 위험 문자 | **실제 브라우저에서도 샌다.** CSS 값에 `</style>`을 넣으니 `<span id="leaked">`가 **DOM에 실제로 생겼다.** P4a-1이 jsdom으로만 쟀던 것이 Chromium에서 확증됐다. **살아남는 규칙 수는 적지 않는다** — 끊긴 지점 **앞**의 규칙은 살아남고 뒤가 본문으로 새므로 **페이로드가 시트의 어디에 있느냐에 달려 있다**(내 측정은 0, 리뷰의 재측정은 1이었다). 재현되는 것은 규칙 수가 아니라 **누수 자체**다 |
| **재라 #11** — `url()`의 대상 | 외부 호스트가 그대로 나가고 **브라우저가 실제로 요청을 보낸다**(`ERR_NAME_NOT_RESOLVED` — 막힌 것이 아니라 나갔다가 실패). `data:` URI도 적용된다. **CSP가 막는 것은 없다 — 이 앱에 CSP가 없다** |
| **D6** — 삽입 위치가 범위를 만드는가 | **만들지 않는다.** 캔버스 안쪽 `<style>`이 캔버스 **밖** 요소에 그대로 걸렸다(jsdom·Chromium 둘 다) |
