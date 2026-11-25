/**
 * **SDK 기본 레이아웃 뷰** — 셋 다 내용(`children`)만 그린다(영역 없음). 레이아웃 뷰를 안 낸 테마 · 앞 판 테마는 세 레이아웃이 같은 화면이다 —
 * 팝업은 뿌리 `Popup` 이 상자를 그리고, 막 · 가운데 세우기는 아래 CSS(호스트의 틀)가 한다.
 */
import type { LayoutView, PageLayout } from '../types'
import { zeroRule } from '../css-tools'

const ContentOnly: LayoutView = (props) => <>{props.children}</>

export const DEFAULT_LAYOUT_VIEWS: Readonly<Record<PageLayout, LayoutView>> = Object.freeze({
  blank: ContentOnly,
  popup: ContentOnly,
  subpage: ContentOnly,
})

/** 팝업 레이아웃의 막 바깥 여백 — 상자가 그보다 넓으면 뷰포트 − 2 × 이 값까지 준다(`Popup` 의 `max-width: 100%`). */
const POPUP_GAP = '24px'

export function layoutCssBlocks(): string[] {
  return [
    // 렌더러의 `LayoutFrame` 이 문서 뿌리를 감싼 상자 — 테마 CSS 의 배치에 끼지 않는다(그 안의 뿌리가 틀의 직계처럼 선다).
    zeroRule('[data-wb-layout-content]', ['display: contents;']),
    // 팝업 레이아웃 — 뷰포트 폭 전체에 흐린 막을 깔고 상자를 가운데 위에 제 크기로 세운다. 막은 틀이다(노드가 아니다). 덮개 층(`PopupLayer`)은
    // 이 틀 없이 상자만 쌓는다(덮개가 이미 막이다). 찍는 판(PPTX)은 막 없이 상자만이다(`../capture.ts`).
    zeroRule('[data-wb-layout="popup"]', [
      'display: flex;',
      'justify-content: center;',
      'align-items: flex-start;',
      'box-sizing: border-box;',
      `padding: ${POPUP_GAP};`,
      'background: var(--wb-popup-backdrop, rgba(0, 0, 0, 0.45));',
    ]),
  ]
}
