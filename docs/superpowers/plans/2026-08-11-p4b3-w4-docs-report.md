# P4b-3 ② W4 보고 — 시스템 테마 `docs`

브랜치 `feat/p4b3-docs`, 커밋 `b9937c3`(기준 `462bd99`).
**`pnpm vitest run --project unit --project web`: 1736 tests / 98 files → 1740 / 99.**
`pnpm typecheck` 통과. 작업 트리 clean.

**이 문서의 값은 셋 중 하나로 읽힌다** — *내가 쟀다* / *남이 쟀다(귀속을 붙였다)* /
*재지 못했다*. 귀속 없는 값은 없다.

> **api 프로젝트를 안 돌렸다.** 브리프의 지시다(넷이 Postgres 하나를 공유한다).
> 전체 회귀는 ③의 몫이다. 아래 §7에 다시 적었다.

---

## 1. 고른 구조 전부 — 18개 선언, 그중 **8개가 `admin`이 안 고르는 것**

**내가 쟀다** — `resolveTheme('docs')`와 `resolveTheme('admin')`의 `components`를 나란히 놓고 셌다.

| 컴포넌트 | `docs` | `admin` | |
|---|---|---|---|
| `Page` | `default` | **미선언** | ★ `admin`은 `Page`를 선언하지 않는다 |
| `Section` | `contained` | `contained` | 같다 |
| `Flex` | `default` | `default` | 단일 구조 |
| `Grid` | `default` | `default` | 단일 구조 |
| **`Card`** | **`horizontal`** | `plain` | ★ 주의 상자 |
| **`Tabs`** | **`enclosed`** | `underline` | ★ 코드 예제의 언어 전환 |
| `SearchForm` | `inline` | `inline` | 같다 |
| **`EntryForm`** | **`labelTop`** | `labelLeft` | ★ |
| **`List`** | **`stackedList`** | `table` | ★ 문서 목록·색인 |
| **`Tree`** | **`accordion`** | `indent` | ★ 좌측 내비 |
| **`KeyValue`** | **`definitionList`** | `table` | ★ API 레퍼런스 |
| **`Field`** | **`underlined`** | `outlined` | ★ |
| **`Button`** | **`text`** | `solid` | ★ |
| `Link` | `default` | `default` | 단일 구조 |
| `Text` | `default` | `default` | 단일 구조 |
| `Media` | `image` | `image` | 같다 |
| `Divider` | `default` | `default` | 단일 구조 |
| `Placeholder` | `default` | `default` | 단일 구조 — **쓰임이 다르다**(§5) |

**컴포넌트 수 18 / `admin` 17.** `Slot`은 둘 다 선언하지 않는다.

### 계획서 참고 표에서 **벗어난 자리 하나** — `Tabs:vertical`을 안 골랐다

참고 표가 `docs`에 `Tabs:vertical`을 적었다(*"지시가 아니다"*라고 브리프가 명시했다).
**안 골랐고 근거는 이렇다:** 세로 탭은 좌측 레일이고 이 테마에는 이미 `Tree:accordion`이
그 자리에 있다. 한 화면에 세로 목록 둘이 나란히 서는 것은 문서 사이트의 모양이 아니다.
문서 사이트에서 탭이 실제로 쓰이는 자리는 **코드 예제의 언어 전환**(npm/pnpm/yarn)이고,
그것은 코드 상자 위에 붙은 가로 탭 — `enclosed`다.

**D3이 요구한 정직함이 이쪽이라고 판단했다.** 아무도 `vertical`을 안 고르면 그것이 §16의
입력이지 메워야 할 구멍이 아니다.

---

## 2. `admin`과 어디서 갈리는가 — **네 층 다, 그러나 무게는 토큰과 골격에 있다**

