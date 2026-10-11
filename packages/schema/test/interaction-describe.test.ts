/**
 * 자동 문장화(설계서 「자동 문장화」). **그 절이 준 두 예가 이 파일의 기준이다** — 규격이 준 유일한
 * 표본이라 글자까지 못박는다.
 *
 * ```
 * "① 검색 버튼 클릭 시 ② 목록이 로딩 상태로 바뀝니다"
 * "③ 상세정보 탭 선택 시 ④ 기본정보 영역이 숨겨집니다"
 * ```
 *
 * **둘째 예는 글자까지 나오지 않는다.** 무엇이 왜 다른지는 아래
 * `자동 문장화의 둘째 예` describe에 값과 함께 적었다.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { installCatalog } from '../src/component/catalog/index'
import { CATALOG_TYPES } from '../src/component/catalog/index'
import type { Interaction, InteractionAction, InteractionTrigger, PageDocument } from '../src/node'
import { COMPONENT_NOUNS, describeInteraction, listInteractionSentences } from '../src/interaction/describe'

beforeAll(() => {
  installCatalog()
})

/** 첫 자식이 트리거, 둘째가 타겟인 페이지를 만든다. */
function doc(source: PageDocument['root'], target?: PageDocument['root']): PageDocument {
  return {
    version: 1,
    root: {
      id: 'n_root',
      type: 'Page',
      children: target === undefined ? [source] : [source, target],
    },
  }
}

/** 그 문서의 첫 상호작용 문장. */
function sentence(document: PageDocument): string {
  const source = document.root.children?.[0]
  if (source === undefined || source.interactions?.[0] === undefined) {
    throw new Error('트리거 노드에 상호작용이 없다')
  }
  return describeInteraction(document, source, source.interactions[0])
}

describe('자동 문장화의 첫째 예 — 글자까지', () => {
  it('"① 검색 버튼 클릭 시 ② 목록이 로딩 상태로 바뀝니다"', () => {
    const document = doc(
      {
        id: 'n_search',
        type: 'Button',
        marker: 1,
        props: { label: '검색' },
        interactions: [{ on: 'click', actions: [{ type: 'setProp', target: 'n_list', prop: 'loading', value: true }] }],
      },
      { id: 'n_list', type: 'List', marker: 2 },
    )
    expect(sentence(document)).toBe('① 검색 버튼 클릭 시 ② 목록이 로딩 상태로 바뀝니다')
  })
})

/**
 * **「자동 문장화」의 둘째 예는 이름 두 개가 다르게 나온다.** 규격의 *"상세정보 탭"*·*"기본정보 영역"*은
 * **노드에 그 이름을 담을 자리가 카탈로그에 없어서** 재현할 수 없다:
 *
 * | 규격 | 나오는 것 | 왜 |
 * |---|---|---|
 * | `상세정보 탭` | `탭` | `Tabs`에 라벨성 문자열 prop이 없다 (`tabs`는 배열, `active`는 수) |
 * | `기본정보 영역` | `영역` | `Section`에 라벨성 prop이 아예 없다 (`compact` 하나뿐) |
 *
 * **카탈로그를 고치지 않는다** — 설계서 「컴포넌트 정의 구조」의 계약을 넓히는 변경이고 렌더러·테마·기존 케이스가
 * 함께 움직인다. **문장 구조는 규격과 같다**는 것을 아래가 고정한다.
 */
describe('자동 문장화의 둘째 예 — 구조는 같고 이름 둘이 다르다', () => {
  it('"③ 탭 선택 시 ④ 영역이 숨겨집니다"', () => {
    const document = doc(
      {
        id: 'n_tabs',
        type: 'Tabs',
        marker: 3,
        interactions: [{ on: 'select', actions: [{ type: 'setVisible', target: 'n_basic', value: false }] }],
      },
      { id: 'n_basic', type: 'Section', marker: 4 },
    )
    expect(sentence(document)).toBe('③ 탭 선택 시 ④ 영역이 숨겨집니다')
  })

  /** 라벨을 담을 수 있는 컴포넌트라면 규격과 같은 모양이 나온다 — 빠진 것은 **자리**다. */
  it('라벨을 담을 수 있는 타겟이면 "기본정보 카드가 숨겨집니다"가 된다', () => {
    const document = doc(
      {
        id: 'n_tabs',
        type: 'Tabs',
        marker: 3,
        interactions: [{ on: 'select', actions: [{ type: 'setVisible', target: 'n_basic', value: false }] }],
      },
      { id: 'n_basic', type: 'Card', marker: 4, props: { title: '기본정보' } },
    )
    expect(sentence(document)).toBe('③ 탭 선택 시 ④ 기본정보 카드가 숨겨집니다')
  })
})

