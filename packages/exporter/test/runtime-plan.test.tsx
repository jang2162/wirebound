/**
 * **내보내기가 판정하고 실행한다.**
 *
 * 이 파일이 지키는 것 중 **하나가 다른 것들을 떠받친다:** *"`runInteraction`의 답은 지금
 * 겹layer와 무관하다."* 그것이 참이라 미리 돌려 둔 쓰기 목록을 나중 겹layer에 얹어도 같은
 * 답이 나오고, 그래서 런타임이 그 함수를 브라우저로 데려갈 필요가 없다(`runtime/plan.ts`의
 * 머리말 ①). **그 케이스가 죽으면 런타임의 설계가 무너진다.**
 *
 * 여기서 **안 재는 것**: 실제 DOM에서 눌러 본 것(`runtime-bundle.test.ts`) · 번들 파일에
 * 무엇이 실렸는지(`bundle.test.tsx`).
 */
import {
  EMPTY_OVERLAY,
  installStructures,
  renderDocument,
  resetStructures,
  runInteraction,
  type InteractionEvent,
  type InteractionOverlay,
} from '@wirebound/renderer'
import {
  installCatalog,
  resetRegistry,
  validatePage,
  type Interaction,
  type InteractionTrigger,
  type PageDocument,
  type WbNode,
} from '@wirebound/schema'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildRuntimePlan, RUNTIME_JS, stateKey } from '../src/runtime/plan'

beforeAll(() => {
  installCatalog()
  installStructures()
})

const NO_HREFS = new Map<string, string | null>()

function page(interactions: Record<string, Interaction[]>): PageDocument {
  return {
    version: 1,
    root: {
      id: 'n_root',
      type: 'Page',
      children: [
        { id: 'n_btn', type: 'Button', props: { label: '검색' }, interactions: interactions['n_btn'] },
        { id: 'n_list', type: 'List', props: {} },
        { id: 'n_tabs', type: 'Tabs', props: { tabs: ['기본정보', '상세정보'], active: 0 } },
        { id: 'n_card', type: 'Card', props: { title: '회원' } },
      ],
    } as WbNode,
  }
}

function plan(document: PageDocument, hrefs: ReadonlyMap<string, string | null> = NO_HREFS) {
  return buildRuntimePlan({ page: document, theme: null, hrefs, baseErrors: [] })
}

/**
 * **`runInteraction`을 부르는 쪽이 무엇을 겹layer로 받든 답이 같은가.**
 *
 * `runtime/plan.ts`가 이 성질 위에 서 있다. 무작위 겹layer를 만들어 두 길을 견준다:
 * (가) 그 겹layer를 넣고 함수를 부른 것, (나) **빈 겹layer**에서 얻은 쓰기 목록을 그
 * 겹layer에 얹은 것.
 */
