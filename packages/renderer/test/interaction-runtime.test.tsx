/**
 * **설계서 「실행」의 상호작용 런타임.**
 *
 * **DOM이 없다.** 이 프로젝트(`unit`)는 jsdom을 걸지 않으므로 여기서 재는 것은
 * **엘리먼트 트리와 SSR 문자열**이다 — 핸들러가 붙었는지는 노드마다 선 `ViewHost` 엘리먼트가 뷰에 넘길 속성
 * (`binding.attrs.onClick`)으로 보고, 눌린 뒤의 화면은 그 핸들러를 부른 뒤 새 겹layer로 다시 그려 본다.
 * **진짜 DOM 이벤트(버블링·`submit`·`change`)는 `apps/web` 쪽 케이스가 잰다** — 그쪽이
 * jsdom이다.
 *
 * **여기가 지키는 가장 중요한 것:** *"상호작용을 끈 렌더는 규칙이 없는 문서의 렌더와 글자까지
 * 같다."*
 */
import { installCatalog, validatePage, type Interaction, type PageDocument, type WbNode } from '@wirebound/schema'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { renderDocument, type InteractionEvent } from '../src/render'
import { EMPTY_OVERLAY, runInteraction, type InteractionOverlay } from '../src/interaction/runtime'

beforeAll(() => {
  installCatalog()
})

/** 설계서 「자동 문장화」의 예를 그대로 문서로 만든 것. *"① 검색 버튼 클릭 시 ② 그리드가 로딩 상태로 바뀝니다"* */
function example(interactions: Interaction[]): PageDocument {
  return {
    version: 1,
    root: {
      id: 'n_root',
      type: 'Page',
      children: [
        { id: 'n_btn', type: 'Button', props: { label: '검색' }, marker: 1, interactions },
        { id: 'n_list', type: 'DataGrid', props: {}, marker: 2 },
        {
          id: 'n_tabs',
          type: 'Tabs',
          props: { active: 0 },
          children: [
            { id: 'n_tab1', type: 'TabPanel', props: { label: '기본정보' } },
            { id: 'n_tab2', type: 'TabPanel', props: { label: '상세정보' } },
          ],
        },
      ],
    } as WbNode,
  }
}

/** 규칙만 걷어 낸 같은 문서. **끈 렌더의 대조군이다.** */
function stripped(doc: PageDocument): PageDocument {
  return {
    version: doc.version,
    root: {
      ...doc.root,
      children: (doc.root.children ?? []).map(({ interactions: _drop, ...rest }) => rest),
    },
  }
}

const CLICK_SETS_LOADING: Interaction[] = [{ on: 'click', actions: [{ type: 'setProp', target: 'n_list', prop: 'loading', value: true }] }]

/** 눌린 결과를 모은다. 이벤트 핸들러가 하는 일을 그대로 흉내 낸다(상태는 호출자가 든다). */
function press(
  doc: PageDocument,
  nodeId: string,
  dom: 'onClick' | 'onChange' | 'onSubmit' = 'onClick',
  overlay: InteractionOverlay = EMPTY_OVERLAY,
): { events: InteractionEvent[]; overlay: InteractionOverlay } {
  const events: InteractionEvent[] = []
  let current = overlay
  const tree = renderDocument(doc, {
    interaction: { overlay, onEvent: (event) => events.push(event) },
  })
  const handler = handlerOf(tree, nodeId, dom)
  handler?.({ preventDefault: () => {} } as never)
  for (const event of events) current = event.overlay
  return { events, overlay: current }
}

/** 트리에서 그 노드의 루트에 실릴 핸들러를 찾는다 — 노드의 `ViewHost`가 뷰에 넘기는 속성(`binding.attrs`)에 있다. */
function handlerOf(tree: unknown, nodeId: string, dom: string): ((event: unknown) => void) | undefined {
  return attrsOf(tree, nodeId)?.[dom] as ((event: unknown) => void) | undefined
}