/**
 * **마커가 없는 노드를 뭐라고 부르는가.** `marker`는 **코멘트가 있는 노드에만
 * 있다**(설계서 「페이지 스키마 노드」 — *"없으면 코멘트 없음"*). 상호작용이 걸린 노드에 코멘트가 없으면 번호가 없다.
 *
 * **판정: 번호 자리를 비우고 이름만 쓴다.** 자리 표시자(`?`·`–`)를 넣지 않는 이유는,
 * 그것이 *"번호가 있어야 하는데 없다"*로 읽히기 때문이다 — 번호 없음은 **정상 상태**다
 * (코멘트를 안 단 노드가 대부분이다).
 */
describe('마커가 없어도 문장이 성립한다', () => {
  it('둘 다 마커가 없으면 번호 없이 이름만 쓴다', () => {
    const document = doc(
      {
        id: 'n_search',
        type: 'Button',
        props: { label: '검색' },
        interactions: [{ on: 'click', actions: [{ type: 'setProp', target: 'n_list', prop: 'loading', value: true }] }],
      },
      { id: 'n_list', type: 'List' },
    )
    expect(sentence(document)).toBe('검색 버튼 클릭 시 목록이 로딩 상태로 바뀝니다')
  })

  it('한쪽만 있으면 그쪽만 번호가 붙는다', () => {
    const document = doc(
      {
        id: 'n_search',
        type: 'Button',
        props: { label: '검색' },
        interactions: [{ on: 'click', actions: [{ type: 'setProp', target: 'n_list', prop: 'loading', value: true }] }],
      },
      { id: 'n_list', type: 'List', marker: 2 },
    )
    expect(sentence(document)).toBe('검색 버튼 클릭 시 ② 목록이 로딩 상태로 바뀝니다')
  })

  /**
   * **원문자는 20까지다.** 그 위는 유니코드에 있어도(㉑·㊱) 폰트 지원이 갈리고, 이 문장은
   * 화면·HTML 번들·PPTX 셋이 함께 싣는다(「자동 문장화」) — PPTX에서 글리프가 없으면 두부가 된다.
   * 51부터는 유니코드에 아예 없어 어차피 폴백이 필요하므로, 경계를 20 하나로 둔다.
   */
  it('20을 넘는 번호는 원문자 대신 괄호 숫자다', () => {
    const document = doc(
      {
        id: 'n_search',
        type: 'Button',
        marker: 21,
        props: { label: '검색' },
        interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_list', value: true }] }],
      },
      { id: 'n_list', type: 'List' },
    )
    expect(sentence(document)).toBe('(21) 검색 버튼 클릭 시 목록이 보입니다')
  })
})

/**
 * **끊긴 타겟을 문장이 뭐라고 부르는가.** *"없다"*와 *"모른다"*를
 * 같은 값으로 접지 않는다. 여기서 *"모른다"*(문서를 못 읽었다)는 **성립할 수 없다**:
 * 문장화는 문서를 인자로 받으므로 문서 없이는 부를 수 없다.
 *
 * 이름은 코멘트 탭이 쓰는 말과 **같다**(`comment-panel.tsx`의 `MISSING_NODE`) — 같은
 * 상태를 두 화면이 다른 말로 부르면 사용자는 다른 문제로 읽는다.
 */
