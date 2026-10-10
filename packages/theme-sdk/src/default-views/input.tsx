/** **입력 그룹 기본 뷰.** `SearchForm`·`EntryForm`·`Field`. 옮긴 규칙은 `./index.ts` 머리말. */
import { zeroRule } from '../css-tools'
import { view } from '../define'
import { stateAria } from '../marks'
import { Root } from '../root'

// 기본 구조 `inline`. **접히면(`collapsed`) 머리줄(`toggle` 조각)만 남고 자식도 DOM 에서 빠진다** — `display: none` 으로 감추면 테마 CSS 가
// `display` 를 덮어 되살릴 수 있어 접힘이 아니게 된다. 펴진 판의 DOM 은 머리줄 없이 그대로다.
export const SearchFormView = view(({ props, children }) =>
  props.collapsed === true ? (
    <Root as="form" data-wb-structure="inline">
      <div data-wb-part="toggle">
        <span>검색 조건</span>
        <span>▸</span>
      </div>
    </Root>
  ) : (
    <Root as="form" data-wb-structure="inline">
      <div data-wb-part="fields">{children}</div>
      <div data-wb-part="actions">
        <span>조회</span>
        <span>초기화</span>
      </div>
    </Root>
  ),
)

// 기본 구조 `labelLeft`. `label` 조각은 폼의 `title` 을 담는다 — `system-admin` 의 CSS 가 그 이름을 겨냥한다.
export const EntryFormView = view(({ props, children }) => (
  <Root as="form" data-wb-structure="labelLeft">
    {props.title ? <div data-wb-part="label">{String(props.title)}</div> : null}
    <div data-wb-part="row">{children}</div>
    <div data-wb-part="actions">
      <span>저장</span>
      <span>취소</span>
    </div>
  </Root>
))

// 기본 구조 `outlined`. 입력 종류(`control`)는 조각이 아니라 루트의 `data-wb-variant` 로 나간다.
// **`aria-required` · `aria-invalid` 는 루트가 아니라 `control` 조각에 선다** — 루트는 역할 없는 `div` 라 Chrome 의 접근성 트리가
// `aria-required` 를 버린다(`aria-invalid` 만 남고 이름도 비어 있다). 조각에 입력 종류별 역할과 이름(`aria-label`)을 준다. `file` 은
// `aria-required` 를 받는 역할이 없어 루트에 그대로 둔다. `Root` 에 `undefined` 를 넘겨 루트 몫을 거둔다.
const FIELD_ROLES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  text: { role: 'textbox' },
  number: { role: 'spinbutton' },
  select: { role: 'combobox', 'aria-expanded': 'false' },
  date: { role: 'textbox' },
  dateRange: { role: 'textbox' },
  checkbox: { role: 'checkbox', 'aria-checked': 'false' },
  radio: { role: 'radiogroup' },
  textarea: { role: 'textbox', 'aria-multiline': 'true' },
}

export const FieldView = view(({ props, states }) => {
  const role = FIELD_ROLES[String(props.control)]
  const aria = role === undefined ? {} : { 'aria-label': String(props.label), ...stateAria(states.filter((state) => state === 'required' || state === 'invalid')) }
  const rootless = role === undefined ? {} : { 'aria-required': undefined, 'aria-invalid': undefined }
  return (
    <Root as="div" data-wb-structure="outlined" {...rootless}>
      <label data-wb-part="label">{String(props.label)}</label>
      <div data-wb-part="control" {...role} {...aria}>
        {String(props.placeholder) || ' '}
      </div>
    </Root>
  )
})

/** 이 그룹의 기본 CSS. 특이도 0(`:where`)이라 테마의 어느 규칙이든 이긴다 — 테마가 없는 판의 최소 모양이다. */
export function inputCssBlocks(): string[] {
  return [zeroRule('[data-wb-component="SearchForm"] [data-wb-part="toggle"]', ['display: flex;', 'justify-content: space-between;'])]
}
