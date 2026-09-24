/**
 * **입력 그룹.** `SearchForm`·`EntryForm`·`Field`.
 *
 * 카탈로그의 `component/catalog/input.ts`와 같은 경계다. 등록(`INPUT_ENTRIES`)과
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
 * **왜 그것이 CSS가 아니라 DOM인가:**
 * 세로로 쌓는 것 자체는 `flex-direction: column`이면 되고 DOM이 필요 없다. 그런데
 * **테마가 겨냥할 수 있는 것은 `parts`뿐이다**(설계서 「components — 구조 + 스킨」 — 테마는 자식 컴포넌트를 직접 겨냥하는
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

/**
 * **접을 수 있는 검색 폼.** `props.collapsed`를 읽어 접힌 모습과 펼친 모습을 갈라 그린다.
 *
 * **`collapsed`는 이 구조가 읽지 않으면 죽는 prop이다.** 속성 패널에 `접힌 상태` 스위치가
 * **있고** 켜면 문서에 저장되고 검증도 통과하므로, 어느 구조도 그 값을 읽지 않으면
 * **화면이 아무것도 바뀌지 않는다.**
 *
 * **`Media.kind`와는 처방이 다르다.** 그쪽은 prop 값 넷이 `structures` 이름 넷과
 * **같아서** 구조와 중복이다. 여기서는 겹치지 않는다 — `collapsed`는 *"지금 접혀
 * 있는가"*(노드가 정한다)이고 `collapsible`은 *"접을 수 있는 형태인가"*(테마가 고른다)다.
 * 지울 것이 아니라 **읽어야 하는** prop이고, 그것을 읽는 자리가 여기다.
 *
 * **`states`에 더하지 않는다.** 더하면 `data-wb-state="collapsed"`가 `inline`·`stacked`
 * 에서도 나가는데 그 둘에는 접힘이라는 개념이 없다 — 켤 수는 있는데 아무 뜻도 없는 상태
 * 스킨이 하나 생긴다. 접힘은 여기서 **DOM으로** 표현하는 것이 정확하다.
 *
 * **접히면 자식도 함께 사라진다.** 와이어프레임에서 접힌 폼은 내용을 보이지 않으므로
 * 그것이 옳고, `display:none`으로 감추지 않는 것은 그 판단이 테마가 아니라 구조에
 * 속하기 때문이다(감추기로 하면 테마가 `display`를 덮어 되살릴 수 있어 접힘이 아니게 된다).
 */
export const SearchFormCollapsible: StructureRenderer = ({ attrs, props, part, children }) => {
  const collapsed = props.collapsed === true
  return (
    <form {...attrs}>
      <div {...part('toggle')}>
        <span>검색 조건</span>
        <span>{collapsed ? '▸' : '▾'}</span>
      </div>
      {collapsed ? null : (
        <>
          <div {...part('fields')}>{children}</div>
          <div {...part('actions')}>
            <span>조회</span>
            <span>초기화</span>
          </div>
        </>
      )}
    </form>
  )
}

