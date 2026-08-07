/**
 * 우측의 속성 패널. 선택 노드의 속성을 **카탈로그의 `editor` 명세에서 자동 생성해**
 * 보여 준다(설계 §5.1·§9). 이 단계는 **읽기 전용**이다 — 값을 바꾸는 것은 P2b-2다.
 *
 * 노드를 고르는 일은 구조 트리를 눌러서 한다. 스토어를 직접 건드리지 않는 것은 의도다 —
 * 사용자가 실제로 지나는 길(트리 → 스토어 → 패널)이 이어져 있는지 함께 보게 된다.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { registerStructure } from '@wirebound/renderer'
import {
  ListDef,
  defineComponent,
  listComponents,
  registerComponent,
  type EditorControl,
} from '@wirebound/schema'
import { ApiError, type ApiClient } from '../../src/api/client'
import type { PatchResult } from '../../src/api/types'
import {
  PAGE_ID,
  PROJECT_NAME,
  PROJECT_ROUTE,
  openPage,
  pageDetail,
  pageDoc,
  renderEditor,
} from '../editor-harness'
// 카탈로그가 설치돼 있어야 `listComponents()`가 빈 배열이 아니다.
import '../../src/catalog-setup'

/**
 * `visibleWhen`이 **맞지 않는** 노드를 만들기 위한 테스트 전용 컴포넌트.
 *
 * 카탈로그에서 `visibleWhen`을 가진 것은 `List.columns`(`{ structure: 'table' }') 하나인데,
 * `List`의 기본 구조가 마침 `table`이라 **카탈로그만으로는 감춰지는 경우를 만들 수 없다**
 * (실측: `packages/schema/src/component/catalog/*.ts`의 `editor` 배열 전체에서
 * `visibleWhen`은 그 한 자리뿐이고, 거기의 구조가 `structures[0]`과 같다).
 *
 * `ListDef`를 그대로 빌리고 구조 순서만 뒤집는다 — props 스키마를 새로 쓰려면 zod가
 * 필요한데 `apps/web`은 zod에 의존하지 않는다. 기본 구조가 `cardGrid`가 되므로
 * `columns`의 `visibleWhen: { structure: 'table' }`은 더 이상 맞지 않는다.
 */
const PROBE_TYPE = '구조프로브'

registerComponent(
  defineComponent({ ...ListDef, type: PROBE_TYPE, structures: ['cardGrid', 'table'] }),
)
// 캔버스가 폴백 대신 이 구현으로 그리도록 기본 구조 하나를 등록해 둔다. 속성 패널의
// 단언과는 무관하지만, 폴백이 뜨면 그 화면이 무엇을 말하는지 읽기 어려워진다.
registerStructure(PROBE_TYPE, 'cardGrid', ({ attrs }) => <div {...attrs} />)

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
    editor: [{ prop: 'items', control: 'select', label: '선택지 없는 필드' }],
  }),
)
registerStructure(NO_OPTIONS_TYPE, 'table', ({ attrs }) => <div {...attrs} />)

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
    { id: 'n-probe', type: PROBE_TYPE, props: { columns: ['숨은 컬럼'], items: 1 } },
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
 * - `n-null`은 `props`가 `null`이다. 타입은 막지만 런타임에는 들어온다. **오늘 실재하는
 *   경로는 "서버가 계약을 어긴 문서를 200으로 낸다"이다**(실측: `SHAPES.pageDetail`은
 *   `schema.root`가 객체인지까지만 보고 자식으로 내려가지 않으므로, `root.children`에
 *   `props: null`인 노드를 담은 응답이 `getPage`를 그대로 지난다 — `api/http-client.ts`).
 *   P2b-2의 낙관적 패치가 두 번째 경로를 더하겠지만 그것은 아직 없는 코드다.
 *
 * 둘 다 `editor`가 비지 않은 타입이어야 뜻이 있다. `Page`·`Slot`처럼 `editor`가 빈
 * 컴포넌트를 고르면 `readProp`이 한 번도 불리지 않는다.
 *
 * **이 파일에 케이스가 없었을 뿐, 하중이 0이었던 것은 아니다.** 실측: `?.`를 걷어내면
 * (`node.props![prop]`) 이 둘 없이도 넷이 죽는다 — `canvas.test.tsx`의 `편집 모드에서
 * 선택 노드에 아웃라인이 붙는다`(`n-search`가 `props` 없는 `SearchForm`이고, 그 클릭이
 * 패널에 `collapsed`를 읽게 한다)와 `structure-tree.test.tsx`의 셋(`n-list`가 `props` 없는
 * `List`다). **다만 그 넷은 다른 성질을 재는 케이스라 죽어도 무엇이 깨졌는지가 이름에
 * 나오지 않는다.** 여기 둘은 그것을 이름으로 고정한다. `props`가 **객체가 아닌** 경우
 * (`n-null`)는 지금 트리에서 이 파일이 유일한 하중이다.
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
 * 이쪽이 더 흔한 경로다(P2b-2의 낙관적 패치가 만드는 검증 전 문서).
 */
