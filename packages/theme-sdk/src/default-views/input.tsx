/** **입력 그룹 기본 뷰.** `SearchForm`·`EntryForm`·`Field`. 옮긴 규칙은 `./index.ts` 머리말. */
import { view } from '../define'
import { Root } from '../root'

// 기본 구조 `inline`.
export const SearchFormView = view(({ children }) => (
  <Root as="form" data-wb-structure="inline">
    <div data-wb-part="fields">{children}</div>
    <div data-wb-part="actions">
      <span>조회</span>
      <span>초기화</span>
    </div>
  </Root>
))

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
export const FieldView = view(({ props }) => (
  <Root as="div" data-wb-structure="outlined">
    <label data-wb-part="label">{String(props.label)}</label>
    <div data-wb-part="control">{String(props.placeholder) || ' '}</div>
  </Root>
))

/** 이 그룹의 기본 CSS. 비어 있다 — 값을 나르는 노드 변수가 없다. */
export function inputCssBlocks(): string[] {
  return []
}
