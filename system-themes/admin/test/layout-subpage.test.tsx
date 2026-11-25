// @vitest-environment jsdom
/**
 * 기본테마의 **서브페이지 틀**(`src/views/layout-subpage.tsx` · `theme.css` 의 «서브페이지 틀») — 영역 넷 · 내비 조각 · 틀 규칙이 페이지 내용에 안
 * 닿는가. jsdom 값이다 — 치수(GNB 60 · LNB 240 · 제목 22px)와 넘침은 실브라우저 판(`apps/web/build-test/admin-subpage.test.ts`)이 잰다. 틀 규칙이
 * 배치를 형제 구조로 안 가르는 것은 `test/admin.test.ts` «배치를 바꾸는 규칙은 형제 구조로 안 가른다» 가 소유한다 — 여기서는 그 셈이 틀 규칙을
 * 읽는지(수)만 본다.
 */
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { buildLayoutNav, installCatalog, type LayoutNavMenu, type PageDocument } from '@wirebound/schema'
import { LayoutFrame, renderDocument } from '@wirebound/renderer'
import { ADMIN_V0, ADMIN_V0_CSS } from '@wirebound/system-theme-admin'

beforeAll(() => {
  installCatalog()
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
})

let unmount: (() => void) | null = null
afterEach(() => {
  unmount?.()
  unmount = null
  document.body.innerHTML = ''
  document.head.innerHTML = ''
})

/** 뿌리 메뉴 둘(페이지 없는 «회원») · 하위 메뉴 두 단 — LNB 의 둘째 · 셋째 · 넷째 단이 다 선다. 지금 페이지는 «목록»(셋째 단). */
const MENU: LayoutNavMenu[] = [
  {
    id: 'm-root',
    title: '홈페이지 관리',
    pages: [{ id: 'p-dash', title: '배너관리', layout: 'subpage' }],
    children: [
      {
        id: 'm-sub',
        title: '게시판관리',
        pages: [
          { id: 'p-list', title: '게시물 목록', layout: 'subpage' },
          { id: 'p-new', title: '게시물 등록', layout: 'subpage' },
        ],
        children: [{ id: 'm-deep', title: '답글', pages: [{ id: 'p-deep', title: '답글 목록', layout: 'subpage' }], children: [] }],
      },
    ],
  },
  { id: 'm-other', title: '회원 관리', pages: [], children: [] },
]

/** 내용 — 카드(제목 조각 `title` · 몸통 `body`)와 그리드. 틀의 조각 이름과 겹치는 노드 조각이 든다. */
const DOC: PageDocument = {
  version: 7,
  layout: 'subpage',
  root: {
    id: 'root',
    type: 'Page',
    children: [
      { id: 'card', type: 'Card', props: { title: '카드 제목' }, children: [{ id: 't', type: 'Text', props: { content: '글' } }] },
      { id: 'grid', type: 'DataGrid', props: {}, children: [{ id: 'c', type: 'GridColumn', props: { label: '이름' } }] },
    ],
  },
}

function draw(options: { page?: string; hidden?: string[]; menu?: LayoutNavMenu[] } = {}): HTMLElement {
  const page = options.page ?? 'p-list'
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() =>
    root.render(
      <LayoutFrame
        theme={ADMIN_V0}
        layout="subpage"
        title="게시물 목록"
        nav={buildLayoutNav(options.menu ?? MENU, { id: page, title: '게시물 목록' })}
        {...(options.hidden === undefined ? {} : { hiddenRegions: options.hidden })}
      >
        {renderDocument(DOC, { theme: ADMIN_V0 })}
      </LayoutFrame>,
    ),
  )
  unmount = () => act(() => root.unmount())
  return host
}

const part = (host: HTMLElement, name: string) =>
  [...host.querySelectorAll(`[data-wb-part="${name}"]`)].filter((el) => !el.closest('[data-wb-id]'))
const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/[\u2066-\u2069]/g, '')

