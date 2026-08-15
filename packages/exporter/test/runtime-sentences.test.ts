// @vitest-environment jsdom
/**
 * **문장과 동작이 같은 규칙을 가리키는가**(T6 · D9 · 재라 #7 · 사실 10).
 *
 * 우측 상호작용 탭의 문장은 `schema`의 `listInteractionSentences`가 만들고, 눌렀을 때
 * 일어나는 것은 `runtime/plan.ts`가 미리 계산한다. **둘이 갈리면 설계서가 거짓말을 한다** —
 * 탭에는 적혀 있는데 눌러도 안 되거나, 눌리는데 탭에 없다.
 *
 * 그리고 **사실 10을 다시 잰다**: *"검증기와 런타임의 문장이 여덟 갈래 전부 글자까지
 * 같다."* P5-3이 쟀고 그 뒤 슬라이스가 여럿 지났다. 아래 표가 그 여덟을 하나씩 짚는다.
 */
import { installStructures } from '@wirebound/renderer'
import {
  installCatalog,
  listInteractionSentences,
  validatePage,
  type Interaction,
  type InteractionAction,
  type PageDocument,
  type WbNode,
} from '@wirebound/schema'
import { beforeAll, describe, expect, it } from 'vitest'
import { exportBundle } from '../src/bundle/index'
import { buildRuntimePlan } from '../src/runtime/plan'

beforeAll(() => {
  installCatalog()
  installStructures()
})

function documentWith(interactions: Interaction[]): PageDocument {
  return {
    version: 1,
    root: {
      id: 'n_root',
      type: 'Page',
      children: [
        { id: 'n_btn', type: 'Button', props: { label: '검색' }, interactions },
        { id: 'n_list', type: 'List', props: {} },
        { id: 'n_tabs', type: 'Tabs', props: { tabs: ['ㄱ', 'ㄴ'], active: 0 } },
      ],
    } as WbNode,
  }
}

function planMessages(page: PageDocument): string[] {
  const { plan } = buildRuntimePlan({ page, theme: null, hrefs: new Map(), baseErrors: [] })
  return plan.events.flatMap((event) => event.issues.map((issue) => issue.message))
}

function validatorMessages(page: PageDocument): string[] {
  return validatePage(page)
    .filter((issue) => issue.code.includes('interaction'))
    .map((issue) => issue.message)
}

/**
 * **판정이 갈릴 수 있는 갈래 여덟.** `schema`의 `interaction/check.ts`가 내는 문장의 종류를
 * 자리마다 하나씩 짚는다 — 목록이 여기 글자로 사는 것이 요점이다(P8-2 이월 §11).
 */
const BRANCHES: [name: string, action: InteractionAction][] = [
  ['setProp 타겟을 아직 안 골랐다', { type: 'setProp', target: '  ', prop: 'loading', value: true }],
  ['setProp 타겟이 문서에 없다', { type: 'setProp', target: 'n_없음', prop: 'loading', value: true }],
  ['setProp의 prop이 그 컴포넌트에 없다', { type: 'setProp', target: 'n_list', prop: '없는것', value: 1 }],
  ['setProp의 값이 계약에 안 맞다', { type: 'setProp', target: 'n_list', prop: 'items', value: -1 }],
  ['switchTab의 타겟이 Tabs가 아니다', { type: 'switchTab', target: 'n_list', tab: 0 }],
  ['switchTab의 탭 번호가 계약에 안 맞다', { type: 'switchTab', target: 'n_tabs', tab: -3 }],
  ['navigate의 타겟을 아직 안 골랐다', { type: 'navigate', target: '' }],
  ['openModal의 타겟을 아직 안 골랐다', { type: 'openModal', target: '   ' }],
]

