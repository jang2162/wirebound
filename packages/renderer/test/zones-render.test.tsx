// @vitest-environment jsdom
/**
 * **구역을 그린다** — 렌더러가 구역마다 그려 `ViewProps.zones` 로, 몸통 자식마다 `items` 로 넘기고, SDK `Zone` 이 `data-wb-zone` 을 펴며 빈 구역은
 * 감싸는 요소째 안 그리는가(설계 spec `2026-10-23-node-slots-design.md` 「4. 테마 뷰 계약」). 기본 뷰 여섯(카드 · 검색폼 · 입력폼 · 목록 · 탭 ·
 * 탭 패널)의 구역 자리를 DOM 으로 잰다.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { installCatalog, type PageDocument, type ViewState, type WbNode } from '@wirebound/schema'
import { view, Root, Zone, type ThemeDefinition, type ViewProps } from '@wirebound/theme-sdk'
import { renderDocument } from '@wirebound/renderer'

beforeAll(() => {
  installCatalog()
})

afterEach(() => {
  cleanup()
})

const ADMIN: ViewState = { id: 's_admin', name: '관리자' }

function draw(node: WbNode, options: Parameters<typeof renderDocument>[1] = {}): Element {
  const doc: PageDocument = { version: 3, root: { id: 'page', type: 'Page', children: [node] }, viewStates: [ADMIN] }
  const { container } = render(<>{renderDocument(doc, options)}</>)
  const el = container.querySelector(`[data-wb-id="${node.id}"]`)
  if (el === null) throw new Error(`${node.id} 가 안 그려졌다`)
  return el
}

const button = (id: string, label: string, extra: Partial<WbNode> = {}): WbNode => ({ id, type: 'Button', props: { label }, ...extra })
const parts = (el: Element) => Array.from(el.children).map((child) => child.getAttribute('data-wb-part'))

describe('카드 — 제목 옆 · 머리 오른쪽 · 몸통 · 바닥', () => {
  const card = (zones: WbNode['zones'], props: Record<string, unknown> = { title: '회원 정보' }): WbNode => ({
    id: 'c',
    type: 'Card',
    props,
    children: [{ id: 'kv', type: 'KeyValue' }],
    zones,
  })

  it('구역마다 `data-wb-zone` 을 단 조각에 그 노드가 선다 — 머리줄 안 제목 옆 · 머리 오른쪽, 몸통 밑 바닥', () => {
    const el = draw(card({ titleSide: [button('t', '필수')], headEnd: [button('e', '수정')], footer: [button('f', '목록')] }))
    expect(parts(el)).toEqual(['header', 'body', 'footer'])
    expect(el.querySelector('[data-wb-part="heading"] > [data-wb-zone="titleSide"] > [data-wb-id="t"]')).not.toBeNull()
    expect(el.querySelector('[data-wb-part="header"] > [data-wb-zone="headEnd"] > [data-wb-id="e"]')).not.toBeNull()
    expect(el.querySelector(':scope > [data-wb-zone="footer"][data-wb-part="footer"] > [data-wb-id="f"]')).not.toBeNull()
    expect(el.querySelector('[data-wb-part="body"] > [data-wb-id="kv"]')).not.toBeNull()
  })

  it('빈 구역은 감싸는 요소째 없다 · 다 비고 제목도 없으면 머리줄째 없다', () => {
    const plain = draw(card(undefined))
    expect(plain.querySelectorAll('[data-wb-zone]')).toHaveLength(0)
    expect(parts(plain)).toEqual(['header', 'body'])
    cleanup()
    expect(parts(draw(card({ footer: [] }, {})))).toEqual(['body'])
    cleanup()
    // 제목 없이 머리 오른쪽만 — 머리줄이 선다.
    expect(parts(draw(card({ headEnd: [button('e', '수정')] }, {})))).toEqual(['header', 'body'])
  })

  it('그 상태에서 다 숨은 구역은 빈 구역이다 — 감싸는 요소째 없다', () => {
    const node = card({ footer: [button('f', '승인', { visibility: { mode: 'only', states: ['s_admin'] } })] })
    expect(draw(node).querySelector('[data-wb-zone="footer"]')).toBeNull()
    cleanup()
    expect(draw(node, { viewState: 's_admin' }).querySelector('[data-wb-zone="footer"] > [data-wb-id="f"]')).not.toBeNull()
  })

  it('겹layer가 숨긴 구역 노드도 빈 구역으로 친다', () => {
    const node = card({ footer: [button('f', '목록')] })
    const el = draw(node, { interaction: { overlay: { f: { visible: false } } } })
    expect(el.querySelector('[data-wb-zone="footer"]')).toBeNull()
  })

  it('카드가 폴백이 돼도 구역 안 노드는 폴백 안에 남는다', () => {
    const el = draw(card({ headEnd: [button('e', '수정')], footer: [button('f', '목록')] }, { title: 3 }))
    expect(el.getAttribute('data-wb-error')).toContain('props가 올바르지 않습니다')
    expect(el.querySelector('[data-wb-id="e"]')).not.toBeNull()
    expect(el.querySelector('[data-wb-id="f"]')).not.toBeNull()
    expect(el.querySelector('[data-wb-id="kv"]')).not.toBeNull()
  })
})

describe('입력폼 · 목록', () => {
  it('검색폼 — 필드 뒤 단추 구역 · 비면 단추줄째 없다 · 접히면 머리줄만(두 구역 다 빠진다)', () => {
    const form = (actions: WbNode[], collapsed = false): WbNode => ({
      id: 'sf',
      type: 'SearchForm',
      props: { collapsed },
      children: [{ id: 'fd', type: 'Field' }],
      zones: { actions },
    })
    const el = draw(form([button('g', '검색')]))
    expect(parts(el)).toEqual(['fields', 'actions'])
    expect(el.querySelector('[data-wb-zone="actions"] [data-wb-id="g"]')).not.toBeNull()
    cleanup()
    expect(parts(draw(form([])))).toEqual(['fields'])
    cleanup()
    const folded = draw(form([button('g', '검색')], true))
    expect(parts(folded)).toEqual(['toggle'])
    expect(folded.querySelector('[data-wb-id="g"]')).toBeNull()
  })

  it('입력폼 — 항목 뒤 단추 구역 · 비면 단추줄째 없다', () => {
    const form = (actions: WbNode[]): WbNode => ({
      id: 'ef',
      type: 'EntryForm',
      props: { title: '등록' },
      children: [{ id: 'fd', type: 'Field' }],
      zones: { actions },
    })
    expect(parts(draw(form([button('s', '저장')])))).toEqual(['label', 'row', 'actions'])
    cleanup()
    expect(parts(draw(form([])))).toEqual(['label', 'row'])
  })

  it('목록 — 머리 왼쪽 · 오른쪽은 표 머리(caption) 안 · 둘 다 비면 줄째 없다 · 몫은 구역에서 안 실린다', () => {
    const list = (zones: WbNode['zones']): WbNode => ({ id: 'l', type: 'List', props: { items: 1 }, zones })
    const el = draw(
      list({
        headStart: [{ id: 'tx', type: 'Text', props: { content: '총 3건' } }],
        headEnd: [button('x', '엑셀다운로드', { weight: 3 })],
      }),
    )
    expect(el.tagName).toBe('TABLE')
    expect(el.querySelector(':scope > caption[data-wb-part="head"] [data-wb-zone="headStart"] > [data-wb-id="tx"]')).not.toBeNull()
    expect(el.querySelector(':scope > caption [data-wb-zone="headEnd"] > [data-wb-id="x"]')).not.toBeNull()
    expect(el.querySelector('[data-wb-id="x"]')!.getAttribute('style')).toBeNull()
    cleanup()
    expect(draw(list(undefined)).querySelector('caption')).toBeNull()
  })
})

describe('탭 — 패널마다 탭 머리 · 지금 패널의 내용', () => {
  const tabs = (active: number, panels: WbNode[]): WbNode => ({ id: 'tb', type: 'Tabs', props: { active }, children: panels })
  const panel = (id: string, label: string, children: WbNode[], extra: Partial<WbNode> = {}): WbNode => ({
    id,
    type: 'TabPanel',
    props: { label },
    children,
    ...extra,
  })
  const three = (active: number, extra: Partial<WbNode> = {}) =>
    tabs(active, [
      panel('p1', '기본정보', [{ id: 'k1', type: 'KeyValue' }]),
      panel('p2', '상세정보', [{ id: 'k2', type: 'List' }], extra),
      panel('p3', '이력', [{ id: 'k3', type: 'Text' }]),
    ])

  it('탭 머리는 패널 노드(그 이름)이고 패널 칸은 active 자리 패널의 내용이다 — 내용은 탭 머리 안이 아니다', () => {
    const el = draw(three(1))
    const heads = Array.from(el.querySelectorAll('[data-wb-part="tab"]'))
    expect(heads.map((head) => head.textContent)).toEqual(['기본정보', '상세정보', '이력'])
    expect(heads.map((head) => head.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
    expect(heads[1]!.querySelector(':scope > [data-wb-id="p2"][data-wb-component="TabPanel"]')).not.toBeNull()
    const panelBox = el.querySelector('[data-wb-part="panel"]')!
    expect(panelBox.querySelector('[data-wb-id="k2"]')).not.toBeNull()
    expect(el.querySelector('[data-wb-id="k1"]')).toBeNull()
    expect(el.querySelector('[data-wb-id="p2"] [data-wb-id="k2"]')).toBeNull()
  })

  it('active 자리의 패널이 숨었거나 없으면 보이는 첫 패널 — active 는 숨은 패널도 센다', () => {
    const hidden = three(1, { visibility: { mode: 'only', states: ['s_admin'] } })
    const el = draw(hidden)
    expect(Array.from(el.querySelectorAll('[data-wb-part="tab"]')).map((head) => head.textContent)).toEqual(['기본정보', '이력'])
    expect(el.querySelector('[data-wb-part="panel"] [data-wb-id="k1"]')).not.toBeNull()
    cleanup()
    // 관리자 화면에서는 둘째 자리(숨지 않음)가 열린다.
    expect(draw(hidden, { viewState: 's_admin' }).querySelector('[data-wb-part="panel"] [data-wb-id="k2"]')).not.toBeNull()
    cleanup()
    expect(draw(three(9)).querySelector('[data-wb-part="panel"] [data-wb-id="k1"]')).not.toBeNull()
  })

  it('패널이 없는 탭 — 머리 · 칸 모두 빈다', () => {
    const el = draw(tabs(0, []))
    expect(el.querySelectorAll('[data-wb-part="tab"]')).toHaveLength(0)
    // 요소만이 아니라 글 노드도 없다 — 빈 패널 칸에 자리표 글이 서지 않는다.
    expect(el.querySelector('[data-wb-part="panel"]')!.childNodes).toHaveLength(0)
  })

  it('탭이 폴백이 돼도 패널의 내용은 폴백 안에 남는다', () => {
    const el = draw({ ...three(0), props: { active: -1 } })
    expect(el.getAttribute('data-wb-error')).not.toBeNull()
    for (const id of ['p1', 'p2', 'p3', 'k1', 'k2', 'k3']) expect(el.querySelector(`[data-wb-id="${id}"]`), id).not.toBeNull()
  })
})

describe('테마 뷰 계약 — zones · items 를 받는다', () => {
  it('구역을 모르는 테마 뷰는 그 내용을 안 그린다 · Zone 을 쓰는 뷰는 그린다', () => {
    const seen: ViewProps[] = []
    const Plain = view((props) => {
      seen.push(props)
      return <Root as="section">{props.children}</Root>
    })
    const WithZone = view((props) => (
      <Root as="section">
        {props.children}
        <Zone name="footer" as="footer" data-wb-part="foot" />
      </Root>
    ))
    const theme = (v: ReturnType<typeof view>): ThemeDefinition => ({
      manifest: { id: 't', name: 't', version: '1.0.0', sdk: '^1.3.0', tokens: { items: {} } },
      views: { Card: v },
    })
    const node: WbNode = { id: 'c', type: 'Card', children: [{ id: 'kv', type: 'KeyValue' }], zones: { footer: [button('f', '목록')] } }
    expect(draw(node, { theme: theme(Plain) }).querySelector('[data-wb-id="f"]')).toBeNull()
    expect(Object.keys(seen[0]!.zones).sort()).toEqual(['footer', 'headEnd', 'titleSide'])
    expect(seen[0]!.zones.headEnd).toBeNull()
    expect(seen[0]!.items.map((item) => [item.nodeId, item.index, item.content])).toEqual([['kv', 0, null]])
    cleanup()
    const el = draw(node, { theme: theme(WithZone) })
    expect(el.querySelector('footer[data-wb-zone="footer"][data-wb-part="foot"] > [data-wb-id="f"]')).not.toBeNull()
  })

  it('Zone 을 view() 밖에서 쓰면 던진다', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Zone name="footer" />)).toThrow('Zone 은 view() 로 만든 뷰 안에서만')
  })
})
