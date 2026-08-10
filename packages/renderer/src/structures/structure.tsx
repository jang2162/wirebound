/**
 * **구조 그룹.** `Page`·`Slot`·`Section`·`Flex`·`Grid`·`Card`·`Tabs`.
 *
 * 카탈로그의 `component/catalog/structure.ts`와 같은 경계다(P4b-2 D2). 이 모듈이 자기
 * 구조의 **등록**(`STRUCTURE_ENTRIES`)과 **기본 CSS**(`structureCssBlocks`)를 함께
 * 소유하므로, 이 그룹에 구조를 더하는 워커는 이 파일 하나만 만진다.
 *
 * 공용 도구(`nodeVar`·`componentRule`·`partRule`)는 `../structure-css-tools`에 있다.
 * **복사해 오지 마라** — 다섯 벌이 따로 썩는다.
 */
import type { CSSProperties } from 'react'
import { componentRule, nodeVar } from '../structure-css-tools'
import type { StructureEntry, StructureRenderer } from './registry'

/**
 * 커스텀 프로퍼티만 담은 `style` 객체. **일반 선언은 여기 들어오지 않는다**(D2) —
 * inline 일반 선언은 모든 셀렉터를 이겨 테마가 `!important` 없이는 지기 때문이다
 * (P0 이월 #7). 커스텀 프로퍼티는 그 자체로 아무것도 그리지 않으므로 캐스케이드에서
 * 이길 것이 없다 — 값을 나르는 통로일 뿐이다.
 *
 * `CSSProperties`에 커스텀 프로퍼티 자리가 없어 캐스팅한다.
 */
function vars(entries: Record<string, string>): CSSProperties {
  return entries as CSSProperties
}

export const PageDefault: StructureRenderer = ({ attrs, children }) => (
  <div {...attrs}>{children}</div>
)

export const SlotDefault: StructureRenderer = ({ attrs, slot }) => <div {...attrs}>{slot}</div>

export const SectionContained: StructureRenderer = ({ attrs, part, children }) => (
  <section {...attrs}>
    <div {...part('inner')}>{children}</div>
  </section>
)

/**
 * **폭을 가두지 않는 섹션. `contained`에서 `inner`가 통째로 없다** (재라 #1 — 왜 이 DOM인가).
 *
 * `contained`의 `inner`는 장식이 아니라 **테마가 `maxWidth`를 거는 자리**다(§6.4의
 * `container.max`가 그 값이다). 폭을 안 가두는 섹션에 그 자리를 남겨 두면 테마가 구조마다
 * `max-width: none`을 되돌려 써야 하고, 그러면 *"어느 쪽이 이겼는가"*가 다시 조용해진다 —
 * 이 저장소가 반복해 겪은 부류다(P4b-1 이월 5번의 침묵 덮어쓰기).
 *
 * **그래서 이것은 스킨이 아니라 구조다.** 조각 하나가 있고 없고가 갈리므로 CSS로는 흉내
 * 낼 수 없다.
 */
export const SectionFullBleed: StructureRenderer = ({ attrs, children }) => (
  <section {...attrs}>{children}</section>
)

/**
 * **배경이 갈린 섹션. 갈린 쪽이 조각(`band`)으로 있다** (재라 #1 — 왜 이 DOM인가).
 *
 * *"섹션의 절반만 다른 배경"*을 테마가 그리려면 **그 절반을 겨냥할 셀렉터가 있어야 한다.**
 * 오늘 테마가 스타일할 수 있는 것은 컴포넌트 루트와 `parts`뿐이고(§5.1) 의사 요소는 어휘에
 * 없다 — 즉 조각 없이는 표현할 방법이 **아예 없다.** CSS로 흉내 낼 수 있는 차이가 아니라
 * **없던 표현이 생기는 것**이므로 구조가 맞다(재라 #7).
 *
 * `band`는 빈 상자다. 무엇을 그릴지는 테마가 정한다(`bg`·`bgImage`·`bgGradient`가 §6.8에
 * 이미 있다) — 구현체는 색을 정하지 않는다.
 */