function attrsOf(tree: unknown, nodeId: string): Record<string, unknown> | undefined {
  if (typeof tree !== 'object' || tree === null) return undefined
  const props = (tree as { props?: Record<string, unknown> }).props
  const attrs = (props?.['binding'] as { attrs?: Record<string, unknown> } | undefined)?.attrs
  if (attrs?.['data-wb-id'] === nodeId) return attrs
  // `ViewHost`의 자식은 뷰에 넘길 `viewProps.children`이고, `Fragment`의 자식은 `children`이다.
  const viewProps = props?.['viewProps'] as { children?: unknown } | undefined
  const children = viewProps !== undefined ? viewProps.children : props?.['children']
  for (const child of Array.isArray(children) ? children : [children]) {
    const hit = attrsOf(child, nodeId)
    if (hit !== undefined) return hit
  }
  return undefined
}

function markup(doc: PageDocument, overlay?: InteractionOverlay): string {
  return renderToStaticMarkup(renderDocument(doc, overlay === undefined ? {} : { interaction: { overlay } }))
}

describe('끈 렌더는 바뀌지 않는다', () => {
  it('규칙이 있는 문서와 없는 문서가 글자까지 같은 HTML을 낸다', () => {
    const doc = example(CLICK_SETS_LOADING)
    // 상호작용은 **봉투의 필드**라 그리는 것에 아무 영향이 없어야 한다. 이 케이스가
    // 죽으면 `interactions`가 화면에 새고 있다는 뜻이다.
    expect(markup(doc)).toBe(markup(stripped(doc)))
  })

  it('런타임을 켜도 HTML이 같다 — 핸들러는 DOM 속성이 아니다', () => {
    const doc = example(CLICK_SETS_LOADING)
    // 설계서 「노드 속성」의 여섯 속성 계약을 넓히지 않는다는 것을 **렌더 결과에서** 재는 자리다.
    // (원문을 세는 쪽은 `contract-attrs.test.ts`가 이미 한다.)
    expect(markup(doc, EMPTY_OVERLAY)).toBe(markup(doc))
  })

  it('규칙이 없는 노드에는 핸들러가 붙지 않는다', () => {
    const tree = renderDocument(example(CLICK_SETS_LOADING), { interaction: {} })
    expect(handlerOf(tree, 'n_list', 'onClick')).toBeUndefined()
    expect(handlerOf(tree, 'n_btn', 'onClick')).toBeInstanceOf(Function)
  })

  it('런타임을 끄면 규칙이 있어도 핸들러가 없다', () => {
    const tree = renderDocument(example(CLICK_SETS_LOADING))
    expect(handlerOf(tree, 'n_btn', 'onClick')).toBeUndefined()
  })
})

describe('셋을 실행한다', () => {
  it('setProp이 설계서 「자동 문장화」의 예를 실제로 돌린다 — 그리드가 로딩 상태가 된다', () => {
    const doc = example(CLICK_SETS_LOADING)
    expect(markup(doc)).not.toContain('data-wb-state="loading"')

    const { overlay } = press(doc, 'n_btn')

    expect(markup(doc, overlay)).toContain('data-wb-state="loading"')
  })

  it('문서는 한 글자도 안 바뀐다 — 겹layer가 그 위에 얹힐 뿐이다', () => {
    const doc = example(CLICK_SETS_LOADING)
    const before = JSON.stringify(doc)

    const { overlay } = press(doc, 'n_btn')

    expect(JSON.stringify(doc)).toBe(before)
    // 겹layer를 버리면 화면도 처음으로 돌아간다 — **모드가 리셋이다**.
    expect(markup(doc, overlay)).not.toBe(markup(doc, EMPTY_OVERLAY))
    expect(markup(doc, EMPTY_OVERLAY)).toBe(markup(doc))
  })

  it('switchTab이 대상 패널의 부모 Tabs의 활성 탭을 그 패널의 차례로 덮는다 — 뷰는 그대로다', () => {
    const doc = example([{ on: 'click', actions: [{ type: 'switchTab', target: 'n_tab2' }] }])
    const { overlay } = press(doc, 'n_btn')

    const before = markup(doc)
    const after = markup(doc, overlay)
    // `TabsUnderline`이 `aria-selected={index === active}`를 그린다. 자리가 옮겨 갔는지를
    // 본다 — 첫 탭에서 둘째 탭으로.
    expect(before.indexOf('aria-selected="true"')).toBeLessThan(before.indexOf('상세정보'))
    expect(after.indexOf('aria-selected="true"')).toBeGreaterThan(after.indexOf('기본정보'))
    expect(overlay['n_tabs']).toEqual({ active: 1 })
  })

  it('setVisible이 노드를 DOM에서 뺀다 — 자식까지 함께', () => {
    const doc: PageDocument = {
      version: 1,
      root: {
        id: 'n_root',
        type: 'Page',
        children: [
          {
            id: 'n_btn',
            type: 'Button',
            props: { label: '접기' },
            interactions: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_card', value: false }] }],
          },
          {
            id: 'n_card',
            type: 'Card',
            props: { title: '기본정보' },
            children: [{ id: 'n_text', type: 'Text', props: { content: '안쪽' } }],
          },
        ],
      } as WbNode,
    }

    const { overlay } = press(doc, 'n_btn')
    const after = markup(doc, overlay)

    expect(markup(doc)).toContain('기본정보')
    expect(after).not.toContain('기본정보')
    // 자식도 함께 사라진다 — 숨긴 노드 안쪽이 남으면 "숨겼다"가 아니다.
    expect(after).not.toContain('안쪽')
    // 누른 버튼은 그대로 있다.
    expect(after).toContain('data-wb-id="n_btn"')
  })

  it('visible은 props로 내려가지 않는다 — 내려가면 strictObject가 노드를 폴백으로 만든다', () => {
    const doc = example([{ on: 'click', actions: [{ type: 'setVisible', target: 'n_list', value: true }] }])
    const { overlay } = press(doc, 'n_btn')

    expect(overlay['n_list']).toEqual({ visible: true })
    expect(markup(doc, overlay)).not.toContain('data-wb-error')
  })
})

