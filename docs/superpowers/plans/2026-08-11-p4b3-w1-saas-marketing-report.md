# P4b-3 ② W1 보고 — 시스템 테마 `saas-marketing`

브랜치 `feat/p4b3-saas-marketing`, 커밋 둘(`fd3b5a6` 테마 · `8028b5e` 케이스). 기준 `462bd99`.

**`pnpm vitest run --project unit --project web` 1736/98 → 1753/99.** `pnpm typecheck` 통과.
작업 트리 clean. **api 프로젝트는 돌리지 않았다**(넷이 Postgres 하나를 공유한다 — §7-1).

**이 문서의 값은 셋 중 하나로 읽힌다** — *내가 쟀다* / *남이 쟀다(귀속을 붙였다)* /
*재지 못했다*. 귀속 없는 값은 없다.

---

## 1. 고른 구조 전부 — 잡은 컴포넌트 18 중 **열**이 `admin`과 다르다

| 컴포넌트 | 이 테마 | `admin` | |
|---|---|---|---|
| `Page` | `default` | **안 잡는다** | ✱ `admin`이 테마로 잡지 않는 컴포넌트다 |
| `Section` | **`splitBg`** | `contained` | ✱ |
| `Flex` | `default` | `default` | 옵션이 하나다 |
| `Grid` | `default` | `default` | 옵션이 하나다 |
| `Card` | **`elevated`** | `plain` | ✱ |
| `Tabs` | **`pill`** | `underline` | ✱ |
| `List` | **`cardGrid`** | `table` | ✱ **§6.0이 이름으로 지목한 자리** |
| `Tree` | **`accordion`** | `indent` | ✱ |
| `KeyValue` | **`cardGrid`** | `table` | ✱ |
| `SearchForm` | `inline` | `inline` | **같다 — 억지로 다른 것을 고르지 않았다**(§5-3) |
| `EntryForm` | **`labelTop`** | `labelLeft` | ✱ |
| `Field` | **`filled`** | `outlined` | ✱ |
| `Button` | **`outline`** | `solid` | ✱ |
| `Link` | `default` | `default` | 옵션이 하나다 |
| `Text` | `default` | `default` | 옵션이 하나다 |
| `Media` | **`illustration`** | `image` | ✱ |
| `Divider` | `default` | `default` | 옵션이 하나다 |
| `Placeholder` | `default` | `default` | 옵션이 하나다 |

**열 전부가 P4b-2가 구현했지만 아무도 안 고르던 26개 안에 있다.** 근거: 렌더러의 옛
`DEFAULTS` 19는 컴포넌트 타입 19개의 **카탈로그 첫 구조** 그대로이고(`admin.ts`의 주석 —
*그쪽이 적었다*), `admin`이 고른 17이 정확히 그 목록이다. 즉 첫 구조가 아닌 것을 고르면
자동으로 26 안이다 — **위 열은 전부 첫 구조가 아니다**(카탈로그를 읽어 대조했다).

**`Slot`은 잡지 않았다.** 구조가 하나뿐이고 조각도 변형도 없어 테마가 걸 것이 없다
(`admin`도 안 잡는다).

---

## 2. `admin`과 어디서 갈리는가 — **인상을 만든 것은 토큰과 골격이고, 구조는 그 다음이다**

| 층 | 무엇이 갈렸나 | 값 |
|---|---|---|
| **토큰(타이포)** | 가장 크다 | `display` 32px → **64px** · `h1` 24px → **48px** · `body` 14px → **18px** |
| **토큰(굴림·그림자)** | 크다 | `radius` 4/6/10 → **8/14/24 + `full: 999px`** · 그림자가 한 겹 → **두 겹** |
| **토큰(색)** | 크다 | slate/blue → **잉크(보라 기)/violet + teal 액센트** |
| **골격** | 크다 | 컨테이너 1440px → **1200px** · 섹션 세로 리듬 `space.8`(32px) → **`space.20`(80px)** |
| **서체** | 새로 생긴 층 | `admin`은 `family`가 없다. 여기는 `@font-face` **넷** + `fontFamily`가 `Page`·`Text`·`Card`·`Button`·`Field`·`KeyValue`·`EntryForm`에 걸린다 |
| **구조** | 열 | 위 표 |
| **스킨** | 다섯 묶음에서는 **전부** | §4 |

