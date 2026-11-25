export type { WbAttrs, WbHandlers } from './attrs'
export { activeStates } from './attrs'

// **상호작용 런타임**(설계서 「상호작용」의 「실행」). `RenderOptions.interaction`으로 켜고, 상태는 호출자가
// 든다 — 근거는 `interaction/runtime.ts`의 머리말에 있다.
export type { InteractionIssue, InteractionOverlay, InteractionRequest, InteractionResult } from './interaction/runtime'
export { EMPTY_OVERLAY, hiddenByOverlay, overlayProps, runInteraction, VISIBLE_KEY } from './interaction/runtime'

export { FallbackNode } from './fallback'

export type { InteractionEvent, InteractionOptions, NodeRenderError, RenderOptions, RevealTarget, WeightRoom } from './render'
export { renderDocument, renderNode, weightRoom } from './render'

// **덮개 층**(설계서 「상호작용」의 「실행」 — 뷰 모드 · 번들의 «팝업 열기»). 열린 목록은 부른 쪽이 `usePopupStack` 으로 든다.
export type { OpenPopup, PopupArea, PopupLayerProps, PopupStack } from './popup-layer'
export {
  isPopupClose,
  isPopupDocument,
  NO_OPEN_POPUP,
  NO_OPEN_POPUP_DIRECT,
  POPUP_DEPTH_MAX,
  POPUP_DEPTH_NOTICE,
  PopupLayer,
  popupOpener,
  usePopupStack,
} from './popup-layer'

// **레이아웃 틀**(설계 `docs/superpowers/specs/2026-11-25-page-layout-design.md` 「테마 계약」) — 그린 문서를 테마의 레이아웃 뷰로 감싼다.
export type { LayoutFrameProps } from './layout-frame'
export { LayoutFrame, layoutRegions } from './layout-frame'

export { resolveVariant } from './variant'

export { NO_THEME } from './no-theme'

export { unusedViewKeys } from './view-keys'

export type { Point } from './marker'
export { focusElement, markerPoint } from './marker'
