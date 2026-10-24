---
name: wirebound-theme
description: wirebound 설계서 테마를 짠다 — 컴포넌트 뷰(tsx) · CSS · 토큰 · variant 를 이 프로젝트에서 고치고 `.wbtheme` 로 빌드할 때 읽는다.
---

# wirebound 테마 작성 지침

이 프로젝트는 wirebound 설계서의 **테마**다. 설계서의 페이지는 컴포넌트 노드의 트리이고(카탈로그 29 종 — `Page` · `Slot` ·
`Section` · `Flex` · `Grid` · `Card` · `Tabs` · `TabPanel` · `List` · `Tree` · `KeyValue` · `SearchForm` · `EntryForm` · `Field` ·
`Input` · `TextArea` · `Select` · `DateInput` · `TimeInput` · `CheckboxGroup` · `RadioGroup` · `Chip` · `Affix` · `Button` ·
`Link` · `Text` · `Media` · `Divider` · `Placeholder`), 테마는 컴포넌트마다 **뷰**(React 컴포넌트)와 CSS 를 낸다. 카탈로그와 각
컴포넌트의 props 는 wirebound 가 정한다 — 테마는 컴포넌트나 props 를 더할 수 없고, 어떻게 보이는지만 정한다.

| 파일 | 하는 일 |
|---|---|
| `theme.config.ts` | manifest — 테마 id · 판 · 토큰 · variant 선언(「manifest」) |
| `src/index.tsx` | `defineTheme({ manifest, views })` — 컴포넌트 이름 → 뷰 |
| `src/views/*.tsx` | 뷰. SDK 기본 뷰를 옮긴 출발점이다 — 마음대로 고친다 |
| `src/theme.css` | 테마 CSS. `src/index.tsx` 가 import 한다 |
| `assets/` | 이미지 · 글꼴(png · jpg · jpeg · gif · webp · svg · woff · woff2 · ttf · otf) |

## 절차

```bash
npm install
npm run dev        # 갤러리 — 모든 컴포넌트 × variant 를 표본으로 늘어놓는다. 뷰 · CSS 는 고치면 바로 반영된다
npm run build      # 검증 → dist/<id>-<version>.wbtheme
npm run typecheck
```

- `dev` 의 셸: 뷰포트 프리셋(1920 · 1440 · 1280 · 1024 · 768 · 375 — 갤러리가 그 폭으로 그려져 `@media` 가 그 폭으로 걸린다),
  토큰 패널(manifest 의 토큰으로 자동), «겹쳐 보기»(에디터가 노드를 골랐을 때의 외곽선과 코멘트 번호 자리), manifest 이슈 목록.
- `build` 는 manifest 를 업로드와 **같은 함수**로 검증한다. 이슈가 있으면 이유를 줄마다 찍고 파일을 만들지 않는다. 결과
  파일을 wirebound 관리자 화면에서 올린다.
- 같은 `id@version` 은 다시 올릴 수 없다 — 고쳤으면 `version` 을 올린다.

## 뷰 계약

```tsx
import { Focus, Root, useToken, view } from '@wirebound/theme-sdk'

export const ListView = view(({ props, variant, states, children }) => {
  const density = useToken('density')
  return (
    <Root as="section" className={`list list--${density}`} marker={{ placement: 'top-end', offset: [4, -8] }}>
      <header>{String(props.title ?? '')}</header>
      <Focus>{variant === 'cards' ? <div className="cards">…</div> : <table>…</table>}</Focus>
    </Root>
  )
})
```

- 뷰가 받는 것: `props`(기본값이 채워진 카탈로그 props) · `states`(`disabled` · `loading` 처럼 참인 상태 이름들) ·
  `variant`(노드의 variant — 테마에 없는 값이면 그 컴포넌트의 `defaultVariant`) · `children`(이미 그린 몸통의 자식) · `zones`(이름 붙은
  구역마다 그린 것 — 빈 구역은 `null`) · `items`(몸통 자식 하나씩 — `{ nodeId, index, element, content }`) · `slot`(`Slot` 에 들어갈 내용) ·
  `nodeId` · `type` · `field`(`Field` 값 칸의 입력 조각일 때만 — `{ name, required }`: 조각이 하나면 라벨, 여럿이면 «라벨 + 별칭(없으면 차례)».
  입력 조각의 뷰를 지으면 `name` 을 접근 이름(`aria-label`)으로, `required` 면 `aria-required` 를 단다 — 입력 칸만 훑는 보조 기술은 필드의
  묶음 이름을 지나지 않는다).
