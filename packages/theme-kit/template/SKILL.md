---
name: wirebound-theme
description: wirebound 설계서 테마를 짠다 — 컴포넌트 뷰(tsx) · CSS · 토큰 · variant 를 이 프로젝트에서 고치고 `.wbtheme` 로 빌드할 때 읽는다.
---

# wirebound 테마 작성 지침

이 프로젝트는 wirebound 설계서의 **테마**다. 설계서의 페이지는 컴포넌트 노드의 트리이고(카탈로그 36 종 — `Page` · `Popup` ·
`Section` · `Flex` · `Grid` · `Card` · `Tabs` · `TabPanel` · `DataGrid` · `GridColumnGroup` · `GridColumn` · `GridRow` · `GridCell` ·
`Pagination` · `Tree` · `KeyValue` · `SearchForm` · `EntryForm` · `FormTable` · `Field` ·
`Input` · `TextArea` · `Select` · `DateInput` · `TimeInput` · `CheckboxGroup` · `RadioGroup` · `Chip` · `Affix` · `FileAttach` · `Button` ·
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
npm run dev        # 미리보기 — «컴포넌트»(모든 컴포넌트 × variant 표본을 그룹별 격자로) · «예제 페이지»(이어진 관리자 화면). 뷰 · CSS 는 고치면 바로 반영된다
npm run build      # 검증 → dist/<id>-<version>.wbtheme
npm run typecheck
```

- `dev` 의 셸: 뷰포트 프리셋(1920 · 1440 · 1280 · 1024 · 768 · 375 — 갤러리가 그 폭으로 그려져 `@media` 가 그 폭으로 걸린다),
  토큰 패널(manifest 의 토큰으로 자동), «겹쳐 보기»(에디터가 노드를 골랐을 때의 외곽선과 코멘트 번호 자리), manifest 이슈 목록,
  보기 전환(«컴포넌트» · «예제 페이지» — wirebound 의 테마 미리보기와 같은 둘)과 예제의 장 이름 줄.
- `build` 는 manifest 를 업로드와 **같은 함수**로 검증한다. 이슈가 있으면 이유를 줄마다 찍고 파일을 만들지 않는다. 결과
  파일을 wirebound 관리자 화면에서 올린다.
- 같은 `id@version` 은 다시 올릴 수 없다 — 고쳤으면 `version` 을 올린다.

## 뷰 계약

```tsx
import { Focus, Root, useToken, view } from '@wirebound/theme-sdk'

export const CardView = view(({ props, variant, states, children }) => {
  const density = useToken('density')
  return (
    <Root as="section" className={`card card--${density}`} marker={{ placement: 'top-end', offset: [4, -8] }}>
      <header>{String(props.title ?? '')}</header>
      <Focus>{variant === 'cards' ? <div className="cards">…</div> : <table>…</table>}</Focus>
    </Root>
  )
})
```

- 뷰가 받는 것: `props`(기본값이 채워진 카탈로그 props) · `states`(`disabled` · `loading` 처럼 참인 상태 이름들) ·
  `variant`(노드의 variant — 테마에 없는 값이면 그 컴포넌트의 `defaultVariant`) · `children`(이미 그린 몸통의 자식) · `zones`(이름 붙은
  구역마다 그린 것 — 빈 구역은 `null`) · `items`(몸통 자식 하나씩 — `{ nodeId, type, index, props, element, content, items, copy }`) ·
  `zoneItems`(이름 붙은 구역의 자식 하나씩 — 구역 이름 → `items` 와 같은 꼴) ·
  `nodeId` · `type` · `field`(`Field` 값 칸의 입력 조각일 때만 — `{ name, required }`: 조각이 하나면 라벨, 여럿이면 «라벨 + 별칭(없으면 차례)».
  입력 조각의 뷰를 지으면 `name` 을 접근 이름(`aria-label`)으로, `required` 면 `aria-required` 를 단다 — 입력 칸만 훑는 보조 기술은 필드의
  묶음 이름을 지나지 않는다).
- **구역은 `<Zone name>` 으로 둔다.** 카드의 제목 옆(`titleSide`) · 머리 오른쪽(`headEnd`) · 바닥(`footer`), 검색폼 · 입력폼의 단추
  (`actions`), 그리드의 머리 왼쪽 · 오른쪽(`headStart` · `headEnd`) · 행(`rows`) · 바닥(`footer`)은 사람이 놓는 노드가 든 자리다 — `<Zone name="footer" as="div"
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
    은 늘 `data-wb-<prop>="<값>"` — `Section` 의 `data-wb-compact`(좁은 여백) · `SearchForm` 의 `data-wb-collapsed`(접힘) · `DataGrid` 의
    `data-wb-select` · `GridColumn` 의 `data-wb-required` · `data-wb-align` · `data-wb-size` · `data-wb-sort` · `data-wb-tone` ·
    `data-wb-numbering` · `GridRow` 의 `data-wb-kind` · `data-wb-tone` · `Pagination` 의 `data-wb-size-select` · `data-wb-range` ·
    `Media` 의 `data-wb-kind` · `data-wb-ratio` · `Flex` 의 `data-wb-direction` ·
    `data-wb-align` · `data-wb-justify` · `data-wb-wrap` · `Input` 의 `data-wb-kind` · `data-wb-size` · `Select` 의 `data-wb-size` ·
    `Chip` 의 `data-wb-removable` · `Affix` 의 `data-wb-tone`.
  - 상태(`data-wb-state~='disabled'`)가 참이면 `aria-disabled` · `loading` 은 `aria-busy` · `invalid` 는 `aria-invalid` · `required` 는
    `aria-required` 가 `"true"` 로 선다. 그 뜻을 안쪽 요소로 옮기려면 `Root` 에 같은 이름(`undefined`)을 넘긴다.
    `readonly` 는 `aria-readonly` 다. 입력 조각(`Input` · `Select` …)의 뷰는 루트에 역할(`textbox` · `combobox` 등)과 이름을 달아 그 속성이
    읽히게 한다. `Field` 의 뿌리는 `group` 이라 `aria-required` 를 받는 역할이 아니다 — 기본 `Field` 뷰는 그것을 거두고(필수는 값 칸 조각이 `field.required` 로 `aria-required` 를 단다) 필수를 라벨의
    별(`data-wb-state~='required'`)로 보인다.
- **`Field` 는 라벨과 값 칸이다.** 값 칸(몸통 — `children`)에 입력 조각이 줄 선다. 뷰는 `label` 조각과 `value` 조각(그 안에 `children`)을
  형제로 둔다 — `children` 을 안 그리면 값 칸의 조각이 화면에서 사라지고 `wb-theme check` 가 막는다. 조각의 몫(`--wb-node-weight`)은 SDK 기본
  CSS 가 `flex` 로 건다. **두 조각은 뿌리의 직계로 그린다** — 폼 표(`FormTable`)는 쌍 격자라 SDK 기본 CSS 가 칸의 `Field` 뿌리를 subgrid 로 두고
  두 조각을 라벨 칸 · 값 칸 트랙에 놓는다. 감싸는 요소를 끼우면 두 조각이 한 칸에 몰리고 `wb-theme check` 가 막는다. 열을 정한 `SearchForm` 의
  기본 CSS 는 필드 하나를 칸 하나에 깐다 — 라벨 왼쪽 쌍 격자로 꾸미려면 테마 CSS 가 트랙 · 자식 폭(`span calc(2 * var(--wb-node-weight, 1))`) ·
  subgrid 를 건다(기본테마가 그렇다).
- **`FormTable` 은 라벨|값 표다.** 한 줄에 쌍을 `columns` 개 놓고 자식의 몫(`items[i].span`)이 차지할 쌍 수다. 줄 끝 · 넓은 칸이 남긴 구멍의 빈 쌍은
  뷰가 그린다 — `pairRows(items, columns)`(SDK)가 자식과 빈 쌍(`filler` — `label` · `value` 두 조각, 노드가 아니다)의 차례를 준다. `cells` 조각에는
  `formTableCellsAttrs(columns)` 를 편다. **칸과 빈 쌍은 `cells` 조각의 직계로 그린다** — 쌍 격자는 `cells` 의 직계 상자를 트랙에 놓는다(감싸는
  요소를 끼우거나 빈 쌍을 `cells` 밖에 두거나 조각 이름을 바꾸면 격자가 깨진다). `cells` 조각이 없거나 · 칸 · 빈 쌍이 그 직계가 아니거나 · 빈 쌍에
  두 조각이 없거나 · 빈 쌍 수가 그 셈과 다르면 `wb-theme check` 가 막는다. 라벨 칸 폭은 `--wb-form-labelWidth` 로 싣는다.
  - CSS 는 `[data-wb-component='Section'][data-wb-compact] { … }` 처럼 겨냥한다. 기본 뷰도 그 값으로 모양을 바꾼다(접힌 검색은
    머리줄 `toggle` 조각만 남고 자식이 빠진다 · 그리드의 `select` 는 선택 칸) — 테마 CSS 가 여백 · 색을 정한다.
- **`DataGrid` 는 열 노드 × 행 노드다.** 몸통이 열(`GridColumn` — 머리 칸 + 셀 틀 · `GridColumnGroup` — 병합 머리)이고 «행» 구역이 행
  (`GridRow` — 되풀이 수 · 행 꼴, 칸 `GridCell` 을 가지면 제 칸)이다. 그리드 뷰가 `gridLayout(items, zoneItems.rows, props)`(SDK)로 머리 줄 ·
  몸 줄을 셈해 `<GridProvider value={layout}>` 로 내리고, **행 · 열 · 칸 뷰는 `useGridRow(nodeId)` · `useGridHead(nodeId)` ·
  `useGridCell(nodeId)` 로 제 몫을 읽는다** — 뷰가 받은 `nodeId` 를 그대로 넘긴다(뷰 함수의 몸은 제 노드 문맥 밖에서 돈다). 되풀이 줄의 둘째부터는
  사본이다 — 행 뷰는 `<Root as="tr" copy>` 로, 셀 틀 · 제 칸은 `item.copy(줄 번호)` 로 그린다(사본은 `data-wb-id` 대신 `data-wb-copy-of` — 에디터가 사본을 누르면 원본을 고른다). 셀 틀 · 번호 칸(`td`)에는
  `data-wb-column-of="<열 노드 id>"` 를 단다 — 칸 안의 사본 노드를 누르면 그 줄의 행이 골라진다(없으면 그 셀 틀 노드가 골라진다) · 첫 줄 칸의 빈 자리에 끌어 놓으면 그 열 셀 틀의 끝이다. 머리 칸 ·
  칸의 `colSpan` · `rowSpan` 을 빠뜨리거나 칸을 빼거나 `Root` 를 줄마다 그리면 `wb-theme check` 가 막는다. 표는 `scroll` 조각 안에 두고
  `table` 조각에 `dataGridTableAttrs(layout)` 를 편다 — 결과 머리줄 · 바닥은 스크롤 밖이다.
- **`Tree` 는 항목의 중첩 목록이다**(SDK 1.9.0). `items` 는 `{ label, open?, children? }` 의 중첩 배열이다. 항목마다 `item` 조각(`li`) 안에
  `node` 조각(한 줄 — `toggle` 표지 · `label` 이름)을 두고, 펼친 항목(`open: true` 이고 자식이 있다)이면 그 밑에 `children` 조각(같은 꼴의 `ul`)을
  그린다 — 접힌 항목의 자식은 안 그린다. 자식이 있는 항목의 `item` 에 `data-wb-open`(`true` · `false`)이 선다. 들여쓰기는 `children` 조각에 `--wb-tree-indent`
  로 건다(SDK 기본 CSS — 중첩 `ul` 의 UA 여백을 걷는다).
- **`FileAttach` 는 단추 줄 · 파일 목록 표 · 한도 글이다**(SDK 1.8.0). «단추» 구역(`<Zone name="actions">`)을 그리고, 목록은 `list` 조각의
  `<table>` 하나 — 머리 칸은 `th scope="col"` 셋(□ · 파일이름 · 파일크기)이다. 파일마다 `file` 조각(한 줄 — `fileName` · `fileSize` 칸), 목록이
  비면 `drop` 조각(`hint` 글) 한 줄만 그린다. 한도 글은 `limit` 조각 안에 «최대 {maxFiles}개 {maxSize} 제한» 이고 두 값을 `limitCount` · `limitSize`
  조각으로 감싼다(개수가 0 이면 개수 조각 · 크기가 비면 크기 조각이 없고, 둘 다 없으면 `limit` 째 없다). 파일 줄 수 · 빈 목록 안내 · 한도 조각 · 표
  머리가 이와 다르면 `wb-theme check` 가 막는다. 조각 이름과 자리도 잰다 — `file` 줄은 `list` 표 몸통의 `tr`(표 밖 형제는 열 머리와 안 이어진다), 줄마다
  `check` 칸 안 `checkbox` 하나와 그 파일의 이름 · 크기를 든 `fileName` · `fileSize` 칸, 머리 줄의 `checkHead` 칸 안 `checkbox` 하나, 목록 표 밖의
  `actions` 조각 하나(«단추» 구역 상자이거나 그것을 품는다). 체크는 그림이다(`<input>` 이 아니다 — 포커스 받는 요소를 늘리지 않는다 · `checkbox` 조각
  안의 꺼지지 않은 입력 칸은 `check` 가 포커스 경고로 낸다). 값 칸 안이면 `field.name` 을 뿌리(`group`)의 이름으로 단다.
- **`Popup` 은 팝업 페이지의 뿌리다**(`Page` 와 함께 뿌리에만 선다). 뿌리는 `role="dialog"` 이고 `aria-labelledby` 로 `title` 조각
  (`props.title`)을 가리킨다. 조각: `titlebar` · `title` · `close`(✖ — `<button>` 에 접근 이름) · `body`(몸통 `children` 의 그릇 — 뿌리의
  **직계**) · «바닥» 구역(`<Zone name="footer" data-wb-part="footer" />` — `body` **밖**). 다른 페이지가 «팝업 열기» 로 열면 wirebound 가 덮개 위에
  상자를 세우고, 상자 안의 `close` 조각으로 닫으며 `body` 조각만 굴린다(제목줄 · 바닥은 그대로 보인다 — 굴림 규칙이 뿌리의 직계 `body` 에만
  걸리므로 감싸는 요소를 끼우지 않는다) — `close` 가 하나의 단추가 아니거나 · 이름이 제목이 아니거나 · 몸통이 `body` 밖이거나 · 바닥이 `body`
  안이거나 · `body` 가 뿌리의 직계가 아니면 `wb-theme check` 가 막는다. 크기는 표지 `data-wb-size`(`small` · `medium` · `large`)다.
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
- **`Placeholder` 는 사람이 정한 그리기 값(크기 · 바탕 · 테두리 색 · 모서리 · 글 색 · 글 크기 · 여백)을 따른다.** 제 뷰로 그리면
  `placeholderVars(props)` 를 `Root` 의 `style` 에 싣는다 — 값이 `--wb-node-placeholder-<이름>`(`width` · `height` · `background` ·
  `border-color` · `radius` · `font-size` · `padding` · `color`) 변수로 선다. CSS 는 그 변수를 대체값과 함께 읽는다
  (`background: var(--wb-node-placeholder-background, <테마의 바탕>)`). 변수를 안 읽고 덮으면 사람이 고른 색이 이 테마에서 사라진다 —
  `wb-theme check` 가 뷰가 변수를 싣는지, `wb-theme shots` 가 계산된 색이 정한 값인지 잰다. 테두리 꼴 · 정렬은 표지
  (`data-wb-border` · `data-wb-align`)다. 몸통(자식)이 있으면 라벨 대신 몸통을 그린다.
- **`Placeholder` 의 그림은 `useAsset(props.image)` 로 주소를 받는다** — 그림 id(그 바이트의 sha256)를 그리는 자리마다 다른 주소로 바꾼다
  (에디터 캔버스 · 내보낸 번들 · 갤러리). `null` 이면 그 자리에서 읽을 수 없는 그림이니 «그림 없음» 표지를 그린다. 기본 뷰는
  `<img data-wb-part="image">` 이고 `imageFit` 은 표지(`data-wb-image-fit` — `cover` · `contain`)다. 그림이나 몸통이 있으면 라벨은 안 선다.

## 토큰

- `useToken('키')` — 토큰의 지금 값(참조를 따라간 값). 마크업을 바꾸는 토큰(대개 `select` · `number`)에 쓴다. 값이 바뀌면
  그 토큰을 읽은 뷰가 다시 그려진다.
- 모든 토큰은 CSS 변수로도 실린다 — `--wb-<키의 . 을 - 로>`(`color.primary` → `var(--wb-color-primary)`). 색 · 길이처럼
  CSS 로 충분한 것은 CSS 에서 변수로 쓴다.
- **`useWindow()` 를 쓴다 — 전역 `window` · `document` 를 쓰지 않는다.** 에디터 캔버스에서 테마는 iframe 안에서 그려지고, 전역
  `window` 는 에디터 창이다(폭 · `matchMedia` · 이벤트가 다른 창의 것이 된다).

## manifest

`theme.config.ts` 의 `defineManifest({ … })`. `build` 가 검증한다 — 아래 규칙을 어기면 이유와 자리(`components.DataGrid.variants.1`)를
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
- **판을 올리며 토큰을 더해 옛 키가 칠하던 자리를 나눠 가지면, 새 키의 기본값은 그 옛 키의 참조로 둔다**(글 색을 나눈 «글자(짙게)» 는 `"{color.text}"`).
  옛 판에서 옛 키를 덮은 프로젝트가 판을 올리면 덮은 값은 옛 키에만 이어지고 새 키는 기본값으로 선다 — 리터럴이면 그 자리만 덮은 색과 어긋난다
  (어두운 바탕에 짙은 제목 글).

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

- `^1.6.0` — major 가 같고 1.6.0 이상(폼 표 `FormTable` — `pairRows` · `formTableCellsAttrs` · `ViewItem.span` — 이 든 판 — 그 아래는 자리표시자의 그리기 값 `placeholderVars` 와 그림 `useAsset` 이 든 1.5.0). **0.x 에서도 major 만 본다** — `^0.3.0` 은 `0.9.0` 을 받는다(npm 은 `<0.4.0` 으로 읽는다).
- `~1.6.0` — major.minor 가 같고 1.6.0 이상.
- `1.6.0` — 그 판만.

## 하지 않는 것

- **공유 런타임 모듈을 번들에 넣지 않는다** — `react` · `react/jsx-runtime` · `@wirebound/theme-sdk` 는 wirebound 가 한 벌
  준다. `build` 가 이 import 를 그 한 벌로 바꿔 쓴다. 다른 경로(예: `@wirebound/theme-sdk/dist/…`)로 SDK 를 들이거나 react 를
  다른 이름으로 들이면 두 벌이 되어 `Root` 가 «뷰 안에서만» 으로 던지고 모든 노드가 기본 뷰로 그려진다.
- **`theme.js` 에서 네트워크로 다른 스크립트 · CSS · 글꼴을 싣지 않는다** — 내보낸 설계서(HTML)는 오프라인에서 열린다. 필요한
  것은 npm 의존으로 번들에 넣거나 `assets/` 에 둔다.
- **CSS 의 자산은 `assets/` 아래 상대 경로로 가리킨다.** 절대 URL(`/fonts/…`) · 다른 서버의 URL 을 쓰지 않는다.
- **배치(여백 · 크기 · 표시)를 바꾸는 CSS 규칙을 형제 구조(`+` · `~` · `:first-child` · `:last-child` · `:only-child` · `:nth-*` · `:has()` ·
  `:empty`)로 가르지 않는다** — 흔한 `* + * { margin-top: … }` 가 그 꼴이다. 에디터는 끄는 동안 배치 미리보기를 `display: none` 으로 숨긴 배치로
  놓을 자리를 재는데 형제 셀렉터는 숨긴 요소도 형제로 센다 — 미리보기가 선 자리마다 숨긴 배치가 달라지면 같은 포인터에서 답이 뒤집혀 캔버스가 멈춘다.
  쌓인 노드 사이의 틈은 노드마다 **자기 아래**(`margin-bottom`)로 준다. 색 · 모서리처럼 그림만 바꾸는 규칙은 형제 구조로 갈라도 된다.
- 테마 CSS 가 에디터를 칠할 걱정은 하지 않아도 된다 — 캔버스는 iframe 이라 `body` · `button` · `*` 규칙이 그 안에만 걸린다.