| 층 | 무엇이 갈리는가 | 잰 값 (내가 쟀다) |
|---|---|---|
| **토큰** | 서체 셋(세리프 본문 · 산세리프 UI · 모노 코드) · 본문 17px/1.75 대 14px/1.6 · 잉크/종이 팔레트 | `@font-face` **8블록** 대 **0블록**. 컴파일된 CSS **24,258자 / 98블록** 대 **15,133자 / 71블록** |
| **골격** | `container.maxWidth` **720px** 대 1440px · 섹션 여백은 반대로 넓다(`space.10` 대 `space.8`) | `:root`의 `--wb-container-maxWidth: 720px` |
| **구조** | 위 표의 여덟 | — |
| **스킨** | 면이 아니라 **선**으로 밀도를 만든다 — `borderWidth` 다중값(`'0 0 1px'`)을 여덟 자리에서 쓴다 | `Field` control의 계산된 테두리 폭 **0 / 0 / 1px / 0** |

**인상을 만든 것은 토큰과 골격이다.** 구조 여덟 중 넷(`Tabs`·`EntryForm`·`Field`·`Button`)은
DOM이 `admin`이 고른 것과 **글자까지 같아서**(§4) 화면을 바꾼 것이 스킨뿐이고, 그 스킨도
결국 토큰(서체·간격·색)을 가리킨다. 실제로 형태가 달라진 것은 `Card:horizontal` ·
`List:stackedList` · `Tree:accordion` · `KeyValue:definitionList` **넷**이다.

**`!important` 0건**(내가 쟀다).

---

## 3. D6의 벽 셋 — 셋 다 만났다

### 벽 #1 — 구조 선택이 컴포넌트 타입 단위다. **못 한 것 셋을 구체적으로 적는다**

1. **표를 못 그린다.** `List: stackedList`를 고른 순간 그 문서의 **모든** `List`가 줄 목록이다.
   문서 사이트에는 문서 목록(줄)과 **API 옵션 표**가 함께 나오는데 둘을 한 문서에 못 둔다.
   `KeyValue:definitionList`가 *"이름과 설명"* 두 열까지는 대신하지만, *"이름 / 타입 /
   기본값 / 설명"* 네 열은 표현할 자리가 없다.
2. **일반 카드를 못 쓴다.** `Card: horizontal`(주의 상자)을 고르면 *"다음에 읽을 문서"*
   카드 격자가 전부 가로 카드가 된다. 주의 상자와 링크 카드는 문서 사이트에 **둘 다** 있다.
3. **자리표시자를 잃는다** — 아래 §5의 `Placeholder` 항목. 이것은 벽 #1보다 **한 칸 더 나쁘다**:
   `Placeholder`는 `structures`가 하나이고 `variants`도 **비어 있어** 채널이 아예 없다.
   벽 #1은 적어도 변형 채널을 남긴다.

### 벽 #2 — `parts` 규칙이 자손 결합자다. **실측했고 케이스로 못박았다**

`Card:horizontal`(주의 상자) 안에 `List:stackedList`를, `EntryForm:labelTop` 안에
`Field:underlined`를 넣어 그렸다. **문서 사이트의 정상 구성이다.**

겹치는 조각 이름: `Card`/`List`가 `title`·`body`·`media`·`header`, `EntryForm`/`Field`가
`label`. 실제로 DOM에 나온 것은 **`title` 3개**(Card 1 + List 2)와 **`label` 2개**(EntryForm 1 + Field 1)다.

**잰 값(내가 쟀다).** jsdom은 `var()`를 치환하지 않으므로 *"어느 규칙이 이겼는가"*를
계산값에 남은 **변수 이름**으로 읽었다.

| 판 | `List`의 `title` color | `Field`의 `label` | 이슈 |
|---|---|---|---|
| **오늘(안쪽도 선언)** | `var(--wb-semantic-primary)` — 목록 자신의 것 | `h6` + `uppercase` — 필드 자신의 것 | 0 |
| `List.parts.title`을 지우면 | **`var(--wb-semantic-text)`** — **카드의 것을 받는다** | — | **0** |
| `Field.parts.label`을 지우면 | — | **`h4`, `text-transform` 없음** — **폼 제목의 것을 받는다** | **0** |
| 선언은 두고 **`Card`와 `List`의 순서만 뒤집으면** | **`var(--wb-semantic-text)`** — 카드의 것 | — | **0** |