describe('runInteraction의 답이 지금 겹layer와 무관하다 (판정을 내보내기에 두는 설계가 여기 걸려 있다)', () => {
  const RULES: Interaction[] = [
    {
      on: 'click',
      actions: [
        { type: 'setProp', target: 'n_list', prop: 'loading', value: true },
        { type: 'setVisible', target: 'n_card', value: false },
        { type: 'switchTab', target: 'n_tabs', tab: 1 },
        { type: 'navigate', target: 'page:회원/상세' },
        { type: 'setProp', target: 'n_list', prop: 'items', value: 5 },
      ],
    },
    { on: 'select', actions: [{ type: 'setProp', target: 'n_list', prop: 'items', value: 3 }] },
  ]

  /** 되풀이 가능한 난수. `Math.random`을 쓰면 죽는 실행을 다시 못 만든다. */
  function* seeds(count: number): Generator<number> {
    let state = 1
    for (let index = 0; index < count; index += 1) {
      state = (state * 1103515245 + 12345) % 2147483648
      yield state
    }
  }

  /** 무작위 겹layer. 이미 눌린 뒤의 화면 상태를 흉내 낸다. */
  function overlayFor(seed: number): InteractionOverlay {
    const table: Record<string, Record<string, unknown>> = {}
    if (seed % 2 === 0) table['n_list'] = { loading: false, items: seed % 7 }
    if (seed % 3 === 0) table['n_card'] = { visible: seed % 6 === 0 }
    if (seed % 5 === 0) table['n_tabs'] = { active: seed % 2 }
    if (seed % 7 === 0) table['n_other'] = { label: '남' }
    return table
  }

  /** 빈 겹layer에서 얻은 쓰기 목록. `plan.ts`가 데이터로 심는 것과 같은 값이다. */
  function writesFrom(document: PageDocument, trigger: InteractionTrigger) {
    const result = runInteraction(document.root as WbNode, 'n_btn', trigger, EMPTY_OVERLAY)
    return Object.entries(result.overlay).flatMap(([target, record]) =>
      Object.entries(record).map(([prop, value]) => ({ target, prop, value })),
    )
  }

  it.each(['click', 'select'] as const)(
    '%s — 미리 얻은 쓰기를 얹은 것과 그때 부른 것이 같다',
    (trigger) => {
      const document = page({ n_btn: RULES })
      const writes = writesFrom(document, trigger)
      const rows: unknown[] = []
      for (const seed of seeds(40)) {
        const overlay = overlayFor(seed)
        const direct = runInteraction(document.root as WbNode, 'n_btn', trigger, overlay)
        const replayed: Record<string, Record<string, unknown>> = {
          ...(overlay as Record<string, Record<string, unknown>>),
        }
        for (const write of writes) {
          replayed[write.target] = { ...replayed[write.target], [write.prop]: write.value }
        }
        rows.push([seed, direct.overlay, replayed])
      }
      expect(rows.map((row) => (row as unknown[])[1])).toEqual(rows.map((row) => (row as unknown[])[2]))
    },
  )

  /** **하나짜리로 재지 않는다** — 겹layer를 여럿 만들어 자리마다 견줬다는 것을 세어 둔다. */
  it('견준 겹layer가 여럿이고 서로 다르다', () => {
    const shapes = new Set([...seeds(40)].map((seed) => JSON.stringify(overlayFor(seed))))
    expect(shapes.size).toBeGreaterThan(3)
  })
})

/**
 * **DOM 이벤트 하나가 도맡는 트리거를 렌더러에게 물어서 잰다.**
 *
 * `plan.ts`의 표는 `renderer`의 `DOM_EVENT`를 뒤집어 옮긴 것이고 그쪽은 수출되지 않는다.
 * 옮긴 값이 맞는지는 **실제 렌더러의 핸들러를 눌러** 확인한다 — 표를 표와 견주면 둘이 같이
 * 틀릴 수 있다.
 */
describe('DOM 이벤트 → 트리거 (plan.ts의 표가 렌더러와 같은가)', () => {
  const ALL: Interaction[] = [
    { on: 'click', actions: [] },
    { on: 'select', actions: [] },
    { on: 'change', actions: [] },
    { on: 'submit', actions: [] },
  ]

  function firedBy(dom: 'onClick' | 'onChange' | 'onSubmit'): InteractionTrigger[] {
    const events: InteractionEvent[] = []
    const tree = renderDocument(page({ n_btn: ALL }), {
      interaction: { onEvent: (event) => events.push(event) },
    })
    const handler = handlerOf(tree, 'n_btn', dom)
    handler?.({ preventDefault: () => {} } as never)
    return events.map((event) => event.trigger)
  }

  function handlerOf(
    tree: ReactElement,
    nodeId: string,
    dom: string,
  ): ((event: unknown) => void) | undefined {
    let found: ((event: unknown) => void) | undefined
    const visit = (element: unknown): void => {
      if (element === null || typeof element !== 'object') return
      const props = (element as { props?: Record<string, unknown> }).props
      if (props === undefined) return
      if (props['data-wb-id'] === nodeId && typeof props[dom] === 'function') {
        found = props[dom] as (event: unknown) => void
      }
      const children = props['children']
      if (Array.isArray(children)) for (const child of children) visit(child)
      else visit(children)
    }
    visit(tree)
    return found
  }

  it('렌더러가 실제로 내는 짝이 plan.ts의 표와 같다', () => {
    expect({
      click: firedBy('onClick'),
      change: firedBy('onChange'),
      submit: firedBy('onSubmit'),
    }).toEqual({ click: ['click', 'select'], change: ['change'], submit: ['submit'] })
  })
})

