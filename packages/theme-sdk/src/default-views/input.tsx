/** **입력 그룹 기본 뷰.** `SearchForm`·`EntryForm`·`Field`. 옮긴 규칙은 `./index.ts` 머리말. */
import { zeroRule } from '../css-tools'
import { view } from '../define'
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
export const FieldView = view(({ props }) => (
  <Root as="div" data-wb-structure="outlined">
    <label data-wb-part="label">{String(props.label)}</label>
    <div data-wb-part="control">{String(props.placeholder) || ' '}</div>
  </Root>
))

/** 이 그룹의 기본 CSS. 특이도 0(`:where`)이라 테마의 어느 규칙이든 이긴다 — 테마가 없는 판의 최소 모양이다. */
export function inputCssBlocks(): string[] {
  return [zeroRule('[data-wb-component="SearchForm"] [data-wb-part="toggle"]', ['display: flex;', 'justify-content: space-between;'])]
}
