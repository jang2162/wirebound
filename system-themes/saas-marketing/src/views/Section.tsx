import { Root, view } from '@wirebound/theme-sdk'

/** `compact` prop 이 켜진 섹션의 클래스 — `theme.css` 가 섹션 세로 여백을 좁힌다. */
export const SECTION_COMPACT_CLASS = 'wbsm-section-compact'

/**
 * **배경이 갈린 섹션(옛 구조 `splitBg`)** — 전체 폭에 깔린 워시(`band`) 위에 가운데 모인 내용(`inner`). 기본 뷰(`contained`)는
 * `inner` 하나뿐이라 워시를 칠할 상자가 없다 — 테마가 칠할 수 있는 것은 루트와 조각뿐이고 의사 요소로 흉내 내면 캔버스의 외곽선 ·
 * 마커가 재는 상자와 그림이 갈린다.
 *
 * `inner` 의 가운데 두기는 이 테마의 `theme.css` 가 한다 — SDK 기본 CSS 의 `margin-inline: auto` 는 `contained` 에만 걸린다.
 */
export const SectionView = view(({ props, children }) => (
  <Root as="section" data-wb-structure="splitBg" className={props.compact === true ? SECTION_COMPACT_CLASS : undefined}>
    <div data-wb-part="band" aria-hidden="true" />
    <div data-wb-part="inner">{children}</div>
  </Root>
))