/**
 * **상태 열쇠의 계약.** `browser.ts`가 같은 이름의 함수를 **글자로 한 벌 더** 든다
 * (브라우저로 나가는 함수가 클로저를 못 들기 때문이다). 두 벌이 갈리면 미리 그려 둔 판을
 * 못 찾는데, 그 사고는 **누른 뒤에야** 보인다. 여기서 계약을 못박고, 실제로 맞물리는지는
 * `runtime-bundle.test.ts`가 눌러서 잰다.
 */
describe('상태 열쇠 (browser.ts와 두 벌이다)', () => {
  it('visible은 열쇠에 안 들어간다 — 그릴 판이 아니라 뺄지를 정하는 값이다', () => {
    expect(stateKey({ loading: true, visible: false })).toBe(stateKey({ loading: true }))
    expect(stateKey({ visible: false })).toBe('')
  })

  it('열쇠의 순서가 기록의 순서에 안 매인다', () => {
    expect(stateKey({ items: 3, loading: true })).toBe(stateKey({ loading: true, items: 3 }))
  })

  it('값이 다르면 열쇠가 다르다 — 카나리아', () => {
    expect(stateKey({ loading: true })).not.toBe(stateKey({ loading: false }))
    expect(stateKey({})).toBe('')
  })
})

describe('계획이 무엇을 담나', () => {
  const RULES: Interaction[] = [
    { on: 'click', actions: [{ type: 'setProp', target: 'n_list', prop: 'loading', value: true }] },
  ]

  it('DOM 이벤트별로 쓰기·규칙 자리를 담는다', () => {
    const { plan: built } = plan(page({ n_btn: RULES }))
    expect(built.events).toEqual([
      {
        nodeId: 'n_btn',
        dom: 'click',
        writes: [{ target: 'n_list', prop: 'loading', value: true }],
        requests: [],
        issues: [],
        rules: [0],
      },
    ])
  })

  /** **깨진 규칙이 조용히 지나가지 않는다** — 판정이 여기서 나고 문장이 데이터로 실린다. */
  it('실행할 수 없는 액션을 문장과 함께 담는다 — 쓰기는 없다', () => {
    const { plan: built } = plan(
      page({
        n_btn: [
          {
            on: 'click',
            actions: [{ type: 'setProp', target: 'n_list', prop: '없는prop', value: 1 }],
          },
        ],
      }),
    )
    expect(built.events).toHaveLength(1)
    expect(built.events[0]?.writes).toEqual([])
    expect(built.events[0]?.issues).toEqual([
      { index: 0, actionIndex: 0, message: 'List에 없는 prop입니다: 없는prop' },
    ])
  })

  /** **저장 게이트가 쓰는 것과 같은 함수가 만든 문장이다.** */
  it('그 문장이 schema의 검증기가 내는 것과 같다', () => {
    const document = page({
      n_btn: [
        {
          on: 'click',
          actions: [
            { type: 'setProp', target: 'n_list', prop: '없는prop', value: 1 },
            { type: 'setProp', target: 'n_없음', prop: 'loading', value: true },
            { type: 'switchTab', target: 'n_card', tab: 1 },
            { type: 'switchTab', target: 'n_tabs', tab: -3 },
          ],
        },
      ],
    })
    const { plan: built } = plan(document)
    expect(built.events[0]?.issues.map((issue) => issue.message)).toEqual(
      validationMessages(document),
    )
  })

  it('페이지 액션은 요청이 되고 링크가 붙는다', () => {
    const { plan: built } = plan(
      page({
        n_btn: [
          {
            on: 'click',
            actions: [
              { type: 'navigate', target: 'page:회원/상세' },
              { type: 'openModal', target: 'page:회원/등록' },
            ],
          },
        ],
      }),
      new Map([['page:회원/상세', '회원-상세.html']]),
    )
    expect(built.events[0]?.requests).toEqual([
      { type: 'navigate', target: 'page:회원/상세', href: '회원-상세.html', problem: null },
      {
        type: 'openModal',
        target: 'page:회원/등록',
        href: null,
        problem: '이 번들에 없는 페이지입니다: page:회원/등록',
      },
    ])
  })

  /**
   * **못 가는 이유가 둘이고 문장이 갈린다.** 없는 것과 둘 이상인 것은 읽는
   * 사람이 할 일이 다르다 — 없으면 그 페이지를 함께 내보내야 하고, 둘 이상이면 타겟을
   * 짓는 쪽이 겹치게 만든 것이다. **판정도 문장도 내보내기가 짓는다.**
   */
  it('타겟을 가진 페이지가 둘 이상이면 링크가 없고 다른 말을 한다', () => {
    const { plan: built } = plan(
      page({
        n_btn: [{ on: 'click', actions: [{ type: 'navigate', target: 'page:겹침' }] }],
      }),
      new Map([['page:겹침', null]]),
    )
    expect(built.events[0]?.requests).toEqual([
      {
        type: 'navigate',
        target: 'page:겹침',
        href: null,
        problem: '이 타겟을 가리키는 페이지가 번들에 둘 이상입니다: page:겹침',
      },
    ])
  })

  /** **`href`가 없으면 이유가 반드시 있다.** 둘 다 비면 화면이 조용해진다. */
  it('링크가 없는 요청은 반드시 이유를 든다', () => {
    const { plan: built } = plan(
      page({
        n_btn: [
          {
            on: 'click',
            actions: [
              { type: 'navigate', target: 'page:없음' },
              { type: 'openModal', target: 'page:겹침' },
            ],
          },
        ],
      }),
      new Map([['page:겹침', null]]),
    )
    const requests = built.events[0]?.requests ?? []
    expect(requests).toHaveLength(2)
    for (const request of requests) {
      expect(request.href === null ? request.problem !== null : request.problem === null).toBe(true)
    }
  })

  it('규칙이 없는 노드는 항목을 만들지 않는다', () => {
    expect(plan(page({})).plan.events).toEqual([])
  })

  /**
   * **한 DOM 이벤트가 트리거 둘을 도맡을 때 둘 다 실린다**(`click` ← `click`·`select`).
   *
   * 렌더러는 앞 트리거가 만든 겹layer **위에서** 뒤 트리거를 돌린다. 여기서 이어 돌리지
   * 않으면 **앞 트리거의 쓰기가 통째로 사라지는데**, 화면에서는 *"규칙 하나는 되고 하나는
   * 안 된다"*로만 보인다.
   */
  it('click과 select가 한 항목에 함께 실린다 — 순서까지', () => {
    const { plan: built } = plan(
      page({
        n_btn: [
          { on: 'click', actions: [{ type: 'setProp', target: 'n_list', prop: 'loading', value: true }] },
          { on: 'select', actions: [{ type: 'setProp', target: 'n_card', prop: 'title', value: '고름' }] },
        ],
      }),
    )
    expect(built.events).toHaveLength(1)
    expect(built.events[0]?.dom).toBe('click')
    expect(built.events[0]?.rules).toEqual([0, 1])
    expect(built.events[0]?.writes).toEqual([
      { target: 'n_list', prop: 'loading', value: true },
      { target: 'n_card', prop: 'title', value: '고름' },
    ])
  })

  /**
   * **카탈로그 없이 판정하면 침묵이 돌아온다.**
   *
   * `checkNodeAction`은 `getComponent`가 빈손이면 **문제가 없다고 답한다** — 대조할 계약이
   * 없기 때문이다. 그러면 깨진 규칙이 이슈 0건으로 지나가고 **쓰기까지 실린다.**
   * 그래서 이 함수가 스스로 설치한다. 그 줄이 사라지면 여기가 죽는다.
   */
  it('카탈로그가 비어 있어도 판정한다 — 스스로 설치한다', () => {
    const document = page({
      n_btn: [
        { on: 'click', actions: [{ type: 'setProp', target: 'n_list', prop: '없는prop', value: 1 }] },
      ],
    })
    try {
      resetRegistry()
      resetStructures()
      const { plan: built } = buildRuntimePlan({
        page: document,
        theme: null,
        hrefs: NO_HREFS,
        baseErrors: [],
      })
      expect(built.events[0]?.issues).toHaveLength(1)
      expect(built.events[0]?.writes).toEqual([])
    } finally {
      installCatalog()
      installStructures()
    }
  })
})

