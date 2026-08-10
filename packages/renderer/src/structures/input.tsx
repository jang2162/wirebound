/**
 * **입력 그룹.** `SearchForm`·`EntryForm`·`Field`.
 *
 * 카탈로그의 `component/catalog/input.ts`와 같은 경계다(P4b-2 D2). 등록(`INPUT_ENTRIES`)과
 * 기본 CSS(`inputCssBlocks`)를 이 파일이 소유한다. 공용 도구는 `../structure-css-tools`에
 * 있다 — 복사해 오지 마라.
 */
import { Children, type ReactNode } from 'react'
import type { StructureEntry, StructureRenderer } from './registry'

/**
 * 자식 **하나하나**를 조각으로 감싼다. 자식이 없으면 아무것도 내지 않는다.
 *
 * `renderNode`가 자식을 `Fragment`의 배열로 만들어 넘기므로(`render.tsx`), `Children.map`이
 * 그것을 원소 단위로 훑는다. 배열을 손으로 순회하지 않는 이유는 `children`이 배열이 아닐
 * 수도 있어서다 — 자식이 없으면 `null`이다.
 *
 * **키를 주지 않는다.** `Children.map`이 원소마다 접두어 붙은 키를 만들어 준다.
 */
function wrapEach(children: ReactNode, wrapper: { 'data-wb-part': string }): ReactNode {
  return Children.map(children, (child) => <div {...wrapper}>{child}</div>)
}

export const SearchFormInline: StructureRenderer = ({ attrs, part, children }) => (
  <form {...attrs}>
    <div {...part('fields')}>{children}</div>
    <div {...part('actions')}>
      <span>조회</span>
      <span>초기화</span>
    </div>
  </form>
)

/**
 * **한 줄에 한 필드.** `inline`과 갈리는 것은 딱 하나 — 자식 하나마다 `row` 조각이 나온다.
 *
 * **왜 그것이 CSS가 아니라 DOM인가** (계획서 "재라 #1"이 각 워커에게 넘긴 판정):
 * 세로로 쌓는 것 자체는 `flex-direction: column`이면 되고 DOM이 필요 없다. 그런데
 * **테마가 겨냥할 수 있는 것은 `parts`뿐이다**(§6.5 — 테마는 자식 컴포넌트를 직접 겨냥하는
 * 셀렉터를 쓸 수 없다). 줄이 조각으로 나오지 않으면 *"줄 사이에 구분선"*·*"줄마다 좌우
 * 여백"* 같은 것을 테마가 표현할 방법이 **아예 없다.** 즉 여기서 늘어나는 것은 모양이
 * 아니라 **테마의 어휘**이고, 그것은 CSS로 대신할 수 없다.
 *
 * `inline`에는 줄이 없다 — 필드가 한 줄에 흐르므로 겨냥할 "줄"이라는 것이 존재하지 않는다.
 */
export const SearchFormStacked: StructureRenderer = ({ attrs, part, children }) => (
  <form {...attrs}>
    <div {...part('fields')}>{wrapEach(children, part('row'))}</div>
    <div {...part('actions')}>
      <span>조회</span>
      <span>초기화</span>
    </div>
  </form>
)

export const EntryFormLabelLeft: StructureRenderer = ({ attrs, props, part, children }) => (
  <form {...attrs}>
    {props.title ? <div {...part('label')}>{String(props.title)}</div> : null}
    <div {...part('row')}>{children}</div>
    <div {...part('actions')}>
      <span>저장</span>
      <span>취소</span>
    </div>
  </form>
)

export const FieldOutlined: StructureRenderer = ({ attrs, props, part }) => (
  <div {...attrs}>
    <label {...part('label')}>{String(props.label)}</label>
    {/* `data-control`은 없어졌다 — `control`이 `data-wb-variant`로 루트에 나간다.
        조각이 아니라 루트에 붙으므로 테마는 `[data-wb-variant="select"] [data-wb-part="control"]`로
        같은 자리를 겨냥한다. */}
    <div {...part('control')}>
      {String(props.placeholder) || ' '}
    </div>
  </div>
)

/**
 * 이 그룹의 구조가 서기 위한 최소 CSS. **오늘은 비어 있다** — `SearchForm`·`EntryForm`·
 * `Field`는 값을 나르는 노드 변수가 없다.
 *
 * 빈 함수를 지우지 않는 것은, 이 그룹의 워커가 규칙이 필요해졌을 때 **어디에 넣을지
 * 찾지 않게** 하려는 것이다. 규칙을 더하면 여기에 `blocks.push(…)`를 더한다.
 * 셀렉터를 손으로 쓰지 마라 — `componentRule`·`partRule`만 쓴다.
 */
export function inputCssBlocks(): string[] {
  return []
}

/** 이 그룹이 등록하는 구조. 구조를 더하면 여기에 한 줄을 더한다(파일 끝에 둔다 — TDZ). */
export const INPUT_ENTRIES: StructureEntry[] = [
  ['SearchForm', 'inline', SearchFormInline],
  ['SearchForm', 'stacked', SearchFormStacked],
  ['EntryForm', 'labelLeft', EntryFormLabelLeft],
  ['Field', 'outlined', FieldOutlined],
]
