// @vitest-environment jsdom
/**
 * **번들을 열어 실제로 누른다**(T3·T4·T5 · D4·D5·D6·D7).
 *
 * 여기가 이 슬라이스의 가장 중요한 자다. `runtime/plan.ts`와 `runtime/browser.ts`는 서로를
 * import하지 않고 **셸의 클래스 이름·데이터 id·상태 열쇠를 각자 글자로 든다**(브라우저로
 * 나가는 함수가 클로저를 못 들기 때문이다 — `browser.ts`의 머리말). 그 글자들이 갈리면
 * **여기서 죽는다.**
 *
 * **누른 뒤의 화면을 렌더러의 답과 견준다.** *"상호작용이 동작한다"*(§11.3)가 뜻하는 것이
 * 그것이다 — 눌러서 무언가 바뀌는 것이 아니라 **웹 앱에서 눌렀을 때와 같은 화면**이 되는 것.
 *
 * jsdom은 자리를 재지 않는다(`getBoundingClientRect`가 전부 0이다). 그래서 **마커가 몇 개
 * 어느 노드에 붙었는지**는 여기서 재고, **자리**는 실브라우저 프로브가 잰다(보고서 §T4).
 */
import { installStructures, renderDocument, type InteractionOverlay } from '@wirebound/renderer'
import { installCatalog, type Interaction, type PageDocument, type WbNode } from '@wirebound/schema'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { exportBundle } from '../src/bundle/index'
import { RUNTIME_JS } from '../src/runtime/plan'

beforeAll(() => {
  installCatalog()
  installStructures()
})

const CLICK: Interaction[] = [
  {
    on: 'click',
    actions: [
      { type: 'setProp', target: 'n_list', prop: 'loading', value: true },
      { type: 'switchTab', target: 'n_tabs', tab: 1 },
      { type: 'setVisible', target: 'n_card', value: false },
    ],
  },
]

const LIST_PAGE: PageDocument = {
  version: 1,
  root: {
    id: 'n_root',
    type: 'Page',
    children: [
      { id: 'n_btn', type: 'Button', props: { label: '검색' }, interactions: CLICK },
      {
        id: 'n_go',
        type: 'Button',
        props: { label: '상세' },
        interactions: [{ on: 'click', actions: [{ type: 'navigate', target: 'page:회원/상세' }] }],
      },
      {
        id: 'n_nowhere',
        type: 'Button',
        props: { label: '없는 곳' },
        interactions: [{ on: 'click', actions: [{ type: 'navigate', target: 'page:없음' }] }],
      },
      {
        id: 'n_broken',
        type: 'Button',
        props: { label: '깨짐' },
        interactions: [
          { on: 'click', actions: [{ type: 'setProp', target: 'n_사라짐', prop: 'loading', value: true }] },
        ],
      },
      {
        id: 'n_empty',
        type: 'Button',
        props: { label: '빈 규칙' },
        interactions: [{ on: 'click', actions: [] }],
      },
      {
        id: 'n_show',
        type: 'Button',
        props: { label: '되돌림' },
        interactions: [
          { on: 'click', actions: [{ type: 'setVisible', target: 'n_card', value: true }] },
        ],
      },
      {
        id: 'n_submit',
        type: 'Button',
        props: { label: '보냄' },
        interactions: [
          { on: 'submit', actions: [{ type: 'setProp', target: 'n_list', prop: 'empty', value: true }] },
        ],
      },
      // **중첩**. 속을 누르면 겉까지 버블링하고, 바른 판도 겉→속 순서여야 한다.
      {
        id: 'n_outer',
        type: 'Card',
        props: { title: '겉' },
        interactions: [
          { on: 'click', actions: [{ type: 'setProp', target: 'n_outer', prop: 'subtitle', value: '겉눌림' }] },
        ],
        children: [
          {
            id: 'n_inner',
            type: 'Button',
            props: { label: '속' },
            interactions: [
              { on: 'click', actions: [{ type: 'setProp', target: 'n_inner', prop: 'label', value: '속눌림' }] },
            ],
          },
        ],
      },
      { id: 'n_list', type: 'List', props: {}, marker: 2 },
      { id: 'n_tabs', type: 'Tabs', props: { tabs: ['기본정보', '상세정보'], active: 0 } },
      { id: 'n_card', type: 'Card', props: { title: '회원' }, marker: 3 },
      // **번호의 기준을 재는 자리**(D4 · 사실 5). 캔버스는 `Number.isInteger`라 0·음수도
      // 그리는데, 번들의 코멘트 줄은 문장화 쪽(1 이상)을 따랐다. 겹layer가 어느 쪽을
      // 따르는지를 이 셋이 가른다.
      { id: 'n_zero', type: 'Text', props: { content: '영' }, marker: 0 },
      { id: 'n_neg', type: 'Text', props: { content: '음' }, marker: -1 },
      { id: 'n_frac', type: 'Text', props: { content: '분수' }, marker: 1.5 },
      // 번호가 없는데 코멘트만 달린 노드. 코멘트 줄은 생기고 **번호는 안 실린다.**
      { id: 'n_plain', type: 'Text', props: { content: '번호 없음' } },
    ],
  } as WbNode,
}

