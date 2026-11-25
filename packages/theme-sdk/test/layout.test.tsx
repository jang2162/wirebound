// @vitest-environment jsdom
/**
 * 레이아웃 틀의 조각 — `LayoutRegion`(호스트가 끈 영역을 감싸는 요소째 안 그린다) · `LayoutLink`(링크인지 · 지금 페이지 · 누름이 호스트로).
 * 문맥은 렌더러의 `LayoutFrame` 이 내리는 것을 여기서 손으로 세운다.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LayoutHostContext, LayoutLink, LayoutRegion, type LayoutHost, type LayoutNavItem } from '@wirebound/theme-sdk'
import type { ReactNode } from 'react'

afterEach(() => cleanup())

const host = (value: LayoutHost, children: ReactNode) =>
  render(<LayoutHostContext.Provider value={value}>{children}</LayoutHostContext.Provider>)

const item = (extra: Partial<LayoutNavItem> = {}): LayoutNavItem => ({
  id: 'p1',
  kind: 'page',
  title: '주문 목록',
  pageId: 'p1',
  current: false,
  children: [],
  ...extra,
})

describe('LayoutRegion', () => {
  it('켠 영역은 data-wb-layout-region 을 단 요소로 감싼다 · 나머지 속성은 편다 · as 태그', () => {
    const { container } = host(
      { regions: { gnb: true } },
      <LayoutRegion id="gnb" as="header" data-wb-part="gnb">
        <span>GNB</span>
      </LayoutRegion>,
    )
    const box = container.querySelector('[data-wb-layout-region="gnb"]')!
    expect(box.tagName).toBe('HEADER')
    expect(box.getAttribute('data-wb-part')).toBe('gnb')
    expect(box.textContent).toBe('GNB')
  })

  it('끈 영역(regions[id] === false)은 감싸는 요소째 안 그린다 — 다른 영역은 그대로', () => {
    const { container } = host(
      { regions: { gnb: false, lnb: true } },
      <>
        <LayoutRegion id="gnb">GNB</LayoutRegion>
        <LayoutRegion id="lnb">LNB</LayoutRegion>
      </>,
    )
    expect(container.querySelector('[data-wb-layout-region="gnb"]')).toBeNull()
    expect(container.textContent).toBe('LNB')
    expect(container.querySelector('[data-wb-layout-region="lnb"]')).not.toBeNull()
  })

  it('선언에 없는 id 는 켠 것으로 그린다', () => {
    const { container } = host({ regions: {} }, <LayoutRegion id="extra">X</LayoutRegion>)
    expect(container.querySelector('[data-wb-layout-region="extra"]')?.textContent).toBe('X')
  })

  it('레이아웃 뷰 밖에서 쓰면 던진다', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<LayoutRegion id="gnb" />)).toThrow('레이아웃 뷰 안에서만')
  })
})

describe('LayoutLink', () => {
  it('pageId 가 null 이면 링크가 아닌 글이다(aria-disabled)', () => {
    const { container } = host({ regions: {} }, <LayoutLink item={item({ kind: 'menu', pageId: null, title: '빈 메뉴' })} />)
    expect(container.querySelector('a')).toBeNull()
    const text = container.querySelector('span')!
    expect(text.textContent).toBe('빈 메뉴')
    expect(text.getAttribute('aria-disabled')).toBe('true')
  })

  it('지금 페이지면 aria-current="page" — 아니면 없다 · children 이 이름을 대신한다', () => {
    const { container } = host(
      { regions: {} },
      <>
        <LayoutLink item={item({ id: 'a', current: true })} data-wb-part="a" />
        <LayoutLink item={item({ id: 'b' })} data-wb-part="b">
          <b>다른 글</b>
        </LayoutLink>
      </>,
    )
    expect(container.querySelector('[data-wb-part="a"]')!.getAttribute('aria-current')).toBe('page')
    const other = container.querySelector('[data-wb-part="b"]')!
    expect(other.hasAttribute('aria-current')).toBe(false)
    expect(other.textContent).toBe('다른 글')
  })

  it('누름이 문맥의 처리기로 그 pageId 를 넘긴다 · href 가 없으면 기본 동작을 막는다', () => {
    const navigate = vi.fn()
    const { container } = host({ regions: {}, navigate }, <LayoutLink item={item({ kind: 'menu', id: 'm1', pageId: 'p9' })} />)
    const link = container.querySelector('a')!
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    link.dispatchEvent(event)
    expect(navigate.mock.calls).toEqual([['p9']])
    expect(event.defaultPrevented).toBe(true)
  })

  it('호스트가 href 를 주면 그 주소를 달고 기본 동작을 둔다', () => {
    const navigate = vi.fn()
    const { container } = host({ regions: {}, navigate, href: (id) => `../${id}.html` }, <LayoutLink item={item()} />)
    const link = container.querySelector('a')!
    expect(link.getAttribute('href')).toBe('../p1.html')
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    link.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
    expect(navigate).toHaveBeenCalledTimes(1)
  })

  it('처리기가 없는 호스트(편집 모드 · 캡처)는 누름이 아무 일도 안 한다', () => {
    const { container } = host({ regions: {} }, <LayoutLink item={item()} />)
    expect(() => fireEvent.click(container.querySelector('a')!)).not.toThrow()
  })
})
