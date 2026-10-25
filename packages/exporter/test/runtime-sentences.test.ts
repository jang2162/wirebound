// @vitest-environment jsdom
/**
 * **문장과 동작이 같은 규칙을 가리키는가.**
 *
 * 우측 상호작용 탭의 문장은 `schema`의 `listInteractionSentences`가 만들고, 눌렀을 때
 * 일어나는 것은 번들 런타임이 브라우저에서 돌린다(`browser/mount.tsx` — 렌더러의 상호작용 런타임). **둘이 갈리면 설계서가
 * 거짓말을 한다** — 탭에는 적혀 있는데 눌러도 안 되거나, 눌리는데 탭에 없다.
 *
 * 그리고 **검증기와 런타임의 문장을 갈래마다 잰다** — 일곱 갈래 중 다섯은 글자까지 같고
 * 둘은 런타임에만 있다. 아래 표가 그 일곱을 하나씩 짚는다. 런타임의 문장은 **마운트해 눌러 상태 줄에서** 읽는다.
 */
import { NO_THEME, renderDocument, type InteractionEvent } from '@wirebound/renderer'
import {
  installCatalog,
  listInteractionSentences,
  validatePage,
  type Interaction,
  type InteractionAction,
  type PageDocument,
  type WbNode,
} from '@wirebound/schema'
import { act } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { beforeAll, describe, expect, it } from 'vitest'
import { EMPTY_RULE, mountExportDocument } from '../src/browser/mount'
import { exportBundle } from '../src/bundle/index'
import { nodesOnly } from '../src/nodes'