const DETAIL_PAGE: PageDocument = {
  version: 1,
  root: { id: 'n_detail', type: 'Page', children: [{ id: 'n_txt', type: 'Text', props: { content: '상세' } }] },
}

function bundle() {
  return exportBundle({
    pages: [
      {
        title: '회원 목록',
        document: LIST_PAGE,
        target: 'page:회원/목록',
        comments: [
          { nodeId: 'n_plain', body: '번호 없는 코멘트' },
          { nodeId: 'n_list', body: '첫째' },
          { nodeId: 'n_list', body: '둘째' },
        ],
      },
      { title: '회원 상세', document: DETAIL_PAGE, target: 'page:회원/상세' },
    ],
  })
}

function fileAt(path: string): string {
  const found = bundle().files.find((file) => file.path === path)
  if (found === undefined) throw new Error(`번들에 없는 경로: ${path}`)
  return found.content
}

/**
 * 번들의 한 장을 이 문서에 올린다. **`<script>`는 돌지 않는다** — `innerHTML`로 넣은
 * 스크립트를 브라우저가 실행하지 않기 때문이고, 그래서 *"런타임 없는 판"*을 그대로 잰다.
 */
function load(path: string): void {
  const parsed = new DOMParser().parseFromString(fileAt(path), 'text/html')
  document.head.innerHTML = parsed.head.innerHTML
  document.body.innerHTML = parsed.body.innerHTML
}

/** `assets/runtime.js`를 이 문서에서 돌린다. 브라우저가 그 파일을 부를 때와 같다. */
function run(): void {
  new Function(fileAt('assets/runtime.js'))()
}

function canvas(): Element {
  const found = document.querySelector('.wb-export-canvas')
  if (found === null) throw new Error('캔버스가 없습니다')
  return found
}

function press(nodeId: string, type = 'click'): void {
  const target = canvas().querySelector(`[data-wb-id="${nodeId}"]`)
  if (target === null) throw new Error(`누를 노드가 없습니다: ${nodeId}`)
  target.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))
}

function statusLines(): string[] {
  const box = document.querySelector('.wb-export-status')
  if (box === null || box.hasAttribute('hidden')) return []
  return [...box.querySelectorAll('.wb-export-status-line')].map((line) => line.textContent ?? '')
}

/** 겹layer가 얹힌 문서를 **렌더러가** 그린 것. jsdom을 지나게 해 직렬화를 맞춘다. */
function expected(overlay: InteractionOverlay): string {
  const html = renderToStaticMarkup(renderDocument(LIST_PAGE, { interaction: { overlay } }))
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  return parsed.body.innerHTML
}

/** 지금 캔버스에 그려진 문서. 겹layer(마커)는 셸의 것이라 뺀다. */
function drawn(): string {
  const copy = canvas().cloneNode(true) as Element
  copy.querySelector('.wb-export-markers')?.remove()
  return copy.innerHTML
}

beforeEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

/* ------------------------------------------------- D5: 스크립트가 없어도 산다 */

