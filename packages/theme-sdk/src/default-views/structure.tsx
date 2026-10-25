/** **구조 그룹 기본 뷰.** `Page`·`Slot`·`Section`·`Flex`·`Grid`·`Card`·`Tabs`·`TabPanel`. 옮긴 규칙은 `./index.ts` 머리말. */
import type { CSSProperties } from 'react'
import { componentRule, nodeVar, partRule, WEIGHT_VAR, zeroRule } from '../css-tools'
import { view } from '../define'
import { Root } from '../root'
import { Zone } from '../zone'

/**
 * 커스텀 프로퍼티만 담은 `style`. **일반 선언을 넣지 마라** — inline 일반 선언은 모든 셀렉터를 이겨 테마가
 * `!important` 없이는 진다. 커스텀 프로퍼티는 값을 나르기만 한다.
 */
function vars(entries: Record<string, string>): CSSProperties {
  return entries as CSSProperties
}

/** `between` 만 바꾼다 — CSS 에 그 키워드가 없다. `start`·`end` 는 테마가 `display` 를 grid 로 덮어도 같은 뜻이라 그대로 둔다. */
function cssJustify(value: string): string {
  return value === 'between' ? 'space-between' : value
}

export const PageView = view(({ children }) => (
  <Root as="div" data-wb-structure="default">
    {children}
  </Root>
))

export const SlotView = view(({ slot }) => (
  <Root as="div" data-wb-structure="default">
    {slot}
  </Root>
))

// 기본 구조 `contained` — `inner` 는 테마가 `maxWidth` 를 거는 자리다.
export const SectionView = view(({ children }) => (
  <Root as="section" data-wb-structure="contained">
    <div data-wb-part="inner">{children}</div>
  </Root>
))

export const FlexView = view(({ props, children }) => (
  <Root
    as="div"
    data-wb-structure="default"
    style={vars({
      [nodeVar('flex', 'direction')]: String(props.direction),
      [nodeVar('flex', 'align')]: String(props.align),
      [nodeVar('flex', 'justify')]: cssJustify(String(props.justify)),
      [nodeVar('flex', 'wrap')]: props.wrap === true ? 'wrap' : 'nowrap',
    })}
  >
    {children}
  </Root>
))

export const GridView = view(({ props, children }) => (
  // `grid-template-columns` 를 inline 으로 두지 마라 — 옆의 커스텀 프로퍼티를 무력화하고 테마까지 이긴다.
  <Root as="div" data-wb-structure="default" style={vars({ [nodeVar('grid', 'columns')]: String(props.columns) })}>
    {children}
  </Root>
))

// 기본 구조 `plain`. 머리줄(`header`)은 제목 · 부제 · 제목 옆 · 머리 오른쪽 가운데 하나라도 있으면 선다 — 다 비면 머리줄째 없다.
export const CardView = view(({ props, children, zones }) => {
  const title = String(props.title)
  const subtitle = String(props.subtitle)
  const header = title !== '' || subtitle !== '' || zones.titleSide != null || zones.headEnd != null
  return (
    <Root as="div" data-wb-structure="plain">
      {header ? (
        <div data-wb-part="header">
          <div data-wb-part="heading">
            {title !== '' ? <div data-wb-part="title">{title}</div> : null}
            <Zone name="titleSide" data-wb-part="titleSide" />
          </div>
          {subtitle !== '' ? <div data-wb-part="subtitle">{subtitle}</div> : null}
          <Zone name="headEnd" data-wb-part="headEnd" />
        </div>
      ) : null}
      <div data-wb-part="body">{children}</div>
      <Zone name="footer" data-wb-part="footer" />
    </Root>
  )
})

// 기본 구조 `underline`. 탭 머리는 몸통의 패널마다(`items` — 지금 보이는 패널) 그 패널의 뿌리 요소(`TabPanelView`)를 감싸 둔다 — 탭 머리를
// 누르면 그 패널이 골라진다. 패널 칸은 지금 패널의 내용이다: `active` 자리의 패널, 그 패널이 숨었거나 없으면 보이는 첫 패널.
export const TabsView = view(({ props, items }) => {
  const active = items.find((item) => item.index === props.active) ?? items[0]
  return (
    <Root as="div" data-wb-structure="underline">
      <div data-wb-part="list">
        {items.map((item) => (
          <span key={item.nodeId} data-wb-part="tab" aria-selected={item === active}>
            {item.element}
          </span>
        ))}
      </div>
      <div data-wb-part="panel">{active?.content ?? null}</div>
    </Root>
  )
})

// 탭 하나 — 뿌리는 탭 머리의 글이다. 내용은 부모 `Tabs` 의 뷰가 패널 칸에 둔다(`ViewItem.content`).
export const TabPanelView = view(({ props }) => <Root as="span">{String(props.label)}</Root>)