const BROKEN_TYPE_DOC = pageDoc({
  id: 'n-root',
  type: 'Page',
  children: [{ id: 'n-bad', type: { broken: true }, children: [] } as never],
})

/** 이 웨이브에서 위젯이 생긴 control. Task 8·9가 여기로 옮겨 온다. */
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
 * 아직 위젯이 없어 `formatValue`가 글자로만 그리는 control. **지금은 비어 있다** —
 * 웨이브 3이 일곱을 전부 덮었다. 카탈로그에 여덟 번째가 생기면 아래 대조가 그것을 잡는다.
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
  return screen.getByRole('complementary', { name: '속성 패널' })
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
    // 어느 컴포넌트의 속성인지도 보여 준다(설계 §9의 패널 머리).
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
      // **값이 없는 스위치는 "꺼짐"으로 보인다.** 앞 판에서 이 둘이 빈 문자열이었던 것은
      // `formatValue(undefined)`가 그렸기 때문이고, 이제는 체크박스가 그린다. 체크박스에는
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
    expect(propRows()).toEqual([
      { label: '제목', value: '회원 정보' },
      { label: '부제', value: '' },
    ])
    expect(within(panel()).queryByText(/undefined/)).toBeNull()
  })

  it('visibleWhen이 현재 구조와 다르면 감춘다', async () => {
    await openPage(DOC)

    select(PROBE_TYPE)

    // `columns`의 `visibleWhen`은 `table`인데 이 컴포넌트의 현재 구조는 `cardGrid`다.
    expect(labels()).not.toContain('컬럼')
    // 양성 대조: 나머지 줄은 그대로 있다. 이것이 없으면 패널이 아무것도 못 그리는
    // 구현도 위 단언을 통과한다.
    expect(labels()).toContain('항목 수')
  })

  it('visibleWhen이 맞으면 보인다', async () => {
    await openPage(DOC)

    select('List')

    // 같은 `editor` 명세인데 이쪽은 현재 구조가 `table`이라 보인다. 위 케이스와 짝이다 —
    // 둘이 함께 통과해야 필터가 구조를 실제로 보고 있다고 할 수 있다.
    expect(labels()).toContain('컬럼')
    // 값은 이제 목록 위젯이 그린다(Task 9). 한 줄로 이어 붙인 글자가 아니라 칸마다 하나다.
    const cells = [...panel().querySelectorAll<HTMLInputElement>('.wb-shell-list-cell')]
    expect(cells.map((cell) => cell.value)).toEqual(['이름', '이메일'])
  })

  it('pairList는 키와 값을 각각 칸으로 그린다', async () => {
    // **앞 판에서는 `한 줄로 이어 보여 준다`였다.** `formatValue`가 그리던 자리를 Task 9의
    // 목록 위젯이 가져갔으므로 재는 대상이 바뀐다 — 지키는 성질(`[object Object]`가
    // 보이지 않는다)은 그대로다.
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
    // **P2b-1의 `이 단계에서는 입력이 없다`를 대체한 케이스다.** 이월 문서가
    // *"그 테스트를 바꾸는 것이 '편집이 생겼다'는 신호다"*라고 못박았고, 이것이 그
    // 반대 방향이다 — 경계를 "입력이 없다"에서 "control마다 위젯이 있다"로 뒤집는다.
    //
    // **일곱을 전부 덮었다 — 그리고 그 "일곱"은 아래에서 세어 나온 값이다.** `NOT_YET`이
    // 비어 있는 것이 그 상태의 표시이고, 카탈로그에 새 control이 생기면 두 목록의 합이
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

    // **지키는 성질은 그대로이고 지키는 자리가 옮겨 갔다.** `Card.title`은 `text` control이라
    // 이제 위젯이 그리고, 위젯은 객체 값을 빈 칸으로 시작한다(`controls/text-control.tsx`의
    // `toDraft`) — `JSON.stringify`를 부르지 않으므로 던질 일이 없다. 앞 판에서 이 줄이
    // `(표시할 수 없는 값)`이었던 것은 `formatValue`가 그렸기 때문이다.
    //
    // 나머지 줄이 그대로인 것이 양성 대조다 — 패널이 통째로 무너지거나 아무것도 그리지
    // 않는 구현은 이 단언을 통과할 수 없다.
    expect(propRows()).toEqual([
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

  it('props가 아예 없는 노드를 골라도 값 자리만 빈다', async () => {
    await openPage(NO_PROPS_DOC)

    select('Card')

    // 필드는 카탈로그에서 나오므로 그대로 있고, 값만 전부 빈다. **패널이 통째로 사라지는
    // 구현은 이 단언을 통과할 수 없다** — 그것이 여기 `propRows()`를 쓰는 이유다.
    expect(propRows()).toEqual([
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
  const node = document.body.querySelector(`[data-wb-id="${nodeId}"]`)
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
    // **D5의 핵심이다.** 글자마다 요청하는 구현을 잡는다 — 그런 구현은 undo 한 단계가
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
    // 계획서 표에 없는 케이스다. `Enter`가 모든 control에서 커밋이면 여러 줄을 칠 수 없다 —
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

  it('캔버스로 다른 노드를 고르면 커밋되지 않은 타이핑이 사라진다', async () => {
    // **설계된 손실이다.** 노드가 바뀔 때 로컬 초안을 버리는 방식(`key`)을 골랐기 때문이고,
    // 그 근거는 `panels/controls/text-control.tsx`에 잰 값과 함께 있다.
    //
    // 구조 트리로 고르면 이 손실이 없다 — 버튼이 포커스를 받아 blur가 나고 그때 커밋된다
    // (실측). 캔버스는 `<div onClick>`이라 포커스가 옮겨 가지 않아 blur가 없다.
    const { calls, api } = editable()
    await openPage(EDIT_DOC, { apiOverrides: api })

    selectAt('Text', 0)
    fireEvent.change(requireWidget('내용'), { target: { value: '버려질 타이핑' } })

    const other = document.body.querySelector('[data-wb-id="n-text2"]')
    if (other === null) throw new Error('캔버스에 둘째 노드가 없다')
    fireEvent.click(other)

    // 초안은 나가지 않았고, 입력은 새 노드의 값이다.
    expect(calls).toHaveLength(0)
    expect((requireWidget('내용') as HTMLTextAreaElement).value).toBe('둘째 내용')
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
    // blur를 기다리지 않는다 — 중간 상태가 없는 조작이라 미룰 이유가 없다(D5).
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
    // 그 갈래가 없으면 `applyOps`가 던져 D7이 요청을 막는다(웨이브 2가 실측했다).
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
    expect(panel().querySelector('select')).toBeNull()
    expect(propRows()).toContainEqual({ label: '선택지 없는 필드', value: '2' })

    // 양성 대조: options가 있는 자리는 그린다.
    selectAt('Field', 0)
    expect(controlWidget('입력 종류')).not.toBeNull()
  })

  it('편집이 실패하면 재조회가 선택을 지운다', async () => {
    // **원래 재려던 것은 "스위치가 문서를 그대로 비춘다"였는데, 그 성질은 오늘 코드에서
    // 관측할 수 없다.** 재조회가 `loadPage`를 지나고 그것이 `selectedNodeId`를 비우므로
    // (`store/editor-store.ts` — 노드 id는 문서 안에서만 뜻이 있다), 실패 뒤에는 스위치가
    // 아예 사라진다. 그래서 로컬 state를 든 구현과 문서를 비추는 구현이 갈리는 자리가
    // 없다(실측: 로컬 state를 들게 하는 변이로 죽는 케이스가 0이었다).
    //
    // 여기서는 실제로 일어나는 일만 고정한다 — 그것이 사용자에게 보이는 결과이고,
    // "고르던 노드를 잃는다"는 사실 자체가 다음 사람이 볼 값이다.
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

    // 선택이 지워져 패널이 안내로 돌아간다. 다시 고르면 서버 값이다.
    await waitFor(() => {
      within(panel()).getByText('노드를 고르면 속성이 보입니다')
    })
    selectAt('Field', 0)
    expect((requireWidget('필수') as HTMLInputElement).checked).toBe(true)
  })

  it('연속으로 두 번 누르면 두 편집이 순서대로 나간다', async () => {
    // D6가 스위치에도 적용된다 — 두 요청이 겹치지 않고 순서대로 나간다.
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
    // 로컬 state를 들고 있는 구현을 잡는다 — 스위치는 중간 상태가 없으므로 문서가
    // 곧 화면이어야 하고, 실패한 편집이 재조회로 되돌아가면 화면도 함께 돌아와야 한다.
    await openPage(SWITCH_DOC)

    selectAt('Field', 0)
    expect((requireWidget('필수') as HTMLInputElement).checked).toBe(true)
    expect((requireWidget('비활성') as HTMLInputElement).checked).toBe(false)
  })
})
