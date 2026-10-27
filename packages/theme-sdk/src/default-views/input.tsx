/** **입력 그룹 기본 뷰.** `SearchForm`·`EntryForm`·`FormTable`·`Field` 와 값 칸의 조각 아홉. 옮긴 규칙은 `./index.ts` 머리말. */
import { Fragment, type CSSProperties, type ReactElement } from 'react'
import { FORM_LABEL_WIDTH_VAR, nodeVar, WEIGHT_VAR, zeroRule } from '../css-tools'
import { view } from '../define'
import { pairRows } from '../pair-rows'
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

/** 폼 표가 한 줄의 쌍 수를 나르는 변수 — `cells` 조각에 인라인으로 선다. */
export const FORMTABLE_COLUMNS_VAR = nodeVar('formtable', 'columns')

/**
 * **폼 표(`FormTable`)의 `cells` 조각에 펼 속성** — `data-wb-columns="<수>"` 와 `--wb-node-formtable-columns`. 열 수는 늘 있다(기본 1) — 속성이
 * 늘 서는 것이 조회 폼(`searchFormFieldsAttrs` — 열을 정한 판만)과 다르다. 표지가 아닌 까닭은 `searchFormFieldsAttrs` 머리말과 같다.
 */
export function formTableCellsAttrs(columns: unknown): { 'data-wb-columns': string; style: CSSProperties } {
  const value = typeof columns === 'number' ? String(columns) : '1'
  return { 'data-wb-columns': value, style: { [FORMTABLE_COLUMNS_VAR]: value } as CSSProperties }
}

/**
 * 기본 구조 `table`. 머리줄(`header` — `title` 조각 · «머리 오른쪽» 구역)은 제목이 있거나 그 구역이 찼을 때만 선다(`CardView` 와 같다). 옆 칸(`aside`)
 * 은 표 왼쪽에서 모든 줄을 덮고, 칸(`cells`)은 몸통 자식을 `pairRows` 차례로 그리며 줄 끝 · 구멍에 빈 쌍(`filler` — 노드가 아니다)을 끼운다.
 *
 * **빈 쌍은 `Field` 와 같은 두 조각(`label` · `value`)을 갖는다** — 테마의 라벨 칸 바탕 · 칸 선 규칙이 그대로 듣는다. 보조 기술에는 안 보인다.
 * 제목이 있으면 뿌리가 그 이름의 `group` 이다 — 표 하나가 이름 붙은 묶음이다. **`<table>` 이 아니다** — 칸에 `Field` 뿌리(`group`)가 서고 값 칸에
 * 그리드 · 하위 표가 든다(자료 표가 아니라 폼 배치다).
 */
export const FormTableView = view(({ nodeId, props, items, zones }) => {
  const title = typeof props.title === 'string' ? props.title : ''
  const titleId = `${nodeId}-title`
  return (
    <Root as="div" data-wb-structure="table" {...(title === '' ? {} : { role: 'group', 'aria-labelledby': titleId })}>
      {title !== '' || zones.headEnd != null ? (
        <div data-wb-part="header">
          {title !== '' ? (
            <div data-wb-part="title" id={titleId}>
              {title}
            </div>
          ) : null}
          <Zone name="headEnd" data-wb-part="headEnd" />
        </div>
      ) : null}
      <Zone name="aside" data-wb-part="aside" />
      <div data-wb-part="cells" {...formTableCellsAttrs(props.columns)}>
        {pairRows(items, props.columns).map((cell) =>
          cell.kind === 'item' ? (
            <Fragment key={cell.item.nodeId}>{cell.item.element}</Fragment>
          ) : (
            <div key={cell.key} data-wb-part="filler" aria-hidden="true">
              <div data-wb-part="label" />
              <div data-wb-part="value" />
            </div>
          ),
        )}
      </div>
    </Root>
  )
})

/**
 * 기본 구조 `outlined`. 뿌리는 라벨 이름을 단 `group` 이고, 그 밑에 `label` 조각과 `value` 조각(값 구역 — 몸통)이 형제로 선다 — 라벨|값 표가 두
 * 조각을 칸에 나눠 놓을 수 있게(설계 spec `2026-10-24-compose-input-design.md` 「5. 검색폼 · 입력폼과의 관계」). **`aria-required` 를 루트에서
 * 거둔다** — `group` 은 그 속성을 받는 역할이 아니다. 필수는 라벨의 별(`data-wb-state~="required"`)이 말하고, 값 칸의 입력 조각이 렌더러가 넘긴 필드 이름(`ViewProps.field`)으로 제 뿌리에
 * `aria-required` 를 낸다(`pieceAria`). `invalid` 는 조각이 제 뿌리에 낸다. **라벨이 비면 역할을 안 낸다** — 이름 없는 `group` 은 보조 기술에 빈 묶음으로
 * 읽힌다(폼 표 가운데의 빈 쌍이 라벨이 빈 `Field` 다). 두 조각은 뿌리의 **직계**다 — 폼 표 · 열을 정한 조회 폼이 두 조각을 쌍 격자의 트랙에 놓는다(subgrid).
 */