describe('사실 10을 다시 잰다 — 검증기와 런타임의 문장 (재라 #7)', () => {
  it('여덟 갈래가 전부 서로 다른 문장을 낸다 — 카나리아', () => {
    const messages = BRANCHES.map(([, action]) => planMessages(documentWith([{ on: 'click', actions: [action] }])))
    // 갈래마다 문장이 정확히 하나 나야 한다. 0이면 판정이 그 자리를 안 보는 것이다.
    expect(messages.map((list) => list.length)).toEqual(BRANCHES.map(() => 1))
    expect(new Set(messages.flat()).size).toBe(BRANCHES.length)
  })

  /**
   * **여섯은 글자까지 같다.** 저장 게이트와 런타임이 `checkNodeAction` 하나를 함께 부른다.
   */
  it.each(BRANCHES.slice(0, 6))('%s — 검증기와 런타임이 같은 문장을 낸다', (_name, action) => {
    const page = documentWith([{ on: 'click', actions: [action] }])
    expect(planMessages(page)).toEqual(validatorMessages(page))
  })

  /**
   * **나머지 둘은 런타임에만 있다 — 그리고 그것이 판정이다.**
   *
   * 검증기는 `navigate`·`openModal`을 아예 보지 않는다(P5-2 재라 #1: 형식을 강제해도 그
   * 페이지가 있다는 보장이 아니다). 런타임은 하나 더 안다 — **타겟이 비어 있으면 이동할
   * 곳이 없다.** 그 비대칭을 케이스로 못박아 둔다: 누군가 *"갈리네"*라고 읽고 검증기에
   * `checkPageAction`을 부르면 그쪽 판정이 뒤집히고, 그러면 **타겟이 된 노드를 지우는
   * 편집이 422가 된다.**
   */
  it.each(BRANCHES.slice(6))('%s — 검증기는 말이 없고 런타임만 말한다', (_name, action) => {
    const page = documentWith([{ on: 'click', actions: [action] }])
    expect(validatorMessages(page)).toEqual([])
    expect(planMessages(page)).toHaveLength(1)
  })
})

describe('탭의 문장과 눌리는 규칙이 같은 집합이다 (D9)', () => {
  const RULES: Interaction[] = [
    { on: 'click', actions: [{ type: 'setProp', target: 'n_list', prop: 'loading', value: true }] },
    { on: 'select', actions: [{ type: 'switchTab', target: 'n_tabs', tab: 1 }] },
    { on: 'change', actions: [] },
    { on: 'submit', actions: [{ type: 'navigate', target: 'page:어디' }] },
  ]

  it('규칙의 자리가 문장과 정확히 같다 — 트리거 4종 전부', () => {
    const page = documentWith(RULES)
    const { plan } = buildRuntimePlan({ page, theme: null, hrefs: new Map(), baseErrors: [] })
    const pressed = plan.events
      .flatMap((event) => event.rules.map((index) => `${event.nodeId}#${index}`))
      .sort()
    const written = listInteractionSentences(page)
      .map((sentence) => `${sentence.nodeId}#${sentence.index}`)
      .sort()
    expect(pressed).toEqual(written)
    // **하나짜리로 재지 않는다** — 규칙 하나면 집합이 섞여도 안 죽는다.
    expect(written.length).toBe(RULES.length)
  })

  /** 번들 안에서도 같은지 본다. 탭이 그린 노드와 계획이 든 노드가 같아야 한다. */
  it('번들의 상호작용 탭과 계획이 같은 노드를 가리킨다', () => {
    const bundle = exportBundle({ pages: [{ title: '한 장', document: documentWith(RULES) }] })
    const html = bundle.files.find((file) => file.path === 'pages/한-장.html')!.content
    const parsed = new DOMParser().parseFromString(html, 'text/html')
    const written = [
      ...parsed.querySelectorAll('#wb-export-panel-interactions [data-wb-interaction-for]'),
    ].map((line) => line.getAttribute('data-wb-interaction-for'))
    const data = parsed.getElementById('wb-export-runtime-data')
    const plan = JSON.parse(data?.textContent ?? '{}') as { events: { nodeId: string }[] }
    expect([...new Set(plan.events.map((event) => event.nodeId))]).toEqual([...new Set(written)])
    expect(written.length).toBeGreaterThan(1)
  })

  /**
   * **액션이 없는 규칙도 눌린다.** 문장은 *"아무 일도 일어나지 않습니다"*이고, 눌렀을 때
   * 화면도 그렇게 말해야 한다 — 아무 말도 없으면 *"눌렀는데 아무 일도 안 일어난다"*와
   * 구분되지 않는다.
   */
  it('액션이 없는 규칙은 그 사실을 말한다', () => {
    const page = documentWith([{ on: 'click', actions: [] }])
    const { plan } = buildRuntimePlan({ page, theme: null, hrefs: new Map(), baseErrors: [] })
    expect(plan.events).toHaveLength(1)
    expect(plan.events[0]).toMatchObject({ writes: [], issues: [], requests: [], rules: [0] })
    expect(listInteractionSentences(page)[0]?.text).toContain('아무 일도 일어나지 않습니다')
  })
})