**원인:** `compileTheme`의 조각 규칙이 `[data-wb-component="X"] [data-wb-part="p"]`
(자손 결합자, 특이도 0,2,0)이고 컴포넌트 경계를 안 본다. 두 규칙의 특이도가 **같으므로
순서가 정한다** — 즉 이 테마의 방어는 **선언 하나와 그 선언의 자리**뿐이고, 둘 중 무엇이
사라져도 이슈가 0건이라 화면에서만 드러난다.

> 순서 변이는 파일이 아니라 **컴파일 입력**에서 심었다(테마 객체를 복제해 `components`의
> 키 순서만 뒤집었다). `admin`에서 같은 부류가 3자리 닿는다는 것은 P4b-2 ③이 152조합으로
> 쟀다 — **그쪽이 쟀고 나는 다시 재지 않았다.**

**케이스를 더했다** — `apps/web/test/theme/docs-theme.test.tsx`(4건). 위 표의 첫 줄을
못박는다. 구분력은 §6에 있다.

### 벽 #3 — 손잡이 여덟. **이름은 다섯을 쓰고, 손잡이를 덮는 자리는 0이다**

**문서를 훑어 셌다(내가 쟀다).** 여덟 이름(`direction`·`align`·`justify`·`wrap`·
`gridColumns`·`aspectRatio`·`height`·`paddingX`)이 `docs`의 `components`에 **20번** 나온다.

| 이름 | 손잡이 자리 (P4b-2 이월 5번 — *그쪽이 쟀다*) | `docs`가 쓰는 자리 | 덮는가 |
|---|---|---|---|
| `direction`·`align` | `Flex:default` | `Card.base`·`Card.responsive.sm`·`SearchForm.base`·`EntryForm.base`·`EntryForm.parts.row`·`Field.base` (6) | **아니다** — `Flex`에는 안 쓴다 |
| `justify`·`wrap` | `Flex:default` | 0 | — |
| `gridColumns` | `Grid:default` · `KeyValue:cardGrid` | 0 | — |
| `aspectRatio` | `Media [frame]` | `Card.parts.media` (1) | **아니다** — `Card [media]`는 손잡이가 아니라 구조의 상수(`16 / 9`)다 |
| `height` | `Placeholder:default` | `Divider.variants.horizontal` (1) | **아니다** |
| `paddingX` | `Tree [node]` (`:where(indent)`) | `Tree.parts.node` 포함 11곳 | **오늘은 아니다 — 아래를 보라** |

**`Tree.parts.node.paddingX`가 아슬아슬하고, 그것을 실측했다.**

같은 테마 CSS로 `Tree`를 두 구조로 그려 계산된 `padding-left`를 읽었다(내가 쟀다):

| 판 | `padding-left` | 노드가 실은 인라인 변수 |
|---|---|---|
| 테마 있음 / **accordion**(내 선택) | `var(--wb-space-2)` | 없음 — 아코디언은 단계를 안 싣는다 |
| 테마 있음 / **indent** | **`var(--wb-space-2)`** — 구조의 `calc(…)`가 사라졌다 | `--wb-node-tree-level: 0` · `1` |
| 테마 없음 / accordion | (빈 값) | 없음 |
| 테마 없음 / indent | `calc(var(--wb-node-tree-level, 0) * var(--wb-tree-indent, 16px))` | 같음 |

**즉 이 한 줄은 손잡이를 덮을 수 있고, 오늘 안 덮는 유일한 이유는 내가 `accordion`을
골랐기 때문이다.** 구조 기본 CSS의 `Tree [node]` 규칙이 `:where([data-wb-structure="indent"])`로
좁혀져 있어(P4b-2 ③이 좁혔다 — *그쪽이 쟀다*) 아코디언 마디에는 아예 안 맞는다.
**이 테마를 상속한 파생 테마가 `Tree`를 `indent`로 바꾸는 날, 들여쓰기가 말없이 사라진다.**

> 두 규칙은 **둘 다 (0,2,0)**이다(`:where()`는 0으로 센다). 그래서 실제 브라우저에서도
> 순서가 정하고, jsdom이 특이도를 안 보는 것(P4b-2가 쟀다)에 이 결론이 걸리지 않는다.

