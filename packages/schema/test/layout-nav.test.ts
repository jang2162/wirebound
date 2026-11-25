/** 메뉴 트리 → 서브페이지 내비(`layout-nav.ts` 의 `buildLayoutNav`). */
import { describe, expect, it } from 'vitest'
import { buildLayoutNav, type LayoutNavItem, type LayoutNavMenu } from '../src/layout-nav'

const page = (id: string, layout: 'blank' | 'popup' | 'subpage' = 'subpage') => ({ id, title: `페이지 ${id}`, layout })
const menu = (id: string, pages: ReturnType<typeof page>[], children: LayoutNavMenu[] = []): LayoutNavMenu => ({
  id,
  title: `메뉴 ${id}`,
  pages,
  children,
})

/** 회원(목록 · 팝업 · 하위 «상세»(상세 하나)) · 빈 메뉴 · 팝업만 든 메뉴 · 통계(하위만). */
const TREE: LayoutNavMenu[] = [
  menu('m_member', [page('p_list'), page('p_pop', 'popup')], [menu('m_detail', [page('p_detail', 'blank')])]),
  menu('m_empty', []),
  menu('m_popups', [page('p_onlypop', 'popup')]),
  menu('m_stats', [], [menu('m_daily', [page('p_daily')])]),
]

const ids = (items: readonly LayoutNavItem[]): string[] => items.map((item) => item.id)

describe('buildLayoutNav', () => {
  it('메뉴 안에서 페이지가 먼저, 하위 메뉴가 뒤다', () => {
    const { gnb } = buildLayoutNav(TREE, { id: 'p_list', title: '목록' })
    expect(ids(gnb)).toEqual(['m_member', 'm_empty', 'm_popups', 'm_stats'])
    expect(ids(gnb[0]!.children)).toEqual(['p_list', 'm_detail'])
  })

  it('팝업 레이아웃 페이지는 항목에 안 선다', () => {
    const { gnb } = buildLayoutNav(TREE, { id: 'p_list', title: '목록' })
    const all = (items: readonly LayoutNavItem[]): string[] => items.flatMap((item) => [item.id, ...all(item.children)])
    expect(all(gnb)).not.toContain('p_pop')
    expect(all(gnb)).not.toContain('p_onlypop')
  })

  it('메뉴의 pageId 는 그 아래 첫 화면 페이지 — 빈 메뉴 · 팝업만 든 메뉴는 null', () => {
    const { gnb } = buildLayoutNav(TREE, { id: 'p_list', title: '목록' })
    expect(gnb.map((item) => item.pageId)).toEqual(['p_list', null, null, 'p_daily'])
    expect(gnb[0]!.children[1]!.pageId).toBe('p_detail')
  })

  it('current · lnb · trail — 지금 페이지와 조상 메뉴', () => {
    const nav = buildLayoutNav(TREE, { id: 'p_detail', title: '상세' })
    expect(nav.lnb?.id).toBe('m_member')
    expect(ids(nav.trail)).toEqual(['m_member', 'm_detail', 'p_detail'])
    expect(nav.trail.map((item) => item.current)).toEqual([true, true, true])
    expect(nav.gnb.map((item) => item.current)).toEqual([true, false, false, false])
    // 형제 페이지는 current 가 아니다.
    expect(nav.gnb[0]!.children[0]!.current).toBe(false)
  })

  it('트리에 없는 페이지 — gnb 는 그대로 · lnb null · trail 은 지금 페이지 하나', () => {
    const nav = buildLayoutNav(TREE, { id: 'p_new', title: '막 만든 페이지' })
    expect(ids(nav.gnb)).toEqual(['m_member', 'm_empty', 'm_popups', 'm_stats'])
    expect(nav.lnb).toBeNull()
    expect(nav.trail).toEqual([{ id: 'p_new', kind: 'page', title: '막 만든 페이지', pageId: 'p_new', current: true, children: [] }])
    expect(nav.gnb.some((item) => item.current)).toBe(false)
  })

  it('지금 페이지가 팝업이면 트리에 없는 것과 같다', () => {
    const nav = buildLayoutNav(TREE, { id: 'p_pop', title: '팝업' })
    expect(nav.lnb).toBeNull()
    expect(ids(nav.trail)).toEqual(['p_pop'])
  })

  it('빈 트리', () => {
    expect(buildLayoutNav([], { id: 'p', title: 'p' })).toEqual({
      gnb: [],
      lnb: null,
      trail: [{ id: 'p', kind: 'page', title: 'p', pageId: 'p', current: true, children: [] }],
    })
  })
})
