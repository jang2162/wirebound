import { Root, view } from '@wirebound/theme-sdk'

/**
 * **배경이 갈린 섹션(옛 구조 `splitBg`)** — 전체 폭에 깔린 워시(`band`) 위에 가운데 모인 내용(`inner`). 기본 뷰(`contained`)는
 * `inner` 하나뿐이라 워시를 칠할 상자가 없다 — 테마가 칠할 수 있는 것은 루트와 조각뿐이고 의사 요소로 흉내 내면 캔버스의 외곽선 ·
 * 마커가 재는 상자와 그림이 갈린다.
 *
 * `inner` 의 가운데 두기는 이 테마의 `theme.css` 가 한다 — SDK 기본 CSS 의 `margin-inline: auto` 는 `contained` 에만 걸린다. 좁은 여백
 * (`compact`)은 `Root` 가 싣는 `data-wb-compact` 를 `theme.css` 가 읽는다.
 */
export const SectionView = view(({ children }) => (
  <Root as="section" data-wb-structure="splitBg">
    <div data-wb-part="band" aria-hidden="true" />
    <div data-wb-part="inner">{children}</div>
  </Root>
))