**`treeIndent` 어휘는 안 썼다** — 아코디언은 깊이를 DOM 중첩으로 내므로 그 이름을 읽는
규칙이 없다.

**덮지 않으려고 일부러 비운 자리 둘.** `Media.parts.frame`에 `aspectRatio`를 안 주고
`Placeholder.base`에 `height`를 안 준다. 확인했다(내가 쟀다) — `Media` 틀의 계산값이
`var(--wb-node-media-ratio, 16/9)`이고 노드가 `4/3`을 싣고 있으며, `Placeholder`의 계산값이
`var(--wb-node-placeholder-height, 120px)`이고 노드가 `260px`을 싣고 있다. **컴파일된
`Placeholder` 블록에 `height` 선언이 0건**이다.

---

## 4. D4 — DOM이 같은 다섯 묶음. **렌더해서 잰 값**

내가 고른 것 중 넷이 그 묶음 안에 있다: `Tabs:enclosed` · `EntryForm:labelTop` ·
`Field:underlined` · `Button:text`. (`Card:horizontal`은 그 묶음이 아니다 — `plain`·`bordered`·
`elevated` 셋과 달리 `media`·`content` 조각이 있어 DOM이 실제로 다르다.)

### 4-1. 스킨이 실제로 갈린다 — 계산값 (내가 쟀다)

- `Field` control의 테두리 폭 **top 0px / right 0px / bottom 1px / left 0px** — 밑줄이 섰다.
- `Button` 루트의 `background-color` **`rgba(0, 0, 0, 0)`**, `border-top-width` **0px** —
  `<button>`의 브라우저 기본 채움과 테두리가 걷혔다.

### 4-2. **그런데 구조 이름이 하는 일은 한 테마 안에서 0이다** — 이것이 이 절의 발견이다

각 컴포넌트의 `structure` 값 하나만 형제로 바꾸고 다시 컴파일해 **줄 단위로 비교했다**
(내가 쟀다).

| 바꾼 것 | 컴파일된 CSS에서 달라진 줄 |
|---|---|
| `Field` `underlined` → `filled` | **1** — `[data-wb-component="Field"][data-wb-structure="underlined"] {` → `…"filled"] {` |
| `Tabs` `enclosed` → `underline` | **1** — 같은 꼴 |
| `EntryForm` `labelTop` → `labelLeft` | **1** — 같은 꼴 |
| `Button` `text` → `solid` | **1** — 같은 꼴 |

그리고 같은 노드를 두 구조로 그려 DOM을 대조했다: **넷 다 `data-wb-structure` 값 말고는
문자열이 같다.**

**그러므로:** 이 다섯 묶음에서 `structure`를 고르는 것은 **`base` 규칙 셀렉터의 속성값 하나를
정하는 일**이고, 테마는 컴포넌트당 구조를 **하나만** 고르므로 그 셀렉터는 그 문서의 모든
해당 컴포넌트에 걸린다. **즉 `filled`라고 적었어도 화면이 똑같다.**

> **P4b-2 이월 3번의 *"갈리는 모습은 전부 `base` 스킨으로 만들어야 한다"*는 맞지만 절반이다.**
> 그 스킨은 구조 이름과 **무관하게** 걸린다. 갈리는 것은 **테마 사이**이지 구조 사이가 아니다.
> 구조 채널이 값을 갖는 곳은 **조각 규칙**인데, `compileTheme`의 조각 규칙에는 구조가 안
> 붙는다(`emit/index.ts`의 `pushComponent`) — 즉 오늘 테마는 **조각 스킨을 구조별로 가를 수
> 없다.** 이 셋이 합쳐져 다섯 묶음의 구조 채널을 무용지물로 만든다. **§16의 입력이다.**

---

## 5. 못 한 것 — §16이 받을 입력

### 5-1. `Code` 컴포넌트가 없다 — **`Placeholder`로 대신했다** (재라 #7)

카탈로그 19개 중 코드 블록에 해당하는 것이 없다. 후보 셋 중 골랐다:

| 후보 | 판정 |
|---|---|
| `Text`의 `body`·`caption` 역할에 모노를 건다 | **역할 채널을 도둑질한다.** `variantFrom: 'role'`이라 변형 아홉이 전부 문서 개요(`<h1>`~`<p>`)에 묶여 있다 — 코드에 `caption`을 쓰면 그 문서의 모든 캡션이 코드가 된다 |
| `Media:chart`·`illustration` | 틀이 **비율**을 갖는 상자다. 코드는 줄 수만큼 길어지므로 비율이 뜻을 갖지 않는다 |
| **`Placeholder`** ← 골랐다 | 자유 문자열(`label`)과 높이(`height`)를 **노드가** 갖는 유일한 컴포넌트다. 와이어프레임에서 코드 블록은 *"모노 글자가 든 상자"*이고 그것이 이 컴포넌트의 모양 그대로다 |

**대가:** `Placeholder`는 `structures` 하나 · `variants` 0 — **채널이 아예 없다.** 코드
블록으로 스킨하는 순간 *"미정 영역"*이라는 원래 쓰임을 표현할 방법이 사라진다.

**필요한 것을 이름으로 적는다:** `Code` 컴포넌트, 또는 `Placeholder`에 `variants`
(`code` · `blank`) 하나.

### 5-2. **인라인 코드가 없다**

문서에서 코드는 블록만이 아니라 문장 속에도 있다(`` `useState` ``). `Text`의 역할 아홉에
`code`가 없고 `variantFrom: 'role'`이라 카탈로그를 안 고치면 변형을 더할 수도 없다.
**이 테마는 인라인 코드를 표현하지 못한다.**

### 5-3. 주의 상자의 **종류가 둘뿐**

`Card.variants`가 `default`·`featured`다. 문서 사이트의 관례는 NOTE / TIP / WARNING /
DANGER 넷이고, 오늘 표현되는 것은 둘이다.

### 5-4. `listStyle`이 §6.8에 없다 — **우회했고 대가가 있다**

`List:stackedList`가 `<ul>/<li>`를 그리는데 불릿을 끌 어휘가 없다(`STYLE_PROPERTIES`에
`list`로 시작하는 이름 **0건** — 내가 쟀다). **`item`에 `display: 'block'`을 주면 사라진다** —
마커는 요소가 `display: list-item`일 때만 생기기 때문이다. 실측(내가 쟀다): 선언이 있으면
`block`, 빼면 `list-item`.

**대가:** `<li>`의 뜻은 남지만 그것이 목록 항목으로 **그려지지 않는다.** 어휘를 우회한
것이지 어휘가 그것을 표현한 것이 아니다.

### 5-5. **한 변만 겨냥하는 테두리 어휘가 없다** — 우회했다

§6.8의 테두리 어휘는 `borderColor`·`borderWidth`·`borderStyle`·`radius` 넷이고 전부 네 변을
한 번에 다룬다. **밑줄 하나가 `Field:underlined`의 전부인데** 그것을 적을 이름이 없다.

**되긴 된다** — `border-width`가 CSS 단축이라 `'0 0 1px'` 같은 **다중값 리터럴이 그대로
통과한다**(값 규칙은 함수와 탈출 문자만 본다). 이 테마는 그것을 여덟 자리에서 쓴다.
`radius`도 마찬가지로 `'radius.md radius.md 0 0'`이 되고, 그 안의 참조도 풀린다(내가 쟀다 —
`border-radius: var(--wb-radius-md) var(--wb-radius-md) 0 0`).

> **`renderer/src/structures/input.tsx`의 `FieldBox` 주석이 *"밑줄만 있는 모습 — 된다.
> `control` 조각의 아래 테두리 하나다"*라고 적었다. 결론은 참인데 경로가 다르다** —
> "아래 테두리"라는 어휘는 없고, 있는 것은 "네 변을 한 번에 적는 어휘에 다중값을 넣는 것"이다.
> **고치지 않았다**(범위 밖이고 결론이 참이다).