describe('스크립트가 없어도 번들이 쓸모 있다 (D5)', () => {
  it('런타임을 안 돌려도 3분할·탭·트리·코멘트가 그대로 있다', () => {
    load('pages/회원-목록.html')
    expect(document.querySelectorAll('.wb-export-nav-link')).toHaveLength(2)
    expect(document.querySelectorAll('.wb-export-tab')).toHaveLength(3)
    expect(document.querySelectorAll('.wb-export-tab-radio')).toHaveLength(3)
    expect(document.querySelector('.wb-export-canvas [data-wb-id]')).not.toBeNull()
    expect(
      document.querySelectorAll('#wb-export-panel-comments [data-wb-marker-for]').length,
    ).toBeGreaterThan(0)
  })

  /**
   * **런타임이 셸을 한 글자도 안 바꾼다.** 넣은 판과 뺀 판을 견주는 방식이 이것이다 —
   * 같은 파일을 런타임 전후로 재면 *"런타임이 더하는 것은 상호작용과 겹layer뿐"*이 참인지
   * 그 자리에서 보인다.
   */
  it('런타임을 돌려도 좌측 트리와 우측 탭이 그대로다', () => {
    load('pages/회원-목록.html')
    const before = [
      document.querySelector('.wb-export-nav')?.outerHTML,
      document.querySelector('.wb-export-panel')?.outerHTML,
    ]
    run()
    expect([
      document.querySelector('.wb-export-nav')?.outerHTML,
      document.querySelector('.wb-export-panel')?.outerHTML,
    ]).toEqual(before)
  })

  it('런타임을 돌려도 누르기 전의 문서가 그대로다', () => {
    load('pages/회원-목록.html')
    const before = drawn()
    run()
    expect(drawn()).toBe(before)
  })

  /** 탭을 다시 만들지 않는다(사실 6). 런타임이 탭 라디오에 손을 대면 자리가 둘이 된다. */
  it('런타임이 탭 라디오를 건드리지 않는다', () => {
    load('pages/회원-목록.html')
    run()
    expect(
      [...document.querySelectorAll('.wb-export-tab-radio')].map((radio) =>
        (radio as HTMLInputElement).checked,
      ),
    ).toEqual([true, false, false])
  })
})

/* ------------------------------------------------------- 눌러서 동작한다 */

describe('누르면 웹 앱에서 누른 것과 같은 화면이 된다 (§11.3)', () => {
  it('setProp·switchTab·setVisible이 한 번에 반영된다', () => {
    load('pages/회원-목록.html')
    run()
    press('n_btn')
    expect(drawn()).toBe(
      expected({ n_list: { loading: true }, n_tabs: { active: 1 }, n_card: { visible: false } }),
    )
  })

  it('누르기 전과 후가 다르다 — 카나리아', () => {
    load('pages/회원-목록.html')
    run()
    const before = drawn()
    press('n_btn')
    expect(drawn()).not.toBe(before)
  })

  /**
   * **다시 보이게 하면 되돌아온다.** 겹layer는 문서를 안 바꾸므로 *"원래 화면"*이 늘 남아
   * 있고, 바를 때마다 거기서 다시 시작한다. 지운 것을 기억했다 되돌리는 길을 고르면
   * *"무엇을 되돌려야 하는가"*가 상태가 되고, 그 상태가 틀리면 화면이 조용히 어긋난다.
   */
  it('숨긴 노드를 다시 보이게 하면 돌아온다', () => {
    load('pages/회원-목록.html')
    run()
    press('n_btn')
    expect(canvas().querySelector('[data-wb-id="n_card"]')).toBeNull()
    press('n_show')
    expect(canvas().querySelector('[data-wb-id="n_card"]')).not.toBeNull()
    expect(drawn()).toBe(expected({ n_list: { loading: true }, n_tabs: { active: 1 } }))
  })

  it('setVisible이 노드를 DOM에서 뺀다 — 감추는 것이 아니다', () => {
    load('pages/회원-목록.html')
    run()
    press('n_btn')
    expect(canvas().querySelector('[data-wb-id="n_card"]')).toBeNull()
  })

  it('switchTab이 활성 탭을 옮긴다', () => {
    load('pages/회원-목록.html')
    run()
    press('n_btn')
    const tabs = canvas().querySelectorAll('[data-wb-id="n_tabs"] [data-wb-part="tab"]')
    expect([...tabs].map((tab) => tab.getAttribute('aria-selected'))).toEqual(['false', 'true'])
  })

  /** 겹layer는 쌓인다 — 모드를 나가는 것이 리셋이고 번들에는 나갈 모드가 없다. */
  it('두 번 눌러도 같은 상태다', () => {
    load('pages/회원-목록.html')
    run()
    press('n_btn')
    const once = drawn()
    press('n_btn')
    expect(drawn()).toBe(once)
  })

  /**
   * **속을 누르면 겉의 규칙도 돈다.** 웹 앱에서는 핸들러가 노드마다 붙어 버블링이 그 순서를
   * 만든다. 번들은 위임으로 받으므로 **바깥으로 올라가며 다 모아야** 같은 화면이 된다 —
   * 안쪽 하나만 반응하면 *"겉의 규칙은 왜 안 되지"*가 된다.
   */
  it('중첩된 규칙이 안에서 밖으로 다 돈다', () => {
    load('pages/회원-목록.html')
    run()
    press('n_inner')
    expect(drawn()).toBe(expected({ n_inner: { label: '속눌림' }, n_outer: { subtitle: '겉눌림' } }))
  })

  /**
   * **바깥부터 발라야 안쪽 판이 살아남는다.** 겉의 판은 *"겉만 덮은"* 상태로 그려져 있어
   * 그 안에 속의 원래 모습이 들어 있다 — 속을 먼저 바르면 겉이 그것을 덮어 쓴다.
   */
  it('겉을 먼저 바르고 속을 나중에 바른다', () => {
    load('pages/회원-목록.html')
    run()
    press('n_inner')
    expect(canvas().querySelector('[data-wb-id="n_inner"]')?.textContent).toBe('속눌림')
    expect(
      canvas().querySelector('[data-wb-id="n_outer"] [data-wb-part="subtitle"]')?.textContent,
    ).toBe('겉눌림')
  })

  /**
   * **폼 제출이 페이지를 떠나면 겹layer가 통째로 사라진다.** 와이어프레임에는 제출을 보낼
   * 곳이 없으므로 막는다 — 웹 앱의 런타임이 같은 자리에서 같은 것을 한다.
   *
   * jsdom은 제출이 이동을 만들지 않으므로 **`defaultPrevented`로 잰다**(`renderer` 쪽
   * 케이스도 같은 한계를 적어 두었다). 실제 이동은 실브라우저 프로브가 봤다.
   */
  it('submit 규칙은 기본 동작을 막는다', () => {
    load('pages/회원-목록.html')
    run()
    const target = canvas().querySelector('[data-wb-id="n_submit"]')!
    const event = new Event('submit', { bubbles: true, cancelable: true })
    target.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(canvas().querySelector('[data-wb-id="n_list"]')?.getAttribute('data-wb-state')).toBe(
      'empty',
    )
  })

  it('규칙이 없는 노드의 제출은 막지 않는다', () => {
    load('pages/회원-목록.html')
    run()
    const event = new Event('submit', { bubbles: true, cancelable: true })
    canvas().querySelector('[data-wb-id="n_list"]')!.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })

  it('규칙이 없는 노드를 눌러도 아무 일도 없다', () => {
    load('pages/회원-목록.html')
    run()
    const before = drawn()
    press('n_list')
    expect(drawn()).toBe(before)
    expect(statusLines()).toEqual([])
  })
})