**`space.unit`은 둘 다 `4px`다 — 그리고 그것이 판단이다.** 넓은 여백을 눈금을 키워
만들지 않았다. `8px`로 올리면 `space.1`이 8px이 되어 버튼 안쪽 여백을 표현할 수 없고
`space.24`가 192px이 된다. 갈리는 것은 **어느 단계를 쓰는가**다.

**`admin`이 안 잡는 `Page`를 잡았다.** 컴파일된 CSS는 컴포넌트 규칙만 내고 `:root`는
변수뿐이라, 최상위에 `font-family`를 걸지 않으면 조각 스킨이 가리키지 않는 글자가 전부
브라우저 기본 서체로 남는다. `font-family`·`color`가 상속되므로 한 줄이 아래 전부에 닿는다.

---

## 3. D6의 벽 셋 — **셋 다 만났다**

### 3-1. 벽 1 — 구조 선택이 컴포넌트 타입 단위다. **못 한 것이 넷이다**

| 못 한 것 | 왜 필요했나 | 오늘의 결과 |
|---|---|---|
| **`Media:video`와 `Media:illustration`을 한 페이지에** | 랜딩 페이지는 히어로에 제품 **영상**, 기능 절에 **일러스트**를 함께 놓는다 | 테마가 `illustration` 하나를 고르므로 그 문서의 **모든** `Media`가 일러스트다. `kind` prop이 있는데 **렌더에 안 닿는다**(P4b-1이 고정하고 P4b-2가 *"지우지 않는다"*로 판정한 그 자리 — **나는 `structures/document.tsx`를 읽어 `props.kind`가 어디서도 안 쓰이는 것을 확인했고 다시 재지는 않았다**) |
| **`Card:mediaTop`(기능 카드)과 `Card:elevated`(요금제 카드)를 한 페이지에** | 기능 카드는 위에 그림이, 요금제 카드는 그림 없이 값과 목록이 온다 | `elevated`를 골랐다. 기능 카드에 그림 자리를 만들 방법이 없다 — `mediaTop`이 내는 `media` 조각이 아예 안 그려진다 |
| **`List:cardGrid`(기능)와 `List:table`(요금제 비교표)을 한 페이지에** | 요금제 비교는 표가 맞다 | 전부 카드 그리드다 |
| **히어로만 진짜 좌우 분할(`splitBg`)** | 히어로는 글/스크린샷 반분, 나머지 절은 가운데 정렬 | `splitBg`를 고르되 **`display: block`으로 덮어** 반분을 포기하고 `band`를 배경 워시로만 썼다 |

**앞의 셋은 `structureFrom` 후보가, 넷째는 그것도 못 푼다** — 넷째는 *"같은 구조에 다른
배치"*라 스킨(변형)의 몫이고, `Section`은 `variantFrom`이 비어 있어 노드가 변형으로
고를 수 있다. 즉 **넷째는 벽이 아니라 내 설계 선택이다**(그렇게 적는다).

### 3-2. 벽 2 — `parts` 규칙이 자손 결합자다. **두 자리에서 각각 3건이 잡혔다**

**내가 렌더해서 셌다**(`apps/web/test/theme/saas-marketing.test.tsx`).

| 바깥 규칙 | 잡힌 요소 수 | 내역 |
|---|---|---|
| `[data-wb-component="Card"] [data-wb-part="title"]` | **3** | 카드 자신의 제목 1 + 카드 안 `List:cardGrid`의 항목 제목 **2** |
| `[data-wb-component="EntryForm"] [data-wb-part="label"]` | **3** | 폼 제목 1 + 중첩 `Field`의 라벨 **1** + 중첩 `Button`의 라벨 **1** |

