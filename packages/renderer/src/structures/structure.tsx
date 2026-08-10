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
import { nodeVar } from '../structure-css'
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
export const STRUCTURE_ENTRIES: StructureEntry[] = [
  ['Page', 'default', PageDefault],
  ['Slot', 'default', SlotDefault],
  ['Section', 'contained', SectionContained],
  ['Flex', 'default', FlexDefault],
  ['Grid', 'default', GridDefault],
  ['Card', 'plain', CardPlain],
  ['Tabs', 'underline', TabsUnderline],
]