- **구역은 `<Zone name>` 으로 둔다.** 카드의 제목 옆(`titleSide`) · 머리 오른쪽(`headEnd`) · 바닥(`footer`), 검색폼 · 입력폼의 단추
  (`actions`), 목록의 머리 왼쪽 · 오른쪽(`headStart` · `headEnd`)은 사람이 놓는 노드가 든 자리다 — `<Zone name="footer" as="div"
  data-wb-part="footer" />` 가 그 구역을 그리고 `data-wb-zone` 을 펴며, 비었으면 감싸는 요소째 안 그린다. `Zone` 을 안 쓰는 뷰는 그
  구역의 노드를 화면에서 잃는다 — `wb-theme check` 가 «내용이 든 구역을 그리지 않았습니다» 로 막는다. 단추 글자(«검색» · «저장»)를 뷰에
  박지 않는다 — 단추는 문서의 노드다.
- **탭은 `items` 로 그린다.** `Tabs` 의 몸통은 `TabPanel` 노드들이다 — `items` 마다 `item.element`(탭 머리 — 패널 노드의 뿌리)를 머리 줄에,
  고른 패널(`props.active` 자리, 그 패널이 없거나 숨었으면 첫 `item`)의 `item.content`(그 패널의 내용)를 패널 칸에 둔다. `TabPanel` 뷰는
  몸통(`children`)을 `null` 로 받는다 — 내용은 부모가 둔다.
- **`<Root>` 로 감싼다 — 빠뜨릴 수 없다.** `Root` 가 `data-wb-id` · `data-wb-component` · `data-wb-variant` · `data-wb-state` 와
  상호작용 핸들러를 루트 요소에 붙인다. 에디터는 그 속성으로 노드를 고르고 외곽선을 그린다.
- **뷰는 `view(…)` 로 짠다.** `Root` 는 `view` 가 내린 노드의 props · 상태로 **prop 표지**와 접근성 속성을 함께 단다 — `view` 를
  거치지 않은 맨 함수 뷰에는 안 선다.
  - prop 표지: 화면을 바꾸는 불리언 · enum prop 가운데 상태 · 변형으로 실리지 않는 것. 불리언은 참일 때 `data-wb-<prop>=""`, enum
    은 늘 `data-wb-<prop>="<값>"` — `Section` 의 `data-wb-compact`(좁은 여백) · `SearchForm` 의 `data-wb-collapsed`(접힘) · `List` 의
    `data-wb-selectable` · `data-wb-pagination` · `Media` 의 `data-wb-kind` · `data-wb-ratio` · `Flex` 의 `data-wb-direction` ·
    `data-wb-align` · `data-wb-justify` · `data-wb-wrap` · `Input` 의 `data-wb-kind` · `data-wb-size` · `Select` 의 `data-wb-size` ·
    `Chip` 의 `data-wb-removable` · `Affix` 의 `data-wb-tone`.
  - 상태(`data-wb-state~='disabled'`)가 참이면 `aria-disabled` · `loading` 은 `aria-busy` · `invalid` 는 `aria-invalid` · `required` 는
    `aria-required` 가 `"true"` 로 선다. 그 뜻을 안쪽 요소로 옮기려면 `Root` 에 같은 이름(`undefined`)을 넘긴다.
    `readonly` 는 `aria-readonly` 다. 입력 조각(`Input` · `Select` …)의 뷰는 루트에 역할(`textbox` · `combobox` 등)과 이름을 달아 그 속성이
    읽히게 한다. `Field` 의 뿌리는 `group` 이라 `aria-required` 를 받는 역할이 아니다 — 기본 `Field` 뷰는 그것을 거두고(필수는 값 칸 조각이 `field.required` 로 `aria-required` 를 단다) 필수를 라벨의
    별(`data-wb-state~='required'`)로 보인다.
- **`Field` 는 라벨과 값 칸이다.** 값 칸(몸통 — `children`)에 입력 조각이 줄 선다. 뷰는 `label` 조각과 `value` 조각(그 안에 `children`)을
  형제로 둔다 — `children` 을 안 그리면 값 칸의 조각이 화면에서 사라지고 `wb-theme check` 가 막는다. 조각의 몫(`--wb-node-weight`)은 SDK 기본
  CSS 가 `flex` 로 건다.
  - CSS 는 `[data-wb-component='Section'][data-wb-compact] { … }` 처럼 겨냥한다. 기본 뷰도 그 값으로 모양을 바꾼다(접힌 검색은
    머리줄 `toggle` 조각만 남고 자식이 빠진다 · 표 구조 목록의 `selectable` 은 `checkbox` 조각) — 테마 CSS 가 여백 · 색을 정한다.
  - **`List.selectable` 은 표 구조(`data-wb-structure="table"`)에서만 뜻이 있다.** 줄 · 카드 목록 구조의 뷰는 표지 `data-wb-selectable` 만 서고
    체크 칸이 없다 — 그 구조에 체크 칸이 필요하면 뷰가 직접 그린다.