/* ------------------------------------------------ 못 한 것을 말한다 (D1·D6) */

describe('못 한 것을 조용히 넘기지 않는다 (D1·D6)', () => {
  it('깨진 규칙의 문장을 띄운다 — schema의 검증기가 만든 문장이다', () => {
    load('pages/회원-목록.html')
    run()
    press('n_broken')
    expect(statusLines()).toEqual(['setProp의 타겟 노드가 문서에 없습니다: n_사라짐'])
  })

  it('가리키는 페이지가 번들에 없으면 그렇다고 말한다', () => {
    load('pages/회원-목록.html')
    run()
    press('n_nowhere')
    expect(statusLines()).toEqual(['이 번들에 없는 페이지입니다: page:없음'])
  })

  /**
   * **액션이 없는 규칙도 말한다.** 문장화는 *"아무 일도 일어나지 않습니다"*라고 적는데
   * 화면이 아무 말도 안 하면 *"눌렀는데 아무 일도 안 일어난다"*와 구분되지 않는다 —
   * 이 저장소가 여섯 번 만난 부류다.
   */
  it('액션이 없는 규칙을 누르면 그 사실을 말한다', () => {
    load('pages/회원-목록.html')
    run()
    press('n_empty')
    expect(statusLines()).toEqual(['이 규칙에는 실행할 액션이 없습니다'])
  })

  /**
   * **미리 그린 판을 못 찾으면 그렇다고 말한다.**
   *
   * 이 상태는 정상 경로로는 안 생긴다 — 계획이 닿을 수 있는 판을 전부 담기 때문이다.
   * 그래서 데이터를 손으로 지워 만든다. **막으려는 것은 두 `stateKey`가 갈리는 날이다**:
   * 그때 눌러도 화면이 안 바뀌는데, 말이 없으면 *"규칙이 원래 그런가"*와 구분되지 않는다.
   */
  it('미리 그린 판이 없으면 그렇다고 말한다', () => {
    load('pages/회원-목록.html')
    const data = document.getElementById('wb-export-runtime-data')!
    const plan = JSON.parse(data.textContent ?? '') as { variants: Record<string, unknown> }
    expect(Object.keys(plan.variants)).toContain('n_list')
    delete plan.variants['n_list']
    data.textContent = JSON.stringify(plan)
    run()
    press('n_btn')
    expect(statusLines()).toEqual(['이 상태의 화면이 번들에 없습니다: n_list'])
  })

  /** **링크가 있으면 그리로 간다**(D6). 실제 이동은 실브라우저 프로브도 봤다. */
  it('페이지가 번들에 있으면 그 파일로 옮긴다', () => {
    load('pages/회원-목록.html')
    const moves: string[] = []
    Object.defineProperty(window, 'location', {
      value: {
        get href() {
          return ''
        },
        set href(value: string) {
          moves.push(value)
        },
      },
      writable: true,
      configurable: true,
    })
    run()
    press('n_go')
    expect(moves).toEqual(['%ED%9A%8C%EC%9B%90-%EC%83%81%EC%84%B8.html'])
    expect(statusLines()).toEqual([])
  })

  it('말할 것이 없으면 줄을 감춘다', () => {
    load('pages/회원-목록.html')
    run()
    press('n_broken')
    expect(statusLines()).toHaveLength(1)
    press('n_btn')
    expect(document.querySelector('.wb-export-status')?.hasAttribute('hidden')).toBe(true)
  })
})

