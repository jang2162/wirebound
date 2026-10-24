/** **입력 그룹 기본 뷰.** `SearchForm`·`EntryForm`·`Field` 와 값 칸의 조각 아홉. 옮긴 규칙은 `./index.ts` 머리말. */
import type { CSSProperties, ReactElement } from 'react'
import { nodeVar, WEIGHT_VAR, zeroRule } from '../css-tools'
import { view } from '../define'
import { Root } from '../root'
import { Zone } from '../zone'

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

// 기본 구조 `inline`. **접히면(`collapsed`) 머리줄(`toggle` 조각)만 남고 두 구역(조건 · 단추)이 DOM 에서 빠진다** — `display: none` 으로 감추면
// 테마 CSS 가 `display` 를 덮어 되살릴 수 있어 접힘이 아니게 된다. 펴진 판은 머리줄 없이 조건(`fields`) 뒤에 단추 구역(`actions`)이다.
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
      <Zone name="actions" data-wb-part="actions" />
    </Root>
  ),
)

// 기본 구조 `labelLeft`. `label` 조각은 폼의 `title` 을 담는다 — `system-admin` 의 CSS 가 그 이름을 겨냥한다. 단추는 `actions` 구역이다.
export const EntryFormView = view(({ props, children }) => (
  <Root as="form" data-wb-structure="labelLeft">
    {props.title ? <div data-wb-part="label">{String(props.title)}</div> : null}
    <div data-wb-part="row">{children}</div>
    <Zone name="actions" data-wb-part="actions" />
  </Root>
))

/**
 * 기본 구조 `outlined`. 뿌리는 라벨 이름을 단 `group` 이고, 그 밑에 `label` 조각과 `value` 조각(값 구역 — 몸통)이 형제로 선다 — 라벨|값 표가 두
 * 조각을 칸에 나눠 놓을 수 있게(설계 spec `2026-10-24-compose-input-design.md` 「5. 검색폼 · 입력폼과의 관계」). **`aria-required` 를 루트에서
 * 거둔다** — `group` 은 그 속성을 받는 역할이 아니다. 필수는 라벨의 별(`data-wb-state~="required"`)이 말하고, 값 칸의 입력 조각이 렌더러가 넘긴 필드 이름(`ViewProps.field`)으로 제 뿌리에
 * `aria-required` 를 낸다(`pieceAria`). `invalid` 는 조각이 제 뿌리에 낸다.
 */
export const FieldView = view(({ nodeId, props, children }) => {
  const labelId = `${nodeId}-label`
  return (
    <Root as="div" data-wb-structure="outlined" role="group" aria-labelledby={labelId} aria-required={undefined}>
      <label data-wb-part="label" id={labelId}>
        {String(props.label)}
      </label>
      <div data-wb-part="value">{children}</div>
    </Root>
  )
})

/**
 * 글을 싣는 조각의 `text` — 값이 있으면 값, 없으면 흐린 안내(`data-wb-placeholder`). 둘 다 비면 빈 칸이 접히지 않게 공백 하나를 둔다. 비밀번호면 값을
 * 점으로 그린다(설계 그림이라 글자 수만 보인다).
 */
function TextPart(props: { value: unknown; placeholder: unknown; secret?: boolean }): ReactElement {
  const value = typeof props.value === 'string' ? props.value : ''
  if (value !== '') return <span data-wb-part="text">{props.secret === true ? '•'.repeat([...value].length) : value}</span>
  const hint = typeof props.placeholder === 'string' ? props.placeholder : ''
  return hint === '' ? (
    <span data-wb-part="text"> </span>
  ) : (
    <span data-wb-part="text" data-wb-placeholder="">
      {hint}
    </span>
  )
}

/**
 * 조각의 접근 이름과 필수 — 필드 값 칸의 조각이면 렌더러가 지은 필드 이름(`ViewProps.field` — 라벨 · 라벨 + 별칭)과 그 필드의 필수를 편다. 필드
 * 밖이면 안내 문구, 없으면 종류 이름(조각에는 라벨이 없다). `aria-required` 는 그것을 받는 역할(`textbox` · `spinbutton` · `combobox` ·
 * `radiogroup`)에만 — 체크 묶음(`group`)은 이름만 받는다(`required: false` 로 부른다).
 */