- **첫 렌더에 `Root` 를 반환한다.** 이펙트 · 상태를 기다렸다가 `Root` 를 그리면 누락으로 판정되어 그 노드는 SDK 기본 뷰로
  그려지고 콘솔에 경고가 난다.
- **포커스 받는 요소는 단추(`<button>`) · 링크(`<a href>`) · 입력 칸(`input` · `select` · `textarea`)만 쓴다.** 에디터 캔버스는 포커스가 선 요소가 단추 · 링크가 아니면 입력 표면으로 보고 단축키 · 노드 복사를 안 받는다 — `tabIndex` 를 단 `div` · `summary` · `controls` 를 켠 `video` · `audio` 를 누른 뒤에는 Delete · Cmd+C · Cmd+D 가 안 서고 통지도 없다(닫힌 shadow 안의 입력과 `tabindex` 만 단 요소를 DOM 으로 못 가려서다). 탭 · 접힘 같은 위젯도 `<button>` 으로 짜고 `role="tab"` 은 그 단추에 얹는다. `wb-theme check` 가 갤러리 칸에서 이런 요소를 찾아 경고한다(오류가 아니라 종료 코드에 안 든다).
- `as` 로 루트 태그를 고른다(기본 `div`). 나머지 props(`className` · `style` · `aria-*`)는 루트 요소로 간다. 노드 속성
  (`data-wb-*`)은 테마가 같은 이름을 넘겨도 노드 것이 이긴다.
- **`<Focus>`** — 선택 외곽선이 감쌀 요소. 엘리먼트 **하나**만 감싼다(감싸는 요소를 더하지 않고 그 자식에 속성만 단다).
  없으면 `Root` 전체다. 한 뷰에 둘 두지 않는다.
- **`marker`** — 코멘트 번호 마커의 자리. `placement` 는 `top-start` · `top-end` · `bottom-start` · `bottom-end` · `start` ·
  `end`(기본 `top-start`), `offset` 은 `[x, y]` CSS px(기본 `[0, 0]`). 기준 상자는 `<Focus>` 가 있으면 그것, 없으면 루트다.
- 뷰가 던지면 그 노드 자리에만 오류 상자가 선다 — 다른 노드는 그려진다. 갤러리에서 보인다.

## 토큰

- `useToken('키')` — 토큰의 지금 값(참조를 따라간 값). 마크업을 바꾸는 토큰(대개 `select` · `number`)에 쓴다. 값이 바뀌면
  그 토큰을 읽은 뷰가 다시 그려진다.
- 모든 토큰은 CSS 변수로도 실린다 — `--wb-<키의 . 을 - 로>`(`color.primary` → `var(--wb-color-primary)`). 색 · 길이처럼
  CSS 로 충분한 것은 CSS 에서 변수로 쓴다.
- **`useWindow()` 를 쓴다 — 전역 `window` · `document` 를 쓰지 않는다.** 에디터 캔버스에서 테마는 iframe 안에서 그려지고, 전역
  `window` 는 에디터 창이다(폭 · `matchMedia` · 이벤트가 다른 창의 것이 된다).

## manifest

`theme.config.ts` 의 `defineManifest({ … })`. `build` 가 검증한다 — 아래 규칙을 어기면 이유와 자리(`components.List.variants.1`)를
말한다.

| 필드 | 규칙 |
|---|---|
| `id` | `[a-z0-9-]+`. 테마의 이름표 — 판을 올려도 바꾸지 않는다. `system-` 으로 시작할 수 없다(업로드가 거부한다) |
| `version` | `x.y.z` |
| `sdk` | `^x.y.z` · `~x.y.z` · `x.y.z` 셋 가운데 하나(「sdk 범위」) |
| `tokens.items` | 키는 `[a-zA-Z0-9.-]+`. 타입은 `color` · `length` · `number` · `font` · `shadow` · `select` 여섯 |
| `tokens.groups` | 토큰 패널의 묶음. 토큰의 `group` 이 그 `id` 를 가리킨다 |
| `components` | 키는 카탈로그의 컴포넌트 이름. `variants` 는 하나 이상, `defaultVariant` 는 그 안의 id |