**원인은 P4b-2 이월 4-1 그대로다** — `pushComponent`의 조각 규칙이
`[data-wb-component="X"] [data-wb-part="p"]`이고 결합자가 자손이라 컴포넌트 경계를 안 본다.
`Card`/`List`가 `title`·`media`·`body`·`header`를, `EntryForm`/`Field`/`Button`이 `label`을
공유한다.

**무엇이 막고 있나 — 모델이 아니라 방출 순서와 중복 선언이다.**

| 프로퍼티 | 관찰된 값 | 왜 |
|---|---|---|
| 카드 제목 `font-size` | `var(--wb-typography-h3-fontSize)` | 의도한 것 |
| 중첩 목록 항목 제목 `font-size` | `var(--wb-typography-h4-fontSize)` | `List`가 `Card`보다 **뒤에** 방출되고 같은 프로퍼티를 선언한다 |
| 폼 제목 `font-family` | `var(--wb-typography-family-display)` | 의도한 것 |
| 중첩 필드 라벨 `font-family` | `var(--wb-typography-family-sans)` | **`Field.parts.label`에 같은 프로퍼티를 중복 선언해 막았다** |
| 중첩 버튼 라벨 `font-family` | `var(--wb-typography-family-sans)` | 같은 방식 |

**그 중복이 실제로 일하고 있다 — 변조로 확인했다.** `Field.parts.label`에서
`fontFamily` 한 줄을 지우면 중첩 필드 라벨이 **디스플레이 서체를 받는다**(케이스 1건 죽음).
`Card.parts.title`에서 `typography`를 지우면 중첩 목록 항목 제목이 카드의 값을 받는다
(케이스 1건 죽음).

> **P4b-2가 `admin`에서 3건을 쟀고**(전부 `EntryForm.parts.label`), 이 테마에서는
> **두 자리에서 3 + 3**이다. 부류가 커진 이유는 이 테마가 `Card` 안에 `List`를 넣는
> 구성(카드 그리드가 마케팅의 기본형이다)을 실제로 쓰기 때문이다.

### 3-3. 벽 3 — 침묵 덮어쓰기 손잡이 여덟. **하나도 안 쓴다**

**이름 여덟 각각을 내가 컴파일된 CSS로 확인했다**(`declares` 헬퍼가 줄 머리
`  <이름>: `로 센다 — §6-2의 이유로 부분 문자열로 세면 안 된다).

| 손잡이 이름 | 그 셀렉터 | 이 테마가 그 셀렉터에서 내는가 | 다른 데서 쓰는가 |
|---|---|---|---|
| `direction` | `Flex:default` 루트 | **아니다** | 안 쓴다 |
| `align` | `Flex:default` 루트 | **아니다** | 쓴다 — `SearchForm` 루트·`Media [frame]`·`Placeholder` 루트(손잡이 자리가 아니다) |
| `justify` | `Flex:default` 루트 | **아니다** | 같은 셋 |
| `wrap` | `Flex:default` 루트 | **아니다** | 안 쓴다 |
| `gridColumns` | `Grid:default` · `KeyValue:cardGrid` 루트 | **아니다** | 쓴다 — `List:cardGrid` 루트. **거기는 손잡이가 아니다**(구현체가 트랙을 리터럴 `repeat(2,1fr)`로 내고 노드 변수를 안 읽는다) |
| `aspectRatio` | `Media [frame]` | **아니다** | 쓴다 — `List [media]`(손잡이 자리가 아니다) |
| `height` | `Placeholder:default` 루트 | **아니다** | 쓴다 — `Divider` 변형(손잡이 자리가 아니다) |
| `paddingX` | `Tree [node]` | **아니다**(`Tree [panel]`에는 쓴다 — 다른 조각이다) | 쓴다 — **여덟 자리**(`grep -c`로 셌다: 선언 8 + 주석 1) |

**그리고 `Tree`의 손잡이는 이 테마에서 아예 성립하지 않는다.** P4b-2 ③이 그 규칙을
`:where(indent)`로 좁혔는데 이 테마는 `accordion`을 고른다 — **구조 선택만으로 아홉 중
하나가 판에서 빠졌다.** 렌더된 마디가 그 셀렉터에 `matches()` 하지 않는 것을 확인했다.