### 5-6. **`primitives`를 스타일 값이 가리킬 수 없다** — 읽기 폭을 두 곳에 적었다

**브리프가 물은 자리다.** 답: **둘 다이고, 그 둘이 이어져 있지 않다.**

- `primitives.container.maxWidth: '720px'` — §6.4가 시키는 자리. `:root`에
  `--wb-container-maxWidth: 720px`로 나간다.
- `Section.parts.inner.maxWidth: '720px'` — **실제로 폭을 거는 자리.** 리터럴이다.
- `Text`의 `body` 변형 `maxWidth: '68ch'` — **본문을 실제로 지배하는 값.** 세리프 17px에서
  68ch가 720px보다 좁다. 문서 사이트에서 폭의 단위는 픽셀이 아니라 글자 수다.

**왜 리터럴인가 — 셋 다 실측했다(내가 쟀다).**

| 시도 | 결과 |
|---|---|
| `maxWidth: 'container.maxWidth'` | **참조로 인식되지 않는다.** `resolveStyleValue`가 값 `"container.maxWidth"`를 **이슈 0건**으로 그대로 낸다 — 참조 이름공간 일곱(`TOKEN_NAMESPACES`)에 `container`가 없다 |
| `maxWidth: 'var(--wb-container-maxWidth)'` | **이슈 1건** — `bad-style-value: 받지 않는 함수입니다: var` |
| `checkThemeComponents`에 primitives가 오는가 | **안 온다** — `resolve/index.ts`가 `tokens.table`만 넘긴다 |

**컴파일된 `docs` CSS에서 `var(--wb-container-maxWidth)` 참조는 0건이다.** 같은 수가 두 곳에
있고 **어긋나도 아무것도 안 죽는다.**

> ### `admin`이 그 함정에 이미 빠져 있다 — **내가 쟀다**
>
> `admin.ts`의 `Section.parts.inner`가 `maxWidth: 'container.maxWidth'`라고 적었고,
> 컴파일된 CSS에 **`max-width: container.maxWidth;`가 그대로 실린다.** `admin`도
> `var(--wb-container-maxWidth)` 참조가 **0건**이다.
>
> CSS 명세상 `container.maxWidth`는 `max-width`의 유효한 값이 아니므로 준수하는 파서는 그
> 선언을 버린다 — **명세로 판정했고 실브라우저로는 재지 않았다.** jsdom은 그것을 걸러내지
> 않고 `cssText`에 그대로 남긴다(관측했다).
>
> **그렇다면 `admin`의 1440px 컨테이너는 오늘 화면에 안 걸린다.** 계획서 D3의 표와 `admin`의
> 주석이 적은 *"넓은 컨테이너"*는 문서상 참이고 화면상 거짓이다.
> **`admin`을 고치지 않았다**(작성 계약 8 · D7). ③에 넘긴다.

### 5-7. **조각 스킨을 구조별로 가를 수 없다** — §4-2에 근거가 있다

### 5-8. `placeholder.style: 'photo'`가 **필요했다**. 선언하지 않았다

이 테마의 `Media`는 스크린샷 자리이고, 회색 상자보다 더미 이미지가 문서에 가깝다.
D5가 컴파일하지 않기로 했으므로 선언하면 **아무 일도 하지 않는 설정이 테마에 남는다.**
필요했다는 사실만 넘긴다. (코드 블록 쪽에는 필요 없다 — `blueprint`도 `skeleton`도 코드가
아니다.)

### 5-9. **좌측 내비 + 본문의 2단 셸을 테마가 말할 자리가 없다**

문서 사이트의 정의에 가까운 배치인데, 테마가 표현할 수 있는 것은 컴포넌트별 스킨과 구조뿐이다.
2단 배치는 저자가 `Flex`/`Grid` 노드로 짜야 하고, 테마를 `docs`로 바꿔도 그 배치는 안 생긴다.
§6.6의 `patterns`가 그 자리인데 **오늘 아무도 전개하지 않는다**(P7).

### 5-10. `patterns`를 선언하지 않았다 — **재라 #6에 대한 답**