describe('끊긴 타겟', () => {
  it('문서에 없는 노드는 "사라진 노드"라고 부른다', () => {
    const document = doc({
      id: 'n_search',
      type: 'Button',
      props: { label: '검색' },
      interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_gone', value: false }] }],
    })
    expect(sentence(document)).toBe('검색 버튼 클릭 시 사라진 노드가 숨겨집니다')
  })

  /**
   * **아직 안 고른 것과 사라진 것을 가른다.** 액션을 막 더한 사용자에게 *"사라진 노드"*라고
   * 하면 무엇이 없어진 줄 안다 — `null`·미확정을 *"없다"*와 같은 말로 접는 그 부류다.
   */
  it('타겟이 비어 있으면 "아직 고르지 않은 대상"이다 — "사라진 노드"가 아니다', () => {
    const document = doc({
      id: 'n_search',
      type: 'Button',
      props: { label: '검색' },
      interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: '', value: false }] }],
    })
    expect(sentence(document)).toBe('검색 버튼 클릭 시 아직 고르지 않은 대상이 숨겨집니다')
  })

  it('setProp·switchTab도 같은 구분을 한다', () => {
    const setProp = doc({
      id: 'n_search',
      type: 'Button',
      props: { label: '검색' },
      interactions: [{ on: 'click', actions: [{ type: 'setProp', target: '', prop: 'loading', value: true }] }],
    })
    expect(sentence(setProp)).toContain('아직 고르지 않은 대상')

    const switchTab = doc({
      id: 'n_search',
      type: 'Button',
      props: { label: '검색' },
      interactions: [{ on: 'click', actions: [{ type: 'switchTab', target: '', tab: 0 }] }],
    })
    expect(sentence(switchTab)).toContain('아직 고르지 않은 대상')
  })

  it('페이지 경로가 비어 있으면 정해지지 않았다고 말한다', () => {
    const document = doc({
      id: 'n_search',
      type: 'Button',
      props: { label: '검색' },
      interactions: [{ on: 'click', actions: [{ type: 'navigate', target: '' }] }],
    })
    expect(sentence(document)).toBe('검색 버튼 클릭 시 아직 정해지지 않은 페이지로 이동합니다')
  })
})