**노드 값이 살아 있는 것도 함께 쟀다** — `Flex`의 `--wb-node-flex-direction`이 `column`이고
계산된 `flex-direction`이 `var(--wb-node-flex-direction, row)`, `KeyValue`의
`--wb-node-keyvalue-columns`가 `2`다. **변조로 확인했다:** `Flex.base`에 `direction`을
심으면 케이스 2건이 죽는다.

---

## 4. D4 — DOM이 같은 다섯 묶음이 **스킨으로 실제로 갈린다**

**렌더해서 잰 값이다.** 같은 문서를 두 테마로 그렸다.

**먼저 DOM이 같다는 것을 다시 확인했다** — 마크업에서 `data-wb-structure` 값만 지우면
두 테마의 문자열이 **완전히 같다**(지우기 전에는 다르다). P4b-2 ③의 전수 측정을 이 다섯에서
재확인한 것이다.

| 묶음 | 잰 자리 | `admin`(`solid` 등) | 이 테마 |
|---|---|---|---|
| `Card` `plain`→`elevated` | 루트 `box-shadow` | `''` | **`var(--wb-shadow-md)`** |
| `Tabs` `underline`→`pill` | `tab` `border-radius` | `''` | **`var(--wb-radius-full)`** |
| `EntryForm` `labelLeft`→`labelTop` | 루트 `box-shadow` | `''` | **`var(--wb-shadow-md)`** |
| `Field` `outlined`→`filled` | `control` `border-width` | `1px` | **`0px`** |
| `Button` `solid`→`outline` | 루트 `background` | `var(--wb-semantic-primary)` | **`var(--wb-semantic-surface)`** |

**다섯이 전부 갈린다.** 그리고 *"라벨이 위로 간다"*는 `EntryForm`이 아니라 **`Field` 루트의
`display: grid`**가 만든다(`admin`은 그 자리가 `<div>`의 UA 기본값 `block`이다).

**변조로 확인했다:** `Card.base`에서 `shadow` 한 줄을 지우면 이 표의 케이스가 죽는다.

---

## 5. 못 한 것 — **§16이 받을 입력**

### 5-1. `placeholder.style: 'photo'`가 **컴파일되지 않는다**

§6.7이 *"실제 사이트에 가깝게 보여야 하면 `photo`"*라고 적었고 **이 테마가 실제로 원하는
값이다.** 선언은 통과하고 CSS에는 한 글자도 안 나간다(D5 — 테마→렌더러 채널이 `structures`
하나뿐이다). **선언을 남겨 뒀다** — ③이 *"넷 중 몇이 이 값을 필요로 했는가"*를 셀 수 있게.
오늘은 `Placeholder.base`·`Media.parts.frame`에 손으로 흉내 냈다.

### 5-2. **`primitives`를 컴포넌트 스타일이 가리킬 수 없다 — 새 부류다**

**내가 쟀다.** §6.4의 값(`container.maxWidth`·`grid.gap`·`section.paddingY`)은 `:root`에
변수로 나가는데 **그것을 가리킬 문법이 없다:**

- `maxWidth: 'container.maxWidth'` → `TOKEN_NAMESPACES`에 `container`가 없어 참조로
  인식되지 않고 **리터럴로 그대로 실린다.**
- `maxWidth: 'var(--wb-container-maxWidth)'` → `maxWidth`의 함수 허용 목록이 비어 있어
  `var(`가 **거부된다**(이슈).

그래서 이 테마는 `maxWidth: '1200px'` 리터럴을 쓰고 `primitives`의 같은 값과 **손으로 맞춰야
한다.** §6.4가 *"인상의 절반은 여기서 나온다"*고 적은 층인데 컴포넌트가 그것을 못 읽는다.

### 5-3. `SearchForm`에서 새 구조를 안 골랐다 — **판단이다**

