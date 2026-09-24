import { z } from 'zod'
import { defineComponent } from '../define'

export const SearchFormDef = defineComponent({
  type: 'SearchForm',
  // **이름은 설계서 「설계서 화면 구조」의 그림에서 빌려 왔다**(*"① 검색폼"*) — `List`와 같은 근거다.
  label: '검색폼',
  description: '목록을 거를 조건을 받는 검색 영역.',
  group: 'input',
  props: z.strictObject({
    collapsed: z.boolean().default(false),
  }),
  editor: [{ prop: 'collapsed', control: 'switch', label: '접힌 상태' }],
  structures: ['inline', 'stacked', 'collapsible'],
  // `row`는 `stacked`가 자식 하나마다 내는 줄이다. **테마는 설계서 「components — 구조 + 스킨」에서 `parts`만 겨냥할 수
  // 있고 자식 컴포넌트를 직접 겨냥할 수 없으므로**, 줄이 조각으로 나오지 않으면 줄 사이
  // 간격·구분선에 손댈 길이 아예 없다 — `flex-direction: column`으로 대신할 수 없는 것이
  // 그 부분이고, `stacked`가 `inline`과 DOM으로 갈리는 근거다.
  // `toggle`은 `collapsible`이 내는 머리줄이다. 접혀 있을 때 화면에 남는 유일한 조각이라
  // 테마가 그것만 따로 겨냥할 수 있어야 한다.
  parts: ['fields', 'actions', 'row', 'toggle'],
  variants: [],
  states: [],
  children: 'many',
})

export const EntryFormDef = defineComponent({
  type: 'EntryForm',
  label: '입력폼',
  description: '여러 항목을 입력받는 등록·수정 폼.',
  group: 'input',
  props: z.strictObject({
    title: z.string().default(''),
  }),
  editor: [{ prop: 'title', control: 'text', label: '제목' }],
  structures: ['labelLeft', 'labelTop', 'sectioned'],
  // `section`·`sectionTitle`은 `sectioned`가 자식 하나마다 내는 구획과 그 머리글이다.
  //
  // **`control`은 어느 구조도 내지 않는다.** 선언만 있고 화면에 닿지 않는 이름이라
  // `Field.help`와 같은 부류다 — 지우는 것은 테마 어휘를 좁히는 변경(그 이름에 스킨을 둔
  // 테마가 검증에서 걸린다)이므로 여기서 하지 않는다. 어휘를 좁히기로 정할 때 함께 지운다.
  parts: ['row', 'label', 'control', 'actions', 'section', 'sectionTitle'],
  variants: [],
  states: [],
  children: 'many',
})

export const FieldDef = defineComponent({
  type: 'Field',
  label: '입력 필드',
  description: '입력 한 칸. 종류에 따라 텍스트·선택·날짜가 된다.',
  group: 'input',
  props: z.strictObject({
    label: z.string().default('라벨'),
    control: z
      .enum(['text', 'number', 'select', 'date', 'dateRange', 'checkbox', 'radio', 'textarea', 'file'])
      .default('text'),
    placeholder: z.string().default(''),
    required: z.boolean().default(false),
    disabled: z.boolean().default(false),
    invalid: z.boolean().default(false),
  }),
  editor: [
    { prop: 'label', control: 'text', label: '라벨' },
    {
      prop: 'control',
      control: 'select',
      label: '입력 종류',
      options: ['text', 'number', 'select', 'date', 'dateRange', 'checkbox', 'radio', 'textarea', 'file'],
    },
    { prop: 'placeholder', control: 'text', label: '안내 문구' },
    { prop: 'required', control: 'switch', label: '필수' },
    { prop: 'disabled', control: 'switch', label: '비활성' },
    { prop: 'invalid', control: 'switch', label: '오류 상태' },
  ],
  structures: ['outlined', 'filled', 'underlined'],
  parts: ['label', 'control', 'help'],
  // `control`의 enum 값 그대로다 — `defineComponent`가 두 집합이 같은지를 양방향으로 검사한다.
  variants: ['text', 'number', 'select', 'date', 'dateRange', 'checkbox', 'radio', 'textarea', 'file'],
  variantFrom: 'control',
  states: ['required', 'disabled', 'invalid'],
  children: 'none',
})
