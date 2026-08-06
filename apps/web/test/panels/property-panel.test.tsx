/**
 * 우측의 속성 패널. 선택 노드의 속성을 **카탈로그의 `editor` 명세에서 자동 생성해**
 * 보여 준다(설계 §5.1·§9). 이 단계는 **읽기 전용**이다 — 값을 바꾸는 것은 P2b-2다.
 *
 * 노드를 고르는 일은 구조 트리를 눌러서 한다. 스토어를 직접 건드리지 않는 것은 의도다 —
 * 사용자가 실제로 지나는 길(트리 → 스토어 → 패널)이 이어져 있는지 함께 보게 된다.
 */
import { fireEvent, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { registerStructure } from '@wirebound/renderer'
import { ListDef, defineComponent, registerComponent } from '@wirebound/schema'
import { PAGE_ID, PROJECT_NAME, PROJECT_ROUTE, openPage, pageDoc, renderEditor } from '../editor-harness'

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

function panel(): HTMLElement {
  return screen.getByRole('complementary', { name: '속성 패널' })
}

/**
 * 속성 줄. 클래스로 찾는 것은 이 요소들에 접근성 이름을 붙일 이유가 없기 때문이다 —
 * 클래스가 바뀌면 여기서 빈 배열이 되어 요란하게 깨진다(`canvasFrame()`과 같은 방식).
 */
function propRows(): { label: string; value: string }[] {
  return [...panel().querySelectorAll('.wb-shell-prop')].map((row) => ({
    label: row.querySelector('.wb-shell-prop-label')?.textContent ?? '',
    value: row.querySelector('.wb-shell-prop-value')?.textContent ?? '',
  }))
}

function labels(): string[] {
  return propRows().map((row) => row.label)
}

/** 구조 트리에서 노드를 고른다. 사용자가 지나는 길 그대로다. */
function select(type: string): void {
  fireEvent.click(
    within(screen.getByRole('region', { name: '구조 트리' })).getByRole('button', { name: type }),
  )
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
      { label: '비활성', value: '' },
      { label: '오류 상태', value: '' },
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
    expect(propRows()).toContainEqual({ label: '컬럼', value: '이름, 이메일' })
  })

  it('목록 값은 한 줄로 이어 보여 준다', async () => {
    await openPage(DOC)

    select('KeyValue')

    // `pairList`는 원소가 `{ key, value }`다. 배열을 그대로 찍으면 `[object Object]`가
    // 보인다.
    expect(propRows()).toContainEqual({
      label: '키-값',
      value: '가입일: 2026-01-01, 등급: VIP',
    })
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

  it('이 단계에서는 입력이 없다(읽기 전용)', async () => {
    await openPage(DOC)

    select('Field')

    // 양성 대조: 값이 실제로 그려진 상태에서 세야 뜻이 있다. 빈 패널은 아무 입력도
    // 없는 것이 당연하다.
    expect(propRows().length).toBeGreaterThan(0)
    expect(panel().querySelectorAll('input, textarea, select')).toHaveLength(0)
    // 셸에는 입력이 있다(뷰포트 폭 `<select>`). 위 단언이 화면 어디에도 입력이 없어서
    // 참인 것이 아님을 못박는다.
    expect(document.body.querySelectorAll('select').length).toBeGreaterThan(0)

    // **이 케이스가 이 태스크의 범위를 고정한다.** P2b-2가 편집을 얹으면 여기가 죽고,
    // 그 죽음이 곧 "편집이 생겼다"는 신호다.
  })

  it('값을 문자열로 만들 수 없어도 셸은 살아 있다', async () => {
    await openPage(THROWING_DOC)

    select('Card')

    // 그 줄만 대신 문장을 낸다. 나머지 줄이 그대로인 것이 양성 대조다 — 패널이 통째로
    // 무너지거나 아무것도 그리지 않는 구현은 이 단언을 통과할 수 없다.
    expect(propRows()).toEqual([
      { label: '제목', value: '(표시할 수 없는 값)' },
      { label: '부제', value: '부제' },
    ])
    // 셸도 그대로다. `stringify`의 `try`를 걷어내면 여기까지 오지 못하고 렌더가 던진다.
    screen.getByRole('heading', { name: PROJECT_NAME })
  })

  it('문서가 없으면 안내를 보여준다', async () => {
    renderEditor({ route: PROJECT_ROUTE, docs: { [PAGE_ID]: DOC } })
    await screen.findByRole('heading', { name: PROJECT_NAME })

    // 페이지를 열지 않은 상태. 선택이 없을 때와 같은 안내다 — 둘 다 "고를 노드가 아직
    // 없다"이고, 사용자가 할 일도 같다.
    within(panel()).getByText('노드를 고르면 속성이 보입니다')
  })
})