function pieceAria(
  // `ViewProps.field`(`ViewField`)의 모양 — 타입 import 를 두지 않는다(스타터 템플릿이 이 파일을 옮길 때 `import type` 을 못 옮긴다).
  field: { name: string; required: boolean } | undefined,
  placeholder: unknown,
  fallback: string | undefined,
  required = true,
): { 'aria-label'?: string; 'aria-required'?: 'true' } {
  const name = field?.name ?? (typeof placeholder === 'string' && placeholder.trim() !== '' ? placeholder : fallback)
  return {
    ...(name === undefined ? {} : { 'aria-label': name }),
    ...(required && field?.required === true ? { 'aria-required': 'true' } : {}),
  }
}

/**
 * **실제 `<input>` · `<select>` 를 그리지 않는다** — 설계 그림이고, 캔버스에서 누르면 노드가 골라져야 하며, 테마 뷰가 그리는 포커스 받는 요소는
 * 단추 · 링크 · 입력 칸만이다(정본 「노드 속성」). 역할과 이름만 단다.
 */
export const InputView = view(({ props, field }) => (
  <Root
    as="div"
    data-wb-structure="box"
    role={props.kind === 'number' ? 'spinbutton' : 'textbox'}
    {...pieceAria(field, props.placeholder, '입력')}
  >
    <TextPart value={props.value} placeholder={props.placeholder} secret={props.kind === 'password'} />
  </Root>
))

/** 높이는 `rows` 줄 — 변수로 싣고 기본 CSS 가 줄 높이로 곱한다. */
export const TEXTAREA_ROWS_VAR = nodeVar('textarea', 'rows')

export const TextAreaView = view(({ props, field }) => (
  <Root
    as="div"
    data-wb-structure="box"
    role="textbox"
    aria-multiline="true"
    {...pieceAria(field, props.placeholder, '여러 줄 입력')}
    style={{ [TEXTAREA_ROWS_VAR]: String(props.rows) } as CSSProperties}
  >
    <TextPart value={props.value} placeholder={props.placeholder} />
  </Root>
))

/** 선택지 한 항목(카탈로그 `OptionSchema`). 모양이 틀린 원소는 빈 글 · 안 고름으로 읽는다 — 뷰는 오류 경계 안이지만 캔버스 하나를 통째로 잃는다. */
function optionsOf(value: unknown): { label: string; selected: boolean }[] {
  if (!Array.isArray(value)) return []
  return value.map((option) => {
    const raw = option !== null && typeof option === 'object' ? (option as { label?: unknown; selected?: unknown }) : {}
    return { label: typeof raw.label === 'string' ? raw.label : '', selected: raw.selected === true }
  })
}

// 꺾쇠는 CSS(`::after`)다 — 고른 항목이 없으면 안내 문구(«== 선택 ==»)가 흐리게 선다.
export const SelectView = view(({ props, field }) => {
  const picked = optionsOf(props.options).find((option) => option.selected)
  return (
    <Root as="div" data-wb-structure="box" role="combobox" aria-expanded="false" {...pieceAria(field, props.placeholder, '셀렉트')}>
      <TextPart value={picked?.label ?? ''} placeholder={props.placeholder} />
    </Root>
  )
})

/** 날짜 · 시간 칸 — 글 칸 + 표지 글자(테마가 덮는다). */
function stampedInput(fallback: string, glyph: string) {
  return view(({ props, field }) => (
    <Root as="div" data-wb-structure="box" role="textbox" {...pieceAria(field, props.placeholder, fallback)}>
      <TextPart value={props.value} placeholder={props.placeholder} />
      <span data-wb-part="glyph" aria-hidden="true">
        {glyph}
      </span>
    </Root>
  ))
}

export const DateInputView = stampedInput('날짜', '▦')
export const TimeInputView = stampedInput('시간', '◷')

/** 체크 · 라디오 묶음 — 항목마다 `option` 조각(역할 · `aria-checked`)과 `mark` 조각. 고른 칸은 테마가 `[aria-checked="true"]` 로 겨냥한다. */
function choiceGroup(groupRole: string, optionRole: string) {
  return view(({ props, field }) => (
    <Root as="div" data-wb-structure="inline" role={groupRole} {...pieceAria(field, undefined, undefined, groupRole === 'radiogroup')}>
      {optionsOf(props.options).map((option, index) => (
        <span key={index} data-wb-part="option" role={optionRole} aria-checked={option.selected ? 'true' : 'false'}>
          <span data-wb-part="mark" aria-hidden="true" />
          {option.label}
        </span>
      ))}
    </Root>
  ))
}

export const CheckboxGroupView = choiceGroup('group', 'checkbox')
export const RadioGroupView = choiceGroup('radiogroup', 'radio')

