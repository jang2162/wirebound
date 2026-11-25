/**
 * **메뉴 트리 → 서브페이지 레이아웃의 내비(GNB · LNB · 브레드크럼브)** — 캔버스 · 번들 · 갤러리 예제가 이 함수 하나를 부른다. 순수 함수다.
 *
 * | 항목 | 규칙 |
 * |---|---|
 * | 항목에 드는 페이지 | 팝업 레이아웃이 아닌 페이지(빈 · 서브페이지). 팝업은 덮개로 여는 것이라 어디에도 안 선다 |
 * | 차례 | 메뉴 안에서 페이지(그 메뉴의 차례) → 하위 메뉴(그 차례) — 메뉴 트리 칸이 그리는 차례다 |
 * | `gnb` | 뿌리 메뉴들. 깊이를 자르지 않는다(자르는 것은 테마다) |
 * | 메뉴의 `pageId` | 그 메뉴 아래를 위 차례로 훑은 첫 페이지 — 없으면 `null`(빈 메뉴 · 팝업만 든 메뉴) |
 * | `lnb` | 지금 페이지가 든 뿌리 메뉴. 트리에 없으면 `null` |
 * | `trail` | 뿌리 메뉴 → … → 페이지가 든 메뉴 → 지금 페이지. 트리에 없으면 지금 페이지 하나 |
 * | `current` | 지금 페이지와 그 조상 메뉴 |
 * | `title` | 메뉴 · 페이지 이름을 `isolateBidi` 로 가둔 것 — 틀이 이름을 구분 글자 · 다음 항목과 이어 그려도 방향 제어 글자가 이름 밖을 안 뒤집는다(`<a>` · `<span>` 은 격리가 아니다). 제어 글자가 없으면 글자 그대로 |
 *
 * 화면 상태는 메뉴 항목이 아니다. 지금 페이지가 트리에 없는 판(막 만들어 트리가 아직 안 옴 · 조회 실패 · 지금 페이지가 팝업)은 `gnb` 를 받은
 * 트리 그대로 짓는다.
 */
import { isolateBidi } from './bidi'
import type { PageLayout } from './node'

/** 입력 — 메뉴 트리 응답(`GET …/tree` 의 `menu`)과 같은 꼴에서 내비가 읽는 칸만. */
export interface LayoutNavMenu {
  id: string
  title: string
  pages: readonly LayoutNavPage[]
  children: readonly LayoutNavMenu[]
}

export interface LayoutNavPage {
  id: string
  title: string
  layout: PageLayout
}

/** 내비 항목 하나 — 메뉴 또는 페이지. */
export interface LayoutNavItem {
  /** 메뉴 id 또는 페이지 id. */
  id: string
  kind: 'menu' | 'page'
  title: string
  /** 누르면 갈 페이지 — 페이지면 제 id, 메뉴면 그 아래 첫 페이지, 없으면 `null`. */
  pageId: string | null
  /** 지금 페이지이거나 그 조상 메뉴. */
  current: boolean
  children: readonly LayoutNavItem[]
}

export interface LayoutNav {
  /** 뿌리 메뉴들. */
  gnb: readonly LayoutNavItem[]
  /** 지금 페이지가 든 뿌리 메뉴 — LNB 는 그 `children` 이다. */
  lnb: LayoutNavItem | null
  /** 뿌리 메뉴 → … → 지금 페이지. */
  trail: readonly LayoutNavItem[]
}

export function buildLayoutNav(menu: readonly LayoutNavMenu[], current: { id: string; title: string }): LayoutNav {
  const gnb = menu.map((node) => menuItem(node, current.id))
  const path = trailIn(gnb, current.id)
  if (path === null) {
    return {
      gnb,
      lnb: null,
      trail: [{ id: current.id, kind: 'page', title: isolateBidi(current.title), pageId: current.id, current: true, children: [] }],
    }
  }
  return { gnb, lnb: path[0] ?? null, trail: path }
}

function menuItem(node: LayoutNavMenu, currentId: string): LayoutNavItem {
  const pages: LayoutNavItem[] = node.pages
    .filter((page) => page.layout !== 'popup')
    .map((page) => ({
      id: page.id,
      kind: 'page',
      title: isolateBidi(page.title),
      pageId: page.id,
      current: page.id === currentId,
      children: [],
    }))
  const children = [...pages, ...node.children.map((child) => menuItem(child, currentId))]
  return {
    id: node.id,
    kind: 'menu',
    title: isolateBidi(node.title),
    pageId: children.find((child) => child.pageId !== null)?.pageId ?? null,
    current: children.some((child) => child.current),
    children,
  }
}

/** 지금 페이지까지의 항목들(뿌리가 앞) — 없으면 `null`. */
function trailIn(items: readonly LayoutNavItem[], currentId: string): LayoutNavItem[] | null {
  for (const item of items) {
    if (item.kind === 'page') {
      if (item.id === currentId) return [item]
      continue
    }
    const below = trailIn(item.children, currentId)
    if (below !== null) return [item, ...below]
  }
  return null
}
