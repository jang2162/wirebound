/**
 * 우측의 속성 패널. 선택 노드의 속성을 **카탈로그의 `editor` 명세에서 자동 생성해**
 * 보여 준다(설계서 「컴포넌트 정의 구조」·「설계서 화면 구조」). 값을 바꾸는 위젯도 이 패널이
 * 그린다 — 읽기(첫 절)와 편집(뒤 절들)을 함께 잰다.
 *
 * 노드를 고르는 일은 구조 트리를 눌러서 한다. 스토어를 직접 건드리지 않는 것은 의도다 —
 * 사용자가 실제로 지나는 길(트리 → 스토어 → 패널)이 이어져 있는지 함께 보게 된다.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  CATALOG_TYPES,
  ListDef,
  defineComponent,
  getComponent,
  listComponents,
  registerComponent,
  validatePage,
  type EditorControl,
  type WbNode,
} from '@wirebound/schema'
import { ApiError, type ApiClient } from '../../src/api/client'
import { ApiProvider } from '../../src/api/context'
import { PropertyPanel, variantFieldOf } from '../../src/panels/property-panel'
import { ADMIN_V0 } from '@wirebound/system-theme-admin'
import { withProjectTheme } from '../theme-loader'
import { EditorStore } from '../../src/store/editor-store'
import { EditorStoreProvider } from '../../src/store/use-editor-store'
import type { PatchResult } from '../../src/api/types'
import {
  deselect,
  openPage,
  OTHER_PAGE_ID,
  OTHER_PAGE_TITLE,
  PAGE_ID,
  pageDetail,
  pageDoc,
  PROJECT_NAME,
  PROJECT_ROUTE,
  renderEditor,
  canvasQuery,
} from '../editor-harness'
// 카탈로그가 설치돼 있어야 `listComponents()`가 빈 배열이 아니다.
import { clickAsBrowser } from '../click-as-browser'
import { fakeApi } from '../helpers'
import '../../src/catalog-setup'

/**
 * **`options`를 갖지 않는 `select`.** 카탈로그에는 그런 자리가 없으므로(실측: `control:
 * 'select'` 여덟 자리가 전부 `options`를 갖는다) 여기서 만든다 — `EditorField.options`가
 * 선택 필드라 컴파일러가 그 짝을 강제하지 않고, 카탈로그는 데이터라 언제든 그렇게 될 수 있다.
 */
const NO_OPTIONS_TYPE = '선택지없음프로브'

registerComponent(
  defineComponent({
    ...ListDef,
    type: NO_OPTIONS_TYPE,
    label: NO_OPTIONS_TYPE,
    editor: [{ prop: 'items', control: 'select', label: '선택지 없는 필드' }],
    // **`states`를 비운다.** `ListDef`의 `editor`를 통째로 갈았으므로 그대로 두면
    // `defineComponent`의 도달성 검사가 *"states가 editor에 없다"*로 던진다 — 이 프로브가 재려는 것은
    // `options` 없는 `select`이지 상태 도달성이 아니다.
    states: [],
  }),
)

const DOC = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [
    {
      id: 'n-field',
      type: 'Field',
      props: { label: '이름', control: 'select', placeholder: '검색어', required: true },
    },
    { id: 'n-card', type: 'Card', props: { title: '회원 정보' } },
    { id: 'n-list', type: 'List', props: { columns: ['이름', '이메일'], items: 3 } },
    {
      id: 'n-kv',
      type: 'KeyValue',
      props: {
        pairs: [
          { key: '가입일', value: '2026-01-01' },
          { key: '등급', value: 'VIP' },
        ],
      },
    },
    { id: 'n-ghost', type: '없는타입' },
  ],
})

/**
 * `JSON.stringify`가 **던지는** 값. 순환 참조가 그렇다.
 *
 * `getPage` 응답의 JSON에서는 이런 값이 나올 수 없다 — 여기서 손으로 만든다. 지키는 것은
 * "패널이 값을 문자열로 만들다 던져도 셸이 살아 있다"이고, 그것이 필요한 이유는 패널이
 * 캔버스의 오류 경계 **밖**에 있기 때문이다(`panels/property-panel.tsx`의 `stringify`).
 */
const CIRCULAR: Record<string, unknown> = { name: '순환' }
CIRCULAR.self = CIRCULAR

const THROWING_DOC = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [{ id: 'n-card', type: 'Card', props: { title: CIRCULAR, subtitle: '부제' } }],
})

/**
 * **`props`를 갖지 않는 노드 둘.** `readProp`의 `node.props?.[prop]`에 하중을 거는 자리다.
 *
 * - `n-bare`는 `props`가 아예 없다. **스키마가 허용하는 정상 문서다**
 *   (`packages/schema/src/node.ts`의 `props?: Record<string, unknown>` — optional).
 * - `n-null`은 `props`가 `null`이다. 타입은 막지만 런타임에는 들어온다. **실재하는
 *   경로 하나는 "서버가 계약을 어긴 문서를 200으로 낸다"이다**(실측: `SHAPES.pageDetail`은
 *   `schema.root`가 객체인지까지만 보고 자식으로 내려가지 않으므로, `root.children`에
 *   `props: null`인 노드를 담은 응답이 `getPage`를 그대로 지난다 — `api/http-client.ts`).
 *   편집의 낙관적 적용은 검증 전 문서를 스토어에 싣는다 — 두 번째 경로가 될 수 있다.
 *
 * 둘 다 `editor`가 비지 않은 타입이어야 뜻이 있다. `Page`·`Slot`처럼 `editor`가 빈
 * 컴포넌트를 고르면 `readProp`이 한 번도 불리지 않는다.
 *
 * **이 둘이 없어도 하중이 0은 아니다.** `?.`를 걷어내면
 * (`node.props![prop]`) 이 둘 없이도 넷이 죽는다 — `canvas.test.tsx`의 `편집 모드에서
 * 선택 노드에 아웃라인이 붙는다`(`n-search`가 `props` 없는 `SearchForm`이고, 그 클릭이
 * 패널에 `collapsed`를 읽게 한다)와 `structure-tree.test.tsx`의 셋(`n-list`가 `props` 없는
 * `List`다). **다만 그 넷은 다른 성질을 재는 케이스라 죽어도 무엇이 깨졌는지가 이름에
 * 나오지 않는다.** 여기 둘은 그것을 이름으로 고정한다. `props`가 **객체가 아닌** 경우
 * (`n-null`)는 이 파일이 유일한 하중이다.
 */
const NO_PROPS_DOC = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [
    { id: 'n-bare', type: 'Card' },
    { id: 'n-null', type: 'Field', props: null } as never,
  ],
})

/**
 * `type`이 문자열이 **아닌** 노드. 렌더러는 폴백으로 흡수하지만(`shapeError`), 그것을 그대로
 * `{node.type}`으로 그리는 화면은 React가 렌더 도중 던진다. 이 패널은 캔버스의 오류 경계
 * **밖**이라 그 예외는 셸 전체를 지운다 — `값을 문자열로 만들 수 없어도…`와 같은 부류이고,
 * 이쪽이 더 흔한 경로다(편집의 낙관적 적용이 만드는 검증 전 문서).
 */
const BROKEN_TYPE_DOC = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [{ id: 'n-bad', type: { broken: true }, children: [] } as never],
})

/** 위젯이 있는 control. */
const WIDGET_CONTROLS: EditorControl[] = [
  'text',
  'textarea',
  'number',
  'switch',
  'select',
  'stringList',
  'pairList',
]
/**
 * 위젯이 없어 `formatValue`가 글자로만 그리는 control. **비어 있다** —
 * 위젯이 일곱을 전부 덮는다. 카탈로그에 여덟 번째가 생기면 아래 대조가 그것을 잡는다.
 */
const NOT_YET: EditorControl[] = []

/** 카탈로그가 **실제로 쓰는** control 집합. 손으로 적지 않고 센다. */
function catalogControls(): Set<EditorControl> {
  return new Set(listComponents().flatMap((def) => def.editor.map((field) => field.control)))
}

/**
 * control 종류마다 그것을 쓰는 카탈로그 자리 하나씩. **일곱을 전부 짚는다** — 위
 * `catalogControls()`와의 대조가 그 사실을 지킨다.
 */
const CONTROL_SAMPLES: { control: EditorControl; type: string; label: string }[] = [
  { control: 'text', type: 'Field', label: '라벨' },
  { control: 'textarea', type: 'Text', label: '내용' },
  { control: 'number', type: 'List', label: '항목 수' },
  { control: 'switch', type: 'Field', label: '필수' },
  { control: 'select', type: 'Field', label: '입력 종류' },
  { control: 'stringList', type: 'List', label: '컬럼' },
  { control: 'pairList', type: 'KeyValue', label: '키-값' },
]