describe('액션 5종', () => {
  function withAction(action: InteractionAction, targetType = 'List', targetProps?: Record<string, unknown>): string {
    return sentence(
      doc(
        {
          id: 'n_src',
          type: 'Button',
          props: { label: '실행' },
          interactions: [{ on: 'click', actions: [action] }],
        },
        { id: 'n_tgt', type: targetType, ...(targetProps ? { props: targetProps } : {}) },
      ),
    )
  }

  it('setProp — 불리언 참', () => {
    expect(withAction({ type: 'setProp', target: 'n_tgt', prop: 'loading', value: true })).toBe(
      '실행 버튼 클릭 시 목록이 로딩 상태로 바뀝니다',
    )
  })

  it('setProp — 불리언 거짓', () => {
    expect(withAction({ type: 'setProp', target: 'n_tgt', prop: 'loading', value: false })).toBe(
      '실행 버튼 클릭 시 목록의 로딩 상태가 꺼집니다',
    )
  })

  it('setProp — 수', () => {
    expect(withAction({ type: 'setProp', target: 'n_tgt', prop: 'items', value: 10 })).toBe(
      '실행 버튼 클릭 시 목록의 항목 수가 10으로 바뀝니다',
    )
  })

  it('setProp — 문자열', () => {
    expect(withAction({ type: 'setProp', target: 'n_tgt', prop: 'title', value: '회원' }, 'Card')).toBe(
      '실행 버튼 클릭 시 카드의 제목이 "회원"으로 바뀝니다',
    )
  })

  /** `editor`에 없는 prop은 라벨이 없다 — prop 이름을 그대로 쓴다. */
  it('setProp — 라벨이 없는 prop은 이름 그대로', () => {
    expect(withAction({ type: 'setProp', target: 'n_tgt', prop: 'subtitle', value: '부제' }, 'Section')).toBe(
      '실행 버튼 클릭 시 영역의 subtitle가 "부제"로 바뀝니다',
    )
  })

  it('setVisible — 참', () => {
    expect(withAction({ type: 'setVisible', target: 'n_tgt', value: true })).toBe('실행 버튼 클릭 시 목록이 보입니다')
  })

  it('setVisible — 거짓', () => {
    expect(withAction({ type: 'setVisible', target: 'n_tgt', value: false })).toBe('실행 버튼 클릭 시 목록이 숨겨집니다')
  })

  /** 타겟이 `Tabs`면 그 `tabs` 배열에서 이름을 읽는다 — 번호보다 읽는 사람에게 뜻이 있다. */
  it('switchTab — 탭 이름을 읽는다', () => {
    expect(withAction({ type: 'switchTab', target: 'n_tgt', tab: 1 }, 'Tabs', { tabs: ['기본정보', '상세정보'] })).toBe(
      '실행 버튼 클릭 시 탭이 "상세정보" 탭으로 바뀝니다',
    )
  })

  /**
   * **뜻이 없는 번호는 번호로 읽어 주지 않는다.** 번호로 읽으면 `tab: -3`이
   * `-2번째 탭`으로, `1.5`가 `2.5번째 탭`으로 나온다 — **검증이 못 잡은 값을 문장화가
   * 그대로 읽어 주는** 꼴이다(검증 쪽은 `interaction-validate.test.ts`가 같은 값을 잡는다).
   */
  it('switchTab — 음수·비정수 번호는 그렇다고 말한다', () => {
    expect(withAction({ type: 'switchTab', target: 'n_tgt', tab: -3 }, 'Tabs', { tabs: ['하나'] })).toBe(
      '실행 버튼 클릭 시 탭이 올바르지 않은 탭 번호로 바뀝니다',
    )
    expect(withAction({ type: 'switchTab', target: 'n_tgt', tab: 1.5 }, 'Tabs', { tabs: ['하나'] })).toBe(
      '실행 버튼 클릭 시 탭이 올바르지 않은 탭 번호로 바뀝니다',
    )
  })

  /**
   * **아직 속성을 안 고른 `setProp`.** 라벨을 빈 문자열로 두면 문장이 통째로
   * 깨진다(`목록이 로 바뀝니다` · `목록의 가 "가"로 바뀝니다`) — 미확정을 **아무 말도 하지
   * 않는 것으로 접는** 꼴이다. 타겟의 `아직 고르지 않은 대상`과 같은 부류다.
   */
  it('setProp — 속성을 아직 안 골랐으면 그렇다고 말한다', () => {
    expect(withAction({ type: 'setProp', target: 'n_tgt', prop: '', value: true })).toBe(
      '실행 버튼 클릭 시 목록의 아직 고르지 않은 속성이 켜집니다',
    )
    expect(withAction({ type: 'setProp', target: 'n_tgt', prop: '', value: '가' })).toBe(
      '실행 버튼 클릭 시 목록의 아직 고르지 않은 속성이 "가"로 바뀝니다',
    )
  })

  it('switchTab — 이름을 못 읽으면 번호로 말한다', () => {
    expect(withAction({ type: 'switchTab', target: 'n_tgt', tab: 5 }, 'Tabs', { tabs: ['하나'] })).toBe(
      '실행 버튼 클릭 시 탭이 6번째 탭으로 바뀝니다',
    )
  })

  it('navigate — page: 접두를 벗긴다', () => {
    expect(withAction({ type: 'navigate', target: 'page:관리자/회원/상세' })).toBe('실행 버튼 클릭 시 관리자/회원/상세 페이지로 이동합니다')
  })

  it('openModal', () => {
    expect(withAction({ type: 'openModal', target: 'page:관리자/회원/등록' })).toBe(
      '실행 버튼 클릭 시 관리자/회원/등록 페이지가 모달로 열립니다',
    )
  })

  it('액션이 여럿이면 이어 붙인다', () => {
    const document = doc(
      {
        id: 'n_src',
        type: 'Button',
        props: { label: '실행' },
        interactions: [
          {
            on: 'click',
            actions: [
              { type: 'setVisible', target: 'n_tgt', value: false },
              { type: 'navigate', target: 'page:다음' },
            ],
          },
        ],
      },
      { id: 'n_tgt', type: 'List' },
    )
    expect(sentence(document)).toBe('실행 버튼 클릭 시 목록이 숨겨집니다, 다음 페이지로 이동합니다')
  })

  /** 액션이 없는 상호작용도 봉투가 허용한다(`actions: []`). 문장이 그 사실을 말한다. */
  it('액션이 없으면 아무 일도 없다고 말한다', () => {
    const document = doc({
      id: 'n_src',
      type: 'Button',
      props: { label: '실행' },
      interactions: [{ on: 'click', actions: [] }],
    })
    expect(sentence(document)).toBe('실행 버튼 클릭 시 아무 일도 일어나지 않습니다')
  })
})

/**
 * **액션 5종 × 트리거 4종을 전부 문장으로 낼 수 있는가.**
 * 못 내는 조합이 있으면 그것이 산출물이다.
 */