`inline`이 `admin`과 같다. 마케팅 사이트의 검색 폼은 히어로의 한 줄짜리 입력 + 버튼이고
그것이 `inline`이다. `stacked`는 필터 패널, `collapsible`은 접히는 조건 검색이라 이 사이트에
없다. **D3의 *"테마가 정직해야 한다"*를 지킨 자리이고, 갈리는 것은 스킨이다**(알약 모양의
떠 있는 검색 바).

### 5-4. `Section:fullBleed`를 버렸다 — **그 이유가 §16의 입력이다**

브리프의 참고 목록에 있었지만 안 골랐다. **`fullBleed`에는 `inner`가 아예 없다**(구현체의
판정 — *"폭을 안 가두는 섹션에 그 자리를 남겨 두면…"*). 그런데 테마가 폭을 가둘 수 있는
자리가 그것뿐이라, `fullBleed`를 고르면 **그 문서의 모든 섹션에서 내용이 화면 끝까지
늘어난다.** 루트에 `maxWidth`를 걸면 배경까지 함께 좁아져 *"전면 배경 + 가운데 내용"*이
아니게 된다.

**즉 `fullBleed`는 테마 전체의 선택으로는 쓸 수 없고, 섹션 하나의 선택으로만 뜻이 있다.**
벽 1이 풀리기 전에는 아무 테마도 이것을 못 고른다 — §6.5 목록 재검토의 후보다.

### 5-5. `patterns`를 선언하지 않았다 (재라 #6)

§6.6이 `hero.split`을 **`saas-marketing`을 이름으로 들어** 예시로 적었으므로 선언할 자리가
맞다. 안 한 이유 둘: (가) 오늘 전개하는 코드가 없다(`checkPatterns`가 검증만 한다 —
`resolve/index.ts:54`), (나) §6.6의 예시가 `Grid`에 `gap` prop을 주는데 **카탈로그에 그 prop이
없어 `bad-pattern-node`로 테마 전체가 해석되지 않는다**(P4b-1이 실측해 `resolve/style.ts`에
적어 둔 것 — *그쪽이 쟀고 나는 다시 재지 않았다*). 즉 §6.6의 예시를 그대로 옮기면 테마가
통째로 막힌다. **P7이 전개를 만들 때 함께 넣는 것이 맞다고 판단했다.**

### 5-6. `SAAS_MARKETING_THEME`을 `packages/themes/src/index.ts`에서 내보내지 않았다

`ADMIN_THEME`은 내보내지만 이것은 안 했다. 이유: `public-api.test.ts`가 **공개 이름 목록을
손으로 들고 있어** 내보내면 그 파일도 고쳐야 하고, 그러면 **넷이 동시에 만지는 공유 파일이
둘로 는다.** 쓰는 쪽은 `systemTheme('saas-marketing')`으로 닿는다. **③이 필요하다고 보면
한 번에 넷을 넣는 것이 맞다.**

---

## 6. 거짓으로 드러난 문장

### 6-1. `admin`이 **무효 CSS 선언을 둘 내보내고 있다** — 이슈 0건으로

**내가 컴파일해서 봤고 케이스로 못박았다.**

```
[data-wb-component="Section"] [data-wb-part="inner"] { max-width: container.maxWidth; }
[data-wb-component="Grid"][data-wb-structure="default"] { gap: grid.gap; }
```

`admin.ts`는 저 두 줄을 §6.4의 값을 가리키는 참조로 적었다. **참조가 아니다**(§5-2).
결과: **`admin`의 섹션에는 최대 폭이 없고 그리드에는 간격이 없다.** `resolveTheme`의 이슈는
0건이다 — 이름공간이 `TOKEN_NAMESPACES` 밖이면 리터럴로 통과하기 때문이다.

**고치지 않았다** — 작성 계약 8과 D7이 `admin` 수정을 금지한다. **③의 판정 대상이다**
(D7이 *"`admin`의 CSS가 글자까지 같아야 한다"*이므로 이 슬라이스에서는 고칠 수 없다).

### 6-2. 브리프의 *"어울릴 법한 구조"* 중 `Section:fullBleed`는 **오늘 고를 수 없다**