export const FieldView = view(({ nodeId, props, children }) => {
  const labelId = `${nodeId}-label`
  const named = String(props.label).trim() !== ''
  return (
    <Root
      as="div"
      data-wb-structure="outlined"
      role={named ? 'group' : undefined}
      aria-labelledby={named ? labelId : undefined}
      aria-required={undefined}
    >
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
  const cells = '[data-wb-component="FormTable"] > [data-wb-part="cells"]'
  // **좁은 창(640px 아래)의 폼 표** — 한 줄에 쌍 하나 · 라벨 위 · 값 아래 · 빈 쌍 숨김 · 옆 칸은 표 위. 라벨 칸 8rem 을 두 쌍이 나누면 390 폭에서 값 칸이
  // 글자 몇 자 폭이 되어 한 줄 조각이 꺾이고 고정 폭 조각이 넘친다. 특이도 0 이라 폼 표를 꾸미는 테마는 제 규칙으로 덮는다(좁은 창은 테마의 몫이다 —
  // 이것은 테마가 안 꾸민 판의 모양이다). 문턱은 기본테마와 같다.
  const narrow = `@media (max-width: 640px) {
  ${[
    zeroRule('[data-wb-component="FormTable"]', ['grid-template-columns: minmax(0, 1fr);']),
    zeroRule(cells, ['grid-column: 1;', 'grid-template-columns: minmax(0, 1fr);']),
    zeroRule(`${cells} > *`, ['grid-column: auto;']),
    zeroRule(`${cells} > [data-wb-component="Field"]`, ['grid-template-columns: minmax(0, 1fr);']),
    zeroRule(`${cells} > [data-wb-component="Field"] > [data-wb-part="value"]`, ['grid-column: auto;']),
    zeroRule(`${cells} > [data-wb-part="filler"]`, ['display: none;']),
  ].join('\n')}
  }`
  // **중간 폭(960px 아래 — PPTX 캡처 폭 720 이 든다)의 폼 표** — 한 줄에 쌍 하나 · 라벨 왼쪽 그대로 · 빈 쌍 숨김. 열 수가 그대로면 라벨 칸이 열마다 빠져
  // 값 칸이 가장 좁고 줄을 안 바꾸는 값(하위 표 · 세그먼트)이 옆 쌍 · 창 밖으로 넘친다. 640 아래는 위 좁은 창 판이 덮는다(뒤에 둔다). 열을 정한 조회 폼은
  // 안 접는다 — SDK 기본은 같은 폭 칸 · 라벨 위라 넘치지 않고, 자식 폭을 바꾸면 «필드 하나 = 트랙 하나» 로 덮은 옛 테마의 몫이 깨진다(아래 조회 폼 규칙).
  const mid = `@media (max-width: 960px) {
  ${[
    zeroRule(cells, [`grid-template-columns: var(${FORM_LABEL_WIDTH_VAR}, 8rem) minmax(0, 1fr);`]),
    zeroRule(`${cells} > *`, ['grid-column: 1 / -1;']),
    zeroRule(`${cells} > [data-wb-part="filler"]`, ['display: none;']),
  ].join('\n')}
  }`
  // 값 칸 안의 폼 표(하위 표) — 늘 한 줄에 쌍 하나. 값 칸 폭을 채우는 규칙은 값 칸 조각 규칙 뒤에 둔다(아래).
  const nested = '[data-wb-component="Field"] > [data-wb-part="value"] > [data-wb-component="FormTable"] > [data-wb-part="cells"]'
  // 글을 받는 조각 — 상자 모양을 함께 쓴다.
  const boxed = ['Input', 'TextArea', 'Select', 'DateInput', 'TimeInput']
  return [
    zeroRule('[data-wb-component="SearchForm"] [data-wb-part="toggle"]', ['display: flex;', 'justify-content: space-between;']),
    // 열을 정한 조회 폼 — 필드를 같은 폭 칸으로 깐다(필드 하나가 트랙 하나). 테마는 `fields` 를 더 높은 특이도의 `display: flex` 로 덮으므로 테마마다
    // 같은 규칙을 `[data-wb-columns]` 로 다시 건다(이것은 테마가 없는 판의 모양이다). **쌍 격자(라벨 왼쪽)는 테마가 고른다**(기본테마가 그렇다) — 이
    // 기본값을 쌍으로 바꾸면 «필드 하나 = 트랙 하나» 로 덮어 둔 SDK 1.5.0 이하 테마에서 필드가 두 트랙씩 덮어 열이 깨진다(SDK minor 판이 옛 테마를 깬다).
    zeroRule('[data-wb-component="SearchForm"] > [data-wb-part="fields"][data-wb-columns]', [
      'display: grid;',
      `grid-template-columns: repeat(var(${SEARCHFORM_COLUMNS_VAR}, 1), minmax(0, 1fr));`,
    ]),
    // 필드의 몫은 차지할 칸 수다 — 열 수로 자른 값을 렌더러가 싣는다(`packages/renderer/src/render.tsx` 의 `weightRoom`). 좁은 창에서 한 칸으로
    // 쌓는 테마는 `grid-column: auto` 로 덮는다.
    zeroRule('[data-wb-component="SearchForm"] > [data-wb-part="fields"][data-wb-columns] > *', [
      `grid-column: span var(${WEIGHT_VAR}, 1);`,
    ]),
    // **폼 표의 쌍 격자** — 한 쌍이 트랙 둘(라벨 폭 · 남는 폭)이고 자식의 몫은 차지할 쌍 수다.
    zeroRule(cells, [
      'display: grid;',
      `grid-template-columns: repeat(var(${FORMTABLE_COLUMNS_VAR}, 1), var(${FORM_LABEL_WIDTH_VAR}, 8rem) minmax(0, 1fr));`,
    ]),
    zeroRule(`${cells} > *`, [`grid-column: span calc(2 * var(${WEIGHT_VAR}, 1));`]),
    // 빈 쌍은 늘 한 쌍이다 — 노드가 아니라 `[data-wb-id]` 의 몫 초기화(`structureCssBlocks`)에 안 걸려, 몫을 준 폼 표의 `--wb-node-weight` 를 물려받는다.
    zeroRule(`${cells} > [data-wb-part="filler"]`, ['grid-column: span 2;']),
    // 칸의 `Field` · 빈 쌍은 두 조각을 격자의 트랙에 놓는다 — 라벨 칸 · 값 칸의 왼끝이 줄마다 맞고, 두 칸이 그 줄 높이를 채운다(값 칸이 키를 키우면
    // 라벨 칸이 따라 늘어난다 — 격자 기본 `stretch`).
    zeroRule(`${cells} > [data-wb-component="Field"], ${cells} > [data-wb-part="filler"]`, [
      'display: grid;',
      'grid-template-columns: subgrid;',
    ]),
    zeroRule(`${cells} > [data-wb-component="Field"] > [data-wb-part="value"]`, ['grid-column: 2 / -1;']),
    // 폼 표 — 머리줄이 위 한 줄, 옆 칸이 왼쪽에서 칸 전부의 높이를 덮는다. 옆 칸이 없으면 첫 트랙(`auto`)이 폭 0 이다.
    zeroRule('[data-wb-component="FormTable"]', ['display: grid;', 'grid-template-columns: auto minmax(0, 1fr);']),
    zeroRule('[data-wb-component="FormTable"] > [data-wb-part="header"]', [
      'grid-column: 1 / -1;',
      'display: flex;',
      'align-items: center;',
      'justify-content: space-between;',
      'gap: 6px;',
    ]),
    zeroRule('[data-wb-component="FormTable"] > [data-wb-part="aside"]', ['grid-column: 1;']),
    zeroRule(cells, ['grid-column: 2;']),
    zeroRule(nested, [`grid-template-columns: var(${FORM_LABEL_WIDTH_VAR}, 8rem) minmax(0, 1fr);`]),
    zeroRule(`${nested} > *`, ['grid-column: 1 / -1;']),
    zeroRule(`${nested} > [data-wb-part="filler"]`, ['display: none;']),
    mid,
    narrow,
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
    // 값 칸 안의 폼 표는 값 칸 폭을 채운다 — 내용 폭으로 줄면 값 트랙(`minmax(0, 1fr)`)이 0 으로 접혀 입력칸이 손톱만 해진다.
    zeroRule('[data-wb-component="Field"] > [data-wb-part="value"] > [data-wb-component="FormTable"]', ['flex: 1 1 100%;']),
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
    // 팝업도 같은 이름의 표지(`small` · `medium` · `large`)를 싣는다 — 빼지 않으면 보통 팝업이 12em 로 준다(둘 다 특이도 0 이라 뒤 규칙이 이긴다).
    zeroRule('[data-wb-size="short"]:not([data-wb-component="Popup"])', ['width: min(6em, 100%);']),
    zeroRule('[data-wb-size="medium"]:not([data-wb-component="Popup"])', ['width: min(12em, 100%);']),
    zeroRule('[data-wb-size="long"]:not([data-wb-component="Popup"])', ['width: min(24em, 100%);']),
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