describe('기본테마 서브페이지 틀 — 선언 · 뷰', () => {
  it('manifest 가 서브페이지 영역 넷을 선언하고(다 끌 수 있다) 서브페이지 레이아웃 뷰를 낸다 · 빈 · 팝업은 SDK 기본', () => {
    expect(ADMIN_V0.manifest.layouts).toEqual({
      subpage: {
        regions: [
          { id: 'gnb', label: 'GNB' },
          { id: 'lnb', label: 'LNB' },
          { id: 'breadcrumb', label: '브레드크럼브' },
          { id: 'title', label: '페이지 제목' },
        ],
      },
    })
    expect(Object.keys(ADMIN_V0.layouts ?? {})).toEqual(['subpage'])
  })

  it('다 켠 판 — 영역 넷이 틀의 자리에 서고 내용은 본문 칸에 한 번', () => {
    const host = draw()
    const frame = host.querySelector(':scope > [data-wb-layout="subpage"] > [data-wb-part="frame"]')!
    expect(frame).not.toBeNull()
    const region = (id: string) => frame.querySelectorAll(`[data-wb-layout-region="${id}"]`)
    expect(['gnb', 'lnb', 'breadcrumb', 'title'].map((id) => [id, region(id).length])).toEqual([
      ['gnb', 1],
      ['lnb', 1],
      ['breadcrumb', 1],
      ['title', 1],
    ])
    expect(frame.querySelector(':scope > [data-wb-part="gnb"]')).toBe(region('gnb')[0])
    expect(frame.querySelector(':scope > [data-wb-part="body"] > [data-wb-part="lnb"]')).toBe(region('lnb')[0])
    const content = frame.querySelector(':scope > [data-wb-part="body"] > [data-wb-part="content"]')!
    expect(content.querySelector(':scope > [data-wb-part="breadcrumb"]')).toBe(region('breadcrumb')[0])
    expect(content.querySelector(':scope > [data-wb-part="title"]')).toBe(region('title')[0])
    expect(content.querySelectorAll(':scope > [data-wb-layout-content] > [data-wb-id="root"]')).toHaveLength(1)
    expect(text(region('title')[0])).toBe('게시물 목록')
  })

  it('GNB — 뿌리 메뉴마다 한 칸 · 지금 페이지가 든 뿌리만 data-wb-current · 갈 화면 없는 메뉴는 링크가 아니다', () => {
    const host = draw()
    const links = part(host, 'gnbLink')
    expect(links.map((el) => [text(el), el.tagName, el.getAttribute('data-wb-current')])).toEqual([
      ['홈페이지 관리', 'A', 'true'],
      ['회원 관리', 'SPAN', 'false'],
    ])
  })

  it('LNB — 지금 뿌리 메뉴 이름이 머리 · 하위를 다 펼쳐 깊이 2 · 3 · 4 · 지금 페이지만 aria-current', () => {
    const host = draw()
    expect(text(part(host, 'lnbSection')[0])).toBe('홈페이지 관리')
    const nodes = part(host, 'lnbNode').map((li) => {
      const link = li.querySelector(':scope > [data-wb-part="lnbLink"]')!
      return [text(link), li.getAttribute('data-wb-depth'), link.getAttribute('aria-current')]
    })
    expect(nodes).toEqual([
      ['배너관리', '2', null],
      ['게시판관리', '2', null],
      ['게시물 목록', '3', 'page'],
      ['게시물 등록', '3', null],
      ['답글', '3', null],
      ['답글 목록', '4', null],
    ])
    // «메뉴 / 즐겨찾기» 탭은 그림 — 누를 것이 없다.
    expect(part(host, 'lnbTab').map((el) => [text(el), el.tagName, el.getAttribute('data-wb-current')])).toEqual([
      ['메뉴', 'SPAN', 'true'],
      ['즐겨찾기', 'SPAN', 'false'],
    ])
  })

  it('브레드크럼브 — «홈» 머리 · 구분 글자 > · 마지막(지금 페이지)만 crumbCurrent', () => {
    const host = draw()
    const crumb = part(host, 'breadcrumb')[0]!
    expect([...crumb.children].map((el) => [el.getAttribute('data-wb-part'), text(el)])).toEqual([
      ['crumb', '홈'],
      ['crumbSep', '>'],
      ['crumb', '홈페이지 관리'],
      ['crumbSep', '>'],
      ['crumb', '게시판관리'],
      ['crumbSep', '>'],
      ['crumbCurrent', '게시물 목록'],
    ])
  })

  it('영역을 끄면 그 영역째 안 서고 내용은 그대로 · 넷을 다 꺼도 내용은 한 번', () => {
    for (const id of ['gnb', 'lnb', 'breadcrumb', 'title']) {
      const host = draw({ hidden: [id] })
      expect(host.querySelector(`[data-wb-layout-region="${id}"]`), id).toBeNull()
      expect(host.querySelectorAll('[data-wb-layout-region]'), id).toHaveLength(3)
      expect(host.querySelectorAll('[data-wb-layout-content] > [data-wb-id="root"]'), id).toHaveLength(1)
      unmount?.()
      unmount = null
    }
    const host = draw({ hidden: ['gnb', 'lnb', 'breadcrumb', 'title'] })
    expect(host.querySelectorAll('[data-wb-layout-region]')).toHaveLength(0)
    expect(host.querySelectorAll('[data-wb-layout-content] > [data-wb-id="root"]')).toHaveLength(1)
  })

  it('지금 페이지가 메뉴 트리에 없으면 LNB 는 탭만 · 브레드크럼브는 «홈 > 지금 페이지»', () => {
    const host = draw({ page: 'p-nowhere' })
    expect(part(host, 'lnbTabs')).toHaveLength(1)
    expect(part(host, 'lnbSection')).toHaveLength(0)
    expect(part(host, 'lnbNode')).toHaveLength(0)
    expect(text(part(host, 'breadcrumb')[0])).toBe('홈>게시물 목록')
    expect(host.querySelectorAll('[data-wb-layout-content] > [data-wb-id="root"]')).toHaveLength(1)
  })
})

