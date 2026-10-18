/** **입력 그룹 기본 뷰.** `SearchForm`·`EntryForm`·`Field`. 옮긴 규칙은 `./index.ts` 머리말. */
import type { CSSProperties } from 'react'
import { nodeVar, WEIGHT_VAR, zeroRule } from '../css-tools'
import { view } from '../define'
import { stateAria } from '../marks'
import { Root } from '../root'

/** 열을 정한 조회 폼이 열 수를 나르는 변수 — `fields` 조각에 인라인으로 선다. */
export const SEARCHFORM_COLUMNS_VAR = nodeVar('searchform', 'columns')

/**
 * **열을 정한 조회 폼(`SearchForm.columns`)의 `fields` 조각에 펼 속성** — `data-wb-columns="<수>"` 와 `--wb-node-searchform-columns`. 열을 안
 * 정했으면 아무것도 없다(지금 배치 그대로). 테마 CSS 는 `[data-wb-part="fields"][data-wb-columns]` 로 «열을 정한 판» 만 겨냥한다.
 *
 * **루트 표지(`marks.ts`)가 아니라 조각의 속성인 까닭:** 표지는 불리언 · enum prop 의 것이다(수는 셀렉터로 셀 수 없다 — `packages/renderer/test/prop-marks.test.tsx`
 * 의 규칙). 열 수는 변수가 나르고, 속성은 «정했다» 만 가른다. `fields` 조각을 그리는 테마 뷰(접히는 조회 폼)도 이것을 편다.
 */
export function searchFormFieldsAttrs(columns: unknown): { 'data-wb-columns'?: string; style?: CSSProperties } {
  if (typeof columns !== 'number') return {}
  return { 'data-wb-columns': String(columns), style: { [SEARCHFORM_COLUMNS_VAR]: String(columns) } as CSSProperties }
}

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
      <div data-wb-part="fields" {...searchFormFieldsAttrs(props.columns)}>
        {children}
      </div>
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
  const aria =
    role === undefined
      ? {}
      : { 'aria-label': String(props.label), ...stateAria(states.filter((state) => state === 'required' || state === 'invalid')) }
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
  return [
    zeroRule('[data-wb-component="SearchForm"] [data-wb-part="toggle"]', ['display: flex;', 'justify-content: space-between;']),
    // 열을 정한 조회 폼 — 필드를 같은 폭 칸으로 깐다. 테마는 `fields` 를 더 높은 특이도의 `display: flex` 로 덮으므로 테마마다 같은 규칙을
    // `[data-wb-columns]` 로 다시 건다(이것은 테마가 없는 판의 모양이다).
    zeroRule('[data-wb-component="SearchForm"] > [data-wb-part="fields"][data-wb-columns]', [
      'display: grid;',
      `grid-template-columns: repeat(var(${SEARCHFORM_COLUMNS_VAR}, 1), minmax(0, 1fr));`,
    ]),
    // 필드의 몫은 차지할 칸 수다 — 열 수로 자른 값을 렌더러가 싣는다(`packages/renderer/src/render.tsx` 의 `weightRoom`). 테마는 이 규칙을
    // 안 덮는다(테마의 필드 규칙은 `flex` 뿐이고 격자에서는 안 듣는다). 좁은 창에서 한 칸으로 쌓는 테마는 `grid-column: auto` 로 덮는다.
    zeroRule('[data-wb-component="SearchForm"] > [data-wb-part="fields"][data-wb-columns] > *', [
      `grid-column: span var(${WEIGHT_VAR}, 1);`,
    ]),
  ]
}