/**
 * `labelLeft`·`labelTop` 공용 몸통.
 *
 * **둘의 DOM이 같다 — 재서 얻은 결과다.** 두 함수를 따로 두고 같은
 * 본문을 복사하는 대신 하나를 공유하는 것은, *"같다"*가 우연이 아니라 판정임을 코드에
 * 적어 두기 위해서다(케이스는 `test/structures-input.test.tsx`가 갖는다).
 *
 * **원인은 소유권이다.** 라벨과 컨트롤의 짝은 `EntryForm`이 아니라 **자식 `Field` 안에**
 * 있다. 이 함수가 받는 `children`은 이미 그려진 ReactNode이고 그 안쪽을 헤집는 것은 남의
 * 컴포넌트의 구조를 만지는 것이다. 라벨을 위로 옮기는 것은 결국 **`Field` 루트의
 * `flex-direction` 하나**이고 그것은 CSS다 — 그리고 테마는 이미
 * `components.Field.base`로 그것을 할 수 있으므로 이 구조는 그 스킨과 중복이다.
 *
 * **그래도 등록한다** — 설계서 「components — 구조 + 스킨」이 구조 옵션으로 열거했고, 등록해 두면
 * `data-wb-structure="labelTop"` 셀렉터 하나는 테마에 남는다. **구조인가 스킨인가의
 * 판정은 그 절의 경계를 다시 볼 때 한다.**
 *
 * > **재고 버린 후보:** 이 폼의 루트가 커스텀 프로퍼티를 싣고 `Field`의 기본 CSS가
 * > `var()`로 읽으면(커스텀 프로퍼티는 상속된다) DOM 없이 부모가 자식 배치를 정할 수
 * > 있다. 버린 이유 둘 — 테마가 침묵으로 덮을 수 있는 손잡이가 하나 늘고, `Field`의 기본
 * > CSS에 `display:flex`를 넣게 되는데 그것은 *"구조가 서기 위한 최소 선언"*이 아니라
 * > 스킨이다(설계서 「페이지 스키마 노드」 — 스타일 값은 테마에 있다).
 *
 * **`part('label')`이 폼의 `title`을 담는다.** 필드의 라벨과 같은 이름이라 헷갈리지만,
 * 바꾸면 `admin` 테마의 `EntryForm.parts.label` 스킨이 갈 곳을 잃어 **화면이 바뀐다.**
 * 이름을 바꾸려면 그 테마 스킨을 함께 옮겨야 한다.
 */
const EntryFormRows: StructureRenderer = ({ attrs, props, part, children }) => (
  <form {...attrs}>
    {props.title ? <div {...part('label')}>{String(props.title)}</div> : null}
    <div {...part('row')}>{children}</div>
    <div {...part('actions')}>
      <span>저장</span>
      <span>취소</span>
    </div>
  </form>
)

export const EntryFormLabelLeft: StructureRenderer = EntryFormRows

/** `labelLeft`와 **같은 DOM이다.** 근거는 `EntryFormRows`의 주석. */
export const EntryFormLabelTop: StructureRenderer = EntryFormRows

/**
 * **구획으로 나뉜 입력 폼.** 최상위 자식 하나가 구획 하나다.
 *
 * **왜 자식 하나 = 구획 하나인가.** 구획 수를 말해 주는 prop이 없고, 만들면 *"구획이 셋인데
 * 자식이 다섯이면 어떻게 나누는가"*라는 답 없는 질문이 따라온다. 설계서에서 폼을 나눌 때
 * 저자가 실제로 하는 일은 필드 묶음을 `Card`·`Flex` 같은 것으로 **묶어서** 넣는 것이므로,
 * 최상위 자식을 그대로 구획으로 보는 것이 문서의 모양과 일치한다. **prop을 새로 만들지
 * 않아도 되는 것이 그 덤이다**(설계서 「스키마 마이그레이션」을 부르지 않는다).
 *
 * 머리글의 글자는 자리 표시자다 — 구조는 와이어프레임이므로 실제 데이터가 없다
 * (`SearchFormInline`의 `조회`·`초기화`, `ListTable`의 `—`와 같은 부류다).
 *
 * **`fieldset`/`legend`를 쓰지 않는다.** 의미로는 그쪽이 맞지만 브라우저 기본 스타일
 * (테두리·`legend`의 자리 잡기)이 딸려 오고, 그것을 지우는 선언은 *"구조가 서기 위한 최소
 * CSS"*가 아니라 스킨이다. 테마가 매번 그것부터 걷어내야 하는 구조를 만들지 않는다.
 */
export const EntryFormSectioned: StructureRenderer = ({ attrs, props, part, children }) => (
  <form {...attrs}>
    {props.title ? <div {...part('label')}>{String(props.title)}</div> : null}
    {Children.map(children, (child, index) => (
      <div {...part('section')}>
        <div {...part('sectionTitle')}>구획 {index + 1}</div>
        <div {...part('row')}>{child}</div>
      </div>
    ))}
    <div {...part('actions')}>
      <span>저장</span>
      <span>취소</span>
    </div>
  </form>
)