/**
 * **미리 그려 둔 판이 문서 전체를 그 겹layer로 그린 것과 같은가.**
 *
 * 이것이 *"상호작용이 동작한다"*의 알맹이다 — 갈리면 누른 뒤의 화면이 웹 앱과 다르다.
 * **자리마다 견준다:** 겹layer가 닿는 노드마다 그 자리의 HTML을 뽑아 견준다.
 */
describe('미리 그린 판이 렌더러의 답과 같다 (설계서 「HTML 정적 번들」)', () => {
  const RULES: Interaction[] = [
    {
      on: 'click',
      actions: [
        { type: 'setProp', target: 'n_list', prop: 'loading', value: true },
        { type: 'switchTab', target: 'n_tabs', tab: 1 },
      ],
    },
    { on: 'change', actions: [{ type: 'setProp', target: 'n_list', prop: 'items', value: 3 }] },
  ]

  /** 문서 전체를 그 겹layer로 그린 뒤 그 노드가 시작하는 자리부터 낸다. */
  function sliceOf(document: PageDocument, overlay: InteractionOverlay, nodeId: string): string {
    const html = renderToStaticMarkup(renderDocument(document, { interaction: { overlay } }))
    const at = html.indexOf(`data-wb-id="${nodeId}"`)
    expect(at).toBeGreaterThan(-1)
    return html.slice(html.lastIndexOf('<', at))
  }

  it('겹layer가 닿는 노드마다 미리 그린 판이 전체 렌더와 맞물린다', () => {
    const document = page({ n_btn: RULES })
    const { plan: built } = plan(document)
    const rows = Object.entries(built.variants).flatMap(([nodeId, table]) =>
      Object.entries(table).map(([key, html]) => {
        const record = Object.fromEntries(JSON.parse(key) as [string, unknown][])
        return [nodeId, key, sliceOf(document, { [nodeId]: record }, nodeId).startsWith(html)]
      }),
    )
    expect(rows.map((row) => row[2])).toEqual(rows.map(() => true))
    // **하나짜리로 재지 않는다** — 노드도 판도 여럿이어야 자리가 섞였을 때 죽는다.
    expect(Object.keys(built.variants).length).toBeGreaterThan(1)
    expect(rows.length).toBeGreaterThan(2)
  })

  it('닿을 수 있는 상태를 전부 담는다 — 두 규칙이 겹친 것까지', () => {
    const { plan: built } = plan(page({ n_btn: RULES }))
    expect(Object.keys(built.variants['n_list'] ?? {}).sort()).toEqual(
      [
        '[["loading",true]]',
        '[["items",3]]',
        '[["items",3],["loading",true]]',
      ].sort(),
    )
  })

  /** `setVisible`은 그릴 판이 없다 — DOM에서 빼는 것이라 판이 아니라 삭제다. */
  it('setVisible만 받는 노드는 판을 만들지 않는다', () => {
    const { plan: built } = plan(
      page({
        n_btn: [{ on: 'click', actions: [{ type: 'setVisible', target: 'n_card', value: false }] }],
      }),
    )
    expect(built.variants['n_card']).toBeUndefined()
    expect(built.events[0]?.writes).toEqual([
      { target: 'n_card', prop: 'visible', value: false },
    ])
  })
})