/** 위 표가 짚는 자리를 전부 담은 문서. `DOC`을 건드리지 않는 것은 다른 케이스가 그것에 매여 있어서다. */
const CONTROLS_DOC = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [
    {
      id: 'n-field',
      type: 'Field',
      props: { label: '이름', control: 'select', placeholder: '검색어', required: true },
    },
    { id: 'n-text', type: 'Text', props: { content: '문단', role: 'body' } },
    { id: 'n-list', type: 'List', props: { columns: ['이름'], items: 3 } },
    { id: 'n-kv', type: 'KeyValue', props: { pairs: [{ key: 'k', value: 'v' }] } },
  ],
})

function panel(): HTMLElement {
  return screen.getByRole('complementary', { name: '우측 패널' })
}

/** 라벨이 가리키는 위젯. 위젯이 아직 없는 자리는 `null`이다. */
function controlWidget(label: string): HTMLElement | null {
  return within(panel()).queryByLabelText<HTMLElement>(label)
}

/** 있어야 하는 위젯. 없으면 그 자리에서 요란하게 깨진다. */
function requireWidget(label: string): HTMLElement {
  const widget = controlWidget(label)
  if (widget === null) throw new Error(`위젯이 없다: ${label}`)
  return widget
}

/**
 * 속성 줄. 클래스로 찾는 것은 이 요소들에 접근성 이름을 붙일 이유가 없기 때문이다 —
 * 클래스가 바뀌면 여기서 빈 배열이 되어 요란하게 깨진다(`canvasFrame()`과 같은 방식).
 */
function propRows(): { label: string; value: string }[] {
  return [...panel().querySelectorAll('.wb-shell-prop')].map((row) => ({
    label: row.querySelector('.wb-shell-prop-label')?.textContent ?? '',
    // **위젯이 있으면 그 값이 사용자가 보는 값이다.** 입력의 내용은 `textContent`가 아니라
    // `value`에 있으므로, 그것을 보지 않으면 위젯이 생긴 자리가 전부 빈 문자열로 읽힌다.
    // 위젯이 없는 자리(`formatValue`가 글자로 그리는 control)는 그대로 `textContent`다.
    value: rowValue(row),
  }))
}

function rowValue(row: Element): string {
  const widget = row.querySelector<HTMLInputElement | HTMLTextAreaElement>(
    'input, textarea, select',
  )
  if (widget === null) return row.querySelector('.wb-shell-prop-value')?.textContent ?? ''
  if (widget instanceof HTMLInputElement && widget.type === 'checkbox') {
    return widget.checked ? '켜짐' : '꺼짐'
  }
  return widget.value
}

function labels(): string[] {
  return propRows().map((row) => row.label)
}

/** 구조 트리에서 노드를 고른다. 사용자가 지나는 길 그대로다. */
function select(type: string): void {
  selectAt(type, 0)
}

/** 같은 타입이 여럿일 때 몇 번째를 고를지. 문서 순서 그대로다. */
function selectAt(type: string, index: number): void {
  const buttons = within(screen.getByRole('region', { name: '구조 트리' })).getAllByRole('button', {
    name: type,
  })
  const button = buttons[index]
  if (button === undefined) throw new Error(`구조 트리에 ${type}[${index}]이 없다`)
  fireEvent.click(button)
}

