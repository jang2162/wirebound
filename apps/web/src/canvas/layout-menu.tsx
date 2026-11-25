/**
 * **메뉴 트리 칸이 그린 트리를 캔버스의 레이아웃 틀이 아는 통로**(설계 `docs/superpowers/specs/2026-11-25-page-layout-design.md` 「캔버스」 —
 * 서브페이지의 GNB · LNB · 브레드크럼브는 «에디터가 든 메뉴 트리 조회 값» 으로 짓는다).
 *
 * 트리를 쥔 곳은 `tree/use-tree-commands.tsx` 하나다(조회 · 판 번호 · 실시간 `menu-changed` · 복원 뒤 다시 받기 — 그 파일 머리말 «이 훅을 부르는
 * 자리는 한 곳»). 캔버스가 `getTree` 를 따로 부르면 두 조회가 다른 때 다른 판을 받아, 트리 칸과 틀의 메뉴가 서로 다른 이름 · 차례를 그린다.
 * 그래서 메뉴 트리 칸(`panels/menu-tree.tsx`)이 **지금 그린 트리**를 여기에 싣고 캔버스가 읽는다. 트리 칸은 좌측을 접어도 내려가지 않는다
 * (`routes/editor.tsx` 의 `wb-shell-folded` — 클래스로 접는다) — 접은 동안에도 값이 산다.
 *
 * 트리를 아직 못 받았거나(첫 조회 중) 조회가 실패했으면 `null` 이다 — 틀은 «지금 페이지가 트리에 없는» 판으로 선다(`buildLayoutNav`).
 * 공급자 밖도 `null` 이다(트리 칸이 없는 숙주 · 최소 숙주 테스트).
 */
import { createContext, useCallback, useContext, useLayoutEffect, useState, type ReactElement, type ReactNode } from 'react'
import type { TreeMenuNode } from '../api/types'

interface Publish {
  show: (menu: readonly TreeMenuNode[]) => void
  /** 그 트리가 지금 값일 때만 비운다 — 새 값이 먼저 섰으면 그것을 지우지 않는다. */
  hide: (menu: readonly TreeMenuNode[]) => void
}

const MenuContext = createContext<readonly TreeMenuNode[] | null>(null)
const PublishContext = createContext<Publish>({ show: () => {}, hide: () => {} })

/** 셸이 트리 칸과 캔버스를 함께 감싼다. `children` 을 그대로 넘겨 값이 바뀌어도 읽는 쪽만 다시 그린다. */
export function LayoutMenuProvider(props: { children: ReactNode }): ReactElement {
  const [menu, setMenu] = useState<readonly TreeMenuNode[] | null>(null)
  const show = useCallback((next: readonly TreeMenuNode[]) => setMenu(next), [])
  const hide = useCallback((gone: readonly TreeMenuNode[]) => setMenu((prev) => (prev === gone ? null : prev)), [])
  const [publish] = useState<Publish>(() => ({ show, hide }))
  return (
    <PublishContext.Provider value={publish}>
      <MenuContext.Provider value={menu}>{props.children}</MenuContext.Provider>
    </PublishContext.Provider>
  )
}

/** 트리 칸이 지금 그린 트리를 싣는다(`null` 이면 싣지 않는다). 내려가거나 값이 바뀌면 앞 값을 거둔다. */
export function usePublishLayoutMenu(menu: readonly TreeMenuNode[] | null): void {
  const publish = useContext(PublishContext)
  useLayoutEffect(() => {
    if (menu === null) return
    publish.show(menu)
    return () => publish.hide(menu)
  }, [publish, menu])
}

/** 트리 칸이 지금 그린 트리. 없으면 `null`. */
export function useLayoutMenu(): readonly TreeMenuNode[] | null {
  return useContext(MenuContext)
}