/** **조용히 자르지 않는다.** 상한을 넘으면 그 페이지의 런타임을 끄고 그 사실을 싣는다. */
describe('상태가 너무 많으면 끈다', () => {
  it('끈 계획은 항목도 판도 비어 있고 이유를 든다', () => {
    // **상한을 몰라도 넘길 수 있게 짠다** — 자가 구현의 수를 import하면 함께 움직인다.
    //
    // **버튼을 여럿 둔다.** 한 버튼에 규칙을 몰면 한 번에 다 눌리므로 닿는 상태가 **하나**다.
    // 버튼이 갈리면 순서가 자유로워져 조합이 **곱**으로
    // 는다 — 그 곱이 실제 위험이다.
    const props = ['pagination', 'selectable', 'selected', 'disabled', 'loading', 'empty']
    const buttons = props.flatMap((prop, index) =>
      [true, false].map((value, side) => ({
        id: `n_b${index}${side}`,
        type: 'Button',
        props: { label: `${prop}${side}` },
        interactions: [
          { on: 'click', actions: [{ type: 'setProp', target: 'n_list', prop, value }] },
        ],
      })),
    )
    const document: PageDocument = {
      version: 1,
      root: {
        id: 'n_root',
        type: 'Page',
        children: [{ id: 'n_list', type: 'List', props: {} }, ...buttons],
      } as WbNode,
    }
    const { plan: built } = plan(document)
    expect(built.events).toEqual([])
    expect(built.variants).toEqual({})
    expect(built.disabled).toBe('상호작용 상태가 너무 많아 이 번들에서는 실행되지 않습니다')
  })
})