describe('5종 × 4종 = 20 조합', () => {
  const TRIGGERS: InteractionTrigger[] = ['click', 'change', 'select', 'submit']
  const ACTIONS: InteractionAction[] = [
    { type: 'setProp', target: 'n_tgt', prop: 'loading', value: true },
    { type: 'setVisible', target: 'n_tgt', value: false },
    { type: 'switchTab', target: 'n_tabs', tab: 0 },
    { type: 'navigate', target: 'page:다음' },
    { type: 'openModal', target: 'page:등록' },
  ]

  it('20 조합이 전부 문장이 된다', () => {
    const texts: string[] = []
    for (const on of TRIGGERS) {
      for (const action of ACTIONS) {
        const document: PageDocument = {
          version: 1,
          root: {
            id: 'n_root',
            type: 'Page',
            children: [
              { id: 'n_src', type: 'Button', props: { label: '실행' }, interactions: [{ on, actions: [action] }] },
              { id: 'n_tgt', type: 'List' },
              { id: 'n_tabs', type: 'Tabs' },
            ],
          },
        }
        texts.push(sentence(document))
      }
    }
    expect(texts).toHaveLength(20)
    // 빈 문장도, 자리 표시자가 남은 문장도 없다.
    for (const text of texts) {
      expect(text.length).toBeGreaterThan(0)
      expect(text).not.toContain('undefined')
      expect(text).not.toContain('[object')
    }
    // 트리거 넷이 서로 다른 말로 나온다.
    expect(new Set(texts).size).toBe(20)
  })

  it('트리거 넷의 문안', () => {
    const say = (on: InteractionTrigger): string =>
      sentence(
        doc(
          {
            id: 'n_src',
            type: 'Button',
            props: { label: '실행' },
            interactions: [{ on, actions: [{ type: 'setVisible', target: 'n_tgt', value: true }] }],
          },
          { id: 'n_tgt', type: 'List' },
        ),
      )
    expect(say('click')).toContain('클릭 시')
    expect(say('change')).toContain('변경 시')
    expect(say('select')).toContain('선택 시')
    expect(say('submit')).toContain('제출 시')
  })
})

/**
 * **문장이 한국어 고정인가. 고정이다.** 「자동 문장화」의 표본이 한국어이고 이 저장소의
 * 문안은 전부 한국어다(`validate.ts`의 이슈 메시지·`locale.ts`의 zod 에러맵). 언어 채널을
 * 만들면 그 셋이 함께 움직여야 하므로 여기서 혼자 열지 않는다.
 */
describe('조사', () => {
  const say = (targetType: string): string =>
    sentence(
      doc(
        {
          id: 'n_src',
          type: 'Button',
          props: { label: '실행' },
          interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_tgt', value: true }] }],
        },
        { id: 'n_tgt', type: targetType },
      ),
    )

  it('받침이 있으면 이, 없으면 가', () => {
    expect(say('List')).toContain('목록이 보입니다') // ㄱ 받침
    expect(say('Card')).toContain('카드가 보입니다') // 받침 없음
  })

  it('받침이 없거나 ㄹ이면 로, 그 밖은 으로', () => {
    const withValue = (prop: string, value: unknown, type: string): string =>
      sentence(
        doc(
          {
            id: 'n_src',
            type: 'Button',
            props: { label: '실행' },
            interactions: [{ on: 'click', actions: [{ type: 'setProp', target: 'n_tgt', prop, value }] }],
          },
          { id: 'n_tgt', type },
        ),
      )
    // '10' → 받침 있음(십)으로 읽히지 않는다. 숫자·라틴 문자는 아래 케이스가 따로 잰다.
    expect(withValue('title', '회원', 'Card')).toContain('"회원"으로') // ㄴ 받침
    expect(withValue('title', '조회', 'Card')).toContain('"조회"로') // 받침 없음
    expect(withValue('title', '목걸', 'Card')).toContain('"목걸"로') // ㄹ 받침
  })

  /**
   * **한글이 아닌 글자로 끝나면 받침 없는 쪽을 쓴다.** 숫자·라틴 문자의 한국어 발음은
   * 읽는 사람에 따라 갈리고(`10`은 *"십"*·*"열"*), 그것을 맞히려면 발음 표가 필요하다 —
   * 문장화는 문자열 조립이라는 전제를 넘는다. **`이(가)` 같은 이중 표기를 쓰지 않는
   * 것은** 그것이 문장을 읽기 어렵게 만들고, 「자동 문장화」의 표본에도 그런 형태가 없기 때문이다.
   */
  it('한글이 아닌 끝 글자는 받침 없는 쪽으로 쓴다', () => {
    const document = doc(
      {
        id: 'n_src',
        type: 'Button',
        props: { label: '실행' },
        interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_tgt', value: true }] }],
      },
      { id: 'n_tgt', type: 'Bogus' },
    )
    // 카탈로그에 없는 타입은 타입 이름을 그대로 쓴다.
    expect(sentence(document)).toBe('실행 버튼 클릭 시 Bogus가 보입니다')
  })
})