export const ChipView = view(({ props }) => (
  <Root as="span" data-wb-structure="default">
    <span data-wb-part="label">{String(props.label)}</span>
    {props.removable === true ? (
      <span data-wb-part="remove" aria-hidden="true">
        ×
      </span>
    ) : null}
  </Root>
))

// 색조(`tone`)는 prop 표지(`data-wb-tone` — `../marks.ts`)로 나간다. 색은 테마의 것이다.
export const AffixView = view(({ props }) => (
  <Root as="span" data-wb-structure="default">
    {String(props.text)}
  </Root>
))

/** 이 그룹의 기본 CSS. 특이도 0(`:where`)이라 테마의 어느 규칙이든 이긴다 — 테마가 없는 판의 최소 모양이다. */
export function inputCssBlocks(): string[] {
  // 글을 받는 조각 — 상자 모양을 함께 쓴다.
  const boxed = ['Input', 'TextArea', 'Select', 'DateInput', 'TimeInput']
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
    // 값 칸 — 조각을 가로로 줄 세우고 넘치면 줄을 바꾼다. 조각의 몫은 `Flex` 처럼 `flex: <몫>`(렌더러 `weightRoom('Field')`) — 몫이 없으면 내용 폭.
    zeroRule('[data-wb-component="Field"] > [data-wb-part="value"]', [
      'display: flex;',
      'flex-wrap: wrap;',
      'align-items: center;',
      'gap: 6px;',
      'min-width: 0;',
    ]),
    zeroRule('[data-wb-component="Field"] > [data-wb-part="value"] > *', [`flex: var(${WEIGHT_VAR}, 0 1 auto);`]),
    // 여러 줄 입력은 몫이 없어도 값 칸을 채운다(몫 1 과 같은 기본) — 위 규칙보다 뒤라 같은 특이도에서 이긴다.
    zeroRule('[data-wb-component="Field"] > [data-wb-part="value"] > [data-wb-component="TextArea"]', [`flex: var(${WEIGHT_VAR}, 1);`]),
    zeroRule(boxed.map((type) => `[data-wb-component="${type}"]`).join(', '), [
      'display: inline-flex;',
      'align-items: center;',
      'gap: 4px;',
      'box-sizing: border-box;',
      'min-width: 0;',
      'border: 1px solid;',
      'padding: 2px 6px;',
    ]),
    zeroRule('[data-wb-placeholder]', ['opacity: 0.55;']),
    // 고정 폭 표지(`size`) — 실제 길이는 테마가 덮는다. 몫을 주면 `flex` 바탕 폭이 이 폭을 이긴다. 칸보다 넓지는 않다 — 좁은 창(390)에서 `long` 이 넘친다.
    zeroRule('[data-wb-size="short"]', ['width: min(6em, 100%);']),
    zeroRule('[data-wb-size="medium"]', ['width: min(12em, 100%);']),
    zeroRule('[data-wb-size="long"]', ['width: min(24em, 100%);']),
    zeroRule('[data-wb-component="DateInput"], [data-wb-component="TimeInput"]', ['width: 9em;', 'justify-content: space-between;']),
    zeroRule('[data-wb-component="TextArea"]', [
      'align-items: flex-start;',
      'width: 100%;',
      `min-height: calc(var(${TEXTAREA_ROWS_VAR}, 3) * 1.5em);`,
    ]),
    zeroRule('[data-wb-component="Select"]::after', ["content: '▾';", 'margin-left: auto;']),
    zeroRule('[data-wb-component="CheckboxGroup"], [data-wb-component="RadioGroup"]', [
      'display: inline-flex;',
      'flex-wrap: wrap;',
      'gap: 4px 12px;',
    ]),
    zeroRule('[data-wb-component="CheckboxGroup"] [data-wb-part="option"], [data-wb-component="RadioGroup"] [data-wb-part="option"]', [
      'display: inline-flex;',
      'align-items: center;',
      'gap: 4px;',
    ]),
    zeroRule('[data-wb-part="option"] > [data-wb-part="mark"]', ['width: 0.9em;', 'height: 0.9em;', 'border: 1px solid;']),
    zeroRule('[data-wb-component="RadioGroup"] [data-wb-part="mark"]', ['border-radius: 50%;']),
    zeroRule('[data-wb-part="option"][aria-checked="true"] > [data-wb-part="mark"]', ['background: currentColor;']),
    zeroRule('[data-wb-component="Chip"]', [
      'display: inline-flex;',
      'align-items: center;',
      'gap: 4px;',
      'border: 1px solid;',
      'padding: 0 6px;',
    ]),
  ]
}