**토큰 값**

- `color` — `#rgb` · `#rrggbb` · `#rrggbbaa` · `rgb()` · `rgba()` · `hsl()` · CSS 색 이름.
- `length` — `0` 또는 수 + `px` · `rem` · `em` · `%` · `vh` · `vw`.
- `number` — 수.
- `font` — 쉼표로 가른 글꼴 이름 목록. 이름 하나는 글자 · 숫자 · `_` · `-` 로 된 낱말(공백으로 이어도 된다)이거나 짝이 맞는
  따옴표 문자열(안에 따옴표 · `\` · 줄바꿈 · `<` 없이)이다.
- `shadow` — `none`, 또는 쉼표로 가른 그림자 목록. 그림자 하나는 `inset` 하나까지 · 길이 2 ~ 4 개(이어서) · 색 하나까지다.
- `select` — `options` 를 함께 적고(`select` 에만) 기본값은 그 안에서.
- 기본값은 같은 타입 토큰의 **참조**여도 된다: `"{color.primary}"`. 없는 키 · 타입이 다른 키 · 도는 참조(`a → b → a`)는 거부된다.

**variant**

- 노드는 `variant` 를 고를 수 있고, 고를 수 있는 값은 테마가 컴포넌트마다 선언한다. 뷰는 `variant` 로 마크업을 가른다 —
  CSS 는 `[data-wb-variant='cards']` 로 겨냥한다.
- `hideProps` — 그 variant 에서 쓰지 않는 props. 속성 패널이 감춘다(예: 카드 목록에는 `columns` 가 없다). 그 컴포넌트의 prop
  이름만 적는다.
- **`Text` · `Divider` 에는 variants 를 선언할 수 없다** — 이 둘은 변형이 prop(`role` · `direction`)에서 오고 그 값이
  `data-wb-variant` 가 된다.
- **`RadioGroup` 의 `segment` · `CheckboxGroup` 의 `chip`** — 설계서가 쓰는 변형 이름이다(붙은 칸 세그먼트 · 칸마다 테두리인 체크 칩). 선언하지
  않으면 그 변형을 고른 노드에 lint 경고가 나고 그 테마의 `defaultVariant` 로 그려진다.
- **세로 `Divider`(`[data-wb-variant='vertical']`)에 백분율 높이(`min-height: 100%`)를 걸지 않는다** — 높이가 정해지지 않은
  부모에서 0 이 되어 선이 안 보인다. 한 줄 높이(`1.5em`)를 바닥으로 두고 `align-self: stretch`.

## sdk 범위

`sdk` 는 이 테마가 기대는 `@wirebound/theme-sdk` 의 판이다. 업로드할 때 wirebound 의 SDK 판과 견준다.

- `^1.4.0` — major 가 같고 1.4.0 이상(값 칸을 가진 `Field` 와 입력 조각 아홉이 든 판 — 그 아래는 구역 `zones` · `items` · `Zone` 이 든 1.3.0). **0.x 에서도 major 만 본다** — `^0.3.0` 은 `0.9.0` 을 받는다(npm 은 `<0.4.0` 으로 읽는다).
- `~1.3.0` — major.minor 가 같고 1.3.0 이상.
- `1.3.0` — 그 판만.

## 하지 않는 것

- **공유 런타임 모듈을 번들에 넣지 않는다** — `react` · `react/jsx-runtime` · `@wirebound/theme-sdk` 는 wirebound 가 한 벌
  준다. `build` 가 이 import 를 그 한 벌로 바꿔 쓴다. 다른 경로(예: `@wirebound/theme-sdk/dist/…`)로 SDK 를 들이거나 react 를
  다른 이름으로 들이면 두 벌이 되어 `Root` 가 «뷰 안에서만» 으로 던지고 모든 노드가 기본 뷰로 그려진다.
- **`theme.js` 에서 네트워크로 다른 스크립트 · CSS · 글꼴을 싣지 않는다** — 내보낸 설계서(HTML)는 오프라인에서 열린다. 필요한
  것은 npm 의존으로 번들에 넣거나 `assets/` 에 둔다.
- **CSS 의 자산은 `assets/` 아래 상대 경로로 가리킨다.** 절대 URL(`/fonts/…`) · 다른 서버의 URL 을 쓰지 않는다.
- 테마 CSS 가 에디터를 칠할 걱정은 하지 않아도 된다 — 캔버스는 iframe 이라 `body` · `button` · `*` 규칙이 그 안에만 걸린다.