describe('listInteractionSentences — 문서 전체', () => {
  it('노드 순서대로 모든 상호작용을 낸다', () => {
    const document: PageDocument = {
      version: 1,
      root: {
        id: 'n_root',
        type: 'Page',
        children: [
          {
            id: 'n_a',
            type: 'Button',
            props: { label: '가' },
            interactions: [
              { on: 'click', actions: [{ type: 'setVisible', target: 'n_b', value: true }] },
              { on: 'change', actions: [{ type: 'setVisible', target: 'n_b', value: false }] },
            ],
          },
          {
            id: 'n_b',
            type: 'List',
            interactions: [{ on: 'select', actions: [{ type: 'navigate', target: 'page:상세' }] }],
          },
        ],
      },
    }
    const sentences = listInteractionSentences(document)
    expect(sentences.map((item) => [item.nodeId, item.index, item.on])).toEqual([
      ['n_a', 0, 'click'],
      ['n_a', 1, 'change'],
      ['n_b', 0, 'select'],
    ])
    expect(sentences[2]!.text).toBe('목록 선택 시 상세 페이지로 이동합니다')
  })

  it('상호작용이 없으면 빈 배열이다', () => {
    expect(listInteractionSentences(doc({ id: 'n_a', type: 'List' }))).toEqual([])
  })
})

/**
 * **카탈로그가 늘면 이 표도 늘어야 한다.** 이름이 없는 타입은 문장에서 영문 타입 이름으로
 * 나오는데, 그것은 *"카탈로그에 없는 컴포넌트"*(진짜로 정의가 없는 경우)와 같은 모양이라
 * 화면에서 갈리지 않는다.
 */
describe('COMPONENT_NOUNS는 카탈로그 전체를 덮는다', () => {
  it('카탈로그의 모든 타입에 한국어 이름이 있다', () => {
    const missing = CATALOG_TYPES.filter((type) => COMPONENT_NOUNS[type] === undefined)
    expect(missing).toEqual([])
  })

  it('표에 카탈로그 밖의 타입이 없다', () => {
    const extra = Object.keys(COMPONENT_NOUNS).filter((type) => !CATALOG_TYPES.includes(type))
    expect(extra).toEqual([])
  })

  it('labelProp을 가진 타입이 여덟이다', () => {
    /**
     * **오타 하나가 조용히 라벨을 지우는 자리다.** 이름은 카탈로그에서
     * 유도되지만 `labelProp`은 `describe.ts`의 리터럴 표(`LABEL_PROPS`)에 남았다 —
     * *"어느 prop이 노드마다 다른 이름을 담는가"*는 다른 축이기 때문이다.
     *
     * 그 표의 키를 `Card` 대신 `Cards`로 적으면 **유도가 그것을 그냥 안 쓴다.** 아래
     * `labelProp이 카탈로그의 prop을 가리킨다`는 유도된 표를 훑으므로 없어진 항목을
     * 보지 못한다 — 빠짐은 목록을 고정해야만 보인다.
     */
    const withLabel = Object.entries(COMPONENT_NOUNS)
      .filter(([, noun]) => noun.labelProp !== undefined)
      .map(([type]) => type)
      .sort()
    expect(withLabel).toEqual(['Button', 'Card', 'EntryForm', 'Field', 'Link', 'Media', 'Placeholder', 'Text'])
  })

  /** `labelProp`은 그 컴포넌트에 **실제로 있는** prop이어야 한다. */
  it('labelProp이 카탈로그의 prop을 가리킨다', () => {
    const broken: string[] = []
    for (const [type, noun] of Object.entries(COMPONENT_NOUNS)) {
      if (noun.labelProp === undefined) continue
      const document = doc(
        {
          id: 'n_src',
          type: 'Button',
          props: { label: '실행' },
          interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_tgt', value: true }] }],
        },
        { id: 'n_tgt', type, props: { [noun.labelProp]: '표본' } },
      )
      if (!sentence(document).includes('표본')) broken.push(type)
    }
    expect(broken).toEqual([])
  })
})