§5-4. 브리프가 스스로 *"지시가 아니다"*라고 적은 자리이므로 어긋남이 아니라 **참고 목록의
한 항목이 실제로는 성립하지 않는다**는 관측이다.

### 6-3. 내가 처음에 적었던 수 하나 — *"열 중 여덟"*

첫 커밋 메시지와 테마 머리말에 *"여덟"*이라고 적었다가 세어 보니 **열**이었다. 커밋 둘을
다시 써서 고쳤다(`fd3b5a6`·`8028b5e`). **P4b-2 이월이 *"여덟 중 여섯이 수이거나 예"*라고
남긴 그 부류를 내가 한 번 더 만들었다.**

### 6-4. 확인했고 **참인** 것

- `saas-marketing`이 `THEME_ID_PATTERN`을 통과한다(①이 스텁으로 확인했다 — 내 테마로도 통과).
- `SYSTEM_THEME_IDS`를 도는 케이스가 자동으로 새 테마를 포함한다(①). **api 테스트의 목록이
  파생식이라 손댈 것이 없었다** — 손대야 할 것 같은 자리를 만나지 않았다.
- `assets.fonts`가 `@font-face`로 나가고 `weights`가 값마다 블록 하나다(①). **넷을 셌다.**
- `admin`은 `@font-face`를 0건 낸다(①이 닫은 D7의 절반 — 내 케이스가 다시 확인한다).

---

## 7. 재지 못한 것 — 정직하게

1. **api 프로젝트를 안 돌렸다.** 브리프의 지시다(넷이 Postgres 하나를 공유한다).
   내 변경이 닿는 것은 `--project unit`·`--project web` 안에 전부 있다고 브리프가 적었고
   나는 그것을 검증하지 않았다. **전체 회귀는 ③의 몫이다.**
2. **Chromium 프로브를 안 돌렸다.** 이 테마가 새 층을 더하지 않으므로(①이 `@font-face`를
   만들었고 그 프로브도 ①이 돌렸다) 계획서가 요구한 D8은 ①/③의 몫이다. 다만 **jsdom이
   특이도도 `!important`도 안 보므로**(P4b-2 ③이 쟀다 — 나는 다시 재지 않았다) 이 보고의
   *"테마가 렌더러의 `display: grid`를 이긴다"*는 **순서만으로도 초록이 되는 단언**이다.
   같은 특이도라는 것은 `componentRule`이 만드는 셀렉터 문자열이 보증하고, 실제 승패는
   P4b-2 리뷰가 구조 기본 CSS 전수 20/20으로 쟀다(*그쪽이 쟀다*).
3. **사람이 눈으로 본 적이 없다.** *"랜딩 페이지처럼 보인다"*는 케이스가 아니라 눈의
   몫이다. 잰 것은 *"CSS가 다르다"*까지다(계획서 *"재지 않은 것 1"*과 같은 부류).
   **고르개로 띄워 보지도 않았다.**
4. **저장·조회 왕복을 안 쟀다.** 계획서 *"재지 않은 것 2"*가 ①/③에 남긴 자리다.
   내 테마는 `components` 순서에 하중이 있다(§3-2의 *"뒤에 방출된 List가 이긴다"*) —
   `jsonb`였다면 그 순서가 뒤집혔을 것이고, `json` 컬럼이 그것을 막는다는 것은
   P4a-3이 쟀다(*그쪽이 쟀고 나는 확인하지 않았다*).
5. **`local()`이 실제로 어느 폰트에 붙는지 안 쟀다.** ①이 *"그 이름의 로컬 폰트가 없으면
   face의 `status`가 `error`"*라고 쟀고(*그쪽이 쟀다*), 내가 고른 이름들(`Inter Variable`
   등)이 이 기계에 있는지는 **안 봤다.** 없으면 `typography.family`의 뒷줄이 그려진다.
6. **가변 폰트 가정.** `weights: [700, 800]`을 한 `src`에 걸었고 그 `src`의 첫 항목이
   가변 폰트 이름이다. **정적 폰트에 붙으면 800이 700처럼 보인다**(①이 그 부류를 적었다).
   재지 않았다.