describe('순서', () => {
  it('같은 on이 여럿이면 배열 순서대로 돌고 뒤가 이긴다', () => {
    const doc = example([
      { on: 'click', actions: [{ type: 'setProp', target: 'n_list', prop: 'fixedColumns', value: 3 }] },
      { on: 'click', actions: [{ type: 'setProp', target: 'n_list', prop: 'fixedColumns', value: 7 }] },
    ])

    const { events, overlay } = press(doc, 'n_btn')

    expect(events).toHaveLength(1)
    expect(events[0]?.matched).toBe(2)
    expect(overlay['n_list']).toEqual({ fixedColumns: 7 })
  })

  it('한 규칙 안의 액션도 순서대로 돈다', () => {
    const doc = example([
      {
        on: 'click',
        actions: [
          { type: 'setProp', target: 'n_list', prop: 'fixedColumns', value: 3 },
          { type: 'setProp', target: 'n_list', prop: 'fixedColumns', value: 7 },
        ],
      },
    ])

    expect(press(doc, 'n_btn').overlay['n_list']).toEqual({ fixedColumns: 7 })
  })

  it('다른 트리거의 규칙은 돌지 않는다', () => {
    const doc = example([{ on: 'submit', actions: [{ type: 'setProp', target: 'n_list', prop: 'loading', value: true }] }])

    const { events, overlay } = press(doc, 'n_btn')

    expect(events).toHaveLength(0)
    expect(overlay).toBe(EMPTY_OVERLAY)
  })
})