/* ------------------------------------------------------------ 겹layer (D4) */

describe('번호 마커 겹layer (D4)', () => {
  function markers(): [string, string][] {
    return [...document.querySelectorAll('.wb-export-marker')].map((badge) => [
      badge.getAttribute('data-wb-marker-for') ?? '',
      badge.textContent ?? '',
    ])
  }

  /** 코멘트 탭의 줄에서 번호를 든 것만. **노드마다 한 번씩** 센다. */
  function numbered(): [string, string][] {
    const seen = new Set<string>()
    const out: [string, string][] = []
    for (const line of document.querySelectorAll(
      '#wb-export-panel-comments [data-wb-marker-for][data-wb-marker]',
    )) {
      const nodeId = line.getAttribute('data-wb-marker-for') ?? ''
      if (seen.has(nodeId)) continue
      seen.add(nodeId)
      out.push([nodeId, line.getAttribute('data-wb-marker') ?? ''])
    }
    return out
  }

  it('코멘트 탭의 줄과 같은 노드·같은 번호를 그린다', () => {
    load('pages/회원-목록.html')
    run()
    expect(markers()).toEqual(numbered())
    // **하나짜리로 재지 않는다** — 마커가 하나면 자리가 섞여도 안 죽는다.
    expect(markers().length).toBeGreaterThan(1)
  })

  /**
   * **한 노드에 코멘트가 여럿이면 줄은 여럿이고 마커는 하나다.** 겹layer는 *"이 노드에
   * 번호가 있다"*를 그리는 것이지 코멘트를 세는 것이 아니다 — 겹쳐 찍으면 같은 자리에
   * 같은 숫자가 포개져 읽는 사람이 그것을 다른 무엇으로 읽는다.
   */
  it('같은 노드의 코멘트가 둘이어도 마커는 하나다', () => {
    load('pages/회원-목록.html')
    run()
    const lines = [
      ...document.querySelectorAll('#wb-export-panel-comments [data-wb-marker-for="n_list"]'),
    ]
    expect(lines.length).toBe(2)
    expect(markers().filter(([nodeId]) => nodeId === 'n_list')).toHaveLength(1)
  })

  /**
   * **번호가 없는 코멘트에는 마커가 없다**(D4 · 사실 5). 그 줄에는 `data-wb-marker`가 아예
   * 없다 — 겹layer가 줄만 보고 그리면 **숫자 없는 배지**가 생겨 화면이 거짓말을 한다.
   */
  it('번호 없는 코멘트 줄에는 마커를 안 그린다', () => {
    load('pages/회원-목록.html')
    run()
    const line = document.querySelector('[data-wb-marker-for="n_plain"]')
    expect(line).not.toBeNull()
    expect(line?.hasAttribute('data-wb-marker')).toBe(false)
    expect(markers().map(([nodeId]) => nodeId)).not.toContain('n_plain')
  })

  /**
   * **캔버스의 기준을 옮기지 않는다**(D4 · 사실 5). 캔버스는 `Number.isInteger`라 0·음수도
   * 그리는데 번들의 코멘트 줄은 1 이상만 번호로 본다. 겹layer가 캔버스 쪽을 따르면 **같은
   * 번들 안에서 두 줄이 갈린다.**
   */
  it('0·음수·비정수 번호는 그리지 않는다', () => {
    load('pages/회원-목록.html')
    run()
    expect(markers().map(([nodeId]) => nodeId).sort()).toEqual(['n_card', 'n_list'])
  })

  it('숨겨진 노드의 마커는 사라진다', () => {
    load('pages/회원-목록.html')
    run()
    expect(markers().map(([nodeId]) => nodeId)).toContain('n_card')
    press('n_btn')
    expect(markers().map(([nodeId]) => nodeId)).not.toContain('n_card')
  })

  it('겹layer가 문서 안이 아니라 옆에 있다', () => {
    load('pages/회원-목록.html')
    run()
    const layer = document.querySelector('.wb-export-markers')
    expect(layer?.parentElement?.className).toBe('wb-export-canvas')
    expect(canvas().querySelector('[data-wb-id] .wb-export-marker')).toBeNull()
  })
})