export const SectionSplitBg: StructureRenderer = ({ attrs, part, children }) => (
  <section {...attrs}>
    <div {...part('band')} />
    <div {...part('inner')}>{children}</div>
  </section>
)

export const FlexDefault: StructureRenderer = ({ attrs, props, children }) => (
  <div
    {...attrs}
    style={vars({
      [nodeVar('flex', 'direction')]: String(props.direction),
      [nodeVar('flex', 'align')]: String(props.align),
      [nodeVar('flex', 'justify')]: cssJustify(String(props.justify)),
      [nodeVar('flex', 'wrap')]: props.wrap === true ? 'wrap' : 'nowrap',
    })}
  >
    {children}
  </div>
)

export const GridDefault: StructureRenderer = ({ attrs, props, children }) => (
  // `display`·`grid-template-columns`는 `structure-css.ts`가 소유한다. 여기 있던
  // `gridTemplateColumns` inline 선언이 바로 옆의 커스텀 프로퍼티를 무력화하고 있었다
  // (P0 이월 #7이 *"옳은 패턴과 틀린 패턴이 같은 함수 안 세 줄 거리에 있다"*고 지목한 자리).
  <div {...attrs} style={vars({ [nodeVar('grid', 'columns')]: String(props.columns) })}>
    {children}
  </div>
)

export const CardPlain: StructureRenderer = ({ attrs, props, part, children }) => (
  <div {...attrs}>
    <div {...part('header')}>
      <div {...part('title')}>{String(props.title)}</div>
      {props.subtitle ? <div {...part('subtitle')}>{String(props.subtitle)}</div> : null}
    </div>
    <div {...part('body')}>{children}</div>
  </div>
)

export const TabsUnderline: StructureRenderer = ({ attrs, props, part, children }) => {
  const tabs = props.tabs as string[]
  const active = props.active as number
  return (
    <div {...attrs}>
      <div {...part('list')}>
        {tabs.map((label, index) => (
          <span key={`${label}-${index}`} {...part('tab')} aria-selected={index === active}>
            {label}
          </span>
        ))}
      </div>
      <div {...part('panel')}>{children}</div>
    </div>
  )
}

/**
 * `justify` prop 값 → CSS 값. **`between`만 바꾼다** (Task 2 Step 3이 재서 정한 것).
 *
 * 앞서 여기 `mapAlign`·`mapJustify` 둘이 있었고 `start`·`end`를 `flex-start`·`flex-end`로
 * 바꿨다. **그 변환을 걷어냈다.** 이유는 §6.0이 약속한 것이다 — 테마가 이 노드의
 * `display`를 `grid`로 덮을 수 있어야 하는데, `flex-start`는 flexbox를 전제한 이름이고
 * `start`는 상자 정렬(Box Alignment) 어느 문맥에서나 같은 뜻이다. 값을 나르는 통로가
 * 문맥을 가정하면 통로가 아니다.
 *
 * **`between`은 다르다 — CSS에 그 키워드가 없다.** `space-between`으로 바꾸지 않으면
 * 무효한 값이 되어 선언이 통째로 버려진다. 즉 여기 남은 변환은 *"스타일 취향"*이 아니라
 * *"어휘에 없는 값"*뿐이고, 그것이 이 함수가 하나만 남은 기준이다.
 *
 * **`align`에는 이 함수가 필요 없다** — `start`·`center`·`end`·`stretch`가 전부 CSS
 * 키워드 그대로다(카탈로그의 enum을 대조했다).
 */
function cssJustify(value: string): string {
  return value === 'between' ? 'space-between' : value
}

/**
 * 이 그룹이 등록하는 구조. `installStructures()`가 다섯 그룹의 것을 모은다.
 *
 * **구조를 더하면 여기에 한 줄을 더한다.** 다른 그룹의 파일도 `structures/index.ts`도
 * 만지지 않는다 — 그것이 P4b-2 ①이 이 배열을 가른 이유다.
 */