beforeAll(() => {
  installCatalog()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

function documentWith(interactions: Interaction[]): PageDocument {
  return {
    version: 5,
    root: {
      id: 'n_root',
      type: 'Page',
      children: [
        { id: 'n_btn', type: 'Button', props: { label: '검색' }, interactions },
        { id: 'n_list', type: 'List', props: {} },
        {
          id: 'n_tabs',
          type: 'Tabs',
          props: { active: 0 },
          children: [
            { id: 'n_tab_a', type: 'TabPanel', props: { label: 'ㄱ' } },
            { id: 'n_tab_b', type: 'TabPanel', props: { label: 'ㄴ' } },
          ],
        },
      ],
    } as WbNode,
  }
}

/** 번들 런타임으로 그리고 `n_btn` 을 눌러 상태 줄이 말한 것. */
function planMessages(page: PageDocument): string[] {
  const canvas = document.createElement('div')
  const status = document.createElement('div')
  document.body.append(canvas, status)
  let mount: ReturnType<typeof mountExportDocument> | null = null
  act(() => {
    mount = mountExportDocument(canvas, { document: page, theme: NO_THEME, tokens: {}, window, hrefs: {}, markers: [], status })
  })
  act(() => {
    canvas.querySelector('[data-wb-id="n_btn"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
  const lines = [...status.querySelectorAll('.wb-export-status-line')].map((line) => line.textContent ?? '')
  act(() => mount!.unmount())
  canvas.remove()
  status.remove()
  return lines
}

/**
 * 눌리는 규칙 — 렌더러가 그린 문서의 **모든 노드에 DOM 이벤트 셋을 쏘아** 반응한 규칙의 자리(`<노드>#<규칙 인덱스>`). 번들 런타임이
 * 부르는 것과 같은 `renderDocument` 의 상호작용이다.
 */
function firedRules(page: PageDocument): string[] {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const events: InteractionEvent[] = []
  const root = createRoot(host)
  act(() => {
    flushSync(() =>
      root.render(renderDocument(page, { theme: NO_THEME, interaction: { overlay: {}, onEvent: (event) => events.push(event) } })),
    )
  })
  for (const element of [...host.querySelectorAll('[data-wb-id]')]) {
    for (const kind of ['click', 'change', 'submit']) {
      // 버블링해야 React 의 뿌리 리스너가 받는다 — 부모의 규칙이 함께 돌아도 모으는 것이 집합이라 두 번 세지 않는다.
      act(() => {
        element.dispatchEvent(new Event(kind, { bubbles: true, cancelable: true }))
      })
    }
  }
  act(() => root.unmount())
  host.remove()
  const nodes = new Map<string, WbNode>()
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== 'object') return
    const value = node as WbNode
    if (typeof value.id === 'string') nodes.set(value.id, value)
    for (const child of Array.isArray(value.children) ? value.children : []) visit(child)
  }
  visit(page.root)
  const out = new Set<string>()
  for (const event of events) {
    for (const [index, interaction] of (nodes.get(event.nodeId)?.interactions ?? []).entries()) {
      if (interaction?.on === event.trigger) out.add(`${event.nodeId}#${index}`)
    }
  }
  return [...out].sort()
}

function validatorMessages(page: PageDocument): string[] {
  return validatePage(page)
    .filter((issue) => issue.code.includes('interaction'))
    .map((issue) => issue.message)
}

/**
 * **판정이 갈릴 수 있는 갈래 일곱.** `schema`의 `interaction/check.ts`가 내는 문장의 종류를
 * 자리마다 하나씩 짚는다 — 목록이 여기 글자로 사는 것이 요점이다.
 */
const BRANCHES: [name: string, action: InteractionAction][] = [
  ['setProp 타겟을 아직 안 골랐다', { type: 'setProp', target: '  ', prop: 'loading', value: true }],
  ['setProp 타겟이 문서에 없다', { type: 'setProp', target: 'n_없음', prop: 'loading', value: true }],
  ['setProp의 prop이 그 컴포넌트에 없다', { type: 'setProp', target: 'n_list', prop: '없는것', value: 1 }],
  ['setProp의 값이 계약에 안 맞다', { type: 'setProp', target: 'n_list', prop: 'items', value: -1 }],
  ['switchTab의 타겟이 TabPanel이 아니다', { type: 'switchTab', target: 'n_list' }],
  ['navigate의 타겟을 아직 안 골랐다', { type: 'navigate', target: '' }],
  ['openModal의 타겟을 아직 안 골랐다', { type: 'openModal', target: '   ' }],
]

describe('검증기와 런타임의 문장을 갈래마다 잰다', () => {
  it('일곱 갈래가 전부 서로 다른 문장을 낸다 — 카나리아', () => {
    const messages = BRANCHES.map(([, action]) => planMessages(documentWith([{ on: 'click', actions: [action] }])))
    // 갈래마다 문장이 정확히 하나 나야 한다. 0이면 판정이 그 자리를 안 보는 것이다.
    expect(messages.map((list) => list.length)).toEqual(BRANCHES.map(() => 1))
    expect(new Set(messages.flat()).size).toBe(BRANCHES.length)
  })

  /**
   * **다섯은 글자까지 같다.** 저장 게이트와 런타임이 `checkNodeAction` 하나를 함께 부른다.
   */
  it.each(BRANCHES.slice(0, 5))('%s — 검증기와 런타임이 같은 문장을 낸다', (_name, action) => {
    const page = documentWith([{ on: 'click', actions: [action] }])
    expect(planMessages(page)).toEqual(validatorMessages(page))
  })

  /**
   * **나머지 둘은 런타임에만 있다 — 그리고 그것이 판정이다.**
   *
   * 검증기는 `navigate`·`openModal`을 아예 보지 않는다(형식을 강제해도 그 페이지가 있다는
   * 보장이 아니다). 런타임은 하나 더 안다 — **타겟이 비어 있으면 이동할
   * 곳이 없다.** 그 비대칭을 케이스로 못박아 둔다: 누군가 *"갈리네"*라고 읽고 검증기에
   * `checkPageAction`을 부르면 그쪽 판정이 뒤집히고, 그러면 **타겟이 된 노드를 지우는
   * 편집이 422가 된다.**
   */
  it.each(BRANCHES.slice(5))('%s — 검증기는 말이 없고 런타임만 말한다', (_name, action) => {
    const page = documentWith([{ on: 'click', actions: [action] }])
    expect(validatorMessages(page)).toEqual([])
    expect(planMessages(page)).toHaveLength(1)
  })
})

describe('탭의 문장과 눌리는 규칙이 같은 집합이다', () => {
  const RULES: Interaction[] = [
    { on: 'click', actions: [{ type: 'setProp', target: 'n_list', prop: 'loading', value: true }] },
    { on: 'select', actions: [{ type: 'switchTab', target: 'n_tab_b' }] },
    { on: 'change', actions: [] },
    { on: 'submit', actions: [{ type: 'navigate', target: 'page:어디' }] },
  ]

  /**
   * **`change` 규칙은 문장만 있고 눌리지 않는다 — 캔버스와 같다.** 렌더러의 `onChange` 는 React 가 입력 요소(`input` · `select` ·
   * `textarea`)에서만 내는데 기본 뷰가 그런 요소를 그리지 않는다(`apps/web/test/canvas/interaction-runtime.test.tsx` «change는
   * 닿지 않는다»). 번들 런타임은 캔버스와 같은 렌더러라 같은 판이다. 그 규칙을 뺀 셋이 문장과 같은 집합이다.
   */
  it('규칙의 자리가 문장과 정확히 같다 — change 는 문장만 있다', () => {
    const page = documentWith(RULES)
    const pressed = firedRules(page)
    const written = listInteractionSentences(page)
      .map((sentence) => `${sentence.nodeId}#${sentence.index}`)
      .sort()
    expect(pressed).toEqual(written.filter((rule) => rule !== 'n_btn#2'))
    // **하나짜리로 재지 않는다** — 규칙 하나면 집합이 섞여도 안 죽는다.
    expect(written.length).toBe(RULES.length)
    expect(RULES[2]?.on).toBe('change')
  })

  /** 번들 안에서도 같은지 본다. 탭이 그린 노드와 눌리는 규칙의 노드가 같아야 한다. */
  it('번들의 상호작용 탭과 눌리는 규칙이 같은 노드를 가리킨다', () => {
    const page = documentWith(RULES)
    const bundle = exportBundle({ pages: [{ title: '한 장', document: page }], runtimeJs: '/* runtime */' })
    const html = bundle.files.find((file) => file.path === 'pages/한-장.html')!.content as string
    const parsed = new DOMParser().parseFromString(html, 'text/html')
    const written = [...parsed.querySelectorAll('#wb-export-panel-interactions [data-wb-interaction-for]')].map((line) =>
      line.getAttribute('data-wb-interaction-for'),
    )
    expect([...new Set(firedRules(page).map((rule) => rule.split('#')[0]))]).toEqual([...new Set(written)])
    expect(written.length).toBeGreaterThan(1)
  })

  /**
   * **깨진 자식 하나가 멀쩡한 규칙의 문장을 지우면 안 된다.**
   *
   * 문장화가 던지는 것을 막으려고 **목록을 통째로 비우면** 화면이
   * *"상호작용이 없습니다"*라고 말하는데 **버튼은 그대로 눌린다** — 런타임은 견디는 순회를
   * 쓰기 때문이다. 탭과 계획의 집합 같음이 겨냥한 바로 그 자리다.
   */
  it('노드가 아닌 자식이 있어도 멀쩡한 규칙의 문장이 남는다', () => {
    const page = documentWith(RULES)
    const broken: PageDocument = {
      ...page,
      root: { ...page.root, children: [...(page.root.children ?? []), null as unknown as never] },
    }
    const pressed = firedRules(broken)
    const written = listInteractionSentences({ ...broken, root: nodesOnly(broken.root)! })
      .map((sentence) => `${sentence.nodeId}#${sentence.index}`)
      .sort()
    // `change` 규칙(#2)은 위 케이스의 까닭으로 눌리지 않는다.
    expect(pressed).toEqual(written.filter((rule) => rule !== 'n_btn#2'))
    expect(written.length).toBe(RULES.length)
  })

  /** 번들이 실제로 그린 탭에서도 같은지. 자와 대상이 갈리지 않게 그린 것에서 잰다. */
  it('깨진 자식이 있는 번들의 상호작용 탭이 비어 있지 않다', () => {
    const page = documentWith(RULES)
    const broken: PageDocument = {
      ...page,
      root: { ...page.root, children: [...(page.root.children ?? []), null as unknown as never] },
    }
    const bundle = exportBundle({ pages: [{ title: '깨짐', document: broken }], runtimeJs: '/* runtime */' })
    const html = bundle.files.find((file) => file.path === 'pages/깨짐.html')!.content as string
    const parsed = new DOMParser().parseFromString(html, 'text/html')
    const written = [...parsed.querySelectorAll('#wb-export-panel-interactions [data-wb-interaction-for]')].map((line) =>
      line.getAttribute('data-wb-interaction-for'),
    )
    expect(written).toHaveLength(RULES.length)
    expect([...new Set(firedRules(broken).map((rule) => rule.split('#')[0]))]).toEqual([...new Set(written)])
    // 그 노드는 여전히 errors가 이름을 든다 — 조용히 넘기는 것이 아니다.
    expect(bundle.errors.map((item) => item.error.message)).toEqual(['노드가 객체가 아닙니다: null'])
  })

  /**
   * **집합 같음의 거울면 — 탭이 말하는데 눌리지 않는 규칙.**
   *
   * 위 케이스가 막는 것은 *"탭은 없다고 하는데 버튼은 눌린다"*다. 그 **반대**는 남는다:
   * `id`가 문자열이 아닌 노드의 규칙과 트리거 4종 **밖**의 규칙은 탭에 문장이 뜨는데 계획에
   * 없다 — 런타임이 그 규칙을 못 돌린다.
   *
   * ## 판정 — 그대로 두고, 범위를 여기에 못박는다
   *
   * 1. **둘 다 저장 게이트를 못 지난다.** `validatePage`가 셋 다 `bad-document`(error)를
   *    낸다 — 아래 케이스가 그것을 잰다. 즉 **저장을 지난 문서에는 이 상태가 없다.**
   * 2. **캔버스도 같다.** 웹은 `DOM_EVENT['hover']`가 `undefined`라 핸들러를 안 달고,
   *    `id`가 없으면 `runInteraction`이 그 노드를 못 찾는다. 즉 *"번들이 캔버스와
   *    갈린다"*가 아니다 — 위 케이스와 갈리는 지점이 여기다.
   * 3. **탭에서 문장을 빼지 않는다.** 설계서는 **작성자가 적은 규칙**을 보여야 하고, 못
   *    도는 규칙일수록 보여야 고칠 수 있다.
   * 4. **런타임이 돌리지도 않는다.** 붙일 DOM 이벤트도 붙일 노드도 없다 — 번들 런타임은 캔버스와 같은 렌더러다.
   *
   * **그래서 남는 것은 문장 하나다: 탭과 계획의 집합 같음은 *"저장을 지날 수 있는 문서"*에 대한
   * 것이다.** 이 케이스가 그 범위를 든다 — 범위가 조용히 넓어지면 여기가 죽는다.
   */
  describe('집합 같음의 범위 — 저장을 지날 수 없는 문서에서는 두 갈래가 갈린다', () => {
    const OUT_OF_DOMAIN: [name: string, page: PageDocument][] = [
      [
        'id가 없는 노드',
        {
          version: 1,
          root: {
            id: 'n_root',
            type: 'Page',
            children: [
              {
                type: 'Button',
                props: { label: '이름없음' },
                interactions: [{ on: 'click', actions: [{ type: 'setProp', target: 'n_list', prop: 'loading', value: true }] }],
              },
              { id: 'n_list', type: 'List', props: {} },
            ],
          },
        } as unknown as PageDocument,
      ],
      [
        '트리거가 4종 밖',
        {
          version: 1,
          root: {
            id: 'n_root',
            type: 'Page',
            children: [
              {
                id: 'n_h',
                type: 'Button',
                props: { label: '호버' },
                interactions: [{ on: 'hover', actions: [{ type: 'setProp', target: 'n_list', prop: 'loading', value: true }] }],
              },
              { id: 'n_list', type: 'List', props: {} },
            ],
          },
        } as unknown as PageDocument,
      ],
    ]

    it.each(OUT_OF_DOMAIN)('%s — 저장 게이트가 막는다', (_name, page) => {
      expect(validatePage(page).map((issue) => issue.code)).toContain('bad-document')
    })

    it.each(OUT_OF_DOMAIN)('%s — 탭에는 문장이 있고 눌리는 규칙은 없다', (_name, page) => {
      expect(firedRules(page)).toEqual([])
      const tree = nodesOnly(page.root)!
      expect(listInteractionSentences({ ...page, root: tree })).toHaveLength(1)
    })

    /** **화면에 `null`이 나가지 않는다.** 속성 값이 없으면 React가 속성 자체를 안 낸다. */
    it.each(OUT_OF_DOMAIN)('%s — 탭 줄이 null을 글자로 내보내지 않는다', (_name, page) => {
      const bundle = exportBundle({ pages: [{ title: '범위 밖', document: page }], runtimeJs: '/* runtime */' })
      const html = bundle.files.find((file) => file.path === 'pages/범위-밖.html')!.content as string
      expect(html).not.toContain('data-wb-interaction-for="null"')
      expect(html).not.toContain('data-wb-interaction-for="undefined"')
    })
  })

  /**
   * **액션이 없는 규칙도 눌린다.** 문장은 *"아무 일도 일어나지 않습니다"*이고, 눌렀을 때
   * 화면도 그렇게 말해야 한다 — 아무 말도 없으면 *"눌렀는데 아무 일도 안 일어난다"*와
   * 구분되지 않는다.
   */
  it('액션이 없는 규칙은 그 사실을 말한다', () => {
    const page = documentWith([{ on: 'click', actions: [] }])
    expect(firedRules(page)).toEqual(['n_btn#0'])
    expect(planMessages(page)).toEqual([EMPTY_RULE])
    expect(listInteractionSentences(page)[0]?.text).toContain('아무 일도 일어나지 않습니다')
  })
})