interface Rule {
  selector: string
  style: CSSStyleDeclaration
}

/** `theme.css` 의 스타일 규칙 전부(`@media` 안의 것도). */
function rules(): Rule[] {
  const el = document.createElement('style')
  el.textContent = ADMIN_V0_CSS
  document.head.appendChild(el)
  const out: Rule[] = []
  const walk = (list: CSSRuleList) => {
    for (const rule of Array.from(list)) {
      if (rule instanceof CSSMediaRule) walk(rule.cssRules)
      else if (rule instanceof CSSStyleRule) out.push({ selector: rule.selectorText, style: rule.style })
    }
  }
  walk(el.sheet!.cssRules)
  el.remove()
  return out
}

describe('기본테마 서브페이지 틀 — CSS', () => {
  /**
   * 틀 안에 페이지 내용이 서고 노드의 조각도 같은 이름(`title` · `body`)을 쓴다 — 틀 규칙이 자손 셀렉터로 조각을 겨누면 카드 제목이 페이지 제목 크기로
   * 선다. 내용 안의 요소마다 틀 규칙(`[data-wb-layout="subpage"]` 를 든 셀렉터)이 맞는지 센다.
   */
  it('틀 규칙은 페이지 내용(노드 · 노드의 조각)에 안 닿는다', () => {
    const frameRules = rules().filter((rule) => rule.selector.includes('[data-wb-layout="subpage"]'))
    const host = draw()
    const inside = [...host.querySelectorAll('[data-wb-layout-content] *')]
    // 카나리아 — 내용에 틀과 같은 이름의 조각(카드 `title`)이 있고, 틀의 `title` 조각에는 틀 규칙이 맞는다.
    expect(inside.filter((el) => el.getAttribute('data-wb-part') === 'title').length).toBeGreaterThan(0)
    const frameTitle = part(host, 'title')[0]!
    const hits = (el: Element) =>
      frameRules.filter((rule) => {
        try {
          return el.matches(rule.selector)
        } catch {
          return false
        }
      })
    expect(hits(frameTitle).length).toBeGreaterThan(0)
    const leaked = inside.flatMap((el) =>
      hits(el).map((rule) => `${el.getAttribute('data-wb-id') ?? el.getAttribute('data-wb-part') ?? el.tagName} ← ${rule.selector}`),
    )
    expect(leaked).toEqual([])
  })

  /** 형제 구조 인구조사(`test/admin.test.ts`)는 시트 전부를 읽는다 — 틀 규칙이 그 셈에 든다(수). 판정은 그 케이스가 한다. */
  it('틀 규칙이 시트에 있다 — 형제 구조 인구조사가 읽는 규칙에 든다', () => {
    const frameRules = rules().filter((rule) => rule.selector.includes('[data-wb-layout="subpage"]'))
    expect(frameRules.length).toBeGreaterThanOrEqual(20)
  })

  it('치수 상수 — GNB 60px · LNB 240px · 글 크기는 본문 크기에서 셈한다', () => {
    const root = rules().find((rule) => rule.selector === ':root')!.style
    const value = (name: string) => root.getPropertyValue(name).trim().replace(/\s+/g, ' ')
    expect({
      gnb: value('--wb-layout-gnbHeight'),
      lnb: value('--wb-layout-lnbWidth'),
      gnbFont: value('--wb-layout-gnbFontSize'),
      lnbFont: value('--wb-layout-lnbFontSize'),
      crumbFont: value('--wb-layout-crumbFontSize'),
    }).toEqual({
      gnb: '60px',
      lnb: '240px',
      gnbFont: 'calc(var(--wb-typography-body-fontSize) + 2px)',
      lnbFont: 'calc(var(--wb-typography-body-fontSize) + 1px)',
      crumbFont: 'calc(var(--wb-typography-body-fontSize) - 0.5px)',
    })
  })
})