/* ------------------------------------------------------- 다른 페이지도 산다 */

describe('자리마다 제 것이 실렸는가', () => {
  /** 페이지가 여럿이면 계획도 여럿이다. 한 페이지의 계획이 다른 페이지에 실리면 안 된다. */
  it('페이지마다 자기 문서의 계획을 든다', () => {
    const plans = bundle()
      .files.filter((file) => file.path.endsWith('.html'))
      .map((file) => {
        const parsed = new DOMParser().parseFromString(file.content, 'text/html')
        const data = parsed.getElementById('wb-export-runtime-data')
        return [file.path, (JSON.parse(data?.textContent ?? '{}') as { events: { nodeId: string }[] }).events.map((event) => event.nodeId)]
      })
    expect(plans).toEqual([
      [
        'index.html',
        ['n_btn', 'n_go', 'n_nowhere', 'n_broken', 'n_empty', 'n_show', 'n_submit', 'n_outer', 'n_inner'],
      ],
      [
        'pages/회원-목록.html',
        ['n_btn', 'n_go', 'n_nowhere', 'n_broken', 'n_empty', 'n_show', 'n_submit', 'n_outer', 'n_inner'],
      ],
      ['pages/회원-상세.html', []],
    ])
  })

  /** 링크는 **그 파일이 사는 자리**에서 계산된다. `index.html`과 `pages/…`가 다르다. */
  it('페이지 링크가 자리마다 다르게 실린다', () => {
    const hrefs = bundle()
      .files.filter((file) => file.path.endsWith('.html'))
      .map((file) => {
        const parsed = new DOMParser().parseFromString(file.content, 'text/html')
        const data = parsed.getElementById('wb-export-runtime-data')
        const plan = JSON.parse(data?.textContent ?? '{}') as {
          events: { requests: { href: string | null }[] }[]
        }
        return [file.path, plan.events.flatMap((event) => event.requests.map((request) => request.href))]
      })
    expect(hrefs).toEqual([
      ['index.html', ['pages/%ED%9A%8C%EC%9B%90-%EC%83%81%EC%84%B8.html', null]],
      ['pages/회원-목록.html', ['%ED%9A%8C%EC%9B%90-%EC%83%81%EC%84%B8.html', null]],
      ['pages/회원-상세.html', []],
    ])
  })

  it('상호작용이 없는 페이지에서도 런타임이 조용히 선다', () => {
    load('pages/회원-상세.html')
    run()
    expect(statusLines()).toEqual([])
    expect(document.querySelectorAll('.wb-export-marker')).toHaveLength(0)
  })
})

/** `assets/runtime.js`가 실제로 그 파일 하나로 완결인지. */
describe('assets/runtime.js', () => {
  it('번들의 그 파일을 돌린 것만으로 동작한다', () => {
    expect(fileAt('assets/runtime.js')).toBe(RUNTIME_JS)
    load('pages/회원-목록.html')
    run()
    press('n_btn')
    expect(canvas().querySelector('[data-wb-id="n_card"]')).toBeNull()
  })
})
