// @vitest-environment jsdom
/**
 * `LayoutFrame` — 그린 문서를 테마의 레이아웃 뷰로 감싼다(설계 `docs/superpowers/specs/2026-11-25-page-layout-design.md` 「뷰 — `ThemeDefinition.layouts`」).
 * 뷰 고르기(없으면 SDK 기본 = 내용만) · 감싸기(`data-wb-layout` · `data-wb-layout-content` 하나) · 뷰가 던지면 기본 + 오류 · 영역 켬/끔.
 */
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { buildLayoutNav, installCatalog, type LayoutNavMenu, type PageDocument } from '@wirebound/schema'
import { CAPTURE_CSS, defaultViewsCss, LayoutLink, LayoutRegion, type LayoutView, type ThemeDefinition } from '@wirebound/theme-sdk'
import { LayoutFrame, layoutRegions, NO_THEME, renderDocument, type LayoutFrameProps } from '@wirebound/renderer'

beforeAll(() => installCatalog())
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const MENU: LayoutNavMenu[] = [
  { id: 'm1', title: '주문', pages: [{ id: 'p1', title: '주문 목록', layout: 'subpage' }], children: [] },
  { id: 'm2', title: '회원', pages: [{ id: 'p2', title: '회원 목록', layout: 'subpage' }], children: [] },
]

const doc: PageDocument = {
  version: 7,
  layout: 'subpage',
  root: { id: 'root', type: 'Page', children: [{ id: 't', type: 'Text', props: { content: '본문' } }] },
}

const Subpage: LayoutView = (props) => (
  <div data-wb-part="shell">
    <LayoutRegion id="gnb" as="nav">
      {props.gnb.map((item) => (
        <LayoutLink key={item.id} item={item} />
      ))}
    </LayoutRegion>
    <LayoutRegion id="title" as="h1">
      {props.title}
    </LayoutRegion>
    <main data-wb-part="main">{props.children}</main>
  </div>
)

const theme = (extra: Partial<ThemeDefinition> = {}): ThemeDefinition => ({
  ...NO_THEME,
  manifest: {
    ...NO_THEME.manifest,
    layouts: {
      subpage: {
        regions: [
          { id: 'gnb', label: 'GNB' },
          { id: 'title', label: '제목', toggle: false },
        ],
      },
    },
  },
  ...extra,
})

const frame = (props: Partial<LayoutFrameProps> = {}) =>
  render(
    <LayoutFrame
      theme={theme({ layouts: { subpage: Subpage } })}
      layout="subpage"
      title="주문 목록"
      nav={buildLayoutNav(MENU, { id: 'p1', title: '주문 목록' })}
      {...props}
    >
      {renderDocument(doc)}
    </LayoutFrame>,
  )

