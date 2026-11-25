// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  buildLayoutNav,
  COMPONENT_GROUPS,
  getComponent,
  installCatalog,
  pageTargetKey,
  validatePage,
  walkNodes,
  type PageDocument,
  type WbNode,
} from '@wirebound/schema'
import { defineTheme, LayoutLink, LayoutRegion, type LayoutNavItem, type LayoutView } from '@wirebound/theme-sdk'
import { EXAMPLE_MENU, EXAMPLE_PAGES, EXAMPLE_POPUP_ID, EXAMPLE_POPUPS, ThemeExamples, type ExamplePageId } from '@wirebound/theme-gallery'

beforeAll(() => installCatalog())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const theme = defineTheme({ manifest: { id: 't', name: 't', version: '1.0.0', sdk: '^1.0.0', tokens: { items: {} } }, views: {} })
const docs = (): PageDocument[] => [...EXAMPLE_PAGES.map((p) => p.document), ...EXAMPLE_POPUPS.map((p) => p.document)]
const nodesOf = (doc: PageDocument): WbNode[] => [...walkNodes(doc.root)].map((entry) => entry.node)
const errors = (issues: { severity: string }[]) => issues.filter((issue) => issue.severity === 'error')

/** 문서 안의 페이지 이음 — `[노드 id, 액션 종류, 타겟]`. */
function links(doc: PageDocument): [string, string, string][] {
  const out: [string, string, string][] = []
  for (const node of nodesOf(doc))
    for (const interaction of node.interactions ?? [])
      for (const action of interaction.actions)
        if ('target' in action && (action.type === 'navigate' || action.type === 'openModal'))
          out.push([node.id, action.type, action.target])
  return out
}
const pageOf = (target: string) => EXAMPLE_PAGES.find((p) => pageTargetKey(p.target) === pageTargetKey(target))?.id
const actionsOf = (doc: PageDocument, id: string) =>
  nodesOf(doc)
    .find((n) => n.id === id)
    ?.interactions?.flatMap((i) => i.actions) ?? []
const docOf = (id: ExamplePageId) => EXAMPLE_PAGES.find((p) => p.id === id)!.document
const popup = EXAMPLE_POPUPS[0]!.document

function Harness(props: { start: ExamplePageId; onChange: (page: ExamplePageId) => void; follow?: boolean }) {
  return <ThemeExamples theme={theme} tokens={{}} page={props.start} onPageChange={props.onChange} />
}
const click = (container: HTMLElement, id: string) => {
  const el = container.querySelector(`[data-wb-id="${id}"]`)
  if (el === null) throw new Error(`노드 ${id} 가 화면에 없다`)
  fireEvent.click(el)
}
const popupsIn = (container: HTMLElement) => container.querySelectorAll('[data-wb-popup-frame]').length