describe('트리거 4종이 DOM 이벤트에 붙는다', () => {
  const attached = (on: Interaction['on'], dom: 'onClick' | 'onChange' | 'onSubmit'): boolean => {
    const doc = example([{ on, actions: [] }])
    const tree = renderDocument(doc, { interaction: {} })
    return handlerOf(tree, 'n_btn', dom) !== undefined
  }

  it('click과 select가 같은 onClick을 쓴다', () => {
    // 와이어프레임 DOM에는 "선택"을 내는 네이티브 이벤트원이 없다 — 근거는
    // `render.tsx`의 `handlersFor` 머리말.
    expect(attached('click', 'onClick')).toBe(true)
    expect(attached('select', 'onClick')).toBe(true)
  })

  it('change와 submit도 붙는다', () => {
    expect(attached('change', 'onChange')).toBe(true)
    expect(attached('submit', 'onSubmit')).toBe(true)
  })

  /**
   * **이 케이스가 지키는 것은 절반뿐이다.** 재는 것은 *"핸들러가 `preventDefault`를
   * 부르는가"*이고, **그 결과(폼 제출이 페이지를 떠나지 않는다)는 jsdom에서 잴 수 없다** —
   * 거기서는 제출이 이동을 만들지 않는다.
   *
   * **나머지 절반은 실브라우저 A/B/A로만 잰다:** 그 줄을 걷어 낸 번들은 실제로
   * `/landed.html`로 **이동한다.** 값과 다시 재는 장치는 `render.tsx`의 그 자리 주석에
   * 있다. **회귀가 그 갈래를 지키지 않는다.**
   */
  it('submit 규칙은 기본 동작을 막는다 — 이동까지는 여기서 못 잰다', () => {
    const doc = example([{ on: 'submit', actions: [] }])
    const tree = renderDocument(doc, { interaction: {} })
    let prevented = false
    const event = {
      preventDefault: () => {
        prevented = true
      },
    }

    handlerOf(tree, 'n_btn', 'onSubmit')?.(event)

    expect(prevented).toBe(true)
  })

  it('click 규칙은 링크 밖의 누름의 기본 동작을 막지 않는다 — 음성 대조', () => {
    // 막으면 제출 단추를 누른 판의 `submit` 이 함께 죽는다. 링크 안인지로만 갈린다(아래 케이스).
    const doc = example(CLICK_SETS_LOADING)
    const tree = renderDocument(doc, { interaction: {} })
    let prevented = false

    handlerOf(
      tree,
      'n_btn',
      'onClick',
    )?.({
      target: { closest: () => null },
      preventDefault: () => {
        prevented = true
      },
    })

    expect(prevented).toBe(false)
  })

  it('click 규칙이 걸린 노드의 누름이 링크 안이면 링크의 기본 동작을 막는다 — 실브라우저 판은 `apps/web` 의 build-test', () => {
    // 링크의 `#` 이동이 번들 뷰어의 `hashchange` 로 «화면 상태 바꾸기» 를 되돌린다(`handlersFor` 의 주석).
    const doc = example(CLICK_SETS_LOADING)
    const tree = renderDocument(doc, { interaction: {} })
    let prevented = false
    const asked: string[] = []

    handlerOf(
      tree,
      'n_btn',
      'onClick',
    )?.({
      target: {
        closest: (selector: string) => {
          asked.push(selector)
          return {}
        },
      },
      preventDefault: () => {
        prevented = true
      },
    })

    expect({ prevented, asked }).toEqual({ prevented: true, asked: ['a[href]'] })
  })

  it('한 노드에 click과 select가 함께 걸리면 한 번 눌러 둘 다 돈다', () => {
    const doc = example([
      { on: 'click', actions: [{ type: 'setProp', target: 'n_list', prop: 'fixedColumns', value: 3 }] },
      { on: 'select', actions: [{ type: 'setProp', target: 'n_list', prop: 'empty', value: true }] },
    ])

    const { events, overlay } = press(doc, 'n_btn')

    expect(events.map((event) => event.trigger)).toEqual(['click', 'select'])
    // **뒤 트리거가 앞 트리거의 겹layer 위에서 돈다** — 아니면 하나가 사라진다.
    expect(overlay['n_list']).toEqual({ fixedColumns: 3, empty: true })
  })
})