/**
 * 이 그룹의 구조가 서기 위한 최소 CSS. `structureBaseCss()`가 다섯 그룹의 것을 모은다.
 *
 * **규칙을 더하면 여기에 `blocks.push(…)` 한 줄을 더한다.** 다른 그룹의 CSS도
 * `structure-css.ts`도 만지지 않는다. 셀렉터를 손으로 쓰지 마라 — `componentRule`·
 * `partRule`만 쓴다(이유는 `structure-css.ts`의 캐스케이드 판정).
 *
 * **배열 안의 순서가 곧 우선순위다.** 있던 규칙 사이에 끼워 넣지 말고 뒤에 붙여라.
 */
export function structureCssBlocks(): string[] {
  const blocks: string[] = []

  // ── Flex ──────────────────────────────────────────────────────────────────
  //
  // **`start`/`end`를 그대로 싣고 `flex-start`로 바꾸지 않는다** (P4a-2 Task 2가 정한 것).
  // 근거는 §6.0의 약속이다 — 테마가 이 규칙의 `display`를 `grid`로 덮을 수 있어야 하는데,
  // `flex-start`는 flexbox 밖에서 뜻이 흐려지는 값이고 `start`는 상자 정렬(Box Alignment)
  // 어느 문맥에서나 같은 뜻이다. 변환이 필요한 것은 CSS에 대응 키워드가 없는
  // `between` → `space-between` 하나뿐이고, 그것은 아래 `cssJustify`가 한다.
  blocks.push(
    componentRule('Flex', 'default', [
      'display: flex;',
      `flex-direction: var(${nodeVar('flex', 'direction')}, row);`,
      `align-items: var(${nodeVar('flex', 'align')}, stretch);`,
      `justify-content: var(${nodeVar('flex', 'justify')}, start);`,
      `flex-wrap: var(${nodeVar('flex', 'wrap')}, nowrap);`,
    ]),
  )

  // ── Grid ──────────────────────────────────────────────────────────────────
  //
  // 열 수는 `repeat()` 안쪽에서만 쓰이므로 **트랙 목록 전체가 아니라 수 하나**를 나른다.
  // `GridDefault`가 이미 `--wb-grid-columns`를 내면서 바로 옆에 `grid-template-columns`를
  // inline으로 박아 무력화하고 있었다 — 옳은 절반이 이미 있었고 틀린 절반을 지운 것이다.
  blocks.push(
    componentRule('Grid', 'default', [
      'display: grid;',
      `grid-template-columns: repeat(var(${nodeVar('grid', 'columns')}, 1), 1fr);`,
    ]),
  )

  // ── Section:splitBg ───────────────────────────────────────────────────────
  //
  // **두 조각이 나란히 서야 "갈렸다"가 된다.** 규칙을 **루트에만** 둔다 — `partRule`은
  // 구조 이름을 넣지 않으므로(특이도 때문이다) `band`·`inner`에 달면 `contained`의
  // `inner`까지 받아 **오늘 화면이 바뀐다**(D5). `componentRule`은 구조 이름을 넣으므로
  // `splitBg`에만 닿는다.
  //
  // **어휘를 골라 썼다.** `display`·`gridColumns` 둘 다 `STYLE_PROPERTIES`에 있어
  // **테마가 이 두 줄을 그대로 덮을 수 있다.** `flex-grow`로 갈랐으면 대응 어휘가 없어
  // 되돌릴 길이 없는 선언이 된다 — 그것은 구조가 아니라 강요다.
  blocks.push(
    componentRule('Section', 'splitBg', ['display: grid;', 'grid-template-columns: 1fr 1fr;']),
  )

  return blocks
}

export const STRUCTURE_ENTRIES: StructureEntry[] = [
  ['Page', 'default', PageDefault],
  ['Slot', 'default', SlotDefault],
  ['Section', 'contained', SectionContained],
  ['Section', 'fullBleed', SectionFullBleed],
  ['Section', 'splitBg', SectionSplitBg],
  ['Flex', 'default', FlexDefault],
  ['Grid', 'default', GridDefault],
  ['Card', 'plain', CardPlain],
  ['Tabs', 'underline', TabsUnderline],
]
