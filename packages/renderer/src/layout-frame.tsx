/**
 * **레이아웃 틀** — 그린 문서(`renderDocument` 의 결과)를 테마의 레이아웃 뷰로 감싼다(설계 `docs/superpowers/specs/2026-11-25-page-layout-design.md`
 * 「뷰 — `ThemeDefinition.layouts`」). 캔버스 · 번들 · 갤러리 예제가 이 하나를 부른다.
 *
 * ```html
 * <div data-wb-layout="subpage">               ← 여기
 *   …테마 레이아웃 뷰가 그린 것…
 *     <div data-wb-layout-content>…문서…</div>  ← 여기가 `children` 을 감싼다(SDK 기본 CSS 가 `display: contents`)
 * </div>
 * ```
 *
 * `data-wb-layout` 안 · `data-wb-layout-content` 밖이 **틀**이다 — 노드가 아니라 `data-wb-id` 가 없다. 뷰가 없는 레이아웃은 SDK 기본(내용만)으로
 * 그리고, 뷰가 던지면 노드 뷰처럼 기본으로 대신 그리며 틀에 `data-wb-error` 를 단다(`wb-theme check` 의 폴백 셈이 줍는다).
 */
import { Component, createElement, type ErrorInfo, type ReactElement, type ReactNode } from 'react'
import type { LayoutNav, PageLayout as SchemaPageLayout } from '@wirebound/schema'
import {
  DEFAULT_LAYOUT_VIEWS,
  LayoutHostContext,
  type LayoutHost,
  type LayoutView,
  type PageLayout,
  type ThemeDefinition,
} from '@wirebound/theme-sdk'

/** schema 와 SDK 가 따로 적은 레이아웃 값이 갈리면 여기서 타입 검사가 걸린다(SDK 는 schema 에 기대지 않는다 — `PageLayout` 머리말). */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
const LAYOUTS_AGREE: Same<SchemaPageLayout, PageLayout> = true
void LAYOUTS_AGREE

export interface LayoutFrameProps {
  theme: ThemeDefinition
  layout: PageLayout
  /** 페이지 이름 — 제목 영역이 쓴다. */
  title: string
  /** `buildLayoutNav` 의 결과. 팝업 레이아웃 · 빈 레이아웃도 같은 값을 넘긴다(뷰가 안 쓰면 그만이다). */
  nav: LayoutNav
  /**
   * 끈 영역 id — 그 레이아웃의 선언에 있고 끌 수 있는(`toggle` 이 `false` 가 아닌) 것만 듣는다. 뷰 모드 · 번들 · 캡처는 안 넘긴다(늘 다 켬 —
   * 설계 「정해진 것」 3).
   */
  hiddenRegions?: readonly string[]
  /** 틀 링크를 누르면(`LayoutHost.navigate`). */
  navigate?: (pageId: string) => void
  /** 틀 링크의 `href`(`LayoutHost.href`). */
  href?: (pageId: string) => string | null
  /** 그린 문서. */
  children: ReactNode
}

/** 선언한 영역마다 켬/끔 — 선언 밖 id 는 안 든다. */
export function layoutRegions(theme: ThemeDefinition, layout: PageLayout, hidden: readonly string[] = []): Record<string, boolean> {
  const off = new Set(hidden)
  const regions: Record<string, boolean> = {}
  for (const region of theme.manifest.layouts?.[layout]?.regions ?? []) {
    regions[region.id] = region.toggle === false || !off.has(region.id)
  }
  return regions
}

export function LayoutFrame(props: LayoutFrameProps): ReactElement {
  const View: LayoutView = props.theme.layouts?.[props.layout] ?? DEFAULT_LAYOUT_VIEWS[props.layout]
  const regions = layoutRegions(props.theme, props.layout, props.hiddenRegions)
  const host: LayoutHost = {
    regions,
    ...(props.navigate === undefined ? {} : { navigate: props.navigate }),
    ...(props.href === undefined ? {} : { href: props.href }),
  }
  const content = createElement('div', { 'data-wb-layout-content': '' }, props.children)
  const viewProps = {
    layout: props.layout,
    title: props.title,
    gnb: props.nav.gnb,
    lnb: props.nav.lnb,
    trail: props.nav.trail,
    regions,
    children: content,
  }
  const Fallback = DEFAULT_LAYOUT_VIEWS[props.layout]
  return (
    <LayoutHostContext.Provider value={host}>
      <LayoutBoundary layout={props.layout} resetKey={View} fallback={<Fallback {...viewProps} />}>
        <div data-wb-layout={props.layout}>
          <View {...viewProps} />
        </div>
      </LayoutBoundary>
    </LayoutHostContext.Provider>
  )
}

interface BoundaryProps {
  layout: PageLayout
  /** 바뀌면 다시 그려 본다 — 다른 뷰(테마를 바꿈)가 폴백에 갇히지 않게. */
  resetKey: unknown
  fallback: ReactNode
  children: ReactNode
}

class LayoutBoundary extends Component<BoundaryProps, { message: string | null }> {
  state = { message: null as string | null }

  static getDerivedStateFromError(error: unknown) {
    return { message: `테마 레이아웃 뷰가 던졌습니다: ${error instanceof Error ? error.message : String(error)}` }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  componentDidUpdate(prev: BoundaryProps) {
    if (this.state.message !== null && (prev.resetKey !== this.props.resetKey || prev.layout !== this.props.layout))
      this.setState({ message: null })
  }

  render() {
    if (this.state.message === null) return this.props.children
    return (
      <div data-wb-layout={this.props.layout} data-wb-error={this.state.message}>
        {this.props.fallback}
      </div>
    )
  }
}