describe('깨진 규칙', () => {
  /** 같은 문서를 검증기에 넣었을 때 나오는 그 액션의 문장. **런타임과 대조한다.** */
  function validationMessage(doc: PageDocument, code: string): string | undefined {
    return validatePage(doc).find((issue) => issue.code === code)?.message
  }

  it('끊긴 타겟 — 조용히 지나가지 않고 검증기와 같은 문장을 낸다', () => {
    const doc = example([{ on: 'click', actions: [{ type: 'setProp', target: 'n_gone', prop: 'loading', value: true }] }])

    const { events, overlay } = press(doc, 'n_btn')

    expect(overlay).toBe(EMPTY_OVERLAY)
    expect(events[0]?.issues).toEqual([
      {
        nodeId: 'n_btn',
        index: 0,
        actionIndex: 0,
        code: 'missing-interaction-target',
        message: 'setProp의 타겟 노드가 문서에 없습니다: n_gone',
      },
    ])
    // **저장 게이트가 하는 말과 같아야 한다** — 두 벌로 두면 갈린다.
    expect(events[0]?.issues[0]?.message).toBe(validationMessage(doc, 'missing-interaction-target'))
  })

  it('아직 안 고른 타겟은 사라진 것과 갈라 말한다', () => {
    const doc = example([{ on: 'click', actions: [{ type: 'setProp', target: '', prop: 'loading', value: true }] }])

    expect(press(doc, 'n_btn').events[0]?.issues[0]?.message).toBe('setProp의 타겟을 아직 고르지 않았습니다')
  })

  it('없는 prop — 겹layer에 닿지 못한다', () => {
    const doc = example([{ on: 'click', actions: [{ type: 'setProp', target: 'n_list', prop: '없는속성', value: 1 }] }])

    const { events, overlay } = press(doc, 'n_btn')

    expect(overlay).toBe(EMPTY_OVERLAY)
    expect(events[0]?.issues[0]?.code).toBe('invalid-interaction-prop')
    expect(events[0]?.issues[0]?.message).toBe('DataGrid에 없는 prop입니다: 없는속성')
    expect(events[0]?.issues[0]?.message).toBe(validationMessage(doc, 'invalid-interaction-prop'))
  })

  it('예약 키 visible은 setProp으로 넘볼 수 없다', () => {
    // 이것이 깨지면 `setProp { prop: 'visible' }`이 겹layer의 예약 자리를 덮어 노드를
    // 숨긴다 — 카탈로그에 `visible` prop이 생기는 날 이 케이스가 먼저 죽는다.
    const doc = example([{ on: 'click', actions: [{ type: 'setProp', target: 'n_list', prop: 'visible', value: false }] }])

    const { events, overlay } = press(doc, 'n_btn')

    expect(overlay).toBe(EMPTY_OVERLAY)
    expect(events[0]?.issues[0]?.code).toBe('invalid-interaction-prop')
    expect(markup(doc, overlay)).toContain('data-wb-id="n_list"')
  })

  it('타입이 안 맞는 값 — 카탈로그의 zod가 판정한다', () => {
    const doc = example([{ on: 'click', actions: [{ type: 'setProp', target: 'n_list', prop: 'fixedColumns', value: -3 }] }])

    const { events, overlay } = press(doc, 'n_btn')

    expect(overlay).toBe(EMPTY_OVERLAY)
    expect(events[0]?.issues[0]?.message).toBe(validationMessage(doc, 'invalid-interaction-prop'))
  })

  it('패널이 아닌 대상 — 탭(Tabs) 자신도 아니다', () => {
    for (const target of ['n_list', 'n_tabs']) {
      const doc = example([{ on: 'click', actions: [{ type: 'switchTab', target }] }])

      const { events, overlay } = press(doc, 'n_btn')

      expect(overlay).toBe(EMPTY_OVERLAY)
      expect(events[0]?.issues[0]?.code).toBe('invalid-interaction-target')
      expect(events[0]?.issues[0]?.message).toBe(validationMessage(doc, 'invalid-interaction-target'))
    }
  })

  it('탭 밖에 선 패널(검증의 misplaced-component 판) — 바꿀 탭이 없다고 말한다', () => {
    const doc = example([{ on: 'click', actions: [{ type: 'switchTab', target: 'n_loose' }] }])
    doc.root.children!.push({ id: 'n_loose', type: 'TabPanel', props: { label: '떠돎' } })

    const { events, overlay } = press(doc, 'n_btn')

    expect(overlay).toBe(EMPTY_OVERLAY)
    expect(events[0]?.issues[0]).toMatchObject({
      code: 'invalid-interaction-target',
      message: '탭 패널이 탭 안에 있지 않아 바꿀 탭이 없습니다',
    })
  })

  it('셋 중 하나가 깨져도 나머지는 돈다 — 되돌리지 않는다', () => {
    const doc = example([
      {
        on: 'click',
        actions: [
          { type: 'setProp', target: 'n_list', prop: 'loading', value: true },
          { type: 'setProp', target: 'n_gone', prop: 'loading', value: true },
          { type: 'switchTab', target: 'n_tab2' },
        ],
      },
    ])

    const { events, overlay } = press(doc, 'n_btn')

    // 일어난 것은 일어난 대로 두고, 일어나지 않은 것을 말한다.
    expect(overlay['n_list']).toEqual({ loading: true })
    expect(overlay['n_tabs']).toEqual({ active: 1 })
    expect(events[0]?.issues).toHaveLength(1)
    expect(events[0]?.issues[0]?.actionIndex).toBe(1)
    expect(events[0]?.applied).toBe(2)
  })

  it('이슈의 자리가 편집 경로와 맞는다', () => {
    const doc = example([
      { on: 'click', actions: [] },
      { on: 'click', actions: [{ type: 'setProp', target: 'n_gone', prop: 'x', value: 1 }] },
    ])

    const issue = press(doc, 'n_btn').events[0]?.issues[0]

    expect(issue).toMatchObject({ nodeId: 'n_btn', index: 1, actionIndex: 0 })
  })
})