---

## 8. 측정 장치가 나를 **세 번** 속였다

계획서가 *"측정이 예상과 다르면 대상이 아니라 측정 장치를 먼저 의심하라"*고 적은 자리다.
셋 다 대상이 아니라 장치였다.

| 관찰 | 의심한 것 | 실제 원인 |
|---|---|---|
| `Button`의 배경이 두 테마에서 **똑같이** `var(--wb-semantic-primary)` | 구조 스킨이 안 걸린다? | **측정용 노드에 `variant: 'primary'`를 달아 두었다.** 변형 규칙이 뒤에 와서 구조 스킨을 덮는다 — 재려던 것이 가려졌다. 변형 없는 버튼으로 바꿨다 |
| `Placeholder` 블록에 `height`가 **있다** | 손잡이를 덮고 있나? | **부분 문자열이 `line-height`에 걸렸다.** 선언을 줄 머리 `  <이름>: ` 모양으로 세는 헬퍼로 바꿨다 |
| 변조를 복구했는데 **작업 트리가 더럽다** | 복구 문자열이 틀렸나? | **치환 스크립트가 쓰고 나서 확인했다.** `Field.parts.label`에서 `fontFamily`를 지우면 `KeyValue.parts.key`와 글자까지 같아져 유일성 검사가 실패했는데, **그때는 이미 쓴 뒤**라 변조가 남았다. 그 상태로 돈 배치가 *"중첩 라벨 케이스가 매번 죽는다"*는 **가짜 구분력**을 보였다 |

**셋째가 가장 나빴다.** 남은 변조가 뒤이은 변조 여섯의 결과를 전부 오염시켰고, 그 배치의
표를 그대로 보고했으면 *"이 케이스는 무엇을 건드려도 죽는다"*는 거짓이 남았을 것이다.
**잡은 것은 `git status`를 매 왕복마다 찍은 것이었다.** 스크립트를 *검사 → 쓰기* 순서로
뒤집고 앵커를 유일하게 만든 뒤 **전부 다시 돌렸다.**

---

## 9. 구분력 실증 — 변조 10건, 전부 python 치환으로 심고 같은 방식으로 복구

**매 왕복마다 심어졌는지와 복구됐는지를 확인했고 마지막 트리가 clean이다.**

| 변조 | 죽은 케이스 수 | 어느 케이스 |
|---|---|---|
| `Section` 구조 `splitBg` → `contained` | **1** | splitBg의 band가 배경 워시를 담는다 |
| `Field.parts.label`의 `fontFamily` 제거 | **1** | 중첩 라벨의 서체는 안쪽 중복 선언이 막고 있다 |
| `assets.fonts[0].family` 이름 변경 | **1** | 선언한 family가 토큰을 지나 규칙까지 이어진다 |
| `Card` 구조 `elevated` → `plain` | **1** | 다섯 묶음에서 admin과 다른 구조를 고른다 |
| `Card.base`의 `shadow` 제거 | **1** | 다섯 자리의 계산된 스타일이 실제로 갈린다 |
| `Media.parts.frame`에 `aspectRatio` 심기 | **1** | 손잡이 여덟을 그 셀렉터에서 안 낸다 |
| `Flex.base`에 `direction` 심기 | **2** | 같은 것 + 노드 값이 남는다 |
| `List` 구조 `cardGrid` → `table` | **3** | Card→List 누수 2건 + §6.0의 약속 |
| `Card.parts.title`의 `typography` 제거 | **1** | 겹치는 프로퍼티는 뒤에 방출된 List가 이긴다 |
| `system/index.ts`에서 **등록 제거** | **17** | 이 파일 전부. **그리고 다른 파일은 하나도 안 죽었다**(98파일 1736건 초록) |

마지막 줄이 **기준선이자 ①의 예측 확인**이다 — 이 테마를 등록하는 것이 기존 unit·web
케이스를 하나도 안 깬다.