**안 쓴다.** 근거 둘: (a) 오늘 검증만 되고 전개가 없어 선언해도 화면에 아무 일이 없다,
(b) §6.6의 예시 자체가 카탈로그와 어긋나 있다(`Grid.props.gap`이 없다 — P4b-1이 쟀다,
*남이 쟀다*). 검증만 되는 절을 채우면 P7이 전개를 만들 때 그 값의 뜻이 다시 정해진다.

**그래도 문서 테마가 원한 패턴 둘을 이름으로 남긴다:** `nav.docsSidebar`(`Section` > `Tree`),
`content.docArticle`(`Section` > `Text(h1)` + `Text(body)` + 코드 블록).
**그리고 그 둘째가 §16의 다른 열린 질문에 닿는다** — 슬롯 타입 셋(`text`·`media`·`action`)에
**코드/블록에 해당하는 것이 없다.**

---

## 6. 새 케이스와 구분력 실증

`apps/web/test/theme/docs-theme.test.tsx` **4건**을 더했다. 1736/98 → **1740/99**.

전부 python 치환으로 심고 **스냅샷 복사로 복구**했다(`git checkout --` 안 씀).
매번 심어졌는지 확인했고, 복구 뒤 **sha256이 원본과 일치**하는 것을 세 번 다 확인했다.

| 변이 | 죽은 수 | 어느 케이스 |
|---|---|---|
| `List.parts.title` 삭제 | **1** | 주의 상자 안의 목록 제목이 목록 자신의 색을 받는다 |
| `Field.parts.label` 삭제 | **1** | 폼 안의 필드 라벨이 필드 자신의 스킨을 받는다 |
| `Section.parts.inner.maxWidth`를 `'container.maxWidth'`로 | **1** | 읽기 폭은 리터럴이고 `:root`의 변수는 아무도 안 가리킨다 |

**순서 변이는 파일이 아니라 컴파일 입력에서 심었다** — 테마 객체를 복제해 `components`의
`Card`/`List` 키 순서만 뒤집었다. 결과는 위 §3의 표(목록 제목이 카드의 색을 받고 이슈 0건)이고,
케이스가 그 색을 단언하므로 같은 변이가 파일에서 나면 같은 케이스가 죽는다.

---

## 7. 재지 못한 것 — 정직하게

1. **api 프로젝트를 안 돌렸다.** 브리프의 지시다(Postgres 하나를 넷이 공유한다).
   **`pnpm vitest run --project unit --project web`과 `pnpm typecheck`만 돌렸다.**
   전체 회귀는 ③의 몫이다.
2. **실브라우저 확인 0건.** 이 보고의 계산값은 전부 jsdom이다. jsdom 25는 특이도도
   `!important`도 안 본다(P4b-2 ③이 대조 8건으로 쟀다 — *남이 쟀다*). **다만 이 보고가
   캐스케이드를 결론으로 삼은 두 자리**(§3의 조각 규칙 다툼, §3의 `Tree [node]`)**는 다투는
   규칙이 둘 다 (0,2,0)이라 실브라우저에서도 순서가 정한다** — 그 한계에 안 걸린다.
3. **`@font-face`가 실제로 걸리는지 이 브랜치에서 재지 않았다.** ①이 Chromium 151로 쟀고
   (*남이 쟀다*) 나는 **블록이 8개 나가는 것과 CSS 맨 앞에 오는 것**만 문자열로 확인했다.
4. **`local()` 폰트가 이 기계에 있는지 안 봤다.** 없으면 face의 `status`가 `error`가 된다
   (①이 쟀다 — *남이 쟀다*). 그래서 토큰의 `family` 값이 face 이름 뒤에 일반 폰트 이름을
   더 늘어놓는다 — 두 층이 서로를 받친다.
5. **사람이 눈으로 본 적이 없다.** 에디터를 띄우지 않았고 고르개로 `docs`를 골라 보지 않았다.
   *"문서 사이트처럼 보이는가"*는 계산값이 아니라 눈의 몫이다(계획서 *"계획이 재지 않은 것 1"*).