/**
 * `Field`의 구조들이 **공유하는 몸통.**
 *
 * **`outlined`·`filled`·`underlined`의 DOM이 같다 — 재서 정한 결과다.**
 *
 * **잰 방법은 *"같은가"*가 아니라 *"다를 수 있는가"*다.** 셋이 그릴 만한 모습을 하나씩
 * 놓고, 그것을 **테마가 이 DOM으로 만들 수 있는지**를 본다:
 *
 * - **채워진 상자 안에 라벨이 든 모습**(Material filled) — 된다. 루트가 이미 라벨과
 *   컨트롤을 함께 담은 상자이므로 루트에 배경과 여백을 주면 그것이 곧 채운 상자다.
 * - **밑줄만 있는 모습** — 된다. `control` 조각의 아래 테두리 하나다.
 * - **테두리에 라벨이 파고드는 홈**(Material outlined의 notch) — 조각이 더 필요하다.
 *   그런데 그것은 **이미 있는 `outlined`가 하지 않는 것**이라 셋을 가르는 근거가 못 된다.
 * - **떠오르는 라벨** — 상호작용이라 범위 밖이다(구조는 와이어프레임이다).
 *
 * 즉 셋의 차이는 테두리·배경·밑줄이고 **전부 `base`·`parts` 스킨**이다.
 *
 * **`SearchForm:stacked`와 갈리는 점이 정확히 여기다.** 그쪽은 줄이 조각으로 나오지
 * 않으면 테마가 **겨냥할 대상 자체가 없다.** 여기서는 루트·`label`·`control` 셋으로
 * 이미 전부 겨냥된다 — 조각을 더 내도 테마가 할 수 있는 일이 늘지 않는다.
 *
 * **그래서 이 함수를 공유한다.** 남는 것은 `data-wb-structure` 셀렉터 하나뿐이다.
 * **변형으로 접을 수도 없다** — `Field`는 `variantFrom: 'control'`이라 변형 채널이 이미
 * 차 있다(`data-wb-variant`에 입력 종류가 실린다). 설계서 「components — 구조 + 스킨」의
 * 구조/변형 경계를 다시 볼 때의 입력이다.
 */
const FieldBox: StructureRenderer = ({ attrs, props, part }) => (
  <div {...attrs}>
    <label {...part('label')}>{String(props.label)}</label>
    {/* 입력 종류(`control`)는 이 조각이 아니라 루트의 `data-wb-variant`로 나간다.
        루트에 붙으므로 테마는 `[data-wb-variant="select"] [data-wb-part="control"]`로
        같은 자리를 겨냥한다. */}
    <div {...part('control')}>
      {String(props.placeholder) || ' '}
    </div>
  </div>
)

export const FieldOutlined: StructureRenderer = FieldBox

/** `outlined`와 **같은 DOM이다.** 근거는 `FieldBox`의 주석. */
export const FieldFilled: StructureRenderer = FieldBox

/** `outlined`와 **같은 DOM이다.** 근거는 `FieldBox`의 주석. */
export const FieldUnderlined: StructureRenderer = FieldBox

/**
 * 이 그룹의 구조가 서기 위한 최소 CSS. **비어 있다** — `SearchForm`·`EntryForm`·
 * `Field`는 값을 나르는 노드 변수가 없다.
 *
 * 빈 함수를 지우지 않는 것은, 이 그룹에 규칙이 필요해졌을 때 **어디에 넣을지
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
  ['SearchForm', 'collapsible', SearchFormCollapsible],
  ['EntryForm', 'labelLeft', EntryFormLabelLeft],
  ['EntryForm', 'labelTop', EntryFormLabelTop],
  ['EntryForm', 'sectioned', EntryFormSectioned],
  ['Field', 'outlined', FieldOutlined],
  ['Field', 'filled', FieldFilled],
  ['Field', 'underlined', FieldUnderlined],
]