describe('LayoutFrame', () => {
  it('테마 뷰가 없으면 SDK 기본 — 내용만 그린다 · data-wb-layout · data-wb-layout-content 하나', () => {
    const { container } = render(
      <LayoutFrame theme={NO_THEME} layout="subpage" title="주문 목록" nav={buildLayoutNav(MENU, { id: 'p1', title: '주문 목록' })}>
        {renderDocument(doc)}
      </LayoutFrame>,
    )
    const outer = container.firstElementChild!
    expect(outer.getAttribute('data-wb-layout')).toBe('subpage')
    expect(container.querySelectorAll('[data-wb-layout-content]')).toHaveLength(1)
    // 틀이 없다 — 겉 상자 바로 안이 내용 상자이고 그 안이 문서 뿌리다.
    expect(outer.children).toHaveLength(1)
    const content = outer.firstElementChild!
    expect(content.hasAttribute('data-wb-layout-content')).toBe(true)
    expect(content.firstElementChild?.getAttribute('data-wb-id')).toBe('root')
  })

  it('테마 뷰가 있으면 그 뷰가 틀을 그리고 내용 상자를 제 자리에 둔다 · 틀에는 data-wb-id 가 없다', () => {
    const { container } = frame()
    const outer = container.querySelector('[data-wb-layout="subpage"]')!
    const content = outer.querySelector('[data-wb-layout-content]')!
    expect(content.parentElement?.getAttribute('data-wb-part')).toBe('main')
    expect(outer.querySelector('h1')?.textContent).toBe('주문 목록')
    expect([...outer.querySelectorAll('nav a')].map((a) => [a.textContent, a.getAttribute('aria-current')])).toEqual([
      ['주문', null],
      ['회원', null],
    ])
    // 틀 요소 가운데 노드 속성을 단 것은 내용 상자 안뿐이다.
    const framed = [...outer.querySelectorAll('[data-wb-id]')].filter((el) => !content.contains(el))
    expect(framed).toEqual([])
  })

  it('뷰가 던지면 기본(내용만)으로 대신 그리고 틀에 오류를 단다 · console.error', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const Throws: LayoutView = () => {
      throw new Error('틀 고장')
    }
    const { container } = frame({ theme: theme({ layouts: { subpage: Throws } }) })
    const outer = container.querySelector('[data-wb-layout="subpage"]')!
    expect(outer.getAttribute('data-wb-error')).toBe('테마 레이아웃 뷰가 던졌습니다: 틀 고장')
    expect(container.querySelectorAll('[data-wb-layout-content]')).toHaveLength(1)
    expect(container.querySelector('[data-wb-id="t"]')?.textContent).toBe('본문')
    expect(error).toHaveBeenCalled()
  })

  it('끈 영역은 안 그린다 — 끌 수 없는 영역(toggle: false)은 끄라고 해도 그린다', () => {
    const { container } = frame({ hiddenRegions: ['gnb', 'title'] })
    expect(container.querySelector('[data-wb-layout-region="gnb"]')).toBeNull()
    expect(container.querySelector('[data-wb-layout-region="title"]')).not.toBeNull()
  })

  it('layoutRegions — 선언한 영역만 든다 · 선언 밖 id 는 끄라고 해도 안 든다', () => {
    expect(layoutRegions(theme(), 'subpage', ['gnb', 'nope'])).toEqual({ gnb: false, title: true })
    expect(layoutRegions(theme(), 'popup', ['gnb'])).toEqual({})
    expect(layoutRegions(NO_THEME, 'subpage')).toEqual({})
  })

  it('틀 링크의 누름은 navigate 로 간다', () => {
    const navigate = vi.fn()
    const { container } = frame({ navigate })
    ;(container.querySelectorAll('nav a')[1] as HTMLElement).click()
    expect(navigate.mock.calls).toEqual([['p2']])
  })
})

/**
 * **팝업 레이아웃의 막** — SDK 기본 CSS 가 `[data-wb-layout="popup"]` 에 막(바탕 · 여백)을 깔고, 찍는 판(`html[data-wb-capture]` + `CAPTURE_CSS`)은
 * 막 없이 상자만이다. jsdom 은 `@layer` 를 못 읽어 찍는 판의 층을 벗긴 글을 싣는다(층 안 · 밖의 이김은 여기서 못 잰다 — 층 밖 시트가
 * `!important` 를 안 싣는 한 같은 값이다).
 */
describe('팝업 레이아웃의 막', () => {
  const popupDoc: PageDocument = {
    version: 7,
    layout: 'popup',
    root: { id: 'pop', type: 'Popup', props: { title: '삭제' }, children: [] },
  }

  const drawPopup = (capture: boolean) => {
    const sheets = [defaultViewsCss(), ...(capture ? [CAPTURE_CSS.replace(/^@layer wb-capture \{/, '').replace(/\}\s*$/, '')] : [])]
    const styles = sheets.map((css) => {
      const style = document.createElement('style')
      style.textContent = css
      document.head.append(style)
      return style
    })
    if (capture) document.documentElement.setAttribute('data-wb-capture', '')
    const { container } = render(
      <LayoutFrame theme={NO_THEME} layout="popup" title="삭제" nav={buildLayoutNav(MENU, { id: 'x', title: '삭제' })}>
        {renderDocument(popupDoc)}
      </LayoutFrame>,
    )
    const style = getComputedStyle(container.querySelector('[data-wb-layout="popup"]')!)
    const read = { padding: style.paddingTop, background: style.getPropertyValue('background'), display: style.display }
    styles.forEach((one) => one.remove())
    document.documentElement.removeAttribute('data-wb-capture')
    return read
  }

  it('화면 판은 막(여백 24px · 흐린 바탕)을 깔고 가운데에 세운다', () => {
    const shown = drawPopup(false)
    expect(shown.padding).toBe('24px')
    expect(shown.display).toBe('flex')
    expect(shown.background).not.toMatch(/^(|none|transparent|rgba\(0, 0, 0, 0\))$/)
  })

  it('찍는 판은 막이 없다 — 여백 0 · 바탕 없음 · 가운데 세우기를 푼다', () => {
    const shot = drawPopup(true)
    expect(shot.padding).toMatch(/^0(px)?$/)
    expect(shot.display).toBe('block')
    expect(shot.background).toMatch(/^(|none|transparent|rgba\(0, 0, 0, 0\))$/)
  })
})