describe('예제 문서', () => {
  it('문서가 검증을 지나고 장마다 같은 틀(왼쪽 메뉴)을 든다', () => {
    for (const page of EXAMPLE_PAGES)
      expect(
        nodesOf(page.document).filter((n) => n.id === 'ex-l-shell'),
        page.id,
      ).toHaveLength(1)
    for (const page of EXAMPLE_PAGES) expect(errors(validatePage(page.document)), page.id).toEqual([])
    for (const one of EXAMPLE_POPUPS) {
      expect(errors(validatePage(one.document)), one.target).toEqual([])
      expect(one.document.root.type).toBe('Popup')
    }
  })
  it('장은 넷 · 차례와 제목이 계약대로다', () => {
    expect(EXAMPLE_PAGES.map((p) => [p.id, p.title])).toEqual([
      ['dashboard', '대시보드'],
      ['orders', '주문 목록'],
      ['order', '주문 상세'],
      ['order-form', '주문 등록'],
    ])
    expect(EXAMPLE_POPUPS.map((p) => (p.document.root.props as { title?: string }).title)).toEqual(['주문 삭제'])
  })
  it('노드 id 가 문서 안에서 겹치지 않고, 틀(ex-l-) 밖의 id 는 문서들 사이에도 겹치지 않는다', () => {
    for (const doc of docs()) {
      const own = nodesOf(doc).map((n) => n.id)
      expect(new Set(own).size, doc.root.id).toBe(own.length)
    }
    const ids = docs()
      .flatMap((doc) => nodesOf(doc).map((n) => n.id))
      .filter((id) => !id.startsWith('ex-l-'))
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('다섯 그룹이 다 실린다', () => {
    const groups = new Set(docs().flatMap((doc) => nodesOf(doc).map((n) => getComponent(n.type)!.group)))
    expect([...groups].sort()).toEqual([...COMPONENT_GROUPS].sort())
  })
  it('이음이 다 닿는다 — 죽은 이음 0', () => {
    const all = docs().flatMap(links)
    expect(all.length).toBeGreaterThan(5)
    const targets = [...EXAMPLE_PAGES, ...EXAMPLE_POPUPS].map((p) => pageTargetKey(p.target))
    for (const [node, , target] of all) expect(targets, `${node} → ${target}`).toContain(pageTargetKey(target))
  })
  it('설계의 이음 여섯이 있다', () => {
    const orders = docOf('orders')
    // 목록 줄(주문번호) → 상세
    const rowLinks = links(orders).filter(([id]) => /-r\d+-no-l$/.test(id))
    expect(rowLinks.length).toBeGreaterThan(0)
    expect(rowLinks.every(([, type, target]) => type === 'navigate' && pageOf(target) === 'order')).toBe(true)
    const order = docOf('order')
    const navTo = (doc: PageDocument, id: string) => actionsOf(doc, id).flatMap((a) => (a.type === 'navigate' ? [pageOf(a.target)] : []))
    // 상세 «수정» → 등록 · «삭제» → 팝업
    expect(navTo(order, 'ex-od-edit')).toEqual(['order-form'])
    expect(actionsOf(order, 'ex-od-del')).toEqual([{ type: 'openModal', target: EXAMPLE_POPUPS[0]!.target }])
    // 등록 «저장» · «취소» → 목록
    expect(navTo(docOf('order-form'), 'ex-of-save')).toEqual(['orders'])
    expect(navTo(docOf('order-form'), 'ex-of-cancel')).toEqual(['orders'])
    // 팝업 «삭제» → 닫고 목록 · «취소» → 닫힘
    expect(actionsOf(popup, 'ex-pd-ok').map((a) => a.type)).toEqual(['closeModal', 'navigate'])
    expect(navTo(popup, 'ex-pd-ok')).toEqual(['orders'])
    expect(actionsOf(popup, 'ex-pd-cancel')).toEqual([{ type: 'closeModal' }])
    // 왼쪽 메뉴 → 대시보드 · 목록 · 등록
    expect(['ex-l-go-dash', 'ex-l-go-orders', 'ex-l-go-new'].flatMap((id) => navTo(docOf('dashboard'), id))).toEqual([
      'dashboard',
      'orders',
      'order-form',
    ])
  })
})

describe('ThemeExamples', () => {
  it('누르면 장이 바뀐다 — 목록의 첫 줄 → 상세', () => {
    const onChange = vi.fn()
    const { container } = render(<Harness start="orders" onChange={onChange} />)
    const first = links(docOf('orders')).find(([id]) => id.endsWith('-r0-no-l'))![0]
    click(container, first)
    expect(onChange.mock.calls).toEqual([['order']])
  })
  it('상세 «삭제» 는 팝업을 열고 «취소» 는 닫는다', () => {
    const onChange = vi.fn()
    const { container } = render(<Harness start="order" onChange={onChange} />)
    click(container, 'ex-od-del')
    expect(popupsIn(container)).toBe(1)
    click(container, 'ex-pd-cancel')
    expect(popupsIn(container)).toBe(0)
    expect(onChange).not.toHaveBeenCalled()
  })
  it('팝업 «삭제» 는 목록으로 가고 팝업을 걷는다', () => {
    const onChange = vi.fn()
    const { container } = render(<Harness start="order" onChange={onChange} />)
    click(container, 'ex-od-del')
    expect(popupsIn(container)).toBe(1)
    click(container, 'ex-pd-ok')
    expect(onChange.mock.calls).toEqual([['orders']])
    expect(popupsIn(container)).toBe(0)
  })
  it('바깥 기록이 그대로다 — 왼쪽 메뉴 링크를 눌러도', () => {
    const onChange = vi.fn()
    const { container } = render(<Harness start="order-form" onChange={onChange} />)
    const length = window.history.length
    const hash = window.location.hash
    const prevented: boolean[] = []
    const watch = (event: Event) => prevented.push(event.defaultPrevented)
    window.addEventListener('click', watch)
    try {
      for (const id of ['ex-l-go-dash', 'ex-l-go-orders', 'ex-l-go-dash']) click(container, id)
    } finally {
      window.removeEventListener('click', watch)
    }
    expect(prevented).toEqual([true, true, true])
    expect(window.history.length).toBe(length)
    expect(window.location.hash).toBe(hash)
    expect(onChange.mock.calls).toEqual([['dashboard'], ['orders'], ['dashboard']])
  })
  it('장이 바뀌면 팝업을 비운다', () => {
    const { container, rerender } = render(<Harness start="order" onChange={() => {}} />)
    click(container, 'ex-od-del')
    expect(popupsIn(container)).toBe(1)
    act(() => rerender(<Harness start="dashboard" onChange={() => {}} />))
    expect(popupsIn(container)).toBe(0)
    expect(container.querySelector('[data-wb-examples]')!.getAttribute('data-wb-examples')).toBe('dashboard')
  })
  it('틀과 장을 한 화면에 그린다 — 틀의 가운데 칸에 장 내용', () => {
    const { container } = render(<Harness start="orders" onChange={() => {}} />)
    const main = container.querySelector('[data-wb-id="ex-o"] [data-wb-id="ex-l-main"]')!
    expect(main.querySelector('[data-wb-id^="ex-o-"]')).not.toBeNull()
    expect(container.querySelector('[data-wb-error]')).toBeNull()
  })
})

/**
 * **서브페이지 틀** — 장은 서브페이지 레이아웃이고 `EXAMPLE_MENU` 로 지은 내비와 함께 `LayoutFrame` 에 감긴다. 레이아웃 뷰를 낸 테마의 틀 링크가
 * 장을 바꾸고, 끈 영역은 안 선다.
 */
describe('ThemeExamples — 서브페이지 틀', () => {
  const flat = (items: readonly LayoutNavItem[]): LayoutNavItem[] => items.flatMap((item) => [item, ...flat(item.children)])
  const Subpage: LayoutView = (props) => (
    <div>
      <LayoutRegion id="gnb" as="nav">
        {flat(props.gnb).map((item) => (
          <LayoutLink key={item.id} item={item} data-nav={item.id} />
        ))}
      </LayoutRegion>
      <LayoutRegion id="title" as="h1">
        {props.title}
      </LayoutRegion>
      {props.children}
    </div>
  )
  const framed = defineTheme({
    manifest: {
      id: 't',
      name: 't',
      version: '1.0.0',
      sdk: '^1.10.0',
      tokens: { items: {} },
      layouts: {
        subpage: {
          regions: [
            { id: 'gnb', label: 'GNB' },
            { id: 'title', label: '제목' },
          ],
        },
      },
    },
    views: {},
    layouts: { subpage: Subpage },
  })

  it('예제 메뉴 트리가 장 넷을 다 들고 팝업은 내비에 안 선다', () => {
    const nav = buildLayoutNav(EXAMPLE_MENU, { id: 'orders', title: '주문 목록' })
    const pages = flat(nav.gnb).filter((item) => item.kind === 'page')
    expect(pages.map((item) => item.id)).toEqual(EXAMPLE_PAGES.map((page) => page.id))
    expect(pages.some((item) => item.id === EXAMPLE_POPUP_ID)).toBe(false)
    expect(nav.trail.map((item) => item.title)).toEqual(['주문 관리', '주문', '주문 목록'])
    for (const page of EXAMPLE_PAGES) expect(page.document.layout, page.id).toBe('subpage')
  })

  it('틀 링크를 누르면 장이 바뀐다 · 지금 장은 aria-current · 제목 영역은 장 이름', () => {
    const onChange = vi.fn()
    const { container } = render(<ThemeExamples theme={framed} tokens={{}} page="orders" onPageChange={onChange} />)
    expect(container.querySelector('[data-wb-layout="subpage"] h1')?.textContent).toBe('주문 목록')
    expect(container.querySelector('[data-nav="orders"]')?.getAttribute('aria-current')).toBe('page')
    fireEvent.click(container.querySelector('[data-nav="order-form"]')!)
    fireEvent.click(container.querySelector('[data-nav="menu-orders"]')!)
    fireEvent.click(container.querySelector('[data-nav="orders"]')!)
    expect(onChange.mock.calls).toEqual([['order-form'], ['dashboard']])
    expect(container.querySelector('[data-nav="menu-members"]')?.tagName).toBe('SPAN')
  })

  it('끈 영역은 안 선다 — 다른 영역은 그대로', () => {
    const { container } = render(
      <ThemeExamples theme={framed} tokens={{}} page="dashboard" onPageChange={() => {}} hiddenRegions={['gnb']} />,
    )
    expect(container.querySelector('[data-wb-layout-region="gnb"]')).toBeNull()
    expect(container.querySelector('[data-wb-layout-region="title"]')).not.toBeNull()
  })
})