6. **`admin`의 `max-width: container.maxWidth`가 실브라우저에서 버려지는지 안 쟀다.**
   명세로 판정했다(§5-6).
7. **반응형 블록이 실제 폭에서 어떻게 겹치는지 안 쟀다.** `sm: 640` · `md: 900` 둘을
   선언했고 방출 순서(넓은 것 먼저)는 컴파일러의 계약이다 — 그 계약을 다시 재지 않았다.
8. **저장·조회 왕복을 안 쟀다**(계획서 *"재지 않은 것 2"*). ③의 몫으로 남는다.

---

## 8. 거짓으로 드러난 문장

### 8-1. **P4b-2 이월 3번의 결론이 절반이다** — §4-2

*"갈리는 모습은 전부 `base` 스킨으로 만들어야 한다"*는 맞지만, **그 스킨은 구조 이름과
무관하게 걸린다.** 구조 이름 하나를 형제로 바꾸면 컴파일된 CSS가 **한 줄**만 달라지고
그 줄은 `base` 규칙의 셀렉터이며, 테마가 구조를 하나만 고르므로 그 셀렉터는 여전히 전부에
걸린다. **한 테마 안에서 그 다섯 묶음의 구조 채널이 하는 일은 0이다.**

### 8-2. `admin`의 `container.maxWidth` 참조가 풀리지 않는다 — §5-6

코드가 의도와 다르게 동작하는 자리다. **고치지 않았다.**

### 8-3. `FieldBox` 주석의 *"`control` 조각의 아래 테두리 하나다"* — §5-5

결론은 참, 경로는 거짓. 어휘가 아니라 CSS 단축의 다중값이 그것을 가능하게 한다.

### 8-4. **내 측정 장치가 두 번 틀렸다** — 이 부류가 이 프로젝트에서 또 늘었다

1. **`renderNode(node, map)`이 아니라 `renderNode(node, { structures: map })`다.**
   프로브 1판이 구조 맵을 옵션으로 안 넘겨 **카탈로그의 첫 구조**로 그렸다 — `Tree`가
   `indent`, `Card`가 `plain`, `List`가 `table`로 그려졌고, **테마가 고른 구조를 하나도
   안 본 채 재고 있었다.** 증상으로 알아챘다: 아코디언을 고른 테마인데 출력에
   `Tree 구조: indent`가 찍혔고, 중첩된 목록의 `title` 조각이 아예 안 나왔다.
2. **`height` 정규식이 `line-height`에 걸렸다.** *"`Placeholder`에 `height` 선언이 있다"*는
   거짓 양성을 냈다. 블록을 잘라 줄 단위로 다시 세어 **0건**을 확인했다.

### 8-5. **변이 복구 스크립트를 잘못 짰다가 작업 트리를 오염시켰다**

삭제 변이의 복구를 *"`src`와 `dst`를 맞바꿔 치환"*으로 짰는데, `dst`가 빈 문자열이라
`text.count('')`가 26,173을 냈다. 스크립트가 실패하며 **파일이 변이 상태로 남았다.**
앵커 삽입으로 손으로 복구한 뒤 **스냅샷 복사 방식**으로 바꿨고, 이후 세 변이는 매번
sha256으로 복구를 확인했다. **최종 작업 트리는 clean이다.**

### 8-6. 계획서·①의 보고에서 확인한 것 (거짓 아님)

- ①의 *"`assets.fonts`가 `@font-face`로 나가고 `weights`는 값마다 블록 하나"* — **맞다.**
  2 + 4 + 2 = **8블록**이 나갔고 CSS가 `@font-face {`로 시작한다.
- ①의 *"`admin`은 `@font-face`가 0건이고 CSS가 `:root {`로 시작한다"* — **맞다.**
- 작성 계약의 통과 조건 다섯 — 전부 통과(`system.test.ts` 9건 · `system-theme.test.ts` 초록).
- P4b-2 ③의 *"DOM이 같은 14개"* — 내가 고른 넷에 대해 **다시 확인했다.** 넷 다
  `data-wb-structure` 값 말고는 렌더 결과가 문자열까지 같다.