/** 순서가 곧 캐스케이드 순서다 — 같은 특이도의 규칙끼리는 뒤의 것이 이긴다. 끼워 넣지 말고 뒤에 붙인다. */
export function structureCssBlocks(): string[] {
  return [
    componentRule('Flex', 'default', [
      'display: flex;',
      `flex-direction: var(${nodeVar('flex', 'direction')}, row);`,
      `align-items: var(${nodeVar('flex', 'align')}, stretch);`,
      `justify-content: var(${nodeVar('flex', 'justify')}, start);`,
      `flex-wrap: var(${nodeVar('flex', 'wrap')}, nowrap);`,
    ]),
    componentRule('Grid', 'default', ['display: grid;', `grid-template-columns: repeat(var(${nodeVar('grid', 'columns')}, 1), 1fr);`]),
    // `Card` 의 기본 구조(`plain`)에는 `media` 조각이 없어 기본 뷰에는 닿지 않는다. 테마 뷰가 `media` 조각을 내면
    // 받는다 — 빈 상자에 높이를 준다.
    partRule('Card', 'media', ['aspect-ratio: 16 / 9;']),
    // 카드 머리줄 — 제목(제목 옆을 품은 줄)과 부제는 왼쪽 칸, 머리 오른쪽은 오른쪽 칸(두 줄에 걸친다). 바닥 단추줄은 오른쪽 정렬이다.
    zeroRule('[data-wb-component="Card"] > [data-wb-part="header"]', [
      'display: grid;',
      'grid-template-columns: minmax(0, 1fr) auto;',
      'column-gap: 8px;',
      'align-items: center;',
    ]),
    zeroRule('[data-wb-component="Card"] > [data-wb-part="header"] > [data-wb-part="heading"]', [
      'display: flex;',
      'align-items: center;',
      'gap: 6px;',
    ]),
    zeroRule('[data-wb-component="Card"] > [data-wb-part="header"] > [data-wb-part="subtitle"]', ['grid-column: 1;']),
    zeroRule('[data-wb-component="Card"] > [data-wb-part="header"] > [data-wb-part="headEnd"]', [
      'grid-column: 2;',
      'grid-row: 1 / span 2;',
      'display: flex;',
      'align-items: center;',
      'gap: 6px;',
    ]),
    zeroRule('[data-wb-component="Card"] > [data-wb-part="footer"]', ['display: flex;', 'justify-content: flex-end;', 'gap: 6px;']),
    // 가둔 칼럼을 가운데 둔다 — 테마가 `maxWidth` 만 걸고 가로 여백을 빠뜨려도 칼럼이 왼쪽에 붙지 않는다.
    partRule('Section', 'inner', ['margin-inline: auto;'], ['contained']),
    // 좁은 여백(`compact`). 테마는 제 여백 규칙을 `[data-wb-compact]` 로 덮는다 — 이 둘은 테마가 없는 판의 모양이다.
    zeroRule('[data-wb-component="Section"]', ['padding-block: 24px;']),
    zeroRule('[data-wb-component="Section"][data-wb-compact]', ['padding-block: 8px;']),
    // **노드 몫**(`WbNode.weight` — `Root` 가 `--wb-node-weight` 로 싣는다). 셋 다 특이도 0 이라 테마가 같은 속성을 걸면 테마가 이긴다.
    // ① 상속을 끊는다 — 커스텀 프로퍼티는 자손에 물려져, 몫을 준 `Card` 안의 `Flex` 자식이 그 몫을 받아 함께 늘어난다. 모든 노드 뿌리에서
    //    초기화하고(`initial` 은 «값 없음» 이라 아래 `var()` 가 기본값으로 간다) 몫이 있는 노드만 인라인으로 싣는다(인라인이 이긴다). 그리드 되풀이
    //    행의 사본 노드는 `data-wb-id` 대신 `data-wb-copy-of` 를 싣는다 — 둘 다 뿌리다(안 걸면 사본 줄만 부모 몫을 물려받는다).
    zeroRule('[data-wb-id], [data-wb-copy-of]', [`${WEIGHT_VAR}: initial;`]),
    // ② `Flex` — 몫이 있으면 `flex: <몫>`(= `<몫> 1 0%`). 바탕 폭을 0 으로 두어야 형제의 폭이 몫의 비가 된다 — `flex-grow` 만 바꾸면 남는
    //    폭만 나눠, 내용 · `width: 100%`(표) 가 다른 형제끼리는 비가 안 선다. 몫이 없으면 flex 항목의 기본값(`0 1 auto`) 그대로다.
    zeroRule('[data-wb-component="Flex"] > *', [`flex: var(${WEIGHT_VAR}, 0 1 auto);`]),
    // ③ `Grid` — 몫이 차지할 칸 수다. 부모 열 수로 자른 값을 렌더러가 싣는다(`packages/renderer/src/render.tsx` 의 `weightRoom`) — CSS 의
    //    `span min(몫, 열 수)` 는 열 수를 상속으로만 읽어, 자식이 `Grid` 면 제 열 수로 잘린다.
    zeroRule('[data-wb-component="Grid"] > *', [`grid-column: span var(${WEIGHT_VAR}, 1);`]),
  ]
}
