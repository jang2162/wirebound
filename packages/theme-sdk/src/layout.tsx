import { createContext, createElement, useContext, type MouseEvent, type ReactElement, type ReactNode } from 'react'
import type { LayoutNavItem } from './types'

/**
 * **레이아웃 틀의 호스트 문맥** — 렌더러의 `LayoutFrame` 이 레이아웃 뷰 밖에 내린다. 영역 켬/끔과 틀 링크의 누름은 호스트가 정한다(편집 모드 ·
 * 뷰 모드 · 번들 · 캡처마다 다르다) — 뷰는 `<LayoutRegion>` · `<LayoutLink>` 로만 두어 그 결정을 모른 채 맞는다.
 */
export interface LayoutHost {
  /** 선언한 영역마다 지금 그리는가. 없는 id 는 켠 것으로 본다(선언 밖 영역은 `wb-theme check` 가 경고한다). */
  regions: Readonly<Record<string, boolean>>
  /** 틀 링크를 누르면 부른다 — 뷰 모드 캔버스가 그 페이지를 연다. 없으면 누름이 아무 일도 안 한다(편집 모드 · 캡처). */
  navigate?: (pageId: string) => void
  /** 틀 링크의 `href` — 번들이 그 장 파일의 상대 경로를 준다. 없거나 `null` 이면 `href` 를 안 단다. */
  href?: (pageId: string) => string | null
}

export const LayoutHostContext = createContext<LayoutHost | null>(null)

function useLayoutHost(name: string): LayoutHost {
  const host = useContext(LayoutHostContext)
  if (host === null) throw new Error(`${name} 은 레이아웃 뷰 안에서만 쓸 수 있습니다`)
  return host
}

/**
 * 끌 수 있는 영역 하나의 자리. 호스트가 그 영역을 껐으면(`regions[id] === false`) **감싸는 요소째 안 그리고**, 켰으면
 * `data-wb-layout-region="<id>"` 를 단 요소로 감싼다 — `Zone` 과 같은 자세다(뷰가 켬/끔을 빠뜨리거나 잘못 적을 수 없다). 나머지 속성
 * (`data-wb-part` 등 — 테마 CSS 가 겨냥하는 조각 이름)은 그대로 편다.
 */
export function LayoutRegion(props: { id: string; as?: string; children?: ReactNode } & Record<string, unknown>): ReactElement | null {
  const host = useLayoutHost('LayoutRegion')
  const { id, as = 'div', children, ...rest } = props
  if (host.regions[id] === false) return null
  return createElement(as, { ...rest, 'data-wb-layout-region': id }, children)
}

/**
 * 내비 항목 하나의 링크. `pageId` 가 `null` 이면 링크가 아닌 글(`aria-disabled`)이다. 지금 페이지면 `aria-current="page"`. 누름은 호스트가
 * 정한다(`LayoutHost`) — `href` 를 주지 않은 호스트에서는 기본 동작(주소 바꾸기)을 막는다. `children` 이 없으면 항목 이름을 그린다.
 */
export function LayoutLink(props: { item: LayoutNavItem; children?: ReactNode } & Record<string, unknown>): ReactElement {
  const host = useLayoutHost('LayoutLink')
  const { item, children, ...rest } = props
  const content = children ?? item.title
  const current = item.kind === 'page' && item.current ? { 'aria-current': 'page' } : {}
  const pageId = item.pageId
  if (pageId === null) return createElement('span', { ...rest, ...current, 'aria-disabled': 'true' }, content)
  const href = host.href?.(pageId) ?? null
  const onClick = (event: MouseEvent) => {
    if (href === null) event.preventDefault()
    host.navigate?.(pageId)
  }
  // `href` 없는 `<a>` 는 링크 역할이 아니다 — 편집 모드에서도 링크로 읽히게 빈 조각(`#`)을 달고 누름에서 막는다.
  return createElement('a', { ...rest, ...current, href: href ?? '#', onClick }, content)
}