describe('속성 패널', () => {
  it('선택 노드의 editor 명세대로 필드를 나열한다', async () => {
    await openPage(DOC)

    select('Field')

    // 카탈로그의 `editor` 배열 순서 그대로다. 순서를 여기 다시 적는 것은 구현이
    // `FieldDef`를 import해 그대로 훑기만 해도 통과하는 단언을 만들지 않기 위해서다 —
    // 순서가 잘못 바뀌면 이 줄이 죽어야 한다.
    expect(labels()).toEqual(['라벨', '입력 종류', '안내 문구', '필수', '비활성', '오류 상태'])
    // 어느 컴포넌트의 속성인지도 보여 준다(설계서 「설계서 화면 구조」의 패널 머리).
    expect(within(panel()).getByRole('heading').textContent).toBe('Field')
  })

  it('각 필드의 라벨과 현재 값을 보여준다', async () => {
    await openPage(DOC)

    select('Field')

    expect(propRows()).toEqual([
      { label: '라벨', value: '이름' },
      { label: '입력 종류', value: 'select' },
      { label: '안내 문구', value: '검색어' },
      // 켜짐/꺼짐으로 보여 준다. `true`를 그대로 찍으면 사용자가 읽을 문장이 아니다.
      { label: '필수', value: '켜짐' },
      // **값이 없는 스위치는 "꺼짐"으로 보인다** — 체크박스가 그리기 때문이다
      // (`formatValue(undefined)`가 그리면 빈 문자열이 된다). 체크박스에는
      // "값 없음"을 표현할 자리가 없어 **화면에서는 `false`와 구분되지 않는다** — 문서
      // 안에서는 그대로 갈린다(값이 없던 prop을 켜면 `replace`가 아니라 `add`가 나가는
      // 것을 `값이 없던 prop을 켜면 true가 들어간다`가 지킨다).
      { label: '비활성', value: '꺼짐' },
      { label: '오류 상태', value: '꺼짐' },
    ])
  })

  it('props에 없는 값은 비워 둔다', async () => {
    await openPage(DOC)

    select('Card')

    // `title`만 있고 `subtitle`은 없는 노드다. 없는 값을 그대로 찍으면 "undefined"가
    // 사용자에게 보인다.
    //
    // **맨 앞의 `변형` 줄** — 캔버스 테마의 manifest 가 `Card` 의 variant 를 선언하고
    // `variantFrom`이 없어 컨트롤이 나온다. 노드에 `variant`가 없으므로 빈 칸이다.
    expect(propRows()).toEqual([
      { label: '변형', value: '' },
      { label: '제목', value: '회원 정보' },
      { label: '부제', value: '' },
    ])
    expect(within(panel()).queryByText(/undefined/)).toBeNull()
  })

  it('List 의 컬럼은 목록 위젯이 칸마다 그린다', async () => {
    await openPage(DOC)

    select('List')

    // 캔버스 테마의 manifest 가 `List` 의 어느 variant 에도 `hideProps` 를 두지 않아 컬럼이 보인다(감춤은
    // `visible-fields.test.ts` 가 잰다).
    expect(labels()).toContain('컬럼')
    // 값은 목록 위젯이 그린다. 한 줄로 이어 붙인 글자가 아니라 칸마다 하나다.
    const cells = [...panel().querySelectorAll<HTMLInputElement>('.wb-shell-list-cell')]
    expect(cells.map((cell) => cell.value)).toEqual(['이름', '이메일'])
  })

  it('pairList는 키와 값을 각각 칸으로 그린다', async () => {
    // **지키는 성질은 `[object Object]`가 보이지 않는 것이다.** 이 자리는 `formatValue`가
    // 아니라 목록 위젯이 그리므로 칸마다 값을 본다.
    await openPage(DOC)

    select('KeyValue')

    const cells = [...panel().querySelectorAll<HTMLInputElement>('.wb-shell-list-cell')]
    expect(cells.map((cell) => cell.value)).toEqual([
      '가입일',
      '2026-01-01',
      '등급',
      'VIP',
    ])
    expect(within(panel()).queryByText(/\[object Object\]/)).toBeNull()
  })

  it('선택이 없으면 안내를 보여준다', async () => {
    await openPage(DOC)
    // **고른 것이 없는 상태를 손으로 만든다.** 페이지를 열면 스토어가 루트를 고른 채로
    // 시작하므로(`store/editor-store.ts`의 `#selectionFor`), 그냥 열어서는 이 케이스가 재려는
    // 상태가 아니다. 캔버스 빈 자리를 누르는 것이 사용자가 그 상태에 이르는 길이다.
    deselect()

    within(panel()).getByText('노드를 고르면 속성이 보입니다')
    expect(propRows()).toHaveLength(0)

    // 양성 대조: 고르면 같은 자리에 속성이 나온다.
    select('Card')

    expect(within(panel()).queryByText('노드를 고르면 속성이 보입니다')).toBeNull()
    expect(propRows().length).toBeGreaterThan(0)
  })

  it('알 수 없는 타입이면 안내를 보여준다', async () => {
    await openPage(DOC)

    select('없는타입')

    // 캔버스는 이 노드를 폴백으로 그리고 배너로 알린다. 패널도 자기 자리에서 말해야
    // 사용자가 "왜 속성이 안 나오지"를 묻지 않는다.
    within(panel()).getByText('카탈로그에 없는 컴포넌트입니다: 없는타입')
    expect(propRows()).toHaveLength(0)
  })

  it('editor 명세가 빈 컴포넌트에는 그렇다고 말한다', async () => {
    await openPage(DOC)

    // `Page`의 `editor`는 빈 배열이다. 아무것도 그리지 않으면 "고르지 않은 것"과
    // 구분되지 않는다.
    select('Page')

    within(panel()).getByText('이 컴포넌트에는 편집할 속성이 없습니다')
    expect(propRows()).toHaveLength(0)
  })

  it('카탈로그의 control 일곱에 전부 대응하는 위젯이 있다', async () => {
    // **경계는 "control마다 위젯이 있다"이다.**
    //
    // **그 "일곱"은 아래에서 세어 나온 값이다.** `NOT_YET`이 비어 있는 것이 전부 덮였다는
    // 표시이고, 카탈로그에 새 control이 생기면 두 목록의 합이
    // 어긋나 여기서 죽는다.
    await openPage(CONTROLS_DOC)

    // **분모를 손으로 적지 않는다.** 카탈로그가 실제로 쓰는 control 집합을 세어
    // 두 목록의 합과 맞춘다 — 카탈로그에 여덟 번째 control이 생기면 여기서 죽는다.
    expect(new Set([...WIDGET_CONTROLS, ...NOT_YET])).toEqual(catalogControls())

    for (const { control, type, label } of CONTROL_SAMPLES) {
      select(type)
      const widget = controlWidget(label)
      if (WIDGET_CONTROLS.includes(control)) {
        expect(widget, `${control}에는 위젯이 있어야 한다`).not.toBeNull()
      } else {
        // 아직 위젯이 없는 자리는 `formatValue`가 그린 글자만 있다.
        expect(widget, `${control}은 아직 위젯이 없다`).toBeNull()
      }
    }
  })

  it('값을 문자열로 만들 수 없어도 셸은 살아 있다', async () => {
    await openPage(THROWING_DOC)

    select('Card')

    // **`Card.title`은 `text` control이라 위젯이 그리고**, 위젯은 객체 값을 빈 칸으로
    // 시작한다(`controls/text-control.tsx`의 `toDraft`) — `JSON.stringify`를 부르지 않으므로
    // 던질 일이 없다(`formatValue`가 그리는 자리라면 `(표시할 수 없는 값)`이 나온다).
    //
    // 나머지 줄이 그대로인 것이 양성 대조다 — 패널이 통째로 무너지거나 아무것도 그리지
    // 않는 구현은 이 단언을 통과할 수 없다.
    expect(propRows()).toEqual([
      // 변형 줄. `Card`는 `variants`가 있고 노드에 `variant`가 없어 빈 칸이다.
      { label: '변형', value: '' },
      { label: '제목', value: '' },
      { label: '부제', value: '부제' },
    ])
    // 셸도 그대로다.
    screen.getByRole('heading', { name: PROJECT_NAME })
  })

  it('type이 문자열이 아닌 노드를 골라도 셸은 살아 있다', async () => {
    await openPage(BROKEN_TYPE_DOC)

    select('(타입을 읽을 수 없는 노드)')

    // "카탈로그에 없다"와 다른 문장이어야 한다. 앞은 이름을 잘못 적은 문서이고, 이쪽은
    // 노드의 모양 자체가 깨진 것이라 사용자가 할 일이 다르다.
    within(panel()).getByText('이 노드의 타입을 읽을 수 없습니다')
    expect(propRows()).toHaveLength(0)
    // 셸이 남아 있다. 가드를 지우면 여기까지 오지 못하고 `.wb-shell`이 DOM에서 사라진다.
    screen.getByRole('heading', { name: PROJECT_NAME })
    expect(document.body.querySelector('.wb-shell')).not.toBeNull()
  })

  it('children 배열 안에 노드가 아닌 원소가 있어도 노드를 고를 수 있다', async () => {
    // **이 패널도 `edit/`·구조 트리처럼 `safe-walk`로 노드를 찾는다** — schema의
    // `findNode`를 쓰면 `<App />` 층에서 이 자리만 열린다.
    //
    // `findNode`로 되돌리면: 그 문서로 **열기만** 하면 셸이 산다(패널이 노드를 찾지 않는다).
    // **노드를 고르는 순간** `reading 'id'`로 던지고 `.wb-shell`이 DOM에서 사라진다.
    //
    // **도달 경로는 없다** — 서버가 봉투를 검증하고 `WbNodeSchema`가 `children` 원소를
    // 본다. 그래도 닫는 것은 `edit/safe-walk.ts` 머리말이 *"구조 트리·속성 패널은 오류
    // 경계 밖"*이라고 이 패널을 명시하기 때문이다: 그 성질이 셸 전체로 성립해야 한다.
    await openPage(
      pageDoc({
        id: 'n-root',
        type: 'Page',
        children: [
          null as unknown as WbNode,
          { id: 'n-text', type: 'Text', props: { content: '살아 있다' } },
        ],
      }),
    )

    select('Text')

    expect(document.body.querySelector('.wb-shell')).not.toBeNull()
    expect(propRows()).toContainEqual({ label: '내용', value: '살아 있다' })
  })

  it('props가 아예 없는 노드를 골라도 값 자리만 빈다', async () => {
    await openPage(NO_PROPS_DOC)

    select('Card')

    // 필드는 카탈로그에서 나오므로 그대로 있고, 값만 전부 빈다. **패널이 통째로 사라지는
    // 구현은 이 단언을 통과할 수 없다** — 그것이 여기 `propRows()`를 쓰는 이유다.
    expect(propRows()).toEqual([
      // `variant`도 없는 노드다 — 봉투 필드라 `readProp`을 지나지 않고 빈 칸이 된다.
      { label: '변형', value: '' },
      { label: '제목', value: '' },
      { label: '부제', value: '' },
    ])
    // `readProp`의 `?.`를 걷어내면 여기까지 오지 못하고 셸이 통째로 사라진다. 이 패널은
    // 캔버스의 오류 경계 **밖**이다(`property-panel.tsx`의 `stringify` 주석).
    screen.getByRole('heading', { name: PROJECT_NAME })
    expect(document.body.querySelector('.wb-shell')).not.toBeNull()
  })

  it('props가 객체가 아닌 노드를 골라도 셸은 살아 있다', async () => {
    await openPage(NO_PROPS_DOC)

    select('Field')

    // 필드는 그대로 나오고 **값을 든 자리가 하나도 없다.** 줄 수를 여기서 다시 못박지 않는
    // 것은 카탈로그가 바뀔 때 이 케이스가 이유 없이 어긋나기 때문이다 — `Field`의 `editor`
    // 여섯 줄은 위 `선택 노드의 editor 명세대로 필드를 나열한다`가 이미 지킨다.
    //
    // **"빈 문자열"이 아니라 "빈 값"으로 본다.** 스위치 자리는 체크박스가 그리므로 값이
    // 없어도 `꺼짐`으로 읽히고(위 케이스에 그 사실을 적었다), 그것은 "props를 읽지
    // 못했다"와 다른 말이 아니다 — 읽지 못한 스위치는 꺼진 것으로 보인다.
    const values = propRows().map((row) => row.value)
    // 양성 대조: 값이 실제로 그려진 상태에서 세야 뜻이 있다(빈 패널은 당연히 통과한다).
    expect(values.length).toBeGreaterThan(0)
    expect(values.every((value) => value === '' || value === '꺼짐')).toBe(true)
    screen.getByRole('heading', { name: PROJECT_NAME })
    expect(document.body.querySelector('.wb-shell')).not.toBeNull()
  })

  it('문서가 없으면 안내를 보여준다', async () => {
    renderEditor({ route: PROJECT_ROUTE, docs: { [PAGE_ID]: DOC } })
    await screen.findByRole('heading', { name: PROJECT_NAME })

    // 페이지를 열지 않은 상태. 선택이 없을 때와 같은 안내다 — 둘 다 "고를 노드가 아직
    // 없다"이고, 사용자가 할 일도 같다.
    within(panel()).getByText('노드를 고르면 속성이 보입니다')
  })
})

/**
 * 편집이 실제로 나가는지 보는 자리. **`patchOps`를 가짜로 끼워 호출을 센다** — 위 케이스들이
 * `openPage`의 기본 가짜를 쓰는 것과 달리, 여기서는 나가는 본문까지 봐야 한다.
 */
function editable(): { calls: { ops: unknown }[]; api: Partial<ApiClient> } {
  const calls: { ops: unknown }[] = []
  let seq = 7
  const patchOps: ApiClient['patchOps'] = async (_projectId, _pageId, body) => {
    calls.push({ ops: body.ops })
    seq += 1
    const result: PatchResult = {
      seq,
      revisionId: `rev-${seq}`,
      inverse: [],
      schemaVersion: 1,
      ...(body.clientOpId === undefined ? {} : { clientOpId: body.clientOpId }),
    }
    return result
  }
  return { calls, api: { patchOps } }
}