/**
 * **런타임 파일은 고전 스크립트다.** `file://`에서 외부 모듈 스크립트는 CORS로 막힌다
 * (실브라우저에서 `file://`로 연 번들에 `type="module"`을 걸면 재현된다).
 *
 * 그리고 **바깥 스코프를 참조하지 않는다** — `toString()`으로 나가므로 클로저가 따라가지
 * 않는다. 아무것도 없는 문맥에서 실제로 돌려 본다.
 */
describe('assets/runtime.js', () => {
  it('모듈 문법이 없다', () => {
    expect(RUNTIME_JS).not.toMatch(/\bimport\s/)
    expect(RUNTIME_JS).not.toMatch(/\bexport\s/)
    expect(RUNTIME_JS).not.toContain('require(')
  })

  /** `file://`에서 `cssRules`가 던진다 — 근거는 `runtime/browser.ts`의 머리말. */
  it('시트를 읽지 않는다', () => {
    expect(RUNTIME_JS).not.toContain('cssRules')
    expect(RUNTIME_JS).not.toContain('styleSheets')
  })

  /** 카탈로그도 zod도 안 실린다 — 판정은 내보내기가 하기 때문이다. */
  it('판정하는 코드를 싣지 않는다', () => {
    expect(RUNTIME_JS).not.toContain('safeParse')
    expect(RUNTIME_JS).not.toContain('checkNodeAction')
  })

  it('빈 문맥에서 돈다 — 클로저를 안 든다', () => {
    const calls: string[] = []
    const fake = {
      querySelector: (selector: string) => {
        calls.push(selector)
        return null
      },
      getElementById: () => null,
    }
    const run = new Function('document', 'window', RUNTIME_JS) as (
      document: unknown,
      window: unknown,
    ) => void
    run(fake, { addEventListener: () => {} })
    expect(calls).toEqual(['.wb-export-canvas', '.wb-export-status'])
  })
})

/** `schema`의 저장 게이트가 같은 액션에 대해 내는 문장. **같은 함수가 만든다.** */
function validationMessages(document: PageDocument): string[] {
  return validatePage(document)
    .filter((issue) => issue.code.includes('interaction'))
    .map((issue) => issue.message)
}