describe('navigate·openModal은 렌더러 밖이다', () => {
  it('실행하지 않고 요청으로 낸다', () => {
    const doc = example([
      {
        on: 'click',
        actions: [
          { type: 'navigate', target: 'page:관리자/회원/상세' },
          { type: 'openModal', target: 'page:관리자/회원/등록' },
        ],
      },
    ])

    const { events, overlay } = press(doc, 'n_btn')

    expect(overlay).toBe(EMPTY_OVERLAY)
    expect(events[0]?.requests).toEqual([
      { type: 'navigate', target: 'page:관리자/회원/상세', sourceNodeId: 'n_btn' },
      { type: 'openModal', target: 'page:관리자/회원/등록', sourceNodeId: 'n_btn' },
    ])
  })

  it('page: 접두를 벗기지 않는다 — 형식을 강제하지 않기로 한 판정 그대로다', () => {
    const doc = example([{ on: 'click', actions: [{ type: 'navigate', target: '아무거나' }] }])

    expect(press(doc, 'n_btn').events[0]?.requests[0]).toMatchObject({ target: '아무거나' })
  })

  it('아직 안 고른 페이지는 요청이 아니라 이슈다', () => {
    const doc = example([{ on: 'click', actions: [{ type: 'navigate', target: '  ' }] }])

    const { events } = press(doc, 'n_btn')

    expect(events[0]?.requests).toHaveLength(0)
    expect(events[0]?.issues[0]?.message).toBe('navigate의 타겟을 아직 고르지 않았습니다')
    // **검증기는 이 자리를 보지 않는다.** 런타임만 본다 — 그쪽은 저장을
    // 막는 자리이고 이쪽은 "눌렀는데 아무 일도 안 일어난다"를 막는 자리다.
    expect(validatePage(doc)).toHaveLength(0)
  })
})

describe('runInteraction — 상태를 들지 않는 순수 함수', () => {
  it('같은 인자로 두 번 부르면 같은 답이다', () => {
    const doc = example(CLICK_SETS_LOADING)
    const first = runInteraction(doc.root, 'n_btn', 'click')
    const second = runInteraction(doc.root, 'n_btn', 'click')

    expect(first.overlay).toEqual(second.overlay)
  })

  it('아무것도 안 바뀌면 받은 겹layer를 그대로 돌려준다', () => {
    const doc = example([{ on: 'click', actions: [] }])
    const overlay: InteractionOverlay = { n_list: { fixedColumns: 2 } }

    expect(runInteraction(doc.root, 'n_btn', 'click', overlay).overlay).toBe(overlay)
  })

  it('문서에 없는 노드를 눌러도 던지지 않는다', () => {
    expect(runInteraction(example([]).root, 'n_nope', 'click').matched).toBe(0)
  })

  it('뿌리가 없어도 던지지 않는다', () => {
    expect(runInteraction(null, 'n_btn', 'click').matched).toBe(0)
  })

  it('children에 노드 아닌 것이 섞여 있어도 던지지 않는다', () => {
    // 검증 **전** 문서가 이 모양일 수 있다(설계서 「정방향 흐름」). `walkNodes`는 여기서 던진다 —
    // 그래서 런타임이 자기 순회를 든다(`nodeIndex`의 머리말).
    const doc = {
      version: 1,
      root: {
        id: 'n_root',
        type: 'Page',
        children: [null, { id: 'n_btn', type: 'Button', props: {}, interactions: CLICK_SETS_LOADING }],
      },
    } as unknown as PageDocument

    expect(() => runInteraction(doc.root, 'n_btn', 'click')).not.toThrow()
    expect(runInteraction(doc.root, 'n_btn', 'click').issues[0]?.code).toBe('missing-interaction-target')
  })
})