/** 마지막 요청이 실은 ops. 요청이 없으면 `null`이다. */
function lastOps(calls: { ops: unknown }[]): unknown {
  return calls.at(-1)?.ops ?? null
}

const EDIT_DOC = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [
    { id: 'n-text', type: 'Text', props: { content: '옛 내용', role: 'body' } },
    { id: 'n-text2', type: 'Text', props: { content: '둘째 내용', role: 'body' } },
    { id: 'n-list', type: 'List', props: { columns: ['이름'], items: 3 } },
  ],
})

/** 캔버스에 그려진 노드의 글자. 낙관적 적용이 화면까지 닿았는지 본다. */
function canvasTextOf(nodeId: string): string {
  const node = canvasQuery(`[data-wb-id="${nodeId}"]`)
  if (node === null) throw new Error(`캔버스에 노드가 없다: ${nodeId}`)
  return node.textContent ?? ''
}

describe('속성 패널 — 텍스트·수 입력 (blur/Enter 커밋)', () => {
  it('text 필드에 값을 넣고 blur하면 편집이 나간다', async () => {
    const { calls, api } = editable()
    await openPage(EDIT_DOC, { apiOverrides: api })

    selectAt('Text', 0)
    const input = requireWidget('내용')
    fireEvent.change(input, { target: { value: '새 내용' } })
    fireEvent.blur(input)

    await waitFor(() => expect(calls).toHaveLength(1))
    expect(lastOps(calls)).toEqual([
      { op: 'replace', path: '/root/children/0/props/content', value: '새 내용' },
    ])
  })

  it('Enter로도 나간다', async () => {
    const { calls, api } = editable()
    await openPage(EDIT_DOC, { apiOverrides: api })

    select('List')
    const input = requireWidget('항목 수')
    fireEvent.change(input, { target: { value: '9' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() => expect(calls).toHaveLength(1))
    expect(lastOps(calls)).toEqual([
      { op: 'replace', path: '/root/children/2/props/items', value: 9 },
    ])
  })

  it('타이핑만으로는 나가지 않는다', async () => {
    // **텍스트 커밋 규칙(blur/Enter)의 핵심이다.** 글자마다 요청하는 구현을 잡는다 — 그런 구현은 undo 한 단계가
    // 글자 하나가 되어 이력이 무의미해지고, 요청 수가 타이핑 속도에 비례한다.
    const { calls, api } = editable()
    await openPage(EDIT_DOC, { apiOverrides: api })

    selectAt('Text', 0)
    const input = requireWidget('내용')
    fireEvent.change(input, { target: { value: '새' } })
    fireEvent.change(input, { target: { value: '새 내' } })
    fireEvent.change(input, { target: { value: '새 내용' } })

    // 화면에는 보이지만 서버로는 나가지 않는다.
    expect((input as HTMLInputElement).value).toBe('새 내용')
    expect(calls).toHaveLength(0)
  })

  it('값이 그대로면 blur해도 나가지 않는다', async () => {
    // blur마다 revision이 나면 이력이 무의미해진다.
    const { calls, api } = editable()
    await openPage(EDIT_DOC, { apiOverrides: api })

    selectAt('Text', 0)
    const input = requireWidget('내용')
    fireEvent.focus(input)
    fireEvent.blur(input)

    expect(calls).toHaveLength(0)
  })

  it('number 필드는 수로 나간다', async () => {
    const { calls, api } = editable()
    await openPage(EDIT_DOC, { apiOverrides: api })

    select('List')
    const input = requireWidget('항목 수')
    fireEvent.change(input, { target: { value: '5' } })
    fireEvent.blur(input)

    await waitFor(() => expect(calls).toHaveLength(1))
    // `'5'`가 아니라 `5`다. 문자열로 나가면 서버의 카탈로그 검증이 422를 낸다.
    expect(lastOps(calls)).toEqual([
      { op: 'replace', path: '/root/children/2/props/items', value: 5 },
    ])
  })

  it('수가 아닌 입력은 나가지 않는다', async () => {
    const { calls, api } = editable()
    await openPage(EDIT_DOC, { apiOverrides: api })

    select('List')
    const input = requireWidget('항목 수')
    fireEvent.change(input, { target: { value: 'abc' } })
    fireEvent.blur(input)

    expect(calls).toHaveLength(0)
  })

  it('빈 수 입력도 나가지 않는다', async () => {
    // `Number('')`은 `0`이다. 빈 칸을 0으로 보내면 사용자가 지우기만 해도 값이 바뀐다.
    const { calls, api } = editable()
    await openPage(EDIT_DOC, { apiOverrides: api })

    select('List')
    const input = requireWidget('항목 수')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.blur(input)

    expect(calls).toHaveLength(0)
  })

  it('textarea는 여러 줄을 담는다', async () => {
    const { calls, api } = editable()
    await openPage(EDIT_DOC, { apiOverrides: api })

    selectAt('Text', 0)
    const input = requireWidget('내용')
    expect(input.tagName).toBe('TEXTAREA')

    fireEvent.change(input, { target: { value: '첫 줄\n둘째 줄' } })
    fireEvent.blur(input)

    await waitFor(() => expect(calls).toHaveLength(1))
    expect(lastOps(calls)).toEqual([
      { op: 'replace', path: '/root/children/0/props/content', value: '첫 줄\n둘째 줄' },
    ])
  })

  it('textarea에서 Enter는 커밋이 아니라 줄바꿈이다', async () => {
    // `Enter`가 모든 control에서 커밋이면 여러 줄을 칠 수 없다 —
    // 케이스 `textarea는 여러 줄을 담는다`는 `fireEvent.change`로 값을 통째로 넣으므로
    // 그 함정을 지나간다.
    const { calls, api } = editable()
    await openPage(EDIT_DOC, { apiOverrides: api })

    selectAt('Text', 0)
    const input = requireWidget('내용')
    fireEvent.change(input, { target: { value: '첫 줄' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(calls).toHaveLength(0)
  })

  it('편집한 값이 캔버스에 반영된다', async () => {
    // 낙관적 적용이 화면까지 닿는지 본다 — 패널만 보는 구현을 잡는다.
    const { calls, api } = editable()
    await openPage(EDIT_DOC, { apiOverrides: api })

    selectAt('Text', 0)
    const input = requireWidget('내용')
    fireEvent.change(input, { target: { value: '캔버스까지' } })
    fireEvent.blur(input)

    await waitFor(() => expect(calls).toHaveLength(1))
    expect(canvasTextOf('n-text')).toBe('캔버스까지')
  })

  it('다른 노드를 고르면 입력이 그 노드 값으로 바뀐다', async () => {
    const { api } = editable()
    await openPage(EDIT_DOC, { apiOverrides: api })

    selectAt('Text', 0)
    expect((requireWidget('내용') as HTMLTextAreaElement).value).toBe('옛 내용')

    // 같은 타입의 다른 노드다 — `editor` 명세가 같아 줄이 재조정되므로, 로컬 초안을
    // 버리는 장치가 없으면 앞 노드의 값이 그대로 남는다.
    selectAt('Text', 1)

    expect((requireWidget('내용') as HTMLTextAreaElement).value).toBe('둘째 내용')
  })

  it('포커스가 안 옮겨 간 채 캔버스로 노드가 바뀌면 커밋되지 않은 타이핑은 버려진다 — `key` 장치', async () => {
    // **이 케이스가 재는 것은 장치이지 사용자가 겪는 일이 아니다** — `test/edit/
    // undo-redo.test.tsx`의 트리 판과 같다. `fireEvent.click`은 포커스를 옮기지 않으므로
    // blur 없이 선택이 바뀌고, 그때 `key`가 초안을 버린다(근거는 `panels/property-panel.tsx`의
    // `PropControl` 주석).
    //
    // ***"구조 트리로 고르면 blur가 나고, 캔버스는 `<div onClick>`이라 blur가 없다"*고 읽으면
    // 거꾸로다** — jsdom 에서는 둘 다 blur 가 없고(트리 판이 잰다), **Chrome 에서는 둘 다
    // blur 가 난다** — 캔버스의 `<div>`를 누르면 포커스가 `BODY`로 가며 `focusout TEXTAREA → null`이
    // 나고 원래 노드로 커밋된다(Chrome 실측). 실브라우저의 클릭은 아래 «실브라우저의 클릭은 …» 절이 잰다.
    const { calls, api } = editable()
    await openPage(EDIT_DOC, { apiOverrides: api })

    selectAt('Text', 0)
    fireEvent.change(requireWidget('내용'), { target: { value: '버려질 타이핑' } })

    const other = canvasQuery('[data-wb-id="n-text2"]')
    if (other === null) throw new Error('캔버스에 둘째 노드가 없다')
    fireEvent.click(other)

    // 초안은 나가지 않았고, 입력은 새 노드의 값이다.
    expect(calls).toHaveLength(0)
    expect((requireWidget('내용') as HTMLTextAreaElement).value).toBe('둘째 내용')
  })
})

/**
 * **실브라우저의 클릭은 선택이 바뀌기 전에 커밋한다**(Chrome 실측 — `panels/
 * property-panel.tsx`의 `PropControl` 주석의 표). 위 절의 «포커스가 안 옮겨 간 채 …» 둘은
 * `fireEvent.click`이 포커스를 안 옮겨서 생기는 **장치의 값**이고, 이 절이 **사용자가 겪는
 * 값**을 잰다. 흉내는 `test/click-as-browser.ts`의 `clickAsBrowser`다.
 *
 * **그 흉내가 맞는지는 Chrome 표로 대조한다** — 위젯 다섯 × 클릭 갈래 다섯, 25칸 전부에서
 * 나간 편집 수 · 페이지 · 경로 · 돌아와 본 값 · focusout 순서가 같다(대조용 가짜 서버는
 * 커밋을 기억하게 한다). `fireEvent.click`으로 재면 25칸 전부 «0건 · 옛 값»이다. 키(Enter·
 * Tab·Esc)와 창 닫기·뒤로 가기는 이 흉내의 밖이다. **흉내를 고치면 표를 다시 댄다**(갈래까지의
 * 값은 `test/click-as-browser.ts`의 머리말).
 *
 * **이 절이 잡는 회귀는 «누르면 포커스를 안 빼앗게» 하는 손질이다** — 누른 요소의
 * **`pointerdown`이나 `mousedown`**에 `preventDefault()`를 걸면 실브라우저에서 blur 가 안 나 친
 * 글자가 사라진다. 흉내도 그때 포커스를 안 옮긴다(`clickAsBrowser`의 1·2번). **`mousedown`만
 * 존중하는 흉내로는 모자란다** — 탭·캔버스의 `onPointerDown`에 걸면 Chrome 은 편집 0건 · 옛 값인데
 * 그 흉내로는 이 절이 산다(web 전량 0 사망). 이 앱에 이미 그 꼴이 있다(`ShellResizer`).
 *
 * **다섯이 각각 혼자 죽는다** — 변조를 하나씩 심고 매번 복구해서 `--project web` 전체로 잰다.
 * 줄마다 `onMouseDown` 판과 `onPointerDown` 판을 **따로** 심고, 둘 다 그 케이스 하나만 죽인다:
 *
 * | 변조 — 그 자리의 누르는 이벤트에 `preventDefault()` | 혼자 죽는 것 |
 * |---|---|
 * | 우측 패널의 탭 버튼(`routes/editor.tsx`의 `RightPanel`) | *"다른 탭을 누르면 …"* |
 * | 모드 토글의 «뷰 모드» 버튼(`ShellTools`) | *"모드를 바꾸면 …"* |
 * | 구조 트리의 줄 버튼(`panels/structure-tree.tsx`) | *"트리로 다른 노드를 누르면 …"* |
 * | 캔버스의 표면(`canvas/canvas.tsx`) | *"캔버스로 다른 노드를 누르면 …"* |
 * | 메뉴 트리의 페이지 링크(`panels/menu-tree.tsx`) | *"메뉴로 다른 페이지를 누르면 …"* |
 *
 * **흉내에서 포커스 이동을 빼면 다섯이 함께 죽는다** — 흉내가 `fireEvent.click`과 같아진다.
 * 포커스 대상에서 `button`·`a[href]`·`[tabindex]`를 빼면 *"다른 탭을 누르면 …"*이 혼자 죽는다 —
 * 커밋은 `BODY`로 blur 해도 나므로 그 케이스가 **활성 요소**까지 본다.
 *
 * **흉내 자신의 검사 둘**(끝의 두 케이스)이 흉내의 1·2번을 지킨다:
 *
 * | 변조 — 흉내를 약하게 | 혼자 죽는 것 |
 * |---|---|
 * | `pointerdown`의 `preventDefault()`를 무시한다(또는 `mousedown`만 존중하는 흉내로 되돌린다) | *"… `pointerdown`을 막으면 커밋이 없다 …"* |
 * | `mousedown`의 `preventDefault()`를 무시한다 | *"… `mousedown`을 막으면 커밋이 없다 …"* |
 *
 * **이 검사 둘이 없으면 흉내를 약하게 해도 아무것도 안 죽고**, 제품 회귀와 겹치면(탭 `mousedown` 막음 +
 * 흉내가 그것을 무시) 그 회귀도 안 잡힌다(0 사망). 두 겹침 모두 흉내 검사가 혼자 죽는다.
 *
 * **실패 방향도 대조한다** — 위 표의 탭·캔버스 변조(두 이벤트 다)를 Chrome 에 런타임 리스너로
 * 심으면 실제로 편집 0건 · 돌아와 본 칸이 옛 값이다. 곧 이 절이 죽는 자리에서 사용자도 글자를
 * 잃는다.
 */
describe('속성 패널 — 실브라우저의 클릭은 선택이 바뀌기 전에 원래 노드로 커밋한다', () => {
  /** 편집을 받아 적는 가짜. **어느 페이지로 갔는지**도 적는다 — 페이지 갈래가 그것을 본다. */
  function pagedEdits(): { calls: { pageId: string; ops: unknown }[]; api: Partial<ApiClient> } {
    const calls: { pageId: string; ops: unknown }[] = []
    let seq = 7
    const patchOps: ApiClient['patchOps'] = async (_projectId, pageId, body) => {
      calls.push({ pageId, ops: body.ops })
      seq += 1
      const result: PatchResult = {
        seq,
        revisionId: `rev-${seq}`,
        inverse: [],
        schemaVersion: 1,
        ...(body.clientOpId === undefined ? {} : { clientOpId: body.clientOpId }),
      }
      return result
    }
    return { calls, api: { patchOps } }
  }

  /** 첫 `Text`를 고르고 «내용» 칸을 **눌러** 친다 — 누르는 것이 포커스를 준다. */
  async function typing(): Promise<{ calls: { pageId: string; ops: unknown }[] }> {
    const { calls, api } = pagedEdits()
    await openPage(EDIT_DOC, { docs: { [OTHER_PAGE_ID]: EDIT_DOC }, apiOverrides: api })
    selectAt('Text', 0)
    const box = requireWidget('내용')
    clickAsBrowser(box)
    fireEvent.change(box, { target: { value: '새 내용' } })
    expect(calls).toHaveLength(0)
    return { calls }
  }

  const FIRST_TEXT = [{ op: 'replace', path: '/root/children/0/props/content', value: '새 내용' }]

  it('다른 탭을 누르면 커밋되고, 돌아와도 그 값이다', async () => {
    const { calls } = await typing()

    const tab = screen.getByRole('tab', { name: '코멘트' })
    clickAsBrowser(tab)
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toEqual({ pageId: PAGE_ID, ops: FIRST_TEXT })
    // **포커스가 누른 버튼으로 간다**(Chrome 실측: `focusout TEXTAREA → BUTTON`, 활성 요소 `BUTTON`).
    // 커밋은 `BODY`로 blur 해도 나므로 커밋 수만 보면 흉내가 버튼을 포커스하는지 아무도 안 잰다.
    expect(document.activeElement).toBe(tab)

    fireEvent.click(screen.getByRole('tab', { name: '속성' }))
    expect((requireWidget('내용') as HTMLTextAreaElement).value).toBe('새 내용')
  })

  it('모드를 바꾸면 커밋된다', async () => {
    const { calls } = await typing()

    clickAsBrowser(screen.getByRole('button', { name: '뷰 모드' }))
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toEqual({ pageId: PAGE_ID, ops: FIRST_TEXT })
  })

  it('트리로 다른 노드를 누르면 원래 노드로 커밋된다 — 새 노드가 아니다', async () => {
    const { calls } = await typing()

    clickAsBrowser(
      within(screen.getByRole('region', { name: '구조 트리' })).getAllByRole('button', { name: 'Text' })[1]!,
    )
    await waitFor(() => expect(calls).toHaveLength(1))
    // **경로가 첫 노드다.** 새 노드로 갔다면 `children/1`이다 — 그것이 더 나쁜 손실이다
    // (앞 노드에 친 글이 다른 노드의 값이 된다).
    expect(calls[0]).toEqual({ pageId: PAGE_ID, ops: FIRST_TEXT })
    expect((requireWidget('내용') as HTMLTextAreaElement).value).toBe('둘째 내용')
  })

  it('캔버스로 다른 노드를 누르면 원래 노드로 커밋된다', async () => {
    const { calls } = await typing()

    const other = canvasQuery('[data-wb-id="n-text2"]')
    if (other === null) throw new Error('캔버스에 둘째 노드가 없다')
    clickAsBrowser(other)
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toEqual({ pageId: PAGE_ID, ops: FIRST_TEXT })
    expect((requireWidget('내용') as HTMLTextAreaElement).value).toBe('둘째 내용')
  })

  it('메뉴로 다른 페이지를 누르면 원래 페이지로 커밋된다', async () => {
    const { calls } = await typing()

    clickAsBrowser(
      within(screen.getByRole('region', { name: '메뉴·페이지 트리' })).getByRole('link', {
        name: OTHER_PAGE_TITLE,
      }),
    )
    await waitFor(() => expect(calls).toHaveLength(1))
    // **페이지가 앞 페이지다.** 옆 페이지로 갔다면 남의 페이지에 그 글이 들어간다.
    expect(calls[0]).toEqual({ pageId: PAGE_ID, ops: FIRST_TEXT })
  })

  /**
   * **흉내 자신의 검사 둘.** 위 다섯은 흉내가 «커밋된다»고 말하는 쪽만 재므로, 흉내가
   * 누르는 이벤트의 `preventDefault()`를 **존중하는지** — 이 절이 잡으려는 회귀가 그것에 달려
   * 있다 — 는 이 둘이 없으면 아무도 안 잰다(그 가지를 지워도 web 전량 0 사망).
   *
   * 막는 것은 **런타임의 네이티브 리스너**다 — Chrome 에 심는 것과 같은 꼴이라 두 값을
   * 나란히 댈 수 있다. Chrome 값: 탭 + `pointerdown` 막음 → 편집 0 ·
   * 돌아오면 옛 값. 탭 + `mousedown` 막음 → 같음. 막지 않으면 위 *"다른 탭을 누르면 …"* — 1건.
   */
  async function noCommitAfter(block: 'pointerdown' | 'mousedown'): Promise<void> {
    const { calls } = await typing()
    const tab = screen.getByRole('tab', { name: '코멘트' })
    tab.addEventListener(block, (event) => event.preventDefault())

    clickAsBrowser(tab)
    // 커밋은 낙관적으로 먼저 문서에 얹히고 요청은 그 뒤에 나간다 — 한 틱 기다려 둘 다 본다.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
    expect(calls).toHaveLength(0)

    fireEvent.click(screen.getByRole('tab', { name: '속성' }))
    expect((requireWidget('내용') as HTMLTextAreaElement).value).toBe('옛 내용')
  }

  it('누르는 자리가 `pointerdown`을 막으면 커밋이 없다 — 흉내 자신의 검사', async () => {
    await noCommitAfter('pointerdown')
  })

  it('누르는 자리가 `mousedown`을 막으면 커밋이 없다 — 흉내 자신의 검사', async () => {
    await noCommitAfter('mousedown')
  })
})

/** `props`가 아예 없는 노드. 스위치를 처음 켜는 경로가 지나는 자리다. */
const SWITCH_DOC = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [
    { id: 'n-field', type: 'Field', props: { label: '이름', required: true } },
    { id: 'n-bare', type: 'Field' },
    { id: 'n-text', type: 'Text', props: { content: '문단', role: 'body' } },
    { id: 'n-noopt', type: NO_OPTIONS_TYPE, props: { items: 2 } },
  ],
})

describe('속성 패널 — 스위치·선택 (즉시 커밋)', () => {
  it('스위치를 누르면 즉시 편집이 나간다', async () => {
    // blur를 기다리지 않는다 — 중간 상태가 없는 조작이라 미룰 이유가 없다.
    const { calls, api } = editable()
    await openPage(SWITCH_DOC, { apiOverrides: api })

    selectAt('Field', 0)
    fireEvent.click(requireWidget('필수'))

    await waitFor(() => expect(calls).toHaveLength(1))
  })

  it('스위치는 불리언으로 나간다', async () => {
    const { calls, api } = editable()
    await openPage(SWITCH_DOC, { apiOverrides: api })

    selectAt('Field', 0)
    fireEvent.click(requireWidget('필수'))

    await waitFor(() => expect(calls).toHaveLength(1))
    // `'on'`이 아니라 `false`다. 체크박스의 폼 값을 그대로 보내는 구현을 잡는다.
    expect(lastOps(calls)).toEqual([
      { op: 'replace', path: '/root/children/0/props/required', value: false },
    ])
  })

  it('값이 없던 prop을 켜면 true가 들어간다', async () => {
    // **`props`가 없는 노드다.** `propOps`의 세 갈래 중 통째 `add`가 지나는 자리이고,
    // 그 갈래가 없으면 `applyOps`가 던지고, 로컬 적용이 던진 편집은 요청으로 나가지 않는다.
    const { calls, api } = editable()
    await openPage(SWITCH_DOC, { apiOverrides: api })

    selectAt('Field', 1)
    expect((requireWidget('필수') as HTMLInputElement).checked).toBe(false)
    fireEvent.click(requireWidget('필수'))

    await waitFor(() => expect(calls).toHaveLength(1))
    expect(lastOps(calls)).toEqual([
      { op: 'add', path: '/root/children/1/props', value: { required: true } },
    ])
  })

  it('select는 고른 값을 즉시 낸다', async () => {
    const { calls, api } = editable()
    await openPage(SWITCH_DOC, { apiOverrides: api })

    selectAt('Text', 0)
    fireEvent.change(requireWidget('역할'), { target: { value: 'h2' } })

    await waitFor(() => expect(calls).toHaveLength(1))
    expect(lastOps(calls)).toEqual([
      { op: 'replace', path: '/root/children/2/props/role', value: 'h2' },
    ])
  })

  it('select의 선택지는 카탈로그의 options다', async () => {
    await openPage(SWITCH_DOC)

    selectAt('Text', 0)
    const options = [...requireWidget('역할').querySelectorAll('option')].map((o) => o.value)

    // `TextDef`의 `role` 필드가 선언한 그대로다. 손으로 적는 것은 카탈로그를 import해
    // 훑기만 해도 통과하는 단언을 만들지 않기 위해서다.
    expect(options).toEqual([
      'display',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'body',
      'caption',
    ])
  })

  it('options가 없는 select는 그리지 않는다', async () => {
    // 카탈로그의 실수를 화면이 흡수하면 안 된다 — 빈 `<select>`는 고를 것이 없는데도
    // 편집할 수 있는 것처럼 보인다.
    await openPage(SWITCH_DOC)

    select(NO_OPTIONS_TYPE)

    // 위젯이 없고, 값은 `formatValue`가 그린 글자로 남는다 — 줄이 통째로 비면 사용자가
    // 값을 볼 수 없다.
    //
    // **`select`를 세는 대신 그 줄의 위젯을 본다.** 이 프로브는 `ListDef`를 빌려 만들었고
    // 그쪽 `variants`가 비어 있지 않아 변형 컨트롤이 `<select>` 하나를 그린다 —
    // 패널 전체에서 `select`를 세면 그것에 걸린다. 이 케이스가 지키는 것은
    // **options 없는 필드의 위젯**이므로 그 줄만 본다.
    expect(controlWidget('선택지 없는 필드')).toBeNull()
    expect(propRows()).toContainEqual({ label: '선택지 없는 필드', value: '2' })

    // 양성 대조: options가 있는 자리는 그린다.
    selectAt('Field', 0)
    expect(controlWidget('입력 종류')).not.toBeNull()
  })

  it('편집이 실패하면 재조회가 서버 값을 되비춘다 — 고르던 자리는 그대로다', async () => {
    // `loadPage`는 **같은 페이지를 다시 싣는 경로에서 선택을 건드리지 않으므로**
    // (`store/editor-store.ts`의 `#selectionFor`) 위젯이 마운트된 채 문서만 갈린다 — 이
    // 케이스가 그것을 직접 잰다. 재조회가 선택을 비우면 위젯이 아예 사라져, 재조회 경로에서
    // 스위치가 문서를 비추는지 볼 수 없게 된다.
    //
    // **고정하는 것은 *"고르던 자리에 남은 채 서버 값이 되비친다"*이다.** 위젯이
    // 자기 `useState`만 보고 그리는 구현은 여기서 죽는다(꺼진 채로 남는다) — 아래
    // `문서가 밖에서 바뀌면 스위치가 새 값을 비춘다`와 같은 자리를 실패 경로에서 잡는다.
    let getPageCalls = 0
    const getPage: ApiClient['getPage'] = async (_projectId, pageId) => {
      getPageCalls += 1
      return pageDetail(pageId, SWITCH_DOC)
    }
    const patchOps: ApiClient['patchOps'] = () =>
      Promise.reject(new ApiError(409, 'conflict', '문서가 이미 바뀌었습니다'))

    await openPage(SWITCH_DOC, { apiOverrides: { getPage, patchOps } })

    selectAt('Field', 0)
    expect((requireWidget('필수') as HTMLInputElement).checked).toBe(true)

    fireEvent.click(requireWidget('필수'))
    // 낙관적으로 꺼졌다.
    expect((requireWidget('필수') as HTMLInputElement).checked).toBe(false)

    await waitFor(() => expect(getPageCalls).toBe(2))

    // 다시 고르지 않는다 — 그대로 있는 위젯이 서버 값(`true`)으로 돌아온다.
    await waitFor(() => expect((requireWidget('필수') as HTMLInputElement).checked).toBe(true))
    // 안내로 돌아가지 않았다는 것이 "선택이 남았다"의 다른 면이다.
    expect(within(panel()).queryByText('노드를 고르면 속성이 보입니다')).toBeNull()
  })

  it('연속으로 두 번 누르면 두 편집이 순서대로 나간다', async () => {
    // 편집 큐의 순서 규칙이 스위치에도 적용된다 — 두 요청이 겹치지 않고 순서대로 나간다.
    const { calls, api } = editable()
    await openPage(SWITCH_DOC, { apiOverrides: api })

    selectAt('Field', 0)
    fireEvent.click(requireWidget('필수'))
    await waitFor(() => expect(calls).toHaveLength(1))
    fireEvent.click(requireWidget('필수'))

    await waitFor(() => expect(calls).toHaveLength(2))
    expect(calls.map((call) => call.ops)).toEqual([
      [{ op: 'replace', path: '/root/children/0/props/required', value: false }],
      [{ op: 'replace', path: '/root/children/0/props/required', value: true }],
    ])
  })

  it('스위치는 문서의 값을 그대로 비춘다', async () => {
    // **이 케이스는 초기 렌더 값만 본다 — 로컬 state를 드는 구현을 잡지 못한다.**
    // 그쪽도 `value`로 초기화하므로 같은 값을 낸다(실측: `SwitchControl`에 `useState`를
    // 들게 해도 web 전량 0 사망). 그것을 잡는 것은 아래
    // `문서가 밖에서 바뀌면 스위치가 새 값을 비춘다`이고, 그 케이스는 위젯이 **마운트된 채**
    // 문서만 갈리는 자리를 만든다.
    await openPage(SWITCH_DOC)

    selectAt('Field', 0)
    expect((requireWidget('필수') as HTMLInputElement).checked).toBe(true)
    expect((requireWidget('비활성') as HTMLInputElement).checked).toBe(false)
  })
})

/**
 * 위젯이 **마운트된 채** 문서만 갈리는 자리. 그것이 "컨트롤이 문서를 비춘다"가 로컬 state를
 * 드는 구현과 갈리는 유일한 조건이다.
 *
 * 스토어 API만으로 만든다 — 프로덕션 코드를 건드리지 않고, `loadPage`와 `selectNode`를
 * **한 `act()` 배치**에 넣어 React가 둘을 함께 커밋하게 한다. 그러면 `key`(= 노드 id)가
 * 그대로라 언마운트가 없다. (`loadPage`는 같은 페이지를 다시 실을 때 새 문서에 그 노드가
 * 있으면 선택을 둔다 — `store/editor-store.ts`의 `#selectionFor`. 선택이 비는 것은 그 노드가
 * 새 문서에 없을 때다.)
 *
 * **undo가 이 자리의 실제 경로다** — `applyEdit`은 `selectedNodeId`를 건드리지
 * 않으므로 undo가 문서를 갈아 끼울 때 위젯이 마운트된 채 남는다. 그쪽은
 * `test/edit/undo-redo.test.tsx`의 `undo하면 속성 패널의 스위치도 되돌아간다`가 잡는다.
 */
describe('문서가 밖에서 바뀔 때', () => {
  const NODE_ID = 'n-field'

  function fieldDoc(required: boolean, label: string): ReturnType<typeof pageDoc> {
    return pageDoc({
      id: 'n-root',
      type: 'Page',
      children: [{ id: NODE_ID, type: 'Field', props: { label, required } }],
    })
  }

  /** 셸 없이 패널만 세운다 — 셸이 쥐는 바인딩은 시험용 공급자가 준다(저장소 테마 그대로). */
  const Theme = withProjectTheme()

  function mountPanel(store: EditorStore): void {
    render(
      <ApiProvider client={fakeApi()}>
        <Theme>
          <EditorStoreProvider store={store}>
            <PropertyPanel projectId="p-1" pageId="pg-1" canEdit />
          </EditorStoreProvider>
        </Theme>
      </ApiProvider>,
    )
  }

  it('문서가 밖에서 바뀌면 스위치가 새 값을 비춘다', async () => {
    const store = new EditorStore()
    store.loadPage('pg-1', fieldDoc(true, '이름'), 7)
    store.selectNode(NODE_ID)
    mountPanel(store)

    expect((screen.getByLabelText('필수') as HTMLInputElement).checked).toBe(true)

    // **한 배치다** — 둘을 한 커밋에 넣는다(위 머리말).
    act(() => {
      store.loadPage('pg-1', fieldDoc(false, '이름'), 9)
      store.selectNode(NODE_ID)
    })

    // 위젯이 그대로 있고(언마운트 없음) 값만 새 문서를 따라간다.
    expect((screen.getByLabelText('필수') as HTMLInputElement).checked).toBe(false)
  })

  it('문서가 밖에서 바뀌면 텍스트 입력도 새 값을 비춘다', async () => {
    // 텍스트는 로컬 초안을 드는 유일한 컨트롤이라 따로 본다 — 초안의 기준이 사라지면
    // 버린다(`controls/text-control.tsx`). undo가 그 경로이고 여기서는 배치로 만든다.
    const store = new EditorStore()
    store.loadPage('pg-1', fieldDoc(true, '이름'), 7)
    store.selectNode(NODE_ID)
    mountPanel(store)

    const input = screen.getByLabelText('라벨') as HTMLInputElement
    expect(input.value).toBe('이름')
    // 커밋하지 않은 초안을 둔다.
    fireEvent.change(input, { target: { value: '치던 값' } })

    act(() => {
      store.loadPage('pg-1', fieldDoc(true, '밖에서 바뀐 이름'), 9)
      store.selectNode(NODE_ID)
    })

    expect((screen.getByLabelText('라벨') as HTMLInputElement).value).toBe('밖에서 바뀐 이름')
  })

  it('값이 같은 다른 노드로 옮겨도 초안이 넘어가지 않는다', async () => {
    // **`key={node.id}`가 지키는 자리다.** `TextControl`의 초안 버리기는 **문서 값이 바뀔 때**
    // 도는데, 두 노드의 그 prop 값이 같으면 값이 안 바뀌므로 도지 않는다 — 그때 초안이
    // 다음 노드로 넘어간다. 노드가 바뀔 때 위젯을 다시 만드는 것이 그것을 막는다.
    //
    // **초안 버리기만으로는 `key`의 하중이 0이다 — 이 케이스가 그 하중을 진다**(`key`를
    // 걷는 변이는 이 케이스 없이는 web 전량을 통과하고, 이 케이스에서 죽는다).
    const store = new EditorStore()
    const twin = pageDoc({
      id: 'n-root',
      type: 'Page',
      children: [
        { id: 'n-a', type: 'Field', props: { label: '같은 값' } },
        { id: 'n-b', type: 'Field', props: { label: '같은 값' } },
      ],
    })
    store.loadPage('pg-1', twin, 7)
    store.selectNode('n-a')
    mountPanel(store)

    fireEvent.change(screen.getByLabelText('라벨'), { target: { value: '치던 값' } })

    act(() => {
      store.selectNode('n-b')
    })

    // 두 노드의 값이 같으므로 초안 버리기는 돌지 않는다. `key`가 위젯을 새로 만든다.
    expect((screen.getByLabelText('라벨') as HTMLInputElement).value).toBe('같은 값')
  })
})

/**
 * 변형을 잴 문서. **`variantFrom`이 있는 것과 없는 것, 빈 것을 함께 담는다** —
 * 셋을 한 문서에 두어야 "안 나오는 것"이 "패널이 아무것도 안 그린다"와 갈린다.
 */
const VARIANT_DOC = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [
    // manifest 가 `default` · `featured` 를 선언하고 `variantFrom` 없음 → 컨트롤이 나온다.
    { id: 'n-card', type: 'Card', props: { title: '카드' }, variant: 'featured' },
    // 같은 부류인데 노드에 `variant`가 없다 → 빈 칸이고, 고르면 `add`가 나간다.
    { id: 'n-card2', type: 'Card', props: { title: '둘째' } },
    // `variantFrom: 'role'` → 컨트롤이 **나오면 안 된다**(`ignored-variant`를 UI가 유도하는 셈이다).
    { id: 'n-text', type: 'Text', props: { content: '문단', role: 'body' } },
    // manifest 가 선언하지 않았다 → 나올 것이 없다.
    { id: 'n-tree', type: 'Tree', props: { depth: 2 } },
    // 옛 카탈로그에 `default` 가 없던 컴포넌트 — manifest 는 `default` 를 첫 선언으로 둔다.
    { id: 'n-button', type: 'Button', props: { label: '저장' }, variant: 'danger' },
  ],
})

/**
 * **`variant`를 패널에 여는 법: 패널이 특수 취급한다.**
 *
 * `EditorField.prop`은 **props의 키**를 가리키는데 `variant`는 **노드 봉투의 필드**다
 * (설계서 「페이지 스키마 노드」). 그래서 `editor`에 적을 수 없고 — 적으면 `defineComponent`가
 * *"editor가 스키마에 없는 prop을 가리킵니다"*로 던진다 — 패널이 특수 취급하지 않으면 도달
 * 경로가 아예 없다.
 *
 * **선택지는 캔버스 테마의 manifest 가 준다**(`components[type].variants` — 라벨을 보이고 id 를 적는다). variant 는
 * 테마가 선언하는 것이라 카탈로그에 없다. `variantFrom` 컴포넌트는 prop 이 변형을 정하므로 칸이 없다.
 */
describe('속성 패널 — 변형', () => {
  it('변형 칸의 선택지는 캔버스 테마의 manifest 가 준다', async () => {
    await openPage(VARIANT_DOC)

    selectAt('Button', 0)
    const options = [...requireWidget('변형').querySelectorAll('option')].map((o) => o.textContent)

    expect(options).toEqual(['(기본)', '기본', '주', '보조', '위험', '투명'])
  })

  it('옛 variant 값이 그대로 선다', async () => {
    await openPage(VARIANT_DOC)

    selectAt('Button', 0)

    expect((requireWidget('변형') as HTMLSelectElement).value).toBe('danger')
    expect(canvasQuery('[data-wb-id="n-button"]')!.getAttribute('data-wb-variant')).toBe('danger')
  })

  it('manifest 가 선언하지 않은 컴포넌트에는 변형 칸이 없다', async () => {
    await openPage(VARIANT_DOC)

    selectAt('Tree', 0)

    // 양성 대조: 나머지 줄은 그대로 있다 — 패널이 아무것도 못 그리는 구현도 위 단언을 통과한다.
    expect(controlWidget('변형')).toBeNull()
    expect(labels().length).toBeGreaterThan(0)
  })

  it('선언한 컴포넌트에는 변형 칸이 맨 앞에 선다', async () => {
    await openPage(VARIANT_DOC)

    selectAt('Card', 0)

    // **맨 앞이다.** `variant`는 이 노드가 어떤 표현인가를 정하는 것이라 개별 prop보다 상위다.
    expect(labels()).toEqual(['변형', '제목', '부제'])
    expect((requireWidget('변형') as HTMLSelectElement).value).toBe('featured')
  })

  it('선택지의 값은 manifest 의 id 이고 비우는 자리가 있다', async () => {
    await openPage(VARIANT_DOC)

    selectAt('Card', 0)
    const options = [...requireWidget('변형').querySelectorAll('option')].map((o) => o.value)

    // 빈 값이 **항상** 있다 — 없으면 한 번 고른 변형에서 빠져나올 수 없다. 비운 노드는 `defaultVariant` 로 그려진다.
    expect(options).toEqual(['', 'default', 'featured'])
  })

  it('variantFrom을 가진 컴포넌트에는 나오지 않는다', async () => {
    // 나오면 `ignored-variant` 경고를 **UI가 유도하는 셈**이다.
    await openPage(VARIANT_DOC)

    selectAt('Text', 0)

    expect(labels()).toEqual(['내용', '역할'])
    expect(controlWidget('변형')).toBeNull()
  })

  it('고르면 /variant 경로로 편집이 나간다 — props가 아니다', async () => {
    const { calls, api } = editable()
    await openPage(VARIANT_DOC, { apiOverrides: api })

    selectAt('Card', 0)
    fireEvent.change(requireWidget('변형'), { target: { value: 'default' } })

    await waitFor(() => expect(calls).toHaveLength(1))
    // **`/props/variant`가 아니다.** 봉투 필드이므로 경로가 한 단계 위다.
    expect(lastOps(calls)).toEqual([
      { op: 'replace', path: '/root/children/0/variant', value: 'default' },
    ])
  })

  it('없던 variant를 고르면 add가 나간다', async () => {
    const { calls, api } = editable()
    await openPage(VARIANT_DOC, { apiOverrides: api })

    selectAt('Card', 1)
    expect((requireWidget('변형') as HTMLSelectElement).value).toBe('')
    fireEvent.change(requireWidget('변형'), { target: { value: 'featured' } })

    await waitFor(() => expect(calls).toHaveLength(1))
    expect(lastOps(calls)).toEqual([
      { op: 'add', path: '/root/children/1/variant', value: 'featured' },
    ])
  })

  it('비우면 remove가 나간다 — replace null이 아니다', async () => {
    // **`replace null`은 봉투 검증을 통과하지 못한다** — `WbNodeSchema.variant`가
    // `z.string().optional()`이라 `null`이 유효한 값이 아니다. 되돌릴 수 없으면 사용자가
    // 한 번 고른 변형에 갇힌다.
    const { calls, api } = editable()
    await openPage(VARIANT_DOC, { apiOverrides: api })

    selectAt('Card', 0)
    fireEvent.change(requireWidget('변형'), { target: { value: '' } })

    await waitFor(() => expect(calls).toHaveLength(1))
    expect(lastOps(calls)).toEqual([{ op: 'remove', path: '/root/children/0/variant' }])
  })

  it('없는 variant를 비우면 요청이 나가지 않는다', async () => {
    // 지울 것이 없다. 보내 봐야 서버가 같은 자리에서 거절한다.
    const { calls, api } = editable()
    await openPage(VARIANT_DOC, { apiOverrides: api })

    selectAt('Card', 1)
    fireEvent.change(requireWidget('변형'), { target: { value: '' } })

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(calls).toHaveLength(0)
  })

  /**
   * **패널이 낼 수 있는 값은 `ignored-variant` 를 만들지 않는다** — `variantFrom` 이 있으면 컨트롤 자체가 안 나오기
   * 때문이다. 그 성질을 manifest 전수로 실행해 확인한다.
   */
  it('패널이 낼 수 있는 값은 ignored-variant 를 만들지 않는다', () => {
    let checked = 0

    for (const type of CATALOG_TYPES) {
      const def = getComponent(type)
      if (def === undefined) continue

      const field = variantFieldOf(def, ADMIN_V0.manifest)
      if (field === null) continue

      for (const option of field.options) {
        checked += 1
        const issues = validatePage({
          version: 1,
          root: { id: 'n_000000000001', type: 'Page', children: [{ id: 'n_000000000002', type, variant: option.id }] },
        })
        expect(issues.filter((issue) => issue.code === 'ignored-variant'), `${type} ← ${option.id}`).toEqual([])
      }
    }

    // 카나리아 — 하나도 안 돌았으면 위 루프가 아무것도 지키지 않는다.
    expect(checked).toBeGreaterThan(10)
  })

  it('음성 대조 — variantFrom을 가진 컴포넌트에 variant를 적으면 ignored-variant다', () => {
    // 컨트롤을 내지 않는 것이 막는 것이 바로 이것이다.
    const issues = validatePage({
      version: 1,
      root: {
        id: 'n_000000000001',
        type: 'Page',
        children: [{ id: 'n_000000000002', type: 'Text', variant: 'h1' }],
      },
    })

    expect(issues.map((issue) => issue.code)).toEqual(['ignored-variant'])
  })

  /**
   * **부류를 닫는 자리다.** 패널이 manifest 를 보고 **자동으로** 여닫는다 — 선언한 컴포넌트마다 컨트롤이 나오고 선택지가
   * 선언 그대로인지 전수로 센다. 선언이 늘면 여기가 분모를 다시 센다.
   */
  it('manifest 전수 — 선언하고 variantFrom 이 없는 컴포넌트에만 컨트롤이 나오고 선택지가 선언 그대로다', () => {
    const declared = ADMIN_V0.manifest.components ?? {}
    // 카나리아 — 분모가 비면 아래 루프가 조용히 통과한다.
    expect(Object.keys(declared)).toEqual(['Section', 'Card', 'List', 'Button', 'Link'])

    for (const type of CATALOG_TYPES) {
      const def = getComponent(type)
      if (def === undefined) continue
      const decl = declared[type]
      const shouldOpen = decl !== undefined && def.variantFrom === undefined
      const field = variantFieldOf(def, ADMIN_V0.manifest)
      expect(field !== null, type).toBe(shouldOpen)
      if (decl !== undefined && field !== null) {
        expect(field.options, type).toEqual(decl.variants.map((v) => ({ id: v.id, label: v.label })))
      }
    }
  })
})
